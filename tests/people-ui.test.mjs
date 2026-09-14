/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,account,people,state,idle,seedFriendship,seedHome} from './fixtures/people-app.mjs';
import {click,type,key} from './fixtures/visible-input.mjs';
import {invitationJourney,invitationSaveCancellation} from './fixtures/invitation-journey.mjs';

for(const nextTask of ['close invitation','browse At table'])test('phone save-table loading is cancelled by '+nextTask,async t=>{
  await invitationSaveCancellation(await fixture(t),{nextTask});
});

test('phone invitation saves the current table, reaches an unopened inbox, joins directly and returns with the private kit',async t=>{
  await invitationJourney(await fixture(t));
});

for(const nextTask of ['reopen People','browse Friends'])test('a delayed Accept and join cannot navigate after '+nextTask,async t=>{
  const f=await fixture(t),one=await f.context('invite-delay-sender'),two=await f.context('invite-delay-recipient');
  const a=await one.newTable({origin:'127.0.0.1',name:'Sam'}),b=await two.newTable({origin:'127.0.0.1',name:'Riley'});
  await account(a);await account(b,{name:'Riley'});const {second}=await seedFriendship(a,b);
  await one.api('/api/settings',{playerId:await a.playerId(),settings:{tableName:'The Copper Lantern'}});
  const {invitation}=await seedHome(a,{toPersonId:second});await people(b);
  const url=await b.eval('location.href'),seat=await b.playerId(),browser=b.page.browser;
  let held=null;
  browser.on('Fetch.requestPaused',p=>{held=p.requestId;},b.page.sessionId);
  await browser.send('Fetch.enable',{patterns:[{urlPattern:`*/api/account/invitations/${invitation.id}/respond`,requestStage:'Response'}]},b.page.sessionId);
  await click(b,`[data-social-focus="accept-join:${invitation.id}"]`);
  for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,10));assert.ok(held);
  if(nextTask==='reopen People'){await click(b,'#workspace-back');await click(b,'#workspace-nav [data-workspace="people"]');}
  else await click(b,'#people-tab-friends');
  await browser.send('Fetch.continueRequest',{requestId:held},b.page.sessionId);
  await browser.send('Fetch.disable',{},b.page.sessionId);await idle(b);
  assert.equal(await b.eval('location.href'),url);assert.equal(await b.playerId(),seat);
  assert.equal((await state(b)).incoming.find(i=>i.id===invitation.id).state,'accepted');
  assert.equal(await b.dbg('workspaces.current'),'people');
  if(nextTask==='browse Friends'){assert.equal(await b.eval('document.getElementById("people-friends").hidden'),false);await click(b,'#people-tab-invitations');}
  await click(b,`[data-social-focus="join:${invitation.id}"]`);
  await b.waitFor(`new URL(location.href).searchParams.get('room')===${JSON.stringify(one.room)}&&window.__diceDebug?.net?.savedHome`);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});

test('Accept and join retains the invitation on a refused connection and retries the same operation',async t=>{
  const f=await fixture(t),one=await f.context('invite-retry-sender'),two=await f.context('invite-retry-recipient');
  const a=await one.newTable({origin:'127.0.0.1',name:'Sam'}),b=await two.newTable({origin:'127.0.0.1',name:'Riley'});
  await account(a);await account(b,{name:'Riley'});const {second}=await seedFriendship(a,b);
  await one.api('/api/settings',{playerId:await a.playerId(),settings:{tableName:'The Copper Lantern'}});
  const {invitation}=await seedHome(a,{toPersonId:second});await people(b);
  const url=await b.eval('location.href'),browser=b.page.browser,path=`*/api/account/invitations/${invitation.id}/respond`;
  await browser.send('Network.enable',{},b.page.sessionId);
  await browser.send('Network.setBlockedURLs',{urls:[path]},b.page.sessionId);
  await click(b,`[data-social-focus="accept-join:${invitation.id}"]`);await idle(b);
  assert.equal(await b.eval('location.href'),url);
  assert.equal((await state(b)).incoming.find(i=>i.id===invitation.id).state,'pending');
  const pending=(await state(b)).records.find(r=>r.status==='pending');assert.ok(pending);
  let operation=null;
  browser.on('Network.requestWillBeSent',p=>{if(p.request.method==='POST'&&p.request.url.endsWith('/respond'))operation=JSON.parse(p.request.postData).operationId;},b.page.sessionId);
  await browser.send('Network.setBlockedURLs',{urls:[]},b.page.sessionId);
  await click(b,`[data-social-focus="accept-join:${invitation.id}"]`);
  await b.waitFor(`new URL(location.href).searchParams.get('room')===${JSON.stringify(one.room)}&&window.__diceDebug?.net?.savedHome`);
  assert.equal(operation,pending.id);assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});

test('actual controls deliver an offline invitation across restart; acceptance preserves a private turn and Join is separate',async t=>{
  const f=await fixture(t),one=await f.context('people-ui-one'),two=await f.context('people-ui-two'),a=await one.newTable({origin:'127.0.0.1',name:'Alice'});let b=await two.newTable({origin:'127.0.0.1',name:'Bob'});
  await account(a,{name:'Sam'});const recoveryKey=await account(b,{name:'Riley'});await people(a);await click(a,'#people-tab-friends');await click(a,'#people-add');await click(a,'#people-code-new');await idle(a);
  const code=await a.eval('document.getElementById("people-own-code").value');assert.ok(code.startsWith('dc1_'));
  await people(b);await click(b,'#people-add');await type(b,'#people-contact-code',code);await click(b,'#people-request-send');await idle(b);
  await click(a,'#people-refresh');await idle(a);await click(a,'#people-tab-invitations');let invitation=(await state(a)).incoming.find(i=>i.state==='pending');assert.ok(invitation);
  await click(a,`[data-invitation-id="${invitation.id}"] [data-social-focus="respond-invitation:${invitation.id}:accept"]`);await idle(a);assert.equal((await state(a)).friends[0].displayName,'Riley');
  await two.closeAll(); // The recipient is offline when the home invitation is sent.
  await click(a,'#workspace .workspace-tabs [data-workspace="tables"]');await a.waitFor('document.getElementById("homes-new")&&!document.getElementById("homes-new").disabled');await click(a,'#homes-new');await type(a,'#homes-new-name','The Copper Lantern');await click(a,'#homes-new-form button');await click(a,'#home-save');await a.waitFor('window.__diceDebug.homes.state.cards.length===1&&!window.__diceDebug.homes.state.loading');
  await people(a);await click(a,'#people-tab-friends');const friend=(await state(a)).friends[0];await click(a,`[data-social-focus="invite:${friend.id}"]`);await click(a,'#people-invite-home');await key(a,'End','End',35);await key(a,'Enter','Enter',13);await click(a,'#people-invite-send');await idle(a);
  assert.deepEqual(a.page.errors,[]);await one.closeAll();await f.restart();
  const returned=await f.context('people-ui-returned');b=await returned.newTable({origin:'127.0.0.1',name:'Bob'});
  await b.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},b.page.sessionId);
  await b.emulateCoarsePointer(true);await b.reload();
  await b.roll('3d6 t3 secret');const turn=await b.rollId();await account(b,{recoveryKey});await people(b);await click(b,'#people-tab-invitations');invitation=(await state(b)).incoming.find(i=>i.kind==='home');assert.equal(invitation.home.name,'The Copper Lantern');
  const seat=await b.playerId(),url=await b.eval('location.href'),before=await b.dbg(`turnState(${JSON.stringify(turn)})`);
  await click(b,`[data-invitation-id="${invitation.id}"] [data-social-focus="respond-invitation:${invitation.id}:accept"]`);await idle(b);
  assert.equal(await b.playerId(),seat);assert.equal(await b.eval('location.href'),url);assert.deepEqual(await b.dbg(`turnState(${JSON.stringify(turn)})`),before);assert.equal((await state(b)).homes[0].name,'The Copper Lantern');
  assert.equal((await b.dbg('privateLibrary.state')).syncEnabled,false);
  assert.deepEqual(await b.dbg('profiles.shared'),[],'acceptance does not publish private profiles');
  await click(b,`[data-social-focus="join:${invitation.id}"]`);await b.waitFor('window.__diceDebug?.net?.savedHome&&window.__diceDebug.settings.tableName==="The Copper Lantern"');
  assert.notEqual(await b.eval('location.href'),url);assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});

test('presence expires without a fetch; a held pre-block reply cannot restore a removed signal',async t=>{
  const f=await fixture(t),one=await f.context('people-presence-a'),two=await f.context('people-presence-b');
  const a=await one.newTable({origin:'127.0.0.1',name:'Alice'}),b=await two.newTable({origin:'127.0.0.1',name:'Bob'});
  await account(a,{name:'Sam'});await account(b,{name:'Riley'});
  const {second}=await seedFriendship(a,b);
  await people(b);await click(b,'#people-options');await click(b,'#people-tab-presence');
  assert.equal((await state(b)).sharing.online,false,'reading People does not opt into presence');
  await click(b,'#people-share-online');await idle(b);
  assert.equal((await state(b)).sharing.online,true);assert.equal((await state(b)).sharing.location,false);
  await people(a);await click(a,'#people-options');await click(a,'#people-tab-presence');
  assert.equal(await a.eval('document.getElementById("people-presence-list").textContent'),'Riley · Online');
  // A transport fixture shortens the real authorized projection's lease. The
  // UI must repaint from its timer without another successful service read.
  let held=null,mode='short',reads=0;const browser=a.page.browser;
  browser.on('Fetch.requestPaused',async p=>{
    if(mode==='hold'&&!held){held=p.requestId;return;}
    if(mode==='short'){
      reads++;
      const response=await browser.send('Fetch.getResponseBody',{requestId:p.requestId},a.page.sessionId);
      const body=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body);
      body.signals=body.signals.map(signal=>({...signal,expiresAt:Date.now()+650}));
      await browser.send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:p.responseStatusCode,
        responseHeaders:p.responseHeaders.filter(h=>!['content-length','content-encoding'].includes(h.name.toLowerCase())),
        body:Buffer.from(JSON.stringify(body)).toString('base64')},a.page.sessionId);
    }else await browser.send('Fetch.continueRequest',{requestId:p.requestId},a.page.sessionId);
  },a.page.sessionId);
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/api/account/presence',requestStage:'Response'}]},a.page.sessionId);
  await click(a,'#people-refresh');await idle(a);
  assert.equal(await a.eval('document.getElementById("people-presence-list").textContent'),'Riley · Online');
  await a.waitFor('document.getElementById("people-presence-list").textContent==="Riley · Unknown"');
  assert.equal(reads,1,'expiry did not depend on another fetch');
  mode='continue';await click(a,'#people-refresh');await idle(a);mode='hold';
  // Arrange an in-flight background poll, then use only visible controls for
  // the relationship change that must invalidate it.
  await a.eval('void window.__diceDebug.people.readPresence()');
  for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,10));assert.ok(held);
  await click(a,'#people-tab-friends');await click(a,`[data-person-id="${second}"] .social-friend-options>summary`);await click(a,`[data-social-focus="block:${second}"]`);
  await click(a,'#people-confirm-ack');await click(a,'#people-confirm');
  await a.waitFor('window.__diceDebug.people.state.signals.every(s=>s.state!=="online")');
  await browser.send('Fetch.continueRequest',{requestId:held},a.page.sessionId);await idle(a);
  await browser.send('Fetch.disable',{},a.page.sessionId);
  assert.deepEqual((await state(a)).friends,[]);assert.equal((await state(a)).signals.some(s=>s.state==='online'),false);
  await click(a,'#people-options');await click(a,'#people-tab-blocked');
  assert.equal(await a.eval('document.getElementById("people-blocked-list").textContent.includes("Riley")'),true);
  await click(a,`[data-social-focus="unblock:${second}"]`);await idle(a);
  assert.deepEqual((await state(a)).blockedPeople,[]);assert.deepEqual((await state(a)).friends,[],'unblock does not restore friendship');
  await b.page.browser.send('Network.enable',{},b.page.sessionId);
  await b.page.browser.send('Network.setBlockedURLs',{urls:['*/api/account/*']},b.page.sessionId);
  await click(b,'#people-share-online');await idle(b);
  assert.equal((await state(b)).sharing.online,false,'offline opt-out stops renewal immediately');
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});

test('home location is a separate opt-in, unavailable location reads are Unknown, and invitation expiry removes Accept',async t=>{
  const f=await fixture(t),one=await f.context('g_people_location_a'),two=await f.context('people-location-b');
  const a=await one.newTable({origin:'127.0.0.1',name:'Alice'}),b=await two.newTable({origin:'127.0.0.1',name:'Bob'});
  await account(a,{name:'Sam'});await account(b,{name:'Riley'});
  const {second}=await seedFriendship(a,b);
  await one.api('/api/settings',{playerId:await a.playerId(),settings:{tableName:'The Copper Lantern'}});
  await a.waitFor('window.__diceDebug.settings.tableName==="The Copper Lantern"');
  const saved=await seedHome(a,{toPersonId:second}),home=saved.home;
  await b.eval(`__socialFixture.respondInvitation(__socialFixturePerson,${JSON.stringify(saved.invitation.id)},{operationId:crypto.randomUUID(),choice:'accept'})`);
  const invitation=await a.eval(`(async()=>{const saved=await __socialFixture.createHome(__socialFixturePerson,{operationId:crypto.randomUUID(),name:'The Stone Circle'});return (await __socialFixture.inviteHome(__socialFixturePerson,{operationId:crypto.randomUUID(),homeId:saved.home.id,toPersonId:${JSON.stringify(second)}})).invitation;})()`);
  await people(a);await click(a,'#people-options');await click(a,'#people-tab-presence');await click(a,'#people-share-online');await idle(a);
  await click(a,'#people-refresh');await idle(a);
  assert.equal((await state(a)).homeSignals.length,0,'online sharing alone does not disclose the home');
  await click(a,'#people-share-home');await idle(a);await click(a,'#people-refresh');await idle(a);
  assert.equal((await state(a)).sharing.location,true);
  const permitted=await b.eval(`__socialFixture.homePresence(__socialFixturePerson,${JSON.stringify(home.id)})`);
  assert.equal(permitted.signals[0].person.displayName,'Sam');
  const browser=a.page.browser;await browser.send('Network.enable',{},a.page.sessionId);
  await browser.send('Network.setBlockedURLs',{urls:[`*/api/account/homes/${home.id}/presence`]},a.page.sessionId);
  await click(a,'#people-refresh');await idle(a);
  assert.equal((await state(a)).homePresence.state,'unknown');
  assert.equal(await a.eval('document.getElementById("people-home-presence").textContent'),'Unknown.');
  await click(a,'#people-share-home');await idle(a);
  assert.equal((await state(a)).sharing.online,true);assert.equal((await state(a)).sharing.location,false);
  await browser.send('Network.setBlockedURLs',{urls:[]},a.page.sessionId);
  await people(b);await click(b,'#people-tab-invitations');
  let reads=0;const other=b.page.browser;
  other.on('Fetch.requestPaused',async p=>{
    reads++;
    const response=await other.send('Fetch.getResponseBody',{requestId:p.requestId},b.page.sessionId);
    const body=JSON.parse(response.base64Encoded?Buffer.from(response.body,'base64').toString():response.body);
    body.invitations=body.invitations.map(row=>row.id===invitation.id?{...row,expiresAt:Date.now()+700}:row);
    await other.send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:p.responseStatusCode,
      responseHeaders:p.responseHeaders.filter(h=>!['content-length','content-encoding'].includes(h.name.toLowerCase())),
      body:Buffer.from(JSON.stringify(body)).toString('base64')},b.page.sessionId);
  },b.page.sessionId);
  await other.send('Fetch.enable',{patterns:[{urlPattern:'*/api/account/invitations?direction=incoming',requestStage:'Response'}]},b.page.sessionId);
  await click(b,'#people-refresh');await idle(b);
  const accept=`[data-social-focus="respond-invitation:${invitation.id}:accept"]`;
  assert.equal(await b.eval(`!!document.querySelector(${JSON.stringify(accept)})`),true);
  await b.waitFor(`!document.querySelector(${JSON.stringify(accept)})`);
  assert.equal(reads,1);assert.match(await b.eval(`document.querySelector('[data-invitation-id="${invitation.id}"]').textContent`),/expired/);
  await other.send('Fetch.disable',{},b.page.sessionId);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});

test('real IDB keeps uncertain exact actions across reload and refuses HTTP before a device commit',async t=>{
  const f=await fixture(t),one=await f.context('people-journal-a'),two=await f.context('people-journal-b');
  const a=await one.newTable({origin:'127.0.0.1',name:'Alice'}),b=await two.newTable({origin:'127.0.0.1',name:'Bob'});
  const recoveryKey=await account(a,{name:'Sam'});await account(b,{name:'Riley'});
  const {second}=await seedFriendship(a,b);await people(a);
  const browser=a.page.browser;await browser.send('Network.enable',{},a.page.sessionId);
  await browser.send('Network.setBlockedURLs',{urls:[`*/api/account/people/${second}/remove`]},a.page.sessionId);
  await click(a,`[data-person-id="${second}"] .social-friend-options>summary`);await click(a,`[data-social-focus="remove:${second}"]`);await click(a,'#people-confirm-ack');await click(a,'#people-confirm');await idle(a);
  const pending=(await state(a)).records.find(r=>r.status==='pending');assert.ok(pending);
  await a.reload();await people(a);assert.equal((await state(a)).records.some(r=>r.id===pending.id),true);
  await browser.send('Network.setBlockedURLs',{urls:[]},a.page.sessionId);
  await click(a,`[data-operation="${pending.id}"] button:nth-of-type(2)`);await idle(a);
  assert.equal((await state(a)).records.find(r=>r.id===pending.id).status,'saved');assert.deepEqual((await state(a)).friends,[]);
  let posts=0;browser.on('Network.requestWillBeSent',p=>{if(p.request.method==='POST'&&p.request.url.endsWith('/api/account/people/contact-code'))posts++;},a.page.sessionId);
  await a.eval(`window.__socialPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){
    const request=window.__socialPut.apply(this,args);if(this.transaction.db.name==='dice.social-actions.v1')this.transaction.abort();return request;
  }`);
  await click(a,'#people-tab-friends');await click(a,'#people-add');await click(a,'#people-code-new');await idle(a);
  const unkept=(await state(a)).records.find(r=>r.volatile);assert.ok(unkept);assert.equal(posts,0,'no social write before strict IDB confirmation');
  await a.eval(`window.__socialDownloads=[];window.__socialURL=URL.createObjectURL;URL.createObjectURL=blob=>{__socialDownloads.push(blob.text());return __socialURL(blob);}`);
  await click(a,`[data-operation="${unkept.id}"] button:first-of-type`);
  const downloads=await a.eval('Promise.all(window.__socialDownloads)');assert.equal(downloads.length,1);
  assert.equal(downloads[0].includes(recoveryKey),false);assert.equal(JSON.parse(downloads[0]).requests[0].request.kind,'contact-code');
  await a.eval('IDBObjectStore.prototype.put=window.__socialPut');
  await click(a,`[data-operation="${unkept.id}"] button:nth-of-type(2)`);await idle(a);
  assert.equal(posts,1);assert.equal((await state(a)).records.find(r=>r.id===unkept.id).status,'saved');
  await click(a,'#people-add');await type(a,'#people-contact-code','dc1_'+'X'.repeat(43));
  await one.rawPlayer('Observer');
  await a.waitFor('document.querySelectorAll("#workspace-people-current .workspace-person").length===2');
  assert.equal(await a.eval('document.activeElement.id'),'people-contact-code','roster updates preserve the typed contact field and its focus');
  assert.equal(await a.eval('document.getElementById("people-contact-code").value.length'),47);
  await click(a,'#people-request-send');await idle(a);
  const refused=(await state(a)).records.find(r=>r.status==='refused');assert.ok(refused);
  await click(a,`[data-operation="${refused.id}"] button:first-of-type`);
  await click(a,`[data-operation="${refused.id}"] .social-abandon input`);
  await click(a,`[data-operation="${refused.id}"] .social-abandon button`);await idle(a);
  assert.equal((await state(a)).records.some(r=>r.id===refused.id),false);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});

test('a held inbox response cannot expose previous-account names after a real same-origin cookie replacement',async t=>{
  const f=await fixture(t),one=await f.context('people-cookie-a'),two=await f.context('people-cookie-other');
  const a=await one.newTable({origin:'127.0.0.1',name:'Alice'}),c=await two.newTable({origin:'127.0.0.1',name:'Charlie'});
  const firstKey=await account(a,{name:'Sam'}),secondKey=await account(c,{name:'Other account'});
  await seedFriendship(a,c);await people(a);await click(a,'#people-tab-friends');await click(a,'#people-add');await click(a,'#people-code-new');await idle(a);
  const oldId=(await state(a)).records[0].id;
  const b=await one.newTable({origin:'127.0.0.1',name:'Second tab'});
  await b.dbg('privateLibrary.open()');await b.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&!document.getElementById("account-refresh").disabled');
  let held=null;const browser=a.page.browser;
  browser.on('Fetch.requestPaused',p=>{if(!held)held=p.requestId;else browser.send('Fetch.continueRequest',{requestId:p.requestId},a.page.sessionId).catch(()=>{});},a.page.sessionId);
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/api/account/invitations?direction=incoming',requestStage:'Response'}]},a.page.sessionId);
  await click(a,'#people-refresh');for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,10));assert.ok(held);
  await account(b,{recoveryKey:secondKey});await a.waitFor('window.__diceDebug.privateLibrary.state.blocked');
  assert.equal((await state(a)).owner,null);assert.deepEqual((await state(a)).friends,[]);
  await browser.send('Fetch.continueRequest',{requestId:held},a.page.sessionId);await idle(a);
  await browser.send('Fetch.disable',{},a.page.sessionId);
  assert.equal(await a.eval('document.getElementById("people-workspace").textContent.includes("Other account")'),false);
  assert.equal(await a.eval('document.getElementById("people-own-code").value'),'', 'explicit contact code is cleared at identity boundary');
  await account(a,{recoveryKey:secondKey});await people(a);
  assert.equal((await state(a)).records.some(r=>r.id===oldId),false);
  await account(a,{recoveryKey:firstKey});await people(a);
  assert.equal((await state(a)).records.some(r=>r.id===oldId),true,'old journal is available only after recovering its owner');
  await click(a,'#people-tab-table');await click(a,'#workspace-people-current [data-focus-key="account"]');
  await a.waitFor('!document.getElementById("account-logout").disabled');await click(a,'#account-logout');
  await a.waitFor('!window.__diceDebug.privateLibrary.state.person&&!document.getElementById("account-refresh").disabled');await people(a);
  assert.equal((await state(a)).owner,null);assert.deepEqual((await state(a)).friends,[]);assert.deepEqual((await state(a)).records,[]);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);assert.deepEqual(c.page.errors,[]);
});

test('Decline, Cancel and Archive use the visible invitation controls and retain the other inbox copy',async t=>{
  const f=await fixture(t),one=await f.context('g_people_decline'),two=await f.context('people-decline-b');
  const a=await one.newTable({origin:'127.0.0.1',name:'Alice'}),b=await two.newTable({origin:'127.0.0.1',name:'Bob'});
  await account(a,{name:'Sam'});await account(b,{name:'Riley'});const {second}=await seedFriendship(a,b);
  await one.api('/api/settings',{playerId:await a.playerId(),settings:{tableName:'The Copper Lantern'}});
  const {home,invitation}=await seedHome(a,{toPersonId:second});
  await people(b);await click(b,'#people-tab-invitations');
  await click(b,`[data-social-focus="respond-invitation:${invitation.id}:decline"]`);await idle(b);
  assert.equal((await state(b)).incoming.find(i=>i.id===invitation.id).state,'declined');assert.deepEqual((await state(b)).homes,[]);
  await click(b,`[data-social-focus="archive-invitation:${invitation.id}"]`);await idle(b);
  assert.equal((await state(b)).incoming.some(i=>i.id===invitation.id),false);
  await people(a);await click(a,'#people-tab-invitations');await click(a,'#people-outgoing');
  assert.equal((await state(a)).outgoing.find(i=>i.id===invitation.id).state,'declined','archiving own inbox does not remove the sender copy');
  await click(a,'#people-tab-friends');await click(a,`[data-social-focus="invite:${second}"]`);await click(a,'#people-invite-send');await idle(a);
  const pending=(await state(a)).outgoing.find(i=>i.home?.id===home.id&&i.state==='pending');assert.ok(pending);
  await click(a,'#people-tab-invitations');await click(a,`[data-social-focus="cancel-invitation:${pending.id}"]`);await idle(a);
  assert.equal((await state(a)).outgoing.find(i=>i.id===pending.id).state,'cancelled');
  await click(b,'#people-refresh');await idle(b);assert.equal((await state(b)).incoming.find(i=>i.id===pending.id).state,'cancelled');
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
});

test('service-absent guest People remains an optional task beside a working phone table',async t=>{
  const f=await fixture(t,{mode:'off'}),ctx=await f.context('people-static'),a=await ctx.newTable({origin:'127.0.0.1',name:'Alice'});
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
  await a.emulateCoarsePointer(true);await a.reload();
  const before=await a.playerId();await people(a);
  assert.equal((await state(a)).owner,null);assert.equal(await a.eval('document.getElementById("people-account").hidden'),false);
  await click(a,'#people-account');await a.waitFor('document.getElementById("account-create")?.disabled');
  assert.equal(await a.playerId(),before);
  await click(a,'#workspace-back');
  const previous=await a.rollId();await click(a,'#phone-quick-dice [data-quick="2d6"]');
  await a.waitFor(`window.__diceDebug.currentRoll&&window.__diceDebug.currentRoll.rollId!==${JSON.stringify(previous)}`);await a.settle();
  assert.equal(await a.dbg('workspaces.current'),null);assert.equal(await a.diceCount(),2);
  assert.deepEqual(a.page.errors,[]);
});
