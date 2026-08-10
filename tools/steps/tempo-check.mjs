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
//
// AND THE FIRST VERSION OF THIS MODEL WAS AN IDEALIZATION THAT HID A SHIPPED
// BUG. It gave each impact its own wall-clock arrival at `time/k`, as if the
// drain delivered them on a continuous clock. It does not. The drain runs
// inside rAF: every impact whose `time` has passed is played in ONE frame, and
// every impact in that frame reads essentially the same performance.now(). So
// arrivals are QUANTISED to the refresh interval, and the wall gate is
// compared against quantised gaps.
//
// What that hides: at 60 Hz and k=1 the gate is 35 ms against frames 16.7 ms
// apart, so a click can only pass every THIRD frame — 20 a second, when the
// film asks for up to 28.6. Two thumps 40 ms apart in the film land two frames
// apart, 33.3 ms of wall, and the second is deleted. Today. At k=1.
//
// So the model batches. `hz` is the display; a frame covers `1000/hz` ms of
// wall and therefore `k * 1000/hz` ms of film.
const IMPACT_MIN_GAP_MS = 35;
const IMPACT_HARD_GAP_MS = 12;

// mode 'wall'  — shipped: max(12, 35/k) against the quantised wall clock
// mode 'film'  — candidate: 35 ms of FILM between clicks PLAYED, 12 ms wall
//                floor, which is what js/main.js CLICKGATE 'film' does
function clicksThrough(events, k, hz, mode) {
  const frameMs = 1000 / hz;
  let lastWall = -1e9;
  let lastFilm = -1e9;
  let through = 0;
  let thumps = 0;      // events in the top decile of strength that survived
  let minGap = Infinity;
  const strongest = events.reduce((m, e) => Math.max(m, e.strength), 0);
  const played = [];
  for (const e of events) {
    const filmMs = e.time * 1000;
    // Which rAF frame drains this impact: the first frame whose film cursor
    // has passed it. Frame j advances the film to j * frameMs * k.
    const frame = Math.ceil(filmMs / (frameMs * k));
    const at = frame * frameMs; // every impact in the frame shares this now()
    if (mode === 'film') {
      if (at - lastWall < IMPACT_HARD_GAP_MS) continue;
      if (filmMs - lastFilm < IMPACT_MIN_GAP_MS) continue;
    } else if (at - lastWall < Math.max(IMPACT_HARD_GAP_MS, IMPACT_MIN_GAP_MS / k)) {
      continue;
    }
    if (lastWall > -1e8) minGap = Math.min(minGap, at - lastWall);
    lastWall = at;
    lastFilm = filmMs;
    through++;
    played.push(e.time);
    if (e.strength >= strongest * 0.9) thumps++;
  }
  const loud = events.filter((e) => e.strength >= strongest * 0.9).length;
  return { through, of: events.length, thumps, loud, minGap,
    played: played.join(','), set: new Set(played) };
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
    const anchor = (await a.dbg('settleProfile()')).tempoAnchor;
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    return { sig, sounds, frames, anchor };
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

  // --- the click train, through rAF ----------------------------------------
  // THE BASELINE IS WHAT SHIPS, NOT WHAT IS IDEAL. Every candidate is judged
  // against the set of clicks the WALL gate plays at k=1 on a 60 Hz display,
  // because that is the sound a player hears today. "No shipped click drops"
  // means that set is a SUBSET of what the candidate plays. A candidate may
  // add clicks — the wall gate is deleting real ones — but may never lose one.
  console.log(`\n(iv) the click train, with rAF frame batching modelled.`
    + ` The drain plays every due impact in\n     ONE frame, all reading the`
    + ` same performance.now(), so arrivals are quantised to the\n     refresh`
    + ` interval. Baseline = the wall gate at k=1 on 60 Hz: what ships.\n`);
  const CASES = [];
  for (const hz of [60, 120]) {
    for (const kk of [1, 2, 2.7]) {
      for (const mode of ['wall', 'film']) CASES.push({ hz, k: kk, mode });
    }
  }
  const capRows = [];
  for (const c of CASES) {
    let played = 0;
    let of = 0;
    let lost = 0;      // shipped clicks this case DROPS — the number that matters
    let gained = 0;
    let thumpLost = 0;
    const gaps = [];
    seeds.forEach((_, i) => {
      const evs = at1[i].sounds;
      const base = clicksThrough(evs, 1, 60, 'wall');
      const got = clicksThrough(evs, c.k, c.hz, c.mode);
      played += got.through;
      of += got.of;
      for (const t of base.set) if (!got.set.has(t)) lost++;
      for (const t of got.set) if (!base.set.has(t)) gained++;
      thumpLost += Math.max(0, base.thumps - got.thumps);
      if (Number.isFinite(got.minGap)) gaps.push(got.minGap);
    });
    capRows.push([`${c.hz}Hz k=${c.k}`, c.mode, `${played}/${of}`, lost, gained, thumpLost,
      gaps.length ? `${Math.min(...gaps).toFixed(1)}ms` : '—',
      lost === 0 ? 'ok' : 'DROPS']);
  }
  table(['display/tempo', 'gate', 'played', 'shipped lost', 'gained', 'loud lost',
    'min gap', ''], capRows);

  const wallDrops = capRows.filter((r) => r[1] === 'wall' && r[3] > 0);
  const filmDrops = capRows.filter((r) => r[1] === 'film' && r[3] > 0);
  console.log(`\n    wall gate: ${wallDrops.length} of ${capRows.length / 2} cases drop a`
    + ` shipped click${wallDrops.length ? ` (${wallDrops.map((r) => r[0]).join(', ')})` : ''}`);
  console.log(`    film gate: ${filmDrops.length} of ${capRows.length / 2} cases drop a`
    + ` shipped click${filmDrops.length ? ` (${filmDrops.map((r) => r[0]).join(', ')})` : ''}`);
  console.log(`    ${filmDrops.length === 0
    ? 'PASS — the film gate loses nothing that ships, at either refresh rate,'
      + ' at every tempo tested'
    : 'FAIL — the film gate drops clicks that ship today; see the table'}`);
  console.log(`\n    Note the "gained" column: where it is nonzero the WALL gate is`
    + ` deleting impacts the\n    film separation says should sound. That is the`
    + ` bug, not a bonus.`);

  // --- (v) the curve --------------------------------------------------------
  // A varying k is the case the film gate has to be right about by
  // construction: it gates roll.time deltas, which do not know what the
  // projector is doing. The wall gate cannot make that claim at all.
  console.log(`\n(v) the same train under the tempo CURVE (flight 1 -> settle 2.2).`
    + ` The film gate is a\n    function of roll.time, so a k that VARIES cannot`
    + ` change which clicks survive —\n    the wall gate's selection moves with`
    + ` every gear change.\n`);
  const curveRows = seeds.map((s, i) => {
    const evs = at1[i].sounds;
    const anchor = Number(at1[i].anchor);
    const dur = Number(at1[i].sig.split('|')[1]);
    // Wall arrival under the curve: integrate 1/k(t) over film time. The film
    // gate needs no such integral, which is the point.
    const kAt = (t) => {
      if (t <= anchor) return 1;
      const u = Math.min(1, (t - anchor) / 0.4);
      return 1 + 1.2 * (u * u * (3 - 2 * u));
    };
    const wallOf = (t) => {
      let w = 0;
      const step = 1 / 600;
      for (let x = 0; x < t; x += step) w += step / kAt(x);
      return w * 1000;
    };
    let lastWall = -1e9;
    let lastFilm = -1e9;
    const filmSet = new Set();
    const wallSet = new Set();
    for (const e of evs) {
      const w = wallOf(e.time);
      if (w - lastWall >= IMPACT_HARD_GAP_MS && e.time * 1000 - lastFilm >= IMPACT_MIN_GAP_MS) {
        lastWall = w; lastFilm = e.time * 1000; filmSet.add(e.time);
      }
    }
    lastWall = -1e9;
    for (const e of evs) {
      const w = wallOf(e.time);
      if (w - lastWall >= Math.max(IMPACT_HARD_GAP_MS, IMPACT_MIN_GAP_MS / kAt(e.time))) {
        lastWall = w; wallSet.add(e.time);
      }
    }
    const base = clicksThrough(evs, 1, 60, 'wall');
    const lostFilm = [...base.set].filter((t) => !filmSet.has(t)).length;
    const lostWall = [...base.set].filter((t) => !wallSet.has(t)).length;
    return [s, evs.length, dur.toFixed(2), anchor.toFixed(2),
      `${filmSet.size} / -${lostFilm}`, `${wallSet.size} / -${lostWall}`];
  });
  table(['seed', 'impacts', 'duration', 'anchor', 'film: played/lost', 'wall: played/lost'],
    curveRows);
  const curveFilmLost = curveRows.reduce((n, r) => n + Number(String(r[4]).split('-')[1]), 0);
  const curveWallLost = curveRows.reduce((n, r) => n + Number(String(r[5]).split('-')[1]), 0);
  console.log(`\n    under the curve: film gate loses ${curveFilmLost} shipped clicks,`
    + ` wall gate loses ${curveWallLost}`);
  console.log(`    ${curveFilmLost === 0
    ? 'PASS — a varying projector does not change which clicks survive'
    : 'FAIL — the film gate is not invariant under a varying k'}`);

  await a.dbg('holdClock(false)');
}
