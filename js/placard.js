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
// outboard of the wall where the dice stop, with somebody's name on it. Plus
// the WASH — the transient arc of the roller's hue that lies on the ground
// under THEIR card while their film plays, which is the second half of the
// attribution rule ("attribution is edge + wash"): a placeless roll comes in
// on a seeded edge and lights nothing, so it can never wear the name of
// whoever's card its random edge happened to cross.
//
// WHY A TENT AND NOT A PLATE OR A STAND. From the shipped medium eye the near
// mat edge is 78.6° below horizontal and the far edge 46.4°, so a flat plate
// loses the far read (0.72 of face-on) and a vertical plate loses the near one
// (0.20). A tent at 56° half-opening reads 0.89–0.98 from every station AT
// ONCE, with the text projecting to screen-up at +0.998 everywhere. The base
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
// material; the name rides one row of a 1024² atlas so a rename repaints 128
// scanlines in place.
//
// THE TEXT IS FITTED, AND THAT IS THE DISCIPLINE THE KILLED MAT TEXT LACKED.
// The floor atlas gives 12.8 px per world unit and "THE GATE OF STORMS"
// rendered as "ATE OF ST" off both edges (GOALS goal 2's amendment). The card
// face is 512 px over 2.00 world units — 256 px/world-unit, TWENTY TIMES the
// floor — and the name is measured down from 68 px to a 44 px floor and then
// truncated with a VISIBLE ellipsis. `fontPx` and `shown` are both reported,
// so the floor is asserted rather than hoped for.

import * as THREE from 'three';
import { PLACE_MAX, PLACARD_W, PLACARD_D } from './places.js';

// ---------------------------------------------------------------------------
// The form (world units) — see docs/UX.md §7.63 for where these come from.
// ---------------------------------------------------------------------------

const BASE_W = PLACARD_W;                 // 2.20 — the footprint js/places.js
const BASE_D = PLACARD_D;                 // 1.24   asserts gaps against
const BASE_H = 0.10;
const CHAMFER = 0.04;                     // the seam that makes it an object
const CARD_W = 2.00;
const CARD_SLOPE = 0.70;
const CARD_T = 0.045;
const TENT_ALPHA = 56 * Math.PI / 180;    // half-opening, FROM VERTICAL
// Written once, in one expression order (the anchor rule): every other height
// in this file is derived from these two and never re-typed.
const TENT_RUN = CARD_SLOPE * Math.sin(TENT_ALPHA);   // 0.5804 — half the tent's depth
const TENT_RISE = CARD_SLOPE * Math.cos(TENT_ALPHA);  // 0.3914
const RIDGE_Y = BASE_H + TENT_RISE;                   // 0.4914 ≈ the authored 0.49
// THE READABLE FACE STARTS ABOVE THE FOOT, and this is a measurement, not a
// taste. The design puts the readable face at y 0.25–0.49 "so the gate is on
// the face, not the base"; built without that split — with the name running
// the whole 0.70 of the slope — the near card's printed area reaches ndc
// −1.037 at close on a 16:9 frame and the standoff gate goes red. Split here
// it reads −0.79 in the same frame, and the lower band becomes what it always
// was on a real tent card: the foot the holder grips, unprinted. It buys
// resolution too — 128 texels now cover 0.43 of slope (295 px/world-unit)
// instead of 0.70 (183).
const FACE_Y0 = 0.25;
const FACE_S = (RIDGE_Y - FACE_Y0) / TENT_RISE;       // 0.617 of the slope, from the ridge
const BEAD_W_MINE = BASE_W - 2 * CHAMFER; // YOUR card's bead runs the full base
const BEAD_W_OTHER = 0.55;                // everybody else's is a centred pip

// WHICH WAY UP THE PRINTING GOES, per station azimuth, for a reader at
// azimuth 0. Each row is [+z panel, −z panel] and each entry is
// [mirror across the card's width, flip the row end-over-end] — a quarter turn
// of the atlas row in texture space, which is all it takes to hand a shallow
// tent card's name to the person looking at it. See _writePlacard for why the
// OBJECT must not turn instead.
//
// Front (0) and back (π) land exactly on the reader's up-vector. The two heads
// are a quarter turn off it either way — a head card is read side-on until the
// viewer's own table can turn, which is the next slice — so their entries pick
// the pair that reads bottom-to-top rather than top-to-bottom.
const READ_TURN = Object.freeze({
  0: [[false, false], [true, true]],    // front      — azim 0
  1: [[false, false], [true, true]],    // right head — azim π/2
  2: [[true, true], [false, false]],    // back       — azim π
  3: [[true, true], [false, false]],    // left head  — azim 3π/2
});

// 24 quads a placard: 6 base (a truncated pyramid — the chamfer IS the bevel),
// 7 per card panel (printed face, unprinted foot, the hidden inner face, four
// edges), 2 end caps (emitted as quads with a repeated corner so the index
// buffer stays one uniform pattern; the second triangle is degenerate and
// costs no pixels), 2 beads.
const QUADS = 24;
const VERTS = QUADS * 4;                  // 96 per placard, 768 for the rig
const TRIS = QUADS * 2;                   // 48 per placard, 384 for the rig

// ---------------------------------------------------------------------------
// The atlas — 8 rows of 128 px, one row per station
// ---------------------------------------------------------------------------

const ATLAS_PX = 1024;
const ROW_PX = ATLAS_PX / PLACE_MAX;      // 128
const ORM_PX = 512;
const ORM_ROW = ORM_PX / PLACE_MAX;       // 64
const EMIS_PX = 512;

// U regions, as fractions of the atlas width. The card face takes half the
// row: 512 px over the card's 2.00 world units.
const U_CARD = [0, 0.5];
const U_BASE = [0.5, 0.75];
const U_BEAD = [0.75, 0.8125];
const U_EDGE = [0.8125, 1];

const CARD_PX = ATLAS_PX * (U_CARD[1] - U_CARD[0]);   // 512
const PAD_PX = 26;
const FONT_MAX = 68;
const FONT_MIN = 44;                      // asserted by placard-look

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

const WASH_INNER = 0.30;
const WASH_OUTER = 2.35;
const WASH_SEG = 32;
const WASH_SPAN = Math.PI * 0.9;
const WASH_PEAK = 0.62;
const WASH_Y = 0.012;
const WASH_MIN_S = 0.6;
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
    this.canvas.width = this.canvas.height = ATLAS_PX;
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
      x.fillRect(U_BASE[0] * ATLAS_PX, y, (U_BASE[1] - U_BASE[0]) * ATLAS_PX, ROW_PX);
      // the bead is painted WHITE on purpose — the vertex colour is the hue,
      // so one material dresses eight players
      const lg = x.createLinearGradient(0, y, 0, y + ROW_PX);
      lg.addColorStop(0, '#ffffff');
      lg.addColorStop(0.55, '#e8e8e8');
      lg.addColorStop(1, '#ffffff');
      x.fillStyle = lg;
      x.fillRect(U_BEAD[0] * ATLAS_PX, y, (U_BEAD[1] - U_BEAD[0]) * ATLAS_PX, ROW_PX);
      x.fillStyle = k.cardEdge;
      x.fillRect(U_EDGE[0] * ATLAS_PX, y, (U_EDGE[1] - U_EDGE[0]) * ATLAS_PX, ROW_PX);
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
    const w = (U_CARD[1] - U_CARD[0]) * ATLAS_PX;
    x.clearRect(U_CARD[0] * ATLAS_PX, y, w, ROW_PX);
    const g = x.createLinearGradient(0, y, 0, y + ROW_PX);
    g.addColorStop(0, '#efe6cf');
    g.addColorStop(1, k.card);
    x.fillStyle = g;
    x.fillRect(U_CARD[0] * ATLAS_PX, y, w, ROW_PX);
    if (!name) { if (this.albedo) this.albedo.needsUpdate = true; return { shown: null, fontPx: 0 }; }

    // THE FITTER. Measure down from 68 to the 44 px floor; only then truncate,
    // and truncate VISIBLY. MAX_NAME is 24 (server.js), and 44 px of bold
    // Georgia fits about twenty characters in 512 px, so only the longest
    // names ever lose a letter — and when they do you can see that they did.
    let f = FONT_MAX;
    x.font = `700 ${f}px Georgia, serif`;
    const room = CARD_PX - 2 * PAD_PX;
    while (f > FONT_MIN && x.measureText(name).width > room) {
      f -= 2;
      x.font = `700 ${f}px Georgia, serif`;
    }
    let shown = name;
    while (shown.length > 1 && x.measureText(`${shown}…`).width > room) shown = shown.slice(0, -1);
    if (shown !== name) shown += '…';

    x.fillStyle = k.ink;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(shown, U_CARD[0] * ATLAS_PX + w / 2, y + ROW_PX / 2 + 2);
    if (this.albedo) this.albedo.needsUpdate = true;
    return { shown, fontPx: f };
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
    // The object itself must NOT be turned to fix that. Every placard's whole
    // licence is that it stands OUTBOARD of a physics wall (js/places.js), and
    // a head card yawed to face the front stands 0.38 units INSIDE its wall at
    // medium, where a die can reach it. So the CARD keeps its station's
    // azimuth and only the PRINTING turns — a quarter turn of the atlas row,
    // per panel, in texture space, costing nothing and moving nothing.
    //
    // The reader is at azimuth 0 this slice (the per-viewer orbit is its own).
    // Front and back cards land on the reader's up-vector exactly; the two
    // heads are a quarter turn off it whichever way they are printed, which is
    // the honest state of a head seat until the viewer's own table can turn.
    const q = ((Math.round(azim / (Math.PI / 2)) % 4) + 4) % 4;
    const turn = READ_TURN[q];

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
    const bw = BASE_W / 2, bd = BASE_D / 2;
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
    const hw = (rec.mine ? BEAD_W_MINE : BEAD_W_OTHER) / 2;
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
      } else {
        rec.shown = was.shown;
        rec.fontPx = was.fontPx;
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

  // ---- the wash ---------------------------------------------------------

  // at: {place, x, z, color}; dur is the film's own length, so the cue lasts
  // exactly as long as the thing it is attributing.
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
      dur: Math.max(WASH_MIN_S, Math.min(WASH_MAX_S, dur || 0)),
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

  // Opacity 0 → 0.5 → 0 across the film, on the dt clock everything else in
  // this app runs on (so holdClock freezes it and sim() steps it).
  washTick(dt) {
    if (!this.built || !this.wash.active) return;
    this.wash.t += dt;
    const u = this.wash.t / this.wash.dur;
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

  budget() {
    const standing = this.built && this.mesh.visible;
    return {
      // the rig's own draw calls in a frame: the mesh, its shadow-map pass,
      // and the wash while a film is playing
      draws: (standing ? 2 : 0) + (this.built && this.washMesh.visible ? 1 : 0),
      tris: standing ? PLACE_MAX * TRIS : 0,
      atlasPx: ATLAS_PX,
      rows: PLACE_MAX,
      materials: this.built ? 1 : 0,
      textures: this.built ? 3 : 0,
      occupied: this.occupied,
      shown: this.shown,
    };
  }
}
