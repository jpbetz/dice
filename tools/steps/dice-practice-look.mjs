/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// node tools/drive.mjs tools/steps/dice-practice-look.mjs
export default async function run(stage) {
  const a = await stage.ctx.newTable({origin:'localhost',name:'Alice',query:'&stability=stable'});
  await stage.ctx.rawPlayer('Bram'); await stage.ctx.rawPlayer('Cora'); await stage.ctx.rawPlayer('Dev');
  await a.roll('2d6+3');
  for (const [name,width,height,touch] of [['desktop',1440,900,false],['phone',390,844,true]]) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch},a.page.sessionId);
    await a.emulateCoarsePointer(touch);
    await a.dbg('openDiceGallery(null)');
    await a.eval(`document.querySelector('.dg-card[data-set="tidewrack.seaglass"]').click();document.querySelector('.dg-practice').click()`);
    await a.waitFor('window.__diceDebug.diceGallery.practice?.rolling');
    console.log(await stage.shot(a,`dice-practice-${name}-tumble.png`));
    await a.waitFor('window.__diceDebug.diceGallery.practice && !window.__diceDebug.diceGallery.practice.rolling',{timeout:12000});
    console.log(await stage.shot(a,`dice-practice-${name}-rest.png`));
    console.log(JSON.stringify(await a.dbg('diceGallery')));
    await a.eval(`document.querySelector('.dg-close').click()`);
  }
}
