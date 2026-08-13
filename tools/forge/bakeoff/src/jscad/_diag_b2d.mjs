// extrudeRotate orientation + manifoldness; and is flat-vs-flat CSG clean?
import { primitives, booleans, extrusions, geometries, writeSTL, measurements } from './lib.mjs'

const profile = geometries.geom2.fromPoints([
  [0, 0], [2.1, 0], [1.6, 1.2], [1.6, 10], [1.25, 10], [1.25, 0.3], [0, 0.3]
])
const rev = extrusions.extrudeRotate({ segments: 64 }, profile)
console.log('extrudeRotate bounds:', measurements.measureBoundingBox(rev))
writeSTL('_g_revolve.stl', rev)

// flat vs flat: does a box-box subtract stay manifold?
writeSTL('_g_box_box.stl', booleans.subtract(
  primitives.cuboid({ size: [2, 2, 2] }),
  primitives.cuboid({ size: [1, 1, 3], center: [0.5, 0, 0] })))
// flat vs flat, cut fully through in one axis
writeSTL('_g_box_thru.stl', booleans.subtract(
  primitives.cuboid({ size: [2, 2, 2] }),
  primitives.cuboid({ size: [1, 4, 1], center: [0, 0, 0] })))
