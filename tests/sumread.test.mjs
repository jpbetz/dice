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

// THE SUM READ (ROADMAP §2l ⑥) — proof for js/odds.js sumForecast.
//
// Four independent standards, because "the convolution agrees with itself" is
// not evidence:
//   1. EXHAUSTIVE ENUMERATION of composeRoll. Every rng draw branched over its
//      real faces, probability carried down, totals tallied — the mechanics
//      authority's own answer, to the last bit. This is the oracle; everything
//      else is a cross-check on the cases too large to enumerate.
//   2. PUBLISHED CLOSED FORMS nobody in this repo derived: the 2d6 and 3d6
//      triangles, the 4d6-drop-lowest table every character generator prints,
//      P(max of 2d20 = k) = (2k−1)/400, d100 uniform on 1..100.
//   3. previewOf's min/avg/max, which reach the same three numbers by a
//      COMPLETELY different route (an order-statistic identity plus a
//      Poisson-binomial, versus this DP). Two surfaces of one app must not
//      disagree about the average of a pool.
//   4. Seeded Monte Carlo for the 40-die pools, where 1–3 are all out of reach.
//
// Bench (warmed, method printed with the numbers):
//   node tests/sumread.test.mjs --bench

import assert from 'node:assert/strict';
import { sumForecast, sumAtLeast, sumAtMost, previewOf, countingPmfs, SUM_REFUSALS } from '../js/odds.js';
import { composeRoll, validateMods } from '../js/rollspec.js';
import { parseNotation } from '../js/notation.js';
import { SYSTEMS } from '../js/meanings.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};
const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) < tol, `${a} !~ ${b} (tol ${tol})`);

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const spec = (s) => {
  const r = parseNotation(s);
  assert.ok(r.ok, `'${s}' should parse (got: ${r.error})`);
  return r;
};
const fcOf = (s) => { const r = spec(s); return sumForecast(r.spec.dice, r.spec.mods); };

// ---------------------------------------------------------------------------
// THE ORACLE. Same construction as tests/odds.test.mjs's `enumerate`, carrying
// the whole distribution instead of three summary numbers: each unknown draw's
// face set is DISCOVERED by probing it with 0 and 1−ε, then branched over the
// real faces, so caps, ties, sort stability and the explosion chain are
// captured mechanically rather than re-derived. Only faces that can branch
// further do (a 6 on a d6! costs another subtree; a 5 does not), which is why
// exploding pools stay enumerable at all.
const enumerateDist = (dice, mods) => {
  const drive = (prefix, probe) => {
    let i = 0;
    const rng = () => (i < prefix.length ? prefix[i++] : (i++, probe));
    const res = composeRoll(dice, mods, rng);
    return { res, draws: i };
  };
  const dist = new Map();
  let leaves = 0;
  const walk = (prefix, prob) => {
    const lo = drive(prefix, 0);
    if (lo.draws <= prefix.length) {
      leaves++;
      dist.set(lo.res.total, (dist.get(lo.res.total) || 0) + prob);
      return;
    }
    const hi = drive(prefix, 1 - Number.EPSILON);
    const vLo = lo.res.values[prefix.length];
    const vHi = hi.res.values[prefix.length];
    const faces = vLo === 0 && vHi === 90 ? 10 : vHi; // d10x reads 0..90 by tens
    for (let f = 0; f < faces; f++) walk([...prefix, (f + 0.5) / faces], prob / faces);
  };
  walk([], 1);
  return { dist, leaves };
};

const asMap = (fc) => new Map(fc.values.map((v, i) => [v, fc.probs[i]]));

const matchEnum = (name, dice, mods) => {
  t(`enum ${name}`, () => {
    const fc = sumForecast(dice, mods);
    assert.equal(fc.exact, true, `expected an exact forecast, got ${fc.refusal && fc.refusal.code}`);
    const { dist } = enumerateDist(dice, mods);
    const got = asMap(fc);
    const keys = new Set([...dist.keys(), ...got.keys()]);
    for (const v of keys) {
      const a = dist.get(v) || 0;
      const b = got.get(v) || 0;
      // The slack is the ENUMERATOR's, not the forecast's: it sums one term
      // per leaf, so a 160k-leaf tree carries a few ulps of its own.
      assert.ok(Math.abs(a - b) < 1e-12 + 1e-10 * a, `${name}: P(total=${v}) enumerated ${a} but forecast ${b}`);
    }
    // …and the derived reads off the same vector.
    const p = previewOf(dice, mods);
    assert.equal(fc.min, p.min, `${name}: min`);
    assert.equal(fc.max, p.max, `${name}: max`);
    close(fc.mean, p.avg, 1e-9);
  });
};

// --- 1. against exhaustive enumeration of composeRoll -----------------------
matchEnum('1d6', ['d6'], null);
matchEnum('2d6', ['d6', 'd6'], null);
matchEnum('3d6', ['d6', 'd6', 'd6'], null);
matchEnum('1d6+1d4 mixed', ['d6', 'd4'], null);
matchEnum('d100', ['d10x', 'd10'], null);
matchEnum('modifier rides along', ['d6', 'd6'], { modifier: -2 });
matchEnum('1d20 adv', ['d20'], { adv: 'adv' });
matchEnum('1d20 dis', ['d20'], { adv: 'dis' });
matchEnum('2d20 adv', ['d20', 'd20'], { adv: 'adv' });
matchEnum('2d6 ro<=2', ['d6', 'd6'], { reroll: { below: 2 } });
matchEnum('1d10x ro<=5 (the zero face rerolls)', ['d10x'], { reroll: { below: 5 } });
matchEnum('1d4 ro<=9 (every face rerolls)', ['d4'], { reroll: { below: 9 } });
matchEnum('1d20 adv ro<=2', ['d20'], { adv: 'adv', reroll: { below: 2 } });
// keep/drop, all four verbs, both ends
matchEnum('4d6dl1', ['d6', 'd6', 'd6', 'd6'], { keep: { mode: 'dl', n: 1 } });
matchEnum('3d6 kh1', ['d6', 'd6', 'd6'], { keep: { mode: 'kh', n: 1 } });
matchEnum('3d6 kh2', ['d6', 'd6', 'd6'], { keep: { mode: 'kh', n: 2 } });
matchEnum('3d6 kl2', ['d6', 'd6', 'd6'], { keep: { mode: 'kl', n: 2 } });
matchEnum('3d6 dh1', ['d6', 'd6', 'd6'], { keep: { mode: 'dh', n: 1 } });
matchEnum('3d6 dl2', ['d6', 'd6', 'd6'], { keep: { mode: 'dl', n: 2 } });
matchEnum('5d4 kh2', Array(5).fill('d4'), { keep: { mode: 'kh', n: 2 } });
matchEnum('5d4 kl3', Array(5).fill('d4'), { keep: { mode: 'kl', n: 3 } });
matchEnum('5d4 dh2', Array(5).fill('d4'), { keep: { mode: 'dh', n: 2 } });
matchEnum('6d4 dl1 (keep 5 of 6 — the DP’s wide end)', Array(6).fill('d4'), { keep: { mode: 'dl', n: 1 } });
matchEnum('4d10x kh2 (a keep over the gapped lattice)', Array(4).fill('d10x'), { keep: { mode: 'kh', n: 2 } });
matchEnum('2d6 ro<=1 kh1', ['d6', 'd6'], { reroll: { below: 1 }, keep: { mode: 'kh', n: 1 } });
matchEnum('2d20 adv kh1 (one population, both mechanics)', Array(2).fill('d20'), { adv: 'adv', keep: { mode: 'kh', n: 1 } });
// explosion
matchEnum('1d6!', ['d6'], { explode: true });
matchEnum('2d4!', ['d4', 'd4'], { explode: true });
matchEnum('3d4!', Array(3).fill('d4'), { explode: true });
matchEnum('1d6+1d4 ! mixed types', ['d6', 'd4'], { explode: true });
matchEnum('1d10x ! (d10x never explodes)', ['d10x'], { explode: true });
matchEnum('2d4 ro<=1 !', ['d4', 'd4'], { reroll: { below: 1 }, explode: true });
// explosion + keep, single population
matchEnum('3d4 dl1 !', Array(3).fill('d4'), { keep: { mode: 'dl', n: 1 }, explode: true });
matchEnum('3d4 kh1 !', Array(3).fill('d4'), { keep: { mode: 'kh', n: 1 }, explode: true });
matchEnum('3d4 kl1 ! (the max face is placed LAST)', Array(3).fill('d4'), { keep: { mode: 'kl', n: 1 }, explode: true });
matchEnum('3d4 dh1 !', Array(3).fill('d4'), { keep: { mode: 'dh', n: 1 }, explode: true });
matchEnum('4d4 kh3 ! (three kept bursts at once)', Array(4).fill('d4'), { keep: { mode: 'kh', n: 3 }, explode: true });
matchEnum('5d4 kh2 !', Array(5).fill('d4'), { keep: { mode: 'kh', n: 2 }, explode: true });
matchEnum('5d4 kl2 !', Array(5).fill('d4'), { keep: { mode: 'kl', n: 2 }, explode: true });
matchEnum('5d4 dh2 !', Array(5).fill('d4'), { keep: { mode: 'dh', n: 2 }, explode: true });
matchEnum('5d4 dl2 !', Array(5).fill('d4'), { keep: { mode: 'dl', n: 2 }, explode: true });
matchEnum('4d6 kh2 !', Array(4).fill('d6'), { keep: { mode: 'kh', n: 2 }, explode: true });
matchEnum('3d4 dl1 ! +2 (the modifier lands once, after everything)', Array(3).fill('d4'), { keep: { mode: 'dl', n: 1 }, explode: true, modifier: 2 });
// ADVANTAGE WITH EXPLOSION — the case POOL-ANALYSIS §6.3 lists as a gap.
matchEnum('1d20 adv !', ['d20'], { adv: 'adv', explode: true });
matchEnum('1d20 dis !', ['d20'], { adv: 'dis', explode: true });
matchEnum('1d20+1d4 adv !', ['d20', 'd4'], { adv: 'adv', explode: true });

// --- 2. against published closed forms --------------------------------------
const vec = (fc, lo, counts, denom) => {
  const got = asMap(fc);
  counts.forEach((c, i) => close(got.get(lo + i) || 0, c / denom, 1e-12));
  assert.equal(fc.values.length, counts.filter((c) => c > 0).length);
};

t('2d6 is the 1..6..1 triangle over 36', () => {
  vec(sumForecast(['d6', 'd6'], null), 2, [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1], 36);
});
t('3d6 is the published 216ths', () => {
  vec(sumForecast(Array(3).fill('d6'), null), 3,
    [1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1], 216);
});
t('4d6 drop lowest is the character-generation table over 1296', () => {
  // The table every 4d6dl1 generator prints; its mean is the 15869/1296 that
  // tests/odds.test.mjs already pins for previewOf, reached here by a
  // different algorithm.
  const counts = [1, 4, 10, 21, 38, 62, 91, 122, 148, 167, 172, 160, 131, 94, 54, 21];
  assert.equal(counts.reduce((a, b) => a + b, 0), 1296);
  const fc = sumForecast(Array(4).fill('d6'), { keep: { mode: 'dl', n: 1 } });
  vec(fc, 3, counts, 1296);
  close(fc.mean, 15869 / 1296, 1e-12);
  assert.deepEqual(fc.mode, { value: 13, p: 172 / 1296 });
});
t('4d6 keep highest 3 is the same table — one roll, two spellings', () => {
  const a = sumForecast(Array(4).fill('d6'), { keep: { mode: 'dl', n: 1 } });
  const b = sumForecast(Array(4).fill('d6'), { keep: { mode: 'kh', n: 3 } });
  assert.deepEqual(a.values, b.values);
  a.probs.forEach((p, i) => close(p, b.probs[i], 1e-15));
});
t('1d20 adv is P(k) = (2k−1)/400, dis is its mirror', () => {
  const adv = asMap(sumForecast(['d20'], { adv: 'adv' }));
  const dis = asMap(sumForecast(['d20'], { adv: 'dis' }));
  for (let k = 1; k <= 20; k++) {
    close(adv.get(k), (2 * k - 1) / 400, 1e-15);
    close(dis.get(k), (2 * (21 - k) - 1) / 400, 1e-15);
  }
});
t('d100 is uniform on 1..100 — the d10x lattice lands between the d10s', () => {
  const fc = sumForecast(['d10x', 'd10'], null);
  assert.equal(fc.values.length, 100);
  assert.deepEqual([fc.min, fc.max], [1, 100]);
  fc.probs.forEach((p) => close(p, 0.01, 1e-15));
});
t('1d6! skips 6, 12 and 18 — a max face never stands alone', () => {
  const fc = sumForecast(['d6'], { explode: true });
  for (const gap of [6, 12, 18]) assert.ok(!fc.values.includes(gap), `${gap} should be unreachable`);
  assert.deepEqual([fc.min, fc.max, fc.values.length], [1, 24, 21]);
  close(fc.mean, 3.5 * 259 / 216, 1e-12);
});
t('2d20 kh1 IS advantage — the parser collapses it and the math agrees', () => {
  const glued = spec('2d20kh1');
  assert.equal(glued.canonical, '1d20 adv');
  const a = sumForecast(glued.spec.dice, glued.spec.mods);
  const b = sumForecast(spec('2d20 kh1').spec.dice, spec('2d20 kh1').spec.mods);
  assert.deepEqual(a.values, b.values);
  a.probs.forEach((p, i) => close(p, b.probs[i], 1e-15));
});

// --- 3. every exact forecast agrees with previewOf ---------------------------
// previewOf reaches min/avg/max through composeRoll drives, an order-statistic
// IDENTITY and a Poisson-binomial; sumForecast reaches them through a
// convolution and a face DP. Nothing is shared but the per-die pmfs, so an
// agreement here is two derivations meeting, not one repeated.
const agrees = (name, dice, mods) => {
  t(`agrees with previewOf: ${name}`, () => {
    const fc = sumForecast(dice, mods);
    const p = previewOf(dice, mods);
    assert.equal(fc.exact, true, `expected exact, got ${fc.refusal && fc.refusal.code}`);
    assert.equal(p.exact, true, 'previewOf disagrees about the tier');
    assert.equal(fc.min, p.min, 'min');
    assert.equal(fc.max, p.max, 'max');
    close(fc.mean, p.avg, 1e-9);
    close(fc.probs.reduce((a, b) => a + b, 0), 1, 1e-9);
  });
};
agrees('40d20', Array(40).fill('d20'), null);
agrees('40d10x', Array(40).fill('d10x'), null);
agrees('40d20!  (explosion void at the cap)', Array(40).fill('d20'), { explode: true });
agrees('40d20 adv (pairs zero)', Array(40).fill('d20'), { adv: 'adv' });
agrees('40d6 ro<=3 (reroll void)', Array(40).fill('d6'), { reroll: { below: 3 } });
agrees('20d20 adv (pairs twenty, cap exactly full)', Array(20).fill('d20'), { adv: 'adv' });
agrees('20d20 adv ! (advantage spends the last slot)', Array(20).fill('d20'), { adv: 'adv', explode: true });
agrees('21d20 adv (19 paired, 2 plain)', Array(21).fill('d20'), { adv: 'adv' });
agrees('40d20 kh20', Array(40).fill('d20'), { keep: { mode: 'kh', n: 20 } });
agrees('40d20 dl1', Array(40).fill('d20'), { keep: { mode: 'dl', n: 1 } });
agrees('40d20 kl20', Array(40).fill('d20'), { keep: { mode: 'kl', n: 20 } });
agrees('40d20 dh1', Array(40).fill('d20'), { keep: { mode: 'dh', n: 1 } });
agrees('40d10x kh20', Array(40).fill('d10x'), { keep: { mode: 'kh', n: 20 } });
agrees('40d6 kh1', Array(40).fill('d6'), { keep: { mode: 'kh', n: 1 } });
agrees('10d20 kh3', Array(10).fill('d20'), { keep: { mode: 'kh', n: 3 } });
agrees('15d6 ro<=2', Array(15).fill('d6'), { reroll: { below: 2 } });
agrees('9d20 ! (27 children fit in 31 slots)', Array(9).fill('d20'), { explode: true });
agrees('6d6!', Array(6).fill('d6'), { explode: true });
agrees('10d6 dl1 !', Array(10).fill('d6'), { keep: { mode: 'dl', n: 1 }, explode: true });
agrees('1d6 kh5 (composeRoll’s clamp drops every die)', ['d6'], { keep: { mode: 'kh', n: 5 } });
agrees('the empty pool is its modifier', [], { modifier: 3 });

t('every exact forecast is a probability distribution', () => {
  for (const [dice, mods] of [
    [Array(40).fill('d20'), null], [Array(40).fill('d10x'), null],
    [Array(40).fill('d20'), { keep: { mode: 'kh', n: 20 } }],
    [Array(40).fill('d20'), { keep: { mode: 'dl', n: 1 } }],
    [Array(9).fill('d20'), { explode: true }],
  ]) {
    const fc = sumForecast(dice, mods);
    close(fc.probs.reduce((a, b) => a + b, 0), 1, 1e-9);
    fc.probs.forEach((p) => assert.ok(p > 0, 'no zero-probability totals in the support'));
    for (let i = 1; i < fc.values.length; i++) assert.ok(fc.values[i] > fc.values[i - 1], 'ascending');
    close(fc.cdf[fc.cdf.length - 1], 1, 1e-9);
    assert.equal(fc.mode.p, Math.max(...fc.probs));
  }
});

// --- 4. seeded Monte Carlo, where the other three cannot reach ---------------
const matchMC = (name, dice, mods, N = 60000) => {
  t(`mc ${name}`, () => {
    const fc = sumForecast(dice, mods);
    assert.equal(fc.exact, true);
    const rng = mulberry32(20260816);
    const tally = new Map();
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < N; i++) {
      const { total } = composeRoll(dice, mods, rng);
      tally.set(total, (tally.get(total) || 0) + 1);
      sum += total; sq += total * total;
      assert.ok(total >= fc.min && total <= fc.max, `${total} outside [${fc.min}, ${fc.max}]`);
    }
    const mean = sum / N;
    const sd = Math.sqrt(Math.max(0, sq / N - mean * mean));
    close(fc.mean, mean, 6 * sd / Math.sqrt(N) + 1e-9);
    close(fc.sd, sd, 0.25 * Math.max(1, sd));
    // Every bucket within a 5σ binomial band — a shifted or mis-shaped curve
    // fails here even when the mean happens to survive.
    const got = asMap(fc);
    for (const [v, c] of tally) {
      const p = got.get(v) || 0;
      const band = 5 * Math.sqrt(Math.max(p, 1e-6) * (1 - p) / N) + 1e-9;
      assert.ok(Math.abs(c / N - p) < band, `${name}: P(${v}) forecast ${p}, observed ${c / N}`);
    }
  });
};
matchMC('20d6', Array(20).fill('d6'), null);
matchMC('10d20 kh3', Array(10).fill('d20'), { keep: { mode: 'kh', n: 3 } });
matchMC('8d6 dl2', Array(8).fill('d6'), { keep: { mode: 'dl', n: 2 } });
matchMC('8d6 kl3', Array(8).fill('d6'), { keep: { mode: 'kl', n: 3 } });
matchMC('8d6 dh2', Array(8).fill('d6'), { keep: { mode: 'dh', n: 2 } });
matchMC('5d20 adv ro<=2', Array(5).fill('d20'), { adv: 'adv', reroll: { below: 2 } });
matchMC('6d6!', Array(6).fill('d6'), { explode: true });
matchMC('6d6 dl2 !', Array(6).fill('d6'), { keep: { mode: 'dl', n: 2 }, explode: true });
matchMC('9d10x kh4', Array(9).fill('d10x'), { keep: { mode: 'kh', n: 4 } });
matchMC('12d20 adv kh5', Array(12).fill('d20'), { adv: 'adv', keep: { mode: 'kh', n: 5 } });

// --- THE REFUSALS -----------------------------------------------------------
const refuses = (name, dice, mods, code) => {
  t(`refuses ${name}`, () => {
    const fc = sumForecast(dice, mods);
    assert.equal(fc.exact, false, `${name} should refuse`);
    assert.equal(fc.kind, 'sum', 'a refusal is still a sum read — see the note in js/odds.js');
    assert.equal(fc.refusal.code, code);
    assert.equal(fc.refusal.reason, SUM_REFUSALS[code]);
    assert.deepEqual(fc.values, []);
    assert.equal(fc.min, null);
    assert.equal(sumAtLeast(fc, 10), null, 'a refused forecast answers no odds question');
    assert.equal(sumAtMost(fc, 10), null);
  });
};

// mixed-keep: keep/drop needs one exchangeable population.
refuses('8d8+2d20 kh4', [...Array(8).fill('d8'), 'd20', 'd20'], { keep: { mode: 'kh', n: 4 } }, 'mixed-keep');
refuses('1d20+1d6 dl1', ['d20', 'd6'], { keep: { mode: 'dl', n: 1 } }, 'mixed-keep');
refuses('d100 kh1 (d10x and d10 are two lattices)', ['d10x', 'd10'], { keep: { mode: 'kh', n: 1 } }, 'mixed-keep');
refuses('12d6+2d20 kh4 !', [...Array(12).fill('d6'), 'd20', 'd20'], { keep: { mode: 'kh', n: 4 }, explode: true }, 'mixed-keep');

t('mixed-keep catches ONE TYPE, TWO DISTRIBUTIONS — the doc’s type test does not', () => {
  // POOL-ANALYSIS §6.3 proposes `new Set(spec.dice).size === 1` as the guard.
  // 21 d20s under advantage pair only 19 of themselves (the 40-die cap runs
  // out), so two dice roll a plain d20 while nineteen roll max-of-two — one
  // type, two populations. The type test waves it through; the pmf test does
  // not, and the difference is a wrong curve.
  const dice = Array(21).fill('d20');
  const mods = { adv: 'adv', keep: { mode: 'kh', n: 3 } };
  assert.equal(validateMods(dice, mods), null, 'the spec is legal');
  assert.equal(new Set(dice).size, 1, 'the doc’s guard sees one type and passes');
  const fc = sumForecast(dice, mods);
  assert.equal(fc.exact, false);
  assert.equal(fc.refusal.code, 'mixed-keep');
});

// reroll-cap / explode-cap: the 40-die budget truncates by value.
refuses('30d6 ro<=3 (10 slots, 30 candidates)', Array(30).fill('d6'), { reroll: { below: 3 } }, 'reroll-cap');
refuses('19d20 adv ! (2 slots, 19 candidates)', Array(19).fill('d20'), { adv: 'adv', explode: true }, 'explode-cap');
refuses('14d6+14d20 !', [...Array(14).fill('d6'), ...Array(14).fill('d20')], { explode: true }, 'explode-cap');
refuses('20d20 !', Array(20).fill('d20'), { explode: true }, 'explode-cap');

t('the cap corners that are exact are NOT refused', () => {
  // Each of these looks like a refusal and is not: the cap zeroes the mechanic
  // for every outcome, which is exact with the mechanic ignored.
  for (const [name, dice, mods] of [
    ['40d20!', Array(40).fill('d20'), { explode: true }],
    ['40d20 adv', Array(40).fill('d20'), { adv: 'adv' }],
    ['40d6 ro<=3', Array(40).fill('d6'), { reroll: { below: 3 } }],
    ['20d20 adv !', Array(20).fill('d20'), { adv: 'adv', explode: true }],
    ['40d10x !', Array(40).fill('d10x'), { explode: true }],
  ]) assert.equal(sumForecast(dice, mods).exact, true, `${name} should be exact`);
});

t('every exact forecast is one previewOf also calls exact', () => {
  // The relation that keeps the two reads honest: this engine refuses a
  // superset of what previewOf samples, never the other way round. If it ever
  // inverts, one surface is printing a curve the other will not average.
  const rng = mulberry32(24680);
  const types = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];
  const KEEPS = ['kh', 'kl', 'dh', 'dl'];
  let checked = 0;
  for (let iter = 0; iter < 900 && checked < 400; iter++) {
    const count = 1 + Math.floor(rng() * 9);
    const dice = Array.from({ length: count }, () => types[Math.floor(rng() * types.length)]);
    const mods = {};
    if (rng() < 0.3 && dice.includes('d20')) mods.adv = rng() < 0.5 ? 'adv' : 'dis';
    if (rng() < 0.35 && count >= 2) mods.keep = { mode: KEEPS[Math.floor(rng() * 4)], n: 1 + Math.floor(rng() * (count - 1)) };
    if (rng() < 0.25) mods.reroll = { below: 1 + Math.floor(rng() * 9) };
    if (rng() < 0.25) mods.explode = true;
    if (rng() < 0.4) mods.modifier = Math.floor(rng() * 16) - 5;
    if (validateMods(dice, mods) !== null) continue;
    checked++;
    const fc = sumForecast(dice, mods);
    const p = previewOf(dice, mods);
    if (!fc.exact) { assert.ok(SUM_REFUSALS[fc.refusal.code], 'a typed refusal'); continue; }
    assert.equal(p.exact, true, `${dice} ${JSON.stringify(mods)}: forecast exact, preview sampled`);
    assert.equal(fc.min, p.min, `${dice} ${JSON.stringify(mods)}: min`);
    assert.equal(fc.max, p.max, `${dice} ${JSON.stringify(mods)}: max`);
    close(fc.mean, p.avg, 1e-9);
    close(fc.probs.reduce((a, b) => a + b, 0), 1, 1e-9);
    for (let k = 0; k < 30; k++) {
      const { total } = composeRoll(dice, mods, rng);
      assert.ok((asMap(fc).get(total) || 0) > 0, `${dice} ${JSON.stringify(mods)}: rolled ${total}, forecast gives it zero mass`);
    }
  }
  assert.ok(checked >= 300, `only ${checked} valid specs generated`);
});

// --- the target reads -------------------------------------------------------
t('sumAtLeast / sumAtMost read the cdf', () => {
  const fc = sumForecast(['d20'], null);
  close(sumAtLeast(fc, 15), 6 / 20, 1e-12);
  close(sumAtLeast(fc, 1), 1, 1e-12);
  close(sumAtLeast(fc, 21), 0, 1e-12);
  close(sumAtMost(fc, 20), 1, 1e-12);
  close(sumAtMost(fc, 0), 0, 1e-12);
  close(sumAtMost(fc, 10), 10 / 20, 1e-12);
  const adv = sumForecast(['d20'], { adv: 'adv' });
  close(sumAtLeast(adv, 15), (400 - 14 * 14) / 400, 1e-12); // 1 − P(both < 15)
  const two = sumForecast(['d6', 'd6'], null);
  close(sumAtLeast(two, 7), 21 / 36, 1e-12);
  close(sumAtLeast(two, 8) + sumAtMost(two, 7), 1, 1e-12);
  // The gapped lattice: a threshold that falls in a hole still reads right.
  const boom = sumForecast(['d6'], { explode: true });
  close(sumAtLeast(boom, 6), sumAtLeast(boom, 7), 1e-15);
  close(sumAtLeast(boom, 7), 1 / 6, 1e-12);
});

t('a 4d6dl1 shelf beats a 3d6 shelf at every threshold', () => {
  const a = sumForecast(Array(4).fill('d6'), { keep: { mode: 'dl', n: 1 } });
  const b = sumForecast(Array(3).fill('d6'), null);
  for (let dc = 3; dc <= 18; dc++) assert.ok(sumAtLeast(a, dc) >= sumAtLeast(b, dc) - 1e-15, `dc ${dc}`);
  assert.ok(a.mean > b.mean);
});

t('pure: the same spec reads identically on every call', () => {
  const a = sumForecast(Array(12).fill('d6'), { keep: { mode: 'dl', n: 2 }, modifier: 3 });
  const b = sumForecast(Array(12).fill('d6'), { keep: { mode: 'dl', n: 2 }, modifier: 3 });
  assert.deepEqual(a, b);
});

t('the modifier shifts the curve and nothing else', () => {
  const a = sumForecast(Array(3).fill('d6'), null);
  const b = sumForecast(Array(3).fill('d6'), { modifier: 7 });
  assert.deepEqual(b.values, a.values.map((v) => v + 7));
  a.probs.forEach((p, i) => close(p, b.probs[i], 1e-15));
  close(b.mean, a.mean + 7, 1e-12);
  close(b.sd, a.sd, 1e-12);
  assert.equal(b.modifier, 7);
});

// --- the profile seam -------------------------------------------------------
const tools = { sumForecast };

t('dnd and none now forecast a sum (§2l ⑥)', () => {
  for (const id of ['dnd', 'none']) {
    const fc = SYSTEMS[id].forecastFor({ dice: ['d20'], mods: { modifier: 5 } }, tools);
    assert.equal(fc.kind, 'sum');
    assert.equal(fc.exact, true);
    assert.deepEqual([fc.min, fc.max], [6, 25]);
    close(fc.mean, 15.5, 1e-12);
  }
});

t('soul-deal still reads per die — the sum tool changes nothing there', () => {
  const fc = SYSTEMS['soul-deal'].forecastFor({ dice: ['d6', 'd6'], mods: null }, { ...tools, countingPmfs });
  assert.equal(fc.kind, 'per-die');
});

t('a sum profile without the tool returns null, and never throws', () => {
  // js/main.js injects `countingPmfs` only until the rendering pass lands.
  // The seam has to be silent, not fatal.
  for (const id of ['dnd', 'none']) {
    assert.equal(SYSTEMS[id].forecastFor({ dice: ['d20'], mods: null }, {}), null);
    assert.equal(SYSTEMS[id].forecastFor({ dice: ['d20'], mods: null }, { countingPmfs: () => {} }), null);
  }
});

t('a sum profile forecasts nothing for an empty pool', () => {
  for (const id of ['dnd', 'none']) {
    assert.equal(SYSTEMS[id].forecastFor({ dice: [], mods: null }, tools), null);
    assert.equal(SYSTEMS[id].forecastFor(null, tools), null);
  }
});

t('a refused sum keeps kind:"sum", so the min/avg/max line survives it', () => {
  // js/main.js prints `fc.reason` INSTEAD of the preview line for
  // kind:'refusal'. A sum refusal that borrowed that kind would delete a
  // working read (previewOf is still exact for 8d8+2d20 kh4's average) to
  // print a sentence about the curve. The refusal rides inside the sum.
  const fc = SYSTEMS.dnd.forecastFor({ dice: [...Array(8).fill('d8'), 'd20', 'd20'], mods: { keep: { mode: 'kh', n: 4 } } }, tools);
  assert.equal(fc.kind, 'sum');
  assert.notEqual(fc.kind, 'refusal');
  assert.equal(fc.refusal.code, 'mixed-keep');
  assert.equal(previewOf([...Array(8).fill('d8'), 'd20', 'd20'], { keep: { mode: 'kh', n: 4 } }).exact, true);
});

// --- the bench --------------------------------------------------------------
// Warmed, because POOL-ANALYSIS §6.1's two published timings were not and
// their ordering was impossible as a result. Method: 40 warm-up calls to let
// the JIT settle and the shapes stabilise, then 5 batches of 10 timed calls,
// reporting the FASTEST batch mean — the batch least disturbed by GC.
function bench() {
  const cases = [
    ['40d20', Array(40).fill('d20'), null],
    ['40d10x', Array(40).fill('d10x'), null],
    ['40d6', Array(40).fill('d6'), null],
    ['40d20 kh20', Array(40).fill('d20'), { keep: { mode: 'kh', n: 20 } }],
    ['40d20 dl1', Array(40).fill('d20'), { keep: { mode: 'dl', n: 1 } }],
    ['40d20 kl20', Array(40).fill('d20'), { keep: { mode: 'kl', n: 20 } }],
    ['40d20 dh1', Array(40).fill('d20'), { keep: { mode: 'dh', n: 1 } }],
    ['40d10x kh20', Array(40).fill('d10x'), { keep: { mode: 'kh', n: 20 } }],
    ['40d10x dl1', Array(40).fill('d10x'), { keep: { mode: 'dl', n: 1 } }],
    ['40d6 dl1', Array(40).fill('d6'), { keep: { mode: 'dl', n: 1 } }],
    ['9d20 !', Array(9).fill('d20'), { explode: true }],
    ['10d6 dl1 !', Array(10).fill('d6'), { keep: { mode: 'dl', n: 1 }, explode: true }],
    ['1d20 (the everyday case)', ['d20'], { modifier: 5 }],
    ['4d6dl1', Array(4).fill('d6'), { keep: { mode: 'dl', n: 1 } }],
  ];
  console.log('\nsumForecast, warmed: 40 warm-up calls, then min over 5 batches of 10');
  console.log(`node ${process.version} · ${process.platform}`);
  for (const [name, dice, mods] of cases) {
    for (let i = 0; i < 40; i++) sumForecast(dice, mods);
    let best = Infinity;
    for (let b = 0; b < 5; b++) {
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 10; i++) sumForecast(dice, mods);
      const dt = Number(process.hrtime.bigint() - t0) / 10 / 1e6;
      if (dt < best) best = dt;
    }
    const fc = sumForecast(dice, mods);
    console.log(`  ${name.padEnd(26)} ${best.toFixed(3).padStart(8)} ms   ${fc.exact ? `${fc.values.length} totals` : `refused (${fc.refusal.code})`}`);
  }
}

if (process.argv.includes('--bench')) bench();
console.log(process.exitCode ? `${n} tests, FAILURES above` : `all ${n} sum-read tests pass`);
