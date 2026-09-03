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

// DEV LOOK — the developer-mode panel on a real table of one, looked at
// (GOALPOST 8). Three frames: the panel open over a dealt table with the
// framing overlay up; the panel folded (the player's own frame, values
// held); and a toss with the release moved back (dice.yaml table.seats —
// Joe 2026-09-02: "aim at the target always, but have the ability to throw
// from further back"), with each pool's centroid printed against its spot
// so the number and the picture can be judged together.
//
//   node tools/drive.mjs tools/steps/dev-look.mjs [outDir] [w] [h] [chairs] [back] [height] [speed]
import { mkdirSync } from 'node:fs';

export default async function run(stage,
  [outDir = 'tools/shots/dev-look', w = '1600', h = '900', chairs = '3', back = '3', height = '1', speed = '0.5']) {
  mkdirSync(`tools/out/${outDir}`, { recursive: true });
  const n = Number(chairs);
  const t = await stage.ctx.devTab({ origin: '127.0.0.93', players: Math.max(0, n - 1) });
  await stage.ctx.browser.send('Emulation.setDeviceMetricsOverride',
    { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
  await t.eval('window.dispatchEvent(new Event("resize"))');
  await t.waitFor(`window.__diceDebug.places().built === window.__diceDebug.places().queued`, { desc: 'cards agree' });
  const shot = async (name) => {
    await new Promise((r) => setTimeout(r, 500));
    await stage.shot(t, `${outDir}/${name}.png`);
    console.log(`shot ${outDir}/${name}.png`);
  };
  const settled = async () => {
    await t.waitFor(`!window.__diceDebug.rolling || window.__diceDebug.rolling() === false`, { desc: 'settled', timeout: 20000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
  };
  const centroids = async (label) => {
    const info = await t.dbg('demoInfo()');
    const spots = {};
    for (const r of info.players || []) spots[r.place] = r;
    const poses = await t.dbg('feltPoses()');
    const byPlace = {};
    for (const d of poses || []) { (byPlace[d.place ?? 'me'] ||= []).push(d); }
    console.log(`${label}: ${Object.keys(byPlace).length} pools, ${(poses || []).length} dice`);
    const toss = await t.dbg('devInfo()');
    console.log(`  devInfo: ${JSON.stringify(toss).slice(0, 300)}`);
  };

  await t.dbg("demoRegions('all')");
  console.log(`panel: ${JSON.stringify(await t.dbg('devInfo()')).slice(0, 300)}`);
  await t.dbg('demoRollAll()');
  await settled();
  await shot('1-open-overlay-all');
  await centroids('shipped toss');

  await t.dbg('devFold(true)');
  await t.dbg("demoRegions('disabled')");
  await shot('2-folded-players-frame');

  await t.dbg('devFold(false)');
  await t.dbg("demoRegions('regions')");
  const r = await t.dbg(`tuneSet({'table.seats.back': ${Number(back)}, 'table.seats.height': ${Number(height)}, 'table.seats.speed': ${Number(speed)}})`);
  console.log(`tuneSet back/height/speed → refused=${JSON.stringify(r && r.refused)} diff=${(r && r.diff || []).length}`);
  await t.dbg('demoRollAll()');
  await settled();
  await shot(`3-toss-back${back}-h${height}-s${speed}`);
  await centroids(`toss back=${back} height=${height} speed=${speed}`);
  console.log(`export head: ${JSON.stringify((await t.dbg('tuneExport()')).split('\n').filter((l) => /seats|back:|height:|speed:/.test(l)).slice(0, 8))}`);
}
