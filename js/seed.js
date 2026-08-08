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

// THE STARTING RACK — the Soul Deal character a fresh seat opens with.
//
// The old seed was nine attributes, one skill and one motivation, every pool
// at 1d6: correct, and completely flat. This deals a real character instead —
// three shelves, each PRICED, with the dice drawn at random inside the price:
//
//   Attributes  9 pools, dice value 100
//   Skills      6 pools, dice value 100   (weapons, drawn from a longer list)
//   Motivations 3 pools, dice value  30   (drawn from a longer list)
//
// The 100s are Joe's own framing of the creation budget (docs/POOL-ANALYSIS.md
// §1: "the attribute and skill shelves want dice summing to 100"). They are
// the price of the DEALT DATA, not a rule the app enforces — POOL-ANALYSIS §5
// keeps the budget target out of storage, and nothing here changes that. The
// dealt rack is the player's from its first boot: the ✎ editor is still the
// only advancement path, and one edit makes it theirs.
//
// "Dice value" is the shelf figure the ledger already prints — the sum of
// every die's highest face (docs/POOL-ANALYSIS.md §4). Every seeded pool is
// plain NdX with no mods, so its dice value is exactly N × X and the dealt
// shelf totals are what the ✎ ledger reads back.

import { DIE_MAX } from './rollspec.js';

// The ranked dice, cheapest first — exactly the columns the Soul Deal chart
// carries (js/meanings.js: Mug d4 … Bóaire d20). d10x has no rank column, so
// a seeded die would land wordless; the seed never draws one.
const LADDER = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

// How often each rank turns up. Mid ranks carry the rack, and the curve sits
// high enough (mean ≈ 9.4) that a 100-point shelf draws roughly as many dice
// as it has pools — a seeded character holds one or two dice per pool, not a
// fistful. The extremes stay rare in both directions: a d20 reads as
// something the character paid for, a d4 as something they gave up.
const WEIGHT = { d4: 2, d6: 4, d8: 5, d10: 4, d12: 3, d20: 2 };

// The nine attributes in their Physical / Mental / Social triads
// (offense / defense / utility). Fixed: they are the character sheet's
// spine, and only their dice are dealt.
const ATTRIBUTES = ['Strength', 'Toughness', 'Agility',
  'Wit', 'Wisdom', 'Intelligence',
  'Charm', 'Will', 'Empathy'];

// Six of these ten, so two racks rarely carry the same armoury.
const WEAPONS = ['Sword', 'Spear', 'Bow', 'Axe', 'Sling',
  'Shield', 'Dagger', 'Club', 'Javelin', 'Staff'];

// Three of these twelve — what the character is actually playing for.
const MOTIVATIONS = ['Peer Respect', 'Freedom', 'Vengeance', 'Glory',
  'Kinship', 'Redemption', 'Legacy', 'Homeland',
  'Faith', 'Fortune', 'Knowledge', 'Oath'];

// Every seeded shelf: its label, its names, and what it costs.
const SHELVES = [
  { category: 'Attributes', names: ATTRIBUTES, pools: 9, value: 100 },
  { category: 'Skills', names: WEAPONS, pools: 6, value: 100 },
  { category: 'Motivations', names: MOTIVATIONS, pools: 3, value: 30 },
];

function pickWeighted(types, rng) {
  let sum = 0;
  for (const t of types) sum += WEIGHT[t];
  let n = rng() * sum;
  for (const t of types) {
    n -= WEIGHT[t];
    if (n < 0) return t;
  }
  return types[types.length - 1]; // rng() === 1 would fall through
}

// Fisher-Yates on a copy — the caller's list is a module constant.
function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Draw dice whose dice value sums to EXACTLY `value`, at least one per pool.
//
// The exactness is structural, not a retry: a rank is drawable only when what
// it leaves behind is still spendable AND still opens every pool that has
// nothing yet. Formally the loop preserves
//
//     left === 0   or   left >= 4 × max(pools − drawn, 1)
//
// and under that invariant d4 is always legal except at left === 6, where d6
// is — so the candidate list is never empty and `left` always lands on 0.
// (Every rank is even and every even value ≥ 4 is a sum of d4s and d6s, which
// is why "≥ 4" is the whole spendability test.) The precondition is the
// caller's: `value` must be even and at least 4 × `pools`.
//
// Exported for the unit suite, which fuzzes the exactness claim across far
// more shelf shapes than SHELVES ships.
export function drawDice(value, pools, rng) {
  if (value % 2 || value < 4 * pools) {
    throw new Error(`unpayable shelf: ${value} across ${pools} pools`);
  }
  const drawn = [];
  let left = value;
  while (left > 0) {
    // pools still owed a first die AFTER this one is drawn
    const owed = Math.max(0, pools - drawn.length - 1);
    const cands = LADDER.filter((t) => {
      const rest = left - DIE_MAX[t];
      if (rest < 0) return false;
      return rest === 0 ? owed === 0 : rest >= 4 * Math.max(owed, 1);
    });
    const t = pickWeighted(cands, rng);
    drawn.push(t);
    left -= DIE_MAX[t];
  }
  return drawn;
}

const poolValue = (dice) => dice.reduce((s, t) => s + DIE_MAX[t], 0);

// Sort the drawn dice into exactly `pools` pools. Same-rank dice sit together
// so a pool reads as ONE chart row — 2d8 is two Bothach dice, which is the
// read the rank ladder in the pool editor expects.
function sortIntoPools(drawn, pools, rng) {
  const byRank = new Map();
  for (const t of drawn) byRank.set(t, (byRank.get(t) || 0) + 1);
  const out = [...byRank].map(([t, n]) => Array(n).fill(t));

  // MORE RANKS THAN POOLS — only a short shelf can reach this (Motivations
  // is three pools against six ranks). The two cheapest fold together: a
  // mixed pool is legal notation and an honest read, 1d4+1d12 being a Mug
  // die beside an Ócaire on the same throw.
  while (out.length > pools) {
    out.sort((a, b) => poolValue(a) - poolValue(b));
    out.push([...out.shift(), ...out.shift()]);
  }
  // FEWER — a rank holding dice to spare splits off a pool of its own. Always
  // the WIDEST pool, near its middle: splitting at random left racks with a
  // 6d6 skill standing next to a 1d4 one, which reads as a bug rather than as
  // a character. There is always one to split — drawDice guarantees at least
  // `pools` dice, so short of `pools` pools something holds two.
  while (out.length < pools) {
    out.sort((a, b) => b.length - a.length);
    const from = out[0];
    const half = from.length >> 1;
    out.push(from.splice(0, half + (from.length % 2 && rng() < 0.5 ? 1 : 0)));
  }
  return out;
}

// Ladder order is the canonical spelling of a pool (js/main.js commits dice
// the same way), so a seeded notation is already the fixed point the parser
// would hand back.
function notationOf(dice) {
  const counts = new Map();
  for (const t of dice) counts.set(t, (counts.get(t) || 0) + 1);
  return LADDER.filter((t) => counts.has(t)).map((t) => `${counts.get(t)}${t}`).join('+');
}

// Deal a whole starting rack: 18 saved-pool records, ready for `migrateGroup`.
// `rng` is injected so the unit suite can pin a seed; the app passes
// Math.random and every fresh browser gets its own character.
export function dealStartingRack(rng = Math.random) {
  const rack = [];
  for (const shelf of SHELVES) {
    // Names keep list order (a rack reads calmly); WHICH names, and which
    // pool lands on which name, are both drawn.
    const chosen = shelf.names.length === shelf.pools
      ? [...shelf.names]
      : shuffled(shelf.names, rng).slice(0, shelf.pools).sort(
        (a, b) => shelf.names.indexOf(a) - shelf.names.indexOf(b));
    const dealt = shuffled(sortIntoPools(drawDice(shelf.value, shelf.pools, rng), shelf.pools, rng), rng);
    chosen.forEach((name, i) => {
      rack.push({ id: rack.length + 1, name, notation: notationOf(dealt[i]), category: shelf.category });
    });
  }
  return rack;
}

// What each shelf is priced at — the unit suite asserts the dealt rack against
// this, and it is the one place the figures are written down.
export const SEED_SHELVES = SHELVES.map((s) => ({ category: s.category, pools: s.pools, value: s.value }));
