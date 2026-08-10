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

// ATTRIBUTION ONLY, AND IT IS NOT A SHIP CANDIDATE. Deaden does not replay
// (one seed in sixteen comes back a different throw after 700 unrelated
// throws) and the standing suspicion is the sleep boundary: a deadened die
// spends much longer near sleepSpeedLimit, where accumulated world.time can
// tip the decision either way. allowSleep=false removes the boundary
// entirely. It also changes shipped trajectories on its own, so `sleepoff`
// is here as ITS OWN baseline — read deaden+sleepoff against sleepoff, never
// against shipped, and do not read the verdict gates on either row.
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
const CANARY_DUR = { '1d20': 1.37, soul: 2.26, '4d6': 2.04, '8d6': 2.40, '20d6': 6.25 };
const CANARY_SHAKE = { '1d20': 0.106, soul: 0.141, '4d6': 0.152, '8d6': 0.191, '20d6': 0.212 };

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
            const r = JSON.parse(await a.eval(`JSON.stringify((() => {
              const ds = window.__diceDebug.tableDice;
              return [ds.filter((o) => o.body.position.y > 1.2).length,
                ds.filter((o) => o.body.position.y
                  > window.__diceDebug.restCeiling(o.type)).length];
            })())`));
            piled += r[0]; piledTrue += r[1]; dice += types.length;
            if (r[0] === 0) flat++;
            await clear();
          }
          piles.set(`${vname}|${z}|${pname}`,
            { pct: (piled / dice) * 100, flat, n: piled, nTrue: piledTrue, dice });
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
  // THE PILE GATE IS TIGHTER THAN PASS ONE'S, deliberately. It was +3pp with
  // a one-throw allowance on the flat count, which is the right bar for
  // "does this tuning make piling worse"; pass three is judging a mechanism
  // whose ENTIRE PURPOSE is the pile, so it has to hold the line exactly.
  // Creep joins as its own gate for the same reason it was printed: a
  // mechanism that stops dice sooner can buy a still picture by freezing one
  // mid-slide, and creep is the only column that can tell.
  console.log(`\nverdict — every gate judged against THIS run's shipped row\n`
    + `  a shake  mean reduction over ${SHAKE_GATED.join('/')} >= 20%\n`
    + `  b dur    no pool worse than shipped +5%\n`
    + `  c caps   total capped throws <= shipped's, AND 20d6 caps <= 1\n`
    + `  d pile   every cell within +/-2pp of shipped, and 6d6@close flat-throws >= shipped's\n`
    + `  e clock  per-pool mean wall <= 1.5x shipped\n`
    + `  f rest   same terminator as shipped: creep no pool worse than +15%;\n`
    + `           a row that MOVES the settle frame is judged FORWARD instead\n`
    + `           (worst dispMax <= shipped's and loose <= shipped's), because\n`
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
    const flatOk = hasPile
      && piles.get(`${n}|close|6d6`).flat >= piles.get(`${base}|close|6d6`).flat;
    const worstClock = Math.max(...SHAKE_POOLS.map(([p]) => got.get(`${n}|${p}`).wall / b(p).wall));
    const worstCreep = Math.max(...SHAKE_POOLS.map(([p]) =>
      (got.get(`${n}|${p}`).creep - b(p).creep) / b(p).creep));
    // A row that changes the terminator moves every settle frame, and with it
    // the anchor of creep's backward window — so it is judged forward.
    const movesFrame = !!(v[7] && v[7].mode && v[7].mode !== INERT.settleGate.mode);
    const worstDispMax = Math.max(...SHAKE_POOLS.map(([p]) => got.get(`${n}|${p}`).dispMax));
    const baseDispMax = Math.max(...SHAKE_POOLS.map(([p]) => b(p).dispMax));
    const worstLoose = Math.max(...SHAKE_POOLS.map(([p]) => got.get(`${n}|${p}`).loose));
    const baseLoose = Math.max(...SHAKE_POOLS.map(([p]) => b(p).loose));
    const restGate = movesFrame
      ? [worstDispMax <= baseDispMax && worstLoose <= baseLoose,
        `f disp ${worstDispMax.toFixed(4)}/${baseDispMax.toFixed(4)} loose ${worstLoose}/${baseLoose}`]
      : [worstCreep <= 0.15, `f creep ${worstCreep >= 0 ? '+' : ''}${(worstCreep * 100).toFixed(0)}%`];
    const g = [
      [shakeCut >= 0.20, `a shake ${(shakeCut * 100).toFixed(0)}%`],
      [worstDur <= 0.05, `b dur ${worstDur >= 0 ? '+' : ''}${(worstDur * 100).toFixed(0)}%`],
      [caps <= baseCaps && caps20 <= 1, `c caps ${caps}/${baseCaps} 20d6 ${caps20}`],
      // "within 2pp" read as ONE-SIDED: a cell that piles LESS than shipped is
      // the point of the exercise, not a gate failure.
      [hasPile && worstPile <= 2 && flatOk,
        `d pile ${hasPile ? `${worstPile >= 0 ? '+' : ''}${worstPile.toFixed(1)}pp` : 'n/a'}`
        + `${hasPile && !flatOk ? ' flat!' : ''}`],
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
