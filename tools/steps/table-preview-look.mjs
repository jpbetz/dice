/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice',query:'&stability=stable'});
  await a.roll('2d6');
  for(const [name,width,height,mobile] of [['desktop',1440,900,false],['phone',390,844,true]]) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},a.page.sessionId);
    await a.emulateCoarsePointer(mobile);
    await a.dbg('openSettings("staging")');
    await a.eval(`document.querySelector('[data-venue="copper"]').click()`);
    await a.waitFor(`window.__diceDebug.tablePreview?.status==='ready'`);
    console.log(await stage.shot(a,`table-preview-${name}.png`));
    await a.dbg('closeSettingsModal()');
  }
}
