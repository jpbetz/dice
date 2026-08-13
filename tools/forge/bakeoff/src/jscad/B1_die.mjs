// B1 chamfered-die — hard-surface precision.
//
// Body: roundedCuboid gives a TRUE rounded fillet (radius 0.10) on all 12
// edges and 8 corners as a primitive — no manual filleting needed.
// Pips: spheres subtracted to leave spherical dents 0.08 deep.
// Colour: each dent is then re-filled with a slightly smaller solid cap that
// floats 0.001 inside the void, so it reads as a dark pip lining a real
// concave dent. Body and pips are written as separate STL parts and tinted
// on conversion (JSCAD's own colorize() only survives to 3MF/OBJ, not STL).
import { primitives, booleans, transforms, bake } from './lib.mjs'

const EDGE = 2.0 // cube edge
const FILLET = 0.10 // true rounded edge radius
const PIP_R = 0.22 // cutting sphere radius
const PIP_DEPTH = 0.08 // how deep the dent sinks below the face
const PIP_STEP = 0.45 // pip spacing within a face
const BODY_SEG = 24 // segments on the rounded edges
const PIP_SEG = 18 // segments on the pip spheres (rim smoothness)

// A pip sphere centred this far out from the die centre cuts exactly
// PIP_DEPTH into the face at EDGE/2.
const PIP_OUT = EDGE / 2 + (PIP_R - PIP_DEPTH)

// Face layouts, in face-local (u, v) units of PIP_STEP.
const LAYOUT = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]]
}

// Opposite faces sum to 7: 1/6 on Z, 2/5 on X, 3/4 on Y.
const FACES = [
  { pips: 1, n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { pips: 6, n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] },
  { pips: 2, n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { pips: 5, n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1] },
  { pips: 3, n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1] },
  { pips: 4, n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }
]

/** Centre of every pip sphere, in die-local coordinates. */
const pipCentres = () => {
  const out = []
  for (const f of FACES) {
    for (const [ou, ov] of LAYOUT[f.pips]) {
      out.push([0, 1, 2].map((i) =>
        f.n[i] * PIP_OUT + f.u[i] * ou * PIP_STEP + f.v[i] * ov * PIP_STEP))
    }
  }
  return out
}

const build = () => {
  const centres = pipCentres()
  const cutters = centres.map((c) =>
    primitives.sphere({ radius: PIP_R, center: c, segments: PIP_SEG }))

  const blank = primitives.roundedCuboid({
    size: [EDGE, EDGE, EDGE], roundRadius: FILLET, segments: BODY_SEG
  })
  const body = booleans.subtract(blank, ...cutters)

  // Dark inserts: 0.001 smaller than the void they sit in, so no z-fighting.
  const faceBox = primitives.cuboid({ size: [EDGE, EDGE, EDGE] })
  const pips = centres.map((c) => booleans.intersect(
    primitives.sphere({ radius: PIP_R - 0.001, center: c, segments: PIP_SEG }),
    faceBox
  ))

  const stand = (g) => transforms.translateZ(EDGE / 2, g) // sit on z = 0
  return [
    { geom: stand(body), part: 'body', color: '214,206,186' },
    { geom: stand(booleans.union(...pips)), part: 'pips', color: '38,34,40' }
  ]
}

bake('B1_die', build)
