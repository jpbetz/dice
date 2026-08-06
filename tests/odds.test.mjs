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
import { previewOf, facesOf } from '../js/odds.js';
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

console.log(process.exitCode ? `${n} tests, FAILURES above` : `all ${n} odds tests pass`);
