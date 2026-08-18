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

// tests/identity.test.mjs — `dice.who.v1`: authority outlives the tab.
// (docs/IDENTITY.md §5, rung 1.)
//
// THE TWO DEFECTS THIS SUITE WAS WRITTEN RED AGAINST (IDENTITY §3, verified in
// the tree 2026-08-17 and on no roadmap item at all):
//
//   1. A HELD ROLL'S REVEAL DIED WITH THE TAB THAT CHOSE IT. Hold a roll,
//      close the tab, come back: the re-join minted a fresh playerId,
//      handleReveal compares `visibility.revealAuthority` strictly, and nobody
//      could ever reveal it again — while U19's departed-roller admission lets
//      anyone SWEEP it. A stake that can be cleared unread and read by no one.
//      Goal 11 hangs that reveal on a PERSON; the implementation hung it on an
//      id whose life was shorter than the roll's.
//
//   2. YOUR OWN SECRET ROLLS VANISHED FROM YOUR OWN LOG. Online the server
//      owns the log; the re-join snapshot is projected for the NEW playerId and
//      projectEntryFor omits a secret entry for anyone but its roller. Same
//      tab-close, same cause.
//
// One cause — authority hung on a tab's lifetime — and one fix: an opaque
// browser key that lets a LAPSED seat be resumed, so THE SAME playerId comes
// back and every existing authority check heals with no new checks and no
// signature changes. That is why this file asserts through the ordinary
// endpoints (reveal, the join snapshot) rather than against a new one: if the
// fix needed a new check anywhere, it would be the wrong fix.
//
// THE REFUSAL IS LOAD-BEARING AND IS ASSERTED HERE TOO. A seat with a live
// client is never resumed, whoever asks: two tabs on one machine are two
// players (js/net.js), and a stranger who guesses a key must never be able to
// walk into a seat somebody is sitting in. Nor may `who` ever leave the front
// door — it is a bearer credential, and a credential in a roster payload is a
// leak with a schema (IDENTITY §5's five must-nots).
//
// RUNG 1's OWN WINDOW WAS THE NEXT DEFECT (IDENTITY §8, added 2026-08-18).
// Everything above is about a LAPSED seat — one the roster still holds. That
// window is DISCONNECT_GRACE_MS, five seconds, and a browser reloading this app
// announces itself 4.2–5.4 s after its old socket closed. So the promise held
// or broke on a coin toss (`seat-resume` failed four runs in six), and the
// player it broke for was the one on the slow phone. The fix separates the two
// clocks — the ROSTER drops a gone browser in seconds, as it always did; the
// SERVER remembers the seat for RESUME_TTL_MS — and the tests for it are at the
// bottom of this file, including the one that fails if the ghosts come back.
//
// A real server.js child on an ephemeral port — never 8123 (Joe's live table).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// server.js DISCONNECT_GRACE_MS (5s) is not overridable, and every resume below
// has to land inside it. Local HTTP calls clear that by three orders of
// magnitude — but it is the reason nothing here sleeps between the beacon and
// the join that follows it.

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
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 2000);
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

// THE SECOND SERVER, with both clocks shrunk (DICE_DISCONNECT_GRACE_MS,
// DICE_RESUME_TTL_MS). §8's whole claim is a RELATION between them — the roster
// lets go first, the server remembers longer — and asserting a relation needs
// both ends moved, not sped up in prose. Everything above stays on the DEFAULT
// server, where five seconds means five seconds: `the roster still lets a gone
// browser go on the old schedule` is the anti-ghost assertion and it is worth
// the wall-clock it costs.
const GRACE_MS = 400;
const TTL_MS = 4000;
const portFast = await freePort();
const procFast = await startServer(portFast, {
  DICE_DISCONNECT_GRACE_MS: String(GRACE_MS),
  DICE_RESUME_TTL_MS: String(TTL_MS),
});
const baseFast = `http://127.0.0.1:${portFast}`;

const post = async (path, body) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  // `text` is kept so a leak assertion can look at the BYTES that left, not at
  // a re-serialization of the fields this test happens to know about.
  return { status: res.status, data, text };
};

// One browser at the door. `who` is the localStorage key; `playerId` is the
// per-TAB seat memory, so a NEW TAB of the same browser is exactly a join that
// carries who and no playerId — which is the whole case rung 1 covers.
const joinAs = async (room, name, { who, playerId, color } = {}) => post('/api/join', {
  room,
  name,
  ...(who ? { who } : {}),
  ...(playerId ? { playerId } : {}),
  ...(color ? { color } : {}),
});

/** An SSE stream, opened the way a browser does, with its bytes kept. */
function openStream(room, playerId, streamId, at = base) {
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

/**
 * Seat a browser, open its stream, and hand back everything a later assertion
 * needs. The stream matters beyond bookkeeping: a seat that has never carried
 * one has not LAPSED, it is arriving, and the server must not confuse the two.
 */
const seat = async (room, name, who) => {
  const res = await joinAs(room, name, { who });
  assert.equal(res.status, 200, `join ${name}: ${res.text.slice(0, 200)}`);
  const streamId = `stream-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const stream = openStream(room, res.data.playerId, streamId);
  await streamUp(stream, `${name} @ ${room}`);
  return { ...res.data, streamId, stream, who };
};

/** What a closing tab actually does: the pagehide beacon (net.js leave()). */
const closeTab = async (room, me) => {
  const res = await post('/api/leave', { room, playerId: me.playerId, streamId: me.streamId });
  assert.equal(res.status, 200, `beacon: ${res.text.slice(0, 200)}`);
  me.stream.ac.abort();
};

const WHO_ALICE = 'who-alice-11111111-2222-3333-4444-555555555555';

// ---- the same four verbs, against the shrunk-clock server -------------------
// Spelled out rather than factored so the suite above keeps talking to the real
// clocks: every helper here is the one above with `base` swapped.

const postF = async (path, body) => {
  const res = await fetch(baseFast + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, data, text };
};

const joinF = (room, name, { who, playerId, color } = {}) => postF('/api/join', {
  room,
  name,
  ...(who ? { who } : {}),
  ...(playerId ? { playerId } : {}),
  ...(color ? { color } : {}),
});

const seatF = async (room, name, who) => {
  const res = await joinF(room, name, { who });
  assert.equal(res.status, 200, `join ${name}: ${res.text.slice(0, 200)}`);
  const streamId = `stream-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const stream = openStream(room, res.data.playerId, streamId, baseFast);
  await streamUp(stream, `${name} @ ${room}`);
  return { ...res.data, streamId, stream, who };
};

/** The tab is gone: the beacon lands, the socket dies. The reap follows. */
const closeTabF = async (room, me) => {
  const res = await postF('/api/leave', { room, playerId: me.playerId, streamId: me.streamId });
  assert.equal(res.status, 200, `beacon: ${res.text.slice(0, 200)}`);
  me.stream.ac.abort();
};

/**
 * Poll the roster until `check(names)` holds, and answer how long it took.
 *
 * The poll RESUMES one seat rather than joining a new one each time (the seatId
 * path adds no player), so watching a roster cannot change it — a fresh join
 * per tick would fill the room it is measuring, and its own pill would be in
 * every answer.
 */
const rosterWait = async (join, room, watcher, check, ms, desc) => {
  const t0 = Date.now();
  for (;;) {
    const res = await join(room, watcher.name, { playerId: watcher.playerId });
    const names = (res.data.players || []).map((p) => p.name);
    if (check(names)) return Date.now() - t0;
    if (Date.now() - t0 > ms) throw new Error(`${desc} — after ${Date.now() - t0}ms the roster is ${JSON.stringify(names)}`);
    await sleep(100);
  }
};

try {
  // ---- the mechanism ------------------------------------------------------

  await t('a LAPSED seat comes back to the browser that was sitting in it', async () => {
    const room = 'who-resume';
    const alice = await seat(room, 'Alice', WHO_ALICE);
    await closeTab(room, alice);

    // A new TAB: same browser (same who), no seat memory (sessionStorage went
    // with the tab). Before rung 1 this minted a stranger.
    const back = await joinAs(room, 'Alice', { who: WHO_ALICE });
    assert.equal(back.status, 200, `re-join accepted: ${back.text.slice(0, 200)}`);
    assert.equal(back.data.playerId, alice.playerId,
      'the SAME playerId comes back — which is what heals every authority check at once');
    assert.equal(back.data.color, alice.color, 'wearing the same color');

    // …and it is one seat, not two: resuming adds no player.
    assert.equal(back.data.players.filter((p) => p.name === 'Alice').length, 1,
      'exactly one Alice on the roster');
  });

  // ---- defect 1: the held roll -------------------------------------------

  await t("a held roll's reveal survives the tab that chose it", async () => {
    const room = 'who-held';
    const alice = await seat(room, 'Alice', WHO_ALICE);
    await seat(room, 'Bob', 'who-bob-only');

    const rolled = await post('/api/roll', {
      room, playerId: alice.playerId, dice: ['d20'], faceDown: true, label: 'the stake',
    });
    assert.equal(rolled.status, 200, `held roll accepted: ${rolled.text.slice(0, 200)}`);
    const rollId = rolled.data.roll.rollId;
    assert.equal(rolled.data.roll.redacted, true, 'held: face down for everyone, the roller included');

    await closeTab(room, alice);
    const back = await joinAs(room, 'Alice', { who: WHO_ALICE });
    assert.equal(back.status, 200, `re-join accepted: ${back.text.slice(0, 200)}`);

    // THE DEFECT, IN ONE LINE. Not a new endpoint, not a new check: the
    // ordinary reveal, refused before rung 1 with 403 not_reveal_authority
    // because the id that chose the visibility no longer existed.
    const reveal = await post('/api/reveal', { room, playerId: back.data.playerId, rollId });
    assert.equal(reveal.status, 200,
      `the chooser can still reveal their own held roll (got ${reveal.status} ${reveal.text.slice(0, 200)})`);

    // And it really flipped — a 200 that revealed nothing would be the green
    // check over the broken thing this project keeps writing.
    const seen = await joinAs(room, 'Bob2', { who: 'who-bob2-only' });
    const entry = seen.data.log.find((r) => r.rollId === rollId);
    assert.ok(entry, 'the roll is in the room log');
    assert.equal(entry.revealed, true, 'revealed for the table');
    assert.equal(entry.redacted, undefined, 'and no longer a redacted copy');
    assert.equal(typeof entry.total, 'number', 'with its total, which redaction omits entirely');
  });

  // ---- defect 2: your own secret rolls -----------------------------------

  await t('your own secret rolls are still yours when you come back', async () => {
    const room = 'who-secret';
    const alice = await seat(room, 'Alice', WHO_ALICE);
    await seat(room, 'Bob', 'who-bob-only');

    const rolled = await post('/api/roll', {
      room, playerId: alice.playerId, notation: 'd20 secret # my own business',
    });
    assert.equal(rolled.status, 200, `secret roll accepted: ${rolled.text.slice(0, 200)}`);
    const rollId = rolled.data.roll.rollId;
    assert.equal(typeof rolled.data.roll.total, 'number', "the roller sees their own secret roll's total");

    await closeTab(room, alice);
    const back = await joinAs(room, 'Alice', { who: WHO_ALICE });
    assert.equal(back.status, 200, `re-join accepted: ${back.text.slice(0, 200)}`);

    // THE DEFECT. projectEntryFor is untouched by rung 1 — it omits a secret
    // entry for anyone but its roller, exactly as it always did. What changed
    // is that the viewer coming back IS its roller again.
    const mine = back.data.log.find((r) => r.rollId === rollId);
    assert.ok(mine, 'the secret roll is still in my own log after coming back');
    assert.equal(typeof mine.total, 'number', 'with its values');

    // Redaction is still absent data, not hidden data, for everybody else.
    const bob2 = await joinAs(room, 'Bob2', { who: 'who-bob2-only' });
    assert.equal(bob2.data.log.some((r) => r.rollId === rollId), false,
      "and it does not exist for anyone else — the projection is unchanged");
  });

  // ---- the refusal --------------------------------------------------------

  await t('a LIVE seat is never resumed, whoever holds the key', async () => {
    const room = 'who-live';
    const alice = await seat(room, 'Alice', WHO_ALICE);

    // The second tab of a shared screen. Same browser, same key, and it stays
    // a second PLAYER: the net.js design holds, and who-resume exists only for
    // the seat nobody is on.
    const second = await joinAs(room, 'Alice', { who: WHO_ALICE });
    assert.equal(second.status, 200, 'the second tab still joins');
    assert.notEqual(second.data.playerId, alice.playerId,
      'a second tab of one browser is a second player, not a hijack');
    assert.equal(second.data.players.filter((p) => p.name === 'Alice').length, 2,
      'two Alices, which is what a shared screen means');

    // A STRANGER who has somehow learned the key gets the same answer: there
    // is no path here that hands out a seat somebody is sitting in.
    const thief = await joinAs(room, 'Mallory', { who: WHO_ALICE });
    assert.equal(thief.status, 200, 'the stranger joins as themselves');
    assert.notEqual(thief.data.playerId, alice.playerId, 'never into a live seat');
    assert.notEqual(thief.data.playerId, second.data.playerId, 'nor into the second tab');
    assert.equal(thief.data.players.filter((p) => p.name === 'Mallory').length, 1,
      'they are simply a new player at the table — refusal here means a fresh seat, never an error');
  });

  await t('a seat that has never opened a stream is ARRIVING, not lapsed', async () => {
    const room = 'who-arriving';
    // Two tabs of one browser restored at once: the first has joined but its
    // EventSource has not attached yet, so its seat has zero clients. It must
    // not be resumable, or a session restore lands both tabs on one seat.
    const first = await joinAs(room, 'Alice', { who: WHO_ALICE });
    assert.equal(first.status, 200);
    const secondTab = await joinAs(room, 'Alice', { who: WHO_ALICE });
    assert.notEqual(secondTab.data.playerId, first.data.playerId,
      'the tab still opening its stream keeps its own seat');
  });

  await t('leaving on purpose still means leaving', async () => {
    const room = 'who-left';
    const alice = await seat(room, 'Alice', WHO_ALICE);
    const gone = await post('/api/leave', {
      room, playerId: alice.playerId, streamId: alice.streamId, immediate: true,
    });
    assert.equal(gone.status, 200, "'Leave & switch seat' accepted");
    alice.stream.ac.abort();

    // The seat is DELETED, so there is nothing for who to resume. This is the
    // boundary, not a gap: an immediate leave is a gesture about the seat.
    const back = await joinAs(room, 'Alice', { who: WHO_ALICE });
    assert.equal(back.status, 200);
    assert.notEqual(back.data.playerId, alice.playerId,
      'a deliberate leave is not undone by coming back');
  });

  // ---- the five must-nots that are testable here --------------------------

  await t('who never leaves the front door', async () => {
    const room = 'who-egress';
    const alice = await seat(room, 'Alice', WHO_ALICE);

    // Bob is watching: his join snapshot, his roster, and every byte the
    // server writes down his stream.
    const bob = await seat(room, 'Bob', 'who-bob-only');
    await post('/api/roll', { room, playerId: alice.playerId, dice: ['d20'] });
    await post('/api/pools', { room, playerId: alice.playerId, pools: [{ id: 'p1', name: 'Sword', dice: ['d8'] }] });

    await closeTab(room, alice);
    const back = await joinAs(room, 'Alice', { who: WHO_ALICE });
    assert.equal(back.status, 200);
    await sleep(150); // let the broadcasts land on Bob's stream

    const bobSnapshot = await joinAs(room, 'Bob', { who: 'who-bob-only', playerId: bob.playerId });
    for (const [label, text] of [
      ['the resuming browser\'s own join response', back.text],
      ['a bystander\'s join snapshot', bobSnapshot.text],
      ['every byte of a bystander\'s event stream', bob.stream.text],
    ]) {
      assert.equal(text.includes(WHO_ALICE), false,
        `${label} carries no who (redaction is ABSENT data; a credential in a payload is a leak with a schema)`);
      assert.equal(/"who"\s*:/.test(text), false, `${label} carries no who FIELD either`);
    }
    bob.stream.ac.abort();
  });

  // ---- what rung 1 deliberately does NOT cover (IDENTITY §7's question) ---

  await t('a browser gone for good: swept by anybody, revealed by nobody', async () => {
    const room = 'who-orphan';
    const alice = await seat(room, 'Alice', WHO_ALICE);
    const bob = await seat(room, 'Bob', 'who-bob-only');
    const rolled = await post('/api/roll', {
      room, playerId: alice.playerId, dice: ['d20'], faceDown: true,
    });
    const rollId = rolled.data.roll.rollId;

    // Not a lapse — a REAP. (Forced here with the immediate leave so the suite
    // does not pay the 5s grace; after the grace, or after the ~74s liveness
    // sweep, the seat is gone in exactly the same way.)
    await post('/api/leave', {
      room, playerId: alice.playerId, streamId: alice.streamId, immediate: true,
    });
    alice.stream.ac.abort();

    // NOBODY can reveal it. No authority fallback is invented — matching a
    // departed authority by seat NAME is refused (server.js handleClearRoll
    // says why: duplicate names all join, so anyone could join as Alice).
    const backAsAlice = await joinAs(room, 'Alice', { who: WHO_ALICE });
    const tryReveal = await post('/api/reveal', {
      room, playerId: backAsAlice.data.playerId, rollId,
    });
    assert.equal(tryReveal.status, 403, 'a re-minted seat holds no reveal authority');
    assert.equal(tryReveal.data.code, 'not_reveal_authority');

    // …but ANYONE can sweep it (U19), so the felt is never permanently
    // occupied. This asymmetry — clearable unread, readable never — is the
    // standing price of goal 11 for a browser that is gone for good, and it
    // is IDENTITY §7's open question, not a bug rung 1 pretends to fix.
    const swept = await post('/api/clear-roll', { room, playerId: bob.playerId, rollId });
    assert.equal(swept.status, 200, 'a bystander can clear a departed roller\'s held roll');
    bob.stream.ac.abort();
  });

  // ---- the old doors, unchanged ------------------------------------------

  await t('a join with no who, or an unknown one, behaves exactly as it did', async () => {
    const room = 'who-absent';
    const alice = await seat(room, 'Alice', WHO_ALICE);
    await closeTab(room, alice);

    // No key at all (a client cached from before this shipped): a fresh seat,
    // which is what it always got.
    const plain = await joinAs(room, 'Alice');
    assert.equal(plain.status, 200);
    assert.notEqual(plain.data.playerId, alice.playerId, 'no key, no resume');

    // A key nobody's seat carries is not adopted either.
    const wrong = await joinAs(room, 'Alice', { who: 'who-somebody-else-entirely' });
    assert.equal(wrong.status, 200);
    assert.notEqual(wrong.data.playerId, alice.playerId, 'a foreign key resumes nothing');
  });

  await t('the seatId resume path is untouched', async () => {
    const room = 'who-seatid';
    const alice = await seat(room, 'Alice', WHO_ALICE);
    // A RELOAD: same tab, so sessionStorage still holds the seat and the
    // playerId rides the join. This branch ran before who existed and must
    // still be the one that answers.
    const reload = await joinAs(room, 'Alice', { who: WHO_ALICE, playerId: alice.playerId });
    assert.equal(reload.status, 200);
    assert.equal(reload.data.playerId, alice.playerId, 'a refresh is the same player');

    // An unknown seat id is still never adopted (seat-resume asserts this from
    // the browser; it is repeated here because who-resume sits beside it now).
    const bogus = await joinAs(room, 'Nobody', { playerId: 'not-a-seat' });
    assert.equal(bogus.status, 200);
    assert.notEqual(bogus.data.playerId, 'not-a-seat', 'the offered id is never adopted');
    alice.stream.ac.abort();
  });

  // ---- §8: the seat outlives the ROSTER, and the roster stays honest -------

  await t('THE GHOST CASE: a gone browser still leaves the roster on the old schedule', async () => {
    // THE ASSERTION THAT FAILS IF THE NAIVE FIX EVER LANDS. Lengthening
    // DISCONNECT_GRACE_MS would make every §8 test below pass and would put an
    // abandoned pill back on everyone's roster — the production bug (four seats,
    // one real window) whose fix cost a whole liveness protocol. So this one runs
    // on the DEFAULT server, against the real five seconds, and it is an upper
    // BOUND: a seat still shown ten seconds after its browser went is a ghost,
    // whatever the reason.
    const room = 'ghost-schedule';
    const watcher = (await joinAs(room, 'Watcher', { who: 'who-ghost-watcher' })).data;
    const alice = await seat(room, 'Alice', WHO_ALICE);
    await closeTab(room, alice);

    const took = await rosterWait(
      joinAs, room, { name: 'Watcher', playerId: watcher.playerId },
      (names) => !names.includes('Alice'), 10000,
      'the abandoned seat is still on the roster',
    );
    assert.ok(took < 10000, `the roster let it go in ${took}ms`);
    // …and not INSTANTLY either: the grace is what a reconnect survives on, and
    // a zero-grace roster would flap on every proxy blip.
    assert.ok(took > 1500, `it waited out a real grace first (took ${took}ms)`);
  });

  await t('the seat comes back AFTER the reap — the roster let go, the server did not', async () => {
    const room = 'vacated-basic';
    const bob = await seatF(room, 'Bob', 'who-bob-only');   // keeps the room alive
    const alice = await seatF(room, 'Alice', WHO_ALICE);
    await closeTabF(room, alice);

    // Past the grace: the seat is REAPED, not lapsed. Rung 1's door
    // (resumableSeatFor) has nothing left to find — the player object is gone
    // from room.players and every projection with it.
    await sleep(GRACE_MS + 300);
    const gone = await joinF(room, 'Peek', { who: 'who-peek' });
    assert.equal(gone.data.players.some((p) => p.name === 'Alice'), false,
      'the roster really did let the seat go');

    const back = await joinF(room, 'Alice', { who: WHO_ALICE });
    assert.equal(back.status, 200, `the return is accepted: ${back.text.slice(0, 200)}`);
    assert.equal(back.data.playerId, alice.playerId,
      'THE DEFECT: before this, a reload slower than five seconds came back a stranger');
    assert.equal(back.data.color, alice.color, 'wearing the same colour');
    assert.equal(back.data.players.filter((p) => p.name === 'Alice').length, 1,
      'and there is one Alice, not two');
    bob.stream.ac.abort();
  });

  await t('and the authority comes back with it — the held roll is still revealable', async () => {
    const room = 'vacated-held';
    const alice = await seatF(room, 'Alice', WHO_ALICE);
    const bob = await seatF(room, 'Bob', 'who-bob-only');
    const rolled = await postF('/api/roll', {
      room, playerId: alice.playerId, dice: ['d20'], faceDown: true, label: 'the stake',
    });
    const rollId = rolled.data.roll.rollId;

    await closeTabF(room, alice);
    await sleep(GRACE_MS + 300);   // reaped, not lapsed

    const back = await joinF(room, 'Alice', { who: WHO_ALICE });
    const reveal = await postF('/api/reveal', { room, playerId: back.data.playerId, rollId });
    assert.equal(reveal.status, 200,
      `the browser that chose the visibility still holds it (got ${reveal.status} ${reveal.text.slice(0, 200)})`);
    // It really flipped — a 200 that revealed nothing is the green check this
    // project keeps catching itself writing.
    const seen = await joinF(room, 'Bob2', { who: 'who-bob2-only' });
    const entry = seen.data.log.find((r) => r.rollId === rollId);
    assert.equal(entry.revealed, true, 'revealed for the table');
    assert.equal(typeof entry.total, 'number', 'with its total');
    bob.stream.ac.abort();
  });

  await t('the tab that reloads gets ITS chair, not its sibling\'s', async () => {
    // Two tabs of one browser, both gone: two stubs, one key. The seat id is
    // the sharper credential and it must win, or a reload lands on the other
    // tab's seat — and the other tab's held roll.
    const room = 'vacated-two-tabs';
    const keeper = await seatF(room, 'Keeper', 'who-keeper');
    const first = await seatF(room, 'Alice', WHO_ALICE);
    const second = await seatF(room, 'Alice', WHO_ALICE);
    assert.notEqual(first.playerId, second.playerId, 'two tabs are two players');
    await closeTabF(room, first);
    await closeTabF(room, second);
    await sleep(GRACE_MS + 300);

    const backFirst = await joinF(room, 'Alice', { who: WHO_ALICE, playerId: first.playerId });
    assert.equal(backFirst.data.playerId, first.playerId, 'the first tab reloads into its own seat');
    // And the key alone still answers for the OTHER one — most recent first,
    // which is rung 1's own rule (the seat whose held roll you came back for).
    const backSecond = await joinF(room, 'Alice', { who: WHO_ALICE });
    assert.equal(backSecond.data.playerId, second.playerId, 'the key answers for the seat that is left');
    // A stub is good for ONE return: a third arrival is simply a new player.
    const third = await joinF(room, 'Alice', { who: WHO_ALICE });
    assert.notEqual(third.data.playerId, first.playerId, 'no stub is handed out twice');
    assert.notEqual(third.data.playerId, second.playerId, 'nor the other');
    keeper.stream.ac.abort();
  });

  await t('a LIVE seat is never revived into, and leaving on purpose still buries nothing', async () => {
    const room = 'vacated-refusals';
    const alice = await seatF(room, 'Alice', WHO_ALICE);
    await closeTabF(room, alice);
    await sleep(GRACE_MS + 300);
    // Alice is back — the stub is spent and she is LIVE again.
    const back = await joinF(room, 'Alice', { who: WHO_ALICE });
    const streamId = 'stream-alice-live';
    const stream = openStream(room, back.data.playerId, streamId, baseFast);
    await streamUp(stream, 'Alice live again');
    const thief = await joinF(room, 'Mallory', { who: WHO_ALICE });
    assert.notEqual(thief.data.playerId, back.data.playerId,
      'a key that names a seat somebody is sitting in gets a seat of its own');
    assert.equal(thief.status, 200, 'and no error — refusal here is a fresh seat, never a "no"');

    // THE GESTURE. 'Leave & switch seat' removes the seat with `immediate`,
    // which must not leave a stub behind: leaving on purpose still means
    // leaving, and its client has already forgotten the seat.
    await postF('/api/leave', { room, playerId: back.data.playerId, streamId, immediate: true });
    stream.ac.abort();
    await sleep(GRACE_MS + 300);
    const after = await joinF(room, 'Alice', { who: WHO_ALICE });
    assert.notEqual(after.data.playerId, back.data.playerId,
      'a deliberate leave is not undone by coming back');
  });

  await t('a seat that never streamed is not remembered either', async () => {
    // An arrival that gave up (joined, never opened a stream) is not a lapse,
    // and it is the same bit that stops resumableSeatFor confusing the two.
    const room = 'vacated-arriving';
    const keeper = await seatF(room, 'Keeper', 'who-keeper');
    const ghost = await joinF(room, 'Alice', { who: WHO_ALICE });
    await postF('/api/leave', { room, playerId: ghost.data.playerId, immediate: true });
    await sleep(GRACE_MS + 300);
    const back = await joinF(room, 'Alice', { who: WHO_ALICE });
    assert.notEqual(back.data.playerId, ghost.data.playerId, 'nothing to come back to');
    keeper.stream.ac.abort();
  });

  await t('the window is a window: past it, gone for good is gone for good', async () => {
    const room = 'vacated-expiry';
    const keeper = await seatF(room, 'Keeper', 'who-keeper');
    const alice = await seatF(room, 'Alice', WHO_ALICE);
    const rolled = await postF('/api/roll', {
      room, playerId: alice.playerId, dice: ['d20'], faceDown: true,
    });
    const rollId = rolled.data.roll.rollId;
    await closeTabF(room, alice);
    await sleep(TTL_MS + GRACE_MS + 400);

    const back = await joinF(room, 'Alice', { who: WHO_ALICE });
    assert.notEqual(back.data.playerId, alice.playerId,
      'a browser gone longer than the window comes back a stranger — IDENTITY §7, unchanged');
    const tryReveal = await postF('/api/reveal', { room, playerId: back.data.playerId, rollId });
    assert.equal(tryReveal.status, 403, 'and holds no authority over the stake it left');
    assert.equal(tryReveal.data.code, 'not_reveal_authority');
    // …which is exactly the price §7 named: swept by anybody, revealed by nobody.
    const swept = await postF('/api/clear-roll', { room, playerId: keeper.playerId, rollId });
    assert.equal(swept.status, 200, 'a bystander can still clear it');
    keeper.stream.ac.abort();
  });

  await t('the stub table is bounded — a room cannot be made to remember forever', async () => {
    // MAX_VACATED_PER_ROOM is 8 and the oldest goes first. Nine walk-aways, and
    // the first one must be the one the room forgot.
    const room = 'vacated-cap';
    const keeper = await seatF(room, 'Keeper', 'who-keeper');
    const walkers = [];
    for (let i = 0; i < 9; i++) {
      const w = await seatF(room, `W${i}`, `who-walker-${i}`);
      walkers.push(w);
      await closeTabF(room, w);
      await sleep(GRACE_MS + 150);   // reaped one at a time, so age order is known
    }
    const oldest = await joinF(room, 'W0', { who: 'who-walker-0' });
    assert.notEqual(oldest.data.playerId, walkers[0].playerId,
      'the oldest stub was evicted at the cap, which is what bounds the memory');
    const newest = await joinF(room, 'W8', { who: 'who-walker-8' });
    assert.equal(newest.data.playerId, walkers[8].playerId, 'and the newest is still there');
    keeper.stream.ac.abort();
  });

  await t('a stub never becomes a way to see a player who is not there', async () => {
    // The projection invariant (GOALS goal 11): redaction is ABSENT data. A
    // vacated seat must be absent from every payload — no roster row, no
    // player-joined event, no `who` anywhere — until its browser really returns.
    const room = 'vacated-egress';
    const bob = await seatF(room, 'Bob', 'who-bob-only');
    const alice = await seatF(room, 'Alice', WHO_ALICE);
    await closeTabF(room, alice);
    await sleep(GRACE_MS + 300);

    const snap = await joinF(room, 'Peek', { who: 'who-peek' });
    assert.equal(snap.text.includes(alice.playerId), false,
      "the vacated seat's id is in no payload at all");
    assert.equal(snap.text.includes(WHO_ALICE), false, 'and neither is the key');
    assert.equal(snap.data.players.some((p) => p.name === 'Alice'), false, 'no row for a player who is not there');

    // And when she DOES come back, the room is told the ordinary way: a
    // player-joined, because the room really did see her leave.
    const back = await joinF(room, 'Alice', { who: WHO_ALICE });
    await sleep(150);
    assert.ok(bob.stream.text.includes('event: player-left'), "Bob saw the seat leave");
    assert.ok(bob.stream.text.includes('event: player-joined'), 'and saw it come back');
    assert.equal(bob.stream.text.includes(WHO_ALICE), false,
      'while the key stayed at the front door, as the five must-nots require');
    assert.equal(back.data.playerId, alice.playerId, 'as the same seat');
    bob.stream.ac.abort();
  });

  await t('a resume never costs a room its cap headroom', async () => {
    // The seatId resume sits AHEAD of the entity caps on purpose so a FULL
    // room can still let the players in it reload. who-resume adds no player
    // either, so it belongs on the same side of that line.
    const room = 'who-caps';
    const alice = await seat(room, 'Alice', WHO_ALICE);
    const before = (await joinAs(room, 'Watcher', { who: 'who-watcher' })).data.players.length;
    await closeTab(room, alice);
    const back = await joinAs(room, 'Alice', { who: WHO_ALICE });
    assert.equal(back.data.players.length, before, 'the roster did not grow');
  });
} finally {
  await stopServer(proc);
  await stopServer(procFast);
}

console.log(`identity: ${n - failed}/${n} passed`);
if (failed) process.exit(1);
