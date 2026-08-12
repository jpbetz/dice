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

// MOTES LOOK — the dust layer judged by eye: the resting felt, a settled
// spread, and a tower idle, each with the air on; plus one motes-off frame
// for the A/B. Two time offsets per pose so the drift itself is visible
// across a pair.
//
//   node tools/drive.mjs tools/steps/motes-look.mjs [towerId]

export default async function run(stage, args) {
  const tower = args[0] || 'heartwood';
  const a = await stage.tab('localhost', 'MotesLook');
  await a.settle();

  await a.dbg('sim(400)');
  await stage.shot(a, 'motes-empty-a');
  await a.dbg('sim(500)');
  await stage.shot(a, 'motes-empty-b');
  console.log('info:', JSON.stringify(await a.dbg('motesInfo()')));

  await a.roll('6d6');
  await a.settle();
  await a.dbg('sim(1200)');
  await stage.shot(a, 'motes-dice');

  await a.dbg('clearTable()');
  await a.dbg(`setTower('${tower}')`);
  await a.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: 'tower up' });
  await a.dbg('sim(1500)');
  await stage.shot(a, `motes-${tower}`);

  await a.dbg('motesTune({on: false})');
  await a.dbg('sim(100)');
  await stage.shot(a, `motes-off-${tower}`);
  console.log('off info:', JSON.stringify(await a.dbg('motesInfo()')));
}
