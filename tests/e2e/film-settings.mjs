/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
const film=t=>t.eval(`(()=>{const r=window.__diceDebug.currentRoll;return{keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,lastLanding:r.lastLanding,nudges:r.nudges,values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};})()`);
async function pair(ctx){
 const a=await ctx.newTable({origin:'127.0.0.120',name:'Alice'}),b=await ctx.newTable({origin:'127.0.0.121',name:'Bob'});
 for(const t of[a,b])await t.dbg('holdClock(true)');await a.dbg('setInstantResults(true)');await b.dbg('setInstantResults(false)');return[a,b];
}
async function zoom(a,b,id){await a.dbg(`setZoom('${id}')`);await a.waitFor(`window.__diceDebug.breathProbe().zoom==='${id}'`);await b.waitFor(`window.__diceDebug.settings.zoom==='${id}'`);}
export const filmSettingsScenarios=[
 {name:'film-zoom-fifo',tags:['film-settings','film-turns','instant-results','zoom'],async fn(ctx){
  const[a,b]=await pair(ctx);try{
   await a.dbg("commandRoll('8d20 t3')");await a.waitFor('window.__diceDebug.currentRoll?.done');const id=await a.rollId(),q=JSON.stringify(id);
   await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q+'&&!window.__diceDebug.currentRoll.baking');
   assert.equal(await b.dbg('currentRoll.done'),false);assert.deepEqual(await film(a),await film(b));
   await zoom(a,b,'close');await a.dbg('throwAgain('+q+',[0,2])');await a.waitFor('window.__diceDebug.currentRoll.throws.used===2&&window.__diceDebug.currentRoll.done');
   await zoom(a,b,'medium');await a.dbg('throwAgain('+q+',[1,3])');await a.waitFor('window.__diceDebug.currentRoll.throws.used===3&&window.__diceDebug.currentRoll.done');
   await b.waitFor('window.__diceDebug.queueLength===4');await b.settle();
   assert.deepEqual(await film(b),await film(a),'each rethrow uses the size at its own place in the authored event stream');
   assert.equal(await b.dbg('pendingZoom'),null);assert.equal(await b.dbg('breathProbe().zoom'),'medium');
   await a.dbg("commandRoll('40d20')");await a.waitFor('window.__diceDebug.currentRoll?.rollId!=='+q+'&&window.__diceDebug.currentRoll.done');const next=await a.rollId();
   await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+JSON.stringify(next));await b.settle();assert.deepEqual(await film(b),await film(a),'next independent roll inherits the same settled geometry and colliders');
  }finally{await a.dbg('setInstantResults(false)');}for(const t of[a,b])assert.deepEqual(t.page.consoleErrors,[]);
 }},
 {name:'film-zoom-reveal-clear',tags:['film-settings','instant-results','visibility','zoom'],async fn(ctx){
  const[a,b]=await pair(ctx);try{
   await a.dbg("commandRoll('6d6 held')");await a.waitFor('window.__diceDebug.currentRoll?.done');const id=await a.rollId(),q=JSON.stringify(id);
   await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q+'&&!window.__diceDebug.currentRoll.baking');
   assert.equal(await b.dbg('currentRoll.values'),null);await zoom(a,b,'close');
   await a.dbg('reveal('+q+')');await a.waitFor('!window.__diceDebug.entryState('+q+').hidden');
   await a.dbg("commandRoll('4d20')");await a.waitFor('window.__diceDebug.currentRoll?.rollId!=='+q+'&&window.__diceDebug.currentRoll.done');
   await b.waitFor('window.__diceDebug.queuedFilmCount===1&&window.__diceDebug.pendingReveals.includes('+q+')');assert.equal(await b.dbg('currentRoll.values'),null,'later reveal stays behind the first hidden film');
   await b.settle();assert.deepEqual(await film(b),await film(a));assert.deepEqual((await b.entryState(id)).values,(await a.entryState(id)).values);
   const before=await a.rollId();await a.dbg("commandRoll('4d6')");await a.waitFor('window.__diceDebug.currentRoll?.rollId!=='+JSON.stringify(before)+'&&window.__diceDebug.currentRoll.done');const last=await a.rollId();
   await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+JSON.stringify(last)+'&&!window.__diceDebug.currentRoll.baking');
   await zoom(a,b,'medium');await zoom(a,b,'wide');
   await a.dbg('clearTable()');await b.dbg('clearTable()');for(const t of[a,b])await t.settle();
   assert.equal(await b.dbg('breathProbe().zoom'),'wide','a whole-table clear retains the latest requested size');assert.equal(await b.dbg('queueLength'),0);
  }finally{await a.dbg('setInstantResults(false)');}for(const t of[a,b])assert.deepEqual(t.page.consoleErrors,[]);
 }},
];
