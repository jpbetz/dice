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

// js/dielights.js — Level 4b of the effects ladder (docs/THEMES.md): a
// COLORED LIGHT PARENTED TO THE DIE. A biolume die casts teal on its
// patch of felt; molten iron breathes warm; a charged die flickers; and
// Umbra pools local shadow (a negative-intensity white light — it
// subtracts evenly, which is exactly what a shadow does).
//
// The pool is FIXED SIZE and every light lives in the scene from boot at
// intensity 0: three.js recompiles every lit program when the light COUNT
// changes, and a recompile stutter mid-tumble is worse than any glow is
// good. Attach/steal only ever changes uniforms. The budget doubles as
// restraint: at most `max` dice glow at once, newest roll first (steal
// the oldest — the fresh throw is where the eyes are).
//
// The light sits at the die's CENTER and none of these lights cast
// shadows, so the glow passes through the body and pools on the felt
// beneath — lit from within, which is the claim every glowing set makes.

import * as THREE from 'three';

const fract = (v) => v - Math.floor(v);

export class DieLightRig {
  constructor(scene, { max = 4 } = {}) {
    this.slots = [];
    for (let i = 0; i < max; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 6, 2);
      scene.add(light); // permanent: constant light count, zero recompiles
      this.slots.push({ light, mesh: null, recipe: null, seq: 0, phase: 0, warm: 0, dying: 0 });
    }
    this.seq = 1;
  }

  // Attach the recipe's glow to a die mesh. Re-attaching the same mesh
  // refreshes it; a full pool steals the OLDEST attachment. rng seeds the
  // envelope phase (a seeded roll flickers identically on every client).
  attach(mesh, recipe, rng = Math.random) {
    if (!mesh || !recipe) return false;
    let slot = this.slots.find((s) => s.mesh === mesh)
      || this.slots.find((s) => !s.mesh)
      || this.slots.reduce((a, b) => (a.seq <= b.seq ? a : b));
    slot.mesh = mesh;
    slot.recipe = recipe;
    slot.seq = this.seq++;
    slot.phase = rng() * Math.PI * 2;
    slot.warm = 0;
    slot.dying = 0;
    slot.light.color.set(recipe.color || '#ffffff');
    slot.light.distance = recipe.range || 6;
    return true;
  }

  // Begin a quick fade-out for this mesh's light (idempotent, unknown
  // meshes ignored). The slot frees itself when the fade lands.
  release(mesh) {
    for (const s of this.slots) {
      if (s.mesh === mesh && !s.dying) s.dying = 1e-6;
    }
  }

  releaseAll() {
    for (const s of this.slots) {
      if (s.mesh && !s.dying) s.dying = 1e-6;
    }
  }

  tick(dt, time) {
    for (const s of this.slots) {
      if (!s.mesh) continue;
      // self-heal: a mesh that left the scene takes its glow with it, no
      // matter which removal path forgot to call release()
      if (!s.mesh.parent) {
        s.mesh = null;
        s.light.intensity = 0;
        continue;
      }
      s.light.position.copy(s.mesh.position);
      s.warm = Math.min(s.warm + dt / 0.35, 1); // ignite, don't pop on
      let fade = 1;
      if (s.dying) {
        s.dying += dt;
        fade = 1 - Math.min(s.dying / 0.3, 1);
        if (fade <= 0) {
          s.mesh = null;
          s.light.intensity = 0;
          continue;
        }
      }
      const r = s.recipe;
      let m = 1;
      switch (r.mode) {
        case 'flicker': { // charge seeking a path: stepped value noise
          const step = Math.floor(time * 22) + s.phase * 100;
          m = 0.45 + 0.75 * fract(Math.sin(step * 12.9898) * 43758.5453);
          break;
        }
        case 'breathe': // molten iron at rest
          m = 0.82 + 0.18 * Math.sin(time * 1.3 + s.phase);
          break;
        case 'wave': // biolume: slow, deep, tidal
          m = 0.62 + 0.38 * Math.sin(time * 0.9 + s.phase);
          break;
        default: // steady containment hum
          m = 1;
      }
      s.light.intensity = (r.intensity != null ? r.intensity : 10) * m * s.warm * fade;
    }
  }

  // For tests: what is lit right now.
  info() {
    return this.slots
      .filter((s) => s.mesh && !s.dying)
      .map((s) => ({ seq: s.seq, mode: s.recipe.mode || 'steady', intensity: s.light.intensity }));
  }
}
