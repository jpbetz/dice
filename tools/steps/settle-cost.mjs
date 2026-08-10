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

// HOW LONG DOES A THROW TAKE, AND WHAT IS THE TAIL MADE OF?
//
// playRoll fast-forwards the whole throw offline, then plays the keyframes
// back at 1x. `duration` is therefore the exact length of the animation the
// user watches, decided by ONE number: the frame the LAST die stopped on
// (`motionFrames = lastLanding.frame`). So the watch time is a MAX over dice
// — one die that keeps creeping holds the whole table open.
//
// The columns that matter:
//   first    when the earliest die stopped
//   dur      the played window = when the last die stopped
//   spread   dur - first: the stretch where most dice are already done and
//            you are waiting on stragglers. This is the "awkward" part.
//   timeout  dice that NEVER went still and were force-frozen at SETTLE_CAP.
//            Nonzero means the tail is contact jitter, not tumbling.
//   nudges   cocked dice re-thrown (each one restarts a tumble)
//
//   node tools/drive.mjs tools/steps/settle-cost.mjs [reps]

const POOLS = [
  '1d20', '2d6', '3d6', '4d6', '2d8+1d4+1d6',
  '6d6', '8d6', '10d6', '1d4', '4d4', '20d6',
];

export default async function run(stage, [reps = '5']) {
  const n = Number(reps);
  const a = await stage.tab('localhost', 'Settle');
  await a.dbg('setBannerRetireMs(0)');

  const rows = [];
  for (const pool of POOLS) {
    const runs = [];
    for (let i = 0; i < n; i++) {
      await a.roll(pool);
      runs.push(await a.dbg('settleProfile()'));
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');
    }
    const avg = (f) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
    const max = (f) => Math.max(...runs.map(f));
    rows.push({
      pool: pool.padEnd(12),
      dice: runs[0].dice,
      first: avg((r) => r.firstSettleS).toFixed(2),
      dur: avg((r) => r.duration).toFixed(2),
      durMax: max((r) => r.duration).toFixed(2),
      spread: avg((r) => r.settleSpreadS).toFixed(2),
      timeout: `${runs.filter((r) => r.timedOut).length}/${n}`,
      nudges: max((r) => r.nudged),
    });
  }

  const head = ['pool', 'dice', 'first', 'dur avg', 'dur max', 'spread', 'timed out', 'nudges'];
  const w = head.map((h, i) => Math.max(h.length,
    ...rows.map((r) => String(Object.values(r)[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ');
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(Object.values(r)));
}
