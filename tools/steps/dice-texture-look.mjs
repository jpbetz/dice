/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {click} from '../../tests/fixtures/visible-input.mjs';

// Actual local controls and incoming mixed-set rolls in the owner's named
// phone viewport. Natural playback throughout; this is a visual flow proof.
export default async function run(stage){
  const dir=stage.out('dice-texture-look');mkdirSync(dir,{recursive:true});
  const original=stage.ctx.browser.newPage.bind(stage.ctx.browser);
  stage.ctx.browser.newPage=async()=>{
    const p=await original();
    await p.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true},p.sessionId);
    await p.browser.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},p.sessionId);
    return p;
  };
  let a;try{a=await stage.tab('localhost','Alice');}finally{stage.ctx.browser.newPage=original;}
  const rows=[];
  const shot=async name=>{
    await stage.shot(a,`${dir}/${name}.png`);
    const layout=await a.eval(`({width:innerWidth,height:innerHeight,scrollY,
      visual:{height:visualViewport.height,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale},
      controls:['phone-more','phone-build-roll'].map(id=>{
        const el=document.getElementById(id),r=el.getBoundingClientRect();
        return {id,rect:r.toJSON(),hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
      })})`);
    if(layout.width===390)for(const control of layout.controls){
      assert.ok(control.hit&&control.rect.top>=0&&control.rect.bottom<=layout.height,`${name}: ${control.id} stays reachable`);
    }
    rows.push({name,layout,frame:await a.dbg('phoneFrame()'),dice:await a.dbg('tableDiceInfo()'),workspace:await a.dbg('workspaces.current')});
  };
  await click(a,'#phone-quick-dice [data-quick="1d20"]');
  await a.waitFor('window.__diceDebug.currentRoll?.time>0&&window.__diceDebug.tableDice.length===1');
  await shot('phone-first-d20');
  await a.waitFor('window.__diceDebug.currentRoll?.done');await shot('phone-d20-result');
  await click(a,'#table-results .result-seat-clear');
  await a.waitFor('window.__diceDebug.tableDice.length===0');
  const peers=[];for(const name of ['Bram','Cora','Dev'])peers.push(await stage.ctx.rawPlayer(name));
  await stage.ctx.api('/api/roll',{playerId:peers[0].playerId,notation:'2d6+2d20',
    sets:['classics.ivory','tidewrack.seaglass','std','symbols.monster']});
  await a.waitFor('window.__diceDebug.currentRoll?.playerName==="Bram"&&window.__diceDebug.currentRoll.time>0');
  await click(a,'#phone-build-roll');
  await click(a,'#die-buttons .die-btn:nth-child(7)');
  await click(a,'#tray-roll');
  await a.waitFor('window.__diceDebug.workspaces.current===null&&window.__diceDebug.currentRoll?.playerName==="Alice"&&window.__diceDebug.currentRoll.time>0');
  await shot('phone-builder-return');
  await a.waitFor('window.__diceDebug.currentRoll?.done');
  for(const peer of peers.slice(1)){
    await stage.ctx.api('/api/roll',{playerId:peer.playerId,notation:'2d20'});
    await a.waitFor(`window.__diceDebug.currentRoll?.playerId===${JSON.stringify(peer.playerId)}&&window.__diceDebug.currentRoll?.done`);
  }
  await shot('phone-four-players-mixed');
  const info=await a.dbg('tableDiceInfo()');
  for(const variant of ['classics.ivory','tidewrack.seaglass','std','symbols.monster'])assert.ok(info.some(d=>d.variant===variant),`the shared table retains ${variant}`);
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},a.page.sessionId);
  await a.page.browser.send('Emulation.setTouchEmulationEnabled',{enabled:false},a.page.sessionId);
  await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await shot('desktop-four-players-mixed');
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(a.page.consoleErrors,[]);
  writeFileSync(`${dir}/report.json`,JSON.stringify(rows,null,2));
}
