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

// THE STAGING GATES — "too staged" measured in the FRAME (ROADMAP W7 ②).
//
// Joe's verdict was a SCREEN-SPACE claim: *"I want the dice tower to be in a
// scene, not the centerpiece of it in a symmetrical and formal way."* Every
// previous answer to it was authored and checked in PLAN, and W2c already
// recorded what that costs — the resting eye's low angle compresses the whole
// back band into one horizontal strip, so a plan-space move can be large,
// correct, and photograph as nothing (VENUE-COMPOSITION rule 6 as amended).
// Round 7 ① found the same thing on the model and answered it the same way:
// its three gates bin the built mesh into a PROJECTED OUTLINE, and all three
// go red against a round-6 field that satisfied every plan claim asked of it.
//
// So these gates are stated in the frame. Seven of them, evaluated through the
// LIVE camera at the resting eye (__diceDebug.worldToScreen), plus one
// measured on the rendered PIXELS:
//
//   F1  NO MIRROR TWINS  no feature has a counterpart across the centreline
//   F2  NO BOOKENDS      rule 6's amended CHECK, with the band made relative
//   F3  THIRDS           fungus in all three screen thirds, none hogging
//   F4  BAND SPREAD      the cast must not sit on one horizontal strip
//   F5  SIZE LADDER      angular-size contrast between the supports
//   F6  IN FRAME         a feature the frame crops away is not composed
//   F7  HERO CONTACT     something touches the hero's silhouette (rule 3)
//   P1  INK BALANCE      F1's question asked of the rendered image
//
// THE HERO'S POSITION IS NOT ONE OF THEM, and that is a finding rather than an
// omission: the tower is the delivery machine, its door sits on x 0 by portal
// spec, and the resting eye looks down the mat's centreline — so the hero is
// pinned to the frame's centreline BY CONSTRUCTION and no composition move can
// take it off. Everything Joe asked for has to be bought with the rest of the
// scene, which is what every gate below measures.
//
// EVERY GATE RUNS TWICE: once over the live stage (venueInfo().stage, so it
// reads the shipped numbers rather than a copy of them) and once over the
// FROZEN W2c LAYOUT below — the arrangement Joe called too staged, projected
// through the same camera in the same run. The baseline is the red check, and
// each gate PRINTS whether it discriminates: a gate both layouts pass is a
// floor, not evidence, and calling it evidence is this project's own dominant
// failure mode.
//
//   node tools/drive.mjs tools/steps/glade-frame.mjs            # gates + baseline
//   node tools/drive.mjs tools/steps/glade-frame.mjs dump       # + every projection
//   node tools/drive.mjs tools/steps/glade-frame.mjs foxfire    # the other sky
//
// P1's baseline cannot come from a layout table — it needs the old code
// rendering — so it was measured once by checking js/fae-lab.js back out at
// 9f1e592 (the last commit before W7 ②) and re-running this step. That number
// is P1_BEFORE, and it is a MEASUREMENT, not an estimate; re-derive it the
// same way if it is ever doubted.

import { inflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// THE FROZEN W2c LAYOUT — js/fae-lab.js at 9f1e592, the frame Joe judged.
// Ground footprints only, exactly the shape venueInfo().stage reports today,
// so the two runs differ in COORDINATES and in nothing else.
const W2C = {
  moot: { x: -6.8, z: -6.6, rx: 2.8, rz: 1.7, band: 'back' },
  pool: { x: 6.2, z: -6.6, rx: 2.6, rz: 1.75 },
  // W2c had no scatter: fungus existed in exactly two places, the ring and
  // the five-cap spill that walked from it toward the root flare. The spill
  // is modelled as the one clump it was — that IS what F3 reports.
  shrooms: [
    { x: -6.8, z: -6.6, rx: 3.1, rz: 2.0, band: 'back' },
    { x: -4.0, z: -5.95, rx: 0.7, rz: 0.4, band: 'back' },
  ],
  scenery: [
    { x: -8.2, z: 4.7, rx: 0.8, rz: 0.8, band: 'fore' },
    { x: -8.0, z: 5.2, rx: 0.6, rz: 0.6, band: 'fore' },
    { x: -4.8, z: -5.5, rx: 1.35, rz: 0.75, band: 'back' },
    { x: 4.5, z: -6.0, rx: 0.32, rz: 0.32, band: 'back' },
    { x: 5.0, z: -6.35, rx: 0.24, rz: 0.24, band: 'back' },
  ],
};

// P1, measured at 9f1e592 by the procedure in the header — same floor, same
// canvas, same camera, same hero axis. Left-signed. The WHOLE-frame figure is
// kept beside it because it is the one that proved the naive gate wrong.
// The gated number: where the light the STAGING puts in the frame sits.
const P1_BEFORE = { cx: 0.397, cy: 0.732, off: 0.132, bal: 0.552, tot: 10230 };
// And four measures that turned out to be FLOORS — kept because measuring
// them is what proved it, and the next person will otherwise re-derive them.
const P1_BAND_BEFORE = 0.409;  // staging-band left/right ink
const P1_WHOLE_BEFORE = 0.570; // whole-canvas left/right ink
const P1_NEAR_BEFORE = 0.505;  // near-band share of the staging band
// Thresholds. OFF is a seventh of the frame's width off the hero's own
// centreline; NEAR is the midpoint of the band the staging owns (GATE_Y0…1),
// i.e. the light lands in the nearer half of its own band.
const P1_OFF = 0.15;
const P1_NEAR = 0.80;

// The feature groups P1 hides to isolate the staging's own light. Names, not
// a subtree walk, because the hide has to be exactly the composition's
// movable cast — the ground, the fog and the beam are the venue's air and are
// the same in every layout. `faeShrooms` did not exist before W7 ②, so its
// count comes back 0 on the baseline and the report says so.
const FEATURE_GROUPS = ['faeMoot', 'faeMirrorPool', 'faeShrooms', 'faeScenery'];

// ---------------------------------------------------------------------------
// PROJECTION. A feature is a ground ellipse; its frame footprint is the ndc
// bounding box of 24 rim samples. Ground only, deliberately: the stage
// declares (x, z, rx, rz) and nothing else, and a gate that needed a height
// nobody authored would be comparing one invented number against another —
// the W5 "a tier is a luminance, and an authored scalar is not one" trap with
// the nouns changed. The footprint is also the right noun for the complaint:
// "beads on a line" and "mirrored about the centre" are both statements about
// where things SIT in the picture.
const RIM = 24;

function rimPoints(f, y = 0) {
  const pts = [];
  for (let i = 0; i < RIM; i++) {
    const a = (i / RIM) * Math.PI * 2;
    pts.push([f.x + f.rx * Math.cos(a), y, f.z + f.rz * Math.sin(a)]);
  }
  return pts;
}

// Frame coordinates: fx, fy in [0, 1] with the origin at the TOP-LEFT of the
// canvas — the frame a viewer sees, so "left third" means the left third.
function toFrame(ndc) { return { fx: (ndc.x + 1) / 2, fy: (1 - ndc.y) / 2 }; }

function boxOf(projected) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of projected) {
    const f = toFrame(p.ndc);
    x0 = Math.min(x0, f.fx); x1 = Math.max(x1, f.fx);
    y0 = Math.min(y0, f.fy); y1 = Math.max(y1, f.fy);
  }
  const w = x1 - x0, h = y1 - y0;
  // The VISIBLE fraction: how much of the footprint the frame keeps. W2b's
  // pool at (7.2, −7.4) and W7's first ring seat at (−9.0, 4.6) were both
  // half-cropped, and both were found by looking rather than by measuring.
  // This is the number that would have found them.
  const vx = Math.max(0, Math.min(1, x1) - Math.max(0, x0));
  const vy = Math.max(0, Math.min(1, y1) - Math.max(0, y0));
  return {
    x0, x1, y0, y1, w, h,
    cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
    area: w * h,
    inFrac: w * h > 0 ? (vx * vy) / (w * h) : 0,
  };
}

// One page round-trip for every point of every feature: worldToScreen reads
// the live camera, and the camera must not move between samples.
async function projectAll(t, features) {
  const pts = [];
  const spans = [];
  for (const f of features) {
    const p = rimPoints(f);
    spans.push([pts.length, p.length]);
    pts.push(...p);
  }
  const all = JSON.parse(await t.eval(
    `JSON.stringify(${JSON.stringify(pts)}`
    + `.map((p) => window.__diceDebug.worldToScreen(p[0], p[1], p[2])))`));
  return features.map((f, i) => {
    const [at, n] = spans[i];
    return { ...f, box: boxOf(all.slice(at, at + n)) };
  });
}

// ---------------------------------------------------------------------------
// "THE SAME HORIZONTAL BAND", MEASURED IN THE FEATURES' OWN HEIGHTS.
//
// Rule 6's amended CHECK says "sitting on the same horizontal band" and the
// first mechanisation of it used an absolute 0.05 of frame height — which
// cleared the W2c pair by 0.092 and would have certified the exact frame the
// rule was written to refuse. A band is not a fixed number of pixels: two
// features whose screen boxes nearly overlap vertically ARE on one band,
// however tall they happen to be. Same family as "a tier is a luminance, and
// an authored scalar is not one" (rule 8) — the constant has to be expressed
// in the units of the thing it judges.
function sameBand(a, b) {
  return Math.abs(a.box.cy - b.box.cy) <= 0.6 * (a.box.h + b.box.h);
}
function sizeRatio(a, b) {
  return Math.max(a.box.w, b.box.w) / Math.max(1e-9, Math.min(a.box.w, b.box.w));
}

// THE PLACEMENT LAW, restated here for the DUMP only — venue-set owns it as a
// contract, but this step is the one a person uses while MOVING things, and
// the law is what a composition move breaks first. Same inequalities as the
// scenario, off the same declared extents: a 'back' bit clears the widest back
// wall (z + rz < −4.3) and the tower envelope (|x| − rx > 3.3); a 'fore' bit
// clears the DICE BOX at every point, which is the intersection of the walls,
// so past the front wall (z − rz > 4.3) OR past the x wall (|x| − rx > 7.05).
function lawOf(f) {
  if (!f.band) return '';
  if (f.band === 'back') {
    return (f.z + f.rz < -4.3 && Math.abs(f.x) - f.rx > 3.3)
      ? 'law ok' : `LAW BROKEN (z+rz ${(f.z + f.rz).toFixed(2)}, |x|−rx ${(Math.abs(f.x) - f.rx).toFixed(2)})`;
  }
  return (f.z - f.rz > 4.3 || Math.abs(f.x) - f.rx > 7.05)
    ? 'law ok' : `LAW BROKEN (z−rz ${(f.z - f.rz).toFixed(2)}, |x|−rx ${(Math.abs(f.x) - f.rx).toFixed(2)})`;
}

// ---------------------------------------------------------------------------
// THE GATES. Each returns { id, ok, got, want, why }.
const GATES = {
  // F1 — SYMMETRY, which is Joe's own word. A pair is a MIRROR TWIN when one
  // sits where the other's reflection in the frame's centreline would be, on
  // the same band, at a comparable angular size. That arrangement is what
  // "symmetrical and formal" describes, and it is invisible in plan: W2c's
  // moot and pool stand 13 units apart on a perfectly legal triangle and
  // photograph 0.006 of frame width from being each other's mirror.
  F1(L) {
    const cast = L.supports.concat(L.fungus);
    // The mirror axis is the HERO's projected centre, not the canvas centre:
    // the resting eye is offset and world x 0 lands at frame 0.529, so a pair
    // that straddles the tower is what a viewer reads as reflected. See
    // inkBalance for the measurement that made the difference matter.
    const axis = L.hero ? L.hero.box.cx : 0.5;
    let worst = null;
    const twins = [];
    for (let i = 0; i < cast.length; i++) {
      for (let j = i + 1; j < cast.length; j++) {
        const a = cast[i], b = cast[j];
        const err = Math.abs(a.box.cx + b.box.cx - 2 * axis);
        const r = sizeRatio(a, b);
        if (!sameBand(a, b) || r >= 1.35) continue;
        if (!worst || err < worst.err) worst = { a: a.id, b: b.id, err, r };
        if (err < 0.06) twins.push(`${a.id}~${b.id} (mirror Δ${err.toFixed(3)}, size ×${r.toFixed(2)})`);
      }
    }
    return {
      id: 'F1 no mirror twins', ok: twins.length === 0,
      got: twins.length ? twins.join(', ')
        : `0 twins (tightest same-band pair: ${worst ? `${worst.a}~${worst.b} Δ${worst.err.toFixed(3)}` : 'none'})`,
      want: 'no same-band pair within 0.06 of mirroring across the centreline',
      why: '"symmetrical and formal" is a pair reflected in the frame\'s middle',
    };
  },
  // F2 — rule 6's amended CHECK, mechanised, with the band relative (above).
  // Two supports the same angular size on one band are bookends wherever they
  // stand in plan, which is exactly how W2b's plan-space fix photographed as
  // nothing.
  F2(L) {
    const bad = [];
    const S = L.supports;
    for (let i = 0; i < S.length; i++) {
      for (let j = i + 1; j < S.length; j++) {
        const r = sizeRatio(S[i], S[j]);
        if (r < 1.25 && sameBand(S[i], S[j])) {
          bad.push(`${S[i].id}~${S[j].id} (size ×${r.toFixed(2)}, band Δ`
            + `${Math.abs(S[i].box.cy - S[j].box.cy).toFixed(3)} vs `
            + `${(0.6 * (S[i].box.h + S[j].box.h)).toFixed(3)})`);
        }
      }
    }
    return {
      id: 'F2 no bookends', ok: bad.length === 0,
      got: bad.length ? bad.join(', ') : '0 pairs',
      want: 'no two supports within ×1.25 size on one band',
      why: 'two supports the same size on the same screen band read as bookends',
    };
  },
  // F3 — "more mushrooms throughout the scene". Throughout is a claim about
  // the PICTURE, so it is binned by screen third; the area half of the gate is
  // what stops one dense ring from satisfying it.
  F3(L) {
    const thirds = [0, 0, 0];
    const counts = [0, 0, 0];
    for (const f of L.fungus) {
      const k = Math.max(0, Math.min(2, Math.floor(f.box.cx * 3)));
      thirds[k] += f.box.area;
      counts[k]++;
    }
    const total = thirds.reduce((a, b) => a + b, 0) || 1e-9;
    const share = thirds.map((v) => v / total);
    const empty = counts.filter((c) => c === 0).length;
    return {
      id: 'F3 thirds', ok: empty === 0 && Math.max(...share) <= 0.60,
      got: `counts [${counts.join(', ')}] · area share [${share.map((v) => v.toFixed(2)).join(', ')}]`,
      want: 'all three thirds occupied, none over 0.60 of the area',
      why: 'fungus grows through the scene rather than pooling in one ring',
    };
  },
  // F4 — the second half of the staged read: everything on one horizontal
  // strip. Measured over the whole cast, because the strip is what the low eye
  // makes of the back band and the answer to it is the foreground.
  F4(L) {
    const ys = L.supports.concat(L.fungus, L.scenery).map((f) => f.box.cy);
    const span = Math.max(...ys) - Math.min(...ys);
    return {
      id: 'F4 band spread', ok: span >= 0.35,
      got: `${span.toFixed(3)} of frame height (${Math.min(...ys).toFixed(3)} … ${Math.max(...ys).toFixed(3)})`,
      want: 'span ≥ 0.35',
      why: 'the cast occupies depth in the frame, not one horizontal strip',
    };
  },
  // F5 — angular-size contrast, one of the four levers rule 6 names as
  // surviving this projection.
  F5(L) {
    const ws = L.supports.map((f) => f.box.w);
    const ratio = Math.max(...ws) / Math.max(1e-9, Math.min(...ws));
    return {
      id: 'F5 size ladder', ok: ratio >= 1.60,
      got: `×${ratio.toFixed(2)} (${ws.map((w) => w.toFixed(3)).join(' · ')})`,
      want: 'widest / narrowest support ≥ ×1.60',
      why: 'the supports differ in angular size, so neither is the other\'s twin',
    };
  },
  // F6 — a feature the frame crops away is not a composition decision. Runs
  // over the scenery tier too: rule 13's fore wing is authored FOR the frame,
  // so a fore bit that photographs at 17% is doing none of its job.
  F6(L) {
    const bad = L.supports.concat(L.fungus, L.scenery)
      .filter((f) => f.box.inFrac < 0.55)
      .map((f) => `${f.id} ${(f.box.inFrac * 100).toFixed(0)}%`);
    return {
      id: 'F6 in frame', ok: bad.length === 0,
      got: bad.length ? bad.join(', ') : 'all ≥ 55%',
      want: 'every declared feature keeps ≥ 55% of its footprint in frame',
      why: 'a half-cropped feature is an accident, not a placement',
    };
  },
  // F7 — rule 3, "overlap beats adjacency", asked about the ONE feature the
  // composition cannot move. A hero standing in a moat of empty ground is the
  // exhibit reading whatever else the frame does; something has to touch its
  // silhouette. Gap is measured horizontally in frame widths, negative when
  // the boxes overlap.
  F7(L) {
    if (!L.hero) return { id: 'F7 hero contact', ok: true, got: 'no hero box', want: '—', why: '' };
    const H = L.hero.box;
    let best = null;
    for (const f of L.supports.concat(L.fungus, L.scenery)) {
      const gap = Math.max(H.x0 - f.box.x1, f.box.x0 - H.x1);
      if (!best || gap < best.gap) best = { id: f.id, gap };
    }
    return {
      id: 'F7 hero contact', ok: best.gap <= 0.02,
      got: `nearest ${best.id} at ${best.gap >= 0 ? '' : '−'}${Math.abs(best.gap).toFixed(3)} `
        + `frame widths (hero spans ${H.x0.toFixed(3)}…${H.x1.toFixed(3)})`,
      want: 'some feature within 0.02 of the hero\'s silhouette, or overlapping it',
      why: 'a hero in a moat of empty ground is an exhibit (rule 3)',
    };
  },
};

// ---------------------------------------------------------------------------
// P1 — F1's QUESTION ASKED OF THE PIXELS. The gates above measure where the
// composition PUT things; this measures what the composed image weighs, which
// is what Joe actually looked at. Luminance above a floor (the void sky, the
// fog body and the unlit ground carry no information and would drown the
// signal), summed either side of the canvas centreline. Zero-dep PNG decode —
// node:zlib is built in.
function decodePng(buf) {
  let p = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`glade-frame: unexpected PNG (depth ${bitDepth}, color ${colorType})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

// The floor is 0.10 of full luma. Below it the frame is void sky, fog body and
// unlit ground — the value bed every fae palette is built on — and counting it
// would make every glade frame balance at zero by construction.
const INK_FLOOR = 0.10;

// The top of the band the cast occupies at the resting eye — above it the
// frame is sky, treeline and mist band, none of which any placement move can
// touch. A CONSTANT rather than a per-layout number, so the two runs weigh the
// same pixels; 0.60 sits just above the highest feature either layout has
// (shipped min cast cy 0.619, W2c 0.709).
const GATE_Y0 = 0.60;

// The NEAR band: the bottom of the frame, in front of everything the back
// band can reach. W2c had no feature below frame y 0.80 except two cropped
// tufts; the whole of "move the ring to the foreground" is a claim about this
// strip. Same discipline as GATE_Y0 — a constant, so both runs weigh the same
// pixels.
const NEAR_Y0 = 0.86;

// THE AXIS IS THE HERO, NOT THE CANVAS, and finding that out cost a wrong
// gate. Split about the canvas centre and W2c reads +0.477 against the
// shipped frame's +0.491 — a gate that certifies both frames equally and
// therefore proves nothing. The reason is the camera: the resting eye is
// offset, so world x 0 projects to frame x 0.529, and the glade's ground
// disc, treeline, mist band and fog sheets are all symmetric about the world
// centreline. Splitting at 0.500 measures 29 thousandths of camera offset
// applied to every pixel of the backdrop, which swamps the staging entirely.
// Composition is relative to its own anchor: the hero is the axis.
// THE STAGING'S OWN INK, ISOLATED BY DIFFERENCE. Every global luminance moment
// over the whole frame turned out to be a floor (see the P1 block at the
// bottom): the backdrop — ground disc, fog sheets, treeline, mist band, beam —
// is most of the lit pixels and is identical in both layouts, so it swamps the
// staging. The fix is the repo's own find-by-hiding idiom: shoot the frame,
// hide every feature group, shoot again, and the per-pixel difference IS the
// staging. It also repairs the flaw in the footprint mass sum — this weighs
// each feature by the light it actually puts in the picture, so the wide dim
// pond stops counting the same as the small bright ring.
function inkDiff(a, b, axis) {
  const { w, h, bpp, px } = a;
  const mid = axis * w;
  let left = 0, right = 0, sx = 0, sy = 0, tot = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * bpp;
      const la = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      const lb = 0.2126 * b.px[i] + 0.7152 * b.px[i + 1] + 0.0722 * b.px[i + 2];
      const d = Math.abs(la - lb) / 255;
      if (d < 0.012) continue;          // 3/255 — below it is compression noise
      (x < mid ? (left += d) : (right += d));
      sx += d * (x / w); sy += d * (y / h); tot += d;
    }
  }
  return {
    left, right, tot,
    bal: (left - right) / Math.max(1e-9, left + right),
    cx: tot > 0 ? sx / tot : 0,
    cy: tot > 0 ? sy / tot : 0,
  };
}

function inkBalance(png, axis, y0 = 0, y1 = 1) {
  const { w, h, bpp, px } = png;
  const mid = axis * w;
  let left = 0, right = 0;
  for (let y = Math.round(y0 * h); y < Math.round(y1 * h); y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * bpp;
      const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      if (l < INK_FLOOR) continue;
      (x < mid ? (left += l - INK_FLOOR) : (right += l - INK_FLOOR));
    }
  }
  return { left, right, bal: (left - right) / Math.max(1e-9, left + right) };
}

// ---------------------------------------------------------------------------
export default async function run(stage, args = []) {
  const dump = args.includes('dump');
  const venue = args.includes('foxfire') ? 'foxfire' : 'moonrise';
  const fail = (m) => { console.log(`BAD: ${m}`); process.exitCode = 1; };

  const t = await stage.tab('localhost', 'GladeFrame');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  await t.dbg(`setVenue('${venue}')`);
  await t.waitFor(`window.__diceDebug.venue === '${venue}'`, { desc: `${venue} staged` });
  await t.dbg(`setTower('hollowbole')`);
  await t.waitFor(`window.__diceDebug.tower === 'hollowbole'`, { desc: 'tower up' });
  // The resting eye is an EASE, not a jump: measuring before it lands grades a
  // camera halfway between two frames (the venue-life sim-clock lesson).
  await t.dbg('sim(1500)');
  await t.eval('window.__diceDebug.tick(0, true, false)');

  const info = JSON.parse(await t.eval('JSON.stringify(window.__diceDebug.venueInfo())'));
  if (!info.stage) { fail('no stage layout — the glade did not rise'); return; }
  const s = info.stage;

  // THE HERO. Its footprint comes off the BUILT shell (groundGaps reports the
  // world bounding box of the socketed mesh) rather than off a remembered
  // number, so a re-baked trunk moves this gate with it. Its silhouette is
  // sampled at the felt and again at the declared rim, because the trunk leans
  // and the crown is what the eye reads against.
  const shell = JSON.parse(await t.eval(
    'JSON.stringify(window.__diceDebug.groundGaps(\'towerSkinBoleShell\'))') || 'null');
  const spec = await t.dbg('towerPortalSpec(\'hollowbole\')');
  let hero = null;
  if (shell && shell.all.length) {
    const m = shell.all[0];
    const f = { id: 'hero', x: m.x, z: m.z, rx: m.w / 2, rz: m.w / 2 };
    const pts = [...rimPoints(f, 0), ...rimPoints(f, spec ? spec.derived.rimY : 9.4)];
    const proj = JSON.parse(await t.eval(
      `JSON.stringify(${JSON.stringify(pts)}`
      + '.map((p) => window.__diceDebug.worldToScreen(p[0], p[1], p[2])))'));
    hero = { ...f, box: boxOf(proj) };
    console.log(`\nTHE HERO IS PINNED. Portal door.x ${spec ? spec.derived.door.x : '?'}, shell centre `
      + `x ${m.x} — it projects to frame x ${hero.box.cx.toFixed(3)}, i.e. the centreline. `
      + 'No composition move can take it off, so every gate below excludes its position\n'
      + 'and spends the rest of the scene instead.\n');
  }

  const layouts = {
    shipped: {
      hero,
      supports: [{ id: 'moot', ...s.moot }, { id: 'pool', ...s.pool }],
      // The ring IS fungus as well as a support: F3 asks where the mushrooms
      // are, and leaving the densest patch of them out of that census would
      // be the question answered about everything except its subject.
      fungus: (s.shrooms || []).map((f, i) => ({ id: `shroom${i}`, ...f }))
        .concat([{ id: 'ring', x: s.moot.x, z: s.moot.z, rx: s.moot.rx, rz: s.moot.rz }]),
      scenery: (s.scenery || []).map((f, i) => ({ id: `scenery${i}`, ...f })),
    },
    'W2c (before)': {
      hero,
      supports: [{ id: 'moot', ...W2C.moot }, { id: 'pool', ...W2C.pool }],
      fungus: W2C.shrooms.map((f, i) => ({ id: `shroom${i}`, ...f })),
      scenery: W2C.scenery.map((f, i) => ({ id: `scenery${i}`, ...f })),
    },
  };

  const results = {};
  const massBal = {};
  for (const [name, L] of Object.entries(layouts)) {
    const flat = [...L.supports, ...L.fungus, ...L.scenery];
    const projected = await projectAll(t, flat);
    let at = 0;
    const P = {
      hero: L.hero,
      supports: projected.slice(at, at += L.supports.length),
      fungus: projected.slice(at, at += L.fungus.length),
      scenery: projected.slice(at, at += L.scenery.length),
    };
    if (dump) {
      console.log(`--- ${name}: projections ---`);
      for (const f of projected) {
        console.log(`  ${f.id.padEnd(10)} plan(${String(f.x).padStart(6)}, ${String(f.z).padStart(6)}`
          + `) r(${(f.rx || 0).toFixed(2)}, ${(f.rz || 0).toFixed(2)}) ${(f.band || '-').padEnd(4)} `
          + `→ frame(${f.box.cx.toFixed(3)}, ${f.box.cy.toFixed(3)}) `
          + `w ${f.box.w.toFixed(3)} h ${f.box.h.toFixed(3)} in ${(f.box.inFrac * 100).toFixed(0)}%`
          // The placement law is printed for the LIVE stage only. The W2c
          // column is a hand-frozen MODEL of coordinates that no longer
          // exist, so a law verdict on it would be a claim about a table in
          // this file rather than about any code that ships.
          + `  ${name === 'shipped' ? lawOf(f) : ''}`);
      }
    }
    // FOOTPRINT MASS BALANCE — reported, never gated, and the reason is worth
    // more than the number: a ground footprint is not visual mass. The pond is
    // the widest thing in the frame and among the quietest, so an area sum
    // calls it heavy while the eye barely finds it. Gating on this would be
    // rule 8's own trap (a scalar standing in for a luminance); P1 is the
    // gated form of the same question, asked of pixels that know the value.
    let left = 0, right = 0;
    for (const f of [...P.supports, ...P.fungus, ...P.scenery]) {
      (f.box.cx < 0.5 ? (left += f.box.area) : (right += f.box.area));
    }
    massBal[name] = (left - right) / Math.max(1e-9, left + right);
    results[name] = Object.values(GATES).map((g) => g(P));
  }

  // ---- the table: before, after, verdict ---------------------------------
  console.log('=== W7 ② THE STAGING, MEASURED IN THE FRAME ===\n');
  const ship = results.shipped;
  const base = results['W2c (before)'];
  for (let i = 0; i < ship.length; i++) {
    const discriminates = !base[i].ok;
    console.log(`${ship[i].ok ? 'ok  ' : 'BAD '} ${ship[i].id}`
      + `${discriminates ? '' : '   [FLOOR — the W2c frame passes it too]'}`);
    console.log(`       want   ${ship[i].want}`);
    console.log(`       why    ${ship[i].why}`);
    console.log(`       before ${base[i].ok ? 'pass' : 'FAIL'}  ${base[i].got}`);
    console.log(`       after  ${ship[i].ok ? 'pass' : 'FAIL'}  ${ship[i].got}`);
    if (!ship[i].ok) fail(`${ship[i].id}: ${ship[i].got}`);
  }
  console.log('\n     footprint mass balance (reported, not gated — see the code):'
    + `\n       before ${massBal['W2c (before)'] >= 0 ? '+' : ''}${massBal['W2c (before)'].toFixed(3)}`
    + `\n       after  ${massBal.shipped >= 0 ? '+' : ''}${massBal.shipped.toFixed(3)}`);

  // THE RED CHECK. A suite the W2c frame passes is not measuring the
  // complaint; it is measuring something both frames happen to satisfy, and
  // shipping it would be the green check that masks the broken thing.
  const discriminating = base.filter((g) => !g.ok).length;
  console.log(`\nred check — the W2c layout fails ${discriminating}/${base.length} gates`);
  if (discriminating < 3) {
    fail(`only ${discriminating} gate(s) discriminate the frame Joe rejected — `
      + 'the suite is a floor, not evidence');
  }

  // ---- P1, on the rendered image ----------------------------------------
  // The CANVAS, not the page: the left panel is UI and would weigh the balance
  // permanently left. getBoundingClientRect is CSS pixels and captureScreenshot
  // clips in CSS pixels too, so the two agree without a scale factor.
  const rect = JSON.parse(await t.eval(
    '(() => { const r = document.querySelector(\'canvas\').getBoundingClientRect();'
    + ' return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }); })()'));
  const axis = hero ? hero.box.cx : 0.5;
  const grab = async () => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    const { data } = await t.page.browser.send('Page.captureScreenshot',
      { format: 'png', clip: { ...rect, scale: 1 } }, t.page.sessionId);
    return decodePng(Buffer.from(data, 'base64'));
  };
  const shoot = async () => {
    const png = await grab();
    // HOW MUCH OF THE STAGING'S LIGHT IS IN THE NEAR BAND — F4's claim, asked
    // of pixels. "Move the ring to the foreground" is a statement about where
    // the light in the picture SITS from top to bottom, and unlike left/right
    // balance this one is not swamped by the backdrop, because the backdrop
    // has nothing below the treeline.
    const band = inkBalance(png, axis, GATE_Y0, 1);
    const near = inkBalance(png, axis, NEAR_Y0, 1);
    const bandInk = band.left + band.right;
    return {
      whole: inkBalance(png, axis),
      nearShare: bandInk > 0 ? (near.left + near.right) / bandInk : 0,
      // THE STAGING BAND. Whole-frame ink turned out to be a floor — the
      // backdrop (ground disc, treeline, mist band, beam) is most of the lit
      // pixels and it is the same in both layouts, so both read about +0.5
      // and the gate certified the frame it was meant to refuse. GATE_Y0 is
      // the top of the band the cast actually occupies, taken from the
      // projections rather than chosen, so the pixels being weighed are the
      // pixels the staging owns.
      band,
    };
  };
  const ink = await shoot();
  // THE STAGING, ISOLATED. Hide every feature group and shoot again: the
  // difference is the light the STAGING puts in the frame, backdrop removed.
  // This is the honest form of the mass claim — each feature weighed by the
  // pixels it actually lights, so the wide dim pond stops counting the same as
  // the small bright ring.
  const dressed = await grab();
  const hid = {};
  for (const g of FEATURE_GROUPS) hid[g] = await t.dbg(`setVisibleByName('${g}', false)`);
  const bare = await grab();
  for (const g of FEATURE_GROUPS) await t.dbg(`setVisibleByName('${g}', true)`);
  const staging = inkDiff(dressed, bare, axis);
  const hidTotal = Object.values(hid).reduce((a, b) => a + b, 0);

  const sign = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
  // THE CENTROID IS THE GATE, and the balance is not — which is the third
  // thing measuring taught this step. The staging's ink BALANCE about the hero
  // is +0.552 at W2c against +0.570 shipped: a lean that was always there.
  // Its CENTROID moves from (0.397, 0.732) to (0.253, 0.846) — a seventh of
  // the frame left and an eighth of it down. Where the light SITS is the
  // composition; how it splits about an axis is mostly the venue's own bed.
  const off = Math.abs(staging.cx - axis);
  const p1ok = hidTotal > 0 && off >= P1_OFF && staging.cy >= P1_NEAR;
  console.log(`\n${p1ok ? 'ok  ' : 'BAD '} P1 staging ink centroid`
    + `   (isolated by hiding ${hidTotal} meshes: `
    + `${Object.entries(hid).map(([k, v]) => `${k}×${v}`).join(' ')})`);
  console.log(`       want   ≥ ${P1_OFF} of frame width off the hero's centreline `
    + `(x ${axis.toFixed(3)}), and y ≥ ${P1_NEAR} — the near half of the staging band`);
  console.log('       why    where the light the staging ADDS actually sits in the picture.');
  console.log('              "Move the ring to the foreground" is a claim about exactly this,');
  console.log('              and it is the fix for footprint area, which weighs a near-');
  console.log('              invisible pond the same as a lit ring');
  console.log(`       before (${P1_BEFORE.cx.toFixed(3)}, ${P1_BEFORE.cy.toFixed(3)})  off `
    + `${P1_BEFORE.off.toFixed(3)} — FAILS both halves (measured at 9f1e592, see the header)`);
  console.log(`       after  (${staging.cx.toFixed(3)}, ${staging.cy.toFixed(3)})  off `
    + `${off.toFixed(3)}`);
  console.log(`       and the staging now puts ${Math.round(staging.tot)} units of light in the `
    + `frame against ${P1_BEFORE.tot} — ×${(staging.tot / P1_BEFORE.tot).toFixed(2)}`);
  if (hidTotal === 0) fail('P1 hid nothing — the difference image is not evidence about anything');
  if (!p1ok) fail(`P1 staging ink centroid (${staging.cx.toFixed(3)}, ${staging.cy.toFixed(3)})`);

  // TWO WHOLE-FRAME MEASURES THAT DO NOT DISCRIMINATE, reported rather than
  // gated, because measuring them is what proved it and the next person will
  // otherwise re-derive them as good ideas. Left/right ink over the whole
  // canvas: W2c +0.570 vs shipped +0.580. Over the staging band alone: +0.409
  // vs +0.433. Near-band share of the staging band's ink: 0.505 vs 0.584. The
  // glade has ALWAYS been left-heavy and bottom-heavy in value, because the
  // ground disc, the fog sheets and the beam are most of the lit pixels and no
  // placement move touches any of them. A gate on any of the three would have
  // certified the frame Joe rejected, to three decimal places, in the exact
  // language of the complaint.
  console.log('\n     measures that turned out to be FLOORS (reported, never gated):');
  console.log(`       staging ink BALANCE ${sign(staging.bal)}  (W2c ${sign(P1_BEFORE.bal)})`);
  console.log(`       ink balance, staging band ${sign(ink.band.bal)}  (W2c ${sign(P1_BAND_BEFORE)})`
    + `  ·  whole frame ${sign(ink.whole.bal)}  (W2c ${sign(P1_WHOLE_BEFORE)})`);
  console.log(`       near-band ink share ${ink.nearShare.toFixed(3)}`
    + `  (W2c ${P1_NEAR_BEFORE.toFixed(3)})`);
  console.log('       footprint mass balance '
    + `${sign(massBal.shipped)}  (W2c ${sign(massBal['W2c (before)'])})`);

  await t.dbg('setVenue(\'table\')');
}
