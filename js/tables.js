/*
 * Copyright 2026 The Dice Table Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// js/tables.js — the lobby's "tables you have visited" list (UX §7.20,
// ROADMAP §3b L1/L3), and the mint for a NEW table's room key.
//
// CLIENT-SIDE BY RULING (§3b: "no public global tables"). The lobby lists
// only what THIS browser has walked into — the server never publishes a
// directory of live rooms, because with no access control (goal 10) a listed
// table is a walk-in-able table. So the whole store is one localStorage key,
// and this module is its only reader and writer.
//
// The store fails CLOSED on hostile input, entry by entry, exactly the way
// main.js's migrateGroup treats pools: an entry that is not shaped right is
// dropped, never guessed at, and never takes the rest of the list down with
// it. localStorage itself may be absent, full, or poisoned — every touch is
// wrapped, and the worst case is always "no recents", never a throw (the
// lobby must render on a browser that has nothing).
//
// Order is maintained on WRITE, not re-derived on read: rememberTable moves
// the visited table to the front, so the stored order IS newest-first. The
// reader validates shape and dedups but respects the order it finds — a
// hand-edited `at` can lie about a timestamp, but it cannot pin an entry to
// the top of the list.
//
// THE MINTED KEY IS THE DOOR. This app has no access control and never will
// (goal 10), so the only thing standing between a game in progress and any
// stranger holding the deployment's URL is the `?room=` key itself —
// server.js's table-info endpoint already worries about crawlers guessing
// them. A key derived from the table's name alone ("?room=soulseal") would
// be no door at all. mintRoomKey therefore appends 16 base36 characters from
// crypto.getRandomValues — 16 × log2(36) ≈ 82.7 bits, drawn by rejection
// sampling so no character is favored — after a readable slug of the name.
// The slug is a courtesy for humans reading invite links; the random tail is
// the security, and it is the same size whether or not a slug survives.
//
// There is deliberately NO fallback when crypto.getRandomValues is missing:
// Math.random is guessable, and a guessable key is worse than no key. Every
// environment this app supports (browsers; Node ≥ 22 for the tests) has it.
//
// WHAT THE MINTED KEY WAS VERIFIED AGAINST: server.js takes every ?room=
// value through cleanString(room, MAX_ROOM) with MAX_ROOM = 64 — stripCtl
// (controls, zero-width, bidi marks) then cutText (trim → slice(0, 64) →
// unpaired-surrogate guard → trim), empty ⇒ refused. A minted key is
// [a-z0-9-] only: nothing for stripCtl to strip, nothing for trim to cut, no
// surrogates, and at most 24 (slug) + 1 (hyphen) + 16 (random) = 41 chars —
// under the 64 cap, so the server accepts it byte-identical. Every character
// is also RFC 3986 unreserved, so encodeURIComponent is the identity on it.

import { cutText } from './notation.js';

// Deliberate copy of js/notation.js's module-private stripCtl (server.js and
// js/rollspec.js carry the same copy; this is the fourth — all must stay
// identical): controls plus the zero-width and bidi ranges, invisible in
// rendered text and able to spoof what a recents row shows.
const stripCtl = (t) => t.replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');

const LS_TABLES = 'dice.tables.v1';

// 8 — a lobby row's worth of recents. The list must stay short to stay
// honest: an unprepared room dies when its last player leaves and even a
// prepared one lingers only 12 hours (server.js SETUP_TTL_MS), so a deep
// archive would be mostly dead doors. Eight is a screenful, and eviction is
// by age — the table you visited longest ago is the one most likely gone.
const MAX_TABLES = 8;

// Mirrored from server.js (no import: server.js is neither a browser module
// nor loadable here — the same reason portable.js mirrors SETTING_SPECS).
const MAX_ROOM = 64;       // server.js MAX_ROOM: cleanString cap on ?room=
const MAX_TABLE_NAME = 28; // SETTING_SPECS.tableName's cap (portable.js agrees)

// trim → cut → trim, surrogate-safe, exactly as every other layer cuts user
// text. '' means "nothing usable" — callers treat it as absent.
const cleanRoom = (v) => (typeof v === 'string' ? cutText(stripCtl(v), MAX_ROOM) : '');
const cleanName = (v) => (typeof v === 'string' ? cutText(stripCtl(v), MAX_TABLE_NAME) : '');

// ---------------------------------------------------------------------------
// Storage — self-contained guards (main.js's load/save are not importable,
// and this module must also run under plain Node for its unit test, where
// localStorage may not exist at all; the bare reference throwing is exactly
// what the try/catch is for)
// ---------------------------------------------------------------------------

function readList() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_TABLES));
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function writeList(list) {
  try { localStorage.setItem(LS_TABLES, JSON.stringify(list)); } catch { /* ignore */ }
}

// One stored entry, fallen closed (the migrateGroup discipline): anything not
// shaped {room: nonempty string, name: string, at: finite ms} is null, and
// null is dropped by the caller — one bad entry never spoils the list.
function migrateEntry(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const room = cleanRoom(e.room);
  if (!room) return null;
  if (!Number.isFinite(e.at) || e.at < 0) return null;
  return { room, name: cleanName(e.name), at: e.at };
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

// → [{room, name, at}], newest first, at most MAX_TABLES. `room` is the
// ?room= key, `name` the table's display name ('' = unnamed), `at` the last
// visit in ms. Never throws: no storage, unreadable storage and hostile
// entries all degrade toward [] — dropped per entry, deduped by room (first
// occurrence wins; the list is newest-first, so first is newest).
export function recentTables() {
  const out = [];
  const seen = new Set();
  for (const raw of readList()) {
    if (out.length >= MAX_TABLES) break;
    const e = migrateEntry(raw);
    if (!e || seen.has(e.room)) continue;
    seen.add(e.room);
    out.push(e);
  }
  return out;
}

// Upsert by room: move to front, refresh `at`, adopt `name` when a non-empty
// one is supplied — but never clobber a real name with '' (a revisit through
// a bare link would otherwise strip the name the table told us last time).
// Cap at MAX_TABLES, evicting the oldest. Never throws; a room that cleans
// to nothing is not recorded (there is no door it could reopen).
export function rememberTable(room, name) {
  const key = cleanRoom(room);
  if (!key) return;
  const list = recentTables(); // sanitized read — a poisoned store heals here
  const prev = list.find((e) => e.room === key);
  const fresh = cleanName(name);
  const entry = { room: key, name: fresh || (prev ? prev.name : ''), at: Date.now() };
  writeList([entry, ...list.filter((e) => e.room !== key)].slice(0, MAX_TABLES));
}

// Remove one table from the recents (the lobby row's "forget"). Never
// throws; forgetting a room that is not there changes nothing.
export function forgetTable(room) {
  const key = cleanRoom(room);
  if (!key) return;
  const list = recentTables();
  const kept = list.filter((e) => e.room !== key);
  if (kept.length !== list.length) writeList(kept);
}

// ---------------------------------------------------------------------------
// Minting a room key ("New table", §3b L1)
// ---------------------------------------------------------------------------

const KEY_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'; // base36
const KEY_RANDOM_LEN = 16; // × log2(36) ≈ 82.7 bits — see the header
const SLUG_MAX = 24;

// `len` unbiased base36 characters from the CSPRNG. Rejection sampling: a
// byte is accepted only below 216 (= 36 × 6, the largest multiple of 36 a
// byte reaches), so `% 36` favors no character; ~84% of bytes are accepted,
// so the loop almost never runs twice.
function randBase36(len) {
  let out = '';
  const buf = new Uint8Array(len * 2);
  while (out.length < len) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < len; i++) {
      if (buf[i] < 216) out += KEY_CHARS[buf[i] % 36];
    }
  }
  return out;
}

// The human half of the key: lowercase ASCII alphanumerics with single
// hyphens between runs, max SLUG_MAX chars. NFKD first so 'Café' slugs to
// 'cafe' rather than 'caf'. May legitimately come back '' (emoji-only names,
// punctuation, CJK) — the caller then mints a bare random key.
function slugOf(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // the combining marks NFKD split off
    .replace(/[^a-z0-9]+/g, '-')     // any other run → one hyphen
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)              // safe: only [a-z0-9-] remains
    .replace(/-+$/, '');             // the cut may have landed on a hyphen
}

// → a NEW room key: '<slug>-<16 random base36>' when `name` yields a slug,
// else the bare random part. Unguessable by construction (the key IS the
// door — goal 10); verified against server.js cleanString/MAX_ROOM = 64 and
// encodeURIComponent, per the header. Throws only in an environment with no
// crypto.getRandomValues — deliberately, rather than mint a guessable key.
export function mintRoomKey(name) {
  const slug = slugOf(name);
  const rand = randBase36(KEY_RANDOM_LEN);
  return slug ? `${slug}-${rand}` : rand;
}
