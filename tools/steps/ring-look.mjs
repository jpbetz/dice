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

// THE ROUND TABLE, LOOKED AT. One dev tab (developer mode, docs/DEVMODE.md);
// stand a table of N for each N asked, shoot it with the overlay on; then
// throw from every seat at one N and shoot the rests.
//   node tools/drive.mjs tools/steps/ring-look.mjs [outDir] [w] [h] [Ns] [throwN]
//
// N is CHAIRS AT THE TABLE: chair 0 is the viewer's own real seat and the
// cast is dealt around it at 1..N−1 (N=0 is the solo table of one: nobody
// dealt). A throw from chair 0 is the viewer's own and goes through the
// server; the others are the cast's, stamped locally.

import { mkdirSync } from 'node:fs';

export default async function run(stage,
  [outDir = 'tools/shots/ring-look', w = '1600', h = '900', ns = '2,3,6,8', throwN = '3']) {
  mkdirSync(`tools/out/${outDir}`, { recursive: true });   // stage.shot writes under tools/out/
  const t = await stage.ctx.devTab({ origin: '127.0.0.91', players: 1 });
  await stage.ctx.browser.send('Emulation.setDeviceMetricsOverride',
    { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
  await t.eval('window.dispatchEvent(new Event("resize"))');
  // The overlay starts DISABLED (the panel's overlay row and the door agree);
  // this step's measurement is pool-against-spot, so the REGIONS layer is
  // switched on here — not `all`, which would put the framing hull over the
  // very spots this step is looking at.
  await t.dbg("demoRegions('regions')");
  const shot = async (name) => {
    await new Promise((r) => setTimeout(r, 400));
    await stage.shot(t, `${outDir}/${name}.png`);
    console.log(`shot ${outDir}/${name}.png`);
  };
  const deal = async (n) => {
    await t.dbg(`demoDeal(${n === 0 ? 0 : n - 1})`);   // the viewer holds chair 0
    await t.waitFor(`window.__diceDebug.places().built === window.__diceDebug.places().queued`,
      { desc: `cards agree at N=${n}` });
    await new Promise((r) => setTimeout(r, 300));
  };
  for (const n of ns.split(',').map(Number)) {
    await deal(n);
    const p = await t.dbg('places()');
    console.log(`N=${n}: ${JSON.stringify(p).slice(0, 400)}`);
    const rf = await t.dbg('framingInfo()');
    const rp = await t.dbg('fitProbe()');
    console.log(`  rest framing N=${n}: mode=${rf.mode} matFits=${rf.matFits} camScale=${rf.camScale} target=${JSON.stringify(rf.target)} eye=${JSON.stringify(rf.eye)} | probe ok=${rp.ok} eye=${JSON.stringify(rp.eye)} worst=${JSON.stringify(rp.pts.reduce((a, q) => (Math.max(Math.abs(q[2]), Math.abs(q[3])) > Math.max(Math.abs(a[2]), Math.abs(a[3])) ? q : a)))}`);
    await shot(`ring-${n}-seat0`);
    if (n === 0) {
      // Solo: the one player's own roll, tossed as seat 0 of 1.
      await t.roll('3d6');
      await t.settle();
      await new Promise((r) => setTimeout(r, 400));
      const fi = await t.dbg('framingInfo()');
      console.log(`solo framing: ${JSON.stringify(fi).slice(0, 300)}`);
      await shot('ring-solo-thrown');
    }
  }
  const n = Number(throwN);
  await deal(n);
  // THE MEASUREMENT: after each seat throws, where did its pool come to rest
  // against the spot it was tossed at? Centroid distance and per-die
  // distances, in world units (a d6 is ~1.35 wide).
  const overlay = await t.dbg('demoInfo()');
  const spots = new Map(((overlay.overlay && overlay.overlay.stations) || []).map((r) => [r.seat, r.spot]));
  for (let k = 0; k < n; k++) {
    const before = new Set((await t.dbg('feltPoses()')).map((d) => `${d.rollId}:${d.i}`));
    await t.dbg(`demoRoll(${k}, "3d6")`);
    await t.settle();
    await new Promise((r) => setTimeout(r, 300));
    const mine = (await t.dbg('feltPoses()')).filter((d) => !before.has(`${d.rollId}:${d.i}`));
    const spot = spots.get(k);
    if (!spot || !mine.length) { console.log(`seat ${k}: no spot/dice (${mine.length})`); continue; }
    const cx = mine.reduce((a, d) => a + d.pos[0], 0) / mine.length;
    const cz = mine.reduce((a, d) => a + d.pos[2], 0) / mine.length;
    const dc = Math.hypot(cx - spot.x, cz - spot.z);
    const dd = mine.map((d) => Math.hypot(d.pos[0] - spot.x, d.pos[2] - spot.z).toFixed(2));
    console.log(`seat ${k}: centroid ${dc.toFixed(2)} from spot (r_spot ${Math.hypot(spot.x, spot.z).toFixed(2)}, centroid r ${Math.hypot(cx, cz).toFixed(2)}); dice ${dd.join(' ')}`);
    const fi = await t.dbg('framingInfo()');
    console.log(`  framing: ${JSON.stringify(fi).slice(0, 500)}`);
    const fp = await t.dbg('fitProbe()');
    console.log(`  fitProbe: ok=${fp.ok} eye=${JSON.stringify(fp.eye)} worst=${JSON.stringify(fp.pts.reduce((a, q) => (Math.max(Math.abs(q[2]), Math.abs(q[3])) > Math.max(Math.abs(a[2]), Math.abs(a[3])) ? q : a)))}`);
  }
  await new Promise((r) => setTimeout(r, 500));
  await shot(`ring-${n}-thrown`);
  await t.dbg('demoSit(1)');
  await t.waitFor('window.__diceDebug.places().mine === 1', { desc: 'seated at 1' });
  await shot(`ring-${n}-thrown-seat1`);
}
