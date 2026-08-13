// Narrow it down: which single boolean introduces the open edges?
import { primitives, booleans, writeSTL } from './lib.mjs'

const SEG = 64
const cyl = primitives.cylinder({ radius: 1.6, height: 9.3, center: [0, 0, 4.65], segments: SEG })
const cone = primitives.cylinderElliptic({ height: 1.2, startRadius: [2.1, 2.1], endRadius: [1.6, 1.6], center: [0, 0, 0.6], segments: SEG })
const bore = primitives.cylinder({ radius: 1.25, height: 9.1, center: [0, 0, 0.3 + 4.55], segments: SEG })
const box = primitives.cuboid({ size: [1, 1, 1], center: [1.4, 0, 5] })

writeSTL('_e_cyl.stl', cyl)
writeSTL('_e_cone.stl', cone)
writeSTL('_e_union.stl', booleans.union(cyl, cone))
writeSTL('_e_bore.stl', booleans.subtract(cyl, bore))
writeSTL('_e_box_cut.stl', booleans.subtract(cyl, box))
writeSTL('_e_union_bore.stl', booleans.subtract(booleans.union(cyl, cone), bore))
// same union, but with the cone overlapping the cylinder instead of tangent
const cone2 = primitives.cylinderElliptic({ height: 1.2, startRadius: [2.1, 2.1], endRadius: [1.55, 1.55], center: [0, 0, 0.6], segments: SEG })
writeSTL('_e_union_overlap.stl', booleans.union(cyl, cone2))
// retessellate pass on the failing case
const { retessellate, generalize, snap } = (await import('@jscad/modeling')).default.modifiers
writeSTL('_e_bore_retess.stl', retessellate(booleans.subtract(cyl, bore)))
writeSTL('_e_bore_snap.stl', snap(booleans.subtract(cyl, bore)))
writeSTL('_e_bore_gen.stl', generalize({ snap: true, triangulate: true }, booleans.subtract(cyl, bore)))
console.log('diag2 written')
