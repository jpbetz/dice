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

// WHAT THE STANDARD EDGE COSTS (ROADMAP §9c). A round edge is SEGS real arc
// strips per edge plus a corner dome, so it multiplies the render mesh — the
// bench measured 132 → 468 verts on a d6, 3.5×. This prices that on the thing
// that ships: forty dice on felt.
//
//   node tools/drive.mjs tools/steps/edge-price.mjs [count] [type]   (default 40 d20)
//
// Four numbers, and only two of them are budgets:
//
//  · THE SHAPE, per type — the RESOLVED geo recipe beside its vertex count
//    and its `minY`, the lowest point of the render mesh in its own frame.
//    minY is NOT a budget, it is an EQUALITY: the physics hull does not know
//    the mesh exists, so a recipe that moved a mesh's extent would have moved
//    where the die visibly meets the felt while the body kept resting exactly
//    where it always did. Every recipe insets INTO the base solid (the fillet's
//    Bézier stays inside hull(q1, ctrl, q2)), so this number must not move.
//  · DRAW CALLS. A mesh's vertex count does not change how many draws it
//    takes — a die is one mesh in `faces+1` material groups either way — so
//    this number is the check that the change stayed in the vertex buffer.
//    Read after a settle (draw-price.mjs's trap 2: mid-playback frames draw
//    more) and never after sim(), which ticks with render=false.
//  · TRIANGLES. This one really does move, and it is the honest price.
//  · FRAME INTERVALS, sampled from real rAF during playback and at rest.
//    READ THESE AS A STRESS TEST, NOT AS A PLAYER'S FRAME. Headless Chrome
//    rasterises in SOFTWARE (SwiftShader), where triangle count costs far more
//    than it does on any GPU a player owns — a 40× d20 felt runs ~2 fps here.
//    That is exactly why it is worth measuring: it is the most pessimistic
//    reading of a change that adds triangles, so a ratio that is small HERE is
//    smaller everywhere.
//
// Deterministic seed so before/after are the same throw.

const SEED = 90090;

const pct = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

// Real rAF frame intervals for `ms`, measured in the page. NOT sim() — sim
// ticks with render=false, so a frame it advanced was never drawn.
const sampleFrames = (t, ms) => t.eval(`new Promise((res) => {
  const d = [];
  const t0 = performance.now();
  let last = t0;
  const step = (now) => {
    d.push(now - last); last = now;
    if (now - t0 < ${ms}) requestAnimationFrame(step); else res(JSON.stringify(d));
  };
  requestAnimationFrame(step);
})`).then((s) => JSON.parse(s).slice(1)); // drop the first: it times the call, not a frame

export default async function edgePrice(stage, args) {
  const count = Number(args[0]) || 40;
  const type = args[1] || 'd20';
  const pool = `${count}× ${type}`;
  const t = await stage.tab('localhost', 'Pricer');
  // A stated viewport: a frame judged at the harness default is a judgement
  // about the harness.
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
  await t.eval('window.dispatchEvent(new Event("resize"))');
  await t.settle();

  // --- the shape, per type ---------------------------------------------
  // Priced on `shroud` rather than `std`: both wear the standard edge, and a
  // table that has drawn its pool tiles has already built every std variant,
  // so a "cold build" timed on std would be timing a cache hit.
  const cold = JSON.parse(await t.eval(`(() => {
    const t0 = performance.now();
    const s = window.__diceDebug.dieGeoStats('shroud');
    return JSON.stringify({ ms: +(performance.now() - t0).toFixed(1), s });
  })()`));
  const stats = await t.dbg(`dieGeoStats('std')`);
  const types = Object.keys(stats);
  const edge = stats[types[0]].geo;
  console.log(`THE STANDARD EDGE: ${JSON.stringify(edge)}`);
  console.log(`  (7 die types built cold in ${cold.ms} ms — geometry is cached per type|variant,`);
  console.log('   so this is paid once per page, not once per die)\n');
  console.log('type   verts   tris        r      minY   recipe');
  console.log('-----  ------  -----  --------  --------  ------------------------------');
  let totalVerts = 0;
  const minYs = new Set();
  for (const type of types) {
    const s = stats[type];
    totalVerts += s.verts;
    minYs.add(s.minY);
    console.log(`${type.padEnd(5)}  ${String(s.verts).padStart(6)}  ${String(s.tris).padStart(5)}`
      + `  ${s.r.toFixed(4).padStart(8)}  ${s.minY.toFixed(4).padStart(8)}  ${JSON.stringify(s.geo)}`);
  }
  console.log(`total  ${String(totalVerts).padStart(6)}`);
  console.log(`\nMESH EXTENTS (minY): ${[...minYs].map((v) => v.toFixed(4)).join(', ')}`
    + '\n  An EQUALITY, not a budget — compare it against the previous run.');

  // --- what a frame costs ------------------------------------------------
  const audit = (label) => t.dbg('renderAudit()').then((a) => {
    console.log(`${label.padEnd(30)} calls=${String(a.calls).padStart(4)}`
      + `  tris=${String(a.triangles).padStart(6)}  passes=${a.passes}`
      + `  geos=${a.geometries}  dpr=${a.pixelRatio}`);
    return a;
  });

  console.log('\n--- the frame, before and with the pool ---');
  const empty = await audit('empty felt');

  // throwSeeded, not commandRoll: one seed is one film, so before and after
  // are provably the same throw and the frame numbers are comparable.
  await t.dbg(`throwSeeded(${JSON.stringify(Array(count).fill(type))}, ${SEED})`);
  const flight = await sampleFrames(t, 6000);
  await t.settle();
  const rest = await sampleFrames(t, 6000);
  const loaded = await audit(`${pool} settled`);
  const n = await t.diceCount();

  console.log(`\n${n} dice on the felt`);
  console.log(`  dice triangles      ${loaded.triangles - empty.triangles} `
    + `(${loaded.triangles} loaded − ${empty.triangles} empty)`);
  console.log(`  dice draw calls     ${loaded.calls - empty.calls} `
    + `(${loaded.calls} loaded − ${empty.calls} empty)`);
  const row = (label, xs) => console.log(`  ${label.padEnd(18)} `
    + `n=${String(xs.length).padStart(3)}  med=${pct(xs, 50).toFixed(1)} ms`
    + `  p95=${pct(xs, 95).toFixed(1)} ms  max=${Math.max(...xs).toFixed(1)} ms`
    + `  (${(1000 / pct(xs, 50)).toFixed(1)} fps)`);
  row('frames in flight', flight);
  row('frames at rest', rest);

  console.log('\nRe-run: node tools/drive.mjs tools/steps/edge-price.mjs '
    + `${count} ${type}   (seed ${SEED})`);
}
