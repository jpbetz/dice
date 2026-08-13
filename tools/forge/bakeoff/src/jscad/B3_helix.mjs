// B3 helix-ramp — sweeps/lofts.
//
// extrudeHelical is a first-class primitive here: hand it a 2D profile in
// (radius, height) and it sweeps it around Z with a given pitch, capping
// both ends with the planar profile. The U-channel is therefore described
// once, as a 10-point outline, and swept.
//
// One deliberate deviation from the letter of the spec: the floor plate is
// carried inboard to radius 0.42 so it buries itself in the r=0.5 column.
// The channel itself keeps its 1.2 floor / 0.35 walls / 0.12 material; the
// tab is what makes chute and column ONE solid instead of a chute hovering
// 0.45 away from the column it wraps.
import { primitives, booleans, extrusions, transforms, geometries, bake } from './lib.mjs'

const COL_R = 0.5
const COL_H = 8.0

const HELIX_R = 1.55 // radius to the centre of the channel floor
const FLOOR_W = 1.2
const WALL_H = 0.35
const THICK = 0.12
const PITCH = 2.6
const TURNS = 2.25
const START_Z = 1.6 // bottom of the run; the top end lands at 7.92
const TAB_R = 0.42 // floor tab reaches inside the column
const SEG_PER_TURN = 64

const IN = HELIX_R - FLOOR_W / 2 // 0.95
const OUT = HELIX_R + FLOOR_W / 2 // 2.15
const TOP = THICK + WALL_H // 0.47, top of the side walls

/**
 * U-channel cross-section in (radius, height), walking counterclockwise.
 *
 * extrudeHelical stands the profile up with rotateX(-90), which maps the
 * profile's +y onto -z: authored as-is the channel sweeps upside down and
 * below the floor. Mirroring in y first cancels that (and JSCAD's geom2
 * transform re-reverses the winding, so the solid stays right side out).
 */
const channelProfile = () => transforms.mirrorY(geometries.geom2.fromPoints([
  [TAB_R, 0],
  [OUT, 0],
  [OUT, TOP], // outer wall, outside face
  [OUT - THICK, TOP],
  [OUT - THICK, THICK], // down to the channel floor
  [IN + THICK, THICK],
  [IN + THICK, TOP], // inner wall, inside face
  [IN, TOP],
  [IN, THICK],
  [TAB_R, THICK]
]))

const build = () => {
  const column = primitives.cylinder({
    radius: COL_R, height: COL_H, center: [0, 0, COL_H / 2], segments: 48
  })
  const chute = transforms.translateZ(START_Z, extrusions.extrudeHelical({
    angle: Math.PI * 2 * TURNS,
    pitch: PITCH,
    segmentsPerRotation: SEG_PER_TURN
  }, channelProfile()))
  return booleans.union(column, chute)
}

bake('B3_helix', build)
