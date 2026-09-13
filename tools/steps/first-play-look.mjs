/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// node tools/drive.mjs tools/steps/first-play-look.mjs
export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'127.0.0.121',name:'Alice',query:'&stability=stable'});
  const size=(w,h,mobile=false)=>a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile},a.page.sessionId);
  await size(1440,900);
  await stage.ctx.rawPlayer('Bram'); await stage.ctx.rawPlayer('Cora'); await stage.ctx.rawPlayer('Dev');
  await a.roll('2d6+3');
  console.log(await stage.shot(a,'first-play-desktop.png'));
  await a.dbg('openSettings("stuff")');
  await a.eval(`document.getElementById('starter-kits').open=true;document.querySelector('[data-kit="soul-deal"]').click()`);
  console.log(await stage.shot(a,'first-play-kit-desktop.png'));
  await a.eval(`document.getElementById('settings-close').click()`);
  await size(390,844,true); await a.emulateCoarsePointer(true);
  await a.eval(`localStorage.removeItem('dice.panels.v1')`); await a.reload();
  await a.roll('2d6+3');
  console.log(await stage.shot(a,'first-play-phone.png'));
  await a.dbg('openSettings("stuff")');
  await a.eval(`document.getElementById('starter-kits').open=true;document.querySelector('[data-kit="soul-deal"]').click()`);
  console.log(await stage.shot(a,'first-play-kit-phone.png'));
}
