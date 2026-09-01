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
// gap at `close`, which is what killed the felt shelf.
//
// RE-DERIVED 2026-09-01 WITH THE CARD (v2, Joe: "the placards … are smaller
// than the dice"). It is no longer a free number: three stations share a long
// edge at a full house, so the pitch is the card's own footprint plus the gap
// floor and a little air — PLACARD_W 3.20 + PLACARD_GAP 0.30 = 3.50 is the
// point at which the middle card of a three-card edge TOUCHES its neighbours,
// and 4.30 is what ships. The extra 0.80 is MEASURED, not taste: it is what
// carries the near card clear of `#result-banner` — the fixed DOM panel at the
// bottom centre of the felt that Joe's shot caught the old centre card
// printing through — at every width that panel can take, up to its css
// max-width of 520 px. Read off the live page at 1600 × 900 in
// tools/steps/place-card.mjs: at 3.60 the card's own name grazed the widest
// banner's edge, at 3.90 its blank right end still slid under a live one, and
// at 4.30 the whole printed band clears with 27-50 px to spare while the card
// itself stays inside the frame (own-card ndc x0 −0.942, rim −1).
//
// THE MAT CLAMP THAT USED TO SIT HERE IS GONE, on
// purpose: it shrank the lane on a narrow mat, which is exactly the state in
// which the three cards fuse. Three 3.20 cards with their gaps need 10.2 units
// of edge; `wide` (14.1) and `medium` (11) hold them inside the mat, and at
// `close` (8.6) the two outer cards overhang the mat's corner by 1.60 and
// stand on the table beyond it — which is where a place card at a crowded
// table goes anyway. The invariant is the PITCH, never the overhang.
export const PLACE_LANE = 4.30;

// The clear ground two cards must leave each other, anywhere on the table.
// The assertion the felt shelf never had, and now also the floor PLACE_LANE
// is derived from — one number, one place, so the two can never drift.
export const PLACARD_GAP = 0.30;

// The placard's centre, OUTBOARD of the wall plane. The footprint is 1.32
// deep, so the inboard edge stands 0.10 past the plane where dice stop: no die
// can ever reach a placard, which is what makes depthWrite, a real shadow, and
// a raycast seating pass all legal at once (IMMERSION law 8's `surfaceUnder`
// trap is void BY GEOMETRY, not by care).
export const PLACARD_STANDOFF = 0.76;

// The card's footprint on the ground (docs/UX.md §7.63; js/placard.js builds
// the rig to these numbers — 3.20 × 1.32 × 1.83 ridge, a 3.00 × 1.80 card face
// at 20° off vertical). They live here because the outboard-of-the-wall
// property above is a fact about the LAYOUT, and a layout invariant may not be
// asserted against a number that lives somewhere else.
export const PLACARD_W = 3.20;
export const PLACARD_D = 1.32;

// The spawn line's pitch floor under a lane. A lane may compress a pool's
// line toward the roller's side, but never below a real pitch — see
// laneSpread, and the F1 fix it exists for.
export const PITCH_MIN = 2.0;

// LONG EDGES FILL FIRST. A head seat costs its sitter ~23% of the table at
// every zoom (measured 1600×900 with framingInfo().spanPx along the camera's
// right axis: medium front 195 px → head 150 px per world unit, −23.1%; wide
// 153 → 117; close 251 → 193 — the head eye retreats to camScale 1.33 to fit
// the long axis vertically), so nobody pays that tax until the long edges are
// full: heads are occupied only at N >= 5. The design's "98 → 68" (−30%) was
// the same probe reading the fixed world-x segment, which at a head chair is
// the foreshortened DEPTH axis, not the die; re-priced 2026-09-01.
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
//
// NOBODY SITS DEAD CENTRE OF A LONG EDGE UNTIL SEVEN PEOPLE ARE HERE, and
// that is a v2 correction with a measured cause (2026-09-01). Station 0 used
// to be the middle of the front edge, which puts the viewer's OWN card at the
// bottom centre of their own frame — the same square of screen the result
// banner is fixed to (`#result-banner`, bottom 26px, centred over the felt,
// css/style.css:3413). Joe's two-tab shot caught the two printing through each
// other. So the first chair on each long edge is an OUTER lane and the centre
// slot is filled last: station 0 takes the left third of the front edge and
// station 1 the right third of the back, which is the same 180° rotation the
// four-chair table already had. Both viewers still read the table the same way
// — own card low and to the LEFT, the other player's high and to the RIGHT —
// because a half turn of the world maps one to the other exactly.
export const STATIONS = Object.freeze([
  /* 0 FRONT_L */ { edge: 'front', side: 0, lane: -1, azim: 0 },
  /* 1 BACK_R  */ { edge: 'back',  side: 1, lane: +1, azim: Math.PI },
  /* 2 FRONT_R */ { edge: 'front', side: 0, lane: +1, azim: 0 },
  /* 3 BACK_L  */ { edge: 'back',  side: 1, lane: -1, azim: Math.PI },
  /* 4 RIGHT   */ { edge: 'right', side: 3, lane:  0, azim: Math.PI / 2 },
  /* 5 LEFT    */ { edge: 'left',  side: 2, lane:  0, azim: 3 * Math.PI / 2 },
  /* 6 FRONT_C */ { edge: 'front', side: 0, lane:  0, azim: 0 },
  /* 7 BACK_C  */ { edge: 'back',  side: 1, lane:  0, azim: Math.PI },
].map(Object.freeze));

// WHEN A TOWER IS SOCKETED IT OWNS THE WHOLE BACK EDGE (docs/TOWER.md): the
// doorway, the lintel and the pit run across −z and the lip reaches to about
// z0 + 3.9. The three back stations do not vanish and do not hide — the chairs
// are pulled around BESIDE the machine. The owner keeps their placard, their
// orientation turns to the flank (looking across the tower's face — the
// model's best angle; azim π is forbidden while socketed, the pit backstop is
// un-skinned), and their re-throws enter from the flank beside their own card.
//
// Split across BOTH flanks so one side does not crowd, and EACH BACK CHAIR
// GOES TO THE FLANK IT ALREADY SAT NEAREST (v2, 2026-09-01: the lanes moved,
// so the remap moved with them — station 1 stands at x +3.60 and goes right,
// station 3 at −4.30 and goes left, and the centre chair 7 takes the far slot
// on the right). WHILE SOCKETED THE ENTRY IS NOT A PER-PLAYER READ: stations 1
// and 7 land on entry side 3, which the RIGHT HEAD (station 4, lane 0, not
// relocated) already owns, so THREE stations stamp the identical
// {entry: 3, lane: 0} and their re-throws are born on one spawn line — centred
// on z = 0, in front of the head's card, while the flanked cards stand 4.30
// and 8.60 units down the flank. Station 3
// likewise shares side 2 with the left head (station 5). (The design and this
// comment first counted the collision as two stations; it is three and two,
// and the count matters because the edge does not merely go ambiguous under
// a tower, it points at a specific other player's card.) The wash — anchored
// per-PLACARD, never per-edge (js/main.js placeWashFor) — is the whole of
// attribution on a tower table; only re-throws are thrown under a tower
// anyway, since pours never touch spawnDie. Giving the flank rows their own
// lanes along z (spawnDie applies `lane` on sides 0/1 only today) is the
// S8 tower slice's call, not this file's; tests/places.test.mjs pins the
// three-way collision so it is never re-forgotten.
//
// `slot` counts back from the head's card at z = 0 in units of PLACE_LANE, so
// a flank row keeps the front row's pitch and therefore the front row's gap.
const TOWER_FLANKS = Object.freeze({
  1: Object.freeze({ flank: +1, slot: 1, side: 3, azim: Math.PI / 2 }),
  3: Object.freeze({ flank: -1, slot: 1, side: 2, azim: 3 * Math.PI / 2 }),
  7: Object.freeze({ flank: +1, slot: 2, side: 3, azim: Math.PI / 2 }),
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
      x: st.lane * PLACE_LANE,
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
//
// Worked at the v2 lane (4.30), medium, room 4.2: 1 die → the whole 3.60;
// a pair → 3.20; 3d6 → 2.20; 6d6 → 0.90 with the pool's 6.6 spread and its
// 1.32 pitch both kept. Close/6d6 → 0.90, spread 4.2, no collapse. The wider
// lane costs the small pools some spread (a pair's line compresses to the 2.0
// pitch floor) and costs the big ones nothing at all, which is the right way
// round: a handful comes from your side of the table, a single d20 from your
// spot, and neither is ever folded onto one x.
export function laneSpread(laneSlot, room, spread, count) {
  if (!laneSlot) return { lane: 0, spread };            // shipped path, bit-identical
  const s = Math.min(spread,
    Math.max(2 * (room - PLACE_LANE), (count - 1) * PITCH_MIN));
  const lane = Math.sign(laneSlot)
    * Math.min(PLACE_LANE, Math.max(0, room - s / 2));
  return { lane, spread: s };
}


// ---------------------------------------------------------------------------
// The region — the felt a place owns for landing (v2, 2026-09-01)
// ---------------------------------------------------------------------------

// A PLACE OWNS ITS REGION OF FELT FOR LANDING. Joe, on the deployed two-tab
// table (BRIEF-V2, 2026-09-01): "there is not enough room for two people to
// roll the dice at the same time … I talked about the latter" — and what he
// had talked about is BRAINSTORM §1's own sentence, "Their rolls are in a
// region near them." That is the owner's adjudication of IMMERSION item 16's
// "a seat … owns no region of felt", stated twice; the v1 design deferred to
// the clause and shipped a zero aim bias, and that was the wrong reading. The
// clause is amended by his word in docs/IMMERSION.md; it is not re-litigated
// here.
//
// THE REGION IS A FUNCTION OF THE STAMP AND THE MAT, AND OF NOTHING ELSE:
// (entry, lane, w, d) → an axis-aligned rectangle of the mat. No new wire
// field, no roster read in the film (the whole point of the entry/lane split
// above). A long-edge station owns its NEAR HALF of the mat, z toward its own
// edge; two stations on one long edge split that half laterally by lane sign
// into QUADRANTS, and the centre slot (lane 0, the seventh chair) takes the
// centre band of the same width — its felt overlaps its neighbours', which is
// what a seven-person table costs, and it is the last chair dealt for exactly
// that reason. A head station owns its END THIRD, full depth.
//
// Regions are for LANDING. They are not walls (no new physics bodies — a die
// may still roll out of its region, and the walls are the mat's own), not
// claims (nothing refuses a die for being in the wrong place), and not read by
// anything after the throw is in the air. The other half of "room for two" is
// the sweep rule in server.js executeRoll: a placed roller's arrival collects
// only their OWN prior rolls and any placeless one, so the felt holds one roll
// PER PLACE.
export function regionFor(entry, lane, w, d) {
  if (!Number.isInteger(entry) || entry < 0 || entry > 3) return null;
  const hw = w / 2;
  const hd = d / 2;
  if (entry <= 1) {
    const z = entry === 0 ? [0, hd] : [-hd, 0];
    const x = lane < 0 ? [-hw, 0] : lane > 0 ? [0, hw] : [-hw / 2, hw / 2];
    return { x0: x[0], x1: x[1], z0: z[0], z1: z[1] };
  }
  const third = w / 3;
  const x = entry === 2 ? [-hw, -hw + third] : [hw - third, hw];
  return { x0: x[0], x1: x[1], z0: -hd, z1: hd };
}

// Is a point of the mat inside a region? The scenario's own read
// (place-two-rolls), written here so the test and the film share one
// boundary rule: closed on both ends, so a die resting exactly on the centre
// line is in BOTH neighbouring regions rather than in neither.
export function inRegion(region, x, z) {
  return !!region && x >= region.x0 && x <= region.x1 && z >= region.z0 && z <= region.z1;
}

// ---------------------------------------------------------------------------
// The aim — the landing box, translated into the region and shrunk to it
// ---------------------------------------------------------------------------

// THE DIALS. A mutable const on purpose — the setThrowTarget pattern:
// tools/steps/place-region.mjs and place-settle.mjs reach this object through
// the page's own module instance to price the shipped dials against a true
// zero. `on: 0` makes every stamped throw aim exactly as an unstamped one
// (AIM_ZERO, by reference).
//
// MEASURED 2026-09-01 (tools/steps/place-region.mjs, medium, 12 seeds a cell,
// stations 0 / 4 / 6, 3d6 and 6d6). The v1 design believed a translated aim
// box would move where the dice come to rest. It moves where they POINT:
// spawnDie's target sets the throw's DIRECTION only — `dir = normalize(target
// − spawn)`, then a speed drawn independently of the distance — so the first
// thing tried here, the box alone at the shipped hurl, left the pool's
// centroid in its region 42–58% of the time. Easing the hurl to 0.55 raised
// that to 67–100% and no further: at 0.25 it was the same. What was scattering
// the dice was not the throw but the DROP — a die spawned 6–10 units up meets
// the felt at ~47 u/s (GRAVITY −110) and a cube landing on an edge converts
// that into a kick in whatever direction the edge points, ~2 units of it,
// which on a spawn line 1.15 units from the centre line is the far half. So:
//
//   speed  — the stamped hurl, as a factor of the shipped 14–22 u/s. 0.5.
//   h      — the stamped spawn HEIGHT, as a factor of the shipped 6–10 (+0.9
//            a die). 0.45: a toss from a low hand, 2.7–4.5 units up. This is
//            the dial that did the work: at 0.5 and 0.4 the centroid came in
//            at 92–100% in every cell measured; the dice themselves 81–97%
//            for a laned 3d6, 50–64% for a 6d6 (a handful spreads).
//   box    — the aim box's side as a fraction of the region's own after the
//            hull cap. 0.5. Shrunk, not merely translated: the shipped box
//            (0.4 of the mat) no longer fits a quadrant with the cap on.
//   corner — 1: a LANED long-edge throw is hurled into its region's own
//            corner (the roller's rim and the lane's side rim), which is the
//            backstop that makes the quadrant stick. 0: against the own rim,
//            laterally centred.
//   own    — 1: a station with no lane side — the heads and the centre slot —
//            throws each die straight at its own rim from where that die is
//            on the line, instead of at one shared box the pool converges on
//            (the convergence was measured as dice-on-dice collisions flinging
//            one die of three across the mat one throw in three at the head).
//   spin   — the stamped angular velocity as a factor of the shipped ±15
//            rad/s. Measured inert at 0.6 and 0.35 (the drop is the scatter,
//            not the spin) and left at 1: the tumble is the life of the die.
//
// Pile and settle, for the record and NOT as a gate (Joe: "pilling is OK"):
// see tools/steps/place-region.mjs's printout beside the commit that set
// these. The only cell that piles noticeably is 6d6 at a head (15–18% of
// dice, against a placeless 6d6's 5.6%): six dice dropped low onto a third of
// the mat, which is what a handful into a corner of a tray does.
export const PLACE_AIM = { on: 1, speed: 0.5, h: 0.45, box: 0.5, corner: 1, own: 1, spin: 1 };

// The widest die's rest ceiling, kept off every wall the aim box touches by
// the cap below — dice must not be aimed AT a rim.
const AIM_HULL = 1.25;

// One shared zero, returned BY REFERENCE for every unstamped roll, and the
// identity on every factor: `0 + v` is `v` and `v * 1` is `v` on the same
// double (IEEE 754: adding +0 and multiplying by 1 are both exact), so a film
// with no stamp is the film this table baked before places existed — the
// golden in `place-seeds-unchanged` is the pin. Every factor spawnDie reads
// (`kx`, `kz`, `k`, `h`, `spin`) is 1 here and `own` is off, which is what
// keeps the shipped expressions the shipped expressions. Frozen: a caller
// that mutated the shared zero would poison every throw after it.
export const AIM_ZERO = Object.freeze({ x: 0, z: 0, kx: 1, kz: 1, k: 1, own: 0, spin: 1, h: 1 });

// WHERE THIS THROW AIMS, AND HOW IT IS THROWN. Returns {x, z, kx, kz, k, h,
// spin, own}: the aim box's centre, its two extents as factors of the shipped
// box (spawnDie draws `(rng() − 0.5) * TABLE_W * THROW_TARGET * kx`), the
// hurl, height and spin factors, and whether each die aims from its own
// abscissa. Nothing here draws rng and nothing here changes how many times
// spawnDie does: the factors multiply draws that are taken anyway.
//
// Region first, then the hull cap pulls the region's WALL sides in by a die's
// hull (its open sides — the centre lines — are not walls and are not pulled),
// then the box is cut to `PLACE_AIM.box` of what is left and set against the
// roller's own wall: in the own corner for a laned long-edge throw, laterally
// centred otherwise. `lane` is the STAMP's slot (−1 | 0 | +1), not the pool's
// effective lane — the region is a property of the chair, and a big handful
// from the front-left chair still lands front-left even when its line has
// yielded toward the middle.
//
// Dice may still leave a region: these are dials on a throw, not walls, and
// the measured containment is a rate, not a law. The scenario that pins the
// picture (place-two-rolls) therefore asserts the pool's CENTROID against the
// region with a die's width of margin at its open sides, which is the claim
// the numbers support; the per-die rates are printed for the record.
export function aimFor(entry, lane, w, d, throwTarget) {
  if (!PLACE_AIM.on) return AIM_ZERO;
  const region = regionFor(entry, lane, w, d);
  if (!region) return AIM_ZERO;
  const hw = w / 2;
  const hd = d / 2;
  // The cap: pull each side that IS a wall in by a hull.
  const x0 = region.x0 <= -hw ? region.x0 + AIM_HULL : region.x0;
  const x1 = region.x1 >= hw ? region.x1 - AIM_HULL : region.x1;
  const z0 = region.z0 <= -hd ? region.z0 + AIM_HULL : region.z0;
  const z1 = region.z1 >= hd ? region.z1 - AIM_HULL : region.z1;
  const bw = Math.max(0, (x1 - x0) * PLACE_AIM.box);
  const bd = Math.max(0, (z1 - z0) * PLACE_AIM.box);
  let cx;
  let cz;
  let own = 0;
  if (entry <= 1) {
    // Against the own wall (the front's is +z, the back's −z)…
    cz = entry === 0 ? z1 - bd / 2 : z0 + bd / 2;
    // …and in the own corner when there is a lane side; the centre slot has
    // none, so each of its dice is thrown straight at the rim from where it
    // is on the line.
    if (PLACE_AIM.corner && lane < 0) cx = x0 + bw / 2;
    else if (PLACE_AIM.corner && lane > 0) cx = x1 - bw / 2;
    else { cx = (x0 + x1) / 2; own = 1; }
  } else {
    cx = entry === 2 ? x0 + bw / 2 : x1 - bw / 2;
    cz = (z0 + z1) / 2;
    own = 1;
  }
  return {
    x: cx,
    z: cz,
    kx: bw / (w * throwTarget),
    kz: bd / (d * throwTarget),
    k: PLACE_AIM.speed,
    own: PLACE_AIM.own ? own : 0,
    spin: PLACE_AIM.spin,
    h: PLACE_AIM.h,
  };
}
