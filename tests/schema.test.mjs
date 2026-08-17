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

// tests/schema.test.mjs — C22's versioning contract for client state.
//
// The suite exists for ONE claim above all others, and it is the claim that
// costs a real player their library if it is wrong: THERE ARE BROWSERS IN THE
// FIELD RIGHT NOW HOLDING `dice.profiles.v1` WITH NO VERSION STAMP AT ALL.
// Adding a stamp must load those, not purge them. Every other test here is
// about the asymmetry (older migrates, newer refuses) that is easy to write
// backwards and impossible to notice once it ships.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EPOCH, MAJOR, MINOR, STAMP, SCHEMA, parseStamp, formatStamp,
  judgeStamp, registerConverter, clearConverters, canConvert, convert,
} from '../js/schema.js';
import { emptyStore, normalizeStore, readStore, STORE_STAMP, profilesOf } from '../js/profiles.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// ---- the stamp itself ------------------------------------------------------

t('the stamp is three numbers, and it round-trips', () => {
  assert.equal(STAMP, `${EPOCH}.${MAJOR}.${MINOR}`);
  assert.deepEqual(parseStamp(STAMP), { epoch: EPOCH, major: MAJOR, minor: MINOR });
  assert.equal(formatStamp(SCHEMA), STAMP);
});

t('anything that is not three numbers is not a stamp', () => {
  for (const bad of ['', 'v2.0.0', '2.0', '2.0.0.1', '2.0.x', 'banana', '  ', null, 7, {}, ['2', '0', '0']]) {
    assert.equal(parseStamp(bad), null, `${JSON.stringify(bad)} must not parse`);
  }
  assert.deepEqual(parseStamp(' 2.0.0 '), { epoch: 2, major: 0, minor: 0 }, 'surrounding space is forgiven');
  assert.equal(parseStamp('1234567.0.0'), null, 'and a bignum is refused rather than compared');
});

// ---- THE FIELD-COMPAT PIN --------------------------------------------------

t('a TODAY-SHAPED store — no stamp at all — LOADS, and loses nothing', () => {
  // The literal bytes a browser in the field is holding: `v: 1` from
  // STORE_VERSION, no `ver` key, real profiles inside.
  const inField = {
    v: 1,
    seq: 2,
    activeId: 'p1',
    profiles: [
      { id: 'p1', name: 'Bram', system: 'dnd', pools: [{ id: 1, name: 'Sword', notation: '1d20+5' }], at: 100 },
      { id: 'p2', name: 'Wren', system: 'soul-deal', pools: [{ id: 1, name: 'Body', notation: '3d6' }], at: 50 },
    ],
  };
  const read = readStore(inField);
  assert.equal(read.ok, true, 'an unstamped store is NOT a refusal');
  assert.equal(read.stamp.epoch, EPOCH, 'it is read as this epoch');
  assert.equal(read.stamp.major, 0, 'at major 0 — the oldest data this epoch can hold');
  const store = normalizeStore(read.raw);
  assert.equal(profilesOf(store).length, 2, 'both profiles survive');
  assert.deepEqual(profilesOf(store).map((p) => p.name), ['Bram', 'Wren']);
  assert.equal(profilesOf(store)[0].pools.length, 1, 'and so do their pools');
  assert.equal(store.activeId, 'p1', 'and the active pointer');
});

t('a store this build writes carries the stamp, and re-reads clean', () => {
  assert.equal(emptyStore().ver, STORE_STAMP);
  assert.equal(emptyStore().v, 1, 'and keeps `v` — a build without this one still reads it');
  const round = normalizeStore(emptyStore());
  assert.equal(round.ver, STAMP, 'normalizeStore rewrites forward: every boot stamps');
  assert.equal(readStore(round).ok, true);
});

t('junk in place of a store is an empty library, never a throw', () => {
  for (const bad of [null, undefined, 'nope', 42, [], { profiles: 'no' }]) {
    const read = readStore(bad);
    assert.equal(read.ok, true, `${JSON.stringify(bad)} is not a refusal`);
    assert.equal(profilesOf(normalizeStore(read.raw)).length, 0);
  }
});

// ---- the asymmetry ---------------------------------------------------------

t('LOWER major loads: the reader knows more than the writer did', () => {
  assert.equal(judgeStamp(`${EPOCH}.${MAJOR}.${MINOR}`).action, 'load');
  assert.equal(judgeStamp(`${EPOCH}.${MAJOR}.${MINOR + 9}`).action, 'load', 'nothing branches on minor');
  if (MAJOR > 0) assert.equal(judgeStamp(`${EPOCH}.${MAJOR - 1}.0`).action, 'load');
});

t('HIGHER major REFUSES, out loud, and says what to do', () => {
  const v = judgeStamp(`${EPOCH}.${MAJOR + 1}.0`, 'your saved pools');
  assert.equal(v.action, 'refuse');
  assert.match(v.message, /^✗ /, "the app's refusal grammar");
  assert.match(v.message, /your saved pools/, 'it names the thing being refused');
  assert.match(v.message, new RegExp(`${EPOCH}\\.${MAJOR + 1}\\.0`), 'it names the stamp it found');
  assert.match(v.message, new RegExp(STAMP.replace(/\./g, '\\.')), '…and the one it reads');
  assert.match(v.message, /Reload|download/i, 'and what to do about it');
});

t('a refused store is what the app must NOT write over', () => {
  const newer = { ver: `${EPOCH}.${MAJOR + 1}.0`, profiles: [{ id: 'p1', name: 'Bram', pools: [] }] };
  const read = readStore(newer);
  assert.equal(read.ok, false, 'refused');
  assert.ok(read.message, 'with a sentence for the human');
  // The mechanical half: main.js loads normalizeStore(null) — an EMPTY store —
  // and locks the key. Proved here as the property that makes the lock
  // necessary: normalizing the newer blob would keep only what this build
  // understands, and saving that back is the data loss.
  assert.equal(profilesOf(normalizeStore(newer)).length, 1);
  assert.equal(normalizeStore(newer).profiles[0].pools.length, 0,
    'normalizeStore is a whitelist — it would quietly return the subset it knows');
});

// ---- epoch, purge and the converter registry -------------------------------

t('a different epoch purges by default — a converter is a decision, not a default', () => {
  clearConverters();
  const v = judgeStamp(`${EPOCH + 1}.0.0`);
  assert.equal(v.action, 'purge');
  assert.match(v.reason, /different data model/);
  assert.equal(judgeStamp(`${EPOCH - 1}.0.0`).action, 'purge', 'downward too — epoch offers nothing either way');
});

t('a registered converter turns a purge into a convert, and runs once per step', () => {
  clearConverters();
  assert.equal(canConvert(EPOCH - 1), false);
  const seen = [];
  registerConverter(EPOCH - 1, (blob) => { seen.push(EPOCH - 1); return { ...blob, lifted: true }; });
  assert.equal(canConvert(EPOCH - 1), true);
  assert.equal(judgeStamp(`${EPOCH - 1}.0.0`).action, 'convert');
  assert.deepEqual(convert({ a: 1 }, EPOCH - 1), { a: 1, lifted: true });
  assert.deepEqual(seen, [EPOCH - 1], 'one step, one run');
  clearConverters();
});

t('a chain walks N → N+1 → N+2; a gap in it is a purge, not a half-conversion', () => {
  clearConverters();
  registerConverter(EPOCH - 2, (b) => ({ ...b, a: true }));
  assert.equal(canConvert(EPOCH - 2), false, 'the EPOCH-1 step is missing');
  registerConverter(EPOCH - 1, (b) => ({ ...b, b: true }));
  assert.equal(canConvert(EPOCH - 2), true);
  assert.deepEqual(convert({}, EPOCH - 2), { a: true, b: true });
  clearConverters();
});

t('a converter that throws or declines is a purge — we do not keep what we could not rewrite', () => {
  clearConverters();
  registerConverter(EPOCH - 1, () => { throw new Error('bad shape'); });
  assert.equal(convert({}, EPOCH - 1), null);
  clearConverters();
  registerConverter(EPOCH - 1, () => null);
  assert.equal(convert({}, EPOCH - 1), null);
  clearConverters();
});

t('an unreadable stamp takes the epoch answer, not the load answer', () => {
  clearConverters();
  const v = judgeStamp('not-a-version');
  assert.equal(v.action, 'purge');
  assert.equal(v.stamp, null);
  assert.match(v.reason, /unreadable/);
});

// ---- the copies that must not drift ----------------------------------------

t('js/report.js carries the same numbers (it cannot import them, on purpose)', () => {
  const src = readFileSync(join(ROOT, 'js', 'report.js'), 'utf8');
  const m = /var SCHEMA_STAMP = '([\d.]+)'/.exec(src);
  assert.ok(m, 'report.js declares SCHEMA_STAMP');
  assert.equal(m[1], STAMP,
    'report.js and js/schema.js disagree — the crash reporter would name the wrong build');
});

t('main.js folds the origin-wide purge onto the SAME epoch', () => {
  const src = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
  assert.match(src, /const SCHEMA = SCHEMA_EPOCH;/,
    'dice.schema.v1 must read js/schema.js EPOCH — two copies is the bug this contract exists to stop');
});

// ---- C22's SECOND half: the table setup (ROADMAP §5's neighbour, §G4/§G6) ---
//
// THE CLAIM WORTH THE MOST HERE IS "THE WRITER STAMPS", and it is a claim about
// three files that a running server cannot check: a server that answered 200
// would look identical whether the client sent a stamp or not, so the round-trip
// test below passes just as happily against a client that stopped stamping. So
// the writer is pinned at the SOURCE — the same technique the report.js drift
// test above uses, and for the same reason.
//
// (The e2e side asserts the CONSEQUENCE — `__diceDebug.schemaState.table.roomStamp`
// after a push — which is the assertion that also proves the pipe and the
// server. Both are wanted: this one names the line that broke.)

t('the AUTHORING push stamps, in both the wire body and the record it keeps', () => {
  const src = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
  const pushes = src.match(/net\.pushTable\(\{[^}]*\}\)/g) || [];
  assert.ok(pushes.length >= 2, 'portablePushToTable pushes twice (the retry over a lost race)');
  for (const call of pushes) {
    assert.match(call, /\bver\b/,
      `a net.pushTable call with no ver: ${call} — an unstamped setup is C22's open half`);
  }
  // The localStorage record is the thing §G6 replays days later; a stamp on the
  // wire only would leave the replay unjudgeable.
  assert.match(src, /save\(LS_TABLE, \{[^}]*ver: SCHEMA_STAMP/,
    'dice.table.v1:<room> must carry the stamp of the build that authored it');
});

t('the REPLAY forwards the record\'s stamp and never mints one', () => {
  const src = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
  const fn = /function maybeRepushTable\(\)\s*\{[\s\S]*?\n\}/.exec(src);
  assert.ok(fn, 'maybeRepushTable is still the re-push site');
  assert.match(fn[0], /ver: typeof stored\.ver === 'string' \? stored\.ver : undefined/,
    'the replay must forward the stored stamp — minting today\'s would claim authorship of bytes it only stored');
  assert.doesNotMatch(fn[0], /SCHEMA_STAMP/,
    'the replay path must not reach for this build\'s stamp at all');
});

t('every reader of an incoming room.setup goes through the judged door', () => {
  const src = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
  const raw = src.match(/roomSetup = (?!adoptRoomSetup)(?!null)(?!refusedSetup)[^;\n]+/g) || [];
  assert.deepEqual(raw, [],
    `an unjudged roomSetup assignment: ${raw.join(' | ')} — hello, join and 'table-setup' must all judge`);
  // …and the judged door must actually be able to refuse.
  const fn = /function adoptRoomSetup\(setup\)\s*\{[\s\S]*?\n\}/.exec(src);
  assert.ok(fn, 'adoptRoomSetup is the one door');
  assert.match(fn[0], /judgeStamp\(setup\.ver/, 'it judges the stamp the writer put on');
  assert.match(fn[0], /refusedSetup\(setup\.rev\)/,
    'a refusal keeps the rev and drops the content — see refusedSetup for why the rev must survive');
});

t('js/net.js pipes ver without inventing it', () => {
  const src = readFileSync(join(ROOT, 'js', 'net.js'), 'utf8');
  assert.match(src, /async pushTable\(\{ rev, table, profiles, ver \} = \{\}\)/,
    'pushTable must accept the stamp — a signature that drops it silently unstamps every push');
  assert.match(src, /if \(typeof ver === 'string' && ver\) body\.ver = ver;/,
    'absent must stay absent: a pre-stamp record must not acquire one in transit');
});

// ---- and the server half, against a real server ----------------------------

const { spawn } = await import('node:child_process');
const { createServer } = await import('node:net');

const freePort = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

// A real server.js child on an ephemeral port — never 8123 (Joe's live table).
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
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server never came up on :${port}\n${out.slice(-2000)}`);
}

const at = async (name, fn) => {
  n++;
  try { await fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  }
};

const port = await freePort();
const proc = await startServer(port);
const base = `http://127.0.0.1:${port}`;
const post = async (path, body) => {
  const res = await fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const joinRoom = async (room, name) => (await post('/api/join', { room, name })).data;

try {
  await at('the server CARRIES the stamp verbatim and does not mint one', async () => {
    const me = await joinRoom('stamp-carry', 'Ada');
    const push = await post('/api/table', {
      room: 'stamp-carry', playerId: me.playerId, rev: 1, ver: '2.0.0',
      table: { felt: 'crimson' }, profiles: [],
    });
    assert.equal(push.status, 200);
    assert.equal(push.data.applied, true);
    // The setup rides the join response — the same projection hello and the
    // 'table-setup' broadcast use.
    const back = await joinRoom('stamp-carry', 'Bo');
    assert.equal(back.setup.ver, '2.0.0', 'the stamp came back exactly as pushed');
    // A stamp the SERVER minted is the failure this closes: it would read as
    // authoritative while naming a build no reader cares about.
    const future = await post('/api/table', {
      room: 'stamp-carry', playerId: me.playerId, rev: 2, ver: '9.9.9', table: {}, profiles: [],
    });
    assert.equal(future.data.applied, true, 'the server does NOT judge — that is the client\'s job');
    const after = await joinRoom('stamp-carry', 'Cy');
    assert.equal(after.setup.ver, '9.9.9',
      'a setup from the future reaches the client intact, so the client can refuse it out loud');
  });

  await at('absent stays absent — a pre-stamp record still heals a restarted room', async () => {
    const me = await joinRoom('stamp-absent', 'Ada');
    const push = await post('/api/table', {
      room: 'stamp-absent', playerId: me.playerId, rev: 7, table: {}, profiles: [],
    });
    assert.equal(push.data.applied, true, 'a §G6 replay of a pre-stamp record must still land');
    const back = await joinRoom('stamp-absent', 'Bo');
    assert.equal(Object.hasOwn(back.setup, 'ver'), false,
      'present-or-absent: no null `ver` key, so judgeStamp reaches its absent path');
    assert.equal(back.setup.rev, 7);
  });

  await at('junk in the version field is refused before anything is mutated', async () => {
    const me = await joinRoom('stamp-junk', 'Ada');
    const good = await post('/api/table', {
      room: 'stamp-junk', playerId: me.playerId, rev: 1, ver: '2.0.0',
      table: { felt: 'crimson' }, profiles: [],
    });
    assert.equal(good.data.applied, true);
    for (const bad of ['banana', 'v2.0.0', '2.0', '2.0.0.1', '1234567.0.0', 7, {}, ['2.0.0']]) {
      const res = await post('/api/table', {
        room: 'stamp-junk', playerId: me.playerId, rev: 99, ver: bad,
        table: { felt: 'forest' }, profiles: [{ name: 'Ghost', system: 'soul-deal', pools: [] }],
      });
      assert.equal(res.status, 400, `ver ${JSON.stringify(bad)} must be refused`);
      assert.equal(res.data.code, 'bad_ver');
    }
    // VALIDATE BEFORE MUTATING is handleTable's own rule, and a bad stamp is
    // now part of what "well-formed" means: none of those eight rejected
    // pushes may have left the felt or the rev moved.
    const back = await joinRoom('stamp-junk', 'Bo');
    assert.equal(back.setup.rev, 1, 'a refused push did not take the rev');
    assert.equal(back.setup.ver, '2.0.0');
    assert.equal(back.settings.felt, 'crimson', '…nor the felt');
    assert.deepEqual(back.setup.profiles, [], '…nor the seats');
  });
} finally {
  if (proc.exitCode === null) {
    proc.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } resolve(); }, 2000);
      proc.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`all ${n} schema tests pass`);
