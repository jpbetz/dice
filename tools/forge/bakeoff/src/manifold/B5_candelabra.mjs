// Copyright 2026 The Dice Table Authors.
//
// B5 candelabra. Round base r 0.7, trunk r 0.22 rising 1.2, splitting into 3
// arms, each splitting into 2, a drip-pan and candle cup at all 6 tips, radii
// tapering x0.75 per generation, total height ~3.2.
//
// The grammar item, so the shape is written as a grammar: `grow()` calls
// itself and the ONLY thing it does is push tapered segments onto a list.
// Geometry happens once, afterwards. That split is what makes the recursion
// readable: no Manifold objects are created inside the recursion, so there is
// nothing to keep manifold at every step and nothing to leak.
//
// Junctions: the segment list becomes ONE sdf blended with a polynomial
// smooth-min, so every fork is a fillet by construction -- there are no seams
// to hide because there is no boolean in the branching at all. Drip pans and
// candle cups are the deliberate exception: they are turned metal parts, so
// they are exact CSG (dished cylinder, bored cup) unioned onto the tips, where
// a crisp rim is what the object should actually have.
import {Manifold} from 'manifold-3d/manifoldCAD';
import {describe, save, segDist, smin, stopwatch} from './_util.mjs';

const BASE_R = 0.7, BASE_H = 0.16;
const TRUNK_R = 0.22, TRUNK_TOP = 1.2;
const TAPER = 0.75;                // radius factor per generation
const ARMS = 3, FORKS = 2;
const SPREAD1 = 42, SPREAD2 = 46;  // degrees off the parent direction
const PAN_R = 0.28, PAN_H = 0.07;
const CUP_R = 0.115, CUP_H = 0.17, BORE_R = 0.072;
// Two density dials, and they are not equivalent. EDGE is the levelSet grid;
// SIMPLIFY_TOL is Manifold's own edge-collapse decimator, which is the better
// buy on a marching-tetrahedra mesh because it eats the sliver triangles the
// grid leaves behind rather than coarsening the shape. Measured on this model:
//   EDGE 0.068 raw                    -> 19.5k tris (coarse branches)
//   EDGE 0.048 + simplify(0.0035)     -> 17.3k tris from a 34.3k grid, and it
//                                        also collapses the sub-tolerance
//                                        pinches that put the raw 0.048 mesh
//                                        at genus 11
const EDGE = Number(process.argv[3] ?? 0.048);
const SIMPLIFY_TOL = Number(process.argv[4] ?? 0.0035);

// ---------------------------------------------------------------- grammar --
const segments = [];  // {a, b, r1, r2} tapered capsules, blended later
const tips = [];      // where a pan+cup assembly gets planted

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (v, w, s = 1) => [v[0] + w[0] * s, v[1] + w[1] * s, v[2] + w[2] * s];
const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Tilt direction d by `deg` toward horizontal bearing `phi`. */
function tilt(d, deg, phi) {
  const rad = (deg * Math.PI) / 180;
  const u = [Math.cos(phi), Math.sin(phi), 0];
  const k = dot(u, d);
  const side = norm([u[0] - d[0] * k, u[1] - d[1] * k, u[2] - d[2] * k]);
  return norm(add(add([0, 0, 0], d, Math.cos(rad)), side, Math.sin(rad)));
}

/**
 * Grow one branch as a chain of short segments that curve back toward
 * vertical, then fork. Appends to `segments` / `tips`; returns nothing.
 * gen 1 = the three arms, gen 2 = the six forks that end in tips.
 */
function grow(origin, dir, length, radius, gen, bearing) {
  const STEPS = 5;
  let p = origin, d = dir;
  for (let i = 0; i < STEPS; i++) {
    d = norm([d[0], d[1], d[2] + 0.09]);  // lift a little every step
    const q = add(p, d, length / STEPS);
    segments.push({
      a: p,
      b: q,
      r1: radius * (1 - 0.12 * (i / STEPS)),
      r2: radius * (1 - 0.12 * ((i + 1) / STEPS)),
    });
    p = q;
  }
  if (gen === 2) {
    tips.push(p);
    return;
  }
  for (let k = 0; k < FORKS; k++) {
    // each arm forks sideways, symmetrically about its own bearing
    const phi = bearing + (k === 0 ? 1 : -1) * (Math.PI / 2.6);
    grow(p, tilt(d, SPREAD2, phi), length * 0.8, radius * TAPER, gen + 1, phi);
  }
}

// The base runs BELOW the table and gets cut off by an exact boolean later.
// Meeting the ground inside the SDF instead (max(d, -z)) makes the field graze
// the plane, and marching tetrahedra answers a graze with a rim of slivers:
// 43 edges of the first version welded into non-manifold junk, every one of
// them on this rim. Cut flat surfaces with booleans, curve them with fields.
segments.push({a: [0, 0, -0.3], b: [0, 0, 0.06], r1: BASE_R, r2: BASE_R});
segments.push({a: [0, 0, 0.06], b: [0, 0, BASE_H], r1: BASE_R, r2: BASE_R * 0.6});
segments.push({a: [0, 0, BASE_H], b: [0, 0, TRUNK_TOP],
               r1: TRUNK_R * 1.6, r2: TRUNK_R});
// Trunk top: three arms, 42 degrees off vertical, 120 degrees apart.
for (let k = 0; k < ARMS; k++) {
  const phi = (k * 2 * Math.PI) / ARMS;
  grow([0, 0, TRUNK_TOP], tilt([0, 0, 1], SPREAD1, phi), 1.25,
       TRUNK_R * TAPER, 1, phi);
}
// A knuckle above each tip. It is deliberately FATTER than the cup shank it
// meets (0.15 vs CUP_R 0.115) so the two surfaces cross transversally. A stub
// slightly thinner than the shank instead produces a near-tangential contact,
// which Manifold accepts (it keeps its own merge vectors) but which welds into
// a non-manifold edge in any downstream consumer.
for (const t of tips) {
  segments.push({a: t, b: [t[0], t[1], t[2] + 0.06], r1: 0.15, r2: 0.14});
}

// Adjacent pans must not graze each other for the same reason: two r=0.28
// pans 0.56 apart touch tangentially. Fail loudly rather than ship a pinch.
let minGap = Infinity;
for (let i = 0; i < tips.length; i++)
  for (let j = i + 1; j < tips.length; j++)
    minGap = Math.min(minGap, Math.hypot(tips[i][0] - tips[j][0],
                                         tips[i][1] - tips[j][1],
                                         tips[i][2] - tips[j][2]));
if (minGap < 2 * PAN_R + 0.12) {
  throw new Error(`tips only ${minGap.toFixed(3)} apart; pans (r ${PAN_R}) ` +
                  `would grze. Widen SPREAD2.`);
}

// ------------------------------------------------------------------- sdf ---
function sdf(p) {
  let d = Infinity;
  for (const s of segments) {
    const {d: dist, t} = segDist(p, s.a, s.b);
    const seg = dist - (s.r1 + (s.r2 - s.r1) * t);
    d = d === Infinity ? seg : smin(d, seg, 0.10);
  }
  return d;
}

/** One reusable pan + cup assembly, built once and placed six times.
 *  Deliberately over-engaged: the cup's shank runs down to the pan's bottom
 *  face and the bore floor sits well above the pan's dish, so the union is
 *  solid metal instead of two shells touching along a ring. Ring contact is
 *  what made the first attempt come out at genus 14. */
function panAndCup() {
  const pan = Manifold.cylinder(PAN_H, PAN_R, PAN_R * 0.92, 48)
                  .subtract(Manifold.sphere(0.55, 64)
                                .translate(0, 0, PAN_H + 0.55 - 0.035));
  const shank = Manifold.cylinder(PAN_H + CUP_H, CUP_R, CUP_R * 0.94, 32);
  const bore = Manifold.cylinder(0.2, BORE_R, BORE_R, 32)
                   .translate(0, 0, PAN_H + CUP_H - 0.12);
  return Manifold.union(pan, shank).subtract(bore);
}

function build() {
  const tree = Manifold.levelSet((p) => -sdf(p),
                                 {min: [-1.7, -1.7, -0.45], max: [1.7, 1.7, 3.4]},
                                 EDGE, 0, EDGE / 8);
  const table = Manifold.cube([6, 6, 2], true).translate(0, 0, -1);
  const fitting = panAndCup();
  const fittings = tips.map((t) => fitting.translate(t[0], t[1], t[2] + 0.02));
  const whole = Manifold.union([tree.subtract(table), ...fittings]);
  const lean = SIMPLIFY_TOL > 0 ? whole.simplify(SIMPLIFY_TOL) : whole;
  console.log(`  simplify: ${whole.numTri()} -> ${lean.numTri()} tris ` +
              `(tolerance ${SIMPLIFY_TOL})`);
  return lean.asOriginal().calculateNormals(3, 55);
}

const lap = stopwatch();
const candelabra = build();
describe(`B5 candelabra (edge=${EDGE}, ${segments.length} segments, ${tips.length} tips, min tip gap ${minGap.toFixed(3)})`,
         candelabra);
console.log('TIPS ' + JSON.stringify(tips.map((t) => t.map((v) => +v.toFixed(4)))));
await save(
    {
      manifold: candelabra,
      name: 'candelabra',
      material: {
        name: 'brass',
        attributes: ['NORMAL'],
        baseColorFactor: [0.72, 0.55, 0.24],
        metallic: 0.9,
        roughness: 0.35,
      },
    },
    process.argv[2]);
console.log(`bake_seconds ${lap().toFixed(2)}`);
