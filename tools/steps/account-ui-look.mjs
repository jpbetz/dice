/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Browser} from '../../tests/e2e/cdp.mjs';
import {freePort,startServer,Ctx,assert} from '../../tests/e2e/harness.mjs';
export default async function run(stage){
  const port=await freePort(),directory=await mkdtemp(join(tmpdir(),'dice-account-ui-'));
  const server=await startServer(port,{env:{DICE_ACCOUNT_STORE:'file',DICE_ACCOUNT_DIR:directory,DICE_ACCOUNT_ORIGIN:`http://127.0.0.1:${port}`}});
  const ctx=new Ctx(stage.ctx.browser,port,'account-ui-look',server);let secondBrowser=null,secondCtx=null;
  try{
    const a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},a.page.sessionId);
    await a.dbg(`profiles.copyFrom({name:'Copper Lantern rolls',system:'none',pools:[{name:'Sword attack',notation:'1d20+5'},{name:'Healing',notation:'2d8+3'}]},true)`);
    await a.dbg('privateLibrary.open()');await a.waitFor('document.getElementById("account-create")&&!document.getElementById("account-create").disabled');
    console.log(await stage.shot(a,'account-ui-guest-desktop.png'));
    await a.eval(`document.getElementById('account-create').click()`);const recoveryKey=await a.eval(`document.getElementById('account-key').value`);
    await a.eval(`document.getElementById('account-name').value='Sam';document.getElementById('account-key-kept').checked=true;document.getElementById('account-key-kept').dispatchEvent(new Event('change'));document.getElementById('account-submit').click()`);
    await a.waitFor('window.__diceDebug.privateLibrary.state?.person!==null');
    assert.equal((await a.dbg('privateLibrary.state')).syncEnabled,false);
    await a.eval(`document.getElementById('account-compare').click()`);await a.waitFor('!document.getElementById("account-comparison").hidden');
    console.log(await stage.shot(a,'account-ui-compare-desktop.png'));
    await a.eval(`document.getElementById('account-enable-sync').click()`);await a.waitFor('window.__diceDebug.privateLibrary.state.syncEnabled');
    await a.eval(`document.getElementById('account-sync-retry').click()`);await a.waitFor('document.getElementById("account-sync-status").textContent.includes("up to date")');
    console.log(await stage.shot(a,'account-ui-synced-desktop.png'));
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);await a.emulateCoarsePointer(true);
    console.log(await stage.shot(a,'account-ui-phone.png'));
    await a.eval(`document.getElementById('account-history').click()`);await a.waitFor('!document.getElementById("account-history-panel").hidden');
    console.log(await stage.shot(a,'account-ui-history-phone.png'));
    secondBrowser=await new Browser().launch();secondCtx=new Ctx(secondBrowser,port,'account-ui-comparison',server);
    const b=await secondCtx.newTable({origin:'127.0.0.1',name:'Bob'});
    await b.dbg(`profiles.copyFrom({name:'Moon cleric',system:'none',pools:[{name:'Blessing',notation:'1d4'},{name:'Prayer',notation:'2d6'}]},true)`);await b.dbg(`setDiceSet('symbols.fate')`);
    await b.dbg('privateLibrary.open()');await b.waitFor('document.getElementById("account-recover")&&!document.getElementById("account-recover").disabled');
    await b.eval(`document.getElementById('account-recover').click()`);
    const keyInput=await b.page.browser.send('Runtime.evaluate',{expression:'document.getElementById("account-key")'},b.page.sessionId);
    await b.page.browser.send('Runtime.callFunctionOn',{objectId:keyInput.result.objectId,functionDeclaration:'function(value){this.value=value}',arguments:[{value:recoveryKey}]},b.page.sessionId);
    await b.eval(`document.getElementById('account-submit').click()`);
    await b.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&!document.getElementById("account-compare").disabled');
    await b.eval(`document.getElementById('account-compare').click()`);await b.waitFor('!document.getElementById("account-comparison").hidden&&!document.getElementById("account-refresh").disabled');
    await b.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},b.page.sessionId);
    await b.eval(`document.querySelector('#workspace .workspace-content').scrollTop=280`);
    console.log(await stage.shot(b,'account-ui-recovery-comparison-desktop.png'));
    await b.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},b.page.sessionId);await b.emulateCoarsePointer(true);
    await b.eval(`document.getElementById('account-comparison').scrollIntoView({block:'start'})`);
    console.log(await stage.shot(b,'account-ui-recovery-comparison-phone.png'));
    await b.eval(`document.getElementById('account-enable-sync').scrollIntoView({block:'end'})`);
    console.log(await stage.shot(b,'account-ui-merge-choice-phone.png'));
    assert.deepEqual(b.page.errors,[]);
    assert.deepEqual(a.page.errors,[]);
  }finally{await secondCtx?.closeAll();await secondBrowser?.close();await ctx.closeAll();server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));await rm(directory,{recursive:true,force:true});}
}
