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

// Collected-roll panel review (Joe 2026-08-04: 'the panels for the
// collected rolls are a mess — maybe make them more like reveal panels'):
// the result banner (the reveal panel) and the peek card side by side, in
// the per-die default system AND a totals system, plus a crowded shelf.
//
//   node tools/drive.mjs tools/steps/shelf-panel-shots.mjs

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

export default async function run(stage) {
  const dir = join(OUT_DIR, 'shelf-panels');
  mkdirSync(dir, { recursive: true });
  const a = await stage.tab('localhost', 'Joe');
  const send = (m, p) => a.page.browser.send(m, p, a.page.sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const beat = (ms = 400) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    await beat();
    console.log(await stage.shot(a, join(dir, name)));
  };
  await a.dbg('setPanelState({pools: true})');

  // 1 · per-die system (default): the banner after a settle
  await a.roll('4d6 # ambush in the reeds');
  await a.settle();
  await shot('01-banner-perdie.png');

  // 2 · collect it; pin its peek — the two panels for the SAME roll
  const rid1 = await a.rollId();
  await a.dbg(`collectRoll(${JSON.stringify(rid1)})`);
  await a.waitFor(
    `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
    { desc: 'shelved' },
  );
  await a.dbg(`peek(${JSON.stringify(rid1)})`);
  await shot('02-peek-perdie.png');
  await a.dbg('peek(null)');

  // 3 · totals system: banner with DC verdict, then its peek
  await a.dbg(`setSystem('dnd')`);
  await a.roll('2d8+3 dc12 # cutting the rope');
  await a.settle();
  await shot('03-banner-dnd.png');
  const rid2 = await a.rollId();
  await a.dbg(`collectRoll(${JSON.stringify(rid2)})`);
  await a.waitFor(
    `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 2 && window.__diceDebug.whiskingCount === 0)`,
    { desc: 'second shelved' },
  );
  await a.dbg(`peek(${JSON.stringify(rid2)})`);
  await shot('04-peek-dnd.png');
  await a.dbg('peek(null)');

  // 4 · a held roll collected: the peek carrying Reveal in its fold
  await a.roll('1d20 held');
  await a.settle();
  const rid3 = await a.rollId();
  await a.dbg(`collectRoll(${JSON.stringify(rid3)})`);
  await a.waitFor(
    `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 3 && window.__diceDebug.whiskingCount === 0)`,
    { desc: 'third shelved' },
  );
  await a.dbg(`peek(${JSON.stringify(rid3)})`);
  await shot('05-peek-held.png');
  await a.dbg('peek(null)');

  // 5 · the crowded shelf at rest — three markers over their clusters
  await shot('06-shelf-rest.png');
}
