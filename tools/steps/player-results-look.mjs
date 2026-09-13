/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assertResultLayout} from '../../tests/e2e/player-results.mjs';
export default async function run(stage){
  const a=await stage.ctx.newTable({origin:'127.0.0.145',name:'Alice'});
  const size=(width,height,mobile=false)=>a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},a.page.sessionId);
  await size(1440,900);
  await a.dbg('openSettings("table")');
  await a.eval(`(()=>{const i=document.getElementById('set-table-name');i.value='The Copper Lantern';i.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('table-edit-apply').click();})()`);
  await a.waitFor(`window.__diceDebug.settings.tableName==='The Copper Lantern'`);await a.eval(`document.getElementById('settings-close').click()`);
  const others=[];for(const name of ['Bram','Cora','Dev'])others.push(await stage.ctx.rawPlayer(name));
  for(const p of others){await stage.ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'});await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(p.name)}`);await a.settle();}
  await a.roll('4d6kh3+2');console.log('desktop',await assertResultLayout(a));
  console.log(await stage.shot(a,'player-results-desktop-four.png'));
  await a.dbg('workspaces.open("people")');console.log(await stage.shot(a,'player-results-desktop-people.png'));await a.dbg('workspaces.close()');
  await size(390,844,true);await a.emulateCoarsePointer(true);await a.eval(`localStorage.removeItem('dice.panels.v1')`);await a.reload();
  console.log('phone',await assertResultLayout(a,true));console.log(await stage.shot(a,'player-results-phone-four.png'));
  await a.dbg('holdClock(true)');await a.dbg(`commandRoll('3d6')`);await a.waitFor('window.__diceDebug.currentRoll && !window.__diceDebug.currentRoll.done');
  for(const n of [1,5,6,8]){await a.dbg(`sim(${n})`);console.log('flight',await a.dbg('phoneFrame()'));}
  console.log(await stage.shot(a,'player-results-phone-flight.png'));await a.settle();
  await a.dbg('workspaces.open("dice")');await a.dbg('workspaces.close()');console.log('return',await assertResultLayout(a,true));
  console.log(await stage.shot(a,'player-results-phone-return.png'));
  for(let tries=0;tries<30;tries++){await a.roll('6d6 push>=5');if(!(await a.dbg(`pushState(${JSON.stringify(await a.rollId())})`)).state?.busted)break;await a.dbg('clearTable()');}
  await a.dbg('pickToggle(0)');console.log('push',await assertResultLayout(a,true));console.log(await stage.shot(a,'player-results-phone-push.png'));
  await a.eval(`document.getElementById('table-turn-read').click()`);console.log(await stage.shot(a,'player-results-phone-detail.png'));
}
