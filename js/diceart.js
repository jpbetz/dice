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

// Die art: still renders of each die type's real beveled mesh, as dataURLs,
// for chrome that shows *the dice themselves* as clickable objects (P1 — the
// dice are the buttons; a tile is die art, not an abstract diamond). Since
// Tier 6 §9 the bakery is themed: art is keyed (type, variant), so a chip is
// a portrait of the die IN ITS SET — molten digits, glass, bone wear — not a
// tint of a generic die. Identity here is material, not hue; the mesh
// factory already knows how to dress a die, so the bakery just asks it.
//
// One offscreen WebGLRenderer per VARIANT warm: the first request for a
// variant bakes all seven types synchronously (~tens of ms), then releases
// its GL context — set changes are rare, and the app's table renderer keeps
// the browser's context budget to itself between warms. Art can never gate
// function: if context creation fails (headless without GL, exhausted
// contexts), dieArtURL returns null and callers keep their non-art look, and
// a themed slot that failed to bake falls back to std art rather than none.
// (No reflection environment in the bake — std always shipped env-free, all
// variants stay consistent, and at 26-34px CSS the material read survives.)

import * as THREE from 'three';
import { createDieMesh, DIE_TYPES, faceNormalForValue, valueRange, getDie } from './dice.js';
import { SETS } from './themes.js';

// 2x the ~26-30px CSS display size, so tiles stay crisp on retina.
const SIZE = 192;

// Hero pose: the max-value face turns toward up-right-of-camera — the numeral
// stays readable, which is what tells d10/d12/d20 apart at tile size.
const HERO_DIR = new THREE.Vector3(0.25, 0.55, 1).normalize();

const cache = new Map(); // `${variant}/${type}` -> dataURL string | null
const warmedVariants = new Set();

// The numeral's "up" direction in body space for the max-value FACE (null for
// d4, whose values sit on vertices, three numerals per face). Mirrors the
// upDir rules dice.js paints with, expressed on the face record getDie
// exposes: d10-family numerals point at the pole corner; triangle faces
// (d8/d20) point at the vertex opposite edge 0-1; d6/d12 use the face basis'
// +v. Without this, the minimal setFromUnitVectors pose leaves numerals at
// arbitrary spin — an upside-down 6̲ reads as 9̅, defeating the hero pose's
// whole point (the numeral is what disambiguates types at tile size).
function numeralUpForMax(type) {
  const die = getDie(type);
  const [, max] = valueRange(type);
  const f = die.faces.find((x) => x.value === max);
  if (!f) return null; // d4
  let up2 = new THREE.Vector2(0, 1);
  if (type === 'd10' || type === 'd10x') {
    const pole = f.boundary.reduce((a, b) => (Math.abs(b.z) > Math.abs(a.z) ? b : a));
    const d = new THREE.Vector3().subVectors(pole, f.centroid);
    up2 = new THREE.Vector2(d.dot(f.u), d.dot(f.v));
  } else if (f.boundary.length === 3 && f.boundary2d[2].y < f.boundary2d[0].y) {
    up2 = new THREE.Vector2(0, -1);
  }
  return new THREE.Vector3()
    .addScaledVector(f.u, up2.x)
    .addScaledVector(f.v, up2.y)
    .normalize();
}

// Cached dataURL of `type`'s beveled mesh wearing `variant` (192x192,
// transparent background), or null when WebGL was unavailable. Warms the
// whole variant synchronously on first request. Unknown variants normalize
// to std — a stale saved set id must not cost a GL context — and 'shroud'
// is legal: the log dresses hidden entries in obsidian.
export function dieArtURL(type, variant = 'std') {
  const v = variant === 'shroud' || (typeof variant === 'string' && SETS[variant]) ? variant : 'std';
  if (!warmedVariants.has(v)) warmVariant(v);
  return cache.get(`${v}/${type}`) ?? cache.get(`std/${type}`) ?? null;
}

// DROP ONE VARIANT'S PORTRAITS (developer mode phase D2, 2026-09-03). The
// bakery is a cache keyed by (variant, type) and it exists because a set
// change is RARE: the first request for a variant bakes all seven types and
// releases its GL context. The sets editor makes a set change frequent — a
// dragged slider is a new recipe every 140 ms — and every one of those leaves
// the tiles showing a portrait of the die as it was, beside a felt showing the
// die as it is. Nothing else in the app has ever needed this: the app cannot
// edit a recipe, so a variant's art was true for the life of the tab.
//
// `warmedVariants` goes with the entries, or `dieArtURL` would answer from a
// cache it believes is warm and never re-bake. Returns how many portraits were
// dropped, which is 0 for a variant nobody has looked at yet.
export function bustArt(variant) {
  if (typeof variant !== 'string') return 0;
  warmedVariants.delete(variant);
  let n = 0;
  for (const t of DIE_TYPES) if (cache.delete(`${variant}/${t}`)) n++;
  return n;
}

function warmVariant(variant) {
  warmedVariants.add(variant);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    for (const t of DIE_TYPES) cache.set(`${variant}/${t}`, null); // no GL — callers fall back
    return;
  }
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0); // transparent — the tile supplies chrome
    // Match the table's grade so tile art and thrown dice read as the same
    // objects (main.js uses the same tone mapping over the felt).
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 4, 3.5); // upper-right key, agreeing with HERO_DIR
    scene.add(key);

    const fov = 32;
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 50);

    for (const type of DIE_TYPES) {
      try {
        const mesh = createDieMesh(type, variant); // shared cached geometry/materials — never disposed here
        // Pose: rotate the die so its max-value face normal points along
        // HERO_DIR (for d4, the max-value vertex direction — same intent:
        // the biggest numeral faces the viewer).
        const [, max] = valueRange(type);
        const n = faceNormalForValue(type, max);
        if (n) {
          mesh.quaternion.setFromUnitVectors(n.normalize(), HERO_DIR);
          // Second constraint: spin about HERO_DIR until the numeral's up
          // direction is as close to screen-up as the tilted pose allows.
          const upBody = numeralUpForMax(type);
          if (upBody) {
            const cur = upBody.applyQuaternion(mesh.quaternion); // ⊥ HERO_DIR (upBody ⊥ n)
            const tgt = new THREE.Vector3(0, 1, 0)
              .addScaledVector(HERO_DIR, -HERO_DIR.y) // screen-up projected ⊥ HERO_DIR
              .normalize();
            const theta = Math.atan2(new THREE.Vector3().crossVectors(cur, tgt).dot(HERO_DIR), cur.dot(tgt));
            mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(HERO_DIR, theta));
          }
        }
        scene.add(mesh);

        // Frame by bounding sphere so every type fills the tile equally.
        mesh.geometry.computeBoundingSphere();
        const r = mesh.geometry.boundingSphere.radius;
        camera.position.set(0, 0, (r / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 1.02);
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
        // Read back IN THE SAME TASK as the render: preserveDrawingBuffer is
        // false, so the buffer is only guaranteed until this task yields.
        cache.set(`${variant}/${type}`, renderer.domElement.toDataURL());
        scene.remove(mesh);
      } catch {
        cache.set(`${variant}/${type}`, null);
      }
    }
  } catch {
    /* fall through to the null fill below */
  } finally {
    for (const t of DIE_TYPES) if (!cache.has(`${variant}/${t}`)) cache.set(`${variant}/${t}`, null);
    // Give the context back — the art now lives entirely in the dataURLs.
    try { renderer.dispose(); renderer.forceContextLoss(); } catch { /* already lost */ }
  }
}
