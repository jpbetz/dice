/*
Copyright 2026 The Dice Table Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// THE DESCRIPTOR BRIDGE — a baked GLB, wearing the SHELL half of
// js/towerhollow.js's seam.
//
// js/towerhollow.js:592 states the contract: a shell builder owns every
// occluding surface of the trunk and hands back a SURFACE DESCRIPTOR that the
// dressing addresses by (θ, y) instead of by box corners, precisely so the
// shell can be replaced without touching a line of the dress. Two shells have
// honoured it so far and both COMPUTED the descriptor, because both knew their
// own radius field in closed form. This one does not: its surface arrives as
// triangles out of Blender, and the only honest way to answer "where is the
// bark at (θ, y)" about a mesh is to ASK THE MESH.
//
// So: clone the loaded model in, then RAYCAST it to synthesize the descriptor.
// A few hundred rays per socket, which is nothing next to the eight physics
// bodies the same operation rebuilds.
//
// WHY THE RAYS COME FROM OUTSIDE AND POINT IN. The obvious direction is from
// the trunk axis outward, and it is wrong twice over. The shell's front faces
// point AWAY from the axis, so an outward ray hits their back sides and a
// FrontSide material culls it — the shell would read as absent. And the
// interior is not empty: a liner, and beyond the mouth nothing at all, so
// "first hit going out" is sometimes the liner and sometimes the far wall.
// Casting inward from well outside the hull takes the OUTER surface first
// under the model's own materials, with no material mutation and no
// depth-ordering argument. (Temporarily flipping every material to DoubleSide
// would have worked too, and would have mutated objects the template SHARES
// with every future clone.)
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO: enrol anything in `parts`. That
// array feeds bakeVertexAO, which REPLACES the color attribute it finds
// (js/towerskin.js) — and a baked model's colours are the whole paint story,
// authored in the recipe, seeded and final. The stump shell already
// established the idiom for this (add(), then splice straight back out) and
// five of its six mesh kinds use it; this one uses it for all of them.

import * as THREE from 'three';
import { towerGlbAsset } from './towerglb.js';

// θ CONVENTION — READ THIS BEFORE CHANGING AN ANGLE ANYWHERE.
//
// This shell publishes buildStumpShell's convention, NOT buildLobedShell's:
//
//     x = r·cos θ,  z = zc + r·sin θ,  so θ = 0 is +x and the FRONT is +π/2
//
// The two shipped shells disagree about this — the interim lobed one uses
// x = r·sin θ with θ = 0 at the front — and js/towerhollow.js's dressing was
// written against the LOBED one: GAP_TH = -0.78 is commented "front-left of
// centre", the SHELVES are commented "clustered on the LEFT flank", and
// `rot: [0.34, th, roll]` maps a prop's +z onto the outward normal only under
// that convention. Under the convention below, the gap lands back-right and
// the shelves land at the back.
//
// THAT IS THE SHIPPED BEHAVIOUR, and it is deliberately preserved here: the
// W3 dress is Joe-approved work photographed through buildStumpShell, and this
// change replaces the SHELL, not the dress. Swapping the convention at the
// same moment as the mesh would move every prop and leave the frame's two
// changes unattributable. Recorded as debt, with the measurement, for a
// separate decision.
const FRONT = Math.PI / 2;

// The height the nominal radius R0 is sampled at. buildStumpShell used
// base(4.0) — a mid-trunk radius, not a crown one — and R0 feeds two consumers
// that want different things (the moot's GAP_ARC wants a radius at moot
// height; the contact shadow wants a ground footprint). Mid-trunk is the
// compromise the shipped tower already made, so the two consumers keep the
// values they were tuned against.
const R0_Y = 4.0;

// Rays start this far outside the socket and travel inward.
const CAST_PAD = 4.0;

export function glbShellFor(url) {
  return function glbShell(ctx) {
    const { v, add, parts } = ctx;
    const asset = towerGlbAsset(url);
    if (!asset || asset.status !== 'ready' || !asset.template) {
      // Same refusal as towerGlbSkin's, for the same reason: every caller is
      // gated on towerModelReady(), so arriving here un-ready is a GATE bug,
      // and a gate bug that quietly built an empty trunk would ship as "the
      // fae venue is sometimes a floating mushroom ring".
      throw new Error(`glbShellFor('${url}'): asset is '${asset ? asset.status : 'idle'}', `
        + `not 'ready' — the caller was supposed to be gated on towerModelReady()`);
    }
    const S = v.S, z0 = v.z0;
    const spec = asset.portals;

    // ---- the mesh, seated ---------------------------------------------------
    // THE ONE OFFSET A BAKED MODEL OWES (js/towerglb.js, and the trap list):
    // the forge authors at z = 0 on the back-wall socket plane, and z0 is where
    // that plane actually is. Everything else about this model is already in
    // the app's frame — y up, +z toward the player, world units.
    const seat = new THREE.Group();
    seat.name = 'towerSkinBoleModel';
    const clone = asset.template.clone(true);
    for (const child of [...clone.children]) seat.add(child);
    seat.position.z = z0;
    add(seat);
    // OUT of the AO/weather pass, immediately — see the header. The parenting
    // and the shadow flags that add() also set are exactly what we want to keep.
    parts.splice(parts.indexOf(seat), 1);

    // RAYCASTS READ matrixWorld AND NOTHING HAS RENDERED YET. This is the
    // proof-tool law (js/main.js towerOcclusionCheck learned it the expensive
    // way: it graded bands against the matrices a previous bake left behind).
    // Walk to the root so the seat's whole ancestry is current, not just the
    // seat's own matrix.
    let root = seat;
    while (root.parent) root = root.parent;
    root.updateMatrixWorld(true);

    // WHAT THE RAYS ARE ALLOWED TO HIT: the trunk itself, and not its baked
    // dress. towerSkinBoleShelves is shelf fungus growing ON the bark and
    // towerSkinBoleTongue is the delivery ramp — a prop anchored to either
    // would sit on top of a mushroom or out on the ramp, which is not what
    // "where is the surface at (θ, y)" means. Fall back to every mesh if the
    // model ever ships without the shell under that name, because a descriptor
    // with no surface at all is worse than one anchored to a shelf.
    const all = [];
    seat.traverse((o) => { if (o.isMesh) all.push(o); });
    const surfaces = all.filter((m) => /Shell/i.test(m.name || ''));
    const targets = surfaces.length ? surfaces : all;

    const ray = new THREE.Raycaster();
    ray.far = CAST_PAD * 2 + 20;
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();

    // The trunk axis, in world. The mouth is declared on the axis by
    // construction (portalIn is the centre of the bore), so the model's own
    // spec says where its centreline is and nothing here has to guess.
    const zc = z0 + spec.in.z;
    const rStart = (v.socket.s[0] / 2) + CAST_PAD;

    // radiusAt(θ, y): distance from the axis to the OUTER surface, or null if
    // the ray passes through open air (the wound, or above the crown).
    const memo = new Map();
    const radiusRaw = (th, y) => {
      const key = `${th.toFixed(4)}|${y.toFixed(4)}`;
      if (memo.has(key)) return memo.get(key);
      const cx = Math.cos(th), cz = Math.sin(th);
      origin.set(cx * rStart, y, zc + cz * rStart);
      dir.set(-cx, 0, -cz);
      ray.set(origin, dir);
      const hits = ray.intersectObjects(targets, true);
      const r = hits.length ? rStart - hits[0].distance : null;
      memo.set(key, r);
      return r;
    };

    // The same, but never null: where the trunk is genuinely open, sweep
    // sideways for the nearest angle that does have bark and borrow its
    // radius. A prop asked for a point in the mouth gets the mouth's own rim
    // rather than a NaN or a point at the axis.
    const radiusAt = (th, y) => {
      const r = radiusRaw(th, y);
      if (r !== null && r > 0.05) return r;
      for (let step = 1; step <= 24; step++) {
        const d = step * 0.09;
        for (const cand of [radiusRaw(th + d, y), radiusRaw(th - d, y)]) {
          if (cand !== null && cand > 0.05) return cand;
        }
      }
      // Nothing anywhere on this ring — above the crown. The nominal radius is
      // a better answer than zero, which would stack props on the centreline.
      return R0;
    };

    // ---- the nominal radius, and the model's front reach --------------------
    let R0 = 2.4;   // seeded so radiusAt's last resort is defined during the sweep
    {
      let sum = 0, n = 0;
      for (let i = 0; i < 48; i++) {
        const r = radiusRaw((i / 48) * Math.PI * 2, R0_Y);
        if (r !== null && r > 0.05) { sum += r; n++; }
      }
      if (n) R0 = sum / n;
    }

    // zFO is published as group.userData.socketMaxZ and drives the stain's
    // "shade this like a cylinder" plane, so it wants the model's ACTUAL front
    // reach rather than a constant copied from the shell it replaced —
    // measured off the hull, then held inside the socket's own front limit.
    const hull = new THREE.Box3().setFromObject(seat);
    const zFrontLim = v.socket.c[2] + v.socket.s[2] / 2;
    const zFO = Math.min(hull.max.z, zFrontLim);

    // ---- the clamped prop anchor (buildStumpShell's surfPoint) --------------
    // TWO POINTS, ONE SURFACE, and js/towerbole.js:207 names the bug class:
    // the mesh's own vertices must genuinely reach the front to occlude the
    // probe's samples, while a PROP ANCHOR is pulled back so the prop's body
    // (caps run to ~0.4) never crosses the socket. This shell only ever
    // publishes the anchor — the mesh is the GLB's business, and it was gated
    // by check.py --tower before the file was allowed to exist.
    const xm = (v.socket.s[0] / 2) - 0.55;
    const at = (th, y, inset = 0) => {
      const r = Math.max(0.05, radiusAt(th, y) - inset);
      const p = [Math.cos(th) * r, y, zc + Math.sin(th) * r];
      p[2] = Math.min(p[2], z0 - 0.18);
      if (Math.abs(p[0]) > xm) p[0] = Math.sign(p[0]) * xm;
      return p;
    };

    // ---- the little lit door ------------------------------------------------
    // The registry row's `ember` sits at [-2.79, 1.22, z0 + 0.55] and is NOT
    // being moved (it is Joe-dialled), so the pad it lights has to be where it
    // has always been: the left root buttress, just behind that light. Asked of
    // the model rather than asserted — cast straight back along -z at the
    // ember's own x and y and take the buttress's front face.
    const DOOR_X = -2.79, DOOR_Y = 1.20, DOOR_Z_FALLBACK = z0 + 0.22;
    let doorZ = DOOR_Z_FALLBACK;
    {
      ray.set(new THREE.Vector3(DOOR_X, DOOR_Y, z0 + CAST_PAD), new THREE.Vector3(0, 0, -1));
      const hits = ray.intersectObjects(targets, true);
      // Only believe a hit that leaves the door frame inside the socket: the
      // frame is built 0.028 proud of the pad and the socket's front limit is
      // z0 + 0.25. A buttress that bulges further forward than that gets the
      // fallback, which is the value the shipped tower used.
      if (hits.length && hits[0].point.z <= zFrontLim - 0.05) doorZ = hits[0].point.z;
    }

    // ---- the descriptor -----------------------------------------------------
    // Only the subset js/towerhollow.js actually consumes (verified against
    // every SURF reference in that file): rOut and facade.zFace are read ONLY
    // inside the `inFacade` branch, which is false here for the same reason it
    // is false on the stump — the front of this trunk is a wound, not a flat
    // facade, so every prop lands on the curve. clipX, yCrown and facade.zBack
    // are read by nothing and are not invented here.
    return {
      S, z0,
      zc,
      // The clear bore the dressing's lining tube sits just inside of. Engine-
      // derived (and therefore portal-derived, since towerVolumes computes
      // shaft.r from spec.in.clearR), exactly as the stump shell had it.
      rIn: v.shaft.r + 0.28,
      R0,
      rOut: (th) => radiusAt(th, R0_Y),
      // THE CLOSED RING NOW FOLLOWS THE MODEL'S CROWN, and this used to be a
      // flat 11.4 "bar the occlusion proof sets". That bar is gone: the cowl
      // band no longer samples over the rim (js/main.js v.cowlY), so nothing
      // above the tear has anything to stay opaque FOR — and 11.4 stood 2.0
      // units above this model's 9.40 tear, which is precisely the black slab
      // Joe called out on the round-7 and round-8 frames. Hiding
      // `towerSkinLining` was what named it, and towerOcclusionCheck reports
      // 99/99 on both bands at all six eyes with the whole thing muted.
      //
      // Buried under the tear it still backs the doorway, which is the job it
      // actually does for a player.
      yRing: v.rimY,
      // ...AND NO TUBE. It sat at rIn - 0.02 = 2.46, which on a baked trunk is
      // the OUTER wall (inner 2.17, outer 2.46) — so it z-fought the bark
      // below the tear and stood proud of it above. There is no radius that
      // works: between the approach column (2.09) and the bake's own liner
      // (2.17) there is 0.08, which is the same squeeze that drove the recipe's
      // curtain into the wall. The bake paints its interior near-black already
      // (make_curtain_paint / the liner gradient), so the tube is redundant as
      // well as impossible. A code skin over a code shell still gets one.
      liningTube: false,
      zFO, zFI: z0 - 1.2,
      sill: v.hood.c[1] - v.hood.s[1] / 2,
      // THE MOUTH, not the collider gap. 2.05 clears the measured flight
      // envelope (~1.9); cutting the veil to the engine's 5.0-wide doorway
      // papered the whole mouth black once already.
      doorX: 2.05,
      doorY: v.door.h,
      xLim: v.socket.s[0] / 2,
      at,
      inFacade: () => false,
      facade: {
        aL: -2.05, aR: 2.05,
        yLow: 0.05, yTop: v.door.h + 0.35,
        zFace: zFO,
      },
      doorPad: { x: DOOR_X, y: DOOR_Y, z: doorZ },
      // Forensics for the look pass and the proofs — what the rays actually
      // found, so a frame that looks wrong can be checked against a number
      // instead of argued about.
      glb: { url, tris: countTris(all), meshes: all.length, R0, zFO, doorZ, zc, front: FRONT },
    };
  };
}

function countTris(meshes) {
  let n = 0;
  for (const m of meshes) {
    const g = m.geometry;
    if (!g) continue;
    n += (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3;
  }
  return Math.round(n);
}
