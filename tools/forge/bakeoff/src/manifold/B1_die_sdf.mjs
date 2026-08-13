// Copyright 2026 The Dice Table Authors.
//
// B1 alternate route, kept for the record: the SAME die as B1_die.mjs built
// with Manifold.levelSet from a signed-distance function instead of hull +
// boolean. Not the shipped B1 -- it is here to show what the SDF route costs.
// Run: node B1_die_sdf.mjs out.glb [edgeLength]
import {Manifold} from 'manifold-3d/manifoldCAD';
import {describe, save, stopwatch} from './_util.mjs';

const HALF = 1.0, FILLET = 0.10, PIP_R = 0.22, PIP_DEPTH = 0.08, O = 0.42;

const FACES = {1: [0, 0, 1], 2: [0, -1, 0], 3: [1, 0, 0],
               4: [-1, 0, 0], 5: [0, 1, 0], 6: [0, 0, -1]};
const PATTERNS = {
  1: [[0, 0]], 2: [[-O, -O], [O, O]], 3: [[-O, -O], [0, 0], [O, O]],
  4: [[-O, -O], [-O, O], [O, -O], [O, O]],
  5: [[-O, -O], [-O, O], [0, 0], [O, -O], [O, O]],
  6: [[-O, -O], [-O, 0], [-O, O], [O, -O], [O, 0], [O, O]],
};

function faceAxes(n) {
  const up = Math.abs(n[2]) > 0.5 ? [0, 1, 0] : [0, 0, 1];
  const u = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2],
             up[0] * n[1] - up[1] * n[0]];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2],
             n[0] * u[1] - n[1] * u[0]];
  return [u, v];
}

// Pip centres, precomputed once so the SDF stays a tight loop.
const pipCentres = [];
const dist = HALF + (PIP_R - PIP_DEPTH);
for (const [value, n] of Object.entries(FACES)) {
  const [u, v] = faceAxes(n);
  for (const [a, b] of PATTERNS[value]) {
    pipCentres.push([n[0] * dist + u[0] * a + v[0] * b,
                     n[1] * dist + u[1] * a + v[1] * b,
                     n[2] * dist + u[2] * a + v[2] * b]);
  }
}

// levelSet wants POSITIVE inside, so every distance below is negated from the
// usual graphics convention. Rounded box minus 21 spheres.
const b = HALF - FILLET;
function sdf(p) {
  const qx = Math.abs(p[0]) - b, qy = Math.abs(p[1]) - b, qz = Math.abs(p[2]) - b;
  const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const ins = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  let d = FILLET - (out + ins);  // positive inside the rounded box
  for (const c of pipCentres) {
    const s = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - PIP_R;
    d = Math.min(d, s);  // subtract: intersect with the sphere's outside
  }
  return d;
}

const edge = Number(process.argv[3] ?? 0.045);
const lap = stopwatch();
const die = Manifold
                .levelSet(sdf, {min: [-1.2, -1.2, -1.2], max: [1.2, 1.2, 1.2]},
                          edge, 0, 1e-4)
                .translate(0, 0, HALF)
                .calculateNormals(3, 40);
describe(`B1 die (levelSet, edge=${edge})`, die);
await save({manifold: die, name: 'die-sdf'}, process.argv[2]);
console.log(`bake_seconds ${lap().toFixed(2)}`);
