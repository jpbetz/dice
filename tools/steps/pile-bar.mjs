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

// HOW HIGH DOES A DIE REST WHEN NOTHING IS UNDER IT?
//
// `dice-land-flat` and settle-matrix both call a die "piled" above y = 1.2, a
// number nobody measured. Before a freeze predicate REFUSES a die for resting
// too high, the bar has to sit above every legitimate rest — including a die
// leaning on a wall — and below a real stack. This throws each type ALONE (a
// solo die cannot be piled by construction) and prints the distribution, then
// throws them at the boards (throwTarget 1.8 aims outside the table, so every
// die ends against one) for the leaning case, then six of a kind at `close`
// for the stacked one.
//
// WHAT IT FOUND. 1.2 is the d6 circumradius and change — sound for the pools
// dice-land-flat rolls and a coincidence for anything else: a solo d20 was
// measured resting legitimately at 1.190, 0.01 under the bar. The bar that
// generalises is the hull's own circumradius, which is a THEOREM rather than
// a fit — a convex die touching the felt cannot hold its centre higher than
// that, however it is balanced — and every accepted rest measured here comes
// in at 0.73-0.95 of it. js/main.js `restCeiling`.
//
//   node tools/drive.mjs tools/steps/pile-bar.mjs [seeds] [zooms] [deaden]

const TYPES = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

const DEADEN = { floorRestitution: 0.15, diceRestitution: 0.2, wallRestitution: 0.5 };
const SLOW = { gate: 4, slowLinear: 0.1, slowAngular: 0.14 };

export default async function run(stage, [seedCount = '12', zoomArg = 'medium,close', phys = '']) {
  const n = Number(seedCount);
  const zooms = zoomArg.split(',').filter(Boolean);
  const a = await stage.tab('localhost', 'PileBar');
  const inertZoom = await a.dbg('zoom');
  const inertTarget = await a.dbg('throwTarget');
  // The bar has to clear a legitimate rest under the physics that SHIPS, and
  // the candidate is less bouncy than today — a die that would have been
  // knocked flat can stay leaning. `deaden` re-runs the same calibration
  // under it rather than assuming the rest heights carry over.
  if (phys === 'deaden') {
    console.log(`physics: DEADEN ${JSON.stringify(await a.dbg(`setPhysics(${JSON.stringify(DEADEN)})`))}`);
    console.log(`dampgate: ${JSON.stringify(await a.dbg(`setDampgate(${JSON.stringify(SLOW)})`))}`);
  }
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);


  const throwOnce = async (types, seed, desc) => {
    await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)', { desc, timeout: 60000 });
    await a.dbg('sim(600)');
  };
  const clear = async () => { await a.dbg('clearTable()'); await a.dbg('sim(60)'); };

  // One solo throw's rest, read off the LANDING rather than the body: face
  // correction snaps every die exactly flat, so the body's quaternion after
  // the roll says nothing about how it came to rest. `endY`/`endDot` are what
  // the freeze decision saw. A die that timed out was already refused (cocked,
  // nudges spent), so it is not evidence about a legitimate rest height —
  // `accepted` is the population a height bar must clear.
  const restOf = async () => JSON.parse(await a.eval(`JSON.stringify((() => {
    const d = window.__diceDebug.tableDice[0];
    const l = window.__diceDebug.currentRoll.landings[0];
    const p = window.__diceDebug.settleProfile();
    return { y: l.endY, dot: l.endDot, x: d.body.position.x, z: d.body.position.z,
             timedOut: p.timedOut, nudged: p.nudged };
  })())`));

  // The two numbers the hull itself dictates: how high a die lies when flat
  // (inradius) and the highest its centre can be while still touching the
  // felt (circumradius). The pile bar is a factor on the second — everything
  // below is the check that real rests obey it.
  await a.dbg(`throwSeeded(${JSON.stringify(TYPES)}, 1)`);
  await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)', { desc: 'hull probe' });
  const hulls = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.tableDice.map((d) => {
    const s = d.body.shapes[0];
    let lo = Infinity, hi = 0;
    s.faces.forEach((f, i) => {
      const nrm = s.faceNormals[i], v = s.vertices[f[0]];
      lo = Math.min(lo, Math.abs(nrm.x * v.x + nrm.y * v.y + nrm.z * v.z));
    });
    for (const v of s.vertices) hi = Math.max(hi, v.length());
    return [d.type, lo, hi];
  }))`));
  console.log('\nhull geometry — flat rest (inradius) and the rest CEILING (circumradius)\n');
  table(['type', 'flat', 'ceiling', 'ceiling/flat'],
    hulls.map(([t, lo, hi]) => [t, lo.toFixed(3), hi.toFixed(3), (hi / lo).toFixed(2)]));
  await clear();

  for (const mode of ['centre', 'walls']) {
    await a.dbg(`setThrowTarget(${mode === 'walls' ? 1.8 : inertTarget})`);
    for (const z of zooms) {
      await a.dbg(`setZoom(${JSON.stringify(z)})`);
      await a.dbg('sim(200)');
      const rows = [];
      for (const t of TYPES) {
        const all = [];
        let timedOut = 0;
        let nudged = 0;
        let far = 0;
        for (const seed of seeds) {
          await throwOnce([t], seed, `${mode}/${z}/${t}/${seed}`);
          const r = await restOf();
          all.push(r);
          if (r.timedOut) timedOut++;
          if (r.nudged) nudged++;
          far = Math.max(far, Math.hypot(r.x, r.z));
          await clear();
        }
        const ok = all.filter((r) => !r.timedOut);
        const ys = all.map((r) => r.y).sort((p, q) => p - q);
        const okMax = ok.length ? Math.max(...ok.map((r) => r.y)) : NaN;
        const hi = ok.length ? ok.reduce((p, q) => (q.y > p.y ? q : p)) : null;
        rows.push([t, all.length, ys[0].toFixed(3), mean(ys).toFixed(3),
          okMax.toFixed(3), (okMax / ys[0]).toFixed(2),
          hi ? hi.dot.toFixed(2) : '-', timedOut, nudged, far.toFixed(1)]);
      }
      console.log(`\nsolo rest height — ${mode}, zoom ${z}, ${n} seeds per type.`
        + ` "MAX y" is over ACCEPTED rests only; "/flat" is that over the flattest rest\n`);
      table(['type', 'n', 'flat y', 'mean y', 'MAX y', '/flat', 'dot@max', 'timedOut', 'nudged', 'furthest'], rows);
    }
  }

  // --- the other side of the bar ------------------------------------------
  // A bar above every solo rest is only half the calibration; it also has to
  // sit BELOW a real pile, and the lowest possible pile is the small die on
  // the short neighbour. Throw six of one type where piling is worst (close)
  // and split the rests by whether another die is underneath — near in xz and
  // meaningfully lower. That is the ground truth `y > bar` is approximating.
  await a.dbg(`setZoom("close")`);
  await a.dbg('sim(200)');
  const stackRows = [];
  for (const t of TYPES) {
    const free = [];
    const over = [];
    for (const seed of seeds) {
      await throwOnce(Array(6).fill(t), seed, `stack/${t}/${seed}`);
      const split = JSON.parse(await a.eval(`JSON.stringify((() => {
        const ds = window.__diceDebug.tableDice.map((d) => d.body.position);
        const ls = window.__diceDebug.currentRoll.landings;
        return ds.map((p, i) => [ls[i].endY, ls[i].timedOut, ds.some((q, j) => j !== i
          && p.y - q.y > 0.25 && Math.hypot(p.x - q.x, p.z - q.z) < 1.4)]);
      })())`));
      // A die that timed out was refused for being cocked, so it says nothing
      // about where an ACCEPTED die can come to rest — the same filter the
      // solo pass uses.
      for (const [y, out, on] of split) { if (!out) (on ? over : free).push(y); }
      await clear();
    }
    free.sort((p, q) => p - q); over.sort((p, q) => p - q);
    stackRows.push([t, free.length, free.length ? free[free.length - 1].toFixed(3) : '-',
      over.length, over.length ? over[0].toFixed(3) : '-',
      over.length ? over[over.length - 1].toFixed(3) : '-']);
  }
  console.log(`\n6-of-a-kind at close — rests split by whether a die sits underneath\n`);
  table(['type', 'free n', 'free MAX y', 'over n', 'over MIN y', 'over max y'], stackRows);

  await a.dbg(`setThrowTarget(${inertTarget})`);
  await a.dbg(`setZoom(${JSON.stringify(inertZoom)})`);
  await a.dbg('sim(200)');
}
