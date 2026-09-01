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

// THE VIEW FROM EVERY CHAIR (docs/UX.md §7.63 — per-viewer orientation).
// Three real tabs seated at the front (0), the back (1) and the right head
// (4, behind two bytes-only players), on the 1600×900 frame the design priced.
// Prints the numbers the orientation slice is judged on — each tab's place
// base, the orbit the ladder rested on, the die span in px (the short-edge
// tax — measured −23% at every zoom once the span was read along the
// camera's right axis; M2's 98 → 68 was the world-x segment), the fog floor per chair,
// the lamp's nudge — and saves the frames a human has to look at: every chair
// idle at three zooms, one throw from the front seen mid-flight and at rest
// from all three chairs, and the remaining chairs through simulatePlaceView.
//
//   node tools/drive.mjs tools/steps/place-view.mjs [outDir] [width] [height]
//
// A gate is a number; whether a table read from the far side still reads as
// THE table — the names the right way up, your own card nearest, the dice
// coming in over the roller's edge — is a picture, and this saves it.

import { mkdirSync } from 'node:fs';

export default async function run(stage, [outDir = 'tools/shots/place-view', w = '1600', h = '900']) {
  mkdirSync(outDir, { recursive: true });
  const frame = async (t) => {
    await t.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
    await t.eval('window.dispatchEvent(new Event("resize"))');
  };
  const shot = async (t, name) => {
    await new Promise((r) => setTimeout(r, 300));
    await stage.shot(t, `${outDir}/${name}.png`);
  };

  const front = await stage.tab('127.0.0.91', 'Front');
  await frame(front);
  await front.waitFor('window.__diceDebug.places().mine === 0', { desc: 'front seated' });
  const back = await stage.tab('127.0.0.92', 'Back');
  await frame(back);
  await back.waitFor('window.__diceDebug.places().mine === 1', { desc: 'back seated' });
  for (const nm of ['Cass', 'Dev']) await stage.ctx.rawPlayer(nm);
  const head = await stage.tab('127.0.0.93', 'Eluned');
  await frame(head);
  await head.waitFor('window.__diceDebug.places().mine === 4', { desc: 'head seated' });
  const tabs = [[front, 'front'], [back, 'back '], [head, 'head ']];
  for (const [t] of tabs) {
    await t.waitFor('window.__diceDebug.places().stations.length === 5', { desc: 'five at the table' });
    await t.waitFor('window.__diceDebug.places().built === window.__diceDebug.places().queued',
      { desc: 'cards agree with the roster' });
  }

  const row = async (t, tag) => {
    const f = await t.dbg('framingInfo()');
    const p = await t.dbg('places()');
    const b = await t.dbg('breathProbe()');
    console.log(`  ${tag} mine ${p.mine} base ${f.placeOrbit} orbit ${f.orbit} reader ${(+p.readerOrbit).toFixed(2)}`
      + ` span ${String(f.spanPx).padStart(3)}px scale ${f.camScale} camY ${f.camY} mode ${f.mode}`
      + ` fits ${f.matFits} floor ${b.matFogFloor.toFixed(2)} fogNear ${b.fogNear.toFixed(2)}`
      + ` lamp [${b.lampAt.map((c) => c.toFixed(2)).join(',')}] motes [${(b.moteLampAt || []).map((c) => c.toFixed(2)).join(',')}]`);
    const own = await t.dbg(`placardFrame(${p.mine})`);
    console.log(`        own card face ndc y[${own.ndc.y0.toFixed(3)},${own.ndc.y1.toFixed(3)}] cx ${own.cx.toFixed(3)} in ${own.in}`);
    return f;
  };

  // ---- idle, three zooms — the short-edge tax --------------------------------
  console.log('# idle frames per chair (the head pays the short-edge tax: spanPx 195 -> 150 at medium, -23%)');
  const tax = [];
  for (const z of ['wide', 'medium', 'close']) {
    await front.dbg(`setZoom('${z}')`);
    for (const [t] of tabs) await t.waitFor(`window.__diceDebug.zoom === '${z}'`, { desc: `zoom ${z}` });
    await new Promise((r) => setTimeout(r, 200));
    console.log(`# ${z}`);
    const spans = {};
    for (const [t, tag] of tabs) {
      const f = await row(t, tag);
      spans[tag.trim()] = f.spanPx;
      await shot(t, `01-idle-${z}-${tag.trim()}`);
    }
    tax.push(`${z}: front ${spans.front}px -> head ${spans.head}px (${Math.round((spans.head / spans.front - 1) * 100)}%), back ${spans.back}px`);
    const probe = await head.dbg('restFrameProbe()');
    const at1 = (label) => probe.rows.find((r) => r.orbit === label && r.scale === 1);
    console.log(`  restFrameProbe s=1: landscape ${at1('landscape').span}px fits ${at1('landscape').fits}`
      + ` | portrait ${at1('portrait').span}px fits ${at1('portrait').fits}`
      + ` | landscape-back ${at1('landscape-back').span}px fits ${at1('landscape-back').fits}`
      + ` | portrait-left ${at1('portrait-left').span}px fits ${at1('portrait-left').fits}`);
  }
  console.log('# THE SHORT-EDGE TAX, resting frame, 1600x900:');
  for (const t of tax) console.log(`  ${t}`);
  await front.dbg(`setZoom('medium')`);
  for (const [t] of tabs) await t.waitFor(`window.__diceDebug.zoom === 'medium'`, { desc: 'medium' });

  // ---- one throw from the front, seen from three chairs ----------------------
  // Held clock, so "mid-flight" is a frame and not a race, on every tab.
  for (const [t] of tabs) await t.dbg('holdClock(true)');
  await front.dbg('commandRoll("4d6 # From the front")');
  for (const [t] of tabs) {
    await t.waitFor('(window.__diceDebug.sim(1), window.__diceDebug.tableDice.length === 4)',
      { desc: 'the throw is on the felt', timeout: 30000 });
  }
  for (const [t, tag] of tabs) { await t.eval('window.__diceDebug.sim(14)'); await shot(t, `02-flight-${tag.trim()}`); }
  for (const [t, tag] of tabs) { await t.eval('window.__diceDebug.sim(16)'); await shot(t, `03-wash-${tag.trim()}`); }
  for (const [t] of tabs) {
    await t.waitFor('(window.__diceDebug.sim(60), !window.__diceDebug.busy)', { desc: 'settled', timeout: 60000 });
    await t.eval('window.__diceDebug.sim(120)');
  }
  console.log('# at rest, after a 4d6 from the front');
  const felt = [];
  for (const [t, tag] of tabs) {
    await row(t, tag);
    console.log(`        throwOrigin ${JSON.stringify(await t.dbg('throwOrigin()'))}`);
    felt.push(JSON.stringify(await t.dbg('feltPoses()')));
    await shot(t, `04-rest-${tag.trim()}`);
  }
  console.log(`# feltPoses byte-equal across the three chairs: ${felt.every((s) => s === felt[0])}`);
  for (const [t] of tabs) await t.dbg('holdClock(false)');

  // ---- the chairs nobody is sitting in, from the front tab -------------------
  await front.dbg('clearTable()');
  await front.settle();
  for (const n of [2, 3, 5]) {
    const s = await front.dbg(`simulatePlaceView(${n})`);
    console.log(`# simulatePlaceView(${n}) -> orbit ${s.orbit.toFixed(2)}`);
    await row(front, `sim${n}`);
    await shot(front, `05-sim-place-${n}`);
  }
  console.log(`# handed back: ${JSON.stringify(await front.dbg('simulatePlaceView(null)'))}`);
  await row(front, 'front');
  console.log(`# shots in ${outDir}`);
}
