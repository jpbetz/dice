/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {account,people,idle,state,seedFriendship} from './people-app.mjs';
import {click,type} from './visible-input.mjs';
import {assertResultLayout} from '../e2e/player-results.mjs';

export async function invitationJourney(f,{shot=async()=>{}}={}){
  const one=await f.context('invitation-current'),two=await f.context('invitation-recipient');
  const a=await one.newTable({origin:'127.0.0.1',name:'Sam'}),b=await two.newTable({origin:'127.0.0.1',name:'Riley'});
  for(const page of [a,b]){
    await page.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},page.page.sessionId);
    await page.emulateCoarsePointer(true);await page.reload();
  }
  await one.api('/api/settings',{playerId:await a.playerId(),settings:{venue:'copper'}});
  await account(a,{name:'Sam'});await account(b,{name:'Riley'});
  const {second}=await seedFriendship(a,b);
  // An existing, different home must never silently become the destination.
  const other=await a.eval(`__socialFixture.createHome(__socialFixturePerson,{operationId:crypto.randomUUID(),name:'The Stone Circle'})`);
  assert.equal(other.ok,true);
  for(const name of ['Mira','Dev','Cora'])await one.rawPlayer(name);
  await b.dbg(`setGroups([{name:'Perception',notation:'1d20+4'}])`);
  await b.dbg(`setDiceSet('tidewrack.seaglass')`);await b.dbg('privateLibrary.settled()');
  const kit=await b.dbg('privateLibrary.snapshot()');await click(b,'#workspace-back');
  assert.equal(await b.dbg('people.state'),null,'recipient has never opened People');
  await people(a);
  assert.equal(await a.eval('document.querySelectorAll("#workspace-people-current .workspace-person").length'),4);
  const invite=`[data-social-focus="invite:${second}"]`;
  const bounds=await a.eval(`document.querySelector(${JSON.stringify(invite)}).getBoundingClientRect().toJSON()`);
  assert.ok(bounds.top>=100&&bounds.bottom<600,'friend invitation is visible without scrolling past four players');
  await shot(a,'friends-phone');await click(a,invite);
  assert.equal(await a.eval('document.getElementById("people-invite-home").value'),'');
  assert.equal(await a.eval('document.getElementById("people-invite-send").hidden'),true);
  await click(a,'#people-save-home');
  await a.waitFor('window.__diceDebug.homes.state?.preview&&!document.getElementById("home-name-submit").disabled');
  assert.equal(await a.eval('document.getElementById("home-save").hidden'),true);
  await shot(a,'name-table-phone');await type(a,'#home-table-name','The Copper Lantern');await click(a,'#home-name-submit');
  await a.waitFor('window.__diceDebug.homes.state?.preview?.document.settings.tableName==="The Copper Lantern"&&!document.getElementById("home-save").disabled');
  assert.equal(await a.dbg('homes.state.preview.document.settings.tableName'),'The Copper Lantern');
  assert.equal(await a.eval('document.getElementById("home-save").textContent'),'Save and continue');
  await shot(a,'save-table-phone');await click(a,'#home-save');
  await a.waitFor('window.__diceDebug.workspaces.current==="people"&&!document.getElementById("people-invite-form").hidden');await idle(a);
  const home=(await state(a)).homes.find(h=>h.roomKey===one.room);assert.ok(home);
  assert.equal(await a.eval('document.getElementById("people-invite-home").value'),home.id);
  assert.match(await a.eval('document.getElementById("people-invite-form").textContent'),/Riley/);
  await shot(a,'send-phone');await click(a,'#people-invite-send');await idle(a);
  const sent=(await state(a)).outgoing.find(i=>i.kind==='home'&&i.state==='pending');
  assert.equal(sent.home.id,home.id);assert.equal(sent.home.name,'The Copper Lantern');
  // Observe the real background timer while the recipient stays at their table.
  await b.waitFor('document.querySelector("#workspace-nav [data-workspace=people] .workspace-badge")?.textContent==="1"', {timeout:40000});
  assert.equal(await b.dbg('workspaces.current'),null);await shot(b,'notification-phone');
  await people(b);
  const go=`[data-social-focus="accept-join:${sent.id}"]`;
  assert.equal(await b.eval('document.getElementById("people-invitations").hidden'),false);
  assert.ok((await b.eval(`document.querySelector(${JSON.stringify(go)}).getBoundingClientRect().toJSON()`)).bottom<844);
  await shot(b,'receive-phone');
  await b.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},b.page.sessionId);
  await shot(b,'receive-desktop');
  await b.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},b.page.sessionId);
  await click(b,go);
  await b.waitFor(`new URL(location.href).searchParams.get('room')===${JSON.stringify(one.room)}&&window.__diceDebug?.net?.savedHome&&window.__diceDebug?.settings.tableName==='The Copper Lantern'`);
  await b.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&!window.__diceDebug.privateLibrary.state.blocked');
  assert.equal(await b.dbg('workspaces.current'),null);
  assert.deepEqual(await b.dbg('privateLibrary.snapshot()'),kit,'accept-and-join preserves the complete private kit');
  assert.deepEqual(await b.dbg('profiles.shared'),[]);
  assert.equal(await b.eval('document.title'),'The Copper Lantern — Dice Table');
  await click(b,'#workspace-nav [data-workspace="tables"]');
  await b.waitFor('window.__diceDebug.homes.state?.cards.length&&!document.getElementById("homes-refresh").disabled');
  await shot(b,'saved-table-phone');
  await click(b,`[data-focus-key="go:${two.room}"]`);
  await b.waitFor(`new URL(location.href).searchParams.get('room')===${JSON.stringify(two.room)}&&window.__diceDebug?.net?.online`);
  await click(b,'#workspace-nav [data-workspace="tables"]');
  await b.waitFor('window.__diceDebug.homes.state?.cards.length&&!document.getElementById("homes-refresh").disabled');
  await click(b,`[data-home-focus="join:${home.id}"]`);
  await b.waitFor(`new URL(location.href).searchParams.get('room')===${JSON.stringify(one.room)}&&window.__diceDebug?.net?.savedHome`);
  await b.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&!window.__diceDebug.privateLibrary.state.blocked');
  assert.deepEqual(await b.dbg('privateLibrary.snapshot()'),kit,'returning from Tables preserves the same private kit');
  await b.waitFor('document.querySelector("#phone-saved-rolls .phone-pool")');
  await click(b,'#phone-saved-rolls .phone-pool');
  await b.waitFor('!!window.__diceDebug.currentRoll');await b.settle();
  const roll=await b.rollId();await a.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(roll)}`);await a.settle();
  assert.deepEqual((await a.entryState(roll)).values,(await b.entryState(roll)).values);
  assert.equal(await b.dbg('diceSet'),'tidewrack.seaglass');
  await assertResultLayout(b,true);await shot(b,'joined-roll-phone');
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
}

// Closing the invitation or selecting another People task must also cancel
// navigation while the optional Homes module is still loading.
export async function invitationSaveCancellation(f,{nextTask='close invitation',shot=async()=>{}}={}){
  const one=await f.context('g_invite_save_cancel'),two=await f.context('invite_save_friend');
  const a=await one.newTable({origin:'127.0.0.1',name:'Sam'}),b=await two.newTable({origin:'127.0.0.1',name:'Riley'});
  await account(a);await account(b,{name:'Riley'});const ids=await seedFriendship(a,b);
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
  await a.emulateCoarsePointer(true);
  await a.roll('3d6 t3 secret');const roll=await a.rollId(),turn=await a.dbg(`turnState(${JSON.stringify(roll)})`),seat=await a.playerId();
  await people(a);await click(a,`[data-social-focus="invite:${ids.second}"]`);
  const browser=a.page.browser;let held=null;
  browser.on('Fetch.requestPaused',p=>{held=p.requestId;},a.page.sessionId);
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/js/homesui.js',requestStage:'Response'}]},a.page.sessionId);
  await click(a,'#people-save-home');
  for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,10));
  assert.ok(held,'Homes module is held before the task can open');
  await click(a,nextTask==='close invitation'?'#people-invite-close':'#people-tab-table');
  await shot(a,'pending');
  await browser.send('Fetch.continueRequest',{requestId:held},a.page.sessionId);
  await browser.send('Fetch.disable',{},a.page.sessionId);await idle(a);
  assert.equal(await a.dbg('workspaces.current'),'people','cancelled invitation cannot open Tables after loading');
  if(nextTask==='close invitation')assert.equal(await a.eval('document.getElementById("people-invite-form").hidden'),true);
  else assert.equal(await a.eval('document.getElementById("workspace-people-current").hidden'),false);
  assert.ok(!(await a.dbg('homes.state'))?.preview,'cancelled action creates no capture preview');
  assert.equal(await a.playerId(),seat);
  assert.deepEqual(await a.dbg(`turnState(${JSON.stringify(roll)})`),turn,'the private unfinished turn is untouched');
  await shot(a,'settled');
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
}
