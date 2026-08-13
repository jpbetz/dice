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

// THE PORTAL-FLOORS CAMPAIGN (ROADMAP §9d — "figure out what the actual
// minimums are"). The shipped TOWER_PORTAL_LIMITS floors were inherited
// from the classic spec's numbers, never derived; this measures what dice
// ACTUALLY use, then probes candidate portals BELOW the shipped floor
// (towerProbePortals bypasses the limits — proofs-only) until the physics
// pushes back (lintel/jamb strikes → exit-guarantee retries and faults).
//
//   node tools/drive.mjs tools/steps/portal-probe.mjs baseline
//     → utilization at the classic spec: envelope distributions per pour.
//   node tools/drive.mjs tools/steps/portal-probe.mjs sweep
//     → the knee search: per-axis candidates, JSON line per pour.
//
// Output: `ENV {...}` JSON lines on stdout; aggregate offline. Heartwood
// carries the probe (code skin — instant socket; the physics is the
// engine's, not the model's).

const S = 1.25;
const CLASSIC = {
  in: { x: 0, z: -1.6 * S, rimY: 7.0 * S, clearR: 1.7 * S },
  out: { x: 0, sillY: 0.8 * S, w: 4.0 * S, clearH: 3.6 * S },
};
const POOLS = {
  heavy: ['d20', 'd20', 'd20', 'd20'],
  congest: ['d6', 'd6', 'd6', 'd6', 'd6', 'd6', 'd6', 'd6'],
  mixed: ['d20', 'd12', 'd10', 'd8', 'd6', 'd6', 'd4', 'd12'],
};

function candidates() {
  const list = [];
  const mk = (name, mut) => {
    const spec = JSON.parse(JSON.stringify(CLASSIC));
    mut(spec);
    list.push({ name, spec });
  };
  // clearH descends — the axis Joe called: 4.5 shipped, die diameter 2.5.
  for (const h of [4.5, 4.0, 3.6, 3.3, 3.0, 2.8, 2.6]) {
    mk(`clearH=${h}`, (s) => { s.out.clearH = h; });
  }
  // width descends: 5.0 shipped; spawn lane ±0.9 + d20 radius 1.25 = 2.15
  // half analytic before yaw drift.
  for (const w of [5.0, 4.4, 4.0, 3.7, 3.4]) {
    mk(`w=${w}`, (s) => { s.out.w = w; });
  }
  // entry clearR descends: 2.125 shipped; scripted envelope is analytic
  // (±0.4 xz jitter → 0.566 radial + 1.25 circumradius = 1.816).
  for (const r of [2.125, 1.95, 1.85, 1.75]) {
    mk(`clearR=${r}`, (s) => { s.in.clearR = r; });
  }
  return list;
}

// The proposed floors, exactly as they would ship — run `confirm` before
// changing TOWER_PORTAL_LIMITS. Interactions and the historical worst case
// (40d6 once spent all five bakes at the CLASSIC door) are the point.
function confirmMatrix() {
  const at = (mut) => {
    const spec = JSON.parse(JSON.stringify(CLASSIC));
    mut(spec);
    return spec;
  };
  return [
    // The control FIRST: the classic door under the same mega pools — the
    // historical note says 40d6 exhausted the guarantee at 4.5 too, and
    // without this row the floor gets blamed for a cost it may not own.
    { name: 'classicCtl', spec: at(() => {}) },
    // TEMP-CTL { name: 'floorH', spec: at((s) => { s.out.clearH = 2.7 * S; }) },
    // TEMP-CTL { name: 'floorH+w4', spec: at((s) => { s.out.clearH = 2.7 * S; s.out.w = 3.2 * S; }) },
    { name: 'floorALL', spec: at((s) => {
      s.out.clearH = 2.7 * S; s.out.w = 3.2 * S; s.in.clearR = 1.6 * S;
    }) },
  ];
}

export default async function run(stage, args) {
  const mode = args[0] || 'baseline';
  const a = await stage.tab('localhost', 'PortalProbe');
  await a.dbg('holdClock(true)');

  const socket = async () => {
    await a.dbg(`setTower('none')`);
    await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'towerless' });
    await a.dbg('sim(20)');
    await a.dbg(`setTower('heartwood')`);
    await a.waitFor(`window.__diceDebug.tower === 'heartwood'`, { desc: 'heartwood up' });
    await a.dbg('sim(20)');
  };

  const pour = async (poolName, types, seed) => {
    await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
    await a.waitFor('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
      { desc: `${poolName}#${seed} baked`, timeout: 60000 });
    const env = JSON.parse(await a.eval(
      'JSON.stringify(window.__diceDebug.towerPourEnvelope())'));
    await a.dbg('clearTable()');
    await a.dbg('sim(200)');
    return env;
  };

  const line = (tag, poolName, seed, env) => {
    const worst = (x) => (x === null ? 'n/a' : x.toFixed(3));
    console.log(`ENV ${JSON.stringify({ tag, pool: poolName, seed, ...env, dies: undefined })}`);
    console.log(`  ${tag} ${poolName}#${seed}: head ${worst(env.worstHead)} `
      + `lat ${worst(env.worstLat)} entry ${worst(env.worstEntry)} `
      + `attempts ${env.attempts} unseen ${env.unseen} stranded ${env.stranded}`);
  };

  await socket();

  if (mode === 'baseline') {
    for (const [poolName, types] of Object.entries(POOLS)) {
      for (let i = 0; i < 12; i++) {
        const seed = 1000 + i * 37;
        const env = await pour(poolName, types, seed);
        line('classic', poolName, seed, env);
      }
    }
  } else if (mode === 'confirm') {
    const mega = { c20: Array.from({ length: 20 }, () => 'd6'),
      c40: Array.from({ length: 40 }, () => 'd6') };
    for (const { name, spec } of confirmMatrix()) {
      await a.eval(`window.__diceDebug.towerProbePortals(${JSON.stringify(spec)})`);
      await socket();
      for (const [poolName, types] of Object.entries(POOLS)) {
        for (let i = 0; i < 12; i++) {
          const seed = 9000 + i * 53;
          const env = await pour(poolName, types, seed);
          line(name, poolName, seed, env);
        }
      }
      for (const [poolName, types] of Object.entries(mega)) {
        for (let i = 0; i < 3; i++) {
          const seed = 7000 + i * 59;
          const env = await pour(poolName, types, seed);
          line(name, poolName, seed, env);
        }
      }
    }
    await a.eval('window.__diceDebug.towerProbePortals(null)');
  } else {
    for (const { name, spec } of candidates()) {
      await a.eval(`window.__diceDebug.towerProbePortals(${JSON.stringify(spec)})`);
      await socket(); // colliders re-derive from the candidate at socket
      for (const [poolName, types] of Object.entries({ heavy: POOLS.heavy, congest: POOLS.congest })) {
        for (let i = 0; i < 6; i++) {
          const seed = 5000 + i * 41;
          const env = await pour(poolName, types, seed);
          line(name, poolName, seed, env);
        }
      }
    }
    await a.eval('window.__diceDebug.towerProbePortals(null)');
  }

  await a.dbg(`setTower('none')`);
  console.log('\nDONE');
}
