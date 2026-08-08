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

// tests/seed.test.mjs — the dealt starting rack (js/seed.js).
//
// The load-bearing claim is EXACTNESS: every shelf's dice value must land on
// its price (100 / 100 / 30) for every draw, not for most of them. The dealer
// gets that structurally rather than by retrying, so the proof is a sweep —
// 4000 seeded deals, each re-priced through the SAME budgetOf the ✎ ledger
// prints with, after a round trip through parseNotation. A notation the
// parser would rewrite, or a die value the ledger would read differently, is
// a seed that lies about what it cost.
//
// The rest pins what a fresh seat is entitled to: three shelves in trio
// order, the right pool count on each, no repeated names, every pool holding
// at least one die, and nothing the chart cannot read (d10x has no rank
// column, so it must never be dealt).

import assert from 'node:assert/strict';
import { dealStartingRack, dealRack, dealName, drawDice, SEED_SHELVES } from '../js/seed.js';
import { parseNotation, cutText } from '../js/notation.js';
import { budgetOf, DIE_MAX } from '../js/rollspec.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// mulberry32 — a seeded rng so a failure names a reproducible deal.
function rngFor(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const shelfOf = (rack, category) => rack.filter((g) => g.category === category);

// The rack as the app will see it: every pool through the parser first, then
// priced by the ledger's own function.
function priced(pool) {
  const res = parseNotation(pool.notation);
  assert.ok(res.ok, `${pool.name} '${pool.notation}' must parse`);
  assert.equal(res.canonical, pool.notation,
    `${pool.name} '${pool.notation}' must already be canonical (got '${res.canonical}')`);
  assert.ok(!res.spec.mods, `${pool.name} must be plain dice — mods change what the ledger counts`);
  return { dice: res.spec.dice, value: budgetOf(res.spec.dice, res.spec.mods) };
}

t('every shelf lands exactly on its price, over 4000 deals', () => {
  for (let seed = 1; seed <= 4000; seed++) {
    const rack = dealStartingRack(rngFor(seed));
    for (const shelf of SEED_SHELVES) {
      const pools = shelfOf(rack, shelf.category);
      assert.equal(pools.length, shelf.pools,
        `seed ${seed}: ${shelf.category} deals ${shelf.pools} pools (got ${pools.length})`);
      const value = pools.reduce((s, p) => s + priced(p).value, 0);
      assert.equal(value, shelf.value,
        `seed ${seed}: ${shelf.category} prices at ${shelf.value} (got ${value})`);
    }
  }
});

t('the prices are the ones the design named', () => {
  assert.deepEqual(SEED_SHELVES, [
    { category: 'Attributes', pools: 9, value: 100 },
    { category: 'Skills', pools: 6, value: 100 },
    { category: 'Motivations', pools: 3, value: 30 },
  ]);
});

t('every pool holds at least one die, and only ranked ones', () => {
  // d10x is the one die with no chart column (js/meanings.js) — a seeded d10x
  // would land wordless under the very system the rack is dealt for.
  for (let seed = 1; seed <= 500; seed++) {
    const rack = dealStartingRack(rngFor(seed));
    for (const pool of rack) {
      const { dice } = priced(pool);
      assert.ok(dice.length >= 1, `seed ${seed}: ${pool.name} is empty`);
      for (const d of dice) {
        assert.ok(d !== 'd10x', `seed ${seed}: ${pool.name} dealt a rankless d10x`);
        assert.ok(DIE_MAX[d] > 0, `seed ${seed}: ${pool.name} dealt an unknown die ${d}`);
      }
    }
  }
});

t('the rack is 18 pools, trio-ordered, uniquely named and id-stable', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const rack = dealStartingRack(rngFor(seed));
    assert.equal(rack.length, 18, `seed ${seed}: 9 + 6 + 3`);
    assert.deepEqual(rack.map((g) => g.category),
      [...Array(9).fill('Attributes'), ...Array(6).fill('Skills'), ...Array(3).fill('Motivations')],
      `seed ${seed}: shelves stay in trio order`);
    assert.deepEqual(rack.map((g) => g.id), rack.map((_, i) => i + 1),
      `seed ${seed}: ids are 1..18`);
    const names = rack.map((g) => g.name);
    assert.equal(new Set(names).size, names.length, `seed ${seed}: no repeated pool name`);
    for (const name of names) {
      assert.equal(cutText(name, 24), name, `seed ${seed}: '${name}' survives the 24-char cut`);
    }
  }
});

t('the nine attributes are the sheet spine, in their triads', () => {
  // Only the DICE are dealt on this shelf — the names are fixed, so a rack
  // always reads Physical / Mental / Social down the column.
  const spine = ['Strength', 'Toughness', 'Agility', 'Wit', 'Wisdom',
    'Intelligence', 'Charm', 'Will', 'Empathy'];
  for (let seed = 1; seed <= 200; seed++) {
    assert.deepEqual(shelfOf(dealStartingRack(rngFor(seed)), 'Attributes').map((g) => g.name),
      spine, `seed ${seed}`);
  }
});

t('skills and motivations are drawn from longer lists', () => {
  // The point of the draw: two fresh seats rarely open the same armoury or
  // the same drives. One fixed set would show up here as a single variant.
  const armouries = new Set();
  const drives = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const rack = dealStartingRack(rngFor(seed));
    armouries.add(shelfOf(rack, 'Skills').map((g) => g.name).join(','));
    drives.add(shelfOf(rack, 'Motivations').map((g) => g.name).join(','));
  }
  assert.ok(armouries.size > 50, `skills vary (got ${armouries.size} distinct sets)`);
  assert.ok(drives.size > 50, `motivations vary (got ${drives.size} distinct sets)`);
});

t('the dice vary too — a dealt rack is not one flat rank', () => {
  let flat = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rack = dealStartingRack(rngFor(seed));
    const ranks = new Set(rack.flatMap((g) => priced(g).dice));
    if (ranks.size < 3) flat++;
  }
  assert.equal(flat, 0, `${flat} deals carried fewer than three distinct die ranks`);
});

t('the draw is exact for every payable shelf shape, not just the shipped three', () => {
  // The exactness argument is structural, so it should hold well outside the
  // three prices the app ships. Anything payable — even, and at least 4 per
  // pool — must land on its value with a die for every pool.
  for (let pools = 1; pools <= 12; pools++) {
    for (let value = 4 * pools; value <= 4 * pools + 60; value += 2) {
      for (let seed = 1; seed <= 6; seed++) {
        const dice = drawDice(value, pools, rngFor(seed * 7919 + value));
        const sum = dice.reduce((s, d) => s + DIE_MAX[d], 0);
        assert.equal(sum, value, `${value} across ${pools} pools, seed ${seed}`);
        assert.ok(dice.length >= pools,
          `${value} across ${pools} pools: ${dice.length} dice is short of a die per pool`);
      }
    }
  }
});

t('an unpayable shelf throws instead of dealing a lie', () => {
  // Pins the precondition so a shelf priced below 4 × pools, or at an odd
  // number no combination of ranks can reach, fails loudly at its author
  // rather than shipping a rack that quietly misses its budget.
  assert.throws(() => drawDice(30, 9, rngFor(1)), /unpayable shelf: 30 across 9 pools/);
  assert.throws(() => drawDice(35, 3, rngFor(1)), /unpayable shelf: 35 across 3 pools/);
  assert.doesNotThrow(() => drawDice(36, 9, rngFor(1)), 'exactly 4 per pool is payable');
});

// ---- the other two systems (PROFILES §11, the Random option) ---------------
//
// The Soul Deal deal is priced and its exactness is the claim above. These two
// are unpriced by construction — there is no creation budget to hit — so what
// must hold instead is that every dealt pool is something the app can actually
// roll: parseable, already the parser's fixed point, and inside the name cap.

const CANON = (pool) => {
  const res = parseNotation(pool.notation);
  assert.ok(res.ok, `${pool.name} '${pool.notation}' must parse`);
  assert.equal(res.canonical, pool.notation,
    `${pool.name} '${pool.notation}' must already be canonical (got '${res.canonical}')`);
  assert.equal(cutText(pool.name, 24), pool.name, `'${pool.name}' survives the 24-char cut`);
};

t('dealRack routes to the Soul Deal dealer, byte for byte', () => {
  // The one recipe with a unit sweep behind it must not change shape when the
  // other two arrive; an unknown system id lands here too rather than nowhere.
  for (const system of ['soul-deal', undefined, null, 'pathfinder']) {
    assert.deepEqual(dealRack(system, rngFor(11)), dealStartingRack(rngFor(11)), String(system));
  }
});

t('every dealt rack is rollable, canonical and inside the name cap', () => {
  for (const system of ['soul-deal', 'dnd', 'none']) {
    for (let seed = 1; seed <= 300; seed++) {
      const rack = dealRack(system, rngFor(seed));
      assert.ok(rack.length > 0, `${system} seed ${seed}: dealt nothing`);
      assert.deepEqual(rack.map((g) => g.id), rack.map((_, i) => i + 1),
        `${system} seed ${seed}: ids are 1..n, ready for migrateGroup`);
      const seen = new Set();
      for (const p of rack) {
        CANON(p);
        assert.equal(seen.has(p.name), false, `${system} seed ${seed}: '${p.name}' twice`);
        seen.add(p.name);
      }
    }
  }
});

t('the D&D deal reads as a character: checks, saves and something to hit with', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rack = dealRack('dnd', rngFor(seed));
    assert.equal(rack.length, 12, `seed ${seed}`);
    assert.deepEqual([...new Set(rack.map((g) => g.category))], ['Checks', 'Saves', 'Attacks'],
      `seed ${seed}: shelves in authored order`);
    assert.equal(rack.filter((g) => g.category === 'Checks').length, 6, `seed ${seed}`);
    assert.equal(rack.filter((g) => g.category === 'Saves').length, 3, `seed ${seed}`);
    // Every check and save is a d20 read, which is what the system's own
    // crit rule looks at (js/meanings.js critFor reads the d20s that count).
    for (const g of rack.filter((p) => p.category !== 'Attacks')) {
      assert.match(g.notation, /^1d20(\+\d+)?$/, `seed ${seed}: '${g.name}' is a d20 check`);
    }
    assert.match(rack[9].notation, /^1d20(\+\d+)?$/, `seed ${seed}: the attack roll is a d20`);
  }
});

t('a zero modifier is written as no modifier — +0 is not the canonical nothing', () => {
  let sawBare = 0;
  for (let seed = 1; seed <= 400; seed++) {
    for (const g of dealRack('dnd', rngFor(seed))) {
      assert.equal(g.notation.includes('+0'), false, `seed ${seed}: '${g.notation}'`);
      if (g.notation === '1d20') sawBare++;
    }
  }
  assert.ok(sawBare > 0, 'a bare 1d20 does get dealt, so the branch is exercised');
});

t('Numbers only deals a tray, not a character', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rack = dealRack('none', rngFor(seed));
    assert.equal(rack.length, 6, `seed ${seed}`);
    for (const g of rack) {
      assert.equal(g.category ?? null, null,
        `seed ${seed}: a tray has no shelves — '${g.name}' claimed ${g.category}`);
      assert.match(g.notation, /^\d+d\d+$/, `seed ${seed}: plain dice only, got '${g.notation}'`);
    }
  }
});

t('the D&D and tray deals both vary', () => {
  const dnd = new Set();
  const tray = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    dnd.add(dealRack('dnd', rngFor(seed)).map((g) => `${g.name}${g.notation}`).join(','));
    tray.add(dealRack('none', rngFor(seed)).map((g) => g.name).join(','));
  }
  assert.ok(dnd.size > 100, `D&D racks vary (got ${dnd.size})`);
  assert.ok(tray.size > 10, `trays vary (got ${tray.size})`);
});

t('a dealt profile names itself, and Numbers only is not given a person', () => {
  // Random must never have to ask a question it can answer (PROFILES §11 P5).
  const drawn = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    for (const system of ['soul-deal', 'dnd']) {
      const name = dealName(system, rngFor(seed));
      assert.equal(cutText(name, 24), name, `'${name}' survives the cut`);
      assert.equal(name.includes('#'), false, `'${name}' would misdirect a whisper`);
      drawn.add(name);
    }
    assert.equal(dealName('none', rngFor(seed)), 'Dice tray',
      'a tray of dice is not a character, and inventing one would say otherwise');
  }
  assert.ok(drawn.size > 10, `dealt names vary (got ${drawn.size})`);
});

console.log(`seed.test.mjs: ${n} tests${process.exitCode ? ' — FAILURES' : ' ok'}`);
