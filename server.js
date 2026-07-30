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
import { parseNotation } from './js/notation.js';

const PORT = Number(process.env.PORT) || 8123;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MAX_BODY = 64 * 1024;       // reject bodies larger than this
const MAX_DICE = 40;
// A roll label carries the notation's '# comment' text when present, so this
// cap must match js/notation.js MAX_COMMENT (64) — a smaller cap here would
// silently truncate online what solo mode keeps in full.
const MAX_LABEL = 64;
// An experience subtitle is the small line under the title on the roll card
// (docs/UX.md §2.1); it is a headline, not prose.
const MAX_SUBTITLE = 40;
const MAX_EXPERIENCES = 12;       // custom experience templates per room
const MAX_DC = 999;
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

// Strip control characters plus the zero-width and bidi-control ranges
// (U+200B–200F, U+202A–202E, U+2066–2069, U+FEFF): invisible in rendered text,
// and the bidi overrides can visually spoof what other players see. Deliberate
// copy of js/notation.js's stripCtl, which keeps it module-private (and which
// js/rollspec.js inlines for the same reason) — the three must stay identical.
const stripCtl = (t) => t.replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');

// Truncate user text to at most `max` UTF-16 units the way js/notation.js cuts
// a comment (trim \u2192 slice \u2192 trim, so a cut landing on a space cannot leave
// trailing whitespace), with one extra guard notation.js's own cut lacks: a
// slice ending inside a surrogate pair would strand its high half, and that
// lone surrogate renders as U+FFFD everywhere the text is shown \u2014 drop it
// before the final trim. Callers pass already-stripCtl'd text.
function cutText(text, max) {
  let cut = text.trim().slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // unpaired high surrogate
  return cut.trim();
}

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

// Room-wide settings (docs/ROADMAP.md §2, docs/UX.md §7.3). A flat object whose
// keys are validated against this table: every key a client may write has a
// row, and nothing else in the settings path knows what a felt is.
//
// A row declares exactly one checker, and either must refuse anything it would
// not want broadcast verbatim — what it passes goes straight back out on the
// wire to every client in the room:
//   validate(v)  -> boolean        the value is stored exactly as sent
//   normalize(v) -> value | null   the value is stored as RETURNED; null rejects
// normalize is for settings with an interior: the experience templates' text
// needs the same capping and control-char stripping a roll label gets, and a
// boolean checker has no way to hand the cleaned value back.
const FELT_THEMES = ['emerald', 'crimson', 'midnight', 'slate', 'walnut'];

// A custom experience template, per the record shape in docs/UX.md §2.1. The
// three launch experiences (Plain/Check/Cinematic) are built into the client
// and are NOT stored here — this setting carries a room's user-authored
// templates only, so the built-in ids are reserved.
//
// An id is a room-wide name clients will hand to lookups and markup, so the
// charset is tight on purpose.
const EXP_BUILTIN_IDS = ['plain', 'check', 'cinematic'];
const EXP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const EXP_READOUTS = ['verdict', 'chart'];

// One row per field of the §2.1 record; a field not named here is rejected
// rather than passed through, so a template can never smuggle a payload of its
// own to every client at the table.
//
// Each enum lists the value(s) §2.1 documents plus the direct complement the
// field needs to mean anything ('none' where §2.2's table shows "—" for
// Plain). They start narrow deliberately: widening an allowlist later is
// backward compatible and tightening one is not, and a value nobody has
// designed a rendering for is a value the card cannot honour anyway.
const EXP_FIELDS = {
  name:      { kind: 'text', max: 32, required: true },
  eyebrow:   { kind: 'text', max: 32, fallback: '' },
  titleFrom: { kind: 'enum', values: ['attachment'], fallback: 'attachment' },
  target:    { kind: 'enum', values: ['none', 'optional', 'required'], fallback: 'optional' },
  motion:    { kind: 'enum', values: ['ceremonial', 'brisk', 'instant'], fallback: 'ceremonial' },
  frame:     { kind: 'enum', values: ['ornate', 'plain'], fallback: 'ornate' },
  matText:   { kind: 'enum', values: ['template', 'none'], fallback: 'template' },
  showOdds:  { kind: 'bool', fallback: false },
  readouts:  { kind: 'readouts', fallback: ['verdict', 'chart'] },
};

// One field of one record: the cleaned value, or null to reject. No legal
// value is null, so null is unambiguous as the rejection sentinel ('' and
// false are both legal and both survive it).
//
// Text is capped and stripped the way a roll label is — truncated, not
// refused — and an omitted optional field comes back as its documented
// fallback, so what a room stores is always a complete record.
function cleanExpField(spec, value) {
  if (value === undefined || value === null) {
    if (spec.required) return null;
    return Array.isArray(spec.fallback) ? [...spec.fallback] : spec.fallback;
  }
  switch (spec.kind) {
    case 'text': {
      if (typeof value !== 'string') return null;
      // trim → cut → trim (surrogate-safe), as a roll label is cut.
      const text = cutText(stripCtl(value), spec.max);
      return spec.required && !text ? null : text;
    }
    case 'enum':
      return spec.values.includes(value) ? value : null;
    case 'bool':
      return typeof value === 'boolean' ? value : null;
    case 'readouts': {
      // Order is prominence (§2.1) so it is preserved as sent, and an
      // experience may drop either readout (§2.5) so a short list is legal.
      if (!Array.isArray(value) || value.length > EXP_READOUTS.length) return null;
      const seen = new Set();
      for (const readout of value) {
        if (!EXP_READOUTS.includes(readout) || seen.has(readout)) return null;
        seen.add(readout);
      }
      return [...value];
    }
    default:
      return null;
  }
}

// The `experiences` setting: a room's whole set of custom templates. Returns
// the cleaned array that will be stored and broadcast, or null to reject the
// write outright. Rejecting rather than dropping bad records is deliberate —
// this key is written as a SET, and quietly storing eleven of the twelve
// templates a client sent would read as data loss.
function normalizeExperiences(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_EXPERIENCES) return null;

  const out = [];
  const seen = new Set();
  for (const rec of raw) {
    if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) return null;
    // Own-key sweep: an unknown field means a client believes it is sending
    // something we honour, and JSON.parse makes a real own '__proto__' key,
    // which this refuses along with everything else off the allowlist.
    for (const key of Object.keys(rec)) {
      if (key !== 'id' && !Object.hasOwn(EXP_FIELDS, key)) return null;
    }

    const id = typeof rec.id === 'string' ? stripCtl(rec.id).trim() : '';
    const key = id.toLowerCase(); // ids collide case-insensitively
    if (!EXP_ID_RE.test(id) || EXP_BUILTIN_IDS.includes(key) || seen.has(key)) return null;
    seen.add(key);

    const clean = { id };
    for (const field of Object.keys(EXP_FIELDS)) {
      const sent = Object.hasOwn(rec, field) ? rec[field] : undefined;
      const value = cleanExpField(EXP_FIELDS[field], sent);
      if (value === null) return null;
      clean[field] = value;
    }
    out.push(clean);
  }
  return out;
}

const SETTING_SPECS = {
  felt: {
    default: 'emerald',
    validate: (v) => typeof v === 'string' && FELT_THEMES.includes(v),
  },
  // Room-wide custom experience templates — docs/UX.md §7.3, Joe's call that
  // these sync with the table rather than living in one player's
  // localStorage. Empty until a client ships the editor; the three built-ins
  // need no row here, they ship with the client.
  experiences: {
    default: [],
    normalize: normalizeExperiences,
  },
};

function defaultSettings() {
  const out = {};
  for (const key of Object.keys(SETTING_SPECS)) {
    const value = SETTING_SPECS[key].default;
    // Clone container defaults: rooms must never share one mutable object.
    out[key] = value !== null && typeof value === 'object' ? structuredClone(value) : value;
  }
  return out;
}

/**
 * room = {
 *   name, colorCursor,
 *   players: Map<playerId, {id, name, color, clients:Set<ServerResponse>, reapTimer}>,
 *   log: [roll],
 *   offers: [offer],
 *   settings: {felt, ...}   // room-wide, see SETTING_SPECS
 * }
 */
const rooms = new Map();

function getRoom(name) {
  let room = rooms.get(name);
  if (!room) {
    room = {
      name,
      colorCursor: 0,
      players: new Map(),
      log: [],
      offers: [],
      settings: defaultSettings(),
    };
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

// opts.extra adds fields to the error body (e.g. the notation parser's hint);
// the rest of opts goes to sendJson.
function sendError(res, status, message, code, opts) {
  const { extra, ...rest } = opts || {};
  sendJson(res, status, { error: message, code: code || 'error', ...extra }, rest);
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
    settings: { ...room.settings },
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

  sendEvent(res, 'hello', {
    players: publicPlayers(room),
    log: room.log,
    offers: room.offers,
    settings: { ...room.settings },
  });

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

// Die list check, shared by the explicit-dice and notation paths.
function checkDice(dice) {
  if (!Array.isArray(dice) || dice.length < 1 || dice.length > MAX_DICE) {
    return [400, `dice must be an array of 1..${MAX_DICE} die types`, 'bad_dice'];
  }
  for (const type of dice) {
    // Own-property check: without it, Object.prototype names (toString,
    // __proto__, ...) pass the allowlist and get treated as die types.
    if (typeof type !== 'string' || !Object.hasOwn(DIE_MAX, type)) {
      return [400, `unknown die type: ${String(type).slice(0, 20)}`, 'bad_die_type'];
    }
  }
  return null;
}

// Optional difficulty class. Absent (or null, so a client can always send the
// field) means "no DC"; anything else must be an integer 1..MAX_DC.
function readDc(raw) {
  if (raw === undefined || raw === null) return { dc: null };
  if (!Number.isInteger(raw) || raw < 1 || raw > MAX_DC) {
    return { error: [400, `dc must be an integer from 1 to ${MAX_DC}`, 'bad_dc'] };
  }
  return { dc: raw };
}

// Optional roll experience — the "moment" a roll is dressed in (docs/UX.md
// §2). The wire form is deliberately narrow: the KIND, plus the one string the
// card needs that nothing else on the request already carries. The title is
// the roll's existing label ('# comment' or group name) and the Target is the
// existing dc, so neither is repeated here.
//
// 'plain' is not a kind. A Plain roll simply omits exp, which is what keeps an
// undressed roll byte-identical to what the server sent before this field
// existed. Absent — or null, so a client can always send the field — is Plain.
const EXP_KINDS = ['check', 'cinematic'];

function readExp(raw) {
  if (raw === undefined || raw === null) return { exp: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: [400, 'exp must be an object', 'bad_exp'] };
  }
  // Sweep own enumerable keys rather than picking the two out: an unknown
  // field is a client that thinks it is sending something we would honour, and
  // JSON.parse creates a real own '__proto__' key, which this catches too.
  for (const key of Object.keys(raw)) {
    if (key !== 'kind' && key !== 'subtitle') {
      return { error: [400, `unknown exp field: ${key.slice(0, 32)}`, 'bad_exp'] };
    }
  }
  if (!EXP_KINDS.includes(raw.kind)) {
    return { error: [400, `exp.kind must be one of: ${EXP_KINDS.join(', ')}`, 'bad_exp'] };
  }

  const exp = { kind: raw.kind };
  if (raw.subtitle !== undefined && raw.subtitle !== null) {
    if (typeof raw.subtitle !== 'string') {
      return { error: [400, 'exp.subtitle must be a string', 'bad_exp'] };
    }
    // Invisible characters are stripped exactly as a label's are, and the
    // length cap is measured AFTER stripping — on what actually renders — so
    // pasted RTL text is never refused over marks the author cannot see.
    const subtitle = stripCtl(raw.subtitle).trim();
    if (subtitle.length > MAX_SUBTITLE) {
      return { error: [400, `exp.subtitle must be at most ${MAX_SUBTITLE} characters`, 'bad_exp'] };
    }
    // An empty subtitle is an absent one; never store or broadcast ''.
    if (subtitle) exp.subtitle = subtitle;
  }
  return { exp };
}

// Roll spec from a notation string. The server re-parses the text and ITS
// result is authoritative — a client's own parse is preview only.
function parseNotationSpec(value) {
  // An explicit pool cannot be reconciled with a parsed one, so refuse the
  // request rather than silently picking a winner.
  if (value.dice !== undefined || value.mods !== undefined) {
    return { error: [400, 'notation cannot be combined with dice or mods', 'notation_conflict'] };
  }

  const parsed = parseNotation(value.notation);
  if (!parsed.ok) {
    return { error: [400, parsed.error, 'bad_notation', { extra: { hint: parsed.hint || null } }] };
  }

  // dc and faceDown come from the notation too (faceDown is true for the
  // /gmroll, /gmr, /selfroll and /sr prefixes — interim until the visibility
  // slice). A value sent alongside is ignored when it agrees and refused when
  // it does not (a disagreement means the client's parse drifted from ours).
  if (value.dc !== undefined && value.dc !== null && value.dc !== parsed.dc) {
    return { error: [400, 'dc disagrees with the notation', 'notation_conflict'] };
  }
  if (value.faceDown !== undefined && value.faceDown !== parsed.faceDown) {
    return { error: [400, 'faceDown disagrees with the notation', 'notation_conflict'] };
  }

  const dice = parsed.spec.dice;
  const diceErr = checkDice(dice);
  if (diceErr) return { error: diceErr };

  const mods = parsed.spec.mods === undefined ? null : parsed.spec.mods;
  const modsErr = validateMods(dice, mods);
  if (modsErr) return { error: [400, `invalid mods: ${modsErr}`, modsErr] };

  // The '# comment' text is the label unless the request names one explicitly.
  // An explicit label skips notation parsing, so it needs its own stripCtl —
  // the comment fallback already got one inside parseNotation.
  const rawLabel = typeof value.label === 'string' ? stripCtl(value.label) : (parsed.comment || '');
  return {
    dice: [...dice],
    mods,
    dc: parsed.dc,
    faceDown: parsed.faceDown === true,
    label: cutText(rawLabel, MAX_LABEL),
  };
}

// Validate the roll-shaped part of a request body. Shared by /api/roll and
// /api/offer so an offer can only hold specs a roll would accept. Returns
// {error: [...]} or a normalized spec.
//
// Two accepted shapes, both with optional dc / faceDown / label / exp:
//   {dice, mods}       — explicit pool (the original wire form)
//   {notation: string} — re-parsed here by js/notation.js
//
// exp is read once, out here, because it rides ALONGSIDE either shape the way
// label does — an experience dresses a roll up, it never describes the pool.
function parseRollSpec(value) {
  const exp = readExp(value.exp);
  if (exp.error) return { error: exp.error };

  const spec = value.notation !== undefined ? parseNotationSpec(value) : parseExplicitSpec(value);
  if (spec.error) return spec;
  if (exp.exp) spec.exp = exp.exp; // absent on Plain rolls, not null — see readExp
  return spec;
}

function parseExplicitSpec(value) {
  const dice = value.dice;
  const diceErr = checkDice(dice);
  if (diceErr) return { error: diceErr };

  // rollspec's validateMods is the single authority on mod specs; unknown
  // keys are its call, not ours.
  const mods = value.mods === undefined ? null : value.mods;
  const modsErr = validateMods(dice, mods);
  if (modsErr) return { error: [400, `invalid mods: ${modsErr}`, modsErr] };

  if (value.faceDown !== undefined && typeof value.faceDown !== 'boolean') {
    return { error: [400, 'faceDown must be a boolean', 'bad_face_down'] };
  }

  const dc = readDc(value.dc);
  if (dc.error) return { error: dc.error };

  const label = cutText(typeof value.label === 'string' ? stripCtl(value.label) : '', MAX_LABEL);

  return { dice: [...dice], mods, dc: dc.dc, faceDown: value.faceDown === true, label };
}

// Compose, log, and broadcast a roll for a player from a validated spec.
// Shared by /api/roll and /api/claim so both take the exact same path.
function executeRoll(room, player, spec) {
  const composed = composeRoll(spec.dice, spec.mods, rng);

  const roll = {
    rollId: crypto.randomUUID(),
    playerId: player.id,
    playerName: player.name,
    color: player.color,
    label: spec.label,
    dc: spec.dc === undefined ? null : spec.dc,
    dice: composed.dice,       // expanded physical dice; parallel with
    values: composed.values,   // values and perDie
    perDie: composed.perDie,
    modifier: composed.modifier,
    total: composed.total,
    spec: { dice: [...spec.dice], mods: spec.mods }, // original request, for reroll-last
    faceDown: spec.faceDown,
    revealed: !spec.faceDown,
    seed: crypto.randomInt(0, 2 ** 32),
    t: Date.now(),
  };
  // Only a dressed-up roll carries the field at all, so a Plain roll's payload
  // — broadcast, response and log entry alike — stays byte-for-byte what it
  // was before experiences existed. It also rides on `spec`, because spec IS
  // the original request and reroll-last replays it: a re-rolled Check must
  // come back a Check.
  if (spec.exp) {
    roll.exp = spec.exp;
    roll.spec.exp = spec.exp;
  }

  room.log.push(roll);
  if (room.log.length > LOG_CAP) room.log = room.log.slice(-LOG_CAP);

  log(`roll    room=${room.name} name=${player.name} dice=${roll.dice.join(',')} values=${roll.values.join(',')} total=${roll.total}${roll.dc ? ` dc=${roll.dc}` : ''}${roll.faceDown ? ' faceDown' : ''}${roll.exp ? ` exp=${roll.exp.kind}` : ''}`);
  broadcast(room, 'roll', roll);
  return roll;
}

async function handleRoll(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const spec = parseRollSpec(body.value);
  if (spec.error) return sendError(res, ...spec.error);

  const roll = executeRoll(room, player, spec);
  sendJson(res, 200, { roll });
}

async function handleReveal(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const rollId = cleanString(body.value.rollId, 64);
  if (!rollId) return sendError(res, 400, 'rollId is required', 'bad_request');

  const roll = room.log.find((r) => r.rollId === rollId);
  if (!roll) return sendError(res, 404, 'unknown roll', 'unknown_roll');
  if (roll.playerId !== player.id) return sendError(res, 403, 'only the roller may reveal', 'forbidden');
  if (roll.revealed) return sendJson(res, 200, { ok: true }); // idempotent

  roll.revealed = true;
  log(`reveal  room=${room.name} name=${player.name} rollId=${rollId} total=${roll.total}`);
  broadcast(room, 'reveal', { rollId });
  sendJson(res, 200, { ok: true });
}

async function handleRename(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const name = cleanString(body.value.name, MAX_NAME);
  if (!name) return sendError(res, 400, 'name is required', 'bad_name');

  const oldName = player.name;
  player.name = name;
  // Past log entries keep the name they were rolled under.
  log(`rename  room=${room.name} name=${oldName} -> ${name}`);
  broadcast(room, 'player-renamed', { playerId: player.id, name });
  sendJson(res, 200, { ok: true });
}

async function handleOffer(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const spec = parseRollSpec(body.value);
  if (spec.error) return sendError(res, ...spec.error);

  const offer = {
    offerId: crypto.randomUUID(),
    byId: player.id,
    byName: player.name,
    color: player.color,
    label: spec.label,
    dc: spec.dc === undefined ? null : spec.dc,
    dice: spec.dice,
    mods: spec.mods,
    faceDown: spec.faceDown,
    t: Date.now(),
  };
  // Same rule as a roll's: present only when the offer is dressed up, so an
  // offer card an older client wrote is indistinguishable from one it reads.
  if (spec.exp) offer.exp = spec.exp;
  room.offers.push(offer);
  if (room.offers.length > OFFER_CAP) room.offers = room.offers.slice(-OFFER_CAP);

  log(`offer   room=${room.name} name=${player.name} dice=${offer.dice.join(',')}${offer.dc ? ` dc=${offer.dc}` : ''} offers=${room.offers.length}`);
  broadcast(room, 'offer', { offer });
  sendJson(res, 200, { offer });
}

async function handleClaim(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const offerId = cleanString(body.value.offerId, 64);
  if (!offerId) return sendError(res, 400, 'offerId is required', 'bad_request');

  const idx = room.offers.findIndex((o) => o.offerId === offerId);
  // Losing the claim race lands here too; 404 is the expected answer.
  if (idx < 0) return sendError(res, 404, 'unknown offer', 'unknown_offer');
  const [offer] = room.offers.splice(idx, 1);

  log(`claim   room=${room.name} name=${player.name} offerId=${offerId} by=${offer.byName}`);
  broadcast(room, 'offer-claimed', { offerId });

  // The claimed roll inherits the offer's moment: whoever picks the card up
  // gets the moment its author staged.
  const roll = executeRoll(room, player, {
    dice: offer.dice,
    mods: offer.mods,
    label: offer.label,
    dc: offer.dc === undefined ? null : offer.dc,
    faceDown: offer.faceDown,
    exp: offer.exp,
  });
  sendJson(res, 200, { roll });
}

async function handleUnoffer(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const offerId = cleanString(body.value.offerId, 64);
  if (!offerId) return sendError(res, 400, 'offerId is required', 'bad_request');

  const idx = room.offers.findIndex((o) => o.offerId === offerId);
  if (idx < 0) return sendError(res, 404, 'unknown offer', 'unknown_offer');
  if (room.offers[idx].byId !== player.id) {
    return sendError(res, 403, 'only the offer creator may rescind it', 'forbidden');
  }
  room.offers.splice(idx, 1);

  log(`unoffer room=${room.name} name=${player.name} offerId=${offerId}`);
  broadcast(room, 'offer-rescinded', { offerId });
  sendJson(res, 200, { ok: true });
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

// Validate a partial settings patch against SETTING_SPECS. Returns
// {error: [...]} or {patch} holding only allowlisted keys and values.
//
// Own-property lookups throughout: without them Object.prototype names
// (__proto__, toString, ...) would pass the key allowlist. JSON.parse does
// create a real own '__proto__' key, so this is a live concern, not theory.
function validateSettingsPatch(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: [400, 'settings must be an object', 'bad_setting'] };
  }
  const keys = Object.keys(raw);
  // A no-op write would broadcast a change that changed nothing.
  if (keys.length === 0) return { error: [400, 'settings patch is empty', 'bad_setting'] };

  const patch = {};
  for (const key of keys) {
    if (!Object.hasOwn(SETTING_SPECS, key)) {
      return { error: [400, `unknown setting: ${key.slice(0, 32)}`, 'bad_setting'] };
    }
    const spec = SETTING_SPECS[key];
    const sent = raw[key];
    if (spec.normalize) {
      // The cleaned value is what gets stored — never the raw one. The reply
      // does not echo it back: a rejected structured value is not something to
      // reflect into an error string.
      const value = spec.normalize(sent);
      if (value === null) return { error: [400, `invalid value for ${key}`, 'bad_setting'] };
      patch[key] = value;
    } else {
      if (!spec.validate(sent)) {
        return { error: [400, `invalid value for ${key}: ${String(sent).slice(0, 32)}`, 'bad_setting'] };
      }
      patch[key] = sent;
    }
  }
  return { patch };
}

// Did this write actually change anything? Settings values are JSON-shaped, so
// structural comparison is the honest test — === alone would call every write
// of a container-valued setting a change, even one that rewrote it identically.
function sameSetting(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// Any player at the table may write room settings — deliberately no roles
// (docs/ROADMAP.md §2). The patch is merged and the FULL merged object is
// broadcast, so a late-arriving event can never leave a client with a
// half-applied view.
async function handleSettings(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const checked = validateSettingsPatch(body.value.settings);
  if (checked.error) return sendError(res, ...checked.error);

  // Drop keys whose value already matches the room: re-clicking the selected
  // swatch must not broadcast a "changed the table" event that changed nothing.
  const patch = {};
  for (const key of Object.keys(checked.patch)) {
    if (!sameSetting(room.settings[key], checked.patch[key])) patch[key] = checked.patch[key];
  }
  if (Object.keys(patch).length === 0) {
    return sendJson(res, 200, { settings: { ...room.settings } }); // valid no-op
  }

  Object.assign(room.settings, patch);
  const settings = { ...room.settings };

  // A container-valued setting logs its size, not its contents — the server
  // log is an operator's trace, not a dump of every template in the room.
  const applied = Object.keys(patch)
    .map((k) => `${k}=${Array.isArray(patch[k]) ? `[${patch[k].length}]` : patch[k]}`)
    .join(' ');
  log(`setting room=${room.name} name=${player.name} ${applied}`);
  broadcast(room, 'settings-changed', { settings, byId: player.id, byName: player.name });
  sendJson(res, 200, { settings });
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
    if (route === '/api/reveal' && req.method === 'POST') return handleReveal(req, res);
    if (route === '/api/rename' && req.method === 'POST') return handleRename(req, res);
    if (route === '/api/offer' && req.method === 'POST') return handleOffer(req, res);
    if (route === '/api/claim' && req.method === 'POST') return handleClaim(req, res);
    if (route === '/api/unoffer' && req.method === 'POST') return handleUnoffer(req, res);
    if (route === '/api/clear' && req.method === 'POST') return handleClear(req, res);
    if (route === '/api/settings' && req.method === 'POST') return handleSettings(req, res);
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

export { server, DIE_TYPES, PALETTE, FELT_THEMES };
