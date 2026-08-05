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

// Server-side visibility redaction (GOALS.md goal 11).
//
// Two layers:
//   1. Unit: projectEntryFor / resolveVisibility, imported straight from
//      server.js (which only listens when run directly). Every mode × viewer
//      role × revealed state, with a JSON walk asserting a redacted
//      projection carries NO value-bearing key.
//   2. Endpoint: a real server.js child on an ephemeral port (never 8123 —
//      that is the live table), real /api/join + /api/events streams, and
//      assertions on the raw SSE bytes each player receives.
//
// The secret / w:Name notation flags are landing in js/notation.js in
// parallel; endpoint cases that need them probe the grammar and SKIP loudly
// until it does. Everything held-shaped (and all unit coverage) runs today.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseNotation } from '../js/notation.js';
import { projectEntryFor, resolveVisibility, entryExistsFor, entryExistsForAll, cleanName, sanitizePools } from '../server.js';

// server.js installs a swallow-and-continue uncaughtException handler for its
// own resilience; a test run must crash loudly instead.
process.removeAllListeners('uncaughtException');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let n = 0;
let failed = 0;
let skipped = 0;
async function t(name, fn) {
  n++;
  try { await fn(); } catch (e) {
    failed++;
    console.error(`FAIL: ${name}\n  ${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  }
}
function skip(name, why) {
  skipped++;
  console.log(`SKIP: ${name} (${why})`);
}

// ---------------------------------------------------------------------------
// Shared leak checks
// ---------------------------------------------------------------------------

// Every key that can carry a result. `spec` is on the list because its mods
// carry part amounts; `counts`/`parts` guard perDie/breakdown shapes wherever
// they might appear.
const FORBIDDEN_KEYS = ['values', 'perDie', 'total', 'modifier', 'mods', 'parts', 'counts', 'meaning', 'verdict', 'spec'];

function keysDeep(x, out = new Set()) {
  if (Array.isArray(x)) for (const v of x) keysDeep(v, out);
  else if (x !== null && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) { out.add(k); keysDeep(v, out); }
  }
  return out;
}

function assertNoValueKeys(obj, what) {
  const keys = keysDeep(obj);
  for (const bad of FORBIDDEN_KEYS) {
    assert.ok(!keys.has(bad), `${what} must not carry "${bad}" (got keys: ${[...keys].join(',')})`);
  }
}

// ---------------------------------------------------------------------------
// Unit: projectEntryFor
// ---------------------------------------------------------------------------

// Distinctive numbers nowhere else in the entry: the rolled 17, the total 23,
// the modifier 6. A redacted projection's JSON must not contain any of them.
function makeEntry(overrides = {}) {
  return {
    rollId: 'roll-1',
    playerId: 'A',
    playerName: 'Ann',
    color: 'c1',
    label: 'the stakes',
    dc: 12,
    dice: ['d20'],
    values: [17],
    perDie: [{ value: 17, counts: true }],
    modifier: 6,
    total: 23,
    spec: { dice: ['d20'], mods: { modifier: 6 } },
    faceDown: false,
    revealed: true,
    seed: 999,
    t: 5,
    ...overrides,
  };
}

const heldVis = { mode: 'held', revealAuthority: 'A' };
const secretVis = { mode: 'secret', revealAuthority: 'A' };
const whisperVis = { mode: 'whisper', audience: ['A', 'C'], revealAuthority: 'A' };

function entryWith(vis, revealed) {
  return makeEntry({
    faceDown: vis && vis.mode === 'held',
    revealed,
    ...(vis ? { visibility: vis } : {}),
  });
}

function assertRedacted(p, entry, visMode, what) {
  assert.ok(p !== null && typeof p === 'object', `${what}: expected a redacted object`);
  assert.equal(p.redacted, true, `${what}: redacted flag`);
  assert.equal(p.visMode, visMode, `${what}: visMode`);
  assert.equal(p.revealAuthority, entry.visibility.revealAuthority, `${what}: revealAuthority`);
  assertNoValueKeys(p, what);
  const json = JSON.stringify(p);
  assert.ok(!json.includes('17') && !json.includes('23') && !json.includes('"6"') && !/[^0-9]6[^0-9]/.test(json),
    `${what}: no rolled number may appear anywhere in ${json}`);
  // The public stakes survive.
  assert.equal(p.rollId, entry.rollId, `${what}: rollId kept`);
  assert.equal(p.playerId, entry.playerId, `${what}: roller id kept`);
  assert.equal(p.playerName, entry.playerName, `${what}: roller name kept`);
  assert.equal(p.label, entry.label, `${what}: label kept`);
  assert.equal(p.dc, entry.dc, `${what}: dc kept`);
  assert.deepEqual(p.dice, entry.dice, `${what}: dice kept`);
  assert.equal(p.seed, entry.seed, `${what}: seed kept`);
  assert.equal(p.t, entry.t, `${what}: t kept`);
  assert.equal(p.faceDown, entry.faceDown, `${what}: faceDown kept`);
  assert.equal(p.revealed, entry.revealed, `${what}: revealed kept`);
}

await t('open entries project as the SAME object for every viewer (byte stability)', () => {
  const e = makeEntry();
  for (const viewer of ['A', 'B', 'C']) {
    assert.equal(projectEntryFor(e, viewer), e);
  }
  // …with reroll provenance present too: the field never forces a copy on
  // the open path (identity, not deepEqual — the byte-identity contract).
  const r = makeEntry({ rerollOfId: 'parent-1' });
  assert.equal(projectEntryFor(r, 'someone'), r);
});

await t('exhaustive mode × viewer × revealed matrix', () => {
  // expected: 'full' (same object), 'redacted', or 'omitted' (null)
  const cases = [
    [null, false, { A: 'full', B: 'full', C: 'full' }],
    [null, true, { A: 'full', B: 'full', C: 'full' }],
    [heldVis, false, { A: 'redacted', B: 'redacted', C: 'redacted' }], // roller redacted too
    [heldVis, true, { A: 'full', B: 'full', C: 'full' }],
    [secretVis, false, { A: 'full', B: 'omitted', C: 'omitted' }],
    // defensive: even a (never-produced) revealed secret stays omitted
    [secretVis, true, { A: 'full', B: 'omitted', C: 'omitted' }],
    [whisperVis, false, { A: 'full', B: 'redacted', C: 'full' }],
    [whisperVis, true, { A: 'full', B: 'full', C: 'full' }],
  ];
  for (const [vis, revealed, expect] of cases) {
    const e = entryWith(vis, vis ? revealed : true);
    for (const [viewer, want] of Object.entries(expect)) {
      const what = `mode=${vis ? vis.mode : 'open'} revealed=${revealed} viewer=${viewer}`;
      const p = projectEntryFor(e, viewer);
      if (want === 'full') assert.equal(p, e, `${what}: expected the full entry (same object)`);
      else if (want === 'omitted') assert.equal(p, null, `${what}: expected omission`);
      else assertRedacted(p, e, vis.mode, what);
    }
  }
});

await t('redaction carries exp, collected, cleared and rerollOfId through', () => {
  const e = entryWith(heldVis, false);
  e.exp = { kind: 'check', subtitle: 'hold fast' };
  e.collected = 4;
  e.cleared = true;
  // A public stake, never a value: by the birth gate (handleRoll ×
  // entryExistsForAll) this only ever names a whole-room-visible parent,
  // so the redacted copy keeps it — "she rerolled that check, face down".
  e.rerollOfId = 'parent-1';
  const p = projectEntryFor(e, 'B');
  assert.deepEqual(p.exp, e.exp);
  assert.equal(p.collected, 4);
  assert.equal(p.cleared, true);
  assert.equal(p.rerollOfId, 'parent-1');
  assertNoValueKeys(p, 'redacted entry with exp/shelf/provenance flags');
});

await t('redaction omits absent flags rather than blanking them', () => {
  const p = projectEntryFor(entryWith(heldVis, false), 'B');
  assert.ok(!('exp' in p), 'no exp key');
  assert.ok(!('collected' in p), 'no collected key');
  assert.ok(!('cleared' in p), 'no cleared key');
  assert.ok(!('rerollOfId' in p), 'no rerollOfId key');
  assert.ok(!('visibility' in p), 'the raw visibility object is not repeated');
  assert.ok(!keysDeep(p).has('audience'), 'no audience leak');
});

await t('whisper redaction does not leak the audience list', () => {
  const p = projectEntryFor(entryWith(whisperVis, false), 'B');
  assert.equal(p.visMode, 'whisper');
  assert.ok(!keysDeep(p).has('audience'), 'audience must not appear in a shrouded view');
  assert.ok(!JSON.stringify(p).includes('"C"'), 'audience member ids must not appear');
});

await t('entryExistsFor: only secret hides existence, only from non-rollers', () => {
  assert.equal(entryExistsFor(makeEntry(), 'B'), true);
  assert.equal(entryExistsFor(entryWith(heldVis, false), 'B'), true);
  assert.equal(entryExistsFor(entryWith(whisperVis, false), 'B'), true);
  assert.equal(entryExistsFor(entryWith(secretVis, false), 'A'), true);
  assert.equal(entryExistsFor(entryWith(secretVis, false), 'B'), false);
});

await t('entryExistsForAll: the whole-room gate — secret is nonexistent, roller included', () => {
  assert.equal(entryExistsForAll(makeEntry()), true, 'open exists for all');
  assert.equal(entryExistsForAll(entryWith(heldVis, false)), true, 'held exists for all (shrouded, not absent)');
  assert.equal(entryExistsForAll(entryWith(whisperVis, false)), true, 'whisper exists for all');
  assert.equal(entryExistsForAll(entryWith(secretVis, false)), false,
    'secret exists for NO whole-room purpose — there is no viewer argument to exempt the roller');
  // Fail-closed on mode, not revealed: a (never-produced) "revealed" secret
  // still refuses — the gate must not soften if reveal semantics ever move.
  assert.equal(entryExistsForAll(entryWith(secretVis, true)), false);
});

// ---------------------------------------------------------------------------
// Unit: resolveVisibility
// ---------------------------------------------------------------------------

function fakeRoom() {
  return {
    players: new Map([
      ['a1', { id: 'a1', name: 'Ann' }],
      ['b1', { id: 'b1', name: 'Bob' }],
      ['b2', { id: 'b2', name: 'bob' }], // duplicate name, different case
      ['c1', { id: 'c1', name: 'Cass Q' }],
    ]),
  };
}
const chooser = { id: 'a1', name: 'Ann' };

await t('resolveVisibility: open passes through as null', () => {
  assert.deepEqual(resolveVisibility(fakeRoom(), chooser, null), { visibility: null });
  assert.deepEqual(resolveVisibility(fakeRoom(), chooser, undefined), { visibility: null });
});

await t('resolveVisibility: held and secret bind the chooser as reveal authority', () => {
  for (const mode of ['held', 'secret']) {
    const r = resolveVisibility(fakeRoom(), chooser, { mode, names: [] });
    assert.deepEqual(r, { visibility: { mode, revealAuthority: 'a1' } });
    assert.ok(!('audience' in r.visibility), `${mode} carries no audience`);
  }
});

await t('resolveVisibility: whisper resolves names case-insensitively and adds the chooser', () => {
  const r = resolveVisibility(fakeRoom(), chooser, { mode: 'whisper', names: ['cass q'] });
  assert.deepEqual(r.visibility, { mode: 'whisper', audience: ['c1', 'a1'], revealAuthority: 'a1' });
});

await t('resolveVisibility: duplicate player names ALL join the audience', () => {
  const r = resolveVisibility(fakeRoom(), chooser, { mode: 'whisper', names: ['BOB'] });
  assert.deepEqual(r.visibility.audience, ['b1', 'b2', 'a1']);
});

await t('resolveVisibility: a chooser named explicitly is not duplicated', () => {
  const r = resolveVisibility(fakeRoom(), chooser, { mode: 'whisper', names: ['Ann', 'Bob'] });
  assert.deepEqual(r.visibility.audience, ['a1', 'b1', 'b2']);
});

await t('resolveVisibility: an unknown name rejects with unknown_audience, naming it', () => {
  const r = resolveVisibility(fakeRoom(), chooser, { mode: 'whisper', names: ['Cass Q', 'Zed'] });
  assert.ok(r.error, 'expected an error');
  assert.equal(r.error[0], 400);
  assert.equal(r.error[2], 'unknown_audience');
  assert.ok(r.error[1].includes('Zed'), `message names the bad name: ${r.error[1]}`);
});

await t('resolveVisibility: a bogus mode is refused', () => {
  const r = resolveVisibility(fakeRoom(), chooser, { mode: 'blind', names: [] });
  assert.ok(r.error && r.error[2] === 'bad_visibility');
});

// In notation '#' starts the comment, and the comment split runs before the
// whisper-flag scan — so a roster name carrying '#' could never survive its
// own canonical spelling: `w:a#b` re-parses as a whisper to "a" with comment
// "b", a silent misdelivery. The fix is a BAN at every name entry point
// (join/rename both route through cleanName), stripped exactly the way the
// control/bidi sanitizer strips its characters.
await t('cleanName strips # from player names (the whisper-misdirection ban)', () => {
  assert.equal(cleanName('a#b', 24), 'ab');
  assert.equal(cleanName('#Ann#', 24), 'Ann');
  assert.equal(cleanName('  a\u200b#b  ', 24), 'ab', 'strips beside the control/bidi set');
  assert.equal(cleanName('###', 24), null, 'a name that is only # refuses as empty');
  assert.equal(cleanName('Ann Smith', 24), 'Ann Smith', 'ordinary names pass untouched');
  assert.equal(cleanName(42, 24), null);
});

// ---------------------------------------------------------------------------
// Endpoint level: a real server on an ephemeral port, raw SSE bytes
// ---------------------------------------------------------------------------

const HAS_SECRET = parseNotation('1d20 secret').ok;
const HAS_WHISPER = parseNotation('1d20 w:Bob').ok;

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

async function startServer(port) {
  const proc = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', (d) => (out += d));
  proc.stderr.on('data', (d) => (out += d));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return proc;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  proc.kill();
  throw new Error(`server never came up on :${port}\n${out.slice(-2000)}`);
}

// One player's SSE stream: parsed events AND the raw bytes as received, so a
// leak assertion can run on exactly what went over the wire.
class Sse {
  constructor() {
    this.raw = '';
    this.buf = '';
    this.events = [];
    this.ctrl = new AbortController();
  }
  async open(base, room, playerId) {
    const res = await fetch(
      `${base}/api/events?room=${encodeURIComponent(room)}&playerId=${encodeURIComponent(playerId)}`,
      { signal: this.ctrl.signal, headers: { accept: 'text/event-stream' } },
    );
    assert.equal(res.status, 200, 'events stream must open');
    this.pump = (async () => {
      const dec = new TextDecoder();
      try {
        for await (const chunk of res.body) {
          const text = dec.decode(chunk, { stream: true });
          this.raw += text;
          this.buf += text;
          let i;
          while ((i = this.buf.indexOf('\n\n')) >= 0) {
            const block = this.buf.slice(0, i);
            this.buf = this.buf.slice(i + 2);
            let type = 'message';
            const dataLines = [];
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) type = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
            }
            if (dataLines.length) this.events.push({ type, data: JSON.parse(dataLines.join('\n')) });
          }
        }
      } catch { /* aborted at teardown */ }
    })();
    return this;
  }
  close() { this.ctrl.abort(); }
  async waitFor(pred, what, ms = 5000) {
    const t0 = Date.now();
    for (;;) {
      const hit = this.events.find((e) => pred(e));
      if (hit) return hit;
      if (Date.now() - t0 > ms) {
        throw new Error(`timed out waiting for ${what}; got: ${this.events.map((e) => e.type).join(',')}`);
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

const port = await freePort();
const proc = await startServer(port);
const base = `http://127.0.0.1:${port}`;
const streams = [];

async function post(path, body) {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

// Join + open the event stream + wait for hello. Returns {id, join, sse}.
async function sit(room, name) {
  const join = await post('/api/join', { room, name });
  assert.equal(join.status, 200, `${name} joins`);
  const sse = await new Sse().open(base, room, join.body.playerId);
  streams.push(sse);
  await sse.waitFor((e) => e.type === 'hello', `${name}'s hello`);
  return { id: join.body.playerId, join: join.body, sse };
}

const rollEvents = (p) => p.sse.events.filter((e) => e.type === 'roll');

try {
  await t('held roll: redacted for everyone (roller included) on every path, revealed by its authority', async () => {
    const room = 'red-held';
    const ann = await sit(room, 'Ann');
    const bob = await sit(room, 'Bob');

    const res = await post('/api/roll', { room, playerId: ann.id, notation: '1d20 held dc10' });
    assert.equal(res.status, 200);
    const roll = res.body.roll;
    // The roller's own POST response is redacted: held is face down for Ann too.
    assertNoValueKeys(roll, "roller's POST response");
    assert.equal(roll.redacted, true);
    assert.equal(roll.visMode, 'held');
    assert.equal(roll.revealAuthority, ann.id);
    assert.equal(roll.faceDown, true);
    assert.equal(roll.revealed, false);
    assert.equal(roll.dc, 10);
    assert.deepEqual(roll.dice, ['d20']);
    assert.equal(typeof roll.seed, 'number', 'seed stays (poses only)');

    const annEvt = await ann.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Ann's roll event");
    const bobEvt = await bob.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Bob's roll event");
    assertNoValueKeys(annEvt.data, "Ann's broadcast copy");
    assertNoValueKeys(bobEvt.data, "Bob's broadcast copy");

    // The raw bytes, not just the parsed shape: nothing value-bearing has
    // crossed either wire in this room so far.
    for (const [who, p] of [['Ann', ann], ['Bob', bob]]) {
      for (const bad of ['"values"', '"perDie"', '"total"', '"modifier"', '"spec"']) {
        assert.ok(!p.sse.raw.includes(bad), `${who}'s raw SSE bytes must not contain ${bad}`);
      }
    }

    // Reveal authority is enforced server-side.
    const bobReveal = await post('/api/reveal', { room, playerId: bob.id, rollId: roll.rollId });
    assert.equal(bobReveal.status, 403);
    assert.equal(bobReveal.body.code, 'not_reveal_authority');

    const annReveal = await post('/api/reveal', { room, playerId: ann.id, rollId: roll.rollId });
    assert.equal(annReveal.status, 200);
    const rv = await bob.sse.waitFor((e) => e.type === 'reveal' && e.data.rollId === roll.rollId, "Bob's reveal");
    assert.ok(Array.isArray(rv.data.roll.values) && rv.data.roll.values.length === 1, 'reveal carries the full entry');
    assert.equal(typeof rv.data.roll.total, 'number');
    assert.equal(rv.data.roll.revealed, true);
    assert.ok(!('redacted' in rv.data.roll), 'a revealed entry is not marked redacted');
    await ann.sse.waitFor((e) => e.type === 'reveal' && e.data.rollId === roll.rollId, "Ann's reveal");

    // Idempotent second reveal.
    const again = await post('/api/reveal', { room, playerId: ann.id, rollId: roll.rollId });
    assert.equal(again.status, 200);
  });

  await t('late join and hello resync redact a held roll; a revealed one arrives full', async () => {
    const room = 'red-resync';
    const ann = await sit(room, 'Ann');
    const res = await post('/api/roll', { room, playerId: ann.id, notation: '1d20 held' });
    const rollId = res.body.roll.rollId;

    // Join snapshot (the /api/join response) is projected...
    const bob = await sit(room, 'Bob');
    assert.equal(bob.join.log.length, 1);
    assertNoValueKeys(bob.join.log[0], "late joiner's snapshot entry");
    assert.equal(bob.join.log[0].visMode, 'held');
    // ...and so is the hello a stream (re)open sends — the reconnect path.
    const hello = bob.sse.events.find((e) => e.type === 'hello');
    assert.equal(hello.data.log.length, 1);
    assertNoValueKeys(hello.data.log[0], "late joiner's hello entry");

    await post('/api/reveal', { room, playerId: ann.id, rollId });
    const cass = await sit(room, 'Cass');
    assert.equal(cass.join.log.length, 1);
    assert.ok(Array.isArray(cass.join.log[0].values), 'a revealed entry resyncs in full');
  });

  await t('open rolls stay byte-identical across recipients, with no visibility key', async () => {
    const room = 'red-open';
    const ann = await sit(room, 'Ann');
    const bob = await sit(room, 'Bob');
    const res = await post('/api/roll', { room, playerId: ann.id, notation: '2d6+3' });
    const roll = res.body.roll;
    assert.ok(Array.isArray(roll.values) && typeof roll.total === 'number');
    for (const key of ['visibility', 'redacted', 'visMode', 'revealAuthority']) {
      assert.ok(!(key in roll), `an open roll must not grow a "${key}" key`);
    }
    await ann.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Ann's open roll");
    await bob.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Bob's open roll");
    // Byte-for-byte: pull the exact data line each wire carried.
    const line = (raw) => raw.split('\n').find((l) => l.startsWith('data: ') && l.includes(roll.rollId) && l.includes('"values"'));
    assert.ok(line(ann.sse.raw), "found Ann's data line");
    assert.equal(line(ann.sse.raw), line(bob.sse.raw), 'identical bytes to every recipient');
  });

  await t('faceDown on the explicit shape still means held — and is now truly redacted', async () => {
    const room = 'red-facedown';
    const ann = await sit(room, 'Ann');
    const res = await post('/api/roll', { room, playerId: ann.id, dice: ['d20'], faceDown: true });
    assert.equal(res.status, 200);
    assertNoValueKeys(res.body.roll, 'explicit faceDown roll');
    assert.equal(res.body.roll.visMode, 'held');
    assert.equal(res.body.roll.revealAuthority, ann.id);
  });

  await t('client-sent visibility fields are refused on both request shapes', async () => {
    const room = 'red-notrust';
    const ann = await sit(room, 'Ann');
    const explicit = await post('/api/roll', { room, playerId: ann.id, dice: ['d20'], visibility: { mode: 'secret' } });
    assert.equal(explicit.status, 400);
    assert.equal(explicit.body.code, 'bad_visibility');
    const beside = await post('/api/roll', { room, playerId: ann.id, notation: '1d20 held', visibility: { mode: 'held' } });
    assert.equal(beside.status, 400);
    assert.equal(beside.body.code, 'notation_conflict');
    // faceDown beside a notation must still agree.
    const agree = await post('/api/roll', { room, playerId: ann.id, notation: '1d20 held', faceDown: true });
    assert.equal(agree.status, 200);
    const disagree = await post('/api/roll', { room, playerId: ann.id, notation: '1d20', faceDown: true });
    assert.equal(disagree.status, 400);
    assert.equal(disagree.body.code, 'notation_conflict');
  });

  await t('held offer → claim: claimer rolls blind, offerer holds the reveal', async () => {
    const room = 'red-offer-held';
    const ann = await sit(room, 'Ann');
    const bob = await sit(room, 'Bob');

    const off = await post('/api/offer', { room, playerId: ann.id, notation: '1d20 held' });
    assert.equal(off.status, 200);
    assert.deepEqual(off.body.offer.visibility, { mode: 'held', revealAuthority: ann.id });
    assert.equal(off.body.offer.faceDown, true);
    await bob.sse.waitFor((e) => e.type === 'offer' && e.data.offer.offerId === off.body.offer.offerId, "Bob's offer event");

    const claim = await post('/api/claim', { room, playerId: bob.id, offerId: off.body.offer.offerId });
    assert.equal(claim.status, 200);
    const roll = claim.body.roll;
    assertNoValueKeys(roll, "claimer's POST response");
    assert.equal(roll.playerId, bob.id, 'the claimer is the roller');
    assert.equal(roll.visMode, 'held');
    assert.equal(roll.revealAuthority, ann.id, 'the OFFERER holds the reveal');

    const bobEvt = await bob.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Bob's roll event");
    const annEvt = await ann.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Ann's roll event");
    assertNoValueKeys(bobEvt.data, "claimer's broadcast copy");
    assertNoValueKeys(annEvt.data, "offerer's broadcast copy");

    const bobReveal = await post('/api/reveal', { room, playerId: bob.id, rollId: roll.rollId });
    assert.equal(bobReveal.status, 403, 'the roller of a held offered roll may NOT reveal');
    assert.equal(bobReveal.body.code, 'not_reveal_authority');

    const annReveal = await post('/api/reveal', { room, playerId: ann.id, rollId: roll.rollId });
    assert.equal(annReveal.status, 200);
    const rv = await bob.sse.waitFor((e) => e.type === 'reveal' && e.data.rollId === roll.rollId, "Bob's reveal");
    assert.ok(Array.isArray(rv.data.roll.values));
    assert.equal(rv.data.roll.playerId, bob.id);
  });

  if (!HAS_SECRET) {
    skip('secret roll endpoint coverage', 'js/notation.js secret flag not landed yet');
  } else {
    await t('secret roll: exists only for its roller — no event, no snapshot, no trace of the rollId', async () => {
      const room = 'red-secret';
      const ann = await sit(room, 'Ann');
      const bob = await sit(room, 'Bob');

      const res = await post('/api/roll', { room, playerId: ann.id, notation: '1d20 secret' });
      assert.equal(res.status, 200);
      const secret = res.body.roll;
      assert.ok(Array.isArray(secret.values), 'the roller gets the full roll');
      assert.equal(secret.visibility.mode, 'secret');
      assert.equal(secret.visibility.revealAuthority, ann.id);
      await ann.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === secret.rollId, "Ann's own roll event");

      // A later open roll auto-collects the secret one; its roll-collected
      // must reach Ann alone. Waiting for the open roll on Bob's stream
      // orders us AFTER anything the server would have sent him.
      const open = await post('/api/roll', { room, playerId: ann.id, notation: '1d20' });
      await bob.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === open.body.roll.rollId, "Bob's open roll");
      await ann.sse.waitFor((e) => e.type === 'roll-collected' && e.data.rollId === secret.rollId, "Ann's roll-collected");
      assert.ok(!bob.sse.raw.includes(secret.rollId), "the secret rollId never crosses Bob's wire");

      // Existence is hidden on the id-bearing endpoints too.
      for (const path of ['/api/reveal', '/api/collect-roll', '/api/clear-roll']) {
        const r = await post(path, { room, playerId: bob.id, rollId: secret.rollId });
        assert.equal(r.status, 404, `${path} hides a secret roll's existence`);
        assert.equal(r.body.code, 'unknown_roll');
      }
      // And there is no reveal path, even for the roller.
      const annReveal = await post('/api/reveal', { room, playerId: ann.id, rollId: secret.rollId });
      assert.equal(annReveal.status, 400);
      assert.equal(annReveal.body.code, 'not_revealable');

      // Late join: the snapshot has the open roll, not the secret one.
      const cass = await sit(room, 'Cass');
      assert.ok(!JSON.stringify(cass.join.log).includes(secret.rollId), 'no secret entry in a late join');
      assert.ok(cass.join.log.some((r) => r.rollId === open.body.roll.rollId), 'the open roll is there');

      // The roller's own resync keeps it, in full.
      const resync = await new Sse().open(base, room, ann.id);
      streams.push(resync);
      const hello = await resync.waitFor((e) => e.type === 'hello', "Ann's resync hello");
      const mine = hello.data.log.find((r) => r.rollId === secret.rollId);
      assert.ok(mine && Array.isArray(mine.values), 'the roller resyncs their secret roll in full');
    });

    await t('secret offer: the claimer rolls fully blind, the offerer alone sees the result', async () => {
      const room = 'red-offer-secret';
      const ann = await sit(room, 'Ann');
      const bob = await sit(room, 'Bob');
      const cass = await sit(room, 'Cass');

      const off = await post('/api/offer', { room, playerId: ann.id, notation: '1d20 secret' });
      assert.equal(off.status, 200);
      assert.equal(off.body.offer.visibility.mode, 'secret', "the card presents the offerer's choice");

      const claim = await post('/api/claim', { room, playerId: bob.id, offerId: off.body.offer.offerId });
      assert.equal(claim.status, 200);
      const roll = claim.body.roll;
      assertNoValueKeys(roll, "blind claimer's POST response");
      assert.equal(roll.visMode, 'whisper', 'offerer-only is a whisper to the offerer in room terms');
      assert.equal(roll.revealAuthority, ann.id);

      const annEvt = await ann.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Ann's roll event");
      assert.ok(Array.isArray(annEvt.data.values), 'the offerer sees the result live');
      assert.deepEqual(annEvt.data.visibility, { mode: 'whisper', audience: [ann.id], revealAuthority: ann.id });
      const bobEvt = await bob.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Bob's roll event");
      const cassEvt = await cass.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Cass's roll event");
      assertNoValueKeys(bobEvt.data, "the blind claimer's broadcast copy");
      assertNoValueKeys(cassEvt.data, "a bystander's broadcast copy");

      const bobReveal = await post('/api/reveal', { room, playerId: bob.id, rollId: roll.rollId });
      assert.equal(bobReveal.status, 403);
      assert.equal(bobReveal.body.code, 'not_reveal_authority');
      const annReveal = await post('/api/reveal', { room, playerId: ann.id, rollId: roll.rollId });
      assert.equal(annReveal.status, 200, 'an offered secret IS revealable — by the offerer');
      const rv = await bob.sse.waitFor((e) => e.type === 'reveal' && e.data.rollId === roll.rollId, "Bob's reveal");
      assert.ok(Array.isArray(rv.data.roll.values));
    });
  }

  if (!HAS_WHISPER) {
    skip('whisper roll endpoint coverage', 'js/notation.js w: flag not landed yet');
  } else {
    await t('whisper roll: audience sees all, others see a shroud; unknown names reject', async () => {
      const room = 'red-whisper';
      const ann = await sit(room, 'Ann');
      const bob = await sit(room, 'Bob');
      const cass = await sit(room, 'Cass');

      const res = await post('/api/roll', { room, playerId: ann.id, notation: '1d20 w:Bob dc15' });
      assert.equal(res.status, 200);
      const roll = res.body.roll;
      assert.ok(Array.isArray(roll.values), 'the chooser is implicitly in the audience');
      assert.equal(roll.visibility.mode, 'whisper');
      assert.deepEqual([...roll.visibility.audience].sort(), [ann.id, bob.id].sort());
      assert.equal(roll.visibility.revealAuthority, ann.id);

      const bobEvt = await bob.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Bob's roll event");
      assert.ok(Array.isArray(bobEvt.data.values), 'the named audience sees the result live');
      const cassEvt = await cass.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === roll.rollId, "Cass's roll event");
      assertNoValueKeys(cassEvt.data, "a non-audience broadcast copy");
      assert.equal(cassEvt.data.visMode, 'whisper');
      assert.equal(cassEvt.data.dc, 15, 'the stakes stay public');
      for (const bad of ['"values"', '"perDie"', '"total"', '"modifier"', '"spec"']) {
        assert.ok(!cass.sse.raw.includes(bad), `Cass's raw SSE bytes must not contain ${bad}`);
      }

      const cassReveal = await post('/api/reveal', { room, playerId: cass.id, rollId: roll.rollId });
      assert.equal(cassReveal.status, 403);
      const bobReveal = await post('/api/reveal', { room, playerId: bob.id, rollId: roll.rollId });
      assert.equal(bobReveal.status, 403, 'audience membership is not reveal authority');
      const annReveal = await post('/api/reveal', { room, playerId: ann.id, rollId: roll.rollId });
      assert.equal(annReveal.status, 200);
      const rv = await cass.sse.waitFor((e) => e.type === 'reveal' && e.data.rollId === roll.rollId, "Cass's reveal");
      assert.ok(Array.isArray(rv.data.roll.values), 'the shroud lifts for everyone');

      const badName = await post('/api/roll', { room, playerId: ann.id, notation: '1d20 w:Zed' });
      assert.equal(badName.status, 400);
      assert.equal(badName.body.code, 'unknown_audience');
      assert.ok(badName.body.error.includes('Zed'));
    });

    // SUPERSEDED CONTRACT (2026-08-03, Joe): this test used to pin that a
    // bystander COULD claim a whispered offer and roll it blind. A whisper
    // is already ADDRESSED — the offer now derives its claim gate from the
    // audience, so the bystander's claim refuses and the card stands. The
    // blind-claimer property lives on in the dice-tower (secret) offer,
    // pinned by its own test and the gm-screen-offer e2e.
    await t('whisper offer: the audience IS the claim gate (auto-target)', async () => {
      const room = 'red-offer-whisper';
      const ann = await sit(room, 'Ann');
      const bob = await sit(room, 'Bob');
      const cass = await sit(room, 'Cass');

      const off = await post('/api/offer', { room, playerId: ann.id, notation: '1d20 w:Cass' });
      assert.equal(off.status, 200);
      assert.deepEqual([...off.body.offer.visibility.audience].sort(), [ann.id, cass.id].sort());
      assert.deepEqual(off.body.offer.to, { name: 'Cass', playerIds: [cass.id] },
        'the claim gate derives from the audience, offerer excluded');

      // A bystander cannot take a roll whispered to someone else.
      const stolen = await post('/api/claim', { room, playerId: bob.id, offerId: off.body.offer.offerId });
      assert.equal(stolen.status, 403);
      assert.equal(stolen.body.code, 'not_offer_target');

      // The named player claims; the whisper's read holds around them.
      // (visMode rides only the REDACTED projection — Cass's full copy is
      // asserted by its values, Bob's shrouded copy by its visMode below.)
      const claim = await post('/api/claim', { room, playerId: cass.id, offerId: off.body.offer.offerId });
      assert.equal(claim.status, 200);
      assert.ok(Array.isArray(claim.body.roll.values), 'the claimer is IN the audience and reads their own roll');
      const rollId = claim.body.roll.rollId;

      const annEvt = await ann.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === rollId, "Ann's roll event");
      const cassEvt = await cass.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === rollId, "Cass's roll event");
      const bobEvt = await bob.sse.waitFor((e) => e.type === 'roll' && e.data.rollId === rollId, "Bob's roll event");
      assert.ok(Array.isArray(annEvt.data.values), 'the offerer (chooser) sees it');
      assert.ok(Array.isArray(cassEvt.data.values), 'the named audience sees it');
      assertNoValueKeys(bobEvt.data, 'the bystander sees a shrouded roll');
      assert.equal(bobEvt.data.visMode, 'whisper', "and the shroud names its mode");
    });

    await t('a "#" name cannot exist, so a whisper can never be misdirected through one', async () => {
      const room = 'red-hash-names';
      const ann = await sit(room, 'Ann');

      // Join-time sanitization: '#' is stripped exactly like the control/bidi
      // set (server.js cleanName). The would-be "a#b" seats as "ab".
      const hash = await sit(room, 'a#b');
      const roster = hash.join.players;
      assert.ok(roster.some((p) => p.id === hash.id && p.name === 'ab'), 'join strips # from the name');
      assert.ok(!JSON.stringify(roster.map((p) => p.name)).includes('#'), 'no roster name carries #');

      // Rename goes through the same gate…
      const renamed = await post('/api/rename', { room, playerId: hash.id, name: 'x#y' });
      assert.equal(renamed.status, 200);
      const evt = await ann.sse.waitFor((e) => e.type === 'player-renamed' && e.data.playerId === hash.id, 'the rename echo');
      assert.equal(evt.data.name, 'xy', 'rename strips # too');
      // …and a name that is nothing but '#' refuses rather than seating empty.
      const empty = await post('/api/rename', { room, playerId: hash.id, name: '###' });
      assert.equal(empty.status, 400);
      assert.equal(empty.body.code, 'bad_name');

      // The misdirection this ban kills: nobody can BE "a#b", so in
      // 'w:a#b' the '#' is just the comment split (a whisper to "a" with
      // comment "b") — and with no player named "a" it fails CLOSED as
      // unknown_audience instead of delivering the values to the wrong
      // player under a silently rewritten label.
      const mis = await post('/api/roll', { room, playerId: ann.id, notation: '1d20 w:a#b' });
      assert.equal(mis.status, 400, 'the typo refuses the whole action');
      assert.equal(mis.body.code, 'unknown_audience');
      assert.ok(mis.body.error.includes('"a"'), `the unmatched fragment is named (got: ${mis.body.error})`);

      // The sanitized name addresses cleanly, to exactly that player.
      const okRoll = await post('/api/roll', { room, playerId: ann.id, notation: '1d20 w:xy' });
      assert.equal(okRoll.status, 200);
      assert.deepEqual([...okRoll.body.roll.visibility.audience].sort(), [ann.id, hash.id].sort());
    });
  }
  await t('attribution survives the offer/claim leg (2b-\u2464)', async () => {
    const room = 'r-sources';
    const ann = await sit(room, 'Ann');
    const bob = await sit(room, 'Bob');
    const direct = await post('/api/roll', { room, playerId: ann.id, notation: '2d8[Wisdom]+1d6[Swords]' });
    assert.equal(direct.status, 200);
    assert.deepEqual(direct.body.roll.spec.sources, ['Wisdom', 'Wisdom', 'Swords'],
      'a direct roll carries its sources');
    const offer = await post('/api/offer', { room, playerId: ann.id, notation: '2d8[Wisdom]+1d6[Swords]' });
    assert.equal(offer.status, 200);
    const claim = await post('/api/claim', { room, playerId: bob.id, offerId: offer.body.offer.offerId });
    assert.equal(claim.status, 200);
    assert.deepEqual(claim.body.roll.spec.sources, ['Wisdom', 'Wisdom', 'Swords'],
      'the claimed roll keeps the same attribution the direct roll had');
  });

  await t('an unchanged pools publish answers ok without re-broadcasting', async () => {
    const room = 'r-poolnoop';
    const ann = await sit(room, 'Ann');
    const bob = await sit(room, 'Bob');
    const pools = [{ name: 'Attack', notation: '1d20' }];
    assert.equal((await post('/api/pools', { room, playerId: ann.id, pools })).status, 200);
    await bob.sse.waitFor((e) => e.type === 'pools-changed' && e.data.playerId === ann.id,
      'first publish broadcasts');
    const before = bob.sse.events.filter((e) => e.type === 'pools-changed').length;
    assert.equal((await post('/api/pools', { room, playerId: ann.id, pools })).status, 200);
    // a real change still lands (and proves the no-op above sent nothing first)
    assert.equal((await post('/api/pools', { room, playerId: ann.id,
      pools: [{ name: 'Attack', notation: '2d20' }] })).status, 200);
    await bob.sse.waitFor((e) => e.type === 'pools-changed'
      && e.data.pools.some((g) => g.notation === '2d20'), 'the real change broadcasts');
    const after = bob.sse.events.filter((e) => e.type === 'pools-changed').length;
    assert.equal(after, before + 1, 'the identical re-post broadcast nothing');
  });

  await t('§9: the owner default set rides the pools publish, roster, and no-op guard', async () => {
    const room = 'r-poolset';
    const ann = await sit(room, 'Ann');
    const bob = await sit(room, 'Bob');
    const pools = [{ name: 'Plain', notation: '3d6' }];
    assert.equal((await post('/api/pools',
      { room, playerId: ann.id, pools, set: 'emberforge.blackanvil' })).status, 200);
    await bob.sse.waitFor((e) => e.type === 'pools-changed' && e.data.playerId === ann.id
      && e.data.set === 'emberforge.blackanvil', 'the default set rides the broadcast');
    const late = await sit(room, 'Late');
    const annSeat = late.sse.events.find((e) => e.type === 'hello').data.players
      .find((p) => p.id === ann.id);
    assert.equal(annSeat.set, 'emberforge.blackanvil', 'a late joiner sees the owner default');
    // a set-only change (identical pools) is a REAL change: the no-op guard
    // must compare both, or a re-skinned owner never reaches the table
    assert.equal((await post('/api/pools',
      { room, playerId: ann.id, pools, set: 'tidewrack.seaglass' })).status, 200);
    await bob.sse.waitFor((e) => e.type === 'pools-changed' && e.data.playerId === ann.id
      && e.data.set === 'tidewrack.seaglass', 'a set-only change broadcasts');
    // 'std' normalizes to ABSENT (player default: std and unset mean the same
    // thing) and clears the stored default for later joiners
    assert.equal((await post('/api/pools', { room, playerId: ann.id, pools, set: 'std' })).status, 200);
    await bob.sse.waitFor((e) => e.type === 'pools-changed' && e.data.playerId === ann.id
      && !('set' in e.data), 'std rides as absent');
    const late2 = await sit(room, 'Late2');
    assert.ok(!('set' in late2.sse.events.find((e) => e.type === 'hello').data.players
      .find((p) => p.id === ann.id)), 'the cleared default leaves the roster');
    // an unknown id falls closed to absent — and absent-to-absent with the
    // same pools is a no-op, so nothing broadcasts
    const before = bob.sse.events.filter((e) => e.type === 'pools-changed').length;
    assert.equal((await post('/api/pools',
      { room, playerId: ann.id, pools, set: 'not.a.set' })).status, 200);
    assert.equal((await post('/api/pools', { room, playerId: ann.id,
      pools: [{ name: 'Plain', notation: '4d6' }] })).status, 200);
    const real = await bob.sse.waitFor((e) => e.type === 'pools-changed'
      && e.data.pools.some((g) => g.notation === '4d6'), 'the pools change still lands');
    assert.ok(!('set' in real.data), 'the junk id fell closed to absent');
    const after = bob.sse.events.filter((e) => e.type === 'pools-changed').length;
    assert.equal(after, before + 1, 'the junk-set re-post broadcast nothing');
  });

  // -- SSE lifecycle (ROADMAP 0d): endStream must actually tear the socket
  // down, not just enqueue a FIN. Without socket.destroy() after res.end(),
  // 'close' would wait on the peer's ACK — a stalled peer would keep the
  // stream in player.clients forever and the seat would never reap.
  await t('MAX_STREAMS eviction tears the evicted stream down immediately (§0d)', async () => {
    const room = 'sse-eviction';
    const ann = await sit(room, 'Ann');
    // The stream we already opened via sit() is the eviction target: it is
    // the oldest in player.clients. MAX_STREAMS_PER_PLAYER=4, so the 4th
    // ADDITIONAL open (5th overall) trips the eviction loop against it.
    const first = ann.sse;
    const extras = [];
    for (let i = 0; i < 4; i++) {
      const s = await new Sse().open(base, room, ann.id);
      streams.push(s);
      extras.push(s);
      await s.waitFor((e) => e.type === 'hello', `extra hello ${i}`);
    }
    // With the socket.destroy() in endStream, the evicted stream's fetch
    // body iteration terminates promptly — pump resolves rather than hanging
    // waiting for a peer-driven close.
    await Promise.race([
      first.pump,
      new Promise((_, rej) => setTimeout(
        () => rej(new Error('evicted stream did not close within 3s')), 3000,
      )),
    ]);
    // The surviving four streams still deliver: player was NOT reaped.
    const roll = await post('/api/roll', { room, playerId: ann.id, notation: '1d6' });
    assert.equal(roll.status, 200, 'a roll still succeeds — the seat survived eviction');
    for (const [i, s] of extras.entries()) {
      await s.waitFor(
        (e) => e.type === 'roll' && e.data.rollId === roll.body.roll.rollId,
        `extra stream ${i} still receiving broadcasts`,
      );
    }
  });

  await t('server-side stream teardown lets the seat reap after DISCONNECT_GRACE_MS (§0d)', async () => {
    const room = 'sse-reap';
    const ann = await sit(room, 'Ann');
    const bob = await sit(room, 'Bob');
    // Fill Ann's cap, evicting the sit()-opened stream via endStream.
    const kept = [];
    for (let i = 0; i < 4; i++) {
      const s = await new Sse().open(base, room, ann.id);
      streams.push(s);
      kept.push(s);
      await s.waitFor((e) => e.type === 'hello', `filler hello ${i}`);
    }
    // Now client-abort all remaining streams — this is the closest a raw
    // test gets to "the peer went away without a graceful FIN". With the
    // fix, every abort triggers 'close' immediately on the server side, so
    // player.clients drains to zero and scheduleReap(DISCONNECT_GRACE_MS)
    // arms exactly once. After the grace, Bob sees Ann leave.
    for (const s of kept) s.close();
    // DISCONNECT_GRACE_MS is 5s in server.js; grant one HEARTBEAT interval
    // of slop but bound the wait so a broken reap fails loud.
    await bob.sse.waitFor(
      (e) => e.type === 'player-left' && e.data.playerId === ann.id,
      "Bob sees Ann's seat reap", 8000,
    );
  });

  // dropStream + onClose are intentionally redundant (§0d). Opening WELL over
  // the cap makes every excess-open invoke dropStream directly (the eviction
  // loop's path), while the survivors reap via onClose when the client
  // aborts. The two paths interleave; scheduleReap must still land the reap
  // exactly once within DISCONNECT_GRACE_MS + slop, without ever shortening
  // it (which would race a still-live survivor into an early reap).
  await t('open > MAX_STREAMS then drain: seat reaps once, on time, no early reap (§0d)', async () => {
    const room = 'sse-overcap';
    const ann = await sit(room, 'Ann');
    const bob = await sit(room, 'Bob');
    // Open 8 streams on top of sit()'s one — the eviction loop fires 5 times,
    // routing through dropStream. The last 4 survive as player.clients.
    const kept = [];
    for (let i = 0; i < 8; i++) {
      const s = await new Sse().open(base, room, ann.id);
      streams.push(s);
      kept.push(s);
      await s.waitFor((e) => e.type === 'hello', `overcap hello ${i}`);
    }
    // Only the last 4 should be alive; the earlier ones got evicted via
    // dropStream. Broadcast a roll and check every survivor still receives.
    const roll = await post('/api/roll', { room, playerId: ann.id, notation: '1d6' });
    assert.equal(roll.status, 200, 'seat survived the flurry of evictions');
    for (const [i, s] of kept.slice(-4).entries()) {
      await s.waitFor(
        (e) => e.type === 'roll' && e.data.rollId === roll.body.roll.rollId,
        `survivor ${i} still receiving broadcasts`,
      );
    }
    // No early reap: Bob has NOT seen Ann leave despite the eviction storm.
    const early = bob.sse.events.find(
      (e) => e.type === 'player-left' && e.data.playerId === ann.id,
    );
    assert.ok(!early, `no premature reap during over-cap evictions (got: ${early ? JSON.stringify(early) : 'nothing'})`);
    // Drain the survivors; reap arrives on the grace, once.
    for (const s of kept.slice(-4)) s.close();
    await bob.sse.waitFor(
      (e) => e.type === 'player-left' && e.data.playerId === ann.id,
      "Bob sees Ann's seat reap after over-cap drain", 8000,
    );
    const leaves = bob.sse.events.filter(
      (e) => e.type === 'player-left' && e.data.playerId === ann.id,
    );
    assert.equal(leaves.length, 1, 'exactly one reap, not one-per-dropStream');
  });
} finally {
  for (const s of streams) s.close();
  proc.kill();
}

// -- published pools (ROADMAP 2b): the display-copy sanitizer ---------------
await t('sanitizePools: stores the CANONICAL spelling', async () => {
  const out = sanitizePools([{ name: 'Attack', notation: ' 1D20 +2 ' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].notation, parseNotation(' 1D20 +2 ').canonical);
  assert.equal(out[0].name, 'Attack');
  assert.ok(!('category' in out[0]), 'category is present-or-absent');
});
await t('sanitizePools: per-entry fail-closed, list cap refused', async () => {
  const out = sanitizePools([
    { name: 'ok', notation: '2d6' },
    { name: 'bad', notation: 'not dice' },        // dropped
    { notation: 42 },                              // dropped
    'garbage',                                     // dropped
    { name: 'x'.repeat(99), notation: 'd4', category: 'Skills' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[1].name.length, 24, 'name takes the room cut');
  assert.equal(out[1].category, 'Skills');
  assert.equal(sanitizePools(Array.from({ length: 41 }, () => ({ notation: 'd6' }))), null,
    'over the list cap is a refusal, not a trim');
  assert.equal(sanitizePools('nope'), null);
  assert.equal(sanitizePools([{ notation: 'd6'.padEnd(300, ' ') }]).length, 0,
    'an overlong notation is dropped');
});
await t('sanitizePools: the cap holds against the STORED canonical too', async () => {
  // d% with per-term labels canonicalizes to 1d10x[l]+1d10[l] — the string
  // GROWS. A raw under the cap whose canonical overflows it must drop.
  const raw = Array.from({ length: 14 }, (_, i) => `d%[aaa${i}]`).join('+');
  assert.ok(raw.length <= 200, `fixture stays under the raw cap (${raw.length})`);
  assert.ok(parseNotation(raw).ok && parseNotation(raw).canonical.length > 200,
    'fixture canonical overflows');
  assert.equal(sanitizePools([{ name: 'x', notation: raw }]).length, 0,
    'the growing spelling is dropped, not stored');
});

if (failed) {
  console.error(`${failed} of ${n} redaction tests FAILED${skipped ? ` (${skipped} skipped)` : ''}`);
} else {
  console.log(`all ${n} redaction tests pass${skipped ? ` (${skipped} skipped: pending notation visibility grammar)` : ''}`);
}
process.exit(process.exitCode || 0);
