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

// C25 — DOES THE SHELF STILL FIT THE MAT IT IS DERIVED FROM?
//
// SHELF_PITCH is (TABLE_W - SHELF_SLOT_W) / (SHELF_SLOTS - 1), and the zoom
// ladder has taken TABLE_W from 30 to 8.6 while SHELF_SLOT_W stayed 5.4. This
// fills all five slots at each zoom and reports, per zoom: the pitch, the
// actual x-extent of each shelved cluster, how much of the mat's DEPTH the
// shelf band claims, and whether neighbouring clusters overlap.
//
//   node tools/drive.mjs tools/steps/shelf-fit.mjs [zoom,zoom,…]

const ZOOMS = ['wide', 'medium', 'close'];

export default async function run(stage, [only]) {
  const a = await stage.tab('localhost', 'Fit');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.dbg('setBannerRetireMs(0)');

  for (const zoom of (only ? only.split(',') : ZOOMS)) {
    await a.dbg(`setZoom(${JSON.stringify(zoom)})`);
    await a.dbg('clearTable()');
    await new Promise((r) => setTimeout(r, 200));

    // Five rolls, each collected — the shelf's stated capacity.
    for (let i = 0; i < 5; i++) {
      await a.roll('3d6');
      const rid = await a.rollId();
      await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === ${i + 1}`
          + ` && window.__diceDebug.whiskingCount === 0)`,
        { desc: `${zoom}: shelved ${i + 1}` },
      );
    }

    const geo = await a.dbg('shelfFit');
    console.log(`\n=== ${zoom}  mat ${geo.tableW}x${geo.tableD}  pitch ${geo.pitch}`
      + `  slot ${geo.slotW}x${geo.slotD}`);
    console.log(`  band z ${geo.bandZ0} .. ${geo.bandZ1}  =  ${geo.bandDepth} of ${geo.tableD}`
      + `  (${geo.bandShare} of the mat's depth)`);
    console.log(`  trays span x ${geo.trayX0} .. ${geo.trayX1} of ±${geo.tableW / 2}`);
    for (const c of geo.clusters) {
      console.log(`  slot ${c.slot}: centre ${c.cx}  dice x ${c.x0}..${c.x1}`
        + `  z ${c.z0}..${c.z1}  ${c.outsideMat ? 'OFF THE MAT' : ''}`);
    }
    console.log(`  overlapping neighbours: ${geo.overlaps.length ? geo.overlaps.join(', ') : 'none'}`);
    console.log(`  dice resting ON another die: ${geo.stacked} of ${geo.diceOnShelf}`);
    console.log(await stage.shot(a, `shelf-full-${zoom}.png`));
  }
  await a.dbg(`setZoom('medium')`);
}
