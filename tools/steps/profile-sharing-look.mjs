/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice'});
  await stage.ctx.rawPlayer('Bram'); await stage.ctx.rawPlayer('Cora'); await stage.ctx.rawPlayer('Dev');
  await a.dbg(`profiles.copyFrom({name:'Campaign hero',system:'none',pools:[{name:'Attack',notation:'1d20'}]},false)`);
  await a.dbg(`profiles.copyFrom({name:'My experiments',system:'none',pools:[{name:'Test',notation:'3d8'}]},false)`);
  const id=(await a.dbg('profiles.list')).find(p=>p.name==='Campaign hero').id;
  await a.dbg(`profiles.share('${id}',true)`); await a.dbg('publishPools()');
  await a.roll('2d6');
  for(const [device,width,height,mobile] of [['desktop',1440,900,false],['phone',390,844,true]]) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},a.page.sessionId);
    await a.emulateCoarsePointer(mobile);
    await a.dbg('openSettings("stuff")');
    console.log(await stage.shot(a,`profile-sharing-${device}.png`));
    await a.eval(`document.getElementById('settings-close').click()`);
  }
}
