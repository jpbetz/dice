/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {tapControl} from '../../tests/e2e/roll-flows.mjs';

export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice'});
  await a.dbg("profiles.reset('none')");
  const pools=['Strength','Toughness','Agility','Wit','Wisdom','Intelligence','Charm','Will','Empathy']
    .map(name=>({name,notation:'2d8',category:'attributes'}))
    .concat([{name:'Swordplay',notation:'1d10',category:'skills'},{name:'Zeal',notation:'1d4',category:'motivations'}]);
  await a.dbg(`setGroups(${JSON.stringify(pools)})`);
  if(await a.eval("!!document.querySelector('#quick-dice .dice-mode-link')?.getBoundingClientRect().height"))await tapControl(a,'#quick-dice .dice-mode-link');
  await tapControl(a,'#die-buttons .die-btn:nth-child(2)');
  await tapControl(a,'#die-buttons .die-btn:nth-child(2)');
  const active=await a.dbg('profiles.active.id');
  let extra;
  for(const mode of ['one','multiple','restored']) {
    if(mode==='multiple') {
      await tapControl(a,'#identity-chip');await tapControl(a,'#idm-library');
      await tapControl(a,`.library-card[data-profile="${active}"]`);await tapControl(a,'#library-duplicate');
      extra=(await a.dbg('profiles.list')).find(p=>p.id!==active);
      assert.ok(extra);assert.equal(await a.dbg('profiles.active.id'),active);
      await tapControl(a,'#settings-close');
    } else if(mode==='restored') {
      await tapControl(a,'#identity-chip');await tapControl(a,'#idm-library');
      await tapControl(a,`.library-card[data-profile="${extra.id}"]`);await tapControl(a,'#library-delete-open');
      await tapControl(a,'#library-delete-confirm');await tapControl(a,'#settings-close');
      assert.equal((await a.dbg('profiles.list')).length,1);assert.equal(await a.dbg('profiles.active.id'),active);
    }
    const point=await a.eval(`(()=>{const body=document.querySelector('#builder-panel > .panel-body');body.scrollTop=0;const r=body.getBoundingClientRect();return {x:r.left+r.width/2,y:r.bottom-25};})()`);
    assert.equal(await a.eval(`document.querySelector('#builder-panel > .panel-body').contains(document.elementFromPoint(${point.x},${point.y}))`),true);
    await a.page.browser.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:400},a.page.sessionId);
    await a.waitFor("document.querySelector('#builder-panel > .panel-body').scrollTop>0");
    const geometry=await a.eval(`(()=>{const head=document.querySelector(${JSON.stringify(mode==='multiple'?'#pools-head':'#groups-list .pool-sec-head')}),zone=document.getElementById('draft-zone');return {head:head.getBoundingClientRect().top,zone:zone.getBoundingClientRect().bottom,position:getComputedStyle(head).position,profiled:document.getElementById('pools-head').classList.contains('profiled')};})()`);
    assert.equal(geometry.profiled,mode==='multiple');assert.equal(geometry.position,'sticky');
    assert.ok(Math.abs(geometry.head-geometry.zone)<=1,JSON.stringify(geometry));
    console.log(mode,geometry,await stage.shot(a,`draft-bench-${mode}.png`));
  }
}
