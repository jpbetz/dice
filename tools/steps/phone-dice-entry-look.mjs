/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// node tools/drive.mjs tools/steps/phone-dice-entry-look.mjs
import assert from 'node:assert/strict';
import {tapControl} from '../../tests/e2e/roll-flows.mjs';

export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'127.0.0.103',name:'Alice',query:'&stability=stable'});
  const send=(method,params)=>a.page.browser.send(method,params,a.page.sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await a.emulateCoarsePointer(true);
  await a.eval("localStorage.removeItem('dice.panels.v1')");await a.reload();
  await stage.ctx.api('/api/settings',{playerId:await a.playerId(),settings:{tableName:'The Copper Lantern'}});
  await a.waitFor("window.__diceDebug.settings.tableName==='The Copper Lantern'");
  await send('Page.bringToFront',{});
  const shot=async name=>{
    await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    console.log(await stage.shot(a,`phone-dice-entry-${name}.png`));
  };
  await shot('table');
  await tapControl(a,'#workspace-nav [data-workspace="dice"]');
  assert.equal(await a.eval("document.getElementById('my-dice').closest('#draft-actions')?.id"),'draft-actions');
  await shot('rolls');
  await tapControl(a,'#my-dice');await a.waitFor('window.__diceDebug.diceGallery.open');
  await a.waitFor("(()=>{const images=[...document.querySelectorAll('.dg-card img')].slice(0,4);return images.length===4&&images.every(img=>img.complete&&img.naturalWidth>0);})()");
  await shot('gallery');
  await tapControl(a,'.dg-close');
  assert.equal(await a.eval('document.activeElement.id'),'my-dice');
  await tapControl(a,'#workspace-back');
  assert.equal(await a.dbg('workspaces.current'),null);
  assert.deepEqual(a.page.errors,[]);
}
