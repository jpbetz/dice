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
// One requested portrait per bake. Visible UI schedules those requests between
// frames; synchronous access remains for offline portrait tools and debugging.
// A batch shares one offscreen renderer, released when it drains (or after a
// short idle timeout for direct callers). No hidden catalogue warm-up.

import * as THREE from 'three';
import { createDieMesh, DIE_TYPES, faceNormalForValue, valueRange, getDie } from './dice.js';
import { SETS } from './themes.js';

// Large enough for the palette, draft chips and offline gallery portraits.
const SIZE = 192;

// Hero pose: the max-value face turns toward up-right-of-camera — the numeral
// stays readable, which is what tells d10/d12/d20 apart at tile size.
const HERO_DIR = new THREE.Vector3(0.25, 0.55, 1).normalize();

const cache = new Map(); // `${variant}/${type}` -> dataURL string | null
const revisions = new Map();
let studio = null, releaseTimer = null, renders = 0, contexts = 0;
const normalized = variant => variant === 'shroud' || (typeof variant === 'string' && SETS[variant]) ? variant : 'std';

export function dieArtKey(type, variant = 'std') {
  const v = normalized(variant);
  return `${v}/${type}@${revisions.get(v) || 0}`;
}
export function cachedDieArt(type, variant = 'std') {
  const key = `${normalized(variant)}/${type}`;
  return cache.has(key) ? cache.get(key) ?? cache.get(`std/${type}`) ?? null : undefined;
}
export function dieArtInfo() {
  return {keys:[...cache.keys()], renders, contexts, rendererActive:!!studio};
}
export function releaseDieArtRenderer() {
  clearTimeout(releaseTimer); releaseTimer = null;
  if (!studio) return;
  const {renderer} = studio; studio = null;
  try { renderer.dispose(); renderer.forceContextLoss(); } catch { /* already lost */ }
}

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

// Cached portrait, or null when GL fails. A single d6 request never builds
// unrelated dice. Unknown variants retain the standard fallback.
export function dieArtURL(type, variant = 'std') {
  if (!DIE_TYPES.includes(type)) return null;
  const v = normalized(variant), key = `${v}/${type}`;
  if (!cache.has(key)) {
    try { cache.set(key, renderPortrait(type, v)); }
    catch { cache.set(key, null); }
    if (studio) {
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(releaseDieArtRenderer, 250);
    }
  }
  return cachedDieArt(type, v);
}

// A recipe edit invalidates its portraits and the keys held by pending UI.
export function bustArt(variant) {
  if (typeof variant !== 'string') return 0;
  revisions.set(variant, (revisions.get(variant) || 0) + 1);
  let n = 0;
  for (const t of DIE_TYPES) if (cache.delete(`${variant}/${t}`)) n++;
  return n;
}

function getStudio() {
  if (studio) return studio;
  const renderer = new THREE.WebGLRenderer({alpha:true, antialias:true});
  contexts++;
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 4, 3.5); scene.add(key);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    studio = {renderer, scene, camera};
    return studio;
  } catch (error) {
    renderer.dispose(); renderer.forceContextLoss(); throw error;
  }
}

function renderPortrait(type, variant) {
  const {renderer, scene, camera} = getStudio();
  // Geometry/materials belong to the shared die factory, never this renderer.
  const mesh = createDieMesh(type, variant);
  try {
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
    camera.position.set(0, 0, (r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.02);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    // Read back IN THE SAME TASK as the render: preserveDrawingBuffer is
    // false, so the buffer is only guaranteed until this task yields.
    renders++;
    return renderer.domElement.toDataURL();

  } finally { scene.remove(mesh); }
}
