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

// THE LANED SPAWN LINE, PRICED AGAINST THE LANELESS ONE (UX §7.63, fix F1) —
// spawn-clear.mjs's question re-asked WITH lanes, which is the half a stamp
// actually moves. Run before the stamp slice merges; results in its commit.
//
// Two gates, both against the laneless baseline on identical seeds:
//
//   WALL   worst spawnLine clearance >= 0 in every laned cell — a lane must
//          never push a die through a wall plane (fit() keeps the last word
//          per die, and this is the measurement that it does).
//   F1     the lane must not degrade the pool's own separation. The design's
//          first draft asked for an absolute `min pairwise |Δx| >= 0.7 after
//          jitter at close/6d6` — UNREACHABLE in the pristine build (pitch
//          0.84 minus +/-0.6 jitter crosses zero on real seeds), so the gate
//          is re-expressed as the delta the claim actually needs: the laned
//          median-of-min-pairwise within 0.05 of the laneless baseline's, per
//          cell. (The absolute 0.7 IS reachable at wide/6d6 — pitch 1.94 —
//          and place-throws-from-your-edge asserts it there.) The F1 collapse
//          this replaces read as min pairwise 0.0 with every outboard die on
//          one x; a delta gate over medians cannot miss that.
//
// Spawn positions are written at spawn time, so nothing here waits for a
// settle — inject, read spawnLine, skip the film, clear.
//
//   node tools/drive.mjs tools/steps/place-spawn.mjs [seeds]

const ZOOMS = ['close', 'medium'];
const POOLS = [
  ['2d6', Array(2).fill('d6')],
  ['3d6', Array(3).fill('d6')],
  ['6d6', Array(6).fill('d6')],
  ['12d6', Array(12).fill('d6')],
  ['3d20', Array(3).fill('d20')],
];
// The baseline, then the two laned long-edge entries (heads carry no lane).
const VARIANTS = [
  ['laneless', null],
  ['e1 lane-1', { entry: 1, lane: -1 }],
  ['e0 lane+1', { entry: 0, lane: 1 }],
];
const F1_CELLS = ['6d6', '12d6']; // the pools the collapse was recorded on

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

export default async function run(stage, [seedCount = '40']) {
  const n = Number(seedCount);
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  const a = await stage.tab('localhost', 'LaneGate');
  await a.dbg('holdClock(true)');

  let inj = 0;
  const spawnOnce = async (types, seed, stamp) => {
    const id = `lane-${inj++}`;
    await a.eval(`window.__diceDebug.netEvent('roll', Object.assign({
      rollId: ${JSON.stringify(id)}, dice: ${JSON.stringify(types)},
      values: ${JSON.stringify(types.map((_, i) => 1 + ((seed + i) % 6)))},
      seed: ${seed}, playerId: 'px', playerName: 'Gate', color: '#88bbdd', t: 1
    }, ${JSON.stringify(stamp || {})}))`);
    const line = await a.dbg('spawnLine()');
    await a.dbg('skipCeremony()');
    await a.eval('window.__diceDebug.sim(4)');
    await a.dbg('clearTable()');
    await a.eval('window.__diceDebug.sim(4)');
    const side = line.length ? line[0].side : null;
    const along = line.map((s) => (side < 2 ? s.x : s.z)).sort((p, q) => p - q);
    let pair = Infinity;
    for (let i = 1; i < along.length; i++) pair = Math.min(pair, along[i] - along[i - 1]);
    return {
      side,
      clear: line.length ? Math.min(...line.map((s) => s.clear)) : null,
      pair: line.length > 1 ? pair : null,
    };
  };

  const got = new Map(); // "zoom|pool|variant" -> {worstClear, medPair, minPair}
  for (const zoom of ZOOMS) {
    await a.dbg(`setZoom(${JSON.stringify(zoom)})`);
    await a.eval('window.__diceDebug.sim(20)');
    for (const [pname, types] of POOLS) {
      for (const [vname, stamp] of VARIANTS) {
        const pairs = [];
        let worstClear = Infinity;
        for (const seed of seeds) {
          const r = await spawnOnce(types, seed, stamp);
          // The baseline's seeded draw lands on all four sides; only its
          // long-edge throws are comparable with a laned line, which is
          // side-0/1 by construction.
          if (stamp === null && r.side >= 2) continue;
          if (r.pair !== null) pairs.push(r.pair);
          if (r.clear !== null) worstClear = Math.min(worstClear, r.clear);
        }
        got.set(`${zoom}|${pname}|${vname}`, {
          worstClear,
          n: pairs.length,
          minPair: pairs.length ? Math.min(...pairs) : null,
          medPair: pairs.length ? median(pairs) : null,
        });
      }
      console.log(`  … ${zoom} ${pname} done`);
    }
  }
  await a.dbg("setZoom('wide')");
  await a.dbg('holdClock(false)');

  // --- report and verdict --------------------------------------------------
  const rows = [];
  let wallOk = true;
  let f1Ok = true;
  for (const zoom of ZOOMS) {
    for (const [pname] of POOLS) {
      const b = got.get(`${zoom}|${pname}|laneless`);
      for (const [vname] of VARIANTS) {
        const c = got.get(`${zoom}|${pname}|${vname}`);
        const laned = vname !== 'laneless';
        if (laned && c.worstClear < 0) wallOk = false;
        let verdict = '';
        if (laned && c.medPair !== null && b.medPair !== null && F1_CELLS.includes(pname)) {
          const ok = c.medPair >= b.medPair - 0.05;
          if (!ok) f1Ok = false;
          verdict = `${ok ? 'ok' : 'DEGRADED'} (Δmed ${(c.medPair - b.medPair) >= 0 ? '+' : ''}`
            + `${(c.medPair - b.medPair).toFixed(3)})`;
        }
        rows.push([zoom, pname, vname, `${c.n}`,
          c.worstClear === Infinity ? '—' : c.worstClear.toFixed(2),
          c.minPair === null ? '—' : c.minPair.toFixed(3),
          c.medPair === null ? '—' : c.medPair.toFixed(3), verdict]);
      }
    }
  }
  console.log(`\n${n} identical seeds per cell; baseline rows keep only their`
    + ` long-edge (side 0/1) throws, laned rows are side 0/1 by construction\n`);
  table(['zoom', 'pool', 'variant', 'throws', 'worst clear', 'min pair', 'med pair', 'F1 gate'], rows);
  console.log(`\n  WALL gate (laned worst clear >= 0): ${wallOk ? 'PASS' : 'FAIL'}`);
  console.log(`  F1 gate (laned med pair >= laneless med - 0.05, ${F1_CELLS.join('/')}): `
    + `${f1Ok ? 'PASS' : 'FAIL'}`);
  if (!(wallOk && f1Ok)) process.exitCode = 1;
}
