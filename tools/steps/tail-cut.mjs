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

// WHAT THE TAIL CUT IS WORTH. settleProfile reports both the played duration
// and what the SAME simulation would have played under the pre-2026-08-10
// rule (a die force-frozen at SETTLE_CAP was credited with the cap, even when
// it had been sitting motionless for seconds). So this is an exactly paired
// before/after: one throw, two numbers, no seed matching required.
//
//   node tools/drive.mjs tools/steps/tail-cut.mjs [seeds]

const POOLS = [
  ['1d20', ['d20']],
  ['soul', ['d8', 'd8', 'd4', 'd6']],
  ['4d6', Array(4).fill('d6')],
  ['8d6', Array(8).fill('d6')],
  ['20d6', Array(20).fill('d6')],
];

export default async function run(stage, [count = '20']) {
  const n = Number(count);
  const a = await stage.tab('localhost', 'Tail');
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);

  const rows = [];
  for (const [name, types] of POOLS) {
    const now = []; const old = [];
    for (const seed of seeds) {
      await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
      await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${name}/${seed}`, timeout: 30000 });
      const p = await a.dbg('settleProfile()');
      now.push(p.duration); old.push(p.durationOld);
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');
    }
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const worst = old.map((o, i) => o - now[i]).reduce((m, d) => Math.max(m, d), 0);
    rows.push({
      pool: name.padEnd(5),
      before: mean(old).toFixed(2),
      after: mean(now).toFixed(2),
      saved: `${(mean(old) - mean(now)).toFixed(2)}s`,
      pct: `${Math.round((1 - mean(now) / mean(old)) * 100)}%`,
      worstBefore: Math.max(...old).toFixed(2),
      worstAfter: Math.max(...now).toFixed(2),
      bestSave: `${worst.toFixed(2)}s`,
    });
    console.log(`  … ${name}`);
  }

  console.log(`\nmean played seconds over ${n} identical seeds per pool\n`);
  const head = ['pool', 'before', 'after', 'saved', 'cut', 'worst before', 'worst after', 'best single'];
  const w = head.map((h, i) => Math.max(h.length,
    ...rows.map((r) => String(Object.values(r)[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('   ');
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('   '));
  for (const r of rows) console.log(line(Object.values(r)));
}
