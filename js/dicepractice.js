/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// A single on-demand viewport. It has no connection to room/roll APIs, and
// never disposes the cached dice materials/geometry shared with the table.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createDieMesh, createDieBody, readValue } from './dice.js';

export function createDicePractice(host, report) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-label', 'Local practice die');
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  const light = new THREE.DirectionalLight(0xffefd6, 2.3);
  light.position.set(2, 6, 5); scene.add(light);
  const camera = new THREE.PerspectiveCamera(37, 2, 0.1, 40);
  camera.position.set(0, 9, 8);
  camera.lookAt(0, 0.8, 0);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0), allowSleep: true });
  const material = new CANNON.Material('practice');
  world.addContactMaterial(new CANNON.ContactMaterial(material, material, { friction: 0.42, restitution: 0.3 }));
  const floor = new CANNON.Body({ mass: 0, material, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(floor);
  // These bounds keep the preview in view. They are not shared table geometry.
  for (const [x, z, sx, sz] of [[-3.1,0,.2,2.3],[3.1,0,.2,2.3],[0,-2.3,3.3,.2],[0,2.3,3.3,.2]]) {
    const wall = new CANNON.Body({ mass: 0, material, shape: new CANNON.Box(new CANNON.Vec3(sx, 4, sz)) });
    wall.position.set(x, 3, z); world.addBody(wall);
  }
  let mesh, body, frame = 0, last = 0, elapsed = 0, frames = 0, animationFrames = 0, alive = true;
  let rolling = false, set = '', value = null;
  const state = () => {
    let bounds = null;
    if (mesh) {
      mesh.updateMatrixWorld(); camera.updateMatrixWorld();
      const vertices = mesh.geometry.getAttribute('position');
      const p = new THREE.Vector3();
      bounds = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
      // Measure rendered vertices, not the rotated world AABB's empty corners.
      for (let i = 0; i < vertices.count; i++) {
        p.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld).project(camera);
        bounds.left = Math.min(bounds.left,p.x); bounds.right = Math.max(bounds.right,p.x);
        bounds.bottom = Math.min(bounds.bottom,p.y); bounds.top = Math.max(bounds.top,p.y);
      }
    }
    return { rolling, set, value, frames, animationFrames, bounds };
  };
  function render() {
    if (!alive || !mesh) return;
    mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion);
    renderer.render(scene, camera); frames++;
  }
  function resize() {
    const box = host.getBoundingClientRect();
    if (!alive || !box.width || !box.height) return;
    renderer.setSize(box.width, box.height, false);
    camera.aspect = box.width / box.height;
    // Maintain the whole practice area in both the desktop and phone viewport.
    if (!rolling && body) {
      // The same close read for every resting die, independent of its value.
      const fit = Math.max(1, 1 / camera.aspect);
      camera.position.set(body.position.x, body.position.y + 3.5 * fit, body.position.z + 3.2 * fit);
      camera.lookAt(body.position.x, body.position.y, body.position.z);
    } else {
      camera.position.set(0, 9 * Math.max(1, 1.8 / camera.aspect), 8 * Math.max(1, 1.8 / camera.aspect));
      camera.lookAt(0, .8, 0);
    }
    camera.updateProjectionMatrix(); render();
  }
  function finish() {
    rolling = false;
    resize();
    const read = readValue('d20', mesh.quaternion);
    value = read.dot >= .97 ? read.value : null;
    report(value === null ? 'Practice finished · only you' : `Practice d20: ${value} · only you`, state());
  }
  function tick(now) {
    frame = 0;
    if (!alive || !rolling || document.hidden) return;
    animationFrames++;
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
    last = now; elapsed += dt;
    world.step(1 / 120, dt, 6); render();
    if (body.sleepState === CANNON.Body.SLEEPING || elapsed >= 7) finish();
    else frame = requestAnimationFrame(tick);
  }
  function visibility() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    if (!document.hidden && rolling) frame = requestAnimationFrame(tick);
  }
  const observer = new ResizeObserver(resize); observer.observe(host);
  document.addEventListener('visibilitychange', visibility);
  function toss(nextSet) {
    cancelAnimationFrame(frame); frame = 0;
    if (mesh) scene.remove(mesh);
    if (body) world.removeBody(body);
    set = nextSet; value = null; frames = 0; animationFrames = 0; elapsed = 0; last = 0;
    mesh = createDieMesh('d20', set); scene.add(mesh);
    body = createDieBody('d20', material);
    body.linearDamping = .28; body.angularDamping = .35;
    const sample = crypto.getRandomValues(new Uint32Array(8));
    const unit = i => sample[i] / 2 ** 32;
    body.position.set(0, 3.0, .6);
    body.quaternion.setFromEuler(unit(0) * 6.28, unit(1) * 6.28, unit(2) * 6.28);
    body.velocity.set((unit(3) - .5) * 5, -1, -1.6);
    body.angularVelocity.set(5 + unit(4) * 6, 4 + unit(5) * 5, 3 + unit(6) * 5);
    world.addBody(body); rolling = true; resize();
    report('Practicing · only you', state());
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < 840 && body.sleepState !== CANNON.Body.SLEEPING; i++) world.step(1 / 120);
      render(); finish();
    } else if (!document.hidden) frame = requestAnimationFrame(tick);
  }
  return {
    toss, get state() { return state(); },
    dispose() {
      alive = false; rolling = false; cancelAnimationFrame(frame);
      observer.disconnect(); document.removeEventListener('visibilitychange', visibility);
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
