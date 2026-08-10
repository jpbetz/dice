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
// POOL-GENERALIZED (2026-08-10). The first version hard-coded the four-die
// soul family, which is the pool this table drifts LEAST on: a small throw is
// over in two seconds and gives float accumulation the least room. 20d6 runs
// three times as long with twenty bodies in the broadphase, and it is where
// the drift is worth an eye — so the default now sweeps three pools and each
// carries its own seed count.
//
// EACH POOL GETS ITS OWN before/churn/after CYCLE, AND THAT IS NOT TIDINESS.
// The first pool-generalized version threw every family, churned once, and
// re-threw every family — and in that shape SHIPPED came back 8/8 on 20d6.
// Run 20d6 by itself and shipped is 4 of 8, with seed 8919 replaying a 5.5 s
// throw as an 8.55 s one. The drift is a KNIFE EDGE: how much unrelated
// history precedes a family decides which side of cannon's sleep decision it
// lands on, so interleaving three pools quietly moved 20d6 onto the safe side
// and reported a clean bill for a build with a live production bug (C31).
//
// So: a PASSING drift run is weak evidence and a FAILING one is strong. This
// file cannot prove a tuning replays; it can only fail to catch it not
// replaying. Judge a candidate on one pool per invocation as well as here.
//
//   node tools/drive.mjs tools/steps/replay-drift.mjs [variant] [seeds] [churn] [pools]
//     variant: shipped | candidate | sleepier   (sleepier must FAIL)
//     seeds:   overrides EVERY pool's count (default: per-pool, see POOLS)
//     churn:   unrelated throws between the two families (default 900)
//     pools:   comma list of names from POOLS, or "name:count" pairs

const DEADEN = { floorRestitution: 0.15, diceRestitution: 0.2, wallRestitution: 0.5 };
const GATE4 = { gate: 4, slowLinear: 0.1, slowAngular: 0.14 };

const VARIANTS = {
  shipped: {},
  deaden: { phys: DEADEN },
  deadengate4: { phys: DEADEN, dampgate: GATE4 },
  nudgepile: { nudge: { pileScale: 1.05 } },
  candidate: { phys: DEADEN, dampgate: GATE4, nudge: { pileScale: 1.05 } },
  sleepier: { sleep: { speed: 0.9, time: 0.2 } },
  // The damping gate on its OWN. It appears in three composite rows above and
  // its drift was never measured alone, so every "candidate replays" result
  // that included it was resting on an untested component.
  gate4: { dampgate: GATE4 },
  // Attribution: is deaden's drift a sleep-boundary knife edge? A deadened
  // die spends far longer near sleepSpeedLimit, where accumulated world.time
  // can tip the decision. allowSleep=false removes the boundary. `sleepoff`
  // is the control — it changes trajectories on its own, so the question is
  // only whether deaden+sleepoff drifts LESS than deaden does.
  sleepoff: { bodyFlags: { allowSleep: false } },
  deadensleepoff: { phys: DEADEN, bodyFlags: { allowSleep: false } },
  // The candidate the attribution opened up: deaden for the shake, sleepoff
  // for the replay, gate4 to buy back the slow tail sleepoff costs.
  deadensleepoffgate4: { phys: DEADEN, dampgate: GATE4, bodyFlags: { allowSleep: false } },
  // Determinism on its own, with no shake claim attached: sleep off for the
  // replay, gate4 to pay for the slow tail it costs.
  sleepoffgate4: { dampgate: GATE4, bodyFlags: { allowSleep: false } },
  // C30e — the displacement terminator. The reason this row exists is that the
  // box test REPLACES the retirement predicate that cannon's sleep was
  // accidentally supplying, so sleepoff can finally be judged as a fix rather
  // than as a cost. `dispgate` alone still has cannon's sleep underneath it and
  // is expected to drift exactly as shipped does; `dispgatesleepoff` is the
  // candidate and must be byte-identical on every pool.
  dispgate: { settleGate: { mode: 'displacement', eps: 0.02 } },
  dispgatesleepoff: { bodyFlags: { allowSleep: false },
    settleGate: { mode: 'displacement', eps: 0.02 } },
  dispgatesleepoffgate4: { dampgate: GATE4, bodyFlags: { allowSleep: false },
    settleGate: { mode: 'displacement', eps: 0.02 } },
};

// Each pool carries its own seed count: the big pools cost three times as much
// per throw and the question they answer is the same one, so paying for
// sixteen of them buys nothing the eighth seed did not already show.
const POOLS = {
  soul: { types: ['d8', 'd8', 'd4', 'd6'], seeds: 16 },
  '20d6': { types: Array(20).fill('d6'), seeds: 8 },
  '8d6': { types: Array(8).fill('d6'), seeds: 8 },
};

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

export default async function run(stage,
  [variant = 'candidate', seedCount = '', churnCount = '900', poolArg = 'soul,20d6,8d6']) {
  const v = VARIANTS[variant];
  if (!v) throw new Error(`no such variant: ${variant} (have ${Object.keys(VARIANTS).join(', ')})`);
  const churn = Number(churnCount);
  const wanted = poolArg.split(',').filter(Boolean).map((tok) => {
    const [name, count] = tok.split(':');
    if (!POOLS[name]) throw new Error(`no such pool: ${name} (have ${Object.keys(POOLS).join(', ')})`);
    return { name, types: POOLS[name].types,
      n: Number(count || seedCount || POOLS[name].seeds) };
  });
  const a = await stage.tab('localhost', 'Drift');

  if (v.phys) await a.dbg(`setPhysics(${JSON.stringify(v.phys)})`);
  if (v.dampgate) await a.dbg(`setDampgate(${JSON.stringify(v.dampgate)})`);
  if (v.nudge) await a.dbg(`setNudge(${JSON.stringify(v.nudge)})`);
  if (v.sleep) await a.dbg(`setSleep(${JSON.stringify(v.sleep)})`);
  if (v.bodyFlags) await a.dbg(`setBodyFlags(${JSON.stringify(v.bodyFlags)})`);
  if (v.settleGate) await a.dbg(`setSettleGate(${JSON.stringify(v.settleGate)})`);
  console.log(`variant ${variant}`);
  console.log(`  phys      ${JSON.stringify(await a.dbg('physics'))}`);
  console.log(`  dampgate  ${JSON.stringify(await a.dbg('dampgate'))}`);
  console.log(`  nudge     ${JSON.stringify(await a.dbg('nudge'))}`);
  console.log(`  sleep     ${JSON.stringify(await a.dbg('sleep'))}`);
  console.log(`  bodyFlags ${JSON.stringify(await a.dbg('bodyFlags'))}`);
  console.log(`  gate      ${JSON.stringify(await a.dbg('settleGate'))}`);
  console.log(`  pools     ${wanted.map((w) => `${w.name}x${w.n}`).join(' ')}, churn ${churn}`);

  // The settled pose at full precision, not a rounded summary: two throws
  // that agree to three decimals and disagree in the mantissa are still two
  // different throws to a client comparing keyframes.
  //
  // READ THE ROLL'S OWN DICE, NOT THE TABLE. `tableDice` still holds the
  // previous roll's dice while they sink, and sim(60) does not always outlast
  // that — so the signature picked up a neighbour's pose and reported drift
  // on a throw that was byte-identical. It said SHIPPED drifts 14/16, which
  // would have been a serious and completely false finding; the tell was
  // `duration` coming back identical on every replay while the "pose" moved.
  const poseOf = () => a.eval(`JSON.stringify(window.__diceDebug.currentRoll.dice.map((d) => [
    d.finalPos.x, d.finalPos.y, d.finalPos.z,
    d.finalQuat.x, d.finalQuat.y, d.finalQuat.z, d.finalQuat.w,
  ])) + '|' + window.__diceDebug.currentRoll.duration
    + '|' + window.__diceDebug.currentRoll.frames
    + '|' + window.__diceDebug.currentRoll.nudges`);

  const family = async (tag, w) => {
    const seeds = Array.from({ length: w.n }, (_, i) => 1000 + i * 7919);
    const sigs = [];
    for (const seed of seeds) {
      await a.dbg(`throwSeeded(${JSON.stringify(w.types)}, ${seed})`);
      await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${tag} ${w.name}/${seed}`, timeout: 60000 });
      sigs.push(await poseOf());
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');
    }
    return { seeds, sigs };
  };
  // Churn in the PAGE, fifty at a time: 900 CDP round trips would cost more
  // than the physics does, and what has to accumulate is world.time, which
  // only playRoll's bake advances.
  //
  // EACH THROW MUST BE DRAINED. playRoll QUEUES when a roll is already
  // playing, so a tight loop of throwSeeded bakes exactly one throw and pushes
  // the rest onto rollQueue — world.time does not move, and the queue then
  // drains into the middle of the measurement. First version of this step did
  // that, "churned the lot in 1s", and reported a drift that was really the
  // after-family landing on a table littered with 900 rolls' worth of dice.
  // The elapsed seconds and the leftover-dice count below are printed so that
  // failure cannot come back silently.
  const churnOnce = async () => {
    const t0 = Date.now();
    for (let done = 0; done < churn; done += 50) {
      const k = Math.min(50, churn - done);
      await a.eval(`(() => { for (let i = 0; i < ${k}; i++) {
        window.__diceDebug.throwSeeded(['d6'], 500000 + ${done} + i);
        let guard = 0;
        while (window.__diceDebug.busy && guard++ < 400) window.__diceDebug.sim(20);
        window.__diceDebug.clearTable();
        window.__diceDebug.sim(60);
      } return true; })()`);
    }
    await a.dbg('sim(120)');
    const left = await a.dbg('tableDice.length');
    console.log(`  churned ${churn} unrelated throws in ${Math.round((Date.now() - t0) / 1000)}s`
      + `, ${left} dice left on the table`);
    if (left) throw new Error(`the churn left ${left} dice behind; the replay would measure those`);
  };

  let allSame = true;
  const verdicts = [];
  for (const w of wanted) {
    console.log(`\n--- ${w.name} x${w.n} ---`);
    const { seeds, sigs } = await family('before', w);
    await churnOnce();
    const post = (await family('after', w)).sigs;
    let same = 0;
    const drifted = [];
    sigs.forEach((b, i) => {
      if (b === post[i]) same++;
      else drifted.push(seeds[i]);
    });
    console.log(`  replay after churn: ${same}/${w.n} byte-identical`);
    if (drifted.length) console.log(`  drifted seeds: ${drifted.join(', ')}`);
    // WHICH FIELD MOVED, not just that something did. A pose float in the
    // fifteenth decimal is float-order noise inside one client; a different
    // duration or nudge count is a different throw. Reporting only the count
    // makes those two look the same, and they are not.
    let material = 0;
    sigs.forEach((b, i) => {
      if (b === post[i]) return;
      const [bp, ...bt] = b.split('|');
      const [ap, ...at] = post[i].split('|');
      const bn = JSON.parse(bp).flat();
      const an = JSON.parse(ap).flat();
      const worst = bn.reduce((m, x, k) => Math.max(m, Math.abs(x - an[k])), 0);
      if (bt.join('|') !== at.join('|')) material++;
      console.log(`    ${seeds[i]}: tail ${bt.join('|')} -> ${at.join('|')}`
        + `, largest pose delta ${worst.toExponential(2)}`);
    });
    if (same !== w.n) allSame = false;
    verdicts.push([w.name, `${same}/${w.n}`, material
      ? `${material} MATERIAL (duration/frames/nudges moved)` : 'pose-only']);
  }

  console.log('');
  table(['pool', 'byte-identical', 'what moved'], verdicts);
  const expectFail = variant === 'sleepier';
  console.log(`\n  ${allSame
    ? (expectFail ? 'IDENTICAL — but this variant is the CONTROL and was supposed to drift;'
      + ' the instrument is not proving anything'
      : 'IDENTICAL on every pool — the same seed replays. Weak evidence: see the'
        + ' false-negative note at the top of this file')
    : (expectFail ? 'DRIFTED — the control drifts, so the check can detect drift'
      : 'DRIFTED — this tuning does not replay; do not ship it')}`);
}
