/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
export default async function run(stage) {
 const t=await stage.tab('localhost','Ember'),dir=stage.out('battery-presentation');mkdirSync(dir,{recursive:true});const rows=[],paired=[];
 await t.dbg("setVenue('copper')");await t.waitFor("window.__diceDebug.tableDesign.activeId==='copper'");
 await t.dbg("setDiceSet('emberforge.blackanvil')");await t.dbg('useFilmWorker(true)');
 const sample=async(ms)=>t.eval(`(async()=>{const d=window.__diceDebug,at=performance.now(),start=d.renderAudit().frame,draws=[],passes=[];let last=start;
   do {await new Promise(requestAnimationFrame);const a=d.renderAudit();if(a.frame!==last){draws.push(a.calls);passes.push(a.passes);last=a.frame;}}while(performance.now()-at<${ms});
   return {elapsed:performance.now()-at,rendererPasses:last-start,draws,passes,pending:d.renderAudit().scheduled.pending,audit:d.renderAudit(),presentation:d.presentation};})()`);
 for(const [device,width,height] of [['desktop',1440,900],['phone',390,844]]) {
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},t.page.sessionId);
  await t.emulateCoarsePointer(device==='phone');
  for(const mode of ['full','battery']) {
   await t.dbg('clearTable()');await t.settle();await t.dbg('setPresentation('+JSON.stringify(mode)+')');
   await t.dbg('holdClock(true)');
   await t.dbg('throwSeeded(Array(40).fill("d20"),90090)');await t.waitFor('!window.__diceDebug.filmWorker.baking');
   await t.dbg('sim(60)');await t.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
   if(mode==='full') {
    const full=await t.dbg('renderAudit()'),at=await t.dbg('currentRoll.time');
    await t.dbg("setPresentation('battery')");await t.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
    const battery=await t.dbg('renderAudit()');assert.equal(await t.dbg('currentRoll.time'),at);
    assert.ok(battery.calls<full.calls,'same active film pose requires fewer draws');assert.equal(battery.passes,1);
    paired.push({device,at,dice:await t.dbg('tableDice.length'),full,battery});
    await t.dbg("setPresentation('full')");
   }
   await t.dbg('holdClock(false)');
   const active=await sample(800);await t.settle();await t.eval('new Promise(r=>setTimeout(r,1500))');const idle=await sample(1500);
   const hash=await t.eval(`(async()=>{const r=window.__diceDebug.currentRoll,p={keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,nudges:r.nudges,values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(p))))).map(n=>n.toString(16).padStart(2,'0')).join('');})()`);
   const gl=await t.eval(`(()=>{const gl=document.querySelector('#scene-container canvas').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown';})()`);
   rows.push({device,mode,active,idle,hash,backend:gl});console.log(device+' '+mode+': active '+active.draws.length+' pictures / '+active.rendererPasses+' passes; idle '+idle.rendererPasses+' passes');
   if(mode==='battery')assert.equal(idle.rendererPasses,0);
   await t.dbg('clearTable()');await t.settle();await t.roll('4d20');await t.eval('new Promise(r=>setTimeout(r,500))');
   await stage.shot(t,`${dir}/${device}-${mode}-result.png`);
   if(mode==='battery'){await t.dbg("openSettings('you')");await stage.shot(t,`${dir}/${device}-preferences.png`);await t.dbg('closeSettingsModal()');}
  }
 }
 for(const device of ['desktop','phone']){const r=rows.filter(r=>r.device===device);assert.equal(r[0].hash,r[1].hash,'presentation retains exact stress film');}
 assert.deepEqual(t.page.consoleErrors,[]);writeFileSync(`${dir}/report.json`,JSON.stringify({paired,rows},null,2));
}
