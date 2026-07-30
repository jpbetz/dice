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
import { DIE_TYPES, DIE_DEFS, createDieMesh, createDieBody, readValue, valueRange, faceNormalForValue } from './dice.js';
import { connect } from './net.js';
import { meaningFor } from './meanings.js';
import { groupsFromLocation, syncGroupsToLocation } from './urlgroups.js';
import { composeRoll, validateMods, countingBaseTypes, previewSpec } from './rollspec.js';
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
scene.background = new THREE.Color('#191512');

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
// and must stay byte-identical to it ('#1f3128' / '#191512'). The theme id is
// room state (settings.felt); the 2D gold/ivory UI palette never changes.
const FELT_THEMES = {
  emerald:  { name: 'Emerald',  feltBase: '#1f3128', sceneBg: '#191512' },
  crimson:  { name: 'Crimson',  feltBase: '#46201e', sceneBg: '#1a1211' },
  midnight: { name: 'Midnight', feltBase: '#1e2a3f', sceneBg: '#121520' },
  slate:    { name: 'Slate',    feltBase: '#2c3438', sceneBg: '#161a1c' },
  walnut:   { name: 'Walnut',   feltBase: '#402e1c', sceneBg: '#1b1410' },
};
const DEFAULT_FELT = 'emerald';
let currentFeltId = DEFAULT_FELT;

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
  for (let i = 0; i < 9000; i++) {
    const shade = Math.random();
    ctx.fillStyle = shade > 0.5
      ? `rgba(255,255,240,${0.02 + Math.random() * 0.03})`
      : `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  feltTileCache.set(base, c);
  return c;
}

function makeFeltTexture(base) {
  const tex = new THREE.CanvasTexture(feltTileCanvas(base));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Mat text decal (UX §5.4): the ceremony's declaration line, composited INTO
// the felt texture so dice land on top of the words. The composite covers the
// whole 160-unit floor plane once (repeat 1,1) with the same 6×6 tile pattern
// the plain texture repeats, plus letterspaced gold caps pressed into the
// center-lower felt. applyFeltTheme mid-ceremony recomposites onto the new
// base; clearMatDecal restores the clean repeating texture. Old textures are
// always disposed by whoever replaces them.
const DECAL_SIZE = 2048;                    // px across the 160-unit plane
const DECAL_PX_PER_UNIT = DECAL_SIZE / 160;
let matDecalText = null;                    // non-null while a decal is applied

function decalTexture(base, text) {
  const c = document.createElement('canvas');
  c.width = c.height = DECAL_SIZE;
  const ctx = c.getContext('2d');
  const tile = feltTileCanvas(base);
  const tileSize = DECAL_SIZE / 6; // matches repeat(6,6) of the plain texture
  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 6; y++) ctx.drawImage(tile, x * tileSize, y * tileSize, tileSize, tileSize);
  }
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
  // camera looks from +z: canvas center = table center, +z (lower felt) = +y
  ctx.fillText(line, DECAL_SIZE / 2, DECAL_SIZE / 2 + 3.4 * DECAL_PX_PER_UNIT);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
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
  // A theme change mid-ceremony keeps the mat text: recomposite on the new base.
  swapFloorMap(matDecalText !== null
    ? decalTexture(theme.feltBase, matDecalText)
    : makeFeltTexture(theme.feltBase));
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

function spawnDie(type, index, count, side, rng) {
  const mesh = createDieMesh(type);
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

// Remove every die, chip, and banner from view WITHOUT touching the playback
// queue or the in-flight roll. Used by playRoll's overflow reset, where queued
// rolls must survive (each client's table fill differs, so wiping the queue
// here would silently drop rolls on some clients but not others).
function resetTableSurface() {
  finishSinkingNow();
  for (const d of tableDice) {
    world.removeBody(d.body);
    scene.remove(d.mesh);
  }
  tableDice = [];
  chips.length = 0;
  chipsLayer.innerHTML = '';
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
  const inFlight = currentRoll && !currentRoll.done && currentRoll.rollId === rollId;
  if (inFlight || rollQueue.some((r) => r.rollId === rollId)) {
    pendingClears.add(rollId);
    return;
  }
  removeRollDice(rollId);
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

function clearTable() {
  flushPendingRollLog();
  pendingClears.clear();
  resetTableSurface();
  dismissCeremonyUI();
  currentRoll = null;
  rollQueue.length = 0;
}

// roll = {dice: [types], values: [...], seed, label, dc?, playerName?, color?}
function playRoll(roll) {
  const types = roll && Array.isArray(roll.dice) ? roll.dice : [];
  const values = roll && Array.isArray(roll.values) ? roll.values : [];
  if (!types.length || types.length !== values.length) return;
  if (types.some((t) => !DIE_DEFS[t])) return;

  // one playback at a time; overlapping rolls queue FIFO. A queued roll
  // auto-skips the previous ceremony's remainder (pinned): skipCeremony
  // finishes the current roll instantly, which drains the queue — including
  // the roll just pushed.
  if (currentRoll && !currentRoll.done) {
    rollQueue.push(roll);
    if (currentRoll.ceremony) skipCeremony();
    return;
  }
  if (tableDice.length + types.length > MAX_DICE_ON_TABLE) resetTableSurface();

  chips.length = 0;
  chipsLayer.innerHTML = '';
  banner.classList.add('hidden');
  dismissCeremonyUI(); // a lingering verdict card/decal yields to the new roll

  // --- spawn with seeded throw params -------------------------------------
  const rng = mulberry32(roll.seed >>> 0);
  const side = Math.floor(rng() * 4);
  const dice = types.map((t, i) => spawnDie(t, i, types.length, side, rng));
  // Every die on the table is tagged with its roll (§7.5): a per-roll Done
  // removes exactly these dice and never touches a concurrent roll's.
  for (const d of dice) d.rollId = roll.rollId || null;
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
    const uBody = up.clone().applyQuaternion(qF.clone().invert()).normalize();
    const nV = faceNormalForValue(d.type, values[i]);
    d.correction = new THREE.Quaternion();
    if (nV) d.correction.setFromUnitVectors(nV.normalize(), uBody);
    d.finalPos = kf[kf.length - 1].pos.clone();
    d.finalQuat = qF.clone().multiply(d.correction);
    const check = readValue(d.type, d.finalQuat);
    if (check.value !== values[i]) {
      console.warn(`face correction mismatch on ${d.type}: expected ${values[i]}, reads ${check.value}`);
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
    values: values.slice(),
    // mechanics metadata (rollspec contract); defaults preserve plain rolls
    perDie: Array.isArray(roll.perDie) && roll.perDie.length === types.length
      ? roll.perDie
      : types.map(() => ({ counts: true, reason: null, childOf: null })),
    modifier: roll.modifier || 0,
    total: typeof roll.total === 'number' ? roll.total : null,
    spec: roll.spec || { dice: types, mods: null },
    dc: Number.isInteger(roll.dc) ? roll.dc : null, // interim dc verdict (UX §2.3 stub)
    exp: sanitizeExp(roll.exp),
    faceDown: !!roll.faceDown,
    revealed: roll.revealed !== false,
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
  // Face-down rolls stay Plain — a verdict card cannot show hidden values.
  if (currentRoll.exp && !currentRoll.faceDown) beginCeremony(currentRoll);
}

// Solo path: compose locally with the same shared mechanics the server uses
// (rollspec.composeRoll), then play. opts: {mods, faceDown, dc} per the contract.
function rollDice(types, label, opts = {}) {
  if (!types.length) return;
  if (validateMods(types, opts.mods || null)) return; // invalid spec: no-op
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
    runPendingClear(roll); // a clear that arrived mid-playback lands now
    if (rollQueue.length) playRoll(rollQueue.shift());
  }
}

// ---------------------------------------------------------------------------
// Results, effects
// ---------------------------------------------------------------------------

const chipsLayer = document.getElementById('chips-layer');
const banner = document.getElementById('result-banner');
const chips = []; // {el, die}

// Build the display entry for a finished playback roll: per-die parts with
// mechanics metadata, authoritative total, meaning, and reveal state.
function entryFromRoll(roll) {
  const types = roll.dice.map((d) => (d.type ? d.type : d)); // die objects or type strings
  const perDie = Array.isArray(roll.perDie) && roll.perDie.length === types.length
    ? roll.perDie
    : types.map(() => ({ counts: true, reason: null, childOf: null }));
  let sum = 0;
  const parts = types.map((type, i) => {
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
  const total = typeof roll.total === 'number' ? roll.total : sum + modifier;
  const meaning = meaningFor(countingBaseTypes(types, perDie), total);
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
    sum,
    modifier,
    total,
    meaning: meaning || undefined,
    dc: Number.isInteger(roll.dc) ? roll.dc : undefined,
    faceDown: !!roll.faceDown,
    revealed: roll.revealed !== false,
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
  const hidden = entry.faceDown && !entry.revealed;

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
function renderRollResults(entry, dice) {
  renderChips(entry, dice);
  const hidden = entry.faceDown && !entry.revealed;

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
  const verdictEl = document.getElementById('result-verdict');
  if (!hidden && Number.isInteger(entry.dc)) {
    const cleared = entry.total >= entry.dc;
    verdictEl.textContent = `vs DC ${entry.dc} — ${cleared ? 'Success' : 'Failure'}`;
    verdictEl.className = cleared ? 'verdict-success' : 'verdict-fail';
  } else {
    verdictEl.textContent = '';
    verdictEl.className = '';
  }

  const meaningEl = document.getElementById('result-meaning');
  const meaning = hidden ? null : entry.meaning;
  meaningEl.textContent = meaning ? meaning.word : '';
  meaningEl.className = meaning ? `tier-${meaning.tier}` : '';
  meaningEl.title = meaning ? `${meaning.rank} column (${meaning.column})` : '';

  banner.classList.remove('hidden', 'crit-success', 'crit-fail');
  renderBannerActions(entry);
  if (meaning && meaning.tier === 'crit-success') {
    banner.classList.add('crit-success');
    playCritEffect('success', meaning.word);
  } else if (meaning && meaning.tier === 'crit-fail') {
    banner.classList.add('crit-fail');
    playCritEffect('fail', meaning.word);
  }
}

// Reveal (roller of a face-down roll) and reroll-last buttons on the banner.
function renderBannerActions(entry) {
  const holder = document.getElementById('banner-actions');
  holder.innerHTML = '';
  const hidden = entry.faceDown && !entry.revealed;
  const mine = !netOnline || (net && entry.playerId === net.playerId);
  if (hidden && mine) {
    const btn = document.createElement('button');
    btn.className = 'btn primary banner-btn';
    btn.textContent = 'Reveal';
    btn.addEventListener('click', () => requestReveal(entry.rollId));
    holder.appendChild(btn);
  }
  if (entry.spec && entry.spec.dice && entry.spec.dice.length) {
    const btn = document.createElement('button');
    btn.className = 'btn ghost banner-btn';
    btn.textContent = '⟳';
    btn.title = 'Roll this again';
    btn.addEventListener('click', () =>
      requestRoll([...entry.spec.dice], entry.label, {
        mods: entry.spec.mods || undefined,
        faceDown: entry.faceDown,
        dc: Number.isInteger(entry.dc) ? entry.dc : undefined,
        exp: entry.spec.exp || undefined, // reroll-last preserves the moment
      })
    );
    holder.appendChild(btn);
  }
  // Per-roll Done (§7.5): the roller's Done removes this roll's dice for
  // everyone (server-validated; solo local) and hides the banner. Spectators
  // get a local-only ✕ — the dice stay until the roller is done.
  if (entry.rollId) {
    const btn = document.createElement('button');
    btn.className = 'btn ghost banner-btn';
    if (mine) {
      btn.textContent = 'Done';
      btn.title = 'Dismiss and remove this roll’s dice for everyone';
      btn.addEventListener('click', () => {
        // No optimistic hide: online, the 'roll-cleared' broadcast hides the
        // banner (applyClearRoll); solo applies synchronously. A failed POST
        // keeps the banner — and its only Done button — instead of stranding
        // the dice on everyone's table with no per-roll affordance left.
        btn.disabled = true;
        requestClearRoll(entry.rollId).then((ok) => {
          btn.disabled = false;
          if (!ok) showSettingsNote('couldn’t clear the roll — try again');
        });
      });
    } else {
      btn.textContent = '✕';
      btn.title = 'Dismiss for you — the dice stay until the roller is done';
      btn.addEventListener('click', () => banner.classList.add('hidden'));
    }
    holder.appendChild(btn);
  }
}

function showResults(roll) {
  const entry = entryFromRoll(roll);
  lastEntry = entry;
  renderRollResults(entry, roll.dice);
  addLogEntry(entry);
}

// A face-down roll got flipped (server 'reveal' event, hello resync, or solo
// action). Idempotent: replaying a reveal this client already applied only
// repaints, so the hello resync can call it for every revealed roll in the log.
function applyReveal(rollId) {
  const entry = log.find((e) => e.rollId === rollId);
  if (entry && !entry.revealed) {
    entry.revealed = true;
    if (!netOnline) save(LS_LOG, log);
    renderLog();
  }
  if (lastEntry && lastEntry.rollId === rollId) {
    lastEntry.revealed = true;
    // A reveal landing while a ceremony is mid-flight must stay log-only:
    // renderRollResults would un-hide the suppressed result banner (and can
    // replay a crit overlay) on top of the intent/verdict cards. A banner the
    // viewer already dismissed stays dismissed for the same reason.
    const ceremonyActive = currentRoll && currentRoll.ceremony && !currentRoll.done;
    if (!ceremonyActive && !banner.classList.contains('hidden')) {
      const dice = currentRoll && currentRoll.rollId === rollId ? currentRoll.dice : null;
      renderRollResults(lastEntry, dice);
    }
  }
}

function requestReveal(rollId) {
  if (netOnline && net) net.reveal(rollId); // 'reveal' event applies it
  else applyReveal(rollId);
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
  const m = cer.entry.meaning;
  if (m && (m.tier === 'crit-success' || m.tier === 'crit-fail')) {
    ceremonyLayer.classList.add('crit');
    playCritEffect(m.tier === 'crit-success' ? 'success' : 'fail', m.word);
  }
  renderVerdictCard(roll, cer.entry);
  setCeremonyPhaseClass(roll, 'c-verdict');
}

function ceremonyFinish(roll) {
  const cer = roll.ceremony;
  if (cer.phase === 'done') return;
  cer.phase = 'done';
  roll.done = true;
  clearTimeout(ceremonyDismissTimer);
  ceremonyDismissTimer = setTimeout(dismissCeremonyUI, CEREMONY_DISMISS_MS);
  runPendingClear(roll); // a clear that arrived mid-ceremony lands now
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
  const who = entry.playerName ? `${entry.playerName} · ` : '';
  document.getElementById('verdict-eyebrow').textContent = `${who}${entry.label || ''}`;
  document.getElementById('verdict-total').textContent = String(entry.total);

  // §7.5: the roller's control reads Done and clears the roll for everyone;
  // a spectator's reads ✕ and only dismisses locally.
  const mine = !netOnline || (net && entry.playerId === net.playerId);
  verdictFor = { rollId: entry.rollId || null, mine };
  const doneBtn = document.getElementById('verdict-done');
  doneBtn.textContent = mine ? 'Done' : '✕';
  doneBtn.title = mine
    ? 'Dismiss and remove this roll’s dice for everyone'
    : 'Dismiss for you — the dice stay until the roller is done';

  const hasDc = Number.isInteger(entry.dc);
  const ring = document.getElementById('ring-fill');
  const CIRC = 326.7;
  const frac = hasDc ? Math.max(0.04, Math.min(entry.total / entry.dc, 1)) : 1;
  ring.style.strokeDashoffset = String(Math.round(CIRC * (1 - frac) * 10) / 10);
  ring.classList.toggle('fail', hasDc && entry.total < entry.dc);

  const marginEl = document.getElementById('verdict-margin');
  const heroEl = document.getElementById('verdict-hero');
  const chartEl = document.getElementById('verdict-chart');
  heroEl.className = 'verdict-hero';
  chartEl.textContent = '';
  marginEl.textContent = '';
  if (hasDc) {
    // §2.5: the target verdict owns the hero slot; the Soul Deal word demotes
    // to a labeled chart line. Never merged, never hidden.
    const cleared = entry.total >= entry.dc;
    marginEl.append(`vs DC ${entry.dc} · margin `);
    const b = document.createElement('b');
    b.textContent = fmtNum(entry.total - entry.dc);
    marginEl.appendChild(b);
    heroEl.textContent = cleared ? 'Success' : 'Failure';
    if (!cleared) heroEl.classList.add('bad');
    if (entry.meaning) {
      chartEl.append('Chart · ');
      const w = document.createElement('span');
      w.className = 'chart-word';
      w.textContent = entry.meaning.word;
      chartEl.appendChild(w);
    }
  } else if (entry.meaning) {
    heroEl.textContent = entry.meaning.word;
    heroEl.classList.add(`tier-${entry.meaning.tier}`);
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
// to its final keyframe, chips, banner and log line. fastForwardPlayback is
// the same machinery a hidden tab uses on refocus, so anything queued behind
// this roll lands settled as well. Ceremony rolls keep their own richer skip.
function skipPlainPlayback() {
  if (!currentRoll || currentRoll.done || currentRoll.ceremony) return false;
  fastForwardPlayback();
  return true;
}
container.addEventListener('click', () => { skipPlainPlayback(); });

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
  if (skipPlainPlayback()) e.preventDefault();
});
document.getElementById('verdict-done').addEventListener('click', (e) => {
  e.stopPropagation();
  const v = verdictFor;
  const btn = e.currentTarget;
  // Roller: per-roll Done — the dice leave with their moment (§7.5). Not
  // dismissed optimistically: online, the 'roll-cleared' broadcast closes the
  // card (applyClearRoll dismisses the ceremony UI); solo applies
  // synchronously. A failed POST keeps the card and its Done button — the
  // dice are still on everyone's table, so the affordance must survive.
  if (v && v.mine && v.rollId) {
    btn.disabled = true;
    requestClearRoll(v.rollId).then((ok) => {
      btn.disabled = false;
      if (!ok) showSettingsNote('couldn’t clear the roll — try again');
    });
  } else {
    dismissCeremonyUI(); // spectator ✕ (or a roll with no id): local dismiss only
  }
});
document.getElementById('verdict-again').addEventListener('click', (e) => {
  e.stopPropagation();
  rerollLast(); // same semantics as the 'r' shortcut
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

// The physics world is only stepped inside playRoll's synchronous
// fast-forward; the rAF loop just advances keyframe playback.
function tick(dt, render = true) {
  stepPlayback(dt);
  stepSinking(dt); // per-roll Done departures (§7.5)
  if (chips.length) positionChips();
  if (render) renderer.render(scene, camera);
}

function animate() {
  requestAnimationFrame(animate);
  tick(Math.min(clock.getDelta(), 0.1));
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
  get cmdHistory() { return cmdHistory; },
  get tableDice() { return tableDice; },
  get currentRoll() { return currentRoll; },
  get busy() { return !!(currentRoll && !currentRoll.done) || rollQueue.length > 0; },
  get queueLength() { return rollQueue.length; },
  get net() { return { online: netOnline, playerId: net ? net.playerId : null }; },
  get netReady() { return netReady; },
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
      const mini = document.body.classList.contains('mini');
      const row = (mini
        ? document.querySelector(`#mini-bar [data-group-id="${g.id}"]`)
        : document.querySelector(`#groups-list [data-group-id="${g.id}"]`)) || null;
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
      faceDown: pop.faceDown,
      open: !document.getElementById('mods-popover').classList.contains('hidden'),
    };
  },
  closePopover() { closePopover(); },
  // per-roll Done (§7.5): the roller-side entry point + sink observability
  clearRoll(rollId) { return requestClearRoll(rollId); },
  get sinkingCount() { return sinking.length; },
  get pendingClears() { return [...pendingClears]; },
  sim(frames) { for (let i = 0; i < frames; i++) tick(1 / 60, false); },
  fastForward: fastForwardPlayback,
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  positionChips();
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
    requestRoll(cmdResult.spec.dice, name || cmdResult.comment || cmdResult.canonical, {
      notation: cmdInput.value.trim(),
      canonical: cmdResult.canonical,
      mods: cmdResult.spec.mods || undefined,
      faceDown: cmdResult.faceDown,
      dc: cmdResult.dc ?? undefined,
      exp: cmdResult.dc != null ? { kind: 'check' } : undefined, // dc implies Check (§2.3)
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
  boxExtras = { mods: null, dc: null, comment: null };
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
// mods, dc, comment, and — since UX §7.6 gave them a spelling — the moment and
// face-down. Adding a die to the tray must not quietly undress the roll.
let boxExtras = { mods: null, dc: null, comment: null, exp: null, faceDown: false };

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
      faceDown: res.faceDown,
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
  cmdInput.value = canonicalNotation({ dice: [...tray], mods }, {
    dc: boxExtras.dc,
    comment: boxExtras.comment,
    exp: boxExtras.exp,
    faceDown: boxExtras.faceDown,
  });
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
  const dressed = canonicalNotation(res.spec, {
    dc: res.dc,
    comment: res.comment,
    exp,
    faceDown: res.faceDown,
  });
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
    dc: res.dc ?? undefined,
    exp: intent.exp || undefined,
  });
  return res;
}

// Offer a notation string to the table (Shift+Enter — §7.4). Same validation
// gates as commandRoll; online only (callers show the solo refusal).
function commandOffer(input) {
  const raw = (typeof input === 'string' ? input : cmdInput.value).trim();
  const res = parseNotation(raw);
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

// Load a group's notation into the command box for editing (UX §1.4).
function loadIntoBox(notation, name) {
  cmdInput.value = notation;
  groupNameInput.value = name || '';
  paintCmd();
  cmdInput.focus();
}

// Roll a saved group: parse its notation and roll the parsed spec. Online the
// notation string itself goes up (the server's parse is authoritative).
function rollGroup(g) {
  const res = parseNotation(g.notation);
  if (!res.ok) return;
  const intent = notationIntent(g.notation, res);
  requestRoll(res.spec.dice, g.name || res.comment || res.canonical, {
    notation: intent.notation,
    canonical: intent.canonical,
    mods: res.spec.mods || undefined,
    faceDown: res.faceDown, // saved groups carry 'held' now (§7.6)
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

    const info = document.createElement('div');
    info.className = 'group-info';
    info.title = 'Load into the command box to edit';
    const nameEl = document.createElement('div');
    nameEl.className = 'group-name' + (g.name ? '' : ' as-notation');
    nameEl.textContent = g.name || g.notation; // unnamed: the notation is the name
    info.appendChild(nameEl);
    if (g.name) {
      const chip = document.createElement('code');
      chip.className = 'group-formula';
      chip.textContent = g.notation;
      chip.title = `${g.notation}  ·  click to edit in the command box`;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        loadIntoBox(g.notation, g.name);
      });
      info.appendChild(chip);
    }
    info.addEventListener('click', () => loadIntoBox(g.notation, g.name));

    const modsBtn = document.createElement('button');
    modsBtn.className = 'group-mods';
    modsBtn.textContent = '±';
    modsBtn.title = 'Modifiers, target, face down';
    modsBtn.addEventListener('click', () => togglePopover(g, row));

    const rollBtn = document.createElement('button');
    rollBtn.className = 'group-roll';
    rollBtn.textContent = 'Roll';
    rollBtn.addEventListener('click', () => rollGroup(g));

    const delBtn = document.createElement('button');
    delBtn.className = 'group-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete group';
    delBtn.addEventListener('click', () => {
      if (pop && pop.source === 'group' && pop.groupId === g.id) closePopover();
      groups = groups.filter((x) => x.id !== g.id);
      saveGroups();
      renderGroups();
    });

    row.append(info, modsBtn, rollBtn, delBtn);
    groupsListEl.appendChild(row);
    // renderGroups can run while this group's popover is open (e.g. after a
    // variant save) — re-anchor it to the fresh row.
    if (pop && pop.source === 'group' && pop.groupId === g.id && !document.body.classList.contains('mini')) {
      row.classList.add('open');
      pop.row = row;
    }
  }
  renderMiniBar();
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
    window.prompt('Copy this link to save your groups:', window.location.href);
    btn.textContent = 'link';
  }
  setTimeout(() => { btn.textContent = 'copy link'; }, 1500);
});

// ---------------------------------------------------------------------------
// ± popover (docs/mockups/panel.html): per-group modifier + attributed parts,
// adv/dis, keep/drop, reroll, explode, face down, dc and comment. Opening it
// parses the group's notation into edit state; every edit re-renders the
// canonical echo and Monte Carlo preview. Roll/Offer act on the edited spec;
// 'Save as variant' appends a new group — the original group is only changed
// through the command box + Save.
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
const popSwFaceDown = document.getElementById('pop-sw-facedown');
const popDcInput = document.getElementById('pop-dc');
const popCommentInput = document.getElementById('pop-comment');
const popSegExp = document.getElementById('pop-seg-exp');
const popExpSubtitle = document.getElementById('pop-exp-subtitle');
const popPreviewEl = document.getElementById('pop-preview');
const popRollBtn = document.getElementById('pop-roll');
const popOfferBtn = document.getElementById('pop-offer');
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
    faceDown: res.faceDown,
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
// mini). Full view: beside the left panel, next to the source row. Mini: above
// the anchoring pill (the panel is hidden), clamped within the viewport.
function placePopover() {
  if (!pop) return;
  const w = popEl.offsetWidth;
  const h = popEl.offsetHeight;
  const anchor = pop.row ? pop.row.getBoundingClientRect() : null;
  const mini = document.body.classList.contains('mini');
  let left, top;
  if (mini && anchor) {
    left = Math.round(anchor.left);
    top = Math.round(anchor.top - h - 8);
  } else {
    const panelRect = document.getElementById('left-panel').getBoundingClientRect();
    left = Math.round(panelRect.right + 10);
    top = anchor ? Math.round(anchor.top - 46) : 12;
  }
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
  return canonicalNotation(popSpec(), {
    dc: pop.dc,
    comment: pop.comment,
    exp: popExp() || null,
    faceDown: pop.faceDown,
  });
}

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
  popPreviewEl.textContent = err
    ? `invalid spec: ${err}`
    : fmtPreview(spec.dice, spec.mods).replace(/ (avg|max)/g, ' · $1') + (pop.faceDown ? ' · face down' : '');
  popRollBtn.disabled = !!err;
  popOfferBtn.disabled = !!err || !netOnline;
  popOfferBtn.title = netOnline
    ? 'Post this roll for anyone at the table to take'
    : 'Offers need a table — you are playing solo';
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
  popSwFaceDown.setAttribute('aria-pressed', String(!!pop.faceDown));

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
popSwFaceDown.addEventListener('click', () => {
  if (!pop) return;
  pop.faceDown = !pop.faceDown;
  renderPop();
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
  requestRoll(spec.dice, pop.comment || pop.name, {
    mods: spec.mods || undefined,
    faceDown: pop.faceDown,
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
  net.offer({
    label: pop.comment || pop.name,
    dice: spec.dice,
    mods: spec.mods || undefined,
    faceDown: pop.faceDown,
    dc: pop.dc ?? undefined,
    exp: popExp(),
  });
  closePopover();
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
const logPanel = document.getElementById('log-panel');
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
    const hidden = entry.faceDown && !entry.revealed;
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
      ? '<span class="log-hidden">face down</span>'
      : entry.parts
          .map((p) => {
            let cls = p.isMax && p.counts ? 'crit-max' : p.isMin && p.counts ? 'crit-min' : '';
            if (!p.counts) cls += ' log-discarded';
            const star = p.child ? '✴' : '';
            return `<span class="${cls.trim()}">${star}${p.type}&thinsp;${p.label}</span>`;
          })
          .join(' + ') + modHtml;
    // interim dc verdict (fixed decision): "vs N ✓/✗" — hidden while face down
    const verdictHtml = !hidden && Number.isInteger(entry.dc)
      ? `<span class="log-verdict ${entry.total >= entry.dc ? 'ok' : 'bad'}">vs ${entry.dc} ${entry.total >= entry.dc ? '✓' : '✗'}</span>`
      : '';
    const meaningHtml = !hidden && entry.meaning
      ? `<span class="log-meaning tier-${entry.meaning.tier}"></span>`
      : '';
    el.innerHTML = `
      <div class="log-head">
        <span class="log-group"></span>
        <span class="log-actions"></span>
        <span class="log-total">${hidden ? '?' : entry.total}</span>
      </div>
      <div class="log-detail">${detail}${verdictHtml ? '  ·  ' + verdictHtml : ''}${meaningHtml ? '  ·  ' + meaningHtml : ''}</div>
      <div class="log-time">${fmtTime(entry.t)}</div>`;
    if (meaningHtml) el.querySelector('.log-meaning').textContent = entry.meaning.word;
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
    if (entry.spec && entry.spec.dice && entry.spec.dice.length) {
      const again = document.createElement('button');
      again.className = 'log-again';
      again.textContent = '⟳';
      again.title = 'Roll this again';
      again.addEventListener('click', () =>
        requestRoll([...entry.spec.dice], entry.label, {
          mods: entry.spec.mods || undefined,
          faceDown: entry.faceDown,
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
// Top controls
// ---------------------------------------------------------------------------

document.getElementById('corner-clear').addEventListener('click', () => requestClear());

document.getElementById('toggle-log').addEventListener('click', () => {
  logPanel.classList.toggle('hidden');
});

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

// ---------------------------------------------------------------------------
// Settings (roadmap §2): gear → modal with two scopes. "Just you" — sound and
// the mini-mode preference, both local. "Everyone at the table" — the felt
// theme, which is room state: online a swatch click POSTs a settings patch and
// the UI applies only on the 'settings-changed' echo (no optimistic
// double-apply); solo applies immediately and persists LS_ROOMSETTINGS.
// ---------------------------------------------------------------------------

// Current merged room settings. Key-by-key application below is deliberate:
// the next slice adds keys (experiences) without reshaping this.
let roomSettings = { felt: DEFAULT_FELT };

// Apply a full merged settings object (join response, hello, settings-changed
// echo, or the solo localStorage copy). Unknown keys/values are ignored.
function applyRoomSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (typeof settings.felt === 'string' && FELT_THEMES[settings.felt]) {
    roomSettings.felt = settings.felt;
    if (settings.felt !== currentFeltId) applyFeltTheme(settings.felt);
    else renderFeltSwatches();
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
  document.getElementById('set-mini')
    .setAttribute('aria-pressed', String(document.body.classList.contains('mini')));
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
document.getElementById('set-mini').addEventListener('click', () => {
  setMini(!document.body.classList.contains('mini'));
});

// ---------------------------------------------------------------------------
// Mini mode: hide all chrome except a compact strip of group pills, sized to
// live in a small corner window during a video call. The 3D table, result
// banner, chips, and crit effects stay.
// ---------------------------------------------------------------------------

const LS_MINI = 'dice.mini.v1';

// Called from renderGroups(), which runs during module evaluation — resolve
// the element here rather than via a module-level const declared below.
const PILL_LONGPRESS_MS = 500;

function renderMiniBar() {
  const miniBar = document.getElementById('mini-bar');
  miniBar.innerHTML = '';
  for (const g of groups) {
    const pill = document.createElement('button');
    pill.className = 'mini-pill';
    pill.dataset.groupId = String(g.id);
    pill.textContent = g.name || g.notation; // user-supplied: textContent only
    pill.title = g.notation; // UX §1.4: the pill's title is the notation
    // §7.4 compact-pill column: tap = roll; contextmenu OR a ~500 ms pointer
    // long-press (touch included) opens the ± popover bound to this group.
    // A long-press must NOT also roll: the click that follows it is swallowed
    // via the suppress flag. Both flags re-arm on pointerdown — a press
    // released off the pill fires no click, and a stale flag must not eat the
    // NEXT tap. One touch long-press can fire BOTH the JS timer and the
    // platform's native contextmenu (either order, e.g. Android with a long
    // touch-and-hold delay): openPill is a toggle, so gestureHandled makes
    // whichever lands second a no-op instead of a re-toggle that closes the
    // popover the first one just opened.
    let lpTimer = null;
    let suppressClick = false;
    let gestureHandled = false;
    const openPill = () => {
      if (pop && pop.source === 'group' && pop.groupId === g.id) closePopover();
      else openPopover({ source: 'group', group: g, row: pill });
    };
    pill.addEventListener('click', () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      rollGroup(g);
    });
    pill.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      clearTimeout(lpTimer);
      if (gestureHandled) return;
      gestureHandled = true;
      suppressClick = true; // some engines fire a click after a touch contextmenu
      openPill();
    });
    pill.addEventListener('pointerdown', (e) => {
      gestureHandled = false;
      suppressClick = false;
      clearTimeout(lpTimer);
      if (e.pointerType === 'mouse' && e.button !== 0) return; // right-click: contextmenu path
      lpTimer = setTimeout(() => {
        gestureHandled = true;
        suppressClick = true;
        openPill();
      }, PILL_LONGPRESS_MS);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      pill.addEventListener(ev, () => clearTimeout(lpTimer));
    }
    miniBar.appendChild(pill);
    // renderMiniBar can rebuild while this group's popover is anchored to the
    // old pill (e.g. after a variant save in mini) — re-anchor to the new one.
    if (pop && pop.source === 'group' && pop.groupId === g.id
        && document.body.classList.contains('mini')) {
      pop.row = pill;
    }
  }
}

function applyCameraFraming() {
  if (document.body.classList.contains('mini')) camera.position.set(0, 22, 12.5);
  else camera.position.set(0, 27, 15.5);
  camera.lookAt(0, 0, 0.5);
}

function setMini(on, persist = true) {
  document.body.classList.toggle('mini', on);
  const btn = document.getElementById('corner-mini');
  btn.textContent = on ? '⤢' : '⤡';
  btn.title = on ? 'Full view' : 'Compact view';
  if (persist) save(LS_MINI, on);
  applyCameraFraming();
  positionChips();
  // An on-stage ceremony needs nothing: it keeps playing, re-scaled (§7.4).
  syncSettingsUI(); // the settings modal mirrors the mini preference
}

document.getElementById('corner-mini').addEventListener('click', () => {
  setMini(!document.body.classList.contains('mini'));
});

// Small windows start in mini mode unless the user has expressed a preference.
{
  const stored = load(LS_MINI, null);
  const smallViewport = window.innerWidth < 640 || window.innerHeight < 480;
  setMini(stored ?? smallViewport, false);
}

// ---------------------------------------------------------------------------
// Quick palette: a transient centered command strip ('/' / Ctrl/Cmd+K / the
// ❯ corner button). Same validation machinery, roll path, and history store
// as the panel command box (shared helpers above) — the panel box's draft is
// never disturbed. Enter valid: roll + close; invalid: refusal shake, stays;
// incomplete: nothing. Esc / backdrop click dismiss. Works in mini mode.
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

document.getElementById('corner-palette').addEventListener('click', () => {
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
  if (!entry || !entry.spec || !entry.spec.dice || !entry.spec.dice.length) return;
  requestRoll([...entry.spec.dice], entry.label, {
    mods: entry.spec.mods || undefined,
    faceDown: entry.faceDown,
    dc: Number.isInteger(entry.dc) ? entry.dc : undefined,
    exp: entry.spec.exp || undefined, // reroll-last preserves the moment
  });
}

// Single global keydown handler. Layer guards are checked BEFORE any handler
// mutates state, so one Esc can never fall through two layers:
//   Esc peels the topmost layer only — cheatsheet > palette > settings modal
//   > ± popover (extends the earlier popover/modal layering fix).
// Table shortcuts fire only with no text input focused and no layer open
// (the ± popover counts as open UI). Space keeps its skip-ceremony handler.
document.addEventListener('keydown', (e) => {
  // Held keys auto-repeat: without this guard a held 'r'/digit floods rolls,
  // held 'm' thrashes mini mode, and held '/' opens the palette then types
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
    case 'm': setMini(!document.body.classList.contains('mini')); return;
    case 'l': logPanel.classList.toggle('hidden'); return;
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

const playersPanel = document.getElementById('players-panel');
const playersList = document.getElementById('players-list');
const statusPill = document.getElementById('status-pill');

function setPill(text, cls) {
  if (!text) {
    statusPill.classList.add('hidden');
    return;
  }
  statusPill.textContent = text;
  statusPill.className = cls || '';
}

function renderPlayers() {
  playersList.innerHTML = '';
  const you = net ? net.playerId : null;
  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    const dot = document.createElement('span');
    dot.className = 'player-dot';
    dot.style.background = p.color || '#888';
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = p.name; // user-supplied: textContent only
    row.append(dot, name);
    if (p.id === you) {
      const tag = document.createElement('span');
      tag.className = 'player-you';
      tag.textContent = '(you)';
      row.appendChild(tag);
      row.classList.add('player-self');
      row.title = 'Click to change your name';
      row.addEventListener('click', () => beginRename(row, name, p));
    }
    playersList.appendChild(row);
  }
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
    detail.textContent = formula(o.dice || [])
      + (summary ? `  ·  ${summary}` : '')
      + (Number.isInteger(o.dc) ? `  ·  vs ${o.dc}` : '')
      + (o.faceDown ? '  ·  face down' : '')
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

// Inline rename: swap your name for an input; Enter/blur commits, Esc cancels.
function beginRename(row, nameEl, player) {
  if (row.querySelector('input')) return;
  const input = document.createElement('input');
  input.className = 'player-rename';
  input.maxLength = 24;
  input.value = player.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    const newName = cutText(input.value, 24);
    input.replaceWith(nameEl);
    if (!commit || !newName || newName === player.name) return;
    nameEl.textContent = newName; // optimistic; broadcast confirms
    try { localStorage.setItem(LS_NAME, newName); } catch { /* ignore */ }
    if (netOnline && net) await net.rename(newName);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
    e.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
}

// Server Roll -> display log entry: same conversion showResults uses.
function rollToLogEntry(roll) {
  return entryFromRoll({ ...roll, label: roll.label || formula(roll.dice || []) });
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
        if (r.faceDown && r.revealed) applyReveal(r.rollId);
        if (r.cleared) applyClearRoll(r.rollId);
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
      applyReveal(data.rollId);
      break;
    case 'roll-cleared': // per-roll Done (§7.5) — roller-validated server side
      applyClearRoll(data.rollId);
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

// Roll/clear entry points used by the UI buttons.
// opts: {mods, faceDown, dc, notation, canonical}. `notation` routes the raw
// string to the server (its parse is authoritative); `canonical` is only the
// history entry — every successful roll from any path lands in
// 'dice.cmdhistory.v1' as its canonical string.
function requestRoll(types, label, opts = {}) {
  if (!types.length) return;
  const canonical = opts.canonical || canonicalNotation(
    { dice: types, mods: opts.mods || null },
    { dc: Number.isInteger(opts.dc) ? opts.dc : null, comment: null }
  );
  // History records only rolls that actually happened: online that means the
  // server accepted it (a 400 or a network failure resolves null), solo it
  // means the spec passed the same validation rollDice applies.
  if (netOnline && net) {
    // animation waits for the SSE event
    net.roll(types, label, opts).then((roll) => { if (roll) pushHistory(canonical); });
  } else {
    if (validateMods(types, opts.mods || null)) return; // invalid spec: no roll
    rollDice(types, label, opts);
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
    modal.classList.remove('hidden');
    const update = () => { joinBtn.disabled = !input.value.trim(); };
    input.addEventListener('input', update);
    update();
    const submit = () => {
      const name = cutText(input.value, 24);
      if (!name) return;
      modal.classList.add('hidden');
      resolve(name);
    };
    joinBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
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

  const conn = await connect({ room: ROOM, name, onEvent: handleNetEvent, onStatus: handleNetStatus });
  if (conn.online) {
    net = conn;
    netOnline = true;
    players = conn.players || [];
    renderPlayers();
    playersPanel.classList.remove('hidden');
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
  return { online: netOnline };
}

const netReady = initNet();
