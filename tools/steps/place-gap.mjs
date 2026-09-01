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

// THE SPACE BETWEEN THE POOLS, measured with both pools ON the felt — the
// sentence Joe actually said (v3, 2026-09-01: "the players should have more
// space between them on the table by at least 20%"), read the way his own
// two-tab table shows it. place-region.mjs prices one pool at a time against
// its region; this step stages the two-player picture — station 0 rolls and
// settles, station 1 rolls and settles beside it — and reads, per seed, with
// both pools standing:
//
//   sep — centroid-to-centroid distance between the two pools (the
//         place-region proxy, now measured in the flow where the pools can
//         actually collide with each other)
//   gap — the clear ground between them: the minimum pairwise die-centre
//         distance across the two pools
//
// Stamps are injected via netEvent — the same payload shape the server
// writes — so the film under test is the real stamped path. The v3.1 record
// (24 seeds, PLACE_AIM.box 0.25 vs the 7f93c05 baseline) lives beside the
// dials in js/places.js and in ROADMAP row 14. Recorded, never gated.
//
//   node tools/drive.mjs tools/steps/place-gap.mjs [zooms-csv] [seeds] [pools-csv]
//
//   zooms   csv of wide | medium | close     (default medium,wide)
//   seeds   throws per cell                  (default 24)
//   pools   csv of 3d6 | 6d6                 (default 3d6,6d6)

const FACES = { d6: 6, d20: 20 };
const POOLS = { '3d6': Array(3).fill('d6'), '6d6': Array(6).fill('d6') };
const valuesFor = (types, seed) => types.map((t, i) => 1 + ((seed + i * 7) % FACES[t]));
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export default async function run(stage, [zoomsCsv = 'medium,wide', seedCount = '24', poolsCsv = '3d6,6d6']) {
  const n = Number(seedCount);
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  const a = await stage.tab('localhost', 'Gap');
  // The standard set: a themed set's rest cadence nudges settled poses (the
  // trap place-seeds-unchanged records), and this is a physics reading.
  await a.dbg("setDiceSet('std')");
  await a.dbg('holdClock(true)');
  let inj = 0;
  try {
    for (const zoom of zoomsCsv.split(',')) {
      await a.dbg(`setZoom(${JSON.stringify(zoom)})`);
      await a.eval('window.__diceDebug.sim(30)');
      const ext = await a.dbg('tableExtents()');
      for (const pool of poolsCsv.split(',')) {
        const types = POOLS[pool];
        if (!types) continue;
        console.log(`# gap ${zoom} ${pool}: mat ${ext.w} x ${ext.d}; ${n} seeds; both pools standing`);
        const throwOne = async (seed, stamp, who) => {
          const id = `gap-${who}-${inj++}`;
          await a.eval(`window.__diceDebug.netEvent('roll', Object.assign({
            rollId: ${JSON.stringify(id)}, dice: ${JSON.stringify(types)},
            values: ${JSON.stringify(valuesFor(types, seed))}, seed: ${seed},
            playerId: ${JSON.stringify('p' + who)}, playerName: ${JSON.stringify(who)}, color: '#88bbdd', t: 1
          }, ${JSON.stringify(stamp)}))`);
          await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)', { desc: id, timeout: 60000 });
          return id;
        };
        const seps = [];
        const gaps = [];
        for (const seed of seeds) {
          const ra = await throwOne(seed, { entry: 0, lane: -1 }, 'A');
          const rb = await throwOne(seed + 13, { entry: 1, lane: 1 }, 'B');
          const r = await a.eval(`(() => {
            const D = window.__diceDebug;
            const of = (rid) => D.tableDice.filter((d) => d.body && d.rollId === rid)
              .map((d) => [d.body.position.x, d.body.position.z]);
            return { A: of(${JSON.stringify(ra)}), B: of(${JSON.stringify(rb)}) };
          })()`);
          if (!r.A.length || !r.B.length) { console.log(`seed ${seed}: MISSING POOL`); continue; }
          const c = (ps) => [mean(ps.map((p) => p[0])), mean(ps.map((p) => p[1]))];
          const cA = c(r.A);
          const cB = c(r.B);
          const sep = Math.hypot(cA[0] - cB[0], cA[1] - cB[1]);
          let g = Infinity;
          for (const p of r.A) for (const q of r.B) g = Math.min(g, Math.hypot(p[0] - q[0], p[1] - q[1]));
          seps.push(sep);
          gaps.push(g);
          await a.dbg('clearTable()');
          await a.eval('window.__diceDebug.sim(60)');
        }
        console.log(`# SUMMARY ${zoom} ${pool}: sep mean ${mean(seps).toFixed(2)} median ${median(seps).toFixed(2)};`
          + ` gap mean ${mean(gaps).toFixed(2)} median ${median(gaps).toFixed(2)} min ${Math.min(...gaps).toFixed(2)}`);
      }
    }
  } finally {
    await a.dbg("setZoom('wide')");
    await a.dbg('holdClock(false)');
  }
}
