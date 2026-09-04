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

// tests/tunables-serve.test.mjs — the served module (docs/DEVMODE.md §4):
// `GET /js/tunables.js` is GENERATED from dice.yaml by server.js, in memory,
// and this is the HTTP surface that generation presents.
//
//   * the body is a JavaScript module whose DECLARED deep-equals the parsed
//     file and whose SOURCE is the file's own text
//   * DICE_MODE overrides app.mode in the served tree, never in the file, and
//     a DICE_MODE that is neither word is a boot failure (exit 1), not a fallback
//   * the module carries the js/ headers: no-cache, a content ETag, 304 on
//     If-None-Match — and a real js/tunables.js on disk never wins
//   * a hand edit is live on the next GET, a broken edit keeps the last good
//     tree and logs once, a broken file at boot exits 1 with its line
//   * /dice.yaml itself is served (the panel's Save patches SOURCE, but a curl
//     of the file is the honest check), and /health is untouched
//
// Real server.js children on ephemeral ports — never 8123 (Joe's live table) —
// and never against the checkout: every server here runs from a SCRATCH COPY
// of the tree (server.js + js/) with its own small dice.yaml, so the fixture
// is this file's and the edits land nowhere anyone keeps.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The same reader the server uses, imported from the CHECKOUT (the scratch
// copy is the same bytes) — so "DECLARED equals the parsed file" is asserted
// through one parser, not two.
const { parseYaml } = await import(pathToFileURL(join(ROOT, 'js', 'yaml.js')).href);

// ---- the scratch tree -------------------------------------------------------

const FIXTURE = `# a small declaration, this test's own
app:
  title: Dice Table
  mode: development        # development | production
  version: 1

table:
  scale: 2.5               # the one dial for table size
  ceilingY: 22

light:
  lamp:
    y: 24
    color: "#ffe8c4"
  fog: { near: 15, far: 46 }

pace:
  tempo: { k: 1, flight: 0.8 }
`;

// DICE_TEST_SCRATCH points the scratch trees somewhere other than the OS
// tmpdir (an agent's own scratchpad, say); each tree is removed at the end.
const SCRATCH_BASE = process.env.DICE_TEST_SCRATCH || tmpdir();
mkdirSync(SCRATCH_BASE, { recursive: true });

function makeTree(yaml = FIXTURE) {
  const dir = mkdtempSync(join(SCRATCH_BASE, 'tunables-serve-'));
  cpSync(join(ROOT, 'server.js'), join(dir, 'server.js'));
  cpSync(join(ROOT, 'js'), join(dir, 'js'), { recursive: true });
  if (yaml !== null) writeFileSync(join(dir, 'dice.yaml'), yaml);
  return dir;
}

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

// Boots server.js FROM `dir`. Returns the child once /health answers; throws
// with the captured output if it exits first. `extra` overrides the env the
// way tests/static-cache.test.mjs does — DICE_MODE is read once at boot.
async function startServer(dir, port, extra = {}) {
  const proc = spawn(process.execPath, [join(dir, 'server.js')], {
    env: { ...process.env, PORT: String(port), GIT_SHA: '', DICE_MODE: '', DICE_LOG_LEVEL: 'info', ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.out = '';
  proc.stdout.on('data', (d) => { proc.out += d; });
  proc.stderr.on('data', (d) => { proc.out += d; });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`server exited early:\n${proc.out.slice(-2000)}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) { await r.arrayBuffer(); return proc; }
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error(`server never came up on :${port}\n${proc.out.slice(-2000)}`);
}

// Boots server.js expecting it NOT to come up; resolves with { code, out }.
async function bootExpectingExit(dir, port, extra = {}) {
  const proc = spawn(process.execPath, [join(dir, 'server.js')], {
    env: { ...process.env, PORT: String(port), GIT_SHA: '', DICE_MODE: '', ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(null); }, 10000);
    proc.once('exit', (c) => { clearTimeout(timer); resolve(c); });
  });
  return { code, out };
}

async function stopServer(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 2000);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

// Evaluate the served module the way a browser would: as an ES module. A
// data: URL import is a real parse and a real evaluation — a body that is not
// JavaScript throws here, which is the whole point of not regex-matching it.
async function evalModule(body) {
  return import(`data:text/javascript;base64,${Buffer.from(body).toString('base64')}`);
}

async function getModule(base, headers = {}) {
  const res = await fetch(`${base}/js/tunables.js`, { headers });
  const body = await res.text();
  return { res, body };
}

// Bump a file's bytes under a running server. mtime resolution on the
// filesystems this runs on is finer than a millisecond, but a size change is
// what the server's staleness check also keys on, so an edit is visible even
// on a coarse clock so long as it changes the length — every edit below does.
async function edit(dir, yaml) {
  await sleep(20);
  writeFileSync(join(dir, 'dice.yaml'), yaml);
}

// The log says what the server is doing, never which door is open: DEVMODE.md
// §4, "Nothing about dev mode reaches any log line." Checked on every child,
// including the ones booted WITH a DICE_MODE — the place a future line naming
// the mode would most plausibly appear.
function assertNoModeInLog(proc) {
  const lines = proc.out.split('\n').filter((l) => !l.includes('listening on'));  // that one names ROOT
  assert.ok(!lines.some((l) => /DICE_MODE|development|production|dev mode/i.test(l)),
    `the log mentions the mode:\n${proc.out.slice(-1000)}`);
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

const trees = [];

// ---- the default server: the file as written, no DICE_MODE ------------------

{
  const dir = makeTree();
  trees.push(dir);
  const port = await freePort();
  const proc = await startServer(dir, port);
  const base = `http://127.0.0.1:${port}`;
  try {
    let etag;

    await t('/js/tunables.js is a JS module whose DECLARED is the parsed file', async () => {
      const { res, body } = await getModule(base);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
      assert.equal(res.headers.get('cache-control'), 'no-cache');
      assert.equal(res.headers.get('last-modified'), null, 'no timestamp validator, same as js/');
      assert.match(body, /^\/\/ GENERATED from dice\.yaml by server\.js/, 'the header names its origin');
      const mod = await evalModule(body);
      assert.deepEqual(mod.DECLARED, parseYaml(FIXTURE).tree);
      assert.equal(mod.DECLARED.app.mode, 'development', 'with no DICE_MODE the file\'s own mode stands');
      assert.equal(mod.SOURCE, FIXTURE, 'SOURCE is the file\'s own text, comments included');
      assert.equal(Number(res.headers.get('content-length')), Buffer.byteLength(body));
    });

    await t('the ETag is the js/ content-hash shape and If-None-Match earns a 304', async () => {
      const { res } = await getModule(base);
      etag = res.headers.get('etag');
      assert.ok(etag && /^"[\w-]{27}"$/.test(etag), `a quoted 27-char base64url sha1, like streamFile's (got ${etag})`);
      const again = await fetch(`${base}/js/tunables.js`, { headers: { 'If-None-Match': etag } });
      assert.equal(again.status, 304);
      assert.equal(again.headers.get('etag'), etag, 'the ETag rides the 304');
      assert.equal(again.headers.get('cache-control'), 'no-cache');
      assert.equal(again.headers.get('content-length'), null, '304 must not advertise a body');
      assert.equal((await again.arrayBuffer()).byteLength, 0);
      const weak = await fetch(`${base}/js/tunables.js`, { headers: { 'If-None-Match': `W/${etag}` } });
      assert.equal(weak.status, 304, 'a weak validator matches too, as streamFile does');
      await weak.arrayBuffer();
    });

    await t('a stale ETag gets the full body; a stable file gets a stable tag', async () => {
      const { res, body } = await getModule(base, { 'If-None-Match': '"stale"' });
      assert.equal(res.status, 200);
      assert.ok(body.includes('export const DECLARED'));
      assert.equal(res.headers.get('etag'), etag, 'nothing changed, so the tag did not either');
    });

    await t('HEAD answers the headers without a body', async () => {
      const res = await fetch(`${base}/js/tunables.js`, { method: 'HEAD' });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('etag'), etag);
      assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
      assert.equal((await res.arrayBuffer()).byteLength, 0);
    });

    await t('POST is refused, as it is for every static path', async () => {
      const res = await fetch(`${base}/js/tunables.js`, { method: 'POST', body: '{}' });
      assert.equal(res.status, 405);
      await res.arrayBuffer();
    });

    await t('a real js/tunables.js on disk never wins over the generated one', async () => {
      // The route is answered BEFORE the static path. Drop a file with the same
      // name into the scratch tree's js/ — the one place a stray build or a
      // curious editor would put it — and the served module must still be the
      // one built from dice.yaml.
      writeFileSync(join(dir, 'js', 'tunables.js'), 'export const DECLARED = { stray: 1 };\n');
      const { body } = await getModule(base);
      const mod = await evalModule(body);
      assert.equal(mod.DECLARED.stray, undefined, 'the file on disk was not served');
      assert.deepEqual(mod.DECLARED, parseYaml(FIXTURE).tree);
      assert.equal(mod.SOURCE, FIXTURE);
      // Non-canonical spellings of the same path. The router's literal match
      // misses these; safeResolve decodes both to ROOT/js/tunables.js, and
      // before the resolved-path gate (2026-09-02) each streamed the stray
      // file's bytes with a 200. The gate must ride the resolved path.
      // (`//js/tunables.js` is not in the list: `new URL('//js/…', base)` is
      // protocol-relative and resolves to host `js`, so it 404s on its own.)
      for (const spelling of ['/js//tunables.js', '/js/%74unables.js', '/js/tunables%2Ejs']) {
        const r = await fetch(`${base}${spelling}`);
        const b = await r.text();
        assert.equal(r.status, 200, `${spelling} is the served module`);
        assert.equal(r.headers.get('content-type'), 'text/javascript; charset=utf-8', spelling);
        const m = await evalModule(b);
        assert.equal(m.DECLARED.stray, undefined, `${spelling} must not stream the file on disk`);
        assert.deepEqual(m.DECLARED, parseYaml(FIXTURE).tree, spelling);
      }
      rmSync(join(dir, 'js', 'tunables.js'));
    });

    await t('/dice.yaml is served verbatim as text/yaml', async () => {
      const res = await fetch(`${base}/dice.yaml`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/yaml; charset=utf-8');
      assert.equal(res.headers.get('cache-control'), 'no-cache');
      assert.equal(await res.text(), FIXTURE);
    });

    await t('an edit to dice.yaml is live on the next GET, with a new ETag', async () => {
      const edited = FIXTURE.replace('y: 24', 'y: 30.5').replace('ceilingY: 22', 'ceilingY: 26');
      await edit(dir, edited);
      const { res, body } = await getModule(base);
      assert.equal(res.status, 200);
      const mod = await evalModule(body);
      assert.equal(mod.DECLARED.light.lamp.y, 30.5, 'the edited leaf');
      assert.equal(mod.DECLARED.table.ceilingY, 26, 'and the other one');
      assert.deepEqual(mod.DECLARED, parseYaml(edited).tree, 'the whole tree is the re-read');
      assert.equal(mod.SOURCE, edited, 'SOURCE follows the edit too');
      const tag = res.headers.get('etag');
      assert.notEqual(tag, etag, 'new bytes, new tag');
      const revalidate = await fetch(`${base}/js/tunables.js`, { headers: { 'If-None-Match': etag } });
      assert.equal(revalidate.status, 200, 'the old tag no longer satisfies');
      await revalidate.arrayBuffer();
      etag = tag;
    });

    await t('a broken edit keeps the last good tree and is logged once', async () => {
      const good = FIXTURE.replace('y: 24', 'y: 30.5').replace('ceilingY: 22', 'ceilingY: 26');
      const broken = good.replace('ceilingY: 26', 'ceilingY: true');   // a boolean: refused with a line
      const before = proc.out;
      await edit(dir, broken);
      for (let i = 0; i < 3; i++) {
        const { res, body } = await getModule(base);
        assert.equal(res.status, 200, 'the table that is up stays up');
        const mod = await evalModule(body);
        assert.deepEqual(mod.DECLARED, parseYaml(good).tree, `GET ${i + 1} still serves the last good tree`);
        assert.equal(mod.SOURCE, good, 'and the last good text');
        assert.equal(res.headers.get('etag'), etag, 'same bytes, same tag');
      }
      await sleep(50);
      const logged = proc.out.slice(before.length);
      const lines = logged.split('\n').filter((l) => l.includes('dice.yaml:'));
      assert.equal(lines.length, 1, `one line for one distinct error, not one per request:\n${logged}`);
      assert.match(lines[0], /dice\.yaml:\d+: /, 'and it names the line');
      const lineNo = Number(lines[0].match(/dice\.yaml:(\d+):/)[1]);
      const expected = broken.split('\n').findIndex((l) => l.includes('ceilingY: true')) + 1;
      assert.equal(lineNo, expected, 'the line is the broken line');
    });

    await t('a different broken edit is a second line; a fix is served again', async () => {
      const before = proc.out;
      await edit(dir, FIXTURE.replace('scale: 2.5', 'scale: yes    # still a boolean'));
      const { body: b1 } = await getModule(base);
      await sleep(50);
      assert.equal(proc.out.slice(before.length).split('\n').filter((l) => l.includes('dice.yaml:')).length, 1,
        'a distinct error logs its own line');
      const kept = await evalModule(b1);
      assert.equal(kept.DECLARED.light.lamp.y, 30.5, 'still the last GOOD tree, not the broken one before it');

      const fixed = FIXTURE.replace('scale: 2.5', 'scale: 3');
      await edit(dir, fixed);
      const { res, body } = await getModule(base);
      const mod = await evalModule(body);
      assert.deepEqual(mod.DECLARED, parseYaml(fixed).tree, 'the fix is live');
      assert.equal(mod.DECLARED.table.scale, 3);
      assert.notEqual(res.headers.get('etag'), etag);
    });

    await t('a zero-length dice.yaml mid-save keeps the last good tree, and the finished write lands', async () => {
      // An editor that saves by truncate-then-write exposes an empty file for
      // an instant. A page booting in that window must not get an empty
      // declaration (all defaults); it gets the last good tree, and the
      // completed write is picked up on the very next request.
      const { res: before, body: b0 } = await getModule(base);
      const tagBefore = before.headers.get('etag');
      const good = (await evalModule(b0)).DECLARED;
      assert.equal(good.table.scale, 3, 'the last good tree is the previous test\'s fix');
      await edit(dir, '');
      for (let i = 0; i < 2; i++) {
        const { res, body } = await getModule(base);
        assert.equal(res.status, 200);
        assert.deepEqual((await evalModule(body)).DECLARED, good, `GET ${i + 1} during the empty instant is the last good tree`);
        assert.equal(res.headers.get('etag'), tagBefore, 'same bytes, same tag');
      }
      const finished = FIXTURE.replace('scale: 2.5', 'scale: 4');
      await edit(dir, finished);
      const { res, body } = await getModule(base);
      const mod = await evalModule(body);
      assert.deepEqual(mod.DECLARED, parseYaml(finished).tree, 'the completed write is live on the next GET');
      assert.equal(mod.DECLARED.table.scale, 4);
      assert.notEqual(res.headers.get('etag'), tagBefore);
      etag = res.headers.get('etag');
    });

    await t('nothing about the mode reaches a log line', async () => {
      assertNoModeInLog(proc);
    });

    await t('/health is unchanged', async () => {
      const res = await fetch(`${base}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.sha, 'unknown');
      assert.equal(typeof body.rooms, 'number');
      assert.ok(!('mode' in body) && !('declaration' in body), 'and says nothing about the declaration');
    });
  } finally {
    await stopServer(proc);
  }
}

// ---- DICE_MODE=production: the served tree flips, the file does not ---------

{
  const dir = makeTree();
  trees.push(dir);
  const port = await freePort();
  const proc = await startServer(dir, port, { DICE_MODE: 'production' });
  const base = `http://127.0.0.1:${port}`;
  try {
    await t('DICE_MODE=production overrides app.mode in DECLARED only', async () => {
      const { body } = await getModule(base);
      const mod = await evalModule(body);
      const expected = parseYaml(FIXTURE).tree;
      expected.app.mode = 'production';
      assert.deepEqual(mod.DECLARED, expected, 'app.mode is the env\'s; every other leaf is the file\'s');
      assert.equal(mod.SOURCE, FIXTURE, 'SOURCE is the file as written — the override never touches it');
      const yaml = await (await fetch(`${base}/dice.yaml`)).text();
      assert.equal(yaml, FIXTURE, 'and /dice.yaml still says development');
    });

    await t('the override survives a re-read', async () => {
      const edited = FIXTURE.replace('version: 1', 'version: 2');
      await edit(dir, edited);
      const { body } = await getModule(base);
      const mod = await evalModule(body);
      assert.equal(mod.DECLARED.app.version, 2, 'the edit landed');
      assert.equal(mod.DECLARED.app.mode, 'production', 'and the env still wins');
    });

    await t('a file with no app section still gets app.mode from the env', async () => {
      await edit(dir, 'table:\n  scale: 2\n');
      const { body } = await getModule(base);
      const mod = await evalModule(body);
      assert.deepEqual(mod.DECLARED, { table: { scale: 2 }, app: { mode: 'production' } });
    });

    await t('DICE_MODE=production never reaches a log line', async () => {
      await sleep(50);
      assertNoModeInLog(proc);
    });
  } finally {
    await stopServer(proc);
  }
}

// ---- DICE_MODE=development is the other legal word --------------------------

{
  const dir = makeTree(FIXTURE.replace('mode: development', 'mode: production'));
  trees.push(dir);
  const port = await freePort();
  const proc = await startServer(dir, port, { DICE_MODE: 'development' });
  const base = `http://127.0.0.1:${port}`;
  try {
    await t('DICE_MODE=development overrides a file that says production', async () => {
      const { body } = await getModule(base);
      const mod = await evalModule(body);
      assert.equal(mod.DECLARED.app.mode, 'development');
      assert.match(mod.SOURCE, /mode: production/, 'the file still says what it says');
    });

    await t('DICE_MODE=development never reaches a log line', async () => {
      await sleep(50);
      assertNoModeInLog(proc);
    });
  } finally {
    await stopServer(proc);
  }
}

// ---- boot refusals: exit 1, with a line that says why -----------------------

await t('a DICE_MODE that is neither word exits 1 at boot with a clear line', async () => {
  const dir = makeTree();
  trees.push(dir);
  for (const bad of ['prod', 'Production', 'true', 'dev mode']) {
    const { code, out } = await bootExpectingExit(dir, await freePort(), { DICE_MODE: bad });
    assert.equal(code, 1, `DICE_MODE=${JSON.stringify(bad)} must exit 1 (out: ${out.slice(-300)})`);
    assert.match(out, /DICE_MODE/, 'and the line names the variable');
    assert.match(out, /development/, 'and the two words it accepts');
    assert.match(out, /production/);
  }
});

await t('a dice.yaml that does not parse exits 1 at boot with dice.yaml:<line>', async () => {
  const broken = FIXTURE.replace('ceilingY: 22', 'ceilingY: false');
  const dir = makeTree(broken);
  trees.push(dir);
  const { code, out } = await bootExpectingExit(dir, await freePort());
  assert.equal(code, 1, `a broken declaration is a broken checkout (out: ${out.slice(-300)})`);
  const expected = broken.split('\n').findIndex((l) => l.includes('ceilingY: false')) + 1;
  assert.match(out, new RegExp(`(^|\\n)dice\\.yaml:${expected}: `), `names the line (${expected}):\n${out}`);
});

await t('a bad DICE_MODE loses to nothing: it exits even with a good file', async () => {
  // Ordering: the env check and the file check are both boot-time; whichever
  // is wrong, the process does not come up. Pinned so a future "validate lazily
  // on first request" refactor cannot make a typo'd deploy boot and serve.
  const dir = makeTree();
  trees.push(dir);
  const { code } = await bootExpectingExit(dir, await freePort(), { DICE_MODE: 'staging' });
  assert.equal(code, 1);
});

// ---- no file at all: the limit of "every leaf is optional" ------------------

{
  const dir = makeTree(null);
  trees.push(dir);
  const port = await freePort();
  const proc = await startServer(dir, port);
  const base = `http://127.0.0.1:${port}`;
  try {
    await t('an absent dice.yaml serves an empty declaration and the table stands', async () => {
      const { res, body } = await getModule(base);
      assert.equal(res.status, 200);
      const mod = await evalModule(body);
      assert.deepEqual(mod.DECLARED, {});
      assert.equal(mod.SOURCE, '');
      assert.match(proc.out, /dice\.yaml: not found/, 'said once, at boot');
    });

    await t('and a file that appears later is picked up without a restart', async () => {
      await edit(dir, FIXTURE);
      const { body } = await getModule(base);
      const mod = await evalModule(body);
      assert.deepEqual(mod.DECLARED, parseYaml(FIXTURE).tree);
      assert.equal(mod.SOURCE, FIXTURE);
    });
  } finally {
    await stopServer(proc);
  }
}

// ---- the declaration's felts are what the WIRE accepts ----------------------
//
// docs/DEVMODE.md §9 (phase C4): "The server parses the same file, so it
// accepts a new id on the wire after a restart, and after the mtime re-read
// in phase 2." Without this half a house felt works solo and is 400'd at a
// shared table — which is precisely the failure tests/felt-ids.test.mjs
// exists to keep the three hand-kept lists from producing.
//
// AND SINCE PHASE E1 THE DECLARATION IS THE WHOLE LIST (2026-09-03). server.js
// held eleven mat ids in a literal and ADDED the file's rows to them; the mats
// are rows now, so this fixture — a small declaration of this test's own —
// declares the two it wants and the server accepts exactly those. `ocean` used
// to work here on the strength of the literal alone, which is precisely the
// second source of truth the migration removed.
{
  // …and two ids the BROWSER will never resolve, declared beside the good one.
  // `reconcileRows` drops a row whose id fails ASSET_ID_RE and `reconcile`
  // drops a dotted key before that, so neither reaches the picker — and a wire
  // allowlist widened by every key under `felts:` would accept a room felt no
  // client can wear (the C4 review, 2026-09-03). The dotted one is quoted
  // because js/yaml.js refuses an unquoted dotted key outright.
  const withFelts = `${FIXTURE}\nfelts:\n  ocean:\n    name: Ocean\n    feltBase: "#16404a"\n`
    + `  house-moss:\n    name: Moss\n    cloth: silt\n`
    + `  HouseUpper:\n    name: Upper\n  "house.dot":\n    name: Dotted\n`;
  const dir = makeTree(withFelts);
  trees.push(dir);
  const port = await freePort();
  const proc = await startServer(dir, port);
  const base = `http://127.0.0.1:${port}`;
  const post = async (route, body) => {
    const res = await fetch(`${base}${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    const room = 'felts-wire';
    const j = await post('/api/join', { room, name: 'Alice' });
    assert.equal(j.status, 200, `join: ${j.status}`);
    const { playerId } = j.body;

    await t('a felt the declaration names is accepted; the code has no row for any of them', async () => {
      const s = await post('/api/settings', { room, playerId, settings: { felt: 'house-moss' } });
      assert.equal(s.status, 200, `settings: ${s.status} ${JSON.stringify(s.body)}`);
      assert.equal(s.body.settings.felt, 'house-moss', 'and it is the room\'s felt now');
    });

    await t('…and one it does not is still refused', async () => {
      const s = await post('/api/settings', { room, playerId, settings: { felt: 'chartreuse' } });
      assert.equal(s.status, 400, 'an unknown felt is a 400, not a silent fallback');
      const back = await post('/api/settings', { room, playerId, settings: { felt: 'ocean' } });
      assert.equal(back.body.settings.felt, 'ocean', 'while a row THIS file declares does work');
      // …and `taproom`, which the repo's own dice.yaml ships, is refused here,
      // because this fixture does not declare it. That is the E1 property
      // stated as a test: the wire list is the file, not the build.
      const notHere = await post('/api/settings', { room, playerId, settings: { felt: 'taproom' } });
      assert.equal(notHere.status, 400, 'a mat this declaration does not name is not a mat this server has');
    });

    // THE INVERSE OF THIS FILE'S OWN FAILURE, and the one the C4 review found:
    // not "works solo, refused on the wire" but "accepted on the wire,
    // resolvable by nobody". A row whose id the browser drops must not become a
    // room felt, or one viewer setting it leaves every table wearing its old
    // cloth with no swatch pressed and nothing said.
    await t('a declared id the browser could never resolve is NOT accepted', async () => {
      for (const bad of ['HouseUpper', 'house.dot']) {
        const s = await post('/api/settings', { room, playerId, settings: { felt: bad } });
        assert.equal(s.status, 400, `${bad} is not a legal asset id, so it is not a legal room felt`);
      }
      const ok = await post('/api/settings', { room, playerId, settings: { felt: 'house-moss' } });
      assert.equal(ok.status, 200, 'and the legal row declared beside them still works');
    });

    await t('an edit to the file adds an id without a restart — the mtime re-read carries it', async () => {
      const before = await post('/api/settings', { room, playerId, settings: { felt: 'house-ash' } });
      assert.equal(before.status, 400, 'not declared yet');
      await edit(dir, `${withFelts}  house-ash:\n    name: Ash\n`);
      // The re-read happens on the served module's own request, which is the
      // one thing that touches the file — so ask for it, as a reloading tab
      // would, and only then is the id live.
      await getModule(base);
      const after = await post('/api/settings', { room, playerId, settings: { felt: 'house-ash' } });
      assert.equal(after.status, 200, `after the edit: ${after.status} ${JSON.stringify(after.body)}`);
      assert.equal(after.body.settings.felt, 'house-ash');
    });

    assertNoModeInLog(proc);
  } finally {
    await stopServer(proc);
  }
}

for (const dir of trees) rmSync(dir, { recursive: true, force: true });

if (failed === 0) console.log(`tunables-serve.test: ${n} passed`);
else { console.error(`tunables-serve.test: ${failed}/${n} FAILED`); process.exitCode = 1; }
