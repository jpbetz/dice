#!/usr/bin/env node
/*
Copyright 2026 The Dice Table Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
// Dice Table multiplayer server.
//
// Zero dependencies: node:http, node:crypto, node:fs, node:path only.
// Serves the static app AND the room API from the same origin so the client
// can talk to it with plain relative fetch/EventSource calls.
//
// All state is in memory. Rooms are created on first join and deleted when the
// last player leaves. The server is the sole authority on rolled values: a
// client never displays a locally generated value while online.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeRoll, validateMods, DIE_MAX } from './js/rollspec.js';

const PORT = Number(process.env.PORT) || 8123;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MAX_BODY = 64 * 1024;       // reject bodies larger than this
const MAX_DICE = 40;
const MAX_LABEL = 40;
const MAX_NAME = 24;
const MAX_ROOM = 64;
const LOG_CAP = 200;              // rolls kept per room
const MAX_ROOMS = 500;            // live rooms across the server
const MAX_PLAYERS_PER_ROOM = 40;
const MAX_STREAMS_PER_PLAYER = 4; // extra SSE streams evict the oldest
const OFFER_CAP = 20;             // offered rolls kept per room
const HEARTBEAT_MS = 20_000;
const DISCONNECT_GRACE_MS = 5_000;   // survive an EventSource reconnect
const JOIN_GRACE_MS = 60_000;        // time to open the SSE stream after join

// Eight distinct hues, handed out round-robin per room.
const PALETTE = [
  '#e2574c', '#e08a2e', '#d9c534', '#5fbe55',
  '#38b2a3', '#4a8ede', '#8d6ae0', '#dd5c9e',
];

// Die values come from rollspec's composeRoll, driven by a crypto-strong rng:
// 48 random bits per draw, mapped to [0,1). Same generation strength as the
// old per-die crypto.randomInt rollers.
const rng = () => crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
const DIE_TYPES = Object.keys(DIE_MAX);

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/**
 * room = {
 *   name, colorCursor,
 *   players: Map<playerId, {id, name, color, clients:Set<ServerResponse>, reapTimer}>,
 *   log: [roll]
 * }
 */
const rooms = new Map();

function getRoom(name) {
  let room = rooms.get(name);
  if (!room) {
    room = { name, colorCursor: 0, players: new Map(), log: [] };
    rooms.set(name, room);
    log(`room created: ${name}`);
  }
  return room;
}

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color }));
}

function dropRoomIfEmpty(room) {
  if (room.players.size === 0 && rooms.get(room.name) === room) {
    rooms.delete(room.name);
    log(`room deleted: ${room.name}`);
  }
}

function removePlayer(room, player, why) {
  if (room.players.get(player.id) !== player) return;
  clearTimeout(player.reapTimer);
  room.players.delete(player.id);
  for (const res of player.clients) endStream(res);
  player.clients.clear();
  log(`left    room=${room.name} name=${player.name} (${why})`);
  broadcast(room, 'player-left', { playerId: player.id });
  dropRoomIfEmpty(room);
}

function scheduleReap(room, player, delay) {
  clearTimeout(player.reapTimer);
  player.reapTimer = setTimeout(() => {
    if (player.clients.size === 0) removePlayer(room, player, 'disconnected');
  }, delay);
  // Do not hold the event loop open just for a reap timer.
  if (player.reapTimer.unref) player.reapTimer.unref();
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

function sendEvent(res, type, data) {
  // A dead socket must never take the process down.
  try {
    if (res.writableEnded || res.destroyed) return false;
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    endStream(res);
    return false;
  }
}

function endStream(res) {
  try { res.end(); } catch { /* already gone */ }
}

function broadcast(room, type, data) {
  for (const player of room.players.values()) {
    for (const res of [...player.clients]) {
      if (!sendEvent(res, type, data)) player.clients.delete(res);
    }
  }
}

const heartbeat = setInterval(() => {
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      for (const res of [...player.clients]) {
        try {
          if (res.writableEnded || res.destroyed) throw new Error('dead');
          res.write(': ping\n\n');
        } catch {
          player.clients.delete(res);
          endStream(res);
        }
      }
    }
  }
}, HEARTBEAT_MS);
if (heartbeat.unref) heartbeat.unref();

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`[dice ${new Date().toISOString()}] ${msg}\n`);
}

function sendJson(res, status, payload, { close = false } = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  };
  if (close) headers.Connection = 'close';
  try {
    res.writeHead(status, headers);
    res.end(body, () => {
      // Stop reading a rejected (oversized) upload once the client has the reply.
      if (close && res.socket && !res.socket.destroyed) res.socket.end();
    });
  } catch { endStream(res); }
}

function sendError(res, status, message, code, opts) {
  sendJson(res, status, { error: message, code: code || 'error' }, opts);
}

// Read a JSON body, refusing anything over MAX_BODY. Oversized uploads are
// answered with 400 (and the connection closed) rather than reset, so the
// client sees a real status code.
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    let overflowed = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const tooLarge = () => {
      overflowed = true;
      chunks.length = 0;
      finish({ ok: false, reason: 'body too large', close: true });
    };

    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY) tooLarge();

    req.on('data', (chunk) => {
      if (overflowed) return;      // discard the rest, don't buffer it
      size += chunk.length;
      if (size > MAX_BODY) { tooLarge(); return; }
      chunks.push(chunk);
    });
    req.on('aborted', () => finish({ ok: false, reason: 'aborted' }));
    req.on('error', () => finish({ ok: false, reason: 'read error' }));
    req.on('end', () => {
      if (overflowed) return;
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) { finish({ ok: true, value: {} }); return; }
      try {
        const value = JSON.parse(text);
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          finish({ ok: false, reason: 'body must be a JSON object' });
        } else {
          finish({ ok: true, value });
        }
      } catch {
        finish({ ok: false, reason: 'malformed JSON' });
      }
    });
  });
}

function cleanString(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

async function handleJoin(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const roomName = cleanString(body.value.room, MAX_ROOM);
  const name = cleanString(body.value.name, MAX_NAME);
  if (!roomName) return sendError(res, 400, 'room is required', 'bad_room');
  if (!name) return sendError(res, 400, 'name is required', 'bad_name');

  // Entity caps: an unauthenticated client must not be able to allocate
  // unbounded rooms/players.
  if (!rooms.has(roomName) && rooms.size >= MAX_ROOMS) {
    return sendError(res, 503, 'too many rooms', 'server_full');
  }
  const existing = rooms.get(roomName);
  if (existing && existing.players.size >= MAX_PLAYERS_PER_ROOM) {
    return sendError(res, 503, 'room is full', 'room_full');
  }

  const room = getRoom(roomName);
  const player = {
    id: crypto.randomUUID(),
    name,
    color: PALETTE[room.colorCursor % PALETTE.length],
    clients: new Set(),
    reapTimer: null,
  };
  room.colorCursor++;
  room.players.set(player.id, player);
  // If the client never opens an event stream, forget it again eventually.
  scheduleReap(room, player, JOIN_GRACE_MS);

  log(`join    room=${roomName} name=${name} color=${player.color} players=${room.players.size}`);
  broadcast(room, 'player-joined', { player: { id: player.id, name: player.name, color: player.color } });

  sendJson(res, 200, {
    playerId: player.id,
    color: player.color,
    players: publicPlayers(room),
    log: room.log,
  });
}

function handleEvents(req, res, url) {
  const roomName = cleanString(url.searchParams.get('room'), MAX_ROOM);
  const playerId = cleanString(url.searchParams.get('playerId'), 64);
  if (!roomName || !playerId) return sendError(res, 400, 'room and playerId are required', 'bad_request');

  const room = rooms.get(roomName);
  const player = room && room.players.get(playerId);
  // Unknown player (e.g. the server restarted): the client re-joins and retries.
  if (!player) return sendError(res, 404, 'unknown player', 'unknown_player');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // retry hint for the browser's native EventSource reconnect
  try { res.write('retry: 2000\n\n'); } catch { return; }

  if (res.socket) {
    res.socket.setNoDelay(true);
    res.socket.setKeepAlive(true);
  }

  // Cap streams per player: evict the oldest rather than reject, so a
  // reconnect race never locks a real client out.
  while (player.clients.size >= MAX_STREAMS_PER_PLAYER) {
    const oldest = player.clients.values().next().value;
    player.clients.delete(oldest);
    endStream(oldest);
  }
  player.clients.add(res);
  clearTimeout(player.reapTimer);

  sendEvent(res, 'hello', { players: publicPlayers(room), log: room.log });

  const onClose = () => {
    player.clients.delete(res);
    if (player.clients.size === 0 && room.players.get(playerId) === player) {
      scheduleReap(room, player, DISCONNECT_GRACE_MS);
    }
  };
  res.on('close', onClose);
  res.on('error', onClose);
  req.on('error', onClose);
}

function lookup(body) {
  const roomName = cleanString(body.room, MAX_ROOM);
  const playerId = cleanString(body.playerId, 64);
  if (!roomName || !playerId) return { error: [400, 'room and playerId are required', 'bad_request'] };
  const room = rooms.get(roomName);
  if (!room) return { error: [404, 'unknown room', 'unknown_room'] };
  const player = room.players.get(playerId);
  if (!player) return { error: [404, 'unknown player', 'unknown_player'] };
  return { room, player };
}

async function handleRoll(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const dice = body.value.dice;
  if (!Array.isArray(dice) || dice.length < 1 || dice.length > MAX_DICE) {
    return sendError(res, 400, `dice must be an array of 1..${MAX_DICE} die types`, 'bad_dice');
  }
  for (const type of dice) {
    // Own-property check: without it, Object.prototype names (toString,
    // __proto__, ...) pass the allowlist and get invoked as roll functions.
    if (typeof type !== 'string' || !Object.hasOwn(DIE_ROLLERS, type)) {
      return sendError(res, 400, `unknown die type: ${String(type).slice(0, 20)}`, 'bad_die_type');
    }
  }

  const rawLabel = typeof body.value.label === 'string' ? body.value.label.trim() : '';
  const label = rawLabel.slice(0, MAX_LABEL);

  const roll = {
    rollId: crypto.randomUUID(),
    playerId: player.id,
    playerName: player.name,
    color: player.color,
    label,
    dice: [...dice],
    values: dice.map((type) => DIE_ROLLERS[type]()),
    seed: crypto.randomInt(0, 2 ** 32),
    t: Date.now(),
  };

  room.log.push(roll);
  if (room.log.length > LOG_CAP) room.log = room.log.slice(-LOG_CAP);

  log(`roll    room=${room.name} name=${player.name} dice=${roll.dice.join(',')} values=${roll.values.join(',')}`);
  broadcast(room, 'roll', roll);
  sendJson(res, 200, { roll });
}

async function handleClear(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  log(`clear   room=${room.name} name=${player.name}`);
  broadcast(room, 'clear', { playerId: player.id, playerName: player.name });
  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

// Resolve a URL path to a file inside ROOT, or null if it escapes.
function safeResolve(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0')) return null;
  if (decoded === '/' || decoded === '') decoded = '/index.html';
  const segments = decoded.split('/').filter(Boolean);
  // no traversal, no dotfiles (keeps .git/.claude private)
  if (segments.some((s) => s === '..' || s.startsWith('.'))) return null;
  const full = path.resolve(ROOT, ...segments);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendError(res, 405, 'method not allowed', 'method_not_allowed');
  }
  const file = safeResolve(url.pathname);
  if (!file) return sendError(res, 403, 'forbidden', 'forbidden');

  let stat;
  try {
    stat = await fsp.stat(file);
    if (stat.isDirectory()) {
      const index = path.join(file, 'index.html');
      stat = await fsp.stat(index);
      return streamFile(req, res, index, stat);
    }
  } catch {
    return sendError(res, 404, 'not found', 'not_found');
  }
  return streamFile(req, res, file, stat);
}

function streamFile(req, res, file, stat) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => { endStream(res); });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendError(res, 400, 'bad request line', 'bad_request');
  }

  const route = url.pathname;
  const handle = async () => {
    if (route === '/api/join' && req.method === 'POST') return handleJoin(req, res);
    if (route === '/api/events' && req.method === 'GET') return handleEvents(req, res, url);
    if (route === '/api/roll' && req.method === 'POST') return handleRoll(req, res);
    if (route === '/api/clear' && req.method === 'POST') return handleClear(req, res);
    if (route.startsWith('/api/')) return sendError(res, 404, 'no such endpoint', 'not_found');
    return serveStatic(req, res, url);
  };

  handle().catch((err) => {
    log(`error   ${route}: ${err && err.message}`);
    if (!res.headersSent) sendError(res, 500, 'internal error', 'internal');
    else endStream(res);
  });
});

// Never let a client socket error kill the process.
server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  else socket.destroy();
});
server.on('error', (err) => {
  log(`server error: ${err.message}`);
  process.exitCode = 1;
});
process.on('uncaughtException', (err) => {
  log(`uncaught: ${err && err.stack ? err.stack : err}`);
});

// Slowloris protection. These only bound receiving the request (headers /
// body); verified on Node 24 that an open SSE *response* is unaffected once
// the GET request has been fully received.
server.headersTimeout = 30_000;
server.requestTimeout = 300_000;
server.keepAliveTimeout = 72_000;

server.listen(PORT, () => {
  log(`dice table listening on http://localhost:${PORT}  (root ${ROOT})`);
});

function shutdown(signal) {
  log(`${signal} — shutting down`);
  clearInterval(heartbeat);
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      clearTimeout(player.reapTimer);
      for (const res of player.clients) endStream(res);
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { server, DIE_TYPES, PALETTE };
