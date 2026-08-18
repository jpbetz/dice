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

// C27's RESIDUAL, RE-MEASURED SO THE TABLE HAS AN INSTRUMENT INSTEAD OF A DATE.
//
// **`preferDice` SHIPS ON SINCE 2026-08-18** (Joe's call on the v-crop frames),
// so this step's `off` column is now the COUNTERFACTUAL and its `on` column is
// what a player sees. Nothing else about it changed: both sides are still read
// off one settled throw, and both are now set explicitly — see the setFraming
// pair below for why the day of the flip is exactly when an unset read lies.
// The 2026-08-18 re-run before shipping reproduced the 08-17 table cell for
// cell, median and range, all eighteen: **0 of 90 paired throws shrank, 0 lost
// a die, 30 fired.**
//
// WHY THIS FILE EXISTS. The C27 residual table was measured once, written into
// the roadmap as fixed numbers, and did not reproduce a day later — desktop 3d6
// came back 253 where the doc said 245, and desktop 6d6 and 40d6 came back with
// NO CHANGE at all where the doc claimed +36 and −16. A number in a document
// that nobody can re-derive is the same failure this repo keeps catching in
// other clothes: a stand-in that stopped standing in, with nothing failing
// loudly. So the table is now a COMMAND.
//
// AND THE ANSWER, since this file is what found it (2026-08-17). NOTHING DRIFTED.
// The tree at `c29d429` — the commit that WROTE the table — runs this step to
// numbers byte-identical with today's, desktop cell for desktop cell. The
// archived desktop column was three readings of `frame-price.mjs`'s UNGATED
// probe grid, filed under a `preferDice` heading, and not even three cells of
// one column of it:
//
//   desktop 3d6  245  = frame-price `land 1.0`   (preferDice really gives 253)
//   desktop 6d6  236  = frame-price `land .55`   — a DIFFERENT option's column;
//                                                   `land 1.0` is 221 and
//                                                   preferDice gives no change
//   desktop 40d6 184  = frame-price `land 1.0`   (preferDice gives no change)
//
// The phone and iPad columns, which were read off `frame-small.mjs`'s gated
// `preferDice` column, reproduce EXACTLY — every digit, including 12d6's
// 59 → 68. One table, two instruments, and the heading only described one.
// The "40d6 is made worse" finding is the sharpest casualty: `preferDice`
// cannot return a span smaller than rung 1's, so it was never a thing the
// option did. See the roadmap's C27 for what that costs the argument.
//
//   node tools/drive.mjs tools/steps/frame-residual.mjs            # the table
//   node tools/drive.mjs tools/steps/frame-residual.mjs --seeds 3  # cheaper
//   node tools/drive.mjs tools/steps/frame-residual.mjs --spawn width
//   node tools/drive.mjs tools/steps/frame-residual.mjs --verbose
//   node tools/drive.mjs tools/steps/frame-residual.mjs --pools 3d6,6d6,40d6 --views 1600
//
// THREE THINGS IT DOES THAT THE ONE-SHOT MEASUREMENT DID NOT.
//
// ① ONE THROW, TWO CAMERAS. `preferDice` off and on are read off the SAME
//    settled world, back to back, with no second throw in between. That is a
//    stronger pairing than "same seed, two runs": there is no physics between
//    the two readings at all, so the delta is the camera and provably nothing
//    else. (Pairing by seed alone would still be at the mercy of any engine
//    change landing between the two runs — which is exactly the accusation
//    levelled at the 2026-08-15 table.)
//
// ② SEVERAL SEEDS PER CELL, REPORTED AS A MEDIAN AND A RANGE. The gain gate
//    (`FRAMING.gain`, 1.15) is a THRESHOLD, and a threshold turns a smooth
//    quantity into a step: a cluster that settles a little tighter clears it
//    and the frame jumps; a little looser and the candidate is refused outright
//    and the answer is "no change". A one-seed cell cannot tell those apart
//    from a regression, and calling one of them "the" number is how the
//    08-15 table got written. Seed #1 of every cell is the ORIGINAL C27 seed,
//    printed separately, so "does the archived number reproduce" and "is the
//    archived number representative" are two different questions with two
//    different answers.
//
// ③ THE RAW RUNG NEXT TO THE GATED ONE. `framingProbe()` reports what the dice
//    rung would give with no gate at all. The shipped instrument can only ever
//    return rung 1's span or a span at least 1.15x it — it can NEVER return a
//    smaller number — so any "preferDice makes this worse" claim has to be a
//    probe reading that was never on offer. Both are in the table.
//
// COLUMNS
//   off        framingInfo().spanPx with the shipped framing (preferDice false)
//   on         the same throw with __diceDebug.setFraming({preferDice: true})
//   x          on / off
//   kept       how many of the N seeds the gain gate accepted rung 2 for
//   rung2      framingProbe()'s landscape scan from the preset — the UNGATED
//              dice rung, i.e. what rung 2 would give if nothing judged it
//   turn       how many seeds came back with the TABLE QUARTER-TURNED under
//              preferDice. This is not a footnote. Keeping rung 2 makes the
//              landscape candidate stop containing the mat, and `computeFraming`
//              then evaluates the portrait candidate on a DIFFERENT rule under
//              preferDice (completeness, then size, since the mat is already
//              conceded). So the option can rotate a DESKTOP table — which the
//              archived table, being a probe reading, could not show.
//   spanPx is the project's own unit (NDC delta x viewport, so 2x CSS px per
//   world unit) — the unit C27's table and matFit() are already written in.

const ALL_VIEWS = [
  // `mini` mirrors what a real client of that width is wearing: a phone and a
  // tablet run with both panels collapsed, a desktop with both open. The rail
  // is the reason (C27) — it takes 112px of a 390px window before the camera
  // sees anything — so getting this wrong changes every number in the file.
  { name: 'phone 390', w: 390, h: 844, mini: true },
  { name: 'ipad-p 834', w: 834, h: 1112, mini: true },
  { name: 'desktop 1600', w: 1600, h: 1000, mini: false },
];

// Seed #1 is C27's own seed for that pool, so the first column of every cell is
// a direct re-run of the archived number. The rest are +1000 apart, which is a
// choice with no meaning beyond "different tumble, written down".
const ALL_POOLS = [
  { label: '1d20', types: ['d20'], seed: 7001 },
  { label: '3d6', types: ['d6', 'd6', 'd6'], seed: 7002 },
  { label: '6d6', types: Array(6).fill('d6'), seed: 7004 },
  { label: '12d6', types: Array(12).fill('d6'), seed: 7005 },
  { label: '20d6', types: Array(20).fill('d6'), seed: 7006 },
  { label: '40d6', types: Array(40).fill('d6'), seed: 7007 },
];

const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};
const rng = (a) => `${Math.min(...a)}..${Math.max(...a)}`;
const flat = (a) => a.every((v) => v === a[0]);

// C24's BINDING MEASUREMENT, RE-ASKED OF THE MATS THAT ACTUALLY SHIP
// (`--pile`). C24 is merged into C27, and the one thing it still instructs is
// "do not take another notch off the mat" — resting on a 2026-08-09 table of
// dice-above-y=1.2 for mats of 8.6x5.2, 6.7x4.1 and 5.2x3.2. Two of those three
// have never shipped since; the ROADMAP entry already strikes the preset NAMES
// off that table and warns nobody to quote them. This asks the same question of
// `wide` / `medium` / `close` as they are today, so the instruction has a live
// number under it instead of an archived one.
//
//   piled>1.2   C24's own bar, kept verbatim so the rows are comparable
//   piled>ceil  the theorem bar — restCeiling(type), the highest a die TOUCHING
//               the felt can hold its centre. 1.2 is the d6 answer and a
//               coincidence for everything else (C30c: a d20 rests at 1.190).
//   maxY        the tallest resting centre — C24's "max height" column
//
//   node tools/drive.mjs tools/steps/frame-residual.mjs --pile
async function pileLeg(a, pools, seeds) {
  const ZOOMS = ['wide', 'medium', 'close'];
  const rows = [];
  await a.dbg('setPanelState({pools: true, log: true})');
  for (const z of ZOOMS) {
    await a.dbg(`setZoom(${JSON.stringify(z)})`);
    const mat = await a.dbg(`zoomPreset(${JSON.stringify(z)})`);
    for (const pool of pools) {
      const hi = []; const ceil = []; const top = [];
      for (let k = 0; k < seeds; k++) {
        const seed = pool.seed + k * 1000;
        await a.dbg('clearTable()');
        await a.dbg('sim(400)');
        await a.dbg(`throwSeeded(${JSON.stringify(pool.types)}, ${seed})`);
        await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
          { desc: `${z} ${pool.label} seed ${seed}`, timeout: 60000 });
        await a.dbg('sim(600)');
        const poses = await a.dbg('feltPoses()');
        const ceilings = {};
        for (const t of new Set(poses.map((p) => p.type))) {
          ceilings[t] = await a.dbg(`restCeiling(${JSON.stringify(t)})`);
        }
        hi.push(poses.filter((p) => p.pos[1] > 1.2).length);
        ceil.push(poses.filter((p) => p.pos[1] > ceilings[p.type]).length);
        top.push(Math.max(...poses.map((p) => p.pos[1])));
      }
      rows.push({
        mat: `${z} ${mat.w}x${mat.d}`,
        pool: pool.label,
        n: pools.find((p) => p.label === pool.label).types.length,
        hi: `${med(hi)} [${rng(hi)}]`,
        ceil: `${med(ceil)} [${rng(ceil)}]`,
        maxY: Math.round(Math.max(...top) * 10) / 10,
      });
    }
  }
  await a.dbg("setZoom('medium')");
  const head = ['mat', 'pool', 'of', 'piled >1.2', 'piled >ceil', 'max height'];
  const w = head.map((h, i) => Math.max(h.length,
    ...rows.map((x) => String(Object.values(x)[i]).length)));
  const line = (c) => c.map((v, i) => String(v).padEnd(w[i])).join('  ');
  console.log(`\n  C24's PILE TABLE, re-asked of today's presets, ${seeds} seed(s) per cell`);
  console.log('  median [range] over seeds; max height is the worst seed in the cell.\n');
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  for (const x of rows) console.log(line(Object.values(x)));
  return rows;
}

function argVal(args, name, dflt) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] !== undefined) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : dflt;
}

export default async function run(stage, args = []) {
  const seeds = Math.max(1, Number(argVal(args, '--seeds', 5)) || 5);
  const spawnAxis = argVal(args, '--spawn', null);
  // C27's whole table is at `medium`; `close` is here because C28 ①'s wall
  // births were measured at close and the spawn question has to be askable
  // where the answer was known to be yes.
  const zoom = argVal(args, '--zoom', 'medium');
  const verbose = args.includes('--verbose');
  const onlyPools = String(argVal(args, '--pools', '')).split(',').filter(Boolean);
  const onlyViews = String(argVal(args, '--views', '')).split(',').filter(Boolean);
  const views = ALL_VIEWS.filter((v) => !onlyViews.length
    || onlyViews.some((s) => v.name.includes(s)));
  const pools = ALL_POOLS.filter((p) => !onlyPools.length || onlyPools.includes(p.label));

  const a = await stage.tab('localhost', 'Residual');
  if (args.includes('--pile')) return pileLeg(a, pools, seeds);
  // THE SPAWN-GEOMETRY HYPOTHESIS, ASKED WITHOUT A SECOND BUILD. `setSpawn`
  // ({axis: 'width'}) restores the pre-b2a3326 spawn line EXACTLY — `fit()`
  // becomes the identity, `lateral` stays `offset * 0.5`, and `extent` stays
  // TABLE_W — so this is the old formula running inside today's binary, which
  // is a cleaner experiment than an old checkout: the ONLY thing that differs
  // is the thing under test.
  if (spawnAxis) {
    const s = await a.dbg(`setSpawn({axis: ${JSON.stringify(spawnAxis)}})`);
    console.log(`\n  SPAWN OVERRIDE: ${JSON.stringify(s)}`);
  }

  const rows = [];
  const detail = [];
  for (const vp of views) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await a.dbg(`setZoom(${JSON.stringify(zoom)})`); // dice.zoom.v1 is per-origin and outlives a run
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));

    for (const pool of pools) {
      const cell = { off: [], on: [], rung2: [], kept: 0, turn: 0, crop: 0, lost: 0, wall: 0, seeds: [] };
      for (let k = 0; k < seeds; k++) {
        const seed = pool.seed + k * 1000;
        await a.dbg('clearTable()');
        await a.dbg('sim(400)');
        await a.dbg(`throwSeeded(${JSON.stringify(pool.types)}, ${seed})`);
        await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
          { desc: `${vp.name} ${pool.label} seed ${seed}`, timeout: 60000 });
        await a.dbg('sim(600)');

        // ONE settled world, read three ways. Nothing between these calls
        // advances the physics clock, so the cluster is bit-identical across
        // all three and the only variable is where the eye is put.
        // THE SPAWN OVERRIDE HAS TO BE SHOWN TO BITE, or "nothing changed" is a
        // vacuous result rather than a refutation. `clear` is a die's gap to the
        // wall on the axis its side spread along; NEGATIVE means it was born
        // inside the wall plane, which is the only condition under which the
        // pre-b2a3326 line and today's differ at all (they are bit-identical
        // wherever the old one was legal — the jitter is drawn before the clamp).
        const spawn = await a.dbg('spawnLine()');
        const worstClear = spawn.length ? Math.min(...spawn.map((s) => s.clear)) : null;
        // BOTH SIDES ARE SET EXPLICITLY, and that is not belt-and-braces: since
        // 2026-08-18 `preferDice` SHIPS ON, so an unset read is the ON frame.
        // This step used to read `off` straight off the default and only ever
        // set the option ON — which the day the default flipped would have
        // printed an on/on column pair under an off/on heading, silently, on
        // the one page whose whole job is to stop that happening.
        await a.dbg('setFraming({preferDice: false, floor: 1})');
        const off = await a.dbg('framingInfo()');
        const probe = await a.dbg('framingProbe()');
        await a.dbg('setFraming({preferDice: true})');
        const on = await a.dbg('framingInfo()');

        const raw = probe.cases.find((c) => c.orbit === 'landscape' && c.from === 1);
        cell.off.push(off.spanPx);
        cell.on.push(on.spanPx);
        cell.rung2.push(raw ? raw.span : 0);
        if (on.spanPx !== off.spanPx) cell.kept++;
        if (on.orbit && !off.orbit) cell.turn++;
        if (off.matFits && !on.matFits) cell.crop++;
        if (on.diceOnScreen < off.diceOnScreen) cell.lost++;
        if (worstClear !== null && worstClear < 0) cell.wall++;
        cell.seeds.push(seed);
        detail.push({
          view: vp.name,
          pool: pool.label,
          seed,
          cluster: `${probe.cluster.w}x${probe.cluster.d}`,
          off: off.spanPx,
          on: on.spanPx,
          x: Math.round((on.spanPx / off.spanPx) * 100) / 100,
          rung2: raw ? `${raw.span}${raw.fits ? '' : '!'}` : '—',
          rung2x: raw ? Math.round((raw.span / off.spanPx) * 100) / 100 : '—',
          rungs: `${off.mode}>${on.mode}`,
          turned: on.orbit ? `turned(${on.orbit})` : '',
          mat: `${off.matFits ? 'y' : 'n'}>${on.matFits ? 'y' : 'n'}`,
          seen: `${off.diceOnScreen}>${on.diceOnScreen}/${off.dice}`,
          clear: worstClear === null ? '—' : `${worstClear}${worstClear < 0 ? ' WALL' : ''}`,
        });
      }
      const offM = med(cell.off);
      const onM = med(cell.on);
      rows.push({
        view: vp.name,
        pool: pool.label,
        seed1: `${cell.off[0]}→${cell.on[0]}`,
        off: flat(cell.off) ? String(offM) : `${offM} [${rng(cell.off)}]`,
        on: flat(cell.on) ? String(onM) : `${onM} [${rng(cell.on)}]`,
        x: (onM / offM).toFixed(2),
        kept: `${cell.kept}/${seeds}`,
        turn: `${cell.turn}/${seeds}`,
        crop: `${cell.crop}/${seeds}`,
        wall: `${cell.wall}/${seeds}`,
        rung2: flat(cell.rung2) ? String(med(cell.rung2)) : `${med(cell.rung2)} [${rng(cell.rung2)}]`,
        rung2x: (med(cell.rung2) / offM).toFixed(2),
      });
      if (cell.lost) console.log(`  ! ${vp.name} ${pool.label}: preferDice DROPPED a die on `
        + `${cell.lost}/${seeds} seed(s) — the gate promises it cannot`);
    }
  }

  await a.dbg('setPanelState({pools: true, log: true})');
  await a.dbg("setZoom('medium')");
  await a.dbg('setFraming({preferDice: true, floor: 1})'); // back to what ships
  if (spawnAxis) await a.dbg("setSpawn({axis: 'clamp'})");

  const table = (head, data) => {
    const w = head.map((h, i) => Math.max(h.length,
      ...data.map((x) => String(Object.values(x)[i]).length)));
    const line = (c) => c.map((v, i) => String(v).padEnd(w[i])).join('  ');
    console.log(line(head));
    console.log(w.map((n) => '-'.repeat(n)).join('  '));
    for (const x of data) console.log(line(Object.values(x)));
  };

  if (verbose) {
    console.log('\n  PER SEED — one settled throw, read with preferDice off then on\n');
    table(['viewport', 'pool', 'seed', 'cluster', 'off', 'on', 'x', 'rung2', 'r2x',
      'rung off>on', 'orbit', 'mat', 'seen', 'spawn clear'], detail);
  }

  console.log(`\n  C27 RESIDUAL, ${seeds} seed(s) per cell, zoom=${zoom}`
    + `${spawnAxis ? `, SPAWN axis=${spawnAxis}` : ''}`);
  console.log('  off/on = framingInfo().spanPx on ONE settled throw, camera flipped between reads.');
  console.log('  seed1 = the archived C27 seed for that pool. rung2 = framingProbe(), UNGATED.\n');
  table(['viewport', 'pool', 'seed1', 'off', 'on (median [range])', 'x', 'kept', 'turn', 'crop', 'wall', 'rung2', 'r2x'], rows);
  console.log('\n  "kept" is how often the gain gate (FRAMING.gain = 1.15) accepted rung 2.');
  console.log('  A refusal reads as on == off — the instrument CANNOT return a smaller span,');
  console.log('  so any recorded "preferDice made it worse" is an ungated rung2 reading.');
  console.log('  "turn" = the table came back QUARTER-TURNED; "crop" = the mat left the frame.');
  console.log('  "wall" = throws with a die born INSIDE a wall — the only throws where the');
  console.log('  --spawn override can possibly change the film. wall 0/N makes a null result null.');
  return { rows, detail };
}
