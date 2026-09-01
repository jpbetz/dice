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

console.log(process.exitCode ? `${n} tests, FAILURES above` : `all ${n} places tests pass`);
