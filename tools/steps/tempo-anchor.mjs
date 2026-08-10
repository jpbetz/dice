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

// WHERE DOES THE TUMBLE END? The tempo curve runs at `flight` until an anchor
// and at `settle` after it, and the anchor is the last film time any die's
// centre travels faster than `anchorSpeed`. That threshold is the only free
// parameter in the mechanism, so it gets swept rather than picked.
//
// WHAT A GOOD THRESHOLD LOOKS LIKE, stated before the numbers so the sweep
// cannot be read backwards into a justification:
//
//   1. It must sit far above settle dither. A die that has passed the freeze
//      gate moved under 0.02 of a die-width in 0.45 s — about 0.06 units/s —
//      and the shipped velocity bar is 0.224 units/s. Anything above ~1 is
//      clear of that by an order of magnitude.
//   2. It must sit far below real tumble. Gravity is 110 and dice spawn above
//      the table, so a die arrives at tens of units/s.
//   3. The anchor must land BEFORE the throw ends, with enough film left for
//      the ramp to be worth having — an anchor at 98% of the duration means
//      the curve never engages and the whole mechanism is decoration.
//   4. And it must not be a cliff: if the anchor moves wildly between
//      neighbouring thresholds, the parameter is riding noise.
//
// The last-crossing rule means a NUDGE — a die hurled back into the air at
// lift 7 — pushes the anchor out to the hop. That is intended (a hurled die is
// flying), but it makes 7 a distinguished value: a threshold above it ignores
// the hop, one below it waits for it out. Both readings are printed.
//
// AND IT MUST BE SWEPT TWICE. The anchor is a fraction of the PLAYED duration,
// and the displacement terminator cuts that duration by a third to a half — so
// "how much of the throw runs at flight" is a different question before and
// after it. Pass `disp` to arm the candidate terminator for the sweep.
//
//   node tools/drive.mjs tools/steps/tempo-anchor.mjs [seeds] [speeds] [disp]

const POOLS = [
  ['1d20', ['d20']],
  ['soul', ['d8', 'd8', 'd4', 'd6']],
  ['8d6', Array(8).fill('d6')],
  ['20d6', Array(20).fill('d6')],
];

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

export default async function run(stage, [seedCount = '8', speedArg = '2,4,5,6,8,12', disp = '']) {
  const n = Number(seedCount);
  const speeds = speedArg.split(',').map(Number);
  const a = await stage.tab('localhost', 'Anchor');
  if (disp === 'disp') {
    await a.dbg('setSettleGate({"mode":"displacement","eps":0.02})');
    await a.dbg('setBodyFlags({"allowSleep":false})');
    console.log(`terminator ARMED: ${JSON.stringify(await a.dbg('settleGate'))}`
      + ` bodyFlags ${JSON.stringify(await a.dbg('bodyFlags'))}`);
  }
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7919);
  console.log(`tempo curve (inert): ${JSON.stringify(await a.dbg('tempoCurve'))}\n`);

  const got = new Map(); // "speed|pool" -> { frac, anchor, dur, never, nudged }

  for (const speed of speeds) {
    await a.dbg(`setTempoCurve({"anchorSpeed":${speed}})`);
    for (const [pname, types] of POOLS) {
      const rows = [];
      for (const seed of seeds) {
        await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
        await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
          { desc: `${pname}/${seed} @ ${speed}`, timeout: 60000 });
        const p = await a.dbg('settleProfile()');
        rows.push(p);
        await a.dbg('clearTable()');
        await a.dbg('sim(60)');
      }
      got.set(`${speed}|${pname}`, {
        anchor: mean(rows.map((r) => r.tempoAnchor)),
        dur: mean(rows.map((r) => r.duration)),
        frac: mean(rows.map((r) => (r.duration > 0 ? r.tempoAnchor / r.duration : 0))),
        // Throws where the anchor is the very end of the film: the curve never
        // engages and the mechanism is decoration on that throw.
        never: rows.filter((r) => r.duration > 0 && r.tempoAnchor / r.duration > 0.9).length,
        nudged: mean(rows.map((r) => r.nudged)),
      });
    }
    console.log(`  … anchorSpeed ${speed} done`);
  }
  await a.dbg('setTempoCurve({"anchorSpeed":6})');

  console.log(`\nanchor as a FRACTION of the played duration — how much of the throw`
    + ` runs at \`flight\`.\n  Low is a curve that engages early; >0.9 means it never`
    + ` engages at all ("late" counts those)\n`);
  table(['anchorSpeed', ...POOLS.map(([p]) => `${p} frac/late`)],
    speeds.map((s) => [s, ...POOLS.map(([p]) => {
      const r = got.get(`${s}|${p}`);
      return `${r.frac.toFixed(2)} ${r.never}/${n}`;
    })]));

  console.log(`\nanchor in film seconds, against the played duration\n`);
  table(['anchorSpeed', ...POOLS.map(([p]) => `${p} anchor/dur`)],
    speeds.map((s) => [s, ...POOLS.map(([p]) => {
      const r = got.get(`${s}|${p}`);
      return `${r.anchor.toFixed(2)}/${r.dur.toFixed(2)}`;
    })]));

  console.log(`\nSTABILITY — how far the anchor fraction moves between neighbouring`
    + ` thresholds.\n  A parameter riding noise shows a cliff here; a real`
    + ` phase boundary shows a plateau\n`);
  table(['step', ...POOLS.map(([p]) => `${p} Δfrac`)],
    speeds.slice(1).map((s, i) => [`${speeds[i]}→${s}`, ...POOLS.map(([p]) => {
      const d = got.get(`${s}|${p}`).frac - got.get(`${speeds[i]}|${p}`).frac;
      return `${d >= 0 ? '+' : ''}${d.toFixed(3)}`;
    })]));
}
