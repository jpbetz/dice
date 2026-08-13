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
  //
  // THE VALIDATOR IS AN ETAG OVER THE BYTES, NOT A TIMESTAMP (2026-08-09).
  // These asserted Last-Modified semantics, and one of them asserted the BUG:
  // "If-Modified-Since NEWER than mtime still returns 304" is exactly the
  // behaviour that pinned a stale build on every returning browser, because
  // Cloud Native Buildpacks normalize every mtime to 1980-01-01 for
  // reproducible builds — so the validator never changed between deploys and
  // the server 304'd forever. Found from the field by the crash reporting.

  await t('the ETag is over the CONTENT, and there is no Last-Modified to lie', async () => {
    const first = await fetch(`${base}/js/main.js`);
    assert.equal(first.status, 200);
    const etag = first.headers.get('etag');
    assert.ok(etag && /^"[\w-]+"$/.test(etag), `server should send an ETag (got ${etag})`);
    assert.equal(first.headers.get('last-modified'), null,
      'and NOT Last-Modified: a header a build system freezes is a validator that lies');
    await first.arrayBuffer();

    const revalidate = await fetch(`${base}/js/main.js`, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(revalidate.status, 304);
    assert.equal(revalidate.headers.get('content-length'), null,
      '304 must not advertise a body');
    assert.equal((await revalidate.arrayBuffer()).byteLength, 0, '304 body must be empty');
    assert.equal(revalidate.headers.get('etag'), etag,
      'the ETag is preserved on the 304 so the browser keeps its bookkeeping');
  });

  await t('a frozen 1980 timestamp no longer satisfies anything', async () => {
    // The exact request every browser cached under the old scheme makes.
    const res = await fetch(`${base}/js/main.js`, {
      headers: { 'If-Modified-Since': 'Tue, 01 Jan 1980 00:00:01 GMT' },
    });
    assert.equal(res.status, 200, 'a stale build must not be able to pin itself');
    assert.ok((await res.arrayBuffer()).byteLength > 1000, 'and the real file comes back');
  });

  await t('a wrong ETag returns 200 with the full body', async () => {
    const first = await fetch(`${base}/js/main.js`);
    const size = Number(first.headers.get('content-length'));
    await first.arrayBuffer();
    const res = await fetch(`${base}/js/main.js`, { headers: { 'If-None-Match': '"stale"' } });
    assert.equal(res.status, 200);
    assert.equal((await res.arrayBuffer()).byteLength, size, 'a stale ETag fetches the full body');
  });

  await t('different files carry different ETags', async () => {
    const [a, b] = await Promise.all([fetch(`${base}/js/main.js`), fetch(`${base}/css/style.css`)]);
    assert.notEqual(a.headers.get('etag'), b.headers.get('etag'),
      'or one file would revalidate another into place');
    await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  });

  await t('If-Modified-Since is ignored entirely now', async () => {
    // Not merely "old dates get 200": the header is no longer consulted, so
    // NO value of it can produce a 304. That is the property that makes a
    // frozen build clock harmless rather than fatal.
    for (const ims of ['Tue, 01 Jan 1980 00:00:01 GMT', new Date().toUTCString(), 'not a date']) {
      const res = await fetch(`${base}/js/main.js`, { headers: { 'If-Modified-Since': ims } });
      assert.equal(res.status, 200, `IMS "${ims}" must not short-circuit`);
      await res.arrayBuffer();
    }
  });

  await t('/vendor/ 304 carries the immutable Cache-Control too (symmetry)', async () => {
    const first = await fetch(`${base}/vendor/cannon-es.js`);
    const etag = first.headers.get('etag');
    await first.arrayBuffer();
    const res = await fetch(`${base}/vendor/cannon-es.js`, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(res.status, 304);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    await res.arrayBuffer();
  });

  // ---- Directory-request case --------------------------------------------

  await t('directory URL (/) revalidates through index.html correctly', async () => {
    const first = await fetch(`${base}/`);
    const etag = first.headers.get('etag');
    assert.ok(etag, 'index.html served via / should carry an ETag');
    await first.arrayBuffer();
    const res = await fetch(`${base}/`, { headers: { 'If-None-Match': etag } });
    assert.equal(res.status, 304);
    assert.equal((await res.arrayBuffer()).byteLength, 0);
  });

  // ---- the two loader files the app now imports ---------------------------
  //
  // THE RULE IS A PATH PREFIX, AND THIS IS THE PART THAT IS NOT OBVIOUS.
  // `isVendor` tests `absPath.startsWith(VENDOR_DIR + sep)` and `safeResolve`
  // has no allowlist, so a file dropped into vendor/ is served — and served
  // immutable — with nothing to register it in. That is a good property and it
  // is also why nothing above would have noticed if GLTFLoader.js had never
  // been copied at all: every other assertion in this file names a file that
  // was already there. js/towerglb.js imports these two at module scope, so a
  // 404 on either is a blank table, not a missing tower.
  for (const f of ['GLTFLoader.js', 'BufferGeometryUtils.js']) {
    await t(`/vendor/${f} is served, immutable, as a module`, async () => {
      const res = await fetch(`${base}/vendor/${f}`);
      assert.equal(res.status, 200, `${f} must exist under vendor/`);
      assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      // text/javascript, not octet-stream: a module served with the wrong
      // content-type is refused by the browser's module loader outright.
      assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
      const body = await res.text();
      assert.ok(body.length > 1000, `${f} is the real file (${body.length} bytes)`);
      // The bare specifier has to survive vendoring: it is what index.html's
      // importmap resolves. A rewritten './three.module.js' would still parse
      // and still 200, and would load a SECOND copy of three — the duplicate
      // -evaluation failure the harness already logs as a boot retry.
      assert.match(body, /from 'three'/, `${f} still imports three as a bare specifier`);
    });
  }

  await t('/vendor/GLTFLoader.js reaches BufferGeometryUtils by a flat local path', async () => {
    const body = await (await fetch(`${base}/vendor/GLTFLoader.js`)).text();
    assert.match(body, /from '\.\/BufferGeometryUtils\.js'/,
      'the one upstream edit — ../utils/ would 404 under vendor/');
  });

  // The forge's baked test asset. `.glb` is deliberately absent from MIME, so
  // this pins what actually happens rather than what one might assume: a 200
  // with the octet-stream fallback. GLTFLoader fetches arraybuffer and sniffs
  // the glTF magic, so the type is not load-bearing — but a 404 would be, and
  // the tower-glb-loader scenario loads this exact path through the app.
  await t('tests/e2e/fixtures/*.glb is reachable (the e2e fixture path)', async () => {
    const res = await fetch(`${base}/tests/e2e/fixtures/tower_fixture.glb`);
    assert.equal(res.status, 200, 'the fixture must be fetchable from the page origin');
    assert.equal(res.headers.get('cache-control'), 'no-cache', 'and it is NOT vendor/, so it revalidates');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.toString('ascii', 0, 4), 'glTF', 'and the bytes are a GLB container');
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
