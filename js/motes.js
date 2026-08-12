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

// DUST MOTES IN THE LAMPLIGHT (docs/IMMERSION-AUDIT.md §3, ROADMAP Tier V2).
// The canon's cheapest "this air is real" cue: sparse bright specks drifting
// through the mood lamp's cone. This is an AMBIENT layer and deliberately NOT
// js/particles.js — that module is impact-keyed by contract, and a timer
// bolted onto it would break the one honest thing its API says about itself.
//
// The design constraints, in the order they bit:
//   1. ADDITIVE, unlike the smoke. towerdress.js's smoke rule ("never
//      additive — real smoke occludes") is about volumes of soot. A mote is
//      the opposite object: a speck too small to occlude anything, visible
//      ONLY because it scatters the lamp toward the eye. Additive is not a
//      cheat here, it is the physics.
//   2. ONE draw call: THREE.Points, single material, brightness per mote via
//      a vertexColors attribute (with additive blending, colour scale IS
//      opacity, so no per-point alpha channel is needed).
//   3. The clock is ACCUMULATED dt handed in by the caller — same discipline
//      as SHADER_TIME and the dress clock, so `holdClock` freezes the air and
//      screenshots stay deterministic. No Date.now anywhere.
//   4. Every mote lives INSIDE the beam. Position is sampled in cone
//      coordinates (radius grows toward the felt), capped at rMax so the
//      wide bottom of a 0.5 rad cone does not scatter specks across the
//      whole room. Brightness dies asymptotically at the top and bottom of
//      the fall band — a mote never pops in or out.
//   5. fog: false. The motes sit in the lamp pool well inside fogNear-ish
//      range; letting the room fog grey them out defeats the point of a
//      glint.

import * as THREE from 'three';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A soft round sprite: radial falloff to zero at the rim, so a mote has no
// square. Baked once per build; 32 px is plenty for a 2-3 px speck.
function bakeMoteSprite(size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// tune: { count, size, peak, color, lamp: {x,y,z}, target: {x,y,z}, angle,
//         spread, rMax, yMin, yMax, fall, wander, twinkleHz }
export function buildMotes(seed, tune) {
  const rnd = mulberry32(seed >>> 0);
  const n = tune.count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: tune.size,
    map: bakeMoteSprite(),
    color: tune.color,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'moodMotes';
  points.frustumCulled = false; // motes wander past any static build box
  points.renderOrder = 3;       // after the felt and the smoke, like all glints

  // Per-mote statics: a home in cone coordinates plus incommensurate wander
  // phases. The fall is a phase offset into one shared cycle, so stepMotes
  // is a pure function of t — rewindable, freezable.
  const m = [];
  for (let i = 0; i < n; i++) {
    m.push({
      u: rnd(),                       // fall-cycle phase offset
      rf: Math.sqrt(rnd()),           // radius fraction (area-uniform in the disc)
      th: rnd() * Math.PI * 2,        // angle around the beam axis
      wx: 0.35 + 0.5 * rnd(),         // wander rates (Hz-ish, all slow)
      wz: 0.28 + 0.5 * rnd(),
      px: rnd() * Math.PI * 2,        // wander phases
      pz: rnd() * Math.PI * 2,
      tw: rnd() * Math.PI * 2,        // twinkle phase
      twr: 0.6 + 0.8 * rnd(),         // twinkle rate multiplier
      b: 0.45 + 0.55 * rnd() ** 2,    // base brightness (most dim, a few hot)
    });
  }
  return { points, motes: m, tune, tanA: Math.tan(tune.angle) };
}

export function stepMotes(spec, t) {
  const { points, motes, tune, tanA } = spec;
  const pos = points.geometry.attributes.position;
  const col = points.geometry.attributes.color;
  const band = tune.yMax - tune.yMin;
  const cycle = band / tune.fall; // seconds for one top-to-bottom fall
  const L = tune.lamp, T = tune.target;
  for (let i = 0; i < motes.length; i++) {
    const s = motes[i];
    const f = ((t / cycle + s.u) % 1 + 1) % 1;          // 0 at top, 1 at felt
    const y = tune.yMax - band * f;
    // The beam axis runs lamp → target; slide along it to this height.
    const k = (L.y - y) / (L.y - T.y);
    const ax = L.x + (T.x - L.x) * k;
    const az = L.z + (T.z - L.z) * k;
    const r = Math.min(tanA * (L.y - y) * tune.spread, tune.rMax) * s.rf;
    const x = ax + r * Math.cos(s.th) + tune.wander * Math.sin(s.wx * t + s.px);
    const z = az + r * Math.sin(s.th) + tune.wander * Math.sin(s.wz * t + s.pz);
    pos.setXYZ(i, x, y, z);
    // Ends die smoothly (sin envelope over the fall) and each mote breathes
    // on its own slow twinkle — glints, not a static starfield.
    const env = Math.pow(Math.sin(Math.PI * f), 0.7);
    const twk = 0.65 + 0.35 * Math.sin(2 * Math.PI * tune.twinkleHz * s.twr * t + s.tw);
    const v = tune.peak * s.b * env * twk;
    col.setXYZ(i, v, v, v);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

export function disposeMotes(spec) {
  spec.points.geometry.dispose();
  spec.points.material.map.dispose();
  spec.points.material.dispose();
}
