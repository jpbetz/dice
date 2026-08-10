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

// DOES THE MAT FIT THE VIEW? `applyCameraFraming` pulls the eye back until
// every framing point is inside NDC, but `fitCameraTo` scans a BOUNDED range
// (1 + i*0.03, i < 90 → ~3.67×) and, by its own comment, "the eye stays where
// the last step left it rather than retreating without end". If the range is
// exhausted the loop exits having fitted nothing, silently.
//
// Prints, per viewport × zoom: the worst mat corner's |NDC.x| and |NDC.y|
// (> 1 is off screen), where the eye ended up, and whether it is parked at
// the scan's maximum — which is the signature of a fit that gave up.
//
//   node tools/drive.mjs tools/steps/mat-fits.mjs

const VIEWPORTS = [
  { name: 'desktop 1600', w: 1600, h: 1000, mini: false },
  { name: 'laptop  1440', w: 1440, h: 900, mini: false },
  { name: 'ipad-p   834', w: 834, h: 1112, mini: true },
  { name: 'phone    390', w: 390, h: 844, mini: true },
  { name: 'phone    360', w: 360, h: 780, mini: true },
];
const ZOOMS = ['wide', 'medium', 'close'];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Fits');
  const rows = [];

  for (const vp of VIEWPORTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));
    for (const z of ZOOMS) {
      await a.dbg(`setZoom(${JSON.stringify(z)})`);
      await new Promise((r) => setTimeout(r, 200));
      const r = await a.dbg('matFit()');
      rows.push({
        view: vp.name,
        zoom: z.padEnd(6),
        felt: r.view,
        worstX: r.worstX.toFixed(3),
        worstY: r.worstY.toFixed(3),
        fits: r.fits ? 'fits' : 'OFF SCREEN',
        camY: r.camY.toFixed(1),
        maxed: r.atScanLimit ? 'FIT GAVE UP' : '',
        price: r.fits ? '—'
          : r.needScale === null ? 'unreachable'
          : `${r.spanNow}px → ${r.spanFitted}px  (${(r.spanFitted / r.spanNow * 100).toFixed(0)}%)`,
      });
    }
  }

  await a.dbg('setPanelState({pools: true, log: true})');
  await a.dbg(`setZoom('medium')`);

  const head = ['viewport', 'zoom', 'felt px', '|ndc.x|', '|ndc.y|', 'mat', 'camY', 'scan', 'die span if contained'];
  const w = head.map((h, i) => Math.max(h.length,
    ...rows.map((x) => String(Object.values(x)[i]).length)));
  const line = (c) => c.map((v, i) => String(v).padEnd(w[i])).join('  ');
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  for (const x of rows) console.log(line(Object.values(x)));
}
