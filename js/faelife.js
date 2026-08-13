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

// THE LIVING LAYER (ROADMAP Tier W5). A venue's inhabitants: a firefly
// FIELD that says the place is alive, and a few WISPS that say somebody
// lives here. VENUE-COMPOSITION.md's rule 13 draws the line this module
// sits on the far side of — the scenery tier is static tissue, and
// "living things — wisps, fireflies, the moot in session — are the
// LIVING LAYER's tier". This is that tier.
//
// THE ONE LAW, and it is what makes the layer legal rather than merely
// pretty: NOTHING ALIVE EVER CROSSES THE DICE BOX. Every firefly and
// every wisp stays outside the widest mat's walls in plan, at every
// instant, enforced by a clamp rather than trusted to the waypoints.
// Three doctrines collapse into that one sentence:
//   · rule 1 (one hero, and dice outrank it) — nothing alive can sit
//     between the eye and a result, because nothing alive is ever over
//     the felt.
//   · GOALS goal 15 (atmosphere serves the roll) — the legibility laws
//     are about the volume dice occupy; stay out of it and there is no
//     way to haze a face.
//   · the placement law (venue-set) — the flanks and the back band are
//     already the dice-unreachable ground, so the life inherits the
//     staging the composition already proved.
//
// The SECOND thing that keeps it legal is behavioural, and it is the
// mood: the glade DIMS while dice are the brightest thing in the frame
// and leans in once they are readable. The table state that drives it
// lives in main.js (it is the caller's job to know what a roll is
// doing); this module takes three scalars and is otherwise a pure
// function of the accumulated clock — same discipline as motes.js, so
// `holdClock` freezes the glade and `sim(n)` steps it.
//
// THE BUDGET IS ALREADY SPENT, and it is the reason this layer is shaped
// the way it is. A census of the glade with the tower up and dice down
// (2026-08-13) counts NINE countable sources against the spec's ceiling
// of nine, and two glow hues plus one warm accent against a limit of
// exactly that. So the living layer may not add a single countable
// source, and every member of it must wear the teal family:
//   · the FIELD (fireflies) is tertiary — peak ≤0.25 linear, and
//     grayscale per point so the hue lives in ONE material and cannot
//     drift. Fields are exempt from the count only while they stay
//     monochrome, which is a property worth asserting rather than
//     intending.
//   · the WISPS are a PROCESSION, not a swarm: ONE lead at the
//     secondary tier — which is not a new source, it REPLACES the lead
//     wisp the stage has carried since W0 — and a few followers held
//     down at the field's tertiary ceiling. Size and falloff separate
//     them from the fireflies, not brightness. A second bright wisp
//     would be a tenth source, and there is no room for one.
// The lead carries the venue's single dynamic light, which is the spec's
// own allowance ("ONE lead wisp with the venue's single dynamic light
// and a heading") — every other light in the glade belongs to the moon,
// to a die, or to the tower's ember door.
//
// Venue-generic on purpose: zones, the circuit and the box come in as
// options, so a second venue's life is a different table of numbers
// rather than a second module.

import * as THREE from 'three';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A soft round sprite. Two are baked: the field's is a hard little core
// (a firefly is a POINT of light) and the wisp's carries a wide halo (a
// wisp is a lantern in mist). The difference in falloff is most of what
// makes two populations read as two species rather than two sizes.
function bakeGlint(size, coreStop, coreAlpha) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(coreStop, `rgba(255,255,255,${coreAlpha})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Catmull-Rom through a CLOSED ring of waypoints. The wisps ride one
// shared loop at different phases and speeds — a shared path is what
// makes them read as a species with a route through this place, where
// independent random walks read as bugs in a jar.
function loopAt(pts, u) {
  const n = pts.length;
  const s = ((u % 1) + 1) % 1 * n;
  const i = Math.floor(s), f = s - i;
  const p0 = pts[(i - 1 + n) % n], p1 = pts[i % n];
  const p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
  const f2 = f * f, f3 = f2 * f;
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * f
    + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
  return [cr(p0[0], p1[0], p2[0], p3[0]),
    cr(p0[1], p1[1], p2[1], p3[1]),
    cr(p0[2], p1[2], p2[2], p3[2])];
}

// THE BACKSTOP. The waypoints and zones below all clear the box with
// margin, so this should never fire — which is exactly why it is here.
// A law held by a clamp survives the next person editing the numbers;
// a law held by good waypoints does not. Pushes in Z first (the glade's
// life all lives beyond the back wall) and only sideways for the
// foreground wing, so a clamped point slides along the band it belongs
// to instead of jumping across the clearing.
function keepOut(p, box) {
  const hx = box.hx + box.margin, hz = box.hz + box.margin;
  if (Math.abs(p[0]) >= hx || Math.abs(p[2]) >= hz) return p;
  if (p[2] > 0) p[2] = hz;                       // fore band: push forward
  else p[2] = -hz;                               // everything else: back
  return p;
}

// The dials, with the reasoning that picked them. The caller copies this
// into a mutable tune so `lifeTune()` can move any of it live — the
// numbers below are a starting position, not a contract.
export const LIFE_TUNE = {
  // THE FIELD
  count: 110,          // enough that ~15 are lit at once at blinkPow 6
  size: 0.17,          // a firefly is a point; the halo belongs to wisps
  peak: 0.22,          // TERTIARY CEILING is 0.25 — this is the gate, not taste
  blinkPow: 6,         // the spec's own number: dark ~5/6 of the cycle
  blinkHz: 0.22,       // ×0.6–1.5 per fly → a flash every 3–8 s
  wander: 0.45,        // slow drift; the blink does the work, not the travel
  // THE PROCESSION
  wispCount: 4,        // one lead + three followers. A fifth would be a swarm
  wispSize: 0.46,
  leadPeak: 0.55,      // SECONDARY — and it replaces the stage's old lead,
  wispPeak: 0.20,      // so the countable-source census does not move
  wispLoopSec: 78,     // one lap; slow enough to be a route, not a track
  wispLampRange: 5.5,  // the lead's light grazes the moss it passes over
  wispLampGain: 2.2,   // → ~1.1 intensity, under the tower ember's 1.25–1.95
  nearArcU: 0.3,       // overridden by the venue: where its route comes near
  leanGain: 0.35,      // how much brighter at the near arc when dice are down
  leanDwell: 0.55,     // phase warp; must stay < 1 or the route reverses
  dimGain: 0.30,       // what survives while the film runs: the glade steps back
  flareGain: 0.80,     // the crit beat, on wisps
  // THE MOOT IN SESSION
  moot: {
    lapHz: 0.085,      // a word goes round the ring in ~12 s
    quiet: 0.85,       // the vacated floor — under the authored value, so a
    visit: 0.45,       //   visit is a real lift rather than a shimmer
    // STANDING IN IT, not passing near it. The first numbers were 2 and 6
    // units and the ring never went quiet: four wisps on a loop whose
    // whole left arc sits within six units of the moot means somebody is
    // always "near". At 1.2/3.0 a visit means inside the ring's own
    // footprint, and the quiet stretches come back.
    nearIn: 1.2,
    nearOut: 3.0,
    dimGain: 0.55,     // a set piece steps back less than a bug does
    flareGain: 0.50,
    flareLap: 3.0,     // the crit beat runs the ring four times faster
  },
};

// Seat a member of the field OUTSIDE the dice box, wander included. The
// law is enforced here, at build, so zones can be authored for the FRAME
// and a zone edited for a better picture can never quietly put a firefly
// over the felt. Pushes to the nearer wall, so a pushed member stays in
// the band its zone meant it for.
function seatOutside(x, z, pad, box) {
  const hx = box.hx + box.margin + pad, hz = box.hz + box.margin + pad;
  if (Math.abs(x) >= hx || Math.abs(z) >= hz) return null;
  // Push clear by an epsilon, not exactly TO the line: seated at the line
  // exactly, a member's own wander brings it back to the runtime clamp's
  // boundary and the backstop starts firing every frame — which would
  // look like life sliding along an invisible wall.
  const eps = 0.05;
  const dx = hx - Math.abs(x), dz = hz - Math.abs(z);
  if (dz <= dx) return [x, (z >= 0 ? 1 : -1) * (hz + eps)];
  return [(x >= 0 ? 1 : -1) * (hx + eps), z];
}

export function buildLife(pal, seed, opts) {
  const { zones, loop, tune } = opts;
  // The dice box comes from the caller (it is the TABLE's number, at the
  // widest zoom — the binding case, since a tighter mat only moves the
  // walls inward). Defaulted here only so the module can be exercised
  // standalone; the venue always supplies it.
  const b = opts.box || {};
  const box = {
    hx: typeof b.hx === 'number' ? b.hx : 7.05,
    hz: typeof b.hz === 'number' ? b.hz : 4.3,
    margin: typeof b.margin === 'number' ? b.margin : 0.35,
  };
  const rnd = mulberry32(seed >>> 0);
  const glow = new THREE.Color(pal.glowCore);
  const group = new THREE.Group();
  group.name = 'faeLife';

  // ---- the field ---------------------------------------------------------
  // Population is dealt across the zones by their declared weight, so a
  // zone list is the only thing a new venue has to write. Each fly keeps
  // a home, a slow wander and a blink phase; the blink is
  // pow(max(0,sin), blinkPow) — at 6 a fly is dark about five sixths of
  // its cycle, which is the whole read. A firefly that is merely
  // twinkling is a star, and the glade already has a starfield's worth
  // of those in the mist band.
  const total = tune.count;
  const wsum = zones.reduce((a, z) => a + z.w, 0);
  const flies = [];
  let seated = 0;
  for (const z of zones) {
    const n = Math.max(1, Math.round(total * z.w / wsum));
    for (let i = 0; i < n && flies.length < total; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      let fx = z.x + Math.cos(a) * r * z.rx;
      let fz = z.z + Math.sin(a) * r * z.rz;
      const pushed = seatOutside(fx, fz, tune.wander, box);
      if (pushed) { [fx, fz] = pushed; seated++; }
      flies.push({
        x: fx,
        z: fz,
        y: z.y0 + rnd() * (z.y1 - z.y0),
        wx: 0.13 + 0.22 * rnd(), wz: 0.11 + 0.20 * rnd(), wy: 0.09 + 0.14 * rnd(),
        px: rnd() * 6.283, pz: rnd() * 6.283, py: rnd() * 6.283,
        bh: tune.blinkHz * (0.6 + 0.9 * rnd()),   // each fly keeps its own tempo
        bp: rnd(),                                 // and its own place in it
        b: 0.45 + 0.55 * rnd() ** 1.4,             // most dim, a few hot
      });
    }
  }
  const fpos = new Float32Array(flies.length * 3);
  const fcol = new Float32Array(flies.length * 3);
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
  const fmat = new THREE.PointsMaterial({
    size: tune.size, map: bakeGlint(32, 0.28, 0.5), color: glow,
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    // fog: TRUE, unlike the mood's dust. A mote lives inside a lamp cone a
    // few units from the eye; these are spread across a glade whose whole
    // depth story is the fog retreat, and a fly at the treeline that
    // ignores the fog is a fly pasted on the frame.
    depthWrite: false, fog: true, sizeAttenuation: true,
  });
  const fireflies = new THREE.Points(fgeo, fmat);
  fireflies.name = 'faeFireflies';
  fireflies.frustumCulled = false;
  fireflies.renderOrder = 3;
  group.add(fireflies);

  // ---- the wisps ---------------------------------------------------------
  // Few, slow, and on a route. Phase offsets are spread but not even —
  // evenly spaced wisps on a shared loop read as a mechanism.
  const wisps = [];
  for (let i = 0; i < tune.wispCount; i++) {
    wisps.push({
      u: (i / tune.wispCount) + (rnd() - 0.5) * 0.09,
      sp: 0.82 + 0.36 * rnd(),                    // own pace along the loop
      // How far it strays off the wire. Bounded deliberately: the route's
      // near arc sits 1.7 units behind the widest back wall, a Catmull-Rom
      // can overshoot slightly past a control point, and stray + overshoot
      // is what has to stay inside that gap for the backstop to remain a
      // backstop rather than a mechanism that fires every frame.
      off: 0.40 + 0.35 * rnd(),
      ph: rnd() * 6.283, ph2: rnd() * 6.283,
      // The tier split IS the source budget: one secondary lead (the
      // stage's existing bright wisp, re-homed onto the route), the rest
      // held under the field's tertiary ceiling.
      peak: i === 0 ? tune.leadPeak : tune.wispPeak * (0.72 + 0.28 * rnd()),
      bh: 0.11 + 0.09 * rnd(),                    // a lantern breathes, never blinks
      lead: i === 0,
    });
  }
  const wpos = new Float32Array(wisps.length * 3);
  const wcol = new Float32Array(wisps.length * 3);
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  wgeo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
  const wmat = new THREE.PointsMaterial({
    size: tune.wispSize, map: bakeGlint(64, 0.16, 0.30), color: pal.glowCap,
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: true, sizeAttenuation: true,
  });
  const wispPoints = new THREE.Points(wgeo, wmat);
  wispPoints.name = 'faeWisps';
  wispPoints.frustumCulled = false;
  wispPoints.renderOrder = 3;
  group.add(wispPoints);

  // The lead's light — the venue's single dynamic light, and the reason a
  // wisp reads as something IN the glade rather than a sprite over it: it
  // grazes the moss and the trunk as it goes by. Short range and low
  // intensity keep it a lantern, not a second moon; decay 2 keeps its
  // reach honest.
  const lamp = new THREE.PointLight(pal.glowCap, 0, tune.wispLampRange, 2);
  lamp.name = 'faeWispLamp';
  group.add(lamp);

  return {
    group, fireflies, wispPoints, lamp, flies, wisps,
    loop, box, tune, pal,
    // The law, watchable. `seated` counts members a zone put over the
    // felt and the build pushed out (should be 0 — a non-zero means a
    // zone wants re-authoring, not that anything is broken); `clamped`
    // counts what the runtime backstop caught this step (should always
    // be 0). A law nobody can watch is a law nobody can check.
    seated,
    clamped: 0,
  };
}

// mood: { life, lean, flare } — all 0..1, eased by the caller.
//   life  1 = the glade is out (idle), 0 = withdrawn (dice in the air)
//   lean  1 = dice are down and readable; the wisps dwell on the arc
//           nearest the clearing and brighten a touch. They never move
//           closer than the loop already goes — the lean is DWELL and
//           VALUE, not a path deformation, so the box law cannot be
//           traded away for a nicer gesture.
//   flare 1 = a crit beat, decaying; one bloom, then gone.
export function stepLife(spec, t, mood) {
  const { flies, wisps, tune, box, loop } = spec;
  const life = mood ? mood.life : 1;
  const lean = mood ? mood.lean : 0;
  const flare = mood ? mood.flare : 0;
  spec.clamped = 0;

  // The field. Dimming is multiplicative on the peak and the blink slows
  // with it: life withdrawing is fewer flashes AND fainter ones, which is
  // what "the glade holds its breath" looks like when you take it apart.
  const fp = spec.fireflies.geometry.attributes.position;
  const fc = spec.fireflies.geometry.attributes.color;
  const dim = tune.dimGain + (1 - tune.dimGain) * life;
  const rate = 0.55 + 0.45 * life;
  const p = [0, 0, 0];
  for (let i = 0; i < flies.length; i++) {
    const s = flies[i];
    p[0] = s.x + tune.wander * Math.sin(s.wx * t + s.px);
    p[1] = s.y + tune.wander * 0.5 * Math.sin(s.wy * t + s.py);
    p[2] = s.z + tune.wander * Math.sin(s.wz * t + s.pz);
    const before = p[2];
    keepOut(p, box);
    if (p[2] !== before) spec.clamped++;
    fp.setXYZ(i, p[0], p[1], p[2]);
    const ph = Math.sin(Math.PI * 2 * (s.bh * rate * t + s.bp));
    const env = ph > 0 ? Math.pow(ph, tune.blinkPow) : 0;
    const v = tune.peak * s.b * env * dim;
    fc.setXYZ(i, v, v, v);
  }
  fp.needsUpdate = true;
  fc.needsUpdate = true;

  // The wisps. Speed along the loop falls where the route faces the
  // clearing — that is the whole "they came to look" gesture, and it
  // costs one multiply. `nearArc` is a smooth bump over the loop
  // parameter rather than a distance test, so the dwell happens at a
  // place on the route (repeatable, photographable) instead of wherever
  // the dice happened to land.
  const wp = spec.wispPoints.geometry.attributes.position;
  const wc = spec.wispPoints.geometry.attributes.color;
  const base = t / tune.wispLoopSec;
  let leadV = 0;
  for (let i = 0; i < wisps.length; i++) {
    const s = wisps[i];
    // Dwell warps the parameter itself: u advances slower across the
    // near arc. Integrating that per frame would need state, so the warp
    // is applied as a closed-form phase shift — the layer stays a pure
    // function of t and freezes cleanly under a held clock.
    let u = s.u + base * s.sp;
    const near = Math.pow(Math.max(0, Math.cos(Math.PI * 2 * (u - tune.nearArcU))), 6);
    u -= lean * tune.leanDwell * Math.sin(Math.PI * 2 * (u - tune.nearArcU)) / (Math.PI * 2);
    const q = loopAt(loop, u);
    p[0] = q[0] + s.off * Math.sin(0.21 * t + s.ph);
    p[1] = q[1] + s.off * 0.35 * Math.sin(0.17 * t + s.ph2);
    p[2] = q[2] + s.off * Math.sin(0.19 * t + s.ph2);
    const before = p[2];
    keepOut(p, box);
    if (p[2] !== before) spec.clamped++;
    wp.setXYZ(i, p[0], p[1], p[2]);
    // A lantern breathes; it does not blink. The lean adds a little, the
    // flare adds a beat, and `dim` takes it all back while dice fly.
    const breath = 0.78 + 0.22 * Math.sin(Math.PI * 2 * s.bh * t + s.ph);
    const v = s.peak * breath * dim
      * (1 + tune.leanGain * lean * near + tune.flareGain * flare);
    wc.setXYZ(i, v, v, v);
    if (s.lead) {
      spec.lamp.position.set(p[0], p[1], p[2]);
      leadV = v;
    }
  }
  wp.needsUpdate = true;
  wc.needsUpdate = true;
  // The lamp tracks the lead's own brightness, so the light and the sprite
  // can never disagree about whether the wisp is there.
  spec.lamp.intensity = tune.wispLampGain * leadV;
}

// THE MOOT IN SESSION (ROADMAP W5's third item). The ring is a VACATED
// moot by design — grammar §5 staging 2, "the interruption is the story"
// — so it does not get repopulated with attendants here. What wakes is
// the ring itself: a slow pulse travelling cap to cap, the way a
// conversation goes round a circle, and the fallen one answering out of
// turn. Then the SESSION: when wisps are near the ring the whole thing
// lifts, and when they wander off it goes quiet again. The faeries are
// the wisps; the moot is in session when they are standing in it.
//
// Emissive and disc opacity ONLY — no light is created, and the fog is
// untouched (the ring's glow pools were folded into the sheets' base at
// build time and stay there, so the bed the fog paints does not breathe
// with the caps; a breathing fog bed would cost a full sheet rewrite per
// frame and read as weather, not as talk).
export function stepMootSession(moot, t, mood, tune) {
  const caps = moot.userData.caps;
  if (!caps) return 0;
  const seats = moot.userData.seats || caps.length;
  const life = mood ? mood.life : 1;
  const flare = mood ? mood.flare : 0;
  // How close the wisps are to the ring, 0..1, supplied by the caller —
  // it knows where the wisps are and the moot does not.
  const session = mood && typeof mood.session === 'number' ? mood.session : 0;
  const lap = tune.lapHz * (1 + tune.flareLap * flare);
  const gain = (tune.quiet + tune.visit * session) * (tune.dimGain
    + (1 - tune.dimGain) * life) * (1 + tune.flareGain * flare);
  for (const c of caps) {
    // The wave runs round the ellipse by cap index; the fallen cap is a
    // half-turn out of phase, still the brightest, still talking.
    const ph = Math.PI * 2 * (lap * t - c.i / seats) + (c.fallen ? Math.PI : 0);
    const w = 0.72 + 0.28 * Math.sin(ph);
    c.mat.emissiveIntensity = c.base * w * gain;
  }
  for (const d of moot.userData.discs || []) {
    const ph = Math.PI * 2 * (lap * t - d.i / seats);
    d.mesh.material.opacity = d.base * (0.80 + 0.20 * Math.sin(ph)) * gain;
  }
  return gain;
}

export function disposeLife(spec) {
  spec.fireflies.geometry.dispose();
  spec.fireflies.material.map.dispose();
  spec.fireflies.material.dispose();
  spec.wispPoints.geometry.dispose();
  spec.wispPoints.material.map.dispose();
  spec.wispPoints.material.dispose();
}
