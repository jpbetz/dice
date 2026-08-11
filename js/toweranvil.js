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
// is `bakeMetal` (plate pitting, verdigris, rivet bosses in the height
// channel) and `bakeEmber` — the coal bed, which paints a fourth canvas.
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
  roundedBox, planarUV, weather, bakeVertexAO, bakeStone,
} from './towerskin.js';

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
// The coal bed: char → dull red → the hot crack. Three stops, and the third
// is short of white on purpose. White is a lava lamp.
const EMBER = [[0x0b, 0x03, 0x01], [0x9c, 0x2c, 0x04], [0xff, 0x8e, 0x2e]];
const CHAR = [[0x16, 0x12, 0x10], [0x24, 0x1d, 0x19], [0x38, 0x2d, 0x26]];

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

// ---------------------------------------------------------------------------
// bakeEmber — a bed of banked coals, and the only glow in the house
// ---------------------------------------------------------------------------
// Four canvases from one loop: albedo (char), height, roughness, and the
// EMISSIVE map. The cracks are the contour lines of a noise field — where the
// field crosses its own midpoint — which is why they branch and close into
// cells the way cooling coal actually does, instead of reading as a painted
// lightning bolt. Two fields at different frequencies, the finer one weaker,
// give a network rather than a single seam.
//
// The heat is NOT uniform across the bed: a broad low-frequency envelope
// leaves parts of it dead and parts of it live, which is the whole difference
// between "coals at rest" and "a strip of orange tape".
function bakeEmber({ size, seed, heat = 1 }) {
  const W = size;
  const cCan = document.createElement('canvas'); cCan.width = cCan.height = W;
  const hCan = document.createElement('canvas'); hCan.width = hCan.height = W;
  const eCan = document.createElement('canvas'); eCan.width = eCan.height = W;
  const cImg = cCan.getContext('2d').createImageData(W, W);
  const hImg = hCan.getContext('2d').createImageData(W, W);
  const eImg = eCan.getContext('2d').createImageData(W, W);

  for (let py = 0; py < W; py++) {
    const vv = py / W;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      const f1 = fbm(u * 5.5, vv * 5.5, 6, 4, seed);
      const f2 = fbm(u * 13, vv * 13, 13, 3, seed + 911);
      const crack = Math.max(
        1 - smoothstep(0, 0.055, Math.abs(f1 - 0.5)),
        0.65 * (1 - smoothstep(0, 0.032, Math.abs(f2 - 0.5))));
      // Where the bed is still alive. Banked coals go out in patches.
      const bed = clamp01(0.18 + 1.05 * fbm(u * 2.1, vv * 2.4, 2, 3, seed + 37));
      const hot = clamp01(crack * bed * heat);

      // ALBEDO: char. A faint warm bleed beside a live crack, because the
      // ash next to a hot seam is genuinely browner.
      const grain = turb(u * 70, vv * 70, 70, 2, seed + 61);
      const ct = clamp01(0.30 + 0.55 * f1 + 0.30 * (grain - 0.5) - 0.35 * crack);
      let [r8, g8, b8] = ramp3(CHAR, ct);
      const bleed = 0.55 * hot;
      r8 += (0x6a - r8) * bleed * 0.5;
      g8 += (0x36 - g8) * bleed * 0.35;
      b8 += (0x1c - b8) * bleed * 0.2;

      // EMISSIVE: the ramp, then multiplied by the heat again so cold coal is
      // genuinely black rather than dim orange. Two multiplications is what
      // keeps the bed dark between the seams.
      const [er, eg, eb] = ramp3(EMBER, hot);
      const ek = hot * hot;

      // HEIGHT: coals bulge, cracks sink.
      const h = 0.60 + 0.16 * (f1 - 0.5) - 0.34 * crack
        + 0.05 * (grain - 0.5);

      const i = (py * W + px) * 4;
      cImg.data[i] = clamp01(r8 / 255) * 255;
      cImg.data[i + 1] = clamp01(g8 / 255) * 255;
      cImg.data[i + 2] = clamp01(b8 / 255) * 255;
      cImg.data[i + 3] = 255;
      eImg.data[i] = clamp01((er * ek) / 255) * 255;
      eImg.data[i + 1] = clamp01((eg * ek) / 255) * 255;
      eImg.data[i + 2] = clamp01((eb * ek) / 255) * 255;
      eImg.data[i + 3] = 255;
      const hv = clamp01(h) * 255;
      hImg.data[i] = hv; hImg.data[i + 1] = hv; hImg.data[i + 2] = hv; hImg.data[i + 3] = 255;
    }
  }
  cCan.getContext('2d').putImageData(cImg, 0, 0);
  hCan.getContext('2d').putImageData(hImg, 0, 0);
  eCan.getContext('2d').putImageData(eImg, 0, 0);

  const map = new THREE.CanvasTexture(cCan);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const emissiveMap = new THREE.CanvasTexture(eCan);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = 4;
  return {
    map, emissiveMap,
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
      span('iron', s * (doorX + 0.08), s * (xBlk - 0.04), y, y + 0.26,
        zFO - 0.06, zFO, { uv: UV.band, band: true, r: R_THIN });
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

  bakeVertexAO(parts, group);

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
