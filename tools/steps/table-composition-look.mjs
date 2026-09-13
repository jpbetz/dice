/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice'});
  await a.dbg("setVenue('copper')");
  await a.waitFor("window.__diceDebug.tableDesign.status==='ready'",{timeout:15000});
  const others=[];
  for(const name of ['Bram','Cora','Dev']) others.push(await stage.ctx.rawPlayer(name));
  for(const [name,width,height,mobile] of [['desktop',1440,900,false],['phone',390,844,true]]) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},a.page.sessionId);
    await a.emulateCoarsePointer(mobile);
    for(const p of others) {
      await stage.ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'});
      await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(p.name)}`);await a.settle();
    }
    await a.roll('2d6+3');
    console.log(await stage.shot(a,`copper-table-${name}.png`));
    console.log(name,JSON.stringify(await a.dbg('tableDesign')));
  }
}
