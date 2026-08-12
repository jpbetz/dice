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

// THE STUMP SHELL — the organic half of the Hollow Bole (ROADMAP W3).
// js/towerhollow.js owns the CONTRACT and the DRESSING and takes its shell
// through one seam (`shell(ctx) → SURFACE descriptor`); this module is
// that shell, built to Joe's reference photo: a broken hollow stump —
// frontal wound, splintered crown, root flare — as a parametric displaced
// surface over a (θ, y) grid, because the box kit's vocabulary is
// architecture and the owner called its output in advance ("a normal
// rectangular tower that just has some unconvincing bark texture").
//
// Everything organic is ONE radius field
//     r(θ, y) = profile(y) + buttress(θ)·flare(y) + fiber fbm + brow(θ,y)
// with a per-column crown height y_top(θ) (splinter spires + a torn front
// BLADE), and the PORT — the doorway — cut from the index buffer as a
// ragged real hole, never a narrowed aperture.
//
// The four numbers the proofs forced (all measured, none styled):
//   · the blade arc carries a HARD floor at y 11.4 — the front must stay
//     opaque above y 11.25 (occlusion probe, wide eyeFull), and a gaussian
//     that is tall on average still leaked exactly one ray;
//   · the port mask is front-arc only — the first cut cheerfully tore a
//     matching hole in the BACK of the tree;
//   · the port boundary starts at |x| 2.62 with rag eating OUTWARD, so the
//     doorway's 2.5 half-width is never narrowed by a fiber;
//   · the liner's +z half squeezes ×0.9 — a round liner crossed the socket
//     front plane by 0.044 and the fit probe said so.
//
// This mesh is EXCLUDED from the AO/weather enrollment on purpose:
// bakeVertexAO REPLACES the color attribute, and this shell's vertex
// colors are load-bearing (moss arc, lichen freckles, torn-fiber rim, the
// wound's steep pull to interior black). Its self-shadowing is built into
// the field instead — the fold and the bowl darken by construction.

import * as THREE from 'three';
import { mulberry32, fbm, clamp01, smoothstep } from './towerskin.js';

function angDist(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
const gauss = (d, w) => Math.exp(-(d * d) / (2 * w * w));

export function buildStumpShell(ctx) {
  const { v, MAT, UV, rnd, add, parts } = ctx;
  const S = v.S, z0 = v.z0;
  const boreZ = v.shaft.c[2];
  const xLim = v.socket.s[0] / 2;
  const zFrontLim = v.socket.c[2] + v.socket.s[2] / 2;
  const zBackLim = v.socket.c[2] - v.socket.s[2] / 2;
  const yLim = v.socket.c[1] + v.socket.s[1] / 2;
  const sill = v.hood.c[1] - v.hood.s[1] / 2;
  const doorX = v.door.w / 2;
  const doorY = v.door.h;

  const seed = 0x57e9;
  const srnd = mulberry32(seed);
  const FRONT = Math.PI / 2;
  const d = {
    // The axis sits WELL BEHIND the bore (VENUE GROUNDS, the audit's new
    // named class): the engine's volumes stay exactly where they are,
    // invisible, and the body wraps AROUND them — bowl swallowing the
    // shaft off-centre, wound framing the doorway. With the glade behind
    // it instead of a room wall, front reach 3.05 / back 3.28 / sides
    // 3.13: the stump is finally as deep as it is wide.
    axisZ: boreZ - 0.9,
    rCeil: xLim - 0.12,
    rFloor: v.shaft.r + 0.28,
    linerR: v.shaft.r + 0.13,
    ezF: ((zFrontLim - boreZ) - 0.10) / (xLim - 0.12),
    ezB: ((boreZ - zBackLim) - 0.12) / (xLim - 0.12),
    rimY: 7.0 * S,
    bladeFloor: 11.4,            // the measured cowl bar 11.25 + margin
    spireMax: yLim - 0.16,
    // The mouth clears the dice's measured flight envelope (|x| ≤ ~1.9:
    // 0.4 jitter + tan12°·travel + d20 radius — TOWER.md §5), NOT the
    // engine's 5.0-wide collider gap. Cutting to the collider gap tore
    // off the round trunk's whole lower face and the venue frame showed
    // a black rectangle wearing a tree. The wound is tall and narrow,
    // like the photo.
    port: { hw: 2.05, y0: 0.05, y1: doorY + 0.35 },
    browY: [doorY + 0.5, 6.9 * S / 1.25],
    despawnY: v.despawnY,
  };

  // =========================================================================
  // THE FIBER BUNDLE (the stop-ship rebuild, Joe: "an unconvincing graft
  // between a cylinder and the actual stump... back up and find a new
  // approach"). The old field was base-cylinder + bottom lobes + cosmetic
  // noise — three vocabularies stitched at their seams, and the seams
  // showed. This field has ONE vocabulary: ~12 continuous vertical RIDGES,
  // each with a single identity along its whole length —
  //     buttress at the foot → furrow through the waist → tear-spire at
  //     the crown, the same crest line all the way up, drifting slightly
  //     in θ with height (the twist of grain).
  // The crown tears ALONG the ridges (a spire is a fiber that kept going),
  // the buttresses ARE the ridges widening at the soil, and the moss will
  // pool in the valleys BETWEEN them — nothing is pasted onto anything.
  // =========================================================================
  const N_RIDGE = 12;
  const ridges = [];
  {
    let thAcc = 0.45;
    for (let i = 0; i < N_RIDGE; i++) {
      thAcc += (Math.PI * 2 / N_RIDGE) * (0.72 + 0.56 * srnd());
      ridges.push({
        th: thAcc,
        w: 0.15 + srnd() * 0.09,        // crest half-width
        butt: 0.35 + srnd() * 0.95,     // buttress strength at the foot
        fiber: 0.20 + srnd() * 0.24,    // mid-height relief — deep enough to SILHOUETTE
        spire: srnd() * srnd(),         // who continues into the tear (few do)
        lean: (srnd() - 0.5) * 0.30,    // grain twist: crest drifts with height
      });
    }
    // One dominant tear, never centred: boost the ridge nearest back-left.
    let best = ridges[0];
    for (const R of ridges) {
      if (angDist(R.th, FRONT + Math.PI * 0.78) < angDist(best.th, FRONT + Math.PI * 0.78)) best = R;
    }
    best.spire = 1.35;
  }
  const crestAt = (R, y) => R.th + R.lean * (y / 10);

  // THE BASE CURVE — a real stump's taper, through MEASURED free volume
  // (skill §1.5 applied harder than the declared volumes): dice DESPAWN at
  // y 7, so below ~6.4 the shaft carries nothing and the wall may pinch to
  // ~2.05; above 6.4 it stays outside the falling lane (2.32 floor); the
  // shoulder swells back out to carry the shaft band and the cowl.
  const base = (y) => 2.45
    + 1.05 * Math.exp(-y / (1.05 * S))              // the foot
    + 0.42 * smoothstep(5.6, 7.3, y)                 // the shaft shoulder
    + 0.05 * Math.sin(y * 0.7 + 2.1);
  const flare = (y) => Math.pow(Math.max(0, 1 - y / (2.3 * S)), 1.5);
  const crownK = (y) => smoothstep(d.rimY - 2.2, d.rimY + 0.5, y);
  const ridgeAmp = (R, y) =>
    R.butt * 0.5 * flare(y)
    + R.fiber * (1 - flare(y) * 0.5)
    + R.spire * 0.22 * crownK(y);
  // Crest profile: sharper than a gaussian — furrows, not ripples.
  const crest = (dist, w) => Math.pow(gauss(dist, w), 0.72);

  const yTop = (th) => {
    // The rim rides the fibers: high over spire-ridges, sagging in the
    // valleys — the tear happens along the grain.
    let t = d.rimY - 0.9 + 0.35 * fbm(th * 2.3, 3.7, 8, 3, seed + 5);
    for (const R of ridges) {
      const k = crest(angDist(th, crestAt(R, d.rimY)), R.w * 1.35);
      t += (0.4 + 3.4 * R.spire) * k * R.spire;
      t -= 0.55 * (1 - k) * (1 / N_RIDGE);          // valleys sag between fibers
    }
    // The cowl's hard floor across the blade arc (measured bar y 11.25):
    // inside it the tear still varies, but only UPWARD from the floor.
    if (angDist(th, FRONT) < 1.45) {
      t = Math.max(t, d.bladeFloor
        + 0.55 * Math.abs(fbm(th * 3.1, 1.3, 8, 3, seed + 6)));
    }
    return Math.min(t, d.spireMax);
  };

  const radius = (th, y) => {
    let r = base(y);
    for (const R of ridges) {
      r += ridgeAmp(R, y) * crest(angDist(th, crestAt(R, y)), R.w);
    }
    // Fine grain only — the ridges carry the form now.
    r += 0.045 * fbm(th * 5.1, y * 0.33, 8, 4, seed + 2);
    // The brow over the mouth (unchanged duty, gentler hand).
    const browK = smoothstep(d.browY[0], d.browY[0] + 0.7, y)
      * (1 - smoothstep(d.browY[1] - 0.7, d.browY[1], y))
      * gauss(angDist(th, FRONT), 0.62);
    r += 0.35 * browK;
    // The cowl bulge (the sign-of-the-term lesson stands): the blade must
    // hold real wood IN FRONT of the probe's z0-plane samples.
    const cowlK = gauss(angDist(th, FRONT), 0.8) * smoothstep(7.3, 8.0, y)
      * (1 - smoothstep(11.6, 12.1, y));
    if (cowlK > 0.4) r = Math.max(r, 2.98 + 0.05 * cowlK);
    // Directional ceiling: x has the mat's wall (capped by COMPONENT —
    // a sign-based cap leaked crests to x 3.32 on the back quarter-arcs),
    // the BACK has the glade.
    const xCap = (xLim - 0.15) / Math.max(0.05, Math.abs(Math.cos(th)));
    r = Math.min(r, xCap, Math.sin(th) < -0.3 ? 3.42 : d.rCeil);
    // Measured free volume, not declared — and DIRECTIONAL: the bore sits
    // 0.9 in front of the axis, so the wall stands farther out toward the
    // front (thin margin there — the front wall threads between the
    // bore's face at z0+0.125 and the socket's at z0+0.25, as every
    // tower's cowl always has).
    if (y > 6.35) {
      const s = Math.max(0, Math.sin(th));
      r = Math.max(r, v.shaft.r + 0.9 * s + 0.2 - 0.17 * s);
    }
    return r;
  };
  // TWO functions, one field — and the difference is the whole bug class:
  // rawPoint is the SURFACE (the mesh's own vertices; the cowl bulge must
  // genuinely reach z0+0.13 to stand in front of the probe's samples), and
  // surfPoint is the PROP ANCHOR the descriptor exports, clamped 0.18
  // behind the front plane so a prop's own body never crosses the socket.
  // The first draft ran the mesh through the clamped version — which
  // quietly pulled the shell's whole front face behind the very samples
  // it existed to occlude, and no amount of radius arithmetic could
  // matter after that.
  const rawPoint = (th, y, inset = 0) => {
    const r = radius(th, y) - inset;
    // Z-CLAMP, not z-scale: the old ellipse multiplied every z by 0.687,
    // which flattened the WHOLE front into a plane even where the radius
    // had room to curve. Clamping instead keeps the trunk round wherever
    // it fits and flattens only the arc that would actually leave the
    // socket — which is what a real trunk grown against a wall does.
    const zAvail = Math.sin(th) >= 0
      ? (zFrontLim - d.axisZ) - 0.10
      : (d.axisZ - (z0 - 6.3)) - 0.12;   // the glade, not the socket's back
    return [r * Math.cos(th), y,
      d.axisZ + Math.sin(th) * Math.min(r, zAvail)];
  };
  const surfPoint = (th, y, inset = 0) => {
    const p = rawPoint(th, y, inset);
    p[2] = Math.min(p[2], z0 - 0.18);
    // Anchor margin in x as well as z: a prop's own body (caps run to
    // ~0.4) extends past its anchor, and two crown pieces crossed the
    // mat wall by 0.07 exactly that way.
    const xm = xLim - 0.55;
    if (Math.abs(p[0]) > xm) p[0] = Math.sign(p[0]) * xm;
    return p;
  };
  const portMask = (wx, y, sth) => {
    if (sth < -0.1) return 0;                       // FRONT arc only
    const rag = 0.34 * Math.abs(fbm(wx * 0.9 + 7, y * 0.8, 8, 4, seed));
    return (Math.abs(wx) < d.port.hw + rag
      && y > d.port.y0 && y < d.port.y1 + rag * 1.4) ? 1 : 0;
  };

  // --- the shell mesh ------------------------------------------------------
  const nTh = 128, nY = 72;
  const pos = [], col = [], uv = [], idx = [], mask = [];
  // The VERTICES carry the vertical value ramp (silvered top, mid trunk,
  // dark damp foot); the atlas tiles too fast vertically to hold a
  // gradient, and letting it try is what split the skirt from the trunk
  // into two materials. One ramp, one organism.
  const woodAt = (y) => {
    const t = clamp01(y / 11);
    const k = 0.5 + 0.38 * smoothstep(0.12, 0.75, t);
    return { r: k * 1.06, g: k, b: k * 0.87 };
  };
  const dark = { r: 0.08, g: 0.075, b: 0.065 };
  // Moss leans the sky's green — read from the caps material's emissive,
  // which towerhollow already built from the active palette.
  const mossC = MAT.caps.emissive.clone().multiplyScalar(0.55);
  const moss = { r: Math.min(0.5, mossC.r + 0.1), g: Math.min(0.62, mossC.g + 0.16), b: Math.min(0.5, mossC.b + 0.1) };
  const lich = { r: 0.92, g: 1.0, b: 0.94 };
  for (let j = 0; j <= nY; j++) {
    for (let i = 0; i <= nTh; i++) {
      const th = (i / nTh) * Math.PI * 2 - Math.PI / 2; // seam at the BACK
      const t = yTop(th);
      const y = (j / nY) * t;
      const [wx, wy, wz] = rawPoint(th, y);
      const m = portMask(wx, y, Math.sin(th));
      mask.push(m);
      pos.push(wx, wy, wz);
      uv.push((th + Math.PI / 2) * 2.8 / UV.bark[0], y / UV.bark[1]);
      // Bowl interior + wound shade by construction: the crown bowl's
      // inner band and the brow's underside darken like AO would, without
      // letting the AO pass clobber the layered colors.
      const bowlK = smoothstep(t - 1.6, t - 0.15, y) * 0.35;
      const wood = woodAt(y);
      let cr = wood.r * (1 - bowlK), cg = wood.g * (1 - bowlK), cb = wood.b * (1 - bowlK);
      const shadeArc = gauss(angDist(th, FRONT + Math.PI * 0.85), 0.85);
      // Moss pools in the VALLEYS between fibers; lichen crusts the
      // crests that catch the moon. One field drives form and growth
      // both — which is what "integrate the tree fully" means.
      let crestK = 0;
      for (const R of ridges) {
        crestK = Math.max(crestK, crest(angDist(th, crestAt(R, y)), R.w));
      }
      const mossK = clamp01((0.6 * shadeArc + 0.55 * flare(y))
        * (0.45 + 0.55 * fbm(th * 2.2, y * 0.5, 8, 3, seed + 7)))
        * (0.35 + 0.65 * (1 - crestK));
      cr += (moss.r - cr) * mossK * 0.85;
      cg += (moss.g - cg) * mossK * 0.85;
      cb += (moss.b - cb) * mossK * 0.85;
      const lichK = clamp01((y / (7 * S / 1.25)) - 0.35)
        * smoothstep(0.55, 0.9, fbm(th * 5.1, y * 0.9, 8, 3, seed + 11))
        * (0.35 + 0.65 * crestK) * 0.6;
      cr += (lich.r - cr) * lichK;
      cg += (lich.g - cg) * lichK;
      cb += (lich.b - cb) * lichK;
      // The skirt is DAMP: near the soil the wood darkens and mosses
      // hard — the first venue frames rendered the flare as bone-white
      // sand under the moon pool.
      const dampK = clamp01(1 - y / 2.6) * 0.9;
      cr *= 1 - 0.45 * dampK;
      cg *= 1 - 0.35 * dampK;
      cb *= 1 - 0.42 * dampK;
      cr += (moss.r - cr) * dampK * 0.5;
      cg += (moss.g - cg) * dampK * 0.5;
      cb += (moss.b - cb) * dampK * 0.5;
      col.push(cr, cg, cb);
    }
  }
  const at = (j, i) => j * (nTh + 1) + i;
  for (let j = 0; j < nY; j++) {
    for (let i = 0; i < nTh; i++) {
      const a = at(j, i), b = at(j, i + 1), c = at(j + 1, i), e = at(j + 1, i + 1);
      const inside = mask[a] + mask[b] + mask[c] + mask[e];
      if (inside === 4) continue;                   // the torn mouth
      if (inside > 0) {
        for (const vi of [a, b, c, e]) {            // torn-fiber rim, pale
          col[vi * 3] = Math.min(1, col[vi * 3] * 1.5 + 0.12);
          col[vi * 3 + 1] = Math.min(1, col[vi * 3 + 1] * 1.45 + 0.1);
          col[vi * 3 + 2] = Math.min(1, col[vi * 3 + 2] * 1.3 + 0.06);
        }
      }
      idx.push(a, c, b, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // FRONT faces only for the bark — and a near-black unlit twin turned
  // INWARD. The bowl's open crown pours moonlight onto the interior back
  // wall, and a DoubleSide shell showed that wall pale THROUGH the mouth:
  // the "pale skirt" that survived four rounds of skirt fixes was never
  // the skirt. A hollow's inside is rot-dark whatever the sky does, so
  // the interior is a MATERIAL fact here, not a lighting outcome.
  const shellMat = MAT.bark.clone();
  shellMat.side = THREE.FrontSide;
  const shell = new THREE.Mesh(geo, shellMat);
  shell.name = 'boleShell';
  add(shell);
  parts.splice(parts.indexOf(shell), 1);            // colors are load-bearing
  const innerDark = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0x090b09, side: THREE.BackSide,
  }));
  innerDark.name = 'boleInnerDark';
  add(innerDark);
  parts.splice(parts.indexOf(innerDark), 1);

  // --- the liner: the dark inside ------------------------------------------
  {
    const ln = 64, lm = 24, lpos = [], lcol = [], lidx = [], lmask = [];
    // The liner stops at 6.5: through the mouth at the shipped down-angle
    // you could see its back wall all the way to 8.6, a tall glowing
    // backdrop. Above 6.5 the lining tube's true black takes over — the
    // shaft stays a void, the cavity stays a cavity.
    const y0 = 0.3, y1 = 6.5;
    for (let j = 0; j <= lm; j++) {
      for (let i = 0; i <= ln; i++) {
        const th = (i / ln) * Math.PI * 2 - Math.PI / 2;
        const y = y0 + (j / lm) * (y1 - y0);
        // The liner is an INNER OFFSET of the same fiber field — it
        // follows the taper (a fixed-radius tube poked through the new
        // waist) and inherits the furrows, so the glowing rot inside
        // ribs like the outside does.
        const r = radius(th, y) - 0.16
          + 0.05 * fbm(th * 3, y * 0.5, 8, 3, seed + 21);
        const wx = r * Math.cos(th);
        // Same z-clamp as the shell, 0.06 tighter — the liner is the
        // inside of the same wall and must never poke through it.
        const zA = (Math.sin(th) >= 0
          ? (zFrontLim - d.axisZ) - 0.16
          : (d.axisZ - (z0 - 6.3)) - 0.18);
        const wz = Math.sin(th) * Math.min(r, zA);
        // The liner's hole is barely wider than the shell's mouth — its
        // torn rim is MEANT to peek: the glowing rot wall just inside the
        // opening is what makes the cavity read as a cavity. (First cut
        // was +0.45 wider "so the rim never peeks", which guaranteed the
        // only thing visible through the mouth was the black veil.)
        lmask.push((Math.abs(wx) < d.port.hw + 0.08 && Math.sin(th) > 0
          && y > d.port.y0 - 0.2 && y < d.port.y1 + 0.4) ? 1 : 0);
        lpos.push(wx, y, d.axisZ + wz);
        // Visible torn fiber, not a void: the reference cavity catches
        // light on its ribs. Vertical streaks ride the fbm; the floor of
        // the brightness keeps the hollow READING as deep shadow.
        const rib = Math.pow(Math.abs(Math.sin(th * 9 + fbm(th, y, 4, 2, seed + 24) * 3)), 3);
        const k = 0.10 + 0.10 * fbm(th * 8, y, 8, 2, seed + 23) + 0.10 * rib;
        lcol.push(k, k * 0.92, k * 0.85);
      }
    }
    const lat = (j, i) => j * (ln + 1) + i;
    for (let j = 0; j < lm; j++) {
      for (let i = 0; i < ln; i++) {
        const a = lat(j, i), b = lat(j, i + 1), c = lat(j + 1, i), e = lat(j + 1, i + 1);
        if (lmask[a] + lmask[b] + lmask[c] + lmask[e] === 4) continue;
        lidx.push(a, c, b, b, c, e);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lpos), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lcol), 3));
    lg.setIndex(lidx);
    lg.computeVertexNormals();
    // On-policy envMapIntensity: at vertex colours ~0.05 the environment
    // contributes nothing visible, and the fit audit's material policy
    // stays a strict deepEqual([]) instead of growing an exception list.
    //
    // THE ROT GLOWS. No light reaches the cavity (the moon is blocked by
    // the very trunk that makes it a cavity) and a lightless
    // MeshStandardMaterial is a black rectangle — the exact thing Joe
    // flagged. The venue's answer is ecological, not electrical: foxfire
    // IS decaying wood, so the liner carries a faint emissive of the
    // palette's glow over the punk bake's mottle. Tertiary tier (max
    // ~0.1 linear through the near-black vertex colours) — it can never
    // bloom, never contest a die; it just makes the hollow READ.
    const lmat = MAT.punk.clone();
    lmat.side = THREE.DoubleSide;
    // 0.07, not 0.32 — and the lesson is a three.js fact worth keeping:
    // emissive is NOT multiplied by vertex colours, so "faint glow through
    // near-black walls" rendered as a full-brightness teal lampshade
    // filling the whole cavity. The MATERIAL's intensity is the only knob
    // that actually dims it.
    lmat.emissive = MAT.gills.emissive.clone(); // glowCore — deeper than the caps' mint
    lmat.emissiveMap = lmat.map;
    lmat.emissiveIntensity = 0.07;
    const liner = new THREE.Mesh(lg, lmat);
    liner.name = 'boleLiner';
    add(liner);
    parts.splice(parts.indexOf(liner), 1);          // stays void-dark
  }

  // --- the chute and tray, clad in dark rot ---------------------------------
  // The placeholder's cladding died with the placeholder, which left the
  // engine ramp NAKED — and the invisible collider showed as dice riding
  // nothing. Clad exactly on the engine boxes (zero colliders), darkened
  // INTO the trunk by vertex gradient: the mood lamp casts no shadows, so
  // the hollow's darkness has to live in the vertices, not the light.
  {
    const clad = (box, uvv, gradFrom, gradTo) => {
      const g = new THREE.BoxGeometry(box.s[0], box.s[1], box.s[2]);
      const p = g.attributes.position;
      const cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const k = 0.07 + 0.93 * clamp01((p.getZ(i) - gradFrom) / (gradTo - gradFrom));
        cols[i * 3] = k; cols[i * 3 + 1] = k * 0.95; cols[i * 3 + 2] = k * 0.88;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const m = MAT.punk.clone();
      m.vertexColors = true;
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(...box.c);
      if (box.rx) mesh.rotation.x = box.rx;
      add(mesh);
      parts.splice(parts.indexOf(mesh), 1);   // the gradient is load-bearing
      return mesh;
    };
    clad(v.apron, 1.7, -1.2, 2.6);            // ramp: black inside, moonlit outrun
    clad(v.lip, 1.0, -1.4, 0.2);              // tray: mostly lit
  }

  // --- roots: the buttress ridges run out onto the ground -------------------
  // (Joe: "Roots?") Each big lobe extends as a low tapering ridge — a
  // displaced cone lying radially, sunk to half depth. Front ridges stop
  // short of the chute lane (|x| ≤ 1.9 slide must stay clean); the ridge
  // under the doorway is the SILL — it dips toward the felt (FOOT DIP).
  for (const R of ridges) {
    // Only the strong buttress-fibers run out as ground roots, and each
    // root CONTINUES its own ridge's crest line — the same grain leaving
    // the trunk. Front-arc ridges get none: the apron lane stays a clean
    // slide.
    if (R.butt < 0.75) continue;
    const rootTh = crestAt(R, 0.2);
    if (Math.sin(rootTh) > 0.35) continue;
    const L = { th: rootTh, amp: R.butt * 0.8 };
    const rad = 0.34 + L.amp * 0.18;
    let along = 1.3 + L.amp * 1.3;
    // The tip must die inside the socket on every axis it travels.
    const r0 = radius(L.th, 0.3) - 0.4;
    const cz = Math.sin(L.th) >= 0 ? d.ezF : d.ezB;
    const maxX = (d.rCeil - 0.05 - r0 * Math.abs(Math.cos(L.th))) / (Math.abs(Math.cos(L.th)) || 1);
    const maxZ = ((Math.sin(L.th) >= 0 ? d.ezF : d.ezB) * d.rCeil - 0.05
      - r0 * Math.abs(Math.sin(L.th)) * cz) / ((Math.abs(Math.sin(L.th)) * cz) || 1);
    along = Math.min(along, Math.max(0.6, Math.min(maxX, maxZ)));
    const rg = new THREE.ConeGeometry(rad, along, 7, 4);
    rg.rotateZ(-Math.PI / 2);                       // +y cone → lying along +x
    const p = rg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const k = 1 + 0.28 * fbm(px * 1.8, pz * 2.1 + i * 0.003, 6, 3, seed + 31);
      p.setXYZ(i, px, py * 0.55 * k, pz * k);       // squashed: a ridge, not a log
    }
    rg.computeVertexNormals();
    const ridge = new THREE.Mesh(rg, MAT.bark);
    const dist = r0 + along / 2 - 0.35;
    // Lifted so the squashed cone's belly grazes the ground instead of
    // sinking through it — the fit probe found two ridges at y −0.18.
    ridge.position.set(
      Math.cos(L.th) * dist, rad * 0.78,
      d.axisZ + Math.sin(L.th) * dist * cz);
    ridge.rotation.y = -L.th;                       // +x swung to the lobe's angle
    add(ridge);
  }

  // --- the descriptor ------------------------------------------------------
  const R0 = base(4.0);
  return {
    S, z0,
    zc: d.axisZ, rIn: d.rFloor, R0,
    rOut: (th) => radius(th, 4.0),
    yRing: d.bladeFloor,
    // zFI is "the back of the front plane" in the seam's semantics — the
    // lining tube trims its front arc at acos((zFI−zc)/r) and its black
    // back plane sits at zFI−0.012. Two wrong answers taught its range:
    // the liner's outer z (z0+0.255) hung the lining out the socket, and
    // z0+0.02 hung the naked black plane IN FRONT of the shell — the
    // whole trunk rendered as a black monolith. z0−0.6 tucks the black
    // deep behind the shell's own front wall (brow band reaches z0+0.13),
    // where it does its real job: a void backdrop seen only through the
    // port's ragged top.
    // z0−1.2, the third and right answer: deep enough that the lining
    // tube's front trim opens past the mouth (no black side strips), and
    // the doorway veil recedes INTO the throat — perspective shrinks it
    // to a black core with glowing rot walls around it, which is exactly
    // the reference photo's depth gradient. It still sits just in front
    // of the exit spawn (z0−1.5), so the spawn stays veiled.
    zFO: z0 + 0.12, zFI: z0 - 1.2,
    // doorX narrowed to the mouth: the seam sizes the doorway VEIL off
    // this, and a veil cut to the engine's 5-wide collider gap papered
    // the whole mouth black. 2.05 clears the measured flight envelope
    // (~1.9) with margin and matches the port.
    sill, doorX: 2.05, doorY, xLim,
    at: (th, y, inset = 0) => surfPoint(th, y, inset),
    // No flat facade: the front is the wound. Props always land on the
    // curve, which is what an organic trunk wants anyway.
    inFacade: () => false,
    facade: {
      aL: -(d.port.hw), aR: d.port.hw,
      yLow: d.port.y0, yTop: d.port.y1, zFace: z0 + 0.12,
    },
    // The little door lives in the flank of the strongest front-right
    // buttress-fiber — only the shell knows where its grain runs.
    doorPad: (() => {
      let best = null;
      for (const R of ridges) {
        const th = crestAt(R, 1.3);
        if (Math.sin(th) > -0.2 && Math.cos(th) > 0
          && (!best || R.butt > best.butt)) best = R;
      }
      const th = crestAt(best || ridges[0], 1.3);
      const [px, py, pz] = surfPoint(th - 0.12, 1.3, 0.05);
      return { x: px, y: py, z: pz };
    })(),
  };
}
