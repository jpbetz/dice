/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
import {tapControl} from './roll-flows.mjs';
async function holdModels(page){
 const ids=[];await page.browser.send('Fetch.enable',{patterns:[{urlPattern:'*wickroot*.glb*'}]},page.sessionId);
 page.browser.on('Fetch.requestPaused',p=>ids.push(p.requestId),page.sessionId);
 return {async wait(){const until=Date.now()+10000;while(!ids.length&&Date.now()<until)await new Promise(r=>setTimeout(r,20));assert.ok(ids.length,'real model request held');},
 async release(){for(const requestId of ids.splice(0))await page.browser.send('Fetch.continueRequest',{requestId},page.sessionId);},
 async close(){await page.browser.send('Fetch.disable',{},page.sessionId);}};
}
async function coldPair(ctx,ms=300){
 const a=await ctx.newTable({origin:'127.0.0.171',name:'Alice'}),b=await ctx.newTable({origin:'127.0.0.172',name:'Bob'});
 const held=await holdModels(b.page);await b.dbg('towerGlbTune({holdMaxMs:'+ms+'})');
 for(const t of[a,b])await t.dbg('holdClock(true)');
 await a.dbg("setTower('wickroot')");await held.wait();
 await a.waitFor("window.__diceDebug.tower==='wickroot'");return {a,b,held};
}
async function authored(a,b,notation){const old=await b.rollId();await b.dbg('commandRoll('+JSON.stringify(notation)+')');await b.waitFor('window.__diceDebug.currentRoll?.rollId!=='+JSON.stringify(old)+'&&window.__diceDebug.currentRoll?.done');const id=await b.rollId();await a.waitFor('window.__diceDebug.currentRoll?.rollId==='+JSON.stringify(id));await a.settle();return id;}
async function absentFilm(t){assert.equal(await t.dbg('currentRoll.unavailable'),true);assert.deepEqual(await t.dbg('currentRoll.keyframes'),[]);assert.equal(await t.diceCount(),0);assert.equal(await t.dbg('filmAvailability().tainted'),true);}
export const filmUnavailableScenarios=[{
 name:'film-unavailable-turn-reveal-recovery',tags:['film-unavailable','glb','visibility','film-turns'],async fn(ctx){
  const {a,b,held}=await coldPair(ctx);try{
   await b.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},b.page.sessionId);await b.emulateCoarsePointer(true);await b.page.browser.send('Page.bringToFront',{},b.page.sessionId);
   const id=await authored(a,b,'6d6 t3 held'),q=JSON.stringify(id);await absentFilm(b);
   assert.equal((await b.entryState(id)).hidden,true);assert.equal((await a.entryState(id)).hidden,true);
   await tapControl(b,'#table-results .is-mine');assert.equal(await b.eval('document.querySelectorAll("[data-keep-index]").length'),0,'hidden result exposes no selectable values');
   await tapControl(b,'#player-result-actions .banner-foot > button:first-child');await b.waitFor('!window.__diceDebug.entryState('+q+').hidden');await a.waitFor('!window.__diceDebug.entryState('+q+').hidden');await a.settle();
   await tapControl(b,'[data-keep-index="0"]');
   assert.equal(await b.eval('document.querySelectorAll("[data-keep-index]")[0].getAttribute("aria-pressed")'),'true');
   assert.equal(await b.eval('document.activeElement.dataset.keepIndex'),'0','selection retains keyboard focus after the result reader refresh');
   const before=(await b.entryState(id)).values;
   await tapControl(b,'#player-result-actions .throw-again');
   await b.waitFor('window.__diceDebug.currentRoll.throws.used===2');await a.waitFor('window.__diceDebug.currentRoll.throws.used===2');await a.settle();
   assert.equal((await b.entryState(id)).values[0],before[0],'actual index selection reaches authoritative keep validation');
   assert.deepEqual((await b.entryState(id)).values,(await a.entryState(id)).values);await absentFilm(b);
   await held.release();await b.waitFor("window.__diceDebug.towerModelStatus('wickroot').ready");
   assert.equal(await b.dbg('filmAvailability().state'),'results','late model cannot restore unknown settled poses');
   const next=await authored(a,b,'4d20kh2');await absentFilm(b);
   assert.deepEqual(await b.dbg('currentRoll.perDie'),await a.dbg('currentRoll.perDie'),'counted and discarded metadata is unchanged');
   assert.deepEqual((await b.entryState(next)).values,(await a.entryState(next)).values);
   await tapControl(b,'#film-availability button:last-child');
   for(const t of[a,b])await t.waitFor('window.__diceDebug.currentRoll===null&&window.__diceDebug.queueLength===0');
   assert.equal(await b.dbg('filmAvailability().state'),'ready');
   await a.roll('4d20');await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+JSON.stringify(await a.rollId()));await b.settle();
   const film=t=>t.eval('JSON.stringify((({keyframes,sounds,rough,landings,nudges,values})=>({keyframes,sounds,rough,landings,nudges,values}))(window.__diceDebug.currentRoll))');
   assert.equal(await film(a),await film(b),'shared clear and ready model restore full film parity');
   for(const t of[a,b])assert.deepEqual(t.page.errors,[]);
  }finally{await held.close();}
 }
},{
 name:'film-unavailable-bank-private',tags:['film-unavailable','glb','film-turns','visibility'],async fn(ctx){
  const {a,b,held}=await coldPair(ctx);try{
   const id=await authored(a,b,'6d6 push>=1'),q=JSON.stringify(id);await absentFilm(b);
   await tapControl(b,'#table-turn-read');await tapControl(b,'[data-keep-index="1"]');
   await tapControl(b,'#player-result-actions .bank-turn');
   for(const t of[a,b])await t.waitFor('window.__diceDebug.currentRoll.push.banked');
   assert.deepEqual(await b.dbg('pushState('+q+').state'),await a.dbg('pushState('+q+').state'));
   assert.equal((await b.entryState(id)).values.length,6,'bank keeps all original die values');
   assert.equal(await b.dbg('currentRoll.push.tally.count'),1,'the indexed button banks exactly one scoring die');
   assert.equal(await b.dbg('currentRoll.push.tally.sum'),(await b.entryState(id)).values[1]);
   const previous=await a.rollId();await b.roll('2d20 secret');await absentFilm(b);
   assert.equal(await a.rollId(),previous,'private roll never reaches the other viewer');
   await ctx.rawPlayer('Carol');await a.roll('4d6 w:Carol');const whisper=await a.rollId(),wq=JSON.stringify(whisper);
   await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+wq);await absentFilm(b);
   assert.equal((await b.entryState(whisper)).hidden,true);assert.equal(await b.dbg('currentRoll.values'),null,'bystander receives no whispered values');
   await a.dbg('reveal('+wq+')');await b.waitFor('!window.__diceDebug.entryState('+wq+').hidden');await a.settle();
   assert.deepEqual((await b.entryState(whisper)).values,(await a.entryState(whisper)).values);
   for(const t of[a,b])assert.deepEqual(t.page.errors,[]);
  }finally{await held.close();}
 }
},{
 name:'film-unavailable-wait-clear-cancel',tags:['film-unavailable','glb','film-settings'],async fn(ctx){
  const {a,b,held}=await coldPair(ctx,3000);try{
   await a.roll('4d6');const id=await a.rollId();await b.waitFor('window.__diceDebug.queuedFilmCount===1');
   assert.equal(await b.dbg('currentRoll'),null,'no wrong-core film during real asset wait');
   assert.equal(await b.dbg('filmAvailability().state'),'waiting');
   await a.dbg("setTower('none')");await b.waitFor("window.__diceDebug.settings.tower==='none'");
   await b.eval('window.__diceDebug.netEvent("clear",{scope:"table"})');
   await b.waitFor('window.__diceDebug.queueLength===0');assert.equal(await b.dbg('filmAvailability().state'),'ready');
   assert.equal(await b.dbg('pendingTower'),null);assert.equal(await b.dbg('tower'),'none');
   assert.ok((await b.entryState(id)).values.length===4,'cancel preserves the authored queued result');
   await held.release();await b.waitFor("window.__diceDebug.towerModelStatus('wickroot').ready");
   assert.equal(await b.dbg('currentRoll'),null);assert.equal(await b.diceCount(),0);assert.equal(await b.dbg('filmAvailability().waiting'),false);
   await b.roll('2d6');assert.ok((await b.dbg('currentRoll.keyframes')).length>0);assert.deepEqual(b.page.errors,[]);
  }finally{await held.close();}
 }
},{
 name:'film-unavailable-queued-bank-resync',tags:['film-unavailable','glb','film-turns','resync'],async fn(ctx){
  const {a,b,held}=await coldPair(ctx,5000);try{
   await a.roll('6d6 push>=1');const id=await a.rollId(),q=JSON.stringify(id);
   await b.waitFor('window.__diceDebug.queuedFilmCount===1');
   const stale=(await ctx.api('/api/join',{name:'Before'})).data;
   await a.dbg('throwAgain('+q+',[0,2])');await a.waitFor('window.__diceDebug.currentRoll.throws.used===2');await a.settle();
   await a.dbg('bankTurn('+q+',[0,2])');await a.waitFor('window.__diceDebug.currentRoll.push.banked');
   await b.waitFor('window.__diceDebug.queueLength>=4');
   assert.equal(await b.dbg('currentRoll'),null,'whole rethrow and bank remain behind the unavailable core');
   await b.page.browser.send('Page.bringToFront',{},a.page.sessionId);
   const frames=await b.dbg('renderAudit().frame');
   await b.waitFor('window.__diceDebug.currentRoll?.push?.banked');await absentFilm(b);
   assert.equal(await b.dbg('renderAudit().frame'),frames,'hidden asset deadline processes results without rendering');
   assert.deepEqual((await b.entryState(id)).values,(await a.entryState(id)).values);
   assert.deepEqual(await b.dbg('currentRoll.push'),await a.dbg('currentRoll.push'));
   const same=(await ctx.api('/api/join',{name:'After'})).data;
   for(const snapshot of[same,stale])await b.dbg('netEvent("hello",'+JSON.stringify(snapshot)+')');
   assert.equal(await b.dbg('currentRoll.throws.used'),2);assert.equal(await b.dbg('currentRoll.push.banked'),true,'same/older snapshots cannot downgrade a results-only turn');
   await a.dbg('collectRoll('+q+')');await b.waitFor('window.__diceDebug.turnState('+q+').throws===null');
   await b.dbg('netEvent("hello",'+JSON.stringify(stale)+')');
   assert.equal(await b.dbg('turnState('+q+').throws'),null,'stale hello cannot restore a collected results-only turn');
   await held.release();await b.waitFor("window.__diceDebug.towerModelStatus('wickroot').ready");
   assert.equal(await b.diceCount(),0);assert.equal(await b.dbg('filmAvailability().state'),'results');
   for(const t of[a,b])assert.deepEqual(t.page.errors,[]);
  }finally{await held.close();}
 }
},{
 name:'film-unavailable-terminal-reload',tags:['film-unavailable','glb','resync','visibility'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.173',name:'Alice'});
  await a.dbg("setTower('wickroot')");await a.waitFor("window.__diceDebug.tower==='wickroot'");await a.roll('4d6 held');const id=await a.rollId(),q=JSON.stringify(id);
  const original=ctx.browser.newPage.bind(ctx.browser);
  ctx.browser.newPage=async(...args)=>{const page=await original(...args);await page.browser.send('Network.enable',{},page.sessionId);await page.browser.send('Network.setBlockedURLs',{urls:['*GLTFLoader.js*']},page.sessionId);return page;};
  let b;try{b=await ctx.newTable({origin:'127.0.0.174',name:'Bob'});}finally{ctx.browser.newPage=original;}
  await b.dbg('towerGlbTune({retryMs:[5,5,5]})');await b.waitFor("window.__diceDebug.towerModelStatus('wickroot').status==='error'",{timeout:20000});
  await b.waitFor('window.__diceDebug.currentRoll?.unavailable');await absentFilm(b);
  assert.equal((await b.entryState(id)).hidden,true);assert.equal(await b.dbg('currentRoll.values'),null);
  await b.page.browser.send('Network.setBlockedURLs',{urls:[]},b.page.sessionId);await b.reload();await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q);await b.settle();
  assert.equal(await b.dbg('filmAvailability().state'),'ready');assert.equal(await b.dbg('tower'),'wickroot');assert.equal(await b.diceCount(),4);
  const film=t=>t.eval('JSON.stringify((({keyframes,sounds,rough,landings,nudges,values})=>({keyframes,sounds,rough,landings,nudges,values}))(window.__diceDebug.currentRoll))');
  assert.equal(await film(b),await film(a),'reload only restores 3D through actual ready-core snapshot reconstruction');
  assert.equal((await b.entryState(id)).hidden,true);for(const t of[a,b])assert.deepEqual(t.page.errors,[]);
 }
},{
 name:'film-unavailable-unknown-core',tags:['film-unavailable','glb','film-settings'],async fn(ctx){
  const a=await ctx.newTable({origin:'127.0.0.176',name:'Alice'});await a.dbg('holdClock(true)');
  await a.dbg('netEvent("settings-changed",{settings:{tower:"not-in-this-client"}})');
  assert.equal(await a.dbg('filmAvailability().state'),'results');assert.equal(await a.dbg('tower'),'none');
  await a.roll('3d6 t3');await absentFilm(a);
  await a.dbg('netEvent("settings-changed",{settings:{tower:"none"}})');
  assert.equal(await a.dbg('filmAvailability().state'),'results','a known target cannot repair already missing poses');
  await tapControl(a,'#film-availability button:last-child');await a.waitFor('window.__diceDebug.currentRoll===null');
  assert.equal(await a.dbg('filmAvailability().state'),'ready');await a.roll('3d6');assert.ok((await a.dbg('currentRoll.keyframes')).length>0);
  assert.deepEqual(a.page.errors,[]);
 }
}];
