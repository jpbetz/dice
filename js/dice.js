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
  // geo.ink dials the painted outline (and, in buildDie, the matching band
  // material) — the two are ONE visual system, "the outline made real".
  // geo.tint is the color the body lerps TOWARD — default pure black
  // (the classical inked outline); a per-set override lets a theme claim
  // its own edge palette (sepia on aged ivory, patina on brass, deep
  // abyssal blue on ice, ivory highlight on onyx, etc.). tint LIGHTER
  // than the body reads as a highlight; DARKER as an ink.
  const ink = def.geo && def.geo.ink != null ? def.geo.ink : 0.25;
  const tint = def.geo && def.geo.tint || '#000000';
  const dark = base.clone().lerp(new THREE.Color(tint), ink);
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
// engrave depth. Layout identical in all channels by construction. A set
// may set spec.glyph='pip' (via def.glyph — see classics.ivorypips) —
// d6 draws canonical Vegas pips instead of digits; other die types fall
// back to digits since pips are the traditional d6 idiom only.
function paintDigits(ctx, face, spec, color) {
  if (spec.glyph === 'pip' && spec.value >= 1 && spec.value <= 6 && !spec.corners) {
    paintPips(ctx, face, spec, color);
    return;
  }
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

// Vegas-standard d6 pip layouts, in units of inscribed-radius:
//   1  center
//   2  top-left + bottom-right diagonal
//   3  top-left + center + bottom-right
//   4  four corners
//   5  four corners + center
//   6  two columns of three
// Same drawLabel projection so the pips ride the face UV correctly, and
// same `color` argument so every baked channel (color map, emissiveMap,
// relief height) draws pips in its own tone — layout identical by
// construction (the digit-glow / relief coupling already assumes this).
const PIP_OFFSETS = [
  null, // no 0
  [[0, 0]],
  [[-0.44, -0.44], [0.44, 0.44]],
  [[-0.44, -0.44], [0, 0], [0.44, 0.44]],
  [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]],
  [[-0.44, -0.44], [0.44, -0.44], [0, 0], [-0.44, 0.44], [0.44, 0.44]],
  [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0], [0.44, 0], [-0.44, 0.44], [0.44, 0.44]],
];
function paintPips(ctx, face, spec, color) {
  const { center, r } = inradius2d(face);
  const rPx = r * face.pxScale;
  const pipR = rPx * 0.13; // Vegas-precision pip: ~13% of inscribed radius
  const layout = PIP_OFFSETS[spec.value];
  if (!layout) return;
  for (const [ox, oy] of layout) {
    const pos = new THREE.Vector2(center.x + ox * r, center.y + oy * r);
    const [px, py] = canvasPoint(face, pos);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, pipR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

// The painter names, for the lab's set builder selects (dev chrome only —
// nothing in the app enumerates painters at runtime).
export const PATTERN_IDS = Object.keys(PATTERNS);

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

// ---------------------------------------------------------------------------
// Level 2 — shader injection (docs/THEMES.md ladder): onBeforeCompile
// patches over the standard material. No postprocessing stack — fresnel
// rims, time-driven emissive (flow/pulse) and the dissolve live INSIDE
// the material's own program. The clock is shared: whoever renders
// advances SHADER_TIME (the lab's tick does; the main table will when
// sets graduate).
// ---------------------------------------------------------------------------

export const SHADER_TIME = { value: 0 };

function patchShader(m, cfg) {
  m.userData.uDissolve = { value: 0 }; // the unmaking's dial (0 = whole)
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = SHADER_TIME;
    sh.uniforms.uDissolve = m.userData.uDissolve;
    const decl = '\nuniform float uTime;\nuniform float uDissolve;\n'
      + 'float fxHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 ); }\n'
      + 'float fxNoise( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );\n'
      + '\treturn mix( mix( fxHash( i ), fxHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( fxHash( i + vec2( 0.0, 1.0 ) ), fxHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }\n';
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + decl);
    let fx = '';
    if (cfg.flow) {
      // molten seams / static crawl: two octaves of scrolling noise, high
      // spatial frequency (bands must TRAVEL THROUGH a digit's strokes —
      // at low scale the whole digit breathed as one and read as a
      // twinkle, Joe's catch). With cool/hot set, the modulation is a
      // COLOR RAMP (dark ember → white-hot), not just brightness.
      const f = cfg.flow;
      const sp = (f.speed ?? 0.3);
      fx += `\n\t{ float fxF = fxNoise( vMapUv * ${(f.scale ?? 10).toFixed(1)} + vec2( uTime * ${sp.toFixed(2)}, uTime * ${(sp * 0.7).toFixed(2)} ) );`
        + `\n\tfxF = 0.65 * fxF + 0.35 * fxNoise( vMapUv * ${((f.scale ?? 10) * 2.3).toFixed(1)} - vec2( uTime * ${(sp * 1.6).toFixed(2)}, 0.0 ) );`;
      if (f.cool && f.hot) {
        fx += `\n\ttotalEmissiveRadiance *= mix( vec3( ${hexToRgb(f.cool)} ), vec3( ${hexToRgb(f.hot)} ), fxF ) * ${(f.gain ?? 2.0).toFixed(2)}; }`;
      } else {
        fx += `\n\ttotalEmissiveRadiance *= ${(f.floor ?? 0.3).toFixed(2)} + ${(f.amp ?? 1.8).toFixed(2)} * fxF; }`;
      }
    }
    if (cfg.pulse) {
      // containment hum: the whole emissive breathes on a slow sine
      const pz = cfg.pulse;
      fx += `\n\ttotalEmissiveRadiance *= ${pz.min.toFixed(2)} + ${(pz.max - pz.min).toFixed(2)} * ( 0.5 + 0.5 * sin( uTime * ${pz.speed.toFixed(2)} ) );`;
    }
    if (cfg.fresnel) {
      // the rim: internal light concentrated at grazing angles
      const c = hexToRgb(cfg.fresnel.color);
      fx += `\n\t{ float fxFr = pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), ${(cfg.fresnel.power ?? 2.5).toFixed(1)} );`
        + `\n\ttotalEmissiveRadiance += vec3( ${c} ) * fxFr * ${(cfg.fresnel.intensity ?? 0.8).toFixed(2)}; }`;
    }
    if (fx) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + fx);
    if (cfg.dissolve) {
      // the unmaking: noise-threshold discard with a burning edge
      const e = hexToRgb(cfg.dissolve.edge || '#ffffff');
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
        `{ float fxN = fxNoise( vMapUv * 9.0 );\n`
        + `\tif ( fxN < uDissolve ) discard;\n`
        + `\telse if ( uDissolve > 0.0 && fxN < uDissolve + 0.10 ) outgoingLight += vec3( ${e} ) * ( 1.0 - ( fxN - uDissolve ) / 0.10 ) * 2.5; }\n`
        + `\t#include <opaque_fragment>`);
    }
  };
  // the cfg is baked into the program text — key the program cache by it
  m.customProgramCacheKey = () => 'fx:' + JSON.stringify(cfg);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    .map((v) => v.toFixed(3)).join(', ');
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
// ring stays in the bottom face's plane, so the mesh's lowest point is the
// base solid's bottom face whatever the recipe (asserted: minY is identical
// across every bench row).
const BEVEL = 0.055; // inset share of each corner's distance to its face centroid

// THE STANDARD EDGE — what a die wears when its recipe says nothing about
// its edge (ROADMAP §9c). It is a UNIT, not two independent defaults: a
// recipe that names `bevel` or `profile` is stating its own edge and keeps
// the per-field fallbacks below (BEVEL, 'cut'), which is why `bevel: 0.02`
// still means a lapidary CUT and not a 0.02 fillet. Wearers: the `std`
// variant, the shroud, and the whole CLASSICS house — the sets that are the
// standard die in another colour. Everything else names its own.
const STD_EDGE = Object.freeze({ bevel: 0.055, profile: 'cut' });
function withStandardEdge(geo) {
  if (geo && (geo.bevel != null || geo.profile != null)) return geo;
  return geo ? { ...geo, ...STD_EDGE } : STD_EDGE;
}
// Level 3.5 (docs/THEMES.md): GEOMETRY IDENTITY. A set may reshape the
// die the player SEES — edge width and profile, tumbled wear, chips,
// pillowed faces — while the physics hull, face values and read logic
// stay canonical (createDieBody/readValue always use the std entry, so a
// skin can never change how a die lands or reads). Recipe (themes.js
// `geo`): { bevel 0..~0.14, profile 'cut'|'round', segments 1..6 (round
// only; default 3 — the fillet's arc strips), ink 0..1 (darkness of the
// painted face outline AND the band material; default .25 cut / .12
// round band), wear 0..1, nicks 0..5, pillow 0..1 }.

function buildBeveledGeometry(faces, geo) {
  const BEVEL_W = geo && geo.bevel != null ? geo.bevel : BEVEL;
  const round = !!(geo && geo.profile === 'round');
  // ROADMAP §9c Tier 2: a round edge is SEGS real arc strips (a quadratic
  // Bézier bulged toward the original sharp edge), not one shaded chord;
  // cut chamfers stay a single flat strip.
  const SEGS = round ? Math.max(1, Math.min(6, Math.round((geo && geo.segments) ?? 3))) : 1;
  const positions = [];
  const uvs = [];
  const triMats = [];
  const anNormals = []; // analytic normals (round bands/domes); NaN = facet
  // Outward winding by construction check: these solids are convex around
  // the origin, so a triangle's normal must point away from it.
  const pushTri = (a, b, c, mat, uvA, uvB, uvC, nA, nB, nC) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const ctr = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    let B = b, C = c, UB = uvB, UC = uvC, NB = nB, NC = nC;
    if (n.dot(ctr) < 0) { B = c; C = b; UB = uvC; UC = uvB; NB = nC; NC = nB; }
    positions.push(a.x, a.y, a.z, B.x, B.y, B.z, C.x, C.y, C.z);
    for (const uv of [uvA, UB, UC]) uvs.push(uv ? uv.x : 0.5, uv ? uv.y : 0.5);
    for (const an of [nA, NB, NC]) anNormals.push(an ? an.x : NaN, an ? an.y : NaN, an ? an.z : NaN);
    triMats.push(mat);
  };

  // One inset ring per face, index-aligned with face.boundary.
  const rings = faces.map((f) => f.boundary.map(
    (p) => f.centroid.clone().add(p.clone().sub(f.centroid).multiplyScalar(1 - BEVEL_W)),
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
      edges.get(key).push({ va: a, vb: b, qa: ring[i], qb: ring[(i + 1) % ring.length], n: f.normal });
      if (!corners.has(a)) corners.set(a, []);
      corners.get(a).push(ring[i]);
    });
  });

  // Round profile machinery. The fillet's cross-section is a quadratic
  // Bézier from one face's rim to the other, control point = the ORIGINAL
  // sharp edge/corner: tangent to both faces by construction (q→ctrl lies
  // in q's face plane), never outside the base solid (the curve stays in
  // hull(q1, ctrl, q2)), and never below the resting plane (the bottom
  // edge's ctrl lies IN the bottom plane) — canonicalDiePose still holds.
  // Arc endpoints reuse the ring INSTANCES so face fans, bands and corner
  // domes stay watertight (the lab's unpaired-edge probe asserts it).
  const bez = (q1, ctrl, q2, t) => q1.clone().multiplyScalar((1 - t) * (1 - t))
    .addScaledVector(ctrl, 2 * t * (1 - t))
    .addScaledVector(q2, t * t);
  const arcOf = (q1, ctrl, q2) => {
    const pts = [q1];
    for (let k = 1; k < SEGS; k++) pts.push(bez(q1, ctrl, q2, k / SEGS));
    pts.push(q2);
    return pts;
  };

  const cornerArcs = new Map(); // corner idx -> [{pts, nrm}] for the domes
  for (const pair of edges.values()) {
    if (pair.length !== 2) continue; // watertight solids always pair up
    const [e1, e2] = pair;
    // Align the second segment to the first BY ENDPOINT before quadding:
    // consistently wound faces traverse a shared edge in OPPOSITE orders,
    // and the old order-blind quad built a bowtie there — one band
    // triangle doubled, the other half a triangular HOLE (the pure-black
    // wedge on every beveled edge; found by Joe 2026-08-04, confirmed by
    // the unpaired-directed-edge probe: 4 per die edge, every die).
    const flip = e2.va !== e1.va;
    const a2 = flip ? e2.qb : e2.qa;
    const b2 = flip ? e2.qa : e2.qb;
    if (!round) {
      pushTri(e1.qa, e1.qb, b2, edgeMat);
      pushTri(e1.qa, b2, a2, edgeMat);
      continue;
    }
    // per-t normals: face-exact at each rim (ZERO crease at the face↔band
    // junction), blending across the arc — Gouraud does the fillet
    const nrm = [];
    for (let k = 0; k <= SEGS; k++) nrm.push(e1.n.clone().lerp(e2.n, k / SEGS).normalize());
    const arcA = arcOf(e1.qa, verts[e1.va], a2); // cross-section at the va end
    const arcB = arcOf(e1.qb, verts[e1.vb], b2); // …and at the vb end
    for (let k = 0; k < SEGS; k++) {
      pushTri(arcA[k], arcB[k], arcB[k + 1], edgeMat, null, null, null, nrm[k], nrm[k], nrm[k + 1]);
      pushTri(arcA[k], arcB[k + 1], arcA[k + 1], edgeMat, null, null, null, nrm[k], nrm[k + 1], nrm[k + 1]);
    }
    if (!cornerArcs.has(e1.va)) cornerArcs.set(e1.va, []);
    cornerArcs.get(e1.va).push({ pts: arcA, nrm });
    if (!cornerArcs.has(e1.vb)) cornerArcs.set(e1.vb, []);
    cornerArcs.get(e1.vb).push({ pts: arcB, nrm });
  }
  if (!round) {
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
  } else {
    // Corner DOMES: fan every incident arc to one apex on the corner ray.
    // Consecutive arcs share ring-point instances, so the fans close the
    // loop with no angular sort; the apex rides at the arcs' own bulge
    // height (their mid-sample radius), giving a sphere-cap read.
    for (const [vi, arcs] of cornerArcs) {
      const apexN = verts[vi].clone().normalize();
      let apexLen = 0;
      for (const a of arcs) apexLen += a.pts[Math.floor(SEGS / 2)].length();
      apexLen /= arcs.length;
      const apex = apexN.clone().multiplyScalar(apexLen);
      for (const a of arcs) {
        for (let k = 0; k < SEGS; k++) {
          pushTri(apex, a.pts[k], a.pts[k + 1], edgeMat, null, null, null, apexN, a.nrm[k], a.nrm[k + 1]);
        }
      }
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
  geom.computeVertexNormals(); // non-indexed → flat facets (faces + cut chamfers)
  if (round) {
    // Overwrite facet normals with the analytic fillet normals wherever the
    // builder recorded one (bands + domes). Faces keep their flat facets.
    const nAttr = geom.getAttribute('normal');
    for (let i = 0; i < anNormals.length; i += 3) {
      if (Number.isNaN(anNormals[i])) continue;
      nAttr.setXYZ(i / 3, anNormals[i], anNormals[i + 1], anNormals[i + 2]);
    }
    nAttr.needsUpdate = true;
  }
  return geom;
}

// The geometry-identity post-pass (render mesh only). Wear and nicks are
// POSITION-KEYED: the soup shares exact Vector3 floats wherever triangles
// meet, so hashing the quantized position gives coincident vertices the
// identical offset and the mesh stays watertight. Deterministic per
// (type, variant) — every client and every screenshot shows the same die.
function geoHash(x, y, z, grid, seed) {
  let h = seed | 0;
  h = Math.imul(h ^ Math.round(x / grid), 0x85ebca6b);
  h = Math.imul(h ^ Math.round(y / grid), 0xc2b2ae35);
  h = Math.imul(h ^ Math.round(z / grid), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 4294967296;
}

function applyGeoCharacter(geom, faces, geo, seed) {
  const wear = geo.wear || 0;
  const nicks = geo.nicks || 0;
  const pillow = geo.pillow || 0;
  const round = geo.profile === 'round';
  if (!wear && !nicks && !pillow && !round) return;

  const pos = geom.getAttribute('position');
  const p = new THREE.Vector3();

  // radial span: which vertices are "exposed" (corners wear before faces)
  let minR = Infinity;
  let maxR = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = p.fromBufferAttribute(pos, i).length();
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }

  // seeded chip sites: real dice chip at corners and edges, so candidates
  // are the canonical boundary vertices (dedup not needed to pick)
  const sites = [];
  if (nicks > 0) {
    const corners = [];
    for (const f of faces) for (const b of f.boundary) corners.push(b);
    let a = seed >>> 0;
    const rng = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let k = 0; k < nicks; k++) {
      const c = corners[Math.floor(rng() * corners.length)];
      // wide + shallow: a chip is a scoop that catches light, not a crack
      sites.push({ c: c.clone(), r: maxR * (0.15 + rng() * 0.1), d: maxR * (0.022 + rng() * 0.02) });
    }
  }

  if (wear || sites.length) {
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const r = p.length();
      let pull = 0;
      if (wear) {
        // tumbled erosion: lumpy (coarse cell) + crinkled (fine cell),
        // biased hard toward exposed corners
        const exposure = (r - minR) / (maxR - minR || 1);
        const lump = geoHash(p.x, p.y, p.z, maxR * 0.3, seed);
        const grain = geoHash(p.x, p.y, p.z, maxR * 0.012, seed ^ 0x9e3779b9);
        pull += wear * maxR * 0.05 * (0.6 * lump + 0.4 * grain) * (0.3 + 0.7 * exposure * exposure);
      }
      for (const s of sites) {
        const d = p.distanceTo(s.c);
        if (d < s.r) {
          const t = 1 - d / s.r;
          pull += s.d * t * t * (3 - 2 * t); // smooth chip crater
        }
      }
      if (pull > 0) {
        const k = Math.max(r - pull, minR * 0.5) / r;
        pos.setXYZ(i, p.x * k, p.y * k, p.z * k);
      }
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }

  const nrm = geom.getAttribute('normal');
  const n = new THREE.Vector3();

  // 'round' + DISPLACED only: wear/chips forced a computeVertexNormals
  // that wiped the builder's analytic fillet normals — restore roundness
  // with sphere-direction normals BLENDED over the recomputed facets.
  // (A full replacement erased the wear/chip craters' honest shading and
  // dents went black; the blend keeps the fillet while dents stay lit as
  // the displaced surface actually faces. Pristine round sets skip this:
  // their analytic normals from build are exact.) Groups after the face
  // count are the band (buildBeveledGeometry's material layout).
  if (round && (wear || sites.length)) {
    for (const g of geom.groups) {
      if (g.materialIndex < faces.length) continue;
      for (let i = g.start; i < g.start + g.count; i++) {
        p.fromBufferAttribute(pos, i).normalize();
        n.fromBufferAttribute(nrm, i).lerp(p, 0.65).normalize();
        nrm.setXYZ(i, n.x, n.y, n.z);
      }
    }
    nrm.needsUpdate = true;
  }

  // pillowed faces: normals tilt outward toward each face's rim, so flat
  // geometry shades as a cushion (silhouette unchanged — legibility keeps
  // its dead-flat digit plane)
  if (pillow) {
    const rad = new THREE.Vector3();
    const radMaxOf = faces.map((f) => {
      let m = 0;
      for (const b of f.boundary) m = Math.max(m, b.distanceTo(f.centroid));
      return m;
    });
    const tilt = (i, f, radMax) => {
      p.fromBufferAttribute(pos, i);
      rad.subVectors(p, f.centroid);
      rad.addScaledVector(f.normal, -rad.dot(f.normal)); // in-plane component
      n.fromBufferAttribute(nrm, i).addScaledVector(rad, (pillow * 0.55) / radMax).normalize();
      nrm.setXYZ(i, n.x, n.y, n.z);
    };
    for (const g of geom.groups) {
      if (g.materialIndex < faces.length) {
        const f = faces[g.materialIndex];
        for (let i = g.start; i < g.start + g.count; i++) tilt(i, f, radMaxOf[g.materialIndex]);
      } else if (round) {
        // Band RIM vertices carry a face-exact analytic normal and lie in
        // that face's plane — tilt them by the SAME formula, or pillow
        // re-opens the zero-crease guarantee at every face↔band junction
        // (the fillet review caught this on pristine pillowed sets:
        // heartwood/sapamber/scrimshaw rang a ~14° normal step around
        // each face). Arc interiors and dome apexes carry blended/ray
        // normals and skip; worn sets never reach here pristine —
        // displacement already re-blended their bands.
        for (let i = g.start; i < g.start + g.count; i++) {
          p.fromBufferAttribute(pos, i);
          n.fromBufferAttribute(nrm, i);
          for (let fi = 0; fi < faces.length; fi++) {
            const f = faces[fi];
            rad.subVectors(p, f.centroid);
            if (Math.abs(rad.dot(f.normal)) > EPS * 10) continue; // not in this face's plane
            if (n.dot(f.normal) < 0.9999) continue; // not a rim vertex of this face
            tilt(i, f, radMaxOf[fi]);
            break;
          }
        }
      }
    }
    nrm.needsUpdate = true;
  }

  geom.computeBoundingSphere();
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
  // Spread the WHOLE recipe over the def, then re-map the two renamed
  // fields. (Cherry-picking recipe fields here bit twice: .maps and then
  // .shader were silently dropped and their features no-opped while
  // looking implemented.)
  // A set may omit body/text to inherit the std per-type colors (the lab's
  // GEO BENCH judges edge recipes on otherwise-standard dice).
  const raw = shroud ? { ...def, color: SHROUD_COLOR }
    : theme ? { ...def, ...theme, color: theme.body ?? def.color, text: theme.text ?? def.text }
    : def;
  // THE STANDARD EDGE IS RESOLVED ONCE, HERE, and the resolved recipe is what
  // every downstream reader sees — the geometry builder, applyGeoCharacter,
  // materialFor's painted outline (`def.geo.ink`) and the band material's
  // `edgeDark`. Resolving it at the geometry call alone would have shipped the
  // .090 fillet under the CUT band's ink (.25 instead of .12): the same shape
  // Joe judged, wearing a darker seam than the bench he judged it on.
  const skin = { ...raw, geo: withStandardEdge(raw.geo) };
  // The BASE polyhedron drives faces, values and the physics hull; the mesh
  // the player sees is its beveled twin (render only — see buildBeveledGeometry).
  // A set's `geo` recipe reshapes ONLY that twin (Level 3.5): edge width,
  // fillet shading, tumbled wear, chips, pillowed faces.
  const base = buildBaseGeometry(type);
  const faces = extractFaces(base, type);
  const geometry = buildBeveledGeometry(faces, skin.geo);
  if (skin.geo) {
    let gseed = 5381;
    for (const ch of `${type}|${variant}`) gseed = (Math.imul(gseed, 33) + ch.charCodeAt(0)) | 0;
    applyGeoCharacter(geometry, faces, skin.geo, gseed >>> 0);
  }

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
    // Glyph family (Joe 2026-08-04): the classics.ivorypips set carries
    // glyph='pip' so its d6 renders Vegas pips; on any other die type the
    // pip renderer falls back to digits (pips are the traditional d6
    // idiom only). Decorate here so all three paint channels (color,
    // digit-glow emissive, relief engrave) see the same dispatch.
    if (skin.glyph) for (const s of specs) s.glyph = skin.glyph;
    materials = faces.map((f, i) =>
      shroud ? materialFor(skin, f, { blank: true }, true)
        : materialFor(skin, f, specs[i], false, faceSeed(type, i))
    );
    faces.forEach((f, i) => { f.value = specs[i].value; });
  }

  // The chamfer band's own material: the same darker tone the face textures
  // paint along their edges, so the bevel reads as that outline made real.
  // Round-profile (tumbled) sets darken HALF as much — a worn edge is the
  // same material frosted soft, not an inked outline; the wide dark seams
  // were fighting the sea-tumbled look. geo.ink overrides both this and
  // the painted outline (0 = fully self-colored edges); geo.tint sets the
  // color the edge lerps toward (default black — the classic inked look).
  const edgeDark = skin.geo && skin.geo.ink != null ? skin.geo.ink
    : skin.geo && skin.geo.profile === 'round' ? 0.12 : 0.25;
  const edgeTint = skin.geo && skin.geo.tint || '#000000';
  const edgeColor = new THREE.Color(skin.color).lerp(new THREE.Color(edgeTint), edgeDark);
  materials.push(new THREE.MeshStandardMaterial({
    color: edgeColor,
    roughness: shroud ? 0.16 : (skin.feel ? skin.feel.rough : 0.3),
    metalness: shroud ? 0.5 : (skin.feel ? skin.feel.metal : 0.1),
    // same environment rule as the faces (materialFor's house clamp):
    // std/shroud AND house-less lab sets stay a whisper
    envMapIntensity: skin.house ? ((skin.spec && skin.spec.envMapIntensity) ?? 1) : 0.35,
  }));

  const shape = buildShape(faces);
  // `geo` is the RESOLVED recipe (standard edge folded in), so a probe can
  // assert what this die actually wears instead of re-deriving it from a
  // vertex count — see __diceDebug.dieGeoStats.
  return { type, def, geo: skin.geo, geometry, materials, shape, faces, vertexValues };
}

function materialFor(def, face, spec, shroud = false, seed = 1) {
  const bundle = shroud
    ? { map: makeFaceTexture(def, face, spec) }
    : makeFaceBundle(def, face, spec, seed);
  // Themed sets ride MeshPhysicalMaterial (same shader family, more
  // specular levers — clearcoat, iridescence, IOR, tinted specular; the
  // per-set `spec` recipe drives them). std/shroud keep Standard.
  const M = !shroud && def.spec ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({
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
  if (!shroud && def.spec) {
    // specular identity (Joe 2026-08-03): each set's reflection character
    const sp = def.spec;
    if (sp.clearcoat !== undefined) m.clearcoat = sp.clearcoat;
    if (sp.clearcoatRoughness !== undefined) m.clearcoatRoughness = sp.clearcoatRoughness;
    if (sp.iridescence !== undefined) m.iridescence = sp.iridescence;
    if (sp.iridescenceIOR !== undefined) m.iridescenceIOR = sp.iridescenceIOR;
    if (sp.ior !== undefined) m.ior = sp.ior;
    if (sp.specularIntensity !== undefined) m.specularIntensity = sp.specularIntensity;
    if (sp.specularColor) m.specularColor = new THREE.Color(sp.specularColor);
    if (sp.envMapIntensity !== undefined) m.envMapIntensity = sp.envMapIntensity;
  }
  // Under the main table's scene.environment (Tier 6 §9): standard and
  // shrouded dice keep their released look — reflections stay a whisper.
  // Themed sets ride their spec recipe (or three's default 1, lab-judged).
  if (shroud || !def.house) m.envMapIntensity = 0.35;
  if (!shroud && def.shader) patchShader(m, def.shader); // Level 2
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

// Evict one variant's cached builds and free their GPU resources — the lab's
// SET BUILDER re-registers its recipe and rebuilds live. Callers must drop
// every mesh wearing the variant BEFORE busting (disposed textures render
// blank). The app itself never edits a recipe in place, so nothing outside
// the lab calls this.
export function bustDie(variant) {
  for (const type of DIE_TYPES) {
    const entry = cache.get(`${type}|${variant}`);
    if (!entry) continue;
    cache.delete(`${type}|${variant}`);
    entry.geometry.dispose();
    for (const m of entry.materials) {
      for (const t of [m.map, m.emissiveMap, m.normalMap, m.roughnessMap]) t && t.dispose();
      m.dispose();
    }
  }
}

export function createDieMesh(type, variant = 'std') {
  const die = getDie(type, variant);
  const mesh = new THREE.Mesh(die.geometry, die.materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Level 5 (js/post.js): sets with emissive identity are bloom SOURCES —
  // the selective-bloom mask renders only flagged meshes, so a std or
  // shrouded die can never bloom by construction.
  const skin = variant !== 'std' && variant !== 'shroud' ? SETS[variant] : null;
  if (skin && skin.post && skin.post.bloom) mesh.userData.bloom = true;
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
