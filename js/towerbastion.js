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

// BASTION — the second tower skin (docs/TOWER.md): a weathered stone turret
// wrapped around the same TOWER_CORE that Heartwood wraps. Zero colliders,
// zero lights, and it never reads or writes the film; every number below
// comes out of `towerVolumes()`, so a retune of S, the mat or the zoom
// ladder moves the model with the contract.
//
// The techniques are Heartwood's, imported rather than forked (js/towerskin.js
// exports the kit): seeded tileable noise, a Sobel height→normal pass, a
// roughness map off the same height field, rounded boxes, the raycast
// vertex-AO bake, the unlit near-black lining, gradient veils, contact
// shadows. What is new here is `bakeStone` — ashlar courses in running bond,
// dropped joints, per-block value and temperature jitter, and joint chipping
// by turbulence, with the height channel painted in the same pass.
//
// THE SHAPE THE SOCKET ALLOWS. Bastion wants to be a round drum, and it is
// round everywhere the socket has room to be round — which is not the front.
// The MOUTH's clear bore is Ø4.25 centred at z0−2.0 and the SOCKET's face is
// z0+0.25: that leaves 0.125 of depth in front of the bore for material, so
// the front of ANY tower here is a thin flat facade (Heartwood reached the
// same conclusion and calls its front board "thin by contract"). Bastion
// therefore reads as a drum ENGAGED in the back wall: a round shell whose
// front is clipped off by the socket face, with a flat gate facade filling
// the opening above the door head. Everything that reads in RELIEF lives
// where relief is legal — the shoulders (radius is free there), the crown
// (up is free), and the gate hood (the HOOD volume reaches z0+1.25). On the
// facade itself, relief is 0.03 and the articulation is colour: cool granite
// field, warm sandstone quoins, string course, corbel table and merlons.
//
// THE CROWN AND THE OCCLUSION CHEAT. An open crenellated crown is the trap:
// an embrasure is a hole, and a hole at the top of the shaft is a sightline
// onto the despawn line for somebody's viewport. Bastion's merlons are
// DECORATION standing on a CLOSED parapet ring — the parapet's top (y 11.95)
// is the embrasure floor, and it is high enough that every ray that clears
// it passes over the whole cowl band. That ring is the "cap": it is what
// occludes, and tools/steps/tower-occlusion.mjs is what says so. A literal
// lid over the bore is not available — the entry drop starts at y = 11.25
// with dice up to 1.25 in radius, so anything roofing the mouth is something
// dice fall through.

import * as THREE from 'three';
import {
  mulberry32, hash2, fbm, turb, clamp01, smoothstep, ramp3,
  heightToNormal, roughFromHeight, veilTexture,
  roundedBox, planarUV, weather, bakeVertexAO,
} from './towerskin.js';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
// Two stones, three stops each, exactly like Heartwood's two species: a cool
// grey granite for the field and a warmer sandstone for every dressed edge.
// The mortar is a warm near-black — a recess is shadow, and shadow in a warm
// room is never #000.
const GRANITE = [[0x3c, 0x40, 0x46], [0x64, 0x69, 0x70], [0x8e, 0x94, 0x9b]];
const SANDSTONE = [[0x6f, 0x5b, 0x40], [0x99, 0x80, 0x5c], [0xbe, 0xa6, 0x7e]];
const MORTAR = [0x2b, 0x25, 0x1f];

const mod = (n, m) => ((n % m) + m) % m;

// ---------------------------------------------------------------------------
// bakeStone — ashlar in one pass, colour and height together
// ---------------------------------------------------------------------------
// Both canvases come out of the same loop because they share every noise
// lookup, and because the height field must agree with the mortar lines to
// the pixel or the normal map fights the albedo.
//
// TILEABILITY is structural, not decorative: `blocks` and `courses` are whole
// numbers, every per-block lookup is keyed on the WRAPPED indices, and the
// noise is the tileable kit from towerskin.js. A seam in a wall texture on a
// drum is a vertical scar you cannot unsee.
//
// The three things that stop procedural ashlar reading as graph paper:
//   1. DROPPED JOINTS — a quarter of the vertical joints simply do not
//      exist, which merges neighbours into long stones. Real coursed rubble
//      is full of them; a perfect grid is a Lego wall.
//   2. PER-BLOCK VALUE AND TEMPERATURE — each stone takes its own slice of
//      the ramp and its own pull between the warm and cool ends. Without it
//      every block averages to the same grey and the wall reads as concrete.
//   3. CHIPPED ARRISES — the joint's own edge wanders under two octaves of
//      turbulence, so the mortar bites into block corners at random. Cut
//      stone that has stood in weather has no straight arris left.
function bakeStone({ size, stops, blocks, courses, seed,
  joint = 0.010, relief = 1, chip = 1, speckle = 0.05, wash = 0.20 }) {
  const W = size;
  const cCan = document.createElement('canvas'); cCan.width = cCan.height = W;
  const hCan = document.createElement('canvas'); hCan.width = hCan.height = W;
  const cCtx = cCan.getContext('2d'), hCtx = hCan.getContext('2d');
  const cImg = cCtx.createImageData(W, W), hImg = hCtx.createImageData(W, W);
  const B = Math.max(1, blocks), C = Math.max(1, courses);

  // Running bond: alternate courses step half a block, plus a little wander
  // so the stepping is not metronomic. Constant within a course, so the
  // canvas still tiles in u.
  const courseOff = [];
  for (let c = 0; c < C; c++) {
    courseOff.push((c % 2 ? 0.5 : 0) + (hash2(0, c, seed + 5) - 0.5) * 0.16);
  }

  for (let py = 0; py < W; py++) {
    const vv = py / W;
    const cy = vv * C, ci = Math.floor(cy), fy = cy - ci;
    const ciw = mod(ci, C);
    const off = courseOff[ciw];
    for (let px = 0; px < W; px++) {
      const u = px / W;
      const bxf = u * B - off;
      const bi = Math.floor(bxf), fx = bxf - bi;
      const biw = mod(bi, B);

      // Distances to the nearest joint, in TEXTURE units so a course line
      // and a block line get the same mortar width.
      const live = (k) => hash2(mod(k, B), ciw, seed + 101) > 0.24;
      const dL = live(bi) ? fx / B : 9;
      const dR = live(bi + 1) ? (1 - fx) / B : 9;
      const dH = Math.min(fy, 1 - fy) / C;
      const wob = joint * chip * (0.55 * (turb(u * 96, vv * 96, 96, 3, seed + 13) * 2 - 1)
        + 0.85 * (turb(u * 20, vv * 20, 20, 2, seed + 29) - 0.5));
      const d = Math.min(dL, dR, dH) + wob;
      const groove = 1 - smoothstep(0, joint, d);
      // A bright arris just inside the joint: the edge of a cut stone catches
      // the light the recess loses.
      const lip = smoothstep(joint, joint * 1.8, d) * (1 - smoothstep(joint * 3.2, joint * 6.5, d));

      const hb = hash2(biw, ciw, seed + 3);
      const hb2 = hash2(biw, ciw, seed + 61);
      const mottle = fbm(u * 7, vv * 7, 7, 4, seed + 17);
      const t = clamp01(0.18 + 0.62 * hb + 0.40 * (mottle - 0.5));
      let [r8, g8, b8] = ramp3(stops, t);
      const warm = (hb2 - 0.5) * 0.18;
      r8 *= 1 + warm; b8 *= 1 - warm;
      const sp = turb(u * 150, vv * 150, 150, 2, seed + 77);
      const spk = 1 + speckle * (sp * 2 - 1);
      r8 *= spk; g8 *= spk; b8 *= spk;
      // Rain wash: a broad, mostly-vertical drift. Slightly green in the
      // mid-tones, which is what damp northern stone actually does.
      const wsh = (1 - wash / 2) + wash * fbm(u * 2.2, vv * 1.05, 2, 3, seed + 41);
      r8 *= wsh * 0.99; g8 *= wsh * 1.01; b8 *= wsh * 0.985;
      if (groove > 0) {
        const m = groove * 0.94;
        r8 += (MORTAR[0] - r8) * m; g8 += (MORTAR[1] - g8) * m; b8 += (MORTAR[2] - b8) * m;
      }
      if (lip > 0) { const k = 1 + 0.075 * lip; r8 *= k; g8 *= k; b8 *= k; }

      // HEIGHT: joints, arrises, the block's own pillow, and grain. Block
      // COLOUR stays out of it — value variation in a normal map is the
      // stone equivalent of Heartwood's corrugated-iron tell.
      const pil = Math.sin(Math.PI * fx) * Math.sin(Math.PI * fy);
      const h = 0.58 - 0.42 * groove + 0.05 * lip
        + relief * 0.11 * (pil - 0.5)
        + 0.05 * (fbm(u * 26, vv * 26, 26, 3, seed + 5) - 0.5)
        - 0.035 * sp;

      const i = (py * W + px) * 4;
      cImg.data[i] = clamp01(r8 / 255) * 255;
      cImg.data[i + 1] = clamp01(g8 / 255) * 255;
      cImg.data[i + 2] = clamp01(b8 / 255) * 255;
      cImg.data[i + 3] = 255;
      const hv = clamp01(h) * 255;
      hImg.data[i] = hv; hImg.data[i + 1] = hv; hImg.data[i + 2] = hv; hImg.data[i + 3] = 255;
    }
  }
  cCtx.putImageData(cImg, 0, 0);
  hCtx.putImageData(hImg, 0, 0);

  const map = new THREE.CanvasTexture(cCan);
  map.colorSpace = THREE.SRGBColorSpace;   // colour only
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return {
    map,
    normalMap: heightToNormal(hCan, 1.0),
    roughnessMap: roughFromHeight(hCan, 256, seed + 999),
  };
}

// Baked once per page and reused across socket cycles — four passes of
// per-pixel fbm are not something to spend on every tower→tower swap.
let MAPS = null;
function maps() {
  if (MAPS) return MAPS;
  MAPS = {
    // The drum: 8 stones to a course, 16 courses to a tile. At 8.8 world
    // units per tile that is a 1.1 × 0.55 ashlar block — about 0.8 of a d6
    // edge wide, the scale cue that says "castle", not "garden wall".
    granite: bakeStone({ size: 512, stops: GRANITE, blocks: 8, courses: 16, seed: 0xba5701 }),
    // The plinth: half as many, twice the size, deeper joints, more chipping.
    rustic: bakeStone({ size: 512, stops: GRANITE, blocks: 4, courses: 8, seed: 0x2f19c4,
      joint: 0.016, relief: 1.8, chip: 1.5, wash: 0.26 }),
    // Dressed sandstone: fine joints, little chipping — this is the stone the
    // mason took time over.
    sand: bakeStone({ size: 256, stops: SANDSTONE, blocks: 6, courses: 12, seed: 0x71c308,
      joint: 0.008, relief: 0.6, chip: 0.5, speckle: 0.03 }),
    // A single dressed slab: no joints at all, just grain (lintel, hood, caps).
    sandFlat: bakeStone({ size: 256, stops: SANDSTONE, blocks: 1, courses: 1, seed: 0x5a2b90,
      joint: 0.004, relief: 0.35, chip: 0.4, speckle: 0.03, wash: 0.24 }),
    veil: veilTexture(256, 0.92),
    shadow: veilTexture(256, 0.55),
  };
  return MAPS;
}

// ---------------------------------------------------------------------------
// A course of the drum
// ---------------------------------------------------------------------------
// The annulus between rIn and rOut, extruded y0 → y1, and OPEN across the
// front where the socket's face clips it. Open rather than clipped-flat for
// two reasons: below the door head the opening IS the gateway (and its two
// radial end faces are the reveal a die flies out through), and above it the
// flat facade slab closes the same opening with the only thickness the
// contract leaves — 0.09.
//
// The bevel is what keeps this from reading as chalk: the arrises round off
// and stacked courses get a shadow line between them.
//
// MEASURE IT, DO NOT ASSUME IT. three's ExtrudeGeometry does not inset the
// body and taper outward the way a chamfer tool would — it puts the ORIGINAL
// contour at both ends of the extrusion and pushes the body OUT by bevelSize
// along each vertex's angle bisector, which at a corner overshoots to
// bevelSize/sin(θ/2). Measured on the shaft course: 0.041 of outward bulge
// for a 0.03 bevel. Every radius and the front clip below carry that number,
// which is why the courses stay inside the socket instead of 0.031 outside
// it. (The same sign flip works in our favour on the inner arc: the bore's
// clearance grows rather than shrinking.)
const BEVEL = 0.03;
const BEVEL_BULGE = 0.045;
function drumCourse(rOut, rIn, y0, y1, zc, zClip) {
  const th0 = Math.acos(Math.max(-1, Math.min(1, (zClip - zc) / rOut)));
  const sweep = 2 * Math.PI - 2 * th0;
  const n = Math.max(8, Math.ceil(sweep / (4 * Math.PI / 180)));
  const shape = new THREE.Shape();
  // Shape coordinates are (x, −z): the geometry is rotated −90° about X
  // afterwards, which sends the extrusion axis to +y and the shape's y to
  // world −z. Writing the contour in world x/z and negating once here beats
  // reasoning about it twice.
  const at = (r, th) => [r * Math.sin(th), -(zc + r * Math.cos(th))];
  let p = at(rOut, th0);
  shape.moveTo(p[0], p[1]);
  for (let i = 1; i <= n; i++) { p = at(rOut, th0 + sweep * (i / n)); shape.lineTo(p[0], p[1]); }
  p = at(rIn, th0 + sweep); shape.lineTo(p[0], p[1]);
  for (let i = n - 1; i >= 0; i--) { p = at(rIn, th0 + sweep * (i / n)); shape.lineTo(p[0], p[1]); }
  shape.closePath();

  const h = y1 - y0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, h - 2 * BEVEL), bevelEnabled: true, bevelSegments: 1,
    bevelThickness: BEVEL, bevelSize: BEVEL, curveSegments: 1, steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  geo.translate(0, y0 - geo.boundingBox.min.y, 0);
  return { geo, th0, a: rOut * Math.sin(th0) };
}

// UVs for the drum courses. A planar projection would compress the texture
// to nothing where the wall turns away from its chosen axis, so the wall
// faces get UNROLLED: u is arc length along this vertex's own D-profile
// (chord in front of the clip, arc behind it — exact for the inner and outer
// surfaces alike), v is world height. Lids and soffits keep a planar (x, z).
function drumUV(geo, uw, vw, zc, zClip) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.72) { uv.setXY(i, x / uw, z / vw); continue; }
    const dz = z - zc;
    const r = Math.hypot(x, dz) || 1e-6;
    const th = Math.atan2(x, dz);
    const th0 = Math.acos(Math.max(-1, Math.min(1, (zClip - zc) / r)));
    const s = Math.abs(th) <= th0
      ? x
      : Math.sign(th) * (r * Math.sin(th0) + (Math.abs(th) - th0) * r);
    uv.setXY(i, s / uw, y / vw);
  }
  uv.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

const R_HULL = 0.055, R_TRIM = 0.030, R_THIN = 0.014;
// Eight centuries of settling, about z. Smaller than Heartwood's 0.7°: this
// is masonry, not a glued box, and at 12 units tall every tenth of a degree
// costs 0.02 of the socket's width at the crown.
const TILT = 0.2 * Math.PI / 180;

export function buildBastionSkin(v) {
  const M = maps();
  const rnd = mulberry32(0xba5710);
  const group = new THREE.Group();
  group.name = 'towerSkin';
  const stone = new THREE.Group();
  // NAME IS CONTRACT: __diceDebug.towerOcclusionCheck() treats every named
  // `towerSkin*` child of the skin as an OCCLUDER and everything unnamed
  // (veils, contact shadows) as proving nothing.
  stone.name = 'towerSkinStone';
  group.add(stone);

  const mat = (m, ns) => new THREE.MeshStandardMaterial({
    map: m.map, normalMap: m.normalMap, normalScale: new THREE.Vector2(ns, ns),
    roughnessMap: m.roughnessMap, roughness: 1, metalness: 0,
    envMapIntensity: 0.45, vertexColors: true,
  });
  const MAT = {
    granite: mat(M.granite, 0.7),
    rustic: mat(M.rustic, 0.85),
    sand: mat(M.sand, 0.55),
    sandFlat: mat(M.sandFlat, 0.45),
    // The arrow slit's floor. Not a light and not a hole — a dark stone that
    // the surround's own shadow finishes the job on.
    shadowStone: new THREE.MeshStandardMaterial({
      color: 0x14110d, roughness: 0.96, metalness: 0,
      envMapIntensity: 0.45, vertexColors: true,
    }),
  };
  // World units per texture tile. Non-square and non-integer against every
  // dimension in the model, so tiling never lands on a visible grid.
  const UV = { wall: [8.8, 8.8], plinth: [8.8, 8.8], trim: [4.3, 3.1], slab: [5.7, 4.1] };

  const parts = [];
  const add = (mesh) => {
    mesh.castShadow = true; mesh.receiveShadow = true;
    stone.add(mesh); parts.push(mesh); return mesh;
  };
  // The only way a box is made in this file (Heartwood's rule, and for the
  // same reason): stated as a min/max span so the contract arithmetic reads
  // straight off the page.
  const span = (matKey, x0, x1, y0, y1, z0v, z1v, opt = {}) => {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1v - z0v);
    const geo = roundedBox(w, h, d, opt.r !== undefined ? opt.r : R_TRIM, opt.seg || 1);
    if (opt.weather) weather(geo, w, h, d, rnd);
    const uv = opt.uv || UV.trim;
    planarUV(geo, uv[0], uv[1], rnd() * 0.4, rnd() * 0.4);
    const mesh = new THREE.Mesh(geo, MAT[matKey]);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0v + z1v) / 2);
    if (opt.rx) mesh.rotation.x = opt.rx;
    if (opt.ry) mesh.rotation.y = opt.ry;
    return add(mesh);
  };

  // --- contract arithmetic: every number below comes out of towerVolumes ---
  const S = v.S, z0 = v.z0;
  const boreR = v.shaft.r;                                  // Ø4.25 clear bore
  const boreZ = v.shaft.c[2];
  const zLim = v.socket.c[2] + v.socket.s[2] / 2;           // socket front face
  const xLim = v.socket.s[0] / 2;
  const yLim = v.socket.c[1] + v.socket.s[1] / 2;           // socket ceiling
  const cowlTop = v.cowl.c[1] + v.cowl.s[1] / 2;            // occlude to here
  const sill = v.hood.c[1] - v.hood.s[1] / 2;               // apron top at the door
  const doorX = v.door.w / 2;
  const doorY = v.door.h;

  const zFO = zLim - 0.01;                 // the facade's outer face
  const zFI = boreZ + boreR + 0.025;       // …and its inner one. 0.09 apart:
  const zFF = zFO - 0.03;                  // the field is recessed 0.03 behind
                                           // the quoins, which is all the
                                           // relief the socket can pay for.
  // THE DRUM AXIS sits 0.48·S in front of the bore's. Pushing it forward is
  // what buys the gateway its width: the front chord is
  // sqrt(rOut² − (zFO − zc)²), and every unit the axis moves toward the
  // player widens that chord and thickens the inner radius the bore demands.
  // At 0.48·S the chord clears the engine's own doorway (±2.5) by 0.08 —
  // the model never narrows the aperture; it opens wider than it.
  const zc = boreZ + 0.48 * S;
  const rIn = (zc - boreZ) + boreR + 0.06 * S;              // 2.80: contains the bore
  const rOut = rIn + 0.20 * S;                              // 3.05: the shaft
  // The courses are clipped BEHIND the facade by the bevel's own bulge, so
  // the widest thing on the model is still inside the socket. Everything the
  // clip exposes is covered by the facade slabs, which are boxes and do not
  // bulge.
  const zCl = zFO - BEVEL_BULGE;
  const chord = (r) => r * Math.sin(Math.acos((zCl - zc) / r));
  // Crown radii carry the bulge AND the lean: at y ≈ 12 a 0.2° tilt is
  // another 0.043 of x, and the socket's wall is at 3.25.
  const rPl1 = rOut + 0.12 * S, rPl2 = rOut + 0.088 * S, rPl3 = rOut + 0.04 * S;
  const rStr = rOut + 0.064 * S;                            // string course
  const rCor = rOut + 0.088 * S;                            // corbel table
  const rPar = rOut + 0.056 * S;                            // parapet

  // Elevation. The plinth stops just above the doorway sill; the parapet's
  // top is the embrasure floor and the merlons stand on it, capped under the
  // socket's ceiling.
  const yP1 = 0.00, yP2 = 0.44, yP3 = 0.80, yShaft = 1.16;
  const yStr0 = 6.45, yStr1 = 6.84;
  const yShaftTop = cowlTop - 0.45;          // 10.30
  const yCor0 = yShaftTop - 0.08, yCor1 = yShaftTop + 0.40;
  const yPar0 = yCor1 - 0.08, yPar1 = yLim - 0.55;          // 11.95
  const yMer1 = yLim - 0.08;                                // 12.42

  // --- THE DRUM: courses of ashlar, open across the front ------------------
  const course = (matKey, rO, rI, y0, y1, uv) => {
    const { geo } = drumCourse(rO, rI, y0, y1, zc, zCl);
    drumUV(geo, uv[0], uv[1], zc, zCl);
    const mesh = new THREE.Mesh(geo, MAT[matKey]);
    return add(mesh);
  };
  // BASE: three battered courses of rusticated block, each stepping in. A
  // stepped batter rather than a sloped one because the courses ARE the
  // batter — that is how a plinth is actually built, and a smooth taper
  // would have to be one extrusion with no course lines in it.
  course('rustic', rPl1, rIn, yP1, yP2 + 0.02, UV.plinth);
  course('rustic', rPl2, rIn, yP2, yP3 + 0.02, UV.plinth);
  course('rustic', rPl3, rIn, yP3, yShaft + 0.02, UV.plinth);
  // SHAFT: one tall drum. The gateway needs no cut — the course is open at
  // the front by construction, and its two radial end faces are the reveal.
  course('granite', rOut, rIn, yShaft, yShaftTop + 0.02, UV.wall);
  // A string course at two thirds height: the scale cue that tells the eye
  // how tall the drum is. It projects in RADIUS, which is legal everywhere
  // except dead ahead, where it shows by widening the facade instead.
  course('sand', rStr, rOut - 0.06, yStr0, yStr1, UV.trim);
  // CROWN: a corbel table oversailing the shaft, then the closed parapet.
  course('sand', rCor, rIn, yCor0, yCor1, UV.trim);
  course('granite', rPar, rIn, yPar0, yPar1, UV.wall);

  // --- THE FACADE: the flat gate front, filling the drum's opening ---------
  // Granite field recessed 0.03 behind sandstone quoins and bands. This is
  // the whole articulation the socket can afford here (see the file header),
  // and it is also what closes the SHAFT and the COWL: from the door head to
  // the parapet's top, unbroken.
  const aSh = chord(rOut), aStr = chord(rStr), aCor = chord(rCor), aPar = chord(rPar);
  span('granite', -aSh, aSh, doorY + 0.42, yStr0 + 0.02, zFI, zFF, { r: R_THIN, seg: 2, uv: UV.wall });
  span('sand', -aStr, aStr, yStr0 - 0.02, yStr1 + 0.02, zFI, zFO, { r: R_THIN, uv: UV.trim });
  span('granite', -aSh, aSh, yStr1 - 0.02, yShaftTop + 0.02, zFI, zFF, { r: R_THIN, seg: 2, uv: UV.wall });
  span('sand', -aCor, aCor, yCor0, yCor1, zFI, zFO, { r: R_THIN, uv: UV.trim });
  span('granite', -aPar, aPar, yPar0, yPar1, zFI, zFO, { r: R_THIN, seg: 2, uv: UV.wall });
  // Quoins: the warm stone up both angles of the facade, standing 0.03 proud
  // of the field. Colour is doing most of this work and that is honest —
  // quoins read as colour at fifteen units, not as relief.
  for (const s of [-1, 1]) {
    span('sand', s * (aSh - 0.26), s * aSh, doorY + 0.42, yShaftTop, zFI, zFO,
      { r: R_THIN, uv: UV.trim });
  }

  // --- THE GATEWAY --------------------------------------------------------
  // Two dressed buttresses standing OUTSIDE the engine's opening (x ≥ 2.5,
  // which is doorX): the frame is decorated, the aperture is not touched.
  // They also hide the seam where the flat facade meets the round shell.
  for (const s of [-1, 1]) {
    span('sand', s * (doorX + 0.02), s * (doorX + 0.54), 0, doorY + 0.80,
      z0 - 0.75, zFO, { r: R_TRIM, weather: true, uv: UV.trim });
    span('sandFlat', s * (doorX - 0.04), s * (doorX + 0.60), doorY + 0.80, doorY + 1.00,
      z0 - 0.82, zFO, { r: R_THIN, uv: UV.slab });
  }
  // The lintel, and above it the hood. THE ONE DEVIATION, stated plainly and
  // borrowed from Heartwood's: the hood reaches z0+0.90, past the socket's
  // face at z0+0.25. The engine's own HOOD volume runs to z0+1.25 and asks to
  // be shadowed; a gate cover flush with the wall shadows nothing. It sits
  // 3.9 units above the exit trajectory's start and carries no collider.
  span('sandFlat', -(doorX + 0.45), doorX + 0.45, doorY, doorY + 0.44, z0 - 0.35, zFO,
    { r: R_TRIM, uv: UV.slab });
  {
    const w = 2 * (doorX + 0.55), h = 0.34 * S, tilt = 14 * Math.PI / 180;
    const zBack = z0 + 0.05, zFront = v.hood.c[2] + v.hood.s[2] / 2 - 0.28 * S;
    const d = (zFront - zBack) / Math.cos(tilt);
    const geo = roundedBox(w, h, d, R_TRIM, 1);
    planarUV(geo, UV.slab[0], UV.slab[1], rnd() * 0.4, rnd() * 0.4);
    const hood = new THREE.Mesh(geo, MAT.sandFlat);
    hood.position.set(0, doorY + 0.62, (zBack + zFront) / 2);
    hood.rotation.x = tilt;
    add(hood);
  }
  // Corbels carrying the hood's ends — the detail that stops it floating.
  for (const s of [-1, 1]) {
    span('granite', s * (doorX + 0.06), s * (doorX + 0.46), doorY - 0.24, doorY + 0.46,
      z0 + 0.06, z0 + 0.62, { r: R_THIN, uv: UV.trim });
  }

  // --- THE ARROW SLIT: a recess, not a hole -------------------------------
  // On the front-left shoulder, where the wall has real thickness to be cut
  // into (the facade has 0.09 and cannot host a recess at all). Off-centre
  // and unanswered on the right: Heartwood's single iron bracket, in stone.
  {
    const th = -68 * Math.PI / 180;
    // Place a stone in the SHOULDER'S OWN FRAME: `tan` runs along the wall,
    // `rMid` is the radius of the box's centre. Writing it any other way
    // means trigonometry at four call sites instead of one.
    const put = (matKey, w, hh, dep, rMid, dy, tan = 0) => {
      const geo = roundedBox(w, hh, dep, R_THIN, 1);
      planarUV(geo, UV.trim[0], UV.trim[1], rnd() * 0.4, rnd() * 0.4);
      const m = new THREE.Mesh(geo, MAT[matKey]);
      m.rotation.y = th;
      m.position.set(rMid * Math.sin(th) + tan * Math.cos(th), dy,
        zc + rMid * Math.cos(th) - tan * Math.sin(th));
      return add(m);
    };
    const y0 = 4.95, y1 = 6.25, yc = (y0 + y1) / 2, hh = y1 - y0;
    // The floor of the recess: its face is 0.08 back from the wall's, and
    // 0.16 of wall still stands behind it. A ray that reaches this stone
    // stops on it — the slit is a recess, and the whole occlusion argument
    // depends on it never becoming a hole.
    put('shadowStone', 0.34, hh - 0.22, 0.10, rOut - 0.13, yc);
    for (const s of [-1, 1]) put('sand', 0.20, hh, 0.14, rOut - 0.05, yc, s * 0.27);
    put('sand', 0.74, 0.20, 0.16, rOut - 0.04, y1 + 0.02);   // head
    put('sand', 0.74, 0.16, 0.18, rOut - 0.03, y0 - 0.02);   // sill
  }

  // --- MERLONS: decoration on a closed ring -------------------------------
  // Distributed by ARC LENGTH around the parapet's own D-profile so the
  // teeth are evenly spaced whether they stand on the chord or the curve —
  // spacing them by angle would bunch them across the flat front.
  {
    const th0 = Math.acos((zCl - zc) / rPar);
    const arc = rPar * (2 * Math.PI - 2 * th0);
    const perim = 2 * aPar + arc;
    const N = 12, pitch = perim / N;
    const dep = 0.26, w = pitch * 0.63, h = yMer1 - yPar1;
    for (let k = 0; k < N; k++) {
      const s = -perim / 2 + (k + 0.5) * pitch;
      const geo = roundedBox(w, h, dep, R_TRIM, 1);
      planarUV(geo, UV.slab[0], UV.slab[1], rnd() * 0.4, rnd() * 0.4);
      const m = new THREE.Mesh(geo, MAT.sandFlat);
      if (Math.abs(s) <= aPar) {
        m.position.set(s, (yPar1 + yMer1) / 2, zFO - dep / 2);
      } else {
        const th = Math.sign(s) * (th0 + (Math.abs(s) - aPar) / rPar);
        const rm = rPar - dep / 2;
        m.position.set(rm * Math.sin(th), (yPar1 + yMer1) / 2, zc + rm * Math.cos(th));
        m.rotation.y = th;
      }
      add(m);
    }
  }

  // --- THE CHUTE AND THE TRAY, clad ---------------------------------------
  // Exactly on the engine's ramp and lip, so a die rides the stone it looks
  // like it is riding. Zero colliders: this is paint on a collider that
  // already exists.
  {
    const geo = roundedBox(v.apron.s[0], v.apron.s[1], v.apron.s[2], R_TRIM, 1);
    planarUV(geo, UV.slab[0], UV.slab[1] * 1.6, 0.1, 0.3);
    const chute = new THREE.Mesh(geo, MAT.granite);
    chute.position.set(...v.apron.c);
    chute.rotation.x = v.apron.rx;
    add(chute);
    // Cheeks, in the apron's own frame. They stop just outside the doorway:
    // anything raised further out on the felt is a wall a settled die walks
    // through, because a skin has no colliders to stop one.
    const ch = 0.34 * S, hw = v.apron.s[0] / 2;
    for (const s of [-1, 1]) {
      const g2 = roundedBox(0.30 * S, v.apron.s[1] * 0.55 + ch, v.apron.s[2] * 0.62, R_THIN, 1);
      planarUV(g2, UV.trim[0], UV.trim[1], rnd() * 0.4, rnd() * 0.4);
      const cheek = new THREE.Mesh(g2, MAT.granite);
      cheek.position.set(s * (hw + 0.13 * S),
        (v.apron.s[1] * 0.55 + ch) / 2 - v.apron.s[1] / 2 + v.apron.s[1] * 0.225,
        -v.apron.s[2] * 0.12);
      cheek.castShadow = true; cheek.receiveShadow = true;
      chute.add(cheek); parts.push(cheek);
    }
  }
  {
    // The tray: flush, no raised kerb, and the WARM stone — dice have to read
    // against whatever they come to rest on.
    const geo = roundedBox(v.lip.s[0] + 0.15, v.lip.s[1], v.lip.s[2] + 0.1, 0.07, 1);
    planarUV(geo, UV.slab[0], UV.slab[1], 0.55, 0.2);
    const tray = new THREE.Mesh(geo, MAT.sandFlat);
    tray.position.set(...v.lip.c);
    tray.rotation.x = v.lip.rx;
    add(tray);
  }

  bakeVertexAO(parts, group);

  // --- AO layer (b): the unlit near-black lining --------------------------
  // Everything above this point is lit stone; everything below is light that
  // never arrives. The lining is what a ray that gets past the shell would
  // hit, and it is what makes the gateway a hole into somewhere dark instead
  // of a hole into the felt behind the tower.
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a0806, side: THREE.DoubleSide });
  const lining = new THREE.Group();
  lining.name = 'towerSkinLining';
  {
    const rL = rIn - 0.02;
    const th0 = Math.acos(Math.max(-1, Math.min(1, (zFI - zc) / rL)));
    const yTop = yPar1, yBot = sill - 0.5;
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(rL, rL, yTop - yBot, 40, 1, true, th0, 2 * Math.PI - 2 * th0),
      dark);
    tube.position.set(0, (yTop + yBot) / 2, zc);
    lining.add(tube);
    // …and a flat back to the facade, from the door head up. It stops AT the
    // door head on purpose: an opaque plane across the gateway would make an
    // exiting die pop into existence at the wall instead of travelling out
    // of the dark, which is the doorway veil's job two layers down.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * aSh * 0.99, yTop - doorY), dark);
    back.position.set(0, (yTop + doorY) / 2, zFI - 0.012);
    lining.add(back);
  }
  group.add(lining);

  // --- AO layer (c): gradient veils ---------------------------------------
  const veilMat = () => new THREE.MeshBasicMaterial({
    map: M.veil, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  {
    // One lies on the chute at the bottom of the shaft (a die never gets
    // there — despawn is at v.despawnY, far above), one hangs in the doorway
    // so a die inside the tower is veiled until its own motion carries it out.
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(2 * rIn * 0.92, 3.6 * S), veilMat());
    pit.rotation.x = -Math.PI / 2 + v.apron.rx;
    const surfY = sill + (z0 - boreZ) * Math.tan(-v.exit.pitch);
    pit.position.set(0, surfY + 0.05, boreZ);
    group.add(pit);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * doorX + 0.4, doorY - sill + 1.0), veilMat());
    door.position.set(0, (doorY + sill) / 2 - 0.1, zFI - 0.02);
    group.add(door);
  }

  // --- AO layer (d): contact shadows, flat on the felt ---------------------
  {
    const shMat = () => new THREE.MeshBasicMaterial({
      map: M.shadow, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(2 * rPl1 + 2.4, 2 * rPl1 + 2.4), shMat());
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, 0.006, zc + 0.25);
    group.add(base);
    const trayShadow = new THREE.Mesh(new THREE.PlaneGeometry(v.lip.s[0] + 1.6, 2.0), shMat());
    trayShadow.rotation.x = -Math.PI / 2;
    trayShadow.position.set(0, 0.005, v.lip.c[2] + v.lip.s[2] / 2 + 0.35);
    group.add(trayShadow);
  }

  // Nothing this old is plumb. Z only, and small: a lean about x would push
  // the facade through the bore's front tangent, and there is no room there.
  group.rotation.z = TILT;
  group.userData.socketMaxZ = zFO;
  group.userData.xLim = xLim;
  return group;
}
