/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
export const towerPendingCancelScenarios=[{
 name:'tower-pending-cancel',tags:['glb','settings'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.164',name:'Alice'}),before=await a.dbg('worldBodies()');
  const urls=await a.eval("['wickroot','cinderbell'].map(id=>window.__diceDebug.towerModelStatus(id).url)");
  let requestId;
  await a.page.browser.send('Fetch.enable',{patterns:urls.map(url=>({urlPattern:'*'+url}))},a.page.sessionId);
  a.page.browser.on('Fetch.requestPaused',p=>{requestId=p.requestId;},a.page.sessionId);
  const waitRequest=async()=>{const until=Date.now()+10000;while(!requestId&&Date.now()<until)await new Promise(r=>setTimeout(r,20));assert.ok(requestId,'actual tower model is held in flight');};
  const release=async()=>{await a.page.browser.send('Fetch.continueRequest',{requestId},a.page.sessionId);requestId=null;};
  try{
   await a.dbg("setTower('wickroot')");await waitRequest();
   assert.equal(await a.dbg('pendingTower'),'wickroot');
   await a.dbg("setTower('none')");await a.waitFor("window.__diceDebug.settings.tower==='none'&&window.__diceDebug.pendingTower===null");
   await release();await a.waitFor("window.__diceDebug.towerModelStatus('wickroot').ready");
   assert.equal(await a.dbg('tower'),'none','late model completion cannot restore a canceled pending tower');
   assert.deepEqual(await a.dbg('worldBodies()'),before,'canceling None leaves the physical world intact');
   await a.dbg("setTower('cinderbell')");await waitRequest();
   await a.dbg("setTower('wickroot')");await a.waitFor("window.__diceDebug.tower==='wickroot'&&window.__diceDebug.pendingTower===null");
   const core=await a.dbg("towerPortalSpec('wickroot').portals"),bodies=await a.dbg('worldBodies()');
   await release();await a.waitFor("window.__diceDebug.towerModelStatus('cinderbell').ready");
   assert.equal(await a.dbg('tower'),'wickroot','a different real tower supersedes the pending request');
   assert.deepEqual(await a.dbg('worldBodies()'),bodies);assert.deepEqual(await a.dbg("towerPortalSpec('wickroot').portals"),core);
   await a.roll('2d6');assert.deepEqual(a.page.errors,[]);
  }finally{await a.page.browser.send('Fetch.disable',{},a.page.sessionId);}
 }
}];
