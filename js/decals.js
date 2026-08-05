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

// js/decals.js — Level 4a of the effects ladder (docs/THEMES.md): IMPACT
// DECALS ON THE FELT. Like the particle field (Level 3), a mark is always
// the consequence of a measured physics contact — the caller hands us the
// contact point and impact strength, the set's recipe decides what the
// felt remembers. Every kind is a claim about what the die DID to the
// table: cold spreads (frost), water dries (ring), heat kisses (scorch),
// dust settles (smudge). Marks are transient — the felt always recovers —
// so reload/replay never has to reconstruct them (same contract as
// particles, and the reason they don't live in the 2048px felt composite:
// that texture is event-driven, and animating it would re-upload 16 MB a
// frame).
//
// One instanced draw call over a fixed quad pool. The atlas is procedural
// (4 kinds × 4 seeded variants, drawn once at boot): R channel picks
// between the recipe's two colors, A is coverage — so one shared atlas
// serves a soot-dark scorch and a frost-pale bloom alike. CPU envelope
// per active decal (≤64: grow, hold, fade, ember-cooling color shift);
// dead slots collapse to degenerate quads and cost nothing.

import * as THREE from 'three';

const MAX = 64;
const CELLS = 4; // atlas is CELLS × CELLS
const STRENGTH_REF = 28; // same normalization as particles.js

// KILL SWITCH (Joe, 2026-08-03): the marks are OFF by default — table
// and lab both. He loved the ladder, not the residue. Everything else
// Level 4/5 built (die lights, bloom, rings, shimmer) stays live, and
// the sets keep their `decal:` recipes — inert while this is false.
// Per-page trial: __diceDebug.decalsEnable(true) (table) or
// __lab.decalsEnable(true) (lab). To bring the marks back for good,
// flip this constant.
export const DECALS_DEFAULT_ENABLED = false;

function hexRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// mulberry32 — the atlas must draw identically every boot (screenshots,
// and two tabs of one table should agree about what frost looks like).
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Atlas painting. Tone rides the RED channel (0 → recipe colorA, 1 →
// colorB); alpha is coverage. Canvas source-over blending keeps both
// meaningful under overlapping strokes.
const tone = (t, a) => `rgba(${Math.round(t * 255)},0,0,${a})`;

function drawFrost(x, cx, cy, R, rng) {
  // haze first: the cold breathing outward (colorB — the tint), faint
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.75);
  g.addColorStop(0, tone(1, 0.2));
  g.addColorStop(0.6, tone(1, 0.1));
  g.addColorStop(1, tone(1, 0));
  x.fillStyle = g;
  x.fillRect(cx - R, cy - R, R * 2, R * 2);
  // hoarfrost, not a snowflake: MANY uneven needles creeping out from
  // the contact — some stubs, some runners — each shedding side needles
  const arms = 9 + Math.floor(rng() * 4);
  x.lineCap = 'round';
  for (let i = 0; i < arms; i++) {
    const a0 = (i / arms) * Math.PI * 2 + (rng() - 0.5) * 0.7;
    let px = cx, py = cy, ang = a0;
    const len = R * (0.35 + rng() * 0.6);
    const segs = 3;
    for (let sIdx = 0; sIdx < segs; sIdx++) {
      const segLen = (len / segs) * (0.85 + rng() * 0.3);
      const nx = px + Math.cos(ang) * segLen;
      const ny = py + Math.sin(ang) * segLen;
      const w = (2.4 * (len / R) + 1.4) * (1 - sIdx / segs) + 0.8;
      x.strokeStyle = tone(0.12, 0.55 - sIdx * 0.13);
      x.lineWidth = w;
      x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
      // side needles off each joint — what makes it ice, not a splat
      if (sIdx < segs - 1) {
        for (const side of [-1, 1]) {
          if (rng() < 0.4) continue;
          const ba = ang + side * (0.5 + rng() * 0.45);
          const bl = segLen * (0.3 + rng() * 0.35);
          x.strokeStyle = tone(0.12, 0.34);
          x.lineWidth = w * 0.5;
          x.beginPath(); x.moveTo(nx, ny);
          x.lineTo(nx + Math.cos(ba) * bl, ny + Math.sin(ba) * bl); x.stroke();
        }
      }
      px = nx; py = ny; ang += (rng() - 0.5) * 0.55;
    }
  }
  // crystal specks caught between the needles
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = rng() * R * 0.55;
    x.fillStyle = tone(0.1, 0.25 + rng() * 0.25);
    x.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.8, 1.8);
  }
}

function drawRing(x, cx, cy, R, rng) {
  // the wet patch (colorA — dark, water soaking the nap), fading at center
  let g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.86);
  g.addColorStop(0, tone(0, 0.12));
  g.addColorStop(0.72, tone(0, 0.26));
  g.addColorStop(0.9, tone(0, 0.1));
  g.addColorStop(1, tone(0, 0));
  x.fillStyle = g;
  x.fillRect(cx - R, cy - R, R * 2, R * 2);
  // the drying rim (colorB — pale mineral line), radius wobbling like a
  // real cup ring; drawn as short arcs so the wobble never closes clean
  const rim = R * 0.8;
  const steps = 42;
  x.lineCap = 'round';
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1.35) / steps) * Math.PI * 2;
    const rr = rim + (rng() - 0.5) * 5;
    x.strokeStyle = tone(1, 0.6 + rng() * 0.3);
    x.lineWidth = 2.2 + rng() * 2;
    x.beginPath();
    x.arc(cx, cy, rr, a0, a1);
    x.stroke();
  }
  // an inner, fainter earlier tide-line on some variants
  if (rng() < 0.6) {
    for (let i = 0; i < steps; i++) {
      if (rng() < 0.3) continue;
      const a0 = (i / steps) * Math.PI * 2;
      const rr = rim * (0.55 + rng() * 0.06);
      x.strokeStyle = tone(1, 0.22);
      x.lineWidth = 1.1;
      x.beginPath();
      x.arc(cx, cy, rr, a0, a0 + 0.12);
      x.stroke();
    }
  }
}

function drawScorch(x, cx, cy, R, rng) {
  // several overlapping burn blobs: soot core (colorA), ember rim (colorB)
  const blobs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < blobs; i++) {
    const bx = cx + (rng() - 0.5) * R * 0.5;
    const by = cy + (rng() - 0.5) * R * 0.5;
    const br = R * (0.38 + rng() * 0.3);
    const g = x.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, tone(0, 0.8));
    g.addColorStop(0.5, tone(0, 0.55));
    g.addColorStop(0.68, tone(0.55, 0.42)); // char browning toward the rim
    g.addColorStop(0.82, tone(1, 0.4));     // the ember line
    g.addColorStop(1, tone(1, 0));
    x.fillStyle = g;
    x.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  // stray ember flecks past the rim
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2, r = R * (0.55 + rng() * 0.35);
    x.fillStyle = tone(1, 0.3 + rng() * 0.35);
    x.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.8, 1.8);
  }
}

function drawSmudge(x, cx, cy, R, rng) {
  // dust doesn't splash — it drifts down and settles in soft lobes
  const dir = rng() * Math.PI * 2;
  const blobs = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < blobs; i++) {
    const d = (i / blobs) * R * 0.55;
    const bx = cx + Math.cos(dir) * d + (rng() - 0.5) * R * 0.3;
    const by = cy + Math.sin(dir) * d + (rng() - 0.5) * R * 0.3;
    const br = R * (0.3 + rng() * 0.22) * (1 - (i / blobs) * 0.4);
    const g = x.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, tone(0.25, 0.5));
    g.addColorStop(0.7, tone(0.45, 0.28));
    g.addColorStop(1, tone(0.5, 0));
    x.fillStyle = g;
    x.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  // grains carry the read — dust is particulate, not a wash
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2, r = rng() * rng() * R * 0.6;
    const s = 1.6 + rng() * 1.8;
    x.fillStyle = tone(0.15, 0.5 + rng() * 0.4);
    x.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s, s);
  }
}

const KIND_ROW = { frost: 0, ring: 1, scorch: 2, smudge: 3 };
const PAINTERS = [drawFrost, drawRing, drawScorch, drawSmudge];

// Per-kind envelope + footprint. `size` is the mark's full width in world
// units before strength/recipe scaling (a die is ~2.2 across).
// delay: seconds after the impact before the mark exists (dust hangs in
// the air first). in/fadeAt are shares of `life`. shift: how far into
// life colorB cools to colorA (scorch's ember → soot; 0 = never).
// minGap: a fresh same-kind mark inside this radius suppresses the stamp
// — a die bouncing in place deepens ONE mark, it doesn't pile donuts
// (rings keep a small gap on purpose: overlapping tide-lines read true).
const KINDS = {
  frost:  { size: 3.1,  life: 7,  delay: 0,    in: 0.035, growFrom: 0.3,  growT: 0.06, fadeAt: 0.45, shift: 0,    emit: 1, minGap: 1.0 },
  ring:   { size: 2.5,  life: 6,  delay: 0.05, in: 0.03,  growFrom: 0.5,  growT: 0.1,  fadeAt: 0.5,  shift: 0,    emit: 2, minGap: 0.4 },
  scorch: { size: 1.95, life: 7,  delay: 0,    in: 0.012, growFrom: 0.85, growT: 0.04, fadeAt: 0.4,  shift: 0.3,  emit: 1, minGap: 0.9 },
  smudge: { size: 2.6,  life: 8,  delay: 0.12, in: 0.08,  growFrom: 0.92, growT: 0.1,  fadeAt: 0.5,  shift: 0,    emit: 1, minGap: 0.7 },
};

export class DecalField {
  constructor(scene) {
    this.enabled = DECALS_DEFAULT_ENABLED; // the kill switch, per field
    // Lazy construction (Tier 0 build-time-vs-runtime): while the kill
    // switch is dark AND nothing has ever stamped, we pay ZERO atlas paint
    // (a 1024² canvas + procedural draws), ZERO VRAM upload (texture +
    // shader + instanced attributes), ZERO scene.add. Everything below
    // moves into _ensureBuilt(); tick/count/dump/clear guard on `built`.
    this._scene = scene;
    this.built = false;
    this.alive = 0;
    this.stampedTotal = 0; // monotonic; always readable
    if (this.enabled) this._ensureBuilt();
  }

  // Idempotent build: called from stamp() (first mark of the session) and
  // from enable(true). Everything the old constructor did lives here.
  _ensureBuilt() {
    if (this.built) return;
    this.built = true;
    const scene = this._scene;
    // ---- atlas ----
    const cell = 256; // marks span multiple die-widths; 128 went blocky
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = cell * CELLS;
    const x = canvas.getContext('2d');
    const rng = seededRng(0xfe17);
    for (const [kind, row] of Object.entries(KIND_ROW)) {
      for (let v = 0; v < CELLS; v++) {
        PAINTERS[KIND_ROW[kind]](x, v * cell + cell / 2, row * cell + cell / 2, cell * 0.46, rng);
      }
    }
    const atlas = new THREE.CanvasTexture(canvas);
    atlas.minFilter = THREE.LinearMipmapLinearFilter;
    atlas.magFilter = THREE.LinearFilter;

    // ---- instanced quad pool ----
    const base = new THREE.PlaneGeometry(1, 1);
    base.rotateX(-Math.PI / 2); // lie flat: XZ plane, +Y normal
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.posA = new Float32Array(MAX * 3);
    this.rotA = new Float32Array(MAX);
    this.scaleA = new Float32Array(MAX);
    this.alphaA = new Float32Array(MAX);
    this.cA = new Float32Array(MAX * 3);
    this.cB = new Float32Array(MAX * 3);
    this.cellA = new Float32Array(MAX * 2);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.posA, 3));
    g.setAttribute('iRot', new THREE.InstancedBufferAttribute(this.rotA, 1));
    g.setAttribute('iScale', new THREE.InstancedBufferAttribute(this.scaleA, 1));
    g.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(this.alphaA, 1));
    g.setAttribute('iColorA', new THREE.InstancedBufferAttribute(this.cA, 3));
    g.setAttribute('iColorB', new THREE.InstancedBufferAttribute(this.cB, 3));
    g.setAttribute('iCell', new THREE.InstancedBufferAttribute(this.cellA, 2));
    g.instanceCount = MAX;
    this.geometry = g;

    // sim state (never uploaded)
    this.age = new Float32Array(MAX);   // negative while waiting out delay
    this.life = new Float32Array(MAX);  // 0 ⇒ dead slot
    this.sizeT = new Float32Array(MAX); // target (fully grown) size
    this.aMax = new Float32Array(MAX);
    this.inT = new Float32Array(MAX);
    this.growFrom = new Float32Array(MAX);
    this.growT = new Float32Array(MAX);
    this.fadeAt = new Float32Array(MAX);
    this.shiftT = new Float32Array(MAX);
    this.b0 = new Float32Array(MAX * 3); // colorB at birth (ember)
    this.cursor = 0;
    this.kindR = new Int8Array(MAX); // atlas row per slot (minGap checks)
    // `alive` / `stampedTotal` were pre-initialised in the constructor so
    // count()/fxInfo() work in the unbuilt state; leave them alone here.

    this.material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas } },
      vertexShader: `
        attribute vec3 iPos;
        attribute float iRot;
        attribute float iScale;
        attribute float iAlpha;
        attribute vec3 iColorA;
        attribute vec3 iColorB;
        attribute vec2 iCell;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vCA;
        varying vec3 vCB;
        void main() {
          vUv = (uv + iCell) / ${CELLS}.0;
          vAlpha = iAlpha;
          vCA = iColorA;
          vCB = iColorB;
          float c = cos(iRot), s = sin(iRot);
          vec3 p = position * iScale;
          vec3 w = vec3(iPos.x + p.x * c - p.z * s, iPos.y, iPos.z + p.x * s + p.z * c);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vCA;
        varying vec3 vCB;
        void main() {
          vec4 t = texture2D(uAtlas, vUv);
          float a = t.a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(mix(vCA, vCB, t.r), a);
        }`,
      transparent: true,
      depthWrite: false, // marks never occlude; dice above still occlude them
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  // Arming path: flipping the switch ON eagerly builds so the FIRST stamp
  // doesn't pay atlas paint + shader compile + texture upload as a one-off
  // hitch. Direct writes to .enabled still work (stamp() calls
  // _ensureBuilt), but callers that route through enable() get no jank.
  enable(v) {
    this.enabled = !!v;
    if (this.enabled) this._ensureBuilt();
    return this.enabled;
  }

  // Stamp the recipe's mark at a measured contact. `at` is [x, y, z] in
  // world units — the caller supplies the surface height (main table:
  // felt + ε; lab: the drop coupon). Returns how many marks were laid
  // (the lab's honesty counter — always 0 while the kill switch is
  // off). Recipe: {kind, colors: [A, B], scale?, life?}.
  stamp(recipe, at, strength, rng = Math.random) {
    if (!this.enabled) return 0; // no mark, no count — the felt stays clean
    const kind = KINDS[recipe.kind];
    if (!kind) return 0;
    this._ensureBuilt(); // idempotent — first stamp of the session pays the atlas

    const row = KIND_ROW[recipe.kind];
    // A fresh same-kind mark already here? The bounce deepens that one.
    if (kind.minGap > 0) {
      const g2 = kind.minGap * kind.minGap;
      for (let i = 0; i < MAX; i++) {
        if (this.life[i] <= 0 || this.kindR[i] !== row || this.age[i] > 1.2) continue;
        const dx = this.posA[i * 3] - at[0];
        const dz = this.posA[i * 3 + 2] - at[2];
        if (dx * dx + dz * dz < g2) return 0;
      }
    }
    const [ca, cb] = [hexRGB(recipe.colors[0]), hexRGB(recipe.colors[1] || recipe.colors[0])];
    const sK = 0.75 + 0.45 * Math.min(strength / STRENGTH_REF, 1.3);
    let n = 0;
    for (let e = 0; e < kind.emit; e++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      if (this.life[i] <= 0) this.alive++;
      // later emissions are echoes: smaller, later, fainter (ring ripples)
      const echo = e === 0 ? 1 : 0.68;
      this.age[i] = -(kind.delay + e * 0.16);
      this.life[i] = (recipe.life || kind.life) * (0.9 + rng() * 0.2);
      this.sizeT[i] = kind.size * sK * (recipe.scale || 1) * echo * (0.9 + rng() * 0.2);
      this.aMax[i] = (recipe.alpha || 1) * echo;
      this.inT[i] = kind.in;
      this.growFrom[i] = kind.growFrom;
      this.growT[i] = kind.growT;
      this.fadeAt[i] = kind.fadeAt;
      this.shiftT[i] = kind.shift;
      this.posA[i * 3] = at[0];
      this.posA[i * 3 + 1] = at[1];
      this.posA[i * 3 + 2] = at[2];
      this.rotA[i] = rng() * Math.PI * 2;
      this.scaleA[i] = 0;
      this.alphaA[i] = 0;
      this.cA[i * 3] = ca[0]; this.cA[i * 3 + 1] = ca[1]; this.cA[i * 3 + 2] = ca[2];
      this.cB[i * 3] = cb[0]; this.cB[i * 3 + 1] = cb[1]; this.cB[i * 3 + 2] = cb[2];
      this.b0[i * 3] = cb[0]; this.b0[i * 3 + 1] = cb[1]; this.b0[i * 3 + 2] = cb[2];
      this.kindR[i] = row;
      this.cellA[i * 2] = Math.floor(rng() * CELLS);
      this.cellA[i * 2 + 1] = CELLS - 1 - row; // uv v runs bottom-up
      n++;
    }
    this.geometry.getAttribute('iPos').needsUpdate = true;
    this.geometry.getAttribute('iRot').needsUpdate = true;
    this.geometry.getAttribute('iColorA').needsUpdate = true;
    this.geometry.getAttribute('iCell').needsUpdate = true;
    this.stampedTotal += n;
    return n;
  }

  tick(dt) {
    if (!this.built || !this.alive || dt <= 0) return;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      const age = this.age[i];
      if (age < 0) continue; // still falling / still spreading toward the felt
      const life = this.life[i];
      if (age >= life) {
        this.life[i] = 0;
        this.alive--;
        this.scaleA[i] = 0;
        this.alphaA[i] = 0;
        continue;
      }
      const t = age / life;
      // grow: ease-out from growFrom to 1 across growT of life
      const gk = this.growT[i] > 0 ? Math.min(t / this.growT[i], 1) : 1;
      const grow = this.growFrom[i] + (1 - this.growFrom[i]) * (1 - (1 - gk) * (1 - gk));
      this.scaleA[i] = this.sizeT[i] * grow;
      // alpha: fast in, hold, long fade after the knee
      const aIn = this.inT[i] > 0 ? Math.min(t / this.inT[i], 1) : 1;
      const knee = this.fadeAt[i];
      const aOut = t < knee ? 1 : 1 - (t - knee) / (1 - knee);
      this.alphaA[i] = this.aMax[i] * aIn * aOut * aOut; // eases out — melting, drying, cooling
      // ember cooling: colorB slides to colorA over the shift window
      if (this.shiftT[i] > 0) {
        const k = Math.min(t / this.shiftT[i], 1);
        for (let c = 0; c < 3; c++) {
          this.cB[i * 3 + c] = this.b0[i * 3 + c] * (1 - k) + this.cA[i * 3 + c] * k;
        }
      }
    }
    this.geometry.getAttribute('iScale').needsUpdate = true;
    this.geometry.getAttribute('iAlpha').needsUpdate = true;
    this.geometry.getAttribute('iColorB').needsUpdate = true;
  }

  count() {
    return this.alive;
  }

  // Slot-level truth for diagnostics (lab's decalDump): every slot that
  // has ever lived, with its clock.
  dump() {
    if (!this.built) return { alive: 0, slots: [] };
    const slots = [];
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] > 0 || this.age[i] !== 0) {
        slots.push({
          i,
          age: +this.age[i].toFixed(2),
          life: +this.life[i].toFixed(2),
          alpha: +this.alphaA[i].toFixed(3),
          scale: +this.scaleA[i].toFixed(2),
          pos: [+this.posA[i * 3].toFixed(2), +this.posA[i * 3 + 1].toFixed(2), +this.posA[i * 3 + 2].toFixed(2)],
          colorA: [+this.cA[i * 3].toFixed(2), +this.cA[i * 3 + 1].toFixed(2), +this.cA[i * 3 + 2].toFixed(2)],
          cell: [this.cellA[i * 2], this.cellA[i * 2 + 1]],
        });
      }
    }
    return { alive: this.alive, slots };
  }

  // Drop every live mark at once (the lab rig, when its felt coupon
  // leaves). The main table never needs this — its felt is permanent and
  // marks fade on their own clock.
  clear() {
    if (!this.built) return;
    for (let i = 0; i < MAX; i++) {
      this.life[i] = 0;
      this.alphaA[i] = 0;
      this.scaleA[i] = 0;
    }
    this.alive = 0;
    this.geometry.getAttribute('iScale').needsUpdate = true;
    this.geometry.getAttribute('iAlpha').needsUpdate = true;
  }
}
