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

// THE COMPLAINT WAS NOT "TOO LONG", IT WAS "SHAKY". Joe: "a very slow, very
// shaky process by which the dice then slide and wiggle-move until they are
// stable." Duration is a proxy for that and an imperfect one — a throw can
// be short and still crawl to a stop, which would feel exactly as bad.
//
// Both numbers cover the 0.6s before each die STOPS — anchored to the die's
// own settle frame, not the end of the roll. (Anchored to the roll it is
// confounded by duration: the first version of this reported a throw that
// got 43% SHORTER as 143% worse, because "the last second" of a 1.5s throw
// is the tumble.)
//
//   shake   share of those frames where the die reverses direction. THIS is
//           the complaint. Dithering reverses constantly; rolling to a stop
//           does not.
//   creep   die-widths covered. Ambiguous alone — a die coasting smoothly to
//           rest covers MORE ground than one twitching in place — so it is
//           here to be read against shake, not instead of it.
//
//   node tools/drive.mjs tools/steps/creep.mjs [seeds]

const OLD = {
  phys: {
    floorFriction: 0.25, floorRestitution: 0.35,
    diceFriction: 0.15, diceRestitution: 0.45,
    wallFriction: 0.05, wallRestitution: 0.7,
    linearDamping: 0.01, angularDamping: 0.01,
  },
  nudge: { budget: 3, lift: 7, spread: 4, spin: 14, cockedDot: 0.82, cockedDotD4: 0.9 },
};

const POOLS = [
  ['1d20', ['d20']],
  ['soul', ['d8', 'd8', 'd4', 'd6']],
  ['4d6', Array(4).fill('d6')],
  ['8d6', Array(8).fill('d6')],
  ['20d6', Array(20).fill('d6')],
];

export default async function run(stage, [count = '16']) {
  const n = Number(count);
  const a = await stage.tab('localhost', 'Creep');
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  const shipped = { phys: await a.dbg('physics'), nudge: await a.dbg('nudge') };

  const got = new Map();
  for (const [label, cfg] of [['old', OLD], ['new', shipped]]) {
    await a.dbg(`setPhysics(${JSON.stringify(cfg.phys)})`);
    await a.dbg(`setNudge(${JSON.stringify(cfg.nudge)})`);
    for (const [pname, types] of POOLS) {
      const creeps = [];
      for (const seed of seeds) {
        await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
        await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
          { desc: `${label} ${pname}/${seed}`, timeout: 30000 });
        const p = await a.dbg('settleProfile()');
        creeps.push([p.creep, p.shake]);
        await a.dbg('clearTable()');
        await a.dbg('sim(60)');
      }
      got.set(`${label}|${pname}`, {
        creep: creeps.reduce((s, c) => s + c[0], 0) / creeps.length,
        shake: creeps.reduce((s, c) => s + c[1], 0) / creeps.length,
      });
    }
    console.log(`  … ${label} done`);
  }

  console.log(`\nthe 0.6s BEFORE EACH DIE STOPS, mean of ${n} identical seeds.`
    + ` shake = share of frames that reverse direction\n`);
  const head = ['pool', 'shake before', 'shake after', 'less shaky', 'creep before', 'creep after'];
  const rows = POOLS.map(([pname]) => {
    const o = got.get(`old|${pname}`);
    const w = got.get(`new|${pname}`);
    return [pname, o.shake.toFixed(3), w.shake.toFixed(3),
      `${Math.round((1 - w.shake / o.shake) * 100)}%`,
      o.creep.toFixed(2), w.creep.toFixed(2)];
  });
  const wd = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(wd[i])).join('   ');
  console.log(line(head));
  console.log(wd.map((k) => '-'.repeat(k)).join('   '));
  for (const r of rows) console.log(line(r));
}
