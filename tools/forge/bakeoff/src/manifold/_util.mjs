// Copyright 2026 The Dice Table Authors.
//
// Shared glue for the Manifold bake-off models. Geometry lives in the B*.mjs
// files; this file only knows how to get a finished Manifold onto disk.
//
// Two facts about manifoldCAD's glTF exporter that every model here depends on:
//   1. It authors Z-up and wraps the scene in a node rotated -90deg about X,
//      so authoring (x, y, z) lands at world (x, z, -y). Authoring +Z is
//      world up; the spec's "front is world +Z" is authoring -Y.
//   2. It treats authoring units as millimetres and scales by 1/1000 on the
//      way out (glTF is metres). We author in table units, so that has to be
//      cancelled -- but cancel it on the NODE, never by scaling the geometry.
//      Scaling the Manifold by 1000 works and renders identically, yet it
//      leaves raw vertex values in the thousands, and any consumer that welds
//      with an absolute epsilon (trimesh's merge_vertices, and therefore the
//      bake-off harness) then over-merges by three orders of magnitude and
//      reports a perfectly good solid as non-manifold. Cost us B4 twice.
import {GLTFNode} from 'manifold-3d/manifoldCAD';
import {GLTFNodesToGLTFDoc} from 'manifold-3d/lib/scene-builder.js';
import {writeFile} from 'manifold-3d/lib/export-model.js';

export const EXPORT_SCALE = 1000;

/**
 * Write one or more parts to a .glb.
 * @param parts {manifold, material?, name?} or a bare Manifold, or a list.
 * @param outPath destination .glb
 */
export async function save(parts, outPath) {
  const list = Array.isArray(parts) ? parts : [parts];
  const nodes = list.map((p) => {
    const part = p.manifold ? p : {manifold: p};
    const node = new GLTFNode();
    node.manifold = part.manifold;
    node.scale = [EXPORT_SCALE, EXPORT_SCALE, EXPORT_SCALE];
    if (part.material) node.material = part.material;
    if (part.name) node.name = part.name;
    return node;
  });
  const doc = await GLTFNodesToGLTFDoc(nodes);
  await writeFile(outPath, doc);
}

/** Wall-clock report used by every model's main(). */
export function stopwatch() {
  const t0 = performance.now();
  return () => (performance.now() - t0) / 1000;
}

/** Report the numbers we care about without leaving the process. */
export function describe(label, manifold) {
  const b = manifold.boundingBox();
  const f = (v) => v.map((x) => x.toFixed(3)).join(', ');
  console.log(`${label}: tris=${manifold.numTri()} genus=${manifold.genus()} ` +
              `status=${manifold.status()} bbox=[${f(b.min)}] .. [${f(b.max)}]`);
}

// ---------------------------------------------------------------- noise ----
// Deterministic value noise. No Math.random anywhere in this battery: the
// hash is a pure function of the integer lattice point, so two runs of any
// model produce bit-identical geometry.

/** 32-bit integer hash -> [0, 1). */
export function hash3(ix, iy, iz, seed = 1337) {
  let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (iz | 0) * 2147483647 +
      seed * 971;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

/** Smooth 3D value noise in [-1, 1]. */
export function valueNoise3(x, y, z, seed = 1337) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  let c = [];
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++)
        c.push(hash3(ix + dx, iy + dy, iz + dz, seed));
  const x00 = lerp(c[0], c[1], fx), x10 = lerp(c[2], c[3], fx);
  const x01 = lerp(c[4], c[5], fx), x11 = lerp(c[6], c[7], fx);
  return (lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz) - 0.5) * 2;
}

/** Fractal sum of value noise, amplitude-normalised to about [-1, 1]. */
export function fbm3(x, y, z, octaves = 3, seed = 1337, lacunarity = 2.07,
                    gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq, seed + o * 101);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// ------------------------------------------------------------ sdf tools ----
/** Polynomial smooth minimum (IQ). Blends two distances over width k. */
export function smin(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return lerp(b, a, h) - k * h * (1 - h);
}

/** Smooth maximum, the intersection/inside-positive counterpart of smin. */
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

/** Distance from p to the segment ab, plus the parameter t along it. */
export function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  let t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (len2 || 1);
  t = Math.max(0, Math.min(1, t));
  const d = [ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t];
  return {d: Math.hypot(d[0], d[1], d[2]), t};
}
