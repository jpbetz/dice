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
// last player leaves — unless the room holds a prepared table (§G4), which
// buys it SETUP_TTL_MS of lingering instead (§G6). The server is the sole
// authority on rolled values: a client never displays a locally generated
// value while online.
//
// Log volume: PORT and DICE_LOG_LEVEL are the two knobs. DICE_LOG_LEVEL is an
// ordered ladder — debug < info (default) < warn < error < silent — and
// suppresses anything below the threshold. Per-roll lines (roll, evict,
// collect, offer, claim, pools, setting, clrroll) log at debug; join/leave/
// resume/reveal/rename/clear/unoffer/table/uncaught log at info. That keeps a busy
// room from filling disk on the default setting, but it also means a user
// report of "my roll didn't happen" leaves no server-side breadcrumb until
// DICE_LOG_LEVEL=debug is flipped on for triage.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeRoll, composeThrow, validateMods, validateSpec, DIE_MAX,
  scoringIndices, pushTally, drawBag, MAX_PUSH_THROWS } from './js/rollspec.js';
import { parseNotation } from './js/notation.js';
import { SET_IDS } from './js/themes.js';
// C22: the stamp's SHAPE only. The server carries `ver` on a table setup and
// never judges it — see handleTable — so it imports the parser and nothing
// else, which is also what keeps the regex in one file.
import { parseStamp } from './js/schema.js';

const PORT = Number(process.env.PORT) || 8123;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

// WHICH COMMIT IS THIS (ROADMAP §0j). Baked by `make deploy`
// (`--update-env-vars GIT_SHA=…`); absent for `node server.js` on a laptop and
// for anyone deploying by hand, and this must NOT invent one. `unknown` is a true
// answer; a guessed sha is the frozen-mtime incident again, where the only way
// to tell which build was live was to trigger known behavior and infer.
//
// VALIDATED RATHER THAN ECHOED. /health is public and unauthenticated like
// every other door here (goal 10), so whatever lands in this env var is
// published to the internet — a typo that puts a token in GIT_SHA must produce
// `unknown`, not a disclosure. Only a hex object name survives, optionally
// carrying the `-dirty` marker the Makefile appends when the tree it uploaded
// was not HEAD (`gcloud run deploy --source .` ships the WORKING TREE, so on a
// dirty checkout the bare sha would name a build that was never deployed).
const GIT_SHA = (() => {
  const raw = String(process.env.GIT_SHA || '').trim();
  return /^[0-9a-f]{7,40}(-dirty)?$/.test(raw) ? raw : 'unknown';
})();
const STARTED_AT = Date.now();

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
// Per-entry size is bounded by rollspec.js MAX_PHYSICAL_DICE=40 (the hard
// ceiling composeRoll enforces once explosion children are counted; the
// per-starting-die EXPLODE_CHAIN_CAP=3 only bounds depth). Multiplied by
// LOG_CAP that gives the worst-case log footprint per room.
const LOG_CAP = 100;              // rolls kept per room (client also caps at 100; keep in lockstep — ROADMAP §0b)
const MAX_ROOMS = 500;            // live rooms across the server
const MAX_PLAYERS_PER_ROOM = 40;
const MAX_POOLS_PER_PLAYER = 40;
const MAX_POOL_NOTATION = 200;
// Prepared player profiles in a room's table setup (docs/PROFILES.md §3.2).
// Twelve is the organizer's six characters with room to spare, and small
// enough that a setup stays furniture rather than a database. Together with
// MAX_POOLS_PER_PLAYER (applied per profile) and MAX_BODY it is the whole
// bound on the stored shape — there is no third cap to keep in sync.
const MAX_PROFILES = 12;
const MAX_STREAMS_PER_PLAYER = 4; // extra SSE streams evict the oldest
const OFFER_CAP = 20;             // offered rolls kept per room
// Breakouts listed on one table (ROADMAP §3b L4). Eight is the recents list's
// own number (js/tables.js MAX_TABLES) and for the same reason: a screenful,
// and a group that has split eight ways is not coming back together. The cap is
// not cosmetic — /api/split is an unauthenticated append into another room's
// memory, and an uncapped array is the whole attack.
const MAX_CHILDREN = 8;
// How often every open stream is pinged — and, since the ping now expects an
// answer, how often staleness is checked. DICE_HEARTBEAT_MS overrides it at
// boot exactly as DICE_SETUP_TTL_MS does, and for the same reason: a test
// cannot wait out three 20s ticks to watch a stream go stale.
const HEARTBEAT_MS = (() => {
  const raw = Number(process.env.DICE_HEARTBEAT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 20_000;
  return Math.min(raw, 2 ** 31 - 1);
})();
// How long a seat whose last stream just closed stays ON THE ROSTER. Five
// seconds, unchanged since it shipped: it is the ghost budget, not the resume
// budget (see RESUME_TTL_MS, which is the other half of that sentence). A tab
// that is really gone must stop being shown in seconds — four ghost pills on a
// table with one real window open is the production bug this number bounds.
//
// DICE_DISCONNECT_GRACE_MS overrides it at boot exactly as DICE_HEARTBEAT_MS
// does, for the same reason: the resume window is a claim ABOUT this clock
// ("longer than the grace"), and a test that cannot shrink the grace has to
// sleep through a real one for every case it makes.
const DISCONNECT_GRACE_MS = (() => {
  const raw = Number(process.env.DICE_DISCONNECT_GRACE_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 5_000;
  return Math.min(raw, 2 ** 31 - 1);
})();
const JOIN_GRACE_MS = 60_000;        // time to open the SSE stream after join

// HOW LONG A REAPED SEAT IS STILL THE SAME PERSON'S (docs/IDENTITY.md §8).
//
// THE DEFECT THIS NUMBER EXISTS FOR. Rung 1 let a LAPSED seat be resumed — one
// nobody is streaming but which the roster still holds. That made the feature's
// whole promise depend on beating DISCONNECT_GRACE_MS with a browser boot, and
// a browser boot does not cooperate: measured on this machine, a reload of this
// app announces itself 4.2–5.4 s after the old tab's socket closed (the app's
// own module evaluation, not the network), against a 5 s grace. So `seat-resume`
// failed four runs in six, and a player on a slow phone lost their seat — and
// with it the authority to reveal the roll they were holding — on any reload.
//
// TWO CLOCKS, NOT ONE, because the roster and the resume answer different
// questions and the naive fix (a longer grace) brings the ghosts back:
//   DISCONNECT_GRACE_MS  what the ROSTER shows. A browser that is gone stops
//                        being drawn in seconds. Untouched by any of this.
//   RESUME_TTL_MS        what the SERVER REMEMBERS. After the reap, the seat's
//                        id, colour and browser key live on in room.vacated —
//                        invisible to every projection — so the browser that
//                        was sitting there can sit back down.
//
// SIXTY SECONDS is sized to the accident, not to durability. A cold cache on a
// slow phone, a crashed tab reopened with ctrl-shift-T, a laptop lid closed
// mid-reload: all tens of seconds. It stops well short of "come back tomorrow
// and reveal it", which is rung 2 — CLOSED by the owner (IDENTITY §7), and this
// must not become it by accident.
const RESUME_TTL_MS = (() => {
  const raw = Number(process.env.DICE_RESUME_TTL_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 60_000;
  return Math.min(raw, 2 ** 31 - 1);
})();

// Vacated seats remembered per room. A record is three short strings and a
// timestamp (~200 bytes) — deliberately NOT the player's pools or library,
// which the returning client re-publishes on its first hello anyway — so the
// absolute worst case is MAX_ROOMS × this × ~200 B, well under a megabyte.
// A table has one of these per browser that walked away, and eight is more
// walk-aways than a room this size sees inside one minute; past that the
// oldest goes, which is the one nearest its own expiry.
const MAX_VACATED_PER_ROOM = 8;

// How long a stream may go without answering a heartbeat before we stop
// believing the transport and drop it.
//
// Every other liveness signal here is transport-level: 'close' fires, or a
// write throws. Behind a proxy that terminates the client connection —
// Cloud Run's front end is ours — NEITHER happens when a tab closes. The
// container's request stays open and its writes keep succeeding into the
// proxy, so `clients.size` never reaches 0, no grace is ever armed, and the
// seat sits on the roster until the platform's 3600 s request timeout tears
// the request down an hour later. That was observed, not theorized: four
// seats on one table with one real window open, and `/api/events` request
// latencies of exactly 3601 s.
//
// So the client proves it is alive at the APPLICATION layer: the heartbeat
// below is an event the client answers with POST /api/pong, and a stream
// that stops answering is dropped here regardless of what the socket claims.
// Three missed heartbeats plus slack — long enough that a slow round trip or
// a briefly-throttled background tab is never mistaken for a closed one.
const LIVENESS_TIMEOUT_MS = (() => {
  const raw = Number(process.env.DICE_LIVENESS_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 70_000;
  return Math.min(raw, 2 ** 31 - 1);
})();

// How long a room holding a prepared table (§G4) outlives its last player
// before it is really deleted — docs/PROFILES.md §5 mechanism 3, ROADMAP §G6.
// Without it dropRoomIfEmpty takes the felt, the system, the table name and
// six prepared seats the instant the organizer closes the tab, which is the
// most surprising loss in this whole pass: not a restart, a walk away.
//
// TWELVE HOURS is sized to one prep session, deliberately, not to durability
// this mechanism cannot deliver. It covers "set the table after dinner, the
// first player arrives at eight" and "prepped last night, we play tonight" —
// and it stops well short of pretending to cross a restart, because it can't:
// on Cloud Run with --min-instances 0 the instance itself goes away between
// sessions (DEPLOY.md). The file (mechanism 1) and the client's re-push on
// hello (mechanism 2) are what actually survive that, and this is the third,
// cheapest mechanism, not a substitute for either.
//
// MEMORY. A lingering room is small BY CONSTRUCTION, and that is the whole
// argument for letting 500 of them exist. lingerRoom clears the log — the only
// part of a room that is big (LOG_CAP=100 entries × up to MAX_PHYSICAL_DICE=40
// dice each) — and the offers, leaving settings plus setup. The setup came in
// through MAX_BODY (64 KiB) at the door and is capped after it by G4's caps:
// MAX_PROFILES=12 profiles × MAX_POOLS_PER_PLAYER=40 pools × MAX_POOL_NOTATION
// =200 chars of canonical notation. Tens of KiB per room at the absolute
// ceiling, so MAX_ROOMS=500 lingering rooms is tens of MiB. An UNPREPARED
// empty room still dies instantly (dropRoomIfEmpty gates on room.setup): there
// is nothing in it worth keeping, and letting one linger would hand any client
// that joins and leaves a free twelve-hour reservation on a room name.
//
// DICE_SETUP_TTL_MS overrides it, read once at boot exactly the way
// DICE_LOG_LEVEL is. An e2e scenario cannot wait twelve hours, and the
// alternative — a test-only route or query parameter — would put a lever on
// the live HTTP surface that exists for nobody but the tests. Junk or a
// non-positive value falls back to the default; the clamp matters because past
// 2**31-1 ms Node fires a timer IMMEDIATELY, turning "linger longer" into
// "never linger at all".
const SETUP_TTL_MS = (() => {
  const raw = Number(process.env.DICE_SETUP_TTL_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 12 * 60 * 60 * 1_000;
  return Math.min(raw, 2 ** 31 - 1);
})();

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
  // ?room= KEY stays the durable identity (it is what an invite link
  // addresses) — this name dies with the in-memory room by design. '' = unnamed
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
  // The dice tower (docs/TOWER.md). Room-wide because it changes the FILM:
  // a tower roll is baked as a pour (scripted entry, hidden transit, exit
  // spray) instead of a throw, and every client must bake the same one. The
  // value is a TOWER ID, not a boolean — 'none' plus one model today, more
  // later — and the client owns every number behind it; the wire carries only
  // the name. Same interaction rule as zoom (main.js queueTower): a change
  // made mid-roll defers to the next roll boundary, so no client re-sockets
  // the mat under a film already baked against the old one.
  tower: {
    default: 'none',
    validate: (v) => typeof v === 'string'
      && ['none', 'heartwood', 'bastion', 'blackanvil', 'nullstone', 'hollowbole'].includes(v),
  },
  // The venue (GOALS goals 13–15): the whole staging of the table as ONE
  // room-wide choice — 'table' is the grounded room everyone knows; a
  // fantasy venue replaces the à-la-carte pickers while it is active. The
  // wire carries only the id (the zoom/tower rule); the client owns every
  // number behind it. A client that has not shipped a venue keeps the
  // table it has (unknown ids are ignored client-side, the tower rule).
  venue: {
    default: 'table',
    validate: (v) => typeof v === 'string'
      && ['table', 'moonrise', 'foxfire'].includes(v),
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
 *   settings: {felt, ...},  // room-wide, see SETTING_SPECS
 *   setup: null | {rev, table, profiles, at},  // the prepared table (§G4)
 *   parent: null | {room, name},   // the table this one broke out of (§3b L4)
 *   children: [{room, name, at}],  // the breakouts running off this one (§3b L4)
 *   lingerTimer, lingerAt   // set only while empty-but-prepared (§G6)
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
      // The prepared table (docs/PROFILES.md §3.2). null until someone
      // pushes one — a fresh room's hello and /api/join carry no `setup`
      // key at all, so their payloads stay byte-identical to today's.
      setup: null,
      // SUB-TABLES (ROADMAP §3b L4, CUJ5). Both halves ride hello/join
      // present-or-absent, exactly like `setup`, so a table that never split
      // sends today's payload byte for byte.
      //   `parent`   — the table this one broke out of. Declared ONCE by the
      //                first client that walks in knowing (handleSplit), then
      //                held here so everyone else reads it from the server
      //                rather than from whoever happened to click the link.
      //   `children` — the scoped directory: the breakouts of THIS table,
      //                listed to everyone sitting at it. The only directory in
      //                the system, and it is never global (Joe's ruling).
      parent: null,
      children: [],
      // Armed only while the room is empty AND prepared (§G6). Null on a
      // live room, so `lingerTimer` doubles as "is this room lingering?"
      // — the one predicate evictLingeringRoom scans for.
      lingerTimer: null,
      lingerAt: 0,
      // SEATS THE ROSTER HAS LET GO OF AND THE SERVER STILL REMEMBERS
      // (docs/IDENTITY.md §8): playerId -> {id, who, color, at}. Written by
      // removePlayer on the DISCONNECT reap only, read by takeVacatedSeat at
      // the door, and NEVER by anything that builds a payload — publicPlayers
      // walks room.players and nothing else, which is what keeps a vacated
      // seat from becoming a way to see a player who is not there.
      vacated: new Map(),
    };
    rooms.set(name, room);
    log(`room created: ${logField('room', name)}`);
    return room;
  }
  // Someone walked up to a room that may have been lingering on its setup TTL
  // (§G6). The TTL only ever measured "nobody is here", so it ends now and the
  // room resumes exactly as prepared — same settings, same setup, same rev, so
  // the arriving client's re-push (mechanism 2) correctly stands down instead
  // of healing a gap that isn't there. This is the ONLY cancel site because
  // getRoom is the only door a player enters a room through; every other
  // rooms.get() caller (handleEvents, lookup) needs a live PLAYER, and a
  // lingering room has none.
  if (room.lingerTimer) {
    holdRoom(room);
    log(`room resumed: ${logField('room', name)} rev=${room.setup ? room.setup.rev : 0}`);
  }
  return room;
}

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, color: p.color, pools: p.pools || [],
    // C17: their whole library, so a joiner is offered every character at
    // the table rather than only the one each player happens to be holding.
    ...(p.library && p.library.length ? { library: p.library } : {}),
    // §9: the player's DEFAULT set (present-or-absent, absent = standard)
    // rides the roster so a foreign rack's unmarked pools can resolve to
    // the owner's skin — Alice's rack looks the same on every screen.
    ...(p.set ? { set: p.set } : {}),
    // §11: WHICH of their profiles this rack is, and the system it was built
    // for. The owner switcher has browsed teammates' racks since ROADMAP 2b;
    // until now it could only say whose. A rack a teammate can name is a rack
    // a teammate can copy — which is the whole of Joe's "see profiles from
    // other players and even copy the profile for their own use."
    //
    // This is a LABEL on a published rack, never an identity: nothing here
    // links a seat to a stored profile, no id crosses the wire, and the server
    // keeps no library (goal 7). Both fields are present-or-absent.
    ...(p.profile ? { profile: p.profile } : {}),
    ...(p.system ? { system: p.system } : {}),
  }));
}

// The last player left. An ordinary room dies here, as it always has; a room
// that holds a prepared table (§G4) LINGERS instead — see lingerRoom and
// SETUP_TTL_MS. The gate is `room.setup` and nothing else, so an unprepared
// room can never take the lingering branch: there is nothing in it worth a
// MAX_ROOMS slot, and a room name must not become a free reservation.
function dropRoomIfEmpty(room) {
  if (room.players.size !== 0 || rooms.get(room.name) !== room) return;
  if (room.setup) return lingerRoom(room);
  rooms.delete(room.name);
  log(`room deleted: ${logField('room', room.name)}`);
}

// Empty and prepared: keep the PREPARATION, drop the SESSION, arm the reaper
// (docs/PROFILES.md §5 mechanism 3, ROADMAP §G6 — "the log and offers still
// clear; only the small setup lingers, and a timer reaps it").
//
// The split is per-preparation vs per-session, not "small vs large":
//   KEPT — `setup`, obviously, and `settings`. The organizer chose the felt,
//     the system, the table name and the mat zoom deliberately; they ARE the
//     prepared table, and a room that came back with the setup intact but the
//     felt reset to default would read as half-remembering. §G4 stores the
//     setup as PUSHED rather than as merged for the same reason: intent is
//     worth keeping separately from what the table currently looks like.
//   CLEARED — `log` (last night's rolls are nobody's furniture, and it is the
//     one field big enough to matter — see SETUP_TTL_MS's memory note),
//     `offers` (an offered roll is addressed to players who have all left; a
//     claim needs a live roller), `collectSeq` (a sequence over a log that no
//     longer exists), `colorCursor` (so Thursday's first arrival gets the
//     first palette colour, exactly as in a room created fresh) and `children`
//     (§3b L4 — tonight's breakouts are session, not preparation: every one of
//     them is an unprepared room that died when ITS last player left, so a room
//     that came back eleven hours later listing them would be offering doors
//     onto empty rooms and calling them the game). The result is
//     indistinguishable from a brand-new room that was immediately prepared,
//     which is the property that keeps this from being a second kind of room
//     with its own rules.
//   KEPT, and worth saying because it is the one that looks like session —
//     `parent`. Being a breakout of the vault heist is what this table IS, the
//     same kind of fact as its name (which linger also keeps); it is not
//     something that happened tonight. And the pointer cannot rot: it is a room
//     KEY, not a handle (see handleSplit), so it stays followable whether or
//     not the parent still exists.
//   KEPT for sixty seconds by its own clock — `vacated` (IDENTITY §8). It IS
//     session state, and it clears itself: every read checks RESUME_TTL_MS, so
//     an eleven-hour linger hands back nothing. Not cleared here because the
//     player who trips this path is the organizer reloading ALONE in a prepared
//     room — the last seat leaving is what armed the linger — and clearing it
//     would take the seat from exactly the person §G6 exists for.
//
// Nothing is broadcast: there is nobody left to hear it, and the room's next
// occupant learns the whole state from hello.
function lingerRoom(room) {
  room.log.length = 0;
  room.offers.length = 0;
  room.children.length = 0;
  room.collectSeq = 0;
  room.colorCursor = 0;
  // Not reachable today (removePlayer is the only caller's caller, and it
  // needs a seated player, which a lingering room has none of), but if it ever
  // were: the TTL measures "empty since", so re-entry must not push it back.
  if (room.lingerTimer) return;
  room.lingerAt = Date.now() + SETUP_TTL_MS;
  room.lingerTimer = setTimeout(() => {
    room.lingerTimer = null;
    room.lingerAt = 0;
    // Re-check both conditions dropRoomIfEmpty tested. holdRoom cancels this
    // timer on any arrival, so reaching here with players is not expected —
    // but "delete a room somebody is sitting in" is the one outcome worth
    // spending a branch to make impossible.
    if (room.players.size !== 0 || rooms.get(room.name) !== room) return;
    rooms.delete(room.name);
    log(`room expired: ${logField('room', room.name)}`);
  }, SETUP_TTL_MS);
  // Never hold the event loop open for a room nobody is in. Same reasoning as
  // scheduleReap's unref, and it matters more here: on Cloud Run a referenced
  // twelve-hour timer would keep the instance from idling out, so the cheapest
  // durability mechanism would quietly become the most expensive one.
  if (room.lingerTimer.unref) room.lingerTimer.unref();
  log(`room lingering: ${logField('room', room.name)} ttl=${SETUP_TTL_MS}ms`);
}

// Cancel a pending linger: the room is alive again, or it is being deleted now.
// Mirrors holdPlayer.
function holdRoom(room) {
  clearTimeout(room.lingerTimer);
  room.lingerTimer = null;
  room.lingerAt = 0;
}

// At MAX_ROOMS, a lingering room yields to a live one. Returns true if a slot
// was freed.
//
// A prepared-but-empty room must never be the reason a real table cannot be
// created. It holds nobody's session — its worst case is that one organizer
// re-pushes a setup they still have in localStorage and in a file (mechanisms
// 1 and 2), which is the cheapest loss on the board — while the alternative is
// a 503 to a group of players trying to sit down. That asymmetry decides it.
//
// It is also what keeps §G6 from being a resource hole: without eviction,
// anyone could join-push-leave 500 room names and hold every slot for twelve
// hours. With it, that attack degrades to "prepared rooms get evicted sooner",
// and a live join always succeeds. The oldest linger goes first — smallest
// lingerAt, i.e. nearest its own expiry anyway, since every linger is armed
// for the same TTL. The scan is O(rooms) ≤ 500 and only runs at the cap.
function evictLingeringRoom() {
  let victim = null;
  for (const room of rooms.values()) {
    if (!room.lingerTimer) continue;
    if (!victim || room.lingerAt < victim.lingerAt) victim = room;
  }
  if (!victim) return false;
  holdRoom(victim);
  rooms.delete(victim.name);
  log(`room evicted: ${logField('room', victim.name)} (room cap)`);
  return true;
}

// THE SEAT LEAVES THE ROSTER AND THE SERVER KEEPS THE STUB (IDENTITY §8).
//
// Only from the DISCONNECT reap, and only for a seat somebody really sat in:
//   why === 'disconnected'   the ACCIDENT — a closed tab, a reload that lost
//                            the race, a dead network. The GESTURE ('Leave &
//                            switch seat', why === 'left') buries nothing:
//                            leaving on purpose still means leaving, and its
//                            client has already forgotten the seat anyway.
//   everStreamed             somebody WAS here. A seat that joined and never
//                            streamed is an arrival that gave up, and the same
//                            bit that stops resumableSeatFor confusing the two
//                            stops this one (see there for the session-restore
//                            case it protects).
// A seat with no `who` is not remembered either: nothing could ever answer for
// it except its own id, and a client holding that id is a client whose tab is
// still open. Present-or-absent all the way through, as rung 1 is.
function rememberVacatedSeat(room, player, why) {
  if (why !== 'disconnected' || !player.everStreamed || !player.who) return;
  const now = Date.now();
  // Prune first — expired stubs are the cheapest thing to give up, and doing
  // it here means no timer exists to hold the event loop open or to leak.
  for (const [id, rec] of room.vacated) {
    if (now - rec.at > RESUME_TTL_MS) room.vacated.delete(id);
  }
  room.vacated.delete(player.id);        // re-insert at the end: Map order is age
  while (room.vacated.size >= MAX_VACATED_PER_ROOM) {
    room.vacated.delete(room.vacated.keys().next().value);
  }
  room.vacated.set(player.id, { id: player.id, who: player.who, color: player.color, at: now });
}

// The seat this arrival may sit back down in, or null. Consuming: a stub is
// good for ONE return, so two tabs cannot both revive one seat.
//
// THE SEAT ID WINS OVER THE KEY, and the order is the whole reason this is not
// a scan for `who` alone: a browser with two dead tabs has two stubs and one
// key, and the tab that reloads should get ITS chair back rather than its
// sibling's. Falling back to the key's most recent stub is rung 1's own rule
// (resumableSeatFor keeps the last match, for the same reason: it is the seat
// whose held roll the player is coming back for).
//
// NEVER A LIVE SEAT: a stub only exists for a player removePlayer has already
// deleted, and the `room.players.has` check makes that hold by construction
// rather than by argument. Refusal is not an error anywhere here — a miss falls
// through to an ordinary join, exactly as rung 1's does, and nothing at this
// door is ever told "no" because of who asked (IDENTITY §4).
function takeVacatedSeat(room, seatId, who) {
  if (!room || room.vacated.size === 0) return null;
  let rec = (seatId && room.vacated.get(seatId)) || null;
  if (!rec && who) {
    for (const r of room.vacated.values()) if (r.who === who) rec = r;
  }
  if (!rec) return null;
  room.vacated.delete(rec.id);
  if (Date.now() - rec.at > RESUME_TTL_MS) return null;  // gone for good is gone for good
  if (room.players.has(rec.id)) return null;             // cannot happen; stays impossible
  return rec;
}

function removePlayer(room, player, why) {
  if (room.players.get(player.id) !== player) return;
  holdPlayer(player);
  room.players.delete(player.id);
  for (const res of player.clients) endStream(res);
  player.clients.clear();
  // Before the broadcast, so the two lifetimes are visibly one step apart: the
  // roster loses the seat NOW; the stub outlives it (RESUME_TTL_MS).
  rememberVacatedSeat(room, player, why);
  log(`left    ${logField('room', room.name)} ${logField('name', player.name)} (${why})`);
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
    logDebug(() => `reap-armed ${logField('player', player.name)} (stream dropped)`);
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

// The heartbeat is now a QUESTION, not an announcement: every open stream is
// asked to prove it is alive, and one that has stopped answering is dropped
// even though the socket still accepts writes (see LIVENESS_TIMEOUT_MS).
//
// Dropping a stale stream deliberately does no more than dropStream: when it
// was the seat's last, the ordinary DISCONNECT_GRACE_MS reap takes it from
// here. One departure path, whatever noticed the departure.
//
// Streams that carry no `streamId` are EXEMPT from the staleness check. That
// is a client cached from before this shipped — it cannot pong, and reaping
// it would put it in a rejoin loop, taking a new seat and colour every
// LIVENESS_TIMEOUT_MS. It keeps exactly the behavior it has today (a zombie
// stream that clears at the platform timeout) and heals on its next reload.
const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      for (const res of [...player.clients]) {
        const stream = res.diceStream;
        if (stream && stream.id && now - stream.lastPong > LIVENESS_TIMEOUT_MS) {
          logDebug(() => `stream stale ${logField('player', player.name)} stream=${stream.id}`);
          dropStream(room, player, res);
          continue;
        }
        // A ping the client can SEE: an SSE comment (': ping') never reaches
        // EventSource handlers, so it could never be answered. The stream's
        // own id rides along so the answer names the stream the server knows,
        // not the one the client believes it is on.
        if (!sendEvent(res, 'ping', { streamId: stream ? stream.id : null })) {
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

// DICE_LOG_LEVEL is a real syslog-shaped ladder — anything at or above the
// threshold prints, anything below is dropped. The current call sites only
// use info (via log()) and debug (via logDebug()); warn/error/silent are
// forward-compat so future higher-severity calls slot in without a rename.
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const LOG_THRESHOLD = LOG_LEVELS[String(process.env.DICE_LOG_LEVEL || 'info').toLowerCase()] ?? LOG_LEVELS.info;
const LOG_INFO = LOG_THRESHOLD <= LOG_LEVELS.info;
const LOG_DEBUG = LOG_THRESHOLD <= LOG_LEVELS.debug;

function writeLog(msg) {
  process.stdout.write(`[dice ${new Date().toISOString()}] ${msg}\n`);
}
function log(msg) { if (LOG_INFO) writeLog(msg); }
// Per-roll and per-pool-broadcast lines: default-off (info threshold), on with
// DICE_LOG_LEVEL=debug. Callers pass a thunk so the interpolation itself is
// skipped at info level — the ~40-die join() would otherwise still fire.
function logDebug(build) { if (LOG_DEBUG) writeLog(typeof build === 'function' ? build() : build); }

// Format one key=value pair for the operator log. User-derived strings are
// wrapped in double quotes with backslash-escaped interior quotes/backslashes
// so a rename like tableName='foo felt=crimson' can never forge adjacent
// key=value tokens for a log-scraper (an operator grepping for
// `felt=crimson` must not surface someone's table name). Arrays log their
// length only — a per-line trace is not the place to dump twelve experience
// records. Anything else prints raw (numbers, booleans, palette hues,
// server-minted UUIDs, and enumerated values like vis.mode/exp.kind whose
// grammars refuse the injection alphabet up front).
//
// Kept next to stripCtl/cutText because the same discipline applies: one
// helper decides how untrusted text becomes a log token, so no future site
// re-derives its own quoting rule.
// The caller's address, for the one thing this server rate-limits by it.
// Cloud Run terminates TLS at its front end and puts the real client first in
// x-forwarded-for, so the socket address is the proxy and useless here; the
// socket is the fallback for a local run where there is no proxy. Truncated
// and never logged beside anything that identifies a person — it exists to
// bound a door, not to follow anyone around.
function clientAddr(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim().slice(0, 45);
  return String((req.socket && req.socket.remoteAddress) || '?').slice(0, 45);
}

function logField(k, v) {
  if (Array.isArray(v)) return `${k}=[${v.length}]`;
  if (typeof v === 'string') return `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return `${k}=${v}`;
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
//
// The prepared table (§G4) rides here and on hello PRESENT-OR-ABSENT: a room
// nobody prepared sends the payload it sends today, byte for byte. It is sent
// whole rather than projected because there is nothing in it to project — no
// roll entries, no values, no per-player anything (PROFILES.md §8: this must
// not become a second egress for anything roll-shaped). room.setup is replaced
// wholesale on every push and never mutated in place, so handing the stored
// object straight out is safe, exactly as `offers` is.
// The room half of that snapshot, and the ONE place it is built. hello used to
// repeat this literal, which made "identical to /api/join's" a claim the code
// could not keep: two literals drift the first time somebody adds a field to
// the door they happened to be standing at, and the client that renders from
// the join response would then show a different table from the one that waits
// for the stream. Byte-for-byte what both sent before — same fields, same
// order — so no client sees a change.
//
// TABLE RESYNC RIDES THIS AND NEEDS NO FIELD OF ITS OWN (ROADMAP §3). Which
// rolls still sit on the felt is already IN the projected log: an entry with
// neither `collected` nor `cleared` is on the felt, and the server's
// auto-collect (executeRoll) keeps that set to exactly one. So the resync
// payload is a property of the log, not a sibling of it — and it inherits
// projectEntryFor's redaction for free, which is why a held roll cannot arrive
// early just because somebody reloaded.
// THE SUB-TABLE FIELDS ARE SENT WHOLE, AND HERE IS THE TEST THEY PASS (§3b L4).
// The rule this server runs on is that projectEntryFor is the ONLY path a roll
// entry leaves by, and that redaction is ABSENT DATA, never hidden data. So a
// new field on this payload has to answer two questions, the same two `setup`
// answered above:
//
//   1. IS IT ROLL-SHAPED? No. `parent` is {room, name} and each `children`
//      entry is {room, name, at} — a room key, a table's display name, and a
//      millisecond. No values, no dice, no notation, no playerId, no per-viewer
//      anything. There is nothing here that projectEntryFor could redact,
//      because there is nothing here that any viewer is not entitled to. Both
//      objects are replaced wholesale and never mutated in place (handleSplit
//      builds fresh literals), so handing the stored object straight out is
//      safe — exactly as `offers` and `setup` are.
//   2. IS PUBLISHING A ROOM KEY SAFE? This is the sharp one, and the honest
//      answer is that publishing a key IS granting entry — there is no access
//      control and there never will be (goal 10), so a listed table is a
//      walk-in-able table. That is not a leak here; it is the ruling. Joe:
//      "sub-tables are public to the top-level table." The directory is scoped
//      to ONE parent and is the only directory in the system: to read it you
//      must already hold the parent's key and be seated at it, which is a
//      strictly larger permission than walking into one of its breakouts. What
//      the server still refuses to publish, and what §3b's other ruling is
//      about, is a GLOBAL list of live rooms — nothing here builds one.
function roomSnapshot(room, viewerId) {
  return {
    players: publicPlayers(room),
    log: room.log.map((r) => projectEntryFor(r, viewerId)).filter((r) => r !== null),
    offers: room.offers,
    settings: { ...room.settings },
    ...(room.setup ? { setup: room.setup } : {}),
    ...(room.parent ? { parent: room.parent } : {}),
    ...(room.children.length ? { children: room.children } : {}),
  };
}

function joinSnapshot(room, player) {
  return {
    playerId: player.id,
    color: player.color,
    ...roomSnapshot(room, player.id),
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

// THE ROOM-CREATION THROTTLE (ROADMAP §0j). Room creation is the one door that
// ALLOCATES out of MAX_ROOMS, so it is the one a script uses to lock a real
// table out with `server_full`. Cloud Armor is still the authority (DEPLOY.md
// "Bounding room creation" holds the runbook) because it sees an IP nobody can
// forge; this is defence in depth for the day the rule is off, mis-scoped, or
// the app is running somewhere else entirely.
//
// THE ROADMAP'S REASON FOR KILLING F1 IS STALE, verified 2026-08-14.
// `req.socket.remoteAddress` does collapse to the proxy behind Cloud Run — but
// nothing has read it alone since `clientAddr` landed, and `clientAddr` already
// keys the /api/clienterror limiter that ships today. So the objection is
// answered; what survives is the WEAKER, sharper one below.
//
// X-FORWARDED-FOR IS NOT A CREDENTIAL. Cloud Run's front end APPENDS to
// whatever the client sent, so the leftmost entry `clientAddr` returns is the
// real client only when the client sent no header of its own. An attacker
// rotates it to evade this, and can aim it at a victim's address to spend the
// victim's budget. Both are fatal to a HARD control and survivable by a soft
// one, which is what fixes the shape of this rule:
//
//   * CREATION ONLY. `rooms.has(roomName)` short-circuits it, so joining or
//     resuming a table that exists is never rate-limited. Even a wholly
//     mis-keyed player can always sit down where their friends already are.
//   * NEVER /api/events (§0d F3: a 429 on the event stream is a self-inflicted
//     stream storm — every refused client reconnects immediately).
//   * ARMED ONLY UNDER PRESSURE. Below the guard there are hundreds of free
//     slots, so nobody can be locked out and nobody is refused. A real table
//     never reaches this branch; the e2e suite (158 scenarios, rooms deleted
//     the moment they empty) never comes close either.
//   * A RATE, NOT AN OWNERSHIP CAP — and that choice is the whole safety
//     argument. If the key ever collapses to one value for everyone (the F1
//     failure, e.g. a platform that stops sending the header), an ownership cap
//     would refuse every new table above the guard, while a rate merely spends
//     ROOM_CREATE_PER_MIN across everyone — an order of magnitude above what
//     this app's real demand has ever been.
//
// The attack it actually defeats: 500 unthrottled creations arrive in seconds;
// throttled, one key adds 10/min past the guard, and each of those rooms is
// deleted 60 s later (JOIN_GRACE_MS) unless the attacker also holds an SSE
// stream answering heartbeats. A spoofing attacker evades it — that is Cloud
// Armor's half, and it is why the runbook is not optional.
const ROOM_CREATE_PER_MIN = 10;
// Half the table. Below it a refusal cannot be preventing a lockout, because
// there are 250 free slots; above it every creation is contested.
// DICE_ROOM_GUARD overrides it, read once at boot exactly as DICE_SETUP_TTL_MS
// is and for the same reason: a test cannot stand up 250 live rooms to watch
// one refusal, and a test-only route or query parameter would put a lever on
// the live HTTP surface that exists for nobody but the tests. 0 means "always
// armed"; junk or a negative falls back to the default.
// The empty-string check is not pedantry: `Number('')` is 0, so a var that is
// SET BUT BLANK would otherwise arm the throttle for everyone — the one reading
// of an unset knob that must never happen silently.
const ROOM_CREATE_GUARD = (() => {
  const raw = String(process.env.DICE_ROOM_GUARD ?? '').trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n < 0) return Math.floor(MAX_ROOMS / 2);
  return Math.min(n, MAX_ROOMS);
})();
const roomCreateHits = new Map(); // ip -> {n, min}

// True if this request may mint a new room. FAILS OPEN at every step: below the
// guard, without a usable key, or on any surprise, the answer is yes.
function takeRoomCreateBudget(req) {
  if (rooms.size < ROOM_CREATE_GUARD) return true;
  const key = clientAddr(req);
  if (!key || key === '?') return true; // no address to bound: never refuse
  const min = Math.floor(Date.now() / 60000);
  const hit = roomCreateHits.get(key);
  if (hit && hit.min === min) {
    if (hit.n >= ROOM_CREATE_PER_MIN) {
      // Logged at info, not debug: "why can nobody make a table" is answered by
      // reading the log, and a rule that fires silently is one nobody can
      // verify from the outside (DEPLOY.md says to grep for exactly this).
      log(`room throttled: ${logField('ip', key)} rooms=${rooms.size}`);
      return false;
    }
    hit.n++;
    return true;
  }
  roomCreateHits.set(key, { n: 1, min });
  // Same prune as clientErrorHits: last minute's keys are dead weight.
  if (roomCreateHits.size > 500) {
    for (const [k, v] of roomCreateHits) if (v.min !== min) roomCreateHits.delete(k);
  }
  return true;
}

// WHO-RESUME (docs/IDENTITY.md §5, rung 1): the LAPSED seat this browser key
// may sit back down in, or null.
//
// THE BUG THIS IS THE FIX FOR. The seat is the sole credential — "every
// mutating POST already carries it alone" — and it lived in sessionStorage, so
// its life was one TAB's. Goal 11 hangs a held roll's reveal on a PERSON
// ("revealable by whoever chose it"); the id it actually hung on died first, so
// a held roll could be swept by anybody (U19's departed-roller admission) and
// revealed by nobody, and your own secret rolls dropped out of your own log the
// moment you came back. Handing the SAME playerId back heals every one of those
// without touching a single authority check: reveal, Done, collect, mine-clear
// and projectEntryFor are all bit-for-bit what they were.
//
// NEVER A LIVE SEAT, and the two conditions say different things:
//
//   clients.size === 0   nobody is sitting here NOW. The second tab of a shared
//                        screen is genuinely a second player (js/net.js), and a
//                        stranger who guesses a key must not be able to walk
//                        into an occupied chair. This is the whole security
//                        argument, and it is one comparison.
//   everStreamed         somebody WAS. Without it, a seat between its join and
//                        its EventSource attaching looks identical to a lapsed
//                        one — so a session restore that reopens five tabs of
//                        one room would land two of them on one seat. Arriving
//                        is not lapsing.
//
// Refusal is not an error: no match simply falls through to the ordinary join
// below and the browser gets a fresh seat, exactly as it did before this
// existed. There is nothing here a client can be told "no" to.
//
// AND IT IS ONLY THE FIRST DOOR. This one answers while the seat is still on
// the roster, which is DISCONNECT_GRACE_MS — five seconds, less than one boot
// of this app. takeVacatedSeat is the second door, for the browser that comes
// back after the reap (IDENTITY §8); the difference between them is whether
// the room has been told the seat left.
//
// TWO LAPSED SEATS, ONE KEY (two tabs of one browser, both closed) is a real
// state, so the scan does not stop at the first hit — it keeps the LAST match.
// Map iteration is insertion order, so that is the most recently taken seat,
// which is the one whose held roll the player is coming back for.
function resumableSeatFor(room, who) {
  if (!room || !who) return null;
  let lapsed = null;
  for (const p of room.players.values()) {
    if (p.who === who && p.clients.size === 0 && p.everStreamed) lapsed = p;
  }
  return lapsed;
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
  // `dice.who.v1` (docs/IDENTITY.md §5) — the browser key, read HERE and
  // nowhere else in this file. Trust parity with playerId, which already rides
  // the SSE URL: same class of credential, longer life. Which is exactly why it
  // goes IN and never comes out — see the storage line below and, for the
  // whole rule, IDENTITY's five must-nots.
  const who = cleanString(body.value.who, 64);
  const seat = (seatId && seatRoom ? seatRoom.players.get(seatId) : null)
    || resumableSeatFor(seatRoom, who);
  if (seat) {
    // The JOIN grace, not the disconnect one: this client has not opened its
    // stream yet. scheduleReap never shortens, so the dying tab's late close
    // cannot cut this window down to 5s.
    scheduleReap(seatRoom, seat, JOIN_GRACE_MS);
    // Re-bind the key on every resume, including the seatId one: a browser
    // that minted its key AFTER taking this seat (the boot that shipped this)
    // otherwise holds a seat no key points at, and its next tab-close would
    // still lose the roll it is holding. Reaching this line already required
    // the full credential — the seat id, or a key this seat carries — so
    // nothing is granted here that was not already held.
    if (who) seat.who = who;
    if (seat.name !== name) {
      // The owner's stored name is the truth (js/main.js keeps it in
      // localStorage); a rename that raced the reload lands here.
      seat.name = name;
      broadcast(seatRoom, 'player-renamed', { playerId: seat.id, name });
    }
    // `by=` names the credential that answered: the tab's own seat id, or the
    // browser key falling back for a tab that is gone. One line for both,
    // because it IS one path — but which door opened is the thing a field
    // report or an e2e scenario needs, and it cannot be inferred from anything
    // else in the log.
    log(`resume  ${logField('room', roomName)} ${logField('name', name)} color=${seat.color} players=${seatRoom.players.size} by=${seat.id === seatId ? 'seat' : 'who'}`);
    return sendJson(res, 200, joinSnapshot(seatRoom, seat));
  }

  // The creation throttle (see takeRoomCreateBudget) sits AHEAD of the caps
  // below on purpose: a refused key must not get as far as evictLingeringRoom,
  // or a script that cannot create rooms could still destroy prepared ones.
  if (!rooms.has(roomName) && !takeRoomCreateBudget(req)) {
    return sendError(res, 429, 'too many new rooms from this address — try again in a minute', 'room_rate_limited');
  }

  // Entity caps: an unauthenticated client must not be able to allocate
  // unbounded rooms/players. Lingering rooms (§G6) occupy slots like any
  // other, and give one up rather than let a live table be refused — see
  // evictLingeringRoom. Note the cap is not consulted at all when the room
  // already exists, so REJOINING a lingering room never risks a 503.
  if (!rooms.has(roomName) && rooms.size >= MAX_ROOMS && !evictLingeringRoom()) {
    return sendError(res, 503, 'too many rooms', 'server_full');
  }
  const existing = rooms.get(roomName);
  if (existing && existing.players.size >= MAX_PLAYERS_PER_ROOM) {
    return sendError(res, 503, 'room is full', 'room_full');
  }

  const room = getRoom(roomName);
  // COMING BACK AFTER THE REAP (IDENTITY §8). The roster let this seat go on
  // the ordinary schedule and nothing about that changed — the room saw the
  // departure, and this arrival is a real `player-joined`, not the invisible
  // resume above. What the stub restores is the only thing the reap should
  // never have taken: the seat's IDENTITY. The same playerId means every
  // authority check heals untouched — reveal, Done, collect, mine-clear and
  // projectEntryFor are bit-for-bit what they were, exactly as in rung 1.
  //
  // BELOW the caps, unlike the resume above, and the difference is real: a
  // resume adds no player and a revive does, so a full room refuses it like any
  // other arrival. Capacity is capacity; it is not a judgement about who asked.
  const vacated = takeVacatedSeat(room, seatId, who);
  const player = {
    id: vacated ? vacated.id : crypto.randomUUID(),
    name,
    color: keepColor(room, vacated ? vacated.color : cleanString(body.value.color, 16)),
    pools: [],
    clients: new Set(),
    reapTimer: null,
    reapAt: 0,
    // The browser key that may resume this seat once its tab is gone
    // (resumableSeatFor). ROOM-LOCAL and no more durable than the room itself
    // — goal 7, rooms die whole — and it is present-or-absent so a client
    // cached from before this shipped stores nothing and resumes nothing.
    //
    // NEVER EMITTED. publicPlayers builds its roster field by field and this is
    // not one of them; joinSnapshot/roomSnapshot go through it; no broadcast
    // carries a player object built anywhere else. A credential in a roster
    // payload is a leak with a schema, so the test that matters greps the BYTES
    // a bystander receives (tests/identity.test.mjs, 'who never leaves the
    // front door') rather than trusting this comment.
    // …and on a revive it is re-bound to the key that answered, exactly as the
    // resume path re-binds: a browser that minted its key after taking this
    // seat must not end up holding a seat no key points at.
    ...(who || (vacated && vacated.who) ? { who: who || vacated.who } : {}),
    // Has a stream ever attached here? handleEvents sets it. Lets
    // resumableSeatFor tell a lapsed seat from an arriving one. FALSE on a
    // revive too: this browser has to open a stream again before its seat can
    // be called lapsed, and the stub it came from is already spent.
    everStreamed: false,
  };
  room.players.set(player.id, player);
  // If the client never opens an event stream, forget it again eventually.
  scheduleReap(room, player, JOIN_GRACE_MS);

  if (vacated) {
    // A verb of its own, because it is not the silent path: the room really did
    // see this seat leave and come back. `by=` names the credential that
    // answered and `after=` is the gap it crossed — the one field that says
    // whether RESUME_TTL_MS is sized right, read straight from a field log.
    log(`reseat  ${logField('room', roomName)} ${logField('name', name)} color=${player.color} `
      + `players=${room.players.size} by=${vacated.id === seatId ? 'seat' : 'who'} after=${Date.now() - vacated.at}ms`);
  } else {
    log(`join    ${logField('room', roomName)} ${logField('name', name)} color=${player.color} players=${room.players.size}`);
  }
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
    // then catches a truly-dead peer in ~11 min.
    //
    // Every bound in that sentence is about OUR socket, which is why none of
    // it saved us: behind a proxy the socket's peer is the front end, and the
    // front end is alive and well after the browser has gone. The heartbeat's
    // LIVENESS_TIMEOUT_MS check is what actually covers that case; this stays
    // for the direct-connection deployment, where a cable-yank IS a dead peer.
    res.socket.setKeepAlive(true, 30_000);
  }

  // The stream's identity, minted by the client (net.js openStream). It is
  // what lets POST /api/leave and POST /api/pong name ONE stream: a beacon
  // fired by a closing tab must never be able to drop the stream a reload
  // has already opened, and the two are told apart only by this id. Absent
  // for a pre-liveness cached client — every path that reads it tolerates
  // null and falls back to today's behavior.
  res.diceStream = { id: cleanString(url.searchParams.get('streamId'), 64), lastPong: Date.now() };

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
  // THE ONE BIT THAT SEPARATES A LAPSED SEAT FROM AN ARRIVING ONE (see
  // resumableSeatFor). Set here and never cleared: the question it answers is
  // "was anybody ever sitting here", not "is anybody sitting here now" —
  // clients.size already answers the second one.
  player.everStreamed = true;
  holdPlayer(player);

  // hello fires on EVERY stream (re)open — it is the reconnect path — so its
  // log is projected for this player: a proxy blip must not re-leak what the
  // live broadcast withheld.
  // …and it is the SAME builder /api/join answers with (roomSnapshot), minus
  // the two fields that are about the seat rather than the room. The setup
  // rides it present-or-absent and is on EVERY stream (re)open by design:
  // §G6's re-push heals a restarted room by noticing that hello carries no
  // setup, or a lower rev.
  sendEvent(res, 'hello', roomSnapshot(room, playerId));

  const onClose = () => {
    player.clients.delete(res);
    if (player.clients.size === 0 && room.players.get(playerId) === player) {
      logDebug(() => `reap-armed ${logField('player', player.name)} (stream closed)`);
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

// Find one of a player's open streams by the id its client minted.
const findStream = (player, streamId) =>
  [...player.clients].find((res) => res.diceStream && res.diceStream.id === streamId) || null;

// POST /api/pong {room, playerId, streamId} — the client's half of the
// heartbeat (see LIVENESS_TIMEOUT_MS). Answering is the ONLY thing that keeps
// a stream out of the staleness sweep.
//
// Deliberately the cheapest authenticated endpoint on the server: it moves one
// timestamp and answers 204. It is also the only one that must never make the
// client work harder on failure — an unknown player here means the stream is
// about to fail on its own and the client's existing rejoin path owns that, so
// the honest answer is the error and no side effect. 404 is not retried by
// net.js's pong; nothing here should ever start a rejoin storm.
async function handlePong(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { player } = found;

  const streamId = cleanString(body.value.streamId, 64);
  if (!streamId) return sendError(res, 400, 'streamId is required', 'bad_request');
  const stream = findStream(player, streamId);
  // A pong for a stream we no longer hold means the client is DEAF: it thinks
  // it is streaming, and we will never send it another event. The sweep can
  // create exactly that (so can MAX_STREAMS_PER_PLAYER eviction, and so can a
  // page restored from the back/forward cache holding a connection the proxy
  // kept warm) — and none of those make the client's EventSource error, so
  // nothing else would ever tell it. Saying so here is what closes the loop:
  // net.js reopens the stream on this code. Answering a cheerful 200 would
  // strand the very clients this endpoint exists to keep honest.
  if (!stream) return sendError(res, 404, 'unknown stream', 'unknown_stream');
  stream.diceStream.lastPong = Date.now();
  sendJson(res, 200, { ok: true });
}

// POST /api/leave {room, playerId, streamId?, immediate?} — "I am going", said
// out loud instead of inferred from a socket.
//
// Two callers, two shapes:
//
//   The BEACON (js/main.js pagehide) is soft and names its stream. A closing
//     tab and a reloading tab fire the identical beacon — the browser cannot
//     tell us which it is — so this must never do anything a reload would
//     regret. Dropping the one named stream is exactly right: the reload's
//     fresh stream carries a DIFFERENT id, so a beacon that loses the race and
//     lands after it cannot touch it, and the seat survives on the ordinary
//     grace that a reconnect cancels. Without the id this would be a coin flip
//     between a fast roster and a seat that drops out from under a refresh.
//
//   The GESTURE ('Leave & switch seat', immediate) means it: the seat goes now.
//     Its client has already forgotten the seat, so nothing will resume it, and
//     making the room wait 5 s to watch someone walk away reads as a bug.
//
// A leave for an unknown player/room 404s like any other lookup, which the
// beacon ignores — it is fire-and-forget by construction.
// POST /api/clienterror — a browser telling us it broke (Joe 2026-08-09:
// "no telemetry here has me worried about maintaining this").
//
// It writes to STDOUT and nowhere else. Cloud Run captures stdout, so this is
// searchable with the logs already being kept and adds no store, no file, no
// retention decision and nothing to clean up. Nothing is broadcast — a
// player's crash is not table furniture.
//
// UNAUTHENTICATED, like every other door here (goal 10), which makes it a
// log-spam vector unless it is bounded. Three bounds: the client sends at
// most 12 per session and dedupes repeats, this refuses more than
// CLIENT_ERROR_PER_MIN from one address per minute, and the payload is
// truncated field by field rather than trusted. The last one is the one that
// matters, because the first is advice to a client that may not be ours.
//
// WHAT IT REFUSES TO LOG is as deliberate as what it keeps: no room key (it
// is the table's only access control), no player name, no pool or roll text.
// A stack trace and a user agent are enough to find a bug, and are the most
// that can be taken from a door anyone on the internet can knock on.
const CLIENT_ERROR_PER_MIN = 20;
const clientErrorHits = new Map(); // ip -> {n, min}

async function handleClientError(req, res) {
  const ip = clientAddr(req);
  const min = Math.floor(Date.now() / 60000);
  const hit = clientErrorHits.get(ip);
  if (hit && hit.min === min) {
    if (hit.n >= CLIENT_ERROR_PER_MIN) return sendJson(res, 200, { ok: true }); // silent drop
    hit.n++;
  } else {
    clientErrorHits.set(ip, { n: 1, min });
    if (clientErrorHits.size > 500) {
      for (const [k, v] of clientErrorHits) if (v.min !== min) clientErrorHits.delete(k);
    }
  }

  const body = await readJsonBody(req);
  // A malformed crash report is itself a fact worth one line, but not worth
  // an error response — the client that sent it is already broken.
  if (!body.ok || !body.value || typeof body.value !== 'object') {
    log(`clienterr ${logField('ip', ip)} unparseable`);
    return sendJson(res, 200, { ok: true });
  }
  const v = body.value;
  const f = (k, n) => String(v[k] === undefined || v[k] === null ? '' : v[k]).slice(0, n).replace(/\s+/g, ' ');
  // `ver` is C22's epoch.major.minor — the state model the reporting build
  // reads. It is the field that makes the field log answer "which build wrote
  // the state that broke", which is the question the frozen-mtime bug could
  // not be asked. Truncated like everything else here: it is a claim by an
  // unauthenticated client, not a fact.
  log(`clienterr ${logField('ip', ip)} ${logField('kind', f('kind', 16))} `
    + `${logField('sid', f('sid', 12))} ${logField('ver', f('ver', 16))} `
    + `${logField('up', f('up', 8))}s `
    + `${logField('view', f('view', 12))} ${logField('msg', f('message', 300))} `
    + `${logField('at', `${f('source', 200)}:${f('line', 8)}:${f('col', 8)}`)} `
    + `${logField('ua', f('ua', 200))}`);
  const stack = f('stack', 900);
  if (stack) log(`clienterr ${logField('sid', f('sid', 12))} stack=${stack}`);
  sendJson(res, 200, { ok: true });
}

async function handleLeave(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  if (body.value.immediate === true) {
    removePlayer(room, player, 'left');
    return sendJson(res, 200, { ok: true });
  }

  const streamId = cleanString(body.value.streamId, 64);
  // No id (a client that cannot name its stream) falls back to dropping them
  // all: that is this endpoint's pre-id behavior and still strictly better
  // than waiting on a proxy, because the grace reap a reload cancels is the
  // only thing standing between the two cases.
  const doomed = streamId ? [findStream(player, streamId)] : [...player.clients];
  for (const stream of doomed) if (stream) dropStream(room, player, stream);
  logDebug(() => `leave   ${logField('room', room.name)} ${logField('name', player.name)} (beacon)`);
  sendJson(res, 200, { ok: true });
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
    // Aliased, not cloned: entry.dice is set once at composeRoll (executeRoll)
    // and never mutated after birth — the open-roll branch above already
    // returns `entry` whole, so its dice array is shared identically. Every
    // sink JSON-serializes the projection immediately, so shared references
    // stay wire-invisible. If a future editor introduces a post-birth mutation
    // of entry.dice, restore the clone here AND on the open path, or freeze
    // roll.dice at birth.
    dice: entry.dice,
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
  // A TURN'S BUDGET IS A STAKE, not a value (MECHANICS M2). How many throws
  // a turn has and how many are spent is exactly as public as which dice are
  // on the felt — the table watches them get re-thrown — so it survives
  // redaction while every face stays omitted.
  if (entry.throws) out.throws = entry.throws;
  // A PUSH STATE IS MADE OF VALUES. Which dice scored, what they are worth and
  // whether the throw busted are all read straight off the faces, so a
  // shrouded viewer gets the RULE and nothing else — they can see that this is
  // a push turn and what would score, which is a public stake, and learn no
  // face from it. `held` is refused for push at the door (js/notation.js), so
  // in practice this covers a whisper's non-audience.
  if (entry.push) out.push = { rule: entry.push.rule };
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
    logDebug(() => `evict   ${logField('room', room.name)} rollId=${roll.rollId} seq=${roll.collected}`);
    // Deliberately the same event a per-roll Done sends: aging off the shelf
    // and being dismissed are the same sink animation, so a client needs one
    // code path for both.
    const data = { rollId: roll.rollId };
    broadcast(room, 'roll-cleared', data, (viewerId) => (entryExistsFor(roll, viewerId) ? data : null));
  }
  for (const roll of collected) {
    logDebug(() => `collect ${logField('room', room.name)} rollId=${roll.rollId} seq=${roll.collected}`);
    const data = { rollId: roll.rollId, seq: roll.collected };
    broadcast(room, 'roll-collected', data, (viewerId) => (entryExistsFor(roll, viewerId) ? data : null));
  }
  return collected;
}

// Compose, log, and broadcast a roll for a player from a validated spec.
// Shared by /api/roll and /api/claim so both take the exact same path.
function executeRoll(room, player, spec) {
  // THE DRAW HAPPENS HERE AND NOWHERE ELSE (MECHANICS M6). This is the one
  // function /api/roll and /api/claim both go through, and it holds the
  // crypto rng — so a bag OFFER is drawn when it is CLAIMED, which is the
  // only sensible moment. Drawing in parseRollSpec would fire for
  // /api/offer too and hand out a cup that was emptied when the card was
  // written rather than when someone picked it up.
  const drawn = spec.mods && spec.mods.bag
    ? drawBag(spec.mods.bag, spec.dice.length, rng)
    : null;
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
  // A TURN (MECHANICS M2). Present-or-absent like every field above, so a
  // plain roll's payload stays byte-for-byte what it always was. `used` counts
  // throws taken, so it is 1 the moment the dice land — the first throw is a
  // throw. It rides `roll`, NOT `roll.spec`: the spec is the request that
  // reroll-last replays, and a replayed turn must start its budget over.
  if (spec.mods && spec.mods.throws) {
    roll.throws = { max: spec.mods.throws, used: 1 };
  } else if (spec.mods && spec.mods.push) {
    // PUSH IS A TURN WITH A BIG BUDGET, A BUST RULE AND A BANK VERB
    // (MECHANICS M4). Giving it `throws` is not a trick: a push turn really
    // does throw repeatedly and keep dice between throws, so every line of
    // M2's machinery — the re-throw endpoint, the per-throw film, the kept
    // dice staying put — is already exactly right and gets reused unchanged.
    // What push adds is which faces score, when you have busted, and a way to
    // stop. The cap bounds the felt's lifetime; it is not a rule.
    roll.throws = { max: MAX_PUSH_THROWS, used: 1 };
    // Every die moved on the first throw, so it can bust like any other.
    roll.push = pushStateFor(roll, spec.mods.push, roll.values.map((_, i) => i), []);
  }
  // Dice-set identity (Tier 6 §9): cosmetic, present-or-absent — a plain
  // roll's payload stays byte-for-byte what it always was. It does NOT ride
  // roll.spec: the set belongs to whoever THROWS (reroll-last and a claimed
  // offer wear the actual roller's set, stamped fresh on each request),
  // never to the request being replayed.
  if (spec.set) roll.set = spec.set;
  // Per-die sets (§9 mixed pools): the same cosmetic present-or-absent ride,
  // aligned to the base dice — each die keeps the skin of the pool it left.
  // A DRAW OVERRIDES A SENT `sets`, and handleRoll refuses the combination
  // outright — this is belt and braces on a field that decides the outcome
  // distribution. It does NOT ride roll.spec: spec is the request reroll-last
  // replays, and a draw frozen onto it would make every future ⟳ replay the
  // same draw forever instead of reaching into the cup again.
  if (drawn) roll.sets = drawn;
  else if (spec.sets) roll.sets = spec.sets;

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
    logDebug(() => `roll    ${logField('room', room.name)} ${logField('name', player.name)} dice=${roll.dice.join(',')} vis=${roll.visibility.mode}${tail}`);
  } else {
    logDebug(() => `roll    ${logField('room', room.name)} ${logField('name', player.name)} dice=${roll.dice.join(',')} values=${roll.values.join(',')} total=${roll.total}${tail}`);
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

  // A HELD PUSH IS A CONTRADICTION (MECHANICS M4). `held` is face down for
  // everyone INCLUDING the roller, and push-your-luck is nothing but a series
  // of choices about faces you can see. js/notation.js refuses it in the
  // grammar; this is the EXPLICIT-spec door, which a client can POST straight
  // through without ever writing a notation string. Both, or the refusal is a
  // suggestion.
  const specErr = validateSpec(spec);
  if (specErr) return sendError(res, 400, `invalid roll: ${specErr}`, specErr);

  // THE CATALOGUE, which js/notation.js cannot check: it imports nothing by
  // design, so the grammar judges a bag entry's SHAPE and this judges whether
  // the set exists. Same split as MAX_THROWS, and the same 400 an unknown
  // roll-level set already gets.
  if (spec.mods && spec.mods.bag) {
    for (const b of spec.mods.bag) {
      if (b.set !== 'std' && !SET_IDS.includes(b.set)) {
        return sendError(res, 400, `unknown dice set: ${b.set}`, 'unknown_set');
      }
    }
  }

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
  // A BAG OWNS ITS OWN DRAW (MECHANICS M6). Letting a client send `sets`
  // beside a bag would let it choose which dice came out of the cup, which is
  // goal 8 — values are server-authored, no client can forge a roll — applied
  // to the composition of the pool. The roll-level `set` still rides: it is
  // cosmetic identity and every drawn die's per-die set shadows it anyway.
  if (sets.sets && spec.mods && spec.mods.bag) {
    return sendError(res, 400, 'a bag draws its own dice', 'bag_owns_sets');
  }
  if (sets.sets) spec.sets = sets.sets;

  const roll = executeRoll(room, player, spec);
  // The roller's own response is projected like every other egress: a held
  // roll is face down for its roller too, so even this reply carries no
  // values.
  sendJson(res, 200, { roll: projectEntryFor(roll, player.id) });
}

// The push state after a throw (MECHANICS M4). Everything here is a FACT
// about values this server authored — which dice show a scoring face, what
// the kept ones are worth, and whether the throw busted — so no client has to
// be trusted and no two clients can disagree.
//
// BUST IS ABOUT THE DICE THAT MOVED, not the whole felt: a throw that turns up
// nothing scoring ends the turn, and the dice you had already set aside are
// exactly what you lose. On the first throw every die moved, so a pool that
// comes up with nothing busts immediately, which is the mechanic working.
//
// THE TALLY IS NOT ENFORCED, only reported. A player may keep a die that does
// not score (nothing forbids it) and it adds nothing; a player may un-keep a
// scoring die and the tally drops. Making set-aside permanent would be a game
// rule, and the invariant is that the procedure never plays for you.
function pushStateFor(roll, rule, thrown, kept) {
  const scoring = scoringIndices(roll.values, rule);
  const scoringSet = new Set(scoring);
  const busted = thrown.length > 0 && !thrown.some((i) => scoringSet.has(i));
  return {
    rule,
    scoring,
    tally: busted ? { count: 0, sum: 0 } : pushTally(roll.values, kept, rule),
    busted,
    banked: false,
  };
}

// Re-throw part of a turn (MECHANICS M2, docs/MECHANICS.md).
//
// The one endpoint that gives an existing entry NEW VALUES, which is why its
// rules are stricter than any other mutation here:
//
//   * only the ROLLER may throw again — same authority as collect, and for
//     the same reason: the dice belong to the moment and the person holding
//     them says what happens next. (Reveal's authority is the visibility
//     CHOOSER, which is a different question — who may show a result — and
//     an offered turn's re-throws still belong to whoever is rolling it.)
//   * the budget is the server's. A client that asks for a fourth throw of a
//     t3 turn is refused; nothing about `used` is taken on trust.
//   * `keep` is a set of die INDICES. Everything not kept is re-thrown, so
//     keeping all of them is refused — that is "I am done", which is not a
//     throw and must not spend one.
//   * VISIBILITY BELONGS TO THE TURN, not the throw (MECHANICS Q2, answered
//     by Joe 2026-08-28). A held turn reveals once, at the end; there is no
//     turn whose audience sees throw two but not throw one. So this changes
//     no visibility state at all and every egress runs the same projection —
//     a shrouded viewer learns THAT dice were re-thrown (they can see them
//     move) and never what they came up.
async function handleRethrow(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const rollId = cleanString(body.value.rollId, 64);
  if (!rollId) return sendError(res, 400, 'rollId is required', 'bad_request');

  const roll = room.log.find((r) => r.rollId === rollId);
  // Same existence stance as reveal: a secret roll does not exist for anyone
  // but its roller, not even as a 403.
  if (!roll || !entryExistsFor(roll, player.id)) return sendError(res, 404, 'unknown roll', 'unknown_roll');
  if (player.id !== roll.playerId) {
    return sendError(res, 403, 'only the roller may throw again', 'not_roller');
  }
  if (!roll.throws) return sendError(res, 400, 'this roll is not a turn', 'not_a_turn');
  if (roll.throws.used >= roll.throws.max) {
    return sendError(res, 400, 'no throws left', 'no_throws_left');
  }
  // Off the felt is out of the turn: a collected or cleared roll's dice are
  // gone, and re-throwing dice nobody can see would put values on an entry
  // whose film can never be played.
  if (roll.collected || roll.cleared) {
    return sendError(res, 400, 'this turn is over', 'turn_is_over');
  }
  // A push turn that has busted or banked is finished, whatever the budget
  // says. Its `throws` cap is a bound on the felt, never the end condition.
  if (roll.push && (roll.push.busted || roll.push.banked)) {
    return sendError(res, 400, 'this turn is over', 'turn_is_over');
  }

  const keep = body.value.keep;
  if (!Array.isArray(keep)) return sendError(res, 400, 'keep must be a list of die indices', 'bad_keep');
  const kept = new Set();
  for (const k of keep) {
    if (!Number.isInteger(k) || k < 0 || k >= roll.dice.length) {
      return sendError(res, 400, 'keep holds a die index this roll does not have', 'bad_keep');
    }
    kept.add(k);
  }
  const thrown = [];
  for (let i = 0; i < roll.dice.length; i++) if (!kept.has(i)) thrown.push(i);
  if (!thrown.length) {
    return sendError(res, 400, 'keeping every die is not a throw', 'nothing_thrown');
  }

  roll.values = composeThrow(roll.dice, roll.values, thrown, rng);
  // The total is the sum of the faces plus the modifier, and it can be that
  // simple ONLY because validateMods refuses `throws` alongside every mod
  // that makes a die stop counting (adv/keep/reroll/explode). If that refusal
  // is ever lifted, this line is the first thing that becomes wrong.
  roll.total = roll.values.reduce((a, b) => a + b, 0) + (roll.modifier || 0);
  roll.throws.used += 1;
  if (roll.push) roll.push = pushStateFor(roll, roll.push.rule, thrown, [...kept]);
  // A fresh seed per throw: the film is a function of the seed, and reusing
  // the turn's original one would replay the first throw's tumble.
  // NOT stored on the entry. `thrown` and `seed` describe one throw's film,
  // and a film is watched once — a late joiner gets settled dice and has
  // nothing to replay. Parking them on the entry would broadcast a stale
  // "which dice moved" with every future projection of it.
  const seed = crypto.randomInt(0, 2 ** 32);

  logDebug(() => `rethrow ${logField('room', room.name)} ${logField('name', player.name)} `
    + `rollId=${rollId} throw=${roll.throws.used}/${roll.throws.max} thrown=${thrown.join(',')}`
    + (roll.push ? ` push=${roll.push.busted ? 'BUST' : `${roll.push.tally.count}/${roll.push.tally.sum}`}` : '')
    + (roll.visibility ? ` vis=${roll.visibility.mode}` : ` values=${roll.values.join(',')}`));

  // The event carries the whole projected entry for the same reason reveal
  // does: a client's copy has to become the new truth, and a redacted viewer
  // has no values to patch. `thrown` and `seed` ride OUTSIDE the projection
  // because they are not values — they are which dice moved and how they
  // tumbled, which is exactly what a shrouded viewer is allowed to watch.
  broadcast(room, 'rethrow', { rollId }, (viewerId) => {
    const projected = projectEntryFor(roll, viewerId);
    return projected === null ? null : { rollId, thrown, seed, used: roll.throws.used, roll: projected };
  });
  sendJson(res, 200, { roll: projectEntryFor(roll, player.id) });
}

// BANK (MECHANICS M4). The verb that ends a push turn with what you have.
//
// It exists as a server act rather than a client one for the same reason the
// values do: the tally is a fact about faces this server authored, and a
// client that computed its own would be a client the table has to trust. The
// player chooses WHICH dice they are banking — that is their decision, and the
// invariant says the procedure never makes it — but what those dice are WORTH
// is arithmetic the server does.
//
// There is no auto-bank and there will not be one. A turn that banked itself
// at some threshold would be the app playing.
async function handleBank(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const rollId = cleanString(body.value.rollId, 64);
  if (!rollId) return sendError(res, 400, 'rollId is required', 'bad_request');

  const roll = room.log.find((r) => r.rollId === rollId);
  if (!roll || !entryExistsFor(roll, player.id)) return sendError(res, 404, 'unknown roll', 'unknown_roll');
  if (player.id !== roll.playerId) {
    return sendError(res, 403, 'only the roller may bank', 'not_roller');
  }
  if (!roll.push) return sendError(res, 400, 'this roll is not a push turn', 'not_a_push');
  if (roll.push.busted) return sendError(res, 400, 'a busted turn has nothing to bank', 'already_busted');
  if (roll.push.banked) return sendJson(res, 200, { roll: projectEntryFor(roll, player.id) }); // idempotent

  const keep = body.value.keep;
  if (!Array.isArray(keep)) return sendError(res, 400, 'keep must be a list of die indices', 'bad_keep');
  const kept = [];
  for (const k of keep) {
    if (!Number.isInteger(k) || k < 0 || k >= roll.dice.length) {
      return sendError(res, 400, 'keep holds a die index this roll does not have', 'bad_keep');
    }
    kept.push(k);
  }

  roll.push = {
    ...roll.push,
    tally: pushTally(roll.values, kept, roll.push.rule),
    banked: true,
  };
  log(`bank    ${logField('room', room.name)} ${logField('name', player.name)} `
    + `rollId=${rollId} count=${roll.push.tally.count} sum=${roll.push.tally.sum}`);

  broadcast(room, 'banked', { rollId }, (viewerId) => {
    const projected = projectEntryFor(roll, viewerId);
    return projected === null ? null : { rollId, roll: projected };
  });
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
  log(`reveal  ${logField('room', room.name)} ${logField('name', player.name)} rollId=${rollId} total=${roll.total}`);
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
  // …and, since U19, once its ROLLER HAS LEFT. An uncollected held roll whose
  // roller is gone was immovable: nobody could reveal it (the authority id is
  // ephemeral and no fallback is safe — see below) and nobody could clear it,
  // so it sat on the felt for the rest of the session. Clearing sends dice
  // away; it never discloses a value, so the fail-closed direction is kept
  // while the table gets its felt back.
  //
  // NO AUTHORITY FALLBACK IS INVENTED. Matching a departed authority by SEAT
  // NAME was the obvious fix and is refused: duplicate player names all join
  // (documented, resolveVisibility), so anyone could join under the roller's
  // name and reveal their held rolls. Reclaiming authority needs durable
  // identity, which GOALS defers — the same bet as U3.
  const roller = room.players.get(roll.playerId);
  if (roll.playerId !== player.id && !roll.collected && roller) {
    return sendError(res, 403, 'only the roller may clear their roll', 'forbidden');
  }
  // Idempotent, and deliberately silent: a second Done must not re-broadcast a
  // sink animation at clients that already ran it.
  if (roll.cleared) return sendJson(res, 200, { ok: true });

  // Set on demand, never at roll time: like `exp`, an absent field keeps an
  // uncleared roll's payload byte-for-byte what it always was.
  roll.cleared = true;
  logDebug(() => `clrroll ${logField('room', room.name)} ${logField('name', player.name)} rollId=${rollId}`);
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
  log(`rename  ${logField('room', room.name)} ${logField('name', oldName)} -> ${logField('newName', name)}`);
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

// A DEFAULT dice set — a live player's (/api/pools) or a prepared profile's
// (§G4). Present-or-absent, where ABSENT means the classics: 'std' and unknown
// ids both normalize to absent, because for a default they say the same thing,
// and an id this server cannot validate must not be relayed to the table (§9,
// fail closed). Deliberately NOT sanitizePools' per-POOL rule, which keeps an
// explicit 'std' — there it means "this pool is standard even though its owner
// is not", which is a claim absence cannot make. One helper so the two
// endpoints that publish a default can never drift apart.
function defaultSetOf(raw) {
  const id = cleanString(raw, 64);
  return id && id !== 'std' && SET_IDS.includes(id) ? id : null;
}

// The rolling system a profile was built for (docs/PROFILES.md §11). Present-
// or-absent on the wire, and ABSENT is load-bearing rather than a default: a
// seat prepared before this pass carries a name and pools and nothing else, and
// the receiving client reads absence as "the system of the table you are
// sitting at" — which is the best answer available and the one the arriving
// player is actually about to roll under.
//
// Falls closed on an id this server does not know, like defaultSetOf: the
// enum is the same three-value list SETTING_SPECS.system validates against, so
// a system it cannot name must not be relayed to the table as if it could.
// (The LOUD refusal lives in the file — js/portable.js refuses an unknown
// `system:` at its line, because there a human is standing right there.)
function systemOf(raw) {
  const id = cleanString(raw, 32);
  return id && SYSTEMS.includes(id) ? id : null;
}

// The prepared player profiles of a room's table setup (docs/PROFILES.md
// §3.2 and §11, ROADMAP §G4). A profile is a NAME, a RACK, the SYSTEM it was
// built for and the SKIN it wears — and nothing else (goal 12: this is not a
// character sheet). The system joined the list on 2026-08-08 because a profile
// may only be taken in hand at a table that reads dice the way it was built
// for, and a seat that cannot say which system it belongs to cannot be filtered
// out of a picker where it does not belong. The list is FURNITURE in exactly the
// sense published pools are: the organizer's .dice.yaml file is the truth, the
// room keeps a copy so an arriving player is offered a seat. It is authority
// over nobody's saved pools — §3.3's picker shows the existing import preview
// and applies only on an explicit click — and it carries no roll entries and
// no values, so projectEntryFor remains the ONLY path a roll entry ever leaves
// this server (PROFILES.md §8).
//
// Fail-closed like its neighbours, and the split between DROP and REFUSE is
// deliberate: a per-entry defect is dropped (as sanitizePools drops a pool
// whose notation will not parse), a cap is refused (as every other entity cap
// on this server is).
//
// Names take cleanName, NOT cleanString, and that is the load-bearing line of
// the whole key: a profile name becomes a player's display name, and a display
// name is a whisper address. '#' is banned at every entry point or whisper
// addressing stops being total (GOALS notation-totality invariant, PROFILES
// §8) — a seat whose name is nothing but '#'s cleans to empty and is dropped
// rather than seating someone at an address that silently misdelivers.
//
// Duplicate names collapse to the FIRST, case-insensitively. §3.1's file keys
// profiles by name (`players:` is a mapping), so a duplicate cannot survive an
// honest export; and two identical seats are indistinguishable to the player
// choosing between them.
//
// Returns {error: [...]} or {profiles: [...]}.
function sanitizeProfiles(value) {
  if (value === undefined || value === null) return { profiles: [] };
  if (!Array.isArray(value) || value.length > MAX_PROFILES) {
    return { error: [400, `profiles must be a list of at most ${MAX_PROFILES}`, 'bad_profiles'] };
  }
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const name = cleanName(raw.name, MAX_NAME);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    // An absent pools list is a name-only seat: legal, and useful — it seats a
    // player under the right name with nothing to import. An OVERFLOWING one
    // is a cap, so it refuses: quietly seating a character with pools missing
    // would read as data loss, which is the same call handlePools makes.
    const pools = raw.pools === undefined || raw.pools === null ? [] : sanitizePools(raw.pools);
    if (!pools) {
      return { error: [400, `each profile's pools must be a list of at most ${MAX_POOLS_PER_PLAYER}`, 'bad_pools'] };
    }
    seen.add(key);
    const rec = { name, pools };
    const system = systemOf(raw.system);
    if (system) rec.system = system;
    const set = defaultSetOf(raw.set);
    if (set) rec.set = set;
    out.push(rec);
  }
  return { profiles: out };
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
  // resolve unmarked pools to the owner's skin. See defaultSetOf for why
  // 'std' and unknown ids both normalize to absent — a prepared profile's
  // set (§G4) takes the identical rule from the identical helper.
  const set = defaultSetOf(body.value.set);

  // §11: which profile this rack is, and the system it was built for. The name
  // takes cleanName, NOT cleanString — a profile name becomes a display name
  // the moment a teammate copies it, and '#' is banned at every name door or
  // whisper addressing stops being total (GOALS notation-totality). Both fall
  // closed to absent, and absent is what every client published before today.
  const profile = cleanName(body.value.profile, MAX_NAME);
  const system = systemOf(body.value.system);

  // A no-op publish answers ok without re-broadcasting: the client re-shares
  // on every hello (rejoin safety), and 40 streams need not hear about it.
  const libNow = sanitizeProfiles(body.value.library);
  if (libNow.error) return sendError(res, ...libNow.error);
  if ((player.set || null) === set
      && (player.profile || null) === profile
      && (player.system || null) === system
      && JSON.stringify(player.pools) === JSON.stringify(pools)
      && JSON.stringify(player.library || []) === JSON.stringify(libNow.profiles)) {
    return sendJson(res, 200, { ok: true });
  }
  // THE WHOLE LIBRARY, not just the rack in hand (C17, 2026-08-09). An
  // organizer builds six characters and the table should offer them — with no
  // push, no YAML pane, no explicit "apply". Their library IS the seats.
  //
  // PER-PLAYER, deliberately, and not folded into room.setup: setup carries a
  // rev and a conflict rule because it is ONE shared object, so six players
  // publishing into it would take turns replacing each other's characters.
  // This rides the same shape as `pools` above — a field on the player,
  // broadcast when it changes — which is the shape that already scales to
  // forty streams.
  //
  // Visibility is deliberately WIDE for now (Joe 2026-08-09: "all profiles
  // available for now, we can refine visibility later"), so this publishes
  // every profile the player holds. The narrowing, when it comes, belongs
  // here: one filter, one place.
  player.pools = pools;
  player.library = libNow.profiles;
  if (set) player.set = set; else delete player.set;
  if (profile) player.profile = profile; else delete player.profile;
  if (system) player.system = system; else delete player.system;
  logDebug(() => `pools   ${logField('room', room.name)} ${logField('name', player.name)} count=${pools.length}`);
  broadcast(room, 'pools-changed', {
    playerId: player.id,
    pools,
    library: player.library,
    ...(set ? { set } : {}),
    ...(profile ? { profile } : {}),
    ...(system ? { system } : {}),
  });
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

  logDebug(() => `offer   ${logField('room', room.name)} ${logField('name', player.name)} dice=${offer.dice.join(',')}${offer.dc ? ` dc=${offer.dc}` : ''}${to ? ` ${logField('to', to.name)}` : ''} offers=${room.offers.length}`);
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

  logDebug(() => `claim   ${logField('room', room.name)} ${logField('name', player.name)} offerId=${offerId} ${logField('by', offer.byName)}`);
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
  // §7.7's housekeeping rule, extended to the one case it never covered
  // (U19): an offer whose CREATOR HAS LEFT is table furniture — nobody can
  // withdraw it and it sits on the felt forever. Withdrawing destroys nothing
  // private (the offer is a public invitation, and its spec was public the
  // moment it was made), so anyone may tidy it away once its author is gone.
  // While the creator is still here it stays theirs, unchanged.
  const offerer = room.players.get(room.offers[idx].byId);
  if (room.offers[idx].byId !== player.id && offerer) {
    return sendError(res, 403, 'only the offer creator may rescind it', 'forbidden');
  }
  room.offers.splice(idx, 1);

  log(`unoffer ${logField('room', room.name)} ${logField('name', player.name)} offerId=${offerId}`);
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

  // SCOPE (C7 ②, 2026-08-08). This swept every uncleared roll in the room —
  // the felt plus every shelved roll from every player — with no authority
  // check, on an unmodified `c`, and with no confirmation anywhere in the
  // app. Goal 10 is why ANYONE may tidy the table and that stands; it is not
  // a reason for the only available scope to be "everyone's evening".
  //
  // 'mine' is the ordinary act and stays instant. 'table' is the wider one
  // and the client arms it — but the server does NOT gate it on anything,
  // because gating would be an access control and there are none here (goal
  // 10). The arming is a courtesy to the presser, not a permission.
  const scope = body.value.scope === 'table' ? 'table' : 'mine';
  let swept = 0;
  for (const roll of room.log) {
    if (roll.cleared) continue;
    if (scope === 'mine' && roll.playerId !== player.id) continue;
    roll.cleared = true;
    swept++;
  }

  log(`clear   ${logField('room', room.name)} ${logField('name', player.name)} scope=${scope} swept=${swept}`);
  // The rollIds let a client clear exactly what the server cleared — a
  // scoped sweep cannot be re-derived from `clearTable()` alone, which is
  // why the event now names them.
  const cleared = room.log.filter((r) => r.cleared).map((r) => r.rollId).filter(Boolean);
  broadcast(room, 'clear', { playerId: player.id, playerName: player.name, scope, cleared });
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

// Merge an ALREADY-VALIDATED settings patch into a room and tell everyone.
// Returns the full merged settings object.
//
// Split out of handleSettings because the table setup key (§G4) writes the
// organizer's felt/system/name/zoom through this exact path. PROFILES.md §3.2
// asks for "no second validator for felt", and one commit point is what keeps
// the echo shape, the change diff and the 'settings-changed' broadcast
// identical no matter which endpoint the write arrived on — a parallel writer
// is precisely how "settings echo-apply with no optimistic divergence" rots.
//
// Validation stays a SEPARATE call (validateSettingsPatch) rather than folding
// in here: /api/table must be able to prove the whole push is well-formed
// before it mutates anything, so a rejected profile list never leaves the felt
// already changed.
function commitSettings(room, player, checkedPatch) {
  // Drop keys whose value already matches the room: re-clicking the selected
  // swatch must not broadcast a "changed the table" event that changed nothing.
  const patch = {};
  for (const key of Object.keys(checkedPatch)) {
    if (!sameSetting(room.settings[key], checkedPatch[key])) patch[key] = checkedPatch[key];
  }
  if (Object.keys(patch).length === 0) return { ...room.settings };   // valid no-op

  Object.assign(room.settings, patch);
  const settings = { ...room.settings };

  // A container-valued setting logs its size, not its contents — the server
  // log is an operator's trace, not a dump of every template in the room.
  // logField also quotes string-valued settings (tableName is user text): a
  // rename like tableName='foo felt=crimson' must not look like two settings
  // in the same line.
  const applied = Object.keys(patch).map((k) => logField(k, patch[k])).join(' ');
  logDebug(() => `setting ${logField('room', room.name)} ${logField('name', player.name)} ${applied}`);
  broadcast(room, 'settings-changed', { settings, byId: player.id, byName: player.name });
  return settings;
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

  sendJson(res, 200, { settings: commitSettings(room, player, checked.patch) });
}

// POST /api/table — the room setup key (docs/PROFILES.md §3.2, ROADMAP §G4).
//
// The prepared table: the settings an organizer chose plus the player profiles
// they built, pushed once so that everyone who joins finds the table
// configured and the seats waiting. "The file is the truth, the room is a
// convenience, the link is an address" — this is the convenience, and it is
// deliberately the weakest of the three. It lives and dies with the in-memory
// room — though pushing one now buys that room SETUP_TTL_MS of life after its
// last player leaves (§G6, dropRoomIfEmpty), so closing the tab no longer
// costs the preparation. A restart still does; the file and the client's
// re-push on hello are what cross that.
//
// ANYONE may push it. That is goal 10 compliance ("no roles, ever"), not an
// oversight: a setup is furniture, exactly like the felt colour any player can
// already change, and it grants no power — a player's localStorage stays the
// truth for their own rack, and §3.3's seat picker shows the existing import
// preview and applies only on an explicit click. GOALS §7 records why that
// matters: the `#g=` codec died for replacing a visitor's rack on arrival, and
// a prepared seat that overwrote on arrival would re-commit that sin with
// better manners.
//
// The settings ride the EXISTING path (validateSettingsPatch + commitSettings)
// so there is no second felt validator to drift, and the table hears about
// them on the same 'settings-changed' event a swatch click produces.
// `experiences` is refused outright: §10's editor does not exist, so the key
// would carry nothing, and an endpoint able to smuggle a room-wide template
// set to every client is a wider door than this one needs to be.
//
// THE CONFLICT RULE. A push whose rev does not BEAT the stored one is a silent
// no-op answering 200 {ok:true, applied:false, rev} — not a refusal. Both were
// on the table; the no-op wins for one reason: js/net.js turns every non-404
// error body into a player-visible refusal, and the loser of a two-organizer
// race — or of §G6's re-push-on-hello, where two tabs holding the same file
// both try to heal a restarted room — did nothing wrong. The room already
// holds a setup at least as new as theirs. The error channel stays for pushes
// that are actually malformed. The winning rev comes back either way, so a
// client that lost knows exactly what it has to beat.
//
// The rev guards the push as ONE unit: a stale push applies neither its
// profiles nor its settings. The rev versions the SETUP, not the felt — a
// player who changes the felt by hand afterwards is not fighting the rev, and
// the next winning push simply reconfigures the table again.
async function handleTable(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  // A monotonic counter minted by the pushing client (§G6 keeps it beside its
  // copy of the setup in localStorage). Integer and >= 1: 0 is reserved for
  // "this room has no setup", and a float, a string or a bignum would each
  // compare in ways nobody wants at the guard below.
  const rev = body.value.rev;
  if (!Number.isInteger(rev) || rev < 1) {
    return sendError(res, 400, 'rev must be a positive integer', 'bad_rev');
  }

  // C22'S STAMP, CARRIED AND NEVER MINTED (docs/ROADMAP.md C22, js/schema.js).
  // The setup is client state that happens to rest here: it outlives every
  // client (SETUP_TTL_MS), it is replayed from a browser's localStorage days
  // later (§G6), and the reader is usually a DIFFERENT browser on a different
  // build. So it needs a version — and the version has to name the build that
  // AUTHORED it, which this process is not. A stamp the server minted would
  // read as authoritative while describing nothing a reader needs.
  //
  // What the server does owe is that the field is a STAMP and not a payload:
  // parseStamp (imported, so there is no second regex to drift from
  // js/schema.js) refuses anything that is not three capped integers, and
  // absent is legal — every `dice.table.v1:*` record in the field predates
  // this. The server does NOT judge it: refusing on the server's own numbers
  // would make a rolling deploy reject the setups its own older instances
  // wrote, and the reader that stands to lose data is the client.
  //
  // Checked HERE, beside rev, rather than after the table block: rev and ver
  // are the two facts ABOUT the blob, they are the two cheapest things in the
  // request, and grouping them means a junk stamp always answers `bad_ver`
  // instead of whichever validator downstream happened to fire first.
  const ver = body.value.ver;
  if (ver !== undefined && ver !== null && ver !== '') {
    if (typeof ver !== 'string' || !parseStamp(ver)) {
      return sendError(res, 400, 'ver must be a version stamp like 2.0.0', 'bad_ver');
    }
  }

  // Validate EVERYTHING before mutating anything — this is why the settings
  // path is split into validate + commit rather than called whole. A push with
  // a good felt and a bad profile list must leave the table exactly as it was.
  const table = body.value.table;
  let patch = null;
  if (table !== undefined && table !== null) {
    if (typeof table !== 'object' || Array.isArray(table)) {
      return sendError(res, 400, 'table must be an object', 'bad_setting');
    }
    // Own-key check: JSON.parse makes real own keys, so this sees what
    // validateSettingsPatch would have seen.
    if (Object.hasOwn(table, 'experiences')) {
      return sendError(res, 400, 'table setup does not carry experiences', 'bad_setting');
    }
    // An EMPTY table block is legal here, where /api/settings refuses one:
    // there an empty patch is the entire request and means nothing; here it
    // is an honest profiles-only push (seats prepared, felt left alone).
    if (Object.keys(table).length > 0) {
      const checked = validateSettingsPatch(table);
      if (checked.error) return sendError(res, ...checked.error);
      patch = checked.patch;
    }
  }

  const checked = sanitizeProfiles(body.value.profiles);
  if (checked.error) return sendError(res, ...checked.error);
  const { profiles } = checked;

  // Last write wins, guarded by rev — see THE CONFLICT RULE above.
  if (room.setup && rev <= room.setup.rev) {
    return sendJson(res, 200, { ok: true, applied: false, rev: room.setup.rev });
  }

  if (patch) commitSettings(room, player, patch);

  // Stored as PUSHED (validated), not as merged. room.settings is the live
  // truth for what the table looks like now and already rides hello/join; this
  // is the record of what the setup DECLARED, so the organizer's intent is
  // still legible after someone else swaps the felt mid-session.
  // `ver` sits beside `rev` — both are facts ABOUT this blob rather than
  // content in it — and is omitted rather than nulled when the push carried
  // none, so judgeStamp's absent-means-oldest path is what a pre-stamp record
  // reaches on the far side (js/main.js adoptRoomSetup).
  room.setup = {
    rev,
    ...(typeof ver === 'string' && ver ? { ver } : {}),
    table: patch ? { ...patch } : {},
    profiles,
    at: Date.now(),
  };

  log(`table   ${logField('room', room.name)} ${logField('name', player.name)} rev=${rev} ${logField('profiles', profiles)}`);
  broadcast(room, 'table-setup', { setup: room.setup, byId: player.id, byName: player.name });
  sendJson(res, 200, { ok: true, applied: true, rev });
}

// GET /api/table?room=NAME — the pre-join peek (ROADMAP §G5, and §2k's
// standing follow-up: "join modal shows the table name pre-join").
//
// The seat picker's ordering problem is that the join flow prompts for a name
// BEFORE joining, and everything a client knows about a room arrives in the
// join response — so the modal that needs the prepared seats is on screen at
// the one moment the client cannot have them. This endpoint is the answer:
// public, read-only, no playerId, answering just enough to draw the picker.
//
// The projection is written out field by field ON PURPOSE — never a spread of
// room.setup — because this is the only unauthenticated read on the server
// and its budget is exactly: the table's display name, its rolling system, the
// prepared seat names, and a pool count and system per seat. No players, no
// roster, no log, no offers, no settings beyond those two, no notations, no
// rev. A seat name and a table name are what an invite link's recipient was
// going to see two clicks later anyway; nothing else here is.
//
// THE SYSTEM WAS ADDED 2026-08-08 (§11) and it earns its place on the same
// test. A player may only take a profile in hand at a table that reads dice the
// way it was built for (Joe's R5), and the picker that offers the choice paints
// BEFORE the join — so without the system here the modal would have to filter
// against a guess and correct itself after the seat landed, which is a silent
// swap wearing a spinner. What it discloses is one of three enum values naming
// a rulebook: no user text, no cardinality, nothing to redact, and every
// joiner receives it in `hello` seconds later. It is strictly less revealing
// than tableName, which already ships.
//
// It is also STALE BY CONSTRUCTION, and that is fine: any player may flip the
// system between this read and the join (goal 10). The client's answer is not
// to trust it — it is that a mismatch is labelled and nothing is ever swapped
// without a click, so a stale peek costs a re-pick, never a rack.
//
// rooms.get, NEVER getRoom: a peek must not create a room (any crawler
// guessing ?room= values would mint rooms toward MAX_ROOMS), and it must not
// touch a lingering room's TTL — the timer measures "nobody is here", and
// someone looking at the door is not someone at the table. An unknown,
// unprepared or unnamed room all answer 200 {} rather than an error: to the
// picker they mean the same thing (nothing to offer, show the plain prompt),
// and a 404 would make the client's failure path load-bearing for the
// ordinary case.
function handleTableInfo(req, res, url) {
  const roomName = cleanString(url.searchParams.get('room'), MAX_ROOM);
  if (!roomName) return sendError(res, 400, 'room is required', 'bad_request');
  const room = rooms.get(roomName);
  const out = {};
  if (room) {
    const name = room.settings.tableName;
    if (typeof name === 'string' && name) out.name = name;
    out.system = room.settings.system;
    // TWO SOURCES, ONE LIST (C17). A table offers the characters a file
    // PREPARED it with (room.setup — survives everyone leaving, for
    // SETUP_TTL_MS) and the characters the players actually AT it are
    // holding (their published libraries — zero effort, gone when they go).
    // The organizer needs no push for the second: they built six characters
    // and sat down, so the table offers six.
    //
    // Setup wins a name collision: it was chosen deliberately for this table,
    // and a live library is whatever somebody happens to be carrying.
    const seats = [];
    const seen = new Set();
    // `from` is WHOSE character this is (2026-08-09). A profile you did not
    // build must say who did, everywhere it appears — the picker at the door
    // and the switcher over the rack alike — because taking one COPIES it,
    // and a copy you did not know you were making is the `#g=` mistake with
    // better manners. Absent for a file-prepared seat: it belongs to the
    // table, not to a person who is standing here.
    const add = (name, pools, system, from) => {
      const key = String(name).toLowerCase();
      if (!name || seen.has(key)) return;
      seen.add(key);
      seats.push({ name, pools, ...(system ? { system } : {}), ...(from ? { from } : {}) });
    };
    if (room.setup && Array.isArray(room.setup.profiles)) {
      for (const p of room.setup.profiles) {
        // Per seat as well as per room: a seat prepared for another system is
        // one the picker must not offer here, and deriving that from the room's
        // own system would only be true while nobody had flipped it since the
        // push. Absent on a seat prepared before §11.
        add(p.name, Array.isArray(p.pools) ? p.pools.length : 0, p.system);
      }
    }
    for (const pl of room.players.values()) {
      for (const p of pl.library || []) {
        add(p.name, Array.isArray(p.pools) ? p.pools.length : 0, p.system, pl.name);
      }
    }
    if (seats.length) out.seats = seats;
  }
  sendJson(res, 200, out);
}

// POST /api/split — sub-tables (ROADMAP §3b L4, CUJS.md CUJ5).
//
// "We need to split into two groups for a bit, then come back." A breakout is a
// second table with its own felt, its own log and its own seats, plus two
// pieces of wiring: the parent LISTS it, and it carries a way BACK.
//
// ONE ROUTE, TWO ENDS, because a split has two ends and each is authorized
// where it happens. You register a child while seated at the PARENT; you
// declare a parent while seated at the CHILD. Both are `lookup`-gated on a live
// seat in `room` and nothing more — no roles, ever (goal 10). Exactly one of
// `child` / `parent` may be present; both or neither is a malformed request.
//
//   {room, playerId, child, childName}         — "this table has a breakout"
//   {room, playerId, parent, parentName, settings} — "this table is a breakout"
//
// THIS ENDPOINT CREATES NO ROOM, and that is deliberate rather than incidental.
// The child room is minted by the splitter's ordinary /api/join when they walk
// into it, through the ordinary door, under the ordinary MAX_ROOMS cap and the
// ordinary creation throttle (takeRoomCreateBudget). So there is no second
// allocation path around §0j's rule and no split-shaped exemption to reason
// about. A split-specific allowance would be WEAKER than the general one
// anyway: joining a room that exists is never throttled, so anyone could mint
// themselves a seat and then spend a "trusted" budget from inside it.
//
// THE POINTER IS A KEY, NOT A HANDLE, and the whole orphan question falls out
// of that. Nothing here holds a reference to another room object, watches one
// die, or writes across rooms. `parent.room` is a `?room=` value — a door. When
// the parent's room object is gone (its last player left, or its linger
// expired), following it walks into a room with that key, freshly created, the
// same way any invite link does. So "return to the main table" keeps working
// forever, and there is no dangling state for a reaper to clean up. What DOES
// end with the parent is its directory (see lingerRoom): a list of the
// breakouts running off this table is live state in exactly the sense the
// roster is (GOALS: "presence is asserted, never inferred"), and a server that
// has forgotten the table cannot assert it. The way back into a breakout you
// personally walked into survives client-side, in your own recents.
//
// ONE LEVEL. A table that already has a parent may not register children
// (403 already_a_subtable). The verb is "split, then come back", and the way
// back is THE main table, singular; a chain of parents is a navigation
// structure and building one is what goal 12 refuses. It also keeps the
// directory's meaning exact — "the breakouts of this table", never "somewhere
// in a tree below it".
async function handleSplit(req, res) {
  const body = await readJsonBody(req);
  if (!body.ok) return sendError(res, 400, body.reason, 'bad_request', { close: body.close });

  const found = lookup(body.value);
  if (found.error) return sendError(res, ...found.error);
  const { room, player } = found;

  const hasChild = Object.hasOwn(body.value, 'child');
  const hasParent = Object.hasOwn(body.value, 'parent');
  if (hasChild === hasParent) {
    return sendError(res, 400, 'exactly one of child / parent is required', 'bad_request');
  }
  // Both keys take the same trip every ?room= value takes (cleanString/MAX_ROOM),
  // so a key that survives here is one /api/join would accept byte-identical —
  // the property js/tables.js's minted key was verified against.
  const other = cleanString(hasChild ? body.value.child : body.value.parent, MAX_ROOM);
  if (!other) return sendError(res, 400, 'a room key is required', 'bad_room');
  // A table is not its own breakout. Left un-refused this is a link that leads
  // to where you already are, which reads as a broken door rather than a no-op.
  if (other === room.name) return sendError(res, 400, 'a table cannot split to itself', 'bad_room');

  // Names ride the tableName normalizer, not a second cleaner: a directory row
  // and the table's own plate must cut identically or the same table wears two
  // spellings on two screens. '' is legal and means unnamed — the client falls
  // back to the key, exactly as the recents list does.
  const sentLabel = hasChild ? body.value.childName : body.value.parentName;
  const label = sentLabel === undefined || sentLabel === null
    ? '' // an unnamed breakout is as legal as an unnamed table
    : SETTING_SPECS.tableName.normalize(sentLabel);
  if (label === null) return sendError(res, 400, 'invalid table name', 'bad_setting');

  if (hasChild) {
    if (room.parent) {
      return sendError(res, 403, 'a breakout cannot split again', 'already_a_subtable');
    }
    const already = room.children.find((c) => c.room === other);
    if (already) {
      // Idempotent. Two players pressing Split on the same key, or one client
      // retrying after a dropped response, is not an error and must not append
      // a twin — the loser of that race did nothing wrong (/api/table's rule).
      return sendJson(res, 200, { ok: true, applied: false, children: room.children });
    }
    if (room.children.length >= MAX_CHILDREN) {
      return sendError(res, 400, `a table lists at most ${MAX_CHILDREN} breakouts`, 'too_many_subtables');
    }
    room.children = [...room.children, { room: other, name: label, at: Date.now() }];
    log(`split   ${logField('room', room.name)} ${logField('name', player.name)} ${logField('child', other)}`);
    broadcast(room, 'table-split', {
      parent: room.parent, children: room.children, byId: player.id, byName: player.name,
    });
    return sendJson(res, 200, { ok: true, applied: true, children: room.children });
  }

  // The child half. FIRST WRITER WINS, and only before the table has started.
  //
  // Two guards, and they are different questions. `room.parent` already set:
  // somebody got here first and nobody may re-parent a table out from under
  // them. A table with a LOG or a SETUP: it has already been played at or
  // prepared, so it is its own table now, and letting a late arrival hang a
  // parent (and a felt) on it would be a stranger redecorating a game in
  // progress. Neither is an error to the caller — a client that lost simply has
  // nothing to do, so both answer 200 applied:false naming the parent that
  // stands, exactly as a losing /api/table push does.
  if (room.parent || room.log.length || room.setup) {
    return sendJson(res, 200, { ok: true, applied: false, parent: room.parent });
  }

  // THE INHERITANCE (open question 1, decided: yes — a breakout is the same
  // game). It arrives as an ordinary settings patch from the client that is
  // sitting at the parent, and goes through the ordinary validate + commit
  // pair, so there is no second validator and no cross-room read: this server
  // never looks inside a room the caller has not joined. It grants no new power
  // either — the same player could POST /api/settings a moment later — it just
  // makes the felt land WITH the pointer instead of a beat after it.
  //
  // tableName is the one setting refused (same shape as /api/table refusing
  // `experiences`): a breakout names ITSELF, and inheriting "Vault Heist" onto
  // the room you split off from Vault Heist is how you get two tables nobody
  // can tell apart in a recents list.
  let patch = null;
  if (body.value.settings !== undefined && body.value.settings !== null) {
    const checked = validateSettingsPatch(body.value.settings);
    if (checked.error) return sendError(res, ...checked.error);
    if (Object.hasOwn(checked.patch, 'tableName')) {
      return sendError(res, 400, 'a breakout names itself', 'bad_setting');
    }
    patch = checked.patch;
  }

  room.parent = { room: other, name: label };
  if (patch) commitSettings(room, player, patch);
  log(`subtable ${logField('room', room.name)} ${logField('name', player.name)} ${logField('parent', other)}`);
  broadcast(room, 'table-split', {
    parent: room.parent, children: room.children, byId: player.id, byName: player.name,
  });
  return sendJson(res, 200, { ok: true, applied: true, parent: room.parent });
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

// GET /health — what is running here, and is it coping (ROADMAP §0j).
//
// The question it exists to answer is "which commit is live", asked from a
// phone with curl. Before this there was no way to answer it except by
// triggering known behavior and inferring, which is the position the
// frozen-mtime bug left this project in for a whole debugging session.
//
// WHAT IT DISCLOSES, AND WHY EACH FIELD IS SAFE. Goals 7 and 12 bind: the
// server holds no persistent state and is not a place anyone's data lives, and
// nothing here may leak what little it holds in memory. So:
//   * `sha` / `node` / `uptimeSec` — facts about the BINARY, not about anyone.
//   * `rooms` / `players` / `streams` / `rssMb` — CARDINALITIES. Counts name
//     nobody: not a room key (which is the table's only access control, goal
//     10 — a leaked name is a leaked door), not a player name, not a roll, not
//     a log line, not a setting, not an address. There is no field here from
//     which any of those can be reconstructed.
//   * `maxRooms` — the denominator the numerator is useless without; it is the
//     number that decides whether a `server_full` report is real.
// It is deliberately NOT a room listing. `/admin/rooms behind a shared secret`
// is a separate §0j nice-to-have precisely because it would disclose keys, and
// that is the line this endpoint stays on the safe side of.
//
// UNAUTHENTICATED, like every other door (goal 10) — a health check that needs
// a secret is one the operator cannot run from wherever they happen to be. It
// is a bounded, allocation-free read, so it is not a lever worth throttling:
// the walk below is O(players) over caps of 500 × 40, and `sendJson` already
// sends `no-store` so no proxy can serve a stale answer as a fresh one.
function handleHealth(req, res) {
  let players = 0;
  let streams = 0;
  for (const room of rooms.values()) {
    players += room.players.size;
    for (const player of room.players.values()) streams += player.clients.size;
  }
  sendJson(res, 200, {
    ok: true,
    sha: GIT_SHA,
    node: process.versions.node,
    uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
    rooms: rooms.size,
    maxRooms: MAX_ROOMS,
    players,
    streams,
    rssMb: Math.round(process.memoryUsage.rss() / (1024 * 1024)),
  });
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

// /vendor/ is the frozen third-party tree (three.js, cannon-es) — CLAUDE.md
// forbids editing it, so it is safe to serve with a year-long immutable
// Cache-Control and let repeat visits skip the round-trip entirely. The
// escape hatch for an emergency vendor hotfix (CVE, physics-truth regression)
// is to bump a query string on the importer in js/main.js OR rename the file;
// a plain server-side revert alone will NOT recover already-cached clients
// for up to a year. See ROADMAP.md §0b.
const VENDOR_DIR = path.join(ROOT, 'vendor');
function isVendor(absPath) {
  return absPath === VENDOR_DIR || absPath.startsWith(VENDOR_DIR + path.sep);
}

// WHAT IS THE APP, AND WHAT IS MERELY IN THE DIRECTORY (C29).
//
// The rule was "the file exists" where it wanted to be "the file is part of the
// app". safeResolve below stops traversal and every DOTFILE, and that is the
// whole of what it stopped: `.git/config` and `.git/HEAD` 403, and everything
// else under ROOT was served — `GET /server.js` returned this file, 200, and so
// did `/package.json` and every `.mjs` under `tests/` and `tools/`, half a
// megabyte of `scenarios.mjs` among them.
//
// TWO CLAIMS IN ROADMAP C29 ARE WRONG, measured against the pre-allowlist
// server on 2026-08-14 and worth recording because they are the reason this
// looked smaller than it was:
//   * "`Makefile` and `docs/*.md` 404 because their extensions are not in
//     MIME" — they did not. There is no MIME-based refusal anywhere;
//     streamFile falls back to `application/octet-stream`, so `/Makefile`,
//     `/CLAUDE.md`, `/docs/ROADMAP.md`, `/LICENSE` and `/gpu-trace.csv` all
//     returned 200 with their real bytes.
//   * "no credential or config exposure, verified path by path" — the file it
//     names, `.deploy.config`, does not exist in this repo. The real one is
//     `deploy/config.mk` (PROJECT, BILLING_ACCOUNT, DOMAIN), it has no
//     dot-prefixed segment, and `GET /deploy/config.mk` returned 200 with the
//     billing account in the body. Production never had it — `.gcloudignore`
//     drops `deploy/` from the upload — but every local `node server.js`,
//     including the preview table, served it to anything that could reach the
//     port. Pinned in tests/static-cache.test.mjs.
//
// AN ALLOWLIST OF ROOTS, NOT A DENYLIST OF NAMES. A denylist grows a new entry
// every time a directory is added and is silently wrong until someone notices —
// the same failure shape as C28's stand-in constants. An allowlist's failure is
// a 404 on something the page needs, which is loud, immediate, and covered by
// the test below.
//
// The list was derived by reading index.html and grepping every origin-relative
// path the client and the tooling fetch (2026-08-14) — not guessed:
//   index.html      css/style.css, js/main.js, js/report.js, and the importmap's
//                   two vendor modules; js/main.js reaches models/towers/*.glb.
//   lab.html        the dice lab, dev chrome rather than player UI — but
//                   `tools/lab-shots.mjs`, `tools/geo-bench-shots.mjs` and one
//                   e2e scenario all navigate the served origin to it, so it
//                   stays servable. It only loads js/ and vendor/, which are
//                   public anyway, so serving it discloses nothing new.
//   chrome-lab.html the 2D counterpart (tools/README §), which iframes
//                   index.html. `.gcloudignore` already keeps it out of the
//                   deployed image; this keeps it working locally.
//   tests/e2e/fixtures/  the harness fetches tower_fixture.glb THROUGH THE PAGE
//                   ORIGIN (the tower-glb-loader scenario), so a 404 here is a
//                   red suite. Inert in production: `.gcloudignore` excludes
//                   tests/ entirely, so the path is simply absent there.
// Everything else — server.js, package.json, README.md, LICENSE, Makefile,
// docs/, tools/, tests/*.mjs — 404s. Nothing in js/ or index.html fetches any
// of them; verified, so narrowing costs nothing today.
//
// 404 rather than 403, because "forbidden" would confirm the file exists.
const APP_DIRS = ['js', 'css', 'vendor', 'models', 'tests/e2e/fixtures']
  .map((rel) => path.join(ROOT, ...rel.split('/')));
const APP_FILES = new Set(['index.html', 'lab.html', 'chrome-lab.html']
  .map((rel) => path.join(ROOT, rel)));

// Rides the RESOLVED absolute path, never the URL — the same reason isVendor
// does: %2f and non-canonical spellings must not be able to smuggle a path past
// the gate that the filesystem then honors.
function isAppPath(absPath) {
  if (APP_FILES.has(absPath)) return true;
  return APP_DIRS.some((dir) => absPath === dir || absPath.startsWith(dir + path.sep));
}

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
  if (!isAppPath(file)) return sendError(res, 404, 'not found', 'not_found');

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

// THE VALIDATOR IS A CONTENT HASH, NOT A TIMESTAMP (2026-08-09).
//
// This served `Last-Modified` from the file's mtime, and on Cloud Run that is
// a catastrophe rather than an inefficiency: Cloud Native Buildpacks NORMALIZE
// every file's mtime to 1980-01-01 so builds are reproducible. So the
// validator was byte-identical in every deploy, forever — a browser holding
// `If-Modified-Since: Tue, 01 Jan 1980` got **304 Not Modified** no matter how
// many times the app shipped, and served its cached copy until someone cleared
// site data by hand.
//
// It was found from the field, by the crash reporting added the same day: a
// phone reporting `document.getElementById('profile-save')` is null at
// main.js:10402 — an element that had not existed for weeks. A NEW index.html
// against a MONTHS-OLD main.js, which is the shape this bug makes. Incognito
// worked because its cache was empty; the main profile was pinned.
//
// An ETag over the bytes cannot have that failure: it changes when and only
// when the content does, and it does not care what a build system did to the
// clock. Hashed once per file per process and cached — the app tree is a few
// dozen files and a restart is the only thing that invalidates it.
const etagCache = new Map(); // absolute path -> {size, mtimeMs, tag}
function etagFor(file, stat) {
  const hit = etagCache.get(file);
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.tag;
  let tag;
  try {
    tag = `"${crypto.createHash('sha1').update(fs.readFileSync(file)).digest('base64url').slice(0, 27)}"`;
  } catch {
    // Unreadable here means the stream below will fail too; fall back to a
    // validator that is at least unique per process rather than per epoch.
    tag = `"p${PROCESS_TAG}-${stat.size}"`;
  }
  etagCache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, tag });
  return tag;
}
const PROCESS_TAG = Math.random().toString(36).slice(2, 10);

function streamFile(req, res, file, stat) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  // /vendor/ is immutable (see VENDOR_DIR comment above); the app tree stays
  // no-cache so the browser always revalidates — the win there is answering
  // that revalidation with a body-less 304 instead of a full 200. The gate
  // rides the RESOLVED absolute path (not the URL) so %2f / non-canonical
  // smuggling can't reach the vendor bucket.
  const cacheControl = isVendor(file) ? 'public, max-age=31536000, immutable' : 'no-cache';
  const etag = etagFor(file, stat);
  // If-None-Match beats If-Modified-Since when both are sent (RFC 9110), and
  // it is the only one this answers now. `Last-Modified` is deliberately NOT
  // sent: a header a build system freezes is a validator that lies, and one
  // absent header is safer than two that disagree.
  const inm = req.headers['if-none-match'];
  if (inm && inm.split(',').some((t) => t.trim() === etag || t.trim() === `W/${etag}`)) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
    return res.end();
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    ETag: etag,
    'Cache-Control': cacheControl,
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
    // First in the chain, and outside /api/, on purpose: the one route whose
    // job is to answer when everything else is in doubt should not depend on
    // how the rest of the table is routed today. HEAD works too — Node drops
    // the body for a HEAD response itself — so `curl -I` is a liveness probe.
    if (route === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      return handleHealth(req, res);
    }
    if (route === '/api/join' && req.method === 'POST') return handleJoin(req, res);
    if (route === '/api/events' && req.method === 'GET') return handleEvents(req, res, url);
    if (route === '/api/pong' && req.method === 'POST') return handlePong(req, res);
    if (route === '/api/clienterror' && req.method === 'POST') return handleClientError(req, res);
    if (route === '/api/leave' && req.method === 'POST') return handleLeave(req, res);
    if (route === '/api/roll' && req.method === 'POST') return handleRoll(req, res);
    if (route === '/api/rethrow' && req.method === 'POST') return handleRethrow(req, res);
    if (route === '/api/bank' && req.method === 'POST') return handleBank(req, res);
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
    if (route === '/api/table' && req.method === 'POST') return handleTable(req, res);
    if (route === '/api/table' && req.method === 'GET') return handleTableInfo(req, res, url);
    if (route === '/api/split' && req.method === 'POST') return handleSplit(req, res);
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

// ROADMAP §0i: die loudly rather than limp. An unhandled exception leaves the
// process in an unknown state — half-torn-down streams, a room mutated
// mid-write — and Node's default for an unhandled rejection is already to
// terminate. Exiting non-zero lets Cloud Run's supervisor restart us cleanly,
// and js/net.js re-joins every client silently across a restart (DEPLOY.md),
// so the visible cost is one blip. The log line is the whole diagnostic, so it
// prints the stack before the exit. Only armed when we own the process: the
// redaction suite imports this module in-process (IS_MAIN false) and must not
// have its own test failures turned into a process exit.
if (IS_MAIN) {
  process.on('uncaughtException', (err) => {
    try { log(`FATAL uncaughtException — exiting: ${err && err.stack ? err.stack : err}`); } catch { /* ignore */ }
    process.exit(1);
  });
}

export { server, DIE_TYPES, PALETTE, FELT_THEMES, SYSTEMS, projectEntryFor, resolveVisibility, entryExistsFor, entryExistsForAll, cleanName, sanitizePools, sanitizeProfiles, MAX_PROFILES, LOG_DEBUG, LOG_INFO, LOG_THRESHOLD };
