/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
import {click} from '../fixtures/visible-input.mjs';

export const historyReadSample = `(()=>{
 const results=[...document.querySelectorAll('#table-results .result-seat-wrap')],history=document.getElementById('log-flyout');
 const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const h=rect(history),bounds=results.map(rect),viewport=rect(document.getElementById('table-results'));let total=0,covered=0;
 for(const result of results){const r=rect(result);
 for(let x=Math.max(r.left,viewport.left)+4;x<Math.min(r.right,viewport.right)-4;x+=6)for(let y=Math.max(r.top,viewport.top)+4;y<Math.min(r.bottom,viewport.bottom)-4;y+=6){total++;const e=document.elementFromPoint(x,y);if(!e||!result.contains(e))covered++;}}
 const close=document.getElementById('log-close'),c=rect(close),hit=document.elementFromPoint((c.left+c.right)/2,(c.top+c.bottom)/2);
 return {results:bounds,history:h,total,covered,closeHit:!!hit&&close.contains(hit),names:results.map(r=>r.querySelector('.result-seat-name').textContent),
 listHeight:document.getElementById('log-list').clientHeight,shown:!history.classList.contains('hidden'),entries:document.querySelectorAll('#log-list .log-entry').length};
})()`;
export async function historyViewport(a,width,height){
 await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
 await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=640},a.page.sessionId);
 await a.emulateCoarsePointer(width<=640);
 await a.waitFor(`innerWidth===${width}&&innerHeight===${height}`);
 await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
}
export async function openHistory(a){
 if(await a.eval('innerWidth<=640')){await click(a,'#phone-more');await click(a,'#phone-tool-history');}
 else await click(a,'#rail-log');
 await a.waitFor('!document.getElementById("log-flyout").classList.contains("hidden")');
 await a.eval('Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))');
}
export const readLayoutScenarios=[{name:'history-keeps-results-readable',tags:['chrome','roll','read-layout'],timeout:120000,async fn(ctx){
 const a=await ctx.newTable({origin:'127.0.0.182',name:'Alice'});
 // A long real history loads the height clamp; an empty flyout would prove nothing.
 for(let i=0;i<12;i++){await a.roll('2d6 # Read '+i);await a.settle();}
 for(const name of ['Bob','Cora','Sam']){const p=await ctx.rawPlayer(name);const r=await ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'});await a.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(r.data.roll.rollId)}`);await a.settle();}
 const verify=async(label)=>{
  const s=await a.eval(historyReadSample);
  assert.equal(s.shown,true);assert.ok(s.results.length===4&&s.results.every(r=>r.width>0&&r.height>0)&&s.history.width>0&&s.history.height>0,'both current read and history are painted');
  assert.deepEqual(s.names,['Alice','Bob','Cora','Sam']);assert.ok(s.total>100,'actual result samples arm the coverage check');
  assert.equal(s.covered,0,`${label}: history leaves the current result readable (${JSON.stringify(s)})`);
  assert.equal(s.closeHit,true,'history Close remains an actual pointer target');
  assert.ok(s.listHeight>=44,`history keeps enough space to read a roll, not only its tools (${s.listHeight}px)`);
  assert.ok(s.history.top>=0&&s.history.bottom<=await a.eval('innerHeight'),'the history header and floor stay on screen');
 };
 for(const [w,h] of [[390,844],[1440,900],[844,390]]){
  await historyViewport(a,w,h);await openHistory(a);await verify(`${w}×${h}`);
  if(h<=480){
   const strip=await a.eval('document.getElementById("table-results").getBoundingClientRect().toJSON()');
   await a.page.browser.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:strip.left+strip.width/2,y:strip.top+strip.height/2,deltaX:1000,deltaY:0},a.page.sessionId);
   await a.waitFor('document.getElementById("table-results").scrollLeft>0');
   await verify('short view after scrolling to the remaining results');
   assert.equal(await a.eval(`(()=>{const s=document.getElementById('table-results').getBoundingClientRect(),r=document.querySelector('#table-results .result-seat-wrap:last-child').getBoundingClientRect();return r.left>=s.left&&r.right<=s.right;})()`),true,'the final player is fully reachable in the short-window row');
  }
  await click(a,'#log-close');
 }
 await historyViewport(a,1440,900);await openHistory(a);
 for(const [w,h] of [[390,844],[844,390],[1440,900]]){await historyViewport(a,w,h);await verify(`open resize to ${w}×${h}`);}
 await click(a,'#log-close');
 assert.deepEqual(a.page.consoleErrors,[]);
}}];
