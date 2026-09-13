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
// node tools/drive.mjs tools/steps/library-workspace-look.mjs
import {writeFileSync} from 'node:fs';
export default async function run(stage) {
  const a = await stage.ctx.newTable({origin:'localhost',name:'Alice',query:'&stability=stable'});
  const size = async (width,height) => {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<761},a.page.sessionId);
    await a.emulateCoarsePointer(width<761);
  };
  const shot = async name => console.log(await stage.shot(a,`library-workspace-${name}.png`));
  const bram=await stage.ctx.rawPlayer('Bram'); await stage.ctx.rawPlayer('Cora'); await stage.ctx.rawPlayer('Dev');
  await stage.ctx.api('/api/pools',{playerId:bram.playerId,profile:'Orrin',system:'soul-deal',pools:[{name:'Runic hammer',notation:'2d8+3'},{name:'Resolve',notation:'2d6'}]});
  await a.dbg(`profiles.reset('soul-deal')`);
  await a.dbg(`profiles.rename(window.__diceDebug.profiles.active.id,'Bram')`);
  for (const name of ['Nessa','Sable','Varric','Thistle','Mira']) {
    await a.dbg(`profiles.create(${JSON.stringify(name)})`);
    await a.dbg(`setGroups([{name:'Longbow',notation:'1d20+5',category:'Combat'},{name:'Twin blades',notation:'2d6+3',category:'Combat'},{name:'Stealth',notation:'1d20+7',category:'Skills'},{name:'Perception',notation:'1d20+4',category:'Skills'},{name:'Initiative',notation:'1d20+3',category:'Skills'}])`);
  }
  await a.dbg(`profiles.use(window.__diceDebug.profiles.list.find(p=>p.name==='Bram').id)`);
  await a.roll('2d6+3');
  await size(1440,900); await a.dbg('setPanelState({pools:true})');
  await a.dbg(`openSettings('stuff')`);
  await a.eval(`document.querySelectorAll('.library-card')[1].click()`);
  await shot('desktop');
  const measures=[];
  const measure=async device => measures.push(await a.eval(`(()=>{
    const box=sel=>document.querySelector(sel).getBoundingClientRect().toJSON();
    const list=box('#profile-rows');
    return {device:${JSON.stringify(device)},workspace:box('#settings-panel'),detail:box('#library-detail'),list,
      visibleCards:[...document.querySelectorAll('.library-card')].filter(b=>{const r=b.getBoundingClientRect();return r.top>=list.top && r.bottom<=list.bottom}).length,
      bodyWidth:document.body.scrollWidth,rail:box('#rail')};
  })()`));
  await measure('desktop');
  await a.eval(`document.getElementById('portable-open').click()`); await shot('files');
  await a.eval(`document.querySelector('[data-library-page="shared"]').click()`); await shot('shared');
  await a.eval(`document.getElementById('settings-close').click()`);
  await size(390,844); await a.dbg('setPanelState({pools:false})');
  await a.dbg(`openSettings('stuff')`); await shot('phone-list'); await measure('phone');
  await size(390,440);
  await a.eval(`document.getElementById('library-create').open=true;document.getElementById('profile-newname').focus()`);
  await shot('phone-create');
  await a.eval(`document.getElementById('library-create').open=false`);
  await size(390,844);
  await a.eval(`document.querySelectorAll('.library-card')[1].click()`); await shot('phone-detail');
  await size(390,440);
  await a.eval(`document.getElementById('library-rename-open').click()`); await shot('phone-rename');
  await size(844,390); await shot('landscape-rename');
  await a.eval(`document.getElementById('settings-close').click()`);
  await size(1440,900); await a.dbg('setPanelState({pools:true})'); await shot('closed');
  writeFileSync(stage.out('library-workspace-measure.json'),JSON.stringify(measures,null,2));
  console.log(JSON.stringify(measures));
}
