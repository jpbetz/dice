// Copyright 2026 The Dice Table Authors.
//
// B6 plaque. 2.6 x 1.8 x 0.25, face bowed on a vertical cylinder of radius 4,
// raised border frame 0.18 wide x 0.06 proud, "DICE" engraved 0.05 deep into
// the bow. Stands upright facing world +Z.
//
// Manifold has no text and no font support at all, so the glyphs come from
// opentype.js: parse a TTF, flatten the quadratic outlines to polygons at a
// fixed subdivision, hand them to CrossSection as contours. That is the whole
// bridge -- 30 lines -- and everything after it is ordinary Manifold.
//
// The bow is done without any warping. The plate is a slice of a cylindrical
// SHELL (r 3.75..4.0 clipped to a 2.6 chord), so front and back are both
// curved and the thickness is a true 0.25 everywhere. The engraving is the
// intersection of a straight text prism with a second shell 0.05 thick, which
// makes the letter floors exactly concentric with the face instead of
// approximately so -- an exact answer that a swept/warped cutter only
// approaches.
import {readFileSync} from 'node:fs';
import {CrossSection, Manifold} from 'manifold-3d/manifoldCAD';
import ot from 'opentype.js';
import {describe, save, stopwatch} from './_util.mjs';

const FONT = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf';
const TEXT = 'DICE';
const W = 2.6, H = 1.8, THICK = 0.25;
const BOW_R = 4.0;              // face radius, axis vertical
const BORDER_W = 0.18, BORDER_RAISE = 0.06;
const ENGRAVE = 0.05;
const TEXT_W = 1.72;            // fitted width of the word
const SEG = 192;                // segments in the full circle => ~20 on the arc
const CURVE_STEPS = 8;          // subdivisions per quadratic/cubic segment

// ------------------------------------------------------------- font -> 2D --
/**
 * Flatten an opentype path into closed polygons in a y-up frame.
 * opentype hands back y-down screen coordinates and quadratic (TrueType) or
 * cubic (CFF) segments; both are subdivided at a fixed step so the output is
 * bit-identical between runs.
 */
function glyphContours(path) {
  const contours = [];
  let cur = null, x = 0, y = 0;
  const push = (px, py) => cur.push([px, -py]);  // flip to y-up
  const qbez = (x0, y0, cx, cy, x1, y1) => {
    for (let i = 1; i <= CURVE_STEPS; i++) {
      const t = i / CURVE_STEPS, u = 1 - t;
      push(u * u * x0 + 2 * u * t * cx + t * t * x1,
           u * u * y0 + 2 * u * t * cy + t * t * y1);
    }
  };
  const cbez = (x0, y0, c1x, c1y, c2x, c2y, x1, y1) => {
    for (let i = 1; i <= CURVE_STEPS; i++) {
      const t = i / CURVE_STEPS, u = 1 - t;
      push(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
           u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1);
    }
  };
  for (const c of path.commands) {
    if (c.type === 'M') {
      if (cur && cur.length > 2) contours.push(cur);
      cur = [];
      push(c.x, c.y);
      x = c.x;
      y = c.y;
    } else if (c.type === 'L') {
      push(c.x, c.y);
      x = c.x;
      y = c.y;
    } else if (c.type === 'Q') {
      qbez(x, y, c.x1, c.y1, c.x, c.y);
      x = c.x;
      y = c.y;
    } else if (c.type === 'C') {
      cbez(x, y, c.x1, c.y1, c.x2, c.y2, c.x, c.y);
      x = c.x;
      y = c.y;
    } else if (c.type === 'Z') {
      if (cur && cur.length > 2) contours.push(cur);
      cur = null;
    }
  }
  if (cur && cur.length > 2) contours.push(cur);
  return contours;
}

/** "DICE" as a CrossSection, centred on the origin and TEXT_W wide. */
function textSection() {
  const font = ot.parse(readFileSync(FONT));
  const contours = glyphContours(font.getPath(TEXT, 0, 0, 100));
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of contours)
    for (const [px, py] of c) {
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
  const s = TEXT_W / (maxX - minX);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const placed = contours.map((c) => c.map(([px, py]) => [(px - cx) * s, (py - cy) * s]));
  // EvenOdd so counters (the bowl of the D) become holes whatever the winding.
  return CrossSection.ofPolygons(placed, 'EvenOdd');
}

// ---------------------------------------------------------------- plaque ---
/** A slice of cylindrical shell between two radii, clipped to the W chord. */
function shell(rInner, rOuter, height, clipW = W) {
  const ring = CrossSection.circle(rOuter, SEG).subtract(
      CrossSection.circle(rInner, SEG));
  // Clip in BOTH axes: a chord-width clip alone keeps the far side of the
  // ring as well, which exports as a second shell facing the wrong way.
  const clip = CrossSection.square([clipW, 1.2], true).translate(0, 0.4);
  return Manifold.extrude(ring.translate(0, BOW_R).intersect(clip), height);
}

function build() {
  const back = BOW_R - THICK;
  const plate = shell(back, BOW_R, H);
  // Raised frame: the outermost 0.06 of shell, with its middle punched out.
  const window = Manifold.cube([W - 2 * BORDER_W, 4 * BOW_R, H - 2 * BORDER_W], true)
                     .translate(0, BOW_R, H / 2);
  const frame = shell(BOW_R - 0.02, BOW_R + BORDER_RAISE, H).subtract(window);

  // Engraving: straight text prism INTERSECTED with a 0.05 shell under the
  // face, which is what makes the letter floors follow the bow exactly.
  const prism = Manifold.extrude(textSection(), 1.2)
                    .rotate(90, 0, 0)         // profile height -> +Z, depth -> -Y
                    .translate(0, 0.9, H / 2);  // reach across the whole bow
  const cutter = prism.intersect(shell(BOW_R - ENGRAVE, BOW_R + 0.01, H));

  const solid = Manifold.union(plate, frame).subtract(cutter);
  // Centre on the origin in plan, keep the base on the ground.
  const b = solid.boundingBox();
  const dx = -(b.min[0] + b.max[0]) / 2, dy = -(b.min[1] + b.max[1]) / 2;
  // The bow axis moves with the model; print it so the checker can measure
  // engraving depth against the real cylinder rather than a guessed one.
  console.log(`  bow axis after centring: authoring (${dx.toFixed(4)}, ` +
              `${(BOW_R + dy).toFixed(4)}), i.e. world z = ${(-(BOW_R + dy)).toFixed(4)}`);
  return solid
      .translate(dx, dy, 0)
      .asOriginal()
      .calculateNormals(3, 30);
}

const lap = stopwatch();
const plaque = build();
describe('B6 plaque', plaque);
await save(
    {
      manifold: plaque,
      name: 'plaque',
      material: {
        name: 'bronze',
        attributes: ['NORMAL'],
        baseColorFactor: [0.5, 0.42, 0.28],
        metallic: 0.8,
        roughness: 0.4,
      },
    },
    process.argv[2]);
console.log(`bake_seconds ${lap().toFixed(2)}`);
