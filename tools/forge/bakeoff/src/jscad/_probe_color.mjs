import jscad from '@jscad/modeling'
import stl from '@jscad/stl-serializer'
import mf3 from '@jscad/3mf-serializer'
import objs from '@jscad/obj-serializer'
import { writeFileSync } from 'node:fs'
const { primitives, transforms, colors } = jscad

const a = colors.colorize([0.8, 0.2, 0.2], primitives.cuboid({ size: [2, 2, 2] }))
const b = colors.colorize([0.1, 0.1, 0.15], transforms.translate([3, 0, 0], primitives.sphere({ radius: 1, segments: 24 })))
const OUT = '/tmp/claude-1000/-home-jpbetz-projects-dice/0dc7b008-4d61-4067-a85e-9ddd3fd5a611/scratchpad/eval/out/jscad/'
const d3 = mf3.serialize({}, a, b)
console.log('3mf chunks:', d3.length, d3.map((x) => x && x.constructor && x.constructor.name))
writeFileSync(OUT + '_probe.3mf', Buffer.concat(d3.map((x) => Buffer.from(x))))
const dobj = objs.serialize({}, a, b)
console.log('obj chunks:', dobj.length)
writeFileSync(OUT + '_probe.obj', dobj.join(''))
const dstl = stl.serialize({ binary: true }, a, b)
writeFileSync(OUT + '_probe.stl', Buffer.concat(dstl.map((x) => Buffer.from(x))))
console.log('ok')
