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

// THE REST POSE UNDER THE FELT TUNING AND UNDER THE ONE IT REPLACED, on the
// SAME SEED, at the two zooms that decide it.
//
// THE PAIR IS NOW SHIPPED vs CLASSIC, NOT SHIPPED vs CANDIDATE (2026-08-18).
// This step was built to overturn a refusal: ROADMAP C30 refused
// `feltgrip+gate4` on one gate of six, the pile, while it won every other axis
// ever measured here (shake -35%, hops -14% to -32%, every pool faster, clock
// 1.03x). Joe overturned the refusal — "Pilling is OK. If you throw a lot of
// dice, it's your fault if they pile up. Let's not try to prevent it." — and
// the tuning shipped. Left as it was, this step would have set the candidate's
// overrides on top of a build that already holds them and shot two IDENTICAL
// frames under two different labels, which is a look that cannot fail. So the
// second arm is now `classic`: the pre-C30 numbers, restored as an override.
//
// WHY REST POSES AND NOT A VIDEO. The costs and the wins live in different
// media: the win is motion over the last 0.6 s (shake and hops, already
// measured) and the cost is the FINAL arrangement (dice on top of dice, which
// a still shows better than any clip). So the frames answer the cost, and the
// numbers in C30 answer the win. Do not try to judge shake off a still.
//
//   node tools/drive.mjs tools/steps/grip-look.mjs [seed]
//
// Frames land in tools/out/ as grip-<zoom>-<pool>-<shipped|classic>.png.
// COMPARE WITHIN A PAIR ONLY — same zoom, same pool, same seed, one variable.

// Exactly the matrix's `classic` row, restated here because this step must
// keep working if that file's variant list is re-cut: the tuning that shipped
// from the first pass until 2026-08-18, and the speed gate off.
const CLASSIC = {
  floorFriction: 0.25, diceFriction: 0.15, wallFriction: 0.05,
  floorRestitution: 0.35, diceRestitution: 0.45, wallRestitution: 0.7,
};
const NOGATE = { gate: 0, slowLinear: 0, slowAngular: 0 };

// close/6d6 is the cell the refusal turned on (+6.3pp, flat 33/40 -> 23/40)
// and medium/trio is the canonical Soul Deal roll that dice-land-flat pins as
// a floor at every zoom — it moves 40/40 -> 39/40, which is the quieter half
// of the cost that was accepted.
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
    for (const variant of ['shipped', 'classic']) {
      // Reset FIRST, every time — the felt is global and a leaked override
      // would silently label the next frame with the wrong variant.
      await a.dbg(`setPhysics(${JSON.stringify(INERT.phys)})`);
      await a.dbg(`setDampgate(${JSON.stringify(INERT.dampgate)})`);
      if (variant === 'classic') {
        await a.dbg(`setPhysics(${JSON.stringify(CLASSIC)})`);
        await a.dbg(`setDampgate(${JSON.stringify(NOGATE)})`);
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
    + ` pool, same seed).\n  close/6d6:    what the accepted pile actually looks`
    + ` like, against the mat that piled less.\n  medium/trio:  the canonical roll`
    + ` — does it still read as three dice on a table?`);
}
