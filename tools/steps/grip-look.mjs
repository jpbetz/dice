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

// THE ONE FRAME THAT COULD OVERTURN THE C30 REFUSAL — deaden+grip's rest pose
// against shipped's, on the SAME SEED, at the two zooms that decide it.
//
// ROADMAP C30 refuses `feltgrip+gate4` on one gate of six: the pile. Every
// other axis is the best ever measured on this table (shake -35%, hops -32%,
// every pool faster, clock 1.01x). Whether +6.3pp of piling at `close` is worth
// the calmest dice on the table is not a measurement, it is Joe's eye — so this
// puts the two rest poses side by side and gets out of the way.
//
// WHY REST POSES AND NOT A VIDEO. The costs and the wins live in different
// media: the win is motion over the last 0.6 s (shake and hops, already
// measured) and the cost is the FINAL arrangement (dice on top of dice, which
// a still shows better than any clip). So the frames answer the cost, and the
// numbers in C30 answer the win. Do not try to judge shake off a still.
//
//   node tools/drive.mjs tools/steps/grip-look.mjs [seed]
//
// Frames land in tools/out/ as grip-<zoom>-<pool>-<shipped|feltgrip>.png.
// COMPARE WITHIN A PAIR ONLY — same zoom, same pool, same seed, one variable.

// Exactly the matrix's `feltgrip+gate4`, restated here because this step must
// keep working if that file's variant list is re-cut. GRIP + DEADEN.
const GRIP_DEADEN = {
  floorFriction: 0.6, diceFriction: 0.4, wallFriction: 0.2,
  floorRestitution: 0.15, diceRestitution: 0.2, wallRestitution: 0.5,
};
const GATE4 = { gate: 4, slowLinear: 0.1, slowAngular: 0.14 };

// close/6d6 is the cell the refusal turns on (+6.3pp, flat 33/40 -> 23/40) and
// medium/trio is the canonical Soul Deal roll that dice-land-flat pins as a
// floor at every zoom — it regresses 40/40 -> 39/40, which is the quieter half
// of the objection and the one Joe has never been shown.
const CELLS = [
  ['close', '6d6', Array(6).fill('d6')],
  ['medium', 'trio', ['d8', 'd6', 'd10']],
];

export default async function run(stage, args) {
  const seed = Number(args[0] || 1000);
  const a = await stage.tab('localhost', 'GripLook');
  await a.settle();

  // Read the shipped tuning off the app rather than restating it: a step
  // carrying its own copy of the defaults lies after the next retune.
  const INERT = {
    phys: await a.dbg('physics'),
    dampgate: await a.dbg('dampgate'),
    zoom: await a.dbg('zoom'),
  };
  console.log(`inert phys ${JSON.stringify(INERT.phys)}`);
  console.log(`inert dampgate ${JSON.stringify(INERT.dampgate)}\n`);

  const rows = [];
  for (const [zoom, pool, types] of CELLS) {
    for (const variant of ['shipped', 'feltgrip']) {
      // Reset FIRST, every time — the felt is global and a leaked override
      // would silently label the next frame with the wrong variant.
      await a.dbg(`setPhysics(${JSON.stringify(INERT.phys)})`);
      await a.dbg(`setDampgate(${JSON.stringify(INERT.dampgate)})`);
      if (variant === 'feltgrip') {
        await a.dbg(`setPhysics(${JSON.stringify(GRIP_DEADEN)})`);
        await a.dbg(`setDampgate(${JSON.stringify(GATE4)})`);
      }
      await a.dbg(`setZoom('${zoom}')`);
      await a.dbg('sim(200)');
      await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
      await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${variant} ${zoom}/${pool}`, timeout: 60000 });
      const p = await a.dbg('settleProfile()');
      // The pile bar is the THEOREM bar (restCeiling), not the 1.2 that only
      // happens to fit a d6 — a d20 rests legitimately at 1.190.
      const piled = await a.eval(`JSON.stringify((() => {
        const d = window.__diceDebug;
        const ys = d.tableDice.map((o) => ({ y: o.body.position.y, t: o.type }));
        return { n: ys.length,
                 piled: ys.filter((o) => o.y > d.restCeiling(o.t)).length,
                 maxY: Math.round(Math.max(...ys.map((o) => o.y)) * 100) / 100 };
      })())`);
      const q = JSON.parse(piled);
      // CLEAR THE VERDICT CARD BEFORE THE FRAME. It is anchored over the felt
      // and covers exactly the middle of the mat, which is where a pile is —
      // the first cut of these frames had the card sitting on the dice being
      // judged. Clicked by `data-verb`, the attribute paintPrimaryAct sets,
      // rather than by position or class.
      await a.eval(`(() => { const b = document.querySelector('[data-verb="dismiss"]');
        if (b) b.click(); return !!b; })()`);
      await a.dbg('sim(30)');
      await stage.shot(a, `grip-${zoom}-${pool}-${variant}`);
      rows.push([zoom, pool, variant, q.n, q.piled, q.maxY,
        p.duration, p.shake, p.hops]);
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');
    }
  }

  // Restore, so a chained step after this one does not inherit the candidate.
  await a.dbg(`setPhysics(${JSON.stringify(INERT.phys)})`);
  await a.dbg(`setDampgate(${JSON.stringify(INERT.dampgate)})`);
  await a.dbg(`setZoom('${INERT.zoom}')`);

  const head = ['zoom', 'pool', 'variant', 'dice', 'piled', 'maxY', 'dur', 'shake', 'hops'];
  const w = head.map((h, i) => Math.max(String(h).length,
    ...rows.map((r) => String(r[i]).length)));
  const line = (cs) => cs.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(`seed ${seed} — one seed, so these counts are ILLUSTRATIVE.`);
  console.log(`The verdict is the 40-seed matrix in ROADMAP C30; this is the LOOK.\n`);
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
  console.log(`\nframes in tools/out/ — compare WITHIN a pair (same zoom, same`
    + ` pool, same seed).\n  close/6d6:    is the candidate's heap something you`
    + ` would ship for calmer dice?\n  medium/trio:  the canonical roll — does it`
    + ` still read as three dice on a table?`);
}
