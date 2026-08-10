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

// Does the replay-drift churn loop actually simulate anything? Fifty throws
// that report one millisecond each are fifty throws that did not happen, and
// a drift measured against a churn that never ran is measuring something
// else. Prints per-throw cost, the roll ids seen, and the dice left behind.
//
//   node tools/drive.mjs tools/steps/churn-probe.mjs [n]

export default async function run(stage, [count = '20']) {
  const a = await stage.tab('localhost', 'Churn');
  const out = JSON.parse(await a.eval(`JSON.stringify((() => {
    const d = window.__diceDebug;
    const ids = new Set();
    const t0 = performance.now();
    let drains = 0;
    let baked = 0;
    for (let i = 0; i < ${Number(count)}; i++) {
      const b0 = performance.now();
      d.throwSeeded(['d6'], 900000 + i);
      baked += performance.now() - b0;
      let guard = 0;
      while (d.busy && guard++ < 400) d.sim(20);
      drains += guard;
      ids.add((d.currentRoll || {}).rollId);
      d.clearTable();
      d.sim(60);
    }
    return { totalMs: Math.round(performance.now() - t0), bakeMs: Math.round(baked),
             drainCalls: drains, distinctRolls: ids.size, left: d.tableDice.length,
             queue: d.queueLength, busy: d.busy };
  })())`));
  console.log(JSON.stringify(out, null, 2));
}
