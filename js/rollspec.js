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

// Roll composition: expands a dice pool + modifier spec into the full list of
// physical dice to throw, with per-die metadata and an authoritative total.
//
// Shared by server.js (crypto RNG — the authority in online play) and by
// js/main.js for solo mode (Math.random), so the mechanics exist exactly once.
// Dependency-free: runs in both Node and the browser.
//
// Order of operations (documented in docs/ROADMAP.md §3):
//   advantage/disadvantage pairs → rerolls → keep/drop → explosions → total.
// Keep/drop applies across the whole group's counting dice ("4d6 drop
// lowest"); explosion children always count and are never themselves
// kept/dropped; only counting non-child dice explode. d10x never explodes.

export const DIE_MAX = { d4: 4, d6: 6, d8: 8, d10: 10, d10x: 90, d12: 12, d20: 20 };
export const KEEP_MODES = ['kh', 'kl', 'dh', 'dl'];

export const MAX_PHYSICAL_DICE = 40;
export const EXPLODE_CHAIN_CAP = 3;

// A TURN'S THROWS (MECHANICS M2, docs/MECHANICS.md). `mods.throws = N` means
// "throw up to N times, keeping whichever dice you choose between throws" —
// Yahtzee and King of Tokyo are both 3. It is a DICE PROCEDURE, not a game
// rule: the app manages the dice and the human decides what to keep and what
// the result means (GOALS goal 6).
//
// 2 is the floor because 1 is just a roll, and 5 is a cap picked to bound the
// felt's lifetime rather than to model anything — no game this file knows of
// throws more, and an unbounded turn is a roll that never ends.
export const MAX_THROWS = 5;

// Dice value of a pool: the sum of DIE_MAX over the physical dice guaranteed
// to hit the felt (base list post-d100 expansion + advantage partners, capped
// exactly as composeRoll caps them). Reroll replacements and explosion
// children are value-conditional, so they are not counted. See
// docs/POOL-ANALYSIS.md §4 — the word is "dice value", never "ceiling".
export function budgetOf(dice, mods) {
  let sum = 0;
  for (const t of dice) sum += DIE_MAX[t] || 0;
  if (mods && mods.adv) {
    let len = dice.length;
    for (let i = 0; i < dice.length && len < MAX_PHYSICAL_DICE; i++) {
      if (dice[i] === 'd20') { sum += DIE_MAX.d20; len++; }
    }
  }
  return sum;
}

// Roll one value for a die type using rng() -> [0,1).
export function rollValue(type, rng) {
  if (type === 'd10x') return Math.floor(rng() * 10) * 10;
  return 1 + Math.floor(rng() * DIE_MAX[type]);
}

// Validate a mods spec against a base dice list. Returns null if valid,
// otherwise a short error string. A missing/empty spec is valid.
export function validateMods(dice, mods) {
  if (mods == null) return null;
  if (typeof mods !== 'object' || Array.isArray(mods)) return 'bad_mods';
  const { modifier, adv, keep, reroll, explode, parts, throws } = mods;
  if (modifier !== undefined && (!Number.isInteger(modifier) || modifier < -99 || modifier > 99)) return 'bad_modifier';
  if (parts !== undefined) {
    // display-only decomposition of the modifier into named sources
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 13) return 'bad_parts';
    let sum = 0;
    for (const p of parts) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return 'bad_parts';
      // Beyond control characters, a label may not contain ']' or '#' (they
      // would be re-read as notation when js/notation.js canonicalNotation
      // interpolates labels raw between brackets, breaking the round trip)
      // nor zero-width/bidi-control characters (U+200B–200F, U+202A–202E,
      // U+2066–2069, U+FEFF — invisible, and the bidi overrides can spoof
      // what other players see). js/notation.js stripCtl mirrors this set.
      // eslint-disable-next-line no-control-regex
      if (typeof p.label !== 'string' || p.label.length > 20 ||
          /[\x00-\x1f\x7f\]#\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(p.label)) return 'bad_parts';
      if (!Number.isInteger(p.value) || Math.abs(p.value) > 99) return 'bad_parts';
      sum += p.value;
    }
    if (sum !== (modifier || 0)) return 'bad_parts_sum';
  }
  if (adv !== undefined && adv !== 'adv' && adv !== 'dis') return 'bad_adv';
  if (adv && !dice.includes('d20')) return 'adv_needs_d20';
  if (keep !== undefined) {
    if (typeof keep !== 'object' || keep === null || !KEEP_MODES.includes(keep.mode)) return 'bad_keep';
    if (!Number.isInteger(keep.n) || keep.n < 1 || keep.n >= dice.length) return 'bad_keep_n';
  }
  if (reroll !== undefined) {
    if (typeof reroll !== 'object' || reroll === null) return 'bad_reroll';
    if (!Number.isInteger(reroll.below) || reroll.below < 1 || reroll.below > 9) return 'bad_reroll_below';
  }
  if (explode !== undefined && explode !== true) return 'bad_explode';
  if (throws !== undefined) {
    if (!Number.isInteger(throws) || throws < 2 || throws > MAX_THROWS) return 'bad_throws';
    // A TURN IS A PLAIN POOL, and the refusal is deliberate rather than
    // unfinished. adv/keep/reroll/explode are all WITHIN-throw mechanics that
    // decide which dice count, and stacking them on a procedure that re-throws
    // a chosen subset asks questions this file has no answer to: does `4d6dl1
    // t3` drop the lowest of each throw or of the final faces? Does a kept
    // exploding die keep its children? Inventing an answer would be inventing
    // a rule (goal 6). A modifier is arithmetic on the total, not a choice
    // about dice, so it rides.
    if (adv || keep || reroll || explode) return 'throws_needs_plain_pool';
  }
  return null;
}

// Compose ONE THROW of a turn (MECHANICS M2). `dice` is the turn's full type
// list and `thrown` the indices being re-thrown; every other index keeps the
// value it already had. Returns the new full values array.
//
// It is separate from composeRoll rather than a flag on it because the two
// answer different questions: composeRoll expands a pool (advantage partners,
// reroll replacements, explosion children — the physical dice list can GROW),
// while a re-throw must leave the die list exactly as it is. `validateMods`
// refuses `throws` alongside every mod that expands, which is what makes this
// a safe one-for-one replacement.
export function composeThrow(dice, values, thrown, rng) {
  const out = [...values];
  for (const i of thrown) out[i] = rollValue(dice[i], rng);
  return out;
}

// Compose a roll. dice: base type list (validated by caller). mods: validated
// spec or null/undefined. rng: () => [0,1).
//
// Returns {dice, values, perDie, modifier, total} where dice/values cover
// every physical die thrown and perDie[i] = {
//   counts: bool,             // contributes to the total
//   reason: null | 'adv' | 'drop' | 'reroll',  // why discarded
//   childOf: null | int,      // explosion child of dice[childOf]
//   rerollOf: null | int,     // replacement for discarded dice[rerollOf]
//   pairOf: null | int,       // advantage partner of dice[pairOf]
// }
export function composeRoll(dice, mods, rng) {
  const m = mods || {};
  const modifier = m.modifier || 0;
  const types = [...dice];
  const meta = types.map(() => ({ counts: true, reason: null, childOf: null, rerollOf: null, pairOf: null }));

  // advantage/disadvantage: pair every d20
  if (m.adv) {
    const baseLen = types.length;
    for (let i = 0; i < baseLen; i++) {
      if (types[i] === 'd20' && types.length < MAX_PHYSICAL_DICE) {
        meta.push({ counts: true, reason: null, childOf: null, rerollOf: null, pairOf: i });
        types.push('d20');
      }
    }
  }

  const values = types.map((t) => rollValue(t, rng));

  // resolve advantage pairs: discard the loser (adv) or winner (dis)
  if (m.adv) {
    meta.forEach((md, i) => {
      if (md.pairOf === null) return;
      const j = md.pairOf;
      const keepHigh = m.adv === 'adv';
      const iWins = keepHigh ? values[i] >= values[j] : values[i] <= values[j];
      const loser = iWins ? j : i;
      meta[loser].counts = false;
      meta[loser].reason = 'adv';
    });
  }

  // rerolls: replace counting dice at or below the threshold, once per die
  if (m.reroll) {
    const baseLen = types.length;
    for (let i = 0; i < baseLen; i++) {
      if (!meta[i].counts) continue;
      if (values[i] <= m.reroll.below && types.length < MAX_PHYSICAL_DICE) {
        meta[i].counts = false;
        meta[i].reason = 'reroll';
        meta.push({ counts: true, reason: null, childOf: null, rerollOf: i, pairOf: null });
        types.push(types[i]);
        values.push(rollValue(types[i], rng));
      }
    }
  }

  // keep/drop across counting, non-child dice
  if (m.keep) {
    const idxs = meta.map((md, i) => (md.counts ? i : -1)).filter((i) => i >= 0);
    const sorted = [...idxs].sort((a, b) => values[a] - values[b]); // ascending
    const n = Math.min(m.keep.n, idxs.length - 1);
    let dropped;
    switch (m.keep.mode) {
      case 'kh': dropped = sorted.slice(0, idxs.length - n); break; // keep n highest
      case 'kl': dropped = sorted.slice(n); break;                  // keep n lowest
      case 'dh': dropped = sorted.slice(idxs.length - n); break;    // drop n highest
      case 'dl': dropped = sorted.slice(0, n); break;               // drop n lowest
    }
    for (const i of dropped) {
      meta[i].counts = false;
      meta[i].reason = 'drop';
    }
  }

  // explosions: counting non-child dice that landed on max chain extra dice
  if (m.explode) {
    const queue = meta.map((md, i) => ({ i, depth: 0 })).filter(({ i }) => meta[i].counts && meta[i].childOf === null);
    for (let q = 0; q < queue.length; q++) {
      const { i, depth } = queue[q];
      const t = types[i];
      if (t === 'd10x' || depth >= EXPLODE_CHAIN_CAP) continue;
      if (values[i] !== DIE_MAX[t]) continue;
      if (types.length >= MAX_PHYSICAL_DICE) break;
      const child = types.length;
      meta.push({ counts: true, reason: null, childOf: i, rerollOf: null, pairOf: null });
      types.push(t);
      values.push(rollValue(t, rng));
      queue.push({ i: child, depth: depth + 1 });
    }
  }

  let total = modifier;
  meta.forEach((md, i) => { if (md.counts) total += values[i]; });

  return { dice: types, values, perDie: meta, modifier, total, parts: m.parts || null };
}

// The dice whose types decide the meaning-chart column: counting base dice
// (advantage winners, reroll replacements), excluding explosion children.
export function countingBaseTypes(dice, perDie) {
  return dice.filter((t, i) => perDie[i].counts && perDie[i].childOf === null);
}

// Monte Carlo min/avg/max preview for a spec (client-side UX).
export function previewSpec(dice, mods, samples = 2000) {
  let min = Infinity, max = -Infinity, sum = 0;
  for (let s = 0; s < samples; s++) {
    const { total } = composeRoll(dice, mods, Math.random);
    min = Math.min(min, total);
    max = Math.max(max, total);
    sum += total;
  }
  return { min, max, avg: sum / samples };
}
