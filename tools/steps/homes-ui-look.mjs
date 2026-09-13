/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {freePort,startServer,Ctx,assert} from '../../tests/e2e/harness.mjs';
export default async function run(stage){
  const port=await freePort(),directory=await mkdtemp(join(tmpdir(),'dice-homes-look-'));
  const server=await startServer(port,{env:{DICE_ACCOUNT_STORE:'file',DICE_ACCOUNT_DIR:directory,DICE_ACCOUNT_ORIGIN:`http://127.0.0.1:${port}`}}),ctx=new Ctx(stage.ctx.browser,port,'homes-ui-look',server);
  try{
    const a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
    await ctx.api('/api/settings',{playerId:await a.playerId(),settings:{tableName:'The Copper Lantern',venue:'copper'}});await a.waitFor('window.__diceDebug.settings.tableName==="The Copper Lantern"');
    await a.dbg('privateLibrary.open()');await a.waitFor('document.getElementById("account-create")&&!document.getElementById("account-create").disabled');
    await a.eval("document.getElementById('account-create').click();document.getElementById('account-name').value='Sam';document.getElementById('account-key-kept').checked=true;document.getElementById('account-key-kept').dispatchEvent(new Event('change'));document.getElementById('account-submit').click()");
    await a.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&!document.getElementById("account-refresh").disabled');assert.equal((await a.dbg('privateLibrary.state')).syncEnabled,false);
    const prepared=await ctx.api('/api/table',{playerId:await a.playerId(),rev:1,profiles:[
      {name:'Rill the navigator',system:'none',pools:[{name:'Read the stars',notation:'1d20+3'},{name:'Keep the course',notation:'2d6'}]},
      {name:'Mira the keeper',system:'none',pools:[{name:'Lantern watch',notation:'1d20+2'}]},
    ]});assert.equal(prepared.ok,true);
    await a.dbg('homes.open()');await a.waitFor('document.getElementById("homes-capture")&&!document.getElementById("homes-capture").disabled');
    await a.eval('document.getElementById("homes-capture").click()');await a.waitFor('!!window.__diceDebug.homes.state?.preview&&!document.getElementById("home-save").disabled');
    await a.waitFor('document.querySelector("#home-candidate .home-cover.has-image")!==null');
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},a.page.sessionId);
    console.log(await stage.shot(a,'homes-capture-desktop.png'));
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);await a.emulateCoarsePointer(true);
    await a.eval('document.getElementById("home-detail").scrollIntoView({block:"start"})');console.log(await stage.shot(a,'homes-capture-phone.png'));
    await a.eval('document.getElementById("home-save").click()');await a.waitFor('window.__diceDebug.homes.state?.cards.length===1&&!window.__diceDebug.homes.state?.loading');
    await a.eval('document.getElementById("home-detail-back").click()');await a.waitFor('document.querySelector("#homes-cards .home-cover.has-image")!==null');
    await a.eval('document.getElementById("homes-workspace").scrollIntoView({block:"start"})');console.log(await stage.shot(a,'homes-card-phone.png'));
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},a.page.sessionId);
    console.log(await stage.shot(a,'homes-card-desktop.png'));
    assert.deepEqual(a.page.errors,[]);
  }finally{await ctx.closeAll();const stopped=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await stopped;await rm(directory,{recursive:true,force:true});}
}
