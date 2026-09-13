/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
export default async function run(stage){
 const dir=stage.out('optional-loading');mkdirSync(dir,{recursive:true});
 const original=stage.ctx.browser.newPage.bind(stage.ctx.browser);
 stage.ctx.browser.newPage=async(...args)=>{
  const p=await original(...args);
  await p.browser.send('Network.enable',{},p.sessionId);
  await p.browser.send('Network.setCacheDisabled',{cacheDisabled:true},p.sessionId);
  await p.addInitScript("localStorage.setItem('dice.presentation.v1',JSON.stringify('battery'));localStorage.removeItem('dice.instant-results.v1');");
  return p;
 };
 const rows=[];
 const snapshot=t=>t.eval(`performance.getEntriesByType('resource').filter(r=>r.name.startsWith(location.origin)).map(r=>({path:new URL(r.name).pathname,encoded:r.encodedBodySize,decoded:r.decodedBodySize,transfer:r.transferSize,duration:r.duration}))`);
 const totals=rs=>rs.reduce((s,r)=>({requests:s.requests+1,encoded:s.encoded+r.encoded,decoded:s.decoded+r.decoded,transfer:s.transfer+r.transfer}),{requests:0,encoded:0,decoded:0,transfer:0});
 try{
  for(const [device,width,height,origin]of[['desktop',1440,900,'127.0.0.154'],['phone',390,844,'127.0.0.155']]){
   const t=await stage.tab(origin,'Mira');
   // A distinct solo room gives each layout a genuinely fresh ordinary table.
   await t.page.navigate(`http://${origin}:${stage.port}/?room=optional-${device}&as=Mira&stability=beta`);
   await t.waitFor('window.__diceDebug?.netReady');
   await t.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},t.page.sessionId);await t.emulateCoarsePointer(device==='phone');
   await t.eval('new Promise(r=>setTimeout(r,500))');
   const initial=await snapshot(t);
   await t.dbg('throwSeeded(Array(40).fill("d20"),90090)');await t.settle();
   const hash=await t.eval(`(async()=>{const r=window.__diceDebug.currentRoll,p={keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,nudges:r.nudges,values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(p))))).map(n=>n.toString(16).padStart(2,'0')).join('');})()`);
   await t.dbg('clearTable()');await t.settle();
   const beforeUse=await snapshot(t);
   await t.dbg("openSettings('staging')");
   await t.eval("document.querySelector('[data-venue=moonrise]').click()");
   const start=await t.eval('performance.now()');
   await t.eval("document.getElementById('table-edit-apply').click()");
   await t.waitFor('window.__diceDebug.venueInfo().staged&&window.__diceDebug.pendingTower===null&&window.__diceDebug.towerModelStatus().ready');
   const readyMs=await t.eval('performance.now()-'+start);
   await t.dbg('closeSettingsModal()');await t.roll('4d20');
   await t.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
   const afterUse=await snapshot(t),newUse=afterUse.slice(beforeUse.length);
   await stage.shot(t,`${dir}/${device}-moonrise.png`);
   const moon=await t.dbg('lifeInfo()');
   await t.dbg("setVenue('foxfire')");await t.waitFor("window.__diceDebug.venue==='foxfire'&&window.__diceDebug.venueInfo().staged");await t.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
   await stage.shot(t,`${dir}/${device}-foxfire.png`);
   const fox=await t.dbg('lifeInfo()');assert.notDeepEqual(moon.hue,fox.hue,'real loaded palette changes');
   const resources=await snapshot(t),optional=rs=>rs.filter(r=>/\/fae(?:-lab|life)\.js/.test(r.path));
   const backend=await t.eval(`(()=>{const gl=document.querySelector('#scene-container canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';})()`);
   rows.push({device,backend,initial:{totals:totals(initial),optional:optional(initial),modules:initial.filter(r=>r.path.endsWith('.js')),resources:initial},onUse:{readyMs,totals:totals(newUse),optional:optional(newUse)},allOptional:optional(resources),hash,moon:{flies:moon.flies,wisps:moon.wisps,hue:moon.hue},fox:{flies:fox.flies,wisps:fox.wisps,hue:fox.hue}});
   console.log(device,JSON.stringify({initial:totals(initial),deferred:totals(optional(newUse)),readyMs}));
   assert.deepEqual(t.page.errors,[]);await t.close();
  }
 }finally{stage.ctx.browser.newPage=original;}
 writeFileSync(`${dir}/report.json`,JSON.stringify(rows,null,2));
}
