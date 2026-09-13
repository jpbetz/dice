/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {tapControl} from '../../tests/e2e/roll-flows.mjs';

export default async function run(stage) {
  const a = await stage.ctx.newTable({origin:'127.0.0.177',anon:true});
  const dir=stage.out('modal-lifecycle'); mkdirSync(dir,{recursive:true});
  const key=async (key,code,windowsVirtualKeyCode)=>{
    for(const type of ['keyDown','keyUp']) await a.page.browser.send('Input.dispatchKeyEvent',
      {type,key,code,windowsVirtualKeyCode},a.page.sessionId);
  };
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    {width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
  await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
  await a.waitFor('!!window.__diceDebug&&!!document.getElementById("workspace-nav")');
  for(let i=0;i<16;i++) {
    await key('Tab','Tab',9);
    assert.equal(await a.eval('document.getElementById("name-modal").contains(document.activeElement)'),true);
  }
  await tapControl(a,'#name-input');
  await a.page.browser.send('Input.insertText',{text:'Alice'},a.page.sessionId);
  await stage.shot(a,dir+'/phone-seat.png');
  await key('Enter','Enter',13);
  await a.waitFor('window.__diceDebug.netReady');
  await a.waitFor('document.getElementById("name-modal").classList.contains("hidden")');
  await tapControl(a,'#phone-more'); await tapControl(a,'#phone-tool-help');
  await a.eval('Promise.all(document.getAnimations().filter(a=>a.effect?.target?.closest("#help-overlay")).map(a=>a.finished))');
  assert.equal(await a.eval('document.getElementById("help-overlay").contains(document.activeElement)'),true,'Help owns focus');
  await stage.shot(a,dir+'/phone-help.png');
  await key('Escape','Escape',27);
  assert.equal(await a.eval('[...document.body.children].some(e=>e.inert)'),false);
  assert.deepEqual(a.page.errors,[]);
}
