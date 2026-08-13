// Copyright 2026 The Dice Table Authors.
//
// B1 chamfered-die. Cube edge 2.0, TRUE rounded fillets of radius 0.10,
// 21 spherical pip dents (sphere r 0.22 sunk 0.08), standard right-handed
// d6 layout.
//
// Body route: convex hull of eight corner spheres. Manifold has no fillet
// operator, but hull(8 spheres) is the exact rounded box -- the fillets are
// real quarter-spheres and cylinders, not an SDF approximation, and the six
// flat faces stay flat (two triangles each before the pips cut them). That
// beats levelSet here on both accuracy and triangle count; see B1_die_sdf.mjs
// for the levelSet version of the same body and the numbers it costs.
//
// Colour: the pip cutter spheres are painted dark BEFORE the boolean, and
// Manifold carries vertex properties through the subtraction, so the dent
// walls come out dark without anyone selecting a face afterwards.
import {Manifold} from 'manifold-3d/manifoldCAD';
import {describe, save, stopwatch} from './_util.mjs';

const EDGE = 2.0;          // cube edge
const FILLET = 0.10;       // edge treatment radius (true fillet)
const PIP_R = 0.22;        // pip cutter sphere radius
const PIP_DEPTH = 0.08;    // how deep the dent sinks below the face
const PIP_OFF = 0.42;      // pip offset from face centre
const BODY_RGB = [0.86, 0.83, 0.74];
const PIP_RGB = [0.16, 0.13, 0.15];

// Authoring is Z-up; world (glTF) is Y-up with front at +Z, so authoring -Y
// is the front face. Right-handed d6: 1 up, 2 front, 3 right.
const FACES = {
  1: [0, 0, 1],
  2: [0, -1, 0],
  3: [1, 0, 0],
  4: [-1, 0, 0],
  5: [0, 1, 0],
  6: [0, 0, -1],
};

const o = PIP_OFF;
const PATTERNS = {
  1: [[0, 0]],
  2: [[-o, -o], [o, o]],
  3: [[-o, -o], [0, 0], [o, o]],
  4: [[-o, -o], [-o, o], [o, -o], [o, o]],
  5: [[-o, -o], [-o, o], [0, 0], [o, -o], [o, o]],
  6: [[-o, -o], [-o, 0], [-o, o], [o, -o], [o, 0], [o, o]],
};

/** Two in-plane axes for a face normal, chosen deterministically. */
function faceAxes(n) {
  const up = Math.abs(n[2]) > 0.5 ? [0, 1, 0] : [0, 0, 1];
  const u = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2],
             up[0] * n[1] - up[1] * n[0]];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2],
             n[0] * u[1] - n[1] * u[0]];
  return [u, v];
}

/** Paint every vertex of a part with one flat colour in channels 0..2. */
const paint = (m, rgb) => m.setProperties(3, (np) => {
  np[0] = rgb[0];
  np[1] = rgb[1];
  np[2] = rgb[2];
});

function build() {
  // --- body: hull of the eight corner spheres -> exact r=FILLET rounding
  const h = EDGE / 2 - FILLET;
  const corners = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        corners.push(Manifold.sphere(FILLET, 24).translate(sx * h, sy * h,
                                                           sz * h));
  const body = paint(Manifold.hull(corners), BODY_RGB);

  // --- pips: one sphere per pip, sunk PIP_DEPTH into its face
  const centre = EDGE / 2 + (PIP_R - PIP_DEPTH);
  const pipUnit = paint(Manifold.sphere(PIP_R, 32), PIP_RGB);
  const pips = [];
  for (const [value, n] of Object.entries(FACES)) {
    const [u, v] = faceAxes(n);
    for (const [a, b] of PATTERNS[value]) {
      pips.push(pipUnit.translate(
          n[0] * centre + u[0] * a + v[0] * b,
          n[1] * centre + u[1] * a + v[1] * b,
          n[2] * centre + u[2] * a + v[2] * b));
    }
  }
  const cutter = Manifold.union(pips);

  // asOriginal() collapses the body and pip runs into one original id, so the
  // exporter writes ONE glTF primitive instead of one per run. Two runs would
  // export as two open half-meshes; one run keeps the file watertight while
  // the colour still varies per vertex. (Dropping asOriginal and calling
  // setMaterial(body, ...) / setMaterial(cutter, ...) instead gives two
  // materials that survive the boolean automatically -- also verified, at the
  // cost of that primitive split.)
  //
  // Sharp-angle normals: flats and pip rims stay crisp, fillets stay smooth.
  return body.subtract(cutter)
      .translate(0, 0, EDGE / 2)  // stand on the ground plane
      .asOriginal()
      .calculateNormals(3, 40);
}

const lap = stopwatch();
const die = build();
describe('B1 die', die);
await save(
    {
      manifold: die,
      name: 'die',
      material: {
        name: 'die',
        attributes: ['COLOR_0', 'NORMAL'],
        baseColorFactor: [1, 1, 1],
        metallic: 0,
        roughness: 0.4,
      },
    },
    process.argv[2]);
console.log(`bake_seconds ${lap().toFixed(2)}`);
