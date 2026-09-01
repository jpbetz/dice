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
  PLACE_MAX, PLACE_LANE, PITCH_MIN, PLACARD_STANDOFF, PLACARD_W, PLACARD_D,
  STATIONS, PLACE_AIM, PLACE_AIM_AUTHORED, AIM_ZERO,
  entryFor, placeAnchor, placardFootprint, placardGap, laneSpread, aimFor,
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

t('a fresh table of two sits opposing, dead centre', () => {
  const { w, d } = ZOOMS.medium;
  const a = placeAnchor(0, w, d), b = placeAnchor(1, w, d);
  assert.equal(a.x, 0);
  assert.equal(b.x, 0);
  assert.equal(a.z, -b.z);
  assert.ok(a.z > 0, 'place 0 is the near edge');
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
  // 7 BACK_L to the -x flank, 3 BACK_R and 1 BACK to the +x flank
  // (docs/TOWER.md; DESIGN §7.1).
  assert.deepEqual(entryFor(7, true), { entry: 2, lane: 0 });
  assert.deepEqual(entryFor(3, true), { entry: 3, lane: 0 });
  assert.deepEqual(entryFor(1, true), { entry: 3, lane: 0 });
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

t('no two cards come within 0.30 of each other — any station, any mat', () => {
  for (const mat of MATS) {
    const all = anchorsOf(mat);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const gap = placardGap(all[i].box, all[j].box);
        assert.ok(gap >= 0.30,
          `${mat.id}: places ${all[i].p} and ${all[j].p} are ${gap.toFixed(3)} apart`);
      }
    }
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
  // DESIGN §2.3: front/back z = +-5.02 wide / +-4.07 medium / +-3.32 close;
  // heads x = +-7.77 / +-6.22 / +-5.02; lanes at x in {0, +-2.55}.
  const want = { wide: [5.02, 7.77], medium: [4.07, 6.22], close: [3.32, 5.02] };
  for (const [id, [edgeZ, headX]] of Object.entries(want)) {
    const { w, d } = ZOOMS[id];
    assert.ok(Math.abs(placeAnchor(0, w, d).z - edgeZ) < 5e-3, `${id} front z`);
    assert.ok(Math.abs(placeAnchor(1, w, d).z + edgeZ) < 5e-3, `${id} back z`);
    assert.ok(Math.abs(placeAnchor(4, w, d).x - headX) < 5e-3, `${id} right head x`);
    assert.ok(Math.abs(placeAnchor(5, w, d).x + headX) < 5e-3, `${id} left head x`);
    assert.ok(Math.abs(placeAnchor(2, w, d).x + PLACE_LANE) < 1e-12, `${id} front-left lane`);
    assert.ok(Math.abs(placeAnchor(6, w, d).x - PLACE_LANE) < 1e-12, `${id} front-right lane`);
    assert.equal(placeAnchor(0, w, d).y, 0, 'a card stands on the ground');
  }
  assert.ok(Math.abs((PLACARD_STANDOFF - PLACARD_D / 2) - 0.10) < 1e-12,
    'the standoff leaves exactly 0.10 of clear ground inboard');
  assert.equal(PLACARD_W, 2.20);
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
  assert.ok(Math.abs(medium(1).lane - 2.55) < 1e-12, 'a single die comes from your spot');
  assert.ok(Math.abs(medium(2).lane - 2.55) < 1e-12, 'so does a pair');
  assert.ok(Math.abs(medium(3).lane - 2.2) < 1e-12, '3d6 gives a little ground');
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

// --- the aim: translated, never shrunk --------------------------------------

t('an unstamped roll gets the one shared zero, by reference', () => {
  assert.equal(aimFor(null, 0, 11, 6.7, THROW_TARGET), AIM_ZERO);
  for (const bad of [undefined, -1, 4, 1.5, '0', NaN]) {
    assert.equal(aimFor(bad, 0, 11, 6.7, THROW_TARGET), AIM_ZERO, `${String(bad)} is not an entry`);
  }
  assert.ok(Object.is(AIM_ZERO.x, 0) && Object.is(AIM_ZERO.z, 0),
    'positive zero on both axes — 0 + v is v, bit for bit');
  assert.throws(() => { AIM_ZERO.x = 5; }, 'the shared zero cannot be poisoned');
});

// THE DIALS SHIP AT ZERO (the gate's pre-declared fallback, taken 2026-08-31 —
// see PLACE_AIM in js/places.js for the numbers). The MECHANISM is still
// pinned, against the authored dials it was designed and measured with, so
// re-enabling it is one assignment and not a re-derivation: the two worked
// tests below run under PLACE_AIM_AUTHORED and put the shipped dial back.
const underAuthoredAim = (fn) => {
  const shipped = { ...PLACE_AIM };
  Object.assign(PLACE_AIM, PLACE_AIM_AUTHORED);
  try { fn(); } finally {
    for (const k of Object.keys(PLACE_AIM)) delete PLACE_AIM[k];
    Object.assign(PLACE_AIM, shipped);
  }
};

t('the shipped dial is zero, and a zero dial aims every stamped throw at the centre', () => {
  assert.deepEqual(PLACE_AIM, { lateral: 0, entry: 0, minTravel: 0 },
    'the pre-declared fallback ships: the edge alone carries');
  assert.deepEqual(PLACE_AIM_AUTHORED, { lateral: 0.34, entry: 0.18, minTravel: 1.6 },
    'and the authored dials are kept on record, frozen');
  assert.throws(() => { PLACE_AIM_AUTHORED.entry = 1; }, 'the record cannot be edited in place');
  for (const [, z] of Object.entries(ZOOMS)) {
    for (let entry = 0; entry < 4; entry++) {
      for (const lane of [-PLACE_LANE, -0.98, 0, 0.98, PLACE_LANE]) {
        const aim = aimFor(entry, lane, z.w, z.d, THROW_TARGET);
        // Numerically zero on both axes — `0 + v` and `-0 + v` are both `v`,
        // so a stamped throw lands through the box an unstamped one does.
        assert.equal(aim.x + 1, 1, `w${z.w}/${entry}/${lane}: no lateral bias`);
        assert.equal(aim.z + 1, 1, `w${z.w}/${entry}/${lane}: no entry bias`);
      }
    }
  }
});

t('the worked aims at medium (under the authored dials)', () => underAuthoredAim(() => {
  const { w, d } = ZOOMS.medium;
  const near = (got, want, why) => assert.ok(Math.abs(got - want) < 1e-9, `${why}: ${got}`);
  const front = aimFor(0, 0, w, d, THROW_TARGET);
  near(front.x, 0, 'front lane-0 x');
  near(front.z, -0.45, 'front lane-0 z, floored past centre by the travel minimum');
  const frontLeft = aimFor(0, -2.2, w, d, THROW_TARGET);
  near(frontLeft.x, -0.748, 'front-left 3d6 x');
  near(frontLeft.z, -0.45, 'front-left 3d6 z');
  const back = aimFor(1, 0, w, d, THROW_TARGET);
  near(back.z, 0.45, 'the back edge mirrors the front');
  const right = aimFor(3, 0, w, d, THROW_TARGET);
  near(right.x, 0.99, 'the right head aims off its own edge');
  near(right.z, 0, 'and takes no lateral bias — heads are single-station');
  near(aimFor(2, 0, w, d, THROW_TARGET).x, -0.99, 'the left head mirrors it');
}));

t('the wall cap binds at close and not at medium (the negative control, authored dials)', () => underAuthoredAim(() => {
  const capOf = (extent) => ZOOMS.close[extent === 'z' ? 'd' : 'w'];
  const closeFront = aimFor(0, 0, ZOOMS.close.w, ZOOMS.close.d, THROW_TARGET);
  const cap = capOf('z') / 2 - capOf('z') * THROW_TARGET / 2 - 1.25;
  assert.ok(Math.abs(closeFront.z + cap) < 1e-9,
    `close front is held at the cap (${closeFront.z} vs ${-cap})`);
  const medFront = aimFor(0, 0, ZOOMS.medium.w, ZOOMS.medium.d, THROW_TARGET);
  const medCap = ZOOMS.medium.d / 2 - ZOOMS.medium.d * THROW_TARGET / 2 - 1.25;
  assert.ok(Math.abs(medFront.z) < medCap - 1e-9,
    'at medium the travel floor decides, not the wall');
}));

t('the dial is restored after the authored-dial pins', () => {
  assert.deepEqual(PLACE_AIM, { lateral: 0, entry: 0, minTravel: 0 },
    'a pin that ran under the authored dials put the shipped zero back');
});

t('the box is translated, never shrunk — and it always straddles the centre (authored dials)', () => underAuthoredAim(() => {
  for (const [id, z] of Object.entries(ZOOMS)) {
    for (let entry = 0; entry < 4; entry++) {
      const alongZ = entry <= 1;
      const room = poolRoom(alongZ ? z.w : z.d, HULL_MAX);
      const lane = laneSpread(alongZ ? 1 : 0, room, poolSpread(z.w, 3), 3).lane;
      const aim = aimFor(entry, lane, z.w, z.d, THROW_TARGET);
      const entHalf = (alongZ ? z.d : z.w) / 2;
      const latHalf = (alongZ ? z.w : z.d) / 2;
      const entAim = alongZ ? aim.z : aim.x;
      const latAim = alongZ ? aim.x : aim.z;
      assert.ok(Math.abs(entAim) < (alongZ ? z.d : z.w) * THROW_TARGET / 2,
        `${id}/${entry}: the aim box still contains the table's centre`);
      assert.ok(Math.abs(entAim) + (alongZ ? z.d : z.w) * THROW_TARGET / 2 + 1.25 <= entHalf + 1e-12,
        `${id}/${entry}: the box's far lip clears the wall by a hull`);
      assert.ok(Math.abs(latAim) + (alongZ ? z.w : z.d) * THROW_TARGET / 2 + 1.25 <= latHalf + 1e-12,
        `${id}/${entry}: and so does its lateral lip`);
      assert.ok(Math.abs(latAim) <= PLACE_LANE * PLACE_AIM.lateral + 1e-12,
        `${id}/${entry}: the lateral bias never exceeds one lane's worth`);
    }
  }
}));

t('every bias is a nudge — nothing owns felt (authored dials)', () => underAuthoredAim(() => {
  // IMMERSION:1399-1403, re-affirmed unamended. A lane only exists on the long
  // edges (heads are single-station), so those are the only combinations a
  // table can actually produce. Pinned under the AUTHORED dials — the shipped
  // zero satisfies every line here trivially, and a vacuous pin is no pin.
  let worst = 0;
  for (const [id, z] of Object.entries(ZOOMS)) {
    for (let entry = 0; entry < 4; entry++) {
      for (const lane of entry <= 1 ? [-PLACE_LANE, 0, PLACE_LANE] : [0]) {
        const aim = aimFor(entry, lane, z.w, z.d, THROW_TARGET);
        assert.ok(Math.abs(aim.x) <= z.w / 6 && Math.abs(aim.z) <= z.d / 6,
          `${id}/${entry}: the aim never leaves the middle third of the mat`);
        if (id === 'medium') worst = Math.max(worst, Math.hypot(aim.x, aim.z));
      }
    }
  }
  assert.ok(worst <= 0.99 + 1e-9,
    `the largest bias on the default mat is ${worst.toFixed(3)} — on a mat 11 wide`);
  assert.ok(worst > 0.9, `and the pin is not vacuous: the authored dials really bias (${worst.toFixed(3)})`);
}));

console.log(process.exitCode ? `${n} tests, FAILURES above` : `all ${n} places tests pass`);
