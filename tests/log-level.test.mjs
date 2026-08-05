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

// DICE_LOG_LEVEL — locks the default-off invariant for the noisy per-roll
// lines (roll/evict/collect/offer/claim/pools/setting/clrroll). A future
// refactor that silently flipped one back to log() would grow disk linearly
// with roll count on the default setting; this test would catch it.
//
// Two layers:
//   1. Unit: import server.js in-process and assert LOG_DEBUG is false / info
//      is on for the default env this file runs under.
//   2. Subprocess: spawn a real server on an ephemeral port (never 8123) with
//      DICE_LOG_LEVEL unset, drive one roll, and assert stdout contains the
//      info-tier `join` line but no debug-tier `roll ` line. Then spawn again
//      with DICE_LOG_LEVEL=debug and assert `roll ` DOES appear.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Ensure the env this test's own import sees is the default (DICE_LOG_LEVEL
// unset). If the test runner ever sets it, the unit-layer assertion below
// would misfire — surface that up front rather than silently pass.
assert.equal(
  process.env.DICE_LOG_LEVEL,
  undefined,
  'test file expects DICE_LOG_LEVEL unset — the whole point is to lock the default',
);

const { LOG_DEBUG, LOG_INFO, LOG_THRESHOLD } = await import('../server.js');

// Unit layer: default env means info is on and debug is off. Together these
// two constants pin the ladder middle — moving the default up or down would
// break either one and prompt an intentional test update.
assert.equal(LOG_DEBUG, false, 'DICE_LOG_LEVEL default must not enable debug');
assert.equal(LOG_INFO, true, 'DICE_LOG_LEVEL default must still emit info');
assert.equal(typeof LOG_THRESHOLD, 'number', 'LOG_THRESHOLD must be numeric');

// Subprocess layer: drive a real roll and read what actually hits stdout.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function runOneRoll({ level }) {
  const port = await freePort();
  const env = { ...process.env, PORT: String(port) };
  // Delete so an unset env truly is unset — {level:undefined} spread leaves
  // the key present with value 'undefined' as a string on some Node paths.
  if (level == null) delete env.DICE_LOG_LEVEL;
  else env.DICE_LOG_LEVEL = level;

  const proc = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', (d) => (out += d));
  proc.stderr.on('data', (d) => (out += d));

  // Wait for the listener; the startup log appears whether debug is on or off
  // (that line is info-tier).
  for (let i = 0; i < 200; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 25));
  }

  try {
    // Join a fresh room, open the SSE stream (a join without an events reader
    // triggers a JOIN_GRACE_MS reap on shutdown but that's slower than we need
    // — the roll POST fires while the stream is live).
    const joinRes = await fetch(`http://127.0.0.1:${port}/api/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'log-level-test', name: 'Tester' }),
    });
    assert.equal(joinRes.status, 200, 'join must succeed');
    const { playerId } = await joinRes.json();

    const sseCtl = new AbortController();
    const sse = fetch(
      `http://127.0.0.1:${port}/api/events?room=log-level-test&playerId=${encodeURIComponent(playerId)}`,
      { signal: sseCtl.signal, headers: { accept: 'text/event-stream' } },
    );
    // Discard the SSE body in the background so the server doesn't backpressure.
    sse.then((r) => r.body?.on('data', () => {})).catch(() => {});

    // Give the SSE stream a moment to attach.
    await new Promise((r) => setTimeout(r, 50));

    const rollRes = await fetch(`http://127.0.0.1:${port}/api/roll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'log-level-test', playerId, notation: '1d6' }),
    });
    assert.equal(rollRes.status, 200, `roll must succeed; got ${rollRes.status} ${await rollRes.text()}`);

    // Let the roll's log line flush before we kill the process.
    await new Promise((r) => setTimeout(r, 100));
    sseCtl.abort();
  } finally {
    proc.kill('SIGTERM');
    await new Promise((r) => proc.on('exit', r));
  }
  return out;
}

// Default env: `join` line lands (info) but `roll ` line does not (debug off).
{
  const out = await runOneRoll({ level: null });
  assert.match(out, /join\s+room="log-level-test"/, `default env must still log join lines\n---\n${out}\n---`);
  assert.doesNotMatch(out, /^\[dice [^\]]+\] roll\s/m, `default env must NOT log per-roll lines\n---\n${out}\n---`);
}

// DICE_LOG_LEVEL=debug: the roll line appears.
{
  const out = await runOneRoll({ level: 'debug' });
  assert.match(out, /roll\s+room="log-level-test"/, `debug env must log per-roll lines\n---\n${out}\n---`);
}

console.log('log-level.test: ok');
