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

// A PLACE AT THE TABLE — THE OBJECT STANDING THERE (docs/UX.md §7.63).
//
// A `place` is the station (js/places.js owns that arithmetic). A PLACARD is
// the thing you can see: a folded tent card in a low holder, standing just
// outside the rim of the round table on its own ray, with somebody's name on
// it (js/places.js seatAnchor: seat k of N at 2π·k/N since 2026-09-01). Plus
// the WASH — the transient arc of the roller's hue that lies on the ground
// under THEIR card while their film plays, which is the second half of the
// attribution rule ("attribution is seat + wash"): a placeless roll comes in
// on a seeded edge and lights nothing, so it can never wear the name of
// whoever's card its random edge happened to cross.
//
// WHY A TENT AND NOT A PLATE OR A STAND. From the shipped medium eye the near
// mat edge is 78.6° below horizontal and the far edge 46.4°, so a flat plate
// loses the far read (0.72 of face-on) and a vertical plate loses the near one
// (0.20). A tent reads from every station AT ONCE, with the text projecting to
// screen-up at +0.998 everywhere; the half-opening that used to be 56° is 20°
// since the v2 resize, for the reason written out beside TENT_ALPHA. The base
// pad is not decoration either: VENUE-COMPOSITION rule 11 is "grown, not
// placed — the tell is the SEAM", and the seam here is the pad's chamfer and
// the contact shadow it throws. Without it a tent card meets the felt on two
// thin edges and reads as a decal standing up.
//
// WHY IT IS PROCEDURAL AND NOT FORGE-BAKED, said out loud because CLAUDE.md's
// default is the other way: the geometry is rewritten by who is sitting, by
// zoom, by tower socket and by the venue's ground height, so it is
// runtime-parametric where a GLB is a fixed mesh; js/towerglb.js REFUSES a
// file without dice-in/out portals, so a placard would need a second loader;
// and the /forge-model trigger is "anything beyond simple primitives", which
// two boxes and a folded card are not. The escape hatch stays open and is
// named: if the holder ever wants real cast-brass relief it becomes a baked
// scatter prop (≤500 tris) instanced eight times at +1 draw call, and the CARD
// stays procedural because it carries runtime text.
//
// ONE MESH, ONE MATERIAL, THREE TEXTURES, AND THE LENGTHS NEVER CHANGE. All
// eight stations' vertices are allocated always; an unoccupied station's
// collapse to a single point (zero area, zero pixels). So a join or a leave
// rewrites attribute CONTENTS, never attribute LENGTHS — no GPU reallocation
// for the whole life of a table, which is the felt's own recompositeFelt
// no-churn law applied to geometry. Per-player hue rides the VERTEX COLOURS
// (the felt's mottle mechanism, js/main.js:2606-2621) so eight hues cost one
// material; the name rides one row of a 1024 × 2560 atlas so a rename repaints
// 320 scanlines in place.
//
// THE TEXT IS FITTED, AND THAT IS THE DISCIPLINE THE KILLED MAT TEXT LACKED.
// The floor atlas gives 12.8 px per world unit and "THE GATE OF STORMS"
// rendered as "ATE OF ST" off both edges (GOALS goal 2's amendment). The card
// face is 640 × 320 px over 3.45 × 1.725 world units — 185.5 px/world-unit
// both ways, FOURTEEN TIMES the floor — and the name is measured down from
// 160 px to a 108 px floor and then truncated with a VISIBLE ellipsis.
// `fontPx` and `shown` are both reported, so the floor is asserted rather
// than hoped for.

import * as THREE from 'three';
import { PLACE_MAX, PLACARD, readTurn } from './places.js';

// ---------------------------------------------------------------------------
// The form (world units) — see docs/UX.md §7.63 for where these come from.
// ---------------------------------------------------------------------------

// V2, 2026-09-01 — THE CARD IS BIGGER THAN A DIE NOW, AND THAT IS THE WHOLE
// POINT OF THIS SET OF NUMBERS. Joe, looking at the deployed table: "the
// placards … are smaller than the dice". Measured on his frames: a d6 is 1.35
// world units on an edge (js/dice.js:40) and the card face was 2.00 × 0.70 —
// a die is TWICE the card's height in the world, and on screen after a 3d6 a
// die stood 250 px tall against a far card's 174 × 47. The v2 card measured
// 3.00 × 1.80 (the brief's floor was 3.0 × 1.6), printed band 3.00 × 1.50,
// ridge 1.83 — bigger than a d6 on every axis, in the world, before any
// projection.
//
// V3, SAME DAY, ×1.15 (Joe, on the v2 tree: "the name plaquards should be
// slightly bigger overall (maybe zoom out 20% and make the plaquards 15%
// bigger or something)"). Every world dimension below is the v2 number
// × 1.15 — face 3.45 × 2.07, printed band 3.45 × 1.725, ridge 2.09, footprint
// 3.68 × 1.52 in js/places.js — and TENT_ALPHA holds at 20° (the tent's depth
// grows ×1.15 with the slope, and the v3 standoff 0.86 absorbs it). The pair
// of dials is the point: the v3 camera retreats ×1.2 on a placed table
// (js/main.js PLACE_RETREAT), which shrinks dice and cards alike, so the
// card's net screen size is ≈ 0.96 of v2 while the card:die ratio — the thing
// Joe actually judged — improves ×1.15.
//
// THE OPENING ANGLE MOVED WITH THE SIZE, and it had to. A tent's DEPTH is
// 2·slope·sin α, so keeping the authored 56° off vertical at a 1.80 slope
// gives a card 2.99 deep: its holder would need a 1.60 standoff and its
// outboard lip would land past z 6.4 at medium, beyond the camera's own z of
// 6.0 — the near card would not be in the picture at all. Measured on the way
// down: at 32° (holder 2.00, standoff 1.10) the near card's face still bottoms
// out at ndc −1.046 on a 1600×900 wide frame and the far card's top reaches
// +1.23 at close. At 20° the tent is 1.23 deep, the holder 1.32, the standoff
// 0.76, and the near card comes back inside the picture whole (ndc
// −0.905..−0.676, `in` true).
//
// What a steeper tent costs is the near read and what it buys is the far one,
// which is the right way round because the near card is your own name. The
// face normal points at elevation α, the near mat edge is seen at 78.6° and
// the far at 46.4°, so the face-on fraction is cos(78.6 − α) near and
// cos(46.4 − α) far — 0.923 / 0.986 at 56°, and 0.521 / 0.896 at 20°. Times
// the printed area, that is 0.80 / 0.85 world units of apparent face before,
// and 2.34 / 4.03 after: the card you read from ACROSS THE TABLE, the one that
// carries somebody else's name, is nearly FIVE times the face it was, and your
// own is three.
// THE FOOTPRINT IS READ AT BUILD TIME, NOT AT MODULE LOAD (2026-09-03,
// dice.yaml `cards`). `PLACARD` in js/places.js is the one mutable object the
// declaration writes, and js/main.js copies the tree into it in its own module
// body — which runs AFTER this file has evaluated, because main.js imports it.
// A `const BASE_W = PLACARD.w` here would therefore capture 3.68 forever and
// the dial would move every footprint the layout computes while the rig it is
// supposed to describe stayed the size it shipped. Functions, read where they
// are used — and that turned out to be the whole of what made `cards.*` a LIVE
// row in phase D4: `_writePlacard` rewrites every quad on every `update`, so
// the re-bake js/main.js's `rebuildPlacards` asks for at the placard flush is
// a flush this rig already knew how to do. There is no geometry captured at
// `_ensureBuilt` to throw away.
const baseW = () => PLACARD.w;            // 3.68 — the footprint js/places.js
const baseD = () => PLACARD.d;            // 1.52   asserts gaps against
const BASE_H = 0.14;
const CHAMFER = 0.06;                     // the seam that makes it an object
const CARD_W = 3.45;                      // v3: 3.00 × 1.15
const CARD_SLOPE = 2.07;                  // v3: 1.80 × 1.15
const CARD_T = 0.06;
const TENT_ALPHA = 20 * Math.PI / 180;    // half-opening, FROM VERTICAL
// Written once, in one expression order (the anchor rule): every other height
// in this file is derived from these two and never re-typed.
const TENT_RUN = CARD_SLOPE * Math.sin(TENT_ALPHA);   // 0.7080 — half the tent's depth
const TENT_RISE = CARD_SLOPE * Math.cos(TENT_ALPHA);  // 1.9451
const RIDGE_Y = BASE_H + TENT_RISE;                   // 2.0851
// THE READABLE FACE STARTS ABOVE THE FOOT, and this is a measurement, not a
// taste. Built without the split — with the name running the whole slope — the
// near card's printed area reached ndc −1.037 at close on a 16:9 frame and the
// standoff gate went red; the lower band is what it always was on a real tent
// card, the foot the holder grips, unprinted.
//
// IT IS AUTHORED THE OTHER WAY ROUND SINCE v2: the PRINTED HEIGHT is the
// number, because it is the number the atlas has to match. FACE_H over CARD_W
// is 1.725 over 3.45 — exactly 1:2 — and the atlas row is 320 px over a 640 px
// card region, exactly 1:2, so a glyph painted round on the canvas arrives
// round on the card. (At the old proportions the two ratios were 4.63 and
// 4.00, close enough to pass unnoticed; at these they are not, and a card that
// stretches every name 40% taller than it was drawn is the kind of wrong you
// see before you can name it.)
const FACE_H = 1.725;                                 // printed band, along the slope — CARD_W / 2, the 1:2 the atlas row keeps
const FACE_S = FACE_H / CARD_SLOPE;                   // 0.8333 of the slope, from the ridge
const FACE_Y0 = RIDGE_Y - FACE_S * TENT_RISE;         // 0.3944 — where the foot begins
const beadWMine = () => baseW() - 2 * CHAMFER; // YOUR card's bead runs the full base

// THE PRINTED THING HAS ITS OWN SIZE DIAL (`cards.scale`, 2026-09-04, Joe:
// "give me more control of the size of the placards in developer mode").
//
// WHAT HE WAS PROBABLY HITTING: `cards.width` and `cards.depth` move the
// HOLDER's footprint and have never moved the CARD — CARD_W has been a const
// since the rig was written, so widening the pad grew a brass slab under a
// name that stayed exactly the size it was. Two dials, two things, and until
// now only one of them was reachable.
//
// SO THIS ONE MULTIPLIES THE DRESS AND NOTHING ELSE: the tent's card panels,
// the flat styles' printed band. The footprint stays where `cards.*` put it
// (it is film — two clients agree on the ring), and the anchor is untouched,
// so the law this feature keeps is kept: a style, and now a style's size,
// changes only what is DRAWN at the anchor.
//
// RECORDED RATHER THAN CLAMPED: a tent scaled much past 2 is deeper than its
// own pad and its outboard lip overhangs the rim. Nothing breaks — the card
// has no collider and the WALL is what stops dice, not the card — but it
// looks like what it is. Grow the pad with `cards.depth` to match, or use the
// dial on a flat style, where the band lies inside the rim by construction.
const cardW = (k) => CARD_W * k;
const cardSlope = (k) => CARD_SLOPE * k;
const tentRun = (k) => TENT_RUN * k;
const tentRise = (k) => TENT_RISE * k;
const ridgeY = (k) => BASE_H + tentRise(k);
const faceH = (k) => FACE_H * k;
const faceY0 = (k) => ridgeY(k) - FACE_S * tentRise(k);
const BEAD_W_OTHER = 0.80;                // everybody else's is a centred pip

// WHICH WAY UP THE PRINTING GOES is no longer a table of four quarter turns.
// It is `readTurn(azim, readerAzim)` in js/places.js — a PREDICATE on the
// continuous relative angle, because the chairs sit on a RING now and (azim −
// reader) is any real number: at N=5 two different chairs round to the same
// quarter, and a table keyed on quarters hands one of them the other's
// printing. The predicate returns the same pair of rows the table did — each
// row [mirror across the card's width, flip the row end-over-end], the pair
// ordered [+z panel, −z panel] — so the atlas work below is unchanged: a
// quarter turn of the row in texture space, which is all it takes to hand a
// shallow tent card's name to the person looking at it. See _writePlacard for
// why the OBJECT must not turn instead, and setReader for the reader angle it
// is asked against.
//
// The reader angle itself is stored in RADIANS and compared to this epsilon —
// NOT bucketed. Any bucket wider than 22.5° is illegal: eight chairs is the
// most the table seats, so two chairs can be 45° apart, and a bucket that
// merges them prints one chair's card for the other. READER_EPS is only what
// keeps setReader an EDGE (the orbit cuts, never eases).
const READER_EPS = 1e-6;

// 24 quads a placard: 6 base (a truncated pyramid — the chamfer IS the bevel),
// 7 per card panel (printed face, unprinted foot, the hidden inner face, four
// edges), 2 end caps (emitted as quads with a repeated corner so the index
// buffer stays one uniform pattern; the second triangle is degenerate and
// costs no pixels), 2 beads.
const QUADS = 24;
const VERTS = QUADS * 4;                  // 96 per placard, 768 for the rig
const TRIS = QUADS * 2;                   // 48 per placard, 384 for the rig

// ---------------------------------------------------------------------------
// THE THREE DRESSES — `cards.style` (Joe, 2026-09-04: "I'm imagining one that
// is not even a physical placard, just text on the mat surface. Very subtle.
// Far less distracting")
// ---------------------------------------------------------------------------
//
// The tent above is one answer to "where does a name live at a round table",
// and it is the LOUDEST one the table has: 2.09 world units of lit object
// standing at every chair, taller than a die, in front of whatever the venue
// dressed the room with. This block adds two quieter answers so the three can
// be judged against each other in one sitting rather than argued about.
//
//   tent   the shipped card, UNTOUCHED — the control. Nothing below runs for it.
//   plate  the holder alone, lying flat: a low plaque just outside the rim,
//          printed face up. Still an object with a seam and a contact shadow,
//          a fraction of the silhouette.
//   inlay  no object at all. The name lies ON THE FELT inside the rim, ink
//          and nothing else — the subtlest thing that can still be read.
//   stamp  the inlay, pressed: a thin ruled border round the name and a
//          letterpress impression under both, so the felt reads as leather
//          somebody put a tool to (Joe, 2026-09-04: "a leather stamp type of
//          inlay option that has a thin border or, if possible, is actually
//          stamped into the mat").
//
// WHY THE STAMP IS PAINTED AND NOT LIT, said out loud because "actually
// stamped" asks for real relief and the honest answer is that this table has
// already measured that. UX §5.4b, 2026-08-29, the Nap: a normal map CANNOT BE
// SEEN on a horizontal floor under a 67-degree key — the refusal is a
// measurement, the surface is this same felt, and a stamp's bevel would face
// exactly the physics that killed it. So the impression is BAKED into the ink:
// a shadow up-light, a highlight down-light, a mid core, and a faint pressed
// ground inside the border. That reads as depth from every chair and at every
// zoom, because it does not depend on where the lamp is — which is the point
// the Nap made the expensive way.
//
// THE LAW THIS BLOCK KEEPS, and the reason the dial is `look` and not `film`:
// A STYLE CHANGES ONLY WHAT IS DRAWN AT THE ANCHOR, NEVER THE ANCHOR. It does
// not touch `PLACARD`, `seatAnchor`, `placardFootprint` or `placardGap` — the
// shared geometry two clients must agree on double for double. So the ring,
// the gaps, the camera's framing subjects and everything on the wire are
// identical under all three, which is what makes the comparison honest: what
// moves when you turn this dial is pixels, and only pixels.
//
// AND THE RETIRED MAT INSCRIPTIONS ARE NOT THIS (GOALS goal 2's amendment).
// That mechanism died because the FLOOR atlas gives 12.8 px per world unit and
// "THE GATE OF STORMS" printed as "ATE OF ST". The ink below is the CARD row —
// 640 px over 3.45 units, 185.5 px per unit, fourteen times the density and
// the same fitter with the same reported floor. Flat text is not what failed;
// flat text at a floor texture's resolution is.
export const STYLES = Object.freeze(['tent', 'plate', 'inlay', 'stamp']);
export const INK_MODES = Object.freeze(['steady', 'ghost']);
export const INK_TONES = Object.freeze(['ink', 'chalk']);

// The plaque: the tent's own holder, lower and without the card. BASE_H is the
// tent's 0.14; a plate that keeps it reads as a holder somebody took the card
// out of, so it drops to a stock thickness with the same chamfer proportion.
const PLATE_H = 0.09;
const PLATE_CHAMFER = 0.04;

// THE INK FLOATS, AND ONLY JUST. 4 mm off whatever it is printed on: enough to
// clear z-fighting with the plate's top face and the felt at every zoom the
// camera reaches, small enough that its own shadow would be a lie (it casts
// none, and receives none — an inscription is paint, not a sheet of paper).
const INK_LIFT = 0.004;
// The share of the atlas row the ink quad takes, top and bottom cropped off in
// TEXTURE space rather than in world space. The row is 320 px and the fitter's
// ceiling is 160, so the middle 0.78 (250 px) cannot clip a glyph — and the
// crop is what lets a 2:1 row print on a plate whose top is 2.42:1 without
// stretching a single letter. (Stretching is the failure v2 wrote the 1:2
// atlas proportion to kill; it would be silly to re-introduce it here.)
const INK_CROP = 0.78;
// The plate's printed band inside its own top face, per side.
const INK_MARGIN = 0.14;
// Texels of the card region the ink band does NOT reach, so a mip level cannot
// mix the neighbouring brass into a name's edge — see `_writeInk`.
const INK_GUTTER = 16;
// One ink quad a placard: the plate has one readable face and the inlay is one
// readable face. (The tent has two panels and prints on neither of these — it
// prints in the opaque atlas, as it always has.)
const INK_QUADS = 1;
const INK_VERTS = INK_QUADS * 4;

// THE DRESS — per viewer, never on the wire. `inset` is how far INBOARD of the
// rim the inlay's ink lies (0 is exactly on the rim, negative is out past it,
// where the plate stands); `ink.rest` is the ink's opacity when nothing is
// happening, which is the whole of "very subtle" as a number; `ink.mode`
// decides whether that is where it stays.
const DRESS_DEF = Object.freeze({
  style: 'inlay',
  scale: 1,
  inset: 0.60,
  ink: Object.freeze({ mode: 'steady', rest: 0.55, tone: 'ink' }),
  wash: Object.freeze({ state: 'enabled', peak: 0.62 }),
});

// THE STAMP'S OWN NUMBERS, as fractions of the atlas row so they ride every
// resize the row has taken and will take.
const STAMP_INSET = 0.05;      // the border, in from what the band actually SHOWS
const STAMP_RULE = 0.016;      // its line weight
const STAMP_RADIUS = 0.085;    // its corner
const STAMP_PRESS = 0.014;     // how far the impression's two edges are offset
const STAMP_GROUND = 0.10;     // the alpha of the pressed ground inside the border

// FLAT STYLES print on the ink mesh; the tent prints in the opaque atlas.
// Written once, because five call sites were asking it and the fifth would
// have been the one that forgot the stamp.
const isFlat = (style) => style === 'plate' || style === 'inlay' || style === 'stamp';
// …and the two that stand no object at all.
const isBare = (style) => style === 'inlay' || style === 'stamp';

// ---------------------------------------------------------------------------
// The atlas — 8 rows of 256 px, one row per station
// ---------------------------------------------------------------------------

// IT IS NOT SQUARE, AND THAT IS THE CHEAP HALF OF THE RESIZE. The v2 card
// face grew from 2.00 × 0.43 to 3.00 × 1.50 — 3.5× the area — so a row that
// stayed 128 px tall would have printed a name at 57 px per world unit down
// the card. Doubling a 1024² atlas to 2048² would have cost 16 MB of texture
// for a page that is otherwise one felt and eight dice. Only the ROWS need
// the height, so only the height grows: v2 shipped 1024 × 2048 (8 MB) at
// 170.7 px per world unit both ways, and the v3 card (×1.15, 3.45 × 1.725
// printed) would have dropped that to 148 — under the 170 floor the fitter's
// numbers were derived at. So v3 adds one more row-height step, 1024 × 2560
// (10 MB), AND hands the card region 0.625 of the width instead of 0.5:
// 640 px over 3.45 world units across and 320 px over 1.725 down — 185.5 px
// per world unit BOTH WAYS, no anisotropy, and the name arrives with more
// absolute pixels than v2 did. (The retired floor atlas, the reason GOALS
// goal 2 carries an amendment, gave 12.8.) NPOT is fine: the renderer is
// WebGL2, and the texture units never assumed a power of two — only the row
// arithmetic below does, and it divides exactly (2560 / 8 = 320).
const ATLAS_W = 1024;
const ATLAS_H = 2560;
const ROW_PX = ATLAS_H / PLACE_MAX;       // 320
const ORM_PX = 512;
const ORM_ROW = ORM_PX / PLACE_MAX;       // 64 — flat data, and the v maths is
const EMIS_PX = 512;                      //      in row fractions, not pixels

// U regions, as fractions of the atlas width. The card face takes 0.625 of
// the row since v3: 640 px over the card's 3.45 world units, which is what
// keeps the density at 185.5 ≥ the 170 floor. The brass, bead and edge stock
// give up the width the card took — they are gradients and flats, and 192 /
// 48 / 144 px carry them exactly as well as 256 / 64 / 192 did.
//
// U_STOCK is the card's own paper WITHOUT A NAME ON IT (2026-09-04, the
// styles). The plate is printed the way the tent is — bone stock, sepia ink —
// but its two halves come apart: the STOCK is an opaque face of the object and
// the INK is a transparent quad floating over it, because that is what lets
// the ink fade on its own (`ink.mode: ghost`) while the plaque stays put. So
// the stock needs a region of its own, and it is a vertical gradient over 72
// px exactly as the brass and the edge stock are — the width comes out of
// U_EDGE, which was 144 px of flat colour and is worth 72.
const U_CARD = [0, 0.625];
const U_BASE = [0.625, 0.8125];
const U_BEAD = [0.8125, 0.859375];
const U_EDGE = [0.859375, 0.9296875];
const U_STOCK = [0.9296875, 1];

const CARD_PX = ATLAS_W * (U_CARD[1] - U_CARD[0]);    // 640
// The fitter's range rides the ROW, not a constant: the row grew again, so
// the type grows with it and the name keeps the same share of the card. The
// 44 px floor placard-look asserts is still a floor — it is simply nowhere
// near binding any more.
const PAD_PX = Math.round(ROW_PX * 0.16); // 51
const FONT_MAX = Math.round(ROW_PX * 0.50);  // 160
const FONT_MIN = 2 * Math.round(ROW_PX * 0.17);  // 108 — v2's 88, one row-step up.
// EVEN, because the fitter steps down in 2s from an even maximum: an odd floor
// is a floor the loop steps straight past (measured: FONT_MIN 87 landed at 86).

// The grounded kit (venue `table`). GOALS goal 14: grounded believes through
// small object, real material, real light — so the hue is PAINT, never glow
// (emissive 0; the LEGO case). The fantasy kits arrive with the venue dress.
const KIT_TABLE = {
  card: '#e3d8bd',        // matte bone paper — a shade under the key light's
  cardEdge: '#cabd9d',    //   blow-out, measured by looking at the first pass
  ink: '#5a4632',         // warm sepia — the die painter's own hand
  // …and the pale hand, for ink lying on a dark felt (`ink.tone: chalk`). The
  // sepia above is authored against BONE PAPER; on the green felt itself it is
  // a dark mark on a dark ground, which is subtle in the sense of invisible.
  chalk: '#efe6d2',
  base: '#b98f4a',        // cast brass
  baseDark: '#8a6733',
  bead: '#ffffff',        // white: the VERTEX COLOUR carries the player's hue
  // roughness / metalness, per region, straight into the ORM map's g/b.
  orm: { card: [0.90, 0], base: [0.42, 0.85], bead: [0.25, 0], edge: [0.85, 0] },
};

// ---------------------------------------------------------------------------
// The wash — the pick ring's exact recipe, and for the pick ring's reason
// ---------------------------------------------------------------------------

// Sized TO THE CARD (v2; outer × 1.15 with the v3 card, same reason): an arc
// narrower than the object it belongs to reads as a light somebody left on
// rather than as that card's own ground.
const WASH_INNER = 0.45;
const WASH_OUTER = 3.80;
const WASH_SEG = 32;
const WASH_SPAN = Math.PI * 0.9;
const WASH_PEAK = 0.62;
const WASH_Y = 0.012;
// No floor: the arc ends with the film (placeWashSync clears it on done), so
// a minimum could only ever be a promise the clock cannot keep. The shortest
// shipped films (3d6 0.95 s) are all longer than the old 0.6 s floor anyway.
const WASH_MAX_S = 6;

function hexColor(hex) {
  const c = new THREE.Color();
  try { c.set(hex || '#ffffff'); } catch { c.set('#ffffff'); }
  return c;
}

export class PlacardRig {
  constructor(scene) {
    this._scene = scene;
    this.built = false;
    this.rows = [];                 // one per station, null when nobody sits there
    this.occupied = 0;
    this.shown = true;              // the placardShow() override
    // The reader's azimuth in RADIANS, normalised to [0, 2π) — the orbit the
    // frame was last cut to. Every name is printed for it (readTurn); main.js
    // sets it where the orbit cuts.
    this.readerAzim = 0;
    // THE FOOTPRINT THE BUFFER WAS LAST WRITTEN WITH (phase D4). `PLACARD` is
    // live — js/main.js's `cards.*` binder moves it the moment the dial does —
    // so it cannot answer "what is in the vertex buffer", which is the only
    // question a gate on the re-bake can be about. `update` records it here.
    this.pad = null;
    this.wash = { active: false, t: 0, dur: 0, place: null, x: 0, y: 0, z: 0, color: null };
    // THE DRESS THE BUFFER WAS LAST WRITTEN WITH, beside `pad` and for `pad`'s
    // reason: `setDress` records what was ASKED FOR, and only an `update` puts
    // it in the vertex buffer. A gate on the re-bake is about the buffer.
    this.dress = { ...DRESS_DEF, ink: { ...DRESS_DEF.ink } };
    this.worn = null;
    // What the atlas rows were last painted FOR. The ground under a name (bone
    // stock or nothing at all) and its colour are both functions of the dress,
    // so a style or a tone change repaints the eight rows the same way a
    // rename repaints one — in place, no new canvas, no new texture.
    this.paintedKey = null;
  }

  // ---- build ------------------------------------------------------------
  // Idempotent, and paid ONCE per tab: everything below is allocation, and a
  // solo table never reaches it because main.js only builds the rig when a
  // station is actually occupied.
  _ensureBuilt() {
    if (this.built) return;
    this.built = true;

    // -- the three canvases -------------------------------------------------
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_W; this.canvas.height = ATLAS_H;
    this.ctx = this.canvas.getContext('2d');
    const orm = document.createElement('canvas');
    orm.width = orm.height = ORM_PX;
    this.ormCtx = orm.getContext('2d');
    const emis = document.createElement('canvas');
    emis.width = emis.height = EMIS_PX;
    const ex = emis.getContext('2d');
    ex.fillStyle = '#000000';
    ex.fillRect(0, 0, EMIS_PX, EMIS_PX);

    this._paintStatic();
    for (let i = 0; i < PLACE_MAX; i++) this._paintRow(i, null);

    this.albedo = new THREE.CanvasTexture(this.canvas);
    this.albedo.colorSpace = THREE.SRGBColorSpace;
    this.albedo.anisotropy = 4;              // matches js/dice.js:268-269 exactly
    this.orm = new THREE.CanvasTexture(orm);
    this.orm.colorSpace = THREE.NoColorSpace; // an ORM map is DATA, not colour
    this.emissive = new THREE.CanvasTexture(emis);
    this.emissive.colorSpace = THREE.SRGBColorSpace;

    // -- one material -------------------------------------------------------
    // glTF's own ORM convention, which three.js reads natively: roughness in
    // .g, metalness in .b, one texture bound to both slots. The scalar
    // roughness/metalness are 1 because they MULTIPLY the map.
    this.material = new THREE.MeshStandardMaterial({
      map: this.albedo,
      roughnessMap: this.orm,
      metalnessMap: this.orm,
      emissiveMap: this.emissive,
      emissive: 0x000000,                    // grounded means paint, not glow
      roughness: 1,
      metalness: 1,
      envMapIntensity: 0.45,                 // the house value, js/towerglb.js:53-68
      vertexColors: true,
    });

    // -- one geometry -------------------------------------------------------
    this.pos = new Float32Array(PLACE_MAX * VERTS * 3);
    this.nrm = new Float32Array(PLACE_MAX * VERTS * 3);
    this.uv = new Float32Array(PLACE_MAX * VERTS * 2);
    this.col = new Float32Array(PLACE_MAX * VERTS * 3);
    const idx = new Uint16Array(PLACE_MAX * QUADS * 6);
    for (let q = 0; q < PLACE_MAX * QUADS; q++) {
      const b = q * 4;
      idx.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
    }
    this.col.fill(1);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geometry = g;

    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'placards';
    // renderOrder 0, opaque, depth-writing, casting and receiving. Law 8's
    // `surfaceUnder` trap — a die seated on top of a marker — is void BY
    // GEOMETRY here: every placard stands outboard of a physics wall, so no
    // die can ever be above one. That is what buys a real shadow.
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;   // 7/8 of the buffer may be degenerate
    this.mesh.visible = false;
    this._scene.add(this.mesh);

    // -- the ink ------------------------------------------------------------
    // A SECOND MESH, AND ONLY FOR THE FLAT STYLES. It carries one transparent
    // quad per station — the name and nothing else, over the plate's stock or
    // over the bare felt — and it is a separate object for two reasons that
    // are really one: the rig above is OPAQUE, depth-writing and shadow-
    // casting, and paint that fades is none of those. Sorting an alpha quad
    // inside an opaque mesh is not a thing three.js will do, and turning the
    // whole rig transparent to get it would cost the cards their depth write.
    //
    // It shares the ALBEDO ATLAS — same texture, same row, same fitter, same
    // reported font floor — so the ink costs one draw, no texture and no
    // second painter. Under the tent it holds zero area and is not visible at
    // all, which is why the shipped card's budget does not move.
    //
    // LIT, NOT BASIC (the wash is basic and additive; this deliberately is
    // not). An inscription is pigment on cloth: in a dark venue it has to go
    // dark with the room, or it reads as a decal somebody left lit — the exact
    // "it is a sticker" failure the wash's own ramp comment records. It writes
    // no depth (so it never occludes a die that rolls over it), receives no
    // shadow (paint has no thickness to catch one) and casts none.
    this.ink = new Float32Array(PLACE_MAX * INK_VERTS * 3);
    this.inkUv = new Float32Array(PLACE_MAX * INK_VERTS * 2);
    this.inkCol = new Float32Array(PLACE_MAX * INK_VERTS * 4);
    this.inkNrm = new Float32Array(PLACE_MAX * INK_VERTS * 3);
    const iidx = new Uint16Array(PLACE_MAX * INK_QUADS * 6);
    for (let q = 0; q < PLACE_MAX * INK_QUADS; q++) {
      const b = q * 4;
      iidx.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
    }
    const ig = new THREE.BufferGeometry();
    ig.setAttribute('position', new THREE.BufferAttribute(this.ink, 3));
    ig.setAttribute('normal', new THREE.BufferAttribute(this.inkNrm, 3));
    ig.setAttribute('uv', new THREE.BufferAttribute(this.inkUv, 2));
    ig.setAttribute('color', new THREE.BufferAttribute(this.inkCol, 4));
    ig.setIndex(new THREE.BufferAttribute(iidx, 1));
    this.inkGeom = ig;
    this.inkMat = new THREE.MeshStandardMaterial({
      map: this.albedo,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      vertexColors: true,       // vec4: rgb 1, and the ALPHA is the fade
      side: THREE.DoubleSide,
    });
    this.inkMesh = new THREE.Mesh(ig, this.inkMat);
    this.inkMesh.name = 'placardInk';
    this.inkMesh.renderOrder = 9;      // over the venue's fog sheets, under the wash at 10
    this.inkMesh.frustumCulled = false;
    this.inkMesh.castShadow = false;
    this.inkMesh.receiveShadow = false;
    this.inkMesh.visible = false;
    this._scene.add(this.inkMesh);

    // -- the wash -----------------------------------------------------------
    // The pick ring's recipe verbatim, for the pick ring's recorded reason: a
    // fae venue hangs three fog sheets at renderOrder 5/6/7 and a mark lying
    // on the ground is behind all of them. depthWrite false so it never
    // occludes anything; depthTest true so the placard itself still does.
    const wg = new THREE.RingGeometry(WASH_INNER, WASH_OUTER, WASH_SEG, 6,
      -WASH_SPAN / 2, WASH_SPAN);
    wg.rotateX(-Math.PI / 2);          // lie flat; +X is the sector's axis
    // IT HAS TO FALL OFF, or it is a sticker. The first build was a flat
    // sector at one opacity and read as a painted disc somebody had left on
    // the felt — the exact "it is a ramp" failure VENUE-COMPOSITION rule 12
    // names. The ramp rides a four-component vertex colour (three.js reads
    // .a natively when the attribute is a vec4), so it costs no texture, no
    // shader and no fourth entry in the budget: bright where it meets the
    // card, gone at the rim, gone at both ends of the arc.
    const wp = wg.attributes.position;
    const wc = new Float32Array(wp.count * 4);
    for (let i = 0; i < wp.count; i++) {
      const r = Math.hypot(wp.getX(i), wp.getZ(i));
      const t = Math.min(1, Math.max(0, (r - WASH_INNER) / (WASH_OUTER - WASH_INNER)));
      const ang = Math.abs(Math.atan2(-wp.getZ(i), wp.getX(i))) / (WASH_SPAN / 2);
      wc[i * 4] = 1; wc[i * 4 + 1] = 1; wc[i * 4 + 2] = 1;
      wc[i * 4 + 3] = (1 - t * t) * Math.max(0, 1 - ang * ang * ang);
    }
    wg.setAttribute('color', new THREE.BufferAttribute(wc, 4));
    this.washMat = new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0, vertexColors: true,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: THREE.AdditiveBlending,
    });
    this.washMesh = new THREE.Mesh(wg, this.washMat);
    this.washMesh.name = 'placardWash';
    this.washMesh.renderOrder = 10;
    this.washMesh.frustumCulled = false;
    this.washMesh.visible = false;
    this._scene.add(this.washMesh);

    this._rc = new THREE.Raycaster();
    this._rc.far = 40;
    this._down = new THREE.Vector3(0, -1, 0);
    this._org = new THREE.Vector3();
  }

  // ---- painting ---------------------------------------------------------

  // Everything that is the same on every row: the holder, the bead's lacquer
  // sheen, the card's edge stock. Painted once.
  _paintStatic() {
    const x = this.ctx;
    const k = KIT_TABLE;
    for (let r = 0; r < PLACE_MAX; r++) {
      const y = r * ROW_PX;
      // brass, with a vertical fall so the bevel does not read as a sticker
      const bg = x.createLinearGradient(0, y, 0, y + ROW_PX);
      bg.addColorStop(0, k.base);
      bg.addColorStop(1, k.baseDark);
      x.fillStyle = bg;
      x.fillRect(U_BASE[0] * ATLAS_W, y, (U_BASE[1] - U_BASE[0]) * ATLAS_W, ROW_PX);
      // the bead is painted WHITE on purpose — the vertex colour is the hue,
      // so one material dresses eight players
      const lg = x.createLinearGradient(0, y, 0, y + ROW_PX);
      lg.addColorStop(0, '#ffffff');
      lg.addColorStop(0.55, '#e8e8e8');
      lg.addColorStop(1, '#ffffff');
      x.fillStyle = lg;
      x.fillRect(U_BEAD[0] * ATLAS_W, y, (U_BEAD[1] - U_BEAD[0]) * ATLAS_W, ROW_PX);
      x.fillStyle = k.cardEdge;
      x.fillRect(U_EDGE[0] * ATLAS_W, y, (U_EDGE[1] - U_EDGE[0]) * ATLAS_W, ROW_PX);
      // the plate's bone stock — the card region's own gradient, with no name
      // on it, because the plate's name is a separate quad floating over this
      const sg = x.createLinearGradient(0, y, 0, y + ROW_PX);
      sg.addColorStop(0, '#efe6cf');
      sg.addColorStop(1, k.card);
      x.fillStyle = sg;
      x.fillRect(U_STOCK[0] * ATLAS_W, y, (U_STOCK[1] - U_STOCK[0]) * ATLAS_W, ROW_PX);
    }
    const ox = this.ormCtx;
    const put = (region, rough, metal) => {
      ox.fillStyle = `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
      for (let r = 0; r < PLACE_MAX; r++) {
        ox.fillRect(region[0] * ORM_PX, r * ORM_ROW,
          (region[1] - region[0]) * ORM_PX, ORM_ROW);
      }
    };
    put(U_CARD, k.orm.card[0], k.orm.card[1]);
    put(U_BASE, k.orm.base[0], k.orm.base[1]);
    put(U_BEAD, k.orm.bead[0], k.orm.bead[1]);
    put(U_EDGE, k.orm.edge[0], k.orm.edge[1]);
    put(U_STOCK, k.orm.card[0], k.orm.card[1]);   // the plate's face IS card stock
  }

  // ONE ROW, IN PLACE — the recompositeFelt no-churn law. A rename clears 128
  // scanlines of the card region and redraws them; no new canvas, no new
  // texture, no GPU allocation. Returns what was actually painted, so the
  // 44 px floor is a reported number rather than a hoped-for one.
  //
  // THE GROUND UNDER THE NAME IS THE DRESS'S (2026-09-04). Under the tent the
  // row is what it always was — bone stock with sepia on it, one opaque region
  // of an opaque mesh. Under the two flat styles the SAME 640 px region is
  // painted as ink on NOTHING: the glyphs and their antialiasing, transparent
  // everywhere else, so the ink mesh can lay them over the plate's own stock
  // or straight onto the felt. One region, one fitter, one reported font
  // floor, in one of two grounds — which is what keeps the flat styles honest
  // against the tent rather than a second painter with a second set of bugs.
  _paintRow(slot, name) {
    const x = this.ctx;
    const k = KIT_TABLE;
    const y = slot * ROW_PX;
    const w = (U_CARD[1] - U_CARD[0]) * ATLAS_W;
    const clear = this.dress.style !== 'tent';
    // Chalk is the INLAY's answer and only its: a pale hand is authored
    // against the FELT, and on the plate's bone stock (and on the tent's) it
    // would print white on cream. Where there is stock under the ink, the ink
    // is the kit's sepia.
    const inkColor = (isBare(this.dress.style) && this.dress.ink.tone === 'chalk')
      ? k.chalk : k.ink;
    x.clearRect(U_CARD[0] * ATLAS_W, y, w, ROW_PX);
    if (!clear) {
      const g = x.createLinearGradient(0, y, 0, y + ROW_PX);
      g.addColorStop(0, '#efe6cf');
      g.addColorStop(1, k.card);
      x.fillStyle = g;
      x.fillRect(U_CARD[0] * ATLAS_W, y, w, ROW_PX);
    }
    if (!name) {
      if (this.albedo) this.albedo.needsUpdate = true;
      return { shown: null, fontPx: 0, ink: { w: 0, h: 0 } };
    }

    // THE FITTER. Measure down from FONT_MAX to the FONT_MIN floor; only then
    // truncate, and truncate VISIBLY. MAX_NAME is 24 (server.js), and 87 px of
    // bold Georgia fits about ten characters in the 430 px of room a 512 px
    // card region leaves — so a v2 card truncates sooner than a v1 one did, on
    // purpose: a name you can read at half the length beats a name you cannot
    // read at all, which is the whole complaint this resize answers.
    let f = FONT_MAX;
    x.font = `700 ${f}px Georgia, serif`;
    const room = CARD_PX - 2 * PAD_PX;
    while (f > FONT_MIN && x.measureText(name).width > room) {
      f -= 2;
      x.font = `700 ${f}px Georgia, serif`;
    }
    // THE ELLIPSIS IS ONLY RESERVED WHEN IT IS ACTUALLY NEEDED. This loop used
    // to measure `name + '…'` unconditionally, so every name paid for a cut it
    // was not making — invisible at the v1 type sizes (a 68 px 'Front' plus its
    // ellipsis came to 255 px of a 460 px room) and immediately visible at v2's
    // 128 px, where the same name measured 324 and its unneeded ellipsis pushed
    // it to 452 in a 430 px room. The first v2 look pass painted the front
    // chair's own card 'Fron…'.
    let shown = name;
    if (x.measureText(name).width > room) {
      while (shown.length > 1 && x.measureText(`${shown}…`).width > room) shown = shown.slice(0, -1);
    }
    // The cut is by UTF-16 unit and can land between the halves of a
    // surrogate pair; a lone high surrogate renders as U+FFFD on the card —
    // server.js cutText's guard, verbatim, because the server takes care never
    // to hand out a name ending in half a pair and this painter must not
    // re-create one downstream (measured: 90 of 805 emoji-tailed names did).
    const last = shown.charCodeAt(shown.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) shown = shown.slice(0, -1); // unpaired high surrogate
    if (shown !== name) shown += '…';

    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const cx = U_CARD[0] * ATLAS_W + w / 2;
    const cy = y + ROW_PX / 2 + ROW_PX * 0.016;
    if (this.dress.style === 'stamp') {
      this._paintStamp(slot, shown, f, inkColor);
    } else if (!clear) {
      x.fillStyle = inkColor;
      x.fillText(shown, cx, cy);
    } else {
      // GLYPHS ON NOTHING, WITHOUT A FRINGE. Text drawn straight onto cleared
      // canvas leaves its antialiased edge pixels part-covered over
      // TRANSPARENT BLACK, and the sampler mixes that black in: a dark halo
      // round every letter, invisible in sepia and obvious in chalk. So the
      // glyphs are laid down as an alpha MASK and the colour is composited
      // through them with `source-in`, which sets the rgb of every covered
      // pixel and leaves its coverage alone. The clip is what makes that safe:
      // `source-in` clears the destination wherever the source is absent, and
      // the clip is the one row's card region, so the other seven rows (and
      // every other region of this row) are outside the operation entirely.
      x.save();
      x.beginPath();
      x.rect(U_CARD[0] * ATLAS_W, y, w, ROW_PX);
      x.clip();
      x.fillStyle = '#000000';
      x.fillText(shown, cx, cy);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = inkColor;
      x.fillRect(U_CARD[0] * ATLAS_W, y, w, ROW_PX);
      x.restore();
    }
    if (this.albedo) this.albedo.needsUpdate = true;
    // WHAT SHARE OF THE CARD THE NAME ACTUALLY COVERS, centred, as fractions
    // of the card region. The card's own band is one thing and the INK on it is
    // another, and the gate that matters — does the name print through the
    // result banner — is about the ink. Reported rather than guessed at,
    // because it depends on the string and the font the fitter settled on.
    return {
      shown,
      fontPx: f,
      ink: { w: Math.min(1, x.measureText(shown).width / CARD_PX), h: Math.min(1, f / ROW_PX) },
    };
  }

  // THE STAMP — a name pressed into the felt, with a rule round it.
  //
  // Four passes, and the ORDER is the impression: the pressed GROUND first (a
  // faint dark wash inside the border, which is the shadow a recess collects),
  // then the mark offset toward the light as a HIGHLIGHT, then offset away as
  // a SHADOW, then the mark itself on top in the ink. Look at any letterpress
  // deboss and that is what is there — the eye reads "below the surface" from
  // the pair of edges, not from the geometry, which is exactly why this does
  // not need geometry (see the Nap, UX §5.4b, in the header).
  //
  // EVERY PASS GOES THROUGH THE SCRATCH ROW rather than straight onto the
  // atlas, for the reason the plain inlay composites with `source-in`: text
  // drawn on transparent leaves part-covered pixels over transparent BLACK and
  // the sampler mixes that in. Here it would be worse than a halo — the
  // highlight pass is the palest thing on the card and a black fringe is
  // exactly what would kill the illusion of a lit edge. So each pass is drawn
  // as a mask, coloured through, and stamped down with `drawImage` at its
  // offset, which carries correct coverage with it.
  _paintStamp(slot, shown, fontPx, inkColor) {
    const x = this.ctx;
    const y = slot * ROW_PX;
    const w = (U_CARD[1] - U_CARD[0]) * ATLAS_W;
    const x0 = U_CARD[0] * ATLAS_W;
    if (!this._scratch) {
      this._scratch = document.createElement('canvas');
      this._scratch.width = Math.round(w);
      this._scratch.height = ROW_PX;
      this._scratchCtx = this._scratch.getContext('2d');
    }
    const sx = this._scratchCtx;
    const press = Math.max(1, Math.round(ROW_PX * STAMP_PRESS));
    const rule = Math.max(1, ROW_PX * STAMP_RULE);
    const rad = ROW_PX * STAMP_RADIUS;
    // THE FRAME IS INSET FROM WHAT THE BAND SHOWS, not from the atlas row, and
    // the first stamp got that wrong in a way only a picture could tell you:
    // the quad shows the row's middle INK_CROP and the gutter's worth of its
    // width, so a rule inset from the ROW by less than that is simply cropped
    // off — the first frames had a stamp with two side rules and no top or
    // bottom, a shape nobody would have designed on purpose. So the margins
    // start at the crop and the gutter, and the rule's own inset is measured
    // in from there.
    const cropPad = ROW_PX * (1 - INK_CROP) / 2;
    const m = ROW_PX * STAMP_INSET;
    const frame = {
      x: INK_GUTTER + m, y: cropPad + m,
      w: w - 2 * (INK_GUTTER + m), h: ROW_PX - 2 * (cropPad + m),
    };
    const mark = (ctx) => {
      ctx.lineWidth = rule;
      ctx.beginPath();
      // roundRect is in every browser this app runs in; the fallback is a
      // plain rect, which is a squarer stamp and not a broken one.
      if (ctx.roundRect) ctx.roundRect(frame.x, frame.y, frame.w, frame.h, rad);
      else ctx.rect(frame.x, frame.y, frame.w, frame.h);
      ctx.stroke();
      ctx.font = `700 ${fontPx}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shown, w / 2, ROW_PX / 2 + ROW_PX * 0.016);
    };
    const layer = (color) => {
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.globalCompositeOperation = 'source-over';
      sx.clearRect(0, 0, w, ROW_PX);
      sx.strokeStyle = '#000000';
      sx.fillStyle = '#000000';
      mark(sx);
      sx.globalCompositeOperation = 'source-in';
      sx.fillStyle = color;
      sx.fillRect(0, 0, w, ROW_PX);
      return this._scratch;
    };
    // THE PRESSED GROUND: the border's own shape, filled, at a low alpha. It
    // is what makes the rule read as the EDGE of something rather than as a
    // line lying on top of the felt.
    x.save();
    x.beginPath();
    x.rect(x0, y, w, ROW_PX);
    x.clip();
    x.globalAlpha = STAMP_GROUND;
    x.fillStyle = '#000000';
    x.beginPath();
    if (x.roundRect) x.roundRect(x0 + frame.x, y + frame.y, frame.w, frame.h, rad);
    else x.rect(x0 + frame.x, y + frame.y, frame.w, frame.h);
    x.fill();
    x.globalAlpha = 1;
    // …then the two edges of the impression and the mark itself. The light on
    // this table comes from above and a touch toward the front (dice.yaml
    // light.lamp.z), so a recess is lit on the side AWAY from the lamp and
    // shadowed on the side toward it — the highlight goes down-frame.
    x.drawImage(layer(this._stampTint(inkColor, 0.55)), x0, y + press);
    x.drawImage(layer(this._stampTint(inkColor, -0.45)), x0, y - press);
    x.drawImage(layer(inkColor), x0, y);
    x.restore();
  }

  // A lighter (t > 0) or darker (t < 0) relative of the ink, for the
  // impression's two edges. Kept off THREE.Color deliberately: this is canvas
  // paint in sRGB and the numbers should be the ones the eye gets.
  _stampTint(hex, t) {
    const c = new THREE.Color(hex);
    const to = t > 0 ? 1 : 0;
    const m = Math.abs(t);
    const ch = (v) => Math.round(255 * (v + (to - v) * m));
    return `rgb(${ch(c.r)},${ch(c.g)},${ch(c.b)})`;
  }

  // ---- geometry ---------------------------------------------------------

  // Collapse a station to a point: zero area, zero pixels, zero extra draw —
  // and, crucially, the same number of vertices as an occupied one.
  _writeEmpty(slot) {
    const o = slot * VERTS * 3;
    this.pos.fill(0, o, o + VERTS * 3);
    this.nrm.fill(0, o, o + VERTS * 3);
    for (let i = 0; i < VERTS; i++) this.nrm[o + i * 3 + 1] = 1;
    this.col.fill(1, o, o + VERTS * 3);
  }

  _writePlacard(slot, rec) {
    const { x: ox, z: oz, azim } = rec.anchor;
    const oy = rec.seatY;
    const ca = Math.cos(azim);
    const sa = Math.sin(azim);
    // R_y(azim) then translate. Written once, in one order (the anchor rule).
    const P = (lx, ly, lz) => [ox + lx * ca + lz * sa, oy + ly, oz + (-lx * sa + lz * ca)];
    const N = (lx, ly, lz) => [lx * ca + lz * sa, ly, -lx * sa + lz * ca];

    // THE CARD STANDS AT ITS CHAIR; THE PRINTING FACES THE READER.
    //
    // A place card is a shallow tent — 34° off the horizontal, which is what
    // buys the 0.89–0.98 read from every station at once — so from the shipped
    // eye you look DOWN on BOTH of its panels, not at one of them. That makes
    // the panel's own local "up the slope" the wrong up for half of them: at
    // the back edge the ridge is the near side, so a row painted ridge-upward
    // arrives at the reader upside down. Measured by looking: the first build
    // of this rig put four of eight names on their heads.
    //
    // The object itself must NOT be turned to fix that, and on the ring the
    // refusal is stronger, not weaker: every placard's whole licence is that
    // it stands OUTBOARD of a physics wall (js/places.js seatAnchor), and a
    // card yawed away from its own ray leans back inside that wall, where a
    // die can reach it — the shipped head card measured 0.38 units inside at
    // medium. Every ring card faces the table centre BY CONSTRUCTION. So the
    // CARD keeps its seat's azimuth and only the PRINTING turns — a quarter
    // turn of the atlas row, per panel, in texture space, costing nothing and
    // moving nothing.
    //
    // WHICH way is decided by a predicate on the CONTINUOUS relative angle,
    // never by a bucket: `readTurn(azim, readerAzim)` (js/places.js §1.9) asks
    // whether the +z panel's text-up still projects to screen-up for a reader
    // at `readerAzim`, i.e. cos(azim − readerAzim) > 0, with the edge-on case
    // (cos ≈ 0) printing tops-OUTBOARD on both elbows — upright on its own
    // tent, read with the head tilted toward it (2026-09-04, Joe: the old
    // same-tilt tiebreak stood the right elbow's name on its head).
    // The reader is wherever the frame was last cut to (`readerAzim`, set by
    // main.js's applyFramingPose — the per-viewer orbit of §7.63, or the
    // ladder's quarter turn on top of it). The card at the reader's own chair
    // and the one opposite land on their up-vector exactly; a card at their
    // elbow is read side-on whichever way it is printed, which is how a card
    // at your elbow reads at a real table too. Residual tilt on the visible
    // panel is wrap(θ_card − φ) into [−90°, 90°] — at N=3 it is 0/∓60°, at
    // N=6 0/±60°/∓60°/0, at N=8 0/±45°/±90°/∓45°/0 — and there is no de-tilt
    // dial.
    const turn = readTurn(azim, this.readerAzim);

    let o = slot * VERTS * 3;
    let uo = slot * VERTS * 2;
    const v0 = 1 - (slot + 1) / PLACE_MAX;
    const v1 = 1 - slot / PLACE_MAX;
    const uvRect = (region, flip) => {
      const fu = flip ? flip[0] : false;
      const fv = flip ? flip[1] : false;
      const a = fu ? region[1] : region[0];
      const b = fu ? region[0] : region[1];
      const t = fv ? v0 : v1;
      const s = fv ? v1 : v0;
      // corners in the builder's order: TL, BL, BR, TR
      this.uv[uo++] = a; this.uv[uo++] = t;
      this.uv[uo++] = a; this.uv[uo++] = s;
      this.uv[uo++] = b; this.uv[uo++] = s;
      this.uv[uo++] = b; this.uv[uo++] = t;
    };

    const quad = (a, b, c, d, tint) => {
      // normal from the CCW winding, so a flipped face is a black face and
      // therefore visible in the look pass rather than silently wrong
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      for (const p of [a, b, c, d]) {
        this.pos[o] = p[0]; this.pos[o + 1] = p[1]; this.pos[o + 2] = p[2];
        this.nrm[o] = nx; this.nrm[o + 1] = ny; this.nrm[o + 2] = nz;
        this.col[o] = tint ? tint.r : 1;
        this.col[o + 1] = tint ? tint.g : 1;
        this.col[o + 2] = tint ? tint.b : 1;
        o += 3;
      }
    };

    // THE STYLE DECIDES WHAT IS DRAWN HERE, AND NOTHING ELSE (2026-09-04).
    // Everything above this line — the anchor, the reader's turn, the slot's
    // own share of the buffer — is the same arithmetic for all three dresses,
    // which is the mechanical half of "a style never moves the anchor".
    // `inlay` writes no object at all: its name is the ink mesh's business,
    // and the padding at the foot of this function collapses all 24 quads.
    if (this.dress.style === 'plate') this._writePlate(P, N, quad, uvRect, rec);
    else if (this.dress.style === 'tent') this._writeTent(P, N, quad, uvRect, rec, turn);
    // WHAT IS LEFT OF THE SLOT IS COLLAPSED, not left as it was. The buffer is
    // fixed-length by design (a join never reallocates), so a dress that draws
    // 8 quads where the last one drew 24 must write the other 16 away or the
    // tent's panels stay on screen under the plate. Degenerate at the origin,
    // exactly as `_writeEmpty` leaves an empty station: zero area, zero pixels.
    const endO = (slot + 1) * VERTS * 3;
    if (o < endO) {
      this.pos.fill(0, o, endO);
      this.nrm.fill(0, o, endO);
      this.col.fill(1, o, endO);
      for (let i = o; i < endO; i += 3) this.nrm[i + 1] = 1;
      this.uv.fill(0, uo, (slot + 1) * VERTS * 2);
    }
    this._writeInk(slot, rec, turn);
  }

  // -- the tent: the shipped card, untouched --------------------------------
  _writeTent(P, N, quad, uvRect, rec, turn) {
    const hue = rec.hue;
    const k = this.scale();
    const CARD_W = cardW(k), CARD_SLOPE = cardSlope(k);
    // TENT_RISE is shadowed too, and it has to be: the panel NORMALS below are
    // ratios (TENT_RISE / CARD_SLOPE), so mixing a scaled slope with the
    // module's unscaled rise would tilt every card's lighting by 1/k while its
    // geometry looked right.
    const TENT_RUN = tentRun(k), TENT_RISE = tentRise(k);
    const RIDGE_Y = ridgeY(k), FACE_Y0 = faceY0(k);
    // -- the holder: a truncated pyramid, so the chamfer IS the bevel -------
    const bw = baseW() / 2, bd = baseD() / 2;
    const tw = bw - CHAMFER, td = bd - CHAMFER;
    const B = [P(-bw, 0, bd), P(bw, 0, bd), P(bw, 0, -bd), P(-bw, 0, -bd)];
    const T = [P(-tw, BASE_H, td), P(tw, BASE_H, td), P(tw, BASE_H, -td), P(-tw, BASE_H, -td)];
    quad(T[0], T[1], T[2], T[3]); uvRect(U_BASE);
    for (let i = 0; i < 4; i++) { quad(B[i], B[(i + 1) % 4], T[(i + 1) % 4], T[i]); uvRect(U_BASE); }
    quad(B[3], B[2], B[1], B[0]); uvRect(U_EDGE);

    // -- the two card panels, as thin slabs --------------------------------
    // Each is one slab whose OUTER face is split in two along the slope: the
    // printed band from the ridge down to FACE_Y0, and the unprinted foot
    // below it. Everything the standoff gate is about is the printed band.
    const cw = CARD_W / 2;
    const faces = [];
    const slab = (TL, BL, BR, TR, ML, MR, n, flip) => {
      const h = CARD_T / 2;
      const off = (p, s) => [p[0] + n[0] * h * s, p[1] + n[1] * h * s, p[2] + n[2] * h * s];
      const loop = [TL, BL, BR, TR];
      const out = loop.map((p) => off(p, 1));
      const inn = loop.map((p) => off(p, -1));
      const mlO = off(ML, 1), mrO = off(MR, 1);
      quad(out[0], mlO, mrO, out[3]); uvRect(U_CARD, flip);      // the printed face
      faces.push(out[0], mlO, mrO, out[3]);
      quad(mlO, out[1], out[2], mrO); uvRect(U_EDGE);            // the unprinted foot
      quad(inn[3], inn[2], inn[1], inn[0]); uvRect(U_EDGE);      // the hidden back
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        quad(out[i], inn[i], inn[j], out[j]); uvRect(U_EDGE);
      }
    };
    const zf = FACE_S * TENT_RUN;
    // +z panel: its corners walk TL, BL, BR, TR as seen from its own outside
    slab(P(-cw, RIDGE_Y, 0), P(-cw, BASE_H, TENT_RUN),
      P(cw, BASE_H, TENT_RUN), P(cw, RIDGE_Y, 0),
      P(-cw, FACE_Y0, zf), P(cw, FACE_Y0, zf),
      N(0, TENT_RUN / CARD_SLOPE, TENT_RISE / CARD_SLOPE), turn[0]);
    // −z panel: the other half of the fold, so its corners walk the other way
    slab(P(cw, RIDGE_Y, 0), P(cw, BASE_H, -TENT_RUN),
      P(-cw, BASE_H, -TENT_RUN), P(-cw, RIDGE_Y, 0),
      P(cw, FACE_Y0, -zf), P(-cw, FACE_Y0, -zf),
      N(0, TENT_RUN / CARD_SLOPE, -TENT_RISE / CARD_SLOPE), turn[1]);

    // -- the end caps, closing the tent (quads with a repeated corner) ------
    quad(P(cw, RIDGE_Y, 0), P(cw, BASE_H, TENT_RUN), P(cw, BASE_H, -TENT_RUN),
      P(cw, BASE_H, -TENT_RUN)); uvRect(U_EDGE);
    quad(P(-cw, RIDGE_Y, 0), P(-cw, BASE_H, -TENT_RUN), P(-cw, BASE_H, TENT_RUN),
      P(-cw, BASE_H, TENT_RUN)); uvRect(U_EDGE);

    // -- the lacquer bead, in the player's hue ------------------------------
    // YOUR OWN card carries exactly one mark and this is it: the bead runs the
    // full width of your base, everybody else's is a centred pip. No glow, no
    // outline, no size change — the difference has to survive being looked at
    // sideways from across a table.
    // IT RIDES THE CHAMFER, not the pad's top face, and that is a looking
    // note rather than a taste: the card's own foot stands on the top face and
    // the eye meets it at a grazing 12°, so a bead painted there was invisible
    // in every frame of the first look pass. On the bevel it is the lit gold
    // rim the eye already goes to.
    const hw = (rec.mine ? beadWMine() : BEAD_W_OTHER) / 2;
    const bn = Math.hypot(CHAMFER, BASE_H);
    const lift = 0.004;
    const dy = (CHAMFER / bn) * lift, dz = (BASE_H / bn) * lift;
    quad(P(-hw, BASE_H + dy, td + dz), P(-hw, dy, bd + dz),
      P(hw, dy, bd + dz), P(hw, BASE_H + dy, td + dz), hue);
    uvRect(U_BEAD);
    quad(P(hw, BASE_H + dy, -td - dz), P(hw, dy, -bd - dz),
      P(-hw, dy, -bd - dz), P(-hw, BASE_H + dy, -td - dz), hue);
    uvRect(U_BEAD);

    // The PRINTED bands' own corners in world space, for placardFrame(): the
    // readable face and nothing else — not the holder, not the card's foot —
    // because "is this name in the frame" is the only question the standoff
    // gate asks.
    rec.corners = faces;
  }

  // -- the plate: the holder alone, lying flat -------------------------------
  //
  // THE OBJECT IS THE TENT'S OWN PAD, and that is the argument for it rather
  // than a coincidence of code. The pad was never decoration: VENUE-COMPOSITION
  // rule 11 is "grown, not placed — the tell is the SEAM", and the seam here is
  // the chamfer and the contact shadow it throws. Take the card away and what
  // is left is exactly a plaque: a bevelled brass slab with the same seam, the
  // same shadow, the same footprint, printed face up on the card's own stock.
  // Eight quads instead of twenty-four, 0.09 tall instead of 2.09.
  //
  // WHAT IT COSTS IS THE FAR READ, and that number is the whole reason the
  // tent exists — a flat face is seen at cos(90 − elevation), which was 0.98
  // near and 0.72 far on the rectangle the tent was measured against. The
  // round table changed both the elevations and the distances, so the honest
  // move is to draw it and measure it there rather than to argue from the old
  // frame: that is what `placard-styles` does.
  _writePlate(P, N, quad, uvRect, rec) {
    const hue = rec.hue;
    const bw = baseW() / 2, bd = baseD() / 2;
    const tw = bw - PLATE_CHAMFER, td = bd - PLATE_CHAMFER;
    const B = [P(-bw, 0, bd), P(bw, 0, bd), P(bw, 0, -bd), P(-bw, 0, -bd)];
    const T = [P(-tw, PLATE_H, td), P(tw, PLATE_H, td), P(tw, PLATE_H, -td), P(-tw, PLATE_H, -td)];
    // the printed face is CARD STOCK, not brass: the plaque is a card the
    // table laid down, which is what keeps it in the same material family as
    // the tent it is being judged against
    quad(T[0], T[1], T[2], T[3]); uvRect(U_STOCK);
    for (let i = 0; i < 4; i++) { quad(B[i], B[(i + 1) % 4], T[(i + 1) % 4], T[i]); uvRect(U_BASE); }
    quad(B[3], B[2], B[1], B[0]); uvRect(U_EDGE);
    // the lacquer bead, on the chamfer, for the tent's recorded reason: yours
    // runs the full width, everybody else's is a centred pip
    const hw = (rec.mine ? beadWMine() : BEAD_W_OTHER) / 2;
    const bn = Math.hypot(PLATE_CHAMFER, PLATE_H);
    const lift = 0.004;
    const dy = (PLATE_CHAMFER / bn) * lift, dz = (PLATE_H / bn) * lift;
    quad(P(-hw, PLATE_H + dy, td + dz), P(-hw, dy, bd + dz),
      P(hw, dy, bd + dz), P(hw, PLATE_H + dy, td + dz), hue);
    uvRect(U_BEAD);
    quad(P(hw, PLATE_H + dy, -td - dz), P(hw, dy, -bd - dz),
      P(-hw, dy, -bd - dz), P(-hw, PLATE_H + dy, -td - dz), hue);
    uvRect(U_BEAD);
    // The readable face, for placardFrame() — the top, until `_writeInk`
    // replaces it with the tighter band the name actually occupies.
    rec.corners = T.slice();
  }

  // -- the ink: the name, on its own transparent quad ------------------------
  //
  // One quad per station, in the ink mesh, for the two flat styles; a
  // degenerate one under the tent, whose name is painted into the opaque atlas
  // as it always was. Where it lies is the style's business:
  //
  //   plate  on the plaque's top face, inside a margin, at the atlas row's own
  //          proportions — cropped in TEXTURE space to fit a 2.42:1 top with a
  //          2.56:1 band, because the alternative is stretching letters.
  //   inlay  on the ground itself, `inset` units INSIDE the rim on the chair's
  //          own ray. The seat's own y is measured where the INK lies, not at
  //          the anchor: the anchor is outboard of the rim and a venue may lay
  //          its ground at a different height there (the `surfaceUnder` trap
  //          that put the tower's contact shadow under the floor for five
  //          rounds), and the two points are 1.5 units apart.
  //
  // WHICH WAY UP IS THE TENT'S OWN PREDICATE, unchanged and deliberately so
  // (Joe, 2026-09-04, choosing it over a continuously-turned label): the quad
  // is built with its text-up pointing INBOARD, which is the +z panel's own
  // unflipped up, so `readTurn(azim, reader)[0]` is the answer here for the
  // same reason it is the answer there. A flat name COULD turn continuously —
  // it has no wall to lean into, which is the constraint that quantises the
  // tent — and that option is written down in UX §7.65 rather than taken.
  _writeInk(slot, rec, turn) {
    let o = slot * INK_VERTS * 3;
    let uo = slot * INK_VERTS * 2;
    let co = slot * INK_VERTS * 4;
    const style = this.dress.style;
    const blank = style === 'tent' || !rec || !rec.name;
    if (blank) {
      this.ink.fill(0, o, o + INK_VERTS * 3);
      this.inkNrm.fill(0, o, o + INK_VERTS * 3);
      for (let i = 0; i < INK_VERTS; i++) this.inkNrm[o + i * 3 + 1] = 1;
      this.inkUv.fill(0, uo, uo + INK_VERTS * 2);
      this.inkCol.fill(0, co, co + INK_VERTS * 4);
      return;
    }

    // the band's world size, at the cropped row's aspect and never stretched
    const aspect = CARD_PX / (ROW_PX * INK_CROP);      // 2.564
    let iw, id, iy, iz;
    const k = this.scale();
    if (style === 'plate') {
      // THE PLATE'S BAND IS BOUNDED BY ITS OWN STOCK, and the scale rides
      // inside that bound rather than through it: a name printed off the edge
      // of the plaque it is on is not a size, it is a mistake. Turn the dial
      // down and the band shrinks; turn it up and it stops at the face, and
      // the way to a bigger plate name is `cards.width` / `cards.depth`, which
      // grow the plaque the band is fitted to.
      iw = (baseW() - 2 * INK_MARGIN) * Math.min(1, k);
      id = iw / aspect;
      const availD = (baseD() - 2 * INK_MARGIN) * Math.min(1, k);
      if (id > availD) { id = availD; iw = id * aspect; }
      iy = rec.seatY + PLATE_H + INK_LIFT;
      iz = 0;
    } else {
      // THE INLAY IS SIZED LIKE THE CARD IT REPLACES, not like the plate: it
      // has no stock to stay inside, so it takes the printed band's own width
      // and the name arrives at the density the fitter was tuned for.
      iw = CARD_W * k;
      id = iw / aspect;
      iz = -(PLACARD.standoff + this.dress.inset);
      const wx = rec.anchor.x + iz * Math.sin(rec.anchor.azim);
      const wz = rec.anchor.z + iz * Math.cos(rec.anchor.azim);
      iy = this._seatY(wx, wz) + INK_LIFT;
    }
    rec.inkSize = {
      w: iw, d: id, y: iy, inset: isBare(style) ? this.dress.inset : 0,
      pxPerUnit: CARD_PX / iw, pxPerUnitDown: (ROW_PX * INK_CROP) / id,
    };

    const { x: ox, z: oz, azim } = rec.anchor;
    const ca = Math.cos(azim), sa = Math.sin(azim);
    const P = (lx, lz) => [ox + lx * ca + lz * sa, iy, oz + (-lx * sa + lz * ca)];
    const hw = iw / 2, hd = id / 2;
    // TL, BL, BR, TR with text-up toward −z (inboard), matching the tent's
    // +z panel, so `turn[0]` is the flip this quad takes.
    const C = [P(-hw, iz - hd), P(-hw, iz + hd), P(hw, iz + hd), P(hw, iz - hd)];
    // the readable band IS this quad now, so the frame gate measures the ink
    rec.corners = C.slice();
    for (const p of C) {
      this.ink[o] = p[0]; this.ink[o + 1] = p[1]; this.ink[o + 2] = p[2];
      this.inkNrm[o] = 0; this.inkNrm[o + 1] = 1; this.inkNrm[o + 2] = 0;
      o += 3;
    }
    // the row's middle INK_CROP, in v, so the band keeps the atlas proportion
    const mid = 1 - (slot + 0.5) / PLACE_MAX;
    const half = INK_CROP / (2 * PLACE_MAX);
    // …AND A GUTTER OFF THE EDGE IN U, which is not a rounding nicety. The card
    // region ends at u 0.625 and the BRASS begins there, so a band that
    // samples to the boundary catches brass along its whole edge — on the tent
    // that is invisible (cream card, cream-ish sliver, an opaque object), and
    // on a TRANSPARENT quad lying on dark felt it is a bright hairline drawn
    // beside every name. Measured by looking, at 4× on the first inlay frames:
    // a 1 px line down the right of "Gus" and under "Dicey".
    //
    // SIXTEEN TEXELS, NOT ONE, and the second attempt is the interesting one:
    // half a texel is the bilinear answer and it was still there, because the
    // texture is MIPMAPPED and anisotropic — at a grazing angle the sampler is
    // reading a coarse level where that boundary is one texel wide and the
    // brass is already mixed into it. So the gutter is sized for the mip, not
    // for the lerp. It costs nothing at all: the fitter already reserves 51 px
    // of padding each side (PAD_PX) and no glyph has ever been painted within
    // 35 of the edge. The v edges need no gutter — their neighbours are the
    // next station's card region, which is transparent under this dress too.
    const eu = INK_GUTTER / ATLAS_W;
    const u0 = U_CARD[0] + eu, u1 = U_CARD[1] - eu;
    const fu = turn[0][0], fv = turn[0][1];
    const a = fu ? u1 : u0;
    const b = fu ? u0 : u1;
    const t = fv ? mid - half : mid + half;
    const s = fv ? mid + half : mid - half;
    this.inkUv[uo++] = a; this.inkUv[uo++] = t;
    this.inkUv[uo++] = a; this.inkUv[uo++] = s;
    this.inkUv[uo++] = b; this.inkUv[uo++] = s;
    this.inkUv[uo++] = b; this.inkUv[uo++] = t;
    const alpha = this.inkRest();
    for (let i = 0; i < 4; i++) {
      this.inkCol[co] = 1; this.inkCol[co + 1] = 1; this.inkCol[co + 2] = 1;
      this.inkCol[co + 3] = alpha;
      co += 4;
    }
  }

  // The dress's size multiplier, clamped to something a table can hold.
  scale() {
    const k = Number(this.dress.scale);
    return Number.isFinite(k) && k > 0 ? Math.min(4, Math.max(0.2, k)) : 1;
  }

  // THE INK'S OPACITY WHEN NOTHING IS HAPPENING, and it means the same thing
  // in both modes on purpose — one number, one meaning. `steady` never leaves
  // it. `ghost` rests here and is lifted to FULL by the roller's own wash
  // (`_inkAlpha`), so the dial reads as "how present is a name that nobody is
  // using", which is the question Joe's "very subtle" is actually asking. A
  // table that wants no names until they matter drags this to 0.1; one that
  // wants them always legible leaves it where it is and stays `steady`.
  inkRest() {
    return Math.min(1, Math.max(0, Number(this.dress.ink.rest) || 0));
  }

  // THE GROUND IS MEASURED, NOT ASSUMED — the `surfaceUnder` pattern
  // (js/main.js:1173-1186). The felt is y 0, but a fae venue lays its OWN
  // opaque ground over it at 0.02 and clearing detail at 0.035, so a placard
  // seated by a constant y is buried in a glade while every count stays green
  // — which is exactly how the tower's contact shadow spent five rounds under
  // the floor. Eight rays per REBUILD, never per frame.
  _seatY(x, z) {
    this._org.set(x, 8, z);
    this._rc.set(this._org, this._down);
    const hits = this._rc.intersectObjects(this._scene.children, true);
    for (const h of hits) {
      if (h.object === this.mesh || h.object === this.washMesh) continue;
      const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
      if (!m || m.depthWrite === false) continue;
      return h.point.y;
    }
    return 0;
  }

  // ---- the public surface -----------------------------------------------

  // rows: [{place, playerId, name, color, mine, anchor:{x,z,azim,relocated}}]
  // Rewrites contents, never lengths. Cheap enough to call from every roster
  // door and both mat-extent writers.
  update(rows) {
    const live = (rows || []).filter((r) => r && Number.isInteger(r.place)
      && r.place >= 0 && r.place < PLACE_MAX && r.anchor);
    if (!live.length && !this.built) { this.rows = []; this.occupied = 0; return; }
    this._ensureBuilt();
    const next = new Array(PLACE_MAX).fill(null);
    for (const r of live) {
      next[r.place] = {
        place: r.place,
        playerId: r.playerId || null,
        name: r.name || '',
        color: r.color || null,
        mine: !!r.mine,
        relocated: !!r.anchor.relocated,
        anchor: { x: r.anchor.x, z: r.anchor.z, azim: r.anchor.azim },
        hue: hexColor(r.color),
        seatY: 0,
        shown: null,
        fontPx: 0,
        ink: { w: 0, h: 0 },
        corners: null,
      };
    }
    // WHAT THE ATLAS WAS PAINTED FOR. A dress can change the GROUND under
    // every name (bone stock under the tent, nothing at all under the two flat
    // styles) and the ink's own colour, and neither is a function of the
    // roster — so the rename test below is not enough on its own, and a style
    // flipped between two updates would have left eight cream cards floating
    // over the felt. Same in-place repaint, one key wider.
    // THE STYLE ITSELF IS IN THE KEY, not a two-state 'stock or clear': the
    // stamp and the inlay share a transparent ground and paint COMPLETELY
    // differently on it, so a key that could not tell them apart would leave
    // eight plain names on the felt the first time you switched between them.
    const key = `${this.dress.style}:${this.dress.ink.tone}`;
    const redress = this.paintedKey !== key;
    this.paintedKey = key;
    for (let slot = 0; slot < PLACE_MAX; slot++) {
      const rec = next[slot];
      const was = this.rows[slot] || null;
      if (!rec) {
        this._writeEmpty(slot);
        this._writeInk(slot, null, null);
        if (was) this._paintRow(slot, null);
        continue;
      }
      rec.seatY = this._seatY(rec.anchor.x, rec.anchor.z);
      this._writePlacard(slot, rec);
      // A row is repainted only when the WORD on it changed — a zoom, a tower
      // and a promotion all move geometry and touch no pixel of the atlas —
      // or when the DRESS changed what a word is printed on.
      if (!was || was.name !== rec.name || redress) {
        const painted = this._paintRow(slot, rec.name);
        rec.shown = painted.shown;
        rec.fontPx = painted.fontPx;
        rec.ink = painted.ink;
      } else {
        rec.shown = was.shown;
        rec.fontPx = was.fontPx;
        rec.ink = was.ink;
      }
      // THE NAME'S SHARE OF THE FLAT BAND, which is not its share of the atlas
      // row: that band shows the row's middle INK_CROP, so a glyph filling
      // half the ROW fills half of 0.78 of it and the down fraction is divided
      // by the crop. Set HERE and not in `_writeInk` because the geometry is
      // written before the row is painted — `rec.ink` is still the zero
      // initialiser at that point, and an inkBox built from it reported every
      // name as a box of no height. `placardFrame` prefers this where it
      // exists; the tent has no crop, no inkBox, and reads `row.ink` as ever.
      rec.inkBox = !isFlat(this.dress.style) || !rec.ink ? null
        : { w: rec.ink.w, h: Math.min(1, rec.ink.h / INK_CROP) };
    }
    this.rows = next;
    this.occupied = live.length;
    // …and what those pads were written FROM, for `budget()` to report.
    this.pad = {
      w: baseW(), d: baseD(),
      h: this.dress.style === 'plate' ? PLATE_H : BASE_H,
    };
    // …and the DRESS they were written under, for the same reason: `setDress`
    // records the ask and only this line records the buffer.
    this.worn = { ...this.dress, ink: { ...this.dress.ink }, wash: { ...this.dress.wash } };
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this._inkFlush();
    // AN INLAY DRAWS NO OBJECT AT ALL, so the opaque rig has nothing in it —
    // every quad is degenerate and the mesh is 8 × 48 empty triangles. Hiding
    // it is not cosmetic: it is the draw call and the shadow pass, and the
    // whole claim of the style is that the table stops carrying eight objects.
    this.mesh.visible = this.shown && this.occupied > 0 && !isBare(this.dress.style);
    this.inkMesh.visible = this.shown && this.occupied > 0 && isFlat(this.dress.style);
  }

  // The ink buffers, uploaded and bounded. Its own function because `update`
  // and `_rewrite` both end here and the two used to differ by a line.
  _inkFlush() {
    if (!this.built) return;
    this.inkGeom.attributes.position.needsUpdate = true;
    this.inkGeom.attributes.normal.needsUpdate = true;
    this.inkGeom.attributes.uv.needsUpdate = true;
    this.inkGeom.attributes.color.needsUpdate = true;
    this.inkGeom.computeBoundingSphere();
  }

  // The rig's own kill switch, so `scene-draw-budget` can measure the SAME
  // frame with and without the cards and catch a baseline regression too.
  setShown(on) {
    this.shown = !!on;
    if (this.built) {
      this.mesh.visible = this.shown && this.occupied > 0 && !isBare(this.dress.style);
      this.inkMesh.visible = this.shown && this.occupied > 0 && isFlat(this.dress.style);
    }
    return this.shown;
  }

  // ---- the dress --------------------------------------------------------

  // WHAT THE CARDS ARE WEARING (`cards.style`, `cards.inset`, `cards.ink.*`).
  // Takes the whole dress or any part of it, refuses a value outside its
  // options exactly as js/tune.js would, and answers whether anything MOVED —
  // js/main.js asks for a re-bake on true and does nothing at all on false, so
  // a binder that fires on every `cards.*` leaf does not re-cut the rig
  // because the standoff moved by nothing.
  //
  // IT DOES NOT DRAW. The rig is re-cut at the placard flush, behind the roll
  // boundary a zoom and a tower take (js/main.js `rebuildPlacards`), for the
  // reason the footprint dials are re-cut there: names may not change shape
  // with dice in the air.
  setDress(d) {
    if (!d || typeof d !== 'object') return false;
    const now = { ...this.dress, ink: { ...this.dress.ink } };
    if (typeof d.style === 'string' && STYLES.includes(d.style)) now.style = d.style;
    if (Number.isFinite(d.scale)) now.scale = d.scale;
    if (Number.isFinite(d.inset)) now.inset = d.inset;
    const wash = d.wash;
    if (wash && typeof wash === 'object') {
      now.wash = { ...now.wash };
      if (wash.state === 'enabled' || wash.state === 'disabled') now.wash.state = wash.state;
      if (Number.isFinite(wash.peak)) now.wash.peak = Math.min(1, Math.max(0, wash.peak));
    }
    const ink = d.ink;
    if (ink && typeof ink === 'object') {
      if (typeof ink.mode === 'string' && INK_MODES.includes(ink.mode)) now.ink.mode = ink.mode;
      if (typeof ink.tone === 'string' && INK_TONES.includes(ink.tone)) now.ink.tone = ink.tone;
      if (Number.isFinite(ink.rest)) now.ink.rest = Math.min(1, Math.max(0, ink.rest));
    }
    const same = now.style === this.dress.style && now.inset === this.dress.inset
      && now.scale === this.dress.scale
      && now.ink.mode === this.dress.ink.mode && now.ink.tone === this.dress.ink.tone
      && now.ink.rest === this.dress.ink.rest
      && now.wash.state === this.dress.wash.state && now.wash.peak === this.dress.wash.peak;
    if (same) return false;
    this.dress = now;
    return true;
  }

  // THE ARC UNDER THE CARD, as the dial has it (`cards.wash`, 2026-09-04, Joe:
  // "give me control of the light up of the placard that happens when rolling
  // dice, I might turn it down or turn it off").
  //
  // WHAT TURNING IT OFF COSTS, said here because it is a real cost and not a
  // preference: attribution at this table is SEAT PLUS WASH (§7.63). The seat
  // is where the dice came in from and the wash is the hue that says whose
  // they are, and a placeless roll — one from a viewer holding no chair —
  // lights nothing at all, which is what stops it ever wearing a placed
  // player's name. With the wash off, attribution is the seat alone: still
  // true, still unambiguous for a placed roll, and thinner for a table where
  // two people sit close together.
  //
  // THE GHOST KEEPS WORKING WITH IT OFF, and that is deliberate rather than
  // incidental: the arc is still computed on the film's own clock, and only
  // the MESH stops being drawn. So `ink.mode: ghost` with `wash.state:
  // disabled` is a real combination — the name is the whole of the cue.
  washPeak() {
    if (this.dress.wash.state === 'disabled') return 0;
    const p = Number(this.dress.wash.peak);
    return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : WASH_PEAK;
  }

  // The dress as WORN — what the buffer was last written under, null before
  // the first update. `dress` is the ask; this is the picture.
  dressInfo() {
    // THE ALPHA IS PER STATION, and reporting one number here was a real
    // mistake for a minute: the ghost lifts the ROLLER's name, so a report
    // that read slot 0 while station 1 was rolling said the feature did
    // nothing. `alphas` is the buffer, station by station; `alpha` is the
    // loudest of them, which is the one a reader is looking at.
    const alphas = [];
    for (let i = 0; i < PLACE_MAX; i++) {
      alphas.push(this.inkCol ? +this.inkCol[i * INK_VERTS * 4 + 3].toFixed(4) : 0);
    }
    return {
      asked: { ...this.dress, ink: { ...this.dress.ink }, wash: { ...this.dress.wash } },
      worn: this.worn
        ? { ...this.worn, ink: { ...this.worn.ink }, wash: { ...this.worn.wash } }
        : null,
      washPeak: this.washPeak(),
      rest: this.inkRest(),
      alphas,
      alpha: alphas.reduce((m, a) => Math.max(m, a), 0),
      lit: alphas.findIndex((a) => a > this.inkRest() + 1e-6),
    };
  }

  rowAt(place) { return this.rows[place] || null; }

  text(place) {
    const r = this.rowAt(place);
    return r ? r.shown : null;
  }

  // THE READER MOVED — turn every name toward them (§7.63). `orbit` is the
  // camera orbit the frame was just cut to, kept CONTINUOUS: on the ring a
  // viewer sits at 2πk/N, and any bucket wider than 22.5° is illegal — at N=5
  // the chairs at 144° and 216° round to the same quarter, so a quantised
  // reader would leave the names printed for the chair you left. The only
  // rounding left is READER_EPS, which exists so this stays an EDGE: the orbit
  // CUTS and never eases (applyFramingPose), so an unchanged pose returns
  // false on every reframe but the cut itself — which is what main.js's demo
  // overlay resync is keyed to. A UV rewrite over the standing rows: no atlas
  // repaint, no allocation, no object moved — the printing turns, the placards
  // stand.
  setReader(orbit) {
    const a = ((orbit || 0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    if (Math.abs(a - this.readerAzim) < READER_EPS) return false;
    this.readerAzim = a;
    this._rewrite();
    return true;
  }

  readerOrbit() { return this.readerAzim; }

  // Re-emit every station's geometry from the rows already standing — same
  // anchors, same seating, same names — for a change that touches only how
  // they are read. Contents, never lengths, like update().
  _rewrite() {
    if (!this.built) return;
    for (let slot = 0; slot < PLACE_MAX; slot++) {
      const rec = this.rows[slot];
      if (rec) this._writePlacard(slot, rec);
      else { this._writeEmpty(slot); this._writeInk(slot, null, null); }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this._inkFlush();
  }

  // ---- the wash ---------------------------------------------------------

  // at: {place, x, z, color}; dur is the film's own length, so the cue lasts
  // exactly as long as the thing it is attributing — and it is positioned on
  // that length by washAt(t) from the FILM'S clock (roll.time), never by a
  // clock of its own. A wash that kept its own dt accumulator ran through the
  // ceremony's 1.35 s declaration hold (roll.time pinned at 0, the dice
  // hidden) and was dark before the first tumble frame of every Check roll;
  // it also kept breathing after a plain skip had jumped the film to its end.
  washFire(at, dur) {
    if (!at) return this.washClear();
    this._ensureBuilt();
    const row = this.rowAt(at.place);
    const y = (row ? row.seatY : 0) + WASH_Y;
    this.washMesh.position.set(at.x, y, at.z);
    // Open the arc toward the table's middle: the wash lies BETWEEN the card
    // and the felt the dice are on, which is what makes it read as belonging
    // to that card rather than as a light somebody left on.
    const dx = -at.x, dz = -at.z;
    const len = Math.hypot(dx, dz) || 1;
    this.washMesh.rotation.y = Math.atan2(-dz / len, dx / len);
    this.washMat.color.copy(hexColor(at.color));
    this.washMat.opacity = 0;
    this.washMesh.visible = this.washPeak() > 0;
    this.wash = {
      active: true, t: 0,
      // A film without a length (none ships one) gets the cap: the film's
      // clock ends the arc regardless, and 0 would divide washAt to NaN.
      dur: Math.min(WASH_MAX_S, dur > 0 ? dur : WASH_MAX_S),
      place: at.place, x: at.x, y, z: at.z, color: at.color || null,
    };
    return this.wash;
  }

  washClear() {
    if (!this.built) return null;
    this.wash.active = false;
    this.wash.place = null;
    this.washMat.opacity = 0;
    this.washMesh.visible = false;
    this._inkAlpha(null, 0);
    return this.wash;
  }

  // THE GHOST — the name that is only there when it matters (`cards.ink.mode`).
  //
  // It rides the WASH's own envelope and not a clock of its own, and that is
  // the whole design: the wash is already the second half of the attribution
  // rule ("attribution is seat + wash"), already a pure function of where the
  // FILM is — held while the film is held, jumped when it is jumped, over when
  // it is over — and already the thing that says "these dice are that
  // person's". A name that brightens on any other schedule would be a second
  // opinion about whose roll this is. So one station's ink is lifted from its
  // resting opacity to full across `sin(πu)`, exactly the arc under it, and
  // every other station stays at rest.
  //
  // Nothing here is a film input and nothing is seeded: it is opacity, per
  // viewer, downstream of a pixel. A tab in `steady` and a tab in `ghost` are
  // looking at the same dice on the same felt at the same moments.
  _inkAlpha(place, lift) {
    if (!this.built || !this.inkCol) return;
    const rest = this.inkRest();
    const ghost = this.dress.ink.mode === 'ghost';
    let moved = false;
    for (let slot = 0; slot < PLACE_MAX; slot++) {
      const rec = this.rows[slot];
      const on = ghost && rec && slot === place;
      const a = !rec || !rec.name ? 0
        : (on ? rest + (1 - rest) * Math.min(1, Math.max(0, lift)) : rest);
      const co = slot * INK_VERTS * 4;
      if (this.inkCol[co + 3] === a) continue;
      for (let i = 0; i < 4; i++) this.inkCol[co + i * 4 + 3] = a;
      moved = true;
    }
    if (moved) this.inkGeom.attributes.color.needsUpdate = true;
  }

  // Opacity 0 → 0.62 → 0 across the film. `t` is the film's own position
  // (roll.time, in seconds) — ABSOLUTE, not a delta — so the arc is a pure
  // function of where the film is: held while the film is held, jumped when
  // the film is jumped, and over when the film is over. main.js drives it
  // from placeWashSync, once per tick, after the film has stepped.
  washAt(t) {
    if (!this.built || !this.wash.active) return;
    this.wash.t = t;
    const u = t / this.wash.dur;
    if (u >= 1) { this.washClear(); return; }
    const arc = Math.sin(Math.PI * Math.max(0, u));
    this.washMat.opacity = this.washPeak() * arc;
    this.washMesh.visible = this.washPeak() > 0;
    this._inkAlpha(this.wash.place, arc);
  }

  washInfo() {
    const w = this.wash;
    return {
      active: !!(this.built && w.active && this.washMesh.visible),
      station: w.active ? w.place : null,
      world: w.active ? { x: w.x, y: w.y, z: w.z } : null,
      color: w.active ? w.color : null,
      opacity: this.built ? +this.washMat.opacity.toFixed(4) : 0,
    };
  }

  // ---- the instruments --------------------------------------------------

  // ---- teardown ---------------------------------------------------------
  // The reverse of _ensureBuilt, for the ONE caller that owes it: developer
  // mode's Shut (js/main.js devClose, 2026-09-02), whose promise is that a
  // tab measures identical to one that never opened the door — and a rig
  // built for a cast that has since gone holds a material and three textures
  // that a never-dealt table never allocated. A real table keeps its rig
  // through comings and goings exactly as before; nothing else calls this.
  // After it the object is the one the constructor made: unbuilt, empty.
  dispose() {
    if (!this.built) return;
    for (const m of [this.mesh, this.inkMesh, this.washMesh]) {
      if (!m) continue;
      this._scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    for (const t of [this.albedo, this.orm, this.emissive]) if (t) t.dispose();
    for (const m of [this.material, this.inkMat, this.washMat]) if (m) m.dispose();
    this.mesh = null; this.washMesh = null; this.material = null; this.washMat = null;
    this.inkMesh = null; this.inkMat = null; this.inkGeom = null;
    this.ink = null; this.inkUv = null; this.inkCol = null; this.inkNrm = null;
    this.albedo = null; this.orm = null; this.emissive = null;
    this.canvas = null; this.ctx = null; this.ormCtx = null;
    this._scratch = null; this._scratchCtx = null;
    this.built = false;
    this.pad = null;
    this.worn = null;
    this.paintedKey = null;
    this.rows = [];
    this.occupied = 0;
    this.wash = { active: false, t: 0, dur: 0, place: null, x: 0, y: 0, z: 0, color: null };
  }

  budget() {
    const standing = this.built && this.mesh.visible;
    const inking = this.built && this.inkMesh.visible;
    return {
      // THE RIG'S OWN DRAW CALLS IN A FRAME: the mesh, its shadow-map pass,
      // and the wash while a film is playing — plus, under the two flat
      // styles, the ink. The ink casts no shadow, so it is ONE call and not
      // two, and under the inlay the opaque mesh is not drawn at all: a table
      // of eight goes from 2 calls to 1 and from 384 triangles to 16. That is
      // the budget half of "far less distracting", and it is reported here
      // rather than claimed, because the tent's own numbers were.
      draws: (standing ? 2 : 0) + (inking ? 1 : 0)
        + (this.built && this.washMesh.visible ? 1 : 0),
      tris: (standing ? PLACE_MAX * TRIS : 0) + (inking ? PLACE_MAX * INK_QUADS * 2 : 0),
      // WHAT IS BEING WORN, off the buffer and not off the ask (`pad`'s own
      // rule): `style` is what the vertices say, `asked` what the dial says,
      // and `dev-cards-live`'s claim — a dial turned with dice in the air
      // changes nothing until they land — is the gap between them.
      style: this.worn ? this.worn.style : this.dress.style,
      ink: this.worn
        ? { ...this.worn.ink, rest: this.inkRest(), alpha: this.inkCol ? +this.inkCol[3].toFixed(4) : 0 }
        : null,
      inset: this.worn ? this.worn.inset : this.dress.inset,
      scale: this.worn ? this.worn.scale : this.dress.scale,
      // the ink band's own size and density, the flat styles' answer to
      // `face` below — the number that says this is not the floor atlas
      band: this._bandInfo(),
      atlasPx: ATLAS_W,
      atlasH: ATLAS_H,
      rows: PLACE_MAX,
      // THE CARD'S OWN MEASUREMENTS, reported so the size claim is a gate and
      // not a comment (v2). `w`/`slope` are the card panel, `printed` the
      // readable band down it, `ridgeY` how tall the whole object stands, and
      // `pxPerUnit` the atlas resolution across it — every one of them a number
      // placard-look compares against a d6's 1.35 edge.
      // …AS THE SCALE HAS THEM (`cards.scale`). Reported off the multiplier the
      // buffer was written with, not the one the dial currently holds, for
      // `pad`'s reason: between a dial turn and the placard flush those are
      // two different numbers and only one of them is on screen.
      face: (() => {
        const k = this.worn ? (Number(this.worn.scale) || 1) : this.scale();
        return {
          w: cardW(k), slope: cardSlope(k), printed: faceH(k), ridgeY: ridgeY(k),
          pxPerUnit: CARD_PX / cardW(k), pxPerUnitDown: ROW_PX / faceH(k),
          fontMax: FONT_MAX, fontMin: FONT_MIN, scale: k,
        };
      })(),
      // the arc under the card, as the dial has it — 0 when it is turned off
      wash: { state: this.dress.wash.state, peak: this.washPeak() },
      // …AND THE HOLDER'S FOOTPRINT, for the same reason `face` is here: it is
      // the declaration's now (dice.yaml `cards` → js/places.js PLACARD), and
      // a size that can be declared needs a gate rather than a comment.
      // Reported OFF THE BUFFER (`this.pad`), not off `PLACARD`, and since
      // phase D4 that is the whole point: `cards.*` is an apply row whose
      // binder (js/main.js `cardsSync` → `rebuildPlacards`) writes `PLACARD`
      // at once and asks for the re-bake at the next placard flush, so between
      // those two moments the live object and the vertex buffer disagree — and
      // a gate that read the live object could not tell a landed re-bake from
      // an assignment. It falls back to the live numbers only before the first
      // `update`, where there is no buffer to describe. `dev-cards-live` is
      // what holds it: a dial turned with dice in the air must read here as
      // the OLD footprint until they land.
      base: this.pad ? { ...this.pad } : { w: baseW(), d: baseD(), h: BASE_H },
      // TWO MATERIALS UNDER A FLAT STYLE, and the second one is the price of
      // paint that can fade: an opaque, depth-writing, shadow-casting rig
      // cannot also carry a transparent quad. It shares the atlas, so the
      // texture count does not move.
      materials: this.built ? (inking ? 2 : 1) : 0,
      textures: this.built ? 3 : 0,
      occupied: this.occupied,
      shown: this.shown,
    };
  }

  // The printed band the flat styles actually stand up, measured off the row
  // that was written rather than computed from the dials a second time.
  _bandInfo() {
    for (const r of this.rows) {
      if (r && r.inkSize) return { ...r.inkSize, crop: INK_CROP };
    }
    return null;
  }
}
