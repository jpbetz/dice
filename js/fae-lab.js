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

// THE FAE CONCEPT LAB (ROADMAP W0) — a throwaway staging of the Moonrise
// Glade for Joe's judgment, gated behind __diceDebug.faeConcept(). NOTHING
// here is the venue mechanism; it exists to put the two dossiers
// (scratchpad fae-research/) on screen: the palette tables from grammar.md
// and the fog/glow kit from techniques.md, composed under the sixteen
// rules. When the venue proper ships (W2+), this file's learnings move
// into real modules and this file dies.
//
// Honest to the rules even as a sketch:
//   · grammar 2  — dice are the brightest thing; everything here is value.
//   · grammar 4  — the starfield is monochrome teal, tertiary tier ≤0.25.
//   · grammar 7  — the moot ring: 11 caps, jittered, one gap, one fallen.
//   · grammar 12 — ONE moon shaft, landing on the resolve area.
//   · techniques §1 — three dense sheets below y 0.68, one veil with a
//     baked clearing hole; per-vertex lattice brightened by lit dice.
//   · techniques T2 — nothing here carries userData.bloom; the concept
//     runs WITHOUT the post stack (glow = emissive + halos + lights).

import * as THREE from 'three';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The two palette candidates, verbatim from grammar.md §2. Roles, not vibes.
export const FAE_PALETTES = {
  moonrise: {
    void: '#090c16', fogBody: '#101728', deepGround: '#17203a',
    ground: '#232f4e', bark: '#33436c', moonEdge: '#4a5c86',
    glowCore: '#3fbfb4', glowCap: '#5fdccb', glowRim: '#8ff0e2',
    accent: '#ff9a44',
    moon: '#bcd2ff',
  },
  // WITCHLIGHT FOXFIRE (Joe, 2026-08-16: "super dark greens or almost
  // fluorescent greens... maybe lichen or something mystical... pick a
  // palette that's extraordinary"). Both of his instincts at once: the
  // WORLD goes near-black bog green (value floor dropped hard), and the
  // GLOW goes pale spectral mint — lichen-toned, nearly white with a
  // green breath. The "fluorescent" read comes from value contrast, not
  // saturation, which is what keeps it off grammar §2's Vegas list; real
  // foxfire is exactly this pale eerie light. The one warmth is the
  // ember door.
  foxfire: {
    void: '#05080a', fogBody: '#0b1410', deepGround: '#101c14',
    ground: '#1a2c1e', bark: '#33422c', moonEdge: '#5a7a6e',
    glowCore: '#7dd8a8', glowCap: '#b8f5d4', glowRim: '#e8fff0',
    accent: '#ff9a44',
    moon: '#cfd9d4',
  },
};

function canvas2d(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, x: c.getContext('2d') };
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Ground: one huge disc that IS the glade floor, mossy mottling toward the
// centre, falling to deepGround at the rim where the fog takes over. It
// covers the felt and the 160-unit floor alike — the venue rule (grammar
// 16): no felt survives into the frame.
function buildGround(pal, seed) {
  const size = 512;
  const { c, x } = canvas2d(size);
  const rnd = mulberry32(seed);
  // Dark by default — the MOON makes the pool of light, not the albedo.
  // (Round-3 lesson: at the 60°-down camera the frame is almost all
  // ground, so the ground carries the whole value structure; a mid-tone
  // floor flattens the scene no matter what the lights do.)
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, pal.ground);
  g.addColorStop(0.35, pal.deepGround);
  g.addColorStop(0.7, pal.void);
  g.addColorStop(1, pal.void);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  // Moss mottling: sparse soft blobs, mid tone, centre-weighted.
  for (let i = 0; i < 240; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 1.6) * size * 0.42;
    const px = size / 2 + r * Math.cos(a), py = size / 2 + r * Math.sin(a);
    const s = 3 + rnd() * 9;
    const bg = x.createRadialGradient(px, py, 0, px, py, s);
    bg.addColorStop(0, `rgba(51, 67, 108, ${0.10 + rnd() * 0.12})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = bg;
    x.fillRect(px - s, py - s, s * 2, s * 2);
  }
  const geo = new THREE.CircleGeometry(60, 48);
  const mat = new THREE.MeshStandardMaterial({
    map: tex(c), roughness: 0.95, metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  mesh.name = 'faeGround';
  return mesh;
}

// Fog sheets, the techniques §1 recipe at concept fidelity: 4 subdivided
// planes, itemSize-4 vertex colour, three dense below the die line and one
// veil with the baked clearing hole. Base alpha lives in userData so the
// per-frame emitter pass is memcpy + add.
const SHEET = [
  { y: 0.12, a: 0.22 }, { y: 0.35, a: 0.18 }, { y: 0.62, a: 0.14 },
  { y: 3.4, a: 0.05, hole: 7 },
];

function buildFogSheets(pal, seed) {
  const sheets = [];
  const noise = (() => {
    const size = 256;
    const { c, x } = canvas2d(size);
    const rnd = mulberry32(seed ^ 0x9e37);
    const img = x.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = 150 + 105 * rnd();
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = v;
    }
    x.putImageData(img, 0, 0);
    const t0 = tex(c);
    // Blur by downscale-upscale: soft billows, not static.
    const { c: c2, x: x2 } = canvas2d(size);
    x2.filter = 'blur(6px)';
    x2.drawImage(c, 0, 0);
    return tex(c2);
  })();
  for (const [si, s] of SHEET.entries()) {
    const segX = 40, segZ = 30;
    const geo = new THREE.PlaneGeometry(60, 44, segX, segZ);
    const count = geo.attributes.position.count;
    const col = new Float32Array(count * 4);
    const pos = geo.attributes.position;
    for (let i = 0; i < count; i++) {
      const wx = pos.getX(i), wz = -pos.getY(i); // plane pre-rotation axes
      const r = Math.hypot(wx, wz);
      let a = s.a * (0.75 + 0.25 * Math.sin(wx * 0.6 + wz * 0.4 + si * 2));
      if (s.hole) {
        const k = Math.min(1, Math.max(0, (r - s.hole) / 5));
        a *= k * k;
      }
      a *= Math.max(0, 1 - r / 34); // die out before the disc rim
      col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1; col[i * 4 + 3] = a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    // MIST IS PALE. The tint multiplies the noise map, so a near-black
    // fogBody tint renders no fog at all (first plate's lesson) — the
    // sheets wear the moon-struck mid tone and the vertex alpha does the
    // density work.
    const mat = new THREE.MeshBasicMaterial({
      map: noise, color: pal.moonEdge, transparent: true, depthWrite: false,
      vertexColors: true, fog: true, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = s.y;
    mesh.renderOrder = 4 + si;
    mesh.name = `faeFog${si}`;
    mesh.userData.base = col.slice();
    mesh.userData.drift = [0.004 + 0.003 * si, 0.002 * (si % 2 ? 1 : -1)];
    sheets.push(mesh);
  }
  return sheets;
}

// The emitter pass (techniques §1): memcpy the base, add each lit die's
// pool. Alpha RISES a touch under a die (the bright pool it silhouettes
// against) while brightness rises a lot; the lattice cell walk is bounded
// by radius so the cost is a few hundred writes.
export function brightenFog(sheets, emitters) {
  for (const mesh of sheets) {
    const attr = mesh.geometry.attributes.color;
    attr.array.set(mesh.userData.base);
    const pos = mesh.geometry.attributes.position;
    for (const e of emitters) {
      const R = e.r || 3.0;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - e.x, dz = -pos.getY(i) - e.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        const k = 1 - Math.sqrt(d2) / R;
        const g = k * k * (e.gain || 1);
        attr.array[i * 4] += g * e.cr;
        attr.array[i * 4 + 1] += g * e.cg;
        attr.array[i * 4 + 2] += g * e.cb;
        attr.array[i * 4 + 3] = Math.min(0.5, attr.array[i * 4 + 3] + g * 0.10);
      }
    }
    attr.needsUpdate = true;
  }
}

// The vacated moot (grammar §5 staging 2): 11 caps on an ellipse, two dark,
// one fallen and lit from its gills. Emissive only — zero lights (T2, §6).
function buildMoot(pal, seed, at = { x: -2.2, z: -6.5 }) {
  const rnd = mulberry32(seed ^ 0x51de);
  const group = new THREE.Group();
  group.name = 'faeMoot';
  const capGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const stemGeo = new THREE.CylinderGeometry(0.28, 0.36, 1, 8);
  const glow = new THREE.Color(pal.glowCap);
  const dim = new THREE.Color(pal.bark);
  const pools = [];
  for (let i = 0; i < 11; i++) {
    const th = (i / 11) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
    if (i === 4) continue; // THE GAP (front-left) — the interruption is the story
    const ex = at.x + 2.8 * Math.cos(th), ez = at.z + 1.7 * Math.sin(th);
    const s = 0.18 + rnd() * 0.14;
    const dark = (i === 7 || i === 9);
    const fallen = i === 5;
    // Secondary tier, not primary: the caps must never contest a die
    // (grammar rule 2/3). First plate had them at marshmallow size and
    // egg brightness; they are small and ember-dim now, and the POOLS
    // carry the presence.
    const capMat = new THREE.MeshStandardMaterial({
      color: dark ? dim : new THREE.Color(pal.glowCore),
      emissive: dark ? '#000000' : glow,
      emissiveIntensity: dark ? 0 : 0.32,
      roughness: 0.7,
    });
    const stemMat = new THREE.MeshStandardMaterial({ color: pal.bark, roughness: 0.9 });
    const cap = new THREE.Mesh(capGeo, capMat);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    cap.scale.setScalar(s);
    stem.scale.set(s, s * 0.9, s);
    if (fallen) {
      cap.rotation.z = Math.PI * 0.9;             // gills up, still lit —
      cap.material.emissiveIntensity = 0.5;       // the brightest, wrong way up
      cap.position.set(ex + 0.3, s * 0.35, ez + 0.2);
      stem.rotation.z = Math.PI / 2.3;
      stem.position.set(ex - 0.2, s * 0.3, ez);
    } else {
      stem.position.set(ex, s * 0.45, ez);
      cap.position.set(ex, s * 0.9, ez);
    }
    group.add(stem, cap);
    if (!dark) pools.push({ x: ex, z: ez, r: 1.6 + s, cr: 0.10, cg: 0.30, cb: 0.27, gain: fallen ? 0.9 : 0.5 });
  }
  // Merged glow pools on the ground beneath the lit caps.
  const poolTexC = (() => {
    const { c, x } = canvas2d(64);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return tex(c);
  })();
  for (const p of pools) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(p.r, 20),
      new THREE.MeshBasicMaterial({
        map: poolTexC, color: pal.glowCore, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.42,
      }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(p.x, 0.06, p.z);
    disc.renderOrder = 3;
    group.add(disc);
  }
  group.userData.pools = pools; // static fog emitters, folded in at build
  return group;
}

// Tertiary starfield + one lead wisp (grammar 4, 9): monochrome, ≤0.25,
// and the one bright point has a heading (it works toward the moot gap).
function buildWisps(pal, seed, n = 46) {
  const rnd = mulberry32(seed ^ 0xf1e5);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  const statics = [];
  const glow = new THREE.Color(pal.glowCore);
  for (let i = 0; i < n; i++) {
    statics.push({
      x: (rnd() - 0.5) * 40, y: 0.6 + rnd() * 6.5, z: (rnd() - 0.5) * 30,
      p1: rnd() * 6.28, p2: rnd() * 6.28, p3: rnd() * 6.28,
      lead: i === 0,
    });
    const v = i === 0 ? 0.55 : 0.06 + 0.14 * rnd(); // tertiary; lead is secondary
    col[i * 3] = glow.r * v; col[i * 3 + 1] = glow.g * v; col[i * 3 + 2] = glow.b * v;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const { c } = (() => {
    const o = canvas2d(32);
    const g = o.x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    o.x.fillStyle = g; o.x.fillRect(0, 0, 32, 32);
    return o;
  })();
  const mat = new THREE.PointsMaterial({
    size: 0.3, map: tex(c), vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'faeWisps';
  return { points, statics };
}

export function stepWisps(w, t) {
  const pos = w.points.geometry.attributes.position;
  for (const [i, s] of w.statics.entries()) {
    if (s.lead) {
      // A heading: a slow figure through the glade toward the moot gap.
      const u = (t * 0.05) % 1;
      pos.setXYZ(i,
        8 - 12 * u + 1.2 * Math.sin(t * 0.7 + s.p1),
        1.4 + 0.8 * Math.sin(t * 0.5 + s.p2),
        2 - 8 * u + 0.9 * Math.sin(t * 0.6 + s.p3));
      continue;
    }
    pos.setXYZ(i,
      s.x + 0.8 * Math.sin(t * 0.21 + s.p1) + 0.4 * Math.sin(t * 0.53 + s.p2),
      s.y + 0.5 * Math.sin(t * 0.17 + s.p2),
      s.z + 0.8 * Math.sin(t * 0.19 + s.p3) + 0.4 * Math.sin(t * 0.47 + s.p1));
  }
  pos.needsUpdate = true;
}

// THE TREELINE — the value structure the second plate proved missing: a
// ring of near-void forest silhouette around the glade, melting into the
// depth fog. Without dark masses there is no glade, only haze (grammar 14:
// masses everywhere, detail in one place).
function buildTreeline(pal, seed) {
  const w = 1024, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const rnd = mulberry32(seed ^ 0x7ee5);
  x.clearRect(0, 0, w, h);
  x.fillStyle = pal.void;
  // Irregular humps of canopy: overlapping arcs at jittered heights, taller
  // in clumps — a broadleaf line, not a conifer comb.
  for (let px = -30; px < w + 30; px += 8 + rnd() * 18) {
    const top = h * (0.25 + rnd() * 0.3);
    const r = 26 + rnd() * 46;
    x.beginPath();
    x.arc(px, top + r * 0.4, r, 0, Math.PI * 2);
    x.fill();
  }
  x.fillRect(0, h * 0.62, w, h * 0.38); // solid below the canopy line
  const t = tex(c);
  const geo = new THREE.CylinderGeometry(24, 24, 13, 48, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    map: t, transparent: true, depthWrite: false, fog: true,
    side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 6.5;
  mesh.name = 'faeTreeline';
  mesh.renderOrder = 1;
  return mesh;
}

// ONE moon shaft (grammar 12), landing on the resolve area: a single
// tilted quad, baked vertical gradient with soft horizontal falloff (a
// hard quad edge read as a diagonal line across the second plate),
// additive, oriented to the resting eye once.
function buildMoonShaft(pal) {
  const { c, x } = canvas2d(128);
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.17)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  // Horizontal falloff: multiply alpha toward zero at the left/right edges.
  const img = x.getImageData(0, 0, 128, 128);
  for (let py = 0; py < 128; py++) {
    for (let px = 0; px < 128; px++) {
      const u = px / 127;
      const k = Math.pow(Math.sin(Math.PI * u), 1.4);
      img.data[(py * 128 + px) * 4 + 3] *= k;
    }
  }
  x.putImageData(img, 0, 0);
  const geo = new THREE.PlaneGeometry(13, 26);
  const mat = new THREE.MeshBasicMaterial({
    map: tex(c), color: pal.moon, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(1.5, 12, -2);
  mesh.rotation.z = 0.22;         // the tilt is the moon vector
  mesh.name = 'faeMoonShaft';
  mesh.renderOrder = 9;
  return mesh;
}

// Halo discs under lit dice (techniques §3): one merged mesh, 6 slots,
// rewritten per frame; unused slots alpha 0.
function buildHalos(pal) {
  const { c, x } = canvas2d(64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const slots = 6;
  const geos = [];
  for (let i = 0; i < slots; i++) geos.push(new THREE.CircleGeometry(3.0, 18));
  // Simple group of discs (concept fidelity — the ship version merges).
  const group = new THREE.Group();
  group.name = 'faeHalos';
  for (let i = 0; i < slots; i++) {
    const m = new THREE.Mesh(geos[i], new THREE.MeshBasicMaterial({
      map: tex(c), color: pal.glowRim, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.3;
    m.renderOrder = 8;
    group.add(m);
  }
  return group;
}

export function buildFaeConcept({ paletteId = 'moonrise', seed = 20260815 } = {}) {
  const pal = FAE_PALETTES[paletteId] || FAE_PALETTES.moonrise;
  const group = new THREE.Group();
  group.name = 'faeConcept';
  const ground = buildGround(pal, seed);
  const sheets = buildFogSheets(pal, seed);
  const moot = buildMoot(pal, seed);
  const wisps = buildWisps(pal, seed);
  const shaft = buildMoonShaft(pal);
  const halos = buildHalos(pal);
  const treeline = buildTreeline(pal, seed);
  group.add(ground, treeline, moot, wisps.points, shaft, halos, ...sheets);
  // Fold the moot's static light into the fog base (techniques §6).
  brightenFog(sheets, moot.userData.pools);
  for (const s of sheets) s.userData.base = s.geometry.attributes.color.array.slice();
  return { group, pal, sheets, wisps, halos, moot };
}
