/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
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
   const id=await authored(a,b,'6d6 t3 held'),q=JSON.stringify(id);await absentFilm(b);
   assert.equal((await b.entryState(id)).hidden,true);assert.equal((await a.entryState(id)).hidden,true);
   await b.dbg('tableResults.open('+q+')');assert.equal(await b.eval('document.querySelectorAll("[data-keep-index]").length'),0,'hidden result exposes no selectable values');
   await b.dbg('reveal('+q+')');await b.waitFor('!window.__diceDebug.entryState('+q+').hidden');await a.waitFor('!window.__diceDebug.entryState('+q+').hidden');await a.settle();
   await b.dbg('tableResults.open('+q+')');
   await b.eval('document.querySelectorAll("[data-keep-index]")[0].click()');
   assert.equal(await b.eval('document.querySelectorAll("[data-keep-index]")[0].getAttribute("aria-pressed")'),'true');
   const before=(await b.entryState(id)).values;
   await b.eval('document.querySelector("#table-turn-again").click()');
   await b.waitFor('window.__diceDebug.currentRoll.throws.used===2');await a.waitFor('window.__diceDebug.currentRoll.throws.used===2');await a.settle();
   assert.equal((await b.entryState(id)).values[0],before[0],'actual index selection reaches authoritative keep validation');
   assert.deepEqual((await b.entryState(id)).values,(await a.entryState(id)).values);await absentFilm(b);
   await held.release();await b.waitFor("window.__diceDebug.towerModelStatus('wickroot').ready");
   assert.equal(await b.dbg('filmAvailability().state'),'results','late model cannot restore unknown settled poses');
   const next=await authored(a,b,'4d20kh2');await absentFilm(b);
   assert.deepEqual(await b.dbg('entryState('+JSON.stringify(next)+')'),await a.dbg('entryState('+JSON.stringify(next)+')'),'counted and discarded results retain full metadata');
   await b.eval('document.querySelector("#film-availability button:last-child").click()');
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
   await b.dbg('tableResults.open('+q+')');await b.eval('document.querySelectorAll("[data-keep-index]")[1].click()');
   await b.eval('document.querySelector("#table-turn-bank").click()');
   for(const t of[a,b])await t.waitFor('window.__diceDebug.currentRoll.push.banked');
   assert.deepEqual(await b.dbg('pushState('+q+').state'),await a.dbg('pushState('+q+').state'));
   assert.equal((await b.entryState(id)).values.length,6,'bank keeps all original die values');
   const previous=await a.rollId();await b.roll('2d20 secret');await absentFilm(b);
   assert.equal(await a.rollId(),previous,'private roll never reaches the other viewer');
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
}];
