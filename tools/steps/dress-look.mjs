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

// THE DRESSING'S OWN REVIEW SET. tower-family-shots.mjs answers "does this
// tower belong to the family"; this answers "does each PROP earn its
// triangles", which is a different question and needs a different distance —
// the resting eye for the honest verdict (a prop nobody can see there is a
// prop that does not exist), and a close eye per cluster to judge the make.
//
// The named eyes are per tower and per cluster, because the props are on
// three different faces at three different heights and one lens cannot ask
// about all of them.
//
//   node tools/drive.mjs tools/steps/dress-look.mjs [tower]
//
// Writes shots/dress-<tower>-*.png (gitignored).

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

// [name, dist, height, xoff] for __diceDebug.towerEye.
const EYES = {
  heartwood: [
    ['cresset', 9, 9.4, 5.2],
    ['ivy', 9, 3.2, -5.6],
    ['hoist', 10, 10.2, -3.4],
    ['crown', 11, 12.5, -3.0],
  ],
  bastion: [
    ['gonfalon', 10, 11.6, 4.4],
    ['shields', 9, 8.0, -4.6],
    ['sconce', 8, 8.6, -3.2],
    ['crown', 11, 13.0, 2.6],
  ],
  blackanvil: [
    ['crown-smoke', 13, 13.6, 3.0],
    ['tools', 8, 5.8, -4.2],
    ['door', 8, 3.4, 3.0],
    ['base', 9, 2.0, -5.0],
  ],
};

export default async function run(stage, args) {
  const tower = args[0] || 'heartwood';
  mkdirSync(SHOTS, { recursive: true });
  const t = await stage.tab('localhost', 'DressLook');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  await t.dbg(`setTower('${tower}')`);
  await t.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: `${tower} socketed` });
  await t.dbg('sim(1500)');

  const shot = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    console.log(await stage.shot(t, join(SHOTS, name)));
  };
  // 1. THE VERDICT FRAME: the resting eye, which is the distance every prop
  //    has to survive. Everything after this is diagnosis.
  await shot(`dress-${tower}-0-resting-eye.png`);
  for (const [name, d, h, x] of EYES[tower] || []) {
    await t.dbg(`towerEye(${d}, ${h}, ${x})`);
    await shot(`dress-${tower}-${name}.png`);
  }
  // …and the idle motion, two frames a third of a sway apart, so a swaying
  // prop can be SEEN to sway rather than asserted to.
  await t.dbg('setZoom("medium")');
  await t.dbg('sim(600)');
  await shot(`dress-${tower}-sway-a.png`);
  await t.dbg('sim(180)');
  await shot(`dress-${tower}-sway-b.png`);
  console.log(`\nshots in ${SHOTS}`);
}
