/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
export default async function run(stage){
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice'});
  const others=[];for(const name of ['Bram','Cora','Dev'])others.push(await stage.ctx.rawPlayer(name));
  await a.dbg("setVenue('navigation')");await a.waitFor("window.__diceDebug.tableDesign.activeId==='navigation'");
  for(const p of others){await stage.ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'});await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(p.name)}`);await a.settle();}
  await a.roll('2d6');await a.dbg('holdClock(true)');await a.dbg("commandRoll('3d6')");await a.waitFor('window.__diceDebug.currentRoll&&!window.__diceDebug.currentRoll.done');
  for(const p of others)await stage.ctx.api('/api/roll',{playerId:p.playerId,notation:'3d6'});
  await stage.ctx.api('/api/roll',{playerId:others[0].playerId,notation:'1d20'});
  await a.waitFor('window.__diceDebug.tableResults.rows.reduce((n,r)=>n+r.queued,0)===4');await a.waitFor('!window.__diceDebug.filmWorker.baking');await a.dbg('sim(10)');
  for(const [name,width,height,mobile] of [['desktop',1440,900,false],['phone',390,844,true]]){
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},a.page.sessionId);await a.emulateCoarsePointer(mobile);
    console.log(await stage.shot(a,`roll-arrivals-${name}.png`));
  }
  await a.settle();console.log(await stage.shot(a,'roll-arrivals-phone-complete.png'));
}
