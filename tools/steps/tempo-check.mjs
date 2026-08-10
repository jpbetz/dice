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

// THE PLAYBACK TEMPO IS A THEOREM, SO IT GETS THEOREM CHECKS, NOT A MATRIX.
//
// A settle change earns its way through settle-matrix.mjs because nobody can
// predict what it does to shake, piling and the clock. The tempo is not that
// kind of change: it multiplies the projector's clock and touches no physics,
// so what has to be PROVEN is that the claim is literally true — the bake is
// untouched, the film really does drain k times faster, and the debug stepper
// every e2e scenario rides did not quietly inherit the knob.
//
//   i   the baked throw at k=2 is byte-identical to the same seed at k=1
//   ii  wall-clock playback takes duration/k, within 10%
//   iii sim(n) is unaffected  (proved by `npm test` with k left at 2, not here;
//       what this file shows is the mechanism that makes that true)
//
// (ii) is measured in FRAMES OF REAL TIME, not milliseconds. sim(n, true) asks
// for exactly the 1/60 s of wall clock animate() would have delivered, so
// counting calls-to-drain is the same measurement with none of the noise a
// headless browser's scheduler adds. THIS TAB DOES FIRE rAF — measured at
// ~52 fps — so the count is only exact under holdClock, which zeroes the dt
// animate() delivers while leaving sim() free. The first version of this file
// did not hold the clock and read every drain 5-10% SHORT, because rAF was
// quietly advancing the same playback; the rAF probe stays in so that cannot
// come back silently.
//
// (i) IS JUDGED AGAINST A PAIRED k=1 CONTROL, NOT AGAINST ZERO. Nothing on
// this table is byte-identical across a tab's lifetime — replay-drift.mjs
// established that shipped itself moves rest poses by ~5e-6 as float
// accumulation reorders — so "k=2 differs from k=1" means nothing until the
// same comparison between two k=1 runs is on the page next to it. What must
// be identical is the tail: duration, frames, nudges, landing frames, sound
// count. A pose float in the eighth decimal is the tab, not the tempo.
//
//   node tools/drive.mjs tools/steps/tempo-check.mjs [k] [seeds]

// The click gate, restated as arithmetic (js/main.js playImpact). Kept here
// rather than measured through WebAudio because the gate is a pure function
// of arrival times — replaying the recorded event train through it answers
// "what does a compressed train sound like" exactly, with no dependence on
// whether a muted headless tab will build an AudioContext.
const IMPACT_MIN_GAP_MS = 35;
const IMPACT_HARD_GAP_MS = 12;

function clicksThrough(events, k) {
  const gate = Math.max(IMPACT_HARD_GAP_MS, IMPACT_MIN_GAP_MS / k);
  let last = -1e9;
  let through = 0;
  let thumps = 0;      // events in the top decile of strength that survived
  let minGap = Infinity;
  const strongest = events.reduce((m, e) => Math.max(m, e.strength), 0);
  const played = [];
  for (const e of events) {
    const at = (e.time / k) * 1000; // ms of WALL clock at this tempo
    if (at - last < gate) continue;
    if (last > -1e8) minGap = Math.min(minGap, at - last);
    last = at;
    through++;
    played.push(e.time);
    if (e.strength >= strongest * 0.9) thumps++;
  }
  const loud = events.filter((e) => e.strength >= strongest * 0.9).length;
  return { through, of: events.length, thumps, loud, minGap, played: played.join(',') };
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of rows) console.log(line(r));
}

export default async function run(stage, [kArg = '2', seedCount = '6']) {
  const k = Number(kArg);
  const n = Number(seedCount);
  const a = await stage.tab('localhost', 'Tempo');
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  const POOL = ['d8', 'd8', 'd4', 'd6'];

  console.log(`tempo ${await a.dbg('tempo')} (inert) → checking k=${k} over ${n} seeds\n`);

  // Does this tab fire rAF? If it does, animate() is advancing playback behind
  // every measurement in this repo, and the frame counts below are an upper
  // bound rather than an exact answer. Said out loud either way.
  const rafHz = Number(await a.eval(`new Promise((res) => {
    let f = 0; const t0 = performance.now();
    const step = () => { f++; if (performance.now() - t0 < 300) requestAnimationFrame(step);
      else res(Math.round(f / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(step);
  })`));
  console.log(`rAF in this tab: ~${rafHz} fps${rafHz > 5
    ? ' — LIVE. holdClock is therefore MANDATORY below, or animate() advances'
      + '\n  the same playback the drain is counting and every count reads short.'
    : ' — effectively still, but holdClock is set anyway.'}`);
  await a.dbg('holdClock(true)');
  console.log(`holdClock: ${await a.dbg('holdClock(true)')} — rAF now delivers dt 0\n`);

  // The baked throw, at full precision. Same signature replay-drift uses: if
  // the tempo touched physics anywhere, one of these fields moves.
  const bakeSig = () => a.eval(`JSON.stringify(window.__diceDebug.currentRoll.dice.map((d) => [
    d.finalPos.x, d.finalPos.y, d.finalPos.z,
    d.finalQuat.x, d.finalQuat.y, d.finalQuat.z, d.finalQuat.w,
  ])) + '|' + window.__diceDebug.currentRoll.duration
    + '|' + window.__diceDebug.currentRoll.frames
    + '|' + window.__diceDebug.currentRoll.nudges
    + '|' + JSON.stringify(window.__diceDebug.currentRoll.landings.map(
        (l) => [l.frame, l.timedOut ? 1 : 0]))
    + '|' + window.__diceDebug.currentRoll.sounds.length`);

  const soundsOf = () => a.eval(
    'JSON.stringify(window.__diceDebug.currentRoll.sounds.map((s) => ({ time: s.time, strength: s.strength })))');

  // Throw, then drain in real-time frames, counting them. The drain runs
  // INSIDE the page: one CDP round trip per frame would cost more than the
  // playback does and would itself be the thing being measured.
  const throwAndDrain = async (seed) => {
    await a.dbg(`throwSeeded(${JSON.stringify(POOL)}, ${seed})`);
    const sig = await bakeSig();
    const sounds = JSON.parse(await soundsOf());
    const frames = Number(await a.eval(`(() => { let f = 0;
      while (window.__diceDebug.busy && f < 20000) { window.__diceDebug.sim(1, true); f++; }
      return f; })()`));
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    return { sig, sounds, frames };
  };

  const runAt = async (tempo) => {
    await a.dbg(`setTempo(${tempo})`);
    const out = [];
    for (const seed of seeds) out.push(await throwAndDrain(seed));
    return out;
  };

  const at1 = await runAt(1);
  const ctl = await runAt(1);   // the control: the same knob, the same twice
  const atK = await runAt(k);
  await a.dbg('setTempo(1)');

  // --- (i) the bake is untouched -------------------------------------------
  // Split every signature into POSE and TAIL. The tail — duration, frames,
  // nudges, landing frames, sound count — is what a second client has to
  // agree about, and it must match exactly. The pose is float accumulation
  // and is judged against the control arm, never against zero.
  const split = (sig) => {
    const parts = sig.split('|');
    return { pose: JSON.parse(parts[0]).flat(), tail: parts.slice(1).join('|') };
  };
  const compare = (A, B) => {
    let tailSame = 0;
    let worstPose = 0;
    const tailMoved = [];
    seeds.forEach((s, i) => {
      const x = split(A[i].sig);
      const y = split(B[i].sig);
      if (x.tail === y.tail) tailSame++; else tailMoved.push(s);
      worstPose = Math.max(worstPose, x.pose.reduce((m, v, j) => Math.max(m, Math.abs(v - y.pose[j])), 0));
    });
    const identical = seeds.filter((_, i) => A[i].sig === B[i].sig).length;
    return { tailSame, worstPose, tailMoved, identical };
  };
  const ctlCmp = compare(at1, ctl);
  const kCmp = compare(at1, atK);
  console.log(`(i) is the BAKE untouched? Two comparisons against the same first run:`
    + `\n    the CONTROL is a second k=1 pass, so it shows what this tab does on its own.\n`);
  table(['comparison', 'tail identical', 'byte-identical', 'largest pose Δ', 'tails that moved'], [
    ['k=1 vs k=1 (control)', `${ctlCmp.tailSame}/${n}`, `${ctlCmp.identical}/${n}`,
      ctlCmp.worstPose.toExponential(2), ctlCmp.tailMoved.join(',') || '—'],
    [`k=1 vs k=${k}`, `${kCmp.tailSame}/${n}`, `${kCmp.identical}/${n}`,
      kCmp.worstPose.toExponential(2), kCmp.tailMoved.join(',') || '—'],
  ]);
  const iPass = kCmp.tailSame === n && kCmp.worstPose <= Math.max(ctlCmp.worstPose, 1e-5);
  console.log(`\n    ${iPass
    ? `PASS — every tail identical at k=${k}, and the pose moves no further than`
      + ` the tab moves it at k=1.\n           The tempo is playback-only, as the theorem says.`
    : `FAIL — the tempo reached the bake: ${kCmp.tailSame}/${n} tails identical,`
      + ` pose ${kCmp.worstPose.toExponential(2)} vs control ${ctlCmp.worstPose.toExponential(2)}`}\n`);

  // --- (ii) the film drains k times faster ---------------------------------
  console.log(`(ii) wall-clock playback — frames of real time to drain,`
    + ` against duration/k\n`);
  const rows = seeds.map((s, i) => {
    const dur = Number(at1[i].sig.split('|')[1]);
    const want1 = dur * 60;
    const wantK = (dur / k) * 60;
    const off1 = (at1[i].frames - want1) / want1;
    const offK = (atK[i].frames - wantK) / wantK;
    const ratio = at1[i].frames / atK[i].frames;
    return [s, dur.toFixed(3), want1.toFixed(0), at1[i].frames,
      `${off1 >= 0 ? '+' : ''}${(off1 * 100).toFixed(1)}%`,
      wantK.toFixed(0), atK[i].frames,
      `${offK >= 0 ? '+' : ''}${(offK * 100).toFixed(1)}%`, ratio.toFixed(2)];
  });
  table(['seed', 'duration', `want@1`, `got@1`, 'Δ', `want@${k}`, `got@${k}`, 'Δ', 'speedup'], rows);
  const worst = Math.max(...seeds.map((_, i) => {
    const dur = Number(at1[i].sig.split('|')[1]);
    return Math.abs((atK[i].frames - (dur / k) * 60) / ((dur / k) * 60));
  }));
  const meanSpeedup = mean(seeds.map((_, i) => at1[i].frames / atK[i].frames));
  console.log(`\n    mean speedup ${meanSpeedup.toFixed(3)}x (asked for ${k}x),`
    + ` worst deviation from duration/k ${(worst * 100).toFixed(1)}%`);
  console.log(`    ${worst <= 0.10
    ? 'PASS — the same film, k times faster'
    : 'FAIL — playback is not tracking duration/k'}\n`);

  // --- the click train ------------------------------------------------------
  console.log(`(iii-adjacent) the click cap on a compressed train — the recorded`
    + ` impact train replayed\n    through playImpact's wall-clock gate at each`
    + ` tempo. "thumps" counts the loudest\n    decile of a throw's impacts that`
    + ` still get played.\n`);
  const capRows = seeds.map((s, i) => {
    const c1 = clicksThrough(at1[i].sounds, 1);
    const ck = clicksThrough(at1[i].sounds, k);
    return [s, c1.of, `${c1.through}`, `${c1.thumps}/${c1.loud}`,
      Number.isFinite(c1.minGap) ? `${c1.minGap.toFixed(0)}ms` : '—',
      `${ck.through}`, `${ck.thumps}/${ck.loud}`,
      Number.isFinite(ck.minGap) ? `${ck.minGap.toFixed(0)}ms` : '—',
      c1.played === ck.played ? 'same clicks' : 'DIFFERENT'];
  });
  table(['seed', 'impacts', `played@1`, 'thumps@1', 'min gap@1',
    `played@${k}`, `thumps@${k}`, `min gap@${k}`, 'selection'], capRows);
  const gaps = seeds.map((_, i) => clicksThrough(at1[i].sounds, k).minGap).filter(Number.isFinite);
  const sameSel = seeds.filter((_, i) =>
    clicksThrough(at1[i].sounds, 1).played === clicksThrough(at1[i].sounds, k).played).length;
  const thumpLoss = seeds.reduce((s, _, i) =>
    s + (clicksThrough(at1[i].sounds, 1).thumps - clicksThrough(at1[i].sounds, k).thumps), 0);
  console.log(`\n    gate at k=1 ${IMPACT_MIN_GAP_MS}ms (shipped exactly) → at k=${k}`
    + ` ${Math.max(IMPACT_HARD_GAP_MS, IMPACT_MIN_GAP_MS / k).toFixed(1)}ms;`
    + ` hard floor ${IMPACT_HARD_GAP_MS}ms caps the rate at ${Math.round(1000 / IMPACT_HARD_GAP_MS)}/s`);
  console.log(`    tightest gap measured at k=${k}: ${gaps.length ? Math.min(...gaps).toFixed(0) : '—'}ms`);
  console.log(`    same set of clicks survives at both tempi: ${sameSel}/${n} seeds;`
    + ` loud impacts lost: ${thumpLoss}`);
  console.log(`    ${sameSel === n && thumpLoss <= 0
    ? 'PASS — the same clicks, compressed. Nothing shipped plays today was dropped'
    : 'READ IT — the compression changed which clicks survive; see the table above'}`);
  await a.dbg('holdClock(false)');
}
