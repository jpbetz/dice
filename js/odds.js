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

// Exact min/avg/max for a roll spec — the honesty pass (ROADMAP §2l ①,
// docs/POOL-ANALYSIS.md §6). Replaces the Monte-Carlo preview in every
// rendered surface: previewSpec at 800 samples was wrong at both ends for
// any pool past 3d6 (9d6: never right), and it jittered on every repaint.
//
// composeRoll is the semantic authority throughout. min and max come from
// driving it with pinned rngs; sampling drives it directly; the exact path
// mirrors its order of operations (adv pairs → rerolls → keep/drop →
// explosions). Keep the mirror in sync with any mechanics change there.
//
// The 40-die cap decides how honest we can be. Each capped mechanic is
// classified per spec:
//   VOID    — the cap zeroes it for every outcome ('40d20!' spawns nothing);
//             exact, with the mechanic ignored.
//   FREE    — the cap can never bind (every possible push fits); exact via
//             per-die pmfs, a tie-proof order-statistic identity for
//             keep/drop, and closed-form explosion chains.
//   BINDING — whether the cap bites depends on rolled values, which breaks
//             per-die independence (which die loses its reroll slot depends
//             on every earlier die). previewOf then returns exact:false and
//             seeded sampling; the display layer labels the line. Seeded
//             from the spec so two seats read identical numbers and the
//             line never jitters across keystrokes.

import { DIE_MAX, MAX_PHYSICAL_DICE, EXPLODE_CHAIN_CAP, composeRoll } from './rollspec.js';

const SAMPLES = 4000;

export function facesOf(type) {
  const out = [];
  if (type === 'd10x') { for (let v = 0; v <= 90; v += 10) out.push(v); return out; }
  for (let v = 1; v <= DIE_MAX[type]; v++) out.push(v);
  return out;
}

// pmfs are Map(value → probability) over a die's counting result.
function plainPmf(type) {
  const faces = facesOf(type);
  const q = new Map();
  for (const v of faces) q.set(v, 1 / faces.length);
  return q;
}

// Resolved value of an advantage pair: max (adv) / min (dis) of two d20.
function advPairPmf(kind) {
  const q = new Map();
  for (let k = 1; k <= 20; k++) q.set(k, (kind === 'adv' ? 2 * k - 1 : 41 - 2 * k) / 400);
  return q;
}

// Reroll-once transform: values at or below the threshold are replaced by
// one plain die of the same type; the replacement is never re-checked.
function rerollOnce(q, type, below) {
  const faces = facesOf(type);
  let pRe = 0;
  for (const [v, p] of q) if (v <= below) pRe += p;
  if (pRe === 0) return q;
  const out = new Map();
  for (const [v, p] of q) if (v > below) out.set(v, p);
  const u = pRe / faces.length;
  for (const v of faces) out.set(v, (out.get(v) || 0) + u);
  return out;
}

function meanOf(q) {
  let s = 0;
  for (const [v, p] of q) s += v * p;
  return s;
}

// Distribution of N = how many of the independent events with probabilities
// ps occur (Poisson binomial): dp[c] = P(N = c).
function pbDist(ps) {
  let dp = [1];
  for (const p of ps) {
    const next = new Array(dp.length + 1).fill(0);
    for (let c = 0; c < dp.length; c++) {
      next[c] += dp[c] * (1 - p);
      next[c + 1] += dp[c] * p;
    }
    dp = next;
  }
  return dp;
}

// E[sum of the k largest of independent dice with pmfs qs], via the
// order-statistic identity  top_k = Σ_{t≥1} min(k, #{X_i ≥ t}).  Exact for
// mixed types, and tie-proof: the kept MULTISET is invariant under sort
// stability even though kept indices are not.
function eTopK(qs, k) {
  if (k <= 0) return 0;
  let vmax = 0;
  for (const q of qs) for (const v of q.keys()) if (v > vmax) vmax = v;
  let e = 0;
  for (let t = 1; t <= vmax; t++) {
    const ps = qs.map((q) => {
      let s = 0;
      for (const [v, p] of q) if (v >= t) s += p;
      return s;
    });
    const dp = pbDist(ps);
    for (let c = 1; c < dp.length; c++) e += Math.min(k, c) * dp[c];
  }
  return e;
}

// Expected value added by one explosion chain, given its parent rolled max:
// the first child always lands, each deeper link needs another max.
function chainE(type) {
  const F = facesOf(type).length;
  let s = 0;
  let p = 1;
  for (let c = 0; c < EXPLODE_CHAIN_CAP; c++) { s += p; p /= F; }
  return meanOf(plainPmf(type)) * s;
}

// How many of m at-max dice survive keep/drop, out of L counting dice with
// n already clamped composeRoll-style. At-max dice sort last, so kh keeps
// them first and dl drops them last.
function keptAtMax(mode, n, L, m) {
  switch (mode) {
    case 'kh': return Math.min(n, m);
    case 'kl': return Math.max(0, n - (L - m));
    case 'dl': return Math.min(m, L - n);
    case 'dh': return Math.max(0, m - n);
  }
  return 0;
}

function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// → {min, avg, max, exact}, modifier included in all three. min is the true
// floor in every tier (all-min triggers rerolls whose replacements are also
// min, spawns no explosions, and keep totals are monotone in every die).
// max from the all-max drive is exact only outside BINDING: under
// truncation, which die gets the last cap slot depends on values, and
// spending a small die's slot on a bigger type can beat all-max.
export function previewOf(dice, mods) {
  const m = mods || {};
  const modifier = m.modifier || 0;
  const len0 = dice.length;
  const min = composeRoll(dice, m, () => 0).total;
  const simMax = composeRoll(dice, m, () => 1 - Number.EPSILON).total;

  const d20s = dice.reduce((s, t) => s + (t === 'd20' ? 1 : 0), 0);
  const pairs = m.adv ? Math.min(d20s, Math.max(0, MAX_PHYSICAL_DICE - len0)) : 0;
  const lenA = len0 + pairs;

  let rerollTier = 'absent';
  if (m.reroll) {
    const slots = MAX_PHYSICAL_DICE - lenA;
    rerollTier = slots <= 0 ? 'void' : len0 <= slots ? 'free' : 'binding';
  }

  let keepN = 0;
  let keptCount = len0;
  if (m.keep) {
    keepN = Math.min(m.keep.n, len0 - 1);
    keptCount = m.keep.mode === 'kh' || m.keep.mode === 'kl' ? keepN : len0 - keepN;
  }

  let explodeTier = 'absent';
  if (m.explode) {
    const nonX = dice.reduce((s, t) => s + (t === 'd10x' ? 0 : 1), 0);
    const eligible = m.keep ? Math.min(keptCount, nonX) : nonX;
    const slotsMax = MAX_PHYSICAL_DICE - lenA;
    const slotsMin = slotsMax - (rerollTier === 'free' ? len0 : 0);
    explodeTier = slotsMax <= 0 || eligible === 0 ? 'void'
      : EXPLODE_CHAIN_CAP * eligible <= slotsMin ? 'free' : 'binding';
  }

  // Mixed-type keep + explode: which types explode depends on cross-type
  // tie-breaking under sort stability — refused rather than hand-derived.
  const mixedKeepExplode = m.keep && explodeTier === 'free' && new Set(dice).size > 1;
  const exact = rerollTier !== 'binding' && explodeTier !== 'binding' && !mixedKeepExplode;

  if (!exact) {
    const rng = mulberry32(hashStr(dice.join(',') + '|' + JSON.stringify(mods ?? null)));
    let sum = 0;
    let smax = -Infinity;
    for (let s = 0; s < SAMPLES; s++) {
      const { total } = composeRoll(dice, m, rng);
      sum += total;
      if (total > smax) smax = total;
    }
    return { min, avg: sum / SAMPLES, max: Math.max(simMax, smax), exact: false };
  }

  // Per-original-die counting pmf: composeRoll pairs the first d20s in list
  // order, resolves each pair to one counting value, then rerolls counting
  // dice — winners included.
  let advLeft = pairs;
  const qs = dice.map((t) => {
    let q;
    if (t === 'd20' && advLeft > 0) { advLeft--; q = advPairPmf(m.adv); } else q = plainPmf(t);
    if (rerollTier === 'free') q = rerollOnce(q, t, m.reroll.below);
    return q;
  });

  let avg;
  if (m.keep) {
    const totalMean = qs.reduce((s, q) => s + meanOf(q), 0);
    switch (m.keep.mode) {
      case 'kh': avg = eTopK(qs, keepN); break;
      case 'kl': avg = totalMean - eTopK(qs, len0 - keepN); break;
      case 'dl': avg = eTopK(qs, len0 - keepN); break;
      default: avg = totalMean - eTopK(qs, keepN); break; // dh
    }
  } else {
    avg = qs.reduce((s, q) => s + meanOf(q), 0);
  }

  if (explodeTier === 'free') {
    if (!m.keep) {
      avg += qs.reduce((s, q, i) => (dice[i] === 'd10x' ? s
        : s + (q.get(DIE_MAX[dice[i]]) || 0) * chainE(dice[i])), 0);
    } else {
      // Single type here (mixed refused above): only kept dice explode, and
      // the count of kept at-max dice is tie-invariant.
      const t = dice[0];
      const dp = pbDist(qs.map((q) => q.get(DIE_MAX[t]) || 0));
      let atMax = 0;
      for (let c = 1; c < dp.length; c++) atMax += keptAtMax(m.keep.mode, keepN, len0, c) * dp[c];
      avg += atMax * chainE(t);
    }
  }

  return { min, avg: avg + modifier, max: simMax, exact: true };
}
