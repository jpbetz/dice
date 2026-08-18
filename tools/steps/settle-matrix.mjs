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

// WHICH PHYSICS CHANGE FIXES THE SETTLE, JUDGED ON EVERY AXIS AT ONCE.
//
// The felt tuning was a decisive win on shake and duration and was reverted
// anyway, because piling is a separate axis and nobody had it on the same
// page. creep.mjs answers "is it shaky", settle-paired.mjs answers "is it
// long", pile.mjs answers "do they land on each other" — and a change has to
// pass ALL THREE plus the clock to be worth shipping. This runs one variant
// list through all of them on one seed family and prints a pass/fail per
// gate, so no variant can win on the table somebody happened to print.
//
// The hypothesis under test is that the throw has two temporally separate
// phases wanting opposite physics: early and fast, dice must bounce and skid
// to fan out; late and slow, they must die quietly. Constant felt physics
// failed because it calmed the early phase too. Hence the speed GATE.
//
// THE FIRST VARIANT IS A CANARY, NOT A ROW. `shipped` must reproduce the
// prior session's paired baseline within ±10% on duration and ±0.025 on
// shake, and the whole run is refused if it does not — a rig that cannot
// reproduce a known answer cannot be trusted with an unknown one. Determinism
// is checked before that: the same seeds twice, identical to the millisecond,
// which is what catches an instrument leaking state across variants.
//
//   node tools/drive.mjs tools/steps/settle-matrix.mjs [shakeSeeds] [pileSeeds] [nameFilter]

const DEADEN = { floorRestitution: 0.15, diceRestitution: 0.2, wallRestitution: 0.5 };
const GRIP = { floorFriction: 0.6, diceFriction: 0.4, wallFriction: 0.2 };
const FELT_DAMP = { linearDamping: 0.1, angularDamping: 0.14 };
const SLOW = { slowLinear: 0.1, slowAngular: 0.14 }; // the felt damping, gated
// A real raise measured from what dice.js ships (0.4 / 0.35), not from
// cannon's stock 0.1 / 1 — see the SLEEP comment in js/main.js.
//
// AND IT DOES NOT REPLAY. Measured 2026-08-10: throw the 16-seed soul family,
// simulate 700 unrelated throws, throw it again — under the shipped 0.4/0.35
// all sixteen come back byte-identical, and under 0.9/0.2 FOUR OF SIXTEEN
// change (pool mean 1.394 -> 1.418). Raising the thresholds puts the sleep
// decision on a knife edge that accumulated world.time can tip, so the same
// seed becomes a different throw depending on how long the tab has been
// open. Every client fast-forwards a roll from its seed and must agree, and
// perf-determinism compares two FRESHLY LOADED tabs, so it cannot see this.
// The number this explains is why a variant measured deep in a long run did
// not match the same variant measured early. Do not ship a sleep raise
// without solving that first; the piling is the smaller objection.
const SLEEPIER = { speed: 0.9, time: 0.2 };

// PILE-AWARE FREEZE REFUSAL — the mechanism the first two passes pointed at.
// Deadening wins the shake and loses the piling, and both come from the same
// fact: on this mat dice separate AFTER landing, by bouncing and skidding
// apart. So the pile needs the energy the bounce used to supply, delivered
// only where separation failed. `pileScale` refuses a freeze to a die resting
// above `restCeiling(type) * scale` and hands it to the nudge that already
// exists for cocked dice, inside the same budget. The ceiling is the hull's
// circumradius — the highest a convex die touching the felt can possibly hold
// its centre — so the scale is margin on a bound rather than a guess at where
// dice rest. Confirmed in tools/steps/pile-bar.mjs: the highest ACCEPTED rest
// of every type lands at 0.73-0.95 of its own ceiling.
const PILE = { pileScale: 1.05 };

// THE PRE-C30 TUNING, KEPT REACHABLE AFTER IT STOPPED BEING WHAT SHIPS
// (2026-08-18). Every row here is an override on top of whatever js/main.js
// holds, so the moment `feltgrip+gate4` shipped, this instrument lost the
// ability to ask the question it was built for: is the new floor better than
// the old one? `classic` restores the numbers `shipped` carried from the first
// pass until 2026-08-18 — generic bouncy-dice values with cannon's 0.01
// damping left in and the speed gate off.
//
// Every gate reads BACKWARD on this row and that is correct, not a failure:
// it is the old floor judged against the new one, so gate a prints a shake
// RISE. Read it as the ship diff with the sign flipped, and read
// `feltgrip+gate4` as a no-op canary — since the ship it must reproduce
// `shipped` cell for cell, and if it does not, what shipped is not what was
// measured.
const CLASSIC = {
  floorFriction: 0.25, floorRestitution: 0.35,
  diceFriction: 0.15, diceRestitution: 0.45,
  wallFriction: 0.05, wallRestitution: 0.7,
};
const NOGATE = { gate: 0, slowLinear: 0, slowAngular: 0 };

// ATTRIBUTION ONLY, AND IT IS NOT A SHIP CANDIDATE. Deaden does not replay
// (one seed in sixteen comes back a different throw after 700 unrelated
// throws) and the standing suspicion is the sleep boundary: a deadened die
// spends much longer near sleepSpeedLimit, where accumulated world.time can
// tip the decision either way. allowSleep=false removes the boundary
// entirely. It also changes shipped trajectories on its own, so `sleepoff`
// is here as ITS OWN baseline — read deaden+sleepoff against sleepoff, never
// against shipped, and do not read the verdict gates on either row.
// AND SINCE THE 2026-08-11 FLIP THIS OVERRIDE IS A NO-OP. `BODYFLAGS` in
// js/main.js now ships `allowSleep: false`, so `setBodyFlags({allowSleep:
// false})` over the inert state changes nothing — every row below carrying
// SLEEPOFF is byte-identical to the same row without it, and so is `shipped`.
// The same is true of DISP(0.02): `SETTLEGATE` ships `displacement` / 0.02.
//
// Which means the pairs that read as an A/B are now the SAME variant twice:
//   deaden+sleepoff        ==  deaden
//   deaden+sleepoff+gate4  ==  deaden+gate4        <- the C30 residual headline
//   disp02+sleepoff        ==  shipped
// Kept, not deleted, because the names are what the record quotes — but do not
// read a "sleep off vs sleep on" comparison off them. Sleep-on is no longer
// reachable through this instrument at all; it would need `allowSleep: true`.
// (Verified 2026-08-17 against the run header's own `inert:` line, which is
// read off the app rather than restated here — that is what made it visible.)
const SLEEPOFF = { allowSleep: false };

// THE DISPLACEMENT TERMINATOR (C30e). The freeze predicate itself, swapped for
// Lengyel's three-point AABB rest test — see the SETTLEGATE block in
// js/main.js. `eps` is a fraction of a die's WIDTH, swept rather than guessed:
// 0.05 is roughly what the shipped ANGULAR gate already tolerates (0.224 rad/s
// for 0.45 s sweeps a d6's corner through 0.068 units ≈ 0.05 of its width),
// 0.01 is five times tighter, 0.02 sits between them. The point of the test is
// not looseness — it is that a bounded excursion is a thing an oscillating die
// can actually satisfy and a velocity bar is not.
const DISP = (eps) => ({ mode: 'displacement', eps });

// [name, physics overrides, dampgate | null, throwTarget | null, sleep | null,
//  nudge | null, bodyflags | null, settlegate | null]
// null = leave the instrument inert. Everything is reset between variants.
const VARIANTS = [
  ['shipped', {}, null, null, null, null],
  ['deaden', DEADEN, null, null, null, null],
  ['gate1', {}, { gate: 1, ...SLOW }, null, null],
  ['gate4', {}, { gate: 4, ...SLOW }, null, null],
  ['deaden+gate4', DEADEN, { gate: 4, ...SLOW }, null, null],
  ['feltgrip+gate4', { ...GRIP, ...DEADEN }, { gate: 4, ...SLOW }, null, null],
  ['classic', CLASSIC, NOGATE, null, null],
  ['felt+target65', { ...GRIP, ...DEADEN, ...FELT_DAMP }, null, 0.65, null],
  // As specified — and NEARLY A NULL, which is itself the finding. dice.js
  // ships sleepSpeedLimit 0.4 / sleepTimeLimit 0.35, not cannon's 0.1 / 1, so
  // speed 0.35 is very slightly STRICTER than today and the time is identical.
  // Kept because a variant that should barely move is a second canary.
  ['sleepy', {}, null, null, { speed: 0.35, time: 0.35 }],
  ['sleepy+deaden', DEADEN, null, null, { speed: 0.35, time: 0.35 }],
  // What "raise the sleep thresholds" actually means measured from 0.4 / 0.35.
  ['sleepier', {}, null, null, SLEEPIER],
  ['sleepier+deaden', DEADEN, null, null, SLEEPIER],
  // PASS TWO. The first pass put the throw target in exactly one row, next to
  // the full felt tuning, so it could not be read: everything that won on
  // shake lost on piling and the one mechanism aimed AT piling was confounded
  // with the tuning that causes it. These isolate it, and then re-run the
  // shake winners on top of it.
  ['target65', {}, null, 0.65, null],
  ['target80', {}, null, 0.80, null],
  ['deaden+t65', DEADEN, null, 0.65, null],
  ['deaden+t80', DEADEN, null, 0.80, null],
  ['sleepier+t65', {}, null, 0.65, SLEEPIER],
  ['sleepier+deaden+t50', DEADEN, null, 0.50, SLEEPIER],
  ['sleepier+deaden+t65', DEADEN, null, 0.65, SLEEPIER],
  ['sleepier+deaden+t80', DEADEN, null, 0.80, SLEEPIER],
  // PASS THREE. `nudgepile` is the control and should be nearly a null row:
  // shipped physics rarely piles at medium, so a mechanism that only fires on
  // a pile has almost nothing to fire at. If it moves anything, the bar is
  // catching legitimate rests and the calibration is wrong.
  ['nudgepile', {}, null, null, null, PILE],
  ['deaden+nudgepile', DEADEN, null, null, null, PILE],
  ['deaden+gate4+nudgepile', DEADEN, { gate: 4, ...SLOW }, null, null, PILE],
  ['deaden+gate4+nudgepile+b5', DEADEN, { gate: 4, ...SLOW }, null, null, { ...PILE, budget: 5 }],
  // PASS FOUR's magnet rows are GONE with the mechanism (excised 2026-08-10).
  // It failed on its own axis — hops flat, shake +38% — and the finding it
  // leaves behind is in the FLOOR MAGNETIZE block in js/main.js and C30d.
  // Attribution pair — see SLEEPOFF. Judge these two against each other.
  ['sleepoff', {}, null, null, null, null, SLEEPOFF],
  ['deaden+sleepoff', DEADEN, null, null, null, null, SLEEPOFF],
  // WHAT THE ATTRIBUTION OPENED UP. sleepoff replays 16/16 where shipped
  // replays 14/16, so cannon's sleep is the whole drift story — and deaden,
  // the only proven shake lever, replays 16/16 with it off. What sleepoff
  // costs is the slow half (soul +31%, caps 7->11), which is exactly what
  // gate4 was measured to buy back (20d6 -22%, caps 7->2, zero shake cost).
  // Judge this against `sleepoff`, not against shipped.
  ['deaden+sleepoff+gate4', DEADEN, { gate: 4, ...SLOW }, null, null, null, SLEEPOFF],
  ['sleepoff+gate4', {}, { gate: 4, ...SLOW }, null, null, null, SLEEPOFF],
  // PASS FIVE (C30e). The eps sweep first — three rows that differ in one
  // number — and then the composite the whole pass is aimed at: the box test
  // supplies the terminator that cannon's sleep was accidentally providing, so
  // sleepoff should stop costing the slow half. sleepoff alone was soul +31%,
  // caps 7 -> 11; if that does not INVERT here, the diagnosis is wrong.
  ['disp01', {}, null, null, null, null, null, DISP(0.01)],
  ['disp02', {}, null, null, null, null, null, DISP(0.02)],
  ['disp05', {}, null, null, null, null, null, DISP(0.05)],
  ['disp01+sleepoff', {}, null, null, null, null, SLEEPOFF, DISP(0.01)],
  ['disp02+sleepoff', {}, null, null, null, null, SLEEPOFF, DISP(0.02)],
  ['disp05+sleepoff', {}, null, null, null, null, SLEEPOFF, DISP(0.05)],
  ['disp02+sleepoff+gate4', {}, { gate: 4, ...SLOW }, null, null, null, SLEEPOFF, DISP(0.02)],
  ['disp05+sleepoff+gate4', {}, { gate: 4, ...SLOW }, null, null, null, SLEEPOFF, DISP(0.05)],
  // The candidate's ONE failing gate is the pile (+2.5pp at close/6d6 over 40
  // seeds), and the mechanism is plausible: a die that freezes earlier turns
  // STATIC earlier, so a neighbour landing on it can no longer shove it aside.
  // NUDGE.pileScale exists for exactly this — it refuses a freeze to a die
  // resting above its hull's circumradius — and it has never been run against
  // a terminator cheap enough to afford the extra nudges.
  ['disp02+sleepoff+nudgepile', {}, null, null, null, PILE, SLEEPOFF, DISP(0.02)],
];

const SHAKE_POOLS = [
  ['1d20', ['d20']],
  ['soul', ['d8', 'd8', 'd4', 'd6']],
  ['4d6', Array(4).fill('d6')],
  ['8d6', Array(8).fill('d6')],
  ['20d6', Array(20).fill('d6')],
];
// Gate (a) reads the multi-die pools only: a lone d20 has no neighbour to
// dither against and its shake is a different phenomenon.
const SHAKE_GATED = ['soul', '4d6', '8d6', '20d6'];

const PILE_POOLS = [
  ['trio', ['d8', 'd6', 'd10']],
  ['6d6', Array(6).fill('d6')],
];
const PILE_ZOOMS = ['medium', 'close'];

// The prior session's paired measurement of the SAME seed family. Not a
// tuning target — a reproduction test for this rig.
//
// THIS PAIR PINS A FILM, so it is re-anchored in the commit that moves one.
// It has now been re-anchored twice, for two different reasons:
//
//   2026-08-17, to the post-flip defaults. The values had been the PRE-flip
//   baseline (1.37 / 2.26 / 2.04 / 2.40 / 6.25 and shake 0.106 / 0.141 /
//   0.152 / 0.191 / 0.212), and the 2026-08-11 flip — displacement
//   terminator, allowSleep false, the tempo curve, pileScale 1.05 — moved
//   four of the five duration cells by 9-38%. So the canary MISSED on every
//   run for six days and printed "THE CANARY MISSED. The verdict above is not
//   evidence." under verdict tables that were fine. A gate that is always red
//   is a gate everybody learns to scroll past, which is the same failure as
//   one that is always green.
//
//   2026-08-18, to the felt tuning (ROADMAP C30) — grip + deaden + the speed
//   gate. Every duration cell fell 2-20% and every shake cell 30-43%, which is
//   the ship diff and not drift. The values below are the `shipped` row of the
//   run that shipped it; the row it replaces is exactly reproducible as the
//   matrix's `classic` variant, and was: dur 1.39 / 1.47 / 1.26 / 2.19 / 4.15,
//   shake 0.085 / 0.117 / 0.106 / 0.135 / 0.175.
//
// Measured, and REPRODUCED ACROSS TWO INDEPENDENT STAGE BOOTS (identical to
// every digit printed here, plus a third agreement on the 4-seed determinism
// quartet [1.133, 1.033, 1.283, 1.367]):
//
//   node tools/drive.mjs tools/steps/settle-matrix.mjs 16 10 shipped
//
// Sixteen shake seeds. Re-anchor from a measured run, never by applying the
// percentage deltas a record quotes: that is how two of the 2026-08-14
// corrections went in wrong.
const CANARY_DUR = { '1d20': 1.12, soul: 1.20, '4d6': 1.24, '8d6': 2.06, '20d6': 3.57 };
const CANARY_SHAKE = { '1d20': 0.049, soul: 0.070, '4d6': 0.068, '8d6': 0.094, '20d6': 0.114 };

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

export default async function run(stage, [shakeCount = '16', pileCount = '10', filter = '']) {
  const nShake = Number(shakeCount);
  const nPile = Number(pileCount);
  const a = await stage.tab('localhost', 'Matrix');

  // Read the inert state off the app rather than restating it here: a tool
  // carrying its own copy of the shipped tuning is a tool that lies after the
  // next retune.
  const INERT = {
    phys: await a.dbg('physics'),
    dampgate: await a.dbg('dampgate'),
    throwTarget: await a.dbg('throwTarget'),
    sleep: await a.dbg('sleep'),
    zoom: await a.dbg('zoom'),
    nudge: await a.dbg('nudge'),
    bodyFlags: await a.dbg('bodyFlags'),
    settleGate: await a.dbg('settleGate'),
  };
  console.log(`inert: phys ${JSON.stringify(INERT.phys)}`);
  console.log(`       dampgate ${JSON.stringify(INERT.dampgate)}  throwTarget ${INERT.throwTarget}`
    + `  sleep ${JSON.stringify(INERT.sleep)}  zoom ${INERT.zoom}`);
  console.log(`       nudge ${JSON.stringify(INERT.nudge)}`
    + `  bodyFlags ${JSON.stringify(INERT.bodyFlags)}`);
  console.log(`       settleGate ${JSON.stringify(INERT.settleGate)}`);

  const seedsOf = (n) => Array.from({ length: n }, (_, i) => 1000 + i * 7919);

  const reset = async () => {
    await a.dbg(`setPhysics(${JSON.stringify(INERT.phys)})`);
    await a.dbg(`setDampgate(${JSON.stringify(INERT.dampgate)})`);
    await a.dbg(`setThrowTarget(${INERT.throwTarget})`);
    await a.dbg(`setSleep(${JSON.stringify(INERT.sleep)})`);
    await a.dbg(`setZoom(${JSON.stringify(INERT.zoom)})`);
    await a.dbg(`setNudge(${JSON.stringify(INERT.nudge)})`);
    await a.dbg(`setBodyFlags(${JSON.stringify(INERT.bodyFlags)})`);
    await a.dbg(`setSettleGate(${JSON.stringify(INERT.settleGate)})`);
    await a.dbg('sim(200)');
  };

  const apply = async ([, phys, dampgate, throwTarget, sleep, nudge, bodyFlags, settleGate]) => {
    await reset();
    if (Object.keys(phys).length) await a.dbg(`setPhysics(${JSON.stringify(phys)})`);
    if (dampgate) await a.dbg(`setDampgate(${JSON.stringify(dampgate)})`);
    if (throwTarget !== null) await a.dbg(`setThrowTarget(${throwTarget})`);
    if (sleep) await a.dbg(`setSleep(${JSON.stringify(sleep)})`);
    if (nudge) await a.dbg(`setNudge(${JSON.stringify(nudge)})`);
    if (bodyFlags) await a.dbg(`setBodyFlags(${JSON.stringify(bodyFlags)})`);
    if (settleGate) await a.dbg(`setSettleGate(${JSON.stringify(settleGate)})`);
  };

  // One throw, from the call that bakes it to an idle table.
  //   bake  the throwSeeded call alone. playRoll simulates the WHOLE throw
  //         synchronously before frame one, so this is the physics cost.
  //   wall  bake plus draining the playback. Confounded by duration on
  //         purpose — it is what a browser actually spends — but note that
  //         waitFor sleeps 100 ms between polls, so a roll needing a second
  //         sim(120) poll pays a fixed 100 ms that has nothing to do with
  //         physics. Read `bake` when the two disagree.
  const throwOnce = async (types, seed, desc) => {
    const t0 = Date.now();
    await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
    const bake = Date.now() - t0;
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)', { desc, timeout: 60000 });
    return { bake, wall: Date.now() - t0 };
  };
  const clear = async () => {
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
  };

  // --- determinism: the same seeds twice, to the millisecond ---------------
  const detSeeds = seedsOf(4);
  const detRun = async () => {
    await apply(VARIANTS[0]);
    const out = [];
    for (const seed of detSeeds) {
      await throwOnce(['d8', 'd8', 'd4', 'd6'], seed, `det soul/${seed}`);
      out.push((await a.dbg('settleProfile()')).duration);
      await clear();
    }
    return out;
  };
  const detA = await detRun();
  const detB = await detRun();
  const deterministic = JSON.stringify(detA) === JSON.stringify(detB);
  console.log(`\ndeterminism (soul, ${detSeeds.length} seeds, shipped twice)`);
  console.log(`  run 1: [${detA.join(', ')}]`);
  console.log(`  run 2: [${detB.join(', ')}]`);
  console.log(`  ${deterministic ? 'IDENTICAL — ok' : 'DIVERGED — an instrument is leaking state'}`);
  if (!deterministic) throw new Error('determinism check failed; refusing to run the matrix');

  // --- the matrix ----------------------------------------------------------
  const base = 'shipped';
  // `shipped` is not optional: it is the baseline every gate is judged
  // against, so a filter selects what to compare TO it, never instead of it.
  // Names match EXACTLY. Substring matching quietly swept siblings in — the
  // token `sleepier` also selects `sleepier+deaden+t80` — and a measurement
  // tool that runs rows you did not ask for is one you have to re-read the
  // output of to know what you ran.
  const toks = filter ? filter.split(',').filter(Boolean) : null;
  const wanted = VARIANTS.filter(([n]) => n === base || !toks || toks.includes(n));
  if (toks) {
    const missing = toks.filter((t) => !VARIANTS.some(([n]) => n === t));
    if (missing.length) throw new Error(`no such variant: ${missing.join(', ')}`);
  }
  const shakeSeeds = seedsOf(nShake);
  const pileSeeds = seedsOf(nPile);
  const got = new Map();   // "variant|pool"      -> { shake, creep, dur, capped, bake, wall }
  const piles = new Map(); // "variant|zoom|pool" -> { pct, flat }
  const errors = [];

  for (const v of wanted) {
    const [vname] = v;
    const t0 = Date.now();
    try {
      await apply(v);
      for (const [pname, types] of SHAKE_POOLS) {
        const rows = [];
        let capped = 0;
        for (const seed of shakeSeeds) {
          const t = await throwOnce(types, seed, `${vname} ${pname}/${seed}`);
          const p = await a.dbg('settleProfile()');
          if (p.timedOut) capped++;
          rows.push({ ...t, shake: p.shake, creep: p.creep, dur: p.duration,
            nudged: p.nudged, piled: p.piled, hops: p.hops,
            // The terminator's receipt: how far the worst die in this throw
            // moved over the window that earned its freeze, in die-widths, and
            // how many CLEAN freezes exceeded the gate's own epsilon.
            disp: p.maxEndDisp, loose: p.loose });
          await clear();
        }
        got.set(`${vname}|${pname}`, {
          shake: mean(rows.map((r) => r.shake)),
          creep: mean(rows.map((r) => r.creep)),
          dur: mean(rows.map((r) => r.dur)),
          bake: mean(rows.map((r) => r.bake)),
          wall: mean(rows.map((r) => r.wall)),
          // What the mechanism COST and what it was aimed at: nudge rounds
          // spent per throw, and dice still above the bar when the roll ended
          // (the ones the budget could not save).
          nudged: mean(rows.map((r) => r.nudged)),
          piled: mean(rows.map((r) => r.piled)),
          // Times a die goes back UP in its last 0.6s, per die. The literal
          // reading of "no more bounding" — measured off the baked film
          // rather than reported by whatever mechanism produced it.
          hops: mean(rows.map((r) => r.hops)),
          disp: mean(rows.map((r) => r.disp)),
          // The WORST single die in the whole cell, which is the one that
          // matters: the film is cut at the last landing, so endDisp is also
          // the size of the pose discontinuity a viewer could see at the end
          // of the throw. A mean hides the outlier that would show.
          dispMax: Math.max(...rows.map((r) => r.disp)),
          loose: rows.reduce((s2, r) => s2 + r.loose, 0),
          capped,
        });
      }
      for (const z of PILE_ZOOMS) {
        await a.dbg(`setZoom(${JSON.stringify(z)})`);
        await a.dbg('sim(200)');
        for (const [pname, types] of PILE_POOLS) {
          let piled = 0;
          let dice = 0;
          let flat = 0;
          let piledTrue = 0;
          let worstTiers = 0;
          let worstShare = 0;
          for (const seed of pileSeeds) {
            await throwOnce(types, seed, `${vname} ${z} ${pname}/${seed}`);
            await a.dbg('sim(600)');
            // TWO BARS, because the old one is a coincidence and the
            // comparison history is worth keeping. `y > 1.2` is what every
            // prior pass measured and what `dice-land-flat` uses — it is the
            // d6 circumradius (1.169) and change, sound for a 6d6 pool and
            // wrong for anything else. `restCeiling(type)` is the theorem: the
            // highest a convex die TOUCHING THE FELT can hold its centre, so
            // above it the die is on something, and it is the bar C30c said
            // any future check should use. The trio pool (d8/d6/d10) is where
            // they disagree — a d8 ceiling is 1.050, so 1.2 misses real stacks.
            //
            // `tiers` is the third reading and the only one gate d still
            // BLOCKS on: how many of its own rest ceilings high the worst die
            // in this throw is holding its centre. It is a depth, not a rate.
            // A die on felt reads 0.73-0.95 (measured, every type,
            // pile-bar.mjs), a die on one neighbour reads about 2, a die on a
            // stack three deep reads about 3.
            const r = JSON.parse(await a.eval(`JSON.stringify((() => {
              const ds = window.__diceDebug.tableDice;
              const rc = (o) => window.__diceDebug.restCeiling(o.type);
              return { n: ds.filter((o) => o.body.position.y > 1.2).length,
                nTrue: ds.filter((o) => o.body.position.y > rc(o)).length,
                tiers: ds.reduce((m, o) =>
                  Math.max(m, o.body.position.y / rc(o)), 0) };
            })())`));
            piled += r.n; piledTrue += r.nTrue; dice += types.length;
            worstTiers = Math.max(worstTiers, r.tiers);
            worstShare = Math.max(worstShare, r.nTrue / types.length);
            if (r.n === 0) flat++;
            await clear();
          }
          piles.set(`${vname}|${z}|${pname}`,
            { pct: (piled / dice) * 100, flat, n: piled, nTrue: piledTrue, dice,
              worstTiers, worstShare });
        }
      }
      await a.dbg(`setZoom(${JSON.stringify(INERT.zoom)})`);
      await a.dbg('sim(200)');
      console.log(`  … ${vname} done (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (e) {
      errors.push([vname, e && e.message ? e.message : String(e)]);
      console.log(`  … ${vname} ERRORED — ${e && e.message ? e.message : e}`);
    }
  }
  await reset();

  const ran = wanted.filter(([n]) => SHAKE_POOLS.every(([p]) => got.has(`${n}|${p}`)));
  const b = (pool) => got.get(`${base}|${pool}`);
  if (!b('soul')) throw new Error('the shipped canary did not complete; nothing to judge against');

  // --- canary --------------------------------------------------------------
  console.log(`\ncanary — does this rig reproduce the prior paired baseline?\n`);
  const canaryRows = SHAKE_POOLS.map(([p]) => {
    const r = got.get(`${base}|${p}`);
    const dOff = (r.dur - CANARY_DUR[p]) / CANARY_DUR[p];
    const sOff = r.shake - CANARY_SHAKE[p];
    return [p, CANARY_DUR[p].toFixed(2), r.dur.toFixed(2),
      `${dOff >= 0 ? '+' : ''}${(dOff * 100).toFixed(1)}%`,
      Math.abs(dOff) <= 0.10 ? 'ok' : 'MISS',
      CANARY_SHAKE[p].toFixed(3), r.shake.toFixed(3),
      `${sOff >= 0 ? '+' : ''}${sOff.toFixed(3)}`,
      Math.abs(sOff) <= 0.025 ? 'ok' : 'MISS'];
  });
  table(['pool', 'dur was', 'dur now', 'Δ', '±10%', 'shake was', 'shake now', 'Δ', '±.025'], canaryRows);
  const canaryOk = canaryRows.every((r) => r[4] === 'ok' && r[8] === 'ok');
  console.log(`\n  canary ${canaryOk ? 'PASSES — the rig reproduces the baseline'
    : 'MISSES — do not draw conclusions from these numbers'}`);

  // --- shake / duration / caps --------------------------------------------
  console.log(`\nshake, duration and caps — ${nShake} identical seeds per cell.`
    + ` shake = share of the 0.6s before each die stops that reverses direction;`
    + `\n"!k" = k of ${nShake} throws ran to SETTLE_CAP\n`);
  table(['variant', ...SHAKE_POOLS.map(([p]) => `${p} shake`)],
    ran.map(([n]) => [n, ...SHAKE_POOLS.map(([p]) => {
      const r = got.get(`${n}|${p}`);
      const d = (1 - r.shake / b(p).shake) * 100;
      return n === base ? r.shake.toFixed(3)
        : `${r.shake.toFixed(3)} ${d >= 0 ? '-' : '+'}${Math.abs(d).toFixed(0)}%`;
    })]));
  // Creep is here to be read AGAINST shake, and for the sleep variants it is
  // the whole safety question. Anything that retires a die sooner risks
  // retiring one that was still visibly moving, and a die snapped to a halt
  // from speed covers MORE ground in its last 0.6s, not less. So shake flat +
  // creep UP means "stopped while moving" — the artifact — while shake flat +
  // creep flat means the die genuinely had nothing left to do.
  console.log(`\ncreep — die-widths covered in the same window. Read against shake:`
    + ` up, with shake flat, is a die stopped while it was still moving\n`);
  table(['variant', ...SHAKE_POOLS.map(([p]) => `${p} creep`)],
    ran.map(([n]) => [n, ...SHAKE_POOLS.map(([p]) => {
      const r = got.get(`${n}|${p}`);
      const d = ((r.creep - b(p).creep) / b(p).creep) * 100;
      return `${r.creep.toFixed(2)}${n === base ? '' : ` ${d >= 0 ? '+' : ''}${d.toFixed(0)}%`}`;
    })]));
  console.log(`\nhops — separate times a die goes back UP in its last 0.6s, per die.`
    + ` The complaint, literally:\n"bounding like they're on the moon" is a hop count,`
    + ` and shake cannot tell a hop from a horizontal jitter\n`);
  table(['variant', ...SHAKE_POOLS.map(([p]) => `${p} hops`)],
    ran.map(([n]) => [n, ...SHAKE_POOLS.map(([p]) => {
      const r = got.get(`${n}|${p}`);
      const d = b(p).hops ? ((r.hops - b(p).hops) / b(p).hops) * 100 : 0;
      return `${r.hops.toFixed(2)}${n === base ? '' : ` ${d >= 0 ? '+' : ''}${d.toFixed(0)}%`}`;
    })]));
  console.log('');
  table(['variant', ...SHAKE_POOLS.map(([p]) => `${p} dur`), 'caps'],
    ran.map(([n]) => [n, ...SHAKE_POOLS.map(([p]) => {
      const r = got.get(`${n}|${p}`);
      const d = ((r.dur - b(p).dur) / b(p).dur) * 100;
      return `${r.dur.toFixed(2)}${n === base ? '' : ` ${d >= 0 ? '+' : ''}${d.toFixed(0)}%`}`
        + (r.capped ? ` !${r.capped}` : '');
    }), SHAKE_POOLS.reduce((s, [p]) => s + got.get(`${n}|${p}`).capped, 0)]));

  // Nudges are watch time — every one is a die hurled back into the air — so
  // a mechanism that buys flatness with them has to show the bill.
  console.log(`\nnudge rounds per throw / dice still above the pile bar at the end\n`);
  table(['variant', ...SHAKE_POOLS.map(([p]) => `${p} nudge/left`)],
    ran.map(([n]) => [n, ...SHAKE_POOLS.map(([p]) => {
      const r = got.get(`${n}|${p}`);
      return `${r.nudged.toFixed(2)}/${r.piled.toFixed(2)}`;
    })]));

  // THE TERMINATOR'S RECEIPT, and the only honest way to read the creep column
  // on a row that changes WHEN a die is declared still. `creep` measures the
  // 0.6 s BEFORE each die's settle frame, so moving the settle frame earlier
  // moves the window back into the tumble and creep rises for a die that was
  // never touched. `disp` is the same question asked forward instead of
  // backward: how far the worst die actually moved over the 0.45 s window that
  // earned its freeze. Under a displacement row it is bounded by eps BY
  // CONSTRUCTION, so a high creep with a tiny disp is the anchor moving, not a
  // die snapped mid-slide. `loose` counts clean freezes that broke the bound —
  // it must be 0 on every displacement row or the box test is not wired in.
  console.log(`\nendDisp — die-widths the worst die moved over the window that`
    + ` earned its freeze (loose = clean freezes over 0.02 of a die-width,\n`
    + `  the same bar on every row, so a shipped row's count says what the`
    + ` VELOCITY gate lets through)\n`);
  table(['variant', ...SHAKE_POOLS.map(([p]) => `${p} disp/loose`)],
    ran.map(([n]) => [n, ...SHAKE_POOLS.map(([p]) => {
      const r = got.get(`${n}|${p}`);
      return `${r.disp.toFixed(4)} max ${r.dispMax.toFixed(4)}/${r.loose}`;
    })]));

  // --- pile ----------------------------------------------------------------
  console.log(`\npiling over ${nPile} identical seeds. "a+b/N pct flat/seeds":`
    + ` a = dice above y=1.2 (the historical bar,\n  and dice-land-flat's), b = the`
    + ` EXTRA dice the theorem bar restCeiling(type) catches that 1.2 misses,`
    + `\n  pct and flat are on the historical bar so the column stays comparable`
    + ` with every prior pass\n`);
  const pileCells = PILE_ZOOMS.flatMap((z) => PILE_POOLS.map(([p]) => [z, p]));
  table(['variant', ...pileCells.map(([z, p]) => `${z}/${p}`)],
    ran.filter(([n]) => piles.has(`${n}|${PILE_ZOOMS[0]}|${PILE_POOLS[0][0]}`))
      .map(([n]) => [n, ...pileCells.map(([z, p]) => {
        const c = piles.get(`${n}|${z}|${p}`);
        const bc = piles.get(`${base}|${z}|${p}`);
        const d = c.pct - bc.pct;
        return `${c.n}+${c.nTrue - c.n}/${c.dice} ${c.pct.toFixed(1)}% ${c.flat}/${nPile}`
          + (n === base ? '' : ` (${d >= 0 ? '+' : ''}${d.toFixed(1)}pp)`);
      })]));

  // THE HEAP, which is a different question from the rate above and the only
  // one gate d still blocks on. `tiers` is the worst single die in the cell,
  // in units of its own rest ceiling; `share` is the worst single THROW's
  // fraction of dice above the theorem bar. Both are per-throw worsts on
  // purpose: a heap is a property of one throw, and a mean over 40 seeds
  // would hide the one that collapsed.
  console.log(`\nheap — worst die's height in its own rest ceilings, and the worst`
    + ` throw's share of dice above the theorem bar.\n  Felt rest is 0.73-0.95 tiers;`
    + ` a die on one neighbour is about 2; the C24 disaster was 10 of 12 dice`
    + ` at ~7 tiers\n`);
  table(['variant', ...pileCells.map(([z, p]) => `${z}/${p} tiers/share`)],
    ran.filter(([n]) => piles.has(`${n}|${PILE_ZOOMS[0]}|${PILE_POOLS[0][0]}`))
      .map(([n]) => [n, ...pileCells.map(([z, p]) => {
        const c = piles.get(`${n}|${z}|${p}`);
        return `${c.worstTiers.toFixed(2)}/${(c.worstShare * 100).toFixed(0)}%`;
      })]));

  // --- wall-time -----------------------------------------------------------
  console.log(`\nper-throw cost, mean ms. "bake" = the throwSeeded call alone`
    + ` (the physics); "wall" = to an idle table\n`);
  table(['variant', ...SHAKE_POOLS.map(([p]) => `${p} bake/wall`)],
    ran.map(([n]) => [n, ...SHAKE_POOLS.map(([p]) => {
      const r = got.get(`${n}|${p}`);
      return `${r.bake.toFixed(0)}/${r.wall.toFixed(0)}`
        + (n === base ? '' : ` ${(r.wall / b(p).wall).toFixed(2)}×`);
    })]));

  // --- verdict -------------------------------------------------------------
  // GATE D IS A HEAP FLOOR, NOT A PILE RATE (2026-08-18). It used to block on
  // "every cell within +/-2pp of shipped, and close/6d6 flat-throws >=
  // shipped's", and on that bar it refused `feltgrip+gate4` — the best
  // physics candidate this table has measured, five of six gates, shake -35%
  // and hops -14% to -32%. Joe overturned it:
  //
  //   "Pilling is OK. If you throw a lot of dice, it's your fault if they
  //    pile up. Let's not try to prevent it."
  //
  // So the rate is now REPORTED and never blocks. The pp delta and the flat
  // count still print, in the pile table and inside gate d's own cell, because
  // a future tuning run should still be able to see what it cost — it just
  // should not be stopped by it.
  //
  // WHAT THE FLOOR IS FOR. A die resting on another die is dice behaving like
  // dice. A pool of dice in a tower is the solver, the mat or the spawn line
  // having failed: C24 measured a refused fourth zoom notch putting TEN of
  // twelve dice on top of each other in a heap nine units tall, which is not a
  // piling rate anybody would argue about — it is a smudge where a table
  // should be. That case has to stay catchable, and it is the only case this
  // gate now judges.
  //
  // WHAT THE FLOOR IS NOT FOR. It is not a pile budget, not a regression
  // detector, and not a bar a tuning is supposed to sit just under. Two dice
  // touching passes it. Every throw in a cell putting one die on a neighbour
  // passes it. If you want to know whether a candidate piles MORE than
  // shipped, read the pile and heap tables — that number is measured on every
  // run and this gate deliberately ignores it.
  //
  // THE TWO CONDITIONS ARE AND-ED so that neither alone can fire. Depth
  // without breadth is one unlucky die on a short stack; breadth without depth
  // is a crowded mat, which at `close` is what the zoom is FOR (its own
  // tooltip sells density). Only both at once is a heap.
  //
  // AND IT IS CALIBRATED FOR POOLS THE MAT HAS ROOM FOR, which is what
  // PILE_POOLS rolls: three dice and six. A pool that overflows the mat trips
  // it legitimately, and that is not a bug in the pool — C24 measured 40d6 at
  // `close` on the shipped ladder at 28 of 40 dice up and a max height of 5.3
  // units, which for a d6 is 4.5 rest ceilings, so it clears both bars. Forty
  // dice do not fit on a phone-sized mat and nobody claims they do. Do not
  // extend PILE_POOLS past what the mat can lay out without re-deciding this.
  const HEAP_TIERS = 3;   // a die whose centre sits three of its own rest
                          // ceilings up is on a stack three deep
  const HEAP_SHARE = 0.5; // and more than half the throw is off the felt
  console.log(`\nverdict — every gate judged against THIS run's shipped row\n`
    + `  a shake  mean reduction over ${SHAKE_GATED.join('/')} >= 20%\n`
    + `  b dur    no pool worse than shipped +5%\n`
    + `  c caps   total capped throws <= shipped's, AND 20d6 caps <= 1\n`
    + `  d heap   no throw stacks a die ${HEAP_TIERS}+ rest-ceilings high with`
    + ` >${HEAP_SHARE * 100}% of the pool off the felt.\n`
    + `           The pile RATE is reported in [brackets] and does not block —`
    + ` Joe, 2026-08-17:\n`
    + `           "Pilling is OK. If you throw a lot of dice, it's your fault`
    + ` if they pile up.\n            Let's not try to prevent it."\n`
    + `  e clock  per-pool mean wall <= 1.5x shipped\n`
    + `  f rest   same terminator AND same settle frame as shipped: creep no pool\n`
    + `           worse than +15%; a row that MOVES the settle frame — by swapping\n`
    + `           the terminator OR by stopping dice >=5% sooner — is judged FORWARD\n`
    + `           against the terminator's own promise (dispMax < eps, loose 0,\n`
    + `           caps <= shipped's) rather than compared, because both sides\n`
    + `           saturate at eps and the comparison is float noise; because\n`
    + `           creep's backward window is unreadable across anchor moves —\n`
    + `           in both directions (audit 2026-08-11: the same confounded\n`
    + `           meter that showed creep +114% also flattered shake)\n`);
  const vrows = ran.filter(([n]) => n !== base).map((v) => {
    const n = v[0];
    const shakeCut = mean(SHAKE_GATED.map((p) => 1 - got.get(`${n}|${p}`).shake / b(p).shake));
    const worstDur = Math.max(...SHAKE_POOLS.map(([p]) => (got.get(`${n}|${p}`).dur - b(p).dur) / b(p).dur));
    const caps = SHAKE_POOLS.reduce((s, [p]) => s + got.get(`${n}|${p}`).capped, 0);
    const baseCaps = SHAKE_POOLS.reduce((s, [p]) => s + b(p).capped, 0);
    // The pool the cap actually bites on. A total that improves while 20d6
    // still runs the full nine seconds is the regression this pass exists to
    // kill, and a total-only gate cannot see it.
    const caps20 = got.get(`${n}|20d6`).capped;
    const hasPile = piles.has(`${n}|${PILE_ZOOMS[0]}|${PILE_POOLS[0][0]}`);
    const worstPile = hasPile ? Math.max(...pileCells.map(([z, p]) =>
      piles.get(`${n}|${z}|${p}`).pct - piles.get(`${base}|${z}|${p}`).pct)) : NaN;
    const closeFlat = hasPile ? piles.get(`${n}|close|6d6`).flat : NaN;
    // The heap floor, over every cell. Both readings are per-throw worsts, so
    // a cell fails only if ONE throw was both deep and broad.
    const heapCells = hasPile ? pileCells.map(([z, p]) => piles.get(`${n}|${z}|${p}`)) : [];
    const heaped = heapCells.filter((c) =>
      c.worstTiers >= HEAP_TIERS && c.worstShare > HEAP_SHARE);
    const worstTiers = hasPile ? Math.max(...heapCells.map((c) => c.worstTiers)) : NaN;
    const worstShare = hasPile ? Math.max(...heapCells.map((c) => c.worstShare)) : NaN;
    const worstClock = Math.max(...SHAKE_POOLS.map(([p]) => got.get(`${n}|${p}`).wall / b(p).wall));
    const worstCreep = Math.max(...SHAKE_POOLS.map(([p]) =>
      (got.get(`${n}|${p}`).creep - b(p).creep) / b(p).creep));
    // A row that changes the terminator moves every settle frame, and with it
    // the anchor of creep's backward window — so it is judged forward.
    //
    // AND A TERMINATOR SWAP IS NOT THE ONLY WAY TO MOVE THAT ANCHOR (2026-08-17).
    // This predicate asked "did you change SETTLEGATE", but creep is anchored to
    // each die's own settle FRAME, and a pure TUNING row moves that frame too:
    // grip 0.6 stops a die sooner in its own arc, so the 0.6 s window slides
    // back into the fast slide and the die covers more ground inside it. The
    // deaden/grip rows measured on 2026-08-17 read creep +17% to +171% while
    // shake fell 30-43%, hops fell 14-32% and duration fell on every pool —
    // and restMotion's own comment says exactly this case is ambiguous ("a die
    // rolling smoothly to a halt covers more ground in its last 0.6 s than one
    // twitching in place"). A gate cannot be evidence when its meter's zero
    // point is a function of the variant.
    //
    // So the anchor test is now EITHER a terminator swap or a material move in
    // duration, at the same 5% gate b already calls material — not a new free
    // parameter — and the printed cell always names which meter decided.
    // Widening it flips no ship decision: the two rows it affects
    // (deaden+gate4, feltgrip+gate4) are refused on gate d regardless.
    const worstShorter = Math.min(...SHAKE_POOLS.map(([p]) =>
      (got.get(`${n}|${p}`).dur - b(p).dur) / b(p).dur));
    const anchorMoved = worstShorter <= -0.05;
    const movesFrame = !!(v[7] && v[7].mode && v[7].mode !== INERT.settleGate.mode)
      || anchorMoved;
    const worstDispMax = Math.max(...SHAKE_POOLS.map(([p]) => got.get(`${n}|${p}`).dispMax));
    const baseDispMax = Math.max(...SHAKE_POOLS.map(([p]) => b(p).dispMax));
    const worstLoose = Math.max(...SHAKE_POOLS.map(([p]) => got.get(`${n}|${p}`).loose));
    const baseLoose = Math.max(...SHAKE_POOLS.map(([p]) => b(p).loose));
    // THE FORWARD BAR IS THE THEOREM, NOT A COMPARISON (fixed 2026-08-17).
    // It was `worstDispMax <= baseDispMax`, and BOTH SIDES SATURATE: under a
    // displacement terminator every clean freeze is bounded by eps, so a row
    // whose worst die sits at 0.019987 "loses" to a shipped worst of 0.019953
    // by 3.4e-5 of a die-width — 0.17% of the bar, decided by float noise, and
    // printed at four decimals as 0.0200 vs 0.0200, i.e. a fail nobody can read.
    // Measured 2026-08-17: both deaden+gate4 and feltgrip+gate4 failed gate f
    // exactly that way. SHIPPED.md already flagged this saturation from the
    // other end (a guarantee rounded to four places reads as violating itself).
    //
    // So the forward gate asserts what the terminator actually promises:
    //   dispMax < eps          the bound holds for every clean freeze
    //   loose == 0             the box test is really wired into the freeze path
    //   caps <= shipped's      the ONE path that can still freeze a moving die
    // Gate c already judges caps, and that overlap is deliberate: it is the
    // only remaining way to buy a still picture by stopping a die mid-slide,
    // which is the hazard this gate exists for.
    const eps = INERT.settleGate.eps;
    const capsOk = caps <= baseCaps;
    const restGate = movesFrame
      ? [worstDispMax < eps && worstLoose === 0 && capsOk,
        `f disp ${worstDispMax.toFixed(6)}<${eps} loose ${worstLoose} caps ${caps}/${baseCaps}`
        // Say out loud that creep was set aside and what it would have read,
        // so a forward PASS can never be mistaken for "creep was fine".
        + (anchorMoved ? ` [fwd: anchor ${(worstShorter * 100).toFixed(0)}%,`
          + ` creep ${worstCreep >= 0 ? '+' : ''}${(worstCreep * 100).toFixed(0)}% unread]` : '')]
      : [worstCreep <= 0.15, `f creep ${worstCreep >= 0 ? '+' : ''}${(worstCreep * 100).toFixed(0)}%`];
    const g = [
      [shakeCut >= 0.20, `a shake ${(shakeCut * 100).toFixed(0)}%`],
      [worstDur <= 0.05, `b dur ${worstDur >= 0 ? '+' : ''}${(worstDur * 100).toFixed(0)}%`],
      [caps <= baseCaps && caps20 <= 1, `c caps ${caps}/${baseCaps} 20d6 ${caps20}`],
      // The heap floor decides; the rate rides along in brackets so it is
      // never lost, and so a PASS can never be read as "the pile did not
      // move". Both numbers are printed on every row including a clean one.
      [hasPile && heaped.length === 0,
        hasPile
          ? `d heap ${worstTiers.toFixed(2)} tiers/${(worstShare * 100).toFixed(0)}%`
            + `${heaped.length ? ' HEAP' : ''}`
            + ` [rate ${worstPile >= 0 ? '+' : ''}${worstPile.toFixed(1)}pp,`
            + ` close/6d6 flat ${closeFlat}/${nPile} vs ${piles.get(`${base}|close|6d6`).flat}]`
          : 'd heap n/a'],
      [worstClock <= 1.5, `e clock ${worstClock.toFixed(2)}x`],
      restGate,
    ];
    return [n, ...g.map(([ok, s]) => `${ok ? 'PASS' : 'fail'} ${s}`),
      g.every(([ok]) => ok) ? 'ALL PASS' : ''];
  });
  table(['variant', 'a', 'b', 'c', 'd', 'e', 'f', ''], vrows);

  if (errors.length) {
    console.log('\nerrors:');
    for (const [n, m] of errors) console.log(`  ${n}: ${m}`);
  }
  if (!canaryOk) console.log('\nTHE CANARY MISSED. The verdict above is not evidence.');
}
