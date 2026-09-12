// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0

import * as THREE from 'three';
import { GLTFLoader } from '/vendor/GLTFLoader.js';
import { STUDIES, modelUrl, previewOptions } from './catalogue.mjs';

const canvas = document.querySelector('#canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0, 0);

// An original procedural studio environment. Broad softboxes give metal a
// shape without introducing an image dependency or painting highlights in.
const envCanvas = document.createElement('canvas');
envCanvas.width = 1024; envCanvas.height = 512;
const ec = envCanvas.getContext('2d');
ec.fillStyle = '#353b3c'; ec.fillRect(0, 0, 1024, 512);
for (const [x, y, w, h, color] of [[160, 100, 240, 140, '#ede5cf'], [640, 90, 110, 260, '#b9d0dd'], [860, 210, 85, 70, '#d9b789']]) {
  ec.fillStyle = color; ec.fillRect(x, y, w, h);
}
const environment = new THREE.CanvasTexture(envCanvas);
environment.colorSpace = THREE.SRGBColorSpace;
environment.mapping = THREE.EquirectangularReflectionMapping;
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromEquirectangular(environment).texture;
environment.dispose(); pmrem.dispose();

let active = 'all', azimuth = 0.52, elevation = 0.2, zoom = 1, rotating = false, mode = 'lit';
const loaded = [];
const normal = new THREE.MeshNormalMaterial();
const clay = new THREE.MeshStandardMaterial({ color: '#a89b87', roughness: 0.87 });
const wire = new THREE.MeshBasicMaterial({ color: '#94c5af', wireframe: true });

const choices = document.querySelector('#choices');
for (const study of STUDIES) {
  const button = document.createElement('button');
  button.textContent = study.label; button.dataset.id = study.id;
  button.setAttribute('aria-pressed', 'false'); choices.append(button);
  const article = document.createElement('article');
  article.style.setProperty('--accent', study.accent); article.dataset.id = study.id;
  article.innerHTML = `<div class="model-title"><span class="number">${study.number}</span><h2>${study.label}</h2></div>
    <p class="material">${study.material}</p><p class="description">${study.note}</p>
    <div class="links"><button class="inspect">Inspect model ↗</button><button class="table">Roll at the table ↗</button>
    <a href="./${study.id}/${study.id}.blend" download>Blender ↓</a><a href="./${study.id}/${study.id}.glb" download>GLB ↓</a></div>
    <p class="stats">Loading model…</p>`;
  article.querySelector('.inspect').onclick = () => select(study.id);
  article.querySelector('.table').onclick = () => openTable(study);
  document.querySelector('#descriptions').append(article);
}

function select(id) {
  active = id;
  choices.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  document.querySelector('#view-label').textContent = id === 'all' ? 'THE COLLECTION' : STUDIES.find((s) => s.id === id).label.toUpperCase();
  document.querySelectorAll('article').forEach((a) => { a.hidden = id !== 'all' && a.dataset.id !== id; });
  document.querySelector('#descriptions').style.gridTemplateColumns = id === 'all' ? '' : '1fr';
  document.querySelector('#descriptions').classList.toggle('single', id !== 'all');
  render();
}
choices.onclick = (e) => { if (e.target.dataset.id) select(e.target.dataset.id); };

async function openTable(study) {
  // This is a deliberately SOLO review session, using the existing temporary
  // registry hook. Nothing is added to the game's catalogue or room protocol.
  const tab = window.open('/?lobby=1&stability=beta', '_blank');
  if (!tab) { alert('Allow a new tab to open the table preview.'); return; }
  const start = Date.now();
  while (Date.now() - start < 30000) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (tab.closed) return;
    const dbg = tab.__diceDebug;
    if (!dbg || !dbg.identity?.lobby) continue;
    dbg.towerRegisterGlb(study.id, modelUrl(study.id), previewOptions(study));
    dbg.setZoom('medium'); dbg.setTower(study.id);
    while (!dbg.towerModelStatus(study.id)?.ready && Date.now() - start < 45000) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (tab.closed) return;
    }
    if (!dbg.towerModelStatus(study.id)?.ready) break;
    dbg.setTower(study.id);
    tab.document.title = `${study.label} · Foundry table preview`;
    return;
  }
  alert('The table preview could not load. Run this gallery with the project’s Node server; the README has the command.');
}

for (const study of STUDIES) {
  try {
    const gltf = await new GLTFLoader().loadAsync(modelUrl(study.id));
    const root = gltf.scene;
    const scene = new THREE.Scene(); scene.environment = envMap;
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -box.min.y, -center.z);
    let tris = 0, meshes = 0;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true; o.userData.originalMaterial = o.material;
      o.material.envMapIntensity = 0.6;
      tris += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; meshes++;
    });
    scene.add(root);
    scene.add(new THREE.HemisphereLight('#d8e4e7', '#39352d', 0.85));
    const key = new THREE.DirectionalLight('#ffdfb4', 2.5); key.position.set(-8, 17, 11);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 18, bottom: -10, near: 0.5, far: 65 });
    key.shadow.bias = -0.00015; key.shadow.normalBias = 0.035;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#aacfe0', 1.9); rim.position.set(7, 12, -7); scene.add(rim);
    const fill = new THREE.DirectionalLight('#efcc9e', 0.3); fill.position.set(6, 5, 10); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.035; floor.receiveShadow = true; scene.add(floor);
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 300);
    const stats = { id: study.id, tris, meshes, height: +(box.max.y - box.min.y).toFixed(2), min: box.min.toArray(), max: box.max.toArray() };
    loaded.push({ study, root, scene, camera, stats });
    document.querySelector(`article[data-id="${study.id}"] .stats`).textContent = `${tris.toLocaleString()} triangles · ${stats.height} table units tall · Blender 4.5 LTS`;
  } catch (err) {
    document.querySelector(`article[data-id="${study.id}"] .stats`).textContent = `Model unavailable: ${err.message}`;
    console.error(err);
  }
}
document.querySelector('#loading').hidden = loaded.length > 0;
if (!loaded.length) document.querySelector('#loading').textContent = 'No models could be loaded.';

function render() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) renderer.setSize(width, height, false);
  renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
  const visible = loaded.filter((m) => active === 'all' || m.study.id === active);
  const count = visible.length;
  if (!count) return;
  const narrow = width < 640 && count > 1;
  for (let i = 0; i < count; i++) {
    const { scene, camera } = visible[i];
    const w = width / count, h = height;
    renderer.setViewport(i * w, 0, w, h); renderer.setScissor(i * w, 0, w, h);
    camera.aspect = w / h;
    // The same framing for all models is intentional: scale comparisons must
    // show authored dimensions, rather than independently normalising height.
    const dist = Math.max(31, 8.5 / Math.max(camera.aspect, 0.1)) * zoom * (narrow ? 0.9 : 1);
    const focus = new THREE.Vector3(0, 6.0, 0);
    camera.position.set(dist * Math.cos(elevation) * Math.sin(azimuth), focus.y + dist * Math.sin(elevation), dist * Math.cos(elevation) * Math.cos(azimuth));
    camera.lookAt(focus); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  renderer.setScissorTest(false);
}

let dragging = null;
canvas.addEventListener('pointerdown', (e) => { dragging = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  azimuth -= (e.clientX - dragging[0]) * 0.008;
  elevation = THREE.MathUtils.clamp(elevation + (e.clientY - dragging[1]) * 0.006, -0.03, 1.1);
  dragging = [e.clientX, e.clientY]; render();
});
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('pointercancel', () => { dragging = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = THREE.MathUtils.clamp(zoom * Math.exp(e.deltaY * 0.001), 0.57, 1.7); render(); }, { passive: false });
document.querySelector('#rotate').onclick = (e) => { rotating = !rotating; e.target.setAttribute('aria-pressed', String(rotating)); };
document.querySelector('#reset').onclick = () => { azimuth = 0.52; elevation = 0.2; zoom = 1; render(); };
document.querySelector('#surface').onchange = (e) => {
  mode = e.target.value;
  for (const m of loaded) m.root.traverse((o) => { if (o.isMesh) o.material = ({ normal, clay, wire })[mode] || o.userData.originalMaterial; });
  render();
};
function setView(view) {
  [azimuth, elevation] = ({ front: [0, 0.12], hero: [0.52, 0.2], crown: [0.35, 0.95], back: [Math.PI + 0.4, 0.25] })[view]; zoom = 1;
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  render();
}
document.querySelectorAll('[data-view]').forEach((button) => { button.onclick = () => setView(button.dataset.view); });
new ResizeObserver(render).observe(canvas.parentElement);
let previous = performance.now();
function animate(now) {
  if (rotating && !dragging) { azimuth += Math.min(now - previous, 50) * 0.00015; render(); }
  previous = now; requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
select(innerWidth < 640 ? 'wickroot' : 'all');
// Repeated visual checks use this explicit render path, including in hidden
// tabs where requestAnimationFrame may not run.
window.__foundry = { ready: loaded.length === STUDIES.length, stats: loaded.map((m) => m.stats),
  select, setView, render, shot() { render(); return canvas.toDataURL('image/png'); } };
