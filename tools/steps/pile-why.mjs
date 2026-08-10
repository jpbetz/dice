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

// WHERE DOES A PILE-NUDGED THROW SPEND ITS TIME? The matrix prints pool means
// and 8d6 came back +55% under the pile bar alone — enough to fail the
// duration gate on its own, and a mean cannot say whether that is every throw
// paying a little or two throws paying a second and a half. Per throw, with
// and without the bar on the same seeds: what the sim actually ran
// (simFrames, which the tail cut hides), how many nudge rounds it spent, and
// how many dice were still above the bar at the end.
//
//   node tools/drive.mjs tools/steps/pile-why.mjs [pool] [seeds] [scale] [physics]

const DEADEN = { floorRestitution: 0.15, diceRestitution: 0.2, wallRestitution: 0.5 };
const GATE4 = { gate: 4, slowLinear: 0.1, slowAngular: 0.14 };
const GRIP = { floorFriction: 0.6, diceFriction: 0.4, wallFriction: 0.2 };

const POOLS = {
  soul: ['d8', 'd8', 'd4', 'd6'],
  '4d6': Array(4).fill('d6'),
  '6d6': Array(6).fill('d6'),
  '8d6': Array(8).fill('d6'),
  '20d6': Array(20).fill('d6'),
};

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

export default async function run(stage, [pool = '8d6', seedCount = '8', scale = '1.05', phys = '']) {
  const types = POOLS[pool];
  if (!types) throw new Error(`no such pool: ${pool} (have ${Object.keys(POOLS).join(', ')})`);
  const n = Number(seedCount);
  const a = await stage.tab('localhost', 'PileWhy');
  const inertNudge = await a.dbg('nudge');
  const inertPhys = await a.dbg('physics');
  const inertGate = await a.dbg('dampgate');
  // `feltgrip` is here as a DIAGNOSIS, not a candidate: deadening removes the
  // bounce, which is where a die's vertical energy went, and leaves the
  // horizontal glide untouched on a floor whose friction is 0.25. If that is
  // where the extra seconds are, adding grip takes them back and the pile is
  // innocent.
  if (phys === 'deaden' || phys === 'feltgrip') {
    await a.dbg(`setPhysics(${JSON.stringify(phys === 'feltgrip' ? { ...DEADEN, ...GRIP } : DEADEN)})`);
    await a.dbg(`setDampgate(${JSON.stringify(GATE4)})`);
    console.log(`physics: ${phys} + gate4`);
  }
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);

  const one = async (seed) => {
    const t0 = Date.now();
    await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
    const bake = Date.now() - t0;
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc: `${pool}/${seed}`, timeout: 60000 });
    const p = await a.dbg('settleProfile()');
    const extra = JSON.parse(await a.eval(`JSON.stringify((() => {
      const r = window.__diceDebug.currentRoll;
      return { simFrames: r.simFrames,
               maxY: Math.round(Math.max(...r.landings.map((l) => l.endY)) * 100) / 100 };
    })())`));
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    return { bake, ...p, ...extra };
  };

  const runAll = async (label) => {
    const rows = [];
    for (const seed of seeds) rows.push(await one(seed));
    console.log(`\n${label} — ${pool}, ${n} seeds\n`);
    table(['seed', 'dur', 'simS', 'bake ms', 'nudged', 'capped', 'parked', 'endPiled', 'piled', 'maxY'],
      rows.map((r, i) => [seeds[i], r.duration.toFixed(2), (r.simFrames / 60).toFixed(2), r.bake,
        r.nudged, r.timedOut, r.parked, r.endPiled, r.piled, r.maxY]));
    const m = (k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(2);
    console.log(`  mean dur ${m('duration')}  simS ${(rows.reduce((s, r) => s + r.simFrames, 0) / rows.length / 60).toFixed(2)}`
      + `  nudged ${m('nudged')}  piled ${m('piled')}`);
    return rows;
  };

  await a.dbg(`setNudge({"pileScale":0})`);
  await runAll('pile bar OFF');
  await a.dbg(`setNudge({"pileScale":${scale}})`);
  await runAll(`pile bar ON (scale ${scale})`);

  await a.dbg(`setNudge(${JSON.stringify(inertNudge)})`);
  await a.dbg(`setPhysics(${JSON.stringify(inertPhys)})`);
  await a.dbg(`setDampgate(${JSON.stringify(inertGate)})`);
}
