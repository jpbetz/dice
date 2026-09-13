/*
Copyright 2026 The Dice Table Authors
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.
*/
// node tools/drive.mjs tools/steps/personal-kit-look.mjs
export default async function run(stage) {
  const a = await stage.ctx.newTable({origin:'localhost',name:'Alice',query:'&stability=stable'});
  const send = (m,p) => a.page.browser.send(m,p,a.page.sessionId);
  const size = async (width,height,touch=false) => {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});
    await a.emulateCoarsePointer(touch);
  };
  const shot = async name => {
    await a.eval('new Promise(r=>setTimeout(r,350))');
    console.log(await stage.shot(a,`personal-kit-${name}.png`));
  };
  await size(1440,900);
  await stage.ctx.rawPlayer('Bram'); await stage.ctx.rawPlayer('Cora'); await stage.ctx.rawPlayer('Dev');
  await a.roll('2d6+3');
  await shot('table-desktop');
  await a.eval(`document.getElementById('identity-chip').click()`);
  await shot('name-desktop');
  await a.eval(`document.getElementById('idm-dice').click()`);
  await a.waitFor(`window.__diceDebug.diceGallery.open`);
  await shot('gallery-desktop');
  await a.eval(`document.querySelector('.dg-card[data-set="tidewrack.seaglass"]').click()`);
  await shot('preview-desktop');
  await a.eval(`document.querySelector('.dg-favorite').click();document.querySelector('.dg-use').click()`);
  await a.eval(`document.querySelector('.dg-close').click()`);
  await size(390,844,true);
  await a.dbg('setPanelState({pools:false})');
  await a.eval(`document.getElementById('my-dice').click()`);
  await a.waitFor(`window.__diceDebug.diceGallery.open`);
  await shot('gallery-phone');
  await a.eval(`document.querySelector('[data-filter="favorites"]').click()`);
  await shot('favorites-phone');
  await a.eval(`document.querySelector('.dg-close').click();document.getElementById('identity-chip').click()`);
  await size(390,500,true);
  await shot('name-keyboard-phone');
  console.log(await a.eval(`({gallery:window.__diceDebug.diceGallery,bodyWidth:document.body.scrollWidth,view:innerWidth,active:document.activeElement.id})`));
}
