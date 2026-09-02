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

// THE UNIT LAYER FOR A PLACE AT THE TABLE (js/places.js, docs/UX.md §7.63).
//
// The whole (station × zoom × tower) table is pinned here, in plain Node, in
// milliseconds: any cell where two cards come closer than 0.30, or where a
// flank card lands inside a tower volume, is a red unit test rather than a
// silent fusion on somebody's felt. The felt shelf died of exactly the
// assertion this file makes — a wall check that stayed green through a total
// collapse.

import assert from 'node:assert/strict';
import {
  PLACE_MAX, PLACE_LANE, PLACE_PUSH, PLACE_LANE_SHARE, PITCH_MIN, PLACARD_STANDOFF, PLACARD_W, PLACARD_D, PLACARD_GAP,
  STATIONS, PLACE_AIM, AIM_ZERO,
  entryFor, placeLane, placeAnchor, placardFootprint, placardGap, laneSpread, aimFor, regionFor, inRegion,
  // THE RING (S1, 2026-09-01) — landed beside the rectangle, called by nothing yet.
  AIM_HULL, RING_BASE, TOWER_ARC, PLACARD_CLEAR, SPAWN_IN, DIE_W, TURN_NONE, TURN_HALF,
  seatTrig, rayRect, slabSpan, wrapPi, seatValid, seatStamp, placeTheta, seatAnchor,
  spawnMid, laneAndChord, sideFor, wedgeFor, inWedge, seatAim, readTurn,
} from '../js/places.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// The shipped mat, from js/main.js's ZOOM_PRESETS (:24447-24451) and
// TOWER_MAT_EXTRA (:11341). `d` here is the PLAYABLE depth as the walls stand:
// a socketed tower adds its 4.5 to MAT_DEPTH.socket and both walls move, front
// and back (towerMatDepth -> walls.front.position.set(0, 0, TABLE_D / 2)).
const TOWER_MAT_EXTRA = 4.5;
const ZOOMS = {
  wide:   { w: 14.1, d: 8.6 },
  medium: { w: 11,   d: 6.7 },
  close:  { w: 8.6,  d: 5.2 },
};
const MATS = [];
for (const [id, z] of Object.entries(ZOOMS)) {
  MATS.push({ id, w: z.w, d: z.d, towerUp: false });
  MATS.push({ id: `${id}+tower`, w: z.w, d: z.d + TOWER_MAT_EXTRA, towerUp: true });
}
const THROW_TARGET = 0.4;       // js/main.js:2992
const SPAWN = { pad: 4.4, per: 2.6 };   // js/main.js:3033
// The widest hull in the shipped set (a d20's circumradius), the number the
// tower's aperture arithmetic uses too.
const HULL_MAX = 1.25;

// --- the word, the shape, the ladder ---------------------------------------

t('eight stations, and PLACE_MAX is the count', () => {
  assert.equal(PLACE_MAX, 8);
  assert.equal(STATIONS.length, PLACE_MAX);
});

t('every station is a legal (edge, side, lane, azim)', () => {
  const sideOf = { front: 0, back: 1, left: 2, right: 3 };
  for (const [i, st] of STATIONS.entries()) {
    assert.equal(st.side, sideOf[st.edge], `station ${i} edge and spawn side agree`);
    assert.ok([-1, 0, 1].includes(st.lane), `station ${i} lane is a slot`);
    assert.ok([0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].includes(st.azim),
      `station ${i} azim is one of the four quarter turns`);
  }
});

t('the ladder fills the long edges first — heads at index >= 4', () => {
  for (const [i, st] of STATIONS.entries()) {
    const head = st.edge === 'left' || st.edge === 'right';
    if (i < 4) assert.ok(!head, `station ${i} is on a long edge`);
  }
  const heads = STATIONS.map((st, i) => [st, i]).filter(([st]) => st.edge === 'left' || st.edge === 'right');
  assert.deepEqual(heads.map(([, i]) => i), [4, 5], 'the two heads are 4 and 5');
});

t('a fresh table of two sits opposing, and NEITHER of them dead centre', () => {
  // v2, 2026-09-01. The first two chairs used to be the middles of the two
  // long edges, which put each viewer's own card at the bottom centre of their
  // own frame — the square of screen the result banner is fixed to. They are
  // outer lanes now, mirrored through the table's centre, so a half turn of
  // the world still maps one chair onto the other exactly: both players read
  // their own card low-left and the other player's high-right.
  const { w, d } = ZOOMS.medium;
  const a = placeAnchor(0, w, d), b = placeAnchor(1, w, d);
  assert.equal(a.x, -placeLane(w), 'the front chair takes the left third of its edge');
  assert.equal(b.x, placeLane(w), 'the back chair is its 180-degree mirror');
  assert.equal(a.z, -b.z);
  assert.ok(a.z > 0, 'place 0 is the near edge');
  assert.ok(Math.abs(a.x) > 0 && Math.abs(b.x) > 0,
    'and nobody sits dead centre of a long edge until a seventh player arrives');
  assert.equal(STATIONS[6].lane, 0, 'station 6 is the front edge\'s centre slot');
  assert.equal(STATIONS[7].lane, 0, 'station 7 the back edge\'s');
});

t('a fresh table of four is two per long edge, 180-degree symmetric', () => {
  const { w, d } = ZOOMS.medium;
  const at = (p) => placeAnchor(p, w, d);
  assert.deepEqual(STATIONS.slice(0, 4).map((s) => s.edge), ['front', 'back', 'front', 'back']);
  for (const [p, q] of [[0, 1], [2, 3]]) {
    const a = at(p), b = at(q);
    assert.ok(Math.abs(a.x + b.x) < 1e-12 && Math.abs(a.z + b.z) < 1e-12,
      `places ${p} and ${q} are a 180-degree pair`);
  }
});

// --- entry: the film half ---------------------------------------------------

t('entryFor is total over (place 0-7 x towerUp)', () => {
  for (const towerUp of [false, true]) {
    for (let p = 0; p < PLACE_MAX; p++) {
      const e = entryFor(p, towerUp);
      assert.ok(e, `place ${p} has an entry`);
      assert.ok(Number.isInteger(e.entry) && e.entry >= 0 && e.entry < 4,
        `place ${p} entry is a spawn side`);
      assert.ok([-1, 0, 1].includes(e.lane), `place ${p} lane is a slot`);
    }
  }
});

t('a non-place is stampless, never a guess', () => {
  for (const bad of [null, undefined, -1, 8, 40, 1.5, '2', NaN, {}]) {
    assert.equal(entryFor(bad), null, `${String(bad)} is not a place`);
    assert.equal(placeAnchor(bad, 11, 6.7), null, `${String(bad)} has no anchor`);
  }
});

t('with no tower every station enters over its own edge', () => {
  for (let p = 0; p < PLACE_MAX; p++) {
    assert.deepEqual(entryFor(p, false), { entry: STATIONS[p].side, lane: STATIONS[p].lane });
  }
});

t('a socketed tower moves the back stations to the flanks, both of them', () => {
  // 3 BACK_L to the -x flank, 1 BACK_R and 7 BACK_C to the +x flank
  // (docs/TOWER.md; DESIGN §7.1).
  // Each back chair goes to the flank it already sat nearest (v2): station 1
  // stands at x +3.60 and turns right, station 3 at -3.60 and turns left, and
  // the centre chair 7 takes the far slot on the right.
  assert.deepEqual(entryFor(3, true), { entry: 2, lane: 0 });
  assert.deepEqual(entryFor(1, true), { entry: 3, lane: 0 });
  assert.deepEqual(entryFor(7, true), { entry: 3, lane: 0 });
  const flanks = [1, 3, 7].map((p) => placeAnchor(p, 11, 11.2, true));
  assert.ok(flanks.every((a) => a.relocated), 'a flanked card knows it moved');
  assert.ok(flanks.filter((a) => a.x < 0).length === 1
    && flanks.filter((a) => a.x > 0).length === 2, 'split across BOTH flanks');
  for (const p of [0, 2, 6, 4, 5]) {
    assert.deepEqual(entryFor(p, true), entryFor(p, false), `place ${p} is untouched by a tower`);
    assert.equal(placeAnchor(p, 11, 11.2, true).relocated, false);
  }
  assert.notEqual(placeAnchor(1, 11, 11.2, true).azim, Math.PI,
    'azim pi is forbidden while socketed — the pit backstop is un-skinned');
});

t('under a tower the entry is not a per-player read: three stations share side 3, two share side 2', () => {
  // Spelled out as ONE assertion rather than left implicit across the two
  // above: the flanked backs land on the edges the heads already own, so the
  // stamp — and with it the spawn line — is identical for stations 1, 3 and
  // the right head, and for 7 and the left head. The wash (anchored per
  // placard) is the whole of attribution on a tower table; a change that
  // gives the flanks their own lanes should turn these into notDeepEquals.
  const stamp = (p) => JSON.stringify(entryFor(p, true));
  assert.deepEqual([1, 7, 4].map(stamp), Array(3).fill(stamp(4)),
    'stations 1, 7 and the right head stamp the identical entry while socketed');
  assert.deepEqual([3, 5].map(stamp), Array(2).fill(stamp(5)),
    'stations 3 and the left head stamp the identical entry while socketed');
  assert.equal(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(stamp)).size, 5,
    'eight stations, five distinct stamps under a tower (eight without one)');
  assert.equal(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((p) => JSON.stringify(entryFor(p, false)))).size, 8);
});

t("a station's azim turns the viewer onto its own entry edge", () => {
  // The trig mirror of three.js's applyAxisAngle(Y_AXIS, camOrbit) at
  // js/main.js:26807: (x, z) -> (x cos + z sin, -x sin + z cos). The eye rides
  // +z, so rotating it by azim must land it on the outward normal of the edge
  // this station's dice come in over. Camera and film can never disagree.
  const normal = { 0: [0, 1], 1: [0, -1], 2: [-1, 0], 3: [1, 0] };
  for (const towerUp of [false, true]) {
    for (let p = 0; p < PLACE_MAX; p++) {
      const a = placeAnchor(p, 11, towerUp ? 11.2 : 6.7, towerUp);
      const eye = [Math.sin(a.azim), Math.cos(a.azim)];
      const want = normal[entryFor(p, towerUp).entry];
      assert.ok(Math.hypot(eye[0] - want[0], eye[1] - want[1]) < 1e-12,
        `place ${p} (tower ${towerUp}) looks along its entry edge`);
    }
  }
});

// --- anchors: the world half ------------------------------------------------

const anchorsOf = (mat) => {
  const out = [];
  for (let p = 0; p < PLACE_MAX; p++) {
    const a = placeAnchor(p, mat.w, mat.d, mat.towerUp);
    out.push({ p, a, box: placardFootprint(a) });
  }
  return out;
};

t('every card stands outboard of a wall, by 0.10 of clear ground', () => {
  // The walls are at +-TABLE_W/2 and +-TABLE_D/2 (js/main.js:3238-3243). No die
  // can reach a card, which is what makes depthWrite, a real shadow and the
  // seating raycast all legal at once — IMMERSION law 8's surfaceUnder trap is
  // void BY GEOMETRY.
  for (const mat of MATS) {
    for (const { p, box } of anchorsOf(mat)) {
      const outX = Math.abs(box.x) - box.hx - mat.w / 2;
      const outZ = Math.abs(box.z) - box.hz - mat.d / 2;
      assert.ok(Math.max(outX, outZ) >= 0.0999,
        `${mat.id} place ${p}: inboard edge is ${Math.max(outX, outZ).toFixed(3)} past the wall`);
    }
  }
});

t('no two cards come within 0.30 of each other — any station, any mat — except the centre slots on a small mat', () => {
  // THE FULL HOUSE AT CLOSE IS THE RECORDED COST of the card standing where
  // the frame can hold it (placeLane, 2026-09-01; re-pinned for the v3 ×1.15
  // card): three cards need 3.98 of pitch to stand a gap apart; wide (5.10)
  // and medium (3.98, by construction) have it and close (3.11) does not.
  // The six outer and head stations keep the floor on every mat; the two
  // centre slots — the seventh and eighth chairs, dealt last for exactly
  // this — stand 1.42 clear at wide, exactly the 0.30 floor at medium, and
  // overlap their neighbours by 0.57 at close. Pinned to the digit so a
  // change to any of the three is a change somebody made on purpose.
  // Under a tower the back centre slot (7) is on a flank, the second card
  // down a row pitched at the film's raw PLACE_LANE (4.30 along z — the card
  // row, NOT pushed; PLACE_PUSH moves throws, not cards), so at wide the
  // flank pair's 0.62 is the number and not the front row's 1.42; at the
  // other two zooms the front centre slot is still the worst.
  const CENTRE = new Set([6, 7]);
  const want = { wide: 1.422, 'wide+tower': 0.62, medium: 0.30, 'medium+tower': 0.30, close: -0.568, 'close+tower': -0.568 };
  for (const mat of MATS) {
    const all = anchorsOf(mat);
    let centreWorst = Infinity;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const gap = placardGap(all[i].box, all[j].box);
        const centre = CENTRE.has(all[i].p) || CENTRE.has(all[j].p);
        if (centre) centreWorst = Math.min(centreWorst, gap);
        else {
          assert.ok(gap >= 0.30,
            `${mat.id}: places ${all[i].p} and ${all[j].p} are ${gap.toFixed(3)} apart`);
        }
      }
    }
    assert.ok(Math.abs(centreWorst - want[mat.id]) < 5e-3,
      `${mat.id}: the centre slot's worst clearance is ${centreWorst.toFixed(3)} (recorded ${want[mat.id]})`);
  }
});

t('every card is inside the shadow frustum', () => {
  // updateShadowFrustum (js/main.js:1629-1634): +-(TABLE_W/2 + 4) by
  // +-(TABLE_D/2 + 6). A card outside it is a card with no shadow.
  for (const mat of MATS) {
    for (const { p, box } of anchorsOf(mat)) {
      assert.ok(Math.abs(box.x) + box.hx <= mat.w / 2 + 4, `${mat.id} place ${p} in x`);
      assert.ok(Math.abs(box.z) + box.hz <= mat.d / 2 + 6, `${mat.id} place ${p} in z`);
    }
  }
});

t('no flank card lands inside a tower volume', () => {
  // towerVolumes (js/main.js:11508-11620) resolved at the classic portal spec,
  // where every delta is x - x = +0.0. Envelopes as boxes in the ground plane;
  // the shaft and the aim box are the bore, which is a cylinder about in.x.
  const S = 1.25;                         // TOWER_S
  for (const mat of MATS.filter((m) => m.towerUp)) {
    const z0 = -mat.d / 2;
    const vols = {
      socket: { x: 0, z: z0 - 2.0 * S, hx: 5.2 * S / 2, hz: 4.4 * S / 2 },
      apron:  { x: 0, z: z0 - 1.284 * S, hx: 3.8 * S / 2, hz: 5.85 * S / 2 },
      shaft:  { x: 0, z: z0 - 1.6 * S, hx: 1.7 * S, hz: 1.7 * S },
      aim:    { x: 0, z: z0 - 1.6 * S, hx: 0.8 * S / 2, hz: 0.8 * S / 2 },
      cowl:   { x: 0, z: z0 + 0.05 * S, hx: 4.2 * S / 2, hz: 0.3 * S / 2 },
      hood:   { x: 0, z: z0 + 0.5 * S, hx: 4.6 * S / 2, hz: 1.0 * S / 2 },
      lip:    { x: 0, z: z0 + 2.8, hx: 4.8 / 2, hz: 2.2 / 2 },
    };
    for (const { p, box } of anchorsOf(mat)) {
      for (const [name, v] of Object.entries(vols)) {
        const clear = Math.max(Math.abs(box.x - v.x) - box.hx - v.hx,
          Math.abs(box.z - v.z) - box.hz - v.hz);
        assert.ok(clear > 0, `${mat.id} place ${p} clears the ${name} (${clear.toFixed(3)})`);
      }
    }
  }
});

t('the anchor arithmetic is the design table, to the digit', () => {
  // RE-AUTHORED WITH THE CARD (v2, 2026-09-01; v3 same day, ×1.15): the
  // standoff is 0.86 for a footprint 1.52 deep, so front/back z = +-5.16
  // wide / +-4.21 medium / +-3.46 close; heads x = +-7.91 / +-6.36 / +-5.16;
  // lanes at x in {0, +-placeLane(w)} — a footprint and a gap of pitch on
  // the medium mat (3.98) and that share of the others, 5.10 at wide, 3.11
  // at close, so the card's centre stands at the same point of a frame the
  // mat fills at every zoom.
  const want = { wide: [5.16, 7.91, 5.102], medium: [4.21, 6.36, 3.98], close: [3.46, 5.16, 3.112] };
  for (const [id, [edgeZ, headX, lane]] of Object.entries(want)) {
    const { w, d } = ZOOMS[id];
    assert.ok(Math.abs(placeAnchor(0, w, d).z - edgeZ) < 5e-3, `${id} front z`);
    assert.ok(Math.abs(placeAnchor(1, w, d).z + edgeZ) < 5e-3, `${id} back z`);
    assert.ok(Math.abs(placeAnchor(4, w, d).x - headX) < 5e-3, `${id} right head x`);
    assert.ok(Math.abs(placeAnchor(5, w, d).x + headX) < 5e-3, `${id} left head x`);
    assert.ok(Math.abs(placeAnchor(0, w, d).x + lane) < 5e-3, `${id} front-left lane (${placeAnchor(0, w, d).x})`);
    assert.ok(Math.abs(placeAnchor(2, w, d).x - lane) < 5e-3, `${id} front-right lane`);
    assert.ok(Math.abs(placeAnchor(0, w, d).x + placeLane(w)) < 1e-12, `${id} is placeLane(w) exactly`);
    assert.equal(placeAnchor(6, w, d).x, 0, `${id} front-centre lane`);
    assert.equal(placeAnchor(0, w, d).y, 0, 'a card stands on the ground');
  }
  assert.ok(Math.abs(placeLane(ZOOMS.medium.w) - (PLACARD_W + PLACARD_GAP)) < 1e-9,
    'on the medium mat the card\'s pitch is exactly a footprint and a gap');
  assert.ok(Math.abs(PLACE_LANE_SHARE - 0.362) < 1e-3, `the share is 0.362 of the mat (${PLACE_LANE_SHARE})`);
  assert.ok(Math.abs(placeLane(ZOOMS.wide.w) - PLACE_LANE * PLACE_PUSH) < 0.25,
    `and on the wide mat the card stands within a quarter unit of the film\'s pushed lane (${placeLane(ZOOMS.wide.w)} vs ${PLACE_LANE * PLACE_PUSH})`);
  assert.ok(Math.abs((PLACARD_STANDOFF - PLACARD_D / 2) - 0.10) < 1e-12,
    'the standoff leaves exactly 0.10 of clear ground inboard');
  assert.equal(PLACARD_W, 3.68);
  assert.equal(PLACARD_D, 1.52);
  assert.equal(PLACE_PUSH, 1.2, 'the v3 push is the 20% Joe asked for, once');
  // THE PITCH: the film's lane clears a card's footprint plus the gap floor,
  // and so does the card's pitch on the wide and medium mats; at close it
  // does not — the recorded full-house cost, pinned to the digit in the gap
  // test above.
  assert.ok(PLACE_LANE >= PLACARD_W + PLACARD_GAP,
    `the lane clears a card's width plus the gap floor (${PLACE_LANE} vs `
    + `${PLACARD_W} + ${PLACARD_GAP})`);
  assert.ok(placeLane(ZOOMS.wide.w) >= PLACARD_W + PLACARD_GAP, 'three cards stand a gap apart on the wide mat');
  assert.ok(placeLane(ZOOMS.medium.w) >= PLACARD_W + PLACARD_GAP - 1e-9, 'and on the medium one');
  assert.ok(placeLane(ZOOMS.close.w) < PLACARD_W, 'and overlap at close — the recorded cost, not an accident');
  assert.equal(PLACARD_GAP, 0.30);
});

// --- the lane: F1, the pin the felt shelf never had -------------------------

// spawnDie's own line, for the pool this lane has to yield to.
const poolSpread = (w, count) => Math.min(w - SPAWN.pad, count * SPAWN.per);
const poolRoom = (w, hull) => w / 2 - hull - 0.05;

t('lane slot 0 returns its inputs untouched — the bit-identical shipped path', () => {
  const out = laneSpread(0, 4.2, 6.6, 6);
  assert.ok(Object.is(out.spread, 6.6), 'the same double, not a recomputed one');
  assert.ok(Object.is(out.lane, 0), 'positive zero: 0 + v is v');
});

t('the F1 table — the lane yields to the pool, and the line never collapses', () => {
  // room 4.2 is medium (5.5 - 1.25 - 0.05); room 3.00 is close (4.3 - 1.25 - 0.05).
  const medium = (count) => laneSpread(1, 4.2, poolSpread(ZOOMS.medium.w, count), count);
  // The v3 lane is 4.30 × 1.2 = 5.16, wider than a medium mat's own ROOM (4.2
  // for the widest hull), so at this zoom the room binds before the lane does
  // — which is the rule working, not an exception to it: the lane never puts
  // a die where fit() would have to rescue it, and the whole medium/close
  // table below is bit-identical to the v2 one (the push shows only at wide,
  // where there is room to spend it — the pin after the table).
  assert.ok(Math.abs(medium(1).lane - 4.2) < 1e-12, 'a single die comes from your spot');
  assert.ok(Math.abs(medium(2).lane - 3.20) < 1e-12, 'a pair gives up a foot of it');
  assert.ok(Math.abs(medium(3).lane - 2.2) < 1e-12, '3d6 gives a little more ground');
  const six = medium(6);
  assert.ok(Math.abs(six.lane - 0.9) < 1e-12, '6d6 comes from your side of the table');
  assert.ok(Math.abs(six.spread - 6.6) < 1e-12, 'and keeps the whole pool spread');
  assert.ok(Math.abs(six.spread / 5 - 1.32) < 1e-12, 'pitch 1.32 preserved');

  const close6 = laneSpread(1, 3.00, poolSpread(ZOOMS.close.w, 6), 6);
  assert.ok(Math.abs(close6.lane - 0.9) < 1e-12, 'close/6d6 lane 0.9');
  assert.ok(Math.abs(close6.spread - 4.2) < 1e-12, 'close/6d6 spread untouched — NO COLLAPSE');

  const left = laneSpread(-1, 4.2, poolSpread(ZOOMS.medium.w, 3), 3);
  assert.equal(left.lane, -medium(3).lane, 'the near lane mirrors the far one');
  assert.equal(left.spread, medium(3).spread);

  // THE PUSH SHOWS AT WIDE (v3): a lone d20's room there is 5.75, past the
  // pushed lane, so the line comes in at PLACE_LANE × PLACE_PUSH exactly —
  // `s = 2·(room − L)` makes `room − s/2` land on L to the bit (2·x and /2
  // are exact scalings). place-throws-from-your-edge pins the same number
  // off the live film.
  const wide1 = laneSpread(1, ZOOMS.wide.w / 2 - HULL_MAX - 0.05, 2.6, 1);
  assert.ok(Math.abs(wide1.lane - PLACE_LANE * PLACE_PUSH) < 1e-12,
    `at wide a single die comes from the pushed spot (${wide1.lane} vs ${PLACE_LANE * PLACE_PUSH})`);
});

t('a laned line always fits inside the room fit() would clamp it to', () => {
  // The collapse F1 names is `fit()` folding the outboard half of the line onto
  // one x. If the line fits, fit() never binds, and there is nothing to fold.
  for (const [, z] of Object.entries(ZOOMS)) {
    for (const hull of [0.9, 1.169, HULL_MAX]) {
      const room = poolRoom(z.w, hull);
      for (let count = 1; count <= 12; count++) {
        for (const slot of [-1, 1]) {
          const spread = poolSpread(z.w, count);
          const out = laneSpread(slot, room, spread, count);
          assert.ok(Math.abs(out.lane) + out.spread / 2 <= room + 1e-12,
            `w${z.w} hull${hull} ${count} dice: line ends inside the room`);
          const pitch = count > 1 ? out.spread / (count - 1) : Infinity;
          assert.ok(pitch >= Math.min(spread / Math.max(1, count - 1), PITCH_MIN) - 1e-12,
            `w${z.w} ${count} dice: pitch is never squeezed below the floor`);
          assert.ok(out.spread <= spread, 'a lane never WIDENS the pool');
        }
      }
    }
  }
});

// --- the region, and the throw into it (v2) ---------------------------------

t('an unstamped roll gets the one shared identity, by reference', () => {
  assert.equal(aimFor(null, 0, 11, 6.7, THROW_TARGET), AIM_ZERO);
  for (const bad of [undefined, -1, 4, 1.5, '0', NaN]) {
    assert.equal(aimFor(bad, 0, 11, 6.7, THROW_TARGET), AIM_ZERO, `${String(bad)} is not an entry`);
    assert.equal(regionFor(bad, 0, 11, 6.7), null, `${String(bad)} owns no region`);
  }
  // Every factor spawnDie multiplies by is exactly 1 and every offset exactly
  // +0, so the shipped expressions ARE the pre-places expressions on a stampless
  // payload (place-seeds-unchanged is the golden).
  assert.ok(Object.is(AIM_ZERO.x, 0) && Object.is(AIM_ZERO.z, 0), 'positive zero on both axes');
  for (const k of ['kx', 'kz', 'k', 'h', 'spin']) assert.ok(Object.is(AIM_ZERO[k], 1), `${k} is the identity`);
  assert.equal(AIM_ZERO.own, 0, 'and no die aims from its own abscissa');
  assert.throws(() => { AIM_ZERO.x = 5; }, 'the shared zero cannot be poisoned');
  for (const v of [0.1, 1, 7.25, -3.9, 1e-9]) {
    assert.ok(Object.is(AIM_ZERO.x + v, v) && Object.is(v * AIM_ZERO.k, v), `${v} passes through unchanged`);
  }
});

t('the dial is on, and switching it off returns the identity for every stamp', () => {
  assert.equal(PLACE_AIM.on, 1, 'regions ship on — this is what Joe asked for twice');
  const was = { ...PLACE_AIM };
  try {
    PLACE_AIM.on = 0;
    for (let entry = 0; entry < 4; entry++) {
      for (const lane of [-1, 0, 1]) assert.equal(aimFor(entry, lane, 11, 6.7, THROW_TARGET), AIM_ZERO);
    }
  } finally {
    for (const k of Object.keys(PLACE_AIM)) delete PLACE_AIM[k];
    Object.assign(PLACE_AIM, was);
  }
  assert.deepEqual(PLACE_AIM, was, 'the shipped dial is back');
});

t('the regions: pushed corner boxes, a centre band, end fifths (v3)', () => {
  // V3 (PLACE_PUSH 1.2): every region's centre is the v2 centre × 1.2, pushed
  // toward its own corner or edge — the walls stay walls, so the open sides
  // pull outward by `off` of the half-extent, and the head's end-third
  // narrows to an end-fifth. The expressions here REPLICATE js/places.js's
  // own, in its expression order, so the doubles agree to the bit.
  const off = PLACE_PUSH - 1;
  for (const [id, z] of Object.entries(ZOOMS)) {
    const hw = z.w / 2;
    const hd = z.d / 2;
    const c = (hw - z.w / 6) * PLACE_PUSH;
    assert.deepEqual(regionFor(0, -1, z.w, z.d), { x0: -hw, x1: -(hw * off), z0: hd * off, z1: hd }, `${id}: front-left corner box`);
    assert.deepEqual(regionFor(0, 1, z.w, z.d), { x0: hw * off, x1: hw, z0: hd * off, z1: hd }, `${id}: front-right corner box`);
    assert.deepEqual(regionFor(1, 1, z.w, z.d), { x0: hw * off, x1: hw, z0: -hd, z1: -(hd * off) }, `${id}: back-right corner box`);
    assert.deepEqual(regionFor(1, -1, z.w, z.d), { x0: -hw, x1: -(hw * off), z0: -hd, z1: -(hd * off) }, `${id}: back-left corner box`);
    assert.deepEqual(regionFor(0, 0, z.w, z.d), { x0: -hw / 2, x1: hw / 2, z0: hd * off, z1: hd }, `${id}: the front centre band keeps its width and takes the z push`);
    assert.deepEqual(regionFor(3, 0, z.w, z.d), { x0: 2 * c - hw, x1: hw, z0: -hd, z1: hd }, `${id}: the right end fifth`);
    assert.deepEqual(regionFor(2, 0, z.w, z.d), { x0: -hw, x1: -(2 * c - hw), z0: -hd, z1: hd }, `${id}: the left end fifth`);
    // The push, stated as the sentence Joe said: opposite corner boxes'
    // centres stand exactly 20% further apart than the v2 quadrants' did.
    const mid = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    const [ax, az] = mid(regionFor(0, -1, z.w, z.d));
    const [bx, bz] = mid(regionFor(1, 1, z.w, z.d));
    const v3 = Math.hypot(ax - bx, az - bz);
    const v2 = Math.hypot(hw, hd);                       // the old centres, ±(hw/2, hd/2)
    assert.ok(Math.abs(v3 / v2 - PLACE_PUSH) < 1e-9,
      `${id}: region centres sit ${PLACE_PUSH}× apart (${(v3 / v2).toFixed(6)})`);
    // …and the head's centre is 1.2× out along its own axis.
    const [rx] = mid(regionFor(3, 0, z.w, z.d));
    assert.ok(Math.abs(rx / (hw - z.w / 6) - PLACE_PUSH) < 1e-9, `${id}: the head's end is pushed the same 20%`);
  }
});

t('the two chairs of a fresh table own disjoint felt, and so do all four long-edge chairs', () => {
  // Stations 0 and 1 are the two-player table; 0-3 the four-player one. Their
  // regions must not overlap, or "room for two" is a picture and not a fact.
  const { w, d } = ZOOMS.medium;
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
    * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
  const R = (p) => { const e = entryFor(p, false); return regionFor(e.entry, e.lane, w, d); };
  for (let p = 0; p < 4; p++) {
    for (let q = p + 1; q < 4; q++) {
      assert.equal(overlap(R(p), R(q)), 0, `stations ${p} and ${q} own disjoint felt`);
    }
  }
  // …and nobody owns more than a v2 quarter: the pushed corner box is 0.64 of
  // one (0.8 × 0.8 — the open sides pulled in by `off` on both axes), and the
  // strip it gave up is the no-man's band along the centre lines that reads
  // as the space BETWEEN the pools.
  const off = PLACE_PUSH - 1;
  const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
  const boxArea = (w / 2 - (w / 2) * off) * (d / 2 - (d / 2) * off);
  for (let p = 0; p < 4; p++) {
    assert.ok(area(R(p)) < (w * d) / 4, `station ${p} owns less than a quarter`);
    assert.ok(Math.abs(area(R(p)) - boxArea) < 1e-9, `station ${p} owns the pushed box exactly`);
  }
});

t('inRegion is closed on its own edges, and the centre lines belong to nobody since the push', () => {
  const R = regionFor(0, -1, 11, 6.7);               // x [-5.5, -1.1], z [0.67, 3.35]
  assert.equal(inRegion(R, -2, 1), true);
  assert.equal(inRegion(R, R.x1, R.z0), true, 'the inner corner, on both of its own edges, is in');
  assert.equal(inRegion(regionFor(0, 1, 11, 6.7), regionFor(0, 1, 11, 6.7).x0, 1), true, '…and the neighbour is closed on its own edge too');
  assert.equal(inRegion(R, 0, 0), false, 'the mat\'s centre is in NEITHER front box — the pushed no-man\'s band');
  assert.equal(inRegion(regionFor(0, 1, 11, 6.7), 0, 0), false);
  assert.equal(inRegion(R, R.x1 + 0.01, 1), false);
  assert.equal(inRegion(R, -2, R.z0 - 0.01), false);
  assert.equal(inRegion(null, 0, 0), false, 'no region, nothing is in it');
});

t('the aim box lies inside its region, a hull clear of every rim it touches, at every zoom', () => {
  for (const [id, z] of Object.entries(ZOOMS)) {
    for (let entry = 0; entry < 4; entry++) {
      for (const lane of entry <= 1 ? [-1, 0, 1] : [0]) {
        const R = regionFor(entry, lane, z.w, z.d);
        const a = aimFor(entry, lane, z.w, z.d, THROW_TARGET);
        const bw = z.w * THROW_TARGET * a.kx;
        const bd = z.d * THROW_TARGET * a.kz;
        assert.ok(a.kx <= 1 + 1e-12 && a.kz <= 1 + 1e-12, `${id}/${entry}/${lane}: the box is shrunk, never grown`);
        assert.ok(a.kx > 0 && a.kz > 0, `${id}/${entry}/${lane}: and it is a box, not a point`);
        const box = { x0: a.x - bw / 2, x1: a.x + bw / 2, z0: a.z - bd / 2, z1: a.z + bd / 2 };
        assert.ok(box.x0 >= R.x0 - 1e-9 && box.x1 <= R.x1 + 1e-9 && box.z0 >= R.z0 - 1e-9 && box.z1 <= R.z1 + 1e-9,
          `${id}/${entry}/${lane}: the box is inside its region (${JSON.stringify(box)} in ${JSON.stringify(R)})`);
        // A hull off every side of the region that is a wall of the mat.
        if (R.x0 <= -z.w / 2) assert.ok(box.x0 >= -z.w / 2 + HULL_MAX - 1e-9, `${id}/${entry}/${lane}: clear of the left rim`);
        if (R.x1 >= z.w / 2) assert.ok(box.x1 <= z.w / 2 - HULL_MAX + 1e-9, `${id}/${entry}/${lane}: clear of the right rim`);
        if (R.z0 <= -z.d / 2) assert.ok(box.z0 >= -z.d / 2 + HULL_MAX - 1e-9, `${id}/${entry}/${lane}: clear of the back rim`);
        if (R.z1 >= z.d / 2) assert.ok(box.z1 <= z.d / 2 - HULL_MAX + 1e-9, `${id}/${entry}/${lane}: clear of the front rim`);
        // The box centre is in the region too — a translated box, not one that
        // merely grazes it.
        assert.ok(inRegion(R, a.x, a.z), `${id}/${entry}/${lane}: the centre is in the region`);
        // A stamped throw is the eased, low toss; the factors are the dials.
        assert.equal(a.k, PLACE_AIM.speed);
        assert.equal(a.h, PLACE_AIM.h);
        assert.equal(a.spin, PLACE_AIM.spin);
      }
    }
  }
});

t('the aim rides the push: a laned aim centre stands past 1.2x the v2 aim, at every zoom (v3.1)', () => {
  // The verification's D1: the aim box is anchored in the region's WALL
  // corner, and the walls never move — at box 0.5 the pushed centre stood at
  // only ×1.09 of the v2 aim (−3.46 of a −3.19 at medium) while the region
  // centres said ×1.2, and the pools' rests grew apart 6–9% when Joe had
  // asked at least 20. The 0.25 box is what stands the corner-anchored
  // centre AT the push — ×1.2 of the v2 aim or past it on both axes, every
  // mat — so the throw finally aims where the centres moved. The v2 aim it
  // is measured against: the capped quadrant (hw − hull, one wall each
  // axis), box 0.5, corner-anchored → ±0.75 · (half − hull).
  for (const [id, z] of Object.entries(ZOOMS)) {
    const a = aimFor(0, -1, z.w, z.d, THROW_TARGET);
    const v2x = -(z.w / 2 - HULL_MAX) * 0.75;
    const v2z = (z.d / 2 - HULL_MAX) * 0.75;
    assert.ok(a.x <= v2x * PLACE_PUSH + 1e-9,
      `${id}: the aim's x rides the full push (${a.x} vs ${v2x * PLACE_PUSH})`);
    assert.ok(a.z >= v2z * PLACE_PUSH - 1e-9,
      `${id}: and so does its z (${a.z} vs ${v2z * PLACE_PUSH})`);
  }
});

t('a laned long-edge throw aims into its own corner; heads and the centre slot aim from their own abscissa', () => {
  const { w, d } = ZOOMS.medium;
  const fl = aimFor(0, -1, w, d, THROW_TARGET);
  const fr = aimFor(0, 1, w, d, THROW_TARGET);
  const br = aimFor(1, 1, w, d, THROW_TARGET);
  // The own corner: outboard of the capped region's midpoint on BOTH axes
  // (the cap takes a hull off the rim side, so the midpoint is measured on
  // what is left, not on the raw quadrant).
  const midX = (w / 2 - HULL_MAX) / 2;
  const midZ = (d / 2 - HULL_MAX) / 2;
  assert.ok(fl.x < -midX && fl.z > midZ, `front-left aims into the front-left corner (${fl.x}, ${fl.z})`);
  assert.ok(fr.x > midX && fr.z > midZ, `front-right into the front-right (${fr.x}, ${fr.z})`);
  assert.ok(Math.abs(fl.x + fr.x) < 1e-9 && Math.abs(fl.z - fr.z) < 1e-9, 'the two front lanes mirror in x');
  assert.ok(Math.abs(fr.x - br.x) < 1e-9 && Math.abs(fr.z + br.z) < 1e-9, 'front-right and back-right mirror in z');
  assert.equal(fl.own, 0, 'a laned throw shares one box — the corner');
  for (const [entry, lane, why] of [[0, 0, 'front centre'], [1, 0, 'back centre'], [2, 0, 'left head'], [3, 0, 'right head']]) {
    const a = aimFor(entry, lane, w, d, THROW_TARGET);
    assert.equal(a.own, 1, `${why}: each die aims from where it is on the line`);
  }
  const rh = aimFor(3, 0, w, d, THROW_TARGET);
  assert.ok(rh.x > w / 2 - w / 3 && Math.abs(rh.z) < 1e-9, `the right head aims at its own rim, centred (${rh.x}, ${rh.z})`);
});

t('the aim is a pure function of the stamp and the mat — the pool never enters it', () => {
  // v1 fed the pool's EFFECTIVE lane into the aim; v2 keys the region on the
  // stamp's slot, so a big handful whose line yielded toward the middle still
  // lands on its own side. Same inputs, same object, every time.
  const a = aimFor(0, -1, 11, 6.7, THROW_TARGET);
  const b = aimFor(0, -1, 11, 6.7, THROW_TARGET);
  assert.deepEqual(a, b);
  assert.notDeepEqual(aimFor(0, -1, 11, 6.7, THROW_TARGET), aimFor(0, 1, 11, 6.7, THROW_TARGET), 'the lane sign matters');
  assert.notDeepEqual(aimFor(0, -1, 11, 6.7, THROW_TARGET), aimFor(0, -1, 14.1, 8.6, THROW_TARGET), 'and so does the mat');
});

// ===========================================================================
// THE RING (BRIEF-RING, Joe, 2026-09-01; DESIGN-RING §1, S1). Every row below
// pins the ring's algebra in Node, beside the rectangle's rows above, which are
// untouched. The old exports go in S6; these rows are the ones that stay.
// ===========================================================================

const DEG = Math.PI / 180;
const NS = [1, 2, 3, 4, 5, 6, 7, 8];
// Every (mat × N × seat) cell: 6 mats × 36 seats = 216.
const cells = (fn) => {
  for (const mat of MATS) {
    const arc = mat.towerUp ? 1 : 0;
    for (const N of NS) for (let k = 0; k < N; k++) fn(mat, N, k, arc);
  }
};
const ringBoxes = (mat, N) => {
  const arc = mat.towerUp ? 1 : 0;
  const out = [];
  for (let k = 0; k < N; k++) out.push(placardFootprint(seatAnchor(k, N, arc, mat.w, mat.d)));
  return out;
};

// --- the primitives ----------------------------------------------------------

t('ring: the constants are the design\'s', () => {
  assert.equal(RING_BASE, 0, 'seat 0 sits at +z, camOrbit\'s own zero');
  assert.equal(TOWER_ARC, (5 * Math.PI) / 6, 'the tower arc\'s half-width is 150 degrees');
  assert.ok(Math.abs(TOWER_ARC / DEG - 150) < 1e-9);
  assert.ok(Math.abs(PLACARD_CLEAR - 0.10) < 1e-12, `PLACARD_CLEAR is 0.10 (${PLACARD_CLEAR})`);
  assert.equal(PLACARD_CLEAR, PLACARD_STANDOFF - PLACARD_D / 2, 'derived, not a second literal');
  assert.equal(SPAWN_IN, 2.2, 'spawnDie\'s literal, shared');
  assert.equal(DIE_W, 1.35);
  assert.equal(AIM_HULL, 1.25);
  assert.deepEqual(TURN_NONE, [false, false]);
  assert.deepEqual(TURN_HALF, [true, true]);
  assert.ok(Object.isFrozen(TURN_NONE) && Object.isFrozen(TURN_HALF));
});

t('ring: seatTrig snaps the exact quarter turns and nothing else', () => {
  assert.deepEqual(seatTrig(0), { s: 0, c: 1 });
  assert.deepEqual(seatTrig(Math.PI / 2), { s: 1, c: 0 });
  assert.deepEqual(seatTrig(Math.PI), { s: 0, c: -1 }, 'sin(pi) = 1.2e-16 is snapped to 0');
  assert.deepEqual(seatTrig(3 * Math.PI / 2), { s: -1, c: 0 });
  assert.deepEqual(seatTrig(2 * Math.PI), { s: 0, c: 1 });
  assert.deepEqual(seatTrig(-Math.PI / 2), { s: -1, c: 0 });
  assert.ok(Object.is(seatTrig(Math.PI).s, 0), 'positive zero, never -0');
  const g = seatTrig(1);
  assert.equal(g.s, Math.sin(1));
  assert.equal(g.c, Math.cos(1));
  const t60 = seatTrig(Math.PI / 3);
  assert.ok(Math.abs(t60.s - Math.sqrt(3) / 2) < 1e-15 && Math.abs(t60.c - 0.5) < 1e-15);
});

t('ring: rayRect leaves the box at the right wall, and hands an exact corner to the x wall', () => {
  assert.equal(rayRect(0, 5.5, 3.35), 3.35, 'front: the z wall');
  assert.equal(rayRect(Math.PI / 2, 5.5, 3.35), 5.5, 'right: the x wall');
  assert.equal(rayRect(Math.PI, 5.5, 3.35), 3.35);
  assert.equal(rayRect(3 * Math.PI / 2, 5.5, 3.35), 5.5);
  // A square box on the diagonal: sin(pi/4) and cos(pi/4) differ by an ulp, so
  // `<=` picks the smaller of the two — a total order on the doubles, the same
  // pick on every client.
  const t45 = rayRect(Math.PI / 4, 1, 1);
  assert.equal(t45, Math.min(1 / Math.abs(Math.sin(Math.PI / 4)), 1 / Math.abs(Math.cos(Math.PI / 4))));
  // An exact tie: both slabs at the same t on a snapped quarter cannot happen
  // (one component is 0), so the tie is exercised on the corner of a box whose
  // sides are in the ratio the trig gives.
  const { s: s3, c: c3 } = seatTrig(1);
  assert.equal(rayRect(1, Math.abs(s3) * 2, Math.abs(c3) * 2), 2, 'an exact tie: both slabs at t = 2, one t returned');
  assert.equal(sideFor(1, Math.abs(s3) * 4, Math.abs(c3) * 4), 3, 'and the tie is handed to the x wall (side 3 at +x)');
  // The point lies on the rim.
  for (const th of [0.3, 1.0, 2.0, 2.9, 4.0, 5.5]) {
    const { s, c } = seatTrig(th);
    const r = rayRect(th, 5.5, 3.35);
    assert.ok(Math.abs(Math.max(Math.abs(r * s) / 5.5, Math.abs(r * c) / 3.35) - 1) < 1e-12, `theta ${th} lands on the rim`);
  }
});

t('ring: slabSpan clips a line to a box — the interval, or null', () => {
  const sp = slabSpan(0, 1.15, 1, 0, 5.5, 3.35);
  assert.deepEqual(sp, { lo: -5.5, hi: 5.5 }, 'the front line runs the mat\'s width');
  const v = slabSpan(3.3, 0, 0, -1, 5.5, 3.35);
  assert.deepEqual(v, { lo: -3.35, hi: 3.35 }, 'the right line runs the depth');
  assert.equal(slabSpan(9, 0, 0, 1, 5.5, 3.35), null, 'a line outside the box along a zero component misses');
  assert.equal(slabSpan(0, 10, 1, 0, 5.5, 3.35), null);
  const d = slabSpan(0, 0, Math.SQRT1_2, Math.SQRT1_2, 5.5, 3.35);
  assert.ok(Math.abs(d.hi - 3.35 / Math.SQRT1_2) < 1e-12 && Math.abs(d.lo + 3.35 / Math.SQRT1_2) < 1e-12, 'the diagonal binds on z');
});

t('ring: wrapPi maps into [-pi, pi) — the exact half turn lands on -pi', () => {
  // The design's comment says (-pi, pi]; the expression as written puts the
  // exact odd multiples of pi at -pi. Every caller takes |wrapPi(...)|, so the
  // sign of the half turn is never read — recorded here so nobody "fixes" it
  // into a second expression order.
  assert.equal(wrapPi(0), 0);
  assert.equal(wrapPi(Math.PI), -Math.PI);
  assert.equal(wrapPi(-Math.PI), -Math.PI);
  assert.equal(wrapPi(3 * Math.PI), -Math.PI);
  assert.ok(Math.abs(wrapPi(-Math.PI / 2) + Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(wrapPi(2 * Math.PI + 0.25) - 0.25) < 1e-12);
  assert.ok(Math.abs(wrapPi(-2 * Math.PI - 0.25) + 0.25) < 1e-12);
  for (const a of [-10, -3.2, -1, 0.5, 3.1, 7, 100]) {
    const w = wrapPi(a);
    assert.ok(w >= -Math.PI && w < Math.PI, `${a} wraps into range`);
    assert.ok(Math.abs(Math.sin(w) - Math.sin(a)) < 1e-9 && Math.abs(Math.cos(w) - Math.cos(a)) < 1e-9);
  }
});

// --- the stamp ----------------------------------------------------------------

t('ring: seatValid is the one boundary predicate', () => {
  for (const N of NS) for (let k = 0; k < N; k++) {
    assert.ok(seatValid(k, N), `(${k}, ${N})`);
    assert.ok(seatValid(k, N, 0) && seatValid(k, N, 1));
  }
  for (const [seat, seats, arc] of [[0, 0, 0], [0, 9, 0], [1, 1, 0], [-1, 2, 0], [0.5, 2, 0], ['0', 2, 0], [0, '2', 0],
    [undefined, 2, 0], [0, undefined, 0], [null, 2, 0], [NaN, 2, 0], [0, 2, 2], [0, 2, -1], [0, 2, '1'], [0, 2, true], [8, 8, 0]]) {
    assert.equal(seatValid(seat, seats, arc), false, `(${String(seat)}, ${String(seats)}, ${String(arc)}) is not a stamp`);
  }
});

t('ring: seatStamp is total over every subset of the eight chairs, by ascending place, in any order', () => {
  for (let mask = 1; mask < 256; mask++) {
    const occ = [];
    for (let p = 0; p < 8; p++) if (mask & (1 << p)) occ.push(p);
    const N = occ.length;
    const shuffled = [...occ].reverse();
    for (const [rank, p] of occ.entries()) {
      const s = seatStamp(occ, p);
      assert.deepEqual(s, { seat: rank, seats: N, arc: 0 }, `mask ${mask} place ${p}`);
      assert.deepEqual(seatStamp(shuffled, p), s, 'the list\'s order is irrelevant — counted, never sorted');
      assert.deepEqual(seatStamp(occ, p, true), { seat: rank, seats: N, arc: 1 }, 'a tower sets the arc flag');
      assert.ok(seatValid(s.seat, s.seats, s.arc));
    }
    for (let p = 0; p < 8; p++) {
      if (!(mask & (1 << p))) assert.equal(seatStamp(occ, p), null, `mask ${mask}: place ${p} is not occupied`);
    }
  }
});

t('ring: a non-place is stampless, never a guess (the entryFor contract, kept word for word)', () => {
  for (const bad of [null, undefined, -1, 8, 40, 1.5, '2', NaN, {}]) {
    assert.equal(seatStamp([0, 1, 2, 3, 4, 5, 6, 7], bad), null, `${String(bad)} is not a place`);
    assert.equal(seatAnchor(bad, 2, 0, 11, 6.7), null, `${String(bad)} has no anchor`);
    assert.equal(wedgeFor(bad, 2, 0, 11, 6.7), null, `${String(bad)} owns no wedge`);
    assert.equal(placeTheta(bad, 2, 0), null);
  }
  assert.equal(seatStamp(null, 0), null, 'no list, no stamp');
  assert.equal(seatStamp('0,1', 0), null);
  assert.deepEqual(seatStamp([0, 'x', null, 9, -1, 2.5, 3], 3), { seat: 1, seats: 2, arc: 0 },
    'junk in the occupied list is not a chair');
  assert.equal(seatStamp([], 0), null, 'an empty table has no occupied place');
});

// --- the seat angle: P1, P2, P3, P4 --------------------------------------------

t('ring P1: placeTheta is the one expression (2*pi*k)/N, and seat 0 is the double +0 at every N', () => {
  for (const N of NS) {
    assert.ok(Object.is(placeTheta(0, N, 0), 0), `placeTheta(0, ${N}) is +0`);
    for (let k = 0; k < N; k++) {
      assert.equal(placeTheta(k, N, 0), RING_BASE + (2 * Math.PI * k) / N, `(${k}, ${N}) is the expression, not a re-ordering`);
      assert.equal(placeTheta(k, N), placeTheta(k, N, 0), 'arc defaults to 0');
    }
  }
  assert.equal(placeTheta(1, 2, 0), Math.PI);
  assert.equal(placeTheta(1, 4, 0), Math.PI / 2);
  assert.equal(placeTheta(3, 4, 0), 3 * Math.PI / 2);
  assert.equal(placeTheta(2, 8, 0), Math.PI / 2);
  assert.equal(placeTheta(0, 9, 0), null, 'nine is not a table');
  assert.equal(placeTheta(2, 2, 0), null);
});

t('ring P2: two sit opposite — theta differs by exactly pi, anchors exact negatives', () => {
  // The v2 "neither dead centre" half of the old row is DELETED here on
  // purpose: on the ring N=2 IS dead centre of each long edge, and the defect
  // it guarded (the own card printing through #result-banner) moves to the
  // camera gate G1 (DESIGN-RING §7.6), measured in S4 before the layout lands.
  assert.equal(placeTheta(1, 2, 0) - placeTheta(0, 2, 0), Math.PI);
  for (const mat of MATS.filter((m) => !m.towerUp)) {
    const a = seatAnchor(0, 2, 0, mat.w, mat.d);
    const b = seatAnchor(1, 2, 0, mat.w, mat.d);
    assert.ok(a.x === -b.x, `${mat.id}: x mirrors exactly (${a.x} vs ${-b.x})`);
    assert.ok(a.z === -b.z, `${mat.id}: z mirrors exactly (${a.z} vs ${-b.z})`);
    assert.ok(Object.is(a.x, 0) && Object.is(b.x, 0), `${mat.id}: both dead centre — +0, not 5e-16`);
    assert.ok(a.z > 0, 'seat 0 is the near edge');
    assert.equal(a.z, mat.d / 2 + PLACARD_STANDOFF, `${mat.id}: the shipped front z`);
  }
});

t('ring P3: three make a triangle — unit rays sum to zero at 0, 2pi/3, 4pi/3', () => {
  const th = [0, 1, 2].map((k) => placeTheta(k, 3, 0));
  assert.deepEqual(th, [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]);
  let sx = 0;
  let sz = 0;
  for (const a of th) { const { s, c } = seatTrig(a); sx += s; sz += c; }
  assert.ok(Math.hypot(sx, sz) < 1e-12, `the three unit rays cancel (${Math.hypot(sx, sz)})`);
  const { w, d } = ZOOMS.medium;
  const A = [0, 1, 2].map((k) => seatAnchor(k, 3, 0, w, d));
  assert.ok(Math.abs(A[1].x + A[2].x) < 1e-12 && Math.abs(A[1].z - A[2].z) < 1e-12, 'seats 1 and 2 mirror in x');
  assert.ok(Math.abs(A[1].x - 7.178) < 5e-3 && Math.abs(A[1].z + 4.144) < 5e-3, `seat 1 at (7.178, -4.144): (${A[1].x}, ${A[1].z})`);
  for (const a of A) assert.ok(Math.abs(wrapPi(Math.atan2(a.x, a.z) - a.azim)) < 1e-12, 'each card stands on its own ray');
});

t('ring P4: six make a hexagon — 60-degree steps, mirrored pairs', () => {
  const { w, d } = ZOOMS.medium;
  const A = [0, 1, 2, 3, 4, 5].map((k) => seatAnchor(k, 6, 0, w, d));
  for (let k = 1; k < 6; k++) assert.ok(Math.abs((A[k].azim - A[k - 1].azim) - Math.PI / 3) < 1e-12, `step ${k} is 60 degrees`);
  for (const [i, j] of [[1, 5], [2, 4]]) {
    assert.ok(Math.abs(A[i].x + A[j].x) < 1e-12 && Math.abs(A[i].z - A[j].z) < 1e-12, `${i} and ${j} mirror in x`);
  }
  assert.ok(Math.abs(A[0].x - A[3].x) < 1e-12 && Math.abs(A[0].z + A[3].z) < 1e-12, '0 and 3 mirror in z');
  assert.ok(Math.abs(A[1].x - 7.178) < 5e-3 && Math.abs(A[1].z - 4.144) < 5e-3, `seat 1 at (7.178, 4.144): (${A[1].x}, ${A[1].z})`);
  assert.ok(Math.abs(A[1].r - 8.289) < 5e-3, 'R alternates 4.21 / 8.29 because the MAT is 1.64:1, not because the ring is not a ring');
});

t('ring P5: the axis seats of N=2 and N=4 are today\'s stations, to the bit, on every mat', () => {
  // seatAnchor(0,2)/(1,2)/(1,4)/(3,4) against placeAnchor(6)/(7)/(4)/(5): the
  // two functions exist side by side in S1, so the claim is checked as an
  // identity of doubles, not of digits. The parenthesisation in seatAnchor
  // (`half + (hx + CLEAR)`) is what makes the heads land on `half + 0.86`.
  for (const mat of MATS.filter((m) => !m.towerUp)) {
    for (const [k, N, p] of [[0, 2, 6], [1, 2, 7], [1, 4, 4], [3, 4, 5]]) {
      const s = seatAnchor(k, N, 0, mat.w, mat.d);
      const o = placeAnchor(p, mat.w, mat.d);
      assert.equal(s.x, o.x, `${mat.id} seat ${k}/${N} x === station ${p} x (${s.x} vs ${o.x})`);
      assert.equal(s.z, o.z, `${mat.id} seat ${k}/${N} z === station ${p} z (${s.z} vs ${o.z})`);
      assert.equal(s.azim, o.azim, `${mat.id} seat ${k}/${N} azim`);
      assert.equal(s.y, 0);
      assert.equal(s.relocated, false);
    }
  }
  // The digit table, for the reader: front/back z and head x per mat.
  const want = { wide: [5.16, 7.91], medium: [4.21, 6.36], close: [3.46, 5.16] };
  for (const [id, [edgeZ, headX]] of Object.entries(want)) {
    const { w, d } = ZOOMS[id];
    assert.ok(Math.abs(seatAnchor(0, 4, 0, w, d).z - edgeZ) < 5e-3, `${id} front z`);
    assert.ok(Math.abs(seatAnchor(1, 4, 0, w, d).x - headX) < 5e-3, `${id} right head x`);
    assert.ok(Math.abs(seatAnchor(2, 4, 0, w, d).z + edgeZ) < 5e-3, `${id} back z`);
    assert.ok(Math.abs(seatAnchor(3, 4, 0, w, d).x + headX) < 5e-3, `${id} left head x`);
  }
});

t('ring: every card stands on its own ray, and the anchor carries the stamp it was made from', () => {
  cells((mat, N, k, arc) => {
    const a = seatAnchor(k, N, arc, mat.w, mat.d);
    const theta = placeTheta(k, N, arc);
    assert.equal(a.azim, theta, 'azim IS theta — the same double, one producer');
    if (a.r > 0 && !(Object.is(a.x, 0) && a.z > 0)) {
      assert.ok(Math.abs(wrapPi(Math.atan2(a.x, a.z) - theta)) < 1e-12, `${mat.id} ${k}/${N}: atan2(x, z) is azim`);
    }
    assert.deepEqual({ seat: a.seat, seats: a.seats, arc: a.arc }, { seat: k, seats: N, arc });
    assert.equal(a.relocated, arc === 1);
    assert.equal(a.y, 0, 'a card stands on the ground');
  });
});

// --- the footprint and the gap: P8, P9, the regression, the frustum -----------

t('ring P8: every card stands outboard of a wall by 0.10 of clear ground, on the OBB, at every theta', () => {
  let mn = Infinity;
  let mx = -Infinity;
  let count = 0;
  cells((mat, N, k) => {
    const [box] = [placardFootprint(seatAnchor(k, N, mat.towerUp ? 1 : 0, mat.w, mat.d))];
    const outX = Math.abs(box.x) - box.hx - mat.w / 2;
    const outZ = Math.abs(box.z) - box.hz - mat.d / 2;
    const o = Math.max(outX, outZ);
    mn = Math.min(mn, o);
    mx = Math.max(mx, o);
    count++;
    assert.ok(o >= 0.0999 && o <= 0.1001, `${mat.id} ${k}/${N}: inboard edge is ${o.toFixed(4)} past the wall`);
  });
  assert.equal(count, 216, '6 mats x 36 seats');
  assert.ok(mn > 0.0999 && mx < 0.1001, `0.1000 in every cell (min ${mn}, max ${mx})`);
});

t('ring: the footprint\'s AABB is right at every angle now — the old |cos| < 0.5 swap was 2.4x short at 45 degrees', () => {
  const at = (azim) => placardFootprint({ x: 0, z: 0, azim });
  const q0 = at(0);
  assert.equal(q0.hx, PLACARD_W / 2);
  assert.equal(q0.hz, PLACARD_D / 2);
  const q1 = at(Math.PI / 2);
  assert.equal(q1.hx, PLACARD_D / 2);
  assert.equal(q1.hz, PLACARD_W / 2);
  const q45 = at(Math.PI / 4);
  const want = (PLACARD_W / 2 + PLACARD_D / 2) * Math.SQRT1_2;
  assert.ok(Math.abs(q45.hx - want) < 1e-12 && Math.abs(q45.hz - want) < 1e-12, `a 45-degree card is ${want.toFixed(3)} half a side each way`);
  assert.ok(q45.hz / (PLACARD_D / 2) > 2.4, 'the old form under-reported hz here');
  assert.deepEqual({ hw: q45.hw, hd: q45.hd }, { hw: PLACARD_W / 2, hd: PLACARD_D / 2 }, 'the OBB keeps the card\'s own size');
  assert.ok(Math.abs(q45.ax.x * q45.az.x + q45.ax.z * q45.az.z) < 1e-12, 'the two ground axes are perpendicular');
  assert.equal(placardFootprint(null), null);
});

t('ring: the SAT gap equals the old AABB gap for two cards on one edge, and stops lying about diagonal neighbours', () => {
  const oldGap = (a, b) => {
    const dx = Math.abs(a.x - b.x) - a.hx - b.hx;
    const dz = Math.abs(a.z - b.z) - a.hz - b.hz;
    if (dx >= 0 && dz >= 0) return Math.hypot(dx, dz);
    return Math.max(dx, dz);
  };
  const { w, d } = ZOOMS.medium;
  const a = placardFootprint({ x: -3.98, z: d / 2 + PLACARD_STANDOFF, azim: 0 });
  const b = placardFootprint({ x: 0, z: d / 2 + PLACARD_STANDOFF, azim: 0 });
  assert.ok(Math.abs(placardGap(a, b) - oldGap(a, b)) < 1e-12, 'same-edge neighbours: the same number');
  assert.ok(Math.abs(placardGap(a, b) - 0.30) < 1e-9, 'and it is the medium centre slot\'s 0.30');
  const c = placardFootprint({ x: 0, z: -(d / 2 + PLACARD_STANDOFF), azim: Math.PI });
  assert.ok(placardGap(b, c) > 6, 'opposite cards are the mat apart');
  assert.equal(placardGap(a, b), placardGap(b, a), 'symmetric');
  // THE TWO LIES THE OLD FORMS TOLD, measured (S1; the design's own example
  // cell did not reproduce — no ring pair has a negative AABB gap and a
  // positive SAT gap — so the real pairs are pinned instead):
  //   1. the |cos| < 0.5 SWAP over-reports at a diagonal: close / N=7 seats 3
  //      and 4 read 0.349 — over the 0.30 floor — where the true clearance is
  //      0.049. The old footprint would have HIDDEN the recorded exception.
  //   2. the true-extent AABB under-reports at a diagonal: close+tower / N=8
  //      seats 2 and 3 read 0.288 — a false floor breach — where the oriented
  //      boxes stand 0.670 apart.
  const oldSwap = (a) => {
    const turned = Math.abs(Math.cos(a.azim)) < 0.5;
    return { x: a.x, z: a.z, hx: (turned ? PLACARD_D : PLACARD_W) / 2, hz: (turned ? PLACARD_W : PLACARD_D) / 2 };
  };
  const c3 = placardFootprint(seatAnchor(3, 7, 0, 8.6, 5.2));
  const c4 = placardFootprint(seatAnchor(4, 7, 0, 8.6, 5.2));
  assert.ok(Math.abs(oldGap(oldSwap(c3), oldSwap(c4)) - 0.349) < 5e-3, `the swap said ${oldGap(oldSwap(c3), oldSwap(c4)).toFixed(3)}`);
  assert.ok(Math.abs(placardGap(c3, c4) - 0.049) < 5e-3, `the SAT says ${placardGap(c3, c4).toFixed(3)}`);
  const t2 = placardFootprint(seatAnchor(2, 8, 1, 8.6, 9.7));
  const t3 = placardFootprint(seatAnchor(3, 8, 1, 8.6, 9.7));
  assert.ok(Math.abs(oldGap(t2, t3) - 0.288) < 5e-3, `the true AABB said ${oldGap(t2, t3).toFixed(3)}`);
  assert.ok(Math.abs(placardGap(t2, t3) - 0.670) < 5e-3, `the SAT says ${placardGap(t2, t3).toFixed(3)}`);
  // And the SAT gap is a FLOOR on the true clear ground: it never exceeds the
  // centre distance, and for two axis-aligned cards it is the axis gap, not
  // the hypot the old form returned when both axes were clear.
  const p = placardFootprint({ x: 0, z: 0, azim: 0 });
  const q = placardFootprint({ x: 6, z: 4, azim: 0 });
  assert.ok(Math.abs(oldGap(p, q) - Math.hypot(6 - PLACARD_W, 4 - PLACARD_D)) < 1e-12, 'the old form: hypot of the two axis gaps');
  assert.ok(Math.abs(placardGap(p, q) - Math.max(6 - PLACARD_W, 4 - PLACARD_D)) < 1e-12, 'the SAT: the best single axis');
  cells((mat, N, k, arc) => {
    if (k === 0) return;
    const a2 = placardFootprint(seatAnchor(k - 1, N, arc, mat.w, mat.d));
    const b2 = placardFootprint(seatAnchor(k, N, arc, mat.w, mat.d));
    assert.ok(placardGap(a2, b2) <= Math.hypot(a2.x - b2.x, a2.z - b2.z), 'never more than the centre distance');
  });
});

t('ring P9: no two cards overlap anywhere; the 0.30 floor holds everywhere but two RECORDED cells', () => {
  // Every cell measured (DESIGN-RING §2.2). Two cells under the floor, recorded,
  // not weakened: close/N=7 = 0.049 and close+tower/N=8 = 0.263 (v3's rectangle
  // recorded a -0.568 OVERLAP at close; the ring overlaps nowhere).
  const RECORDED = [
    { id: 'close', N: 7, gap: 0.049 },
    { id: 'close+tower', N: 8, gap: 0.263 },
  ];
  const seen = [];
  for (const mat of MATS) {
    for (const N of NS.filter((n) => n >= 2)) {
      const boxes = ringBoxes(mat, N);
      let worst = Infinity;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) worst = Math.min(worst, placardGap(boxes[i], boxes[j]));
      assert.ok(worst > 0, `${mat.id} N=${N}: cards overlap by ${(-worst).toFixed(3)}`);
      const rec = RECORDED.find((r) => r.id === mat.id && r.N === N);
      if (rec) {
        seen.push(rec);
        assert.ok(Math.abs(worst - rec.gap) < 5e-3, `${mat.id} N=${N}: recorded ${rec.gap}, measured ${worst.toFixed(3)}`);
      } else {
        assert.ok(worst >= PLACARD_GAP, `${mat.id} N=${N}: worst pair is ${worst.toFixed(3)} apart — the floor is 0.30`);
      }
    }
  }
  assert.equal(seen.length, RECORDED.length, 'both recorded cells were visited');
  // The medium table, to the digit, for the reader.
  const medium = {};
  for (const N of [2, 3, 4, 5, 6, 7, 8]) {
    const boxes = ringBoxes(MATS[2], N);
    let worst = Infinity;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) worst = Math.min(worst, placardGap(boxes[i], boxes[j]));
    medium[N] = Number(worst.toFixed(2));
  }
  assert.equal(MATS[2].id, 'medium');
  assert.deepEqual(medium, { 2: 6.9, 3: 7.66, 4: 3.76, 5: 2.92, 6: 3.76, 7: 0.7, 8: 1.61 });
});

t('ring: every card is inside the shadow frustum, on the OBB\'s true AABB', () => {
  // updateShadowFrustum (js/main.js): +-(TABLE_W/2 + 4) by +-(TABLE_D/2 + 6).
  // Stricter for free now that hx/hz are right at a diagonal; tightest slack
  // 0.169 at close+tower N7 k4, recorded (the design's 0.223 at medium+tower
  // N8 k2 was derived at a 120-degree arc; 150 is what shipped).
  let tight = Infinity;
  let where = '';
  cells((mat, N, k, arc) => {
    const box = placardFootprint(seatAnchor(k, N, arc, mat.w, mat.d));
    const sx = mat.w / 2 + 4 - (Math.abs(box.x) + box.hx);
    const sz = mat.d / 2 + 6 - (Math.abs(box.z) + box.hz);
    assert.ok(sx >= 0, `${mat.id} ${k}/${N} in x (${sx.toFixed(3)})`);
    assert.ok(sz >= 0, `${mat.id} ${k}/${N} in z (${sz.toFixed(3)})`);
    const s = Math.min(sx, sz);
    if (s < tight) { tight = s; where = `${mat.id} N${N} k${k}`; }
  });
  assert.ok(Math.abs(tight - 0.169) < 5e-3, `tightest slack ${tight.toFixed(3)} at ${where} (recorded 0.169 at close+tower N7 k4)`);
  assert.equal(where, 'close+tower N7 k4');
});

t('ring P12: under a tower the chairs spread over the front arc — equal pitch, symmetric, off the back wall', () => {
  // theta_k = TOWER_ARC * (2k - N + 1) / N: pitch 2*TOWER_ARC/N, symmetric about
  // the front, every chair >= 48.75 degrees from pi, and no card's footprint
  // on the back wall at any tower mat (DESIGN-RING §9).
  const table = {
    1: [0], 2: [-75, 75], 3: [-100, 0, 100], 4: [-112.5, -37.5, 37.5, 112.5], 5: [-120, -60, 0, 60, 120],
    6: [-125, -75, -25, 25, 75, 125], 7: [-128.571, -85.714, -42.857, 0, 42.857, 85.714, 128.571],
    8: [-131.25, -93.75, -56.25, -18.75, 18.75, 56.25, 93.75, 131.25],
  };
  for (const N of NS) {
    const th = [];
    for (let k = 0; k < N; k++) {
      const t = placeTheta(k, N, 1);
      assert.ok(t >= 0 && t < 2 * Math.PI, `(${k}, ${N}, arc) is wrapped into [0, 2pi)`);
      th.push(wrapPi(t));
    }
    for (let k = 1; k < N; k++) assert.ok(Math.abs((th[k] - th[k - 1]) - (2 * TOWER_ARC) / N) < 1e-12, `N=${N}: pitch is 2*ARC/N`);
    for (let k = 0; k < N; k++) {
      assert.ok(Math.abs(th[k] + th[N - 1 - k]) < 1e-12, `N=${N}: symmetric about the front`);
      assert.ok(Math.abs(th[k] / DEG - table[N][k]) < 1e-3, `N=${N} k=${k}: ${(th[k] / DEG).toFixed(3)} vs ${table[N][k]}`);
      assert.ok(Math.PI - Math.abs(th[k]) >= 48.75 * DEG - 1e-9, `N=${N} k=${k}: ${(180 - Math.abs(th[k]) / DEG).toFixed(2)} degrees from pi`);
      assert.notEqual(placeTheta(k, N, 1), Math.PI, 'azim pi is forbidden while socketed');
    }
    if (N % 2 === 1) assert.ok(Object.is(placeTheta((N - 1) / 2, N, 1), 0), `odd N keeps a chair at the front, +0`);
    else assert.ok(th.every((a) => Math.abs(a) > 1e-9), 'even N has no chair at the front');
  }
  for (const mat of MATS.filter((m) => m.towerUp)) {
    for (const N of NS) for (let k = 0; k < N; k++) {
      const a = seatAnchor(k, N, 1, mat.w, mat.d);
      const f = placardFootprint(a);
      assert.ok(a.relocated, 'an arc card knows it moved');
      assert.ok(!(a.z + f.hz <= -mat.d / 2 + 1e-9), `${mat.id} ${k}/${N}: the card is not on the back wall`);
      // The outermost chairs (N=7/8 at wide+tower) stand BESIDE the back corner
      // on a SIDE wall: their centre may be behind the back plane, their
      // footprint reaches forward of it, and they are outboard of the x wall.
      if (a.z <= -mat.d / 2) {
        assert.ok(Math.abs(a.x) - f.hx - mat.w / 2 >= 0.0999, `${mat.id} ${k}/${N}: a chair behind the back plane stands on a side wall`);
      }
    }
  }
});

t('ring: no arc card lands inside a tower volume, N=1..8, at every tower mat', () => {
  // towerVolumes (js/main.js) at the classic portal spec — the same seven boxes
  // the rectangle's row above uses.
  const S = 1.25;
  for (const mat of MATS.filter((m) => m.towerUp)) {
    const z0 = -mat.d / 2;
    const vols = {
      socket: { x: 0, z: z0 - 2.0 * S, hx: 5.2 * S / 2, hz: 4.4 * S / 2 },
      apron:  { x: 0, z: z0 - 1.284 * S, hx: 3.8 * S / 2, hz: 5.85 * S / 2 },
      shaft:  { x: 0, z: z0 - 1.6 * S, hx: 1.7 * S, hz: 1.7 * S },
      aim:    { x: 0, z: z0 - 1.6 * S, hx: 0.8 * S / 2, hz: 0.8 * S / 2 },
      cowl:   { x: 0, z: z0 + 0.05 * S, hx: 4.2 * S / 2, hz: 0.3 * S / 2 },
      hood:   { x: 0, z: z0 + 0.5 * S, hx: 4.6 * S / 2, hz: 1.0 * S / 2 },
      lip:    { x: 0, z: z0 + 2.8, hx: 4.8 / 2, hz: 2.2 / 2 },
    };
    for (const N of NS) for (let k = 0; k < N; k++) {
      const box = placardFootprint(seatAnchor(k, N, 1, mat.w, mat.d));
      for (const [name, v] of Object.entries(vols)) {
        const clear = Math.max(Math.abs(box.x - v.x) - box.hx - v.hx, Math.abs(box.z - v.z) - box.hz - v.hz);
        assert.ok(clear > 0, `${mat.id} ${k}/${N} clears the ${name} (${clear.toFixed(3)})`);
      }
    }
  }
});

t('ring P11: no seat angle stands within 0.4 degrees of a rim corner — the anchor discontinuity is unreachable', () => {
  // rayRect's corner tie-break is a total order, so this is a RECORDED margin,
  // not a design constraint: medium 1.35 (N3 k2), wide 1.38, close 1.16;
  // under the 150-degree arc wide+tower 1.64 (N8 k0), medium+tower 1.63
  // (N7 k2), close+tower 1.30 (N7 k2). (The design's 0.52 / 0.89 were the
  // 120-degree arc's numbers.)
  const margins = {};
  for (const mat of MATS) {
    const arc = mat.towerUp ? 1 : 0;
    const ca = Math.atan2(mat.w / 2, mat.d / 2);
    const corners = [ca, Math.PI - ca, Math.PI + ca, 2 * Math.PI - ca];
    let mn = Infinity;
    for (const N of NS) for (let k = 0; k < N; k++) {
      const th = placeTheta(k, N, arc);
      for (const c of corners) mn = Math.min(mn, Math.abs(wrapPi(th - c)));
    }
    margins[mat.id] = mn / DEG;
    assert.ok(mn > 0.4 * DEG, `${mat.id}: nearest seat is ${(mn / DEG).toFixed(2)} degrees from a corner`);
  }
  assert.ok(Math.abs(margins.medium - 1.35) < 0.02, `medium ${margins.medium.toFixed(2)}`);
  assert.ok(Math.abs(margins.wide - 1.38) < 0.02, `wide ${margins.wide.toFixed(2)}`);
  assert.ok(Math.abs(margins.close - 1.16) < 0.02, `close ${margins.close.toFixed(2)}`);
  assert.ok(Math.abs(margins['wide+tower'] - 1.64) < 0.02, `wide+tower ${margins['wide+tower'].toFixed(2)}`);
  assert.ok(Math.abs(margins['medium+tower'] - 1.63) < 0.02, `medium+tower ${margins['medium+tower'].toFixed(2)}`);
  assert.ok(Math.abs(margins['close+tower'] - 1.30) < 0.02, `close+tower ${margins['close+tower'].toFixed(2)}`);
});

// --- the spawn line: P10 --------------------------------------------------------

t('ring P10: the line is born SPAWN_IN clear of its nearest wall at every seat; the quarter turns are spawnDie\'s literals to the bit', () => {
  cells((mat, N, k, arc) => {
    const th = placeTheta(k, N, arc);
    const m = spawnMid(th, mat.w, mat.d);
    const nearest = Math.min(mat.w / 2 - Math.abs(m.x), mat.d / 2 - Math.abs(m.z));
    assert.ok(Math.abs(nearest - SPAWN_IN) < 1e-9, `${mat.id} ${k}/${N}: born ${nearest.toFixed(4)} from the nearest wall`);
    assert.ok(Math.abs(m.tx * Math.sin(th) + m.tz * Math.cos(th)) < 1e-12, 'the tangent is perpendicular to theta');
    assert.ok(Math.abs(Math.hypot(m.tx, m.tz) - 1) < 1e-12, 'and unit');
    assert.equal(m.theta, th);
  });
  for (const mat of MATS) {
    const W = mat.w;
    const D = mat.d;
    // spawnDie's four literals (js/main.js:5527-5530), in their own form.
    const front = spawnMid(0, W, D);
    assert.equal(front.z, D / 2 - 2.2, `${mat.id} front z is TABLE_D / 2 - 2.2`);
    assert.ok(Object.is(front.x, 0), 'and x is +0');
    assert.ok(front.tx === 1 && front.tz === 0, 'side 0 runs along +x (tz is -0: `-s` of a snapped 0; x + -0 is x)');
    const back = spawnMid(Math.PI, W, D);
    assert.equal(back.z, -D / 2 + 2.2, `${mat.id} back z is -TABLE_D / 2 + 2.2`);
    assert.ok(Object.is(back.x, 0));
    const left = spawnMid(3 * Math.PI / 2, W, D);
    assert.equal(left.x, -W / 2 + 2.2, `${mat.id} left x is -TABLE_W / 2 + 2.2`);
    assert.ok(Object.is(left.z, 0));
    const right = spawnMid(Math.PI / 2, W, D);
    assert.equal(right.x, W / 2 - 2.2, `${mat.id} right x is TABLE_W / 2 - 2.2`);
    assert.ok(Object.is(right.z, 0));
    // A lone die at a quarter turn sits on its own ray: at is +0.
    for (const th of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      const one = laneAndChord(th, W, D, HULL_MAX, 1, poolSpread(W, 1));
      assert.ok(Object.is(one.at, 0), `${mat.id} theta ${th}: a lone die's at is +0`);
      assert.equal(one.spread, Math.min(poolSpread(W, 1), one.room));
    }
  }
});

t('ring: the ray yields to the pool — the line never leaves the chord, the pitch never collapses, and a lone die is born on its ray', () => {
  const worst = {};
  cells((mat, N, k, arc) => {
    const th = placeTheta(k, N, arc);
    // 1.2 is the design's d20 hull (its recorded worst pitches); HULL_MAX 1.25
    // is the shipped widest and is swept for the floor as well.
    for (const hull of [0.7, 0.9, 1.2, HULL_MAX]) {
      for (let count = 1; count <= 12; count++) {
        const want = poolSpread(mat.w, count);
        const ch = laneAndChord(th, mat.w, mat.d, hull, count, want);
        assert.ok(ch.spread <= want + 1e-12, 'a chord never WIDENS the pool');
        assert.ok(ch.spread <= ch.room + 1e-12, 'spread <= room: fitU clamps only the jitter');
        assert.ok(ch.at - ch.spread / 2 >= ch.lo - 1e-9 && ch.at + ch.spread / 2 <= ch.hi + 1e-9,
          `${mat.id} ${k}/${N} hull ${hull} ${count} dice: the line ends inside the chord`);
        // Every point of the line is inside the hull-shrunk mat.
        for (const u of [ch.at - ch.spread / 2, ch.at, ch.at + ch.spread / 2]) {
          const x = ch.mid.x + u * ch.mid.tx;
          const z = ch.mid.z + u * ch.mid.tz;
          assert.ok(Math.abs(x) <= mat.w / 2 - hull - 0.05 + 1e-9 && Math.abs(z) <= mat.d / 2 - hull - 0.05 + 1e-9,
            `${mat.id} ${k}/${N}: (${x.toFixed(2)}, ${z.toFixed(2)}) is a legal spawn for hull ${hull}`);
        }
        if (count === 1 && hull === 0.7) assert.ok(Object.is(ch.at, 0), `${mat.id} ${k}/${N}: a lone d6 is born on its own ray`);
        if (count === 6) {
          const pitch = ch.spread / 5;
          assert.ok(pitch >= 0.5, `${mat.id} ${k}/${N} hull ${hull}: 6d6 pitch ${pitch.toFixed(3)}`);
          if (hull <= 1.2 && (!(mat.id in worst) || pitch < worst[mat.id])) worst[mat.id] = pitch;
        }
      }
    }
  });
  // Recorded worst 6d6 pitch per mat at hulls 0.7/0.9/1.2 (DESIGN-RING §2.3):
  // medium 0.83 (N5 k1, d20), wide 0.93, close 0.54 (N4 k1 d20); the tower
  // mats at the 150-degree arc 0.567 / 0.578 / 0.568 (the design's 0.55-0.64
  // band, measured at 120 degrees, still holds). At HULL_MAX 1.25 the floor
  // sweep above reads 0.882 / 0.788 / 0.520 / 0.538-0.550 — all over 0.5.
  assert.ok(Math.abs(worst.medium - 0.83) < 0.01, `medium ${worst.medium.toFixed(3)}`);
  assert.ok(Math.abs(worst.wide - 0.93) < 0.01, `wide ${worst.wide.toFixed(3)}`);
  assert.ok(Math.abs(worst.close - 0.54) < 0.01, `close ${worst.close.toFixed(3)}`);
  for (const id of ['wide+tower', 'medium+tower', 'close+tower']) {
    assert.ok(worst[id] >= 0.55 - 5e-3 && worst[id] <= 0.64 + 5e-3, `${id} ${worst[id].toFixed(3)}`);
  }
  // The worked medium rows (§2.3), 6d6 at hull 0.7.
  const row = (k, N) => laneAndChord(placeTheta(k, N, 0), 11, 6.7, 0.7, 6, poolSpread(11, 6));
  const r31 = row(1, 3);
  assert.ok(Math.abs(r31.mid.x - 1.992) < 5e-3 && Math.abs(r31.mid.z + 1.150) < 5e-3, 'N3 k1 mid (1.992, -1.150)');
  assert.ok(Math.abs(r31.room - 6.0) < 5e-3 && Math.abs(r31.spread - 6.0) < 5e-3 && Math.abs(r31.at + 1.33) < 5e-3,
    `N3 k1 6d6: chord 6.00, spread 6.00, at -1.33 (${r31.room.toFixed(3)}, ${r31.spread.toFixed(3)}, ${r31.at.toFixed(3)})`);
  const r61 = row(1, 6);
  assert.ok(Math.abs(r61.at - 1.33) < 5e-3, `N6 k1 6d6 at +1.33 (${r61.at.toFixed(3)})`);
  const r81 = row(1, 8);
  assert.ok(Math.abs(r81.room - 7.14) < 5e-3 && Math.abs(r81.spread - 6.6) < 5e-3 && Math.abs(r81.at - 1.25) < 5e-3,
    `N8 k1 6d6: chord 7.14, spread 6.60, at +1.25`);
  const r41 = row(1, 4);
  assert.ok(Math.abs(r41.room - 5.2) < 5e-3 && Object.is(r41.at, 0), 'N4 k1 (the right head): chord 5.20, on its ray');
});

t('ring: sideFor names the wall a seat is behind, spawnDie\'s four names', () => {
  const { w, d } = ZOOMS.medium;
  assert.equal(sideFor(0, w, d), 0);
  assert.equal(sideFor(Math.PI, w, d), 1);
  assert.equal(sideFor(3 * Math.PI / 2, w, d), 2);
  assert.equal(sideFor(Math.PI / 2, w, d), 3);
  assert.equal(sideFor(placeTheta(1, 3, 0), w, d), 3, 'N3 k1 at 120 degrees is behind the right wall');
  assert.equal(sideFor(placeTheta(2, 3, 0), w, d), 2);
  assert.equal(sideFor(placeTheta(1, 8, 0), w, d), 0, 'N8 k1 at 45 degrees on a 1.64:1 mat is behind the front wall');
  cells((mat, N, k, arc) => {
    const th = placeTheta(k, N, arc);
    const side = sideFor(th, mat.w, mat.d);
    // The wall the seat's ray LEAVES THE MAT through — rayRect's own pick on
    // the rim rectangle (not the spawn rectangle: shrinking both pairs by 2.2
    // changes the aspect, so a 120-degree seat on the wide mat is behind the
    // right wall while its spawn midpoint is nearest the back one).
    const { s, c } = seatTrig(th);
    const r = rayRect(th, mat.w / 2, mat.d / 2);
    const onX = Math.abs(Math.abs(r * s) - mat.w / 2) < 1e-9;
    const want = onX ? (s >= 0 ? 3 : 2) : (c >= 0 ? 0 : 1);
    assert.equal(side, want, `${mat.id} ${k}/${N}: side ${side} is the wall the ray leaves through`);
  });
});

// --- the wedge: P13, P14, the polygon ----------------------------------------------

t('ring P13: inWedge is closed on both boundaries, the mat\'s centre belongs to nobody, the cut-out\'s edge is in', () => {
  const { w, d } = ZOOMS.medium;
  const hw = w / 2;
  const hd = d / 2;
  const off = PLACE_PUSH - 1;
  for (const N of NS) {
    for (const arc of [0, 1]) for (let k = 0; k < N; k++) {
      const R = wedgeFor(k, N, arc, w, d);
      assert.equal(inWedge(R, 0, 0), false, `N=${N} k=${k} arc ${arc}: the centre is in no wedge`);
      assert.equal(inWedge(R, hw * off * 0.5, hd * off * 0.5), false, 'inside the cut-out is out');
      if (R.half < Math.PI) {
        for (const sign of [-1, 1]) {
          const b = R.theta + sign * R.half;
          // A hair inside the boundary is in; a hair outside is out. (The
          // exact boundary is closed — pinned below on the open ring, where
          // atan2 reproduces the angle; a 150-degree arc boundary sits an ulp
          // off its own atan2 and is not a fair witness.)
          for (const eps of [1e-9, 1e-6]) {
            const bi = b - sign * eps;
            const { s, c } = seatTrig(bi);
            const r = 0.9 * rayRect(bi, hw, hd);
            assert.equal(inWedge(R, r * s, r * c), true, `N=${N} k=${k} arc ${arc}: ${eps} inside the boundary at ${(b / DEG).toFixed(1)} is in`);
            const bo = b + sign * eps;
            const { s: so, c: co } = seatTrig(bo);
            const ro = 0.9 * rayRect(bo, hw, hd);
            assert.equal(inWedge(R, ro * so, ro * co), false, `N=${N} k=${k} arc ${arc}: ${eps} outside the boundary at ${(b / DEG).toFixed(1)} is out`);
          }
        }
      }
    }
  }
  // A point ON a boundary is in BOTH neighbours — closed on both sides. Pinned
  // on the boundaries a double can hold exactly: N=2's (the x axis) and N=4's
  // (the diagonals, atan2(r, r) = pi/4). RECORDED (S1): a boundary point
  // CONSTRUCTED by trig can land an ulp past `half` in both neighbours' tests
  // — medium N=6 seats 4/5 at 270 degrees reads in NEITHER — which is why the
  // scenarios claim a centroid with DIE_W of angular slack and never a die's
  // exact azimuth. No real die coordinate is exactly on a boundary.
  const both = (A, B, x, z, why) => assert.ok(inWedge(A, x, z) && inWedge(B, x, z), why);
  both(wedgeFor(0, 2, 0, w, d), wedgeFor(1, 2, 0, w, d), 3, 0, 'N=2: (3, 0) on the x axis is in both halves');
  both(wedgeFor(0, 2, 0, w, d), wedgeFor(1, 2, 0, w, d), -3, 0, 'N=2: (-3, 0) too');
  both(wedgeFor(0, 4, 0, w, d), wedgeFor(1, 4, 0, w, d), 2, 2, 'N=4: (2, 2) is in 0 and 1');
  both(wedgeFor(1, 4, 0, w, d), wedgeFor(2, 4, 0, w, d), 2, -2, 'N=4: (2, -2) is in 1 and 2');
  both(wedgeFor(2, 4, 0, w, d), wedgeFor(3, 4, 0, w, d), -2, -2, 'N=4: (-2, -2) is in 2 and 3');
  both(wedgeFor(3, 4, 0, w, d), wedgeFor(0, 4, 0, w, d), -2, 2, 'N=4: (-2, 2) is in 3 and 0');
  // And a constructed boundary point is never in MORE than its two neighbours,
  // while a hair inside is in exactly one.
  for (const N of [2, 3, 4, 5, 6, 7, 8]) {
    const R = [];
    for (let k = 0; k < N; k++) R.push(wedgeFor(k, N, 0, w, d));
    for (let k = 0; k < N; k++) {
      const b = R[k].theta + R[k].half;
      const on = seatTrig(b);
      const r = 0.7 * rayRect(b, hw, hd);
      const cnt = R.filter((W) => inWedge(W, r * on.s, r * on.c)).length;
      assert.ok(cnt <= 2, `N=${N} boundary ${k}: in ${cnt} wedges`);
      const inn = seatTrig(b - 1e-9);
      assert.equal(R.filter((W) => inWedge(W, r * inn.s, r * inn.c)).length, 1, `N=${N}: a hair inside boundary ${k} is in exactly one wedge`);
    }
  }
  // The cut-out's edge is IN (the cut-out is open).
  const R4 = wedgeFor(1, 4, 0, w, d);                    // theta pi/2
  assert.equal(inWedge(R4, hw * off, 0), true, 'a point on the cut-out\'s edge, on the theta ray, is in');
  assert.equal(inWedge(R4, hw * off - 1e-9, 0), false, 'a hair inside it is out');
  assert.equal(inWedge(R4, hw + 0.01, 0), false, 'off the felt is in no wedge');
  assert.equal(inWedge(R4, -2, 0.1), false, 'the far side of the mat is not this wedge');
  assert.equal(inWedge(null, 0, 0), false, 'no wedge, nothing is in it');
  // N=1 open: the whole mat minus the cut-out.
  const R1 = wedgeFor(0, 1, 0, w, d);
  assert.ok(R1.half >= Math.PI);
  assert.equal(inWedge(R1, -5, -3), true);
  assert.equal(inWedge(R1, 5, 3), true);
  assert.equal(inWedge(R1, 0, 0), false);
  assert.equal(inWedge(R1, hw, hd), true, 'the rim itself is in');
  assert.equal(inWedge(R1, hw + 1e-9, hd), false);
});

t('ring P14: the wedges of one table are disjoint away from their boundaries and cover the mat minus the cut-out; shares recorded', () => {
  const { w, d } = ZOOMS.medium;
  const hw = w / 2;
  const hd = d / 2;
  const S = 400;
  const shares = {};
  for (const [N, arc] of [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [3, 1], [8, 1]]) {
    const dd = arc ? d + TOWER_MAT_EXTRA : d;
    const hdd = dd / 2;
    const R = [];
    for (let k = 0; k < N; k++) R.push(wedgeFor(k, N, arc, w, dd));
    const cnt = new Array(N).fill(0);
    let tot = 0;
    let uncovered = 0;
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < S; j++) {
        const x = -hw + (w * (i + 0.5)) / S;
        const z = -hdd + (dd * (j + 0.5)) / S;
        tot++;
        let ins = 0;
        for (let k = 0; k < N; k++) if (inWedge(R[k], x, z)) { ins++; cnt[k]++; }
        const cut = Math.abs(x) < hw * R[0].off && Math.abs(z) < hdd * R[0].off;
        if (!arc) {
          assert.ok(cut ? ins === 0 : ins >= 1, `N=${N}: (${x.toFixed(2)}, ${z.toFixed(2)}) is in ${ins} wedges`);
        }
        if (ins > 1) {
          // Only on a boundary — a grid point within a hair of theta +- half.
          const az = Math.atan2(x, z);
          const onB = R.some((r) => Math.abs(Math.abs(wrapPi(az - r.theta)) - r.half) < 1e-9);
          assert.ok(onB, `N=${N} arc ${arc}: (${x.toFixed(3)}, ${z.toFixed(3)}) is in ${ins} wedges off any boundary`);
        }
        if (arc && ins === 0 && !cut) uncovered++;
      }
    }
    shares[`${N}${arc ? 'T' : ''}`] = cnt.map((c) => Number(((100 * c) / tot).toFixed(1)));
    if (arc) assert.ok(uncovered > 0, `N=${N} under a tower: the back sector belongs to the machine (${uncovered} cells)`);
  }
  // DESIGN-RING §2.5, grid-sampled at 400x400: equal ANGLES on a 1.64:1 mat are
  // not equal AREAS — recorded, not fixed.
  const near = (got, want) => got.length === want.length && got.every((g, i) => Math.abs(g - want[i]) <= 0.15);
  assert.ok(near(shares['1'], [96.0]), `N=1 ${shares['1']}`);
  assert.ok(near(shares['2'], [48.0, 48.0]), `N=2 ${shares['2']}`);
  assert.ok(near(shares['3'], [25.3, 35.4, 35.4]), `N=3 ${shares['3']}`);
  assert.ok(near(shares['4'], [14.6, 33.4, 14.6, 33.4]), `N=4 ${shares['4']}`);
  assert.ok(near(shares['6'], [8.4, 19.8, 19.8, 8.4, 19.8, 19.8]), `N=6 ${shares['6']}`);
  assert.ok(near(shares['8'], [6.1, 12.8, 16.3, 12.8, 6.1, 12.8, 16.3, 12.8]), `N=8 ${shares['8']}`);
});

t('ring: the wedge polygon is deterministic, every vertex is on the rim, and no vertex repeats', () => {
  cells((mat, N, k, arc) => {
    const A = wedgeFor(k, N, arc, mat.w, mat.d);
    const B = wedgeFor(k, N, arc, mat.w, mat.d);
    assert.deepEqual(A, B, 'two calls, one polygon');
    for (let i = 0; i < A.outer.length; i++) {
      assert.ok(A.outer[i][0] === B.outer[i][0] && A.outer[i][1] === B.outer[i][1], 'bit-equal vertices');
      const [x, z] = A.outer[i];
      assert.ok(Math.abs(Math.max(Math.abs(x) / A.hw, Math.abs(z) / A.hd) - 1) < 1e-9, `${mat.id} ${k}/${N}: vertex ${i} (${x}, ${z}) is on the rim`);
      assert.ok(Math.abs(x) <= A.hw + 1e-9 && Math.abs(z) <= A.hd + 1e-9);
      assert.equal(A.inner[i][0], x * A.off, 'inner is outer scaled by off');
      assert.equal(A.inner[i][1], z * A.off);
    }
    if (N >= 2 || arc) {
      const seen = new Set(A.outer.map(([x, z]) => `${x},${z}`));
      assert.equal(seen.size, A.outer.length, `${mat.id} ${k}/${N}: no repeated vertex`);
      assert.ok(A.outer.length >= 2 && A.outer.length <= 6, `${mat.id} ${k}/${N}: ${A.outer.length} vertices`);
    }
    // Corners are emitted as the literals +-hw / +-hd.
    for (const [x, z] of A.outer) {
      if (Math.abs(Math.abs(x) - A.hw) < 1e-9 && Math.abs(Math.abs(z) - A.hd) < 1e-9) {
        assert.ok(Math.abs(x) === A.hw && Math.abs(z) === A.hd, `${mat.id} ${k}/${N}: a corner is the literal (${x}, ${z})`);
      }
    }
    assert.deepEqual({ seat: A.seat, seats: A.seats, arc: A.arc, theta: A.theta }, { seat: k, seats: N, arc, theta: placeTheta(k, N, arc) });
    assert.equal(A.half, (arc ? TOWER_ARC : Math.PI) / N);
    assert.equal(A.off, PLACE_PUSH - 1);
  });
  // The worked shapes: N=2 seat 0 is the front half-mat, walked -x to +x.
  const front = wedgeFor(0, 2, 0, 11, 6.7);
  assert.deepEqual(front.outer, [[-5.5, 0], [-5.5, 3.35], [5.5, 3.35], [5.5, 0]]);
  const whole = wedgeFor(0, 1, 0, 11, 6.7);
  assert.deepEqual(whole.outer, [[-5.5, -3.35], [-5.5, 3.35], [5.5, 3.35], [5.5, -3.35]]);
  assert.deepEqual(whole.inner, whole.outer.map(([x, z]) => [x * 0.19999999999999996, z * 0.19999999999999996]));
  // The N=3 seat 1 wedge (60..180 degrees) takes the back-right corner literally.
  const w31 = wedgeFor(1, 3, 0, 11, 6.7);
  assert.equal(w31.outer.length, 3);
  assert.deepEqual(w31.outer[1], [5.5, -3.35]);
  assert.deepEqual(w31.outer[2], [0, -3.35]);
});

// --- the aim ------------------------------------------------------------------------

const RING_BAD = [{}, { seat: 0 }, { seat: 1, seats: 1 }, { seat: 0, seats: 9 }, { seat: -1, seats: 2 },
  { seat: 0.5, seats: 2 }, { seat: '0', seats: 2 }, { seat: 0, seats: 2, arc: 2 }];

t('ring: a bad stamp gets the one shared identity, by reference — and no wedge', () => {
  for (const b of RING_BAD) {
    assert.equal(seatAim(b.seat, b.seats, b.arc | 0, 11, 6.7, THROW_TARGET), AIM_ZERO, `${JSON.stringify(b)} is not a stamp`);
    assert.equal(wedgeFor(b.seat, b.seats, b.arc | 0, 11, 6.7), null);
    assert.equal(seatAnchor(b.seat, b.seats, b.arc | 0, 11, 6.7), null);
  }
  assert.equal(seatAim(0, 2, 2, 11, 6.7, THROW_TARGET), AIM_ZERO, 'arc 2 is not a flag');
});

t('ring: the dial off returns the identity for every stamp, N=1..8', () => {
  assert.equal(PLACE_AIM.on, 1);
  const was = { ...PLACE_AIM };
  try {
    PLACE_AIM.on = 0;
    for (const N of NS) for (let k = 0; k < N; k++) {
      assert.equal(seatAim(k, N, 0, 11, 6.7, THROW_TARGET), AIM_ZERO);
      assert.equal(seatAim(k, N, 1, 11, 11.2, THROW_TARGET), AIM_ZERO);
    }
  } finally {
    for (const k of Object.keys(PLACE_AIM)) delete PLACE_AIM[k];
    Object.assign(PLACE_AIM, was);
  }
  assert.deepEqual(PLACE_AIM, was, 'the shipped dial is back');
});

t('ring: the aim stands on the theta ray, inside its wedge, its WHOLE box a hull clear of every rim, at every cell', () => {
  let slack = Infinity;
  cells((mat, N, k, arc) => {
    const a = seatAim(k, N, arc, mat.w, mat.d, THROW_TARGET);
    const { s, c } = seatTrig(placeTheta(k, N, arc));
    assert.ok(Math.abs(a.x * c - a.z * s) < 1e-9, `${mat.id} ${k}/${N}: the aim is on the theta ray`);
    assert.ok(a.x * s + a.z * c > 0, 'and on the outward half of it');
    assert.ok(a.kx > 0 && a.kz > 0, `${mat.id} ${k}/${N}: a box, not a point`);
    assert.ok(a.kx <= 1 + 1e-12 && a.kz <= 1 + 1e-12, 'shrunk, never grown');
    const bw = mat.w * THROW_TARGET * a.kx / 2;
    const bd = mat.d * THROW_TARGET * a.kz / 2;
    const sx = mat.w / 2 - AIM_HULL - (Math.abs(a.x) + bw);
    const sz = mat.d / 2 - AIM_HULL - (Math.abs(a.z) + bd);
    assert.ok(sx >= -1e-9 && sz >= -1e-9, `${mat.id} ${k}/${N}: the box's corners are >= ${AIM_HULL} from every rim (${sx.toFixed(4)}, ${sz.toFixed(4)})`);
    slack = Math.min(slack, sx, sz);
    const R = wedgeFor(k, N, arc, mat.w, mat.d);
    assert.ok(inWedge(R, a.x, a.z), `${mat.id} ${k}/${N}: the centre is in its wedge`);
    assert.equal(a.own, 1, 'every seat is own — each die aims from its own point on the tangent');
    assert.equal(a.k, PLACE_AIM.speed);
    assert.equal(a.h, PLACE_AIM.h);
    assert.equal(a.spin, PLACE_AIM.spin);
  });
  assert.ok(slack < 1e-12 && slack > -1e-12, `the cap binds exactly somewhere (min slack ${slack.toExponential(2)})`);
});

t('ring: seat 0 at medium aims at 1.92125 — the v3.1 front aim, and the shipped centre slot, to the digit', () => {
  const a = seatAim(0, 1, 0, 11, 6.7, THROW_TARGET);
  assert.ok(Math.abs(a.z - 1.92125) < 1e-9, `z ${a.z}`);
  assert.ok(Object.is(a.x, 0), 'x is +0');
  assert.equal(a.z, aimFor(0, 0, 11, 6.7, THROW_TARGET).z, 'the same double the rectangle\'s centre slot aims at');
  assert.ok(Math.abs(a.kx - 0.483) < 1e-3 && Math.abs(a.kz - 0.133) < 1e-3, `kx ${a.kx.toFixed(3)} kz ${a.kz.toFixed(3)}`);
  for (const N of NS) assert.deepEqual(seatAim(0, N, 0, 11, 6.7, THROW_TARGET).z, a.z, `seat 0 of ${N} aims at the same radius`);
  // Worked rows (DESIGN-RING §2.4).
  const b = seatAim(1, 2, 0, 11, 6.7, THROW_TARGET);
  assert.ok(Math.abs(b.z + 1.92125) < 1e-9 && Object.is(b.x, 0), 'seat 1 of 2 mirrors it');
  const c31 = seatAim(1, 3, 0, 11, 6.7, THROW_TARGET);
  assert.ok(Math.abs(c31.x - 2.932) < 5e-3 && Math.abs(c31.z + 1.693) < 5e-3, `N3 k1 aims at (2.932, -1.693): (${c31.x.toFixed(3)}, ${c31.z.toFixed(3)})`);
  const c41 = seatAim(1, 4, 0, 11, 6.7, THROW_TARGET);
  assert.ok(Math.abs(c41.x - 3.856) < 5e-3 && Object.is(c41.z, 0), `N4 k1 aims at (3.856, 0)`);
  const c81 = seatAim(1, 8, 0, 11, 6.7, THROW_TARGET);
  assert.ok(Math.abs(c81.x - 1.722) < 5e-3 && Math.abs(c81.z - 1.722) < 5e-3, `N8 k1 aims at (1.722, 1.722)`);
});

t('ring: the push ratio — at seat 0 the aim stands 1.0456x where a push of 1.0 would put it', () => {
  // ra0 = capEdge - bl/2 with bl = (capEdge - r0) * box and r0 = (PUSH - 1) * rim.
  // PLACE_PUSH is a constant, so the 1.0 figure is the same expression at r0 = 0.
  const hd = 6.7 / 2;
  const capEdge = hd - AIM_HULL;
  const r0 = (PLACE_PUSH - 1) * hd;
  const ra12 = capEdge - ((capEdge - r0) * PLACE_AIM.box) / 2;
  const ra10 = capEdge - (capEdge * PLACE_AIM.box) / 2;
  assert.ok(Math.abs(ra12 - seatAim(0, 1, 0, 11, 6.7, THROW_TARGET).z) < 1e-12, 'the replicated expression is the module\'s');
  assert.ok(Math.abs(ra12 / ra10 - 1.0456) < 5e-4, `the ratio is ${(ra12 / ra10).toFixed(4)}`);
  assert.ok(ra12 > ra10, 'the push stands the aim toward the rim');
});

t('ring: the aim is a pure function of (seat, seats, arc, mat) — the pool never enters it', () => {
  const a = seatAim(1, 3, 0, 11, 6.7, THROW_TARGET);
  assert.deepEqual(a, seatAim(1, 3, 0, 11, 6.7, THROW_TARGET));
  assert.notDeepEqual(a, seatAim(2, 3, 0, 11, 6.7, THROW_TARGET), 'the seat matters');
  assert.notDeepEqual(a, seatAim(1, 4, 0, 11, 6.7, THROW_TARGET), 'and N');
  assert.notDeepEqual(a, seatAim(1, 3, 1, 11, 11.2, THROW_TARGET), 'and the arc');
  assert.notDeepEqual(a, seatAim(1, 3, 0, 14.1, 8.6, THROW_TARGET), 'and the mat');
  assert.deepEqual(wedgeFor(1, 3, 0, 11, 6.7), wedgeFor(1, 3, 0, 11, 6.7));
  assert.deepEqual(seatAnchor(1, 3, 0, 11, 6.7), seatAnchor(1, 3, 0, 11, 6.7));
});

// --- the printing: P6, P7 ----------------------------------------------------------

t('ring P6: readTurn returns the old READ_TURN row on all 16 quarter pairs', () => {
  // js/placard.js READ_TURN, inlined here: per station azim RELATIVE to the
  // reader in quarter turns, [+z panel, -z panel], each [mirror, flip].
  const READ_TURN = {
    0: [[false, false], [true, true]],
    1: [[false, false], [true, true]],
    2: [[true, true], [false, false]],
    3: [[true, true], [false, false]],
  };
  for (let qa = 0; qa < 4; qa++) {
    for (let qr = 0; qr < 4; qr++) {
      const azim = qa * (Math.PI / 2);
      const reader = qr * (Math.PI / 2);
      const q = ((Math.round(azim / (Math.PI / 2)) - qr) % 4 + 4) % 4;
      assert.deepEqual(readTurn(azim, reader), READ_TURN[q], `azim ${qa}/4, reader ${qr}/4 -> row ${q}`);
    }
  }
  const [p, m] = readTurn(0, 0);
  assert.ok(p === TURN_NONE && m === TURN_HALF, 'the frozen pair, by reference');
});

t('ring P7: at every (N, seat, reader seat) the printing reads upright — text-up . screen-up >= 0 on both panels', () => {
  // A panel's unflipped text-up runs foot-to-ridge: azimuth (azim + pi) on the
  // +z panel, azim on the -z panel; TURN_HALF reverses it. Screen-up for a
  // reader at phi is (phi + pi). Edge-on (a quarter turn off) reads side-on,
  // which is 0 — the head treatment, kept.
  const vec = (a) => [Math.sin(a), Math.cos(a)];
  for (const arc of [0, 1]) {
    for (const N of NS) {
      for (let k = 0; k < N; k++) {
        const azim = placeTheta(k, N, arc);
        for (let r = 0; r < N; r++) {
          const phi = placeTheta(r, N, arc);
          const [tp, tm] = readTurn(azim, phi);
          const up = vec(phi + Math.PI);
          const upP = vec(tp === TURN_NONE ? azim + Math.PI : azim);
          const upM = vec(tm === TURN_NONE ? azim : azim + Math.PI);
          const dp = upP[0] * up[0] + upP[1] * up[1];
          const dm = upM[0] * up[0] + upM[1] * up[1];
          assert.ok(dp >= -1e-9, `N=${N} arc ${arc} card ${k} reader ${r}: +z panel reads ${dp.toFixed(3)}`);
          assert.ok(dm >= -1e-9, `N=${N} arc ${arc} card ${k} reader ${r}: -z panel reads ${dm.toFixed(3)}`);
          if (k === r) assert.ok(dp > 0.999 && dm > 0.999, 'your own card reads dead upright');
        }
      }
    }
  }
  // Edge-on: +sin takes the near pair, -sin the far (rows 1 and 3).
  assert.deepEqual(readTurn(Math.PI / 2, 0), [TURN_NONE, TURN_HALF]);
  assert.deepEqual(readTurn(3 * Math.PI / 2, 0), [TURN_HALF, TURN_NONE]);
  // Continuous: a hair past edge-on flips to the far pair.
  assert.deepEqual(readTurn(Math.PI / 2 + 1e-6, 0), [TURN_HALF, TURN_NONE]);
  assert.deepEqual(readTurn(Math.PI / 2 - 1e-6, 0), [TURN_NONE, TURN_HALF]);
});

console.log(process.exitCode ? `${n} tests, FAILURES above` : `all ${n} places tests pass`);
