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
// effects in docs/THEMES.md — each names its cause: light, material and
// transform animation (Levels 1-2) plus Level 3's impact-keyed particles,
// proven honest by the DROP RIG — a real cannon-es die whose measured
// contacts fire the set's bursts.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DIE_TYPES, createDieMesh, createDieBody, valueRange, faceNormalForValue, SHADER_TIME, PATTERN_IDS, bustDie } from './dice.js';
import { THEMES, SETS, SET_IDS, registerSet } from './themes.js';
import { ParticleField } from './particles.js';
import { DecalField } from './decals.js';
import { DieLightRig } from './dielights.js';
import { PostStack } from './post.js';

// ---------------------------------------------------------------------------
// THE GEO BENCH + THE SET BUILDER (softer edges Tier 0, Joe 2026-08-04)
// ---------------------------------------------------------------------------
// Bench rows sweep the Level 3.5 `geo` space over OTHERWISE-STANDARD dice
// (no body/text → std per-type colors; no house → std finish), seated right
// under the std row so edge treatments are judged side by side. 'lab.*'
// ids are page-local (themes.js registerSet): the published picker list
// never sees them.
const BENCH = [
  ['lab.cut030',   'Cut .030 — machined',                 { bevel: 0.03 }],
  ['lab.cut090',   'Cut .090 — wide chamfer',             { bevel: 0.09 }],
  ['lab.round055', 'Round .055 — today\'s width, filleted', { bevel: 0.055, profile: 'round' }],
  ['lab.round090', 'Round .090 — the soft candidate',     { bevel: 0.09, profile: 'round' }],
  ['lab.selfink',  'Round .090 · ink .04 — self-colored', { bevel: 0.09, profile: 'round', ink: 0.04 }],
  ['lab.round130', 'Round .130 — the recipe ceiling',     { bevel: 0.13, profile: 'round' }],
  ['lab.pillow',   'Round .090 + pillow .35',             { bevel: 0.09, profile: 'round', pillow: 0.35 }],
  ['lab.tumbled',  'Round .110 + wear .25 + pillow .20',  { bevel: 0.11, profile: 'round', wear: 0.25, pillow: 0.2 }],
  ['lab.pocked',   'Round .120 + wear .45 + nicks 3',     { bevel: 0.12, profile: 'round', wear: 0.45, pillow: 0.3, nicks: 3 }],
];
for (const [id, label, geo] of BENCH) registerSet(id, { label, geo });
const BENCH_IDS = BENCH.map(([id]) => id);

// The builder's working state: a superset of a themes.js recipe with
// explicit enables, so a knob keeps its last value while toggled off.
// The band-ink default rides the profile (.25 cut / .12 round) — the
// builder snaps the ink slider between them when the profile flips, so a
// recipe stays omit-at-default unless the user actually moved it.
const INK_DEFAULT = (profile) => (profile === 'round' ? 0.12 : 0.25);
const B_DEFAULTS = () => ({
  stdColors: true, body: '#2e6f9e', text: '#f7edda', accent: '#ffd766',
  geo: { bevel: 0.055, profile: 'cut', segments: 3, ink: 0.25, tint: '#000000', wear: 0, pillow: 0, nicks: 0 },
  feel: { rough: 0.3, metal: 0.1 },
  spec: { envMapIntensity: 0.35, clearcoat: 0, clearcoatRoughness: 0.5, ior: 1.5,
    iridescence: 0, iridescenceIOR: 1.3, specularIntensity: 1, specularColor: '#ffffff' },
  glowOn: false, glow: { color: '#ffd766', intensity: 0.15 },
  relief: { pattern: 'none', strength: 0.5, tint: 0.4, digitDepth: 0 },
  roughPattern: 'none',
  digitGlowOn: false, digitGlow: { color: '#9ce0ff', intensity: 0.8 },
  glyph: 'none',
  carry: {}, // non-tunable sections a seed brought along (shader, particles, …)
});
let bState = B_DEFAULTS();

// Collapse the state into a themes.js-shaped recipe: knobs at their
// defaults are OMITTED, so the copy-out JSON reads like a real entry.
function assembleRecipe(s) {
  const r = { label: 'Builder', house: 'lab', accent: s.accent };
  if (!s.stdColors) { r.body = s.body; r.text = s.text; }
  const g = { bevel: s.geo.bevel };
  if (s.geo.profile === 'round') {
    g.profile = 'round';
    if (s.geo.segments !== 3) g.segments = s.geo.segments;
  }
  if (s.geo.ink !== INK_DEFAULT(s.geo.profile)) g.ink = s.geo.ink;
  if (s.geo.tint && s.geo.tint !== '#000000') g.tint = s.geo.tint;
  if (s.geo.wear > 0) g.wear = s.geo.wear;
  if (s.geo.pillow > 0) g.pillow = s.geo.pillow;
  if (s.geo.nicks > 0) g.nicks = s.geo.nicks;
  r.geo = g;
  r.feel = { rough: s.feel.rough, metal: s.feel.metal };
  const sp = { envMapIntensity: s.spec.envMapIntensity };
  if (s.spec.clearcoat > 0) { sp.clearcoat = s.spec.clearcoat; sp.clearcoatRoughness = s.spec.clearcoatRoughness; }
  if (s.spec.ior !== 1.5) sp.ior = s.spec.ior;
  if (s.spec.iridescence > 0) { sp.iridescence = s.spec.iridescence; sp.iridescenceIOR = s.spec.iridescenceIOR; }
  if (s.spec.specularIntensity !== 1) sp.specularIntensity = s.spec.specularIntensity;
  if (s.spec.specularColor !== '#ffffff') sp.specularColor = s.spec.specularColor;
  r.spec = sp;
  if (s.glowOn) r.glow = { color: s.glow.color, intensity: s.glow.intensity };
  const maps = {};
  if (s.relief.pattern !== 'none') {
    maps.relief = { pattern: s.relief.pattern, strength: s.relief.strength, tint: s.relief.tint };
    if (s.relief.digitDepth > 0) maps.relief.digitDepth = s.relief.digitDepth;
  }
  if (s.roughPattern !== 'none') maps.roughPattern = s.roughPattern;
  if (s.digitGlowOn) maps.digitGlow = { color: s.digitGlow.color, intensity: s.digitGlow.intensity };
  if (Object.keys(maps).length) r.maps = maps;
  if (s.glyph !== 'none') r.glyph = s.glyph;
  Object.assign(r, s.carry); // shader/particles/… ride along from a seed
  return r;
}
registerSet('lab.builder', assembleRecipe(bState));

const ROWS = ['std', ...BENCH_IDS, 'lab.builder', ...SET_IDS];
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
// Every framing helper aims here, so the wheel can dolly toward whatever
// the camera is currently studying.
const camTarget = new THREE.Vector3();

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
const key = new THREE.DirectionalLight(0xffffff, 1.15);
key.position.set(3, 5, 7);
const fill = new THREE.PointLight(0xfff2d0, 0.35, 0, 2);
fill.position.set(-6, -4, 8);
scene.add(ambient, key, fill);

// A procedural reflection environment (PMREM from a painted equirect):
// without one, glossy sets had NOTHING to reflect but three analytic
// lights — lacquer, ice and crystal read flat. A soft graded sky, a dark
// floor and two bright strip-lights give speculars something to grab.
{
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3a3630');
  g.addColorStop(0.55, '#171310');
  g.addColorStop(0.62, '#0a0806');
  g.addColorStop(1, '#050403');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#fff3d8';
  x.fillRect(70, 28, 120, 18);   // key strip
  x.fillStyle = '#8fb4d8';
  x.fillRect(330, 44, 80, 12);   // cool counter-strip
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
}

// Level 3: one particle pool for the whole lab (js/particles.js). Bursts
// come from the drop rig's measured contacts and the unmake burn's wisps.
const field = new ParticleField(scene);

// Level 4: the marks a set leaves on the felt (js/decals.js) and the glow
// a die carries (js/dielights.js). Both demo through the drop rig — the
// rig's coupon is the felt they act on. Budget of 2 lights: it's a rig.
// Marks ship dark everywhere (the decals.js kill switch, 2026-08-03) —
// the lab included; __lab.decalsEnable(true) arms this page for review.
const decals = new DecalField(scene);
const dieLights = new DieLightRig(scene, { max: 2 });

// Level 5: the lab renders through the post stack ALWAYS (the main table
// bypasses when nothing glows; here the stack itself is under review).
const post = new PostStack(renderer);

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

// One posed grid die. Shared by the boot loop and the builder's live
// rebuild — the pose, the texture pinning and the effects' base-state
// cache must match exactly or a rebuilt row drifts from its neighbors.
function makeDie(type, variant, x, y, c) {
  const mesh = createDieMesh(type, variant);
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
  return { mesh, baseX: x, baseY: y, phase: c * 0.7 };
}

ROWS.forEach((id, r) => {
  const y = gridH / 2 - r * ROW_STEP;
  const meshes = DIE_TYPES.map((type, c) =>
    makeDie(type, id === 'std' ? 'std' : id, -gridW / 2 + c * COL_STEP, y, c));
  const recipe = id === 'std' ? null : SETS[id];
  rows.push({ id, recipe,
    label: id === 'std' ? 'Standard (today)'
      : recipe.houseLabel ? `${recipe.houseLabel} · ${recipe.label}` : recipe.label,
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
  field.setProjection(window.innerHeight, camera.fov);
  const fitH = (gridH / 2 + 2.2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitW = (gridW / 2 + 3.4) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / aspect;
  camTarget.set(0, 0, 0);
  camera.position.set(0, 0, Math.max(fitH, fitW));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const px = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(px.x, px.y);
}
// Resize refits aspect/pixels via frameCamera, then RE-APPLIES whatever
// framing the user was in — a window drag must not silently unzoom while
// the sidebar highlight still claims otherwise. (zoomedId/focusCol/
// spanned live below; resize events can only fire after load.)
window.addEventListener('resize', () => {
  frameCamera();
  if (spanned) window.__lab.zoomRows('std', 'lab.builder');
  else if (zoomedId != null && focusCol != null) window.__lab.zoomDie(zoomedId, focusCol);
  else if (zoomedId != null) window.__lab.zoomRow(zoomedId);
});
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
    // jolt RELATIVE to wherever the camera is parked — zoomed framings
    // (zoomRow/zoomDie/zoomRows) live off-origin, and an absolute write
    // would teleport them to grid center
    const bx = camera.position.x;
    run(180, (k) => {
      light.intensity = 10 * (1 - k);
      camera.position.x = bx + (Math.random() - 0.5) * 0.06 * (1 - k);
    }, () => { scene.remove(light); camera.position.x = bx; });
  },
  // mass arrives: one decisive drop-and-stop, no elastic wobble
  slam(row) {
    const by = camera.position.y; // relative, same reason as flash
    run(200, (k) => {
      const dip = k < 0.3 ? (k / 0.3) : 1 - easeOut((k - 0.3) / 0.7);
      for (const c of row.meshes) c.mesh.position.y = c.baseY - 0.3 * dip;
      camera.position.y = by - 0.08 * dip;
    }, () => {
      for (const c of row.meshes) c.mesh.position.y = c.baseY;
      camera.position.y = by;
    });
  },
  // agitation feeds the fire / the charge releases: internal glow surges
  glow(row) {
    const mats = rowMaterials(row);
    const accent = row.recipe && (row.recipe.glow || (row.recipe.maps && row.recipe.maps.digitGlow))
      ? null // themed glow: surge what the set already carries
      : new THREE.Color((row.recipe && row.recipe.accent) || '#ffd766');
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
  // it was never fully here: noise-threshold dissolve with a burning
  // edge — out over ~1s, a beat of absence, then re-knit (lab loop).
  // While the burn eats the die, ash wisps rise off it (Level 3): the
  // emission rides the same clock as uDissolve, not a timer of its own.
  unmake(row) {
    const mats = rowMaterials(row).filter((m) => m.userData.uDissolve);
    if (!mats.length) return;
    const recipe = row.recipe && row.recipe.particles;
    run(2600, (k) => {
      const v = k < 0.38 ? easeOut(k / 0.38)
        : k < 0.58 ? 1
        : 1 - easeOut((k - 0.58) / 0.42);
      for (const m of mats) m.userData.uDissolve.value = Math.min(v, 0.999);
      if (recipe && k < 0.38) {
        for (const c of row.meshes) {
          if (Math.random() < 0.35) {
            field.wisp(recipe, [
              c.mesh.position.x + (Math.random() - 0.5) * 1.3,
              c.mesh.position.y + (Math.random() - 0.5) * 1.3,
              c.mesh.position.z + 0.5,
            ]);
          }
        }
      }
    }, () => {
      for (const m of mats) m.userData.uDissolve.value = 0;
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
// The drop rig — Level 3's honesty check. A REAL cannon-es d6 (main-table
// gravity and contact params) falls into the row; every `collide` whose
// impact velocity clears the floor fires the set's burst AT the measured
// contact point, scaled by the measured strength. No impact, no particles.
// One drop at a time; the die fades out after it sleeps.
// ---------------------------------------------------------------------------

const DROP_Z = 2.4; // in front of the display grid; clear of its meshes
const dieMat = new CANNON.Material('labDie');
const floorMat = new CANNON.Material('labFloor');
let world = null;
let drop = null; // {mesh, body, floor, row, born, sleepAt, contacts, bursts}
let dropCount = 0;

// mulberry32 (local copy): the FIRST drop after load is fully seeded, so
// headless shots replay the identical trajectory run after run.
function labRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensureWorld() {
  if (world) return;
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -110, 0) }); // main.js's GRAVITY
  world.allowSleep = true; // worlds default to false — without this the die never sleeps
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, floorMat, { friction: 0.25, restitution: 0.42 }));
}

// The endDrop(true) fade window: `drop` is already null but the mesh is
// still in the scene wearing its variant's cached materials — the builder
// rebuild must know (bustDie's contract: drop every mesh BEFORE busting).
let fadingDrop = null;
function endDrop(fade) {
  if (!drop) return;
  const d = drop;
  drop = null;
  world.removeBody(d.body);
  world.removeBody(d.floor);
  if (d.rails) for (const w of d.rails) world.removeBody(w);
  dieLights.release(d.mesh);
  decals.clear(); // the coupon takes its marks with it
  const cleanup = () => {
    scene.remove(d.mesh);
    if (d.coupon) {
      scene.remove(d.coupon);
      // per-drop resources (the die's geometry/materials are the shared cache)
      d.coupon.geometry.dispose();
      d.coupon.material.dispose();
    }
    if (fadingDrop === d) fadingDrop = null;
  };
  if (fade) {
    fadingDrop = d;
    run(260, (k) => {
      d.mesh.scale.setScalar(1 - easeOut(k));
      if (d.coupon) d.coupon.material.opacity = 0.94 * (1 - k);
    }, cleanup);
  } else cleanup();
}

function startDrop(row) {
  ensureWorld();
  endDrop(false);
  const rng = labRng(0xd1ce + dropCount++);
  const y = row.meshes[0].baseY;
  const cx = row.meshes[4].baseX; // the zoom view's center column
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: floorMat });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  floor.position.set(0, y - 1.15, 0); // settle just below the row line, inside the zoom frame
  world.addBody(floor);
  const body = createDieBody('d6', dieMat);
  body.position.set(cx + (rng() - 0.5) * 0.5, y + 3.1, DROP_Z + (rng() - 0.5) * 0.3);
  body.velocity.set((rng() - 0.5) * 1.1, -2, (rng() - 0.5) * 1.1);
  body.angularVelocity.set((rng() - 0.5) * 16, (rng() - 0.5) * 16, (rng() - 0.5) * 16);
  body.quaternion.setFromEuler(rng() * 6.28, rng() * 6.28, rng() * 6.28);
  body.linearDamping = 0.22; // stands in for felt + walls: keeps the die in the zoom frame
  body.angularDamping = 0.1;
  world.addBody(body);
  const mesh = createDieMesh('d6', row.id === 'std' ? 'std' : row.id);
  scene.add(mesh);
  // Level 4 acts ON THE TABLE, and the rig floats over a void — so the
  // drop brings a coupon of felt with it: the decal's page, the glow's
  // pool, faded in under the die and gone with it.
  const coupon = new THREE.Mesh(
    new THREE.PlaneGeometry(8.5, 5.6),
    new THREE.MeshStandardMaterial({
      // brighter than the table's obsidian felt on purpose: the lab's
      // lights are a fraction of the table's, and a coupon that matches
      // the void teaches nothing
      color: '#30303a', roughness: 0.96, metalness: 0,
      transparent: true, opacity: 0, envMapIntensity: 0.2,
    })
  );
  coupon.rotation.x = -Math.PI / 2;
  coupon.position.set(cx, floor.position.y + 0.001, DROP_Z);
  scene.add(coupon);
  run(200, (k) => { coupon.material.opacity = 0.94 * k; });
  // Rails at the coupon's edges (the table has walls; a tumbling die
  // walks sideways off an unfenced floor and takes the framing with it).
  const rails = [];
  const railDefs = [
    // hugging the dropView frustum: a die pinned at a rail still shows
    [cx - 2.9, DROP_Z, 0, Math.PI / 2],
    [cx + 2.9, DROP_Z, 0, -Math.PI / 2],
    [cx, DROP_Z - 2.1, 0, 0],
    [cx, DROP_Z + 2.1, 0, Math.PI],
  ];
  for (const [wx, wz, rx, ry] of railDefs) {
    const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: floorMat });
    wall.quaternion.setFromEuler(rx, ry, 0);
    wall.position.set(wx, floor.position.y, wz);
    world.addBody(wall);
    rails.push(wall);
  }
  if (row.recipe && row.recipe.light) dieLights.attach(mesh, row.recipe.light, rng);
  const recipe = row.recipe && row.recipe.particles;
  const decalRecipe = row.recipe && row.recipe.decal;
  body.addEventListener('collide', (e) => {
    if (!drop || drop.body !== body) return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v < 1.6) return; // same idea as the click-sound floor
    drop.contacts++;
    const c = e.contact;
    const side = c.bi === body ? { b: c.bi, r: c.ri } : { b: c.bj, r: c.rj };
    const at = [side.b.position.x + side.r.x, side.b.position.y + side.r.y, side.b.position.z + side.r.z];
    // a set may shed nothing, mark nothing, or both — that IS the demo
    if (recipe) drop.bursts += field.burst(recipe, at, v, rng);
    // marks want a REAL hit (higher floor than a click), and they stamp at
    // coupon height — the contact x/z projected onto the felt sample
    if (decalRecipe && v >= 4) {
      drop.stamps += decals.stamp(decalRecipe, [at[0], floor.position.y + 0.012, at[2]], v, rng);
    }
    // Level 5: ONE shock ring per drop, off the first hard landing
    const postRec = row.recipe && row.recipe.post;
    if (postRec && postRec.ring && v >= 10 && !drop.rang) {
      drop.rang = true;
      post.ring(at, camera, postRec.ring);
    }
  });
  body.addEventListener('sleep', () => {
    if (drop && drop.body === body) drop.sleepAt = performance.now();
  });
  drop = { mesh, body, floor, rails, coupon, row, born: performance.now(), sleepAt: 0, contacts: 0, bursts: 0, stamps: 0, rang: false };
}

// ---------------------------------------------------------------------------
// Sidebar + toolbar
// ---------------------------------------------------------------------------

const side = document.getElementById('side');

// ---- the recipe readout: every knob a set carries, in one glance --------
const fmtNum = (v) => {
  const s = String(Math.round(v * 1000) / 1000);
  return s.startsWith('0.') ? s.slice(1) : s.startsWith('-0.') ? `-${s.slice(2)}` : s;
};
function fmtVal(v) {
  if (typeof v === 'number') return fmtNum(v);
  if (v === true) return 'on';
  if (v == null || v === false) return 'off';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(fmtVal).join(' ');
  return Object.entries(v).map(([k, x]) => `${k} ${fmtVal(x)}`).join(' · ');
}
// One [key, value] line per recipe section; absent geo/feel spell out the
// std defaults — the whole point is VISIBILITY into what each row runs on.
function recipeLines(recipe) {
  const r = recipe || {};
  const lines = [];
  const cols = ['body', 'text', 'accent'].filter((k) => r[k]).map((k) => `${k} ${r[k]}`).join(' · ');
  lines.push(['color', cols || 'std per-type']);
  lines.push(['geo', r.geo ? fmtVal(r.geo) : 'bevel .055 · cut (std)']);
  lines.push(['feel', r.feel ? fmtVal(r.feel) : 'rough .3 · metal .1 (std)']);
  for (const k of ['spec', 'glow', 'maps', 'shader', 'glyph', 'particles', 'decal', 'light', 'post', 'sound', 'rate']) {
    if (r[k] != null) lines.push([k, fmtVal(r[k])]);
  }
  return lines;
}
const readoutEls = new Map(); // row.id -> .t-recipe container
function refreshReadout(row) {
  const el = readoutEls.get(row.id);
  if (!el) return;
  el.textContent = '';
  for (const [k, v] of recipeLines(row.recipe)) {
    const d = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = k;
    d.append(b, ` ${v}`);
    el.appendChild(d);
  }
}

// ---- zoom state: one place, so clicks, keys and the canvas agree --------
const nameEls = new Map(); // row.id -> sidebar name element
let zoomedId = null;  // row id when zoomed
let focusCol = null;  // column index when a SINGLE die is framed
let spanned = false;  // the bench header's std→builder span framing
function setZoom(id, col = null) {
  const prevHero = focusCol != null;
  const prevDist = camera.position.distanceTo(camTarget);
  spanned = false;
  zoomedId = id;
  focusCol = id == null ? null : col;
  if (id == null) window.__lab.zoomRow(null); // refits the full grid
  else if (col == null) window.__lab.zoomRow(id);
  else {
    window.__lab.zoomDie(id, col);
    // surfing hero-to-hero keeps the user's wheel-dolled distance — the
    // A/B flip must not snap the framing they just chose
    if (prevHero) camera.position.z = camTarget.z + Math.min(Math.max(prevDist, 1.6), 12);
  }
  for (const [rid, el] of nameEls) el.classList.toggle('zoomed', rid === id);
}
// Surf while zoomed — the A/B flip the GEO BENCH is for: ↑/↓ hold the
// framing and swap the recipe (the SAME die type across sets when a single
// die is framed); ←/→ walk the die types; Esc refits the grid.
window.addEventListener('keydown', (e) => {
  if (e.target && /^(input|select|textarea)$/i.test(e.target.tagName)) return;
  if (e.key === 'Escape') { if (zoomedId || spanned) { setZoom(null); e.preventDefault(); } return; }
  const dir = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
  if (!dir || !zoomedId) return;
  if (dir[0]) {
    const next = rows[rows.findIndex((r) => r.id === zoomedId) + dir[0]];
    if (next) setZoom(next.id, focusCol);
  } else if (focusCol != null) {
    const nc = focusCol + dir[1];
    if (nc >= 0 && nc < DIE_TYPES.length) setZoom(zoomedId, nc);
  }
  e.preventDefault();
});
// Click a die on the felt to frame it hero-close; empty felt refits the
// grid. (Row zoom stays on the sidebar names.)
const caster = new THREE.Raycaster();
renderer.domElement.addEventListener('click', (ev) => {
  const r = renderer.domElement.getBoundingClientRect();
  caster.setFromCamera(new THREE.Vector2(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1,
  ), camera);
  const cells = [];
  for (const row of rows) row.meshes.forEach((c, ci) => cells.push({ row, ci, mesh: c.mesh }));
  const hits = caster.intersectObjects(cells.map((c) => c.mesh), true);
  let obj = hits.length ? hits[0].object : null;
  while (obj && !cells.some((c) => c.mesh === obj)) obj = obj.parent;
  const cell = obj && cells.find((c) => c.mesh === obj);
  if (cell) setZoom(cell.row.id, cell.ci);
  else if (zoomedId || spanned) setZoom(null);
});
// Scroll dollies toward whatever the camera is studying (esp. hero dice —
// edge reads want a HAIR closer than any fixed framing guesses).
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  const dir = camera.position.clone().sub(camTarget);
  const dist = Math.min(Math.max(dir.length() * (1 + e.deltaY * 0.0012), 1.6), 90);
  camera.position.copy(camTarget).addScaledVector(dir.normalize(), dist);
}, { passive: false });

// Lab-local section headers (these rows have no THEMES house). The bench
// header is a toggle: frame the whole std→builder span for the side-by-side
// read, click again for the full grid.
const SECTIONS = {
  'lab.cut030': ['The Geo Bench', '↑/↓ surf rows zoomed · click header: frame the sweep', () => {
    const was = spanned;
    setZoom(null); // clears row zoom AND spanned, refits the grid
    if (!was) { spanned = true; window.__lab.zoomRows('std', 'lab.builder'); }
  }],
  'lab.builder': ['The Set Builder', 'every knob live in the ⚗ panel — copy the recipe out when it sings'],
};

let lastHouse = null;
for (const row of rows) {
  const box = document.createElement('div');
  box.className = 'theme';
  if (SECTIONS[row.id]) {
    const [label, line, onClick] = SECTIONS[row.id];
    const hh = document.createElement('div');
    hh.className = 't-house';
    hh.textContent = label;
    const hl = document.createElement('div');
    hl.className = 't-line';
    hl.textContent = line;
    if (onClick) { hh.style.cursor = 'pointer'; hh.addEventListener('click', onClick); }
    side.append(hh, hl);
    lastHouse = null;
  }
  // house header once per house (a THEME is a HOUSE holding several SETS)
  if (row.recipe && row.recipe.house && THEMES[row.recipe.house] && row.recipe.house !== lastHouse) {
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
  name.title = 'Click: zoom this row (click a die on the felt for the hero view; ↑↓←→ surf; esc = grid)';
  name.addEventListener('click', () => setZoom(zoomedId === row.id && focusCol == null ? null : row.id));
  nameEls.set(row.id, name);
  box.appendChild(name);
  if (row.recipe) {
    const t = row.recipe;
    if (t.text) name.style.color = t.text;
    const sw = document.createElement('div');
    sw.className = 'swatches';
    for (const c of [t.body, t.text, t.accent, t.glow ? t.glow.color : null]) {
      if (!c) continue;
      const i = document.createElement('i');
      i.style.background = c;
      i.title = c;
      sw.appendChild(i);
    }
    if (sw.childElementCount) box.appendChild(sw);
  }
  const ro = document.createElement('div');
  ro.className = 't-recipe';
  readoutEls.set(row.id, ro);
  box.appendChild(ro);
  refreshReadout(row);
  const fx = document.createElement('div');
  fx.className = 'fx';
  const fxList = [['flash', '⚡ pop'], ['slam', '🔨 slam'], ['glow', '✨ glow'],
    ['freeze', '❄ freeze'], ['dim', '🌑 recoil'], ['swell', '🌊 swell']];
  // the builder's recipe changes live (a seeded dissolve set must keep its
  // button); unmake itself no-ops on rows without dissolve materials
  if (row.id === 'lab.builder' || (row.recipe && row.recipe.shader && row.recipe.shader.dissolve)) fxList.push(['unmake', '💀 unmake']);
  for (const [id, label] of fxList) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => EFFECTS[id](row));
    fx.appendChild(b);
  }
  {
    const b = document.createElement('button');
    b.textContent = '⬇ drop';
    b.title = row.recipe && row.recipe.particles
      ? 'A real physics die: every measured contact fires this set\'s burst'
      : 'A real physics die: this set sheds nothing on impact (on purpose)';
    b.addEventListener('click', () => startDrop(row));
    fx.appendChild(b);
  }
  box.appendChild(fx);
  side.appendChild(box);
}

// ---------------------------------------------------------------------------
// The SET BUILDER panel — every recipe knob live. Controls write into
// bState; a short debounce collapses slider streams into one rebuild
// (each rebuild re-bakes ~60 face canvases — cheap, but not per-pixel
// cheap). The copy-out prints a themes.js-shaped recipe.
// ---------------------------------------------------------------------------

const bSyncs = []; // control -> state resync fns (seed loads, builderSet)
const syncControls = () => bSyncs.forEach((f) => f());

function rebuildBuilderRow() {
  clearTimeout(bTimer); // a pending touch() must not fire a second rebuild
  const row = rows.find((r) => r.id === 'lab.builder');
  if (drop && drop.row === row) endDrop(false); // its rig d6 wears these materials
  if (fadingDrop && fadingDrop.row === row) {
    // …and so does a mesh still in its 260ms fade-out — bustDie's contract
    scene.remove(fadingDrop.mesh); // the fade's own cleanup still handles the coupon
    fadingDrop = null;
  }
  const y = row.meshes[0].baseY;
  // keep rotational lockstep with the neighbors (spin accumulates since
  // boot; a fresh pose would leave this row permanently phase-offset —
  // the side-by-side edge read is the whole point)
  const spin = row.meshes.map((c) => c.mesh.rotation.clone());
  for (const c of row.meshes) scene.remove(c.mesh);
  bustDie('lab.builder');
  row.recipe = registerSet('lab.builder', assembleRecipe(bState));
  row.meshes = DIE_TYPES.map((type, c) => makeDie(type, 'lab.builder', -gridW / 2 + c * COL_STEP, y, c));
  row.meshes.forEach((c, i) => c.mesh.rotation.copy(spin[i]));
  renderer.render(scene, camera); // pin the fresh uploads (boot's warm-up defense)
  refreshReadout(row);
  const pre = document.getElementById('b-recipe');
  if (pre) pre.textContent = recipeText();
}
let bTimer = 0;
function touch() { clearTimeout(bTimer); bTimer = setTimeout(rebuildBuilderRow, 140); }

// The paste-into-themes.js text: label/house come from the tree location,
// so the print is the body alone, JS-style keys and quotes.
function recipeText() {
  const { label, house, ...body } = assembleRecipe(bState);
  return JSON.stringify(body, null, 2)
    .replace(/"([A-Za-z_][A-Za-z0-9_]*)":/g, '$1:')
    .replace(/"/g, "'");
}

{
  const bc = document.getElementById('b-controls');
  const section = (title, open = false) => {
    const d = document.createElement('details');
    d.open = open;
    const s = document.createElement('summary');
    s.textContent = title;
    d.appendChild(s);
    bc.appendChild(d);
    return d;
  };
  const rowEl = (parent, labelText) => {
    const r = document.createElement('div');
    r.className = 'b-row';
    const l = document.createElement('label');
    l.textContent = labelText;
    r.appendChild(l);
    parent.appendChild(r);
    return r;
  };
  const slider = (parent, label, get, set, min, max, step) => {
    const r = rowEl(parent, label);
    const i = document.createElement('input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
    const v = document.createElement('span');
    v.className = 'b-val';
    v.textContent = fmtNum(get());
    i.addEventListener('input', () => { set(parseFloat(i.value)); v.textContent = fmtNum(parseFloat(i.value)); touch(); });
    r.append(i, v);
    bSyncs.push(() => { i.value = get(); v.textContent = fmtNum(get()); });
  };
  const color = (parent, label, get, set) => {
    const r = rowEl(parent, label);
    const i = document.createElement('input');
    i.type = 'color'; i.value = get();
    i.addEventListener('input', () => { set(i.value); touch(); });
    r.appendChild(i);
    bSyncs.push(() => { i.value = get(); });
  };
  const select = (parent, label, get, set, options) => {
    const r = rowEl(parent, label);
    const s = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o;
      s.appendChild(opt);
    }
    s.value = get();
    s.addEventListener('change', () => { set(s.value); touch(); });
    r.appendChild(s);
    bSyncs.push(() => { s.value = get(); });
  };
  const check = (parent, label, get, set) => {
    const r = rowEl(parent, label);
    const i = document.createElement('input');
    i.type = 'checkbox'; i.checked = get();
    i.addEventListener('change', () => { set(i.checked); touch(); });
    r.appendChild(i);
    bSyncs.push(() => { i.checked = get(); });
  };

  // seed: start from std defaults, a bench recipe, or any house set
  {
    const r = rowEl(bc, 'seed');
    const s = document.createElement('select');
    for (const id of ['std', ...BENCH_IDS, ...SET_IDS]) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id === 'std' ? 'std (defaults)' : id;
      s.appendChild(opt);
    }
    s.addEventListener('change', () => loadSeed(s.value));
    r.appendChild(s);
  }

  const gGeo = section('geometry (Level 3.5)', true);
  slider(gGeo, 'bevel', () => bState.geo.bevel, (v) => { bState.geo.bevel = v; }, 0, 0.14, 0.005);
  select(gGeo, 'profile', () => bState.geo.profile, (v) => {
    // untouched ink follows the profile default so recipes stay clean
    if (bState.geo.ink === INK_DEFAULT(bState.geo.profile)) bState.geo.ink = INK_DEFAULT(v);
    bState.geo.profile = v;
    syncControls();
  }, ['cut', 'round']);
  slider(gGeo, 'segments', () => bState.geo.segments, (v) => { bState.geo.segments = v; }, 1, 6, 1);
  // edge ink: 0 = self-colored edges (no dimming), 1 = fully the tint color.
  // Range widened to the full lerp domain (was 0-0.5) so a theme can push
  // an edge all the way to its tint if the material calls for it.
  slider(gGeo, 'edge ink', () => bState.geo.ink, (v) => { bState.geo.ink = v; }, 0, 1, 0.01);
  // edge tint: the color the body lerps toward. Default black is the
  // classical inked outline; a per-set tint claims an edge palette —
  // sepia on aged ivory, patina on brass, deep abyssal blue on ice,
  // or an ivory highlight on onyx (tint LIGHTER than body = highlight).
  color(gGeo, 'edge tint', () => bState.geo.tint || '#000000', (v) => { bState.geo.tint = v; });
  slider(gGeo, 'wear', () => bState.geo.wear, (v) => { bState.geo.wear = v; }, 0, 1, 0.05);
  slider(gGeo, 'pillow', () => bState.geo.pillow, (v) => { bState.geo.pillow = v; }, 0, 1, 0.05);
  slider(gGeo, 'nicks', () => bState.geo.nicks, (v) => { bState.geo.nicks = v; }, 0, 5, 1);

  const gCol = section('color', true);
  check(gCol, 'std per-type colors', () => bState.stdColors, (v) => { bState.stdColors = v; });
  color(gCol, 'body', () => bState.body, (v) => { bState.body = v; bState.stdColors = false; syncControls(); });
  color(gCol, 'text', () => bState.text, (v) => { bState.text = v; bState.stdColors = false; syncControls(); });
  color(gCol, 'accent', () => bState.accent, (v) => { bState.accent = v; });

  const gFeel = section('feel & finish');
  slider(gFeel, 'rough', () => bState.feel.rough, (v) => { bState.feel.rough = v; }, 0, 1, 0.02);
  slider(gFeel, 'metal', () => bState.feel.metal, (v) => { bState.feel.metal = v; }, 0, 1, 0.02);
  slider(gFeel, 'env reflect', () => bState.spec.envMapIntensity, (v) => { bState.spec.envMapIntensity = v; }, 0, 2, 0.05);

  const gSpec = section('specular identity');
  slider(gSpec, 'clearcoat', () => bState.spec.clearcoat, (v) => { bState.spec.clearcoat = v; }, 0, 1, 0.05);
  slider(gSpec, 'coat rough', () => bState.spec.clearcoatRoughness, (v) => { bState.spec.clearcoatRoughness = v; }, 0, 1, 0.05);
  slider(gSpec, 'ior', () => bState.spec.ior, (v) => { bState.spec.ior = v; }, 1, 2.33, 0.01);
  slider(gSpec, 'iridescence', () => bState.spec.iridescence, (v) => { bState.spec.iridescence = v; }, 0, 1, 0.05);
  slider(gSpec, 'irid. ior', () => bState.spec.iridescenceIOR, (v) => { bState.spec.iridescenceIOR = v; }, 1, 2.5, 0.05);
  slider(gSpec, 'spec inten.', () => bState.spec.specularIntensity, (v) => { bState.spec.specularIntensity = v; }, 0, 2, 0.05);
  color(gSpec, 'spec color', () => bState.spec.specularColor, (v) => { bState.spec.specularColor = v; });

  const gGlow = section('internal glow');
  check(gGlow, 'glow', () => bState.glowOn, (v) => { bState.glowOn = v; });
  color(gGlow, 'color', () => bState.glow.color, (v) => { bState.glow.color = v; bState.glowOn = true; syncControls(); });
  slider(gGlow, 'intensity', () => bState.glow.intensity, (v) => { bState.glow.intensity = v; }, 0, 1.2, 0.05);

  const gMaps = section('surface maps');
  select(gMaps, 'relief', () => bState.relief.pattern, (v) => { bState.relief.pattern = v; }, ['none', ...PATTERN_IDS]);
  slider(gMaps, 'strength', () => bState.relief.strength, (v) => { bState.relief.strength = v; }, 0, 1, 0.05);
  slider(gMaps, 'tint', () => bState.relief.tint, (v) => { bState.relief.tint = v; }, 0, 1, 0.05);
  slider(gMaps, 'digit depth', () => bState.relief.digitDepth, (v) => { bState.relief.digitDepth = v; }, 0, 1, 0.05);
  select(gMaps, 'rough map', () => bState.roughPattern, (v) => { bState.roughPattern = v; }, ['none', ...PATTERN_IDS]);
  check(gMaps, 'digit glow', () => bState.digitGlowOn, (v) => { bState.digitGlowOn = v; });
  color(gMaps, 'digit color', () => bState.digitGlow.color, (v) => { bState.digitGlow.color = v; bState.digitGlowOn = true; syncControls(); });
  slider(gMaps, 'digit inten.', () => bState.digitGlow.intensity, (v) => { bState.digitGlow.intensity = v; }, 0, 1.5, 0.05);

  const gGlyph = section('glyphs');
  select(gGlyph, 'glyph', () => bState.glyph, (v) => { bState.glyph = v; }, ['none', 'pip']);

  document.getElementById('b-recipe').textContent = recipeText();
  document.getElementById('b-copy').addEventListener('click', () => {
    const btn = document.getElementById('b-copy');
    navigator.clipboard.writeText(recipeText()).then(
      () => { btn.textContent = '✓ copied'; setTimeout(() => { btn.textContent = '⧉ copy recipe'; }, 1200); },
      () => { btn.textContent = '✕ copy failed'; setTimeout(() => { btn.textContent = '⧉ copy recipe'; }, 1200); },
    );
  });
  document.getElementById('bpanel').addEventListener('click', () => {
    const p = document.getElementById('builder');
    p.style.display = p.style.display === 'none' ? '' : 'none';
  });
}

function loadSeed(id) {
  const d = B_DEFAULTS();
  if (id !== 'std' && SETS[id]) {
    const t = SETS[id];
    bState = {
      ...d,
      stdColors: !t.body,
      body: t.body || d.body, text: t.text || d.text, accent: t.accent || d.accent,
      geo: (() => {
        const g = { ...d.geo, ...(t.geo || {}) };
        // a seed without explicit ink means "profile default", which for
        // round bands is .12 — reflect that in the slider, not cut's .25
        if (!t.geo || t.geo.ink == null) g.ink = INK_DEFAULT(g.profile);
        return g;
      })(),
      feel: { ...d.feel, ...(t.feel || {}) },
      // a house set without spec rides three's env default (1), not std's whisper
      spec: { ...d.spec, envMapIntensity: t.house ? 1 : 0.35, ...(t.spec || {}) },
      glowOn: !!t.glow, glow: t.glow ? { ...t.glow } : d.glow,
      relief: t.maps && t.maps.relief
        ? { pattern: t.maps.relief.pattern, strength: t.maps.relief.strength ?? 0.5, tint: t.maps.relief.tint ?? 0.4, digitDepth: t.maps.relief.digitDepth ?? 0 }
        : d.relief,
      roughPattern: (t.maps && t.maps.roughPattern) || 'none',
      digitGlowOn: !!(t.maps && t.maps.digitGlow),
      digitGlow: t.maps && t.maps.digitGlow ? { ...t.maps.digitGlow } : d.digitGlow,
      glyph: t.glyph || 'none',
      carry: (() => {
        // DEEP COPIES: carry rides into the builder recipe and builderSet
        // deep-merges patches into it — an alias would corrupt the seed's
        // published SETS entry page-wide
        const c = {};
        for (const k of ['shader', 'particles', 'decal', 'light', 'post', 'sound', 'rate']) {
          if (t[k] != null) c[k] = JSON.parse(JSON.stringify(t[k]));
        }
        return c;
      })(),
    };
  } else {
    bState = d;
  }
  syncControls();
  rebuildBuilderRow();
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
  SHADER_TIME.value = now / 1000; // Level 2's shared clock
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
  if (drop) {
    world.step(1 / 60, dt, 4); // main-table FIXED_DT
    drop.mesh.position.copy(drop.body.position);
    drop.mesh.quaternion.copy(drop.body.quaternion);
    // Linger well past settle: Level 4's whole point is the mark that
    // REMAINS — a rig that sweeps the felt 1 s after the die stops would
    // never show it (900 ms suited Level 3's fast-dying bursts).
    if ((drop.sleepAt && now - drop.sleepAt > 3500) || now - drop.born > 12000) endDrop(true);
  }
  field.tick(dt, now / 1000);
  decals.tick(dt);
  dieLights.tick(dt, now / 1000);
  // Level 5: heat shimmer follows the drop die of a shimmer set (air
  // wobbles over hot iron); everything renders through the stack.
  const shim = drop && drop.row.recipe && drop.row.recipe.post && drop.row.recipe.post.shimmer;
  post.setShimmer(shim
    ? [{ at: drop.mesh.position.toArray(), radius: shim.radius, strength: shim.strength }]
    : [], camera);
  post.render(scene, camera, dt);
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
  benchIds: BENCH_IDS,
  setRotate(on) { rotate = !!on; },
  setEnv(name) { applyEnv(name); },
  // The builder, scriptable: deep-merge a patch into the working state
  // (bState shape: geo/feel/spec sections, stdColors, body/text/accent,
  // glowOn/glow, relief/roughPattern, digitGlowOn/digitGlow, glyph),
  // rebuild synchronously, return the assembled recipe.
  builderSet(patch) {
    const merge = (dst, src) => {
      for (const [k, v] of Object.entries(src || {})) {
        if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
        else dst[k] = v;
      }
    };
    merge(bState, patch);
    syncControls();
    rebuildBuilderRow();
    return this.builderRecipe();
  },
  builderRecipe() { return JSON.parse(JSON.stringify(assembleRecipe(bState))); },
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
    camTarget.set(cx, y, 0);
    camera.position.set(cx, y, 7.2);
    camera.lookAt(cx, y, 0);
    camera.updateProjectionMatrix();
    return true;
  },
  // Frame ONE die hero-close (a die type like 'd6', or a column index) —
  // edge profiles and surface character are judged at THIS distance.
  // Canvas clicks land here too; ↑/↓ then flip the same die across sets.
  zoomDie(rowId, typeOrIdx) {
    const row = rows.find((r) => r.id === rowId);
    const c = typeof typeOrIdx === 'number' ? typeOrIdx : DIE_TYPES.indexOf(typeOrIdx);
    if (!row || c < 0 || c >= DIE_TYPES.length) return false;
    const cell = row.meshes[c];
    camTarget.set(cell.baseX, cell.baseY, 0);
    camera.position.set(cell.baseX, cell.baseY, 4.1);
    camera.lookAt(camTarget);
    camera.updateProjectionMatrix();
    return true;
  },
  // Frame a SPAN of rows (inclusive) — the GEO BENCH's side-by-side read.
  zoomRows(fromId, toId) {
    const i1 = rows.findIndex((r) => r.id === fromId);
    const i2 = rows.findIndex((r) => r.id === toId);
    if (i1 === -1 || i2 === -1) return false;
    const yTop = gridH / 2 - Math.min(i1, i2) * ROW_STEP;
    const yBot = gridH / 2 - Math.max(i1, i2) * ROW_STEP;
    const cy = (yTop + yBot) / 2;
    const half = (yTop - yBot) / 2 + 1.6;
    const aspect = window.innerWidth / window.innerHeight;
    const fitH = half / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fitW = (gridW / 2 + 3.4) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / aspect;
    camTarget.set(0, cy, 0);
    camera.position.set(0, cy, Math.max(fitH, fitW));
    camera.lookAt(0, cy, 0);
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
  // Level 3's rig, scriptable: drop a physics die into a row, then poll
  // the contact/burst counters to assert particles really keyed off
  // measured impacts (tools/lab-shots.mjs does exactly this).
  drop(rowId) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return false;
    startDrop(row);
    return true;
  },
  dropState() {
    return drop
      ? { active: true, contacts: drop.contacts, bursts: drop.bursts, stamps: drop.stamps, sleeping: !!drop.sleepAt }
      : { active: false };
  },
  particleCount() { return field.count(); },
  // Level 4 diagnostics: live felt marks and attached die-lights.
  decalCount() { return decals.count(); },
  decalDump() { return decals.dump(); },
  // marks ship dark (2026-08-03) — arm this page to review them
  decalsEnable(on) { decals.enabled = !!on; return decals.enabled; },
  lightInfo() { return dieLights.info(); },
  // Level 5 diagnostics: what the stack did last frame + monotonic rings.
  postInfo() {
    return { bloomSources: post.lastBloomSources, rings: post.ringsFired, shimmer: post.shimmer.length };
  },
  // Average framebuffer RGB around a projected WORLD point (the decal
  // cousin of __labSample): pins "what color IS that mark" to numbers.
  sampleWorld(p, half = 6) {
    renderer.render(scene, camera);
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
    const src = renderer.domElement;
    const px = Math.round((v.x * 0.5 + 0.5) * src.width);
    const py = Math.round((-v.y * 0.5 + 0.5) * src.height);
    const c2 = document.createElement('canvas');
    c2.width = src.width; c2.height = src.height;
    const ctx = c2.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(px - half, py - half, half * 2, half * 2).data;
    let r = 0, g = 0, b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  },
  // Frame a row's DROP AREA at main-table pitch (~57° down). The zoom
  // view reads the felt edge-on, which is exactly the angle a flat decal
  // vanishes at — marks are judged the way the table shows them.
  dropView(id) {
    const row = rows.find((r) => r.id === id);
    if (!row) return false;
    const y = row.meshes[0].baseY;
    const cx = row.meshes[4].baseX;
    camTarget.set(cx, y - 1.15, DROP_Z - 0.4);
    camera.position.set(cx, y + 6.2, DROP_Z + 4.8);
    camera.lookAt(cx, y - 1.15, DROP_Z - 0.4);
    camera.updateProjectionMatrix();
    return true;
  },
  // Level 3.5 diagnostics: per-set render-geometry fingerprints. Bevel
  // and wear move the bounding radius (crisp Umbra > std > tumbled
  // Sea-glass); the probe asserts that ordering without a screenshot.
  geoStats() {
    const out = {};
    for (const row of rows) {
      const g = row.meshes[1].mesh.geometry; // the d6 column
      if (!g.boundingSphere) g.computeBoundingSphere();
      out[row.id] = { verts: g.attributes.position.count, r: +g.boundingSphere.radius.toFixed(4) };
    }
    return out;
  },
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
