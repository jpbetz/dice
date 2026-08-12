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

// THE MOOD A/B — the same frames with the mood rig off and on: an empty felt,
// a settled 6d6 spread, and a tower idle (does the fogged horizon flatter or
// eat the tower?). Judged by eye from the pairs.
//
//   node tools/drive.mjs tools/steps/mood-ab.mjs [towerId]

export default async function run(stage, args) {
  const tower = args[0] || 'bastion';
  const a = await stage.tab('localhost', 'MoodAB');
  await a.settle();

  // The mood ships ON (Joe's lock-in) — force the flat room first so the
  // 'off' frames actually show it.
  await a.dbg('mood(false)');
  await a.dbg('sim(100)');
  await stage.shot(a, 'mood-off-empty');
  await a.roll('6d6');
  await a.settle();
  await a.dbg('sim(1200)');
  await stage.shot(a, 'mood-off-dice');
  await a.dbg('mood(true)');
  await a.dbg('sim(100)');
  await stage.shot(a, 'mood-on-dice');
  await a.dbg('clearTable()');
  await a.dbg(`setTower('${tower}')`);
  await a.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: 'tower up' });
  await a.dbg('sim(1500)');
  await stage.shot(a, `mood-on-${tower}`);
  await a.dbg('mood(false)');
  await a.dbg('sim(100)');
  await stage.shot(a, `mood-off-${tower}`);
  console.log('pairs saved');
}
