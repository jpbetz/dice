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

// tests/presence.test.mjs — how a seat LEAVES, at the protocol level.
//
// The bug this suite exists for: behind a proxy that terminates the client
// connection (Cloud Run), a closed tab leaves its stream open on the server
// and its writes succeeding, so the seat sat on the roster until the platform
// killed the request an hour later. Observed on the deployed table — four
// seats, one real window. Neither half of the fix is reachable from a browser
// test in under a minute, so it is proved here instead:
//
//   POST /api/leave  — the tab says it is going (beacon: soft, one stream;
//                      gesture: immediate, the whole seat)
//   POST /api/pong   — the client proves a stream is alive; one that stops
//                      answering is dropped no matter what the socket claims
//
// The clocks are shrunk through DICE_HEARTBEAT_MS / DICE_LIVENESS_TIMEOUT_MS,
// which exist for exactly this. DISCONNECT_GRACE_MS (5s) is NOT shrinkable, so
// tests that wait out a whole seat removal say so and pay for it once.
//
// A real server.js child on an ephemeral port — never 8123 (Joe's live table).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEARTBEAT_MS = 150;
const LIVENESS_MS = 500;
const GRACE_MS = 5000;   // server.js DISCONNECT_GRACE_MS, not overridable

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
    env: {
      ...process.env,
      PORT: String(port),
      DICE_HEARTBEAT_MS: String(HEARTBEAT_MS),
      DICE_LIVENESS_TIMEOUT_MS: String(LIVENESS_MS),
    },
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
  assert.equal(res.status, 200, `join ${name} failed: ${JSON.stringify(res.data)}`);
  return res.data;
};

/**
 * Open an SSE stream the way a browser does, and watch it the way the server
 * cares about: `ended` flips when the server drops us. `streamId` omitted
 * models a client cached from before the liveness protocol shipped.
 */
function openStream(room, playerId, streamId) {
  const ac = new AbortController();
  const state = { ended: false, pings: 0, ac, streamId };
  state.done = (async () => {
    const qs = `room=${encodeURIComponent(room)}&playerId=${encodeURIComponent(playerId)}`
      + (streamId ? `&streamId=${encodeURIComponent(streamId)}` : '');
    const res = await fetch(`${base}/api/events?${qs}`, { signal: ac.signal });
    if (!res.ok) { state.ended = true; return; }
    try {
      const decoder = new TextDecoder();
      for await (const chunk of res.body) {
        if (decoder.decode(chunk, { stream: true }).includes('event: ping')) state.pings++;
      }
    } catch { /* aborted or reset */ }
    state.ended = true;
  })();
  return state;
}

// The roster as a joiner sees it — the same list the rail renders.
//
// ONE watcher per room, RESUMING its own seat on every read (the seat the
// join response echoes back). Polling with a fresh join instead fills the
// room to MAX_PLAYERS_PER_ROOM and every later read 503s — which is a fine
// way to discover that a roster read is not free.
const watchers = new Map();
const roster = async (room) => {
  const held = watchers.get(room);
  const res = await post('/api/join', held
    ? { room, name: 'Watcher', playerId: held }
    : { room, name: 'Watcher' });
  assert.equal(res.status, 200, `roster read failed: ${JSON.stringify(res.data)}`);
  watchers.set(room, res.data.playerId);
  return res.data.players.map((p) => p.name);
};

const waitFor = async (predicate, timeout, label) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(50);
  }
  throw new Error(`timed out after ${timeout}ms waiting for: ${label}`);
};

try {
  // ---- POST /api/pong: the liveness protocol ------------------------------

  await t('a stream that answers its pings is never dropped', async () => {
    const room = 'pong-alive';
    const alice = await joinRoom(room, 'Alice');
    const stream = openStream(room, alice.playerId, 'stream-alive');
    await sleep(HEARTBEAT_MS * 2);

    // Answer for well over the staleness window.
    const until = Date.now() + LIVENESS_MS * 3;
    while (Date.now() < until) {
      const res = await post('/api/pong', { room, playerId: alice.playerId, streamId: 'stream-alive' });
      assert.equal(res.status, 200, 'a pong for a live stream is accepted');
      await sleep(HEARTBEAT_MS);
    }

    assert.equal(stream.ended, false, 'the stream is still open');
    assert.ok(stream.pings > 0, `the server actually pinged it (got ${stream.pings})`);
    assert.deepEqual((await roster(room)).filter((x) => x === 'Alice'), ['Alice'],
      'and Alice still holds her seat');
    stream.ac.abort();
  });

  await t('a stream that stops answering is dropped, socket be damned', async () => {
    const room = 'pong-stale';
    const alice = await joinRoom(room, 'Alice');
    // Never pongs. The socket stays perfectly writable throughout — which is
    // precisely the production case: on Cloud Run the writes kept succeeding
    // into the proxy long after the tab was gone.
    const stream = openStream(room, alice.playerId, 'stream-stale');

    await waitFor(() => stream.ended, LIVENESS_MS + HEARTBEAT_MS * 4 + 2000,
      'the silent stream to be dropped');
  });

  await t('the seat itself goes once its last stream is swept', async () => {
    const room = 'pong-seat';
    const alice = await joinRoom(room, 'Alice');
    openStream(room, alice.playerId, 'stream-doomed');

    // Sweep drops the stream, then the ordinary disconnect grace takes the
    // seat — one departure path, whatever noticed the departure.
    await waitFor(async () => !(await roster(room)).includes('Alice'),
      LIVENESS_MS + HEARTBEAT_MS * 4 + GRACE_MS + 3000,
      'Alice to lose her seat');
  });

  await t('a stream with no streamId is exempt (a client cached pre-liveness)', async () => {
    const room = 'pong-legacy';
    const alice = await joinRoom(room, 'Alice');
    const stream = openStream(room, alice.playerId, null);

    await sleep(LIVENESS_MS + HEARTBEAT_MS * 4 + 500);
    assert.equal(stream.ended, false,
      'an old client that cannot pong keeps the behavior it shipped with');
    assert.ok((await roster(room)).includes('Alice'), 'and keeps its seat');
    stream.ac.abort();
  });

  await t('a pong for a stream the server no longer holds says so', async () => {
    const room = 'pong-unknown';
    const alice = await joinRoom(room, 'Alice');
    const stream = openStream(room, alice.playerId, 'stream-real');
    await sleep(HEARTBEAT_MS * 2);

    const res = await post('/api/pong', { room, playerId: alice.playerId, streamId: 'not-a-stream' });
    assert.equal(res.status, 404, 'a deaf client is told, not humored');
    assert.equal(res.data.code, 'unknown_stream',
      'with the code net.js reopens the stream on');
    stream.ac.abort();
  });

  await t('pong refuses a body with no streamId', async () => {
    const room = 'pong-nostream';
    const alice = await joinRoom(room, 'Alice');
    const res = await post('/api/pong', { room, playerId: alice.playerId });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'bad_request');
  });

  // ---- POST /api/leave: saying it out loud --------------------------------

  await t('the beacon drops only the stream it names', async () => {
    const room = 'leave-beacon';
    const alice = await joinRoom(room, 'Alice');
    const first = openStream(room, alice.playerId, 'stream-one');
    const second = openStream(room, alice.playerId, 'stream-two');
    await sleep(HEARTBEAT_MS * 2);

    const res = await post('/api/leave', { room, playerId: alice.playerId, streamId: 'stream-one' });
    assert.equal(res.status, 200);

    await waitFor(() => first.ended, 3000, 'the named stream to be dropped');
    assert.equal(second.ended, false, 'the stream it did not name is untouched');
    // This is the reload case in miniature: a beacon fired by the dying page
    // must not take down the stream the reloaded page has already opened.
    assert.ok((await roster(room)).includes('Alice'), 'so the seat survives');
    second.ac.abort();
  });

  await t('a beacon with no streams left arms the grace, and the seat goes', async () => {
    const room = 'leave-grace';
    const alice = await joinRoom(room, 'Alice');
    const only = openStream(room, alice.playerId, 'stream-only');
    await sleep(HEARTBEAT_MS * 2);

    await post('/api/leave', { room, playerId: alice.playerId, streamId: 'stream-only' });
    await waitFor(() => only.ended, 3000, 'the stream to be dropped');
    assert.ok((await roster(room)).includes('Alice'),
      'still seated during the grace — a reload gets to sit back down');

    await waitFor(async () => !(await roster(room)).includes('Alice'), GRACE_MS + 3000,
      'the seat to reap after the grace');
  });

  await t('the immediate leave takes the seat now, not on a timer', async () => {
    const room = 'leave-now';
    const alice = await joinRoom(room, 'Alice');
    const stream = openStream(room, alice.playerId, 'stream-gesture');
    await sleep(HEARTBEAT_MS * 2);
    assert.ok((await roster(room)).includes('Alice'), 'seated to begin with');

    const res = await post('/api/leave', {
      room, playerId: alice.playerId, streamId: 'stream-gesture', immediate: true,
    });
    assert.equal(res.status, 200);
    // No sleep: 'Leave & switch seat' is a gesture, and making the room watch
    // a 5s countdown to see someone stand up reads as a bug.
    assert.ok(!(await roster(room)).includes('Alice'), 'gone at once');
    await waitFor(() => stream.ended, 3000, 'and its stream closed with it');
  });

  await t('leave refuses to speak for a player it cannot find', async () => {
    const room = 'leave-unknown';
    await joinRoom(room, 'Alice');
    const res = await post('/api/leave', { room, playerId: 'nobody', immediate: true });
    assert.equal(res.status, 404);
    assert.equal(res.data.code, 'unknown_player');
    assert.ok((await roster(room)).includes('Alice'), 'and Alice is untouched');
  });

  await t('a beacon sent as text/plain is honored (sendBeacon posts no JSON type)', async () => {
    const room = 'leave-beacon-type';
    const alice = await joinRoom(room, 'Alice');
    const stream = openStream(room, alice.playerId, 'stream-plain');
    await sleep(HEARTBEAT_MS * 2);

    // navigator.sendBeacon(url, string) sends text/plain;charset=UTF-8 — the
    // one content type that never needs a preflight a dying page cannot
    // complete. The server parses the body by content, not by its header.
    const res = await fetch(`${base}/api/leave`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ room, playerId: alice.playerId, streamId: 'stream-plain' }),
    });
    assert.equal(res.status, 200);
    await waitFor(() => stream.ended, 3000, 'the beacon to land');
  });
} finally {
  await stopServer(proc);
}

console.log(`presence: ${n - failed}/${n} passed`);
if (failed) process.exit(1);
