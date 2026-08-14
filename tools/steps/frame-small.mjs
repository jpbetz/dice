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

// THE ROLL IN BETWEEN (ROADMAP C27's residual). The framing ladder answers the
// two ends of the pool range on a phone — a lone d20 and a forty-die heap — and
// the canonical Soul Deal roll in the middle gained nothing from it. This
// measures the middle: die span in px, which rung the ladder settled on, and
// how many dice are actually on screen, at a fixed seed per pool so a before
// and an after are the SAME THROW rather than two samples of a distribution.
//
//   spanPx      framingInfo()'s die span — the project's standard "how big are
//               the dice" unit (NDC delta x viewport width, so it is 2x CSS px
//               per world unit; the C27 tables are in it and so is matFit).
//   mode        which rung: mat / dice / dice-cropped / deciding / mat-overflow
//   scale       how far along its own eye ray the camera ended up, as a
//               multiple of the preset distance. < 1 means it APPROACHED,
//               which shipped framing could not do before this item.
//   oracle      what oracleProbe says an unbounded cluster fit would give —
//               the ceiling this item is chasing.
//
//   node tools/drive.mjs tools/steps/frame-small.mjs
//   node tools/drive.mjs tools/steps/frame-small.mjs desktop   # every viewport

const VIEWPORTS = [
  { name: 'phone 390', w: 390, h: 844, mini: true, always: true },
  { name: 'phone 360', w: 360, h: 780, mini: true },
  { name: 'ipad-p 834', w: 834, h: 1112, mini: true },
  { name: 'desktop 1600', w: 1600, h: 1000, mini: false },
];

// The pools C27 names, plus the two it says already work, so a regression at
// either end is visible in the same table as the win in the middle.
const POOLS = [
  { label: '1d20', types: ['d20'], seed: 7001 },
  { label: '3d6', types: ['d6', 'd6', 'd6'], seed: 7002 },
  { label: 'trio d8+d6+d10', types: ['d8', 'd6', 'd10'], seed: 7003 },
  { label: '6d6', types: Array(6).fill('d6'), seed: 7004 },
  { label: '12d6', types: Array(12).fill('d6'), seed: 7005 },
  { label: '20d6', types: Array(20).fill('d6'), seed: 7006 },
  { label: '40d6', types: Array(40).fill('d6'), seed: 7007 },
];

export default async function run(stage, args = []) {
  const all = args.includes('desktop') || args.includes('all');
  const views = VIEWPORTS.filter((v) => all || v.always);
  const zoom = (args.find((a) => /^(wide|medium|close)$/.test(a))) || 'medium';
  const a = await stage.tab('localhost', 'Frame');

  const rows = [];
  for (const vp of views) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await a.dbg(`setZoom(${JSON.stringify(zoom)})`); // dice.zoom.v1 is per-origin and outlives a run
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));

    for (const pool of POOLS) {
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await a.dbg(`throwSeeded(${JSON.stringify(pool.types)}, ${pool.seed})`);
      await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${vp.name} ${pool.label}`, timeout: 40000 });
      await a.dbg('sim(600)');
      const f = await a.dbg('framingInfo()');
      const o = await a.dbg('oracleProbe()');
      rows.push({
        view: vp.name,
        pool: pool.label,
        mode: f.mode,
        span: f.spanPx,
        scale: f.camScale === undefined ? '—' : f.camScale,
        on: `${f.diceOnScreen}/${f.dice}`,
        hero: f.decidingOnScreen === false ? 'CROPPED' : 'ok',
        orbit: f.orbit ? 'turned' : '',
        oracle: o.framed ? `${o.framed.span} (${o.usedScale ?? 'NOFIT'})` : '—',
      });
    }
  }

  await a.dbg('setPanelState({pools: true, log: true})');
  await a.dbg("setZoom('medium')");

  const head = ['viewport', 'pool', 'rung', 'spanPx', 'scale', 'on screen', 'deciding', 'orbit', 'oracle span (scale)'];
  const w = head.map((h, i) => Math.max(h.length,
    ...rows.map((x) => String(Object.values(x)[i]).length)));
  const line = (c) => c.map((v, i) => String(v).padEnd(w[i])).join('  ');
  console.log('');
  console.log(`  zoom=${zoom}, one fixed seed per pool (paired across runs)`);
  console.log('');
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  for (const x of rows) console.log(line(Object.values(x)));
  console.log('');
  console.log('  A rung of `dice` at scale 1.00 is the residual: the frame RECENTRED on the');
  console.log('  dice and did not resize, because fitCameraTo only ever pulled the eye BACK.');
  return rows;
}
