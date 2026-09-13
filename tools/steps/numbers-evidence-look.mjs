/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// node tools/drive.mjs tools/steps/numbers-evidence-look.mjs
export default async function run(stage) {
  const a = await stage.ctx.newTable({origin:'localhost',name:'Alice'});
  for (const [name,width,height] of [['desktop',1440,900],['phone',390,844]]) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      {width,height,deviceScaleFactor:1,mobile:name==='phone'},a.page.sessionId);
    await a.emulateCoarsePointer(name==='phone');
    await a.dbg("setDiceSet('symbols.monster')");
    await a.dbg('throwSeeded(["d6","d6","d6"], 4242, [1,4,6])');
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)');
    await a.dbg('sim(240)');
    console.log(await stage.shot(a,`numbers-symbols-${name}.png`));
    await a.dbg("setDiceSet('std')");
    await a.dbg('clearTable()');
    for (let tries=0; tries<30; tries++) {
      await a.roll('6d6 push>=5');
      const state=await a.dbg(`pushState(${JSON.stringify(await a.rollId())})`);
      if (state.scoredChips) break;
      await a.dbg('clearTable()');
    }
    console.log(await stage.shot(a,`numbers-push-${name}.png`));
    await a.dbg('clearTable()');
  }
}
