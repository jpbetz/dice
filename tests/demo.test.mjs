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

// tests/demo.test.mjs — THE DEMO DOOR's decisions (js/demo.js), the half that
// has rules in it: which door opens, who sits where, and what a throw takes
// away. The half that touches the DOM, the scene and the film is the `demo`
// e2e tag.
//
// The load-bearing claims here:
//   · a ROOM refuses the demo, in both directions and loudly (the door is
//     solo-only because a locally-stamped film is only lawful where there is
//     no second viewer);
//   · the deal fills stations the way server.js freePlace does — the ladder,
//     not a range — so a demo table's chairs are the chairs a real table
//     would have handed out;
//   · the hues ARE server.js's PALETTE (imported from both sides and
//     compared: a hand copy that can drift is the bug);
//   · the names exercise the card's fitter rather than flattering it;
//   · and the sweep is server.js arrivalSweep's three clauses, including the
//     two that took a defect each to learn (a chair handed on sweeps its last
//     sitter's roll; a tower table keeps the whole-felt rule).

import assert from 'node:assert/strict';
import {
  resolveDemo, dealDemo, freeDemoPlace, demoArrivalSweep,
  DEMO_PARAM, DEMO_MAX, DEMO_NAMES, DEMO_PALETTE, DEMO_REFUSAL,
} from '../js/demo.js';
import { PLACE_MAX } from '../js/places.js';
import { PALETTE } from '../server.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// A pinned draw, so a cast is comparable run to run. The app deals with
// Math.random — every fresh reshuffle is its own table.
const seeded = (seed) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------

t('the param is the name Joe asked for, and the dial spans the table', () => {
  assert.equal(DEMO_PARAM, 'demo');
  assert.equal(DEMO_MAX, PLACE_MAX, 'a full house is the same eight stations');
});

t('no param is no demo, and asks for nothing', () => {
  assert.deepEqual(resolveDemo({}), { on: false, refusedByRoom: false });
  assert.deepEqual(resolveDemo({ param: null, room: 'r-abc' }),
    { on: false, refusedByRoom: false },
    'an ordinary tab at an ordinary table is not a refusal — it is the world');
});

t('?demo=1 with no room opens the door', () => {
  assert.deepEqual(resolveDemo({ param: '1' }), { on: true, refusedByRoom: false });
  assert.deepEqual(resolveDemo({ param: '' }), { on: true, refusedByRoom: false },
    'a bare ?demo is an ask: the param is the flag, the value is decoration');
  assert.deepEqual(resolveDemo({ param: 'yes', room: '' }), { on: true, refusedByRoom: false },
    'and an empty room key is no room');
});

t('a readable falsehood boots an ordinary tab', () => {
  for (const v of ['0', 'no', 'off', 'false', 'OFF', ' 0 ']) {
    assert.deepEqual(resolveDemo({ param: v }), { on: false, refusedByRoom: false },
      `?demo=${v} is not a demo`);
  }
});

t('A ROOM REFUSES THE DEMO, and the refusal is loud', () => {
  const d = resolveDemo({ param: '1', room: 'r-abc' });
  assert.equal(d.on, false, 'solo-only: no fake roster and no local stamp at a real table');
  assert.equal(d.refusedByRoom, true, 'and the one case that owes the console a sentence');
  assert.match(DEMO_REFUSAL, /SOLO-ONLY/, 'which says why');
  assert.match(DEMO_REFUSAL, /\?room=/, '…and what it saw');
});

// ---------------------------------------------------------------------------
// The deal
// ---------------------------------------------------------------------------

t('the lowest free station is server.js freePlace, over a held set', () => {
  assert.equal(freeDemoPlace(new Set()), 0);
  assert.equal(freeDemoPlace(new Set([0, 1, 2])), 3);
  assert.equal(freeDemoPlace(new Set([0, 2])), 1, 'a hole is filled before the tail');
  assert.equal(freeDemoPlace(new Set([0, 1, 2, 3, 4, 5, 6, 7])), null,
    'a full table has no chair to give');
});

t('N players take the first N stations of the LADDER', () => {
  for (let k = 0; k <= DEMO_MAX; k++) {
    const rows = dealDemo(k, seeded(7));
    assert.equal(rows.length, k, `${k} players stand ${k} rows`);
    assert.deepEqual(rows.map((r) => r.place), [...Array(k).keys()],
      'lowest free, one after another — the long edges first, the heads at N >= 5');
  }
});

t('the dial is clamped at both ends, and 0 is a legal setting', () => {
  assert.deepEqual(dealDemo(0), [], 'an empty table stands no cards');
  assert.deepEqual(dealDemo(-3), []);
  assert.equal(dealDemo(99).length, DEMO_MAX, 'a ninth player would be placeless: not dealt');
  assert.deepEqual(dealDemo(null), [], 'and a non-number is nobody');
  assert.equal(dealDemo(3.7).length, 3, 'a fractional dial is floored, not rounded up');
});

t('THE HUES ARE server.js PALETTE, IN ITS ORDER — the mirror, pinned', () => {
  assert.deepEqual([...DEMO_PALETTE], [...PALETTE],
    'js/demo.js hand-copies the palette because server.js does not run in a '
    + 'browser; this assertion is what stops the copy drifting');
  const rows = dealDemo(DEMO_MAX, seeded(1));
  assert.deepEqual(rows.map((r) => r.color), [...PALETTE],
    'a full house wears all eight, one per station');
});

t('a station keeps its hue across a reshuffle; only the names move', () => {
  const a = dealDemo(6, seeded(11));
  const b = dealDemo(6, seeded(22));
  assert.deepEqual(a.map((r) => r.color), b.map((r) => r.color),
    'the tint you are reading in the overlay does not move under you');
  assert.deepEqual(a.map((r) => r.place), b.map((r) => r.place));
  assert.notDeepEqual(a.map((r) => r.name), b.map((r) => r.name),
    'but the cast is a fresh draw');
});

t('every dealt row is MARKED as a demo row and carries a demo id', () => {
  for (const r of dealDemo(DEMO_MAX, seeded(3))) {
    assert.equal(r.demo, true);
    assert.equal(r.id, `demo:${r.place}`,
      'nothing in a debugging session should have to wonder where a row came from');
  }
});

t('the names EXERCISE the card fitter rather than flattering it', () => {
  const lens = DEMO_NAMES.map((s) => [...s].length);
  assert.ok(Math.min(...lens) <= 3, 'a very short name');
  const longest = DEMO_NAMES.reduce((m, s) => (s.length > m.length ? s : m), '');
  assert.ok(longest.length >= 20 && longest.length <= 24,
    `a name at the roster's own ceiling (${longest.length} — inputs cap at 24)`);
  assert.ok(DEMO_NAMES.some((s) => /\p{Extended_Pictographic}/u.test(s)),
    'an emoji, so the surrogate-pair path is walked');
  assert.ok(DEMO_NAMES.some((s) => /[^\x20-\x7e]/.test(s) && !/\p{Extended_Pictographic}/u.test(s)),
    'and a diacritic');
  assert.equal(new Set(DEMO_NAMES).size, DEMO_NAMES.length, 'no name twice');
  assert.ok(DEMO_NAMES.length >= DEMO_MAX,
    'enough names that a full house never seats one twice');
  const full = dealDemo(DEMO_MAX, seeded(5));
  assert.equal(new Set(full.map((r) => r.name)).size, DEMO_MAX,
    'and a full house really does not');
});

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

const standing = [
  { playerId: 'demo:0', place: 0, seat: 0, seats: 3, arc: 0 },
  { playerId: 'demo:2', place: 2, seat: 1, seats: 3, arc: 0 },
  { playerId: 'demo:4', place: 4, seat: 2, seats: 3, arc: 0 },
  { playerId: null },   // a placeless roll
];

t('THE FELT HOLDS ONE ROLL PER PLACE: an arrival sweeps its own chair only', () => {
  const swept = demoArrivalSweep(standing, { playerId: 'demo:0', place: 0, seat: 0, seats: 3, arc: 0 });
  assert.deepEqual(swept.map((r) => r.playerId), ['demo:0', null],
    "seat 0's second throw takes seat 0's first, and the placeless roll — "
    + 'and leaves seats 2 and 4 standing');
});

t('a chair handed on sweeps the roll its last sitter left standing', () => {
  // The v2 defect, verbatim: keyed on playerId alone this returns only the
  // placeless roll and the departed roller's ghost stands for ever.
  const swept = demoArrivalSweep(standing, { playerId: 'demo:0b', place: 0, seat: 0, seats: 3, arc: 0 });
  assert.deepEqual(swept.map((r) => r.playerId), ['demo:0', null],
    'the stamp is the chair, not the person');
});

t('a placeless arrival takes the whole felt, and so does a tower table', () => {
  assert.equal(demoArrivalSweep(standing, { playerId: 'x' }).length, standing.length,
    'no stamp, no per-place rule — the pre-places sweep');
  assert.equal(demoArrivalSweep(standing, { playerId: 'demo:0', place: 0, seat: 0, seats: 3, arc: 0 }, true).length,
    standing.length,
    'and while a tower is up the entries collide (ROADMAP row 15), so per-place '
    + 'would take away the wrong player’s dice');
});

t('the sweep never mutates what it was handed', () => {
  const before = JSON.stringify(standing);
  demoArrivalSweep(standing, { playerId: 'demo:4', place: 4, seat: 2, seats: 3, arc: 0 });
  demoArrivalSweep(standing, { playerId: 'z' }, true);
  assert.equal(JSON.stringify(standing), before);
  assert.deepEqual(demoArrivalSweep(null, { playerId: 'a', place: 0, seat: 0, seats: 1, arc: 0 }), [],
    'and an empty felt sweeps nothing rather than throwing');
});

if (!process.exitCode) console.log(`demo: ${n} tests passed`);
