/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from '../../tests/e2e/harness.mjs';
import {click} from '../../tests/fixtures/visible-input.mjs';
export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice'});
  for(const [name,width,height] of [['desktop',1440,900],['phone',390,844]]) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640},a.page.sessionId);
    await a.emulateCoarsePointer(width<640);
    const opener=width<640?'#phone-more':'#rail-help';
    await a.waitFor(`(()=>{const e=document.querySelector(${JSON.stringify(opener)}),r=e.getBoundingClientRect();return r.width&&r.height&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`,
      {desc:'the resized navigation has reached its visible position'});
    if(width<640){await click(a,'#phone-more');await click(a,'#phone-tool-help');}
    else await click(a,'#rail-help');
    await a.waitFor("!document.getElementById('help-panel').getAnimations().some(animation=>animation.playState==='running')",
      {desc:'Help entrance animation finishes before choosing a topic'});
    await click(a,'#help-nav [data-topic="start"]');
    await a.waitFor("document.getElementById('help-start').classList.contains('lit')",
      {desc:'Getting started is selected after the pointer action'});
    assert.ok(await a.eval("document.querySelector('#help-start h3').getBoundingClientRect().top>=document.getElementById('help-nav').getBoundingClientRect().bottom"),'sticky topic links leave the selected heading readable');
    const start=await a.eval('document.getElementById("help-start").textContent');
    for(const term of ['Friends','Invitations','Presence','Accept and join','Accept for later','More','Rolls'])assert.ok(start.includes(term),`Getting started names ${term}`);
    console.log(await stage.shot(a,`redesign-help-${name}-start.png`));
    if(width<640){
      const scroll=await a.eval(`(()=>{const p=[...document.querySelectorAll('#help-start p')].find(p=>p.textContent.trim().startsWith('People')),r=p.getBoundingClientRect(),nav=document.getElementById('help-nav').getBoundingClientRect(),body=document.getElementById('help-body').getBoundingClientRect();return {x:body.x+body.width/2,y:body.y+body.height/2,deltaY:r.top-nav.bottom-16};})()`);
      await a.page.browser.send('Input.dispatchMouseEvent',{type:'mouseWheel',...scroll,deltaX:0},a.page.sessionId);
      await a.waitFor(`(()=>{const p=[...document.querySelectorAll('#help-start p')].find(p=>p.textContent.trim().startsWith('People')),r=p.getBoundingClientRect();return r.top>=document.getElementById('help-nav').getBoundingClientRect().bottom&&r.bottom<=document.getElementById('help-panel').getBoundingClientRect().bottom;})()`,
        {desc:'the People guidance is fully readable after an actual scroll'});
      console.log(await stage.shot(a,`redesign-help-${name}-people.png`));
    }
    await click(a,'#help-nav [data-topic="data"]');
    const data=await a.eval('document.getElementById("help-data").textContent');
    assert.match(data,/private until you select/);
    assert.match(data,/Share at this\s+table/);
    console.log(await stage.shot(a,`redesign-help-${name}-data.png`));
    assert.ok(await a.eval(`document.getElementById('help-panel').getBoundingClientRect().right<=${width}`));
    await click(a,'#help-close');
  }
  assert.deepEqual(a.page.errors,[]);
}
