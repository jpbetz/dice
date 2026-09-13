/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Browser} from './e2e/cdp.mjs';
import {Ctx,freePort,startServer} from './e2e/harness.mjs';

test('actual app retains a failed-home state while rolling locally and explicitly creates a guest table during service outage',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'dice-home-ui-outage-')),port=await freePort();
  const server=await startServer(port,{env:{DICE_ACCOUNT_STORE:'file',DICE_ACCOUNT_DIR:directory,DICE_ACCOUNT_ORIGIN:'http://untrusted.example'}});
  const browser=await new Browser().launch(),ctx=new Ctx(browser,port,'possibly-saved-old-address',server);
  t.after(async()=>{await ctx.closeAll();await browser.close();const stopped=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await stopped;await rm(directory,{recursive:true,force:true});});
  const a=await ctx.newTable({origin:'127.0.0.1',name:'Alice',allowSolo:true});
  assert.equal((await a.dbg('net')).unavailableHome,true);assert.equal((await a.dbg('net')).online,false);
  assert.equal(await a.eval('document.getElementById("home-connection-notice").hidden'),false);
  await a.roll('1d6');assert.equal(await a.eval('document.getElementById("home-connection-notice").hidden'),false);
  await a.eval('document.getElementById("home-connection-new").click()');await a.waitFor('!!document.querySelector(".rail-menu input.tin")');
  await a.eval('document.querySelector(".rail-menu input.tin").value="Outage guest game";document.querySelector(".rail-menu .btn.confirm").click()');
  for(let n=0;n<100;n++){try{if(await a.eval('location.search.startsWith("?room=g_")&&!!window.__diceDebug?.netReady'))break;}catch{}await new Promise(r=>setTimeout(r,50));}
  await a.waitOnline();assert.equal((await a.dbg('net')).unavailableHome,false);assert.equal(await a.eval('document.getElementById("home-connection-notice").hidden'),true);
  await a.waitFor('window.__diceDebug.settings.tableName==="Outage guest game"');await a.roll('1d6');assert.deepEqual(a.page.errors,[]);
});
