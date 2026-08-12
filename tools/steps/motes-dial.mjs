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

// MOTES DIAL — reshoot the three poses with a candidate tune patch, passed
// as JSON in argv. Compare against the motes-look shots.
//
//   node tools/drive.mjs tools/steps/motes-dial.mjs '{"yMax":10}' [towerId]

export default async function run(stage, args) {
  const patch = JSON.parse(args[0] || '{}');
  const tower = args[1] || 'heartwood';
  const a = await stage.tab('localhost', 'MotesDial');
  await a.settle();
  await a.dbg(`motesTune(${JSON.stringify(patch)})`);

  await a.dbg('sim(400)');
  await stage.shot(a, 'dial-empty');
  await a.roll('6d6');
  await a.settle();
  await a.dbg('sim(1200)');
  await stage.shot(a, 'dial-dice');
  await a.dbg('clearTable()');
  await a.dbg(`setTower('${tower}')`);
  await a.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: 'tower up' });
  await a.dbg('sim(1500)');
  await stage.shot(a, `dial-${tower}`);
}
