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

// tests/static-cache.test.mjs — the HTTP surface server.js presents to a
// browser: what it serves, what it refuses, and what it says about itself.
//
// ROADMAP §0b (bandwidth) — streamFile must:
//   * hand /vendor/ a year-long immutable Cache-Control (frozen third-party)
//   * keep no-cache on the mutable app tree so browsers revalidate
//   * validate with an ETag over the CONTENT, never a build-frozen timestamp
//   * still work for a directory URL that resolves to index.html
// ROADMAP C29 (the allowlist) — the static handler serves the APP, not the
//   repo it happens to live in: `/server.js` and `/tests/e2e/scenarios.mjs` are
//   404, dotfiles are still 403, and every root the page really fetches is 200.
// ROADMAP §0j (operations) — `/health` names the running build without leaking
//   a room key, a player name or anything else goals 7 and 12 protect; the
//   room-creation throttle refuses a script without ever refusing a player.
//
// Real server.js children on ephemeral ports — never 8123 (Joe's live table).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

// `extra` overrides the boot-time env. The §0j blocks need it: DICE_ROOM_GUARD
// arms the creation throttle without standing up 250 live rooms first, and
// GIT_SHA is the whole subject of the /health build-stamp assertions. Same
// reasoning server.js gives for the override existing at all — a test-only
// route or query parameter would put a lever on the live HTTP surface.
async function startServer(port, extra = {}) {
  const proc = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), ...extra },
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
// GIT_SHA and DICE_ROOM_GUARD are pinned EMPTY rather than left to the ambient
// environment: this server is the "nothing configured" baseline, and a stray
// GIT_SHA in Joe's shell must not decide whether the build-stamp block passes.
const proc = await startServer(port, { GIT_SHA: '', DICE_ROOM_GUARD: '' });
const base = `http://127.0.0.1:${port}`;

const postJoin = (b, room, name = 'probe') => fetch(`${b}/api/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ room, name }),
});

// Mirrors server.js's ROOM_CREATE_PER_MIN. Kept in lockstep by hand — the
// server does not export it, and importing server.js here would bind a port.
// Raise one and this file goes red on the other, which is the intent.
const ROOM_CREATE_PER_MIN = 10;

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

  // THE FIRST SHIPPED TOWER MODEL, and the reason this test exists at all.
  // server.js has no manifest: safeResolve serves anything under ROOT, so
  // models/towers/ needed no server change to be reachable — which is exactly
  // why nothing but a test would notice the day one of these files failed to
  // get committed. The registry row names both urls; a 404 on either is a
  // venue that never raises its tower, reported only as a console warning.
  //
  // Both palettes are asserted separately and BY BYTES, not by listing a
  // directory: the two-variant row is the thing that can half-ship.
  // Nullstone rides the same list: one file, no palettes, and the same way to
  // half-ship it (a registry row pointing at a url nobody committed).
  // Maintained by tools/forge/promote.mjs, which appends a slug when it ships
  // one. Kept as a literal list rather than a directory read for the reason
  // above: a directory read is green on an empty directory.
  const PROMOTED = ['hollowbole_moonrise', 'hollowbole_foxfire', 'nullstone'];
  for (const pal of PROMOTED) {
    await t(`/models/towers/${pal}.glb is served as a GLB`, async () => {
      const res = await fetch(`${base}/models/towers/${pal}.glb`);
      assert.equal(res.status, 200, `the ${pal} model must be fetchable from the page origin`);
      // octet-stream, like the fixture above: `.glb` is not in MIME and does
      // not need to be — GLTFLoader fetches an arraybuffer and sniffs the
      // magic. Pinned so the fallback is a decision, not an accident.
      assert.equal(res.headers.get('content-type'), 'application/octet-stream');
      assert.equal(res.headers.get('cache-control'), 'no-cache', 'not vendor/, so it revalidates');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.toString('ascii', 0, 4), 'glTF', 'and the bytes are a GLB container');
      assert.ok(buf.byteLength > 100000, `and the real model (${buf.byteLength} bytes), not a stub`);
    });
  }

  // THE SERVED FILE IS THE FILE THE RECIPE WROTE (ROADMAP T7). Everything
  // above proves a model is REACHABLE; none of it proves it is CURRENT, and
  // that is the bug that actually happened: 2026-08-13 the shipped hollowbole
  // models were two commits behind their recipe for a morning, found by
  // accident. The digest baseline could not see it — `set`/`order` hash the
  // GEOMETRY, and that round's change was a `doorPad` MARKER, real shipping
  // data with not one triangle moved. So the baseline carries `sha` over the
  // whole file now, and this asserts the shipped bytes against it.
  //
  // WHAT MAKES IT FAIL: re-bake a tower and do not promote it. The bake
  // stamps a new sha into digests.json (or digestdiff refuses the bake), and
  // this goes red until `node tools/forge/promote.mjs <slug>` runs. A promote
  // step you forget to run is the same bug it was written to prevent, which
  // is why the standing check lives here and not in the step.
  await t('every shipped model matches its digest baseline, byte for byte', async () => {
    const digests = JSON.parse(
      await readFile(new URL('../tools/forge/digests.json', import.meta.url), 'utf8'));
    let checked = 0;
    for (const slug of PROMOTED) {
      const row = digests[slug];
      assert.ok(row, `${slug} has a digests.json row — a shipped model with no `
        + 'baseline is a file nothing can prove anything about');
      if (!row.sha) continue; // pre-sha row: re-bake stamps one (promote --check says so)
      const buf = Buffer.from(await (await fetch(`${base}/models/towers/${slug}.glb`))
        .arrayBuffer());
      const got = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      assert.equal(got, row.sha,
        `${slug}.glb as SERVED is ${got}; digests.json says the recipe writes `
        + `${row.sha}. The model on disk is not the model the recipe makes — `
        + 're-bake and `node tools/forge/promote.mjs ' + slug + '`.');
      checked++;
    }
    assert.ok(checked > 0, 'and at least one model carried a sha to check — a '
      + 'baseline with no shas would make this pass by having nothing to say');
  });

  // ---- HEAD requests still behave --------------------------------------

  await t('HEAD /vendor/ still declares immutable without a body', async () => {
    const res = await fetch(`${base}/vendor/three.module.js`, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const body = await res.arrayBuffer();
    assert.equal(body.byteLength, 0);
  });

  // ---- C29: the allowlist -------------------------------------------------
  //
  // Both halves, because only asserting the happy half is this project's
  // dominant failure mode — an allowlist that serves everything passes every
  // "is it reachable" test ever written. So the REFUSALS are the point, and
  // each named path is one that returned 200 before the allowlist landed.
  //
  // WHAT MAKES IT FAIL: add a directory the page fetches from and forget to
  // allowlist it (the first block goes red on the file that 404s), or widen
  // APP_DIRS back toward ROOT (the second block goes red on server.js).

  const ALLOWED = [
    ['/', 'the root document'],
    ['/index.html', 'the app itself'],
    ['/js/main.js', 'js/ — the app tree'],
    ['/css/style.css', 'css/'],
    ['/vendor/three.module.js', 'vendor/ — the frozen third-party tree'],
    ['/models/towers/nullstone.glb', 'models/ — baked GLB towers'],
    // Not part of the deployed app (.gcloudignore drops tests/ from the upload),
    // but the tower-glb-loader scenario fetches it THROUGH THE PAGE ORIGIN, so
    // a 404 here is a red e2e suite rather than a production change.
    ['/tests/e2e/fixtures/tower_fixture.glb', 'the e2e GLB fixture'],
    // Dev chrome, deliberately kept servable: tools/README's pose driver
    // navigates the served origin to it.
    ['/chrome-lab.html', 'the 2D lab that iframes index.html'],
    // The developer-mode pop-out (docs/DEVMODE.md §8, phase D5) — the panel in
    // its own window. `.gcloudignore` withholds it from the deploy along with
    // js/devmode.js, which it imports; locally it has to be reachable or the
    // Pop out button opens a 404.
    ['/dev.html', 'the developer-mode pop-out'],
  ];
  for (const [p, why] of ALLOWED) {
    await t(`allowlist serves ${p} (${why})`, async () => {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 200, `${p} must be served — ${why}`);
      await res.arrayBuffer();
    });
  }

  // Every one of these returned 200 with real content before C29. The rule was
  // "the extension is servable"; it is now "the file is part of the app".
  const REFUSED = [
    ['/server.js', 'the server\'s own source, validation logic and caps'],
    ['/package.json', 'nothing in js/ or index.html has ever fetched it'],
    ['/tests/e2e/scenarios.mjs', '530 KB of test source inside a 1 GiB egress allowance'],
    ['/tests/static-cache.test.mjs', 'this file'],
    ['/tools/drive.mjs', 'the whole tools/ tree rode the same .mjs MIME entry'],
    ['/Makefile', 'no MIME entry today — pinned so a new one cannot expose it'],
    ['/docs/GOALS.md', 'same: .md is unservable by accident, not by rule'],
    ['/README.md', ''],
    ['/LICENSE', ''],
    // RETIRED, NOT MERELY DELETED (2026-09-03, docs/DEVMODE.md §9 phase D3).
    // The dice lab left the allowlist with js/lab.js and its two shot tools
    // when the developer-mode panel's sets editor took the recipe knobs onto
    // the live felt. Pinned here rather than left to a comment, because a
    // re-added `lab.html` line in APP_FILES would otherwise be invisible: the
    // file is gone, so the happy half above cannot notice its return.
    ['/lab.html', 'the retired dice lab'],
  ];
  for (const [p, why] of REFUSED) {
    await t(`allowlist refuses ${p}${why ? ` (${why})` : ''}`, async () => {
      const res = await fetch(`${base}${p}`);
      // 404, not 403: "forbidden" would confirm the file is there.
      assert.equal(res.status, 404, `${p} must not be served`);
      await res.arrayBuffer();
    });
  }

  await t('deploy/ is closed — this one WAS a real config exposure', async () => {
    // ROADMAP C29 said "no credential or config exposure, verified path by
    // path", and named `.deploy.config` as the file it checked. THERE IS NO
    // SUCH FILE. The real settings file is `deploy/config.mk` — gitignored,
    // holding PROJECT and BILLING_ACCOUNT — and it has no dot-prefixed segment,
    // so safeResolve waved it through and `.mk` fell to the octet-stream MIME
    // default. Measured 2026-08-14 against the pre-allowlist server:
    // `GET /deploy/config.mk` returned 200 with the billing account in the body.
    //
    // Production was never exposed (.gcloudignore drops deploy/ from the
    // upload), but every local `node server.js` — including the preview table
    // on 8123 — served it to anyone who could reach the port.
    //
    // config.mk itself cannot be the assertion: it is absent on a fresh
    // checkout, so the check would pass by having nothing to find. The
    // COMMITTED example sitting beside it proves the root is closed.
    const res = await fetch(`${base}/deploy/config.example.mk`);
    assert.equal(res.status, 404, 'deploy/ must not be servable at all');
    await res.arrayBuffer();
    const json = await fetch(`${base}/deploy/artifact-cleanup.json`);
    assert.equal(json.status, 404, 'including the files whose extension IS in MIME');
    await json.arrayBuffer();
  });

  await t('dotfiles are still refused before the allowlist is even consulted', async () => {
    // The important half of C29 was ALREADY handled by safeResolve, and this
    // pins that the allowlist did not disturb it: no credential or config
    // exposure, and the refusal happens at the resolver so a future allowlist
    // entry cannot accidentally re-open .git/.
    for (const p of ['/.git/config', '/.git/HEAD', '/.deploy.config', '/.gcloudignore']) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 403, `${p} must be forbidden at the resolver`);
      await res.arrayBuffer();
    }
  });

  await t('traversal out of ROOT is still refused', async () => {
    for (const p of ['/../server.js', '/js/../server.js', '/%2e%2e/server.js']) {
      const res = await fetch(`${base}${p}`);
      assert.ok(res.status === 403 || res.status === 404,
        `${p} must not reach outside the app (got ${res.status})`);
      await res.arrayBuffer();
    }
  });

  // ---- §0j: /health -------------------------------------------------------

  await t('/health answers with the operational shape', async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store',
      'a cached health answer is a lie about a running process');
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.node, 'string');
    assert.equal(typeof body.uptimeSec, 'number');
    assert.equal(body.maxRooms, 500, 'the denominator server_full is measured against');
    for (const k of ['rooms', 'players', 'streams', 'rssMb']) {
      assert.equal(typeof body[k], 'number', `${k} is a count`);
    }
  });

  await t('no GIT_SHA reports "unknown" rather than inventing one', async () => {
    // The whole value of the stamp is that it cannot be confidently wrong. A
    // deploy that did not come through the Makefile must say so.
    const body = await (await fetch(`${base}/health`)).json();
    assert.equal(body.sha, 'unknown');
  });

  await t('HEAD /health is a body-less liveness probe', async () => {
    const res = await fetch(`${base}/health`, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal((await res.arrayBuffer()).byteLength, 0);
  });

  await t('/health discloses no room key and no player name (goals 7, 12)', async () => {
    // THE ASSERTION THAT WOULD CATCH THE TEMPTING VERSION. A room listing is
    // the obvious next field to add to a health endpoint, and a room key IS
    // this table's only access control (goal 10) — publishing one is
    // publishing a door. So a room and a player with unmistakable names are
    // created first, and the whole body is searched for them.
    const room = 'zz-health-secret-room';
    const name = 'ZZHealthSecretPlayer';
    const joined = await postJoin(base, room, name);
    assert.equal(joined.status, 200, 'the probe room was created');
    await joined.json();

    const raw = await (await fetch(`${base}/health`)).text();
    assert.ok(!raw.includes(room), `/health leaked a room key: ${raw}`);
    assert.ok(!raw.includes(name), `/health leaked a player name: ${raw}`);
    const body = JSON.parse(raw);
    assert.ok(body.rooms >= 1, 'but the COUNT is there — that is the operational half');
    assert.ok(body.players >= 1);
  });

  // ---- §0j: the room-creation throttle, and who it must never refuse ------

  await t('below the guard, a burst of new rooms is never refused', async () => {
    // THE FAIL-OPEN PROPERTY, asserted on the DEFAULT configuration — this
    // server runs with no DICE_ROOM_GUARD, so the guard is MAX_ROOMS/2 and a
    // real table can never meet the rule. A throttle that fires here would be
    // refusing players to protect capacity that is 95% free.
    for (let i = 0; i < ROOM_CREATE_PER_MIN + 5; i++) {
      const res = await postJoin(base, `zz-guard-${i}`);
      assert.equal(res.status, 200,
        `creation ${i + 1} was refused with the server nearly empty`);
      await res.json();
    }
  });
} finally {
  await stopServer(proc);
}

// ---- §0j: the throttle ARMED, and the build stamp, on their own servers ----
//
// Separate children because both knobs are read once at boot, exactly as
// DICE_SETUP_TTL_MS is. DICE_ROOM_GUARD=0 arms the rule from the first room so
// the refusal is reachable without standing up 250 live ones.

{
  const port2 = await freePort();
  const proc2 = await startServer(port2, {
    GIT_SHA: 'ffff0000ffff-dirty',
    DICE_ROOM_GUARD: '0',
  });
  const b2 = `http://127.0.0.1:${port2}`;
  try {
    await t('/health reports the baked sha verbatim, -dirty marker included', async () => {
      const body = await (await fetch(`${b2}/health`)).json();
      assert.equal(body.sha, 'ffff0000ffff-dirty',
        'the Makefile appends -dirty when the tree that shipped was not HEAD; '
        + 'dropping the marker would report a commit that was never deployed');
    });

    await t('the throttle refuses the 11th new room from one address', async () => {
      for (let i = 0; i < ROOM_CREATE_PER_MIN; i++) {
        const res = await postJoin(b2, `zz-burst-${i}`);
        assert.equal(res.status, 200, `creation ${i + 1} is inside the budget`);
        await res.json();
      }
      const res = await postJoin(b2, 'zz-burst-over');
      assert.equal(res.status, 429, 'the budget is spent');
      const body = await res.json();
      assert.equal(body.code, 'room_rate_limited',
        'and NOT server_full — the server is not full, and saying so would '
        + 'make every future server_full report ambiguous');
    });

    await t('a throttled address can still JOIN a room that exists', async () => {
      // THE PROPERTY THAT MAKES THE RULE SAFE TO SHIP. The key is the leftmost
      // X-Forwarded-For entry, which the client can set — so it can be wrong,
      // and a wrongly-keyed player must still be able to sit down at the table
      // their friends are already at. `rooms.has(roomName)` is what guarantees
      // it; delete that condition and this goes red.
      const res = await postJoin(b2, 'zz-burst-0', 'second-player');
      assert.equal(res.status, 200, 'joining an existing room is never throttled');
      await res.json();
    });

    await t('the throttle never touches /api/events (§0d F3)', async () => {
      // A 429 on the event stream is a self-inflicted stream storm: every
      // refused client reconnects at once. Twenty requests — twice the whole
      // per-minute budget — must not produce one.
      for (let i = 0; i < 20; i++) {
        const res = await fetch(`${b2}/api/events?room=zz-burst-0&playerId=nobody-${i}`);
        assert.equal(res.status, 404, 'unknown player, as always');
        assert.notEqual(res.status, 429, 'the stream door is not rate-limited');
        await res.arrayBuffer();
      }
    });

    await t('the throttle never touches the pre-join peek', async () => {
      // GET /api/table cannot create a room (it uses rooms.get), so it must not
      // spend or be refused by a creation budget. This goes red the day someone
      // lifts the throttle into a per-request middleware.
      const res = await fetch(`${b2}/api/table?room=zz-burst-0`);
      assert.equal(res.status, 200);
      await res.json();
    });
  } finally {
    await stopServer(proc2);
  }
}

{
  const port3 = await freePort();
  // A GIT_SHA that is not a commit — a typo, a shell expansion that failed, or
  // a secret pasted into the wrong variable.
  const proc3 = await startServer(port3, { GIT_SHA: 'AWS_SECRET_ACCESS_KEY=hunter2' });
  const b3 = `http://127.0.0.1:${port3}`;
  try {
    await t('a GIT_SHA that is not a sha is never echoed to the public', async () => {
      // /health is unauthenticated (goal 10), so this env var is published to
      // the internet. Validate-then-report, never echo: the failure mode of the
      // obvious one-liner is a disclosure, not a cosmetic bug.
      const raw = await (await fetch(`${b3}/health`)).text();
      assert.ok(!raw.includes('hunter2'), `/health echoed its env var: ${raw}`);
      assert.equal(JSON.parse(raw).sha, 'unknown');
    });
  } finally {
    await stopServer(proc3);
  }
}

if (failed === 0) console.log(`static-cache.test: ${n} passed`);
else { console.error(`static-cache.test: ${failed}/${n} FAILED`); process.exitCode = 1; }
