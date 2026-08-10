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

// WHAT THE FELT TUNING COSTS IN PILING. Damping and grip stop a die where it
// lands — and on this mat, sliding apart is HOW dice separate. spawnDie lines
// the throw up along one edge with `Math.min(TABLE_W - 4.4, count * 2.6)` of
// spread, and at `medium` that clamp bites hard: TABLE_W is 8.6, so six dice
// start 0.84 apart when the unclamped spacing wants 2.6. They were relying on
// bounce to fan out.
//
// This is the C24 floor (`dice-land-flat`, goal 5 "organized over realistic")
// measured directly, because that scenario is a 3-throw majority verdict and
// reads as flaky rather than as a number.
//
//   piled   dice resting above y = 1.2 — the same bar dice-land-flat uses
//
//   node tools/drive.mjs tools/steps/pile.mjs [seeds]

const OLD = {
  floorFriction: 0.25, floorRestitution: 0.35,
  diceFriction: 0.15, diceRestitution: 0.45,
  wallFriction: 0.05, wallRestitution: 0.7,
  linearDamping: 0.01, angularDamping: 0.01,
};
const FELT = {
  floorFriction: 0.6, floorRestitution: 0.15,
  diceFriction: 0.4, diceRestitution: 0.2,
  wallFriction: 0.2, wallRestitution: 0.5,
  linearDamping: 0.1, angularDamping: 0.14,
};

const VARIANTS = [
  ['old          ', OLD],
  ['felt         ', FELT],
  ['felt, no damp', { ...FELT, linearDamping: 0.01, angularDamping: 0.01 }],
  ['felt, ½ damp ', { ...FELT, linearDamping: 0.05, angularDamping: 0.07 }],
  ['grip only    ', { ...OLD, floorFriction: 0.6, diceFriction: 0.4 }],
  ['deaden only  ', { ...OLD, floorRestitution: 0.15, diceRestitution: 0.2 }],
  ['damp only    ', { ...OLD, linearDamping: 0.1, angularDamping: 0.14 }],
];

const POOLS = [
  ['trio', ['d8', 'd6', 'd10']],
  ['6d6', Array(6).fill('d6')],
];
const ZOOMS = ['wide', 'medium', 'close'];

export default async function run(stage, [count = '10']) {
  const n = Number(count);
  const a = await stage.tab('localhost', 'Pile');
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  const nudge = await a.dbg('nudge');

  const got = new Map();
  for (const [vname, phys] of VARIANTS) {
    await a.dbg(`setPhysics(${JSON.stringify(phys)})`);
    await a.dbg(`setNudge(${JSON.stringify(nudge)})`);
    for (const z of ZOOMS) {
      await a.dbg(`setZoom(${JSON.stringify(z)})`);
      await a.dbg('sim(200)');
      for (const [pname, types] of POOLS) {
        let piled = 0;
        let dice = 0;
        let flatThrows = 0;
        for (const seed of seeds) {
          await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
          await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
            { desc: `${vname} ${z} ${pname}/${seed}`, timeout: 30000 });
          await a.dbg('sim(600)');
          const p = Number(await a.eval(
            `window.__diceDebug.tableDice.filter((o) => o.body.position.y > 1.2).length`));
          piled += p; dice += types.length;
          if (p === 0) flatThrows++;
          await a.dbg('clearTable()');
          await a.dbg('sim(60)');
        }
        got.set(`${vname}|${z}|${pname}`,
          `${String(Math.round((piled / dice) * 100)).padStart(3)}% ${flatThrows}/${n}`);
      }
    }
    console.log(`  … ${vname}  `
      + ZOOMS.map((z) => `${z} ${POOLS.map(([p]) => got.get(`${vname}|${z}|${p}`)).join(' ')}`).join(' | '));
  }

  await a.dbg(`setPhysics(${JSON.stringify(FELT)})`);
  await a.dbg(`setZoom('medium')`);

  console.log(`\nshare of dice resting above y=1.2, and throws that piled NOTHING,`
    + ` over ${n} identical seeds\n`);
  const head = ['tuning', ...ZOOMS.flatMap((z) => POOLS.map(([p]) => `${z}/${p}`.padEnd(11)))];
  const rows = VARIANTS.map(([vname]) => [vname,
    ...ZOOMS.flatMap((z) => POOLS.map(([p]) => got.get(`${vname}|${z}|${p}`)))]);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ');
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}
