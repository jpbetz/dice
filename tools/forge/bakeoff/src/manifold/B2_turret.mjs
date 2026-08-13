// Copyright 2026 The Dice Table Authors.
//
// B2 turret. Hollow stone tower: outer r 1.6, wall 0.35, total height 10.0
// including the merlons, flaring to r 2.1 over the bottom 1.2. Eight merlons
// in a radial array, three non-piercing arrow-slit recesses, one arched
// doorway tunnelled through the wall.
//
// Everything here is plain CSG plus host-language loops -- Manifold's home
// ground. The only judgement calls are (a) the slit cutters run from r 1.48
// outward so the recess bottoms out 0.12 into a 0.35 wall and cannot break
// through, and (b) calculateNormals(3, 30) at the end, which is what keeps the
// 64-segment shaft reading as a smooth cylinder while every merlon corner and
// slit rim stays a hard edge.
import {CrossSection, Manifold} from 'manifold-3d/manifoldCAD';
import {describe, save, stopwatch} from './_util.mjs';

const R_OUT = 1.6;         // outer radius of the shaft
const WALL = 0.35;         // wall thickness
const R_IN = R_OUT - WALL; // 1.25
const TOTAL_H = 10.0;      // total height including merlons
const MERLON_H = 0.7;
const SHAFT_H = TOTAL_H - MERLON_H;
const FLARE_R = 2.1, FLARE_H = 1.2;
const SEG = 64;            // shaft segments: 0.157 chord at r 1.6

const DOOR_W = 1.1, DOOR_H = 2.2;
const SLIT_W = 0.15, SLIT_H = 0.9, SLIT_DEPTH = 0.12;
// height, bearing in degrees. Authoring -Y is the world front (+Z), so the
// doorway sits at -90 and the slits are spread away from it.
const SLITS = [[3.1, -20], [5.3, 120], [7.4, -160]];
const MERLON_COUNT = 8;
const MERLON_W = 0.55, MERLON_D = 0.35;

function shell() {
  // Shaft plus the flared skirt, then one cut for the full-height cavity.
  const shaft = Manifold.cylinder(SHAFT_H, R_OUT, R_OUT, SEG);
  const flare = Manifold.cylinder(FLARE_H, FLARE_R, R_OUT, SEG);
  // A thin band where the flare meets the shaft reads as a moulding course.
  const band = Manifold.cylinder(0.14, R_OUT + 0.09, R_OUT + 0.09, SEG)
                   .translate(0, 0, FLARE_H - 0.07);
  // The cavity runs out through the bottom: the tower is a tube, which keeps
  // the solid watertight and lets the doorway show a real interior return.
  const cavity = Manifold.cylinder(SHAFT_H + 2, R_IN, R_IN, SEG)
                     .translate(0, 0, -1);
  return Manifold.union([shaft, flare, band]).subtract(cavity);
}

function merlons() {
  const rMid = R_OUT - MERLON_D / 2;
  const out = [];
  for (let i = 0; i < MERLON_COUNT; i++) {
    const bearing = 22.5 + i * (360 / MERLON_COUNT);  // gap faces front
    out.push(Manifold.cube([MERLON_D, MERLON_W, MERLON_H], true)
                 .translate(rMid, 0, SHAFT_H + MERLON_H / 2)
                 .rotate(0, 0, bearing));
  }
  return Manifold.union(out);
}

/** Blade cutters that bottom out SLIT_DEPTH into the wall. */
function slitCutters() {
  const cutters = [];
  for (const [z, bearing] of SLITS) {
    const inner = R_OUT - SLIT_DEPTH;         // 1.48, still 0.23 of wall left
    const depth = FLARE_R - inner + 0.2;      // reach past the outer surface
    cutters.push(Manifold.cube([depth, SLIT_W, SLIT_H], true)
                     .translate(inner + depth / 2, 0, z)
                     .rotate(0, 0, bearing));
  }
  return Manifold.union(cutters);
}

/** Arched doorway, extruded along its tunnel axis and aimed at world front. */
function doorCutter() {
  const rect = CrossSection.square([DOOR_W, DOOR_H - DOOR_W / 2], false)
                   .translate(-DOOR_W / 2, 0);
  const arch = CrossSection.circle(DOOR_W / 2, 48).translate(0, DOOR_H - DOOR_W / 2);
  const profile = rect.add(arch);
  // Profile lives in XY and extrudes along +Z; rotating +90 about X sends the
  // profile height to +Z and the extrusion depth to -Y, which is world front.
  //
  // Do NOT spell the optional args out as (profile, tunnel, 0, 0, 1, false).
  // manifold-3d 3.5.1 declares scaleTop as `Vec2 | number`, but the binding
  // reads a scalar s as [s, 0], so `1` tapers the far end of the tunnel to a
  // knife edge and the doorway silently stops short of the outer wall. It
  // throws nothing; the volume just comes out exactly half. Pass [1, 1] or
  // leave the tail of the signature alone.
  const tunnel = FLARE_R + 0.4;
  return Manifold.extrude(profile, tunnel).rotate(90, 0, 0);
}

function build() {
  return Manifold.union(shell(), merlons())
      .subtract(slitCutters())
      .subtract(doorCutter())
      .asOriginal()
      .calculateNormals(3, 30);
}

const lap = stopwatch();
const turret = build();
describe('B2 turret', turret);
await save(
    {
      manifold: turret,
      name: 'turret',
      material: {
        name: 'stone',
        attributes: ['NORMAL'],
        baseColorFactor: [0.62, 0.6, 0.56],
        metallic: 0,
        roughness: 0.85,
      },
    },
    process.argv[2]);
console.log(`bake_seconds ${lap().toFixed(2)}`);
