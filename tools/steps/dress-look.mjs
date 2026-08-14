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

// THE DRESSING'S OWN REVIEW SET. tower-family-shots.mjs answers "does this
// tower belong to the family"; this answers "does each PROP earn its
// triangles", which is a different question and needs a different distance —
// the resting eye for the honest verdict (a prop nobody can see there is a
// prop that does not exist), and a close eye per cluster to judge the make.
//
//   node tools/drive.mjs tools/steps/dress-look.mjs [tower]
//
// Writes shots/dress-<tower>-*.png (gitignored).
//
// EVERY CLUSTER NAMES ITS SUBJECT, AND THE SUBJECT IS MEASURED ON SCREEN.
// The eyes used to be twelve hand-typed triples aimed at features by memory,
// and one of them — the Hollow Bole's `tongue` — aimed at a feature that had
// been retired into the GLB bake: the tool shot it, printed the filename, and
// exited 0, so the review set carried a frame of nothing that read exactly
// like a frame of something. Nothing in the loop could tell the difference,
// because nothing in the loop ever asked WHERE the thing was.
//
// So each cluster now declares one of:
//
//   node   a named node in the socketed tower. Its meshes are located through
//          __diceDebug.groundGaps, which walks the group and reports each
//          mesh's world x/z and its LOWEST point. That is a conservative box
//          — the floors of the meshes, not their tops — and it is the engine's
//          own answer rather than a number typed here.
//   at     a point derived from the portal spec, for the engine-owned features
//          a bake does not name: the tongue is the delivery outrun, which
//          lives between the door plane and lip.front, wherever this model put
//          them.
//
// The eye is then DERIVED from that subject and CHECKED by projection.
// towerEye has a fixed lookAt, so framing is a standoff choice, not an aim:
// the step walks a short ladder of poses and keeps the one that puts the most
// of the subject inside the frame, largest. The chosen eye and the subject's
// screen extent in px are printed with each shot — so a frame of nothing is a
// printed `extent 0px`, a subject that no longer exists is a NOTE naming it
// instead of a plausible picture, and either one fails the step.

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

// The poses tried. towerEye's lookAt is FIXED (it aims at the bore, above the
// door), so a close subject and a low one need different standoffs AND
// different camera heights to land inside the frame at all: a low prop seen
// from a low eye is under the bottom edge, and backing off is only one of the
// two ways out. Each candidate is MEASURED by projection and the best one
// wins, so this is a short search over poses rather than a solver — and,
// unlike the twelve triples it replaces, it cannot go stale against a model
// that moved its props.
const STANDOFFS = [7, 9, 12, 16, 21];
const HEIGHT_LIFTS = [0.35, 1.5, 3.5, 6];

// [name, subject] per tower. A subject is {node} or {at(spec)}.
const CLUSTERS = {
  heartwood: [
    // The cresset, the ivy and the moss are the named dress groups this skin
    // builds; the wood itself carries the crown.
    ['dress', { node: 'towerSkinDress' }],
    ['ivy', { node: 'dressIvyLeaves' }],
    ['moss', { node: 'dressMossTufts' }],
    ['wood', { node: 'towerSkinWood' }],
  ],
  bastion: [
    ['dress', { node: 'towerSkinDress' }],
    ['growth', { node: 'dressWallGrowth' }],
    ['stone', { node: 'towerSkinStone' }],
  ],
  blackanvil: [
    ['dress', { node: 'towerSkinDress' }],
    ['coal', { node: 'dressCoalHeap' }],
    ['forge', { node: 'towerSkinForge' }],
  ],
  hollowbole: [
    // THE FIRST BAKED TOWER, so its clusters are split across the two things
    // that build it: the trunk and its shelves came out of Blender, the crown
    // moot and the little door are still code-side dress under towerSkinDress.
    ['dress', { node: 'towerSkinDress' }],
    ['bole', { node: 'towerSkinBoleShell' }],
    ['shelves', { node: 'towerSkinBoleShelves' }],
    // THE TONGUE IS THE ENGINE'S, NOT THE MODEL'S. The delivery ramp a die
    // rides out is the apron/lip pair, and the bake clads them — so the eye
    // comes from the spec: the outrun runs from the door plane (z0) forward to
    // lip.front, and its middle is where a die is when it arrives on felt.
    ['tongue', { at: (s) => [
      [s.portals.out.x - s.derived.door.w / 2, s.derived.door.sill, s.derived.z0],
      [s.portals.out.x + s.derived.door.w / 2, s.derived.door.sill, s.derived.z0],
      [s.portals.out.x, 0, s.derived.lipFrontZ],
    ] }],
  ],
};

// The subject's points, in world space, or null when it is not there any more.
// Each mesh contributes its two x extremes as well as its centre, so a
// ONE-MESH node still has a real horizontal span — otherwise every such
// subject would report `extent 0px`, which is the alarm this step raises for
// a subject that is not there, and an alarm that cries wolf is not an alarm.
async function locate(t, sub, spec) {
  if (sub.at) return sub.at(spec);
  const g = await t.dbg(`groundGaps(${JSON.stringify(sub.node)})`);
  if (!g || !g.n) return null;
  return g.all.flatMap((m) => [
    [m.x - m.w / 2, m.minY, m.z], [m.x, m.minY, m.z], [m.x + m.w / 2, m.minY, m.z],
  ]);
}

export default async function run(stage, args) {
  const tower = args[0] || 'heartwood';
  mkdirSync(SHOTS, { recursive: true });
  const t = await stage.tab('localhost', 'DressLook');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  await t.dbg(`setTower('${tower}')`);
  // A baked row does not socket in the tick it is asked for.
  for (let i = 0; i < 60; i++) {
    const st = await t.dbg(`towerModelStatus('${tower}')`);
    if (st && st.ready) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await t.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: `${tower} socketed` });
  await t.dbg('sim(1500)');

  const shot = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    console.log(await stage.shot(t, join(SHOTS, name)));
  };
  // 1. THE VERDICT FRAME: the resting eye, which is the distance every prop
  //    has to survive. Everything after this is diagnosis.
  await shot(`dress-${tower}-0-resting-eye.png`);

  const spec = await t.dbg(`towerPortalSpec(${JSON.stringify(tower)})`);
  if (!spec) {
    console.log(`BAD: '${tower}' has no portal spec`);
    process.exitCode = 1;
    return;
  }
  // A tower with no CLUSTERS entry gets the resting eye + sway frames only —
  // SAY so instead of degrading silently (the per-cluster looks are the whole
  // point of this tool; an id missing here is a review set with a hole in it,
  // and somebody should be told to add the entry).
  if (!CLUSTERS[tower]) {
    console.log(`NOTE: no per-cluster entry for '${tower}' — add one to `
      + 'tools/steps/dress-look.mjs when its dress ships; resting eye only.');
  }

  let missing = 0;
  for (const [name, sub] of CLUSTERS[tower] || []) {
    const pts = await locate(t, sub, spec);
    if (!pts) {
      missing++;
      console.log(`NOTE: ${name}: nothing named '${sub.node}' is in this tower — `
        + 'no frame taken (extent 0px). Retired, renamed, or never built: fix the '
        + 'entry rather than reviewing a picture of whatever was behind it.');
      continue;
    }
    // The subject's box, from the points the engine gave back.
    const at = (i) => pts.map((p) => p[i]);
    const c = [0, 1, 2].map((i) => (Math.min(...at(i)) + Math.max(...at(i))) / 2);
    const size = Math.max(...[0, 1, 2].map((i) => Math.max(...at(i)) - Math.min(...at(i))), 1);
    // Stand off to the subject's own side and search the poses. The winner is
    // the one that gets the MOST of the subject inside the frame, and among
    // those the one where it is BIGGEST — a cluster look is worthless if the
    // prop is forty pixels of a wide shot.
    const xoff = Math.max(-6, Math.min(6, c[0] * 1.6 + (c[0] >= 0 ? 2 : -2)));
    const project = `JSON.stringify(${JSON.stringify(pts)}`
      + '.map((p) => window.__diceDebug.worldToScreen(p[0], p[1], p[2])))';
    let best = null;
    for (const dist of STANDOFFS) {
      for (const lift of HEIGHT_LIFTS) {
        const height = Math.max(1.4, c[1] + size * lift);
        await t.dbg(`towerEye(${dist}, ${height.toFixed(2)}, ${xoff.toFixed(2)})`);
        const scr = JSON.parse(await t.eval(project));
        const inFrame = scr.filter((s) => s.in).length;
        const xs = scr.map((s) => s.px.x), ys = scr.map((s) => s.px.y);
        const extent = Math.round(Math.max(Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys)));
        const cand = { dist, height, inFrame, extent, n: pts.length };
        if (!best || cand.inFrame > best.inFrame
          || (cand.inFrame === best.inFrame && cand.extent > best.extent)) best = cand;
      }
    }
    await t.dbg(`towerEye(${best.dist}, ${best.height.toFixed(2)}, ${xoff.toFixed(2)})`);
    console.log(`${name}: eye(${best.dist}, ${best.height.toFixed(2)}, ${xoff.toFixed(2)}) `
      + `subject ${best.inFrame}/${best.n} points in frame, extent ${best.extent}px`);
    if (!best.inFrame) {
      missing++;
      console.log(`NOTE: ${name}: the subject is OFF SCREEN at every pose tried `
        + `— the frame below is not of it (extent ${best.extent}px means nothing here)`);
    }
    await shot(`dress-${tower}-${name}.png`);
  }

  // …and the idle motion, two frames a third of a sway apart, so a swaying
  // prop can be SEEN to sway rather than asserted to.
  await t.dbg('setZoom("medium")');
  await t.dbg('sim(600)');
  await shot(`dress-${tower}-sway-a.png`);
  await t.dbg('sim(180)');
  await shot(`dress-${tower}-sway-b.png`);
  console.log(`\nshots in ${SHOTS}`);
  if (missing) {
    console.log(`BAD: ${missing} cluster(s) framed nothing — a review set with a hole in it`);
    process.exitCode = 1;
  }
}
