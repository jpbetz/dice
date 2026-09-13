/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export default async function run(stage){
 const a=await stage.tab('127.0.0.165','Alice'),b=await stage.tab('127.0.0.166','Bob');
 await a.dbg("setTower('wickroot')");for(const t of[a,b])await t.waitFor("window.__diceDebug.tower==='wickroot'&&window.__diceDebug.towerModelStatus().ready");
 await a.dbg("setTower('none')");for(const t of[a,b]){await t.waitFor("window.__diceDebug.tower==='none'");await t.dbg('holdClock(true)');}
 await a.dbg('setInstantResults(true)');await b.dbg('setInstantResults(false)');
 const sample=t=>t.eval(`(async()=>{const d=window.__diceDebug,r=d.currentRoll,f={keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,lastLanding:r.lastLanding,nudges:r.nudges,values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};return{tower:d.tower,pending:d.pendingTower,queue:d.queueLength,throws:r.throws,pour:!!r.pour,rollId:r.rollId,seed:r.seed,values:r.values,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(f))))).map(v=>v.toString(16).padStart(2,'0')).join('')};})()`);
 const rows=[];
 for(const kind of['roll','rethrow']){
  for(const t of[a,b]){await t.dbg('clearTable()');await t.settle();}
  await a.dbg("setTower('none')");for(const t of[a,b])await t.waitFor("window.__diceDebug.tower==='none'");
  await a.dbg("commandRoll('4d20 t3')");await a.waitFor('window.__diceDebug.currentRoll?.done');const id=await a.rollId(),q=JSON.stringify(id);
  await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q+'&&!window.__diceDebug.currentRoll.baking');
  const first={instant:await sample(a),normal:await sample(b)};
  await a.dbg("setTower('wickroot')");await a.waitFor("window.__diceDebug.tower==='wickroot'");await b.waitFor("window.__diceDebug.settings.tower==='wickroot'");
  if(kind==='roll')await a.dbg("commandRoll('8d20')");else await a.dbg('throwAgain('+q+',[0,2])');
  await a.waitFor(kind==='roll'?'window.__diceDebug.currentRoll?.rollId!=='+q+'&&window.__diceDebug.currentRoll.done':'window.__diceDebug.currentRoll?.throws?.used===2&&window.__diceDebug.currentRoll.done');
  await b.waitFor('window.__diceDebug.queueLength>=1');const pending=await sample(b);await b.settle();
  rows.push({kind,first,pending,instant:await sample(a),normal:await sample(b)});
 }
 writeFileSync(stage.out('tower-settings-order.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2));
 for(const row of rows){assert.equal(row.first.instant.hash,row.first.normal.hash);assert.equal(row.instant.hash,row.normal.hash,row.kind+' uses the same ordered tower core');}
 await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
 for(const [device,width,height]of[['desktop',1440,900],['phone',390,844]]){
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},a.page.sessionId);await a.emulateCoarsePointer(device==='phone');await a.dbg('sim(240)');
  await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await stage.shot(a,'tower-settings-'+device+'.png');
 }
 for(const t of[a,b])assert.deepEqual(t.page.errors,[]);
}
