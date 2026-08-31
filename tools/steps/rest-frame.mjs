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

// WHAT THE RETREAT BUYS AND WHAT IT COSTS, on the frame a phone spends most of
// its time in: the resting felt, which ruling (1) also makes the frame of every
// throw's flight. See __diceDebug.restFrameProbe.
//
//   node tools/drive.mjs tools/steps/rest-frame.mjs

const VIEWPORTS = [
  { name: 'phone 390', w: 390, h: 844, mini: true },
  { name: 'ipad-p 834', w: 834, h: 1112, mini: true },
  { name: 'desktop 1600', w: 1600, h: 1000, mini: false },
];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Rest');
  for (const vp of VIEWPORTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await a.dbg("setZoom('medium')");
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));
    await a.dbg('clearTable()');
    await a.dbg('sim(300)');
    const p = await a.dbg('restFrameProbe()');
    console.log('');
    console.log(`  ${vp.name}  felt ${p.view}  mat ${p.table}`);
    console.log('  orientation  scale  ndcX  ndcY  fits  spanPx');
    for (const r of p.rows) {
      console.log(`  ${r.orbit.padEnd(11)}  ${String(r.scale).padEnd(5)}  ${String(r.ndcX).padEnd(4)}  ${String(r.ndcY).padEnd(4)}  ${(r.fits ? 'yes' : '—').padEnd(4)}  ${r.span}`);
    }
  }
  await a.dbg('setPanelState({pools: true, log: true})');
  console.log('');
}
