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

// The Sheet Pass states: ghost tiles on the shelves, the identity strip
// (simple + complex), the creation card, and the manage bar.
//
//   node tools/drive.mjs tools/steps/sheet-shots.mjs

import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Alice');
  const send = (m, p) => a.page.browser.send(m, p, a.page.sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const beat = (ms = 350) => new Promise((r) => setTimeout(r, ms));

  // fresh seat: the Soul Deal rack with its ghost tiles
  await a.dbg('sim(30)');
  await beat();
  console.log(await stage.shot(a, join(OUT_DIR, 'sheet-rack.png')));

  // the identity strip on a simple pool (rank ladder)
  const wis = (await a.dbg('groups')).find((g) => g.name === 'Wisdom');
  await a.dbg(`poolPopoverOpen(${JSON.stringify(wis.id)})`);
  await beat();
  console.log(await stage.shot(a, join(OUT_DIR, 'sheet-strip.png')));

  // the creation card on the Skills shelf
  await a.dbg('closePopover()');
  await a.dbg(`openCreation('skills')`);
  await a.eval(`(() => { const i = document.querySelector('#groups-list .cc-name');
    i.value = 'Archery'; })()`);
  await beat();
  console.log(await stage.shot(a, join(OUT_DIR, 'sheet-create.png')));

  // manage mode: the standing bar + grown ✕s, no pencils
  await a.eval(`document.querySelector('#groups-list .cc-cancel').click()`);
  await a.dbg('setPoolsEditMode(true)');
  await beat();
  console.log(await stage.shot(a, join(OUT_DIR, 'sheet-manage.png')));
}
