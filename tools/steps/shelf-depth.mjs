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

// C25 — AT WHAT DEPTH DOES THE SHELF BREAK? shelf-fit.mjs shows the 5-roll
// worst case is a fused block; the question that decides whether a SMALLER
// shelf is a real option is whether two or three collected rolls are fine.
// Slots are ranks, so reflowShelf recompacts: N rolls occupy slots 0..N-1 at
// the fixed pitch, and the pitch does not widen when the shelf is emptier.
//
//   node tools/drive.mjs tools/steps/shelf-depth.mjs [zoom] [pool]

export default async function run(stage, [zoom = 'medium', pool = '3d6']) {
  const a = await stage.tab('localhost', 'Depth');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.dbg(`setZoom(${JSON.stringify(zoom)})`);

  for (let n = 1; n <= 5; n++) {
    await a.roll(pool);
    const rid = await a.rollId();
    await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
    await a.waitFor(
      `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === ${n}`
        + ` && window.__diceDebug.whiskingCount === 0)`,
      { desc: `shelved ${n}` },
    );
    const g = await a.dbg('shelfFit');
    const gap = g.clusters.length > 1
      ? Math.min(...g.clusters.slice(1).map((c, i) => c.x0 - g.clusters[i].x1))
      : null;
    console.log(`${n} roll(s) of ${pool} @ ${zoom}: `
      + `overlaps ${g.overlaps.length ? g.overlaps.join(',') : 'none'}`
      + `  tightest neighbour gap ${gap === null ? '—' : gap.toFixed(2)}`
      + `  clusters ${g.clusters.map((c) => `${c.x0}..${c.x1}`).join(' | ')}`);
    console.log('  ' + await stage.shot(a, `shelf-depth-${zoom}-${n}.png`));
  }
}
