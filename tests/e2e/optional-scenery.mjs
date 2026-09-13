/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
const resources = t => t.eval(`performance.getEntriesByType('resource').filter(r=>/\\/fae(?:-lab|life)\\.js/.test(r.name)).map(r=>new URL(r.name).pathname)`);
const film = t => t.eval(`(()=>{const r=window.__diceDebug.currentRoll;return {keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,nudges:r.nudges,values:r.values};})()`);
async function holdStage(t) {
 let requestId;
 await t.page.browser.send('Fetch.enable',{patterns:[{urlPattern:'*fae-lab.js*'}]},t.page.sessionId);
 const off=t.page.browser.on('Fetch.requestPaused',p=>{requestId=p.requestId;},t.page.sessionId);
 return {
  async wait(){const until=Date.now()+10000;while(!requestId&&Date.now()<until)await new Promise(r=>setTimeout(r,20));assert.ok(requestId,'actual module request is pending');},
  async release(){await t.page.browser.send('Fetch.continueRequest',{requestId},t.page.sessionId);requestId=null;},
  async close(){off?.();await t.page.browser.send('Fetch.disable',{},t.page.sessionId);},
 };
}
export const optionalSceneryScenarios=[{
 name:'optional-scenery-full-lifecycle',tags:['optional-loading','venue','idle-render'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.156',name:'Alice'});
  await a.dbg("setPresentation('full')");await a.dbg('holdClock(true)');
  const bodies=await a.dbg('worldBodies().named');
  const started=await a.dbg("faeConcept(true,{paletteId:'moonrise'})");
  assert.equal(started.on,true,'existing concept hook awaits its first real module graph');
  await a.dbg('sim(600)');const first=await a.dbg('lifeInfo([0,40,90])');
  await a.dbg('faeConcept(false)');assert.equal(await a.dbg('lifeInfo().flies'),0);
  await a.dbg("faeConcept(true,{paletteId:'moonrise'})");await a.dbg('sim(600)');
  assert.deepEqual(await a.dbg('lifeInfo([0,40,90])'),first,'restaged scenery retains the same authored clock and life samples');
  assert.deepEqual(await a.dbg('worldBodies().named'),bodies,'the loaded concept leaves actual physics bodies unchanged');
  await a.dbg('holdClock(false)');const frame=await a.dbg('renderAudit().frame');
  await a.eval('new Promise(r=>setTimeout(r,400))');assert.ok(await a.dbg('renderAudit().frame')>frame+4,'Full scenery wakes and continues actual rendering');
  await a.dbg('faeConcept(false)');await a.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
  const stopped=await a.dbg('renderAudit().frame');await a.eval('new Promise(r=>setTimeout(r,300))');
  assert.equal(await a.dbg('renderAudit().frame'),stopped,'leaving the last animated feature sleeps again');
  assert.deepEqual(a.page.errors,[]);
 }
},{
 name:'optional-scenery-shared',tags:['optional-loading','venue'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.150',name:'Alice'}),b=await ctx.newTable({origin:'127.0.0.151',name:'Bob',query:'&stability=stable'});
  for(const t of [a,b])assert.deepEqual(await resources(t),[],'ordinary startup does not request either optional module');
  const held=await holdStage(a);
  try {
   await a.dbg("setVenue('moonrise')");await held.wait();
   for(const t of [a,b])await t.waitFor("window.__diceDebug.venue==='moonrise'&&window.__diceDebug.tower==='wickroot'&&window.__diceDebug.pendingTower===null");
   await b.waitFor('window.__diceDebug.venueInfo().staged');
   assert.equal(await a.dbg('venueInfo().scenery.status'),'loading');
   assert.equal(await a.dbg('venueInfo().staged'),false,'pending cosmetics do not stage early');
   assert.deepEqual(await a.dbg('worldBodies().named'),await b.dbg('worldBodies().named'),'both clients installed identical physical colliders before scenery arrives');
   await a.roll('4d6 held');await b.settle();
   const id=await a.rollId();for(const t of [a,b])assert.ok((await t.entryState(id)).values.every(v=>v===null));
   assert.deepEqual(await film(a),await film(b),'actual shared hidden film is independent of scenery readiness');
   const before=await film(a);await held.release();await a.waitFor('window.__diceDebug.venueInfo().staged');
   assert.deepEqual(await film(a),before,'mounting during a held result never rewrites its film');
   for(const t of [a,b])assert.equal(await t.dbg('shroudedCount'),4);
   await a.dbg('reveal('+JSON.stringify(id)+')');await a.settle();await b.settle();
   assert.deepEqual((await a.entryState(id)).values,(await b.entryState(id)).values);
   for(const t of [a,b]){assert.equal(await t.dbg('shroudedCount'),0);assert.equal((await resources(t)).length,2);assert.deepEqual(t.page.errors,[]);}
  }finally{await held.close();}
 }
},{
 name:'optional-scenery-cancel',tags:['optional-loading','venue'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.152',name:'Alice'}),held=await holdStage(a);
  try{
   await a.dbg("setVenue('moonrise')");await held.wait();
   await a.dbg("setVenue('foxfire')");await a.waitFor("window.__diceDebug.venue==='foxfire'");
   await a.dbg("setVenue('table')");await a.waitFor("window.__diceDebug.venue==='table'");
   await held.release();await a.waitFor('window.__diceDebug.venueInfo().scenery.loaded');
   assert.equal(await a.dbg('venueInfo().scenery.status'),'idle');assert.equal(await a.dbg('venueInfo().staged'),false,'neither stale palette can resurrect after leaving');
   await a.dbg("setVenue('foxfire')");await a.waitFor('window.__diceDebug.venueInfo().staged');
   assert.equal(await a.dbg('venueInfo().scenery.palette'),'foxfire');assert.ok(await a.dbg('lifeInfo().flies')>50);
   assert.equal((await resources(a)).length,2,'rapid changes and later activation share one module graph');
   await a.dbg('lifeTune({count:72})');assert.equal(await a.dbg('lifeInfo().flies'),72,'loaded runtime supports synchronous tune restaging');
   await a.dbg('lifeTune({count:110})');
   assert.deepEqual(a.page.errors,[]);
  }finally{await held.close();}
 }
},{
 name:'optional-scenery-failure-solo',tags:['optional-loading','venue'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.153',name:'Alice'});
  await a.page.browser.send('Network.enable',{},a.page.sessionId);
  await a.page.browser.send('Network.setBlockedURLs',{urls:['*fae-lab.js*']},a.page.sessionId);
  await a.dbg("setVenue('moonrise')");await a.waitFor("window.__diceDebug.venueInfo().scenery.status==='failed'");
  assert.equal(await a.dbg('venueInfo().staged'),false);await a.roll('2d6');
  await a.dbg("openSettings('staging')");
  assert.match(await a.eval("document.getElementById('venue-staged').textContent"),/Scenery couldn’t load.*Reload to retry/);
  await a.dbg('closeSettingsModal()');
  // A static host has no API. Actual network failure on reload exercises
  // the guest fallback alongside the unavailable optional module graph.
  await a.page.browser.send('Network.setBlockedURLs',{urls:['*fae-lab.js*','*/api/*']},a.page.sessionId);
  await a.page.navigate(a.url);await a.waitFor('window.__diceDebug?.netReady');assert.equal(await a.eval('window.__diceDebug.netReady.then(r=>r.online)'),false);
  await a.dbg("setVenue('moonrise')");
  await a.waitFor("window.__diceDebug.venueInfo().scenery.status==='failed'");await a.roll('3d6');
  assert.equal((await a.entryState(await a.rollId())).values.length,3);
  await a.page.browser.send('Network.setBlockedURLs',{urls:[]},a.page.sessionId);
  await a.reload();await a.waitFor('window.__diceDebug.venueInfo().staged');
  assert.ok(await a.dbg('lifeInfo().flies')>50,'reload retries the browser module graph after the asset becomes available');
  assert.deepEqual(a.page.errors,[]);
 }
}];
