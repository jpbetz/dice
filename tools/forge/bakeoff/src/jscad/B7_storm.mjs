// B7 boolean-storm — robustness + performance.
//
// 120 spheres and one rotated box out of a 3.0 cube. The sphere list is
// authored in the app's Y-up frame; JSCAD is Z-up, so every centre is
// remapped with fromYUp (x, y, z) -> (x, -z, y). The box's "25 degrees
// about Y" becomes rotateZ here for the same reason.
//
// SPHERE_SEG is the one density knob; pass it on the command line to trade
// bake time against how round the cavities are.
import { readFileSync } from 'node:fs'
import { primitives, booleans, transforms, fromYUp, deg, bake } from './lib.mjs'

const SPHERE_SEG = Number(process.argv[2] || 24)
const CUBE = 3.0
const CUT_BOX = 3.0
const CUT_ANGLE = 25 // degrees about the Y-up axis

const spheres = JSON.parse(readFileSync(
  new URL('../../harness/spheres.json', import.meta.url), 'utf8'))

const build = () => {
  const block = primitives.cuboid({ size: [CUBE, CUBE, CUBE], center: fromYUp([0, 1.5, 0]) })
  const holes = spheres.map((s) => primitives.sphere({
    radius: s.r, center: fromYUp([s.x, s.y, s.z]), segments: SPHERE_SEG
  }))
  const reveal = transforms.translate(fromYUp([1.8, 2.7, 0]),
    transforms.rotateZ(deg(CUT_ANGLE), primitives.cuboid({ size: [CUT_BOX, CUT_BOX, CUT_BOX] })))
  return booleans.subtract(block, ...holes, reveal)
}

bake(`B7_storm`, build)
