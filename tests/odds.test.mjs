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
import { previewOf, facesOf, throwForecast, THROW_REFUSALS } from '../js/odds.js';
import { budgetOf, composeRoll, validateMods, DIE_MAX } from '../js/rollspec.js';
import { parseNotation } from '../js/notation.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// seeded rng for the MC cross-checks — deterministic, never flaky
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

// Exhaustive distribution of composeRoll over every rng draw — the gold
// standard previewOf's exact tier is checked against. Each unknown draw's
// face set is discovered by probing it with 0 and 1−ε, then branched over
// the real faces, so caps, ties and sort stability are captured
// mechanically rather than re-derived.
const enumerate = (dice, mods) => {
  const drive = (prefix, probe) => {
    let i = 0;
    const rng = () => (i < prefix.length ? prefix[i++] : (i++, probe));
    const res = composeRoll(dice, mods, rng);
    return { res, draws: i };
  };
  const out = { min: Infinity, max: -Infinity, avg: 0 };
  const walk = (prefix, prob) => {
    const lo = drive(prefix, 0);
    if (lo.draws <= prefix.length) {
      out.avg += prob * lo.res.total;
      if (lo.res.total < out.min) out.min = lo.res.total;
      if (lo.res.total > out.max) out.max = lo.res.total;
      return;
    }
    const hi = drive(prefix, 1 - Number.EPSILON);
    const vLo = lo.res.values[prefix.length];
    const vHi = hi.res.values[prefix.length];
    const faces = vLo === 0 && vHi === 90 ? 10 : vHi; // d10x reads 0..90 by tens
    for (let f = 0; f < faces; f++) walk([...prefix, (f + 0.5) / faces], prob / faces);
  };
  walk([], 1);
  return out;
};

const spec = (s) => {
  const r = parseNotation(s);
  assert.ok(r.ok, `'${s}' should parse (got: ${r.error})`);
  return r;
};

// --- budgetOf: the POOL-ANALYSIS §4 table, both adv spellings included
t('budget 2d20 = 40', () => assert.equal(budgetOf(spec('2d20').spec.dice, spec('2d20').spec.mods), 40));
t('budget 1d20+1d4 = 24', () => assert.equal(budgetOf(spec('1d20+1d4').spec.dice, spec('1d20+1d4').spec.mods), 24));
t('budget d100 = 100 (d10x + d10)', () => {
  const r = spec('d100');
  assert.deepEqual(r.spec.dice, ['d10x', 'd10']);
  assert.equal(budgetOf(r.spec.dice, r.spec.mods), 100);
});
t('budget 9d6 = 54 (the seeded Attributes shelf)', () => assert.equal(budgetOf(spec('9d6').spec.dice, spec('9d6').spec.mods), 54));
t('budget 4d6dl1 = 24 (drops are not discounts)', () => assert.equal(budgetOf(spec('4d6dl1').spec.dice, spec('4d6dl1').spec.mods), 24));
t('budget 1d6! = 6 (children are value-conditional)', () => assert.equal(budgetOf(spec('1d6!').spec.dice, spec('1d6!').spec.mods), 6));
t('budget both spellings of 2d20-keep-1 read 40', () => {
  const glued = spec('2d20kh1');
  assert.equal(glued.canonical, '1d20 adv');
  assert.equal(budgetOf(glued.spec.dice, glued.spec.mods), 40);
  const spaced = spec('2d20 kh1');
  assert.equal(budgetOf(spaced.spec.dice, spaced.spec.mods), 40);
});
t('budget 40d10x = 3600', () => assert.equal(budgetOf(spec('40d10x').spec.dice, spec('40d10x').spec.mods), 3600));
t('budget 21d20 adv = 800 (pairs 19)', () => assert.equal(budgetOf(spec('21d20 adv').spec.dice, spec('21d20 adv').spec.mods), 800));
t('budget 40d20 adv = 800 (pairs zero)', () => assert.equal(budgetOf(spec('40d20 adv').spec.dice, spec('40d20 adv').spec.mods), 800));

// --- previewOf: exact vectors, independently derived
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !~ ${b}`);
const pv = (s) => { const r = spec(s); return previewOf(r.spec.dice, r.spec.mods); };

t('exact 3d6+5', () => {
  const p = pv('3d6+5');
  assert.deepEqual([p.min, p.max, p.exact], [8, 23, true]);
  close(p.avg, 15.5);
});
t('exact 1d20 adv = 13.825', () => {
  const p = pv('1d20 adv');
  assert.deepEqual([p.min, p.max, p.exact], [1, 20, true]);
  close(p.avg, 13.825);
});
t('exact 1d20 dis = 7.175', () => {
  const p = pv('1d20 dis');
  assert.deepEqual([p.min, p.max, p.exact], [1, 20, true]);
  close(p.avg, 7.175);
});
t('exact 4d6dl1 = 15869/1296', () => {
  const p = pv('4d6dl1');
  assert.deepEqual([p.min, p.max, p.exact], [3, 18, true]);
  close(p.avg, 15869 / 1296);
});
t('exact 1d6! = 3.5·259/216, max 24', () => {
  const p = pv('1d6!');
  assert.deepEqual([p.min, p.max, p.exact], [1, 24, true]);
  close(p.avg, 3.5 * 259 / 216);
});
t('exact d100 = 50.5 over 1..100', () => {
  const p = pv('d100');
  assert.deepEqual([p.min, p.max, p.exact], [1, 100, true]);
  close(p.avg, 50.5);
});
t('exact 2d6 ro<=2 = 25/3', () => {
  const p = pv('2d6 ro<=2');
  assert.deepEqual([p.min, p.max, p.exact], [2, 12, true]);
  close(p.avg, 25 / 3);
});
t('exact 21d20 adv = 19 paired + 2 plain', () => {
  const p = pv('21d20 adv');
  assert.deepEqual([p.min, p.max, p.exact], [21, 420, true]);
  close(p.avg, 19 * 13.825 + 2 * 10.5);
});

// --- the five cap regressions (POOL-ANALYSIS §10)
t('cap: 40d20! is 40d20 — explosion void at the cap', () => {
  assert.deepEqual(pv('40d20!'), pv('40d20'));
  assert.deepEqual(pv('40d20'), { min: 40, avg: 420, max: 800, exact: true });
});
t('cap: 40d20 adv pairs zero — plain preview', () => {
  const p = pv('40d20 adv');
  assert.deepEqual(p, { min: 40, avg: 420, max: 800, exact: true });
});
t('cap: 40d6 ro<=3 rerolls zero — reroll void', () => {
  const p = pv('40d6 ro<=3');
  assert.deepEqual(p, { min: 40, avg: 140, max: 240, exact: true });
});
t('cap: 2d6 kh5 mirrors the composeRoll clamp (keeps 1)', () => {
  // parser and validateMods both reject this; previewOf mirrors composeRoll
  // for defense in depth when handed such mods directly
  const p = previewOf(['d6', 'd6'], { keep: { mode: 'kh', n: 5 } });
  assert.deepEqual([p.min, p.max, p.exact], [1, 6, true]);
  close(p.avg, 161 / 36); // E[max of 2d6]
});

// --- gold standard: exhaustive enumeration of composeRoll itself
const matchEnum = (name, dice, mods) => {
  t(`enum ${name}`, () => {
    const e = enumerate(dice, mods);
    const p = previewOf(dice, mods);
    assert.equal(p.exact, true, 'expected exact tier');
    assert.equal(p.min, e.min, `min ${p.min} != enumerated ${e.min}`);
    assert.equal(p.max, e.max, `max ${p.max} != enumerated ${e.max}`);
    close(p.avg, e.avg);
  });
};
matchEnum('2d6', ['d6', 'd6'], null);
matchEnum('1d6+1d4 mixed', ['d6', 'd4'], null);
matchEnum('1d20 adv', ['d20'], { adv: 'adv' });
matchEnum('1d20 dis', ['d20'], { adv: 'dis' });
matchEnum('2d6 ro<=2', ['d6', 'd6'], { reroll: { below: 2 } });
matchEnum('1d10x ro<=5 (the zero face rerolls)', ['d10x'], { reroll: { below: 5 } });
matchEnum('1d6!', ['d6'], { explode: true });
matchEnum('2d4!', ['d4', 'd4'], { explode: true });
matchEnum('3d6 kh1', ['d6', 'd6', 'd6'], { keep: { mode: 'kh', n: 1 } });
matchEnum('3d6 dl1', ['d6', 'd6', 'd6'], { keep: { mode: 'dl', n: 1 } });
matchEnum('2d4 dh1', ['d4', 'd4'], { keep: { mode: 'dh', n: 1 } });
matchEnum('2d4 kl1', ['d4', 'd4'], { keep: { mode: 'kl', n: 1 } });
matchEnum('1d6+1d4 kh1 mixed keep', ['d6', 'd4'], { keep: { mode: 'kh', n: 1 } });
matchEnum('1d20 adv ro<=2', ['d20'], { adv: 'adv', reroll: { below: 2 } });
matchEnum('2d6 ro<=1 kh1', ['d6', 'd6'], { reroll: { below: 1 }, keep: { mode: 'kh', n: 1 } });
matchEnum('3d4 dl1 ! single-type keep+explode', ['d4', 'd4', 'd4'], { keep: { mode: 'dl', n: 1 }, explode: true });
matchEnum('modifier rides along', ['d6', 'd6'], { modifier: -2 });

// --- BINDING corners: sampled, labeled, deterministic, floor still exact
t('sampled: 30d6 ro<=3 (10 slots for 30 candidates)', () => {
  const p = pv('30d6 ro<=3');
  assert.equal(p.exact, false);
  assert.equal(p.min, 30);
  assert.ok(p.avg > 30 && p.avg < p.max);
});
t('sampled: explosion truncation, mixed types', () => {
  const dice = [...Array(14).fill('d6'), ...Array(14).fill('d20')];
  const p = previewOf(dice, { explode: true });
  assert.equal(p.exact, false);
  assert.equal(p.min, 28);
});
t('sampled: mixed-type keep+explode refused', () => {
  const dice = [...Array(12).fill('d6'), 'd20', 'd20'];
  const p = previewOf(dice, { keep: { mode: 'kh', n: 4 }, explode: true });
  assert.equal(p.exact, false);
});
t('sampled tier is deterministic across calls', () => {
  const a = pv('30d6 ro<=3');
  const b = pv('30d6 ro<=3');
  assert.deepEqual(a, b);
});
t('sampled avg agrees with a big seeded MC', () => {
  const r = spec('30d6 ro<=3');
  const p = previewOf(r.spec.dice, r.spec.mods);
  const rng = mulberry32(424242);
  let sum = 0;
  const N = 50000;
  for (let i = 0; i < N; i++) sum += composeRoll(r.spec.dice, r.spec.mods, rng).total;
  close(p.avg, sum / N, 1.0);
});

// --- MC cross-validation for the larger exact pools (seeded, 6σ tolerance)
const matchMC = (name, dice, mods) => {
  t(`mc ${name}`, () => {
    const p = previewOf(dice, mods);
    assert.equal(p.exact, true, 'expected exact tier');
    const rng = mulberry32(1337);
    const N = 40000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < N; i++) {
      const { total } = composeRoll(dice, mods, rng);
      sum += total;
      sq += total * total;
      assert.ok(total >= p.min && total <= p.max, `total ${total} outside [${p.min}, ${p.max}]`);
    }
    const mean = sum / N;
    const sd = Math.sqrt(Math.max(0, sq / N - mean * mean));
    close(p.avg, mean, 6 * sd / Math.sqrt(N) + 1e-9);
  });
};
matchMC('20d6', Array(20).fill('d6'), null);
matchMC('10d20 kh3', Array(10).fill('d20'), { keep: { mode: 'kh', n: 3 } });
matchMC('15d6 ro<=2', Array(15).fill('d6'), { reroll: { below: 2 } });
matchMC('8d8+2d20 kh4 mixed keep', [...Array(8).fill('d8'), 'd20', 'd20'], { keep: { mode: 'kh', n: 4 } });
matchMC('5d20 adv ro<=2', Array(5).fill('d20'), { adv: 'adv', reroll: { below: 2 } });
matchMC('6d6!', Array(6).fill('d6'), { explode: true });

// --- property fuzz: seeded random valid specs
t('fuzz: min <= avg <= max, rolls in bounds, budget matches composition', () => {
  const rng = mulberry32(987654321);
  const types = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];
  const KEEPS = ['kh', 'kl', 'dh', 'dl'];
  let checked = 0;
  for (let iter = 0; iter < 400 && checked < 200; iter++) {
    const count = 1 + Math.floor(rng() * 8);
    const dice = Array.from({ length: count }, () => types[Math.floor(rng() * types.length)]);
    const mods = {};
    if (rng() < 0.3 && dice.includes('d20')) mods.adv = rng() < 0.5 ? 'adv' : 'dis';
    if (rng() < 0.3 && count >= 2) mods.keep = { mode: KEEPS[Math.floor(rng() * 4)], n: 1 + Math.floor(rng() * (count - 1)) };
    if (rng() < 0.2) mods.reroll = { below: 1 + Math.floor(rng() * 9) };
    if (rng() < 0.2) mods.explode = true;
    if (rng() < 0.4) mods.modifier = Math.floor(rng() * 16) - 5;
    if (validateMods(dice, mods) !== null) continue;
    checked++;
    const p = previewOf(dice, mods);
    assert.ok(p.min <= p.avg + 1e-9 && p.avg <= p.max + 1e-9, `${dice} ${JSON.stringify(mods)}: min ${p.min} avg ${p.avg} max ${p.max}`);
    const r = composeRoll(dice, mods, rng);
    let physical = 0;
    r.dice.forEach((ty, i) => { if (r.perDie[i].childOf === null && r.perDie[i].rerollOf === null) physical += DIE_MAX[ty]; });
    assert.equal(budgetOf(dice, mods), physical, `${dice} ${JSON.stringify(mods)}: budget != composed physical dice`);
    if (p.exact) {
      for (let k = 0; k < 50; k++) {
        const { total } = composeRoll(dice, mods, rng);
        assert.ok(total >= p.min && total <= p.max, `${dice} ${JSON.stringify(mods)}: ${total} outside [${p.min}, ${p.max}]`);
      }
    }
  }
  assert.ok(checked >= 150, `only ${checked} valid specs generated`);
});

// --- shape sanity
t('facesOf d10x is 0..90 by tens', () => {
  const f = facesOf('d10x');
  assert.equal(f.length, 10);
  assert.equal(f[0], 0);
  assert.equal(f[9], 90);
});
t('empty pool is just the modifier', () => {
  assert.deepEqual(previewOf([], { modifier: 3 }), { min: 3, avg: 3, max: 3, exact: true });
});

// ---------------------------------------------------------------------------
// THE DECISION READ — throwForecast (MECHANICS M5).
//
// Every numeric claim below is checked against a BRUTE-FORCE product over the
// dice's own faces, not against another closed form. That matters here more
// than usual: the thing under test forwards to sumForecast, so a check written
// in sumForecast's own idiom would agree with it about a shared mistake. A
// Cartesian product of equally likely tuples shares nothing with it.
// ---------------------------------------------------------------------------

// Every outcome of throwing these plain dice, as a flat list of totals. All
// outcomes are equally likely, so a probability is a count over the length.
const allSums = (types) => {
  const out = [];
  const walk = (i, s) => {
    if (i === types.length) { out.push(s); return; }
    for (const v of facesOf(types[i])) walk(i + 1, s + v);
  };
  walk(0, 0);
  return out;
};

// The same product over FACE LABELS: every tuple of faces those dice could
// show, for the symbol read.
const allFaces = (lists) => {
  const out = [];
  const walk = (i, acc) => {
    if (i === lists.length) { out.push(acc); return; }
    for (const f of lists[i]) walk(i + 1, acc.concat(f));
  };
  walk(0, []);
  return out;
};

const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;
const MONSTER = ['1', '2', '3', 'bolt', 'claw', 'heart']; // js/themes.js symbols.monster
const FATE = ['minus', 'minus', 'blank', 'blank', 'plus', 'plus']; // symbols.fate

// The core claim, against the product. `now` is what the dice show at the
// decision point; higher/same/lower must be exactly the three counts.
const checkTotal = (name, dice) => t(name, () => {
  const fc = throwForecast(dice);
  assert.equal(fc.kind, 'total', `${name}: kind`);
  const types = dice.map((d) => d.type);
  const now = dice.reduce((s, d) => s + d.value, 0);
  assert.equal(fc.now, now, `${name}: now`);
  assert.equal(fc.n, dice.length, `${name}: n`);
  const sums = allSums(types);
  const N = sums.length;
  const hi = sums.filter((s) => s > now).length / N;
  const eq = sums.filter((s) => s === now).length / N;
  const lo = sums.filter((s) => s < now).length / N;
  const mean = sums.reduce((a, b) => a + b, 0) / N;
  assert.ok(near(fc.higher, hi, 1e-10), `${name}: higher ${fc.higher} != ${hi}`);
  assert.ok(near(fc.same, eq, 1e-10), `${name}: same ${fc.same} != ${eq}`);
  assert.ok(near(fc.lower, lo, 1e-10), `${name}: lower ${fc.lower} != ${lo}`);
  assert.ok(near(fc.mean, mean, 1e-9), `${name}: mean ${fc.mean} != ${mean}`);
  assert.ok(near(fc.higher + fc.same + fc.lower, 1, 1e-9),
    `${name}: the three do not partition (${fc.higher + fc.same + fc.lower})`);
});

checkTotal('throwForecast 2d6 showing 8', [{ type: 'd6', value: 3 }, { type: 'd6', value: 5 }]);
checkTotal('throwForecast 3d6 showing 11', [
  { type: 'd6', value: 2 }, { type: 'd6', value: 4 }, { type: 'd6', value: 5 }]);
// MIXED TYPES are the ordinary case for a turn (`2d6+1d8 t3` is a legal pool),
// and they are the case a per-die shortcut would get wrong.
checkTotal('throwForecast d6+d8 showing 10', [{ type: 'd6', value: 3 }, { type: 'd8', value: 7 }]);
// d10x's faces are 0,10..90 — the read must be indexed by ordinal, not value.
checkTotal('throwForecast 2d10x showing 60', [{ type: 'd10x', value: 40 }, { type: 'd10x', value: 20 }]);

// THE TWO EDGES, where a cumulative read is most likely to lie. Holding the
// maximum means P(higher) is a TRUE zero and must print as one, not as a
// vanished tail; holding the minimum is the same claim at the other end.
t('throwForecast at the ceiling: higher is a true zero', () => {
  const fc = throwForecast([{ type: 'd6', value: 6 }, { type: 'd6', value: 6 }]);
  assert.equal(fc.higher, 0);
  assert.ok(near(fc.same, 1 / 36, 1e-12), `same ${fc.same}`);
  assert.ok(near(fc.lower, 35 / 36, 1e-12), `lower ${fc.lower}`);
});
t('throwForecast at the floor: lower is a true zero', () => {
  const fc = throwForecast([{ type: 'd6', value: 1 }, { type: 'd6', value: 1 }]);
  assert.equal(fc.lower, 0);
  assert.ok(near(fc.higher, 35 / 36, 1e-12), `higher ${fc.higher}`);
});

// A 40-DIE POOL is what MAX_PHYSICAL_DICE allows, and it is the case where a
// deep tail underflows if the cumulative read is taken as `1 - cdf` (the bug
// sumAtLeast's comment records). Holding one under the maximum, P(higher) is
// exactly the one all-max outcome.
t('throwForecast survives a 40-die pool at the far tail', () => {
  const dice = Array.from({ length: 40 }, (_, i) => ({ type: 'd6', value: i === 0 ? 5 : 6 }));
  const fc = throwForecast(dice);
  assert.equal(fc.kind, 'total');
  assert.equal(fc.now, 239);
  assert.ok(fc.higher > 0, 'the one better outcome is not zero');
  assert.ok(near(fc.higher, Math.pow(1 / 6, 40), Math.pow(1 / 6, 40) * 1e-6),
    `higher ${fc.higher} != 6^-40`);
});

// ---- THE REFUSALS, which are the design rather than its edges --------------

// SYMBOL DICE HAVE NO TOTAL, and this is the honest-refusal case. Values are
// 1..6 on the wire (MECHANICS M3), so a sum is computable and meaningless: a
// claw is not greater than a bolt.
t('symbol dice: the total is refused in writing', () => {
  const fc = throwForecast([
    { type: 'd6', value: 5, faces: MONSTER }, { type: 'd6', value: 6, faces: MONSTER }]);
  assert.equal(fc.kind, 'faces');
  assert.equal(fc.now, null, 'and no total leaks out beside the refusal');
  assert.equal(fc.higher, null);
  assert.equal(fc.noTotal.code, 'no-total');
  assert.equal(fc.noTotal.reason, THROW_REFUSALS['no-total']);
  assert.match(fc.noTotal.reason, /not numbers/);
});

// THE FUDGE DIE IS THE TRAP. Plus really is better than minus, so "higher is
// better" LOOKS safe here — but 1,2 both read minus and 3,4 both read blank, so
// a forecast on raw sums would score a 1 to 2 change as an improvement when the
// die did not move. Forecasting the Fudge scale instead would mean reading a
// face AS a number, which is a procedure's job (M4). So: refused.
t('the Fudge die gets no numeric forecast', () => {
  const fc = throwForecast([{ type: 'd6', value: 1, faces: FATE }, { type: 'd6', value: 6, faces: FATE }]);
  assert.equal(fc.kind, 'faces', 'no "higher" read on a die whose values are not its faces');
  assert.equal(fc.higher, null);
  assert.deepEqual(fc.groups.map((g) => g.faces), [['minus', 'blank', 'plus']],
    'three faces, one chance between them');
  assert.ok(near(fc.groups[0].p, 1 - (4 / 6) * (4 / 6), 1e-12), `p ${fc.groups[0].p}`);
});

t('mixed symbol and number dice are refused', () => {
  const fc = throwForecast([{ type: 'd6', value: 5, faces: MONSTER }, { type: 'd6', value: 2 }]);
  assert.equal(fc.kind, 'refused');
  assert.equal(fc.refusal.code, 'mixed-faces');
  assert.equal(fc.refusal.reason, THROW_REFUSALS['mixed-faces']);
  assert.equal(fc.now, null);
  assert.deepEqual(fc.groups, [], 'a refusal carries no half-answer');
});

t('nothing thrown is refused', () => {
  const fc = throwForecast([]);
  assert.equal(fc.kind, 'refused');
  assert.equal(fc.refusal.code, 'nothing-thrown');
  assert.equal(fc.n, 0);
});

// A REDACTED TURN has parts with `value: null` (goal 11). canThrowAgain already
// refuses there — you cannot choose faces you cannot see — so this is the belt
// to that brace: without it the sum would be NaN and print as a confident
// nothing.
t('a face-down turn is refused rather than summed', () => {
  const fc = throwForecast([{ type: 'd6', value: null }, { type: 'd6', value: 4 }]);
  assert.equal(fc.kind, 'refused');
  assert.equal(fc.refusal.code, 'no-values');
});

// (There is no test for the SUM_REFUSALS passthrough because it cannot fire:
// throwForecast calls sumForecast with no mods, and all three of its refusals
// are mod-driven. The line stays because a turn is a plain pool by M2's RULE
// rather than by construction, and the day that loosens is the day a silent
// wrong number would appear. Recorded so a later reader does not mistake an
// untestable line for an untested one.)

// ---- THE FACE READ, against the product -----------------------------------

t('monster face odds are P(at least one), exactly', () => {
  for (const n of [1, 2, 4, 6]) {
    const dice = Array.from({ length: n }, () => ({ type: 'd6', value: 1, faces: MONSTER }));
    const fc = throwForecast(dice);
    assert.equal(fc.kind, 'faces', `${n} dice: kind`);
    const tuples = n <= 4 ? allFaces(Array.from({ length: n }, () => MONSTER)) : null;
    for (const f of fc.faces) {
      const want = 1 - Math.pow(5 / 6, n);
      assert.ok(near(f.p, want, 1e-12), `${n} dice, ${f.face}: ${f.p} != ${want}`);
      if (tuples) {
        const brute = tuples.filter((row) => row.includes(f.face)).length / tuples.length;
        assert.ok(near(f.p, brute, 1e-12), `${n} dice, ${f.face}: ${f.p} != product ${brute}`);
      }
    }
    // ONE GROUP: on a fair set every face returns the same number, and saying
    // so once is the honest statement that there is nothing here to rank.
    assert.equal(fc.groups.length, 1, `${n} dice: one chance for all six faces`);
    assert.deepEqual(fc.groups[0].faces, MONSTER, `${n} dice: in face order`);
  }
});

// A MIXED SYMBOL POOL is where grouping earns its keep — two sets, two
// populations, and the numbers really do differ per face.
t('monster + fate together: two groups, both exact', () => {
  const fc = throwForecast([
    { type: 'd6', value: 4, faces: MONSTER },
    { type: 'd6', value: 5, faces: FATE }]);
  assert.equal(fc.kind, 'faces');
  const tuples = allFaces([MONSTER, FATE]);
  const brute = (f) => tuples.filter((row) => row.includes(f)).length / tuples.length;
  for (const f of fc.faces) {
    assert.ok(near(f.p, brute(f.face), 1e-12), `${f.face}: ${f.p} != ${brute(f.face)}`);
  }
  assert.equal(fc.groups.length, 2, `two distinct chances (${JSON.stringify(fc.groups)})`);
  const byP = [...fc.groups].sort((a, b) => a.p - b.p);
  assert.deepEqual(byP[0].faces, MONSTER, 'the monster faces, on one die each: 1/6');
  assert.ok(near(byP[0].p, 1 / 6, 1e-12));
  assert.deepEqual(byP[1].faces, ['minus', 'blank', 'plus'], 'the fate faces: 2/6');
  assert.ok(near(byP[1].p, 2 / 6, 1e-12));
});

// ---- THE WORD READ: forecasting in the shape the TABLE reads ---------------
// Under a per-die profile "a sum is not a fact of play" (js/meanings.js) — the
// verdict ring folds and no total renders anywhere — so a total forecast there
// would be this feature quoting odds on a number the rest of the app refuses
// to show. The caller resolves the words; odds.js only has to prefer them.

// Soul Deal's d6 column, as the caller resolves it: four words and two blank
// rows, which the caller labels rather than dropping.
const SD6 = ['Fail', 'no word', 'no word', 'Partial Success', 'Success', 'Success & Bonus'];

t('a per-die table gets its words, not a total', () => {
  const dice = Array.from({ length: 6 }, () => ({ type: 'd6', value: 3, reads: SD6 }));
  const fc = throwForecast(dice);
  assert.equal(fc.kind, 'faces');
  assert.equal(fc.higher, null, 'no higher/same/lower where a total is not the read');
  assert.equal(fc.noTotal.code, 'no-sum');
  assert.equal(fc.noTotal.reason, THROW_REFUSALS['no-sum']);
  // Closed form here (6^6 is 46656 tuples); the product check is the next case.
  for (const f of fc.faces) {
    const rows = SD6.filter((w) => w === f.face).length;
    const want = 1 - Math.pow(1 - rows / 6, 6);
    assert.ok(near(f.p, want, 1e-12), `${f.face}: ${f.p} != ${want}`);
  }
  // The quiet rows are TWO faces of the die, so their label's chance is the
  // higher one — which is exactly why it is a label and not a hole. Dropping it
  // from the die would have made every other word's number wrong.
  const quiet = fc.faces.find((f) => f.face === 'no word');
  assert.ok(near(quiet.p, 1 - Math.pow(4 / 6, 6), 1e-12), `no word: ${quiet.p}`);
  assert.equal(fc.groups.length, 2, 'four words at one chance, the quiet pair at another');
});

t('the word read is checked against the product on a small pool', () => {
  const dice = [{ type: 'd6', value: 1, reads: SD6 }, { type: 'd6', value: 2, reads: SD6 }];
  const fc = throwForecast(dice);
  const tuples = allFaces([SD6, SD6]);
  for (const f of fc.faces) {
    const brute = tuples.filter((row) => row.includes(f.face)).length / tuples.length;
    assert.ok(near(f.p, brute, 1e-12), `${f.face}: ${f.p} != product ${brute}`);
  }
});

// THE FACES WIN over the table's words, and MECHANICS M3 is why: with the room
// set to a numeric system a monster die showing a claw is read as "5 — Success",
// which is not wrong so much as meaningless. What is on the die outranks a
// reading of the number underneath it.
t('symbol faces outrank the system words', () => {
  const fc = throwForecast([{ type: 'd6', value: 5, faces: MONSTER, reads: SD6 }]);
  assert.equal(fc.noTotal.code, 'no-total', 'the refusal names the FACES, not the system');
  assert.deepEqual(fc.faces.map((f) => f.face), MONSTER);
});

t('a malformed or partial word table falls back to the total', () => {
  // wrong length — a d6 handed four words is a different die
  const short = throwForecast([{ type: 'd6', value: 3, reads: ['a', 'b', 'c', 'd'] }]);
  assert.equal(short.kind, 'total', 'four labels for six faces is refused, not stretched');
  // a hole in the table
  const holed = throwForecast([{ type: 'd6', value: 3, reads: ['a', null, 'c', 'd', 'e', 'f'] }]);
  assert.equal(holed.kind, 'total');
  // ALL OR NONE: the system is a property of the TABLE, so a pool where only
  // some dice resolved is a bug rather than a mixture, and the total is the
  // answer that cannot be half-right.
  const half = throwForecast([
    { type: 'd6', value: 3, reads: SD6 }, { type: 'd6', value: 4 }]);
  assert.equal(half.kind, 'total');
});

// A FACE TABLE OF THE WRONG LENGTH IS IGNORED ENTIRELY, not half-applied.
// js/dice.js paints `faces` on d6 only; this mirrors that by MEASURING rather
// than naming the type. Half a symbol die would be a d20 with six labels and
// fourteen holes, and the holes would read as numbers.
t('a d6 face table on a d20 is ignored, not half-applied', () => {
  const fc = throwForecast([{ type: 'd20', value: 11, faces: MONSTER }]);
  assert.equal(fc.kind, 'total', 'it stays a number die');
  assert.equal(fc.now, 11);
  assert.ok(near(fc.mean, 10.5, 1e-12), `mean ${fc.mean}`);
  assert.ok(near(fc.higher, 9 / 20, 1e-12), `higher ${fc.higher}`);
});

// A SWEEP: whatever the pool, the three numbers partition the outcome space and
// the mean sits inside the achievable range. Randomised over the die types a
// turn can actually hold.
t('throwForecast partitions and stays in range across random pools', () => {
  const rng = mulberry32(0x5ec1de);
  const types = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd10x'];
  for (let i = 0; i < 200; i++) {
    const count = 1 + Math.floor(rng() * 6);
    const dice = Array.from({ length: count }, () => {
      const type = types[Math.floor(rng() * types.length)];
      const f = facesOf(type);
      return { type, value: f[Math.floor(rng() * f.length)] };
    });
    const fc = throwForecast(dice);
    assert.equal(fc.kind, 'total', `${dice.map((d) => d.type)}: kind`);
    const sum = fc.higher + fc.same + fc.lower;
    assert.ok(near(sum, 1, 1e-9), `${dice.map((d) => d.type)}: partition ${sum}`);
    const f0 = dice.map((d) => facesOf(d.type));
    const lo = f0.reduce((s, f) => s + f[0], 0);
    const hi = f0.reduce((s, f) => s + f[f.length - 1], 0);
    assert.ok(fc.mean >= lo - 1e-9 && fc.mean <= hi + 1e-9,
      `${dice.map((d) => d.type)}: mean ${fc.mean} outside [${lo}, ${hi}]`);
    assert.ok(fc.now >= lo && fc.now <= hi, `${dice.map((d) => d.type)}: now ${fc.now} outside`);
  }
});

console.log(process.exitCode ? `${n} tests, FAILURES above` : `all ${n} odds tests pass`);
