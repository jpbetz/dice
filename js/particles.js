/*
 * Copyright 2026 The Dice Table Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// js/particles.js — Level 3 of the effects ladder (docs/THEMES.md):
// IMPACT-KEYED PARTICLES. A burst is always the consequence of a measured
// physics contact — the caller hands us the contact point and the impact
// velocity along the normal (the same number the click sounds key off) and
// the set's recipe decides what flies. Nothing here is on a timer loop;
// no impact, no particles.
//
// The field is deliberately stateless about WHEN: `burst(recipe, at,
// strength)` works equally from a live cannon `collide` event (the lab's
// drop rig) and from the main table's fast-forward playback, where
// contacts are recorded as {time, position, strength} during simulation
// and replayed on the animation clock — same seam as roll.sounds.
//
// One THREE.Points draw call, a fixed ring pool, procedural soft-dot
// sprite in the fragment shader, additive blending. CPU integration:
// per-particle gravity (negative falls, positive is buoyant), exponential
// drag, a lateral wobble (bubbles, motes), size and color lerps, and an
// alpha envelope with a per-particle fade-out knee (a bubble POPS at
// 0.94; fog has been going since 0.35).

import * as THREE from 'three';

const MAX = 1024;

// Impact strengths arrive in main-table units (GRAVITY -110 ⇒ first
// bounces around 20-30, late taps 2-5). Kinds normalize against this.
const STRENGTH_REF = 28;

function hexRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export class ParticleField {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.posA = new Float32Array(MAX * 3);
    this.colA = new Float32Array(MAX * 3);
    this.sizeA = new Float32Array(MAX);
    this.alphaA = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.posA, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.colA, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sizeA, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaA, 1));
    this.geometry = g;

    // sim state (never uploaded)
    this.vel = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX);
    this.life = new Float32Array(MAX); // 0 ⇒ dead slot
    this.grav = new Float32Array(MAX);
    this.damp = new Float32Array(MAX);
    this.s0 = new Float32Array(MAX);
    this.s1 = new Float32Array(MAX);
    this.c0 = new Float32Array(MAX * 3);
    this.c1 = new Float32Array(MAX * 3);
    this.aMax = new Float32Array(MAX);
    this.fadeIn = new Float32Array(MAX);
    this.outKnee = new Float32Array(MAX);
    this.wobAmp = new Float32Array(MAX);
    this.wobFreq = new Float32Array(MAX);
    this.wobPhase = new Float32Array(MAX);
    this.cursor = 0; // ring allocator: under pressure the oldest dies first
    this.alive = 0;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uProj: { value: 700 } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uProj;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(aSize * uProj / max(-mv.z, 0.1), 1.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.5, d) * vAlpha;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor * a, a);
        }`,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false; // one pool spans the whole scene
    scene.add(this.points);
  }

  // pixels-per-world-unit at distance 1 — call on resize / fov change
  setProjection(heightPx, fovDeg) {
    this.material.uniforms.uProj.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    if (this.life[i] <= 0) this.alive++;
    this.posA[i * 3] = o.pos[0];
    this.posA[i * 3 + 1] = o.pos[1];
    this.posA[i * 3 + 2] = o.pos[2];
    this.vel[i * 3] = o.vel[0];
    this.vel[i * 3 + 1] = o.vel[1];
    this.vel[i * 3 + 2] = o.vel[2];
    this.age[i] = 0;
    this.life[i] = o.life;
    this.grav[i] = o.grav ?? 0;
    this.damp[i] = o.damp ?? 0;
    this.s0[i] = o.size[0];
    this.s1[i] = o.size[1] ?? o.size[0];
    const c0 = o.colorFrom;
    const c1 = o.colorTo ?? [c0[0] * 0.1, c0[1] * 0.1, c0[2] * 0.1];
    this.c0.set(c0, i * 3);
    this.c1.set(c1, i * 3);
    this.aMax[i] = o.alpha ?? 1;
    this.fadeIn[i] = o.fadeIn ?? 0;
    this.outKnee[i] = o.outKnee ?? 0.55;
    this.wobAmp[i] = o.wobAmp ?? 0;
    this.wobFreq[i] = o.wobFreq ?? 0;
    this.wobPhase[i] = o.wobPhase ?? 0;
  }

  // The one entry point effects should use: a measured impact at a point.
  burst(recipe, at, strength, rng = Math.random) {
    if (!recipe || !KINDS[recipe.kind]) return 0;
    return KINDS[recipe.kind](this, recipe, at, strength, rng);
  }

  // A single drifting particle in a recipe's palette — the unmake burn
  // feeds these out per-frame, riding uDissolve (rate = the effect's
  // business, look = the recipe's).
  wisp(recipe, at, rng = Math.random) {
    if (!recipe) return;
    emitAsh(this, recipe, at, rng);
  }

  count() {
    return this.alive;
  }

  tick(dt, t) {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        this.alphaA[i] = 0;
        continue;
      }
      alive++;
      const k = this.age[i] / this.life[i];
      const d = this.damp[i] > 0 ? Math.exp(-this.damp[i] * dt) : 1;
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.posA[i * 3] += this.vel[i * 3] * dt;
      this.posA[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.posA[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.wobAmp[i] > 0) {
        // lateral sway around the integrated path (bubbles, motes)
        const w = t * this.wobFreq[i] + this.wobPhase[i];
        this.posA[i * 3] += Math.sin(w) * this.wobAmp[i] * dt * this.wobFreq[i];
        this.posA[i * 3 + 2] += Math.cos(w * 0.83) * this.wobAmp[i] * dt * this.wobFreq[i];
      }
      this.sizeA[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      const aIn = this.fadeIn[i] > 0 ? Math.min(this.age[i] / this.fadeIn[i], 1) : 1;
      this.alphaA[i] = this.aMax[i] * aIn * (1 - smooth(this.outKnee[i], 1, k));
      for (let c = 0; c < 3; c++) {
        this.colA[i * 3 + c] = this.c0[i * 3 + c] + (this.c1[i * 3 + c] - this.c0[i * 3 + c]) * k;
      }
    }
    this.alive = alive;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Kinds — each is a physical claim about WHY matter leaves a die.
// Recipes pass {kind, colors, fadeTo?, scale?}; strength is the impact
// velocity along the contact normal, main-table units.
// ---------------------------------------------------------------------------

const jitter = (rng, at, r) => [
  at[0] + (rng() - 0.5) * r,
  at[1] + (rng() - 0.5) * r,
  at[2] + (rng() - 0.5) * r,
];

function emitAsh(f, r, at, rng) {
  const colors = r.colors || ['#5a4a6a', '#cfe98c'];
  // mostly dead ash; one in five carries a live witchlight ember
  const c = hexRGB(rng() < 0.2 && colors[1] ? colors[1] : colors[0]);
  f.emit({
    pos: jitter(rng, at, 0.25),
    vel: [(rng() - 0.5) * 0.5, 0.35 + rng() * 0.65, (rng() - 0.5) * 0.5],
    grav: 0.55, // heat rises; ash rides it
    damp: 0.7,
    life: 1.0 + rng() * 0.9,
    size: [0.07 + rng() * 0.06, 0.035],
    colorFrom: c,
    alpha: 0.8,
    fadeIn: 0.12,
    outKnee: 0.45,
    wobAmp: 0.5,
    wobFreq: 1.6,
    wobPhase: rng() * 6.28,
  });
}

const KINDS = {
  // struck iron sheds sparks: fast, low over the table, gravity wins fast
  sparks(f, r, at, s, rng) {
    const sn = Math.min(s / STRENGTH_REF, 1.2);
    const n = Math.round((5 + 22 * sn) * (r.scale ?? 1));
    const fadeTo = r.fadeTo ? hexRGB(r.fadeTo) : null;
    for (let i = 0; i < n; i++) {
      const az = rng() * Math.PI * 2;
      const el = 0.08 + rng() * 0.55;
      const v = (3.2 + rng() * 4.2) * (0.5 + sn * 0.7);
      f.emit({
        pos: jitter(rng, at, 0.12),
        vel: [Math.cos(az) * Math.cos(el) * v, Math.sin(el) * v, Math.sin(az) * Math.cos(el) * v],
        grav: -26,
        damp: 1.0,
        life: 0.22 + rng() * 0.38,
        size: [0.075 + rng() * 0.055, 0.028],
        colorFrom: hexRGB(pick(rng, r.colors)),
        colorTo: fadeTo,
        outKnee: 0.5,
      });
    }
    return n;
  },
  // the charge grounds through the contact: no weight, all speed, gone
  static(f, r, at, s, rng) {
    const sn = Math.min(s / STRENGTH_REF, 1.2);
    const n = Math.round((4 + 14 * sn) * (r.scale ?? 1));
    for (let i = 0; i < n; i++) {
      const v = 5 + rng() * 6;
      const dir = [rng() - 0.5, rng() - 0.5, rng() - 0.5];
      const L = Math.hypot(...dir) || 1;
      f.emit({
        pos: jitter(rng, at, 0.1),
        vel: [(dir[0] / L) * v, (Math.abs(dir[1]) / L) * v, (dir[2] / L) * v],
        damp: 5.5,
        life: 0.09 + rng() * 0.18,
        size: [0.055 + rng() * 0.04, 0.02],
        colorFrom: hexRGB(pick(rng, r.colors)),
        outKnee: 0.4,
      });
    }
    return n;
  },
  // a knock shakes something loose from living wood: it drifts, unhurried
  motes(f, r, at, s, rng) {
    const sn = Math.min(s / STRENGTH_REF, 1);
    const n = Math.round((3 + 7 * sn) * (r.scale ?? 1));
    for (let i = 0; i < n; i++) {
      f.emit({
        pos: jitter(rng, at, 0.35),
        vel: [(rng() - 0.5) * 0.6, 0.15 + rng() * 0.4, (rng() - 0.5) * 0.6],
        grav: 0.3,
        damp: 0.6,
        life: 1.5 + rng() * 1.3,
        size: [0.05 + rng() * 0.04, 0.05],
        colorFrom: hexRGB(pick(rng, r.colors)),
        colorTo: hexRGB(pick(rng, r.colors)),
        alpha: 0.75,
        fadeIn: 0.25,
        outKnee: 0.6,
        wobAmp: 0.6,
        wobFreq: 2.2,
        wobPhase: rng() * 6.28,
      });
    }
    return n;
  },
  // impact knocks a breath of cold off the surface: a low spreading sigh
  fog(f, r, at, s, rng) {
    const sn = Math.min(s / STRENGTH_REF, 1);
    const n = Math.round((5 + 7 * sn) * (r.scale ?? 1));
    for (let i = 0; i < n; i++) {
      const az = rng() * Math.PI * 2;
      const v = 0.5 + rng() * 0.8;
      f.emit({
        pos: jitter(rng, at, 0.2),
        vel: [Math.cos(az) * v, 0.1 + rng() * 0.25, Math.sin(az) * v],
        grav: 0.05,
        damp: 1.6,
        life: 0.7 + rng() * 0.5,
        size: [0.2 + rng() * 0.12, 0.7],
        colorFrom: hexRGB(pick(rng, r.colors)),
        alpha: 0.3,
        fadeIn: 0.2,
        outKnee: 0.35,
      });
    }
    return n;
  },
  // trapped sea-air escapes: it rises, sways, and POPS (no polite fade)
  bubbles(f, r, at, s, rng) {
    const sn = Math.min(s / STRENGTH_REF, 1);
    const n = Math.round((3 + 6 * sn) * (r.scale ?? 1));
    for (let i = 0; i < n; i++) {
      f.emit({
        pos: jitter(rng, at, 0.3),
        vel: [(rng() - 0.5) * 0.5, 0.7 + rng() * 0.7, (rng() - 0.5) * 0.5],
        grav: 1.4,
        damp: 0.9,
        life: 0.5 + rng() * 0.7,
        size: [0.05 + rng() * 0.05, 0.115],
        colorFrom: hexRGB(pick(rng, r.colors)),
        colorTo: hexRGB(pick(rng, r.colors)),
        alpha: 0.85,
        fadeIn: 0.08,
        outKnee: 0.94,
        wobAmp: 1.1,
        wobFreq: 5,
        wobPhase: rng() * 6.28,
      });
    }
    return n;
  },
  // old bone gives up its dust: a soft puff that thinks about settling
  dust(f, r, at, s, rng) {
    const sn = Math.min(s / STRENGTH_REF, 1);
    const n = Math.round((5 + 8 * sn) * (r.scale ?? 1));
    for (let i = 0; i < n; i++) {
      const az = rng() * Math.PI * 2;
      const v = 0.35 + rng() * 0.7;
      f.emit({
        pos: jitter(rng, at, 0.2),
        vel: [Math.cos(az) * v, 0.25 + rng() * 0.5, Math.sin(az) * v],
        grav: -0.5,
        damp: 1.8,
        life: 0.6 + rng() * 0.5,
        size: [0.13 + rng() * 0.08, 0.32],
        colorFrom: hexRGB(pick(rng, r.colors)),
        alpha: 0.3,
        fadeIn: 0.12,
        outKnee: 0.4,
      });
    }
    return n;
  },
  // what it touches, it unmakes a little: dim ash with a rare live ember
  ash(f, r, at, s, rng) {
    const sn = Math.min(s / STRENGTH_REF, 1);
    const n = Math.round((3 + 6 * sn) * (r.scale ?? 1));
    for (let i = 0; i < n; i++) emitAsh(f, r, at, rng);
    return n;
  },
};

export const PARTICLE_KINDS = Object.keys(KINDS);
