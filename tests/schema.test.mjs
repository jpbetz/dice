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

if (process.exitCode) process.exit(process.exitCode);
console.log(`all ${n} schema tests pass`);
