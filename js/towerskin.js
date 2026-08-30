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

// THE FIRST TOWER SKIN — a wooden hobby dice tower wrapped around
// TOWER_CORE (docs/TOWER.md). A skin is PURE THEATRE: it adds zero
// colliders, zero lights, and never reads or writes the film. Everything
// here derives from `towerVolumes()` at build time — no world number is
// typed twice, so a retune of S, the mat, or the zoom ladder moves the
// model with the contract instead of stranding it.
//
// The three chalk-killers this file spends most of its lines on (a
// procedural prop reads as chalk when it has raw arrises, flat value, and
// no ambient occlusion):
//   1. EVERY box is a rounded box. `roundedBox()` is the only way a box
//      gets made in this file — there is no raw BoxGeometry call below.
//   2. AO in three layers: a startup vertex-colour bake, an unlit black
//      lining inside the shaft, and canvas gradient veils in the mouth pit
//      and the doorway, plus soft contact shadows on the felt.
//   3. Procedural two-tone wood: walnut on the frame and the wide front and
//      back boards, cherry on the side panels and the whole delivery run
//      (chute + tray), because a light tray is what makes dice read on it.
//
// PROPORTION: plinth (two stepped courses) → plank-panelled shaft with four
// proud corner posts → overhanging cornice with a flared three-sided hopper
// rim, and a canted hood over the doorway. Real overhangs at both ends;
// that is the silhouette.

import * as THREE from 'three';
// The PROP kit (js/towerdress.js) imports the SURFACE kit — this file — so
// this is a cycle. It is a benign one and deliberately so: both sides use the
// other only from inside function bodies, never at module-evaluation time, so
// ESM's live bindings are resolved long before anybody calls anything. Keep it
// that way — a top-level `const` in either file that reads the other is the
// edit that turns this into a TDZ crash on frame one.
import {
  buildCresset, buildRope, bakeRope, coilPoints, bakeCage, emberMaterial,
  growIvy, ivyLeaves, bakeLeaf, bakeTuft, bakeStems, mossPass, grimePass, dustPass, cloneCanvas,
  instancedField, leafMaterial, gravityStain, mergeGeos, xform, propUV,
  registerSway, ensureColor,
} from './towerdress.js';

// ---------------------------------------------------------------------------
// Deterministic noise kit (no dependencies, no Math.random anywhere)
// ---------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// TILEABLE value noise: the lattice wraps modulo `period`, and `period`
// scales with the octave frequency in fbm/turb below — that is the whole
// trick that keeps a canvas seamless when the UVs repeat.
export function vnoise(x, y, period, seed) {
  const p = Math.max(1, Math.round(period));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const ax = ((x0 % p) + p) % p, bx = (ax + 1) % p;
  const ay = ((y0 % p) + p) % p, by = (ay + 1) % p;
  const n00 = hash2(ax, ay, seed), n10 = hash2(bx, ay, seed);
  const n01 = hash2(ax, by, seed), n11 = hash2(bx, by, seed);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}

export function fbm(x, y, period, oct, seed) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x * f, y * f, period * f, seed + o * 7919);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

export function turb(x, y, period, oct, seed) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * Math.abs(2 * vnoise(x * f, y * f, period * f, seed + o * 7919) - 1);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

export const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
export function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}
// Asymmetric growth-ring profile: wide pale earlywood, narrow dark
// latewood. A symmetric sin() reads as moiré at grazing angles — this is
// the single biggest difference between "wood" and "corduroy".
export function smoothpulse(a, b, c, d, x) {
  return smoothstep(a, b, x) - smoothstep(c, d, x);
}

// ---------------------------------------------------------------------------
// Procedural wood maps
// ---------------------------------------------------------------------------

// Two species, three stops each (dark → mid → light). Two-tone is what
// premium hobby towers actually are: one dark species framing panels of a
// lighter one. Never a pure colour at either end.
const WALNUT = [[0x3a, 0x24, 0x18], [0x5a, 0x3b, 0x26], [0x7d, 0x5a, 0x3c]];
const CHERRY = [[0x7a, 0x47, 0x2b], [0xa9, 0x70, 0x4c], [0xc8, 0x96, 0x78]];
// Grooves are SHADOW, not paint: a warm near-black, never #000.
const GROOVE = [0x0f, 0x0a, 0x08];

export function ramp3(stops, t) {
  const u = clamp01(t);
  const [lo, hi, k] = u < 0.5 ? [stops[0], stops[1], u * 2] : [stops[1], stops[2], (u - 0.5) * 2];
  return [lo[0] + (hi[0] - lo[0]) * k, lo[1] + (hi[1] - lo[1]) * k, lo[2] + (hi[2] - lo[2]) * k];
}

// The tail every bake shares: the three textures a MeshStandardMaterial
// wants, derived from the two canvases the pixel loop painted. Factored out
// (2026-08-11, the dressing pass) so a caller can take the CANVASES, paint
// weathering into them, and re-derive the maps — moss and soot are cheaper as
// pixels than as geometry, and they must agree with the height field or the
// normal map fights them. A pure extraction: the four lines each bake used to
// end with, in the order it used to run them.
export function mapsFromCanvases(cCan, hCan, seed) {
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

// One pass paints BOTH the colour canvas and the height canvas, because
// they share every noise lookup — the height field carries seams, pores and
// plank bevels ONLY (never the ring colour: ring colour in a normal map is
// the classic "wood made of corrugated iron" tell).
//
// EXPORTED (2026-08-11): the dressing pass grows moss on Heartwood, and moss
// is a pixel pass over the same plank canvas rather than a second material.
export function bakeWood({ size, stops, planks, seed, cathedral }) {
  const W = size;
  const cCan = document.createElement('canvas'); cCan.width = cCan.height = W;
  const hCan = document.createElement('canvas'); hCan.width = hCan.height = W;
  const cCtx = cCan.getContext('2d'), hCtx = hCan.getContext('2d');
  const cImg = cCtx.createImageData(W, W), hImg = hCtx.createImageData(W, W);
  const rnd = mulberry32(seed);

  // Per-plank jitter: grain phase, tone (±15% lightness), a slight skew so
  // the grain is never dead-parallel, and a LENGTHWISE offset so plank end
  // features never line up column to column.
  const P = Math.max(1, planks);
  const jit = [];
  for (let i = 0; i < P; i++) {
    jit.push({
      phase: rnd() * 13,
      tone: 1 + (rnd() - 0.5) * 0.30,
      skew: (rnd() - 0.5) * 0.42,
      lengthwise: rnd() * 11,
      ringf: 11 + rnd() * 5,
    });
  }
  const GW = 0.026;   // groove half-width, in plank-local u
  const LW = 0.060;   // outer edge of the bright lip just inside the groove
  // Ring CONTRAST is the whole difference between wood and corduroy. Rings
  // ride a narrow band of the species ramp; the plank grooves are what the
  // eye is supposed to count, and they get the full range.
  const RING_LO = 0.26, RING_SPAN = 0.34;

  for (let py = 0; py < W; py++) {
    const vv = py / W;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      let value, groove = 0, lip = 0, tone = 1;

      if (cathedral) {
        // Cathedral figure for horizontal boards: rings squashed along the
        // board so they arch instead of stripe.
        const dx = (u - 0.42) * 0.08;
        const dy = vv - 0.5;
        let r = 16 * Math.hypot(dx, dy)
          + 0.32 * (turb(u * 3, vv * 3, 3, 4, seed + 31) * 2 - 1);
        r += 0.5 * (vnoise(r * 0.5, 3.7, 64, seed + 71) * 2 - 1);
        value = RING_LO + RING_SPAN * smoothpulse(0.10, 0.55, 0.70, 0.95, r - Math.floor(r));
      } else {
        const fu = u * P;
        const idx = Math.min(P - 1, Math.floor(fu));
        const j = jit[idx];
        const lu = fu - idx;                    // 0..1 across this plank
        const nv = vv + j.lengthwise;           // per-column lengthwise offset
        let r = j.ringf * (lu + j.phase) + j.skew * nv
          + 0.45 * (turb(u * 4, vv * 1.35, 4, 4, seed + 17) * 2 - 1);
        // Ring-WIDTH unevenness: real growth rings are not metronomic.
        r += 0.5 * (vnoise(r * 0.5, nv * 0.7, 64, seed + 53) * 2 - 1);
        value = RING_LO + RING_SPAN * smoothpulse(0.10, 0.55, 0.70, 0.95, r - Math.floor(r));
        const dEdge = Math.min(lu, 1 - lu);
        groove = 1 - smoothstep(0, GW, dEdge);
        lip = smoothstep(GW, GW + 0.012, dEdge) * (1 - smoothstep(LW, LW + 0.05, dEdge));
        tone = j.tone;
      }

      // Fine pore lines: high-frequency noise stretched along the grain.
      const pore = turb(u * 128, vv * 9, 128, 2, seed + 91);
      // …and a broad tonal drift across the board. Without it every plank
      // averages to the same brown and the panel reads as painted MDF.
      const drift = 0.86 + 0.30 * fbm(u * 1.6, vv * 1.3, 2, 3, seed + 41);

      let [r8, g8, b8] = ramp3(stops, value);
      const tk = tone * drift;
      r8 *= tk; g8 *= tk; b8 *= tk;
      const pk = 1 - 0.07 * pore;
      r8 *= pk; g8 *= pk; b8 *= pk;
      if (groove > 0) {
        const m = groove * 0.95;
        r8 += (GROOVE[0] - r8) * m; g8 += (GROOVE[1] - g8) * m; b8 += (GROOVE[2] - b8) * m;
      }
      if (lip > 0) {
        const k = 1 + 0.08 * lip;
        r8 *= k; g8 *= k; b8 *= k;
      }
      // A gentle tile vignette. Deliberately weak: these UVs are WORLD-scale
      // and tile across a panel, so a strong one would print a grid rather
      // than darken corners — the AO bake is what does corners here.
      const vg = (1 - smoothstep(0, 0.10, Math.min(u, 1 - u)))
        + (1 - smoothstep(0, 0.10, Math.min(vv, 1 - vv)));
      const vk = 1 - 0.07 * clamp01(vg);
      r8 *= vk; g8 *= vk; b8 *= vk;

      // HEIGHT: seams, pores, plank bevels. Ring colour stays OUT of it —
      // rings in a normal map is what makes procedural wood read as
      // corrugated iron.
      const h = 0.5 - 0.34 * groove + 0.07 * lip - 0.05 * pore
        + 0.02 * (fbm(u * 8, vv * 8, 8, 3, seed + 5) - 0.5);

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

  // …and the canvases come back with the maps, so a dressing pass can repaint
  // them (js/towerdress.js) instead of adding a second material.
  return { ...mapsFromCanvases(cCan, hCan, seed), colorCanvas: cCan, heightCanvas: hCan };
}

// Turn a height sketch into a tangent-space normal map. LINEAR data — no
// colorSpace tag, that would bend the vectors. Sampling wraps modulo W so the
// result is as seamless as its input.
// (js/dice.js has the same routine but does not export it; duplicating ~20
// lines beats widening that module's surface for a lab-only skin.)
//
// IT IS NOT A SOBEL — it is a 4-tap central difference, no 3x3 kernel and no
// diagonals. The word was in both copies of this comment and it travelled: the
// mats handoff cites "js/themes.js does height-sketch→Sobel", which is wrong
// about the file AND about the kernel. Corrected 2026-08-29.
//
// THE SIGN OF Y WAS INVERTED HERE UNTIL 2026-08-29, and it had been since this
// function was written. Both forks write G = +dy; this one computed
// dy = h(y-1) - h(y+1) and js/dice.js computes dy = h(y+1) - h(y-1), so they
// emitted opposite green channels from one sketch. EVERY TOWER SURFACE WAS
// THEREFORE LIT FROM BELOW: bevels, plank edges, block seams and pores all had
// their shading inside-out under a key that stands 67 degrees above the table.
//
// THE DERIVATION, so nobody has to re-run it. For an OpenGL-convention
// tangent-space map G encodes -dH/dv. Two facts fix dv:
//
//   · a CanvasTexture has flipY = true, so image row 0 is v = 1 and
//     v = 1 - y/s, giving dv = -dy/s;
//   · `planarUV` below sets v = y for every vertical face (cheeks and faces),
//     so +v is world UP — which is what makes the flip visible rather than
//     academic.
//
// Therefore -dH/dv = +s·dh/dy: G is the CANVAS-DOWN derivative, which is what
// js/dice.js always had. The old comment here ("canvas y is down") named a
// true fact and drew the opposite conclusion from it.
//
// Checked, not just derived: `__diceDebug.normalConvention()` runs this
// function over a synthetic ridge and reports the green channel on each flank,
// and `tower-normal-convention` asserts the crest's upper flank comes back
// brighter than its lower one. Confirmed RED against the old sign.
export function heightToNormal(heightCanvas, strength) {
  const s = heightCanvas.width;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const octx = out.getContext('2d');
  const img = octx.createImageData(s, s);
  const h = (x, y) => src[((((y % s) + s) % s) * s + (((x % s) + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength * 2;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength * 2; // see the note above
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * s + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Roughness follows the height field (recessed = duller) with an
// independent low-frequency wobble on top. Structural wood wants to sit
// high — 0.55..0.85 — not the glassy 0.5 a naive ramp lands on.
export function roughFromHeight(heightCanvas, size, seed) {
  const s = heightCanvas.width;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x / size) * s), sy = Math.floor((y / size) * s);
      const h = src[(sy * s + sx) * 4] / 255;
      const wob = (fbm(x / size * 5, y / size * 5, 5, 3, seed) - 0.5) * 2 * 0.08;
      const r = clamp01(0.70 + 0.22 * (1 - h) + wob) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = r; img.data[i + 2] = r; img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);       // LINEAR — no colorSpace tag
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// bakeStone — coursed masonry in one pass, colour and height together
// ---------------------------------------------------------------------------
// WHERE THIS CAME FROM: written for Bastion (js/towerbastion.js) and moved
// here verbatim when Black Anvil needed coursed fire-brick and coursed soot
// stone. A pure MOVE — the only edit is that the mortar colour became a
// parameter defaulting to the constant it used to read, so Bastion's four
// bakes come out byte-for-byte what they were (witnessed by a before/after
// frame compare, the same bar the towerskin export refactor had to clear).
//
// Both canvases come out of the same loop because they share every noise
// lookup, and because the height field must agree with the mortar lines to
// the pixel or the normal map fights the albedo.
//
// TILEABILITY is structural, not decorative: `blocks` and `courses` are whole
// numbers, every per-block lookup is keyed on the WRAPPED indices, and the
// noise is the tileable kit above. A seam in a wall texture on a drum is a
// vertical scar you cannot unsee.
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
//
// Degenerate settings are useful and intended: blocks:1, courses:1 with a
// hairline joint is a single dressed slab — grain and nothing else.
export const mod = (n, m) => ((n % m) + m) % m;
// A warm near-black: a recess is shadow, and shadow in a warm room is never
// #000. (Bastion's first cut ran it at full strength and printed a cartoon
// grid, which is why the blend below is 0.80 and not 1.)
const MORTAR = [0x3a, 0x34, 0x2c];

export function bakeStone({ size, stops, blocks, courses, seed,
  joint = 0.0056, relief = 1, chip = 0.45, speckle = 0.05, wash = 0.20,
  mortar = MORTAR }) {
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
      const t = clamp01(0.26 + 0.46 * hb + 0.30 * (mottle - 0.5));
      let [r8, g8, b8] = ramp3(stops, t);
      const warm = (hb2 - 0.5) * 0.09;
      r8 *= 1 + warm; b8 *= 1 - warm;
      const sp = turb(u * 150, vv * 150, 150, 2, seed + 77);
      const spk = 1 + speckle * (sp * 2 - 1);
      r8 *= spk; g8 *= spk; b8 *= spk;
      // Rain wash: a broad, mostly-vertical drift. Slightly green in the
      // mid-tones, which is what damp northern stone actually does.
      const wsh = (1 - wash / 2) + wash * fbm(u * 2.2, vv * 1.05, 2, 3, seed + 41);
      r8 *= wsh * 0.99; g8 *= wsh * 1.01; b8 *= wsh * 0.985;
      if (groove > 0) {
        const m = groove * 0.80;
        r8 += (mortar[0] - r8) * m; g8 += (mortar[1] - g8) * m; b8 += (mortar[2] - b8) * m;
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

  return { ...mapsFromCanvases(cCan, hCan, seed), colorCanvas: cCan, heightCanvas: hCan };
}

// ---------------------------------------------------------------------------
// bakeEmber — a bed of banked coals, and the only glow in the house
// ---------------------------------------------------------------------------
// WHERE THIS CAME FROM: written for Black Anvil (js/toweranvil.js) and moved
// here verbatim when the dressing pass gave Heartwood a cresset and Bastion a
// sconce — a warm focal light is the family trait now (docs/TOWER.md
// DRESSING), so the bake that makes one belongs to the kit rather than to the
// forge. A pure MOVE, with one addition: the ember ramp became a parameter
// defaulting to the constant it used to read, so Black Anvil's bake comes out
// byte-for-byte what it was and a cresset can burn a different fuel.
//
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
//
// The colour lives in the BAKE, never in `emissive` — see the emberMat comment
// in js/toweranvil.js for why (a flat tint throws away the ramp).
export const EMBER = [[0x0b, 0x03, 0x01], [0x9c, 0x2c, 0x04], [0xff, 0x8e, 0x2e]];
const CHAR = [[0x16, 0x12, 0x10], [0x24, 0x1d, 0x19], [0x38, 0x2d, 0x26]];

export function bakeEmber({ size, seed, heat = 1, stops = EMBER }) {
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
      const [er, eg, eb] = ramp3(stops, hot);
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

  const emissiveMap = new THREE.CanvasTexture(eCan);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = 4;
  return {
    ...mapsFromCanvases(cCan, hCan, seed),
    emissiveMap, colorCanvas: cCan, heightCanvas: hCan, emissiveCanvas: eCan,
  };
}

// A radial veil: transparent rim → near-black centre. Used unlit, with
// depthWrite off, to fake the light that never gets into a deep pocket.
export function veilTexture(size, alpha) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(9,7,6,${alpha})`);
  g.addColorStop(0.55, `rgba(9,7,6,${alpha * 0.62})`);
  g.addColorStop(1, 'rgba(9,7,6,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The maps are expensive (four 256–512² passes) and identical on every
// build, so they are baked once per page and reused across socket cycles.
let MAPS = null;
function maps() {
  if (MAPS) return MAPS;
  const walnut = bakeWood({ size: 512, stops: WALNUT, planks: 6, seed: 0x7047e1, cathedral: false });
  const walnutFlat = bakeWood({ size: 256, stops: WALNUT, planks: 1, seed: 0x51d302, cathedral: true });
  // THE MOSS IS A SECOND PRINT OF A CANVAS THE TOWER IS ALREADY WEARING.
  // Clone, repaint, re-derive: one extra material and not one triangle.
  // `climb` is deliberately flat here — the tiled UVs mean canvas v has no
  // fixed relationship to world height, so the GRAVITY logic is carried by
  // WHICH MESHES get the mossy material (the ground course, the shaded
  // cornice slab) rather than by a gradient inside the tile.
  const mossy = (src, seed, amount) => {
    const c = cloneCanvas(src.colorCanvas), h = cloneCanvas(src.heightCanvas);
    mossPass(c, h, { seed, amount, climbFrom: 1.25, climbTo: -0.25, scale: 5 });
    return mapsFromCanvases(c, h, seed);
  };
  MAPS = {
    walnut,
    cherry: bakeWood({ size: 512, stops: CHERRY, planks: 6, seed: 0x3c9a11, cathedral: false }),
    walnutFlat,
    cherryFlat: bakeWood({ size: 256, stops: CHERRY, planks: 1, seed: 0x1a8b74, cathedral: true }),
    walnutMoss: mossy(walnut, 0x70e577, 0.92),
    walnutFlatMoss: mossy(walnutFlat, 0x51d377, 0.52),
    // Dressing bakes (js/towerdress.js): the cresset's painted cage, its
    // coals, the hoist rope, and the ivy's leaves, stems and moss tufts.
    cage: bakeCage({ size: 128, seed: 0x70cae1, bars: 9, stops: [[0x2c, 0x26, 0x1e], [0x55, 0x49, 0x35], [0x94, 0x7e, 0x52]] }),
    // A LIVE basket, not a banked bed: `heat` 1.8 pushes most of the crack
    // network past the ramp's midpoint, because a cresset is 0.5 across and
    // the anvil's own 1.0 left whichever thumbnail-sized patch the cylinder's
    // top cap happened to sample dead as often as not.
    coals: bakeEmber({ size: 128, seed: 0x70f13e, heat: 1.8 }),
    rope: bakeRope({ size: 128, seed: 0x70a0be }),
    leaf: bakeLeaf({ size: 64, seed: 0x70ea11 }),
    tuft: bakeTuft({ size: 64, seed: 0x70b011 }),
    veil: veilTexture(256, 0.92),
    shadow: veilTexture(256, 0.55),
  };
  // THE TEXEL HALF OF THE AGED BASE, applied to the field prints IN PLACE
  // and re-derived (the moss prints cloned from pristine walnut above stay
  // as they were — mossy areas are already busy). Grime seats in the grain
  // grooves across every board; dust films only the flat tiles, which are
  // the predominantly-horizontal surfaces.
  for (const [p, s, amt] of [[MAPS.walnut, 0x9e11, 0.8], [MAPS.cherry, 0x9e12, 0.8],
    [MAPS.walnutFlat, 0x9e13, 0.8], [MAPS.cherryFlat, 0x9e14, 0.8]]) {
    grimePass(p.colorCanvas, p.heightCanvas, { seed: s, amount: amt,
      stops: [[0x16, 0x11, 0x0b], [0x2c, 0x23, 0x16], [0x48, 0x3a, 0x26]] });
  }
  dustPass(MAPS.walnutFlat.colorCanvas, MAPS.walnutFlat.heightCanvas, { seed: 0x9e15, amount: 0.65 });
  dustPass(MAPS.cherryFlat.colorCanvas, MAPS.cherryFlat.heightCanvas, { seed: 0x9e16, amount: 0.65 });
  for (const [p, s] of [[MAPS.walnut, 0x9e11], [MAPS.cherry, 0x9e12],
    [MAPS.walnutFlat, 0x9e13], [MAPS.cherryFlat, 0x9e14]]) {
    Object.assign(p, mapsFromCanvases(p.colorCanvas, p.heightCanvas, s));
  }
  return MAPS;
}

// ---------------------------------------------------------------------------
// RoundedBoxGeometry — ported from three.js (MIT licence), from
// examples/jsm/geometries/RoundedBoxGeometry.js (original by @pailhead,
// reworked by @Mugen87). vendor/ is read-only in this repo and the addon is
// not part of the vendored core build, so the ~25 lines that matter are
// reproduced here. The UV block of the original is dropped: `planarUV()`
// below replaces it with a world-scale planar projection, which is what
// plank texturing wants.
//
// The push-out gives every vertex its ANALYTIC normal — flat faces get an
// exact axis normal, the corner shells get the sphere normal — so the
// bevels shade smooth and the faces stay crisp with no mergeVertices /
// toCreasedNormals pass at all.
// ---------------------------------------------------------------------------
const _rbN = new THREE.Vector3();
export function roundedBox(w, h, d, radius, segments = 1) {
  const seg = segments * 2 + 1;             // odd: no vertex lands on an axis
  const r = Math.min(w / 2, h / 2, d / 2, radius);
  const geo = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed();
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  const half = 0.5 / seg;
  for (let i = 0; i < pos.length; i += 3) {
    const px = pos[i], py = pos[i + 1], pz = pos[i + 2];
    _rbN.set(px - Math.sign(px) * half, py - Math.sign(py) * half, pz - Math.sign(pz) * half)
      .normalize();
    pos[i] = Math.sign(px) * bx + _rbN.x * r;
    pos[i + 1] = Math.sign(py) * by + _rbN.y * r;
    pos[i + 2] = Math.sign(pz) * bz + _rbN.z * r;
    nor[i] = _rbN.x; nor[i + 1] = _rbN.y; nor[i + 2] = _rbN.z;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.needsUpdate = true;
  // The box tag: weatherPass's arris classifier (max|n|) is exact ONLY on
  // this analytic topology — on a lathe or tube it would tint whole curved
  // surfaces as "edge". Curved props still take grime/dust/drift.
  geo.userData.rb = true;
  return geo;
}

// World-scale planar UVs, picked per vertex from the dominant normal axis,
// so a plank panel keeps the same grain scale on its face and its edges.
// `uw`/`vw` are how many world units map to one texture tile — deliberately
// non-square and non-integer so tiling never lands on a visible grid.
export function planarUV(geo, uw, vw, uo = 0, vo = 0) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }        // lids and floors
    else if (nx >= nz) { u = z; v = y; }               // cheeks
    else { u = x; v = y; }                             // faces
    uv.setXY(i, u / uw + uo, v / vw + vo);
  }
  uv.needsUpdate = true;
  return geo;
}

// A whisper of board irregularity, each term with its own SPATIAL ENVELOPE
// so it only touches the feature it belongs to: a broad bow that dies at
// the ends, edge wander on the long edges only, and fine surface noise.
// One un-enveloped noise field would read as melted plastic. Kept small
// enough (≤3% of thickness) that the analytic normals stay honest, so this
// never calls computeVertexNormals (which would flatten every bevel).
export function weather(geo, w, h, d, rnd) {
  const pos = geo.attributes.position;
  const dims = [w, h, d];
  // Which axis is the board's THICKNESS? That is what gets displaced; the
  // other two are its face, and the envelopes below are written in face
  // coordinates (fa = along the length, fb = across the width).
  const n = dims.indexOf(Math.min(w, h, d));
  const [p1, p2] = [0, 1, 2].filter((i) => i !== n);
  const [fa, fb] = dims[p1] >= dims[p2] ? [p1, p2] : [p2, p1];
  const G = ['getX', 'getY', 'getZ'], K = ['setX', 'setY', 'setZ'];
  const px = rnd() * 100, py = rnd() * 100;
  const bow = (rnd() - 0.5) * 0.006 * dims[fa];
  for (let i = 0; i < pos.count; i++) {
    const u = (2 * pos[G[fa]](i)) / (dims[fa] || 1);   // -1..1 along the length
    const v = (2 * pos[G[fb]](i)) / (dims[fb] || 1);   // -1..1 across it
    const env = 1 - u * u;                              // zero at the sawn ends
    const wander = 0.008 * dims[fb] * Math.abs(v) * env
      * (vnoise(u * 3 + px, v * 3 + py, 16, 0x51) * 2 - 1);
    const fine = 0.03 * dims[n] * (vnoise(u * 9 + px, v * 9 + py, 32, 0xc3) * 2 - 1);
    pos[K[n]](i, pos[G[n]](i) + bow * env + fine);
    pos[K[fb]](i, pos[G[fb]](i) + wander);
  }
  pos.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// Vertex-colour AO bake
// ---------------------------------------------------------------------------
// One shot at build time. Rays are tested against the parts' world AABBs
// rather than their triangles: this model IS a box assembly, the boxes are
// the occluders that matter, and the analytic test is ~200× cheaper than
// Raycaster over ~10k vertices (which was minutes, not milliseconds).
// Occluded vertices shade toward a blue-violet, not grey — that is what a
// sky-fill ambient actually does to wood.
const AO_MIN = [0.38, 0.40, 0.50];   // luminance ≈ 0.41 — the [0.42,1] floor
const AO_RAYS = 8;
const AO_DIST = 3.2;

export function hemisphereDirs(n) {
  // Deterministic Fibonacci hemisphere in tangent space (+Z is the normal).
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = (i + 0.6) / n;                 // 0..1, never straight along ±Z
    const r = Math.sqrt(1 - z * z);
    const a = i * ga;
    out.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
  }
  return out;
}

export function bakeVertexAO(parts, root) {
  root.updateMatrixWorld(true);
  const boxes = parts.map((m) => {
    const b = new THREE.Box3().setFromObject(m);
    const shrink = Math.min(0.012, (b.max.x - b.min.x) * 0.2,
      (b.max.y - b.min.y) * 0.2, (b.max.z - b.min.z) * 0.2);
    b.expandByScalar(-shrink);
    return b;
  });
  const dirs = hemisphereDirs(AO_RAYS);
  const p = new THREE.Vector3(), nrm = new THREE.Vector3();
  const t = new THREE.Vector3(), bt = new THREE.Vector3(), dir = new THREE.Vector3();
  const ray = new THREE.Ray();
  const hitPt = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), sideways = new THREE.Vector3(1, 0, 0);

  parts.forEach((mesh, mi) => {
    const geo = mesh.geometry;
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    // The raw open-sky factor, kept for weatherPass: once the colour
    // attribute has been multiplied by later passes (gravityStain), the AO
    // cannot be recovered from it — recovering by inverting AO_MIN is an
    // implicit-ordering dependency that ships green and looks wrong. ~15 KB
    // per part set, never uploaded to the GPU.
    const aoK = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      nrm.fromBufferAttribute(nor, i).transformDirection(mesh.matrixWorld).normalize();
      t.copy(Math.abs(nrm.y) > 0.95 ? sideways : up).cross(nrm).normalize();
      bt.crossVectors(nrm, t);
      ray.origin.copy(p).addScaledVector(nrm, 0.02);
      let hits = 0;
      for (const d of dirs) {
        dir.set(0, 0, 0).addScaledVector(t, d.x).addScaledVector(bt, d.y).addScaledVector(nrm, d.z);
        ray.direction.copy(dir).normalize();
        for (let b = 0; b < boxes.length; b++) {
          if (b === mi) continue;
          if (!ray.intersectBox(boxes[b], hitPt)) continue;
          if (hitPt.distanceToSquared(ray.origin) > AO_DIST * AO_DIST) continue;
          hits++;
          break;
        }
      }
      const k = 1 - hits / AO_RAYS;
      aoK[i] = k;
      col[i * 3] = AO_MIN[0] + (1 - AO_MIN[0]) * k;
      col[i * 3 + 1] = AO_MIN[1] + (1 - AO_MIN[1]) * k;
      col[i * 3 + 2] = AO_MIN[2] + (1 - AO_MIN[2]) * k;
    }
    geo.userData.aoK = aoK;
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  });
}

// ---------------------------------------------------------------------------
// THE WEATHER PASS (Joe, 2026-08-12: "the models right now are pristine").
// Substance's three mask generators, each of which this kit already knows the
// answer to without estimating anything:
//   · convex curvature — the analytic normals: max|n| is exactly 1 on a flat
//     face, 0.7071 on a bevel arris, 0.5774 on a corner shell. OBJECT normal,
//     because meshes are rotated (cant, flare, the group's lean).
//   · concave curvature — the AO bake above, which skips self-occlusion and
//     therefore measures exactly part-to-part inside corners.
//   · the up vector — the WORLD normal's y.
// Plus the layer the research ranked first and no mask drives: per-part tonal
// DRIFT, the scale modeller's oil-dot filter — soft value/hue wander across
// the field that destroys the factory-fresh uniformity between the stains.
// Everything multiplies the colour attribute, exactly like gravityStain; runs
// AFTER bakeVertexAO (needs userData.aoK) and BEFORE gravityStain (gravity
// owns the story stains and has the last word). Zero per-frame cost.
//
// Magnitudes are the research's, started at HALF (docs/TOWER.md: "weathering
// wants half the value you think"): grime crushes blue hardest (a deposit,
// not a shadow — shadows multiply uniformly), dust LIFTS blue hardest (a
// desaturated pale film), edge wear lifts warm (exposed substrate).
export function weatherPass(parts, {
  edge = 0.35,      // convex arris lightening (Wear Level)
  grime = 0.45,     // AO-driven deposit in inside corners
  dust = 0.30,      // up-facing pale film
  drift = 0.08,     // per-part tonal wander (±value, warm-biased)
  edgeTint = [0.55, 0.48, 0.34],  // Joe: edges way up
  grimeTint = [-0.16, -0.26, -0.42],
  dustTint = [0.16, 0.21, 0.36],
  edgeGate = null,  // (pWorld, nWorld) => 0..1 — wear where light + hands reach
  dustGate = null,
  weatherSide = 0,  // -1: the -x flank ages harder; +1: the +x; 0: uniform
  seed = 0x77ea1,
  floor = 0.30,     // combined-multiplier luminance clamp: never stack to black
} = {}) {
  const K = 1 / (1 - 1 / Math.sqrt(3));
  const p = new THREE.Vector3(), nO = new THREE.Vector3(), nW = new THREE.Vector3();
  parts.forEach((mesh, mi) => {
    const geo = mesh.geometry;
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    let col = geo.attributes.color;
    if (!col) {
      col = new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3);
      geo.setAttribute('color', col);
    }
    const aoK = geo.userData.aoK || null;
    mesh.updateWorldMatrix(true, false);
    // The drift layer: each PART takes one seeded wander. Plank walls and
    // block courses are many parts, so this lands at exactly the blotch scale
    // the research asks for (1/3–1/2 of a tower face) with zero canvas work.
    const r = mulberry32(seed + mi * 7919);
    const dv = (r() - 0.5) * 2 * drift;
    const warm = r() * drift * 0.75;
    const dm = [1 + dv + warm, 1 + dv + warm * 0.35, 1 + dv - warm * 0.6];
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      nO.fromBufferAttribute(nor, i);
      nW.copy(nO).transformDirection(mesh.matrixWorld);
      const openK = aoK ? aoK[i] : 1;
      const side = weatherSide
        ? 1 + 0.4 * weatherSide * Math.sign(p.x) * Math.min(1, Math.abs(p.x) / 2) : 1;
      const e = geo.userData.rb
        ? (1 - Math.max(Math.abs(nO.x), Math.abs(nO.y), Math.abs(nO.z))) * K : 0;
      const w = Math.max(0, e * edge * (edgeGate ? edgeGate(p, nW) : 1) * side);
      // Thresholded: shadow is continuous, a deposit has a contact line.
      // (Widened from 0.25–0.85 / 0.35–0.85: with 8 AO rays the occlusion is
      // quantised to eighths, and the first cut only let the deepest corners
      // qualify — Joe couldn't see it from the felt.)
      const g = Math.max(0, smoothstep(0.08, 0.6, 1 - openK) * grime * side);
      const d = Math.max(0, smoothstep(0.2, 0.75, nW.y)
        * (0.45 + 0.55 * (1 - openK)) * dust * (dustGate ? dustGate(p, nW) : 1));
      let m0 = dm[0] * (1 + edgeTint[0] * w) * (1 + grimeTint[0] * g) * (1 + dustTint[0] * d);
      let m1 = dm[1] * (1 + edgeTint[1] * w) * (1 + grimeTint[1] * g) * (1 + dustTint[1] * d);
      let m2 = dm[2] * (1 + edgeTint[2] * w) * (1 + grimeTint[2] * g) * (1 + dustTint[2] * d);
      const lum = 0.299 * m0 + 0.587 * m1 + 0.114 * m2;
      if (lum < floor) { const s = floor / lum; m0 *= s; m1 *= s; m2 *= s; }
      col.setXYZ(i, col.getX(i) * m0, col.getY(i) * m1, col.getZ(i) * m2);
    }
    col.needsUpdate = true;
  });
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

// Bevel radius scales with the part: chunky on the hull, hairline on trim.
const R_HULL = 0.055, R_TRIM = 0.028, R_THIN = 0.014;
const TILT = 0.7 * Math.PI / 180;   // the whole tower leans ~0.7°, by hand

export function buildTowerSkin(v) {
  const M = maps();
  const rnd = mulberry32(0x70e5a1);
  const group = new THREE.Group();
  group.name = 'towerSkin';
  const wood = new THREE.Group();     // everything that gets the AO bake
  wood.name = 'towerSkinWood';
  group.add(wood);

  const woodMat = (m) => new THREE.MeshStandardMaterial({
    map: m.map, normalMap: m.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
    roughnessMap: m.roughnessMap, roughness: 1, metalness: 0,
    envMapIntensity: 0.45, vertexColors: true,
  });
  const MAT = {
    walnut: woodMat(M.walnut),
    cherry: woodMat(M.cherry),
    walnutFlat: woodMat(M.walnutFlat),
    cherryFlat: woodMat(M.cherryFlat),
    // The same two species with moss painted into their canvases. They cost
    // one material each and no geometry; WHICH mesh wears one is where the
    // gravity logic lives (the dressing pass, below).
    walnutMoss: woodMat(M.walnutMoss),
    walnutFlatMoss: woodMat(M.walnutFlatMoss),
    // Sparse warm iron. Full metalness with a real environment to mirror is
    // what keeps this from reading as grey plastic.
    iron: new THREE.MeshStandardMaterial({
      color: 0x8a6a30, metalness: 1.0, roughness: 0.3,
      envMapIntensity: 1.0, vertexColors: true,
    }),
  };
  // World units per texture tile, per species. Planks are 6 to a tile at
  // ~2.1 units each — about 1.55 d6 widths, the scale cue that says
  // "hobby tower", not "dollhouse".
  const UV = { plank: [12.6, 16.4], flat: [3.3, 2.1] };

  const parts = [];
  // THE ONLY WAY A BOX IS MADE IN THIS FILE. Everything that follows is
  // stated as a min/max span so the contract arithmetic reads directly.
  const span = (mat, x0, x1, y0, y1, z0v, z1v, opt = {}) => {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1v - z0v);
    const r = opt.r !== undefined ? opt.r : R_HULL;
    const geo = roundedBox(w, h, d, r, opt.seg || 1);
    if (opt.weather) weather(geo, w, h, d, rnd);
    const uv = opt.uv || UV.plank;
    planarUV(geo, uv[0], uv[1], rnd() * 0.4, rnd() * 0.4);
    const mesh = new THREE.Mesh(geo, MAT[mat]);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0v + z1v) / 2);
    if (opt.rx) mesh.rotation.x = opt.rx;
    if (opt.rz) mesh.rotation.z = opt.rz;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    wood.add(mesh);
    parts.push(mesh);
    return mesh;
  };

  // --- contract arithmetic: every number below comes out of towerVolumes ---
  const S = v.S, z0 = v.z0;
  const boreR = v.shaft.r;                              // Ø4.25 clear bore
  const boreZ = v.shaft.c[2];
  const zLim = v.socket.c[2] + v.socket.s[2] / 2;       // socket front face
  const xLim = v.socket.s[0] / 2;
  const cowlTop = v.cowl.c[1] + v.cowl.s[1] / 2;        // occlude to here
  const sill = v.hood.c[1] - v.hood.s[1] / 2;           // apron top at the door
  const doorX = v.door.w / 2;
  const doorY = v.door.h;

  const clr = 0.14 * S;                    // slack for the 0.7° lean
  const pw = 0.28 * S;                     // panel thickness
  const inX = boreR + clr;                 // shaft interior half-width
  const sideX = inX + pw;                  // side panel outer face
  const postX = inX + 0.44 * S;            // corner posts, proud of the panels
  const postD = 0.44 * S;
  const zFI = boreZ + boreR + 0.02 * S;    // front board inner face (tangent
  const zFB = zFI + 0.065;                 //   to the bore — the bore itself
  const zFO = zLim - 0.01;                 //   pokes past the wall plane)
  const zBI = boreZ - boreR - clr;
  const zBO = zBI - pw;
  const baseA = 0.28 * S, baseB = 0.50 * S;
  const capX = postX + 0.16 * S;
  const bodyTop = cowlTop - 0.36 * S;
  const capTop = cowlTop + 0.16 * S;

  // --- PLINTH: two stepped courses, both wider than the shaft -------------
  // (The ground course is held: the dressing pass swaps its material for a
  // mossed print of the same canvas. Water sits here.)
  const plinthBottom = span('walnut', -(capX + 0.13 * S), capX + 0.13 * S, 0, baseA, zBO - 0.16 * S, zFO,
    { uv: UV.flat, r: R_HULL, weather: true });
  span('walnut', -capX, capX, baseA, baseB, zBO - 0.08 * S, zFO,
    { uv: UV.flat, r: R_TRIM, weather: true });

  // --- SHAFT: light side panels framed by dark posts and boards -----------
  for (const s of [-1, 1]) {
    span('cherry', s * inX, s * sideX, baseB, bodyTop, zBO, zFO, { r: R_TRIM });
  }
  span('walnut', -inX, inX, baseB, bodyTop, zBO, zBI, { weather: true, r: R_TRIM });
  // The front board is THIN by contract: the bore's front tangent sits at
  // z0+0.125, only 0.125 in front of the back-wall plane and 0.125 behind
  // the socket's front face. There is no depth budget here, so the front
  // reads through its plank grooves and the posts flanking it, not through
  // relief. It runs from the door head to the cornice — unbroken, which is
  // what closes the shaft AND the cowl band in one board.
  span('walnut', -postX, postX, doorY, bodyTop, zFI, zFB, { r: R_THIN, seg: 2 });
  // Four corner posts. The front pair double as the door jambs.
  for (const s of [-1, 1]) {
    span('walnut', s * inX, s * postX, baseB, bodyTop, zFO - postD, zFO, { r: R_TRIM });
    span('walnut', s * inX, s * postX, baseB, bodyTop, zBO, zBO + postD, { r: R_TRIM });
  }

  // --- CORNICE: a real overhang, its top canted down toward the mouth ------
  const cant = 4 * Math.PI / 180;
  let corniceLeft = null;
  for (const s of [-1, 1]) {
    const c = span('walnutFlat', s * inX, s * capX, bodyTop, capTop, zBO - 0.16 * S, zFO,
      { uv: UV.flat, r: R_TRIM, rz: s * cant, weather: true });
    if (s < 0) corniceLeft = c;      // the shaded slab — the dressing mosses it
  }
  span('walnutFlat', -capX, capX, bodyTop, capTop, zBO - 0.16 * S, zBI,
    { uv: UV.flat, r: R_TRIM, rx: -cant });
  span('walnutFlat', -capX, capX, bodyTop, capTop, zFI, zFO, { uv: UV.flat, r: R_TRIM });

  // --- MOUTH: a flared hopper rim on three sides, a low pouring lip at the
  // front. The front cannot flare — flare means leaning out over z0+0.25,
  // and the socket ends there. Three sides plus a lip is the honest shape.
  const flare = 15 * Math.PI / 180;
  const rimH = 0.44 * S;
  for (const s of [-1, 1]) {
    span('walnut', s * (inX + 0.02), s * (inX + 0.44 * S), capTop, capTop + rimH,
      z0 - 3.76 * S, z0, { r: R_TRIM, rz: -s * flare });
  }
  span('walnut', -(capX - 0.1), capX - 0.1, capTop, capTop + rimH,
    zBI - 0.3 * S, zBI + 0.04, { r: R_TRIM, rx: -flare });
  span('walnut', -(capX - 0.1), capX - 0.1, capTop, capTop + rimH * 0.72, zFI, zFO,
    { r: R_THIN });

  // --- HOOD: the canted wedge roof over the doorway ------------------------
  // DEVIATION, stated plainly: this is the one piece that reaches past the
  // socket's front face (to z0+0.95). The engine's own HOOD volume runs to
  // z0+1.25 and asks to be shadowed; a roof flush with z0+0.25 shadows
  // nothing and the archetype loses its face. It stays above the exit
  // trajectory by ~1.2 units and carries no collider, like everything here.
  const hoodF = v.hood.c[2] + v.hood.s[2] / 2 - 0.24 * S;   // z0 + 0.95
  const hoodTilt = 18 * Math.PI / 180;
  {
    const w = 2 * (postX + 0.10 * S), h = 0.34 * S;
    const d = (hoodF - (z0 + 0.05)) / Math.cos(hoodTilt);
    const geo = roundedBox(w, h, d, R_TRIM, 1);
    planarUV(geo, UV.flat[0], UV.flat[1], rnd() * 0.4, rnd() * 0.4);
    const hood = new THREE.Mesh(geo, MAT.walnutFlat);
    hood.position.set(0, doorY + 0.50 * S, (z0 + 0.05 + hoodF) / 2);
    hood.rotation.x = hoodTilt;
    hood.castShadow = true; hood.receiveShadow = true;
    wood.add(hood); parts.push(hood);
  }
  // Corbels under the hood's ends — the detail that stops it floating.
  for (const s of [-1, 1]) {
    span('walnut', s * (postX - 0.30 * S), s * postX, doorY - 0.24 * S, doorY + 0.30 * S,
      zFI, z0 + 0.52 * S, { r: R_THIN });
  }

  // --- CHUTE: the apron, clad. Zero colliders: the cladding sits exactly on
  // the engine's ramp so a die rides the wood it appears to ride.
  {
    const geo = roundedBox(v.apron.s[0], v.apron.s[1], v.apron.s[2], R_TRIM, 1);
    planarUV(geo, UV.flat[0], UV.flat[1] * 1.6, 0.1, 0.3);
    const chute = new THREE.Mesh(geo, MAT.cherryFlat);
    chute.position.set(...v.apron.c);
    chute.rotation.x = v.apron.rx;
    chute.castShadow = true; chute.receiveShadow = true;
    wood.add(chute); parts.push(chute);
    // Cheeks, in the apron's own frame: they run the interior and stop just
    // outside the doorway. Anything raised further out on the felt would be
    // walked through by a settled die — a skin has no colliders to stop one.
    const ch = 0.36 * S, hw = v.apron.s[0] / 2;
    for (const s of [-1, 1]) {
      const g2 = roundedBox(0.30 * S, v.apron.s[1] * 0.55 + ch, v.apron.s[2] * 0.62, R_THIN, 1);
      planarUV(g2, UV.plank[0], UV.plank[1], rnd() * 0.4, rnd() * 0.4);
      const cheek = new THREE.Mesh(g2, MAT.cherry);
      cheek.position.set(s * (hw + 0.13 * S),
        (v.apron.s[1] * 0.55 + ch) / 2 - v.apron.s[1] / 2 + v.apron.s[1] * 0.225,
        -v.apron.s[2] * 0.12);
      cheek.castShadow = true; cheek.receiveShadow = true;
      chute.add(cheek); parts.push(cheek);
    }
  }

  // --- TRAY: the lip, clad, flush. No raised walls and no front bead for
  // the same reason the cheeks stop short — dice come to rest here and a
  // collider-less wall is a wall dice walk through. The bevelled edge of a
  // 0.08-proud board is the whole tray, and the light species is what makes
  // the dice on it read.
  {
    const geo = roundedBox(v.lip.s[0] + 0.15, v.lip.s[1], v.lip.s[2] + 0.1, 0.07, 1);
    planarUV(geo, UV.flat[0], UV.flat[1], 0.55, 0.2);
    const tray = new THREE.Mesh(geo, MAT.cherryFlat);
    tray.position.set(...v.lip.c);
    tray.rotation.x = v.lip.rx;
    tray.castShadow = true; tray.receiveShadow = true;
    wood.add(tray); parts.push(tray);
  }

  // --- THE ONE ASYMMETRY: a single iron bracket, left front post, plus its
  // rivets. Nothing on the right answers it. That is the point.
  {
    const bx = -(postX + 0.05);
    span('iron', bx - 0.06 * S, bx, 2.6 * S, 3.1 * S, z0 - 0.36 * S, z0 + 0.14 * S, { r: R_THIN });
    span('iron', bx - 0.06 * S, bx + 0.30 * S, 2.6 * S, 2.72 * S, z0 - 0.36 * S, z0 - 0.24 * S,
      { r: R_THIN });
    for (let i = 0; i < 3; i++) {
      const yy = 2.68 * S + i * 0.16 * S;
      span('iron', bx - 0.09 * S, bx - 0.01 * S, yy, yy + 0.07 * S,
        z0 - 0.30 * S + i * 0.02, z0 - 0.22 * S + i * 0.02, { r: R_THIN });
    }
  }

  // =========================================================================
  // THE DRESSING (docs/TOWER.md, DRESSING). Five props, one bold: a lit
  // cresset on the right corner post — the family trait, and the thing that
  // makes this a tower somebody LIT tonight rather than a piece of furniture.
  // The other four are quiet: ivy up the shaded left, moss where water sits,
  // a hoist beam that says the thing has a job, and one repair beside one
  // failure, which is what puts a date on a building.
  //
  // Everything opaque lives in `towerSkinDress` — measured by tower-fit,
  // counted by the occlusion proof. The instanced fields live in
  // `towerDressFx`, out of both, because bakeVertexAO's Box3.setFromObject
  // unions every instance of an InstancedMesh into ONE box (G8) and that box
  // would swallow the tower's own AO.
  // =========================================================================
  const dress = new THREE.Group();
  dress.name = 'towerSkinDress';
  group.add(dress);
  const fx = new THREE.Group();
  fx.name = 'towerDressFx';
  group.add(fx);
  // `cast` is a real parameter and not a tidy default: an ALPHA-TESTED plane
  // that casts a shadow is a rectangle of darkness on the wall behind it —
  // three's depth material does not carry the cutout reliably, and the ivy
  // panel's first cut printed a black slab up the post with the stems showing
  // through it as pale ghosts. Cutouts light, they do not shade.
  const addDress = (mesh, cast = true) => {
    ensureColor(mesh.geometry);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    dress.add(mesh); parts.push(mesh); return mesh;
  };

  // --- 1. THE CRESSET — the bold one, and the family's warm light ----------
  // Right corner post, upper third, ONE side only. It hangs from a bracket
  // and it SWINGS, which is the difference between a lit lamp and a decal;
  // the registry's `ember` row puts a point light at the coals so the glow
  // actually spills onto the post and the cornice above (an emissive map
  // shines but cannot illuminate).
  //
  // REACH IS BUDGETED. The basket's far face lands at z0+0.92 — inside the
  // envelope Heartwood's own door hood already occupies (z0+1.02), so this
  // adds no new class of deviation, only another member of one. Sideways was
  // refused: the socket's x wall is 3.25 and at `close` the mat's own wall is
  // 3.35 behind it, so an x overrun is a prop through the side of the room.
  const cressetX = 2.575, cressetY = 8.30;
  {
    const cageMat = new THREE.MeshStandardMaterial({
      map: M.cage.map, normalMap: M.cage.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: M.cage.roughnessMap, roughness: 1, metalness: 0.35,
      envMapIntensity: 0.45, vertexColors: true,
    });
    // 1.15: brighter than the forge's banked grate on purpose — this is a
    // small basket of LIVE fire, not a bed of coals going out.
    const fireMat = emberMaterial(M.coals, 1.6);
    const c = buildCresset({
      seed: 0x70c355, ironMat: MAT.iron, cageMat, fireMat,
      reach: 0.42, r: 0.25, basketH: 0.34, hangDrop: 0.16,
    });
    c.group.position.set(cressetX, cressetY, zFO);
    dress.add(c.group);
    for (const p of c.parts) { p.castShadow = true; p.receiveShadow = true; parts.push(p); }
    // 2.2° about z and 1.4° about x, out of phase: a hanging thing does not
    // swing in one plane. Tip travel ≈ 5 px at the resting eye, which is the
    // whole point — visible as life, invisible as animation.
    registerSway(group, c.hanger, { amp: 2.2 * Math.PI / 180, hz: 0.055, phase: 0.0, axis: 'z' });
    registerSway(group, c.hanger, { amp: 1.4 * Math.PI / 180, hz: 0.041, phase: 1.9, axis: 'x' });
  }

  // --- 2. IVY up the shaded left corner ------------------------------------
  // A guided walk in the post face's own (x, y): keep going, wander, climb,
  // and let gravity take more of the vote the older the strand gets. The
  // stems are a small NON-TILING alpha panel (a stem painted into the plank
  // bake would grow on all four sides of the tower at once); the leaves are
  // one InstancedMesh, one draw call, alpha-tested because an InstancedMesh
  // cannot sort its own instances (G4).
  // THE LEAN IS PART OF THE ARITHMETIC. −2.94 rather than −3.02: a leaf card
  // 0.26 across, rolled 25°, has a half-diagonal of 0.18, and at y 6 the
  // model's 0.7° lean has already spent another 0.07 of x. The socket's wall
  // is the one boundary with a real wall behind it (the mat's, at 3.35).
  const ivyU = [-2.94, -2.30], ivyV = [0.30, 6.20];
  {
    const paths = growIvy({
      seed: 0x70147, start: [-2.70, 0.34], strands: 3, steps: 46, step: 0.15,
      spread: 0.30, gravity: 0.40, branchP: 0.05, uLim: ivyU, vLim: ivyV,
    });
    const stemTex = bakeStems({
      size: 256, paths, uRange: ivyU, vRange: ivyV, seed: 0x70157, wStem: 0.052,
    });
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(ivyU[1] - ivyU[0], ivyV[1] - ivyV[0]),
      new THREE.MeshStandardMaterial({
        map: stemTex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide,
        roughness: 0.95, metalness: 0, envMapIntensity: 0.45, vertexColors: true,
      }));
    panel.position.set((ivyU[0] + ivyU[1]) / 2, (ivyV[0] + ivyV[1]) / 2, zFO + 0.014);
    addDress(panel, false);

    const leaves = ivyLeaves({ paths, seed: 0x70133, every: 2.8, size: 0.20 });
    const up = new THREE.Vector3(0, 0, 1);
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    const dir = new THREE.Vector3();
    const items = leaves.map((l) => {
      dir.set(0, l.tilt, 1).normalize();
      q.setFromUnitVectors(up, dir);
      q2.setFromAxisAngle(dir, l.roll);
      return {
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(l.u, l.v, zFO + l.lift),
          q2.multiply(q), new THREE.Vector3(l.scale, l.scale, l.scale)),
        tint: l.tint,
      };
    });
    fx.add(instancedField({
      geo: new THREE.PlaneGeometry(1, 1), material: leafMaterial(M.leaf),
      items, name: 'dressIvyLeaves',
    }));
  }

  // --- 3. MOSS where water sits --------------------------------------------
  // Two of the tower's own meshes take a mossed print of the canvas they were
  // already wearing (see maps()): the ground course of the plinth, heaviest,
  // and the LEFT cornice slab, light — the shaded side, the same side the ivy
  // is on. Nothing on the right answers either. Zero triangles.
  //
  // …and tufts where an EDGE shows, because texture-space moss has no
  // silhouette and a mossy ledge with a razor edge is a mossy ledge nobody
  // believes. Clustered at the base on the left, and outside |x| 2.6 so
  // nothing stands in the delivery lane.
  plinthBottom.material = MAT.walnutMoss;
  corniceLeft.material = MAT.walnutFlatMoss;
  {
    const rndT = mulberry32(0x70744f);
    const items = [];
    for (let i = 0; i < 9; i++) {
      const s = 0.16 + rndT() * 0.14;
      // …and never past x −3.05: a card 0.45 wide centred on −3.12 puts its
      // corner at −3.34, outside the socket's own wall, for a tuft of moss.
      const x = -2.90 + rndT() * 0.62;
      const zj = zFO + 0.02 + rndT() * 0.05;
      items.push({
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(x, s * 0.46, zj),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (rndT() - 0.5) * 0.9, (rndT() - 0.5) * 0.3)),
          new THREE.Vector3(s * 1.5, s, s)),
        tint: [0.8 + rndT() * 0.4, 0.85 + rndT() * 0.3, 0.75 + rndT() * 0.35],
      });
    }
    for (let i = 0; i < 4; i++) {
      const s = 0.13 + rndT() * 0.10;
      items.push({
        matrix: new THREE.Matrix4().compose(
          // −2.84, not −3.0: the whole model leans 0.7° about z, and at the
          // cornice's height that is another 0.13 of x on top of the card's
          // own half-width. The socket wall does not care that a tuft is
          // decoration.
          new THREE.Vector3(-2.84 + rndT() * 0.6, capTop + s * 0.42, zFO - 0.04 - rndT() * 0.3),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (rndT() - 0.5) * 1.2, 0)),
          new THREE.Vector3(s * 1.4, s, s)),
        tint: [0.75 + rndT() * 0.35, 0.8 + rndT() * 0.3, 0.7 + rndT() * 0.3],
      });
    }
    fx.add(instancedField({
      geo: new THREE.PlaneGeometry(1, 1), material: leafMaterial(M.tuft),
      items, name: 'dressMossTufts',
    }));
  }

  // --- 4. THE HOIST — the one horizontal projection, and it has a job ------
  // A short beam off the upper front face with a slack rope and a coil hung
  // at its end. Interrupted work beats tidy work: the rope is not on a cleat.
  // Its reach (z0+0.96) is the door hood's class again, and it lives at
  // y 9.3 — nine units above anything that ever moves.
  {
    const bx = -1.55, by = 9.30, reach = 0.72;
    const beam = new THREE.Mesh(mergeGeos([
      { geo: propUV(roundedBox(0.15, 0.15, reach, R_TRIM, 1), 1.2),
        matrix: xform({ pos: [0, 0, reach / 2] }) },
      { geo: propUV(roundedBox(0.11, 0.11, reach * 0.8, R_TRIM, 1), 1.2),
        matrix: xform({ pos: [0, -reach * 0.26, reach * 0.36], rot: [-34 * Math.PI / 180, 0, 0] }) },
    ]), MAT.walnut);
    beam.position.set(bx, by, zFO);
    addDress(beam);

    const ropeMat = new THREE.MeshStandardMaterial({
      map: M.rope.map, normalMap: M.rope.normalMap, normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: M.rope.roughnessMap, roughness: 1, metalness: 0,
      envMapIntensity: 0.45, vertexColors: true,
    });
    const tipZ = zFO + reach - 0.06;
    const hang = buildRope({
      points: [[bx, by - 0.06, tipZ], [bx - 0.02, by - 0.55, tipZ - 0.02],
        [bx - 0.03, by - 1.05, tipZ - 0.06], [bx - 0.04, by - 1.42, tipZ - 0.12]],
      r: 0.042, seg: 14, material: ropeMat,
    });
    addDress(hang);
    const coil = buildRope({
      points: coilPoints({ at: [bx - 0.04, by - 1.44, tipZ - 0.14], R: 0.21, turns: 2.6, drop: 0.30, n: 26 }),
      r: 0.042, seg: 30, material: ropeMat,
    });
    addDress(coil);
  }

  // --- 5. ONE REPAIR AND ONE FAILURE — the pair that sets a timescale ------
  // A pale replacement board on the front (somebody maintains this) and, at
  // the cornice's left corner, two eaves boards sprung loose (and somebody
  // has not got to that yet). Neither is centred; the repair is right of
  // centre and the failure is far left, so the elevation cannot be mirrored.
  {
    const pale = new THREE.MeshStandardMaterial({
      map: M.walnut.map, normalMap: M.walnut.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
      roughnessMap: M.walnut.roughnessMap, roughness: 1, metalness: 0,
      // Sawn last season: the same timber, none of the weather. The map is
      // the walnut's own and `color` is what makes it new.
      color: 0xd9bd97, envMapIntensity: 0.45, vertexColors: true,
    });
    const w = 0.86, y0 = 5.30, y1 = 8.60, x0 = 0.55;
    const geo = roundedBox(w, y1 - y0, 0.026, R_THIN, 1);
    planarUV(geo, UV.plank[0], UV.plank[1], rnd() * 0.4, rnd() * 0.4);
    const plank = new THREE.Mesh(geo, pale);
    plank.position.set(x0 + w / 2, (y0 + y1) / 2, zFB + 0.022);
    addDress(plank);

    // The failure: the boards on the cornice's left corner, one lifted and
    // one shoved out of line. Two boards in ONE merged geometry — the story
    // is the pair, and the pair is one draw call.
    const board = (w2, d2) => propUV(roundedBox(w2, 0.075, d2, R_THIN, 1), 2.4);
    const sprung = new THREE.Mesh(mergeGeos([
      { geo: board(0.95, 0.62),
        matrix: xform({ pos: [-2.42, capTop + 0.085, zFO - 0.34], rot: [-0.07, 0.05, 0.115] }) },
      { geo: board(0.52, 0.58),
        matrix: xform({ pos: [-1.60, capTop + 0.035, zFO - 0.40], rot: [0.02, -0.09, -0.03] }) },
    ]), MAT.walnutFlat);
    addDress(sprung);
  }

  bakeVertexAO(parts, group);

  // The aged base (weatherPass): wood wears at the arrises the rake grazes
  // and where hands and dice actually pass — the door band — not uniformly.
  // The -x flank is the weather side (it is already the ivy's shaded side,
  // so age and growth agree about which way this tower faces the rain).
  weatherPass(parts, {
    edge: 1.15, grime: 0.7, dust: 0.55, drift: 0.11, weatherSide: -1,  // Joe: wood -20%, edges way up
    edgeGate: (p, n) => 0.55 + 0.45 * clamp01(0.5 - 0.5 * n.x)
      * (0.35 + 0.65 * clamp01(1 - Math.abs(p.y - 2.5) / 5)),
  });

  // --- WEATHERING IN THE VERTEX COLOURS, after the AO bake -----------------
  // GRAVITY GOVERNS ALL WEATHERING: damp at the ground, damp on the shaded
  // flank, and nothing anywhere above. The tiled world-scale UVs cannot carry
  // this (a stain in the tile repeats wherever the tile does), so it rides
  // the vertex colours instead — world space, zero triangles, zero textures.
  gravityStain(parts, (p, n, out) => {
    // Ground damp: strongest at the felt, gone by y 1.6.
    const damp = clamp01(1 - p.y / 1.6);
    // The shaded flank: the ivy's side, and only surfaces actually facing it.
    const shade = clamp01(-n.x) * clamp01(1 - p.y / 5.0) * 0.55;
    const k = Math.max(damp * 0.9, shade);
    if (k < 0.02) return false;
    out[0] = 1 - 0.16 * k; out[1] = 1 - 0.07 * k; out[2] = 1 - 0.22 * k;
    return true;
  });

  // --- AO layer (b): an unlit near-black lining. Everything above this
  // point is lit wood; everything below is light that never arrives.
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a0806, side: THREE.DoubleSide });
  const lining = new THREE.Group();
  lining.name = 'towerSkinLining';
  const plane = (w, h, px, py, pz, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dark);
    m.position.set(px, py, pz);
    if (ry) m.rotation.y = ry;
    lining.add(m);
  };
  const liningTop = bodyTop, liningBot = sill - 0.4;
  const lh = liningTop - liningBot, ly = (liningTop + liningBot) / 2;
  plane(2 * inX, lh, 0, ly, zBI + 0.012, 0);
  plane(zFI - zBI, lh, -(inX - 0.012), ly, boreZ, Math.PI / 2);
  plane(zFI - zBI, lh, inX - 0.012, ly, boreZ, Math.PI / 2);
  plane(2 * inX, bodyTop - doorY, 0, (bodyTop + doorY) / 2, zFI - 0.008, 0);
  group.add(lining);

  // --- AO layer (c): gradient veils. One lies on the chute at the bottom of
  // the mouth (a die never gets there — despawn is at v.despawnY, far
  // above), one hangs in the doorway so a die inside the tower is veiled
  // until its own motion carries it out.
  const veilMat = () => new THREE.MeshBasicMaterial({
    map: M.veil, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  {
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(2 * inX * 0.95, 3.6 * S), veilMat());
    pit.rotation.x = -Math.PI / 2 + v.apron.rx;
    const surfY = sill + (z0 - boreZ) * Math.tan(-v.exit.pitch);
    pit.position.set(0, surfY + 0.05, boreZ);
    group.add(pit);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2 * doorX + 0.4, doorY - sill + 1.0),
      veilMat());
    door.position.set(0, (doorY + sill) / 2 - 0.1, zFI - 0.02);
    group.add(door);
  }

  // --- AO layer (d): soft contact shadows. Subtle, unlit, and flat on the
  // felt so nothing can clip them.
  {
    const shMat = () => new THREE.MeshBasicMaterial({
      map: M.shadow, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(2 * capX + 2.6, (zFO - zBO) + 2.6), shMat());
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, 0.006, (zFO + zBO) / 2);
    group.add(base);
    const trayShadow = new THREE.Mesh(new THREE.PlaneGeometry(v.lip.s[0] + 1.6, 2.0), shMat());
    trayShadow.rotation.x = -Math.PI / 2;
    trayShadow.position.set(0, 0.005, v.lip.c[2] + v.lip.s[2] / 2 + 0.35);
    group.add(trayShadow);
  }

  // Hand-built things are never plumb. Z only: a lean about x or y would
  // push the front board through the bore's front tangent, and there is no
  // room there (see zFI).
  group.rotation.z = TILT;
  group.userData.socketMaxZ = Math.max(zFO, hoodF);
  group.userData.xLim = xLim;
  return group;
}
