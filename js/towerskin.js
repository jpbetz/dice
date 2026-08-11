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

// One pass paints BOTH the colour canvas and the height canvas, because
// they share every noise lookup — the height field carries seams, pores and
// plank bevels ONLY (never the ring colour: ring colour in a normal map is
// the classic "wood made of corrugated iron" tell).
function bakeWood({ size, stops, planks, seed, cathedral }) {
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

  const map = new THREE.CanvasTexture(cCan);
  map.colorSpace = THREE.SRGBColorSpace;   // colour only
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;

  const normalMap = heightToNormal(hCan, 1.0);
  const roughnessMap = roughFromHeight(hCan, 256, seed + 999);
  return { map, normalMap, roughnessMap };
}

// Sobel a height sketch into a tangent-space normal map (OpenGL +Y). LINEAR
// data — no colorSpace tag, that would bend the vectors. Sampling wraps
// modulo W so the result is as seamless as its input.
// (js/dice.js has the same routine but does not export it; duplicating ~20
// lines beats widening that module's surface for a lab-only skin.)
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
      const dy = (h(x, y - 1) - h(x, y + 1)) * strength * 2; // canvas y is down
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
  MAPS = {
    walnut: bakeWood({ size: 512, stops: WALNUT, planks: 6, seed: 0x7047e1, cathedral: false }),
    cherry: bakeWood({ size: 512, stops: CHERRY, planks: 6, seed: 0x3c9a11, cathedral: false }),
    walnutFlat: bakeWood({ size: 256, stops: WALNUT, planks: 1, seed: 0x51d302, cathedral: true }),
    cherryFlat: bakeWood({ size: 256, stops: CHERRY, planks: 1, seed: 0x1a8b74, cathedral: true }),
    veil: veilTexture(256, 0.92),
    shadow: veilTexture(256, 0.55),
  };
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
      col[i * 3] = AO_MIN[0] + (1 - AO_MIN[0]) * k;
      col[i * 3 + 1] = AO_MIN[1] + (1 - AO_MIN[1]) * k;
      col[i * 3 + 2] = AO_MIN[2] + (1 - AO_MIN[2]) * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
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
  span('walnut', -(capX + 0.13 * S), capX + 0.13 * S, 0, baseA, zBO - 0.16 * S, zFO,
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
  for (const s of [-1, 1]) {
    span('walnutFlat', s * inX, s * capX, bodyTop, capTop, zBO - 0.16 * S, zFO,
      { uv: UV.flat, r: R_TRIM, rz: s * cant, weather: true });
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

  bakeVertexAO(parts, group);

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
