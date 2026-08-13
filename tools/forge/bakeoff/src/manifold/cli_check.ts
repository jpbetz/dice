// Copyright 2026 The Dice Table Authors.
//
// Route (a) check: the same die geometry as B1, written for the first-party
// `manifold-cad` CLI instead of the Node library, so the two routes can be
// compared on reliability and turnaround.
//   npx manifold-cad cli_check.ts out.glb
// Differences from B1_die.mjs: no import of the export helpers (the CLI owns
// export), the model ends in `export default`, and TypeScript is accepted
// directly. The mm->m 1/1000 export scale applies here too.
import {GLTFNode, Manifold} from 'manifold-3d/manifoldCAD';

const EDGE = 2.0, FILLET = 0.10, PIP_R = 0.22, PIP_DEPTH = 0.08, O = 0.42;

const FACES: Record<string, [number, number, number]> = {
  1: [0, 0, 1], 2: [0, -1, 0], 3: [1, 0, 0],
  4: [-1, 0, 0], 5: [0, 1, 0], 6: [0, 0, -1],
};
const PATTERNS: Record<string, [number, number][]> = {
  1: [[0, 0]], 2: [[-O, -O], [O, O]], 3: [[-O, -O], [0, 0], [O, O]],
  4: [[-O, -O], [-O, O], [O, -O], [O, O]],
  5: [[-O, -O], [-O, O], [0, 0], [O, -O], [O, O]],
  6: [[-O, -O], [-O, 0], [-O, O], [O, -O], [O, 0], [O, O]],
};

function faceAxes(n: number[]) {
  const up = Math.abs(n[2]) > 0.5 ? [0, 1, 0] : [0, 0, 1];
  const u = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2],
             up[0] * n[1] - up[1] * n[0]];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2],
             n[0] * u[1] - n[1] * u[0]];
  return [u, v];
}

const paint = (m: Manifold, rgb: number[]) =>
    m.setProperties(3, (np) => {
      np[0] = rgb[0];
      np[1] = rgb[1];
      np[2] = rgb[2];
    });

const h = EDGE / 2 - FILLET;
const corners: Manifold[] = [];
for (const sx of [-1, 1])
  for (const sy of [-1, 1])
    for (const sz of [-1, 1])
      corners.push(Manifold.sphere(FILLET, 24).translate(sx * h, sy * h, sz * h));
const body = paint(Manifold.hull(corners), [0.86, 0.83, 0.74]);

const centre = EDGE / 2 + (PIP_R - PIP_DEPTH);
const pipUnit = paint(Manifold.sphere(PIP_R, 32), [0.16, 0.13, 0.15]);
const pips: Manifold[] = [];
for (const [value, n] of Object.entries(FACES)) {
  const [u, v] = faceAxes(n);
  for (const [a, b] of PATTERNS[value]) {
    pips.push(pipUnit.translate(n[0] * centre + u[0] * a + v[0] * b,
                                n[1] * centre + u[1] * a + v[1] * b,
                                n[2] * centre + u[2] * a + v[2] * b));
  }
}

const node = new GLTFNode();
node.name = 'die';
node.manifold = body.subtract(Manifold.union(pips))
                    .translate(0, 0, EDGE / 2)
                    .asOriginal()
                    .calculateNormals(3, 40)
                    .scale(1000);
node.material = {
  attributes: ['COLOR_0', 'NORMAL'],
  baseColorFactor: [1, 1, 1],
  metallic: 0,
  roughness: 0.4,
};

export default node;
