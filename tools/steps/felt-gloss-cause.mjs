/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdirSync,writeFileSync} from 'node:fs';
export default async function run(stage,args){
  const label=args[0]||'probe',dir=stage.out(`felt-gloss-cause-${label}`);mkdirSync(dir,{recursive:true});
  const t=await stage.tab('localhost','Alice');await t.settle();await t.dbg("setFelt('obsidian')");await t.waitFor("window.__diceDebug.breathProbe().felt==='obsidian'");
  const rows=[];
  for(const setting of ['fresh','wide','medium','close']){
    if(setting!=='fresh'){
      await t.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false},t.page.sessionId);
      await t.page.browser.send('Page.bringToFront',{},t.page.sessionId);await t.dbg(`setZoom('${setting}')`);await t.waitFor(`window.__diceDebug.zoom==='${setting}'`);await t.settle();
    }
    const sample={setting,frame:await t.dbg('framingInfo()'),material:await t.dbg('floorMaterialProbe()'),stats:await t.dbg('feltGlossStats()'),lamp:await t.dbg('lampInfo()'),fog:await t.dbg('fogDepths()'),
      null:await t.dbg('floorLook({})'),gloss:await t.dbg('floorLook({a:{glossSwing:0},b:{}})'),mottle:await t.dbg('floorLook({a:{mottle:0},b:{}})')};
    rows.push(sample);await t.dbg('floorOverride({glossSwing:0})');await t.dbg('tick(0,true,false)');console.log(await stage.shot(t,`${dir}/${setting}-without.png`));
    await t.dbg('floorOverride(null)');await t.dbg('tick(0,true,false)');console.log(await stage.shot(t,`${dir}/${setting}-with.png`));
  }
  writeFileSync(`${dir}/report.json`,JSON.stringify({label,rows},null,2));console.log(JSON.stringify(rows.map(r=>({setting:r.setting,frame:r.frame,gloss:r.gloss.bands,stats:r.stats}))));
}
