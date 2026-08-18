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

// IS THE TOWER ROOTED? — the claim stated in the FRAME, per
// docs/VENUE-COMPOSITION.md rules 9/11 and, above all, rule 15: a composition
// gate has to FAIL the frame that was rejected or it is measuring something
// else.
//
//   node tools/drive.mjs tools/steps/rooted.mjs                # both venues
//   node tools/drive.mjs tools/steps/rooted.mjs moonrise       # one
//   node tools/drive.mjs tools/steps/rooted.mjs shots          # + write frames
//
// THE VERDICT IT ANSWERS. Joe, 2026-08-18, on the round-6 grounding work:
// *"It's still a set piece in my eyes… nothing to make it feel rooted."* Set
// piece is a screen-space claim, so this is a screen-space instrument.
//
// WHAT IT MEASURES, and why it is a RATIO of two renders rather than a reading
// of one. The glade's moon is a spotlight that pools on the clearing, so the
// ground near the tower is legitimately about twice as bright as the ground
// nine hundred pixels away — an absolute "is it dark at the foot" reading
// certifies whatever the lamp happens to be doing and says nothing about the
// object. Three frames per venue instead:
//
//     A   tower up, contact shadow on      the shipped frame
//     B   tower up, contact shadow hidden  THE REJECTED FRAME, reproduced
//     C   tower hidden                     the same ground, unshadowed
//
// The tower's own silhouette comes out of (B vs C) — every pixel the tower
// paints — and its LOWEST pixel per column is the CONTACT LINE. Then the ground
// below that line is read as R(k) = lum(A) / lum(C) at k pixels outward: the
// lamp, the fog, the moss and the mist all divide out, and what is left is the
// only thing an object does to the ground it stands on.
//
// THE THREE GATES, and what each one is for:
//
//   G1 SEAM      median R over k ∈ [4, 18] px      ≤ 0.78
//                Contact darkening. The one thing in a picture that nothing
//                else does, and the thing this tower had none of.
//   G2 REACH     first k where R ≥ 0.96            ≥ 70 px
//                A shadow, not an outline. A tall blocker shades its soil for
//                units, slowly; a dark line at the seam reads as a sticker
//                with a drop shadow.
//   G3 DEPTH     Σ(1 − R) over k ∈ [4, 220]        ≥ 18 px
//                How much darkening there IS, integrated. G1 can be met by a
//                hard line at the seam and G2 by a wash too faint to see; this
//                is the one that says the two arrived together.
//   G4 NO RIM    R non-decreasing from k = 4 out   within 0.025
//                Rule 4's pasted-prop rim, in both directions: no lit halo
//                between the object and its shadow, and no hard outer edge
//                where the darkening stops. **DECLARED A FLOOR** — a frame
//                with no shadow at all trivially has no rim, so this one can
//                never discriminate and does not count toward the three. Rule
//                15a says a floor has to print itself as one; this one prints
//                itself as one in its own header.
//
// Each gate runs TWICE — once on A/C and once on B/C — and the suite FAILS if
// fewer than three NON-FLOOR gates separate the two, because a gate the
// rejected frame also passes is a floor and not evidence (rule 15a). Measured
// on the tree that collected the verdict, the B leg reads R ≈ 1.000 at every k:
// the tower changed 0.058% of the frame outside its own footprint, all of it
// fringe. That is the finding this file exists to keep true.

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

// The band the seam is read over, in device pixels. k starts at 4 rather than
// 0 because the contact line itself is one antialiased row of the MODEL and
// reading it would grade the wood, not the ground.
const K0 = 4, K1 = 18;
// 0.78 IS NOT A ROUND NUMBER, IT IS WHAT THE VENUE ALLOWS. Rendering the
// contact ring fully OPAQUE and black still only takes the ground to 0.70x,
// because `faeMoonShaft` — the moonbeam column over the resolve area — is a
// translucent volume between the eye and that ground and adds its light after
// the ground is shaded (hide the shaft and the same quad reads 0.59; the ground
// itself falls 0.272 → 0.158). So the whole usable range at this seam is
// [0.70, 1.00] and this threshold sits four fifths of the way down it.
const SEAM_MAX = 0.78;
const REACH_MIN = 70;
const DEPTH_MIN = 18;
const RIM_TOL = 0.025;
const KMAX = 220;          // how far out R is sampled
const MIN_COLS = 60;       // a verdict needs a stretch of contact, not a pixel

// ---------------------------------------------------------------------------
// zero-dep PNG decode (node:zlib is built in) — the same reader
// tools/steps/glade-frame.mjs carries, kept local so neither step can break
// the other by tuning its own.
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
    throw new Error(`rooted: unexpected PNG (depth ${bitDepth}, color ${colorType})`);
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

const lum = (im, x, y) => {
  const i = (y * im.w + x) * im.bpp;
  return (0.2126 * im.px[i] + 0.7152 * im.px[i + 1] + 0.0722 * im.px[i + 2]) / 255;
};
const diff = (a, b, x, y) => {
  const i = (y * a.w + x) * a.bpp;
  return Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]),
    Math.abs(a.px[i + 2] - b.px[i + 2]));
};
const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((p, q) => p - q);
  return s[s.length >> 1];
};

// THE CONTACT LINE, per column: the lowest pixel the TOWER paints. Read off
// (B vs C) so it is the model's own silhouette and never its shadow — which is
// the whole point, since the shadow is what is being graded below it.
function contactLine(B, C) {
  const cols = new Map();
  for (let x = 0; x < B.w; x++) {
    let lowest = -1, n = 0;
    for (let y = 0; y < B.h; y++) {
      if (diff(B, C, x, y) > 6) { lowest = y; n++; }
    }
    // A column needs real vertical extent to be the tower rather than a stray
    // antialiased fringe on a mushroom the venue moved by a pixel.
    if (n >= 40 && lowest > 0 && lowest < B.h - KMAX - 2) cols.set(x, lowest);
  }
  return cols;
}

// R(k) profile, averaged over every column of contact.
function profile(A, C, cols) {
  const sum = new Float64Array(KMAX + 1);
  const cnt = new Int32Array(KMAX + 1);
  for (const [x, y0] of cols) {
    for (let k = 0; k <= KMAX; k++) {
      const y = y0 + k;
      if (y >= A.h) break;
      const den = lum(C, x, y);
      if (den < 0.02) continue;      // the void carries no information
      sum[k] += lum(A, x, y) / den;
      cnt[k]++;
    }
  }
  const R = new Array(KMAX + 1).fill(NaN);
  for (let k = 0; k <= KMAX; k++) if (cnt[k]) R[k] = sum[k] / cnt[k];
  return R;
}

function grade(R) {
  const seam = [];
  for (let k = K0; k <= K1; k++) if (Number.isFinite(R[k])) seam.push(R[k]);
  const G1 = median(seam);
  let G2 = KMAX;
  for (let k = K0; k <= KMAX; k++) {
    if (Number.isFinite(R[k]) && R[k] >= 0.96) { G2 = k; break; }
  }
  let G3 = 0;
  for (let k = K0; k <= KMAX; k++) if (Number.isFinite(R[k])) G3 += Math.max(0, 1 - R[k]);
  // The rim test walks a 12-px stride so single-pixel noise cannot trip it.
  let worst = 0;
  for (let k = K0 + 12; k <= Math.min(KMAX, G2 + 40); k += 12) {
    if (!Number.isFinite(R[k]) || !Number.isFinite(R[k - 12])) continue;
    const drop = R[k - 12] - R[k];
    if (drop > worst) worst = drop;
  }
  return { G1, G2, G3, G4: worst };
}

export default async function run(stage, args) {
  const wantShots = args.includes('shots');
  const only = args.find((a) => a === 'moonrise' || a === 'foxfire');
  const venues = only ? [only] : ['moonrise', 'foxfire'];
  mkdirSync(SHOTS, { recursive: true });

  const t = await stage.tab('localhost', 'Rooted');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  const shot = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    const p = await stage.shot(t, wantShots ? join(SHOTS, name) : name);
    return decodePng(readFileSync(p));
  };

  let bad = 0;
  for (const venue of venues) {
    await t.dbg(`setVenue('${venue}')`);
    await t.waitFor(`window.__diceDebug.venue === '${venue}'`, { desc: `${venue} staged` });
    await t.dbg(`setTower('hollowbole')`);
    await t.waitFor(`window.__diceDebug.tower === 'hollowbole'`, { desc: 'tower up' });
    await t.dbg('sim(1500)');

    // THE SHADOW IS THERE AT ALL, asserted before anything is graded: a step
    // that silently found zero nodes would report the rejected frame twice and
    // call it a pass.
    const n = await t.eval(`window.__diceDebug.setVisibleByName('aoContactShadow', true)`);
    if (Number(n) !== 1) {
      console.log(`${venue}: BAD — expected exactly 1 aoContactShadow node, found ${n}`);
      bad++;
    }
    const A = await shot(`rooted-${venue}-shipped.png`);
    await t.eval(`window.__diceDebug.setVisibleByName('aoContactShadow', false)`);
    const B = await shot(`rooted-${venue}-rejected.png`);
    await t.eval(`window.__diceDebug.setVisibleByName('towerSkin', false)`);
    const C = await shot(`rooted-${venue}-noground.png`);
    await t.eval(`window.__diceDebug.setVisibleByName('towerSkin', true)`);
    await t.eval(`window.__diceDebug.setVisibleByName('aoContactShadow', true)`);

    const cols = contactLine(B, C);
    console.log(`\n=== ${venue} === contact columns: ${cols.size}`);
    if (cols.size < MIN_COLS) {
      console.log(`  BAD — only ${cols.size} columns of contact found (want ≥ ${MIN_COLS}); `
        + 'the mask is wrong, not the tower');
      bad++;
      continue;
    }
    const Rs = profile(A, C, cols), Rr = profile(B, C, cols);
    const ship = grade(Rs);
    const rej = grade(Rr);
    if (args.includes('dump')) {
      const ks = [2, 4, 8, 12, 18, 26, 40, 60, 90, 130, 180, 220];
      console.log(`  k        ${ks.map((k) => String(k).padStart(6)).join('')}`);
      console.log(`  shipped  ${ks.map((k) => (Rs[k] ?? NaN).toFixed(3).padStart(6)).join('')}`);
      console.log(`  rejected ${ks.map((k) => (Rr[k] ?? NaN).toFixed(3).padStart(6)).join('')}`);
    }
    const rows = [
      ['G1 seam      median R, k 4..18', ship.G1, rej.G1, `≤ ${SEAM_MAX}`,
        ship.G1 <= SEAM_MAX, rej.G1 <= SEAM_MAX, false],
      ['G2 reach     first k with R ≥ 0.96', ship.G2, rej.G2, `≥ ${REACH_MIN} px`,
        ship.G2 >= REACH_MIN, rej.G2 >= REACH_MIN, false],
      ['G3 depth     Σ(1−R) over k 4..220', ship.G3, rej.G3, `≥ ${DEPTH_MIN} px`,
        ship.G3 >= DEPTH_MIN, rej.G3 >= DEPTH_MIN, false],
      ['G4 no rim    worst R drop outward', ship.G4, rej.G4, `≤ ${RIM_TOL}`,
        ship.G4 <= RIM_TOL, rej.G4 <= RIM_TOL, true],
    ];
    let discriminating = 0;
    for (const [id, sv, rv, want, sOk, rOk, isFloor] of rows) {
      const fmt = (n2) => (Number.isFinite(n2) ? n2.toFixed(3) : 'n/a');
      const disc = !isFloor && sOk && !rOk;
      if (disc) discriminating++;
      const tail = isFloor ? '   ← FLOOR, declared'
        : disc ? '   ← discriminates'
          : (sOk && rOk ? '   ← FLOOR, undeclared — fix the gate' : '');
      console.log(`  ${id.padEnd(36)} shipped ${fmt(sv).padStart(7)} ${sOk ? 'PASS' : 'FAIL'}`
        + `   rejected ${fmt(rv).padStart(7)} ${rOk ? 'pass' : 'FAIL'}`
        + `   want ${want}${tail}`);
      if (!sOk) bad++;
    }
    // RULE 15a, enforced. Every gate here was written against a frame that had
    // been rejected; if the rejected frame passes them all, the gates describe
    // the lamp and not the tower.
    if (discriminating < 3) {
      console.log(`  BAD — only ${discriminating}/3 non-floor gates discriminate; a gate `
        + 'the rejected frame also passes is a floor, not evidence (rule 15a)');
      bad++;
    }
  }
  const errs = t.page.errors.concat(t.page.consoleErrors);
  if (errs.length) { console.log(`\nPAGE ERRORS: ${errs.join(' | ')}`); bad++; }
  console.log(bad === 0 ? '\nROOTED' : `\nBAD: ${bad} problem(s)`);
  if (bad) process.exitCode = 1;
}
