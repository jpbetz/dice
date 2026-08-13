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

// THE GLADE STAGE (ROADMAP W0 → W2). Born as the W0 concept lab for Joe's
// judgment behind __diceDebug.faeConcept(); W1 made it the venue's interim
// stage; W2 (2026-08-13) upgraded its fidelity IN PLACE — the horizon mist
// band (the canopy silhouette was void-on-void and had never read), mossed
// ground plus a clearing-detail layer where the moon pools, real billow
// structure in the sheets, the moonbeam landed on the resolve area, the
// moot re-staged out from under the W3 tower, and the mirror pool (Joe's
// approved W0 dressing). Still one honest kit: baked canvases + vertex
// data, no fetched textures, no lights beyond main.js's venue pair.
//
// Placement law for glade props: BEYOND the back wall (z < −4.3, the wide
// mat's edge) and clear of the tower envelope (|x| > 3.3 world) — scenery
// may never stand where a die can rest or a tower does.
//
// Honest to the rules:
//   · grammar 2  — dice are the brightest thing; everything here is value.
//   · grammar 4  — the starfield is monochrome teal, tertiary tier ≤0.25.
//   · grammar 7  — the moot ring: 11 caps, jittered, one gap, one fallen,
//     the gap turned toward the clearing (the interruption is the story).
//   · grammar 12 — ONE moon shaft, landing on the resolve area.
//   · grammar 14 — masses everywhere, detail in one place: the clearing.
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
  const size = 1024; // W2: 512 read as a featureless gradient at the eye
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
  // Moss in two scales (W2). Broad soft beds first — value patches that
  // break the gradient without contesting the moon pool…
  const bed = new THREE.Color(pal.ground).lerp(new THREE.Color(pal.bark), 0.45);
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, r = (0.10 + Math.pow(rnd(), 1.3) * 0.36) * size;
    const px = size / 2 + r * Math.cos(a), py = size / 2 + r * Math.sin(a);
    const s = 20 + rnd() * 26;
    const bg = x.createRadialGradient(px, py, 0, px, py, s);
    bg.addColorStop(0, `rgba(${(bed.r * 255) | 0}, ${(bed.g * 255) | 0}, ${(bed.b * 255) | 0}, ${0.08 + rnd() * 0.10})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = bg;
    x.fillRect(px - s, py - s, s * 2, s * 2);
  }
  // …then small clumps with a moonlit edge tone (moonEdge, never the glow
  // teal — scattered teal on the floor would read as uncounted sources).
  const lit = new THREE.Color(pal.moonEdge);
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 1.5) * size * 0.44;
    const px = size / 2 + r * Math.cos(a), py = size / 2 + r * Math.sin(a);
    const s = 4 + rnd() * 9;
    const bg = x.createRadialGradient(px, py, 0, px, py, s);
    bg.addColorStop(0, `rgba(${(lit.r * 255) | 0}, ${(lit.g * 255) | 0}, ${(lit.b * 255) | 0}, ${0.05 + rnd() * 0.09})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = bg;
    x.fillRect(px - s, py - s, s * 2, s * 2);
  }
  // THE CONNECTIVE LOBES (W2b, rules 3/4): two gradient trails of denser
  // moss walk the ground from the tower's socket to each flank feature,
  // so the space between features is designed rather than dead. World →
  // canvas: 1 world unit = size/120 px, +z = +canvas-y. Positions match
  // the features' shipped placements (moot −6.8,−6.6 · pool 7.2,−7.4 ·
  // socket foot ≈ 0,−4.5); alpha stays bed-tier — a trail is value, not
  // a glow.
  const w2c = (wx, wz) => [size / 2 + wx * (size / 120), size / 2 + wz * (size / 120)];
  const lobe = (x0, z0, x1, z1, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const wx = x0 + (x1 - x0) * t + (rnd() - 0.5) * 1.6;
      const wz = z0 + (z1 - z0) * t + (rnd() - 0.5) * 1.4;
      const [px, py] = w2c(wx, wz);
      const s = (10 + rnd() * 12) * (1 - 0.35 * t);
      const tone = rnd() < 0.3 ? lit : bed;
      const bg = x.createRadialGradient(px, py, 0, px, py, s);
      bg.addColorStop(0, `rgba(${(tone.r * 255) | 0}, ${(tone.g * 255) | 0}, ${(tone.b * 255) | 0}, ${0.10 + rnd() * 0.08})`);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = bg;
      x.fillRect(px - s, py - s, s * 2, s * 2);
    }
  };
  lobe(-1.5, -4.5, -6.2, -6.4, 14); // socket → moot
  lobe(1.5, -4.5, 6.6, -7.0, 14);   // socket → pool
  // BASE TRANSITIONS (rule 9 — nothing floats): a damp dark ring where
  // the pool sits, a trampled pale ring under the moot. Baked into the
  // ground rather than skirted onto the props, because the ground is
  // what a base disturbs.
  const ring = (wx, wz, wr, tone, alpha) => {
    const [px, py] = w2c(wx, wz);
    const pr = wr * (size / 120);
    const bg = x.createRadialGradient(px, py, pr * 0.35, px, py, pr);
    bg.addColorStop(0, `rgba(${(tone.r * 255) | 0}, ${(tone.g * 255) | 0}, ${(tone.b * 255) | 0}, ${alpha})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = bg;
    x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  };
  const damp = new THREE.Color(pal.void).lerp(new THREE.Color(pal.fogBody), 0.5);
  ring(7.2, -7.4, 4.2, damp, 0.30);  // the pool's wet margin
  ring(-6.8, -6.6, 4.0, bed, 0.16);  // the moot's trampled court
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

// The clearing's own detail layer (W2, grammar 14: detail in ONE place —
// where the moon pools and the dice resolve). A small transparent disc
// over the ground: lichen flecks and pebble glints at a texel density the
// big disc cannot afford. Standard material so the lamp and the dice
// shadows land on it like the ground it decorates.
function buildClearingDetail(pal, seed) {
  const size = 512, R = 12;
  const { c, x } = canvas2d(size);
  const rnd = mulberry32(seed ^ 0xc1ea);
  const lit = new THREE.Color(pal.moonEdge);
  const pale = new THREE.Color(pal.moonEdge).lerp(new THREE.Color('#ffffff'), 0.25);
  for (let i = 0; i < 150; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.8) * size * 0.46;
    const px = size / 2 + r * Math.cos(a), py = size / 2 + r * Math.sin(a);
    const s = 1.5 + rnd() * 4.5;
    const tone = rnd() < 0.25 ? pale : lit;
    const alpha = (0.10 + rnd() * 0.16) * (1 - r / (size * 0.5));
    const bg = x.createRadialGradient(px, py, 0, px, py, s);
    bg.addColorStop(0, `rgba(${(tone.r * 255) | 0}, ${(tone.g * 255) | 0}, ${(tone.b * 255) | 0}, ${alpha})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = bg;
    x.fillRect(px - s, py - s, s * 2, s * 2);
  }
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(R, 32),
    new THREE.MeshStandardMaterial({
      map: tex(c), transparent: true, roughness: 0.92, metalness: 0,
      depthWrite: false,
    }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.035;
  mesh.renderOrder = 2;
  mesh.receiveShadow = true;
  mesh.name = 'faeClearing';
  return mesh;
}

// Fog sheets, the techniques §1 recipe at concept fidelity: 4 subdivided
// planes, itemSize-4 vertex colour, three dense below the die line and one
// veil with the baked clearing hole. Base alpha lives in userData so the
// per-frame emitter pass is memcpy + add.
const SHEET = [
  { y: 0.12, a: 0.26 }, { y: 0.35, a: 0.22 }, { y: 0.62, a: 0.14 },
  { y: 3.4, a: 0.05, hole: 7 },
];

function buildFogSheets(pal, seed) {
  const sheets = [];
  // W2: real billow structure. The old per-pixel noise blurred to a nearly
  // uniform field, so the drifting map.offset had nothing to show. Three
  // octaves of soft discs give the sheets actual clouds to drift.
  const noise = (() => {
    const size = 256;
    const { c, x } = canvas2d(size);
    const rnd = mulberry32(seed ^ 0x9e37);
    // A continuous bed first — the billows are structure ON mist, not
    // cotton balls floating in nothing.
    x.fillStyle = 'rgba(255,255,255,0.45)';
    x.fillRect(0, 0, size, size);
    const blob = (px, py, s, a) => {
      const bg = x.createRadialGradient(px, py, 0, px, py, s);
      bg.addColorStop(0, `rgba(255,255,255,${a})`);
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = bg;
      x.fillRect(px - s, py - s, s * 2, s * 2);
    };
    // The canvas tiles (RepeatWrapping): draw each blob at its wrapped
    // twin positions so the seams stay invisible under drift.
    const wrapped = (px, py, s, a) => {
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        if (px + ox > -s * 2 && px + ox < size + s * 2
          && py + oy > -s * 2 && py + oy < size + s * 2) blob(px + ox, py + oy, s, a);
      }
    };
    for (let i = 0; i < 22; i++) wrapped(rnd() * size, rnd() * size, 44 + rnd() * 46, 0.32 + rnd() * 0.2);
    for (let i = 0; i < 60; i++) wrapped(rnd() * size, rnd() * size, 15 + rnd() * 26, 0.20 + rnd() * 0.16);
    for (let i = 0; i < 130; i++) wrapped(rnd() * size, rnd() * size, 4 + rnd() * 10, 0.12 + rnd() * 0.12);
    return tex(c);
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
// W2 re-staged it: the W0 ellipse stood where the spec said a tower would
// ("sits where a tower will stand in W3") and when Hollow Bole shipped it
// was swallowed under the roots — caps peeking from under a stump instead
// of a story. It now holds the LEFT flank beyond the back wall, and the
// whole ring is rotated so the gap and the fallen cap face the clearing.
function buildMoot(pal, seed, at = { x: -6.8, z: -6.6 }, rot = -1.55) {
  const rnd = mulberry32(seed ^ 0x51de);
  const group = new THREE.Group();
  group.name = 'faeMoot';
  const capGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const stemGeo = new THREE.CylinderGeometry(0.28, 0.36, 1, 8);
  const glow = new THREE.Color(pal.glowCap);
  const dim = new THREE.Color(pal.bark);
  const pools = [];
  for (let i = 0; i < 11; i++) {
    const th = (i / 11) * Math.PI * 2 + (rnd() - 0.5) * 0.25 + rot;
    if (i === 4) continue; // THE GAP — turned toward the clearing by `rot`
    const ex = at.x + 2.8 * Math.cos(th), ez = at.z + 1.7 * Math.sin(th);
    const s = 0.22 + rnd() * 0.16; // a step larger — the flank is farther from the eye
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
  // THE SPILL (W2b, rule 4 — the space between features is designed):
  // five strays walk from the ring's tower-side edge toward the root
  // flare, sizes falling, most of them dark — the vacated court's path
  // back to the tree, and the tissue that connects the moot to the hero
  // instead of leaving it an island. Same placement law as the ring
  // (all z well beyond the widest wall; |x| outside the tower envelope),
  // and the two lit ones are DIM — a spill must never read as new
  // sources (the countable-sources gate).
  const spillTo = { x: -3.5, z: -5.9 }; // just shy of the root flare
  const edge = { x: at.x + 2.3, z: at.z + 0.6 };
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.7) / 5.7;
    const sx = edge.x + (spillTo.x - edge.x) * t + (rnd() - 0.5) * 0.7;
    const sz = edge.z + (spillTo.z - edge.z) * t + (rnd() - 0.5) * 0.6;
    const s = (0.16 - 0.016 * i) * (0.85 + rnd() * 0.3);
    const lit = i === 1 || i === 3;
    const capMat = new THREE.MeshStandardMaterial({
      color: lit ? new THREE.Color(pal.glowCore) : dim,
      emissive: lit ? glow : '#000000',
      emissiveIntensity: lit ? 0.18 : 0,
      roughness: 0.75,
    });
    const stemMat = new THREE.MeshStandardMaterial({ color: pal.bark, roughness: 0.9 });
    const cap = new THREE.Mesh(capGeo, capMat);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    cap.scale.setScalar(s);
    stem.scale.set(s, s * 0.8, s);
    stem.position.set(sx, s * 0.4, sz);
    cap.position.set(sx, s * 0.85, sz);
    group.add(stem, cap);
  }
  group.userData.pools = pools; // static fog emitters, folded in at build
  group.userData.at = at;       // reported via venueInfo().stage
  return group;
}

// THE MIRROR POOL (W2 — Joe's approved W0 dressing: "a mirror pool as
// glade dressing"). Still water on the RIGHT flank, beyond the back wall
// where no die can stand in it. The reflection is baked, not rendered:
// near-void water, a thin moonlit bank, one elongated moon glint laid
// along the shaft's own tilt, and three faint wisp-lights — a mirror by
// value structure, at zero render-target cost. A low-roughness standard
// material lets the venue lamp add the one live sheen.
// W2b moved it back and out (was 6.6, −6.4 — the same depth as the moot,
// and two supports at mirrored depth read as bookends, rule 6): deeper
// into the mist so the background layer gains a tenant (rule 5), still
// dice-unreachable by 1.3 beyond the widest wall at its nearest edge.
function buildMirrorPool(pal, seed, at = { x: 7.2, z: -7.4 }) {
  const size = 256;
  const { c, x } = canvas2d(size);
  const rnd = mulberry32(seed ^ 0xb007);
  // Night water mirrors the SKY, not the ground: it sits a step PALER
  // than the dark banks around it (first plate read as a void cutout at
  // 0.14 — a hole in the world, not a pool holding the moon).
  const water = new THREE.Color(pal.void).lerp(new THREE.Color(pal.moonEdge), 0.30);
  const bank = new THREE.Color(pal.moonEdge);
  // Water body: an ellipse with a soft irregular edge.
  x.translate(size / 2, size / 2);
  x.beginPath();
  for (let a = 0; a <= 64; a++) {
    const th = (a / 64) * Math.PI * 2;
    const wob = 1 + 0.06 * Math.sin(th * 3 + seed) + 0.04 * Math.sin(th * 7 + seed * 2);
    const px = Math.cos(th) * size * 0.46 * wob, py = Math.sin(th) * size * 0.44 * wob;
    if (a === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.closePath();
  x.fillStyle = `rgba(${(water.r * 255) | 0}, ${(water.g * 255) | 0}, ${(water.b * 255) | 0}, 0.92)`;
  x.fill();
  // The moonlit bank: the same path, stroked thin and faded.
  x.strokeStyle = `rgba(${(bank.r * 255) | 0}, ${(bank.g * 255) | 0}, ${(bank.b * 255) | 0}, 0.38)`;
  x.lineWidth = 3;
  x.stroke();
  // The moon's glint: a BROKEN column of thin wavelet streaks along the
  // shaft's tilt — the first bake drew one fat soft ellipse and it read
  // as a glowing egg under the water, not the moon ON it. A glint is
  // structure: short horizontal dashes, near-white, ragged, thinning as
  // they fall away from the moon's point.
  // W2b re-aimed the axis AT THE TOWER'S FOOT (rule 7 — it copied the
  // beam's tilt and pointed at nothing, the frame's one dissenting
  // arrow; every directional element rides the circuit or argues with
  // it).
  x.rotate(0.62);
  const pale = new THREE.Color(pal.moon).lerp(new THREE.Color('#ffffff'), 0.45);
  const dashes = 9;
  for (let i = 0; i < dashes; i++) {
    const v = i / (dashes - 1);
    const py = -size * 0.19 + v * size * 0.33;
    const w = (0.045 + rnd() * 0.05) * size * (1 - 0.45 * v);
    const hgt = 2 + rnd() * 2.2;
    const px = size * 0.03 + (rnd() - 0.5) * size * 0.05 * (0.4 + v);
    const a = 0.72 * (1 - 0.55 * v) * (0.75 + rnd() * 0.25);
    const dg = x.createLinearGradient(px - w / 2, 0, px + w / 2, 0);
    dg.addColorStop(0, 'rgba(0,0,0,0)');
    dg.addColorStop(0.5, `rgba(${(pale.r * 255) | 0}, ${(pale.g * 255) | 0}, ${(pale.b * 255) | 0}, ${a})`);
    dg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = dg;
    x.fillRect(px - w / 2, py - hgt / 2, w, hgt);
  }
  // Three reflected wisps: faint, cool, still.
  for (let i = 0; i < 3; i++) {
    const px = (rnd() - 0.5) * size * 0.6, py = (rnd() - 0.5) * size * 0.5;
    const bg = x.createRadialGradient(px, py, 0, px, py, 3.5);
    bg.addColorStop(0, `rgba(${(bank.r * 255) | 0}, ${(bank.g * 255) | 0}, ${(bank.b * 255) | 0}, 0.22)`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = bg;
    x.fillRect(px - 4, py - 4, 8, 8);
  }
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    // UNLIT by design: a mirror's light is what it reflects, and the bake
    // IS the reflection — routing it through scene lighting turned the
    // whole pool into whatever the distant lamp made of it (a dark disc
    // with a lit lump). MeshBasic + scene fog keeps the bake's values.
    new THREE.MeshBasicMaterial({
      map: tex(c), transparent: true, depthWrite: false, fog: true,
    }));
  mesh.scale.set(2.6, 1.75, 1);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(at.x, 0.045, at.z);
  mesh.renderOrder = 2;
  mesh.name = 'faeMirrorPool';
  // The water breathes a little cool light into the fog above it.
  mesh.userData.emitter = { x: at.x, z: at.z, r: 2.4, gain: 0.45, cr: 0.14, cg: 0.20, cb: 0.24 };
  return mesh;
}

// THE MIST BAND (W2 — the horizon's missing middle tier). The treeline's
// canopy is deliberately void-coloured, and the sky and the distance fog
// are the same void — so the silhouette had nothing to stand against and
// the horizon read as nothing at all. This ring of pale moonlit mist sits
// INSIDE the treeline and BEHIND the glade: canopy humps cut into its top,
// the tower's dark trunk stands against its body. fog:false — it IS the
// atmosphere's backdrop, and letting scene fog eat it would re-create the
// void-on-void it exists to break. Value: tertiary, sub-bloom, monochrome.
function buildMistBand(pal, seed) {
  const w = 1024, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const rnd = mulberry32(seed ^ 0x715b);
  // Vertical profile: nothing at the ground line, a soft peak low, gone by
  // the top — canvas TOP maps to the cylinder's top edge.
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.0, 'rgba(255,255,255,0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.10)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // Horizontal unevenness: broad dark bites so the band is weather, not a
  // painted stripe. Each bite is drawn at its wrapped twin too — the band
  // is a closed cylinder, and an unwrapped bite leaves a seam at u=0.
  // W2b (rule 2): the bites take an azimuth WEIGHTING — the band thins
  // over the moot (the circuit's release point, where the eye rises off
  // the glow into sky) and stays dense behind the pool (whose coupling
  // to the background is the point of its depth). The two u-fractions
  // were settled by LOOK, not derived — the cylinder's uv origin is not
  // worth an equation when one render answers it.
  const U_THIN = 0.63, U_DENSE = 0.40;
  const biteW = (px) => {
    const d = (u0) => Math.min(Math.abs(px / w - u0), 1 - Math.abs(px / w - u0));
    return (1 + 0.9 * Math.exp(-((d(U_THIN) / 0.09) ** 2)))
      * (1 - 0.6 * Math.exp(-((d(U_DENSE) / 0.10) ** 2)));
  };
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const px = rnd() * w, py = h * (0.3 + rnd() * 0.6), s = 40 + rnd() * 90;
    const a = (0.10 + rnd() * 0.22) * biteW(px); // one roll per bite — twins match
    for (const ox of [-w, 0, w]) {
      if (px + ox < -s * 2 || px + ox > w + s * 2) continue;
      const bg = x.createRadialGradient(px + ox, py, 0, px + ox, py, s);
      bg.addColorStop(0, `rgba(0,0,0,${Math.min(0.4, a)})`);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = bg;
      x.fillRect(px + ox - s, py - s, s * 2, s * 2);
    }
  }
  x.globalCompositeOperation = 'source-over';
  const t = tex(c);
  const geo = new THREE.CylinderGeometry(21.5, 21.5, 7.2, 48, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    map: t, color: pal.moonEdge, transparent: true, depthWrite: false,
    side: THREE.BackSide, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 4.4;
  mesh.name = 'faeMistBand';
  mesh.renderOrder = 0;
  return mesh;
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
  g.addColorStop(0, 'rgba(255,255,255,0.26)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.13)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  // Horizontal falloff: multiply alpha toward zero at the left/right
  // edges. The exponent is the beam's LEGIBILITY: at 1.4 over a 15-wide
  // quad the wash covered the whole frame and read as weather, not a
  // beam — a beam is visible where it ISN'T. Tighter curve, narrower quad.
  const img = x.getImageData(0, 0, 128, 128);
  for (let py = 0; py < 128; py++) {
    for (let px = 0; px < 128; px++) {
      const u = px / 127;
      const k = Math.pow(Math.sin(Math.PI * u), 2.4);
      img.data[(py * 128 + px) * 4 + 3] *= k;
    }
  }
  x.putImageData(img, 0, 0);
  const geo = new THREE.PlaneGeometry(9, 26);
  const mat = new THREE.MeshBasicMaterial({
    map: tex(c), color: pal.moon, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // W2: the beam LANDS ON THE RESOLVE AREA (grammar 12 — it used to hang
  // at z −2, backlighting the tower instead of blessing the clearing).
  // Its foot sits in the lamp's pool; the baked gradient dies before die
  // height, so the beam lives in the air and can never haze a result.
  mesh.position.set(0.7, 11, 1.0);
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

// ---------------------------------------------------------------------------
// THE STUMP SHELL — the organic form proof (Joe's reference photo,
// 2026-08-16: a broken hollow stump, frontal wound, splintered crown,
// root flare). NOT the box kit: a parametric displaced shell over a
// (θ, y) grid, because the roundedBox vocabulary that built three good
// towers can only build rectangular towers, and the owner called it —
// "a normal rectangular tower that just has some unconvincing bark
// texture" is exactly what boxes produce here. Everything organic lives
// in ONE radius field:
//
//   r(θ, y) = profile(y)                    the stump's silhouette curve
//           + buttress(θ) · flare(y)        five uneven root lobes
//           + fbm ridges                    vertical fiber striation
//           − wound(θ, y) · fold            the torn-open front, folded
//                                           inward and painted to black
//
// and the crown is a per-column height field y_top(θ) with a few tall
// splinter spires. Vertex colours carry pale barkless wood, moss on the
// shaded side, and the wound's interior dark — no textures needed to
// judge the FORM, which is what this exists to prove.

function fbm1(x, seed) {
  let v = 0, a = 0.5, f = 1;
  for (let o = 0; o < 4; o++) {
    v += a * Math.sin(x * f * 1.7 + seed * (o + 1) * 12.9898);
    a *= 0.5; f *= 2.1;
  }
  return v;
}

export function buildStumpShell(pal, {
  seed = 7, h = 9.2, nTh = 96, nY = 56,
  wound = { at: 1.25, arc: 1.15, y0: 1.1, y1: 5.4, fold: 0.78 },
} = {}) {
  const rnd = mulberry32(seed);
  // Five buttress lobes, uneven by construction (rule 8: nothing symmetric).
  const lobes = [];
  for (let i = 0; i < 5; i++) {
    lobes.push({
      th: (i / 5) * Math.PI * 2 + (rnd() - 0.5) * 0.7,
      amp: 0.55 + rnd() * 0.75,
      w: 0.32 + rnd() * 0.25,
    });
  }
  // Splinter spires: 4 gaussian spikes on the crown, tallest off-centre back.
  const spires = [
    { th: Math.PI * 0.85, amp: 2.6, w: 0.30 },  // tallest, back-left
    { th: Math.PI * 1.35, amp: 1.7, w: 0.26 },
    { th: Math.PI * 0.25, amp: 1.1, w: 0.22 },
    { th: Math.PI * 1.8, amp: 0.8, w: 0.20 },
  ];
  const gauss = (d, w) => Math.exp(-(d * d) / (2 * w * w));
  const angDist = (a, b) => {
    let d = Math.abs(a - b) % (Math.PI * 2);
    return d > Math.PI ? Math.PI * 2 - d : d;
  };
  const profile = (y) => {
    // Fat rooty base, waisted middle, slight kick at the crown break.
    const base = 2.15 + 1.15 * Math.exp(-y / 1.4);
    return base + 0.12 * Math.sin(y * 0.9 + seed);
  };
  const flare = (y) => Math.pow(Math.max(0, 1 - y / 2.6), 1.6);
  const yTop = (th) => {
    let t = h - 1.6 + 0.55 * fbm1(th * 3, seed + 5); // ragged break line
    for (const s of spires) t += s.amp * gauss(angDist(th, s.th), s.w);
    return t;
  };
  const woundMask = (th, y) => {
    const dTh = angDist(th, wound.at) / wound.arc;
    if (dTh > 1) return 0;
    const yr = (y - wound.y0) / (wound.y1 - wound.y0);
    if (yr < 0 || yr > 1) return 0;
    // Ragged boundary: the mask edge is noise-eaten, never a clean arch.
    const edge = 0.18 * fbm1(th * 5 + y * 1.7, seed + 9);
    const m = (1 - dTh + edge) * Math.sin(Math.PI * Math.min(1, Math.max(0, yr + edge * 0.5)));
    return Math.min(1, Math.max(0, m * 1.4));
  };

  const pos = [], col = [], idx = [];
  const wood = { r: 0.40, g: 0.34, b: 0.26 };     // weathered grey-tan, moonlit not bone
  const dark = { r: 0.04, g: 0.035, b: 0.03 };    // the hollow's black
  const moss = new THREE.Color(pal.glowCore).multiplyScalar(0.28); // moss leans the palette's green
  for (let j = 0; j <= nY; j++) {
    for (let i = 0; i <= nTh; i++) {
      const th = (i / nTh) * Math.PI * 2;
      const v = j / nY;
      const y = v * yTop(th);
      let r = profile(y);
      for (const L of lobes) r += L.amp * gauss(angDist(th, L.th), L.w) * flare(y);
      // Fiber striation: high-frequency ridges in θ, slow drift in y.
      r += 0.085 * fbm1(th * 14 + y * 0.35, seed + 2) + 0.05 * fbm1(th * 2 + y * 1.2, seed + 3);
      const m = woundMask(th, y);
      r *= 1 - wound.fold * m;                     // the fold inward
      pos.push(r * Math.cos(th), y, r * Math.sin(th));
      // Colour: wood, striation-shaded, mossed on the shaded arc + roots,
      // and pulled to black inside the wound.
      const stri = 0.85 + 0.15 * Math.sin(th * 24 + fbm1(y, seed) * 3);
      let cr = wood.r * stri, cg = wood.g * stri, cb = wood.b * stri;
      const shadeArc = gauss(angDist(th, Math.PI * 1.05), 0.9);
      const mossK = Math.min(1,
        (0.55 * shadeArc + 0.5 * flare(y)) * (0.5 + 0.5 * fbm1(th * 6 + y, seed + 7)));
      cr += (moss.r - cr) * mossK;
      cg += (moss.g - cg) * mossK;
      cb += (moss.b - cb) * mossK;
      // The wound darkens STEEPLY — a torn mouth, not a bruise: shallow
      // mask values already pull hard toward the interior black.
      const mk = Math.pow(m, 0.6);
      cr += (dark.r - cr) * mk; cg += (dark.g - cg) * mk; cb += (dark.b - cb) * mk;
      col.push(cr, cg, cb);
    }
  }
  for (let j = 0; j < nY; j++) {
    for (let i = 0; i < nTh; i++) {
      const a = j * (nTh + 1) + i, b = a + 1, c = a + nTh + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'faeStumpShell';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildFaeConcept({ paletteId = 'moonrise', seed = 20260815 } = {}) {
  const pal = FAE_PALETTES[paletteId] || FAE_PALETTES.moonrise;
  const group = new THREE.Group();
  group.name = 'faeConcept';
  const ground = buildGround(pal, seed);
  const clearing = buildClearingDetail(pal, seed);
  const sheets = buildFogSheets(pal, seed);
  const moot = buildMoot(pal, seed);
  const pool = buildMirrorPool(pal, seed);
  const wisps = buildWisps(pal, seed);
  const shaft = buildMoonShaft(pal);
  const halos = buildHalos(pal);
  const treeline = buildTreeline(pal, seed);
  const mist = buildMistBand(pal, seed);
  // NO STUMP PROP. The W0 concept plates placed a lab stump at the future
  // socket; when the real Hollow Bole shipped (W3) the venue kept
  // planting the prop underneath it, and the two interleaved into a pale
  // ghost skirt that ate four rounds of misdirected fixes (found by
  // setVisibleByName forensics, not by staring). The tower is the
  // venue's tower now; buildStumpShell survives only as the exported lab
  // reference.
  group.add(ground, clearing, mist, treeline, moot, pool, wisps.points, shaft, halos, ...sheets);
  // Fold the static light — the moot's pools and the mirror pool's cool
  // breath — into the fog base (techniques §6).
  brightenFog(sheets, [...moot.userData.pools, pool.userData.emitter]);
  for (const s of sheets) s.userData.base = s.geometry.attributes.color.array.slice();
  // The layout, reported through venueInfo() so proofs read placement
  // numbers off the stage instead of hardcoding them (the tower-probe
  // lesson): flank props must sit beyond the widest back wall and clear
  // of the tower envelope; the beam must land on the clearing.
  const layout = {
    // rx/rz are the props' ground half-extents, so the placement law can
    // be asserted about the NEAREST point, not the centre.
    moot: { x: moot.userData.at.x, z: moot.userData.at.z, rx: 2.8, rz: 1.7 },
    pool: { x: pool.position.x, z: pool.position.z, rx: pool.scale.x, rz: pool.scale.y },
    shaft: { x: shaft.position.x, z: shaft.position.z },
    sheetYs: sheets.map((s) => s.position.y),
    veilHole: 7,
  };
  return { group, pal, sheets, wisps, halos, moot, pool, mist, layout };
}
