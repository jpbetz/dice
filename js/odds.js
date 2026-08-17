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

// Per-original-die counting pmf plus the cap facts it depends on. variant
// records the advantage split ('adv'/'dis' on paired d20s, 'plain' on the
// unpaired remainder of an adv pool) so per-die consumers can keep mixture
// bars apart — above 20 d20s only some dice get partners.
function buildCounting(dice, m) {
  const len0 = dice.length;
  const d20s = dice.reduce((s, t) => s + (t === 'd20' ? 1 : 0), 0);
  const pairs = m.adv ? Math.min(d20s, Math.max(0, MAX_PHYSICAL_DICE - len0)) : 0;
  const lenA = len0 + pairs;
  let rerollTier = 'absent';
  if (m.reroll) {
    const slots = MAX_PHYSICAL_DICE - lenA;
    rerollTier = slots <= 0 ? 'void' : len0 <= slots ? 'free' : 'binding';
  }
  let advLeft = pairs;
  const entries = dice.map((t) => {
    let q = plainPmf(t);
    let variant = null;
    if (m.adv && t === 'd20') {
      if (advLeft > 0) { advLeft--; q = advPairPmf(m.adv); variant = m.adv; } else variant = 'plain';
    }
    if (rerollTier === 'free') q = rerollOnce(q, t, m.reroll.below);
    return { q, variant };
  });
  return { pairs, lenA, rerollTier, entries };
}

// The per-die substrate for forecast reads (meanings.js gets this injected
// as a tool — it stays dependency-free). Keep is NOT applied: whether a die
// counts under keep is decided by the landing, so per-die consumers refuse
// on mods.keep before calling. exact:false = the cap truncates rerolls
// value-dependently (BINDING); the pmfs are then the untruncated transform
// and callers must refuse rather than print them.
export function countingPmfs(dice, mods) {
  const { rerollTier, entries } = buildCounting(dice, mods || {});
  return { pmfs: entries, exact: rerollTier !== 'binding' };
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

// How keep/drop lands on a pool of len0 counting dice, clamped exactly the
// way composeRoll clamps it (`Math.min(m.keep.n, idxs.length - 1)`, and
// idxs.length is always the base count — advantage kills one die per pair and
// reroll replaces one for one). keptCount is what SURVIVES, whichever verb
// spelled it: `kh 3` and `dl 1` of four dice both keep three.
function keepOf(dice, m) {
  const len0 = dice.length;
  if (!m.keep) return { keepN: 0, keptCount: len0, fromHigh: true };
  const keepN = Math.min(m.keep.n, len0 - 1);
  const high = m.keep.mode === 'kh' || m.keep.mode === 'dl';
  const keptCount = m.keep.mode === 'kh' || m.keep.mode === 'kl' ? keepN : len0 - keepN;
  return { keepN, keptCount, fromHigh: high };
}

// The cap classification for one spec — the single authority both reads
// share, so previewOf's `exact` and sumForecast's refusals can never drift
// apart into two opinions about the same pool.
function tiersOf(dice, m, built) {
  const { keepN, keptCount, fromHigh } = keepOf(dice, m);
  let explodeTier = 'absent';
  if (m.explode) {
    const nonX = dice.reduce((s, t) => s + (t === 'd10x' ? 0 : 1), 0);
    const eligible = m.keep ? Math.min(keptCount, nonX) : nonX;
    const slotsMax = MAX_PHYSICAL_DICE - built.lenA;
    const slotsMin = slotsMax - (built.rerollTier === 'free' ? dice.length : 0);
    explodeTier = slotsMax <= 0 || eligible === 0 ? 'void'
      : EXPLODE_CHAIN_CAP * eligible <= slotsMin ? 'free' : 'binding';
  }
  // Mixed-type keep + explode: which types explode depends on cross-type
  // tie-breaking under sort stability — refused rather than hand-derived.
  const mixedKeepExplode = !!m.keep && explodeTier === 'free' && new Set(dice).size > 1;
  return { keepN, keptCount, fromHigh, explodeTier, mixedKeepExplode };
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

  const built = buildCounting(dice, m);
  const { rerollTier, entries } = built;
  const { keepN, explodeTier, mixedKeepExplode } = tiersOf(dice, m, built);
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

  // composeRoll pairs the first d20s in list order, resolves each pair to
  // one counting value, then rerolls counting dice — winners included.
  const qs = entries.map((e) => e.q);

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

// ---------------------------------------------------------------------------
// THE SUM READ (ROADMAP §2l ⑥, docs/POOL-ANALYSIS.md §6.3).
//
// previewOf above answers min/avg/max for every spec. This answers the rest of
// the question — how likely is each total — which is the thing a declared
// target turns into a percentage. Under a sum profile a total IS a fact of
// play (js/meanings.js `aggregate: 'sum'`), so it gets a whole distribution.
//
// EXACT, NEVER SAMPLED. The house rule (POOL-ANALYSIS §7) is that a wrong
// number is worse than an absent one, so where the math runs out this refuses
// in writing rather than approximating. previewOf may still sample for its
// one-line min/avg/max — that line is labeled "sampled" and is a different
// promise from a printed curve.
//
// Three engines, in composeRoll's own order of operations:
//   CONVOLUTION      sums of independent dice. A dense accumulator over the
//                    integer lattice against a SPARSE multiplicand, so d10x's
//                    ten-wide support costs ten multiplies per lattice point
//                    and not ninety.
//   ORDER-STATISTIC  keep/drop, as a DP over FACES (high→low for kh/dl,
//                    low→high for kl/dh) whose state is (dice not yet placed,
//                    kept sum so far). Two collapses make it cheap: the kept
//                    count after placing j dice is min(k, j) — a function of
//                    the state, not a second dimension — and the moment the
//                    keep budget fills, the sum can never change again, so
//                    the whole tail of the face order is absorbed in one step.
//   EXPLOSION        a closed-form chain distribution folded into the ONE face
//                    that can trigger it. A die's burst depends only on its
//                    own value, so it rides the pmf rather than the DP.
//
// WHAT IS FORECAST is spec.dice under spec.mods — the total composeRoll would
// produce, modifier included. Explosion children are part of that total (they
// count), which is not a contradiction of the per-die rule that "explosion
// changes nothing": there the unit is the DIE and a child is not one, here the
// unit is the TOTAL and a child adds to it.
//
// THE REFUSALS, all three detected before a number is computed:
//   mixed-keep   keep/drop over dice that do not all roll ONE distribution.
//                The DP's sequential-multinomial decomposition needs an
//                exchangeable population; with two populations "how many dice
//                are left" stops being a sufficient statistic and the DP would
//                be confidently wrong. NOTE this is strictly broader than
//                POOL-ANALYSIS §6.3's proposed `new Set(spec.dice).size === 1`
//                — `21d20 adv kh3` is one TYPE and two DISTRIBUTIONS (19 dice
//                get advantage partners, 2 do not, because the 40-die cap runs
//                out), and the type test waves it through.
//   reroll-cap   the cap truncates rerolls value-dependently (previewOf's
//                BINDING tier): which die loses its slot depends on every
//                earlier die, so the dice are no longer independent.
//   explode-cap  the same, for explosion children.
// Advantage-with-explosion is NOT a fourth refusal and is not a category at
// all — see the note above sumForecast.
// ---------------------------------------------------------------------------

export const SUM_REFUSALS = {
  'mixed-keep': 'keep/drop across dice that roll different distributions — no exact curve for the total',
  'reroll-cap': 'more rerolls than the 40-die cap can hold — which dice reroll depends on the landing',
  'explode-cap': 'more explosions than the 40-die cap can hold — which dice explode depends on the landing',
};

// A dense distribution over one contiguous window: p[i] = P(X = lo + i).
// Zeros inside the window are real (a d10x pool skips nine values in ten) and
// are dropped only at the very end, where the support becomes a value list.
const distZero = () => ({ lo: 0, p: Float64Array.of(1) });

const pairsOf = (q) => [...q.entries()].sort((a, b) => a[0] - b[0]);

// One convolution step: dense window × sparse pmf.
function distConv(d, pairs) {
  const vlo = pairs[0][0];
  const vhi = pairs[pairs.length - 1][0];
  const out = new Float64Array(d.p.length + (vhi - vlo));
  for (let i = 0; i < d.p.length; i++) {
    const pi = d.p[i];
    if (pi === 0) continue;
    for (let j = 0; j < pairs.length; j++) out[i + pairs[j][0] - vlo] += pi * pairs[j][1];
  }
  return { lo: d.lo + vlo, p: out };
}

// What a die that landed on its own max is WORTH, face plus every descendant.
// composeRoll gives the first child unconditionally and each deeper link only
// on another max, and a die at depth EXPLODE_CHAIN_CAP does not explode at all
// (`depth >= EXPLODE_CHAIN_CAP` there), so the chain is three links deep and
// `1d6!` tops out at 24. Returned as a pmf over the whole contribution, so a
// caller drops it into the die's own pmf in place of the bare top face.
function burstPairs(type) {
  const faces = facesOf(type);
  const F = faces.length;
  const top = faces[F - 1];
  let tail = faces.map((v) => [v, 1 / F]); // the deepest link: a plain die
  for (let d = EXPLODE_CHAIN_CAP - 1; d >= 1; d--) {
    const next = new Map();
    for (const v of faces) {
      if (v !== top) { next.set(v, (next.get(v) || 0) + 1 / F); continue; }
      for (const [w, p] of tail) next.set(top + w, (next.get(top + w) || 0) + p / F);
    }
    tail = pairsOf(next);
  }
  return tail.map(([v, p]) => [top + v, p]);
}

// The same pmf with its top face replaced by the burst. d10x never explodes
// (composeRoll skips it by type), so callers must not pass one.
function burstPmf(q, type) {
  const top = DIE_MAX[type];
  const pTop = q.get(top) || 0;
  const out = new Map();
  for (const [v, p] of q) if (v !== top) out.set(v, (out.get(v) || 0) + p);
  if (pTop > 0) for (const [v, p] of burstPairs(type)) out.set(v, (out.get(v) || 0) + pTop * p);
  return out;
}

function pmfEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [v, p] of a) { const q = b.get(v); if (q === undefined || Math.abs(q - p) > 1e-15) return false; }
  return true;
}

function pascal(n) {
  const C = [[1]];
  for (let i = 1; i <= n; i++) {
    const row = new Array(i + 1).fill(0);
    row[0] = 1; row[i] = 1;
    for (let j = 1; j < i; j++) row[j] = C[i - 1][j - 1] + C[i - 1][j];
    C.push(row);
  }
  return C;
}

// THE ORDER-STATISTIC DP. `L` exchangeable dice with the pmf `(faces, probs)`;
// keep the `k` from the high end (kh/dl) or the low end (kl/dh). One face may
// pay a DISTRIBUTION rather than its own value — `burstAt` names it and
// `ladder[c]` is what c kept dice there are worth — which is how explosion
// gets in without a second state dimension. Returns the dense distribution of
// the KEPT sum.
//
// The decomposition is the sequential multinomial: given r dice still unplaced
// and the faces above this one already settled, the count landing HERE is
// Binomial(r, p_face / p_remaining). That is exact for identical dice and only
// for identical dice — hence the mixed-keep refusal.
//
// Ties need no thought and that is the point: composeRoll's sort is stable, so
// WHICH die it keeps among equals is an artifact, but the multiset of kept
// VALUES is not, and a sum only sees the multiset.
function keptSumDist(faces, probs, L, k, fromHigh, burstAt, ladder, maxPay) {
  const F = faces.length;
  const order = [];
  for (let j = 0; j < F; j++) order.push(fromHigh ? F - 1 - j : j);
  // p(this face | it is one of the faces not yet placed), read off a suffix
  // sum rather than a running subtraction so the last face is exactly 1.
  const rem = new Array(F);
  let acc = 0;
  for (let j = F - 1; j >= 0; j--) { acc += probs[order[j]]; rem[j] = acc; }

  const S = k * maxPay + 1;
  const C = pascal(L);
  let cur = new Float64Array((L + 1) * S);
  let next = new Float64Array((L + 1) * S);
  // Window bounds per r, so the inner loops walk live mass only. Without them
  // a 40d10x keep would scan 1801 slots per (face, r, count) for nothing.
  let curLo = new Int32Array(L + 1).fill(S);
  let curHi = new Int32Array(L + 1).fill(-1);
  let nxtLo = new Int32Array(L + 1).fill(S);
  let nxtHi = new Int32Array(L + 1).fill(-1);
  const done = new Float64Array(S);
  let doneLo = S; let doneHi = -1;
  cur[L * S] = 1; curLo[L] = 0; curHi[L] = 0;

  const w = new Float64Array(L + 1);
  // ρ^c and (1−ρ)^c, built once per face. Math.pow inside the (face, r, c)
  // loop was costing more than the DP itself.
  const pr = new Float64Array(L + 1);
  const pq = new Float64Array(L + 1);
  for (let step = 0; step < F; step++) {
    const j = order[step];
    const v = faces[j];
    const rho = rem[step] > 0 ? Math.min(1, probs[j] / rem[step]) : 0;
    pr[0] = 1; pq[0] = 1;
    for (let c = 1; c <= L; c++) { pr[c] = pr[c - 1] * rho; pq[c] = pq[c - 1] * (1 - rho); }
    const bursts = burstAt !== null && v === burstAt ? ladder : null;
    next.fill(0); nxtLo.fill(S); nxtHi.fill(-1);
    for (let r = 0; r <= L; r++) {
      if (curHi[r] < curLo[r]) continue;
      const room = k - (L - r); // > 0 for every live state, by construction
      const base = r * S;
      const lo0 = curLo[r];
      const hi0 = curHi[r];
      const Cr = C[r];
      for (let c = 0; c <= r; c++) w[c] = Cr[c] * pr[c] * pq[r - c];
      const cmax = Math.min(r, room - 1);
      // The exact live span, found once. Every c writes [first, last] shifted,
      // so the windows stay tight without re-deriving them per c.
      let first = -1; let last = -1;
      for (let i = lo0; i <= hi0; i++) if (cur[base + i] !== 0) { if (first < 0) first = i; last = i; }
      if (first >= 0 && !bursts) {
        // The hot path, and the reason the loops are nested this way round:
        // one sequential read of `cur` feeds all c, instead of one full
        // re-scan per c. dst walks by (v − S) because keeping one more die
        // here moves the state one row up and c·v slots along.
        for (let i = first; i <= last; i++) {
          const p = cur[base + i];
          if (p === 0) continue;
          let dst = base + i;
          for (let c = 0; c <= cmax; c++) {
            const wc = w[c];
            if (wc !== 0) next[dst] += p * wc;
            dst += v - S;
          }
        }
        for (let c = 0; c <= cmax; c++) {
          if (w[c] === 0) continue;
          const off = c * v;
          if (first + off < nxtLo[r - c]) nxtLo[r - c] = first + off;
          if (last + off > nxtHi[r - c]) nxtHi[r - c] = last + off;
        }
      } else if (first >= 0) {
        for (let c = 0; c <= cmax; c++) {
          if (w[c] === 0) continue;
          const dst = (r - c) * S;
          const pay = bursts[c];
          let lo = S; let hi = -1;
          for (let i = first; i <= last; i++) {
            const p = cur[base + i];
            if (p === 0) continue;
            const pw = p * w[c];
            for (let t = 0; t < pay.length; t++) {
              const idx = i + pay[t][0];
              next[dst + idx] += pw * pay[t][1];
              if (idx < lo) lo = idx;
              if (idx > hi) hi = idx;
            }
          }
          if (hi >= lo) {
            if (lo < nxtLo[r - c]) nxtLo[r - c] = lo;
            if (hi > nxtHi[r - c]) nxtHi[r - c] = hi;
          }
        }
      }
      // c ≥ room fills the keep budget: exactly `room` dice are kept here, at
      // this one face, whatever c is — and from then on the kept sum is
      // frozen, so the entire remaining face order collapses into this add.
      if (room <= r) {
        let wt = 0;
        for (let c = room; c <= r; c++) wt += w[c];
        if (wt > 0) {
          const pay = bursts ? bursts[room] : null;
          const off = room * v;
          for (let i = lo0; i <= hi0; i++) {
            const p = cur[base + i];
            if (p === 0) continue;
            const pw = p * wt;
            if (!pay) {
              done[i + off] += pw;
              if (i + off < doneLo) doneLo = i + off;
              if (i + off > doneHi) doneHi = i + off;
              continue;
            }
            for (let t = 0; t < pay.length; t++) {
              const idx = i + pay[t][0];
              done[idx] += pw * pay[t][1];
              if (idx < doneLo) doneLo = idx;
              if (idx > doneHi) doneHi = idx;
            }
          }
        }
      }
    }
    const tc = cur; cur = next; next = tc;
    const tl = curLo; curLo = nxtLo; nxtLo = tl;
    const th = curHi; curHi = nxtHi; nxtHi = th;
  }
  if (doneHi < doneLo) return distZero(); // unreachable: the last face has rho = 1
  return { lo: doneLo, p: done.slice(doneLo, doneHi + 1) };
}

function sumRefusal(code) {
  return { kind: 'sum', exact: false, refusal: { code, reason: SUM_REFUSALS[code] },
    min: null, max: null, mean: null, sd: null, mode: null, modifier: 0,
    values: [], probs: [], cdf: [] };
}

// THE WHOLE DISTRIBUTION of composeRoll's total for one spec, or a typed
// refusal. Pure: same spec in, same object out, on every seat and every
// repaint — there is no rng here and no sampling fallback.
//
// ADVANTAGE WITH EXPLOSION is not a special case, and POOL-ANALYSIS §6.3's
// "two genuine gaps" over-counts by one. The loser of an advantage pair is
// `counts: false` before composeRoll's explosion loop even looks at the queue,
// so the exploding population is exactly the winners and their resolved pmf is
// already `advPairPmf`. What DOES bite is the 40-slot budget the pairs spend
// first — `20d20 adv !` has zero slots left and spawns nothing (VOID: exact,
// explosion ignored), `19d20 adv !` has two slots for nineteen candidates
// (BINDING: refused as explode-cap). Both are the ordinary tiers. `1d20 adv !`
// and `1d20+1d4 adv !` are exact and are pinned against exhaustive
// enumeration of composeRoll in tests/sumread.test.mjs.
export function sumForecast(dice, mods) {
  const m = mods || {};
  const modifier = m.modifier || 0;
  const built = buildCounting(dice, m);
  const { rerollTier, entries } = built;
  if (rerollTier === 'binding') return sumRefusal('reroll-cap');
  const { keptCount, fromHigh, explodeTier } = tiersOf(dice, m, built);
  if (explodeTier === 'binding') return sumRefusal('explode-cap');

  let d;
  if (!m.keep || !entries.length) {
    d = distZero();
    for (let i = 0; i < entries.length; i++) {
      const t = dice[i];
      const q = explodeTier === 'free' && t !== 'd10x' ? burstPmf(entries[i].q, t) : entries[i].q;
      d = distConv(d, pairsOf(q));
    }
  } else if (keptCount <= 0) {
    // composeRoll's `Math.min(m.keep.n, idxs.length - 1)` clamp can drop every
    // die (`1d6 kh5`, which validateMods rejects and previewOf still mirrors).
    // The total is then the modifier alone, and this says so rather than
    // indexing into an empty population.
    d = distZero();
  } else {
    // One population or nothing. The type check is not redundant with the pmf
    // check — it is what lets the burst below name a max face at all.
    const q0 = entries[0].q;
    if (new Set(dice).size > 1 || !entries.every((e) => pmfEqual(e.q, q0))) return sumRefusal('mixed-keep');
    const type = dice[0];
    const pairs = pairsOf(q0);
    const faces = pairs.map((e) => e[0]);
    const probs = pairs.map((e) => e[1]);
    const top = DIE_MAX[type];
    const bursts = explodeTier === 'free' && type !== 'd10x' ? burstPairs(type) : null;
    let maxPay = faces[faces.length - 1];
    let ladder = null;
    if (bursts) {
      maxPay = bursts[bursts.length - 1][0];
      // c kept dice on the exploding face: c independent bursts, so the ladder
      // is built by convolving one more burst per rung.
      ladder = [[[0, 1]]];
      for (let c = 1; c <= keptCount; c++) {
        const acc = new Map();
        for (const [a, pa] of ladder[c - 1]) for (const [b, pb] of bursts) acc.set(a + b, (acc.get(a + b) || 0) + pa * pb);
        ladder.push(pairsOf(acc));
      }
    }
    d = keptSumDist(faces, probs, dice.length, keptCount, fromHigh,
      ladder ? top : null, ladder, maxPay);
  }

  const values = [];
  const probsOut = [];
  const cdf = [];
  let acc = 0;
  let mean = 0;
  let best = -1;
  for (let i = 0; i < d.p.length; i++) {
    const p = d.p[i];
    if (p === 0) continue;
    const v = d.lo + i + modifier;
    values.push(v); probsOut.push(p);
    acc += p; cdf.push(acc);
    mean += v * p;
    if (best < 0 || p > probsOut[best]) best = values.length - 1;
  }
  let variance = 0;
  for (let i = 0; i < values.length; i++) variance += probsOut[i] * (values[i] - mean) * (values[i] - mean);
  return {
    kind: 'sum',
    exact: true,
    refusal: null,
    modifier,
    min: values[0],
    max: values[values.length - 1],
    mean,
    sd: Math.sqrt(Math.max(0, variance)),
    mode: { value: values[best], p: probsOut[best] },
    values,
    probs: probsOut,
    cdf,
  };
}

// P(total ≥ n) and P(total ≤ n) off the forecast's own cdf — the two reads a
// declared target needs, and the only place the app should be doing this
// arithmetic. null on a refused forecast, so a caller cannot accidentally
// print 0% where the honest answer is "we do not know".
// WHICHEVER SIDE IS SMALL, and the two exact answers taken exactly. `1 − cdf`
// alone cancels catastrophically in a deep tail — `40d20 dl1`'s cdf reaches
// 1.0 in double precision hundreds of totals before its maximum, so `1 − below`
// UNDERFLOWED TO EXACTLY 0 for totals the pool can really reach, and a caller
// cannot tell that zero from the honest one (`pctText` prints both as `0%`).
// It surfaced in the popover readout as a cell with visible mass whose
// cumulative read was 0% — caught in the rendered app, 2026-08-17; the unit
// suite was green throughout, because nothing had ever asked for a tail that
// thin. Summing the tail alone fixes that end and spoils the other: P(≥ min)
// came back 0.9999999999999998, which prints as `>99%` for a certainty.
// So: the two edges are answered by definition, and otherwise the side with
// less than half the mass is the one that gets summed.
export function sumAtLeast(fc, n) {
  if (!fc || !fc.exact) return null;
  let i = 0;
  let below = 0;
  for (; i < fc.values.length && fc.values[i] < n; i++) below += fc.probs[i];
  if (i === 0) return 1; // nothing is below n
  if (i === fc.values.length) return 0; // nothing reaches n — a TRUE zero
  if (below < 0.5) return Math.min(1, Math.max(0, 1 - below));
  let tail = 0;
  for (let j = fc.values.length - 1; j >= i; j--) tail += fc.probs[j];
  return Math.min(1, Math.max(0, tail));
}

export function sumAtMost(fc, n) {
  if (!fc || !fc.exact) return null;
  let at = 0;
  for (let i = 0; i < fc.values.length; i++) {
    if (fc.values[i] > n) break;
    at = fc.cdf[i];
  }
  return Math.min(1, Math.max(0, at));
}

// THE TWO READS THE CURVE RENDERER NEEDS, so that no renderer ever walks
// `values`/`probs` itself (§2l ⑥, UX §7.48). They live here for the same
// reason sumAtLeast does: `values` is SPARSE — `1d6!` has no total of 6 — and
// every lie this feature can tell is a renderer that treated the array index
// as the total. Both return null on a refusal, never a zeroed shape.

// Bin the distribution onto a VALUE axis: `nBins` cells of `width` consecutive
// integers each, spanning min..max, so a cell's x position is its TOTAL and an
// unreachable total is an absent cell rather than a squeezed neighbour.
// `cells` carries only the reachable ones (`i` is the cell index, so the
// caller positions by `i * width`), and `peak` is the tallest cell's mass —
// heights are p/peak, never p/1, or every wide pool draws a flat line.
//
// One cell is one integer total until the axis is wider than `maxCells`; past
// that a cell is `ceil(span/maxCells)` totals wide, because 742 columns in a
// 284px popover is 0.4px each. The gaps SURVIVE binning at any width: a cell
// with no mass is simply not in `cells`.
export function sumBins(fc, maxCells = 48) {
  if (!fc || !fc.exact || !fc.values.length) return null;
  const lo = fc.min;
  const span = fc.max - lo + 1;
  const width = Math.max(1, Math.ceil(span / Math.max(1, maxCells)));
  const nBins = Math.ceil(span / width);
  const mass = new Float64Array(nBins);
  for (let i = 0; i < fc.values.length; i++) {
    mass[Math.floor((fc.values[i] - lo) / width)] += fc.probs[i];
  }
  const cells = [];
  let peak = 0;
  for (let i = 0; i < nBins; i++) {
    if (mass[i] === 0) continue;
    cells.push({ i, lo: lo + i * width, hi: Math.min(fc.max, lo + (i + 1) * width - 1), p: mass[i] });
    if (mass[i] > peak) peak = mass[i];
  }
  return { lo, hi: fc.max, span, width, nBins, cells, peak };
}

// The tallest total, and HOW MANY totals are tied with it — which is the part
// a bare `fc.mode` cannot tell you and the reason this exists. `fc.mode` takes
// the first of the tied values, so a plain `1d20+5` reports "most likely 6":
// true of the array, false of the dice. A caller prints a peak only when
// `tied === 1`, calls it flat when `tied === values.length`, and otherwise
// says there is no single peak.
export function sumPeak(fc) {
  if (!fc || !fc.exact || !fc.values.length) return null;
  let p = 0;
  for (let i = 0; i < fc.probs.length; i++) if (fc.probs[i] > p) p = fc.probs[i];
  let tied = 0;
  let value = fc.values[0];
  for (let i = 0; i < fc.probs.length; i++) {
    if (fc.probs[i] < p - 1e-12) continue;
    if (tied === 0) value = fc.values[i];
    tied++;
  }
  return { value, p, tied, of: fc.values.length };
}
