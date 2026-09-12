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

// TOWER LAB PROBE — the same seeded pour Joe runs by hand, stepped
// deterministically, with the collision log read back. Answers, per die:
// did it make it out onto the felt, where did it stop, what did it hit
// on the way, and how many rescues it burned. The screenshot-forensics
// loop this replaces cost a human reload per hypothesis.
//
// The 4th argument is a tower id, and running it for a NEW skin is not
// redundant: the whole claim of the contract is that a skin adds no physics,
// so the same seed through the same core must produce the same verdict
// whatever model is standing around it. A difference here is a collider
// somebody smuggled in.
//
//   node tools/drive.mjs tools/steps/tower-probe.mjs [n] [seed] [secs] [tower]

import assert from 'node:assert/strict';
import { openTowerLab } from '../tower-lab.mjs';

export default async function run(stage, args) {
  const n = Number(args[0]) || 8;
  const seed = Number(args[1]) || 42;
  const secs = Number(args[2]) || 14;
  const tower = args[3] || 'wickroot';
  const a = await stage.tab('localhost', 'TowerProbe');

  await a.dbg('holdClock(true)');
  await a.dbg('towerEcho(false)'); // the ring buffer is the record here
  const worn = await openTowerLab(a, tower);
  console.log(`skin=${worn} n=${n} seed=${seed}`);
  const drop = await a.dbg(`towerDrop(${n}, ${seed})`);
  assert.equal(drop?.dropped, n, 'the requested probe dice were dropped');

  // Step 1 s at a time; print the state line so a stall is visible AS a
  // stall (constant positions, hidden count not draining) rather than as a
  // silent timeout.
  for (let s = 1; s <= secs; s++) {
    const st = await a.eval(`(() => {
      for (let i = 0; i < 60; i++) window.__diceDebug.tick(1 / 60, false, false);
      return window.__diceDebug.towerState();
    })()`);
    const outs = st.out.map((o) => `${o.name}@z${o.p[2]}${o.rescues ? `(r${o.rescues})` : ''}`).join(' ');
    console.log(`t=${st.t}s falling=${st.falling} hidden=${st.hidden} out=[${outs}]`);
  }

  const st = await a.dbg('towerState()');
  assert.equal(st.dropped, n, 'the probe measured a nonempty requested pour');
  const log = await a.dbg('towerLog()');
  const z0 = st.z0;
  // The cut lines come from the SPEC, not from literals: a portal tower may
  // put its sill and outrun elsewhere, and grading its dice against the
  // classic chute would call a delivered die TRAY (or worse). For a classic
  // tower these are exactly the old z0+0.6 and z0+3.9.
  //
  // NO FALLBACK, DELIBERATELY. The first cut wrote `spec ? spec.derived.x :
  // <classic literal>` immediately under that paragraph — which is the exact
  // grading-against-classic-literals the paragraph forbids, kept alive as a
  // silent default. A null spec means 'none', an unregistered id, or a typo
  // in the argument; every one of those makes the verdicts below meaningless,
  // and a run that prints FELT/TRAY/HIDDEN against the wrong chute is worse
  // than no run.
  const spec = await a.dbg(`towerPortalSpec(${JSON.stringify(tower)})`);
  if (!spec) {
    console.log(`BAD: '${tower}' has no portal spec (unregistered, or 'none' — which is not `
      + 'a mode) — there is no chute to grade these dice against');
    process.exitCode = 1;
    return;
  }
  const hidCut = z0 + spec.derived.hidZone;
  const trayCut = spec.derived.lipFrontZ;

  console.log('\n--- collisions ---');
  for (const e of log) console.log(`t=${e.t} ${e.a} x ${e.b} @(${e.at.join(',')}) v=${e.v}`);

  // Three honest end states: FELT (delivered past the chute), TRAY (parked
  // visibly on/near the chute — legitimate, the next exit plows it), and
  // HIDDEN (bad: resting where only a skin's shadow would be). Plus the
  // count invariant: every dropped die must have been born and none may
  // still be queued at the end.
  console.log('\n--- verdicts ---');
  const counts = { FELT: 0, TRAY: 0, HIDDEN: 0, MOVING: 0 };
  for (const o of st.out) {
    const cls = o.v >= 0.6 ? 'MOVING'
      : o.p[2] < hidCut ? 'HIDDEN'
      : o.p[2] < trayCut ? 'TRAY' : 'FELT';
    counts[cls]++;
    console.log(`${o.name}: ${cls} p=(${o.p.join(',')}) v=${o.v} rescues=${o.rescues}`);
  }
  // born counts EXITS (a re-queued die is born again), so born ≥ dropped is
  // churn, not loss. Bad = anything still queued at the end, resting where
  // only a skin's shadow would be, or still moving.
  console.log(`\ndropped=${st.dropped} exits=${st.born} queued=${st.falling + st.hidden} `
    + `felt=${counts.FELT} tray=${counts.TRAY} hidden=${counts.HIDDEN} moving=${counts.MOVING}`);
  const bad = counts.HIDDEN + counts.MOVING + st.falling + st.hidden;
  console.log(bad === 0 ? 'CLEAN: every die delivered' : `BAD: ${bad} dice unaccounted or misplaced`);
  if (bad > 0) process.exitCode = 1;
}
