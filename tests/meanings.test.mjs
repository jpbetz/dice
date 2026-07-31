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

// The chart's crit rows are NATURAL rows (GOALS: attributed math). A
// modifier may raise the total into the top cell, but the perfect/disaster
// words — and the crit fanfare keyed off their tiers — belong only to dice
// that actually landed max (or min). Regression suite for the false
// 'Natural 20 over 2d6+3' bug (2026-07-31).

import assert from 'node:assert/strict';
import { meaningFor, SYSTEMS } from '../js/meanings.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

const entry = (parts, total) => ({ parts, total });
const die = (type, value, over = {}) => ({ type, value, counts: true, child: false, ...over });

t('a modifier-inflated total is never a crit (2d6+3 = 13, dice 5+5)', () => {
  const m = meaningFor(['d6', 'd6'], 13, 10);
  assert.ok(m, 'the chart still speaks');
  assert.notEqual(m.tier, 'crit-success', `got ${m.tier} (${m.word})`);
});

t('natural max keeps its crit (2d6 = 6+6, +3 on top)', () => {
  const m = meaningFor(['d6', 'd6'], 15, 12);
  assert.ok(m);
  assert.equal(m.tier, 'crit-success');
});

t('a penalty-deflated total is never a crit-fail (dice above pool min)', () => {
  const m = meaningFor(['d6', 'd6'], 1, 5); // total dragged to the floor by -4
  assert.ok(m);
  assert.notEqual(m.tier, 'crit-fail', `got ${m.tier} (${m.word})`);
});

t('a natural d12 1 keeps its crit-fail (small columns have no crit rows)', () => {
  const m = meaningFor(['d12'], 1, 1);
  assert.ok(m);
  assert.equal(m.tier, 'crit-fail');
});

t('a penalty-deflated d12 total of 1 is not a crit-fail (die landed 4)', () => {
  const m = meaningFor(['d12'], 1, 4);
  assert.ok(m);
  assert.notEqual(m.tier, 'crit-fail', `got ${m.tier} (${m.word})`);
});

t("2d6 snake-eyes reads the chart's own row (row 2 — never was the crit row)", () => {
  const m = meaningFor(['d6', 'd6'], 2, 2);
  assert.ok(m);
  assert.notEqual(m.tier, 'crit-success');
});

t('callers without dice knowledge keep the raw chart read', () => {
  const m = meaningFor(['d6', 'd6'], 12); // no diceSum: legacy behavior
  assert.ok(m);
  assert.equal(m.tier, 'crit-success');
});

t('soul-deal critFor: 2d6+3=13 with dice 5+5 fires nothing', () => {
  const e = entry([die('d6', 5), die('d6', 5)], 13);
  assert.equal(SYSTEMS['soul-deal'].critFor(e), null);
});

t('soul-deal critFor: natural 6+6 still fires', () => {
  const e = entry([die('d6', 6), die('d6', 6)], 12);
  assert.equal(SYSTEMS['soul-deal'].critFor(e), 'success');
});

t('dnd critFor: only a counting natural d20 fires', () => {
  assert.equal(SYSTEMS.dnd.critFor(entry([die('d6', 6), die('d6', 6)], 12)), null);
  assert.equal(SYSTEMS.dnd.critFor(entry([die('d20', 20)], 20)), 'success');
  assert.equal(SYSTEMS.dnd.critFor(entry([die('d20', 20, { counts: false })], 7)), null);
});

console.log(`meanings: ${n} checks${process.exitCode ? ' — FAILURES above' : ' ok'}`);
