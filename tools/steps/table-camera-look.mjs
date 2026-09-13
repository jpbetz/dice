/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {tapControl} from '../../tests/e2e/roll-flows.mjs';
export default async function run(stage,args) {
  const label=args[0]||'look',dir=stage.out(`table-camera-look-${label}`);mkdirSync(dir,{recursive:true});
  const a=await stage.tab('127.0.0.163','Alice');const rows=[];
  await a.dbg('holdClock(true)');await a.dbg("setVenue('copper')");await a.waitFor("window.__diceDebug.tableDesign.activeId==='copper'");
  for(const [players,device,zoom,notation] of [[1,'phone','wide','4d20'],[1,'phone','medium','4d20'],[1,'phone','close','4d20'],[1,'phone','medium','40d20'],[1,'phone','close','40d4'],[1,'desktop','medium','40d20'],[4,'phone','medium','4d20'],[4,'phone','medium','40d20'],[4,'desktop','medium','40d20'],[4,'phone','close','40d4']]) {
    if(players===4&&rows.at(-1)?.players===1)for(const name of ['Bob','Cora','Sam'])await stage.ctx.rawPlayer(name);
    const width=device==='phone'?390:1440,height=device==='phone'?844:900;
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},a.page.sessionId);
    await a.emulateCoarsePointer(device==='phone');
    await a.dbg('clearTable()');await a.settle();await a.dbg(`setZoom('${zoom}')`);await a.waitFor(`window.__diceDebug.zoom==='${zoom}'`);
    await tapControl(a,device==='phone'?'#phone-build-roll':'#workspace-nav [data-workspace="dice"]');
    if(await a.eval(`document.querySelector('#section-bar [data-sec="notation"]').getAttribute('aria-pressed')==='false'`))await tapControl(a,'#section-bar [data-sec="notation"]');
    await tapControl(a,'#cmd-input');
    for(const type of ['keyDown','keyUp'])await a.page.browser.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2},a.page.sessionId);
    await a.page.browser.send('Input.insertText',{text:notation},a.page.sessionId);
    await a.waitFor(`window.__diceDebug.trayState.dice.length===${notation==='4d20'?4:40}`);
    const before=await a.rollId();await tapControl(a,'#tray-roll');
    await a.waitFor(`!!window.__diceDebug.currentRoll&&window.__diceDebug.currentRoll.rollId!==${JSON.stringify(before)}&&!window.__diceDebug.filmWorker.baking`);
    await a.waitFor('window.__diceDebug.workspaces.current===null');
    await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    if(notation.startsWith('40'))for(const [advance,frame] of [[1,1],[7,8],[46,54]]){
      await a.dbg(`sim(${advance})`);await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      console.log(await stage.shot(a,`${dir}/${players}-${device}-${zoom}-${notation}-frame${frame}.png`));
    }
    await a.settle();await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const frame=await a.dbg('phoneFrame()');const row={players,device,zoom,notation,seed:await a.dbg('currentRoll.seed'),frame,entry:await a.dbg('cameraEntryInfo()'),framing:await a.dbg('framingInfo()')};rows.push(row);
    console.log(await stage.shot(a,`${dir}/${players}-${device}-${zoom}-${notation}.png`));
  }
  writeFileSync(`${dir}/report.json`,JSON.stringify({label,rows},null,2));
}
