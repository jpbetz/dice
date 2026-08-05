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

// tests/static-cache.test.mjs — ROADMAP §0b bandwidth pass. streamFile must:
//   * hand /vendor/ a year-long immutable Cache-Control (frozen third-party)
//   * keep no-cache on the mutable app tree so browsers revalidate
//   * answer If-Modified-Since >= mtime with a body-less 304
//   * refuse to short-circuit on a malformed IMS (Number.isFinite guard)
//   * still work for a directory URL that resolves to index.html
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

try {
  // ---- Cache-Control ------------------------------------------------------

  await t('/vendor/ carries the year-long immutable Cache-Control', async () => {
    const res = await fetch(`${base}/vendor/three.module.js`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    await res.arrayBuffer();
  });

  await t('/js/ stays no-cache so the browser always revalidates', async () => {
    const res = await fetch(`${base}/js/main.js`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    await res.arrayBuffer();
  });

  await t('the root index.html stays no-cache too', async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    await res.arrayBuffer();
  });

  // ---- 304 revalidation ---------------------------------------------------

  // The Last-Modified the server just handed us is exactly the value a
  // conformant browser will echo back — the golden IMS.
  await t('If-Modified-Since equal to Last-Modified returns 304 with an empty body', async () => {
    const first = await fetch(`${base}/js/main.js`);
    assert.equal(first.status, 200);
    const lastMod = first.headers.get('last-modified');
    assert.ok(lastMod, 'server should send Last-Modified');
    await first.arrayBuffer();

    const revalidate = await fetch(`${base}/js/main.js`, {
      headers: { 'If-Modified-Since': lastMod },
    });
    assert.equal(revalidate.status, 304);
    assert.equal(revalidate.headers.get('content-length'), null,
      '304 must not advertise a body');
    const body = await revalidate.arrayBuffer();
    assert.equal(body.byteLength, 0, '304 body must be empty');
    // The Last-Modified is preserved on the 304 so the browser can keep its
    // own bookkeeping intact across revalidations.
    assert.equal(revalidate.headers.get('last-modified'), lastMod);
  });

  await t('If-Modified-Since NEWER than mtime still returns 304 (browser has a fresh copy)', async () => {
    const first = await fetch(`${base}/js/main.js`);
    const lastMod = first.headers.get('last-modified');
    await first.arrayBuffer();
    const future = new Date(Date.parse(lastMod) + 60_000).toUTCString();
    const res = await fetch(`${base}/js/main.js`, {
      headers: { 'If-Modified-Since': future },
    });
    assert.equal(res.status, 304);
    await res.arrayBuffer();
  });

  await t('If-Modified-Since OLDER than mtime returns 200 with the full body', async () => {
    const first = await fetch(`${base}/js/main.js`);
    const lastMod = first.headers.get('last-modified');
    const size = Number(first.headers.get('content-length'));
    await first.arrayBuffer();
    const past = new Date(Date.parse(lastMod) - 60_000).toUTCString();
    const res = await fetch(`${base}/js/main.js`, {
      headers: { 'If-Modified-Since': past },
    });
    assert.equal(res.status, 200);
    const body = await res.arrayBuffer();
    assert.equal(body.byteLength, size, 'stale IMS must fetch the full body');
  });

  await t('malformed If-Modified-Since falls through to a full 200 (Number.isFinite guard)', async () => {
    // "not a date" parses to NaN — the guard has to reject it, not treat NaN
    // as "in the past" or "in the future".
    const res = await fetch(`${base}/js/main.js`, {
      headers: { 'If-Modified-Since': 'not a date' },
    });
    assert.equal(res.status, 200);
    const body = await res.arrayBuffer();
    assert.ok(body.byteLength > 0, 'malformed IMS must not short-circuit');
  });

  await t('/vendor/ 304 carries the immutable Cache-Control too (symmetry)', async () => {
    const first = await fetch(`${base}/vendor/cannon-es.js`);
    const lastMod = first.headers.get('last-modified');
    await first.arrayBuffer();
    const res = await fetch(`${base}/vendor/cannon-es.js`, {
      headers: { 'If-Modified-Since': lastMod },
    });
    assert.equal(res.status, 304);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    await res.arrayBuffer();
  });

  // ---- Directory-request case --------------------------------------------

  await t('directory URL (/) revalidates through index.html correctly', async () => {
    const first = await fetch(`${base}/`);
    const lastMod = first.headers.get('last-modified');
    assert.ok(lastMod, 'index.html served via / should carry Last-Modified');
    await first.arrayBuffer();
    const res = await fetch(`${base}/`, {
      headers: { 'If-Modified-Since': lastMod },
    });
    assert.equal(res.status, 304);
    const body = await res.arrayBuffer();
    assert.equal(body.byteLength, 0);
  });

  // ---- HEAD requests still behave --------------------------------------

  await t('HEAD /vendor/ still declares immutable without a body', async () => {
    const res = await fetch(`${base}/vendor/three.module.js`, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const body = await res.arrayBuffer();
    assert.equal(body.byteLength, 0);
  });
} finally {
  await stopServer(proc);
}

if (failed === 0) console.log(`static-cache.test: ${n} passed`);
else { console.error(`static-cache.test: ${failed}/${n} FAILED`); process.exitCode = 1; }
