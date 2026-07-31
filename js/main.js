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

// Dice Table — 3D physics dice roller for tabletop games.
// No server state: groups and the roll log persist in localStorage.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DIE_TYPES, DIE_DEFS, createDieMesh, createDieBody, readValue, valueRange, faceNormalForValue, getDie } from './dice.js';
import { connect } from './net.js';
import { SYSTEMS, DEFAULT_SYSTEM } from './meanings.js';
import { groupsFromLocation, syncGroupsToLocation } from './urlgroups.js';
import { composeRoll, validateMods, previewSpec } from './rollspec.js';
import { parseNotation, canonicalNotation, cutText } from './notation.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABLE_W = 30;          // playable width (x)
const TABLE_D = 17;          // playable depth (z)
const MAX_DICE_ON_TABLE = 40;
const GRAVITY = -110;
const LOG_CAP = 100;
const LS_GROUPS = 'dice.groups.v1';
const LS_LOG = 'dice.log.v1';
const LS_HISTORY = 'dice.cmdhistory.v1'; // command-box history: shared across rooms, cap 50
const HISTORY_CAP = 50;
const LS_SOUND = 'dice.sound.v1';        // "Just you" scope: sound on/off
const LS_CHIPS = 'dice.chips.v1';        // "Just you" scope: per-die value chips (default OFF — P1)
const LS_ROOMSETTINGS = 'dice.roomsettings.v1'; // solo-mode copy of the table settings

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------

const container = document.getElementById('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b1410'); // walnut sceneBg — the DEFAULT_FELT below

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 200);
camera.position.set(0, 27, 15.5);
camera.lookAt(0, 0, 0.5);

scene.add(new THREE.HemisphereLight('#fff6e0', '#2a2018', 1.1));

const keyLight = new THREE.DirectionalLight('#ffeecc', 2.9);
keyLight.position.set(8, 30, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -TABLE_W / 2 - 4;
keyLight.shadow.camera.right = TABLE_W / 2 + 4;
keyLight.shadow.camera.top = TABLE_D / 2 + 6;
keyLight.shadow.camera.bottom = -TABLE_D / 2 - 6;
keyLight.shadow.camera.far = 60;
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight('#8fb4ff', 0.7);
rimLight.position.set(-12, 18, -14);
scene.add(rimLight);

// felt table surface — room-selectable themes (roadmap §2). Each theme pairs
// the felt base color with a scene background. 'emerald' is the original look
// and must stay byte-identical to it ('#1f3128' / '#191512'), but 'walnut' is
// the DEFAULT for new tables — server and solo fallback alike (§7.7.1,
// fantasy-not-casino). A stored solo choice (emerald included) is respected.
// The theme id is room state (settings.felt); the 2D gold/ivory UI palette
// never changes.
const FELT_THEMES = {
  emerald:  { name: 'Emerald',  feltBase: '#1f3128', sceneBg: '#191512' },
  crimson:  { name: 'Crimson',  feltBase: '#46201e', sceneBg: '#1a1211' },
  midnight: { name: 'Midnight', feltBase: '#1e2a3f', sceneBg: '#121520' },
  slate:    { name: 'Slate',    feltBase: '#2c3438', sceneBg: '#161a1c' },
  walnut:   { name: 'Walnut',   feltBase: '#402e1c', sceneBg: '#1b1410' },
  // The exploration batch (2026-07): more of the palette than green/brown —
  // near-black stone, cold deep teal, wine-dark purple, and one LIGHT table
  // (dice and gold chrome read differently on it by design).
  obsidian: { name: 'Obsidian', feltBase: '#1c1c24', sceneBg: '#0f0f13' },
  ocean:    { name: 'Ocean',    feltBase: '#16404a', sceneBg: '#0f181c' },
  plum:     { name: 'Plum',     feltBase: '#3b2342', sceneBg: '#160f18' },
  sand:     { name: 'Sand',     feltBase: '#7c6a4d', sceneBg: '#211a11' },
};
const DEFAULT_FELT = 'walnut';
let currentFeltId = DEFAULT_FELT;

// The collect shelf (UX §7.7, refined §7.7.1): five slot POSITIONS along the
// bottom (front) felt edge. No permanent markings — an empty position is plain
// felt (§7.7.1 "no casino markings"); an OCCUPIED position gets a soft warm
// under-glow ring composited into the felt beneath its cluster, which appears
// as the whisk lands and leaves with the roll. A collected roll's dice cluster
// in one slot, ordered by collection (reflowShelf). Geometry is shared by the
// glow decals, the cluster layout, the camera framing, and the marker
// projection — one set of numbers, four readers. The slot is the pile's
// boundary, so its size is what clusterPoses fits against; keep the slots
// inside the felt (|x| < TABLE_W/2, SHELF_Z + D/2 < TABLE_D/2) and clear of
// each other (W < the 5.9 pitch).
const SHELF_SLOTS = 5;
const SHELF_Z = 6.6;                 // slot center (world z; front wall is +8.5)
const SHELF_SLOT_W = 5.4;            // slot decal width  (x units)
const SHELF_SLOT_D = 3.6;            // slot decal depth  (z units)
const SHELF_MARKER_Y = 2.4;          // marker anchor height above the slot
const shelfSlotX = (slot) => (slot - (SHELF_SLOTS - 1) / 2) * 5.9;

// rollId -> {rollId, seq, slot, diceCount, markerEl, glow}. Declared here —
// not with the rest of the shelf machinery below — because the felt composite
// reads it (drawShelfGlow) and the floor texture is built during module
// evaluation, before the shelf section runs.
const shelfClusters = new Map();

// One 512px felt tile per base color (cached — the decal composite redraws it
// 36 times per ceremony and regenerating the noise each time would visibly
// "reseed" the grain under the text).
const feltTileCache = new Map();
function feltTileCanvas(base) {
  let c = feltTileCache.get(base);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // The tile carries ONLY the fine uniform speckle: statistically seamless
  // under the 6×6 repeat. Anything low-frequency must NOT live here — a
  // blotch clipped by the tile border repeats as an obvious 6×6 seam grid
  // (baseFeltCanvas paints the whole-plane mottle exactly once instead).
  for (let i = 0; i < 14000; i++) {
    const shade = Math.random();
    ctx.fillStyle = shade > 0.5
      ? `rgba(255,255,240,${0.012 + Math.random() * 0.02})`
      : `rgba(0,0,0,${0.018 + Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
  }
  feltTileCache.set(base, c);
  return c;
}

// Felt composite (UX §5.4, §7.7, §7.7.1): the floor texture is ALWAYS a
// single 2048-px composite covering the whole 160-unit plane once (repeat
// 1,1) — the 6×6 felt tile pattern, a soft under-glow ring beneath each
// OCCUPIED shelf position, and, during a ceremony, the mat-text declaration
// line in letterspaced gold caps. applyFeltTheme mid-ceremony recomposites
// onto the new base; clearMatDecal drops only the text; recompositeFelt
// repaints on every shelf occupancy change so the rings arrive and leave with
// their clusters. Old textures are always disposed by whoever replaces them.
const DECAL_SIZE = 2048;                    // px across the 160-unit plane
const DECAL_PX_PER_UNIT = DECAL_SIZE / 160;
let matDecalText = null;                    // non-null while a decal is applied

// canvas x/y from world x/z: the camera looks from +z, so canvas center is the
// table center and +z (the lower felt, where the shelf lives) is +y.
const decalPx = (v) => (v + 80) * DECAL_PX_PER_UNIT;

// How far a cluster's glow reaches (world units): the pile's own footprint —
// max horizontal spread of its poses plus each die's radius — with a soft
// margin, so a lone d4's ring hugs it while a 9-die pile earns a wider halo.
// clusterPoses is pure, so this matches the dice wherever the whisk is.
function clusterGlowRadius(c) {
  const dice = tableDice.filter((d) => d.rollId === c.rollId);
  if (!dice.length) return SHELF_SLOT_W * 0.45;
  const poses = clusterPoses(c.slot, dice.map((d) => ({ type: d.type, value: d.shelfValue })));
  let r = 0;
  dice.forEach((d, i) => {
    const p = canonicalDiePose(d.type, d.shelfValue);
    const reach = Math.hypot(poses[i].pos.x - shelfSlotX(c.slot), poses[i].pos.z - SHELF_Z) + p.r;
    if (reach > r) r = reach;
  });
  return Math.min(Math.max(r * 1.35, 1.7), SHELF_SLOT_W * 0.55);
}

// §7.7.1 "no casino markings": nothing is drawn where nothing sits. An
// OCCUPIED position gets a soft warm-gold radial under-glow — arcane circle,
// not casino tray — slightly larger than its cluster's footprint, low alpha
// so every theme keeps it quieter than the dice. A cluster mid-whisk
// (glow=false) hasn't landed yet: its ring appears at whisk-end.
function drawShelfGlow(ctx) {
  for (const c of shelfClusters.values()) {
    if (!c.glow || c.slot < 0) continue;
    const cx = decalPx(shelfSlotX(c.slot));
    const cy = decalPx(SHELF_Z);
    const r = clusterGlowRadius(c) * DECAL_PX_PER_UNIT;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255, 214, 120, 0.10)');
    g.addColorStop(0.62, 'rgba(255, 205, 100, 0.17)');
    g.addColorStop(0.82, 'rgba(255, 196, 88, 0.07)');
    g.addColorStop(1, 'rgba(255, 196, 88, 0)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// The text-free TILE layer is cached per base color: theme swaps, decal
// clears, and every shelf recomposite reuse the same canvas instead of
// re-noising 36 tiles each time. Glow and text are painted over a copy.
const feltCompositeCache = new Map();
function baseFeltCanvas(base) {
  let c = feltCompositeCache.get(base);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = DECAL_SIZE;
  const ctx = c.getContext('2d');
  const tile = feltTileCanvas(base);
  const tileSize = DECAL_SIZE / 6; // the same 6×6 rhythm the old plain repeat had
  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 6; y++) ctx.drawImage(tile, x * tileSize, y * tileSize, tileSize, tileSize);
  }
  // Cloth mottle, painted ONCE across the whole plane (it can't live in the
  // tile: any blotch the tile border clips repeats as a 6×6 seam grid).
  // Very soft and very wide — the nap catching light unevenly, not stains.
  for (let i = 0; i < 18; i++) {
    const light = Math.random() > 0.5;
    const r = 260 + Math.random() * 420;
    const x = Math.random() * DECAL_SIZE;
    const y = Math.random() * DECAL_SIZE;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.006 + Math.random() * 0.01;
    g.addColorStop(0, light ? `rgba(255,250,235,${a})` : `rgba(0,0,0,${a * 1.3})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, DECAL_SIZE, DECAL_SIZE);
  }
  feltCompositeCache.set(base, c);
  return c;
}

// One full-plane felt composite: tiles + occupied-slot glow (+ mat text).
function feltCanvas(base, text) {
  const c = document.createElement('canvas');
  c.width = c.height = DECAL_SIZE;
  const ctx = c.getContext('2d');
  ctx.drawImage(baseFeltCanvas(base), 0, 0);
  drawShelfGlow(ctx);
  if (!text) return c;

  const line = text.toUpperCase();
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#ffd766';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = '9px'; } catch { /* older engines: no letterspacing */ }
  // fit within ~26 table units; shrink for long declarations
  let px = 30;
  const maxW = 26 * DECAL_PX_PER_UNIT;
  for (; px > 13; px--) {
    ctx.font = `${px}px Georgia, 'Times New Roman', serif`;
    if (ctx.measureText(line).width <= maxW) break;
  }
  ctx.fillText(line, DECAL_SIZE / 2, DECAL_SIZE / 2 + 3.4 * DECAL_PX_PER_UNIT);
  ctx.restore();
  return c;
}

function makeFeltTexture(base) {
  return decalTexture(base, null);
}

function decalTexture(base, text) {
  const tex = new THREE.CanvasTexture(feltCanvas(base, text));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function swapFloorMap(tex) {
  const old = floor.material.map;
  floor.material.map = tex;
  floor.material.needsUpdate = true;
  if (old) old.dispose();
}

function applyMatDecal(text) {
  if (typeof text !== 'string' || !text.trim()) return;
  matDecalText = text.trim();
  swapFloorMap(decalTexture(FELT_THEMES[currentFeltId].feltBase, matDecalText));
}

function clearMatDecal() {
  if (matDecalText === null) return;
  matDecalText = null;
  swapFloorMap(makeFeltTexture(FELT_THEMES[currentFeltId].feltBase));
}

// Repaint the live floor for the current shelf occupancy: same base, same mat
// text, fresh glow rings. Called on every shelf change (reflowShelf, the
// whisk-end landing, the corner sweep) — the same recomposite path mat text
// already rides, so theme changes and ceremonies compose with the rings.
function recompositeFelt() {
  swapFloorMap(matDecalText !== null
    ? decalTexture(FELT_THEMES[currentFeltId].feltBase, matDecalText)
    : makeFeltTexture(FELT_THEMES[currentFeltId].feltBase));
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({
    map: makeFeltTexture(FELT_THEMES[DEFAULT_FELT].feltBase),
    roughness: 0.95,
    metalness: 0,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Swap the felt + scene background live. Returns false for unknown ids — the
// id can arrive off the wire or from localStorage, never trust it blindly.
function applyFeltTheme(id) {
  const theme = FELT_THEMES[id];
  if (!theme) return false;
  currentFeltId = id;
  // A theme change mid-ceremony keeps the mat text (and any shelf glow):
  // recomposite on the new base.
  recompositeFelt();
  scene.background = new THREE.Color(theme.sceneBg);
  renderFeltSwatches(); // keep the settings-modal selection mirrored
  return true;
}

// ---------------------------------------------------------------------------
// Physics world
// ---------------------------------------------------------------------------

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
world.allowSleep = true;
world.solver.iterations = 14;

const diceMat = new CANNON.Material('dice');
const floorMat = new CANNON.Material('floor');
const wallMat = new CANNON.Material('wall');
world.addContactMaterial(new CANNON.ContactMaterial(diceMat, floorMat, { friction: 0.25, restitution: 0.35 }));
world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.15, restitution: 0.45 }));
world.addContactMaterial(new CANNON.ContactMaterial(diceMat, wallMat, { friction: 0.05, restitution: 0.7 }));

function addStaticPlane(material, position, euler) {
  const body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material });
  body.position.set(...position);
  body.quaternion.setFromEuler(...euler);
  world.addBody(body);
}
addStaticPlane(floorMat, [0, 0, 0], [-Math.PI / 2, 0, 0]);                   // floor
addStaticPlane(wallMat, [0, 0, -TABLE_D / 2], [0, 0, 0]);                    // back
addStaticPlane(wallMat, [0, 0, TABLE_D / 2], [0, Math.PI, 0]);               // front
addStaticPlane(wallMat, [-TABLE_W / 2, 0, 0], [0, Math.PI / 2, 0]);          // left
addStaticPlane(wallMat, [TABLE_W / 2, 0, 0], [0, -Math.PI / 2, 0]);          // right
addStaticPlane(wallMat, [0, 22, 0], [Math.PI / 2, 0, 0]);                    // ceiling

// ---------------------------------------------------------------------------
// Sound (procedural clicks on impact)
// ---------------------------------------------------------------------------

let audioCtx = null;
// Persisted "Just you" preference ('dice.sound.v1'), honored on load. load()
// is a hoisted function declaration, so calling it here is safe.
let soundOn = load(LS_SOUND, true) !== false;
let lastSoundAt = 0;

function playClick(strength) {
  if (!soundOn) return;
  const now = performance.now();
  if (now - lastSoundAt < 35) return;
  lastSoundAt = now;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  }
  const dur = 0.045;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.25));
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1600 + Math.random() * 1800;
  filter.Q.value = 1.2;
  const gain = audioCtx.createGain();
  gain.gain.value = Math.min(0.35, strength * 0.06);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start();
}

// ---------------------------------------------------------------------------
// Roll engine: simulate-ahead + keyframe playback + face correction
//
// playRoll(roll) synchronously fast-forwards the cannon world for the roll's
// dice (all randomness seeded via mulberry32(roll.seed)), recording per-die
// keyframes and collision-sound events. It then computes a per-die corrective
// body-frame rotation R so each die lands showing roll.values[i] (the
// authoritative value — locally generated in solo mode, server-generated in
// online mode), and plays the keyframes back in tick(dt). Settled dice keep
// frozen mass-0 static bodies in the world so later fast-forwards collide
// with them.
// ---------------------------------------------------------------------------

let tableDice = [];        // every die on the table; settled dice have static bodies
let currentRoll = null;    // active playback state (see playRoll)
const rollQueue = [];      // rolls waiting while a playback is in flight (FIFO)

// Per-roll Done (§7.5): dice leaving the table sink/fade for ~300 ms before
// their meshes are dropped. Bodies leave the physics world immediately —
// a departing die must not deflect a later fast-forward. Rolls cleared while
// still mid-playback (or queued) defer removal until their playback settles.
const CLEAR_SINK_S = 0.3;
let sinking = [];                // {mesh, chip, t, y0}
const pendingClears = new Set(); // rollIds whose removal is deferred

// Reveal (goal 11): a reveal landing while its roll is still mid-playback or
// queued defers exactly like pendingClears/pendingCollects (the 7f9cdf5 race
// class) and lands from the completion paths. Value: the full entry the
// 'reveal' event carried (null when the event was id-only — solo, or a roll
// whose values this client already holds).
const pendingReveals = new Map(); // rollId -> full entry | null
const REVEAL_FLIP_S = 0.45;       // staged correction rotation on reveal
let revealing = [];               // {die, rollId, t, fromQuat, toQuat}

const FIXED_DT = 1 / 60;
const SETTLE_STILL = 0.45; // seconds of stillness required
const SETTLE_CAP = 9;      // hard cap on simulated seconds per roll

// Deterministic PRNG — every client fast-forwards the same throw from the seed.
function mulberry32(a) {
  a |= 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSeed() {
  if (window.crypto && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return (Math.random() * 0x100000000) >>> 0;
}

function dieLabel(type, value) {
  return type === 'd10x' ? String(value).padStart(2, '0') : String(value);
}

function spawnDie(type, index, count, side, rng, shrouded = false) {
  const mesh = createDieMesh(type, shrouded ? 'shroud' : 'std');
  const body = createDieBody(type, diceMat);

  // line the throw up along the chosen edge of the table
  const spread = Math.min(TABLE_W - 6, count * 2.6);
  const offset = count === 1 ? 0 : -spread / 2 + (spread * index) / (count - 1);
  const jitter = () => (rng() - 0.5) * 1.2;

  if (side === 0) body.position.set(offset + jitter(), 6 + rng() * 4 + index * 0.9, TABLE_D / 2 - 2.2);
  else if (side === 1) body.position.set(offset + jitter(), 6 + rng() * 4 + index * 0.9, -TABLE_D / 2 + 2.2);
  else if (side === 2) body.position.set(-TABLE_W / 2 + 2.2, 6 + rng() * 4 + index * 0.9, offset * 0.5 + jitter());
  else body.position.set(TABLE_W / 2 - 2.2, 6 + rng() * 4 + index * 0.9, offset * 0.5 + jitter());

  // hurl it toward a random point near the middle of the table
  const target = new CANNON.Vec3((rng() - 0.5) * TABLE_W * 0.4, 0, (rng() - 0.5) * TABLE_D * 0.4);
  const dir = target.vsub(body.position);
  dir.y = 0;
  dir.normalize();
  const speed = 14 + rng() * 8;
  body.velocity.set(dir.x * speed, -2 - rng() * 3, dir.z * speed);
  body.angularVelocity.set((rng() - 0.5) * 30, (rng() - 0.5) * 30, (rng() - 0.5) * 30);
  body.quaternion.setFromEuler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);

  world.addBody(body);
  scene.add(mesh);
  return { type, mesh, body };
}

// Remove every die, chip, marker, and banner from view WITHOUT touching the
// playback queue or the in-flight roll. The corner ✕ sweep (clearTable) is
// the only caller now that the 40-dice whole-table wipe is retired (§7.7):
// the shelf clusters and their markers go down with everything else.
function resetTableSurface() {
  finishSinkingNow();
  for (const d of tableDice) {
    world.removeBody(d.body);
    scene.remove(d.mesh);
  }
  tableDice = [];
  chips.length = 0;
  chipsLayer.innerHTML = '';
  whisking = [];
  revealing = [];
  shelfClusters.clear();
  // A peek is anchored to a cluster that no longer exists: it would float over
  // the empty table with a ✕ that clears a roll already gone. The sweep takes
  // it too (§7.7.1 — one card, and only while its roll is on the shelf).
  closePeek();
  recompositeFelt(); // the swept shelf takes its glow rings with it
  shelfLayer.innerHTML = '';
  banner.classList.add('hidden');
}

// ---- per-roll Done (§7.5) --------------------------------------------------

// Advance the sink/fade of departing dice. dt-driven from tick() so
// __diceDebug.sim() covers it; the chip fade is a CSS transition that only
// decorates the same 300 ms window.
function stepSinking(dt) {
  if (!sinking.length) return;
  let anyDone = false;
  for (const s of sinking) {
    s.t += dt;
    const p = Math.min(s.t / CLEAR_SINK_S, 1);
    s.mesh.position.y = s.y0 - p * 2.4;
    s.mesh.scale.setScalar(1 - 0.35 * p);
    if (s.t >= CLEAR_SINK_S) anyDone = true;
  }
  if (!anyDone) return;
  sinking = sinking.filter((s) => {
    if (s.t < CLEAR_SINK_S) return true;
    // Geometry/materials are shared per die type (js/dice.js cache): drop the
    // mesh from the scene and dispose nothing.
    scene.remove(s.mesh);
    if (s.chip) s.chip.remove();
    return false;
  });
}

// Instantly flush any in-flight sinks (table reset / full sweep).
function finishSinkingNow() {
  for (const s of sinking) {
    scene.remove(s.mesh);
    if (s.chip) s.chip.remove();
  }
  sinking = [];
}

// Remove one roll's dice + their chips with the sink/fade. Other rolls'
// dice are untouched. Returns whether anything was on the table for it.
function removeRollDice(rollId) {
  const going = tableDice.filter((d) => d.rollId === rollId);
  if (!going.length) return false;
  tableDice = tableDice.filter((d) => d.rollId !== rollId);
  const goingSet = new Set(going);
  for (let i = chips.length - 1; i >= 0; i--) {
    if (goingSet.has(chips[i].die)) {
      const { el, die } = chips[i];
      el.classList.add('chip-clearing');
      die.chipEl = el; // picked up by the sink record below
      chips.splice(i, 1);
    }
  }
  for (const d of going) {
    world.removeBody(d.body);
    sinking.push({ mesh: d.mesh, chip: d.chipEl || null, t: 0, y0: d.mesh.position.y });
  }
  return true;
}

// A roll was cleared ('roll-cleared' event, or the local solo path). If this
// client is still playing that roll back — or has it queued — removal defers
// until its own playback settles (§7.5); the pending clear runs from the
// completion paths (stepPlayback's showResults / ceremonyFinish).
function applyClearRoll(rollId) {
  if (!rollId) return;
  // cleared implies off-shelf (§7.7): the state row flips first so a
  // roll-collected landing later in the same burst becomes a silent no-op.
  rollState(rollId).cleared = true;
  pendingCollects.delete(rollId);
  pendingReveals.delete(rollId);
  revealing = revealing.filter((rv) => rv.rollId !== rollId); // dying dice stop flipping
  const inFlight = currentRoll && !currentRoll.done && currentRoll.rollId === rollId;
  if (inFlight || rollQueue.some((r) => r.rollId === rollId)) {
    pendingClears.add(rollId);
    return;
  }
  // A whisk still in the air joins the sink from wherever it is.
  whisking = whisking.filter((w) => w.die.rollId !== rollId);
  const hadDice = removeRollDice(rollId);
  // A shelved roll sinks marker and cluster together (§7.7 aging): the marker
  // rides the last sink record so stepSinking fades and drops it dt-driven.
  const cluster = shelfClusters.get(rollId);
  if (cluster) {
    shelfClusters.delete(rollId);
    if (cluster.markerEl) {
      cluster.markerEl.classList.add('chip-clearing');
      if (hadDice && sinking.length) sinking[sinking.length - 1].chip = cluster.markerEl;
      else cluster.markerEl.remove();
    }
    // The shelf closes up behind it: everything newer slides one slot left.
    reflowShelf();
    renderShelfMarkers();
  }
  // The moment leaves with its dice: banner and verdict card for THIS roll
  // close everywhere. Other rolls' surfaces are untouched.
  if (lastEntry && lastEntry.rollId === rollId) banner.classList.add('hidden');
  if (currentRoll && currentRoll.rollId === rollId && currentRoll.ceremony
      && !ceremonyLayer.classList.contains('hidden')) {
    dismissCeremonyUI();
  }
}

// Completion hook: a clear that arrived mid-playback lands now.
function runPendingClear(roll) {
  if (roll.rollId && pendingClears.has(roll.rollId)) {
    pendingClears.delete(roll.rollId);
    applyClearRoll(roll.rollId);
  }
}

// Roller-side Done. Online the server validates (roller only) and everyone —
// us included — reacts to the 'roll-cleared' broadcast; solo applies locally.
// Resolves whether the clear actually happened, so callers never dismiss the
// only Done affordance for dice that are in fact still on everyone's table.
function requestClearRoll(rollId) {
  if (netOnline && net) return net.clearRoll(rollId);
  applyClearRoll(rollId);
  return Promise.resolve(true);
}

// ---- the collect shelf (§7.7) ----------------------------------------------
//
// The main felt belongs to ONE roll at a time; history lives on the shelf.
// The server owns the state machine (on-felt → collected(seq) → cleared) and
// clients only ever react to its 'roll-collected' / 'roll-cleared' bursts;
// solo mode mirrors the same machine locally (soloCollectEntries). A shelved
// roll's dice sit as a settled, deterministic cluster in its slot with one
// compact marker floating above; its per-die chips, banner and verdict card
// retire the moment it is collected.
//
// SLOTS ARE RANKS, not addresses: slot i holds the i-th lowest live collection
// seq (reflowShelf), so the shelf always reads oldest → newest, left to right,
// with no gaps. That is the only assignment that survives a resync — see
// reflowShelf for why a remembered slot table cannot.

const WHISK_S = 0.4;                  // collect whisk: slide + settle duration
const shelfLayer = document.getElementById('shelf-layer');
const rollStates = new Map();         // rollId -> {collected: seq|null, cleared}
// shelfClusters (rollId -> cluster) is declared up in the felt section: the
// floor composite reads it before this section evaluates.
const pendingCollects = new Map();    // rollId -> seq, deferred like pendingClears
let whisking = [];                    // {die, t, fromPos, fromQuat, toPos, toQuat}
let soloCollectSeq = 0;               // solo mirror of the server's room counter

// Every roll that ever touched this table gets a state row (playRoll seeds
// it); the solo auto-collect walks these, never the persisted localStorage log.
function rollState(rollId) {
  let st = rollStates.get(rollId);
  if (!st) {
    st = { collected: null, cleared: false };
    rollStates.set(rollId, st);
  }
  return st;
}

// Canonical shelved pose for a die showing `value`: the face normal rotated
// straight up, resting exactly on the felt (lowest rotated vertex at y=0).
// Pure function of (type, value), so every client computes the same pose.
// Also measures the resting die: `h` is its full height and `r` the radius of
// its footprint, which is what lets a cluster size itself to the tray instead
// of guessing (see clusterPoses).
const shelfPoseCache = new Map();
function canonicalDiePose(type, value) {
  const key = `${type}:${value}`;
  let p = shelfPoseCache.get(key);
  if (p) return p;
  const quat = new THREE.Quaternion();
  const nV = faceNormalForValue(type, value);
  if (nV) quat.setFromUnitVectors(nV.clone().normalize(), new THREE.Vector3(0, 1, 0));
  const posAttr = createDieMesh(type).geometry.attributes.position; // shared cache in js/dice.js
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  let maxR = 0;
  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i).applyQuaternion(quat);
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    const r = Math.hypot(v.x, v.z);
    if (r > maxR) maxR = r;
  }
  p = { quat, y: -minY, h: maxY - minY, r: maxR };
  shelfPoseCache.set(key, p);
  return p;
}

// Deterministic tight arrangement (§7.7) for a whole roll: a pile that FITS
// ITS TRAY. The grid is sized from the dice actually being shelved — a slot
// holds three d6 abreast but only two d20 — and wraps into a further storey
// once the tray floor is full, each storey exactly one die tall.
//
// Staying inside the tray is not cosmetic: a shelved die keeps a STATIC body,
// so any part of the pile left standing on the active felt silently deflects
// every roll that follows. Pure function of (slot, parts), so a live whisk and
// a reload's reconstruction land bit-for-bit identical clusters.
const SHELF_PACK = 0.88;    // neighbour spacing as a share of a die's width
const SHELF_STOREY_GAP = 0.06;
function clusterPoses(slot, parts) {
  const poses = parts.map((p) => canonicalDiePose(p.type, p.value));
  const rMax = Math.max(0.5, ...poses.map((p) => p.r));
  const hMax = Math.max(...poses.map((p) => p.h));
  const step = 2 * rMax * SHELF_PACK;
  const fit = (span) => Math.max(1, Math.min(3, Math.floor((span - 2 * rMax) / step) + 1));
  const cols = fit(SHELF_SLOT_W);
  const perStorey = cols * fit(SHELF_SLOT_D);
  return parts.map((_, i) => {
    const storey = Math.floor(i / perStorey);
    const k = i % perStorey;
    const col = k % cols;
    const row = Math.floor(k / cols);
    // The last storey is usually partial: center what it actually holds.
    const n = Math.min(parts.length - storey * perStorey, perStorey);
    const rows = Math.ceil(n / cols);
    const inRow = Math.min(cols, n - row * cols);
    const p = poses[i];
    return {
      pos: new THREE.Vector3(
        shelfSlotX(slot) + (col - (inRow - 1) / 2) * step,
        p.y + storey * (hMax + SHELF_STOREY_GAP),
        SHELF_Z + ((rows - 1) / 2 - row) * step
      ),
      quat: p.quat,
    };
  });
}

// The POSE a shrouded die rests in: identity correction leaves a die cocked on
// whatever the physics left, so shrouded shelf clusters (and reconstructions)
// borrow the canonical pose of a real face — the faces are blank, so which one
// is up leaks nothing, but the die must still sit flat.
function shroudPoseValue(type) {
  return type === 'd10x' ? 10 : 1;
}

// Spawn one die settled on the shelf (hello reconstruction, or a collect for
// an entry whose felt this client never saw). reflowShelf gives it its pose;
// `shelfSpawn` marks it as never-having-been-on-the-felt, so it lands instantly
// instead of whisking in from wherever the origin happens to be. No tumble, no
// sound. `shrouded` spawns the obsidian variant for a still-hidden roll.
function spawnShelvedDie(type, value, rollId, shrouded = false) {
  const mesh = createDieMesh(type, shrouded ? 'shroud' : 'std');
  const body = createDieBody(type, diceMat);
  body.mass = 0;
  body.type = CANNON.Body.STATIC;
  body.updateMassProperties();
  world.addBody(body);
  scene.add(mesh);
  const die = { type, mesh, body, rollId, shelfValue: value, shelfSpawn: true, shrouded };
  tableDice.push(die);
  return die;
}

// Put one cluster's dice at its slot's cluster poses. The STATIC bodies are
// parked immediately — a later fast-forward must collide with the shelf as it
// IS, not with ghosts left at the old felt positions, and every client's
// physics world has to match — while the meshes either whisk across (~400 ms)
// or jump, so a reconstruction and a re-flow after an eviction cost nothing.
function placeCluster(c, animate) {
  const dice = tableDice.filter((d) => d.rollId === c.rollId);
  if (!dice.length) return;
  const poses = clusterPoses(c.slot, dice.map((d) => ({ type: d.type, value: d.shelfValue })));
  const moving = new Set(dice);
  whisking = whisking.filter((w) => !moving.has(w.die)); // one whisk per die
  // A die can't flip and whisk at once: the whisk's target pose already shows
  // the true face (materials were swapped when the reveal began).
  revealing = revealing.filter((rv) => !moving.has(rv.die));
  // The under-glow belongs to a LANDED cluster (§7.7.1): a cluster ARRIVING on
  // the shelf holds its ring back until stepWhisking sees its dice land;
  // instant placements (hello reconstruction, spawned shelved dice) glow at
  // once. A cluster that is ALREADY lit keeps its ring through a reflow slide —
  // its ring simply moves to the new slot with it (what reflowShelf's own
  // recomposite promises). Dropping it would black out every surviving cluster
  // for the whole 0.4 s whisk on each eviction or middle-marker ✕, which is
  // exactly when the player is looking at the shelf.
  if (!c.glow) c.glow = !(animate && dice.some((d) => !d.shelfSpawn));
  dice.forEach((d, i) => {
    const { pos, quat } = poses[i];
    d.body.position.set(pos.x, pos.y, pos.z);
    d.body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    if (animate && !d.shelfSpawn) {
      whisking.push({
        die: d,
        t: 0,
        fromPos: d.mesh.position.clone(),
        fromQuat: d.mesh.quaternion.clone(),
        toPos: pos,
        toQuat: quat,
      });
    } else {
      d.mesh.position.copy(pos);
      d.mesh.quaternion.copy(quat);
    }
    d.shelfSpawn = false;
  });
}

// Assign slots and place every cluster that moved. Slot i holds the i-th
// LOWEST live seq — the shelf reads oldest → newest, left to right, and closes
// up when a roll leaves.
//
// Rank, not a remembered address, because the assignment has to be a pure
// function of the live set: a hello tells a joining client WHICH rolls are on
// the shelf, never the order the departed ones left in, so any table that
// remembers "this roll kept slot 3" reconstructs differently for whoever
// reloaded — two clients rendering different tables with no event that can
// reconcile them. (Keying the slot off the seq directly, seq % 5, is worse
// still: one ✕ on a middle marker punches a hole in the live window, and the
// next collect lands its dice inside an older roll's cluster with its marker —
// and its ✕ — stacked on top, unclickable.)
function reflowShelf(animate = true) {
  const clusters = [...shelfClusters.values()].sort((a, b) => a.seq - b.seq);
  clusters.forEach((c, i) => {
    // The cap belongs to the server (and to the solo mirror): a client's live
    // set is only ever a subset of it, because a deferred collect withholds
    // the NEWEST roll, never an older one. The clamp is belt and braces —
    // never address a slot the shelf does not have.
    const slot = Math.min(i, SHELF_SLOTS - 1);
    if (c.slot === slot && c.placed) return;
    c.slot = slot;
    c.placed = true;
    placeCluster(c, animate);
  });
  positionShelfMarkers();
  // Occupancy changed (a collect, an eviction, a hole closing up): the felt's
  // glow rings follow immediately — a departed cluster's ring must never
  // outlive it, and a landed survivor's ring moves to its new slot.
  recompositeFelt();
}

// Move one roll onto the shelf. animate=true plays the ~400 ms whisk; false
// (hello reconstruction) lands everything instantly. Idempotent — a repeat
// collect for a shelved or cleared roll changes nothing.
function shelveRoll(rollId, seq, animate) {
  const st = rollState(rollId);
  st.collected = seq;
  if (st.cleared || shelfClusters.has(rollId)) return;
  const entry = log.find((e) => e.rollId === rollId) || null;
  let dice = tableDice.filter((d) => d.rollId === rollId);

  // The per-die chips retire into the one marker.
  const going = new Set(dice);
  for (let i = chips.length - 1; i >= 0; i--) {
    if (going.has(chips[i].die)) {
      chips[i].el.remove();
      chips.splice(i, 1);
    }
  }

  if (dice.length) {
    // The frozen body's orientation reads the authoritative settled value —
    // except for a shrouded die, whose identity correction would fabricate a
    // plausible-but-wrong number: it takes the neutral shroud pose instead.
    for (const d of dice) {
      d.shelfValue = d.shrouded
        ? shroudPoseValue(d.type)
        : readValue(d.type, d.body.quaternion).value;
    }
  } else if (entry) {
    const hidden = entryHidden(entry);
    dice = entry.parts.map((p) => {
      const shrouded = hidden || p.value == null;
      return spawnShelvedDie(p.type, shrouded ? shroudPoseValue(p.type) : p.value, rollId, shrouded);
    });
  } else {
    return; // nothing to show yet; the state row reconciles on the next hello
  }

  shelfClusters.set(rollId, {
    rollId, seq, slot: -1, placed: false, diceCount: dice.length, markerEl: null, glow: false,
  });
  // The moment leaves the felt surfaces: banner and verdict card for THIS
  // roll close everywhere; the log line and the marker carry it from here.
  if (lastEntry && lastEntry.rollId === rollId) banner.classList.add('hidden');
  if (stagedVerdict && stagedVerdict.entry.rollId === rollId
      && !ceremonyLayer.classList.contains('hidden')) {
    dismissCeremonyUI();
  }
  reflowShelf(animate);
  renderShelfMarkers();
}

// Advance collect whisks: dt-driven mesh slide with a small carry arc, easing
// onto the exact cluster pose (the bodies are already parked there).
function stepWhisking(dt) {
  if (!whisking.length) return;
  let anyDone = false;
  for (const w of whisking) {
    w.t += dt;
    const p = Math.min(w.t / WHISK_S, 1);
    const e = 1 - (1 - p) ** 3; // ease-out cubic
    w.die.mesh.position.lerpVectors(w.fromPos, w.toPos, e);
    w.die.mesh.position.y += Math.sin(p * Math.PI) * 1.4;
    w.die.mesh.quaternion.slerpQuaternions(w.fromQuat, w.toQuat, e);
    if (p >= 1) anyDone = true;
  }
  if (!anyDone) return;
  whisking = whisking.filter((w) => {
    if (w.t < WHISK_S) return true;
    w.die.mesh.position.copy(w.toPos);
    w.die.mesh.quaternion.copy(w.toQuat);
    return false;
  });
  // Whisk-end is when a cluster's under-glow fades in (§7.7.1 "appears as the
  // whisk lands"): light every cluster whose dice have all arrived.
  let landed = false;
  for (const c of shelfClusters.values()) {
    if (!c.glow && !whisking.some((w) => w.die.rollId === c.rollId)) {
      c.glow = true;
      landed = true;
    }
  }
  if (landed) recompositeFelt();
}

// One INVISIBLE marker per shelved roll (P1 quiet by default, taken all the
// way): the settled cluster is its own presence, so the target draws nothing
// at rest — no dot, no total, no lens word, and a held roll never shouts '?'.
// Hover/tap expands the peek card (§7.7.1), which carries the full result,
// Reveal for the authority, and the prominent clear-✕ ANY player may use
// (§7.7 universal housekeeping). Rebuilt whole on every shelf/lens/reveal
// change.
function renderShelfMarkers() {
  // Markers mid-fade are NOT ours to wipe: an eviction is 'roll-cleared'
  // immediately followed by 'roll-collected', so a wholesale innerHTML reset
  // here would pop the departing marker out of existence a millisecond into
  // its sink — the aging animation would never be visible on the very path
  // that aging takes. stepSinking drops them when their dice are gone.
  for (const el of [...shelfLayer.children]) {
    if (!el.classList.contains('chip-clearing')) el.remove();
  }
  const clusters = [...shelfClusters.values()].sort((a, b) => a.seq - b.seq);
  for (const c of clusters) {
    const entry = log.find((e) => e.rollId === c.rollId) || null;
    const el = document.createElement('div');
    el.className = 'shelf-marker';
    el.dataset.rollId = c.rollId;
    // No visible body: the settled cluster IS the marker's presence, and the
    // roller's color dot lives in the peek card this target opens.
    // A held roll's Reveal lives in its peek card: the shelf is where a held
    // roll spends its life (auto-collect fires on ANYONE's next roll), and
    // the peek renders Reveal for the authority (the server enforces it
    // regardless) — the resting marker stays a quiet dot either way.
    if (entry && entry.playerName) el.title = `${entry.playerName} · ${entry.label}`;
    else if (entry) el.title = entry.label;
    // Peek (§7.7.1): hover opens after the intent delay (desktop); a tap — or
    // a click anywhere that is not one of the marker's own buttons — toggles.
    el.addEventListener('pointerenter', (ev) => {
      if (ev.pointerType === 'mouse') schedulePeekOpen(c.rollId);
    });
    el.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType === 'mouse') schedulePeekClose();
    });
    el.addEventListener('click', (ev) => {
      const t = ev.target;
      if (t instanceof HTMLElement && t.closest('button')) return;
      if (peekRollId === c.rollId) closePeek();
      else openPeek(c.rollId);
    });
    c.markerEl = el;
    shelfLayer.appendChild(el);
  }
  positionShelfMarkers();
  // An open peek re-reads whatever changed here — a reveal, a lens toggle, a
  // reflowed slot — or closes if its roll just left the shelf.
  renderPeek();
}

function positionShelfMarkers() {
  const v = new THREE.Vector3();
  for (const c of shelfClusters.values()) {
    if (!c.markerEl) continue;
    v.set(shelfSlotX(c.slot), SHELF_MARKER_Y, SHELF_Z);
    v.project(camera);
    c.markerEl.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    c.markerEl.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
  positionPeek(); // the open card rides its slot through reflows and reframes
}

// ---- peek cards (§7.7.1) ----------------------------------------------------
//
// A collected roll keeps its information: hovering (desktop, ~150 ms intent
// delay) or tapping a shelf marker expands ONE full result card above its
// slot — the same content as the result banner for that roll (roller name +
// color, label, total, DC verdict, meaning word under the ACTIVE lens, full
// breakdown with struck dice / ✴ children / named bonuses), built with the
// same safe helpers: textContent for user strings, renderBreakdown for the
// math. One peek at a time; pointerleave / tap-away / second tap / Esc closes
// (Esc peels it above the ± popover, below palette/cheatsheet/settings).
// renderShelfMarkers already runs on every reveal, lens toggle, and shelf
// change, so calling renderPeek from it keeps an open card honest — and
// closes it the moment its roll leaves the shelf.

const PEEK_HOVER_MS = 60;    // hover intent delay before the card opens
const PEEK_CLOSE_MS = 220;   // grace to cross from marker into the card
const peekEl = document.getElementById('peek-card');
let peekRollId = null;       // rollId of the open peek, or null
let peekHoverTimer = null;
let peekCloseTimer = null;
let peekW = 0;               // card box, cached by measurePeek (see positionPeek)
let peekH = 0;

function isPeekOpen() { return peekRollId !== null; }

function cancelPeekTimers() {
  clearTimeout(peekHoverTimer);
  clearTimeout(peekCloseTimer);
  peekHoverTimer = peekCloseTimer = null;
}

function closePeek() {
  cancelPeekTimers();
  peekRollId = null;
  peekEl.classList.add('hidden');
  peekEl.textContent = '';
}

// Open (or retarget) the peek for a shelved roll. False for anything not on
// the shelf — a peek without a cluster has no slot to anchor to.
function openPeek(rollId) {
  if (!shelfClusters.has(rollId)) return false;
  cancelPeekTimers();
  peekRollId = rollId;
  renderPeek();
  return peekRollId === rollId;
}

function schedulePeekOpen(rollId) {
  cancelPeekTimers();
  peekHoverTimer = setTimeout(() => openPeek(rollId), PEEK_HOVER_MS);
}

function schedulePeekClose() {
  cancelPeekTimers();
  peekCloseTimer = setTimeout(closePeek, PEEK_CLOSE_MS);
}

// Rebuild the open card's content from the log entry (the same source the
// banner and log line read). Face-down unrevealed: '?' plus the marker's
// Reveal affordance for the roller — no values leak.
function renderPeek() {
  if (peekRollId === null) return;
  const c = shelfClusters.get(peekRollId);
  if (!c) { closePeek(); return; }
  const entry = log.find((e) => e.rollId === peekRollId) || null;
  const hidden = !entry || entryHidden(entry);
  peekEl.textContent = '';

  // header: roller dot + name (their color) + label. The clear-✕ lives at
  // the card's base — see the foot below.
  const head = document.createElement('div');
  head.className = 'pk-head';
  const dot = document.createElement('span');
  dot.className = 'sm-dot';
  dot.style.background = (entry && entry.color) || '#8a7f6e';
  head.appendChild(dot);
  const who = document.createElement('span');
  who.className = 'pk-who';
  if (entry && entry.playerName) {
    const nm = document.createElement('span');
    nm.className = 'roller-name';
    if (entry.color) nm.style.color = entry.color;
    nm.textContent = entry.playerName;
    who.append(nm, ` · ${entry.label}`);
  } else {
    who.textContent = entry ? entry.label : 'collected roll';
  }
  head.appendChild(who);
  peekEl.appendChild(head);

  const total = document.createElement('div');
  total.className = 'pk-total';
  total.textContent = hidden ? '?' : String(entry.total);
  peekEl.appendChild(total);

  const verdict = document.createElement('div');
  verdict.className = 'pk-verdict';
  if (entry && Number.isInteger(entry.dc)) {
    if (hidden) {
      // Stakes are public even while the result is hidden (goal 11): the DC
      // shows, the verdict does not.
      verdict.textContent = `vs DC ${entry.dc}`;
    } else {
      const cleared = entry.total >= entry.dc;
      verdict.textContent = `vs DC ${entry.dc} — ${cleared ? 'Success' : 'Failure'}`;
      verdict.classList.add(cleared ? 'verdict-success' : 'verdict-fail');
    }
  }
  peekEl.appendChild(verdict);

  const meaningEl = document.createElement('div');
  meaningEl.className = 'pk-meaning';
  const meaning = entry && !hidden ? entryMeaning(entry) : null;
  if (meaning) {
    meaningEl.textContent = meaning.word;
    meaningEl.classList.add(`tier-${meaning.tier}`);
    meaningEl.title = `${meaning.rank} column (${meaning.column})`;
  }
  peekEl.appendChild(meaningEl);

  const bd = document.createElement('div');
  bd.className = 'pk-breakdown';
  if (entry) renderBreakdown(bd, entry, hidden);
  peekEl.appendChild(bd);

  const actions = document.createElement('div');
  actions.className = 'pk-actions';
  if (entry && canReveal(entry)) {
    const rv = document.createElement('button');
    rv.className = 'sm-reveal pk-reveal';
    rv.textContent = 'Reveal';
    rv.title = 'Flip this roll face up for the table';
    rv.addEventListener('click', () => requestReveal(c.rollId));
    actions.appendChild(rv);
  }
  // A shelved roll stays actionable (same readability gate as the log's ⟳):
  // roll it again as-is, or pull it back into the compose draft to tweak.
  if (entry && canReroll(entry)) {
    const again = document.createElement('button');
    again.className = 'sm-reveal pk-again';
    again.textContent = '⟳ Roll again';
    again.title = 'Roll this again';
    again.addEventListener('click', () => {
      closePeek();
      requestRoll([...entry.spec.dice], entry.label, {
        mods: entry.spec.mods || undefined,
        faceDown: entry.faceDown,
        visibility: entryVis(entry) || undefined, // the privacy rides along
        dc: Number.isInteger(entry.dc) ? entry.dc : undefined,
        exp: entry.spec.exp || undefined, // reroll preserves the moment
      });
    });
    actions.appendChild(again);
    const tweak = document.createElement('button');
    tweak.className = 'sm-reveal pk-tweak';
    tweak.textContent = '±';
    tweak.title = 'Load into the compose draft to modify';
    tweak.addEventListener('click', () => {
      // The roll's own notation (comment intact) when we have it; else the
      // canonical reconstruction from the spec the viewer may read.
      const raw = entry.notation && parseNotation(entry.notation).ok ? entry.notation
        : canonicalWithVis(entry.spec, {
          dc: Number.isInteger(entry.dc) ? entry.dc : null,
          exp: entry.spec.exp || null,
          faceDown: entry.faceDown,
        }, entryVis(entry));
      closePeek();
      setPanel('compose', true);
      loadIntoBox(raw, '');
      openPopover({ source: 'tray', row: document.getElementById('tray-actions') });
    });
    actions.appendChild(tweak);
  }
  if (actions.childElementCount) peekEl.appendChild(actions);

  // The card's base carries the ONE prominent clear-✕ — the unified 'clear
  // this roll' gesture (same glyph, same sentence as the banner's and the
  // verdict card's). Any player may use it once a roll is shelved (§7.7
  // universal housekeeping; the server allows it for collected rolls).
  const foot = document.createElement('div');
  foot.className = 'pk-foot';
  const clear = document.createElement('button');
  clear.className = 'clear-x pk-clear';
  clear.textContent = '✕';
  clear.title = 'Clear this roll for everyone';
  clear.addEventListener('click', () => requestClearRoll(c.rollId));
  foot.appendChild(clear);
  peekEl.appendChild(foot);

  peekEl.classList.remove('hidden');
  measurePeek();
  positionPeek();
}

// The card's box, read exactly where it can actually change: its own content
// (renderPeek) and the viewport (resize / compact toggle). positionPeek runs
// from positionShelfMarkers on EVERY animation frame while a peek is open, so
// it must not touch layout — an offsetWidth read there forces a synchronous
// reflow per frame, immediately after the marker style writes, alongside the
// WebGL render and the physics step.
function measurePeek() {
  if (peekRollId === null) return;
  peekW = peekEl.offsetWidth;
  peekH = peekEl.offsetHeight;
}

// Anchor the card above its slot's marker point, clamped fully on screen —
// an edge slot at 480×360 still shows the whole card (flipping below the
// anchor if the top would clip). Write-only: see measurePeek.
function positionPeek() {
  if (peekRollId === null) return;
  const c = shelfClusters.get(peekRollId);
  if (!c) return;
  const v = new THREE.Vector3(shelfSlotX(c.slot), SHELF_MARKER_Y, SHELF_Z).project(camera);
  const ax = (v.x * 0.5 + 0.5) * window.innerWidth;
  const ay = (-v.y * 0.5 + 0.5) * window.innerHeight;
  const w = peekW;
  const h = peekH;
  const left = Math.max(8, Math.min(ax - w / 2, window.innerWidth - w - 8));
  let top = ay - 16 - h;
  if (top < 8) top = ay + 16; // clipped above: sit below the marker instead
  top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
  peekEl.style.left = `${left}px`;
  peekEl.style.top = `${top}px`;
}

// Crossing from the marker into the card must not close it (desktop).
peekEl.addEventListener('pointerenter', (e) => {
  if (e.pointerType === 'mouse') cancelPeekTimers();
});
peekEl.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') schedulePeekClose();
});

// Tap-away (touch) and click-away (desktop) both collapse the open peek.
document.addEventListener('pointerdown', (e) => {
  if (peekRollId === null) return;
  const t = e.target;
  if (t instanceof HTMLElement && (peekEl.contains(t) || t.closest('.shelf-marker'))) return;
  closePeek();
});

// A roll was collected ('roll-collected' event, the solo mirror, or a hello
// resync with animate=false). Mid-playback / queued rolls defer their whisk
// exactly as clears defer — always-interruptible playback keeps the stage,
// and the collect lands from the completion paths (runPendingCollect).
function applyRollCollected(rollId, seq, animate = true) {
  if (!rollId || !Number.isInteger(seq) || seq < 1) return;
  const st = rollState(rollId);
  st.collected = seq;
  if (st.cleared) return; // evicted in the same burst: nothing to show
  const inFlight = currentRoll && !currentRoll.done && currentRoll.rollId === rollId;
  if (inFlight || rollQueue.some((r) => r.rollId === rollId)) {
    pendingCollects.set(rollId, seq);
    return;
  }
  shelveRoll(rollId, seq, animate);
}

// Completion hook, the collect twin of runPendingClear. A pending clear wins:
// the roll goes straight down, never onto the shelf for one frame.
function runPendingCollect(roll) {
  if (roll.rollId && pendingCollects.has(roll.rollId)) {
    const seq = pendingCollects.get(roll.rollId);
    pendingCollects.delete(roll.rollId);
    if (!pendingClears.has(roll.rollId)) shelveRoll(roll.rollId, seq, true);
  }
}

// Solo mirror of the server's collectEntries: same monotonic seq, same cap,
// same burst order — evictions sink first, then the whisks, then the caller's
// own roll. rollIds already collected or cleared are skipped (idempotent).
function soloCollectEntries(rollIds) {
  const collected = [];
  for (const rollId of rollIds) {
    const st = rollState(rollId);
    if (st.cleared || st.collected) continue;
    st.collected = ++soloCollectSeq;
    collected.push(rollId);
  }
  if (!collected.length) return false;
  const active = [...rollStates.entries()]
    .filter(([, st]) => st.collected && !st.cleared)
    .sort((a, b) => a[1].collected - b[1].collected);
  const evicted = active.slice(0, Math.max(0, active.length - SHELF_SLOTS));
  for (const [rollId, st] of evicted) {
    st.cleared = true;
    applyClearRoll(rollId);
  }
  for (const rollId of collected) {
    const st = rollStates.get(rollId);
    if (!st.cleared) applyRollCollected(rollId, st.collected);
  }
  return true;
}

// Solo auto-collect: when a new roll EXECUTES, everything this session put on
// the felt that is still uncollected goes to the shelf — the same arrival
// beat the server drives online. Only session rolls (rollStates rows) are
// candidates; entries restored from localStorage never grew dice here.
function soloAutoCollect() {
  const ids = [];
  const seen = new Set();
  const push = (id) => {
    if (id && !seen.has(id) && rollStates.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  for (const e of log) push(e.rollId);
  if (currentRoll && currentRoll.rollId) push(currentRoll.rollId);
  for (const r of rollQueue) push(r.rollId);
  soloCollectEntries(ids);
}

// Roller-side Collect (§7.7). Online the server validates (roller only) and
// everyone — us included — reacts to the 'roll-collected' burst; solo runs
// the same machine locally. Resolves whether the collect actually happened.
function requestCollectRoll(rollId) {
  if (netOnline && net) return net.collectRoll(rollId);
  soloCollectEntries([rollId]);
  return Promise.resolve(true);
}

// A clear (user click or server 'clear' event) can land while a roll is
// mid-playback or still queued. Those rolls already carry authoritative
// values — the server logged them for everyone — so their log entries must
// not be lost, or this client's log diverges from the room's. Finalize them
// before wiping the table. (addLogEntry dedupes by rollId, so a later hello
// resync can never double-count these.)
function flushPendingRollLog() {
  if (currentRoll && !currentRoll.done) {
    currentRoll.done = true; // stepPlayback must not showResults it later
    addLogEntry(entryFromRoll(currentRoll));
  }
  while (rollQueue.length) addLogEntry(entryFromRoll(rollQueue.shift()));
}

// The corner ✕ sweep: felt, shelf, and every surface, gone. The §7.7 state
// rows are flagged `cleared` with them — solo has no server to remember for
// it, and a row left on-felt would let the NEXT roll's auto-collect shelve a
// roll this sweep just took away. Online the server flags its own log the same
// way, so both sides of a swept table agree with a fresh join.
function clearTable() {
  flushPendingRollLog();
  pendingClears.clear();
  pendingCollects.clear();
  pendingReveals.clear();
  for (const st of rollStates.values()) st.cleared = true;
  resetTableSurface();
  dismissCeremonyUI();
  currentRoll = null;
  rollQueue.length = 0;
}

// roll = {dice: [types], values: [...], seed, label, dc?, playerName?, color?}
// A REDACTED roll (goal 11) arrives with NO values at all (redacted: true,
// visMode 'held'|'whisper'): it plays the identical seeded tumble with
// numberless obsidian dice and no face correction — there is nothing to
// correct to. A solo/legacy face-down roll keeps its values but plays
// shrouded too, so the felt never leaks what the chips withhold.
function playRoll(roll) {
  const types = roll && Array.isArray(roll.dice) ? roll.dice : [];
  const values = roll && Array.isArray(roll.values) ? roll.values : null;
  if (!types.length) return;
  if (values && types.length !== values.length) return;
  if (!values && roll.redacted !== true) return; // valueless without the redaction flag: bad payload
  if (types.some((t) => !DIE_DEFS[t])) return;
  const shrouded = !values || (roll.faceDown === true && roll.revealed === false);

  // one playback at a time; overlapping rolls queue FIFO. A queued roll
  // auto-skips the previous ceremony's remainder (pinned): skipCeremony
  // finishes the current roll instantly, which drains the queue — including
  // the roll just pushed.
  // Seed the §7.7 state row: this roll is on the felt until collected/cleared.
  if (roll.rollId) rollState(roll.rollId);

  if (currentRoll && !currentRoll.done) {
    rollQueue.push(roll);
    if (currentRoll.ceremony) skipCeremony();
    return;
  }
  // No whole-table overflow wipe here anymore (§7.7 retires it): auto-collect
  // keeps the felt to one roll and the shelf capped at five slots, so the
  // table population is bounded by the state machine, not by a reset.

  chips.length = 0;
  chipsLayer.innerHTML = '';
  banner.classList.add('hidden');
  dismissCeremonyUI(); // a lingering verdict card/decal yields to the new roll

  // --- spawn with seeded throw params -------------------------------------
  const rng = mulberry32(roll.seed >>> 0);
  const side = Math.floor(rng() * 4);
  const dice = types.map((t, i) => spawnDie(t, i, types.length, side, rng, shrouded));
  // Every die on the table is tagged with its roll (§7.5): a per-roll Done
  // removes exactly these dice and never touches a concurrent roll's.
  for (const d of dice) {
    d.rollId = roll.rollId || null;
    d.shrouded = shrouded;
  }
  tableDice.push(...dice);

  // --- synchronous fast-forward, recording keyframes + sound events -------
  const sounds = []; // {time, strength}
  let simTime = 0;
  const recordCollision = (e) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 2 && sounds.length < 400) sounds.push({ time: simTime, strength: v });
  };
  for (const d of dice) d.body.addEventListener('collide', recordCollision);

  const snapshot = (d) => ({
    pos: new THREE.Vector3().copy(d.body.position),
    quat: new THREE.Quaternion().copy(d.body.quaternion),
  });
  const keyframes = dice.map((d) => [snapshot(d)]);

  let stillTime = 0;
  let nudges = 0;
  for (;;) {
    world.step(FIXED_DT);
    simTime += FIXED_DT;
    dice.forEach((d, i) => keyframes[i].push(snapshot(d)));

    const still = dice.every(
      (d) => d.body.velocity.lengthSquared() < 0.05 && d.body.angularVelocity.lengthSquared() < 0.05
    );
    stillTime = still ? stillTime + FIXED_DT : 0;
    if (stillTime < SETTLE_STILL && simTime < SETTLE_CAP) continue;

    // cocked dice (leaning on a wall or another die): nudge and keep going
    const cocked = dice.filter((d) => {
      const r = readValue(d.type, d.body.quaternion);
      return r.dot < (d.type === 'd4' ? 0.9 : 0.82);
    });
    if (cocked.length && nudges < 3 && simTime < SETTLE_CAP) {
      nudges++;
      stillTime = 0;
      for (const d of cocked) {
        d.body.wakeUp();
        d.body.velocity.set((rng() - 0.5) * 4, 7, (rng() - 0.5) * 4);
        d.body.angularVelocity.set((rng() - 0.5) * 14, (rng() - 0.5) * 14, (rng() - 0.5) * 14);
      }
      continue;
    }
    break;
  }
  for (const d of dice) d.body.removeEventListener('collide', recordCollision);

  // --- face correction: body-frame pre-rotation R per die ------------------
  // qF = final body orientation. u_body = qF^-1 * up (landed "up" in body
  // frame). n_v = body-frame normal of the face showing the target value.
  // R rotates n_v -> u_body, so rendering q * R for the whole tumble makes
  // the die settle with the target face up.
  const up = new THREE.Vector3(0, 1, 0);
  dice.forEach((d, i) => {
    const kf = keyframes[i];
    const qF = kf[kf.length - 1].quat;
    // Shrouded dice keep the identity correction: blank faces have no target
    // value, so the die lands exactly where physics left it (poses may diverge
    // across clients — there is nothing to read, so that's fine).
    d.correction = new THREE.Quaternion();
    if (!shrouded) {
      const uBody = up.clone().applyQuaternion(qF.clone().invert()).normalize();
      const nV = faceNormalForValue(d.type, values[i]);
      if (nV) d.correction.setFromUnitVectors(nV.normalize(), uBody);
    }
    d.finalPos = kf[kf.length - 1].pos.clone();
    d.finalQuat = qF.clone().multiply(d.correction);
    if (!shrouded) {
      const check = readValue(d.type, d.finalQuat);
      if (check.value !== values[i]) {
        console.warn(`face correction mismatch on ${d.type}: expected ${values[i]}, reads ${check.value}`);
      }
    }
  });

  // --- freeze bodies at the corrected final pose ---------------------------
  // Settled dice no longer need live physics, but later fast-forwards must
  // still collide with them, so keep static mass-0 bodies in the world.
  for (const d of dice) {
    d.body.velocity.setZero();
    d.body.angularVelocity.setZero();
    d.body.mass = 0;
    d.body.type = CANNON.Body.STATIC;
    d.body.updateMassProperties();
    d.body.position.copy(d.finalPos);
    d.body.quaternion.copy(d.finalQuat);
  }

  // --- start playback ------------------------------------------------------
  dice.forEach((d, i) => {
    d.mesh.position.copy(keyframes[i][0].pos);
    d.mesh.quaternion.copy(keyframes[i][0].quat).multiply(d.correction);
  });

  currentRoll = {
    rollId: roll.rollId || null,
    t: roll.t || null,
    label: roll.label || formula(types),
    playerName: roll.playerName || null,
    color: roll.color || null,
    playerId: roll.playerId || null,
    values: values ? values.slice() : null,
    // mechanics metadata (rollspec contract); defaults preserve plain rolls
    perDie: Array.isArray(roll.perDie) && roll.perDie.length === types.length
      ? roll.perDie
      : types.map(() => ({ counts: true, reason: null, childOf: null })),
    modifier: roll.modifier || 0,
    total: typeof roll.total === 'number' ? roll.total : null,
    // A redacted roll has no spec of its own; the fallback stands in for the
    // ceremony's intent card (which reads the pool it can legitimately see).
    // It must NOT become a reroll affordance though — `types` is the EXPANDED
    // pool and the mods are withheld, so ⟳ is gated on the entry being
    // readable instead (renderLog / renderBannerActions).
    spec: roll.spec || { dice: types, mods: null },
    dc: Number.isInteger(roll.dc) ? roll.dc : null, // interim dc verdict (UX §2.3 stub)
    exp: sanitizeExp(roll.exp),
    faceDown: !!roll.faceDown,
    revealed: values ? roll.revealed !== false : roll.revealed === true,
    // visibility plumbing (goal 11) — present-or-absent passthroughs
    redacted: !values,
    visMode: roll.visMode || (roll.visibility && roll.visibility.mode) || null,
    visibility: roll.visibility || null,
    revealAuthority: roll.revealAuthority || null,
    notation: typeof roll.notation === 'string' ? roll.notation : null,
    seed: roll.seed,
    dice,
    keyframes,
    sounds,
    frames: keyframes[0].length,
    duration: (keyframes[0].length - 1) * FIXED_DT,
    time: 0,
    soundIdx: 0,
    ceremony: null,
    done: false,
  };

  // Roll moments (UX §2): a Check/Cinematic attachment stages the playback.
  // Held rolls keep their FULL ceremony (goal 11): the stakes — declaration,
  // dice, dc — are public; only the result is hidden, so the verdict card
  // shows the held state (+ Reveal for the authority) instead of downgrading
  // the whole roll to Plain.
  if (currentRoll.exp) beginCeremony(currentRoll);
}

// Solo path: compose locally with the same shared mechanics the server uses
// (rollspec.composeRoll), then play. opts: {mods, faceDown, dc} per the contract.
function rollDice(types, label, opts = {}) {
  if (!types.length) return;
  if (validateMods(types, opts.mods || null)) return; // invalid spec: no-op
  // §7.7 arrival beat, mirrored locally: the new roll's execution collects
  // everything this session still has on the felt (evictions sink first).
  soloAutoCollect();
  const composed = composeRoll(types, opts.mods || null, Math.random);
  playRoll({
    ...composed,
    rollId: `solo-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    spec: { dice: [...types], mods: opts.mods || null },
    dc: Number.isInteger(opts.dc) ? opts.dc : null,
    exp: opts.exp || null,
    faceDown: !!opts.faceDown,
    revealed: !opts.faceDown,
    seed: randomSeed(),
    label: label || formula(types),
  });
}

// Advance the active playback by dt: interpolate meshes between keyframes
// (lerp pos, slerp quat, then apply the corrective pre-rotation R) and replay
// recorded collision sounds at their recorded times.
//
// Ceremony rolls (UX §2.4) hang extra phases off the same clock — every state
// transition is dt-driven so __diceDebug.sim() drives the whole timeline
// deterministically; CSS animations only decorate. Phase order:
//   declare (playback held) → tumble (this playback, cinematic slow-mo at the
//   end) → settle (hit-stop, chip stagger, verdict unfold) → done.
function stepPlayback(dt) {
  const roll = currentRoll;
  if (!roll || roll.done) return;
  const cer = roll.ceremony;

  if (cer && cer.phase === 'declare') {
    cer.clock += dt;
    if (cer.clock >= cer.declareDur) ceremonyEnterTumble(roll);
    return; // playback held for the declaration beat
  }
  if (cer && cer.phase === 'settle') {
    ceremonyStepSettle(roll, dt);
    return;
  }

  // Cinematic slow-mo: playback rate eased to 0.35× over the last ~400 ms of
  // keyframes. Pure playback-clock scaling — physics is never touched.
  // Identical in compact view (§7.4: ceremony parity, responsive scale only).
  let step = dt;
  if (cer && cer.exp.kind === 'cinematic') {
    const remaining = roll.duration - roll.time;
    if (remaining > 0 && remaining < CEREMONY_SLOWMO_WINDOW) {
      step = dt * (CEREMONY_SLOWMO_RATE
        + (1 - CEREMONY_SLOWMO_RATE) * (remaining / CEREMONY_SLOWMO_WINDOW));
    }
  }
  roll.time += step;

  const last = roll.frames - 1;
  const f = Math.min(roll.time, roll.duration) * 60;
  const i0 = Math.min(Math.floor(f), last);
  const i1 = Math.min(i0 + 1, last);
  const frac = Math.min(Math.max(f - i0, 0), 1);

  roll.dice.forEach((d, di) => {
    const a = roll.keyframes[di][i0];
    const b = roll.keyframes[di][i1];
    d.mesh.position.copy(a.pos).lerp(b.pos, frac);
    d.mesh.quaternion.copy(a.quat).slerp(b.quat, frac).multiply(d.correction);
  });

  while (roll.soundIdx < roll.sounds.length && roll.sounds[roll.soundIdx].time <= roll.time) {
    playClick(roll.sounds[roll.soundIdx++].strength);
  }

  if (roll.time >= roll.duration) {
    for (const d of roll.dice) {
      d.mesh.position.copy(d.finalPos);
      d.mesh.quaternion.copy(d.finalQuat);
    }
    if (cer) {
      ceremonyEnterSettle(roll);
      return;
    }
    roll.done = true;
    showResults(roll);
    runPendingReveal(roll);  // a reveal that arrived mid-playback lands now
    runPendingCollect(roll); // a collect that arrived mid-playback lands now
    runPendingClear(roll);   // …and a clear wins over it
    if (rollQueue.length) playRoll(rollQueue.shift());
  }
}

// ---------------------------------------------------------------------------
// Results, effects
// ---------------------------------------------------------------------------

const chipsLayer = document.getElementById('chips-layer');
const banner = document.getElementById('result-banner');
const chips = []; // {el, die}
// Quiet by default (P1): the floating die numbers are an opt-in ambient
// layer ('Show numbers on dice', settings "Just you"). The result stays
// readable without them — banner, verdict card, log line and breakdown all
// carry the total and the per-die math (the GOALS readability invariant).
let chipsOn = load(LS_CHIPS, false) === true;

// ---------------------------------------------------------------------------
// Interpretation lens (goal 6): the ACTIVE system profile reads meaning and
// crit off raw entries at render time — entries and the log store facts only.
// currentSystemId is room state (settings.system), applied like felt.
// ---------------------------------------------------------------------------

let currentSystemId = DEFAULT_SYSTEM;

// Is this entry's RESULT hidden from this client right now? True for a
// redacted projection (the server withheld the values — held/whisper for a
// non-audience viewer) and for a legacy/solo face-down roll, until revealed.
// The single gate every surface keys off (chips, banner, log, marker, peek,
// verdict card): "values absent or withheld", never a mode check per surface.
function entryHidden(entry) {
  if (!entry || entry.revealed) return false;
  return entry.redacted === true || entry.faceDown === true;
}

// May THIS client reveal the entry? Rendered-affordance gate only — the
// server enforces revealAuthority regardless. held and whisper are revealable
// (whisper: the authority may already SEE the values and still owns the
// flip-for-everyone); secret has no reveal path; solo is its own authority.
function canReveal(entry) {
  if (!entry || !entry.rollId || entry.revealed) return false;
  const mode = entry.visMode
    || (entry.visibility && entry.visibility.mode)
    || (entry.faceDown ? 'held' : null);
  if (mode !== 'held' && mode !== 'whisper') return false;
  if (!netOnline || !net) return true; // solo: the only player is the authority
  const auth = (entry.visibility && entry.visibility.revealAuthority)
    || entry.revealAuthority
    || entry.playerId
    || null;
  return !!auth && auth === net.playerId;
}

// May ⟳ offer to roll THIS again? Only from a spec the viewer may read. A
// hidden roll either has no spec at all (the redacted projection omits it) or
// the stand-in playRoll builds from the EXPANDED pool with no mods — so a ⟳
// there would quietly reroll something else (an exploded 1d6 as 3d6, a 4d6kh3
// as a flat 4d6). It also kept live viewers and reloaded ones disagreeing
// about whether a face-down line has a button. Reveal first, then reroll.
function canReroll(entry) {
  return !!(entry && entry.spec && Array.isArray(entry.spec.dice) && entry.spec.dice.length
    && !entryHidden(entry));
}

function entryMeaning(entry) {
  if (entryHidden(entry)) return null;
  return SYSTEMS[currentSystemId].meaningFor(
    entry.parts.filter((p) => p.counts && !p.child).map((p) => p.type),
    entry.total
  );
}

function entryCrit(entry) {
  if (entryHidden(entry)) return null;
  return SYSTEMS[currentSystemId].critFor(entry);
}

// The crit overlay's word: the chart word when the system has one (soul-deal),
// else the natural-roll callout (dnd — its meaningFor is always null).
function critWord(crit, meaning) {
  return meaning ? meaning.word : crit === 'success' ? 'Natural 20' : 'Natural 1';
}

// Build the display entry for a finished playback roll: per-die parts with
// mechanics metadata, authoritative total, and reveal state.
function entryFromRoll(roll) {
  const types = roll.dice.map((d) => (d.type ? d.type : d)); // die objects or type strings
  const hasValues = Array.isArray(roll.values);
  const perDie = Array.isArray(roll.perDie) && roll.perDie.length === types.length
    ? roll.perDie
    : types.map(() => ({ counts: true, reason: null, childOf: null }));
  let sum = 0;
  // A redacted roll has no values (goal 11): its parts carry types only — no
  // value, no crit marks, no struck/child metadata — so nothing downstream
  // can NaN its way into fabricating a number for a hidden result.
  const parts = types.map((type, i) => {
    if (!hasValues) {
      return {
        type, label: '?', value: null, isMax: false, isMin: false,
        counts: true, reason: null, child: false,
      };
    }
    const value = roll.values[i];
    const pd = perDie[i];
    if (pd.counts) sum += value;
    const [lo, hi] = valueRange(type);
    return {
      type,
      label: dieLabel(type, value),
      value,
      isMax: value === hi,
      isMin: value === lo,
      counts: pd.counts,
      reason: pd.reason || null,
      child: pd.childOf !== null && pd.childOf !== undefined,
    };
  });
  const modifier = roll.modifier || 0;
  const total = typeof roll.total === 'number' ? roll.total
    : hasValues ? sum + modifier : null;
  // No meaning field: interpretation is a render-time lens (entryMeaning /
  // entryCrit read the active system), never state a stored entry carries.
  // The experience attachment rides entry.spec so reroll-last preserves it.
  const exp = sanitizeExp(roll.exp);
  const spec = roll.spec ? (exp ? { ...roll.spec, exp } : roll.spec) : undefined;
  return {
    rollId: roll.rollId || undefined,
    t: roll.t || Date.now(),
    label: roll.label,
    playerName: roll.playerName || undefined,
    color: roll.color || undefined,
    playerId: roll.playerId || undefined,
    parts,
    sum: hasValues ? sum : null,
    modifier,
    total,
    dc: Number.isInteger(roll.dc) ? roll.dc : undefined,
    faceDown: !!roll.faceDown,
    // A valueless entry counts as unrevealed unless the wire says otherwise —
    // a revealed entry always carries its values.
    revealed: hasValues ? roll.revealed !== false : roll.revealed === true,
    // goal 11 passthroughs (present-or-absent, like exp):
    redacted: hasValues ? undefined : true,
    visMode: roll.visMode || (roll.visibility && roll.visibility.mode) || undefined,
    visibility: roll.visibility || undefined,
    revealAuthority: roll.revealAuthority || undefined,
    notation: typeof roll.notation === 'string' ? roll.notation : undefined,
    spec,
  };
}

// Attributed modifier parts (§7.2) ride the request spec, display-only.
function modPartsOf(entry) {
  const p = entry.spec && entry.spec.mods && entry.spec.mods.parts;
  return Array.isArray(p) && p.length ? p : null;
}

let lastEntry = null; // the roll currently shown on the banner/chips

// Per-die value chips over the table. staged=true is the ceremony's §2.4
// chorus: chips pop in with a stagger, counting dice first, discards last —
// purely decorative CSS delays; ceremony state stays dt-driven. The default
// (staged=false) is byte-identical to the pre-ceremony chip DOM.
function renderChips(entry, dice, staged = false) {
  chips.length = 0;
  chipsLayer.innerHTML = '';
  // The single gate for the chips preference: every caller (plain results,
  // the ceremony chorus, reveal repaints) funnels through here, so 'off'
  // means no chip is ever rendered or positioned.
  if (!chipsOn) return;
  const hidden = entryHidden(entry);

  let delays = null;
  if (staged) {
    const stagger = entry.parts.length <= 6 ? 0.07 : 0.04;
    const order = entry.parts.map((q, j) => j)
      .sort((a, b) => (entry.parts[a].counts ? 0 : 1) - (entry.parts[b].counts ? 0 : 1));
    delays = [];
    order.forEach((j, rank) => { delays[j] = rank * stagger; });
  }

  entry.parts.forEach((p, i) => {
    // A chip is anchored to its die: with no die on the table (a reveal
    // repaint after the dice are gone) there is nowhere to put it.
    const die = dice && dice[i];
    if (!die) return;
    const el = document.createElement('div');
    let cls = 'value-chip';
    if (!hidden && p.isMax && p.counts) cls += ' max';
    if (!hidden && p.isMin && p.counts) cls += ' min';
    if (!p.counts) cls += ' discarded';
    if (p.child) cls += ' exploded';
    if (staged) cls += ' staged';
    el.className = cls;
    el.style.setProperty('--die-color', DIE_DEFS[p.type].color);
    if (staged) el.style.setProperty('--chip-delay', `${delays[i].toFixed(2)}s`);
    el.textContent = hidden ? '?' : (p.child ? '✴' : '') + p.label;
    chipsLayer.appendChild(el);
    chips.push({ el, die });
  });
  positionChips();
}

// Attributed math (GOALS invariant): the banner's breakdown line says the same
// thing the log line does — EVERY die (struck when it does not count, ✴ on an
// explosion child), then the dice subtotal and the modifier tail with its
// named sources. Shares the log's classes so both surfaces read identically.
// A lone die with nothing to attribute stays bare; hidden rolls say nothing.
function renderBreakdown(el, entry, hidden) {
  el.textContent = '';
  if (hidden) return;
  // Exactly the log's list, unfiltered: a +0 the player deliberately named
  // ('+0[Guidance]', which round-trips through the canonical) is attribution,
  // not noise, and dropping it here made the two surfaces disagree about a
  // named source. Only the unnamed fallback is conditional — that is the log's
  // own rule (`else if (entry.modifier)`), so a bare 0 never renders.
  const mods = modPartsOf(entry) || (entry.modifier ? [{ label: '', value: entry.modifier }] : []);
  if (entry.parts.length <= 1 && !mods.length) return;

  entry.parts.forEach((p, i) => {
    if (i) el.append(' + ');
    const s = document.createElement('span');
    let cls = p.counts && p.isMax ? 'crit-max' : p.counts && p.isMin ? 'crit-min' : '';
    if (!p.counts) cls += ' log-discarded';
    s.className = cls.trim();
    s.textContent = `${p.child ? '✴' : ''}${p.type} ${p.label}`;
    el.appendChild(s);
  });

  if (!mods.length) return;
  el.append(`  =  ${entry.sum}`);
  for (const p of mods) {
    const m = document.createElement('span');
    m.className = 'log-mod';
    m.textContent = ` ${p.value >= 0 ? '+' : '−'}${Math.abs(p.value)}`;
    if (p.label) {
      const l = document.createElement('span');
      l.className = 'log-part-label';
      l.textContent = ` ${p.label}`;
      m.appendChild(l);
    }
    el.appendChild(m);
  }
}

// Chips, banner, crits — always from authoritative values, never re-read
// from physics. Face-down unrevealed rolls render as "?" everywhere.
// fx=false is the system-toggle repaint: the lens swap restyles the static
// surfaces but never replays fanfare that belonged to the roll's own moment.
function renderRollResults(entry, dice, fx = true) {
  renderChips(entry, dice);
  const hidden = entryHidden(entry);

  // Names and labels are user-supplied: textContent only, never innerHTML.
  const labelEl = document.getElementById('result-label');
  labelEl.textContent = '';
  if (entry.playerName) {
    const who = document.createElement('span');
    who.className = 'roller-name';
    if (entry.color) who.style.color = entry.color;
    who.textContent = entry.playerName;
    labelEl.append(who, ` · ${entry.label}`);
  } else {
    labelEl.textContent = entry.label;
  }

  document.getElementById('result-total').textContent = hidden ? '?' : entry.total;
  renderBreakdown(document.getElementById('result-breakdown'), entry, hidden);

  // Interim dc verdict (fixed decision): above the meaning word, gold/red.
  // Hidden result, public stakes (goal 11): the DC still shows, the verdict
  // waits for the reveal.
  const verdictEl = document.getElementById('result-verdict');
  if (Number.isInteger(entry.dc)) {
    if (hidden) {
      verdictEl.textContent = `vs DC ${entry.dc}`;
      verdictEl.className = '';
    } else {
      const cleared = entry.total >= entry.dc;
      verdictEl.textContent = `vs DC ${entry.dc} — ${cleared ? 'Success' : 'Failure'}`;
      verdictEl.className = cleared ? 'verdict-success' : 'verdict-fail';
    }
  } else {
    verdictEl.textContent = '';
    verdictEl.className = '';
  }

  const meaningEl = document.getElementById('result-meaning');
  const meaning = entryMeaning(entry);
  meaningEl.textContent = meaning ? meaning.word : '';
  meaningEl.className = meaning ? `tier-${meaning.tier}` : '';
  meaningEl.title = meaning ? `${meaning.rank} column (${meaning.column})` : '';

  banner.classList.remove('hidden', 'crit-success', 'crit-fail');
  renderBannerActions(entry);
  const crit = entryCrit(entry);
  if (crit === 'success') {
    banner.classList.add('crit-success');
    if (fx) playCritEffect('success', critWord(crit, meaning));
  } else if (crit === 'fail') {
    banner.classList.add('crit-fail');
    if (fx) playCritEffect('fail', critWord(crit, meaning));
  }
}

// Reveal (the reveal authority of a hidden roll) and reroll-last buttons.
// The banner mirrors the peek card's skeleton (they are the same result at
// two ages, so they diverge only where the state genuinely differs): a row
// of secondary actions — Reveal for the authority, ⟳, Collect — over ONE
// prominent full-width ✕ at the base, the same unified 'clear this roll'
// gesture the peek and the verdict card carry. Collect stays available but
// steps out of the primary slot.
function renderBannerActions(entry) {
  const holder = document.getElementById('banner-actions');
  holder.innerHTML = '';
  const hidden = entryHidden(entry);
  const mine = !netOnline || (net && entry.playerId === net.playerId);
  const row = document.createElement('div');
  row.className = 'banner-row';
  if (canReveal(entry)) {
    const btn = document.createElement('button');
    // A hidden roll's Reveal is the one action that outranks housekeeping.
    btn.className = hidden ? 'btn primary banner-btn' : 'btn ghost banner-btn';
    btn.textContent = 'Reveal';
    btn.addEventListener('click', () => requestReveal(entry.rollId));
    row.appendChild(btn);
  }
  if (canReroll(entry)) {
    const btn = document.createElement('button');
    btn.className = 'btn ghost banner-btn';
    btn.textContent = '⟳';
    btn.title = 'Roll this again';
    btn.addEventListener('click', () =>
      requestRoll([...entry.spec.dice], entry.label, {
        mods: entry.spec.mods || undefined,
        faceDown: entry.faceDown,
        visibility: entryVis(entry) || undefined, // a secret reroll stays secret
        dc: Number.isInteger(entry.dc) ? entry.dc : undefined,
        exp: entry.spec.exp || undefined, // reroll-last preserves the moment
      })
    );
    row.appendChild(btn);
  }
  // Collect keeps the roll: its dice whisk to the shelf for everyone
  // (server-validated; solo local) and the banner retires into the slot.
  if (entry.rollId && mine) {
    const btn = document.createElement('button');
    btn.className = 'btn ghost banner-btn';
    btn.textContent = 'Collect';
    btn.title = 'Collect this roll to the shelf for everyone';
    btn.addEventListener('click', () => {
      // No optimistic hide: online, the 'roll-collected' broadcast retires
      // the banner (shelveRoll); solo applies synchronously. A failed POST
      // keeps the banner — and its only Collect button — instead of
      // stranding the dice on everyone's felt with no affordance left.
      btn.disabled = true;
      requestCollectRoll(entry.rollId).then((ok) => {
        btn.disabled = false;
        if (!ok) showSettingsNote('couldn’t collect the roll — try again');
      });
    });
    row.appendChild(btn);
  }
  if (row.childElementCount) holder.appendChild(row);

  // The base ✕ (§7.7.2, unified with the peek's): the roller clears the
  // dice outright for everyone — non-optimistic, a failed POST keeps the
  // banner. A spectator's ✕ is the local dismiss it always was: the dice
  // stay until the roller collects or clears them.
  if (entry.rollId) {
    const foot = document.createElement('div');
    foot.className = 'pk-foot banner-foot';
    const x = document.createElement('button');
    x.className = 'clear-x banner-btn';
    x.textContent = '✕';
    if (mine) {
      x.title = 'Clear this roll for everyone';
      x.addEventListener('click', () => {
        x.disabled = true;
        requestClearRoll(entry.rollId).then((ok) => {
          x.disabled = false;
          if (!ok) showSettingsNote('couldn’t clear the roll — try again');
        });
      });
    } else {
      x.title = 'Dismiss for you — the dice stay until the roller collects';
      x.addEventListener('click', () => banner.classList.add('hidden'));
    }
    foot.appendChild(x);
    holder.appendChild(foot);
  }
}

// True only while a hello resync fast-forwards the on-felt roll back into
// place (§7.7): the surfaces repaint, but crit fanfare that already played
// for the room must not replay for a reload.
let suppressRollFx = false;

function showResults(roll) {
  const entry = entryFromRoll(roll);
  lastEntry = entry;
  renderRollResults(entry, roll.dice, !suppressRollFx);
  addLogEntry(entry);
}

// Merge a reveal's authoritative values into a live roll object (currentRoll
// or a queued roll) so any later entryFromRoll builds a revealed entry — the
// 7f9cdf5 race fix, extended to carry the values a redacted roll never had.
function mergeReveal(roll, full) {
  roll.revealed = true;
  roll.redacted = false;
  if (full && Array.isArray(full.values)) {
    roll.values = full.values.slice();
    if (Array.isArray(full.perDie) && full.perDie.length === full.values.length) {
      roll.perDie = full.perDie;
    }
    if (typeof full.modifier === 'number') roll.modifier = full.modifier;
    if (typeof full.total === 'number') roll.total = full.total;
    if (full.spec) roll.spec = full.spec;
  }
}

// Repaint every surface that shows this roll under its (now revealed) entry.
// Runs immediately for log-only reveals, and at the END of the staged flip
// for a roll whose dice are on the felt — chips/verdict fill in as the dice
// finish turning (the §3.1 beat).
function refreshRevealSurfaces(rollId) {
  renderLog();
  renderShelfMarkers(); // includes renderPeek
  const entry = log.find((e) => e.rollId === rollId) || null;
  if (entry && lastEntry && lastEntry.rollId === rollId) lastEntry = entry;
  if (lastEntry && lastEntry.rollId === rollId) {
    // A reveal landing while a ceremony is mid-flight stays log-only (the
    // ceremony owns the stage; pendingReveals defers to its finish anyway).
    // A banner the viewer already dismissed stays dismissed — but the DICE do
    // not: their '?' chips are the shared table (one shared truth).
    const ceremonyActive = currentRoll && currentRoll.ceremony && !currentRoll.done;
    if (!ceremonyActive) {
      const dice = currentRoll && currentRoll.rollId === rollId ? currentRoll.dice : null;
      if (banner.classList.contains('hidden')) renderChips(lastEntry, dice);
      else renderRollResults(lastEntry, dice); // fx: the reveal IS the moment
    }
  }
  // A standing verdict card for this roll upgrades in place: held state out,
  // total/margin/meaning in (crit styling included — styling, not fanfare).
  if (stagedVerdict && stagedVerdict.entry && stagedVerdict.entry.rollId === rollId) {
    if (entry) stagedVerdict.entry = entry;
    if (!ceremonyLayer.classList.contains('hidden')) {
      ceremonyLayer.classList.toggle('crit', !!entryCrit(stagedVerdict.entry));
      renderVerdictCard(stagedVerdict.roll, stagedVerdict.entry);
    }
  }
}

// The staged flip for on-felt dice: materials swap to the real faces at once,
// then each die's correction rotation slerps in over REVEAL_FLIP_S on the dt
// clock (sim()-drivable, skippable). The frozen BODY takes the corrected pose
// immediately — physics truth never waits on an animation.
function beginRevealFlip(rollId, entry) {
  const dice = tableDice.filter((d) => d.rollId === rollId);
  const up = new THREE.Vector3(0, 1, 0);
  let started = false;
  dice.forEach((d, i) => {
    if (!d.shrouded) return;
    d.shrouded = false;
    d.mesh.material = getDie(d.type).materials;
    const p = entry.parts[i];
    const value = p && p.value != null ? p.value : null;
    const q = d.body.quaternion;
    const qF = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const corr = new THREE.Quaternion();
    const nV = value == null ? null : faceNormalForValue(d.type, value);
    if (nV) {
      const uBody = up.clone().applyQuaternion(qF.clone().invert()).normalize();
      corr.setFromUnitVectors(nV.normalize(), uBody);
    }
    const target = qF.clone().multiply(corr);
    d.correction = corr;
    d.finalQuat = target;
    d.body.quaternion.set(target.x, target.y, target.z, target.w);
    revealing.push({ die: d, rollId, t: 0, fromQuat: d.mesh.quaternion.clone(), toQuat: target });
    started = true;
  });
  if (!started) refreshRevealSurfaces(rollId);
}

// A shelved cluster reveals by re-posing: shelfValues become the true values,
// materials swap, and the cluster re-lands on its canonical poses (the same
// whisk placeCluster always uses).
function revealShelvedRoll(rollId, entry) {
  const c = shelfClusters.get(rollId);
  const dice = tableDice.filter((d) => d.rollId === rollId);
  dice.forEach((d, i) => {
    if (d.shrouded) {
      d.shrouded = false;
      d.mesh.material = getDie(d.type).materials;
    }
    const p = entry.parts[i];
    if (p && p.value != null) d.shelfValue = p.value;
  });
  if (c) {
    c.placed = false;
    placeCluster(c, true);
    recompositeFelt();
  }
}

// Advance reveal flips; when a roll's last die lands, its surfaces fill in.
function stepRevealing(dt) {
  if (!revealing.length) return;
  const finished = new Set();
  for (const rv of revealing) {
    rv.t += dt;
    const p = Math.min(rv.t / REVEAL_FLIP_S, 1);
    const e = 1 - (1 - p) ** 3; // ease-out cubic
    rv.die.mesh.quaternion.slerpQuaternions(rv.fromQuat, rv.toQuat, e);
    if (p >= 1) finished.add(rv.rollId);
  }
  if (!finished.size) return;
  revealing = revealing.filter((rv) => {
    if (rv.t < REVEAL_FLIP_S) return true;
    rv.die.mesh.quaternion.copy(rv.toQuat);
    return false;
  });
  for (const rollId of finished) {
    if (!revealing.some((rv) => rv.rollId === rollId)) refreshRevealSurfaces(rollId);
  }
}

// Jump any in-flight reveal flips to their end (skippable, like everything).
function skipRevealFx() {
  if (!revealing.length) return false;
  stepRevealing(REVEAL_FLIP_S + FIXED_DT);
  return true;
}

// A hidden roll got flipped (server 'reveal' event carrying the full entry,
// hello resync, or solo action). Idempotent: replaying a reveal this client
// already applied changes nothing. `full` is the complete revealed entry —
// absent when this client already holds the values (solo / legacy face-down).
function applyReveal(rollId, full) {
  if (!rollId) return;
  // Mid-playback or queued: defer until the shrouded roll settles (the same
  // pendingClears/pendingCollects pattern — never race the playback).
  const inFlight = currentRoll && !currentRoll.done && currentRoll.rollId === rollId;
  if (inFlight || rollQueue.some((r) => r.rollId === rollId)) {
    pendingReveals.set(rollId, full || pendingReveals.get(rollId) || null);
    return;
  }
  if (currentRoll && currentRoll.rollId === rollId) mergeReveal(currentRoll, full);

  const idx = log.findIndex((e) => e.rollId === rollId);
  let entry = idx >= 0 ? log[idx] : null;
  const wasHidden = entry ? entryHidden(entry) : false;
  const wasUnrevealed = entry ? entry.revealed === false : false;
  if (entry) {
    if (full && Array.isArray(full.values)) {
      // The redacted entry never had values: rebuild it whole from the
      // revealed payload, in place, so ordering and dedupe stay stable.
      log[idx] = rollToLogEntry({ ...full, revealed: true });
      entry = log[idx];
    } else {
      entry.revealed = true;
    }
    if (!netOnline) save(LS_LOG, log);
  }
  if (entry && lastEntry && lastEntry.rollId === rollId) lastEntry = entry;
  if (!entry) {
    // No log entry (edge: banner-only state) — flip what we have.
    if (lastEntry && lastEntry.rollId === rollId) {
      lastEntry.revealed = true;
      refreshRevealSurfaces(rollId);
    }
    return;
  }
  if (!wasHidden) {
    // Nothing was hidden from THIS viewer (whisper audience / authority) —
    // but the reveal still retires their Reveal affordances everywhere.
    if (wasUnrevealed) refreshRevealSurfaces(rollId);
    return;
  }
  renderLog(); // the record flips immediately; chips/verdict ride the beat
  if (shelfClusters.has(rollId)) {
    revealShelvedRoll(rollId, entry);
    refreshRevealSurfaces(rollId);
  } else if (tableDice.some((d) => d.rollId === rollId && d.shrouded)) {
    beginRevealFlip(rollId, entry); // staged: surfaces fill at flip end
  } else {
    refreshRevealSurfaces(rollId);
  }
}

// Completion hook, the reveal twin of runPendingClear. A pending clear wins:
// dice about to sink have nothing left to reveal.
function runPendingReveal(roll) {
  if (roll.rollId && pendingReveals.has(roll.rollId)) {
    const full = pendingReveals.get(roll.rollId);
    pendingReveals.delete(roll.rollId);
    if (!pendingClears.has(roll.rollId)) applyReveal(roll.rollId, full || undefined);
  }
}

function requestReveal(rollId) {
  if (netOnline && net) net.reveal(rollId); // the 'reveal' event applies it
  else applyReveal(rollId); // solo: this client already holds the values
}

function positionChips() {
  const v = new THREE.Vector3();
  for (const { el, die } of chips) {
    v.copy(die.mesh.position);
    v.y += 2.2;
    v.project(camera);
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
}

const critOverlay = document.getElementById('crit-overlay');
const critText = document.getElementById('crit-text');
let critTimer = null;

function playCritEffect(kind, text) {
  clearTimeout(critTimer);
  critOverlay.className = kind;
  critText.textContent = text;
  container.classList.remove('shake');
  void container.offsetWidth; // restart animation
  container.classList.add('shake');
  critTimer = setTimeout(() => critOverlay.classList.add('hidden'), 1700);
}

// ---------------------------------------------------------------------------
// Roll moment ceremony (UX §2.4/§2.5/§2.6, §5.3/§5.4).
//
// A roll carrying exp {kind:'check'|'cinematic', subtitle?} plays a staged
// presentation: declaration (intent card + mat-text felt decal, playback
// held) → tumble (card docked to the top strip) → settle staging (hit-stop,
// chip chorus, attribution fly-ins, verdict on the same top anchor) → done.
// Compact view is immersive (UX §7.4): the SAME state machine, card, decal and
// slow-mo play in body.mini — responsive CSS scaling only, no degradation.
// Values and staging info are identical for every viewer; pacing is local.
// Every state transition advances on the stepPlayback clock (sim()-driven,
// deterministic); CSS transitions only decorate. The single exception is the
// final auto-dismiss timer. Plain rolls never enter any of this.
// ---------------------------------------------------------------------------

const CEREMONY_DECLARE_S = 1.35;   // declaration dwell incl. the commit dock
const CEREMONY_HITSTOP_S = 0.11;   // §2.4 phase 3
const CEREMONY_BUDGET_S = 1.6;     // post-settle ceiling (§2.4)
const CEREMONY_SLOWMO_WINDOW = 0.4; // cinematic: last ~400 ms of keyframes
const CEREMONY_SLOWMO_RATE = 0.35;
const CEREMONY_DISMISS_MS = 7000;  // final auto-dismiss (the one allowed timer)
const EXP_MAX_SUBTITLE = 40;
const KEEP_WORDS = { kh: 'Keep high', kl: 'Keep low', dh: 'Drop high', dl: 'Drop low' };

const ceremonyLayer = document.getElementById('ceremony-layer');
let ceremonyDismissTimer = null;
// The verdict card currently on screen, or null once it is gone. A system
// change repaints it under the new lens: the card owns §2.5's hero slot for
// the same entry the log line beneath it renders, so the two must never
// disagree about which system is reading the table.
let stagedVerdict = null; // {roll, entry}

// Ornate corners (§5.3) — injected once per framed card; static markup only.
{
  const CORNER_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 40 V13 Q3 3 13 3 H40" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 27 Q15 25 15 15 Q15 8 9 8" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.8"/><rect x="17" y="5" width="4.6" height="4.6" transform="rotate(45 19.3 7.3)" fill="currentColor"/></svg>';
  for (const id of ['intent-card', 'verdict-card']) {
    const card = document.getElementById(id);
    for (const pos of ['tl', 'tr', 'bl', 'br']) {
      const s = document.createElement('span');
      s.className = `corner ${pos}`;
      s.innerHTML = CORNER_SVG;
      card.appendChild(s);
    }
  }
}

// Wire-shape guard for the exp attachment. Anything else → null (Plain).
const CTL_RE = /[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
function sanitizeExp(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.kind !== 'check' && raw.kind !== 'cinematic') return null;
  const out = { kind: raw.kind };
  if (typeof raw.subtitle === 'string') {
    // cutText, not a bare slice: the cap must not saw a '🎲' in half and leave
    // a lone surrogate the canonical would carry into encodeURIComponent.
    const s = cutText(raw.subtitle.replace(CTL_RE, ''), EXP_MAX_SUBTITLE);
    if (s) out.subtitle = s;
  }
  return out;
}

const fmtNum = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '+0');

function beginCeremony(roll) {
  roll.ceremony = {
    exp: roll.exp,
    phase: 'declare',
    clock: 0,
    declareDur: CEREMONY_DECLARE_S,
    stages: null,
    stageIdx: 0,
    entry: null,
  };
  clearTimeout(ceremonyDismissTimer);
  // The dice are frozen at the throw's first keyframe (mid-air); keep them
  // out of sight while the declaration holds the stage.
  for (const d of roll.dice) d.mesh.visible = false;
  renderIntentCard(roll);
  applyMatDecal(roll.label);
  setCeremonyPhaseClass(roll, 'c-declare');
}

function setCeremonyPhaseClass(roll, cls) {
  const keep = [cls];
  if (roll.ceremony.exp.kind === 'cinematic') keep.push('cinematic');
  if (ceremonyLayer.classList.contains('crit')) keep.push('crit');
  if (ceremonyLayer.classList.contains('skip')) keep.push('skip');
  ceremonyLayer.className = keep.join(' ');
}

function ceremonyEnterTumble(roll) {
  const cer = roll.ceremony;
  cer.phase = 'tumble';
  cer.clock = 0;
  for (const d of roll.dice) d.mesh.visible = true;
  renderDockStrip(roll);
  setCeremonyPhaseClass(roll, 'c-tumble');
}

// Settle staging (§2.4 phases 3–7): build the entry, land the log line, and
// queue the stage beats on the playback clock. Budget ≤ CEREMONY_BUDGET_S.
function ceremonyEnterSettle(roll) {
  const cer = roll.ceremony;
  if (cer.phase === 'settle') return;
  cer.phase = 'settle';
  cer.clock = 0;
  const entry = entryFromRoll(roll);
  cer.entry = entry;
  lastEntry = entry;
  addLogEntry(entry); // same log entry as today (entry.spec carries exp)

  const n = entry.parts.length;
  const stagger = n <= 6 ? 0.07 : 0.04;
  const tChips = CEREMONY_HITSTOP_S;
  const tVerdict = Math.min(tChips + n * stagger + 0.12, CEREMONY_BUDGET_S - 0.45);
  const tEnd = Math.min(tVerdict + 0.45, CEREMONY_BUDGET_S);
  cer.stages = [
    { t: 0, fn: stageHitStop },
    { t: tChips, fn: stageChips },
    { t: tVerdict, fn: stageVerdict },
    { t: tEnd, fn: null }, // end marker → ceremonyFinish
  ];
  cer.stageIdx = 0;
  ceremonyStepSettle(roll, 0);
}

function ceremonyStepSettle(roll, dt) {
  const cer = roll.ceremony;
  cer.clock += dt;
  while (cer.stageIdx < cer.stages.length && cer.clock >= cer.stages[cer.stageIdx].t) {
    const s = cer.stages[cer.stageIdx++];
    if (s.fn) s.fn(roll);
  }
  if (cer.stageIdx >= cer.stages.length) ceremonyFinish(roll);
}

function stageHitStop(roll) {
  const flash = document.getElementById('hit-flash');
  flash.classList.remove('flash');
  void flash.offsetWidth; // restart the animation
  flash.classList.add('flash');
}

function stageChips(roll) {
  renderChips(roll.ceremony.entry, roll.dice, true);
}

function stageVerdict(roll) {
  const cer = roll.ceremony;
  const crit = entryCrit(cer.entry); // active-system lens at staging time
  if (crit) {
    ceremonyLayer.classList.add('crit');
    playCritEffect(crit, critWord(crit, entryMeaning(cer.entry)));
  }
  renderVerdictCard(roll, cer.entry);
  setCeremonyPhaseClass(roll, 'c-verdict');
}

// The auto-dismiss handoff: the moment ends, the roll does not. The verdict
// card retires into the same quiet banner a plain roll leaves, so Collect
// and the base ✕ survive the ceremony — a check roll used to strand its
// dice on the felt with no affordance at all once the card timed out. A
// roll already collected/cleared (or upstaged by a newer roll) hands off to
// nothing, exactly as before.
function retireCeremonyToBanner(roll) {
  const sv = stagedVerdict;
  dismissCeremonyUI();
  if (!sv || !sv.entry) return;
  const st = sv.entry.rollId ? rollStates.get(sv.entry.rollId) : null;
  if (st && (st.cleared || st.collected !== null)) return; // already off the felt
  lastEntry = sv.entry;
  renderRollResults(sv.entry, roll.dice, false); // no fx: the moment already played
}

function ceremonyFinish(roll) {
  const cer = roll.ceremony;
  if (cer.phase === 'done') return;
  cer.phase = 'done';
  roll.done = true;
  clearTimeout(ceremonyDismissTimer);
  ceremonyDismissTimer = setTimeout(() => retireCeremonyToBanner(roll), CEREMONY_DISMISS_MS);
  runPendingReveal(roll);  // a reveal that arrived mid-ceremony lands now
  runPendingCollect(roll); // a collect that arrived mid-ceremony lands now
  runPendingClear(roll);   // …and a clear wins over it
  if (rollQueue.length) playRoll(rollQueue.shift());
}

// Jump to the completed verdict (<150 ms — §2.4). Any click on the cards or
// Space during a ceremony lands here; a queued roll auto-skips via playRoll.
function skipCeremony() {
  const roll = currentRoll;
  if (!roll || roll.done || !roll.ceremony) return false;
  const cer = roll.ceremony;
  ceremonyLayer.classList.add('skip'); // suppress decorative motion this jump
  if (cer.phase === 'declare') ceremonyEnterTumble(roll);
  if (cer.phase === 'tumble') {
    roll.time = roll.duration;
    roll.soundIdx = roll.sounds.length; // no burst of queued impact clicks
    for (const d of roll.dice) {
      d.mesh.position.copy(d.finalPos);
      d.mesh.quaternion.copy(d.finalQuat);
    }
    ceremonyEnterSettle(roll);
  }
  if (!roll.done && cer.stages) {
    while (cer.stageIdx < cer.stages.length) {
      const s = cer.stages[cer.stageIdx++];
      if (s.fn) s.fn(roll);
    }
    // Chips live in #chips-layer, OUTSIDE #ceremony-layer, so the 'skip' class
    // can never reach their staggered pop-in — re-render them unstaged (the
    // plain-roll presentation) so every die value is present immediately.
    // Must happen BEFORE ceremonyFinish: finishing may hand the stage to a
    // queued roll, and this roll's chips must not repaint over it.
    if (cer.entry) renderChips(cer.entry, roll.dice, false);
    ceremonyFinish(roll);
  }
  // Double rAF: the first fires before the style recalc that would apply
  // 'skip', so removing it there means no computed style ever carries the
  // zero-duration override. Let one painted frame carry it, then remove.
  requestAnimationFrame(() => requestAnimationFrame(() => ceremonyLayer.classList.remove('skip')));
  return true;
}

// Remove every ceremony surface (cards, decal). Safe to call at any time;
// playRoll and clearTable both start from a clean stage. Toggling compact view
// mid-ceremony needs no special handling: the ceremony keeps playing on the
// same surfaces, only re-scaled by CSS (§7.4).
function dismissCeremonyUI() {
  clearTimeout(ceremonyDismissTimer);
  ceremonyDismissTimer = null;
  ceremonyLayer.className = 'hidden';
  stagedVerdict = null; // nothing on screen left for a lens change to repaint
  clearMatDecal();
}

// ---- card rendering (user-supplied strings via textContent only) ----------

function setMonogram(el, roll) {
  const name = roll.playerName || '';
  el.textContent = name ? name[0].toUpperCase() : '✦';
  el.style.setProperty('--player-color', roll.color || '#4a7fb5');
  el.title = name;
}

function preModChips(mods) {
  if (!mods) return [];
  const out = [];
  const parts = Array.isArray(mods.parts) ? mods.parts.filter((p) => p.value) : null;
  if (parts && parts.length) {
    for (const p of parts.slice(0, 4)) out.push({ v: fmtNum(p.value), l: p.label || 'Modifier' });
  } else if (mods.modifier) {
    out.push({ v: fmtNum(mods.modifier), l: 'Modifier' });
  }
  if (mods.adv === 'adv') out.push({ v: 'ADV', l: 'Advantage' });
  if (mods.adv === 'dis') out.push({ v: 'DIS', l: 'Disadvantage' });
  if (mods.keep) out.push({ v: mods.keep.mode.toUpperCase() + mods.keep.n, l: KEEP_WORDS[mods.keep.mode] });
  if (mods.reroll) out.push({ v: `RO≤${mods.reroll.below}`, l: 'Reroll' });
  if (mods.explode) out.push({ v: '!', l: 'Exploding' });
  return out;
}

function renderIntentCard(roll) {
  const exp = roll.exp;
  setMonogram(document.getElementById('intent-monogram'), roll);
  document.getElementById('intent-eyebrow').textContent =
    exp.kind === 'cinematic' ? 'Reckoning' : 'Ordeal';
  document.getElementById('intent-title').textContent = roll.label || '';
  document.getElementById('intent-subtitle').textContent = exp.subtitle || '';
  const hasDc = Number.isInteger(roll.dc);
  document.getElementById('intent-target').classList.toggle('hidden', !hasDc);
  document.getElementById('intent-target-label').classList.toggle('hidden', !hasDc);
  if (hasDc) document.getElementById('intent-target-num').textContent = String(roll.dc);

  const holder = document.getElementById('intent-mods');
  holder.innerHTML = '';
  for (const chip of preModChips(roll.spec && roll.spec.mods)) {
    const el = document.createElement('span');
    el.className = 'pre-mod';
    const b = document.createElement('b');
    b.textContent = chip.v;
    el.appendChild(b);
    el.append(` ${chip.l}`);
    holder.appendChild(el);
  }
  document.getElementById('intent-notation').textContent = canonicalNotation(
    { dice: roll.spec.dice, mods: roll.spec.mods },
    { dc: roll.dc, comment: null }
  );
}

function renderDockStrip(roll) {
  setMonogram(document.getElementById('strip-monogram'), roll);
  document.getElementById('strip-title').textContent = roll.label || '';
  const bits = [roll.exp.kind === 'cinematic' ? 'Reckoning' : 'Ordeal'];
  if (roll.exp.subtitle) bits.push(roll.exp.subtitle);
  document.getElementById('strip-sub').textContent = bits.join(' · ');
  const hasDc = Number.isInteger(roll.dc);
  document.getElementById('strip-dc').classList.toggle('hidden', !hasDc);
  if (hasDc) document.getElementById('strip-dc-num').textContent = String(roll.dc);
}

// Attribution cards for the §2.4 rescue beat: named bonus parts (§7.2),
// advantage kept-over-struck, rerolls, keep/drop, explosions. Each card is
// {v, segs:[{t, s?}]} — s marks a struck-through segment.
function attributionCards(roll, entry) {
  const cards = [];
  const mods = (roll.spec && roll.spec.mods) || {};
  const parts = Array.isArray(mods.parts) ? mods.parts.filter((p) => p.value) : null;
  if (parts && parts.length) {
    for (const p of parts) cards.push({ v: fmtNum(p.value), segs: [{ t: p.label || 'Modifier' }] });
  } else if (entry.modifier) {
    cards.push({ v: fmtNum(entry.modifier), segs: [{ t: 'Modifier' }] });
  }
  if (mods.adv) {
    const struck = entry.parts.filter((p) => p.reason === 'adv').map((p) => p.label);
    const kept = entry.parts
      .filter((p) => p.type === 'd20' && p.counts && !p.child)
      .map((p) => p.label);
    cards.push({
      v: mods.adv === 'adv' ? 'ADV' : 'DIS',
      segs: struck.length
        ? [{ t: `kept ${kept.join(' ')} · ` }, { t: struck.join(' '), s: true }]
        : [{ t: mods.adv === 'adv' ? 'Advantage' : 'Disadvantage' }],
    });
  }
  if (mods.reroll) {
    const segs = [];
    (roll.perDie || []).forEach((pd, i) => {
      if (pd && pd.rerollOf !== null && pd.rerollOf !== undefined
          && entry.parts[pd.rerollOf] && entry.parts[i]) {
        if (segs.length) segs.push({ t: '  ' });
        segs.push({ t: entry.parts[pd.rerollOf].label, s: true });
        segs.push({ t: ` → ${entry.parts[i].label}` });
      }
    });
    cards.push({ v: `RO≤${mods.reroll.below}`, segs: segs.length ? segs : [{ t: 'no low rolls' }] });
  }
  if (mods.keep) {
    const dropped = entry.parts.filter((p) => p.reason === 'drop').map((p) => p.label);
    cards.push({
      v: mods.keep.mode.toUpperCase() + mods.keep.n,
      segs: dropped.length
        ? [{ t: 'dropped ' }, { t: dropped.join(' '), s: true }]
        : [{ t: KEEP_WORDS[mods.keep.mode] }],
    });
  }
  if (mods.explode) {
    const kids = entry.parts.filter((p) => p.child).length;
    cards.push({ v: '!', segs: [{ t: kids ? `exploded ×${kids}` : 'no explosions' }] });
  }
  return cards;
}

let verdictFor = null; // {rollId, mine} — what the verdict card's control acts on

function renderVerdictCard(roll, entry) {
  stagedVerdict = { roll, entry }; // the repaint target while this card is up
  const hidden = entryHidden(entry);
  const who = entry.playerName ? `${entry.playerName} · ` : '';
  document.getElementById('verdict-eyebrow').textContent = `${who}${entry.label || ''}`;
  document.getElementById('verdict-total').textContent = hidden ? '?' : String(entry.total);

  // §7.7: the roller's control reads Collect and shelves the roll for
  // everyone; a spectator's reads ✕ and only dismisses locally.
  const mine = !netOnline || (net && entry.playerId === net.playerId);
  verdictFor = { rollId: entry.rollId || null, mine };
  const doneBtn = document.getElementById('verdict-done');
  doneBtn.textContent = mine ? 'Collect' : '✕';
  doneBtn.title = mine
    ? 'Collect this roll to the shelf for everyone'
    : 'Dismiss for you — the dice stay until the roller collects';
  // §7.7.2: not every roll deserves shelf space — the roller also gets a ✕
  // that clears the dice outright (spectators keep the single local ✕).
  document.getElementById('verdict-x').classList.toggle('hidden', !(mine && entry.rollId));
  // goal 11: a held ceremony's verdict card carries Reveal for the authority.
  document.getElementById('verdict-reveal').classList.toggle('hidden', !canReveal(entry));
  // …and ⟳ waits for the reveal with everything else (canReroll).
  document.getElementById('verdict-again').classList.toggle('hidden', !canReroll(entry));

  const hasDc = Number.isInteger(entry.dc);
  const ring = document.getElementById('ring-fill');
  const CIRC = 326.7;
  const frac = hasDc && !hidden ? Math.max(0.04, Math.min(entry.total / entry.dc, 1)) : 1;
  ring.style.strokeDashoffset = String(Math.round(CIRC * (1 - frac) * 10) / 10);
  ring.classList.toggle('fail', hasDc && !hidden && entry.total < entry.dc);

  const marginEl = document.getElementById('verdict-margin');
  const heroEl = document.getElementById('verdict-hero');
  const chartEl = document.getElementById('verdict-chart');
  const meaning = entryMeaning(entry); // active-system lens (null in dnd/none)
  heroEl.className = 'verdict-hero';
  chartEl.textContent = '';
  marginEl.textContent = '';
  const holderPre = document.getElementById('verdict-modcards');
  if (hidden) {
    // Public stakes, hidden result (goal 11): DC shows, verdict/margin/
    // attribution wait for the reveal.
    if (hasDc) marginEl.append(`vs DC ${entry.dc}`);
    heroEl.textContent = entry.visMode === 'whisper' ? 'Whispered' : 'Face down';
    heroEl.classList.add('held');
    holderPre.innerHTML = '';
    return;
  }
  if (hasDc) {
    // §2.5: the target verdict owns the hero slot; the chart word demotes
    // to a labeled chart line. Never merged, never hidden.
    const cleared = entry.total >= entry.dc;
    marginEl.append(`vs DC ${entry.dc} · margin `);
    const b = document.createElement('b');
    b.textContent = fmtNum(entry.total - entry.dc);
    marginEl.appendChild(b);
    heroEl.textContent = cleared ? 'Success' : 'Failure';
    if (!cleared) heroEl.classList.add('bad');
    if (meaning) {
      chartEl.append('Chart · ');
      const w = document.createElement('span');
      w.className = 'chart-word';
      w.textContent = meaning.word;
      chartEl.appendChild(w);
    }
  } else if (meaning) {
    heroEl.textContent = meaning.word;
    heroEl.classList.add(`tier-${meaning.tier}`);
  } else {
    heroEl.textContent = '';
  }

  const holder = document.getElementById('verdict-modcards');
  holder.innerHTML = '';
  attributionCards(roll, entry).slice(0, 6).forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'mod-card';
    card.style.setProperty('--fly-delay', `${(0.1 + 0.12 * i).toFixed(2)}s`);
    const mv = document.createElement('div');
    mv.className = 'mv';
    mv.textContent = c.v;
    const ml = document.createElement('div');
    ml.className = 'ml';
    for (const seg of c.segs) {
      if (seg.s) {
        const s = document.createElement('s');
        s.textContent = seg.t;
        ml.appendChild(s);
      } else {
        ml.append(seg.t);
      }
    }
    card.append(mv, ml);
    holder.appendChild(card);
  });
}

// ---- skip + actions wiring -------------------------------------------------

ceremonyLayer.addEventListener('click', (e) => {
  if (e.target.closest('.verdict-actions')) return; // buttons act, not skip
  skipCeremony();
});

// Always interruptible (GOALS) — the invariant covers a PLAIN roll's tumble
// too, not just ceremonies: click the felt or press Space and the throw jumps
// to its final keyframe, chips, banner and log line. Exactly ONE roll skips —
// the one in flight. Stepping past its duration finishes it and hands the
// stage to whatever is queued, which then plays its own presentation from the
// top; draining the queue here (what a hidden tab's refocus catch-up does)
// would flatten a queued ceremony's declare/tumble/verdict staging as
// collateral for a click meant for this throw. Ceremony rolls keep their own
// richer skip.
function skipPlainPlayback() {
  const roll = currentRoll;
  if (!roll || roll.done || roll.ceremony) return false;
  stepPlayback(roll.duration - roll.time + FIXED_DT);
  return true;
}
container.addEventListener('click', () => { skipPlainPlayback(); skipRevealFx(); });

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
  // The palette/cheatsheet are layers over the table: Space must not skip a
  // ceremony hidden behind their backdrop (focus can leave the palette input
  // via a frame click, which would otherwise pass the guard above).
  if (isPaletteOpen() || isKbdOpen()) return;
  if (currentRoll && currentRoll.ceremony && !currentRoll.done) {
    e.preventDefault();
    skipCeremony();
    return;
  }
  // A focused button owns Space (it activates it); the table's skip yields.
  if (t instanceof HTMLElement && t.closest('button')) return;
  const skipped = skipPlainPlayback();
  if (skipRevealFx() || skipped) e.preventDefault();
});
document.getElementById('verdict-done').addEventListener('click', (e) => {
  e.stopPropagation();
  const v = verdictFor;
  const btn = e.currentTarget;
  // Roller: Collect — the dice whisk to the shelf with their moment (§7.7).
  // Not dismissed optimistically: online, the 'roll-collected' broadcast
  // closes the card (shelveRoll dismisses the ceremony UI); solo applies
  // synchronously. A failed POST keeps the card and its Collect button — the
  // dice are still on everyone's felt, so the affordance must survive.
  if (v && v.mine && v.rollId) {
    btn.disabled = true;
    requestCollectRoll(v.rollId).then((ok) => {
      btn.disabled = false;
      if (!ok) showSettingsNote('couldn’t collect the roll — try again');
    });
  } else {
    dismissCeremonyUI(); // spectator ✕ (or a roll with no id): local dismiss only
  }
});
document.getElementById('verdict-again').addEventListener('click', (e) => {
  e.stopPropagation();
  rerollLast(); // same semantics as the 'r' shortcut
});
// §7.7.2 roller ✕: clear this roll's dice for everyone without shelving.
// Not optimistic — the 'roll-cleared' broadcast (or the synchronous solo
// apply) closes the card via applyClearRoll; a failed POST keeps the card.
document.getElementById('verdict-x').addEventListener('click', (e) => {
  e.stopPropagation();
  const v = verdictFor;
  if (!v || !v.mine || !v.rollId) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  requestClearRoll(v.rollId).then((ok) => {
    btn.disabled = false;
    if (!ok) showSettingsNote('couldn’t clear the roll — try again');
  });
});
// goal 11: the held verdict card's Reveal — same path as banner/marker/peek;
// the card upgrades in place when the reveal comes back around.
document.getElementById('verdict-reveal').addEventListener('click', (e) => {
  e.stopPropagation();
  const v = verdictFor;
  if (v && v.rollId) requestReveal(v.rollId);
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

// The physics world is only stepped inside playRoll's synchronous
// fast-forward; the rAF loop just advances keyframe playback.
function tick(dt, render = true) {
  stepPlayback(dt);
  stepSinking(dt);   // per-roll Done departures (§7.5)
  stepWhisking(dt);  // collect whisks onto the shelf (§7.7)
  stepRevealing(dt); // reveal correction flips (goal 11)
  if (chips.length) positionChips();
  if (shelfClusters.size) positionShelfMarkers();
  updateCornerClear();
  if (render) renderer.render(scene, camera);
}

// 'Clear table' exists only while there is a table to clear: dice on the
// felt or the shelf (tableDice covers both). Checked every tick — dice
// arrive and leave on many paths — but the DOM write is state-guarded.
const cornerControlsEl = document.getElementById('corner-controls');
let cornerShown = false;
function updateCornerClear() {
  const show = tableDice.length > 0;
  if (show === cornerShown) return;
  cornerShown = show;
  cornerControlsEl.classList.toggle('hidden', !show);
}

// Tests only (__diceDebug.holdClock): freeze the rAF clock so the world moves
// exactly as far as sim() says and no further. The delta is still consumed
// every frame, so releasing the hold never dumps a saved-up dt into the sim.
let clockHeld = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  tick(clockHeld ? 0 : dt);
}
animate();

// Browsers suspend rAF in hidden tabs, so 'roll' events received while hidden
// pile up in rollQueue and would each replay at full length on refocus.
// Instead, the moment the tab becomes visible again, finish the in-flight
// roll and drain the whole queue instantly (results, chips, and log entries
// all land via the normal stepPlayback -> showResults path).
function fastForwardPlayback() {
  let guard = 0;
  while (currentRoll && !currentRoll.done && guard++ < 500) {
    // A ceremony roll jumps straight to its completed verdict (also covers
    // post-settle staging, where duration - time would be ≤ 0).
    if (currentRoll.ceremony) skipCeremony();
    else stepPlayback(currentRoll.duration - currentRoll.time + FIXED_DT);
  }
  skipRevealFx(); // a reveal beat queued behind the playback lands too
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) fastForwardPlayback();
});

// manual stepping hook for automated tests (headless tabs never fire rAF)
window.__diceDebug = {
  tick,
  rollDice,
  playRoll,
  clearTable,
  parseNotation,
  canonicalNotation,
  commandRoll(str) { return commandRoll(str); }, // execute a notation string
  get groups() { return groups; },
  // saved groups: write back to ONE record by id — the inline row editor's
  // own path (editPoolById). patch = {name?, notation?}; returns the updated
  // {id, name, notation} or false (unknown id / notation that doesn't parse).
  editPool(id, patch) { return editPoolById(id, patch); },
  get cmdHistory() { return cmdHistory; },
  get tableDice() { return tableDice; },
  get currentRoll() { return currentRoll; },
  get busy() { return !!(currentRoll && !currentRoll.done) || rollQueue.length > 0; },
  get queueLength() { return rollQueue.length; },
  get net() { return { online: netOnline, playerId: net ? net.playerId : null }; },
  get netReady() { return netReady; },
  // The last thing the server refused us ({path, status, code, message}) —
  // the same text the pill shows. Null until something is refused.
  get lastRefusal() { return lastRefusal ? { ...lastRefusal } : null; },
  // room settings (roadmap §2): current merged object, live felt state, and
  // the same entry points the settings modal uses.
  get settings() { return { ...roomSettings }; },
  get felt() {
    return {
      id: currentFeltId,
      ...FELT_THEMES[currentFeltId],
      background: '#' + scene.background.getHexString(),
    };
  },
  setFelt(id) { return selectFelt(id); },
  // interpretation system (goal 6): active profile id + the picker's entry point
  get system() { return currentSystemId; },
  setSystem(id) { return selectSystem(id); },
  openSettings() { openSettingsModal(); },
  // ceremony introspection (UX §2.4): phase machine + decal state
  get ceremonyState() {
    const r = currentRoll;
    if (!r || !r.ceremony) return null;
    return {
      phase: r.ceremony.phase,
      kind: r.ceremony.exp.kind,
      clock: r.ceremony.clock,
      decal: matDecalText,
    };
  },
  skipCeremony() { return skipCeremony(); },
  skipPlain() { return skipPlainPlayback(); },
  // The CEREMONY_DISMISS_MS handoff, driven directly (tests can't wait out a
  // real 7 s timer): the verdict card retires into the plain-roll banner.
  retireCeremony() {
    if (currentRoll) retireCeremonyToBanner(currentRoll);
    return !banner.classList.contains('hidden');
  },
  // quick palette (tests): open it / observe its open state
  openPalette() { openPalette(); },
  get paletteOpen() { return isPaletteOpen(); },
  // ± popover (tests): open for a source — 'tray', a group id, or a group
  // name — and observe the bound state (UX §7.4).
  openPopoverFor(source) {
    if (source === 'tray') {
      paintCmd();
      openPopover({ source: 'tray', row: document.getElementById('tray-actions') });
    } else {
      const g = groups.find((x) => x.id === source || x.name === source);
      if (!g) return false;
      const row = document.querySelector(`#groups-list [data-group-id="${g.id}"]`) || null;
      openPopover({ source: 'group', group: g, row });
    }
    return !!pop;
  },
  get popover() {
    if (!pop) return null;
    return {
      source: pop.source,
      groupId: pop.groupId,
      dice: [...pop.dice],
      dc: pop.dc,
      faceDown: pop.vis.mode === 'held', // legacy mirror of the vis picker
      visibility: { mode: pop.vis.mode, names: [...pop.vis.names] },
      canonical: popCanonical(),
      open: !document.getElementById('mods-popover').classList.contains('hidden'),
    };
  },
  setPopoverVisibility(mode, names) {
    if (!pop) return false;
    const m = mode === 'open' || VIS_MODES.includes(mode) ? mode : null;
    if (!m) return false;
    pop.vis.mode = m;
    pop.vis.names = m === 'whisper' && Array.isArray(names)
      ? names.filter((n) => typeof n === 'string' && n)
      : [];
    renderPop();
    return true;
  },
  closePopover() { closePopover(); },
  // per-roll Done (§7.5): the roller-side entry point + sink observability
  clearRoll(rollId) { return requestClearRoll(rollId); },
  get sinkingCount() { return sinking.length; },
  get pendingClears() { return [...pendingClears]; },
  // the collect shelf (§7.7): entry point + cluster observability
  collectRoll(rollId) { return requestCollectRoll(rollId); },
  get shelf() {
    return [...shelfClusters.values()]
      .sort((a, b) => a.seq - b.seq)
      .map((c) => ({
        rollId: c.rollId, seq: c.seq, slot: c.slot, diceCount: c.diceCount,
        glow: !!c.glow, glowRadius: c.glow ? clusterGlowRadius(c) : 0,
      }));
  },
  get whiskingCount() { return whisking.length; },
  get pendingCollects() { return [...pendingCollects.keys()]; },
  // shelf quiet-by-default (P1): the resting markers' shape, for asserting
  // they stay dot-only targets with no always-on total/word/✕. JSON-safe.
  get shelfMarkers() {
    return [...shelfLayer.querySelectorAll('.shelf-marker')]
      .filter((el) => !el.classList.contains('chip-clearing'))
      .map((el) => ({
        rollId: el.dataset.rollId || null,
        // bare = no child chrome at all: the resting target draws nothing
        bare: el.childElementCount === 0,
        text: el.textContent,
        hasTotal: !!el.querySelector('.sm-total'),
        hasX: !!el.querySelector('.sm-x'),
        hasReveal: !!el.querySelector('.sm-reveal'),
        // offsetWidth/Height: the layout target size, unaffected by the
        // chip-pop scale transform still playing when a test measures.
        width: el.offsetWidth,
        height: el.offsetHeight,
      }));
  },
  // visibility (goal 11): reveal/offer/claim entry points + redaction
  // observability. Everything returned is JSON-safe primitives.
  reveal(rollId) { requestReveal(rollId); },
  offerRoll(str) {
    const r = commandOffer(str);
    return { ok: r.ok === true, state: r.state || (r.ok ? 'ok' : 'invalid'), error: r.error || null, posted: r.ok === true && netOnline };
  },
  claimOffer(offerId) { return net ? net.claim(offerId) : Promise.resolve(false); },
  unoffer(offerId) { return net ? net.unoffer(offerId) : Promise.resolve(false); },
  get offers() {
    return offers.map((o) => ({
      offerId: o.offerId,
      byId: o.byId || null,
      byName: o.byName || null,
      label: o.label || '',
      dice: [...(o.dice || [])],
      dc: Number.isInteger(o.dc) ? o.dc : null,
      faceDown: !!o.faceDown,
      visibility: o.visibility ? JSON.parse(JSON.stringify(o.visibility)) : null,
      exp: o.exp ? JSON.parse(JSON.stringify(o.exp)) : null,
    }));
  },
  // Projection of one entry's redaction/reveal state (lastEntry when no id).
  entryState(rollId) {
    const e = rollId ? log.find((x) => x.rollId === rollId) : lastEntry;
    if (!e) return null;
    return {
      rollId: e.rollId || null,
      hidden: entryHidden(e),
      redacted: e.redacted === true,
      revealed: e.revealed !== false,
      faceDown: !!e.faceDown,
      visMode: e.visMode || null,
      total: typeof e.total === 'number' ? e.total : null,
      values: e.parts.map((p) => (p.value == null ? null : p.value)),
      dc: Number.isInteger(e.dc) ? e.dc : null,
      canReveal: canReveal(e),
    };
  },
  // die chips (P1 quiet by default): the per-user visibility preference and
  // the live chip count. setChipsVisible returns the resulting state.
  get chipsVisible() { return chipsOn; },
  setChipsVisible(on) { setChips(on); return chipsOn; },
  get chipCount() { return chips.length; },
  // chrome (the three collapsible panel regions + emergent compact view):
  // open booleans per region, allCollapsed = the emergent body.mini state.
  // setPanelState applies a partial {region: bool} patch and returns the
  // resulting state. JSON-safe.
  get panelState() { return panelDebugState(); },
  // saved-pools flyout (roll without pinning the panel open): the hover
  // behavior, driven directly where headless tests can't hover.
  get groupsFlyout() { return groupsPanelEl.classList.contains('flyout'); },
  setGroupsFlyout(open) {
    if (open) openGroupsFlyout(); else closeGroupsFlyout();
    return groupsPanelEl.classList.contains('flyout');
  },
  setPanelState(patch) {
    if (patch && typeof patch === 'object') {
      for (const k of Object.keys(PANEL_DEFS)) {
        if (typeof patch[k] === 'boolean') setPanel(k, patch[k]);
      }
    }
    return panelDebugState();
  },
  // identity (the rail chip): who you are + the chip's own actions, all
  // solo-capable. changeName refuses '#' (false) and otherwise applies
  // everywhere; leaveTable drops the seat (net.disconnect), clears the
  // stored name, and re-prompts 'Take a seat'. JSON-safe.
  get identity() { return identityInfo(); },
  get players() { return players.map((p) => ({ id: p.id, name: p.name })); },
  changeName(name) { return applyRename(name); },
  leaveTable() { return leaveTable(); },
  get shroudedCount() { return tableDice.filter((d) => d.shrouded).length; },
  get revealingCount() { return revealing.length; },
  get pendingReveals() { return [...pendingReveals.keys()]; },
  // peek cards (§7.7.1): open for a shelved rollId / close with null, plus
  // the open card's state for content assertions.
  peek(rollId) {
    if (!rollId) { closePeek(); return null; }
    return openPeek(rollId) ? rollId : null;
  },
  get peekState() {
    if (peekRollId === null) return null;
    return {
      rollId: peekRollId,
      text: peekEl.textContent,
      breakdown: (peekEl.querySelector('.pk-breakdown') || { textContent: '' }).textContent,
      total: (peekEl.querySelector('.pk-total') || { textContent: '' }).textContent,
      hasReveal: !!peekEl.querySelector('.pk-reveal'),
      hasAgain: !!peekEl.querySelector('.pk-again'),
      hasTweak: !!peekEl.querySelector('.pk-tweak'),
      hasClear: !!peekEl.querySelector('.pk-clear'),
      rect: (() => { const r = peekEl.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })(),
    };
  },
  // shelf geometry + the camera's own projection: how a headless check proves
  // the trays and their markers are on screen at a given viewport (§7.7).
  get shelfGeometry() {
    return {
      slots: SHELF_SLOTS,
      z: SHELF_Z,
      w: SHELF_SLOT_W,
      d: SHELF_SLOT_D,
      markerY: SHELF_MARKER_Y,
      x: Array.from({ length: SHELF_SLOTS }, (_, i) => shelfSlotX(i)),
      camera: camera.position.toArray(),
    };
  },
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  },
  // felt composite sampling (tests): RGBA of the floor texture at world (x, z)
  // — how a headless check proves the slot decals survive theme/decal swaps.
  feltPixel(x, z) {
    const img = floor.material.map && floor.material.map.image;
    if (!img || !img.getContext) return null;
    const px = Math.max(0, Math.min(DECAL_SIZE - 1, Math.round((x + 80) * DECAL_PX_PER_UNIT)));
    const py = Math.max(0, Math.min(DECAL_SIZE - 1, Math.round((z + 80) * DECAL_PX_PER_UNIT)));
    return [...img.getContext('2d').getImageData(px, py, 1, 1).data];
  },
  sim(frames) { for (let i = 0; i < frames; i++) tick(1 / 60, false); },
  // Freeze the rAF clock: with it held, only sim() advances playback, which is
  // how a scenario parks a tab mid-tumble (a reveal arriving THERE must defer).
  holdClock(on) { clockHeld = !!on; return clockHeld; },
  get clockHeld() { return clockHeld; },
  fastForward: fastForwardPlayback,
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyCameraFraming(); // a narrower window refits the table and its shelf
  positionChips();
  measurePeek(); // the card's max-width tracks the viewport (100vw - 16px)
  positionShelfMarkers();
});

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Tray builder UI
// ---------------------------------------------------------------------------

let tray = [];

// Open ± popover state (see the popover section below). Declared this early
// because renderGroups AND the module-evaluation paintCmd() both run before
// the popover section is reached.
let pop = null;

const dieButtonsEl = document.getElementById('die-buttons');
const trayEl = document.getElementById('tray');
const rollTrayBtn = document.getElementById('roll-tray');
const trayModsBtn = document.getElementById('tray-mods');
const clearTrayBtn = document.getElementById('clear-tray');
const saveGroupBtn = document.getElementById('save-group');
const groupNameInput = document.getElementById('group-name');

for (const type of DIE_TYPES) {
  const btn = document.createElement('button');
  btn.className = 'die-btn';
  btn.textContent = type;
  btn.style.setProperty('--die-color', DIE_DEFS[type].color);
  btn.addEventListener('click', () => {
    if (tray.length < MAX_DICE_ON_TABLE) {
      tray.push(type);
      renderTray();
      syncBoxFromTray();
    }
  });
  dieButtonsEl.appendChild(btn);
}
// eighth cell: percentile shortcut — d100 is the pool d10x+d10 (panel.html)
{
  const btn = document.createElement('button');
  btn.className = 'die-btn';
  btn.textContent = 'd100';
  btn.style.setProperty('--die-color', DIE_DEFS.d10x.color);
  btn.title = 'd10x + d10';
  btn.addEventListener('click', () => {
    if (tray.length + 2 <= MAX_DICE_ON_TABLE) {
      tray.push('d10x', 'd10');
      renderTray();
      syncBoxFromTray();
    }
  });
  dieButtonsEl.appendChild(btn);
}

// Canonical notation for a plain dice list — label fallbacks, pill titles,
// offer details. One renderer everywhere so chips can't lie (UX §1.4).
function formula(types) {
  return canonicalNotation({ dice: types, mods: null });
}

// ---------------------------------------------------------------------------
// Visibility (goal 11): {mode: 'held'|'secret'|'whisper', names: [...]} —
// null means open. Visibility RIDES THE NOTATION STRING on the wire (the
// server re-parses; there is no parallel wire field), so these helpers are
// how every surface converts between UI state and the canonical spelling.
// ---------------------------------------------------------------------------

const VIS_MODES = ['held', 'secret', 'whisper'];

// Normalize a visibility-ish object (parse result, entry field, UI state);
// falls back to held when only the legacy faceDown boolean is known.
function normVis(v, faceDown = false) {
  if (v && typeof v === 'object' && VIS_MODES.includes(v.mode)) {
    const names = Array.isArray(v.names)
      ? v.names.filter((n) => typeof n === 'string' && n)
      : [];
    return { mode: v.mode, names };
  }
  return faceDown ? { mode: 'held', names: [] } : null;
}

// Visibility of a parseNotation result (spec.visibility once the grammar
// slice lands; res.faceDown covers today's held-only grammar).
function visOfParse(res) {
  return normVis(res.visibility || (res.spec && res.spec.visibility), res.faceDown);
}

// Visibility of a log entry, for reroll paths (a secret roll must never
// silently re-roll in the open). Whisper audiences may arrive as names or as
// playerIds; ids resolve against the current roster.
function entryVis(entry) {
  const v = (entry.spec && entry.spec.visibility) || entry.visibility;
  if (v && typeof v === 'object' && VIS_MODES.includes(v.mode)) {
    let names = Array.isArray(v.names) ? v.names.filter((n) => typeof n === 'string' && n) : null;
    if ((!names || !names.length) && Array.isArray(v.audience)) {
      names = v.audience
        .map((id) => (players.find((p) => p.id === id) || {}).name)
        .filter(Boolean);
    }
    return { mode: v.mode, names: names || [] };
  }
  if (entry.visMode === 'whisper') {
    return null; // a shrouded viewer can't reconstruct the audience — reroll open
  }
  return entry.faceDown || entry.visMode === 'held' ? { mode: 'held', names: [] } : null;
}

// The canonical flag token for the visibility slot: 'held' | 'secret' |
// 'w:Name1,Name2'. Canonical quoting (contract): quote ONLY when the name
// contains spaces, commas, quotes, or leading/trailing whitespace; preserve
// case; escape an embedded quote as \".
function visFlagToken(vis) {
  if (!vis || vis.mode === 'open') return null;
  if (vis.mode === 'held') return 'held';
  if (vis.mode === 'secret') return 'secret';
  const quote = (n) => (/[\s",]/.test(n) ? `"${n.replace(/"/g, '\\"')}"` : n);
  return 'w:' + vis.names.map(quote).join(',');
}

// canonicalNotation, visibility included. Once the grammar slice lands the
// renderer emits the flag itself (spec.visibility rides in); until then this
// splices the token into the canonical visibility slot (where 'held' sits:
// after the moment flags, before dcN / the comment) so every surface already
// produces the final spelling.
function canonicalWithVis(spec, extras = {}, vis = null) {
  const v = normVis(vis, extras.faceDown);
  // held rides the renderer's own faceDown (the pre-existing fixed point);
  // spec.visibility is attached only for the NEW modes, so a
  // visibility-aware renderer can never emit the held flag twice.
  const s = v && v.mode !== 'held'
    ? { ...spec, visibility: { mode: v.mode, names: [...v.names] } }
    : spec;
  let out = canonicalNotation(s, { ...extras, faceDown: !!(v && v.mode === 'held') });
  if (v && v.mode !== 'held') {
    const token = visFlagToken(v);
    if (token && !canonicalCarriesToken(out, token)) out = spliceVisFlag(out, token);
  }
  return out;
}

function canonicalCarriesToken(canonical, token) {
  const hash = canonical.indexOf(' # ');
  const head = hash >= 0 ? canonical.slice(0, hash) : canonical;
  return (' ' + head + ' ').includes(' ' + token + ' ');
}

function spliceVisFlag(canonical, token) {
  const hash = canonical.indexOf(' # ');
  let head = hash >= 0 ? canonical.slice(0, hash) : canonical;
  const tail = hash >= 0 ? canonical.slice(hash) : '';
  const m = /^(.*?)( dc\d{1,4})?$/.exec(head);
  head = `${m[1]} ${token}${m[2] || ''}`;
  return head + tail;
}

function renderTray() {
  trayEl.innerHTML = '';
  tray.forEach((type, i) => {
    const chip = document.createElement('span');
    chip.className = 'die-chip';
    chip.style.setProperty('--die-color', DIE_DEFS[type].color);
    chip.innerHTML = `<span class="dot"></span>${type}`;
    chip.title = 'Remove';
    chip.addEventListener('click', () => {
      tray.splice(i, 1);
      renderTray();
      syncBoxFromTray();
    });
    trayEl.appendChild(chip);
  });
  updateTrayButtons();
}

function updateTrayButtons() {
  const usable = (cmdResult && cmdResult.ok) || tray.length > 0;
  rollTrayBtn.disabled = !usable;
  trayModsBtn.disabled = !usable;
  clearTrayBtn.disabled = !tray.length && !cmdInput.value;
  saveGroupBtn.disabled = !usable;
}

rollTrayBtn.addEventListener('click', () => {
  // Re-parse the current text synchronously: the debounced cmdResult can be
  // up to 300 ms stale, and the parsed spec must match the notation we send.
  paintCmd();
  const name = groupNameInput.value.trim();
  if (cmdResult && cmdResult.ok) {
    // Same derivation as Enter (commandRoll): the moment the string DECLARES
    // wins, and dc→check only fills the gap. Reading the dc alone dropped a
    // 'cinematic'/'check' the player had typed (solo played it Plain) and let
    // the online and solo paths disagree about the same text.
    const intent = notationIntent(cmdInput.value.trim(), cmdResult);
    requestRoll(cmdResult.spec.dice, name || cmdResult.comment || cmdResult.canonical, {
      notation: intent.notation,
      canonical: intent.canonical,
      mods: cmdResult.spec.mods || undefined,
      faceDown: cmdResult.faceDown,
      visibility: visOfParse(cmdResult) || undefined,
      dc: cmdResult.dc ?? undefined,
      exp: intent.exp || undefined,
    });
  } else if (tray.length) {
    requestRoll([...tray], name || formula(tray));
  }
});
// The ad-hoc tray's ± (§7.4): the SAME popover, bound to the tray draft.
trayModsBtn.addEventListener('click', () => {
  if (pop && pop.source === 'tray') {
    closePopover();
    return;
  }
  paintCmd(); // synchronous re-parse: the debounced cmdResult can be stale
  openPopover({ source: 'tray', row: document.getElementById('tray-actions') });
});

clearTrayBtn.addEventListener('click', () => {
  tray = [];
  // Every key of the declared draft shape, including the §7.6/goal-11 ones:
  // canonicalNotation's defaults would absorb the missing ones today, but a
  // half-shaped boxExtras is a trap for the next reader of it.
  boxExtras = { mods: null, dc: null, comment: null, exp: null, visibility: null };
  cmdInput.value = '';
  renderTray();
  paintCmd();
});

// ---------------------------------------------------------------------------
// Command box (UX §1.3): one canonical string, two editors. Three validation
// states on a 300 ms debounce — valid (gold + canonical/Monte-Carlo preview),
// incomplete (neutral, never red), invalid (red + error + hint). Enter rolls;
// ↑/↓ walk 'dice.cmdhistory.v1'; '?' toggles a static cheatsheet. The tray and
// the box are two views of one draft: tray edits regenerate the string, a
// valid typed string re-renders the tray chips.
// ---------------------------------------------------------------------------

const cmdEl = document.getElementById('cmd');
const cmdInput = document.getElementById('cmd-input');
const cmdSlot = document.getElementById('cmd-slot');
const cmdHelpBtn = document.getElementById('cmd-help');
const cmdCheatsheet = document.getElementById('cmd-cheatsheet');

let cmdTimer = null;
let cmdResult = null; // last parse result for the box's current text
// Non-dice state of the draft, kept so tray edits preserve the whole intent:
// mods, dc, comment, and — since UX §7.6/goal 11 gave them spellings — the
// moment and visibility. Adding a die must not quietly undress the roll.
let boxExtras = { mods: null, dc: null, comment: null, exp: null, visibility: null };

let cmdHistory = load(LS_HISTORY, []);
if (!Array.isArray(cmdHistory)) cmdHistory = [];
cmdHistory = cmdHistory.filter((h) => typeof h === 'string').slice(0, HISTORY_CAP);

// Shell-style ↑/↓ walker over the SHARED cmdHistory store. Each command input
// (panel box, quick palette) gets its own walk position + preserved draft;
// pushHistory rebases every walker (restoring any mid-walk input to its
// preserved draft) so a fresh ↑ always lands on the newest roll.
const historyWalkers = [];
function makeHistoryWalker(input, repaint) {
  const w = {
    at: -1,      // -1 = live draft
    draft: '',
    reset() { w.at = -1; },
    // History changed underneath a walk (a roll landed from ANY surface): a
    // mid-walk input still displays a stale history entry, so restore the
    // preserved draft before resetting — otherwise the next ↑ would overwrite
    // the draft with the displayed entry and lose it.
    rebase() {
      if (w.at === -1) return;
      w.at = -1;
      input.value = w.draft;
      repaint();
    },
    arrow(e) {
      if (!cmdHistory.length) return;
      e.preventDefault();
      if (e.key === 'ArrowUp') {
        if (w.at === -1) w.draft = input.value;
        w.at = Math.min(cmdHistory.length - 1, w.at + 1);
      } else {
        w.at = Math.max(-1, w.at - 1);
      }
      input.value = w.at === -1 ? w.draft : cmdHistory[w.at];
      repaint();
    },
  };
  historyWalkers.push(w);
  return w;
}

// Successful rolls from ANY path land here with their canonical string:
// most recent first, deduped, capped, shared across rooms.
function pushHistory(canonical) {
  if (typeof canonical !== 'string' || !canonical) return;
  cmdHistory = [canonical, ...cmdHistory.filter((h) => h !== canonical)].slice(0, HISTORY_CAP);
  save(LS_HISTORY, cmdHistory);
  for (const w of historyWalkers) w.rebase();
}

function fmtPreview(dice, mods) {
  const p = previewSpec(dice, mods, 800);
  const avg = Math.round(p.avg * 10) / 10;
  return `min ${p.min} avg ${Number.isInteger(avg) ? avg : avg.toFixed(1)} max ${p.max}`;
}

// Three-state validation paint shared by the panel box and the quick palette:
// valid (gold + canonical/Monte-Carlo preview + warnings), incomplete
// (neutral, never red), invalid (red + error + hint). Pure presentation —
// callers own their side effects (tray sync, buttons).
function renderCmdState(boxEl, slotEl, res, raw) {
  slotEl.textContent = '';
  boxEl.classList.toggle('is-valid', res.ok === true);
  boxEl.classList.toggle('is-invalid', !res.ok && res.state === 'invalid');
  const span = (cls, text) => {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    slotEl.appendChild(el);
  };
  if (res.ok) {
    span('ok', `${res.canonical} · ${fmtPreview(res.spec.dice, res.spec.mods)}`);
    for (const w of res.warnings) span('warn', `⚠ ${w}`);
    // §7.4: both verbs are advertised wherever both are available.
    if (netOnline) span('muted', 'Enter roll · Shift+Enter offer');
  } else if (res.state === 'incomplete') {
    if (raw.trim()) span('muted', `… ${res.error}`);
  } else {
    span('bad', res.error + (res.hint ? ` — ${res.hint}` : ''));
  }
}

function paintCmd() {
  clearTimeout(cmdTimer);
  const raw = cmdInput.value;
  const res = parseNotation(raw);
  cmdResult = res;
  if (res.ok) {
    boxExtras = {
      mods: res.spec.mods,
      dc: res.dc,
      comment: res.comment,
      exp: res.exp,
      visibility: visOfParse(res),
    };
    if (tray.join(',') !== res.spec.dice.join(',')) {
      tray = [...res.spec.dice];
      renderTray();
    }
  }
  renderCmdState(cmdEl, cmdSlot, res, raw);
  updateTrayButtons();
  resyncTrayPopover(); // an open tray-bound ± popover follows the draft (§7.4)
  return res;
}

// Tray edits regenerate the draft string; mods the new pool can't carry drop.
function syncBoxFromTray() {
  if (!tray.length) {
    cmdInput.value = '';
    paintCmd();
    return;
  }
  let mods = boxExtras.mods ? JSON.parse(JSON.stringify(boxExtras.mods)) : null;
  if (mods) {
    if (mods.adv && !tray.includes('d20')) delete mods.adv;
    if (mods.keep && mods.keep.n >= tray.length) delete mods.keep;
    if (!Object.keys(mods).length) mods = null;
  }
  cmdInput.value = canonicalWithVis({ dice: [...tray], mods }, {
    dc: boxExtras.dc,
    comment: boxExtras.comment,
    exp: boxExtras.exp,
  }, boxExtras.visibility);
  paintCmd();
}

// What a notation string actually rolls: the moment it DECLARES wins, and the
// dc→check dressing (§2.3) only fills the gap when it declares none — there is
// no dc→check implication in the grammar (§7.6).
//
// When the convenience applies, the flag is baked INTO the string that goes up
// so the server derives the same moment we do: a notation carries its own
// dc/faceDown/exp, and an exp field that disagrees with it is refused (one
// shared truth — nobody guesses which side the player meant). A string that
// already declares its moment is sent RAW, untouched, prefixes and all.
function notationIntent(raw, res) {
  const exp = res.exp || (res.dc != null ? { kind: 'check' } : null);
  if (!exp || res.exp) return { exp, notation: raw, canonical: res.canonical };
  const dressed = canonicalWithVis(res.spec, {
    dc: res.dc,
    comment: res.comment,
    exp,
  }, visOfParse(res));
  return { exp, notation: dressed, canonical: dressed };
}

// Execute a notation string (Enter, or the __diceDebug hook). Online the RAW
// string is sent — /gmroll-family prefixes survive to the server, which
// re-parses and is authoritative. Solo runs our own parse.
function commandRoll(input) {
  const raw = (typeof input === 'string' ? input : cmdInput.value).trim();
  const res = parseNotation(raw);
  if (!res.ok) return res;
  const intent = notationIntent(raw, res);
  requestRoll(res.spec.dice, res.comment || res.canonical, {
    notation: intent.notation,
    canonical: intent.canonical,
    mods: res.spec.mods || undefined,
    faceDown: res.faceDown, // 'held' and the /gmroll family both land here
    visibility: visOfParse(res) || undefined, // secret / w: (goal 11)
    dc: res.dc ?? undefined,
    exp: intent.exp || undefined,
  });
  return res;
}

// Offer a notation string to the table (Shift+Enter — §7.4). Same validation
// gates as commandRoll; online only (callers show the solo refusal). Parsed
// in OFFER context: 'blind' is legal here (dice tower → secret), and the box
// paints in roll context so typing it shows the teaching error until the
// player offers instead of rolling — which is the teaching.
function commandOffer(input) {
  const raw = (typeof input === 'string' ? input : cmdInput.value).trim();
  const res = parseNotation(raw, { offer: true });
  if (!res.ok) return res;
  if (!netOnline || !net) return res;
  net.offer({
    label: res.comment || res.canonical,
    notation: notationIntent(raw, res).notation,
  });
  return res;
}

// Solo Shift+Enter: refusal shake + hint in the box's helper slot (§7.4).
function offerNeedsTable(boxEl, slotEl) {
  boxEl.classList.remove('cmd-shake');
  void boxEl.offsetWidth; // restart the animation
  boxEl.classList.add('cmd-shake');
  slotEl.textContent = '';
  const el = document.createElement('span');
  el.className = 'warn';
  el.textContent = 'offers need a table — you are playing solo';
  slotEl.appendChild(el);
}

const cmdHistoryWalk = makeHistoryWalker(cmdInput, paintCmd);

cmdInput.addEventListener('input', () => {
  cmdHistoryWalk.reset(); // typing abandons a history walk
  clearTimeout(cmdTimer);
  cmdTimer = setTimeout(paintCmd, 300);
});
cmdInput.addEventListener('blur', paintCmd);
cmdInput.addEventListener('keydown', (e) => {
  // IME composition: Enter/Esc/arrows steer the candidate list, not us.
  if (e.isComposing) return;
  if (e.key === 'Enter') {
    const res = paintCmd();
    if (res.ok) {
      if (e.shiftKey) {
        // §7.4: Shift+Enter = Offer to table, same validation gates as Enter.
        if (netOnline && net) commandOffer(cmdInput.value);
        else offerNeedsTable(cmdEl, cmdSlot);
      } else {
        commandRoll(cmdInput.value);
      }
    }
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    cmdHistoryWalk.arrow(e);
  }
  e.stopPropagation();
});

cmdHelpBtn.addEventListener('click', () => {
  cmdCheatsheet.classList.toggle('hidden');
  cmdHelpBtn.classList.toggle('on', !cmdCheatsheet.classList.contains('hidden'));
});

renderTray();
paintCmd();

// ---------------------------------------------------------------------------
// Saved groups
// ---------------------------------------------------------------------------

// Groups come from the URL hash when one is present (a bookmarked #g=… link
// restores them anywhere — stateless), otherwise from localStorage, otherwise
// starter defaults. Every change is written back to BOTH localStorage and the
// URL hash, so the address bar is always a saveable snapshot.
//
// A group is {id, name, notation} — notation is the canonical string from
// js/notation.js and is what the Roll button actually parses and rolls. Old
// {id, name, dice:[...]} records (pre-notation localStorage) migrate lazily
// here on load; anything unreadable is dropped rather than guessed at.
function migrateGroup(g, i) {
  if (!g || typeof g !== 'object') return null;
  const name = typeof g.name === 'string' ? cutText(g.name, 24) : '';
  if (typeof g.notation === 'string') {
    const res = parseNotation(g.notation);
    return res.ok ? { id: g.id ?? i + 1, name, notation: res.canonical } : null;
  }
  if (Array.isArray(g.dice) && g.dice.length && g.dice.length <= MAX_DICE_ON_TABLE
      && g.dice.every((t) => DIE_DEFS[t])) {
    return { id: g.id ?? i + 1, name, notation: formula(g.dice) };
  }
  return null;
}

let groups = groupsFromLocation() || load(LS_GROUPS, null);
if (!groups) {
  groups = [
    { id: 1, name: 'Attack', notation: '1d20' },
    { id: 2, name: 'Damage', notation: '3d4' },
    { id: 3, name: 'Percentile', notation: 'd100' },
  ];
}
groups = (Array.isArray(groups) ? groups : []).map(migrateGroup).filter(Boolean);

// Reflect the groups into the address bar, degrading to storage-only if the
// codec refuses them. encodeURIComponent throws URIError on text no URL can
// carry (a lone surrogate), and saveGroups runs at module scope: an unguarded
// throw there killed every declaration below it — no network, no log, no
// popover, no shortcuts — on every load until localStorage was cleared. The
// cuts above make such text unreachable from the UI; this keeps a hostile or
// legacy stored group from ever taking the app down with it again.
function reflectGroupsToUrl() {
  try {
    syncGroupsToLocation(groups);
    return true;
  } catch (e) {
    console.warn('groups could not be encoded into the URL', e);
    return false;
  }
}

function saveGroups() {
  save(LS_GROUPS, groups);
  reflectGroupsToUrl();
}
saveGroups();

const groupsListEl = document.getElementById('groups-list');
const groupsEmptyEl = document.getElementById('groups-empty');

// Load a group's notation into the command box (UX §1.4) — a compose aid;
// changing the record itself is the inline row editor's job (✎).
function loadIntoBox(notation, name) {
  cmdInput.value = notation;
  groupNameInput.value = name || '';
  paintCmd();
  cmdInput.focus();
}

// Write ONE saved group back by id — the inline editor's Update, the ±
// popover's 'Update this pool', and __diceDebug.editPool all land here.
// Never pushes a new record, so renaming can't fork a duplicate and an
// unnamed group updates like any other. The notation must parse (its
// canonical is what lands); the name takes the same 24-char cut as Save.
// Returns the updated JSON-safe record, or false (unknown id / bad patch /
// notation that doesn't parse) with the record untouched.
function editPoolById(id, patch) {
  const g = groups.find((x) => x.id === id);
  if (!g || !patch || typeof patch !== 'object') return false;
  let name = g.name;
  let notation = g.notation;
  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string') return false;
    name = cutText(patch.name, 24);
  }
  if (patch.notation !== undefined) {
    if (typeof patch.notation !== 'string') return false;
    const res = parseNotation(patch.notation);
    if (!res.ok) return false;
    notation = res.canonical;
  }
  g.name = name;
  g.notation = notation;
  saveGroups();
  renderGroups();
  return { id: g.id, name: g.name, notation: g.notation };
}

// Which row is the inline editor right now (null = none). One at a time:
// opening a second editor abandons the first (renderGroups redraws it as a
// normal row — nothing was written).
let editingGroupId = null;

function beginEditGroup(id) {
  // an open ± popover for this group would go stale under the editor
  if (pop && pop.source === 'group' && pop.groupId === id) closePopover();
  editingGroupId = id;
  renderGroups();
  const nameIn = groupsListEl.querySelector('.ge-name');
  if (nameIn) nameIn.focus();
}

function cancelEditGroup() {
  editingGroupId = null;
  renderGroups();
}

// The inline row editor: name + notation fields, Update writes back BY ID
// via editPoolById (the fix for rename-forks-a-duplicate and
// unnamed-can't-update), Cancel/Esc reverts. Enter applies; a notation that
// doesn't parse pins the row open with the parse error and a dead Update.
function buildGroupEditor(g) {
  const ed = document.createElement('div');
  ed.className = 'group-editor';

  const nameIn = document.createElement('input');
  nameIn.className = 'ge-name';
  nameIn.type = 'text';
  nameIn.maxLength = 24;
  nameIn.placeholder = 'Name this pool…';
  nameIn.autocomplete = 'off';
  nameIn.value = g.name;

  const notIn = document.createElement('input');
  notIn.className = 'ge-notation';
  notIn.type = 'text';
  notIn.maxLength = 500;
  notIn.spellcheck = false;
  notIn.autocomplete = 'off';
  notIn.value = g.notation;

  const err = document.createElement('div');
  err.className = 'ge-err';

  const updateBtn = document.createElement('button');
  updateBtn.className = 'btn primary ge-update';
  updateBtn.textContent = 'Update';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn ge-cancel';
  cancelBtn.textContent = 'Cancel';
  const actions = document.createElement('div');
  actions.className = 'ge-actions';
  actions.append(updateBtn, cancelBtn);

  const validate = () => {
    const res = parseNotation(notIn.value);
    notIn.classList.toggle('bad', !res.ok);
    err.textContent = res.ok ? '' : (res.error || 'invalid notation');
    updateBtn.disabled = !res.ok;
    return res.ok;
  };
  validate();
  notIn.addEventListener('input', validate);

  const apply = () => {
    if (!validate()) { notIn.focus(); return; }
    editingGroupId = null;
    editPoolById(g.id, { name: nameIn.value, notation: notIn.value });
  };
  updateBtn.addEventListener('click', apply);
  cancelBtn.addEventListener('click', cancelEditGroup);
  const onKey = (e) => {
    e.stopPropagation(); // same as every popover field: no table shortcuts
    if (e.key === 'Enter') apply();
    else if (e.key === 'Escape') cancelEditGroup();
  };
  nameIn.addEventListener('keydown', onKey);
  notIn.addEventListener('keydown', onKey);

  ed.append(nameIn, notIn, err, actions);
  return ed;
}

// Roll a saved group: parse its notation and roll the parsed spec. Online the
// notation string itself goes up (the server's parse is authoritative).
function rollGroup(g) {
  const res = parseNotation(g.notation);
  if (!res.ok) return;
  closeGroupsFlyout(); // a roll from the flyout clears the runway itself
  const intent = notationIntent(g.notation, res);
  requestRoll(res.spec.dice, g.name || res.comment || res.canonical, {
    notation: intent.notation,
    canonical: intent.canonical,
    mods: res.spec.mods || undefined,
    faceDown: res.faceDown, // saved groups carry 'held' now (§7.6)
    visibility: visOfParse(res) || undefined, // …and secret / w: (goal 11)
    dc: res.dc ?? undefined,
    exp: intent.exp || undefined,
  });
}

function renderGroups() {
  groupsListEl.innerHTML = '';
  groupsEmptyEl.style.display = groups.length ? 'none' : 'block';
  for (const g of groups) {
    const row = document.createElement('div');
    row.className = 'group-row';
    row.dataset.groupId = String(g.id);

    // This row is being edited: the editor replaces the whole affordance set.
    if (g.id === editingGroupId) {
      row.classList.add('editing');
      row.appendChild(buildGroupEditor(g));
      groupsListEl.appendChild(row);
      continue;
    }

    const info = document.createElement('div');
    info.className = 'group-info';
    info.title = 'Load into the command box';
    const nameEl = document.createElement('div');
    nameEl.className = 'group-name' + (g.name ? '' : ' as-notation');
    nameEl.textContent = g.name || g.notation; // unnamed: the notation is the name
    info.appendChild(nameEl);
    if (g.name) {
      const chip = document.createElement('code');
      chip.className = 'group-formula';
      chip.textContent = g.notation;
      chip.title = `${g.notation}  ·  click to load into the command box`;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        loadIntoBox(g.notation, g.name);
      });
      info.appendChild(chip);
    }
    info.addEventListener('click', () => loadIntoBox(g.notation, g.name));

    // The consistent affordance set: Roll · ± · ✎ · ✕.
    const rollBtn = document.createElement('button');
    rollBtn.className = 'group-roll';
    rollBtn.textContent = 'Roll';
    rollBtn.addEventListener('click', () => rollGroup(g));

    const modsBtn = document.createElement('button');
    modsBtn.className = 'group-mods';
    modsBtn.textContent = '±';
    modsBtn.title = 'Modifiers, target, face down';
    modsBtn.addEventListener('click', () => togglePopover(g, row));

    const editBtn = document.createElement('button');
    editBtn.className = 'group-edit';
    editBtn.textContent = '✎';
    editBtn.title = 'Edit name & notation';
    editBtn.addEventListener('click', () => beginEditGroup(g.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'group-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete pool';
    delBtn.addEventListener('click', () => {
      if (pop && pop.source === 'group' && pop.groupId === g.id) closePopover();
      groups = groups.filter((x) => x.id !== g.id);
      saveGroups();
      renderGroups();
    });

    row.append(info, rollBtn, modsBtn, editBtn, delBtn);
    groupsListEl.appendChild(row);
    // renderGroups can run while this group's popover is open (e.g. after a
    // variant save) — re-anchor it to the fresh row.
    if (pop && pop.source === 'group' && pop.groupId === g.id) {
      row.classList.add('open');
      pop.row = row;
    }
  }
}
renderGroups();

saveGroupBtn.addEventListener('click', () => {
  const notation = cmdResult && cmdResult.ok ? cmdResult.canonical
    : tray.length ? formula(tray) : null;
  if (!notation) return;
  const name = cutText(groupNameInput.value, 24); // '' = unnamed group
  const existing = name ? groups.find((g) => g.name === name) : null;
  if (existing) existing.notation = notation;
  else groups.push({ id: Date.now(), name, notation });
  saveGroups();
  renderGroups();
  groupNameInput.value = '';
});

// Copy a bookmarkable URL that carries the current groups in its hash.
document.getElementById('copy-link').addEventListener('click', async (e) => {
  reflectGroupsToUrl(); // a codec refusal must not eat the click
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(window.location.href);
    btn.textContent = 'copied!';
  } catch {
    window.prompt('Copy this link to save your pools:', window.location.href);
    btn.textContent = 'link';
  }
  setTimeout(() => { btn.textContent = 'copy link'; }, 1500);
});

// ---------------------------------------------------------------------------
// ± popover (docs/mockups/panel.html): per-group modifier + attributed parts,
// adv/dis, keep/drop, reroll, explode, face down, dc and comment. Opening it
// parses the group's notation into edit state; every edit re-renders the
// canonical echo and Monte Carlo preview. Roll/Offer act on the edited spec;
// 'Save as variant' appends a new group; 'Update this pool' writes the
// source record back in place by id (editPoolById — the row editor's path).
// ---------------------------------------------------------------------------

const popEl = document.getElementById('mods-popover');
const popNameEl = document.getElementById('pop-name');
const popEchoEl = document.getElementById('pop-echo');
const popMchipsEl = document.getElementById('pop-mchips');
const popModOut = document.getElementById('pop-mod-out');
const popPartsEl = document.getElementById('pop-parts');
const popSegAdv = document.getElementById('pop-seg-adv');
const popAdvSub = document.getElementById('pop-adv-sub');
const popSegKeep = document.getElementById('pop-seg-keep');
const popKeepStep = document.getElementById('pop-keep-step');
const popKeepOut = document.getElementById('pop-keep-out');
const popKeepSub = document.getElementById('pop-keep-sub');
const popRrStep = document.getElementById('pop-rr-step');
const popRrOut = document.getElementById('pop-rr-out');
const popSwReroll = document.getElementById('pop-sw-reroll');
const popSwExplode = document.getElementById('pop-sw-explode');
const popSegVis = document.getElementById('pop-seg-vis');
const popVisAud = document.getElementById('pop-vis-aud');
const popVisSub = document.getElementById('pop-vis-sub');
const popDcInput = document.getElementById('pop-dc');
const popCommentInput = document.getElementById('pop-comment');
const popSegExp = document.getElementById('pop-seg-exp');
const popExpSubtitle = document.getElementById('pop-exp-subtitle');
const popPreviewEl = document.getElementById('pop-preview');
const popRollBtn = document.getElementById('pop-roll');
const popOfferBtn = document.getElementById('pop-offer');
const popUpdateBtn = document.getElementById('pop-update');
const popVariantBtn = document.getElementById('pop-variant');

// ']' would close the label early and '#' starts a comment — both break the
// canonical round-trip, so they can't live inside a part label (rollspec's
// validateMods rejects them too). Zero-width/bidi-control characters are also
// stripped, matching js/notation.js stripCtl. The cut is the parser's own
// (cutText: trim → slice → surrogate guard → trim), so the popover's text is
// byte-identical to what a re-parse of the canonical yields — including at a
// cap that would otherwise saw an astral character in half and strand a lone
// surrogate no URL codec can encode.
const cleanPartLabel = (t) =>
  cutText(t.replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff\]#]/g, ''), 20);
const cleanComment = (t) =>
  cutText(t.replace(/[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ''), 64);

function togglePopover(g, row) {
  if (pop && pop.source === 'group' && pop.groupId === g.id) {
    closePopover();
    return;
  }
  openPopover({ source: 'group', group: g, row });
}

// The edit-state half of `pop`, parsed from a canonical notation string.
// Shared by openPopover and the tray re-sync so the two can never drift.
function popStateFromParse(res) {
  const m = res.spec.mods || {};
  const named = (m.parts || []).filter((p) => p.label);
  return {
    dice: [...res.spec.dice],
    // anonymous remainder + named parts reassemble to mods.modifier/parts
    anon: (m.modifier || 0) - named.reduce((s, p) => s + p.value, 0),
    parts: named.map((p) => ({ ...p })),
    adv: m.adv || null,
    keep: m.keep ? { mode: m.keep.mode, n: m.keep.n } : null,
    reroll: m.reroll ? { below: m.reroll.below } : null,
    explode: !!m.explode,
    // Visibility (goal 11): one of open/held/secret/whisper + audience names.
    vis: visOfParse(res) || { mode: 'open', names: [] },
    dc: res.dc,
    comment: res.comment,
    // Moment (UX §7.6): kind and subtitle live in the notation now, so a saved
    // group or variant round-trips the whole intent instead of dropping it.
    expKind: res.exp ? res.exp.kind : '',
    expSubtitle: (res.exp && res.exp.subtitle) || '',
  };
}

// The tray draft as canonical notation: the command box's parse when valid
// (re-run synchronously by callers via paintCmd — the debounce can be stale),
// otherwise the bare tray dice. Null when there is no draft at all.
function trayDraftNotation() {
  if (cmdResult && cmdResult.ok) return cmdResult.canonical;
  if (tray.length) return formula(tray);
  return null;
}

// Open the ± popover bound to a source (UX §7.4): {source:'group', group, row}
// or {source:'tray', row}. Roll / Offer / Save-as-variant act on the source.
function openPopover(binding) {
  let notation, name, groupId = null;
  if (binding.source === 'group') {
    notation = binding.group.notation;
    name = binding.group.name || binding.group.notation;
    groupId = binding.group.id;
  } else {
    notation = trayDraftNotation();
    name = groupNameInput.value.trim() || 'Tray';
  }
  if (!notation) return;
  const res = parseNotation(notation);
  if (!res.ok) return;
  closePopover();
  pop = {
    source: binding.source,
    groupId,
    name,
    row: binding.row || null,
    ...popStateFromParse(res),
  };
  // dc→check is a UI convenience, never a parse-level implication (§7.6): it
  // only fills a moment the notation left empty, and the segmented control
  // still overrides it back to Plain.
  if (!pop.expKind && pop.dc != null) pop.expKind = 'check';
  if (pop.row) pop.row.classList.add('open');
  popNameEl.textContent = pop.name;
  popDcInput.value = pop.dc == null ? '' : String(pop.dc);
  popCommentInput.value = pop.comment || '';
  popExpSubtitle.value = pop.expSubtitle;
  // 'Update this pool' needs a record to write back to — the tray draft
  // has none, so its popover offers only the additive 'Save as variant'.
  popUpdateBtn.classList.toggle('hidden', pop.source !== 'group');
  popEl.classList.remove('hidden');
  renderPop();
  placePopover();
}

// Tray edits while the tray popover is open re-sync it (§7.4): the draft is
// authoritative and in-popover edits yield to it. Called from paintCmd, which
// every tray/box mutation funnels through.
function resyncTrayPopover() {
  if (!pop || pop.source !== 'tray') return;
  const notation = trayDraftNotation();
  if (!notation) {
    closePopover(); // the draft is gone (tray emptied)
    return;
  }
  const res = parseNotation(notation);
  if (!res.ok) return;
  Object.assign(pop, popStateFromParse(res));
  if (pop.dc != null && !pop.expKind) pop.expKind = 'check';
  pop.name = groupNameInput.value.trim() || 'Tray';
  popNameEl.textContent = pop.name;
  popDcInput.value = pop.dc == null ? '' : String(pop.dc);
  popCommentInput.value = pop.comment || '';
  popExpSubtitle.value = pop.expSubtitle;
  renderPop();
  placePopover();
}

function closePopover() {
  if (!pop) return;
  if (pop.row) pop.row.classList.remove('open');
  pop = null;
  popEl.classList.add('hidden');
}

// Anchor the popover to its source, clamped fully on-screen (§7.4: usable in
// compact view). Beside the left panel column, next to the source row; a row
// inside a COLLAPSED panel has a zero rect, so it counts as no anchor and the
// popover sits beside the tab column instead.
function placePopover() {
  if (!pop) return;
  const w = popEl.offsetWidth;
  const h = popEl.offsetHeight;
  const rect = pop.row ? pop.row.getBoundingClientRect() : null;
  const anchor = rect && (rect.width || rect.height) ? rect : null;
  const panelRect = document.getElementById('left-panel').getBoundingClientRect();
  const left = Math.round(panelRect.right + 10);
  const top = anchor ? Math.round(anchor.top - 46) : 12;
  popEl.style.left = `${Math.max(12, Math.min(left, window.innerWidth - w - 12))}px`;
  popEl.style.top = `${Math.max(12, Math.min(top, window.innerHeight - h - 12))}px`;
}

function popModifier() {
  return pop.anon + pop.parts.reduce((s, p) => s + (p.value | 0), 0);
}

// Assemble the edited state back into a rollspec {dice, mods}. Labeled rows
// become mods.parts (labels cleaned); unlabeled rows and the flat stepper
// merge into one trailing anonymous part, so values always sum to modifier.
function popSpec() {
  const mods = {};
  const modifier = popModifier();
  const named = pop.parts
    .map((p) => ({ label: cleanPartLabel(p.label || ''), value: p.value | 0 }))
    .filter((p) => p.label);
  if (named.length) {
    const anonTotal = modifier - named.reduce((s, p) => s + p.value, 0);
    mods.parts = anonTotal ? [...named, { label: '', value: anonTotal }] : [...named];
    mods.modifier = modifier;
  } else if (modifier) {
    mods.modifier = modifier;
  }
  if (pop.adv) mods.adv = pop.adv;
  if (pop.keep) mods.keep = { mode: pop.keep.mode, n: pop.keep.n };
  if (pop.reroll) mods.reroll = { below: pop.reroll.below, once: true };
  if (pop.explode) mods.explode = true;
  return { dice: [...pop.dice], mods: Object.keys(mods).length ? mods : null };
}

// The edited state as one canonical string — the echo, the Save-as-variant
// notation, and the history entry. Since UX §7.6 the moment ('check'/
// 'cinematic' + '| subtitle') and face-down ('held') ride it too, so a variant
// carries the FULL intent instead of silently dropping privacy and moment.
function popCanonical() {
  return canonicalWithVis(popSpec(), {
    dc: pop.dc,
    comment: pop.comment,
    exp: popExp() || null,
  }, pop.vis.mode === 'open' ? null : pop.vis);
}

// The popover's visibility as requestRoll/offer opts, or undefined for open.
function popVis() {
  if (!pop || pop.vis.mode === 'open') return undefined;
  return { mode: pop.vis.mode, names: [...pop.vis.names] };
}

// A whisper with nobody named is unsendable (the grammar has no empty w:).
function popVisBlocked() {
  return pop.vis.mode === 'whisper' && !pop.vis.names.length;
}

// Sublabels for the visibility picker (UX.md §3.2's terminology note: the
// labels are Open · Face down · Only me · Whisper to…, never "Secret"/
// "Blind"/"GM"/"Private" — each reads as its own opposite somewhere).
const POP_VIS_SUBS = {
  open: '',
  held: 'face down for everyone — hidden until you reveal',
  secret: 'no one else sees that you rolled',
  whisper: 'others see you rolled, not what',
};

function segSet(seg, value) {
  seg.querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.v === value));
  });
}

const fmtSigned = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);

// Rebuild the named-bonus rows. Label inputs update echo/preview only
// (renderPopEcho) so typing never loses focus to a rebuild.
function renderPopParts() {
  popPartsEl.innerHTML = '';
  pop.parts.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'part-row';

    const step = document.createElement('div');
    step.className = 'stepper';
    const dn = document.createElement('button');
    dn.textContent = '−';
    dn.addEventListener('click', () => { p.value = Math.max(-99, (p.value | 0) - 1); renderPop(); });
    const out = document.createElement('output');
    out.textContent = fmtSigned(p.value | 0);
    const up = document.createElement('button');
    up.textContent = '+';
    up.addEventListener('click', () => { p.value = Math.min(99, (p.value | 0) + 1); renderPop(); });
    step.append(dn, out, up);

    const label = document.createElement('input');
    label.className = 'tin';
    label.maxLength = 20;
    label.placeholder = 'label — e.g. Proficiency';
    label.value = p.label || '';
    label.addEventListener('input', () => { p.label = label.value; renderPopEcho(); });
    label.addEventListener('keydown', (e) => e.stopPropagation());

    const del = document.createElement('button');
    del.className = 'part-del';
    del.textContent = '✕';
    del.title = 'Remove this bonus';
    del.addEventListener('click', () => { pop.parts.splice(idx, 1); renderPop(); });

    row.append(step, label, del);
    popPartsEl.appendChild(row);
  });
}

// Echo, preview and action buttons — the cheap half of a re-render.
function renderPopEcho() {
  if (!pop) return;
  const spec = popSpec();
  const err = validateMods(spec.dice, spec.mods);
  const canonical = popCanonical();
  popEchoEl.textContent = canonical;
  popEchoEl.title = `${canonical}  ·  click to edit in the command box`;
  const visBlocked = popVisBlocked();
  const visSuffix = pop.vis.mode === 'open' ? ''
    : pop.vis.mode === 'whisper'
      ? ` · whisper to ${pop.vis.names.join(', ')}`
      : ` · ${pop.vis.mode === 'held' ? 'face down' : 'only me'}`;
  popPreviewEl.textContent = err
    ? `invalid spec: ${err}`
    : visBlocked
      ? 'whisper needs an audience — pick at least one player'
      : fmtPreview(spec.dice, spec.mods).replace(/ (avg|max)/g, ' · $1') + visSuffix;
  popRollBtn.disabled = !!err || visBlocked;
  popOfferBtn.disabled = !!err || visBlocked || !netOnline;
  // An offer's restricted mode has its own name: the dice tower (they roll,
  // only the offerer reads the result) — §3.2's terminology note.
  popOfferBtn.title = !netOnline
    ? 'Offers need a table — you are playing solo'
    : pop.vis.mode === 'secret'
      ? 'Dice tower — they roll, only you see the result'
      : 'Post this roll for anyone at the table to take';
}

// The whisper audience multi-select, built from the live roster (minus you —
// the chooser is always implicitly in the audience). Duplicate names show
// once: the server joins ALL matches to the audience (documented behavior).
// Every chip here round-trips safely through w: notation: a roster name can
// never contain '#' (the comment-split misdirection) because the server bans
// it at join AND rename (server.js cleanName) — no filtering needed here.
function renderPopAudience() {
  popVisAud.innerHTML = '';
  if (!pop || pop.vis.mode !== 'whisper') {
    popVisAud.classList.add('hidden');
    return;
  }
  popVisAud.classList.remove('hidden');
  const you = net ? net.playerId : null;
  const roster = players.filter((p) => p.id !== you && p.name);
  if (!roster.length) {
    const s = document.createElement('span');
    s.className = 'prow-sub';
    s.textContent = 'no one else is at the table yet';
    popVisAud.appendChild(s);
    return;
  }
  // Names picked earlier that have since left the room would be rejected by
  // the server (unknown_audience): drop them when the roster is known.
  pop.vis.names = pop.vis.names.filter((n) => roster.some((p) => p.name === n));
  const seen = new Set();
  for (const p of roster) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    const b = document.createElement('button');
    b.className = 'mchip aud-chip';
    b.textContent = p.name; // user-supplied: textContent only
    b.setAttribute('aria-pressed', String(pop.vis.names.includes(p.name)));
    b.addEventListener('click', () => {
      const i = pop.vis.names.indexOf(p.name);
      if (i >= 0) pop.vis.names.splice(i, 1);
      else pop.vis.names.push(p.name);
      renderPop();
    });
    popVisAud.appendChild(b);
  }
}

function renderPop() {
  if (!pop) return;
  popMchipsEl.querySelectorAll('.mchip').forEach((b) => {
    b.setAttribute('aria-pressed', String(pop.anon !== 0 && Number(b.dataset.v) === pop.anon));
  });
  popModOut.textContent = fmtSigned(pop.anon);
  renderPopParts();

  const hasD20 = pop.dice.includes('d20');
  if (!hasD20) pop.adv = null;
  segSet(popSegAdv, pop.adv || '');
  popSegAdv.querySelectorAll('button').forEach((b) => { if (b.dataset.v) b.disabled = !hasD20; });
  popAdvSub.textContent = hasD20 ? '' : 'advantage needs a d20 in the pool';

  const canKeep = pop.dice.length > 1;
  if (!canKeep) pop.keep = null;
  segSet(popSegKeep, pop.keep ? pop.keep.mode : '');
  popSegKeep.querySelectorAll('button').forEach((b) => { if (b.dataset.v) b.disabled = !canKeep; });
  popKeepOut.textContent = pop.keep ? String(pop.keep.n) : '1';
  popKeepStep.classList.toggle('dim', !pop.keep);
  popKeepSub.textContent = canKeep
    ? 'applies across the whole pool'
    : `keep/drop needs 2 or more dice — this pool has ${pop.dice.length}`;

  popSwReroll.setAttribute('aria-pressed', String(!!pop.reroll));
  popRrOut.textContent = `≤ ${pop.reroll ? pop.reroll.below : 1}`;
  popRrStep.classList.toggle('dim', !pop.reroll);
  popSwExplode.setAttribute('aria-pressed', String(!!pop.explode));

  // Visibility (goal 11): Open / Face-down / Secret / Whisper + audience.
  // Solo has no server to redact for anyone: secret/whisper are disabled and
  // held keeps the local face-down flow (the subtle solo note lives in the
  // sub line).
  segSet(popSegVis, pop.vis.mode === 'open' ? '' : pop.vis.mode);
  popSegVis.querySelectorAll('button').forEach((b) => {
    if (b.dataset.v === 'secret' || b.dataset.v === 'whisper') b.disabled = !netOnline;
  });
  renderPopAudience();
  popVisSub.textContent = !netOnline && pop.vis.mode === 'open'
    ? 'only-me & whisper rolls need a table — you are playing solo'
    : POP_VIS_SUBS[pop.vis.mode] || '';

  // Moment (UX §2.3): Plain/Check/Cinematic + subtitle; title = comment,
  // Target = the DC field above.
  segSet(popSegExp, pop.expKind || '');
  popExpSubtitle.disabled = !pop.expKind;
  document.getElementById('pop-exp-sub-field').classList.toggle('dim', !pop.expKind);
  document.getElementById('pop-exp-sub').textContent = pop.expKind
    ? 'title = comment · target = the DC above'
    : '';

  renderPopEcho();
}

// The Moment attachment for the popover's Roll/Offer actions, or undefined.
function popExp() {
  if (!pop || !pop.expKind) return undefined;
  return sanitizeExp({ kind: pop.expKind, subtitle: pop.expSubtitle }) || undefined;
}

// -- popover static wiring (elements exist once; state lives in `pop`) -------

for (const v of [-3, -2, -1, 1, 2, 3]) {
  const b = document.createElement('button');
  b.className = 'mchip';
  b.dataset.v = String(v);
  b.textContent = (v > 0 ? '+' : '−') + Math.abs(v);
  b.addEventListener('click', () => {
    if (!pop) return;
    pop.anon = pop.anon === v ? 0 : v; // click again to clear
    renderPop();
  });
  popMchipsEl.appendChild(b);
}

document.getElementById('pop-mod-dn').addEventListener('click', () => {
  if (!pop) return;
  pop.anon = Math.max(-99, pop.anon - 1);
  renderPop();
});
document.getElementById('pop-mod-up').addEventListener('click', () => {
  if (!pop) return;
  pop.anon = Math.min(99, pop.anon + 1);
  renderPop();
});

document.getElementById('pop-add-part').addEventListener('click', () => {
  if (!pop || pop.parts.length >= 12) return;
  pop.parts.push({ label: '', value: 1 });
  renderPop();
  const inputs = popPartsEl.querySelectorAll('input');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

popSegAdv.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled || !pop) return;
  pop.adv = b.dataset.v || null;
  renderPop();
});

popSegKeep.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled || !pop) return;
  pop.keep = b.dataset.v ? { mode: b.dataset.v, n: pop.keep ? pop.keep.n : 1 } : null;
  if (pop.keep) pop.keep.n = Math.min(pop.keep.n, Math.max(1, pop.dice.length - 1));
  renderPop();
});
document.getElementById('pop-keep-dn').addEventListener('click', () => {
  if (!pop || !pop.keep) return;
  pop.keep.n = Math.max(1, pop.keep.n - 1);
  renderPop();
});
document.getElementById('pop-keep-up').addEventListener('click', () => {
  if (!pop || !pop.keep) return;
  pop.keep.n = Math.min(Math.max(1, pop.dice.length - 1), pop.keep.n + 1);
  renderPop();
});

popSwReroll.addEventListener('click', () => {
  if (!pop) return;
  pop.reroll = pop.reroll ? null : { below: 1 };
  renderPop();
});
document.getElementById('pop-rr-dn').addEventListener('click', () => {
  if (!pop || !pop.reroll) return;
  pop.reroll.below = Math.max(1, pop.reroll.below - 1);
  renderPop();
});
document.getElementById('pop-rr-up').addEventListener('click', () => {
  if (!pop || !pop.reroll) return;
  pop.reroll.below = Math.min(9, pop.reroll.below + 1);
  renderPop();
});

popSwExplode.addEventListener('click', () => {
  if (!pop) return;
  pop.explode = !pop.explode;
  renderPop();
});
popSegVis.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled || !pop) return;
  pop.vis.mode = b.dataset.v || 'open';
  if (pop.vis.mode !== 'whisper') pop.vis.names = [];
  renderPop();
  placePopover(); // the audience list changes the popover's height
});

popSegExp.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !pop) return;
  pop.expKind = b.dataset.v || '';
  renderPop();
});
popExpSubtitle.addEventListener('input', () => {
  if (!pop) return;
  pop.expSubtitle = popExpSubtitle.value;
  renderPopEcho(); // the subtitle rides the canonical now (§7.6)
});
popExpSubtitle.addEventListener('keydown', (e) => e.stopPropagation());

popDcInput.addEventListener('input', () => {
  if (!pop) return;
  const digits = popDcInput.value.replace(/[^0-9]/g, '').slice(0, 3);
  if (digits !== popDcInput.value) popDcInput.value = digits;
  const n = digits === '' ? NaN : parseInt(digits, 10);
  pop.dc = Number.isInteger(n) && n >= 1 && n <= 999 ? n : null;
  renderPopEcho();
});
popDcInput.addEventListener('keydown', (e) => e.stopPropagation());
popCommentInput.addEventListener('input', () => {
  if (!pop) return;
  pop.comment = cleanComment(popCommentInput.value) || null;
  renderPopEcho();
});
popCommentInput.addEventListener('keydown', (e) => e.stopPropagation());

popEchoEl.addEventListener('click', () => {
  if (!pop) return;
  const group = pop.source === 'group' ? groups.find((g) => g.id === pop.groupId) : null;
  const name = group ? group.name : groupNameInput.value.trim();
  const canonical = popCanonical();
  closePopover();
  loadIntoBox(canonical, name);
});

document.getElementById('pop-close').addEventListener('click', closePopover);
// Esc closes the popover only when it is the topmost layer — handled by the
// central Esc layering in the keyboard-shortcuts section below.
window.addEventListener('resize', placePopover);

popRollBtn.addEventListener('click', () => {
  if (!pop) return;
  const spec = popSpec();
  if (validateMods(spec.dice, spec.mods)) return;
  if (popVisBlocked()) return;
  requestRoll(spec.dice, pop.comment || pop.name, {
    mods: spec.mods || undefined,
    faceDown: pop.vis.mode === 'held',
    visibility: popVis(), // secret/whisper ride the canonical (requestRoll)
    dc: pop.dc ?? undefined,
    exp: popExp(),
    canonical: popCanonical(),
  });
  closePopover();
});

popOfferBtn.addEventListener('click', () => {
  if (!pop || !netOnline || !net) return;
  const spec = popSpec();
  if (validateMods(spec.dice, spec.mods)) return;
  if (popVisBlocked()) return;
  const vis = popVis();
  if (vis && vis.mode !== 'held') {
    // secret/whisper have no explicit wire field: the offer rides the
    // canonical string and the server re-parses it (label rides beside it).
    net.offer({ label: pop.comment || pop.name, notation: popCanonical() });
  } else {
    net.offer({
      label: pop.comment || pop.name,
      dice: spec.dice,
      mods: spec.mods || undefined,
      faceDown: !!vis, // held keeps today's explicit-shape field
      dc: pop.dc ?? undefined,
      exp: popExp(),
    });
  }
  closePopover();
});

// 'Update this pool' (saved-group source only): the edited canonical writes
// back to the SAME record by id — editPoolById, the row editor's path. The
// name stays; 'Save as variant' below is the additive twin.
popUpdateBtn.addEventListener('click', () => {
  if (!pop || pop.source !== 'group') return;
  const spec = popSpec();
  if (validateMods(spec.dice, spec.mods)) return;
  const canonical = popCanonical();
  const id = pop.groupId;
  closePopover();
  editPoolById(id, { notation: canonical });
});

popVariantBtn.addEventListener('click', () => {
  if (!pop) return;
  const spec = popSpec();
  if (validateMods(spec.dice, spec.mods)) return;
  const canonical = popCanonical();
  let name;
  if (pop.source === 'group') {
    const base = groups.find((g) => g.id === pop.groupId);
    const summary = modsSummary(spec.mods) || (pop.dc ? `dc${pop.dc}` : 'variant');
    name = cutText(`${(base && base.name) || pop.name} ${summary}`, 24);
  } else {
    // Save-as-variant from the tray saves a NEW group (§7.4). A typed group
    // name is used as-is; otherwise the group is unnamed (its notation labels
    // it, exactly like the panel's own Save with an empty name).
    name = cutText(groupNameInput.value, 24);
  }
  closePopover();
  groups.push({ id: Date.now(), name, notation: canonical });
  saveGroups();
  renderGroups();
});

// ---------------------------------------------------------------------------
// Roll log
// ---------------------------------------------------------------------------

let log = load(LS_LOG, []);
const logList = document.getElementById('log-list');
const logEmpty = document.getElementById('log-empty');

function fmtTime(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// For the few user-supplied strings that go through innerHTML (part labels).
function escapeHtml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderLog() {
  logList.innerHTML = '';
  logEmpty.style.display = log.length ? 'none' : 'block';
  for (const entry of [...log].reverse()) {
    const hidden = entryHidden(entry);
    const el = document.createElement('div');
    el.className = 'log-entry';
    const modParts = modPartsOf(entry);
    let modHtml = '';
    if (modParts) {
      // §7.2 attributed modifiers: "+2 Proficiency +1 Guidance"
      modHtml = modParts
        .map((p) => ` <span class="log-mod">${p.value >= 0 ? '+' : '−'}${Math.abs(p.value)}${p.label ? ` <span class="log-part-label">${escapeHtml(p.label)}</span>` : ''}</span>`)
        .join('');
    } else if (entry.modifier) {
      modHtml = ` <span class="log-mod">${entry.modifier > 0 ? '+' : '−'}${Math.abs(entry.modifier)}</span>`;
    }
    const detail = hidden
      ? `<span class="log-hidden">${entry.visMode === 'whisper' ? 'whispered' : 'face down'}</span>`
      : entry.parts
          .map((p) => {
            let cls = p.isMax && p.counts ? 'crit-max' : p.isMin && p.counts ? 'crit-min' : '';
            if (!p.counts) cls += ' log-discarded';
            const star = p.child ? '✴' : '';
            return `<span class="${cls.trim()}">${star}${p.type}&thinsp;${p.label}</span>`;
          })
          .join(' + ') + modHtml;
    // interim dc verdict (fixed decision): "vs N ✓/✗". Stakes stay public on
    // a hidden roll (goal 11): the target shows, the ✓/✗ waits for the reveal.
    const verdictHtml = !Number.isInteger(entry.dc)
      ? ''
      : hidden
        ? `<span class="log-verdict">vs ${entry.dc}</span>`
        : `<span class="log-verdict ${entry.total >= entry.dc ? 'ok' : 'bad'}">vs ${entry.dc} ${entry.total >= entry.dc ? '✓' : '✗'}</span>`;
    const meaning = entryMeaning(entry); // active-system lens; null while hidden
    const meaningHtml = meaning
      ? `<span class="log-meaning tier-${meaning.tier}"></span>`
      : '';
    el.innerHTML = `
      <div class="log-head">
        <span class="log-group"></span>
        <span class="log-actions"></span>
        <span class="log-total">${hidden ? '?' : entry.total}</span>
      </div>
      <div class="log-detail">${detail}${verdictHtml ? '  ·  ' + verdictHtml : ''}${meaningHtml ? '  ·  ' + meaningHtml : ''}</div>
      <div class="log-time">${fmtTime(entry.t)}</div>`;
    if (meaningHtml) el.querySelector('.log-meaning').textContent = meaning.word;
    // Names and labels are user-supplied: textContent only, never innerHTML.
    const groupEl = el.querySelector('.log-group');
    if (entry.playerName) {
      const who = document.createElement('span');
      who.className = 'log-player';
      if (entry.color) who.style.color = entry.color;
      who.textContent = entry.playerName;
      groupEl.append(who, ` · ${entry.label}`);
    } else {
      groupEl.textContent = entry.label;
    }
    if (canReroll(entry)) {
      const again = document.createElement('button');
      again.className = 'log-again';
      again.textContent = '⟳';
      again.title = 'Roll this again';
      again.addEventListener('click', () =>
        requestRoll([...entry.spec.dice], entry.label, {
          mods: entry.spec.mods || undefined,
          faceDown: entry.faceDown,
          visibility: entryVis(entry) || undefined, // …and the privacy
          dc: Number.isInteger(entry.dc) ? entry.dc : undefined,
          exp: entry.spec.exp || undefined, // reroll-last preserves the moment
        })
      );
      el.querySelector('.log-actions').appendChild(again);
    }
    logList.appendChild(el);
  }
}
renderLog();

function addLogEntry(entry) {
  // Dedupe by server rollId: a reconnect 'hello' can rebuild the log with a
  // roll whose playback is still running; its completion must not append the
  // same roll twice. (Solo entries have no rollId and are never deduped.)
  if (entry.rollId && log.some((e) => e.rollId === entry.rollId)) return;
  log.push(entry);
  if (log.length > LOG_CAP) log = log.slice(-LOG_CAP);
  if (!netOnline) save(LS_LOG, log); // online mode: the server owns the log
  renderLog();
}

document.getElementById('clear-log').addEventListener('click', () => {
  log = [];
  if (!netOnline) save(LS_LOG, log);
  renderLog();
});

// ---------------------------------------------------------------------------
// Rail + corner controls
// ---------------------------------------------------------------------------

document.getElementById('corner-clear').addEventListener('click', () => requestClear());

const soundBtn = document.getElementById('toggle-sound');
// One setter for both mirrors of the sound preference (top-bar 🔊 and the
// settings-modal switch); persists 'dice.sound.v1'.
function setSound(on, persist = true) {
  soundOn = !!on;
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
  if (persist) save(LS_SOUND, soundOn);
  syncSettingsUI();
}
soundBtn.addEventListener('click', () => setSound(!soundOn));
setSound(soundOn, false); // reflect the loaded preference without re-saving

// One setter for the per-die value chips preference ('Show numbers on dice',
// settings "Just you"); persists 'dice.chips.v1'. OFF by default (P1 quiet by
// default). Flipping ON paints chips for the roll still on the felt; flipping
// OFF clears the layer on the spot — renderChips gates every other path.
function setChips(on, persist = true) {
  chipsOn = !!on;
  if (persist) save(LS_CHIPS, chipsOn);
  if (chipsOn) {
    const dice = currentRoll && lastEntry && currentRoll.rollId === lastEntry.rollId
      ? currentRoll.dice : null;
    if (lastEntry && dice) renderChips(lastEntry, dice);
  } else {
    chips.length = 0;
    chipsLayer.innerHTML = '';
  }
  syncSettingsUI();
}

// ---------------------------------------------------------------------------
// Settings (roadmap §2): gear → modal with two scopes. "Just you" — sound and
// the value-chip preference, both local. "Everyone at the table" — the felt
// theme, which is room state: online a swatch click POSTs a settings patch and
// the UI applies only on the 'settings-changed' echo (no optimistic
// double-apply); solo applies immediately and persists LS_ROOMSETTINGS.
// ---------------------------------------------------------------------------

// Current merged room settings. Key-by-key application below is deliberate:
// the next slice adds keys (experiences) without reshaping this.
let roomSettings = { felt: DEFAULT_FELT, system: DEFAULT_SYSTEM };

// A system change is a lens swap over every surface already on screen: the
// log, the banner, and a verdict card still standing all re-read under the new
// profile. Fanfare and ceremonies that already played are never replayed
// (fx=false, 'relit'), a dismissed banner stays dismissed, and a mid-flight
// ceremony keeps its stage — its own verdict staging reads the new lens when
// it gets there.
function rerenderInterpretation() {
  renderLog();
  renderShelfMarkers(); // the shelf markers' meaning words re-read the lens
  // The verdict card holds §2.5's hero slot for an entry the log also shows;
  // letting it age out under the old system would leave the two contradicting
  // each other for the card's whole dismiss window. Repaint it — crit frame
  // included, since that is styling, not fanfare — and mark the layer 'relit'
  // so the frame's one-shot gold sweep stays with the moment that planted it.
  if (stagedVerdict) {
    ceremonyLayer.classList.add('relit');
    ceremonyLayer.classList.toggle('crit', !!entryCrit(stagedVerdict.entry));
    renderVerdictCard(stagedVerdict.roll, stagedVerdict.entry);
  }
  if (lastEntry && !banner.classList.contains('hidden')) {
    const ceremonyActive = currentRoll && currentRoll.ceremony && !currentRoll.done;
    if (!ceremonyActive) {
      const dice = currentRoll && currentRoll.rollId === lastEntry.rollId ? currentRoll.dice : null;
      renderRollResults(lastEntry, dice, false);
    }
  }
}

// Apply a full merged settings object (join response, hello, settings-changed
// echo, or the solo localStorage copy). Unknown keys/values are ignored.
function applyRoomSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (typeof settings.felt === 'string' && FELT_THEMES[settings.felt]) {
    roomSettings.felt = settings.felt;
    if (settings.felt !== currentFeltId) applyFeltTheme(settings.felt);
    else renderFeltSwatches();
  }
  if (typeof settings.system === 'string' && SYSTEMS[settings.system]) {
    roomSettings.system = settings.system;
    if (settings.system !== currentSystemId) {
      currentSystemId = settings.system;
      rerenderInterpretation();
    }
    renderSystemPicker();
  }
}

// Build the five felt swatch chips once, then only refresh the selected state.
// Elements are resolved by id on every call: setSound() runs during module
// evaluation before this section's consts would exist.
function renderFeltSwatches() {
  const holder = document.getElementById('felt-swatches');
  if (!holder.childElementCount) {
    for (const [id, theme] of Object.entries(FELT_THEMES)) {
      const chip = document.createElement('button');
      chip.className = 'felt-swatch';
      chip.dataset.felt = id;
      chip.style.setProperty('--felt-color', theme.feltBase);
      const dot = document.createElement('span');
      dot.className = 'swatch-dot';
      const nm = document.createElement('span');
      nm.textContent = theme.name;
      chip.append(dot, nm);
      chip.title = `${theme.name} felt — everyone at the table sees this`;
      chip.addEventListener('click', () => selectFelt(id));
      holder.appendChild(chip);
    }
  }
  holder.querySelectorAll('.felt-swatch').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.felt === currentFeltId));
  });
}

// Build the three system chips once, then only refresh the selected state.
// Same lazy-element pattern as renderFeltSwatches (module-eval ordering).
function renderSystemPicker() {
  const holder = document.getElementById('system-picker');
  if (!holder.childElementCount) {
    for (const sys of Object.values(SYSTEMS)) {
      const chip = document.createElement('button');
      chip.className = 'system-chip';
      chip.dataset.system = sys.id;
      chip.textContent = sys.label;
      chip.title = `${sys.label} — everyone at the table reads rolls this way`;
      chip.addEventListener('click', () => selectSystem(sys.id));
      holder.appendChild(chip);
    }
  }
  holder.querySelectorAll('.system-chip').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.system === currentSystemId));
  });
}

// Chip click (and __diceDebug.setSystem). Online: send the patch, apply on
// the 'settings-changed' echo like felt. Solo: apply the lens now and persist.
function selectSystem(id) {
  if (!SYSTEMS[id]) return false;
  if (id === currentSystemId) return true; // already the table's system
  if (netOnline && net) {
    net.setSettings({ system: id }).then((ok) => {
      if (!ok) showSettingsNote('couldn’t reach the table — system unchanged');
    });
    return true;
  }
  roomSettings.system = id;
  save(LS_ROOMSETTINGS, roomSettings);
  currentSystemId = id;
  rerenderInterpretation();
  renderSystemPicker();
  return true;
}

// Swatch click (and __diceDebug.setFelt). Online: send the patch, wait for
// the echo. Solo: apply now and persist so the table looks the same tomorrow.
function selectFelt(id) {
  if (!FELT_THEMES[id]) return false;
  if (id === currentFeltId) return true; // already the table's felt: nothing to do
  if (netOnline && net) {
    // No optimistic apply — but a failed POST (server down, mid-reconnect)
    // must not fail silently: reuse the settings note for feedback.
    net.setSettings({ felt: id }).then((ok) => {
      if (!ok) showSettingsNote('couldn’t reach the table — felt unchanged');
    });
    return true;
  }
  roomSettings.felt = id;
  save(LS_ROOMSETTINGS, roomSettings);
  applyFeltTheme(id);
  return true;
}

const settingsModal = document.getElementById('settings-modal');
// Separate timers per surface: a modal note must never cancel the pill's
// pending clear (that would strand a stale note on the pill), and vice versa.
let settingsNoteTimer = null; // in-modal note line
let settingsPillTimer = null; // status-pill note

// Subtle note when ANOTHER player changes a table setting: a transient line
// in the modal if it is open, otherwise the existing status pill. No new
// notification framework.
function showSettingsNote(text) {
  const noteEl = document.getElementById('settings-note');
  if (!settingsModal.classList.contains('hidden')) {
    clearTimeout(settingsNoteTimer);
    noteEl.textContent = text;
    settingsNoteTimer = setTimeout(() => { noteEl.textContent = ''; }, 3000);
  } else {
    clearTimeout(settingsPillTimer);
    setPill(text, '');
    settingsPillTimer = setTimeout(() => {
      // Only clear our own note — a status change may have taken the pill.
      if (statusPill.textContent === text) setPill(null);
    }, 3000);
  }
}

function syncSettingsUI() {
  document.getElementById('set-sound').setAttribute('aria-pressed', String(soundOn));
  document.getElementById('set-chips').setAttribute('aria-pressed', String(chipsOn));
  renderSystemPicker();
  renderFeltSwatches();
}

function openSettingsModal() {
  syncSettingsUI();
  settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden');
  document.getElementById('settings-note').textContent = '';
}

document.getElementById('toggle-settings').addEventListener('click', openSettingsModal);
document.getElementById('settings-close').addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettingsModal(); // backdrop click
});
// Esc closes the modal only when it is the topmost layer — see the central
// Esc layering in the keyboard-shortcuts section below.
document.getElementById('set-sound').addEventListener('click', () => setSound(!soundOn));
document.getElementById('set-chips').addEventListener('click', () => setChips(!chipsOn));

// ---------------------------------------------------------------------------
// Collapsible chrome panels: three regions — Compose (builder + command box),
// Saved pools, Roll log — each independently collapsible from its own
// header (plus keys b/g/l), with per-user state in 'dice.panels.v1'. (The
// roster is rail furniture, not a region — there is no Players panel.)
// Collapsed, a panel rests as a small labelled edge tab. Compact view is no
// longer a mode: body.mini is the EMERGENT all-collapsed state (it scales
// the ambient chrome and reframes the camera; it hides nothing — the rail
// and the tabs stay, and ceremonies render identically).
// ---------------------------------------------------------------------------

const LS_PANELS = 'dice.panels.v1';
const LS_MINI = 'dice.mini.v1'; // legacy compact-view preference — migration only

const PANEL_DEFS = {
  compose: { el: 'builder-panel', head: 'head-compose' },
  groups: { el: 'groups-panel', head: 'head-groups' },
  log: { el: 'log-panel', head: 'head-log' },
};

// Open/collapsed per region. Seeded once, exactly like the old mini seed: a
// stored state wins; else the legacy mini preference (true = all collapsed)
// or a small viewport starts everything collapsed.
let panelsOpen = (() => {
  const stored = load(LS_PANELS, null);
  const st = {};
  if (stored && typeof stored === 'object') {
    for (const k of Object.keys(PANEL_DEFS)) st[k] = stored[k] !== false;
    return st;
  }
  const legacyMini = load(LS_MINI, null);
  const smallViewport = window.innerWidth < 640 || window.innerHeight < 480;
  const open = !(legacyMini ?? smallViewport);
  for (const k of Object.keys(PANEL_DEFS)) st[k] = open;
  return st;
})();

// Every region always exists now that the roster lives in the rail (the
// retired Players panel was the one online-only region).
function panelAvailable(id) {
  return id in PANEL_DEFS;
}

function allPanelsCollapsed() {
  return Object.keys(PANEL_DEFS).every((k) => !panelsOpen[k]);
}

// JSON-safe projection for __diceDebug.panelState.
function panelDebugState() {
  return { ...panelsOpen, allCollapsed: allPanelsCollapsed() };
}

// Framing: the eye sits where the view reads best on a wide window, then pulls
// STRAIGHT BACK along its own ray until the whole table fits — the far felt
// corners, the five shelf trays, and the marker pill each slot's roll hangs
// above (§7.7 parity: the shelf is furniture, and furniture you cannot see is
// a roll nobody can read or tidy away).
//
// Without the fit the eye was fixed and the outer trays simply left the screen
// below ~1.3 aspect: a 4:3 desktop clipped slots 0 and 4, and an iPad portrait
// — too big to auto-engage compact view — put two of the five markers, ✕ and
// all, outside the viewport entirely.
const CAM_EYE = { full: [0, 27, 15.5], mini: [0, 22, 12.5] };
const CAM_TARGET = new THREE.Vector3(0, 0, 0.5);

// What must stay on screen, each with the NDC headroom its own chrome needs.
// A marker is a DOM pill centered on its anchor, so it needs half its width
// (~90 px, ~55 in compact, and it is the widest thing the shelf projects) of
// clearance — capped at a tenth of the window, because on a phone five pills
// cannot all fit side by side at any distance and the anchor being reachable
// is what actually matters.
function framingPoints() {
  const outerX = shelfSlotX(SHELF_SLOTS - 1) + SHELF_SLOT_W / 2;
  const markerX = shelfSlotX(SHELF_SLOTS - 1);
  const w = Math.max(window.innerWidth, 1);
  const halfPill = Math.min(document.body.classList.contains('mini') ? 55 : 90, w / 10);
  const pillNdc = (2 * halfPill) / w;
  const pts = [];
  for (const s of [-1, 1]) {
    pts.push({ p: new THREE.Vector3(s * outerX, 0, SHELF_Z - SHELF_SLOT_D / 2), mx: 0.02, my: 0.02 });
    pts.push({ p: new THREE.Vector3(s * outerX, 0, SHELF_Z + SHELF_SLOT_D / 2), mx: 0.02, my: 0.02 });
    pts.push({ p: new THREE.Vector3(s * markerX, SHELF_MARKER_Y, SHELF_Z), mx: pillNdc, my: 0.06 });
    pts.push({ p: new THREE.Vector3(s * TABLE_W / 2, 0, -TABLE_D / 2), mx: 0.02, my: 0.02 });
  }
  return pts;
}

function applyCameraFraming() {
  const eye = new THREE.Vector3(
    ...(document.body.classList.contains('mini') ? CAM_EYE.mini : CAM_EYE.full)
  );
  const ray = eye.clone().sub(CAM_TARGET);
  const pts = framingPoints();
  const v = new THREE.Vector3();
  // Pull back in small steps and stop at the first distance that fits — a
  // closed form would have to invert the projection for eight points at once,
  // and this runs only on resize and on the compact-view toggle. The range
  // reaches ~3.7×, which covers a phone held upright; past that the eye stays
  // where the last step left it rather than retreating without end.
  for (let i = 0; i < 90; i++) {
    camera.position.copy(CAM_TARGET).addScaledVector(ray, 1 + i * 0.03);
    camera.lookAt(CAM_TARGET);
    camera.updateMatrixWorld(true);
    const fits = pts.every(({ p, mx, my }) => {
      v.copy(p).project(camera);
      return Math.abs(v.x) <= 1 - mx && Math.abs(v.y) <= 1 - my;
    });
    if (fits) break;
  }
}

// Reflect panelsOpen into the DOM, persist it, and derive compact view:
// body.mini appears exactly when every available panel is collapsed. The
// compact side effects (camera reframe, chip/marker/peek re-positioning) run
// only when that derived state actually flips.
function applyPanels(persist = true) {
  for (const [id, def] of Object.entries(PANEL_DEFS)) {
    document.getElementById(def.el).classList.toggle('collapsed', !panelsOpen[id]);
  }
  if (panelsOpen.groups) closeGroupsFlyout(); // a real expand retires the overlay
  if (persist) save(LS_PANELS, panelsOpen);
  const mini = allPanelsCollapsed();
  const railBtn = document.getElementById('rail-collapse');
  railBtn.textContent = mini ? '⤢' : '⤡';
  railBtn.title = mini ? 'Expand panels (m)' : 'Collapse panels (m)';
  if (mini !== document.body.classList.contains('mini')) {
    document.body.classList.toggle('mini', mini);
    applyCameraFraming();
    positionChips();
    measurePeek(); // compact view resizes the card (smaller type, tighter padding)
    positionShelfMarkers(); // markers track the reframed camera (§7.7 parity)
    // An on-stage ceremony needs nothing: it keeps playing, re-scaled (§7.4).
  }
}

function setPanel(id, open, persist = true) {
  if (!(id in PANEL_DEFS)) return false;
  panelsOpen[id] = !!open;
  applyPanels(persist);
  return panelsOpen[id];
}

// The rail's ⤡ / key 'm' (old compact-view muscle memory): everything
// collapsed reopens everything; anything open collapses everything.
function toggleAllPanels() {
  const open = allPanelsCollapsed();
  for (const k of Object.keys(PANEL_DEFS)) panelsOpen[k] = open;
  applyPanels();
}

for (const [id, def] of Object.entries(PANEL_DEFS)) {
  document.getElementById(def.head).addEventListener('click', (e) => {
    // Header tool buttons (copy link, clear) act without toggling the panel.
    if (e.target.closest('.btn')) return;
    setPanel(id, !panelsOpen[id]);
  });
}
document.getElementById('rail-collapse').addEventListener('click', toggleAllPanels);

// ---- saved-pools flyout ----------------------------------------------------
// Rolling a saved pool used to demand expanding the panel — which then sat
// over the table exactly when the dice landed. Hovering the COLLAPSED tab
// (mouse only) flies the list out as a temporary overlay instead: roll from
// a row and it retracts on its own (pointer-leave, the roll itself, or the
// panel expanding for real). Clicking the tab still expands the panel; touch
// keeps that path — no hover, no flyout. The close is timer-graced like the
// peek: the 6px visual gap between tab and list must be crossable.
const groupsPanelEl = document.getElementById('groups-panel');
let groupsFlyTimer = null;
function openGroupsFlyout() {
  clearTimeout(groupsFlyTimer);
  groupsFlyTimer = null;
  if (!panelsOpen.groups) groupsPanelEl.classList.add('flyout');
}
function closeGroupsFlyout() {
  clearTimeout(groupsFlyTimer);
  groupsFlyTimer = null;
  groupsPanelEl.classList.remove('flyout');
}
groupsPanelEl.addEventListener('pointerenter', (e) => {
  if (e.pointerType === 'mouse') openGroupsFlyout();
});
groupsPanelEl.addEventListener('pointerleave', (e) => {
  if (e.pointerType !== 'mouse') return;
  clearTimeout(groupsFlyTimer);
  groupsFlyTimer = setTimeout(closeGroupsFlyout, 200);
});

applyPanels(false); // reflect the seeded state without re-saving
applyCameraFraming(); // boot framing at the current aspect (resize keeps it)

// ---------------------------------------------------------------------------
// Quick palette: a transient centered command strip ('/' / Ctrl/Cmd+K / the
// ❯ corner button). Same validation machinery, roll path, and history store
// as the panel command box (shared helpers above) — the panel box's draft is
// never disturbed. Enter valid: roll + close; invalid: refusal shake, stays;
// incomplete: nothing. Esc / backdrop click dismiss. Works with all panels
// collapsed (the compact view — mini mode itself is retired, UX.md §7.9).
// ---------------------------------------------------------------------------

const paletteBackdrop = document.getElementById('palette-backdrop');
const paletteEl = document.getElementById('palette');
const paletteInput = document.getElementById('palette-input');
const paletteSlot = document.getElementById('palette-slot');
let paletteTimer = null;

function paintPalette() {
  clearTimeout(paletteTimer);
  const raw = paletteInput.value;
  const res = parseNotation(raw);
  renderCmdState(paletteEl, paletteSlot, res, raw);
  return res;
}

const paletteHistoryWalk = makeHistoryWalker(paletteInput, paintPalette);

function isPaletteOpen() {
  return !paletteBackdrop.classList.contains('hidden');
}

// Always opens EMPTY (the triggering '/' is swallowed, never inserted); a
// leading '/gmroll…' typed inside works as normal notation.
function openPalette() {
  // The palette always opens as the topmost layer: close the keyboard
  // cheatsheet first (reachable via __diceDebug.openPalette / future paths)
  // so the Esc peel order 'cheatsheet > palette' can never invert.
  closeKbd();
  paletteBackdrop.classList.remove('hidden');
  paletteInput.value = '';
  paletteHistoryWalk.reset();
  paintPalette();
  paletteInput.focus();
}

function closePalette() {
  if (!isPaletteOpen()) return;
  clearTimeout(paletteTimer);
  paletteEl.classList.remove('palette-shake', 'cmd-shake');
  paletteBackdrop.classList.add('hidden');
  paletteInput.value = '';
  paletteInput.blur();
}

function shakePalette() {
  paletteEl.classList.remove('palette-shake');
  void paletteEl.offsetWidth; // restart the animation
  paletteEl.classList.add('palette-shake');
}

paletteInput.addEventListener('input', () => {
  paletteHistoryWalk.reset(); // typing abandons a history walk
  clearTimeout(paletteTimer);
  paletteTimer = setTimeout(paintPalette, 300);
});
paletteInput.addEventListener('keydown', (e) => {
  // IME composition: Enter commits a candidate and Esc dismisses the
  // candidate list — neither may roll, shake, walk history, or close.
  if (e.isComposing) return;
  // Ctrl/Cmd+K toggle muscle memory: the global handler never sees this
  // (typing guard), so intercept here or the browser focuses its omnibox.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    e.stopPropagation();
    closePalette();
    return;
  }
  if (e.key === 'Enter') {
    const res = paintPalette();
    if (res.ok) {
      if (e.shiftKey) {
        // §7.4: Shift+Enter = Offer to table (same gates as Enter).
        if (netOnline && net) {
          commandOffer(paletteInput.value);
          closePalette();
        } else {
          offerNeedsTable(paletteEl, paletteSlot); // solo: shake, stays open
        }
      } else {
        commandRoll(paletteInput.value); // the normal requestRoll path
        closePalette();
      }
    } else if (res.state === 'invalid') {
      shakePalette(); // stays open
    } // incomplete: nothing
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    paletteHistoryWalk.arrow(e);
  } else if (e.key === 'Escape') {
    closePalette();
  }
  e.stopPropagation();
});
paletteBackdrop.addEventListener('click', (e) => {
  if (e.target === paletteBackdrop) closePalette();
});

document.getElementById('rail-palette').addEventListener('click', () => {
  if (isPaletteOpen()) closePalette();
  else openPalette();
});

// ---------------------------------------------------------------------------
// Keyboard cheatsheet overlay ('?') + global table shortcuts.
// ---------------------------------------------------------------------------

const kbdOverlay = document.getElementById('kbd-overlay');

function isKbdOpen() { return !kbdOverlay.classList.contains('hidden'); }
function toggleKbd() { kbdOverlay.classList.toggle('hidden'); }
function closeKbd() { kbdOverlay.classList.add('hidden'); }

kbdOverlay.addEventListener('click', (e) => {
  if (e.target === kbdOverlay) closeKbd();
});

// Reroll the last roll — the same spec the banner ⟳ / verdict button use.
function rerollLast() {
  const entry = lastEntry;
  if (!canReroll(entry)) return;
  requestRoll([...entry.spec.dice], entry.label, {
    mods: entry.spec.mods || undefined,
    faceDown: entry.faceDown,
    visibility: entryVis(entry) || undefined, // …and the privacy
    dc: Number.isInteger(entry.dc) ? entry.dc : undefined,
    exp: entry.spec.exp || undefined, // reroll-last preserves the moment
  });
}

// Single global keydown handler. Layer guards are checked BEFORE any handler
// mutates state, so one Esc can never fall through two layers:
//   Esc peels the topmost layer only — cheatsheet > palette > settings modal
//   > peek card > ± popover (extends the earlier popover/modal layering fix;
//   the peek slots in above the popover per §7.7.1).
// Table shortcuts fire only with no text input focused and no layer open
// (the ± popover counts as open UI). Space keeps its skip-ceremony handler.
document.addEventListener('keydown', (e) => {
  // Held keys auto-repeat: without this guard a held 'r'/digit floods rolls,
  // held 'm' thrashes the panels, and held '/' opens the palette then types
  // literal '/' into it. No shortcut here has a hold-to-repeat use.
  if (e.repeat) return;
  const t = e.target;
  const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
    || (t instanceof HTMLElement && t.isContentEditable);

  if (e.key === 'Escape') {
    if (typing) return; // focused inputs own Esc (palette input closes itself)
    if (isKbdOpen()) closeKbd();
    else if (isPaletteOpen()) closePalette();
    else if (!settingsModal.classList.contains('hidden')) closeSettingsModal();
    else if (isIdentityMenuOpen()) closeIdentityMenu();
    else if (isPeekOpen()) closePeek();
    else if (pop) closePopover();
    return;
  }
  if (typing) return;

  const modalOpen = !settingsModal.classList.contains('hidden')
    || !document.getElementById('name-modal').classList.contains('hidden');

  // Ctrl/Cmd+K — the one allowed modifier shortcut (browser-conflict safe).
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    if (isKbdOpen() || modalOpen || pop) return;
    e.preventDefault();
    if (!isPaletteOpen()) openPalette();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (isKbdOpen()) {
    if (e.key === '?') { e.preventDefault(); closeKbd(); }
    return; // cheatsheet open: everything else inert (Esc handled above)
  }
  if (isPaletteOpen() || modalOpen || pop) return; // open UI: shortcuts inert

  switch (e.key) {
    case '/': e.preventDefault(); openPalette(); return; // swallowed, not inserted
    case '?': e.preventDefault(); toggleKbd(); return;
    case 'r': rerollLast(); return;
    case 'c': requestClear(); return;
    case 'm': toggleAllPanels(); return;
    case 'b': setPanel('compose', !panelsOpen.compose); return;
    case 'g': setPanel('groups', !panelsOpen.groups); return;
    case 'l': setPanel('log', !panelsOpen.log); return;
    case 's': setSound(!soundOn); return;
    default:
      if (e.key >= '1' && e.key <= '9') {
        const g = groups[Number(e.key) - 1]; // 1-indexed in list order
        if (g) rollGroup(g);
      }
  }
});

// ---------------------------------------------------------------------------
// Multiplayer
//
// Online mode: roll/clear buttons only POST to the server; the table reacts
// exclusively to SSE events (including our own rolls), so every client plays
// the identical tumble and shows the server-authored values. Offline
// ({online:false} from connect) keeps the fully-local solo behavior.
// ---------------------------------------------------------------------------

const LS_NAME = 'dice.name.v1';
const ROOM = new URLSearchParams(window.location.search).get('room') || 'table';

let net = null;         // live connection handle from net.connect (online only)
let netOnline = false;
let players = [];
let offers = [];        // open offered-roll cards for this room

const rosterEl = document.getElementById('rail-roster');
const statusPill = document.getElementById('status-pill');

function setPill(text, cls) {
  if (!text) {
    statusPill.classList.add('hidden');
    return;
  }
  statusPill.textContent = text;
  statusPill.className = cls || '';
}

// The rail roster: everyone ELSE at the table as quiet name pills beside
// the identity chip (you ARE the chip — its dress and menu are the 'which
// one is me' signal, so no row ever needs a '(you)' tag). Past a handful
// the tail folds into one +N pill whose title carries the names — rooms
// admit up to 40 players (server MAX_PLAYERS_PER_ROOM) and the rail must
// not push its own controls off screen at that count. Renaming lives in
// the identity menu; other players' pills are presence, not controls.
const ROSTER_MAX = 4; // name pills shown before the tail folds into +N
function renderPlayers() {
  rosterEl.innerHTML = '';
  const you = net ? net.playerId : null;
  const others = players.filter((p) => p.id !== you);
  for (const p of others.slice(0, ROSTER_MAX)) {
    const pill = document.createElement('span');
    pill.className = 'roster-name';
    const dot = document.createElement('span');
    dot.className = 'roster-dot';
    dot.style.background = p.color || '#888';
    pill.appendChild(dot);
    pill.appendChild(document.createTextNode(p.name)); // user-supplied: text only
    pill.title = p.name;
    rosterEl.appendChild(pill);
  }
  if (others.length > ROSTER_MAX) {
    const more = document.createElement('span');
    more.className = 'roster-more';
    more.textContent = `+${others.length - ROSTER_MAX}`;
    more.title = others.slice(ROSTER_MAX).map((p) => p.name).join(', ');
    rosterEl.appendChild(more);
  }
  // An open whisper picker tracks the live roster (joins/leaves/renames).
  if (pop && pop.vis && pop.vis.mode === 'whisper') renderPop();
  updateIdentityChip(); // the rail chip mirrors the roster's name + color
}

// Compact human summary of a mods spec: "+3 · adv · drop low 1 · reroll ≤2 · explode"
// Attributed parts (§7.2) show their labels: "+2 Proficiency · +1 Guidance".
function modsSummary(mods) {
  if (!mods) return '';
  const bits = [];
  if (Array.isArray(mods.parts) && mods.parts.length) {
    for (const p of mods.parts) {
      if (!p.value) continue;
      bits.push(`${p.value > 0 ? '+' : ''}${p.value}${p.label ? ` ${p.label}` : ''}`);
    }
  } else if (mods.modifier) bits.push(`${mods.modifier > 0 ? '+' : ''}${mods.modifier}`);
  if (mods.adv === 'adv') bits.push('advantage');
  if (mods.adv === 'dis') bits.push('disadvantage');
  if (mods.keep) {
    const words = { kh: 'keep high', kl: 'keep low', dh: 'drop high', dl: 'drop low' };
    bits.push(`${words[mods.keep.mode]} ${mods.keep.n}`);
  }
  if (mods.reroll) bits.push(`reroll ≤${mods.reroll.below}`);
  if (mods.explode) bits.push('explode');
  return bits.join(' · ');
}

// Human text for an offer's (or entry's) visibility, roster-resolved.
// A secret offer is the dice tower — never labeled "secret"/"blind" on
// screen (§3.2's terminology note; each word inverts somewhere).
function offerVisText(vis) {
  if (!vis) return '';
  if (vis.mode === 'held') return 'face down';
  if (vis.mode === 'secret') return 'dice tower — you roll blind, only the offerer sees the result';
  if (vis.mode === 'whisper') {
    let names = Array.isArray(vis.names) ? vis.names.filter((n) => typeof n === 'string' && n) : [];
    if (!names.length && Array.isArray(vis.audience)) {
      names = vis.audience
        .map((id) => (players.find((p) => p.id === id) || {}).name)
        .filter(Boolean);
    }
    return names.length ? `whisper to ${names.join(', ')}` : 'whisper';
  }
  return '';
}

// Offered-roll cards: anyone can execute one, once; the roll attributes to
// whoever clicks. Names/labels are user-supplied — textContent only.
function renderOffers() {
  const layer = document.getElementById('offers-layer');
  layer.innerHTML = '';
  const you = net ? net.playerId : null;
  for (const o of offers) {
    const card = document.createElement('div');
    card.className = 'offer-card';

    const head = document.createElement('div');
    head.className = 'offer-head';
    const who = document.createElement('span');
    who.className = 'offer-by';
    if (o.color) who.style.color = o.color;
    who.textContent = o.byName || 'someone';
    head.append(who, ' offers:');

    const title = document.createElement('div');
    title.className = 'offer-title';
    title.textContent = o.label || formula(o.dice || []);

    const detail = document.createElement('div');
    detail.className = 'offer-detail';
    const summary = modsSummary(o.mods);
    const exp = sanitizeExp(o.exp);
    // The offer's visibility is part of its stakes (goal 11): show it on the
    // card so a claimer knows they may be rolling blind.
    const vis = normVis(o.visibility, o.faceDown);
    const visText = offerVisText(vis);
    detail.textContent = formula(o.dice || [])
      + (summary ? `  ·  ${summary}` : '')
      + (Number.isInteger(o.dc) ? `  ·  vs ${o.dc}` : '')
      + (visText ? `  ·  ${visText}` : '')
      + (exp ? `  ·  ${exp.kind === 'cinematic' ? 'Cinematic' : 'Check'}${exp.subtitle ? ` — ${exp.subtitle}` : ''}` : '');

    const actions = document.createElement('div');
    actions.className = 'offer-actions';
    const rollBtn = document.createElement('button');
    rollBtn.className = 'btn primary';
    rollBtn.textContent = 'Roll it';
    rollBtn.addEventListener('click', () => { if (net) net.claim(o.offerId); });
    actions.appendChild(rollBtn);
    if (o.byId === you) {
      const del = document.createElement('button');
      del.className = 'btn ghost';
      del.textContent = 'Withdraw';
      del.addEventListener('click', () => { if (net) net.unoffer(o.offerId); });
      actions.appendChild(del);
    }

    card.append(head, title, detail, actions);
    layer.appendChild(card);
  }
}

// (Inline roster rename retired with the Players panel: renaming lives in
// the identity menu, whose applyRename path carries the same '#' refusal.)

// ---------------------------------------------------------------------------
// Identity chip + menu (the rail). Present SOLO AND ONLINE: the chip is your
// color dot + name; its menu offers Change name (solo writes the stored name;
// online also net.rename), Leave & switch seat (net.disconnect — drop the
// seat, clear the stored identity, re-prompt 'Take a seat'), and Copy invite
// link (the room URL). None of it needs a server (goal 9).
// ---------------------------------------------------------------------------

const identityMenu = document.getElementById('identity-menu');

function inviteUrl() {
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(ROOM)}`;
}

// JSON-safe projection — also __diceDebug.identity.
function identityInfo() {
  const me = netOnline && net ? players.find((p) => p.id === net.playerId) : null;
  let stored = '';
  try { stored = (localStorage.getItem(LS_NAME) || '').trim(); } catch { /* ignore */ }
  return {
    name: me ? me.name : stored,
    color: (me && me.color) || (netOnline && net ? net.color : null) || null,
    online: netOnline,
    room: ROOM,
    inviteUrl: inviteUrl(),
  };
}

function updateIdentityChip() {
  const info = identityInfo();
  // '' falls back to the stylesheet's solo dot color
  document.getElementById('identity-dot').style.background = info.color || '';
  document.getElementById('identity-name').textContent = info.name || '…';
}

function isIdentityMenuOpen() { return !identityMenu.classList.contains('hidden'); }

function openIdentityMenu() {
  const info = identityInfo();
  document.getElementById('idm-who').textContent = info.name || '…';
  document.getElementById('idm-room').textContent = info.online
    ? `room: ${ROOM}` : 'solo — no table joined';
  document.getElementById('idm-rename-row').classList.add('hidden');
  identityMenu.classList.remove('hidden');
}

function closeIdentityMenu() {
  identityMenu.classList.add('hidden');
  document.getElementById('idm-rename-row').classList.add('hidden');
}

document.getElementById('identity-chip').addEventListener('click', () => {
  if (isIdentityMenuOpen()) closeIdentityMenu();
  else openIdentityMenu();
});
// A press anywhere else dismisses the menu; presses on the chip fall through
// to its click toggle above, and presses inside the menu are the menu's own.
document.addEventListener('pointerdown', (e) => {
  if (!isIdentityMenuOpen()) return;
  if (e.target.closest('#identity-menu') || e.target.closest('#identity-chip')) return;
  closeIdentityMenu();
});

// One rename for every surface (the chip menu, __diceDebug.changeName): '' is
// a no-op, '#' is refused loudly (the server strips it — see cleanName — and
// a quietly-stripped echo would rename the player behind their back), a clean
// name lands in localStorage, on the chip, and online on the roster too.
function applyRename(raw) {
  const newName = cutText(String(raw ?? ''), 24);
  if (!newName) return false;
  if (newName.includes('#')) {
    handleNetRefusal({
      path: '/api/rename', status: 400, code: 'bad_name',
      message: 'names cannot contain # — it starts a comment in roll notation',
    });
    return false;
  }
  try { localStorage.setItem(LS_NAME, newName); } catch { /* ignore */ }
  if (netOnline && net) {
    const me = players.find((p) => p.id === net.playerId);
    if (me && me.name !== newName) {
      me.name = newName; // optimistic; the 'player-renamed' broadcast confirms
      renderPlayers();
      net.rename(newName);
    }
  }
  updateIdentityChip();
  return true;
}

document.getElementById('idm-rename').addEventListener('click', () => {
  const row = document.getElementById('idm-rename-row');
  const input = document.getElementById('idm-name-input');
  row.classList.remove('hidden');
  input.value = identityInfo().name || '';
  input.focus();
  input.select();
});
document.getElementById('idm-name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    // a refused name ('#') keeps the input open to be fixed
    if (applyRename(e.currentTarget.value)) closeIdentityMenu();
  } else if (e.key === 'Escape') {
    document.getElementById('idm-rename-row').classList.add('hidden');
  }
  e.stopPropagation();
});

// Leave & switch seat: net.disconnect drops the live stream, the stored
// identity clears, and the whole join flow runs again — 'Take a seat', then
// re-join (or stay solo when there is no server). The rail roster empties
// with the seat.
function leaveTable() {
  closeIdentityMenu();
  const old = net;
  net = null;
  netOnline = false; // status callbacks from the dying stream are ignored
  if (old) old.disconnect();
  try { localStorage.removeItem(LS_NAME); } catch { /* ignore */ }
  players = [];
  offers = [];
  renderPlayers(); // empties the rail roster (players = [])
  renderOffers();
  setPill(null);
  updateIdentityChip();
  netReady = initNet();
  return true;
}
document.getElementById('idm-leave').addEventListener('click', () => leaveTable());

document.getElementById('idm-invite').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(inviteUrl());
    btn.textContent = 'copied!';
  } catch {
    window.prompt('Copy this invite link:', inviteUrl());
  }
  setTimeout(() => {
    btn.textContent = 'Copy invite link';
    closeIdentityMenu();
  }, 900);
});

updateIdentityChip(); // seed the chip before the join resolves

// Server Roll -> display log entry: same conversion showResults uses.
function rollToLogEntry(roll) {
  return entryFromRoll({ ...roll, label: roll.label || formula(roll.dice || []) });
}

// §7.7 resync: reconstruct the newest on-felt roll after a hello with the
// SAME seeded fast-forward playRoll runs, jumped straight to its final
// keyframe — no tumble, no sounds, no replayed ceremony or crit fanfare.
// Skipped when this client already has the roll (dice on the table, in
// flight, or queued) — closing the audit's empty-felt-on-reload gap without
// disturbing a live table.
function replaySettledRoll(r) {
  if (!r || !r.rollId) return;
  if (tableDice.some((d) => d.rollId === r.rollId)) return;
  if (currentRoll && !currentRoll.done) return; // a live playback outranks a replay
  if (rollQueue.some((q) => q.rollId === r.rollId)) return;
  playRoll({
    rollId: r.rollId,
    t: r.t,
    dice: r.dice,
    values: r.values,
    perDie: r.perDie,
    modifier: r.modifier,
    total: r.total,
    spec: r.spec,
    dc: r.dc,
    exp: null, // the moment already played for the room; reconstruct plain
    faceDown: r.faceDown,
    revealed: r.revealed,
    redacted: r.redacted,       // goal 11: a hidden roll reconstructs shrouded
    visMode: r.visMode,
    visibility: r.visibility,
    revealAuthority: r.revealAuthority,
    notation: r.notation,
    playerId: r.playerId,
    seed: r.seed,
    label: r.label || formula(r.dice || []),
    playerName: r.playerName,
    color: r.color,
  });
  if (currentRoll && currentRoll.rollId === r.rollId && !currentRoll.done) {
    currentRoll.soundIdx = currentRoll.sounds.length; // a silent landing
    suppressRollFx = true;
    try {
      stepPlayback(currentRoll.duration - currentRoll.time + FIXED_DT);
    } finally {
      suppressRollFx = false;
    }
  }
  // Re-point the banner at the room's own entry (full spec, exp included) so
  // its ⟳ reroll carries the whole intent, and rebind the actions to it.
  const rebuilt = log.find((e) => e.rollId === r.rollId);
  if (rebuilt && lastEntry && lastEntry.rollId === r.rollId) {
    lastEntry = rebuilt;
    if (!banner.classList.contains('hidden')) {
      renderRollResults(rebuilt, tableDice.filter((d) => d.rollId === r.rollId), false);
    }
  }
}

function handleNetEvent(type, data) {
  if (!data) return;
  switch (type) {
    case 'hello': // initial state + re-sync after a reconnect
      players = data.players || [];
      renderPlayers();
      log = (data.log || []).map(rollToLogEntry);
      renderLog();
      // The banner still holds a PRE-rebuild entry object — a stale twin of the
      // log line it came from. Re-point it at the fresh one so the replays
      // below (and every later repaint) act on the state the room agrees on.
      if (lastEntry && lastEntry.rollId) {
        const rebuilt = log.find((e) => e.rollId === lastEntry.rollId);
        if (rebuilt) lastEntry = rebuilt;
      }
      offers = data.offers || [];
      renderOffers();
      applyRoomSettings(data.settings); // late joiners + reconnects land on the room felt
      // §7.5/§3.1 resync: 'roll-cleared' and 'reveal' are one-shot broadcasts a
      // stream blip can swallow, and the server deliberately never re-sends
      // them — it flags the surviving state on the logged roll instead. Replay
      // both here or this table never converges: dice would sit forever on a
      // roll someone finished with, and a flipped roll would keep reading '?'
      // on the banner. applyClearRoll is a no-op for rolls with no dice on this
      // table and defers for one still mid-playback or queued; applyReveal is
      // idempotent and repaints the banner when the roll is the one on it.
      for (const r of data.log || []) {
        if (!r || !r.rollId) continue;
        if (r.revealed && (r.faceDown || r.redacted || r.visMode || r.visibility)) {
          applyReveal(r.rollId, r);
        }
        if (r.cleared) applyClearRoll(r.rollId);
      }
      // §7.7 resync: the server's present-or-absent flags are the one truth
      // about where every roll lives. Adopt them, then rebuild what should be
      // standing: collected entries settle straight into their slots (no
      // whisk), and the newest on-felt entry fast-forwards its seeded throw
      // to the final keyframe. Both are idempotent against dice this client
      // already has, so a reconnect hello disturbs nothing.
      {
        const entries = (data.log || []).filter((r) => r && r.rollId);
        for (const r of entries) {
          const st = rollState(r.rollId);
          st.cleared = !!r.cleared;
          if (r.collected) st.collected = r.collected;
        }
        for (const r of entries) {
          if (!r.cleared && r.collected) applyRollCollected(r.rollId, r.collected, false);
        }
        const newest = [...entries].reverse().find((r) => !r.cleared && !r.collected);
        if (newest) replaySettledRoll(newest);
        renderShelfMarkers();
      }
      break;
    case 'player-joined':
      if (data.player && !players.some((p) => p.id === data.player.id)) {
        players.push(data.player);
        renderPlayers();
      }
      break;
    case 'player-left':
      players = players.filter((p) => p.id !== data.playerId);
      renderPlayers();
      break;
    case 'player-renamed': {
      const p = players.find((x) => x.id === data.playerId);
      if (p) {
        p.name = data.name;
        renderPlayers();
      }
      break;
    }
    case 'roll': // the only path that animates in online mode — ours included
      playRoll({
        rollId: data.rollId,
        t: data.t,
        dice: data.dice,
        values: data.values,
        perDie: data.perDie,
        modifier: data.modifier,
        total: data.total,
        spec: data.spec,
        dc: data.dc,
        exp: data.exp,
        faceDown: data.faceDown,
        revealed: data.revealed,
        redacted: data.redacted,       // goal 11: server-side projection flags
        visMode: data.visMode,
        visibility: data.visibility,
        revealAuthority: data.revealAuthority,
        notation: data.notation,
        playerId: data.playerId,
        seed: data.seed,
        label: data.label || formula(data.dice || []),
        playerName: data.playerName,
        color: data.color,
      });
      break;
    case 'clear':
      clearTable();
      break;
    case 'reveal':
      // Post-redaction the event carries the newly-authorized FULL entry
      // (per recipient); a bare {rollId} still upgrades rolls whose values
      // this client already holds (legacy face-down).
      applyReveal(
        (data.roll && data.roll.rollId) || data.rollId,
        data.roll || (Array.isArray(data.values) ? data : undefined)
      );
      break;
    case 'roll-cleared': // per-roll Done (§7.5) / shelf aging (§7.7)
      applyClearRoll(data.rollId);
      break;
    case 'roll-collected': // §7.7 — the shelf takes the roll, everywhere at once
      applyRollCollected(data.rollId, data.seq);
      break;
    case 'offer':
      if (data.offer && !offers.some((o) => o.offerId === data.offer.offerId)) {
        offers.push(data.offer);
        renderOffers();
      }
      break;
    case 'offer-claimed':
    case 'offer-rescinded':
      offers = offers.filter((o) => o.offerId !== data.offerId);
      renderOffers();
      break;
    case 'settings-changed':
      // The server broadcasts the FULL merged object — our own click applies
      // here too (the echo), which is why selectFelt never applies optimistically.
      applyRoomSettings(data.settings);
      if (data.byId && net && data.byId !== net.playerId) {
        showSettingsNote(`${data.byName || 'someone'} changed the table`);
      }
      break;
  }
}

function handleNetStatus(status) {
  if (!netOnline) return; // solo mode keeps its own pill
  setPill(status === 'online' ? null : 'reconnecting…', 'offline');
}

// The server refused something we asked for (a whisper to a name nobody here
// answers to, a reveal we do not hold). The action simply not happening is not
// an answer — the server's own message goes on the pill, which is where every
// other transient table notice already lives.
let lastRefusal = null;
let refusalTimer = null;
function handleNetRefusal(info) {
  lastRefusal = info;
  clearTimeout(refusalTimer);
  setPill(info.message, 'refused');
  statusPill.title = info.message; // the pill clips; the tooltip does not
  refusalTimer = setTimeout(() => {
    if (statusPill.textContent === info.message) setPill(null);
  }, 5000);
}

// Roll/clear entry points used by the UI buttons.
// opts: {mods, faceDown, dc, exp, comment, notation, canonical}. `notation`
// routes the raw string to the server (its parse is authoritative);
// `canonical` is only the history entry — every successful roll from any path
// lands in 'dice.cmdhistory.v1' as its canonical string.
//
// The fallback canonical (paths with no string of their own — reroll-last from
// the banner, the log and the 'r' shortcut) dresses the roll with everything
// §7.6 gave a spelling: a held roll recorded as plain '1d20' would come back
// from ↑ as a PUBLIC roll, and a Check would come back Plain. Only the comment
// title cannot be recovered on a reroll — it never rides the wire — so callers
// that still have it pass it in.
function requestRoll(types, label, opts = {}) {
  if (!types.length) return;
  const vis = normVis(opts.visibility, opts.faceDown);
  const canonical = opts.canonical || canonicalWithVis(
    { dice: types, mods: opts.mods || null },
    {
      dc: Number.isInteger(opts.dc) ? opts.dc : null,
      comment: typeof opts.comment === 'string' ? opts.comment : null,
      exp: sanitizeExp(opts.exp),
    },
    vis
  );
  // History records only rolls that actually happened: online that means the
  // server accepted it (a 400 or a network failure resolves null), solo it
  // means the spec passed the same validation rollDice applies.
  if (netOnline && net) {
    const wireOpts = { ...opts };
    // secret/whisper have no explicit wire field BY DESIGN: visibility rides
    // the notation string and the server re-parses it. Paths that arrive here
    // with no string of their own (popover, reroll-last) get the canonical.
    // held keeps today's faceDown field on the explicit shape.
    if (vis && vis.mode !== 'held' && !wireOpts.notation) wireOpts.notation = canonical;
    // animation waits for the SSE event
    net.roll(types, label, wireOpts).then((roll) => { if (roll) pushHistory(canonical); });
  } else {
    // Solo/offline (goal 9): there is no server to redact for anyone, so
    // secret/whisper act as OPEN; held keeps the local face-down flow.
    if (validateMods(types, opts.mods || null)) return; // invalid spec: no roll
    rollDice(types, label, { ...opts, faceDown: !!(vis && vis.mode === 'held') });
    pushHistory(canonical);
  }
}

function requestClear() {
  if (netOnline && net) net.clear(); // table clears when the 'clear' event arrives
  else clearTable();
}

function promptName() {
  return new Promise((resolve) => {
    const modal = document.getElementById('name-modal');
    const input = document.getElementById('name-input');
    const joinBtn = document.getElementById('name-join');
    const hint = document.querySelector('#name-panel .hint');
    const hintText = 'Pick a display name for the table.';
    modal.classList.remove('hidden');
    input.value = '';
    // '#' is banned in names at every entry point (it starts a comment in
    // roll notation — see server.js cleanName); say so here rather than let
    // the server silently strip it.
    const update = () => {
      const hash = input.value.includes('#');
      joinBtn.disabled = !input.value.trim() || hash;
      hint.textContent = hash
        ? 'names cannot contain # — it starts a comment in roll notation'
        : hintText;
      hint.classList.toggle('warn', hash);
    };
    const submit = () => {
      const name = cutText(input.value, 24);
      if (!name || name.includes('#')) return;
      // 'Leave & switch' re-opens this modal, so listeners must not stack
      // across prompts: detach this round's before resolving.
      input.removeEventListener('input', update);
      input.removeEventListener('keydown', onKey);
      joinBtn.removeEventListener('click', submit);
      modal.classList.add('hidden');
      resolve(name);
    };
    const onKey = (e) => { if (e.key === 'Enter') submit(); };
    input.addEventListener('input', update);
    update();
    joinBtn.addEventListener('click', submit);
    input.addEventListener('keydown', onKey);
    input.focus();
  });
}

async function initNet() {
  let name = '';
  try { name = (localStorage.getItem(LS_NAME) || '').trim(); } catch { /* ignore */ }
  if (!name) {
    name = await promptName();
    try { localStorage.setItem(LS_NAME, name); } catch { /* ignore */ }
  }

  const conn = await connect({
    room: ROOM,
    name,
    onEvent: handleNetEvent,
    onStatus: handleNetStatus,
    onRefused: handleNetRefusal,
  });
  if (conn.online) {
    net = conn;
    netOnline = true;
    players = conn.players || [];
    // The server sanitizes names ('#' stripped like control/bidi chars, then
    // capped — server.js cleanName): adopt its answer for a stored name so
    // localStorage and the roster agree from the first paint, instead of
    // re-submitting the unsanitized spelling on every visit.
    const me = players.find((p) => p.id === conn.playerId);
    if (me && me.name && me.name !== name) {
      try { localStorage.setItem(LS_NAME, me.name); } catch { /* ignore */ }
    }
    renderPlayers(); // the rail roster fills in (solo it is simply empty)
    log = (conn.log || []).map(rollToLogEntry); // server history for late joiners
    renderLog();
    offers = conn.offers || [];
    renderOffers();
    applyRoomSettings(conn.settings); // room settings from the join response
    setPill(null);
  } else {
    netOnline = false;
    setPill('solo', 'solo'); // static hosting / no server: local play
    applyRoomSettings(load(LS_ROOMSETTINGS, null)); // solo keeps its own felt
  }
  updateIdentityChip(); // the rail chip takes the seat's name + color
  return { online: netOnline };
}

// let, not const: 'Leave & switch seat' (leaveTable) re-runs the join flow
// and repoints this at the fresh promise.
let netReady = initNet();
