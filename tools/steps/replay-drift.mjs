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

// DOES THE SAME SEED STILL THROW THE SAME WAY AFTER THE TAB HAS BEEN OPEN A
// WHILE? Every client fast-forwards a roll from its seed and must agree, and
// `perf-determinism` compares two FRESHLY LOADED tabs — so a tuning whose
// outcome depends on accumulated `world.time` passes every check we have and
// still desynchronises two players an hour apart.
//
// Throw a seed family, churn N unrelated throws, throw the family again,
// compare the settled poses byte for byte. Recorded as a finding on
// 2026-08-10 (settle-matrix.mjs's SLEEPIER comment) but never as code, so it
// could not be re-run against the next candidate. This is that code, and
// `sleepier` is kept as the CONTROL: an instrument that has never been seen
// to fail is not yet evidence.
//
//   node tools/drive.mjs tools/steps/replay-drift.mjs [variant] [seeds] [churn]
//     variant: shipped | candidate | sleepier   (sleepier must FAIL)

const DEADEN = { floorRestitution: 0.15, diceRestitution: 0.2, wallRestitution: 0.5 };
const GATE4 = { gate: 4, slowLinear: 0.1, slowAngular: 0.14 };

const VARIANTS = {
  shipped: {},
  candidate: { phys: DEADEN, dampgate: GATE4, nudge: { pileScale: 1.6 } },
  sleepier: { sleep: { speed: 0.9, time: 0.2 } },
};

export default async function run(stage, [variant = 'candidate', seedCount = '16', churnCount = '700']) {
  const v = VARIANTS[variant];
  if (!v) throw new Error(`no such variant: ${variant} (have ${Object.keys(VARIANTS).join(', ')})`);
  const n = Number(seedCount);
  const churn = Number(churnCount);
  const a = await stage.tab('localhost', 'Drift');

  if (v.phys) await a.dbg(`setPhysics(${JSON.stringify(v.phys)})`);
  if (v.dampgate) await a.dbg(`setDampgate(${JSON.stringify(v.dampgate)})`);
  if (v.nudge) await a.dbg(`setNudge(${JSON.stringify(v.nudge)})`);
  if (v.sleep) await a.dbg(`setSleep(${JSON.stringify(v.sleep)})`);
  console.log(`variant ${variant}`);
  console.log(`  phys     ${JSON.stringify(await a.dbg('physics'))}`);
  console.log(`  dampgate ${JSON.stringify(await a.dbg('dampgate'))}`);
  console.log(`  nudge    ${JSON.stringify(await a.dbg('nudge'))}`);
  console.log(`  sleep    ${JSON.stringify(await a.dbg('sleep'))}`);

  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);

  // The settled pose at full precision, not a rounded summary: two throws
  // that agree to three decimals and disagree in the mantissa are still two
  // different throws to a client comparing keyframes.
  const poseOf = () => a.eval(`JSON.stringify(window.__diceDebug.tableDice.map((d) => [
    d.body.position.x, d.body.position.y, d.body.position.z,
    d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w,
  ])) + '|' + window.__diceDebug.currentRoll.duration + '|' + window.__diceDebug.currentRoll.nudges`);

  const family = async (tag) => {
    const out = [];
    for (const seed of seeds) {
      await a.dbg(`throwSeeded(["d8","d8","d4","d6"], ${seed})`);
      await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${tag} ${seed}`, timeout: 60000 });
      out.push(await poseOf());
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');
    }
    return out;
  };

  const before = await family('before');
  // Churn in the PAGE, a hundred at a time: 700 CDP round trips would cost
  // more than the physics does, and what has to accumulate is world.time,
  // which only playRoll's bake advances.
  const t0 = Date.now();
  for (let done = 0; done < churn; done += 100) {
    const k = Math.min(100, churn - done);
    await a.eval(`(() => { for (let i = 0; i < ${k}; i++) {
      window.__diceDebug.throwSeeded(['d6'], 500000 + ${done} + i);
      window.__diceDebug.clearTable();
    } return true; })()`);
  }
  await a.dbg('sim(120)');
  console.log(`\nchurned ${churn} unrelated throws in ${Math.round((Date.now() - t0) / 1000)}s`);
  const after = await family('after');

  let same = 0;
  const drifted = [];
  before.forEach((b, i) => {
    if (b === after[i]) same++;
    else drifted.push(seeds[i]);
  });
  console.log(`\nreplay after churn — ${same}/${n} byte-identical`);
  if (drifted.length) console.log(`  drifted seeds: ${drifted.join(', ')}`);
  const expectFail = variant === 'sleepier';
  console.log(`  ${same === n
    ? (expectFail ? 'IDENTICAL — but this variant is the CONTROL and was supposed to drift;'
      + ' the instrument is not proving anything' : 'IDENTICAL — the same seed replays')
    : (expectFail ? 'DRIFTED — the control drifts, so the check can detect drift'
      : 'DRIFTED — this tuning does not replay; do not ship it')}`);
}
