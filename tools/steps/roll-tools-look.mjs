/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// node tools/drive.mjs tools/steps/roll-tools-look.mjs
export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice',query:'&stability=stable'});
  for(const name of ['Bram','Cora','Dev']) await stage.ctx.rawPlayer(name);
  const size=async(width,height,coarse=false)=>{
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=640},a.page.sessionId);
    await a.emulateCoarsePointer(coarse);
  };
  const shot=async(name)=>{
    console.log(await stage.shot(a,`roll-tools-${name}.png`));
    console.log(await a.eval(`(()=>{const dice=document.getElementById('my-dice'),r=dice.getBoundingClientRect();return {name:${JSON.stringify(name)},dice:r.toJSON(),parent:dice.parentElement.id||dice.parentElement.className,bodyWidth:document.body.scrollWidth}})()`));
  };
  await size(1440,900); await a.dbg('setPanelState({pools:true})');
  await a.dbg(`setGroups([{name:'Attack',notation:'1d20+5'},{name:'Damage',notation:'2d6+3'}])`);
  await shot('desktop-empty');
  await a.eval(`(()=>{const i=document.getElementById('cmd-input');i.value='2d6+3';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await a.waitFor('window.__diceDebug.trayState.dice.length===2');
  await a.eval(`document.getElementById('my-dice').focus()`);
  await shot('desktop-staged');
  await size(800,900,true); await shot('tablet');
  await a.dbg('setPanelState({pools:false})'); await shot('compact');
  await size(390,844,true);
  await a.waitFor(`document.getElementById('my-dice').closest('#phone-roll-tray')`);
  await shot('phone');
  await a.dbg(`workspaces.open('dice')`); await shot('phone-builder');
  await a.eval(`document.getElementById('my-dice').click()`);
  await a.waitFor('window.__diceDebug.diceGallery.open');
  await a.eval(`document.querySelector('.dg-close').click()`);
  console.log(await a.eval(`({focus:document.activeElement.id,parent:document.getElementById('my-dice').parentElement.className})`));
  await a.dbg('workspaces.close()');
  await a.waitFor(`document.getElementById('my-dice').closest('#phone-roll-tray')`);
  await a.eval(`document.getElementById('toggle-settings').click()`);
  console.log(await a.eval(`({pref:document.getElementById('settings-panel').getBoundingClientRect().toJSON(),title:document.getElementById('settings-title').textContent,scope:document.getElementById('settings-scope').textContent,modal:document.getElementById('settings-modal').dataset.dest,style:getComputedStyle(document.getElementById('settings-panel')).height})`));
  await shot('preferences');
}
