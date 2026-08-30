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
// shadows. `bakeStone` — ashlar courses in running bond, dropped joints,
// per-block value and temperature jitter, joint chipping by turbulence, with
// the height channel painted in the same pass — was written HERE and moved
// into the kit when the third tower (Black Anvil) needed coursed brick. What
// is new in this file now is the drum: `drumCourse` and its unrolled UVs.
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
  mulberry32, bakeStone, bakeEmber, veilTexture, clamp01,
  roundedBox, planarUV, weather, bakeVertexAO, weatherPass, mapsFromCanvases,
} from './towerskin.js';
import {
  bakeCloth, buildGonfalon, bakeShieldFace, buildHeaterShield, buildSconce,
  bakeCage, bakeLeaf, emberMaterial, bakeStainSheet, buildStains, grimePass, dustPass,
  instancedField, leafMaterial, gravityStain, mergeGeos, xform, propUV,
  registerSway, ensureColor,
} from './towerdress.js';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
// Two stones, three stops each, exactly like Heartwood's two species: a cool
// grey granite for the field and a warmer sandstone for every dressed edge.
// The mortar is a warm near-black — a recess is shadow, and shadow in a warm
// room is never #000.
// LOOKED AT, THEN FIXED. The first cut used a saturated buff for the dressed
// stone and the tower came back gilded — quoins, bands, lintel and merlons all
// read as polished brass on a brick box, which is the casino this tower is
// supposed to not be. Sandstone is a WARM GREY next to a cool one: the two
// stones must differ in temperature, not in chroma. The mortar went the same
// way — near-black at full strength printed a cartoon grid — so it is lighter
// now and blended at 0.8, and the joints themselves are half as wide.
const GRANITE = [[0x3e, 0x41, 0x46], [0x64, 0x68, 0x6d], [0x8a, 0x8e, 0x93]];
const SANDSTONE = [[0x57, 0x4e, 0x42], [0x7b, 0x70, 0x5f], [0x9e, 0x92, 0x7d]];
// (The mortar colour moved into towerskin.js with bakeStone — it is that
// function's default, and Bastion asks for no other.)

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
      joint: 0.010, relief: 1.8, chip: 0.8, wash: 0.26 }),
    // Dressed sandstone: fine joints, little chipping — this is the stone the
    // mason took time over.
    sand: bakeStone({ size: 256, stops: SANDSTONE, blocks: 6, courses: 12, seed: 0x71c308,
      joint: 0.0048, relief: 0.6, chip: 0.28, speckle: 0.03 }),
    // A single dressed slab: no joints at all, just grain (lintel, hood, caps).
    sandFlat: bakeStone({ size: 256, stops: SANDSTONE, blocks: 1, courses: 1, seed: 0x5a2b90,
      joint: 0.0026, relief: 0.35, chip: 0.25, speckle: 0.03, wash: 0.24 }),
    // Dressing bakes (js/towerdress.js): the sconce's painted cage and its
    // fire, and the leaves of the clump at the foot of the shaded flank.
    cage: bakeCage({ size: 128, seed: 0xba5ca9, bars: 8,
      stops: [[0x24, 0x22, 0x20], [0x46, 0x42, 0x3a], [0x7c, 0x74, 0x62]] }),
    coals: bakeEmber({ size: 128, seed: 0xba5f13, heat: 1.8 }),
    leaf: bakeLeaf({ size: 64, seed: 0xba51ea }),
    veil: veilTexture(256, 0.92),
    shadow: veilTexture(256, 0.55),
  };
  // The texel half of the aged base (see towerskin.js maps()): grime seated
  // in the mortar and block faces at full amount (Joe A/B'd it via the lime
  // proof and asked for the lime's coverage in stone's colours), pale dust
  // filmed over the dressed flats.
  for (const [pr, sd] of [[MAPS.granite, 0xba91], [MAPS.rustic, 0xba92], [MAPS.sand, 0xba93], [MAPS.sandFlat, 0xba94]]) {
    grimePass(pr.colorCanvas, pr.heightCanvas, { seed: sd, amount: 2.3 });  // Joe: even more wear
  }
  dustPass(MAPS.sand.colorCanvas, MAPS.sand.heightCanvas, { seed: 0xba96, amount: 1.5 });
  dustPass(MAPS.sandFlat.colorCanvas, MAPS.sandFlat.heightCanvas, { seed: 0xba95, amount: 1.6 });
  for (const [pr, sd] of [[MAPS.granite, 0xba91], [MAPS.rustic, 0xba92], [MAPS.sand, 0xba93], [MAPS.sandFlat, 0xba94]]) {
    Object.assign(pr, mapsFromCanvases(pr.colorCanvas, pr.heightCanvas, sd));
  }
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

// Bevel radius scales with the part: chunky on dressed stone, hairline on
// anything sitting in the facade's 0.09 of depth.
const R_TRIM = 0.030, R_THIN = 0.014;
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
    granite: mat(M.granite, 0.5),
    rustic: mat(M.rustic, 0.62),
    sand: mat(M.sand, 0.42),
    sandFlat: mat(M.sandFlat, 0.35),
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
  // THE PANEL THE ARROW LOOP LIVES IN IS CUT AROUND IT — four slabs, not one.
  // THE BUG THIS FIXES (docs/TOWER.md, third model, finding four): the slot
  // was a `shadowStone` slab sunk 0.012 BEHIND a granite field slab that
  // spanned the same x and the same y. Sinking something behind an opaque
  // thing that covers it does not make a recess; it makes it invisible. The
  // loop read as a sandstone surround with plain wall inside it, which is a
  // picture frame. Black Anvil cut its facade into panels around the grate
  // and the vent for exactly this reason, and now so does this.
  const loopX = -0.92, loopW = 0.22, loopY0 = 7.15, loopY1 = 9.05;
  const loopJ = 0.13;                       // jamb/head width of the surround
  const lxa = loopX - loopW / 2 - loopJ, lxb = loopX + loopW / 2 + loopJ;
  const lya = loopY0 - loopJ, lyb = loopY1 + loopJ;
  span('granite', -aSh, lxa, yStr1 - 0.02, yShaftTop + 0.02, zFI, zFF, { r: R_THIN, seg: 2, uv: UV.wall });
  span('granite', lxb, aSh, yStr1 - 0.02, yShaftTop + 0.02, zFI, zFF, { r: R_THIN, seg: 2, uv: UV.wall });
  span('granite', lxa, lxb, yStr1 - 0.02, lya, zFI, zFF, { r: R_THIN, uv: UV.wall });
  span('granite', lxa, lxb, lyb, yShaftTop + 0.02, zFI, zFF, { r: R_THIN, uv: UV.wall });
  span('sand', -aCor, aCor, yCor0, yCor1, zFI, zFO, { r: R_THIN, uv: UV.trim });
  span('granite', -aPar, aPar, yPar0, yPar1, zFI, zFO, { r: R_THIN, seg: 2, uv: UV.wall });
  // Quoins: the warm stone up both angles of the facade, standing 0.03 proud
  // of the field. Colour is doing most of this work and that is honest —
  // quoins read as colour at fifteen units, not as relief.
  for (const s of [-1, 1]) {
    span('sand', s * (aSh - 0.26), s * aSh, doorY + 0.42, yShaftTop, zFI, zFO,
      { r: R_THIN, uv: UV.slab });
  }

  // --- THE GATEWAY --------------------------------------------------------
  // Two dressed buttresses standing OUTSIDE the engine's opening (x ≥ 2.5,
  // which is doorX): the frame is decorated, the aperture is not touched.
  // They also hide the seam where the flat facade meets the round shell.
  for (const s of [-1, 1]) {
    span('sand', s * (doorX + 0.02), s * (doorX + 0.54), 0, doorY + 0.80,
      z0 - 0.75, zFO, { r: R_TRIM, weather: true, uv: UV.slab });
    span('sandFlat', s * (doorX - 0.04), s * (doorX + 0.60), doorY + 0.80, doorY + 1.00,
      z0 - 0.82, zFO, { r: R_THIN, uv: UV.slab });
  }
  // The lintel, and above it the hood. THE ONE DEVIATION, stated plainly and
  // borrowed from Heartwood's: the hood reaches z0+0.90, past the socket's
  // face at z0+0.25. The engine's own HOOD volume runs to z0+1.25 and asks to
  // be shadowed; a gate cover flush with the wall shadows nothing. It sits
  // 3.9 units above the exit trajectory's start and carries no collider.
  span('sand', -(doorX + 0.45), doorX + 0.45, doorY, doorY + 0.30, z0 - 0.35, zFO,
    { r: R_TRIM, uv: UV.slab });
  {
    const w = 2 * (doorX + 0.28), h = 0.26 * S, tilt = 14 * Math.PI / 180;
    const zBack = z0 + 0.05, zFront = v.hood.c[2] + v.hood.s[2] / 2 - 0.44 * S;
    const d = (zFront - zBack) / Math.cos(tilt);
    const geo = roundedBox(w, h, d, R_TRIM, 1);
    planarUV(geo, UV.slab[0], UV.slab[1] * 0.6, rnd() * 0.4, rnd() * 0.4);
    const hood = new THREE.Mesh(geo, MAT.sand);
    hood.position.set(0, doorY + 0.52, (zBack + zFront) / 2);
    hood.rotation.x = tilt;
    add(hood);
  }
  // Corbels carrying the hood's ends — the detail that stops it floating.
  for (const s of [-1, 1]) {
    span('granite', s * (doorX + 0.06), s * (doorX + 0.46), doorY - 0.24, doorY + 0.46,
      z0 + 0.06, z0 + 0.62, { r: R_THIN, uv: UV.trim });
  }

  // --- THE ARROW SLIT: a recess, not a hole -------------------------------
  // LOOKED AT, THEN MOVED. The first cut put it on the front-left shoulder,
  // where the wall is 0.36 thick and a real 0.10 recess fits. It was
  // invisible: the shoulder begins only 10° past the facade's edge, so from
  // every shipped eye it is nearly edge-on. So the slit lives on the FACADE
  // instead, and reads the way an arrow slit actually reads at fifteen
  // units — as a dark slot in a grey wall. Value, not depth: the surround is
  // the 0.03 the socket allows plus the sandstone's own step, and the slot
  // itself is a near-black stone sunk another 0.04 behind it.
  //
  // IT IS STILL NOT A HOLE, and that is load-bearing: it sits inside the
  // COWL band, where a single leaked ray is a die seen vanishing. The slot's
  // stone is opaque and the facade slab stands behind it, so a ray that gets
  // through the sandstone surround stops on one or the other.
  //
  // Off-centre, and nothing on the right answers it — Heartwood's single iron
  // bracket, in stone.
  //
  // WHAT MAKES IT A RECESS NOW: the field is CUT around it (above), so the
  // slot's near-black stone is genuinely the backmost surface in that hole,
  // and the sandstone surround stands 0.06 in FRONT of the slot rather than
  // 0.012 behind the field. Value and a real shadow line, in the 0.09 of
  // depth the contract leaves — which is how an arrow loop reads at fifteen
  // units anyway.
  //
  // IT IS STILL NOT A HOLE, and that is load-bearing: it sits inside the
  // COWL band, where a single leaked ray is a die seen vanishing. The slot's
  // stone is opaque and the unlit `towerSkinLining` stands behind it, so a
  // ray that gets through the sandstone surround stops on one or the other.
  {
    const sx = loopX, w = loopW, y0 = loopY0, y1 = loopY1;
    const jamb = loopJ, head = loopJ;
    // The slot itself, at the BACK of the facade's depth.
    span('shadowStone', sx - w / 2, sx + w / 2, y0, y1, zFI, zFI + 0.024,
      { r: R_THIN, uv: UV.trim });
    for (const s of [-1, 1]) {
      span('sand', sx + s * (w / 2), sx + s * (w / 2 + jamb), y0 - head, y1 + head,
        zFI, zFO, { r: R_THIN, uv: UV.trim });
    }
    span('sand', sx - (w / 2 + jamb), sx + (w / 2 + jamb), y1, y1 + head, zFI, zFO,
      { r: R_THIN, uv: UV.trim });
    span('sand', sx - (w / 2 + jamb), sx + (w / 2 + jamb), y0 - head, y0, zFI, zFO,
      { r: R_THIN, uv: UV.trim });
  }

  // --- MERLONS: decoration on a closed ring -------------------------------
  let brokenMerlonX = 0;      // held: the water runs hardest through the gap
  // Distributed by ARC LENGTH around the parapet's own D-profile so the
  // teeth are evenly spaced whether they stand on the chord or the curve —
  // spacing them by angle would bunch them across the flat front.
  {
    const th0 = Math.acos((zCl - zc) / rPar);
    const arc = rPar * (2 * Math.PI - 2 * th0);
    const perim = 2 * aPar + arc;
    const N = 12, pitch = perim / N;
    const dep = 0.26, w = pitch * 0.63, hFull = yMer1 - yPar1;
    // ONE TOOTH IS GONE — k = 4, which lands at s ≈ −2.31: on the front face,
    // off centre, and not the one beside it. The cheapest history in the set,
    // and it is only cheap if it is asymmetric; a symmetric pair of stumps
    // reads as a design. What is left is a knee-high stump of the CORE stone
    // (granite, not the dressed sandstone), weathered, because a merlon that
    // has come off takes its dressing with it and leaves rubble.
    const BROKEN = 4;
    for (let k = 0; k < N; k++) {
      const broke = k === BROKEN;
      const h = broke ? hFull * 0.38 : hFull;
      const s = -perim / 2 + (k + 0.5) * pitch;
      const geo = roundedBox(w, h, dep, R_TRIM, 1);
      if (broke) weather(geo, w, h, dep, rnd);
      planarUV(geo, UV.slab[0], UV.slab[1], rnd() * 0.4, rnd() * 0.4);
      const m = new THREE.Mesh(geo, broke ? MAT.granite : MAT.sand);
      if (Math.abs(s) <= aPar) {
        m.position.set(s, yPar1 + h / 2, zFO - dep / 2);
      } else {
        const th = Math.sign(s) * (th0 + (Math.abs(s) - aPar) / rPar);
        const rm = rPar - dep / 2;
        m.position.set(rm * Math.sin(th), yPar1 + h / 2, zc + rm * Math.cos(th));
        m.rotation.y = th;
      }
      add(m);
      if (broke) brokenMerlonX = Math.abs(s) <= aPar ? s : m.position.x;
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
    const tray = new THREE.Mesh(geo, MAT.sand);
    tray.position.set(...v.lip.c);
    tray.rotation.x = v.lip.rx;
    add(tray);
  }

  // =========================================================================
  // THE DRESSING (docs/TOWER.md, DRESSING). Five props, one bold: a gonfalon
  // off the battlement, a THIRD of the way across rather than centred, so the
  // one silhouette break makes the outline asymmetric instead of confirming
  // that it is not. Two shields with DIFFERENT devices (two devices are two
  // people; a matched pair is wallpaper), a lit sconce beside the arrow loop
  // for the darkest-dark/lightest-light adjacency that pins a focal point,
  // one broken merlon with one fresh mortar patch far below it, and water
  // running down out of the crenel gaps because gravity governs weathering.
  // =========================================================================
  const dress = new THREE.Group();
  dress.name = 'towerSkinDress';
  group.add(dress);
  const fx = new THREE.Group();
  fx.name = 'towerDressFx';
  group.add(fx);
  const addDress = (mesh, cast = true) => {
    ensureColor(mesh.geometry);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    dress.add(mesh); parts.push(mesh); return mesh;
  };

  // --- 1. THE GONFALON — the one bold silhouette break ---------------------
  // It HANGS from a crossbar bracketed to the merlons rather than flying from
  // a pole, and that is arithmetic, not taste: the socket's ceiling is y 12.5
  // and the merlons already cap at 12.42, so a pole is a prop through the
  // roof of the room. A banner hanging down the face is the same silhouette
  // read from the one camera this table has.
  //
  // Cloth, not sheet metal, and the difference is two corrections most fold
  // fields skip: it PULLS IN as it folds (the material goes into the fold),
  // and its free hem SCALLOPS between the folds. See buildGonfalon.
  const gonX = 1.75;
  {
    const clothTex = bakeCloth({
      size: 256, seed: 0xba5f1a, hemBand: 0.14,
      // RULE OF TINCTURE, which is a legibility constraint and not a
      // flourish: metal on colour or colour on metal, never like on like.
      // Azure field, a chief Or, a mullet Argent. No beasts — a beast
      // silhouette does not survive 84 px, and this is 55.
      arms: {
        field: 'azure', division: 'chief', divTincture: 'or',
        charge: 'mullet', chargeTincture: 'argent', chargeY: 0.60, chargeScale: 0.46,
      },
    });
    const clothMat = new THREE.MeshStandardMaterial({
      map: clothTex.map, normalMap: clothTex.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: clothTex.roughnessMap, roughness: 1, metalness: 0,
      // ALPHA TEST, NEVER `transparent` — the frayed hem stays in the opaque
      // list and cannot sort wrong against the masonry behind it.
      alphaTest: 0.5, transparent: false, side: THREE.DoubleSide,
      envMapIntensity: 0.45, vertexColors: true,
    });
    const barY = 12.16, barZ = zFO + 0.075, w = 1.34, h = 2.78;
    const bar = new THREE.Mesh(mergeGeos([
      { geo: propUV(roundedBox(w + 0.30, 0.075, 0.075, 0.018, 1), 1.0),
        matrix: xform({ pos: [0, 0, 0] }) },
      { geo: propUV(roundedBox(0.06, 0.06, 0.16, 0.016, 1), 0.6),
        matrix: xform({ pos: [-w / 2 - 0.05, -0.02, -0.10] }) },
      { geo: propUV(roundedBox(0.06, 0.06, 0.16, 0.016, 1), 0.6),
        matrix: xform({ pos: [w / 2 + 0.05, -0.02, -0.10] }) },
    ]), MAT.sandFlat);
    bar.position.set(gonX, barY, barZ);
    addDress(bar);

    const swing = new THREE.Group();
    swing.position.set(gonX, barY - 0.05, barZ + 0.01);
    dress.add(swing);
    const cloth = buildGonfalon({ w, h, seed: 0xba5c10, material: clothMat });
    cloth.position.set(0, -h / 2, 0);
    ensureColor(cloth.geometry);
    swing.add(cloth); parts.push(cloth);
    // 2.5° about the bar and 1.5° across it, out of phase and not harmonic.
    // Tip travel ≈ 5 px at the resting eye: an indoor room has no wind, and a
    // flag that snaps is a flag in a different game.
    registerSway(group, swing, { amp: 1.5 * Math.PI / 180, hz: 0.055, phase: 0.4, axis: 'z' });
    registerSway(group, swing, { amp: 2.5 * Math.PI / 180, hz: 0.043, phase: 2.2, axis: 'x' });
  }

  // --- 2. TWO SHIELDS, TWO HOUSES ------------------------------------------
  // Unequal sizes, unequal heights, left of the doorway and clear of the
  // string course, and never below y 5.2 — the exit lane runs out under
  // them. A heater shield is dished, so its normals are ROTATED analytically
  // rather than recomputed (G7); and its point is drawn short by the bevel's
  // own overshoot, which at a 40° tip is nearly three times the bevel (G6).
  for (const sh of [
    { w: 0.80, x: -2.02, y: 5.74, seed: 0xba5111,
      arms: { field: 'gules', charge: 'tower', chargeTincture: 'or', chargeScale: 0.56 } },
    { w: 0.62, x: -1.20, y: 6.02, seed: 0xba5222,
      arms: { field: 'argent', charge: 'cross', chargeTincture: 'sable', chargeScale: 0.62 } },
  ]) {
    const face = bakeShieldFace({ size: 256, seed: sh.seed, arms: sh.arms });
    const m = buildHeaterShield({
      w: sh.w, seed: sh.seed,
      material: new THREE.MeshStandardMaterial({
        map: face.map, normalMap: face.normalMap, normalScale: new THREE.Vector2(0.5, 0.5),
        roughnessMap: face.roughnessMap, roughness: 1, metalness: 0,
        envMapIntensity: 0.45, vertexColors: true,
      }),
    });
    m.position.set(sh.x, sh.y, zFF);
    addDress(m);
  }

  // --- 3. THE SCONCE — the family trait, beside the loop -------------------
  // The registry's `ember` row lights it. Put next to the darkest thing on
  // the tower on purpose: the loop's near-black slot and a live flame within
  // half a unit of each other is the strongest value contrast the model has,
  // and that is what makes a focal point rather than a bright spot.
  const sconceX = -0.38, sconceY = 7.98;
  {
    const cageMat = new THREE.MeshStandardMaterial({
      map: M.cage.map, normalMap: M.cage.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: M.cage.roughnessMap, roughness: 1, metalness: 0.35,
      envMapIntensity: 0.45, vertexColors: true,
    });
    const s = buildSconce({
      seed: 0xba53c0, cageMat, fireMat: emberMaterial(M.coals, 1.6),
      r: 0.22, bowlH: 0.30, out: 0.30,
    });
    s.group.position.set(sconceX, sconceY, zFO);
    dress.add(s.group);
    for (const p of s.parts) { p.castShadow = true; p.receiveShadow = true; parts.push(p); }
  }

  // --- 4. THE REPAIR, far below the failure --------------------------------
  // A patch of fresh, pale mortar-and-stone low on the LEFT gateway
  // buttress — outside |x| 2.5, so it is nowhere near the aperture — against
  // the broken merlon eight units above it. Repair plus failure is what sets
  // a timescale: somebody maintains this, and somebody has not got to that.
  {
    const patch = new THREE.Mesh(
      planarUV(roundedBox(0.40, 0.58, 0.03, R_THIN, 1), UV.trim[0], UV.trim[1], 0.2, 0.6),
      new THREE.MeshStandardMaterial({
        map: M.sandFlat.map, normalMap: M.sandFlat.normalMap,
        normalScale: new THREE.Vector2(0.28, 0.28),
        roughnessMap: M.sandFlat.roughnessMap, roughness: 1, metalness: 0,
        color: 0xcfc7b4, envMapIntensity: 0.45, vertexColors: true,
      }));
    patch.position.set(-2.80, 2.42, zFO + 0.012);
    addDress(patch);
  }

  // --- 5. WEATHERING — water out of the gaps, growth at the foot -----------
  // Rain leaves a castle through the crenel gaps, so the streaks start at the
  // embrasure floor and run DOWN over the corbel table. They are alpha-tested
  // quads merged into ONE geometry sharing ONE canvas of three different
  // streaks, because five little planes are five draw calls and a tiling wall
  // texture cannot know where the gaps are.
  {
    const tex = bakeStainSheet({
      size: 256, seed: 0xba57a1,
      cells: [
        { stops: [[0x2a, 0x2c, 0x26], [0x3d, 0x40, 0x36], [0x55, 0x58, 0x4c]], lanes: 3, width: 0.20, reach: 0.85 },
        { stops: [[0x26, 0x29, 0x24], [0x38, 0x3c, 0x32], [0x4e, 0x52, 0x45]], lanes: 2, width: 0.26, reach: 0.72 },
        { stops: [[0x2d, 0x2e, 0x27], [0x42, 0x44, 0x39], [0x5b, 0x5d, 0x50]], lanes: 4, width: 0.14, reach: 0.95 },
      ],
    });
    const yTop = yPar1 - 0.02;
    const defs = [
      // The widest run is under the tooth that is MISSING — the gap is twice
      // as wide there and so is the stain. Gravity plus the story, together.
      { cell: 1, w: 0.90, h: 2.25, pos: [brokenMerlonX, yTop, zFO + 0.014] },
      { cell: 0, w: 0.52, h: 1.85, pos: [-1.54, yTop, zFO + 0.014] },
      { cell: 2, w: 0.46, h: 1.55, pos: [1.54, yTop, zFO + 0.014] },
      { cell: 0, w: 0.44, h: 1.20, pos: [0.02, yTop, zFO + 0.014] },
      // …and one long one off the string course, which is the other lip on
      // the model that sheds water.
      { cell: 2, w: 0.62, h: 1.70, pos: [-2.10, yStr0 - 0.02, zFO + 0.010] },
    ];
    const stains = buildStains({ defs, cells: 3, tex });
    addDress(stains, false);
  }
  {
    // Growth at the foot of the shaded flank: no stems, because this is not a
    // climb — it is the twenty-year-old clump every wall has at ground level
    // where the damp is. Clustered on ONE side; nothing answers it.
    const rndL = mulberry32(0xba5133);
    const items = [];
    const up = new THREE.Vector3(0, 0, 1);
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), d3 = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const t = rndL();
      const x = -3.02 + rndL() * 1.10;
      const y = 0.12 + Math.pow(rndL(), 1.7) * 1.9;
      const s = 0.14 + rndL() * 0.11;
      d3.set(0, 0.30 + rndL() * 0.3, 1).normalize();
      q.setFromUnitVectors(up, d3);
      q2.setFromAxisAngle(d3, (rndL() - 0.5) * 1.0);
      items.push({
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, zFO + 0.02 + rndL() * 0.05),
          q2.multiply(q), new THREE.Vector3(s, s, s)),
        tint: [(0x3a + 0x24 * t) / 255, (0x54 + 0x1c * t) / 255, (0x22 + 0x14 * t) / 255],
      });
    }
    fx.add(instancedField({
      geo: new THREE.PlaneGeometry(1, 1), material: leafMaterial(M.leaf),
      items, name: 'dressWallGrowth',
    }));
  }

  bakeVertexAO(parts, group);

  // The aged base: stone takes more GRIME than edge — its arrises are
  // already chipped in the tile, so the vertex layer's job is the deposit in
  // every mortar course and part joint, plus dust on the battlement tops and
  // corbel ledges. Weather side matches the ivy's shaded flank.
  weatherPass(parts, {
    edge: 1.0, grime: 1.1, dust: 0.85, drift: 0.12, weatherSide: -1,  // Joe: even more, edges way up
    edgeGate: (p, n) => 0.55 + 0.45 * clamp01(0.5 - 0.5 * n.x)
      * (0.3 + 0.7 * clamp01(1 - Math.abs(p.y - 3) / 6)),
  });

  // --- WEATHERING IN THE VERTEX COLOURS, after the AO bake -----------------
  // Damp at the base, a green cast on the shaded flank, and nothing above.
  // World space, so it knows where the ground is — which a tile that repeats
  // every 8.8 units does not.
  gravityStain(parts, (p, n, out) => {
    const damp = clamp01(1 - p.y / 2.1);
    const shade = clamp01(-n.x) * clamp01(1 - p.y / 4.5) * 0.6;
    const k = Math.max(damp * 0.85, shade);
    if (k < 0.02) return false;
    out[0] = 1 - 0.15 * k; out[1] = 1 - 0.07 * k; out[2] = 1 - 0.19 * k;
    return true;
  });

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
