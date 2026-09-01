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

// TWO PEOPLE ROLL AT ONCE — Joe's own two-tab, 3d6-each frame (UX §7.63 v2).
// The picture he judged the deployed table on, re-taken: two seated tabs at
// stations 0 and 1, the front rolls 3d6, then the back rolls 3d6, and BOTH
// pools have to be on the felt, each in its roller's own region, from both
// chairs. Beside every shot the numbers a look cannot be trusted without:
//
//   the die       — a d6's on-screen edge (spanPx × 1.35, the repo's die read)
//   the cards     — every card's projected face box in px (placardFrame)
//   the pools     — dice per roll on the felt, each pool's centroid in world
//                   units and whether it lies in its roller's region
//   the frame     — the camera mode/scale the dice-first ladder rested on
//                   with two pools to frame
//
//   node tools/drive.mjs tools/steps/place-two-rolls.mjs [outDir] [width] [height] [zoom]
//
// Shots: <tag>-idle-front, <tag>-flight-back (the back's throw mid-air, seen
// from the front chair), <tag>-both-front, <tag>-both-back — for `desk`
// (width × height, default 1600×900) and `phone` (390×844, panels folded).
// Looks + simulates (two throws per frame size).

import { mkdirSync } from 'node:fs';
import { entryFor, regionFor, inRegion } from '../../js/places.js';

export default async function run(stage, [outDir = 'tools/shots/place-two-rolls', w = '1600', h = '900', zoom = 'medium']) {
  mkdirSync(outDir, { recursive: true });
  const frame = async (t, ww, hh) => {
    await t.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: Number(ww), height: Number(hh), deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
    await t.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));
  };
  const shot = async (t, name) => {
    await new Promise((r) => setTimeout(r, 300));
    await stage.shot(t, `${outDir}/${name}.png`);
  };
  const front = await stage.tab('127.0.0.91', 'Front');
  await frame(front, w, h);
  await front.waitFor('window.__diceDebug.places().mine === 0', { desc: 'front seated' });
  const back = await stage.tab('127.0.0.92', 'Back');
  await frame(back, w, h);
  await back.waitFor('window.__diceDebug.places().mine === 1', { desc: 'back seated' });
  const tabs = [[front, 'front'], [back, 'back']];
  for (const [t] of tabs) {
    await t.waitFor('window.__diceDebug.places().stations.length === 2 && window.__diceDebug.places().built === window.__diceDebug.places().queued',
      { desc: 'two cards standing' });
  }
  await front.dbg(`setZoom(${JSON.stringify(zoom)})`);
  for (const [t] of tabs) await t.waitFor(`window.__diceDebug.zoom === ${JSON.stringify(zoom)}`, { desc: `zoom ${zoom}` });
  const ext = await front.dbg('tableExtents()');
  const regionOf = (place) => { const e = entryFor(place, false); return regionFor(e.entry, e.lane, ext.w, ext.d); };
  console.log(`# zoom ${zoom}: mat ${ext.w} x ${ext.d}; region 0 ${JSON.stringify(regionOf(0))}; region 1 ${JSON.stringify(regionOf(1))}`);

  const measure = async (t, tag) => {
    const f = await t.dbg('framingInfo()');
    console.log(`  ${tag} frame: mode ${f.mode} scale ${f.camScale} orbit ${f.orbit} — a d6 edge is ${Math.round(f.spanPx * 1.35)} px`);
    const p = await t.dbg('places()');
    for (const s of p.stations) {
      const c = await t.dbg(`placardFrame(${s.place})`);
      console.log(`  ${tag} card ${s.place}${s.place === p.mine ? '*' : ' '} ${Math.round(c.px.x1 - c.px.x0)}x${Math.round(c.px.y1 - c.px.y0)} px `
        + `at (${Math.round(c.px.x0)},${Math.round(c.px.y0)}) in ${c.in}`);
    }
    const poses = await t.dbg('feltPoses()');
    const byRoll = new Map();
    for (const d of poses) { if (!byRoll.has(d.rollId)) byRoll.set(d.rollId, []); byRoll.get(d.rollId).push(d); }
    const rollers = await t.dbg('onTable');
    for (const [rid, dice] of byRoll) {
      const cx = dice.reduce((s, d) => s + d.pos[0], 0) / dice.length;
      const cz = dice.reduce((s, d) => s + d.pos[2], 0) / dice.length;
      const mine = (rollers.find((r) => r.rollId === rid) || {}).mine;
      const inA = inRegion(regionOf(0), cx, cz);
      const inB = inRegion(regionOf(1), cx, cz);
      console.log(`  ${tag} pool ${rid.slice(0, 8)}${mine ? ' (mine)' : ''}: ${dice.length} dice, centroid (${cx.toFixed(2)}, ${cz.toFixed(2)})`
        + ` — in region 0: ${inA}, in region 1: ${inB}`);
    }
    return { poses };
  };

  for (const [ww, hh, tag] of [[w, h, 'desk'], ['390', '844', 'phone']]) {
    console.log(`# ${tag} ${ww}x${hh}`);
    for (const [t] of tabs) await frame(t, ww, hh);
    for (const [t] of tabs) await t.dbg(`setPanelState({pools: ${tag !== 'phone'}, log: ${tag !== 'phone'}})`);
    await new Promise((r) => setTimeout(r, 350));
    for (const [t] of tabs) await t.dbg('holdClock(true)');
    await measure(front, `${tag}/idle/front`);
    await shot(front, `${tag}-idle-front`);

    // Waits are keyed on each roll's OWN dice: the felt holds one roll per
    // place, and on the second frame size the server still holds the first
    // frame's rolls open (the clear below is this tab's, not the room's).
    const diceOf = (rid, n) => `window.__diceDebug.tableDice.filter((d) => d.rollId === ${JSON.stringify(rid)}).length === ${n}`;
    const rollFrom = async (t, notation) => {
      await t.dbg(`commandRoll(${JSON.stringify(notation)})`);
      await t.waitFor('!!window.__diceDebug.currentRoll', { desc: `${notation} reaches the roller` });
      return t.rollId();
    };
    const ridA = await rollFrom(front, '3d6 # Front');
    for (const [t] of tabs) {
      await t.waitFor(`(window.__diceDebug.sim(120), !window.__diceDebug.busy && ${diceOf(ridA, 3)})`,
        { desc: 'the front\'s throw is at rest', timeout: 60000 });
    }
    const ridB = await rollFrom(back, '3d6 # Back');
    // Mid-flight, from the front chair: the other player's dice coming in.
    await front.waitFor(`(window.__diceDebug.sim(1), ${diceOf(ridB, 3)})`, { desc: 'the back\'s dice appear', timeout: 30000 });
    await front.dbg('sim(14)');
    await shot(front, `${tag}-flight-back`);
    for (const [t] of tabs) {
      await t.waitFor(`(window.__diceDebug.sim(120), !window.__diceDebug.busy && ${diceOf(ridB, 3)} && ${diceOf(ridA, 3)})`,
        { desc: 'both throws at rest', timeout: 60000 });
    }
    for (const [t] of tabs) await t.dbg('sim(60)');
    await new Promise((r) => setTimeout(r, 400));
    const a = await measure(front, `${tag}/both/front`);
    const b = await measure(back, `${tag}/both/back`);
    console.log(`  ${tag} feltPoses byte-equal across the two chairs: ${JSON.stringify(a.poses) === JSON.stringify(b.poses)}`);
    await shot(front, `${tag}-both-front`);
    await shot(back, `${tag}-both-back`);
    for (const [t] of tabs) await t.dbg('holdClock(false)');
    for (const [t] of tabs) { await t.dbg('clearTable()'); await t.settle(); await t.dbg('sim(240)'); }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`# shots in ${outDir}`);
}
