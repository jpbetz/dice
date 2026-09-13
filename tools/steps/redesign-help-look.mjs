/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from '../../tests/e2e/harness.mjs';
export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice'});
  for(const [name,width,height] of [['desktop',1440,900],['phone',390,844]]) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640},a.page.sessionId);
    await a.eval("document.getElementById('rail-help').click()");
    await a.eval("document.querySelector('[data-topic=start]').click()");
    assert.equal(await a.eval("document.getElementById('help-start').classList.contains('lit')"),true);
    assert.ok(await a.eval("document.querySelector('#help-start h3').getBoundingClientRect().top>=document.getElementById('help-nav').getBoundingClientRect().bottom"),'sticky topic links leave the selected heading readable');
    console.log(await stage.shot(a,`redesign-help-${name}-start.png`));
    await a.eval("document.querySelector('[data-topic=data]').click()");
    console.log(await stage.shot(a,`redesign-help-${name}-data.png`));
    assert.ok(await a.eval(`document.getElementById('help-panel').getBoundingClientRect().right<=${width}`));
    await a.dbg('closeHelp()');
  }
  assert.deepEqual(a.page.errors,[]);
}
