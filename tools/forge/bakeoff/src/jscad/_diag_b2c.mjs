// Can a hollow tube be built manifold at all? Try the 2D-annulus route.
import { primitives, booleans, extrusions, transforms, writeSTL, deg } from './lib.mjs'

const SEG = 64
const ring = booleans.subtract(
  primitives.circle({ radius: 1.6, segments: SEG }),
  primitives.circle({ radius: 1.25, segments: SEG })
)
const tube = extrusions.extrudeLinear({ height: 9.3 }, ring)
writeSTL('_f_tube_extrude.stl', tube)

// then a through-cut on that tube (the doorway case)
const straight = 2.2 - 0.55
const profile = booleans.union(
  primitives.rectangle({ size: [1.1, straight], center: [0, straight / 2] }),
  primitives.circle({ radius: 0.55, center: [0, straight], segments: 48 }))
const door = transforms.rotateX(deg(90), extrusions.extrudeLinear({ height: 3.0 }, profile))
writeSTL('_f_tube_door.stl', booleans.subtract(tube, door))

// blind recess on a plain cylinder (arrow slit case, no annulus involved)
const cyl = primitives.cylinder({ radius: 1.6, height: 9.3, center: [0, 0, 4.65], segments: SEG })
const slit = primitives.cuboid({ size: [0.6, 0.15, 0.9], center: [1.78, 0, 3.1] })
writeSTL('_f_cyl_slit.stl', booleans.subtract(cyl, slit))

// union of a box onto a cylinder wall (merlon case)
const merl = primitives.cuboid({ size: [0.35, 0.55, 0.7], center: [1.425, 0, 9.65] })
writeSTL('_f_cyl_merlon.stl', booleans.union(cyl, merl))

// tube + merlon union
writeSTL('_f_tube_merlon.stl', booleans.union(tube, merl))

// full-height tube with wedge crenel gaps subtracted
const tube10 = extrusions.extrudeLinear({ height: 10 }, ring)
const halfGap = 0.55 / 1.425 / 2
const wedges = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => primitives.cylinderElliptic({
  height: 1.0, center: [0, 0, 9.8], startRadius: [3, 3], endRadius: [3, 3],
  startAngle: i * Math.PI / 4 + halfGap, endAngle: (i + 1) * Math.PI / 4 - halfGap, segments: SEG
}))
writeSTL('_f_tube_crenel.stl', booleans.subtract(tube10, ...wedges))
console.log('diag3 written')
