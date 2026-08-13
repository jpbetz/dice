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

// THE BAKED-MODEL LOADER (docs/TOWER.md; tools/forge/README.md "Tower
// portals"). A tower that comes out of the forge is a GLB, and this module is
// the whole of what the app does with one: fetch it once, read its two PORTAL
// empties, check them against the engine's limits, strip them out of the
// visual, and hand js/main.js a THREE.Group it can socket exactly like a
// code-built skin.
//
// THE ASYNC PROBLEM, STATED ONCE. Every other skin in this app is a synchronous
// function call — towerSocket() asks for a group and gets one in the same
// tick — and that is not a style choice: socketing tears down eight physics
// bodies and rebuilds them, and it is only allowed to happen at a roll
// boundary. A loader that returned a promise INTO that path would put an await
// between the teardown and the build, which is a window in which the world has
// no back wall and a film could be baked against it.
//
// So the seam is: LOADING IS NOT SOCKETING. This module's only asynchronous
// entry point is towerGlbEnsure(), which is a preload — it never touches the
// scene, the world, or the registry. towerGlbSkin() is SYNCHRONOUS and throws
// if the asset is not ready; main.js gates every caller on towerModelReady()
// so it never can be. The two states a tower model can be in are therefore
// "not here yet, and the table knows it" and "here, and socketing is the same
// same-tick operation it has always been". There is no third state.
//
// WHY THE PORTALS COME OFF THE MESH AND NOT OUT OF A TABLE IN main.js. One
// datum, one home. The forge writes the mouth and the doorway into the model
// as named empties (node TRANSLATION is the position, node EXTRAS carry the
// scalars) and check.py --tower fires rays down the declared column and out
// through the declared door before the file is allowed to exist. A copy of
// those eight numbers typed into a registry row is a copy that can be right
// on the day it is written and wrong on the day the model is re-baked — and
// the failure mode is dice flying into a wall beside a door, which nothing
// automated would notice.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

// THE HOUSE RULES a tower's materials must satisfy (js/main.js
// towerModelAudit's offPolicy block, which is what tower-fit gates on):
// MeshStandardMaterial only — no ShaderMaterial — at envMapIntensity 0.45,
// with no userData.bloom anywhere and no lights in the subtree. A baked model
// arrives as whatever the glTF material translation produced, so the values
// are applied HERE rather than asked for in the recipe: a recipe cannot write
// envMapIntensity into a glTF at all, and a rule that lives only in a document
// is a rule the next model breaks.
//
// 0.45 is the GROUNDED-ROOM baseline. towerSocket re-applies the venue
// register's policy at socket time (towerEnvPolicy — a fantasy venue drops
// the foreign env to 0.08 so baked palette colors read as baked; the W2c
// foxfire blue-berm lesson). This loader stays register-blind on purpose:
// the template is shared, the socketed CLONE wears the venue.
const ENV_MAP_INTENSITY = 0.45;

export const TOWERGLB = {
  // url -> {status, template, portals, error, retries, promise}
  cache: new Map(),
  // How long a settled roll waits for a model before it is replayed WITHOUT
  // one (js/main.js towerReleaseHeldReplay). A late felt beats a never felt:
  // ten seconds is long enough for a cold fetch on a bad connection and short
  // enough that a returning player is not looking at an empty table wondering
  // whether the app is broken.
  holdMaxMs: 10000,
  // Three tries after the first, backing off. A tower model is ~100 KB of
  // static asset behind an immutable Cache-Control; the failures worth
  // retrying are a dropped connection and a cold container, both of which are
  // over in seconds. Beyond that it is a 404 or a corrupt file, and retrying
  // those forever only hides them.
  retryMs: [500, 2000, 8000],
};

// The validator and the warn sink, injected by main.js at boot (towerGlbInit).
// TOWER_PORTAL_LIMITS lives beside DEFAULT_PORTALS in main.js because main.js
// OWNS them — the limits are arithmetic about the engine's volumes, not about
// files — and importing main.js from here would be a cycle (main.js imports
// this module). So the dependency runs one way and the validator is handed
// over instead. Until it is, validation is a no-op that says so.
let validatePortals = null;
let warn = (...args) => console.warn(...args);

// Called ONCE from main.js at boot. `validate(spec)` returns an array of
// human-readable violations (empty = legal).
export function towerGlbInit({ validate, warn: warnFn } = {}) {
  if (typeof validate === 'function') validatePortals = validate;
  if (typeof warnFn === 'function') warn = warnFn;
  return true;
}

function entryFor(url) {
  let e = TOWERGLB.cache.get(url);
  if (!e) {
    e = { url, status: 'idle', template: null, portals: null, error: null, retries: 0, promise: null };
    TOWERGLB.cache.set(url, e);
  }
  return e;
}

export function towerGlbStatus(url) {
  const e = TOWERGLB.cache.get(url);
  return e ? e.status : 'idle';
}

export function towerGlbAsset(url) {
  return TOWERGLB.cache.get(url) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch + parse, idempotent per url. NEVER REJECTS: a caller that has to
// handle both a rejection and an 'error' status has two failure paths to get
// right and will get one of them wrong, and the one it gets wrong is the one
// that leaves a roll held forever. Terminal failure is a resolved entry whose
// status is 'error'.
export function towerGlbEnsure(url) {
  const e = entryFor(url);
  if (e.promise) return e.promise;
  e.status = 'loading';
  e.promise = (async () => {
    const tries = TOWERGLB.retryMs.length + 1;
    for (let i = 0; i < tries; i++) {
      if (i > 0) {
        e.retries = i;
        await sleep(TOWERGLB.retryMs[i - 1]);
      }
      try {
        // 'no-cache' = always revalidate, never skip it. This was
        // 'force-cache', which serves ANY stored copy without asking the
        // server — so a re-baked model under the same URL stayed stale in
        // every returning browser, and even a hard refresh couldn't evict it
        // (hard refresh bypasses the cache only for requests made during the
        // reload; this fetch fires later, at the settings/roll boundary).
        // Found live on 2026-08-13: the round-5 mouth, tightened on disk and
        // on the wire, invisible on the one browser with a warm cache. The
        // harness never sees this class — its profile is always cold.
        // server.js answers the revalidation with a body-less 304 (ETag over
        // bytes), so freshness costs one conditional round-trip per session.
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        // parse() rather than load(): the fetch is ours (so the retry ladder
        // and the status are ours too), and GLTFLoader.parse is callback-based
        // even though nothing here is asynchronous once the bytes are in hand.
        const gltf = await new Promise((resolve, reject) => {
          new GLTFLoader().parse(buf, '', resolve, reject);
        });
        const built = postprocess(gltf, url);
        if (built.violations.length) {
          // A LEGAL-LOOKING TOWER IS THE DANGEROUS ONE. Out-of-limits portals
          // are not "a bit off": they are a doorway the engine will not cut a
          // hole for, or a mouth narrower than a d20. Refuse the model rather
          // than socket it and let the player discover it with dice.
          e.status = 'error';
          e.error = new Error(`portals out of limits: ${built.violations.join('; ')}`);
          warn(`[towerglb] ${url}: REFUSED — the declared portals are outside `
            + `TOWER_PORTAL_LIMITS, so the engine cannot build a consistent core `
            + `for them:\n  · ${built.violations.join('\n  · ')}`);
          return e;
        }
        e.template = built.template;
        e.portals = built.portals;
        e.error = null;
        e.status = 'ready';
        return e;
      } catch (err) {
        e.error = err;
        if (i === tries - 1) {
          e.status = 'error';
          warn(`[towerglb] ${url}: FAILED after ${tries} attempts — `
            + `${err && err.message ? err.message : err}. No tower will be socketed `
            + `for this row; the table keeps the one it has.`);
          return e;
        }
      }
    }
    return e; // unreachable; the loop returns on both exits
  })();
  return e.promise;
}

// THE PORTAL EMPTIES, READ OFF THE SCENE ROOT. Both nodes are exported at the
// scene root by tools/forge (check.py --tower refuses a model whose portals are
// parented to anything), so `object.position` IS the app-frame model-space
// value with no matrix walk — and the forge exports Y-up, which is the app's
// frame, so there is no axis conversion at either end either. GLTFLoader maps
// glTF node `extras` onto `object.userData`, which is where the scalars live.
//
// `out` has no z of its own: the doorway is cut in the socket plane and the
// engine puts it at z0 by definition, so the empty's z is authored 0 and
// deliberately not read. A model cannot move its door backward into the tower.
function readPortals(scene) {
  const nIn = scene.getObjectByName('portalIn');
  const nOut = scene.getObjectByName('portalOut');
  if (!nIn || !nOut) return null;
  const ud = (o, k) => (o.userData ? o.userData[k] : undefined);
  return {
    in: {
      x: nIn.position.x, rimY: nIn.position.y, z: nIn.position.z,
      clearR: ud(nIn, 'clearR'),
    },
    out: {
      x: nOut.position.x, sillY: nOut.position.y,
      w: ud(nOut, 'w'), clearH: ud(nOut, 'clearH'),
    },
  };
}

function finite(n) { return typeof n === 'number' && Number.isFinite(n); }

function postprocess(gltf, url) {
  const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
  if (!scene) throw new Error('no scene in the GLB');
  scene.updateMatrixWorld(true);

  const portals = readPortals(scene);
  const violations = [];
  if (!portals) {
    violations.push('no portalIn/portalOut nodes at the scene root');
  } else {
    // SHAPE BEFORE LIMITS. A missing extra reads `undefined`, and `undefined`
    // compared against any bound is false — so an unchecked spec with no
    // clearR would sail through a range test and land in towerVolumes as NaN,
    // where every derived number becomes NaN and the tower is an invisible
    // hole with dice falling through it.
    for (const [side, keys] of [['in', ['x', 'rimY', 'z', 'clearR']],
      ['out', ['x', 'sillY', 'w', 'clearH']]]) {
      for (const k of keys) {
        if (!finite(portals[side][k])) violations.push(`${side}.${k} is not a finite number (got ${portals[side][k]})`);
      }
    }
    if (!violations.length && validatePortals) violations.push(...validatePortals(portals));
    else if (!violations.length) violations.push('towerGlbInit() was never called — no limits to check against');
  }

  // THE VISUAL. Strip the empties: they are metadata that happens to be
  // shaped like scene graph, and leaving them in would put two named nodes
  // inside the socket for towerModelAudit and the occlusion probe to trip
  // over. (They carry no geometry, so this is about NAMES, not triangles.)
  for (const name of ['portalIn', 'portalOut']) {
    const n = scene.getObjectByName(name);
    if (n && n.parent) n.parent.remove(n);
  }

  const houseRules = [];
  let meshes = 0;
  scene.traverse((o) => {
    if (o.isLight) {
      // A model brings NO lights (docs/TOWER.md): the tower's one warm focal
      // light is the registry row's `ember`, built by main.js against the
      // socketed core. A light baked into the mesh would light the room from
      // wherever the modeller left it and could not be dialled at all.
      houseRules.push(`removed a baked light (${o.name || o.type})`);
      if (o.parent) o.parent.remove(o);
      return;
    }
    if (!o.isMesh) return;
    meshes++;
    o.castShadow = true;
    o.receiveShadow = true;
    // MATERIALS ARE CLONED PER MODEL, not per instance: the template is the
    // one thing every socket of this url clones FROM, and .clone(true) shares
    // materials by design (three's clone copies the material REFERENCE). One
    // material object per url is exactly right — nothing mutates it after
    // this pass, and sharing keeps the draw-call story unchanged.
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.isShaderMaterial) houseRules.push(`${o.name || '?'}: ShaderMaterial is off-policy`);
      m.envMapIntensity = ENV_MAP_INTENSITY;
      // Weathering DATA that never reaches the RENDER is invisible by
      // construction (main.js towerVC exists because of exactly this). glTF's
      // COLOR_0 becomes geometry.attributes.color; GLTFLoader already flips
      // vertexColors when it sees one, and this states it rather than trusting
      // it — the flag off is a model that bakes its whole colour story and
      // then renders flat grey.
      m.vertexColors = !!o.geometry.attributes.color;
      if (m.userData) delete m.userData.bloom;
    }
    if (o.userData) delete o.userData.bloom;
  });
  if (houseRules.length) {
    warn(`[towerglb] ${url}: house rules applied — ${houseRules.join('; ')}`);
  }
  if (!meshes) violations.push('the GLB carries no meshes');

  return { template: scene, portals, violations };
}

// SYNCHRONOUS, and it throws rather than returning a placeholder. Every caller
// in main.js is gated on towerModelReady(), so reaching this un-ready is a
// GATE bug — and a gate bug that silently produced an empty group would ship
// as "the tower is invisible sometimes", which is the shape of green check
// this project keeps catching itself writing. Let it be loud.
//
// THE TWO KINDS OF SKIN ARRIVE IN DIFFERENT FRAMES, and `v` is what reconciles
// them. A code-built skin bakes the world's anchor into its own vertices —
// buildTowerSkin opens with `const z0 = v.z0` and places every span in world
// coordinates. A BAKED model cannot: it is authored in Blender long before
// anybody knows what the mat depth or the zoom preset will be, so the forge
// fixes its origin at the one thing that does not move relative to the tower —
// the back-wall SOCKET PLANE, z = 0 (tools/forge/README.md "Tower portals").
// The portal numbers are in that same frame, which is exactly why towerVolumes
// reads them as `z0 + spec.in.z` rather than absolutely.
//
// So a baked model owes precisely one offset and it is z0. This was WRONG in
// the first cut of this file, and what makes it worth the paragraph is how
// quietly wrong: the portals were right, the eight colliders were right, the
// mat depth was right, the dice were delivered — and the tower stood in the
// middle of the felt. Measured: the fixture's hull came back at z [1.6, 5.6]
// where its authored extent is [-4, 0]. The scenario's assertion is the audit's
// z0-relative hull, because that is the only reading that can tell the
// difference.
export function towerGlbSkin(url, v) {
  const e = TOWERGLB.cache.get(url);
  if (!e || e.status !== 'ready' || !e.template) {
    throw new Error(`towerGlbSkin('${url}'): asset is '${e ? e.status : 'idle'}', not 'ready' `
      + `— the caller was supposed to be gated on towerModelReady()`);
  }
  if (!v || typeof v.z0 !== 'number') {
    // Refused, never defaulted to 0. A missing anchor is not "put it at the
    // origin", it is "nobody said where the wall is" — and those two answers
    // look identical until somebody rolls dice at it.
    throw new Error(`towerGlbSkin('${url}'): no volumes passed — a baked model is `
      + `authored with z=0 at the socket plane and cannot be seated without z0`);
  }
  // Deep clone: geometries and materials are SHARED with the template (three's
  // clone copies references), which is what makes a re-socket cheap. The
  // template itself is never added to a scene, so nothing can mutate the
  // thing every future clone comes from.
  const g = e.template.clone(true);
  const group = new THREE.Group();
  group.name = 'towerSkin';
  // The scene root's children move over one level so the group main.js adds
  // is named `towerSkin` — the name the occlusion probe and towerModelAudit
  // both walk from. The model's own node names (towerSkin*) come with them.
  for (const child of [...g.children]) group.add(child);
  group.position.z = v.z0;   // model space → world: the socket plane
  return group;
}
