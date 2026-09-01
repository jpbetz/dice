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

// tests/places-wire.test.mjs — `player.place` on the wire (docs/UX.md §7.63).
//
// A PLACE is the station at the table: an integer 0–7, server-assigned, sticky.
// This file proves the ROSTER half of it — who is given which station, what
// happens when they leave, and what every client is told — one slice before
// anything reads a place to move a die or stand a card. There is nothing to
// see on the felt yet, and that is the point: the field arrives at every
// client, through every door, before a single frame of film depends on it.
//
// THE FOUR CLAIMS, and the defect each one is written against:
//
//   1. LOWEST FREE, AND NOBODY IS EVER RENUMBERED. A colour is a preference; a
//      place is a position a throw comes in over. Compacting the table when
//      somebody leaves would move the edge a roll already on the felt entered
//      from — the card would be lying about a roll you can still see
//      (IMMERSION.md:1379-1382). So a departure frees exactly one station and
//      touches nobody else's.
//
//   2. THE STUB HOLDS THE CHAIR (IDENTITY §8's two clocks). The roster lets a
//      gone browser go in seconds; the server remembers the seat for
//      RESUME_TTL_MS — and, since this slice, the station with it. A reload
//      lands back where it was sitting, and nobody is seated there meanwhile.
//
//   3. NO CLIFF AT THE NINTH ARRIVAL. There are eight stations and forty
//      seats. The ninth player is PLACELESS — the key is absent, not null,
//      not a fallback station — and everything else about their table is
//      unchanged. The one reassignment the system ever makes is the PROMOTION:
//      a station comes free, the earliest-joined placeless player takes it, and
//      the room is told once.
//
//   4. ONE PROJECTION ONTO THE WIRE. `player-joined` used to carry a
//      hand-built literal, which is how a roster field could be — and once was
//      — dropped by two of the three doors a client can learn a roster
//      through. publicPlayer is now the only projection there is, and this file
//      asserts the payloads key for key rather than trusting that.
//
// The redaction legs at the bottom are the stamp slice's landing pad: `entry`
// and `lane` join the redacted branch there, and the assertion that matters —
// that a redacted roll still omits every value-bearing key — is pinned HERE, so
// the slice that widens that branch cannot widen it by accident.
//
// A real server.js child on an ephemeral port — never 8123 (Joe's live table).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { projectEntryFor } from '../server.js';
import { PLACE_MAX } from '../js/places.js';

// server.js installs a swallow-and-continue uncaughtException handler for its
// own resilience; a test run must crash loudly instead.
process.removeAllListeners('uncaughtException');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function startServer(port, env = {}) {
  const proc = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`server exited early:\n${out.slice(-2000)}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return proc;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error(`server never came up on :${port}\n${out.slice(-2000)}`);
}

async function stopServer(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } resolve(); }, 2000);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

let n = 0;
let failed = 0;
async function t(name, fn) {
  n++;
  try { await fn(); } catch (e) {
    failed++;
    console.error(`FAIL: ${name}\n  ${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  }
}

const port = await freePort();
const proc = await startServer(port);
const base = `http://127.0.0.1:${port}`;

// The second server, with both clocks shrunk — the revive leg is a RELATION
// between them (the roster lets go first, the server remembers longer), and a
// relation cannot be asserted by waiting less.
const GRACE_MS = 400;
const TTL_MS = 6000;
const portFast = await freePort();
const procFast = await startServer(portFast, {
  DICE_DISCONNECT_GRACE_MS: String(GRACE_MS),
  DICE_RESUME_TTL_MS: String(TTL_MS),
});
const baseFast = `http://127.0.0.1:${portFast}`;

const postTo = async (at, path, body) => {
  const res = await fetch(at + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  // `text` is kept so an assertion can look at the BYTES that left rather than
  // at a re-serialization of the fields this test happens to know about.
  return { status: res.status, data, text };
};
const joinAt = (at, room, name, extra = {}) => postTo(at, '/api/join', { room, name, ...extra });
const joinRoom = (room, name, extra = {}) => joinAt(base, room, name, extra);

/** The place a join/hello roster says this player holds — undefined if none. */
function placeOf(roster, id) {
  const row = (roster || []).find((p) => p.id === id);
  assert.ok(row, `roster has no row for ${id}`);
  return 'place' in row ? row.place : undefined;
}

/** An SSE stream, opened the way a browser does, with its bytes kept. */
function openStream(at, room, playerId, streamId) {
  const ac = new AbortController();
  const state = { ended: false, text: '', ac, streamId };
  state.done = (async () => {
    const qs = `room=${encodeURIComponent(room)}&playerId=${encodeURIComponent(playerId)}`
      + `&streamId=${encodeURIComponent(streamId)}`;
    const res = await fetch(`${at}/api/events?${qs}`, { signal: ac.signal });
    if (!res.ok) { state.ended = true; return; }
    try {
      const decoder = new TextDecoder();
      for await (const chunk of res.body) state.text += decoder.decode(chunk, { stream: true });
    } catch { /* aborted or reset */ }
    state.ended = true;
  })();
  state.events = () => state.text.split('\n\n').map((block) => {
    const type = /(?:^|\n)event: (.*)/.exec(block);
    const data = /(?:^|\n)data: (.*)/.exec(block);
    if (!type || !data) return null;
    try { return { type: type[1], data: JSON.parse(data[1]) }; } catch { return null; }
  }).filter(Boolean);
  return state;
}

const streamUp = async (state, label) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (state.text.includes('retry:')) return;
    if (state.ended) throw new Error(`stream died before it opened: ${label}`);
    await sleep(25);
  }
  throw new Error(`stream never opened: ${label}`);
};

const waitForEvent = async (state, type, match = () => true, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hit = state.events().find((e) => e.type === type && match(e.data));
    if (hit) return hit;
    await sleep(25);
  }
  throw new Error(`timeout waiting for '${type}' (got: ${state.events().map((e) => e.type).join(', ')})`);
};

/** Seat a player and open their stream — a seat that has never streamed has
 *  not lapsed, it is arriving, and the server must not confuse the two. */
const seat = async (at, room, name, extra = {}) => {
  const res = await joinAt(at, room, name, extra);
  assert.equal(res.status, 200, `join ${name}: ${res.text.slice(0, 200)}`);
  const streamId = `s-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const stream = openStream(at, room, res.data.playerId, streamId);
  await streamUp(stream, `${name} @ ${room}`);
  return { ...res.data, name, streamId, stream };
};

const leaveForGood = (at, room, me) =>
  postTo(at, '/api/leave', { room, playerId: me.playerId, immediate: true });

// ---------------------------------------------------------------------------
// 1. The ladder — lowest free, in order, and nobody is renumbered
// ---------------------------------------------------------------------------

await t('five arrivals take stations 0-4, lowest free, in join order', async () => {
  const room = 'wire-ladder';
  const ids = [];
  for (const name of ['Ann', 'Bram', 'Cass', 'Dev', 'Eluned']) {
    const r = await joinRoom(room, name);
    assert.equal(r.status, 200, r.text.slice(0, 200));
    ids.push(r.data.playerId);
    // Own place, read out of the join snapshot's own roster: the door a
    // client actually learns its station through.
    assert.equal(placeOf(r.data.players, r.data.playerId), ids.length - 1,
      `${name} takes station ${ids.length - 1}`);
  }
  const last = await joinRoom(room, 'Peek');
  for (let i = 0; i < ids.length; i++) {
    assert.equal(placeOf(last.data.players, ids[i]), i, `station ${i} did not move`);
  }
  // The ladder's own order lives in js/places.js and is unit-pinned there; what
  // is asserted here is only that the wire hands them out lowest-first.
  assert.equal(placeOf(last.data.players, last.data.playerId), 5, 'the sixth takes 5');
});

await t('a station given up goes to the next arrival, and nobody else moves', async () => {
  const room = 'wire-refill';
  const people = [];
  for (const name of ['Ann', 'Bram', 'Cass', 'Dev']) people.push(await seat(base, room, name));
  const before = await joinRoom(room, 'Peek0');
  for (let i = 0; i < people.length; i++) {
    assert.equal(placeOf(before.data.players, people[i].playerId), i);
  }
  // LEAVING ON PURPOSE MEANS LEAVING: the gesture buries no stub, so the
  // station is free the instant the roster is.
  const gone = people[1];
  assert.ok((await leaveForGood(base, room, gone)).status === 200, 'leave accepted');
  const after = await joinRoom(room, 'Fionn');
  assert.equal(placeOf(after.data.players, after.data.playerId), 1,
    'the arrival sits down in the freed chair');
  assert.equal(placeOf(after.data.players, people[0].playerId), 0, 'Ann still sits at 0');
  assert.equal(placeOf(after.data.players, people[2].playerId), 2, 'Cass still sits at 2');
  assert.equal(placeOf(after.data.players, people[3].playerId), 3, 'Dev still sits at 3');
});

await t('a place is never read off a request body', async () => {
  const room = 'wire-nobody-asks';
  await joinRoom(room, 'Ann');
  // `place` is display state the SERVER decides. A client that asks for one is
  // not refused and is not obeyed — it is simply seated next, exactly as if it
  // had said nothing. (The five must-nots govern `who`; this one is the
  // narrower rule the field carries in its own right, IDENTITY §6.)
  const r = await joinRoom(room, 'Greedy', { place: 5 });
  assert.equal(placeOf(r.data.players, r.data.playerId), 1,
    'the asked-for station is ignored and the lowest free one handed out');
});

// ---------------------------------------------------------------------------
// 2. The ninth arrival, and the one promotion
// ---------------------------------------------------------------------------

await t('the ninth arrival is placeless — the key is absent, not null', async () => {
  const room = 'wire-overflow';
  const ids = [];
  for (let i = 0; i < PLACE_MAX + 2; i++) {
    const r = await joinRoom(room, `P${i}`);
    assert.equal(r.status, 200, r.text.slice(0, 200));
    ids.push(r.data.playerId);
  }
  const view = await joinRoom(room, 'Peek');
  for (let i = 0; i < PLACE_MAX; i++) {
    assert.equal(placeOf(view.data.players, ids[i]), i, `P${i} holds station ${i}`);
  }
  for (const overflow of [PLACE_MAX, PLACE_MAX + 1]) {
    const row = view.data.players.find((p) => p.id === ids[overflow]);
    assert.equal('place' in row, false,
      `P${overflow} carries NO place key (got ${JSON.stringify(row)})`);
  }
  // …and nothing else about them is different: a placeless player is a whole
  // player, on the roster, with their hue.
  const row = view.data.players.find((p) => p.id === ids[PLACE_MAX]);
  assert.equal(row.name, `P${PLACE_MAX}`);
  assert.ok(row.color, 'still wearing a hue');
});

await t('promotion: one freed station, the earliest-joined placeless player, one event', async () => {
  const room = 'wire-promotion';
  const people = [];
  for (let i = 0; i < PLACE_MAX; i++) people.push(await seat(base, room, `P${i}`));
  const ninth = await seat(base, room, 'Ninth');
  const tenth = await seat(base, room, 'Tenth');
  const watcher = await seat(base, room, 'Watcher');   // 11th: also placeless
  const view0 = await joinRoom(room, 'Peek0');
  assert.equal(placeOf(view0.data.players, ninth.playerId), undefined, 'the ninth is placeless');

  assert.equal((await leaveForGood(base, room, people[3])).status, 200, 'P3 leaves for good');
  const ev = await waitForEvent(watcher.stream, 'place-changed');
  assert.deepEqual(ev.data, { playerId: ninth.playerId, place: 3 },
    'the earliest-joined placeless player takes the freed station');
  await sleep(250);
  const events = watcher.stream.events().filter((e) => e.type === 'place-changed');
  assert.equal(events.length, 1, `exactly one promotion (got ${events.length})`);

  const view = await joinRoom(room, 'Peek1');
  assert.equal(placeOf(view.data.players, ninth.playerId), 3, 'and the roster agrees');
  assert.equal(placeOf(view.data.players, tenth.playerId), undefined,
    'the tenth waits its turn — one player gains, nobody else moves');
  for (const i of [0, 1, 2, 4, 5, 6, 7]) {
    assert.equal(placeOf(view.data.players, people[i].playerId), i, `P${i} did not move`);
  }
});

// ---------------------------------------------------------------------------
// 3. One projection onto the wire (the law-13 class assertion)
// ---------------------------------------------------------------------------

await t('player-joined and the roster are one projection, key for key', async () => {
  const room = 'wire-one-projection';
  const ann = await seat(base, room, 'Ann');
  const joined = await joinRoom(room, 'Bram');
  const pushed = (await waitForEvent(ann.stream, 'player-joined',
    (d) => d.player && d.player.id === joined.data.playerId)).data.player;
  // Door 1: the broadcast every seated client hears.
  // Door 2: the arriving client's own join snapshot.
  const snapshot = joined.data.players.find((p) => p.id === joined.data.playerId);
  assert.deepEqual(Object.keys(pushed).sort(), Object.keys(snapshot).sort(),
    'the same keys reach a watcher and the arrival');
  assert.deepEqual(pushed, snapshot, 'and the same values');
  // Door 3: hello, on a stream opened after the fact.
  const late = openStream(base, room, ann.playerId, 'late-hello');
  await streamUp(late, 'late hello');
  const hello = await waitForEvent(late, 'hello');
  const seen = hello.data.players.find((p) => p.id === joined.data.playerId);
  assert.deepEqual(seen, pushed, 'and hello carries it too');
  late.ac.abort();
  // The station is there in all three, and it is the only new key: a fresh
  // player's pools is [], so this payload is the pre-places literal plus one
  // integer.
  assert.deepEqual(Object.keys(pushed).sort(), ['color', 'id', 'name', 'place', 'pools']);
  assert.equal(pushed.place, 1);
  assert.deepEqual(pushed.pools, []);
});

await t('a place never reaches the unauthenticated read', async () => {
  const room = 'wire-front-door';
  await seat(base, room, 'Ann');
  const res = await fetch(`${base}/api/table?room=${room}`);
  const text = await res.text();
  assert.equal(res.status, 200, text.slice(0, 200));
  // GET /api/table is the app's only unauthenticated read and its budget is
  // written out field by field on purpose (server.js). A station is display
  // state for the people AT the table; it is not part of what a peek is owed.
  assert.equal(/place/.test(text), false, `no station in the peek (got ${text.slice(0, 300)})`);
});

// ---------------------------------------------------------------------------
// 4. The stub holds the chair (the 60 s clock) — shrunk-clock server
// ---------------------------------------------------------------------------

await t('a revive inside the TTL lands in the same chair, and nobody sat in it', async () => {
  const room = 'wire-revive';
  const who = 'who-ann-11111111-2222-3333-4444-555555555555';
  const ann = await seat(baseFast, room, 'Ann', { who });
  const bram = await seat(baseFast, room, 'Bram');
  assert.equal(placeOf(ann.players, ann.playerId), 0, 'Ann sits at 0');
  assert.equal(placeOf(bram.players, bram.playerId), 1, 'Bram at 1');

  // The tab is gone: the beacon lands, the socket dies, the reap follows.
  await postTo(baseFast, '/api/leave', { room, playerId: ann.playerId, streamId: ann.streamId });
  ann.stream.ac.abort();
  await waitForEvent(bram.stream, 'player-left', (d) => d.playerId === ann.playerId, 5000);

  // THE ROSTER HAS LET GO AND THE SERVER HAS NOT. An arrival in this window is
  // seated NEXT, not in the chair Ann is walking back to.
  const cass = await joinAt(baseFast, room, 'Cass');
  assert.equal(placeOf(cass.data.players, cass.data.playerId), 2,
    'the station is held for the browser on its way back');

  const back = await joinAt(baseFast, room, 'Ann', { who });
  assert.equal(back.data.playerId, ann.playerId, 'the same seat');
  assert.equal(placeOf(back.data.players, back.data.playerId), 0, 'and the same chair');
});

await t('a stub that expires gives its station up', async () => {
  const room = 'wire-expiry';
  const who = 'who-dev-99999999-8888-7777-6666-555555555555';
  const dev = await seat(baseFast, room, 'Dev', { who });
  const watch = await seat(baseFast, room, 'Watch');
  await postTo(baseFast, '/api/leave', { room, playerId: dev.playerId, streamId: dev.streamId });
  dev.stream.ac.abort();
  await waitForEvent(watch.stream, 'player-left', (d) => d.playerId === dev.playerId, 5000);
  await sleep(TTL_MS + 300);
  const late = await joinAt(baseFast, room, 'Late');
  assert.equal(placeOf(late.data.players, late.data.playerId), 0,
    'gone for good is gone for good — the chair goes back into the ladder');
});

// ---------------------------------------------------------------------------
// 5. Redaction — the landing pad for the stamp (S5 widens this branch)
// ---------------------------------------------------------------------------

// The stamp slice adds `entry` and `lane` to the redacted branch beside `seed`:
// pose inputs, disclosing strictly less than the `playerId` that branch already
// ships. What must stay true either way is asserted here, so widening the
// branch cannot widen it by accident.
const heldEntry = () => ({
  rollId: 'r1',
  playerId: 'ann',
  playerName: 'Ann',
  color: '#fff',
  dice: ['d20'],
  values: [17],
  perDie: [{ type: 'd20', value: 17 }],
  modifier: 2,
  total: 19,
  spec: { mods: [{ kind: 'add', amount: 2 }] },
  seed: 1234,
  t: 1,
  visibility: { mode: 'held', revealAuthority: 'ann' },
});

await t('a redacted roll still omits every value-bearing key', () => {
  const out = projectEntryFor(heldEntry(), 'bystander');
  assert.ok(out, 'a held roll is projected, not withheld');
  for (const key of ['values', 'perDie', 'modifier', 'total', 'spec']) {
    assert.equal(key in out, false, `${key} is omitted, never blanked`);
  }
  assert.equal(out.seed, 1234, 'the seed rides — poses only');
  assert.equal(out.redacted, true);
  // Pre-wired for the stamp: today there is nothing to carry, so the branch
  // must not be inventing one either.
  assert.equal('entry' in out, false, 'no entry until the stamp slice');
  assert.equal('lane' in out, false, 'no lane until the stamp slice');
});

await t('a secret roll is projected as nothing at all', () => {
  const secret = { ...heldEntry(), visibility: { mode: 'secret', revealAuthority: 'ann' } };
  assert.equal(projectEntryFor(secret, 'bystander'), null,
    'no payload, no film, no cue — there is structurally nothing to suppress');
  assert.ok(projectEntryFor(secret, 'ann'), 'the roller still sees their own');
});

await stopServer(proc);
await stopServer(procFast);

console.log(`${n - failed}/${n} places-wire checks passed`);
if (failed) process.exit(1);
