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
import { SET_IDS } from './js/themes.js';

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
const MAX_POOLS_PER_PLAYER = 40;
const MAX_POOL_NOTATION = 200;
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

// Truncate user text to at most `max` UTF-16 units exactly the way
// js/notation.js's exported cutText does: trim \u2192 slice \u2192 surrogate guard \u2192
// trim, so a cut landing on a space cannot leave trailing whitespace and a
// slice ending inside a surrogate pair cannot strand its high half (a lone
// surrogate renders as U+FFFD everywhere the text is shown and is not even
// URL-encodable). Deliberate copy, like stripCtl above \u2014 the layers must cut
// identically. Callers pass already-stripCtl'd text.
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
const FELT_THEMES = ['emerald', 'crimson', 'midnight', 'slate', 'walnut',
  'obsidian', 'ocean', 'plum', 'sand'];

// Interpretation systems (GOALS.md goal 6, docs/ROADMAP.md §2): which profile
// in js/meanings.js reads a roll's numbers — 'soul-deal' (the meaning chart),
// 'dnd' (natural-20/1 crits, no chart), 'none' (numbers only). The server
// stores the id and nothing else: meaning words and crit rules are a
// render-time lens, so switching systems re-reads the log a room already has.
const SYSTEMS = ['soul-deal', 'dnd', 'none'];

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
    default: 'obsidian',
    validate: (v) => typeof v === 'string' && FELT_THEMES.includes(v),
  },
  // The room's interpretation system. Room-wide rather than personal on
  // purpose: it decides what a roll MEANS, and goal 8's one shared truth says
  // the table reads a result the same way for everyone.
  system: {
    default: 'soul-deal',
    validate: (v) => typeof v === 'string' && SYSTEMS.includes(v),
  },
  // The table's display name (the anatomy pass, Joe 2026-08-04: "does it
  // have a name? It should"). Cosmetic identity, room-wide like felt; the
  // ?room= KEY stays the durable identity (goal 7: the URL is the save
  // file) — this name dies with the in-memory room by design. '' = unnamed
  // (clients render no plate — never a placeholder). Sanitized like every
  // user string (control/bidi strip + surrogate-safe cut); '#' is allowed:
  // table names are never whisper-addressed, so the player-name ban does
  // not apply here.
  tableName: {
    default: '',
    normalize: (v) => (typeof v === 'string' ? (cleanString(v, 28) || '') : null),
  },
  // Room-wide custom experience templates — docs/UX.md §7.3, Joe's call that
  // these sync with the table rather than living in one player's
  // localStorage. Empty until a client ships the editor; the three built-ins
  // need no row here, they ship with the client.
  experiences: {
    default: [],
    normalize: normalizeExperiences,
  },
  // Mat-zoom (Joe 2026-08-04: the physics-mat needs a smaller region on small
  // screens). Room-wide, three presets. The client owns the numbers per
  // preset; the wire only carries the name. Late joiners land on the room's
  // current level via hello.settings, which lets applyZoom fire BEFORE any
  // replay bakes keyframes — the mat width the dice bake against is the mat
  // width every client renders. Interaction rule (see main.js queueZoom): a
  // change made while a roll is in flight defers to the next roll boundary,
  // so no client sees dice bake against one wall and settle against another.
  zoom: {
    default: 'wide',
    validate: (v) => typeof v === 'string' && ['wide', 'medium', 'close'].includes(v),
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
 *   players: Map<playerId, {id, name, color, clients:Set<ServerResponse>,
 *                           reapTimer, reapAt}>,
 *   log: [roll],
 *   offers: [offer],
 *   collectSeq: int,        // last collection sequence handed out (see §7.7)
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
      collectSeq: 0,
      settings: defaultSettings(),
    };
    rooms.set(name, room);
    log(`room created: ${name}`);
  }
  return room;
}

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, color: p.color, pools: p.pools || [],
    // §9: the player's DEFAULT set (present-or-absent, absent = standard)
    // rides the roster so a foreign rack's unmarked pools can resolve to
    // the owner's skin — Alice's rack looks the same on every screen.
    ...(p.set ? { set: p.set } : {}),
  }));
}

function dropRoomIfEmpty(room) {
  if (room.players.size === 0 && rooms.get(room.name) === room) {
    rooms.delete(room.name);
    log(`room deleted: ${room.name}`);
  }
}

function removePlayer(room, player, why) {
  if (room.players.get(player.id) !== player) return;
  holdPlayer(player);
  room.players.delete(player.id);
  for (const res of player.clients) endStream(res);
  player.clients.clear();
  log(`left    room=${room.name} name=${player.name} (${why})`);
  broadcast(room, 'player-left', { playerId: player.id });
  dropRoomIfEmpty(room);
}

// Cancel any pending reap: a live stream is here, or the seat is gone.
function holdPlayer(player) {
  clearTimeout(player.reapTimer);
  player.reapTimer = null;
  player.reapAt = 0;
}

function scheduleReap(room, player, delay) {
  // Never SHORTEN a pending grace. A refresh races two timers: the dying
  // tab's stream close (DISCONNECT_GRACE_MS) can land AFTER the new tab's
  // join has already asked for the full JOIN_GRACE_MS to open its stream,
  // and the shorter one would reap a seat that is mid-resume.
  const until = Date.now() + delay;
  if (player.reapTimer && player.reapAt >= until) return;
  clearTimeout(player.reapTimer);
  player.reapAt = until;
  player.reapTimer = setTimeout(() => {
    player.reapTimer = null;
    player.reapAt = 0;
    if (player.clients.size === 0) removePlayer(room, player, 'disconnected');
  }, delay);
  // Do not hold the event loop open just for a reap timer.
  if (player.reapTimer.unref) player.reapTimer.unref();
}

// Drop a single stream and, if it was the seat's last, arm the grace reap.
// Idempotent with onClose (which runs the same check on 'close'/'error') —
// scheduleReap never shortens a pending grace (may extend it by a hair when
// re-armed at the same delay from a later Date.now(); benign). This is
// prophylaxis, not a bug fix: onClose is wired in the same synchronous tick
// as `player.clients.add(res)`, so no event can be missed between those
// steps. But the eviction/write-fail paths already know the stream is gone
// — arming the reap here means we don't wait on the peer's FIN ACK to
// discover it. endStream tolerates re-entry (its writes are try/wrapped),
// so callers that already invoked it (sendEvent on write failure) do not
// need to strip the second call. Under MAX_STREAMS_PER_PLAYER eviction the
// size is >= MAX-1, so the scheduleReap branch here is unreachable at that
// site today; holdPlayer immediately below in handleEvents would cancel
// any reap anyway. The helper is uniform so the next reader doesn't have
// to prove that separately.
function dropStream(room, player, res) {
  player.clients.delete(res);
  endStream(res);
  if (player.clients.size === 0 && room.players.get(player.id) === player) {
    log(`DBG dropStream schedReap player=${player.name} caller=${new Error().stack.split('\n')[2].trim()}`);
    scheduleReap(room, player, DISCONNECT_GRACE_MS);
  }
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
  // res.end() only enqueues a FIN and waits for the peer's ACK to emit
  // 'close'. Against a stalled or backpressured peer that ACK never comes,
  // 'close' never fires, onClose never runs, and the seat never reaps —
  // the whole reason we called endStream to begin with (eviction, error,
  // shutdown). Force teardown so onClose runs on the next tick. Every
  // caller is already an error/eviction/shutdown decision; the RST vs FIN
  // swap is invisible to the client (its EventSource reconnects).
  try { res.socket && res.socket.destroy(); } catch { /* already gone */ }
}

// `projectFor(playerId)` is the optional per-recipient projection — the
// visibility hook (GOALS.md goal 11). When given, it returns the payload THIS
// player receives instead of `data`, or null to send that player nothing at
// all (a secret roll's events simply do not exist for anyone but its roller).
// When absent, every player receives the identical `data` — the original
// path, byte for byte.
function broadcast(room, type, data, projectFor = null) {
  for (const player of room.players.values()) {
    const payload = projectFor ? projectFor(player.id) : data;
    if (payload === null || payload === undefined) continue;
    for (const res of [...player.clients]) {
      // sendEvent's own catch already invoked endStream on write failure;
      // dropStream's second endStream is a no-op (try/wrapped) but arms the
      // grace reap in the same step so a dead peer doesn't linger.
      if (!sendEvent(res, type, payload)) dropStream(room, player, res);
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
          dropStream(room, player, res);
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

// User-supplied identifier strings (room, player name, roll/offer/player ids):
// control and zero-width/bidi characters are stripped BEFORE the cap — a name
// or room containing "\n" would otherwise forge whole extra lines in the
// server log (every log() call interpolates room.name and player.name) — then
// cut the way a roll label is (trim → slice → surrogate guard → trim).
function cleanString(value, max) {
  if (typeof value !== 'string') return null;
  return cutText(stripCtl(value), max) || null;
}

// Player names additionally ban '#'. In roll notation '#' starts the comment,
// and the comment split runs before the whisper-flag scan — so a roster name
// containing one could never survive its own canonical spelling (`w:a#b`
// re-parses as a whisper to "a" with the comment "b": a silent MISDELIVERY,
// not a parse error). No name may carry it, at any entry point; that ban is
// what makes whisper addressing total. Stripped rather than refused, exactly
// as the control/bidi sanitizer above treats its characters (the client UIs
// refuse loudly before it comes to this); a name that strips to nothing
// falls out as null and the callers answer bad_name.
function cleanName(value, max) {
  if (typeof value !== 'string') return null;
  return cleanString(value.replace(/#/g, ''), max);
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

// The room state /api/join answers with is the same snapshot the SSE `hello`
// opens with — players, log, offers, settings — so a client that renders from
// the join response shows the identical table to one that waits for the
// stream. Offers were the one piece missing: a player who joined a room with
// rolls already on the tray saw none of them until some later offer event
// arrived. The log is projected for THIS player, exactly as hello's is: a
// late joiner gets no secret entries and no held/whisper values.
function joinSnapshot(room, player) {
  return {
    playerId: player.id,
    color: player.color,
    players: publicPlayers(room),
    log: room.log.map((r) => projectEntryFor(r, player.id)).filter((r) => r !== null),
    offers: room.offers,
    settings: { ...room.settings },
  };
}

// The hue for a NEW seat. A client whose seat lapsed (grace expired, or the
// server restarted and forgot the room) asks for the color it was wearing;
// honor it when it is a real palette hue and nobody in the room has it, so a
// slow reload still looks like the same player. Otherwise the round-robin
// cursor hands out the next one — and only then does the cursor advance, so
// an honored request never burns a hue nobody wore.
function keepColor(room, wanted) {
  if (PALETTE.includes(wanted)) {
    const taken = new Set([...room.players.values()].map((p) => p.color));
    if (!taken.has(wanted)) return wanted;
  }
  const next = PALETTE[room.colorCursor % PALETTE.length];
  room.colorCursor++;
  return next;
}

async function handleJoin(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const roomName = cleanString(body.value.room, MAX_ROOM);
  const name = cleanName(body.value.name, MAX_NAME);
  if (!roomName) return sendError(res, 400, 'room is required', 'bad_room');
  if (!name) return sendError(res, 400, 'name is required', 'bad_name');

  // RESUME — a refresh is the same player, not a new one.
  //
  // The client remembers its seat per TAB (js/net.js, sessionStorage) and
  // offers it back here. The id IS the credential: every mutating POST
  // already carries it alone, so holding it is authority enough to sit back
  // down. Before this, every reload minted a fresh seat — two same-name pills
  // until the abandoned one reaped DISCONNECT_GRACE_MS later, and a new
  // palette color each time.
  //
  // Ahead of the caps below on purpose: resuming adds no player, so a FULL
  // room must still let the players already in it reload.
  const seatId = cleanString(body.value.playerId, 64);
  const seatRoom = rooms.get(roomName);
  const seat = seatId && seatRoom ? seatRoom.players.get(seatId) : null;
  if (seat) {
    // The JOIN grace, not the disconnect one: this client has not opened its
    // stream yet. scheduleReap never shortens, so the dying tab's late close
    // cannot cut this window down to 5s.
    scheduleReap(seatRoom, seat, JOIN_GRACE_MS);
    if (seat.name !== name) {
      // The owner's stored name is the truth (js/main.js keeps it in
      // localStorage); a rename that raced the reload lands here.
      seat.name = name;
      broadcast(seatRoom, 'player-renamed', { playerId: seat.id, name });
    }
    log(`resume  room=${roomName} name=${name} color=${seat.color} players=${seatRoom.players.size}`);
    return sendJson(res, 200, joinSnapshot(seatRoom, seat));
  }

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
    color: keepColor(room, cleanString(body.value.color, 16)),
    pools: [],
    clients: new Set(),
    reapTimer: null,
    reapAt: 0,
  };
  room.players.set(player.id, player);
  // If the client never opens an event stream, forget it again eventually.
  scheduleReap(room, player, JOIN_GRACE_MS);

  log(`join    room=${roomName} name=${name} color=${player.color} players=${room.players.size}`);
  broadcast(room, 'player-joined', { player: { id: player.id, name: player.name, color: player.color, pools: [] } });

  sendJson(res, 200, joinSnapshot(room, player));
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
    // Start TCP keepalive probes after 30s idle instead of the OS default
    // (Linux 7200s / 2h). Linux tcp_keepalive_intvl=75s × tcp_keepalive_probes=9
    // then catches a truly-dead peer in ~11 min. The 20s app-level heartbeat
    // (broadcast to open streams) already surfaces most cable-yanks via TCP
    // RTO exhaustion in ~15 min under Linux defaults, and the writableLength
    // backpressure guard handles suspended-tab peers in <5s; this closes the
    // rarer window where writes still succeed at the TCP layer but the peer
    // is gone.
    res.socket.setKeepAlive(true, 30_000);
  }

  // Cap streams per player: evict the oldest rather than reject, so a
  // reconnect race never locks a real client out.
  while (player.clients.size >= MAX_STREAMS_PER_PLAYER) {
    const oldest = player.clients.values().next().value;
    // dropStream's scheduleReap branch is unreachable here (size stays >=
    // MAX-1) and holdPlayer below would cancel any reap anyway — the
    // helper is uniform for readability, not for behavior at this site.
    dropStream(room, player, oldest);
  }
  player.clients.add(res);
  holdPlayer(player);

  // hello fires on EVERY stream (re)open — it is the reconnect path — so its
  // log is projected for this player: a proxy blip must not re-leak what the
  // live broadcast withheld.
  sendEvent(res, 'hello', {
    players: publicPlayers(room),
    log: room.log.map((r) => projectEntryFor(r, playerId)).filter((r) => r !== null),
    offers: room.offers,
    settings: { ...room.settings },
  });

  const onClose = () => {
    player.clients.delete(res);
    if (player.clients.size === 0 && room.players.get(playerId) === player) {
      log(`DBG onClose schedReap player=${player.name}`);
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

// Do two experiences say the same thing? Both sides have already been through
// readExp, which drops an empty subtitle rather than storing '', so an absent
// subtitle and a blank one are the same absence here.
function sameExp(a, b) {
  if (!a || !b) return !a && !b;
  return a.kind === b.kind && (a.subtitle || null) === (b.subtitle || null);
}

// Roll spec from a notation string. The server re-parses the text and ITS
// result is authoritative — a client's own parse is preview only.
//
// `explicitExp` is the request's own exp field, already validated by readExp
// (null when the client sent none). `offer` marks an /api/offer parse — the
// one context-aware corner of the grammar ('blind' is a dice-tower alias for
// 'secret' on an offer, a teaching error on a self-roll).
function parseNotationSpec(value, explicitExp = null, offer = false) {
  // An explicit pool cannot be reconciled with a parsed one, so refuse the
  // request rather than silently picking a winner.
  if (value.dice !== undefined || value.mods !== undefined) {
    return { error: [400, 'notation cannot be combined with dice or mods', 'notation_conflict'] };
  }

  const parsed = parseNotation(value.notation, { offer });
  if (!parsed.ok) {
    return { error: [400, parsed.error, 'bad_notation', { extra: { hint: parsed.hint || null } }] };
  }

  // dc, visibility and exp all come from the notation too: 'dc15', the
  // 'held'/'secret'/'w:Name' visibility flags (plus the /gmroll, /gmr and
  // /selfroll prefixes, which all normalize to 'secret' — UX.md §3.2's
  // terminology note), and the 'check'/'cinematic' flag
  // with its '# Title | Subtitle' pipe. A value sent alongside is ignored when
  // it agrees and refused when it does not (a disagreement means the client's
  // parse drifted from ours, and guessing which one the player meant is how
  // two tables end up seeing different rolls).
  if (value.dc !== undefined && value.dc !== null && value.dc !== parsed.dc) {
    return { error: [400, 'dc disagrees with the notation', 'notation_conflict'] };
  }
  const vis = readParsedVisibility(parsed);
  // faceDown is the pre-visibility spelling of 'held'; a client may still send
  // it beside a notation, and it must agree with what the notation says
  // (faceDown ⇔ held), exactly as before.
  if (value.faceDown !== undefined && value.faceDown !== (vis !== null && vis.mode === 'held')) {
    return { error: [400, 'faceDown disagrees with the notation', 'notation_conflict'] };
  }
  // Visibility is never trusted from the client: the notation is the sole
  // carrier and the server's own re-parse of it is authoritative.
  if (value.visibility !== undefined) {
    return { error: [400, 'visibility comes from the notation; it cannot be sent as a field', 'notation_conflict'] };
  }
  // The parsed moment goes through readExp as well, so a notation-derived exp
  // is held to exactly the same wire contract as a sent one — one validator,
  // no second-class path — and any future parser drift is caught here rather
  // than broadcast to the room.
  const notationExp = readExp(parsed.exp);
  if (notationExp.error) return { error: notationExp.error };
  if (explicitExp && !sameExp(explicitExp, notationExp.exp)) {
    return { error: [400, 'exp disagrees with the notation', 'notation_conflict'] };
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
  const spec = {
    dice: [...dice],
    mods,
    dc: parsed.dc,
    faceDown: vis !== null && vis.mode === 'held',
    label: cutText(rawLabel, MAX_LABEL),
  };
  // Set only when the roll is dressed up — an undressed roll must not grow an
  // `exp: null` key, or a Plain payload stops being byte-identical to what it
  // was before experiences existed.
  if (notationExp.exp) spec.exp = notationExp.exp;
  // Dice-term attribution (2b-⑤): pool labels ride the spec so the logged
  // entry answers per pool. Present-or-absent, like exp.
  if (parsed.spec.sources) spec.sources = parsed.spec.sources;
  // Parse-level visibility ({mode, names}) — present only on non-open rolls,
  // for the same byte-stability reason as exp. The handler resolves names
  // against the room roster (resolveVisibility) before the spec reaches
  // executeRoll.
  if (vis) spec.visibility = vis;
  return spec;
}

// Validate the roll-shaped part of a request body. Shared by /api/roll and
// /api/offer so an offer can only hold specs a roll would accept. Returns
// {error: [...]} or a normalized spec.
//
// Two accepted shapes, both with optional dc / faceDown / label / exp:
//   {dice, mods}       — explicit pool (the original wire form)
//   {notation: string} — re-parsed here by js/notation.js
//
// exp is validated once, out here, because on the explicit shape it rides
// ALONGSIDE the pool the way label does — an experience dresses a roll up, it
// never describes the dice. On the notation shape the moment is IN the string
// ('check'/'cinematic' + the comment's '| subtitle'), so the parsed one wins
// and a field sent beside it only has to agree; parseNotationSpec owns that
// reconciliation, exactly as it owns dc's and faceDown's.
function parseRollSpec(value, { offer = false } = {}) {
  const exp = readExp(value.exp);
  if (exp.error) return { error: exp.error };

  if (value.notation !== undefined) return parseNotationSpec(value, exp.exp, offer);

  const spec = parseExplicitSpec(value);
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
  // Visibility is chosen in notation (held / secret / w:Name) and re-parsed
  // server-side — never accepted as a client field. The explicit shape keeps
  // its one pre-visibility spelling: faceDown, which is 'held'.
  if (value.visibility !== undefined) {
    return { error: [400, 'visibility is chosen in notation (held / secret / w:Name), not sent as a field', 'bad_visibility'] };
  }

  const dc = readDc(value.dc);
  if (dc.error) return { error: dc.error };

  const label = cutText(typeof value.label === 'string' ? stripCtl(value.label) : '', MAX_LABEL);

  const spec = { dice: [...dice], mods, dc: dc.dc, faceDown: value.faceDown === true, label };
  if (spec.faceDown) spec.visibility = { mode: 'held', names: [] };
  return spec;
}

// ---------------------------------------------------------------------------
// Visibility (GOALS.md goal 11)
// ---------------------------------------------------------------------------
//
// A log entry's visibility lives at entry.visibility =
//   { mode: 'held'|'secret'|'whisper', audience: [playerId...] (whisper only),
//     revealAuthority: playerId }
// and the field is ABSENT on open rolls — an open roll must never grow a
// `visibility` key, or plain payloads stop being byte-identical (ROADMAP's
// conformance list). entry.revealed = true once revealed; a revealed entry
// projects as full to everyone.
//
//   held    — face down for EVERYONE, the roller included, until revealed
//   secret  — the roll exists only for its roller: no event, no hello/join
//             entry, nothing, for anyone else. No reveal path.
//   whisper — the named audience sees everything live; everyone else sees a
//             shrouded roll (existence public, result hidden)
//
// revealAuthority is the visibility CHOOSER: the roller for self-rolls, the
// offerer for offered rolls — which is what makes the offered whisper the GM
// screen (the claimer rolls blind; the offerer holds the reveal).

const VIS_MODES = ['held', 'secret', 'whisper'];

// Parse-level visibility from a parseNotation result: {mode, names[]}, or null
// for open. The grammar exposes `visibility` for the secret / w:Name flags;
// the faceDown boolean remains the 'held' spelling and maps here too, so the
// pre-visibility notation ('1d20 held', /gmroll) takes the same path.
function readParsedVisibility(parsed) {
  const v = parsed.visibility || (parsed.spec && parsed.spec.visibility) || null;
  if (v !== null && typeof v === 'object' && VIS_MODES.includes(v.mode)) {
    const names = Array.isArray(v.names) ? v.names.filter((n) => typeof n === 'string') : [];
    return { mode: v.mode, names };
  }
  return parsed.faceDown === true ? { mode: 'held', names: [] } : null;
}

// Resolve a parse-level visibility ({mode, names}) into the room-level entry
// form for `chooser` (the roller on /api/roll, the offerer on /api/offer).
// Whisper audience names match the CURRENT roster, case-insensitively, at
// roll/offer creation; an unknown name refuses the action outright rather
// than silently narrowing who hears it, and duplicate player names all join
// (documented behavior). The chooser is always implicitly in the audience.
// Returns { visibility } (null for open) or { error }.
function resolveVisibility(room, chooser, vis) {
  if (!vis) return { visibility: null };
  if (vis.mode === 'held' || vis.mode === 'secret') {
    return { visibility: { mode: vis.mode, revealAuthority: chooser.id } };
  }
  if (vis.mode === 'whisper') {
    const audience = [];
    const unknown = [];
    for (const name of vis.names) {
      const want = name.toLowerCase();
      let matched = false;
      for (const p of room.players.values()) {
        if (p.name.toLowerCase() !== want) continue;
        matched = true;
        if (!audience.includes(p.id)) audience.push(p.id);
      }
      if (!matched) unknown.push(name);
    }
    if (unknown.length) {
      return {
        error: [400, `unknown audience: ${unknown.map((n) => `"${n}"`).join(', ')} — no such player at the table`, 'unknown_audience'],
      };
    }
    if (!audience.includes(chooser.id)) audience.push(chooser.id);
    return { visibility: { mode: 'whisper', audience, revealAuthority: chooser.id } };
  }
  return { error: [400, `unknown visibility mode: ${String(vis.mode).slice(0, 20)}`, 'bad_visibility'] };
}

// Does this entry exist for EVERYONE at the table — not just its roller?
// The whole-room form of entryExistsFor, with the roller exemption removed.
// ANYTHING derived from one entry and published on another (today: a
// reroll's parent id, handleRoll's birth gate) must clear THIS gate, never
// the per-viewer one: a broadcast field has no single asker. Deliberately
// checks `mode`, not `revealed` — secret has no reveal path (executeRoll),
// so mode-only stays fail-closed even if that ever changed.
function entryExistsForAll(entry) {
  const vis = entry.visibility;
  return !vis || vis.mode !== 'secret';
}

// Does this entry exist at all from `viewerId`'s side of the table? Only a
// secret entry is ever nonexistent — and only for everyone but its roller.
// Gates every rollId-bearing event (roll-cleared, roll-collected) and the
// rollId lookups in reveal/collect/clear, so a secret roll's housekeeping
// leaks neither values nor existence.
function entryExistsFor(entry, viewerId) {
  return entryExistsForAll(entry) || entry.playerId === viewerId;
}

// THE projection. Applied on every path an entry leaves the server: the roll
// broadcast, the reveal broadcast, hello, the /api/join snapshot, and the
// roll/claim POST responses (the client's shelf is rebuilt from these same
// payloads, so redacting here covers shelf reconstruction too). Returns:
//   the entry itself   — open, revealed, secret-to-its-roller, or
//                        whisper-to-its-audience (same object: an open roll's
//                        payload stays byte-identical)
//   null               — secret, for anyone but the roller: the entry is
//                        OMITTED entirely
//   a redacted copy    — held (everyone, roller included) and whisper
//                        (non-audience): stakes without results
function projectEntryFor(entry, viewerId) {
  const vis = entry.visibility;
  if (!vis) return entry;
  if (vis.mode === 'secret') return entry.playerId === viewerId ? entry : null;
  if (entry.revealed) return entry;
  if (vis.mode === 'whisper' && vis.audience.includes(viewerId)) return entry;

  // Redacted: the stakes are public — who rolls, which dice (the expanded
  // pool, so exploding rolls show their extra dice: the accepted physical-
  // table leak), the notation-level label, the dc target, the moment, the
  // shelf flags, and the seed (poses only — values are crypto-RNG'd
  // independently of the seed, so it leaks nothing). Everything value-bearing
  // is OMITTED, never blanked: values, perDie, modifier, total, and spec
  // (whose mods carry part amounts).
  const out = {
    rollId: entry.rollId,
    playerId: entry.playerId,
    playerName: entry.playerName,
    color: entry.color,
    label: entry.label,
    dc: entry.dc,
    dice: [...entry.dice],
    faceDown: entry.faceDown,
    revealed: entry.revealed,
    seed: entry.seed,
    t: entry.t,
    redacted: true,
    visMode: vis.mode,
    // So every client knows whose Reveal button this is — a playerId, not a
    // value. The audience list itself is not repeated here.
    revealAuthority: vis.revealAuthority,
  };
  if (entry.exp) out.exp = entry.exp;
  if (entry.collected) out.collected = entry.collected;
  if (entry.cleared) out.cleared = entry.cleared;
  // Cosmetic identity, not content: which dice-set skin the roller's dice
  // wear is table-public (like their name and color), so it survives
  // redaction. Values never ride it.
  if (entry.set) out.set = entry.set;
  if (entry.sets) out.sets = entry.sets; // per-die skins are identity, not values
  // Unconditional because the field is only ever BORN pointing at a whole-
  // room-visible parent (handleRoll's entryExistsForAll birth gate) — a
  // shrouded viewer already knows that parent exists; "she rerolled that
  // check, face down" is a public stake (goal 11), never a value.
  if (entry.rerollOfId) out.rerollOfId = entry.rerollOfId;
  return out;
}

// ---------------------------------------------------------------------------
// The collect shelf (UX §7.7)
// ---------------------------------------------------------------------------
//
// A log entry moves through three states, each written as a present-or-absent
// field so an entry an older client reads is byte-for-byte what it always was:
//
//   on-felt    no `collected`, no `cleared` — the main felt holds this roll
//   collected  entry.collected = <seq> — the roll sits in a shelf slot
//   cleared    entry.cleared = true — gone from felt and shelf alike
//
// `cleared` implies off-shelf: a cleared entry is never on the shelf again,
// whether it was collected first or sent away straight from the felt.
//
// The sequence is per room and only ever counts up, so every client orders the
// shelf the same way without needing the server to name slots. It starts at 1,
// never 0: `collected` is then falsy exactly when it is absent, and a client
// may test it the same way it tests `cleared`.
const SHELF_CAP = 5;

// Collected entries still on the shelf, oldest collection first.
function shelf(room) {
  return room.log
    .filter((r) => r.collected && !r.cleared)
    .sort((a, b) => a.collected - b.collected);
}

// Move `entries` (in log order) onto the shelf and enforce SHELF_CAP, then tell
// the room in one ordered burst. Already-collected and cleared entries are
// skipped, which is what makes both collect paths idempotent.
//
// The burst order is load-bearing: the rolls the shelf pushed off sink FIRST,
// so no client ever has to render six clusters in five slots, not even for a
// frame. Callers that follow this with an event of their own — a new roll —
// send theirs last, so the felt is clear before the incoming dice land.
//
// Returns the entries that actually moved.
function collectEntries(room, entries) {
  const collected = [];
  for (const roll of entries) {
    if (roll.cleared || roll.collected) continue;
    roll.collected = ++room.collectSeq;
    collected.push(roll);
  }
  if (collected.length === 0) return collected;

  // Past capacity the LOWEST sequences fall off — the shelf is FIFO by
  // collection order, not by when the dice were originally rolled.
  const over = shelf(room);
  const evicted = over.slice(0, Math.max(0, over.length - SHELF_CAP));
  for (const roll of evicted) roll.cleared = true;

  // Both events are existence-gated: a secret roll's shelf housekeeping is
  // addressed to a rollId nobody else has ever heard of, so it goes to its
  // roller alone.
  for (const roll of evicted) {
    log(`evict   room=${room.name} rollId=${roll.rollId} seq=${roll.collected}`);
    // Deliberately the same event a per-roll Done sends: aging off the shelf
    // and being dismissed are the same sink animation, so a client needs one
    // code path for both.
    const data = { rollId: roll.rollId };
    broadcast(room, 'roll-cleared', data, (viewerId) => (entryExistsFor(roll, viewerId) ? data : null));
  }
  for (const roll of collected) {
    log(`collect room=${room.name} rollId=${roll.rollId} seq=${roll.collected}`);
    const data = { rollId: roll.rollId, seq: roll.collected };
    broadcast(room, 'roll-collected', data, (viewerId) => (entryExistsFor(roll, viewerId) ? data : null));
  }
  return collected;
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
    // Open rolls are born revealed, exactly as before; every non-open mode
    // starts unrevealed (secret stays that way — it has no reveal path).
    revealed: !spec.visibility,
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
  // Attribution (2b-⑤): the labels ride spec too, so reroll-last and the
  // source-grouped result surfaces survive the wire. Present-or-absent.
  if (spec.sources) roll.spec.sources = [...spec.sources];
  // Same present-or-absent rule as exp: only a non-open roll carries
  // `visibility`. By here it must be the RESOLVED room-level form — the
  // handlers run resolveVisibility first — and failing loudly on an
  // unresolved one beats logging a roll whose reveal authority nobody holds.
  if (spec.visibility) {
    if (typeof spec.visibility.revealAuthority !== 'string') {
      throw new Error('executeRoll: unresolved visibility spec');
    }
    roll.visibility = spec.visibility;
  }
  // Provenance: this roll REPLAYS an earlier one (substantiated by handleRoll
  // — only ever a whole-room-visible parent's id reaches here). Present-or-
  // absent like exp, so a fresh roll's payload stays byte-for-byte what it
  // always was. It does NOT ride roll.spec, and that is the point: spec IS
  // the request that reroll-last replays, so an inherited rerollOfId would
  // make every future reroll claim the same ancestor forever. (exp rides
  // spec because a rerolled Check must come back a Check; provenance must
  // come back pointing one hop up instead — the client stamps each reroll
  // with ITS parent's id.)
  if (spec.rerollOfId) roll.rerollOfId = spec.rerollOfId;
  // Dice-set identity (Tier 6 §9): cosmetic, present-or-absent — a plain
  // roll's payload stays byte-for-byte what it always was. It does NOT ride
  // roll.spec: the set belongs to whoever THROWS (reroll-last and a claimed
  // offer wear the actual roller's set, stamped fresh on each request),
  // never to the request being replayed.
  if (spec.set) roll.set = spec.set;
  // Per-die sets (§9 mixed pools): the same cosmetic present-or-absent ride,
  // aligned to the base dice — each die keeps the skin of the pool it left.
  if (spec.sets) roll.sets = spec.sets;

  // Auto-collect (§7.7): the felt belongs to ONE roll, so everything already on
  // it goes to the shelf as part of the incoming roll's arrival beat. The
  // server decides this, not the clients, so there is no race over whose
  // whisk-away ran first. `room.log` is still all-priors here — the new roll is
  // pushed below — and nothing of this roll's has been broadcast yet, so the
  // whole burst reaches the room in the order §7.7 pins: evictions, then
  // collections, then the roll itself.
  collectEntries(room, room.log);

  room.log.push(roll);
  if (room.log.length > LOG_CAP) room.log = room.log.slice(-LOG_CAP);

  // stdout is a disclosure surface too: a non-open roll logs its stakes and
  // mode, never its values (an operator tailing the log must not out-read the
  // table).
  // reroll= is safe on the disclosure surface: by the birth rule the id is
  // never a secret roll's.
  const tail = `${roll.dc ? ` dc=${roll.dc}` : ''}${roll.exp ? ` exp=${roll.exp.kind}` : ''}${roll.rerollOfId ? ` reroll=${roll.rerollOfId}` : ''}`;
  if (roll.visibility) {
    log(`roll    room=${room.name} name=${player.name} dice=${roll.dice.join(',')} vis=${roll.visibility.mode}${tail}`);
  } else {
    log(`roll    room=${room.name} name=${player.name} dice=${roll.dice.join(',')} values=${roll.values.join(',')} total=${roll.total}${tail}`);
  }
  // Per-recipient projection: full to those the mode allows, redacted for the
  // shrouded, and no event at all for a secret roll's non-rollers.
  broadcast(room, 'roll', roll, (viewerId) => projectEntryFor(roll, viewerId));
  return roll;
}

// The dice-set field, shared by every path that throws (roll, claim): a
// client bug sends a malformed or unknown id and gets a loud 400 — same
// stance as unknown_target. Absent/null ⇒ standard dice, no field at all.
function readSetField(value) {
  if (value.set === undefined || value.set === null) return { id: null };
  if (typeof value.set !== 'string') return { error: [400, 'set must be a string', 'bad_set'] };
  const id = cleanString(value.set, 64);
  if (!id || !SET_IDS.includes(id)) return { error: [400, `unknown dice set: ${id}`, 'unknown_set'] };
  return { id };
}

// Per-die dice sets (§9: a MIXED draft of pools, each with its own skin):
// aligned to the request's BASE dice; elements are null (wear the roll-level
// set) or a set id. 'std' is legal HERE, unlike the singular field, because
// it PINS one die to Standard while the roll-level set may be a house set.
// Absent or all-null ⇒ no field at all — the singular rule stands alone and
// a plain roll's payload stays byte-for-byte what it always was.
function readSetsField(value, diceCount) {
  const raw = value.sets;
  if (raw === undefined || raw === null) return { sets: null };
  if (!Array.isArray(raw) || raw.length !== diceCount) {
    return { error: [400, 'sets must be a list aligned to the dice', 'bad_sets'] };
  }
  let any = false;
  const out = [];
  for (const s of raw) {
    if (s === undefined || s === null) { out.push(null); continue; }
    const id = typeof s === 'string' ? cleanString(s, 64) : '';
    if (!id || (id !== 'std' && !SET_IDS.includes(id))) {
      return { error: [400, `unknown dice set: ${id || '?'}`, 'unknown_set'] };
    }
    out.push(id);
    any = true;
  }
  return { sets: any ? out : null };
}

async function handleRoll(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const spec = parseRollSpec(body.value);
  if (spec.error) return sendError(res, ...spec.error);

  // The roller is the visibility chooser on a self-roll: audience names
  // resolve against the current roster now, and the roller becomes the
  // reveal authority.
  const vis = resolveVisibility(room, player, spec.visibility);
  if (vis.error) return sendError(res, ...vis.error);
  spec.visibility = vis.visibility;

  // Reroll provenance (rerollOfId) — read HERE and only here: offers/claims
  // are fresh rolls and their parser must never see this key. It is a CLAIM
  // ABOUT HISTORY and the server is the only party that can substantiate one.
  // Malformed → 400 (a client bug, leaks nothing). Unsubstantiated → the
  // claim is DROPPED and the roll proceeds: the dice are not the questionable
  // part, and a status-code split here would rebuild exactly the existence
  // oracle handleReveal's 404 comment forbids — "no such roll", "aged past
  // LOG_CAP" and "secret, not yours" must be indistinguishable from outside.
  // The gate is the WHOLE-ROOM one (entryExistsForAll), deliberately
  // stricter than the per-viewer entryExistsFor this file's rollId lookups
  // use: this id gets BROADCAST, and a broadcast has no single asker — it is
  // dropped even when the ROLLER of the secret parent is the requester.
  // Deliberate properties (do not "harden" these away): no ownership check —
  // rerolling someone else's VISIBLE roll is a legitimate table action; one
  // hop only, never a chain-root walk; the room-scoped log.find means a
  // cross-room id can never resolve; and the new UUID is minted afterward,
  // so a candidate can never be self-referential.
  if (body.value.rerollOfId !== undefined && body.value.rerollOfId !== null) {
    if (typeof body.value.rerollOfId !== 'string') {
      return sendError(res, 400, 'rerollOfId must be a string', 'bad_reroll_of');
    }
    const rid = cleanString(body.value.rerollOfId, 64); // same read as handleClearRoll's rollId
    if (!rid) return sendError(res, 400, 'rerollOfId must be a non-empty rollId', 'bad_reroll_of');
    const parent = room.log.find((r) => r.rollId === rid);
    if (parent && entryExistsForAll(parent)) spec.rerollOfId = rid;
  }

  const set = readSetField(body.value);
  if (set.error) return sendError(res, ...set.error);
  if (set.id) spec.set = set.id;

  const sets = readSetsField(body.value, spec.dice.length);
  if (sets.error) return sendError(res, ...sets.error);
  if (sets.sets) spec.sets = sets.sets;

  const roll = executeRoll(room, player, spec);
  // The roller's own response is projected like every other egress: a held
  // roll is face down for its roller too, so even this reply carries no
  // values.
  sendJson(res, 200, { roll: projectEntryFor(roll, player.id) });
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
  // A secret roll does not exist for anyone but its roller — not even as a
  // 403, which would confirm the rollId is real.
  if (!roll || !entryExistsFor(roll, player.id)) return sendError(res, 404, 'unknown roll', 'unknown_roll');
  // No reveal path for secret: it is the roller's alone, forever (held and
  // whisper are the revealable modes).
  if (roll.visibility && roll.visibility.mode === 'secret') {
    return sendError(res, 400, 'secret rolls cannot be revealed', 'not_revealable');
  }
  // The reveal authority is the visibility chooser — the offerer of an
  // offered held/whisper roll, not its roller (the GM screen); the roller on
  // everything else.
  const authority = roll.visibility ? roll.visibility.revealAuthority : roll.playerId;
  if (player.id !== authority) {
    return sendError(res, 403, 'only the reveal authority may reveal', 'not_reveal_authority');
  }
  if (roll.revealed) return sendJson(res, 200, { ok: true }); // idempotent

  roll.revealed = true;
  log(`reveal  room=${room.name} name=${player.name} rollId=${rollId} total=${roll.total}`);
  // The reveal carries the FULL entry so every client upgrades in place — a
  // redacted copy has no values to flip to. Once revealed the entry projects
  // as full to everyone, but the projection still runs: one function decides
  // what leaves the server, everywhere.
  broadcast(room, 'reveal', { rollId }, (viewerId) => {
    const projected = projectEntryFor(roll, viewerId);
    return projected === null ? null : { rollId, roll: projected };
  });
  sendJson(res, 200, { ok: true });
}

// Collect (UX §7.7). Same roller-only authorization as reveal: the dice belong
// to the moment, and only the player who threw them says the moment is over.
// What changes is where they go — the shelf, not away — so the roll stays
// readable to the table instead of vanishing on the roller's say-so.
async function handleCollectRoll(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const rollId = cleanString(body.value.rollId, 64);
  if (!rollId) return sendError(res, 400, 'rollId is required', 'bad_request');

  const roll = room.log.find((r) => r.rollId === rollId);
  // A secret roll's existence is hidden along with its values.
  if (!roll || !entryExistsFor(roll, player.id)) return sendError(res, 404, 'unknown roll', 'unknown_roll');
  // A claimed offer's roller is the claimer, not the offer's author.
  if (roll.playerId !== player.id) return sendError(res, 403, 'only the roller may collect their roll', 'forbidden');

  // Idempotent, and deliberately silent, exactly as clear-roll is: a second
  // Collect must not re-run the whisk at clients that already played it, and a
  // cleared roll has no way back onto the shelf. collectEntries decides both —
  // and logs the line — so the manual and automatic paths cannot drift.
  collectEntries(room, [roll]);
  sendJson(res, 200, { ok: true });
}

// Per-roll Done (UX §7.5), now also the shelf's ✕ (§7.7). Housekeeping is
// universal once a roll is COLLECTED: it is table furniture by then, and
// anyone may tidy it away. An uncollected roll is still the live moment on the
// felt, so it stays the roller's to end.
// The log entry itself is never removed — only flagged — so history and a fresh
// join agree about which rolls have already left the table.
async function handleClearRoll(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const rollId = cleanString(body.value.rollId, 64);
  if (!rollId) return sendError(res, 400, 'rollId is required', 'bad_request');

  const roll = room.log.find((r) => r.rollId === rollId);
  // A secret roll's existence is hidden along with its values.
  if (!roll || !entryExistsFor(roll, player.id)) return sendError(res, 404, 'unknown roll', 'unknown_roll');
  // A claimed offer's roller is the claimer, not the offer's author, so the
  // player who actually threw the dice is the one who can send them away —
  // until it reaches the shelf, after which any player at the table may.
  if (roll.playerId !== player.id && !roll.collected) {
    return sendError(res, 403, 'only the roller may clear their roll', 'forbidden');
  }
  // Idempotent, and deliberately silent: a second Done must not re-broadcast a
  // sink animation at clients that already ran it.
  if (roll.cleared) return sendJson(res, 200, { ok: true });

  // Set on demand, never at roll time: like `exp`, an absent field keeps an
  // uncleared roll's payload byte-for-byte what it always was.
  roll.cleared = true;
  log(`clrroll room=${room.name} name=${player.name} rollId=${rollId}`);
  // Existence-gated, like every rollId-bearing event: a secret roll's Done is
  // its roller's business alone.
  broadcast(room, 'roll-cleared', { rollId }, (viewerId) => (entryExistsFor(roll, viewerId) ? { rollId } : null));
  sendJson(res, 200, { ok: true });
}

async function handleRename(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const name = cleanName(body.value.name, MAX_NAME);
  if (!name) return sendError(res, 400, 'name is required', 'bad_name');

  const oldName = player.name;
  player.name = name;
  // Past log entries keep the name they were rolled under.
  log(`rename  room=${room.name} name=${oldName} -> ${name}`);
  broadcast(room, 'player-renamed', { playerId: player.id, name });
  sendJson(res, 200, { ok: true });
}

// Published pools (ROADMAP 2b, the owner switcher) are FURNITURE, not
// authority: each player's localStorage stays the truth for their own rack;
// the server holds a display copy so teammates can browse and stage from it.
// Per-entry fail-closed: a record whose notation does not parse (server
// grammar is the arbiter, same as /api/roll) or overflows its caps is
// dropped, and what is stored is the CANONICAL spelling. The list cap is a
// refusal, like every other entity cap. Pool names take cleanString, not
// cleanName: they are display + stage labels, never whisper addresses —
// and the client re-sanitizes them into [label] form at stage time anyway.
function sanitizePools(value) {
  if (!Array.isArray(value) || value.length > MAX_POOLS_PER_PLAYER) return null;
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    if (typeof raw.notation !== 'string' || raw.notation.length > MAX_POOL_NOTATION) continue;
    const parsed = parseNotation(raw.notation);
    if (!parsed.ok) continue;
    // The cap must hold for what is STORED and broadcast: canonicalizing can
    // grow the string (d% splits into 1d10x[label]+1d10[label] per term), so
    // a 199-char raw could otherwise store ~440 chars.
    if (parsed.canonical.length > MAX_POOL_NOTATION) continue;
    const rec = { name: cleanString(raw.name, MAX_NAME) || '', notation: parsed.canonical };
    const cat = cleanString(raw.category, MAX_NAME);
    if (cat) rec.category = cat;
    // §9 set override: pool identity, so it rides the rack broadcast — a
    // teammate's Ember pool shows ITS iron, not the viewer's skin. Unknown
    // ids fall closed to no override; the pool survives.
    const set = cleanString(raw.set, 64);
    if (set && (set === 'std' || SET_IDS.includes(set))) rec.set = set;
    out.push(rec);
  }
  return out;
}

async function handlePools(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const pools = sanitizePools(body.value.pools);
  if (!pools) return sendError(res, 400, `pools must be a list of at most ${MAX_POOLS_PER_PLAYER}`, 'bad_pools');

  // §9: the owner's DEFAULT set rides the same publish, so viewers can
  // resolve unmarked pools to the owner's skin. 'std' and unknown ids both
  // normalize to absent — for a player default they mean the same thing
  // (the classics), and an id this server can't validate must not relay.
  const rawSet = cleanString(body.value.set, 64);
  const set = rawSet && rawSet !== 'std' && SET_IDS.includes(rawSet) ? rawSet : null;

  // A no-op publish answers ok without re-broadcasting: the client re-shares
  // on every hello (rejoin safety), and 40 streams need not hear about it.
  if ((player.set || null) === set && JSON.stringify(player.pools) === JSON.stringify(pools)) {
    return sendJson(res, 200, { ok: true });
  }
  player.pools = pools;
  if (set) player.set = set; else delete player.set;
  log(`pools   room=${room.name} name=${player.name} count=${pools.length}`);
  broadcast(room, 'pools-changed', { playerId: player.id, pools, ...(set ? { set } : {}) });
  sendJson(res, 200, { ok: true });
}

async function handleOffer(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  // Offer context: the 'blind' notation alias (dice tower → secret) is legal
  // here and only here — see parseNotationSpec.
  const spec = parseRollSpec(body.value, { offer: true });
  if (spec.error) return sendError(res, ...spec.error);

  // The OFFERER is the visibility chooser for an offered roll — the audience
  // resolves against the roster now, at offer creation, and the offerer is
  // the reveal authority the claimed roll will inherit.
  const vis = resolveVisibility(room, player, spec.visibility);
  if (vis.error) return sendError(res, ...vis.error);

  // Targeted offer (ROADMAP 4b): `to` names the ONE player who may claim
  // ("Bo, roll this save"). The name resolves against the CURRENT roster at
  // offer creation, exactly like a whisper audience — case-insensitive,
  // duplicate names all join — and an unknown name refuses the offer
  // outright (fail closed: never a card nobody can take). The pinned ids
  // ARE the claim gate; a later rename or a rejoin never widens or moves it
  // (the same identity rule whisper audiences follow).
  let to = null;
  if (body.value.to !== undefined && body.value.to !== null) {
    const want = typeof body.value.to === 'string' ? cleanString(body.value.to, 40) : '';
    if (!want) return sendError(res, 400, 'to must be a player name', 'bad_request');
    const wantLc = want.toLowerCase();
    const playerIds = [];
    let display = null;
    for (const p of room.players.values()) {
      if (p.name.toLowerCase() !== wantLc) continue;
      if (display === null) display = p.name; // the roster's own spelling
      if (!playerIds.includes(p.id)) playerIds.push(p.id);
    }
    if (!playerIds.length) {
      return sendError(res, 400, `unknown target: "${want}" — no such player at the table`, 'unknown_target');
    }
    to = { name: display, playerIds };
  }

  // Whisper-offer auto-targeting (Joe 2026-08-03): a whisper is already
  // ADDRESSED — "the offer should always be to that person" — so the claim
  // gate DERIVES from the whisper's audience and table-wide whisper offers
  // cease to exist by construction. An explicit ▾ target may still NARROW
  // to one audience member; one outside the audience refuses (a teaching
  // error, never a silent override), and a whisper whose only audience is
  // the offerer has nobody to offer to. secret (the dice tower — open
  // claiming is its point) and held offers are untouched.
  if (vis.visibility && vis.visibility.mode === 'whisper') {
    const audienceIds = vis.visibility.audience.filter((id) => id !== player.id);
    if (!audienceIds.length) {
      return sendError(res, 400, 'a whisper to only yourself has nobody to offer to', 'whisper_needs_audience');
    }
    if (to) {
      if (to.playerIds.some((id) => !audienceIds.includes(id))) {
        return sendError(res, 400,
          `"${to.name}" is not in this whisper's audience — a whispered offer goes to the players named after w:`,
          'target_not_in_audience');
      }
      // an explicit narrowing WITHIN the audience stands as given
    } else {
      const names = [];
      for (const id of audienceIds) {
        for (const p of room.players.values()) {
          if (p.id === id && !names.includes(p.name)) names.push(p.name);
        }
      }
      to = { name: names.join(', '), playerIds: audienceIds };
    }
  }

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
  // Attribution (2b-⑤) rides the offer too — without this the claimed roll
  // rendered ungrouped while the same notation rolled directly kept it.
  if (spec.sources) offer.sources = spec.sources;
  // Present-or-absent for the same reason. An offer has no values yet, so the
  // card itself is public in full — including who the whisper is addressed to
  // (existence is public; results are what visibility hides).
  if (vis.visibility) offer.visibility = vis.visibility;
  // Present-or-absent, like every dressed-up field: only a targeted offer
  // carries `to`. The card itself stays public in full — WHO it is for is
  // part of the stakes everyone reads.
  if (to) offer.to = to;
  room.offers.push(offer);
  if (room.offers.length > OFFER_CAP) room.offers = room.offers.slice(-OFFER_CAP);

  log(`offer   room=${room.name} name=${player.name} dice=${offer.dice.join(',')}${offer.dc ? ` dc=${offer.dc}` : ''}${to ? ` to=${to.name}` : ''} offers=${room.offers.length}`);
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
  const offer = room.offers[idx];
  // A targeted offer's claim gate (4b): enforced HERE, never by which
  // client drew the button — the same authority rule as reveal. The offer
  // stays on the table for its named player.
  if (offer.to && Array.isArray(offer.to.playerIds) && !offer.to.playerIds.includes(player.id)) {
    return sendError(res, 403, `this offer is for ${offer.to.name}`, 'not_offer_target');
  }
  // Validate BEFORE the splice: a bad set field must reject the request,
  // not consume the offer. (The claimer's set, not the offerer's — the
  // offer stages the moment, but whoever picks it up throws their own dice.)
  const set = readSetField(body.value);
  if (set.error) return sendError(res, ...set.error);
  room.offers.splice(idx, 1);

  log(`claim   room=${room.name} name=${player.name} offerId=${offerId} by=${offer.byName}`);
  broadcast(room, 'offer-claimed', { offerId });

  // The claimed roll inherits the offer's moment AND its visibility: whoever
  // picks the card up gets the moment its author staged, seen by exactly the
  // eyes its author chose. The reveal authority stays the OFFERER — the
  // claimer throws the dice but does not hold the reveal. A secret offer
  // means "only the offerer sees the result": in room-level terms that is a
  // whisper to the offerer alone, and the claimer rolls fully blind — the GM
  // screen.
  let visibility = null;
  if (offer.visibility) {
    if (offer.visibility.mode === 'secret') {
      visibility = { mode: 'whisper', audience: [offer.byId], revealAuthority: offer.byId };
    } else {
      visibility = { mode: offer.visibility.mode, revealAuthority: offer.visibility.revealAuthority };
      if (offer.visibility.audience) visibility.audience = [...offer.visibility.audience];
    }
  }
  const roll = executeRoll(room, player, {
    dice: offer.dice,
    mods: offer.mods,
    sources: offer.sources, // 2b-⑤ (undefined when the offer carried none)
    label: offer.label,
    dc: offer.dc === undefined ? null : offer.dc,
    faceDown: offer.faceDown,
    exp: offer.exp,
    visibility,
    set: set.id || undefined,
  });
  // The claimer's response is projected like every other egress: on a held or
  // offerer-only roll, the player who threw the dice gets no values back.
  sendJson(res, 200, { roll: projectEntryFor(roll, player.id) });
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

// The corner ✕: sweep the whole table — felt and shelf alike.
//
// The sweep FLAGS as it goes (§7.7). Every roll it takes off the table is
// `cleared`, exactly as a per-roll ✕ would have left it, because since §7.7 a
// client rebuilds both felt and shelf from these flags on hello: an unflagged
// sweep resurrects the entire table for whoever reloads next, and the next
// roll's auto-collect would shelve a roll the room just watched vanish. One
// 'clear' event still carries it — a burst of per-roll 'roll-cleared' events
// would make every client play five sink animations for dice the sweep already
// took — so the flags are silent state, and only the one log line records it.
async function handleClear(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  let swept = 0;
  for (const roll of room.log) {
    if (roll.cleared) continue;
    roll.cleared = true;
    swept++;
  }

  log(`clear   room=${room.name} name=${player.name} swept=${swept}`);
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
    if (route === '/api/pools' && req.method === 'POST') return handlePools(req, res);
    if (route === '/api/offer' && req.method === 'POST') return handleOffer(req, res);
    if (route === '/api/claim' && req.method === 'POST') return handleClaim(req, res);
    if (route === '/api/unoffer' && req.method === 'POST') return handleUnoffer(req, res);
    if (route === '/api/clear' && req.method === 'POST') return handleClear(req, res);
    if (route === '/api/collect-roll' && req.method === 'POST') return handleCollectRoll(req, res);
    if (route === '/api/clear-roll' && req.method === 'POST') return handleClearRoll(req, res);
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

// Listen only when run directly (`node server.js`, which is how npm start and
// the e2e harness both launch it). Importing this module — the unit tests
// exercise projectEntryFor/resolveVisibility in-process — must never bind a
// port.
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  server.listen(PORT, () => {
    log(`dice table listening on http://localhost:${PORT}  (root ${ROOT})`);
  });
}

function shutdown(signal) {
  log(`${signal} — shutting down`);
  clearInterval(heartbeat);
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      holdPlayer(player);
      for (const res of player.clients) endStream(res);
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { server, DIE_TYPES, PALETTE, FELT_THEMES, SYSTEMS, projectEntryFor, resolveVisibility, entryExistsFor, entryExistsForAll, cleanName, sanitizePools };
