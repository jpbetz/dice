/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {click} from '../../tests/fixtures/visible-input.mjs';

export default async function run(stage){
  const dir=stage.out('dice-art-look');mkdirSync(dir,{recursive:true});
  const original=stage.ctx.browser.newPage.bind(stage.ctx.browser);
  stage.ctx.browser.newPage=async()=>{
    const p=await original();
    await p.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true},p.sessionId);
    await p.browser.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},p.sessionId);
    return p;
  };
  let a;
  try{a=await stage.tab('127.0.0.113','Alice');}finally{stage.ctx.browser.newPage=original;}
  const cdp=(method,params={})=>a.page.browser.send(method,params,a.page.sessionId);
  const ready=`[...document.querySelectorAll('#die-buttons .die-art')].every(img=>img.dataset.artState==='ready'&&img.complete&&img.naturalWidth)`;
  await cdp('Network.enable');
  const startup=await a.dbg('dieArtInfo()');
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*/models/dice-art/*',requestStage:'Request'}]});
  await click(a,'#phone-build-roll');
  await a.waitFor(`document.querySelector('#die-buttons .die-art').dataset.artState==='loading'`);
  await stage.shot(a,`${dir}/phone-pending.png`);
  await click(a,'#die-buttons .die-btn:nth-child(2)');
  await click(a,'#tray-roll');
  await a.waitFor('window.__diceDebug.workspaces.current===null&&window.__diceDebug.currentRoll?.done');
  await stage.shot(a,`${dir}/phone-roll-while-pending.png`);
  await cdp('Fetch.disable');
  await click(a,'#phone-build-roll');await a.waitFor(ready);
  await stage.shot(a,`${dir}/phone-standard.png`);
  const standard=await a.dbg('dieArtInfo()');
  const resources=await a.eval(`performance.getEntriesByType('resource').filter(r=>r.name.includes('/models/dice-art/')).map(r=>({path:new URL(r.name).pathname,encoded:r.encodedBodySize,bytes:r.transferSize}))`);
  await a.dbg("setDiceSet('emberforge.blackanvil')");await a.waitFor(ready);
  await stage.shot(a,`${dir}/phone-anvil.png`);
  await click(a,'#workspace-back');
  const peers=[];for(const name of ['Bram','Cora','Dev'])peers.push(await stage.ctx.rawPlayer(name));
  for(const peer of peers){
    await stage.ctx.api('/api/roll',{playerId:peer.playerId,notation:'2d6'});
    await a.waitFor(`window.__diceDebug.currentRoll?.playerId===${JSON.stringify(peer.playerId)}&&window.__diceDebug.currentRoll?.done`);
  }
  await stage.shot(a,`${dir}/phone-four-players.png`);
  await a.dbg('devOpen()');
  await a.dbg("tuneSet({'houses.classics.dice.ivory.body':'#d33b32'})");
  await a.waitFor(`import('/js/themes.js').then(m=>m.SETS['classics.ivory'].body==='#d33b32')`);
  await a.dbg('devFold(true)');await a.dbg("setDiceSet('classics.ivory')");
  await click(a,'#phone-build-roll');await a.waitFor(ready);
  await stage.shot(a,`${dir}/phone-edited.png`);
  await click(a,'#workspace-back');await a.dbg('devClose()');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
  await a.dbg("setDiceSet('emberforge.blackanvil')");
  await a.dbg("setGroups([{name:'Attack',notation:'1d20+4'},{name:'Damage',notation:'2d6'}])");
  await a.dbg("editPool(window.__diceDebug.groups[0].id,{set:'std'})");
  await a.dbg("editPool(window.__diceDebug.groups[1].id,{set:'emberforge.blackanvil'})");
  await a.dbg('setPanelState({pools:true})');
  if(!await a.eval("document.getElementById('quick-dice').hidden"))await click(a,'#quick-dice .dice-mode-link');
  await a.waitFor(ready);
  await a.waitFor(`[...document.querySelectorAll('#groups-list .die-art')].every(img=>img.dataset.artState==='ready'&&img.complete&&img.naturalWidth)`);
  await stage.shot(a,`${dir}/desktop-anvil.png`);
  assert.deepEqual(a.page.errors,[]);
  writeFileSync(`${dir}/report.json`,JSON.stringify({startup,standard,resources,final:await a.dbg('dieArtInfo()')},null,2));
}
