// B5 candelabra — recursion / grammar power.
//
// The whole tree is one recursive function: an arm is a tapering hullChain
// of spheres swept along a cubic bezier, and it either splits into children
// or ends in a drip-pan. hullChain is what makes the junctions blend — each
// link is the convex hull of two spheres, so consecutive links share a
// surface and there are no open seams. (What JSCAD cannot do is a true
// fillet where a child meets its parent: overlapping hulls join without a
// gap, but the join is a crease, not a blend radius.)
import { primitives, booleans, transforms, extrusions, hulls, geometries, bezierAt, deg, bake } from './lib.mjs'

const BASE_R = 0.7
const BASE_H = 0.18
const SPHERE_SEG = 10 // hull input density -> the whole tri budget rides on this
const SAMPLES = 7 // spheres per arm

// Radius per generation: x0.75 each time, as specced.
const R = [0.22, 0.165, 0.124, 0.093]

// One rule per generation: how far out and up the arm reaches, how it leans,
// how many children it makes and how far they fan apart.
const RULES = [
  { out: 0.00, rise: 1.20, tilt: 0, children: 3, fan: 120 }, // trunk
  { out: 0.62, rise: 0.85, tilt: 40, children: 2, fan: 32 }, // 3 arms
  { out: 0.42, rise: 0.65, tilt: 30, children: 0, fan: 0 } // 6 tips
]

/**
 * Control points of one arm: leaves its origin leaning `tilt` off vertical
 * on the given bearing and arrives at the tip pointing straight up, so a
 * drip-pan or the next split sits level.
 */
const armCurve = (origin, bearing, rule) => {
  const b = deg(bearing)
  const out = [Math.cos(b), Math.sin(b), 0]
  const lean = Math.sin(deg(rule.tilt))
  const climb = Math.cos(deg(rule.tilt))
  const tip = [
    origin[0] + out[0] * rule.out,
    origin[1] + out[1] * rule.out,
    origin[2] + rule.rise
  ]
  const lead = rule.rise * 0.55
  return [
    origin,
    [origin[0] + out[0] * lean * lead, origin[1] + out[1] * lean * lead, origin[2] + climb * lead],
    [tip[0], tip[1], tip[2] - rule.rise * 0.45], // arrive vertical
    tip
  ]
}

/** A tapering tube along a curve: spheres hulled nose to tail. */
const limb = (curve, rStart, rEnd) => hulls.hullChain(
  ...Array.from({ length: SAMPLES }, (_, i) => {
    const t = i / (SAMPLES - 1)
    return primitives.sphere({
      radius: rStart + (rEnd - rStart) * t,
      center: bezierAt(curve, t),
      segments: SPHERE_SEG
    })
  })
)

/** Drip-pan and candle cup, as one revolved outline. */
const fitting = (at) => transforms.translate(at,
  extrusions.extrudeRotate({ segments: 28 }, geometries.geom2.fromPoints([
    [0, 0],
    [0.28, 0.00], // pan floor out to the rim
    [0.28, 0.07], // rim
    [0.105, 0.07], // in across the pan
    [0.105, 0.30], // cup, outside
    [0.072, 0.30], // cup rim
    [0.072, 0.09], // cup, inside
    [0, 0.09] // cup floor
  ])))

/** The grammar: grow an arm, then either split it or cap it. */
const grow = (origin, bearing, gen) => {
  const rule = RULES[gen]
  const curve = armCurve(origin, bearing, rule)
  const tip = curve[3]
  const parts = [limb(curve, R[gen], R[gen + 1])]

  if (rule.children === 0) {
    parts.push(fitting(tip))
  } else {
    for (let c = 0; c < rule.children; c++) {
      // 3 children fan a full 360/3 apart; 2 children straddle the parent.
      const spread = rule.children === 2
        ? bearing + (c === 0 ? -rule.fan : rule.fan)
        : bearing + c * rule.fan
      parts.push(...grow(tip, spread, gen + 1))
    }
  }
  return parts
}

/** Turned foot, as a profile revolved about Z. */
const foot = () => extrusions.extrudeRotate({ segments: 36 },
  geometries.geom2.fromPoints([
    [0, 0], [BASE_R, 0], [BASE_R, 0.05], [0.44, 0.10], [0.30, BASE_H], [0, BASE_H]
  ]))

// The trunk starts one radius up so its first hull sphere is swallowed by
// the foot instead of bulging through the ground plane.
const build = () => booleans.union(foot(), ...grow([0, 0, R[0]], 0, 0))

bake('B5_candelabra', build)
