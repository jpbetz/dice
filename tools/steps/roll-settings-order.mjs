/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {writeFileSync} from 'node:fs';
import {assert} from '../../tests/e2e/harness.mjs';
export default async function run(stage){
 const a=await stage.tab('localhost','Alice'),b=await stage.tab('127.0.0.123','Bob');
 for(const t of [a,b]){await t.dbg('holdClock(true)');await t.dbg('filmAudit(true)');}
 await a.dbg('setInstantResults(true)');
 await a.dbg("commandRoll('4d20')");await a.waitFor('window.__diceDebug.currentRoll?.done');
 const first=await a.rollId();await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+JSON.stringify(first)+'&&!window.__diceDebug.currentRoll.baking');
 console.log('ordinary first done',await b.dbg('currentRoll.done'));
 await a.dbg("setZoom('close')");await a.waitFor("window.__diceDebug.breathProbe().zoom==='close'");await b.waitFor("window.__diceDebug.settings.zoom==='close'");
 console.log('ordinary pending zoom',await b.dbg('pendingZoom'));
 await a.dbg("commandRoll('40d20 t3')");await a.waitFor('window.__diceDebug.currentRoll?.rollId!=='+JSON.stringify(first)+'&&window.__diceDebug.currentRoll?.done');
 const next=await a.rollId();await b.waitFor('window.__diceDebug.queueLength>=1');await b.settle();
 const film=async t=>t.eval(`(async()=>{const d=window.__diceDebug,r=d.currentRoll,f={keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,nudges:r.nudges,values:r.values};return{width:d.breathProbe().tableW,rollId:r.rollId,values:r.values,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(f))))).map(v=>v.toString(16).padStart(2,'0')).join('')};})()`);
 const result={instant:await film(a),ordinary:await film(b)};writeFileSync(stage.out('roll-settings-order.json'),JSON.stringify(result,null,2));console.log(result);
 assert.equal(result.instant.hash,result.ordinary.hash,'the next film agrees across presentation speeds');
 await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
 for(const [device,width,height] of [['desktop',1440,900],['phone',390,844]]){
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},a.page.sessionId);await a.emulateCoarsePointer(device==='phone');
  await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await a.settle();console.log(await stage.shot(a,`roll-settings-${device}.png`));
 }
 for(const t of[a,b])assert.deepEqual(t.page.errors,[]);
}
