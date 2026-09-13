/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
export default async function run(stage){
  const a=await stage.tab('localhost','Undo'),dir=stage.out('empty-category-undo');mkdirSync(dir,{recursive:true});
  await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
  const click=async selector=>{
    const p=await a.eval(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,ok:!!r.width&&!!r.height&&!el.disabled&&!el.closest('[inert]')&&el.contains(document.elementFromPoint(x,y))};})()`);
    assert.ok(p.ok,selector+' is reachable');
    for(const [type,buttons] of [['mouseMoved',0],['mousePressed',1],['mouseReleased',0]])await a.page.browser.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1,buttons},a.page.sessionId);
  };
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
  await a.dbg("setGroups([{name:'Attack',notation:'1d20',category:'Combat'},{name:'Last custom roll',notation:'1d6',category:'Travel'}])");
  await click('#workspace-nav [data-workspace="dice"]');
  await a.dbg('setPoolsEditMode(true)');
  const group=(await a.dbg('groups')).find(g=>g.name==='Last custom roll');
  await click(`[data-group-id="${group.id}"] .tile-del`);
  assert.equal(await a.eval('document.querySelectorAll(".undo-tomb").length'),1);
  await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await stage.shot(a,dir+'/phone-undo.png');
  await click('.undo-restore');assert.ok((await a.dbg('groups')).some(g=>g.id===group.id));
  await stage.shot(a,dir+'/phone-restored.png');
  assert.deepEqual(a.page.errors,[]);
}
