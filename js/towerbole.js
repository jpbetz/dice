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

// THE HOLLOW BOLE — the fae venue's tower (ROADMAP W3): a broken hollow
// stump, built to Joe's reference photo. The FOURTH tower, and the first
// that is not boxes: the trunk is a parametric displaced shell over a
// (θ, y) grid whose radius field carries the whole organism — silhouette
// curve, five uneven buttress lobes, fiber striation, a brow bulge — and
// whose index buffer carries the TORN PORT: the doorway is a real hole
// with a ragged fringe, cut by dropping quads, never by narrowing the
// engine's aperture.
//
// HOW THE DICE GET IN AND OUT (the two problems Joe named):
//   IN — the crown is a bowl between splinter spires. The FRONT of the
//   rim rises as one broad torn bark blade spanning the mouth and the
//   cowl band (y 6.2S…8.6S): dice pour visibly into the bowl and vanish
//   in the blade's shadow (despawn y 5.6S). The blade is the contract's
//   cowl wearing the reference photo's torn-plate crown.
//   OUT — the wound's lower band is an open mouth aligned with the
//   engine DOORWAY, fringed OUTSIDE the clear aperture. A BROW bulge
//   overhangs it (the ragged upper wound), killing the shipped cameras'
//   sightline down into the interior, and a near-black LINER shell sits
//   inside (outside the engine shaft, port-hole aligned) so the hole
//   reads as hollow depth. The exit spawn (z0 − 1.2S, inside) is behind
//   brow + liner shadow; emergence reads as flight out of the dark.
//
// Contract (docs/TOWER.md): zero colliders; MOUTH ≥ Ø3.4S kept clear by
// construction (bowl inner radius floor); DOORWAY never narrowed (hole
// mask ≥ aperture + margin); SOCKET respected via radius ceilings taken
// from v, not constants. Occlusion is proved by the existing probes, not
// claimed here.

import * as THREE from 'three';
import {
  mulberry32, fbm, turb, clamp01, smoothstep, ramp3,
  mapsFromCanvases, planarUV, bakeVertexAO, veilTexture,
} from './towerskin.js';
import { FAE_PALETTES } from './fae-lab.js';
import { registerSway } from './towerdress.js';

// ---------------------------------------------------------------------------
// THE RADIUS FIELD
// ---------------------------------------------------------------------------

function angDist(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
const gauss = (d, w) => Math.exp(-(d * d) / (2 * w * w));

// One object holds every number the form needs, derived from v once, so
// the fit harness argues with THIS and not with scattered literals.
function boleDims(v) {
  const S = v.S;
  const axisZ = v.shaft.c[2];                      // the trunk stands on the shaft
  const sockX = v.socket.s[0] / 2 - 0.12;          // radius ceiling, x
  const sockBack = axisZ - (v.socket.c[2] - v.socket.s[2] / 2) - 0.12;
  const sockFront = (v.socket.c[2] + v.socket.s[2] / 2) - axisZ - 0.10;
  return {
    S, axisZ,
    ellipse: { x: 1.0, zb: sockBack / sockX, zf: sockFront / sockX },
    rCeil: sockX,
    rFloor: v.shaft.r + 0.28,                      // shell never pinches the shaft
    linerR: v.shaft.r + 0.13,                      // the dark inside, shaft-hugging
    rimY: 7.0 * S,                                 // mouth rim top (contract ±0.5)
    bladeTop: 8.6 * S + 0.6,                       // cowl band top 8.6S + real margin
    spireMax: 10 * S - 0.15,                       // socket height ceiling
    port: {                                        // DOORWAY + fringe margin
      hw: 1.5 * S + 0.42,                          // clear 1.875 + torn margin
      y0: 0.45, y1: 3.4 * S + 0.55,                // sill…lintel + margin
    },
    browY: [3.4 * S + 0.3, 5.4 * S],               // the overhang band
    despawnY: v.despawnY,
  };
}

// The port mask in WORLD coordinates on the front face — ragged via fbm,
// 1 fully inside the hole, 0 outside. The engine aperture (|x| ≤ 1.875S,
// y ≤ 3.4S over the sill) must sit strictly inside mask === 1 territory:
// the rag eats OUTWARD only, from a boundary already a margin beyond it.
function portMask(d, wx, y, seed) {
  const rag = 0.34 * fbm(wx * 0.9 + 7, y * 0.8, 8, 4, seed);
  const inX = Math.abs(wx) < d.port.hw + rag;
  const inY = y > d.port.y0 && y < d.port.y1 + rag * 1.4;
  return inX && inY ? 1 : 0;
}

export function buildBoleShell(v, pal, seed = 0xb01e) {
  const d = boleDims(v);
  const rnd = mulberry32(seed);
  const nTh = 128, nY = 72;

  const lobes = [];
  for (let i = 0; i < 5; i++) {
    lobes.push({
      th: (i / 5) * Math.PI * 2 + (rnd() - 0.5) * 0.7 + 0.45,
      amp: 0.5 + rnd() * 0.6,
      w: 0.3 + rnd() * 0.22,
    });
  }
  // The crown: the broad FRONT BLADE (cowl duty) plus three thin spires,
  // tallest at back-left — never symmetric, never centred.
  const FRONT = Math.PI / 2;
  const spires = [
    // The front BLADE is broad on purpose — the cowl band must be opaque
    // from every shipped eye, and the occlusion probe failed a narrow
    // blade at 67/99. The reference photo agrees: its front face is one
    // big torn wall. Raggedness comes from the rim noise, kept small
    // inside the blade arc so no dip re-opens the leak.
    { th: FRONT, amp: d.bladeTop - d.rimY, w: 1.55, blade: true },
    { th: FRONT + Math.PI * 0.78, amp: d.spireMax - d.rimY, w: 0.24 },
    { th: FRONT - Math.PI * 0.72, amp: 1.9, w: 0.2 },
    { th: FRONT + Math.PI * 1.28, amp: 1.1, w: 0.18 },
  ];
  const profile = (y) => {
    const base = (d.rFloor + 0.55) + 1.35 * Math.exp(-y / (1.15 * d.S));
    return base + 0.1 * Math.sin(y * 0.75 + 2.1);
  };
  const flare = (y) => Math.pow(Math.max(0, 1 - y / (2.1 * d.S)), 1.6);
  const yTop = (th) => {
    // Rim raggedness shrinks inside the blade arc: a torn edge that never
    // dips into the cowl band it exists to cover.
    const inBlade = gauss(angDist(th, FRONT), 1.3);
    let t = d.rimY - 0.45 * (1 - inBlade * 0.6)
      + 0.5 * (1 - inBlade * 0.65) * fbm(th * 1.9, 3.7, 8, 3, seed + 5);
    for (const s of spires) t += s.amp * gauss(angDist(th, s.th), s.w);
    // The blade arc carries a HARD floor at the cowl top: a gaussian can
    // be tall on average and still leak one ray at the arc's edge (the
    // probe found exactly one sample under it at every eye). The floor is
    // the contract; the torn edge tears UPWARD from it.
    if (angDist(th, FRONT) < 1.18) {
      t = Math.max(t, 8.6 * d.S + 0.15
        + 0.6 * Math.abs(fbm(th * 3.1, 1.3, 8, 3, seed + 6)));
    }
    return Math.min(t, d.spireMax);
  };

  const pos = [], col = [], uv = [], idx = [];
  const mask = [];                                  // per-vertex port mask
  const wood = { r: 0.78, g: 0.72, b: 0.62 };       // multiplies the bark atlas
  const dark = { r: 0.10, g: 0.09, b: 0.08 };
  const moss = new THREE.Color(pal.glowCore).multiplyScalar(0.5);
  const lich = { r: 0.86, g: 0.95, b: 0.88 };       // pale lichen wash

  for (let j = 0; j <= nY; j++) {
    for (let i = 0; i <= nTh; i++) {
      const th = (i / nTh) * Math.PI * 2 - Math.PI / 2; // seam at the BACK
      const t = yTop(th);
      const y = (j / nY) * t;
      let r = profile(y);
      for (const L of lobes) r += L.amp * gauss(angDist(th, L.th), L.w) * flare(y);
      r += 0.075 * fbm(th * 4.2, y * 0.32, 8, 4, seed + 2)
         + 0.05 * Math.sin(th * 26 + fbm(th, y, 4, 2, seed + 3) * 5) * 0.55;
      // The BROW: the wound's upper lip bulges outward over the mouth.
      const browK = smoothstep(d.browY[0], d.browY[0] + 0.7, y)
        * (1 - smoothstep(d.browY[1] - 0.7, d.browY[1], y))
        * gauss(angDist(th, FRONT), 0.62);
      r += 0.5 * browK;
      // Ceilings and floors, in that order: never out the socket, never
      // into the shaft.
      const ez = th > -Math.PI / 2 && th < Math.PI / 2 ? 1 : 1; // ellipse handled below
      r = Math.min(r, d.rCeil);
      if (y < d.despawnY + 2.5) r = Math.max(r, d.rFloor);
      // Elliptical squeeze in z: the socket is shallower than it is wide.
      const cz = Math.sin(th) >= 0 ? d.ellipse.zf : d.ellipse.zb;
      const wx = r * Math.cos(th);
      const wz = r * Math.sin(th) * Math.min(1, cz);
      const m = portMask(d, wx, y, seed);
      mask.push(m);
      pos.push(wx, y, d.axisZ + wz);
      uv.push(i / nTh, y / (10 * d.S));
      // Vertex colour: wood base, moss on the shaded arc + roots, lichen
      // freckles high on the weather side, torn-fiber pale at the port rim.
      let cr = wood.r, cg = wood.g, cb = wood.b;
      const shadeArc = gauss(angDist(th, FRONT + Math.PI * 0.85), 0.85);
      const mossK = clamp01((0.6 * shadeArc + 0.55 * flare(y))
        * (0.45 + 0.55 * fbm(th * 2.2, y * 0.5, 8, 3, seed + 7)));
      cr += (moss.r - cr) * mossK * 0.85;
      cg += (moss.g - cg) * mossK * 0.85;
      cb += (moss.b - cb) * mossK * 0.85;
      const lichK = clamp01((y / (7 * d.S)) - 0.25)
        * smoothstep(0.55, 0.9, fbm(th * 5.1, y * 0.9, 8, 3, seed + 11)) * 0.7;
      cr += (lich.r - cr) * lichK;
      cg += (lich.g - cg) * lichK;
      cb += (lich.b - cb) * lichK;
      col.push(cr, cg, cb);
    }
  }
  // Faces: drop every quad fully inside the port (the hole), and brighten
  // the fringe ring (vertices where the mask CHANGES across the quad).
  const at = (j, i) => j * (nTh + 1) + i;
  for (let j = 0; j < nY; j++) {
    for (let i = 0; i < nTh; i++) {
      const a = at(j, i), b = at(j, i + 1), c = at(j + 1, i), e = at(j + 1, i + 1);
      const inside = mask[a] + mask[b] + mask[c] + mask[e];
      if (inside === 4) continue;                   // the torn mouth
      if (inside > 0) {
        // Torn fiber rim: exposed pale wood, brighter than weathered skin.
        for (const vi of [a, b, c, e]) {
          col[vi * 3] = Math.min(1, col[vi * 3] * 1.45 + 0.1);
          col[vi * 3 + 1] = Math.min(1, col[vi * 3 + 1] * 1.4 + 0.08);
          col[vi * 3 + 2] = Math.min(1, col[vi * 3 + 2] * 1.25 + 0.05);
        }
      }
      idx.push(a, c, b, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, dims: d, yTop, lobes, FRONT };
}

// The dark inside: a shaft-hugging cylinder shell, port hole aligned
// (cut wider, so the outer fringe is always the visible edge), black-brown
// with the faintest fiber so a wandering eye reads CAVITY, not void paint.
function buildLiner(v, d, seed) {
  const nTh = 64, nY = 24;
  const pos = [], col = [], idx = [];
  const maskArr = [];
  const y0 = 0.3, y1 = d.despawnY + 1.6;
  for (let j = 0; j <= nY; j++) {
    for (let i = 0; i <= nTh; i++) {
      const th = (i / nTh) * Math.PI * 2 - Math.PI / 2;
      const y = y0 + (j / nY) * (y1 - y0);
      const r = d.linerR + 0.06 * fbm(th * 3, y * 0.5, 8, 3, seed + 21);
      // The +z half squeezes to stay inside the socket's front plane —
      // the fit probe caught the round liner crossing z0+0.25 by 0.044.
      const wx = r * Math.cos(th);
      const wz = r * Math.sin(th) * (Math.sin(th) > 0 ? 0.9 : 1);
      // The liner's hole is WIDER than the shell's: its rim must never
      // peek through the outer fringe.
      const m = (Math.abs(wx) < d.port.hw + 0.55 && y > d.port.y0 - 0.2
        && y < d.port.y1 + 0.75 && Math.sin(th) > 0) ? 1 : 0;
      maskArr.push(m);
      pos.push(wx, y, d.axisZ + wz);
      const k = 0.05 + 0.05 * fbm(th * 8, y, 8, 2, seed + 23);
      col.push(k, k * 0.9, k * 0.8);
    }
  }
  const at = (j, i) => j * (nTh + 1) + i;
  for (let j = 0; j < nY; j++) {
    for (let i = 0; i < nTh; i++) {
      const a = at(j, i), b = at(j, i + 1), c = at(j + 1, i), e = at(j + 1, i + 1);
      if (maskArr[a] + maskArr[b] + maskArr[c] + maskArr[e] === 4) continue;
      idx.push(a, c, b, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// THE BARK ATLAS — one cylindrical print, world-height v, so vertical
// logic (weathering pales upward, rot pools low) lives IN the canvas.
// ---------------------------------------------------------------------------
function bakeBark(seed) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const h = document.createElement('canvas'); h.width = W; h.height = H;
  const cx = c.getContext('2d'), hx = h.getContext('2d');
  const ci = cx.createImageData(W, H), hi = hx.createImageData(W, H);
  const STOPS = [[0x4a, 0x40, 0x33], [0x8a, 0x7d, 0x69], [0xc9, 0xbd, 0xa6]];
  for (let py = 0; py < H; py++) {
    const vv = 1 - py / H;                            // canvas up = world up
    for (let px = 0; px < W; px++) {
      const u = px / W;
      // Striation: turbulence stretched hard in v — fibers, not marble.
      const s = turb(u * 46, vv * 4.2, 46, 4, seed);
      const drift = fbm(u * 6, vv * 2.2, 6, 3, seed + 1);
      // Weathered silver rises up the trunk; rot pools in the low third.
      const silver = clamp01(vv * 1.25 - 0.12 + 0.25 * (drift - 0.5));
      const rot = smoothstep(0.62, 0.95,
        fbm(u * 5.2, vv * 3.1, 5.2, 4, seed + 4)) * (1 - smoothstep(0.25, 0.6, vv));
      let t = clamp01(0.28 + 0.5 * s + 0.28 * silver - 0.55 * rot);
      const [r, g, b] = ramp3(STOPS, t);
      const i4 = (py * W + px) * 4;
      ci.data[i4] = r; ci.data[i4 + 1] = g; ci.data[i4 + 2] = b; ci.data[i4 + 3] = 255;
      const hh = clamp01(0.5 + 0.45 * (s - 0.5) - 0.5 * rot);
      hi.data[i4] = hi.data[i4 + 1] = hi.data[i4 + 2] = hh * 255; hi.data[i4 + 3] = 255;
    }
  }
  cx.putImageData(ci, 0, 0); hx.putImageData(hi, 0, 0);
  return mapsFromCanvases(c, h, seed);
}

// ---------------------------------------------------------------------------
// THE SKIN
// ---------------------------------------------------------------------------
let ATLAS = null;

export function buildBoleSkin(v, paletteId = 'foxfire') {
  const pal = FAE_PALETTES[paletteId] || FAE_PALETTES.foxfire;
  const seed = 0xb01e;
  const group = new THREE.Group();
  group.name = 'towerSkin';
  const wood = new THREE.Group();
  wood.name = 'towerSkinWood';
  group.add(wood);

  if (!ATLAS) ATLAS = bakeBark(seed);
  const shellMat = new THREE.MeshStandardMaterial({
    map: ATLAS.map, normalMap: ATLAS.normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughnessMap: ATLAS.roughnessMap, roughness: 1, metalness: 0,
    envMapIntensity: 0.45, vertexColors: true, side: THREE.DoubleSide,
  });

  const { geo, dims } = buildBoleShell(v, pal, seed);
  const shell = new THREE.Mesh(geo, shellMat);
  shell.name = 'boleShell';
  shell.castShadow = true; shell.receiveShadow = true;
  wood.add(shell);

  const linerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0,
    envMapIntensity: 0, side: THREE.DoubleSide,
  });
  const liner = new THREE.Mesh(buildLiner(v, dims, seed), linerMat);
  liner.name = 'boleLiner';
  wood.add(liner);

  // The chute, skinned as the hollow's own punky floor (the contract's
  // "models may SKIN it" — same box, zero colliders).
  const chuteGeo = new THREE.BoxGeometry(v.apron.s[0], v.apron.s[1], v.apron.s[2]);
  planarUV(chuteGeo, 8, 8);
  const chute = new THREE.Mesh(chuteGeo, new THREE.MeshStandardMaterial({
    map: ATLAS.map, roughnessMap: ATLAS.roughnessMap, roughness: 1,
    color: 0x6b6157, metalness: 0, envMapIntensity: 0.45,
  }));
  chute.position.set(...v.apron.c);
  chute.rotation.x = v.apron.rx;
  chute.castShadow = false; chute.receiveShadow = true;
  wood.add(chute);

  group.userData.dims = dims;
  group.userData.pal = pal;
  return group;
}
