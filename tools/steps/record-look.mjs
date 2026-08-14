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

// C25 Stage 2 (§7.39), TO BE LOOKED AT: what a put-away roll looks like AT
// REST. Stage 1's own note says the hole it left is that with the log CLOSED
// a collected roll has no presence at all — so half of these frames are of a
// closed panel, and the ≣ is crop-zoomed because a three-pixel spine cannot
// be judged in a 1600px screenshot.
//
//   node tools/drive.mjs tools/steps/record-look.mjs
//
// Two players (two colours) so attribution has something to attribute — the
// under-glow ring this replaces was unreadable precisely because two rollers
// differed by ~10/255 (C13).

// A clipped, magnified shot — Page.captureScreenshot's own `clip`, which the
// harness's screenshot() does not expose.
async function crop(table, path, clip, scale = 5) {
  const { writeFileSync } = await import('node:fs');
  const { data } = await table.page.browser.send('Page.captureScreenshot',
    { format: 'png', clip: { ...clip, scale } }, table.page.sessionId);
  writeFileSync(path, Buffer.from(data, 'base64'));
  return path;
}

const railBox = (table) => table.eval(`(() => {
  const r = document.getElementById('rail-log').getBoundingClientRect();
  return { x: Math.max(0, r.left - 10), y: Math.max(0, r.top - 8),
           width: r.width + 20, height: r.height + 16 };
})()`);

const headBox = (table) => table.eval(`(() => {
  const r = document.getElementById('log-flyout').getBoundingClientRect();
  return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6),
           width: r.width + 12, height: Math.min(r.height + 12, 190) };
})()`);

async function shots(stage, a, tag) {
  // closed: the spine is the ONLY presence a put-away roll has
  await a.dbg('setLogFlyout(false)');
  await a.dbg('sim(20)');
  console.log(`  ${tag}: spoken = ${JSON.stringify((await a.dbg('record')).spoken)}`);
  console.log('  ' + await stage.shot(a, `rec-${tag}-closed.png`));
  console.log('  ' + await crop(a, stage.out(`rec-${tag}-spine.png`), await railBox(a)));
  // open: the same object at the scale the flyout affords
  await a.dbg('setLogFlyout(true)');
  await a.dbg('sim(20)');
  console.log('  ' + await stage.shot(a, `rec-${tag}-open.png`));
  console.log('  ' + await crop(a, stage.out(`rec-${tag}-head.png`), await headBox(a), 3));
}

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Nessa');
  const b = await stage.tab('127.0.0.1', 'Corvin');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.eval('window.dispatchEvent(new Event("resize"))');
  await new Promise((r) => setTimeout(r, 250));

  // ① EMPTY — nothing put away. The spine must not draw a socket for rolls
  //    that are not there; the strip must not reserve a band.
  await shots(stage, a, 'empty');

  // ② ONE put-away roll.
  const put = async (tab, notation) => {
    await tab.roll(notation);
    const rid = await tab.rollId();
    await tab.dbg(`collectRoll(${JSON.stringify(rid)})`);
    await a.waitFor(`(window.__diceDebug.sim(240), window.__diceDebug.shelf.some((s) => s.rollId === ${JSON.stringify(rid)}))`,
      { desc: `put away ${notation}` });
    return rid;
  };
  await a.dbg('setLogFlyout(false)');
  await put(a, '2d8[Wisdom]+1d6 dc12');
  await shots(stage, a, 'one');

  // ③ FIVE — the record's cap, two rollers, so the colours have to separate.
  await a.dbg('setLogFlyout(false)');
  await put(b, '3d6 # Corvin swings');
  await put(a, '1d20+4 dc15');
  await put(b, '4d6dl1');
  await put(a, '2d10');
  await shots(stage, a, 'five');

  // ④ A HELD ROLL AWAITING ITS REVEAL — the read C13 says was shipped to
  //    screen readers and to nobody else. Nessa rolls it, so Nessa is the
  //    one it is waiting on and A is the tab we photograph.
  await a.dbg('setLogFlyout(false)');
  await put(a, '1d20+2 held # The Duel');
  const rec = await a.dbg('record');
  console.log(`  held: awaiting = ${rec.ranks.filter((r) => r.awaiting).length}, `
    + `spoken = ${JSON.stringify(rec.spoken)}`);
  await shots(stage, a, 'held');
  // …and the card that Reveal lives in, opened from its rank.
  await a.dbg('setLogFlyout(true)');
  const waiting = (await a.dbg('record')).ranks.filter((r) => r.awaiting)[0];
  if (waiting) await a.dbg(`anchorRecord(${JSON.stringify(waiting.rollId)})`);
  await new Promise((r) => setTimeout(r, 250));
  console.log(`  card: ${JSON.stringify((await a.dbg('peekState') || {}).total ?? null)}`);
  console.log('  ' + await stage.shot(a, 'rec-held-card.png'));

  // ⑤ THE FIND BOX doing its job on the same record.
  await a.dbg(`setLogFind('corvin')`);
  await new Promise((r) => setTimeout(r, 150));
  console.log(`  find: ${JSON.stringify(await a.dbg('logFind'))}`);
  console.log('  ' + await stage.shot(a, 'rec-find.png'));
  console.log('  ' + await crop(a, stage.out('rec-find-head.png'), await headBox(a), 3));
  await a.dbg(`setLogFind('')`);

  // ⑥ 390px PHONE. body.mini, the panel collapsed — the width C25 named as
  //    the reason the felt shelf had to go, and the one the sketch's bottom
  //    strip could not have survived.
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: false }, a.page.sessionId);
  await a.dbg('setPanelState({pools: false, log: false})');
  await a.eval('window.dispatchEvent(new Event("resize"))');
  await new Promise((r) => setTimeout(r, 350));
  await shots(stage, a, 'phone');
  // …and a live roll UNDER an open card, which is where body.mini's banner
  // used to cut across the peek (U20).
  await a.dbg('setLogFlyout(true)');
  await a.roll('2d6');
  await a.settle();
  await a.dbg('sim(60)');
  const rows = (await a.dbg('record')).ranks;
  if (rows.length) await a.dbg(`anchorRecord(${JSON.stringify(rows[rows.length - 1].rollId)})`);
  await new Promise((r) => setTimeout(r, 300));
  const ps = await a.dbg('peekState');
  // U20 claimed "in body.mini the banner's top edge cuts into the peek".
  // Print all three boxes rather than trusting it: post-C25 the card anchors
  // to a log ROW, and the flyout (--z-flyout) already covers the banner
  // (--z-banner) on a phone, so the two may no longer share a band at all.
  const boxes = await a.eval(`(() => {
    const g = (id) => { const e = document.getElementById(id);
      if (!e || e.classList.contains('hidden')) return null;
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
    return { banner: g('result-banner'), flyout: g('log-flyout'), card: g('peek-card') };
  })()`);
  console.log(`  phone card: ${ps ? JSON.stringify(ps.rect) : 'none'}`);
  console.log(`  phone boxes: ${JSON.stringify(boxes)}`);
  console.log('  ' + await stage.shot(a, 'rec-phone-card.png'));
}
