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

// WHERE A STAMPED THROW COMES TO REST (UX §7.63 v2, js/places.js regionFor /
// aimFor). The record behind PLACE_AIM's dials, and the tool to re-price them.
//
// Joe, on the deployed two-tab table (2026-09-01): "there is not enough room
// for two people to roll the dice at the same time." A place now owns a
// region of the felt for landing, and this step measures whether the dice
// actually get there — per cell (zoom × station × pool), N seeds each:
//
//   in        — the share of DICE that come to rest inside their region
//   centroid  — the share of THROWS whose pool centroid is inside it (the
//               claim scenario place-two-rolls asserts, with a die of margin)
//   pile      — dice resting above restCeiling(type), Joe's "pilling is OK"
//               number, RECORDED and not gated
//   med       — the median settle duration
//   rim<1     — dice resting within one unit of a rim (a pool jammed against
//               the wall reads badly even when it is "in")
//   meanC     — the mean pool centroid, in world units
//
// The placeless baseline (no stamp: the pre-places throw, aimed at the centre
// box) is printed first for every pool so the region throw's pile and settle
// cost can be read against it. Stamps are injected via netEvent — the same
// payload shape the server writes — so the film under test is the real
// stamped path: laneSpread, aimFor, spawnDie's factors.
//
// WHAT IT READ WHEN THE DIALS WERE SET (2026-09-01, medium, 12 seeds a cell):
// the translated box alone at the shipped hurl left the centroid in its
// region 42–58% of the time; easing the hurl to 0.55 gave 67–100% and no
// further (0.25 read the same). The scatter was the DROP — a die spawned
// 6–10 units up meets the felt at ~47 u/s and a cube landing on an edge
// converts that into a ~2-unit kick — so the height factor is the dial that
// did the work: at h 0.45 / speed 0.5 the centroid came in at 92–100% in
// every cell, dice themselves 81–97% for a laned 3d6, 50–64% for a 6d6. A
// shared box had a head's pool converging on one point and colliding (one
// die of three flung across the mat one throw in three), so heads and the
// centre slot aim each die from its own abscissa. Spin was inert (0.6, 0.35)
// and stays at 1.
//
//   node tools/drive.mjs tools/steps/place-region.mjs [zoom] [seeds] [variants-json] [stations] [pools]
//
//   zoom      wide | medium | close            (default medium)
//   seeds     throws per cell                  (default 24)
//   variants  a JSON array of PLACE_AIM shapes to try, or '' for the shipped
//             dials only — e.g. '[{"on":1,"speed":0.4,"h":0.5,"box":0.5,"corner":1,"own":1,"spin":1}]'
//   stations  csv of places                    (default 0,1,4,6)
//   pools     csv of 3d6 | 6d6 | 12d6 | 1d20 | 2d20  (default 3d6,6d6,1d20)
//
// Exit code is always 0: this is a record, not a gate (Joe's ruling).

import { entryFor } from '../../js/places.js';

const FACES = { d6: 6, d20: 20 };
const valuesFor = (types, seed) => types.map((t, i) => 1 + ((seed + i * 7) % FACES[t]));
const POOLS = {
  '3d6': Array(3).fill('d6'), '6d6': Array(6).fill('d6'), '12d6': Array(12).fill('d6'),
  '1d20': ['d20'], '2d20': ['d20', 'd20'],
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export default async function run(stage, [zoom = 'medium', seedCount = '24', variantsJson = '', stationsCsv = '0,1,4,6', poolsCsv = '3d6,6d6,1d20']) {
  const n = Number(seedCount);
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  const stations = stationsCsv.split(',').map(Number);
  const pools = poolsCsv.split(',').filter((p) => POOLS[p]);
  const a = await stage.tab('localhost', 'Region');
  // The standard set: a themed set's rest cadence nudges settled poses (the
  // trap place-seeds-unchanged records), and this is a physics reading.
  await a.dbg("setDiceSet('std')");
  await a.dbg('holdClock(true)');
  await a.dbg(`setZoom(${JSON.stringify(zoom)})`);
  await a.eval('window.__diceDebug.sim(30)');
  const ext = await a.dbg('tableExtents()');
  const readAim = () => a.eval("import('/js/places.js').then((m) => JSON.stringify(m.PLACE_AIM))");
  const setAim = (o) => a.eval(`import('/js/places.js').then((m) => {
    for (const k of Object.keys(m.PLACE_AIM)) delete m.PLACE_AIM[k];
    Object.assign(m.PLACE_AIM, ${JSON.stringify(o)}); return JSON.stringify(m.PLACE_AIM); })`);
  const shipped = JSON.parse(await readAim());
  const variants = variantsJson ? JSON.parse(variantsJson) : [shipped];
  console.log(`# zoom ${zoom}: mat ${ext.w} x ${ext.d}; ${n} seeds a cell; shipped PLACE_AIM ${JSON.stringify(shipped)}`);

  let inj = 0;
  const throwOnce = async (types, seed, stamp) => {
    const id = `region-${inj++}`;
    await a.eval(`window.__diceDebug.netEvent('roll', Object.assign({
      rollId: ${JSON.stringify(id)}, dice: ${JSON.stringify(types)},
      values: ${JSON.stringify(valuesFor(types, seed))}, seed: ${seed},
      playerId: 'px', playerName: 'Region', color: '#88bbdd', t: 1
    }, ${JSON.stringify(stamp || {})}))`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)', { desc: id, timeout: 60000 });
    const r = await a.eval(`(() => {
      const D = window.__diceDebug;
      const p = D.settleProfile();
      const org = D.throwOrigin();
      const dice = D.tableDice.filter((d) => d.body).map((d) => ({
        x: d.body.position.x, z: d.body.position.z,
        piled: d.body.position.y > D.restCeiling(d.type) }));
      return { dur: p.duration, capped: !!p.timedOut, dice, region: org.region };
    })()`);
    await a.dbg('clearTable()');
    await a.eval('window.__diceDebug.sim(60)');
    return r;
  };
  const inR = (R, x, z) => !!R && x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1;
  const cell = async (types, stamp) => {
    let inCount = 0; let total = 0; let centroidIn = 0; let piled = 0; let capped = 0; let rim = 0;
    const durs = []; const cents = [];
    for (const seed of seeds) {
      const r = await throwOnce(types, seed, stamp);
      durs.push(r.dur);
      if (r.capped) capped++;
      let cx = 0; let cz = 0;
      for (const d of r.dice) {
        total++;
        if (d.piled) piled++;
        if (inR(r.region, d.x, d.z)) inCount++;
        if (Math.min(ext.w / 2 - Math.abs(d.x), ext.d / 2 - Math.abs(d.z)) < 1.0) rim++;
        cx += d.x / r.dice.length;
        cz += d.z / r.dice.length;
      }
      cents.push([cx, cz]);
      if (inR(r.region, cx, cz)) centroidIn++;
    }
    const mc = cents.reduce((s, c) => [s[0] + c[0] / cents.length, s[1] + c[1] / cents.length], [0, 0]);
    return {
      inPct: (100 * inCount) / total, centPct: (100 * centroidIn) / n, pilePct: (100 * piled) / total,
      med: median(durs), capped, rimPct: (100 * rim) / total, meanC: mc,
    };
  };
  const pct = (v) => `${v.toFixed(0).padStart(3)}%`;
  const fmt = (c, base) => `in ${pct(c.inPct)}  centroid ${pct(c.centPct)}  pile ${c.pilePct.toFixed(1).padStart(5)}%`
    + (base ? ` (${c.pilePct - base.pilePct >= 0 ? '+' : ''}${(c.pilePct - base.pilePct).toFixed(1)}pp)` : '        ')
    + `  med ${c.med.toFixed(2)}s` + (base ? ` (${c.med - base.med >= 0 ? '+' : ''}${(c.med - base.med).toFixed(2)}s)` : '         ')
    + `  rim<1 ${pct(c.rimPct)}  meanC (${c.meanC[0].toFixed(2)}, ${c.meanC[1].toFixed(2)})${c.capped ? `  !${c.capped} capped` : ''}`;

  try {
    const bases = new Map();
    await setAim({ on: 0 });
    for (const pn of pools) {
      const b = await cell(POOLS[pn], null);
      bases.set(pn, b);
      console.log(`${pn.padEnd(5)} placeless baseline                 ${fmt(b, null)}`);
    }
    for (const v of variants) {
      await setAim(v);
      console.log(`-- PLACE_AIM ${JSON.stringify(v)}`);
      for (const st of stations) {
        const stamp = entryFor(st, false);
        for (const pn of pools) {
          const c = await cell(POOLS[pn], stamp);
          console.log(`${pn.padEnd(5)} station ${st} ${JSON.stringify(stamp).padEnd(22)} ${fmt(c, bases.get(pn))}`);
        }
      }
    }
  } finally {
    await setAim(shipped);
    await a.dbg("setZoom('wide')");
    await a.dbg('holdClock(false)');
  }
  console.log('# recorded, not gated (Joe: "pilling is OK") — the region is the requirement');
}
