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

// WHAT DOES IT COST TO GET A DIE OFF ANOTHER DIE? The pile refusal works —
// the die is caught, the nudge fires — but the first shape of the shove
// bought a flat table at well over a second a throw, which fails the duration
// gate on its own. Both knobs matter and they trade against each other: too
// small and the die comes down on the same neighbour (another round, another
// second); too big and it crosses the mat, hits a wall and takes a second to
// stop. This runs the grid on the pools where piles actually happen and
// prints the price of each cell next to what it fixed.
//
//   node tools/drive.mjs tools/steps/pile-sweep.mjs [seeds] [physics] [zoom]

const DEADEN = { floorRestitution: 0.15, diceRestitution: 0.2, wallRestitution: 0.5 };
const GATE4 = { gate: 4, slowLinear: 0.1, slowAngular: 0.14 };
const SCALE = 1.05;

// [pileSpread, pileLift]. Lift 7 is the shipped hurl; at gravity -110 it is
// 0.13 s of flight, so the spread is doing nearly all the work and a lift of
// 2 is the "shove it off the edge and let it drop" end of the range.
const GRID = [
  [4, 7],    // the shipped nudge, unchanged — the control
  [8, 7],
  [12, 7],
  [16, 7],
  [24, 7],
  [8, 2],
  [12, 2],
  [16, 2],
];

const POOLS = [
  ['8d6', Array(8).fill('d6')],
  ['6d6', Array(6).fill('d6')],
  ['20d6', Array(20).fill('d6')],
];

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

export default async function run(stage, [seedCount = '10', phys = 'deaden', zoom = 'medium']) {
  const n = Number(seedCount);
  const a = await stage.tab('localhost', 'PileSweep');
  const inertNudge = await a.dbg('nudge');
  if (phys === 'deaden') {
    await a.dbg(`setPhysics(${JSON.stringify(DEADEN)})`);
    await a.dbg(`setDampgate(${JSON.stringify(GATE4)})`);
  }
  await a.dbg(`setZoom(${JSON.stringify(zoom)})`);
  await a.dbg('sim(200)');
  console.log(`physics ${phys}, zoom ${zoom}, ${n} seeds`);
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);

  const family = async (types, label) => {
    const rows = [];
    for (const seed of seeds) {
      await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
      await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${label}/${seed}`, timeout: 60000 });
      const p = await a.dbg('settleProfile()');
      // The bar-independent truth: dice whose centre ends above their own
      // rest ceiling. Read from the landing so the pile bar being off does
      // not hide it.
      const over = Number(await a.eval(`(() => {
        const r = window.__diceDebug.currentRoll;
        const ceil = { d4: 1.150, d6: 1.169, d8: 1.050, d10: 1.056, d10x: 1.056, d12: 1.100, d20: 1.250 };
        return r.landings.filter((l, i) => l.endY > ceil[r.dice[i].type]).length;
      })()`));
      rows.push({ dur: p.duration, nudged: p.nudged, capped: p.timedOut ? 1 : 0, over });
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');
    }
    return {
      dur: mean(rows.map((r) => r.dur)),
      nudged: mean(rows.map((r) => r.nudged)),
      caps: rows.reduce((s, r) => s + r.capped, 0),
      over: rows.reduce((s, r) => s + r.over, 0),
      flat: rows.filter((r) => r.over === 0).length,
    };
  };

  const results = new Map();
  // OFF first: the same seeds with no pile refusal at all, which is what every
  // cell is paying its extra seconds to improve on.
  await a.dbg('setNudge({"pileScale":0})');
  for (const [pname, types] of POOLS) results.set(`off|${pname}`, await family(types, `off ${pname}`));
  console.log('  … off done');

  for (const [spread, lift] of GRID) {
    await a.dbg(`setNudge({"pileScale":${SCALE},"pileSpread":${spread},"lift":${lift}})`);
    for (const [pname, types] of POOLS) {
      results.set(`${spread}/${lift}|${pname}`, await family(types, `${spread}/${lift} ${pname}`));
    }
    console.log(`  … spread ${spread} lift ${lift} done`);
  }
  await a.dbg(`setNudge(${JSON.stringify(inertNudge)})`);

  const cells = ['off', ...GRID.map(([s, l]) => `${s}/${l}`)];
  for (const [pname] of POOLS) {
    const b = results.get(`off|${pname}`);
    console.log(`\n${pname} — dur (vs off), nudge rounds, caps, dice left above their ceiling,`
      + ` throws that ended with none\n`);
    table(['spread/lift', 'dur', 'vs off', 'nudged', 'caps', 'over', 'clean'],
      cells.map((c) => {
        const r = results.get(`${c}|${pname}`);
        const d = ((r.dur - b.dur) / b.dur) * 100;
        return [c, r.dur.toFixed(2), c === 'off' ? '-' : `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`,
          r.nudged.toFixed(2), r.caps, r.over, `${r.flat}/${n}`];
      }));
  }
}
