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

// tests/tables.test.mjs — the lobby's visited-tables store (UX §7.20,
// ROADMAP §3b L1/L3). The load-bearing claims: the reader NEVER throws and
// fails closed per entry (absent, throwing, corrupt and hostile storage all
// degrade toward [], one bad entry never spoils the list); upsert moves to
// front without clobbering a real name with ''; the cap evicts the oldest;
// and a minted room key is unguessable from the name alone, URL-safe, and
// passes the server's cleanString(room, MAX_ROOM) gate BYTE-IDENTICAL —
// asserted against a mirror of that exact gate, because the key is the door
// (goal 10) and a key the server rewrites would be a door that opens onto a
// different room than the one the link named.

import assert from 'node:assert/strict';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// localStorage is swapped per test through the global binding — the module
// resolves the bare identifier at call time, so each shape (absent, throwing,
// seeded) is exercised against the SAME loaded module. defineProperty rather
// than assignment: Node may ship its own experimental webstorage global.
const setLS = (value) => Object.defineProperty(globalThis, 'localStorage',
  { value, configurable: true, writable: true });
const memLS = (seed = {}) => {
  const store = new Map(Object.entries(seed));
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
};
const KEY = 'dice.tables.v1';
const rooms = (list) => list.map((e) => e.room);

setLS(undefined); // start from "no storage at all"
const { recentTables, rememberTable, forgetTable, mintRoomKey } =
  await import('../js/tables.js');

// ---- never throws, fails closed ---------------------------------------------

t('absent localStorage: [] out, writes are silent no-ops', () => {
  setLS(undefined);
  assert.deepEqual(recentTables(), []);
  rememberTable('barn', 'The Barn'); // must not throw
  forgetTable('barn');               // must not throw
  assert.deepEqual(recentTables(), []);
});

t('throwing localStorage: [] out, writes are silent no-ops', () => {
  const boom = () => { throw new Error('quota / privacy mode'); };
  setLS({ getItem: boom, setItem: boom, removeItem: boom });
  assert.deepEqual(recentTables(), []);
  rememberTable('barn', 'The Barn');
  forgetTable('barn');
  assert.deepEqual(recentTables(), []);
});

t('corrupt storage yields [] rather than a throw', () => {
  for (const junk of ['not json {', '"a string"', '{"room":"x"}', '42', 'null']) {
    setLS(memLS({ [KEY]: junk }));
    assert.deepEqual(recentTables(), [], `for stored ${JSON.stringify(junk)}`);
  }
});

t('hostile entries drop one by one — a bad entry never spoils the list', () => {
  setLS(memLS({ [KEY]: JSON.stringify([
    { room: 'good-1', name: 'Good', at: 5 },
    null, 7, 'str', [], { room: 1, at: 2 }, { room: 'no-at', name: 'x' },
    { room: 'bad-at', name: 'x', at: 'nope' }, { room: 'neg-at', at: -1 },
    { room: 'inf-at', at: Infinity }, { room: '', at: 3 }, { room: '   ', at: 3 },
    { room: '\u200b\u202e', at: 3 }, // zero-width + bidi: cleans to nothing, dropped
    { room: 'good-2', name: 7, at: 4 }, // non-string name → ''
    { room: 'good-1', name: 'Dup', at: 1 }, // dup room → first (newest) wins
  ]) }));
  assert.deepEqual(recentTables(), [
    { room: 'good-1', name: 'Good', at: 5 },
    { room: 'good-2', name: '', at: 4 },
  ]);
});

t('hostile long fields are cut to the mirrored caps (room 64, name 28)', () => {
  setLS(memLS({ [KEY]: JSON.stringify([
    { room: 'r'.repeat(100), name: 'n'.repeat(50), at: 1 },
  ]) }));
  const [e] = recentTables();
  assert.equal(e.room, 'r'.repeat(64));
  assert.equal(e.name, 'n'.repeat(28));
});

t('reader caps at 8 even when a foreign writer stored more', () => {
  setLS(memLS({ [KEY]: JSON.stringify(Array.from({ length: 20 }, (_, i) =>
    ({ room: `r${i}`, name: '', at: i }))) }));
  assert.equal(recentTables().length, 8);
  assert.deepEqual(rooms(recentTables()), ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
});

// ---- upsert ------------------------------------------------------------------

t('remember → recall round-trip, newest first', () => {
  setLS(memLS());
  rememberTable('alpha', 'Alpha');
  rememberTable('beta', 'Beta');
  const list = recentTables();
  assert.deepEqual(rooms(list), ['beta', 'alpha']);
  assert.deepEqual(list.map((e) => e.name), ['Beta', 'Alpha']);
  for (const e of list) assert.ok(Number.isFinite(e.at) && e.at > 0);
  assert.ok(JSON.parse(globalThis.localStorage.store.get(KEY)).length === 2);
});

t("upsert moves to front, refreshes at, and '' never clobbers a real name", () => {
  setLS(memLS());
  rememberTable('alpha', 'Alpha');
  rememberTable('beta', 'Beta');
  const before = recentTables().find((e) => e.room === 'alpha').at;
  rememberTable('alpha', ''); // a revisit through a bare link carries no name
  let list = recentTables();
  assert.deepEqual(rooms(list), ['alpha', 'beta']);
  assert.equal(list[0].name, 'Alpha', "'' must not clobber the stored name");
  assert.ok(list[0].at >= before, 'at refreshes on revisit');
  rememberTable('alpha', 'Alpha Prime'); // a real name DOES update
  list = recentTables();
  assert.equal(list[0].name, 'Alpha Prime');
  assert.equal(list.length, 2, 'upsert, not a duplicate');
});

t('remember cleans its arguments (caps, controls, non-strings)', () => {
  setLS(memLS());
  rememberTable('long-'.repeat(20), 'x'.repeat(40));
  const [e] = recentTables();
  assert.equal(e.room.length, 64);
  assert.equal(e.name.length, 28);
  rememberTable(e.room + 'trailing-beyond-the-cap', 'Same Door');
  assert.equal(recentTables().length, 1, 'the 64-cut key upserts the same entry');
  rememberTable('', 'nameless');   // no key, no entry
  rememberTable('   ', 'blank');   // cleans to nothing
  rememberTable(null, 'nully');    // non-string → no-op, no throw
  rememberTable(undefined);        // no args at all
  assert.equal(recentTables().length, 1);
  rememberTable('quiet', null);    // non-string name → ''
  assert.equal(recentTables()[0].name, '');
});

t('the 8 cap evicts the oldest', () => {
  setLS(memLS());
  for (let i = 1; i <= 9; i++) rememberTable(`room-${i}`, `Table ${i}`);
  const list = recentTables();
  assert.equal(list.length, 8);
  assert.deepEqual(rooms(list), ['room-9', 'room-8', 'room-7', 'room-6',
    'room-5', 'room-4', 'room-3', 'room-2'], 'room-1 (oldest) evicted');
  rememberTable('room-2', ''); // revisiting the back saves it from the axe…
  rememberTable('room-10', '');
  assert.deepEqual(rooms(recentTables()).at(-1), 'room-4', '…and room-3 goes instead');
});

// ---- forget ------------------------------------------------------------------

t('forget removes one entry and nothing else', () => {
  setLS(memLS());
  rememberTable('a', 'A'); rememberTable('b', 'B'); rememberTable('c', 'C');
  forgetTable('b');
  assert.deepEqual(rooms(recentTables()), ['c', 'a']);
  forgetTable('not-there'); // unknown room: a no-op, not an error
  forgetTable(null);        // non-string: a no-op, not a throw
  assert.deepEqual(rooms(recentTables()), ['c', 'a']);
  forgetTable('c'); forgetTable('a');
  assert.deepEqual(recentTables(), []);
});

// ---- mintRoomKey -------------------------------------------------------------

// Mirror of the exact gate every ?room= value passes on the server —
// server.js cleanString(value, MAX_ROOM): stripCtl, then cutText (trim →
// slice(0, 64) → unpaired-surrogate guard → trim), '' ⇒ null (refused).
// MAX_ROOM = 64. If this mirror drifts from server.js, the test asserts
// against the wrong door.
const stripCtl = (t2) => t2.replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
const cutText = (text, max) => {
  let cut = text.trim().slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut.trim();
};
const serverCleanRoom = (v) => (typeof v === 'string' ? (cutText(stripCtl(v), 64) || null) : null);

t('minted keys survive the server gate and encodeURIComponent unchanged', () => {
  const names = ['Game Night', '', '🎲🎲', '!!! --- !!!', 'Café Noir', 'soulseal',
    'The Extremely Long Table Name Of Legend And Renown', '  spaced  out  ', undefined];
  for (const name of names) {
    const k = mintRoomKey(name);
    assert.equal(serverCleanRoom(k), k, `server must accept ${JSON.stringify(k)} byte-identical`);
    assert.equal(encodeURIComponent(k), k, `URL must carry ${JSON.stringify(k)} unencoded`);
    assert.ok(k.length <= 64, `under MAX_ROOM: ${k.length}`);
    assert.match(k, /^([a-z0-9]+(-[a-z0-9]+)*-)?[a-z0-9]{16}$/,
      `slug of single-hyphen runs + 16 base36: ${JSON.stringify(k)}`);
  }
});

t('the slug is readable, capped at 24, and optional', () => {
  assert.match(mintRoomKey('Game Night'), /^game-night-[a-z0-9]{16}$/);
  assert.match(mintRoomKey('Café Noir'), /^cafe-noir-/, 'NFKD: é slugs to e');
  assert.match(mintRoomKey('  The  BARN!!  '), /^the-barn-[a-z0-9]{16}$/);
  for (const nameless of ['', '🎲🎲', '!!!', '---', '東京', undefined, null, 42]) {
    assert.match(mintRoomKey(nameless), /^[a-z0-9]{16}$/,
      `no slug from ${JSON.stringify(nameless)} → bare random key`);
  }
  const long = mintRoomKey('The Extremely Long Table Name Of Legend And Renown');
  const slug = long.slice(0, -17); // minus '-' + 16 random chars
  assert.ok(slug.length <= 24, `slug capped at 24, got ${slug.length}`);
  assert.ok(!slug.endsWith('-') && !slug.startsWith('-'), 'no hyphen stranded by the cut');
});

t('minted keys are unique across many calls — same name or none', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    seen.add(mintRoomKey('soulseal'));
    seen.add(mintRoomKey(''));
  }
  assert.equal(seen.size, 1000, 'every mint distinct');
});

t('a key is never guessable from the name alone', () => {
  // The name yields only the slug; the door is the random tail. Two mints of
  // the same name must share nothing beyond the slug, and the tail must be
  // full-width (16 chars ≈ 82.7 bits) even when the name IS a valid key.
  const a = mintRoomKey('soulseal');
  const b = mintRoomKey('soulseal');
  assert.notEqual(a, 'soulseal', 'the name alone must not be the key');
  assert.match(a, /^soulseal-[a-z0-9]{16}$/);
  assert.notEqual(a.slice(-16), b.slice(-16), 'independent random tails');
  // and the generator actually spans the alphabet (a stuck CSPRNG or a biased
  // sampler would collapse this): 200 × 16 draws hit ~all 36 chars
  const chars = new Set();
  for (let i = 0; i < 200; i++) for (const c of mintRoomKey('')) chars.add(c);
  assert.ok(chars.size >= 30, `alphabet coverage too narrow: ${chars.size}/36`);
});

if (process.exitCode) process.exit(process.exitCode);
console.log(`all ${n} tables tests pass`);
