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

// tests/subtables.test.mjs — POST /api/split, the server half of sub-tables
// (ROADMAP §3b L4, CUJS.md CUJ5).
//
// What is worth proving here rather than in a browser:
//
//   * the DIRECTORY is scoped and bounded — a parent lists its breakouts to
//     everyone seated at it, at most MAX_CHILDREN of them, never twice, and
//     never to anybody who is not at that table;
//   * the POINTER is written ONCE — first writer wins, and a table that has
//     already been played at cannot be re-parented (or re-skinned) by a
//     stranger declaring itself its child;
//   * SPLITTING CREATES NO ROOM — the whole rate-budget argument rests on the
//     child being minted by an ordinary /api/join, and "this endpoint does not
//     allocate" is a claim only a test can hold down;
//   * the payloads stay PRESENT-OR-ABSENT, so a table that never split sends
//     what it sent before, byte for byte.
//
// A real server.js child on an ephemeral port — never 8123 (Joe's live table).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAX_CHILDREN = 8; // server.js MAX_CHILDREN — mirrored, and pinned below

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

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, data: await res.json().catch(() => null) };
};

const joinRoom = async (room, name, playerId) => {
  const res = await post('/api/join', playerId ? { room, name, playerId } : { room, name });
  assert.equal(res.status, 200, `join ${name} into ${room} failed: ${JSON.stringify(res.data)}`);
  return res.data;
};

const roomCount = async () => (await get('/health')).data.rooms;

try {
  // ---- the directory ------------------------------------------------------

  await t('a split lists the breakout to the parent, and to a player who was never told', async () => {
    const parent = 'split-lists';
    const alice = await joinRoom(parent, 'Alice');
    const res = await post('/api/split', {
      room: parent, playerId: alice.playerId, child: 'split-lists-kid', childName: 'The Vault',
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.applied, true);
    assert.deepEqual(res.data.children.map((c) => c.room), ['split-lists-kid']);

    // The point of a SCOPED directory: Bob is told without being told. He never
    // saw the split; he joins the parent afterwards and the breakout is there.
    const bob = await joinRoom(parent, 'Bob');
    assert.equal(bob.children.length, 1);
    assert.equal(bob.children[0].room, 'split-lists-kid');
    assert.equal(bob.children[0].name, 'The Vault');
    assert.ok(Number.isFinite(bob.children[0].at), 'and it carries when');
  });

  await t('a table that never split sends no parent and no children at all', async () => {
    const plain = await joinRoom('split-quiet', 'Alice');
    assert.equal(Object.hasOwn(plain, 'children'), false, 'children is absent, not []');
    assert.equal(Object.hasOwn(plain, 'parent'), false, 'parent is absent, not null');
  });

  await t('splitting twice to the same key is a no-op, not a twin', async () => {
    const parent = 'split-idem';
    const alice = await joinRoom(parent, 'Alice');
    await post('/api/split', { room: parent, playerId: alice.playerId, child: 'idem-kid', childName: 'A' });
    const again = await post('/api/split', { room: parent, playerId: alice.playerId, child: 'idem-kid', childName: 'B' });
    assert.equal(again.status, 200);
    assert.equal(again.data.applied, false, 'the second press applied nothing');
    assert.equal(again.data.children.length, 1);
    assert.equal(again.data.children[0].name, 'A', 'and it did not rename the first');
  });

  await t(`the directory is capped at ${MAX_CHILDREN}`, async () => {
    const parent = 'split-cap';
    const alice = await joinRoom(parent, 'Alice');
    for (let i = 0; i < MAX_CHILDREN; i++) {
      const res = await post('/api/split', { room: parent, playerId: alice.playerId, child: `cap-kid-${i}` });
      assert.equal(res.data.applied, true, `breakout ${i} was accepted`);
    }
    const over = await post('/api/split', { room: parent, playerId: alice.playerId, child: 'cap-kid-over' });
    assert.equal(over.status, 400);
    assert.equal(over.data.code, 'too_many_subtables');
    const still = await joinRoom(parent, 'Bob');
    assert.equal(still.children.length, MAX_CHILDREN, 'and the refusal appended nothing');
  });

  // ---- the pointer --------------------------------------------------------

  await t('the child declares its parent once, and inherits the felt with it', async () => {
    const parent = 'split-parent';
    const child = 'split-parent-kid';
    const alice = await joinRoom(parent, 'Alice');
    await post('/api/split', { room: parent, playerId: alice.playerId, child, childName: 'Sneaking' });

    const inChild = await joinRoom(child, 'Alice');
    const declared = await post('/api/split', {
      room: child, playerId: inChild.playerId,
      parent, parentName: 'Main Table',
      settings: { felt: 'crimson', system: 'dnd' },
    });
    assert.equal(declared.status, 200);
    assert.equal(declared.data.applied, true);
    assert.deepEqual(declared.data.parent, { room: parent, name: 'Main Table' });

    // Everyone after her reads it off the SERVER — the second player into a
    // breakout arrived by a link and knows nothing about where it came from.
    const bob = await joinRoom(child, 'Bob');
    assert.deepEqual(bob.parent, { room: parent, name: 'Main Table' });
    assert.equal(bob.settings.felt, 'crimson', 'the breakout is the same game');
    assert.equal(bob.settings.system, 'dnd', 'read by the same rulebook');
    assert.equal(bob.settings.tableName, '', 'and it did not inherit the parent’s name');
  });

  await t('a second declaration loses politely and cannot re-parent the table', async () => {
    const child = 'split-firstwins';
    const alice = await joinRoom(child, 'Alice');
    await post('/api/split', { room: child, playerId: alice.playerId, parent: 'real-parent', parentName: 'Real' });
    const hijack = await post('/api/split', {
      room: child, playerId: alice.playerId, parent: 'other-parent', parentName: 'Other',
      settings: { felt: 'crimson' },
    });
    assert.equal(hijack.status, 200);
    assert.equal(hijack.data.applied, false, 'the loser of the race did nothing wrong');
    assert.deepEqual(hijack.data.parent, { room: 'real-parent', name: 'Real' });
    const seen = await joinRoom(child, 'Bob');
    assert.equal(seen.parent.room, 'real-parent');
    assert.notEqual(seen.settings.felt, 'crimson', 'and the losing patch never landed');
  });

  await t('a table that has already been rolled at cannot be adopted (or re-skinned)', async () => {
    const room = 'split-started';
    const alice = await joinRoom(room, 'Alice');
    const rolled = await post('/api/roll', { room, playerId: alice.playerId, dice: ['d20'] });
    assert.equal(rolled.status, 200, `the roll should land: ${JSON.stringify(rolled.data)}`);
    const late = await post('/api/split', {
      room, playerId: alice.playerId, parent: 'somewhere', parentName: 'Somewhere',
      settings: { felt: 'crimson' },
    });
    assert.equal(late.status, 200);
    assert.equal(late.data.applied, false);
    assert.equal(late.data.parent, null);
    const seen = await joinRoom(room, 'Bob');
    assert.equal(Object.hasOwn(seen, 'parent'), false, 'no pointer was hung on a live table');
    assert.notEqual(seen.settings.felt, 'crimson', 'and no stranger repainted the felt');
  });

  await t('a breakout cannot split again — one level', async () => {
    const child = 'split-onelevel';
    const alice = await joinRoom(child, 'Alice');
    await post('/api/split', { room: child, playerId: alice.playerId, parent: 'its-parent' });
    const deeper = await post('/api/split', { room: child, playerId: alice.playerId, child: 'grandchild' });
    assert.equal(deeper.status, 403);
    assert.equal(deeper.data.code, 'already_a_subtable');
  });

  // ---- what it refuses ----------------------------------------------------

  await t('a stranger cannot write into a room they are not seated in', async () => {
    const parent = 'split-nosplit';
    await joinRoom(parent, 'Alice');
    const res = await post('/api/split', { room: parent, playerId: 'not-a-seat', child: 'ghost-kid' });
    assert.equal(res.status, 404);
    assert.equal(res.data.code, 'unknown_player');
    const seen = await joinRoom(parent, 'Bob');
    assert.equal(Object.hasOwn(seen, 'children'), false, 'and nothing was appended');
  });

  await t('both ends at once, neither end, and a self-split are all refused', async () => {
    const room = 'split-shapes';
    const alice = await joinRoom(room, 'Alice');
    const both = await post('/api/split', { room, playerId: alice.playerId, child: 'a', parent: 'b' });
    assert.equal(both.status, 400);
    assert.equal(both.data.code, 'bad_request');
    const neither = await post('/api/split', { room, playerId: alice.playerId });
    assert.equal(neither.status, 400);
    const empty = await post('/api/split', { room, playerId: alice.playerId, child: '   ' });
    assert.equal(empty.status, 400);
    assert.equal(empty.data.code, 'bad_room');
    const self = await post('/api/split', { room, playerId: alice.playerId, child: room });
    assert.equal(self.status, 400);
    assert.equal(self.data.code, 'bad_room');
  });

  await t('a breakout names itself: an inherited tableName is refused outright', async () => {
    const room = 'split-noname';
    const alice = await joinRoom(room, 'Alice');
    const res = await post('/api/split', {
      room, playerId: alice.playerId, parent: 'p', settings: { tableName: 'Stolen' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'bad_setting');
    const seen = await joinRoom(room, 'Bob');
    assert.equal(Object.hasOwn(seen, 'parent'), false, 'and the pointer did not land either');
    assert.equal(seen.settings.tableName, '');
  });

  await t('an invalid inherited setting takes the pointer down with it (validate before mutate)', async () => {
    const room = 'split-badfelt';
    const alice = await joinRoom(room, 'Alice');
    const res = await post('/api/split', {
      room, playerId: alice.playerId, parent: 'p', settings: { felt: 'not-a-felt' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'bad_setting');
    const seen = await joinRoom(room, 'Bob');
    assert.equal(Object.hasOwn(seen, 'parent'), false, 'nothing half-applied');
  });

  await t('the table name is cut and sanitized exactly as tableName is', async () => {
    const parent = 'split-clean';
    const alice = await joinRoom(parent, 'Alice');
    await post('/api/split', {
      room: parent, playerId: alice.playerId, child: 'clean-kid',
      childName: `  ${'x'.repeat(40)}​  `,
    });
    const seen = await joinRoom(parent, 'Bob');
    assert.equal(seen.children[0].name, 'x'.repeat(28), 'trimmed, zero-width stripped, cut at 28');
  });

  // ---- the claim the rate-budget argument rests on ------------------------

  await t('a split allocates no room — the child is minted by an ordinary join', async () => {
    const parent = 'split-noalloc';
    const alice = await joinRoom(parent, 'Alice');
    const before = await roomCount();
    const res = await post('/api/split', { room: parent, playerId: alice.playerId, child: 'noalloc-kid' });
    assert.equal(res.data.applied, true);
    assert.equal(await roomCount(), before, 'registering a breakout created nothing');
    await joinRoom('noalloc-kid', 'Alice');
    assert.equal(await roomCount(), before + 1, 'walking in is what created it');
  });

  // ---- the orphan ---------------------------------------------------------

  await t('an orphan keeps a working way back: the pointer is a key, not a handle', async () => {
    const parent = 'split-orphan';
    const child = 'split-orphan-kid';
    // A parent that exists, splits, and then dies when its last player leaves
    // (an unprepared room is deleted the moment it empties).
    const alice = await joinRoom(parent, 'Alice');
    await post('/api/split', { room: parent, playerId: alice.playerId, child, childName: 'Kid' });
    const inChild = await joinRoom(child, 'Alice');
    await post('/api/split', { room: child, playerId: inChild.playerId, parent, parentName: 'Main' });
    await post('/api/leave', { room: parent, playerId: alice.playerId, immediate: true });

    // The parent room object is gone…
    const health = await get('/health');
    assert.ok(health.data.rooms >= 1);
    // …and the child still says where to go back to, unchanged.
    const bob = await joinRoom(child, 'Bob');
    assert.deepEqual(bob.parent, { room: parent, name: 'Main' });
    // Following it walks into a room with that key — freshly created, empty,
    // and listing no breakouts, because a directory is live state.
    const back = await joinRoom(parent, 'Bob');
    assert.equal(Object.hasOwn(back, 'children'), false, 'the directory died with the room');
  });
} finally {
  await stopServer(proc);
}

console.log(`subtables: ${n - failed}/${n} passed`);
if (failed) process.exit(1);
