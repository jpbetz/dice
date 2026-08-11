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
//   node tools/drive.mjs tools/steps/tower-probe.mjs [n] [seed] [secs]

export default async function run(stage, args) {
  const n = Number(args[0]) || 8;
  const seed = Number(args[1]) || 42;
  const secs = Number(args[2]) || 14;
  const a = await stage.tab('localhost', 'TowerProbe');

  await a.dbg('holdClock(true)');
  await a.dbg('towerEcho(false)'); // the ring buffer is the record here
  await a.dbg('towerCore(true)');
  await a.dbg(`towerDrop(${n}, ${seed})`);

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
  const log = await a.dbg('towerLog()');
  const z0 = st.z0;

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
      : o.p[2] < z0 + 0.6 ? 'HIDDEN'
      : o.p[2] < z0 + 3.9 ? 'TRAY' : 'FELT';
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
