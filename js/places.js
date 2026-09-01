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
//
// A PLACE OWNS ITS REGION OF THE FELT FOR LANDING, AND THE FELT HOLDS ONE ROLL
// PER PLACE (v2, 2026-09-01, by Joe's word — docs/IMMERSION.md item 16 carries
// the quote and the one clause of its risk rule this amends). The region is a
// function of the stamp and the mat (regionFor), the throw into it a low toss
// (aimFor), and the sweep that lets two pools coexist is server.js
// arrivalSweep. Still not a claim: nothing refuses a die for where it stops.

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
// picture — where the CARD stands is placeLane(w) below, a share of the mat:
// 5.10 at wide, 3.98 at medium, 3.11 at close. The throw still comes in over
// the card's own face at every zoom: a lone die's line sits at 5.16 / 4.2 /
// 3.0 (the PUSHED lane below; laneSpread caps it at the room the mat has),
// within 0.7 of the card's centre and inside its 1.73 half-width; a handful's
// line yields toward the middle as it always did.
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
// does not move with this dial: placeLane(w) is the picture's own share and
// scaled with the v3 card instead. THE THROW ITSELF reaches the pushed
// centre through PLACE_AIM.box (v3.1): the aim box is anchored in the
// region's wall corner, which the push never moves, so the box's SIZE is
// what places its centre — 0.25 stands the aim at ×1.21 of the v2 aim,
// beside the ×1.2 the region centres moved. See the dial's own note.
export const PLACE_PUSH = 1.2;

// The clear ground two cards must leave each other, anywhere on the table.
// The assertion the felt shelf never had, and now also the floor PLACE_LANE
// is derived from — one number, one place, so the two can never drift.
export const PLACARD_GAP = 0.30;

// The placard's centre, OUTBOARD of the wall plane. The footprint is 1.52
// deep, so the inboard edge stands 0.10 past the plane where dice stop: no die
// can ever reach a placard, which is what makes depthWrite, a real shadow, and
// a raycast seating pass all legal at once (IMMERSION law 8's `surfaceUnder`
// trap is void BY GEOMETRY, not by care).
export const PLACARD_STANDOFF = 0.86;

// The card's footprint on the ground (docs/UX.md §7.63; js/placard.js builds
// the rig to these numbers — 3.68 × 1.52 × 2.09 ridge, a 3.45 × 2.07 card face
// at 20° off vertical; V3 2026-09-01, the v2 form × 1.15 on every axis —
// Joe: "the name plaquards should be slightly bigger overall (… make the
// plaquards 15% bigger or something)"). They live here because the
// outboard-of-the-wall property above is a fact about the LAYOUT, and a
// layout invariant may not be asserted against a number that lives somewhere
// else.
export const PLACARD_W = 3.68;
export const PLACARD_D = 1.52;

// WHERE THE CARD STANDS ALONG ITS EDGE, as a share of the mat's width — one
// card's footprint plus the gap floor on the medium mat (3.50 of 11), 4.49 at
// wide, 2.74 at close.
//
// A SHARE AFTER ALL — and the reason the absolute lane was wrong is the reason
// the v1 share was wrong, seen from the other side. The three zoom presets are
// SIMILAR pictures (eye height and distance are both a fixed share of the
// mat's width, js/main.js ZOOM_PRESETS) and the mat fills the frame's width to
// ndc 0.96 at each of them, so both bounds on the card scale with the mat:
// the frame's edge, and `#result-banner` — fixed DOM, the same 520 px at
// every zoom, which is the same share of the frame. An absolute 4.30 sat
// between them at wide and OUTSIDE the frame at medium and close: measured
// 2026-09-01 on the live page (1600 × 900, the v2 verification's D3), the own
// name's ink began 61 px left of the canvas at medium ("ront") and 310 px at
// close, from both long-edge chairs.
//
// THE NUMBER IS INSIDE A MEASURED WINDOW, AND THE WINDOW IS NARROW. The card
// does not scale with the mat, so on a small one its ridge stands relatively
// nearer the eye and the bounds tighten. At 1600 × 900 (canvas 1284 wide
// beside the panel), for a name the length of "Front" (~1.8 units of ink):
//   · WIDE — the printed BAND clears a 520 px banner (place-two-views' hard
//     gate, the shipped default zoom) only from 4.46 up; the name is whole
//     to 5.2. Shares 0.316–0.33.
//   · MEDIUM — the name is whole to 3.76 and clears the widest banner from
//     3.16. Shares 0.287–0.342.
//   · CLOSE — the name is whole to 2.52 and clears the widest banner from
//     2.62: the two do not meet. A 1.8 name, a 2.3 banner and their margins
//     do not fit a frame 6.9 units wide at that depth.
// 0.318 — a footprint and a gap at medium, the pitch three cards need to
// stand apart — was inside the first two windows and took close's cost on
// the outer side (v2's measured record: name clear of the canvas edge by
// 47 px at medium, of the widest banner by 77 / 57 / 33 px at the three
// zooms, the band by 13 px at wide, close's first letter −24 px to the rim).
// (The v1 share failed because it was a share of a 2.00-wide card's OWN gap;
// this is a share of the picture.) tools/steps/place-card.mjs reads these
// numbers off the live page. V3 (2026-09-01) keeps the same construction —
// a footprint and a gap of pitch at medium — and the footprint grew ×1.15
// with the card, so the share is 0.362 now: 5.10 at wide, 3.98 at medium,
// 3.11 at close; the v3 measured record beside the shipped gates is in the
// scenario text (place-two-views, placard-look) and ROADMAP row 14.
//
// WHAT IT COSTS, recorded: the full house at close. Three cards need 3.98 of
// pitch to stand a gap apart; wide (5.10) and medium (3.98, exactly) have it,
// and at close (3.11 of pitch for a 3.68 card) the centre slot — the seventh
// chair, dealt last for exactly this — OVERLAPS its neighbours by 0.57.
// tests/places.test.mjs pins the six outer and head stations at the 0.30
// floor on every mat, the centre slots at wide and medium, and the close
// number to the digit. The alternative — the 3.98 floor at every zoom — keeps
// seven cards apart at close by cutting every two-player table's own name
// there, which is the defect the v2 share fixed; so the rare table pays, and
// pays at the one zoom whose picture crops by design. Recorded, not gated —
// the gates are the shipped default's, and the two chairs' own names at
// medium.
export const PLACE_LANE_SHARE = (PLACARD_W + PLACARD_GAP) / 11;   // 11: the medium mat — a footprint and a gap of pitch there
export function placeLane(w) {
  return PLACE_LANE_SHARE * w;
}

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
// so the remap moved with them — station 1 stands at x +placeLane(w) and goes
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
      x: st.lane * placeLane(w),
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
