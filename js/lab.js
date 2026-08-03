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

// js/lab.js — THE DICE LAB (Tier 6 §9): every theme × every die type in
// one grid, with per-theme effect triggers. Dev chrome only; the main app
// imports nothing from here. Effects are PROTOTYPES of the signature
// effects in docs/THEMES.md — each names its cause — kept cheap (light,
// material and transform animation only; no particles yet).

import * as THREE from 'three';
import { DIE_TYPES, createDieMesh, valueRange, faceNormalForValue } from './dice.js';
import { THEMES, SETS, SET_IDS } from './themes.js';

const ROWS = ['std', ...SET_IDS];
const COL_STEP = 2.5;
const ROW_STEP = 2.5;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
const key = new THREE.DirectionalLight(0xffffff, 1.15);
key.position.set(3, 5, 7);
const fill = new THREE.PointLight(0xfff2d0, 0.35, 0, 2);
fill.position.set(-6, -4, 8);
scene.add(ambient, key, fill);

const ENVS = {
  table: { label: '☀ env: table', amb: 0.55, key: 1.15, bg: 0x14100c },
  dusk:  { label: '🌆 env: dusk',  amb: 0.28, key: 0.7,  bg: 0x0d0a08 },
  dark:  { label: '🌑 env: dark',  amb: 0.1,  key: 0.32, bg: 0x060504 },
};
let envName = 'table';
function applyEnv(name) {
  const e = ENVS[name] || ENVS.table;
  envName = name;
  ambient.intensity = e.amb;
  key.intensity = e.key;
  scene.background = new THREE.Color(e.bg);
  document.getElementById('env').textContent = e.label;
}
applyEnv('table');

// ---------------------------------------------------------------------------
// The grid — hero-ish pose (max face toward camera), one row per theme
// ---------------------------------------------------------------------------

const rows = []; // {id, label, meshes: [{mesh, baseY, baseX}], spin: true}
const gridW = (DIE_TYPES.length - 1) * COL_STEP;
const gridH = (ROWS.length - 1) * ROW_STEP;

ROWS.forEach((id, r) => {
  const y = gridH / 2 - r * ROW_STEP;
  const meshes = [];
  DIE_TYPES.forEach((type, c) => {
    const mesh = createDieMesh(type, id === 'std' ? 'std' : id);
    const x = -gridW / 2 + c * COL_STEP;
    mesh.position.set(x, y, 0);
    // Two headless-renderer defenses (the lab builds ~800 canvas textures;
    // the probe proved every SOURCE canvas correct while some faces still
    // rendered solid white — deterministic, so a SwiftShader upload/mipmap
    // artifact, not canvas blanking): skip mipmap generation entirely and
    // pin each texture to the GPU at build time.
    mesh.material.forEach((m) => {
      for (const t of [m.map, m.emissiveMap, m.normalMap, m.roughnessMap]) {
        if (!t) continue;
        t.generateMipmaps = false;
        t.minFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        renderer.initTexture(t);
      }
    });
    const [, max] = valueRange(type);
    const n = faceNormalForValue(type, max);
    if (n) mesh.quaternion.setFromUnitVectors(n.normalize(), new THREE.Vector3(0.25, 0.35, 1).normalize());
    // Break the mirror: the pure hero pose points every max face at the
    // SAME direction, and for glossy themes that direction mirrored the
    // key light into the camera — flat d6/d8 faces speculared to solid
    // white (probe4: physics, not corruption; unlit renders were fine).
    mesh.rotateY(0.22);
    mesh.rotateX(-0.12);
    // remember the resting emissive so effects can always find home
    mesh.material.forEach((m) => {
      m.userData.baseEmissive = m.emissive ? m.emissive.clone() : new THREE.Color(0x000000);
      m.userData.baseEmissiveIntensity = m.emissiveIntensity ?? 0;
      m.userData.baseColor = m.color.clone();
      m.userData.baseRough = m.roughness;
    });
    scene.add(mesh);
    meshes.push({ mesh, baseX: x, baseY: y, phase: c * 0.7 });
  });
  rows.push({ id, recipe: id === 'std' ? null : SETS[id],
    label: id === 'std' ? 'Standard (today)' : `${SETS[id].houseLabel} · ${SETS[id].label}`,
    meshes, spin: true, spinHold: 0 });
  // Warm-up render per ROW: pushing ~550 canvas-texture uploads through
  // SwiftShader in one first frame deterministically dropped two of them
  // (the material's default WHITE base color showed — probe2). Spreading
  // uploads keeps every upload under the renderer's happy ceiling.
  renderer.render(scene, camera);
});

function frameCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  const fitH = (gridH / 2 + 2.2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitW = (gridW / 2 + 3.4) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / aspect;
  camera.position.set(0, 0, Math.max(fitH, fitW));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', frameCamera);
frameCamera();

// ---------------------------------------------------------------------------
// Effects — prototypes of the THEMES.md signatures; each names its cause
// ---------------------------------------------------------------------------

const active = []; // {t0, dur, step(k), done()}
function run(dur, step, done) {
  active.push({ t0: performance.now(), dur, step, done });
}
const easeOut = (k) => 1 - (1 - k) * (1 - k);

function rowMaterials(row) {
  const out = [];
  for (const c of row.meshes) for (const m of c.mesh.material) out.push(m);
  return out;
}

const EFFECTS = {
  // lightning grounds through the table: one white pop + a 2px camera jolt
  flash(row) {
    const light = new THREE.PointLight(0xffffff, 0, 30, 2);
    const y = row.meshes[0].baseY;
    light.position.set(0, y, 3);
    scene.add(light);
    run(180, (k) => {
      light.intensity = 10 * (1 - k);
      camera.position.x = (Math.random() - 0.5) * 0.06 * (1 - k);
    }, () => { scene.remove(light); camera.position.x = 0; });
  },
  // mass arrives: one decisive drop-and-stop, no elastic wobble
  slam(row) {
    run(200, (k) => {
      const dip = k < 0.3 ? (k / 0.3) : 1 - easeOut((k - 0.3) / 0.7);
      for (const c of row.meshes) c.mesh.position.y = c.baseY - 0.3 * dip;
      camera.position.y = -0.08 * dip;
    }, () => {
      for (const c of row.meshes) c.mesh.position.y = c.baseY;
      camera.position.y = 0;
    });
  },
  // agitation feeds the fire / the charge releases: internal glow surges
  glow(row) {
    const mats = rowMaterials(row);
    const accent = row.recipe && (row.recipe.glow || (row.recipe.maps && row.recipe.maps.digitGlow))
      ? null // themed glow: surge what the set already carries
      : new THREE.Color(row.recipe ? row.recipe.accent : '#ffd766');
    run(900, (k) => {
      const s = k < 0.25 ? easeOut(k / 0.25) : 1 - (k - 0.25) / 0.75;
      for (const m of mats) {
        if (accent) m.emissive.copy(accent);
        m.emissiveIntensity = m.userData.baseEmissiveIntensity + s * 0.6;
      }
    }, () => {
      for (const m of mats) {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = m.userData.baseEmissiveIntensity;
      }
    });
  },
  // cold arrests motion: an icy cast, the surface goes glassy, spin stops
  freeze(row) {
    const mats = rowMaterials(row);
    const ice = new THREE.Color('#a8d8f0');
    row.spinHold = performance.now() + 1400;
    run(1000, (k) => {
      const s = k < 0.3 ? easeOut(k / 0.3) : k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      for (const m of mats) {
        m.color.copy(m.userData.baseColor).lerp(ice, 0.35 * s);
        m.roughness = m.userData.baseRough + (0.05 - m.userData.baseRough) * s;
      }
    }, () => {
      for (const m of mats) {
        m.color.copy(m.userData.baseColor);
        m.roughness = m.userData.baseRough;
      }
    });
  },
  // it eats light: the ENVIRONMENT dims instead of the die flashing
  dim() {
    const a0 = ambient.intensity;
    const k0 = key.intensity;
    run(340, (k) => {
      const s = k < 0.3 ? easeOut(k / 0.3) : 1 - (k - 0.3) / 0.7;
      ambient.intensity = a0 * (1 - 0.7 * s);
      key.intensity = k0 * (1 - 0.7 * s);
    }, () => { ambient.intensity = a0; key.intensity = k0; });
  },
  // nothing underwater sits still: an out-of-phase swell through the row
  swell(row) {
    run(1600, (k) => {
      for (const c of row.meshes) {
        c.mesh.position.y = c.baseY + Math.sin(k * Math.PI * 2 + c.phase) * 0.14 * (1 - k * 0.4);
      }
    }, () => {
      for (const c of row.meshes) c.mesh.position.y = c.baseY;
    });
  },
};

// ---------------------------------------------------------------------------
// Sidebar + toolbar
// ---------------------------------------------------------------------------

const side = document.getElementById('side');
const sideNames = []; // every set's clickable name (zoom toggles)
let lastHouse = null;
for (const row of rows) {
  const box = document.createElement('div');
  box.className = 'theme';
  // house header once per house (a THEME is a HOUSE holding several SETS)
  if (row.recipe && row.recipe.house !== lastHouse) {
    lastHouse = row.recipe.house;
    const hh = document.createElement('div');
    hh.className = 't-house';
    hh.textContent = THEMES[row.recipe.house].label;
    const hl = document.createElement('div');
    hl.className = 't-line';
    hl.textContent = THEMES[row.recipe.house].line;
    side.append(hh, hl);
  }
  const name = document.createElement('div');
  name.className = 't-name';
  name.textContent = row.recipe ? row.recipe.label : row.label;
  name.title = 'Click: zoom this set close (click again for the full grid)';
  let zoomed = false;
  name.addEventListener('click', () => {
    // one zoomed row at a time; the name is the toggle
    document.querySelectorAll('.t-name.zoomed').forEach((el) => el.classList.remove('zoomed'));
    zoomed = !zoomed && window.__lab.zoomRow(row.id) !== false;
    if (zoomed) name.classList.add('zoomed');
    else window.__lab.zoomRow(null);
    for (const other of sideNames) if (other !== name) other.zoomedReset && other.zoomedReset();
    name.zoomedReset = () => { zoomed = false; };
  });
  sideNames.push(name);
  box.appendChild(name);
  if (row.recipe) {
    const t = row.recipe;
    name.style.color = t.text;
    const sw = document.createElement('div');
    sw.className = 'swatches';
    for (const c of [t.body, t.text, t.accent, t.glow ? t.glow.color : null]) {
      if (!c) continue;
      const i = document.createElement('i');
      i.style.background = c;
      i.title = c;
      sw.appendChild(i);
    }
    box.appendChild(sw);
  }
  const fx = document.createElement('div');
  fx.className = 'fx';
  for (const [id, label] of [['flash', '⚡ pop'], ['slam', '🔨 slam'], ['glow', '✨ glow'],
    ['freeze', '❄ freeze'], ['dim', '🌑 recoil'], ['swell', '🌊 swell']]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => EFFECTS[id](row));
    fx.appendChild(b);
  }
  box.appendChild(fx);
  side.appendChild(box);
}

let rotate = true;
document.getElementById('rotate').addEventListener('click', (e) => {
  rotate = !rotate;
  e.currentTarget.textContent = `⟳ rotate: ${rotate ? 'on' : 'off'}`;
});
document.getElementById('env').addEventListener('click', () => {
  const names = Object.keys(ENVS);
  applyEnv(names[(names.indexOf(envName) + 1) % names.length]);
});
document.getElementById('shot').addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `dice-lab-${envName}.png`;
  a.click();
});

// ---------------------------------------------------------------------------
// Loop + the headless driver's API (tools/lab-shots.mjs)
// ---------------------------------------------------------------------------

let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (rotate) {
    for (const row of rows) {
      if (row.spinHold > now) continue; // a frozen row holds its pose
      for (const c of row.meshes) c.mesh.rotation.y += dt * 0.45;
    }
  }
  for (let i = active.length - 1; i >= 0; i--) {
    const fx = active[i];
    const k = Math.min((now - fx.t0) / fx.dur, 1);
    fx.step(k);
    if (k >= 1) { fx.done && fx.done(); active.splice(i, 1); }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.__labRows = rows; // dev-only: the shots rig's diagnostics reach in

// diagnostic sampler: for die column `idx`, project every row's mesh to
// screen and average a small framebuffer patch there — ties a WHITE render
// to the actual mesh/theme it belongs to (dev tooling for the shots rig).
window.__labSample = (idx) => {
  renderer.render(scene, camera);
  const c2 = document.createElement('canvas');
  const src = renderer.domElement;
  c2.width = src.width; c2.height = src.height;
  const ctx = c2.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const out = {};
  for (const row of rows) {
    const cell = row.meshes[idx];
    const v = cell.mesh.position.clone().project(camera);
    const px = Math.round((v.x * 0.5 + 0.5) * src.width);
    const py = Math.round((-v.y * 0.5 + 0.5) * src.height);
    const d = ctx.getImageData(px - 8, py - 8, 16, 16).data;
    let r = 0, g = 0, b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    out[row.id] = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }
  return out;
};

window.__lab = {
  ready: true,
  rows: rows.map((r) => r.id),
  setRotate(on) { rotate = !!on; },
  setEnv(name) { applyEnv(name); },
  // Frame ONE row close (null = the full grid) — the detail view where
  // Level 1 relief and digit glow get judged.
  zoomRow(id) {
    if (!id) { frameCamera(); return true; }
    const row = rows.find((r) => r.id === id);
    if (!row) return false;
    // CLOSE: ~3 dice fill the frame (relief and digit glow are judged at
    // reading distance, not from across the table) — centered on the
    // d10x/d12/d20 end where the faces are biggest.
    const y = row.meshes[0].baseY;
    const cx = row.meshes[4].baseX;
    camera.position.set(cx, y, 7.2);
    camera.lookAt(cx, y, 0);
    camera.updateProjectionMatrix();
    return true;
  },
  effect(rowId, fxId) {
    const row = rows.find((r) => r.id === rowId);
    if (!row || !EFFECTS[fxId]) return false;
    EFFECTS[fxId](row);
    return true;
  },
  effectsActive() { return active.length; },
  // diagnostic: average RGB of each face texture's SOURCE canvas for one
  // die — separates "the canvas was drawn wrong" from "the GPU upload
  // went wrong" when a face renders solid white.
  faceDump(rowId, dieIndex) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return null;
    const mesh = row.meshes[dieIndex].mesh;
    return mesh.material.map((m) => {
      if (!m.map || !m.map.image || !m.map.image.getContext) return { map: false };
      const c = m.map.image;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let r = 0, g = 0, b = 0;
      const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      return { map: true, avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] };
    });
  },
};
