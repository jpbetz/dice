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

// THE PLACE-AIM SHIP/NO-SHIP GATE (UX §7.63, DESIGN §6.2) — run before the
// stamp slice merges, results pasted in its commit message.
//
// The entry EDGE is the read and is not on trial here. On trial is the
// NEGOTIABLE half: PLACE_AIM, the translated landing box that makes the read
// felt in where the dice come to rest. A translated box could, in principle,
// push pools toward a wall and buy the read with piling or with longer
// settles — so the decision was made before the measurement ran:
//
//   SHIP PLACE_AIM as-is iff, against the placeless baseline on identical
//   seeds and identical values:
//     Δ pile        <= +2.0 points  (mean over all stamped cells)
//     Δ median dur  <= +0.25 s      (mean over all stamped cells)
//     no cell       >  +4.0 points  (worst single stamped cell's Δ pile)
//   else PLACE_AIM ships {lateral: 0, entry: 0} and the edge alone carries.
//
// Cells: {close, medium} x {6d6, 12d6, 3d20} x stations {0, 2, 4} vs the
// placeless baseline, N seeds each (default 24). Station 0 is the front
// centre (entry 0, lane 0), station 2 the front-left lane (entry 0, lane -1),
// station 4 the right head (entry 3, lane 0) — a centre, a laned, and a
// short-edge throw. The pile bar is the theorem bar, restCeiling(type): the
// highest a convex die touching the felt can hold its centre (the 6d6 pools
// also read comparably on the historical y>1.2 bar; 3d20 does not, which is
// why the theorem bar is the one used). Stamps are injected via netEvent —
// the same payload shape the server now writes — so the film under test is
// the real stamped path: laneSpread, aimFor, and the translated target box.
//
// THE CONFOUND THE PRE-DECLARED BARS DID NOT ANTICIPATE, and the `ab` mode
// that separates it (2026-08-31, first run): the placeless baseline's seeded
// draw lands on all FOUR sides, while a station cell is one side only — so a
// head cell's Δpile mixes "a short-edge throw piles more than the four-side
// average" (an ENTRY effect, which ships whatever this gate says — the edge
// is the read) with "the translated box piles more" (the AIM effect, the
// only thing on trial). `ab` runs every station cell twice on the same seeds,
// aim at the AUTHORED dials and aim at zero, written through the page's own
// module instance, and prints the aim's OWN cost beside the pre-declared
// verdict. The pre-declared verdict is printed first and decides; the
// attribution is so the fallback, if taken, is taken for a cause it actually
// addresses.
//
// WHAT IT READ, 2026-08-31 (24 seeds): pre-declared gate on the authored
// dials — mean Δpile +1.0pp PASS, mean Δmedian +0.02 s PASS, worst cell
// +8.3pp (close/3d20, station 4) FAIL → the fallback shipped, PLACE_AIM is
// zero. Attribution: the fallback itself reads +9.0pp worst against the same
// baseline (medium/12d6, station 4) — every over-bar cell was the head
// station, aim or no aim; the aim's own cost (on minus off) was mean +0.2pp,
// +0.04 s, worst +6.9pp (five dice of 72 in one 3d20 cell). `gate` mode now
// measures the shipped zero — i.e. the ENTRY's own cost — and `ab` is how the
// authored dials are re-tried.
//
//   node tools/drive.mjs tools/steps/place-settle.mjs [seeds] [gate|ab]

import { entryFor, PLACE_AIM_AUTHORED } from '../../js/places.js';

const ZOOMS = ['close', 'medium'];
const POOLS = [
  ['6d6', Array(6).fill('d6')],
  ['12d6', Array(12).fill('d6')],
  ['3d20', Array(3).fill('d20')],
];
const STATIONS = [0, 2, 4];
const AIM_ON = { ...PLACE_AIM_AUTHORED };                // the dials as designed
const AIM_OFF = { lateral: 0, entry: 0, minTravel: 0 }; // a true zero: no bias, no travel floor

const FACES = { d6: 6, d20: 20 };
const valuesFor = (types, seed) => types.map((t, i) => 1 + ((seed + i * 7) % FACES[t]));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pp = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}pp`;
const secs = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}s`;

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

// The three pre-declared bars, applied to a list of per-cell deltas.
function verdict(label, dPiles, dMeds) {
  const meanDPile = mean(dPiles);
  const meanDMed = mean(dMeds);
  const worstDPile = Math.max(...dPiles);
  const g1 = meanDPile <= 2.0;
  const g2 = meanDMed <= 0.25;
  const g3 = worstDPile <= 4.0;
  console.log(`\n${label}`);
  console.log(`  Δpile mean   ${pp(meanDPile).padEnd(8)} (bar +2.0)  ${g1 ? 'PASS' : 'fail'}`);
  console.log(`  Δmedian mean ${secs(meanDMed).padEnd(8)} (bar +0.25) ${g2 ? 'PASS' : 'fail'}`);
  console.log(`  worst cell   ${pp(worstDPile).padEnd(8)} (bar +4.0)  ${g3 ? 'PASS' : 'fail'}`);
  return g1 && g2 && g3;
}

export default async function run(stage, [seedCount = '24', mode = 'gate']) {
  const n = Number(seedCount);
  const ab = mode === 'ab';
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  const a = await stage.tab('localhost', 'AimGate');
  await a.dbg('holdClock(true)');

  // The dial, read and written through the page's OWN instance of the shared
  // module (the same URL main.js imported, so the same object) — no hook is
  // needed and nothing ships for this measurement's sake.
  const readAim = () => a.eval("import('/js/places.js').then((m) => JSON.stringify(m.PLACE_AIM))");
  const setAim = (o) => a.eval(`import('/js/places.js').then((m) => {
    for (const k of Object.keys(m.PLACE_AIM)) delete m.PLACE_AIM[k];
    Object.assign(m.PLACE_AIM, ${JSON.stringify(o)}); return JSON.stringify(m.PLACE_AIM); })`);
  const shippedAim = JSON.parse(await readAim());
  console.log(`PLACE_AIM as shipped: ${JSON.stringify(shippedAim)}`
    + (ab ? `  (ab: on = ${JSON.stringify(AIM_ON)}, off = ${JSON.stringify(AIM_OFF)})` : '  (gate: measuring the shipped dial)'));

  let inj = 0;
  const throwOnce = async (types, seed, stamp, desc) => {
    const id = `aim-${inj++}`;
    await a.eval(`window.__diceDebug.netEvent('roll', Object.assign({
      rollId: ${JSON.stringify(id)}, dice: ${JSON.stringify(types)},
      values: ${JSON.stringify(valuesFor(types, seed))}, seed: ${seed},
      playerId: 'px', playerName: 'Gate', color: '#88bbdd', t: 1
    }, ${JSON.stringify(stamp || {})}))`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc, timeout: 60000 });
    const p = await a.dbg('settleProfile()');
    const piled = await a.eval(`(() => {
      const D = window.__diceDebug;
      return D.tableDice.filter((d) => d.body
        && d.body.position.y > D.restCeiling(d.type)).length;
    })()`);
    await a.dbg('clearTable()');
    await a.eval('window.__diceDebug.sim(60)');
    return { dur: p.duration, capped: p.timedOut ? 1 : 0, piled };
  };

  const got = new Map(); // "zoom|pool|base" | "zoom|pool|<station>|on|off" -> {pilePct, medDur, capped}
  const cell = async (key, types, stamp) => {
    const durs = [];
    let piled = 0;
    let capped = 0;
    const t0 = Date.now();
    for (const seed of seeds) {
      const r = await throwOnce(types, seed, stamp, `${key}/${seed}`);
      durs.push(r.dur);
      piled += r.piled;
      capped += r.capped;
    }
    const out = { pilePct: (piled / (n * types.length)) * 100, medDur: median(durs), capped };
    got.set(key, out);
    console.log(`  … ${key} done (${Math.round((Date.now() - t0) / 1000)}s)`
      + ` pile ${out.pilePct.toFixed(1)}% med ${out.medDur.toFixed(2)}s${capped ? ` !${capped}` : ''}`);
  };

  try {
    for (const zoom of ZOOMS) {
      await a.dbg(`setZoom(${JSON.stringify(zoom)})`);
      await a.eval('window.__diceDebug.sim(30)');
      for (const [pname, types] of POOLS) {
        await cell(`${zoom}|${pname}|base`, types, null);
        for (const st of STATIONS) {
          const stamp = entryFor(st, false);
          if (ab) {
            await setAim(AIM_ON);
            await cell(`${zoom}|${pname}|${st}|on`, types, stamp);
            await setAim(AIM_OFF);
            await cell(`${zoom}|${pname}|${st}|off`, types, stamp);
            await setAim(shippedAim);
          } else {
            await cell(`${zoom}|${pname}|${st}|on`, types, stamp);   // the shipped dial
          }
        }
      }
    }
  } finally {
    await setAim(shippedAim);
    await a.dbg("setZoom('wide')");
    await a.dbg('holdClock(false)');
  }

  // --- the table -------------------------------------------------------------
  const rows = [];
  const vsBase = { on: { pile: [], med: [] }, off: { pile: [], med: [] } };
  const own = { pile: [], med: [] }; // aim on - aim off, same stamps, same seeds
  for (const zoom of ZOOMS) {
    for (const [pname] of POOLS) {
      const b = got.get(`${zoom}|${pname}|base`);
      rows.push([zoom, pname, 'baseline', b.pilePct.toFixed(1), '—', b.medDur.toFixed(2), '—', b.capped || '']);
      for (const st of STATIONS) {
        for (const which of ab ? ['on', 'off'] : ['on']) {
          const c = got.get(`${zoom}|${pname}|${st}|${which}`);
          const dp = c.pilePct - b.pilePct;
          const dm = c.medDur - b.medDur;
          vsBase[which].pile.push(dp);
          vsBase[which].med.push(dm);
          const label = ab ? (which === 'on' ? ' aim authored' : ' aim zero') : ' (shipped dial)';
          rows.push([zoom, pname, `station ${st}${label}`, c.pilePct.toFixed(1),
            pp(dp), c.medDur.toFixed(2), secs(dm), c.capped || '']);
        }
        if (ab) {
          const on = got.get(`${zoom}|${pname}|${st}|on`);
          const off = got.get(`${zoom}|${pname}|${st}|off`);
          own.pile.push(on.pilePct - off.pilePct);
          own.med.push(on.medDur - off.medDur);
        }
      }
    }
  }
  console.log(`\n${n} identical seeds and values per cell; pile bar = restCeiling(type);`
    + ` Δ columns are against the placeless baseline of the same zoom and pool\n`);
  table(['zoom', 'pool', 'thrown from', 'pile %', 'Δpile', 'med dur', 'Δmed', 'caps'], rows);

  // --- the verdicts ----------------------------------------------------------
  const ship = verdict(ab
    ? 'THE PRE-DECLARED GATE — the authored dials vs the placeless baseline (DESIGN §6.2):'
    : 'THE PRE-DECLARED GATE — the shipped dial vs the placeless baseline (DESIGN §6.2):',
  vsBase.on.pile, vsBase.on.med);
  console.log(ship
    ? '\n  PASS: this dial costs within the bars.'
    : '\n  FAIL: this dial does not clear the bars — the fallback is PLACE_AIM {lateral: 0, entry: 0}.');
  if (ab) {
    verdict('ATTRIBUTION — the fallback itself (aim zero, entry stamped) vs the same baseline;'
      + '\n  what the bars read with the AIM removed and the ENTRY kept:', vsBase.off.pile, vsBase.off.med);
    const ownOk = verdict('ATTRIBUTION — the aim\'s OWN cost: aim authored minus aim zero, same stamps, same seeds'
      + '\n  (the bars applied to the one thing that is negotiable):', own.pile, own.med);
    console.log(`\n  the aim's own contribution ${ownOk ? 'sits inside' : 'exceeds'} the bars;`
      + ' the pre-declared verdict above is the one that decides.');
  }
  if (!ship) process.exitCode = 1;
}
