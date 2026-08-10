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

// C25 Stage 1, to be LOOKED AT: what a table with five collected rolls looks
// like now, on a desktop and on a phone, with the record open and a card up.
// The before-picture is tools/out/shelf-full-*.png from shelf-fit.mjs — five
// rolls fused into one slab across the whole mat.
//
//   node tools/drive.mjs tools/steps/c25-look.mjs

const SHOTS = [
  { name: 'desktop', w: 1600, h: 1000, mini: false },
  { name: 'phone', w: 390, h: 844, mini: true },
];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Look');

  for (const vp of SHOTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));

    await a.dbg('clearTable()');
    await a.dbg('setLogFlyout(false)');
    // Five collected rolls — the exact load that used to fuse into one slab.
    const ids = [];
    for (let i = 0; i < 5; i++) {
      await a.roll('2d8[Wisdom]+1d6');
      const rid = await a.rollId();
      ids.push(rid);
      await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
      await a.waitFor(`(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === ${i + 1})`,
        { desc: `${vp.name}: collected ${i + 1}` });
    }
    await a.roll('3d6'); // …and one live roll on top of them
    await a.dbg('sim(120)');
    console.log(`${vp.name}: felt holds ${await a.diceCount()} dice, record holds `
      + `${(await a.shelf()).length} rolls`);
    console.log('  ' + await stage.shot(a, `c25-${vp.name}-felt.png`));

    // The record open, and a card up from one of its rows.
    await a.dbg('setLogFlyout(true)');
    await a.dbg('sim(30)');
    await a.eval(`(() => {
      const rows = document.querySelectorAll('#log-list .log-entry.collected');
      if (rows.length) rows[Math.min(1, rows.length - 1)].click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    const ps = await a.dbg('peekState');
    console.log(`  card open: ${!!ps} at ${ps ? JSON.stringify(ps.rect) : '—'}`);
    console.log('  ' + await stage.shot(a, `c25-${vp.name}-card.png`));
  }
}
