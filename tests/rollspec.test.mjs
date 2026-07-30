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

import assert from 'node:assert/strict';
import { composeRoll, validateMods, countingBaseTypes, previewSpec } from '../js/rollspec.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};
// deterministic rng from a list
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

t('plain roll', () => {
  const r = composeRoll(['d6', 'd6'], null, seq([0.5, 0.99]));
  assert.equal(r.total, 4 + 6);
  assert.equal(r.dice.length, 2);
  assert.ok(r.perDie.every((m) => m.counts));
  assert.equal(r.parts, null);
});
t('modifier', () => {
  const r = composeRoll(['d20'], { modifier: 3 }, seq([0.5]));
  assert.equal(r.total, 11 + 3);
  assert.equal(r.modifier, 3);
});
t('advantage keeps highest', () => {
  const r = composeRoll(['d20'], { adv: 'adv' }, seq([0.1, 0.9])); // 3, 19
  assert.equal(r.dice.length, 2);
  assert.equal(r.total, 19);
  assert.equal(r.perDie[0].counts, false);
  assert.equal(r.perDie[0].reason, 'adv');
  assert.equal(r.perDie[1].counts, true);
});
t('disadvantage keeps lowest', () => {
  const r = composeRoll(['d20'], { adv: 'dis' }, seq([0.1, 0.9]));
  assert.equal(r.total, 3);
  assert.equal(r.perDie[1].counts, false);
});
t('4d6 drop lowest', () => {
  const r = composeRoll(['d6', 'd6', 'd6', 'd6'], { keep: { mode: 'dl', n: 1 } }, seq([0.0, 0.5, 0.9, 0.3])); // 1,4,6,2
  assert.equal(r.total, 4 + 6 + 2);
  assert.equal(r.perDie[0].counts, false);
  assert.equal(r.perDie[0].reason, 'drop');
});
t('keep highest 1 of 2', () => {
  const r = composeRoll(['d6', 'd6'], { keep: { mode: 'kh', n: 1 } }, seq([0.2, 0.7])); // 2,5
  assert.equal(r.total, 5);
});
t('reroll 1s throws replacement die', () => {
  const r = composeRoll(['d6', 'd6'], { reroll: { below: 1 } }, seq([0.0, 0.9, 0.5])); // 1,6 -> reroll 4
  assert.equal(r.dice.length, 3);
  assert.equal(r.total, 6 + 4);
  assert.equal(r.perDie[0].reason, 'reroll');
  assert.equal(r.perDie[2].rerollOf, 0);
});
t('exploding chains', () => {
  const r = composeRoll(['d6'], { explode: true }, seq([0.99, 0.99, 0.2])); // 6,6,2
  assert.equal(r.dice.length, 3);
  assert.equal(r.total, 6 + 6 + 2);
  assert.equal(r.perDie[1].childOf, 0);
  assert.equal(r.perDie[2].childOf, 1);
});
t('explode chain cap 3', () => {
  const r = composeRoll(['d6'], { explode: true }, seq([0.99]));
  assert.equal(r.dice.length, 4);
});
t('countingBaseTypes excludes children and discards', () => {
  const r = composeRoll(['d20'], { adv: 'adv', explode: true }, seq([0.99, 0.1, 0.3])); // 20,3 -> keep 20, child
  assert.deepEqual(countingBaseTypes(r.dice, r.perDie), ['d20']);
});
t('parts carried through composition', () => {
  const parts = [{ label: 'Proficiency', value: 2 }, { label: 'Guidance', value: 1 }];
  const r = composeRoll(['d20'], { modifier: 3, parts }, seq([0.5]));
  assert.deepEqual(r.parts, parts);
  assert.equal(r.total, 11 + 3);
});

// validation
t('validate modifier range', () => assert.equal(validateMods(['d6'], { modifier: 100 }), 'bad_modifier'));
t('validate adv needs d20', () => assert.equal(validateMods(['d6'], { adv: 'adv' }), 'adv_needs_d20'));
t('validate keep n', () => assert.equal(validateMods(['d6', 'd6'], { keep: { mode: 'kh', n: 2 } }), 'bad_keep_n'));
t('validate good combo', () =>
  assert.equal(validateMods(['d6', 'd6', 'd6', 'd6'], { keep: { mode: 'dl', n: 1 }, reroll: { below: 1 }, explode: true, modifier: -2 }), null));
t('validate empty', () => assert.equal(validateMods(['d6'], undefined), null));
t('validate parts sum ok', () =>
  assert.equal(validateMods(['d20'], { modifier: 3, parts: [{ label: 'A', value: 2 }, { label: '', value: 1 }] }), null));
t('validate parts bad sum', () =>
  assert.equal(validateMods(['d20'], { modifier: 3, parts: [{ label: 'A', value: 2 }] }), 'bad_parts_sum'));
t('validate parts bad label', () => {
  assert.equal(validateMods(['d20'], { modifier: 1, parts: [{ label: 'x'.repeat(21), value: 1 }] }), 'bad_parts');
  assert.equal(validateMods(['d20'], { modifier: 1, parts: [{ label: 'a\x00b', value: 1 }] }), 'bad_parts');
  assert.equal(validateMods(['d20'], { modifier: 1, parts: [{ label: 7, value: 1 }] }), 'bad_parts');
  assert.equal(validateMods(['d20'], { modifier: 1, parts: [{ label: 'Wisdom Bonus', value: 1 }] }), null); // spaces are fine
});
t('validate parts without modifier field', () =>
  assert.equal(validateMods(['d20'], { parts: [{ label: 'A', value: 0 }] }), null));
t('validate parts non-array', () =>
  assert.equal(validateMods(['d20'], { modifier: 1, parts: 'x' }), 'bad_parts'));

// preview
t('preview 1d20+3 bounds', () => {
  const p = previewSpec(['d20'], { modifier: 3 }, 3000);
  assert.ok(p.min >= 4 && p.max <= 23 && p.avg > 12 && p.avg < 15.5);
});

console.log(process.exitCode ? `${n} tests, FAILURES above` : `all ${n} rollspec tests pass`);
