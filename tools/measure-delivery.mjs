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

// Measure encoded HTTP bodies, not fetch's automatically decoded bodies.
// Default: own child server on an ephemeral port. An optional https origin
// probes a deployment with GETs only. Never target the owner's live port.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PATHS = ['/', '/js/main.js', '/css/style.css', '/js/tunables.js', '/vendor/three.module.js', '/vendor/cannon-es.js'];
let child;
let origin;

async function localOrigin() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  assert.notEqual(port, 8123);
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), DICE_MODE: 'production', DICE_LOG_LEVEL: 'silent' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.pipe(process.stderr);
  const base = new URL(`http://127.0.0.1:${port}`);
  for (let tries = 0; tries < 100; tries++) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try { await get(new URL('/health', base), 'identity'); return base; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('server did not become ready');
}

function get(url, encoding) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(url, { headers: { 'Accept-Encoding': encoding } }, (res) => {
      const chunks = [];
      res.on('error', reject);
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body, ms: Number((performance.now() - start).toFixed(2)) });
      });
    });
    req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
  });
}

function decoded(res) {
  if (res.headers['content-encoding'] === 'br') return brotliDecompressSync(res.body);
  if (res.headers['content-encoding'] === 'gzip') return gunzipSync(res.body);
  assert.equal(res.headers['content-encoding'], undefined, 'unsupported response encoding');
  return res.body;
}

try {
  if (process.argv[2]) {
    origin = new URL(process.argv[2]);
    assert.equal(origin.protocol, 'https:', 'deployment probes require an https origin');
    assert.equal(origin.username + origin.password + origin.search + origin.hash, '', 'use an origin without credentials or parameters');
    assert.notEqual(origin.port, '8123', '8123 is the owner\'s live table');
    assert.equal(origin.pathname, '/', 'use an origin without a path');
  } else {
    origin = await localOrigin();
  }
  const rows = [];
  for (const path of PATHS) {
    let source;
    for (const encoding of ['identity', 'br', 'gzip']) {
      const url = new URL(path, origin);
      const first = await get(url, encoding);
      const warm = await get(url, encoding);
      assert.equal(first.status, 200, `${path}: first response`);
      assert.equal(warm.status, 200, `${path}: repeated response`);
      const body = decoded(first);
      source ??= body;
      assert.deepEqual(body, source, `${path}: encoding restores identical bytes`);
      assert.deepEqual(decoded(warm), source, `${path}: repeat restores identical bytes`);
      rows.push({ path, offered: encoding, encoding: first.headers['content-encoding'] || 'identity',
        bytes: first.body.length, firstMs: first.ms, warmMs: warm.ms });
    }
  }
  const totals = Object.fromEntries(['identity', 'br', 'gzip'].map((encoding) => [encoding,
    rows.filter((row) => row.offered === encoding).reduce((sum, row) => sum + row.bytes, 0)]));
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version,
    origin: child ? 'own ephemeral server, production mode' : origin.origin,
    scope: 'Six entry assets only; wire body bytes and individual sequential request time, not whole-page loading or device performance.',
    totals, rows }, null, 2));
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
