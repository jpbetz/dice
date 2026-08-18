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

// PRICE THE TWO LEVERS BEFORE MOVING EITHER (C27's residual). The first
// measurement of the middle of the pool range (tools/steps/frame-small.mjs)
// refuted the obvious diagnosis: the ladder does NOT decline to act for three
// dice on a phone — it acts, reaches rung 2, and then RETREATS to 2.5x the
// preset to get a landscape cluster into a 278px-wide column. So "let the eye
// come closer than the preset" cannot be the fix on the device that needs one:
// the eye is already 2.5x the wrong side of it.
//
// Two levers are left, and this prices both on the same settled throw:
//
//   ORBIT   turn the table a quarter so the cluster's long axis runs down the
//           tall screen. Already shipped, gated on "portrait saves dice from
//           being cropped" — which three dice never trigger, because nothing
//           is being cropped.
//   FLOOR   let the dice rung's scan start below the preset. Helps only where
//           the retreat was not needed at all.
//
//   node tools/drive.mjs tools/steps/frame-price.mjs
//
// TWO THINGS ABOVE ARE OUT OF DATE SINCE `preferDice` SHIPPED ON (2026-08-18),
// and they are corrected rather than deleted because three cells of this grid
// were once quoted as `preferDice` numbers and cost two days. (1) ORBIT is no
// longer gated on cropping alone: with the mat conceded the tie-break is
// completeness THEN SIZE, and desktop 3d6 turns on 2 of 5 seeds. (2) the
// `shipped` column below now reads the DICE-PREFERRING frame, because that is
// what ships. **Every cell of this grid is still UNGATED** — it says what rung 2
// would give if nothing judged it, which is not what any player sees. For a
// number somebody will quote, run `frame-residual.mjs`.

const VIEWPORTS = [
  { name: 'phone 390', w: 390, h: 844, mini: true },
  { name: 'phone 360', w: 360, h: 780, mini: true },
  { name: 'ipad-p 834', w: 834, h: 1112, mini: true },
  { name: 'desktop 1600', w: 1600, h: 1000, mini: false },
];

const POOLS = [
  { label: '1d20', types: ['d20'], seed: 7001 },
  { label: '3d6', types: ['d6', 'd6', 'd6'], seed: 7002 },
  { label: 'trio', types: ['d8', 'd6', 'd10'], seed: 7003 },
  { label: '6d6', types: Array(6).fill('d6'), seed: 7004 },
  { label: '12d6', types: Array(12).fill('d6'), seed: 7005 },
  { label: '20d6', types: Array(20).fill('d6'), seed: 7006 },
  { label: '40d6', types: Array(40).fill('d6'), seed: 7007 },
];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Price');
  const rows = [];

  for (const vp of VIEWPORTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await a.dbg("setZoom('medium')");
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));

    for (const pool of POOLS) {
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await a.dbg(`throwSeeded(${JSON.stringify(pool.types)}, ${pool.seed})`);
      await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${vp.name} ${pool.label}`, timeout: 40000 });
      await a.dbg('sim(600)');
      const shipped = await a.dbg('framingInfo()');
      const p = await a.dbg('framingProbe()');
      const cell = (o, f) => {
        const c = p.cases.find((x) => x.orbit === o && x.from === f);
        return c ? `${String(c.span).padStart(3)}${c.fits ? '' : '!'}/${c.on}` : '—';
      };
      rows.push({
        view: vp.name,
        pool: pool.label,
        cluster: `${p.cluster.w}x${p.cluster.d}`,
        shipped: `${shipped.spanPx} ${shipped.mode}${shipped.orbit ? '/turned' : ''}`,
        land1: cell('landscape', 1),
        landF: cell('landscape', 0.55),
        port1: cell('portrait', 1),
        portF: cell('portrait', 0.55),
      });
    }
  }

  await a.dbg('setPanelState({pools: true, log: true})');

  const head = ['viewport', 'pool', 'cluster', 'shipped', 'land 1.0', 'land .55', 'port 1.0', 'port .55'];
  const w = head.map((h, i) => Math.max(h.length,
    ...rows.map((x) => String(Object.values(x)[i]).length)));
  const line = (c) => c.map((v, i) => String(v).padEnd(w[i])).join('  ');
  console.log('');
  console.log('  cells are  spanPx/diceOnScreen ;  "!" = the scan never fitted the cluster');
  console.log('');
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  for (const x of rows) console.log(line(Object.values(x)));
  return rows;
}
