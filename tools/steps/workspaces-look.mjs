/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'127.0.0.141',name:'Alice'});
  const size=(width,height,mobile=false)=>a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},a.page.sessionId);
  await size(1440,900);
  const others=[]; for(const name of ['Bram','Cora','Dev']) others.push(await stage.ctx.rawPlayer(name));
  await a.dbg('openSettings("table")');
  await a.eval(`(()=>{const i=document.getElementById('set-table-name');i.value='The Copper Lantern';i.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('table-edit-apply').click();})()`);
  await a.waitFor(`window.__diceDebug.settings.tableName==='The Copper Lantern'`);
  await a.eval(`document.getElementById('settings-close').click()`);
  for(const p of others) { await stage.ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'}); await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(p.name)}`); await a.settle(); }
  await a.roll('2d6+3');
  await a.dbg('workspaces.open("tables")'); console.log(await stage.shot(a,'workspaces-tables-desktop.png'));
  await a.dbg('workspaces.open("dice")'); console.log(await stage.shot(a,'workspaces-dice-desktop.png'));
  await a.dbg('workspaces.open("people")'); console.log(await stage.shot(a,'workspaces-people-desktop.png'));
  await a.dbg('workspaces.close()');
  await size(390,844,true); await a.emulateCoarsePointer(true);
  await a.eval(`localStorage.removeItem('dice.panels.v1')`); await a.reload();
  await a.dbg('holdClock(true)'); await a.dbg(`commandRoll('3d6')`);
  await a.waitFor('window.__diceDebug.currentRoll && !window.__diceDebug.currentRoll.done');
  for (const n of [1,5,6,8]) { await a.dbg(`sim(${n})`); console.log('flight-sample',await a.dbg('phoneFrame()')); }
  console.log('flight',await a.dbg('phoneFrame()'));
  console.log(await stage.shot(a,'workspaces-phone-flight.png'));
  await a.settle();
  console.log('rest',await a.dbg('phoneFrame()'));
  console.log(await stage.shot(a,'workspaces-phone-table.png'));
  await a.dbg('workspaces.open("dice")'); console.log(await stage.shot(a,'workspaces-phone-dice.png'));
  await a.dbg('workspaces.close()'); console.log('return',await a.dbg('phoneFrame()'));
  console.log(await stage.shot(a,'workspaces-phone-return.png'));
  await a.dbg('workspaces.open("people")'); console.log(await stage.shot(a,'workspaces-phone-people.png'));
}
