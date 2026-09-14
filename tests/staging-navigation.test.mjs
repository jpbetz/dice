/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {Browser} from './e2e/cdp.mjs';
import {Table} from './e2e/harness.mjs';
import {appServer} from './fixtures/app-server.mjs';
import {click,hover,afterJoin,frameScreenshot,homeCardsReady,browserTable,register,accountApi,workspace} from '../tools/staging-account-browser.mjs';

test('staging return survives a real old-context teardown and still requires the destination live join',{timeout:30000},async t=>{
  const server=http.createServer((req,res)=>{
    res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
    res.end(`<!doctype html><button id="go" onclick="location.href='/?room=destination'">Join</button>
      <button id="release" onclick="releaseReady({online:true})">Complete join</button><script>
      let releaseReady;window.__diceDebug={busy:false,sim(){},net:{online:true,unavailableHome:false},netReady:new URL(location.href).searchParams.get('room')==='destination'?new Promise(r=>releaseReady=r):Promise.resolve({online:true})};
      </script>`);
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));assert.notEqual(server.address().port,8123);
  const browser=await new Browser().launch();
  t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
  const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port,table=new Table(page,origin+'/?room=source'),raw=page.eval.bind(page);
  async function destinationLoaded(){
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){try{if(await raw('new URL(location.href).searchParams.get("room")==="destination"&&!!document.getElementById("release")'))return;}catch(error){if(!/context|navigation/i.test(error.message))throw error;}await new Promise(r=>setTimeout(r,25));}
    throw new Error('fixture destination did not load');
  }
  async function attempt(waiter){
    page.eval=raw;await page.navigate(table.url);await table.waitFor('!!document.getElementById("go")');
    const previous=await raw('performance.timeOrigin');
    // Capture an actual CDP error: a request awaiting an old-document Promise
    // spans the real pointer-triggered navigation. Deliver that error to the
    // first readiness poll, the exact seam which used to abort the verifier.
    const interrupted=raw('new Promise(()=>{})').then(()=>null,error=>error);await raw('1');
    let injected=false,finished=false,result;
    page.eval=async expression=>{if(!injected&&expression.includes('staging navigation readiness')){injected=true;const error=await interrupted;assert.match(error.message,/^CDP (Execution context was destroyed|Inspected target navigated or closed|Cannot find context)/);throw error;}return raw(expression);};
    await click(table,'#go');
    const pending=waiter(table,'destination',{previous,timeout:3000}).then(()=>{finished=true;},error=>{finished=true;result=error;});
    await destinationLoaded();await new Promise(r=>setTimeout(r,150));
    if(waiter===afterJoin){assert.equal(finished,false,'new URL and DOM do not replace the live-join promise: '+(result?.message||'completed'));await click(table,'#release');}
    await pending;page.eval=raw;assert.equal(injected,true);return result;
  }
  const legacy=async table=>{await table.eval('/* staging navigation readiness */ !!window.__diceDebug?.netReady');await table.waitOnline();await table.settle();};
  assert.match((await attempt(legacy)).message,/^CDP (Execution context was destroyed|Inspected target navigated or closed|Cannot find context)/,'the prior unguarded wait aborts on the actual error');
  assert.equal(await attempt(afterJoin),undefined);
  await assert.rejects(afterJoin(table,'wrong-room',{timeout:150}),/Timed out/);
  await assert.rejects(afterJoin(table,'destination',{previous:await raw('performance.timeOrigin'),timeout:150}),/Timed out/);
  const savedUrl=table.url;table.url='http://different.invalid/?room=destination';await assert.rejects(afterJoin(table,'destination',{timeout:150}),/Timed out/);table.url=savedUrl;
  await raw('window.__diceDebug.net.online=false;true');await assert.rejects(afterJoin(table,'destination',{timeout:150}),/Timed out/);await raw('window.__diceDebug.net.online=true;window.__diceDebug.net.unavailableHome=true;true');
  await assert.rejects(afterJoin(table,'destination'),/destination home must be available/);await raw('window.__diceDebug.net.unavailableHome=false;true');
  await raw('window.__diceDebug.netReady=new Promise(()=>{});true');await assert.rejects(afterJoin(table,'destination',{timeout:150}),/Timed out waiting for live destination readiness/);
  await raw('window.__diceDebug.netReady=Promise.resolve({online:false})');await assert.rejects(afterJoin(table,'destination'),/destination must join the live server/);
  await raw('Object.defineProperty(window.__diceDebug,"netReady",{get(){throw new Error("CDP Execution context was destroyed");}});true');await assert.rejects(afterJoin(table,'destination'),/page eval failed:.*Execution context was destroyed/s);
  assert.deepEqual(page.errors,[]);
});

test('actual phone screenshot frames both expected saved-home names after the list is ready',{timeout:45000},async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'dice-capture-homes-')),app=await appServer(directory);
  let session;t.after(async()=>{await session?.close();await app.stop();await fs.rm(directory,{recursive:true,force:true});});
  session=await browserTable(app.origin,'Capture fixture',{phone:true});const table=session.table;
  const person=await register(table,'Capture fixture',async()=>{}),homes=[];
  for(const name of ['Lantern table','Harbor club']){const result=await accountApi(table,'createHome',person,{operationId:crypto.randomUUID(),name});assert.equal(result.ok,true);homes.push(result.home);}
  await workspace(table,'tables');await homeCardsReady(table,homes);
  const content=homes.map(h=>`#homes-cards [data-home-id="${h.id}"] h4`);
  await frameScreenshot(table,'#homes-cards',{content});
  assert.deepEqual(await table.eval('[innerWidth,innerHeight]'),[390,844]);
  assert.equal(await table.eval('Array.from(document.querySelectorAll("#account-key,#people-own-code,#people-contact-code")).some(el=>el.value&&el.checkVisibility())'),false);
  if(process.env.DICE_CAPTURE_PROOF_DIR){const dir=path.resolve(process.env.DICE_CAPTURE_PROOF_DIR);assert.ok(dir.startsWith(os.tmpdir()+'/'));await fs.mkdir(dir,{mode:0o700,recursive:true});assert.equal((await fs.lstat(dir)).mode&0o077,0);const file=path.join(dir,'phone-both-homes.png');await fs.writeFile(file,'',{mode:0o600,flag:'wx'});await table.page.screenshot(file);}
  await table.eval('document.getElementById("homes-cards").hidden=true;true');await assert.rejects(frameScreenshot(table,'#homes-cards',{content}),/target is rendered/);
  assert.deepEqual(table.page.errors,[]);
});

test('screenshot framing accepts a tall clipped container while real input still requires a visible hit',{timeout:30000},async t=>{
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{margin:0}#homes-workspace{position:fixed;inset:100px 0 100px;background:white;overflow:clip}#homes-cards{height:2400px;padding:12px;background:#eee}button{height:48px}#covered{position:fixed;left:10px;bottom:10px}#cover{position:fixed;left:0;bottom:0;width:200px;height:80px;background:#aaa}
    </style><section id="homes-workspace"><div id="homes-cards"><button id="real" onclick="window.clicked=true">Join fixture</button></div></section><button id="covered">Covered</button><div id="cover"></div><div id="hidden" hidden>Hidden</div>`);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));assert.notEqual(server.address().port,8123);
  const browser=await new Browser().launch();t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
  const page=await browser.newPage(),table=new Table(page,'http://127.0.0.1:'+server.address().port);
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},page.sessionId);
  await page.navigate(table.url);await table.waitFor('!!document.getElementById("homes-cards")');
  assert.deepEqual(await table.eval('[innerWidth,innerHeight]'),[390,844]);
  await assert.rejects(hover(table,'#homes-cards'),/visible input target/,'old capture path fails on the clipped midpoint');
  await frameScreenshot(table,'#homes-cards');
  assert.equal(await table.eval('document.getElementById("homes-workspace").scrollTop'),0);
  await click(table,'#real');assert.equal(await table.eval('window.clicked'),true);
  await assert.rejects(click(table,'#covered'),/visible input target/,'capture framing never weakens real input');
  await assert.rejects(frameScreenshot(table,'#missing'),/target is rendered/);
  await assert.rejects(frameScreenshot(table,'#hidden'),/target is rendered/);
  await assert.rejects(frameScreenshot(table,'#covered'),/unoccluded viewport area/);
  assert.deepEqual(page.errors,[]);
});
