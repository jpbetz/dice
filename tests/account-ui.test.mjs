/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Browser} from './e2e/cdp.mjs';
import {Ctx,freePort,startServer} from './e2e/harness.mjs';

const click=(a,id)=>a.eval(`document.getElementById(${JSON.stringify(id)}).click()`);
const state=a=>a.dbg('privateLibrary.state');
const snapshot=async a=>(await a.dbg('privateLibrary.snapshot()')).document;
const names=async a=>(await snapshot(a)).profiles.profiles.map(p=>p.name);
async function open(a){await a.dbg('privateLibrary.open()');await a.waitFor('document.getElementById("account-create") && window.__diceDebug.privateLibrary.state?.ready');await a.waitFor('!document.getElementById("account-refresh").disabled');}
async function idle(a){await a.waitFor('!document.getElementById("account-refresh").disabled');}
async function register(a,name){
  await a.waitFor('!document.getElementById("account-create").disabled');await click(a,'account-create');
  // Held only in the test process. Never print a recovery key or include it in assertions.
  const key=await a.eval('document.getElementById("account-key").value');
  await a.eval(`document.getElementById('account-name').value=${JSON.stringify(name)};document.getElementById('account-key-kept').checked=true;document.getElementById('account-key-kept').dispatchEvent(new Event('change'));document.getElementById('account-submit').click()`);
  await a.waitFor('!!window.__diceDebug.privateLibrary.state?.person');await idle(a);
  assert.equal(await a.eval('document.getElementById("account-key").value.length'),0);
  return {key,id:(await state(a)).person.id};
}
async function fillRecovery(a,key){
  // CDP arguments stay out of Page.eval's error-expression diagnostic.
  const node=await a.page.browser.send('Runtime.evaluate',{expression:'document.getElementById("account-key")'},a.page.sessionId);
  const result=await a.page.browser.send('Runtime.callFunctionOn',{objectId:node.result.objectId,functionDeclaration:'function(value){this.value=value}',arguments:[{value:key}]},a.page.sessionId);
  if(result.exceptionDetails)throw new Error('Could not fill recovery input');
}
async function recover(a,key){await click(a,'account-recover');await fillRecovery(a,key);await click(a,'account-submit');await idle(a);}
async function compare(a){await click(a,'account-compare');await a.waitFor('!document.getElementById("account-comparison").hidden');await idle(a);}
async function choose(a,choice='local',dice){await a.eval(`document.getElementById('account-choice-${choice}').click()`);if(dice)await a.eval(`const s=document.getElementById('account-dice-choice');s.value=${JSON.stringify(dice)};s.dispatchEvent(new Event('change'))`);await click(a,'account-enable-sync');await idle(a);assert.equal((await state(a)).syncEnabled,true);}
async function flush(a){await a.dbg('privateLibrary.settled()');await click(a,'account-sync-retry');await idle(a);}
async function remote(a){return a.eval(`(async()=>{const s=await (await fetch('/api/account/session')).json();return (await fetch('/api/account/library',{headers:{'X-Dice-Person':s.person.id}})).json()})()`);}
async function rename(a,name){const id=(await a.dbg('profiles.active')).id;assert.equal((await a.dbg(`profiles.rename(${JSON.stringify(id)},${JSON.stringify(name)})`)).ok,true);await a.dbg('privateLibrary.settled()');}
async function reload(a){await a.page.navigate(a.url);await a.waitFor('!!window.__diceDebug?.privateLibrary');await a.waitOnline();await open(a);}
async function setup(t,enabled=true){
  const port=await freePort(),directory=await mkdtemp(join(tmpdir(),'dice-app-account-'));
  const env=enabled?{DICE_ACCOUNT_STORE:'file',DICE_ACCOUNT_DIR:directory,DICE_ACCOUNT_ORIGIN:`http://127.0.0.1:${port}`}:{DICE_ACCOUNT_STORE:'off'};
  let server=await startServer(port,{env});const browsers=[],contexts=[];
  t.after(async()=>{for(const ctx of contexts)await ctx.closeAll();for(const b of browsers)await b.close();await stop();await rm(directory,{recursive:true,force:true});});
  async function stop(){if(server?.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await exited;}}
  return {async context(name){const b=await new Browser().launch();browsers.push(b);const ctx=new Ctx(b,port,name,server);contexts.push(ctx);return ctx;},async restart(){await stop();server=await startServer(port,{env});}};
}

test('actual app: recovery, explicit merge/dice choice, offline retry, restart, in-flight edits and protected history',async t=>{
  const fixture=await setup(t),ctx=await fixture.context('account-app-main');const a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});
  await a.dbg("profiles.create('Guest original')");await open(a);const guest=await snapshot(a),account=await register(a,'Sam');
  assert.equal((await state(a)).syncEnabled,false);assert.equal((await remote(a)).document,null);
  await compare(a);await choose(a);await flush(a);assert.deepEqual((await remote(a)).document,guest);
  await rename(a,'Private wizard');await a.dbg("setDiceSet('symbols.fate')");await a.dbg('openDiceGallery()');await a.eval("document.querySelector('.dg-current').click();document.querySelector('.dg-favorite').click();document.querySelector('.dg-close').click()");await flush(a);
  assert.deepEqual((await snapshot(a)).dice.favorites,['symbols.fate']);
  const browser=a.page.browser;await browser.send('Network.enable',{},a.page.sessionId);await browser.send('Network.setBlockedURLs',{urls:['*api/account*']},a.page.sessionId);
  await rename(a,'Offline wizard');await flush(a);assert.equal((await state(a)).error,'account_unavailable');assert.ok((await names(a)).includes('Offline wizard'));
  // Reload still offers the durable private copy while the service is unreachable.
  await reload(a);await a.waitFor('document.getElementById("account-device-copy")&&!document.getElementById("account-device-copy").hidden');await click(a,'account-device-copy');await idle(a);
  assert.ok((await names(a)).includes('Offline wizard'));assert.equal((await state(a)).blocked,true);await rename(a,'Offline after reload');
  await browser.send('Network.setBlockedURLs',{urls:[]},a.page.sessionId);await click(a,'account-refresh');await idle(a);assert.equal((await state(a)).namespace,account.id);await flush(a);
  assert.ok((await remote(a)).document.profiles.profiles.some(p=>p.name==='Offline after reload'));
  // Real HTTP response held through a second durable editor change.
  let held=null,hold=true;browser.on('Fetch.requestPaused',p=>{if(hold&&p.request.method==='POST'&&p.request.url.endsWith('/library')){hold=false;held=p.requestId;}else browser.send('Fetch.continueRequest',{requestId:p.requestId},a.page.sessionId).catch(()=>{});},a.page.sessionId);
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/api/account/library',requestStage:'Request'}]},a.page.sessionId);
  await rename(a,'First in-flight edit');await click(a,'account-sync-retry');
  for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,20));assert.ok(held,'actual account save is held');
  await rename(a,'Second in-flight edit');await new Promise(r=>setTimeout(r,1650));await browser.send('Fetch.continueRequest',{requestId:held},a.page.sessionId);await idle(a);
  assert.ok((await remote(a)).document.profiles.profiles.some(p=>p.name==='Second in-flight edit'));
  await browser.send('Fetch.disable',{},a.page.sessionId);
  // Separate Chrome profile, same origin: guest starts separately and recovering does not replace it.
  await fixture.restart();const other=await fixture.context('account-app-other'),b=await other.newTable({origin:'127.0.0.1',name:'Bob'});
  await b.dbg("profiles.create('Other device original')");await open(b);const before=await snapshot(b);await recover(b,account.key);
  assert.equal((await state(b)).namespace,account.id);assert.equal((await state(b)).syncEnabled,false);assert.deepEqual(await snapshot(b),before);
  await compare(b);assert.deepEqual(await snapshot(b),before);await b.eval("document.getElementById('account-choice-merge').click()");
  assert.equal(await b.eval('document.getElementById("account-enable-sync").disabled'),true,'unequal dice require a choice');
  await choose(b,'merge','remote');await flush(b);assert.ok((await names(b)).includes('Other device original'));assert.ok((await names(b)).includes('Second in-flight edit'));
  assert.equal((await snapshot(b)).dice.defaultSet,'symbols.fate');assert.deepEqual((await snapshot(b)).dice.favorites,['symbols.fate']);assert.deepEqual(await b.dbg('profiles.shared'),[]);
  // The actual cleanup UI offers only eligible saved ancestors and requires acknowledgment.
  await rename(b,'History revision one');await flush(b);await rename(b,'History revision two');await flush(b);await click(b,'account-history');await b.waitFor('!document.getElementById("account-history-panel").hidden');await idle(b);
  assert.equal(await b.eval('document.getElementById("account-archive").disabled'),true);
  const previous=await remote(b);assert.ok(previous.versions.some(v=>v.canArchive));
  await b.eval("const c=document.querySelector('#account-history-list input:not(:disabled)');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('account-archive-ack').checked=true;document.getElementById('account-archive-ack').dispatchEvent(new Event('change'))");await click(b,'account-archive');await idle(b);
  const after=await remote(b);assert.equal(after.versions.length,previous.versions.length-1);assert.equal(after.headRevision,previous.headRevision);assert.ok(after.versions.some(v=>v.kind==='retained-original'));
  // Actual download bytes include kept local originals but no recovery credential.
  await b.eval("window.__downloads=[];window.__createObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{window.__downloads.push(blob.text());return window.__createObjectURL(blob)}");await click(b,'account-export-originals');await idle(b);
  const exported=await b.eval('Promise.all(window.__downloads)');assert.equal(exported.length,1);assert.ok(exported[0].includes('Other device original'));assert.equal(exported[0].includes(account.key),false);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});

test('actual app: namespace switch, table publication, shared-cookie refusal and retained competing tab edits',async t=>{
  const fixture=await setup(t),ctx=await fixture.context('account-app-boundary'),a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});
  const observer=await ctx.rawPlayer('Observer');
  await a.dbg("profiles.create('Guest original')");await open(a);const guest=await snapshot(a),one=await register(a,'One');await compare(a);await choose(a);await flush(a);await rename(a,'One private');await flush(a);
  const oneProfile=(await a.dbg('profiles.active')).id;assert.equal(await a.dbg(`profiles.share(${JSON.stringify(oneProfile)},true)`),true);
  const b=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});await open(b);await b.waitFor(`window.__diceDebug.privateLibrary.state?.namespace===${JSON.stringify(one.id)}`);assert.ok((await names(b)).includes('One private'));
  await rename(a,'First tab wins');await rename(b,'Second tab kept');assert.equal((await state(b)).error,'local_conflict');assert.ok((await names(b)).includes('Second tab kept'));
  await click(b,'account-export-originals');await idle(b);
  // Refuse a real cookie-changing recovery after withdrawal was blocked. Cookie changes before the hook.
  const separate=await fixture.context('account-app-person-two'),c=await separate.newTable({origin:'127.0.0.1',name:'Charlie'});await open(c);const two=await register(c,'Two');
  await compare(a);await click(a,'account-history');await idle(a);
  await a.page.browser.send('Network.enable',{},a.page.sessionId);await a.page.browser.send('Network.setBlockedURLs',{urls:['*/api/pools']},a.page.sessionId);
  await recover(a,two.key);assert.equal((await state(a)).namespace,one.id);assert.equal((await state(a)).blocked,true,'failed live withdrawal refuses identity adoption');
  assert.equal(await a.eval('document.getElementById("account-comparison").hidden && document.getElementById("account-history-panel").hidden'),true);
  assert.equal(await a.eval('document.getElementById("account-local-preview").textContent.length + document.getElementById("account-history-list").textContent.length'),0);
  await a.page.browser.send('Network.setBlockedURLs',{urls:[]},a.page.sessionId);await recover(a,one.key);
  await a.eval("window.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='dice.profile-sharing.v1')throw new DOMException('Blocked test write','QuotaExceededError');return window.__originalSetItem.call(this,k,v)}");
  await recover(a,two.key);assert.equal((await state(a)).namespace,one.id);assert.equal((await state(a)).blocked,true);assert.ok((await names(a)).includes('First tab wins'));
  await b.waitFor('window.__diceDebug.privateLibrary.state.blocked');assert.ok((await names(b)).includes('Second tab kept'));
  assert.equal(await a.eval("(async()=>{const r=await(await fetch('/api/account/session')).json();return r.person.id})()"),two.id,'real Set-Cookie changed before refused app adoption');
  assert.deepEqual(await a.dbg('profiles.shared'),[]);
  await a.eval('Storage.prototype.setItem=window.__originalSetItem');await click(a,'account-refresh');await idle(a);assert.equal((await state(a)).namespace,two.id);assert.equal((await state(a)).syncEnabled,false);
  await rename(a,'Two private');await click(a,'account-logout');await idle(a);assert.equal((await state(a)).namespace,'guest');assert.deepEqual(await snapshot(a),guest);
  await recover(a,one.key);assert.ok((await names(a)).includes('First tab wins'));assert.deepEqual(await a.dbg('profiles.shared'),[]);
  await click(b,'account-refresh');await idle(b);assert.ok((await names(b)).includes('Second tab kept'),'same-person refresh never adopts IDB winner over stale tab');await compare(b);
  assert.ok(await b.eval("document.getElementById('account-local-preview').textContent.includes('Second tab kept')"));await choose(b,'local');await flush(b);assert.ok((await remote(b)).document.profiles.profiles.some(p=>p.name==='Second tab kept'));
  await a.dbg('publishPools()');const late=await ctx.rawPlayer('After account switch');const me=late.joinPayload.players.find(p=>p.id===(observer.joinPayload.players.find(p=>p.name==='Alice')?.id));
  assert.ok(!observer.raw.includes('Two private'));assert.ok(!observer.raw.includes(two.key));assert.ok(!JSON.stringify(late.joinPayload).includes('Two private'));assert.deepEqual(me?.library||[],[]);
  // A preview response from the previous identity must not repopulate its
  // hidden details after another real tab replaces the shared cookie.
  let heldPreview=null;const browser=a.page.browser;
  browser.on('Fetch.requestPaused',p=>{if(!heldPreview){heldPreview=p.requestId;}else browser.send('Fetch.continueRequest',{requestId:p.requestId},a.page.sessionId).catch(()=>{});},a.page.sessionId);
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/api/account/library',requestStage:'Response'}]},a.page.sessionId);await click(a,'account-compare');
  for(let n=0;n<100&&!heldPreview;n++)await new Promise(r=>setTimeout(r,20));assert.ok(heldPreview);
  await recover(b,two.key);await a.waitFor('window.__diceDebug.privateLibrary.state.blocked');
  await browser.send('Fetch.continueRequest',{requestId:heldPreview},a.page.sessionId);await idle(a);
  assert.equal(await a.eval('document.getElementById("account-comparison").hidden'),true);assert.equal(await a.eval('document.getElementById("account-local-preview").textContent.length'),0);
  await browser.send('Fetch.disable',{},a.page.sessionId);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);assert.deepEqual(c.page.errors,[]);
});

test('actual app on service-absent host keeps guest play and export available',async t=>{
  const fixture=await setup(t,false),ctx=await fixture.context('account-app-static'),a=await ctx.newTable({origin:'127.0.0.1',name:'Guest'});await open(a);
  await a.waitFor('document.getElementById("account-notice").textContent.includes("unavailable here")');assert.equal(await a.eval('document.getElementById("account-create").disabled'),true);
  assert.equal((await a.dbg("profiles.create('Local only')")).ok,true);await a.dbg('privateLibrary.settled()');assert.equal((await state(a)).namespace,'guest');assert.equal(await a.eval('document.getElementById("account-export-current").disabled'),false);
  await a.dbg('workspaces.close()');await a.roll('1d6');assert.deepEqual(a.page.errors,[]);
});

test('actual app: late edits during held publication and committed IDB handoffs abort adoption and remain exportable',async t=>{
  const fixture=await setup(t),ctx=await fixture.context('account-app-races'),a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});await open(a);const one=await register(a,'One');await compare(a);await choose(a);await flush(a);
  const separate=await fixture.context('account-app-race-two'),b=await separate.newTable({origin:'127.0.0.1',name:'Bob'});await open(b);const two=await register(b,'Two');
  let hold=true,held=null;const browser=a.page.browser;
  browser.on('Fetch.requestPaused',p=>{if(hold&&p.request.method==='POST'){hold=false;held=p.requestId;}else browser.send('Fetch.continueRequest',{requestId:p.requestId},a.page.sessionId).catch(()=>{});},a.page.sessionId);
  
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/api/pools',requestStage:'Request'}]},a.page.sessionId);
  await click(a,'account-recover');await fillRecovery(a,two.key);await click(a,'account-submit');
  for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,20));assert.ok(held);
  
  assert.equal(await a.eval("(async()=>{const r=await(await fetch('/api/account/session')).json();return r.person.id})()"),two.id);
  await rename(a,'During withdrawal');await browser.send('Fetch.continueRequest',{requestId:held},a.page.sessionId);await idle(a);
  assert.equal((await state(a)).namespace,one.id);assert.equal((await state(a)).blocked,true);assert.ok((await names(a)).includes('During withdrawal'));
  await browser.send('Fetch.disable',{},a.page.sessionId);await recover(a,one.key);await flush(a);
  // Delay only delivery of a real completed read transaction. The original
  // IDB document exists, and another real IDB edit can commit during this gap.
  await a.eval(`window.__idbGet=IDBObjectStore.prototype.get;window.__txComplete=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');window.__holdIdb='read';window.__idbHeld=false;
    IDBObjectStore.prototype.get=function(key){this.transaction.__libraryKey=key;return window.__idbGet.call(this,key)};
    Object.defineProperty(IDBTransaction.prototype,'oncomplete',{configurable:true,get:window.__txComplete.get,set:function(fn){const tx=this;window.__txComplete.set.call(tx,function(event){if(window.__holdIdb==='read'&&tx.mode==='readonly'&&tx.__libraryKey===${JSON.stringify(two.id)}||window.__holdIdb==='choose'&&tx.mode==='readwrite'&&tx.__libraryKey===${JSON.stringify(one.id)}){window.__holdIdb=null;window.__idbHeld=true;window.__releaseIdb=()=>fn.call(tx,event)}else fn.call(tx,event)})}});true`);
  await click(a,'account-recover');await fillRecovery(a,two.key);await click(a,'account-submit');await a.waitFor('window.__idbHeld');
  await rename(a,'During namespace read');await a.eval('window.__releaseIdb()');await idle(a);assert.equal((await state(a)).namespace,one.id);assert.equal((await state(a)).blocked,true);assert.ok((await names(a)).includes('During namespace read'));
  await recover(a,one.key);await compare(a);await a.eval("window.__holdIdb='choose';window.__idbHeld=false;document.getElementById('account-choice-local').click();document.getElementById('account-enable-sync').click()");await a.waitFor('window.__idbHeld');
  await rename(a,'During chosen library');await a.eval('window.__releaseIdb()');await idle(a);assert.equal((await state(a)).blocked,true);assert.ok((await names(a)).includes('During chosen library'));
  await a.eval("IDBObjectStore.prototype.get=window.__idbGet;Object.defineProperty(IDBTransaction.prototype,'oncomplete',window.__txComplete);window.__downloads=[];window.__createObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{window.__downloads.push(blob.text());return window.__createObjectURL(blob)}");await click(a,'account-export-originals');await idle(a);
  const exported=await a.eval('Promise.all(window.__downloads)');assert.ok(exported[0].includes('During chosen library'));assert.ok(exported[0].includes('During namespace read'));assert.equal(exported[0].includes(two.key),false);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});


test('actual guest tabs can choose a kept device version without an account or discarding originals',async t=>{
  const fixture=await setup(t,false),ctx=await fixture.context('guest-library-choice');
  const a=await ctx.newTable({origin:'127.0.0.1',name:'Guest'});await open(a);
  const b=await ctx.newTable({origin:'127.0.0.1',name:'Guest'});await open(b);
  await rename(a,'First guest tab');await rename(b,'Second guest tab');assert.equal((await state(b)).error,'local_conflict');
  assert.equal(await b.eval('document.getElementById("account-compare").hidden'),false);await compare(b);
  assert.equal(await b.eval('document.getElementById("account-enable-sync").textContent'),'Use this device version');
  await click(b,'account-enable-sync');await idle(b);assert.ok((await names(b)).includes('Second guest tab'));
  assert.equal((await state(b)).namespace,'guest');assert.equal((await state(b)).syncEnabled,false);assert.equal((await state(b)).error,null);
  await b.eval("window.__downloads=[];window.__createObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{window.__downloads.push(blob.text());return window.__createObjectURL(blob)}");await click(b,'account-export-originals');await idle(b);
  const exported=await b.eval('Promise.all(window.__downloads)');assert.ok(exported[0].includes('First guest tab'));assert.ok(exported[0].includes('Second guest tab'));
  await rename(b,'Chosen and edited');await reload(b);assert.ok((await names(b)).includes('Chosen and edited'));assert.equal((await state(b)).syncEnabled,false);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});
