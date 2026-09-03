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

// A PLACE AT THE TABLE — THE ROUND TABLE (docs/UX.md §7.63).
//
// Joe, 2026-09-01: "players sit in a circular orientation, not around a
// rectangular table. 2 players should sit opposite, 3 players should sit in a
// triangular orientation... it's simple math." And, when the first design
// had grown walls, wedges and hull caps: "From first principles, what do you
// actually need? ... Don't outsmart yourself." What you need is two facts:
//
//   1. THE TABLE IS ROUND. A disc of felt of radius ringRadius(w) = w/2. The
//      physics walls stand at ±w/2 on both axes (the presets are square), so
//      the disc lies inside them; the walls are invisible and only ever catch
//      a runaway die. Nothing else about the mat is measured.
//   2. SEAT k OF N SITS AT theta = 2π·k/N (placeTheta; under a tower the
//      chairs share a 300° arc that leaves the machine its back). Your card
//      stands on that ray just outside the rim (seatAnchor), your camera looks
//      in from there (js/main.js placeOrbit), and your dice are TOSSED from
//      there onto the spot in front of you (seatToss / tossAim): born a little
//      behind the spot, from a low hand, with almost no throw, so they land by
//      the spot and roll where they roll. The spot is a target, not a claim.
//
// A `place` is still the sticky chair index 0–7 the server assigns; a
// `seat` is the rank of that chair among the chairs held right now, so the
// cards RE-SPACE when someone comes or goes — at the places flush, never with
// dice in the air. `seat`/`chair` keep their older meanings elsewhere
// (docs/IDENTITY.md §6).
//
// THIS FILE IS THE ONE PLACE THE ARITHMETIC IS WRITTEN. server.js stamps
// `roll.seat` / `roll.seats` (and `roll.arc` under a tower) out of seatStamp
// at the moment the dice are drawn; js/main.js reads the stamp back through
// seatToss to line the toss up and stand the cards; both import THIS module,
// and every expression is written once, in one order (the anchor rule —
// docs/TOWER.md): two clients that disagree in the last bit are two films of
// one seed (goal 15). DO NOT REARRANGE AN EXPRESSION HERE TO MAKE IT PRETTIER.
//
// THE SPLIT the feature rests on: `player.place` is ROSTER state, allowed to
// be wrong, display-only. `roll.seat`/`roll.seats`/`roll.arc` are FILM state,
// server-stamped, riding the roll payload in the seed's determinism class. The
// film never reads the roster. (`roll.place` rides too, for the server's own
// arrivalSweep — the felt holds one roll per CHAIR — and nothing else.)
//
// THE RECTANGLE'S ALGEBRA BELOW (STATIONS, entryFor, regionFor, aimFor, the
// lanes) is kept for the tools and the unit rows that price it; nothing on
// the film path reads it any more.

// ---------------------------------------------------------------------------
// The constants
// ---------------------------------------------------------------------------

// Eight stations, and eight is also PALETTE.length — at a full house every
// placard wears a distinct hue. That agreement is noted, deliberately NOT
// coupled in code: the palette may grow without renumbering the table.
export const PLACE_MAX = 8;

// THE LANE — how far off the centre line a laned chair's THROW comes in
// (laneSpread, the film), and the pitch of the flank rows under a tower.
//
// RE-DERIVED 2026-09-01 WITH THE CARD (v2, Joe: "the placards … are smaller
// than the dice"; the v3 card grew ×1.15 on top and the pitch story moved to
// PLACE_LANE_SHARE — this constant is the THROW's lane and is consumed
// × PLACE_PUSH since v3). It is no longer a free number: three stations share
// a long edge at a full house, so the pitch is the card's own footprint plus
// the gap floor and a little air — v2's PLACARD_W 3.20 + PLACARD_GAP 0.30 =
// 3.50 was the point at which the middle card of a three-card edge TOUCHED
// its neighbours, and 4.30 is what shipped. The extra 0.80 was MEASURED, not
// taste: it is what
// carries the near card clear of `#result-banner` — the fixed DOM panel at the
// bottom centre of the felt that Joe's shot caught the old centre card
// printing through — at every width that panel can take, up to its css
// max-width of 520 px. Read off the live page at 1600 × 900 on the `wide` mat
// in tools/steps/place-card.mjs: at 3.60 the card's own name grazed the widest
// banner's edge, at 3.90 its blank right end still slid under a live one, and
// at 4.30 the whole printed band clears with 27-50 px to spare while the card
// itself stays inside the frame (own-card ndc x0 −0.942, rim −1).
//
// FILM STATE: spawnDie multiplies this into the pool's line (laneSpread), so
// it is a constant of the seed's determinism class and does not move with the
// picture. RECTANGLE-ERA (RING, S4 2026-09-01): live only inside laneSpread,
// which the ring never calls with a slot — where the CARD stands is
// seatAnchor below (on the seat's own ray), no longer a lane share of the mat
// (placeLane / PLACE_LANE_SHARE were deleted in S4; their measured record is in
// ROADMAP row 14 and UX §7.63).
export const PLACE_LANE = 4.30;

// V3, THE PUSH (Joe, 2026-09-01, on the deployed 7f93c05: "the players should
// have more space between them on the table by at least 20%"). ONE factor,
// film-side and lawful — pure shared constants, identical on every client —
// consumed in exactly two places: regionFor pushes every region's CENTRE away
// from the table's centre by this factor (walls fixed, open sides pulled in,
// so the pushed centres are the old centres × 1.2 exactly and opposite
// quadrants' centres sit 20% further apart), and laneSpread throws from a
// lane of PLACE_LANE × PLACE_PUSH so the ENTRIES read apart too, not just
// the rests (the room cap and the F1 pitch floor keep the last word — at
// medium and close the wall room already binds and the laned table is
// bit-identical; the push shows where there is room to spend it). The CARD
// does not move with this dial: seatAnchor stands it on its ray outboard of
// the rim, independent of the push. THE THROW ITSELF reaches the pushed
// centre through PLACE_AIM.box (v3.1): the aim box is anchored in the
// region's wall corner, which the push never moves, so the box's SIZE is
// what places its centre — 0.25 stands the aim at ×1.21 of the v2 aim,
// beside the ×1.2 the region centres moved. See the dial's own note.
export const PLACE_PUSH = 1.2;

// The clear ground two cards must leave each other, anywhere on the table.
// The assertion the felt shelf never had, and now also the floor PLACE_LANE
// is derived from — one number, one place, so the two can never drift.
export const PLACARD_GAP = 0.30;

// THE CARD'S FOOTPRINT, AND IT IS A DIAL SET NOW (2026-09-03, dice.yaml
// `cards`; the SEAT_TOSS pattern, further down this file, is the precedent
// and the reason this shape rather than three `let`s).
//
//   standoff  the centre, OUTBOARD of the wall plane. The footprint is 1.52
//             deep, so the inboard edge stands 0.10 past the plane where dice
//             stop: no die can ever reach a placard, which is what makes
//             depthWrite, a real shadow and a raycast seating pass all legal
//             at once (IMMERSION law 8's `surfaceUnder` trap is void BY
//             GEOMETRY, not by care).
//   w, d      the footprint on the ground (docs/UX.md §7.63; js/placard.js
//             builds the rig to these numbers — 3.68 × 1.52 × 2.09 ridge, a
//             3.45 × 2.07 card face at 20° off vertical; V3 2026-09-01, the v2
//             form × 1.15 on every axis — Joe: "the name plaquards should be
//             slightly bigger overall (… make the plaquards 15% bigger or
//             something)").
//
// They live in THIS file because the outboard-of-the-wall property above is a
// fact about the LAYOUT, and a layout invariant may not be asserted against a
// number that lives somewhere else.
//
// ONE MUTABLE OBJECT, copied into by js/main.js at boot from the declaration —
// this file is imported by server.js and must not import js/tune.js, exactly
// as with PLACE_AIM and SEAT_TOSS. Every read that MOVES goes through it.
// The three consts below it are the SHIPPED numbers, kept because the unit
// rows and tests/places.test.mjs assert the layout against them and a test
// that read the live object would pass at any size.
export const PLACARD = { standoff: 0.86, w: 3.68, d: 1.52 };
export const PLACARD_STANDOFF = PLACARD.standoff;
export const PLACARD_W = PLACARD.w;
export const PLACARD_D = PLACARD.d;

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
// RECTANGLE-ERA, STAMP HALF ONLY (RING S4, 2026-09-01): the table below is now
// read by entryFor alone — the FILM's edge/lane stamp, which S5 replaces with
// the ring stamp — and by the demo overlay until S6. WHERE THE CARD STANDS is
// seatAnchor (the ring section below), a function of the seat's RANK among the
// occupied places and their COUNT, so the cards re-space when N changes; the
// "absolute stations, nobody's card moves" law this comment used to state was
// replaced by BRIEF-RING (Joe: "2 players should sit opposite, 3 players
// should sit in a triangular orientation"). `place` stays the sticky ranking
// key the server hands out.
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
// so the remap moved with them — station 1 stood at x +placeLane(w) and goes
// right, station 3 at −placeLane(w) and goes left, and the centre chair 7
// takes the far slot on the right). WHILE SOCKETED THE ENTRY IS NOT A PER-PLAYER READ: stations 1
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

// The card's footprint on the ground, ORIENTED (RING, 2026-09-01): the OBB
// (hw, hd about the two ground axes ax, az) for the separating-axis gap below,
// and the AABB half-extents (hx, hz) that are correct at EVERY azimuth now —
// the old `|cos| < 0.5` swap under-reported hz by 2.4× at 45°. At a quarter
// turn hx/hz are the old numbers to the bit (seatTrig snaps the trig).
export function placardFootprint(anchor) {
  if (!anchor) return null;
  const { s, c } = seatTrig(anchor.azim);
  return {
    x: anchor.x, z: anchor.z, azim: anchor.azim,
    hw: PLACARD.w / 2, hd: PLACARD.d / 2,          // the OBB, for the SAT
    ax: { x: c, z: -s }, az: { x: s, z: c },       // the card's two ground axes
    hx: cardHx(anchor.azim), hz: cardHz(anchor.azim), // the AABB, correct at EVERY angle now
  };
}

// SEPARATING-AXIS clearance over the four edge normals: positive is clear ground
// along the best separating axis (a FLOOR on the distance — for two cards
// separated diagonally the old AABB form returned hypot, this returns the axis
// gap), negative the least penetration. tools/steps/place-card.mjs quadHitsRect
// is the same test. The assertion the felt shelf never had.
export function placardGap(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let best = -Infinity;
  for (const n of [a.ax, a.az, b.ax, b.az]) {
    const ea = a.hw * Math.abs(n.x * a.ax.x + n.z * a.ax.z) + a.hd * Math.abs(n.x * a.az.x + n.z * a.az.z);
    const eb = b.hw * Math.abs(n.x * b.ax.x + n.z * b.ax.z) + b.hd * Math.abs(n.x * b.az.x + n.z * b.az.z);
    const sep = Math.abs(dx * n.x + dz * n.z) - ea - eb;
    if (sep > best) best = sep;
  }
  return best;
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
// Worked at the v3 lane (4.30 × 1.2 = 5.16), medium, room 4.2: 1 die → the
// whole 4.2 (the wall room binds before the lane does); a pair → 3.20; 3d6 →
// 2.20; 6d6 → 0.90 with the pool's 6.6 spread and its 1.32 pitch both kept —
// identical to the v2 numbers, because at this zoom the room already bound.
// Close/6d6 → 0.90, spread 4.2, no collapse. At wide, where there IS room,
// the push shows: a lone die comes in at 5.16 instead of 4.30. The wider
// lane costs the small pools some spread (a pair's line compresses to the 2.0
// pitch floor) and costs the big ones nothing at all, which is the right way
// round: a handful comes from your side of the table, a single d20 from your
// spot, and neither is ever folded onto one x.
export function laneSpread(laneSlot, room, spread, count) {
  if (!laneSlot) return { lane: 0, spread };            // shipped path, bit-identical
  const pushed = PLACE_LANE * PLACE_PUSH;               // the v3 throw lane
  const s = Math.min(spread,
    Math.max(2 * (room - pushed), (count - 1) * PITCH_MIN));
  const lane = Math.sign(laneSlot)
    * Math.min(pushed, Math.max(0, room - s / 2));
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
// above). A long-edge station owns its slice of the NEAR side of the mat, z
// toward its own edge; two stations on one long edge split it laterally by
// lane sign into corner boxes, and the centre slot (lane 0, the seventh
// chair) takes the centre band of the quadrant width — its felt overlaps its
// neighbours', which is what a seven-person table costs, and it is the last
// chair dealt for exactly that reason. A head station owns its own END of the
// mat, full depth.
//
// V3, THE PUSH (2026-09-01): every region's CENTRE stands PLACE_PUSH × where
// the v2 centre stood — pushed away from the table's centre, toward its own
// corner or edge. The walls are fixed, so the push is taken on the OPEN sides
// (the centre lines): a quadrant's inner edges pull outward by `off` of the
// half-extent, the head's end-third narrows to an end-fifth, and opposite
// chairs' region centres sit exactly 20% further apart, which is the half of
// Joe's "more space between them" the felt can answer. The centre band keeps
// its width (its centre IS the centre line; it has no direction to push) and
// takes the z push like its edge-mates. The die-hull cap on the aim box
// (AIM_HULL, below) is untouched — dice are still never aimed AT a rim.
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
  const off = PLACE_PUSH - 1;
  if (entry <= 1) {
    const z = entry === 0 ? [hd * off, hd] : [-hd, -(hd * off)];
    const x = lane < 0 ? [-hw, -(hw * off)] : lane > 0 ? [hw * off, hw] : [-hw / 2, hw / 2];
    return { x0: x[0], x1: x[1], z0: z[0], z1: z[1] };
  }
  // The head's end, its centre at PLACE_PUSH × the end-third's: the wall side
  // stays the wall, so the inner edge comes in to 2c − hw and the third is an
  // end-fifth at PLACE_PUSH 1.2.
  const c = (hw - w / 6) * PLACE_PUSH;
  const x = entry === 2 ? [-hw, -(2 * c - hw)] : [2 * c - hw, hw];
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
//            hull cap. 0.25 — and this is the dial THE PUSH RIDES IN ON
//            (v3.1, 2026-09-01, the verification's D1). The box is anchored
//            in the region's own WALL corner, and the walls never moved: at
//            0.5 the pushed centre stood at only ×1.09 of the v2 aim while
//            the region centres said ×1.2, and the pools' rests grew apart
//            6–9% when Joe had asked at least 20. At 0.25 the corner-anchored
//            centre lands at ×1.21 of the v2 aim on every mat (medium −3.86,
//            1.92 of a −4.25/2.10 hull-cap floor). Swept 0.35/0.25/0.18 at 24
//            seeds: the rest separation SATURATES past 0.25 (the settle smear
//            clips at the walls and hands the rest back), and every
//            lower-toss variant beside it (h 0.35, speed 0.4) gave
//            separation back — the shipped toss stays.
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
// THE RECORD AT THESE DIALS (tools/steps/place-region.mjs, 24 seeds a cell —
// 12 at close — stations 0/1/4/6; v3.1, 2026-09-01). Centroid in region —
// wide: 3d6 100%, 6d6 96–100%, the head 100%/83%, d20 54–92%; medium: 3d6
// 88–96%, 6d6 67–92%, the head 75%/50%, d20 42–67%; close: 3d6 75–92%, 6d6
// in a pushed corner box 0% (six d6 do not fit a 3.4 × 2.1 corner of a small
// mat — the v3 small-mat cost, deepened by the deeper aim and recorded), d20
// 25–75%. Dice in region: wide 3d6 90–93%, 6d6 57–58%; medium 3d6 76–83%,
// 6d6 47–51%. THE SPACE ITSELF, the number Joe asked for: two laned pools'
// centroids stand apart, v2 → v3.1, medium 5.82 → 6.57 (+13%) for 3d6 and
// 3.82 → 4.22 (+11%) for 6d6, wide 8.65 → 10.13 (+17%) and 5.56 → 6.44
// (+16%); with BOTH pools standing (tools/steps/place-gap.mjs, the two-tab
// flow) the clear ground between them grew medium 3.54 → 4.02 (+14%), wide
// 6.14 → 7.11 (+16%). What is left of the 20 is a measured CEILING, not an
// unspent dial: the box swept 0.35/0.25/0.18 and the softer tosses beside it
// (h 0.35, speed 0.4) all SATURATE or reverse past these dials — the hull
// cap (dice are never aimed at a rim), the wall-bound lane at medium and the
// settle smear clipping at the rims own the remainder. Pile and settle, FOR
// THE RECORD AND NOT AS A GATE (Joe: "pilling is OK"; place-settle.mjs
// prints v1's bars and exits 0): v3.1 reads mean +8.6pp, median +0.27 s,
// worst +20.8pp at close/3d20 from the head — the worst cell unchanged from
// v3 (+8.0/+0.25/+20.8) and still under the +25pp pathological bar, so no
// station's push was pulled; a 3d6 still piles +0–8pp and settles sooner, a
// 6d6 into its corner leans +0.4–1.5 s at medium.
export const PLACE_AIM = { on: 1, speed: 0.5, h: 0.45, box: 0.25, corner: 1, own: 1, spin: 1 };

// The widest die's rest ceiling, kept off every wall the aim box touches by
// the cap below — dice must not be aimed AT a rim. Exported for the ring's
// box-inclusive hull pin (tests/places.test.mjs); the value is untouched.
export const AIM_HULL = 1.25;

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

// ===========================================================================
// THE RING (BRIEF-RING, Joe, 2026-09-01: "players sit in a circular
// orientation not around a rectangular table … 2 players should sit opposite,
// 3 players should sit in a triangular orientation … it's simple math").
//
// Everything below is the ring's algebra, landed BESIDE the rectangle's above
// and called by nothing in the app yet (S1 of SLICES-RING). θ is now COMPUTED
// where `entry` was ENUMERATED — one expression order in this module is the
// whole of goal 15's defence. Every expression here is written in exactly the
// order shown; a reordering is a two-films bug. Zero rng draws, no Date, no
// DOM, no Math.random.
// ===========================================================================

// ---------------------------------------------------------------------------
// The ring's constants
// ---------------------------------------------------------------------------

// Seat 0 sits at +z — camOrbit's own zero, "front" as spawnDie names it.
export const RING_BASE = 0;

// Half-width of the arc the chairs occupy while a tower is socketed (the
// machine owns the back edge, azim π is forbidden — docs/TOWER.md). 150°: at
// 120° the N=8 cards OVERLAP on every tower mat (medium+tower −0.288,
// close+tower −0.909); at 150° nothing overlaps (worst 0.263, close+tower N=8,
// RECORDED), no card stands on the back wall at any mat, and every chair is
// ≥ 48.75° from π.
export const TOWER_ARC = (5 * Math.PI) / 6;

// The card's clear ground past the wall plane — the same 0.10 PLACARD_STANDOFF
// always left, now derived once and applied along whichever axis binds.
// SHIPPED, like the two consts it is built from: it is the number the layout
// rows assert 0.10 against, and nothing that moves reads it. The live clear
// ground is `PLACARD.standoff − PLACARD.d / 2`, which is what seatAnchor
// stands the card at by construction.
export const PLACARD_CLEAR = PLACARD_STANDOFF - PLACARD_D / 2;

// The shared copy of spawnDie's literal 2.2 — how far inboard of its wall a
// pool's line is born. The four literal branches in spawnDie keep their
// literal; this is the ring branch's.
export const SPAWN_IN = 2.2;

// A die's width, the unit of angular slack the centroid claim allows at a
// wedge boundary (place-two-rolls).
export const DIE_W = 1.35;

// The two printing turns a panel can take: [mirror across the card's width,
// flip the row end-over-end]. Moved here from js/placard.js's READ_TURN so the
// predicate below can be pinned in Node.
export const TURN_NONE = Object.freeze([false, false]);
export const TURN_HALF = Object.freeze([true, true]);

// ---------------------------------------------------------------------------
// The primitives
// ---------------------------------------------------------------------------

// THE ONLY sin/cos of a seat angle in the app. The exact-quarter SNAP is part of
// the anchor rule: it makes N=2/4/8's axis seats bit-identical to the shipped
// stations, keeps the front/back mirror exact (place-two-views pins the two
// frames equal to SIX decimals), and stops sin(Math.PI) = 1.22e-16 leaking a
// 5e-16 x into a card that must be dead centre.
export function seatTrig(theta) {
  const q = Math.round(theta / (Math.PI / 2));
  if (Math.abs(theta - q * (Math.PI / 2)) < 1e-12) {
    const m = ((q % 4) + 4) % 4;
    return { s: [0, 1, 0, -1][m], c: [1, 0, -1, 0][m] };
  }
  return { s: Math.sin(theta), c: Math.cos(theta) };
}

// WHERE A RAY FROM THE TABLE'S CENTRE LEAVES AN AXIS-ALIGNED BOX: the ray
// parameter t for direction (sin θ, cos θ) against |x| <= ax, |z| <= az. The
// corner is a TOTAL ORDER, not a coin flip: `<=` hands an exact corner to the x
// wall on every client on the same doubles.
export function rayRect(theta, ax, az) {
  const { s, c } = seatTrig(theta);
  const as = Math.abs(s);
  const ac = Math.abs(c);
  const tx = as === 0 ? Infinity : ax / as;
  const tz = ac === 0 ? Infinity : az / ac;
  return tx <= tz ? tx : tz;
}

// LIANG-BARSKY on one line against one box: the interval {lo, hi} of u for
// which (px + u*tx, pz + u*tz) is inside |x| <= ax, |z| <= az, or null. ONE clip
// routine, three callers (the spawn chord, the die clamp, the aim's tangent room).
export function slabSpan(px, pz, tx, tz, ax, az) {
  let lo = -Infinity;
  let hi = Infinity;
  for (const [p, q, lim] of [[px, tx, ax], [pz, tz, az]]) {
    if (q === 0) { if (Math.abs(p) > lim) return null; continue; }
    const a = (-lim - p) / q;
    const b = (lim - p) / q;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  return hi < lo ? null : { lo, hi };
}

// (-π, π]. One helper, one place. atan2(x, z) is the azimuth convention camOrbit
// uses (+z is 0, +x is +π/2) — NOT atan2(z, x), which is silently wrong by 90°.
export function wrapPi(a) {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}

// ---------------------------------------------------------------------------
// The stamp and the seat angle
// ---------------------------------------------------------------------------

// THE ONE BOUNDARY PREDICATE. The film reader, arrivalSweep and js/demo.js all
// ask this and nothing else.
export function seatValid(seat, seats, arc = 0) {
  return Number.isInteger(seat) && Number.isInteger(seats) && (arc === 0 || arc === 1)
    && seats >= 1 && seats <= PLACE_MAX && seat >= 0 && seat < seats;
}

// WHO SITS WHERE, AS THE STAMP CARRIES IT. `occupied` is whatever list the caller
// DISPLAYS (server: room.players with an integer place — stubs are in
// room.vacated and are NOT chairs; browser/demo: placeRoster() rows). Counted,
// never sorted: the rank is how many occupied places are below this one, so the
// list's order is irrelevant. null for anything that is not an occupied place —
// a placeless roll carries no stamp and the film falls to its seeded draw, the
// contract entryFor had, kept word for word.
export function seatStamp(occupied, place, towerUp = false) {
  if (!Array.isArray(occupied)) return null;
  if (!Number.isInteger(place) || place < 0 || place >= PLACE_MAX) return null;
  let seat = 0;
  let seats = 0;
  let held = false;
  for (const p of occupied) {
    if (!Number.isInteger(p) || p < 0 || p >= PLACE_MAX) continue;
    seats += 1;
    if (p < place) seat += 1;
    if (p === place) held = true;
  }
  if (!held) return null;
  return { seat, seats, arc: towerUp ? 1 : 0 };
}

// THE SEAT'S AZIMUTH — "it's simple math". Azimuth 0 is +z (front); k walks
// counter-clockwise seen from above (+x is π/2).
//   open ring:  θ = RING_BASE + 2πk/N          → N=2 opposite, N=3 a triangle, N=6 a hexagon
//   tower arc:  θ = RING_BASE + TOWER_ARC·(2k−N+1)/N, wrapped into [0, 2π)
// Written as ONE expression per branch: (2 * Math.PI * seat) / seats, never
// Math.PI * 2 * (seat / seats). placeTheta(0, N, 0) is the double +0 for every N —
// framingInfo().placeOrbit === 0 and camScale === 1 for a lone player rest on it.
// null for an invalid stamp (never a guess).
export function placeTheta(seat, seats, arc = 0) {
  if (!seatValid(seat, seats, arc)) return null;
  if (!arc) return RING_BASE + (2 * Math.PI * seat) / seats;
  const t = RING_BASE + (TOWER_ARC * (2 * seat - seats + 1)) / seats;
  return t < 0 ? t + 2 * Math.PI : t;
}

// ---------------------------------------------------------------------------
// The anchor — the card stands ON ITS OWN RAY
// ---------------------------------------------------------------------------

// The card's AABB half-extents at azimuth θ (PLACARD_W across local x,
// PLACARD_D along local z; local +z is the azimuth ray).
function cardHx(theta) { const { s, c } = seatTrig(theta); return (PLACARD.w / 2) * Math.abs(c) + (PLACARD.d / 2) * Math.abs(s); }
function cardHz(theta) { const { s, c } = seatTrig(theta); return (PLACARD.w / 2) * Math.abs(s) + (PLACARD.d / 2) * Math.abs(c); }

// THE CHAIR. The card's centre is where the ray at θ leaves the rectangle GROWN
// by the card's own oriented footprint plus PLACARD_CLEAR. Three things this buys:
//   (a) THE PICTURE — centres lie exactly on their θ rays, so six cards are an
//       exact hexagon in azimuth and three an exact triangle (a fixed push along
//       the wall normal puts a 60° card 6.1° off its ray and the hexagon reads
//       crooked: clean's oval, measured).
//   (b) THE LICENCE — along the binding axis the footprint spans
//       [wall + 0.10, wall + 0.10 + 2h]: the whole card is outboard of a wall
//       plane at EVERY θ and EVERY mat, by construction (0.1000 in all 288 cells).
//       That is what licenses depthWrite, the real shadow and the seating raycast.
//   (c) THE SHIPPED NUMBERS — cardHz(0) = PLACARD_D/2, so z = d/2 + PLACARD_STANDOFF:
//       today's 4.21 / 6.36 / 5.16 / 7.91 / 3.46 / 5.16 to the bit at the quarter turns.
// Pure in (seat, seats, arc, w, d). Takes the LIVE TABLE_D (matExtra 4.5 under
// a tower deepens the mat, and the rim moves at EVERY θ now, so the trap
// below is worse under a ring, not better).
//
// `w` is the mat's playable width (TABLE_W) and `d` its playable DEPTH AS THE
// WALLS CURRENTLY STAND (TABLE_D), not the base layer. That is the one
// correction this file makes to the design it was built from: the design read
// the depth off MAT_DEPTH.base so that "nothing slides when the mat deepens",
// on the belief that a socketed tower's +4.5 lands wholly behind the table. It
// does not. TABLE_D is a SUM of layers and the walls are placed at ±TABLE_D/2
// (js/main.js:3238-3243, and towerMatDepth's own
// `walls.front.position.set(0, 0, TABLE_D / 2)`), so socketing a tower moves
// the FRONT wall forward by half the extra as well. A front card pinned to the
// base depth would then stand 1.53 units INSIDE the wall at medium: dice could
// reach it, slide through it, and the outboard-of-the-wall property that
// licenses depthWrite and the seating raycast would be false exactly when a
// tower is up. The card stands where the dice stop, at every mat state, and
// that invariant outranks the convenience of a card that never moves.
//
// Returns { x, y, z, azim, seat, seats, arc, r, relocated } — y is the ground
// plane; js/placard.js raycasts the venue's own surface from here (the
// `surfaceUnder` pattern) so a fae ground at 0.02–0.035 never buries the base.
// null for an invalid stamp.
//
// THE PARENTHESES ARE LOAD-BEARING (S1, measured): PLACARD_CLEAR is the double
// 0.09999999999999998, and `half + hx + CLEAR` lands one ulp off today's
// `half + PLACARD_STANDOFF` in 9 of the 12 quarter-turn cells (wide 5.16 →
// 5.159999999999999, medium heads 6.36 → 6.359999999999999). `hx + CLEAR` is
// 0.86 to the bit at every quarter turn, so `half + (hx + CLEAR)` IS the
// shipped sum — all 12 cells bit-equal the rectangle's placeAnchor (deleted in
// S4; P5 now pins the literal expression `half + PLACARD_STANDOFF`). Written
// once, this way.
export function seatAnchor(seat, seats, arc, w, d) {
  const theta = placeTheta(seat, seats, arc);
  if (theta === null) return null;
  const { s, c } = seatTrig(theta);
  // THE TABLE IS ROUND (Joe, 2026-09-01: "players sit in a circular
  // orientation, not around a rectangular table"). The card stands on the
  // ring at RING_R(w) + PLACARD_STANDOFF, on its own ray, facing the centre.
  // `d` is accepted and ignored: a circle has one radius.
  const t = ringRadius(w) + PLACARD.standoff;
  return { x: t * s, y: 0, z: t * c, azim: theta, seat, seats, arc, r: t, relocated: arc === 1 };
}

// ---------------------------------------------------------------------------
// The round table and the toss (2026-09-01)
// ---------------------------------------------------------------------------

// The table's radius: half the mat's width. The walls stand at ±w/2 on both
// axes (the presets are square), so every point of the disc is inside them.
export function ringRadius(w) {
  return w / 2;
}

// Where your dice are born and where they land, both on YOUR ray:
//   TOSS_IN   — the spawn line sits this far inside the rim
//   RING_SPOT — the landing spot is this share of the radius from the centre
// A toss, not a hurl: from a low hand (PLACE_AIM.h), gently (TOSS_SPEED of the
// shipped hurl), toward the spot in front of you. Dice land roughly there and
// roll where they roll — the spot is a target, not a claim.
//   TOSS_BACK — the dice are born this far BEHIND the spot (toward the player)
//   TOSS_H    — spawn height, as a share of the shipped 6–10: a low hand
//   TOSS_SPEED— the hurl, as a share of the shipped 14–22 u/s: a drop, not a throw
// Measured 2026-09-01 (tools/steps/ring-look.mjs prints each pool's centroid
// against its spot): a die thrown from the rim at 0.35 of the hurl crossed the
// spot and kept going; the drop is what lands.
//
// THE TOSS IS A DIAL SET (2026-09-02, Joe: "aim at the target always, but have
// the ability to throw from further back"). SEAT_TOSS is the one mutable object
// the toss reads, in the shape dice.yaml's `table.seats` declares; main.js
// copies the tree into it at boot and on every dial (the PLACE_AIM pattern —
// this file is imported by server.js and must not import tune.js). The
// velocity always points at the spot, so `back` alone lands short: `height`
// and `speed` rise with it. The consts below are the SHIPPED values, read by
// the unit rows and by nothing that moves.
export const SEAT_TOSS = { spot: 0.5, back: 0.4, height: 0.3, speed: 0.12, box: 0.15, per: 1.5 };
export const RING_SPOT = SEAT_TOSS.spot;
export const SPOT_R = 0.22;     // the spot's drawn radius (overlay) and the frame's unit, as a share of the table's radius
export const TOSS_BACK = SEAT_TOSS.back;
export const TOSS_H = SEAT_TOSS.height;
export const TOSS_PER = SEAT_TOSS.per;    // the pool line's pitch for a toss (the hurl's is SPAWN.per 2.6)
export const TOSS_SPEED = SEAT_TOSS.speed;
export const TOSS_BOX = SEAT_TOSS.box;   // the scatter box around the spot, as a share of the shipped THROW_TARGET box

// The toss for a stamped roll: {theta, x, z (spawn line midpoint), tx, tz (the
// line's direction — the tangent), ax, az (the spot)}. null for a bad stamp.
// Written once, in one expression order (the anchor rule): two clients must
// agree on every double here.
export function seatToss(seat, seats, arc, w) {
  const theta = placeTheta(seat, seats, arc);
  if (theta === null) return null;
  const { s, c } = seatTrig(theta);
  const R = ringRadius(w);
  const r1 = R * SEAT_TOSS.spot;
  const r0 = r1 + SEAT_TOSS.back;
  return { theta, x: r0 * s, z: r0 * c, tx: c, tz: -s, ax: r1 * s, az: r1 * c };
}

// The aim factors spawnDie reads for a toss (the AIM_ZERO shape): the box is
// centred on the spot and square in world units.
export function tossAim(toss, w, d) {
  if (!toss) return AIM_ZERO;
  return { x: toss.ax, z: toss.az, kx: SEAT_TOSS.box, kz: (SEAT_TOSS.box * w) / d,
    k: SEAT_TOSS.speed, own: 0, spin: PLACE_AIM.spin, h: SEAT_TOSS.height };
}

// ---------------------------------------------------------------------------
// The spawn line — spawnMid, laneAndChord, sideFor
// ---------------------------------------------------------------------------

// THE LINE'S MIDPOINT: the point on the seat's own ray furthest out that is still
// SPAWN_IN clear of EVERY wall — rayRect against the mat shrunk by 2.2 on both
// pairs. At θ=0 medium this is (0, 3.35 − 2.2) = (0, 1.15), spawnDie's own
// side-0 literal; at π/2 it is (3.3, 0), side 3's. The tangent t = (cos θ, −sin θ)
// is PERPENDICULAR TO θ (at 0 it is +x̂, side 0's direction). Not "the rim's own
// tangent": a corner chair throwing along its nearest wall reads as throwing
// sideways past the person next to it (and clean's version measured a shorter
// line than the rule it rejected).
export function spawnMid(theta, w, d) {
  const { s, c } = seatTrig(theta);
  const t = rayRect(theta, w / 2 - SPAWN_IN, d / 2 - SPAWN_IN);
  return { x: t * s, z: t * c, tx: c, tz: -s, theta };
}

// THE RAY YIELDS TO THE POOL (F1, one dimension over). The pool's line is laid
// along the tangent; `want` is the caller's shipped spread
// (min(TABLE_W − SPAWN.pad, count·SPAWN.per)); it is capped by the chord the
// pool's largest hull leaves inside the mat (BOTH wall pairs), and the centre `at`
// stays on the seat's own ray whenever the chord has room, sliding along the
// tangent only as far as it must. Zero rng draws.
export function laneAndChord(theta, w, d, hull, count, want) {
  const mid = spawnMid(theta, w, d);
  const span = slabSpan(mid.x, mid.z, mid.tx, mid.tz, w / 2 - hull - 0.05, d / 2 - hull - 0.05)
    || { lo: 0, hi: 0 };
  const room = span.hi - span.lo;
  const spread = Math.min(want, room);
  const at = Math.max(span.lo + spread / 2, Math.min(span.hi - spread / 2, 0));
  return { mid, lo: span.lo, hi: span.hi, room, spread, at };
}

// WHICH WALL THIS SEAT IS BEHIND, for the INSTRUMENTS only (0 front/+z, 1 back/−z,
// 2 left/−x, 3 right/+x — spawnDie's own four names, so `spawn-inside-walls`'
// `some(d => d.side >= 2)` and every tool that groups by side keep working). It
// selects NOTHING on the ring path: the position comes from the tangent.
export function sideFor(theta, w, d) {
  const { s, c } = seatTrig(theta);
  const as = Math.abs(s);
  const ac = Math.abs(c);
  const tx = as === 0 ? Infinity : (w / 2) / as;
  const tz = ac === 0 ? Infinity : (d / 2) / ac;
  return tx <= tz ? (s >= 0 ? 3 : 2) : (c >= 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// The wedge — wedgeFor, inWedge
// ---------------------------------------------------------------------------

// A PLACE OWNS ITS WEDGE OF THE FELT FOR LANDING: the mat points whose azimuth
// from the centre is within ±half of θ (half = π/N open, TOWER_ARC/N under a
// tower — N=1 is the whole mat, N=2 the two half-planes), MINUS the centre
// cut-out. THE PUSH (PLACE_PUSH 1.2) is radial now: the cut-out is the mat scaled
// by (PLACE_PUSH − 1) about the centre — 2.2 × 1.34 at medium, v3's untinted
// corridor — so the centre belongs to nobody, as it did, and no apex is shared.
// `outer` walks the rim from θ−half to θ+half (corners emitted as the LITERALS
// ±hw/±hd, so the polygon has no rounding seam at a corner); `inner` is `outer`
// scaled by `off`. The overlay DRAWS these; it never re-derives them. Pure in
// (seat, seats, arc, w, d). Still not a claim: nothing refuses a die for where it stops.
export function wedgeFor(seat, seats, arc, w, d) {
  const theta = placeTheta(seat, seats, arc);
  if (theta === null) return null;
  const hw = w / 2;
  const hd = d / 2;
  const half = (arc ? TOWER_ARC : Math.PI) / seats;
  const off = PLACE_PUSH - 1;
  const outer = half >= Math.PI
    ? [[-hw, -hd], [-hw, hd], [hw, hd], [hw, -hd]]              // N=1 open: the whole mat
    : rimChain(theta - half, theta + half, hw, hd);
  const inner = outer.map(([x, z]) => [x * off, z * off]);
  return { seat, seats, arc, theta, half, hw, hd, off, outer, inner };
}

// The point where the ray at t leaves the mat's rim.
function rimPoint(t, hw, hd) {
  const { s, c } = seatTrig(t);
  const r = rayRect(t, hw, hd);
  return [r * s, r * c];
}

// rimPoint(a), then every mat corner whose azimuth lies STRICTLY inside (a, b)
// in ascending order, then rimPoint(b). Corner azimuths: ca = atan2(hw, hd),
// π − ca, π + ca, 2π − ca, each mapped into (a, a + 2π] before the compare.
// The corners are emitted as the literals ±hw/±hd, never re-derived by trig.
function rimChain(a, b, hw, hd) {
  const ca = Math.atan2(hw, hd);
  const corners = [
    [ca, [hw, hd]],
    [Math.PI - ca, [hw, -hd]],
    [Math.PI + ca, [-hw, -hd]],
    [2 * Math.PI - ca, [-hw, hd]],
  ];
  const span = b - a;
  const inside = [];
  for (const [t, p] of corners) {
    let u = (t - a) % (2 * Math.PI);
    if (u <= 0) u += 2 * Math.PI;                     // (0, 2π]: u is (t − a) mapped into (a, a + 2π]
    if (u < span) inside.push([u, p]);                // strictly inside (a, b)
  }
  inside.sort((p, q) => p[0] - q[0]);
  const out = [rimPoint(a, hw, hd)];
  for (const [, p] of inside) out.push(p);
  out.push(rimPoint(b, hw, hd));
  return out;
}

// Closed on both wedge boundaries (a die resting exactly on one is in BOTH
// neighbours, never in neither — the v2 rule kept) and on the cut-out's edge;
// bounded by the mat (a point off the felt is in no wedge).
export function inWedge(region, x, z) {
  if (!region) return false;
  if (Math.abs(x) > region.hw || Math.abs(z) > region.hd) return false;
  if (Math.abs(x) < region.hw * region.off && Math.abs(z) < region.hd * region.off) return false;
  if (region.half >= Math.PI) return true;
  return Math.abs(wrapPi(Math.atan2(x, z) - region.theta)) <= region.half;
}

// ---------------------------------------------------------------------------
// The aim — seatAim
// ---------------------------------------------------------------------------

// ON THE θ RAY, IN THE OUTER PART OF THE WEDGE, THE WHOLE BOX A HULL CLEAR OF
// EVERY RIM. Radially: the box's FAR edge sits at capEdge = rayRect against the
// hull-shrunk mat (today's z1 = hd − 1.25 = 2.10 exactly); its radial length is
// PLACE_AIM.box of the run from the cut-out (r0 = 0.2·rim = today's 0.67) to that
// edge (0.3575 today); so ra0 = 1.92125, the shipped front aim to the digit.
// Tangentially: PLACE_AIM.box of min(the wedge's own width at ra0, the mat's
// hull-shrunk chord through it). THEN the centre is pulled in by one more rayRect
// against the hull rect shrunk by the oriented box's own AABB half-extents — so
// the box's AABB is inside the hull rect at EVERY θ (slack 0.000 everywhere; a
// centre-only cap left the 45° box 1.051 from the rim). At θ = 0 the shrink is
// only along z by bl/2, which is exactly capEdge − bl/2: bit-identical.
// AIM_ZERO is returned BY REFERENCE for the dial off and for a bad stamp.
// Math.tan is asked only when half < π/2 (tan(π) is a NEGATIVE 1.2e-16 and would
// silently invert the box). Every seat is `own` (each die aims from its own point
// on the tangent); PLACE_AIM.corner is inert here — a corner is a rectangle idea.
export function seatAim(seat, seats, arc, w, d, throwTarget) {
  if (!PLACE_AIM.on) return AIM_ZERO;
  const theta = placeTheta(seat, seats, arc);
  if (theta === null) return AIM_ZERO;
  const { s, c } = seatTrig(theta);
  const as = Math.abs(s);
  const ac = Math.abs(c);
  const hw = w / 2;
  const hd = d / 2;
  const hx = hw - AIM_HULL;
  const hz = hd - AIM_HULL;
  const half = (arc ? TOWER_ARC : Math.PI) / seats;
  const r0 = (PLACE_PUSH - 1) * rayRect(theta, hw, hd);
  const capEdge = rayRect(theta, hx, hz);
  const bl = Math.max(0, (capEdge - r0) * PLACE_AIM.box);
  const ra0 = capEdge - bl / 2;
  const wedgeT = half < Math.PI / 2 ? 2 * ra0 * Math.tan(half) : Infinity;
  const ch = slabSpan(ra0 * s, ra0 * c, c, -s, hx, hz);
  const chordT = ch ? ch.hi - ch.lo : 0;
  const bt = Math.max(0, PLACE_AIM.box * Math.min(wedgeT, chordT));
  const bwx = (bl * as + bt * ac) / 2;
  const bwz = (bl * ac + bt * as) / 2;
  const ra = rayRect(theta, hx - bwx, hz - bwz);
  return {
    x: ra * s, z: ra * c,
    kx: (2 * bwx) / (w * throwTarget), kz: (2 * bwz) / (d * throwTarget),
    k: PLACE_AIM.speed, own: PLACE_AIM.own ? 1 : 0, spin: PLACE_AIM.spin, h: PLACE_AIM.h,
  };
}

// ---------------------------------------------------------------------------
// The printing predicate — readTurn (pure; js/placard.js imports it)
// ---------------------------------------------------------------------------

// WHICH WAY UP THE PRINTING GOES, at ANY relative angle. A panel's unflipped
// text-up runs foot-to-ridge: azimuth (azim + π) on the +z panel, azim on the −z
// panel. Ground-projected screen-up for a reader orbiting at φ is (φ + π). So the
// +z panel reads upright iff cos(azim − φ) > 0, the −z panel iff < 0 — and the
// panel FACING the reader is the +z one on exactly the same test. EDGE-ON
// (cos ≈ 0) keeps the head treatment: +sin takes the near pair, −sin the far —
// READ_TURN rows 1 and 3 verbatim. Returns [ +z panel turn, −z panel turn ].
export function readTurn(azim, readerAzim) {
  const d = azim - readerAzim;
  const c = Math.cos(d);
  const near = c > 1e-9 || (Math.abs(c) <= 1e-9 && Math.sin(d) > 0);
  return near ? [TURN_NONE, TURN_HALF] : [TURN_HALF, TURN_NONE];
}
