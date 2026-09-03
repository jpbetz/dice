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
// are used; the rig is baked once at boot, which is why `cards.*` is a ⟳ row.
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
const U_CARD = [0, 0.625];
const U_BASE = [0.625, 0.8125];
const U_BEAD = [0.8125, 0.859375];
const U_EDGE = [0.859375, 1];

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
    this.wash = { active: false, t: 0, dur: 0, place: null, x: 0, y: 0, z: 0, color: null };
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
  }

  // ONE ROW, IN PLACE — the recompositeFelt no-churn law. A rename clears 128
  // scanlines of the card region and redraws them; no new canvas, no new
  // texture, no GPU allocation. Returns what was actually painted, so the
  // 44 px floor is a reported number rather than a hoped-for one.
  _paintRow(slot, name) {
    const x = this.ctx;
    const k = KIT_TABLE;
    const y = slot * ROW_PX;
    const w = (U_CARD[1] - U_CARD[0]) * ATLAS_W;
    x.clearRect(U_CARD[0] * ATLAS_W, y, w, ROW_PX);
    const g = x.createLinearGradient(0, y, 0, y + ROW_PX);
    g.addColorStop(0, '#efe6cf');
    g.addColorStop(1, k.card);
    x.fillStyle = g;
    x.fillRect(U_CARD[0] * ATLAS_W, y, w, ROW_PX);
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

    x.fillStyle = k.ink;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(shown, U_CARD[0] * ATLAS_W + w / 2, y + ROW_PX / 2 + ROW_PX * 0.016);
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
    // (cos ≈ 0) taking the head treatment the old quarter-turn table gave it.
    // The reader is wherever the frame was last cut to (`readerAzim`, set by
    // main.js's applyFramingPose — the per-viewer orbit of §7.63, or the
    // ladder's quarter turn on top of it). The card at the reader's own chair
    // and the one opposite land on their up-vector exactly; a card at their
    // elbow is read side-on whichever way it is printed, which is how a card
    // at your elbow reads at a real table too. Residual tilt on the visible
    // panel is wrap(θ_card − φ) into (−90°, 90°] — at N=3 it is 0/∓60°, at
    // N=6 0/±60°/∓60°/0, at N=8 0/±45°/±90°/∓45°/0: never worse than the
    // shipped head treatment, and there is no de-tilt dial.
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

    const hue = rec.hue;
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
    for (let slot = 0; slot < PLACE_MAX; slot++) {
      const rec = next[slot];
      const was = this.rows[slot] || null;
      if (!rec) {
        this._writeEmpty(slot);
        if (was) this._paintRow(slot, null);
        continue;
      }
      rec.seatY = this._seatY(rec.anchor.x, rec.anchor.z);
      this._writePlacard(slot, rec);
      // A row is repainted only when the WORD on it changed — a zoom, a tower
      // and a promotion all move geometry and touch no pixel of the atlas.
      if (!was || was.name !== rec.name) {
        const painted = this._paintRow(slot, rec.name);
        rec.shown = painted.shown;
        rec.fontPx = painted.fontPx;
        rec.ink = painted.ink;
      } else {
        rec.shown = was.shown;
        rec.fontPx = was.fontPx;
        rec.ink = was.ink;
      }
    }
    this.rows = next;
    this.occupied = live.length;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.mesh.visible = this.shown && this.occupied > 0;
  }

  // The rig's own kill switch, so `scene-draw-budget` can measure the SAME
  // frame with and without the cards and catch a baseline regression too.
  setShown(on) {
    this.shown = !!on;
    if (this.built) this.mesh.visible = this.shown && this.occupied > 0;
    return this.shown;
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
      else this._writeEmpty(slot);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
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
    this.washMesh.visible = true;
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
    return this.wash;
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
    this.washMat.opacity = WASH_PEAK * Math.sin(Math.PI * Math.max(0, u));
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
    for (const m of [this.mesh, this.washMesh]) {
      if (!m) continue;
      this._scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    for (const t of [this.albedo, this.orm, this.emissive]) if (t) t.dispose();
    for (const m of [this.material, this.washMat]) if (m) m.dispose();
    this.mesh = null; this.washMesh = null; this.material = null; this.washMat = null;
    this.albedo = null; this.orm = null; this.emissive = null;
    this.canvas = null; this.ctx = null; this.ormCtx = null;
    this.built = false;
    this.rows = [];
    this.occupied = 0;
    this.wash = { active: false, t: 0, dur: 0, place: null, x: 0, y: 0, z: 0, color: null };
  }

  budget() {
    const standing = this.built && this.mesh.visible;
    return {
      // the rig's own draw calls in a frame: the mesh, its shadow-map pass,
      // and the wash while a film is playing
      draws: (standing ? 2 : 0) + (this.built && this.washMesh.visible ? 1 : 0),
      tris: standing ? PLACE_MAX * TRIS : 0,
      atlasPx: ATLAS_W,
      atlasH: ATLAS_H,
      rows: PLACE_MAX,
      // THE CARD'S OWN MEASUREMENTS, reported so the size claim is a gate and
      // not a comment (v2). `w`/`slope` are the card panel, `printed` the
      // readable band down it, `ridgeY` how tall the whole object stands, and
      // `pxPerUnit` the atlas resolution across it — every one of them a number
      // placard-look compares against a d6's 1.35 edge.
      face: {
        w: CARD_W, slope: CARD_SLOPE, printed: FACE_H, ridgeY: RIDGE_Y,
        pxPerUnit: CARD_PX / CARD_W, pxPerUnitDown: ROW_PX / FACE_H,
        fontMax: FONT_MAX, fontMin: FONT_MIN,
      },
      // …AND THE HOLDER'S FOOTPRINT, for the same reason `face` is here: it is
      // the declaration's now (dice.yaml `cards` → js/places.js PLACARD), and
      // a size that can be declared needs a gate rather than a comment.
      // Reported LIVE, and that is exact rather than approximate: `cards.*` is
      // a ⟳ row with no binder — js/main.js copies the tree into PLACARD once
      // at boot, above this module's first build, and nothing moves it after —
      // so the number here is the number in the buffer until the next reload.
      base: { w: baseW(), d: baseD(), h: BASE_H },
      materials: this.built ? 1 : 0,
      textures: this.built ? 3 : 0,
      occupied: this.occupied,
      shown: this.shown,
    };
  }
}
