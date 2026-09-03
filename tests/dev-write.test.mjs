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

// tests/dev-write.test.mjs — the armed Save route (docs/DEVMODE.md §6, §10).
//
// The claim this file exists to prove is the NEGATIVE one: **the write route
// cannot be used against Joe.** So the order below is refusals first and the
// happy path second.
//
//   * unarmed — which is every deploy — there is no route at all: both paths
//     answer the ordinary /api/ 404, not a 403 that would confirm they exist
//   * armed: `GET /api/dev/status` says { armed: true, file: 'dice.yaml' }
//   * a lawful write patches the checkout's OWN text: the re-read parses to
//     the new tree, every comment survives, and only the changed lines moved
//   * refused: a foreign Origin, no Origin, a cross-site Sec-Fetch-Site,
//     text/plain, a body over 1 MiB, `../dice.yaml`, `server.js`, `app.mode`,
//     an unknown path, a wrong type, an enum outside its options
//   * refused: the DNS-REBINDING shape — Host and Origin agreeing on a foreign
//     name that resolves to 127.0.0.1 — posed with raw node:http, since fetch
//     will not set Host (the C1 review, 2026-09-02); and the loopback names
//     the panel really arrives by still pass
//   * `isLoopback` — the one condition that rides the SOCKET and so cannot be
//     posed from a test's headers — is unit-tested as the predicate it is
//   * two writes at once both land: the second reads the first's text
//   * after a write the served /js/tunables.js is the saved declaration, so
//     the next reload boots on it
//
// Real server.js children on ephemeral ports — never 8123 (Joe's live table)
// — and never against the checkout: every server here runs from a SCRATCH
// COPY of the tree (server.js + js/ + a copy of the real dice.yaml, which is
// what makes the dial paths below real ones), and every byte written lands in
// a scratch directory that is removed at the end.

import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

import { parseYaml } from '../js/yaml.js';
// server.js binds no port when it is imported rather than run (IS_MAIN), the
// way tests/redaction.test.mjs already leans on. The predicate comes from the
// door itself, not from a copy of it in this file.
import { isLoopback } from '../server.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCRATCH_BASE = process.env.DICE_TEST_SCRATCH || tmpdir();
mkdirSync(SCRATCH_BASE, { recursive: true });

const CHECKOUT_YAML = readFileSync(join(ROOT, 'dice.yaml'), 'utf8');

const trees = [];
function makeTree(yaml = CHECKOUT_YAML) {
  const dir = mkdtempSync(join(SCRATCH_BASE, 'dev-write-'));
  trees.push(dir);
  cpSync(join(ROOT, 'server.js'), join(dir, 'server.js'));
  cpSync(join(ROOT, 'js'), join(dir, 'js'), { recursive: true });
  writeFileSync(join(dir, 'dice.yaml'), yaml);
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

async function startServer(dir, port, extra = {}) {
  const proc = spawn(process.execPath, [join(dir, 'server.js')], {
    env: { ...process.env, PORT: String(port), GIT_SHA: '', DICE_MODE: '', DICE_DEV_WRITE: '', DICE_DEV_ROOT: '', DICE_LOG_LEVEL: 'info', ...extra },
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

async function stopServer(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 2000);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

// A POST the way the panel makes it: same-origin, JSON, an Origin that is the
// server's own. Every refusal test below is this with exactly one thing wrong.
async function post(base, body, { headers = {}, raw = null } = {}) {
  const host = new URL(base).host;
  const res = await fetch(`${base}/api/dev/write`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `http://${host}`,
      ...headers,
    },
    body: raw === null ? JSON.stringify(body) : raw,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

// The same POST at a lower level, because `fetch` refuses to let a caller set
// `Host` (it is a forbidden header there) and the DNS-REBINDING shape is
// exactly a request whose Host is not the one the socket was reached by:
// `rebound.example` resolving to 127.0.0.1, with Origin agreeing. Raw
// node:http is the only way to pose it.
function rawPost(port, { host, origin, headers = {}, body = '{}', path = '/api/dev/write' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        Host: host,
        ...(origin === undefined ? {} : { Origin: origin }),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { text += d; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(text); } catch { /* no body */ }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.end(body);
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

// ---- the predicate that rides the socket -----------------------------------

await t('isLoopback recognises loopback and nothing else', () => {
  for (const good of ['127.0.0.1', '127.0.0.67', '127.1.2.3', '127.255.255.255',
    '::1', '0:0:0:0:0:0:0:1', '::ffff:127.0.0.1', '::FFFF:127.0.0.1', '::1%lo0', '[::1]', ' 127.0.0.1 ']) {
    assert.equal(isLoopback(good), true, `${good} is loopback`);
  }
  for (const bad of ['10.0.0.1', '192.168.1.4', '128.0.0.1', '126.255.255.255', '0.0.0.0',
    '::ffff:10.0.0.1', '2001:db8::1', 'fe80::1', '127.0.0.256', '127.0.0', 'localhost',
    '', ' ', null, undefined, 127, {}, ['127.0.0.1']]) {
    assert.equal(isLoopback(bad), false, `${JSON.stringify(bad)} is not loopback`);
  }
});

// ---- unarmed: the route does not exist --------------------------------------

{
  const dir = makeTree();
  const port = await freePort();
  const proc = await startServer(dir, port);
  const base = `http://127.0.0.1:${port}`;
  try {
    await t('unarmed, both routes are the ordinary /api/ 404', async () => {
      const status = await fetch(`${base}/api/dev/status`);
      assert.equal(status.status, 404);
      const sBody = await status.json();
      assert.equal(sBody.code, 'not_found', 'the same 404 any unknown endpoint gets');
      assert.equal(sBody.armed, undefined, 'and it says nothing about arming');

      const write = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 30 } });
      assert.equal(write.status, 404, 'a lawful write is still a 404 with no route to take it');
      assert.equal(write.data.code, 'not_found');
      assert.equal(readFileSync(join(dir, 'dice.yaml'), 'utf8'), CHECKOUT_YAML, 'and nothing was written');
    });

    await t('unarmed, DICE_DEV_WRITE must be exactly "1"', async () => {
      // A second child with the variable set to something truthy-looking but
      // not the word: still no route. (Arming is a deliberate act, not a
      // shell truthiness accident.)
      const p2 = await freePort();
      const child = await startServer(dir, p2, { DICE_DEV_WRITE: 'true' });
      try {
        const res = await fetch(`http://127.0.0.1:${p2}/api/dev/status`);
        assert.equal(res.status, 404);
        await res.arrayBuffer();
      } finally { await stopServer(child); }
    });
  } finally {
    await stopServer(proc);
  }
}

// ---- armed: status, refusals, the write -------------------------------------

{
  const dir = makeTree();
  const port = await freePort();
  const proc = await startServer(dir, port, { DICE_DEV_WRITE: '1', DICE_DEV_ROOT: dir });
  const base = `http://127.0.0.1:${port}`;
  const yamlNow = () => readFileSync(join(dir, 'dice.yaml'), 'utf8');
  const resetFile = () => writeFileSync(join(dir, 'dice.yaml'), CHECKOUT_YAML);
  try {
    await t('armed, GET /api/dev/status says so and names its one file', async () => {
      const res = await fetch(`${base}/api/dev/status`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { armed: true, file: 'dice.yaml' });
    });

    // ---- the four conditions, one wrong thing at a time ---------------------

    await t('a foreign Origin is refused: 403 origin', async () => {
      const r = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 30 } },
        { headers: { Origin: 'http://evil.example' } });
      assert.equal(r.status, 403);
      assert.equal(r.data.reason, 'origin');
      assert.equal(r.data.ok, false);
      assert.equal(yamlNow(), CHECKOUT_YAML, 'nothing written');
    });

    await t('an Origin naming another port on this host is refused too', async () => {
      const r = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 30 } },
        { headers: { Origin: `http://127.0.0.1:${port + 1}` } });
      assert.equal(r.status, 403);
      assert.equal(r.data.reason, 'origin');
    });

    await t('no Origin at all is refused: a bare curl is not the shape that writes', async () => {
      const host = new URL(base).host;
      const res = await fetch(`${base}/api/dev/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Host: host },
        body: JSON.stringify({ file: 'dice.yaml', changes: { 'light.lamp.y': 30 } }),
      });
      assert.equal(res.status, 403);
      assert.equal((await res.json()).reason, 'origin');
      assert.equal(yamlNow(), CHECKOUT_YAML);
    });

    // ---- the rebinding shape (found by the C1 review, 2026-09-02) ----------
    //
    // A page on a foreign name that resolves to 127.0.0.1 posts here: the
    // socket really is loopback, and Host and Origin agree — with each other,
    // because the browser derives both from the same URL. So "Origin equals
    // this request's own Host" is satisfied for free, and until the Host was
    // required to BE a loopback name the write landed. Every field below is
    // the honest shape except the name.
    await t('a DNS-rebinding shape — Host and Origin agreeing on a foreign name — is refused', async () => {
      for (const name of ['rebound.example', 'localhost.rebound.example', 'dice.internal']) {
        const r = await rawPost(port, {
          host: `${name}:${port}`,
          origin: `http://${name}:${port}`,
          headers: { 'Sec-Fetch-Site': 'same-origin' },
          body: JSON.stringify({ file: 'dice.yaml', changes: { 'light.lamp.y': 99 } }),
        });
        assert.equal(r.status, 403, name);
        assert.equal(r.data.reason, 'origin', name);
      }
      assert.equal(yamlNow(), CHECKOUT_YAML, 'nothing written by any of them');
    });

    await t('…and the loopback names the panel really arrives by are not refused', async () => {
      // The other half of that fix: the honest cases must still open the
      // door. Empty changes so a passing request writes the bytes it found.
      for (const name of [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `127.0.0.5:${port}`,
        `LOCALHOST:${port}`, `localhost.:${port}`]) {
        const r = await rawPost(port, {
          host: name,
          origin: `http://${name}`,
          headers: { 'Sec-Fetch-Site': 'same-origin' },
          body: JSON.stringify({ file: 'dice.yaml', changes: {} }),
        });
        assert.equal(r.status, 200, name);
        assert.equal(r.data.ok, true, name);
      }
      assert.equal(yamlNow(), CHECKOUT_YAML, 'and an empty patch is still a byte-identical file');
    });

    await t('Sec-Fetch-Site that is not same-origin is refused: 403 site', async () => {
      for (const site of ['cross-site', 'same-site', 'none']) {
        const r = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 30 } },
          { headers: { 'Sec-Fetch-Site': site } });
        assert.equal(r.status, 403, site);
        assert.equal(r.data.reason, 'site', site);
      }
      const ok = await post(base, { file: 'dice.yaml', changes: {} }, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
      assert.equal(ok.status, 200, 'and same-origin passes the same gate');
    });

    await t('text/plain is refused: 403 type', async () => {
      const r = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 30 } },
        { headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
      assert.equal(r.status, 403);
      assert.equal(r.data.reason, 'type');
      assert.equal(yamlNow(), CHECKOUT_YAML);
    });

    await t('a body over 1 MiB is refused: 413 large, and it is not buffered', async () => {
      const big = JSON.stringify({ file: 'dice.yaml', changes: { 'app.title': 'x'.repeat(1024 * 1024 + 64) } });
      assert.ok(big.length > 1024 * 1024);
      const r = await post(base, null, { raw: big });
      assert.equal(r.status, 413);
      assert.equal(r.data.reason, 'large');
      assert.equal(yamlNow(), CHECKOUT_YAML);
    });

    await t('a body just under the cap is read', async () => {
      // The cap is a cap, not a chokepoint: a legal patch of any realistic
      // size gets through, so the 413 above is about abuse and not about us.
      const filler = 'x'.repeat(900 * 1024);
      const r = await post(base, { file: 'dice.yaml', changes: { 'app.title': filler } });
      assert.equal(r.status, 200);
      assert.equal(r.data.changes.length, 1);
      resetFile();
    });

    // ---- the body's own shape ----------------------------------------------

    await t('file must be in the frozen allowlist of one', async () => {
      for (const file of ['../dice.yaml', 'server.js', 'js/main.js', '/etc/passwd', 'dice.yaml\0', '', null, 7, ['dice.yaml']]) {
        const r = await post(base, { file, changes: { 'light.lamp.y': 30 } });
        assert.equal(r.status, 400, JSON.stringify(file));
        assert.equal(r.data.reason, 'file', JSON.stringify(file));
        assert.equal(r.data.detail, String(file).slice(0, 120).trim(), 'the refusal names the path it was given');
      }
      assert.equal(yamlNow(), CHECKOUT_YAML, 'nothing written, nothing created');
    });

    await t('changes must be a map', async () => {
      for (const changes of [null, undefined, 'light.lamp.y=30', 7, [['light.lamp.y', 30]]]) {
        const r = await post(base, { file: 'dice.yaml', changes });
        assert.equal(r.status, 400, JSON.stringify(changes));
        assert.equal(r.data.reason, 'changes', JSON.stringify(changes));
      }
    });

    await t('app.mode is refused by path: Save can never flip the production switch', async () => {
      const r = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 30, 'app.mode': 'production' } });
      assert.equal(r.status, 400);
      assert.equal(r.data.reason, 'refused');
      assert.equal(r.data.problems.length, 1, 'one line for one problem');
      assert.match(r.data.problems[0], /^app\.mode: /, 'and it names the path');
      assert.equal(yamlNow(), CHECKOUT_YAML, 'the lawful leaf in the same body did not land either');
    });

    await t('an unknown path, a wrong type and an enum outside its options are refused', async () => {
      const cases = [
        [{ 'light.lamp.nope': 3 }, /^light\.lamp\.nope: no dial at this path/],
        [{ 'nope.at.all': 3 }, /^nope\.at\.all: no dial at this path/],
        [{ 'light.lamp.y.deeper': 3 }, /passes through the dial at light\.lamp\.y/],
        [{ 'light.lamp': 3 }, /^light\.lamp: a map in the dial tree/],
        [{ 'light.lamp.y': 'high' }, /^light\.lamp\.y: expected number/],
        [{ 'light.lamp.y': { deep: 1 } }, /^light\.lamp\.y: expected a scalar, got a map/],
        [{ 'app.title': 4 }, /^app\.title: expected string/],
        [{ 'throw.spawn.axis': 'sideways' }, /^throw\.spawn\.axis: expected one of/],
        [{ 'light.motes.state': 'on' }, /^light\.motes\.state: expected one of/],
      ];
      for (const [changes, re] of cases) {
        const r = await post(base, { file: 'dice.yaml', changes });
        assert.equal(r.status, 400, JSON.stringify(changes));
        assert.equal(r.data.reason, 'refused', JSON.stringify(changes));
        assert.match(r.data.problems[0], re);
      }
      assert.equal(yamlNow(), CHECKOUT_YAML);
    });

    // ---- the lawful write ---------------------------------------------------

    await t('a lawful write patches the checkout\'s own text, comments and all', async () => {
      resetFile();
      const r = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 30, 'table.scale': 3 } });
      assert.equal(r.status, 200);
      assert.equal(r.data.ok, true);
      assert.equal(r.data.file, 'dice.yaml');
      assert.equal(r.data.served, true, 'this IS the served declaration');
      assert.match(r.data.note, /reload/, 'and the answer says the values are on the next boot');
      assert.deepEqual(r.data.changes, [
        { path: 'light.lamp.y', from: 24, to: 30 },
        { path: 'table.scale', from: 2.5, to: 3 },
      ]);

      const after = yamlNow();
      assert.equal(r.data.bytes, Buffer.byteLength(after), 'bytes is what landed');
      assert.equal(r.data.sha1, createHash('sha1').update(after).digest('hex'), 'and so is sha1');
      const tree = parseYaml(after).tree;
      assert.equal(tree.light.lamp.y, 30);
      assert.equal(tree.table.scale, 3);
      const expected = parseYaml(CHECKOUT_YAML).tree;
      expected.light.lamp.y = 30;
      expected.table.scale = 3;
      assert.deepEqual(tree, expected, 'the whole tree is the old one with those two leaves moved');

      const a = CHECKOUT_YAML.split('\n'), b = after.split('\n');
      assert.equal(a.length, b.length, 'no line added or removed');
      const moved = a.map((l, i) => (l === b[i] ? null : i + 1)).filter(Boolean);
      assert.equal(moved.length, 2, `exactly two lines differ (${moved.join(', ')})`);
      assert.match(b[moved.find((i) => b[i - 1].includes('y: 30')) - 1], /# pool ~27/, 'the lamp line kept its comment');
    });

    await t('the served module is the saved declaration on the very next GET', async () => {
      const body = await (await fetch(`${base}/js/tunables.js`)).text();
      const mod = await import(`data:text/javascript;base64,${Buffer.from(body).toString('base64')}`);
      assert.equal(mod.DECLARED.light.lamp.y, 30, 'a tab reloading now boots on the saved value');
      assert.equal(mod.DECLARED.table.scale, 3);
      assert.equal(mod.SOURCE, yamlNow(), 'and SOURCE is the saved text, which is what the next Save patches');
    });

    // ---- an asset row is a lawful write, and the WIRE learns it at once -----
    //
    // docs/DEVMODE.md §9 (phase C4). A `felts:` row has no dial — its law is
    // the section's row shape in js/tune.js — and the route's validator is
    // js/dice-apply-core.js, shared with `tools/dice-apply.mjs`, so a felt
    // authored in the panel lands by exactly the path a dial does.
    //
    // THE SECOND HALF IS THE ONE THAT WAS BROKEN (found running the e2e
    // roundtrip, 2026-09-02): a Save ADOPTS the tree it just parsed rather
    // than re-reading the file, so the felt id was in the served module and
    // still 400'd at /api/settings until some later, unrelated edit — a house
    // felt that worked alone and failed the moment anybody else was at the
    // table, which is exactly the failure the three hand-kept lists exist to
    // prevent. Every assignment to `declaration` now goes through one setter.
    await t('a felts row saves like a dial, and the server accepts the id on the wire immediately', async () => {
      const r = await post(base, {
        file: 'dice.yaml',
        changes: {
          'felts.house-moss.name': 'Moss', 'felts.house-moss.cloth': 'silt',
          'felts.house-moss.feltBase': '#1f3a22', 'felts.house-moss.sceneBg': '#0c120d',
        },
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.changes.length, 4);
      const tree = parseYaml(yamlNow()).tree;
      assert.deepEqual(tree.felts, {
        'house-moss': { name: 'Moss', cloth: 'silt', feltBase: '#1f3a22', sceneBg: '#0c120d' },
      }, 'the section the file never had was created under the root');
      assert.equal(tree.light.lamp.y, 30, 'and the dials written before it are untouched');

      const join = await fetch(`${base}/api/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: 'dev-write-felts', name: 'Alice' }),
      }).then((res) => res.json());
      const setFelt = (felt) => fetch(`${base}/api/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: 'dev-write-felts', playerId: join.playerId, settings: { felt } }),
      });
      const ok = await setFelt('house-moss');
      assert.equal(ok.status, 200, 'the id the Save just created is accepted with no reload of anything');
      assert.equal((await ok.json()).settings.felt, 'house-moss');
      assert.equal((await setFelt('chartreuse')).status, 400, 'and one nobody declared is still refused');
    });

    await t('a felts row with a field that is not a field is refused by name', async () => {
      const before = yamlNow();
      const r = await post(base, { file: 'dice.yaml', changes: { 'felts.house-ash.sheen': 0.5 } });
      assert.equal(r.status, 400);
      assert.equal(r.data.reason, 'refused');
      assert.match(r.data.problems.join(' '), /no felts field named "sheen"/);
      const bad = await post(base, { file: 'dice.yaml', changes: { 'sets.house-ember.label': 'Ember' } });
      assert.equal(bad.status, 400, '…and a section this build cannot declare rows in says so');
      assert.match(bad.data.problems.join(' '), /not declarable in this build/);
      assert.equal(yamlNow(), before, 'nothing written either time');
    });

    await t('a second write reads the first\'s text: the earlier change survives', async () => {
      const r = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 30, 'light.room.hemi': 0.5 } });
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.changes.map((c) => c.path), ['light.room.hemi'],
        'a leaf the file already says is not a change');
      const tree = parseYaml(yamlNow()).tree;
      assert.equal(tree.table.scale, 3, 'the first write is still there');
      assert.equal(tree.light.room.hemi, 0.5);
    });

    await t('an unchanged panel writes nothing at all', async () => {
      const before = yamlNow();
      const r = await post(base, { file: 'dice.yaml', changes: {} });
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.changes, []);
      assert.equal(yamlNow(), before, 'byte for byte');
      assert.equal(r.data.sha1, createHash('sha1').update(before).digest('hex'));
    });

    await t('two writes at once both land: the second sees the first\'s text', async () => {
      resetFile();
      // Both posted before either is answered. The route reads, patches and
      // writes with no await between them, so the second turn of the event
      // loop reads the file the first turn wrote.
      const [a, b] = await Promise.all([
        post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 31 } }),
        post(base, { file: 'dice.yaml', changes: { 'table.scale': 3.5 } }),
      ]);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      const tree = parseYaml(yamlNow()).tree;
      assert.equal(tree.light.lamp.y, 31, 'the first change is in the file');
      assert.equal(tree.table.scale, 3.5, 'and so is the second');
      resetFile();
    });

    await t('a leaf the file does not name is inserted, one line, under its map', async () => {
      resetFile();
      // dice.yaml names every phase-1 leaf today, so an insertion is made by
      // deleting a line first — the same shape as a file someone trimmed.
      const trimmed = CHECKOUT_YAML.split('\n').filter((l) => !/^ {4}penumbra: /.test(l)).join('\n');
      writeFileSync(join(dir, 'dice.yaml'), trimmed);
      const r = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.penumbra': 0.4 } });
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.changes, [{ path: 'light.lamp.penumbra', from: null, to: 0.4 }],
        'an absent leaf reports `from: null`');
      const after = yamlNow();
      assert.equal(after.split('\n').length, trimmed.split('\n').length + 1, 'exactly one line arrived');
      assert.equal(parseYaml(after).tree.light.lamp.penumbra, 0.4);
      resetFile();
    });

    await t('the log says bytes and sha1, and never the text', async () => {
      await sleep(50);
      const lines = proc.out.split('\n').filter((l) => l.includes('dev write'));
      assert.ok(lines.length >= 1, `a line per write:\n${proc.out.slice(-800)}`);
      for (const l of lines) {
        assert.match(l, /bytes=\d+ sha1=[0-9a-f]{40}/, 'bytes and sha1');
        assert.ok(!/lamp|scale|hemi|penumbra|# pool/.test(l), `no declaration text in the log: ${l}`);
      }
    });

    await t('GET on the write path and POST on the status path are the ordinary refusals', async () => {
      const get = await fetch(`${base}/api/dev/write`);
      assert.equal(get.status, 404, 'the write route is POST-only, so a GET falls to the /api/ 404');
      await get.arrayBuffer();
      const p = await fetch(`${base}/api/dev/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(p.status, 404);
      await p.arrayBuffer();
    });
  } finally {
    await stopServer(proc);
  }
}

// ---- DICE_DEV_ROOT names the directory written under ------------------------

{
  const dir = makeTree();
  const elsewhere = mkdtempSync(join(SCRATCH_BASE, 'dev-write-root-'));
  trees.push(elsewhere);
  writeFileSync(join(elsewhere, 'dice.yaml'), CHECKOUT_YAML);
  const port = await freePort();
  const proc = await startServer(dir, port, { DICE_DEV_WRITE: '1', DICE_DEV_ROOT: elsewhere });
  const base = `http://127.0.0.1:${port}`;
  try {
    await t('DICE_DEV_ROOT is the only directory written under', async () => {
      const r = await post(base, { file: 'dice.yaml', changes: { 'light.lamp.y': 33 } });
      assert.equal(r.status, 200);
      assert.equal(parseYaml(readFileSync(join(elsewhere, 'dice.yaml'), 'utf8')).tree.light.lamp.y, 33,
        'the named root got the write');
      assert.equal(readFileSync(join(dir, 'dice.yaml'), 'utf8'), CHECKOUT_YAML,
        'and the tree the server was started from did not');
      assert.equal(r.data.served, false, 'the answer says so rather than promising a reload that would not show it');
      assert.match(r.data.note, /outside the served tree/);
    });
  } finally {
    await stopServer(proc);
  }
}

for (const dir of trees) rmSync(dir, { recursive: true, force: true });

if (failed === 0) console.log(`dev-write.test: ${n} passed`);
else { console.error(`dev-write.test: ${failed}/${n} FAILED`); process.exitCode = 1; }
// server.js was imported in-process (for isLoopback) and holds a heartbeat
// interval; exit rather than wait for it, the way redaction.test.mjs does.
process.exit(process.exitCode || 0);
