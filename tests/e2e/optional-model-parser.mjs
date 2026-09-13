/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
const parsers=t=>t.eval(`performance.getEntriesByType('resource').filter(r=>/\\/(?:GLTFLoader|BufferGeometryUtils)\\.js/.test(r.name)).map(r=>new URL(r.name).pathname)`);
const film=t=>t.eval(`(()=>{const r=window.__diceDebug.currentRoll;return {keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,nudges:r.nudges,values:r.values};})()`);
async function holdParser(page){
 let requestId;
 await page.browser.send('Fetch.enable',{patterns:[{urlPattern:'*GLTFLoader.js*'}]},page.sessionId);
 page.browser.on('Fetch.requestPaused',p=>{requestId=p.requestId;},page.sessionId);
 return {
  async wait(){const until=Date.now()+10000;while(!requestId&&Date.now()<until)await new Promise(r=>setTimeout(r,20));assert.ok(requestId,'real parser module request is held');},
  async release(){await page.browser.send('Fetch.continueRequest',{requestId},page.sessionId);requestId=null;},
  async close(){await page.browser.send('Fetch.disable',{},page.sessionId);},
 };
}
export const optionalModelParserScenarios=[{
 name:'optional-parser-replay',tags:['optional-loading','glb','visibility'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.160',name:'Alice'});
  assert.deepEqual(await parsers(a),[],'ordinary startup has no model parser graph');
  await a.dbg("setTower('wickroot')");await a.waitFor("window.__diceDebug.tower==='wickroot'&&window.__diceDebug.towerModelStatus().ready");
  await a.roll('4d6 held');const id=await a.rollId(),before=await film(a);
  const original=ctx.browser.newPage.bind(ctx.browser);let held;
  ctx.browser.newPage=async(...args)=>{const p=await original(...args);held=await holdParser(p);return p;};
  let b;
  try{b=await ctx.newTable({origin:'127.0.0.161',name:'Bob'});}finally{ctx.browser.newPage=original;}
  try{
   await held.wait();await b.waitFor('window.__diceDebug.towerHeldReplay().held==='+JSON.stringify(id));
   assert.equal(await b.dbg("towerModelStatus('wickroot').ready"),false,'parser delay cannot bypass portal/model readiness');
   assert.equal(await b.dbg('tower'),'none');assert.deepEqual(await b.dbg('worldBodies().named'),[]);
   assert.equal(await b.dbg('tableDice.length'),0,'the late joiner holds the replay before baking any wrong-core film');
   await held.release();await b.waitFor("window.__diceDebug.tower==='wickroot'&&window.__diceDebug.towerHeldReplay().held===null");await b.settle();
   assert.deepEqual(await b.dbg("towerPortalSpec('wickroot').portals"),await a.dbg("towerPortalSpec('wickroot').portals"));
   assert.deepEqual(await film(b),before,'actual late replay matches the existing first film after parser/portals arrive');
   for(const t of [a,b])assert.ok((await t.entryState(id)).values.every(v=>v===null));
   await a.dbg('reveal('+JSON.stringify(id)+')');await a.settle();await b.settle();
   assert.deepEqual((await a.entryState(id)).values,(await b.entryState(id)).values);
   await b.dbg("setVenue('copper')");for(const t of [a,b])await t.waitFor("window.__diceDebug.tableDesign.activeId==='copper'");
   for(const t of [a,b]){assert.equal((await parsers(t)).length,2,'tower and table loaders share one module graph');assert.deepEqual(t.page.errors,[]);}
  }finally{await held.close();}
 }
},{
 name:'optional-parser-cancel',tags:['optional-loading','glb'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.162',name:'Alice'}),held=await holdParser(a.page),world=await a.dbg('worldBodies()');
  try{
   await a.dbg("setTower('wickroot')");await held.wait();await a.waitFor("window.__diceDebug.pendingTower==='wickroot'");
   await a.dbg("setTower('none')");await a.waitFor('window.__diceDebug.pendingTower===null');
   await held.release();await a.waitFor("window.__diceDebug.towerModelStatus('wickroot').ready");
   assert.equal(await a.dbg('tower'),'none','late parser/model completion cannot restore the abandoned tower');
   assert.deepEqual(await a.dbg('worldBodies()'),world,'no collider was added by the late completion');
   const url=await a.dbg("towerModelStatus('wickroot').url");
   const count=()=>a.eval(`performance.getEntriesByType('resource').filter(r=>r.name.endsWith(${JSON.stringify(url)})).length`);
   const n=await count();assert.ok(n>0,'the actual model request was recorded');await a.dbg("setTower('wickroot')");await a.waitFor("window.__diceDebug.tower==='wickroot'");
   assert.equal(await count(),n,'the later selection reuses its validated model cache');
   await a.roll('2d6');assert.equal((await parsers(a)).length,2);assert.deepEqual(a.page.errors,[]);
  }finally{await held.close();}
 }
},{
 name:'optional-parser-failure',tags:['optional-loading','glb'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.163',name:'Alice'}),world=await a.dbg('worldBodies()');
  await a.dbg('towerGlbTune({retryMs:[5,5,5]})');
  await a.page.browser.send('Network.enable',{},a.page.sessionId);
  await a.page.browser.send('Network.setBlockedURLs',{urls:['*GLTFLoader.js*']},a.page.sessionId);
  await a.dbg("setTower('wickroot')");await a.waitFor("window.__diceDebug.towerModelStatus('wickroot').status==='error'");
  const s=await a.dbg("towerModelStatus('wickroot')");assert.equal(s.ready,false);assert.equal(s.portals,false);assert.equal(s.retries,3);
  assert.equal(await a.dbg('pendingTower'),'wickroot','failure does not silently change the requested room configuration');
  assert.equal(await a.dbg('tower'),'none');assert.deepEqual(await a.dbg('worldBodies()'),world,'failed parser never installs default or guessed portals');
  await a.dbg("setTower('none')");await a.waitFor('window.__diceDebug.pendingTower===null');await a.roll('2d6');
  await a.page.browser.send('Network.setBlockedURLs',{urls:[]},a.page.sessionId);
  await a.reload();await a.dbg("setTower('wickroot')");await a.waitFor("window.__diceDebug.tower==='wickroot'&&window.__diceDebug.towerModelStatus().ready");
  await a.roll('2d6');assert.deepEqual(a.page.errors,[]);
 }
}];
