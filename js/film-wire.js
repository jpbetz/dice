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

// Explicit worker DTO: canonical hulls and solver state, never textures or results.
import * as CANNON from '../vendor/cannon-es.js';
import * as THREE from '../vendor/three.module.js';
import { bakeFilm } from './film-bake.js';

const vectors = ['position', 'previousPosition', 'interpolatedPosition', 'initPosition',
  'velocity', 'initVelocity', 'force', 'torque', 'angularVelocity', 'initAngularVelocity',
  'inertia', 'invInertia', 'linearFactor', 'angularFactor', 'vlambda', 'wlambda', 'invInertiaSolve'];
const quaternions = ['quaternion', 'initQuaternion', 'previousQuaternion', 'interpolatedQuaternion'];
const scalars = ['id', 'mass', 'invMass', 'type', 'allowSleep', 'sleepState', 'sleepSpeedLimit',
  'sleepTimeLimit', 'timeLastSleepy', 'wakeUpAfterNarrowphase', 'linearDamping', 'angularDamping',
  'fixedRotation', 'collisionFilterGroup', 'collisionFilterMask', 'collisionResponse', 'isTrigger',
  'invMassSolve', 'boundingRadius'];
const matrixNames = ['invInertiaWorld', 'invInertiaWorldSolve'];
const vec = (v) => [v.x, v.y, v.z];
const quat = (q) => [q.x, q.y, q.z, q.w];
const copyScalars = (o, names) => Object.fromEntries(names.map((k) => [k, o[k]]));
const contactNames = ['friction', 'restitution', 'contactEquationStiffness',
  'contactEquationRelaxation', 'frictionEquationStiffness', 'frictionEquationRelaxation'];
const worldNames = ['time', 'stepnumber', 'dt', 'default_dt', 'allowSleep', 'quatNormalizeSkip', 'quatNormalizeFast'];

export function rngFromState(a) {
  a |= 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.state = () => a;
  return rng;
}

function bodyState(b) {
  return { ...copyScalars(b, scalars),
    vectors: Object.fromEntries(vectors.map((k) => [k, vec(b[k])])),
    quaternions: Object.fromEntries(quaternions.map((k) => [k, quat(b[k])])),
    matrices: Object.fromEntries(matrixNames.map((k) => [k, b[k].elements.slice()])),
    aabb: [vec(b.aabb.lowerBound), vec(b.aabb.upperBound)], aabbNeedsUpdate: b.aabbNeedsUpdate };
}
function restoreBody(b, s) {
  Object.assign(b, copyScalars(s, scalars));
  for (const k of vectors) b[k].set(...s.vectors[k]);
  for (const k of quaternions) b[k].set(...s.quaternions[k]);
  for (const k of matrixNames) b[k].elements = s.matrices[k].slice();
  b.aabb.lowerBound.set(...s.aabb[0]); b.aabb.upperBound.set(...s.aabb[1]);
  b.aabbNeedsUpdate = s.aabbNeedsUpdate;
}
function worldState(w) {
  return { ...copyScalars(w, worldNames),
    bodies: w.bodies.map(bodyState), axis: w.broadphase.axisList.map((b) => b.id),
    dirty: w.broadphase.dirty, collision: w.collisionMatrix.matrix.slice(),
    previousCollision: w.collisionMatrixPrevious.matrix.slice() };
}
export function applyWorldState(w, state) {
  Object.assign(w, copyScalars(state, worldNames));
  for (const s of state.bodies) restoreBody(w.getBodyById(s.id), s);
  // SAP add/remove listeners close over this ARRAY; replace its contents.
  w.broadphase.axisList.splice(0, w.broadphase.axisList.length, ...state.axis.map((id) => w.getBodyById(id)));
  w.broadphase.dirty = state.dirty;
  w.collisionMatrix.matrix = state.collision.slice();
  w.collisionMatrixPrevious.matrix = state.previousCollision.slice();
}

// Only the worker's cast is owned by this reply. Other dice can be cleared,
// collected or revealed while it runs; developer tools can move/add colliders
// or retune the live world. Those later edits must survive the old film.
export function mergeFilmState(w, state, input) {
  const owned = new Set(input.dice.map((d) => d.bodyId));
  const before = new Map(input.world.state.bodies.map((b) => [b.id, b]));
  for (const s of state.bodies) {
    const body = w.getBodyById(s.id);
    if (body && owned.has(s.id)) restoreBody(body, s);
  }
  // Configuration is live. Only the completed simulation's clock advances.
  for (const key of ['time', 'stepnumber', 'dt']) w[key] = state[key];
  for (const body of w.bodies) {
    if (owned.has(body.id)) continue;
    const old = before.get(body.id);
    if (!old || vec(body.position).some((v, i) => v !== old.vectors.position[i])
        || quat(body.quaternion).some((v, i) => v !== old.quaternions.quaternion[i])) {
      body.aabbNeedsUpdate = true;
    }
  }
  // Removal renumbers Body.index. Matrix slots must follow surviving IDs,
  // not their stale snapshot indices; new bodies have no previous contact.
  const oldIndices = new Map(state.bodies.map((b, index) => [b.id, { index }]));
  const remap = (matrix) => {
    const source = new CANNON.ArrayCollisionMatrix(); source.matrix = matrix;
    const result = new CANNON.ArrayCollisionMatrix(); result.setNumObjects(w.bodies.length);
    for (let i = 1; i < w.bodies.length; i++) {
      const a = oldIndices.get(w.bodies[i].id); if (!a) continue;
      for (let j = 0; j < i; j++) {
        const b = oldIndices.get(w.bodies[j].id);
        if (b && source.get(a, b)) result.set(w.bodies[i], w.bodies[j], true);
      }
    }
    return result.matrix;
  };
  w.collisionMatrix.matrix = remap(state.collision);
  w.collisionMatrixPrevious.matrix = remap(state.previousCollision);
  const order = [], seen = new Set();
  for (const id of [...state.axis, ...w.broadphase.axisList.map((b) => b.id), ...w.bodies.map((b) => b.id)]) {
    const body = w.getBodyById(id);
    if (body && !seen.has(id)) { seen.add(id); order.push(body); }
  }
  // Keep SAP's listener-owned array, and force bounds/order to be checked
  // again. A later reveal or developer wall move can invalidate either.
  w.broadphase.axisList.splice(0, w.broadphase.axisList.length, ...order);
  w.broadphase.dirty = true;
}

export function captureFilm(ctx, getDie) {
  const { world: w } = ctx;
  if (ctx.pouring || w.constraints.length || !(w.broadphase instanceof CANNON.SAPBroadphase)) return null;
  const shapes = new Map(); const materials = new Map();
  const material = (m) => {
    if (!m) return null;
    materials.set(m.id, { id: m.id, name: m.name, friction: m.friction, restitution: m.restitution });
    return m.id;
  };
  const bodies = [];
  for (const b of w.bodies) {
    for (const s of b.shapes) {
      if (shapes.has(s.id)) continue;
      const base = { id: s.id, type: s.type, material: material(s.material),
        collisionResponse: s.collisionResponse, collisionFilterGroup: s.collisionFilterGroup,
        collisionFilterMask: s.collisionFilterMask };
      if (s instanceof CANNON.Plane) shapes.set(s.id, base);
      else if (s instanceof CANNON.ConvexPolyhedron) shapes.set(s.id, { ...base,
        vertices: s.vertices.map(vec), faces: s.faces.map((f) => f.slice()),
        normals: s.faceNormals.map(vec), axes: s.uniqueAxes?.map(vec) || null });
      else if (s instanceof CANNON.Box) shapes.set(s.id, { ...base, halfExtents: vec(s.halfExtents) });
      else return null; // an unsupported collider keeps the original inline path
    }
    bodies.push({ state: bodyState(b), material: material(b.material), shapes: b.shapes.map((s, i) => ({
      id: s.id, offset: vec(b.shapeOffsets[i]), orientation: quat(b.shapeOrientations[i]) })) });
  }
  const contacts = w.contactmaterials.map((c) => ({ ...copyScalars(c, contactNames),
    materials: c.materials.map(material) }));
  const dieInfo = {};
  for (const { type } of ctx.dice) {
    if (dieInfo[type]) continue;
    const die = getDie(type);
    dieInfo[type] = { radius: ctx.restCeiling(type),
      faces: (type === 'd4' ? die.vertexValues.map((f) => ({ normal: vec(f.dir), value: f.value }))
        : die.faces.map((f) => ({ normal: vec(f.normal), value: f.value }))) };
  }
  const config = {};
  for (const k of ['FIXED_DT', 'SETTLE_STILL', 'SETTLE_CAP', 'SETTLEGATE', 'DAMPGATE', 'PHYS', 'NUDGE', 'DIE_DEFS']) {
    config[k] = structuredClone(ctx[k]);
  }
  return { version: 1, config, rngState: ctx.rng.state(), dieInfo,
    dice: ctx.dice.map((d) => ({ type: d.type, bodyId: d.body.id })),
    world: { state: worldState(w), gravity: vec(w.gravity), frictionGravity: w.frictionGravity ? vec(w.frictionGravity) : null,
      solver: { iterations: w.solver.iterations, tolerance: w.solver.tolerance }, axisIndex: w.broadphase.axisIndex,
      defaultContact: copyScalars(w.defaultContactMaterial, contactNames),
      bodies, shapes: [...shapes.values()], materials: [...materials.values()], contacts,
      diceMat: ctx.diceMat.id, floorMat: ctx.floorMat.id, wallMat: ctx.wallMat.id } };
}

export function restoreFilm(input) {
  if (input.version !== 1) throw new Error('Unsupported film DTO');
  const dto = input.world;
  const world = new CANNON.World({ gravity: new CANNON.Vec3(...dto.gravity) });
  if (dto.frictionGravity) world.frictionGravity = new CANNON.Vec3(...dto.frictionGravity);
  Object.assign(world.solver, dto.solver);
  Object.assign(world.defaultContactMaterial, dto.defaultContact);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.broadphase.axisIndex = dto.axisIndex;
  const materials = new Map(dto.materials.map((m) => {
    const made = new CANNON.Material(m.name); Object.assign(made, m); return [m.id, made];
  }));
  const shapes = new Map(dto.shapes.map((s) => {
    let made;
    if (s.type === CANNON.Shape.types.PLANE) made = new CANNON.Plane();
    else if (s.type === CANNON.Shape.types.BOX) made = new CANNON.Box(new CANNON.Vec3(...s.halfExtents));
    else made = new CANNON.ConvexPolyhedron({ vertices: s.vertices.map((v) => new CANNON.Vec3(...v)),
      faces: s.faces, normals: s.normals.map((v) => new CANNON.Vec3(...v)),
      axes: s.axes?.map((v) => new CANNON.Vec3(...v)) || null });
    Object.assign(made, copyScalars(s, ['id', 'collisionResponse', 'collisionFilterGroup', 'collisionFilterMask']));
    made.material = materials.get(s.material) || null;
    return [s.id, made];
  }));
  for (const c of dto.contacts) world.addContactMaterial(new CANNON.ContactMaterial(
    materials.get(c.materials[0]), materials.get(c.materials[1]), c));
  for (const b of dto.bodies) {
    const made = new CANNON.Body({ mass: b.state.mass, material: materials.get(b.material) || null });
    made.id = b.state.id;
    for (const s of b.shapes) made.addShape(shapes.get(s.id), new CANNON.Vec3(...s.offset), new CANNON.Quaternion(...s.orientation));
    world.addBody(made);
  }
  applyWorldState(world, dto.state);
  const info = Object.fromEntries(Object.entries(input.dieInfo).map(([type, d]) => [type, {
    ...d, faces: d.faces.map((f) => ({ ...f, normal: new THREE.Vector3(...f.normal) })) }]));
  const up = new THREE.Vector3(0, 1, 0);
  return { ...input.config, world, pouring: false, rng: rngFromState(input.rngState),
    dice: input.dice.map((d) => ({ type: d.type, body: world.getBodyById(d.bodyId) })),
    diceMat: materials.get(dto.diceMat), floorMat: materials.get(dto.floorMat), wallMat: materials.get(dto.wallMat),
    restCeiling: (type) => info[type].radius,
    readValue(type, quaternion) {
      let best = null;
      for (const f of info[type].faces) {
        const dot = f.normal.clone().applyQuaternion(quaternion).dot(up);
        if (!best || dot > best.dot) best = { value: f.value, dot,
          label: type === 'd10x' ? String(f.value).padStart(2, '0') : String(f.value) };
      }
      return best;
    } };
}

export function bakeCaptured(input) {
  const ctx = restoreFilm(input);
  const film = bakeFilm(ctx);
  const frames = film.keyframes[0].length;
  const poses = new Float64Array(ctx.dice.length * frames * 7);
  let at = 0;
  for (const row of film.keyframes) for (const p of row) {
    poses.set([p.pos.x, p.pos.y, p.pos.z, p.quat.x, p.quat.y, p.quat.z, p.quat.w], at); at += 7;
  }
  delete film.keyframes;
  return { film, poses, frames, world: worldState(ctx.world) };
}
export function unpackFilm(result) {
  const keyframes = []; let at = 0;
  while (at < result.poses.length) {
    const row = [];
    for (let f = 0; f < result.frames; f++, at += 7) row.push({
      pos: new THREE.Vector3().fromArray(result.poses, at),
      quat: new THREE.Quaternion().fromArray(result.poses, at + 3) });
    keyframes.push(row);
  }
  return { ...result.film, keyframes };
}
