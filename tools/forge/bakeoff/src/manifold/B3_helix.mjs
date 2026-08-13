// Copyright 2026 The Dice Table Authors.
//
// B3 helix-ramp. Central column r 0.5 x h 8.0 with an open U-channel chute
// spiralling down around it: helix radius 1.55 to the floor centre, pitch 2.6
// per turn, 2.25 turns, descending from near the top.
//
// Manifold has no sweep operator. The route that works is the one the library
// is built for: extrude the channel DEAD STRAIGHT with nDivisions slices along
// its length, then warp() every vertex onto the helix. The straight bar's
// length parameter becomes arc length; x becomes radial offset; y stays
// vertical. Because warp only moves existing vertices, the slice count is the
// only thing controlling how smooth the spiral is -- SLICES_PER_TURN below is
// the density dial, and it is exact and predictable.
//
// The spec's own numbers leave a 0.45 gap between the column surface (r 0.5)
// and the chute's inner wall (r 0.95), which would export as two disconnected
// shells. A 0.12-thick tongue on the profile bridges that gap so the result is
// ONE connected watertight solid; the visible channel still matches spec.
import {CrossSection, Manifold} from 'manifold-3d/manifoldCAD';
import {describe, save, stopwatch} from './_util.mjs';

const COL_R = 0.5, COL_H = 8.0;
const HELIX_R = 1.55;      // to floor centre
const PITCH = 2.6;         // rise per turn
const TURNS = 2.25;
const TOP_Z = 7.6;         // "descending from near the top"
const FLOOR_W = 1.2;       // channel outer width
const WALL_H = 0.35;       // channel outer height
const THICK = 0.12;        // material thickness
const SLICES_PER_TURN = 128;

const SLICES = Math.round(TURNS * SLICES_PER_TURN);
const ARC = TURNS * 2 * Math.PI * HELIX_R;  // straight-bar length before warp
const DROP = TURNS * PITCH;

/** U-channel cross-section, plus the tongue that reaches the column. */
function profile() {
  const outer = CrossSection.square([FLOOR_W, WALL_H], false)
                    .translate(-FLOOR_W / 2, 0);
  const notch = CrossSection.square([FLOOR_W - 2 * THICK, WALL_H - THICK], false)
                    .translate(-FLOOR_W / 2 + THICK, THICK);
  const tongue = CrossSection.square([HELIX_R - COL_R - FLOOR_W / 2 + 0.15, THICK],
                                     false)
                     .translate(-(HELIX_R - COL_R) - 0.05, 0);
  return outer.subtract(notch).add(tongue);
}

function chute() {
  const bar = Manifold.extrude(profile(), ARC, SLICES);
  // In-place warp: read the straight coordinates first, then overwrite.
  return bar.warp((v) => {
    const radial = v[0], height = v[1], t = v[2] / ARC;
    const theta = t * TURNS * 2 * Math.PI;
    const r = HELIX_R + radial;
    v[0] = r * Math.cos(theta);
    v[1] = r * Math.sin(theta);
    v[2] = TOP_Z - t * DROP + height;
  });
}

function build() {
  const column = Manifold.cylinder(COL_H, COL_R, COL_R, 64);
  return Manifold.union(column, chute()).asOriginal().calculateNormals(3, 40);
}

const lap = stopwatch();
const helix = build();
describe('B3 helix', helix);
await save(
    {
      manifold: helix,
      name: 'helix-ramp',
      material: {
        name: 'ramp',
        attributes: ['NORMAL'],
        baseColorFactor: [0.55, 0.42, 0.3],
        metallic: 0,
        roughness: 0.7,
      },
    },
    process.argv[2]);
console.log(`bake_seconds ${lap().toFixed(2)}`);
