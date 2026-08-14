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

// THE SPAWN CLAMP, PRICED ON BOTH ITS AXES (ROADMAP C28 ①). The clamp is
// `Math.min(extent - pad, count * 2.6)`, and until 2026-08-14 `extent` was
// TABLE_W on all four sides — including the two that spread along Z, where the
// mat is 6.7 rather than 11. A hand-written `offset * 0.5` stood in for the
// ratio. C28 checked the X axis, found `TABLE_W - 4.4` never goes negative, and
// concluded no die spawns inside a wall. This asks the other axis.
//
// Four numbers per variant, all paired on identical seeds, because C30c is the
// standing warning that the spread is also the piling lever and a fix for one
// that breaks the other is not a win:
//
//   clear    the worst wall clearance on the spawn line, in world units.
//            NEGATIVE is a die born inside a wall plane.
//   frame0   contacts the recorder logged on the spawn step (contactStats) —
//            the storm 5a5a8ce capped rather than cured.
//   piled    share of dice resting above their own hull circumradius (the
//            theorem bar, __diceDebug.restCeiling), and throws that piled none.
//   cluster  the settled AABB, w x d — carried because ROADMAP C27's residual
//            turns out to be a cluster-size question, not a camera one.
//
//   node tools/drive.mjs tools/steps/spawn-clear.mjs [seeds]

const ALL_VARIANTS = [
  ['width (was) ', { axis: 'width', pad: 4.4, per: 2.6 }],
  ['own  (axis) ', { axis: 'own', pad: 4.4, per: 2.6 }],
  ['clamp (min) ', { axis: 'clamp', pad: 4.4, per: 2.6 }],
  ['own, pad 4.0', { axis: 'own', pad: 4.0, per: 2.6 }],
];

const ALL_POOLS = [
  ['3d6', Array(3).fill('d6')],
  ['6d6', Array(6).fill('d6')],
  ['12d6', Array(12).fill('d6')],
  ['20d6', Array(20).fill('d6')],
  ['3d20', Array(3).fill('d20')], // the biggest hull — the wall case is worst here
];

const CENSUS = `(() => {
  const D = window.__diceDebug;
  const live = D.tableDice.filter((d) => d.body);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, piled = 0;
  for (const d of live) {
    const p = d.body.position;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    if (p.y > D.restCeiling(d.type)) piled++;
  }
  const c = D.contactStats() || {};
  const line = D.spawnLine();
  return JSON.stringify({
    n: live.length, piled,
    w: Math.round((x1 - x0) * 10) / 10, d: Math.round((z1 - z0) * 10) / 10,
    frame0: c.firstFrame || 0, total: c.total || 0,
    clear: line.length ? Math.min(...line.map((s) => s.clear)) : null,
    side: line.length ? line[0].side : null,
  });
})()`;

export default async function run(stage, [count = '10', zoomCsv = 'medium,close', poolCsv = '', varCsv = '']) {
  const n = Number(count);
  const ZOOMS = zoomCsv.split(',').filter(Boolean);
  const POOLS = poolCsv ? ALL_POOLS.filter(([p]) => poolCsv.split(',').includes(p)) : ALL_POOLS;
  const VARIANTS = varCsv
    ? ALL_VARIANTS.filter((_, i) => varCsv.split(',').includes(String(i)))
    : ALL_VARIANTS.slice(0, 2);
  const a = await stage.tab('localhost', 'Spawn');
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  const got = new Map();

  for (const [vname, cfg] of VARIANTS) {
    for (const z of ZOOMS) {
      await a.dbg(`setZoom(${JSON.stringify(z)})`);
      await a.dbg('sim(200)');
      for (const [pname, types] of POOLS) {
        const acc = { clear: Infinity, frame0: 0, total: 0, piled: 0, dice: 0, flat: 0, w: 0, d: 0, wall: 0 };
        for (const seed of seeds) {
          // Set on every throw: applyZoom() does not touch SPAWN, but a
          // variant that only got set once would silently grade the wrong
          // config if anything else ever reset it. Cheap insurance.
          await a.dbg(`setSpawn(${JSON.stringify(cfg)})`);
          await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
          await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
            { desc: `${vname} ${z} ${pname}/${seed}`, timeout: 40000 });
          await a.dbg('sim(600)');
          const r = JSON.parse(await a.eval(CENSUS));
          acc.clear = Math.min(acc.clear, r.clear);
          if (r.clear < 0) acc.wall++;
          acc.frame0 += r.frame0; acc.total += r.total;
          acc.piled += r.piled; acc.dice += r.n;
          if (!r.piled) acc.flat++;
          acc.w += r.w; acc.d += r.d;
          await a.dbg('clearTable()');
          await a.dbg('sim(60)');
        }
        got.set(`${vname}|${z}|${pname}`, {
          clear: acc.clear.toFixed(2),
          wall: `${acc.wall}/${n}`,
          frame0: (acc.frame0 / n).toFixed(1),
          total: (acc.total / n).toFixed(0),
          piled: `${Math.round((acc.piled / acc.dice) * 100)}%`,
          flat: `${acc.flat}/${n}`,
          cluster: `${(acc.w / n).toFixed(1)}x${(acc.d / n).toFixed(1)}`,
        });
        console.log(`  … ${vname} ${z.padEnd(6)} ${pname.padEnd(5)} `
          + JSON.stringify(got.get(`${vname}|${z}|${pname}`)));
      }
    }
  }

  await a.dbg("setSpawn({axis: 'own', pad: 4.4, per: 2.6})");
  await a.dbg("setZoom('medium')");

  const head = ['variant', 'zoom', 'pool', 'worst clear', 'in wall', 'frame0', 'contacts', 'piled', 'flat throws', 'cluster'];
  const rows = [];
  for (const [vname] of VARIANTS) {
    for (const z of ZOOMS) {
      for (const [pname] of POOLS) {
        const g = got.get(`${vname}|${z}|${pname}`);
        rows.push([vname, z, pname, g.clear, g.wall, g.frame0, g.total, g.piled, g.flat, g.cluster]);
      }
    }
  }
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (c) => c.map((v, i) => String(v).padEnd(w[i])).join('  ');
  console.log(`\n${n} identical seeds per cell; clearance in world units, negative = born inside a wall\n`);
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
  return rows;
}
