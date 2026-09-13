/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Browser} from '../../tests/e2e/cdp.mjs';
import {Ctx} from '../../tests/e2e/harness.mjs';
export default async function run(stage){
 // Separate browser processes keep both actual documents visible. Two tabs in
 // one browser would background the normal viewer and intentionally pause it.
 const peerBrowser=await new Browser().launch(),peer=new Ctx(peerBrowser,stage.port,stage.room);
 try {
 const a=await stage.tab('localhost','Alice'),b=await peer.newTable({origin:'127.0.0.123',name:'Bob'});
 for(const t of [a,b])assert.equal(await t.eval('document.hidden'),false,'benchmark viewer is actually visible');
 const dir=stage.out('instant-results');mkdirSync(dir,{recursive:true});const rows=[];
 for(const t of [a,b])await t.dbg("setPresentation('battery')");await b.dbg('setInstantResults(true)');
 await a.dbg("setVenue('copper')");for(const t of [a,b])await t.waitFor("window.__diceDebug.tableDesign.activeId==='copper'");
 for(const [device,width,height] of [['desktop',1440,900],['phone',390,844]]){
  for(const t of [a,b]){await t.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},t.page.sessionId);await t.emulateCoarsePointer(device==='phone');}
  for(const notation of ['4d20','40d20']){
   for(const t of [a,b]){await t.dbg('clearTable()');await t.settle();await t.eval('new Promise(r=>setTimeout(r,1000))');
    await t.eval(`window.__instantProbe=(async()=>{const d=window.__diceDebug,old=d.currentRoll?.rollId,start=performance.now(),frame=d.renderAudit().frame;let received=null,prepared=null;const until=start+20000;
     while(performance.now()<until){const r=d.currentRoll;if(r&&r.rollId!==old){received??=performance.now();if(!r.baking)prepared??=performance.now();if(r.done){const result={seed:r.seed,values:r.values,received,prepared,done:performance.now(),start,frame,framesAtDone:d.renderAudit().frame-frame,duration:r.duration};
      const p={keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,nudges:r.nudges,values:r.values,final:r.dice.map(x=>({p:x.finalPos,q:x.finalQuat}))};result.hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(p))))).map(n=>n.toString(16).padStart(2,'0')).join('');return result;}}
     await new Promise(r=>setTimeout(r,4));}throw Error('Roll never completed');})();true`);
   }
   await a.dbg('commandRoll('+JSON.stringify(notation)+')');const full=await a.eval('window.__instantProbe'),instant=await b.eval('window.__instantProbe');
   await b.eval('new Promise(r=>setTimeout(r,1200))');
   for(const [t,r] of [[a,full],[b,instant]]){r.framesThroughIdle=await t.dbg('renderAudit().frame')-r.frame;r.after=await t.dbg('renderAudit()');r.fromReceiptMs=r.done-r.received;r.prepareMs=r.prepared-r.received;}
   assert.equal(full.hash,instant.hash,'complete authored films stay identical');assert.deepEqual(full.values,instant.values);assert.ok(instant.fromReceiptMs<full.fromReceiptMs);
   rows.push({device,notation,full,instant});console.log(device+' '+notation+': ordinary '+full.fromReceiptMs.toFixed(1)+' ms / '+full.framesThroughIdle+' frames; instant '+instant.fromReceiptMs.toFixed(1)+' ms / '+instant.framesThroughIdle+' frames');
   if(notation==='4d20'){await stage.shot(b,`${dir}/${device}-result.png`);await b.dbg("openSettings('you')");await stage.shot(b,`${dir}/${device}-preferences.png`);await b.dbg('closeSettingsModal()');}
  }
 }
 const backend=await b.eval(`(()=>{const gl=document.querySelector('#scene-container canvas').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown';})()`);
 for(const t of [a,b])assert.deepEqual(t.page.consoleErrors,[]);writeFileSync(`${dir}/report.json`,JSON.stringify({backend,rows},null,2));
 } finally {await peer.closeAll();await peerBrowser.close();}
}
