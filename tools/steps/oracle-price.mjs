/*
 * Copyright 2026 The Dice Table Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// PRICE THE ORACLE CAMERA BEFORE BUILDING IT (immersion Wave 2, docs/IMMERSION.md
// item 5). The slate claims framing the settled cluster makes dice bigger. C25
// measured the neighbouring question — what the shelf cost the view — and got
// 1.00× on a phone, which reads as "framing buys nothing." That reading may not
// transfer, because the two fits differ in a way that decides the answer:
//
//   fitCameraTo scans 1 + i*0.03, so it can only ever pull the eye BACK from
//   the preset. Any subset of the MAT can therefore only stop the retreat
//   earlier — never approach. On a desktop the mat already fits at the preset,
//   so ~1.00× was the only answer available.
//
//   oracleProbe fits the SETTLED DICE and allows the eye closer than the
//   preset, which is the only way three dice ever fill a phone screen.
//
// The cost is cropping the mat, and it is payable here and nowhere else: these
// dice have already stopped, and playRoll knows every final pose before frame
// one, so the AABB contains every die BY CONSTRUCTION. It crops the mat; it
// cannot crop a die. Framing mid-tumble carries no such guarantee.
//
// If the gains come back inside noise, the "bigger dice" half of item 5 gets
// struck from the doc rather than quietly built, and the item re-founds on
// attention — centred, legible, the deciding die held alone — which needs no
// pixels to justify it.
//
//   node tools/drive.mjs tools/steps/oracle-price.mjs

const VIEWPORTS = [
  { name: 'desktop 1600, panels', w: 1600, h: 1000, mini: false },
  { name: 'desktop 1440, rail', w: 1440, h: 900, mini: true },
  { name: 'phone 390, rail', w: 390, h: 844, mini: true },
];

// The pools a real table throws. The trio is Soul Deal's canonical
// attribute+skill+motivation; 40d6 is the documented worst case.
const POOLS = [
  { label: '1d20', notation: '1d20' },
  { label: 'trio (d8+d6+d10)', notation: '1d8+1d6+1d10' },
  { label: '6d6', notation: '6d6' },
  { label: '20d6', notation: '20d6' },
  { label: '40d6', notation: '40d6' },
];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Price');
  await a.dbg('setAutoCollectMs(0)'); // a collect would take the dice away mid-probe

  const rows = [];
  for (const vp of VIEWPORTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await a.dbg("setZoom('medium')"); // pin the DEFAULT — dice.zoom.v1 is per-origin and outlives a run
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));

    for (const pool of POOLS) {
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await a.roll(pool.notation);
      await a.dbg('sim(9000)'); // settle everything, including a SETTLE_CAP pool
      const r = JSON.parse(await a.eval(
        'JSON.stringify(window.__diceDebug.oracleProbe())'));
      rows.push({ vp: vp.name, pool: pool.label, ...r });
      console.log(
        `  ${vp.name.padEnd(22)} ${pool.label.padEnd(16)} `
        + `n=${String(r.dice).padStart(2)} `
        + `today=${String(r.today.span).padStart(3)}px `
        + `framed=${String(r.framed ? r.framed.span : 0).padStart(4)}px `
        + `gain=${r.gain ? r.gain.toFixed(2) : '—'}× `
        + `scale=${r.usedScale ?? 'NOFIT'} `
        + `camY ${r.today.camY}->${r.framed ? r.framed.camY : '—'} `
        + `cluster=${r.cluster ? `${r.cluster.w}x${r.cluster.d}` : '—'}`);
    }
  }

  // The two readings that decide the item.
  const phone = rows.filter((r) => r.vp.startsWith('phone') && r.gain);
  const small = rows.filter((r) => /1d20|trio/.test(r.pool) && r.gain);
  const fmt = (xs) => xs.length
    ? `${Math.min(...xs.map((r) => r.gain)).toFixed(2)}–${Math.max(...xs.map((r) => r.gain)).toFixed(2)}×`
    : 'n/a';
  console.log('');
  console.log(`  PHONE, every pool  : ${fmt(phone)}`);
  console.log(`  SMALL POOLS, all viewports: ${fmt(small)}`);
  console.log('');
  console.log('  A gain near 1.00× everywhere means the "bigger dice" claim is dead and');
  console.log('  item 5 must re-found on attention. A gain that needs usedScale < 1 means');
  console.log('  it is real but is BOUGHT BY CROPPING THE MAT — a decision, not a free win.');

  return rows;
}
