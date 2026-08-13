// B4 gnarl — organic.
//
// JSCAD has no noise, no displacement and no subdivision surface, so there
// is nothing native to reach for here: the honest route is to compute the
// surface in the host language and hand JSCAD the points.
// extrudeFromSlices is the vehicle — it takes a callback that returns one
// cross-section at a time and skins them, so the whole stump is a single
// lofted solid with no boolean anywhere (and therefore no hard CSG edge).
//
// radius(theta, z) = taper + root flares + 2-octave value noise
// The noise is sampled at the 3D surface position, so it wraps seamlessly
// around the trunk instead of seaming at theta = 0.
import { extrusions, transforms, measurements, geometries, makeNoise3, fbm, bake } from './lib.mjs'

const HEIGHT = 2.6
const BASE_R = 1.15 // taper foot; the root flares carry it out to ~1.5
const TOP_R = 0.8
const DISH = 0.14 // how far the sawn top dips in the middle

const RINGS = 48 // slices up the trunk
const RADIALS = 112 // points around each slice -> ~0.06u spacing at the base
const DISH_RINGS = 10

// The 2-octave fbm peaks near +-0.8 (measured), so 0.10 puts the bark relief
// at the spec's ~0.08 at the extremes, rms ~0.027.
const BARK_AMP = 0.10
const BARK_FREQ = 2.2 // ~0.45u primary features; octave 2 lands near 0.22u
const ROOTS = 5

const noise = fbm(makeNoise3(20260812), 2)

/** Root flares: fixed bearings, fixed weights — deterministic by construction. */
const rootBearing = (k) => (k / ROOTS) * Math.PI * 2 + 0.37 * Math.sin(k * 2.1)
const rootWeight = (k) => 0.28 + 0.08 * Math.sin(k * 1.7 + 0.6)

/** Angular distance to the nearest root, wrapped to [-pi, pi]. */
const angleTo = (theta, k) => {
  let d = theta - rootBearing(k)
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Trunk radius before bark relief: taper plus root flares that fade upward. */
const trunkRadius = (theta, z) => {
  let r = TOP_R + (BASE_R - TOP_R) * Math.exp(-z / 0.62)
  for (let k = 0; k < ROOTS; k++) {
    const d = angleTo(theta, k)
    const spread = Math.exp(-(d * d) / (2 * 0.38 * 0.38))
    r += rootWeight(k) * spread * Math.exp(-z / 0.5)
  }
  return r
}

/** Bark relief, sampled in 3D so it is continuous all the way around. */
const bark = (theta, z, r) => BARK_AMP * noise(
  Math.cos(theta) * r * BARK_FREQ,
  Math.sin(theta) * r * BARK_FREQ,
  z * BARK_FREQ * 1.35
)

/** Full surface radius at a bearing and height. */
const surfaceR = (theta, z) => {
  const base = trunkRadius(theta, z)
  return base + bark(theta, z, base)
}

/** One horizontal ring of RADIALS points, as a slice. */
const ring = (z, scale = 1, dz = 0) => extrusions.slice.fromPoints(
  Array.from({ length: RADIALS }, (_, i) => {
    const theta = (i / RADIALS) * Math.PI * 2
    const r = surfaceR(theta, z) * scale
    return [Math.cos(theta) * r, Math.sin(theta) * r, z + dz]
  })
)

/** Concave sawn top: rings march inward (s: 0 rim -> 1 centre) as they dip. */
const dishRing = (s, lift = 0) => {
  // never collapse the ring to a point: a 112-gon of radius ~0.01 earcuts
  // into slivers, and one of them came out degenerate (and got dropped on
  // conversion, opening a hole). 0.07 of the rim is small enough to read as
  // a dish bottom and big enough to triangulate.
  const scale = Math.max(1 - s, 0.07)
  const drop = DISH * (1 - (1 - s) * (1 - s))
  return ring(HEIGHT, scale, lift - drop)
}

/** The stump: RINGS of trunk, then DISH_RINGS of concave top, capped. */
const stump = () => extrusions.extrudeFromSlices({
  numberOfSlices: RINGS + DISH_RINGS,
  callback: (progress, index) => {
    if (index < RINGS) {
      // ease the sampling upward so the flared base gets more rings
      const t = index / (RINGS - 1)
      return ring(HEIGHT * t * t * 0.5 + HEIGHT * t * 0.5)
    }
    return dishRing((index - RINGS + 1) / DISH_RINGS)
  }
}, ring(0))

/**
 * The cut face, as its own 0.014-thick shell hugging the dish, so it can
 * carry a second colour. Same dish function, so the two mate exactly:
 * out-to-in along the dish, back in-to-out 0.014 higher, closed at the rim.
 */
const cutTop = () => {
  const n = DISH_RINGS + 1 // rings per face: rim (s=0) through centre (s=1)
  const shell = extrusions.extrudeFromSlices({
    numberOfSlices: n * 2,
    capStart: false,
    capEnd: false,
    close: true, // the closing section is the 0.014 lip at the rim
    callback: (progress, index) => {
      const underside = index < n
      const step = underside ? index : n * 2 - 1 - index
      return dishRing(step / DISH_RINGS, underside ? 0 : 0.014)
    }
  }, ring(HEIGHT))
  // A closed loop of slices has no inherent "up", and this traversal comes
  // back inside-out (measured: signed volume negative), so flip it.
  return geometries.geom3.invert(shell)
}

const build = () => {
  const bark = stump()
  const cut = cutTop()
  // The roots grow where the noise puts them, so recentre on the footprint.
  const [lo, hi] = measurements.measureBoundingBox(bark)
  const shift = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, 0]
  return [
    { geom: transforms.translate(shift, bark), part: 'bark', color: '96,72,52' },
    { geom: transforms.translate(shift, cut), part: 'cut', color: '186,156,112' }
  ]
}

bake('B4_gnarl', build)
