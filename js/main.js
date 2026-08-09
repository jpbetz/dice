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
import { DIE_TYPES, DIE_DEFS, createDieMesh, createDieBody, readValue, valueRange, faceNormalForValue, getDie, SHADER_TIME } from './dice.js';
import { dieArtURL } from './diceart.js';
import { connect, forgetSeat, peekTable } from './net.js';
import { recentTables, rememberTable, forgetTable, mintRoomKey } from './tables.js';
import { SYSTEMS, DEFAULT_SYSTEM, OUTCOME_SLUGS } from './meanings.js';
import { composeRoll, validateMods, budgetOf } from './rollspec.js';
import { previewOf, countingPmfs } from './odds.js';
import { parseNotation, canonicalNotation, cutText } from './notation.js';
import { dealStartingRack, dealRack, dealName } from './seed.js';
import { exportYaml, parsePortable, planImport, profileToImport } from './portable.js';
import {
  MAX_PROFILES, MAX_POOLS, knownSystem, emptyStore, normalizeStore, profilesOf, findProfile,
  activeProfile, profilesFor, lastUsedFor, isFull, nameProfile, uniqueName,
  addProfile, renameProfile, deleteProfile, setActive, writeActivePools,
  setActiveSystem, setProfileSet, migrateLegacy, toWire, fromWire,
} from './profiles.js';
import { THEMES, SETS } from './themes.js';
import { ParticleField } from './particles.js';
import { DecalField } from './decals.js';
import { DieLightRig } from './dielights.js';
import { PostStack, MAX_SHIMMER } from './post.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// THE URL ADDRESSES A TABLE, AND NOW IT IS ALLOWED NOT TO (§3b L0, UX §7.20).
// `?room=` absent used to fall back to the key 'table', which meant the bare
// deployed URL sat every stranger who opened it on ONE shared felt — nobody
// joined that table, it was just the only front door. ROOM is now nullable and
// null IS the lobby: no join, no name prompt, no server call at all. Every
// consumer that interpolates ROOM into a key, a URL or a wire field has to ask
// IN_LOBBY first — the audit's rule is that a surface speaking about YOU keeps
// working and a surface speaking about THE TABLE must be absent, and this pair
// is where that question gets asked.
//
// DECLARED HERE, at the top, for exactly the reason ZOOM_LEVELS below is:
// setSound() → syncSettingsUI() → the felt/system pickers run during MODULE
// EVALUATION, and those pickers now word their tooltips differently in the
// lobby. Left down beside LS_NAME (where the rest of the net constants live)
// this pair is in TDZ when they read it, and the whole module dies at eval.
const ROOM = new URLSearchParams(window.location.search).get('room') || null;
const IN_LOBBY = ROOM === null;

// Mat extents — LET, not const: the room-wide zoom setting resizes the mat
// live (walls, shelf pitch, camera framing all follow). The base values here
// are DEFAULT_ZOOM's preset and must move with it; ZOOM_PRESETS owns them all, and
// applyZoom mutates these + the wall body positions in place.
let TABLE_W = 14;            // playable width (x) — the DEFAULT ('medium')
let TABLE_D = 8.6;           // playable depth (z)
// Zoom picker labels — declared here (not next to renderZoomPicker) because
// setSound() → syncSettingsUI() → renderZoomPicker() runs during module
// evaluation, and the picker's early build must not read this in TDZ.
const ZOOM_LEVELS = [
  { id: 'wide',   label: 'Wide',   title: 'Wide — the roomiest table' },
  { id: 'medium', label: 'Medium', title: 'Medium — the default; larger dice, still room to throw' },
  { id: 'close',  label: 'Close',  title: 'Close — biggest dice, best on a phone' },
];
// MEDIUM, not wide (2026-08-09). The ladder moved one step closer and `wide`
// is now byte-for-byte the old `close` — so defaulting to `wide` would ship
// the view a player previously had to go and choose. Measured die span at the
// mat's centre: desktop 107 / 138 / 175 px, phone-with-rail 38 / 49 / 62.
// Medium is the one that reads well on both without spending the room a
// two-handed throw needs.
const DEFAULT_ZOOM = 'medium';
const MAX_DICE_ON_TABLE = 40;
const GRAVITY = -110;
const LOG_CAP = 100;
// THE PROFILE LIBRARY (docs/PROFILES.md §11) — up to 32 named racks, each
// bound to a rolling system, exactly one of them in your hands. This is the
// rack's home as of 2026-08-08; see the boot block by `let groups` for how the
// two keys below are read once and then left alone forever.
const LS_PROFILES = 'dice.profiles.v1';
// LEGACY, read once at boot and never written again (the LS_INPUTMODE /
// LS_MINI precedent). LS_GROUPS was the single rack until the library existed
// and is the one recovery path if the library is ever cleared, so it is left
// in place as a fossil rather than deleted. LS_GROUPS_MINE was Tier G's
// authoring stash — present in storage ⇔ a rack swap was live — and IS
// removed once migrated, because there are no swaps any more for it to mean.
const LS_GROUPS = 'dice.groups.v1';
const LS_GROUPS_MINE = 'dice.groups.mine.v1';
const LS_LOG = 'dice.log.v1';
const LS_HISTORY = 'dice.cmdhistory.v1'; // command-box history: shared across rooms, cap 50
const HISTORY_CAP = 50;
const LS_SOUND = 'dice.sound.v1';        // "Just you" scope: sound on/off
const LS_CHIPS = 'dice.chips.v1';        // "Just you" scope: per-die value chips (default OFF — P1)
const LS_ROOMSETTINGS = 'dice.roomsettings.v1'; // solo-mode copy of the table settings
const LS_DICESET = 'dice.diceset.v1';    // "Just you" scope: dice-set identity (Tier 6 §9)
// Declared up here with the rest, not down beside initNet where it used to
// live: the library's migration names a fresh profile after the player, and
// that runs during the rack's module-eval block — a const down at the net
// section is in TDZ there, which kills the whole module.
const LS_NAME = 'dice.name.v1';

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------

const container = document.getElementById('scene-container');
// The felt is a LAYOUT REGION, not the viewport (2026-08-04: the side panel
// is a real column beside it). `view` is the cached felt rect — every
// world→screen projection reads it, never window.innerWidth — and refitView
// (further down, also the resize handler) owns refreshing it.
const view = (() => {
  const r = container.getBoundingClientRect();
  return { left: r.left, width: Math.max(1, r.width), height: Math.max(1, r.height) };
})();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(view.width, view.height);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0f0f13'); // obsidian sceneBg — the DEFAULT_FELT below

const camera = new THREE.PerspectiveCamera(42, view.width / view.height, 1, 200);
camera.position.set(0, 27, 15.5);
camera.lookAt(0, 0, 0.5);

scene.add(new THREE.HemisphereLight('#fff6e0', '#2a2018', 1.1));

const keyLight = new THREE.DirectionalLight('#ffeecc', 2.9);
keyLight.position.set(8, 30, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
// Shadow frustum tracks the mat: zoom shrinks TABLE_W/D, and the ortho
// bounds shrink with it (a bigger frustum than the mat just wastes shadow
// map). updateShadowFrustum runs at boot and again from applyZoom.
function updateShadowFrustum() {
  keyLight.shadow.camera.left = -TABLE_W / 2 - 4;
  keyLight.shadow.camera.right = TABLE_W / 2 + 4;
  keyLight.shadow.camera.top = TABLE_D / 2 + 6;
  keyLight.shadow.camera.bottom = -TABLE_D / 2 - 6;
  keyLight.shadow.camera.updateProjectionMatrix();
}
updateShadowFrustum();
keyLight.shadow.camera.far = 60;
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight('#8fb4ff', 0.7);
rimLight.position.set(-12, 18, -14);
scene.add(rimLight);

// A reflection environment (Tier 6 §9, same technique the lab proved):
// glossy themed sets — lacquer, ice, resin — need a WORLD to mirror, not
// just analytic lights. A painted equirect (warm key strip echoing
// keyLight, cool counter echoing rimLight, dark floor) through core
// PMREM. Standard dice barely change: dice.js pins their
// envMapIntensity low, and the felt's roughness swallows the rest.
{
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2e2820');
  g.addColorStop(0.55, '#141110');
  g.addColorStop(0.62, '#0a0807');
  g.addColorStop(1, '#050403');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#fff0d0';
  x.fillRect(60, 24, 130, 20);  // warm key strip
  x.fillStyle = '#8fb4d8';
  x.fillRect(330, 40, 80, 12);  // cool counter-strip
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
}

// Level 3's field on the live table: bursts fire from the impacts the
// fast-forward already records for the click sounds (never on a timer).
const particleField = new ParticleField(scene);
particleField.setProjection(view.height, camera.fov);

// Level 4 on the live table. Decals: transient marks stamped from the
// same recorded impacts (floor-height ones only — walls don't scorch),
// living just above the felt plane — DISABLED BY DEFAULT since
// 2026-08-03 (Joe's call: the ladder stays, the residue goes). The
// wiring below stays live; DecalField.stamp itself is the gate. Flip
// DECALS_DEFAULT_ENABLED in decals.js to bring the marks back, or
// __diceDebug.decalsEnable(true) to trial them on one screen.
// Lights: four pooled PointLights that
// exist from boot at intensity zero — three.js recompiles every lit
// program when the light COUNT changes, and a recompile stutter
// mid-tumble is worse than any glow is good. Budget of 4 is also the
// restraint: the newest throw steals from the oldest.
const decalField = new DecalField(scene);
const dieLights = new DieLightRig(scene, { max: 4 });

// Level 5 (js/post.js): selective bloom / shock rings / heat shimmer.
// The table BYPASSES the whole stack unless something on it glows — a
// std table renders exactly the direct path it always did; the stack
// only exists in frames where a bloom-flagged die, live particles, or a
// running ring/shimmer would be visible. (postForced is the test hook
// that pins the two paths against each other.)
const postStack = new PostStack(renderer);
let postForced = false;
const DECAL_Y = 0.021;            // marks sit a hair above the felt plane
const DECAL_MIN_STRENGTH = 6;     // a mark needs a real hit, not a settling tremble
const DECAL_MAX_CONTACT_Y = 0.6;  // floor contacts only: a wall click leaves no felt mark
const DECAL_CAP_PER_ROLL = 6;     // drama, not mud

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
const DEFAULT_FELT = 'obsidian';
let currentFeltId = DEFAULT_FELT;

// Current merged room settings — initialized HERE, not next to
// applyRoomSettings below, because setSound()'s module-eval call chain
// (syncSettingsUI → renderZoomPicker) reads roomSettings.zoom. Adding a new
// key requires only adding it to defaults.
let roomSettings = { felt: DEFAULT_FELT, system: DEFAULT_SYSTEM, tableName: '', zoom: DEFAULT_ZOOM };

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
// each other (W < SHELF_PITCH).
const SHELF_SLOTS = 5;
// SHELF_Z and the pitch between slot centers are DERIVED from TABLE_W/D — a
// zoom preset resizes the mat and the shelf slides with it (the 1.9-unit
// clearance from the front wall is the invariant). SHELF_SLOT_W/D stay fixed:
// a slot holds ~3 dice abreast; sized by die-radius, not felt-fraction.
let SHELF_Z = TABLE_D / 2 - 1.9;     // slot center (world z; wide: 6.6)
const SHELF_SLOT_W = 5.4;            // slot decal width  (x units)
const SHELF_SLOT_D = 3.6;            // slot decal depth  (z units)
const SHELF_MARKER_Y = 2.4;          // marker anchor height above the slot
let SHELF_PITCH = (TABLE_W - SHELF_SLOT_W) / (SHELF_SLOTS - 1); // wide: 6.15
const shelfSlotX = (slot) => (slot - (SHELF_SLOTS - 1) / 2) * SHELF_PITCH;

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
// Each cluster's ring is tinted with its ROLLER's color, warmed toward the
// table's gold so every tint reads as candlelight rather than neon — the
// joiner's at-a-glance attribution (CUJ5), restored to the shelf at zero
// chrome cost after the resting markers went invisible.
function glowTint(rollId) {
  const entry = log.find((e) => e.rollId === rollId);
  const hex = entry && typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color)
    ? entry.color : '#ffcd64';
  const n = parseInt(hex.slice(1), 16);
  const W = 0.45; // warm blend share
  return [
    Math.round(((n >> 16) & 255) * (1 - W) + 255 * W),
    Math.round(((n >> 8) & 255) * (1 - W) + 205 * W),
    Math.round((n & 255) * (1 - W) + 100 * W),
  ];
}

function drawShelfGlow(ctx) {
  for (const c of shelfClusters.values()) {
    if (!c.glow || c.slot < 0) continue;
    const cx = decalPx(shelfSlotX(c.slot));
    const cy = decalPx(SHELF_Z);
    // refreshes the marker-size cache too: every occupancy change lands here
    const r = (c.glowR = clusterGlowRadius(c)) * DECAL_PX_PER_UNIT;
    const [tr, tg, tb] = glowTint(c.rollId);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${tr}, ${tg}, ${tb}, 0.06)`);
    g.addColorStop(0.62, `rgba(${tr}, ${tg}, ${tb}, 0.10)`);
    g.addColorStop(0.82, `rgba(${tr}, ${tg}, ${tb}, 0.05)`);
    g.addColorStop(1, `rgba(${tr}, ${tg}, ${tb}, 0)`);
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

// Tier 0 §0 (hot-paths): ONE persistent DECAL_SIZE canvas + ONE CanvasTexture
// serve the floor for the life of the process. paintFloor clears + redraws in
// place and flips needsUpdate; the floor material's `map` reference never
// changes after boot, so there is no dispose/allocate churn on shelf change,
// theme swap, or mat-decal open/close. The GPU still re-uploads the 2048²
// atlas on each needsUpdate (that cost is unchanged), but the CPU allocation
// (a fresh backing canvas + a new WebGLTexture handle per recomposite) and
// the GC pressure that came with it are gone — the primary win.
const floorCanvas = document.createElement('canvas');
floorCanvas.width = floorCanvas.height = DECAL_SIZE;
const floorCtx = floorCanvas.getContext('2d');
const floorTexture = new THREE.CanvasTexture(floorCanvas);
floorTexture.colorSpace = THREE.SRGBColorSpace;

// The mat-text branch, extracted verbatim from the old feltCanvas() — the
// letterSpacing try/catch, the 30→13 px shrink loop bounds, and the +3.4
// unit y-offset must not drift (no scenario asserts glyph position).
function drawMatText(ctx, text) {
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
}

// Repaint the persistent floor canvas in place. base is a felt-tile cache
// entry; text is the optional mat declaration line. MUST be called at least
// once before the first render() — otherwise the first frame samples a blank
// atlas. Boot does this at end-of-file just below the floor construction.
function paintFloor(base, text) {
  floorCtx.clearRect(0, 0, DECAL_SIZE, DECAL_SIZE);
  floorCtx.drawImage(baseFeltCanvas(base), 0, 0);
  drawShelfGlow(floorCtx);
  if (text) drawMatText(floorCtx, text);
  floorTexture.needsUpdate = true;
}

function applyMatDecal(text) {
  if (typeof text !== 'string' || !text.trim()) return;
  matDecalText = text.trim();
  paintFloor(FELT_THEMES[currentFeltId].feltBase, matDecalText);
}

function clearMatDecal() {
  if (matDecalText === null) return;
  matDecalText = null;
  paintFloor(FELT_THEMES[currentFeltId].feltBase, null);
}

// Repaint the live floor for the current shelf occupancy: same base, same mat
// text, fresh glow rings. Called on every shelf change (reflowShelf, the
// whisk-end landing, the corner sweep) — the same recomposite path mat text
// already rides, so theme changes and ceremonies compose with the rings.
function recompositeFelt() {
  paintFloor(FELT_THEMES[currentFeltId].feltBase, matDecalText);
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({
    map: floorTexture,
    roughness: 0.95,
    metalness: 0,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
// MUST paint at least once before the first render — the persistent canvas
// starts blank, and the material.map reference is now permanent.
paintFloor(FELT_THEMES[DEFAULT_FELT].feltBase, null);

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
// Perf pass §0a (Commit B — SAP broadphase): the default NaiveBroadphase is
// O(N²) — a 1d20 rolled onto a shelf of 200 static settled dice takes ~106 ms
// of synchronous physics just to enumerate collision pairs. SAPBroadphase
// insertion-sorts by axis (x here — the table's long dimension) and skips
// pairs whose AABBs don't overlap on that axis. The constructor's setWorld
// seeds axisList from the six static planes already added above and installs
// add/remove listeners so every subsequent die enters the list correctly.
// Determinism is asserted by the perf-determinism e2e scenario (cross-client
// keyframe hash) — mandatory before this ships.
world.broadphase = new CANNON.SAPBroadphase(world); // axisIndex=0 (x); do NOT autoDetectAxis

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
  return body;
}
addStaticPlane(floorMat, [0, 0, 0], [-Math.PI / 2, 0, 0]);                   // floor
// Wall refs — applyZoom mutates their positions in place (cannon's SAP
// broadphase is safe with in-place moves on static bodies; removing + adding
// would shuffle body ordering and reseed collision-pair enumeration, which is
// the perf-determinism scenario's exact regression pin).
const walls = {
  back:  addStaticPlane(wallMat, [0, 0, -TABLE_D / 2], [0, 0, 0]),
  front: addStaticPlane(wallMat, [0, 0,  TABLE_D / 2], [0, Math.PI, 0]),
  left:  addStaticPlane(wallMat, [-TABLE_W / 2, 0, 0], [0, Math.PI / 2, 0]),
  right: addStaticPlane(wallMat, [ TABLE_W / 2, 0, 0], [0, -Math.PI / 2, 0]),
};
addStaticPlane(wallMat, [0, 22, 0], [Math.PI / 2, 0, 0]);                    // ceiling

// ---------------------------------------------------------------------------
// Sound (procedural clicks on impact)
// ---------------------------------------------------------------------------

let audioCtx = null;
// Persisted "Just you" preference ('dice.sound.v1'), honored on load. load()
// is a hoisted function declaration, so calling it here is safe.
let soundOn = load(LS_SOUND, true) !== false;

// "Just you": the dice-set identity you throw with (Tier 6 §9). It rides
// every roll and claim request — everyone at the table sees YOUR dice in
// it — and applies from the next roll (dice already on the felt keep the
// skin they landed with; a roll is a record). Initialized HERE, above the
// settings boot calls, because syncSettingsUI renders the picker.
let diceSet = (() => {
  const v = load(LS_DICESET, 'std');
  return typeof v === 'string' && (v === 'std' || SETS[v]) ? v : 'std';
})();
function setDiceSet(id, persist = true) {
  diceSet = id === 'std' || SETS[id] ? id : 'std';
  if (persist) save(LS_DICESET, diceSet);
  renderDiceSetPicker();
  refreshDieArt(); // palette + strips wear the new set immediately
  schedulePublishPools(); // teammates' view of your rack wears your default (§9)
  return diceSet;
}
// What rides the wire: absent for standard (a plain roll's payload stays
// byte-for-byte what it always was — the server's present-or-absent rule).
function wireSet() {
  return diceSet !== 'std' ? diceSet : undefined;
}
// The set a ROLL wears (§9 saved-pool override): an explicit opts.set wins —
// 'std' pins the classics by RESOLVING to absent (the wire rule holds even
// when your own set is a house set) — otherwise your set rides as always.
// Callers only pass opts.set when a pool rolls as itself (the rail quick
// list; a staged draft rides per-die `sets` via draftDieSets instead);
// rerolls, claims and plain notation stay on wireSet.
function rollSetOf(opts) {
  const s = opts && opts.set;
  if (s === 'std') return undefined;
  if (typeof s === 'string' && SETS[s]) return s;
  return wireSet();
}
let lastSoundAt = 0;

// IMPACT VOICE (Slice 1, Joe 2026-08-04 aesthetic pass): the per-set
// sound identity — one function replaces the single hard-coded click
// with five voices (chime / thud / crackle / clack / hush) modulated by
// weight (heavier = lower + longer) and sustain (ms of tail). Sets
// without a `sound` recipe field fall back to the legacy click, so the
// Classics house — the "just dice" honest option — keeps the original
// tone and every non-themed roll stays exactly as it sounded before.
//
// The bodies are shaped to sound like the material they claim:
//   click   default — the original 45ms filtered white noise
//   chime   glass/crystal — bright bandpass + a decaying sine partial
//   thud    heavy iron/stone — lowpass, long noise tail
//   crackle storm charge — sharp attack, jagged mid-noise
//   clack   dry bone/lacquered wood — narrow bandpass, brief
//   hush    umbra — barely-audible filtered breath (subtracted click)
// Weight 0..1 shifts the center frequency down; sustain ms extends the
// decay envelope. Every voice reads on top of the impact strength gain,
// so a heavy die still needs a hard contact to be loud.
const IMPACT_VOICES = {
  click:   { filter: 'bandpass', baseFreq: 2500, freqSpread: 1800, q: 1.2, decayShape: 0.25, gainScale: 0.06 },
  chime:   { filter: 'bandpass', baseFreq: 3400, freqSpread:  700, q: 2.8, decayShape: 0.42, gainScale: 0.045, partial: true },
  thud:    { filter: 'lowpass',  baseFreq:  420, freqSpread:  200, q: 1.4, decayShape: 0.15, gainScale: 0.075 },
  crackle: { filter: 'bandpass', baseFreq: 2200, freqSpread: 1400, q: 0.8, decayShape: 0.10, gainScale: 0.06 },
  clack:   { filter: 'bandpass', baseFreq: 1150, freqSpread:  400, q: 2.2, decayShape: 0.22, gainScale: 0.055 },
  hush:    { filter: 'lowpass',  baseFreq:  700, freqSpread:  200, q: 0.9, decayShape: 0.35, gainScale: 0.018 },
};

function playImpact(strength, voice) {
  if (!soundOn) return;
  const now = performance.now();
  if (now - lastSoundAt < 35) return;
  lastSoundAt = now;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  }
  const v = voice || null;
  const body = (v && IMPACT_VOICES[v.body]) ? v.body : 'click';
  const preset = IMPACT_VOICES[body];
  const weight = v ? Math.max(0, Math.min(1, v.weight || 0)) : 0;
  const sustainMs = v ? Math.max(0, v.sustain || 0) : 0;
  const durSec = (45 + sustainMs) / 1000;
  const buf = audioCtx.createBuffer(1, Math.max(1, Math.floor(audioCtx.sampleRate * durSec)), audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  // Envelope: exponential decay whose steepness comes from decayShape.
  // A brief attack transient sharpens crackle without pinning peak gain.
  for (let i = 0; i < data.length; i++) {
    let s = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * preset.decayShape));
    if (body === 'crackle' && i < 40) s *= 1.6; // sharp attack transient
    data[i] = s;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = preset.filter;
  // Heavier = lower center; the spread is randomized per hit for texture.
  const freqDown = 1 - 0.5 * weight;
  filter.frequency.value = Math.max(80, (preset.baseFreq + Math.random() * preset.freqSpread) * freqDown);
  filter.Q.value = preset.q;
  const gain = audioCtx.createGain();
  gain.gain.value = Math.min(0.35, strength * preset.gainScale);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start();
  // Chime bodies (glass, crystal, sealed resin) layer a decaying sine
  // partial ~an octave below the filter center — the resonance that
  // separates "glass rings" from "wood knocks" without recording samples.
  if (preset.partial) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = filter.frequency.value * 0.55;
    const oscGain = audioCtx.createGain();
    const startAt = audioCtx.currentTime;
    oscGain.gain.setValueAtTime(gain.gain.value * 0.4, startAt);
    oscGain.gain.exponentialRampToValueAtTime(0.0005, startAt + durSec);
    osc.connect(oscGain).connect(audioCtx.destination);
    osc.start();
    osc.stop(startAt + durSec);
  }
}
// Back-compat alias — every legacy call site still passes just strength;
// the drain in stepPlayback below is the one that resolves the voice.
function playClick(strength) { playImpact(strength, null); }

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
// {mesh, chip, t, y0}. `mesh` MAY be null — a marker-only record (a shelf
// cluster with no dice left on the felt) rides the same sink timer to keep
// its chip fade dt-driven without stealing another record's mesh ref.
let sinking = [];
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

// `set` is the roll's dice-set id (Tier 6 §9) — secrecy outranks identity:
// a shrouded die is obsidian no matter whose it is. Unknown ids fall back
// to std (an old log entry can outlive a renamed set).
// Which set a given die of a ROLL wears (§9 mixed pools): per-die `sets`
// (aligned to the BASE dice) outranks the roll-level `set`; explosion /
// advantage / reroll extras chase perDie provenance to their base die — the
// child of an iron die is iron. 'std' pins Standard for that die.
function rollDieSet(roll, i) {
  let j = typeof i === 'number' && i >= 0 ? i : -1;
  let guard = 0;
  while (j >= 0 && roll.perDie && roll.perDie[j] && guard++ < 8) {
    const pd = roll.perDie[j];
    const p = [pd.childOf, pd.pairOf, pd.rerollOf].find((x) => x !== null && x !== undefined);
    if (p === undefined || p === null || p === j) break;
    j = p;
  }
  const v = j >= 0 && roll.sets && typeof roll.sets[j] === 'string' ? roll.sets[j] : null;
  return v || (typeof roll.set === 'string' ? roll.set : null);
}

// The entry-side twin: log entries carry provenance as parts[i].origin.
function entryDieSet(entry, i) {
  let j = typeof i === 'number' && i >= 0 ? i : -1;
  let guard = 0;
  while (j >= 0 && entry.parts && entry.parts[j]
    && entry.parts[j].origin !== null && entry.parts[j].origin !== undefined
    && entry.parts[j].origin !== j && guard++ < 8) {
    j = entry.parts[j].origin;
  }
  const v = j >= 0 && entry.sets && typeof entry.sets[j] === 'string' ? entry.sets[j] : null;
  return v || (typeof entry.set === 'string' ? entry.set : null);
}

function dieVariant(shrouded, set) {
  if (shrouded) return 'shroud';
  return set && SETS[set] ? set : 'std';
}

// The RATE GRAPH is set-identity, and set-identity for a mixed pool is
// undefined (heartwood cushions the fall — but a heartwood die tumbling
// beside a boltglass die cannot cushion just half the pool). Same rule
// as the singular vs per-die `set` field: only a uniformly-overridden
// roll wins its set's rate curve; anything mixed rides the default
// cadence. Shrouded rolls never do — obsidian has no identity to
// broadcast, and playback stays exactly what it was pre-slice.
function uniformRollRate(roll) {
  if (!roll || !roll.dice || !roll.dice.length) return null;
  if (roll.dice[0].shrouded) return null;
  const first = rollDieSet(roll, 0);
  if (!first) return null;
  for (let i = 1; i < roll.dice.length; i++) {
    if (rollDieSet(roll, i) !== first) return null;
  }
  const set = SETS[first];
  return set && set.rate && typeof set.rate.rate === 'number' && typeof set.rate.window === 'number'
    ? set.rate : null;
}

function spawnDie(type, index, count, side, rng, shrouded = false, set = null) {
  const variant = dieVariant(shrouded, set);
  const mesh = createDieMesh(type, variant);
  const body = createDieBody(type, diceMat);

  // line the throw up along the chosen edge of the table. The clamp is
  // tighter than TABLE_W so the outer dice never spawn inside a wall at
  // the CLOSE preset (TABLE_W=18: TABLE_W-4.4=13.6, still ample).
  const spread = Math.min(TABLE_W - 4.4, count * 2.6);
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
  return { type, mesh, body, variant };
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
  dieLights.releaseAll(); // the sweep takes every glow with it
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
  hideBanner();
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
    if (s.mesh) {
      s.mesh.position.y = s.y0 - p * 2.4;
      s.mesh.scale.setScalar(1 - 0.35 * p);
    }
    if (s.t >= CLEAR_SINK_S) anyDone = true;
  }
  if (!anyDone) return;
  sinking = sinking.filter((s) => {
    if (s.t < CLEAR_SINK_S) return true;
    // Geometry/materials are shared per die type (js/dice.js cache): drop the
    // mesh from the scene and dispose nothing. `mesh` may be null for a
    // marker-only sink record — skip it in that case.
    if (s.mesh) scene.remove(s.mesh);
    if (s.chip) s.chip.remove();
    return false;
  });
}

// Instantly flush any in-flight sinks (table reset / full sweep).
function finishSinkingNow() {
  for (const s of sinking) {
    if (s.mesh) scene.remove(s.mesh);
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
    dieLights.release(d.mesh); // a departing die takes its glow with it
    sinking.push({ mesh: d.mesh, chip: d.chipEl || null, t: 0, y0: d.mesh.position.y });
  }
  return true;
}

// A roll was cleared ('roll-cleared' event, or the local solo path). If this
// client is still playing that roll back — or has it queued — removal defers
// until its own playback settles (§7.5); the pending clear runs from the
// completion paths (stepPlayback's showResults / ceremonyFinish).
function applyClearRoll(rollId) {
  cancelAutoCollect(rollId);
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
  // rides its OWN sink record so stepSinking fades and drops it dt-driven —
  // never overwrite a die's chip ref (that stranded the die's chip in the
  // DOM, growing #chips-layer forever on endurance runs, Tier 0e).
  const cluster = shelfClusters.get(rollId);
  if (cluster) {
    shelfClusters.delete(rollId);
    if (cluster.markerEl) {
      cluster.markerEl.classList.add('chip-clearing');
      if (hadDice) sinking.push({ mesh: null, chip: cluster.markerEl, t: 0, y0: 0 });
      else cluster.markerEl.remove();
    }
    // The shelf closes up behind it: everything newer slides one slot left.
    reflowShelf();
    renderShelfMarkers();
  }
  // The moment leaves with its dice: banner and verdict card for THIS roll
  // close everywhere. Other rolls' surfaces are untouched.
  if (lastEntry && lastEntry.rollId === rollId) hideBanner();
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
function spawnShelvedDie(type, value, rollId, shrouded = false, set = null) {
  const variant = dieVariant(shrouded, set);
  const mesh = createDieMesh(type, variant);
  const body = createDieBody(type, diceMat);
  body.mass = 0;
  body.type = CANNON.Body.STATIC;
  body.updateMassProperties();
  world.addBody(body);
  scene.add(mesh);
  const die = { type, mesh, body, rollId, shelfValue: value, shelfSpawn: true, shrouded, variant };
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
    // The shelf is the archive: lights live on FELT dice only, so a
    // collect puts the flame out (release is a no-op for unlit dice —
    // reflows and reconstructions pass through here too).
    dieLights.release(d.mesh);
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
    dice = entry.parts.map((p, i) => {
      const shrouded = hidden || p.value == null;
      return spawnShelvedDie(p.type, shrouded ? shroudPoseValue(p.type) : p.value, rollId, shrouded, entryDieSet(entry, i));
    });
  } else {
    return; // nothing to show yet; the state row reconciles on the next hello
  }

  shelfClusters.set(rollId, {
    rollId, seq, slot: -1, placed: false, diceCount: dice.length, markerEl: null, glow: false,
  });
  // The moment leaves the felt surfaces: banner and verdict card for THIS
  // roll close everywhere; the log line and the marker carry it from here.
  if (lastEntry && lastEntry.rollId === rollId) hideBanner();
  if (stagedVerdict && stagedVerdict.entry.rollId === rollId
      && !ceremonyLayer.classList.contains('hidden')) {
    dismissCeremonyUI();
  }
  reflowShelf(animate);
  renderShelfMarkers();
  tryFlushZoom(); // a deferred zoom rides the shelf boundary too
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

// L6 (Tier 0e endurance): the four marker listeners attach ONCE per element
// via a factory and read `el.dataset.rollId` at fire time. renderShelfMarkers
// only mutates dataset/title in place — a marker's lifetime spans cluster
// join to leave, not one render — so a hundred re-renders of the same five
// clusters do not accrete 100×5×4 handler closures on the shelf layer.
function createShelfMarker() {
  const el = document.createElement('div');
  el.className = 'shelf-marker';
  // REACHABLE (U22, audit D5). These were tabindex-less, unlabelled <div>s,
  // which made the table's whole history a flat 2.1.1 failure — and once a
  // roll is shelved the peek is the ONLY door to Reveal, so a keyboard
  // player could not reveal their own held roll at all. role=button + a tab
  // stop + Enter/Space is the same door the click already opens; the NAME is
  // written per-render, where the roll it stands for is known.
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    const rid = el.dataset.rollId;
    if (!rid) return;
    if (peekRollId === rid) closePeek();
    else openPeek(rid);
  });
  el.addEventListener('pointerenter', (ev) => {
    if (ev.pointerType === 'mouse' && el.dataset.rollId) schedulePeekOpen(el.dataset.rollId);
  });
  el.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType === 'mouse') schedulePeekClose();
  });
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t instanceof HTMLElement && t.closest('button')) return;
    if (lp.took()) return; // a long-press already opened the tweaks popover
    const rid = el.dataset.rollId;
    if (!rid) return;
    if (peekRollId === rid) closePeek();
    else openPeek(rid);
  });
  // Look up at fire time (not render time): rolls that drop out of the
  // 100-entry log between render and right-click resolve to null here, and
  // canReroll(null) short-circuits — no popover, no crash.
  const openTweaks = () => {
    const rid = el.dataset.rollId;
    const entry = rid ? log.find((e) => e.rollId === rid) : null;
    if (entry && canReroll(entry)) openShelfPopover(entry, rid);
  };
  // U12: the touch twin. Without it a shelved roll's tweaked reroll was
  // unreachable on iOS, where a long press never produces `contextmenu`.
  const lp = attachLongPress(el, openTweaks);
  el.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    lp.clear(); // Android fires this first — one door wins
    openTweaks();
  });
  return el;
}

function renderShelfMarkers() {
  // Reap orphaned markers (a cluster departed): a marker's classList carries
  // '.shelf-marker' — filter by it so future overlays on shelfLayer don't get
  // pruned. Mid-fade markers are NOT ours to wipe: an eviction is
  // 'roll-cleared' immediately followed by 'roll-collected', so removing them
  // here would pop the departing marker out of existence a millisecond into
  // its sink — stepSinking drops them when their dice are gone.
  const liveIds = new Set(shelfClusters.keys());
  for (const el of [...shelfLayer.children]) {
    if (!el.classList.contains('shelf-marker')) continue;
    if (el.classList.contains('chip-clearing')) continue;
    const rid = el.dataset.rollId;
    if (!rid || !liveIds.has(rid)) el.remove();
  }
  const clusters = [...shelfClusters.values()].sort((a, b) => a.seq - b.seq);
  for (const c of clusters) {
    // Reuse: the marker's four listeners stay pinned to this element for its
    // whole cluster lifetime. `!isConnected` covers the full-sweep reset path
    // (line ~811/817) — cluster.clear() nulls c.markerEl transitively but the
    // guard is defensive either way.
    let el = c.markerEl;
    if (!el || !el.isConnected) {
      el = createShelfMarker();
      c.markerEl = el;
      shelfLayer.appendChild(el);
    }
    el.dataset.rollId = c.rollId;
    const entry = log.find((e) => e.rollId === c.rollId) || null;
    // A held roll's Reveal lives in its peek card: the shelf is where a held
    // roll spends its life (auto-collect fires on ANYONE's next roll), and
    // the peek renders Reveal for the authority (the server enforces it
    // regardless) — the resting marker stays a quiet dot either way.
    el.title = entry && entry.playerName ? `${entry.playerName} · ${entry.label}`
      : entry ? `${entry.label}`
      : 'Collected roll';
    // The NAME, and it has to say what pressing does — `title` alone never
    // reached the accname algorithm here and the marker had no text at all,
    // so the shelf announced as five identical unlabelled buttons. A held
    // roll says so, because that is the one whose card holds Reveal.
    const held = entry && entryHidden(entry);
    el.setAttribute('aria-label', `${el.title}${held ? ' — hidden' : ''}. Open this roll's card.`);
  }
  positionShelfMarkers();
  // An open peek re-reads whatever changed here — a reveal, a lens toggle, a
  // reflowed slot — or closes if its roll just left the shelf.
  renderPeek();
}

// The shelf tweak path (card ± retired 2026-08-01): right-click a cluster
// or its open card. The roll's own notation (comment intact) when we have
// it; else the canonical reconstruction from the spec the viewer may read.
function openShelfPopover(entry, rollId) {
  const raw = entry.notation && parseNotation(entry.notation).ok ? entry.notation
    : canonicalWithVis(entry.spec, {
      dc: Number.isInteger(entry.dc) ? entry.dc : null,
      exp: entry.spec.exp || null,
      faceDown: entry.faceDown,
    }, entryVis(entry));
  openPeek(rollId); // the popover anchors to the card; the peek pins while it lives
  openPopover({
    source: 'shelf',
    raw,
    name: entry.label || '',
    rollId,
    row: peekEl,
  });
}

// A marker fully UNDER the open Pools panel must not eat the panel's
// clicks (table labels ride above panels in the z ladder for the edge-
// overlap case, not for full occlusion). The panel rect is CACHED — it
// changes only on panel toggles and resizes; positionShelfMarkers runs
// every frame and must never force layout (see measurePeek's warning).
// (The old marker-vs-panel occlusion rect is GONE, 2026-08-04: the side
// panel is layout, not overlay — nothing panel-shaped can stand over the
// felt, so a marker can never be under it.)

function positionShelfMarkers() {
  const v = TMP_V1;
  const v2 = TMP_V2;
  for (const c of shelfClusters.values()) {
    if (!c.markerEl) continue;
    v.set(shelfSlotX(c.slot), SHELF_MARKER_Y, SHELF_Z);
    v.project(camera);
    const px = view.left + (v.x * 0.5 + 0.5) * view.width;
    const py = (-v.y * 0.5 + 0.5) * view.height;
    c.markerEl.style.left = `${px}px`;
    c.markerEl.style.top = `${py}px`;
    // The invisible target covers what the eye reads as the cluster: the
    // same radius the under-glow paints, projected to pixels (cached — the
    // radius only changes on reflow; drawShelfGlow refreshes the cache).
    if (!c.glowR) c.glowR = clusterGlowRadius(c);
    v2.set(shelfSlotX(c.slot) + c.glowR, SHELF_MARKER_Y, SHELF_Z).project(camera);
    const d = Math.max(44, Math.round(Math.abs(v2.x - v.x) * view.width));
    if (c.markerPx !== d) {
      c.markerPx = d;
      c.markerEl.style.width = `${d}px`;
      c.markerEl.style.height = `${d}px`;
    }
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

const PEEK_HOVER_MS = 0;     // the peek opens the moment the pointer arrives
const PEEK_CLOSE_MS = 220;   // grace to cross from marker into the card
const peekEl = document.getElementById('peek-card');
// U12: the peek's touch twin, attached ONCE. The card re-renders on every
// open, so attaching per render would stack a timer per visit; the action is
// read live from whatever the current render installed.
let peekTweaksNow = null;
const peekLp = attachLongPress(peekEl, () => { if (peekTweaksNow) peekTweaksNow(); });
let peekRollId = null;       // rollId of the open peek, or null
// THE ONE-✕ RULE (Joe, 2026-08-03): a collected roll has exactly ONE
// reachable clear affordance, chosen by the gesture that opened the card.
// 'hover' (or a pin) → the marker's sweep dress is the big red target and
// the card carries NO ✕; 'tap' → there is no hover to dress the circle, so
// the card's base ✕ IS the big red one (and the sweep is display:none on
// coarse pointers anyway). Before this, PEEK_HOVER_MS=0 opened the peek on
// the same pointer beat that dressed the sweep — two targets for one verb,
// the exact thing §7.9's 'never a second smaller target' contract bans.
// (peekVia / sweepUnavailable retired 2026-08-03: the card's BODY is the
// one clear target in every modality — the folded-card grammar — so no
// gesture tracking decides which affordance exists.)
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
  if (peekPinned()) return; // an open shelf popover holds the card (Esc peels it first)
  cancelPeekTimers();
  peekRollId = null;
  peekEl.classList.add('hidden');
  peekEl.textContent = '';
}

// Open (or retarget) the peek for a shelved roll. False for anything not on
// the shelf — a peek without a cluster has no slot to anchor to.
function openPeek(rollId) {
  if (!shelfClusters.has(rollId)) return false;
  // While the shelf popover is pinned to THIS card, another marker's hover
  // must not swap the card out from under it — the popover would keep
  // acting on the old roll while the card showed the new one.
  if (peekPinned() && rollId !== peekRollId) return false;
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

// The peek PINS while its own ± popover lives: pointer-leave and click-away
// must not sweep the card out from under an open editor. closePopover
// releases the pin; the next leave closes the card normally.
function peekPinned() {
  return !!(pop && pop.source === 'shelf' && peekRollId !== null);
}

// Rebuild the open card's content from the log entry (the same source the
// banner and log line read). Face-down unrevealed: '?' plus the marker's
// Reveal affordance for the roller — no values leak.
function renderPeek() {
  if (peekRollId === null) return;
  const c = shelfClusters.get(peekRollId);
  if (!c) {
    // The roll died under the card (remote clear, ⟳ replace, peek ✕): a
    // pinned peek must not zombie — release the pin (close its popover)
    // BEFORE closing, or closePeek's pin guard makes both immortal.
    if (peekPinned()) closePopover();
    closePeek();
    return;
  }
  const entry = log.find((e) => e.rollId === peekRollId) || null;
  const hidden = !entry || entryHidden(entry);
  peekEl.textContent = '';

  // THE FOLDED CARD, shelf edition (Joe 2026-08-03: 'roughly the same as
  // the roll reveal panel'): the card's BODY stays a clear target — click
  // clears for everyone (§7.7: tidying a collected roll is anyone's
  // housekeeping; the server still enforces it) — but the named ✕ Clear in
  // the fold is what ADVERTISES the act now (2026-08-07). The body keeps no
  // role/tabindex/title: it is a shortcut, and the bar below is the control.
  const main = document.createElement('div');
  main.className = 'pk-main';
  const rid = c.rollId;
  // The pin release must happen before the roll dies, or a pinned peek
  // outlives its own cluster (the immortal-peek trap this file warns about).
  const peekClear = (btn) => {
    if (peekPinned()) closePopover();
    runCardClear(rid, btn, closePeek);
  };
  main.addEventListener('click', () => peekClear(null));

  // header: the BANNER's identity treatment (Joe 2026-08-04, panel
  // parity) — the roller's name in their color carries the who; the old
  // color dot was redundant beside it
  const head = document.createElement('div');
  head.className = 'pk-head';
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
  main.appendChild(head);

  const total = document.createElement('div');
  total.className = 'pk-total';
  let peekRows = false; // per-die rows rendered (2e) — the breakdown folds
  if (!entry) total.textContent = '?';
  else if (hidden) {
    // U17 step 2: a totals lens still answers with the `?` it has always
    // used — there IS a number and it is withheld. A per-die lens has no
    // number to withhold, so it names the state instead of miming a blank.
    if (activeSystem().usesTotal) total.textContent = '?';
    else { total.textContent = heldWord(entry); total.classList.add('pk-held'); }
  } else if (renderOutcomeRows(total, entry)) {
    peekRows = true;
    total.classList.add('pk-tally', 'pk-outcomes'); // per-die: outcomes, not a sum
  } else {
    // The sum fallback was ungated — unreachable under a per-die lens only
    // by accident (outcomesFor happens to answer for any visible roll with a
    // counting die). An all-child or all-discarded pool would have printed a
    // total the system does not compute.
    total.textContent = activeSystem().usesTotal ? String(entry.total) : '';
  }
  main.appendChild(total);

  const verdict = document.createElement('div');
  verdict.className = 'pk-verdict';
  if (entry && Number.isInteger(entry.dc)) {
    // U17: stakes are public on every visibility rung AND under every system
    // (goal 11 for the first, the stake/adjudication split for the second).
    const adjudicated = activeSystem().usesTotal && !hidden;
    stakeInto(verdict, entry, adjudicated);
    if (adjudicated) {
      const cleared = entry.total >= entry.dc;
      verdict.append(` — ${cleared ? 'Success' : 'Failure'}`);
      verdict.classList.add(cleared ? 'verdict-success' : 'verdict-fail');
    }
  }
  main.appendChild(verdict);

  const bd = document.createElement('div');
  bd.className = 'pk-breakdown';
  // 2e: the rows already carry every source and face — the breakdown line
  // only renders where the rows don't (sum systems, hidden rolls).
  if (entry && !peekRows) renderBreakdown(bd, entry, hidden);
  main.appendChild(bd);
  peekEl.appendChild(main);

  // The FOLD: the named primary plus the banner's action set below a
  // hairline crease — ✕ Clear standing, REROLL ❯❯❯ on approach, Reveal
  // standing for a hidden roll. No die art on the strip (user call,
  // 2026-07-31: the actual dice sit right under this card); the reroll
  // REPLACES the shelved cluster. The card ± stays on right-click.
  // The peek's primary is ALWAYS red Clear — a collected roll belongs to
  // the table, not to its roller (§7.7's documented asymmetry).
  if (entry) {
    const fold = document.createElement('div');
    fold.className = 'pk-fold';
    appendCardActions(fold, entry, {
      revealClass: 'sm-reveal pk-reveal', // the one Reveal dress, small size
      replaceShelfId: c.rollId,
      verb: 'clear',
      onPrimary: peekClear,
      // Not here: the peek's OWN popover already carries 'Save as pool…',
      // and the keep verb is the door TO that popover. Standing it on the
      // peek would be a button that opens the thing it is standing in.
      keepable: false,
    });
    peekEl.appendChild(fold); // never empty now: the primary always stands
  }
  const peekTweaks = entry && canReroll(entry) ? () => openShelfPopover(entry, c.rollId) : null;
  peekEl.oncontextmenu = peekTweaks ? (ev) => {
    ev.preventDefault();
    if (peekLp) peekLp.clear(); // Android fires this first — one door wins
    peekTweaks();
  } : null;
  // U12: the touch twin, attached ONCE to the element rather than per render
  // (the peek re-renders on every open, and a listener per open would stack
  // one timer per visit). The action it fires is read live from the closure
  // the current render installed.
  peekTweaksNow = peekTweaks;

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
  const ax = view.left + (v.x * 0.5 + 0.5) * view.width;
  const ay = (-v.y * 0.5 + 0.5) * view.height;
  const w = peekW;
  const h = peekH;
  const left = Math.max(8, Math.min(ax - w / 2, window.innerWidth - w - 8));
  let top = ay - 24 - h; // clear air over the cluster (panel-parity pass)
  if (top < 8) top = ay + 24; // clipped above: sit below the marker instead
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
  if (peekPinned() && t instanceof HTMLElement && t.closest('#mods-popover')) return;
  closePeek();
});

// A roll was collected ('roll-collected' event, the solo mirror, or a hello
// resync with animate=false). Mid-playback / queued rolls defer their whisk
// exactly as clears defer — always-interruptible playback keeps the stage,
// and the collect lands from the completion paths (runPendingCollect).
function applyRollCollected(rollId, seq, animate = true) {
  cancelAutoCollect(rollId);
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
  cancelAutoCollect();
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
  hideBanner();
  dismissCeremonyUI(); // a lingering verdict card/decal yields to the new roll

  // --- spawn with seeded throw params -------------------------------------
  const rng = mulberry32(roll.seed >>> 0);
  const side = Math.floor(rng() * 4);
  const dice = types.map((t, i) => spawnDie(t, i, types.length, side, rng, shrouded, rollDieSet(roll, i)));
  // Every die on the table is tagged with its roll (§7.5): a per-roll Done
  // removes exactly these dice and never touches a concurrent roll's.
  for (const d of dice) {
    d.rollId = roll.rollId || null;
    d.shrouded = shrouded;
  }
  tableDice.push(...dice);

  // Level 4b: a lit set's dice carry their glow from the throw. Shroud
  // outranks identity (an obsidian die casts nothing), and the phases use
  // their OWN seeded stream — every client flickers identically without
  // perturbing the throw physics' draws.
  if (!shrouded) {
    const lightRng = mulberry32((roll.seed ^ 0x9e3779b9) >>> 0);
    dice.forEach((d, i) => {
      // per die (§9 mixed pools): each die carries ITS set's glow; the rng
      // stream stays shared, and identical sets arrays on every client
      // keep the draws — and therefore the phases — in lockstep
      const ds = rollDieSet(roll, i);
      const rec = ds && SETS[ds] ? SETS[ds].light : null;
      if (rec) dieLights.attach(d.mesh, rec, lightRng);
    });
  }

  // --- synchronous fast-forward, recording keyframes + sound events -------
  const sounds = []; // {time, strength, at, di}
  const bodyDie = new Map(dice.map((d, i) => [d.body, i]));
  let simTime = 0;
  const recordCollision = (e) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 2 && sounds.length < 400) {
      // The contact point rides along (Level 3): playback fires the set's
      // particle burst exactly where the click sound says the die hit —
      // and WHICH die (§9 mixed pools: the burst wears that die's set;
      // die-die contacts credit bi, deterministically, on every client).
      const c = e.contact;
      const s = c.bi.type === CANNON.Body.DYNAMIC ? { b: c.bi, r: c.ri } : { b: c.bj, r: c.rj };
      sounds.push({
        time: simTime,
        strength: v,
        at: [s.b.position.x + s.r.x, s.b.position.y + s.r.y, s.b.position.z + s.r.z],
        di: bodyDie.get(s.b) ?? null,
      });
    }
  };
  for (const d of dice) d.body.addEventListener('collide', recordCollision);

  const snapshot = (d) => ({
    pos: new THREE.Vector3().copy(d.body.position),
    quat: new THREE.Quaternion().copy(d.body.quaternion),
  });
  const keyframes = dice.map((d) => [snapshot(d)]);

  // Perf pass §0a (Commit A — per-die settle): each die freezes into a STATIC
  // mass-0 body the moment it lands clean, so a group of 40 dice no longer
  // waits on the slowest tumbler and its keyframe array stops allocating.
  // The cached `frozenPose` is shared BY REFERENCE across every subsequent
  // push, preserving the invariant that `keyframes[i].length` is uniform and
  // `kf[kf.length - 1]` is the final pose — face correction runs unchanged.
  // Cocked dice stay dynamic (their `stillTime` triggers the same nudge
  // branch); SETTLE_CAP is retained as last-resort safety at the group level.
  dice.forEach((d) => { d.stillTime = 0; d.frozen = false; d.frozenPose = null; });

  const freezeInPlace = (d) => {
    d.body.velocity.setZero();
    d.body.angularVelocity.setZero();
    d.body.mass = 0;
    d.body.type = CANNON.Body.STATIC;
    d.body.updateMassProperties();
    d.body.sleep(); // belt + suspenders; SAP-friendly
    d.frozen = true;
    d.frozenPose = snapshot(d); // reused every subsequent step; no alloc
  };

  let nudges = 0;
  for (;;) {
    world.step(FIXED_DT);
    simTime += FIXED_DT;

    // Per-die stillness accumulator + freeze test. Thresholds match the old
    // group predicate verbatim (do NOT tune here). Cocked dice never freeze —
    // they stay dynamic until the nudge branch below lands them clean or
    // SETTLE_CAP fires.
    for (const d of dice) {
      if (d.frozen) continue;
      const stillNow =
        d.body.velocity.lengthSquared() < 0.05 &&
        d.body.angularVelocity.lengthSquared() < 0.05;
      d.stillTime = stillNow ? d.stillTime + FIXED_DT : 0;
      if (d.stillTime >= SETTLE_STILL) {
        const r = readValue(d.type, d.body.quaternion);
        const cocked = r.dot < (d.type === 'd4' ? 0.9 : 0.82);
        if (!cocked) freezeInPlace(d);
      }
    }

    dice.forEach((d, i) => keyframes[i].push(d.frozen ? d.frozenPose : snapshot(d)));

    const allSettled = dice.every((d) => d.frozen);
    if (!allSettled && simTime < SETTLE_CAP) {
      // Nudge cocked dice that have accumulated enough stillTime to be judged
      // stuck. Frozen bodies are STATIC — filter them out (waking a static is
      // a no-op at best, a determinism hazard at worst).
      const cocked = dice.filter((d) => !d.frozen && d.stillTime >= SETTLE_STILL);
      if (cocked.length && nudges < 3) {
        nudges++;
        for (const d of cocked) {
          d.body.wakeUp();
          d.body.velocity.set((rng() - 0.5) * 4, 7, (rng() - 0.5) * 4);
          d.body.angularVelocity.set((rng() - 0.5) * 14, (rng() - 0.5) * 14, (rng() - 0.5) * 14);
          d.stillTime = 0;
        }
      }
      continue;
    }
    // SETTLE_CAP fired with dice still dynamic → force-freeze so the block
    // below has a stable pose to correct. Same STATIC/mass=0 transition the
    // clean-landing branch uses; face correction rotates each to its
    // server-declared value regardless of the pre-freeze orientation.
    for (const d of dice) if (!d.frozen) freezeInPlace(d);
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
    // Slice 3: seed the settled-die cadence off the FINAL pose (stepResting
    // reads d.finalPos/d.finalQuat live, so a later reveal correction at
    // beginRevealFlip becomes the new baseline for free — no re-init).
    initRest(d, roll, i);
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

  // Level 5: a ring set's shock wave fires ONCE, from the roll's hardest
  // recorded landing (never a gentle one — the pop needs a slam), at the
  // moment the drain replays that impact.
  let ringIdx = null;
  if (!shrouded) {
    // per die (§9): the hardest landing AMONG ring-set dice — a std die's
    // slam can't pop a bolt-glass discharge
    let best = 10;
    sounds.forEach((s, i) => {
      if (!s.at || s.strength <= best) return;
      const ds = rollDieSet(roll, s.di);
      const post = ds && SETS[ds] ? SETS[ds].post : null;
      if (post && post.ring) { best = s.strength; ringIdx = i; }
    });
  }

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
    // reroll provenance (B3): server-substantiated; entryFromRoll reads it
    // off currentRoll at completion, so dropping it here unmarks the roll
    rerollOfId: typeof roll.rerollOfId === 'string' ? roll.rerollOfId : null,
    // dice-set identity (Tier 6 §9): the burst drain and entryFromRoll read it
    set: typeof roll.set === 'string' ? roll.set : null,
    sets: Array.isArray(roll.sets) && roll.sets.length ? roll.sets : null, // per-die (§9 mixed pools)
    seed: roll.seed,
    dice,
    keyframes,
    sounds,
    frames: keyframes[0].length,
    duration: (keyframes[0].length - 1) * FIXED_DT,
    time: 0,
    soundIdx: 0,
    decalsStamped: 0, // Level 4a per-roll cap counter (the drain reads it)
    ringIdx,          // Level 5: which sound event carries the shock ring
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
  const spec = { dice: [...types], mods: opts.mods || null };
  if (opts.sources) spec.sources = [...opts.sources]; // 2b-⑤ attribution
  // Reroll provenance (B3), the same substantiation the server does,
  // against the only history we have. Solo has no secret (requestRoll:
  // secret/whisper act as OPEN), so existence is the whole gate.
  const rerollOfId = typeof opts.rerollOfId === 'string'
    && log.some((e) => e.rollId === opts.rerollOfId) ? opts.rerollOfId : null;
  playRoll({
    ...composed,
    rollId: `solo-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    spec,
    dc: Number.isInteger(opts.dc) ? opts.dc : null,
    exp: opts.exp || null,
    faceDown: !!opts.faceDown,
    revealed: !opts.faceDown,
    rerollOfId,
    set: rollSetOf(opts) || null, // solo throws wear your set — or the pool's own (§9)
    sets: Array.isArray(opts.sets) && opts.sets.some(Boolean) ? opts.sets.map((s) => s || null) : null,
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
  // RATE GRAPH (Slice 2, Joe 2026-08-04): a per-set retiming curve for
  // the LAST `window` fraction of the roll. Same seat as cinematic
  // slow-mo — pure playback-clock scaling, physics untouched, face
  // correction untouched. The die decelerates into its final pose so
  // "living wood cushions the fall" (heartwood: vine-catch), "cold
  // arrests motion" (deepglacier: glacial), "state moves slowly"
  // (oxblood: ceremonial) read AS MOTION — not just as material.
  //
  // Mixed pools: use the roll's OWN dice — if every die shares one set,
  // that set's rate wins; a mixed roll rides the default cadence (a
  // rate curve is set-identity, and a mixed pool has none). This is the
  // same "uniformly overridden" rule that gated singular vs per-die set
  // decisions elsewhere in the file.
  const rate = uniformRollRate(roll);
  if (rate && roll.duration > 0) {
    const remainingFrac = 1 - roll.time / roll.duration;
    if (remainingFrac > 0 && remainingFrac < rate.window) {
      const t = remainingFrac / rate.window; // 0 at settle, 1 at window entry
      step *= rate.rate + (1 - rate.rate) * t;
    }
  }
  roll.time += step;

  const last = roll.frames - 1;
  const f = Math.min(roll.time, roll.duration) * 60;
  const i0 = Math.min(Math.floor(f), last);
  const i1 = Math.min(i0 + 1, last);
  const frac = Math.min(Math.max(f - i0, 0), 1);

  const dArr = roll.dice;
  const kfs = roll.keyframes;
  for (let di = 0; di < dArr.length; di++) {
    const kf = kfs[di];
    const a = kf[i0];
    const b = kf[i1];
    const d = dArr[di];
    d.mesh.position.copy(a.pos).lerp(b.pos, frac);
    d.mesh.quaternion.copy(a.quat).slerp(b.quat, frac).multiply(d.correction);
  }

  // Impact drain: sounds and (for a themed roll) the set's particle bursts
  // and felt marks ride the same recorded events — same moment, same
  // point, same strength. A shrouded roll stays silent on identity:
  // obsidian sheds nothing, marks nothing, casts nothing.
  const rollShrouded = roll.dice.length > 0 && roll.dice[0].shrouded === true;
  while (roll.soundIdx < roll.sounds.length && roll.sounds[roll.soundIdx].time <= roll.time) {
    const sIdx = roll.soundIdx;
    const s = roll.sounds[roll.soundIdx++];
    // Effects resolve per SOUND now (§9 mixed pools): each recorded contact
    // knows which die hit (s.di), so an iron die sparks while its glass
    // companion doesn't — in the same roll.
    const ds = rollShrouded ? null : rollDieSet(roll, s.di);
    const fxSet = ds && SETS[ds] ? SETS[ds] : null;
    // IMPACT VOICE (Slice 1): a set may declare a per-impact voice that
    // replaces the default click. A shrouded roll stays silent on
    // identity — obsidian rings like the legacy click (fxSet is null for
    // shrouded above, so voice falls back to the default).
    playImpact(s.strength, fxSet && fxSet.sound ? fxSet.sound : null);
    if (fxSet && fxSet.particles && s.at) particleField.burst(fxSet.particles, s.at, s.strength);
    // Marks want floor contacts with real force, and only so many per
    // roll — the felt remembers the landing, not every tremble.
    if (fxSet && fxSet.decal && s.at && s.at[1] < DECAL_MAX_CONTACT_Y
      && s.strength >= DECAL_MIN_STRENGTH && roll.decalsStamped < DECAL_CAP_PER_ROLL) {
      roll.decalsStamped += decalField.stamp(fxSet.decal, [s.at[0], DECAL_Y, s.at[2]], s.strength);
    }
    // Level 5: the pre-picked hardest RINGING landing pops ITS die's ring
    if (sIdx === roll.ringIdx && fxSet && fxSet.post && fxSet.post.ring) {
      postStack.ring(s.at, camera, fxSet.post.ring);
    }
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
    else tryFlushZoom();     // a room-wide zoom that arrived mid-roll lands here
  }
}

// ---------------------------------------------------------------------------
// Results, effects
// ---------------------------------------------------------------------------

const chipsLayer = document.getElementById('chips-layer');
const banner = document.getElementById('result-banner');
// Banner cells hoisted alongside `banner` — same pattern as chipsLayer/peekEl.
// renderRollResults and renderBannerActions repaint on every roll arrival; the
// static banner-main click wiring below reuses bannerMainEl too so the whole
// banner surface is one place, one lookup (Tier 0 §0a hot-paths consistency).
const resultLabelEl     = document.getElementById('result-label');
const resultTotalEl     = document.getElementById('result-total');
const resultMeaningEl   = document.getElementById('result-meaning');
const resultBreakdownEl = document.getElementById('result-breakdown');
const resultVerdictEl   = document.getElementById('result-verdict');
const bannerActionsEl   = document.getElementById('banner-actions');
const bannerMainEl      = document.getElementById('banner-main');
// THE ONE ANNOUNCEMENT CHANNEL (U5). #banner-live lived inside the result
// banner, so a ceremony — which returns into ceremonyEnterSettle before
// showResults and never paints that banner — announced NOTHING. Every Check
// and every Cinematic, the rolls that carry a DC, a moment and a subtitle,
// landed silent. This node is at the body root, always mounted, never
// `hidden`: a live region that is hidden at the moment it is written is out
// of the accessibility tree exactly when it has something to say, which is
// the same reason railNote's whispers never announced either.
const srLiveEl = document.getElementById('sr-live');
// Re-announce identical text by nudging the node: assigning the same string
// is a no-op to the a11y tree, and two identical rolls in a row is ordinary.
let lastAnnounced = '';
function announce(text) {
  const msg = String(text || '').trim();
  if (!srLiveEl || !msg) return;
  srLiveEl.textContent = msg === lastAnnounced ? `${msg}\u200B` : msg;
  lastAnnounced = msg;
}

// One clean way to hide the banner (Tier 0 §0e endurance leak): the roll-dice
// outline is anchored to the banner (mouseenter paints it, mouseleave clears
// it), so any code path that yanks the banner out from under a hovering
// pointer used to leave the outline meshes attached to the felt dice — no
// mouseleave ever fires. Every site that hides the banner now routes through
// here, and outlineRollDice(false) runs FIRST (idempotent on empty outlined,
// so a stray call is harmless). Callers work whether or not the class was
// already set — classList.add is idempotent too.
function hideBanner() {
  outlineRollDice(false);
  banner.classList.add('hidden');
}

// Auto-collect (2026-08-01, Joe): a finished roll of YOURS tidies itself to
// the shelf after a quiet moment — roll, read, and it moves aside on its
// own; Enter (keep now) and Esc (sweep) stay the fast paths. Hidden rolls
// wait for their reveal (standing tension is the point), spectators never
// collect for the roller, and hovering the banner holds the timer — you
// are reading. Tests run with it off (__diceTestMode) and opt in via the
// setAutoCollectMs hook; 0 disables. 3 s since 2026-08-03 (Joe: 6 felt
// far too slow; the hover-hold covers the long reads).
let autoCollectMs = (typeof window !== 'undefined' && window.__diceTestMode) ? 0 : 3000;
let autoCollect = { rollId: null, timer: null };
function cancelAutoCollect(rollId = null) {
  if (rollId && autoCollect.rollId !== rollId) return;
  clearTimeout(autoCollect.timer);
  autoCollect = { rollId: null, timer: null };
}
function armAutoCollect(entry) {
  if (!autoCollectMs || !entry || !entry.rollId) return;
  if (entry.revealed === false || entryHidden(entry)) return; // reveal re-arms
  const mine = !netOnline || (net && entry.playerId === net.playerId);
  if (!mine) return;
  cancelAutoCollect();
  autoCollect.rollId = entry.rollId;
  const fire = () => {
    const rid = autoCollect.rollId;
    if (rid !== entry.rollId) return; // cancelled or superseded while queued
    const last = lastRollActionable(); // re-checks mine + settled + still on felt
    if (last && last.rollId === rid) {
      autoCollect = { rollId: null, timer: null };
      requestCollectRoll(rid);
      return;
    }
    // Not actionable YET vs never again: a clock that fired while the dice
    // were still landing (slow frame pump, an early banner repaint) used to
    // give up FOREVER and strand the roll on the felt — the timing decided.
    // Only a resolved/superseded roll stops the clock; in-flight retries.
    const st = rollStates.get(rid);
    const gone = !lastEntry || lastEntry.rollId !== rid
      || !!(st && (st.cleared || st.collected !== null));
    // Bounded (adversarial catch): physics that never settles must not
    // retry forever — ~9s past due covers any real tumble; past it the
    // roll simply stays for the player to tidy (the pre-retry behavior).
    if (gone || ++fire.tries > 60) { autoCollect = { rollId: null, timer: null }; return; }
    autoCollect.timer = setTimeout(fire, 150);
  };
  fire.tries = 0;
  autoCollect.timer = setTimeout(fire, autoCollectMs);
}
// Reading holds the clock; leaving restarts it whole. A thumb reads too:
// touch fires no mouseenter, so without the pointer pair the tidy-away
// clock collects the roll out from under whoever is still reading it.
banner.addEventListener('mouseenter', () => clearTimeout(autoCollect.timer));
banner.addEventListener('mouseleave', () => { if (lastEntry) armAutoCollect(lastEntry); });
banner.addEventListener('pointerdown', () => clearTimeout(autoCollect.timer));
for (const ev of ['pointerup', 'pointercancel']) {
  banner.addEventListener(ev, () => { if (lastEntry) armAutoCollect(lastEntry); });
}

// ---------------------------------------------------------------------------
// Roll outlines (Joe 2026-08-03): the card's removal highlight doubles as a
// READ — hovering the result card outlines THAT roll's dice on the felt,
// one color per source pool, so the highlight teaches which scattered dice
// belong to the roll and which pool each came from. Inverted-hull outlines:
// a back-face shell 7% larger than the die, sharing its geometry (never
// dispose the geometry — only the shell's own material), riding as a child
// so every transform is inherited. Colors avoid gold (the roll verb's) and
// red (removal's); unsourced dice wear quiet ivory. A hidden roll's spec is
// withheld, so its sources are unknowable here — every die outlines ivory,
// and the outline leaks nothing (which dice belong to a roll is public).
// ---------------------------------------------------------------------------
const OUTLINE_COLORS = ['#7fd1c3', '#b48ede', '#e0a458', '#8fc97f', '#6fa8dc', '#d97fa8'];
let outlined = []; // [{mesh, shell}] — cleared on unhover and every repaint
function outlineRollDice(on) {
  for (const o of outlined) {
    o.mesh.remove(o.shell);
    o.shell.material.dispose();
  }
  outlined = [];
  // A hidden banner cannot own the outline (Tier 0 §0e endurance leak): a
  // mouseenter that raced with a banner hide used to strand shell meshes on
  // the dice. The clear loop above always runs first, so a stray on=true
  // after the banner is already down still wipes anything present — then we
  // decline to paint fresh outlines against a card the reader cannot see.
  if (!on || !lastEntry || !currentRoll || currentRoll.rollId !== lastEntry.rollId
      || banner.classList.contains('hidden')) return;
  const entry = lastEntry;
  const srcColor = new Map();
  const colorFor = (i) => {
    const s = partSource(entry, i);
    if (!s) return '#f3ead7';
    if (!srcColor.has(s)) srcColor.set(s, OUTLINE_COLORS[srcColor.size % OUTLINE_COLORS.length]);
    return srcColor.get(s);
  };
  currentRoll.dice.forEach((d, i) => {
    if (!d.mesh || !entry.parts[i]) return;
    const shell = new THREE.Mesh(
      d.mesh.geometry,
      new THREE.MeshBasicMaterial({ color: colorFor(i), side: THREE.BackSide }),
    );
    shell.scale.setScalar(1.07);
    d.mesh.add(shell);
    outlined.push({ mesh: d.mesh, shell });
  });
}
banner.addEventListener('mouseenter', () => outlineRollDice(true));
banner.addEventListener('mouseleave', () => outlineRollDice(false));
banner.addEventListener('focusin', () => clearTimeout(autoCollect.timer));
banner.addEventListener('focusout', () => { if (lastEntry) armAutoCollect(lastEntry); });
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
  // U19: only the authority, and only while they are still here. The id is
  // minted per join, so a dropped stream past the grace window leaves a roll
  // nobody can flip — the server would 403 it. Advertising a Reveal that
  // cannot work is worse than not advertising one: the roll can still be
  // CLEARED by anyone once its roller is gone, which is the recovery.
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

// The active profile (interface v2, meanings.js): every surface reads the
// roll through it — aggregate per-die/sum, usesTotal/usesMods gates,
// outcomesFor. Interpretation stays a render-time lens.
function activeSystem() { return SYSTEMS[currentSystemId]; }

// RETIRED (U17 step 4, 2026-08-08). `meaningFor` was the sum-world hero word,
// and after the meanings migration ALL THREE profiles defined it as
// `() => null` — so this returned null on every path, and five render
// branches, two CSS tiers and the whole of UX §2.5's hero-slot ruling were
// unreachable code describing a feature that no longer existed. The chart
// word still reaches the screen, through outcomesFor → renderOutcomeRows;
// it never came through here. Deleted rather than left as a null-returning
// stub, because a stub is what let the dead branches look alive.


// Per-die outcomes (Soul Deal's corrected read — meanings.js): N dice, N
// words; quiet dice carry word null. Null under sum systems or hidden rolls.
function entryOutcomes(entry) {
  if (!entry || entryHidden(entry)) return null;
  const sys = activeSystem();
  return sys.outcomesFor ? sys.outcomesFor(entry) : null;
}

// THE STAKE AND THE HELD WORD (U17). A stake is a condition of the moment the
// player DECLARED — the target, the title, the mechanics deciding which dice
// count. Its ADJUDICATION — comparing a result against it — is arithmetic and
// renders only where the system makes a single number to compare. The two
// never share a slot, and the question at every site is "did the player type
// this, or did we compute it?".
const heldWord = (entry) => (entry && entry.visMode === 'whisper' ? 'Whispered' : 'Face down');

// One string, four surfaces, no system in it — deliberately. Unadjudicated,
// the numeral takes the ivory evidence register; adjudicated, it reads as
// part of the verdict sentence that follows it.
function stakeInto(el, entry, adjudicated) {
  el.append('vs DC ');
  if (adjudicated) { el.append(String(entry.dc)); return; }
  const n = document.createElement('span');
  n.className = 'stake-num';
  n.textContent = String(entry.dc);
  el.appendChild(n);
}

// The tally line: outcomes folded to '2× Success · Blemish', first-seen
// order, quiet dice counted separately only when EVERY die was quiet.
function tallyOutcomes(outcomes) {
  const counts = new Map();
  for (const o of outcomes) {
    if (!o.word) continue;
    if (!counts.has(o.word)) counts.set(o.word, { word: o.word, tier: o.tier, n: 0 });
    counts.get(o.word).n++;
  }
  return [...counts.values()];
}

// Per-die SOURCE pools (ROADMAP 2b-⑤), derived render-side from the
// entry's own notation — the wire stays untouched; the notation IS the
// attribution. spec.sources aligns to the BASE dice (parts[0..n-1] are the
// spec's dice in order); extras — advantage partners, rerolls, explosion
// children — chase their part's `origin` back to a base die, so a reroll
// of a Wisdom die still answers to Wisdom.
const entrySourcesMemo = new WeakMap();
function entrySources(entry) {
  if (!entry) return null;
  // The spec is the wire's own copy (server parseNotationSpec keeps it,
  // solo rollDice stores it); parsing entry.notation is the fallback for
  // entries that only carry the string.
  const s = entry.spec && Array.isArray(entry.spec.sources) ? entry.spec.sources : null;
  if (s && s.some(Boolean)) return s;
  if (typeof entry.notation !== 'string') return null;
  if (entrySourcesMemo.has(entry)) return entrySourcesMemo.get(entry);
  const res = parseNotation(entry.notation);
  const out = res.ok && res.spec.sources ? res.spec.sources : null;
  entrySourcesMemo.set(entry, out);
  return out;
}
function partSource(entry, i) {
  const src = entrySources(entry);
  if (!src) return null;
  let idx = i;
  for (let hops = 0; idx != null && idx >= src.length && hops < 8; hops++) {
    const p = entry.parts[idx];
    const origin = p && p.origin != null && p.origin !== idx ? p.origin : null;
    if (origin === null) return null;
    idx = origin;
  }
  return idx != null && idx < src.length ? src[idx] || null : null;
}

function entryCrit(entry) {
  if (entryHidden(entry)) return null;
  return activeSystem().critFor(entry);
}

// Does this crit get the TABLE-STOPPING ceremony — the full-viewport wash and
// the 1700ms camera shake — or only its word? (U18.) The profile decides;
// one that stays silent always washes, which is right for a one-die verdict.
// Kept separate from entryCrit because the word is INFORMATION and the wash
// is emphasis, and U8 already established that reduced motion drops the
// second without touching the first. This is the same seam, for frequency
// instead of for motion.
function entryCritCeremony(entry) {
  const kind = entryCrit(entry);
  if (!kind) return null;
  const sys = activeSystem();
  return (!sys.critCeremony || sys.critCeremony(entry)) ? kind : null;
}

// The crit overlay's word: the crit die's own chart word, else the
// natural-roll callout. (Its first branch read a sum-world `meaning` that
// every profile has returned null for since the meanings migration —
// retired with that channel in U17 step 4.)
// The overlay's word never claims dice that were not rolled: 'Natural 20'
// belongs to pools whose counting dice include a d20; anything else that
// crits naturally reads the plain truth. (The old unconditional fallback
// painted 'Natural 20' over a 2d6 check — the worst place to be wrong.)
function critWord(crit, entry) {
  // Per-die systems: the crit die's own chart word is the fanfare.
  const os = entryOutcomes(entry) || [];
  const critDie = os.find((o) => o.tier === (crit === 'success' ? 'crit-success' : 'crit-fail'));
  if (critDie) return critDie.word;
  const hasD20 = !!(entry && entry.parts
    && entry.parts.some((p) => p.type === 'd20' && p.counts && !p.child));
  if (hasD20) return crit === 'success' ? 'Natural 20' : 'Natural 1';
  return crit === 'success' ? 'Perfect Roll' : 'Worst Roll';
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
        counts: true, reason: null, child: false, origin: null,
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
      // provenance (2b-⑤): the base die this extra descends from — an
      // advantage partner, a reroll replacement, or an explosion child
      origin: [pd.pairOf, pd.rerollOf, pd.childOf]
        .find((x) => x !== null && x !== undefined) ?? null,
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
    // reroll provenance (B3): present-or-absent, the notation idiom above
    rerollOfId: typeof roll.rerollOfId === 'string' ? roll.rerollOfId : undefined,
    // dice-set identity (Tier 6 §9): shelf reconstruction re-skins from this
    set: typeof roll.set === 'string' ? roll.set : undefined,
    sets: Array.isArray(roll.sets) && roll.sets.length ? roll.sets : undefined, // per-die (§9)
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

  // Per-die outcomes tint the chips (Soul Deal): each die's word rides its
  // chip's title and its tier colors the border — the read at a glance.
  const outcomes = entryOutcomes(entry);
  const oMap = new Map((outcomes || []).map((o) => [o.dieIndex, o]));
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
    const o = oMap.get(i);
    const src = hidden ? null : partSource(entry, i);
    if (o && o.word && !hidden) {
      cls += ` chip-${o.tier}`;
      el.title = src ? `${src} \u2014 ${o.word}` : o.word;
    } else if (src) {
      el.title = src; // sum systems: the chip still says which pool it serves
    }
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
  // U17 step 3: this line ends in `= <sum>`, so it is arithmetic. It is
  // reachable under a per-die lens whenever outcomesFor returns null on a
  // VISIBLE roll — an all-child or all-discarded pool — which is the corner
  // both the audit and two of the three design stances missed.
  if (mods.length && !activeSystem().usesTotal) return;

  const partSpan = (p) => {
    const s = document.createElement('span');
    let cls = p.counts && p.isMax ? 'crit-max' : p.counts && p.isMin ? 'crit-min' : '';
    if (!p.counts) cls += ' log-discarded';
    s.className = cls.trim();
    s.textContent = `${p.child ? '✴' : ''}${p.type} ${p.label}`;
    return s;
  };
  // Source-grouped read (2b-⑤): 'WISDOM d8 7 + d8 2 · SWORDS d6 4' — each
  // pool's dice cluster under its label; unsourced dice stand plain.
  const sourced = entrySources(entry);
  if (sourced) {
    const order = [];
    const byKey = new Map();
    entry.parts.forEach((p, i) => {
      const k = partSource(entry, i) || '';
      if (!byKey.has(k)) { byKey.set(k, []); order.push(k); }
      byKey.get(k).push(p);
    });
    order.forEach((k, gi) => {
      if (gi) el.append('  \u00b7  ');
      if (k) {
        const l = document.createElement('span');
        l.className = 'log-part-label';
        l.textContent = `${k} `;
        el.appendChild(l);
      }
      byKey.get(k).forEach((p, j) => {
        if (j) el.append(' + ');
        el.appendChild(partSpan(p));
      });
    });
  } else {
    entry.parts.forEach((p, i) => {
      if (i) el.append(' + ');
      el.appendChild(partSpan(p));
    });
  }

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
// Render a per-die outcome tally into `el` as tier-colored spans:
// '2× Success · Blemish' — the per-die hero line wherever the sum-world
// total/meaning slots would have spoken. Empty (and hidden) when the
// active system is a sum system or every die was quiet.
function renderTally(el, entry) {
  el.textContent = '';
  const outcomes = entryOutcomes(entry);
  if (!outcomes) return false;
  if (!tallyOutcomes(outcomes).length) {
    el.textContent = 'a quiet roll'; // every die landed a null cell
    el.className = el.className.replace(/tier-\S+/g, '').trim();
    return true;
  }
  // Source-grouped read (2b-⑤): 'WISDOM Success · SWORDS 2× Fail' — each
  // pool answers separately; a pool whose dice all landed null cells says
  // 'quiet' rather than vanishing (its answer IS the silence).
  const groups = [];
  if (entrySources(entry)) {
    const byKey = new Map();
    for (const o of outcomes) {
      const k = partSource(entry, o.dieIndex) || '';
      if (!byKey.has(k)) { byKey.set(k, { label: k, os: [] }); groups.push(byKey.get(k)); }
      byKey.get(k).os.push(o);
    }
  } else {
    groups.push({ label: '', os: outcomes });
  }
  groups.forEach((g, gi) => {
    if (gi) el.append('  ·  '); // text-layer separator, same as the breakdown
    const gEl = document.createElement('span');
    gEl.className = 'tally-group';
    if (g.label) {
      const l = document.createElement('span');
      l.className = 'tally-src';
      l.textContent = `${g.label} `; // real space: the grouping must survive copy/paste
      gEl.appendChild(l);
    }
    const tally = tallyOutcomes(g.os);
    if (!tally.length) {
      const q = document.createElement('span');
      q.className = 'tally-quiet';
      q.textContent = 'quiet';
      gEl.appendChild(q);
    } else {
      tally.forEach((t, i) => {
        if (i) gEl.append(' · ');
        const s = document.createElement('span');
        s.className = `tier-${t.tier}`;
        s.textContent = t.n > 1 ? `${t.n}× ${t.word}` : t.word;
        gEl.appendChild(s);
      });
    }
    el.appendChild(gEl);
  });
  return true;
}

// 2e — THE ORGANIZED PER-DIE READ (Joe 2026-08-03: the reveal surfaces got
// muddled — the tally line and the breakdown line repeated the same source
// labels at the same weight, and reading WHICH die said WHAT meant
// cross-referencing the two). One structure instead of two: each pool is a
// ROW — its label leading, then one CHIP per die [dX face → outcome word,
// tier-colored]. The word is the answer, the die+face is the evidence
// beside it, and the separate breakdown line folds away wherever the rows
// stand. The text layer keeps the read (audit rule): every chip carries
// real text ('d8 7 Success'), every row leads with its pool, so copy/paste
// and screen readers get the per-pool, per-die story line by line.
//
// THE LEDGER (2i-A, the Soul Deal audit): sourced reads share ONE label
// column — the container turns grid (`oc-ledger`), the label spine
// right-aligned beside left-aligned dice cells, and each row's chips live
// in their own `.oc-cell`, so a wrapped chip wraps INSIDE its pool's cell
// (the hanging indent is structural; an orphan chip can never float free
// of its label). Unlabeled rolls keep the centered read. Quiet grammar:
// beside worded dice a quiet die's answer slot carries an explicit dash —
// in the DOM, so copy and screen readers read the silence too; an
// ALL-quiet pool says 'quiet' once instead and its chips stay bare (dash
// and word together would mark the same silence twice). One-die rolls
// wear `oc-solo`: the single answer word IS the verdict, at hero scale.
function renderOutcomeRows(el, entry) {
  el.textContent = '';
  const outcomes = entryOutcomes(entry);
  if (!outcomes) return false;
  const groups = [];
  if (entrySources(entry)) {
    const byKey = new Map();
    for (const o of outcomes) {
      const k = partSource(entry, o.dieIndex) || '';
      if (!byKey.has(k)) { byKey.set(k, { label: k, os: [] }); groups.push(byKey.get(k)); }
      byKey.get(k).os.push(o);
    }
  } else {
    groups.push({ label: '', os: outcomes });
  }
  // Callers add their surface classes AFTER this render (classList.add,
  // never className =), so the ledger mark set here survives.
  el.classList.toggle('oc-ledger', groups.some((g) => g.label));
  for (const g of groups) {
    const row = document.createElement('div');
    row.className = 'tally-group outcome-row';
    if (outcomes.length === 1) row.classList.add('oc-solo');
    if (g.label) {
      const l = document.createElement('span');
      l.className = 'tally-src';
      l.textContent = `${g.label} `; // real space: the grouping survives copy/paste
      row.appendChild(l);
    }
    const cell = document.createElement('span');
    cell.className = 'oc-cell';
    const worded = tallyOutcomes(g.os).length > 0;
    for (const o of g.os) {
      const chip = document.createElement('span');
      chip.className = 'oc-chip' + (o.word ? ` oc-b-${o.tier}` : ' oc-quiet');
      const ev = document.createElement('span');
      ev.className = 'oc-die';
      ev.textContent = `${o.type} ${o.value}`; // the evidence, in the text layer
      chip.appendChild(ev);
      if (o.word) {
        chip.append(' ');
        const w = document.createElement('span');
        w.className = `oc-word tier-${o.tier}`;
        w.textContent = o.word;
        chip.appendChild(w);
      } else if (worded) {
        chip.append(' ');
        const dash = document.createElement('span');
        dash.className = 'oc-dash';
        dash.textContent = '—'; // the silence, in the text layer
        chip.appendChild(dash);
      }
      cell.appendChild(chip);
      cell.append(' '); // copyable separator (flex ignores whitespace boxes)
    }
    if (!worded) {
      const q = document.createElement('span');
      q.className = 'tally-quiet';
      q.textContent = 'quiet'; // the pool's answer IS the silence (§7.9)
      cell.appendChild(q);
    }
    row.appendChild(cell);
    el.appendChild(row);
  }
  return true;
}

function renderRollResults(entry, dice, fx = true) {
  renderChips(entry, dice);
  outlineRollDice(false); // a repaint resets the hover read (re-enter restores)
  const hidden = entryHidden(entry);

  // Names and labels are user-supplied: textContent only, never innerHTML.
  resultLabelEl.textContent = '';
  if (entry.playerName) {
    const who = document.createElement('span');
    who.className = 'roller-name';
    if (entry.color) who.style.color = entry.color;
    who.textContent = entry.playerName;
    resultLabelEl.append(who, ` · ${entry.label}`);
  } else {
    resultLabelEl.textContent = entry.label;
  }

  // Under a per-die system a sum is not a fact of play: the big number
  // yields the hero slot to the outcome ROWS (usesTotal, meanings.js v2).
  // U17 step 2: the ONLY 52px gold number a Soul Deal table ever saw was a
  // `?` — the roll verb's own hue (#ffd766 is literally the ROLL cue's
  // colour), springing to life for no purpose but to announce an absence,
  // with nothing beside it saying why. The slot now belongs to the sum and
  // to nothing else: it renders where a sum exists and is gone otherwise.
  // The write moves INSIDE the gate too — it used to put entry.total in the
  // DOM on every paint under every system, withheld only by display:none.
  const sysTotals = activeSystem().usesTotal;
  resultTotalEl.style.display = sysTotals ? '' : 'none';
  if (sysTotals) resultTotalEl.textContent = hidden ? '?' : entry.total;
  else resultTotalEl.textContent = '';

  // The hero slot (2e): per-die systems render the outcome ROWS — pool by
  // pool, die by die — and the separate breakdown line folds away (it
  // repeated every source and face the rows already carry; that duplication
  // was the muddle). Sum systems keep the meaning word + breakdown pair.
  resultMeaningEl.className = ''; // reset FIRST: renderOutcomeRows marks oc-ledger
  const perDieRows = !hidden && renderOutcomeRows(resultMeaningEl, entry);
  if (perDieRows) {
    resultMeaningEl.classList.add('result-tally', 'result-outcomes');
    resultMeaningEl.title = 'each die reads its own outcome — the die and face beside each word';
  } else if (hidden) {
    // …and the hero slot SAYS the state instead. The banner was the one
    // surface that never named it: the verdict card and the log both do.
    resultMeaningEl.textContent = heldWord(entry);
    resultMeaningEl.className = 'held';
    resultMeaningEl.title = '';
  } else {
    resultMeaningEl.textContent = '';
    resultMeaningEl.className = '';
    resultMeaningEl.title = '';
  }
  if (perDieRows) resultBreakdownEl.textContent = '';
  else renderBreakdown(resultBreakdownEl, entry, hidden);

  // Interim dc verdict (fixed decision): above the meaning word, gold/red.
  // Hidden result, public stakes (goal 11): the DC still shows, the verdict
  // waits for the reveal.
  if (Number.isInteger(entry.dc)) {
    // U17: the STAKE renders under every system; only its adjudication is
    // gated. A per-die table typed a target and the banner showed nothing.
    resultVerdictEl.textContent = '';
    resultVerdictEl.className = '';
    const adjudicated = sysTotals && !hidden;
    stakeInto(resultVerdictEl, entry, adjudicated);
    if (adjudicated) {
      const cleared = entry.total >= entry.dc;
      resultVerdictEl.append(` — ${cleared ? 'Success' : 'Failure'}`);
      resultVerdictEl.className = cleared ? 'verdict-success' : 'verdict-fail';
    }
  } else {
    resultVerdictEl.textContent = '';
    resultVerdictEl.className = '';
  }

  banner.classList.remove('hidden', 'crit-success', 'crit-fail');
  // One composed sentence per result, into a node that holds nothing else.
  // aria-live on the body itself would re-announce on every incidental
  // repaint (a room-wide system change repaints five cells) and can speak a
  // half-built card; this speaks once, when a result actually lands.
  announce([
    entry.playerName || null,
    entry.label || null,
    // The MODE, not a guess at it: this said 'held' for a whisper too, so the
    // one channel a blind player has used the wrong rung's word.
    hidden ? (entryVis(entry) ? entryVis(entry).mode : 'hidden')
      : (activeSystem().usesTotal ? String(entry.total) : null),
    resultVerdictEl.textContent || null,
  ].filter(Boolean).join(' — '));
  renderBannerActions(entry);
  armAutoCollect(entry); // every banner paint restarts the tidy-away clock
  const crit = entryCrit(entry);
  // The banner's own dress follows the READING — a crit landed, and the
  // banner says so under every pool size. Only the wash is rationed (U18).
  const wash = fx && entryCritCeremony(entry);
  if (crit === 'success') {
    banner.classList.add('crit-success');
    if (wash) playCritEffect('success', critWord(crit, entry));
  } else if (crit === 'fail') {
    banner.classList.add('crit-fail');
    if (wash) playCritEffect('fail', critWord(crit, entry));
  }
}

// THE result card's one action set (2026-08-01, Joe: 'why are the options
// any different at all?'). Every result surface — the banner over the felt,
// the peek over the shelf, and since 2i-C the ceremony verdict card too —
// builds its FOLD verbs here: the bare REROLL ❯❯❯ strip (again) and Reveal
// (a hidden roll's completing verb, standing for the authority alone). One
// builder, one dress per verb; the old static verdict ⟳/Reveal row was a
// design split that was also a code split.
//
// The deliberate asymmetries (surface truth, not drift):
//   · the peek's reroll REPLACES its shelved cluster (Joe's rule: reroll,
//     not a copy); the banner's and the verdict's let the old roll shelve
//     itself on arrival
//   · every surface's primary act is BUILT here now (2026-08-07) and named:
//     the banner and verdict say Clear or Dismiss by role, the peek always
//     says Clear (a collected roll is the table's housekeeping, §7.7), and
//     the verdict says Skip while its beat still runs. The card body stays
//     a clear target on all three — it just stopped being the only one.
// THE NAMED VERB (Joe 2026-08-07: "the 'x' on the main body is probably too
// non-intuitive… we need that to remain the main action but find a better
// UX"). The body stays a clear target — the biggest one on the card — but it
// stops being the ADVERTISED one. A card's primary act now says its own name
// in the fold, standing at full opacity, first in the tab order, wide enough
// that hierarchy comes from AREA rather than from being redder than its
// neighbours. Hover on the body lights that bar instead of painting a 72px ✕
// watermark nobody asked to learn: the shortcut now teaches the word.
//
// One dress per verb still holds (2i-C) — red destroys, steel is a tool —
// and `skip` is here because completing a ceremony beat and clearing the
// roll are never one gesture (§7.16): mid-beat the ceremony card's primary
// says what the press will actually do.
const CARD_VERBS = {
  clear:   { word: 'Clear',   glyph: '✕',  sentence: 'Clear this roll for everyone' },
  dismiss: { word: 'Dismiss', glyph: '✕',  sentence: 'Dismiss — hides this for you; the dice stay until the roller acts' },
  skip:    { word: 'Skip',    glyph: '❯❯', sentence: 'Skip to the result' },
};

function buildPrimaryAct(opts) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card-act';
  const glyph = document.createElement('span');
  glyph.className = 'card-act-x';
  glyph.setAttribute('aria-hidden', 'true'); // the WORD is the accessible name
  const word = document.createElement('span');
  word.className = 'card-act-w';
  btn.append(glyph, word);
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // never let the card body's shortcut fire twice
    opts.onPrimary(btn);
  });
  return btn;
}

function paintPrimaryAct(btn, key) {
  const v = CARD_VERBS[key] || CARD_VERBS.dismiss;
  btn.dataset.verb = key;
  btn.firstElementChild.textContent = v.glyph;
  btn.lastElementChild.textContent = v.word;
  btn.title = v.sentence;
  btn.setAttribute('aria-label', v.sentence);
}

// Was the roll mine? Solo has no one else, so every roll is. Extracted from
// the two inline copies (renderBannerActions, renderVerdictCard) now that
// updateCardActions needs the same question.
function isMine(entry) {
  return !netOnline || !!(net && entry && entry.playerId === net.playerId);
}

// THE TABLE'S OFFER, said once per room (ROADMAP C10). A returning player
// joins straight through — no picker — so nothing ever tells them the table
// is holding characters. The switcher over the rack has listed them since
// C17; this is what points at it.
//
// Dismissal is per ROOM and persists, so a player who said "not now" is not
// asked again all evening. It clears itself when there is nothing to offer,
// so a table that gains characters later can still speak up.
const LS_OFFER_SEEN = 'dice.offerseen.v1';
function offerDismissed() {
  try { return (load(LS_OFFER_SEEN, []) || []).includes(ROOM); } catch { return false; }
}
function dismissOffer() {
  try {
    const seen = load(LS_OFFER_SEEN, []) || [];
    if (!seen.includes(ROOM)) { seen.push(ROOM); save(LS_OFFER_SEEN, seen.slice(-40)); }
  } catch { /* a browser that will not store asks once more; harmless */ }
  updateOfferBanner();
}

function updateOfferBanner() {
  const el = document.getElementById('offer-banner');
  if (!el) return;
  const sys = tableSystem();
  const held = new Set(profilesOf(profileStore).map((p) => p.name.toLowerCase()));
  const offers = netOnline && !offerDismissed()
    ? tableOffers().filter((o) => (!o.rec.system || o.rec.system === sys)
        && !held.has(o.rec.name.toLowerCase()))
    : [];
  el.classList.toggle('hidden', !offers.length);
  if (!offers.length) return;
  // IF ONE OF THEM IS YOU, lead with it. `unclaimedSeats` matches prepared
  // seats against roster NAMES, so a player whose stored name happens to
  // equal a character silently claims that chair on everyone's rail while
  // holding none of its pools — the second half of C10's defect. Naming it
  // here is what turns that collision into an invitation.
  // identityInfo() is the one place the client's own display name is
  // resolved (net does not expose it); reaching for `net.name` read undefined
  // and quietly turned the name-collision case into the generic one.
  const me = ((identityInfo() || {}).name || '').toLowerCase();
  const mine = offers.find((o) => o.rec.name.toLowerCase() === me);
  const label = el.querySelector('.ob-label');
  label.textContent = '';
  const b = document.createElement('b');
  const rest = document.createTextNode('');
  if (mine) {
    b.textContent = mine.rec.name;
    rest.textContent = ` was prepared for you${mine.from === 'prepared' ? '' : ` by ${mine.from}`}.`;
  } else {
    b.textContent = offers.length === 1 ? offers[0].rec.name : `${offers.length} characters`;
    rest.textContent = offers.length === 1
      ? ` is on offer at this table.`
      : ` are on offer at this table.`;
  }
  label.append(b, rest);
}

// Repaint the primary verb on every mounted card, for the one thing that can
// change under a card that is already painted: the roller leaving. Called from
// renderPlayers, which is the roster's single write point.
function repaintAwayVerbs() {
  for (const holder of mountedActionHolders) {
    if (!holder.isConnected || !holder._acts) continue;
    const entry = holder._entry;
    if (!entry || !entry.rollId) continue;
    paintPrimaryAct(holder._acts.primary, holder._verbFor
      ? holder._verbFor(entry)
      : ((isMine(entry) || rollerAway(entry)) ? 'clear' : 'dismiss'));
  }
  // The banner's click handler reads bannerAct, not the button, so the act
  // has to move with the paint or the two disagree.
  if (bannerAct.rollId) {
    const e = log.find((x) => x.rollId === bannerAct.rollId);
    if (e) {
      bannerAct.mode = (isMine(e) || rollerAway(e)) ? 'clear' : 'dismiss';
      // The DRESS moves with the act. A card that says Clear in slate would
      // be a destructive verb painted as a spectator's tidy-away.
      const banner = document.getElementById('result-banner');
      if (banner) banner.dataset.act = bannerAct.mode;
    }
  }
  const vc = document.getElementById('verdict-card');
  if (vc && verdictFoldEl && verdictFoldEl._entry && verdictFoldEl._entry.rollId) {
    const e = verdictFoldEl._entry;
    vc.dataset.act = (isMine(e) || rollerAway(e)) ? 'clear' : 'dismiss';
  }
}

// U19: has the roll's ROLLER LEFT the table? An uncollected roll is normally
// its roller's to end (§7.7), which used to mean a roll from a departed player
// could never be cleared by anyone — it just sat on the felt. The server now
// admits that case, and this is the client half: paint the real red Clear
// instead of a local Dismiss, so the affordance matches what the server allows.
//
// An EMPTY roster means "we don't know yet" (it is emptied on disconnect
// before the next snapshot lands), never "everyone left" — returning false
// there keeps the Dismiss and avoids a red flicker across a reconnect.
function rollerAway(entry) {
  if (!netOnline || !net || !entry || !entry.playerId) return false;
  if (!players.length) return false;
  return !players.some((p) => p.id === entry.playerId);
}

// ONE clear runner for every surface. The re-entrancy guard used to be a
// closure boolean per card — invisible, and duplicated. Now it rides the
// button's own `disabled`, so a press in flight LOOKS spent (2i-C drains hue
// via grayscale) instead of silently swallowing the second click. `btn` is
// null when the press came from a body shortcut, which has no dress to drain.
function runCardClear(rollId, btn, onOk) {
  if (!rollId || (btn && btn.disabled)) return;
  if (btn) btn.disabled = true;
  requestClearRoll(rollId).then((ok) => {
    if (btn) btn.disabled = false;
    if (ok) { if (onOk) onOk(); } else showSettingsNote('couldn’t clear the roll — try again');
  });
}

function appendCardActions(holder, entry, opts) {
  if (opts.onPrimary) {
    const primary = buildPrimaryAct(opts);
    paintPrimaryAct(primary, opts.verb || 'clear');
    holder.appendChild(primary);
  }
  if (canReveal(entry)) {
    const foot = document.createElement('div');
    foot.className = 'banner-foot';
    const btn = document.createElement('button');
    btn.className = opts.revealClass;
    btn.textContent = 'Reveal';
    btn.title = 'Flip this roll face up for the table';
    btn.addEventListener('click', () => requestReveal(entry.rollId));
    foot.appendChild(btn);
    holder.appendChild(foot);
  }
  if (canReroll(entry)) {
    const strip = document.createElement('button');
    strip.className = 'pool-roll pk-again pk-strip pk-bare reveal-tier';
    strip.title = opts.replaceShelfId
      ? 'Reroll these dice — replaces this shelved roll'
      : 'Reroll these dice';
    strip.setAttribute('aria-label', `Reroll — ${entry.label}`);
    // The one strip that REROLLS (both the banner's and the peek's are
    // replays of an existing roll) — the cue word must say so; the draft
    // and the offer claim keep the plain ROLL (B2, Joe 2026-08-03).
    strip.appendChild(buildRollCue('reroll'));
    strip.addEventListener('click', () => {
      if (opts.replaceShelfId) {
        closePeek();
        requestClearRoll(opts.replaceShelfId);
      }
      requestRoll([...entry.spec.dice], entry.label, rerollOpts(entry));
    });
    holder.appendChild(strip);
  }
}

// Persistent-mount variant (Tier 0 §0e endurance / L8): the banner and the
// verdict card repaint on every roll arrival, and every collect-then-reroll
// used to churn appendCardActions — 4 DOM nodes + 2 listeners tossed per
// entry. mountCardActions builds the reveal foot and REROLL ❯❯❯ strip ONCE
// at first update and stashes them on the holder; updateCardActions toggles
// their hidden attribute per render and stamps the live entry on the holder
// for the handlers to close over (a rollId-less entry — e.g. a pre-network
// draft banner — still rerolls because the handler reads holder._entry, not
// a log lookup that would drop it). Peek keeps appendCardActions above
// because its whole card rebuilds per render (see L9).
//
// Mount is LAZY (deferred to the first updateCardActions) because the two
// mount targets sit at module init, well before CUE_WORDS / buildRollCue's
// const dependencies exist in scope. Any renderBannerActions /
// renderVerdictCard call fires on a network/UI event — always after module
// load completes — so first render doubles as the mount trigger.
function mountCardActions(holder, opts) {
  if (holder._cardActionsMounted) return;
  // The primary leads the row: DOM order is tab order is visual order, and
  // the act the player most likely wants is the one their thumb lands on.
  const primary = buildPrimaryAct(opts);
  const foot = document.createElement('div');
  foot.className = 'banner-foot';
  foot.hidden = true;
  const reveal = document.createElement('button');
  reveal.className = opts.revealClass;
  reveal.textContent = 'Reveal';
  reveal.title = 'Flip this roll face up for the table';
  reveal.addEventListener('click', () => {
    const e = holder._entry;
    if (e && e.rollId) requestReveal(e.rollId);
  });
  foot.appendChild(reveal);

  const strip = document.createElement('button');
  strip.className = 'pool-roll pk-again pk-strip pk-bare reveal-tier';
  strip.title = 'Reroll these dice';
  strip.hidden = true;
  strip.appendChild(buildRollCue('reroll'));
  strip.addEventListener('click', () => {
    const e = holder._entry;
    if (!e || !canReroll(e)) return;
    requestRoll([...e.spec.dice], e.label, rerollOpts(e));
  });

  // U13: KEEP THIS ROLL. The only door to "save what I just rolled" was the
  // peek's popover, reached by waiting out the 3s auto-collect, finding an
  // invisible 150-200px disc, and right-clicking it — a gesture that does
  // not exist on iOS at all. This is the same door, opened from a standing
  // control on the card that is already in front of you: no new surface, no
  // second save flow, and the popover keeps being the one place a pool is
  // minted.
  const keep = document.createElement('button');
  // ONE class of its own — not revealClass, because a selector that cannot
  // tell the two verbs apart is a pin that cannot either. It wears the
  // Reveal's exact dress via CSS (quiet steel: keeping a roll is a tool act,
  // and HUE = ACT keeps gold for the roll and red for removal). The first
  // build derived the class by string-stripping revealClass, which left it
  // with no dress at all — a bright white browser-default button between a
  // red Clear and a gold REROLL. Caught by looking, not by any assertion.
  keep.className = 'keep-verb';
  keep.textContent = 'Save as pool…';
  keep.title = 'Keep these dice as a saved pool';
  keep.hidden = true;
  keep.addEventListener('click', () => {
    const e = holder._entry;
    if (e && e.rollId && canReroll(e)) openShelfPopover(e, e.rollId);
  });
  foot.appendChild(keep);

  holder.append(primary, foot, strip);
  holder._entry = null;
  // Named children beat a positional walk: the row's shape is now a fact the
  // update path reads, not a chain of nextElementSibling it has to re-derive.
  holder._acts = { primary, foot, strip, keep, reveal };
  holder._cardActionsMounted = true;
  mountedActionHolders.add(holder);
}

// Every card-actions holder ever mounted. The banner and the verdict card are
// long-lived and PAINT THEIR VERB ONCE, so a roll that becomes clearable while
// it is already on screen (U19: its roller leaves) needs someone to come back
// and repaint. The registry is what lets repaintAwayVerbs find them without
// re-deriving each surface's own opts.
const mountedActionHolders = new Set();

function updateCardActions(holder, entry, opts) {
  if (!holder._cardActionsMounted) mountCardActions(holder, opts);
  holder._entry = entry || null;
  // Kept for the repaint: the verb is a FUNCTION of roster state, not a
  // constant, and the repaint has to ask the same question this call did.
  holder._verbFor = opts.verbFor || null;
  const { primary, foot, strip, keep, reveal } = holder._acts;
  paintPrimaryAct(primary, opts.verbFor
    ? opts.verbFor(entry)
    : (entry && entry.rollId && (isMine(entry) || rollerAway(entry)) ? 'clear' : 'dismiss'));
  const showStrip = canReroll(entry);
  // The keep verb rides the same gate as the reroll strip — both need a spec
  // this viewer can actually read — and the fold now stands for either of
  // its two children rather than for Reveal alone.
  const showKeep = !!(keep && opts.keepable !== false && showStrip);
  const showReveal = canReveal(entry);
  // Each verb owns its own visibility, and the foot stands for EITHER. When
  // the foot alone carried Reveal's gate, adding a second child to it made a
  // face-up roll paint a live Reveal — the exact defect the `hidden` fold
  // shipped once before, caught here by the pins that were written for it.
  if (keep) keep.hidden = !showKeep;
  if (reveal) reveal.hidden = !showReveal;
  foot.hidden = !showReveal && !showKeep;
  strip.hidden = !showStrip;
  if (showStrip) strip.setAttribute('aria-label', `Reroll — ${entry.label}`);
}

// The folded card's BODY act: 'clear' (the roller — for everyone) or
// 'dismiss' (a spectator — locally; the dice stay). Set on every banner
// paint; the static click handler below reads it.
let bannerAct = { mode: 'dismiss', rollId: null };

function renderBannerActions(entry) {
  const hidden = entryHidden(entry);
  // The act itself (the folded card): the roller CLEARS for everyone, a
  // spectator DISMISSES locally. dataset.act still dresses the card — red
  // removal vs muted slate — because the named bar must say WHICH removal
  // it is, and a spectator's slate must never read as destructive.
  bannerAct = {
    mode: entry.rollId && (isMine(entry) || rollerAway(entry)) ? 'clear' : 'dismiss',
    rollId: entry.rollId || null,
  };
  banner.dataset.act = bannerAct.mode;
  // The body carries no title/aria-label any more: it is no longer the
  // announced control, only a shortcut to the one that is. Announcing both
  // would put two names on one act.
  // ONE Reveal dress (2i-C): confirm weight, sized by surface — the gold
  // primary it wore here was the roll verb's hue on a non-roll act.
  // L8: mounted once (lazy, on first call), toggled thereafter — the fold's
  // children never churn per banner paint. opts are consumed at MOUNT only,
  // so onPrimary closes over module-level bannerAct, never over `entry`.
  updateCardActions(bannerActionsEl, entry, {
    revealClass: 'reveal-verb banner-btn',
    verbFor: () => bannerAct.mode,
    onPrimary: (btn) => {
      if (bannerAct.mode === 'clear') runCardClear(bannerAct.rollId, btn);
      else hideBanner();
    },
  });
}

// The body's click — the shortcut, kept because it is the biggest target on
// screen and the hand already knows it. Static wiring; the act itself is
// repainted state (bannerAct). No keydown twin any more: the body is not
// focusable, and the named bar beside it is a real <button> that owns Enter
// and Space natively (the global Enter handler already bails on a focused
// button, and the ceremony's Space branch does the same).
bannerMainEl.addEventListener('click', () => {
  if (bannerAct.mode === 'clear' && bannerAct.rollId) runCardClear(bannerAct.rollId, null);
  else hideBanner();
});

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
      // The reveal is what a hidden card was standing FOR: now readable,
      // it joins the flow to collected (Joe 2026-08-04).
      armCeremonyRetire(stagedVerdict.roll);
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
  // A felt reveal restores each die's LIGHT too (the shroud had smothered
  // it); phases seed off the rollId so every client flickers alike (the
  // shared rng draws in dice order — identical sets arrays keep lockstep).
  let seed = 5381;
  for (const ch of rollId) seed = ((seed * 33) ^ ch.charCodeAt(0)) >>> 0;
  const lightRng = mulberry32(seed);
  let started = false;
  dice.forEach((d, i) => {
    if (!d.shrouded) return;
    d.shrouded = false;
    // Reveal restores each die's OWN set, not bare std (Tier 6 §9, per-die
    // since mixed pools): geometry swaps too — a themed set may wear its
    // own bevel and tumble.
    const ds = entryDieSet(entry, i);
    const die = getDie(d.type, dieVariant(false, ds));
    d.mesh.geometry = die.geometry;
    d.mesh.material = die.materials;
    d.variant = dieVariant(false, ds);
    // the mesh was born shrouded (unflagged): the reveal restores the
    // set's bloom right along with its materials
    const revealSet = ds ? SETS[ds] : null;
    if (revealSet && revealSet.post && revealSet.post.bloom) d.mesh.userData.bloom = true;
    const lightRecipe = revealSet ? revealSet.light : null;
    if (lightRecipe) dieLights.attach(d.mesh, lightRecipe, lightRng);
    // Rest cadence follows the SET, and reveal changed the set — a shrouded
    // die's cadence was locked to shroud (no recipe → still forever). Re-init
    // so a hidden-then-revealed felt die actually breathes with its true
    // set's cadence (seaglass swells, heartwood creaks). Caught by the Slice
    // 3 adversarial pass. Uses the roll's own dice index so seeds match
    // every client rendering this reveal.
    initRest(d, { rollId }, i);
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
      // same rule as beginRevealFlip: the reveal restores each die's OWN set
      const ds = entryDieSet(entry, i);
      const die = getDie(d.type, dieVariant(false, ds));
      d.mesh.geometry = die.geometry;
      d.mesh.material = die.materials;
      d.variant = dieVariant(false, ds);
      const revealSet = ds ? SETS[ds] : null;
      if (revealSet && revealSet.post && revealSet.post.bloom) d.mesh.userData.bloom = true;
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
  const v = TMP_V1;
  for (const { el, die } of chips) {
    v.copy(die.mesh.position);
    v.y += 2.2;
    v.project(camera);
    el.style.left = `${view.left + (v.x * 0.5 + 0.5) * view.width}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * view.height}px`;
  }
}

const critOverlay = document.getElementById('crit-overlay');
const critText = document.getElementById('crit-text');
let critTimer = null;

// Asked once and cached: a player who has told their OS to stop moving things
// has said it about this app too. (matchMedia appeared exactly once in all of
// js/ before this, for navigator.share — the CSS carried the whole policy,
// and a class added from JS is outside what CSS can decline.)
const reduceMotionQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
const prefersReducedMotion = () => !!(reduceMotionQuery && reduceMotionQuery.matches);

function playCritEffect(kind, text) {
  clearTimeout(critTimer);
  critOverlay.className = kind;
  critText.textContent = text;
  // The WORD still lands — a crit is information, not decoration, and
  // dropping it would tell a reduced-motion player less than the table knows.
  // What goes is the 1700ms camera shake on the whole scene (U8): the CSS
  // block that was supposed to cover this scopes to `#ceremony-layer *`, and
  // #scene-container is not in it.
  container.classList.remove('shake');
  if (!prefersReducedMotion()) {
    void container.offsetWidth; // restart animation
    container.classList.add('shake');
  }
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
const CEREMONY_DISMISS_MS = 7000;  // the flow-to-collected clock (hover holds it)
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
  const title = momentTitle(roll); // '' for an untitled check: the felt stays bare
  if (title) applyMatDecal(title);
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
  // U5: a ceremony returns here and never paints #result-banner, so this is
  // the ONLY place its result can be announced. It is the roll carrying a
  // DC, a moment and a subtitle — the one that most owes a sentence — and it
  // was the one that said nothing.
  {
    const vis = entryVis(entry);
    const held = entryHidden(entry);
    announce([
      entry.playerName || null,
      entry.label || null,
      held ? (vis ? vis.mode : 'hidden')
        : (activeSystem().usesTotal ? String(entry.total) : null),
      Number.isInteger(entry.dc) ? `target ${entry.dc}` : null,
    ].filter(Boolean).join(' — '));
  }

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
    // The CARD's gold dress is the reading and stays universal; the
    // full-viewport wash and the camera shake are what U18 rations.
    ceremonyLayer.classList.add('crit');
    if (entryCritCeremony(cer.entry)) playCritEffect(crit, critWord(crit, cer.entry));
  }
  renderVerdictCard(roll, cer.entry);
  setCeremonyPhaseClass(roll, 'c-verdict');
}

// THE FLOW TO COLLECTED (Joe 2026-08-04: 'cinematics have too many
// stages… the normal reveal is unnecessary — just flow to collected').
// When the card's clock runs out, the roll goes STRAIGHT to the shelf:
// the roller's client collects (server-marked, broadcast — shelveRoll
// closes every client's card), a spectator's card just retires locally
// (the roller's collect will move the dice they see). The old handoff
// into the standing banner — a whole extra stage to dismiss — is gone.
// A HIDDEN roll never flows: the card stands until its reveal re-arms
// the clock (the tension is the point — §7.9's tidy-away rule).
// Returns whether a handoff happened (the debug hook reads it).
function retireCeremonyFlow(roll) {
  const sv = stagedVerdict;
  if (!sv || !sv.entry) { dismissCeremonyUI(); return true; }
  const entry = sv.entry;
  const st = entry.rollId ? rollStates.get(entry.rollId) : null;
  if (st && (st.cleared || st.collected !== null)) { dismissCeremonyUI(); return true; }
  if (entryHidden(entry)) return false; // stands until the reveal
  const mine = !netOnline || (net && entry.playerId === net.playerId);
  lastEntry = entry; // Enter/Esc act on this roll while (and after) it flows
  if (entry.rollId && mine) {
    requestCollectRoll(entry.rollId); // shelveRoll dismisses the card on echo
    return true;
  }
  dismissCeremonyUI(); // spectator: local retire only — the dice stay
  return true;
}

// Arm (or re-arm) the flow clock for a standing verdict card. Hidden rolls
// never arm — the reveal repaint re-arms them; hovering the card holds the
// clock exactly like hovering the banner holds the tidy-away.
function armCeremonyRetire(roll) {
  clearTimeout(ceremonyDismissTimer);
  ceremonyDismissTimer = null;
  if (!roll || !roll.ceremony || roll.ceremony.phase !== 'done') return;
  if (!stagedVerdict || !stagedVerdict.entry) return;
  if (entryHidden(stagedVerdict.entry)) return;
  ceremonyDismissTimer = setTimeout(() => retireCeremonyFlow(roll), CEREMONY_DISMISS_MS);
}

function ceremonyFinish(roll) {
  const cer = roll.ceremony;
  if (cer.phase === 'done') return;
  cer.phase = 'done';
  roll.done = true;
  runPendingReveal(roll);  // a reveal that arrived mid-ceremony lands now
  runPendingCollect(roll); // a collect that arrived mid-ceremony lands now
  runPendingClear(roll);   // …and a clear wins over it
  // AFTER the pendings: a collect/clear that just landed dismissed the card
  // (stagedVerdict null → the arm no-ops), and a landed reveal means the
  // clock arms against the readable entry.
  armCeremonyRetire(roll);
  // The word has to catch up with the beat: while the moment ran, the card's
  // primary said SKIP. It has just stopped running, so repaint before the
  // queue can move — playRoll() below calls dismissCeremonyUI(), which nulls
  // stagedVerdict, and a repaint after that either no-ops or paints a
  // superseded roll's verdict over the incoming one.
  if (stagedVerdict) renderVerdictCard(stagedVerdict.roll, stagedVerdict.entry);
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

// ARITHMETIC vs SELECTION (U17 step 3). The flat bonus is a term in a sum and
// renders only where the sum does. Advantage, keep/drop, reroll and explode
// are SELECTION — they decide which dice land and which count, which is a
// fact under every system: soul-deal's own outcomesFor filters on
// `p.counts && !p.child`, and its forecastFor REFUSES to pre-read keep/drop
// precisely because of it. `usesMods:false` was suppressing attribution the
// same profile treats as load-bearing, against GOALS' Attributed math
// invariant — and the one member that conflated the two is now deleted.
function preModChips(mods, opts = {}) {
  if (!mods) return [];
  const out = [];
  const parts = Array.isArray(mods.parts) ? mods.parts.filter((p) => p.value) : null;
  if (opts.arithmetic) {
    if (parts && parts.length) {
      for (const p of parts.slice(0, 4)) out.push({ v: fmtNum(p.value), l: p.label || 'Modifier' });
    } else if (mods.modifier) {
      out.push({ v: fmtNum(mods.modifier), l: 'Modifier' });
    }
  }
  if (mods.adv === 'adv') out.push({ v: 'ADV', l: 'Advantage' });
  if (mods.adv === 'dis') out.push({ v: 'DIS', l: 'Disadvantage' });
  if (mods.keep) out.push({ v: mods.keep.mode.toUpperCase() + mods.keep.n, l: KEEP_WORDS[mods.keep.mode] });
  if (mods.reroll) out.push({ v: `RO≤${mods.reroll.below}`, l: 'Reroll' });
  if (mods.explode) out.push({ v: '!', l: 'Exploding' });
  return out;
}

// The ceremony declares the roll's MOMENT, not its bookkeeping: the title is
// the `# comment` (mat text / §7.6 moment title) when one was written, and
// only falls back to the label. A pool named 'Attack' rolling
// `1d20+5 cine # The Duel | Charisma` stages 'The Duel'; 'Attack' stays the
// log's business. Parsed from the roll's own notation so the rule is one
// line everywhere (intent card, dock strip, mat decal).
function momentTitle(roll) {
  if (typeof roll.notation === 'string') {
    const res = parseNotation(roll.notation);
    if (res.ok && res.comment) return res.comment;
  }
  // No written moment: a pool name still reads as one ('Attack'), but raw
  // notation must never be inscribed in ceremony capitals — an untitled
  // check keeps the felt bare (absence beats jargon at the drama beat).
  const label = roll.label || '';
  return parseNotation(label).ok ? '' : label;
}

function renderIntentCard(roll) {
  const exp = roll.exp;
  setMonogram(document.getElementById('intent-monogram'), roll);
  document.getElementById('intent-eyebrow').textContent =
    exp.kind === 'cinematic' ? 'Reckoning' : 'Ordeal';
  document.getElementById('intent-title').textContent = momentTitle(roll);
  document.getElementById('intent-subtitle').textContent = exp.subtitle || '';
  // THE DECLARATION SHOWS WHAT WAS DECLARED (U17). This runs at DECLARE —
  // there is no entry, no total, no comparison — so gating it on "does this
  // system sum" withheld a literal the player had just typed, on the grounds
  // of an arithmetic that had not happened and would not be shown either way.
  // renderDockStrip has always rendered the same number ungated, and it is
  // the one that was coherent.
  const hasDc = Number.isInteger(roll.dc);
  document.getElementById('intent-target').classList.toggle('hidden', !hasDc);
  document.getElementById('intent-target-label').classList.toggle('hidden', !hasDc);
  if (hasDc) {
    document.getElementById('intent-target-num').textContent = String(roll.dc);
    // The profile NAMES the stake; it does not decide whether it renders.
    document.getElementById('intent-target-label').textContent =
      activeSystem().targetWord || 'Target';
  }

  const holder = document.getElementById('intent-mods');
  holder.innerHTML = '';
  for (const chip of preModChips(roll.spec && roll.spec.mods,
    { arithmetic: activeSystem().usesTotal })) {
    const el = document.createElement('span');
    el.className = 'pre-mod';
    const b = document.createElement('b');
    b.textContent = chip.v;
    el.appendChild(b);
    el.append(` ${chip.l}`);
    holder.appendChild(el);
  }
  document.getElementById('intent-notation').textContent = canonicalNotation(
    // The stake declares its POOLS (2i-B): sources ride the notation line —
    // '2d8[Wisdom]+1d10[Sword]', never bare dice math where the pool names
    // are the stake being read aloud.
    { dice: roll.spec.dice, mods: roll.spec.mods, sources: roll.spec.sources },
    { dc: roll.dc, comment: null }
  );
}

function renderDockStrip(roll) {
  setMonogram(document.getElementById('strip-monogram'), roll);
  document.getElementById('strip-title').textContent = momentTitle(roll);
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
function attributionCards(roll, entry, opts = {}) {
  const cards = [];
  const mods = (roll.spec && roll.spec.mods) || {};
  const parts = Array.isArray(mods.parts) ? mods.parts.filter((p) => p.value) : null;
  // Arithmetic only where the sum lands (U17 step 3); every card below this
  // one reports which dice COUNTED, which every system needs.
  if (opts.arithmetic) {
    if (parts && parts.length) {
      for (const p of parts) cards.push({ v: fmtNum(p.value), segs: [{ t: p.label || 'Modifier' }] });
    } else if (entry.modifier) {
      cards.push({ v: fmtNum(entry.modifier), segs: [{ t: 'Modifier' }] });
    }
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
// Is the moment still running? While it is, the card's primary act is SKIP,
// not clear — the one rule §7.16 states outright ("completing the beat and
// clearing the roll are never one gesture"). Named once because the body
// shortcut, the named bar and its label all have to agree on the answer.
const ceremonyBeatPlaying = () => !!(currentRoll && currentRoll.ceremony && !currentRoll.done);
// Verdict-fold cell (L8): resolved once here, mounted lazily on the first
// updateCardActions call so renderVerdictCard never rebuilds these
// children per paint.
const verdictFoldEl = document.getElementById('verdict-fold');

function renderVerdictCard(roll, entry) {
  stagedVerdict = { roll, entry }; // the repaint target while this card is up
  const hidden = entryHidden(entry);
  const who = entry.playerName ? `${entry.playerName} · ` : '';
  document.getElementById('verdict-eyebrow').textContent = `${who}${entry.label || ''}`;
  const vTotal = document.getElementById('verdict-total');
  // Per-die systems put NO number in the ring (2e): the old dice-count
  // read as a total — the exact confusion Joe named. And an empty ring is
  // no stage either (2i-B: a giant gold circle around nothing) — under a
  // per-die read the ring FOLDS and the outcome rows below are the card's
  // whole verdict. A hidden roll keeps the ring as its face-down stage.
  vTotal.textContent = hidden ? '?'
    : activeSystem().usesTotal ? String(entry.total)
    : '';
  document.querySelector('#verdict-card .ring-wrap')
    .classList.toggle('hidden', !hidden && !activeSystem().usesTotal);

  // THE FOLDED CARD, ceremony edition (Joe 2026-08-04: no ✕, no Done —
  // 'just flow to collected'): the BODY is the one big clear target with
  // the same role split as the banner's — the roller's click clears for
  // everyone, a spectator's dismisses locally (the dice stay until the
  // roller acts). Idle flow is armCeremonyRetire's clock, not a button.
  const mine = isMine(entry);
  verdictFor = { rollId: entry.rollId || null, mine };
  const card = document.getElementById('verdict-card');
  card.dataset.act = entry.rollId && (mine || rollerAway(entry)) ? 'clear' : 'dismiss';
  // The body keeps no title/aria-label: the named bar below is the announced
  // control (2026-08-07), and mid-beat it is the ONLY surface that can say
  // the press will SKIP rather than clear — which is the whole point of
  // "completing the beat and clearing the roll are never one gesture".
  // ONE card family (2i-C): the fold's shared verbs — Reveal for the
  // authority (goal 11), the REROLL ❯❯❯ strip once the values are
  // readable — come from the same builder the banner and peek use.
  // Mounted lazily on first call (L8) — this only updates the entry pointer
  // and toggles hidden so #verdict-fold never churns DOM per verdict paint.
  updateCardActions(verdictFoldEl, entry, {
    revealClass: 'reveal-verb',
    verbFor: () => (ceremonyBeatPlaying() ? 'skip'
      : verdictFor.rollId && verdictFor.mine ? 'clear' : 'dismiss'),
    onPrimary: (btn) => {
      if (ceremonyBeatPlaying()) { skipCeremony(); return; }
      if (verdictFor.rollId && verdictFor.mine) runCardClear(verdictFor.rollId, btn);
      else dismissCeremonyUI();
    },
  });

  // THE STAKE AND ITS ADJUDICATION ARE TWO FACTS (U17). `hasDc` asks only
  // whether the player declared a target — that is a stake and it renders
  // under every system. `adjudicable` asks whether this system makes one
  // number to compare it against, which is what the ring's ratio, the margin
  // and Success/Failure all need. Fusing them into one flag is what left a
  // per-die Check showing neither the target it was thrown at nor a reason.
  const sysTotals = activeSystem().usesTotal;
  const hasDc = Number.isInteger(entry.dc);
  const adjudicable = hasDc && sysTotals && !hidden;
  const ring = document.getElementById('ring-fill');
  const CIRC = 326.7;
  const frac = adjudicable ? Math.max(0.04, Math.min(entry.total / entry.dc, 1)) : 1;
  ring.style.strokeDashoffset = String(Math.round(CIRC * (1 - frac) * 10) / 10);
  ring.classList.toggle('fail', adjudicable && entry.total < entry.dc);

  const marginEl = document.getElementById('verdict-margin');
  const heroEl = document.getElementById('verdict-hero');
  heroEl.className = 'verdict-hero';
  marginEl.textContent = '';
  // WRITTEN ONCE, ABOVE EVERY BRANCH — including the hidden early-return.
  // The old code repeated it inside two branches and reached neither under a
  // per-die lens, because renderOutcomeRows wins the if/else first: the
  // branch ORDER was a second, independent gate nobody had noticed.
  if (hasDc) stakeInto(marginEl, entry, adjudicable);
  const holderPre = document.getElementById('verdict-modcards');
  if (hidden) {
    // Public stakes, hidden result (goal 11): the target shows, and the
    // verdict, margin and attribution wait for the reveal.
    heroEl.textContent = heldWord(entry);
    heroEl.classList.add('held');
    holderPre.innerHTML = '';
    return;
  }
  if (renderOutcomeRows(heroEl, entry)) {
    // per-die read (2e): the outcome ROWS are the verdict — pool by pool,
    // each die's face beside its word, same structure as the banner. The
    // stake line above captions them.
    heroEl.classList.add('verdict-tally', 'verdict-outcomes');
  } else if (adjudicable) {
    // The target verdict owns the whole read. (This used to explain itself
    // via entryMeaning, which step 4 deleted, and §2.5, which §7.24 retired —
    // the chart word reaches the card through outcomesFor's rows above, and
    // those rows win this if/else before this branch is ever reached.)
    const cleared = entry.total >= entry.dc;
    marginEl.append(' · margin '); // the 'vs DC N' prefix is already on screen
    const b = document.createElement('b');
    b.textContent = fmtNum(entry.total - entry.dc);
    marginEl.appendChild(b);
    heroEl.textContent = cleared ? 'Success' : 'Failure';
    if (!cleared) heroEl.classList.add('bad');
  } else {
    heroEl.textContent = '';
  }

  const holder = document.getElementById('verdict-modcards');
  holder.innerHTML = '';
  // U17 step 3: the ARITHMETIC card is gated; the selection cards are not.
  // "modifiers/keeps do not change outcomes under this system" was half
  // right and half an invariant break — a keep/drop absolutely changes which
  // dice the chart reads, and this profile's own forecastFor refuses to
  // pre-read one for exactly that reason.
  attributionCards(roll, entry, { arithmetic: activeSystem().usesTotal })
    .slice(0, 6).forEach((c, i) => {
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
// THE FOLDED CARD's body act (Joe 2026-08-04 — no ✕, no Done): one press
// on the card body, the likeliest act. Role split like the banner's: the
// roller clears for everyone (server-validated; the 'roll-cleared'
// broadcast closes the card via applyClearRoll — never optimistic), a
// spectator dismisses locally. A click while the moment is still playing
// SKIPS first (always interruptible) — completing the beat and clearing
// the roll are never one gesture.
{
  const vMain = document.getElementById('verdict-main');
  vMain.addEventListener('click', (e) => {
    e.stopPropagation(); // the layer's skip listener must not double-handle
    if (ceremonyBeatPlaying()) { skipCeremony(); return; }
    const v = verdictFor;
    if (v && v.mine && v.rollId) runCardClear(v.rollId, null);
    else dismissCeremonyUI(); // spectator: local dismiss only — the dice stay
  });
  // Reading holds the flow clock, exactly like hovering the banner holds
  // the tidy-away; leaving re-arms it whole (hidden cards stay standing —
  // armCeremonyRetire's own guards).
  const card = document.getElementById('verdict-card');
  card.addEventListener('mouseenter', () => clearTimeout(ceremonyDismissTimer));
  card.addEventListener('mouseleave', () => {
    if (currentRoll && currentRoll.ceremony) armCeremonyRetire(currentRoll);
  });
}
// (verdict ⟳ and Reveal wiring retired 2i-C: appendCardActions builds and
// wires both into #verdict-fold — the strip rerolls THIS card's entry, one
// hop truer than the old rerollLast, and the 'r' shortcut is unchanged.
// The §7.7.2 verdict ✕ and Done retired 2026-08-04 with the flow to
// collected: the body clears, the clock collects.)

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

// ---- Slice 3: REST CADENCE (Joe 2026-08-04) --------------------------------
// Sub-mm continuous motion on SETTLED-on-felt dice — "sea-glass swells /
// heartwood creaks / sap-amber is sealed / scrimshaw remembers" IN MOTION,
// without any new textures or lights. Doctrine: quiet at rest (P1); the die
// never tilts far enough to misread; physics untouched; the shelf is the
// archive (excluded, same predicate as the S3 bloom leak fix).
//
// Scratch quaternion + axis reused every frame for every cadencing die —
// the whole point of allocating once at module scope is that a full felt
// (40 dice, the app-wide cap) writes zero new objects per frame.
const TMP_QUAT = new THREE.Quaternion();
const TMP_AXIS = new THREE.Vector3();
// Same doctrine for the per-frame HUD projectors (positionChips /
// positionShelfMarkers): one scratch pair reused every frame, zero
// per-die allocations. Callers own the vectors between .set/.copy and
// the pixel write — they never survive across function calls.
const TMP_V1 = new THREE.Vector3();
const TMP_V2 = new THREE.Vector3();
const TWO_PI = Math.PI * 2;

// Deterministic 32-bit hash → [0, 1). Same input on every client → same phase.
// FNV-1a with a salt so one key can feed multiple independent seeds.
function restHash(str, salt) {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0)) / 4294967296;
}

// One-shot at playRoll's face-correction seam. Runs for every die (shrouded
// too — obsidian looks up as no-recipe and short-circuits to still). settleAt
// stays sentinel 0 here; stepResting stamps it lazily on the first frame it
// sees the die AND the roll is done, which is what closes the ceremony gap
// without any coordination code.
function initRest(d, roll, i) {
  const setId = d.variant;
  const recipe = setId && SETS[setId] ? SETS[setId].rest : null;
  if (!recipe || recipe.kind === 'still') {
    // { kind: 'still', done: true } short-circuits inside stepResting's hot
    // loop — one pointer check per die per frame. `declared` distinguishes
    // sapamber's explicit rest:{kind:'still'} (identity assertion — sealed
    // resin does not shift, sibling heartwood cadences) from a set with no
    // rest recipe at all (classics, deepglacier, shroud). Only the
    // sentinel-carrying case reads through restInfo — code review and
    // debug dumps see WHICH still it is.
    d.rest = { kind: 'still', done: true, declared: !!(recipe && recipe.kind === 'still') };
    return;
  }
  const key = `${roll.rollId || 'local'}:${i}`;
  d.rest = {
    recipe,
    kind: recipe.kind,
    seedA: restHash(key, 0xA1) * TWO_PI,
    seedB: restHash(key, 0xB2) * TWO_PI,
    seedC: restHash(key, 0xC3) * TWO_PI,
    settleAt: 0,   // sentinel; stamped on first stepResting frame we see
    tickAt: 0,     // settle-tick only
    done: false,
  };
}

// Rest-cadence step — one line inside tick(), runs after stepWhisking so it
// shares locality with the other rest-adjacent peers, and before stepRevealing
// so the reveal's freshly-corrected quat overrides any cadence write on the
// same frame. Reads d.finalPos / d.finalQuat LIVE so a reveal repaint is
// automatically the new baseline the very next frame.
function stepResting() {
  if (!tableDice.length) return;
  // Same clock as SHADER_TIME (dt-driven, holdClock-frozen) so a headless
  // sim() drives cadence deterministically — never performance.now(), or
  // holdClock could not freeze it.
  const now = SHADER_TIME.value * 1000; // ms
  for (const d of tableDice) {
    const r = d.rest;
    if (!r || r.done || r.kind === 'still') continue;
    // Shelf gate — the archive is quiet (same predicate as the S3 fix,
    // and shelfClusters.set fires BEFORE placeCluster whisks, so whisk
    // is covered here too).
    if (shelfClusters.has(d.rollId)) continue;
    // In-flight gate — playback owns the mesh transform while its own
    // roll is still animating. Sinking dice are already dropped from
    // tableDice by removeRollDice, so no separate gate is needed.
    if (currentRoll && !currentRoll.done && d.rollId === currentRoll.rollId) continue;
    // Lazy settleAt — a die whose ceremony is still running has roll.done
    // false; the gate above skips it, so settleAt stays 0 and cadence
    // begins from t=0 the frame AFTER ceremonyFinish flips roll.done.
    if (r.settleAt === 0) r.settleAt = now;
    const t = (now - r.settleAt) / 1000; // seconds
    const rec = r.recipe;
    if (r.kind === 'swell') {
      const wy = TWO_PI / rec.yPeriodS;
      const wr = TWO_PI / rec.rollPeriodS;
      d.mesh.position.copy(d.finalPos);
      d.mesh.position.y += rec.yAmpM * Math.sin(t * wy + r.seedA);
      const angle = rec.rollAmpRad * Math.sin(t * wr + r.seedB);
      TMP_AXIS.set(1, 0, 0);
      TMP_QUAT.setFromAxisAngle(TMP_AXIS, angle);
      d.mesh.quaternion.copy(d.finalQuat).premultiply(TMP_QUAT);
    } else if (r.kind === 'creak') {
      const wa = TWO_PI / rec.periodAS;
      const wb = TWO_PI / rec.periodBS;
      const ax = rec.ampRad * Math.sin(t * wa + r.seedA);
      const ay = rec.ampRad * Math.sin(t * wb + r.seedB);
      d.mesh.position.copy(d.finalPos); // creak is orientation only
      TMP_AXIS.set(1, 0, 0);
      TMP_QUAT.setFromAxisAngle(TMP_AXIS, ax);
      d.mesh.quaternion.copy(d.finalQuat).premultiply(TMP_QUAT);
      TMP_AXIS.set(0, 0, 1);
      TMP_QUAT.setFromAxisAngle(TMP_AXIS, ay);
      d.mesh.quaternion.premultiply(TMP_QUAT);
    } else if (r.kind === 'settle-tick') {
      if (r.tickAt === 0) {
        const frac = r.seedA / TWO_PI; // reuse phase seed as [0,1) delay
        r.tickAt = r.settleAt + rec.delayMinMs + frac * (rec.delayMaxMs - rec.delayMinMs);
      }
      const elapsed = now - r.tickAt;
      if (elapsed < 0) continue; // still waiting for our moment
      if (elapsed > rec.tailMs) {
        // Snap authoritatively back to the archive pose and go dark
        // forever — a later whisk/sink reads a known-clean transform.
        r.done = true;
        d.mesh.position.copy(d.finalPos);
        d.mesh.quaternion.copy(d.finalQuat);
        continue;
      }
      const u = elapsed / rec.tailMs;
      const env = Math.sin((1 - u) * (Math.PI / 2)); // 1 at tick, 0 at tail end
      d.mesh.position.copy(d.finalPos);
      d.mesh.position.y += rec.posBumpM * env;
      TMP_AXIS.set(0, 1, 0);
      TMP_QUAT.setFromAxisAngle(TMP_AXIS, rec.yawRad * env);
      d.mesh.quaternion.copy(d.finalQuat).premultiply(TMP_QUAT);
    }
  }
}


// The physics world is only stepped inside playRoll's synchronous
// fast-forward; the rAF loop just advances keyframe playback.
function tick(dt, render = true) {
  // Themed-set clocks (Tier 6 §9): the Level 2 shader uniform and the
  // Level 3 particle field advance with the same dt discipline as
  // everything else (holdClock freezes both — deterministic screenshots).
  SHADER_TIME.value += dt;
  particleField.tick(dt, SHADER_TIME.value);
  decalField.tick(dt);
  dieLights.tick(dt, SHADER_TIME.value);
  stepPlayback(dt);
  stepSinking(dt);   // per-roll Done departures (§7.5)
  stepWhisking(dt);  // collect whisks onto the shelf (§7.7)
  stepResting();     // Slice 3: sub-mm cadence on settled-on-felt dice
  stepRevealing(dt); // reveal correction flips (goal 11)
  if (chips.length) positionChips();
  if (shelfClusters.size) positionShelfMarkers();
  updateCornerClear();
  if (render) {
    // Level 5 bypass: the stack runs only in frames where it could show
    // something — a bloom-flagged die on the FELT, live particles, a
    // running ring/shimmer, or the test force. Shelved dice are the
    // archive — their iron has cooled (mirrors collectShimmerSources'
    // shelf test below) so a shelf full of bolt-glass no longer keeps
    // the pipeline hot forever (S3 fix, 2026-08-04).
    const need = postForced || postStack.busy() || particleField.count() > 0
      || tableDice.some((d) => d.mesh.userData.bloom && !shelfClusters.has(d.rollId));
    if (need) {
      postStack.setShimmer(collectShimmerSources(), camera);
      postStack.render(scene, camera, dt);
    } else {
      renderer.render(scene, camera);
    }
  }
}

// Heat shimmer sources (Level 5): unshrouded dice of a shimmer set that
// still live on the FELT — the shelf is the archive, its iron has cooled.
//
// Allocation shape (Tier 0 §0d hot-paths, 2026-08-05): the pool of
// MAX_SHIMMER records + the outer array are hoisted to module scope and
// reused every frame. collectShimmerSources fills slots by index and trims
// SHIMMER_OUT.length; PostStack.setShimmer reads within that window. The
// records ALIAS across frames by design — callers must not stash slots.
const SHIMMER_POOL = Array.from({ length: MAX_SHIMMER }, () => ({ at: [0, 0, 0], radius: 0, strength: 0 }));
const SHIMMER_OUT = [];
function collectShimmerSources() {
  let n = 0;
  for (const d of tableDice) {
    if (n >= MAX_SHIMMER) break;
    if (d.shrouded || shelfClusters.has(d.rollId)) continue;
    const set = d.variant && SETS[d.variant];
    const s = set && set.post && set.post.shimmer;
    if (!s) continue;
    const slot = SHIMMER_POOL[n];
    slot.at[0] = d.mesh.position.x;
    slot.at[1] = d.mesh.position.y;
    slot.at[2] = d.mesh.position.z;
    slot.radius = s.radius;
    slot.strength = s.strength;
    SHIMMER_OUT[n++] = slot;
  }
  SHIMMER_OUT.length = n;
  return SHIMMER_OUT;
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
  // Make localStorage refuse (CUJ13). A real quota failure cannot be induced
  // from a scenario — Safari private browsing throws on setItem, a full disk
  // does too, and neither is reachable from CDP — so the refusal is injected
  // at the one function that catches it. The banner under test is what a
  // player sees in those cases and in no other.
  jamStorage(on) { forceStorageFail = !!on; },
  // How big a die actually LANDS on screen, in CSS px — the only number that
  // answers "can I see the dice". Projects a unit-radius sphere at the mat's
  // centre through the live camera, so it accounts for the preset, the
  // viewport, and applyCameraFraming's retreat all at once.
  // The ladder's own numbers, so a scenario can assert the BEHAVIOUR (walls
  // follow the setting, every client agrees) without carrying a copy of the
  // decision that fails on a retune.
  zoomPreset(id) { const p = ZOOM_PRESETS[id]; return p ? { w: p.w, d: p.d } : null; },
  zoomProbe() {
    const p0 = new THREE.Vector3(0, 0, 0).project(camera);
    const p1 = new THREE.Vector3(1, 0, 0).project(camera);
    return {
      dieSpanPx: Math.round(Math.abs(p1.x - p0.x) * view.width),
      view: `${Math.round(view.width)}x${Math.round(view.height)}`,
      table: `${TABLE_W}x${TABLE_D}`,
      camY: Math.round(camera.position.y * 10) / 10,
    };
  },
  // Uncleared rolls still on the table, and whose they are (C7 ②). A
  // projection, never the live Map — rollStates is keyed state the render
  // path owns, and handing it out would let a scenario mutate the machine
  // it is meant to observe.
  get onTable() {
    const out = [];
    for (const [rollId, st] of rollStates) {
      if (st.cleared) continue;
      const e = log.find((x) => x.rollId === rollId);
      out.push({ rollId, mine: !!(e && net && e.playerId === net.playerId), collected: st.collected !== null });
    }
    return out;
  },
  // The blocking surfaces, by name (U22): a11y-modals asserts the trap on
  // each, and driving them through their real open/close is the only way to
  // catch a surface that claims aria-modal without going with it.
  openHelpDialog(topic) { return openHelpDialog(topic || null); },
  closeHelpDialog() { return closeHelpDialog(); },
  toggleKbd() { return toggleKbd(); },
  closeKbd() { return closeKbd(); },
  openSettingsModal() { return openSettingsModal(); },
  closeSettingsModal() { return closeSettingsModal(); },
  // U19: vacate the seat NOW, skipping DISCONNECT_GRACE_MS. Closing the page
  // would get there too, five seconds later — a scenario about what the table
  // does AFTER someone leaves should not buy that wait once per assertion.
  leaveNow() { return net ? net.leave({ immediate: true }) : Promise.resolve(false); },
  rollerAway(rollId) {
    const e = log.find((x) => x.rollId === rollId);
    return e ? rollerAway(e) : null;
  },
  get groups() { return groups; },
  // saved groups: write back to ONE record by id — the inline row editor's
  // own path (editPoolById). patch = {name?, notation?}; returns the updated
  // {id, name, notation} or false (unknown id / notation that doesn't parse).
  editPool(id, patch) { return editPoolById(id, patch); },
  // Delete by id — the row ✕'s path, reachable for scenario cleanup (pools
  // live in per-origin localStorage, which OUTLIVES a scenario's room).
  deletePool(id) {
    const before = groups.length;
    groups = groups.filter((x) => x.id !== id);
    if (groups.length === before) return false;
    saveGroups();
    renderGroups();
    return true;
  },
  get cmdHistory() { return cmdHistory; },
  get tableDice() { return tableDice; },
  get currentRoll() { return currentRoll; },
  get busy() { return !!(currentRoll && !currentRoll.done) || rollQueue.length > 0; },
  get queueLength() { return rollQueue.length; },
  // Tier 0 §0e endurance: the delegated ⟳ handler resolves the entry by
  // rollId — this hook lets the scenario prove requestRoll fires with the
  // right entry AFTER many rebuilds (a stale closure was the pre-fix bug).
  get lastRequestedRoll() { return lastRequestedRoll ? { ...lastRequestedRoll } : null; },
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
  // mat-zoom (Joe 2026-08-04): the room-wide preset + world extents for the
  // e2e assertion surface (never scrape the felt).
  get zoom() { return currentZoom; },
  get pendingZoom() { return pendingZoom; },
  setZoom(id) { return selectZoom(id); },
  wallPositions() {
    return {
      back:  { x: walls.back.position.x,  y: walls.back.position.y,  z: walls.back.position.z  },
      front: { x: walls.front.position.x, y: walls.front.position.y, z: walls.front.position.z },
      left:  { x: walls.left.position.x,  y: walls.left.position.y,  z: walls.left.position.z  },
      right: { x: walls.right.position.x, y: walls.right.position.y, z: walls.right.position.z },
    };
  },
  shelfPitch() { return SHELF_PITCH; },
  shelfZ() { return SHELF_Z; },
  tableExtents() { return { w: TABLE_W, d: TABLE_D }; },
  // World X of the first die in the first shelf cluster — the reflow proof.
  // Null when no shelf cluster has been dice-populated yet.
  firstShelfDieWorldX() {
    const c = [...shelfClusters.values()].sort((a, b) => a.seq - b.seq)[0];
    if (!c) return null;
    const dice = tableDice.filter((d) => d.rollId === c.rollId);
    if (!dice.length) return null;
    return dice[0].mesh.position.x;
  },
  openSettings() { openSettingsModal(); },
  // Your data → the file door (§G1), minus the native picker no headless run
  // can ever click. loadText() is exactly what a chosen file does once read;
  // acceptFile() takes a real File so the size and read refusals are assertable
  // too. Both return the live preview's verdict ({ok, status, canApply}) — the
  // import still lands only through the existing Apply.
  portable: {
    snapshot() { return portableSnapshot(); },
    filename() { return portableFilename(); },
    loadText(text) { return portableLoadText(text); },
    acceptFile(file) { return portableAcceptFile(file); },
    get maxBytes() { return PORTABLE_MAX_BYTES; },
    // What the BOX holds, and the two doors from a file into the library
    // (§11 O7/P14). The rack-swap verbs (editProfile / saveToProfile /
    // doneEditing) are GONE with the swap itself — see __diceDebug.profiles
    // for what replaced them.
    profiles() { return portableParsed ? portableParsed.profiles.map((p) => p.name) : []; },
    profileSystems() { return portableParsed ? portableParsed.profiles.map((p) => p.system || null) : []; },
    adopt(name) { return portableAdoptOne(name); },
    adoptAll() { return portableAdoptProfiles(); },
    // §G4/§G6: the Apply-to-table button, clickless. ASYNC — resolves the
    // pane's verdict once the push answers; success records authorship in
    // dice.table.v1:<room> exactly as the click does.
    pushToTable() { return portablePushToTable(); },
  },
  // G5 seat picker (§G5) — the whole flow, clickless. seatPicker is one
  // JSON-safe projection (identityInfo's pattern); the four verbs mirror the
  // modal's own controls and answer in the pane's {ok, status, canApply}
  // verdict shape wherever a refusal is possible.
  get seatPicker() {
    return {
      open: !document.getElementById('name-modal').classList.contains('hidden'),
      phase: seatPhase,
      tableName: seatPeekInfo && typeof seatPeekInfo.name === 'string' ? seatPeekInfo.name : null,
      seats: seatChoices(),
      preselect: seatPreselect(),
      chosen: seatChosen,
      verdict: { ...seatVerdict },
      // §11: the profile half of the same modal. `system` is what the PEEK
      // says this table reads by — the room's settings have not arrived yet,
      // which is why the peek carries it at all.
      system: seatSystem(),
      mine: profilesFor(profileStore, seatSystem()).map((p) => ({
        id: p.id,
        name: p.name,
        pools: p.id === profileStore.activeId ? groups.length : (p.pools || []).length,
      })),
      profilePick: seatProfilePicked,
      profileDefault: lastUsedFor(profileStore, seatSystem()),
    };
  },
  chooseMyProfile(id) { return chooseMyProfile(id); },
  chooseDealtProfile() { return chooseDealtProfile(); },
  chooseSeat(name) { return takeSeat(name); },
  chooseSomeoneElse(name) { return takeFreeSeat(name); },
  applySeatImport() { return applySeatChoice(); },
  dismissSeatImport() { return dismissSeatChoice(); },
  // §11: the library. One JSON-safe projection plus one verb per act, every
  // verb answering {ok, status} so the refusal strings themselves are
  // assertable. `list` carries pool COUNTS, not pools: 32 racks through a CDP
  // evaluate is a payload no scenario needs, and the one in hand is counted
  // from the LIVE rack rather than its last-folded copy.
  profiles: {
    get list() {
      const sys = tableSystem();
      return profilesOf(profileStore).map((p) => ({
        id: p.id,
        name: p.name,
        system: p.system,
        pools: p.id === profileStore.activeId ? groups.length : (p.pools || []).length,
        active: p.id === profileStore.activeId,
        pickable: p.system === sys,
        ...(p.set ? { set: p.set } : {}),
      }));
    },
    get active() {
      const p = activeProfile(profileStore);
      return p ? { id: p.id, name: p.name, system: p.system, pools: groups.length, ...(p.set ? { set: p.set } : {}) } : null;
    },
    get tableSystem() { return tableSystem(); },
    // R6's answer, per system — what each table would hand you on arrival.
    get lastUsed() {
      const out = {};
      for (const id of Object.keys(SYSTEMS)) {
        const pick = lastUsedFor(profileStore, id);
        out[id] = pick ? findProfile(profileStore, pick).name : null;
      }
      return out;
    },
    get mismatch() { return profileMismatch(); },
    get mismatchKept() { return mismatchKept; },
    get full() { return isFull(profileStore); },
    get max() { return MAX_PROFILES; },
    use(id) { return switchToProfile(id); },
    create(name, system) { return makeProfile({ name, system: system || tableSystem(), pools: [] }); },
    deal(system) { return dealNewProfile(system || tableSystem()); },
    rename(id, name) { return renameProfileTo(id, name); },
    remove(id) { return removeProfileById(id); },
    // src: a wire record {name, system?, set?, pools} — a teammate's published
    // rack, a prepared seat, or a file profile. Copies into the library.
    copyFrom(src, activate = false) { return copyProfileIn(src, { activate }); },
    bindToTable() { return bindActiveToTable(); },
    keepMismatch() { mismatchKept = true; updateProfileBanner(); return { ok: true, status: '✓ kept' }; },
    // THE PRECONDITION DOOR, for scenarios only. Per-origin localStorage
    // OUTLIVES a scenario's room (tests/e2e/scenarios.mjs says so at length),
    // so a library left behind by an earlier scenario on the same origin is
    // inherited by the next one — and a leftover profile named 'Alice' makes a
    // prepared seat called 'Alice' dedupe to 'Alice 2', which is correct
    // behaviour failing an inherited assumption. setGroups exists for the same
    // reason at the rack's grain; this is it at the library's.
    reset(system) {
      const sys = knownSystem(system) || tableSystem();
      profileStore = emptyStore();
      const added = addProfile(profileStore, {
        name: dealName(sys), system: sys, pools: dealRack(sys), at: Date.now(),
      });
      saveProfileStore();
      adoptRack(added.profile);
      renderProfileLibrary();
      return { ok: true, status: `✓ library reset to '${added.profile.name}'` };
    },
    // The picker menu, opened without a pointer.
    openMenu() {
      const anchor = document.getElementById('profile-pick');
      const visible = anchor && !anchor.classList.contains('hidden');
      openRailMenu(visible ? anchor : document.getElementById('identity-chip'), buildProfileMenu);
      return { ok: true, status: '✓ open' };
    },
    get menuRows() {
      if (!isRailMenuOpen()) return null;
      return [...railMenuState.el.querySelectorAll('.pm-row')].map((b) => ({
        label: b.querySelector('.pm-name') ? b.querySelector('.pm-name').textContent : '',
        sub: b.querySelector('.pm-sub') ? b.querySelector('.pm-sub').textContent : '',
        disabled: !!b.disabled,
        active: b.getAttribute('aria-checked') === 'true',
      }));
    },
  },
  // §G6: the authorship record vs the room. stored = the rev this browser
  // last pushed (0 = never pushed, so it never re-pushes); room = the setup
  // rev the room holds as this client knows it (0 = unprepared).
  get tableRev() {
    const stored = storedTable();
    return {
      stored: stored ? stored.rev : 0,
      room: roomSetup && Number.isInteger(roomSetup.rev) ? roomSetup.rev : 0,
    };
  },
  // Run the §G6 re-push check on demand (the same call every hello makes).
  // Resolves {applied, rev} | null from net.pushTable, or false when there
  // was nothing to heal — no stored record, or the room is already current.
  repushTable() { return maybeRepushTable() || false; },
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
  // The CEREMONY_DISMISS_MS handoff, driven directly (tests can't wait out
  // a real 7 s timer): the card FLOWS TO COLLECTED (Joe 2026-08-04) — the
  // roller's collect fires, a spectator's card retires locally. Returns
  // false when the card stands instead (a hidden roll awaiting its reveal).
  retireCeremony() {
    if (!currentRoll) return false;
    return retireCeremonyFlow(currentRoll);
  },
  // die art (stage A): the palette tiles' rendered die stills — one dataURL
  // (or null when WebGL was unavailable) per type.
  get dieArt() {
    const out = {};
    for (const t of DIE_TYPES) out[t] = dieArtURL(t);
    return out;
  },
  // §9 chrome: the bakery's (type, variant) surface — what a chip for
  // this die in this skin looks like (themed-chrome asserts DOM img
  // srcs against it, so chips are checked by contract, not by pixels).
  dieArtFor(type, variant) { return dieArtURL(type, variant); },
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
  // L6 endurance pin: total live-marker element count under #shelf-layer.
  // The reap loop only wipes stale '.shelf-marker' children, so re-rendering
  // the same set of clusters N times must leave this count stable at
  // shelfClusters.size (plus any mid-fade '.chip-clearing' markers still
  // present). Excludes chip-clearing to match the shelfMarkers getter.
  get shelfLayerChildCount() {
    return [...shelfLayer.querySelectorAll('.shelf-marker')]
      .filter((el) => !el.classList.contains('chip-clearing'))
      .length;
  },
  // L6 endurance harness: repeatedly re-render markers to prove the reuse
  // invariant (child count stable). Callable from e2e scenarios only.
  rerenderShelf(n = 1) {
    for (let i = 0; i < n; i++) renderShelfMarkers();
    return true;
  },
  get shelfMarkers() {
    return [...shelfLayer.querySelectorAll('.shelf-marker')]
      .filter((el) => !el.classList.contains('chip-clearing'))
      .map((el) => ({
        rollId: el.dataset.rollId || null,
        // bare = nothing at rest: the marker is a quiet dot that only
        // OPENS the card (the folded-card grammar — the sweep retired
        // 2026-08-03; the card's body is the clear target).
        bare: el.children.length === 0,
        text: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''),
        hasTotal: !!el.querySelector('.sm-total'),
        hasX: !!el.querySelector('.sm-x'),
        hasSweep: !!el.querySelector('.shelf-sweep'), // always false since the retire — kept as a regression pin
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
  offerRoll(str, to = null) {
    const r = commandOffer(str, to); // to: targeted offer (4b)
    return { ok: r.ok === true, state: r.state || (r.ok ? 'ok' : 'invalid'), error: r.error || null, posted: r.ok === true && netOnline };
  },
  claimOffer(offerId) { return net ? net.claim(offerId, { set: wireSet() }) : Promise.resolve(false); },
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
      to: o.to ? JSON.parse(JSON.stringify(o.to)) : null, // targeted (4b)
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
      rerollOfId: e.rerollOfId || null, // B3: server-substantiated provenance
    };
  },
  // die chips (P1 quiet by default): the per-user visibility preference and
  // the live chip count. setChipsVisible returns the resulting state.
  get chipsVisible() { return chipsOn; },
  // Dice-set identity (Tier 6 §9): read/choose the local set, and read
  // which skin each die on the table actually wears (e2e's assertion
  // surface — never scrape the canvas).
  get diceSet() { return diceSet; },
  setDiceSet(id) { return setDiceSet(id); },
  tableDiceInfo() {
    return tableDice.map((d) => ({
      type: d.type,
      variant: d.variant || (d.shrouded ? 'shroud' : 'std'),
      rollId: d.rollId || null,
    }));
  },
  // Slice 3 assertion surface: per-die cadence state + the LIVE deltas
  // (mesh pose minus the frozen archive pose) that let a scenario prove
  // "sea-glass swells", "sap-amber does not shift", "scrimshaw settles
  // once then never again". No RNG — deterministic across clients.
  restInfo(rollId = null) {
    const dice = rollId ? tableDice.filter((d) => d.rollId === rollId) : tableDice;
    return dice.map((d) => {
      const r = d.rest || null;
      const fp = d.finalPos;
      const fq = d.finalQuat;
      const deltaY = fp ? d.mesh.position.y - fp.y : 0;
      let tiltRad = 0;
      if (fq) {
        // tiny quat delta from finalQuat, expressed as absolute rotation
        // angle. |dot| clamped to [0,1] to guard against slerp round-off.
        const q = d.mesh.quaternion;
        const dot = Math.abs(q.x * fq.x + q.y * fq.y + q.z * fq.z + q.w * fq.w);
        tiltRad = 2 * Math.acos(Math.min(1, Math.max(0, dot)));
      }
      return {
        rollId: d.rollId || null,
        variant: d.variant || null,
        kind: r ? r.kind : null,
        // declared: true when the set's recipe explicitly said rest:{kind:
        // 'still'} (sapamber's identity assertion). false when the set has
        // no rest recipe at all (classics, deepglacier, shroud) and the
        // runtime collapsed to the same sentinel. Both render identically;
        // only this flag distinguishes them for tests + debug dumps.
        declared: r ? !!r.declared : false,
        settleAt: r ? r.settleAt : 0,
        done: r ? !!r.done : true,
        deltaY,
        tiltRad,
      };
    });
  },
  // Level 4 assertion surface: live felt marks, marks ever laid (the
  // sim() clock can age live ones out mid-test), the kill-switch
  // state, + attached die-lights.
  fxInfo() {
    return { decals: decalField.count(), stamped: decalField.stampedTotal, decalsEnabled: decalField.enabled, decalsBuilt: decalField.built, lights: dieLights.info() };
  },
  // §9 draft state: the per-die override bookkeeping behind mixed rolls.
  get draftSets() {
    return { dice: [...tray], sources: [...traySources], sets: [...traySets] };
  },
  // Felt marks ship dark (2026-08-03) — this re-arms stamping for THIS
  // page only (trials, tests). The lasting switch is
  // DECALS_DEFAULT_ENABLED in decals.js.
  decalsEnable(on) {
    // Route through enable() so arming eagerly builds the atlas + mesh —
    // no first-stamp hitch when Joe flips the switch on a live table.
    return decalField.enable(on);
  },
  // Level 5 assertion surface. Computed LIVE from sim state, never from
  // the last painted frame — a backgrounded tab stops painting but its
  // sim keeps running, and a stale render-gated flag reads as whatever
  // the tab last showed (found the hard way: 'active' frozen false while
  // rings fired). lastBloomSources stays as painted-frame curiosity.
  postInfo() {
    // bloomDice = every bloom-flagged mesh on the table (felt + shelf) —
    // long-standing surface, kept for existing pins. bloomDiceLive is
    // the felt-only count that drives the gate after the S3 fix (shelved
    // bloom dice no longer wake the pipeline).
    const bloomDice = tableDice.filter((d) => d.mesh.userData.bloom).length;
    const bloomDiceLive = tableDice.filter((d) => d.mesh.userData.bloom && !shelfClusters.has(d.rollId)).length;
    return {
      active: postForced || postStack.busy() || particleField.count() > 0 || bloomDiceLive > 0,
      forced: postForced,
      bloomDice,
      bloomDiceLive,
      lastBloomSources: postStack.lastBloomSources,
      rings: postStack.ringsFired,
      shimmer: postStack.shimmer.length,
    };
  },
  postForce(on) { postForced = on !== false; return postForced; },
  // Test-only: clear the postStack's transient timed effects (rings +
  // shimmer). Rings age inside PostStack.render, which sim() skips
  // (render=false), so a test that fast-forwards via sim() cannot make
  // a live ring naturally decay — this drain is that lever. Particles
  // are already sim()-drainable via particleField.tick.
  postDrain() {
    postStack.rings.length = 0;
    postStack.shimmer.length = 0;
    return true;
  },
  // roll outlines (the card-hover read): shell colors, in die order
  get outlineState() { return outlined.map((o) => `#${o.shell.material.color.getHexString()}`); },
  // Endurance probe (Tier 0 §0e): after a stress loop of hover-then-hide,
  // outlined must land at exactly zero — a stray shell mesh riding a die
  // is a memory + GPU leak the hideBanner helper closes.
  get outlinedCount() { return outlined.length; },
  hoverBanner(on) { outlineRollDice(on !== false); return outlined.length; },
  // The collapsed pool rail: what it shows, what is picked, and the state of
  // its one gold verb. Scenarios read THIS, never the .rp-* DOM.
  get railState() {
    const rows = [...document.querySelectorAll('#rail-pools .rp-item')];
    const btn = document.getElementById('rail-roll');
    const wrap = document.getElementById('rail-roll-wrap');
    const note = document.getElementById('rail-note');
    return {
      shelves: [...document.querySelectorAll('#rail-pools .rp-shelf')]
        .map((s) => (s.querySelector('.rp-shelf-head') || {}).textContent || null),
      items: rows.map((b) => ({
        name: (b.querySelector('.rp-name') || {}).textContent || null,
        dice: !!b.querySelector('.rp-dice'),
        imgs: b.querySelectorAll('.rp-dice img').length,
        ord: (b.querySelector('.rp-ord') || {}).textContent || null,
        selected: b.getAttribute('aria-pressed') === 'true',
        bad: b.classList.contains('rp-bad'),
        vertical: getComputedStyle(b.querySelector('.rp-name') || b).writingMode,
      })),
      selected: railPicked().map((g) => g.name || g.notation),
      rollStanding: !!wrap && !wrap.hidden && getComputedStyle(wrap).display !== 'none',
      rollDisabled: !!btn && btn.disabled,
      note: note && !note.hidden ? note.textContent : null,
    };
  },
  setRailSelection(names) {
    railSel.clear();
    for (const g of groups) if (names.includes(g.name)) railSel.add(g.id);
    renderRailPools();
    return railPicked().map((g) => g.name);
  },
  railRoll() {
    if (railMode() === 'dice') rollRailDice(); else rollRailSelection();
    return true;
  },
  // The collapsed column's source switch and its dice list (§7.23).
  // `mode` is RESOLVED (what is on screen); `stored` is the preference, and
  // null means never chosen — the decision table needs both to be pinnable.
  get railMode() {
    const seg = document.getElementById('rail-mode');
    const cell = (v) => seg && seg.querySelector(`[data-rm="${v}"]`);
    return {
      mode: railMode(),
      stored: railModeStored(),
      poolsEnabled: !!(cell('pools') && !cell('pools').disabled),
      shown: {
        pools: getComputedStyle(document.getElementById('rail-pools')).display !== 'none',
        dice: getComputedStyle(document.getElementById('rail-dice')).display !== 'none',
      },
    };
  },
  setRailMode(m) { return setRailMode(m); },
  get railDice() {
    const btn = document.getElementById('rail-roll');
    const note = document.getElementById('rail-note');
    return {
      dice: [...railDice],
      total: railDice.length,
      canonical: railDiceCanonical(),
      labels: [...document.querySelectorAll('#rail-dice .rd-item .rp-name')].map((e) => e.textContent),
      removers: document.querySelectorAll('#rail-dice .rd-x').length,
      rollDisabled: !!btn && btn.disabled,
      rollTitle: btn ? btn.title : null,
      note: note && !note.hidden ? note.textContent : null,
    };
  },
  railTapDie(type) { railAddDie(type); return railDice.length; },
  railRemoveDie(type) { railRemoveDie(type); return railDice.length; },
  // The card action row, read as the EYE gets it. Every field here is
  // computed style, never the `.hidden` property — asserting the property
  // is exactly how the fold shipped two live verbs on every card while the
  // suite stayed green. `surface` is 'banner' | 'verdict' | 'peek'.
  cardActs(surface) {
    const holder = document.querySelector(
      surface === 'verdict' ? '#verdict-fold'
      : surface === 'peek' ? '#peek-card .pk-fold'
      : '#banner-actions');
    if (!holder) return null;
    const read = (el) => {
      if (!el) return { display: 'absent' };
      const cs = getComputedStyle(el);
      return { display: cs.display, opacity: cs.opacity, minH: parseFloat(cs.minHeight) || 0 };
    };
    const primary = holder.querySelector('.card-act');
    return {
      kids: holder.childElementCount,
      foldDisplay: getComputedStyle(holder).display,
      primary: primary ? {
        ...read(primary),
        verb: primary.dataset.verb || null,
        word: primary.querySelector('.card-act-w').textContent,
        label: primary.getAttribute('aria-label'),
        disabled: primary.disabled,
      } : { display: 'absent' },
      // The Reveal ITSELF, not the foot it sits in. U13 put a second verb in
      // that foot ("Save as pool…"), so reading the container answers about
      // whichever child happens to be showing — which is how a hook meant to
      // pin Reveal's visibility would have started reporting the keep verb's.
      reveal: read(holder.querySelector('.banner-foot .reveal-verb, .banner-foot .sm-reveal')),
      keep: read(holder.querySelector('.banner-foot .keep-verb')),
      foot: read(holder.querySelector('.banner-foot')),
      reroll: read(holder.querySelector('.pk-strip')),
    };
  },
  setChipsVisible(on) { setChips(on); return chipsOn; },
  get chipCount() { return chips.length; },
  // chrome (the two collapsible panel regions + emergent compact view):
  // open booleans per region, allCollapsed = the emergent body.mini state.
  // setPanelState applies a partial {region: bool} patch and returns the
  // resulting state. JSON-safe.
  get panelState() { return panelDebugState(); },
  // The section bar (§7.23). `shown` is COMPUTED DISPLAY, never the stored
  // booleans and never `.hidden` — asserting the intent instead of the
  // pixel is exactly how a fold once shipped two live verbs on every card
  // while the suite stayed green. `stored` is what a reload would restore,
  // which is the only way to catch a transient surfacing being laundered
  // into storage.
  get sections() {
    const vis = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
    return {
      shown: { dice: vis('die-buttons'), notation: vis('cmd'), pools: vis('groups-list') },
      stored: { ...sectionsStored },
      pressed: Object.fromEntries([...sectionBarEl.querySelectorAll('button')]
        .map((b) => [b.dataset.sec, b.getAttribute('aria-pressed') === 'true'])),
    };
  },
  setSections(patch) {
    for (const k of SECTION_KEYS) if (k in patch) setSection(k, !!patch[k], true);
    return { ...sectionsStored };
  },
  // roll-log flyout (the rail's ≣): open state + unread badge count, and
  // the direct driver for headless tests (clicks/keys stay the real paths).
  get logFlyout() { return { open: isLogFlyoutOpen(), badge: logUnread }; },
  setLogFlyout(open) {
    if (open) openLogFlyout(); else closeLogFlyout();
    return isLogFlyoutOpen();
  },
  // the draft cluster (P1): what the Pools panel's draft row shows now.
  // The draft's INTENT, as boxExtras holds it (U1). A scenario asserts on
  // this rather than on the canonical string, because the string is the
  // projection and the projection is what kept hiding the drop.
  get draftIntent() {
    return {
      dc: boxExtras.dc ?? null,
      exp: boxExtras.exp ?? null,
      comment: boxExtras.comment ?? null,
      visibility: boxExtras.visibility ? boxExtras.visibility.mode : null,
      mods: boxExtras.mods ? JSON.parse(JSON.stringify(boxExtras.mods)) : null,
      canonical: cmdInput.value,
      boxBroken: draftBoxBroken(),
      rollArmed: !trayRollBtn.disabled,
    };
  },
  // What a named pool would lose if staged into the draft as it stands.
  stageLossFor(name) {
    const g = groups.find((x) => x.name === name);
    return g ? stageLoss(g) : null;
  },
  get trayState() {
    return {
      dice: [...tray],
      sources: [...traySources],
      rollVisible: !trayRollBtn.classList.contains('hidden'),
      hasActions: !draftActionsEl.classList.contains('hidden'), // the rail stands

      hint: !trayHintEl.classList.contains('hidden'),
      xCount: trayXLayer.children.length,
      // §7.14 layout pins (computed, not class — the class lied once, D2):
      // the rail STANDS (visible with no pointer anywhere near), Offer's
      // real visibility, and the zone height the shelf headers pin under.
      railStanding: !draftActionsEl.classList.contains('hidden')
        && getComputedStyle(trayModsBtn).opacity === '1',
      offerVisible: getComputedStyle(offerDraftBtn).display !== 'none',
      draftH: draftZoneEl.offsetHeight,
      spent: traySpent, // 2i-E: rolled and untouched since
    };
  },
  // saved-pools manage mode (P2's ✎ toggle): read-only rows at rest; the
  // edit chrome exists only while this is on.
  get poolsEditMode() { return poolsEdit; },
  setPoolsEditMode(on) { setPoolsEdit(on); return poolsEdit; },
  openHelp(topic) { openHelpDialog(topic || null); return isHelpOpen(); },
  closeHelp() { closeHelpDialog(); return !isHelpOpen(); },
  get helpOpen() { return isHelpOpen(); },
  // §2l ③ — named rackDiceValue: shelfValue is already a live concept
  // (a die's face on the collect shelf).
  get rackDiceValue() {
    return {
      total: shelfDiceValue(groups),
      shelves: buildSections(groups, { ensureTrio: poolsEdit })
        .map((sec) => ({ label: sec.label, value: shelfDiceValue(sec.pools) })),
    };
  },
  // scenario seeding: replace the rack wholesale (validated + persisted).
  // Scenarios share one browser profile per origin, so a test must never
  // depend on the rack an earlier scenario left behind.
  setGroups(list) {
    if (!Array.isArray(list)) return false;
    const next = [];
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!raw || typeof raw.notation !== 'string' || !parseNotation(raw.notation).ok) return false;
      const rec = { id: Date.now() + i, name: cutText(String(raw.name || ''), 24), notation: raw.notation };
      if (raw.category) rec.category = cutText(String(raw.category), 24);
      next.push(rec);
    }
    groups = next;
    saveGroups();
    renderGroups();
    return groups.length;
  },
  // auto-collect (2026-08-01): tests opt in with a short clock; 0 = off
  get autoCollectMs() { return autoCollectMs; },
  setAutoCollectMs(ms) { autoCollectMs = Math.max(0, ms | 0); return autoCollectMs; },
  // the Sheet Pass (2026-08-01): drive the identity strip + ghost tiles
  renderGroups() { renderGroups(); return true; }, // an arbitrary repaint, for repaint-survival checks
  poolPopoverOpen(id) {
    const g = groups.find((x) => x.id === id);
    if (!g) return false;
    const tile = groupsListEl.querySelector(`[data-group-id="${CSS.escape(String(id))}"]`);
    openPopover({ source: 'group', group: g, row: tile });
    return !!(pop && pop.groupId === id);
  },
  get stripState() {
    const g = stripGroup();
    if (!g) return null;
    return {
      groupId: g.id,
      name: g.name,
      category: g.category || null,
      // the composer (Trigger Pass): units remove, rank faces add
      composer: !!popIdentityEl.querySelector('.pid-pool'),
      units: [...popIdentityEl.querySelectorAll('.pid-pool .cc-unit')]
        .map((u) => ({ title: u.title, disabled: u.disabled })),
      ranks: popIdentityEl.querySelectorAll('.pid-rank').length,
    };
  },
  get creatingShelf() { return creatingShelf; },
  openCreation(key) {
    creatingShelf = key;
    renderGroups();
    return creatingShelf;
  },
  // the owner switcher (ROADMAP 2b): whose rack the Pools panel shows
  get poolsOwner() { return poolsOwner; },
  setPoolsOwner(id) { setPoolsOwner(id || null); return poolsOwner; },
  get netPlayers() {
    return players.map((p) => ({ id: p.id, name: p.name,
      pools: (p.pools || []).map((g) => ({ ...g })),
      // §11: WHICH of their profiles the published rack is, and what it was
      // built for — the two fields that make a teammate's rack copyable rather
      // than merely visible. Present-or-absent on the wire, so null here rather
      // than absent, which is what a scenario can actually assert against.
      profile: p.profile || null,
      system: p.system || null,
      set: p.set || null }));
  },
  publishPools() { publishPools(); return true; },
  // the Pools tab flyout (the WHOLE panel body — draft + list — on hover
  // of the collapsed tab), driven directly where headless tests can't hover.
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
  // §7.20 presence row (the rail's first slot): ghosts = the dashed exits
  // (lobby verbs / Invite / unclaimed seat chairs), pills = the live roster.
  // One JSON projection so scenarios assert the row's grammar, never its DOM.
  get presenceRow() {
    return {
      ghosts: [...rosterEl.querySelectorAll('.rail-ghost')].map((b) => ({
        label: ((b.querySelector('.rg-label') || {}).textContent || '').trim(),
        title: b.title,
        dot: !!b.querySelector('.rg-dot'),
      })),
      pills: [...rosterEl.querySelectorAll('.roster-name')].map((el) => el.textContent.trim()),
    };
  },
  // §7.20 per-seat link (what an unclaimed chair copies): base + &as=Name.
  // Null in the lobby, exactly as inviteUrl() is.
  seatInviteUrl(name) { return seatInviteUrl(name); },
  get shroudedCount() { return tableDice.filter((d) => d.shrouded).length; },
  get revealingCount() { return revealing.length; },
  get pendingReveals() { return [...pendingReveals.keys()]; },
  // peek cards (§7.7.1): open for a shelved rollId / close with null, plus
  // the open card's state for content assertions.
  peek(rollId) {
    // null while pinned releases the pin first (close the shelf popover),
    // so a scenario's tidy-up can never leave a zombie card. (`via` retired
    // with the sweep — the card's body is the clear target in every
    // modality, whatever gesture opened it.)
    if (!rollId) { if (peekPinned()) closePopover(); closePeek(); return null; }
    return openPeek(rollId) ? rollId : null;
  },
  get peekState() {
    if (peekRollId === null) return null;
    return {
      rollId: peekRollId,
      // the strip's cue word ('REROLL' here — the draft's reads ROLL): the
      // closed CUE_WORDS vocabulary, asserted by tag, never scraped loosely
      cueWord: (peekEl.querySelector('.pk-again .cue-word') || { textContent: '' }).textContent.trim(),
      text: peekEl.textContent,
      breakdown: (peekEl.querySelector('.pk-breakdown') || { textContent: '' }).textContent,
      total: (peekEl.querySelector('.pk-total') || { textContent: '' }).textContent,
      hasReveal: !!peekEl.querySelector('.pk-reveal'),
      hasAgain: !!peekEl.querySelector('.pk-again'),
      hasTweak: !!peekEl.querySelector('.pk-tweak'),
      hasClear: !!peekEl.querySelector('.pk-clear'), // always false since the folded card — a regression pin
      hasMain: !!peekEl.querySelector('.pk-main'),   // the body clear target (folded card)
      hasFold: !!peekEl.querySelector('.pk-fold'),
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
      x: view.left + (v.x * 0.5 + 0.5) * view.width,
      y: (-v.y * 0.5 + 0.5) * view.height,
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
  // Tier 0 §0 (hot-paths): the floor's texture identity is now permanent —
  // this hook is the regression fence a scenario uses to prove no future
  // refactor reintroduces swapFloorMap-style dispose+new churn on shelf
  // changes, theme swaps, or mat-decal open/close.
  floorTextureId() { return (floor.material.map || {}).uuid || null; },
  sim(frames) { for (let i = 0; i < frames; i++) tick(1 / 60, false); },
  // Freeze the rAF clock: with it held, only sim() advances playback, which is
  // how a scenario parks a tab mid-tumble (a reveal arriving THERE must defer).
  holdClock(on) { clockHeld = !!on; return clockHeld; },
  get clockHeld() { return clockHeld; },
  fastForward: fastForwardPlayback,
};

// ONE refit for every felt-geometry change — window resizes AND side-panel
// toggles (the panel is layout now; collapsing it widens the canvas). It
// measures the panel, publishes --table-left (the CSS seam every
// felt-anchored overlay reads), recaches `view`, and re-derives everything
// that hangs off the camera.
const leftPanelEl = document.getElementById('left-panel');
function refitView() {
  const pw = Math.round(leftPanelEl.getBoundingClientRect().width);
  document.documentElement.style.setProperty('--table-left', `${pw}px`);
  const r = container.getBoundingClientRect();
  view.left = r.left;
  view.width = Math.max(1, r.width);
  view.height = Math.max(1, r.height);
  camera.aspect = view.width / view.height;
  camera.updateProjectionMatrix();
  renderer.setSize(view.width, view.height);
  particleField.setProjection(view.height, camera.fov);
  const px = renderer.getDrawingBufferSize(new THREE.Vector2());
  postStack.setSize(px.x, px.y);
  applyCameraFraming(); // a narrower felt refits the table and its shelf
  positionChips();
  measurePeek(); // the card's max-width tracks the viewport (100vw - 16px)
  positionShelfMarkers();
}
window.addEventListener('resize', refitView);

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
let traySources = []; // aligned to tray: the staged source-pool label per die (null = loose)
let traySets = [];    // aligned to tray: the staged pool's set OVERRIDE per die (§9; null = none)
// THE SPENT DRAFT (2i-E): true from the moment the draft ROLLS until its
// next edit. The draft itself always survives its roll — Enter-again is
// the deliberate repeat (never auto-cleared) — but a spent draft COOLS
// visibly, which is what separates "roll it again" from "compose the next
// roll on top of it by accident" (the silent-accretion trap: Wisdom ×4).
let traySpent = false;
// Per-die sets for the OUTGOING draft roll (§9 mixed pools: EACH die wears
// its own pool's skin — physical dice, Joe 2026-08-03), aligned to the dice
// actually sent. The tray branch sends tray order (traySets aligns 1:1);
// the box branch sends the canonical order, so entries map back through
// (source label, type) — one stage call shares one override, which makes
// the pair a stable key. Returns null when no die carries an override.
function draftDieSets(dice, sources) {
  if (!traySets.some(Boolean) || traySets.length !== tray.length) return null;
  const byKey = new Map();
  tray.forEach((t, i) => {
    const k = `${traySources[i] || ''}|${t}`;
    if (!byKey.has(k)) byKey.set(k, traySets[i] || null);
  });
  const out = dice.map((t, i) => {
    const src = (sources && sources[i]) || '';
    return byKey.get(`${src}|${t}`) ?? null;
  });
  return out.some(Boolean) ? out : null;
}

// Open ± popover state (see the popover section below). Declared this early
// because renderGroups AND the module-evaluation paintCmd() both run before
// the popover section is reached.
let pop = null;
// The floating dice-set menu's state (§9 compact select) — early for the
// same reason: closePopover (which closes any strip menu with it) is
// reachable from paths that run long before the select section.
let setMenuState = null; // { el, anchor } — one open menu app-wide

const dieButtonsEl = document.getElementById('die-buttons');
const trayEl = document.getElementById('tray');
const draftZoneEl = document.getElementById('draft-zone');
const trayRollBtn = document.getElementById('tray-roll');
const trayXLayer = document.getElementById('tray-x-layer');
const trayHintEl = document.getElementById('tray-hint');
const draftActionsEl = document.getElementById('draft-actions'); // the RAIL: Save · Offer · ✕ Clear

const trayModsBtn = document.getElementById('tray-mods');
const clearTrayBtn = document.getElementById('clear-tray');

const offerDraftBtn = document.getElementById('offer-draft');


// The section headers pin under the sticky draft (--draft-h feeds
// .pool-sec-head's top), so the value must track EVERY height change — the
// save morph, the rail appearing/leaving, wrapping source chips — not just
// renderTray's (which keeps its synchronous write for first paint).
// borderBoxSize, not offsetHeight, inside the callback: no forced reflow,
// no RO-loop warning. No feedback loop: --draft-h only moves the section
// headers, which cannot resize #draft-zone.
{
  const draftBody = document.querySelector('#builder-panel > .panel-body');
  if (draftBody && window.ResizeObserver) {
    new ResizeObserver((entries) => {
      const box = entries[0].borderBoxSize && entries[0].borderBoxSize[0];
      const h = box ? box.blockSize : entries[0].target.offsetHeight;
      draftBody.style.setProperty('--draft-h', `${Math.round(h)}px`);
    }).observe(draftZoneEl);
  }
}

// P1 — the dice are the buttons: each palette tile shows its die's real
// rendered art (the beveled mesh, hero-posed) above the type label. The tile
// stays a source-object with button chrome; the art is decorative to a
// screen reader (alt="") because the label text already names the die. When
// dieArtURL is null (no WebGL for the offscreen pass), .has-art never lands
// and the CSS ::before diamond keeps the tile legible — art never gates
// function.
function decorateDieBtn(btn, label, artType) {
  const url = dieArtURL(artType, diceSet);
  if (url) {
    btn.classList.add('has-art');
    const img = document.createElement('img');
    img.className = 'die-art';
    img.dataset.artType = artType; // refreshDieArt re-dresses it on set change
    img.src = url;
    img.alt = '';          // decorative: the label carries the name (a11y)
    img.draggable = false; // die art is clickable chrome, not a draggable image
    btn.appendChild(img);
  }
  btn.appendChild(document.createTextNode(label));
}

// A set change re-dresses every PROSPECTIVE die chip in place — palette
// tiles, tray/pool/offer strips — without re-running their renderers:
// every chip decorateDieBtn/buildDieStrip builds carries its die type in
// data-art-type. Log chips deliberately lack the attribute: the log is a
// record, and each entry keeps the set it was rolled with.
function refreshDieArt() {
  for (const img of document.querySelectorAll('img.die-art[data-art-type]')) {
    // data-art-set pins a chip to a POOL's own set (§9 override) — it
    // re-dresses only when its pool re-renders, never with your set.
    const u = dieArtURL(img.dataset.artType, img.dataset.artSet || diceSet);
    if (u) img.src = u;
  }
}

for (const type of DIE_TYPES) {
  const btn = document.createElement('button');
  btn.className = 'die-btn';
  decorateDieBtn(btn, type, type);
  btn.style.setProperty('--die-color', DIE_DEFS[type].color);
  btn.addEventListener('click', () => {
    if (tray.length < MAX_DICE_ON_TABLE) {
      tray.push(type);
      traySources.push(null);
      traySets.push(null); // a loose die carries no override
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
  decorateDieBtn(btn, 'd100', 'd10x'); // no d100 solid exists: reuse the d10x art
  btn.style.setProperty('--die-color', DIE_DEFS.d10x.color);
  btn.title = 'd10x + d10';
  btn.addEventListener('click', () => {
    if (tray.length + 2 <= MAX_DICE_ON_TABLE) {
      tray.push('d10x', 'd10');
      traySources.push(null, null);
      traySets.push(null, null);
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

// The draft cluster (P1): the composed dice ARE the roll button. One
// <button id=tray-roll> holds the die art (capped with the '+N' token, P5);
// each visible die gets a ✕ remover OVERLAID as an absolutely-positioned
// sibling in #tray-x-layer — never a button inside a button. ✕s show on
// cluster hover / keyboard focus, and are ALWAYS visible on coarse pointers
// (touch never has to text-edit a die away). Empty draft: the hint line.
const TRAY_STRIP_CAP = 12;
function renderTray() {
  trayRollBtn.innerHTML = '';
  trayXLayer.innerHTML = '';
  const hasDice = tray.length > 0;
  trayRollBtn.classList.toggle('hidden', !hasDice);
  // (the ghost's visibility lives in updateTrayButtons — every mutation
  // funnels there; toggling it here missed the remove-last-die path, whose
  // renderTray runs BEFORE syncBoxFromTray empties the box)
  if (hasDice) {
    // The composition reads by SOURCE (the Rack): each staged pool is one
    // chip — its name over its grouped dice — with ONE ✕ (unstage the
    // pool); loose palette dice group ×N by type with per-type ✕. The
    // whole cluster stays the ONE roll button.
    const srcOrder = [];
    const bySrc = new Map();
    tray.forEach((t, i) => {
      const s = traySources[i] || null;
      const k = s || '\u0000';
      // one stageGroup call = one chip, so the chip's set is its first
      // die's (§9): the chip previews the skin those dice will wear
      if (!bySrc.has(k)) { bySrc.set(k, { source: s, types: [], set: traySets[i] || null }); srcOrder.push(k); }
      bySrc.get(k).types.push(t);
    });
    // loose dice render last
    srcOrder.sort((a, b) => (a === '\u0000' ? 1 : 0) - (b === '\u0000' ? 1 : 0));
    const removers = []; // {el(anchor), title, onRemove}
    for (const k of srcOrder) {
      const grp = bySrc.get(k);
      if (grp.source) {
        const chip = document.createElement('span');
        chip.className = 'src-chip';
        const nm = document.createElement('span');
        nm.className = 'src-chip-name';
        nm.textContent = grp.source;
        chip.appendChild(nm);
        // The strip rides its OWN row inside the plate: buildDieStrip returns
        // a fragment, so its ×N counts became column children of the plate
        // and stacked under the die (a d6 with '×4' beneath it, plates of
        // two different heights side by side).
        const row = document.createElement('span');
        row.className = 'sc-dice';
        row.appendChild(buildDieStrip(grp.types, 3, { grouped: true, set: grp.set }));
        chip.appendChild(row);
        trayRollBtn.appendChild(chip);
        removers.push({
          el: chip,
          title: `Remove ${grp.source}`,
          onRemove: () => {
            const keep = tray.map((t, i) => [t, traySources[i], traySets[i]])
              .filter(([, s]) => (s || null) !== grp.source);
            tray = keep.map(([t]) => t);
            traySources = keep.map(([, s]) => s || null);
            traySets = keep.map(([, , v]) => v || null);
            renderTray();
            syncBoxFromTray();
          },
        });
      } else {
        // loose dice: grouped ×N, one ✕ per TYPE (removes one die)
        const strip = buildDieStrip(grp.types, TRAY_STRIP_CAP, { grouped: true });
        const holder = document.createElement('span');
        holder.className = 'loose-dice';
        holder.appendChild(strip);
        trayRollBtn.appendChild(holder);
        const looseTypes = [...new Set(grp.types)];
        const arts = holder.querySelectorAll('.die-art, .strip-dot');
        arts.forEach((img, gi) => {
          const type = looseTypes[gi];
          if (!type) return;
          removers.push({
            el: img,
            title: `Remove one ${type}`,
            onRemove: () => {
              const idx = tray.findIndex((t, i) => t === type && !(traySources[i] || null));
              if (idx < 0) return;
              tray.splice(idx, 1);
              traySources.splice(idx, 1);
              traySets.splice(idx, 1);
              renderTray();
              syncBoxFromTray();
            },
          });
        });
      }
    }
    trayRollBtn.appendChild(buildRollCue('roll', true)); // the well: balanced cue
    const label = `Roll ${formula(tray)}`
      + (traySpent ? ' again — this draft already rolled' : '');
    trayRollBtn.title = label;
    trayRollBtn.setAttribute('aria-label', label);
    const units = srcOrder.length + new Set(tray.filter((t, i) => !traySources[i])).size;
    // ✕ overlays: SIBLINGS in the x-layer, anchored to live layout (zero
    // while display:none — callers re-render on reveal paths). Each ✕
    // registers its anchor for the cluster's proximity hit-test below.
    trayRemovers.length = 0;
    for (const r of removers) {
      const x = document.createElement('button');
      x.className = 'die-x';
      x.textContent = '✕';
      x.title = r.title;
      // The NAME, not just the tooltip (U22): accname never reaches `title`
      // for a button that has content, and '✕' is content — so this
      // announced as "✕" and nothing more, on the one control that decides
      // WHICH die leaves.
      x.setAttribute('aria-label', r.title);
      // INSIDE its chip's top-right corner (2i-C S1): straddling the edge
      // put the ✕ in the gutter between neighbouring pool chips, ambiguous
      // about which one it removes. Overlapping the chip's own art is safe
      // — the proximity reveal shows exactly one ✕ at a time.
      x.style.left = `${r.el.offsetLeft + r.el.offsetWidth - 18}px`;
      x.style.top = `${r.el.offsetTop - 4}px`;
      x.addEventListener('click', (e) => {
        e.stopPropagation(); // a remove is never a roll
        r.onRemove();
      });
      trayXLayer.appendChild(x);
      trayRemovers.push({ anchorEl: r.el, xEl: x });
    }
  } else {
    trayRemovers.length = 0;
  }
  // updateTrayButtons FIRST: it is what raises and drops the rail, and the
  // rail is 34px of the zone's height. Measuring before it ran wrote a
  // value stale by exactly that on every transition — the headers pinned
  // 34px too high until the ResizeObserver's next frame caught it, and on
  // a browser without RO (the guarded fallback below) they stayed there.
  updateTrayButtons();
  // The beacon's heat (Joe 2026-08-03): 0 empty → 4 at eight-plus dice,
  // as STEPPED classes the CSS transitions smooth. The --draft-heat var
  // rides alongside for introspection/tests; visuals key off the classes.
  // Light only; the geometry never moves with it (§7.10).
  const heat = Math.min(Math.ceil(tray.length / 2), 4);
  draftZoneEl.style.setProperty('--draft-heat', String(heat / 4));
  for (let h = 1; h <= 4; h++) draftZoneEl.classList.toggle(`heat-${h}`, heat === h);
  draftZoneEl.classList.toggle('spent', traySpent && tray.length > 0); // 2i-E
  // sticky geometry: section headers pin just below the sticky draft
  const body = document.querySelector('#builder-panel > .panel-body');
  if (body) body.style.setProperty('--draft-h', `${draftZoneEl.offsetHeight}px`);
}

// THE TWO PROJECTIONS DISAGREE (§1.3, U2). The box and the cluster are two
// views of one spec object, so there is no answer to "which is right" when
// the text stops parsing — and the old code answered anyway, by silently
// firing the TRAY: type `2d8 secret`, break it with one character, press the
// plate, and it rolled `2d8` in the open. The safe answer is to do nothing,
// loudly. A draft is unusable while its text is broken, whatever dice are
// still sitting in the well.
function draftBoxBroken() {
  return !!(cmdInput.value.trim()) && !(cmdResult && cmdResult.ok);
}

// The press that lands on a disarmed plate anyway (the global Enter, a
// stale pointer) gets told WHY: the box shakes, and if the section is off
// the box comes back for this visit only — the error lives in the box, so
// the box has to be on screen to carry it.
function refuseBrokenBox() {
  if (typeof setSection === 'function' && !sectionOn('notation')) {
    setSection('notation', true, false);
  }
  const boxEl = cmdEl;
  if (!boxEl) return;
  boxEl.classList.remove('cmd-shake');
  void boxEl.offsetWidth; // restart the animation
  boxEl.classList.add('cmd-shake');
  cmdInput.focus();
}

function updateTrayButtons() {
  const usable = (cmdResult && cmdResult.ok) || (tray.length > 0 && !draftBoxBroken());
  // The ghost dice REAPPEAR whenever the well truly empties (Joe: removing
  // the last die must bring them back) — read live state, not renderTray's
  // snapshot: the ✕-remover path re-renders before the box catches up.
  trayHintEl.classList.toggle('hidden', tray.length > 0 || !!cmdInput.value);
  // The management RAIL (Save · Offer · ✕ Clear) is STANDING FURNITURE
  // (Joe 2026-08-03: appearing/disappearing verbs resized the zone — keep
  // them on screen, gray them out): always rendered, buttons disabled
  // until a draft exists, so the workbench's geometry never moves. The
  // save morph still swaps in for the rail (same slot, no resize).
  draftActionsEl.classList.remove('hidden'); // standing furniture, always
  trayRollBtn.disabled = !usable;
  trayModsBtn.disabled = !usable;
  clearTrayBtn.disabled = !tray.length && !cmdInput.value;
  // Offers need a table: the verb HIDES solo (quiet chrome — a standing
  // disabled button would be noise a solo table can never use). The ▾
  // additionally needs someone to target — it waits for a teammate.
  offerDraftBtn.classList.toggle('hidden', !netOnline);
  offerDraftBtn.disabled = !usable;
  const hasTargets = netOnline && net && players.some((p) => p.id !== net.playerId && p.name);
  // A whisper draft is already ADDRESSED (Joe 2026-08-03): the server
  // derives the claim gate from its audience, so the ▾ has nothing to
  // choose — it hides rather than offering a picker whose off-audience
  // answers would all refuse.
  const whisperDraft = !!(boxExtras && boxExtras.visibility && boxExtras.visibility.mode === 'whisper');
  offerPickBtn.classList.toggle('hidden', !hasTargets || whisperDraft);
  offerPickBtn.disabled = !usable;
  if (!hasTargets || whisperDraft) closeOfferMenu();
}

// Roll the draft — the cluster click, the Enter key, and nothing else.
function rollDraft() {
  // Re-parse the current text synchronously: the debounced cmdResult can be
  // up to 300 ms stale, and the parsed spec must match the notation we send.
  paintCmd();
  if (cmdResult && cmdResult.ok) {
    // Same derivation as Enter (commandRoll): the moment the string DECLARES
    // wins, and dc→check only fills the gap. Reading the dc alone dropped a
    // 'cinematic'/'check' the player had typed (solo played it Plain) and let
    // the online and solo paths disagree about the same text.
    const intent = notationIntent(cmdInput.value.trim(), cmdResult);
    // §9: the box branch is the STAGED draft's own roll path (staging syncs
    // the box), so pool overrides ride here too — PER DIE (mixed pools):
    // uniform drafts keep the old singular field, mixed ones send `sets`.
    // traySets keeps this honest — a hand-edited box already reset it
    // (paintCmd's tray resync).
    const perDie = draftDieSets(cmdResult.spec.dice, cmdResult.spec.sources || null);
    const uniform = perDie && perDie.every((s) => s && s === perDie[0]) ? perDie[0] : null;
    requestRoll(cmdResult.spec.dice, cmdResult.comment || cmdResult.canonical, {
      notation: intent.notation,
      canonical: intent.canonical,
      mods: cmdResult.spec.mods || undefined,
      sources: cmdResult.spec.sources || undefined, // 2b-⑤ (solo keeps them too)
      faceDown: cmdResult.faceDown,
      visibility: visOfParse(cmdResult) || undefined,
      dc: cmdResult.dc ?? undefined,
      exp: intent.exp || undefined,
      ...(uniform ? { set: uniform } : perDie ? { sets: perDie } : {}),
    });
  } else if (draftBoxBroken()) {
    // U2: never substitute the stale tray for text that stopped parsing.
    refuseBrokenBox();
    return;
  } else if (tray.length) {
    const perDie = draftDieSets(tray, traySources);
    const uniform = perDie && perDie.every((s) => s && s === perDie[0]) ? perDie[0] : null;
    requestRoll([...tray], formula(tray), {
      sources: traySources.some(Boolean) ? [...traySources] : undefined,
      ...(uniform ? { set: uniform } : perDie ? { sets: perDie } : {}),
    });
  } else {
    return; // nothing fired — nothing to mark spent
  }
  setTraySpent(true); // 2i-E: the draft survives, wearing its cool-down
}
trayRollBtn.addEventListener('click', rollDraft);

// 2i-E: flip the spent state without a full re-render (mutations that
// clear it already re-render on their own paths).
function setTraySpent(on) {
  const next = !!on && tray.length > 0;
  if (traySpent === next) return;
  traySpent = next;
  draftZoneEl.classList.toggle('spent', next);
  if (tray.length) {
    const label = `Roll ${formula(tray)}`
      + (next ? ' again — this draft already rolled' : '');
    trayRollBtn.title = label;
    trayRollBtn.setAttribute('aria-label', label);
  }
}

// Offer the draft to the table (Trigger Pass): the popover's 'Offer to
// table' retired with its Roll, so the draft row is where offers fire —
// same full-intent carrier as rollDraft (the box canonical), same
// validation gates as Shift+Enter in the box. `to` (a player name) makes
// it a TARGETED offer (4b) — the ▾ menu's path; the server resolves the
// name against the roster and pins the claimant ids fail-closed.
function offerDraft(to = null) {
  if (!netOnline || !net) return;
  paintCmd();
  if (cmdResult && cmdResult.ok) commandOffer(cmdInput.value, to);
  else if (draftBoxBroken()) refuseBrokenBox(); // U2: same refusal as the plate
  else if (tray.length) net.offer({ label: formula(tray), dice: [...tray], ...(to ? { to } : {}) });
}
offerDraftBtn.addEventListener('click', () => offerDraft());

// The ▾ picker: a split button beside the plain verb (one-click table-wide
// muscle memory stays). The menu is rebuilt from the live roster on every
// open — names are presence, and a stale menu could target a ghost.
const offerPickBtn = document.getElementById('offer-pick');
const offerMenu = document.getElementById('offer-menu');
function isOfferMenuOpen() { return !offerMenu.classList.contains('hidden'); }
function closeOfferMenu() {
  offerMenu.classList.add('hidden');
  offerPickBtn.setAttribute('aria-expanded', 'false');
}
function openOfferMenu() {
  const you = net ? net.playerId : null;
  // duplicate names collapse to one row — the server pins ALL matching ids,
  // the same join rule whisper audiences document
  const names = [...new Map(players.filter((p) => p.id !== you && p.name)
    .map((p) => [p.name.toLowerCase(), p.name])).values()];
  if (!names.length) return;
  offerMenu.textContent = '';
  for (const n of names) {
    const b = document.createElement('button');
    b.className = 'idm-item offer-menu-item';
    b.setAttribute('role', 'menuitem');
    b.textContent = `Offer to ${n}`; // user-supplied: textContent only
    b.addEventListener('click', () => {
      closeOfferMenu();
      offerDraft(n);
    });
    offerMenu.appendChild(b);
  }
  offerMenu.classList.remove('hidden');
  offerPickBtn.setAttribute('aria-expanded', 'true');
  const r = offerPickBtn.getBoundingClientRect();
  offerMenu.style.left = `${Math.round(Math.max(12, Math.min(r.left, window.innerWidth - offerMenu.offsetWidth - 12)))}px`;
  offerMenu.style.top = `${Math.round(Math.min(r.bottom + 6, window.innerHeight - offerMenu.offsetHeight - 12))}px`;
}
offerPickBtn.addEventListener('click', () => {
  if (isOfferMenuOpen()) closeOfferMenu();
  else openOfferMenu();
});
// click-away closes (capture phase, like the creation card's away rule);
// clicks on the ▾ itself fall through to its toggle handler above
document.addEventListener('pointerdown', (e) => {
  if (!isOfferMenuOpen()) return;
  if (offerMenu.contains(e.target) || offerPickBtn.contains(e.target)) return;
  closeOfferMenu();
}, true);

// Right-click the cluster = ± (a pointer bonus; the visible ± button is the
// path for touch and keyboard).
// PROXIMITY ✕ reveal (Joe 2026-08-03: every remover lighting on cluster
// hover was distracting): only the ✕ whose die or pool chip the pointer
// is actually over shows. Hit-tested here because the art is
// pointer-events:none (the button owns the click) — CSS cannot scope a
// sibling overlay to its anchor. One static handler; renderTray refills
// trayRemovers. The pad reaches to the ✕'s own corner so the reveal
// survives the travel from die to ✕.
const trayRemovers = []; // {anchorEl, xEl}, rebuilt by renderTray
trayEl.addEventListener('pointermove', (e) => {
  if (e.pointerType && e.pointerType !== 'mouse') return; // touch keeps all ✕s standing
  for (const r of trayRemovers) {
    const b = r.anchorEl.getBoundingClientRect();
    const over = e.clientX >= b.left - 4 && e.clientX <= b.right + 12
      && e.clientY >= b.top - 12 && e.clientY <= b.bottom + 4;
    r.xEl.classList.toggle('show', over);
  }
});
trayEl.addEventListener('pointerleave', () => {
  for (const r of trayRemovers) r.xEl.classList.remove('show');
});

trayEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (trayModsBtn.disabled) return;
  trayModsBtn.click();
});

// ---- the section bar: Dice · Notation · Pools (§7.23) -----------------------
// Three independent switches over the three SOURCES that feed the workbench.
// The old two-value view picker is superseded: §1.3 already makes the box and
// the cluster projections of one spec object (`parse(render(spec)) ≡ spec`),
// so showing both was never a correctness problem — the exclusivity bought
// density, and density is a preference. Per-user, like panel state.
const LS_SECTIONS = 'dice.sections.v1';
const LS_INPUTMODE = 'dice.inputmode.v1'; // legacy; read once at boot, never written again
const SECTION_KEYS = ['dice', 'notation', 'pools'];
const builderPanelEl = document.getElementById('builder-panel');
const sectionBarEl = document.getElementById('section-bar');

// TWO objects, deliberately. `sectionsStored` is the persisted truth and only
// an explicit cell click ever mutates it; `sectionsShown` carries a TRANSIENT
// surfacing (loading a pool into the box turns Notation on for that visit).
// One merged object would have quietly written the transient bit the next
// time any OTHER cell was clicked — the audit already caught that exact bug
// once on the old single variable (see loadIntoBox), and the state shape is
// what has to prevent it, not care at each call site.
let sectionsStored = (() => {
  const st = load(LS_SECTIONS, null);
  if (st && typeof st === 'object') {
    // Asymmetric per-key defaults, matching the shipped ones, so a partial or
    // hand-edited object degrades to today's panel rather than an empty one.
    return { dice: st.dice !== false, notation: st.notation === true, pools: st.pools !== false };
  }
  // MIGRATION, pixel-identical in both directions: every existing user's panel
  // shows exactly what it showed yesterday, which is the receipt that P1
  // survives this supersession. Louder is now a choice, never a default.
  return load(LS_INPUTMODE, 'dice') === 'text'
    ? { dice: false, notation: true, pools: true }
    : { dice: true, notation: false, pools: true };
})();
let sectionsTransient = { dice: false, notation: false, pools: false };
const sectionOn = (k) => !!(sectionsStored[k] || sectionsTransient[k]);

function applySections(persist = true) {
  for (const k of SECTION_KEYS) {
    // OFF-classes, never on-classes: the bare cascade shows everything, so a
    // JS failure degrades to a full panel instead of an empty one.
    builderPanelEl.classList.toggle(`sec-off-${k}`, !sectionOn(k));
  }
  for (const b of sectionBarEl.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(sectionOn(b.dataset.sec)));
  }
  if (persist) save(LS_SECTIONS, sectionsStored);
}

// persist=false is the TRANSIENT door and only ever turns a section ON.
function setSection(key, on, persist = true) {
  if (!SECTION_KEYS.includes(key)) return;
  const was = sectionOn(key);
  if (persist) {
    sectionsStored[key] = !!on;
    sectionsTransient[key] = false; // an explicit choice ends the loan
  } else if (on) {
    sectionsTransient[key] = true;
  }
  // Turning the box off while it holds an unparseable string would leave the
  // draft's tools graying for a reason nobody can see. The box is the model
  // even when hidden, so regenerate the projection rather than archive a
  // broken one.
  if (key === 'notation' && was && !sectionOn(key) && cmdEl.classList.contains('is-invalid')) {
    syncBoxFromTray();
  }
  // Manage mode is rack chrome; it cannot outlive the rack going off screen
  // (the same call the collapse path makes).
  if (key === 'pools' && was && !sectionOn(key)) setPoolsEdit(false);
  applySections(persist);
  if (!was && sectionOn(key) && key === 'notation') cmdInput.focus();
}

sectionBarEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  setSection(btn.dataset.sec, !sectionOn(btn.dataset.sec), true);
});
applySections(false);
// The ad-hoc tray's ± (§7.4): the SAME popover, bound to the tray draft.
// THE RIM'S WORD IS THE SYSTEM'S (U11). `soul-deal` — the DEFAULT — sets
// usesMods:false, which folds Modifier, d20 pairing, Target and keep/drop
// out of the popover entirely. So the panel's loudest tool said "± Modify"
// with title="Modifiers, target, moment" while two of those three were
// absent, and U1's own set-aside note pointed at it as the remedy
// ("re-add via ±") for a `dc` the popover cannot express.
function updateTrayModsWord() {
  if (!trayModsBtn) return;
  // THE BUTTON NAMES WHAT IS BEHIND IT. `soul-deal` — the DEFAULT — sets
  // usesMods:false, which folds Modifier, d20 pairing, Target and keep/drop
  // out of the popover entirely; the rim still said "± Modify" over
  // "Modifiers, target, moment", two of which were absent, and U1's set-aside
  // note pointed here as the remedy for a `dc` this popover cannot express.
  //
  // "Modify, never Tweak" (Joe 2026-08-04) is a TERMINOLOGY guideline — it
  // bans the weak synonym, it does not pin one label for all time (Joe
  // 2026-08-08, correcting a first pass that read it as a pin and changed
  // only the tooltip). So the word follows the system and 'Tweak' stays dead.
  // U17 #32 APPLIES U11'S RULE RATHER THAN OVERTURNING IT. `± Moment` was
  // right when the popover held two of seven sections. After the fold keys
  // off usesTotal and Target, pairing, keep/drop and reroll come back, it
  // holds SIX of seven — and naming one of six is the same defect U11 fixed.
  const full = activeSystem().usesTotal;
  trayModsBtn.textContent = '± Modify';
  trayModsBtn.title = full
    ? 'Modifiers, target, moment'
    : 'Target, moment, visibility, keep/drop — everything but the flat bonus, '
      + 'which needs a total this system never computes';
}
updateTrayModsWord();

trayModsBtn.addEventListener('click', () => {
  if (pop && pop.source === 'tray') {
    closePopover();
    return;
  }
  paintCmd(); // synchronous re-parse: the debounced cmdResult can be stale
  openPopover({ source: 'tray', row: document.getElementById('tray-actions') });
});

function clearDraft() {
  tray = [];
  traySources = [];
  traySets = [];
  // Every key of the declared draft shape, including the §7.6/goal-11 ones:
  // canonicalNotation's defaults would absorb the missing ones today, but a
  // half-shaped boxExtras is a trap for the next reader of it.
  boxExtras = { mods: null, dc: null, comment: null, exp: null, visibility: null };
  cmdInput.value = '';
  renderTray();
  paintCmd();
}
clearTrayBtn.addEventListener('click', clearDraft);

// ---------------------------------------------------------------------------
// Command box (UX §1.3): one canonical string, two editors. Three validation
// states on a 300 ms debounce — valid (gold + canonical/exact preview),
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

// Exact by construction (js/odds.js) — assertable text, stable across
// repaints, identical on every seat. The rare cap-truncation corners come
// back exact:false and must SAY they are sampled (POOL-ANALYSIS §6.3:
// labeled, seeded, never a bare ≈).
function fmtPreview(dice, mods) {
  const p = previewOf(dice, mods);
  const avg = Math.round(p.avg * 10) / 10;
  const label = p.exact ? '' : ' · sampled — 4,000 rolls';
  return `min ${p.min} avg ${Number.isInteger(avg) ? avg : avg.toFixed(1)} max ${p.max}${label}`;
}

// Three-state validation paint shared by the panel box and the quick palette:
// valid (gold + canonical/exact preview + warnings), incomplete
// (neutral, never red), invalid (red + error + hint). Pure presentation —
// callers own their side effects (tray sync, buttons).
function renderCmdState(boxEl, slotEl, res, raw) {
  slotEl.textContent = '';
  boxEl.classList.toggle('is-valid', res.ok === true);
  const bad = !res.ok && res.state === 'invalid';
  boxEl.classList.toggle('is-invalid', bad);
  // …AND SAY SO OUT LOUD (U22, audit D4). The red border and the message in
  // the slot were the entire error channel, both purely visual. aria-invalid
  // makes the state a fact of the control, and describedby binds the message
  // to it — the slot already IS the validator's voice (§2l), so this needs no
  // second surface, only the wire between the two that was never run.
  const input = boxEl.querySelector('.cmd-in');
  if (input) {
    input.setAttribute('aria-invalid', String(bad));
    if (slotEl.id) input.setAttribute('aria-describedby', slotEl.id);
  }
  const span = (cls, text) => {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    slotEl.appendChild(el);
  };
  if (res.ok) {
    // THE BOX MUST NOT FORECAST A SUM THE SYSTEM NEVER ADDS (U7). fmtPreview
    // prints `min/avg/max` unconditionally, so under soul-deal — the DEFAULT
    // system, where no total lands anywhere — the box forecast a total while
    // the app's own Help stated the per-die rule on the same screen. The
    // popover already branches correctly; this is that branch, at the width
    // a one-line slot has.
    //
    // The slot is the VALIDATOR as well as the read (§2l), so every path here
    // must REPLACE, never blank: a per-die system gets a phrase naming where
    // the real spread lives, a refusal gets its own reason, and only a system
    // that actually sums gets the sum.
    const sys = activeSystem();
    const fc = sys.forecastFor
      ? sys.forecastFor(res.spec, { countingPmfs }) : null;
    const read = fc && fc.kind === 'refusal' ? fc.reason
      : fc && fc.kind === 'per-die' ? 'per-die outcomes — ± for the spread'
        : fmtPreview(res.spec.dice, res.spec.mods);
    span('ok', `${res.canonical} · ${read}`);
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
    const boxSources = res.spec.sources
      ? res.spec.sources.map((s) => s || null)
      : res.spec.dice.map(() => null);
    if (tray.join('\u0000') !== res.spec.dice.join('\u0000')
        || traySources.map((s) => s || '').join('\u0000') !== boxSources.map((s) => s || '').join('\u0000')) {
      // §9: remap per-die overrides through (source, type) BEFORE the
      // arrays swap. The canonical REORDERS dice (grouped spelling), and a
      // reorder must not cost identity — the first cut reset here and
      // silently stripped every mixed draft the moment a palette die
      // joined. Only dice with no staged (source, type) partner reset:
      // notation carries no set, so a hand-typed stranger is YOUR hand —
      // but a die still wearing its pool's attribution keeps its skin.
      const stagedSet = new Map();
      tray.forEach((t, i) => {
        const k = `${traySources[i] || ''}|${t}`;
        if (!stagedSet.has(k)) stagedSet.set(k, traySets[i] || null);
      });
      tray = [...res.spec.dice];
      traySources = boxSources;
      traySets = tray.map((t, i) => stagedSet.get(`${boxSources[i] || ''}|${t}`) ?? null);
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
  setTraySpent(false); // 2i-E: every structural edit re-warms the draft
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
  const spec = { dice: [...tray], mods };
  if (traySources.some(Boolean)) spec.sources = [...traySources];
  cmdInput.value = canonicalWithVis(spec, {
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
  // §9: Enter on a box the STAGING itself filled is the same roll as the
  // cluster click — pool overrides ride, per die. Any hand-typed divergence
  // already reset traySets via paintCmd, so this stays truthful.
  const perDie = draftDieSets(res.spec.dice, res.spec.sources || null);
  const uniform = perDie && perDie.every((s) => s && s === perDie[0]) ? perDie[0] : null;
  requestRoll(res.spec.dice, res.comment || res.canonical, {
    notation: intent.notation,
    canonical: intent.canonical,
    mods: res.spec.mods || undefined,
    sources: res.spec.sources || undefined, // 2b-⑤ (solo keeps them too)
    faceDown: res.faceDown, // 'held' and the /gmroll family both land here
    visibility: visOfParse(res) || undefined, // secret / w: (goal 11)
    dc: res.dc ?? undefined,
    exp: intent.exp || undefined,
    ...(uniform ? { set: uniform } : perDie ? { sets: perDie } : {}),
  });
  return res;
}

// Offer a notation string to the table (Shift+Enter — §7.4). Same validation
// gates as commandRoll; online only (callers show the solo refusal). Parsed
// in OFFER context: 'blind' is legal here (dice tower → secret), and the box
// paints in roll context so typing it shows the teaching error until the
// player offers instead of rolling — which is the teaching.
function commandOffer(input, to = null) {
  const raw = (typeof input === 'string' ? input : cmdInput.value).trim();
  const res = parseNotation(raw, { offer: true });
  if (!res.ok) return res;
  if (!netOnline || !net) return res;
  net.offer({
    label: res.comment || res.canonical,
    notation: notationIntent(raw, res).notation,
    ...(to ? { to } : {}), // targeted offer (4b): one named claimant
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
  // In the lobby you are not solo as a FALLBACK, you chose no table — so the
  // refusal names the exit instead of diagnosing you.
  el.textContent = IN_LOBBY
    ? 'offers need a table — start one from the lobby'
    : 'offers need a table — you are playing solo';
  slotEl.appendChild(el);
}

const cmdHistoryWalk = makeHistoryWalker(cmdInput, paintCmd);

cmdInput.addEventListener('input', () => {
  cmdHistoryWalk.reset(); // typing abandons a history walk
  setTraySpent(false); // 2i-E: typing is an edit — the draft re-warms
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

// Net state, declared before the first module-scope render calls: paintCmd →
// renderCmdState reads netOnline whenever the box parses, and renderGroups
// (further down) reads the roster. Assigned by initNet at the bottom.
let net = null;         // live connection handle from net.connect (online only)
let netOnline = false;
let players = [];
let poolsOwner = null;  // a player id, or null = your own rack
// The room's prepared table as this client knows it (§G4): {rev, table,
// profiles, at} or null. Seeded from the join response, tracked on 'hello'
// (present-or-absent — an absent key means the room genuinely has none) and
// 'table-setup'. The §G5 seat picker reads profiles out of it after the
// join; §G6's re-push compares its rev against the one this client pushed.
let roomSetup = null;
// §11: the mismatch acknowledgement — set when the player has been told their
// profile's system is not this table's and answered "Keep". Per session and per
// room by construction (a module `let` in a page that reloads to change rooms),
// so the banner names the situation once and then stops.
let mismatchKept = false;

renderTray();
paintCmd();

// ---------------------------------------------------------------------------
// Saved groups
// ---------------------------------------------------------------------------

// Groups come from localStorage, otherwise starter defaults.
//
// THE URL IS NOT STORAGE (Joe 2026-08-04). Until today the whole rack rode
// the address bar as `#g=<base64url>`, rewritten on every edit and read at
// boot AHEAD of localStorage — which meant opening someone else's pools link
// silently overwrote your own rack, with no preview and no undo (measured,
// not theorized). Explicit export/import owns that job now (js/portable.js:
// preview the plan, merge by name, delete nothing), so the codec is gone
// rather than patched. The URL addresses a TABLE (?room=) and nothing else.
//
// A group is {id, name, notation} — notation is the canonical string from
// js/notation.js and is what the Roll button actually parses and rolls. Old
// {id, name, dice:[...]} records (pre-notation localStorage) migrate lazily
// here on load; anything unreadable is dropped rather than guessed at.
function migrateGroup(g, i) {
  if (!g || typeof g !== 'object') return null;
  const name = typeof g.name === 'string' ? cutText(g.name, 24) : '';
  // category rides every shape, present-or-absent (2b-②; the rebuild here
  // silently DROPPED it on every boot until 2026-08-01 — stored racks and
  // imported ones both funnel through this function)
  const cat = typeof g.category === 'string' && g.category.trim() ? cutText(g.category, 24) : null;
  // set override (§9): same present-or-absent ride; ids the SETS registry
  // doesn't know fall closed to no override — the pool survives (storage and
  // import both funnel through here, so hostile/stale ids die at this door)
  const set = typeof g.set === 'string' && (g.set === 'std' || SETS[g.set]) ? g.set : null;
  const dress = (rec) => ({ ...rec, ...(cat ? { category: cat } : {}), ...(set ? { set } : {}) });
  if (typeof g.notation === 'string') {
    const res = parseNotation(g.notation);
    return res.ok ? dress({ id: g.id ?? i + 1, name, notation: res.canonical }) : null;
  }
  if (Array.isArray(g.dice) && g.dice.length && g.dice.length <= MAX_DICE_ON_TABLE
      && g.dice.every((t) => DIE_DEFS[t])) {
    return dress({ id: g.id ?? i + 1, name, notation: formula(g.dice) });
  }
  return null;
}

// Sweep up after the codec: an address bar left holding a `#g=` from before
// the drop would carry it forever, since nothing rewrites the hash any more.
// This ignores what it says — the rack above is already loaded from storage —
// and just takes the corpse out of the URL.
if (/[#&]g=/.test(location.hash)) {
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
}

// THE LIBRARY (docs/PROFILES.md §11). One store key, and the profile it names
// active IS the rack — so `groups` below is not loaded from storage of its own
// any more, it is a view of `profileStore`.
//
// Tier G's RELOAD GUARD is gone from here along with the swap it guarded. It
// existed because `Edit ⟨name⟩` copied a profile's pools into the one rack and
// stashed yours beside it, so a tab that died mid-edit booted holding somebody
// else's pools under your name — the `#g=` codec's exact failure (GOALS §7) —
// and the only repair was to restore the stash and DROP the half-edited rack.
// A library has somewhere to put both, so migrateLegacy keeps both: the stash
// becomes your profile and the rack in front of it becomes 'Recovered'. This is
// the one place this pass gains data rather than merely moving it.
let profileStore = normalizeStore(load(LS_PROFILES, null));
if (!profilesOf(profileStore).length) {
  // First boot on the library. Everything below runs ONCE — after this the
  // store is non-empty forever (deleteProfile refuses the last one), so the
  // legacy keys are read here and never again.
  const legacyRack = load(LS_GROUPS, null);
  const legacyMine = load(LS_GROUPS_MINE, null);
  // The system the migrated rack is bound to: whatever table this browser last
  // configured, else the default. Guessing 'soul-deal' for a rack built at a
  // D&D table would strand it as a mismatch on its very first boot.
  const stored = load(LS_ROOMSETTINGS, null);
  const bootSystem = knownSystem(stored && stored.system) || DEFAULT_SYSTEM;
  let label = '';
  try { label = (localStorage.getItem(LS_NAME) || '').trim().replace(/#/g, ''); } catch { /* ignore */ }
  if (Array.isArray(legacyRack) && legacyRack.length) {
    profileStore = migrateLegacy({
      groups: legacyRack,
      mine: legacyMine,
      system: bootSystem,
      set: diceSet !== 'std' ? diceSet : null,
      label: label || 'My pools',
    });
  }
  if (Array.isArray(legacyMine)) {
    // Spent: there are no rack swaps left for a stash to mean, and leaving it
    // would migrate a second time if the library were ever cleared.
    try { localStorage.removeItem(LS_GROUPS_MINE); } catch { /* ignore */ }
  }
  // The Soul Deal starting rack (Joe, 2026-08-01; DEALT since 2026-08-08): the
  // nine attributes in their Physical/Mental/Social triads, six weapon skills
  // and three motivations — a fresh seat can stage attribute+skill+motivation
  // and roll ('1 2 3 Enter' territory). The dice are dealt at random inside
  // each shelf's price (js/seed.js), so a fresh browser opens on a character
  // rather than on eleven identical d6 pools; the ✎ editor is still the
  // advancement path. Dealt ONCE, at the moment storage is empty — a reload
  // never re-rolls a rack out from under its owner. It becomes profile #1
  // with no prompt of any kind: the lobby asks nothing, and the first tap
  // rolls (ROADMAP §3b L0).
  if (!profilesOf(profileStore).length) {
    addProfile(profileStore, {
      name: label || dealName(bootSystem),
      system: bootSystem,
      pools: dealRack(bootSystem),
      at: Date.now(),
    });
  }
}
// The rack: the active profile's pools, through migrateGroup — the one door a
// pool record takes on its way in, canonicalizing notations, lazily upgrading
// pre-notation records and dropping what it cannot read. Every profile takes
// it at the moment it is picked up, never before: parked pools are stored as
// they were written, and a profile from a later version is migrated the day
// somebody actually holds it.
//
// MERGE NOTE (2026-08-08): master's `defaultGroups()` wrapper is gone, not
// lost. It returned dealStartingRack() for the ONE rack the app used to have;
// the library deals per profile instead (dealRack(sys) at profile creation),
// so the wrapper had no caller left. The dealt rack itself — and U24's
// digit map that reads it — are untouched.
function poolsOfProfile(profile) {
  return ((profile && profile.pools) || []).map(migrateGroup).filter(Boolean);
}
let groups = poolsOfProfile(activeProfile(profileStore));

// Seed upgrade (2026-08-01): a rack that is EXACTLY the pre-Soul-Deal
// starter set — Attack/Damage/Percentile, untouched, uncategorized — was
// never the player's own work, so it swaps for the Soul Deal starting rack
// instead of blocking it forever. One edit to any of the three and the rack is
// theirs: no swap. (Runs after migrate so it sees the rack in canonical shape.)
{
  const oldSeed = [['Attack', '1d20'], ['Damage', '3d4'], ['Percentile', 'd100']];
  const untouched = groups.length === 3 && groups.every((g, i) =>
    g.name === oldSeed[i][0] && g.notation === oldSeed[i][1] && !g.category);
  if (untouched) groups = dealStartingRack();
}

// Publish the rack to the room whenever it changes (ROADMAP 2b): a
// debounced display copy for the owner switcher — localStorage stays the
// owner's truth. The timer also dodges module-boot ordering: the first
// module-scope saveGroups() runs before the net section exists; by the
// time the timer fires, publishPools' own guard settles it.
let poolsPublishTimer = null;
function schedulePublishPools() {
  clearTimeout(poolsPublishTimer);
  poolsPublishTimer = setTimeout(() => { poolsPublishTimer = null; publishPools(); }, 250);
}

// THE ONE WRITER of the rack, and now of the library it lives in. It was one
// line (`save(LS_GROUPS, groups)`) and it is still one write: `groups` folds
// into the active profile and the whole store goes down in a single setItem.
//
// That single write is why the library is ONE key. Three designs were built out
// before this one and two of them kept the live rack in its own key with the
// store holding the rest — and both, in their own self-critique, named the same
// worst defect: a profile switch is then three writes across two keys with only
// the first verified, so a throw in the tail leaves the pointer naming one
// profile while the rack holds another, and every repair for that state is
// itself a data-loss path. Here there is no intermediate state to survive.
function saveGroups() {
  writeActivePools(profileStore, groups);
  // …AND SAY SO WHEN IT REFUSES (CUJ13). This discarded the return while
  // every caller that MOVES data — switch, create, rename, delete, bind —
  // checked it, which is exactly backwards: those five are rare and
  // deliberate, and this one runs on every edit. A browser that has stopped
  // storing left the screen and the disk disagreeing with nothing said, and
  // the disagreement only surfaced on the next reload, as an empty rack.
  const ok = saveProfileStore();
  setStorageJammed(!ok);
  schedulePublishPools();
  return ok;
}

// The standing notice for a browser that will not store. STANDING, not a
// pill: this is a state you are in, not an event that happened, and every
// edit made while it holds is also lost. It clears itself the moment a write
// succeeds, so a transient quota blip does not leave a scar.
let storageJammed = false;
function setStorageJammed(on) {
  if (on === storageJammed) return;
  storageJammed = on;
  const el = document.getElementById('storage-banner');
  if (el) el.classList.toggle('hidden', !on);
  if (on) announce('Your changes are not being saved. Download your data.');
}

// Persist the library. Returns false when storage refused it, so the callers
// that MOVE data (switch, create, delete) can refuse out loud instead of
// leaving the screen disagreeing with the disk — the guardrail Tier G's stash
// needed a read-back to get, kept where it is still cheap.
let forceStorageFail = false; // test hook only — see __diceDebug.jamStorage
function saveProfileStore() {
  try {
    if (forceStorageFail) throw new Error('storage jammed (test)');
    localStorage.setItem(LS_PROFILES, JSON.stringify(profileStore));
    return true;
  } catch {
    return false;
  }
}
saveGroups();

// ---------------------------------------------------------------------------
// The library's verbs (docs/PROFILES.md §11)
// ---------------------------------------------------------------------------
//
// These replace Tier G's rack swap entire — Edit ⟨name⟩ / Save to ⟨name⟩ /
// Done, the stash, its read-back and its boot guard (§11.8). That machinery
// existed to make one rack pretend to be two; there are thirty-two now, so a
// switch is a pointer move and there is nothing to set aside, verify or give
// back.
//
// Every verb answers the pane's verdict shape {ok, status} so the same string
// can be read out at the three places a profile can be acted on: the join
// modal's hint line, the switcher menu, and the library list.

const pv = (ok, status) => ({ ok, status });

const activeProfileName = () => {
  const p = activeProfile(profileStore);
  return p ? p.name : null;
};

// The system this table reads dice by — the room's setting when online, the
// solo copy in the lobby (§11 X9). `currentSystemId` is already exactly that.
const tableSystem = () => currentSystemId;

// The profile in hand is bound to a different system than this table reads.
// A LABELLING problem, never a validity one: pools are notation and a system
// is a render-time lens (goal 6), so the rack keeps rolling either way.
function profileMismatch() {
  const p = activeProfile(profileStore);
  if (!p || p.system === tableSystem()) return null;
  return { name: p.name, profileSystem: p.system, tableSystem: tableSystem() };
}

const systemLabel = (id) => (SYSTEMS[id] ? SYSTEMS[id].label : id);

// Put a profile's pools in your hands. No copy, no stash: `groups` is rebuilt
// from the record and the record it came from is untouched.
function adoptRack(profile) {
  editingGroupId = null;      // no open tile editor may survive into another rack
  creatingShelf = null;
  if (pop && pop.source === 'group') closePopover();
  poolsOwner = null;          // you are looking at your own rack again
  groups = poolsOfProfile(profile);
  mismatchKept = false;       // a new profile is a new question
  saveGroups();               // persists the store and re-publishes the label
  if (profile && profile.set && profile.set !== diceSet) setDiceSet(profile.set);
  renderGroups();
  renderPlayers();
  updateProfileBanner();
  // The library list's own `Use` button switches, so the list has to repaint or
  // the 'in hand' tag it just moved stays on the row you left.
  renderProfileLibrary();
}

// R4: the picked profile stays in use until it is switched.
function switchToProfile(id) {
  const rec = findProfile(profileStore, id);
  if (!rec) return pv(false, '✗ that profile is gone — the list has been rebuilt');
  if (profileStore.activeId === id) {
    return pv(true, `✓ '${rec.name}' is already in your hands`);
  }
  const outgoing = activeProfile(profileStore);
  writeActivePools(profileStore, groups); // fold the rack in before the pointer moves
  setActive(profileStore, id, Date.now());
  if (!saveProfileStore()) {
    // Storage refused the write. Put the pointer back and say so: the screen
    // must never disagree with the disk about which rack you are holding.
    if (outgoing) setActive(profileStore, outgoing.id, outgoing.at);
    return pv(false, '✗ couldn’t save the switch (storage unavailable?) — nothing moved');
  }
  adoptRack(rec);
  const kept = outgoing ? ` — '${outgoing.name}' keeps its ${outgoing.pools.length} pool${outgoing.pools.length === 1 ? '' : 's'}` : '';
  return pv(true, `✓ '${rec.name}' is in your hands${kept}`);
}

// One door for every new profile: created empty, dealt, or copied from a
// teammate, a prepared seat or a file. `activate` is false only where a caller
// wants to add without taking it in hand (a bulk file import).
function makeProfile({ name, system, pools = [], set = null, activate = true }) {
  if (isFull(profileStore)) {
    return pv(false, `✗ ${MAX_PROFILES} profiles is the ceiling — delete one first`);
  }
  if (pools.length > MAX_POOLS) {
    return pv(false, `✗ that one carries ${pools.length} pools — a profile holds at most ${MAX_POOLS}`);
  }
  const named = nameProfile(name);
  if (!named.ok) return pv(false, `✗ ${named.error}`);
  const outgoing = activeProfile(profileStore);
  if (outgoing) writeActivePools(profileStore, groups);
  const before = profileStore.activeId;
  const added = addProfile(profileStore, {
    name: named.name, system: knownSystem(system) || tableSystem(), pools, set, at: Date.now(),
  });
  if (!added.ok) return pv(false, `✗ ${added.error}`);
  if (!activate && before) setActive(profileStore, before, outgoing ? outgoing.at : 0);
  if (!saveProfileStore()) {
    deleteProfile(profileStore, added.id);
    if (before) setActive(profileStore, before, outgoing ? outgoing.at : 0);
    return pv(false, '✗ couldn’t save the new profile (storage unavailable?) — nothing was added');
  }
  if (activate) adoptRack(added.profile);
  else renderProfileLibrary();
  const n = added.profile.pools.length;
  return { ...pv(true, `✓ '${added.profile.name}' added — ${n} pool${n === 1 ? '' : 's'}${activate ? ', and it is in your hands' : ''}`), id: added.id, name: added.profile.name };
}

// R9's Random: a whole dealt profile for the table's own system, named without
// asking a question it can answer (js/seed.js dealName).
// `wanted` is the name box's text (C9): a dealt character you have already
// named is the common case when you are making six of them, and the dealt
// name is the fallback rather than the rule. Deduped either way — a copy
// never overwrites, and neither does a deal.
function dealNewProfile(system, wanted = '') {
  const sys = knownSystem(system) || tableSystem();
  const asked = String(wanted || '').trim();
  const made = makeProfile({
    name: uniqueName(profileStore, asked || dealName(sys)),
    system: sys,
    pools: dealRack(sys),
  });
  if (!made.ok) return made;
  return pv(true, `✓ dealt '${made.name}' — ${systemLabel(sys)}, ${groups.length} pools`);
}

// R7: a teammate's published rack, a prepared seat, or a profile out of a
// file — copied into MY library. Nothing of mine is touched: this is an add,
// under a deduped name, and the copy is not taken in hand unless asked for.
// (A copy is a copy: no pointer back to whoever wrote it, so no "there is a
// newer version" to track. PROFILES §11.9 decision 10.)
// `from` names whose it was, for the receipt (Joe 2026-08-09: "there should
// be some modal or something letting you know you're copying it"). The receipt
// is the notice rather than a modal: a modal you must dismiss to proceed is a
// gate, and this is not a decision — the row already said "copies to yours"
// before you pressed it. What is owed AFTER is a plain statement of what
// landed and whose it was, which is what this returns.
function copyProfileIn(rec, { activate = false, from = null } = {}) {
  const wire = fromWire(rec, tableSystem());
  if (!wire) return pv(false, '✗ nothing to copy');
  const named = nameProfile(wire.name);
  if (!named.ok) return pv(false, `✗ ${named.error}`);
  const made = makeProfile({
    name: uniqueName(profileStore, named.name),
    system: wire.system,
    pools: wire.pools,
    set: wire.set,
    activate,
  });
  if (!made.ok) return made;
  const n = wire.pools.length;
  const whose = from ? ` from ${from}` : '';
  return pv(true, `✓ '${made.name}' copied${whose} into your profiles — ${n} pool${n === 1 ? '' : 's'}, yours to edit, nothing of yours changed`);
}

function renameProfileTo(id, name) {
  const got = renameProfile(profileStore, id, name);
  if (!got.ok) return pv(false, `✗ ${got.error}`);
  if (!saveProfileStore()) return pv(false, '✗ couldn’t save the new name (storage unavailable?)');
  if (id === profileStore.activeId) { schedulePublishPools(); renderGroups(); }
  renderProfileLibrary();
  return pv(true, `✓ renamed to '${got.name}'`);
}

function removeProfileById(id) {
  const rec = findProfile(profileStore, id);
  if (!rec) return pv(false, '✗ that profile is gone already');
  const wasActive = id === profileStore.activeId;
  if (!wasActive) writeActivePools(profileStore, groups); // don't lose edits to the one in hand
  const got = deleteProfile(profileStore, id);
  if (!got.ok) return pv(false, `✗ ${got.error}`);
  if (!saveProfileStore()) return pv(false, '✗ couldn’t save the deletion (storage unavailable?) — nothing was removed');
  if (wasActive) adoptRack(activeProfile(profileStore));
  else renderProfileLibrary();
  const left = profilesOf(profileStore).length;
  return pv(true, `✓ deleted '${rec.name}' — ${left} profile${left === 1 ? '' : 's'} left${wasActive ? `, '${activeProfileName()}' is in your hands` : ''}`);
}

// Re-bind the profile in hand to the table's system — the mismatch banner's
// third option, for the player whose D&D fighter really is what they want to
// roll at this Soul Deal table. Explicit, one click, nothing moves but a label.
function bindActiveToTable() {
  const p = activeProfile(profileStore);
  if (!p) return pv(false, '✗ no profile in hand');
  const was = p.system;
  setActiveSystem(profileStore, tableSystem());
  if (!saveProfileStore()) {
    setActiveSystem(profileStore, was);
    return pv(false, '✗ couldn’t save (storage unavailable?)');
  }
  mismatchKept = false;
  schedulePublishPools();
  renderGroups();
  updateProfileBanner();
  renderProfileLibrary();
  return pv(true, `✓ '${p.name}' now reads as ${systemLabel(p.system)}`);
}

const groupsListEl = document.getElementById('groups-list');
// #groups-empty retired with the Sheet Pass: ghost tiles ARE the empty state.

// Load a group's notation into the command box (UX §1.4) — a compose aid;
// changing the record itself is the inline row editor's job (✎).
function loadIntoBox(notation, name) {
  cmdInput.value = notation;
  paintCmd();
  // A text INTENT shows the box for THIS visit only (persist=false): a
  // use-tier action never rewrites the per-user view default — the audit
  // caught the old persisting flip changing how the panel boots forever.
  // ADDITIVE now, not a swap: it surfaces Notation and leaves Dice and Pools
  // exactly as the user left them. The transient bit lives in its own object
  // so the next click on ANY other cell cannot launder it into storage.
  setSection('notation', true, false);
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
  let category = g.category || null;
  if (patch.category !== undefined) {
    if (typeof patch.category !== 'string') return false;
    category = cutText(patch.category, 24) || null; // '' clears the shelf
  }
  let set = g.set || null;
  if (patch.set !== undefined) {
    // '' clears the override (like category); 'std' PINS Standard; anything
    // else must be a registry id — an unknown id is a caller bug, refuse it
    if (typeof patch.set !== 'string') return false;
    const v = patch.set.trim();
    if (v && v !== 'std' && !SETS[v]) return false;
    set = v || null;
  }
  g.name = name;
  g.notation = notation;
  if (category) g.category = category;
  else delete g.category; // present-or-absent, in storage and the YAML alike
  if (set) g.set = set;
  else delete g.set; // present-or-absent, in storage and the YAML alike
  saveGroups();
  renderGroups();
  return { id: g.id, name: g.name, notation: g.notation, category: g.category || null, set: g.set || null };
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
  const notIn = groupsListEl.querySelector('.ge-notation');
  if (notIn) notIn.focus();
}

function cancelEditGroup() {
  editingGroupId = null;
  renderGroups();
}

// The notation card, slimmed (the Sheet Pass): name and shelf edit in the
// popover's identity strip now, so this card is the NOTATION escape hatch
// for complex pools — one field, Update writes back BY ID via editPoolById,
// Cancel/Esc reverts. A notation that doesn't parse pins the card open
// with the parse error and a dead Update.
function buildGroupEditor(g) {
  const ed = document.createElement('div');
  ed.className = 'group-editor';

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
  updateBtn.className = 'btn confirm ge-update';
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
    editPoolById(g.id, { notation: notIn.value }); // name/shelf live in the strip
  };
  updateBtn.addEventListener('click', apply);
  cancelBtn.addEventListener('click', cancelEditGroup);
  const onKey = (e) => {
    e.stopPropagation(); // same as every popover field: no table shortcuts
    if (e.key === 'Enter') apply();
    else if (e.key === 'Escape') cancelEditGroup();
  };
  notIn.addEventListener('keydown', onKey);

  ed.append(notIn, err, actions);
  return ed;
}

// Roll a saved group: parse its notation and roll the parsed spec. Online the
// notation string itself goes up (the server's parse is authoritative).
// (rollGroup retired 2026-08-01: tiles STAGE — the draft cluster and the
// popover Roll are the roll paths. See stageGroup.)

// A pool's dice as a strip of real die art, capped with the roster's '+N'
// overflow token (P5). Pure decoration: every img is pointer-events:none —
// the BUTTON wrapping the strip is the one interactive object (P1/a11y).
// Null art (no WebGL) falls back to the palette's colored diamond dots.
//
// grouped: repeats collapse to ONE die + a ×N count — '2d8' reads as a d8
// ×2, not two identical pictures (pool rows). The draft cluster stays
// UNGROUPED: there every die stands alone because each carries its own ✕
// remover. Strips pack left; they never spread across the row.
const POOL_STRIP_CAP = 5;
function buildDieStrip(types, cap, { grouped = false, set = null } = {}) {
  const frag = document.createDocumentFragment();
  // §9: a strip belonging to a pool WITH an override wears that set and
  // pins it (data-art-set) so refreshDieArt leaves it alone; every other
  // strip follows your own set as before.
  const variant = set && (set === 'std' || SETS[set]) ? set : null;
  const units = grouped
    ? [...types.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map())]
    : types.map((t) => [t, 1]);
  const shown = units.slice(0, cap);
  for (const [type, n] of shown) {
    const url = dieArtURL(type, variant || diceSet);
    if (url) {
      const img = document.createElement('img');
      img.className = 'die-art strip-die';
      img.dataset.artType = type; // refreshDieArt re-dresses it on set change
      if (variant) img.dataset.artSet = variant;
      img.src = url;
      img.alt = '';
      img.draggable = false;
      frag.appendChild(img);
    } else {
      const dot = document.createElement('span');
      dot.className = 'strip-dot';
      dot.style.background = (DIE_DEFS[type] && DIE_DEFS[type].color) || '#888';
      frag.appendChild(dot);
    }
    if (n > 1) {
      const count = document.createElement('span');
      count.className = 'strip-count';
      count.textContent = `×${n}`;
      frag.appendChild(count);
    }
  }
  if (units.length > shown.length) {
    const more = document.createElement('span');
    more.className = 'roster-more strip-more';
    more.textContent = `+${units.length - shown.length}`;
    more.title = units.slice(shown.length)
      .map(([t, n]) => (n > 1 ? `${n}×${t}` : t)).join(', ');
    frag.appendChild(more);
  }
  return frag;
}

// The hover roll cue (P1 made loud): a heavy translucent word fills the
// strip button's empty side BEHIND the dice on hover, chevrons drumming
// ❯ → ❯ ❯ → ❯ ❯ ❯ to telegraph that the click launches. Pure decoration:
// aria-hidden, pointer-events none — the button stays the whole target.
// The word ALWAYS renders (Joe 2026-08-03: hiding ROLL on a crowded strip
// — the old cueTight rule — hid the promise exactly where the roll was
// biggest; the hover treatment now dims the dice UNDER the brightened cue,
// so the word stays legible over any pool).
//
// The cue's word is a CLOSED set — never user text (which is why this
// builds nodes instead of innerHTML: a varying word behind innerHTML is
// how user text eventually gets there). The draft and an offer's claim
// ROLL a fresh pool; a result card's strip REROLLS an existing one — the
// two verbs must not share a word (Joe, 2026-08-03). The \u00a0 keeps the
// shipped word–chevron spacing.
// NO trailing nbsp (Joe 2026-08-04: 'when I see ROLL in the UI now, it
// looks left-of-centered' \u2014 he was right and my first two measurements
// were wrong). The nbsp was gap-to-the-chevrons baked into the WORD, so
// the centered well cue was centering five glyphs while the eye read
// four: ~13px of invisible tail on the right shoved ROLL that far left.
// Separation is the neighbours' margin now \u2014 a gap belongs to the layout,
// never to the string.
const CUE_WORDS = { roll: 'ROLL', reroll: 'REROLL' };
// `balanced` (Joe 2026-08-04): the WELL's cue gains a leading ❯❯❯ so the
// word sits centered with motion flowing through it — the compact card
// strips keep the trailing-only form. Chevron fades are CLASS-driven
// (l1..l3 crescendo in, t1..t3 decrescendo out): nth-of-type would
// miscount the moment a leading set exists.
// Two dresses, one word. On a narrow card strip the cue is a right-aligned
// trail of chevrons — there is no button there, so the arrows ARE the
// affordance, pointing at the click. In the WELL (balanced) there is now a
// real raised plate to press, so the arrows were doing a job the button
// already does, six-deep, in 26px. They give way to ENGRAVING: a hairline
// rule into a lozenge on each side of the word — the ornament the ceremony
// cards already cut into their corners, and the one that reads as struck
// metal rather than as UI (Joe 2026-08-04: 'upgrade the chevrons with
// something nicer to match the bronze… scrollwork?').
function buildRollCue(kind = 'roll', balanced = false) {
  const cue = document.createElement('span');
  cue.className = balanced ? 'roll-cue cue-engraved' : 'roll-cue';
  cue.setAttribute('aria-hidden', 'true');
  if (balanced) cue.appendChild(rule('lead'));
  const w = document.createElement('b');
  w.className = 'cue-word';
  w.textContent = CUE_WORDS[kind] || CUE_WORDS.roll;
  cue.appendChild(w);
  if (balanced) {
    cue.appendChild(rule('trail'));
    return cue;
  }
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('i');
    c.className = `t${i + 1}`;
    c.textContent = '❯';
    cue.appendChild(c);
  }
  return cue;
}
function rule(side) {
  const r = document.createElement('span');
  r.className = `cue-rule ${side}`;
  return r;
}
// (cueTight retired 2026-08-03 — see the cue comment above.)

// The empty well's GHOST (Joe 2026-08-03, simpler won): ONLY the quiet
// ROLL ❯❯❯ — the empty well previews the full one, nothing else. (Ghost
// DICE were tried and cut that day; a one-line "Tap a die above…"
// invitation was tried 2026-08-04 and cut too — Joe: 'aesthetically
// distracting… I'll find another way to hint that later'. The empty deck
// stays empty; orientation is an open question, not this element.)
trayHintEl.appendChild(buildRollCue('roll', true)); // the ghost previews the SAME balanced cue

// STAGE a pool into the draft (the Rack's one source verb): its dice pour
// into the sticky cluster carrying the pool's name as their source label;
// mods/dc/moment are set aside with a whisper (the draft owns its own ±).
// A stage is a COMPOSING act: it surfaces the panel if collapsed — the
// draft it builds must be visible (the hover-flyout promotion this replaced
// followed the same rule).
function sanitizeSourceLabel(name) {
  return cleanPartLabel(name || '') || null;
}
// ONE LONG-PRESS DOOR (U27/U12, 2026-08-08). Every surface with a
// right-click door needs a touch twin, because **iOS Safari never fires
// `contextmenu` on a long press** — so a `contextmenu`-only door is a door
// that does not exist on an iPhone. This is the pool tile's implementation,
// which was the only correct one, lifted so the other three stop being
// written from memory: the identity chip's hand-rolled copy opened the menu
// and let its own click handler close it on the same release (dead code
// since it shipped), and the shelf marker and peek card never got one at all.
//
// `took()` reads AND resets, so a click handler asks "did a press already
// handle this?" exactly once. `clear()` is for the native `contextmenu`
// handler on Android, which fires FIRST — one door has to win.
function attachLongPress(el, fire, { ms = 500, tolerance = 10 } = {}) {
  let timer = null;
  const lp = {
    fired: false,
    clear() { clearTimeout(timer); },
    took() { if (!lp.fired) return false; lp.fired = false; return true; },
  };
  el.addEventListener('pointerdown', (ev) => {
    lp.fired = false; // ANY new press resets the suppressor (touch→mouse handoff)
    clearTimeout(timer);
    if (ev.pointerType !== 'touch') return; // right-click owns mouse
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const cancel = () => {
      clearTimeout(timer);
      el.removeEventListener('pointermove', onMove);
    };
    const onMove = (e2) => {
      if (Math.hypot(e2.clientX - x0, e2.clientY - y0) > tolerance) cancel();
    };
    timer = setTimeout(() => {
      cancel();
      // The synthetic click is suppressed EITHER way — a long-press over an
      // already-open surface must not fall through to the primary verb.
      lp.fired = true;
      fire(ev);
    }, ms);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', cancel, { once: true });
    el.addEventListener('pointercancel', cancel, { once: true });
  });
  return lp;
}

function stageGroup(g) {
  const res = parseNotation(g.notation);
  if (!res.ok) return false;
  if (!panelsOpen.pools) setPanel('pools', true);
  const label = sanitizeSourceLabel(g.name);
  // §9: the pool's set override rides each staged die — from YOUR rack or a
  // teammate's alike (identity belongs to the POOL; their player-set never
  // rides, only what the pool itself pinned)
  const gSet = typeof g.set === 'string' && (g.set === 'std' || SETS[g.set]) ? g.set : null;
  const wasEmpty = tray.length === 0;
  const dropped = [];
  let capped = false;
  for (let i = 0; i < res.spec.dice.length; i++) {
    if (tray.length >= MAX_DICE_ON_TABLE) { capped = true; break; }
    tray.push(res.spec.dice[i]);
    // the pool's own name wins; a composed pool's inner sources survive
    // only when the pool is unnamed
    traySources.push(label || (res.spec.sources ? res.spec.sources[i] || null : null));
    traySets.push(gSet);
  }
  // A PARTIAL STAGE SAYS SO. Silently keeping half of Strength under a chip
  // labelled "Strength" is the same lie the intent drop below was.
  if (capped) dropped.push(`only part of it fits under the ${MAX_DICE_ON_TABLE}-die cap`);

  // THE POOL'S INTENT RIDES (§7.8, U1). Until 2026-08-08 this function
  // pushed dice and threw everything else away: `Sneak Attack =
  // 3d6+2 dc12 cinematic held` fired face-down and cinematic from the 112px
  // rail and landed as a bare open `3d6` here — the same pool sending two
  // different rolls depending on whether the panel happened to be open, and
  // failing OPEN on a goal-11 surface while rollRailSelection failed closed
  // on the same data a few dozen lines away.
  //
  // The rules below are rollRailSelection's, deliberately: staging into a
  // draft IS composing, so the two paths now share one grammar rather than
  // two that drift. Glue (keep/drop · reroll · ! · adv) still cannot ride —
  // the notation glues it to ONE dice type and a sum has no union for it —
  // so it is set aside out loud, which is what it always was.
  const m = res.spec.mods || {};
  const glued = [];
  if (m.keep) glued.push('keep/drop');
  if (m.reroll) glued.push('reroll');
  if (m.explode) glued.push('!');
  if (m.adv) glued.push(m.adv === 'adv' ? 'advantage' : 'disadvantage');
  if (glued.length) dropped.push(glued.join(' · '));

  // A pool's flat bonus rides as a LABELLED part, so a composed draft still
  // says where every number came from (the attributed-math invariant). Other
  // keys on boxExtras.mods — an adv or a keep the player set through ± —
  // survive untouched; only the parts list grows.
  const add = [];
  if (Array.isArray(m.parts)) {
    for (const p of m.parts) if (p.value) add.push({ label: p.label || label || '', value: p.value });
  } else if (typeof m.modifier === 'number' && m.modifier) {
    add.push({ label: label || '', value: m.modifier });
  }
  if (add.length) {
    const base = boxExtras.mods ? JSON.parse(JSON.stringify(boxExtras.mods)) : {};
    const parts = Array.isArray(base.parts) && base.parts.length
      ? [...base.parts]
      : (base.modifier ? [{ label: '', value: base.modifier }] : []);
    // MAX_PARTS is 12 in the grammar; past it the canonical stops parsing and
    // the box would go red for a reason the player never chose. Refuse the
    // overflow, keep the draft, say so.
    const room = Math.max(0, 12 - parts.length);
    if (add.length > room) dropped.push('too many labelled bonuses');
    parts.push(...add.slice(0, room));
    if (parts.length) {
      base.parts = parts;
      base.modifier = parts.reduce((a, p) => a + p.value, 0);
      boxExtras.mods = base;
    }
  }

  // dc · moment · label: the first one wins and a genuine conflict is set
  // aside rather than silently overwritten.
  const takeOne = (cur, next, conflictWord) => {
    if (next == null || next === '') return cur;
    if (cur != null && cur !== '' && cur !== next) { dropped.push(conflictWord); return cur; }
    return next;
  };
  boxExtras.dc = takeOne(boxExtras.dc, res.dc, 'two targets');
  boxExtras.exp = takeOne(boxExtras.exp, res.exp, 'two moments');
  boxExtras.comment = takeOne(boxExtras.comment, res.comment, 'two labels');

  // VISIBILITY FAILS CLOSED (goal 11). Two modes in one draft become the
  // tighter one, never the looser — the one rule here that is not "first
  // wins", and the reason is that the other direction leaks.
  const v = visOfParse(res);
  if (v) {
    if (boxExtras.visibility && boxExtras.visibility.mode !== v.mode) {
      boxExtras.visibility = { mode: 'secret' };
      dropped.push('mixed visibility → secret');
    } else {
      boxExtras.visibility = v;
    }
  }
  // Render NOW: syncBoxFromTray→paintCmd only re-renders when the parsed
  // box DIFFERS from the tray, and we just made them equal — without this
  // the first stage painted nothing until the next one reordered things.
  renderTray();
  syncBoxFromTray();
  if (dropped.length) {
    showSettingsNote(`${g.name || 'pool'}: ${dropped.join(' · ')} set aside — re-add via ±`);
  }
  if (wasEmpty) pulseTrayRoll();
  return true;
}

// What a pool would LOSE if it were staged into the draft as it stands —
// the same set-aside list stageGroup builds, computed without touching
// anything. Exists so a scenario can pin the intent contract per pool
// instead of asserting on a transient note string, and so the rail and the
// workbench can be compared on one function's output.
function stageLoss(g, into = boxExtras) {
  const res = parseNotation(g.notation);
  if (!res.ok) return null;
  const m = res.spec.mods || {};
  const out = [];
  if (m.keep) out.push('keep/drop');
  if (m.reroll) out.push('reroll');
  if (m.explode) out.push('!');
  if (m.adv) out.push(m.adv === 'adv' ? 'advantage' : 'disadvantage');
  if (res.dc != null && into.dc != null && into.dc !== res.dc) out.push('two targets');
  if (res.exp && into.exp && into.exp !== res.exp) out.push('two moments');
  if (res.comment && into.comment && into.comment !== res.comment) out.push('two labels');
  const v = visOfParse(res);
  if (v && into.visibility && into.visibility.mode !== v.mode) out.push('mixed visibility → secret');
  return out;
}

// The cluster announces itself as the next tap (touch has no hover). Shared
// with the Enter guard, which surfaces a hidden draft rather than firing it.
function pulseTrayRoll() {
  trayRollBtn.classList.add('stage-pulse');
  setTimeout(() => trayRollBtn.classList.remove('stage-pulse'), 900);
}

// P2 use-vs-manage: manage mode is ONE explicit, transient toggle (the
// header ✎). It never persists, and collapsing the panel exits it
// (applyPanels) — the hover flyout and every fresh look at the panel start
// read-only. The sanctioned exception stays: the ± popover's by-id 'Update
// this pool' / 'Save as variant' remain reachable at rest — explicit verbs,
// not ambient edit chrome.
let poolsEdit = false;
function setPoolsEdit(on) {
  poolsEdit = !!on;
  if (poolsEdit) poolsOwner = null; // ✎ manages YOUR rack — fall home first
  if (!poolsEdit) {
    editingGroupId = null; // leaving manage mode closes any open editor
    deletedPool = null;    // …and the undo tombstone (U28a: scoped to the gate)
    creatingShelf = null;  // …and the creation card
    creationDraft = { name: '', dice: ['d6'], touched: false };
    draftShelves = [];     // unused session shelves evaporate (pools persist theirs)
  }
  document.getElementById('pools-edit').setAttribute('aria-pressed', String(poolsEdit));
  document.getElementById('pools-toolbar').classList.toggle('on', poolsEdit);
  renderGroups();
  renderPlayers(); // rail pills disable in manage mode (teammate consolidation 2026-08-04)
}
document.getElementById('pools-edit').addEventListener('click', () => setPoolsEdit(!poolsEdit));
document.getElementById('pools-done').addEventListener('click', () => setPoolsEdit(false));

// ---------------------------------------------------------------------------
// The owner switcher (ROADMAP 2b): browse a teammate's published rack.
// Foreign lists are STAGE-ONLY furniture — no ±, no manage, no ordinals:
// digits always act on YOUR pools, and each player's localStorage stays
// their own truth. The standing 'read-only' banner-chip is also the way
// back. Net state is declared HERE (not in the net section below) because
// the module-scope renderGroups() boot call already reads the roster.
// ---------------------------------------------------------------------------
// (net/netOnline/players/poolsOwner are declared further up, before the
// module-scope renderTray()/paintCmd() boot calls — renderCmdState reads
// netOnline when the box parses, and a browser restoring the input's text
// across reload would otherwise hit the TDZ and kill the whole module.)

function poolsOwnerPlayer() {
  return poolsOwner ? players.find((p) => p.id === poolsOwner) || null : null;
}

function setPoolsOwner(id) {
  poolsOwner = id || null;
  if (poolsOwner) { creatingShelf = null; creationDraft = { name: '', dice: ['d6'], touched: false }; }
  if (poolsOwner && poolsEdit) { setPoolsEdit(false); return; } // manage is yours-only; renders both
  renderGroups();
  renderPlayers(); // rail pills reflect the pressed state (teammate consolidation 2026-08-04)
}

// Share the rack with the room: name + notation + category, capped like the
// server caps it. Fire-and-forget — everyone (us included) hears the
// 'pools-changed' echo, and a solo table simply has no one to tell.
// Tier G's publish gate is GONE, and its deletion is a design consequence
// rather than a tidy-up: it existed because `Edit ⟨name⟩` put somebody else's
// pools in the one rack, so a publish mid-swap would have claimed Alice's rack
// under your own name and corrupted the owner switcher. The rack is now always
// the profile in your own hands, so a publish is always honest and there is
// nothing left to gate (PROFILES §11.8).
function publishPools() {
  if (!net) return;
  const mine = activeProfile(profileStore);
  net.setPools(groups.slice(0, MAX_POOLS).map((g) => {
    const rec = { name: g.name || '', notation: g.notation };
    if (g.category) rec.category = g.category;
    if (g.set) rec.set = g.set; // §9: pool identity rides the rack broadcast
    return rec;
  }),
  wireSet(), // §9: your default set rides too — foreign racks show YOUR world
  // §11: and WHICH profile this is, plus the system it was built for. The
  // owner switcher has browsed teammates' racks since ROADMAP 2b; until now
  // it could only say whose. A rack a teammate can name is one they can copy.
  mine ? mine.name : null,
  mine ? mine.system : null,
  // C17: THE WHOLE LIBRARY RIDES ALONG. An organizer builds six characters
  // and sits down; the table offers six, with no push and no YAML pane. The
  // ACTIVE profile's pools come from `groups` (the live rack) rather than
  // from its stored copy, because an edit in progress has not been written
  // back yet and a seat offering yesterday's version of the character you
  // are visibly editing is worse than none.
  profilesOf(profileStore).map((p) => ({
    name: p.name,
    system: p.system,
    ...(p.set ? { set: p.set } : {}),
    pools: (p.id === profileStore.activeId ? groups : (p.pools || []))
      .slice(0, MAX_POOLS)
      .map((g) => {
        const rec = { name: g.name || '', notation: g.notation };
        if (g.category) rec.category = g.category;
        if (g.set) rec.set = g.set;
        return rec;
      }),
  })));
}

// Category shelves (the Rack): fixed trio order — Attributes, Skills,
// Motivations — then other categories alphabetically, uncategorized last
// as plain 'Pools'. Sticky headers keep the current shelf named mid-scroll.
const TRIO = ['attributes', 'skills', 'motivations'];
const TRIO_LABELS = { attributes: 'Attributes', skills: 'Skills', motivations: 'Motivations' };
function buildSections(list, { ensureTrio = false } = {}) {
  const secs = new Map();
  for (const g of list) {
    const k = (g.category || '').trim().toLowerCase() || '\u0000';
    if (!secs.has(k)) secs.set(k, { key: k, label: k === '\u0000' ? 'Pools' : g.category.trim(), pools: [] });
    secs.get(k).pools.push(g);
  }
  // Your own rack is the character sheet: the trio shelves stand even when
  // empty, each ending in its ghost '+' tile (the Sheet Pass).
  //
  // SYSTEM-AWARE (C9, PROFILES §11.6's own words: *"a D&D rack in manage mode
  // would stand three empty Soul Deal shelves. It becomes system-aware."* It
  // did not, until now.) Attributes/Skills/Motivations are *Your Soul Deal*'s
  // character sheet, not every game's — standing them empty on a D&D rack
  // invents three shelves that system has no name for, in the one mode where
  // a player is deciding what their character is made of.
  // The PROFILE's system, not the table's: these shelves are this character's
  // sheet, and a D&D profile briefly sitting at a Soul Deal table is exactly
  // the case the mismatch banner exists to name — it must not also grow three
  // shelves its own system never had. Falls back to the table's when nothing
  // is in hand (the lobby, a foreign rack).
  const rackSystem = (activeProfile(profileStore) || {}).system || tableSystem();
  if (ensureTrio && rackSystem === 'soul-deal') {
    for (const k of TRIO) {
      if (!secs.has(k)) secs.set(k, { key: k, label: TRIO_LABELS[k], pools: [] });
    }
    for (const name of draftShelves) {
      const k = name.trim().toLowerCase();
      if (k && !secs.has(k)) secs.set(k, { key: k, label: name.trim(), pools: [] });
    }
  }
  return [...secs.values()].sort((a, b) => {
    const rank = (s) => (s.key === '\u0000' ? 2 : TRIO.includes(s.key) ? 0 : 1);
    return rank(a) - rank(b)
      || (rank(a) === 0 ? TRIO.indexOf(a.key) - TRIO.indexOf(b.key) : a.label.localeCompare(b.label));
  });
}

// The digits stage by RENDERED order (rebuilt on every paint).
let renderedPools = [];

// EVERY SHELF IS REACHABLE BY DIGIT (U24, 2026-08-08). The digit map used to
// be the flat rendered order, which meant the first nine pools — and on the
// rack the app DEALS that is nine attributes, so `1 2 3 Enter`, the roll this
// whole surface is built for, could only ever be three attributes. UX.md
// asserted the attribute+skill+motivation claim in the paragraph directly
// above the dealt-rack amendment that broke it, and the digit handler's own
// comment advertised `1 4 6 Enter` — a NON-CONTIGUOUS map it did not have.
//
// So the nine digits are shared out across the shelves instead of spent on
// the first one: one to every shelf at minimum, the remainder by size, in
// rack order. On the dealt rack that is 3/3/3, so `1 4 7` is exactly an
// attribute, a skill and a motivation. Within a shelf the order is still the
// rendered one, so a badge never contradicts reading order; what changes is
// that a shelf can run out of digits rather than a shelf never getting any.
//
// Not a reorder affordance — that is a bigger question (ROADMAP §9b) and this
// is the smallest change that makes the advertised roll typeable.
const DIGIT_SLOTS = 9;
function digitPools(list) {
  const secs = buildSections(list).filter((s) => s.pools.length);
  if (!secs.length) return [];
  // One each, then hand out what is left largest-shelf-first, capped by what
  // each shelf actually holds.
  const quota = secs.map(() => 0);
  let left = DIGIT_SLOTS;
  for (let i = 0; i < secs.length && left > 0; i++) { quota[i] = 1; left--; }
  const order = secs.map((s, i) => i).sort((x, y) => secs[y].pools.length - secs[x].pools.length);
  let moved = true;
  while (left > 0 && moved) {
    moved = false;
    for (const i of order) {
      if (left <= 0) break;
      if (quota[i] >= secs[i].pools.length) continue;
      quota[i]++; left--; moved = true;
    }
  }
  const out = [];
  secs.forEach((sec, i) => out.push(...sec.pools.slice(0, quota[i])));
  return out;
}
// The digit a pool answers to, or 0 — read by both the rack tile and the rail
// row so the two can never print different numbers for the same pool.
function digitOf(g) {
  const i = renderedPools.indexOf(g);
  return i >= 0 && i < DIGIT_SLOTS ? i + 1 : 0;
}

// The Sheet Pass ghost tiles: which shelf's creation card is open (a
// section KEY, one at a time — like editingGroupId for the notation card).
let creatingShelf = null;
// Shelves minted this editing session ('＋ New shelf'): they render empty
// (with their ghost tile) while ✎ is on, materialize for real when a pool
// lands on them, and evaporate on Done otherwise — shelves-with-pools stay
// the only persistent truth (category is present-or-absent everywhere).
let draftShelves = [];
// the card's fields live HERE, not in the closure: any renderGroups (a
// pools-changed, a manage toggle, a strip write) rebuilds the card and a
// typed name must survive the repaint (fleet catch)
let creationDraft = { name: '', dice: ['d6'], touched: false };
const SHELF_NOUN = { attributes: 'attribute', skills: 'skill', motivations: 'motivation' };

// THE UNDO FOR A DELETED POOL (U28a). One slot, not a stack: a rack edit is
// a deliberate act and an undo history of them would be a second thing to
// reason about. It holds the pool AND the index it sat at, so restoring puts
// it back where it was rather than at the end of its shelf — a pool that
// reappears somewhere else has not really been restored, and on a rack with
// digit shortcuts it would silently move under the keys.
// Cleared when manage mode closes: the undo is scoped to the editing session
// you are in, and a tombstone outliving its gate would be a stale door.
let deletedPool = null; // {group, index}

// THE TOMBSTONE. It occupies the slot the pool just left, which is where
// your eye and your finger already are — no toast, no timer racing your
// reading, no z-index, and nothing to find. It borrows the ghost cell's
// dashed dress (same footprint, same "this is not a pool" reading) but wears
// the RESTORE verb rather than a `+`, and it is a real button, not chrome.
function buildUndoTile() {
  const tile = document.createElement('div');
  tile.className = 'pool-tile ghost undo-tomb';
  const g = deletedPool.group;
  const nm = g.name || g.notation;
  const b = document.createElement('button');
  b.className = 'tile-stage ghost-add undo-restore';
  b.title = `Put ${nm} back`;
  b.setAttribute('aria-label', `Undo — put ${nm} back on the shelf`);
  const glyph = document.createElement('span');
  glyph.className = 'ghost-plus';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '↩';
  const word = document.createElement('span');
  word.className = 'ghost-noun';
  word.textContent = 'Undo';
  b.append(glyph, word);
  b.addEventListener('click', () => {
    const d = deletedPool;
    if (!d) return;
    deletedPool = null;
    // splice at the REMEMBERED index, clamped: the rack can have changed
    // under the tombstone (another delete, a new pool) while it stood.
    groups.splice(Math.min(d.index, groups.length), 0, d.group);
    saveGroups();
    renderGroups();
    announce(`${nm} is back.`);
  });
  tile.appendChild(b);
  return tile;
}

// A ghost '+' cell ends every shelf on YOUR rack: creation happens where
// the thing will live, so category is never typed. A stray tap is free —
// it opens a card that mints nothing until Enter/✓ (the newborn contract).
function buildGhostTile(sec) {
  const tile = document.createElement('div');
  tile.className = 'pool-tile ghost';
  const noun = SHELF_NOUN[sec.key] || 'pool';
  const full = groups.length >= 40;
  const b = document.createElement('button');
  b.className = 'tile-stage ghost-add';
  b.disabled = full;
  b.title = full ? 'Rack is full (40 pools)' : `New ${noun}…`;
  b.setAttribute('aria-label', b.title);
  const plus = document.createElement('span');
  plus.className = 'ghost-plus';
  plus.setAttribute('aria-hidden', 'true');
  plus.textContent = '＋';
  const nounEl = document.createElement('span');
  nounEl.className = 'ghost-noun';
  nounEl.textContent = noun;
  b.append(plus, nounEl);
  b.addEventListener('click', () => {
    creatingShelf = sec.key;
    creationDraft = { name: '', dice: ['d6'], touched: false };
    renderGroups();
    const input = groupsListEl.querySelector('.cc-name');
    if (input) input.focus();
  });
  tile.appendChild(b);
  return tile;
}

// The creation card, in place of its shelf's ghost: name + rank ladder
// (d6 pre-lit) + ✓ ✕. Ladder taps only move the ring; nothing exists until
// Enter/✓ mints {name, 1dN, category: this shelf}. Esc — or clicking away
// with an empty name and an untouched ring — discards silently.
function buildCreationCard(sec) {
  const card = document.createElement('div');
  card.className = 'group-row editing tile-editor creation-card';
  const noun = SHELF_NOUN[sec.key] || 'pool';

  const input = document.createElement('input');
  input.className = 'cc-name';
  input.type = 'text';
  input.maxLength = 24;
  input.autocomplete = 'off';
  input.placeholder = `Name this ${noun}…`;
  input.value = creationDraft.name; // survives repaints
  input.addEventListener('input', () => { creationDraft.name = input.value; });

  // The card composes like the palette (Joe, 2026-08-01: multi-die pools
  // are common): the six faces ADD a die per tap; the growing pool renders
  // as grouped units, and tapping a unit removes one of that type. d6
  // comes pre-staged — the common case stays name+Enter.
  const ladder = document.createElement('div');
  ladder.className = 'pid-die cc-die';
  const pool = document.createElement('div');
  pool.className = 'cc-pool';
  const paintPool = () => {
    pool.textContent = '';
    const counts = new Map();
    for (const t of creationDraft.dice) counts.set(t, (counts.get(t) || 0) + 1);
    for (const type of RANK_LADDER) {
      if (!counts.has(type)) continue;
      const n = counts.get(type);
      const u = document.createElement('button');
      u.className = 'cc-unit';
      u.title = `Remove one ${type}`;
      u.appendChild(buildDieStrip([type], 1));
      if (n > 1) {
        const x = document.createElement('span');
        x.className = 'pid-count';
        x.textContent = `×${n}`;
        u.appendChild(x);
      }
      u.addEventListener('click', () => {
        const i = creationDraft.dice.indexOf(type);
        if (i >= 0) creationDraft.dice.splice(i, 1);
        creationDraft.touched = true;
        paintPool();
      });
      pool.appendChild(u);
    }
    if (!creationDraft.dice.length) {
      const hint = document.createElement('span');
      hint.className = 'cc-empty';
      hint.textContent = 'add dice below';
      pool.appendChild(hint);
    }
  };
  const paintLadder = () => {
    ladder.textContent = '';
    for (const type of RANK_LADDER) {
      const b = document.createElement('button');
      b.className = 'pid-rank';
      b.dataset.die = type;
      b.title = `Add a ${type}`;
      b.appendChild(buildDieStrip([type], 1));
      b.addEventListener('click', () => {
        if (creationDraft.dice.length >= MAX_DICE_ON_TABLE) return;
        creationDraft.dice.push(type);
        creationDraft.touched = true;
        paintPool();
      });
      ladder.appendChild(b);
    }
  };
  paintPool();
  paintLadder();

  const mint = () => {
    if (groups.length >= 40 || !creationDraft.dice.length) return; // cap + an empty pool cannot mint
    const counts = new Map();
    for (const t of creationDraft.dice) counts.set(t, (counts.get(t) || 0) + 1);
    const notation = RANK_LADDER.filter((t) => counts.has(t))
      .map((t) => `${counts.get(t)}${t}`).join('+'); // die order = the canonical spelling
    const rec = { id: Date.now(), name: cutText(input.value, 24), notation };
    if (sec.key !== '\u0000') rec.category = sec.label;
    groups.push(rec);
    creatingShelf = null;
    creationDraft = { name: '', dice: ['d6'], touched: false };
    saveGroups();
    renderGroups();
  };
  const discard = () => {
    creatingShelf = null;
    creationDraft = { name: '', dice: ['d6'], touched: false };
    renderGroups();
  };

  const ok = document.createElement('button');
  ok.className = 'btn confirm cc-ok';
  ok.textContent = '✓';
  ok.title = `Add this ${noun}`;
  ok.addEventListener('click', mint);
  const no = document.createElement('button');
  no.className = 'btn cc-cancel';
  no.textContent = '✕';
  no.title = 'Cancel';
  no.addEventListener('click', discard);

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') mint();
    else if (e.key === 'Escape') discard();
  });
  card.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') discard();
  });
  // click-away with nothing entered discards silently (stray tap = free);
  // typed-or-touched cards stay open — commit is always explicit.
  setTimeout(() => {
    const away = (ev) => {
      if (creatingShelf !== sec.key || !card.isConnected) {
        document.removeEventListener('pointerdown', away, true);
        return;
      }
      if (card.contains(ev.target)) return;
      if (!input.value.trim() && !creationDraft.touched) {
        document.removeEventListener('pointerdown', away, true);
        // deferred: the pointer may be landing on ANOTHER shelf's ghost —
        // discarding synchronously would detach it before its click
        // dispatches (fleet catch); the re-check keeps one discard honest
        setTimeout(() => {
          if (creatingShelf === sec.key && !creationDraft.name.trim() && !creationDraft.touched) discard();
        }, 0);
      }
    };
    document.addEventListener('pointerdown', away, true);
  }, 0);

  const row = document.createElement('div');
  row.className = 'cc-row';
  row.append(input, ok, no);
  card.append(row, pool, ladder);
  return card;
}

// (buildPoolsSwitcher retired 2026-08-04 — the roster pill in the rail IS
// the browse verb now; teammate identity had two visual grammars and only
// one carried the click. renderPlayers builds the pills; setPoolsOwner
// refreshes the rail to reflect the pressed state.)

// Roster churn refreshes the RAIL PILLS without repainting the shelves —
// a full renderGroups would discard an open tile editor's unsaved text
// and drop keyboard focus. A foreign view (where no editor can exist)
// re-renders fully because its head may have swapped identity.
function refreshPoolsPresence() {
  if (poolsOwner) { renderGroups(); return; }
  renderPlayers(); // rebuilds pills; aria-pressed reflects poolsOwner
}

// A teammate's rack: the standing banner-chip (also the way back), then
// stage-only tiles. Staging SNAPSHOTS name+notation — a later
// pools-changed rewrites these tiles, never an already-staged chip.
function renderForeignPools(owner) {
  // The identity ("ALICE'S POOLS · READ-ONLY") lives in the swapped
  // #pools-head now (teammate consolidation 2026-08-04) — the standing
  // banner-chip is gone; the RAIL PILL IS the way back (press it again).
  // fail-closed per tile: render only what parses HERE (the server already
  // validated; a version skew still must not paint a dead tile)
  const pools = (Array.isArray(owner.pools) ? owner.pools : [])
    .filter((g) => g && typeof g.notation === 'string' && parseNotation(g.notation).ok);
  // §9: the owner's default set rode the roster/pools broadcast; unknown or
  // absent falls closed to the classics — never to the viewer's own set.
  const ownerSet = typeof owner.set === 'string' && (owner.set === 'std' || SETS[owner.set]) ? owner.set : 'std';
  if (!pools.length) {
    const none = document.createElement('div');
    none.className = 'pools-none';
    none.textContent = `${owner.name} has no saved pools yet.`;
    groupsListEl.appendChild(none);
    return;
  }
  for (const sec of buildSections(pools)) {
    const head = document.createElement('div');
    head.className = 'plabel pool-sec-head';
    // Same wrapper as the own rack, no figure ever — the ledger measures
    // YOUR rack only (manage is yours-only; §2l ③).
    const word = document.createElement('span');
    word.className = 'psh-word';
    word.textContent = sec.label;
    head.appendChild(word);
    groupsListEl.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'pool-grid';
    for (const g of sec.pools) {
      const res = parseNotation(g.notation);
      const tile = document.createElement('div');
      tile.className = 'pool-tile foreign';
      const stage = document.createElement('button');
      stage.className = 'tile-stage';
      const label = g.name || g.notation;
      stage.title = `Stage ${label} \u2014 ${g.notation}`;
      stage.setAttribute('aria-label', `Stage ${label} \u2014 ${g.notation}`);
      const art = document.createElement('span');
      art.className = 'tile-art';
      // §9: a teammate's rack shows the OWNER's world — an explicit pool
      // set wins, else the owner's published default, else the classics.
      // Never null here: null would fall back to the VIEWER's set at paint.
      art.appendChild(buildDieStrip(res.spec.dice, 2, { grouped: true, set: g.set || ownerSet }));
      const nameEl = document.createElement('span');
      nameEl.className = 'tile-name' + (g.name ? '' : ' as-notation');
      nameEl.textContent = label;
      const add = document.createElement('span');
      add.className = 'tile-add';
      add.setAttribute('aria-hidden', 'true');
      add.textContent = '+';
      stage.append(art, nameEl, add);
      // staging SNAPSHOTS what the tile showed (Joe 2026-08-04: the tray
      // must not switch a staged foreign pool to the local default) — the
      // resolved skin rides as a pin, 'std' included. Your OWN rack stages
      // unpinned: tile and tray both follow you, so they already agree.
      stage.addEventListener('click', () => stageGroup({ name: g.name, notation: g.notation, set: g.set || ownerSet }));
      tile.appendChild(stage);
      grid.appendChild(tile);
    }
    groupsListEl.appendChild(grid);
  }
}

// THE DICE-VALUE LEDGER (ROADMAP §2l ③): manage-and-measure — the figures
// exist only while ✎ is on, BUILT rather than hidden (display:none would
// still concatenate into every textContent read), and never on a foreign
// rack. The word is 'dice value', never "ceiling" — false in both
// directions: 4d6dl1 values 24 and caps at 18, 1d6! values 6 and reaches
// 24. The one legend sentence rides as the title.
const DICE_VALUE_LEGEND = 'dice value — the sum of every die’s highest face; modifiers, drops and explosions are not counted';
// What this shelf is allowed to cost under the rack's own system, or 0 when
// the system names no budget. The PROFILE's system, like the trio shelves —
// a character is priced by the rulebook it was built for, not by whichever
// table it is briefly sitting at.
function shelfBudget(label) {
  const sysId = (activeProfile(profileStore) || {}).system || tableSystem();
  const sys = SYSTEMS[sysId] || null;
  const b = sys && sys.budget;
  return (b && Number.isFinite(b[label])) ? b[label] : 0;
}

function shelfDiceValue(pools) {
  let sum = 0;
  for (const g of pools) {
    const res = parseNotation(g.notation);
    if (res.ok) sum += budgetOf(res.spec.dice, res.spec.mods);
  }
  return sum;
}

function renderGroups() {
  groupsListEl.innerHTML = '';
  // Digit targets are ALWAYS your own pools in your own rendered order —
  // browsing a teammate's rack must never remap your keyboard.
  renderedPools = digitPools(groups);
  if (poolsOwner && !poolsOwnerPlayer()) poolsOwner = null; // the owner left; fall home
  document.getElementById('pools-toolbar').classList.toggle('hidden', !!poolsOwner);
  // THE REGION HEAD (anatomy pass; teammate consolidation 2026-08-04): the
  // SAME element names both states — YOUR rack reads 'SAVED POOLS'; a
  // foreign rack reads "<owner>'s pools · read-only" in the same dress
  // (one head, one dress, two states). Rack list mirrors the class so
  // its category heads yield sticky in foreign (ownership > category
  // naming when browsing a teammate — one sticky pin per state).
  const poolsHead = document.getElementById('pools-head');
  const foreign = !!poolsOwner;
  const owner = foreign ? poolsOwnerPlayer() : null;
  poolsHead.classList.toggle('foreign', foreign);
  groupsListEl.classList.toggle('foreign', foreign);
  poolsHead.querySelector('.ph-word').textContent = foreign ? `${owner.name}'s pools` : 'Saved pools';
  poolsHead.classList.remove('hidden'); // one region head, always shown online-with-content
  // §11: the head gains a THIRD reason to exist — naming which of your
  // profiles is in your hands, and offering the switch. Hidden while a library
  // holds one profile, because then there is nothing to disambiguate and
  // nothing to switch to: a player who never makes a second profile sees no new
  // chrome anywhere. Hidden on a foreign rack too — one head, one state, and
  // the foreign one is about THEM.
  const pick = document.getElementById('profile-pick');
  const mineNow = activeProfile(profileStore);
  const many = profilesOf(profileStore).length > 1;
  // …OR MANAGE MODE (C16). §11.5 ② hides the picker at a library of one
  // because there is nothing to switch to, and at REST that is still right —
  // no new chrome for a player who never makes a second profile. In manage
  // mode it is wrong twice over: the head is already standing for its ledger
  // (C8), the ✎ beside it would be a rename control with no name in sight,
  // and the menu is the one place a SECOND character gets made. So while you
  // are deliberately editing a character, the head names it.
  const showPick = !foreign && !!mineNow && (many || poolsEdit);
  pick.classList.toggle('hidden', !showPick);
  poolsHead.classList.toggle('profiled', showPick);
  if (showPick) {
    const off = mineNow.system !== tableSystem();
    // The system word appears ONLY when it differs — a label the player needs
    // exactly when it is surprising, and silence the rest of the time.
    pick.textContent = off ? `${mineNow.name} · ${systemLabel(mineNow.system)} ▾` : `${mineNow.name} ▾`;
    pick.title = off
      ? `'${mineNow.name}' reads as ${systemLabel(mineNow.system)}; this table reads ${systemLabel(tableSystem())} — tap to switch`
      : `'${mineNow.name}' is in your hands — tap to switch profile`;
    pick.classList.toggle('off', off);
  }
  // ✎ RIDES WITH THE NAME (C16), and only where the name is: on your own
  // rack, with something in hand. It stands whenever the head does — a
  // library of one still renames, because the first character you make is
  // the one most likely to be called 'Corr' when you wanted 'Alice'.
  const ren = document.getElementById('profile-rename');
  const renIn = document.getElementById('profile-rename-in');
  const canRename = !foreign && !!mineNow;
  ren.classList.toggle('hidden', !canRename || !renIn.classList.contains('hidden'));
  if (!canRename) renIn.classList.add('hidden');
  // The rack total rides the region head's slack (.ph-rule flex:1) — one
  // right-flush ledger column with the shelf figures, its standing word
  // paid once here. Rebuilt fresh per render; absent outside manage.
  const oldFig = poolsHead.querySelector('.ph-fig');
  if (oldFig) oldFig.remove();
  // The head has to STAND to show it (C9) — see the :not(.ledgered) rule.
  poolsHead.classList.toggle('ledgered', !foreign && poolsEdit);
  if (!foreign && poolsEdit) {
    const fig = document.createElement('span');
    fig.className = 'ph-fig';
    fig.title = DICE_VALUE_LEGEND;
    const w = document.createElement('span');
    w.className = 'phf-word';
    w.textContent = 'dice value';
    const num = document.createElement('b');
    num.textContent = String(shelfDiceValue(groups));
    fig.append(w, num);
    poolsHead.appendChild(fig);
  }
  // The rail tracks the same truth — and it has to be updated ABOVE the
  // foreign-rack return, or navigating to a teammate's rack leaves the
  // collapsed rail showing whatever it last painted. The rail is always
  // YOUR pools (a launcher fires what you own), so it repaints from
  // `groups` regardless of whose rack the panel is showing.
  renderRailColumn();
  if (foreign) {
    renderForeignPools(poolsOwnerPlayer());
    return;
  }
  for (const sec of buildSections(groups, { ensureTrio: poolsEdit })) {
    const head = document.createElement('div');
    head.className = 'plabel pool-sec-head';
    const word = document.createElement('span');
    word.className = 'psh-word';
    word.textContent = sec.label;
    head.appendChild(word);
    if (poolsEdit) {
      const fig = document.createElement('span');
      fig.className = 'psh-fig';
      const spent = shelfDiceValue(sec.pools);
      // THE BUDGET, WHERE IT IS BEING SPENT (C8). The bare integer answered
      // "what does this shelf cost" and never "is that right" — so CUJ6's
      // own done-when, *priced against the system's creation budget*, was
      // served by the player remembering 100 from a design document. The
      // target comes from the SYSTEM's profile (meanings.js `budget`), so no
      // Soul Deal number lives at a render site, which is what
      // POOL-ANALYSIS §9's ruling was protecting. A system that names no
      // budget still prints its bare total.
      const target = shelfBudget(sec.label);
      if (target) {
        fig.title = `${DICE_VALUE_LEGEND} — this shelf's budget is ${target}`;
        fig.textContent = `${spent}/${target}`;
        // Over is the only state worth a hue: under-budget is an ordinary
        // moment in building a character, and colouring it would nag at
        // every step of the thing it is meant to help.
        fig.classList.toggle('over', spent > target);
      } else {
        fig.title = DICE_VALUE_LEGEND;
        fig.textContent = String(spent);
      }
      head.appendChild(fig);
    }
    groupsListEl.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'pool-grid';
    // Where the tombstone goes, if this is its shelf (U28a). Counted among
    // the SURVIVORS: the deleted pool's global index is compared against each
    // remaining pool's, so the slot lands between the same two neighbours it
    // sat between — not at the end, and not off by one when the shelf is not
    // a contiguous run of the rack.
    const sectionKeyOf = (g) => (g.category || '').trim().toLowerCase() || '\u0000';
    const tombAt = (deletedPool && sectionKeyOf(deletedPool.group) === sec.key)
      ? sec.pools.filter((p) => groups.indexOf(p) < deletedPool.index).length
      : -1;
    for (const [gi, g] of sec.pools.entries()) {
      if (gi === tombAt) grid.appendChild(buildUndoTile());
      const ord = digitOf(g); // U24: the shelf-shared digit, 0 when it has none

      // This tile is being edited: the editor card spans the shelf.
      if (g.id === editingGroupId) {
        const ed = document.createElement('div');
        ed.className = 'group-row editing tile-editor';
        ed.dataset.groupId = String(g.id);
        ed.appendChild(buildGroupEditor(g));
        grid.appendChild(ed);
        continue;
      }

      const tile = document.createElement('div');
      tile.className = 'pool-tile';
      tile.dataset.groupId = String(g.id);

      // ONE verb on the tile: STAGE (the sources-add grammar). No gold, no
      // ROLL cue — those belong to the draft cluster alone.
      const res = parseNotation(g.notation);
      const types = res.ok ? res.spec.dice : [];
      const stage = document.createElement('button');
      stage.className = 'tile-stage';
      const nm = g.name || g.notation;
      stage.title = `Stage ${nm} — ${g.notation}`;
      stage.setAttribute('aria-label', `Stage ${nm} — ${g.notation}`);
      const art = document.createElement('span');
      art.className = 'tile-art';
      art.appendChild(buildDieStrip(types, 2, { grouped: true, set: g.set || null }));
      const nameEl = document.createElement('span');
      nameEl.className = 'tile-name' + (g.name ? '' : ' as-notation');
      nameEl.textContent = nm;
      stage.append(art, nameEl);
      const add = document.createElement('span');
      add.className = 'tile-add';
      add.setAttribute('aria-hidden', 'true');
      add.textContent = '+';
      stage.appendChild(add);
      if (ord) {
        const o = document.createElement('span');
        o.className = 'pool-ord';
        o.setAttribute('aria-hidden', 'true');
        o.textContent = String(ord);
        stage.appendChild(o);
      }
      // In manage mode the whole 64px tile is the editor door (the retired
      // per-tile ✎'s verb) — staging stays gated off; at rest it stages.
      stage.addEventListener('click', () => {
        if (lp.took()) return; // a long-press already opened the popover
        if (poolsEdit) togglePopover(g, tile);
        else stageGroup(g);
      });
      if (poolsEdit) {
        stage.title = `Edit ${nm} — name, shelf, die`;
        stage.setAttribute('aria-label', `Edit ${nm}`);
      }
      // Touch door without manage mode: 500ms hold (10px move-cancel) opens
      // the same popover the desktop right-click does; the synthetic click
      // that follows is suppressed. Android fires native contextmenu too —
      // the contextmenu handler clears this timer so the doors never
      // double-toggle.
      const lp = attachLongPress(stage, () => {
        if (pop && pop.source === 'group' && pop.groupId === g.id) return;
        togglePopover(g, tile);
      });
      tile.appendChild(stage);

      // Tile ± retired (2026-08-01, Joe): tweaking belongs to the ROLL
      // moment — stage the pool and the draft's ± is right there. The
      // right-click stays as the quiet per-tile path to the popover
      // (Update-this-pool / variants), same pointer bonus as the cluster.
      tile.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        lp.clear(); // Android fires this first — one door wins
        if (pop && pop.source === 'group' && pop.groupId === g.id) return; // long-press won
        togglePopover(g, tile);
      });

      if (poolsEdit) {
        // ✎-per-tile retired (the Sheet Pass): the whole tile opens the
        // editor popover now. The destructive ✕ is what the gate is FOR.
        const delBtn = document.createElement('button');
        delBtn.className = 'group-del tile-del';
        delBtn.textContent = '✕';
        delBtn.title = 'Delete pool';
        delBtn.addEventListener('click', () => {
          if (pop && pop.source === 'group' && pop.groupId === g.id) closePopover();
          // REMEMBER IT (U28a). One tap used to delete a saved pool outright,
          // with no confirm and no way back — the rack's only irreversible
          // act, on its smallest control. The pool and its index go to the
          // tombstone, which renders in the slot it just left.
          const at = groups.findIndex((x) => x.id === g.id);
          deletedPool = { group: g, index: at < 0 ? groups.length : at };
          groups = groups.filter((x) => x.id !== g.id);
          saveGroups();
          renderGroups();
          announce(`Deleted ${nm}. Undo is in its place.`);
        });
        tile.append(delBtn);
      }

      grid.appendChild(tile);
      if (pop && pop.source === 'group' && pop.groupId === g.id) {
        tile.classList.add('open');
        pop.row = tile;
      }
    }
    // …and if it sat LAST on its shelf there is no survivor to precede, so
    // the loop above never placed it. The ghost/creation cell comes after.
    if (tombAt >= sec.pools.length) grid.appendChild(buildUndoTile());
    if (poolsEdit) {
      // creation is an EDITING verb (Joe, 2026-08-01): ghosts and the
      // card render only inside ✎ — the rest state is pure play
      if (creatingShelf === sec.key) grid.appendChild(buildCreationCard(sec));
      else grid.appendChild(buildGhostTile(sec));
    }
    groupsListEl.appendChild(grid);
  }
  if (poolsEdit) groupsListEl.appendChild(buildNewShelfRow());
}

// THE COLLAPSED POOL RAIL (Joe 2026-08-07: "the minimize view of the panel
// is really bad right now… if it remains, it should be able to do only the
// most core operations, but do them quickly and cleanly").
//
// Every defect he listed was downstream of ONE number: 56px. Names ran
// VERTICALLY because a word did not fit. Shelf titles vanished because a
// heading did not fit. Multi-pick was impossible because a tray had nowhere
// to live. So the rail is 112px now (--sidebar-rail-w; this comment and two
// others said 104 through the pass that shipped 112), and the defects go with
// the width: shelf-grouped rows, horizontal names, a tap that SELECTS, and
// one gold bar that rolls the selection.
//
// 2i-G — A SELECTION IS NOT A DRAFT. It is ordered by the rack (never by
// tap order), visible where it is made, never persisted, and SPENT BY ITS
// ROLL. That is why "clear it after each roll" here does not contradict
// 2i-E's spent-draft rule (a draft survives its roll and cools): the draft
// is a composition you can keep editing; this is a pick you already fired.
// Expanding the panel drops the selection too — the workbench is the
// composing surface, and carrying a half-pick across the boundary would
// leave state visible in neither place.
let railSel = new Set(); // pool ids, this session only

// ---- the column's two source lists (§7.23) ---------------------------------
// The collapsed rail is a LAUNCHER: two lists, one standing gold verb. Pools
// are a SET you pick from; dice are a MULTISET you count up. Both are picks,
// never drafts (2i-G) — ordered by their list, never persisted, spent by their
// roll. The MODE is a preference and persists; the PICKS never do.
const LS_RAILMODE = 'dice.railmode.v1';
let railDice = []; // die-type strings, this session only
// A digit pressed while the dice list is up surfaces the pool list for THIS
// VISIT without rewriting the preference — loadIntoBox's precedent, and the
// reason a digit sequence still means the same roll in every state. Clearing
// railDice alone could not do it: resolution would fall straight back to the
// stored 'dice'.
let railModeVisit = null;

// The palette order the collapsed list walks, shared with the expanded
// palette's own tiles so the digit map and the two lists can never drift.
const RAIL_DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20', 'd100'];

function railModeStored() {
  const v = load(LS_RAILMODE, null);
  return v === 'dice' || v === 'pools' ? v : null;
}

// Resolution lives ONLY in the render path, so it can never run before
// `groups`/`railDice` exist. Order matters: a live dice pick outranks
// everything, because a pool arriving mid-composition (an import, an SSE
// push) must never yank the column out from under three taps of work.
function railMode() {
  // ORDER IS THE MECHANISM (U10). A live dice pick used to outrank
  // everything, which forced setRailMode('pools') to WIPE railDice or the
  // render would flip straight back — so a control that looks exactly like
  // the harmless bar upstairs destroyed three counted taps with no undo,
  // four lines under a comment reading "BOTH PICKS SURVIVE". §7.23 states
  // "Nothing is ever destroyed by navigation" as law, and the code broke it
  // twice. An explicit choice — a press, or a digit's one-visit loan — now
  // outranks the pick, so nothing has to be destroyed to make the switch
  // work, and both picks wait where you left them.
  if (!groups.length) return 'dice';   // nothing in the other list to show
  if (railModeVisit) return railModeVisit;
  const stored = railModeStored();
  if (stored) return stored;
  // Only with NO preference at all does a live pick decide: it is the one
  // signal there is, and it still must not yank the column out from under
  // three taps when a pool arrives mid-composition (an import, an SSE push).
  if (railDice.length) return 'dice';
  return 'pools'; // your pools are the point, when you have them
}

function setRailMode(mode) {
  if (mode !== 'dice' && mode !== 'pools') return railMode();
  if (mode === 'pools' && !groups.length) return railMode();
  railModeVisit = null; // an explicit choice ends the loan
  save(LS_RAILMODE, mode);
  // BOTH PICKS SURVIVE. An earlier design dropped the outgoing one "so Enter
  // and Esc stay single-minded" — but that is a 39px control sitting a
  // thumb's width above the first row silently eating three taps of picked
  // work, with no undo. Enter, Esc and the gold bar all act on the VISIBLE
  // list's pick instead, which is the same rule the digits follow.
  // …and NOTHING is dropped here any more (U10). The wipe existed only
  // because railMode() gave a live pick priority above an explicit choice;
  // with that order fixed the switch simply works, and a mis-tap on a 39px
  // control costs a tap rather than the work.
  renderRailColumn();
  return railMode();
}

// ONE dispatcher for the whole collapsed column: resolve the mode, paint the
// switch, render exactly one list, arm the verb. renderGroups calls THIS, so a
// rack that empties or fills while the panel is collapsed can never leave the
// switch describing a list that is not there.
function renderRailColumn() {
  const seg = document.getElementById('rail-mode');
  const poolsEl = document.getElementById('rail-pools');
  const diceEl = document.getElementById('rail-dice');
  if (!seg || !poolsEl || !diceEl) return;
  // Joe: "unless they delete all their pools, in which case the default logic
  // applies again". Forgetting the key IS the default logic — anything else
  // makes an empty rack remember a choice made about a rack that is gone.
  if (!groups.length && railModeStored()) {
    try { localStorage.removeItem(LS_RAILMODE); } catch { /* ignore */ }
  }
  const mode = railMode();
  for (const b of seg.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.rm === mode));
    // Unavailable, not absent and not merely dim (2i-C): the cell keeps its
    // width so the switch never changes shape under you.
    b.disabled = b.dataset.rm === 'pools' && !groups.length;
    b.title = b.disabled ? 'No saved pools yet'
      : b.dataset.rm === 'dice' ? 'Loose dice' : 'Your saved pools';
  }
  poolsEl.classList.toggle('rail-list-off', mode !== 'pools');
  diceEl.classList.toggle('rail-list-off', mode !== 'dice');
  if (mode === 'pools') renderRailPools(); else renderRailDice();
}

{
  const seg = document.getElementById('rail-mode');
  if (seg) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && !b.disabled) setRailMode(b.dataset.rm);
    });
  }
  // The collapsed verb wears the WELL'S OWN ROLL CUE — built by the same
  // function, in the same engraved form, so the word, its tracking and the
  // lozenge-tipped rules beside it can never drift from the tray's. Joe
  // 2026-08-08: "aim for the small version to match the 'roll' button on the
  // bottom of the tray, not just in look-and-feel but also in the font and
  // decoration". Cut from the same material means built by the same hand.
  const rb = document.getElementById('rail-roll');
  if (rb) rb.insertBefore(buildRollCue('roll', true), rb.firstChild);
}

// FOCUS SURVIVES A RE-RENDER (U22, audit D5). Both rail lists rebuild from
// `textContent = ''`, which destroys whatever was focused and drops focus to
// <body> — so picking three pools by keyboard cost three full tab-walks from
// the top of the document, while the expanded rack (renderTray) kept focus
// the whole time. Twins behaving oppositely, and the collapsed one is the
// state a keyboard player is most likely to be living in.
//
// Restore by INDEX among the container's focusables, not by identity: the
// render that fires here is a selection toggle, which changes each row's
// dress and not the list's shape, so position is exactly stable across it.
// Clamped, so a render that DOES shorten the list (a pool deleted elsewhere)
// lands on the nearest surviving row instead of nothing.
function keepFocusThrough(el, render) {
  const active = document.activeElement;
  const idx = (active && el.contains(active)) ? focusablesIn(el).indexOf(active) : -1;
  render();
  if (idx < 0) return;
  const items = focusablesIn(el);
  const target = items[Math.min(idx, items.length - 1)];
  if (target) { try { target.focus({ preventScroll: true }); } catch { /* gone */ } }
}

function renderRailPools() {
  const el = document.getElementById('rail-pools');
  if (el) return keepFocusThrough(el, () => renderRailPoolsInner(el));
  return renderRailPoolsInner(el);
}

function renderRailPoolsInner(elIn) {
  const el = elIn || document.getElementById('rail-pools');
  if (!el) return;
  // Clear BEFORE the collapsed gate: renderGroups calls this above its own
  // foreign-rack early return now, so it runs while expanded too, and stale
  // rows must not survive under a rack you have navigated away from.
  el.textContent = '';
  if (!document.getElementById('left-panel').classList.contains('collapsed')) {
    updateRailRoll();
    return;
  }
  // Shelves as the rack orders them (no ensureTrio: a launcher shows what
  // you HAVE, where the character sheet shows what you could have).
  const secs = buildSections(groups).filter((s) => s.pools.length);
  const live = new Set();
  for (const sec of secs) {
    const wrap = document.createElement('div');
    wrap.className = 'rp-shelf';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', sec.label);
    // The head stands for any REAL shelf, even when it is the only one — a
    // rack of nine attributes is exactly the case Joe was complaining about,
    // and counting sections would have shown him nothing. Only the synthetic
    // catch-all is suppressed: 'POOLS' over uncategorized pools names
    // nothing you did not already know.
    if (sec.key !== '\u0000') {
      const h = document.createElement('div');
      h.className = 'rp-shelf-head';
      h.textContent = sec.label;
      wrap.appendChild(h);
    }
    for (const g of sec.pools) {
      const res = parseNotation(g.notation);
      const ord = digitOf(g); // U24: one map, both surfaces
      const b = document.createElement('button');
      b.className = 'rp-item';
      if (!res.ok) {
        // Unreachable through every shipped door (migrateGroup and setGroups
        // both refuse a pool whose notation will not parse) — kept as
        // defence, because a silent `continue` would make a pool that is
        // really there simply vanish from its shelf.
        b.classList.add('rp-bad');
        b.disabled = true;
        b.textContent = g.name || '?';
        b.title = `${g.name || 'this pool'} — its notation no longer parses`;
        wrap.appendChild(b);
        continue;
      }
      live.add(g.id);
      const picked = railSel.has(g.id);
      b.setAttribute('aria-pressed', picked ? 'true' : 'false');
      b.title = `${g.name || res.canonical} — ${res.canonical}`;
      b.setAttribute('aria-label', `${g.name || res.canonical}, ${res.canonical} — ${sec.label}`);
      if (g.name) {
        const nm = document.createElement('span');
        nm.className = 'rp-name';
        nm.textContent = g.name; // horizontal, ellipsized — never rotated
        b.appendChild(nm);
      } else {
        const dice = document.createElement('span');
        dice.className = 'rp-dice';
        dice.appendChild(buildDieStrip(res.spec.dice, 3, { grouped: true, set: g.set || null }));
        b.appendChild(dice);
      }
      if (ord) {
        const o = document.createElement('span');
        o.className = 'rp-ord';
        o.setAttribute('aria-hidden', 'true'); // the digit shortcut, not content
        o.textContent = String(ord);
        b.appendChild(o);
      }
      b.addEventListener('click', () => railToggle(g));
      wrap.appendChild(b);
    }
    el.appendChild(wrap);
  }
  if (!secs.length) {
    const ghost = document.createElement('div');
    ghost.className = 'rp-empty';
    ghost.textContent = 'No saved pools';
    el.appendChild(ghost);
  }
  // A pool that left the rack takes its pick with it.
  for (const id of [...railSel]) if (!live.has(id)) railSel.delete(id);
  updateRailRoll();
}

function railToggle(g) {
  if (railSel.has(g.id)) railSel.delete(g.id); else railSel.add(g.id);
  renderRailPools();
}

// THE DICE LIST — the pool list's twin, one row per die type. A 2-column tile
// grid was drawn first and refused on measurement: at 86px the tracks come out
// ~40px, `10d10x` needs 39px of label alone, and `repeat(2, 1fr)` would resize
// a tile's NEIGHBOUR on the tenth tap ("the geometry never moves"). One column
// gives the notation room and costs nothing — the column was never wide enough
// to be a grid, which is the same lesson §7.22 learned at 56px.
function renderRailDice() {
  const host = document.getElementById('rail-dice');
  if (host) return keepFocusThrough(host, () => renderRailDiceInner());
  return renderRailDiceInner();
}

function renderRailDiceInner() {
  const el = document.getElementById('rail-dice');
  if (!el) return;
  el.textContent = '';
  if (!document.getElementById('left-panel').classList.contains('collapsed')) return;
  for (const type of RAIL_DIE_TYPES) {
    const n = railDice.filter((t) => t === type).length;
    const cell = document.createElement('div');
    cell.className = 'rd-cell';
    const b = document.createElement('button');
    b.className = 'rp-item rd-item';
    b.setAttribute('aria-pressed', n ? 'true' : 'false');
    const art = document.createElement('span');
    art.className = 'rp-dice';
    // No d100 solid exists — the palette's eighth cell reuses the d10x art for
    // the same reason. Without this the row rendered as a bare word and broke
    // the one left edge every other row holds.
    art.appendChild(buildDieStrip([type === 'd100' ? 'd10x' : type], 1));
    b.appendChild(art);
    const nm = document.createElement('span');
    nm.className = 'rp-name';
    // THE COUNT IS THE LABEL: `d6` becomes `1d6`, `2d6`, `3d6` — the notation
    // itself, one glyph cheaper than a `×3` badge, self-explaining, and the
    // same string the roll will send.
    // The FIRST tap writes `1d6`, it does not stay at `d6` (Joe 2026-08-08:
    // "when I click once it highlights, then the next click the text jumps to
    // 2dX, it's weird that it skips 1dX"). Suppressing the 1 was the
    // typographer's instinct and the wrong one: the label's job here is to
    // count, and a counter whose first increment is invisible reads as
    // starting at two.
    nm.textContent = n ? `${n}${type}` : type;
    b.appendChild(nm);
    b.title = n ? `${n}${type} staged — tap to add another` : `Add a ${type}`;
    b.setAttribute('aria-label', n ? `${n} ${type}, add another` : `Add one ${type}`);
    b.addEventListener('click', () => railAddDie(type));
    cell.appendChild(b);
    if (n) {
      // Remove-one, in the slot the pool list gives its digit ordinal — a
      // SIBLING of the row, never a button inside a button. It stands on
      // coarse pointers (P6's per-die ✕ tier) because a counted row you
      // cannot decrement by touch is a trap.
      const x = document.createElement('button');
      x.className = 'rd-x';
      x.type = 'button';
      // TABBABLE (U22, audit D5). This was tabIndex=-1, three lines under a
      // comment calling the touch version of the same omission a trap — the
      // identical trap left standing for the keyboard, where the only other
      // way to undo a mis-count was Esc, which drops the whole pick. The
      // reason it was hidden (a ✕ that only appears near the pointer) is a
      // POINTER affordance; a keyboard has no pointer to be near, and the
      // dress below already stands it up on :focus-within.
      x.textContent = '✕';
      x.title = `Remove one ${type}`;
      x.setAttribute('aria-label', `Remove one ${type}`);
      x.addEventListener('click', (e) => { e.stopPropagation(); railRemoveDie(type); });
      cell.appendChild(x);
    }
    el.appendChild(cell);
  }
  updateRailRoll();
}

function railAddDie(type) {
  // d100 is two dice everywhere else in this app; it is two here too, and its
  // effect shows on the d10x and d10 rows rather than inventing a third count.
  const add = type === 'd100' ? ['d10x', 'd10'] : [type];
  if (railDice.length + add.length > MAX_DICE_ON_TABLE) {
    // Refused AT THE INCREMENT, not by draining the verb: a die grows the pick
    // by one or two, so the marginal tap is exactly what to refuse. (A pool
    // can leap the cap in one un-splittable tap, which is why the pool list
    // keeps its drained bar instead.)
    railNote(`That would pass the ${MAX_DICE_ON_TABLE}-die table cap`);
    return;
  }
  railDice.push(...add);
  railNote('');
  renderRailDice();
}

function railRemoveDie(type) {
  const i = railDice.lastIndexOf(type);
  if (i >= 0) railDice.splice(i, 1);
  railNote('');
  renderRailDice();
}

// The rail's dice roll is BARE by construction — plain NdX with every axis at
// its default. That is what lets a launcher fire it without becoming an
// authoring surface (§7.4): a bare spec's whole intent is visible on its face,
// and `3d6` from here is byte-identical to `3d6` from the box. The first
// hidden part — a modifier, a dc, a visibility — is where authoring begins,
// and the rail refuses it. `n` and `/` are one keystroke away.
function railDiceCanonical() {
  return railDice.length ? canonicalNotation({ dice: [...railDice] }) : '';
}

function rollRailDice() {
  if (!railDice.length) return;
  const notation = railDiceCanonical();
  const res = parseNotation(notation);
  if (!res.ok) return;
  requestRoll([...res.spec.dice], res.canonical, {
    notation, canonical: res.canonical,
  });
  railDice = []; // spent by its roll (2i-G) — no well up here to explain a survivor
  railNote('');
  renderRailColumn();
}

function railClearSel() {
  railSel.clear();
  renderRailPools();
  updateRailRoll(); // renderRailPools returns early when expanded; the bar still has to go
}

// The picked pools, in RACK order — never tap order. Two players tapping the
// same three pools in different orders must send the same roll, and it is
// also what makes the digit shortcuts mean the same thing everywhere.
function railPicked() {
  const out = [];
  for (const sec of buildSections(groups)) {
    for (const g of sec.pools) if (railSel.has(g.id)) out.push(g);
  }
  return out;
}

// The rail's own note line. showSettingsNote cannot serve here: outside the
// settings modal it falls through to the status pill, and the collapsed rail
// folds that pill to a 10px colorless dot — so every "set aside" whisper the
// compose path owes would be invisible in exactly the state it fires in.
function railNote(text) {
  const el = document.getElementById('rail-note');
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
  // …and SAY it. This node sets textContent and clears `hidden` in the same
  // task, so it is out of the a11y tree at the moment of the mutation and
  // announced nothing — the cap refusal, which exists precisely because the
  // collapsed pill is invisible, was invisible twice over.
  if (text) announce(text);
}

function updateRailRoll() {
  const wrap = document.getElementById('rail-roll-wrap');
  const btn = document.getElementById('rail-roll');
  if (!wrap || !btn) return;
  const picks = railPicked();
  // STANDING FURNITURE, not a contextual verb (§7.9, Joe 2026-08-07: "I
  // absolutely despise the fact that the roll button only appears after
  // pools are selected. I'd strongly prefer it exist but be grayed out").
  // The workbench rail settled this same question the same way and its
  // ruling explicitly supersedes §7.14's contextual rail — this surface was
  // built on the superseded half. The geometry never moves; the verb is
  // simply not armed yet, which the 2i-C disabled code says out loud.
  wrap.hidden = false;
  // The verb never changes its WORD across the two lists (§7.21: what varies
  // is the payload, and the payload is the title's job). Only what feeds it
  // changes; the bar itself is the one thing in this column that never moves.
  if (railMode() === 'dice') {
    const count = btn.querySelector('.rr-count');
    if (!railDice.length) {
      btn.disabled = true;
      btn.title = 'Tap a die to roll';
      btn.setAttribute('aria-label', 'Roll — tap a die first');
      if (count) count.textContent = '';
      return;
    }
    const canonical = railDiceCanonical();
    btn.disabled = false;
    btn.title = `Roll ${canonical}`;
    btn.setAttribute('aria-label', `Roll ${canonical}`);
    if (count) count.textContent = railDice.length > 1 ? String(railDice.length) : '';
    return;
  }
  if (!picks.length) {
    btn.disabled = true;
    btn.title = 'Pick a pool to roll';
    btn.setAttribute('aria-label', 'Roll — pick a pool first');
    const c0 = btn.querySelector('.rr-count');
    if (c0) c0.textContent = '';
    railNote('');
    return;
  }
  let dice = 0;
  for (const g of picks) {
    const res = parseNotation(g.notation);
    if (res.ok) dice += res.spec.dice.length;
  }
  const over = dice > MAX_DICE_ON_TABLE;
  btn.disabled = over;
  btn.title = over
    ? `${dice} dice — over the ${MAX_DICE_ON_TABLE}-die table cap`
    : `Roll ${picks.length === 1 ? picks[0].name || 'this pool' : `${picks.length} pools`}`;
  btn.setAttribute('aria-label',
    `Roll ${picks.length} pool${picks.length === 1 ? '' : 's'}: ${picks.map((g) => g.name || 'unnamed').join(', ')}`);
  const count = btn.querySelector('.rr-count');
  if (count) count.textContent = picks.length > 1 ? String(picks.length) : '';
}

// Roll a pool AS ITSELF from the rail: the same request the staged-alone
// pool sends, built by round-tripping the pool through the one grammar —
// its name becomes each die's source, its set override rides (rollSetOf
// semantics at requestRoll: 'std' pins the classics), and any dc/moment/
// visibility the notation carries plays exactly as it would from the box.
function rollRailPool(g) {
  const res = parseNotation(g.notation);
  if (!res.ok) return;
  const label = sanitizeSourceLabel(g.name);
  const spec = { dice: [...res.spec.dice], mods: res.spec.mods || null };
  const srcs = label ? res.spec.dice.map(() => label) : res.spec.sources || null;
  if (srcs && srcs.some(Boolean)) spec.sources = [...srcs];
  const labeled = canonicalWithVis(spec, {
    dc: res.dc,
    comment: res.comment,
    exp: res.exp,
  }, visOfParse(res));
  const res2 = parseNotation(labeled);
  if (!res2.ok) return;
  const intent = notationIntent(labeled, res2);
  const gSet = typeof g.set === 'string' && (g.set === 'std' || SETS[g.set]) ? g.set : null;
  requestRoll([...res2.spec.dice], res2.comment || res2.canonical, {
    notation: intent.notation,
    canonical: intent.canonical,
    mods: res2.spec.mods || undefined,
    sources: res2.spec.sources || undefined,
    faceDown: res2.faceDown,
    visibility: visOfParse(res2) || undefined,
    dc: res2.dc ?? undefined,
    exp: intent.exp || undefined,
    ...(gSet ? { set: gSet } : {}),
  });
}

// Roll the rail's selection. ONE pick launches the pool exactly as authored
// (rollRailPool, untouched): its dc, moment, visibility, keep/drop, reroll,
// explode and set override all ride, byte-identical to what the rack sends.
//
// TWO OR MORE is a COMPOSE, and a compose cannot carry everything, because
// the grammar has no union for it. What rides: the dice, each die's source
// label, and each pool's flat modifier as a labeled part (`+2[Wisdom]`).
// What is set aside, out loud:
//   · keep/drop, reroll, explode, adv — these GLUE to one dice type. A sum
//     of different types rejects them outright; a sum of the SAME type is
//     worse, because `4d6dl1 + 2d6` silently canonicalizes to `6d6dl1` and
//     quietly changes the distribution. So they are stripped unconditionally
//     rather than attempted and caught.
//   · a dc or moment declared by more than one pick (no union of two stakes).
// Visibility fails CLOSED (goal 11): one declared mode rides; two different
// ones become `secret`, which is strictly more closed than either.
function rollRailSelection() {
  const picks = railPicked();
  if (!picks.length) return;
  const parsed = [];
  for (const g of picks) {
    const res = parseNotation(g.notation);
    if (res.ok) parsed.push({ g, res });
  }
  if (!parsed.length) return;
  if (parsed.length === 1) { rollRailPool(parsed[0].g); railClearSel(); return; }

  const dice = [];
  const sources = [];
  const sets = [];
  const parts = [];
  const setAside = [];
  let dc = null; let dcConflict = false;
  let exp = null; let expConflict = false;
  let vis = null; let visConflict = false;
  for (const { g, res } of parsed) {
    const label = sanitizeSourceLabel(g.name);
    const gSet = typeof g.set === 'string' && (g.set === 'std' || SETS[g.set]) ? g.set : null;
    for (let i = 0; i < res.spec.dice.length; i++) {
      if (dice.length >= MAX_DICE_ON_TABLE) break;
      dice.push(res.spec.dice[i]);
      sources.push(label || (res.spec.sources ? res.spec.sources[i] || null : null));
      sets.push(gSet);
    }
    const m = res.spec.mods || {};
    const glued = [];
    if (m.keep) glued.push('keep/drop');
    if (m.reroll) glued.push('reroll');
    if (m.explode) glued.push('!');
    if (m.adv) glued.push(m.adv);
    if (glued.length) setAside.push(`${g.name || 'pool'}: ${glued.join(' · ')}`);
    // A pool's flat bonus rides as a LABELLED part, so the composed roll
    // still says where every number came from (the attributed-math
    // invariant). An already-labelled part keeps its own label; a bare
    // `+2` inherits the pool's name, which is the attribution it meant.
    if (Array.isArray(m.parts)) {
      for (const p of m.parts) {
        if (p.value) parts.push({ label: p.label || label || '', value: p.value });
      }
    } else if (typeof m.modifier === 'number' && m.modifier) {
      parts.push({ label: label || '', value: m.modifier });
    }
    if (res.dc != null) { if (dc != null && dc !== res.dc) dcConflict = true; else dc = res.dc; }
    if (res.exp) { if (exp && exp !== res.exp) expConflict = true; else exp = res.exp; }
    const v = visOfParse(res);
    if (v) {
      if (vis && vis.mode !== v.mode) visConflict = true;
      else vis = v;
    }
  }
  if (dcConflict) { dc = null; setAside.push('two targets'); }
  if (expConflict) { exp = null; setAside.push('two moments'); }
  if (visConflict) { vis = { mode: 'secret' }; setAside.push('mixed visibility → secret'); }

  // `modifier` is the sum parts always ride beside (parseNotation sets it
  // whenever parts exist); canonicalNotation reads parts, the roll math
  // reads the sum.
  const spec = {
    dice,
    mods: parts.length
      ? { parts, modifier: parts.reduce((a, p) => a + p.value, 0) }
      : null,
  };
  if (sources.some(Boolean)) spec.sources = sources;
  const labeled = canonicalWithVis(spec, { dc, exp }, vis);
  const res2 = parseNotation(labeled);
  if (!res2.ok) {
    // The one real ceiling: MAX_PARTS is 12, so a dozen-plus picks each
    // carrying a modifier stops parsing. Say so and KEEP the selection —
    // the player drops a pick rather than losing the whole pick.
    railNote(res2.error || 'that many pools will not compose');
    return;
  }
  const intent = notationIntent(labeled, res2);
  const uniform = sets.every((s) => s && s === sets[0]) ? sets[0] : null;
  requestRoll([...res2.spec.dice], res2.comment || res2.canonical, {
    notation: intent.notation,
    canonical: intent.canonical,
    mods: res2.spec.mods || undefined,
    sources: res2.spec.sources || undefined,
    faceDown: res2.faceDown,
    visibility: visOfParse(res2) || undefined,
    dc: res2.dc ?? undefined,
    exp: intent.exp || undefined,
    ...(uniform ? { set: uniform } : sets.some(Boolean) ? { sets: [...sets] } : {}),
  });
  railClearSel();
  if (setAside.length) railNote(`${setAside.join(' · ')} set aside`);
}

// '＋ New shelf…' — the rack-level twin of the strip's ＋ chip: a full-width
// dashed row after the last shelf, edit mode only. Enter mints a session
// shelf (see draftShelves); its ghost tile then mints the first pool.
function buildNewShelfRow() {
  const row = document.createElement('div');
  row.className = 'new-shelf-row';
  const b = document.createElement('button');
  b.className = 'pt-toggle new-shelf';
  b.textContent = '＋ New shelf…';
  b.title = 'Add a category of pools';
  b.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'new-shelf-input';
    input.type = 'text';
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.placeholder = 'Name the shelf…';
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const name = cutText(input.value, 24);
      const k = name.toLowerCase();
      const taken = TRIO.includes(k) || draftShelves.some((n) => n.toLowerCase() === k)
        || groups.some((g) => (g.category || '').trim().toLowerCase() === k);
      if (name && !taken) draftShelves.push(name);
      renderGroups();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') { done = true; renderGroups(); }
    });
    input.addEventListener('blur', () => setTimeout(commit, 0));
    row.replaceChild(input, b);
    input.focus();
  });
  row.appendChild(b);
  return row;
}
renderGroups();

// (The tray save morph retired 2026-08-04 — Joe: the rim's Save was a
// second way to do what pool editing already owns. Keeping a draft is the
// rack's job now: ✎ ghost tiles mint, the popover's Duplicate… copies,
// the peek's 'Save as pool…' keeps a rolled result. Saved-pool WRITES
// remain exclusively the by-id paths.)

// Copy-link retired (2026-08-01, Joe: too much going on), and the URL codec
// behind it retired with the rest of the address-bar rack (2026-08-04):
// sharing a rack is Settings → Your data → Export, which is the only path
// that shows the receiver what they are about to take.

// ---------------------------------------------------------------------------
// ± popover (docs/mockups/panel.html): per-group modifier + attributed parts,
// adv/dis, keep/drop, reroll, explode, visibility, dc and comment. Opening it
// parses the source's notation into edit state; every edit re-renders the
// canonical echo and exact preview.
//
// THE TRIGGER PASS (2026-08-03): the popover is a pure EDITOR — it never
// rolls or offers (those verbs live on ROLL ❯❯❯ triggers and the draft row).
// Where an edit lands depends on the source:
//   tray  — LIVE-SYNCS into the draft (the box canonical is the carrier);
//           no commit chrome at all, the draft's own row stands beside it
//   group — a working draft that commits with ONE verb (Save → editPoolById,
//           the by-id write); 'Duplicate…' is the additive twin
//   shelf — inspect/tweak; 'Open in draft' carries the tweak to the one
//           composing surface, 'Duplicate…' keeps it as a pool
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
const popSaveBtn = document.getElementById('pop-save');
const popToDraftBtn = document.getElementById('pop-todraft');
const popVariantBtn = document.getElementById('pop-variant');
const popActions2nd = document.querySelector('#mods-popover .pop-actions-2nd');

// ']' would close the label early and '#' starts a comment — both break the
// canonical round-trip, so they can't live inside a part label (rollspec's
// validateMods rejects them too). Zero-width/bidi-control characters are also
// stripped, matching js/notation.js stripCtl. The cut is the parser's own
// (cutText: trim → slice → surrogate guard → trim), so the popover's text is
// byte-identical to what a re-parse of the canonical yields — including at a
// cap that would otherwise saw an astral character in half and strand a lone
// surrogate that would poison every encoder downstream.
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
    // 2b-⑤: pool labels ride the pop state too (parallel to dice, which the
    // popover never edits) — without this, ± 'Update this pool' silently
    // STRIPPED [labels] out of a saved pool's own notation.
    sources: res.spec.sources ? [...res.spec.sources] : null,
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
// or {source:'tray', row}. The popover only EDITS (Trigger Pass) — commits
// per source are wired below; rolling is always a ROLL ❯❯❯ trigger's job.
function openPopover(binding) {
  let notation, name, groupId = null;
  if (binding.source === 'group') {
    notation = binding.group.notation;
    name = binding.group.name || binding.group.notation;
    groupId = binding.group.id;
  } else if (binding.source === 'shelf') {
    // A shelved roll's ± (the peek): the SAME popover as every other ±,
    // anchored to the peek card — no teleport into the panel. Its tweak
    // travels via 'Open in draft'; 'Duplicate…' keeps it as a pool.
    notation = binding.raw;
    name = binding.name || notation;
  } else {
    notation = trayDraftNotation();
    name = 'Draft'; // the draft popover's standing title (the vocabulary word)
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
  // Commit chrome per source (Trigger Pass): a pool commits with ONE verb
  // (Save, by id) + Duplicate…; a shelved roll offers the two doors out
  // (Open in draft / Duplicate…); the tray draft shows NO buttons — its
  // live-sync IS the commit, and the draft's own row stands right there.
  popSaveBtn.classList.toggle('hidden', pop.source !== 'group');
  popToDraftBtn.classList.toggle('hidden', pop.source !== 'shelf');
  // The row itself always STANDS now: it carries Done, which every source
  // needs (Joe 2026-08-04 — the tray's popover had no button at all, so the
  // header ✕ was its only door). The tray keeps no commit verbs: its
  // live-sync is the commit and Save sits on the rim two inches away.
  popActions2nd.classList.remove('hidden');
  popVariantBtn.classList.toggle('hidden', pop.source === 'tray');
  // One additive verb, two readings: beside a pool's Save it duplicates;
  // on a shelved roll it is 'keep this roll as a pool'.
  popVariantBtn.textContent = pop.source === 'group' ? 'Duplicate…' : 'Save as pool…';
  // A per-die table reads no totals (Soul Deal): the sum-world sections —
  // modifiers, d20 pairing, Target (DC), keep/drop — HIDE instead of just
  // carrying a note (Joe 2026-08-03; supersedes step 2's 'mark as such').
  // The note is the disclosure ('Show anyway'); every open starts folded.
  // Values a pool already carries stay in its canonical either way —
  // notation totality is app-wide, and the room can switch systems later.
  // U17 #28/#29: the fold keys off usesTotal, and Target (DC) is no longer
  // inside it — a target is a stake and must be AUTHORABLE under every
  // system. It round-tripped invisibly before: loaded by popStateFromParse,
  // emitted by popCanonical, printed into #pop-echo, and shown in no row.
  popEl.classList.toggle('pop-perdie', !activeSystem().usesTotal);
  popEl.classList.remove('hidden');
  renderPopIdentity(); // the Sheet Pass strip (group popovers only)
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
  // The echo of our own live-sync (Trigger Pass): the box now carries
  // exactly what this popover already holds. Re-seeding pop from a
  // re-parse here would REPLACE pop.parts and orphan the part-label input
  // closures mid-word — state matches, so there is nothing to do.
  if (notation === popCanonical()) return;
  const res = parseNotation(notation);
  if (!res.ok) return;
  Object.assign(pop, popStateFromParse(res));
  if (pop.dc != null && !pop.expKind) pop.expKind = 'check';
  pop.name = 'Draft';
  popNameEl.textContent = pop.name;
  // Never clobber the input the user is TYPING in: since the Trigger Pass
  // every popover edit round-trips through the box (live-sync → paintCmd →
  // here), and rewriting the focused field would eat a trailing space or
  // an un-normalized keystroke mid-word. The canonical catches up on blur.
  if (document.activeElement !== popDcInput) popDcInput.value = pop.dc == null ? '' : String(pop.dc);
  if (document.activeElement !== popCommentInput) popCommentInput.value = pop.comment || '';
  if (document.activeElement !== popExpSubtitle) popExpSubtitle.value = pop.expSubtitle;
  renderPop();
  placePopover();
}

// ---------------------------------------------------------------------------
// THE SHEET PASS (2026-08-01, designed by panel): the pool popover's
// IDENTITY STRIP. The rack is the character sheet, so a pool's IDENTITY —
// name, shelf, die rank — edits here, instantly, by id (advancement is
// play); the hairline under the strip is the commit-model line, and
// everything below it stays the unchanged roll-tweak draft. Group popovers
// only; every write funnels editPoolById (the one writer).
// ---------------------------------------------------------------------------
const popIdentityEl = document.getElementById('pop-identity');
const RANK_LADDER = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

function stripGroup() {
  return pop && pop.source === 'group'
    ? groups.find((x) => x.id === pop.groupId) || null : null;
}

// After a strip write: re-read the record, reseed the popover's draft state
// (so echo/preview/Update stay truthful — a follow-up Update is a no-op),
// pulse the tile on its shelf (the sheet itself is the feedback; never
// gold), and re-clamp the popover.
function stripCommit(patch) {
  const g = stripGroup();
  if (!g) return;
  const updated = editPoolById(g.id, patch);
  if (!updated) return;
  pop.name = updated.name || updated.notation;
  popNameEl.textContent = pop.name;
  if (patch.notation !== undefined) {
    // A rank tap changes THE DICE and nothing else: the roll-tweak draft
    // below the hairline (a dc mid-typed, a comment, adv) is the user's
    // uncommitted work — reseeding pop wholesale silently wiped it (the
    // review fleet caught it). The ladder only exists for pure NdX pools,
    // so swapping pop.dice is the whole truthful delta.
    const res = parseNotation(updated.notation);
    if (res.ok) {
      pop.dice = [...res.spec.dice];
      renderPop();
    }
  }
  const tile = groupsListEl.querySelector(`[data-group-id="${CSS.escape(String(g.id))}"] .tile-stage`);
  if (tile) {
    tile.classList.add('tile-pulse');
    setTimeout(() => tile.classList.remove('tile-pulse'), 350);
  }
  renderPopIdentity();
  placePopover();
}

function renderPopIdentity() {
  const g = stripGroup();
  popIdentityEl.classList.toggle('hidden', !g);
  popIdentityEl.textContent = '';
  if (!g) return;

  // ONE TITLE, AT THE TOP (Joe 2026-08-06): the head's name IS the pool's
  // name — the strip's old hero row is gone, and the head carries the
  // rename affordance with the same save-morph grammar (Enter commits,
  // Esc reverts, blur commits a CHANGED name).
  popNameEl.textContent = '';
  const nameBtn = document.createElement('button');
  nameBtn.className = 'pid-name' + (g.name ? '' : ' as-notation');
  nameBtn.textContent = g.name || g.notation;
  nameBtn.title = 'Rename';
  nameBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'pid-name-input';
    input.type = 'text';
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.placeholder = 'Name this pool…';
    input.value = g.name || '';
    let done = false;
    const commit = () => { if (done) return; done = true; stripCommit({ name: input.value }); };
    const revert = () => { if (done) return; done = true; renderPopIdentity(); };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') revert();
    });
    input.addEventListener('blur', () => {
      // deferred one tick: the pointerdown that blurred us may be a chip or
      // ladder tap — rebuilding the strip synchronously would detach its
      // target before the click dispatches (fleet catch). Both writes land.
      setTimeout(() => { (input.value !== (g.name || '') ? commit : revert)(); }, 0);
    });
    popNameEl.replaceChild(input, nameBtn);
    input.focus();
    input.select();
  });
  popNameEl.appendChild(nameBtn);

  // The strip speaks the panel's own .sec grammar (the spacing pass, Joe
  // 2026-08-06): shelf · Set · Saved pool, same padding and hairlines as
  // every section below.
  const sec = (label) => {
    const el = document.createElement('div');
    el.className = 'sec tight pid-sec';
    if (label) {
      const l = document.createElement('span');
      l.className = 'plabel';
      l.textContent = label;
      el.appendChild(l);
    }
    popIdentityEl.appendChild(el);
    return el;
  };

  // SHELF chips (owner-chip dress): tap moves the pool; tapping the
  // pressed chip demotes to the plain Pools shelf (P4); trailing ＋ mints a
  // new shelf name.
  const cats = document.createElement('div');
  cats.className = 'pid-row pid-cats';
  const cur = (g.category || '').trim().toLowerCase();
  const known = [...new Map([['attributes', 'Attributes'], ['skills', 'Skills'], ['motivations', 'Motivations'],
    ...groups.map((x) => (x.category || '').trim()).filter(Boolean).map((c) => [c.toLowerCase(), c]),
  ]).values()];
  for (const c of known) {
    const b = document.createElement('button');
    b.className = 'pid-cat';
    const pressed = c.toLowerCase() === cur;
    b.setAttribute('aria-pressed', String(pressed));
    const nm = document.createElement('span');
    nm.className = 'oc-name';
    nm.textContent = c;
    b.appendChild(nm);
    b.title = pressed ? 'Back to the plain Pools shelf' : `Move to ${c}`;
    b.addEventListener('click', () => stripCommit({ category: pressed ? '' : c }));
    cats.appendChild(b);
  }
  const plus = document.createElement('button');
  plus.className = 'pid-cat pid-cat-new';
  plus.textContent = '＋';
  plus.title = 'New shelf…';
  plus.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'pid-cat-input';
    input.type = 'text';
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.placeholder = 'New shelf…';
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      if (input.value.trim()) stripCommit({ category: input.value });
      else renderPopIdentity();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') { done = true; renderPopIdentity(); }
    });
    input.addEventListener('blur', () => setTimeout(commit, 0));
    cats.replaceChild(input, plus);
    input.focus();
  });
  cats.appendChild(plus);
  sec(null).appendChild(cats);

  // Row 3 — DICE SET (§9 override): this pool rolls as itself. The same
  // compact select the settings row uses; the default choice follows your
  // own set, and 'Standard' PINS the classics even when you wear a house
  // set (the wire keeps its present-or-absent rule — std resolves to
  // absent at roll time).
  const setRow = document.createElement('div');
  setRow.className = 'pid-row pid-set';
  setRow.appendChild(buildSetSelect({
    value: g.set || null,
    allowDefault: true,
    onPick: (v) => stripCommit({ set: v || '' }),
    title: 'Dice set for this pool — its rolls wear these dice',
  }));
  sec('Set').appendChild(setRow);

  // Row 4 — THE DICE, composing like the creation card (Trigger Pass; Joe:
  // 'the same behavior as + pool for dice'). A PURE dice pool — nothing but
  // ladder dice in its canonical (no mods/dc/flags/sources; the parse runs
  // on the CANONICAL, so a dc12 can never be dropped by a tap) — renders
  // its dice as removable grouped UNITS over the six rank faces as ADDERS.
  // Every tap commits through stripCommit, which swaps pop.dice ONLY: a
  // mid-typed dc below the hairline survives, the same contract the old
  // one-tap rank swap kept. (The swap itself retires — swap = remove +
  // add, one idiom for building dice everywhere.) Anything else keeps its
  // canonical echo plus the two quiet doors to the full grammar.
  const dieRow = document.createElement('div');
  dieRow.className = 'pid-row pid-die';
  const poolRes = parseNotation(g.notation);
  const pure = poolRes.ok && !poolRes.spec.mods && poolRes.dc == null
    && !poolRes.comment && !poolRes.exp && !poolRes.faceDown
    && !visOfParse(poolRes) && !poolRes.spec.sources
    && poolRes.spec.dice.length > 0
    && poolRes.spec.dice.every((t) => RANK_LADDER.includes(t));
  if (pure) {
    const dice = poolRes.spec.dice;
    const commitDice = (next) => {
      const counts = new Map();
      for (const t of next) counts.set(t, (counts.get(t) || 0) + 1);
      const notation = RANK_LADDER.filter((t) => counts.has(t))
        .map((t) => `${counts.get(t)}${t}`).join('+'); // die order = the canonical spelling
      stripCommit({ notation });
    };
    const counts = new Map();
    for (const t of dice) counts.set(t, (counts.get(t) || 0) + 1);
    const units = document.createElement('div');
    units.className = 'pid-pool';
    for (const type of RANK_LADDER) {
      if (!counts.has(type)) continue;
      const n = counts.get(type);
      const u = document.createElement('button');
      u.className = 'cc-unit';
      const last = dice.length === 1;
      u.disabled = last;
      u.title = last ? 'a pool needs at least one die' : `Remove one ${type}`;
      u.appendChild(buildDieStrip([type], 1, { set: g.set || null }));
      if (n > 1) {
        const x = document.createElement('span');
        x.className = 'pid-count';
        x.textContent = `×${n}`;
        u.appendChild(x);
      }
      u.addEventListener('click', () => {
        const next = [...dice];
        const i = next.indexOf(type);
        if (i >= 0) next.splice(i, 1);
        if (next.length) commitDice(next);
      });
      units.appendChild(u);
    }
    dieRow.appendChild(units);
    const poolSec = sec('Saved pool');
    poolSec.appendChild(dieRow);
    const ladderRow = document.createElement('div');
    ladderRow.className = 'pid-row pid-die';
    const full = dice.length >= MAX_DICE_ON_TABLE;
    for (const type of RANK_LADDER) {
      const b = document.createElement('button');
      b.className = 'pid-rank';
      b.dataset.die = type;
      b.disabled = full;
      b.title = full ? `a pool caps at ${MAX_DICE_ON_TABLE} dice` : `Add a ${type}`;
      b.appendChild(buildDieStrip([type], 1));
      b.addEventListener('click', () => commitDice([...dice, type]));
      ladderRow.appendChild(b);
    }
    poolSec.appendChild(ladderRow);
    // U13: `Edit notation…` STANDS on the pure branch too. It lived only in
    // the else-branch below, so a pool made of plain dice — which is most of
    // a dealt rack — had no door to its own notation at all: the ghost verb
    // existed in a branch that pool could never reach, and beginEditGroup's
    // one call site was inside it. The rank ladder edits DICE; this edits the
    // intent around them, and they are different jobs.
    const pureEdit = document.createElement('button');
    pureEdit.className = 'pid-ghost-verb';
    pureEdit.textContent = 'Edit notation…';
    pureEdit.title = 'Add a target, a moment, or keep/drop';
    pureEdit.addEventListener('click', () => beginEditGroup(g.id)); // closes this popover itself
    poolSec.appendChild(pureEdit);
    return;
  }
  {
    const echo = document.createElement('code');
    echo.className = 'pid-echo';
    echo.textContent = g.notation;
    dieRow.appendChild(echo);
    const editBtn = document.createElement('button');
    editBtn.className = 'pid-ghost-verb';
    editBtn.textContent = 'Edit notation…';
    editBtn.addEventListener('click', () => beginEditGroup(g.id)); // closes this popover itself
    const draftBtn = document.createElement('button');
    draftBtn.className = 'pid-ghost-verb';
    draftBtn.textContent = 'Open in draft';
    draftBtn.title = 'Load into the command box for heavy recomposition';
    draftBtn.addEventListener('click', () => {
      loadIntoBox(g.notation, g.name);
      closePopover();
    });
    dieRow.append(editBtn, draftBtn);
  }
  sec('Saved pool').appendChild(dieRow);
}

function closePopover() {
  if (!pop) return;
  if (pop.row) pop.row.classList.remove('open');
  pop = null;
  popEl.classList.add('hidden');
  closePopSaveMorph(); // a reopened popover always starts on the buttons
  closeSetMenu(); // an identity-strip set menu must not outlive its anchor
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
  const spec = { dice: [...pop.dice], mods: Object.keys(mods).length ? mods : null };
  if (pop.sources) spec.sources = [...pop.sources]; // 2b-⑤ attribution survives ±
  return spec;
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

// (popVis retired with the popover's Roll/Offer — visibility now travels
// exclusively inside the canonical string the editor emits.)

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

// A SEG IS A CHOICE, NOT A ROW OF SWITCHES (U22, audit D5). Every seg here
// is mutually exclusive — Visibility, Moment, d20 pairing, keep/drop — and
// every one announced as independent unlabelled toggles: `aria-pressed` says
// "this button is on", which invites turning several on and says nothing
// about the four being one decision. On Visibility that is the control whose
// mistake cannot be undone, described to the one user who cannot see the
// selected cell's dress.
//
// radiogroup/radio + aria-checked is the honest shape, and it also buys the
// arrow-key behaviour a radiogroup is expected to have (below). The group's
// label comes from the section head already sitting above it — named here
// rather than duplicated, so the two cannot drift.
function segSet(seg, value) {
  if (!seg.hasAttribute('role')) {
    seg.setAttribute('role', 'radiogroup');
    if (!seg.getAttribute('aria-label')) {
      const head = seg.previousElementSibling;
      const word = head && head.classList.contains('plabel') ? head.textContent.trim() : null;
      if (word) seg.setAttribute('aria-label', word);
    }
  }
  seg.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.v === value;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(on));
    b.removeAttribute('aria-pressed');
    // Roving tabindex: a radiogroup is ONE tab stop, and Tab through five
    // cells to reach a sixth control is what makes the popover 26 stops deep.
    b.tabIndex = on ? 0 : -1;
  });
}

// …and the arrows a radiogroup owes. Without them a roving tabindex is a
// trap: one cell reachable, the rest unreachable by keyboard entirely.
document.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const cell = e.target.closest && e.target.closest('[role="radio"]');
  const group = cell && cell.closest('[role="radiogroup"]');
  if (!group) return;
  const cells = [...group.querySelectorAll('[role="radio"]:not([disabled])')];
  const i = cells.indexOf(cell);
  if (i < 0) return;
  e.preventDefault();
  const step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
  const next = cells[(i + step + cells.length) % cells.length];
  next.focus();
  next.click(); // a radiogroup selects on arrow, which is what makes it one stop
});

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

// THE SPECTRUM BARS (ROADMAP §2l ④): one bar per die — that die's whole
// probability mass in its chart column's own row order, tier-colored,
// quiet included as a real segment. Identical (source, rank, transform)
// dice share a bar. The text layer IS the content — the full 'word %'
// sentence per bar, selectable and read by AT — and the geometry is
// aria-hidden (the shipped audit rule). A wholly quiet die (d10x) renders
// the single italic word, never a 100%-wide dim bar (§3.4: dash AND word
// would mark one silence twice).
let forecastPerDie = false; // session-local view state (Joe 2026-08-06)

function buildForecast(fcast, visSuffix) {
  const frag = document.createDocumentFragment();
  // Collapsed by default: one count-weighted mixture line — 'a die from
  // this pool, on average' — with the true per-die rows one tap away.
  // The no-aggregation law still governs RESULTS and printed counts;
  // this is a display default over the same per-die math.
  const many = fcast.bars.length > 1;
  const rows = many && !forecastPerDie ? [fcast.collapsed] : fcast.bars;
  for (const bar of rows) {
    const row = document.createElement('div');
    row.className = 'fc-row';
    const label = document.createElement('span');
    label.className = 'fc-label';
    label.textContent = bar.mixed
      ? `${bar.count} dice · per-die average`
      : (bar.source ? `${bar.source} · ` : '')
        + (bar.count > 1 ? `${bar.count}×` : '') + bar.type
        + (bar.variant === 'plain' ? ' (unpaired)' : '');
    row.appendChild(label);
    if (bar.allQuiet) {
      const q = document.createElement('span');
      q.className = 'fc-allquiet';
      q.textContent = 'quiet';
      row.appendChild(q);
    } else {
      const text = document.createElement('span');
      text.className = 'fc-text';
      text.textContent = bar.segments
        .map((s) => `${s.word || 'quiet'} ${Math.round(s.p * 100)}%`).join(' · ');
      const geo = document.createElement('span');
      geo.className = 'fc-geo';
      geo.setAttribute('aria-hidden', 'true');
      // THE READOUT (Joe 2026-08-06, superseding the print-style tick
      // lane): a fixed strip below the bar — dedicated room, so nothing
      // jumps — names the hovered segment in full, a caret tracking its
      // true midpoint. Widths stay honest (2px minimum stroke, 1px mosaic
      // rules — CSS); the strip is where slivers get their name.
      const read = document.createElement('span');
      read.className = 'fc-read';
      read.setAttribute('aria-hidden', 'true'); // the text layer speaks full words
      const caret = document.createElement('i');
      caret.className = 'fc-caret';
      const readText = document.createElement('span');
      readText.className = 'fc-read-text';
      read.append(caret, readText);
      let at = 0;
      for (const s of bar.segments) {
        const seg = document.createElement('i');
        seg.className = 'fc-seg ' + (s.word ? `fc-w-${OUTCOME_SLUGS[s.word]}` : 'fc-quiet');
        seg.style.width = `${s.p * 100}%`;
        const mid = at + s.p / 2;
        seg.addEventListener('mouseenter', () => {
          readText.textContent = `${s.word || 'quiet'} · ${Math.round(s.p * 100) || '<1'}%`;
          read.style.setProperty('--fc-x', `${mid * 100}%`);
          read.classList.add('on');
        });
        geo.appendChild(seg);
        at += s.p;
      }
      geo.addEventListener('mouseleave', () => {
        read.classList.remove('on');
        readText.textContent = '';
      });
      row.append(text, geo, read);
    }
    frag.appendChild(row);
  }
  if (many) {
    const tog = document.createElement('button');
    tog.className = 'pid-ghost-verb fc-toggle';
    tog.textContent = forecastPerDie ? 'one line' : 'per die';
    tog.title = forecastPerDie
      ? 'Average the pool into one line' : 'Show each rank on its own line';
    tog.addEventListener('click', () => { forecastPerDie = !forecastPerDie; renderPopEcho(); });
    frag.appendChild(tog);
  }
  if (visSuffix) {
    const vis = document.createElement('span');
    vis.className = 'fc-vis';
    vis.textContent = visSuffix.replace(/^ · /, '');
    frag.appendChild(vis);
  }
  return frag;
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
  // Per-die systems forecast per die (§2l ④, every ± door alike); sum
  // systems keep the exact min/avg/max line until the sum read (§2l ⑥).
  // The slot never blanks — §1.3 makes this line the validator.
  const fcast = !err && !visBlocked && activeSystem().forecastFor
    ? activeSystem().forecastFor(spec, { countingPmfs }) : null;
  popPreviewEl.classList.toggle('fc', !!(fcast && fcast.kind === 'per-die'));
  // 'Pool stats' heads every stats state (bars, refusal, sum line) so the
  // section reads like its siblings (Joe 2026-08-06); validation states
  // (bad spec, audience-less whisper) are not stats and stay bare.
  const statsLabel = () => {
    const wrap = document.createElement('span');
    wrap.className = 'pop-stats-row';
    const l = document.createElement('span');
    l.className = 'plabel pop-stats-label';
    l.textContent = 'Pool stats';
    const q = document.createElement('button');
    q.className = 'help-bubble';
    q.textContent = '?';
    q.title = 'How these numbers combine';
    q.setAttribute('aria-label', 'Help: pool stats');
    q.addEventListener('click', () => openHelpDialog('pool-stats'));
    wrap.append(l, q);
    return wrap;
  };
  if (err) {
    popPreviewEl.textContent = `invalid spec: ${err}`;
  } else if (visBlocked) {
    popPreviewEl.textContent = 'whisper needs an audience — pick at least one player';
  } else if (fcast && fcast.kind === 'per-die') {
    popPreviewEl.textContent = '';
    popPreviewEl.append(statsLabel(), buildForecast(fcast, visSuffix));
  } else if (fcast && fcast.kind === 'refusal') {
    popPreviewEl.textContent = '';
    popPreviewEl.append(statsLabel(), document.createTextNode(fcast.reason + visSuffix));
  } else {
    popPreviewEl.textContent = '';
    popPreviewEl.append(statsLabel(),
      document.createTextNode(fmtPreview(spec.dice, spec.mods).replace(/ (avg|max)/g, ' · $1') + visSuffix));
  }
  popSaveBtn.disabled = !!err || visBlocked;
  popToDraftBtn.disabled = !!err || visBlocked;
  popVariantBtn.disabled = !!err || visBlocked;
  // THE TRIGGER PASS: a tray-bound popover is a live EDITOR of the draft —
  // every edit lands in the command box as the canonical (the box is the
  // draft's one carrier; ROLL ❯❯❯ rolls it). Parse-to-parse compare so
  // opening ± never rewrites a hand-typed spelling of the same roll, and
  // the paintCmd → resyncTrayPopover echo terminates (see its guard). An
  // audience-less whisper stays popover-local (unsendable by design): the
  // preview line explains, and the draft keeps its last good state.
  if (pop.source === 'tray' && !err && !visBlocked) {
    const cur = cmdResult && cmdResult.ok ? cmdResult.canonical : null;
    if (cur !== canonical) {
      cmdInput.value = canonical;
      paintCmd();
    }
  }
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
  // subtitle and comment/mat text exist only inside a moment (Joe
  // 2026-08-06); a stored comment still rides the canonical while hidden
  document.getElementById('pop-exp-sub-field').classList.toggle('hidden', !pop.expKind);
  document.getElementById('pop-comment-field').classList.toggle('hidden', !pop.expKind);
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
  // shelf source: the roll's own label rides the echo ('keep this roll as
  // a pool' keeps its name); the tray reads its save-morph input as before.
  const name = group ? group.name
    : pop.source === 'shelf' ? (parseNotation(pop.name).ok ? '' : pop.name)
    : '';
  const canonical = popCanonical();
  closePopover();
  if (!panelsOpen.pools) setPanel('pools', true); // echoing edits the box — surface it
  loadIntoBox(canonical, name);
});

// The per-die disclosure: unfold/refold the sum-world sections for THIS
// popover-open (openPopover refolds — a fold is a reading default, not a
// setting). The popover re-clamps: four sections change its height.

document.getElementById('pop-close').addEventListener('click', closePopover);
document.getElementById('pop-done').addEventListener('click', () => closePopover());
// CLICK AWAY closes the ± editor (Joe 2026-08-04). Every edit is already
// live in its target, so leaving IS committing — the only reason this was
// ever missing. Excluded: the popover itself, its floating set menu (a
// body-level child, not a DOM descendant), and the ANCHOR that toggles it
// — without that last one a ± click would close here on pointerdown and
// re-open on click, making the toggle button unable to ever close it.
// (The peek is excluded for a shelf-bound popover: the card is the thing
// the editor is anchored to, not an elsewhere.)
document.addEventListener('pointerdown', (e) => {
  if (!pop) return;
  const t = e.target;
  if (!(t instanceof Node)) return;
  if (t instanceof HTMLElement) {
    if (t.closest('#mods-popover') || t.closest('.set-menu')) return;
    if (t.closest('#tray-mods')) return;
    if (pop.source === 'shelf' && t.closest('#peek-card')) return;
  }
  closePopover();
});
// Esc closes the popover only when it is the topmost layer — handled by the
// central Esc layering in the keyboard-shortcuts section below.
window.addEventListener('resize', placePopover);

// 'Save' — the ONE commit verb of a pool-bound popover (Trigger Pass):
// the edited canonical writes back to the SAME record by id (editPoolById,
// the row editor's path). The name stays; 'Duplicate…' is the additive twin.
popSaveBtn.addEventListener('click', () => {
  if (!pop || pop.source !== 'group') return;
  const spec = popSpec();
  if (validateMods(spec.dice, spec.mods)) return;
  const canonical = popCanonical();
  const id = pop.groupId;
  closePopover();
  editPoolById(id, { notation: canonical });
});

// 'Open in draft' (shelf source): a shelved roll's tweak travels to the ONE
// composing surface — same landing as the echo click — and rolls from the
// draft's ROLL ❯❯❯ like everything else. (The popover-roll that used to
// REPLACE the shelved roll retired with the Trigger Pass; the peek's bare
// reroll strip still replaces, unchanged.)
popToDraftBtn.addEventListener('click', () => {
  if (!pop) return;
  const name = parseNotation(pop.name).ok ? '' : pop.name; // notation labels itself
  const canonical = popCanonical();
  closePopover();
  if (!panelsOpen.pools) setPanel('pools', true); // the draft edits the box — surface it
  loadIntoBox(canonical, name);
});

// 'Duplicate…' / 'Save as pool…' — the SAME quick inline-name morph as the
// New pool panel's (one save flow everywhere, user call 2026-07), and
// additive like it: a new pool is minted, never an overwrite (Save is the
// by-id write). A pool-bound popover prefills a suggested name (base +
// mods summary); Enter accepts, Esc backs out to the buttons.
const popSaveRow = document.getElementById('pop-save-row');
const popSaveName = document.getElementById('pop-save-name');
function closePopSaveMorph() {
  popSaveRow.classList.add('hidden');
  // restore the buttons the morph swapped out — except for a tray-bound
  // popover, whose actions row stays hidden by design (pure editor).
  popActions2nd.classList.toggle('hidden', !!pop && pop.source === 'tray');
}
popVariantBtn.addEventListener('click', () => {
  if (!pop) return;
  const spec = popSpec();
  if (validateMods(spec.dice, spec.mods)) return;
  if (pop.source === 'group') {
    const base = groups.find((g) => g.id === pop.groupId);
    const summary = modsSummary(spec.mods) || (pop.dc ? `dc${pop.dc}` : 'variant');
    popSaveName.value = cutText(`${(base && base.name) || pop.name} ${summary}`, 24);
  } else if (pop.source === 'shelf') {
    // 'keep this roll as a pool': suggest the roll's label unless it is
    // bookkeeping (raw notation labels itself)
    popSaveName.value = parseNotation(pop.name).ok ? '' : cutText(pop.name, 24);
  } else {
    popSaveName.value = '';
  }
  popActions2nd.classList.add('hidden');
  popSaveRow.classList.remove('hidden');
  popSaveName.focus();
  popSaveName.select();
});
function popSaveConfirm() {
  if (!pop) return;
  const spec = popSpec();
  if (validateMods(spec.dice, spec.mods)) return;
  const canonical = popCanonical();
  const name = cutText(popSaveName.value, 24); // '' = unnamed pool
  const vbase = groups.find((x) => x.id === pop.groupId); // before closePopover nulls pop
  closePopSaveMorph();
  closePopover();
  // one save flow: a variant lands on ITS pool's shelf (the compose morph's
  // chips do the same job; dropping the category was drift — fleet catch)
  groups.push({ id: Date.now(), name, notation: canonical,
    ...(vbase && vbase.category ? { category: vbase.category } : {}),
    ...(vbase && vbase.set ? { set: vbase.set } : {}) }); // additive, always — a variant keeps its pool's skin
  saveGroups();
  renderGroups();
}
document.getElementById('pop-save-confirm').addEventListener('click', popSaveConfirm);
document.getElementById('pop-save-cancel').addEventListener('click', closePopSaveMorph);
popSaveName.addEventListener('keydown', (e) => {
  e.stopPropagation(); // typing a name must not fire table shortcuts / Esc chain
  if (e.key === 'Enter') popSaveConfirm();
  else if (e.key === 'Escape') closePopSaveMorph();
});

// ---------------------------------------------------------------------------
// Roll log
// ---------------------------------------------------------------------------

let log = load(LS_LOG, []);
const logList = document.getElementById('log-list');
const logEmpty = document.getElementById('log-empty');
// How many entries the LOG_CAP has eaten this session (U14).
let logDroppedTotal = 0;
function updateLogDroppedNote() {
  const el = document.getElementById('log-dropped');
  if (!el) return;
  const n = logDroppedTotal;
  el.textContent = n ? `${n} earlier roll${n === 1 ? '' : 's'} rolled off the end of the log` : '';
  el.classList.toggle('hidden', !n);
}

function fmtTime(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// For the few user-supplied strings that go through innerHTML (part labels).
function escapeHtml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Build the row DOM for a single log entry. Extracted from renderLog() so
// addLogEntry can append incrementally (Tier 0 §0e endurance — the full
// list rebuild was O(N) per arrival and dominated a saturated table). Both
// paths call THIS builder — a single source of truth keeps the incremental
// row identical to the full-render row on any future markup edit.
function buildLogEntryEl(entry, { supersededIds, byId }) {
    const hidden = entryHidden(entry);
    const el = document.createElement('div');
    el.className = 'log-entry';
    // The delegated ⟳ handler on #log-list resolves the entry by rollId,
    // so the row stamps its identity here (never a closure).
    el.dataset.rollId = entry.rollId || '';
    // The log leads with the DICE (GOALS 1: prefer showing real dice) — the
    // only roll surface that was still pure text. Tiny grouped tokens, xN
    // per P5; die TYPES are public even on hidden rolls (goal 11), so a
    // shrouded entry keeps its tokens. No-GL environments keep text only.
    let tokensHtml = '';
    {
      // Chips wear each DIE's own set (§9 mixed pools) — the log is a
      // record of whose dice landed, not what I'd throw next — grouped by
      // (skin, type): anvil ×2 then seaglass ×1, never one homogenized
      // strip. A hidden entry wears the obsidian shroud, same precedence
      // as the felt: die TYPES are public (goal 11), identity is not.
      const counts = new Map(); // 'variant|type' -> count (ids never carry '|')
      entry.parts.forEach((p, i) => {
        const v = hidden ? 'shroud' : (entryDieSet(entry, i) || 'std');
        const k = `${v}|${p.type}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      });
      const bits = [];
      for (const [k, cnt] of counts) {
        const [chipVariant, t] = k.split('|');
        const u = dieArtURL(t, chipVariant);
        if (!u) { bits.length = 0; break; }
        bits.push(`<img class="die-art log-die" src="${u}" alt="" draggable="false">`
          + (cnt > 1 ? `<span class="log-die-count">×${cnt}</span>` : ''));
      }
      if (bits.length) tokensHtml = `<span class="log-dice">${bits.join('')}</span>`;
    }
    // U17 step 3: the flat modifier is ARITHMETIC and renders where the sum
    // does. This was ungated — the exact inversion of the intent card, which
    // showed the target and not the `+5` while the log showed the `+5` and
    // not the target. `.log-mod` is gold at weight 700, louder than the die
    // beside it, feeding a total column the lens has emptied: a dangling
    // bonus is the one surface that genuinely implies a sum.
    const modParts = activeSystem().usesTotal ? modPartsOf(entry) : null;
    let modHtml = '';
    if (modParts) {
      // §7.2 attributed modifiers: "+2 Proficiency +1 Guidance"
      modHtml = modParts
        .map((p) => ` <span class="log-mod">${p.value >= 0 ? '+' : '−'}${Math.abs(p.value)}${p.label ? ` <span class="log-part-label">${escapeHtml(p.label)}</span>` : ''}</span>`)
        .join('');
    } else if (entry.modifier && activeSystem().usesTotal) {
      modHtml = ` <span class="log-mod">${entry.modifier > 0 ? '+' : '−'}${Math.abs(entry.modifier)}</span>`;
    }
    const detail = hidden
      ? `<span class="log-hidden">${entry.visMode === 'whisper' ? 'whispered' : 'face down'}</span>`
      : (() => {
          const partHtml = (p) => {
            let cls = p.isMax && p.counts ? 'crit-max' : p.isMin && p.counts ? 'crit-min' : '';
            if (!p.counts) cls += ' log-discarded';
            const star = p.child ? '✴' : '';
            return `<span class="${cls.trim()}">${star}${p.type}&thinsp;${p.label}</span>`;
          };
          if (!entrySources(entry)) return entry.parts.map(partHtml).join(' + ') + modHtml;
          // source-grouped, same shape as the banner breakdown (2b-⑤)
          const order = [];
          const byKey = new Map();
          entry.parts.forEach((p, i) => {
            const k = partSource(entry, i) || '';
            if (!byKey.has(k)) { byKey.set(k, []); order.push(k); }
            byKey.get(k).push(p);
          });
          return order.map((k) => (k ? `<span class="log-part-label">${escapeHtml(k)}</span> ` : '')
            + byKey.get(k).map(partHtml).join(' + ')).join('  \u00b7  ') + modHtml;
        })();
    // interim dc verdict (fixed decision): "vs N ✓/✗". Stakes stay public on
    // a hidden roll (goal 11): the target shows, the ✓/✗ waits for the reveal.
    // U17: the stake is public on every rung AND under every system; the
    // ✓/✗ is the adjudication and needs a total to compare against.
    const dcAdjudicated = !hidden && activeSystem().usesTotal;
    const verdictHtml = !Number.isInteger(entry.dc)
      ? ''
      : !dcAdjudicated
        ? `<span class="log-verdict">vs <span class="stake-num">${entry.dc}</span></span>`
        : `<span class="log-verdict ${entry.total >= entry.dc ? 'ok' : 'bad'}">vs ${entry.dc} ${entry.total >= entry.dc ? '✓' : '✗'}</span>`;
    const outcomes = entryOutcomes(entry); // per-die lens (Soul Deal)
    const meaningHtml = outcomes ? '<span class="log-meaning"></span>' : '';
    el.innerHTML = `
      <div class="log-head">
        <span class="log-group"></span>
        <span class="log-actions"></span>
        <span class="log-total">${!activeSystem().usesTotal ? '' : hidden ? '?' : entry.total}</span>
      </div>
      <div class="log-detail">${tokensHtml}${detail}${verdictHtml ? '  ·  ' + verdictHtml : ''}${meaningHtml ? '  ·  ' + meaningHtml : ''}</div>
      <div class="log-time">${fmtTime(entry.t)}</div>`;
    if (meaningHtml) renderTally(el.querySelector('.log-meaning'), entry);
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
    // Provenance qualifiers (B3): at most ONE per row, both words static
    // text. 'reroll' = this row replays a parent (server-substantiated;
    // the chip stands even when the parent aged past the cap — THAT it is
    // a reroll is substantiated regardless); 'rerolled' = a later row
    // replays this one. The tooltip's second, client-side hidden gate is
    // required: non-secret ≠ readable — a held/whispered parent must not
    // surrender its total to a tooltip.
    if (entry.rerollOfId) {
      const q = document.createElement('span');
      q.className = 'log-reroll';
      q.textContent = 'reroll';
      const parent = byId.get(entry.rerollOfId);
      q.title = parent && !entryHidden(parent)
        ? `Reroll of ${parent.label}${activeSystem().usesTotal && typeof parent.total === 'number' ? ` (${parent.total})` : ''}`
        : 'Reroll of an earlier roll';
      groupEl.appendChild(q);
      el.classList.add('is-reroll');
    } else if (supersededIds.has(entry.rollId)) {
      const q = document.createElement('span');
      q.className = 'log-rerolled';
      q.textContent = 'rerolled';
      groupEl.appendChild(q);
    }
    // The ⟳ button is markup-only: the delegated handler on #log-list
    // resolves the entry via el.dataset.rollId. A rollId-less entry would
    // make the button inert — an invisible dead button is worse than the
    // pre-delegation behavior, so skip it and rely on the caller's fallback
    // (addLogEntry drops to a full renderLog() when rollId is missing).
    if (canReroll(entry) && entry.rollId) {
      const again = document.createElement('button');
      again.className = 'log-again';
      again.textContent = '⟳';
      again.title = 'Reroll this';
      el.querySelector('.log-actions').appendChild(again);
    }
    return el;
}

function renderLog() {
  logList.innerHTML = '';
  logEmpty.style.display = log.length ? 'none' : 'block';
  // One pass builds both indexes we need per row: the id→entry map (parent
  // tooltip lookup, was an O(N) log.find per row) and the superseded set —
  // derived from what THIS client holds, so it can never name a roll the
  // viewer does not have (a secret reroll projects to null for others, so
  // their logs never contain the reference; the birth gate keeps a secret
  // PARENT unnamed entirely).
  const byId = new Map();
  const supersededIds = new Set();
  for (const e of log) {
    if (e.rollId) byId.set(e.rollId, e);
    if (e.rerollOfId) supersededIds.add(e.rerollOfId);
  }
  // Reverse index loop — the log renders newest-first without the [...log]
  // copy that used to allocate a whole array per render.
  for (let i = log.length - 1; i >= 0; i--) {
    logList.appendChild(buildLogEntryEl(log[i], { supersededIds, byId }));
  }
}
renderLog();

// One delegated ⟳ listener on #log-list — the per-entry closure that used
// to bind on every renderLog() rebuild was the dominant cost on a saturated
// table (Tier 0 §0e). Resolve the entry via row.dataset.rollId.
logList.addEventListener('click', (ev) => {
  const btn = ev.target instanceof HTMLElement ? ev.target.closest('.log-again') : null;
  if (!btn) return;
  const row = btn.closest('.log-entry');
  const rid = row && row.dataset.rollId;
  const entry = rid ? log.find((e) => e.rollId === rid) : null;
  if (entry && canReroll(entry)) {
    requestRoll([...entry.spec.dice], entry.label, rerollOpts(entry));
  }
});

// Mark the PARENT of a fresh reroll as superseded without a full rebuild.
// Idempotent: guarded by the existing chip so a double-reroll on the same
// parent does not stack duplicates. Only the `.log-rerolled` chip is added
// — `.is-reroll` at buildLogEntryEl is set when the row ITSELF is a reroll,
// which markSuperseded's target is not; touching it here would drift the
// CSS class state away from what full renderLog() produces.
function markSuperseded(parentRollId) {
  if (!parentRollId) return;
  const row = logList.querySelector(`.log-entry[data-roll-id="${CSS.escape(parentRollId)}"]`);
  if (!row) return;
  // Full renderLog uses an if/else-if: a row that is ITSELF a reroll
  // (`.is-reroll`) only wears the 'reroll' chip, never 'rerolled' — even
  // in a reroll-of-a-reroll chain. Mirror that here so append+prune stays
  // byte-identical with the full rebuild.
  if (row.classList.contains('is-reroll')) return;
  const groupEl = row.querySelector('.log-group');
  if (!groupEl || groupEl.querySelector('.log-rerolled')) return;
  const q = document.createElement('span');
  q.className = 'log-rerolled';
  q.textContent = 'rerolled';
  groupEl.appendChild(q);
}

function addLogEntry(entry) {
  // Dedupe by rollId: a reconnect 'hello' can rebuild the log with a roll
  // whose playback is still running; its completion must not append the
  // same roll twice. (Solo entries carry a synthetic 'solo-<ts>-<rand>'
  // rollId from rollDice, so this gate applies to every arrival path.)
  if (entry.rollId && log.some((e) => e.rollId === entry.rollId)) return;
  log.push(entry);
  const dropped = log.length > LOG_CAP ? log.length - LOG_CAP : 0;
  if (dropped) {
    log = log.slice(-LOG_CAP);
    // …and SAY so. This number was computed and discarded, so a long session
    // silently lost its early history and the log looked complete. It is the
    // history's own surface, so the note goes there rather than to the pill.
    logDroppedTotal += dropped;
    updateLogDroppedNote();
  }
  if (!netOnline) save(LS_LOG, log); // online mode: the server owns the log
  logEmpty.style.display = 'none';
  // Defensive fallback: a rollId-less entry would make the delegated ⟳
  // handler inert (dataset lookup returns null). Should not happen — every
  // production path assigns one — but if it does, redraw the whole list so
  // no state diverges (behavior matches the pre-delegation build).
  if (!entry.rollId) {
    renderLog();
  } else {
    // Same one-pass build as renderLog so the incremental append stays
    // byte-identical to a full rebuild (parent-tooltip lookup + supersede
    // set both derived from the client's log).
    const byId = new Map();
    const supersededIds = new Set();
    for (const e of log) {
      if (e.rollId) byId.set(e.rollId, e);
      if (e.rerollOfId) supersededIds.add(e.rerollOfId);
    }
    const el = buildLogEntryEl(entry, { supersededIds, byId });
    // The list renders reversed (newest first): prepend the new row; the
    // scrollTop is preserved incidentally, so a user scrolled back into
    // history is no longer jerked to the top when a new roll lands.
    logList.prepend(el);
    // Refresh the parent row's chip in place, then prune from the tail.
    if (entry.rerollOfId) markSuperseded(entry.rerollOfId);
    for (let i = 0; i < dropped && logList.lastElementChild; i++) {
      logList.lastElementChild.remove();
    }
  }
  // An entry landing while the flyout is closed counts as unread on the
  // rail's ≣ badge (the dedupe above already returned for re-deliveries).
  if (!isLogFlyoutOpen()) setLogUnread(logUnread + 1);
}

// CLEARING HISTORY MUST NOT ORPHAN THE SHELF (C6). `log` is not just the
// flyout's list — it is the BACKING STORE for every shelf read:
// renderShelfMarkers, glowTint, renderPeek and the tweak popover all look a
// marker's roll up in it. Emptying it left five shelved rolls anonymous
// ("Collected roll", one gold glow for everyone), unreadable (the peek calls
// them *hidden* when they are merely unlogged, total `?`), unrerollable, and
// stripped of the named ✕ Clear and Reveal the fold only builds `if (entry)`.
// One click, and the advertised control on five rolls was gone.
//
// So the shelf goes with it. Clearing the history is a housekeeping act on
// the table's record, and the markers ARE that record's dice — leaving them
// behind is not "keeping" them, it is keeping five discs nobody can read.
// §7.7's rule already says a collected roll is anyone's to tidy.
document.getElementById('clear-log').addEventListener('click', () => {
  const shelved = [...rollStates.entries()]
    .filter(([, st]) => st.collected !== null && !st.cleared)
    .map(([rollId]) => rollId);
  log = [];
  logDroppedTotal = 0; // …and the dropped note goes with the thing it counted
  if (!netOnline) save(LS_LOG, log);
  closePeek();
  for (const rollId of shelved) requestClearRoll(rollId);
  renderLog();
  updateLogDroppedNote();
  renderShelfMarkers();
  announce(shelved.length
    ? `History cleared, and ${shelved.length} shelved roll${shelved.length === 1 ? '' : 's'} with it.`
    : 'History cleared.');
});

// ---------------------------------------------------------------------------
// Roll-log flyout (rail ≣ / key 'l'). The log left the panel stack — P3: it
// is information, not workspace — and now drops from the rail like the
// identity menu. PINNED MEANS PINNED: the log is for watching the table
// while you act on it, so clicking the felt/pools must NOT dismiss it; it
// closes only via the ≣ toggle, its own header ✕, or Esc (the END of the
// central chain — see the keyboard section). renderLog() keeps painting
// #log-list live while it is open; while it is closed, arrivals count into
// the ≣ unread badge, which also seeds from the join backlog ('hello') so a
// late joiner sees at a glance that the table has history.
// ---------------------------------------------------------------------------

const logFlyoutEl = document.getElementById('log-flyout');
const railLogBtn = document.getElementById('rail-log');
let logUnread = 0; // entries that arrived while the flyout was closed

function isLogFlyoutOpen() { return !logFlyoutEl.classList.contains('hidden'); }

// NO visual badge (user call, 2026-07): history is reference material, not
// an inbox, and a standing count-bubble nags like one. The since-you-looked
// count survives only in the hover title (still the accessible name), and
// the internal counter still drives it.
function renderLogBadge() {
  const shown = logUnread > 9 ? '9+' : String(logUnread);
  railLogBtn.title = logUnread > 0 ? `Roll log — l · ${shown} new since you looked` : 'Roll log — l';
}

function setLogUnread(n) {
  logUnread = Math.max(0, n);
  renderLogBadge();
}

function openLogFlyout() {
  logFlyoutEl.classList.remove('hidden');
  railLogBtn.setAttribute('aria-pressed', 'true');
  setLogUnread(0); // opening reads the backlog
}

function closeLogFlyout() {
  logFlyoutEl.classList.add('hidden');
  railLogBtn.setAttribute('aria-pressed', 'false');
}

function toggleLogFlyout() {
  if (isLogFlyoutOpen()) closeLogFlyout();
  else openLogFlyout();
}

railLogBtn.addEventListener('click', toggleLogFlyout);
document.getElementById('log-close').addEventListener('click', closeLogFlyout);

// ---------------------------------------------------------------------------
// Rail + corner controls
// ---------------------------------------------------------------------------

// The corner ✕: clear mine, then offer the rest (C7 ②).
let clearArmTimer = null;
function disarmClear() {
  clearTimeout(clearArmTimer);
  clearArmTimer = null;
  const btn = document.getElementById('corner-clear');
  btn.classList.remove('armed');
  btn.querySelector('.cb-label').textContent = ' Clear mine';
  btn.title = 'Clear your rolls — c (press again to clear everyone’s)';
  btn.setAttribute('aria-label', 'Clear your rolls from the table');
}
document.getElementById('corner-clear').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  if (btn.classList.contains('armed')) {
    disarmClear();
    requestClear('table');
    return;
  }
  const others = othersOnTable();
  requestClear('mine');
  if (!others) return; // your rolls were all the rolls — nothing left to ask about
  btn.classList.add('armed');
  // A BUTTON STATES THE NEXT ACT; IT DOES NOT ASK (C19, Joe 2026-08-09:
  // "buttons should guide users to options, not ask them things"). This read
  // `Clear 1 more?` — a question in a control, which belongs in a modal, and
  // this is deliberately not one. `Clear mine` → press → `Clear all` is the
  // same two-tap saying what the next press does. The COUNT moves to the
  // title and the announcement, where a number informs rather than
  // interrogates.
  btn.querySelector('.cb-label').textContent = ' Clear all';
  // The title carries the count because in the collapsed rail `.cb-label` is
  // display:none — the glyph's red is the only standing channel the arm has
  // there, and the hover read is the only place a number can still be said.
  btn.title = `Also clear ${others} roll${others === 1 ? '' : 's'} belonging to other players`;
  btn.setAttribute('aria-label', `Clear all — also removes ${others} roll${others === 1 ? '' : 's'} belonging to other players`);
  announce(`Your rolls are gone. ${others} left; press again to clear all.`);
  clearArmTimer = setTimeout(disarmClear, 4000);
});

// The sound preference's ONE home is the settings modal (Joe 2026-08-03:
// the rail's 🔊 retired — the setting is sufficient; 's' stays the
// shortcut). Persists 'dice.sound.v1'.
function setSound(on, persist = true) {
  soundOn = !!on;
  if (persist) save(LS_SOUND, soundOn);
  syncSettingsUI();
}
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
// (roomSettings is initialized near the top of the file — the setSound()
// module-eval call chain reads it via renderZoomPicker.)

// A system change is a lens swap over every surface already on screen: the
// log, the banner, and a verdict card still standing all re-read under the new
// profile. Fanfare and ceremonies that already played are never replayed
// (fx=false, 'relit'), a dismissed banner stays dismissed, and a mid-flight
// ceremony keeps its stage — its own verdict staging reads the new lens when
// it gets there.
// §11 X1: the table's system changed under us (any player may — goal 10).
// NOTHING is swapped: a pool is notation and a system is a render-time lens, so
// the rack rolls the same. What changes is what is TRUE about the label, so the
// head's system word and the mismatch banner are repainted and the picker's
// filter follows. The acknowledgement resets — this is a new question.
function onTableSystemChanged() {
  mismatchKept = false;
  updateProfileBanner();
  updateOfferBanner(); // the system filter decides what is on offer
  renderProfileLibrary();
}

function rerenderInterpretation() {
  renderLog();
  renderShelfMarkers(); // the shelf markers' meaning words re-read the lens
  // An open ± popover carries the forecast, which reads the lens too — a
  // teammate flipping the room's system must not leave a stale spectrum
  // with no visible cause (§2l ④).
  if (pop) renderPopEcho();
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

// THE QUIET NAMEPLATE (anatomy pass, Joe 2026-08-04): the table's name,
// top-right of the rail — the mirror of YOU top-left. Renders the
// room-wide tableName, else the ?room= key when someone CHOSE one (a
// non-default key is a chosen name), else NOTHING: an unnamed table
// wears no placeholder — a standing generic word is the chrome the
// removed 'Pools' title taught us to kill. Content, not chrome: renders
// as typed, never uppercased. The name also rides document.title (the
// cheapest identity surface in the app — tabs, history, link previews).
function renderTableName() {
  const el = document.getElementById('table-name');
  // The lobby has no table, so it wears no name — and crucially it cannot
  // INHERIT one. roomSettings.tableName is restored from LS_ROOMSETTINGS (the
  // solo settings copy), so before L0 a roomless page rendered the name of
  // whatever table this browser last configured, on the plate AND in the tab
  // title. `tableName` is room state; it has no business surviving into a
  // roomless session. clearTableIdentity() below is what enforces that at boot;
  // this guard is the render-side belt to its braces.
  const key = !IN_LOBBY && netOnline ? ROOM.replace(/[-_]+/g, ' ') : '';
  const name = IN_LOBBY ? '' : (roomSettings.tableName || key);
  el.textContent = name;
  // No title in the lobby: 'this table, solo' asserts a table where there is
  // none. Hidden today (no name means no plate) — but the plate is exactly the
  // surface that grows a name the moment one exists, so the lie must not sit
  // waiting behind it.
  el.title = IN_LOBBY ? '' : (netOnline ? `room: ${ROOM}` : 'this table, solo');
  el.classList.toggle('hidden', !name);
  document.title = name ? `${name} — Dice Table` : 'Dice Table';
}

// The lobby's table identity is NOT the last table's. Felt, system and zoom are
// yours and are restored from LS_ROOMSETTINGS as ever (they are "just you" with
// no table — §7.20); the NAME is the one field that belongs to a room, so it is
// dropped rather than inherited. Called once, from initNet's lobby exit, after
// applyRoomSettings has done the restoring.
function clearTableIdentity() {
  roomSettings.tableName = '';
  renderTableName();
}

// Mat-zoom presets (Joe 2026-08-04: small screens need a smaller mat).
// Three levels — the physics-mat shrinks, dice occupy a bigger fraction of
// it, the camera pulls in with matching angle. Physics-truth is untouched:
// die size is fixed in world units, face correction runs on the final quat,
// and the seeded throw bakes keyframes against the walls at spawn time
// (which is why the interaction rule DEFERS a mid-flight change — see
// queueZoom below). 'wide' matches the pre-zoom mat byte-for-byte apart
// from the shelf pitch, which is now derived from TABLE_W (formula was
// implicit before; now it's the same formula the e2e scenario asserts).
// THE WHOLE LADDER MOVED IN ONE STEP (Joe 2026-08-09: "I want to see the dice
// more closely, particularly on mobile… maybe make what is currently the
// closest setting the widest setting").
//
// `wide` is byte-for-byte the old `close`, and the two below it continue the
// ladder's own ×0.78 pitch. That is the lever that actually works: the mat is
// the PHYSICS WALLS and must be identical on every client (a seeded roll
// replayed against different walls lands differently), so it cannot vary by
// device — and applyCameraFraming only ever pulls the camera BACK from the
// preset until the mat fits, never closer. A smaller mat is therefore the one
// way to make dice bigger, on every screen at once, and it makes the shelf
// smaller with it (slot pitch derives from TABLE_W), which is what forces the
// retreat on a narrow phone in the first place.
const ZOOM_PRESETS = {
  wide:   { w: 18, d: 11,   eyeFull: [0, 17,   9.8], eyeMini: [0, 14,   7.9] },
  medium: { w: 14, d: 8.6,  eyeFull: [0, 13.2, 7.6], eyeMini: [0, 10.9, 6.1] },
  close:  { w: 11, d: 6.7,  eyeFull: [0, 10.4, 6.0], eyeMini: [0,  8.6, 4.8] },
};

let pendingZoom = null; // set by queueZoom when a change arrives mid-roll
let currentZoom = DEFAULT_ZOOM;

function tableIsBusyForZoom() {
  // A zoom must not land on a client whose physics is currently baking
  // keyframes against the OLD walls (would render the same seeded roll
  // against a different wall on different clients — the visual bump the
  // 'DEFER to next roll boundary' rule exists to kill). Whisks and reveals
  // are also live pose-drives that read the shelf slot X.
  if (currentRoll && !currentRoll.done) return true;
  if (rollQueue.length) return true;
  if (whisking.length || revealing.length) return true;
  return false;
}

function queueZoom(level) {
  if (!ZOOM_PRESETS[level]) return;
  pendingZoom = level;
  if (tableIsBusyForZoom()) {
    // A quiet 'later' note only when the wait was actually forced — a same-
    // frame flush is invisible and never needs to say so. Uses the modal's
    // own note surface when the modal is open, otherwise the status pill.
    if (level !== currentZoom) showSettingsNote('zoom applies after this roll');
    return;
  }
  tryFlushZoom();
}

function tryFlushZoom() {
  if (!pendingZoom || tableIsBusyForZoom()) return;
  const level = pendingZoom;
  pendingZoom = null;
  applyZoom(level);
}

function applyZoom(level) {
  const p = ZOOM_PRESETS[level];
  if (!p) return;
  TABLE_W = p.w;
  TABLE_D = p.d;
  // Move the wall bodies in place (no remove/add — SAP body-order matters).
  walls.back.position.set(0, 0, -TABLE_D / 2);
  walls.front.position.set(0, 0,  TABLE_D / 2);
  walls.left.position.set(-TABLE_W / 2, 0, 0);
  walls.right.position.set( TABLE_W / 2, 0, 0);
  SHELF_Z = TABLE_D / 2 - 1.9;
  SHELF_PITCH = (TABLE_W - SHELF_SLOT_W) / (SHELF_SLOTS - 1);
  updateShadowFrustum();
  CAM_EYE = { full: [...p.eyeFull], mini: [...p.eyeMini] };
  currentZoom = level;
  // Invalidate every cluster's cached slot pose + glow radius so reflowShelf
  // re-places to the new pitch and recompositeFelt draws rings at the new Z.
  for (const c of shelfClusters.values()) { c.placed = false; c.glowR = 0; }
  reflowShelf(true);   // reflows every cluster to new slot X (animated)
  recompositeFelt();   // glows land on new SHELF_Z / pitch
  refitView();         // camera framing + particle/post + chip/marker anchors
}

// Apply a full merged settings object (join response, hello, settings-changed
// echo, or the solo localStorage copy). Unknown keys/values are ignored.
function applyRoomSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (typeof settings.tableName === 'string') {
    roomSettings.tableName = cutText(settings.tableName, 28); // mirror the server cap
    renderTableName();
    // the settings modal's rename field follows the echo — unless the
    // player is mid-typing in it (never clobber a focused input)
    const input = document.getElementById('set-table-name');
    if (document.activeElement !== input) input.value = roomSettings.tableName;
  }
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
      // BOTH (merge 2026-08-08): they answer different halves of a system
      // flip. updateTrayModsWord (U11) re-words the rim for what the popover
      // can express under the new system; onTableSystemChanged (§11 X1) says
      // the table's LABEL changed and nothing was swapped underneath.
      updateTrayModsWord();
      onTableSystemChanged();
    }
    renderSystemPicker();
  }
  if (typeof settings.zoom === 'string' && ZOOM_PRESETS[settings.zoom]) {
    roomSettings.zoom = settings.zoom;
    if (settings.zoom !== currentZoom) queueZoom(settings.zoom);
    renderZoomPicker();
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
      // The swatch shows the CLOTH, not a paint chip: the same grain tile
      // the table itself wears (the felt exploration deserves to be seen
      // in the picker, not guessed from a flat dot).
      dot.style.backgroundImage = `url(${feltTileCanvas(theme.feltBase).toDataURL()})`;
      dot.style.backgroundSize = '64px 64px';
      const nm = document.createElement('span');
      nm.textContent = theme.name;
      chip.append(dot, nm);
      chip.title = IN_LOBBY ? `${theme.name} felt` : `${theme.name} felt — everyone at the table sees this`;
      chip.addEventListener('click', () => selectFelt(id));
      holder.appendChild(chip);
    }
  }
  holder.querySelectorAll('.felt-swatch').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.felt === currentFeltId));
  });
}

// ---------------------------------------------------------------------------
// The compact dice-set select (§9): ONE control for every space-tight
// surface — the settings row and the pool popover's identity strip (Joe:
// same thing in both places, for consistency). A button wears the current
// choice (set-dot + label + caret) and opens a body-level floating menu of
// Standard + every house's sets — the same grouping the old settings grid
// taught, now scrollable and anchored. The menu lives on document.body so
// nothing clips it; no click-away guards were needed anywhere (the ±
// popover has no outside-click closer, and the settings backdrop only
// closes on a DIRECT backdrop hit). One open menu app-wide; arrows/Home/
// End move, Enter picks, Esc returns focus to the button.
// ---------------------------------------------------------------------------

// {label, body, text} for a set id ('std' included) — the swatch language.
function setSwatchInfo(id) {
  if (!id || id === 'std') {
    return { label: 'Standard', body: DIE_DEFS.d6.color, text: DIE_DEFS.d6.text };
  }
  const r = SETS[id];
  return r ? { label: r.label, body: r.body, text: r.text } : null;
}

function setDotEl(info) {
  const dot = document.createElement('span');
  dot.className = 'set-dot';
  dot.style.background = info.body;
  dot.style.color = info.text;
  dot.textContent = '6';
  return dot;
}

// (setMenuState is declared with the early popover state — closePopover
// runs from boot-adjacent paths and must never trip a TDZ here.)
function closeSetMenu(refocus = false) {
  if (!setMenuState) return;
  const { el, anchor } = setMenuState;
  setMenuState = null;
  el.remove();
  document.removeEventListener('pointerdown', setMenuAway, true);
  if (anchor.isConnected) {
    anchor.setAttribute('aria-expanded', 'false');
    if (refocus) anchor.focus();
  }
}

function setMenuAway(e) {
  if (!setMenuState) return;
  const t = e.target;
  if (t instanceof Node && (setMenuState.el.contains(t) || setMenuState.anchor.contains(t))) return;
  closeSetMenu();
}

function openSetMenuFor(anchor, { value, allowDefault, pick }) {
  closeSetMenu();
  const menu = document.createElement('div');
  menu.className = 'set-menu';
  menu.setAttribute('role', 'listbox');
  const rows = [];
  const addRow = (v, label, info, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'set-swatch';
    b.setAttribute('role', 'option');
    b.dataset.set = v || '';
    b.setAttribute('aria-selected', String((v || '') === (value || '')));
    const nm = document.createElement('span');
    nm.textContent = label;
    b.append(setDotEl(info), nm);
    b.title = title;
    b.addEventListener('click', () => { closeSetMenu(true); pick(v); });
    menu.appendChild(b);
    rows.push(b);
  };
  if (allowDefault) {
    const mine = setSwatchInfo(diceSet);
    addRow(null, `Your set — ${mine.label}`, mine,
      'No override: this pool follows whatever set YOU wear');
  }
  addRow('std', 'Standard', setSwatchInfo('std'),
    allowDefault ? 'Pin the table classics — even when you wear a house set'
      : 'The table classics — one color per die type');
  for (const [houseId, house] of Object.entries(THEMES)) {
    const head = document.createElement('div');
    head.className = 'set-house-head';
    head.textContent = house.label;
    head.title = house.line;
    menu.appendChild(head);
    for (const [setId, recipe] of Object.entries(house.sets)) {
      const id = `${houseId}.${setId}`;
      addRow(id, recipe.label, setSwatchInfo(id), `${house.label} · ${recipe.label}`);
    }
  }
  menu.addEventListener('keydown', (e) => {
    e.stopPropagation(); // the popover fields' rule: no table shortcuts underneath
    const at = rows.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
    } else if (e.key === 'Home') { e.preventDefault(); rows[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); rows[rows.length - 1].focus(); }
    else if (e.key === 'Escape') closeSetMenu(true);
    else if (e.key === 'Tab') closeSetMenu();
  });
  document.body.appendChild(menu);
  // place below the anchor, clamped to the viewport; flip above when the
  // room runs out (the menu itself scrolls past ~340px)
  const r = anchor.getBoundingClientRect();
  let top = r.bottom + 6;
  if (top + menu.offsetHeight > window.innerHeight - 12) {
    top = Math.max(12, r.top - menu.offsetHeight - 6);
  }
  menu.style.left = `${Math.max(12, Math.min(Math.round(r.left), window.innerWidth - menu.offsetWidth - 12))}px`;
  menu.style.top = `${Math.round(top)}px`;
  anchor.setAttribute('aria-expanded', 'true');
  setMenuState = { el: menu, anchor };
  document.addEventListener('pointerdown', setMenuAway, true);
  (rows.find((b) => b.getAttribute('aria-selected') === 'true') || rows[0]).focus();
}

// value: null = "Your set" (allowDefault surfaces only), 'std', or a SETS
// id; onPick receives the same shape. The button re-paints itself on pick;
// external state changes re-paint via .refreshSetSelect(value).
function buildSetSelect({ value = null, allowDefault = false, onPick, title }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'set-swatch set-select';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (title) btn.title = title;
  const paint = (v) => {
    btn.dataset.value = v || '';
    btn.textContent = '';
    const info = setSwatchInfo(v || diceSet) || setSwatchInfo('std');
    const nm = document.createElement('span');
    nm.className = 'ss-label';
    nm.textContent = v ? info.label : (allowDefault ? `Your set — ${info.label}` : info.label);
    const caret = document.createElement('span');
    caret.className = 'ss-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';
    btn.append(setDotEl(info), nm, caret);
  };
  paint(value);
  btn.addEventListener('click', () => {
    if (setMenuState && setMenuState.anchor === btn) { closeSetMenu(); return; }
    openSetMenuFor(btn, {
      value: btn.dataset.value || null,
      allowDefault,
      pick: (v) => { paint(v); onPick(v); },
    });
  });
  btn.refreshSetSelect = paint;
  return btn;
}

// The settings row wears the SAME control. Value here is always concrete —
// there is no default above your own set. The instance lives in the DOM,
// not a module let: settings boot calls run at module scope ABOVE this
// line (the renderFeltSwatches lazy-element lesson — module-eval ordering).
function renderDiceSetPicker() {
  const holder = document.getElementById('diceset-picker');
  if (!holder) return;
  let btn = holder.querySelector('.set-select');
  if (!btn) {
    btn = buildSetSelect({
      value: diceSet,
      allowDefault: false,
      onPick: (v) => setDiceSet(v || 'std'),
      title: IN_LOBBY ? 'Dice set — the dice you roll in' : 'Dice set — everyone sees your rolls in these dice',
    });
    holder.appendChild(btn);
  }
  btn.refreshSetSelect(diceSet);
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
      chip.title = IN_LOBBY ? `${sys.label} — how your rolls read` : `${sys.label} — everyone at the table reads rolls this way`;
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
  onTableSystemChanged(); // §11 X1/X9 — the lobby's own system counts too
  renderSystemPicker();
  return true;
}

// Mat-zoom picker (Joe 2026-08-04: small screens need a closer mat).
// Same segmented-pill grammar as the system picker — three text labels, no
// photo swatches (the differences are proprioceptive, not aesthetic).
// ZOOM_LEVELS is declared at module top (near TABLE_W/D) so setSound's
// module-eval call chain (syncSettingsUI → renderZoomPicker) never hits it
// in the TDZ; this reference just documents where the numbers live.
function renderZoomPicker() {
  const holder = document.getElementById('zoom-picker');
  if (!holder) return;
  if (!holder.childElementCount) {
    for (const z of ZOOM_LEVELS) {
      const chip = document.createElement('button');
      chip.className = 'system-chip';
      chip.dataset.zoom = z.id;
      chip.textContent = z.label;
      chip.title = z.title;
      chip.setAttribute('role', 'radio');
      chip.addEventListener('click', () => selectZoom(z.id));
      holder.appendChild(chip);
    }
  }
  const active = roomSettings.zoom || DEFAULT_ZOOM;
  // aria-checked ONLY (U22): `aria-pressed` is not a valid attribute of
  // role="radio", and setting both means one of the two is always wrong. A
  // radio's state is checked; pressed belongs to a toggle button.
  holder.querySelectorAll('[data-zoom]').forEach((b) => {
    const on = b.dataset.zoom === active;
    b.removeAttribute('aria-pressed');
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1; // one tab stop for the group, arrows within
  });
}

// Chip click (and __diceDebug.setZoom). Online: send the patch, apply on
// the 'settings-changed' echo like felt/system. Solo: apply the mat now and
// persist. A mid-flight change DEFERS via queueZoom (see applyRoomSettings).
function selectZoom(id) {
  if (!ZOOM_PRESETS[id]) return false;
  if (id === roomSettings.zoom && id === currentZoom) return true;
  if (netOnline && net) {
    net.setSettings({ zoom: id }).then((ok) => {
      if (!ok) showSettingsNote('couldn’t reach the table — zoom unchanged');
    });
    return true;
  }
  roomSettings.zoom = id;
  save(LS_ROOMSETTINGS, roomSettings);
  queueZoom(id);
  renderZoomPicker();
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
  // U5: whichever surface carries it visually, it is SAID once. The pill is a
  // 3-second string with no live region and folds to a 10px colorless dot
  // while collapsed, so table events — "Alice changed the table", refusals,
  // "Bo left" — reached a screen reader through no channel at all.
  announce(text);
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
  renderDiceSetPicker();
  renderSystemPicker();
  renderZoomPicker();
  renderFeltSwatches();
}

function openSettingsModal() {
  renderProfileLibrary(); // §11: the library and 'At this table', fresh per open
  // The table-name prefill lives HERE, not in syncSettingsUI: setSound()
  // calls syncSettingsUI during module evaluation, before roomSettings'
  // let initializes — the exact eval-order trap the felt-swatch comment
  // below records. A modal can only open long after eval.
  const nameInput = document.getElementById('set-table-name');
  if (document.activeElement !== nameInput) nameInput.value = roomSettings.tableName || '';
  // The lobby's honesty pass (§7.20): a heading that claims "everyone at the
  // table" with no table is the section's own lie, and Table name has no
  // roomless meaning. Felt, system and zoom stay — they are yours either way.
  // `Apply to table` goes too: it is the one room-scoped control in an
  // otherwise roomless 'Your data', and with no table its ONLY outcome is a
  // refusal, which is a button that exists to say no.
  // The heading is RELABELLED, not removed. Removing it left felt/system/zoom
  // in a heading-less block that reads as a continuation of the section ABOVE
  // it ("Your data"), which is worse than the lie it was fixing. "This table"
  // is truthful with no table joined — GOALS goal 9 calls the serverless
  // experience "a fully working solo table" — and it stays distinct from the
  // "Just you" section rather than duplicating its heading.
  document.getElementById('set-room-label').textContent = IN_LOBBY
    ? 'This table' : 'Everyone at the table';
  document.getElementById('set-table-name-row').style.display = IN_LOBBY ? 'none' : '';
  document.getElementById('portable-push').style.display = IN_LOBBY ? 'none' : '';
  document.getElementById('set-diceset-sub').textContent = IN_LOBBY
    ? 'the dice you roll in — from your next roll'
    : 'the dice everyone sees you roll — from your next roll';
  syncSettingsUI();
  settingsModal.classList.remove('hidden');
  openModal(settingsModal, { labelledBy: 'settings-title' });
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden');
  closeModal(settingsModal);
  document.getElementById('settings-note').textContent = '';
  closeSetMenu(); // the dice-set menu must not outlive its anchor
}

document.getElementById('toggle-settings').addEventListener('click', openSettingsModal);
document.getElementById('settings-close').addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettingsModal(); // backdrop click
});
// Esc closes the modal only when it is the topmost layer — see the central
// Esc layering in the keyboard-shortcuts section below.
document.getElementById('set-sound').addEventListener('click', () => setSound(!soundOn));
// Table name (anatomy pass): commit on Enter/blur, room-wide like felt —
// online the UI applies only on the settings-changed echo (no optimistic
// divergence); solo applies now and persists the LS copy. Same-value
// commits are dropped client-side (the server would 200 a no-op anyway).
{
  const nameInput = document.getElementById('set-table-name');
  const commitTableName = () => {
    const v = nameInput.value.trim();
    if (v === (roomSettings.tableName || '')) return;
    if (netOnline && net) {
      net.setSettings({ tableName: v }).then((ok) => {
        if (!ok) showSettingsNote('couldn’t rename the table — try again');
      });
    } else {
      roomSettings.tableName = cutText(v, 28);
      save(LS_ROOMSETTINGS, roomSettings);
      renderTableName();
    }
  };
  nameInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing a name must not fire table shortcuts
    if (e.key === 'Enter') { commitTableName(); nameInput.blur(); }
  });
  nameInput.addEventListener('blur', commitTableName);
}
document.getElementById('set-chips').addEventListener('click', () => setChips(!chipsOn));

// ---------------------------------------------------------------------------
// Your data (Tier 4 §5): pools + just-you settings as portable YAML — one
// textarea, two directions. 'Fill with my data' exports; pasting/editing
// re-parses LIVE and the status line previews exactly what Apply would do
// (adds · updates · unchanged · setting flips). Apply is explicit, merges
// by name through the by-id writer, and deletes nothing. The parser is
// js/portable.js's strict subset — refusals name their line.
// ---------------------------------------------------------------------------

const portableZone = document.getElementById('portable-zone');
const portableText = document.getElementById('portable-text');
const portableStatus = document.getElementById('portable-status');
const portableApplyBtn = document.getElementById('portable-apply');
let portablePlan = null; // the previewed plan Apply commits (null = nothing valid)
let portableParsed = null; // the last GOOD parse of the box (drives the G3 profile list)

// The file this browser would write right now. Since §11 that is THE WHOLE
// LIBRARY: `players:` carries every profile with the system it was built for,
// and `pools:` stays the rack in your hands — the same shape it has always
// been, so a file from this app still hands its pools to an importer that
// knows nothing about profiles. The active profile therefore appears twice,
// once as a seat and once as the top-level rack; that is deliberate, because
// the two sections answer different questions ("who is in this file" and "what
// would Apply merge into my rack") and collapsing them would break one.
//
// `table:` is only written when there is a table to describe — the lobby has
// none, and a file naming a table you are not at is exactly the phantom §7.20
// went and deleted from the nameplate.
function portableSnapshot() {
  return exportYaml({
    groups,
    settings: { sound: soundOn, numbers: chipsOn },
    table: IN_LOBBY ? null : {
      ...(roomSettings.tableName ? { name: roomSettings.tableName } : {}),
      felt: roomSettings.felt,
      system: roomSettings.system,
      zoom: roomSettings.zoom,
    },
    // WHOSE the top-level pools are. This is what keeps the document free of a
    // second home for the same rack: the profile in hand stays exactly where
    // the exporter's own pools have always been (`pools:`), `players:` carries
    // only the OTHERS, and this names the one holding the rack. Writing it into
    // both sections instead would put one character's dice in two places, and
    // an edit that lands in the ignored copy is a trap in a format people are
    // invited to hand-edit.
    profile: (() => {
      const p = activeProfile(profileStore);
      return p ? { name: p.name, system: p.system, ...(p.set ? { set: p.set } : {}) } : null;
    })(),
    profiles: profilesOf(profileStore)
      .filter((p) => p.id !== profileStore.activeId)
      .map((p) => ({
        name: p.name,
        system: p.system,
        ...(p.set ? { set: p.set } : {}),
        groups: (p.pools || []).map(({ id, ...rec }) => rec),
      })),
  });
}

// The preview's counting grammar — '3 new · 1 update · 2 unchanged' — shared
// verbatim by the pane's status line and the §G5 seat picker, so the two
// surfaces that answer "what would Apply do" can never drift apart.
function importVerdictBits(plan) {
  const bits = [];
  if (plan.adds.length) bits.push(`${plan.adds.length} new`);
  if (plan.updates.length) bits.push(`${plan.updates.length} update${plan.updates.length > 1 ? 's' : ''}`);
  if (plan.unchanged) bits.push(`${plan.unchanged} unchanged`);
  return bits;
}

// Commit a previewed import plan into the rack. ONE function on purpose: the
// pane's Apply button and the §G5 seat picker's Apply both land here, because
// GOALS §7's post-mortem leaves exactly one road into a rack — a previewed
// plan, explicitly applied, merging by name and deleting nothing. Returns the
// receipt fragments ('8 added', 'sound on', …) for the caller's own grammar.
function applyImportPlan(plan) {
  for (const u of plan.updates) {
    editPoolById(u.id, { notation: u.notation, category: u.category || '', set: u.set || '' });
  }
  plan.adds.forEach((a, i) => {
    groups.push({ id: Date.now() + i, name: a.name, notation: a.notation,
      ...(a.category ? { category: a.category } : {}),
      ...(a.set ? { set: a.set } : {}) });
  });
  if (plan.adds.length) { saveGroups(); renderGroups(); }
  if ('sound' in plan.settings) setSound(plan.settings.sound);
  if ('numbers' in plan.settings) setChips(plan.settings.numbers);
  const done = [];
  if (plan.adds.length) done.push(`${plan.adds.length} added`);
  if (plan.updates.length) done.push(`${plan.updates.length} updated`);
  done.push(...(plan.flips || []));
  return done;
}

function portablePreview() {
  const text = portableText.value;
  portablePlan = null;
  portableParsed = null;
  portableApplyBtn.disabled = true;
  portableStatus.classList.remove('warn');
  if (!text.trim()) { portableStatus.textContent = ''; renderImportProfiles(); return; }
  const parsed = parsePortable(text);
  if (!parsed.ok) {
    portableStatus.textContent = `✗ ${parsed.line ? `line ${parsed.line}: ` : ''}${parsed.error}`;
    portableStatus.classList.add('warn');
    renderImportProfiles();
    return;
  }
  // The parse stands even when the IMPORT plan below is refused: what the file
  // HOLDS is a different question from what would merge into your own rack.
  portableParsed = parsed;
  renderImportProfiles();
  const plan = planImport(groups, parsed);
  if (groups.length + plan.adds.length > 40) {
    portableStatus.textContent = `✗ would exceed 40 pools (you have ${groups.length}, this adds ${plan.adds.length})`;
    portableStatus.classList.add('warn');
    return;
  }
  const flips = [];
  if ('sound' in plan.settings && plan.settings.sound !== soundOn) flips.push(`sound ${plan.settings.sound ? 'on' : 'off'}`);
  if ('numbers' in plan.settings && plan.settings.numbers !== chipsOn) flips.push(`numbers ${plan.settings.numbers ? 'on' : 'off'}`);
  const bits = [...importVerdictBits(plan), ...flips];
  if (plan.adds.length || plan.updates.length || flips.length) {
    portablePlan = { ...plan, flips };
    portableApplyBtn.disabled = false;
    portableStatus.textContent = `✓ ${bits.join(' · ')} — Apply takes them`;
  } else {
    portableStatus.textContent = '✓ matches what you have — nothing to apply';
  }
}

// ---------------------------------------------------------------------------
// The file door (ROADMAP §G1, PROFILES §7): the same box, two more directions,
// aimed at disk. A room evaporates when its last player leaves and a paste blob
// is not a backup — 'never lose it' needs a file. Zero-dep by construction: a
// Blob object URL out, File.text() in.
//
// Download writes a FRESH snapshot rather than the box's text. The box is a
// scratch surface that may be holding someone else's file mid-preview, and a
// button under 'Your data' must never write a stranger's rack to a file named
// after your table. Copy stays the box's own verb; these two are your data's.
//
// Open only FILLS the box and re-runs the live preview — deliberately NOT a
// second import path. GOALS §7 retired the '#g=' URL codec precisely because it
// replaced a rack sight-unseen; a file picked from disk is no more trusted than
// a link was, so it arrives in front of the same preview-then-Apply gate.
// ---------------------------------------------------------------------------

const PORTABLE_MAX_BYTES = 512 * 1024; // a text format; MB-scale means wrong file, not big rack

// '<slug>-<YYYY-MM-DD>.dice.yaml' — named for the TABLE so six characters'
// files don't all land in Downloads as 'export (3)'. The table name wins, the
// ?room= key is the fallback, and in the LOBBY neither exists: a roomless save
// is 'dice-table', never the name of the table you were at last week (the same
// phantom-name defect renderTableName carried). The date is LOCAL: UTC would
// rename an evening save to tomorrow.
function portableFilename() {
  const slug = String(IN_LOBBY ? '' : (roomSettings.tableName || ROOM))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '') // the cut can land mid-separator
    || 'dice-table';
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${slug}-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.dice.yaml`;
}

function portableDownload() {
  const name = portableFilename();
  const url = URL.createObjectURL(new Blob([portableSnapshot()], { type: 'text/yaml;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a); // a detached anchor's click() is a no-op in some browsers
  a.click();
  a.remove();
  // Revoke LATE, never synchronously: click only queues the save, and pulling
  // the URL out from under an in-flight download cancels it.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return name;
}

// The preview's own verdict, in primitives — what the status line says, and
// whether Apply is armed. Lets a scenario read the outcome of a load without
// scraping the status element.
function portableVerdict() {
  return {
    ok: !portableStatus.classList.contains('warn'),
    status: portableStatus.textContent,
    canApply: !portableApplyBtn.disabled,
  };
}

// A refusal the parser never saw (the file itself was wrong), spoken in the
// pane's existing failure grammar: '✗ …' with .warn, and any previewed plan
// dropped so Apply can't fire against what's no longer on screen.
function portableRefuse(msg) {
  portablePlan = null;
  portableApplyBtn.disabled = true;
  portableStatus.textContent = msg;
  portableStatus.classList.add('warn');
  return portableVerdict();
}

// The ONE place file text enters: fill the box, re-run the SAME live preview.
function portableLoadText(text) {
  portableText.value = String(text == null ? '' : text);
  portablePreview();
  return portableVerdict();
}

// A file the browser can't read (moved, permission-denied) or shouldn't (a
// multi-megabyte 'yaml' that is really something else) lands as a refusal in
// the status line, never as an exception in the console.
async function portableAcceptFile(file) {
  if (!file) return portableVerdict();
  if (file.size > PORTABLE_MAX_BYTES) {
    return portableRefuse(`✗ ${file.name || 'that file'} is ${Math.ceil(file.size / 1024)} KB — this is a text format, ${PORTABLE_MAX_BYTES / 1024} KB max`);
  }
  let text;
  try {
    text = await file.text();
  } catch {
    return portableRefuse(`✗ couldn’t read ${file.name || 'that file'}`);
  }
  return portableLoadText(text);
}

// The jam banner's one exit (CUJ13): the work is only on screen, and a file
// is the only place it can go. Same writer as Your data → Download — this is
// that door, brought to where the bad news is, so the recovery does not
// require finding a settings panel four levels deep while nothing is saving.
document.getElementById('storage-download').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  portableDownload();
  btn.textContent = 'Saved to your device';
  setTimeout(() => { btn.textContent = 'Download my data'; }, 1400);
});

document.getElementById('portable-download').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  portableDownload();
  // The morph is the receipt (Copy's pattern) — the status line belongs to the
  // import preview, and saving must not blank a plan you were about to Apply.
  btn.textContent = 'Saved!';
  setTimeout(() => { btn.textContent = 'Download'; }, 900);
});
const portableFileInput = document.getElementById('portable-file');
// §G4/§G6: one push per click — the button disarms while its own request is
// out, so a double-click cannot race itself into rev n+1 vs n+2. The verdict
// lands on the pane's status line; the morph is the receipt (Copy's pattern).
document.getElementById('portable-push').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const r = await portablePushToTable();
    btn.textContent = r.ok ? 'Sent!' : 'Apply to table';
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = 'Apply to table'; }, 900);
  }
});
document.getElementById('portable-openfile').addEventListener('click', () => portableFileInput.click());
portableFileInput.addEventListener('change', () => {
  const file = portableFileInput.files && portableFileInput.files[0];
  portableFileInput.value = ''; // re-picking the SAME file must fire change again
  portableAcceptFile(file);
});

// ---------------------------------------------------------------------------
// The profile library's surfaces (docs/PROFILES.md §11).
//
// THIS REPLACES TIER G's RACK SWAP. §G3 gave the organizer the pool editor and
// the dice-value ledger pointed at somebody else's rack by swapping that
// profile's pools INTO the one rack and stashing yours beside it — with a
// write-and-verify before `groups` moved, a sticky banner naming whose pools
// were on screen, a publish gate so the room never heard Alice's rack under
// your name, and a boot guard for the tab that died mid-edit. Every one of
// those existed because there was ONE rack and it had to pretend to be two.
//
// There are thirty-two now. Taking a profile in hand is a pointer move inside a
// single stored value, both racks are already in it, and the failure class the
// stash was built to survive cannot be constructed — so the stash, its
// verification, its banner, its gate and its guard are deleted rather than
// ported (§11.8). What survives from §G3 is the OBSERVATION that made it work:
// there is no second editor, because the rack in your hands is always the thing
// the ✎ overlays, the popover, the spectrum bars and the ledger act on.
//
// The banner survives too, re-purposed. It used to say "you are holding
// someone else's pools"; it now says the one thing that can still be true and
// surprising — that the profile in your hands was built for a different
// rulebook than this table reads (§11.5).
// ---------------------------------------------------------------------------

// The whole-file pool ceiling, MIRRORED from js/portable.js (which does not
// export it) so a refusable push never replaces good box text.
const PORTABLE_MAX_POOLS_PER_FILE = MAX_PROFILES * MAX_POOLS + MAX_POOLS;

// One parsed rack (parsePortable's shelves) → flat group records, ids minted
// fresh. Fresh ids are safe: nothing downstream joins on them, and Apply's
// added ids are Date.now()-scale so they never collide with these.
function profileShelvesToGroups(shelves) {
  const out = [];
  for (const s of shelves || []) {
    for (const p of s.pools) {
      out.push({
        id: out.length + 1, name: p.name, notation: p.notation,
        ...(s.plain ? {} : { category: s.label }),
        ...(p.set ? { set: p.set } : {}),
      });
    }
  }
  return out;
}


// The rack as exportYaml's flat profile shape (ids stripped — they are
// rack-local and mean nothing in a file).
function groupsToProfileGroups() {
  return groups.map((g) => ({
    name: g.name || '', notation: g.notation,
    ...(g.category ? { category: g.category } : {}),
    ...(g.set ? { set: g.set } : {}),
  }));
}

function portableFindProfile(name) {
  const k = String(name == null ? '' : name).trim().toLowerCase();
  return (portableParsed ? portableParsed.profiles : []).find((p) => p.name.toLowerCase() === k) || null;
}

// A commit receipt in the pane's voice: the previewed plan is SPENT (Apply's
// own post-commit grammar) — a plan computed against the pre-commit rack or
// text must never stay armed after either has changed. Any new input, Fill,
// Open or load re-arms through the live preview.
function portableReceipt(msg) {
  portablePlan = null;
  portableApplyBtn.disabled = true;
  portableStatus.classList.remove('warn');
  portableStatus.textContent = msg;
  return portableVerdict();
}

// Every profile a file offers, in one list — the `players:` blocks PLUS the
// top-level `pools:` section, which is one profile too: the exporting browser's
// own, named by the `profile:` key. A file written before that key existed (or
// hand-written without it) still offers its rack, under a label naming what it
// is rather than a person who was never recorded.
function importableProfiles() {
  if (!portableParsed) return [];
  const out = [];
  const top = portableParsed.shelves.reduce((n, sh) => n + sh.pools.length, 0);
  const me = portableParsed.profile || null;
  if (top || me) {
    out.push({
      key: '',
      name: (me && me.name) || 'This file’s pools',
      system: (me && me.system) || null,
      set: (me && me.set) || null,
      pools: profileShelvesToGroups(portableParsed.shelves).map(({ id, ...rec }) => rec),
      named: !!(me && me.name),
    });
  }
  for (const p of portableParsed.profiles) {
    out.push({
      key: p.name,
      name: p.name,
      system: p.system || null,
      set: p.set || null,
      pools: profileShelvesToGroups(p.shelves).map(({ id, ...rec }) => rec),
      named: true,
    });
  }
  return out;
}

// One profile out of the box text → the library. The DM's file arriving on a
// player's machine (§11 O7/P14). An empty `key` is the top-level rack.
function portableAdoptOne(name) {
  if (!portableParsed) return portableRefuse('✗ nothing usable in the box — open a table file or Fill with my data first');
  const want = String(name == null ? '' : name).trim().toLowerCase();
  const p = importableProfiles().find((r) => r.key.toLowerCase() === want);
  if (!p) return portableRefuse(`✗ no profile ${JSON.stringify(String(name == null ? '' : name).trim())} in this file`);
  const got = copyProfileIn({ name: p.name, system: p.system, set: p.set, pools: p.pools });
  renderProfileLibrary();
  return got.ok ? portableReceipt(got.status) : portableRefuse(got.status);
}

// What the box's `players:` section holds, one row per profile, each an Add
// away from the library — plus one Add all for the DM's six-character file.
// Rebuilt on every preview (the box is live), so the rows carry no state.
function renderImportProfiles() {
  const zone = document.getElementById('import-profiles');
  const rows = document.getElementById('import-profile-rows');
  if (!zone || !rows) return;
  const seats = importableProfiles();
  zone.classList.toggle('hidden', !seats.length);
  rows.textContent = '';
  if (!seats.length) return;
  document.getElementById('import-adopt-all').textContent = `Add all ${seats.length}`;
  for (const p of seats) {
    const row = document.createElement('div');
    row.className = 'pp-row';
    const nameEl = document.createElement('span');
    nameEl.className = 'pp-name';
    nameEl.textContent = p.name;
    const sysEl = document.createElement('span');
    sysEl.className = 'pp-tag pp-sys';
    sysEl.textContent = p.system ? systemLabel(p.system) : 'this table';
    const n = p.pools.length;
    const countEl = document.createElement('span');
    countEl.className = 'pp-count';
    countEl.textContent = `${n} pool${n === 1 ? '' : 's'}`;
    const add = document.createElement('button');
    add.className = 'btn tiny';
    add.textContent = 'Add';
    add.title = `Add '${p.name}' to your profiles — nothing of yours is touched`;
    add.addEventListener('click', () => portableAdoptOne(p.key));
    row.append(nameEl, sysEl, countEl, add);
    rows.appendChild(row);
  }
}

// Add every profile in the box text to the library — how a DM's file reaches a
// player who was not at the table (§11 O7/P14). An ADD, never a replace: names
// dedupe, nothing of the player's is touched, and the cap refuses out loud with
// what did land still landed.
function portableAdoptProfiles() {
  if (!portableParsed) return portableRefuse('✗ nothing usable in the box — open a table file or Fill with my data first');
  const seats = importableProfiles();
  if (!seats.length) return portableRefuse('✗ this file carries no profiles');
  const added = [];
  let refusal = null;
  for (const p of seats) {
    const got = copyProfileIn({ name: p.name, system: p.system, set: p.set, pools: p.pools });
    if (got.ok) added.push(p.name);
    else { refusal = got.status; break; } // the cap, or a name no cleaning saves
  }
  renderProfileLibrary();
  if (!added.length) return portableRefuse(refusal || '✗ nothing could be added');
  const tail = refusal ? ` — then stopped: ${refusal.replace(/^✗ /, '')}` : '';
  return portableReceipt(`✓ ${added.length} profile${added.length === 1 ? '' : 's'} added to your library${tail}`);
}

// Apply to table (§G4's client half; the record §G6's re-push replays): push
// the box's table: + players: to the room as the prepared setup, so joiners are
// offered the seats. The FILE stays the truth (Download is one row up); the
// room holds a copy, replaceable furniture like the felt (goal 10 — anyone
// may). The box's PARSE is what goes: felt/system/zoom/name map onto the
// settings keys the server validates (file 'name' ↔ wire 'tableName'), shelves
// flatten through profileShelvesToGroups minus their rack-local ids.
//
// §11: the seats are FILTERED to the system the table will be reading by, and
// capped at the room's 12. A library holds 32 because that is how many
// characters a person keeps; a table takes 12 because that is how many seats it
// has, and a seat prepared for another rulebook is one the picker must not
// offer. Both the filter and the cap are named in the receipt — a push that
// silently dropped four of your six players would read as a bug.
//
// Unlike the old §G3 profile verbs this does NOT refuse a file with skipped
// unknown sections: nothing is rewritten, so nothing can be dropped.
//
// The rev outbids everything this client can see (the room's, and its own
// stored record); a push that STILL loses raced a same-instant winner, so it
// retries once over the answered rev — the click meant "make the room look like
// this file", and the no-op answer names exactly what to beat. Success writes
// dice.table.v1:<room> — the ONE place it is written — making this browser an
// author §G6 will re-push for.
async function portablePushToTable() {
  // …AND SEND WHAT IS TRUE NOW (C9). If the box still holds exactly what we
  // put there, it is a stale view of our own data and the live one is what
  // was meant. Anything else — a file, or an edit — goes as it reads.
  if (portableFilledText !== null && portableText.value === portableFilledText) {
    fillPortableBox();
  }
  if (!portableParsed) return portableRefuse('✗ nothing usable in the box — open a table file or Fill with my data first');
  if (!netOnline || !net) return portableRefuse('✗ solo — no table to prepare (the file itself still works anywhere)');
  const t = portableParsed.table || null;
  // The top-level rack rides along as a seat when the file names whose it is —
  // an organizer's own character belongs at the table beside the ones they
  // prepared for everyone else. Unnamed, it stays out: a seat has to be
  // choosable by name, and 'This file's pools' is a label, not a person.
  const seats = importableProfiles().filter((p) => p.named);
  if (!t && !seats.length) {
    return portableRefuse('✗ nothing to send — the box has no table: and no profiles to seat');
  }
  const table = {};
  if (t) {
    if (t.name) table.tableName = t.name;
    if (t.felt) table.felt = t.felt;
    if (t.system) table.system = t.system;
    if (t.zoom) table.zoom = t.zoom;
  }
  // What the room WILL read by once this push lands — the file's own system if
  // it names one, else whatever the room already reads by.
  const willRead = knownSystem(table.system) || tableSystem();
  // A seat naming no system is one prepared before §11: it belongs to the
  // table it was written for, which is this one.
  const fit = seats.filter((p) => (p.system || willRead) === willRead);
  const wrongSystem = seats.length - fit.length;
  const profiles = fit.slice(0, PROFILES_AT_TABLE).map((p) => ({
    name: p.name,
    system: p.system || willRead,
    ...(p.set ? { set: p.set } : {}),
    pools: p.pools,
  }));
  const overCap = fit.length - profiles.length;
  const stored = storedTable();
  const base = Math.max(
    roomSetup && Number.isInteger(roomSetup.rev) ? roomSetup.rev : 0,
    stored ? stored.rev : 0,
  );
  let res = await net.pushTable({ rev: base + 1, table, profiles });
  if (res && !res.applied) {
    res = await net.pushTable({ rev: res.rev + 1, table, profiles });
  }
  if (!res) return portableRefuse('✗ couldn’t reach the table — nothing was sent');
  if (!res.applied) return portableRefuse('✗ the table took a newer setup just now — try again');
  save(LS_TABLE, { rev: res.rev, table, profiles, at: Date.now() });
  const n = profiles.length;
  const left = [];
  if (wrongSystem) left.push(`${wrongSystem} for another system`);
  if (overCap) left.push(`${overCap} over the ${PROFILES_AT_TABLE}-seat limit`);
  const tail = left.length ? ` · left behind: ${left.join(', ')}` : '';
  return portableReceipt(`✓ table prepared — ${n ? `${n} seat${n === 1 ? '' : 's'} offered at this room` : 'settings sent to the room'}${tail}`);
}

// The room's own cap, mirrored from server.js MAX_PROFILES. Not the library's:
// 32 is how many characters a person keeps, 12 is how many seats a table has.
const PROFILES_AT_TABLE = 12;

// ---------------------------------------------------------------------------
// The mismatch banner (§11.5) — Tier G's #profile-banner, re-purposed
// ---------------------------------------------------------------------------
//
// One sticky bar over the rack, wearing the pools-toolbar's editing dress,
// present exactly while the profile in your hands is bound to a different
// system than this table reads. It is not a warning and nothing is broken: a
// pool is notation and a system is a render-time lens (goal 6), so the rack
// rolls the same either way. It exists because the alternative to naming the
// situation is a player wondering why their Soul Deal words stopped appearing.
//
// Three exits, all explicit, none of them a swap: Switch (opens the picker),
// Read as ⟨system⟩ (re-binds THIS profile to the table — for the player whose
// D&D fighter really is what they want here), and Keep (says nothing more this
// session). No fourth exit changes the table's own setting from here: that is
// a room-wide act that belongs on the settings panel where every player can see
// it, not buried in one player's rack chrome.
function updateProfileBanner() {
  // The lobby counts: with no table, "the table's system" is this browser's own
  // solo setting (§11 X9), and all three exits work there.
  const m = profileMismatch();
  const on = !!m && !mismatchKept;
  const banner = document.getElementById('profile-banner');
  banner.classList.toggle('hidden', !on);
  groupsListEl.classList.toggle('profile-editing', on);
  if (!on) return;
  document.getElementById('profile-banner-name').textContent = m.name;
  document.getElementById('profile-banner-system').textContent = systemLabel(m.profileSystem);
  document.getElementById('profile-banner-table').textContent = systemLabel(m.tableSystem);
  const bind = document.getElementById('profile-bind');
  bind.textContent = `Read as ${systemLabel(m.tableSystem)}`;
  bind.title = `Re-bind '${m.name}' to ${systemLabel(m.tableSystem)} — the pools do not change, only which tables offer it`;
}

// ---------------------------------------------------------------------------
// The picker (§11.5 ②) — one builder, two anchors
// ---------------------------------------------------------------------------
//
// TWO anchors, and the second is not redundancy. #pools-head sits inside a
// panel section §7.23 lets the player switch off, so a pools-panel-only anchor
// is unreachable for anyone who collapsed Pools — a defect found by building
// the one-anchor design out and reading it back. The identity menu carries the
// other, and it is always there.
//
// Built with openRailMenu: the app's existing anchored-menu machinery, which
// already clamps to the viewport, flips above when it would clip, walks with
// the arrows, closes on focus-out rather than on Tab (a trap it has already
// been bitten by once), and is already a rung in the Esc chain and a term in
// modalOpen. A third menu implementation would have to earn all of that again.
//
// Off-system profiles render DISABLED, not absent: R5 says a profile is only
// pickable where its dice will be read the way they were chosen, and hiding
// them instead would answer "where did my fighter go" with silence.
function buildProfileMenu(el) {
  const sys = tableSystem();
  const mine = profilesFor(profileStore, sys);
  const others = profilesOf(profileStore).filter((p) => p.system !== sys);

  // .idm-item is the shared menu-item dress every menu in the app wears (the
  // identity menu, the offer menu, the recents list); .pm-head is the only new
  // recipe, and it borrows .plabel's ambient 10px caps.
  const head = (text) => {
    const h = document.createElement('div');
    h.className = 'pm-head';
    h.textContent = text;
    el.appendChild(h);
  };
  const row = (label, sub, onClick, { pressed = false, disabled = false, title = '' } = {}) => {
    const b = document.createElement('button');
    b.className = 'idm-item pm-row';
    b.disabled = disabled;
    b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', String(!!pressed));
    if (title) b.title = title;
    const n = document.createElement('span');
    n.className = 'pm-name';
    n.textContent = label;
    b.appendChild(n);
    if (sub) {
      const t = document.createElement('span');
      t.className = 'pm-sub';
      t.textContent = sub;
      b.appendChild(t);
    }
    if (!disabled) {
      b.addEventListener('click', () => {
        closeRailMenu(true);
        onClick();
      });
    }
    el.appendChild(b);
    return b;
  };

  head(systemLabel(sys));
  for (const p of mine) {
    const n = p.id === profileStore.activeId ? groups.length : (p.pools || []).length;
    row(p.name, `${n} pool${n === 1 ? '' : 's'}`, () => showProfileNote(switchToProfile(p.id)), {
      pressed: p.id === profileStore.activeId,
      title: p.id === profileStore.activeId ? 'These are the pools in your hands' : `Take '${p.name}' in hand`,
    });
  }
  row('⚄ Random…', '', () => showProfileNote(dealNewProfile(sys)), {
    disabled: isFull(profileStore),
    title: isFull(profileStore) ? `${MAX_PROFILES} profiles is the ceiling — delete one first` : `Deal a fresh ${systemLabel(sys)} profile`,
  });
  // CREATES, rather than opening the modal on an unrelated pane (C16). This
  // called openSettingsAtLibrary(), which covered the rack with Settings AND
  // force-expanded the YAML box — so the one row in the picker that promises
  // a new character delivered a text editor. It now mints an empty profile
  // under a dealt name and takes it in hand; ✎ on the head renames it, and
  // the rack is never left. `⚄ Random…` above already worked this way.
  row('＋ New profile…', '', () => showProfileNote(makeProfile({
    name: uniqueName(profileStore, dealName(sys)), system: sys, pools: [],
  })), {
    disabled: isFull(profileStore),
    title: isFull(profileStore)
      ? `${MAX_PROFILES} profiles is the ceiling — delete one first`
      : 'An empty profile, in your hands — build it with ✎ and rename it on the head',
  });
  // OTHER PLAYERS' CHARACTERS, ATTRIBUTED (Joe 2026-08-09). The switcher was
  // your own library only, so the one place you pick a character had nothing
  // to say about the five other people at the table holding theirs.
  //
  // Two rules, and the second is why the first is safe. ATTRIBUTION: a
  // profile you did not build says who did, right in the row, everywhere it
  // appears. COPY-ON-SELECT: taking one does not borrow it, it copies it into
  // your library under a deduped name, so editing it cannot reach back into
  // theirs — and the row SAYS so before you press, rather than reporting it
  // afterwards. That is the `#g=` lesson (GOALS §7): nothing arrives in your
  // rack without you knowing what arrived.
  const theirs = tableOffers().filter((o) => o.from !== 'prepared'
    && (!o.rec.system || o.rec.system === sys));
  const prepared = tableOffers().filter((o) => o.from === 'prepared'
    && (!o.rec.system || o.rec.system === sys));
  if (prepared.length) {
    head('Prepared for this table');
    for (const o of prepared) {
      const n = (o.rec.pools || []).length;
      row(o.rec.name, `${n} pool${n === 1 ? '' : 's'} · copies to yours`,
        () => showProfileNote(copyProfileIn(o.rec, { activate: true })),
        { title: `Take '${o.rec.name}' — a copy lands in your profiles, yours to edit` });
    }
  }
  if (theirs.length) {
    head('At this table');
    for (const o of theirs) {
      const n = (o.rec.pools || []).length;
      row(o.rec.name, `${o.from} · ${n} pool${n === 1 ? '' : 's'} · copies to yours`,
        () => showProfileNote(copyProfileIn(o.rec, { activate: true, from: o.from })),
        { title: `${o.from}'s '${o.rec.name}' — taking it copies it into your profiles, yours to edit` });
    }
  }
  if (others.length) {
    head('Other systems');
    for (const p of others) {
      row(p.name, systemLabel(p.system), () => {}, {
        disabled: true,
        title: `'${p.name}' was built for ${systemLabel(p.system)} — this table reads ${systemLabel(sys)}`,
      });
    }
  }
}

// THE INLINE RENAME (C16). The head's name becomes an input in place —
// Enter commits, Esc and blur abandon. Not a menu: PROFILES §11.5 ③ refused
// a rename field inside the picker because a menu closes on focus-out, and
// that refusal is right; the head is standing furniture and does not close.
function startProfileRename() {
  const mineNow = activeProfile(profileStore);
  if (!mineNow) return;
  const pick = document.getElementById('profile-pick');
  const ren = document.getElementById('profile-rename');
  const input = document.getElementById('profile-rename-in');
  input.value = mineNow.name;
  input.classList.remove('hidden');
  pick.classList.add('hidden');
  ren.classList.add('hidden');
  input.focus();
  input.select();
}
function endProfileRename(commit) {
  const input = document.getElementById('profile-rename-in');
  if (input.classList.contains('hidden')) return;
  const mineNow = activeProfile(profileStore);
  input.classList.add('hidden');
  if (commit && mineNow && input.value.trim() && input.value.trim() !== mineNow.name) {
    showProfileNote(renameProfileTo(mineNow.id, input.value));
  }
  renderGroups(); // repaints the head, which restores the pick and the ✎
}
document.getElementById('profile-rename').addEventListener('click', startProfileRename);
document.getElementById('profile-rename-in').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); endProfileRename(true); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endProfileRename(false); }
});
document.getElementById('profile-rename-in').addEventListener('blur', () => endProfileRename(false));

function openProfileMenu(e) {
  const anchor = e.currentTarget;
  if (isRailMenuOpen() && railMenuState.anchor === anchor) { closeRailMenu(true); return; }
  openRailMenu(anchor, buildProfileMenu);
}

// A profile verb's receipt, said where it can be seen. The library list's own
// status line when the settings modal is open; the transient status pill
// otherwise — the picker works with the modal closed, which is the whole point
// of it being a menu over the rack.
function showProfileNote(v) {
  const line = document.getElementById('profile-status');
  if (line) {
    line.textContent = v.status;
    line.classList.toggle('warn', !v.ok);
  }
  if (!document.getElementById('settings-modal').classList.contains('hidden')) return v;
  showSettingsNote(v.status);
  return v;
}

function openSettingsAtLibrary() {
  openSettings();
  const zone = document.getElementById('portable-zone');
  if (zone && zone.classList.contains('hidden')) {
    document.getElementById('portable-open').click();
  }
  const input = document.getElementById('profile-newname');
  if (input) input.focus();
}

// ---------------------------------------------------------------------------
// The library list (§11.5 ③) — Settings → Your data
// ---------------------------------------------------------------------------
//
// Manage-frequency work lives here rather than in the picker, for two reasons
// found by building the alternative: a menu that closes on focus-out is the
// wrong container for a rename field, and a 32-row list with a scroller is a
// panel wearing a menu's clothes.
//
// Delete is two-step IN PLACE — the label becomes 'Delete ⟨name⟩?' for three
// seconds and the second click commits. That is Copy's own morph grammar
// (js:portable-copy) used as a confirm, and it keeps the promise that nothing
// modal locks the table (goal: the table is never blocked).
let profileArmedDelete = null;
let profileDeleteTimer = null;
let profileRenaming = null;

function renderProfileLibrary() {
  const rows = document.getElementById('profile-rows');
  if (!rows) return;
  rows.textContent = '';
  const sys = tableSystem();
  for (const p of profilesOf(profileStore)) {
    const active = p.id === profileStore.activeId;
    const n = active ? groups.length : (p.pools || []).length;
    const row = document.createElement('div');
    row.className = 'pp-row';
    if (active) row.classList.add('editing');

    if (profileRenaming === p.id) {
      const input = document.createElement('input');
      input.className = 'tin';
      input.type = 'text';
      input.maxLength = 24;
      input.value = p.name;
      input.autocomplete = 'off';
      const commit = () => {
        const v = renameProfileTo(p.id, input.value);
        profileRenaming = null;
        showProfileNote(v);
        renderProfileLibrary();
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') { ev.preventDefault(); profileRenaming = null; renderProfileLibrary(); }
      });
      const ok = document.createElement('button');
      ok.className = 'btn tiny confirm';
      ok.textContent = 'Rename';
      ok.addEventListener('click', commit);
      row.append(input, ok);
      rows.appendChild(row);
      setTimeout(() => input.focus(), 0);
      continue;
    }

    const nameEl = document.createElement('button');
    nameEl.className = 'pp-name pp-rename';
    nameEl.textContent = p.name;
    nameEl.title = 'Rename';
    nameEl.addEventListener('click', () => { profileRenaming = p.id; renderProfileLibrary(); });

    const sysEl = document.createElement('span');
    sysEl.className = 'pp-tag pp-sys';
    sysEl.textContent = systemLabel(p.system);
    if (p.system !== sys) sysEl.classList.add('off');

    const countEl = document.createElement('span');
    countEl.className = 'pp-count';
    countEl.textContent = `${n} pool${n === 1 ? '' : 's'}`;
    row.append(nameEl, sysEl, countEl);

    if (active) {
      const tag = document.createElement('span');
      tag.className = 'pp-tag';
      tag.textContent = 'in hand';
      row.append(tag);
    } else {
      const use = document.createElement('button');
      use.className = 'btn tiny';
      use.textContent = 'Use';
      use.disabled = p.system !== sys;
      use.title = p.system === sys
        ? `Take '${p.name}' in hand — the pools you have now stay with '${activeProfileName()}'`
        : `'${p.name}' was built for ${systemLabel(p.system)} — this table reads ${systemLabel(sys)}`;
      use.addEventListener('click', () => showProfileNote(switchToProfile(p.id)));
      row.append(use);
    }

    const copy = document.createElement('button');
    copy.className = 'btn tiny';
    copy.textContent = 'Copy';
    copy.title = `Add a second copy of '${p.name}' — a variant to edit without touching this one`;
    copy.addEventListener('click', () => showProfileNote(copyProfileIn(toWire(
      p.id === profileStore.activeId ? { ...p, pools: groups } : p,
    ))));
    row.append(copy);

    const del = document.createElement('button');
    del.className = 'btn tiny pp-del';
    const armed = profileArmedDelete === p.id;
    del.textContent = armed ? `Delete ${p.name}?` : '✕';
    del.title = `Delete '${p.name}'`;
    del.addEventListener('click', () => {
      clearTimeout(profileDeleteTimer);
      if (!armed) {
        profileArmedDelete = p.id;
        renderProfileLibrary();
        profileDeleteTimer = setTimeout(() => { profileArmedDelete = null; renderProfileLibrary(); }, 3000);
        return;
      }
      profileArmedDelete = null;
      showProfileNote(removeProfileById(p.id));
      renderProfileLibrary();
    });
    row.append(del);
    rows.appendChild(row);
  }

  const count = document.getElementById('profile-count');
  if (count) count.textContent = `${profilesOf(profileStore).length} of ${MAX_PROFILES}`;
  renderTableProfiles();
}

// 'At this table' — the prepared seats and the teammates' published racks, each
// one Copy away from being mine (§11 P10/P11/P12). ABSENT when there is nothing
// at the table: empty renders nothing, and a heading over no rows is prose.
function renderTableProfiles() {
  const zone = document.getElementById('table-profiles');
  const rows = document.getElementById('table-profile-rows');
  if (!zone || !rows) return;
  rows.textContent = '';
  const offers = [];
  for (const o of tableOffers()) {
    offers.push({ label: o.rec.name, sub: o.from === 'prepared' ? 'prepared' : o.from, rec: o.rec });
  }
  for (const pl of players) {
    if (!pl || pl.id === (net && net.playerId) || !Array.isArray(pl.pools) || !pl.pools.length) continue;
    offers.push({
      label: pl.profile || pl.name,
      sub: pl.profile ? pl.name : 'their rack',
      rec: { name: pl.profile || pl.name, system: pl.system || null, set: pl.set || null, pools: pl.pools },
    });
  }
  zone.classList.toggle('hidden', !offers.length);
  if (!offers.length) return;
  for (const o of offers) {
    const row = document.createElement('div');
    row.className = 'pp-row';
    const nameEl = document.createElement('span');
    nameEl.className = 'pp-name';
    nameEl.textContent = o.label;
    const sysEl = document.createElement('span');
    sysEl.className = 'pp-tag pp-sys';
    sysEl.textContent = o.rec.system ? systemLabel(o.rec.system) : o.sub;
    const n = (o.rec.pools || []).length;
    const countEl = document.createElement('span');
    countEl.className = 'pp-count';
    countEl.textContent = `${n} pool${n === 1 ? '' : 's'}`;
    const copy = document.createElement('button');
    copy.className = 'btn tiny';
    copy.textContent = 'Copy';
    copy.title = `Add '${o.label}' to your library — nothing of yours is touched`;
    copy.addEventListener('click', () => showProfileNote(copyProfileIn(o.rec)));
    row.append(nameEl, sysEl, countEl, copy);
    rows.appendChild(row);
  }
}

// The banner's three exits.
document.getElementById('offer-take').addEventListener('click', openProfileMenu);
document.getElementById('offer-dismiss').addEventListener('click', dismissOffer);
document.getElementById('profile-switch').addEventListener('click', openProfileMenu);
document.getElementById('profile-bind').addEventListener('click', () => showProfileNote(bindActiveToTable()));
document.getElementById('profile-keep').addEventListener('click', () => {
  mismatchKept = true;
  updateProfileBanner();
});

document.getElementById('profile-new').addEventListener('click', () => {
  const input = document.getElementById('profile-newname');
  const v = makeProfile({ name: input.value, system: tableSystem(), pools: [] });
  if (v.ok) input.value = '';
  showProfileNote(v);
  renderProfileLibrary();
});
document.getElementById('profile-newname').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('profile-new').click(); }
});
document.getElementById('profile-deal').addEventListener('click', () => {
  // THE NAME BOX GOVERNS BOTH BUTTONS (C9). It sits in one row with `＋ New`
  // and `⚄ Random`; `＋ New` read it and Random did not, so the realistic
  // six-character path — Random gives you a PRICED rack, `＋ New` gives you
  // an empty one — was Random, then rename, six times. The box is one input
  // in one row: a control beside it that ignores it is a control that lies
  // about what the row is for.
  const input = document.getElementById('profile-newname');
  const v = dealNewProfile(tableSystem(), input.value);
  if (v.ok) input.value = '';
  showProfileNote(v);
  renderProfileLibrary();
});
document.getElementById('profile-pick').addEventListener('click', openProfileMenu);
document.getElementById('import-adopt-all').addEventListener('click', () => portableAdoptProfiles());


// WHAT THE BOX LAST HELD BY OUR OWN HAND (C9). The box is two things wearing
// one textarea: a snapshot of YOUR data, and a file somebody sent you. Apply
// to table reads whichever is there, and the box only ever refilled on first
// open / Fill with my data / Open file — so editing a character after opening
// the pane sent the room the PRE-EDIT set, while `Download` an inch away read
// live. Two buttons in one row disagreeing about what your data is.
//
// Remembering the exact text we filled is what lets the refresh be safe: an
// untouched own-data box is re-snapshotted before it is sent, and a box
// holding a file — or your own edits — is sent exactly as it reads. The
// alternative (always re-snapshot) would silently discard an opened file,
// which is the worse failure by a distance.
let portableFilledText = null;
function fillPortableBox() {
  portableFilledText = portableSnapshot();
  portableText.value = portableFilledText;
  portablePreview();
}

document.getElementById('portable-open').addEventListener('click', () => {
  const opening = portableZone.classList.toggle('hidden') === false;
  if (opening && !portableText.value) fillPortableBox();
});
document.getElementById('portable-export').addEventListener('click', fillPortableBox);
document.getElementById('portable-copy').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(portableText.value);
    btn.textContent = 'Copied!';
  } catch {
    portableText.select(); // clipboard refused (permissions): hand it over selected
  }
  setTimeout(() => { btn.textContent = 'Copy'; }, 900);
});
portableText.addEventListener('input', portablePreview);
portableApplyBtn.addEventListener('click', () => {
  if (!portablePlan) return;
  const done = applyImportPlan(portablePlan);
  portableStatus.textContent = `✓ applied — ${done.join(' · ') || 'settings'}`;
  portablePlan = null;
  portableApplyBtn.disabled = true;
});

// ---------------------------------------------------------------------------
// Collapsible chrome: ONE region since the panel merge — Pools (the draft
// row over the saved list) — toggled from its header (key n; b/g silent
// aliases), per-user state in 'dice.panels.v1' (legacy two-region state
// migrates open-if-either-was; stale keys are ignored because the seed
// below iterates PANEL_DEFS. The roster is rail furniture; the roll log is
// the rail's ≣ flyout.) Collapsed, a panel rests as a small
// labelled edge tab. Compact view is no longer a mode: body.mini is the
// EMERGENT all-collapsed state (it scales the ambient chrome and reframes
// the camera; it hides nothing — the rail and the tabs stay, and ceremonies
// render identically).
// ---------------------------------------------------------------------------

const LS_PANELS = 'dice.panels.v1';
const LS_MINI = 'dice.mini.v1'; // legacy compact-view preference — migration only

// ONE region since the panel merge (2026-07-31): the Pools panel carries
// the draft as its first row and the saved list beneath. Since 2026-08-04
// the region IS the side-panel column: collapsed rides #left-panel (the
// slim icon rail), and the divider strip #edge-toggle is the click target
// (the old head-compose title row is gone).
const PANEL_DEFS = {
  pools: { el: 'left-panel' },
};

// Open/collapsed per region. Seeded once, exactly like the old mini seed: a
// stored state wins; else the legacy mini preference (true = all collapsed)
// or a small viewport starts everything collapsed.
let panelsOpen = (() => {
  const stored = load(LS_PANELS, null);
  const st = {};
  if (stored && typeof stored === 'object') {
    // Legacy two-region state migrates: Pools is open if EITHER was.
    if (!('pools' in stored) && ('compose' in stored || 'groups' in stored)) {
      st.pools = stored.compose !== false || stored.groups !== false;
      return st;
    }
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
// LET, not const: zoom rewrites the eye preset so the walker's angle stays
// fixed (every entry keeps y/z ≈ 1.74). applyCameraFraming's step-back still
// runs after — it just starts from the closer eye at 'medium'/'close'.
let CAM_EYE = { full: [0, 13.2, 7.6], mini: [0, 10.9, 6.1] }; // the DEFAULT ('medium')
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
  const w = Math.max(view.width, 1); // pills live over the FELT, not the window
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
  // Manage mode is transient (P2): collapsing the pools panel exits it, so
  // the panel always reopens read-only.
  if (!panelsOpen.pools && poolsEdit) setPoolsEdit(false);
  // The tray's per-die ✕ overlays anchor to laid-out die positions, which
  // are all zero while the panel is collapsed — re-anchor on expand.
  // Expanding also drops the rail's picks (2i-G): the workbench is the
  // composing surface, and a half-pick carried across the boundary would be
  // state visible in neither place. railClearSel updates the bar itself,
  // because renderRailPools returns early once the panel is open.
  if (panelsOpen.pools) { railClearSel(); railDice = []; railModeVisit = null; renderTray(); }
  else renderRailColumn(); // the collapsed rail carries both source lists
  const et = document.getElementById('edge-toggle');
  et.setAttribute('aria-expanded', String(!!panelsOpen.pools));
  et.title = panelsOpen.pools ? 'Collapse the panel — n' : 'Expand the panel — n';
  if (persist) save(LS_PANELS, panelsOpen);
  // Compact view stays EMERGENT (body.mini = everything collapsed) and must
  // flip BEFORE the refit: applyCameraFraming reads it for the eye preset.
  document.body.classList.toggle('mini', allPanelsCollapsed());
  // The panel is LAYOUT: any toggle moves the felt's edge, so every toggle
  // refits the camera, renderer and all screen-anchored furniture.
  // An on-stage ceremony needs nothing: it keeps playing, re-scaled (§7.4).
  refitView();
}

function setPanel(id, open, persist = true) {
  if (!(id in PANEL_DEFS)) return false;
  panelsOpen[id] = !!open;
  applyPanels(persist);
  return panelsOpen[id];
}

// Key 'm' (old compact-view muscle memory): everything collapsed reopens
// everything; anything open collapses everything. The rail's ⤡ button is
// deleted — the two panel edge tabs are the visible replacement, and the
// cheatsheet keeps the 'm' row.
function toggleAllPanels() {
  const open = allPanelsCollapsed();
  for (const k of Object.keys(PANEL_DEFS)) panelsOpen[k] = open;
  applyPanels();
}

// The divider strip is the one pointer target for collapse/expand (the
// title row died with the overlay; keys n/m keep their muscle memory).
document.getElementById('edge-toggle').addEventListener('click', () => {
  setPanel('pools', !panelsOpen.pools);
});

// The collapsed rail's one verb.
// The verb acts on whichever list is ON SCREEN — the same rule Enter, Esc and
// the digits follow. (This was bound straight to rollRailSelection, so a dice
// pick armed the bar and then nothing happened when it was pressed. The
// railRoll debug hook branched correctly, which is exactly why the scenario
// missed it: it drove the hook instead of the button.)
document.getElementById('rail-roll').addEventListener('click', () => {
  if (railMode() === 'dice') rollRailDice(); else rollRailSelection();
});

// (The collapsed-tab hover flyout retired 2026-08-04 with the overlay
// panel: expanding the column is cheap now — the felt resizes instead of
// being covered — and the collapsed rail carries its own quick list.)

applyPanels(false); // reflect the seeded state without re-saving (refits too)

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

// ---------------------------------------------------------------------------
// MODAL SEMANTICS (U22, audit D3). One trap, every blocking surface.
//
// The app had SIX modal-ish surfaces, zero focus containment, and exactly one
// `aria-modal="true"` — on #help-overlay, which had no trap either. That
// annotation is a promise to assistive tech that the rest of the page is not
// there, and Tab walked straight into content AT had been told did not exist:
// focus real, speech silent. An honest un-annotated dialog beats a lying
// annotated one, so the rule here is that `aria-modal` and the trap ship
// together or neither ships.
//
// `inert` on the background does the containment for real — it removes the
// rest of the page from the tab order, from hit-testing AND from the
// accessibility tree in one property, which is the thing three separate
// hand-rolled mechanisms would each get subtly wrong. The Tab wrap below is
// still needed because `inert` bounds where focus may GO, not where it wraps.
// ---------------------------------------------------------------------------
const modalStack = [];

function focusablesIn(root) {
  return [...root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),'
    + ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function openModal(el, { label = null, labelledBy = null, focus = null } = {}) {
  if (!el || modalStack.some((m) => m.el === el)) return;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  if (labelledBy) el.setAttribute('aria-labelledby', labelledBy);
  else if (label) el.setAttribute('aria-label', label);
  // Every OTHER body child goes inert. Siblings, not a blanket on <body> —
  // inert is inherited, so marking the ancestor would silence the dialog too.
  const muted = [...document.body.children].filter((c) => c !== el && !c.inert);
  muted.forEach((c) => { c.inert = true; });
  modalStack.push({ el, muted, returnTo: document.activeElement });
  const first = focus || focusablesIn(el)[0] || el;
  if (first === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  try { first.focus({ preventScroll: true }); } catch { /* not focusable */ }
}

function closeModal(el) {
  const i = modalStack.findIndex((m) => m.el === el);
  if (i < 0) return;
  const [m] = modalStack.splice(i, 1);
  m.muted.forEach((c) => { c.inert = false; });
  el.removeAttribute('aria-modal');
  // FOCUS GOES BACK TO WHAT OPENED IT. Without this it falls to <body> and
  // the next Tab restarts at the top of the document — the same defect the
  // rail's re-render has, and the reason a keyboard player pays a full
  // tab-walk for every dialog they close.
  if (m.returnTo && m.returnTo.isConnected) {
    try { m.returnTo.focus({ preventScroll: true }); } catch { /* gone */ }
  }
}

// Tab wraps inside the top modal. `inert` already stops focus LEAVING the
// dialog, but without a wrap the last Tab parks focus on the browser chrome
// and the next one comes back at the top of the document.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !modalStack.length) return;
  const { el } = modalStack[modalStack.length - 1];
  const items = focusablesIn(el);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0], last = items[items.length - 1];
  if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
}, true);

const kbdOverlay = document.getElementById('kbd-overlay');

function isKbdOpen() { return !kbdOverlay.classList.contains('hidden'); }
function toggleKbd() {
  if (isKbdOpen()) closeKbd();
  else { kbdOverlay.classList.remove('hidden'); openModal(kbdOverlay, { labelledBy: 'kbd-title' }); }
}
function closeKbd() {
  kbdOverlay.classList.add('hidden');
  closeModal(kbdOverlay);
}

kbdOverlay.addEventListener('click', (e) => {
  if (e.target === kbdOverlay) closeKbd();
});

// HELP (Joe 2026-08-06): one dialog, sectioned; openers pass a topic and
// the section lights + scrolls. In-dialog anchors only — the URL carries
// nothing beyond ?room= (GOALS §7).
const helpOverlay = document.getElementById('help-overlay');
function isHelpOpen() { return !helpOverlay.classList.contains('hidden'); }
function closeHelpDialog() {
  helpOverlay.classList.add('hidden');
  closeModal(helpOverlay);
}
function openHelpDialog(topic) {
  helpOverlay.classList.remove('hidden');
  openModal(helpOverlay, { labelledBy: 'help-title' });
  helpOverlay.querySelectorAll('#help-body section').forEach((el) => el.classList.remove('lit'));
  const sec = topic ? document.getElementById(`help-${topic}`) : null;
  if (sec) {
    sec.classList.add('lit');
    sec.scrollIntoView({ block: 'start' });
  } else {
    document.getElementById('help-body').scrollTop = 0;
  }
}
helpOverlay.addEventListener('click', (e) => {
  if (e.target === helpOverlay) closeHelpDialog();
});
document.getElementById('help-close').addEventListener('click', closeHelpDialog);
document.getElementById('rail-help').addEventListener('click', () => openHelpDialog(null));
document.getElementById('help-nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-topic]');
  if (b) openHelpDialog(b.dataset.topic);
});

// The ONE reroll payload. Every reroll trigger — the card strip
// (appendCardActions), the log ⟳, the 'r' shortcut / verdict ⟳
// (rerollLast) — replays the same intent: dice ride the call, and this
// carries mods, attribution, privacy, target, moment, and provenance. A
// site building its own would drift into an unmarked reroll (the payload
// was duplicated verbatim at three sites before rerollOfId arrived).
function rerollOpts(entry) {
  return {
    mods: entry.spec.mods || undefined,
    sources: entry.spec.sources || undefined, // 2b-⑤: attribution rides the reroll
    faceDown: entry.faceDown,
    visibility: entryVis(entry) || undefined, // …and the privacy
    dc: Number.isInteger(entry.dc) ? entry.dc : undefined,
    exp: entry.spec.exp || undefined, // a rerolled Check comes back a Check
    rerollOfId: entry.rollId || undefined, // a CLAIM; the server substantiates it
    // §9: per-die pool skins are part of the spec being rerolled — the
    // pool's die stays the pool's die; the roll-level set stays the
    // RE-roller's own (the shipped stamped-fresh rule).
    sets: Array.isArray(entry.sets) && entry.sets.length ? entry.sets : undefined,
  };
}

// Reroll the last roll — the same spec the banner ⟳ / verdict button use.
function rerollLast() {
  const entry = lastEntry;
  if (!canReroll(entry)) return;
  requestRoll([...entry.spec.dice], entry.label, rerollOpts(entry));
}

// The fluid-play pair (2026-07 keyboard design): once a roll SETTLES, Enter
// KEEPS it (collect to the shelf) and Esc SWEEPS it (clear) — the
// affirmative/dismissive verbs every dialog already trained, so the common
// loop is hands-on-keyboard: type/1-9 → roll → read → Enter or Esc → next.
// Gated hard, in this order: never while typing or over a focused control
// (Enter must not double-fire a button), never with a layer open (Esc peels
// those first), only YOUR roll, only settled, only still on the felt.
function lastRollActionable() {
  if (!lastEntry || !lastEntry.rollId) return null;
  if (currentRoll && !currentRoll.done) return null; // in flight: Space skips
  const st = rollStates.get(lastEntry.rollId);
  if (st && (st.cleared || st.collected !== null)) return null; // already resolved
  const mine = !netOnline || (net && lastEntry.playerId === net.playerId);
  return mine ? lastEntry : null;
}

// Single global keydown handler. Layer guards are checked BEFORE any handler
// mutates state, so one Esc can never fall through two layers:
//   Esc peels the topmost layer only — cheatsheet > palette > settings modal
//   > peek card > ± popover > log flyout (extends the earlier popover/modal
//   layering fix; the peek slots in above the popover per §7.7.1, and the
//   flyout closes LAST because it sits at the BOTTOM of the overlay z-order
//   (--z-flyout) — everything stacked above it peels first).
// Table shortcuts fire only with no text input focused and no layer open
// (the ± popover counts as open UI). The log flyout is deliberately NOT
// such a layer: glancing at the log is exactly when you reroll, so 'r' and
// the digits stay live while it is open — it captures Esc only, via the
// chain. Space keeps its skip-ceremony handler.
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
    if (isHelpOpen()) closeHelpDialog(); // help rides above its opener
    else if (isKbdOpen()) closeKbd();
    else if (isPaletteOpen()) closePalette();
    else if (!settingsModal.classList.contains('hidden')) closeSettingsModal();
    else if (isIdentityMenuOpen()) closeIdentityMenu();
    else if (isOfferMenuOpen()) closeOfferMenu();
    else if (isRailMenuOpen()) closeRailMenu(true); // the lobby's New table / Tables ▾
    // a shelf-bound popover rides ON the peek: peel it first, the card next
    else if (pop && pop.source === 'shelf') closePopover();
    else if (isPeekOpen()) closePeek();
    else if (pop) closePopover();
    // The pinned log flyout is the END of the chain: it rides the bottom of
    // the overlay z-order, so every layer above it peels first. Esc is one
    // of its only three closes (≣ toggle, header ✕, Esc — never a click-away).
    else if (isLogFlyoutOpen()) closeLogFlyout();
    // The rail's picks are the collapsed twin of the staged draft below, and
    // peel at the same rung: Esc drops what you picked before it sweeps the
    // felt, so a mis-tap never costs you a roll.
    else if (railMode() === 'dice' && railDice.length) { railDice = []; renderRailColumn(); }
    else if (railSel.size) railClearSel();
    // The staged draft empties before the table sweeps: Esc mirrors Enter's
    // draft-first priority.
    else if (tray.length || cmdInput.value) clearDraft();
    else {
      // Nothing left to peel: Esc SWEEPS your last settled roll (the
      // keyboard pair with Enter = keep — see lastRollActionable). A no-op
      // when the roll is not yours, already gone, or still in flight.
      const last = lastRollActionable();
      if (last) requestClearRoll(last.rollId);
    }
    return;
  }
  if (typing) return;

  const modalOpen = !settingsModal.classList.contains('hidden')
    || !document.getElementById('name-modal').classList.contains('hidden')
    // A MENU OWNS THE KEYBOARD WHILE IT IS UP. None of these has an input to
    // make `typing` true, so without them a stray `c` sweeps the felt for the
    // whole table underneath a menu the player is reading. The comment here
    // named that hazard while covering ONE of the three menus; the other two
    // predicates already existed a few lines up, in the Esc ladder.
    || isRailMenuOpen()
    || isIdentityMenuOpen()
    || isOfferMenuOpen();

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
    // Through the BUTTON, so the key and the control are one path: `c c`
    // does what two presses do, and the arm is not a mouse-only affordance.
    case 'c': document.getElementById('corner-clear').click(); return;
    case 'm': toggleAllPanels(); return;
    // 'n' is the documented key; 'b' and 'g' survive as silent aliases for
    // the old two-panel muscle memory (they toggled Compose / Saved pools).
    case 'n':
    case 'b':
    case 'g': setPanel('pools', !panelsOpen.pools); return;
    case 'l': toggleLogFlyout(); return; // the roll log is a rail flyout now, not a panel
    case 's': setSound(!soundOn); return;
    case 'Enter': {
      // A focused button owns Enter (it activates); the table takes the
      // spare. The staged DRAFT outranks the last roll: Enter GOES when
      // dice are staged ('1 4 6 Enter'), else it KEEPS the last roll
      // (Esc's affirmative twin).
      if (e.target instanceof HTMLElement && e.target.closest('button, a, [tabindex]')) return;
      // The rail's selection outranks the draft: it is the thing you can
      // SEE while collapsed, and firing a hidden draft instead would be a
      // roll from nowhere. (Must sit after the focused-button guard above,
      // or Enter on a focused .rp-item would roll AND re-toggle the row.)
      if (railMode() === 'dice') { if (railDice.length) { rollRailDice(); return; } }
      else if (railSel.size) { rollRailSelection(); return; }
      if ((cmdResult && cmdResult.ok) || tray.length > 0) {
        // …and a draft you cannot see never fires silently either: surface
        // the workbench that holds it and pulse its roll button instead.
        if (!panelsOpen.pools) { setPanel('pools', true); pulseTrayRoll(); return; }
        rollDraft();
        return;
      }
      const last = lastRollActionable();
      if (last) requestCollectRoll(last.rollId);
      return;
    }
    default:
      if (e.key >= '1' && e.key <= '9') {
        // Digits do the panel's own verb: STAGE into the draft when the
        // workbench is open, SELECT in the rail when it is not — the same map
        // either way, so a sequence means the same roll in both states.
        // The nine are shared ACROSS shelves (U24, digitPools): on the rack
        // the app deals that is 3/3/3, so `1 4 7 Enter` is an attribute, a
        // skill and a motivation. Spent on the flat rendered order they were
        // nine attributes, and the canonical Soul Deal roll could not be
        // typed at all.
        const g = renderedPools[Number(e.key) - 1];
        if (g) {
          if (panelsOpen.pools) stageGroup(g);
          else if (railMode() === 'dice') {
            if (groups.length) { railModeVisit = 'pools'; renderRailColumn(); railToggle(g); }
          } else railToggle(g);
        }
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

// LS_NAME, ROOM and IN_LOBBY are all declared at the top of the file, not here
// where the rest of the net constants live — the module-evaluation TDZ trap is
// recorded there. (LS_NAME moved up 2026-08-08: the profile library's
// migration names the migrated rack after the player, and that runs during the
// rack's own module-eval block.)

// §G6 client half: the last setup THIS BROWSER pushed to THIS room, kept as
// the exact wire body beside its rev. localStorage (not session): "prep
// Tuesday, play Thursday" means outliving the tab. Written in exactly one
// place — a push that the server APPLIED (portablePushToTable) — which is
// the whole authorship rule: a player who merely joined a prepared table, or
// applied a seat, never gets a record here and so can never start re-pushing
// a setup they did not author. Null in the lobby: there is no room to hold a
// setup for, and keying it off the old 'table' default would have made the
// lobby read and write the REAL shared room's record.
const LS_TABLE = IN_LOBBY ? null : `dice.table.v1:${ROOM}`;

function storedTable() {
  if (!LS_TABLE) return null;
  const v = load(LS_TABLE, null);
  return v && typeof v === 'object' && !Array.isArray(v) && Number.isInteger(v.rev) && v.rev >= 1
    ? v : null;
}

// Re-push on hello (§G6, PROFILES §5 mechanism 2): the organizer's browser is
// the durable copy, so a restarted server self-heals the moment this tab
// reconnects. Fires only when the room is BEHIND the stored record — setup
// absent (rev 0) or lower rev — and re-sends the SAME rev, not rev+1: it is
// the same setup, not a new one, and G4's conflict rule makes losing a race
// (two organizer tabs healing at once, or a fresher push landing first) a
// silent no-op answering the winning rev. No conflict UI by design — the
// loser did nothing wrong and the room already holds something at least as
// new; the 'table-setup' echo of whichever push won updates roomSetup for
// everyone. Returns the push promise (null when there is nothing to do) so
// the debug hook can await the heal.
let repushInFlight = false;
function maybeRepushTable() {
  if (!netOnline || !net || repushInFlight) return null;
  const stored = storedTable();
  if (!stored) return null;
  const roomRev = roomSetup && Number.isInteger(roomSetup.rev) ? roomSetup.rev : 0;
  if (roomRev >= stored.rev) return null;
  repushInFlight = true;
  return net.pushTable({ rev: stored.rev, table: stored.table || {}, profiles: stored.profiles || [] })
    .finally(() => { repushInFlight = false; });
}

// net / netOnline / players are declared beside the owner switcher above —
// the module-scope renderGroups() boot call reads the roster.
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
const ROSTER_MAX = 6; // pills shown before the tail folds into +N — raised
// 2026-08-04 when pills became functional (browse teammates' pools). Real
// table sizes are ≤6 for Soul Deal / D&D; overflow past 6 is a documented
// gap in ROADMAP §2k.
function renderPlayers() {
  rosterEl.innerHTML = '';
  repaintAwayVerbs(); // a departure can make a roll on screen clearable (U19)
  // …and the roster IS where the table's characters come from since C17, so
  // someone arriving with a library, or leaving with one, changes the offer.
  updateOfferBanner();
  const you = net ? net.playerId : null;
  const others = players.filter((p) => p.id !== you);
  for (const p of others.slice(0, ROSTER_MAX)) {
    // TEAMMATE PILL, functional (2026-08-04): the rail pill IS the browse
    // verb — click loads their pools; press again to fall home. Toggle
    // semantics + aria-pressed reflect the poolsOwner state, so the pill
    // says visibly which teammate you are viewing. Disabled in manage mode:
    // browsing is a USE verb and must never silently discard an open editor
    // (mirrors the retired owner-chip's own gate).
    const pill = document.createElement('button');
    pill.className = 'roster-name';
    pill.setAttribute('aria-pressed', String(p.id === poolsOwner));
    pill.disabled = poolsEdit;
    const dot = document.createElement('span');
    dot.className = 'roster-dot';
    dot.style.background = p.color || '#888';
    pill.appendChild(dot);
    pill.appendChild(document.createTextNode(p.name)); // user-supplied: text only
    pill.title = p.id === poolsOwner ? `Back to your pools` : `Browse ${p.name}'s pools`;
    pill.addEventListener('click', () => {
      setPoolsOwner(p.id === poolsOwner ? null : p.id);
    });
    rosterEl.appendChild(pill);
  }
  if (others.length > ROSTER_MAX) {
    // Overflow past ROSTER_MAX (6): the fold is inert on purpose (no click)
    // — pill browsing past the fold is a real hole (recorded in ROADMAP §2k
    // as a standing follow-up); the count is at least still legible via
    // hover. Practical tables never hit this at 6.
    const more = document.createElement('span');
    more.className = 'roster-more';
    more.textContent = `+${others.length - ROSTER_MAX}`;
    more.title = others.slice(ROSTER_MAX).map((p) => p.name).join(', ');
    rosterEl.appendChild(more);
  }
  // THE ROW'S EMPTY STATE IS AN AFFORDANCE, NOT A SENTENCE (§7.20). This row
  // already asks "who is here"; when the answer is "nobody yet" it carries the
  // fix, in the same slot where the people will appear — and every pill below
  // is retired by its own success, which is what keeps it out of the
  // standing-chrome trap that killed .tray-invite and #groups-empty.
  renderPresenceExits(others.length);
  // An open whisper picker tracks the live roster (joins/leaves/renames).
  if (pop && pop.vis && pop.vis.mode === 'whisper') renderPop();
  updateIdentityChip(); // the rail chip mirrors the roster's name + color
  updateTrayButtons(); // the ▾ offer picker appears/leaves with teammates
  if (isOfferMenuOpen()) closeOfferMenu(); // never target a stale roster
  // ...and neither may the rail menu OUTLIVE ITS ANCHOR. This function clears
  // rosterEl, so every re-render destroys the '+ New table' / 'Tables ▾' button
  // the open menu is anchored to and leaves it floating over nothing. Not
  // hypothetical in the lobby, where there are no roster events but toggling
  // '✎ Edit pools' re-renders this row (setPoolsOwner and the manage-mode
  // gates all land here). Same rule the set menu keeps: a menu must not
  // outlive its anchor.
  if (isRailMenuOpen()) closeRailMenu();
}

// One dashed pill in a roster pill's geometry — the shared body of every
// presence-row exit. A real <button>, so the tab order reaches it right after
// your own chip and Space/Enter work without further ceremony.
// The label lives in its OWN span, never as a bare text node on the button.
// shareInvite swaps the label to 'Copied!' and back, and a `btn.textContent =`
// would take the whole subtree with it — on a seat chair that means the .rg-dot
// is deleted by the first copy and never returns.
function railGhost(label, title, onClick, { dot = false } = {}) {
  const b = document.createElement('button');
  b.className = 'rail-ghost';
  b.title = title;
  if (dot) {
    const d = document.createElement('span');
    d.className = 'rg-dot';
    b.appendChild(d);
  }
  const span = document.createElement('span');
  span.className = 'rg-label';
  span.textContent = label; // user text (a seat name) — textContent only
  b.appendChild(span);
  b.addEventListener('click', onClick);
  return b;
}

// Where a transient label swap is allowed to write. A rail ghost owns a label
// span; the identity menu's plain item does not, and writes to itself.
const labelNodeOf = (btn) => (btn && btn.querySelector && btn.querySelector('.rg-label')) || btn;

// The prepared seats nobody is sitting in: roomSetup.profiles minus the live
// roster, matched case-insensitively the way §G5's &as= pre-select matches.
// Entirely client-side — both halves are already in hand, so this needs no
// endpoint, no wire key and no new state.
function unclaimedSeats() {
  if (!netOnline || !roomSetup || !Array.isArray(roomSetup.profiles)) return [];
  const taken = new Set(players.map((p) => String(p.name || '').trim().toLowerCase()));
  return roomSetup.profiles
    .map((p) => (p && typeof p.name === 'string' ? p.name.trim() : ''))
    .filter((n) => n && !taken.has(n.toLowerCase()));
}

// Copy — or hand off. navigator.share is the right verb on a TOUCH device
// (CUJ2 is literally "somehow get all the players to join", and on a phone
// that is the share sheet); on a desktop it would pop an OS dialog where the
// player expected a clipboard, so it is gated on a device with no hover.
// A cancelled share is a decision, not a failure: it does NOT fall through to
// a copy the player did not ask for.
async function shareInvite(url, btn, restoreLabel) {
  if (!url) return;
  if (navigator.share && window.matchMedia('(hover: none)').matches) {
    try { await navigator.share({ url }); return; } catch (err) {
      if (err && err.name === 'AbortError') return;
      /* anything else: fall through to the clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt('Copy this invite link:', url); // never leave the link unreachable
    return;
  }
  if (!btn) return;
  // Re-entrant by construction: a second click inside the 900 ms window must
  // not queue a restore that writes 'Copied!' back as the resting label, so the
  // pending timer is cancelled rather than raced.
  clearTimeout(btn.__restoreTimer);
  labelNodeOf(btn).textContent = 'Copied!';
  btn.classList.add('done');
  btn.__restoreTimer = setTimeout(() => {
    labelNodeOf(btn).textContent = restoreLabel;
    btn.classList.remove('done');
  }, 900);
}

// The three presence states, in the one slot (§7.20). Ordered by how much the
// player can do about it: the lobby has exits, an empty table has an invite,
// and a table with no server has neither — there the status pill speaks,
// because a readout is the right object when there is no action to offer.
function renderPresenceExits(othersCount) {
  if (IN_LOBBY) {
    if (othersCount) return; // no roster exists without a room; belt and braces
    const nt = railGhost('+ New table', 'Start a table and get a link to share', openNewTable);
    nt.setAttribute('aria-haspopup', 'menu');
    nt.setAttribute('aria-expanded', 'false');
    rosterEl.appendChild(nt);
    if (recentTables().length) {
      const b = railGhost('Tables ▾', 'Tables you have been to', (e) => openTablesMenu(e.currentTarget));
      b.setAttribute('aria-haspopup', 'menu');
      b.setAttribute('aria-expanded', 'false');
      rosterEl.appendChild(b);
    }
    return;
  }
  if (!netOnline || !net) return; // asked for a table, got no server — see initNet

  // A PREPARED TABLE SHOWS ITS EMPTY CHAIRS FOR AS LONG AS THEY ARE EMPTY —
  // NOT only while you are alone. The first arrival must not take the other
  // five chairs off the wall: an organizer with six prepared seats and two
  // players present still has four people to fetch, and the row's whole value
  // is being a live read of who is still missing. These retire PER CHAIR, as
  // each seat is claimed, which is the same "retired by its own success"
  // property the Invite pill has — just at the grain of a seat rather than the
  // row. (Corrected 2026-08-07 after testing: the original `!others.length`
  // gate made the documented "the outlines fill in one by one" impossible.)
  const free = unclaimedSeats();
  if (free.length) {
    // Chairs take whatever room the real people left, so a full-ish table
    // degrades to a count rather than a wrapped wall of pills.
    const room = Math.max(0, ROSTER_MAX - Math.min(othersCount, ROSTER_MAX));
    for (const seatName of free.slice(0, room)) {
      rosterEl.appendChild(railGhost(seatName, `Copy ${seatName}'s link to this table`, (e) =>
        shareInvite(seatInviteUrl(seatName), e.currentTarget, seatName), { dot: true }));
    }
    if (free.length > room) {
      const more = document.createElement('span');
      more.className = 'roster-more';
      more.textContent = `+${free.length - room}`;
      more.title = `Seats still free: ${free.slice(room).join(', ')}`;
      rosterEl.appendChild(more);
    }
    return;
  }

  // An UNPREPARED table has no chairs to show, so the generic invite stands in
  // — but only while you are alone. Once anyone is here the row is doing its
  // real job, and a permanent Invite pill would be exactly the standing chrome
  // §7.9 kills; the link keeps its home in the identity menu.
  if (!othersCount) {
    rosterEl.appendChild(railGhost('Invite', 'Copy this table’s link', (e) =>
      shareInvite(inviteUrl(), e.currentTarget, 'Invite')));
  }
}

// ---------------------------------------------------------------------------
// The rail menu — the lobby's two exits (§3b L1/L3)
//
// One open menu app-wide, body-level, anchored with viewport clamping and a
// flip-above: the same discipline as openSetMenuFor, which is the only one of
// the app's menus that had all three. (Extracting a shared placeAnchored is
// owed here AND by §2l slice ⑤ — deliberately not done in this pass so the two
// land together rather than fork; recorded in UX §7.20's seams.)
// ---------------------------------------------------------------------------

let railMenuState = null; // { el, anchor } — one at a time

function isRailMenuOpen() { return railMenuState !== null; }

function closeRailMenu(refocus = false) {
  if (!railMenuState) return;
  const { el, anchor } = railMenuState;
  railMenuState = null;
  el.remove();
  document.removeEventListener('pointerdown', railMenuAway, true);
  if (anchor) {
    anchor.setAttribute('aria-expanded', 'false');
    if (refocus) anchor.focus();
  }
}

function railMenuAway(e) {
  if (!railMenuState) return;
  if (e.target.closest && (e.target.closest('.rail-menu') || e.target === railMenuState.anchor
      || (railMenuState.anchor && railMenuState.anchor.contains(e.target)))) return;
  closeRailMenu();
}

function openRailMenu(anchor, build) {
  closeRailMenu(); // enforce one-menu before anything is measured
  const el = document.createElement('div');
  el.className = 'rail-menu panel';
  el.setAttribute('role', 'menu');
  build(el);
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  let top = r.bottom + 6;
  if (top + el.offsetHeight > window.innerHeight - 12) {
    top = Math.max(12, r.top - el.offsetHeight - 6); // flip above rather than clip
  }
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(Math.max(12, Math.min(r.left, window.innerWidth - el.offsetWidth - 12)))}px`;
  anchor.setAttribute('aria-expanded', 'true');
  railMenuState = { el, anchor };
  document.addEventListener('pointerdown', railMenuAway, true);
  // Table shortcuts must not fire underneath a menu that owns the keyboard.
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closeRailMenu(true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // Arrow navigation, the same affordance openSetMenuFor offers — a
      // role="menu" that cannot be walked with the arrows is one in name only.
      e.preventDefault();
      const items = [...el.querySelectorAll('button, input')];
      if (!items.length) return;
      const at = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown'
        ? (at + 1) % items.length
        : (at <= 0 ? items.length - 1 : at - 1);
      items[next].focus();
    }
  });
  // Tab must NOT close the menu: inside "+ New table" that trapped the player
  // one Tab from the input, closing the menu instead of reaching Create.
  // Leaving on focus is the honest condition, and it covers Tab out of either
  // end without breaking Tab within.
  el.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!railMenuState || railMenuState.el !== el) return;
      if (!el.contains(document.activeElement)) closeRailMenu();
    }, 0); // focusout precedes focusin; settle first, then ask where focus went
  });
  return el;
}

// Where a new table's chosen name waits out the navigation. sessionStorage,
// not local: the tab that creates the table is the tab that lands on it, and a
// name left behind by an abandoned create must not haunt a later visit.
const pendingNameKey = (room) => `dice.newtable.v1:${room}`;

// "+ New table" — name it, land in it. The key is MINTED, never the name:
// this app has no access control by design (goal 10), so the key is the door,
// and `?room=soulseal` would be a door anyone can guess. A blank name is
// allowed — it makes an unnamed table, exactly as one made by hand.
function openNewTable(e) {
  const anchor = e.currentTarget;
  // Toggle, like the Tables pill: without this a second click on the anchor
  // (pointerdown-away deliberately exempts it) rebuilt the menu and threw away
  // a half-typed table name.
  if (isRailMenuOpen() && railMenuState.anchor === anchor) { closeRailMenu(true); return; }
  const menu = openRailMenu(anchor, (el) => {
    const input = document.createElement('input');
    input.className = 'tin';
    input.type = 'text';
    input.maxLength = 28; // mirrors the server's table-name cap
    input.placeholder = 'Table name…';
    input.autocomplete = 'off';
    const go = document.createElement('button');
    go.className = 'btn confirm';
    go.textContent = 'Create';
    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(input);
    row.appendChild(go);
    el.appendChild(row);
    const create = () => {
      const name = cutText(input.value.trim(), 28);
      const key = mintRoomKey(name);
      try { sessionStorage.setItem(pendingNameKey(key), name); } catch { /* a nameless table still works */ }
      closeRailMenu();
      gotoTable(key);
    };
    go.addEventListener('click', create);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); create(); }
    });
  });
  menu.querySelector('input').focus();
}

// "Tables ▾" — the tables THIS BROWSER has been to (§3b's no-global-directory
// ruling: the server never publishes a list of live rooms, so this is the only
// directory a lobby has, and it is yours).
function openTablesMenu(anchor) {
  if (isRailMenuOpen() && railMenuState.anchor === anchor) { closeRailMenu(true); return; }
  const menu = openRailMenu(anchor, (el) => {
    for (const t of recentTables()) {
      const row = document.createElement('div');
      row.className = 'rail-menu-row';
      const go = document.createElement('button');
      go.className = 'idm-item';
      go.setAttribute('role', 'menuitem');
      go.textContent = t.name || t.room; // user text: textContent only
      go.title = `Go to ${t.name || t.room}`;
      go.addEventListener('click', () => { closeRailMenu(); gotoTable(t.room); });
      const drop = document.createElement('button');
      drop.className = 'rail-menu-forget';
      drop.textContent = '✕';
      drop.title = `Forget ${t.name || t.room}`;
      drop.addEventListener('click', () => {
        forgetTable(t.room);
        closeRailMenu(); // NOT refocus: renderPlayers below destroys the anchor
        renderPlayers(); // the pill leaves with the last remembered table
        // Land the keyboard somewhere real — on the rebuilt Tables pill if
        // any tables remain, else on the row's first exit.
        const back = rosterEl.querySelector('.rail-ghost');
        if (back) back.focus();
      });
      row.appendChild(go);
      row.appendChild(drop);
      el.appendChild(row);
    }
  });
  // Focus lands INSIDE the menu, so the arrows and Esc have somewhere to act
  // from — and so a keyboard player is not left on an anchor behind an open
  // menu (the failure openSetMenuFor avoids by focusing its selected row).
  const first = menu.querySelector('.idm-item');
  if (first) first.focus();
}

// Read-and-clear: a pending name is consumed by the first join that lands on
// its room, so a reload of the same table never re-imposes it over a name the
// table has since been given.
function takePendingTableName() {
  if (IN_LOBBY) return '';
  try {
    const k = pendingNameKey(ROOM);
    const v = sessionStorage.getItem(k) || '';
    if (v) sessionStorage.removeItem(k);
    return v.trim();
  } catch { return ''; }
}

// Every transition between tables NAVIGATES. ROOM is a module-scope const and
// some fifty netOnline sites assume the room identity does not change under
// them; a same-page swap is a real refactor for something that happens a few
// times a session (§7.20 seams, §3b L3).
function gotoTable(room) {
  window.location.href = room
    ? `${window.location.pathname}?room=${encodeURIComponent(room)}`
    : window.location.pathname;
}

// Compact human summary of a mods spec: "+3 · adv · drop low 1 · reroll ≤2 · explode"
// Attributed parts (§7.2) show their labels: "+2 Proficiency · +1 Guidance".
// `values:false` drops the ARITHMETIC clauses and keeps the SELECTION ones
// (U17 #26). An offer card was still declaring `+5` under a per-die lens
// while the intent card it becomes had already stopped — the offer path was
// never gated at all, which is half of why eight surfaces showed six
// different subsets of one stake.
function modsSummary(mods, opts = {}) {
  if (!mods) return '';
  const values = opts.values !== false;
  const bits = [];
  if (!values) { /* arithmetic omitted — the shape clauses below still speak */ }
  else if (Array.isArray(mods.parts) && mods.parts.length) {
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
    head.append(who, ' offers a roll'); // one-voice: no colon-head grammar
    // Targeted (4b): WHO it is for is part of the stakes — everyone reads it.
    if (o.to && o.to.name) {
      const toEl = document.createElement('span');
      toEl.className = 'offer-to';
      toEl.textContent = o.to.name; // user-supplied: textContent only
      head.append(' for ', toEl);
    }

    const title = document.createElement('div');
    title.className = 'offer-title';
    title.textContent = o.label || formula(o.dice || []);

    const detail = document.createElement('div');
    detail.className = 'offer-detail';
    const summary = modsSummary(o.mods, { values: activeSystem().usesTotal });
    const exp = sanitizeExp(o.exp);
    // The offer's visibility is part of its stakes (goal 11): show it on the
    // card so a claimer knows they may be rolling blind.
    const vis = normVis(o.visibility, o.faceDown);
    const visText = offerVisText(vis);
    detail.textContent = '';
    detail.append(formula(o.dice || []) + (summary ? `  ·  ${summary}` : ''));
    if (Number.isInteger(o.dc)) {
      // The stakes highlight, restored: it silently died when this line went
      // textContent-only (the audit's dead-CSS hunt found .offer-vs orphaned).
      detail.append('  ·  ');
      const vsEl = document.createElement('span');
      vsEl.className = 'offer-vs';
      vsEl.textContent = `vs ${o.dc}`;
      detail.appendChild(vsEl);
    }
    detail.append((visText ? `  ·  ${visText}` : '')
      + (exp ? `  ·  ${exp.kind === 'cinematic' ? 'Cinematic' : 'Check'}${exp.subtitle ? ` — ${exp.subtitle}` : ''}` : ''));

    // The claim is a ROLL, so it speaks P1 like every other roll surface:
    // the offered dice as a die-art strip button wearing the ROLL cue —
    // the last text-button roll trigger retires ('one shared code path').
    // A TARGETED offer (4b) shows that strip only to its named claimant —
    // the server enforces the same gate (403 not_offer_target), the card
    // just tells the truth about it; bystanders read who the table waits on.
    const actions = document.createElement('div');
    actions.className = 'offer-actions';
    const mayTake = !o.to
      || (net && Array.isArray(o.to.playerIds) && o.to.playerIds.includes(net.playerId));
    if (mayTake) {
      const rollBtn = document.createElement('button');
      rollBtn.className = 'pool-roll offer-roll';
      const claimName = `Roll it — ${o.label || formula(o.dice || [])}`;
      rollBtn.title = claimName;
      rollBtn.setAttribute('aria-label', claimName);
      rollBtn.appendChild(buildDieStrip(o.dice || [], POOL_STRIP_CAP, { grouped: true }));
      rollBtn.appendChild(buildRollCue());
      const offerUnits = new Set(o.dice || []).size;
      rollBtn.addEventListener('click', () => { if (net) net.claim(o.offerId, { set: wireSet() }); });
      actions.appendChild(rollBtn);
    } else {
      const waiting = document.createElement('span');
      waiting.className = 'offer-waiting';
      waiting.textContent = `waiting on ${o.to.name}`;
      actions.appendChild(waiting);
    }
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

// NULL IN THE LOBBY, and every caller must handle it. This used to interpolate
// ROOM unconditionally, so a roomless client happily produced a WORKING link to
// the shared room named 'table' and offered it as "your invite" — the single
// most misleading affordance the L0 audit found. There is no table to invite
// anyone to from the lobby; the honest answer is no link, not a plausible one.
function inviteUrl() {
  return IN_LOBBY ? null : `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(ROOM)}`;
}

// The per-seat form (§7.20): the same link with `&as=Name`, which G5 already
// reads to pre-select a prepared seat. One prepared table, one link per chair.
function seatInviteUrl(seatName) {
  const base = inviteUrl();
  return base ? `${base}&as=${encodeURIComponent(seatName)}` : null;
}

// JSON-safe projection — also __diceDebug.identity. `room` is null in the
// lobby and `online` no longer implies it: the two questions are separate now
// (a healthy server with no room joined is a lobby, not a connection failure),
// and every consumer that used to read `online` to mean "has a table" reads
// `room` instead.
function identityInfo() {
  const me = netOnline && net ? players.find((p) => p.id === net.playerId) : null;
  let stored = '';
  try { stored = (localStorage.getItem(LS_NAME) || '').trim(); } catch { /* ignore */ }
  return {
    name: me ? me.name : stored,
    color: (me && me.color) || (netOnline && net ? net.color : null) || null,
    online: netOnline,
    room: ROOM,
    lobby: IN_LOBBY,
    inviteUrl: inviteUrl(),
  };
}

function updateIdentityChip() {
  const info = identityInfo();
  // '' falls back to the stylesheet's solo dot color
  document.getElementById('identity-dot').style.background = info.color || '';
  // '…' is the JOIN's placeholder — it means "a name is coming, the prompt is
  // resolving". The lobby never joins and never prompts, so there is nothing
  // coming: it says the honest word instead, until you choose one.
  document.getElementById('identity-name').textContent = info.name || (IN_LOBBY ? 'You' : '…');
  // ONE grammar for whose-rack (Joe 2026-08-04): teammate consolidation
  // grew the rail into a "whose pools" segmented control — pill click
  // browses, press-again falls home. The identity chip joins that
  // grammar: aria-pressed=true when you're at your own rack (the
  // default), false while browsing a teammate. Exactly one chip in the
  // rail is pressed at any time.
  const chip = document.getElementById('identity-chip');
  const atHome = poolsOwner === null;
  chip.setAttribute('aria-pressed', String(atHome));
  chip.title = atHome
    ? 'You — right-click for name, seat, invite'
    : 'Back to your pools — right-click for name, seat, invite';
}

function isIdentityMenuOpen() { return !identityMenu.classList.contains('hidden'); }

// Items hide by inline style, not a class: there is no global `.hidden`
// utility in this codebase, and `.idm-item`'s own `display: block` outranks
// the `[hidden]` attribute — an inline display is the one thing that wins
// without adding a rule per item.
const idmShow = (id, on) => { document.getElementById(id).style.display = on ? '' : 'none'; };

function openIdentityMenu() {
  const info = identityInfo();
  document.getElementById('idm-who').textContent = info.name || 'You';
  // This line used to branch on `online`, which conflated two questions: a
  // healthy server with no room joined would have printed `room: table`. The
  // question is whether there IS a room. P1's "detail on intent" is also why
  // the privacy read lives here rather than standing on screen.
  document.getElementById('idm-room').textContent = IN_LOBBY
    ? 'not at a table — your rolls stay on this device'
    : (info.online ? `room: ${ROOM}` : 'no server — playing solo');
  // A surface that speaks about YOU keeps working; a surface that speaks about
  // THE TABLE is ABSENT in the lobby — not greyed, not a refusal on click.
  // There is no link to copy, no seat to change, and no table to leave.
  idmShow('idm-invite', !IN_LOBBY);
  idmShow('idm-leave', !IN_LOBBY);
  idmShow('idm-lobby', !IN_LOBBY);
  document.getElementById('idm-rename-row').classList.add('hidden');
  identityMenu.classList.remove('hidden');
}

function closeIdentityMenu() {
  identityMenu.classList.add('hidden');
  document.getElementById('idm-rename-row').classList.add('hidden');
}

// THE IDENTITY CHIP, gesture-split (Joe 2026-08-04): left-click IS the
// "whose pools" toggle — falls home from a foreign rack, matching the
// teammate pills' toggle grammar (one rail, one gesture, one gesture
// grammar). Right-click / long-press opens the identity menu — the
// same right-click-for-context pattern the pool tiles already speak.
// Solo/at-home: left-click is a no-op (you're already home; the chip
// is aria-pressed to say so); right-click is the way in to rename /
// leave / invite. This deliberately supersedes the pre-2026-08-04
// left-click-opens-menu wiring — recorded in UX.md §7.17.
const identityLp = attachLongPress(
  document.getElementById('identity-chip'),
  () => { if (!isIdentityMenuOpen()) openIdentityMenu(); },
);
document.getElementById('identity-chip').addEventListener('click', () => {
  // U27: the press that just opened the menu must not be the press that
  // closes it. The old hand-rolled hold had no suppressor at all, so on
  // touch the menu flashed and vanished — and that menu is the ONLY door to
  // Change name, Change seat and Leave table, so a touch-only player could
  // not rename, re-seat, or leave.
  if (identityLp.took()) return;
  if (isIdentityMenuOpen()) closeIdentityMenu(); // menu is open (from right-click): let click-away close it
  else setPoolsOwner(null); // fall home; no-op if already home
});
// Right-click (mouse) → menu. preventDefault so the browser's context
// menu never shows over the rail; the app's own menu is the answer.
document.getElementById('identity-chip').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  identityLp.clear(); // Android fires this first — one door wins
  if (isIdentityMenuOpen()) closeIdentityMenu();
  else openIdentityMenu();
});
// (the hand-rolled hold moved to attachLongPress above — see U27)
// A press anywhere else dismisses the menu; presses inside the menu or
// on the chip fall through to their own handlers.
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

// The picker's second anchor (§11.5 ②). NOT hidden in the lobby: your
// profiles are yours whether or not there is a table, which is exactly the
// distinction §7.20's suppression rule draws — a surface that speaks about YOU
// keeps working, one that speaks about THE TABLE must be absent.
document.getElementById('idm-profile').addEventListener('click', () => {
  closeIdentityMenu();
  // Anchored to the CHIP, not to the row that was clicked: the row lives inside
  // the panel we just closed, and a hidden element measures as a zero-size box
  // at the origin, which would park the menu in the corner.
  openRailMenu(document.getElementById('identity-chip'), buildProfileMenu);
});
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
//
// forgetSeat is the difference between LEAVING and reloading: the tab's
// remembered seat (net.js, sessionStorage) is what a refresh sits back down
// in, so switching seats has to drop it or the fresh join would resume the
// old player. Called by room name, not through `net`, so it also clears a
// seat left behind by a solo/offline boot.
function leaveTable() {
  closeIdentityMenu();
  const old = net;
  net = null;
  netOnline = false; // status callbacks from the dying stream are ignored
  // Announce it BEFORE the stream goes: this is the one departure that is a
  // deliberate gesture rather than a tab closing, so the room loses the seat
  // now instead of on the grace. The POST is already in flight by the time
  // disconnect() runs — it does not ride the stream.
  if (old) old.leave({ immediate: true });
  if (old) old.disconnect();
  forgetSeat(ROOM);
  try { localStorage.removeItem(LS_NAME); } catch { /* ignore */ }
  players = [];
  offers = [];
  poolsOwner = null;
  renderPlayers(); // empties the rail roster (players = [])
  renderGroups();  // the switcher and any foreign rack leave with the seat
  renderOffers();
  setPill(null);
  updateIdentityChip();
  updateTrayButtons(); // the draft's Offer verb leaves with the table
  netReady = initNet();
  return true;
}
document.getElementById('idm-leave').addEventListener('click', () => leaveTable());

// LEAVING THE TABLE IS NOT CHANGING SEATS, and it must not borrow leaveTable()
// to do it. That function drops the seat AND deletes LS_NAME, then re-enters
// initNet() — wiring this verb to it would silently wipe the player's display
// name on the way out and, in the lobby, loop back into "Take a seat" with
// nowhere to go. The seat belongs to the table; the NAME is yours and comes
// with you. (GOALS: presence is asserted, never inferred — so the departure is
// said out loud before the page goes, bounded so a slow server cannot trap you
// at a table you asked to leave.)
async function leaveToLobby() {
  closeIdentityMenu();
  // THE STREAM HAS TO BE DISARMED BEFORE WE GO, not merely left behind. The
  // immediate leave makes the server drop our seat and end our SSE; the
  // browser then auto-retries that EventSource, gets 404 unknown_player, and
  // net.js's reopen ladder answers by calling rejoin() — a POST /api/join that
  // RE-CREATES the room we just deleted and re-persists the seat forgetSeat()
  // just cleared. All of it races the navigation, and on a cold start that gap
  // is seconds. If the page then dies mid-rejoin, the ghost sits out
  // JOIN_GRACE_MS — exactly the ghost-seat class the presence work just fixed,
  // and this function's own "said out loud" comment undone by its own cleanup.
  // Only disconnect() sets net.js's `closed` flag, so only disconnect() stops
  // the ladder. Same teardown order leaveTable() uses, and for the same reason.
  const old = net;
  net = null;
  netOnline = false; // status callbacks from the dying stream are ignored
  forgetSeat(ROOM);
  if (old) {
    await Promise.race([old.leave({ immediate: true }), new Promise((r) => setTimeout(r, 1200))]);
    old.disconnect();
  }
  gotoTable(null);
}
document.getElementById('idm-lobby').addEventListener('click', () => leaveToLobby());

// Closing the tab is the ordinary way to leave a table, and until now it was
// the one the server could not see: behind a proxy the stream stays open and
// the seat sits on the roster for an hour (server.js LIVENESS_TIMEOUT_MS has
// the whole story). One beacon on the way out turns that into the same five
// seconds a local disconnect has always taken.
//
// A RELOAD fires this identical event — the browser will not tell us which
// this is — so the beacon is deliberately the soft kind: it drops the stream
// this page is on, not the seat. The reload's fresh stream carries a new id,
// so even a beacon that arrives after it cannot touch it, and the seat is
// still there to sit back down in. `persisted` is the exception: that page is
// going into the back/forward cache and may be restored, so leave it alone
// and let the liveness sweep decide if it never comes back.
window.addEventListener('pagehide', (e) => {
  if (e.persisted || !net || !netOnline) return;
  net.leave();
});

// One copy path, two doors. The menu item and the presence row's Invite chair
// share shareInvite(), so the feedback grammar ('Copied!', 900 ms, restore) and
// the clipboard-refused fallback cannot drift apart.
document.getElementById('idm-invite').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  await shareInvite(inviteUrl(), btn, 'Copy invite link');
  setTimeout(closeIdentityMenu, 900);
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
    rerollOfId: r.rerollOfId,   // B3: a reload's on-felt roll keeps its mark
    set: r.set,                 // Tier 6 §9: a reload keeps the roller's skin
    sets: r.sets,               // §9 per-die (mixed pools survive a reload)
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
  tryFlushZoom(); // late-joiner path: hello.settings.zoom already applied
                  // before this replay, so this is idempotent; the hook stays
                  // to catch a settings-changed that lost the race with hello
}

function handleNetEvent(type, data) {
  if (!data) return;
  switch (type) {
    case 'hello': // initial state + re-sync after a reconnect
      players = data.players || [];
      // NOT rendered here — the presence row now draws the prepared table's
      // unclaimed chairs, and `roomSetup` is not adopted until below. Rendering
      // first would draw chairs from the PRE-reconnect setup: after a server
      // restart, seats the room no longer holds, each offering an &as= link to
      // a seat that no longer exists. The render moved to just after the setup
      // lands (see the end of this case).
      refreshPoolsPresence(); // switcher resync; never clobbers an open editor
      publishPools(); // a silent rejoin minted a fresh (pool-less) seat: re-share
      log = (data.log || []).map(rollToLogEntry);
      renderLog();
      // The join backlog seeds the ≣ unread badge (closed flyout only): a
      // late joiner sees at a glance that the table has history. hello fires
      // on every stream (re)open, so a reconnect re-counts what the closed
      // flyout is holding; an open flyout is already being read — no badge.
      if (!isLogFlyoutOpen()) setLogUnread(log.length);
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
      // The prepared table, present-or-absent (§G4): ABSENT means the room
      // genuinely holds none — a restarted server forgot it — so this falls
      // to null rather than keeping the last one seen. §G6's re-push heals
      // exactly that gap, and only sees it if it is recorded here. hello is
      // THE healing hook on purpose: it fires on every stream (re)open, which
      // is exactly when a restarted room becomes visible. (The very first
      // hello can outrun initNet's `net =` assignment — maybeRepushTable
      // no-ops then, and initNet's own call right after the join covers it.)
      roomSetup = data.setup || null;
      // NOW the presence row can be drawn: roster and setup are both current,
      // so the unclaimed chairs describe the room this hello just described.
      renderPlayers();
      maybeRepushTable();
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
        refreshPoolsPresence(); // the owner switcher gains a chip
      }
      break;
    case 'player-left': {
      const gone = players.find((p) => p.id === data.playerId);
      players = players.filter((p) => p.id !== data.playerId);
      renderPlayers();
      if (poolsOwner === data.playerId && gone) {
        showSettingsNote(`${gone.name} left \u2014 back to your pools`);
      }
      refreshPoolsPresence(); // drops their chip; falls home if we were browsing them
      break;
    }
    case 'player-renamed': {
      const p = players.find((x) => x.id === data.playerId);
      if (p) {
        p.name = data.name;
        renderPlayers();
        refreshPoolsPresence(); // switcher chip + a standing owner banner track names
      }
      break;
    }
    case 'pools-changed': {
      const p = players.find((x) => x.id === data.playerId);
      // §9: carry the owner's default set alongside the rack (absent =
      // standard) — dropping it here was exactly the whitelist information
      // loss that made foreign racks wear the viewer's skin.
      if (p) {
        p.pools = data.pools || [];
        p.set = typeof data.set === 'string' ? data.set : null;
        // §11: which of THEIR profiles this rack is, and what it was built for
        // — the owner switcher could only ever say whose until now, and a rack
        // a teammate can name is a rack a teammate can copy.
        p.profile = typeof data.profile === 'string' ? data.profile : null;
        p.system = typeof data.system === 'string' ? data.system : null;
      }
      // repaint only when the rack on screen is the one that changed —
      // your own echo lands in `players` silently
      if (poolsOwner === data.playerId) renderGroups();
      renderTableProfiles(); // 'At this table' follows the room, live
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
        rerollOfId: data.rerollOfId,   // B3: server-substantiated provenance
        set: data.set,                 // Tier 6 §9: the roller's dice-set skin
        sets: data.sets,               // §9 per-die (mixed pools)
        playerId: data.playerId,
        seed: data.seed,
        label: data.label || formula(data.dice || []),
        playerName: data.playerName,
        color: data.color,
      });
      break;
    case 'clear':
      // SAY WHO SWEPT (C7). The server has always broadcast
      // {playerId, playerName} and this threw both away — so five people's
      // shelved rolls vanished at once with no cause on screen and nothing
      // said to a screen reader. Goal 10 is why ANYONE may do it; it is not a
      // reason for it to happen invisibly. The name is skipped for your own
      // press: you know, and narrating your own act back at you is noise.
      // A SCOPED SWEEP CANNOT BE RE-DERIVED (C7 ②): clearTable() removes
      // everything, which is right for scope 'table' and wrong for 'mine'.
      // The event names the rollIds the server actually cleared, so the
      // client applies exactly that set.
      if (data.scope === 'mine' && Array.isArray(data.cleared)) {
        for (const rollId of data.cleared) applyClearRoll(rollId);
      } else {
        clearTable();
      }
      if (data.playerId && (!net || data.playerId !== net.playerId)) {
        const who = data.playerName || 'Someone';
        const what = data.scope === 'mine' ? 'cleared their rolls' : 'cleared the table';
        setPill(`${who} ${what}`, 'notice');
        setTimeout(() => {
          if (statusPill.textContent === `${who} ${what}`) setPill(null);
        }, 4000);
        announce(`${who} ${what}.`);
      }
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
    case 'table-setup':
      // A winning push (§G4): adopt the room's new prepared table. Settings
      // inside the push arrive on their own 'settings-changed' echo, so this
      // case only tracks state (the seat picker and §G6's re-push read it)
      // and gives the roster the same quiet note grammar settings use.
      roomSetup = data.setup || null;
      // ...and the presence row, which now draws the unclaimed chairs FROM
      // that setup. Without this the chairs are whatever the last join/leave
      // left behind: an organizer pushing a six-seat setup at a live table
      // changed nobody's row until an unrelated roster event happened to fire.
      renderPlayers();
      renderTableProfiles(); // the prepared seats are copy sources (§11 P12)
      if (data.byId && net && data.byId !== net.playerId) {
        showSettingsNote(`${data.byName || 'someone'} prepared the table`);
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
// Test observability: the last spec we asked the pipeline to roll. The
// endurance-log scenario asserts the delegated ⟳ dispatches to the RIGHT
// entry after 60 back-to-back rolls (a per-entry closure was the pre-fix
// bug: rebuilding the list every add re-bound N buttons every arrival).
let lastRequestedRoll = null;

function requestRoll(types, label, opts = {}) {
  if (!types.length) return;
  lastRequestedRoll = {
    dice: [...types],
    label: label || null,
    rerollOfId: typeof opts.rerollOfId === 'string' ? opts.rerollOfId : null,
    at: Date.now(),
  };
  const vis = normVis(opts.visibility, opts.faceDown);
  const canonical = opts.canonical || canonicalWithVis(
    { dice: types, mods: opts.mods || null, sources: opts.sources || undefined },
    {
      dc: Number.isInteger(opts.dc) ? opts.dc : null,
      comment: typeof opts.comment === 'string' ? opts.comment : null,
      exp: sanitizeExp(opts.exp),
    },
    vis
  );
  // The canonical and the resolved visibility join the debug record: what a
  // composing surface ACTUALLY asked for is the only way to pin that the
  // rail's multi-pick strips glue and fails visibility closed.
  lastRequestedRoll.canonical = canonical;
  lastRequestedRoll.visibility = vis ? { mode: vis.mode, names: [...vis.names] } : null;
  // The rest of the INTENT joins it too (2026-08-08, U1): a scenario proving
  // that two composing surfaces send the same roll has to be able to compare
  // the axes one at a time. Reading them out of `canonical` works until the
  // day the canonical is the thing that is wrong.
  lastRequestedRoll.dc = Number.isInteger(opts.dc) ? opts.dc : null;
  lastRequestedRoll.exp = sanitizeExp(opts.exp) || null;
  lastRequestedRoll.mods = opts.mods ? JSON.parse(JSON.stringify(opts.mods)) : null;
  // History records only rolls that actually happened: online that means the
  // server accepted it (a 400 or a network failure resolves null), solo it
  // means the spec passed the same validation rollDice applies.
  if (netOnline && net) {
    const wireOpts = { ...opts, set: rollSetOf(opts) };
    // secret/whisper have no explicit wire field BY DESIGN: visibility rides
    // the notation string and the server re-parses it. Paths that arrive here
    // with no string of their own (popover, reroll-last) get the canonical.
    // held keeps today's faceDown field on the explicit shape.
    if (!wireOpts.notation && ((vis && vis.mode !== 'held') || opts.sources)) {
      // sources have no explicit wire field either — attribution rides the
      // notation string, same single-carrier rule as visibility (2b-⑤)
      wireOpts.notation = canonical;
    }
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

// TWO SCOPES, ONE CONTROL (C7 ②). The corner ✕ used to sweep every player's
// shelf on one unmodified press. It now clears YOURS instantly — the ordinary
// act, and the only one most presses ever mean — and, when other people's
// rolls are still on the table, arms once for the wider one. Same two-tap
// grammar the rack's delete already uses, and it reaches the wide act without
// inventing a second control.
//
// The arm is skipped when your rolls ARE all the rolls: pressing twice to
// clear a table you are alone at is a toll, not a safeguard.
function requestClear(scope = 'mine') {
  if (netOnline && net) net.clear(scope); // table clears when the 'clear' event arrives
  else clearTable();
}

// How many uncleared rolls belong to somebody else. Read from the same state
// row the shelf reads, so it counts what is actually still on the table.
function othersOnTable() {
  if (!netOnline || !net) return 0;
  let n = 0;
  for (const [rollId, st] of rollStates) {
    if (st.cleared) continue;
    const e = log.find((x) => x.rollId === rollId);
    if (e && e.playerId && e.playerId !== net.playerId) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// The seat picker (ROADMAP §G5, PROFILES §3.3). 'Take a seat' grows a list of
// the room's PREPARED seats above the free-text row, which keeps today's
// behaviour verbatim ('Someone else…').
//
// THE ORDERING PROBLEM this block exists around: the name prompt runs BEFORE
// the join, and a room's setup arrives in the join response — so the modal
// needs the seats at the one moment the client cannot have them. The answer
// is net.js peekTable (GET /api/table, public, read-only): initNet fires it
// as the modal opens, the free-text prompt renders IMMEDIATELY (the join is
// never delayed by the peek — no server, a 404, junk or a timeout all resolve
// null and the modal simply stays plain, which is goal 9's degrade), and the
// seats render if and when the answer lands.
//
// Choosing a seat is three steps, and the third is the whole design:
//   1. the profile's name becomes the display name and the join proceeds;
//   2. the modal STAYS UP through the join and then shows the EXISTING import
//      preview for that profile's pools (profileToImport + planImport, the
//      pane's own '✓ 8 new · …' grammar);
//   3. pools land only on an explicit Apply, through the same applyImportPlan
//      the pane's Apply uses. GOALS §7 records why there is no shortcut: the
//      '#g=' codec was deleted for replacing a visitor's rack on arrival, and
//      a prepared seat that auto-applied would re-commit that with better
//      manners. 'Not now' keeps the seat and touches nothing.
//
// '&as=Alice' PRE-SELECTS a seat (case-insensitive) — a highlight and a
// focus, so Enter takes it. Never an auto-join, never an auto-apply; an as=
// that names no seat is ignored without a word (a stale link must not break
// the join). A returning player with a stored name skips this modal entirely,
// exactly as before.
// ---------------------------------------------------------------------------

const AS_PARAM = (new URLSearchParams(window.location.search).get('as') || '').trim();
// The name this origin already held when the tab opened. Read ONCE at boot:
// takeSeat writes LS_NAME as it joins, so reading it later would answer with
// the seat just taken rather than the one the player arrived with.
const STORED_NAME_AT_BOOT = (() => {
  try { return (localStorage.getItem('dice.name.v1') || '').trim(); } catch { return ''; }
})();
// Set when a per-seat link pulled a RETURNING player into the picker (U3):
// {name, seat}. The modal reads it to explain why it opened at all, and to
// offer the player their own name back in one press.
let seatReturning = null;

let seatPhase = 'idle';   // 'idle' | 'pick' | 'joining' | 'preview'
let seatPeekInfo = null;  // peekTable's answer for the LIVE prompt ({name?, seats?} | null)
let seatChosen = null;    // the prepared-seat name taken this join (null = free text)
let seatProfile = null;   // the wire profile behind the pending preview
let seatPlan = null;      // the previewed plan Apply commits (null = nothing to commit)
let seatSetFlip = null;   // the seat's dice-set id, applied on the same click
let seatVerdict = { ok: true, status: '', canApply: false };
let seatResolve = null;   // promptName's resolver while the modal waits
let seatCleanup = null;   // detaches the live prompt's input listeners
let seatProfilePicked = null; // §11: the profile picked at THIS prompt, or null = the default

// Which rulebook this table reads, BEFORE the join. The room's settings do not
// reach this client until the join answers, so `currentSystemId` is still this
// browser's own until then — the peek is the only source, and it is why the
// peek carries `system` at all (§11 decision 6). Falls back to what we read by
// now when there is no peek (solo, or a server that answered nothing).
const seatSystem = () => knownSystem(seatPeekInfo && seatPeekInfo.system) || tableSystem();

// The peeked seats, defensively filtered: the picker trusts the server no
// further than "strings and counts" (names render as text nodes only).
//
// §11 R5: a seat prepared for another system is NOT offered here — a profile is
// pickable only where its dice will be read the way they were chosen. A seat
// naming no system was prepared before §11 and belongs to the table it was
// written for, which is this one, so absence passes the filter.
function seatChoices() {
  const raw = seatPeekInfo && Array.isArray(seatPeekInfo.seats) ? seatPeekInfo.seats : [];
  const sys = seatSystem();
  return raw
    .filter((s) => s && typeof s.name === 'string' && s.name.trim())
    .filter((s) => !s.system || s.system === sys)
    .slice(0, 12)
    // `from` rides through (2026-08-09): whose character this is, so the door
    // can attribute it. Absent on a file-prepared seat, which belongs to the
    // table rather than to anyone standing here.
    .map((s) => ({
      name: s.name.trim(),
      pools: Number.isInteger(s.pools) && s.pools > 0 ? s.pools : 0,
      ...(s.from ? { from: s.from } : {}),
    }));
}

// MY profiles at the join (§11.5 ①, Joe's R9). The row that will be used is
// pre-selected: whatever this session has picked, else the last one this
// SYSTEM saw (R6). Picking one switches immediately and shows no preview —
// preview-then-apply guards a rack you RECEIVE, and taking your own profile in
// hand receives nothing: the outgoing one keeps every pool it had.
function renderSeatMine() {
  const zone = document.getElementById('seat-mine');
  const rows = document.getElementById('seat-mine-rows');
  const sys = seatSystem();
  // A FIRST-TIMER HAS NO CHARACTERS, whatever the store says (Joe 2026-08-09:
  // "it's super weird to be given a link if never played before and see
  // 'yours'… instead of having random being the selected default").
  //
  // Boot deals every browser one profile so CUJ1 — "I just need to roll NOW"
  // — has dice on the felt immediately. That profile is scaffolding, not a
  // character: nobody named it, nobody built it, and its owner has never seen
  // it. Presenting it at a join door under "Yours" introduces a stranger by a
  // random name and then defaults to them.
  //
  // Never having a display name on this origin is the honest test for "has
  // not played here before" — it is the same signal the picker itself opens
  // on, and it needs no new state to go stale.
  const firstTimer = !STORED_NAME_AT_BOOT;
  const mine = firstTimer ? [] : profilesFor(profileStore, sys);
  const canDeal = !isFull(profileStore);
  // Nothing to choose between and nothing to deal → the whole block is absent.
  zone.classList.toggle('hidden', !mine.length && !canDeal);
  rows.textContent = '';
  if (!mine.length && !canDeal) return;
  const chosen = seatProfilePicked || lastUsedFor(profileStore, sys);
  // HEADS, like the switcher over the rack (Joe 2026-08-09: "the selection of
  // the profile should match very close to the drop down to switch
  // profiles"). One list, grouped — yours, then the table's — because a flat
  // list under a heading that says "Your profiles" was calling other people's
  // characters yours.
  // The free-text divider goes with the list it divided (2026-08-09): the
  // name row is at the top of the modal now, so "Someone else…" separated
  // the characters from nothing. Hidden here rather than only in
  // renderSeatChoices, because this function is the one that always runs.
  const divider = document.getElementById('seat-someone');
  if (divider) divider.classList.add('hidden');
  const groupHead = (text) => {
    const h = document.createElement('p');
    h.className = 'hint seat-someone seat-group';
    h.textContent = text;
    rows.appendChild(h);
  };
  if (mine.length) groupHead('Yours');
  for (const p of mine) {
    const btn = document.createElement('button');
    btn.className = 'btn seat-btn';
    const nm = document.createElement('span');
    nm.textContent = p.name;
    btn.appendChild(nm);
    const n = p.id === profileStore.activeId ? groups.length : (p.pools || []).length;
    const ct = document.createElement('span');
    ct.className = 'seat-count';
    ct.textContent = `${n} pool${n === 1 ? '' : 's'}`;
    btn.appendChild(ct);
    btn.title = `Roll with '${p.name}' at this table`;
    if (p.id === chosen) btn.classList.add('preselected');
    btn.addEventListener('click', () => chooseMyProfile(p.id));
    rows.appendChild(btn);
  }
  // OTHER PEOPLE'S CHARACTERS, ATTRIBUTED (Joe 2026-08-09) — the same rule
  // the switcher over the rack follows, because this is the same choice made
  // at a different moment. A row you did not build says whose it is, and says
  // that taking it COPIES rather than borrows, before you press it.
  // FROM THE PEEK, not from `players` — this list paints BEFORE the join, so
  // the roster is still empty and tableOffers() would find nothing. The peek
  // is the one pre-join source and it carries `from` for exactly this.
  const offered = seatChoices();
  if (offered.length) groupHead('At this table');
  for (const s of offered) {
    const btn = document.createElement('button');
    btn.className = 'btn seat-btn seat-foreign';
    const nm = document.createElement('span');
    nm.textContent = s.name;
    btn.appendChild(nm);
    const ct = document.createElement('span');
    ct.className = 'seat-count';
    ct.textContent = s.from
      ? `${s.from} · ${s.pools} pool${s.pools === 1 ? '' : 's'}`
      : `prepared · ${s.pools} pool${s.pools === 1 ? '' : 's'}`;
    btn.appendChild(ct);
    btn.title = s.from
      ? `${s.from}'s '${s.name}' — taking it copies it into your profiles, yours to edit`
      : `'${s.name}' was prepared for this table — taking it copies it into your profiles`;
    if (seatProfilePicked === `copy:${s.name}`) btn.classList.add('preselected');
    btn.addEventListener('click', () => chooseOfferedProfile(s));
    rows.appendChild(btn);
  }
  if (canDeal) {
    const deal = document.createElement('button');
    deal.className = 'btn seat-btn seat-deal';
    const nm = document.createElement('span');
    nm.textContent = '⚄ Random';
    deal.appendChild(nm);
    const ct = document.createElement('span');
    ct.className = 'seat-count';
    ct.textContent = systemLabel(sys);
    deal.appendChild(ct);
    deal.title = `Deal a whole ${systemLabel(sys)} profile when you join — dice, names and all`;
    // SELECTED, NOT SPENT (Joe 2026-08-09: "don't auto pick a name and show
    // it in this UI, do whatever random does"). This used to MINT on the tap
    // — every press made another profile, to the 32 cap, before you had
    // joined anything, and it is the row a first-timer's Enter aims at. It is
    // now a choice like the others; the deal happens at Join.
    if (seatProfilePicked === 'random' || (!mine.length && !seatProfilePicked)) {
      deal.classList.add('preselected');
    }
    deal.addEventListener('click', () => { seatProfilePicked = 'random'; renderSeatMine(); });
    rows.appendChild(deal);
  }
}

// A character somebody else is holding, or one this table was prepared with.
// Selecting only MARKS it — the copy lands at Join, so browsing the list does
// not fill your library with profiles you were only looking at.
function chooseOfferedProfile(s) {
  seatProfilePicked = `copy:${s.name}`;
  seatPickNote(pv(true, s.from
    ? `${s.from}'s '${s.name}' — a copy lands in your profiles when you join`
    : `'${s.name}' — a copy lands in your profiles when you join`));
  renderSeatMine();
}

// Pick one of mine at the join. Takes it in hand right away — the modal is
// still up, so the player sees the choice register before they commit a name.
function chooseMyProfile(id) {
  const v = switchToProfile(id);
  if (v.ok) seatProfilePicked = id;
  seatPickNote(v);
  renderSeatMine();
  return v;
}

function chooseDealtProfile() {
  const v = dealNewProfile(seatSystem());
  if (v.ok) seatProfilePicked = profileStore.activeId;
  seatPickNote(v);
  renderSeatMine();
  return v;
}

// R6: take the last-used profile for THIS table's system, with no click. Runs
// at the end of every join, on both arrival paths.
//
// A silent switch here is not the `#g=` sin and the distinction is the load-
// bearing one of the whole pass (§11.2): the codec REPLACED a visitor's rack
// with no way back, where a switch moves a pointer and leaves both racks whole.
// Nothing can be lost, so nothing needs approving — and R6 asked for it in
// those words.
//
// It does nothing at all when the profile already in hand fits the table, which
// is the common case, or when this system has no profile yet — in which case
// the mismatch banner names the situation and the picker offers Random.
function ensureProfileForTable() {
  const p = activeProfile(profileStore);
  if (!p) return null;
  if (p.system === tableSystem()) { updateProfileBanner(); return null; }
  const want = lastUsedFor(profileStore, tableSystem());
  if (!want || want === p.id) { updateProfileBanner(); return null; }
  const v = switchToProfile(want);
  updateProfileBanner();
  return v;
}

// The pick's receipt, said on the modal's own hint line — the status pill is a
// shared transient and this modal is not (UX §7.20's four-count argument).
function seatPickNote(v) {
  const hint = document.getElementById('name-hint');
  if (!hint) return;
  hint.textContent = v.status;
  hint.classList.toggle('warn', !v.ok);
}

// The &as= match against the current offer (the canonical seat name, or null).
function seatPreselect() {
  if (!AS_PARAM) return null;
  const hit = seatChoices().find((s) => s.name.toLowerCase() === AS_PARAM.toLowerCase());
  return hit ? hit.name : null;
}

function renderSeatChoices() {
  const nameLine = document.getElementById('seat-table-name');
  const list = document.getElementById('seat-list');
  const divider = document.getElementById('seat-someone');
  const tn = seatPeekInfo && typeof seatPeekInfo.name === 'string' ? seatPeekInfo.name.trim() : '';
  nameLine.textContent = tn; // user text: textContent only
  nameLine.classList.toggle('hidden', !tn);
  list.textContent = '';
  renderSeatMine();
  // #seat-list IS RETIRED (2026-08-09). It listed the same prepared seats
  // renderSeatMine now lists WITH attribution, so every character at the
  // table appeared twice — once saying whose it was and once not. The
  // "Someone else…" divider goes with it: it separated the seat list from a
  // free-text name row that is now at the top of the modal, so it divided
  // nothing. The element stays in the DOM as an empty, hidden container
  // rather than being deleted, because renderSeatChoices' callers and the
  // `prepared-seat` pins both reach for it by id.
  list.classList.add('hidden');
  divider.classList.add('hidden');
  return;
  const wanted = seatPreselect();
  const input = document.getElementById('name-input');
  let preselected = null;
  for (const s of seats) {
    const btn = document.createElement('button');
    btn.className = 'btn seat-btn';
    const nm = document.createElement('span');
    nm.textContent = s.name;
    btn.appendChild(nm);
    if (s.pools) {
      const ct = document.createElement('span');
      ct.className = 'seat-count';
      ct.textContent = `${s.pools} pool${s.pools === 1 ? '' : 's'}`;
      btn.appendChild(ct);
    }
    btn.title = `Join as ${s.name}` + (s.pools ? ` — their prepared pools are offered after a preview` : '');
    if (wanted === s.name) {
      btn.classList.add('preselected');
      preselected = btn;
    }
    btn.addEventListener('click', () => takeSeat(s.name));
    list.appendChild(btn);
  }
  // The &as= shortcut is ONE keypress (Enter), never zero: focus the seat,
  // don't join it — AFTER the append (a detached element refuses focus), and
  // never over a name mid-typing (the link's suggestion must not fight the
  // player's own intent).
  if (preselected && !input.value) preselected.focus();
}

// The returning player's own row (U3). A first-timer sees none of this: the
// button is absent, and the hint is the one it has always been.
function renderSeatReturning() {
  const btn = document.getElementById('seat-keep-name');
  const hint = document.getElementById('name-hint');
  if (!btn) return;
  const r = seatReturning;
  btn.classList.toggle('hidden', !r || !r.name);
  if (!r || !r.name) return;
  btn.textContent = `Stay as ${r.name}`;
  btn.title = `Join this table under the name you already use — not the ${r.seat} seat`;
  hint.textContent = `This link offers the ${r.seat} seat, with their prepared pools.`;
}

// Phase → which halves of the panel exist. The pick furniture and the
// preview are mutually exclusive; the preview's buttons wait for 'preview'
// (during 'joining' the status line speaks alone).
function renderSeatPhase() {
  document.getElementById('seat-pick').classList.toggle('hidden', seatPhase !== 'pick' && seatPhase !== 'idle');
  const preview = document.getElementById('seat-preview');
  preview.classList.toggle('hidden', seatPhase !== 'joining' && seatPhase !== 'preview');
  const status = document.getElementById('seat-preview-status');
  status.textContent = seatVerdict.status;
  status.classList.toggle('warn', !seatVerdict.ok);
  document.getElementById('seat-preview-btns').classList.toggle('hidden', seatPhase !== 'preview');
  document.getElementById('seat-apply').disabled = !seatVerdict.canApply;
}

function closeSeatModal() {
  seatPhase = 'idle';
  seatPlan = null;
  seatProfile = null;
  seatSetFlip = null;
  document.getElementById('name-modal').classList.add('hidden');
}

// Take a PREPARED seat: resolve the prompt with the profile's name and keep
// the modal up for the preview (seatFollowThrough owns the next beat, once
// initNet's join settles). Refusals answer in the pane's verdict shape.
function takeSeat(rawName) {
  if (seatPhase !== 'pick' || !seatResolve) {
    return { ok: false, status: '✗ no seat is being offered right now', canApply: false };
  }
  const want = String(rawName == null ? '' : rawName).trim().toLowerCase();
  const seat = seatChoices().find((s) => s.name.toLowerCase() === want);
  if (!seat) {
    return { ok: false, status: `✗ no prepared seat ${JSON.stringify(String(rawName == null ? '' : rawName).trim())}`, canApply: false };
  }
  seatChosen = seat.name;
  seatPhase = 'joining';
  seatVerdict = { ok: true, status: `joining as ${seat.name}…`, canApply: false };
  renderSeatPhase();
  const resolve = seatResolve;
  seatResolve = null;
  if (seatCleanup) { seatCleanup(); seatCleanup = null; }
  resolve(seat.name);
  return { ...seatVerdict };
}

// The free-text path — today's join, byte for byte ('Someone else…'). Both
// the Join button and the __diceDebug verb land here so the '#' refusal and
// the trim/cut rules cannot fork.
// WHAT THE DOOR PROMISED, DELIVERED AFTER THE JOIN (Joe 2026-08-09).
// Selecting Random or somebody else's character at the door only MARKS it —
// browsing six characters must not leave six copies in your library, and
// Random used to mint on every tap. The deal or the copy happens once, here,
// when the roster is up and a foreign character's actual pools exist to copy.
let seatPending = null;
function settlePendingPick() {
  const want = seatPending;
  seatPending = null;
  if (!want) return;
  if (want === 'random') {
    // A first-timer's Random REPLACES the scaffolding profile boot dealt them
    // rather than adding beside it — they came here with nothing and should
    // leave the door holding one character, not two, one of which they have
    // never seen. Anyone else gets a new one, which is what Random means.
    if (!STORED_NAME_AT_BOOT && profilesOf(profileStore).length === 1) {
      const old = activeProfile(profileStore);
      const v = dealNewProfile(tableSystem());
      if (v.ok && old) removeProfileById(old.id);
      showProfileNote(v);
      return;
    }
    showProfileNote(dealNewProfile(tableSystem()));
    return;
  }
  if (typeof want !== 'string' || !want.startsWith('copy:')) return;
  const name = want.slice(5).toLowerCase();
  const o = tableOffers().find((x) => x.rec.name.toLowerCase() === name);
  if (!o) return; // they left, or the table changed under us — say nothing false
  showProfileNote(copyProfileIn(o.rec, {
    activate: true,
    from: o.from === 'prepared' ? null : o.from,
  }));
}

function takeFreeSeat(rawName) {
  if (seatPhase !== 'pick' || !seatResolve) {
    return { ok: false, status: '✗ no seat is being offered right now', canApply: false };
  }
  const name = cutText(String(rawName ?? ''), 24);
  if (!name) return { ok: false, status: '✗ a display name is required', canApply: false };
  if (name.includes('#')) {
    return { ok: false, status: '✗ names cannot contain # — it starts a comment in roll notation', canApply: false };
  }
  seatChosen = null; // a typed name is nobody's prepared seat, even a matching one
  seatPhase = 'idle';
  const resolve = seatResolve;
  seatResolve = null;
  if (seatCleanup) { seatCleanup(); seatCleanup = null; }
  document.getElementById('name-modal').classList.add('hidden');
  resolve(name);
  return { ok: true, status: `✓ joining as ${name}`, canApply: false };
}

// One wire profile's pools ({name, notation, category?, set?}, flat — the
// server stores them the way the rack stores groups) → parsePortable's shelf
// shape, so profileToImport/planImport read a room seat exactly as they read
// a file seat. Grouped by category in arrival order; uncategorized pools ride
// a 'plain' shelf, mirroring shelvesOf in js/portable.js.
function wirePoolsToShelves(pools) {
  const shelves = [];
  const byKey = new Map();
  for (const p of Array.isArray(pools) ? pools : []) {
    if (!p || typeof p.notation !== 'string') continue;
    const label = typeof p.category === 'string' ? p.category.trim() : '';
    const key = label.toLowerCase();
    let shelf = byKey.get(key);
    if (!shelf) {
      shelf = { label: label || 'Pools', plain: !label, pools: [] };
      byKey.set(key, shelf);
      shelves.push(shelf);
    }
    shelf.pools.push({
      name: typeof p.name === 'string' ? p.name : '',
      notation: p.notation,
      ...(p.set ? { set: p.set } : {}),
    });
  }
  return shelves;
}

// The beat after the join: if a prepared seat was chosen, find its profile in
// the room's setup and stand up the preview. Every miss — solo fallback, a
// setup that vanished between peek and join, a seat someone re-pushed away —
// closes the modal without a word: the NAME landed (that much of the seat is
// real), and there is simply nothing to offer. Called at the end of initNet,
// so netReady never resolves with the preview half-built.
// EVERY CHARACTER THIS TABLE OFFERS (C17), from both sources: the profiles a
// file PREPARED it with (roomSetup — survives everyone leaving) and the
// libraries the players actually at it are holding (published automatically,
// gone when they go). Setup wins a name collision: it was chosen deliberately
// for this table, and a live library is whatever somebody is carrying.
function tableOffers() {
  const out = [];
  const seen = new Set();
  const add = (rec, from) => {
    const name = rec && typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    out.push({ rec, from });
  };
  if (netOnline && roomSetup && Array.isArray(roomSetup.profiles)) {
    for (const p of roomSetup.profiles) add(p, 'prepared');
  }
  for (const pl of players) {
    if (pl && net && pl.id === net.playerId) continue; // yours are not "at this table"
    for (const p of (pl && pl.library) || []) add(p, pl.name || 'a player');
  }
  return out;
}

function seatFollowThrough() {
  if (seatPhase !== 'joining') return;
  // Both sources (C17) — a seat offered because somebody at the table is
  // holding that character must resolve, or the picker offers a chair the
  // door cannot open.
  const hit = tableOffers().find((o) => o.rec.name.toLowerCase() === seatChosen.toLowerCase());
  const prof = hit ? hit.rec : null;
  if (!prof) { closeSeatModal(); return; }
  seatProfile = prof;
  // §11 CHANGES WHAT APPLY MEANS, and this is the whole improvement the
  // library buys CUJ2. It used to MERGE the seat's pools into your one rack,
  // because there was only one rack to put them in — so a player who already
  // had an 18-pool character and took the DM's 18-pool seat ended up holding
  // one 36-pool rack that was two characters wearing each other's clothes.
  // Now the seat becomes a PROFILE of its own, taken in hand, and your own
  // profile is not touched at all. Nothing merges, so nothing can collide, and
  // the 40-pool overflow that used to refuse the arrival cannot arise.
  //
  // The PREVIEW stays, and it is still the point (GOALS §7's `#g=` post-mortem
  // — never replace a rack on arrival): what lands is named before it lands,
  // and it lands on an explicit click.
  const pools = Array.isArray(prof.pools) ? prof.pools : [];
  seatSetFlip = typeof prof.set === 'string' && SETS[prof.set] && prof.set !== diceSet ? prof.set : null;
  const bits = [`${pools.length} pool${pools.length === 1 ? '' : 's'}`];
  if (seatSetFlip) bits.push(`dice set ${SETS[seatSetFlip].label}`);
  if (isFull(profileStore)) {
    seatPlan = null;
    seatSetFlip = null;
    seatVerdict = { ok: false, status: `✗ you already keep ${MAX_PROFILES} profiles — delete one to take this seat`, canApply: false };
  } else if (pools.length > MAX_POOLS) {
    seatPlan = null;
    seatSetFlip = null;
    seatVerdict = { ok: false, status: `✗ this seat carries ${pools.length} pools — a profile holds at most ${MAX_POOLS}`, canApply: false };
  } else {
    seatPlan = { profile: prof };
    seatVerdict = {
      ok: true,
      status: `✓ ${bits.join(' · ')} — Apply adds '${prof.name}' to your profiles and takes it in hand`,
      canApply: true,
    };
  }
  seatPhase = 'preview';
  renderSeatPhase();
}

// The explicit click that PROFILES §3.3 step 3 is about, through §11's door:
// the seat becomes a profile of the player's own, under a deduped name, and
// nothing they already had is written to.
function applySeatChoice() {
  if (seatPhase !== 'preview' || !seatVerdict.canApply || !seatPlan) {
    return { ok: false, status: '✗ nothing to apply', canApply: false };
  }
  const got = copyProfileIn(seatPlan.profile, { activate: true });
  seatPlan = null;
  seatSetFlip = null;
  if (!got.ok) {
    seatVerdict = { ok: false, status: got.status, canApply: false };
    renderSeatPhase();
    return { ...seatVerdict };
  }
  seatVerdict = { ok: true, status: got.status, canApply: false };
  renderSeatPhase();
  document.getElementById('seat-preview-btns').classList.add('hidden'); // spent
  setTimeout(closeSeatModal, 900); // the receipt lingers a beat (Copy's rhythm)
  return { ...seatVerdict };
}

function dismissSeatChoice() {
  if (seatPhase !== 'preview') return { ok: false, status: '✗ no seat preview is open', canApply: false };
  closeSeatModal();
  return { ok: true, status: '✓ seat kept — your own profiles were left alone', canApply: false };
}

// peek: a promise from net.js peekTable (or null on the solo re-prompt path).
// The modal renders NOW; the peek only ever adds furniture.
function promptName(peek) {
  return new Promise((resolve) => {
    const modal = document.getElementById('name-modal');
    const input = document.getElementById('name-input');
    const joinBtn = document.getElementById('name-join');
    const hint = document.getElementById('name-hint');
    const hintText = 'What should the table call you?';
    seatPhase = 'pick';
    seatPeekInfo = null;
    seatChosen = null;
    seatProfile = null;
    seatPlan = null;
    seatSetFlip = null;
    seatVerdict = { ok: true, status: '', canApply: false };
    seatProfilePicked = null;
    seatResolve = resolve;
    renderSeatChoices();
    renderSeatReturning();
    renderSeatPhase();
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
    // THE DEFERRED PICK LANDS HERE (Joe 2026-08-09). Selecting Random or
    // somebody else's character only MARKS it — browsing a list of six
    // characters must not leave six copies in your library, and Random used
    // to mint on every tap. Whatever was marked is created at the moment you
    // actually join, once, and the receipt says what landed.
    // The pick is carried ACROSS the join, not spent before it: the peek
    // knows a character's name and pool COUNT, never its pools, so a copy
    // cannot be made until `hello` brings the real thing. seatPending is read
    // by settlePendingPick() once the roster is up.
    const submit = () => {
      seatPending = seatProfilePicked;
      takeFreeSeat(input.value);
    };
    const onKey = (e) => { if (e.key === 'Enter') submit(); };
    // 'Leave & switch' re-opens this modal, so listeners must not stack
    // across prompts: whichever door resolves this prompt detaches them
    // (seatCleanup is called by takeSeat and takeFreeSeat alike).
    seatCleanup = () => {
      input.removeEventListener('input', update);
      input.removeEventListener('keydown', onKey);
      joinBtn.removeEventListener('click', submit);
    };
    input.addEventListener('input', update);
    update();
    joinBtn.addEventListener('click', submit);
    input.addEventListener('keydown', onKey);
    input.focus();
    if (peek && typeof peek.then === 'function') {
      peek.then((info) => {
        // Stale answers keep quiet: the prompt may have resolved (or been
        // re-opened by 'Leave & switch') while the fetch was out.
        if (seatPhase !== 'pick' || seatResolve !== resolve) return;
        seatPeekInfo = info;
        renderSeatChoices();
        renderSeatReturning();
      });
    }
  });
}

// The preview's two exits — the ONLY two. Static buttons, bound once.
// U3's escape hatch: keep the name you arrived with. It is the free-text
// path with the typing already done, so it lands on takeFreeSeat exactly as
// "Someone else…" does — no second join door to keep in sync.
document.getElementById('seat-keep-name').addEventListener('click', () => {
  if (seatReturning && seatReturning.name) takeFreeSeat(seatReturning.name);
});
document.getElementById('seat-apply').addEventListener('click', () => applySeatChoice());
document.getElementById('seat-skip').addEventListener('click', () => dismissSeatChoice());

async function initNet() {
  // THE LOBBY EXITS FIRST, BEFORE ANYTHING ASKS FOR A NAME (§3b L0). CUJ1 is
  // "I just need to do a dice roll NOW", and what stood in the way was this
  // function: promptName() below has no cancel and no skip path, so a
  // first-time visitor met a modal titled "Take a seat" — about a table they
  // never asked for — before they could touch a die. The lobby answers that by
  // REMOVING the prompt, not by adding a welcome. Nothing here is a fallback:
  // we do not call connect(), so there is no failed join to report, and we do
  // not call peekTable() either (it would fire GET /api/table about a room the
  // player is not in). A name is what a table needs to address you; alone,
  // nobody needs to address you, and solo rolls carry playerName: null through
  // every render path already.
  if (IN_LOBBY) {
    netOnline = false;
    roomSetup = null;
    applyRoomSettings(load(LS_ROOMSETTINGS, null)); // your own felt, kept
    clearTableIdentity(); // ...but never a table NAME (see the function)
    renderPlayers();      // the presence row draws the lobby's exits
    updateIdentityChip();
    return;
  }

  let name = '';
  try { name = (localStorage.getItem(LS_NAME) || '').trim(); } catch { /* ignore */ }

  // A PER-SEAT LINK OUTRANKS A STORED NAME (U3, 2026-08-08). `dice.name.v1`
  // is origin-GLOBAL, so this gate skipped the picker for anyone who had ever
  // opened the app on this origin — and `&as=Bo` then did nothing at all.
  // §7.19's "one link in Discord, six people, each landing at the right seat"
  // and G5's CUJ2 held only for six people who had never used the app, which
  // is the opposite of the population an invite link is sent to. The suite
  // could not see it either: `prepared-seat` passes because the harness seeds
  // no name.
  //
  // A link that NAMES a seat is an explicit intent about THIS table, and a
  // name stored for the ORIGIN is not. So the link wins — but only when the
  // room really is offering that chair, which is why this peek is AWAITED
  // rather than fired alongside the modal: a stale or unmatched `&as=` must
  // never put a modal in front of a returning player. peekTable resolves
  // null on every failure inside its own short timeout, so no server, no
  // prepared table, and no matching seat all fall straight through with the
  // stored name and today's behaviour.
  let peeked = null;
  if (name && AS_PARAM) {
    peeked = await peekTable(ROOM);
    seatPeekInfo = peeked;
    const wanted = seatPreselect();
    seatPeekInfo = null; // promptName owns this from here
    if (wanted) {
      name = '';
      seatReturning = { name: STORED_NAME_AT_BOOT, seat: wanted };
    }
  }

  if (!name) {
    // §G5: peek at the room's prepared seats WHILE the modal is up. Fired
    // here, not awaited here — the prompt renders immediately and the picker
    // is furniture that arrives if the answer does (peekTable resolves null
    // on every failure inside its own short timeout, so no server and no
    // setup both leave today's plain prompt, and the join never hangs on it).
    name = await promptName(peeked ? Promise.resolve(peeked) : peekTable(ROOM));
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
    roomSetup = conn.setup || null; // the prepared table rides the join (§G4)
    renderPlayers(); // the rail roster fills in (solo it is simply empty)
    renderGroups();  // the owner switcher appears once the roster is known
    publishPools();  // share the rack (display copy; localStorage stays truth)
    log = (conn.log || []).map(rollToLogEntry); // server history for late joiners
    renderLog();
    offers = conn.offers || [];
    renderOffers();
    applyRoomSettings(conn.settings); // room settings from the join response
    setPill(null);
    // A table you actually reached is a table you can come back to (§3b L3).
    // Written HERE, on a successful join, so the lobby's list can never
    // accumulate rooms that refused you or never existed.
    // THE NAME HAS TO SURVIVE THE ROUND TRIP, and without this it does not.
    // An UNPREPARED room is deleted the moment its last player leaves (only a
    // room holding a setup lingers — §G6), so "leave the table, come back two
    // minutes later" lands you in a brand-new room that merely shares a key,
    // with the name gone while your own Tables list still shows it. Restoring
    // it is the same principle G6 already established for setups: the
    // organizer's browser is the durable copy and heals the room on arrival.
    // Guarded to a room with NO name, so it can never overwrite one somebody
    // else has since given the table — the one thing it CAN do is bring back a
    // name a player deliberately cleared, which is the accepted cost (and the
    // identical trade maybeRepushTable() makes for setups).
    // `!roomSettings.tableName` alone is NOT enough to justify the restore: it
    // cannot tell a recreated empty room from a LIVE room whose name somebody
    // deliberately cleared (unnamed is a documented state — the input says
    // `placeholder="unnamed"`). Unguarded, any browser that ever saw the name
    // pushes it back on its next join, every screen reads "X changed the
    // table", and because a remembered name is re-recorded each time, the
    // clear can never stick against anyone — an unkillable name.
    //
    // So the heal is restricted to a room that is demonstrably NEW: no history,
    // no setup, nobody else in it. That is the round trip this exists for (an
    // unprepared room is deleted when its last player leaves) and it is not any
    // of the live-room cases. A pending name is different and always applies —
    // you typed it into "+ New table" seconds ago.
    const freshRoom = !(conn.log && conn.log.length) && players.length <= 1 && !roomSetup;
    const remembered = freshRoom ? recentTables().find((t) => t.room === ROOM) : null;
    const wanted = takePendingTableName() || (remembered && remembered.name) || '';
    if (wanted && !roomSettings.tableName && net) net.setSettings({ tableName: wanted });
    rememberTable(ROOM, roomSettings.tableName || wanted || '');
  } else {
    netOnline = false;
    roomSetup = null;
    // `solo` SURVIVES HERE, AND ONLY HERE. §7.20 deletes it as the LOBBY's
    // indicator because a lobby has exits and a <span> cannot offer them. This
    // branch is the opposite case: the player ASKED for a table (?room= is
    // set) and there is no server to give them one — static hosting (goal 9,
    // a supported mode, so no red) or a server that is down. There is no next
    // action to point at, which is exactly when a readout is the right object.
    // Safe in the shared-transient channel too: with no server, no settings
    // event can fire and steal the slot.
    setPill('solo', 'solo');
    applyRoomSettings(load(LS_ROOMSETTINGS, null)); // solo keeps its own felt
    renderPlayers(); // genuinely all three branches now — it early-returns here
  }
  // §11 R6, stated literally: "when they join a table they should use the last
  // used profile for that rolling system." This is that, and it runs AFTER
  // applyRoomSettings above so it reads the table's own system rather than this
  // browser's last one. It fires on both arrival paths — the one that showed
  // the modal and the one that skipped it because the name was already stored.
  ensureProfileForTable();
  // §G5: a chosen prepared seat's preview stands up now — after every piece
  // of join state above, so netReady never resolves with it half-built. A
  // free-text join (or a seat the join couldn't substantiate) is a no-op.
  seatFollowThrough();
  settlePendingPick(); // the door's deferred Random / copy, now that hello has landed
  // §G6: if this browser authored the room's setup and the room came up
  // without it (or behind it), heal it now — the first SSE hello can fire
  // before `net` is assigned above, so this call is the join-time guarantee.
  maybeRepushTable();
  updateIdentityChip(); // the rail chip takes the seat's name + color
  updateTrayButtons();  // the draft's Offer verb appears only at a table
  return { online: netOnline };
}

// let, not const: 'Change seat…' (leaveTable) re-runs the join flow and
// repoints this at the fresh promise.
//
// DECLARED ON ITS OWN LINE, initialized on the next. `let netReady = initNet()`
// leaves netReady in TDZ for the whole SYNCHRONOUS prefix of initNet — which
// used to be harmless because the online path awaited connect() almost
// immediately, but the lobby path renders the presence row and returns without
// ever awaiting. Anything on that path that reads netReady would throw, and the
// module would die at eval with the page still standing on its static markup
// (which is what makes this failure read as a render bug rather than a dead
// module). Splitting the two costs nothing and closes the window.
let netReady;
netReady = initNet();
