// Shared helpers for the JSCAD bake-off battery.
//
// JSCAD is Z-up. Everything here is authored Z-up, standing on z=0, and the
// harness converter (stl2glb.py --zup) rotates it to the glTF Y-up frame:
//   jscad (x, y, z)  ->  gltf (x, z, -y)
// so glTF "front is +Z" means the model's front faces jscad -Y.
//
// @jscad/modeling v2 ships as CommonJS, so ESM has to import the default
// export and destructure (named imports throw at parse time).
import jscad from '@jscad/modeling'
import stlSerializer from '@jscad/stl-serializer'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const {
  primitives, booleans, transforms, extrusions, expansions,
  hulls, geometries, measurements, colors, modifiers, text, maths, utils
} = jscad

export const OUT = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', 'out', 'jscad'
)

export const TAU = Math.PI * 2
export const deg = (d) => (d * Math.PI) / 180

/** glTF-frame point (x right, y up, z front) -> the JSCAD point that lands there. */
export const fromYUp = ([x, y, z]) => [x, -z, y]

// ---------------------------------------------------------------- output ---

/** Serialize one or more geom3 to a binary STL. */
export const writeSTL = (file, ...geoms) => {
  mkdirSync(OUT, { recursive: true })
  const chunks = stlSerializer.serialize({ binary: true }, ...geoms)
  const path = join(OUT, file)
  writeFileSync(path, Buffer.concat(chunks.map((c) => Buffer.from(c))))
  return path
}

/**
 * Build + write + report, with the numbers the battery asks for.
 * `build()` returns a geom3, or [{geom, part, color}] for multi-part
 * (per-part color) models: each part is written to its own STL so the
 * converter can tint it, then merged into one GLB downstream.
 */
export const bake = (name, build) => {
  const t0 = performance.now()
  const result = build()
  const parts = Array.isArray(result) ? result : [{ geom: result, part: null }]
  const secs = (performance.now() - t0) / 1000

  let polys = 0
  const files = []
  for (const p of parts) {
    polys += p.geom.polygons.length
    const file = p.part ? `${name}__${p.part}.stl` : `${name}.stl`
    writeSTL(file, p.geom)
    files.push(file)
  }
  const [lo, hi] = measurements.measureAggregateBoundingBox(parts.map((p) => p.geom))
  const r = (v) => v.map((n) => Math.round(n * 1000) / 1000)
  console.log(JSON.stringify({
    name,
    bake_seconds: Math.round(secs * 1000) / 1000,
    polygons: polys,
    files,
    // reported in the glTF frame the GLB will be inspected in
    gltf_bounds_min: r(fromGeomMin(lo, hi).min),
    gltf_bounds_max: r(fromGeomMin(lo, hi).max),
    jscad_bounds: [r(lo), r(hi)],
    colors: parts.map((p) => p.color || null)
  }))
  return secs
}

/** jscad bbox -> the bbox the GLB will report (x, z, -y remap). */
const fromGeomMin = (lo, hi) => {
  const xs = [lo[0], hi[0]]; const ys = [-hi[1], -lo[1]]; const zs = [lo[2], hi[2]]
  return { min: [xs[0], zs[0], ys[0]], max: [xs[1], zs[1], ys[1]] }
}

// ------------------------------------------------------------ math bits ---

/** Deterministic 32-bit PRNG (mulberry32) — fixed seed, identical every run. */
export const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t

/**
 * Deterministic 3D value noise in [-1, 1].
 * JSCAD has no noise/displacement operator, so B4's bark relief is host-side
 * math that decides vertex positions before they ever become geometry.
 */
export const makeNoise3 = (seed) => {
  const hash = (i, j, k) => {
    let h = seed + i * 374761393 + j * 668265263 + k * 2147483647
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1
  }
  return (x, y, z) => {
    const i = Math.floor(x); const j = Math.floor(y); const k = Math.floor(z)
    const fx = smooth(x - i); const fy = smooth(y - j); const fz = smooth(z - k)
    const c = (di, dj, dk) => hash(i + di, j + dj, k + dk)
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), fx)
    const x10 = lerp(c(0, 1, 0), c(1, 1, 0), fx)
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), fx)
    const x11 = lerp(c(0, 1, 1), c(1, 1, 1), fx)
    return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz)
  }
}

/** Sum of octaves, each half amplitude and double frequency. */
export const fbm = (noise, octaves = 3) => (x, y, z) => {
  let sum = 0; let amp = 1; let norm = 0; let f = 1
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f, y * f, z * f)
    norm += amp; amp *= 0.5; f *= 2
  }
  return sum / norm
}

/** Quadratic/cubic bezier point, used by B5's arms. */
export const bezierAt = (pts, t) => {
  let cur = pts
  while (cur.length > 1) {
    const next = []
    for (let i = 0; i < cur.length - 1; i++) {
      next.push([
        lerp(cur[i][0], cur[i + 1][0], t),
        lerp(cur[i][1], cur[i + 1][1], t),
        lerp(cur[i][2], cur[i + 1][2], t)
      ])
    }
    cur = next
  }
  return cur[0]
}
