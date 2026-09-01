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

// THE PLACARD LOOK PASS (docs/UX.md §7.63). Stands a full house of eight
// cards, prints the numbers the `placard-look` scenario gates on, and saves
// the frames a human has to judge: the object at three zooms, the six- and
// eight-place pictures from other people's chairs (via simulatePlaceView —
// three concurrent tabs is the harness ceiling), and the wash mid-film.
//
//   node tools/drive.mjs tools/steps/place-look.mjs [outDir] [width] [height]
//
// A composition gate is a number; a PICTURE is what says whether a small brass
// object on a felt table reads as an object at all. This step is the second
// half — it exists so the judgement is made against frames somebody actually
// looked at, in the light the app ships.

import { mkdirSync } from 'node:fs';

const NAMES = ['Bram', 'Cassiopeia Winterbourne', 'Dev', 'Eluned', 'Fionn', 'Gus', 'Hana'];

export default async function run(stage, [outDir = 'tools/shots/place', w = '1600', h = '900']) {
  mkdirSync(outDir, { recursive: true });
  const a = await stage.tab('localhost', 'Ann');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false }, a.page.sessionId);

  const shot = async (name) => {
    await new Promise((r) => setTimeout(r, 350));
    await stage.shot(a, `${outDir}/${name}.png`);
  };

  // ---- one card, then a full house --------------------------------------
  await a.waitFor('window.__diceDebug.places().mine === 0', { desc: 'seated at the front' });
  await shot('01-alone');
  for (const nm of NAMES) await stage.ctx.rawPlayer(nm);
  await a.waitFor('window.__diceDebug.places().stations.length === 8', { desc: 'eight seated' });

  console.log('# station  name / painted / fontPx / world');
  for (const s of (await a.dbg('places()')).stations) {
    console.log(`  ${s.place} ${s.station.padEnd(5)} ${JSON.stringify(s.name).padEnd(26)}`
      + ` ${JSON.stringify(s.shown).padEnd(26)} ${String(s.fontPx).padStart(2)}`
      + ` (${s.world.x.toFixed(2)}, ${s.world.y.toFixed(3)}, ${s.world.z.toFixed(2)})`
      + ` yaw ${s.yaw.toFixed(2)}${s.mine ? '  *mine' : ''}`);
  }
  console.log('# budget', JSON.stringify(await a.dbg('placardBudget()')));

  // ---- the standoff numbers, per zoom ------------------------------------
  for (const z of ['wide', 'medium', 'close']) {
    await a.dbg(`setZoom('${z}')`);
    await new Promise((r) => setTimeout(r, 300));
    const pl = await a.dbg('places()');
    const rows = [];
    for (const s of pl.stations) {
      const f = await a.dbg(`placardFrame(${s.place})`);
      rows.push(`${s.place}${s.mine ? '*' : ' '}${s.station.padEnd(5)}`
        + ` y[${f.ndc.y0.toFixed(3)},${f.ndc.y1.toFixed(3)}]`
        + ` x[${f.ndc.x0.toFixed(3)},${f.ndc.x1.toFixed(3)}]`);
    }
    console.log(`# ${z} ${JSON.stringify(await a.dbg('tableExtents()'))}: ${rows.join('  ')}`);
    await shot(`02-house-${z}`);
  }
  await a.dbg(`setZoom('wide')`);

  // ---- other people's chairs ---------------------------------------------
  for (const p of [1, 4, 6]) {
    await a.dbg(`simulatePlaceView(${p})`);
    await shot(`03-from-place-${p}`);
  }
  await a.dbg('simulatePlaceView(null)');

  // ---- the wash, mid-film -------------------------------------------------
  // Ann's own throw, held on a frozen clock so the arc can be photographed
  // where its envelope peaks rather than wherever the frame rate landed.
  // NOT `roll()` — the harness's helper drives the film to its end, and a cue
  // that lasts exactly as long as the film is over by the time it returns.
  await a.dbg('holdClock(true)');
  await a.dbg('commandRoll("4d6 # Mine")');
  await a.waitFor('(window.__diceDebug.sim(1), window.__diceDebug.tableDice.length === 4)',
    { desc: 'the throw is on the felt', timeout: 30000 });
  await shot('04-wash-open');
  await a.eval('window.__diceDebug.sim(30)');
  console.log('# wash', JSON.stringify(await a.dbg('washInfo()')));
  console.log('# throwOrigin', JSON.stringify(await a.dbg('throwOrigin()')));
  await shot('05-wash-peak');
  await a.waitFor('(window.__diceDebug.sim(60), !window.__diceDebug.busy)',
    { desc: 'the throw settles', timeout: 60000 });
  await a.eval('window.__diceDebug.sim(120)');
  console.log('# wash after', JSON.stringify(await a.dbg('washInfo()')));
  await shot('06-settled');
  await a.dbg('holdClock(false)');
  console.log(`# shots in ${outDir}`);
}
