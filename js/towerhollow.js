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

// HOLLOW BOLE — the fourth tower skin (docs/TOWER.md), and the fae venue's:
// a ROTTED HOLLOW TRUNK. A dead snag with its top torn off, its bark in
// plates, its heartwood gone, and a moot of foxfire caps convening around
// the broken crown. Dice fall down the hollow and come out of a root gap.
//
// ---------------------------------------------------------------------------
// STATUS, 2026-08-12: THE SHELL IN HERE IS INTERIM AND IS EXPECTED TO GO
// ---------------------------------------------------------------------------
// The owner's reference is a broken STUMP, not a snag: stocky, a torn
// frontal wound opening into black, splinter spires for a crown, heavy
// buttress roots, pale barkless fibre with bark surviving only low on the
// flanks. This file's shell cannot be that shape, and the reason is worth
// writing down rather than attempting: it is built out of `roundedBox` and
// lobed `ExtrudeGeometry` courses, which is the towerskin kit's whole
// vocabulary, and a box stack reads as a rectangular tower wearing bark no
// matter how the boxes are arranged. A parametric displaced shell — a
// radius field r(θ, y) carrying buttress lobes, a ground flare, fibre
// striation, splinter spires and the wound as an inward fold — is a
// different technique, and it is being prototyped separately.
//
// So the shell is ONE FUNCTION behind ONE descriptor (see THE SHELL IS ONE
// SWAPPABLE FUNCTION, below), the interim one is named
// `towerSkinBolePlaceholder` so nobody mistakes it for the ship shape, and
// EVERYTHING ELSE in this file is written against the descriptor rather
// than against the shell's own numbers: the moot ring, the shelf fungus,
// the little door and the value ladder all place themselves by (θ, y) on
// whatever surface they are handed. Dropping the real shell in is one
// import and one default parameter.
//
// What is already proven against the interim shell and carries over
// unchanged, because none of it is geometry: the registry row and its
// clunk voice, the ember door light, `venueOnly`, `motes: false`, the
// server allowlist, the picker skip, the two-palette value ladder, the
// e2e scenario and its red checks, and the four contract proofs' harness.
// Zero colliders, zero lights, and it never reads or writes the film; every
// number below comes out of `towerVolumes()`, so a retune of S, the mat or
// the zoom ladder moves the model with the contract.
//
// It is a VENUE tower (js/main.js VENUES): the Moonrise Glade and the
// Foxfire Hollow socket the same model under two skies, so nothing here
// hardcodes a colour. Every hue is read from `FAE_PALETTES[paletteId]`
// (js/fae-lab.js) at BUILD time, and the palette id is handed in by the
// caller — which is why the builder takes an options object at all.
//
// The kit is Heartwood's, Bastion's and Black Anvil's, imported rather than
// forked (js/towerskin.js exports it): seeded tileable noise, the Sobel
// height→normal pass, roughness off the same height field, rounded boxes,
// planar UVs, the raycast vertex-AO bake, weatherPass, gravityStain, the
// unlit near-black lining, gradient veils, contact shadows; and from
// js/towerdress.js the merge helpers, grime/dust and registerSway. What is
// new here is `bakeBark` (plates, vertical fissures, sloughed sapwood),
// `bakePunk` (cubical brown rot), `bakeFoxfire` (fungus flesh + gill glow)
// and `boleRing` — Bastion's `drumCourse` generalised to a LOBED profile,
// which is what stops a trunk reading as a drainpipe. `boleRing` is a new
// function rather than a move of Bastion's, because the two differ in their
// whole reason to exist: `drumCourse` is a circle whose clip angle has a
// closed form, `boleRing` is a seeded radius function whose two clip angles
// (they differ, and that asymmetry is free silhouette) come out of a
// bisection. Nothing is copied from a sibling skin.
//
// ---------------------------------------------------------------------------
// §1.5 THE FREE VOLUME, MEASURED BEFORE ANYTHING WAS DRAWN
// ---------------------------------------------------------------------------
// At S = 1.25, every z relative to z0:
//
//   socket          x ±3.25 · y 0…12.5 · z z0−5.25 … z0+0.25
//   bore            r 2.125 about (0, z0−2.0) → front tangent z0+0.125
//   doorway (clear) |x| ≤ 2.5, y ≤ 4.5; apron top at the sill y = 1.0
//   entry drop      y = 11.25, aim |x| ≤ 0.5, die radius ≤ 1.25
//   despawn         y = 7.0 · SHAFT band sampled 7.0 / 7.25 / 7.6 to r 2.0
//   COWL band       y 7.75 … 10.75, sampled to r 2.0 about the bore axis
//   HOOD volume     x ±2.875 · y 1.0…4.0 · z z0 … z0+1.25
//   apron (ramp)    c (0, 1.141, z0−1.605) s 4.75×1.25×7.313, rx 28.07°
//   lip (tray)      c (0, −0.42, z0+2.8) s 4.8×1.0×2.2, rx ~5°
//
// Six things the brief asked for that the numbers refused or reshaped, each
// resolved before a line of geometry was written:
//
//  1. "A round trunk." Round everywhere but the front, exactly as Bastion's
//     drum found: the bore's front tangent is z0+0.125 and the socket's face
//     is z0+0.25, so there is 0.125 of material dead ahead and 0.09 of it is
//     usable. The bole is a lobed shell ENGAGED in the back wall, clipped
//     across the front, with a flat facade closing the opening above the
//     door head. Relief lives on the shoulders, the crown and the roots,
//     where radius is free.
//  2. "The doorway as a root-gap arch." The arch cannot be a lintel across
//     the doorway: |x| ≤ 2.5 must stay clear to y = 4.5, and the shell's own
//     reveal faces already stand at |x| ≈ 2.3. So the arch is the FACADE's
//     bottom edge — a curve springing from the reveals at y 4.58 to an apex
//     at y 5.25, offset LEFT of centre — and the reveals are its jambs.
//     Nothing the model owns is inside the aperture.
//  3. "A broken, uneven crown." A torn rim cannot be one extrusion, and it
//     cannot dip freely either. Measured against the wide `eyeFull` (y 13.3,
//     the only shipped eye ABOVE the COWL band): a ray to the deepest,
//     highest cowl sample (0, 10.6, z0−4.0) crosses the facade plane at
//     y 11.22, so a front that stops below that is a sightline onto the
//     despawn line. The CLOSED ring therefore runs to 11.62 all the way
//     round — 0.40 of margin — and the tear is seven crown teeth ABOVE it,
//     11.68 … 12.34, jittered, with one tooth missing entirely. Bastion's
//     parapet rule in a dead tree's clothes: the teeth decorate, the ring
//     occludes, and tower-occlusion is what says so.
//
//     AND THE RED CHECK CORRECTED WHICH LAYER IS LOAD-BEARING — the same
//     way Black Anvil's did. Four runs of tower-occlusion, the full 2×2:
//       facade top 11.74 + lining top 11.62 → 99/99 (ships)
//       facade top 11.74 + lining top 10.20 → 99/99  the FACADE carries it
//       facade top 10.70 + lining top 11.62 → 99/99  the LINING carries it
//       facade top  8.40 + lining top  8.30 → RED at all six eyes
//                                             (cowl 10/99 … 36/99)
//     So the front of the COWL band is carried REDUNDANTLY: the facade
//     plate and the unlit `towerSkinLining` back plane each suffice alone,
//     which is a margin worth knowing about and NOT a licence to shorten
//     either. Note what this also says: the crown RING's height is not
//     what closes the front at all — it closes the flanks, and the teeth
//     are decoration on top of it. Shortening BOTH front layers is the one
//     edit that turns this tower into a leak, and the proof can see it.
//  4. "Mushrooms too large for the ground" (grammar rule 10 — scale wrong in
//     exactly ONE direction). The trunk is honest and the fungus is not: the
//     moot's two modelled caps and the three shelf brackets run 0.34–0.52 u,
//     which is a dinner plate on a tree. The bole's own proportions are left
//     alone, so there is one wrongness and not two.
//  5. "Roots that become the tray surround." A root arm lying beside the
//     tray is UNCLASSIFIED to tower-fit (outside the socket in +z, above the
//     felt, not cladding) — and it is a prop dice pass through, because a
//     skin has no colliders. So the surround IS the apron and lip cladding,
//     with root cheeks in the apron's own rotated frame, exactly where
//     Bastion puts its chute cheeks.
//  6. "A tiny lit door at y ≈ 1.2 on the facade." There is no facade at
//     y 1.2 — that height is the doorway. The door goes on the LEFT ROOT
//     BUTTRESS instead, whose pad face is at z0+0.22 and whose inner edge
//     stands at |x| 2.52, clear of the aperture by 0.02. Better than the
//     brief: the big root gap is where the dice come out, and the little
//     door beside it is where somebody lives.
//
// THE GLOW IS EMISSIVE MAPS AND NOTHING ELSE (techniques.md T2). No mesh in
// this file carries `userData.bloom` — an always-on bloom source disables
// the post-stack bypass for the whole app, which is 70–90% of a frame's GPU
// for a glow that can be baked. The one real light is the registry row's
// ember at the little door, and it lives in the ROW, not here.
//
// AND THE LIGHT MUST BE SEEN, WHICH IS NOT THE SAME AS BEING EMITTED. The
// anti-kitsch list says light comes from UNDER the gills, and a flat disc
// facing straight down at a camera 40–60° above it contributes exactly zero
// pixels. So a gill surface here is a FLARED OPEN SKIRT under the cap — it
// faces outward AND down, which is both what a gill actually does and the
// only version of it the shipped eyes can see.
//
// THE VALUE LADDER, authored to the linear bloom threshold (0.9) rather than
// dialled by eye, because there is no post-hoc knob (grammar rule 3):
//   door hearth    0.60 linear  — the one warm accent
//   moot caps      0.50 linear  — secondary; the fallen one is in this tier
//   shelf gills    0.40 linear  — secondary, lower because they are wide
//   attendants     0.13 linear  — TERTIARY, two full stops under the caps
// Each is enforced by dividing the target by the hue's own linear luminance,
// so the two palettes come out at the same VALUE with different colour —
// which is the only way "both skies" can mean anything. `towerMootAudit`
// reads these back off the live materials.

import * as THREE from 'three';
import {
  mulberry32, fbm, turb, clamp01, smoothstep, ramp3,
  mapsFromCanvases, veilTexture,
  roundedBox, planarUV, weather, bakeVertexAO, weatherPass, bakeEmber,
} from './towerskin.js';
import {
  grimePass, dustPass, gravityStain, mergeGeos, xform, propUV,
  registerSway, ensureColor,
} from './towerdress.js';
import { FAE_PALETTES } from './fae-lab.js';
import { buildStumpShell } from './towerbole.js';

// ---------------------------------------------------------------------------
// Palette plumbing
// ---------------------------------------------------------------------------
// sRGB hex → linear luminance. Written out rather than leaning on
// THREE.Color's working-space conversion, because the value ladder above is
// something a scenario reads back, and "whatever ColorManagement did this
// month" is not a number anybody can check.
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearLuma(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// The emissiveIntensity that puts a given hue at a given LINEAR luminance.
function intensityFor(hex, targetLuma) {
  return Math.min(4, targetLuma / Math.max(0.02, linearLuma(hex)));
}

// The four tiers, as linear luminance. Exported because the proof asserts
// against them rather than against numbers retyped in a test file.
export const HOLLOW_TIER = {
  door: 0.60,
  caps: 0.50,
  gills: 0.40,
  attendant: 0.13,
};

// THE HEARTH IS THE TOWER'S OWN WARM ACCENT AND IT DOES NOT CHANGE WITH THE
// SKY — a fire is the same colour in both woods, and grammar rule 1 allows
// exactly one warm accent per frame whichever venue is up. It is read from
// the `accent` ROLE rather than typed, so it tracks the palette table; the
// moonrise row is where that role's canonical warm value lives. (Foxfire's
// accent has been both a warm ember and a cold moon across the concept
// rounds; the door is not the place to discover which, because the registry
// row's PointLight has to agree with the pane and the row is static.)
export const HOLLOW_EMBER = FAE_PALETTES.moonrise.accent;

// A hex → 8-bit triple, for the canvas ramps; and a blend of two.
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixc(a, b, k) {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// ---------------------------------------------------------------------------
// bakeBark — plates, vertical fissures, and the sapwood the bark left behind
// ---------------------------------------------------------------------------
// bakeStone draws things that are LAID and bakeWood draws things that are
// SAWN. Bark is neither: it is a skin that SPLITS. What it has is
//   · vertical FURROWS at an irregular pitch — the coordinate is a furrow
//     count warped by two octaves of isotropic turbulence, the same trick
//     bakeWood plays with growth rings, because the tileable noise kit wraps
//     at ONE period in both axes and cannot be stretched anisotropically;
//   · horizontal CRACKS across the plates, so the plates are tiles and not
//     stripes (a trunk textured with stripes alone reads as corduroy);
//   · SLOUGHED PATCHES where a plate has come off, showing pale smooth
//     sapwood underneath. That is wear, and it is also the only internal
//     value variation a near-black trunk has — without it the model is one
//     silhouette-shaped blob at the resting eye.
// The height channel carries the furrows and the cracks and goes FLAT in the
// sloughed patches: bark relief on bare wood is the tell that a patch was
// painted rather than lost.
function bakeBark({ size, stops, sapStops, seed, furrows = 6, plates = 5, sap = 0.55 }) {
  const W = size;
  const cCan = document.createElement('canvas'); cCan.width = cCan.height = W;
  const hCan = document.createElement('canvas'); hCan.width = hCan.height = W;
  const cImg = cCan.getContext('2d').createImageData(W, W);
  const hImg = hCan.getContext('2d').createImageData(W, W);

  for (let py = 0; py < W; py++) {
    const vv = py / W;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      // The furrow coordinate: a count, warped so the fissures wander the
      // way a split in bark does instead of ruling a grid.
      // LOOKED AT, THEN CALMED. The first cut warped the furrow coordinate
      // by ±0.86 of a furrow width, so neighbouring furrows crossed and
      // merged and the trunk came back wearing a crazed-glaze web — marble,
      // or lichen, but not bark. A furrow WANDERS; it does not braid. The
      // warp is a quarter of what it was and the furrow itself is twice as
      // wide, which is what makes the fissures read as vertical at all.
      const warp = 0.22 * (turb(u * 3, vv * 3, 3, 4, seed + 13) * 2 - 1)
        + 0.10 * (turb(u * 7, vv * 7, 7, 3, seed + 29) * 2 - 1);
      const fr0 = furrows * u + warp;
      const fr = fr0 - Math.floor(fr0);
      const furrow = 1 - smoothstep(0.0, 0.155, Math.min(fr, 1 - fr));
      // …and the cracks across them, on their own warp, so plate ends never
      // line up column to column. Weaker than the furrows on purpose: a
      // plate is taller than it is wide.
      const cw = 0.22 * (turb(u * 5, vv * 5, 5, 3, seed + 53) * 2 - 1);
      const cr0 = plates * vv + cw;
      const cr = cr0 - Math.floor(cr0);
      const crack = (1 - smoothstep(0.0, 0.040, Math.min(cr, 1 - cr))) * 0.70;
      const seam = clamp01(Math.max(furrow, crack));

      // The plate face: mid-frequency mottle plus a broad tonal drift, so no
      // two plates average to the same value.
      const mot = fbm(u * 11, vv * 11, 11, 4, seed + 71);
      const drift = fbm(u * 2, vv * 2, 2, 3, seed + 97);
      let t = clamp01(0.30 + 0.34 * mot + 0.26 * drift);
      t = clamp01(t - 0.62 * seam);
      let [r8, g8, b8] = ramp3(stops, t);

      // THE SLOUGHED PATCHES. Low frequency, biased to sit where the plates
      // are already broken (bark comes off where it is cracked).
      const sm = smoothstep(0.56, 0.78, fbm(u * 3, vv * 3, 3, 4, seed + 131))
        * (0.65 + 0.5 * crack);
      const k = clamp01(sap * sm);
      let h = 0.60 - 0.40 * seam + 0.05 * (mot - 0.5)
        + 0.03 * (fbm(u * 32, vv * 32, 32, 2, seed + 7) - 0.5);
      if (k > 0) {
        const sapT = clamp01(0.35 + 0.5 * fbm(u * 17, vv * 17, 17, 3, seed + 149));
        const [sr, sg, sb] = ramp3(sapStops, sapT);
        r8 += (sr - r8) * k; g8 += (sg - g8) * k; b8 += (sb - b8) * k;
        h += (0.66 - h) * k;                     // the relief goes with it
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
  return { ...mapsFromCanvases(cCan, hCan, seed), colorCanvas: cCan, heightCanvas: hCan };
}

// ---------------------------------------------------------------------------
// bakePunk — rotted heartwood: the delivery run, the torn ends, the door pad
// ---------------------------------------------------------------------------
// Punky wood has no grain left to speak of; it has CUBICAL ROT — brown rot
// checks the timber into little blocks. Turbulence cells at two scales, a
// pale bloom of mycelium in the deepest checks, and it stays the LIGHTEST
// material on the model on purpose: Black Anvil's ledger is right that a die
// has to read against whatever it comes to rest on, and the tray is this.
function bakePunk({ size, stops, bloomStops, seed, cells = 9, bloom = 0.45 }) {
  const W = size;
  const cCan = document.createElement('canvas'); cCan.width = cCan.height = W;
  const hCan = document.createElement('canvas'); hCan.width = hCan.height = W;
  const cImg = cCan.getContext('2d').createImageData(W, W);
  const hImg = hCan.getContext('2d').createImageData(W, W);
  for (let py = 0; py < W; py++) {
    const vv = py / W;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      const ca = turb(u * cells, vv * cells, cells, 3, seed + 5);
      const cb = turb(u * cells * 3, vv * cells * 3, cells * 3, 2, seed + 17);
      const check = clamp01(1 - smoothstep(0.05, 0.30, ca) * 0.8
        - 0.35 * (1 - smoothstep(0.06, 0.26, cb)));
      const mot = fbm(u * 6, vv * 6, 6, 4, seed + 41);
      const t = clamp01(0.30 + 0.44 * mot - 0.30 * check);
      let [r8, g8, b8] = ramp3(stops, t);
      const bl = clamp01(bloom * smoothstep(0.55, 0.85, fbm(u * 4, vv * 4, 4, 3, seed + 83))
        * (0.4 + 0.8 * check));
      if (bl > 0) {
        const [br, bg, bb] = ramp3(bloomStops, clamp01(0.3 + 0.6 * mot));
        r8 += (br - r8) * bl; g8 += (bg - g8) * bl; b8 += (bb - b8) * bl;
      }
      const h = clamp01(0.58 - 0.30 * check + 0.06 * (mot - 0.5));
      const i = (py * W + px) * 4;
      cImg.data[i] = clamp01(r8 / 255) * 255;
      cImg.data[i + 1] = clamp01(g8 / 255) * 255;
      cImg.data[i + 2] = clamp01(b8 / 255) * 255;
      cImg.data[i + 3] = 255;
      const hv = h * 255;
      hImg.data[i] = hv; hImg.data[i + 1] = hv; hImg.data[i + 2] = hv; hImg.data[i + 3] = 255;
    }
  }
  cCan.getContext('2d').putImageData(cImg, 0, 0);
  hCan.getContext('2d').putImageData(hImg, 0, 0);
  return { ...mapsFromCanvases(cCan, hCan, seed), colorCanvas: cCan, heightCanvas: hCan };
}

// ---------------------------------------------------------------------------
// bakeFoxfire — fungus flesh, and the GILLS that carry the light
// ---------------------------------------------------------------------------
// Four canvases in one pass. The emissive one is RIBS IN u with an envelope
// in v, which is the one pattern that serves both surfaces the fungus is
// made of: on the flared gill skirt (a cylinder, u around) the ribs radiate
// like gills; on a cap dome (a sphere, u around) they are the same fluting.
// A radial fan in canvas polar coordinates would have been prettier on a
// disc and wrong on everything else.
//
// The low-frequency envelope is bakeEmber's lesson in green: most of any one
// bracket is dark and the live parts are colonies, which is what real
// foxfire does and what stops a bracket reading as a strip of tape.
function bakeFoxfire({ size, fleshStops, seed, ribs = 26, glow = 1 }) {
  const W = size;
  const cCan = document.createElement('canvas'); cCan.width = cCan.height = W;
  const hCan = document.createElement('canvas'); hCan.width = hCan.height = W;
  const eCan = document.createElement('canvas'); eCan.width = eCan.height = W;
  const cImg = cCan.getContext('2d').createImageData(W, W);
  const hImg = hCan.getContext('2d').createImageData(W, W);
  const eImg = eCan.getContext('2d').createImageData(W, W);
  const TAU = Math.PI * 2;
  for (let py = 0; py < W; py++) {
    const vv = py / W;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      // ZONATION: a bracket fungus is banded in concentric growth zones, and
      // the bands are most of what makes it read as fungus rather than shell.
      const zone = 0.5 + 0.5 * Math.sin(vv * 21 + 1.3 * fbm(u * 5, vv * 5, 5, 3, seed + 11));
      const mot = fbm(u * 13, vv * 13, 13, 3, seed + 31);
      const t = clamp01(0.28 + 0.34 * zone + 0.30 * mot);
      const [r8, g8, b8] = ramp3(fleshStops, t);
      // GILLS: ribs in u, wandering, sharpened.
      const rib = 0.5 + 0.5 * Math.cos(u * TAU * ribs
        + 2.2 * fbm(u * 4, vv * 4, 4, 2, seed + 61));
      const fan = Math.pow(rib, 1.5);
      const env = smoothstep(0.18, 0.62, fbm(u * 3, vv * 3, 3, 3, seed + 91));
      const e = clamp01(glow * fan * (0.30 + 0.85 * env));
      const h = clamp01(0.55 + 0.16 * (zone - 0.5) + 0.10 * (mot - 0.5) - 0.12 * fan);
      const i = (py * W + px) * 4;
      cImg.data[i] = clamp01(r8 / 255) * 255;
      cImg.data[i + 1] = clamp01(g8 / 255) * 255;
      cImg.data[i + 2] = clamp01(b8 / 255) * 255;
      cImg.data[i + 3] = 255;
      const hv = h * 255;
      hImg.data[i] = hv; hImg.data[i + 1] = hv; hImg.data[i + 2] = hv; hImg.data[i + 3] = 255;
      // WHITE emissive: material.emissive supplies the palette hue, exactly
      // as emberMaterial does, so one bake serves both skies.
      const ev = e * 255;
      eImg.data[i] = ev; eImg.data[i + 1] = ev; eImg.data[i + 2] = ev; eImg.data[i + 3] = 255;
    }
  }
  cCan.getContext('2d').putImageData(cImg, 0, 0);
  hCan.getContext('2d').putImageData(hImg, 0, 0);
  eCan.getContext('2d').putImageData(eImg, 0, 0);
  const emissiveMap = new THREE.CanvasTexture(eCan);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;        // G10: emissive is colour
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  return { ...mapsFromCanvases(cCan, hCan, seed), emissiveMap };
}

// ---------------------------------------------------------------------------
// boleRing — a course of the trunk: a LOBED annulus, open across the front
// ---------------------------------------------------------------------------
// The annulus between rIn and rOut(θ), extruded y0 → y1, and open where the
// socket's face clips it. `thA`/`thB` cut an angular slice out instead (the
// crown teeth); omitted, the ring runs the whole sweep from clip to clip.
//
// MEASURE THE BEVEL, DO NOT ASSUME IT. three's ExtrudeGeometry does not
// inset — it leaves the original contour at both ends and pushes the body
// OUT along each vertex's bisector by bevelSize/sin(θ/2). At 5° contour
// sampling every interior angle is within a degree of straight, so the
// overshoot is the bevel itself; the x budget below carries Bastion's
// measured 0.045 anyway, because a lobe crest is where that would break
// first.
const BEVEL = 0.028;
const BEVEL_BULGE = 0.045;

function boleRing(rOut, rIn, y0, y1, zc, zClip, thA, thB) {
  const front = (th) => zc + rOut(th) * Math.cos(th) - zClip;   // > 0 = clipped off
  const bisect = (lo, hi) => {
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (front(m) > 0) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };
  const th0p = thA !== undefined ? thA : bisect(0, Math.PI / 2);
  const th0m = thB !== undefined ? thB : bisect(0, -Math.PI / 2) + 2 * Math.PI;
  const sweep = th0m - th0p;
  const n = Math.max(6, Math.ceil(sweep / (5 * Math.PI / 180)));
  const shape = new THREE.Shape();
  // Shape coordinates are (x, −z): the geometry is rotated −90° about X
  // afterwards, which sends the extrusion axis to +y and the shape's y to
  // world −z. Bastion's convention and for its reason — writing the contour
  // in world x/z and negating once here beats reasoning about it twice.
  const at = (r, th) => [r * Math.sin(th), -(zc + r * Math.cos(th))];
  let p = at(rOut(th0p), th0p);
  shape.moveTo(p[0], p[1]);
  for (let i = 1; i <= n; i++) {
    const th = th0p + sweep * (i / n);
    p = at(rOut(th), th);
    shape.lineTo(p[0], p[1]);
  }
  for (let i = n; i >= 0; i--) {
    const th = th0p + sweep * (i / n);
    p = at(rIn, th);
    shape.lineTo(p[0], p[1]);
  }
  shape.closePath();

  const h = y1 - y0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, h - 2 * BEVEL), bevelEnabled: true, bevelSegments: 1,
    bevelThickness: BEVEL, bevelSize: BEVEL, curveSegments: 1, steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  geo.translate(0, y0 - geo.boundingBox.min.y, 0);
  return { geo, th0p, th0m };
}

// UVs for a bole course: the wall UNROLLS (u is arc length about the bole
// axis, v is world height, so the furrows stay vertical and the same width
// whichever way the wall faces); lids and soffits keep a planar (x, z). The
// seam at θ = π is on the back of the tree, which no shipped eye can see.
function boleUV(geo, uw, vw, zc, r0) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.72) { uv.setXY(i, x / uw, z / vw); continue; }
    const th = Math.atan2(x, z - zc);            // (−π, π], 0 at the front
    uv.setXY(i, (r0 * th) / uw, y / vw);
  }
  uv.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

const R_HULL = 0.05, R_TRIM = 0.028, R_THIN = 0.013;
// A DEAD SNAG LEANS, and it leans more than masonry does — this is the one
// place the model is allowed to be less plumb than its siblings. 0.45° about
// z costs 0.097 of x at the topmost tooth (12.34), which the crown budget
// carries. A lean about x is not available: it would push the facade through
// the bore's front tangent, and there is no room there.
const TILT = 0.45 * Math.PI / 180;

// Baked once per PALETTE per page — five per-pixel passes are not something
// to spend on every tower→tower swap, and the two venues want two sets.
const MAPS = new Map();
function maps(pal, key) {
  if (MAPS.has(key)) return MAPS.get(key);
  // Every wood comes out of the palette's own ROLES, so the trunk belongs to
  // whichever sky is up. The bark pair is pushed DOWN — a dead trunk at
  // night lives in the bottom third of the range, and Black Anvil's ledger
  // is right that this is a value problem and not a colour one.
  const dark = rgb(pal.deepGround), mid = rgb(pal.bark), lit = rgb(pal.moonEdge);
  // LOOKED AT, THEN LIFTED — the opposite correction to the tray's, and it
  // is the same lesson from the other side. The first cut crushed the low
  // stop 35% toward black and pulled the top stop down to the mid, and the
  // frames came back a black rectangle with no bark in it at all: a value
  // floor in the bottom third is not the same thing as no floor. The range
  // is still dark (the top stop is the palette's moon-struck edge and never
  // goes past it), it just HAS a range now.
  const BARK = [mixc(dark, [0, 0, 0], 0.12), mixc(mid, dark, 0.15), mixc(mid, lit, 0.62)];
  const SAP = [mixc(mid, lit, 0.35), mixc(lit, [255, 255, 255], 0.10),
    mixc(lit, [255, 255, 255], 0.35)];
  // LOOKED AT, THEN DARKENED — Black Anvil's ledger, third time in a row.
  // The first cut ran the delivery run up into the palette's moon-struck
  // top stop and the tray came back the BRIGHTEST OBJECT ON THE TABLE, a
  // pale slab in front of a black tree. It still has to be the lightest
  // thing on the MODEL (a die must read against what it rests on), and it
  // is; it just does that from the bottom third of the range now.
  const PUNK = [mixc(dark, mid, 0.20), mixc(dark, mid, 0.68), mixc(mid, lit, 0.28)];
  const MYC = [mixc(lit, [255, 255, 255], 0.30), mixc(lit, [255, 255, 255], 0.55),
    [255, 255, 255]];
  const FLESH = [mixc(mid, dark, 0.2), mixc(rgb(pal.glowCore), lit, 0.5),
    mixc(rgb(pal.glowCap), [255, 255, 255], 0.25)];
  const out = {
    // 6 furrows and 5 plate courses to a tile. At 4.4 × 5.7 world units per
    // tile that is a plate 0.73 wide and 1.14 tall — about half a d6 edge
    // across, the scale cue that says "old oak", not "birch".
    bark: bakeBark({ size: 512, stops: BARK, sapStops: SAP, seed: 0xb01e01,
      furrows: 6, plates: 5, sap: 0.55 }),
    // The crown teeth, the arch soffit and the door frame: the same bark,
    // sloughed harder — where a trunk snapped, the bark is mostly gone.
    torn: bakeBark({ size: 256, stops: BARK, sapStops: SAP, seed: 0xb01e02,
      furrows: 5, plates: 4, sap: 0.92 }),
    punk: bakePunk({ size: 256, stops: PUNK, bloomStops: MYC, seed: 0xb01e03 }),
    foxfire: bakeFoxfire({ size: 256, fleshStops: FLESH, seed: 0xb01e04, ribs: 26 }),
    // The hearth behind the little door. `heat` high, because the pane is
    // 0.24 across and bakeEmber's own envelope leaves most of a bed dead —
    // the cresset's lesson (docs/TOWER.md, dressing: "a bake's heat envelope
    // is a lottery at prop scale").
    hearth: bakeEmber({ size: 128, seed: 0xb01e05, heat: 2.0 }),
    veil: veilTexture(256, 0.92),
    shadow: veilTexture(256, 0.55),
  };
  // THE TEXEL HALF OF THE AGED BASE, and this thing is DEAD AND OLD, so it
  // runs harder than any sibling: Bastion's stone takes grime at 2.3 and
  // that is a building somebody sweeps. Wet rot in a night wood is a COLD
  // near-black deposit, not the warm one Heartwood puts on live oak.
  const ROTGRIME = [[0x0a, 0x0e, 0x0b], [0x15, 0x1e, 0x18], [0x24, 0x30, 0x28]];
  for (const [pr, sd, amt] of [[out.bark, 0xb091, 2.6], [out.torn, 0xb092, 2.2],
    [out.punk, 0xb093, 1.4]]) {
    grimePass(pr.colorCanvas, pr.heightCanvas, { seed: sd, amount: amt, stops: ROTGRIME });
  }
  // …and a pale film of spore dust and lichen on the flats.
  dustPass(out.punk.colorCanvas, out.punk.heightCanvas, { seed: 0xb095, amount: 0.9 });
  dustPass(out.torn.colorCanvas, out.torn.heightCanvas, { seed: 0xb096, amount: 0.7 });
  for (const [pr, sd] of [[out.bark, 0xb091], [out.torn, 0xb092], [out.punk, 0xb093]]) {
    Object.assign(pr, mapsFromCanvases(pr.colorCanvas, pr.heightCanvas, sd));
  }
  MAPS.set(key, out);
  return out;
}


// ---------------------------------------------------------------------------
// THE SHELL IS ONE SWAPPABLE FUNCTION
// ---------------------------------------------------------------------------
// A shell builder owns EVERY occluding surface of the trunk — the bole, the
// crown, the flat front, the roots and the clad delivery run — and hands
// back a SURFACE DESCRIPTOR that the dressing addresses by (θ, y) instead of
// by box corners. That seam exists because the shell is expected to be
// replaced: this one is a stack of lobed extrusions and rounded boxes, which
// is the towerskin kit's vocabulary and reads as a rectangular tower wearing
// bark, and a parametric displaced shell (a radius field r(θ, y) with
// buttress lobes, a ground flare, fibre striation, splinter spires and the
// wound as an inward fold) is the shape a broken STUMP actually wants.
//
// The contract a replacement must honour:
//
//   input   ctx = { v, MAT, UV, rnd, add, span, parts }
//             · v      towerVolumes()
//             · MAT    the material table (bark / torn / punk / …)
//             · UV     world units per texture tile, per material
//             · rnd    the skin's seeded PRNG — never Math.random
//             · add    (mesh) => mesh, parents it into towerSkinBole,
//                      turns on shadows and enrols it in the AO/weather pass
//             · span   the min/max box helper, for anything box-shaped
//             · parts  the AO/weather array, for meshes added by hand
//
//   output  a SURFACE descriptor, and every field is load-bearing:
//             · rOut(th)          outer radius about the bole axis
//             · at(th, y, inset)  a world point on (or inset into) the
//                                 surface — THE call the dressing uses
//             · inFacade(th)      true where the shell is open and the flat
//                                 front fills the gap, so a prop knows to
//                                 lie on a plane instead of on a curve
//             · facade {aL,aR,yLow,yTop,zFace}  the flat front's extent
//             · doorPad {x,y,z}   where a 0.24×0.40 door can be cut, which
//                                 only the shell knows, because only the
//                                 shell knows where its buttresses are
//             · zc, rIn, yRing, yCrown, zFO, zFI, sill, doorX, doorY, xLim
//
// RULES A SHELL MUST KEEP (the proofs gate all four):
//   · every occluding group is named `towerSkin*` (this one uses
//     towerSkinBole) — tower-fit measures those and tower-occlusion counts
//     them, and an unnamed occluder proves nothing;
//   · zero colliders and zero lights, ever;
//   · nothing inside the doorway (|x| ≤ 2.5 below y 4.5) and nothing
//     outside the socket in x, which is the one axis with no slack;
//   · the FRONT must stay opaque above y 11.25 — measured, see §1.5 note 3.
// ---------------------------------------------------------------------------
function buildLobedShell(ctx) {
  const { v, MAT, UV, rnd, add, span, parts } = ctx;
  // --- contract arithmetic: every number below comes out of towerVolumes ---
  const S = v.S, z0 = v.z0;
  const boreR = v.shaft.r;                                  // 2.125
  const boreZ = v.shaft.c[2];                               // z0 − 2.0
  const zLim = v.socket.c[2] + v.socket.s[2] / 2;           // z0 + 0.25
  const xLim = v.socket.s[0] / 2;                           // 3.25
  const yLim = v.socket.c[1] + v.socket.s[1] / 2;           // 12.5
  const sill = v.hood.c[1] - v.hood.s[1] / 2;               // 1.0
  const doorX = v.door.w / 2;                               // 2.5
  const doorY = v.door.h;                                   // 4.5

  const zFO = zLim - 0.01;                 // z0+0.24 · the outermost face
  const zFF = zFO - 0.045;                 // z0+0.195 · the recessed field,
                                           // so the bark ribs have a depth
                                           // to stand proud of (see below)
  const zFI = boreZ + boreR + 0.025;       // z0+0.15 · and the back of the
                                           // facade. 0.09 of depth, and that
                                           // is the whole articulation
                                           // budget dead ahead.
  const zCl = zFO - BEVEL_BULGE;           // z0+0.195 · where the shell stops

  // THE BOLE AXIS sits 0.35·S in front of the bore's — far enough that the
  // shell's inner face clears the bore everywhere, near enough that the
  // trunk does not have to be as wide as the socket to reach the facade.
  const zc = boreZ + 0.35 * S;                              // z0 − 1.5625
  const rIn = 2.62;                        // the bore needs 2.5625 here;
                                           // 0.058 of clearance, and the
                                           // bevel's bulge on the inner arc
                                           // works in our favour.
  const R0 = 2.80;                         // the nominal bole radius
  // THE LOBES ARE THE TRUNK. Three non-harmonic terms so the profile never
  // repeats around the circumference, at ±0.155 — which is ~2 px at the
  // tower eye and ~6 at the resting eye, i.e. it reads in the SILHOUETTE and
  // the bark bake carries everything finer.
  //   worst case |x| = R0 + 0.155 + bevel bulge 0.045 + lean 0.097 = 3.10,
  //   against the socket's 3.25 and the mat's own physics wall at 3.35.
  const lobe = (th) => 0.075 * Math.sin(5 * th + 1.1)
    + 0.050 * Math.sin(8 * th + 2.7)
    + 0.030 * Math.sin(13 * th + 0.4);
  const rOut = (th) => R0 + lobe(th);

  // Elevation. The closed ring runs to 11.62 (§1.5 note 3); everything above
  // it is the tear. Three courses so the bark drift and the AO have
  // somewhere to vary.
  const yC1 = 0.00, yC2 = 4.30, yC3 = 8.20, yRing = 11.62;
  const yTeeth = yLim - 0.16;              // 12.34 · the tallest tooth

  // --- THE BOLE: three lobed courses, open across the front ----------------
  const course = (matKey, y0, y1, thA, thB) => {
    const { geo, th0p, th0m } = boleRing(rOut, rIn, y0, y1, zc, zCl, thA, thB);
    const uv = matKey === 'torn' ? UV.torn : UV.bark;
    boleUV(geo, uv[0], uv[1], zc, R0);
    add(new THREE.Mesh(geo, MAT[matKey]));
    return { th0p, th0m };
  };
  const clip = course('bark', yC1, yC2 + 0.06);
  course('bark', yC2, yC3 + 0.06);
  course('bark', yC3, yRing + 0.02);

  // The clip angles, and the x they land on: these ARE the reveal jambs, and
  // the facade is measured off them.
  const xClipL = rOut(clip.th0m) * Math.sin(clip.th0m);     // negative
  const xClipR = rOut(clip.th0p) * Math.sin(clip.th0p);     // positive
  const aL = xClipL - 0.04, aR = xClipR + 0.04;             // 0.04 of overlap

  // --- THE CROWN: seven teeth on the closed ring ---------------------------
  // The ring below them is what occludes; these are the tear. Heights are
  // written by hand rather than seeded, because "no two neighbours alike"
  // is the one thing a random list gets wrong about half the time — and one
  // tooth is simply GONE, which is the asymmetry that makes the crown read
  // as broken instead of as crenellated.
  //
  // AND THERE ARE THIRTEEN OF THEM, NOT SEVEN. Looked at: seven teeth over
  // a 290° sweep is 41° each, which at the resting eye is a pair of
  // rectangular SLABS standing on a wall — a parapet, which is the one
  // thing this crown must not be. Thirteen narrow teeth whose heights walk
  // rather than alternate read as a rim that TORE, because that is what a
  // torn rim is: a run of splinters, not a run of merlons.
  {
    const sweep = clip.th0m - clip.th0p;
    const N = 13;
    const hs = [0.30, 0.52, 0.74, 0.61, 0.20, 0.0, 0.26, 0.55, 0.88, 0.70,
      0.41, 0.13, 0.34];
    for (let k = 0; k < N; k++) {
      const thA = clip.th0p + sweep * (k / N) - (k ? 0.010 : 0);
      const thB = clip.th0p + sweep * ((k + 1) / N) + (k === N - 1 ? 0 : 0.010);
      const top = yRing + 0.04 + hs[k] * (yTeeth - yRing - 0.04);
      if (top - yRing < 0.10) continue;         // the missing tooth
      const { geo } = boleRing(rOut, rIn + 0.05, yRing - 0.04, top, zc, zCl, thA, thB);
      boleUV(geo, UV.torn[0], UV.torn[1], zc, R0);
      add(new THREE.Mesh(geo, MAT.torn));
    }
  }

  // --- THE FACADE: the flat front, with the root-gap arch under it ---------
  // ONE extruded plate rather than a stack of slabs, because both of its
  // interesting edges are curves: an arch springing from the reveals at the
  // bottom, and a torn line at the top that continues the crown's tear
  // across the front. bevelEnabled is FALSE — the plate lives inside 0.09 of
  // depth, and a bevel's own bulge would push it through the socket's face.
  const yArchLow = doorY + 0.08, yArchApex = doorY + 0.75, archX = -0.35;
  {
    const shape = new THREE.Shape();
    // Nine points, not five: the same argument the crown teeth lost. A
    // five-point top is a zig-zag and reads as a cut; nine is a splinter
    // line. The lowest point is 11.74, which is the number §1.5 note 3
    // measured and the red check confirmed the front cannot go below.
    const topAt = [
      [aL, 11.80], [aL * 0.74, 12.14], [aL * 0.44, 11.86], [aL * 0.16, 12.24],
      [aR * 0.14, 11.90], [aR * 0.40, 12.30], [aR * 0.66, 11.96], [aR * 0.86, 12.18],
      [aR, 11.84],
    ];
    shape.moveTo(aL, yArchLow);
    for (const [x, y] of topAt) shape.lineTo(x, y);
    shape.lineTo(aR, yArchLow);
    // The arch, sampled: a hump with its apex left of centre, so the gap
    // between the roots is not a doorway somebody cut.
    const N = 26;
    for (let i = N; i >= 0; i--) {
      const x = aL + (aR - aL) * (i / N);
      const u = x < archX ? (x - aL) / (archX - aL) : (aR - x) / (aR - archX);
      const y = yArchLow + (yArchApex - yArchLow)
        * Math.pow(Math.sin(Math.PI * clamp01(u) / 2), 1.4);
      shape.lineTo(x, y);
    }
    shape.closePath();
    // THE FIELD IS RECESSED so the ribs have somewhere to be. tower-fit
    // caught this the honest way: the ribs were 0.007 outside the socket's
    // face and UNCLASSIFIED, because the plate already reached zFO and the
    // whole budget in front of it is 0.01. A rib that cannot stand proud of
    // its field is not relief, it is a decal — so the field steps BACK to
    // z0+0.195 and the ribs occupy the 0.053 that opens up. Same total
    // depth, and the shadow lines are real.
    const geo = new THREE.ExtrudeGeometry(shape, { depth: zFF - zFI, bevelEnabled: false });
    geo.translate(0, 0, zFI);
    planarUV(geo, UV.bark[0], UV.bark[1], 0.13, 0.27);
    add(new THREE.Mesh(geo, MAT.bark));
  }
  // --- THE FACADE'S BARK RIBS ----------------------------------------------
  // LOOKED AT, THEN ADDED, and this is the fix the first frames demanded.
  // The bore leaves 0.09 of depth dead ahead, so the front of any tower here
  // is a flat plate — which is fine for masonry (Bastion articulates it in
  // colour) and fatal for a TREE, because the one thing a trunk must be is
  // ROUND. The frames came back reading as a dark rectangular box.
  //
  // Two things fix it and neither needs depth the socket has not got.
  // First, relief: five vertical bark ribs standing 0.028 proud, at an
  // irregular pitch that continues the shell's own lobes across the front,
  // so the facade has real shadow lines running up it instead of one flat
  // field. Second, the cylindrical SHADE in the vertex colours (see
  // gravityStain below) — a flat plate lit like a cylinder reads as a
  // cylinder, and that costs zero triangles.
  {
    // SHORT AND STAGGERED, not full-height. Looked at: five ribs running the
    // whole 7 units read as a palisade — a crate of vertical boards, which
    // is a different wrong answer from a flat box but still not a tree. A
    // bark PLATE is a couple of units long and its neighbours' ends never
    // line up, which is the same rule bakeBark's horizontal cracks follow at
    // texel scale, applied at prop scale.
    const ribs = [
      // [x fraction, width, y0, y1]
      [-0.88, 0.26, 5.35, 8.10], [-0.88, 0.22, 8.55, 11.15],
      [-0.52, 0.30, 4.95, 7.30], [-0.52, 0.24, 7.75, 10.40],
      [-0.14, 0.22, 6.10, 9.05],
      [0.24, 0.28, 5.10, 8.30], [0.24, 0.20, 8.80, 11.40],
      [0.62, 0.24, 5.80, 9.60],
      [0.88, 0.26, 4.90, 7.05], [0.88, 0.22, 7.50, 10.80],
    ];
    for (const [i, [f, w, y0r, y1r]] of ribs.entries()) {
      const cx = f < 0 ? aL * -f : aR * f;
      const geo = roundedBox(w, y1r - y0r, 0.056, R_THIN, 3);
      weather(geo, w, y1r - y0r, 0.056, rnd);
      planarUV(geo, UV.bark[0], UV.bark[1], rnd() * 0.4, rnd() * 0.4);
      const m = new THREE.Mesh(geo, MAT.bark);
      m.position.set(cx, (y0r + y1r) / 2, zFO - 0.030);
      m.rotation.z = (i % 2 ? 1 : -1) * 0.012;       // nothing on a tree is plumb
      add(m);
    }
  }
  // The arch's own soffit, in torn bark: a band tucked behind the facade's
  // bottom edge so the gap reads as a hole through a THICKNESS rather than a
  // shape cut out of card.
  {
    const geo = roundedBox(Math.abs(aR - aL) * 0.94, 0.16, 0.30, R_THIN, 2);
    planarUV(geo, UV.torn[0], UV.torn[1], 0.4, 0.1);
    const m = new THREE.Mesh(geo, MAT.torn);
    m.position.set((aL + aR) / 2 - 0.1, yArchApex - 0.30, zFI - 0.12);
    add(m);
  }

  // --- THE ROOT SPLAY: the foot ---------------------------------------------
  // MEASURED, THEN CUT BACK. The first cut leaned seven radial buttresses
  // out of the bole and tower-fit came back UNCLASSIFIED at x −3.311: the
  // trunk already stands at 2.80 + 0.155 of lobe and the socket wall is at
  // 3.25, so the whole sideways budget for a root is about a fifth of a
  // unit — and a 3-unit root leaning 9° spends 0.24 of that on the lean
  // alone, before it projects at all. X HAS NO SLACK (docs/TOWER.md), so
  // the splay is expressed where there IS room: the roots reach FORWARD and
  // BACK, the side ones are shallow ribs, and every lean is ≤6°.
  //
  // Asymmetric by construction: the LEFT carries one heavy buttress (the one
  // with the door in it), the right two thin ones, and one on the right has
  // rotted off short.
  const ROOTS = [
    // [azimuth°, halfWidth, height, reach out, lean°, radial thickness]
    [-118, 0.26, 2.35, 0.16, 6, 0.42],
    [-158, 0.24, 1.95, 0.24, 6, 0.46],
    [72, 0.20, 2.10, 0.12, 5, 0.34],
    [104, 0.24, 2.55, 0.14, 5, 0.36],
    [146, 0.20, 1.35, 0.22, 5, 0.40],   // the short one — rotted off
    [180, 0.24, 1.70, 0.28, 6, 0.44],
  ];
  for (const [degs, hw, top, out, lean, th] of ROOTS) {
    const a = degs * Math.PI / 180;
    const sinA = Math.sin(a), cosA = Math.cos(a);
    const rMid = R0 + lobe(a) - 0.10;
    const geo = roundedBox(hw * 2, top, th, R_HULL, 2);
    weather(geo, hw * 2, top, th, rnd);
    propUV(geo, 1.6);
    const m = new THREE.Mesh(geo, MAT.bark);
    const rSeat = rMid + out / 2;
    m.position.set(rSeat * sinA, top / 2 - 0.05, zc + rSeat * cosA);
    m.rotation.y = a;
    m.rotation.z = -Math.sign(sinA || 1) * lean * Math.PI / 180;
    m.castShadow = true; m.receiveShadow = true;
    add(m);
  }
  // THE FLARE, and it is where the "tree" read actually comes from. The bore
  // fixes the trunk's radius within about 5% (rIn must clear 2.5625 and the
  // socket wall is at 3.25), so a dramatically lobed shaft is not available
  // at ANY height — but at y < 1.2 the lean costs nothing, which buys back
  // 0.10 of x that the crown has to spend on the tilt. Eleven low humps of
  // varying reach at the foot, and the trunk stops being a tube standing on
  // the felt and starts being something that GREW there.
  {
    const F = [
      [-8, 0.42, 1.15, 0.30], [22, 0.36, 0.92, 0.24], [52, 0.30, 1.30, 0.20],
      [86, 0.34, 0.78, 0.16], [118, 0.40, 1.05, 0.26], [150, 0.32, 0.70, 0.22],
      [178, 0.44, 1.20, 0.30], [-146, 0.30, 0.85, 0.24], [-112, 0.38, 1.32, 0.20],
      [-84, 0.28, 0.66, 0.14], [-46, 0.34, 1.00, 0.26],
    ];
    for (const [degs, hw, top, out] of F) {
      const a = degs * Math.PI / 180;
      // The front humps would stand in the doorway, so they are pulled to
      // the reveal and no further: |x| ≥ 2.5 is not negotiable below y 4.5.
      if (Math.abs(Math.sin(a)) < 0.86 && Math.cos(a) > 0.2) continue;
      const rMid = R0 + lobe(a) - 0.14;
      const th = 0.36 + out;
      const geo = roundedBox(hw * 2, top, th, R_HULL, 2);
      weather(geo, hw * 2, top, th, rnd);
      propUV(geo, 1.4);
      const m = new THREE.Mesh(geo, MAT.bark);
      m.position.set((rMid + out / 2) * Math.sin(a), top / 2 - 0.10,
        zc + (rMid + out / 2) * Math.cos(a));
      m.rotation.y = a;
      m.castShadow = true; m.receiveShadow = true;
      add(m);
    }
  }
  // THE DOOR BUTTRESS is placed by hand rather than by azimuth, because the
  // corner it has to reach is not on the trunk at all: the pad face wants
  // (x −2.79, z0+0.22), which is 3.31 from the bole axis — outside the
  // shell, inside the socket, in the front-left corner the front clip left
  // empty. A radial root cannot get there without leaving the socket
  // sideways on the way. So it is a leaning slab from the bole's flank out
  // to that corner, and it is the heaviest thing at the foot.
  span('bark', -3.12, -2.52, 0, 2.95, z0 - 1.55, z0 + 0.22,
    { r: R_HULL, seg: 2, weather: true, uv: UV.bark });

  // --- THE CHUTE AND THE TRAY, clad in rotted heartwood --------------------
  // Exactly on the engine's ramp and lip, so a die rides the wood it looks
  // like it is riding. Zero colliders: this is paint on a collider that
  // already exists. And it is the LIGHTEST material on the model, which is
  // functional — a die has to read against what it comes to rest on, and in
  // this venue it arrives out of a black hole into fog.
  {
    const geo = roundedBox(v.apron.s[0], v.apron.s[1], v.apron.s[2], R_TRIM, 1);
    planarUV(geo, UV.punk[0], UV.punk[1] * 1.7, 0.1, 0.3);
    const chute = new THREE.Mesh(geo, MAT.punk);
    chute.position.set(...v.apron.c);
    chute.rotation.x = v.apron.rx;
    add(chute);
    // Root cheeks, in the apron's OWN rotated frame (Bastion's chute cheeks,
    // verbatim in structure): they classify as APRON CLADDING because they
    // are part of the same tilted box, and anything raised further out on
    // the felt is a wall a settled die walks straight through.
    const ch = 0.30 * S, hw = v.apron.s[0] / 2;
    for (const s of [-1, 1]) {
      const g2 = roundedBox(0.28 * S, v.apron.s[1] * 0.55 + ch, v.apron.s[2] * 0.62, R_TRIM, 1);
      weather(g2, 0.28 * S, v.apron.s[1] * 0.55 + ch, v.apron.s[2] * 0.62, rnd);
      planarUV(g2, UV.punk[0], UV.punk[1], rnd() * 0.4, rnd() * 0.4);
      const cheek = new THREE.Mesh(g2, MAT.punk);
      cheek.position.set(s * (hw + 0.12 * S),
        (v.apron.s[1] * 0.55 + ch) / 2 - v.apron.s[1] / 2 + v.apron.s[1] * 0.225,
        -v.apron.s[2] * 0.12);
      cheek.castShadow = true; cheek.receiveShadow = true;
      chute.add(cheek); parts.push(cheek);
    }
  }
  {
    const geo = roundedBox(v.lip.s[0] + 0.15, v.lip.s[1], v.lip.s[2] + 0.1, 0.07, 1);
    planarUV(geo, UV.punk[0], UV.punk[1], 0.55, 0.2);
    const tray = new THREE.Mesh(geo, MAT.punk);
    tray.position.set(...v.lip.c);
    tray.rotation.x = v.lip.rx;
    add(tray);
  }
  // The descriptor. Everything the dressing needs to place a prop against
  // this shell, and nothing about how the shell was built.
  return {
    rOut,
    at: (th, y, inset = 0) => {
      const r = rOut(th) - inset;
      return [r * Math.sin(th), y, zc + r * Math.cos(th)];
    },
    inFacade: (th) => th > clip.th0m - 2 * Math.PI && th < clip.th0p,
    facade: { aL, aR, yLow: yArchLow, yTop: yArchApex, zFace: zFO, zBack: zFI },
    // The pad the little door is cut into. The shell owns this because only
    // the shell knows where a buttress presents a flat face at |x| ≥ 2.5 —
    // on this one it is the hand-placed front-left slab, and on a
    // displaced-shell version it will be a buttress lobe's outer face.
    doorPad: { x: -2.79, y: 1.20, z: v.z0 + 0.22 },
    zc, rIn, R0, yRing, yCrown: yTeeth, zFO, zFI,
    clipX: [Number(xClipL.toFixed(3)), Number(xClipR.toFixed(3))],
    sill, doorX, doorY, xLim, S, z0,
  };
}

export function buildHollowBoleSkin(v, { paletteId = 'moonrise', shell = buildStumpShell } = {}) {
  const palId = FAE_PALETTES[paletteId] ? paletteId : 'moonrise';
  const pal = FAE_PALETTES[palId];
  const M = maps(pal, palId);
  const rnd = mulberry32(0xb01e10);
  const group = new THREE.Group();
  group.name = 'towerSkin';
  const bole = new THREE.Group();
  // NAME IS CONTRACT: __diceDebug.towerOcclusionCheck() treats every named
  // `towerSkin*` child of the skin as an OCCLUDER and everything unnamed
  // (veils, contact shadows) as proving nothing.
  // NAMED FOR WHAT IT IS. `towerSkin*` is the occluder contract and this
  // group satisfies it — tower-fit measures it, tower-occlusion counts it —
  // but the shell inside it is INTERIM (see THE SHELL IS ONE SWAPPABLE
  // FUNCTION): a stack of lobed extrusions and rounded boxes, which is the
  // towerskin kit's vocabulary and reads as a rectangular tower wearing
  // bark. The parametric displaced shell that replaces it renames this to
  // `towerSkinBole` and nothing else in this file moves.
  // The organic shell landed (js/towerbole.js): the placeholder name and
  // its apology retire together.
  bole.name = 'towerSkinBole';
  group.add(bole);

  const mat = (m, ns) => new THREE.MeshStandardMaterial({
    map: m.map, normalMap: m.normalMap, normalScale: new THREE.Vector2(ns, ns),
    roughnessMap: m.roughnessMap, roughness: 1, metalness: 0,
    envMapIntensity: 0.45, vertexColors: true,
  });
  const glowMat = (m, hex, tier, side) => {
    const s = mat(m, 0.6);
    s.emissive = new THREE.Color(hex);
    s.emissiveMap = m.emissiveMap;
    s.emissiveIntensity = intensityFor(hex, tier);
    if (side) s.side = side;
    return s;
  };
  const MAT = {
    bark: mat(M.bark, 0.85),          // deep furrows want a strong normal
    torn: mat(M.torn, 0.72),
    punk: mat(M.punk, 0.55),
    // THE FUNGUS. `emissive` carries the palette hue, the BAKE carries the
    // gill pattern, and the intensity is arithmetic against the hue's own
    // linear luminance so both skies land on the same value tier.
    caps: glowMat(M.foxfire, pal.glowCap, HOLLOW_TIER.caps),
    gills: glowMat(M.foxfire, pal.glowCore, HOLLOW_TIER.gills, THREE.DoubleSide),
    // The attendants: TERTIARY. A near-black body with a light in it, so
    // what the eye gets is a point and not a bead.
    attendant: new THREE.MeshStandardMaterial({
      color: 0x0a0d0c, roughness: 0.9, metalness: 0,
      emissive: new THREE.Color(pal.glowRim),
      emissiveIntensity: intensityFor(pal.glowRim, HOLLOW_TIER.attendant),
      envMapIntensity: 0.45, vertexColors: true,
    }),
    // THE ONE WARM ACCENT (grammar rule 1): the door's interior.
    hearth: (() => {
      const s = new THREE.MeshStandardMaterial({
        map: M.hearth.map, normalMap: M.hearth.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughnessMap: M.hearth.roughnessMap, roughness: 1, metalness: 0,
        emissive: new THREE.Color(HOLLOW_EMBER), emissiveMap: M.hearth.emissiveMap,
        emissiveIntensity: intensityFor(HOLLOW_EMBER, HOLLOW_TIER.door),
        envMapIntensity: 0.45, vertexColors: true,
      });
      return s;
    })(),
  };
  // World units per texture tile. Non-square and non-integer against every
  // dimension in the model, so tiling never lands on a visible grid.
  const UV = { bark: [4.4, 5.7], torn: [1.9, 2.3], punk: [3.1, 2.3], prop: 0.7 };

  const parts = [];
  const add = (mesh) => {
    mesh.castShadow = true; mesh.receiveShadow = true;
    bole.add(mesh); parts.push(mesh); return mesh;
  };
  // The only way a box is made in this file (Heartwood's rule, and for the
  // same reason): stated as a min/max span so the contract arithmetic reads
  // straight off the page.
  const span = (matKey, x0, x1, y0, y1, z0v, z1v, opt = {}) => {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1v - z0v);
    const geo = roundedBox(w, h, d, opt.r !== undefined ? opt.r : R_TRIM, opt.seg || 1);
    if (opt.weather) weather(geo, w, h, d, rnd);
    const uv = opt.uv || UV.bark;
    planarUV(geo, uv[0], uv[1], rnd() * 0.4, rnd() * 0.4);
    const mesh = new THREE.Mesh(geo, MAT[matKey]);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0v + z1v) / 2);
    if (opt.rx) mesh.rotation.x = opt.rx;
    if (opt.ry) mesh.rotation.y = opt.ry;
    return add(mesh);
  };

  // THE SHELL. One call, one swap point (see THE SHELL IS ONE SWAPPABLE
  // FUNCTION above): everything below this line is DRESSING and addresses
  // the trunk through the descriptor, never through the shell's own numbers.
  const SURF = shell({ v, MAT, UV, rnd, add, span, parts });
  const { zc, rIn, R0, rOut, yRing, zFO, zFI, sill, doorX, doorY, xLim, S, z0 } = SURF;
  const { aL, aR } = SURF.facade;
  const yArchLow = SURF.facade.yLow, yArchApex = SURF.facade.yTop;

  // =========================================================================
  // THE DRESSING — THE CROWN MOOT, THE SHELF FUNGUS, THE LITTLE LIT DOOR
  // (fae-research/grammar.md §5 staging 1, and the anti-kitsch list at its
  // end: odd cap counts, ±15% spacing jitter, exactly one gap, exactly one
  // fallen member, light from UNDER the gills, no red caps, no white spots,
  // nothing under 0.06 u emissive or 0.33 u modelled.)
  //
  // MERGED, because a draw call is the real budget: nine caps, five gill
  // skirts and a fallen one would be fifteen calls. Everything in the bright
  // tier becomes one geometry, everything in the gill tier another, and the
  // bark tops a third.
  // =========================================================================
  const dress = new THREE.Group();
  dress.name = 'towerSkinDress';
  group.add(dress);
  const addDress = (mesh, role, cast = true) => {
    ensureColor(mesh.geometry);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    if (role) mesh.userData.mootRole = role;
    dress.add(mesh); parts.push(mesh); return mesh;
  };

  // The two shapes the fungus is made of. The SKIRT is the important one:
  // an open flared tube under a cap, whose surface faces outward and down.
  // A flat disc facing straight down is invisible from every shipped eye,
  // which is how "light from under the gills" turns into no light at all.
  const capGeo = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const skirtGeo = new THREE.CylinderGeometry(1, 0.52, 0.62, 14, 1, true);

  // THE RING. In plan view a ring of fungus growing on a round trunk is
  // concentric with the trunk and there is nothing honest to do about that,
  // so the "never concentric" rule is paid in the dimension that IS free:
  // the ring's plane is TIPPED 0.42 u across the bole and its high side is
  // not the front, which is what the eye actually reads at the tower eye.
  // Spacing is jittered ±15%; one 2.4 u arc is EMPTY.
  const yMoot = 10.30, mootTilt = 0.42, mootPhase = -0.7;

  // ---- THE θ CONVENTION BRIDGE -------------------------------------------
  // Every heading CONSTANT below was authored against buildLobedShell, whose
  // descriptor puts x = r·sin θ with θ = 0 at the FRONT. Both shells that
  // actually ship — buildStumpShell and the baked glbShellFor — publish the
  // other convention: x = r·cos θ, front at +π/2. Nobody noticed, because a
  // heading that is wrong by a quarter turn still lands ON the trunk: the
  // moot's one gap simply faced BACK-RIGHT instead of front-left, and all
  // three shelf fungi grew where no shipped eye can see them.
  //
  // `head()` converts an authored heading into the shell's frame. A prop's
  // own y-ROTATION is deliberately NOT converted: rotating +z onto the
  // outward normal needs π/2 − θ_shell, and that is exactly the authored θ
  // again. So positions move and orientations stay, which is why the props
  // still sit flat against the bark after the flip.
  const head = (th) => Math.PI / 2 - th;

  const GAP_AUTH = -0.78;                  // as designed: front-left of centre
  const GAP_TH = head(GAP_AUTH);           // …and where that actually is
  const GAP_ARC = 2.4 / R0;                // 2.4 u of circumference ≈ 49°
  // WHERE A CAP CAN ACTUALLY SIT, and this is the §1.5 refusal the moot
  // handed back: the shell is OPEN across the front, so a cap placed on the
  // bole's own circle anywhere inside the clip hangs in mid-air a unit in
  // front of the socket's face (tower-fit: z+1.168, UNCLASSIFIED). Slots
  // inside the clip therefore land on the FACADE — which is precisely what
  // grammar §5 asks for anyway ("seven are emissive paint on the flat
  // facade"). A facade cap is a blister: half-buried, 0.04 proud, and
  // 0.03 inside the FLUSH DRESS budget.
  //
  // AND IT ASKS THE SHELL, NOT THE SHELL'S NUMBERS. `SURF.at` and
  // `SURF.inFacade` are the whole interface between the moot and the trunk
  // it grows on, so when the displaced-shell version lands the ring moves
  // onto it with no edit here — which is the point of the seam.
  const capAt = (th, inset) => {
    const y = yMoot + mootTilt * Math.cos(th - mootPhase);
    if (SURF.inFacade(th)) {
      const x = Math.max(aL + 0.16, Math.min(aR - 0.16, rOut(th) * Math.sin(th)));
      return [x, y, SURF.facade.zFace, true];
    }
    const p = SURF.at(th, y, inset);
    return [p[0], p[1], p[2], false];
  };
  const bright = [], gill = [], flesh = [];
  const jit = mulberry32(0xb01e77);
  const mootCaps = [];
  {
    // Nine slots at 40° with ±15% jitter, minus whichever lands in the gap.
    // Two of the nine are the MODELLED pair and they sit on the SAME
    // shoulder rather than opposite each other — one loaded flank
    // (grammar rule 8), never a balanced pair.
    //
    // SIZES ARE HALF-EXTENTS, and that distinction cost a fit run: the first
    // cut multiplied a "0.52 u bracket" by 1.65 into a unit sphere and got a
    // 1.7-unit mushroom that left the socket sideways. A big cap is 0.60
    // across and projects 0.22 past its seat; a small one is 0.15 across,
    // which is still 2.5× the 0.06 u an emissive feature needs to read.
    // MOVED WITH THE GAP (θ bridge). Slot i sits at (i/9)·2π, and that number
    // is the same in both frames while its MEANING is a quarter turn apart —
    // so once the gap moved to its designed front-left, slots 2 and 3 fell
    // either side of it and one of the two modelled caps was being skipped
    // entirely. 1 and 2 put the loaded flank front-RIGHT, opposite the gap and
    // in view, which is what "one loaded flank, never a balanced pair" asked
    // for in the first place.
    const BIG = new Set([1, 2]);
    for (let i = 0; i < 9; i++) {
      let th = (i / 9) * Math.PI * 2 + (jit() - 0.5) * 0.3 * (2 * Math.PI / 9);
      th = ((th + Math.PI) % (2 * Math.PI)) - Math.PI;
      if (Math.abs(th - GAP_TH) < GAP_ARC / 2) continue;      // THE GAP
      const big = BIG.has(i);
      const [x, y, z, flat] = capAt(th, big ? 0.10 : 0.04);
      const p = [x, y, z];
      const roll = (jit() - 0.5) * 0.5;
      // A blister on the flat facade faces +z; a cap on the round shell
      // faces up and out. Same geometry, one extra quarter turn.
      const rot = flat ? [Math.PI / 2 + 0.22, 0, roll] : [0.34, th, roll];
      // THE DOSSIER'S 0.06 u FLOOR ASSUMED BLOOM, AND THIS TOWER HAS NONE.
      // grammar rule 6 gets its "emissive reads at a third the size of
      // shaded form" from the post stack's half-res blur spreading a 1-px
      // core into a ~5-px glow — but the bloom mask only ever contains
      // DICE (techniques T2 forbids a tower joining it), so a cap here is
      // exactly as big as it is. Measured off the frames: at 0.13 u a cap
      // is a 2-px speck at the tower eye and the ring does not exist.
      // 0.28–0.38 u across is what makes the moot read, and it is still
      // half the modelled brackets, so the "paint vs bracket" distinction
      // the staging rests on survives.
      const s = big ? 0.30 + 0.05 * jit() : 0.14 + 0.05 * jit();
      mootCaps.push({ th: Number(th.toFixed(3)), s: Number(s.toFixed(3)), big, flat });
      if (big) {
        // A modelled bracket: a squashed dome on top, a flared gill skirt
        // under it. The skirt is the light.
        flesh.push({
          geo: propUV(capGeo.clone(), UV.prop),
          matrix: xform({ pos: p, rot, scale: [s, s * 0.38, flat ? 0.10 : s * 0.72] }),
        });
        gill.push({
          geo: skirtGeo.clone(),
          matrix: xform({ pos: [x, y - s * 0.30, z], rot: flat ? [0.10, 0, roll] : [0.34, th, roll],
            scale: [s * 0.86, s * 0.34, flat ? 0.09 : s * 0.62] }),
        });
      } else {
        // A PAINTED CAP IS PURE LIGHT (grammar §5: seven of the nine are
        // "emissive paint", i.e. no modelled mushroom at all) — so these
        // glow all over and the light-from-under-the-gills rule lands on
        // the five MODELLED ones, which have real skirts. They are still
        // BRACKETS in proportion rather than beads: wide across, thin
        // vertically, projecting from the wall. A sphere would read as a
        // bauble stuck on, which is the kitsch list's "rounded and
        // symmetric" in miniature.
        bright.push({
          geo: capGeo.clone(),
          matrix: xform({ pos: p, rot, scale: [s, s * 0.44, flat ? s * 0.52 : s * 0.78] }),
        });
        // …with a dimmer skirt under it, so even a painted cap sheds its
        // light DOWNWARD onto the bark instead of floating on it.
        gill.push({
          geo: skirtGeo.clone(),
          matrix: xform({ pos: flat ? [x, y - s * 0.34, z] : [x, y - s * 0.30, z],
            rot: flat ? [0.14, 0, roll] : [0.34, th, roll],
            scale: [s * 0.90, s * 0.30, flat ? s * 0.42 : s * 0.64] }),
        });
      }
    }
    // THE FALLEN MEMBER, lying in the gap: knocked over, gills UP, and the
    // brightest thing in the ring because it is the wrong way up. That is
    // the whole story — somebody's seat is empty and their cup is over.
    const [fx, fy, fz] = capAt(GAP_TH, 0.02);
    bright.push({
      geo: skirtGeo.clone(),
      matrix: xform({ pos: [fx, fy - 0.30, fz], rot: [Math.PI + 0.45, 0, GAP_AUTH],
        scale: [0.22, 0.16, 0.20] }),
    });
    flesh.push({
      geo: propUV(capGeo.clone(), UV.prop),
      matrix: xform({ pos: [fx, fy - 0.38, fz + 0.03],
        rot: [Math.PI - 0.42, 0, GAP_AUTH], scale: [0.24, 0.12, 0.20] }),
    });
  }

  // --- THE SHELF FUNGUS: three brackets climbing one shoulder --------------
  // Clustered on the LEFT flank with nothing answering them on the right
  // (grammar rule 8, and Heartwood's single iron bracket in fungus). They
  // are the "too large" half of the one scale wrongness: 0.62–0.72 u across,
  // which is a dinner plate growing out of a tree — and the widest thing
  // sideways the socket will take at these azimuths.
  // Headings AS AUTHORED (lobed frame) — left flank, slightly front. Read
  // through head() for position and used raw for orientation; see the θ
  // CONVENTION BRIDGE above. Unconverted, these three landed at z ≈ −0.96·r:
  // the BACK of the trunk, where no shipped eye has ever seen them.
  const SHELVES = [[-1.28, 5.95, 0.36], [-1.05, 7.10, 0.31], [-1.42, 8.35, 0.33]];
  for (const [thA, y, s] of SHELVES) {
    const th = head(thA);
    const p = SURF.at(th, y, 0.12);        // through the seam, like the moot
    flesh.push({
      geo: propUV(capGeo.clone(), UV.prop),
      matrix: xform({ pos: p, rot: [0.30, thA, 0.10], scale: [s, s * 0.30, s * 0.76] }),
    });
    gill.push({
      geo: skirtGeo.clone(),
      matrix: xform({ pos: [p[0], y - s * 0.26, p[2]], rot: [0.30, thA, 0.10],
        scale: [s * 0.84, s * 0.28, s * 0.64] }),
    });
  }

  addDress(new THREE.Mesh(mergeGeos(bright), MAT.caps), 'moot-caps');
  addDress(new THREE.Mesh(mergeGeos(gill), MAT.gills), 'moot-gills');
  addDress(new THREE.Mesh(mergeGeos(flesh), MAT.torn), 'moot-flesh');

  // --- THE ATTENDANTS: four points hovering over the moot ------------------
  // They ARE the gathering and they have no bodies (grammar §5 staging 1,
  // "in session, off-frame"). TERTIARY tier — two full stops under the caps,
  // and nothing in this file goes anywhere near the bloom threshold.
  //
  // Two pivots of two, so the four never move as one object; each pivot
  // takes the towerdress two-sine idiom on a different axis, rate and phase,
  // and 2.63 is not harmonic so the loop never closes visibly. There is no
  // Date.now anywhere in this path — stepDress hands in the sim clock, so
  // holdClock freezes them and a screenshot is deterministic.
  // dz is measured from the BOLE AXIS, and it is capped at 1.2 so the
  // furthest attendant sits at z0−0.36 — behind the socket's face, so the
  // fit has nothing to classify and the four of them are unambiguously at
  // the moot rather than out over the felt.
  const ATTEND = [
    [[0.55, 9.62, 1.20], [-1.85, 9.98, 0.55]],
    [[2.05, 9.30, -0.60], [-1.30, 9.72, -2.20]],
  ];
  const attendMeshes = [];
  ATTEND.forEach((pair, pi) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, zc);
    dress.add(pivot);
    const ball = new THREE.SphereGeometry(1, 8, 5);
    const entries = pair.map(([x, y, dz]) => ({
      geo: ball.clone(),
      matrix: xform({ pos: [x, y, dz], scale: 0.085 + 0.02 * pi }),
    }));
    const m = new THREE.Mesh(mergeGeos(entries), MAT.attendant);
    ensureColor(m.geometry);
    m.castShadow = false; m.receiveShadow = false;
    m.userData.mootRole = 'moot-attendant';
    m.userData.attendants = pair.length;
    pivot.add(m);
    attendMeshes.push(m);
    // ~0.09 rad about the bole axis is 0.25 u of travel at r 2.7 — a slow
    // circling, not an orbit. The bob is a second registration, on x.
    registerSway(group, pivot,
      { amp: 0.09 - 0.02 * pi, hz: 0.037 + 0.011 * pi, phase: 1.1 * pi, axis: 'y' });
    registerSway(group, pivot,
      { amp: 0.016, hz: 0.061 - 0.013 * pi, phase: 2.4 + pi, axis: 'x' });
  });

  // --- THE TINY LIT DOOR: the strongest implied-inhabitant trick -----------
  // 0.24 wide × 0.40 tall, arched, on the front pad of the left root
  // buttress at y 1.2. Its inner jamb stands at |x| 2.52 — outside the
  // engine's aperture by 0.02 — and the registry's `ember` row puts a real
  // PointLight in front of it, because an emissive map shines and cannot
  // illuminate. Somebody is home right now.
  // The pad comes from the SHELL, not from a number typed here: only the
  // shell knows where a buttress presents a flat face outside the doorway.
  const DOOR = { ...SURF.doorPad, w: 0.24, h: 0.40 };
  {
    // The pad the door is cut into: a flat face on a round root, so the door
    // is not floating on a curve.
    span('punk', DOOR.x - 0.30, DOOR.x + 0.30, DOOR.y - 0.42, DOOR.y + 0.46,
      DOOR.z - 0.14, DOOR.z, { r: R_TRIM, uv: UV.torn });
    // The lit interior: an OPAQUE emissive pane at the back of the reveal,
    // never a hole — the eye must see a room, not a gap with light in it.
    const pane = new THREE.Mesh(
      planarUV(roundedBox(DOOR.w, DOOR.h, 0.05, 0.008, 1), 0.34, 0.52, 0.2, 0.1),
      MAT.hearth);
    pane.position.set(DOOR.x, DOOR.y, DOOR.z - 0.050);
    addDress(pane, 'door-hearth');
    // …and its frame: two jambs, a curved head and a sill, standing 0.03
    // proud so the pane is genuinely the backmost surface in the hole.
    const fr = [];
    const jamb = 0.055;
    for (const s of [-1, 1]) {
      fr.push({ geo: propUV(roundedBox(jamb, DOOR.h + 0.10, 0.06, 0.010, 1), 0.4),
        matrix: xform({ pos: [DOOR.x + s * (DOOR.w / 2 + jamb / 2), DOOR.y, DOOR.z + 0.010] }) });
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.16 + 0.68 * (i / 4));
      fr.push({ geo: propUV(roundedBox(0.075, 0.05, 0.06, 0.008, 1), 0.4),
        matrix: xform({
          pos: [DOOR.x + Math.cos(a) * (DOOR.w / 2 + 0.01),
            DOOR.y + DOOR.h / 2 - 0.02 + Math.sin(a) * 0.075, DOOR.z + 0.010],
          rot: [0, 0, a - Math.PI / 2] }) });
    }
    fr.push({ geo: propUV(roundedBox(DOOR.w + 0.16, 0.05, 0.10, 0.010, 1), 0.4),
      matrix: xform({ pos: [DOOR.x, DOOR.y - DOOR.h / 2 - 0.02, DOOR.z + 0.028] }) });
    addDress(new THREE.Mesh(mergeGeos(fr), MAT.torn), 'door-frame');
  }

  bakeVertexAO(parts, group);

  // The aged base (weatherPass): this is DEAD WOOD, so grime is the dominant
  // layer and edge wear is nearly absent — a dead trunk has no arris anybody
  // polishes. Dust is the pale spore/lichen film on the up-faces, and the
  // weather side is the LEFT, which is where the shelf fungus and the door
  // are: one side of this tree is wetter, and everything that lives on it
  // lives on that side.
  weatherPass(parts, {
    edge: 0.30, grime: 1.35, dust: 0.95, drift: 0.16, weatherSide: -1,
    grimeTint: [-0.20, -0.16, -0.30],
    dustTint: [0.14, 0.20, 0.22],
    edgeGate: (p, n) => 0.35 + 0.65 * clamp01(0.5 - 0.5 * n.x),
  });

  // --- WEATHERING IN THE VERTEX COLOURS, after the AO bake -----------------
  // Wet rot at the foot, a green cast up the shaded flank, and a pale
  // bleached band where the crown broke and the weather has been getting in
  // ever since. World space, so it knows where the ground and the tear are —
  // which a tile that repeats every 4.4 units does not.
  //
  // …AND THE FACADE IS SHADED LIKE THE CYLINDER IT IS PRETENDING TO BE.
  // This is the other half of the round-front fix (see THE FACADE'S BARK
  // RIBS): a front-facing surface in the facade's 0.09 of depth takes a
  // falloff in |x| that a real trunk's curvature would have given it for
  // free. It is keyed on the NORMAL and the z plane, so it lands on the
  // facade plate and its ribs and on nothing else on the model — the shell
  // proper never has a +z normal out here, because the shell is what the
  // facade is filling the hole in.
  const zFace = zFO - 0.09;
  gravityStain(parts, (p, n, out) => {
    const damp = clamp01(1 - p.y / 2.6);
    const shade = clamp01(-n.x) * clamp01(1 - p.y / 5.0) * 0.6;
    const bleach = clamp01((p.y - 10.4) / 1.4) * clamp01(0.4 + 0.6 * n.y);
    const round = (n.z > 0.80 && p.z > zFace && p.y > yArchLow - 0.4)
      ? 0.52 + 0.48 * clamp01(1 - Math.pow(Math.min(1, Math.abs(p.x) / 2.5), 1.6))
      : 1;
    const k = Math.max(damp * 0.9, shade);
    if (k < 0.02 && bleach < 0.02 && round > 0.995) return false;
    out[0] = round * (1 - 0.20 * k) * (1 + 0.14 * bleach);
    out[1] = round * (1 - 0.11 * k) * (1 + 0.15 * bleach);
    out[2] = round * (1 - 0.24 * k) * (1 + 0.13 * bleach);
    return true;
  });

  // --- AO layer (b): the unlit near-black lining ---------------------------
  // A hollow trunk is a hole, and the hole has to be BLACK — this is the
  // opacity the occlusion cheat actually rests on (Black Anvil's red check:
  // the emissive bed is the picture, the lining is the opacity). It runs to
  // the closed ring's top, which is the highest a ray can enter and still
  // reach the COWL band.
  const dark = new THREE.MeshBasicMaterial({ color: 0x07090a, side: THREE.DoubleSide });
  const lining = new THREE.Group();
  lining.name = 'towerSkinLining';
  {
    const rL = rIn - 0.02;
    const th0 = Math.acos(Math.max(-1, Math.min(1, (zFI - zc) / rL)));
    const yTop = yRing, yBot = sill - 0.5;
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(rL, rL, yTop - yBot, 40, 1, true, th0, 2 * Math.PI - 2 * th0),
      dark);
    tube.position.set(0, (yTop + yBot) / 2, zc);
    lining.add(tube);
    // …and a flat back to the facade, from the arch's springing up. It stops
    // AT the arch on purpose: an opaque plane across the gap would make an
    // exiting die pop into existence at the wall instead of travelling out
    // of the dark, which is the doorway veil's job two layers down.
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.abs(aR - aL) * 0.99, yTop - yArchLow), dark);
    back.position.set((aL + aR) / 2, (yTop + yArchLow) / 2, zFI - 0.012);
    lining.add(back);
  }
  group.add(lining);

  // --- AO layer (c): gradient veils ----------------------------------------
  const veilMat = () => new THREE.MeshBasicMaterial({
    map: M.veil, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  {
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(2 * rIn * 0.92, 3.6 * S), veilMat());
    pit.rotation.x = -Math.PI / 2 + v.apron.rx;
    const boreZ = v.shaft.c[2];
    const surfY = sill + (z0 - boreZ) * Math.tan(-v.exit.pitch);
    pit.position.set(0, surfY + 0.05, boreZ);
    group.add(pit);
    const doorVeil = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * doorX + 0.4, doorY - sill + 1.0), veilMat());
    doorVeil.position.set(0, (doorY + sill) / 2 - 0.1, zFI - 0.02);
    group.add(doorVeil);
  }

  // --- AO layer (d): contact shadows, flat on the felt ---------------------
  {
    const shMat = () => new THREE.MeshBasicMaterial({
      map: M.shadow, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(2 * R0 + 3.0, 2 * R0 + 3.0), shMat());
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, 0.006, zc + 0.25);
    group.add(base);
    const trayShadow = new THREE.Mesh(new THREE.PlaneGeometry(v.lip.s[0] + 1.6, 2.0), shMat());
    trayShadow.rotation.x = -Math.PI / 2;
    trayShadow.position.set(0, 0.005, v.lip.c[2] + v.lip.s[2] / 2 + 0.35);
    group.add(trayShadow);
  }

  group.rotation.z = TILT;
  group.userData.socketMaxZ = zFO;
  group.userData.xLim = xLim;
  // What the moot IS, for the proof to read back rather than re-derive. The
  // luminances are the TARGETS; towerMootAudit reads the LIVE materials and
  // the scenario compares the two, so a material edit that misses this block
  // shows up as a disagreement instead of as a green check.
  group.userData.moot = {
    paletteId: palId, caps: mootCaps.length, gap: 1, fallen: 1, shelves: SHELVES.length,
    attendants: attendMeshes.reduce((n, m) => n + m.userData.attendants, 0),
    tier: { ...HOLLOW_TIER },
    clipX: SURF.clipX,
  };
  return group;
}
