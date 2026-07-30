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

// felt table surface
function makeFeltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f3128';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const shade = Math.random();
    ctx.fillStyle = shade > 0.5
      ? `rgba(255,255,240,${0.02 + Math.random() * 0.03})`
      : `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({ map: makeFeltTexture(), roughness: 0.95, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

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
let soundOn = true;
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

// Same value ranges as the multiplayer server contract.
function rollValue(type) {
  if (type === 'd10x') return Math.floor(Math.random() * 10) * 10;
  const [lo, hi] = valueRange(type);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
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
  for (const d of tableDice) {
    world.removeBody(d.body);
    scene.remove(d.mesh);
  }
  tableDice = [];
  chips.length = 0;
  chipsLayer.innerHTML = '';
  banner.classList.add('hidden');
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
    addLogEntry(rollToLogEntry({
      rollId: currentRoll.rollId,
      dice: currentRoll.dice.map((d) => d.type),
      values: currentRoll.values,
      label: currentRoll.label,
      playerName: currentRoll.playerName,
      color: currentRoll.color,
      t: currentRoll.t,
    }));
  }
  while (rollQueue.length) addLogEntry(rollToLogEntry(rollQueue.shift()));
}

function clearTable() {
  flushPendingRollLog();
  resetTableSurface();
  currentRoll = null;
  rollQueue.length = 0;
}

// roll = {dice: [types], values: [...], seed, label, playerName?, color?}
function playRoll(roll) {
  const types = roll && Array.isArray(roll.dice) ? roll.dice : [];
  const values = roll && Array.isArray(roll.values) ? roll.values : [];
  if (!types.length || types.length !== values.length) return;
  if (types.some((t) => !DIE_DEFS[t])) return;

  // one playback at a time; overlapping rolls queue FIFO
  if (currentRoll && !currentRoll.done) {
    rollQueue.push(roll);
    return;
  }
  if (tableDice.length + types.length > MAX_DICE_ON_TABLE) resetTableSurface();

  chips.length = 0;
  chipsLayer.innerHTML = '';
  banner.classList.add('hidden');

  // --- spawn with seeded throw params -------------------------------------
  const rng = mulberry32(roll.seed >>> 0);
  const side = Math.floor(rng() * 4);
  const dice = types.map((t, i) => spawnDie(t, i, types.length, side, rng));
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
    values: values.slice(),
    seed: roll.seed,
    dice,
    keyframes,
    sounds,
    frames: keyframes[0].length,
    duration: (keyframes[0].length - 1) * FIXED_DT,
    time: 0,
    soundIdx: 0,
    done: false,
  };
}

// Solo path: generate values locally (same ranges as the server) and play.
function rollDice(types, label) {
  if (!types.length) return;
  playRoll({
    dice: [...types],
    values: types.map((t) => rollValue(t)),
    seed: randomSeed(),
    label: label || formula(types),
  });
}

// Advance the active playback by dt: interpolate meshes between keyframes
// (lerp pos, slerp quat, then apply the corrective pre-rotation R) and replay
// recorded collision sounds at their recorded times.
function stepPlayback(dt) {
  const roll = currentRoll;
  if (!roll || roll.done) return;
  roll.time += dt;

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
    roll.done = true;
    for (const d of roll.dice) {
      d.mesh.position.copy(d.finalPos);
      d.mesh.quaternion.copy(d.finalQuat);
    }
    showResults(roll);
    if (rollQueue.length) playRoll(rollQueue.shift());
  }
}

// ---------------------------------------------------------------------------
// Results, effects
// ---------------------------------------------------------------------------

const chipsLayer = document.getElementById('chips-layer');
const banner = document.getElementById('result-banner');
const chips = []; // {el, die}

// Chips, banner, crits, and the log entry — always from roll.values
// (authoritative), never re-read from physics.
function showResults(roll) {
  let total = 0;
  const parts = [];
  chips.length = 0;
  chipsLayer.innerHTML = '';

  roll.dice.forEach((d, i) => {
    const value = roll.values[i];
    const label = dieLabel(d.type, value);
    total += value;
    const [lo, hi] = valueRange(d.type);
    const isMax = value === hi;
    const isMin = value === lo;
    parts.push({ type: d.type, label, value, isMax, isMin });

    const el = document.createElement('div');
    el.className = 'value-chip' + (isMax ? ' max' : isMin ? ' min' : '');
    el.style.setProperty('--die-color', DIE_DEFS[d.type].color);
    el.textContent = label;
    chipsLayer.appendChild(el);
    chips.push({ el, die: d });
  });
  positionChips();

  // Names and labels are user-supplied: textContent only, never innerHTML.
  const labelEl = document.getElementById('result-label');
  labelEl.textContent = '';
  if (roll.playerName) {
    const who = document.createElement('span');
    who.className = 'roller-name';
    if (roll.color) who.style.color = roll.color;
    who.textContent = roll.playerName;
    labelEl.append(who, ` · ${roll.label}`);
  } else {
    labelEl.textContent = roll.label;
  }
  document.getElementById('result-total').textContent = total;
  document.getElementById('result-breakdown').textContent =
    parts.length > 1 ? parts.map((p) => `${p.type} ${p.label}`).join('  ·  ') : '';

  // "Your Soul Deal" chart: the summed total decides the roll's meaning.
  const meaning = meaningFor(roll.dice.map((d) => d.type), total);
  const meaningEl = document.getElementById('result-meaning');
  meaningEl.textContent = meaning ? meaning.word : '';
  meaningEl.className = meaning ? `tier-${meaning.tier}` : '';
  meaningEl.title = meaning ? `${meaning.rank} column (${meaning.column})` : '';

  banner.classList.remove('hidden', 'crit-success', 'crit-fail');
  if (meaning && meaning.tier === 'crit-success') {
    banner.classList.add('crit-success');
    playCritEffect('success', meaning.word);
  } else if (meaning && meaning.tier === 'crit-fail') {
    banner.classList.add('crit-fail');
    playCritEffect('fail', meaning.word);
  }

  addLogEntry({
    rollId: roll.rollId || undefined,
    t: roll.t || Date.now(),
    label: roll.label,
    playerName: roll.playerName || undefined,
    color: roll.color || undefined,
    parts,
    total,
    meaning: meaning || undefined,
  });
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
// Animation loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

// The physics world is only stepped inside playRoll's synchronous
// fast-forward; the rAF loop just advances keyframe playback.
function tick(dt, render = true) {
  stepPlayback(dt);
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
    stepPlayback(currentRoll.duration - currentRoll.time + FIXED_DT);
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
  get tableDice() { return tableDice; },
  get currentRoll() { return currentRoll; },
  get busy() { return !!(currentRoll && !currentRoll.done) || rollQueue.length > 0; },
  get queueLength() { return rollQueue.length; },
  get net() { return { online: netOnline, playerId: net ? net.playerId : null }; },
  get netReady() { return netReady; },
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

const dieButtonsEl = document.getElementById('die-buttons');
const trayEl = document.getElementById('tray');
const rollTrayBtn = document.getElementById('roll-tray');
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
    }
  });
  dieButtonsEl.appendChild(btn);
}

function formula(types) {
  const counts = new Map();
  for (const t of types) counts.set(t, (counts.get(t) || 0) + 1);
  return DIE_TYPES.filter((t) => counts.has(t)).map((t) => `${counts.get(t)}${t}`).join(' + ');
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
    });
    trayEl.appendChild(chip);
  });
  const empty = tray.length === 0;
  rollTrayBtn.disabled = empty;
  clearTrayBtn.disabled = empty;
  saveGroupBtn.disabled = empty;
}
renderTray();

rollTrayBtn.addEventListener('click', () => {
  requestRoll([...tray], groupNameInput.value.trim() || formula(tray));
});
clearTrayBtn.addEventListener('click', () => {
  tray = [];
  renderTray();
});

// ---------------------------------------------------------------------------
// Saved groups
// ---------------------------------------------------------------------------

// Groups come from the URL hash when one is present (a bookmarked #g=… link
// restores them anywhere — stateless), otherwise from localStorage, otherwise
// starter defaults. Every change is written back to BOTH localStorage and the
// URL hash, so the address bar is always a saveable snapshot.
let groups = groupsFromLocation() || load(LS_GROUPS, null);
if (!groups) {
  groups = [
    { id: 1, name: 'Attack', dice: ['d20'] },
    { id: 2, name: 'Damage', dice: ['d4', 'd4', 'd4'] },
    { id: 3, name: 'Percentile', dice: ['d10x', 'd10'] },
  ];
}

function saveGroups() {
  save(LS_GROUPS, groups);
  syncGroupsToLocation(groups);
}
saveGroups();

const groupsListEl = document.getElementById('groups-list');
const groupsEmptyEl = document.getElementById('groups-empty');

function renderGroups() {
  groupsListEl.innerHTML = '';
  groupsEmptyEl.style.display = groups.length ? 'none' : 'block';
  for (const g of groups) {
    const row = document.createElement('div');
    row.className = 'group-row';

    const info = document.createElement('div');
    info.className = 'group-info';
    info.title = 'Load into tray to edit';
    info.innerHTML = `<div class="group-name"></div><div class="group-formula"></div>`;
    info.querySelector('.group-name').textContent = g.name;
    info.querySelector('.group-formula').textContent = formula(g.dice);
    info.addEventListener('click', () => {
      tray = [...g.dice];
      groupNameInput.value = g.name;
      renderTray();
    });

    const rollBtn = document.createElement('button');
    rollBtn.className = 'btn primary group-roll';
    rollBtn.textContent = 'Roll';
    rollBtn.addEventListener('click', () => requestRoll([...g.dice], g.name));

    const delBtn = document.createElement('button');
    delBtn.className = 'group-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete group';
    delBtn.addEventListener('click', () => {
      groups = groups.filter((x) => x.id !== g.id);
      saveGroups();
      renderGroups();
    });

    row.append(info, rollBtn, delBtn);
    groupsListEl.appendChild(row);
  }
  renderMiniBar();
}
renderGroups();

saveGroupBtn.addEventListener('click', () => {
  if (!tray.length) return;
  const name = groupNameInput.value.trim() || formula(tray);
  const existing = groups.find((g) => g.name === name);
  if (existing) existing.dice = [...tray];
  else groups.push({ id: Date.now(), name, dice: [...tray] });
  saveGroups();
  renderGroups();
  groupNameInput.value = '';
});

// Copy a bookmarkable URL that carries the current groups in its hash.
document.getElementById('copy-link').addEventListener('click', async (e) => {
  syncGroupsToLocation(groups);
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

function renderLog() {
  logList.innerHTML = '';
  logEmpty.style.display = log.length ? 'none' : 'block';
  for (const entry of [...log].reverse()) {
    const el = document.createElement('div');
    el.className = 'log-entry';
    const detail = entry.parts
      .map((p) => {
        const cls = p.isMax ? 'crit-max' : p.isMin ? 'crit-min' : '';
        return `<span class="${cls}">${p.type}&thinsp;${p.label}</span>`;
      })
      .join(' + ');
    const meaningHtml = entry.meaning
      ? `<span class="log-meaning tier-${entry.meaning.tier}"></span>`
      : '';
    el.innerHTML = `
      <div class="log-head">
        <span class="log-group"></span>
        <span class="log-total">${entry.total}</span>
      </div>
      <div class="log-detail">${detail}${meaningHtml ? '  ·  ' + meaningHtml : ''}</div>
      <div class="log-time">${fmtTime(entry.t)}</div>`;
    if (entry.meaning) el.querySelector('.log-meaning').textContent = entry.meaning.word;
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

document.getElementById('clear-table').addEventListener('click', () => requestClear());

document.getElementById('toggle-log').addEventListener('click', () => {
  logPanel.classList.toggle('hidden');
});

const soundBtn = document.getElementById('toggle-sound');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
});

// ---------------------------------------------------------------------------
// Mini mode: hide all chrome except a compact strip of group pills, sized to
// live in a small corner window during a video call. The 3D table, result
// banner, chips, and crit effects stay.
// ---------------------------------------------------------------------------

const LS_MINI = 'dice.mini.v1';

// Called from renderGroups(), which runs during module evaluation — resolve
// the element here rather than via a module-level const declared below.
function renderMiniBar() {
  const miniBar = document.getElementById('mini-bar');
  miniBar.innerHTML = '';
  for (const g of groups) {
    const pill = document.createElement('button');
    pill.className = 'mini-pill';
    pill.textContent = g.name; // user-supplied: textContent only
    pill.title = `Roll ${formula(g.dice)}`;
    pill.addEventListener('click', () => requestRoll([...g.dice], g.name));
    miniBar.appendChild(pill);
  }
  const clearPill = document.createElement('button');
  clearPill.className = 'mini-pill mini-util';
  clearPill.textContent = '✕';
  clearPill.title = 'Clear table';
  clearPill.addEventListener('click', () => requestClear());
  const exitPill = document.createElement('button');
  exitPill.className = 'mini-pill mini-util';
  exitPill.textContent = '⤢';
  exitPill.title = 'Full view';
  exitPill.addEventListener('click', () => setMini(false));
  miniBar.append(clearPill, exitPill);
}

function applyCameraFraming() {
  if (document.body.classList.contains('mini')) camera.position.set(0, 22, 12.5);
  else camera.position.set(0, 27, 15.5);
  camera.lookAt(0, 0, 0.5);
}

function setMini(on, persist = true) {
  document.body.classList.toggle('mini', on);
  if (persist) save(LS_MINI, on);
  applyCameraFraming();
  positionChips();
}

document.getElementById('toggle-mini').addEventListener('click', () => setMini(true));

// Small windows start in mini mode unless the user has expressed a preference.
{
  const stored = load(LS_MINI, null);
  const smallViewport = window.innerWidth < 640 || window.innerHeight < 480;
  setMini(stored ?? smallViewport, false);
}

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
    }
    playersList.appendChild(row);
  }
}

// Server Roll -> display log entry (same shape showResults produces).
function rollToLogEntry(roll) {
  let total = 0;
  const parts = (roll.dice || []).map((type, i) => {
    const value = roll.values[i];
    total += value;
    const [lo, hi] = valueRange(type);
    return { type, label: dieLabel(type, value), value, isMax: value === hi, isMin: value === lo };
  });
  return {
    rollId: roll.rollId || undefined,
    t: roll.t || Date.now(),
    label: roll.label || formula(roll.dice || []),
    playerName: roll.playerName || undefined,
    color: roll.color || undefined,
    parts,
    total,
    meaning: meaningFor(roll.dice || [], total) || undefined,
  };
}

function handleNetEvent(type, data) {
  if (!data) return;
  switch (type) {
    case 'hello': // initial state + re-sync after a reconnect
      players = data.players || [];
      renderPlayers();
      log = (data.log || []).map(rollToLogEntry);
      renderLog();
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
    case 'roll': // the only path that animates in online mode — ours included
      playRoll({
        rollId: data.rollId,
        t: data.t,
        dice: data.dice,
        values: data.values,
        seed: data.seed,
        label: data.label || formula(data.dice || []),
        playerName: data.playerName,
        color: data.color,
      });
      break;
    case 'clear':
      clearTable();
      break;
  }
}

function handleNetStatus(status) {
  if (!netOnline) return; // solo mode keeps its own pill
  setPill(status === 'online' ? null : 'reconnecting…', 'offline');
}

// Roll/clear entry points used by the UI buttons.
function requestRoll(types, label) {
  if (!types.length) return;
  if (netOnline && net) net.roll(types, label); // animation waits for the SSE event
  else rollDice(types, label);
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
      const name = input.value.trim().slice(0, 24);
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
    setPill(null);
  } else {
    netOnline = false;
    setPill('solo', 'solo'); // static hosting / no server: local play
  }
  return { online: netOnline };
}

const netReady = initNet();
