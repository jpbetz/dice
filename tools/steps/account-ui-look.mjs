/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {freePort,startServer,Ctx,assert} from '../../tests/e2e/harness.mjs';
export default async function run(stage){
  const port=await freePort(),directory=await mkdtemp(join(tmpdir(),'dice-account-ui-'));
  const server=await startServer(port,{env:{DICE_ACCOUNT_STORE:'file',DICE_ACCOUNT_DIR:directory,DICE_ACCOUNT_ORIGIN:`http://127.0.0.1:${port}`}});
  const ctx=new Ctx(stage.ctx.browser,port,'account-ui-look',server);
  try{
    const a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},a.page.sessionId);
    await a.dbg(`profiles.create('Copper Lantern rolls')`);
    await a.dbg('privateLibrary.open()');await a.waitFor('document.getElementById("account-create")&&!document.getElementById("account-create").disabled');
    console.log(await stage.shot(a,'account-ui-guest-desktop.png'));
    await a.eval(`document.getElementById('account-create').click();document.getElementById('account-name').value='Sam';document.getElementById('account-key-kept').checked=true;document.getElementById('account-key-kept').dispatchEvent(new Event('change'));document.getElementById('account-submit').click()`);
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
    assert.deepEqual(a.page.errors,[]);
  }finally{await ctx.closeAll();server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));await rm(directory,{recursive:true,force:true});}
}
