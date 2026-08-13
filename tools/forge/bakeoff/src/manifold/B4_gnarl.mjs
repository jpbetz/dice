// Copyright 2026 The Dice Table Authors.
//
// B4 gnarl. A gnarled old stump, height ~2.6, base spread ~3.0, five root
// flares, slightly dished top, bark relief from deterministic value noise.
//
// This is the SDF item. The whole stump is ONE signed-distance function made
// of tapered capsules blended with a polynomial smooth-minimum, dished at the
// top with a smooth-maximum, then displaced by fbm noise -- so there is no
// boolean anywhere and therefore no hard CSG edge anywhere. Manifold.levelSet
// meshes it with marching tetrahedra; EDGE below is the single density dial.
//
// Two things worth knowing about levelSet: it wants POSITIVE inside (the
// opposite of the graphics convention, hence the negation at the end), and
// the callback is plain JS called a few million times -- 0.9 s for 25k tris
// here, which is fast enough that the SDF stays readable instead of being
// hand-optimised.
//
// Colour: the sawn top is a second colour, chosen per vertex by taking the
// gradient of the same SDF. No UVs, no face selection -- the field that made
// the shape also decides which vertices are cut wood.
import {Manifold} from 'manifold-3d/manifoldCAD';
import {describe, fbm3, save, segDist, smax, smin, stopwatch} from './_util.mjs';

const HEIGHT = 2.6;
const TOP_Z = HEIGHT + 0.08;  // sawn plane; the dish scoops down from here,
                              // so the rim lands at about HEIGHT
const SPREAD = 3.0;         // base diameter across the root flares
const NOISE_AMP = 0.08;
// Density dial: triangles go as 1/EDGE^2. 0.062 is also picked for a reason
// found the hard way -- see the note above build().
const EDGE = Number(process.argv[3] ?? 0.062);
const BARK_RGB = [0.33, 0.24, 0.17];
const WOOD_RGB = [0.78, 0.62, 0.42];

/** Capsule with a linearly tapered radius: exact zero-set, cheap to evaluate. */
function taperedCapsule(p, a, b, r1, r2) {
  const {d, t} = segDist(p, a, b);
  return d - (r1 + (r2 - r1) * t);
}

// Five roots, deterministic: fixed bearings, radii and droop. Bearings are
// irregular on purpose -- evenly spaced roots read as machined.
const ROOTS = [
  {deg: 14, reach: 1.46, r0: 0.44, r1: 0.15, curl: 0.22},
  {deg: 82, reach: 1.30, r0: 0.40, r1: 0.13, curl: -0.30},
  {deg: 150, reach: 1.50, r0: 0.46, r1: 0.16, curl: 0.12},
  {deg: 232, reach: 1.24, r0: 0.38, r1: 0.14, curl: 0.34},
  {deg: 300, reach: 1.40, r0: 0.42, r1: 0.15, curl: -0.18},
];

// Trunk axis: three stacked segments with a slight lean and kink, so the
// silhouette never reads as a lathe part.
const TRUNK = [
  {a: [0.00, 0.00, 0.00], b: [0.04, 0.05, 0.95], r1: 0.70, r2: 0.60},
  {a: [0.04, 0.05, 0.95], b: [-0.06, 0.02, 1.85], r1: 0.60, r2: 0.55},
  {a: [-0.06, 0.02, 1.85], b: [0.02, -0.04, TOP_Z], r1: 0.55, r2: 0.52},
];

function stumpBody(p) {
  let d = taperedCapsule(p, TRUNK[0].a, TRUNK[0].b, TRUNK[0].r1, TRUNK[0].r2);
  for (let i = 1; i < TRUNK.length; i++) {
    const s = TRUNK[i];
    d = smin(d, taperedCapsule(p, s.a, s.b, s.r1, s.r2), 0.22);
  }
  for (const root of ROOTS) {
    const th = (root.deg * Math.PI) / 180;
    const reach = (root.reach * SPREAD) / 3.0;
    // Root leaves the trunk at knee height, then dives to the ground and
    // splays out; the mid point is what makes it a flare and not a spoke.
    const start = [Math.cos(th) * 0.28, Math.sin(th) * 0.28, 0.62];
    const knee = [
      Math.cos(th) * reach * 0.55 - Math.sin(th) * root.curl,
      Math.sin(th) * reach * 0.55 + Math.cos(th) * root.curl,
      0.24,
    ];
    const tip = [
      Math.cos(th) * reach - Math.sin(th) * root.curl * 1.6,
      Math.sin(th) * reach + Math.cos(th) * root.curl * 1.6,
      0.11,
    ];
    d = smin(d, taperedCapsule(p, start, knee, root.r0, root.r0 * 0.8), 0.30);
    d = smin(d, taperedCapsule(p, knee, tip, root.r0 * 0.8, root.r1), 0.24);
  }
  return d;
}

/** Bark: vertically stretched fbm, faded out over the sawn top. */
function barkRelief(p) {
  const ridges = fbm3(p[0] * 3.3, p[1] * 3.3, p[2] * 1.15, 3, 20260804);
  const grain = fbm3(p[0] * 7.0, p[1] * 7.0, p[2] * 4.2, 2, 771);
  const fade = Math.min(1, Math.max(0, (TOP_Z - 0.12 - p[2]) / 0.22));
  // Interpolated value noise rarely reaches its extremes, so the raw fbm sits
  // around +-0.35 and the first bake relieved only 0.033 peak-to-peak. Gain it
  // up and clamp: measured relief is then ~0.13 p2p at the specified 0.08.
  const n = Math.max(-1, Math.min(1, (ridges * 0.78 + grain * 0.22) * 2.3));
  return n * NOISE_AMP * fade;
}

/** Standard SDF: negative inside. */
function stumpSDF(p) {
  let d = stumpBody(p);
  // Sawn top, then a shallow dish scooped out of it. Both smooth-maxed so the
  // rim is a tight radius rather than a CSG crease.
  d = smax(d, p[2] - TOP_Z, 0.05);
  const dishR = 3.0, dishC = TOP_Z + dishR - 0.11;
  const sph = dishR - Math.hypot(p[0], p[1], p[2] - dishC);  // inside the ball
  d = smax(d, sph, 0.13);
  // No ground plane in the field: the stump simply continues below z=0 and an
  // exact boolean trims it flat later. Meeting the plane inside the SDF makes
  // the field graze it, and marching tetrahedra answers a graze with a rim of
  // sliver triangles that weld into non-manifold edges downstream (proved on
  // B5, where all 43 bad edges sat on exactly such a rim).
  return d - barkRelief(p);
}

/** Gradient of the SDF, used to tell bark from cut wood. */
function gradZ(p, h = 0.02) {
  const dz = stumpSDF([p[0], p[1], p[2] + h]) - stumpSDF([p[0], p[1], p[2] - h]);
  const dx = stumpSDF([p[0] + h, p[1], p[2]]) - stumpSDF([p[0] - h, p[1], p[2]]);
  const dy = stumpSDF([p[0], p[1] + h, p[2]]) - stumpSDF([p[0], p[1] - h, p[2]]);
  const n = Math.hypot(dx, dy, dz) || 1;
  return dz / n;
}

// Flat faces get cut with booleans, curved ones with the field. See stumpSDF.
function build() {
  const stump = Manifold.levelSet(
      (p) => -stumpSDF(p),  // levelSet wants positive inside
      {min: [-1.8, -1.8, -0.45], max: [1.8, 1.8, HEIGHT + 0.15]}, EDGE, 0,
      EDGE / 8);
  const table = Manifold.cube([6, 6, 2], true).translate(0, 0, -1);
  // asOriginal(): the table cut leaves a second run, which the exporter
  // would write as its own primitive -- one open disc plus one open shell.
  return stump.subtract(table)
      .asOriginal()
      .setProperties(3,
                     (np, pos) => {
                       const up = gradZ(pos);
                       // Upward-facing surface in the top 0.2 is sawn wood.
                       const cut = up > 0.72 && pos[2] > TOP_Z - 0.25 ? 1 : 0;
                       const rgb = cut ? WOOD_RGB : BARK_RGB;
                       np[0] = rgb[0];
                       np[1] = rgb[1];
                       np[2] = rgb[2];
                     })
      .calculateNormals(3, 180);  // 180 = no sharp edges at all: all smooth
}

const lap = stopwatch();
const gnarl = build();
describe(`B4 gnarl (edge=${EDGE})`, gnarl);
await save(
    {
      manifold: gnarl,
      name: 'gnarl',
      material: {
        name: 'stump',
        attributes: ['COLOR_0', 'NORMAL'],
        baseColorFactor: [1, 1, 1],
        metallic: 0,
        roughness: 0.9,
      },
    },
    process.argv[2]);
console.log(`bake_seconds ${lap().toFixed(2)}`);
