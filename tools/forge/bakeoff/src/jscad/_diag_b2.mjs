// Bisect which B2 operation breaks manifoldness.
import { primitives, booleans, transforms, extrusions, deg, writeSTL } from './lib.mjs'

const R_OUT = 1.6; const R_IN = 1.25; const SHAFT_H = 9.3; const SEG = 64

const shaft = primitives.cylinder({ radius: R_OUT, height: SHAFT_H, center: [0, 0, SHAFT_H / 2], segments: SEG })
const skirt = primitives.cylinderElliptic({ height: 1.2, startRadius: [2.1, 2.1], endRadius: [R_OUT, R_OUT], center: [0, 0, 0.6], segments: SEG })
const bore = primitives.cylinder({ radius: R_IN, height: 9.1, center: [0, 0, 0.3 + 9.1 / 2], segments: SEG })

const walls = booleans.subtract(booleans.union(shaft, skirt), bore)
writeSTL('_d_walls.stl', walls)

const merlons = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => transforms.rotateZ(i * Math.PI / 4,
  primitives.cuboid({ size: [0.35, 0.55, 0.7], center: [(R_OUT + R_IN) / 2, 0, SHAFT_H + 0.35] })))
writeSTL('_d_merlon_union.stl', booleans.union(walls, ...merlons))

const slit = ({ z, angle }) => transforms.rotateZ(deg(angle), primitives.cuboid({ size: [0.6, 0.15, 0.9], center: [R_OUT - 0.12 + 0.3, 0, z] }))
writeSTL('_d_slits.stl', booleans.subtract(walls, slit({ z: 3.1, angle: 25 }), slit({ z: 5.2, angle: 145 }), slit({ z: 7.0, angle: 262 })))

const straight = 2.2 - 0.55
const profile = booleans.union(
  primitives.rectangle({ size: [1.1, straight], center: [0, straight / 2] }),
  primitives.circle({ radius: 0.55, center: [0, straight], segments: 48 }))
const door = transforms.rotateX(deg(90), extrusions.extrudeLinear({ height: 3.0 }, profile))
writeSTL('_d_door.stl', booleans.subtract(walls, door))

// alternative crenellation: one full-height shell, pie-wedge gaps subtracted
const shaft10 = primitives.cylinder({ radius: R_OUT, height: 10, center: [0, 0, 5], segments: SEG })
const shell10 = booleans.subtract(booleans.union(shaft10, skirt), primitives.cylinder({ radius: R_IN, height: 9.8, center: [0, 0, 0.3 + 4.9], segments: SEG }))
const halfGap = 0.55 / 1.425 / 2 // radians of half a merlon at mid-wall
const wedges = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => primitives.cylinderElliptic({
  height: 1.0, center: [0, 0, 9.3 + 0.5], startRadius: [3, 3], endRadius: [3, 3],
  startAngle: i * Math.PI / 4 + halfGap, endAngle: (i + 1) * Math.PI / 4 - halfGap, segments: SEG
}))
writeSTL('_d_wedge_crenel.stl', booleans.subtract(shell10, ...wedges))
console.log('diag written')
