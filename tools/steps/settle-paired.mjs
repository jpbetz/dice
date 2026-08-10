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

// PRICE A SETTLE CHANGE HONESTLY. Every variant throws THE SAME SEEDS, so the
// difference between two rows is the change and nothing else. The unpaired
// unpaired version of this produced 8d6 means of 3.88, 5.57, 3.33 and 2.56
// for four variants whose real spread is far smaller, and talked me out of
// the materials change that turned out to be the largest single win — with a
// dozen random throws per cell, variance IS the measurement. Those steps were
// deleted rather than kept, because a tool that answers confidently and
// wrongly is worse than no tool.
//
// Reported per pool: mean played seconds, the change vs. the first variant on
// the same seeds, and how many of those seeds ran to SETTLE_CAP.
//
//   node tools/drive.mjs tools/steps/settle-paired.mjs [seeds]

const POOLS = [
  ['1d20', ['d20']],
  ['soul  ', ['d8', 'd8', 'd4', 'd6']],
  ['4d6  ', ['d6', 'd6', 'd6', 'd6']],
  ['8d6  ', Array(8).fill('d6')],
  ['20d6 ', Array(20).fill('d6')],
];

const NUDGE_TODAY = { budget: 3, lift: 7, spread: 4, spin: 14, cockedDot: 0.82, cockedDotD4: 0.9 };
const FELT = {
  floorFriction: 0.6, floorRestitution: 0.15,
  diceFriction: 0.4, diceRestitution: 0.2,
  wallFriction: 0.2, wallRestitution: 0.5,
  linearDamping: 0.1, angularDamping: 0.14,
};
const PHYS_TODAY = {
  floorFriction: 0.25, floorRestitution: 0.35,
  diceFriction: 0.15, diceRestitution: 0.45,
  wallFriction: 0.05, wallRestitution: 0.7,
  linearDamping: 0.01, angularDamping: 0.01,
};

// The first entry is the baseline every Δ is measured against.
//
// `felt` alone was measured a 40% win on the Soul Deal pool and +1.42s on
// 8d6 — damping stops a die before it can topple flat, so more dice read
// cocked and every one of those is paid for in nudges. These variants test
// the resolution: let a die REST where it stopped. `dot 0.6` is ~53° of
// tilt, `dot 0` accepts anything short of upside-down.
const VARIANTS = [
  ['today          ', {}, {}],
  ['felt           ', FELT, {}],
  ['felt, no nudge ', FELT, { budget: 0 }],
  ['felt, dot .6   ', FELT, { cockedDot: 0.6, cockedDotD4: 0.7 }],
  ['felt, dot 0    ', FELT, { cockedDot: 0, cockedDotD4: 0 }],
  ['dot .6 only    ', {}, { cockedDot: 0.6, cockedDotD4: 0.7 }],
];

export default async function run(stage, [count = '12']) {
  const n = Number(count);
  const a = await stage.tab('localhost', 'Paired');
  await a.dbg('setBannerRetireMs(0)');

  // Fixed, arbitrary, and the same for every variant.
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);

  const results = new Map();
  for (const [vname, phys, nudge] of VARIANTS) {
    await a.dbg(`setPhysics(${JSON.stringify({ ...PHYS_TODAY, ...phys })})`);
    await a.dbg(`setNudge(${JSON.stringify({ ...NUDGE_TODAY, ...nudge })})`);
    for (const [pname, types] of POOLS) {
      const durs = [];
      let capped = 0;
      for (const seed of seeds) {
        await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
        await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
          { desc: `seeded ${pname} ${seed}`, timeout: 30000 });
        const p = await a.dbg('settleProfile()');
        durs.push(p.duration);
        if (p.timedOut) capped++;
        await a.dbg('clearTable()');
        await a.dbg('sim(60)');
      }
      results.set(`${vname}|${pname}`, {
        mean: durs.reduce((s, d) => s + d, 0) / durs.length,
        capped,
      });
    }
    console.log(`  … ${vname} done`);
  }

  await a.dbg(`setPhysics(${JSON.stringify(PHYS_TODAY)})`);
  await a.dbg(`setNudge(${JSON.stringify(NUDGE_TODAY)})`);

  const base = VARIANTS[0][0];
  console.log(`\n${n} identical seeds per cell. "mean" = played seconds;`
    + ` "Δ" vs "${base.trim()}"; "!k" = k seeds ran to SETTLE_CAP\n`);
  const head = ['variant', ...POOLS.map(([p]) => p.trim().padEnd(14))];
  const rows = VARIANTS.map(([vname]) => [vname, ...POOLS.map(([pname]) => {
    const r = results.get(`${vname}|${pname}`);
    const b = results.get(`${base}|${pname}`);
    const d = r.mean - b.mean;
    const delta = vname === base ? '' : ` ${d >= 0 ? '+' : ''}${d.toFixed(2)}`;
    return `${r.mean.toFixed(2)}${delta}${r.capped ? ` !${r.capped}` : ''}`.padEnd(14);
  })]);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ');
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}
