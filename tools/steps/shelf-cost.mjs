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

// C25 — WHAT THE SHELF COSTS, in the only unit that answers "can I see the
// dice": `dieSpanPx`, the on-screen width of one die at the mat's centre
// (the same probe the zoom ladder was tuned against).
//
// applyCameraFraming pulls the eye back until EVERY framing point fits, so
// the hungriest point sets the view for everything. Six of the eight belong
// to the shelf. This walks viewport × zoom × panel-state and prints, for
// each, the span today vs. the span the same table would give if the shelf
// were not on the felt.
//
//   node tools/drive.mjs tools/steps/shelf-cost.mjs

const VIEWPORTS = [
  { name: 'desktop  1600x1000', w: 1600, h: 1000 },
  { name: 'laptop   1280x800 ', w: 1280, h: 800 },
  { name: 'ipad-p    834x1112', w: 834, h: 1112 },
  { name: 'phone     390x844 ', w: 390, h: 844 },
];
const ZOOMS = ['wide', 'medium', 'close'];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Cost');
  const rows = [];

  for (const vp of VIEWPORTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    // The felt is a layout REGION beside the panel; a resize has to land
    // before the camera refits against it.
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));
    for (const panels of [true, false]) {
      await a.dbg(`setPanelState({pools: ${panels}, log: ${panels}})`);
      await new Promise((r) => setTimeout(r, 150));
      for (const z of ZOOMS) {
        await a.dbg(`setZoom(${JSON.stringify(z)})`);
        await new Promise((r) => setTimeout(r, 150));
        const c = await a.dbg('framingCost()');
        rows.push({
          vp: vp.name,
          panel: panels ? 'panel' : 'mini ',
          zoom: z.padEnd(6),
          felt: c.view,
          today: c.today.span,
          noPill: c.noPill.span,
          noShelf: c.noShelf.span,
          gain: `${(c.noShelf.span / c.today.span).toFixed(2)}x`,
        });
      }
    }
  }

  await a.dbg('setPanelState({pools: true, log: true})');
  await a.dbg(`setZoom('medium')`);

  const head = ['viewport', 'state', 'zoom', 'felt px', 'today', 'no pill', 'no shelf', 'gain'];
  const w = head.map((h, i) => Math.max(h.length,
    ...rows.map((r) => String(Object.values(r)[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ');
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of rows) console.log(line(Object.values(r)));
}
