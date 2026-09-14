/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Browser} from './e2e/cdp.mjs';
import {Table} from './e2e/harness.mjs';
import {click,afterJoin} from '../tools/staging-account-browser.mjs';

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
