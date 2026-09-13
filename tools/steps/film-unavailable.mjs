/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {tapControl} from '../../tests/e2e/roll-flows.mjs';
export default async function run(stage){
 const a=await stage.tab('127.0.0.175','Alice');await a.dbg('holdClock(true)');
 await a.dbg('towerGlbTune({retryMs:[5,5,5],holdMaxMs:100})');
 await a.page.browser.send('Network.enable',{},a.page.sessionId);await a.page.browser.send('Network.setBlockedURLs',{urls:['*wickroot*.glb*']},a.page.sessionId);
 await a.dbg("setTower('wickroot')");await a.waitFor("window.__diceDebug.filmAvailability().state==='results'");
 await a.roll('6d6 t3');
 const backend=await a.eval(`(()=>{const gl=document.querySelector('#scene-container canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);})()`);
 const rows=[];
 const shot=async(name)=>{
  await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const data=await a.eval(`(()=>{const d=window.__diceDebug,r=d.currentRoll;const box=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{availability:d.filmAvailability(),rollId:r.rollId,seed:r.seed,values:r.values,film:r.unavailable?null:r.keyframes,bodyCount:d.tableDice.length,rows:d.tableResults.rows,detail:d.tableResults.detailId,viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth},panel:box('film-availability'),reader:box('player-result-detail'),buttons:[...document.querySelectorAll('[data-keep-index]')].map(e=>({text:e.textContent,pressed:e.getAttribute('aria-pressed'),rect:e.getBoundingClientRect().toJSON()})),render:d.renderAudit()};})()`);
  rows.push({name,backend,...data});console.log(await stage.shot(a,'film-unavailable-'+name+'.png'));
 };
 const size=async(width,height)=>{await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=640},a.page.sessionId);await a.emulateCoarsePointer(width<=640);await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);};
 await size(1440,900);await shot('desktop-lone');await tapControl(a,'#table-turn-read');await tapControl(a,'[data-keep-index="0"]');await shot('desktop-keep');await tapControl(a,'#player-result-close');
 await size(390,844);await shot('phone-lone');await tapControl(a,'#table-turn-read');await tapControl(a,'[data-keep-index="2"]');await shot('phone-keep');await tapControl(a,'#player-result-actions .throw-again');
 await a.waitFor('window.__diceDebug.currentRoll.throws.used===2');await shot('phone-rethrow');
 for(const name of['Bram','Cora','Dev']){const player=await stage.ctx.rawPlayer(name);await stage.ctx.api('/api/roll',{playerId:player.playerId,notation:'2d6'});await a.waitFor('window.__diceDebug.currentRoll?.playerName==='+JSON.stringify(name));}
 await shot('phone-four');
 assert.equal(await a.diceCount(),0);assert.equal(await a.dbg('currentRoll.unavailable'),true);assert.deepEqual(a.page.errors,[]);
 for(const row of rows){assert.equal(row.viewport.scrollWidth,row.viewport.width);assert.equal(row.film,null);assert.ok(row.panel.width<=row.viewport.width);}
 writeFileSync(stage.out('film-unavailable.json'),JSON.stringify(rows,null,2));
 console.log(JSON.stringify(rows.map(({name,availability,bodyCount,viewport,panel,render})=>({name,availability,bodyCount,viewport,panel,render})),null,2));
}
