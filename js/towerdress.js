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

// THE DRESSING KIT — props, weathering and idle motion shared by every tower
// skin (docs/TOWER.md, the DRESSING section). js/towerskin.js is the SURFACE
// kit (noise, bakes, rounded boxes, the AO pass); this is the PROP kit that
// stands on it. Nothing here builds a tower; every function returns geometry
// or textures a skin places against its own contract arithmetic.
//
// ---------------------------------------------------------------------------
// THE THREE NUMBERS EVERYTHING HERE IS SIZED AGAINST
// ---------------------------------------------------------------------------
// Measured from the shipped cameras, not assumed:
//
//   resting eye (what players see)   ~28.2 u from the facade   ~42 px / unit
//   photo eye (towerEye(16, 9, 5))   ~18.3 u                   ~65 px / unit
//
// So at the eye that matters: 1 px ≈ 0.024 u. A feature needs ≥ 0.072 u to
// EXIST and ≥ 0.12 u to read as a shape. THE 3-PX RULE, and it is the rule
// this file exists to enforce: stylise up about 2×, then delete anything
// still under 0.07 u and PAINT it instead. Rivets, cage bars and life-size
// ivy leaves are all sub-pixel; every one of them is a texture here, not
// geometry. A prop that costs triangles and cannot be seen is worse than no
// prop, because it still costs the frame.
//
// ---------------------------------------------------------------------------
// WHERE A PROP LIVES, AND WHY THE GROUP NAME IS LOAD-BEARING
// ---------------------------------------------------------------------------
//   towerSkinDress — opaque props. The `towerSkin*` prefix means tower-fit
//     MEASURES them against the socket and the occlusion proof COUNTS them as
//     occluders. Both are what we want: a prop that stands outside the socket
//     must be defended by name, and extra opacity can only help the cheat.
//   towerDressFx  — InstancedMesh fields (leaves, coal, chain links) and the
//     smoke. EXCLUDED from bakeVertexAO (G8: Box3.setFromObject unions ALL
//     instances into one giant box, which would poison every other part's AO)
//     and excluded from the fit hull, where a transparent or scattered thing
//     would be measured as if it were masonry. tower-fit reports the group's
//     extent separately under a named class instead of ignoring it.
//
// ---------------------------------------------------------------------------
// HOUSE RULES THIS FILE OBEYS (tower-fit gates the first four)
// ---------------------------------------------------------------------------
//   · MeshStandardMaterial only, envMapIntensity 0.45 — the smoke alone is
//     MeshBasicMaterial, because smoke that takes a light is a solid.
//   · no lights in a skin, no bloom, no ShaderMaterial.
//   · alphaTest, never `transparent` (the smoke alone, again: transparent,
//     depthWrite false). Alpha-tested geometry stays in the opaque list and
//     cannot sort wrong — and G4 says an InstancedMesh CANNOT sort its own
//     instances anyway, so foliage has no other option.
//   · SRGBColorSpace on colour and emissive canvases ONLY (G10). Normal and
//     roughness canvases are DATA; tagging them bends the vectors.
//   · seeded PRNG only. There is no Math.random in any bake or placement path
//     in this repo and this file does not start one.
//
// ---------------------------------------------------------------------------
// IDLE MOTION
// ---------------------------------------------------------------------------
// Two incommensurate slow sines, the `stepTowerLantern` idiom verbatim:
//
//     0.65·sin(ωt) + 0.35·sin(2.63ωt + 1.7)
//
// Harmonics would beat into a visible loop; 2.63 never closes. Everything is
// driven from ABSOLUTE dt-accumulated time handed in by tick(), so holdClock
// freezes it and a screenshot is deterministic — no Date.now, no performance
// .now, anywhere in this file.

import * as THREE from 'three';
import {
  mulberry32, hash2, fbm, turb, clamp01, smoothstep, ramp3,
  heightToNormal, roughFromHeight, mapsFromCanvases, roundedBox,
} from './towerskin.js';

// ---------------------------------------------------------------------------
// Small shared machinery
// ---------------------------------------------------------------------------

export const R_PROP = 0.018;          // bevel for prop-scale boxes

function canvas2d(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, x: c.getContext('2d') };
}

// A colour canvas → texture. SRGB, because it is colour (G10).
export function colorTexture(can, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(can);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Copy a bake's canvas so a dressing pass can repaint it without touching the
// map the rest of the tower is already wearing.
export function cloneCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// MERGE, because a draw call is the real budget. Ten props sharing one
// material are still ten draw calls in three — only one geometry is one call.
// Bakes each entry's matrix into its vertices and concatenates
// position/normal/uv. Indexed inputs (cylinders, lathes, planes) are expanded
// first; roundedBox and ExtrudeGeometry are already non-indexed.
//
// Merging happens BEFORE bakeVertexAO, so a merged cluster is one AO part and
// one occluder box — coarser, and correct: a cluster of props at one corner
// of a tower occludes as the cluster.
export function mergeGeos(entries) {
  const geos = entries.map((e) => {
    const g = (e.geo.index ? e.geo.toNonIndexed() : e.geo.clone());
    if (e.matrix) g.applyMatrix4(e.matrix);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(
        new Float32Array(g.attributes.position.count * 2), 2));
    }
    return g;
  });
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// G1, DEFENSIVELY. A material with `vertexColors: true` over a geometry with
// no `color` attribute does not fall back to white — the shader takes its
// vColor branch and reads an unbound attribute, which is BLACK. Every prop
// here is meant to go through bakeVertexAO (which writes the attribute), so
// this is only ever the safety net for a prop a skin forgets to hand it; but
// a forgotten prop should look ungrounded, not deleted.
export function ensureColor(geo) {
  if (!geo.attributes.color) {
    geo.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  }
  return geo;
}

// A transform, spelled out, for mergeGeos entries.
export function xform({ pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 }) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  m.compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...s));
  return m;
}

// Box UVs for a prop, in PROP space rather than world space: a 0.4-unit
// bracket textured at the tower's world tile shows one flat colour. `t` is
// how many world units map to a tile.
export function propUV(geo, t) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, x / t, z / t);
    else if (nx >= nz) uv.setXY(i, z / t, y / t);
    else uv.setXY(i, x / t, y / t);
  }
  uv.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// IDLE MOTION — registration and one stepper
// ---------------------------------------------------------------------------
// A skin registers what moves; the engine calls stepDress(root, t) with the
// same dt-accumulated clock everything else rides. Nothing here reads a wall
// clock, so a held clock is a frozen tower.

function dressState(root) {
  if (!root.userData.dress) root.userData.dress = { sways: [], smokes: [] };
  return root.userData.dress;
}

// `amp` in RADIANS, `hz` the fundamental. Two sines, 2.63 apart (never
// harmonic, so the loop never closes visibly).
export function registerSway(root, obj, { amp, hz = 0.055, phase = 0, axis = 'z' }) {
  dressState(root).sways.push({ obj, amp, hz, phase, axis, base: obj.rotation[axis] });
  return obj;
}

export function registerSmoke(root, plume) {
  dressState(root).smokes.push(plume);
  return plume;
}

export function stepDress(root, t) {
  const d = root && root.userData && root.userData.dress;
  if (!d) return false;
  for (const s of d.sways) {
    const w = 2 * Math.PI * s.hz * t + s.phase;
    s.obj.rotation[s.axis] = s.base + s.amp * (0.65 * Math.sin(w) + 0.35 * Math.sin(2.63 * w + 1.7));
  }
  for (const p of d.smokes) stepSmoke(p, t);
  return true;
}

// ---------------------------------------------------------------------------
// CLOTH — a gonfalon, and the heraldry on it
// ---------------------------------------------------------------------------
// THE TINCTURES, pulled ~15% toward the room's ambient because ACES tone
// mapping turns a pure primary into a screaming one. Sable is never #000 —
// the house rule about warm darks applies to a flag as much as to a groove.
export const TINCTURE = {
  or:      [0xd9, 0xa5, 0x21],   // metal
  argent:  [0xe8, 0xe2, 0xd4],   // metal
  gules:   [0xa8, 0x22, 0x1e],
  azure:   [0x24, 0x3d, 0x86],
  sable:   [0x22, 0x1e, 0x1b],
  vert:    [0x27, 0x5c, 0x33],
  purpure: [0x5e, 0x2c, 0x74],
};
const METALS = new Set(['or', 'argent']);

// THE RULE OF TINCTURE IS THE GENERATOR'S PALETTE CONSTRAINT, not a nicety:
// metal on colour or colour on metal, never metal on metal or colour on
// colour. Six centuries of heralds worked out that this is what stays legible
// at a distance, which is exactly the problem an 84-px flag has.
export function tinctureOk(field, charge) {
  return METALS.has(field) !== METALS.has(charge);
}

// A mullet (five-pointed star): ten vertices alternating R and 0.382R,
// starting at −π/2. The one charge that survives at this size along with the
// roundel, the lozenge and a tower — beast silhouettes do NOT, so the
// generator does not offer any.
function pathMullet(x, cx, cy, R) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? R * 0.382 : R;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
}

function pathTower(x, cx, cy, w, h) {
  const l = cx - w / 2, r = cx + w / 2, t = cy - h / 2, b = cy + h / 2;
  const bw = w * 0.66, bl = cx - bw / 2, br = cx + bw / 2;
  const cr = h * 0.26;                       // crenellated head
  x.beginPath();
  x.moveTo(l, t); x.lineTo(l + w * 0.22, t); x.lineTo(l + w * 0.22, t + cr * 0.45);
  x.lineTo(cx - w * 0.11, t + cr * 0.45); x.lineTo(cx - w * 0.11, t);
  x.lineTo(cx + w * 0.11, t); x.lineTo(cx + w * 0.11, t + cr * 0.45);
  x.lineTo(r - w * 0.22, t + cr * 0.45); x.lineTo(r - w * 0.22, t);
  x.lineTo(r, t); x.lineTo(r, t + cr);
  x.lineTo(br, t + cr); x.lineTo(br, b); x.lineTo(bl, b); x.lineTo(bl, t + cr);
  x.lineTo(l, t + cr);
  x.closePath();
}

function pathLozenge(x, cx, cy, w, h) {
  x.beginPath();
  x.moveTo(cx, cy - h / 2); x.lineTo(cx + w / 2, cy);
  x.lineTo(cx, cy + h / 2); x.lineTo(cx - w / 2, cy);
  x.closePath();
}

function pathCross(x, cx, cy, w, h, arm) {
  x.beginPath();
  x.rect(cx - w / 2, cy - arm / 2, w, arm);
  x.rect(cx - arm / 2, cy - h / 2, arm, h);
}

const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// Draw the arms into a 2D context spanning (0,0)..(W,H).
// `arms` = { field, division?, divTincture?, charge?, chargeTincture? }
function paintArms(x, W, H, arms) {
  const f = TINCTURE[arms.field];
  x.fillStyle = rgb(f);
  x.fillRect(0, 0, W, H);
  if (arms.division === 'perFess') {
    x.fillStyle = rgb(TINCTURE[arms.divTincture]);
    x.fillRect(0, 0, W, H / 2);
  } else if (arms.division === 'perPale') {
    x.fillStyle = rgb(TINCTURE[arms.divTincture]);
    x.fillRect(0, 0, W / 2, H);
  } else if (arms.division === 'chief') {
    x.fillStyle = rgb(TINCTURE[arms.divTincture]);
    x.fillRect(0, 0, W, H / 3);       // a chief is a THIRD; less does not read
  }
  if (!arms.charge) return;
  x.fillStyle = rgb(TINCTURE[arms.chargeTincture]);
  const cx = W / 2, cy = H * (arms.chargeY !== undefined ? arms.chargeY : 0.42);
  const s = Math.min(W, H) * (arms.chargeScale || 0.52);
  if (arms.charge === 'mullet') pathMullet(x, cx, cy, s / 2);
  else if (arms.charge === 'tower') pathTower(x, cx, cy, s * 0.72, s);
  else if (arms.charge === 'lozenge') pathLozenge(x, cx, cy, s * 0.66, s);
  else if (arms.charge === 'cross') pathCross(x, cx, cy, s, s, s * 0.28);
  else { x.beginPath(); x.arc(cx, cy, s / 2, 0, Math.PI * 2); }   // roundel
  x.fill();
}

// THE CLOTH BAKE. Colour + alpha in one canvas (alphaTest reads the map's own
// alpha, so no second texture and no `transparent`), and a WEAVE height field
// for the normal map — the folds are geometry, the weave is lighting.
//
// The hem frays in two layers, which is what stops a flag looking laser-cut:
// a noisy alpha threshold along the free edges, plus a dozen thread strands
// hanging past it.
export function bakeCloth({ size = 256, seed, arms, fray = true, hemBand = 0.13 }) {
  const { c: cCan, x } = canvas2d(size);
  paintArms(x, size, size, arms);
  const img = x.getImageData(0, 0, size, size);
  const d = img.data;
  const { c: hCan, x: hx } = canvas2d(size);
  const hImg = hx.createImageData(size, size);
  const rnd = mulberry32(seed);
  // Thread strands: chosen before the pixel loop so they are seeded, not
  // scattered. Each is a column that survives a little past the hem.
  const threads = [];
  for (let i = 0; i < 14; i++) threads.push({ u: rnd(), len: 0.02 + rnd() * 0.055, w: 0.004 + rnd() * 0.006 });

  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const i = (py * size + px) * 4;
      // Dye is never even: a broad drift plus a fine one, and the low-value
      // tinctures need it most or they read as vinyl.
      const drift = 0.88 + 0.24 * fbm(u * 2.6, v * 3.4, 3, 3, seed + 11);
      const weave = turb(u * 190, v * 190, 190, 2, seed + 29);
      const k = drift * (1 - 0.08 * weave);
      d[i] = clamp01(d[i] * k / 255) * 255;
      d[i + 1] = clamp01(d[i + 1] * k / 255) * 255;
      d[i + 2] = clamp01(d[i + 2] * k / 255) * 255;
      if (fray) {
        // Free edges: the bottom and the two sides. `e` is 0 deep in the
        // cloth and 1 at the very edge; the threshold wanders under fbm.
        const eB = 1 - smoothstep(1 - hemBand, 1, v);
        const eL = smoothstep(0, hemBand * 0.45, u);
        const eR = 1 - smoothstep(1 - hemBand * 0.45, 1, u);
        const edge = Math.min(eB, eL, eR);
        const n = fbm(u * 26, v * 26, 26, 3, seed + 41);
        let a = edge > 0.5 ? 1 : (edge * 2 > n * 0.85 ? 1 : 0);
        if (a === 0) {
          for (const t of threads) {
            if (Math.abs(u - t.u) < t.w && v < 1 - hemBand + t.len) { a = 1; break; }
          }
        }
        d[i + 3] = a ? 255 : 0;
      }
      // HEIGHT: the weave, and a hem seam a little proud all the way round.
      const seam = (1 - smoothstep(0.012, 0.03, Math.min(u, 1 - u, v, 1 - v))) * 0.18;
      const h = clamp01(0.5 + 0.14 * (weave - 0.5) + seam
        + 0.05 * (fbm(u * 40, v * 12, 40, 2, seed + 7) - 0.5)) * 255;
      const j = (py * size + px) * 4;
      hImg.data[j] = h; hImg.data[j + 1] = h; hImg.data[j + 2] = h; hImg.data[j + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  hx.putImageData(hImg, 0, 0);
  const map = colorTexture(cCan);
  return {
    map,
    normalMap: heightToNormal(hCan, 1.0),
    roughnessMap: roughFromHeight(hCan, 256, seed + 999),
  };
}

// THE FOLD FIELD. A gonfalon is pinned along its top edge and free
// everywhere else, so the fold amplitude grows downward: A(v) = v^1.4.
//
// THE CORRECTION THAT MAKES IT CLOTH, and the reason a first attempt reads as
// painted sheet metal: fabric that folds gets NARROWER (the material goes
// into the fold, not out of the plane), and its free hem SCALLOPS between the
// folds. Skip either and no amount of normal map saves it.
export function buildGonfalon({ w, h, seed, material, segU = 8, segV = 10 }) {
  const geo = new THREE.PlaneGeometry(w, h, segU, segV);
  const rnd = mulberry32(seed);
  const p0 = rnd() * Math.PI * 2, p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const zf = 0.055 * w;
  const zAt = (u, A) => zf * A * (1.00 * Math.sin(2 * Math.PI * 1.5 * u + p0)
    + 0.45 * Math.sin(2 * Math.PI * 2.5 * u + p1)
    + 0.22 * Math.sin(2 * Math.PI * 4.0 * u + p2));
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i), y0 = pos.getY(i);
    const u = x0 / w + 0.5;
    const v = 0.5 - y0 / h;                    // 0 pinned top → 1 free hem
    const A = Math.pow(v, 1.4);
    const z = zAt(u, A);
    pos.setX(i, x0 * (1 - 0.10 * A));
    pos.setY(i, y0 - 0.05 * h * (1 - Math.cos(2 * Math.PI * 1.5 * u + p0)) / 2);
    pos.setZ(i, z);
    // ANALYTIC normals (G7): computeVertexNormals after a displacement this
    // shallow averages the fold away and flattens the shading.
    const e = 1e-3;
    const dzdu = (zAt(u + e, A) - zAt(u - e, A)) / (2 * e * w);
    const Av = Math.pow(Math.min(1, v + e), 1.4), Am = Math.pow(Math.max(0, v - e), 1.4);
    const dzdv = (zAt(u, Av) - zAt(u, Am)) / (2 * e * h);
    const n = new THREE.Vector3(-dzdu, dzdv, 1).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true; nor.needsUpdate = true;
  const mesh = new THREE.Mesh(ensureColor(geo), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// SHIELDS
// ---------------------------------------------------------------------------
// A heater shield: straight top and upper sides, then two quadratics to the
// point. h = 1.18 w is the proportion that reads as "shield" rather than as
// "spade".
//
// G6 IS THE TRAP HERE. ExtrudeGeometry's bevel does not inset — it pushes the
// body OUT along each vertex bisector by bevelSize/sin(θ/2), and a 40° point
// grows by THREE times the bevel. The point is therefore drawn short by
// exactly that overshoot, so the silhouette ends where the arithmetic says.
export function buildHeaterShield({ w, seed, material, depth = 0.055, bevel = 0.010 }) {
  const h = 1.18 * w;
  const over = bevel / Math.sin((40 * Math.PI / 180) / 2);      // ≈ 2.9 × bevel
  const s = new THREE.Shape();
  const top = h / 2, bot = -h / 2 + over, hw = w / 2 - bevel;
  s.moveTo(-hw, top);
  s.lineTo(hw, top);
  s.lineTo(hw, top - 0.35 * h);
  s.quadraticCurveTo(hw, bot + 0.30 * h, 0, bot);
  s.quadraticCurveTo(-hw, bot + 0.30 * h, -hw, top - 0.35 * h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelSegments: 1, bevelSize: bevel,
    bevelThickness: bevel, curveSegments: 5, steps: 1,
  });
  // Curvature: a shield is dished. z += k(1 − (2x/w)²), and the normals are
  // rotated about Y analytically rather than recomputed (G7 again — a
  // recompute here would erase the bevel's crisp rim).
  const k = 0.10 * w;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const q = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) + k * (1 - Math.pow(2 * x / w, 2)));
    const a = Math.atan(8 * k * x / (w * w));
    q.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    nor.setXYZ(i, q.x * Math.cos(a) + q.z * Math.sin(a), q.y, -q.x * Math.sin(a) + q.z * Math.cos(a));
  }
  pos.needsUpdate = true; nor.needsUpdate = true;
  // UVs: a FACING projection for the front, everything else parked on a plain
  // corner of the canvas. planarUV would tile the emblem across the rim.
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    if (nor.getZ(i) > 0.5) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
    else uv.setXY(i, 0.985, 0.985);
  }
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(ensureColor(geo), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.shieldSeed = seed;
  return mesh;
}

// The face of a shield: arms, then WEAR. Paint is a layer with thickness, so
// where it wears off the board shows and the height drops — a painted-only
// chip reads as dirt. The corner park at (0.985, 0.985) is left plain.
export function bakeShieldFace({ size = 256, seed, arms, board = [0x5a, 0x4a, 0x36] }) {
  const { c: cCan, x } = canvas2d(size);
  paintArms(x, size, size, arms);
  const img = x.getImageData(0, 0, size, size);
  const d = img.data;
  const { c: hCan, x: hx } = canvas2d(size);
  const hImg = hx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size, i = (py * size + px) * 4;
      const edge = 1 - smoothstep(0, 0.08, Math.min(u, 1 - u, v, 1 - v));
      const wear = smoothstep(0.42, 0.62, fbm(u * 6, v * 6, 6, 4, seed)) * (0.25 + 0.75 * edge);
      const chip = (fbm(u * 11, v * 11, 11, 3, seed + 41) > 0.66 ? 1 : 0) * edge;
      const m = Math.max(wear * 0.7, chip);
      d[i] += (board[0] - d[i]) * m;
      d[i + 1] += (board[1] - d[i + 1]) * m;
      d[i + 2] += (board[2] - d[i + 2]) * m;
      const h = clamp01(0.62 - 0.10 * chip + 0.05 * (fbm(u * 30, v * 30, 30, 2, seed + 5) - 0.5)
        + 0.10 * (1 - smoothstep(0.02, 0.06, Math.min(u, 1 - u, v, 1 - v)))) * 255;
      hImg.data[i] = h; hImg.data[i + 1] = h; hImg.data[i + 2] = h; hImg.data[i + 3] = 255;
    }
  }
  // The parked corner: plain board, so the rim and the back are timber.
  x.putImageData(img, 0, 0);
  x.fillStyle = rgb(board);
  x.fillRect(size - 12, size - 12, 12, 12);
  hx.putImageData(hImg, 0, 0);
  return mapsFromCanvases(cCan, hCan, seed + 3);
}

// ---------------------------------------------------------------------------
// FIRE — a cresset, a sconce, and the pane that glows
// ---------------------------------------------------------------------------
// THE EMISSIVE IDIOM IS THE ANVIL'S, VERBATIM (docs/TOWER.md, the third
// model): `emissive` stays WHITE and the BAKE carries the colour, because a
// flat tint throws away the ramp from dead char through dull red to the hot
// crack — which is the entire picture. `vertexColors` multiplies the diffuse
// only, so the AO bake darkens the char without ever dimming the seams.
//
// AND THE PANE IS OPAQUE. The eye must see COALS, not a hole with light
// behind it; a translucent pane at the top of a shaft is also a sightline.
export function emberMaterial(m, intensity) {
  return new THREE.MeshStandardMaterial({
    map: m.map, normalMap: m.normalMap, normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: m.roughnessMap, roughness: 1, metalness: 0,
    emissive: 0xffffff, emissiveMap: m.emissiveMap, emissiveIntensity: intensity,
    envMapIntensity: 0.45, vertexColors: true,
  });
}

// A PAINTED CAGE. Real bars would be 0.03 across — a pixel and a quarter at
// the resting eye, and 900 triangles to say nothing. One open tube with the
// bars in its normal map is 16 triangles and reads better, because a painted
// bar is always exactly one crisp bar wide.
export function bakeCage({ size = 128, seed, bars = 8, stops }) {
  const { c: cCan } = canvas2d(size);
  const cx = cCan.getContext('2d');
  const cImg = cx.createImageData(size, size);
  const { c: hCan } = canvas2d(size);
  const hx = hCan.getContext('2d');
  const hImg = hx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size, i = (py * size + px) * 4;
      // Vertical bars, plus two hoops. The gap between bars is the DARK part:
      // a cage seen against a fire is bars in silhouette, so the gaps get the
      // warm dark and the bars get the metal.
      const bu = (u * bars) % 1;
      const bar = 1 - smoothstep(0.26, 0.40, Math.abs(bu - 0.5));
      const hoop = Math.max(1 - smoothstep(0.03, 0.06, Math.abs(v - 0.24)),
        1 - smoothstep(0.03, 0.06, Math.abs(v - 0.78)));
      const metal = clamp01(Math.max(bar, hoop));
      const pit = turb(u * 40, v * 40, 40, 3, seed + 13);
      const t = clamp01(0.30 + 0.42 * fbm(u * 6, v * 6, 6, 3, seed) - 0.30 * pit);
      let [r8, g8, b8] = ramp3(stops, t);
      const k = 0.16 + 0.84 * metal;
      r8 *= k; g8 *= k; b8 *= k;
      cImg.data[i] = r8; cImg.data[i + 1] = g8; cImg.data[i + 2] = b8; cImg.data[i + 3] = 255;
      const h = clamp01(0.34 + 0.44 * metal + 0.06 * (pit - 0.5)) * 255;
      hImg.data[i] = h; hImg.data[i + 1] = h; hImg.data[i + 2] = h; hImg.data[i + 3] = 255;
    }
  }
  cx.putImageData(cImg, 0, 0);
  hx.putImageData(hImg, 0, 0);
  return mapsFromCanvases(cCan, hCan, seed + 77);
}

// A CRESSET: an iron basket of coals on a bracket, with a cap over it.
// Returns { group, hanger } — `hanger` is the part that swings, so the caller
// can register the sway on it and leave the bracket bolted to the wall.
//
// SCALE: the fitting is ~0.55 × 0.85 u, about two thirds of a d6. Smaller and
// the cage bars stop existing even as paint; larger and it stops being
// hardware and becomes a brazier.
// THREE DRAW CALLS, and that is a design constraint rather than an accident:
// the bracket (bolted, static), the hanging ironwork (swings), and the fire
// (its own emissive material). Six separate little meshes would be six draw
// calls for a prop two thirds of a d6 across.
export function buildCresset({
  seed, ironMat, cageMat, fireMat,
  reach = 0.52, r = 0.25, basketH = 0.34, hangDrop = 0.16,
}) {
  const group = new THREE.Group();
  const parts = [];
  // The bracket: an arm out from the wall and a diagonal brace under it. Two
  // rounded boxes; the third one a real bracket would have is under 0.07 and
  // is therefore in the cage bake's business, not the geometry's.
  const bracket = new THREE.Mesh(mergeGeos([
    { geo: propUV(roundedBox(0.075, 0.075, reach, R_PROP, 1), 0.5),
      matrix: xform({ pos: [0, 0, reach / 2] }) },
    { geo: propUV(roundedBox(0.06, 0.06, reach * 0.92, R_PROP, 1), 0.5),
      matrix: xform({ pos: [0, -reach * 0.30, reach * 0.42], rot: [-38 * Math.PI / 180, 0, 0] }) },
  ]), ironMat);
  group.add(bracket); parts.push(bracket);

  // Everything below the arm's tip hangs, and therefore swings.
  const hanger = new THREE.Group();
  hanger.position.set(0, 0, reach - 0.04);
  group.add(hanger);

  const yB = -hangDrop - basketH / 2;
  // A HOOP at the rim instead of a cap. LOOKED AT, THEN CUT: the first cut
  // had the pagoda cap the dossier suggests, and from the shipped eye — which
  // looks slightly DOWN at a prop 8 units up — the cap is a lid over the only
  // part of the prop anybody can see. A capped cresset renders as a black
  // bucket. The cap is 48 triangles of hiding the feature.
  const iron = new THREE.Mesh(mergeGeos([
    // the hanging link
    { geo: propUV(roundedBox(0.045, hangDrop, 0.045, 0.012, 1), 0.4),
      matrix: xform({ pos: [0, -hangDrop / 2, 0] }) },
    // the basket — an OPEN tube whose bars live in the normal map
    { geo: new THREE.CylinderGeometry(r, r * 0.80, basketH, 10, 1, true),
      matrix: xform({ pos: [0, yB, 0] }) },
    // …and its rim hoop, which is what stops the tube reading as a pipe
    { geo: new THREE.TorusGeometry(r, 0.026, 4, 12),
      matrix: xform({ pos: [0, -hangDrop, 0], rot: [Math.PI / 2, 0, 0] }) },
  ]), cageMat);
  hanger.add(iron); parts.push(iron);

  // The fuel, and it stands PROUD of the rim — the bars cut across its lower
  // half and its top is open to the sky, which is the whole read: coals in a
  // basket, seen from above. Opaque (the anvil rule: the eye sees coals, not
  // a hole), and the bake is what makes it fire rather than a bulb.
  const fireH = basketH * 0.92;
  const fire = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.93, r * 0.66, fireH, 10, 1, false), fireMat);
  fire.position.set(0, -hangDrop + 0.085 - fireH / 2, 0);
  hanger.add(fire); parts.push(fire);

  for (const p of parts) { ensureColor(p.geometry); p.castShadow = true; p.receiveShadow = true; }
  void seed;
  return { group, hanger, parts, fire };
}

// A SCONCE: the same fire on a flat wall plate, no hanging, no swing. What a
// castle actually bolts beside a door — and beside an arrow loop, where it
// makes the darkest-dark/lightest-light adjacency that pins a focal point.
export function buildSconce({ seed, ironMat, cageMat, fireMat, r = 0.23, bowlH = 0.30, out = 0.34 }) {
  const group = new THREE.Group();
  const parts = [];
  const iron = new THREE.Mesh(mergeGeos([
    { geo: propUV(roundedBox(0.30, 0.46, 0.07, R_PROP, 1), 0.5),
      matrix: xform({ pos: [0, 0, 0.035] }) },
    { geo: propUV(roundedBox(0.06, 0.06, out, R_PROP, 1), 0.5),
      matrix: xform({ pos: [0, -0.10, out / 2 + 0.04], rot: [-24 * Math.PI / 180, 0, 0] }) },
    { geo: new THREE.CylinderGeometry(r, r * 0.62, bowlH, 10, 1, true),
      matrix: xform({ pos: [0, 0.06, out + 0.02] }) },
  ]), cageMat || ironMat);
  const fire = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.82, r * 0.66, bowlH * 0.7, 10, 1, false), fireMat);
  fire.position.set(0, 0.05, out + 0.02);
  group.add(iron, fire);
  parts.push(iron, fire);
  for (const p of parts) { ensureColor(p.geometry); p.castShadow = true; p.receiveShadow = true; }
  void seed; void ironMat;
  return { group, parts, fire };
}

// ---------------------------------------------------------------------------
// GROWTH — ivy, moss
// ---------------------------------------------------------------------------
// IVY IS A GUIDED WALK IN SURFACE PARAMETERS, not space colonisation: the
// latter needs a 3D attractor volume and a tower wall has none. Luft's rule —
// keep going the way you were going, wander a little, climb, and let gravity
// win more the older the strand gets.
//
// Returns paths in the caller's own (u, v) parameters. The caller maps them:
// u is across the surface (world x, or arc length on a drum), v is up.
export function growIvy({
  seed, start = [0, 0], strands = 3, steps = 56, step = 0.10,
  spread = 0.30, gravity = 0.40, branchP = 0.07, uLim = [-9, 9], vLim = [0, 9],
}) {
  const rnd = mulberry32(seed);
  const paths = [];
  const walk = (u0, v0, dir0, depth, n) => {
    const path = [[u0, v0]];
    let u = u0, v = v0, dx = dir0[0], dy = dir0[1];
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const g = 0.05 + gravity * t;
      let nx = 0.62 * dx + spread * (rnd() * 2 - 1) + 0.0;
      let ny = 0.62 * dy + spread * (rnd() * 2 - 1) + 0.55 - g;
      const L = Math.hypot(nx, ny) || 1;
      dx = nx / L; dy = ny / L;
      u += dx * step; v += dy * step;
      if (u < uLim[0] || u > uLim[1] || v < vLim[0] || v > vLim[1]) break;
      path.push([u, v]);
      if (depth < 3 && rnd() < branchP) {
        const a = (35 + rnd() * 20) * Math.PI / 180 * (rnd() < 0.5 ? 1 : -1);
        const bx = dx * Math.cos(a) - dy * Math.sin(a), by = dx * Math.sin(a) + dy * Math.cos(a);
        walk(u, v, [bx, by], depth + 1, Math.round(n * 0.55));
      }
    }
    if (path.length > 3) paths.push(path);
  };
  for (let s = 0; s < strands; s++) {
    const a = (rnd() - 0.5) * 0.5;
    walk(start[0] + (rnd() - 0.5) * 0.5, start[1], [Math.sin(a), Math.cos(a)], 0,
      Math.round(steps * (0.7 + rnd() * 0.5)));
  }
  return paths;
}

// Leaves along the paths: position, a normal tilted off the wall toward the
// sky, a roll, a scale and a tint. Older strands (higher t) go yellower;
// one leaf in eight is a dead brown one.
export function ivyLeaves({ paths, seed, every = 1.6, size = 0.19 }) {
  const rnd = mulberry32(seed + 17);
  const out = [];
  for (const path of paths) {
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      acc += 1;
      if (acc < every) continue;
      acc = 0;
      const [u, v] = path[i];
      const t = i / path.length;
      const s = size * (0.7 + rnd() * 0.6);
      const tint = rnd() < 0.12
        ? [0x7a / 255, 0x4a / 255, 0x24 / 255]
        : [(0x3f + (0x6f - 0x3f) * t) / 255, (0x5a + (0x7a - 0x5a) * t) / 255,
          (0x24 + (0x34 - 0x24) * t) / 255];
      out.push({
        u: u + (rnd() - 0.5) * 0.06, v: v + (rnd() - 0.5) * 0.06,
        scale: s, roll: (rnd() - 0.5) * 50 * Math.PI / 180,
        lift: 0.012 + rnd() * 0.03, tilt: 0.35 + rnd() * 0.25, tint,
      });
    }
  }
  return out;
}

// THE STEMS, AND WHY THEY ARE A PANEL RATHER THAN THE WALL BAKE.
// The dossier's advice is to rasterise ivy stems into the wall canvas: zero
// triangles, and a tube for a 2-px feature is 294 triangles of nothing. But
// every wall texture in this repo tiles at WORLD scale, so a stem painted into
// the plank bake grows on all four sides of the tower at once. So the stems
// get their own small NON-TILING panel, alpha-tested, two triangles, standing
// a hair off the wall — which is the dossier's economics with this repo's UV
// scheme respected.
//
// Two layers, because one is a scratch: a warm-dark cord and a bright lip
// along one side of it, which is what makes a 3-px line read as round.
export function bakeStems({
  size = 256, paths, uRange, vRange, world, seed,
  wStem = 0.055, cord = '#1a150e', lip = 'rgba(118,102,64,0.45)',
}) {
  const { c, x } = canvas2d(size);
  const [u0, u1] = uRange, [v0, v1] = vRange;
  const X = (u) => (u - u0) / (u1 - u0) * size;
  const Y = (v) => size - (v - v0) / (v1 - v0) * size;
  const lw = Math.max(2, wStem / (u1 - u0) * size);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const draw = (style, width, dx) => {
    x.strokeStyle = style; x.lineWidth = width;
    for (const p of paths) {
      if (p.length < 2) continue;
      x.beginPath();
      x.moveTo(X(p[0][0]) + dx, Y(p[0][1]));
      for (let i = 1; i < p.length; i++) x.lineTo(X(p[i][0]) + dx, Y(p[i][1]));
      x.stroke();
    }
  };
  draw(cord, lw, 0);
  draw(lip, Math.max(1, lw * 0.24), -lw * 0.30);
  // Rough the alpha edge so a stem is a cord and not a vector path.
  const img = x.getImageData(0, 0, size, size);
  const d = img.data;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      if (!d[i + 3]) continue;
      const n = turb(px / size * 60, py / size * 22, 60, 2, seed);
      d[i + 3] = d[i + 3] * (0.6 + 0.75 * n) > 150 ? 255 : 0;
    }
  }
  x.putImageData(img, 0, 0);
  void world;
  return colorTexture(c);
}

// An ivy leaf, as alpha. Five lobes, a pale midrib, and the whole thing drawn
// once — the instance tint is what makes sixty of them different.
export function bakeLeaf({ size = 64, seed }) {
  const { c, x } = canvas2d(size);
  const R = size * 0.46, cx = size / 2, cy = size * 0.54;
  x.translate(cx, cy);
  x.beginPath();
  // A polar rose with five lobes, squashed: r(θ) = R(0.62 + 0.38|cos(2.5θ)|).
  for (let i = 0; i <= 96; i++) {
    const th = -Math.PI / 2 + (i / 96) * Math.PI * 2;
    const lobe = 0.60 + 0.40 * Math.abs(Math.cos(2.5 * (th + Math.PI / 2)));
    const r = R * lobe * (th > 0.9 && th < 2.24 ? 0.72 : 1);   // the stem notch
    const px = Math.sin(th) * r * 0.95, py = -Math.cos(th) * r;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
  x.fillStyle = '#4c6b2a';
  x.fill();
  // Veins: pale, thin, and only three of them — five reads as a doily.
  x.strokeStyle = 'rgba(160,186,120,0.55)';
  x.lineWidth = Math.max(1, size / 42);
  for (const a of [-0.62, 0, 0.62]) {
    x.beginPath(); x.moveTo(0, R * 0.42);
    x.lineTo(Math.sin(a) * R * 0.72, R * 0.42 - Math.cos(a) * R * 1.02);
    x.stroke();
  }
  // A darker rim, so a leaf against a dark wall still has an edge.
  x.globalCompositeOperation = 'source-atop';
  const g = x.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(10,18,6,0.55)');
  x.fillStyle = g;
  x.fillRect(-size, -size, size * 2, size * 2);
  return colorTexture(c);
}

// A moss tuft, as alpha — the SILHOUETTE moss needs where an edge shows. The
// texture pass below does the surface; these are the two-triangle cards that
// stop a mossy ledge having a razor edge.
export function bakeTuft({ size = 64, seed }) {
  const { c, x } = canvas2d(size);
  const rnd = mulberry32(seed);
  const img = x.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size, i = (py * size + px) * 4;
      // Blades: a comb of vertical strands whose tops wander.
      const n = fbm(u * 13, 0.5, 13, 3, seed);
      const top = 0.18 + 0.55 * n;
      const inside = v > 1 - top - 0.02 * fbm(u * 40, v * 8, 40, 2, seed + 3);
      const t = clamp01((v - (1 - top)) / (top || 1));
      const [r8, g8, b8] = ramp3([[0x28, 0x38, 0x18], [0x46, 0x5c, 0x24], [0x74, 0x86, 0x3c]],
        clamp01(0.15 + 0.85 * t * (0.6 + 0.5 * fbm(u * 30, v * 30, 30, 2, seed + 9))));
      img.data[i] = r8; img.data[i + 1] = g8; img.data[i + 2] = b8;
      img.data[i + 3] = inside && u > 0.03 && u < 0.97 ? 255 : 0;
    }
  }
  x.putImageData(img, 0, 0);
  void rnd;
  return colorTexture(c);
}

// MOSS, IN TEXTURE SPACE — zero triangles. It is painted into the colour and
// the height canvases of a bake the tower is already wearing, so it costs one
// material and no geometry.
//
// The tells that separate moss from a green stain, all three of them:
//   · it grows in the GROOVES first (damp holds where water sits),
//   · it stands PROUD — the height goes up, not down,
//   · it is ROUGH — the specular dies where it grows.
// `climbFrom`/`climbTo` are in canvas v (0 at the top of the tile), so a
// caller aims the gradient at the part of the tile its mesh actually shows.
const MOSS = [[0x22, 0x30, 0x16], [0x3d, 0x52, 0x22], [0x62, 0x74, 0x33]];
export function mossPass(cCan, hCan, {
  seed, amount = 0.85, climbFrom = 1.0, climbTo = 0.45, scale = 4, stops = MOSS,
}) {
  const W = cCan.width;
  const cx = cCan.getContext('2d'), hx = hCan.getContext('2d');
  const cImg = cx.getImageData(0, 0, W, W), hImg = hx.getImageData(0, 0, W, W);
  const cd = cImg.data, hd = hImg.data;
  for (let py = 0; py < W; py++) {
    const v = py / W;
    for (let px = 0; px < W; px++) {
      const u = px / W, i = (py * W + px) * 4;
      const patch = smoothstep(0.48, 0.70, fbm(u * scale, v * scale * 0.8, Math.round(scale), 4, seed + 707));
      // The groove signal comes from the HEIGHT the bake already painted:
      // low height is a joint or a plank seam, which is where moss starts.
      const groove = clamp01(1 - hd[i] / 255 * 1.55);
      const climb = clamp01((climbFrom - v) / (climbFrom - climbTo || 1));
      const m = clamp01(patch * (0.35 + 0.65 * groove) * (0.25 + 0.75 * climb) * amount);
      if (m <= 0.002) continue;
      const [r8, g8, b8] = ramp3(stops, fbm(u * 12, v * 12, 12, 3, seed + 31));
      cd[i] += (r8 - cd[i]) * m;
      cd[i + 1] += (g8 - cd[i + 1]) * m;
      cd[i + 2] += (b8 - cd[i + 2]) * m;
      const h = Math.min(255, hd[i] + 0.04 * 255 * m);
      hd[i] = h; hd[i + 1] = h; hd[i + 2] = h;
    }
  }
  cx.putImageData(cImg, 0, 0);
  hx.putImageData(hImg, 0, 0);
}

// ---------------------------------------------------------------------------
// WEATHERING IN THE VERTEX-COLOUR CHANNEL
// ---------------------------------------------------------------------------
// GRAVITY GOVERNS ALL WEATHERING — soot below a lip, rust below a band,
// streaks below a crenel, moss at the base. An upward stain reads fake
// instantly, and the trouble is that every wall texture in this repo tiles at
// WORLD SCALE: a stain painted into the tile repeats wherever the tile does,
// and it cannot know where the bands are.
//
// So gravity weathering lives in the vertex COLOURS instead, applied in world
// space after bakeVertexAO has written them. Zero triangles, zero textures,
// zero draw calls, and it knows exactly where every band is because the skin
// hands it the numbers. It is a MULTIPLIER — values above 1 brighten (which
// is how efflorescence works), values below darken.
//
// Its resolution is the mesh's own vertex grid, so it does broad things well
// (a soot gradient over a crown, a green cast on a shaded flank) and fine
// ones not at all. Fine directional stains are `buildStains` below.
export function gravityStain(parts, fn) {
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const out = [1, 1, 1];
  for (const mesh of parts) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    let col = geo.attributes.color;
    if (!col) {
      col = new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3);
      geo.setAttribute('color', col);
    }
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(nor, i).transformDirection(mesh.matrixWorld);
      out[0] = out[1] = out[2] = 1;
      if (fn(p, n, out) === false) continue;
      col.setXYZ(i, col.getX(i) * out[0], col.getY(i) * out[1], col.getZ(i) * out[2]);
    }
    col.needsUpdate = true;
  }
}

// FINE DIRECTIONAL STAINS — rust running down from a band, water running down
// from a crenel gap. Alpha-tested quads standing a hair in front of the wall,
// ALL MERGED INTO ONE GEOMETRY so the whole set is one draw call.
//
// The sheet is a strip of `cells`; each quad picks one, so five streaks can be
// five different streaks out of one canvas and one material.
export function bakeStainSheet({ size = 256, cells, seed }) {
  const N = cells.length;
  const { c, x } = canvas2d(size);
  const img = x.createImageData(size, size);
  const cw = size / N;
  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      const ci = Math.min(N - 1, Math.floor(px / cw));
      const cell = cells[ci];
      const u = (px - ci * cw) / cw;             // 0..1 within the cell
      const s = seed + ci * 613;
      // Runs: a few vertical channels whose width and reach vary, fading out
      // downward. `v` is the canvas top, which the caller pins to the SOURCE
      // of the stain — a band's underside, a crenel's floor.
      const lanes = cell.lanes || 3;
      let a = 0, tone = 0;
      for (let L = 0; L < lanes; L++) {
        const cu = (L + 0.5) / lanes + (hash2(L, 0, s) - 0.5) * 0.5 / lanes;
        const wdt = (cell.width || 0.16) * (0.5 + hash2(L, 1, s));
        const reach = (cell.reach || 0.8) * (0.55 + 0.7 * hash2(L, 2, s));
        const wob = (fbm(v * 7, L, 8, 3, s) - 0.5) * wdt * 0.9;
        const d = Math.abs(u - cu - wob) / wdt;
        const down = 1 - smoothstep(reach * 0.45, reach, v);
        const edge = (1 - smoothstep(0.35, 1.0, d)) * down;
        const grain = 0.55 + 0.75 * fbm(u * 30, v * 12, 30, 3, s + 5);
        const aa = edge * grain;
        if (aa > a) { a = aa; tone = 0.35 + 0.65 * fbm(u * 18, v * 6, 18, 2, s + 9); }
      }
      // Patches (efflorescence, damp blooms) — no direction, just cells.
      if (cell.patch) {
        const pa = smoothstep(0.52, 0.74, fbm(u * 3.4, v * 3.0, 3, 4, s + 21));
        if (pa > a) { a = pa; tone = 0.4 + 0.6 * fbm(u * 22, v * 22, 22, 2, s + 27); }
      }
      const col = ramp3(cell.stops, tone);
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2];
      // ALPHA TEST, not blending (G4/G5): the threshold is 0.5 and the noise
      // above is what makes the cut ragged instead of rectangular.
      img.data[i + 3] = a > (cell.cut || 0.42) ? 255 : 0;
    }
  }
  x.putImageData(img, 0, 0);
  return colorTexture(c);
}

// Build the quads. Each def is { cell, w, h, pos:[x,y,z], rot?:[x,y,z] } with
// the quad hanging DOWN from pos (its top edge at pos.y), because that is
// what a stain does.
export function buildStains({ defs, cells, tex, material }) {
  const N = cells;
  const entries = [];
  for (const d of defs) {
    const g = new THREE.PlaneGeometry(d.w, d.h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (d.cell + uv.getX(i)) / N, uv.getY(i));
    }
    uv.needsUpdate = true;
    entries.push({ geo: g, matrix: xform({ pos: [d.pos[0], d.pos[1] - d.h / 2, d.pos[2]], rot: d.rot || [0, 0, 0] }) });
  }
  const mesh = new THREE.Mesh(ensureColor(mergeGeos(entries)), material || new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide,
    roughness: 0.95, metalness: 0, envMapIntensity: 0.45, vertexColors: true,
  }));
  mesh.castShadow = false; mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// ROPE AND CHAIN
// ---------------------------------------------------------------------------
// Rope: a tube along a Catmull-Rom, with the lay (the twist) in the normal
// map. `h(u,v)` advances the cord phase with u so the twist actually spirals
// instead of ringing.
export function bakeRope({ size = 128, seed, stops = [[0x4a, 0x3c, 0x26], [0x77, 0x63, 0x42], [0x9d, 0x89, 0x60]] }) {
  const { c: cCan } = canvas2d(size);
  const cx = cCan.getContext('2d');
  const cImg = cx.createImageData(size, size);
  const { c: hCan } = canvas2d(size);
  const hx = hCan.getContext('2d');
  const hImg = hx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size, i = (py * size + px) * 4;
      const cord = 0.5 + 0.5 * Math.cos(2 * Math.PI * 3 * (v + 0.9 * u));
      const fuzz = turb(u * 90, v * 40, 90, 2, seed);
      const t = clamp01(0.25 + 0.55 * cord + 0.30 * (fuzz - 0.5));
      const [r8, g8, b8] = ramp3(stops, t);
      cImg.data[i] = r8; cImg.data[i + 1] = g8; cImg.data[i + 2] = b8; cImg.data[i + 3] = 255;
      const h = clamp01(0.5 + 0.35 * (cord - 0.5) - 0.05 * fuzz) * 255;
      hImg.data[i] = h; hImg.data[i + 1] = h; hImg.data[i + 2] = h; hImg.data[i + 3] = 255;
    }
  }
  cx.putImageData(cImg, 0, 0);
  hx.putImageData(hImg, 0, 0);
  const m = mapsFromCanvases(cCan, hCan, seed + 41);
  m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
  m.normalMap.wrapS = m.normalMap.wrapT = THREE.RepeatWrapping;
  m.roughnessMap.wrapS = m.roughnessMap.wrapT = THREE.RepeatWrapping;
  return m;
}

export function buildRope({ points, r = 0.045, seg = 26, radial = 5, material }) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, seg, r, radial, false);
  const mesh = new THREE.Mesh(ensureColor(geo), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// A loose coil, hung: turns that shrink slightly as they go down, which is
// what a coil hanging on a peg actually does.
export function coilPoints({ at, R = 0.30, turns = 3.2, drop = 0.30, n = 40 }) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const r = R * (1 - 0.06 * t * turns);
    pts.push([at[0] + Math.cos(a) * r, at[1] - drop * t - Math.abs(Math.sin(a)) * 0.02,
      at[2] + Math.sin(a) * r * 0.35]);
  }
  return pts;
}

// A SHORT chain of REAL links — and short is the rule. A link is 80 triangles;
// four to six of them as a hanger is worth it because the alternating 90°
// twist is the whole read. A long run gets a tube with a chain normal map
// instead, and this function will not build one.
export function buildChainHanger({ links = 5, R = 0.075, r = 0.022, at = [0, 0, 0], material }) {
  const entries = [];
  const pitch = R * 1.55;
  for (let i = 0; i < Math.min(links, 6); i++) {
    entries.push({
      geo: new THREE.TorusGeometry(R, r, 4, 10),
      matrix: xform({ pos: [at[0], at[1] - i * pitch, at[2]], rot: [Math.PI / 2, i % 2 ? Math.PI / 2 : 0, 0] }),
    });
  }
  const mesh = new THREE.Mesh(ensureColor(mergeGeos(entries)), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// FORGE TOOLS — extruded silhouettes
// ---------------------------------------------------------------------------
// A horseshoe over the door is the highest-value prop in the whole dossier:
// 17 px of silhouette nobody can mistake for anything else.
export function buildHorseshoe({ R = 0.24, thick = 0.085, depth = 0.05, material }) {
  const s = new THREE.Shape();
  const sweep = 200 * Math.PI / 180, start = -Math.PI / 2 - sweep / 2;
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const a = start + sweep * (i / n);
    const p = [Math.cos(a) * R, Math.sin(a) * R];
    if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]);
  }
  for (let i = n; i >= 0; i--) {
    const a = start + sweep * (i / n);
    s.lineTo(Math.cos(a) * (R - thick), Math.sin(a) * (R - thick));
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.008,
    bevelThickness: 0.008, curveSegments: 1, steps: 1,
  });
  const mesh = new THREE.Mesh(ensureColor(geo), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// SMOKE — six fixed quads, and NOT a particle system
// ---------------------------------------------------------------------------
// PARTICLES ARE CONTRACT-OFF-LIMITS: js/particles.js is impact-keyed, "no
// impact, no particles", and a chimney that emits them would be the first
// thing in the app to break that. This is six quads on a loop instead.
//
// Everything about it is chosen to be cheap and to not look like a shader:
//   1. SIX FIXED QUADS, oriented once toward the resting eye. The camera
//      barely moves, so billboarding buys nothing and costs a matrix per
//      quad per frame.
//   2. MeshBasicMaterial — smoke is not lit, and a lit smoke quad picks up
//      the tower's rake and turns into a sheet of paper.
//   3. NEVER ADDITIVE. Real smoke OCCLUDES; additive smoke glows, which is
//      fire, not smoke. Peak alpha 0.35, and the canvas edges go to zero
//      asymptotically so a quad has no rectangle.
//   4. ONE DRAW CALL: the quads are merged, and the per-quad opacity rides a
//      `color` attribute at itemSize 4 — USE_COLOR_ALPHA (G2), so the alpha
//      channel multiplies too and no material is ever cloned.
//   5. Opacity is zero at BIRTH and at DEATH — pow(sin(πf), 1.2) — which is
//      what kills the pop when a quad wraps back to the bottom.
export function bakeSmoke({ size = 128, seed }) {
  const { c, x } = canvas2d(size);
  const img = x.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size, i = (py * size + px) * 4;
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      const puff = clamp01(1 - smoothstep(0.15, 1.0, d));
      // WISPS, NOT A BALL. The first cut used a low-frequency envelope and
      // the plume came out as one white ghost hovering over the crown —
      // legible as "something is there", illegible as smoke. Two octaves
      // more and a stronger noise weight tears the puff into strands.
      const n = 0.18 + 1.15 * fbm(u * 7.5, v * 5.0, 8, 5, seed);
      const a = clamp01(puff * puff * n);
      // Desaturated warm grey, and DARK: a cooling stack over a black room
      // is a haze the eye reads as depth, not a lantern. 128 was a ghost.
      const g = 96 + 26 * (fbm(u * 8, v * 8, 8, 2, seed + 13) - 0.5);
      img.data[i] = g * 1.03; img.data[i + 1] = g * 0.99; img.data[i + 2] = g * 0.94;
      img.data[i + 3] = a * 255;
    }
  }
  x.putImageData(img, 0, 0);
  return colorTexture(c);
}

export function buildSmokePlume({
  seed, n = 6, w = 1.1, y0 = 0, rise = 2.6, drift = 0.32, period = 9,
  peak = 0.35, tex, z = 0,
}) {
  const entries = [];
  for (let i = 0; i < n; i++) entries.push({ geo: new THREE.PlaneGeometry(w, w) });
  const geo = mergeGeos(entries);
  const count = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 4).fill(1), 4));
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexColors: true, fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;      // the quads move well past their build box
  const rnd = mulberry32(seed);
  const spec = { mesh, n, w, y0, rise, drift, period, peak, z, base: [], phase: [], psi: [] };
  for (let i = 0; i < n; i++) { spec.phase.push(rnd() * Math.PI * 2); spec.psi.push(rnd() * Math.PI * 2); }
  // The untransformed quad corners, kept so the step is a write and not a
  // read-modify-write of drifting values.
  const p = geo.attributes.position;
  for (let i = 0; i < count; i++) spec.base.push([p.getX(i), p.getY(i)]);
  return spec;
}

export function stepSmoke(spec, t) {
  const { mesh, n, y0, rise, drift, period, peak } = spec;
  const pos = mesh.geometry.attributes.position;
  const col = mesh.geometry.attributes.color;
  for (let i = 0; i < n; i++) {
    const f = ((t / period + i / n) % 1 + 1) % 1;
    const s = 1 + 1.9 * f;
    const yy = y0 + rise * f;
    const xx = drift * Math.sin(2 * Math.PI * 0.07 * t + spec.phase[i]) * f;
    const rz = 0.15 * Math.sin(2 * Math.PI * 0.05 * t + spec.psi[i]);
    const o = peak * Math.pow(Math.sin(Math.PI * f), 1.2) * Math.pow(1 - f, 0.6);
    const ca = Math.cos(rz), sa = Math.sin(rz);
    // A merged PlaneGeometry is SIX vertices (two triangles), not four — the
    // merge expands the index buffer, and writing four here leaves two
    // corners of every quad pinned at the origin.
    for (let k = 0; k < 6; k++) {
      const vi = i * 6 + k;
      const [bx, by] = spec.base[vi];
      const px = bx * s, py = by * s;
      pos.setXYZ(vi, xx + px * ca - py * sa, yy + px * sa + py * ca, spec.z);
      col.setXYZW(vi, 1, 1, 1, o);
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// INSTANCED FIELDS — leaves, tufts, coal
// ---------------------------------------------------------------------------
// G1 IS THE WHOLE COMMENT: instanceColor needs `vertexColors: true` AND a
// `color` attribute on the GEOMETRY, or the fragment shader never enters its
// vColor branch and every instance renders BLACK. Two things, and the second
// one is the one people forget.
//
// G4: an InstancedMesh cannot sort its instances (three sorts objects, not
// instances), so foliage is alphaTest and never `transparent`.
// G8: instanced props stay OUT of the bakeVertexAO parts array — its
// Box3.setFromObject unions every instance into one giant box, and that box
// would then occlude the whole tower's AO.
export function instancedField({ geo, material, items, name }) {
  const g = geo;
  if (!g.attributes.color) {
    g.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  }
  const mesh = new THREE.InstancedMesh(g, material, items.length);
  mesh.name = name || 'dressField';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    m.copy(it.matrix);
    mesh.setMatrixAt(i, m);
    if (it.tint) { c.setRGB(it.tint[0], it.tint[1], it.tint[2]); mesh.setColorAt(i, c); }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function leafMaterial(tex) {
  return new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide,
    roughness: 0.92, metalness: 0, envMapIntensity: 0.45, vertexColors: true,
  });
}
