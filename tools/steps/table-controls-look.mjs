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
// node tools/drive.mjs tools/steps/table-controls-look.mjs [before|after]
import {writeFileSync} from 'node:fs';
export default async function run(stage, args) {
  const label=args[0] || 'after';
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice',query:'&stability=stable'});
  const send=(m,p)=>a.page.browser.send(m,p,a.page.sessionId);
  const size=async(w,h,touch=false)=>{
    await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:touch});
    await a.emulateCoarsePointer(touch);
  };
  await stage.ctx.rawPlayer('Bram'); await stage.ctx.rawPlayer('Cora'); await stage.ctx.rawPlayer('Dev');
  await a.roll('2d6+3');
  if(label==='after') {
    await a.dbg('openSettings("table")');
    await a.eval(`const input=document.getElementById('set-table-name');input.value='The Copper Lantern';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('table-edit-apply').click()`);
    await a.waitFor(`window.__diceDebug.settings.tableName === 'The Copper Lantern' && !window.__diceDebug.tableEdit.busy`);
    await a.eval(`document.getElementById('settings-close').click()`);
  }
  const measures=[];
  for(const [device,w,h] of [['desktop',1440,900],['phone',390,844]]) {
    await size(w,h,device==='phone');
    await a.dbg(`setPanelState({pools:${device==='desktop'}})`);
    await a.eval('new Promise(r=>setTimeout(r,250))');
    console.log(await stage.shot(a,`table-controls-${label}-${device}.png`));
    measures.push(await a.eval(`(()=>{
      const box=id=>document.getElementById(id).getBoundingClientRect().toJSON();
      return {device:${JSON.stringify(device)},rail:box('rail'),dice:box('my-dice'),
        composer:box(${JSON.stringify(device==='desktop'?'draft-zone':'rail-roll-wrap')}),bodyWidth:document.body.scrollWidth};
    })()`));
    if(label!=='before') {
      await a.eval(`document.getElementById('table-open').click()`);
      console.log(await stage.shot(a,`table-controls-${label}-${device}-table.png`));
      if(device==='phone') {
        await size(390,440,true);
        await a.eval(`document.getElementById('set-table-name').focus()`);
        console.log(await stage.shot(a,`table-controls-${label}-phone-keyboard.png`));
        await size(390,844,true);
      }
      await a.dbg('settingsDest("staging")');
      console.log(await stage.shot(a,`table-controls-${label}-${device}-appearance.png`));
      await a.eval(`document.getElementById('settings-close').click();document.getElementById('toggle-settings').click()`);
      console.log(await stage.shot(a,`table-controls-${label}-${device}-preferences.png`));
      await a.eval(`document.getElementById('settings-close').click()`);
    }
  }
  writeFileSync(stage.out(`table-controls-${label}-measure.json`),JSON.stringify(measures,null,2));
  console.log(JSON.stringify(measures));
}
