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

// Dice factory: builds three.js meshes, per-face number textures, and
// cannon-es convex hulls for each die type. All dice share cached
// geometry/materials/shapes per (type, variant).
//
// Variants (goal 11): 'std' is the normal numbered die; 'shroud' is the
// numberless obsidian die a redacted (held/whispered) roll tumbles as — dark
// reflective faces with NO symbols, so there is nothing to read on any
// client. A SET id ('house.set', js/themes.js — Tier 6 §9) is also a variant: same
// geometry and values, the theme's body/number colors baked into the face
// textures and its finish (rough/metal) + internal glow (emissive) on the
// materials. Physics bodies always come from the 'std' build: the hull is
// identical and sharing one shape keeps every client's fast-forward
// byte-deterministic regardless of which skin it renders — a theme can
// never change how a die lands.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SETS } from './themes.js';

export const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];

export const DIE_DEFS = {
  d4:   { color: '#b23a48', text: '#f7edda', radius: 1.15, mass: 0.8 },
  d6:   { color: '#2e6f9e', text: '#f7edda', size: 1.35, mass: 1.0 },
  d8:   { color: '#3f8f6b', text: '#f7edda', radius: 1.05, mass: 0.9 },
  d10:  { color: '#b07d2b', text: '#f7edda', radius: 1.05, mass: 1.0 },
  d10x: { color: '#7a5b8f', text: '#f7edda', radius: 1.05, mass: 1.0 },
  d12:  { color: '#8f3f6b', text: '#f7edda', radius: 1.1, mass: 1.2 },
  d20:  { color: '#c19a2e', text: '#2b1d02', radius: 1.25, mass: 1.4 },
};

const TEX_SIZE = 256;
const EPS = 1e-4;

// The shroud skin: near-black obsidian. One color for every type — a shrouded
// pool deliberately reads as "hidden dice", not as its member types' colors
// gone dark (the TYPES are public; the faces are not).
const SHROUD_COLOR = '#14141b';

// ---------------------------------------------------------------------------
// Base geometry per type
// ---------------------------------------------------------------------------

function buildBaseGeometry(type) {
  const def = DIE_DEFS[type];
  switch (type) {
    case 'd4': return new THREE.TetrahedronGeometry(def.radius);
    case 'd6': return new THREE.BoxGeometry(def.size, def.size, def.size).toNonIndexed();
    case 'd8': return new THREE.OctahedronGeometry(def.radius);
    case 'd10':
    case 'd10x': return buildD10Geometry(def.radius);
    case 'd12': return new THREE.DodecahedronGeometry(def.radius);
    case 'd20': return new THREE.IcosahedronGeometry(def.radius);
  }
}

// Pentagonal trapezohedron. With ring radius 1 and poles at z = ±1, the ring
// z-offset h below makes each kite face exactly planar.
function buildD10Geometry(radius) {
  const h = 1 / (2 / (1 - Math.cos(Math.PI / 5)) - 1);
  const ring = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    ring.push(new THREE.Vector3(Math.cos(a), Math.sin(a), h * (i % 2 === 0 ? 1 : -1)));
  }
  const top = new THREE.Vector3(0, 0, 1);
  const bottom = new THREE.Vector3(0, 0, -1);

  // Kite faces as quads [pole, ring, tip, ring]
  const quads = [];
  for (let k = 0; k < 5; k++) {
    quads.push([top, ring[(2 * k) % 10], ring[(2 * k + 1) % 10], ring[(2 * k + 2) % 10]]);
    quads.push([bottom, ring[(2 * k + 3) % 10], ring[(2 * k + 2) % 10], ring[(2 * k + 1) % 10]]);
  }

  const positions = [];
  for (const [a, b, c, d] of quads) {
    // ensure outward winding: normal of (a,b,c) should point away from origin
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const centroid = new THREE.Vector3().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
    const tris = n.dot(centroid) > 0 ? [[a, b, c], [a, c, d]] : [[a, c, b], [a, d, c]];
    for (const tri of tris) for (const p of tri) positions.push(p.x * radius, p.y * radius, p.z * radius);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

// ---------------------------------------------------------------------------
// Logical face extraction (cluster coplanar triangles by normal)
// ---------------------------------------------------------------------------

function triVertex(pos, i) {
  return new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
}

function extractFaces(geometry, type) {
  const pos = geometry.getAttribute('position');
  const triCount = pos.count / 3;
  const groups = [];
  for (let t = 0; t < triCount; t++) {
    const a = triVertex(pos, t * 3), b = triVertex(pos, t * 3 + 1), c = triVertex(pos, t * 3 + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    let g = groups.find((g) => g.normal.dot(n) > 0.999);
    if (!g) {
      g = { normal: n.clone(), tris: [], verts: [] };
      groups.push(g);
    }
    g.tris.push(t);
    for (const p of [a, b, c]) {
      if (!g.verts.some((q) => q.distanceTo(p) < EPS)) g.verts.push(p.clone());
    }
  }

  for (const g of groups) {
    const centroid = g.verts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / g.verts.length);
    // provisional basis for angular sort (CCW seen from outside)
    let u = new THREE.Vector3().subVectors(g.verts[0], centroid).normalize();
    let v = new THREE.Vector3().crossVectors(g.normal, u);
    g.boundary = [...g.verts].sort((p, q) => {
      const ap = Math.atan2(new THREE.Vector3().subVectors(p, centroid).dot(v), new THREE.Vector3().subVectors(p, centroid).dot(u));
      const aq = Math.atan2(new THREE.Vector3().subVectors(q, centroid).dot(v), new THREE.Vector3().subVectors(q, centroid).dot(u));
      return ap - aq;
    });
    // final basis: u along first boundary edge so numbers align with an edge
    u = new THREE.Vector3().subVectors(g.boundary[1], g.boundary[0]).normalize();
    v = new THREE.Vector3().crossVectors(g.normal, u);
    g.u = u;
    g.v = v;
    g.centroid = centroid;
    g.boundary2d = g.boundary.map((p) => {
      const d = new THREE.Vector3().subVectors(p, centroid);
      return new THREE.Vector2(d.dot(u), d.dot(v));
    });
    // 2d -> uv transform: fit bounding square with margin
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of g.boundary2d) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const size = Math.max(maxX - minX, maxY - minY) * 1.3;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    g.toUV = (p) => new THREE.Vector2(0.5 + (p.x - cx) / size, 0.5 + (p.y - cy) / size);
    g.pxScale = TEX_SIZE / size;
  }
  return groups;
}

function project2d(face, p3) {
  const d = new THREE.Vector3().subVectors(p3, face.centroid);
  return new THREE.Vector2(d.dot(face.u), d.dot(face.v));
}

// distance from polygon centroid (2d) to nearest edge — used to size the label
function inradius2d(face) {
  const c = face.boundary2d.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(1 / face.boundary2d.length);
  let best = Infinity;
  const b = face.boundary2d;
  for (let i = 0; i < b.length; i++) {
    const p = b[i], q = b[(i + 1) % b.length];
    const e = new THREE.Vector2().subVectors(q, p);
    const t = Math.max(0, Math.min(1, new THREE.Vector2().subVectors(c, p).dot(e) / e.lengthSq()));
    const closest = new THREE.Vector2(p.x + e.x * t, p.y + e.y * t);
    best = Math.min(best, c.distanceTo(closest));
  }
  return { center: c, r: best };
}

// (UV assignment for the flat base mesh retired with the chamfer:
// buildBeveledGeometry maps each face's uv itself.)

// ---------------------------------------------------------------------------
// Face textures
// ---------------------------------------------------------------------------

function canvasPoint(face, p2) {
  const uv = face.toUV(p2);
  return [uv.x * TEX_SIZE, (1 - uv.y) * TEX_SIZE];
}

function drawLabel(ctx, face, text, pos2, upDir2, fontPx, color, underline) {
  const [px, py] = canvasPoint(face, pos2);
  const upCanvas = new THREE.Vector2(upDir2.x, -upDir2.y).normalize();
  const angle = Math.atan2(upCanvas.x, -upCanvas.y);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(fontPx)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  if (underline) {
    const w = ctx.measureText(text).width;
    ctx.fillRect(-w / 2, fontPx * 0.46, w, Math.max(2, fontPx * 0.07));
  }
  ctx.restore();
}

function makeFaceTexture(def, face, spec) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');

  // base: subtle radial shading of the die color
  const base = new THREE.Color(def.color);
  const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.18);
  const dark = base.clone().lerp(new THREE.Color('#000000'), 0.25);
  const grad = ctx.createRadialGradient(TEX_SIZE / 2, TEX_SIZE / 2, TEX_SIZE * 0.1, TEX_SIZE / 2, TEX_SIZE / 2, TEX_SIZE * 0.7);
  grad.addColorStop(0, `#${light.getHexString()}`);
  grad.addColorStop(1, `#${base.getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // crisp darker outline along the face edges
  ctx.beginPath();
  face.boundary2d.forEach((p, i) => {
    const [px, py] = canvasPoint(face, p);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.strokeStyle = `#${dark.getHexString()}`;
  ctx.lineWidth = 10;
  ctx.stroke();

  if (spec.blank) {
    // Shroud faces carry no symbols at all — a faint specular sheen spot is
    // the only relief, so the die reads as polished stone, not a hole.
    const sheen = ctx.createRadialGradient(
      TEX_SIZE * 0.38, TEX_SIZE * 0.36, 0, TEX_SIZE * 0.38, TEX_SIZE * 0.36, TEX_SIZE * 0.5
    );
    sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    const tex0 = new THREE.CanvasTexture(canvas);
    tex0.colorSpace = THREE.SRGBColorSpace;
    tex0.anisotropy = 4;
    return tex0;
  }

  paintDigits(ctx, face, spec, def.text);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// The digit pass, extracted so every baked CHANNEL can reuse it in its own
// color: the color map paints def.text, an emissiveMap paints white (the
// material's emissive color tints it), a height sketch paints grey at the
// engrave depth. Layout identical in all channels by construction.
function paintDigits(ctx, face, spec, color) {
  const { center, r } = inradius2d(face);
  const rPx = r * face.pxScale;
  if (spec.corners) {
    // d4: one number per corner, top of each number pointing at its corner
    for (const { text, corner2 } of spec.corners) {
      const dir = new THREE.Vector2().subVectors(corner2, center);
      const pos = new THREE.Vector2().addVectors(center, dir.clone().multiplyScalar(0.52));
      drawLabel(ctx, face, text, pos, dir, rPx * 0.7, color, false);
    }
  } else {
    const fontPx = rPx * (spec.text.length > 1 ? 1.05 : 1.4);
    drawLabel(ctx, face, spec.text, center, spec.upDir, fontPx, color, spec.underline);
  }
}

// ---------------------------------------------------------------------------
// Level 1 map baking (docs/THEMES.md, the sophistication ladder): height
// sketches, per-channel canvases, and the Sobel that turns painted relief
// into a tangent-space normal map. All deterministic — the PRNG seeds from
// (type, face), so every client and every screenshot bakes identical dice.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Height-sketch painters: grey = flat, white = raised, black = recessed.
// Each covers the whole canvas; the face UVs sample only their region.
const PATTERNS = {
  // struck iron: soft dents with a faintly raised rim
  hammer(ctx, rnd) {
    for (let i = 0; i < 26; i++) {
      const x = rnd() * TEX_SIZE;
      const y = rnd() * TEX_SIZE;
      const r = TEX_SIZE * (0.05 + rnd() * 0.1);
      const d = 0.4 + rnd() * 0.35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${d})`);
      g.addColorStop(0.75, `rgba(255,255,255,${d * 0.5})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.fill();
    }
  },
  // living wood: wavering grain lines, ridge and furrow alternating
  grain(ctx, rnd) {
    for (let i = 0; i < 42; i++) {
      const x0 = rnd() * TEX_SIZE;
      const amp = 4 + rnd() * 10;
      const dark = rnd() < 0.5;
      ctx.strokeStyle = dark
        ? `rgba(0,0,0,${0.18 + rnd() * 0.16})`
        : `rgba(255,255,255,${0.06 + rnd() * 0.07})`;
      ctx.lineWidth = 1 + rnd() * 2.5;
      ctx.beginPath();
      for (let y = 0; y <= TEX_SIZE; y += 8) {
        const x = x0 + Math.sin(y / 37 + i) * amp;
        y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },
  // frost ferns: branching raised crystals creeping in from the edges
  ferns(ctx, rnd) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    const branch = (x, y, ang, len, depth) => {
      if (depth <= 0 || len < 3) return;
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      ctx.lineWidth = Math.max(1.1, depth * 1.0);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        branch(x + (x2 - x) * t, y + (y2 - y) * t,
          ang + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.5),
          len * (0.45 + rnd() * 0.2), depth - 1);
      }
    };
    // Creep inward from the FACE'S rim, not the canvas's: the face polygon
    // sits in the center ~60% of the canvas (extractFaces' 1.3 fit margin),
    // so canvas-edge origins landed outside the die and only branch tips
    // reached it (lab rev: bare faces with edge nibs).
    for (let i = 0; i < 13; i++) {
      const ang0 = rnd() * Math.PI * 2;
      const r0 = TEX_SIZE * (0.3 + rnd() * 0.16);
      const x = TEX_SIZE / 2 + Math.cos(ang0) * r0;
      const y = TEX_SIZE / 2 + Math.sin(ang0) * r0;
      branch(x, y, ang0 + Math.PI + (rnd() - 0.5) * 0.8, TEX_SIZE * (0.2 + rnd() * 0.14), 5);
    }
  },
  // museum ivory: fine hairline scratches in both tones
  scrimshaw(ctx, rnd) {
    for (let i = 0; i < 70; i++) {
      const x = rnd() * TEX_SIZE;
      const y = rnd() * TEX_SIZE;
      const len = 6 + rnd() * 30;
      const ang = rnd() * Math.PI;
      ctx.strokeStyle = rnd() < 0.6
        ? `rgba(0,0,0,${0.2 + rnd() * 0.18})`
        : `rgba(255,255,255,${0.12 + rnd() * 0.1})`;
      ctx.lineWidth = rnd() < 0.2 ? 1.8 : 0.8; // a few deep gouges among hairlines
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
  },
};

// Sobel a height sketch into a tangent-space normal map. LINEAR data — no
// sRGB tag (that would bend the vectors).
function heightToNormal(heightCanvas, strength) {
  const s = heightCanvas.width;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const octx = out.getContext('2d');
  const img = octx.createImageData(s, s);
  const h = (x, y) => src[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength * 2;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength * 2;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * s + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.anisotropy = 4;
  return tex;
}

// Bake every channel a skin asks for (def.maps — themes.js Level 1):
// always the color map; optionally an emissiveMap of the digits alone, a
// normal map from the relief sketch, a roughness map from a pattern.
function makeFaceBundle(def, face, spec, seed) {
  const bundle = { map: makeFaceTexture(def, face, spec) };
  const maps = !spec.blank && def.maps ? def.maps : null;
  if (!maps) return bundle;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = TEX_SIZE;
    return [c, c.getContext('2d')];
  };
  if (maps.digitGlow) {
    const [c, ctx] = mk();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    paintDigits(ctx, face, spec, '#ffffff'); // material.emissive supplies the color
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    bundle.emissiveMap = t;
  }
  if (maps.relief) {
    const [c, ctx] = mk();
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    (PATTERNS[maps.relief.pattern] || (() => {}))(ctx, mulberry32(seed));
    // The pattern also TINTS the color map (overlay: grey is neutral,
    // ridges lighten, furrows darken) — relief reads face-on, not only
    // when the light rakes (Joe: too subtle). Before the digit engrave,
    // so the numbers stay crisp ink in the color layer.
    const cc = bundle.map.image.getContext('2d');
    cc.save();
    cc.globalCompositeOperation = 'overlay';
    cc.globalAlpha = maps.relief.tint ?? 0.4;
    cc.drawImage(c, 0, 0);
    cc.restore();
    bundle.map.needsUpdate = true;
    if (maps.relief.digitDepth) {
      const g = Math.round(128 - 128 * maps.relief.digitDepth);
      paintDigits(ctx, face, spec, `rgb(${g},${g},${g})`); // engraved digits
    }
    bundle.normalMap = heightToNormal(c, 1.0);
  }
  if (maps.roughPattern && PATTERNS[maps.roughPattern]) {
    const [c, ctx] = mk();
    const base = Math.round((def.feel ? def.feel.rough : 0.3) * 255);
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    PATTERNS[maps.roughPattern](ctx, mulberry32(seed ^ 0x9e3779b9)); // white strokes = rough
    const t = new THREE.CanvasTexture(c); // linear data
    t.anisotropy = 4;
    bundle.roughnessMap = t;
  }
  return bundle;
}

// ---------------------------------------------------------------------------
// Beveled render geometry (visual only)
// ---------------------------------------------------------------------------
//
// A very slight chamfer softens the die edges on screen. RENDER ONLY: the
// physics hull (buildShape) and value reading (readValue) still use the
// exact base polyhedron, so every client's simulate-ahead fast-forward
// stays byte-deterministic — the chamfer can never change how a die lands.
// Each face polygon insets toward its centroid; flat edge bands and corner
// fans stitch the gaps under one unmapped edge material (index
// faces.length) whose darker tone reads as the painted face outline moving
// onto real geometry. Resting height is untouched: the bottom face's inset
// ring stays in the bottom face's plane (canonicalDiePose reads this mesh).
const BEVEL = 0.055; // inset share of each corner's distance to its face centroid

function buildBeveledGeometry(faces) {
  const positions = [];
  const uvs = [];
  const triMats = [];
  // Outward winding by construction check: these solids are convex around
  // the origin, so a triangle's normal must point away from it.
  const pushTri = (a, b, c, mat, uvA, uvB, uvC) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const ctr = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    let B = b, C = c, UB = uvB, UC = uvC;
    if (n.dot(ctr) < 0) { B = c; C = b; UB = uvC; UC = uvB; }
    positions.push(a.x, a.y, a.z, B.x, B.y, B.z, C.x, C.y, C.z);
    for (const uv of [uvA, UB, UC]) uvs.push(uv ? uv.x : 0.5, uv ? uv.y : 0.5);
    triMats.push(mat);
  };

  // One inset ring per face, index-aligned with face.boundary.
  const rings = faces.map((f) => f.boundary.map(
    (p) => f.centroid.clone().add(p.clone().sub(f.centroid).multiplyScalar(1 - BEVEL)),
  ));

  // Face surfaces: fan over the inset polygon, keeping the face's material
  // and its uv mapping (the inset points are in-plane, so project2d holds).
  faces.forEach((f, fi) => {
    const ring = rings[fi];
    const uvOf = (q) => f.toUV(project2d(f, q));
    for (let i = 1; i < ring.length - 1; i++) {
      pushTri(ring[0], ring[i], ring[i + 1], fi, uvOf(ring[0]), uvOf(ring[i]), uvOf(ring[i + 1]));
    }
  });

  // Edge bands + corner fans. Vertices are EPS-deduped into indices so the
  // two faces meeting at an edge (and the 3+ meeting at a corner) find each
  // other exactly, whatever float noise the generators left.
  const verts = [];
  const indexOf = (p) => {
    let i = verts.findIndex((q) => q.distanceTo(p) < EPS);
    if (i === -1) { verts.push(p); i = verts.length - 1; }
    return i;
  };
  const edgeMat = faces.length;
  const edges = new Map();   // 'lo:hi' vertex-index pair -> inset edge per face
  const corners = new Map(); // vertex index -> that corner's inset copies
  faces.forEach((f, fi) => {
    const ring = rings[fi];
    f.boundary.forEach((p, i) => {
      const a = indexOf(p);
      const b = indexOf(f.boundary[(i + 1) % f.boundary.length]);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push({ qa: ring[i], qb: ring[(i + 1) % ring.length] });
      if (!corners.has(a)) corners.set(a, []);
      corners.get(a).push(ring[i]);
    });
  });
  for (const pair of edges.values()) {
    if (pair.length !== 2) continue; // watertight solids always pair up
    const [e1, e2] = pair;
    pushTri(e1.qa, e1.qb, e2.qb, edgeMat);
    pushTri(e1.qa, e2.qb, e2.qa, edgeMat);
  }
  for (const [vi, copies] of corners) {
    if (copies.length < 3) continue;
    // Fan the corner's inset copies in angular order around the vertex ray
    // (the tangents are ⊥ to it, so the raw dots are already offsets).
    const dir = verts[vi].clone().normalize();
    const seed = Math.abs(dir.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(dir, seed).normalize();
    const t2 = new THREE.Vector3().crossVectors(dir, t1);
    const sorted = [...copies].sort((p, q) =>
      Math.atan2(p.dot(t2), p.dot(t1)) - Math.atan2(q.dot(t2), q.dot(t1)));
    for (let i = 1; i < sorted.length - 1; i++) {
      pushTri(sorted[0], sorted[i], sorted[i + 1], edgeMat);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // consecutive same-material triangles collapse into one draw group
  let start = 0;
  for (let t = 1; t <= triMats.length; t++) {
    if (t === triMats.length || triMats[t] !== triMats[start]) {
      geom.addGroup(start * 3, (t - start) * 3, triMats[start]);
      start = t;
    }
  }
  geom.computeVertexNormals(); // non-indexed → flat facets, incl. the chamfer
  return geom;
}

// ---------------------------------------------------------------------------
// Physics hull
// ---------------------------------------------------------------------------

function buildShape(faces) {
  const verts = [];
  const indexOf = (p) => {
    let i = verts.findIndex((q) => q.distanceTo(p) < EPS);
    if (i === -1) { verts.push(p); i = verts.length - 1; }
    return i;
  };
  const faceIdx = faces.map((f) => f.boundary.map(indexOf));
  return new CANNON.ConvexPolyhedron({
    vertices: verts.map((p) => new CANNON.Vec3(p.x, p.y, p.z)),
    faces: faceIdx,
  });
}

// ---------------------------------------------------------------------------
// Value assignment + build
// ---------------------------------------------------------------------------

function faceSpecs(type, faces) {
  if (type === 'd6') {
    // BoxGeometry face order is +x,-x,+y,-y,+z,-z; make opposite faces sum to 7
    const vals = [1, 6, 2, 5, 3, 4];
    return faces.map((f, i) => ({ value: vals[i], text: String(vals[i]), underline: vals[i] === 6, upDir: new THREE.Vector2(0, 1) }));
  }
  if (type === 'd10' || type === 'd10x') {
    return faces.map((f, i) => {
      const value = type === 'd10' ? i + 1 : i * 10;
      const text = type === 'd10' ? String(value) : String(value).padStart(2, '0');
      const underline = type === 'd10' && (value === 6 || value === 9);
      // orient the number's top toward the die's pole corner
      const poleVert = f.boundary.reduce((a, b) => (Math.abs(b.z) > Math.abs(a.z) ? b : a));
      const { center } = inradius2d(f);
      const upDir = new THREE.Vector2().subVectors(project2d(f, poleVert), center);
      return { value, text, underline, upDir };
    });
  }
  // triangle faces (d8, d20): point the number's top at the vertex opposite edge 0-1
  // pentagon (d12): edge-aligned is fine
  return faces.map((f, i) => {
    const value = i + 1;
    let upDir = new THREE.Vector2(0, 1);
    if (f.boundary.length === 3 && f.boundary2d[2].y < f.boundary2d[0].y) upDir = new THREE.Vector2(0, -1);
    return { value, text: String(value), underline: value === 6 || value === 9, upDir };
  });
}

// Deterministic per-(type, face) seed for the pattern painters: every
// client — and every screenshot — bakes identical grain, dents and ferns.
function faceSeed(type, faceIndex) {
  let a = 7;
  for (const ch of type) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0;
  return (a ^ Math.imul(faceIndex + 1, 0x85ebca6b)) >>> 0;
}

function buildDie(type, variant = 'std') {
  const def = DIE_DEFS[type];
  const shroud = variant === 'shroud';
  const theme = !shroud && variant !== 'std' ? SETS[variant] || null : null;
  // Shroud skin: same geometry, obsidian faces, no symbols. A theme skin:
  // same geometry, the theme's colors + finish + glow (docs/THEMES.md).
  const skin = shroud ? { ...def, color: SHROUD_COLOR }
    : theme ? { ...def, color: theme.body, text: theme.text, feel: theme.feel, glow: theme.glow, maps: theme.maps }
    : def;
  // The BASE polyhedron drives faces, values and the physics hull; the mesh
  // the player sees is its beveled twin (render only — see buildBeveledGeometry).
  const base = buildBaseGeometry(type);
  const faces = extractFaces(base, type);
  const geometry = buildBeveledGeometry(faces);

  let materials;
  let vertexValues = null;

  if (type === 'd4') {
    // values live on the 4 vertices; each face shows its three corner values,
    // read by the vertex pointing up when the die rests
    const uniq = [];
    for (const f of faces) for (const p of f.boundary) {
      if (!uniq.some((q) => q.distanceTo(p) < EPS)) uniq.push(p);
    }
    vertexValues = uniq.map((p, i) => ({ dir: p.clone().normalize(), value: i + 1 }));
    materials = faces.map((f, fi) => {
      if (shroud) return materialFor(skin, f, { blank: true }, true);
      const corners = f.boundary.map((p) => ({
        text: String(vertexValues.find((v) => v.dir.clone().multiplyScalar(p.length()).distanceTo(p) < EPS * 10).value),
        corner2: project2d(f, p),
      }));
      return materialFor(skin, f, { corners }, false, faceSeed(type, fi));
    });
    faces.forEach((f) => { f.value = null; });
  } else {
    const specs = faceSpecs(type, faces);
    materials = faces.map((f, i) =>
      shroud ? materialFor(skin, f, { blank: true }, true)
        : materialFor(skin, f, specs[i], false, faceSeed(type, i))
    );
    faces.forEach((f, i) => { f.value = specs[i].value; });
  }

  // The chamfer band's own material: the same darker tone the face textures
  // paint along their edges, so the bevel reads as that outline made real.
  const edgeColor = new THREE.Color(skin.color).lerp(new THREE.Color('#000000'), 0.25);
  materials.push(new THREE.MeshStandardMaterial({
    color: edgeColor,
    roughness: shroud ? 0.16 : (skin.feel ? skin.feel.rough : 0.3),
    metalness: shroud ? 0.5 : (skin.feel ? skin.feel.metal : 0.1),
  }));

  const shape = buildShape(faces);
  return { type, def, geometry, materials, shape, faces, vertexValues };
}

function materialFor(def, face, spec, shroud = false, seed = 1) {
  const bundle = shroud
    ? { map: makeFaceTexture(def, face, spec) }
    : makeFaceBundle(def, face, spec, seed);
  const m = new THREE.MeshStandardMaterial({
    map: bundle.map,
    // Obsidian: darker, glossier, more metallic — reflections instead of
    // pips. Themed skins bring their own finish (docs/THEMES.md). A
    // roughnessMap carries per-pixel values, so the scalar goes to 1
    // (three multiplies the two).
    roughness: bundle.roughnessMap ? 1.0 : shroud ? 0.16 : (def.feel ? def.feel.rough : 0.3),
    metalness: shroud ? 0.5 : (def.feel ? def.feel.metal : 0.1),
  });
  if (bundle.roughnessMap) m.roughnessMap = bundle.roughnessMap;
  if (bundle.normalMap) {
    m.normalMap = bundle.normalMap;
    const k = (def.maps && def.maps.relief && def.maps.relief.strength) || 0.5;
    m.normalScale.set(k * 2, k * 2); // recipe-dialed relief depth
  }
  if (!shroud && bundle.emissiveMap && def.maps && def.maps.digitGlow) {
    // Level 1: the DIGITS alone glow — the map masks, emissive colors it
    m.emissiveMap = bundle.emissiveMap;
    m.emissive = new THREE.Color(def.maps.digitGlow.color);
    m.emissiveIntensity = def.maps.digitGlow.intensity;
  } else if (!shroud && def.glow) {
    // the theme's INTERNAL light — subtle at rest, surged by effects
    m.emissive = new THREE.Color(def.glow.color);
    m.emissiveIntensity = def.glow.intensity;
  }
  return m;
}

// Cache re-keyed to (type, variant) — the shared `materials` array must never
// be mutated per-mesh, so each variant owns its own build (roadmap step 9's
// (type, setId) re-key follows the same seam).
const cache = new Map();
export function getDie(type, variant = 'std') {
  const key = `${type}|${variant}`;
  if (!cache.has(key)) cache.set(key, buildDie(type, variant));
  return cache.get(key);
}

export function createDieMesh(type, variant = 'std') {
  const die = getDie(type, variant);
  const mesh = new THREE.Mesh(die.geometry, die.materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createDieBody(type, physMaterial) {
  const die = getDie(type);
  const body = new CANNON.Body({ mass: die.def.mass, shape: die.shape, material: physMaterial });
  body.allowSleep = true;
  body.sleepSpeedLimit = 0.4;
  body.sleepTimeLimit = 0.35;
  return body;
}

// Read the settled value from a die's orientation. Returns {value, label, dot}
// where dot ~ 1 means cleanly flat and low values mean the die is cocked.
export function readValue(type, quaternion) {
  const die = getDie(type);
  const up = new THREE.Vector3(0, 1, 0);
  if (type === 'd4') {
    let best = null;
    for (const { dir, value } of die.vertexValues) {
      const d = dir.clone().applyQuaternion(quaternion).dot(up);
      if (!best || d > best.dot) best = { value, dot: d, label: String(value) };
    }
    // a rested tetrahedron has its top vertex straight up (dot = 1)
    return best;
  }
  let best = null;
  for (const f of die.faces) {
    const d = f.normal.clone().applyQuaternion(quaternion).dot(up);
    if (!best || d > best.dot) {
      const label = type === 'd10x' ? String(f.value).padStart(2, '0') : String(f.value);
      best = { value: f.value, dot: d, label };
    }
  }
  return best;
}

// Body-frame unit direction that points "up" when the die shows `value`:
// the face normal for most dice, the vertex direction for d4.
// Returns a THREE.Vector3 (unit length) or null for an unknown value.
export function faceNormalForValue(type, value) {
  const die = getDie(type);
  if (type === 'd4') {
    const v = die.vertexValues.find((x) => x.value === value);
    return v ? v.dir.clone() : null;
  }
  const f = die.faces.find((x) => x.value === value);
  return f ? f.normal.clone() : null;
}

// Max/min possible value per type (for crit highlighting)
export function valueRange(type) {
  switch (type) {
    case 'd4': return [1, 4];
    case 'd6': return [1, 6];
    case 'd8': return [1, 8];
    case 'd10': return [1, 10];
    case 'd10x': return [0, 90];
    case 'd12': return [1, 12];
    case 'd20': return [1, 20];
  }
}
