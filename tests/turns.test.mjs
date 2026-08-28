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

// tests/turns.test.mjs — POST /api/rethrow, the server half of a TURN
// (MECHANICS M2, docs/MECHANICS.md).
//
// This is the endpoint that gives an existing entry NEW VALUES, and it is the
// only one that does. What is worth proving here rather than in a browser:
//
//   * the BUDGET is the server's — a t3 turn takes exactly three throws and a
//     fourth is refused, whatever the client believes;
//   * KEPT DICE DO NOT MOVE. The whole mechanic is that a kept face survives,
//     so it is asserted face by face against 40 throws rather than once;
//   * only the ROLLER throws again, and a stranger asking about a turn they
//     cannot see gets the same 404 as a stranger asking about nothing;
//   * a plain roll is UNCHANGED on the wire — no `throws` key, and it refuses
//     to be re-thrown at all;
//   * VISIBILITY BELONGS TO THE TURN (Q2). A held turn's re-throw tells the
//     table THAT dice moved and never what they came up.
//
// A real server.js child on an ephemeral port — never 8123 (Joe's live table).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

async function startServer(port) {
  const proc = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port) },
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

const post = async (path, body) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const joinRoom = async (room, name) => {
  const res = await post('/api/join', { room, name });
  assert.equal(res.status, 200, `join ${name} into ${room} failed: ${JSON.stringify(res.data)}`);
  return res.data;
};

// A turn, rolled. Returns { me, roll }.
const startTurn = async (room, notation = '6d6 t3', name = 'Alice') => {
  const me = await joinRoom(room, name);
  const res = await post('/api/roll', {
    room, playerId: me.playerId, ...parseSpec(notation),
  });
  assert.equal(res.status, 200, `roll failed: ${JSON.stringify(res.data)}`);
  return { me, roll: res.data.roll };
};

// Plain turns go in as an EXPLICIT spec — the grammar is notation.test.mjs's
// job and this file keeps the two concerns apart. Visibility is the one thing
// that cannot: the server refuses a `visibility` field on purpose ("chosen in
// notation, not sent as a field"), so those cases send the string and prove
// the two halves agree at the same time.
function parseSpec(notation) {
  const m = /^(\d+)d(\d+)(?:\s+t(\d+))?(?:\s+(held|secret))?$/.exec(notation);
  if (!m) throw new Error(`turns.test: cannot build a spec from ${notation}`);
  if (m[4]) return { notation };
  const dice = Array(Number(m[1])).fill(`d${m[2]}`);
  const out = { dice };
  if (m[3]) out.mods = { throws: Number(m[3]) };
  return out;
}

try {
  // ---- the budget ---------------------------------------------------------

  await t('a turn is born with its budget, and a plain roll has no budget at all', async () => {
    const { roll } = await startTurn('turn-born');
    assert.deepEqual(roll.throws, { max: 3, used: 1 },
      'the first throw is a throw, so used starts at 1');

    const plain = await startTurn('turn-born-plain', '6d6');
    assert.equal('throws' in plain.roll, false,
      'a plain roll carries no throws key — the payload is what it always was');
  });

  await t('a t3 turn takes exactly three throws and refuses a fourth', async () => {
    const room = 'turn-budget';
    const { me, roll } = await startTurn(room);
    const body = { room, playerId: me.playerId, rollId: roll.rollId, keep: [0] };

    const second = await post('/api/rethrow', body);
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.deepEqual(second.data.roll.throws, { max: 3, used: 2 });

    const third = await post('/api/rethrow', body);
    assert.equal(third.status, 200);
    assert.deepEqual(third.data.roll.throws, { max: 3, used: 3 });

    const fourth = await post('/api/rethrow', body);
    assert.equal(fourth.status, 400, 'a fourth throw is refused');
    assert.equal(fourth.data.code, 'no_throws_left');
  });

  await t('a plain roll cannot be re-thrown', async () => {
    const room = 'turn-plain-refuses';
    const { me, roll } = await startTurn(room, '6d6');
    const res = await post('/api/rethrow', {
      room, playerId: me.playerId, rollId: roll.rollId, keep: [],
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'not_a_turn');
  });

  // ---- the mechanic itself ------------------------------------------------

  await t('kept dice keep their faces and thrown dice are re-thrown — over 40 turns', async () => {
    const room = 'turn-keeps';
    let moved = 0;   // thrown dice that actually changed value
    let throwsMade = 0;
    for (let i = 0; i < 40; i++) {
      const { me, roll } = await startTurn(`${room}-${i}`);
      const before = roll.values.slice();
      const keep = [0, 2, 4];
      const res = await post('/api/rethrow', {
        room: `${room}-${i}`, playerId: me.playerId, rollId: roll.rollId, keep,
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const after = res.data.roll.values;
      assert.equal(after.length, before.length, 'a re-throw never changes the die count');
      for (const k of keep) {
        assert.equal(after[k], before[k],
          `die ${k} was kept and must not move (turn ${i}: ${before} -> ${after})`);
      }
      for (const k of [1, 3, 5]) { throwsMade++; if (after[k] !== before[k]) moved++; }
    }
    // Every thrown die is re-rolled, but a d6 lands on its old face 1 time in
    // 6, so the honest assertion is statistical: over 120 re-thrown dice,
    // ~100 should differ. A stuck implementation that returned the old value
    // would score 0, and one that re-threw nothing would too.
    assert.ok(moved > throwsMade * 0.6,
      `re-thrown dice actually move (${moved}/${throwsMade} changed; a no-op scores 0)`);
  });

  await t('keeping every die is refused, and spends no throw', async () => {
    const room = 'turn-keep-all';
    const { me, roll } = await startTurn(room);
    const res = await post('/api/rethrow', {
      room, playerId: me.playerId, rollId: roll.rollId, keep: [0, 1, 2, 3, 4, 5],
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'nothing_thrown');
    // …and the budget is untouched, which is the half that matters: a refusal
    // that still spent a throw would silently shorten the turn.
    const after = await post('/api/rethrow', {
      room, playerId: me.playerId, rollId: roll.rollId, keep: [0],
    });
    assert.deepEqual(after.data.roll.throws, { max: 3, used: 2 });
  });

  await t('a die index this roll does not have is refused', async () => {
    const room = 'turn-bad-index';
    const { me, roll } = await startTurn(room);
    for (const keep of [[6], [-1], ['0'], [1.5], 'nope']) {
      const res = await post('/api/rethrow', {
        room, playerId: me.playerId, rollId: roll.rollId, keep,
      });
      assert.equal(res.status, 400, `keep ${JSON.stringify(keep)} must be refused`);
      assert.equal(res.data.code, 'bad_keep');
    }
  });

  await t('the total follows the faces', async () => {
    const room = 'turn-total';
    const { me, roll } = await startTurn(room);
    const res = await post('/api/rethrow', {
      room, playerId: me.playerId, rollId: roll.rollId, keep: [0],
    });
    const r = res.data.roll;
    assert.equal(r.total, r.values.reduce((a, b) => a + b, 0),
      `total is the sum of the faces after a re-throw (${r.values} -> ${r.total})`);
  });

  // ---- who may ------------------------------------------------------------

  await t('only the roller may throw again', async () => {
    const room = 'turn-authority';
    const { me, roll } = await startTurn(room);
    const bob = await joinRoom(room, 'Bob');
    const res = await post('/api/rethrow', {
      room, playerId: bob.playerId, rollId: roll.rollId, keep: [0],
    });
    assert.equal(res.status, 403);
    assert.equal(res.data.code, 'not_roller');
  });

  await t('a secret turn does not exist for anyone else — not even as a 403', async () => {
    const room = 'turn-secret';
    const { roll } = await startTurn(room, '6d6 t3 secret');
    const bob = await joinRoom(room, 'Bob');
    const res = await post('/api/rethrow', {
      room, playerId: bob.playerId, rollId: roll.rollId, keep: [0],
    });
    assert.equal(res.status, 404, 'the same answer as a rollId that never existed');
    assert.equal(res.data.code, 'unknown_roll');
  });

  // ---- visibility belongs to the TURN (Q2) --------------------------------

  await t("a held turn's re-throw carries no values, and still says a throw happened", async () => {
    const room = 'turn-held';
    const { me, roll } = await startTurn(room, '6d6 t3 held');
    assert.equal(roll.redacted, true, 'held: even the roller gets a redacted entry');
    assert.deepEqual(roll.throws, { max: 3, used: 1 },
      'the budget is a STAKE and survives redaction');

    const res = await post('/api/rethrow', {
      room, playerId: me.playerId, rollId: roll.rollId, keep: [0],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const r = res.data.roll;
    assert.equal(r.redacted, true, 'still face down after a re-throw');
    assert.equal(r.values, undefined, 'and carries no values');
    assert.equal(r.total, undefined, 'nor a total');
    assert.deepEqual(r.throws, { max: 3, used: 2 },
      'while the table can still see a throw was spent');
  });

  // ---- the film data is not entry state ------------------------------------

  await t('thrown and seed never stick to the entry', async () => {
    const room = 'turn-no-film-state';
    const { me, roll } = await startTurn(room);
    const res = await post('/api/rethrow', {
      room, playerId: me.playerId, rollId: roll.rollId, keep: [0],
    });
    const r = res.data.roll;
    assert.equal('thrown' in r, false,
      'which dice moved describes ONE throw and must not ride the entry');
    assert.equal('throwSeed' in r, false, 'nor how they tumbled');
  });
  // ---- PUSH-YOUR-LUCK (MECHANICS M4) --------------------------------------

  const startPush = async (room, notation = '6d6 push>=5', name = 'Alice') => {
    const me = await joinRoom(room, name);
    const res = await post('/api/roll', { room, playerId: me.playerId, notation });
    assert.equal(res.status, 200, `push roll failed: ${JSON.stringify(res.data)}`);
    return { me, roll: res.data.roll };
  };

  // A push turn that is STILL ALIVE, which is not the same thing as a push
  // turn that was rolled.
  //
  // `6d6 push>=5` busts on its first throw whenever all six dice come up
  // under 5 — (2/3)^6, about ONE TURN IN ELEVEN — and a busted turn correctly
  // refuses to be banked or thrown again. A test that rolls once and assumes
  // it can bank therefore fails about 9% of the time, which is exactly the
  // rate that gets dismissed as noise and switched off. It cost one run to
  // find and is fixed here rather than retried: any case that needs a live
  // turn asks for one.
  const startLivePush = async (room, notation = '6d6 push>=5', name = 'Alice') => {
    for (let i = 0; i < 40; i++) {
      const got = await startPush(`${room}-${i}`, notation, name);
      if (!got.roll.push.busted) return { ...got, room: `${room}-${i}` };
    }
    throw new Error('forty consecutive push rolls busted on their first throw — '
      + 'that is 1 in 10^40 by chance, so the bust rule is wrong');
  };

  await t('a push roll is born with its rule, its scoring dice and a budget', async () => {
    const { roll } = await startPush('push-born');
    assert.deepEqual(roll.push.rule, { min: 5 }, 'the rule it was declared with');
    assert.equal(roll.throws.max, 20,
      'push is a turn with a big budget — the cap bounds the felt, it is not the end condition');
    // The scoring set is a FACT about the faces, so it is checkable against them.
    const expected = roll.values.map((v, i) => (v >= 5 ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(roll.push.scoring, expected,
      `every die showing 5 or 6 is named (${roll.values})`);
    assert.equal(roll.push.busted, expected.length === 0,
      'and a first throw with nothing scoring in it busts immediately');
    assert.equal(roll.push.banked, false);
  });

  await t('a plain roll and a t3 turn carry no push state at all', async () => {
    assert.equal('push' in (await startTurn('push-absent-plain', '6d6')).roll, false);
    assert.equal('push' in (await startTurn('push-absent-turn')).roll, false);
  });

  await t('the tally counts the kept SCORING dice, and nothing else — over 40 turns', async () => {
    let sawNonScoringKept = 0;
    for (let i = 0; i < 40; i++) {
      const room = `push-tally-${i}`;
      const { me, roll } = await startPush(room);
      if (roll.push.busted) continue;
      // Keep everything, so the tally has to do the discriminating.
      const keep = roll.values.map((_, k) => k);
      const res = await post('/api/rethrow', { room, playerId: me.playerId, rollId: roll.rollId, keep });
      // Keeping every die is refused as a throw — bank instead, which is the
      // same arithmetic through the other door.
      assert.equal(res.status, 400, 'keeping everything is not a throw');
      const bank = await post('/api/bank', { room, playerId: me.playerId, rollId: roll.rollId, keep });
      assert.equal(bank.status, 200, JSON.stringify(bank.data));
      const scoring = roll.values.filter((v) => v >= 5);
      assert.equal(bank.data.roll.push.tally.count, scoring.length,
        `count is the scoring dice only (${roll.values})`);
      assert.equal(bank.data.roll.push.tally.sum, scoring.reduce((a, b) => a + b, 0),
        `sum is their faces only (${roll.values})`);
      if (scoring.length < roll.values.length) sawNonScoringKept++;
    }
    assert.ok(sawNonScoringKept > 0,
      'and at least one of those turns kept a die that does not score, which is what the test is for');
  });

  await t('a throw with nothing scoring in it busts, and the tally goes with it', async () => {
    // Driven to a real bust rather than mocked: throw one die on `push>=6`
    // until a throw misses. 5/6 of throws miss, so this ends fast.
    const room = 'push-bust';
    const me = await joinRoom(room, 'Alice');
    let busted = null;
    for (let i = 0; i < 200 && !busted; i++) {
      const res = await post('/api/roll', {
        room, playerId: me.playerId, notation: '1d6 push>=6',
      });
      assert.equal(res.status, 200);
      if (res.data.roll.push.busted) busted = res.data.roll;
    }
    assert.ok(busted, 'a bust happens within 200 single-die throws');
    assert.deepEqual(busted.push.tally, { count: 0, sum: 0 }, 'a bust keeps nothing');
    assert.deepEqual(busted.push.scoring, [], 'and nothing scored, which is why');
    // …and the turn is over: no more throwing, no banking a bust.
    const again = await post('/api/rethrow', {
      room, playerId: me.playerId, rollId: busted.rollId, keep: [],
    });
    assert.equal(again.status, 400);
    assert.equal(again.data.code, 'turn_is_over');
    const bank = await post('/api/bank', {
      room, playerId: me.playerId, rollId: busted.rollId, keep: [],
    });
    assert.equal(bank.status, 400);
    assert.equal(bank.data.code, 'already_busted');
  });

  await t('banking ends the turn, and only the roller may do it', async () => {
    const { me, roll, room } = await startLivePush('push-bank');
    const bob = await joinRoom(room, 'Bob');
    const theirs = await post('/api/bank', {
      room, playerId: bob.playerId, rollId: roll.rollId, keep: [0],
    });
    assert.equal(theirs.status, 403);
    assert.equal(theirs.data.code, 'not_roller');

    const mine = await post('/api/bank', {
      room, playerId: me.playerId, rollId: roll.rollId, keep: [0],
    });
    assert.equal(mine.status, 200, JSON.stringify(mine.data));
    assert.equal(mine.data.roll.push.banked, true);
    // Idempotent, like reveal — and a banked turn throws no more.
    assert.equal((await post('/api/bank', {
      room, playerId: me.playerId, rollId: roll.rollId, keep: [0],
    })).status, 200, 'banking twice is idempotent');
    const after = await post('/api/rethrow', {
      room, playerId: me.playerId, rollId: roll.rollId, keep: [0],
    });
    assert.equal(after.status, 400);
    assert.equal(after.data.code, 'turn_is_over');
  });

  await t('a held push is refused at BOTH doors', async () => {
    const room = 'push-held';
    const me = await joinRoom(room, 'Alice');
    // The grammar door.
    const viaNotation = await post('/api/roll', {
      room, playerId: me.playerId, notation: '6d6 push>=5 held',
    });
    assert.equal(viaNotation.status, 400, JSON.stringify(viaNotation.data));
    // The explicit-spec door, which never sees a notation string. A refusal
    // that only exists in the grammar is a suggestion.
    const viaSpec = await post('/api/roll', {
      room, playerId: me.playerId,
      dice: ['d6', 'd6'], mods: { push: { min: 5 } }, faceDown: true,
    });
    assert.equal(viaSpec.status, 400, JSON.stringify(viaSpec.data));
    assert.equal(viaSpec.data.code, 'push_cannot_be_held');
  });

  await t('a push turn cannot be re-thrown by someone else, and does not exist if secret', async () => {
    const room = 'push-secret';
    const { roll } = await startPush(room, '6d6 push>=5 secret');
    const bob = await joinRoom(room, 'Bob');
    const res = await post('/api/bank', {
      room, playerId: bob.playerId, rollId: roll.rollId, keep: [],
    });
    assert.equal(res.status, 404, 'the same answer as a rollId that never existed');
  });

  await t('a whispered push leaks no faces to the room, and still shows its rule', async () => {
    const room = 'push-whisper';
    const alice = await joinRoom(room, 'Alice');
    const bob = await joinRoom(room, 'Bob');
    const res = await post('/api/roll', {
      room, playerId: alice.playerId, notation: '6d6 push>=5 w:Bob',
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    // Carol is outside the audience: she gets the projection everyone else does.
    const carol = await joinRoom(room, 'Carol');
    const seen = (carol.log || []).find((e) => e.rollId === res.data.roll.rollId);
    assert.ok(seen, 'the roll exists for her');
    assert.equal(seen.redacted, true, 'redacted');
    assert.deepEqual(seen.push, { rule: { min: 5 } },
      'she is told what would score — a public stake — and nothing about what did');
    assert.equal(seen.push.scoring, undefined, 'no scoring set');
    assert.equal(seen.push.tally, undefined, 'no tally');
    assert.equal(seen.values, undefined, 'and no values');
  });

} finally {
  await stopServer(proc);
}

if (!failed) console.log(`turns: ${n} passed`);
else console.error(`turns: ${failed} of ${n} FAILED`);
