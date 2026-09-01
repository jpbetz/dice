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
//      the room is told once. A station comes free TWO ways — a seat leaves
//      for good, or a vacated stub's memory clock lapses with nobody leaving
//      and nobody arriving — and the promotion must follow both (section 4:
//      the lapse leg was missing, and with it the promotion never fired on
//      the ordinary departure, a closed tab, and the next arrival was seated
//      ahead of the player who had been waiting).
//
//   4. ONE PROJECTION ONTO THE WIRE. `player-joined` used to carry a
//      hand-built literal, which is how a roster field could be — and once was
//      — dropped by two of the three doors a client can learn a roster
//      through. publicPlayer is now the only projection there is, and this file
//      asserts the payloads key for key rather than trusting that.
//
// The redaction legs at the bottom were the stamp slice's landing pad, and the
// stamp has now landed: `entry` and `lane` ride the redacted branch beside
// `seed`. The assertion that matters — that a redacted roll still omits every
// value-bearing key — was pinned BEFORE that branch widened, so widening it
// could not widen it by accident; section 6 proves the stamp itself, end to
// end, through a real roll and a real stream.
//
// A real server.js child on an ephemeral port — never 8123 (Joe's live table).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { projectEntryFor } from '../server.js';
import { PLACE_MAX, entryFor } from '../js/places.js';

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
// The lapse legs (section 4) need the same relation on a shorter memory clock,
// and they need the heartbeat sweep in two opposite states: PARKED, so the
// door is provably the thing that seats a waiting player when an arrival
// follows a lapse; and FAST, so the lapse alone — nobody leaving, nobody
// arriving — is provably enough. One server cannot be both.
const LAPSE_TTL_MS = 1500;
const SWEEP_MS = 300;
const [portFast, portDoor, portSweep] = await Promise.all([freePort(), freePort(), freePort()]);
const [procFast, procDoor, procSweep] = await Promise.all([
  startServer(portFast, {
    DICE_DISCONNECT_GRACE_MS: String(GRACE_MS),
    DICE_RESUME_TTL_MS: String(TTL_MS),
  }),
  startServer(portDoor, {
    DICE_DISCONNECT_GRACE_MS: String(GRACE_MS),
    DICE_RESUME_TTL_MS: String(LAPSE_TTL_MS),
    DICE_HEARTBEAT_MS: String(10 * 60 * 1000),   // the sweep never runs here
  }),
  startServer(portSweep, {
    DICE_DISCONNECT_GRACE_MS: String(GRACE_MS),
    DICE_RESUME_TTL_MS: String(LAPSE_TTL_MS),
    DICE_HEARTBEAT_MS: String(SWEEP_MS),
  }),
]);
const baseFast = `http://127.0.0.1:${portFast}`;
const baseDoor = `http://127.0.0.1:${portDoor}`;
const baseSweep = `http://127.0.0.1:${portSweep}`;

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

// THE LAPSE IS THE SECOND WAY A STATION COMES FREE, and until 2026-09-01 the
// promotion did not know it. removePlayer promotes right after burying the
// stub — which on the disconnect reap still HOLDS the chair, so that call
// correctly seats nobody — and nothing asked again when the stub lapsed. At
// a nine-person table one closed tab left the ninth player placeless for
// ever and handed the freed chair to the next stranger through the door.
// Both halves are pinned here: the door seats the waiter first, and the
// sweep seats them even when nobody comes to the door at all.

/** Eight seated with a browser key (so the reap buries a stub), a ninth
 *  placeless, and then seat `victim`'s tab dies the ordinary way: the beacon
 *  lands, the socket drops, the reap follows. Returns the roster and the
 *  ninth, whose stream is the witness. */
async function fullHouseThenLapse(at, room, victim) {
  const people = [];
  for (let i = 0; i < PLACE_MAX; i++) {
    people.push(await seat(at, room, `P${i}`, { who: `who-p${i}-${room}` }));
  }
  const ninth = await seat(at, room, 'Ninth');
  assert.equal(placeOf(ninth.players, ninth.playerId), undefined, 'the ninth is placeless');
  await postTo(at, '/api/leave', { room, playerId: people[victim].playerId, streamId: people[victim].streamId });
  people[victim].stream.ac.abort();
  await waitForEvent(ninth.stream, 'player-left', (d) => d.playerId === people[victim].playerId, 5000);
  return { people, ninth };
}
const promotions = (who) => who.stream.events().filter((e) => e.type === 'place-changed');

await t('a chair freed by a LAPSED stub goes to the player who was waiting — nobody leaves, nobody arrives', async () => {
  const room = 'wire-lapse-sweep';
  const { ninth } = await fullHouseThenLapse(baseSweep, room, 3);
  // INSIDE THE TTL the chair is held for the browser on its way back: the
  // promotion in removePlayer seats nobody, and neither does the sweep.
  await sleep(LAPSE_TTL_MS / 2);
  assert.deepEqual(promotions(ninth), [], 'nobody is promoted while the stub still holds the chair');
  // THE STUB LAPSES. The sweep is the only thing that runs — and it is enough.
  const ev = await waitForEvent(ninth.stream, 'place-changed', () => true, LAPSE_TTL_MS + 2000);
  assert.deepEqual(ev.data, { playerId: ninth.playerId, place: 3 },
    'the waiting player takes the lapsed chair');
  await sleep(SWEEP_MS * 3);
  assert.equal(promotions(ninth).length, 1, `exactly once (got ${promotions(ninth).length})`);
  const view = await joinAt(baseSweep, room, 'Peek');
  assert.equal(placeOf(view.data.players, ninth.playerId), 3, 'and the roster agrees');
  assert.equal(placeOf(view.data.players, view.data.playerId), undefined,
    'the table is full again: the peeker is placeless');
});

await t('an arrival after the lapse is seated BEHIND the player who was waiting, never ahead', async () => {
  const room = 'wire-lapse-door';
  const { ninth } = await fullHouseThenLapse(baseDoor, room, 5);
  await sleep(LAPSE_TTL_MS + 300);   // the stub lapses; this server's sweep is parked
  assert.deepEqual(promotions(ninth), [], 'nothing has read the ladder since the lapse');
  const late = await joinAt(baseDoor, room, 'Late');
  assert.equal(placeOf(late.data.players, ninth.playerId), 5,
    'the door seats the player who was waiting first…');
  assert.equal(placeOf(late.data.players, late.data.playerId), undefined,
    '…and the arrival behind them: the table is full, so they are placeless');
  const ev = await waitForEvent(ninth.stream, 'place-changed');
  assert.deepEqual(ev.data, { playerId: ninth.playerId, place: 5 }, 'and the room was told');
});

// ---------------------------------------------------------------------------
// 5. Redaction — the stamp rides it, the values never do
// ---------------------------------------------------------------------------

// The stamp slice added `entry` and `lane` to the redacted branch beside
// `seed`: pose inputs, disclosing strictly less than the `playerId` that
// branch already ships. What had to stay true across that widening is asserted
// here — and the stamp is present-or-absent, so a stampless entry's redaction
// is still byte-for-byte the pre-places projection.
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
  // A stampless entry carries no stamp: present-or-absent, never invented, so
  // this projection is byte-for-byte what it was before places existed.
  assert.equal('entry' in out, false, 'no entry key on a stampless entry');
  assert.equal('lane' in out, false, 'no lane key on a stampless entry');
});

await t('a redacted roll carries the stamp, and still no values', () => {
  const stamped = { ...heldEntry(), entry: 1, lane: -1 };
  const out = projectEntryFor(stamped, 'bystander');
  assert.equal(out.entry, 1, 'the entry edge survives redaction — a pose input');
  assert.equal(out.lane, -1, 'and the lane with it');
  assert.equal(out.redacted, true);
  for (const key of ['values', 'perDie', 'modifier', 'total', 'spec']) {
    assert.equal(key in out, false, `${key} still omitted beside the stamp`);
  }
});

await t('a secret roll is projected as nothing at all', () => {
  const secret = { ...heldEntry(), visibility: { mode: 'secret', revealAuthority: 'ann' } };
  assert.equal(projectEntryFor(secret, 'bystander'), null,
    'no payload, no film, no cue — there is structurally nothing to suppress');
  assert.ok(projectEntryFor(secret, 'ann'), 'the roller still sees their own');
});

// ---------------------------------------------------------------------------
// 6. The stamp itself — server-set, from the roster, onto the payload
// ---------------------------------------------------------------------------

await t('a roll is stamped with its roller\'s own entry and lane, and everyone gets the same integers', async () => {
  const room = 'wire-stamp';
  const ann = await seat(base, room, 'Ann');    // place 0 — front, lane 0
  const bram = await seat(base, room, 'Bram');  // place 1 — back, lane 0
  const r = await postTo(base, '/api/roll', { room, playerId: ann.playerId, notation: '2d6' });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  const want = entryFor(0, false);
  assert.equal(r.data.roll.entry, want.entry, 'the response carries the front station\'s edge');
  assert.equal(r.data.roll.lane, want.lane, 'and its lane');
  // The same integers reach the OTHER side of the table on the broadcast —
  // the whole point: one payload, one film, no client-side re-derivation.
  const heard = await waitForEvent(bram.stream, 'roll', (d) => d.rollId === r.data.roll.rollId);
  assert.equal(heard.data.entry, r.data.roll.entry, 'the broadcast carries the same edge');
  assert.equal(heard.data.lane, r.data.roll.lane, 'and the same lane');
  // And the stamp is the ROLLER's, not the room's: Bram's own roll comes in
  // from Bram's station.
  const r2 = await postTo(base, '/api/roll', { room, playerId: bram.playerId, notation: '1d20' });
  assert.equal(r2.data.roll.entry, entryFor(1, false).entry, 'Bram\'s roll wears Bram\'s edge');
});

await t('a placeless roller\'s payload carries no stamp at all', async () => {
  const room = 'wire-stamp-overflow';
  const ids = [];
  for (let i = 0; i <= PLACE_MAX; i++) {
    const r = await joinRoom(room, `P${i}`);
    assert.equal(r.status, 200, r.text.slice(0, 200));
    ids.push(r.data.playerId);
  }
  // The ninth chair does not exist: no place, so no entry, no lane — the key
  // is ABSENT, and the film falls back to the seeded draw it always had.
  const r = await postTo(base, '/api/roll', { room, playerId: ids[PLACE_MAX], notation: '2d6' });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal('entry' in r.data.roll, false, 'no entry key on a placeless roll');
  assert.equal('lane' in r.data.roll, false, 'no lane key either');
});

await t('a re-throw is re-stamped from the live place — the tower remap included', async () => {
  const room = 'wire-stamp-rethrow';
  const ann = await seat(base, room, 'Ann');    // place 0
  const bram = await seat(base, room, 'Bram');  // place 1 — BACK, remapped by a tower
  const first = await postTo(base, '/api/roll', { room, playerId: bram.playerId, notation: '2d6 t2' });
  assert.equal(first.status, 200, first.text.slice(0, 200));
  assert.equal(first.data.roll.entry, entryFor(1, false).entry, 'throw one enters from the back');
  // The tower socketed between throws: the back stations move to its flanks,
  // and Bram's SECOND throw must enter beside where his placard stands now —
  // entryFor's towerUp remap, read off the room's own live setting.
  const set = await postTo(base, '/api/settings',
    { room, playerId: ann.playerId, settings: { tower: 'blackanvil' } });
  assert.equal(set.status, 200, set.text.slice(0, 200));
  const again = await postTo(base, '/api/rethrow',
    { room, playerId: bram.playerId, rollId: first.data.roll.rollId, keep: [0] });
  assert.equal(again.status, 200, again.text.slice(0, 200));
  const flank = entryFor(1, true);
  assert.notEqual(flank.entry, entryFor(1, false).entry,
    'the remap is a real remap, or this leg proves nothing');
  assert.equal(again.data.roll.entry, flank.entry, 'the re-throw enters from the flank');
  assert.equal(again.data.roll.lane, flank.lane, 'flanks are single-station: lane 0');
});

// ---------------------------------------------------------------------------
// 7. The felt holds one roll per place — what an arrival sweeps (v2)
// ---------------------------------------------------------------------------

const collectedOn = (stream) => stream.events()
  .filter((e) => e.type === 'roll-collected').map((e) => e.data.rollId);
const openIn = (snapshotLog) => snapshotLog.filter((r) => !r.cleared && !r.collected).map((r) => r.rollId).sort();

await t('a placed arrival sweeps its own priors and leaves the other chairs\' rolls on the felt', async () => {
  const room = 'wire-sweep';
  const ann = await seat(base, room, 'Ann');    // place 0
  const bram = await seat(base, room, 'Bram');  // place 1
  const cass = await seat(base, room, 'Cass');  // place 2 — the witness, never rolls
  const a1 = (await postTo(base, '/api/roll', { room, playerId: ann.playerId, notation: '3d6' })).data.roll;
  const b1 = (await postTo(base, '/api/roll', { room, playerId: bram.playerId, notation: '3d6' })).data.roll;
  await waitForEvent(cass.stream, 'roll', (d) => d.rollId === b1.rollId);
  assert.deepEqual(collectedOn(cass.stream), [], "Bram's arrival collected nothing — Ann's roll is still on the felt");
  const a2 = (await postTo(base, '/api/roll', { room, playerId: ann.playerId, notation: '2d6' })).data.roll;
  await waitForEvent(cass.stream, 'roll', (d) => d.rollId === a2.rollId);
  assert.deepEqual(collectedOn(cass.stream), [a1.rollId], "Ann's second roll collected her first, and only her first");
  // The snapshot a late joiner gets says the same: two open rolls, one per chair.
  const late = await joinRoom(room, 'Late');
  assert.deepEqual(openIn(late.data.log), [a2.rollId, b1.rollId].sort(), 'the join snapshot carries both open rolls');
  // The burst order §7.7 pins still holds: collections before the roll.
  const types = cass.stream.events().map((e) => e.type);
  assert.ok(types.lastIndexOf('roll-collected') < types.lastIndexOf('roll'), 'the collection reached the room before the roll that caused it');
});

await t('a placeless arrival is the old table — it takes the whole felt — and the next placed roll takes it away', async () => {
  const room = 'wire-sweep-placeless';
  const seats = [];
  for (let i = 0; i <= PLACE_MAX; i++) seats.push(await seat(base, room, `P${i}`));
  const ninth = seats[PLACE_MAX];
  const witness = seats[2];
  const a = (await postTo(base, '/api/roll', { room, playerId: seats[0].playerId, notation: '3d6' })).data.roll;
  const b = (await postTo(base, '/api/roll', { room, playerId: seats[1].playerId, notation: '3d6' })).data.roll;
  const c = (await postTo(base, '/api/roll', { room, playerId: ninth.playerId, notation: '2d6' })).data.roll;
  assert.equal('entry' in c, false, 'the ninth chair\'s roll is unstamped');
  await waitForEvent(witness.stream, 'roll', (d) => d.rollId === c.rollId);
  assert.deepEqual(collectedOn(witness.stream).sort(), [a.rollId, b.rollId].sort(),
    'the placeless roll swept BOTH placed pools — today\'s rule, byte for byte');
  const d = (await postTo(base, '/api/roll', { room, playerId: seats[1].playerId, notation: '1d20' })).data.roll;
  await waitForEvent(witness.stream, 'roll', (d2) => d2.rollId === d.rollId);
  assert.ok(collectedOn(witness.stream).includes(c.rollId), 'and the next placed arrival swept the placeless roll');
  const late = await joinRoom(room, 'Late');
  assert.deepEqual(openIn(late.data.log), [d.rollId], 'leaving the one placed roll open');
});

await t('a roll whose roller has left keeps its felt — the sweep reads the log, not the roster', async () => {
  const room = 'wire-sweep-history';
  const ann = await seat(base, room, 'Ann');
  const bram = await seat(base, room, 'Bram');
  const cass = await seat(base, room, 'Cass');
  const a = (await postTo(base, '/api/roll', { room, playerId: ann.playerId, notation: '2d6' })).data.roll;
  await leaveForGood(base, room, ann);
  const b = (await postTo(base, '/api/roll', { room, playerId: bram.playerId, notation: '2d6' })).data.roll;
  await waitForEvent(cass.stream, 'roll', (d) => d.rollId === b.rollId);
  assert.deepEqual(collectedOn(cass.stream), [], 'the departed roller\'s stamped roll stays on the felt');
  const late = await joinRoom(room, 'Late');
  assert.deepEqual(openIn(late.data.log), [a.rollId, b.rollId].sort(), 'history keeps its felt as it keeps its edge');
});

await t('under a tower the whole felt is swept, as before (row 15 owns the tower\'s regions)', async () => {
  const room = 'wire-sweep-tower';
  const ann = await seat(base, room, 'Ann');
  const bram = await seat(base, room, 'Bram');
  const cass = await seat(base, room, 'Cass');
  const set = await postTo(base, '/api/settings', { room, playerId: ann.playerId, settings: { tower: 'blackanvil' } });
  assert.equal(set.status, 200, set.text.slice(0, 200));
  const a = (await postTo(base, '/api/roll', { room, playerId: ann.playerId, notation: '2d6' })).data.roll;
  const b = (await postTo(base, '/api/roll', { room, playerId: bram.playerId, notation: '2d6' })).data.roll;
  await waitForEvent(cass.stream, 'roll', (d) => d.rollId === b.rollId);
  assert.deepEqual(collectedOn(cass.stream), [a.rollId], 'a pour puts the previous pour away — two pools at one doorway would be one pile');
});

await t('a rethrow collects nothing, and the other chair\'s roll survives a whole turn', async () => {
  const room = 'wire-sweep-turn';
  const ann = await seat(base, room, 'Ann');
  const bram = await seat(base, room, 'Bram');
  const cass = await seat(base, room, 'Cass');
  const a = (await postTo(base, '/api/roll', { room, playerId: ann.playerId, notation: '2d6' })).data.roll;
  const turn = (await postTo(base, '/api/roll', { room, playerId: bram.playerId, notation: '3d6 t3' })).data.roll;
  const again = await postTo(base, '/api/rethrow', { room, playerId: bram.playerId, rollId: turn.rollId, keep: [0] });
  assert.equal(again.status, 200, again.text.slice(0, 200));
  await waitForEvent(cass.stream, 'rethrow', (d) => d.rollId === turn.rollId);
  assert.deepEqual(collectedOn(cass.stream), [], 'neither the turn\'s first throw nor its second put Ann\'s roll away');
});

await t('history that falls off the log falls off the table — LOG_CAP is a hard bound on an open roll', async () => {
  const room = 'wire-sweep-cap';
  const ann = await seat(base, room, 'Ann');
  const bram = await seat(base, room, 'Bram');
  const a = (await postTo(base, '/api/roll', { room, playerId: ann.playerId, notation: '1d6' })).data.roll;
  // Bram rolls a hundred times; Ann's open roll is the oldest entry when the
  // hundred-and-first pushes it out. Sequential on purpose — the order of the
  // log is the order of these responses.
  let last = null;
  for (let i = 0; i < 100; i++) {
    last = (await postTo(base, '/api/roll', { room, playerId: bram.playerId, notation: '1d6' })).data.roll;
  }
  await waitForEvent(ann.stream, 'roll', (d) => d.rollId === last.rollId, 15000);
  const cleared = ann.stream.events().filter((e) => e.type === 'roll-cleared').map((e) => e.data.rollId);
  assert.ok(cleared.includes(a.rollId), 'the room was told the fallen-off roll is cleared — nobody keeps dice the server has forgotten');
  const late = await joinRoom(room, 'Late');
  assert.equal(late.data.log.some((r) => r.rollId === a.rollId), false, 'and the snapshot no longer carries it');
  assert.deepEqual(openIn(late.data.log), [last.rollId], 'one open roll: Bram\'s newest');
  // Ordering: the clear reached the stream BEFORE the roll that pushed it out.
  const types = ann.stream.events();
  const iClear = types.findIndex((e) => e.type === 'roll-cleared' && e.data.rollId === a.rollId);
  const iRoll = types.findIndex((e) => e.type === 'roll' && e.data.rollId === last.rollId);
  assert.ok(iClear >= 0 && iClear < iRoll, 'cleared first, then the roll');
});

await Promise.all([proc, procFast, procDoor, procSweep].map(stopServer));

console.log(`${n - failed}/${n} places-wire checks passed`);
if (failed) process.exit(1);
