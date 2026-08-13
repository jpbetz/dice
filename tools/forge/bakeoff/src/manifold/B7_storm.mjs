// Copyright 2026 The Dice Table Authors.
//
// B7 boolean-storm. A 3.0 cube standing on the table, minus the 120 spheres in
// harness/spheres.json, minus one 3-cube rotated 25 degrees about the vertical
// axis. Robustness and throughput item -- no tri budget, report what happens.
//
// The sphere list is given in the exported world frame (Y up), so every centre
// is converted to Manifold's Z-up authoring frame on the way in: world
// (x, y, z) -> authoring (x, -z, y). Getting that backwards is the one way to
// fail this item silently, so worldToAuthoring is written once and used twice.
//
// Two things this item is here to measure and both are printed:
//   * how long 121 subtractions take when handed over as ONE batch
//   * what simplify(tolerance) buys afterwards, since the sponge is exactly
//     the kind of mesh with thousands of near-collinear boundary triangles
import {readFileSync} from 'node:fs';
import {Manifold} from 'manifold-3d/manifoldCAD';
import {describe, save, stopwatch} from './_util.mjs';

const SPHERES = JSON.parse(readFileSync(
    new URL('../../harness/spheres.json', import.meta.url), 'utf-8'));
const SPHERE_SEG = 32;   // segments per sphere diameter
const SIMPLIFY_TOL = Number(process.argv[3] ?? 0.004);

/** Exported world frame (Y up) -> Manifold authoring frame (Z up). */
const worldToAuthoring = (x, y, z) => [x, -z, y];

const t = stopwatch();
const block = Manifold.cube([3, 3, 3], true)
                  .translate(...worldToAuthoring(0, 1.5, 0));
const spheres = SPHERES.map(
    (s) => Manifold.sphere(s.r, SPHERE_SEG).translate(...worldToAuthoring(s.x, s.y, s.z)));
const slab = Manifold.cube([3, 3, 3], true)
                 .rotate(0, 0, 25)  // authoring Z is world Y
                 .translate(...worldToAuthoring(1.8, 2.7, 0));
const tBuild = t();

const storm = Manifold.difference([block, ...spheres, slab]);
const nTri = storm.numTri();  // forces evaluation: Manifold is lazy
const tCut = t();

const lean = SIMPLIFY_TOL > 0 ? storm.simplify(SIMPLIFY_TOL) : storm;
const nLean = lean.numTri();
const tSimplify = t();

const out = lean.asOriginal().calculateNormals(3, 40);
describe('B7 storm', out);
console.log(`  cutters built   : ${tBuild.toFixed(3)} s ` +
            `(${SPHERES.length} spheres @ ${SPHERE_SEG} seg, 1 rotated slab)`);
console.log(`  121 subtractions: ${(tCut - tBuild).toFixed(3)} s -> ${nTri} tris`);
console.log(`  simplify(${SIMPLIFY_TOL}) : ${(tSimplify - tCut).toFixed(3)} s -> ` +
            `${nLean} tris (${(100 * (1 - nLean / nTri)).toFixed(1)}% off)`);
console.log(`  genus ${out.genus()}, status ${out.status()}, ` +
            `volume ${out.volume().toFixed(4)}`);

await save(
    {
      manifold: out,
      name: 'boolean-storm',
      material: {
        name: 'sponge',
        attributes: ['NORMAL'],
        baseColorFactor: [0.55, 0.58, 0.62],
        metallic: 0.1,
        roughness: 0.6,
      },
    },
    process.argv[2]);
console.log(`bake_seconds ${t().toFixed(2)}`);
