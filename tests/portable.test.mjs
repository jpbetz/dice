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

// tests/portable.test.mjs — the pools & settings YAML (Tier 4 §5): the
// emitter/parser round-trip is a fixed point, quoting survives the two YAML
// traps ('#' in notation, ': ' in names), and everything outside the strict
// subset fails CLOSED with a line number — never a guess.

import assert from 'node:assert/strict';
import { exportYaml, parsePortable, planImport } from '../js/portable.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

const flat = (parsed) => parsed.shelves.flatMap((s) =>
  s.pools.map((p) => ({ ...p, category: s.plain ? null : s.label })));

// ---- round-trip ------------------------------------------------------------

t('export → parse is a fixed point (shelves, names, canonicals)', () => {
  const groups = [
    { id: 1, name: 'Body', notation: '3d6', category: 'Attributes' },
    { id: 2, name: 'Archery', notation: '1d6', category: 'Skills' },
    { id: 3, name: 'Damage', notation: '3d4' },
    { id: 4, name: '', notation: '1d20+5' },
  ];
  const text = exportYaml({ groups, settings: { sound: false, numbers: true } });
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(flat(parsed), [
    { name: 'Body', notation: '3d6', category: 'Attributes' },
    { name: 'Archery', notation: '1d6', category: 'Skills' },
    { name: 'Damage', notation: '3d4', category: null },
    { name: '', notation: '1d20+5', category: null },
  ]);
  assert.deepEqual(parsed.settings, { sound: false, numbers: true });
  // and the round-trip of the round-trip is byte-identical (fixed point)
  const again = exportYaml({
    groups: flat(parsed).map((p, i) => ({ id: i, name: p.name, notation: p.notation,
      ...(p.category ? { category: p.category } : {}) })),
    settings: parsed.settings,
  });
  assert.equal(again, text);
});

t("the YAML traps: '#' in notation, ': ' and quotes in names", () => {
  const groups = [
    { id: 1, name: "It's: Tricky", notation: '2d6 # Hunt the # sign', category: "O'Malley's" },
    { id: 2, name: 'Plain', notation: '1d4' },
  ];
  const text = exportYaml({ groups });
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  const got = flat(parsed);
  assert.equal(got[0].name, "It's: Tricky");
  assert.equal(got[0].notation, '2d6 # Hunt the # sign');
  assert.equal(got[0].category, "O'Malley's");
});

t('an empty rack still exports and parses (settings alone)', () => {
  const parsed = parsePortable(exportYaml({ groups: [] }));
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(flat(parsed).length, 0);
  assert.deepEqual(parsed.settings, { sound: true, numbers: false });
});

// ---- hand-written leniency (bare scalars) ---------------------------------

t('bare scalars parse: "- Damage: 3d4" under a bare shelf', () => {
  const parsed = parsePortable('pools:\n  Skills:\n    - Damage: 3d4\n');
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(flat(parsed), [{ name: 'Damage', notation: '3d4', category: 'Skills' }]);
});

t('notation normalizes to the canonical on import (d20+ 5 → 1d20+5)', () => {
  const parsed = parsePortable("pools:\n  Pools:\n    - Atk: 'd20 + 5'\n");
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(flat(parsed)[0].notation, '1d20+5');
});

t('full-line comments and blank lines are free', () => {
  const parsed = parsePortable('# hi\n\npools:\n  Pools:\n    - A: 1d6\n\n# bye\n');
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(flat(parsed).length, 1);
});

// ---- fail closed -----------------------------------------------------------

const refuses = (text, wantIn, name) => t(name, () => {
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, false, 'expected a refusal');
  assert.ok(parsed.error.includes(wantIn), `error ${JSON.stringify(parsed.error)} names ${JSON.stringify(wantIn)}`);
});

refuses('stuff:\n', 'unknown top-level', 'unknown top-level keys refuse');
refuses('pools:\n\t- A: 1d6\n', 'tabs', 'tabs refuse');
refuses('pools:\n    - A: 1d6\n', 'outside any shelf', 'a pool without a shelf refuses');
refuses('pools:\n  P:\n    - A: not dice\n', 'notation', 'bad notation refuses and names it');
refuses('pools:\n  P:\n    - A 1d6\n', "'Name': 'notation'", 'a missing key split refuses');
refuses("pools:\n  P:\n    - 'A: 1d6\n", 'expected', 'an unterminated quote refuses');
refuses('pools:\n  P:\n  P:\n', 'twice', 'duplicate shelves refuse');
refuses(`pools:\n  P:\n    - ${'x'.repeat(30)}: 1d6\n`, 'over 24', 'an over-long name refuses');
refuses('', 'nothing', 'an empty paste refuses');
refuses('settings:\n  volume: true\n', 'settings lines', 'unknown settings keys refuse');
refuses('pools:\n  P:\n   - A: 1d6\n', 'indentation', 'three-space indent refuses');

t('the 40-pool cap refuses at parse', () => {
  const lines = ['pools:', '  P:'];
  for (let i = 0; i < 41; i++) lines.push(`    - N${i}: 1d6`);
  const parsed = parsePortable(lines.join('\n'));
  assert.equal(parsed.ok, false);
  assert.ok(parsed.error.includes('40'));
});

// ---- merge plan ------------------------------------------------------------

t('planImport: adds, updates, unchanged — and deletes nothing', () => {
  const current = [
    { id: 1, name: 'Body', notation: '3d6', category: 'Attributes' },
    { id: 2, name: 'Damage', notation: '3d4' },
    { id: 3, name: 'Keep Me', notation: '1d12' },
  ];
  const parsed = parsePortable([
    'pools:',
    '  Attributes:',
    "    - 'Body': '3d6'",     // identical → unchanged
    "    - 'Damage': '3d4'",   // same notation, NEW shelf → update
    '  Pools:',
    "    - 'Fresh': '2d10'",   // no match → add
    "    - '': '1d4'",         // unnamed → always an add
  ].join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  const plan = planImport(current, parsed);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.updates, [{ id: 2, name: 'Damage', notation: '3d4', category: 'Attributes' }]);
  assert.deepEqual(plan.adds, [
    { name: 'Fresh', notation: '2d10', category: null },
    { name: '', notation: '1d4', category: null },
  ]);
  // 'Keep Me' is nowhere in the plan: imports never delete
});

t('planImport: duplicate names pair off in order, extras add', () => {
  const current = [
    { id: 1, name: 'Twin', notation: '1d6' },
    { id: 2, name: 'Twin', notation: '1d8' },
  ];
  const parsed = parsePortable([
    'pools:', '  Pools:',
    "    - 'Twin': '1d6'",   // pairs with id 1 → unchanged
    "    - 'Twin': '1d20'",  // pairs with id 2 → update
    "    - 'Twin': '1d4'",   // third has no partner → add
  ].join('\n'));
  const plan = planImport(current, parsed);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.updates.map((u) => u.id), [2]);
  assert.equal(plan.adds.length, 1);
});

// ---- §9: the set override rides the YAML -----------------------------------

t('set override round-trips as the @ suffix', () => {
  const groups = [
    { id: 1, name: 'Ember', notation: '3d6', category: 'Attributes', set: 'emberforge.blackanvil' },
    { id: 2, name: 'Plain', notation: '1d20' },
  ];
  const text = exportYaml({ groups });
  assert.ok(text.includes("'3d6' @ 'emberforge.blackanvil'"));
  const parsed = parsePortable(text);
  assert.ok(parsed.ok);
  const pools = flat(parsed);
  assert.equal(pools[0].set, 'emberforge.blackanvil');
  assert.equal(pools[1].set ?? null, null);
});
t('unknown set ids fall closed to no override — the pool survives', () => {
  const parsed = parsePortable([
    'pools:', '  Pools:', "    - 'X': '1d6' @ 'no.such'",
  ].join('\n'));
  assert.ok(parsed.ok);
  assert.equal(flat(parsed)[0].set ?? null, null);
});
t('a bare hand-written notation keeps its @ inside the comment', () => {
  const parsed = parsePortable([
    'pools:', '  Pools:', "    - 'X': 3d6 # struck @ dawn",
  ].join('\n'));
  assert.ok(parsed.ok);
  const p = flat(parsed)[0];
  assert.equal(p.set ?? null, null);
  assert.ok(p.notation.includes('struck @ dawn'));
});
t('trailing garbage after the set id fails with a line number', () => {
  const parsed = parsePortable([
    'pools:', '  Pools:', "    - 'X': '1d6' @ 'std' extra",
  ].join('\n'));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 3);
});
t('planImport: a set change alone is an update; the same set is unchanged', () => {
  const current = [
    { id: 1, name: 'A', notation: '1d6', set: 'std' },
    { id: 2, name: 'B', notation: '1d6' },
  ];
  const parsed = parsePortable([
    'pools:', '  Pools:',
    "    - 'A': '1d6' @ 'std'",
    "    - 'B': '1d6' @ 'emberforge.blackanvil'",
  ].join('\n'));
  const plan = planImport(current, parsed);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.updates.map((u) => [u.id, u.set]), [[2, 'emberforge.blackanvil']]);
});

if (process.exitCode) process.exit(process.exitCode);
console.log(`all ${n} portable tests pass`);
