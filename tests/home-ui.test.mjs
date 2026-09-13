/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Browser} from './e2e/cdp.mjs';
import {Ctx,freePort,startServer} from './e2e/harness.mjs';
const click=(a,id)=>a.eval(`document.getElementById(${JSON.stringify(id)}).click()`);
const hs=a=>a.dbg('homes.state');
const idle=a=>a.waitFor('!window.__diceDebug.homes.state?.loading&&!document.getElementById("homes-refresh")?.disabled');
async function account(a,key){await a.dbg('privateLibrary.open()');await a.waitFor('document.getElementById("account-create")&&!document.getElementById("account-recover").disabled');
  if(key){await click(a,'account-recover');const node=await a.page.browser.send('Runtime.evaluate',{expression:'document.getElementById("account-key")'},a.page.sessionId);await a.page.browser.send('Runtime.callFunctionOn',{objectId:node.result.objectId,functionDeclaration:'function(value){this.value=value}',arguments:[{value:key}]},a.page.sessionId);await click(a,'account-submit');}
  else{await click(a,'account-create');key=await a.eval('document.getElementById("account-key").value');await a.eval("document.getElementById('account-name').value='Sam';document.getElementById('account-key-kept').checked=true;document.getElementById('account-key-kept').dispatchEvent(new Event('change'));document.getElementById('account-submit').click()");}
  await a.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&!document.getElementById("account-refresh").disabled');return key;
}
async function homes(a){await a.dbg('homes.open()');await a.waitFor('!!window.__diceDebug.homes.state');await idle(a);}
async function capture(a){await click(a,'homes-capture');await a.waitFor('!!window.__diceDebug.homes.state.preview');await idle(a);}
async function save(a){await click(a,'home-save');await idle(a);}
async function manage(a,id){await a.eval(`document.querySelector('[data-home-id="${id}"] button').click()`);await a.waitFor(`window.__diceDebug.homes.state.selected?.id===${JSON.stringify(id)}`);await idle(a);}
async function renameTable(ctx,a,name){assert.equal((await ctx.api('/api/settings',{playerId:await a.playerId(),settings:{tableName:name}})).ok,true);await a.waitFor(`window.__diceDebug.settings.tableName===${JSON.stringify(name)}`);}
async function version(a,id){await a.eval(`(()=>{const s=document.getElementById('home-versions');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change'));})()`);await a.waitFor('window.__diceDebug.homes.state.preview?.kind==="reconcile"');await idle(a);}
async function remote(a,id){return a.eval(`(async()=>{const s=await(await fetch('/api/account/session')).json();return (await fetch('/api/account/homes/'+${JSON.stringify(id)},{headers:{'X-Dice-Person':s.person.id}})).json()})()`);}
async function fixture(t){const port=await freePort(),directory=await mkdtemp(join(tmpdir(),'dice-home-app-'));const env={DICE_ACCOUNT_STORE:'file',DICE_ACCOUNT_DIR:directory,DICE_ACCOUNT_ORIGIN:`http://127.0.0.1:${port}`};let server=await startServer(port,{env});const contexts=[],browsers=[];
  async function stop(){if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}}
  t.after(async()=>{for(const c of contexts)await c.closeAll();for(const b of browsers)await b.close();await stop();await rm(directory,{recursive:true,force:true});});
  return {port,async context(room,browser=null){if(!browser){browser=await new Browser().launch();browsers.push(browser);}const c=new Ctx(browser,port,room,server);contexts.push(c);return c;},async restart(){await stop();server=await startServer(port,{env});}};
}

test('actual app saves a public home without library sync; explicit clean-browser join restores after restart and never repushes old client setup',async t=>{
  const f=await fixture(t),ctx=await f.context('home-app-return'),a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});
  await renameTable(ctx,a,'The Copper Lantern');const key=await account(a);
  await a.dbg("profiles.copyFrom({name:'Private wizard',system:'none',pools:[{name:'Private spell',notation:'3d6'}]},true)");
  await a.roll('3d6 t3 secret');const turn=await a.rollId();await a.dbg('pickToggle(0)');
  await a.eval("const input=document.getElementById('cmd-input');input.value='2d8+4 secret # Kept draft';input.dispatchEvent(new Event('input',{bubbles:true}))");await a.waitFor('window.__diceDebug.trayState.dice.length===2');
  const draft=await a.dbg('trayState'),before=await a.dbg(`turnState(${JSON.stringify(turn)})`),pid=await a.playerId(),url=await a.eval('location.href');
  await homes(a);await capture(a);const preview=(await hs(a)).preview.document;
  assert.deepEqual(Object.keys(preview).sort(),['schema','settings','setup']);assert.equal(JSON.stringify(preview).includes('Private spell'),false);assert.equal(preview.setup,null);
  assert.equal((await a.dbg('privateLibrary.state')).syncEnabled,false);assert.deepEqual(await a.dbg('trayState'),draft);assert.deepEqual(await a.dbg(`turnState(${JSON.stringify(turn)})`),before);
  await save(a);let state=await hs(a);assert.equal(state.cards.length,1);const home=state.cards[0];assert.equal(home.roomKey,ctx.room);
  assert.equal(await a.playerId(),pid);assert.equal(await a.eval('location.href'),url);assert.deepEqual(await a.dbg('trayState'),draft);assert.deepEqual(await a.dbg(`turnState(${JSON.stringify(turn)})`),before);
  await click(a,'home-detail-back');await click(a,'homes-new');await a.eval("document.getElementById('homes-new-name').value='The Navigation Club';document.getElementById('homes-new-form').requestSubmit()");await idle(a);await save(a);
  assert.equal((await hs(a)).cards.length,2);assert.equal(await a.eval('location.href'),url,'new home creation does not join');assert.deepEqual(await a.dbg('trayState'),draft);
  // A real former organizer cache would otherwise overwrite restored setup:null.
  await a.eval(`localStorage.setItem('dice.table.v1:'+${JSON.stringify(ctx.room)},JSON.stringify({rev:999,table:{tableName:'Obsolete organizer table',felt:'emerald'},profiles:[{name:'Old prepared rack',system:'none',pools:[{name:'Old roll',notation:'1d4'}]}]}))`);
  await a.close();await f.restart();
  const clean=await f.context('arrival-before-home'),b=await clean.newTable({origin:'127.0.0.1',name:'Bob'});await account(b,key);await homes(b);
  assert.equal((await hs(b)).cards.length,2);assert.equal((await b.dbg('privateLibrary.state')).syncEnabled,false);
  await b.eval(`document.querySelector('[data-home-id="${home.id}"] button:nth-child(2)').click()`);
  for(let n=0;n<100;n++){try{if(await b.eval(`location.search===${JSON.stringify('?room='+ctx.room)}&&!!window.__diceDebug?.netReady`))break;}catch{}await new Promise(r=>setTimeout(r,30));}
  await b.waitOnline();assert.equal((await b.dbg('net')).savedHome,true);assert.equal((await b.dbg('settings')).tableName,'The Copper Lantern');
  const liveCtx=new Ctx(b.page.browser,f.port,ctx.room);await renameTable(liveCtx,b,'Live guest change');
  const returning=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});await returning.waitFor('window.__diceDebug.settings.tableName==="Live guest change"');
  assert.equal((await returning.dbg('net')).savedHome,true);assert.equal(await returning.dbg('repushTable()'),false);
  assert.equal((await remote(returning,home.id)).document.settings.tableName,'The Copper Lantern');
  const outsider=await ctx.rawPlayer('Observer');assert.equal(JSON.stringify(outsider.joinPayload).includes('Old prepared rack'),false);assert.equal(JSON.stringify(outsider.joinPayload).includes('Private spell'),false);
  assert.deepEqual(b.page.errors,[]);assert.deepEqual(returning.page.errors,[]);
});

test('actual home UI retains failed captures and exact retries, resolves a competing saved version, and leaves membership without leaving play',async t=>{
  const f=await fixture(t),ctx=await f.context('home-app-conflict'),a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});await renameTable(ctx,a,'Original home');const key=await account(a);await homes(a);await capture(a);await save(a);const home=(await hs(a)).cards[0];
  const other=await f.context(ctx.room),b=await other.newTable({origin:'127.0.0.1',name:'Bob'});await account(b,key);await homes(b);
  await renameTable(ctx,a,'Competing live setup');await capture(b);
  // Advance only the saved head while Bob reviews a different live capture.
  await version(a,home.headRevision);await save(a);await save(b);assert.equal((await hs(b)).error,'home_conflict');assert.equal((await hs(b)).preview.document.settings.tableName,'Competing live setup');
  const conflict=(await remote(b,home.id)).versions.find(v=>v.kind==='conflict');assert.ok(conflict);
  await b.eval("[...document.querySelectorAll('.home-kept-row button')].find(b=>b.textContent==='Review saved versions').click()");await idle(b);await version(b,conflict.id);await save(b);
  assert.equal((await remote(b,home.id)).document.settings.tableName,'Competing live setup');assert.equal((await a.dbg('settings')).tableName,'Competing live setup');
  await click(b,'home-detail-back');await capture(b);await renameTable(ctx,a,'A later live change');await save(b);assert.equal((await hs(b)).error,'capture_changed');assert.equal((await hs(b)).preview.document.settings.tableName,'Competing live setup');
  await b.eval("window.__homeDownloads=[];window.__originalObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{window.__homeDownloads.push(blob.text());return window.__originalObjectURL(blob)}");await click(b,'home-export-preview');
  assert.ok((await b.eval('Promise.all(window.__homeDownloads)'))[0].includes('Competing live setup'));
  await click(b,'home-recapture');await idle(b);assert.equal((await hs(b)).preview.document.settings.tableName,'A later live change');
  await b.page.browser.send('Network.enable',{},b.page.sessionId);await b.page.browser.send('Network.setBlockedURLs',{urls:['*/api/account/homes/*']},b.page.sessionId);await save(b);
  let pending=(await hs(b)).records.find(r=>r.status==='pending');assert.ok(pending);assert.equal((await hs(b)).preview.document.settings.tableName,'A later live change');
  await b.reload();await homes(b);assert.ok((await hs(b)).records.some(r=>r.id===pending.id),'real IDB retry survives app reload');
  await b.page.browser.send('Network.setBlockedURLs',{urls:[]},b.page.sessionId);await b.eval(`document.querySelector('[data-operation="${pending.id}"] button:nth-of-type(2)').click()`);await idle(b);
  assert.equal((await hs(b)).records.find(r=>r.id===pending.id).status,'saved');assert.equal((await remote(b,home.id)).document.settings.tableName,'A later live change');
  const versionsBefore=(await remote(b,home.id)).versions.map(v=>v.id),keptBefore=(await hs(b)).records.filter(r=>r.status!=='saved').map(r=>r.id);
  await b.eval("const box=document.getElementById('home-clear-confirmed').previousElementSibling.querySelector('input');box.checked=true;box.dispatchEvent(new Event('change'));document.getElementById('home-clear-confirmed').click()");await idle(b);
  assert.deepEqual((await hs(b)).records.map(r=>r.id).sort(),keptBefore.sort(),'acknowledged device cleanup preserves every refused or conflict original');assert.deepEqual((await remote(b,home.id)).versions.map(v=>v.id),versionsBefore);
  const refused=(await hs(b)).records.find(r=>r.status==='refused');assert.ok(refused);
  await b.eval(`document.querySelector('[data-operation="${refused.id}"] button').click()`);
  assert.equal(await b.eval(`document.querySelector('[data-operation="${refused.id}"] .home-abandon button').disabled`),true,'downloading alone cannot abandon a refused original');
  await b.eval(`const ack=document.querySelector('[data-operation="${refused.id}"] .home-abandon input');ack.checked=true;ack.dispatchEvent(new Event('change'));document.querySelector('[data-operation="${refused.id}"] .home-abandon button').click()`);await idle(b);
  assert.equal((await hs(b)).records.some(r=>r.id===refused.id),false);assert.ok((await hs(b)).records.some(r=>r.status==='conflict'));assert.deepEqual((await remote(b,home.id)).versions.map(v=>v.id),versionsBefore,'abandoning a downloaded refused device copy never alters server versions');
  await click(b,'homes-refresh');await idle(b);await manage(b,home.id);const pid=await b.playerId(),url=await b.eval('location.href');
  assert.equal(await b.eval('document.getElementById("home-leave").disabled'),true);await b.eval("document.getElementById('home-leave-ack').checked=true;document.getElementById('home-leave-ack').dispatchEvent(new Event('change'))");await click(b,'home-leave');await idle(b);
  assert.equal((await hs(b)).cards.length,0);assert.equal(await b.playerId(),pid);assert.equal(await b.eval('location.href'),url);await b.dbg('workspaces.close()');await b.roll('1d6');
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});

test('actual home UI refuses HTTP before durable capture and clears held old-account details after a real shared-cookie change',async t=>{
  const f=await fixture(t),ctx=await f.context('home-app-boundaries'),a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});await renameTable(ctx,a,'First account home');const firstKey=await account(a);await homes(a);await capture(a);
  await a.eval("window.__homePosts=0;window.__homeOriginalFetch=fetch;window.fetch=function(url,options){if(String(url).includes('/api/account/homes')&&options?.method==='POST')window.__homePosts++;return window.__homeOriginalFetch.call(this,url,options)};window.__homePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=window.__homePut.apply(this,args);if(this.name==='actions')this.transaction.abort();return request}");
  await a.eval("document.getElementById('home-save').click();window.__diceDebug.workspaces.close()");await idle(a);assert.equal((await hs(a)).error,'journal_unavailable');assert.equal(await a.eval('window.__homePosts'),0);assert.equal((await hs(a)).preview,null);assert.equal((await hs(a)).records[0].volatile,true,'closing before failed IDB completion still keeps an exportable in-memory original');
  await homes(a);assert.equal((await hs(a)).records[0].volatile,true);await a.eval('IDBObjectStore.prototype.put=window.__homePut;window.fetch=window.__homeOriginalFetch');await a.eval("[...document.querySelectorAll('.home-kept-row button')].find(b=>b.textContent==='Retry exact request').click()");await idle(a);const home=(await hs(a)).cards[0];assert.ok(home);
  const b=await ctx.newTable({origin:'127.0.0.1',name:'Second tab'});await b.dbg('privateLibrary.open()');await b.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&!document.getElementById("account-refresh").disabled');
  const separate=await f.context('home-app-other-account'),c=await separate.newTable({origin:'127.0.0.1',name:'Other person'});const secondKey=await account(c);
  await click(a,'home-detail-back');let held=null;const browser=a.page.browser;
  browser.on('Fetch.requestPaused',p=>{if(!held)held=p.requestId;else browser.send('Fetch.continueRequest',{requestId:p.requestId},a.page.sessionId).catch(()=>{});},a.page.sessionId);
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/api/account/homes/'+home.id,requestStage:'Response'}]},a.page.sessionId);
  await a.eval(`document.querySelector('[data-home-id="${home.id}"] button').click()`);for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,20));assert.ok(held);
  await account(b,secondKey);await a.waitFor('window.__diceDebug.privateLibrary.state.blocked');
  assert.equal((await hs(a)).owner,null);assert.deepEqual((await hs(a)).cards,[]);assert.equal((await hs(a)).preview,null);
  await browser.send('Fetch.continueRequest',{requestId:held},a.page.sessionId);await idle(a);await browser.send('Fetch.disable',{},a.page.sessionId);
  assert.equal(await a.eval('document.getElementById("home-detail").hidden'),true);assert.equal(await a.eval('document.getElementById("homes-workspace").textContent.includes("First account home")'),false,'late response cannot restore former account names');
  await account(a,secondKey);await homes(a);assert.equal((await hs(a)).cards.length,0);assert.equal((await hs(a)).records.length,0);
  await account(a,firstKey);await homes(a);assert.equal((await hs(a)).cards[0].id,home.id);assert.equal((await hs(a)).records.length,1,'old account journal remains available only after recovery');
  const journal=await a.eval(`(async()=>{
    const {openHomeJournal}=await import('./js/home-journal.js'),store=await openHomeJournal(),personId='p_'+'Z'.repeat(43),kept=[];
    for(let i=0;i<32;i++){const id=crypto.randomUUID();let r={schema:1,personId,id,at:Date.now(),kind:'new',homeId:null,input:{operationId:id,name:'Kept original '+i},document:null,status:'pending'};r=(await store.save(r)).record;r={...r,status:'refused',result:{ok:false,code:'capture_changed'}};await store.save(r);kept.push(r);}
    const id=crypto.randomUUID(),fresh={...kept[0],id,input:{operationId:id,name:'Another original'},status:'pending'};delete fresh.result;
    const full=await store.save(fresh),retry=(await store.save({...kept[0],status:'pending',result:undefined})).record;
    const oldChoice=await store.abandonRefused(personId,kept[0]),oldReceipt=await store.save(kept[0]);
    await store.save({...retry,status:'pending',result:{ok:false,code:'account_unavailable'}});
    const uncertain=await store.abandonRefused(personId,{...retry,status:'pending',result:{ok:false,code:'account_unavailable'}});
    const conflict=(await store.save({...kept[1],status:'pending',result:undefined})).record;await store.save({...conflict,status:'conflict',result:{ok:false,code:'home_conflict'}});
    const serverConflict=await store.abandonRefused(personId,{...conflict,status:'conflict',result:{ok:false,code:'home_conflict'}}),abandoned=await store.abandonRefused(personId,kept[2]),room=await store.save(fresh),rows=await store.read(personId);store.close();
    return {full:full.code,oldChoice:oldChoice.code,oldReceipt:oldReceipt.code,uncertain:uncertain.code,serverConflict:serverConflict.code,abandoned:abandoned.ok,room:room.ok,count:rows.records.length};
  })()`);
  assert.deepEqual(journal,{full:'journal_full',oldChoice:'action_protected',oldReceipt:'action_changed',uncertain:'action_protected',serverConflict:'action_protected',abandoned:true,room:true,count:32},'real IDB capacity recovers only by deliberate refusal cleanup; newer attempts and uncertain/server-conflict originals remain protected');
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);assert.deepEqual(c.page.errors,[]);
});

test('closing during a real save does not reopen management, and a new-account mount waits for the old busy action',async t=>{
  const f=await fixture(t),ctx=await f.context('home-app-held-close'),a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});await renameTable(ctx,a,'First home');await account(a);await homes(a);await capture(a);
  let held=null;const browser=a.page.browser;browser.on('Fetch.requestPaused',p=>{if(!held&&p.request.method==='POST')held=p.requestId;else browser.send('Fetch.continueRequest',{requestId:p.requestId},a.page.sessionId).catch(()=>{});},a.page.sessionId);
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/api/account/homes',requestStage:'Response'}]},a.page.sessionId);await click(a,'home-save');
  for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,20));assert.ok(held);await a.dbg('workspaces.close()');await a.dbg('homes.open()');
  await browser.send('Fetch.continueRequest',{requestId:held},a.page.sessionId);await idle(a);await browser.send('Fetch.disable',{},a.page.sessionId);
  assert.equal((await hs(a)).cards.length,1);assert.equal((await hs(a)).selected,null);assert.equal((await hs(a)).preview,null);assert.equal(await a.eval('document.getElementById("home-detail").hidden'),true);assert.equal((await hs(a)).records[0].status,'saved');
  const b=await ctx.newTable({origin:'127.0.0.1',name:'Second tab'});await b.dbg('privateLibrary.open()');await b.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&!document.getElementById("account-refresh").disabled');
  const separate=await f.context('home-app-next-account'),c=await separate.newTable({origin:'127.0.0.1',name:'Other person'});await renameTable(separate,c,'Second account home');const secondKey=await account(c);await homes(c);await capture(c);await save(c);
  await capture(a);await a.eval(`window.__homeTransaction=IDBDatabase.prototype.transaction;window.__homeWriteCount=0;IDBDatabase.prototype.transaction=function(...args){const tx=window.__homeTransaction.apply(this,args);if(args[0]==='actions'&&args[1]==='readwrite'&&++window.__homeWriteCount===2){const property=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');Object.defineProperty(tx,'oncomplete',{set(fn){property.set.call(tx,event=>{window.__releaseHomeCommit=()=>fn(event)})},get(){return property.get.call(tx)}})}return tx}`);
  await click(a,'home-save');await a.waitFor('typeof window.__releaseHomeCommit==="function"');
  await account(b,secondKey);await a.waitFor('window.__diceDebug.privateLibrary.state.blocked');await account(a,secondKey);await a.dbg('homes.open()');
  await a.eval('IDBDatabase.prototype.transaction=window.__homeTransaction;window.__releaseHomeCommit()');await idle(a);
  assert.equal((await hs(a)).cards.length,1);assert.equal((await hs(a)).cards[0].name,'Second account home','first new-account mount reloads after the old busy request');assert.equal((await hs(a)).selected,null);assert.equal((await hs(a)).preview,null);assert.equal(await a.eval('document.getElementById("homes-workspace").textContent.includes("First home")'),false);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);assert.deepEqual(c.page.errors,[]);
});
