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

// THE THREE MOMENTS OF A ROLL ON A PHONE, as pictures. The numbers say the
// flight frame now equals the settled frame and that no die sits in fog; what
// they cannot say is whether the RESTING felt — which the mat fit no longer
// retreats for — still reads as a table rather than as a close-up of cloth.
//
//   node tools/drive.mjs tools/steps/phone-look.mjs
//
// Writes shots/p-<view>-{rest,flight,settled}.png

const VIEWPORTS = [
  { name: '390', w: 390, h: 844, mini: true },
  { name: '834', w: 834, h: 1112, mini: true },
];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'PhoneLook');
  for (const vp of VIEWPORTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await a.dbg("setZoom('medium')");
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 300));

    await a.dbg('clearTable()');
    await a.dbg('sim(300)');
    await stage.shot(a, `p-${vp.name}-rest.png`);

    await a.dbg('throwSeeded(["d6","d6","d6"], 7002)');
    await a.dbg('sim(22)');
    await stage.shot(a, `p-${vp.name}-flight.png`);

    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc: `${vp.name} settle`, timeout: 40000 });
    await a.dbg('sim(400)');
    await stage.shot(a, `p-${vp.name}-settled.png`);
  }
  await a.dbg('setPanelState({pools: true, log: true})');
  console.log('  shots/p-*.png written');
}
