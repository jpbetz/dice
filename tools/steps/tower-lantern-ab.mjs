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

// THE LANTERN A/B — the same tower at the resting eye, lantern on and off,
// for judging whether the raking light wakes the baked normal maps and the
// ember light warms the tray. One pair per tower id given.
//
//   node tools/drive.mjs tools/steps/tower-lantern-ab.mjs [id ...]

export default async function run(stage, args) {
  const ids = args.length ? args : ['blackanvil', 'bastion'];
  const a = await stage.tab('localhost', 'LanternAB');
  await a.settle();
  for (const id of ids) {
    await a.dbg(`setTower('${id}')`);
    await a.waitFor(`window.__diceDebug.tower === '${id}'`, { desc: `${id} up` });
    await a.dbg('sim(1500)'); // resting eye ease
    await a.dbg('towerLight(true)');
    await a.dbg('sim(100)');
    await stage.shot(a, `${id}-lantern-on`);
    await a.dbg('towerLight(false)');
    await a.dbg('sim(100)');
    await stage.shot(a, `${id}-lantern-off`);
    console.log(`${id}: pair saved`);
  }
  await a.dbg('towerLight(true)');
  await a.dbg(`setTower('none')`);
}
