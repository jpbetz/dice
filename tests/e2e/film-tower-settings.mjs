/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
const film=t=>t.eval(`(()=>{const r=window.__diceDebug.currentRoll;return{keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,lastLanding:r.lastLanding,nudges:r.nudges,values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};})()`);
async function pair(ctx){
 const a=await ctx.newTable({origin:'127.0.0.165',name:'Alice'}),b=await ctx.newTable({origin:'127.0.0.166',name:'Bob'});
 for(const id of['wickroot','cinderbell','none']){await a.dbg('setTower('+JSON.stringify(id)+')');for(const t of[a,b])await t.waitFor('window.__diceDebug.tower==='+JSON.stringify(id)+'&&window.__diceDebug.towerModelStatus().ready');}
 for(const t of[a,b])await t.dbg('holdClock(true)');await a.dbg('setInstantResults(true)');await b.dbg('setInstantResults(false)');return[a,b];
}
async function tower(a,b,id){await a.dbg('setTower('+JSON.stringify(id)+')');await a.waitFor('window.__diceDebug.tower==='+JSON.stringify(id));await b.waitFor('window.__diceDebug.settings.tower==='+JSON.stringify(id));}
async function first(a,b,notation){const prior=await a.rollId();await a.dbg('commandRoll('+JSON.stringify(notation)+')');await a.waitFor('window.__diceDebug.currentRoll?.rollId!=='+JSON.stringify(prior)+'&&window.__diceDebug.currentRoll?.done');const id=await a.rollId();await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+JSON.stringify(id)+'&&!window.__diceDebug.currentRoll.baking');assert.equal(await b.dbg('currentRoll.done'),false);assert.deepEqual(await film(a),await film(b));return id;}
export const filmTowerSettingsScenarios=[{
 name:'film-tower-warm-fifo',tags:['film-settings','glb','instant-results'],async fn(ctx){
  const[a,b]=await pair(ctx);try{
   for(const id of['wickroot','cinderbell','none']){
    const old=await first(a,b,'4d20 t3');await tower(a,b,id);
    await a.dbg("commandRoll('8d20')");await a.waitFor('window.__diceDebug.currentRoll?.rollId!=='+JSON.stringify(old)+'&&window.__diceDebug.currentRoll.done');
    await b.waitFor('window.__diceDebug.queuedFilmCount>=1');await b.settle();
    assert.deepEqual(await film(b),await film(a),id+': later full film uses the tower at its authored position');
    assert.equal(await b.dbg('tower'),id);assert.equal(await b.dbg('pendingTower'),null);
    for(const t of[a,b]){await t.dbg('clearTable()');await t.settle();}
   }
  }finally{await a.dbg('setInstantResults(false)');}for(const t of[a,b])assert.deepEqual(t.page.errors,[]);
 }
},{
 name:'film-tower-warm-rethrows',tags:['film-settings','glb','film-turns','instant-results'],async fn(ctx){
  const[a,b]=await pair(ctx);try{
   const id=await first(a,b,'8d20 t3'),q=JSON.stringify(id);
   await tower(a,b,'wickroot');await a.dbg('throwAgain('+q+',[0,2])');await a.waitFor('window.__diceDebug.currentRoll?.throws?.used===2&&window.__diceDebug.currentRoll.done');
   await tower(a,b,'cinderbell');await a.dbg('throwAgain('+q+',[1,3])');await a.waitFor('window.__diceDebug.currentRoll?.throws?.used===3&&window.__diceDebug.currentRoll.done');
   await b.waitFor('window.__diceDebug.queuedFilmCount===2');await b.settle();
   assert.deepEqual(await film(b),await film(a),'both kept rethrows preserve their intervening physical configurations');
   assert.deepEqual(await b.dbg('turnState('+q+').faces'),await a.dbg('turnState('+q+').faces'));
   assert.equal(await b.dbg('tower'),'cinderbell');assert.equal(await b.dbg('queueLength'),0);
  }finally{await a.dbg('setInstantResults(false)');}for(const t of[a,b])assert.deepEqual(t.page.errors,[]);
 }
},{
 name:'film-tower-warm-reveal-clear',tags:['film-settings','glb','visibility','instant-results'],async fn(ctx){
  const[a,b]=await pair(ctx);try{
   const id=await first(a,b,'6d6 held'),q=JSON.stringify(id);assert.equal(await b.dbg('currentRoll.values'),null);
   await tower(a,b,'wickroot');await a.dbg('reveal('+q+')');await a.waitFor('!window.__diceDebug.entryState('+q+').hidden');
   await a.dbg("commandRoll('4d20')");await a.waitFor('window.__diceDebug.currentRoll?.rollId!=='+q+'&&window.__diceDebug.currentRoll.done');
   await b.waitFor('window.__diceDebug.queuedFilmCount>=1&&window.__diceDebug.pendingReveals.includes('+q+')');
   assert.equal(await b.dbg('currentRoll.values'),null,'a later reveal remains behind the hidden film');await b.settle();
   assert.deepEqual(await film(b),await film(a));assert.deepEqual((await b.entryState(id)).values,(await a.entryState(id)).values);
   await first(a,b,'4d6');await tower(a,b,'cinderbell');await tower(a,b,'none');
   for(const t of[a,b]){await t.dbg('clearTable()');await t.settle();}
   assert.equal(await b.dbg('tower'),'none');assert.equal(await b.dbg('pendingTower'),null);assert.equal(await b.dbg('queueLength'),0);
   await a.dbg("commandRoll('4d20')");await a.waitFor('window.__diceDebug.currentRoll?.done');await b.settle();assert.deepEqual(await film(b),await film(a),'a clear keeps the latest canceled tower and the next film');
  }finally{await a.dbg('setInstantResults(false)');}for(const t of[a,b])assert.deepEqual(t.page.errors,[]);
 }
}];
