/*
 * Copyright 2026 The Dice Table Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// PRICE THE PORTRAIT ROLL. The phone's problem is an ASPECT MISMATCH, not a
// distance: |ndc.y| 0.24-0.27 against |ndc.x| 1.28 means three quarters of the
// screen height is unused while the mat spills out the sides. Rolling the view
// 90 degrees should take the mismatch from 5.0 to 1.84 — 2.7x, before any
// retreat. This measures whether that survives contact.
//
//   node tools/drive.mjs tools/steps/portrait-roll.mjs

const PHONES = [
  { name: 'phone 390', w: 390, h: 844 },
  { name: 'phone 360', w: 360, h: 800 },
];
const POOLS = ['1d20', '1d8+1d6+1d10', '6d6', '20d6', '40d6'];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Roll');
  await a.dbg('setAutoCollectMs(0)');
  for (const vp of PHONES) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg('setPanelState({pools: false, log: false})');
    await a.dbg("setZoom('medium')");
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));

    for (const pool of POOLS) {
      await a.dbg('clearTable()'); await a.dbg('sim(300)');
      await a.roll(pool); await a.dbg('sim(9000)'); await a.dbg('sim(1500)');
      const read = async () => {
        const f = JSON.parse(await a.eval('JSON.stringify(window.__diceDebug.framingInfo())'));
        return { span: f.spanPx, on: f.diceOnScreen, n: f.dice, hero: f.decidingOnScreen, mode: f.mode, matFits: f.matFits };
      };
      await a.eval('window.__diceDebug.setCamOrbit(0)'); await a.dbg('sim(1200)');
      const flat = await read();
      await a.eval(`window.__diceDebug.setCamOrbit(${Math.PI / 2})`); await a.dbg('sim(1200)');
      const rolled = await read();
      await a.eval('window.__diceDebug.setCamOrbit(0)');
      console.log(
        `  ${vp.name}  ${pool.padEnd(13)} `
        + `ACROSS ${String(flat.span).padStart(3)}px ${flat.on}/${flat.n} mat=${flat.matFits ? 'fits' : 'NO'} ${flat.mode.padEnd(13)} `
        + `ALONG  ${String(rolled.span).padStart(3)}px ${rolled.on}/${rolled.n} mat=${rolled.matFits ? 'fits' : 'NO'} ${rolled.mode.padEnd(13)} `
        + `gain=${(rolled.span / flat.span).toFixed(2)}x`);
    }
  }
}
