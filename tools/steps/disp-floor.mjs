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

// DISP FLOOR — how still is this solver, really? For a ladder of eps values,
// throw the settle-displacement pool and report how many dice timed out and
// the worst endDisp among clean freezes. Decides whether claim 5's "no die
// can hold 0.0002" is still a fact about the solver.
//
//   node tools/drive.mjs tools/steps/disp-floor.mjs

export default async function run(stage) {
  const a = await stage.tab('localhost', 'DispFloor');
  await a.settle();
  const pool = JSON.stringify(Array(20).fill('d6'));
  for (const eps of [0.02, 0.002, 0.0002, 0.00002, 0.000002]) {
    await a.dbg(`setSettleGate({"mode":"displacement","eps":${eps}})`);
    for (const seed of [1000, 8919]) {
      await a.dbg(`throwSeeded(${pool}, ${seed})`);
      await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `20d6/${seed}@${eps}`, timeout: 60000 });
      const p = await a.dbg('settleProfile()');
      console.log(`eps=${eps} seed=${seed} timedOut=${p.timedOut} maxEndDisp=${p.maxEndDisp} duration=${p.duration}`);
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');
    }
  }
  await a.dbg('setSettleGate({"mode":"displacement","eps":0.02})');
}
