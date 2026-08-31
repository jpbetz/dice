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

// A PLACE AT THE TABLE — the layout and entry algebra (docs/UX.md §7.63).
//
// A `place` is the STATION at the table: an integer 0–7, server-assigned,
// sticky. A `placard` is the object standing there. `seat` (the playerId
// credential) and `chair` (an unclaimed prepared seat) keep their meanings —
// see docs/IDENTITY.md §6.
//
// THIS FILE IS THE ONE PLACE THE ARITHMETIC IS WRITTEN. server.js stamps
// `roll.entry`/`roll.lane` out of `entryFor` at the moment the dice are drawn,
// and js/main.js reads those stamps back to line the throw up and to stand the
// placards; both import THIS module (the js/rollspec.js precedent — server.js
// is ESM and already imports it). Zero-dep: no DOM, no three.js, no cannon,
// runs identically in Node and the browser.
//
// Written once, in one expression order, per docs/TOWER.md's anchor rule
// (js/main.js:11495-11507): `5.6 * S + dRim` is not interchangeable with
// `S * (5.6 + dRim/S)`, because the second is a different sequence of
// roundings and lands on a different double. Two clients that disagree in the
// last bit about where a throw comes in from are two films of one seed
// (goal 15). DO NOT REARRANGE AN EXPRESSION HERE TO MAKE IT PRETTIER.
//
// THE SPLIT that the whole feature rests on: `player.place` is ROSTER state
// and is allowed to be wrong — it is display-only, and nothing downstream of a
// pixel reads it. `roll.entry` / `roll.lane` are FILM state: stamped
// server-side, riding the roll payload in the seed's determinism class. The
// film never reads the roster, not once.

// ---------------------------------------------------------------------------
// The constants
// ---------------------------------------------------------------------------

// Eight stations, and eight is also PALETTE.length — at a full house every
// placard wears a distinct hue. That agreement is noted, deliberately NOT
// coupled in code: the palette may grow without renumbering the table.
export const PLACE_MAX = 8;

// The lateral pitch of the off-centre stations: how far apart two chairs sit.
// ABSOLUTE, never a fraction of the mat — a fraction gives a 0.036-unit card
// gap at `close`, which is what killed the felt shelf. Clamped by the mat in
// placeAnchor (see laneX) so a hypothetical narrow preset cannot push a card
// off its own edge; at all three shipped zooms the clamp does not bind.
export const PLACE_LANE = 2.55;

// The placard's centre, OUTBOARD of the wall plane. The footprint is 1.24
// deep, so the inboard edge stands 0.10 past the plane where dice stop: no die
// can ever reach a placard, which is what makes depthWrite, a real shadow, and
// a raycast seating pass all legal at once (IMMERSION law 8's `surfaceUnder`
// trap is void BY GEOMETRY, not by care).
export const PLACARD_STANDOFF = 0.72;

// The card's footprint on the ground (docs/UX.md §7.63; js/placard.js builds
// the rig to these numbers — 2.20 × 1.24 × 0.49 ridge, 56° half-opening).
// They live here because the outboard-of-the-wall property above is a fact
// about the LAYOUT, and a layout invariant may not be asserted against a
// number that lives somewhere else.
export const PLACARD_W = 2.20;
export const PLACARD_D = 1.24;

// The spawn line's pitch floor under a lane. A lane may compress a pool's
// line toward the roller's side, but never below a real pitch — see
// laneSpread, and the F1 fix it exists for.
export const PITCH_MIN = 2.0;

// LONG EDGES FILL FIRST. A head seat costs its sitter ~30% of the table at the
// default zoom (measured: spanPx 98 -> 68 at medium), so nobody pays that tax
// until the long edges are full: heads are occupied only at N >= 5.
//
// `side` is the spawn edge js/main.js's spawnDie already has four branches for
// (0 front/+z, 1 back/−z, 2 left/−x, 3 right/+x). `lane` is −1 | 0 | +1, the
// slot along that edge. `azim` is the viewer's own orbit when they sit here,
// quantised to the four quarter-turns camOrbit already ships.
//
// The stations are ABSOLUTE: placeAnchor is pure in (place, mat, tower) and
// not in N, not in join order, not in the client's `players` array (which has
// a documented ghost-seat divergence, IMMERSION.md:1367-1382). The server
// decides WHO occupies a station; every client agrees WHERE a station is by
// construction. Nobody is ever renumbered, so the placard never lies: dice
// always enter where the roller's placard actually stands.
export const STATIONS = Object.freeze([
  /* 0 FRONT   */ { edge: 'front', side: 0, lane:  0, azim: 0 },
  /* 1 BACK    */ { edge: 'back',  side: 1, lane:  0, azim: Math.PI },
  /* 2 FRONT_L */ { edge: 'front', side: 0, lane: -1, azim: 0 },
  /* 3 BACK_R  */ { edge: 'back',  side: 1, lane: +1, azim: Math.PI },
  /* 4 RIGHT   */ { edge: 'right', side: 3, lane:  0, azim: Math.PI / 2 },
  /* 5 LEFT    */ { edge: 'left',  side: 2, lane:  0, azim: 3 * Math.PI / 2 },
  /* 6 FRONT_R */ { edge: 'front', side: 0, lane: +1, azim: 0 },
  /* 7 BACK_L  */ { edge: 'back',  side: 1, lane: -1, azim: Math.PI },
].map(Object.freeze));

// WHEN A TOWER IS SOCKETED IT OWNS THE WHOLE BACK EDGE (docs/TOWER.md): the
// doorway, the lintel and the pit run across −z and the lip reaches to about
// z0 + 3.9. The three back stations do not vanish and do not hide — the chairs
// are pulled around BESIDE the machine. The owner keeps their placard, their
// orientation turns to the flank (looking across the tower's face — the
// model's best angle; azim π is forbidden while socketed, the pit backstop is
// un-skinned), and their re-throws enter from the flank beside their own card.
//
// Split across BOTH flanks so one side does not crowd. Stations 1 and 3 share
// entry side 3 while socketed; the wash — anchored per-placard, not per-edge —
// is what still tells them apart, and only re-throws are thrown under a tower
// anyway.
//
// `slot` counts back from the head's card at z = 0 in units of PLACE_LANE, so
// a flank row keeps the front row's pitch and therefore the front row's gap.
const TOWER_FLANKS = Object.freeze({
  1: Object.freeze({ flank: +1, slot: 2, side: 3, azim: Math.PI / 2 }),
  3: Object.freeze({ flank: +1, slot: 1, side: 3, azim: Math.PI / 2 }),
  7: Object.freeze({ flank: -1, slot: 1, side: 2, azim: 3 * Math.PI / 2 }),
});

// ---------------------------------------------------------------------------
// Entry — the film half
// ---------------------------------------------------------------------------

// WHICH EDGE, AND WHICH LANE OF IT, A THROW FROM THIS STATION COMES IN FROM.
// Total over (place 0–7 × towerUp); null for anything that is not a place, so
// a placeless player's roll carries no stamp at all and the film falls back to
// its seeded draw. Heads and flanks are single-station: lane 0.
export function entryFor(place, towerUp = false) {
  if (!Number.isInteger(place) || place < 0 || place >= PLACE_MAX) return null;
  const flank = towerUp ? TOWER_FLANKS[place] : null;
  if (flank) return { entry: flank.side, lane: 0 };
  const st = STATIONS[place];
  return { entry: st.side, lane: st.lane };
}

// ---------------------------------------------------------------------------
// Anchors — the world half
// ---------------------------------------------------------------------------

// The lane offset a card actually stands at, clamped by the mat: a card must
// keep its own half-width plus a card gap inboard of the corner. Absolute
// 2.55 everywhere the mat is at least 7.4 wide, which is every shipped zoom.
function laneX(w) { return Math.min(PLACE_LANE, w / 2 - 1.20); }

// WHERE A STATION'S PLACARD STANDS, in world units, on the ground.
//
// Pure in (place, w, d, towerUp) — `w` is the mat's playable width (TABLE_W)
// and `d` its playable DEPTH AS THE WALLS CURRENTLY STAND (TABLE_D), not the
// base layer. That is the one correction this file makes to the design it was
// built from: the design read the depth off MAT_DEPTH.base so that "nothing
// slides when the mat deepens", on the belief that a socketed tower's +4.5
// lands wholly behind the table. It does not. TABLE_D is a SUM of layers and
// the walls are placed at ±TABLE_D/2 (js/main.js:3238-3243, and
// towerMatDepth's own `walls.front.position.set(0, 0, TABLE_D / 2)`), so
// socketing a tower moves the FRONT wall forward by half the extra as well.
// A front card pinned to the base depth would then stand 1.53 units INSIDE
// the wall at medium: dice could reach it, slide through it, and the
// outboard-of-the-wall property that licenses depthWrite and the seating
// raycast would be false exactly when a tower is up. The card stands where
// the dice stop, at every mat state, and that invariant outranks the
// convenience of a card that never moves.
//
// Returns { x, y, z, azim, relocated } — y is the ground plane; js/placard.js
// raycasts the venue's own surface from here (the `surfaceUnder` pattern) so a
// fae ground at 0.02–0.035 never buries the base. null for a non-place.
export function placeAnchor(place, w, d, towerUp = false) {
  if (!Number.isInteger(place) || place < 0 || place >= PLACE_MAX) return null;
  const flank = towerUp ? TOWER_FLANKS[place] : null;
  if (flank) {
    return {
      x: flank.flank * (w / 2 + PLACARD_STANDOFF),
      y: 0,
      z: -flank.slot * PLACE_LANE,
      azim: flank.azim,
      relocated: true,
    };
  }
  const st = STATIONS[place];
  if (st.edge === 'front' || st.edge === 'back') {
    return {
      x: st.lane * laneX(w),
      y: 0,
      z: (st.side === 0 ? 1 : -1) * (d / 2 + PLACARD_STANDOFF),
      azim: st.azim,
      relocated: false,
    };
  }
  return {
    x: (st.side === 3 ? 1 : -1) * (w / 2 + PLACARD_STANDOFF),
    y: 0,
    z: 0,
    azim: st.azim,
    relocated: false,
  };
}

// The card's axis-aligned footprint on the ground. Every azim here is a
// quarter turn, so the box stays axis-aligned and the gap between two cards is
// exact arithmetic rather than a hull test.
export function placardFootprint(anchor) {
  if (!anchor) return null;
  const turned = Math.abs(Math.cos(anchor.azim)) < 0.5;   // ±π/2 -> width lies along z
  return {
    x: anchor.x,
    z: anchor.z,
    hx: (turned ? PLACARD_D : PLACARD_W) / 2,
    hz: (turned ? PLACARD_W : PLACARD_D) / 2,
  };
}

// The clear ground between two cards: 0 when they touch, negative when they
// overlap. The assertion the felt shelf never had.
export function placardGap(a, b) {
  const dx = Math.abs(a.x - b.x) - a.hx - b.hx;
  const dz = Math.abs(a.z - b.z) - a.hz - b.hz;
  if (dx >= 0 && dz >= 0) return Math.hypot(dx, dz);
  return Math.max(dx, dz);
}

// ---------------------------------------------------------------------------
// The lane — where the pool's line sits along the roller's edge
// ---------------------------------------------------------------------------

// THE LANE YIELDS TO THE POOL, NEVER THE OTHER WAY ROUND (fix F1).
//
// A constant lane fed into spawnDie's shipped per-die `fit()` clamp (`room =
// extent/2 − restCeiling − 0.05`) collapses the outboard half of any 4+ pool
// onto one x — the exact "six dice on top of each other" the C28 comment
// records, and INVISIBLE to `spawnLine().clear >= 0`, a wall check that stays
// green through a total collapse. `fit()` stays what it was measured as: a
// rare wall rescue, not a layout mechanism.
//
// So when a lane is present the pool's line first compresses toward the lane's
// room — but never below a real pitch — and the lane then takes whatever room
// remains. A big handful comes from "your side of the table"; a single d20
// comes from your spot. Zero rng draws, so the throw's draw budget — the
// contract that keeps a stampless film bit-identical — is untouched.
//
// `room` is computed once per roll from the pool's LARGEST hull, so the line's
// centre is legal for every die in it. `laneSlot` is roll.lane (−1 | 0 | +1);
// slot 0 returns its inputs untouched, which is the bit-identical shipped path.
export function laneSpread(laneSlot, room, spread, count) {
  if (!laneSlot) return { lane: 0, spread };            // shipped path, bit-identical
  const s = Math.min(spread,
    Math.max(2 * (room - PLACE_LANE), (count - 1) * PITCH_MIN));
  const lane = Math.sign(laneSlot)
    * Math.min(PLACE_LANE, Math.max(0, room - s / 2));
  return { lane, spread: s };
}

// ---------------------------------------------------------------------------
// The aim — a translated landing box, never a shrunken one
// ---------------------------------------------------------------------------

// THE NEGOTIABLE HALF, NAMED BEFORE THE MEASUREMENT RAN. The entry edge is the
// read; this is the nudge that makes the read felt in where the dice come to
// rest. It ships only if settle-matrix says Δ pile-refusal ≤ +2.0 points AND
// Δ median duration ≤ +0.25 s AND no cell regresses > +4.0 points — else these
// two dials ship at 0 and the edge alone carries. `__diceDebug.setPlaceAim`
// writes this object in place (the setThrowTarget pattern), so it is a mutable
// const on purpose.
export const PLACE_AIM = { lateral: 0.34, entry: 0.18, minTravel: 1.6 };

// The widest die's rest ceiling, kept off the mat's rim by the cap below.
const AIM_HULL = 1.25;

// One shared zero, returned BY REFERENCE for every unstamped roll: `aim.x + v`
// is `v` on the same double, so a film with no stamp is the film this table
// baked before places existed. Frozen — a caller that mutated the shared zero
// would poison every throw after it.
export const AIM_ZERO = Object.freeze({ x: 0, z: 0 });

// WHERE THIS THROW AIMS. Bias, then travel floor, then wall cap, in that order.
//
// THROW_TARGET is untouched at 0.4: the box is TRANSLATED, never shrunk — no
// felt is owned (IMMERSION:1399-1403, re-affirmed unamended), no exclusivity,
// no claim, and the box still straddles the table's centre from every station.
// The travel floor exists because a bias toward your own edge with nothing
// under it is a throw that barely leaves your hand: the aim point is pushed to
// at least PLACE_AIM.minTravel from the spawn line, which at the long edges
// carries it past the centre. The cap then keeps the aim box's far lip clear
// of the opposite wall by a die's hull.
//
// `laneWorld` is the effective lane laneSpread returned — pool-derived, so the
// lateral bias shrinks with the handful exactly as the spawn line does.
export function aimFor(entry, laneWorld, w, d, throwTarget) {
  if (!Number.isInteger(entry) || entry < 0 || entry > 3) return AIM_ZERO;
  const alongZ = entry <= 1;
  const entHalf = alongZ ? d / 2 : w / 2;
  const entSign = entry === 0 ? 1 : entry === 1 ? -1 : entry === 2 ? -1 : 1;
  let ent = entSign * entHalf * PLACE_AIM.entry;
  const spawnEnt = entSign * (entHalf - 2.2);
  if (Math.abs(spawnEnt - ent) < PLACE_AIM.minTravel)
    ent = spawnEnt - Math.sign(spawnEnt) * PLACE_AIM.minTravel;
  // The aim box's own half-span is `extent * throwTarget / 2` — spawnDie draws
  // `(rng() - 0.5) * extent * THROW_TARGET`, which is ±20% of the mat at the
  // shipped 0.4, not ±40%. (The design's draft dropped the /2 and its own
  // three worked numbers refuted it: the cap bound at every zoom and the whole
  // bias died silently at 0.)
  const cap = (h, half) => Math.max(0, half - h * throwTarget / 2 - AIM_HULL);
  ent = Math.max(-cap(alongZ ? d : w, entHalf), Math.min(cap(alongZ ? d : w, entHalf), ent));
  const lat = laneWorld * PLACE_AIM.lateral;             // effective lane, pool-derived
  return alongZ ? { x: lat, z: ent } : { x: ent, z: lat };
}
