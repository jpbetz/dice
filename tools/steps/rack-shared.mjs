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

// The shared-rack states (2b-④⑤): Bob browsing Alice's read-only rack, and
// a multi-pool roll's source-grouped result surfaces.
//
//   node tools/drive.mjs tools/steps/rack-shared.mjs

import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Alice');
  const b = await stage.tab('127.0.0.1', 'Bob');

  await a.dbg(`setGroups([
    {name: 'Wisdom', notation: '2d8', category: 'Attributes'},
    {name: 'Swords', notation: '1d6', category: 'Skills'},
    {name: 'Zeal', notation: '1d4', category: 'Motivations'},
    {name: 'Percentile', notation: 'd100'}])`);
  await b.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}])`);
  await b.waitFor(`window.__diceDebug.netPlayers.some((p) =>
    p.name === 'Alice' && p.pools.length === 4)`, { desc: "Alice's rack reaches Bob" });

  const alice = (await b.dbg('netPlayers')).find((p) => p.name === 'Alice');
  await b.dbg(`setPoolsOwner(${JSON.stringify(alice.id)})`);
  console.log(await stage.shot(b, join(OUT_DIR, 'rack-foreign.png')));

  // Bob composes from Alice's rack + his own digits, then rolls the draft.
  await b.eval(`[...document.querySelectorAll('#groups-list .pool-tile.foreign .tile-stage')]
    .find((t) => t.textContent.includes('Wisdom')).click()`);
  await b.eval(`[...document.querySelectorAll('#groups-list .pool-tile.foreign .tile-stage')]
    .find((t) => t.textContent.includes('Swords')).click()`);
  await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))`);
  await b.settle();
  await b.dbg('sim(60)');
  console.log(await stage.shot(b, join(OUT_DIR, 'rack-sourced-result.png')));
}
