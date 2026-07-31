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

// THE SOUL DEAL READ (author-confirmed 2026-07-31): dice never sum. Each
// die reads its OWN face against its own rank column — a 2d4 roll of
// [1, 4] is one Blemish and one Minor Success; null cells are quiet dice.
// This suite replaces the retired sum-based reading and its natural-crit
// gate wholesale.

import assert from 'node:assert/strict';
import { outcomeForDie, SYSTEMS } from '../js/meanings.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

const entry = (parts) => ({ parts });
const die = (type, value, over = {}) => ({ type, value, counts: true, child: false, ...over });
const sd = SYSTEMS['soul-deal'];

t("the author's example: 2d4 [1, 4] = Blemish + Minor Success", () => {
  const os = sd.outcomesFor(entry([die('d4', 1), die('d4', 4)]));
  assert.deepEqual(os.map((o) => o.word), ['Blemish', 'Minor Success']);
});

t('each die reads its OWN column: d4 4 ≠ d20 4', () => {
  assert.equal(outcomeForDie('d4', 4).word, 'Minor Success');
  assert.equal(outcomeForDie('d20', 4), null); // a null cell — quiet
});

t('null cells are quiet dice, kept in the outcome list wordlessly', () => {
  const os = sd.outcomesFor(entry([die('d6', 2), die('d6', 6)]));
  assert.equal(os.length, 2);
  assert.equal(os[0].word, null);
  assert.equal(os[1].word, 'Success & Bonus');
});

t('percentile dice have no rank column — always quiet', () => {
  assert.equal(outcomeForDie('d10x', 90), null);
});

t('discarded and child dice never speak', () => {
  const os = sd.outcomesFor(entry([
    die('d20', 20, { counts: false }),
    die('d6', 6, { child: true }),
    die('d12', 12),
  ]));
  assert.equal(os.length, 1);
  assert.equal(os[0].word, 'Critical Success');
});

t('crit fanfare fires when ANY die lands a crit row', () => {
  assert.equal(sd.critFor(entry([die('d4', 1), die('d20', 20)])), 'success');
  assert.equal(sd.critFor(entry([die('d12', 1), die('d6', 5)])), 'fail');
  assert.equal(sd.critFor(entry([die('d4', 4), die('d6', 5)])), null); // small columns have no crit rows
});

t('the profile declares its read: per-die, no totals, no mods', () => {
  assert.equal(sd.aggregate, 'per-die');
  assert.equal(sd.usesTotal, false);
  assert.equal(sd.usesMods, false);
  assert.equal(sd.meaningFor(), null);
});

t('sum systems keep their world: dnd totals + natural d20s only', () => {
  assert.equal(SYSTEMS.dnd.usesTotal, true);
  assert.equal(SYSTEMS.dnd.outcomesFor(entry([die('d4', 4)])), null);
  assert.equal(SYSTEMS.dnd.critFor(entry([die('d20', 20)])), 'success');
  assert.equal(SYSTEMS.dnd.critFor(entry([die('d6', 6), die('d6', 6)])), null);
  assert.equal(SYSTEMS.none.critFor(entry([die('d20', 20)])), null);
});

console.log(`meanings: ${n} checks${process.exitCode ? ' — FAILURES above' : ' ok'}`);
