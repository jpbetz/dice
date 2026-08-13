// B6 plaque — text on a curved surface.
//
// The plaque is a band between two vertical cylinders (r 4.00 front, 4.25
// back) clipped to 2.6 x 1.8, built as a 2D cross-section and extruded, so
// the body itself needs no 3D boolean at all.
//
// The text is the honest hard part. JSCAD's text is a STROKE font:
// vectorChar returns polylines, not outlines, so a glyph only becomes a
// solid after expand() gives the strokes width. And JSCAD has no bend, warp
// or shrink-wrap, so an engraving cannot follow a curved face directly --
// a flat cutter 2.0 wide would sit 0.13 proud of a face that falls away by
// that much. The approximation used here: cut each LETTER as its own flat
// prism and rotate it about the cylinder axis to the letter's own arc
// position, so each glyph is engraved on its local tangent plane. Residual
// depth error across one 0.45-wide glyph is w^2/8R = 0.006 -- about a tenth
// of the 0.05 engraving depth, and invisible at game distance.
import { primitives, booleans, transforms, extrusions, expansions, geometries, text, deg, bake } from './lib.mjs'

const W = 2.6 // plaque width
const H = 1.8 // plaque height
const THICK = 0.25
const R_FRONT = 4.0 // bow radius of the face
const R_BACK = R_FRONT - THICK // both faces bow the same way -> constant 0.25
const AXIS_Y = R_FRONT - THICK / 2 // axis at +3.875, so the face centre sits at y = -0.125

const FRAME_W = 0.18 // border width
const FRAME_RAISE = 0.06 // how far the border stands proud
const ENGRAVE = 0.05 // depth of the letters
const CAP = 0.55 // cap height of the text
// vectorChar's `height` is a font size, not the cap height: the glyphs come
// out 1.5x it (measured), so ask for CAP/1.5 to actually get CAP.
const FONT_SIZE = CAP / 1.5
const STROKE = 0.045 // half-width of the stroke font's strokes
const ARC_SEG = 256 // segments on the r=4 circles -> 0.1u facets on the face

/**
 * 2D cross-section of the material between two co-axial arcs, clipped to
 * +/-halfWidth in x. The clip window in y also throws away the far side of
 * the annulus (which sits up around y = 7.7).
 */
const band = (rIn, rOut, halfWidth) => booleans.intersect(
  booleans.subtract(
    primitives.circle({ radius: rOut, center: [0, AXIS_Y], segments: ARC_SEG }),
    primitives.circle({ radius: rIn, center: [0, AXIS_Y], segments: ARC_SEG })
  ),
  // y window: -0.55 clears the proudest frame, +0.5 clears the back face
  // where it recedes at the corners; the far side of the annulus is at +7.7.
  primitives.rectangle({ size: [halfWidth * 2, 1.05], center: [0, -0.025] })
)

/** Extrude a cross-section upward into a slab of the given height. */
const slab = (section, height, z) =>
  transforms.translateZ(z, extrusions.extrudeLinear({ height }, section))

/**
 * Body: the plaque itself, plus a border ring standing FRAME_RAISE proud.
 * The ring is cut from a full-face slab that reaches from 3.90 (buried
 * inside the body) out to 4.06, and the window cutter over-reaches on both
 * radii, so no two surfaces in the union or the subtract are coincident.
 */
const plaqueBody = () => {
  const face = slab(band(R_BACK, R_FRONT, W / 2), H, 0)
  const ring = booleans.subtract(
    slab(band(R_FRONT - 0.10, R_FRONT + FRAME_RAISE, W / 2), H, 0),
    slab(band(R_FRONT - 0.15, R_FRONT + FRAME_RAISE + 0.05, W / 2 - FRAME_W),
      H - 2 * FRAME_W, FRAME_W)
  )
  return booleans.union(face, ring)
}

/** Rotate a flat cutter onto the tangent plane at arc position u. */
const wrapToArc = (geom, u) => transforms.translate([0, AXIS_Y, 0],
  transforms.rotateZ(u / R_FRONT,
    transforms.translate([0, -AXIS_Y, 0], transforms.translate([-u, 0, 0], geom))))

/**
 * One letter as a cutting prism: stroke polylines -> expanded 2D solid ->
 * prism standing in the XZ plane, its cutting face ENGRAVE deep into the
 * face plane at y = -THICK/2.
 */
const letterCutter = (segments, baseline) => {
  const strokes = segments.map((seg) => expansions.expand(
    { delta: STROKE, corners: 'round', segments: 8 },
    geometries.path2.fromPoints({ closed: false }, seg)
  ))
  const flat = booleans.union(...strokes)
  const prism = extrusions.extrudeLinear({ height: 0.30 }, flat)
  // rotateX(90) stands the glyph up (2D y -> z) and points the extrusion at
  // -y; then push it back so it bottoms out ENGRAVE below the face.
  return transforms.translate([0, -(THICK / 2 - ENGRAVE), baseline],
    transforms.rotateX(deg(90), prism))
}

/**
 * "DICE", laid out by hand: each glyph is measured, advanced, and finally
 * centred on the INK of the whole word (the font's side bearings are large
 * enough that centring on advance widths visibly drifts).
 */
const engraving = () => {
  const glyphs = []
  let cursor = 0
  for (const ch of 'DICE') {
    const char = text.vectorChar({ height: FONT_SIZE }, ch)
    const xs = char.segments.flat().map((p) => p[0])
    glyphs.push({
      segments: char.segments,
      inkMin: cursor + Math.min(...xs),
      inkMax: cursor + Math.max(...xs),
      shift: cursor
    })
    cursor += char.width
  }
  const inkLeft = Math.min(...glyphs.map((g) => g.inkMin))
  const inkRight = Math.max(...glyphs.map((g) => g.inkMax))
  const recentre = -(inkLeft + inkRight) / 2
  const baseline = H / 2 - CAP / 2

  return glyphs.map((g) => {
    const u = (g.inkMin + g.inkMax) / 2 + recentre // this glyph's arc position
    const placed = transforms.translateX(g.shift + recentre,
      letterCutter(g.segments, baseline))
    return wrapToArc(placed, u)
  })
}

const build = () => booleans.subtract(plaqueBody(), ...engraving())

bake('B6_plaque', build)
