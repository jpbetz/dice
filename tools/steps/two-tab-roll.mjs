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

// Two seats, one roll: A rolls <notation> (default '2d6+3'), both tabs
// settle, and every table-truth surface is dumped for comparison — the
// canned repro for "did the roll reach the other tab" debugging.
//
//   node tools/drive.mjs tools/steps/two-tab-roll.mjs ['<notation>']

export default async function run(stage, [notation = '2d6+3']) {
  const a = await stage.tab('localhost', 'Alice');
  const b = await stage.tab('127.0.0.1', 'Bob');
  await a.roll(notation);
  await b.settle();
  for (const [t, who] of [[a, 'A'], [b, 'B']]) {
    const st = await t.eval(`(() => {
      const d = window.__diceDebug;
      return {
        dice: d.tableDice.length,
        logChildren: document.getElementById('log-list').childElementCount,
        busy: d.busy, queue: d.queueLength,
        net: d.net, refusal: d.lastRefusal,
      };
    })()`);
    console.log(who, JSON.stringify(st));
    console.log(who, 'logTop:', JSON.stringify(await t.logTop().catch(() => null)));
    console.log(who, 'pageErrors:', JSON.stringify(t.page.errors));
    console.log(who, 'consoleErrors:', JSON.stringify(t.page.consoleErrors.slice(0, 3)));
  }
  console.log('--- server log ---\n' + stage.serverLog());
}
