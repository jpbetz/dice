// B2 turret — architectural CSG + arrays.
//
// The body is ONE solid of revolution: a single 2D profile (radius, height)
// spun 360 deg gives the flared skirt, the 0.35 wall, the bore and the
// interior floor with no booleans at all. Everything else is subtractive:
// 8 pie-wedge crenel gaps, 3 blind slit recesses that stop 0.23 short of the
// bore, and one arched doorway driven through the front wall as a tunnel.
//
// Manifold note: JSCAD's BSP booleans leave T-junctions wherever a cutting
// plane crosses a faceted curved surface, so anything cut into the round
// shaft reports non-watertight. The revolve alone is clean (verified).
import { primitives, booleans, transforms, extrusions, geometries, deg, bake } from './lib.mjs'

const R_OUT = 1.6
const WALL = 0.35
const R_IN = R_OUT - WALL // 1.25 bore
const TOTAL_H = 10.0 // ground to merlon top
const MERLON_H = 0.7
const RIM_Z = TOTAL_H - MERLON_H // 9.3: crenel floor
const FLARE_R = 2.1
const FLARE_H = 1.2
const FLOOR_Z = 0.3 // interior floor, visible through the doorway
const SEG = 64

const DOOR_W = 1.1
const DOOR_H = 2.2
const SLIT_W = 0.15
const SLIT_H = 0.9
const SLIT_DEPTH = 0.12

const SLITS = [ // [centre height, bearing in degrees]
  { z: 3.1, angle: 25 },
  { z: 5.2, angle: 145 },
  { z: 7.0, angle: 262 }
]

/** Half-angle of one merlon, so its arc width is 0.55 at mid-wall. */
const MERLON_HALF = 0.55 / (R_OUT + R_IN) // = (0.55 / 1.425) / 2 rad

/** Tower body as a profile in (radius, height), revolved about Z. */
const shell = () => extrusions.extrudeRotate({ segments: SEG },
  geometries.geom2.fromPoints([
    [0, 0], // axis, ground
    [FLARE_R, 0], // skirt foot
    [R_OUT, FLARE_H], // skirt meets the shaft
    [R_OUT, TOTAL_H], // outer wall to the top of the merlons
    [R_IN, TOTAL_H], // wall thickness
    [R_IN, FLOOR_Z], // bore
    [0, FLOOR_Z] // interior floor
  ]))

/** The gap between two merlons: a pie wedge tall enough to clear the top. */
const crenelGap = (i) => primitives.cylinderElliptic({
  height: MERLON_H + 0.4,
  center: [0, 0, RIM_Z + (MERLON_H + 0.4) / 2],
  startRadius: [FLARE_R + 1, FLARE_R + 1],
  endRadius: [FLARE_R + 1, FLARE_R + 1],
  startAngle: (i * Math.PI) / 4 + MERLON_HALF,
  endAngle: ((i + 1) * Math.PI) / 4 - MERLON_HALF,
  segments: SEG
})

/** A slot that eats SLIT_DEPTH into the outer skin and no further. */
const slit = ({ z, angle }) => transforms.rotateZ(deg(angle),
  primitives.cuboid({
    size: [0.5, SLIT_W, SLIT_H],
    center: [R_OUT - SLIT_DEPTH + 0.25, 0, z]
  }))

/** Arched doorway profile, extruded along -Y (glTF +Z) through the wall. */
const doorway = () => {
  const straight = DOOR_H - DOOR_W / 2
  const profile = booleans.union(
    primitives.rectangle({ size: [DOOR_W, straight], center: [0, straight / 2] }),
    primitives.circle({ radius: DOOR_W / 2, center: [0, straight], segments: 48 })
  )
  // extrudeLinear runs +Z; rotateX(90) lays that axis onto -Y and stands the
  // profile up in Z. The tunnel spans y -2.5..-1.1: it starts outside the
  // skirt and stops just inside the bore, so it opens into the chamber
  // without trenching the interior floor.
  const tunnel = extrusions.extrudeLinear({ height: 1.4 }, profile)
  return transforms.translate([0, -1.1, 0], transforms.rotateX(deg(90), tunnel))
}

const build = () => booleans.subtract(
  shell(),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(crenelGap),
  ...SLITS.map(slit),
  doorway()
)

bake('B2_turret', build)
