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

// BLACK ANVIL — the third tower skin (docs/TOWER.md), and the Emberforge
// family's: a cooling forge chimney. Dice fall down a foundry stack and come
// out ringing. Zero colliders, zero lights, and it never reads or writes the
// film; every number below comes out of `towerVolumes()`, so a retune of S,
// the mat or the zoom ladder moves the model with the contract.
//
// The kit is Heartwood's and Bastion's, imported rather than forked
// (js/towerskin.js exports it): seeded tileable noise, the Sobel
// height→normal pass, roughness off the same height field, `bakeStone` for
// coursed masonry, rounded boxes, planar UVs, the raycast vertex-AO bake, the
// unlit near-black lining, gradient veils, contact shadows. What is new here
// is `bakeMetal` — plate pitting, verdigris, rivet bosses in the height
// channel. `bakeEmber` (the coal bed, which paints a fourth canvas) was
// written here and MOVED into the kit when the dressing pass lit a cresset on
// Heartwood and a sconce on Bastion: a warm focal light is the family trait,
// so the bake that makes one is everybody's.
//
// THE GLOW IS THE FEATURE, AND IT IS THE ONLY GLOW THE HOUSE ALLOWS. No
// lights, no bloom, no ShaderMaterial: an `emissiveMap` on a
// MeshStandardMaterial, baked from the same seeded canvas pass as everything
// else — ember cracks between banked coals, not a flat orange. It is dim on
// purpose (grate 0.90, shaft vent 0.50, over a bake whose own heat envelope
// leaves most of the bed dead). Coals at rest.
//
// ---------------------------------------------------------------------------
// §1.5 THE FREE VOLUME, MEASURED BEFORE ANYTHING WAS DRAWN
// ---------------------------------------------------------------------------
// At S = 1.25, every z relative to z0:
//
//   socket          x ±3.25 · y 0…12.5 · z z0−5.25 … z0+0.25
//   bore            r 2.125 about (0, z0−2.0) → front tangent z0+0.125
//   doorway (clear) |x| ≤ 2.5, y ≤ 4.5, from the apron top at y = 1.0
//   entry drop      y = 11.25, aim |x| ≤ 0.5, die radius ≤ 1.25
//   despawn         y = 7.0 · SHAFT band sampled 7.0 / 7.25 / 7.6
//   COWL band       y 7.75 … 10.75, sampled to r 2.0 about the bore axis
//   HOOD volume     x ±2.875 · y 1.0…4.0 · z z0 … z0+1.25
//
// Five things the settled brief asked for that the numbers refused, each
// resolved before a line of geometry was written:
//
//  1. "A furnace grate in the BASE, front and centre." The base's front IS
//     the doorway — the whole of |x| ≤ 2.5 below y = 4.5 must stay clear, and
//     decorating a frame is not narrowing an aperture. So the grate sits
//     immediately ABOVE the door head, inside the anvil block's own mass,
//     where the block still reads as base. A furnace taps low and burns high;
//     the casting channel below the firebox is the honest arrangement anyway.
//  2. "Recessed." On the facade a recess is 0.07, not 0.3 — the bore's front
//     tangent is z0+0.125 and the socket's face is z0+0.25, and 0.09 of that
//     0.125 is usable. The grate therefore reads by VALUE (black bars over a
//     glowing bed) rather than by depth, which is how it would read at
//     fifteen units anyway. Bastion learned this after drawing; this file
//     learned it before.
//  3. "A tapering stack." The taper budget is 0.1 per side: the interior can
//     never come inside r 2.125 (dice fall through it) and the socket wall is
//     at 3.25. So the STEP is at the block→chimney shoulder — 3.04 down to
//     2.62 under an oversailing cap — and the stack itself only breathes in.
//  4. "A square or octagonal chimney." Refused as a closed prism: an octagon
//     with a front facet thick enough to exist needs an inradius past
//     z0+0.25. Same answer Bastion's drum got — a shell OPEN at the front,
//     with a flat facade slab closing it in the 0.09 the contract leaves.
//  5. "Riveted straps." Real rivet bosses need depth the facade has not got.
//     They live in the band bake's HEIGHT channel instead and read by
//     normal-map lighting. Only the shoulders (|x| > 2.125, where depth is
//     free) carry relief the eye can measure — which is also where the
//     silhouette is, so nothing is lost.
//
// A VENT IS A RECESS, NEVER A HOLE — AND THE RED CHECK SAID WHICH LAYER IS
// LOAD-BEARING. The shaft vent sits inside the COWL band, where one leaked
// ray is a die seen vanishing. The facade is CUT around it and the cut is
// filled by an opaque emissive bed, so the eye sees coals rather than a
// hole. But DELETING THE BED LEAVES THE BAND AT 99/99 — measured — because
// the unlit lining stands a hand's width behind and catches every ray the
// bed would have. Two consequences worth writing down for whoever edits this
// next:
//   · the bed is the PICTURE; the lining is the OPACITY. Shortening
//     `towerSkinLining` below yCrTop is the edit that would turn this vent
//     into a real leak, and no amount of bed will save it.
//   · with the lining also removed the check goes red at all six eyes
//     (cowl 142–144 / 147, and 96–97 / 99 at the shipped sampling), so the
//     proof CAN see a hole of this size and shape. The green above is a
//     comparison that happened, not one that could not fail.

import * as THREE from 'three';
import {
  mulberry32, hash2, fbm, turb, clamp01, smoothstep, ramp3,
  heightToNormal, roughFromHeight, veilTexture,
  roundedBox, planarUV, weather, bakeVertexAO, weatherPass, bakeStone, bakeEmber,
} from './towerskin.js';
import {
  buildHorseshoe, buildChainHanger, bakeSmoke, buildSmokePlume,
  bakeStainSheet, buildStains, instancedField, gravityStain,
  mergeGeos, xform, propUV, registerSmoke, ensureColor, R_PROP,
} from './towerdress.js';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
// Charcoal and soot, and NEVER pure black — the house rule, and also the only
// way a dark tower keeps a silhouette against a dark room. Three darks that
// differ in TEMPERATURE rather than in value, which is what stops the model
// reading as one black blob: the stone is warm, the iron is neutral-cool, the
// fire-brick is browner and a step lighter so the stack separates from the
// block it stands on.
//
// LOOKED AT, THEN DARKENED — TWICE THE LESSON BASTION LEARNED ON CHROMA.
// The first cut ran the brick at a mid brown (mean 0x54) and the tower came
// back a garden-wall chimney with a fire in it: the stack was the brightest
// thing on the table, so the eye read the tower as BRICK and the forge as a
// detail. A foundry stack that has been fired is nearly black and its value
// range lives in the bottom third. Every ramp below dropped by roughly a
// third, and the brick furthest of all — it is now only just lighter than
// the stone it stands on, which is exactly the separation it needs and no
// more.
const SOOT = [[0x28, 0x24, 0x21], [0x3e, 0x39, 0x33], [0x59, 0x52, 0x49]];
const IRON = [[0x24, 0x23, 0x23], [0x3b, 0x3a, 0x39], [0x59, 0x56, 0x53]];
const BRICK = [[0x2a, 0x20, 0x1b], [0x3e, 0x30, 0x28], [0x5c, 0x48, 0x3b]];
// Oxidised bronze — the Emberforge family's trim accent, and the one thing on
// the model that is lighter than the room. It is deliberately LOW-CHROMA and
// carries verdigris: Bastion's ledger records a saturated buff reading as
// polished brass on a brick box, which is the casino this tower exists not to
// be. Oxidised metal is a warm grey with green in it, not gold.
const BRONZE = [[0x2e, 0x28, 0x1e], [0x49, 0x3f, 0x2e], [0x64, 0x58, 0x42]];
const VERDIGRIS = [0x4c, 0x67, 0x59];
// Foundry sand for the delivery run. It is the lightest thing here and that
// is functional, not decorative: Emberforge dice are black iron, and a die
// has to read against whatever it comes to rest on (Bastion's tray note).
// Pulled greyer than Bastion's sandstone so the two families' trays do not
// look like the same quarry. …and it came down with everything else in the
// second pass: at mean 0x76 the delivery run was a white slab that owned the
// frame, the brightest object on a dark table, and a tower's tray should not
// be the first thing seen. Mean 0x62 still gives a black-iron die something
// to read against, which is the only reason it is light at all.
const SAND = [[0x45, 0x41, 0x3a], [0x62, 0x5d, 0x54], [0x80, 0x7a, 0x6f]];
// Mortar/joint colours. A recess is shadow; shadow in a warm room is never
// #000. Fire-brick is laid in a pale ash-lime mortar — lighter than the brick,
// the opposite of the stone's — and that contrast is most of what says "kiln".
const SOOT_JOINT = [0x22, 0x1e, 0x1a];
const BRICK_JOINT = [0x4a, 0x44, 0x3c];
// (The coal bed's own ramp — char → dull red → the hot crack, the third stop
// short of white on purpose because white is a lava lamp — moved into
// js/towerskin.js with `bakeEmber` when the dressing pass gave every tower a
// warm light. It is that function's default and this file asks for no other.)

// ---------------------------------------------------------------------------
// bakeMetal — plate, pitting, verdigris and rivets, in one pass
// ---------------------------------------------------------------------------
// bakeStone draws things that are LAID. Metal is ROLLED: no courses, no
// mortar, no running bond. What it has instead is
//   · a broad hammer/roll undulation, so the plate is never optically flat;
//   · pitting — dark corrosion cells at two frequencies, in the colour AND
//     the height, because a pit that is only painted reads as dirt;
//   · verdigris, for the bronze: low-frequency patches pulled toward a green
//     grey. Patchy, never uniform — a uniformly green bronze is a statue and
//     this is hardware;
//   · RIVETS in the height channel only, one row at v = 0.5, `rivets` to a
//     tile. The caller maps v so the row lands on the band's centreline
//     (see `bandUV`), which is how a 0.09-deep facade gets rivet heads at
//     all — they are lighting, not geometry (§1.5 note 5).
function bakeMetal({ size, stops, seed, rivets = 0, patina = 0,
  pit = 0.5, sheen = 0.06 }) {
  const W = size;
  const cCan = document.createElement('canvas'); cCan.width = cCan.height = W;
  const hCan = document.createElement('canvas'); hCan.width = hCan.height = W;
  const cImg = cCan.getContext('2d').createImageData(W, W);
  const hImg = hCan.getContext('2d').createImageData(W, W);

  for (let py = 0; py < W; py++) {
    const vv = py / W;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      // Value: a broad roll undulation plus mid-frequency mottle.
      const roll = fbm(u * 2.4, vv * 1.7, 2, 3, seed + 11);
      const mot = fbm(u * 9, vv * 9, 9, 4, seed + 23);
      let t = clamp01(0.22 + 0.46 * roll + 0.34 * (mot - 0.5));
      // Pitting: turbulence ridges bitten out of the surface. Two scales so
      // the corrosion has both blooms and speckle.
      const pitA = 1 - smoothstep(0.16, 0.42, turb(u * 22, vv * 22, 22, 3, seed + 41));
      const pitB = 1 - smoothstep(0.10, 0.30, turb(u * 64, vv * 64, 64, 2, seed + 53));
      const pits = clamp01(pit * (0.8 * pitA + 0.55 * pitB));
      t = clamp01(t - 0.34 * pits);
      let [r8, g8, b8] = ramp3(stops, t);
      // Verdigris: low-frequency patches, biased to sit where the pitting is
      // (corrosion grows out of corrosion), and never covering everything.
      if (patina > 0) {
        const pa = fbm(u * 3.1, vv * 2.6, 3, 4, seed + 71);
        const k = patina * clamp01(smoothstep(0.52, 0.78, pa) + 0.45 * pits) * (0.6 + 0.5 * mot);
        r8 += (VERDIGRIS[0] - r8) * k;
        g8 += (VERDIGRIS[1] - g8) * k;
        b8 += (VERDIGRIS[2] - b8) * k;
      }
      // A cool specular drift: rolled metal is never one colour across a
      // plate, and this is the cheapest honest version of that.
      const sh = 1 + sheen * (fbm(u * 1.3, vv * 4.1, 4, 2, seed + 89) * 2 - 1);
      r8 *= sh; g8 *= sh; b8 *= sh;

      // HEIGHT. Pits sink, the roll undulates, rivets stand.
      let h = 0.56 + 0.10 * (roll - 0.5) - 0.24 * pits
        + 0.05 * (fbm(u * 40, vv * 40, 40, 2, seed + 7) - 0.5);
      if (rivets > 0) {
        // One row of domed heads. The dome is a smoothstep of the distance
        // to the nearest centre, in a metric that corrects for the tile's
        // aspect so a head is round on the band and not an ellipse.
        const R = Math.max(1, rivets);
        const rx = u * R;
        const ri = Math.floor(rx);
        const dx = (rx - ri - 0.5) / R;                 // in tile-u units
        const dy = vv - 0.5;
        const jit = (hash2(ri, 0, seed + 97) - 0.5) * 0.012;
        const d = Math.hypot(dx, dy + jit) / 0.085;
        const dome = 1 - smoothstep(0.55, 1.0, d);
        h += 0.30 * dome;
        // …and the head catches light the plate does not.
        const k = 1 + 0.16 * dome;
        r8 *= k; g8 *= k; b8 *= k;
      }

      const i = (py * W + px) * 4;
      cImg.data[i] = clamp01(r8 / 255) * 255;
      cImg.data[i + 1] = clamp01(g8 / 255) * 255;
      cImg.data[i + 2] = clamp01(b8 / 255) * 255;
      cImg.data[i + 3] = 255;
      const hv = clamp01(h) * 255;
      hImg.data[i] = hv; hImg.data[i + 1] = hv; hImg.data[i + 2] = hv; hImg.data[i + 3] = 255;
    }
  }
  cCan.getContext('2d').putImageData(cImg, 0, 0);
  hCan.getContext('2d').putImageData(hImg, 0, 0);

  const map = new THREE.CanvasTexture(cCan);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return {
    map,
    normalMap: heightToNormal(hCan, 1.0),
    roughnessMap: roughFromHeight(hCan, 256, seed + 999),
  };
}

// Baked once per page and reused across socket cycles — seven per-pixel
// passes are not something to spend on every tower→tower swap.
let MAPS = null;
function maps() {
  if (MAPS) return MAPS;
  MAPS = {
    // The plinth and the block: soot-blackened stone in big rough courses.
    // Deep joints and heavy chipping — this is the part that has stood in a
    // working foundry, and the joints are DARKER than the stone.
    soot: bakeStone({ size: 512, stops: SOOT, blocks: 5, courses: 9, seed: 0xa17f01,
      joint: 0.0092, relief: 1.7, chip: 0.75, wash: 0.10, mortar: SOOT_JOINT }),
    // Fire-brick: many small stretchers to a course, laid in PALE mortar. At
    // 6.6 world units per tile that is a 0.55 × 0.28 brick — a third of a d6
    // edge, the scale cue that says "kiln lining", not "garden wall".
    brick: bakeStone({ size: 512, stops: BRICK, blocks: 12, courses: 24, seed: 0x3bc502,
      joint: 0.0042, relief: 0.8, chip: 0.35, speckle: 0.035, wash: 0.13,
      mortar: BRICK_JOINT }),
    // Cast iron plate. No rivets in the field bake — the straps carry those.
    iron: bakeMetal({ size: 256, stops: IRON, seed: 0x51e7a3, pit: 0.62 }),
    // The crown's top course, sootier still: the lip a chimney actually
    // blackens. Same plate, darker ramp, more corrosion.
    ironDark: bakeMetal({ size: 256, stops: IRON.map((c) => c.map((n) => Math.round(n * 0.66))),
      seed: 0x2c40b8, pit: 0.85, sheen: 0.04 }),
    // Oxidised bronze strapping, WITH rivet heads. 9 to a tile against a
    // 6.0-unit u-tile is a head every 0.67 units.
    bronze: bakeMetal({ size: 256, stops: BRONZE, seed: 0x7d9c15,
      rivets: 9, patina: 0.55, pit: 0.4, sheen: 0.08 }),
    // Foundry sand: no joints at all, heavy speckle, and it stays matte.
    sand: bakeStone({ size: 256, stops: SAND, blocks: 1, courses: 1, seed: 0x9f2071,
      joint: 0.0022, relief: 0.3, chip: 0.2, speckle: 0.10, wash: 0.22 }),
    ember: bakeEmber({ size: 256, seed: 0xe3b011, heat: 1.0 }),
    // The dressing's one canvas: the plume (js/towerdress.js). Warm grey, a
    // radial puff times fbm, peak alpha 0.35 and asymptotic edges so a quad
    // has no rectangle.
    smoke: bakeSmoke({ size: 128, seed: 0xa15c04 }),
    veil: veilTexture(256, 0.92),
    shadow: veilTexture(256, 0.55),
  };
  return MAPS;
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

// Bevel radius scales with the part: chunky on cast blocks, hairline on
// anything living inside the facade's 0.09 of depth.
const R_HULL = 0.048, R_TRIM = 0.028, R_THIN = 0.013;
// A foundry stack settles into its own floor. Smaller than Heartwood's 0.7°
// and close to Bastion's: at 12.4 units tall every tenth of a degree costs
// 0.022 of the socket's width at the crown, and the cap course is already
// within 0.07 of the wall.
const TILT = 0.15 * Math.PI / 180;

export function buildAnvilSkin(v) {
  const M = maps();
  const rnd = mulberry32(0xa17f10);
  const group = new THREE.Group();
  group.name = 'towerSkin';
  const forge = new THREE.Group();
  // NAME IS CONTRACT: __diceDebug.towerOcclusionCheck() treats every named
  // `towerSkin*` child of the skin as an OCCLUDER and everything unnamed
  // (veils, contact shadows) as proving nothing.
  forge.name = 'towerSkinForge';
  group.add(forge);

  const mat = (m, ns) => new THREE.MeshStandardMaterial({
    map: m.map, normalMap: m.normalMap, normalScale: new THREE.Vector2(ns, ns),
    roughnessMap: m.roughnessMap, roughness: 1, metalness: 0,
    envMapIntensity: 0.45, vertexColors: true,
  });
  // Metal that is OXIDISED is not a mirror. Heartwood's iron runs metalness 1
  // and envMapIntensity 1.0 because it is a bright bracket catching the room;
  // everything here has been in a fire, so it stays on the house's 0.45 with
  // a partial metalness — the pitting in the roughness map is what sells it.
  const metal = (m, ns, metalness) => {
    const s = mat(m, ns);
    s.metalness = metalness;
    return s;
  };
  const emberMat = (intensity) => new THREE.MeshStandardMaterial({
    map: M.ember.map, normalMap: M.ember.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: M.ember.roughnessMap, roughness: 1, metalness: 0,
    // THE ONLY HOUSE-LEGAL GLOW. emissive is left white so the BAKE carries
    // the colour — a flat emissive tint would throw away the ramp from dead
    // char through dull red to the hot crack, which is the whole picture.
    // vertexColors multiplies the diffuse only, so the AO bake darkens the
    // char without ever dimming the seams: coals in shadow still glow.
    emissive: 0xffffff, emissiveMap: M.ember.emissiveMap,
    emissiveIntensity: intensity,
    envMapIntensity: 0.45, vertexColors: true,
  });
  const MAT = {
    soot: mat(M.soot, 0.62),
    brick: mat(M.brick, 0.46),
    iron: metal(M.iron, 0.55, 0.55),
    ironDark: metal(M.ironDark, 0.60, 0.5),
    bronze: metal(M.bronze, 0.75, 0.6),
    sand: mat(M.sand, 0.4),
    // WORN STEEL, and it is the dressing's one bright material — deliberately.
    // Tools are the thing in a smithy that hands polish; the cast iron of the
    // tower has been in the fire for a decade and the hammer was used this
    // morning. It is also the only way the rail reads: the first cut hung
    // the tools in MAT.iron and they were a dark shape on a dark wall at the
    // resting eye, which is a prop that does not exist. Same plate bake,
    // `color` and a lower roughness are the whole difference.
    steel: (() => {
      const m2 = metal(M.iron, 0.55, 0.72);
      m2.color = new THREE.Color(0x9a958c);
      m2.roughness = 0.62;
      return m2;
    })(),
    // Dim, but PRESENT. At 0.55 the bed was a rumour behind the bars and the
    // feature of the tower was invisible at the resting eye; the bake's own
    // heat envelope leaves most of the bed dead, so the intensity has to
    // carry the live seams. 0.90 at the grate, 0.50 at the vent — still
    // coals at rest, and still the only glow in the house.
    ember: emberMat(0.90),
    emberFaint: emberMat(0.50),
  };
  // World units per texture tile. Non-square and non-integer against every
  // dimension in the model, so tiling never lands on a visible grid.
  // `coalFine` exists because the vent is 0.26 wide: at the grate's tile it
  // sampled one thin vertical strip of a single coal bed, and whether that
  // strip crossed a live seam was luck. A slot needs its own scale.
  const UV = { soot: [7.4, 7.4], brick: [6.6, 6.6], plate: [4.9, 3.7],
    band: [6.0, 1.0], sand: [5.3, 3.9], coal: [2.3, 1.7], coalFine: [0.5, 0.75] };

  const parts = [];
  const add = (mesh) => {
    mesh.castShadow = true; mesh.receiveShadow = true;
    forge.add(mesh); parts.push(mesh); return mesh;
  };
  // THE ONLY WAY A BOX IS MADE IN THIS FILE (Heartwood's rule, and for the
  // same reason): stated as a min/max span so the contract arithmetic reads
  // straight off the page.
  const span = (matKey, x0, x1, y0, y1, z0v, z1v, opt = {}) => {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1v - z0v);
    const geo = roundedBox(w, h, d, opt.r !== undefined ? opt.r : R_TRIM, opt.seg || 1);
    if (opt.weather) weather(geo, w, h, d, rnd);
    const uv = opt.uv || UV.plate;
    // A BAND maps its texture so the baked rivet row (v = 0.5) lands on the
    // band's own centreline whatever height it sits at. planarUV's v is
    // world-y over vw, so vw = the band's height and vo cancels the height it
    // happens to stand at. Without this the row is a random horizontal slice
    // and the rivets are ellipses or absent.
    const vo = opt.band ? -Math.min(y0, y1) / h : rnd() * 0.4;
    planarUV(geo, uv[0], opt.band ? h : uv[1], rnd() * 0.4, vo);
    const mesh = new THREE.Mesh(geo, MAT[matKey]);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0v + z1v) / 2);
    if (opt.rx) mesh.rotation.x = opt.rx;
    return add(mesh);
  };

  // --- contract arithmetic: every number below comes out of towerVolumes ---
  const S = v.S, z0 = v.z0;
  const boreR = v.shaft.r;                                  // 2.125
  const boreZ = v.shaft.c[2];                               // z0 − 2.0
  const zLim = v.socket.c[2] + v.socket.s[2] / 2;           // socket front face
  const xLim = v.socket.s[0] / 2;
  const yLim = v.socket.c[1] + v.socket.s[1] / 2;           // socket ceiling
  const sill = v.hood.c[1] - v.hood.s[1] / 2;               // apron top at the door
  const doorX = v.door.w / 2;
  const doorY = v.door.h;

  const zFO = zLim - 0.01;                 // z0+0.24 · the outermost face
  const zFF = zFO - 0.04;                  // z0+0.20 · the recessed field
  const zFI = boreR + boreZ + 0.025;       // z0+0.15 · and its back. 0.09 of
                                           // depth, and that is the whole
                                           // articulation budget dead ahead.
  const iX = boreR + 0.075;                // 2.20 · interior half-width: the
  const zBI = boreZ - boreR - 0.075;       // z0−4.20 · falling dice own r 2.125

  // Elevations. The plinth stops UNDER the doorway sill, which is the trick
  // that lets it run the full width: below y = 1.0 the doorway has nothing to
  // obstruct, so the base can be a base instead of two thin returns.
  const yPl1 = 0.52, yPl2 = 0.92;
  // PROPORTION, AFTER LOOKING. The block ended 0.56 lower in the first cut
  // and the tower read top-heavy: the doorway eats the block's whole middle,
  // so its remaining mass is a frame, and a chimney taller than that frame
  // becomes the subject. The block now runs to 6.92 and the stack is 3.6 —
  // a furnace with a flue, rather than a flue on a doorstep.
  const yBlkTop = 6.92;
  const yFil1 = 7.06;                      // the bronze fillet under the cap
  const yCap1 = 7.44;
  const yChmA = 8.62, yChmB = 9.86, yChmTop = 11.02;
  // The stack's straps sit LOW and HIGH with a clear field between them. The
  // first cut spaced three of them evenly and the middle one ran straight
  // across the vent, cutting one tall slot into two stubby ones — and three
  // bright bands on a 3.6-unit stack was too much trim besides.
  const yStrap0 = 7.62, yStrap1 = 10.46, strapH = 0.22;
  const yCrA = 11.50, yCrTop = yLim - 0.08;                 // 12.42

  // Half-widths and back faces. Every one is checked against the socket at
  // its own height for the lean: at y the tilt costs y·sin(0.15°) of x, and
  // the cap course is the tight one (3.16 + 0.018 = 3.178 against 3.25).
  const xPl1 = 3.18, xPl2 = 3.10, xBlk = 3.04, xFil = 3.10, xCap = 3.16;
  const zPl1 = z0 - 5.05, zPl2 = z0 - 4.95, zBlk = z0 - 4.72, zCap = z0 - 4.86;
  const xChmA = 2.62, xChmB = 2.57, xChmC = 2.52;
  const zChm = z0 - 4.42;
  const xCrA = 2.74, xCrB = 3.02;          // 3.02 + 12.42·sin(0.15°) = 3.05
  const zCrA = z0 - 4.52, zCrB = z0 - 4.72;

  // A RING is how every course above the plinth is made: a back slab, two
  // side slabs, and a front slab in the facade's 0.09. Open at neither end —
  // the bore runs up the middle and the interior faces never come inside iX.
  const ring = (matKey, xOut, zb, y0, y1, opt = {}) => {
    const uv = opt.uv || UV.soot;
    const front = opt.front !== undefined ? opt.front : xOut;
    span(matKey, -xOut, xOut, y0, y1, zb, zb + 0.42, { uv, r: opt.r, weather: opt.weather });
    for (const s of [-1, 1]) {
      span(matKey, s * iX, s * xOut, y0, y1, zb, zFO - (opt.inset || 0),
        { uv, r: opt.r, weather: opt.weather });
    }
    if (front > 0) span(matKey, -front, front, y0, y1, zFI, zFF, { uv, r: R_THIN, seg: 2 });
  };

  // --- THE PLINTH: two battered courses of soot-blackened block ------------
  // Full width AND full depth, because they live under the sill. The second
  // steps in, which is how a plinth is actually built and also how the eye
  // gets told the base is heavier than what stands on it.
  span('soot', -xPl1, xPl1, 0, yPl1, zPl1, zFO, { uv: UV.soot, r: R_HULL, weather: true });
  span('soot', -xPl2, xPl2, yPl1, yPl2, zPl2, zFO, { uv: UV.soot, r: R_HULL, weather: true });

  let replacedStrap = null;    // the one unrusted band (the dressing pass)

  // --- THE ANVIL BLOCK: the mass the whole thing stands on -----------------
  // A shell, not a solid: back, two jambs, and the facade above the door head.
  // The jambs stand OUTSIDE the engine's opening (|x| ≥ doorX) — the frame is
  // decorated, the aperture is never touched — and they are 0.5 thick with
  // 0.84 of real depth, because |x| > 2.125 is where depth is free (§1.5).
  span('soot', -xBlk, xBlk, yPl2, yBlkTop, zBlk, zBlk + 0.44,
    { uv: UV.soot, r: R_TRIM, weather: true });
  for (const s of [-1, 1]) {
    span('soot', s * (doorX + 0.04), s * xBlk, yPl2, yBlkTop, zBlk, zFO - 0.06,
      { uv: UV.soot, r: R_TRIM, weather: true });
    // Iron strapping up the jambs — the riveted bands, where they have room
    // to be 0.06 of real relief instead of a painted line. IRON, not bronze:
    // the first cut put the accent here too and six more bright bands turned
    // the trim into the theme. Bronze is now the stack's straps and four
    // beads, and nothing else.
    for (const y of [1.28, 2.72, 4.10]) {
      const b = span('iron', s * (doorX + 0.08), s * (xBlk - 0.04), y, y + 0.26,
        zFO - 0.06, zFO, { uv: UV.band, band: true, r: R_THIN });
      // Held for the dressing pass: ONE of these six is the band somebody
      // replaced, and it gets a clean material rather than a second mesh.
      if (s > 0 && y === 2.72) replacedStrap = b;
    }
  }

  // --- THE DOOR HEAD: lintel, hood, corbels --------------------------------
  // The lintel is a cast beam, and above it the hood. THE ONE DEVIATION,
  // stated plainly and inherited from both siblings: the hood reaches
  // z0+0.85, past the socket's face at z0+0.25. The engine's own HOOD volume
  // runs to z0+1.25 and asks to be shadowed; a cover flush with the wall
  // shadows nothing. It stands 2.2 units above the exit trajectory's start
  // and carries no collider. (It also crosses the bore's front tangent — the
  // bore below the despawn line at y = 7.0 is never occupied by anything, a
  // scripted entry has no body, and both shipped towers do the same.)
  span('iron', -(xBlk + 0.02), xBlk + 0.02, doorY, doorY + 0.42, z0 - 0.30, zFO,
    { uv: UV.plate, r: R_TRIM });
  {
    const w = 2 * (doorX + 0.42), h = 0.24 * S, tilt = 16 * Math.PI / 180;
    const zb = z0 + 0.05, zf = v.hood.c[2] + v.hood.s[2] / 2 - 0.32 * S;   // z0+0.85
    const geo = roundedBox(w, h, (zf - zb) / Math.cos(tilt), R_TRIM, 1);
    planarUV(geo, UV.plate[0], UV.plate[1] * 0.7, rnd() * 0.4, rnd() * 0.4);
    const hood = new THREE.Mesh(geo, MAT.iron);
    hood.position.set(0, doorY + 0.66, (zb + zf) / 2);
    hood.rotation.x = tilt;
    add(hood);
  }
  for (const s of [-1, 1]) {
    span('iron', s * (doorX + 0.10), s * (doorX + 0.52), doorY - 0.26, doorY + 0.52,
      z0 + 0.06, z0 + 0.60, { uv: UV.plate, r: R_THIN });
  }

  // --- THE FURNACE GRATE: the feature --------------------------------------
  // A barred opening onto a bed of coals, sitting in the block's own face
  // above the casting channel. The facade is CUT AROUND it — four panels
  // rather than one — so the bed is genuinely the backmost surface and
  // nothing of the field stands in front of the thing it is a window onto.
  // (Worth writing down: a slab merely sunk 0.012 BEHIND a field slab that
  // still spans the same x/y is invisible, which is a mistake this file was
  // built to avoid making.)
  const gX = 1.90, gY0 = 5.12, gY1 = 6.62;
  const yFac0 = doorY + 0.42;                                // 4.92
  span('soot', -xBlk, -gX, yFac0, yBlkTop, zFI, zFF, { uv: UV.soot, r: R_THIN, seg: 2 });
  span('soot', gX, xBlk, yFac0, yBlkTop, zFI, zFF, { uv: UV.soot, r: R_THIN, seg: 2 });
  span('soot', -gX, gX, yFac0, gY0, zFI, zFF, { uv: UV.soot, r: R_THIN });
  span('soot', -gX, gX, gY1, yBlkTop, zFI, zFF, { uv: UV.soot, r: R_THIN });
  // The bed. Its own UV tile is small (2.3 × 1.7) so a 3.8 × 0.94 opening
  // shows about two coal beds across — individual coals, not a pattern.
  span('ember', -gX, gX, gY0, gY1, zFI, zFI + 0.02,
    { uv: UV.coal, r: R_THIN });
  // Six cast bars, standing 0.065 in front of the bed — enough for a real
  // shadow, and the VALUE contrast does the rest of the work at fifteen
  // units. They run past the opening top and bottom into the frame.
  for (let i = 0; i < 6; i++) {
    const cx = -gX + (gX * 2) * ((i + 0.5) / 6);
    span('iron', cx - 0.055, cx + 0.055, gY0 - 0.05, gY1 + 0.05,
      zFO - 0.055, zFO - 0.005, { uv: UV.plate, r: R_THIN });
  }
  // A bronze bead around the opening: jambs and a head, proud of the field.
  for (const s of [-1, 1]) {
    span('bronze', s * gX, s * (gX + 0.17), gY0 - 0.16, gY1 + 0.16, zFF, zFO,
      { uv: UV.band, band: true, r: R_THIN });
  }
  span('bronze', -(gX + 0.17), gX + 0.17, gY1, gY1 + 0.16, zFF, zFO,
    { uv: UV.band, band: true, r: R_THIN });
  span('bronze', -(gX + 0.17), gX + 0.17, gY0 - 0.16, gY0, zFF, zFO,
    { uv: UV.band, band: true, r: R_THIN });

  // --- THE SHOULDER: a bronze fillet under an oversailing iron cap ---------
  // This is the STEP (§1.5 note 3). The stack cannot taper, so the whole
  // change of width happens here: 3.04 out to 3.16 and then straight in to
  // 2.62. A cap that oversails is what makes a chimney read as rising OUT of
  // a furnace rather than being the same box continued.
  ring('bronze', xFil, z0 - 4.78, yBlkTop, yFil1,
    { uv: UV.band, r: R_THIN, front: xFil });
  ring('iron', xCap, zCap, yFil1, yCap1, { uv: UV.plate, r: R_TRIM, front: xCap });

  // --- THE CHIMNEY: three courses of dark fire-brick ----------------------
  // The courses carry the BACK AND SIDES only (`front: 0`), because that is
  // where they are visible: the stack's breathing-in shows in silhouette, and
  // on the facade a 0.05 step of x is nothing at all. The front is ONE slab
  // for the whole stack, cut around the vent — which also lets the vent be as
  // tall as it wants instead of as tall as whichever course it lands in.
  ring('brick', xChmA, zChm, yCap1, yChmA, { uv: UV.brick, r: R_TRIM, weather: true, front: 0 });
  ring('brick', xChmB, zChm + 0.04, yChmA, yChmB,
    { uv: UV.brick, r: R_TRIM, weather: true, front: 0 });
  ring('brick', xChmC, zChm + 0.08, yChmB, yChmTop,
    { uv: UV.brick, r: R_TRIM, weather: true, front: 0 });
  // Two riveted bronze straps, low and high. They wrap: a face band, two
  // cheeks, and a band across the back.
  for (const [y0, xo, zb] of [[yStrap0, xChmA, zChm], [yStrap1, xChmC, zChm + 0.08]]) {
    const y1 = y0 + strapH;
    span('bronze', -(xo + 0.02), xo + 0.02, y0, y1, zFF, zFO,
      { uv: UV.band, band: true, r: R_THIN });
    for (const s of [-1, 1]) {
      span('bronze', s * xo, s * (xo + 0.05), y0, y1, zb, zFO,
        { uv: UV.band, band: true, r: R_THIN });
    }
  }

  // --- THE SHAFT VENT: a recess, not a hole -------------------------------
  // One narrow slot with the same fire behind it, faint. Off-centre, and
  // nothing on the right answers it — Heartwood's single iron bracket and
  // Bastion's off-centre arrow loop, in this family's language.
  //
  // IT SITS INSIDE THE COWL BAND, so the construction is load-bearing: the
  // facade is CUT around the slot (four panels) and the bed that fills the
  // cut is opaque emissive stone. A ray that clears the iron surround stops
  // on the bed; there is no layer here a sightline can pass through, which is
  // the difference between a vent and a hole, and a hole at this height is a
  // die seen vanishing.
  {
    const vx0 = -1.44, vx1 = -1.18, vy0 = 8.30, vy1 = 9.95;
    const fx = xChmA - 0.06;                 // 2.56 — clears the r 2.0 discs
    span('brick', -fx, vx0, yCap1, yChmTop, zFI, zFF, { uv: UV.brick, r: R_THIN, seg: 2 });
    span('brick', vx1, fx, yCap1, yChmTop, zFI, zFF, { uv: UV.brick, r: R_THIN, seg: 2 });
    span('brick', vx0, vx1, yCap1, vy0, zFI, zFF, { uv: UV.brick, r: R_THIN });
    span('brick', vx0, vx1, vy1, yChmTop, zFI, zFF, { uv: UV.brick, r: R_THIN });
    span('emberFaint', vx0, vx1, vy0, vy1, zFI, zFI + 0.02,
      { uv: UV.coalFine, r: R_THIN });
    // The surround: two jambs and a head+sill, proud of the field, so the
    // slot is a shadowed slot and not a decal.
    span('iron', vx0 - 0.12, vx0, vy0 - 0.14, vy1 + 0.14, zFF, zFO, { uv: UV.plate, r: R_THIN });
    span('iron', vx1, vx1 + 0.12, vy0 - 0.14, vy1 + 0.14, zFF, zFO, { uv: UV.plate, r: R_THIN });
    span('iron', vx0 - 0.12, vx1 + 0.12, vy1, vy1 + 0.14, zFF, zFO, { uv: UV.plate, r: R_THIN });
    span('iron', vx0 - 0.12, vx1 + 0.12, vy0 - 0.14, vy0, zFF, zFO, { uv: UV.plate, r: R_THIN });
  }

  // --- THE CROWN: a crucible lip, soot-blackened at the top ----------------
  // Flared wider than the stack, and CLOSED — the ring is what occludes, and
  // there is no lid over the bore because the entry drop starts at y = 11.25
  // with dice up to 1.25 in radius. Anything roofing the mouth is something
  // dice fall through.
  ring('iron', xCrA, zCrA, yChmTop, yCrA, { uv: UV.plate, r: R_TRIM });
  ring('ironDark', xCrB, zCrB, yCrA, yCrTop, { uv: UV.plate, r: R_TRIM });
  // One bronze bead at the flare's spring line, the last of the trim accent.
  span('bronze', -(xCrA + 0.04), xCrA + 0.04, yCrA - 0.06, yCrA + 0.10, zFF, zFO,
    { uv: UV.band, band: true, r: R_THIN });

  // --- THE CASTING CHANNEL: the apron and the lip, clad --------------------
  // Exactly on the engine's ramp and lip, so a die rides the sand it looks
  // like it is riding. Zero colliders: this is paint on a collider that
  // already exists.
  {
    const geo = roundedBox(v.apron.s[0], v.apron.s[1], v.apron.s[2], R_TRIM, 1);
    planarUV(geo, UV.sand[0], UV.sand[1] * 1.6, 0.1, 0.3);
    const chute = new THREE.Mesh(geo, MAT.sand);
    chute.position.set(...v.apron.c);
    chute.rotation.x = v.apron.rx;
    add(chute);
    // Iron cheeks, in the apron's own frame — the runner's walls. They stop
    // just outside the doorway: anything raised further out on the felt is a
    // wall a settled die walks through, because a skin has no colliders.
    const ch = 0.34 * S, hw = v.apron.s[0] / 2;
    for (const s of [-1, 1]) {
      const g2 = roundedBox(0.28 * S, v.apron.s[1] * 0.55 + ch, v.apron.s[2] * 0.62, R_THIN, 1);
      planarUV(g2, UV.plate[0], UV.plate[1], rnd() * 0.4, rnd() * 0.4);
      const cheek = new THREE.Mesh(g2, MAT.iron);
      cheek.position.set(s * (hw + 0.12 * S),
        (v.apron.s[1] * 0.55 + ch) / 2 - v.apron.s[1] / 2 + v.apron.s[1] * 0.225,
        -v.apron.s[2] * 0.12);
      cheek.castShadow = true; cheek.receiveShadow = true;
      chute.add(cheek); parts.push(cheek);
    }
  }
  {
    // The tray: flush, no raised kerb, and the LIGHT material. Black iron
    // dice on a black iron tray is a roll nobody can read.
    const geo = roundedBox(v.lip.s[0] + 0.15, v.lip.s[1], v.lip.s[2] + 0.1, 0.07, 1);
    planarUV(geo, UV.sand[0], UV.sand[1], 0.55, 0.2);
    const tray = new THREE.Mesh(geo, MAT.sand);
    tray.position.set(...v.lip.c);
    tray.rotation.x = v.lip.rx;
    add(tray);
  }

  // =========================================================================
  // THE DRESSING (docs/TOWER.md, DRESSING). Four props, because this tower
  // already owns the family's warm light — the grate is the focal point and
  // has been since the day it shipped, so the dressing's job here is to turn
  // that light into a WORKPLACE rather than to add a second one.
  //
  // The bold one is the smoke. Everything else is at the base and at eye
  // level beside the glow, which is where the dossier puts human-scale
  // clutter: story at the base, silhouette at the crown, and the long quiet
  // shaft left alone between them.
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

  // --- 1. THE PLUME — the bold one, and NOT a particle system --------------
  // js/particles.js is impact-keyed by contract ("no impact, no particles"),
  // and a chimney that emitted them would be the first thing in the app to
  // break that rule. Six fixed quads on a loop instead: merged into one
  // geometry, per-quad opacity carried on a `color` attribute at itemSize 4
  // (USE_COLOR_ALPHA, G2) so nothing clones a material, MeshBasicMaterial
  // because lit smoke is a sheet of paper, and NEVER additive — real smoke
  // occludes, additive smoke glows, and glowing smoke is fire.
  //
  // It rises from z0−2.5, half a unit BEHIND the flue's axis: entry dice fall
  // through (0, z0−2.0) and a plume dead on the axis veils them for the tenth
  // of a second they are above the crown.
  //
  // IT IS THE ONE THING ON ANY TOWER THAT LEAVES THE SOCKET UPWARD, capped at
  // y ≈ 15.2 against a ceiling of 12.5. It carries no opacity anybody needs,
  // it is above every camera's subject, and tower-fit names it as its own
  // legal class rather than not seeing it.
  {
    const plume = buildSmokePlume({
      // y0 sits BELOW the crown's top edge so the first quad is born inside
      // the flue and climbs out of it; born in clear air it reads as a
      // puff appearing, which is the one thing a loop must never show.
      //
      // AND THE RISE IS SHORT, MEASURED RATHER THAN CHOSEN. The shipped
      // cameras frame the MAT, and at the resting eye the crown is already
      // near the top of the picture: a plume climbing to y 15 spends most of
      // its life outside the frame players actually look at. 1.15 keeps the
      // whole loop inside it and still tops out above the socket at y ≈ 14.
      seed: 0xa15905, n: 6, w: 0.72, y0: yCrTop - 0.45, rise: 1.15,
      drift: 0.30, period: 9, peak: 0.30, tex: M.smoke, z: z0 - 2.5,
    });
    fx.add(plume.mesh);
    registerSmoke(group, plume);
  }

  // --- 2. THE HORSESHOE — the highest-value silhouette in the dossier ------
  // MOVED, AND THE REASON IS THE HOOD. "Over the door head" is the archetype,
  // but this door head already carries a cast lintel with a hood oversailing
  // it to z0+0.85, and anything hung under that hood is in its shadow at
  // every shipped eye. So the shoe hangs on the block's face to the RIGHT of
  // the grate, inside the ember's own spill — which is where a smith would
  // hang one anyway, and where the light makes it read.
  {
    const shoe = buildHorseshoe({ R: 0.235, thick: 0.082, depth: 0.05, material: MAT.steel });
    shoe.position.set(2.42, 5.74, zFO - 0.01);
    propUV(shoe.geometry, 1.1);
    addDress(shoe);
  }

  // --- 3. THE WORKPLACE — a rail, a hammer, tongs, and a heap of coal ------
  // Hung at eye level on the other side of the grate, so the two halves of
  // the forge frame the fire. INTERRUPTED WORK BEATS TIDY WORK: the hammer
  // hangs straight, the tongs hang crooked off the same hook, and the third
  // hook is empty.
  //
  // NOTHING SITS ON THE TRAY, and that is a refusal rather than an oversight.
  // The brief wanted tongs propped across the tray lip to catch the spill —
  // but dice come to rest on that lip (docs/TOWER.md: a 20-die pour puts five
  // of them there) and a skin has no colliders, so a prop in the delivery run
  // is a prop dice pass through. The rail is the honest version of the same
  // sentence.
  {
    const rail = -2.46, ry = 6.34;
    const bar = (w, h, d) => propUV(roundedBox(w, h, d, R_PROP, 1), 1.1);
    const tools = new THREE.Mesh(mergeGeos([
      // the rail and its two brackets
      { geo: bar(1.02, 0.055, 0.055), matrix: xform({ pos: [rail, ry, zFO + 0.10] }) },
      { geo: bar(0.05, 0.05, 0.13), matrix: xform({ pos: [rail - 0.46, ry, zFO + 0.05] }) },
      { geo: bar(0.05, 0.05, 0.13), matrix: xform({ pos: [rail + 0.46, ry, zFO + 0.05] }) },
      // the hammer: a head and a haft, hanging plumb
      { geo: bar(0.30, 0.125, 0.115), matrix: xform({ pos: [rail - 0.30, ry - 0.60, zFO + 0.10] }) },
      { geo: bar(0.055, 0.62, 0.055), matrix: xform({ pos: [rail - 0.30, ry - 0.30, zFO + 0.10] }) },
      // the tongs: two legs off one hook, crooked, and not the same length
      { geo: bar(0.048, 0.74, 0.048),
        matrix: xform({ pos: [rail + 0.26, ry - 0.36, zFO + 0.10], rot: [0, 0, 0.16] }) },
      { geo: bar(0.048, 0.62, 0.048),
        matrix: xform({ pos: [rail + 0.31, ry - 0.30, zFO + 0.08], rot: [0, 0, 0.05] }) },
      // A SHORT CHAIN, and it hangs HERE rather than off the crown lip.
      // MOVED AFTER LOOKING: at the crown it was 320 triangles for a nine-pixel
      // feature at the very top edge of a frame that frames the MAT — I could
      // not find it in a single one of the eight review shots. On the rail it
      // is in the ember's light beside the tools, which is also where a smith
      // would actually keep one. Real links alternating 90° are only worth 80
      // triangles each when somebody can see them turn.
      { geo: buildChainHanger({
        links: 4, R: 0.105, r: 0.030, at: [rail + 0.47, ry - 0.14, zFO + 0.10],
        material: MAT.steel,
      }).geometry },
    ]), MAT.steel);
    addDress(tools);

    // The coal, clustered at ONE side of the base and touching the wall —
    // the historic smithy inventory is forge, bellows, anvil, tongs, and a
    // bucket of coal by the fire. Instanced: nine lumps, one draw call, and
    // OUT of the AO parts (G8 — one InstancedMesh box would swallow the
    // plinth's own occlusion).
    //
    // It keeps to |x| ≥ 2.62, outside the doorway's clear width, because the
    // felt in front of the tower's foot is felt dice can reach.
    const rndC = mulberry32(0xa15c0a);
    const items = [];
    for (let i = 0; i < 9; i++) {
      const s = 0.13 + rndC() * 0.13;
      // …and never past −3.20 with its own radius on: a lump 0.26 across
      // centred on −3.10 puts its edge outside the socket wall.
      const x = -2.92 + rndC() * 0.30;
      const zz = zFO + 0.06 + rndC() * 0.34;
      items.push({
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(x, 0.05 + rndC() * 0.22, zz),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rndC() * 3, rndC() * 3, rndC() * 3)),
          new THREE.Vector3(s, s * 0.8, s)),
        // Coal is the darkest thing on a dark tower. The first tint range
        // topped out above 1 and the heap read as crumpled paper.
        tint: [0.28 + rndC() * 0.26, 0.26 + rndC() * 0.24, 0.25 + rndC() * 0.22],
      });
    }
    fx.add(instancedField({
      geo: new THREE.IcosahedronGeometry(1, 0), material: MAT.soot,
      items, name: 'dressCoalHeap',
    }));
  }

  // --- 4. WEATHERING, AND ONE BAND SOMEBODY REPLACED -----------------------
  // Rust runs DOWN from iron, never up, and a tiling wall texture cannot know
  // where the iron is. Seven alpha-tested quads under the bands that actually
  // exist, three streak patterns on one canvas, merged into one draw call.
  // They sit at zFF + 0.012 — in front of the brick field and BEHIND the iron
  // surrounds, which is the layering rust actually has.
  {
    const tex = bakeStainSheet({
      size: 256, seed: 0xa15205,
      // LOOKED AT, THEN DARKENED BY MORE THAN HALF. The first cut ran the
      // ramp up to 0x86,0x53,0x2a and painted what read as fresh red paint
      // running down a black tower — the loudest thing in the frame, on a
      // model whose whole identity is that its value lives in the bottom
      // third (this file's own second lesson, relearnt by the dressing).
      // Rust on soot is a BROWN a shade lighter than the brick, not an
      // orange; and `cut` at 0.62 breaks the runs up so they are streaks
      // rather than stripes.
      cells: [
        { stops: [[0x22, 0x18, 0x11], [0x33, 0x22, 0x16], [0x46, 0x2f, 0x1d]], lanes: 3, width: 0.15, reach: 0.9, cut: 0.62 },
        { stops: [[0x1f, 0x16, 0x10], [0x2e, 0x1f, 0x15], [0x3f, 0x2a, 0x1b]], lanes: 2, width: 0.19, reach: 0.7, cut: 0.62 },
        { stops: [[0x25, 0x1a, 0x12], [0x37, 0x25, 0x18], [0x4b, 0x33, 0x20]], lanes: 4, width: 0.11, reach: 1.0, cut: 0.66 },
      ],
    });
    const zS = zFF + 0.012;
    const defs = [
      { cell: 0, w: 0.72, h: 1.25, pos: [-0.62, yStrap0 - 0.01, zS] },
      { cell: 2, w: 0.50, h: 0.95, pos: [1.62, yStrap0 - 0.01, zS] },
      { cell: 1, w: 0.62, h: 1.05, pos: [-1.92, yStrap1 - 0.01, zS] },
      { cell: 0, w: 0.44, h: 0.80, pos: [0.94, yStrap1 - 0.01, zS] },
      // and down the right-hand jamb, off the three iron straps that are
      // genuinely 0.06 of relief there
      { cell: 2, w: 0.34, h: 0.62, pos: [2.78, 4.34, zFO + 0.004] },
      { cell: 1, w: 0.30, h: 0.55, pos: [2.66, 2.96, zFO + 0.004] },
      { cell: 0, w: 0.28, h: 0.44, pos: [2.86, 1.52, zFO + 0.004] },
    ];
    addDress(buildStains({ defs, cells: 3, tex }), false);
    // ONE REPLACEMENT BAND, unrusted: the middle strap on the right jamb, in
    // clean iron with none of the corrosion. Somebody maintains this. It is
    // a material swap on a mesh that already existed — no geometry at all.
    if (replacedStrap) replacedStrap.material = MAT.steel;
  }

  bakeVertexAO(parts, group);

  // The aged base: a working forge is SWEPT — near-zero dust — but its inside
  // corners are the grimiest in the family, and its drift runs widest (fire
  // bricks discolour unevenly). Weather side +x, opposite the wooden tower's:
  // the family did not all stand facing the same rain.
  weatherPass(parts, {
    edge: 0.3, grime: 0.6, dust: 0.08, drift: 0.15, weatherSide: 1,
    edgeGate: (p, n) => (0.3 + 0.7 * clamp01(1 - Math.abs(p.y - 3) / 6)),
  });

  // --- WEATHERING IN THE VERTEX COLOURS, after the AO bake -----------------
  // HEAT ABOVE, DAMP BELOW — the whole story of a foundry stack, and all of
  // it gravity-correct: soot is darkest at the CRown rim and fades DOWN
  // (rainwater carries it down, so the lip is where it never washes off),
  // efflorescence blooms mid-shaft where the brick is still drying out, and
  // moss lives only at the base. World space, so it knows where the rim is,
  // which a texture tiling every 6.6 units does not.
  gravityStain(parts, (p, n, out) => {
    // SOOT: full at the crown rim, gone two and a half units below it.
    const soot = clamp01((p.y - (yCrA - 1.6)) / 2.2) * clamp01(1 + n.y);
    // EFFLORESCENCE: pale salt bloom in patches on the stack, and it
    // BRIGHTENS — the one stain here that multiplies above 1.
    const band = clamp01(1 - Math.abs(p.y - 9.4) / 1.9);
    const eff = band * smoothstep(0.55, 0.78, fbm(p.x * 0.9 + 4, p.y * 0.7, 4, 3, 0xef5))
      * clamp01(n.z * 0.6 + 0.4);
    // MOSS at the damp foot only.
    const damp = clamp01(1 - p.y / 1.0);
    if (soot < 0.02 && eff < 0.02 && damp < 0.02) return false;
    // The efflorescence BRIGHTENS, and it is kept small on purpose: at 0.30
    // it lifted the whole stack out of the bottom third of the value range
    // and the tower stopped being black. A salt bloom is a hint, not a coat.
    out[0] = (1 - 0.34 * soot) * (1 + 0.11 * eff) * (1 - 0.13 * damp);
    out[1] = (1 - 0.36 * soot) * (1 + 0.12 * eff) * (1 - 0.06 * damp);
    out[2] = (1 - 0.38 * soot) * (1 + 0.11 * eff) * (1 - 0.17 * damp);
    return true;
  });

  // --- AO layer (b): the unlit near-black lining --------------------------
  // Everything above this point is lit; everything below is light that never
  // arrives. The lining is what a ray that gets past the shell would hit, and
  // it is what makes the gateway a hole into somewhere dark instead of a hole
  // into the felt behind the tower.
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a0806, side: THREE.DoubleSide });
  const lining = new THREE.Group();
  lining.name = 'towerSkinLining';
  {
    const top = yCrTop - 0.1, bot = sill - 0.5;
    const h = top - bot, cy = (top + bot) / 2;
    const inn = iX - 0.02, back = zBI + 0.02;
    const plane = (w, hh, px, py, pz, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), dark);
      m.position.set(px, py, pz);
      if (ry) m.rotation.y = ry;
      lining.add(m);
    };
    plane(2 * inn, h, 0, cy, back, 0);
    plane(zFI - back, h, -inn, cy, (back + zFI) / 2, Math.PI / 2);
    plane(zFI - back, h, inn, cy, (back + zFI) / 2, Math.PI / 2);
    // …and a flat back to the facade, from the door head up. It stops AT the
    // door head on purpose: an opaque plane across the doorway would make an
    // exiting die pop into existence at the wall instead of travelling out of
    // the dark, which is the doorway veil's job two layers down.
    plane(2 * inn, top - doorY, 0, (top + doorY) / 2, zFI - 0.012, 0);
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
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(2 * iX * 0.92, 3.6 * S), veilMat());
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
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * xPl1 + 2.6, (zFO - zPl1) + 2.6), shMat());
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, 0.006, (zFO + zPl1) / 2);
    group.add(base);
    const trayShadow = new THREE.Mesh(new THREE.PlaneGeometry(v.lip.s[0] + 1.6, 2.0), shMat());
    trayShadow.rotation.x = -Math.PI / 2;
    trayShadow.position.set(0, 0.005, v.lip.c[2] + v.lip.s[2] / 2 + 0.35);
    group.add(trayShadow);
  }

  // Nothing that has stood in a foundry is plumb. Z only: a lean about x
  // would push the facade through the bore's front tangent, and the whole
  // budget there is 0.025.
  group.rotation.z = TILT;
  group.userData.socketMaxZ = zFO;
  group.userData.xLim = xLim;
  return group;
}
