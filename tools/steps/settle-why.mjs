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

// WHY does a throw run to the cap? Not for the reason it looks like. This
// asks the one question that splits the possibilities: when the cap fires,
// are those dice MOVING?
//
//   parked   motionless when the cap fired — something refused to freeze them
//   moving   genuinely still in motion
//   cocked   of the timed-out dice, how many read as cocked (dot < 0.82)
//
// If parked ≈ timedOut, the tail is a predicate and no amount of physics
// tuning will shorten it.
//
//   node tools/drive.mjs tools/steps/settle-why.mjs [reps]

const POOLS = ['1d20', '3d6', '4d6', '8d6', '10d6', '20d6'];

export default async function run(stage, [reps = '6']) {
  const n = Number(reps);
  const a = await stage.tab('localhost', 'Why');
  await a.dbg('setBannerRetireMs(0)');

  const rows = [];
  for (const pool of POOLS) {
    const runs = [];
    for (let i = 0; i < n; i++) {
      await a.roll(pool);
      runs.push(await a.dbg('settleProfile()'));
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');
    }
    const sum = (f) => runs.reduce((s, r) => s + f(r), 0);
    rows.push({
      pool: pool.padEnd(6),
      dur: (sum((r) => r.duration) / n).toFixed(2),
      capped: `${runs.filter((r) => r.timedOut).length}/${n}`,
      timedOut: sum((r) => r.timedOut),
      parked: sum((r) => r.parked),
      moving: sum((r) => r.moving),
      cocked: sum((r) => r.endCocked),
      nudged: Math.max(...runs.map((r) => r.nudged)),
    });
    console.log(`  … ${pool}`);
  }

  console.log('\ncounts are dice summed over all throws\n');
  const head = ['pool', 'dur', 'capped', 'timed out', 'parked', 'moving', 'cocked', 'nudges'];
  const w = head.map((h, i) => Math.max(h.length,
    ...rows.map((r) => String(Object.values(r)[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('   ');
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('   '));
  for (const r of rows) console.log(line(Object.values(r)));
}
