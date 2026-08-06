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
import { countingPmfs } from '../js/odds.js';
import { composeRoll } from '../js/rollspec.js';

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

// ---------------------------------------------------------------------------
// forecastFor (ROADMAP §2l ②): the pre-roll per-die read. Tools are injected
// exactly as production wires them — countingPmfs from js/odds.js.

const tools = { countingPmfs };
const fc = (dice, mods = null, sources = null) =>
  sd.forecastFor({ dice, mods, ...(sources ? { sources } : {}) }, tools);
const words = (bar) => bar.segments.map((s) => [s.word, +s.p.toFixed(9)]);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

t('the six spectra, generated (POOL-ANALYSIS §3.1)', () => {
  assert.deepEqual(words(fc(['d4']).bars[0]), [
    ['Blemish', 0.25], [null, 0.25], ['Minimal Success', 0.25], ['Minor Success', 0.25]]);
  assert.deepEqual(words(fc(['d6']).bars[0]), [
    ['Fail', +(1 / 6).toFixed(9)], [null, +(2 / 6).toFixed(9)], ['Partial Success', +(1 / 6).toFixed(9)],
    ['Success', +(1 / 6).toFixed(9)], ['Success & Bonus', +(1 / 6).toFixed(9)]]);
  assert.deepEqual(words(fc(['d8']).bars[0]), [
    ['Fail', 0.125], ['Mishap', 0.125], [null, 0.25], ['Partial Success', 0.125],
    ['Success', 0.125], ['Success & Bonus', 0.125], ['Advantage', 0.125]]);
  assert.deepEqual(words(fc(['d10']).bars[0]), [
    ['Critical Fail', 0.1], ['Fail', 0.1], [null, 0.3], ['Minimal Success', 0.1],
    ['Success', 0.1], ['Success & Bonus', 0.1], ['Advantage', 0.1], ['Critical Success', 0.1]]);
  assert.deepEqual(words(fc(['d12']).bars[0]).map(([w]) => w), [
    'Critical Fail', 'Fail', 'Blemish', null, 'Partial Success', 'Success',
    'Success & Bonus', 'Advantage', 'Success & Perm Bonus', 'Critical Success']);
  assert.deepEqual(words(fc(['d20']).bars[0]), [
    ['Critical Fail', 0.05], ['Fail', 0.05], ['Mishap', 0.05], [null, 0.3],
    ['Minimal Success', 0.05], ['Minor Success', 0.05], ['Partial Success', 0.05],
    ['Success', 0.1], ['Success & Bonus', 0.1], ['Advantage', 0.1],
    ['Success & Perm Bonus', 0.05], ['Critical Success', 0.05]]);
});

t('d10x: no column — one bar, wholly quiet', () => {
  const f = fc(['d10x', 'd10x']);
  assert.equal(f.bars.length, 1);
  assert.equal(f.bars[0].count, 2);
  assert.equal(f.bars[0].allQuiet, true);
  assert.deepEqual(f.bars[0].segments, [{ word: null, tier: null, p: 1 }]);
});

t('invariant: every bar sums to 1, plain or transformed', () => {
  for (const [dice, mods] of [
    [['d4'], null], [['d6'], null], [['d8'], null], [['d10'], null], [['d12'], null], [['d20'], null],
    [['d10x'], null], [['d20'], { adv: 'adv' }], [['d20'], { adv: 'dis' }],
    [['d6'], { reroll: { below: 2 } }], [['d20'], { adv: 'adv', reroll: { below: 3 } }],
  ]) {
    for (const bar of fc(dice, mods).bars) {
      close(bar.segments.reduce((s, x) => s + x.p, 0), 1);
    }
  }
});

t('invariant: p(Success) === p(Success & Bonus) on every PLAIN rank (§6.4)', () => {
  // Equal face counts × uniform pmf. Transforms may legitimately skew it —
  // advantage reads 52/400 vs 60/400 — so the invariant is scoped to plain.
  for (const dice of [['d6'], ['d8'], ['d10'], ['d12'], ['d20']]) {
    const bar = fc(dice).bars[0];
    const p = (w) => bar.segments.find((x) => x.word === w).p;
    close(p('Success'), p('Success & Bonus'));
  }
});

t('deduplication, not aggregation: identical ranks share one bar', () => {
  const f = fc(['d6', 'd6', 'd6']);
  assert.equal(f.bars.length, 1);
  assert.equal(f.bars[0].count, 3);
  const mixed = fc(['d4', 'd6']);
  assert.deepEqual(mixed.bars.map((b) => b.type), ['d4', 'd6']);
});

t('mixed pools: one bar per rank under its source label', () => {
  const f = fc(['d6', 'd6', 'd8'], null, ['Strength', 'Strength', 'Swords']);
  assert.deepEqual(f.bars.map((b) => [b.source, b.type, b.count]),
    [['Strength', 'd6', 2], ['Swords', 'd8', 1]]);
  // same rank under two sources = two bars (the forecast mirrors the result rows)
  const split = fc(['d6', 'd6'], null, ['Strength', 'Swords']);
  assert.equal(split.bars.length, 2);
});

t('advantage: transformed spectrum, and partial pairing splits the bar', () => {
  const adv = fc(['d20'], { adv: 'adv' }).bars[0];
  const seg = (w) => adv.segments.find((s) => s.word === w).p;
  close(seg('Critical Success'), 39 / 400);     // P(max of two = 20)
  close(seg('Critical Fail'), 1 / 400);         // P(max of two = 1)
  const mix = fc(Array(21).fill('d20'), { adv: 'adv' });
  assert.deepEqual(mix.bars.map((b) => [b.variant, b.count]), [['adv', 19], ['plain', 2]]);
  const none = fc(Array(40).fill('d20'), { adv: 'adv' });
  assert.deepEqual(none.bars.map((b) => [b.variant, b.count]), [['plain', 40]]);
});

t('reroll: the spectrum shifts mass off the floor', () => {
  const bar = fc(['d6'], { reroll: { below: 2 } }).bars[0];
  close(bar.segments.find((s) => s.word === 'Fail').p, 1 / 18); // p'(1)
  close(bar.segments.find((s) => s.word === null).p, 1 / 18 + 1 / 6 + 1 / 18); // v=2 rerolled + v=3 kept+replacement mass
});

t('explosion changes nothing in the per-die read', () => {
  assert.deepEqual(fc(['d6', 'd6'], { explode: true }), fc(['d6', 'd6']));
});

t('keep/drop refuses in the sysnote voice — the only real break', () => {
  const f = fc(['d6', 'd6', 'd6', 'd6'], { keep: { mode: 'dl', n: 1 } });
  assert.equal(f.kind, 'refusal');
  assert.ok(/keep\/drop/.test(f.reason) && /land/.test(f.reason), f.reason);
});

t('cap-truncated rerolls refuse rather than print an untruncated transform', () => {
  const f = fc(Array(30).fill('d6'), { reroll: { below: 3 } });
  assert.equal(f.kind, 'refusal');
  assert.ok(/40-die cap/.test(f.reason), f.reason);
  // at the cap the mechanic is void, not binding — plain spectrum, no refusal
  const voided = fc(Array(40).fill('d6'), { reroll: { below: 3 } });
  assert.equal(voided.kind, 'per-die');
  assert.deepEqual(voided.bars, fc(Array(40).fill('d6')).bars);
});

t('sum profiles have no forecast yet (§2l ⑥)', () => {
  assert.equal(SYSTEMS.dnd.forecastFor({ dice: ['d20'], mods: null }, tools), null);
  assert.equal(SYSTEMS.none.forecastFor({ dice: ['d20'], mods: null }, tools), null);
});

t('end to end: forecast segments match outcomesFor word frequencies (seeded MC)', () => {
  let a = 20260806 >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (const [dice, mods] of [
    [['d20'], { adv: 'adv' }],
    [['d6', 'd6'], { reroll: { below: 2 } }],
    [['d8'], { explode: true }],
  ]) {
    const bars = fc(dice, mods).bars;
    const tally = new Map();
    const N = 40000;
    let outcomes = 0;
    for (let i = 0; i < N; i++) {
      const r = composeRoll(dice, mods, rng);
      const parts = r.dice.map((type, j) => ({
        type, value: r.values[j], counts: r.perDie[j].counts, child: r.perDie[j].childOf !== null,
      }));
      for (const o of sd.outcomesFor({ parts }) || []) {
        tally.set(o.word, (tally.get(o.word) || 0) + 1);
        outcomes++;
      }
    }
    // one bar per pool here; every observed frequency within 5σ of its segment
    for (const s of bars[0].segments) {
      const observed = (tally.get(s.word) || 0) / outcomes;
      const sigma = Math.sqrt(s.p * (1 - s.p) / outcomes);
      assert.ok(Math.abs(observed - s.p) < 5 * sigma + 1e-12,
        `${dice} ${JSON.stringify(mods)} ${s.word}: observed ${observed.toFixed(4)} vs ${s.p.toFixed(4)}`);
    }
  }
});

console.log(`meanings: ${n} checks${process.exitCode ? ' — FAILURES above' : ' ok'}`);
