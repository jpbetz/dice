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

// CALIBRATION FOR THE DISPLACEMENT SCENARIO — what is ROBUSTLY true, per seed.
//
// A scenario assertion tuned by eye is a scenario that goes red on somebody
// else's machine, and one relaxed until it passes is worse than none. This
// prints the three quantities `settle-displacement` asserts on, seed by seed,
// so the bar can be set where the data actually is and the choice can be
// written down next to it:
//
//   endDisp      the mechanism's own report, in die-widths
//   probe/centre re-derived from the FILM (settleProbe), and how far the
//                three-point excursion exceeds the centre-only one — the
//                design claim, on real dice
//   loose        clean freezes over 0.02 of a die-width
//
//   node tools/drive.mjs tools/steps/disp-probe.mjs [pool] [seeds]

const POOLS = {
  soul: ['d8', 'd8', 'd4', 'd6'],
  '20d6': Array(20).fill('d6'),
  '8d6': Array(8).fill('d6'),
  '6d6': Array(6).fill('d6'),
};

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

export default async function run(stage, [poolName = 'soul', seedCount = '8']) {
  const types = POOLS[poolName];
  if (!types) throw new Error(`no such pool: ${poolName} (have ${Object.keys(POOLS).join(', ')})`);
  const n = Number(seedCount);
  const a = await stage.tab('localhost', 'Probe');
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);

  const one = async (seed) => {
    await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc: `${poolName}/${seed}`, timeout: 60000 });
    const p = await a.dbg('settleProfile()');
    const probe = await a.dbg('settleProbe()');
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    return { seed, p, probe };
  };

  for (const mode of [{ mode: 'velocity', eps: 0.02 }, { mode: 'displacement', eps: 0.02 }]) {
    await a.dbg(`setSettleGate(${JSON.stringify(mode)})`);
    console.log(`\n=== ${mode.mode} eps ${mode.eps} — ${poolName}, ${n} seeds ===\n`);
    const rows = [];
    let looseTotal = 0;
    let worstRatioAll = 0;
    let fullAll = 0;
    let agreeWorst = 0;
    for (const seed of seeds) {
      const { p, probe } = await one(seed);
      // Only dice whose whole window survived the tail cut can be judged: the
      // film ends at the LAST die's settle frame, so the deciding die has none
      // of its window on file.
      const full = probe.filter((x) => x.full && !x.timedOut);
      fullAll += full.length;
      const ratio = full.reduce((m, x) => Math.max(m, x.centre > 1e-9 ? x.probe / x.centre : 0), 0);
      // The cross-check that makes endDisp evidence: the mechanism's number
      // and the film's number are the same quantity over the same window.
      const agree = full.reduce((m, x) => Math.max(m, Math.abs(x.probe - x.endDisp)), 0);
      worstRatioAll = Math.max(worstRatioAll, ratio);
      agreeWorst = Math.max(agreeWorst, agree);
      looseTotal += p.loose;
      rows.push([seed, p.duration, p.timedOut, p.loose, p.maxEndDisp.toFixed(4),
        full.length, ratio ? ratio.toFixed(2) : '—',
        full.length ? agree.toExponential(1) : '—']);
    }
    table(['seed', 'dur', 'capped', 'loose', 'maxEndDisp', 'judgeable', 'probe/centre', '|probe-endDisp|'], rows);
    console.log(`\n  loose total ${looseTotal}, judgeable dice ${fullAll},`
      + ` worst probe/centre ${worstRatioAll.toFixed(2)},`
      + ` worst film-vs-mechanism disagreement ${agreeWorst.toExponential(2)}`);
  }
  await a.dbg('setSettleGate({"mode":"velocity","eps":0.02})');
}
