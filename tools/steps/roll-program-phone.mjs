/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {click} from '../../tests/fixtures/visible-input.mjs';

// Natural continuation after a debug-driven capture omitted phone controls.
// This is a layout/input witness, not another performance comparison.
export default async function run(stage,args){
 const mode=args.includes('--compile=off')?'off':'on',dual=args.includes('--capture-paths');
 const label=args.find(a=>a.startsWith('--label='))?.slice(8)||'natural';
 const dir=stage.out('roll-program-phone-'+label);mkdirSync(dir,{recursive:true});
 const original=stage.ctx.browser.newPage.bind(stage.ctx.browser);
 stage.ctx.browser.newPage=async(...args)=>{
  const page=await original(...args);
  await page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},page.sessionId);
  await page.browser.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},page.sessionId);
  return page;
 };
 const moments=[];
 let a;
 try{
  a=await stage.tab('localhost','Alice');
  await a.dbg('useRollPreparation('+String(mode==='on')+')');
  // Fixture library/material setup only. All roll/reveal controls below use
  // real pointer input and every film advances through natural playback.
  await a.dbg("setDiceSet('tidewrack.seaglass')");
  await a.dbg("setGroups([{name:'Held glass',notation:'4d20 held'},{name:'Glass',notation:'4d20'}])");
  const heldButton='#phone-saved-rolls .phone-pool:nth-child(1)',nextButton='#phone-saved-rolls .phone-pool:nth-child(2)';
  await a.waitFor('document.querySelectorAll("#phone-saved-rolls .phone-pool").length===2');
  async function capture(name){
   await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   const state=await a.eval(`(()=>{
    const d=window.__diceDebug,selectors=['#workspace-nav','#phone-roll-tray','#scene-container','#left-panel','#phone-build-roll','#phone-more',${JSON.stringify(heldButton)},${JSON.stringify(nextButton)}];
    const style=e=>{const s=getComputedStyle(e);return {display:s.display,visibility:s.visibility,opacity:s.opacity,position:s.position,overflow:s.overflow,transform:s.transform,inert:e.inert,hidden:e.hidden,rect:e.getBoundingClientRect().toJSON()};};
    const canvas=document.querySelector('#scene-container canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {canvas:{...style(canvas),width:canvas.width,height:canvas.height,drawingBufferWidth:gl.drawingBufferWidth,drawingBufferHeight:gl.drawingBufferHeight,contextLost:gl.isContextLost(),backend:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollX,scrollY,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,visual:{width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale}},body:{classes:document.body.className,...style(document.body)},elements:selectors.map(selector=>{const e=document.querySelector(selector);if(!e)return {selector,missing:true};const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {selector,...style(e),disabled:!!e.disabled,inertAncestor:!!e.closest('[inert]'),hit:hit?hit.tagName+'#'+hit.id:null,hitInside:!!hit&&(hit===e||e.contains(hit))};}),roll:{id:d.currentRoll?.rollId,done:d.currentRoll?.done,baking:d.currentRoll?.baking,values:d.currentRoll?.values,shrouded:d.shroudedCount},preparation:d.rollPreparation,frame:d.phoneFrame(),detail:d.tableResults.detailId};
   })()`);
   const layoutBefore=await a.page.browser.send('Page.getLayoutMetrics',{},a.page.sessionId);
   const moment={name,...state,layoutBefore};moments.push(moment);writeFileSync(`${dir}/report.json`,JSON.stringify({_copyright:'Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0',naturalPlayback:true,metricsBeforeNavigation:true,compileMode:mode,capturePaths:dual,moments},null,2));
   await stage.shot(a,`${dir}/${name}.png`);
   const surfacePng=readFileSync(`${dir}/${name}.png`);moment.surfaceCapture={width:surfacePng.readUInt32BE(16),height:surfacePng.readUInt32BE(20)};
   if(dual)try{
    const {data}=await a.page.browser.send('Page.captureScreenshot',{format:'png',fromSurface:false},a.page.sessionId);
    const png=Buffer.from(data,'base64');writeFileSync(`${dir}/${name}-from-view.png`,png);
    moment.viewCapture={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
   }catch(error){moment.viewCapture={unsupportedOrFailed:true,error:String(error)};}
   moment.layoutAfter=await a.page.browser.send('Page.getLayoutMetrics',{},a.page.sessionId);
   writeFileSync(`${dir}/report.json`,JSON.stringify({_copyright:'Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0',naturalPlayback:true,metricsBeforeNavigation:true,compileMode:mode,capturePaths:dual,moments},null,2));
   for(const selector of ['#workspace-nav','#phone-roll-tray','#phone-build-roll','#phone-more',nextButton]){
    const e=state.elements.find(e=>e.selector===selector);
    assert.ok(e&&!e.missing&&e.display!=='none'&&e.visibility==='visible'&&!e.inertAncestor&&e.hitInside,`${name}: ${selector} remains visible and reachable`);
   }
   return state;
  }
  await capture('ready');await click(a,heldButton);
  await a.waitFor('window.__diceDebug.currentRoll?.done&&!window.__diceDebug.filmWorker.baking',{timeout:60000});
  const held=await capture('held');assert.equal(held.roll.values,null);assert.equal(held.roll.shrouded,4);
  await click(a,'.result-seat.is-mine');
  await click(a,'#player-result-actions button[title="Flip this roll face up for the table"]');
  await a.waitFor('window.__diceDebug.shroudedCount===0&&!window.__diceDebug.revealingCount',{timeout:60000});
  await click(a,'#player-result-close');
  const revealed=await capture('revealed');assert.equal(revealed.roll.values.length,4);
  await click(a,nextButton);
  await a.waitFor('window.__diceDebug.currentRoll?.rollId!=='+JSON.stringify(held.roll.id)+'&&window.__diceDebug.currentRoll?.done&&!window.__diceDebug.filmWorker.baking',{timeout:60000});
  await capture('next-roll');assert.deepEqual(a.page.errors,[]);assert.deepEqual(a.page.consoleErrors,[]);
  console.log(JSON.stringify({moments:moments.map(m=>({name:m.name,viewport:m.viewport,bodyClasses:m.body.classes,nav:m.elements[0],tray:m.elements[1],roll:m.roll})),pageErrors:a.page.errors,consoleErrors:a.page.consoleErrors}));
 }finally{stage.ctx.browser.newPage=original;}
}
