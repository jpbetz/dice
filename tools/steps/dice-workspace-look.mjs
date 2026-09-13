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
// node tools/drive.mjs tools/steps/dice-workspace-look.mjs
import {writeFileSync} from 'node:fs';
export default async function run(stage) {
  const a = await stage.ctx.newTable({origin:'localhost',name:'Alice',query:'&stability=stable'});
  const size = async (width,height) => {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<761},a.page.sessionId);
    await a.emulateCoarsePointer(width<761);
  };
  const shot = async name => {
    await a.eval(`Promise.all([...document.querySelectorAll('#dice-gallery img')].filter(i=>i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().bottom>0).map(i=>i.decode().catch(()=>{})))`);
    console.log(await stage.shot(a,`dice-workspace-${name}.png`));
  };
  const measures=[];
  await stage.ctx.rawPlayer('Bram'); await stage.ctx.rawPlayer('Cora'); await stage.ctx.rawPlayer('Dev');
  await a.roll('2d6+3');
  await size(1440,900); await a.dbg('setPanelState({pools:true})');
  await a.eval(`document.getElementById('my-dice').click()`);
  await a.waitFor('window.__diceDebug.diceGallery.open');
  await shot('desktop-browse');
  await a.eval(`(() => {const card=document.querySelector('.dg-card[data-set="tidewrack.seaglass"]');card.scrollIntoView({block:'center'});card.click()})()`);
  await shot('desktop-preview');
  const measure=async device => measures.push(await a.eval(`(()=>{
    const box=sel=>document.querySelector(sel).getBoundingClientRect().toJSON();
    const list=box('.dg-scroll');
    return {device:${JSON.stringify(device)},workspace:box('#dice-gallery'),preview:box('.dg-preview'),list,
      visibleCards:[...document.querySelectorAll('.dg-card')].filter(b=>{const r=b.getBoundingClientRect();return r.top>=list.top && r.bottom<=list.bottom}).length,
      bodyWidth:document.body.scrollWidth,rail:box('#rail')};
  })()`));
  await measure('desktop');
  await size(1000,760); await shot('small-desktop');
  await a.eval(`document.querySelector('.dg-close').click()`);
  await size(390,844); await a.dbg('setPanelState({pools:false})');
  await a.eval(`document.getElementById('my-dice').click()`);
  await a.waitFor('window.__diceDebug.diceGallery.open');
  await shot('phone-browse'); await measure('phone');
  await a.eval(`(() => {const card=document.querySelector('.dg-card[data-set="tidewrack.seaglass"]');card.scrollIntoView({block:'center'});card.click()})()`);
  await shot('phone-preview');
  await a.eval(`(() => {document.querySelector('.dg-back').click();const input=document.getElementById('dg-search');input.focus();input.value='classics';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await size(390,440); await shot('phone-search');
  await a.eval(`document.querySelector('.dg-card').click()`); await shot('phone-short-preview');
  await size(844,390); await shot('landscape');
  await a.eval(`document.querySelector('.dg-close').click()`);
  await size(1440,900); await a.dbg('setPanelState({pools:true})');
  await shot('closed-desktop');
  writeFileSync(stage.out('dice-workspace-measure.json'),JSON.stringify(measures,null,2));
  console.log(JSON.stringify(measures));
}
