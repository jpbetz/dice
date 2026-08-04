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

// js/post.js — Level 5 of the effects ladder (docs/THEMES.md), and the
// last rung ON PURPOSE: postprocessing amplifies identity the earlier
// levels created; it creates none. Hand-rolled against core three — no
// examples/jsm, no EffectComposer. Three instruments:
//
// SELECTIVE BLOOM — truly selective, not a luminance guess: the scene
// renders a second time with every non-glowing object blacked out (or
// hidden, for custom-shader meshes whose materials can't be swapped),
// so only meshes FLAGGED as glow sources (mesh.userData.bloom — themed
// dice with emissive identity, the particle field) reach the threshold
// and blur chain. A std table contributes literal zero: the released
// look is preserved by construction, not by tuning. Occlusion stays
// honest — a std die in front of a molten one blacks out its halo.
// Bloom strength per set is NOT a recipe knob: whatever Levels 1-2 made
// bright is exactly what burns.
//
// SHOCK RINGS — a screen-space displacement wave expanding from a REAL
// impact (the drain hands us the contact point, same seam as sounds,
// particles and decals), with an optional frame jolt. Negative
// amplitude runs the wave inward: Umbra's discharge is an implosion.
//
// HEAT SHIMMER — a small time-driven refraction wobble around hot dice
// (world positions projected each frame; the caller decides who is
// hot). Air, not glow.
//
// Pipeline (all render targets are HalfFloat + NoColorSpace, so every
// intermediate holds tone-mapped LINEAR values at full precision; the
// one pass that touches the screen ends with #include
// <colorspace_fragment>, which lets three encode sRGB exactly as it
// would for a direct render — the bypass path and the stack path agree):
//   scene → rtBase (full res, MSAA)
//   masked scene → rtGlow (half res) → threshold → blur ×2 (ping-pong)
//   composite(rtBase + bloom, rings, shimmer, jolt) → screen

import * as THREE from 'three';

const MAX_RINGS = 4;
const MAX_SHIMMER = 6;

const BLUR_FRAG = `
  uniform sampler2D tSrc;
  uniform vec2 uDir; // texel-space step
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
    c += texture2D(tSrc, vUv + uDir * 1.384615).rgb * 0.316216;
    c += texture2D(tSrc, vUv - uDir * 1.384615).rgb * 0.316216;
    c += texture2D(tSrc, vUv + uDir * 3.230769).rgb * 0.070270;
    c += texture2D(tSrc, vUv - uDir * 3.230769).rgb * 0.070270;
    gl_FragColor = vec4(c, 1.0);
  }`;

const THRESH_FRAG = `
  uniform sampler2D tSrc;
  uniform float uThresh;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * smoothstep(uThresh, uThresh + 0.3, l), 1.0);
  }`;

const COMPOSITE_FRAG = `
  uniform sampler2D tBase;
  uniform sampler2D tBloom;
  uniform vec2 uRes;
  uniform float uBloom;
  uniform vec2 uJolt;
  uniform float uTime;
  uniform vec4 uRings[${MAX_RINGS}];   // x, y, radius (px), amp (px; sign = direction)
  uniform float uRingW[${MAX_RINGS}];  // band width (px)
  uniform vec4 uShim[${MAX_SHIMMER}];  // x, y, radius (px), strength (px)
  varying vec2 vUv;
  void main() {
    vec2 px = vUv * uRes;
    vec2 off = uJolt;
    for (int i = 0; i < ${MAX_RINGS}; i++) {
      float amp = uRings[i].w;
      if (amp != 0.0) {
        vec2 d = px - uRings[i].xy;
        float dist = length(d) + 1e-3;
        float band = exp(-pow((dist - uRings[i].z) / uRingW[i], 2.0));
        off += (d / dist) * band * amp;
      }
    }
    for (int i = 0; i < ${MAX_SHIMMER}; i++) {
      float s = uShim[i].w;
      if (s > 0.0) {
        vec2 rel = (px - uShim[i].xy) / uShim[i].z;
        float w = exp(-dot(rel, rel));
        off.x += sin(px.y * 0.11 + uTime * 8.0 + uShim[i].x * 0.7) * w * s;
        off.y += sin(px.y * 0.163 + uTime * 6.3) * w * s * 0.35;
      }
    }
    vec3 base = texture2D(tBase, clamp((px + off) / uRes, 0.0, 1.0)).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    gl_FragColor = vec4(base + bloom * uBloom, 1.0);
    // three applies tone mapping ONLY on the null target (r160
    // WebGLPrograms: currentRenderTarget === null), so every scene value
    // reached us LINEAR and un-tonemapped — bloom adds where light adds,
    // before the camera curve — and this one screen pass runs ACES +
    // sRGB exactly as a direct render would. (Skipping this was a 29 dB
    // washout against the bypass path.)
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const QUAD_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

function makeRT(w, h, samples = 0) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, // linear intermediates: 8-bit would band the dark felt
    depthBuffer: samples > 0,
  });
  if (samples > 0) rt.samples = samples;
  return rt;
}

export class PostStack {
  constructor(renderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.w = Math.max(size.x, 8);
    this.h = Math.max(size.y, 8);
    const msaa = renderer.capabilities.isWebGL2 ? 4 : 0;
    this.rtBase = makeRT(this.w, this.h, msaa);
    this.rtGlow = makeRT(this.w >> 1, this.h >> 1, 0);
    this.rtGlow.depthBuffer = true; // glow pass needs occlusion (black dice cover halos)
    this.rtA = makeRT(this.w >> 1, this.h >> 1);
    this.rtB = makeRT(this.w >> 1, this.h >> 1);

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.matThresh = new THREE.ShaderMaterial({
      // Thresholds LINEAR pre-tonemap luminance (see the composite note):
      // emissive digits and fresnel rims run well over 1.0 there; a
      // key-lit body face shouldn't clear 0.9.
      uniforms: { tSrc: { value: null }, uThresh: { value: 0.9 } },
      vertexShader: QUAD_VERT,
      fragmentShader: THRESH_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.matBlur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.matComposite = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null },
        tBloom: { value: null },
        uRes: { value: new THREE.Vector2(this.w, this.h) },
        uBloom: { value: 1.0 },
        uJolt: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uRings: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
        uRingW: { value: new Float32Array(MAX_RINGS).fill(1) },
        uShim: { value: Array.from({ length: MAX_SHIMMER }, () => new THREE.Vector4()) },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this._swap = []; // {obj, mats} | {obj, hidden}

    this.time = 0;
    this.rings = []; // {x, y, age, dur, amp, speed, width, jolt, phase}
    this.shimmer = []; // vec4-shaped [x, y, radius, strength]
    this.ringsFired = 0; // monotonic (assertion surface — sim clocks outrun live state)
    this.lastBloomSources = 0;
  }

  setSize(w, h) {
    this.w = Math.max(w | 0, 8);
    this.h = Math.max(h | 0, 8);
    this.rtBase.setSize(this.w, this.h);
    this.rtGlow.setSize(this.w >> 1, this.h >> 1);
    this.rtA.setSize(this.w >> 1, this.h >> 1);
    this.rtB.setSize(this.w >> 1, this.h >> 1);
    this.matComposite.uniforms.uRes.value.set(this.w, this.h);
  }

  // Project a world point to physical-pixel space for the given camera.
  _toPx(worldPos, camera, out) {
    const v = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]).project(camera);
    out.x = (v.x * 0.5 + 0.5) * this.w;
    out.y = (-v.y * 0.5 + 0.5) * this.h;
    return out;
  }

  // Fire a shock ring at a world point. amp in px (negative = implosion);
  // jolt shakes the whole frame for ~120 ms.
  ring(worldPos, camera, { amp = 6, speed = 1400, width = 30, jolt = 0, dur = 0.55 } = {}) {
    const p = this._toPx(worldPos, camera, new THREE.Vector2());
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x: p.x, y: p.y, age: 0, dur, amp, speed, width, jolt, phase: Math.random() * 6.28 });
    this.ringsFired++;
  }

  // Replace this frame's shimmer sources: [{at: [x,y,z], radius, strength}]
  // — radius in world units, strength in px of wobble.
  setShimmer(list, camera) {
    this.shimmer.length = 0;
    for (const s of list.slice(0, MAX_SHIMMER)) {
      const p = this._toPx(s.at, camera, new THREE.Vector2());
      // world radius → px: project a point one radius up and measure
      const q = this._toPx([s.at[0], s.at[1] + s.radius, s.at[2]], camera, new THREE.Vector2());
      const rPx = Math.max(Math.hypot(q.x - p.x, q.y - p.y), 24);
      // biased well above the die: hot air wobbles the world BEHIND and
      // OVER the iron; the die's own base stays believable
      this.shimmer.push([p.x, p.y - rPx * 0.85, rPx * 1.25, s.strength]);
    }
  }

  busy() {
    return this.rings.length > 0 || this.shimmer.length > 0;
  }

  // Black out (or hide) everything that isn't a glow source. Returns the
  // number of glow sources left visible.
  _maskOn(scene) {
    let sources = 0;
    scene.traverse((o) => {
      if (!o.visible || !(o.isMesh || o.isPoints || o.isLine)) return;
      if (o.userData.bloom) {
        sources++;
        return;
      }
      if (o.isMesh && !(o.material && o.material.isShaderMaterial)) {
        this._swap.push({ obj: o, mats: o.material });
        o.material = this.blackMat;
      } else {
        // custom-shader meshes (decal field), points, lines: hide — a
        // basic-material swap would ignore their instanced attributes
        this._swap.push({ obj: o, hidden: true });
        o.visible = false;
      }
    });
    return sources;
  }

  _maskOff() {
    for (const s of this._swap) {
      if (s.hidden) s.obj.visible = true;
      else s.obj.material = s.mats;
    }
    this._swap.length = 0;
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  // Render the frame through the stack. dt drives ring/shimmer clocks
  // (a held clock freezes them — deterministic screenshots hold).
  render(scene, camera, dt) {
    const renderer = this.renderer;
    this.time += dt;

    // ---- base ----
    renderer.setRenderTarget(this.rtBase);
    renderer.render(scene, camera);

    // ---- glow mask → threshold → blur ----
    const bg = scene.background;
    scene.background = null;
    const sources = (this.lastBloomSources = this._maskOn(scene));
    if (sources > 0) {
      renderer.setRenderTarget(this.rtGlow);
      renderer.render(scene, camera);
    }
    this._maskOff();
    scene.background = bg;
    if (sources > 0) {
      this.matThresh.uniforms.tSrc.value = this.rtGlow.texture;
      this._pass(this.matThresh, this.rtA);
      const w2 = this.w >> 1, h2 = this.h >> 1;
      for (let i = 0; i < 2; i++) {
        this.matBlur.uniforms.tSrc.value = this.rtA.texture;
        this.matBlur.uniforms.uDir.value.set((1 + i) / w2, 0);
        this._pass(this.matBlur, this.rtB);
        this.matBlur.uniforms.tSrc.value = this.rtB.texture;
        this.matBlur.uniforms.uDir.value.set(0, (1 + i) / h2);
        this._pass(this.matBlur, this.rtA);
      }
    } else {
      renderer.setRenderTarget(this.rtA);
      renderer.clear();
    }

    // ---- ring/shimmer clocks → composite uniforms ----
    const u = this.matComposite.uniforms;
    let joltX = 0, joltY = 0;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age >= r.dur) this.rings.splice(i, 1);
      else if (r.jolt > 0 && r.age < 0.13) {
        const k = r.jolt * (1 - r.age / 0.13);
        joltX += Math.sin(r.age * 97 + r.phase) * k;
        joltY += Math.cos(r.age * 83 + r.phase) * k;
      }
    }
    u.uJolt.value.set(joltX, joltY);
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = this.rings[i];
      if (!r) { u.uRings.value[i].set(0, 0, 0, 0); continue; }
      const fall = Math.exp(-r.age * 4.2) * Math.min(r.age / 0.03, 1);
      u.uRings.value[i].set(r.x, r.y, r.age * r.speed, r.amp * fall);
      u.uRingW.value[i] = r.width + r.age * 90;
    }
    for (let i = 0; i < MAX_SHIMMER; i++) {
      const s = this.shimmer[i];
      if (!s) u.uShim.value[i].set(0, 0, 1, 0);
      else u.uShim.value[i].set(s[0], s[1], s[2], s[3]);
    }
    u.uTime.value = this.time;
    u.tBase.value = this.rtBase.texture;
    u.tBloom.value = this.rtA.texture;
    this._pass(this.matComposite, null);
  }
}
