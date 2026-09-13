/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {fixture,people,idle as peopleIdle,state as peopleState} from './people-app.mjs';
import {click,type,key} from './visible-input.mjs';

async function enter(a){
  await a.page.browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'},a.page.sessionId);
  await a.page.browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},a.page.sessionId);
}
async function afterNavigation(a,room){
  const end=Date.now()+30000;
  while(Date.now()<end){try{if(await a.eval(`new URL(location.href).searchParams.get('room')===${JSON.stringify(room)}&&!!window.__diceDebug?.netReady`)){await a.waitOnline();return;}}catch{}await new Promise(r=>setTimeout(r,50));}
  throw Error('The explicit Join did not reach its named home');
}
const keptProfiles=a=>a.eval('JSON.parse(localStorage.getItem("dice.profiles.v1")).profiles.map(({id,name,system,pools})=>({id,name,system,pools}))');
const accountState=a=>a.dbg('privateLibrary.state');
const library=async a=>(await a.dbg('privateLibrary.snapshot()')).document;
const accountIdle=a=>a.waitFor('window.__diceDebug.privateLibrary.state?.ready&&!document.getElementById("account-refresh").disabled');
const homesIdle=a=>a.waitFor('!!window.__diceDebug.homes.state&&!window.__diceDebug.homes.state.loading&&!document.getElementById("homes-refresh").disabled');
async function workspace(a,name){
  const shell=await a.eval('!document.getElementById("workspace").classList.contains("hidden")');
  await click(a,(shell?'#workspace .workspace-tabs':'#workspace-nav')+` [data-workspace="${name}"]`);
}
async function closeWorkspace(a){if(await a.dbg('workspaces.current'))await click(a,'#workspace-back');}
async function openAccount(a){
  await closeWorkspace(a);await click(a,'#identity-chip');await click(a,'#idm-account');
  await a.waitFor('!!document.getElementById("account-create")');await accountIdle(a);
}
async function createAccount(a,name){
  await openAccount(a);await click(a,'#account-create');
  // Test-created keys remain only in this process, never reports or pictures.
  const recovery=await a.eval('document.getElementById("account-key").value');
  await type(a,'#account-name',name);await click(a,'#account-key-kept');await click(a,'#account-submit');await accountIdle(a);
  assert.ok((await accountState(a)).person);assert.equal((await accountState(a)).syncEnabled,false);
  return recovery;
}
async function recover(a,recovery){
  await openAccount(a);await click(a,'#account-recover');await type(a,'#account-key',recovery);await click(a,'#account-submit');await accountIdle(a);
  assert.ok((await accountState(a)).person);assert.equal((await accountState(a)).syncEnabled,false);
}
async function compare(a,choice){
  await click(a,'#account-compare');await a.waitFor('!document.getElementById("account-comparison").hidden');await accountIdle(a);
  await click(a,`#account-choice-${choice}`);
}
async function enableSync(a){
  await click(a,'#account-enable-sync');await accountIdle(a);assert.equal((await accountState(a)).syncEnabled,true);
  await click(a,'#account-sync-retry');await accountIdle(a);
  await a.waitFor('document.getElementById("account-sync-status").textContent.includes("up to date")');
}
async function compose(a,notation){
  await closeWorkspace(a);await workspace(a,'dice');
  if(await a.eval('document.querySelector("#section-bar [data-sec=notation]").getAttribute("aria-pressed")==="false"'))await click(a,'#section-bar [data-sec="notation"]');
  const previous=await a.rollId();await type(a,'#cmd-input',notation);await enter(a);
  await a.waitFor(`!!window.__diceDebug.currentRoll&&window.__diceDebug.currentRoll.rollId!==${JSON.stringify(previous)}`);
  await a.settle();assert.equal(await a.dbg('workspaces.current'),null,'accepted Roll returns from the composing task');return a.rollId();
}
async function device(ctx,options,{width=1440,height=900,mobile=false}={}){
  // Configure the new target before navigation; phone first load is really narrow.
  const browser=ctx.browser,original=browser.newPage.bind(browser);
  browser.newPage=async()=>{const page=await original();await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},page.sessionId);await browser.send('Emulation.setTouchEmulationEnabled',mobile?{enabled:true,maxTouchPoints:5}:{enabled:false},page.sessionId);return page;};
  try{return await ctx.newTable(options);}finally{browser.newPage=original;}
}

export async function runSuccessWalk({capture=async()=>{},checkpoint=()=>{}}={}){
  const f=await fixture(null),one=await f.context('r1-success-home'),tables=[];
  const report={checkpoints:[],screens:[]};
  const mark=(name,data={})=>{report.checkpoints.push({name,...data});checkpoint(name);};
  const shot=async(a,name)=>{await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);await capture(a,name);report.screens.push(name);};
  try{
    const a=await device(one,{origin:'127.0.0.1',name:'Guest'});tables.push(a);
    assert.equal(await a.dbg('settings.system'),'none');assert.deepEqual(await a.dbg('groups'),[]);
    const seat=await a.playerId();await click(a,'#identity-chip');await type(a,'#idm-name-input','Sam');await shot(a,'00-desktop-name-editor');await enter(a);
    await a.waitFor('window.__diceDebug.players.some(p=>p.name==="Sam")');assert.equal(await a.playerId(),seat);assert.deepEqual(await a.dbg('groups'),[]);
    if(await a.eval('!document.getElementById("identity-menu").classList.contains("hidden")'))await key(a,'Escape','Escape',27);
    mark('fresh guest renamed without reseating');
    const count=await a.logCount();await click(a,'#my-dice');await a.waitFor('window.__diceDebug.diceGallery.open');
    await type(a,'#dg-search','seaglass');await click(a,'.dg-card[data-set="tidewrack.seaglass"]');await click(a,'.dg-practice');
    await a.waitFor('!!window.__diceDebug.diceGallery.practice');await a.waitFor('!window.__diceDebug.diceGallery.practice.rolling',{timeout:15000});
    assert.equal(await a.logCount(),count);assert.equal(await a.dbg('diceSet'),'std');
    await shot(a,'01-desktop-practice');await click(a,'.dg-favorite');await click(a,'.dg-use');assert.equal(await a.dbg('diceSet'),'tidewrack.seaglass');await click(a,'.dg-close');
    mark('practice stays local and chosen dice become the future default');
    const rid=await compose(a,'2d6+3'),entry=await a.entryState(rid);
    assert.equal(entry.total,entry.values.reduce((n,v)=>n+v,0)+3);assert.equal(await a.eval('window.__diceDebug.currentRoll.set'),'tidewrack.seaglass');
    await shot(a,'02-desktop-first-result');
    await click(a,`.result-seat[data-player="${seat}"]`);await click(a,'#player-result-actions .keep-verb');await click(a,'#pop-variant');await type(a,'#pop-save-name','Travel check');await enter(a);
    await a.waitFor('window.__diceDebug.groups.some(g=>g.name==="Travel check")');assert.equal((await a.dbg('groups')).find(g=>g.name==='Travel check').notation,'2d6+3');
    if(await a.dbg('tableResults.detailId'))await click(a,'#player-result-close');
    await click(a,'#table-open');await type(a,'#set-table-name','The Copper Lantern');await click(a,'#snav-staging');await click(a,'[data-venue="copper"]');
    await a.waitFor('window.__diceDebug.tableEdit.values.venue==="copper"');await a.waitFor('window.__diceDebug.tablePreview?.status==="ready"&&window.__diceDebug.tablePreview.activeId==="copper"');await shot(a,'03-desktop-setup-preview');await click(a,'#table-edit-apply');
    await a.waitFor('window.__diceDebug.settings.tableName==="The Copper Lantern"&&!window.__diceDebug.tableEdit.busy');await click(a,'#settings-close');
    assert.equal(await a.eval('document.title'),'The Copper Lantern — Dice Table');assert.equal(await a.playerId(),seat);
    mark('useful roll saved and named table applied');
    await a.page.browser.send('Browser.grantPermissions',{origin:`http://127.0.0.1:${f.port}`,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
    await click(a,'#identity-chip');await click(a,'#idm-invite');const guestLink=await a.eval('navigator.clipboard.readText()');
    assert.equal(new URL(guestLink).searchParams.get('room'),one.room);assert.equal(new URL(guestLink).searchParams.size,1);
    if(await a.eval('!document.getElementById("identity-menu").classList.contains("hidden")'))await key(a,'Escape','Escape',27);
    const two=await f.context(new URL(guestLink).searchParams.get('room'));
    let b=await device(two,{origin:'127.0.0.1',anon:true});tables.push(b);await b.waitFor('window.__diceDebug.seatPicker.tableName==="The Copper Lantern"');await b.waitFor('document.getElementById("name-modal").getAnimations({subtree:true}).every(a=>a.playState==="finished")');await type(b,'#name-input','Riley');assert.equal(await b.eval('document.getElementById("name-input").value'),'Riley');await b.waitFor('!document.getElementById("name-join").disabled');await click(b,'#name-join');await b.waitOnline();await b.settle();
    assert.equal(await b.eval('document.title'),'The Copper Lantern — Dice Table');assert.equal(await b.rollId(),rid);assert.deepEqual((await b.entryState(rid)).values,entry.values);assert.equal((await b.entryState(rid)).total,entry.total);
    assert.equal(await b.eval('window.__diceDebug.currentRoll.set'),'tidewrack.seaglass');assert.equal(await b.eval('window.__diceDebug.currentRoll.playerName'),'Sam');
    mark('copied guest link joins the same named table with matching values',{values:entry.values,total:entry.total,rollId:rid});
    // Fixture a returning player's owned Soul Deal profile before following the
    // new guest link. This player never creates an account or opts into sync.
    const third=await f.context('r1-existing-soul');
    let c=await device(third,{origin:'127.0.0.1',name:'Mira'});tables.push(c);
    await c.dbg("profiles.reset('soul-deal')");const soulBefore=await keptProfiles(c);
    assert.ok(soulBefore.some(p=>p.system==='soul-deal'&&p.pools.length===18));await c.close();
    const thirdAtHome=await f.context(one.room,third.browser);
    c=await device(thirdAtHome,{origin:'127.0.0.1',name:'Mira'});tables.push(c);
    for(const profile of soulBefore)assert.deepEqual((await keptProfiles(c)).find(p=>p.id===profile.id),profile);
    await compose(c,'1d6');await a.settle();await b.settle();
    assert.equal(await c.dbg('privateLibrary.state?.person||null'),null);
    mark('returning Soul Deal guest joins and rolls with all kept profile content intact');
    const kept=await library(a),samKey=await createAccount(a,'Sam');assert.deepEqual(await library(a),kept);
    await compare(a,'local');await shot(a,'04-desktop-library-comparison');await enableSync(a);assert.deepEqual(await library(a),kept);assert.deepEqual(await a.dbg('profiles.shared'),[]);
    await workspace(a,'tables');await homesIdle(a);await click(a,'#homes-capture');await a.waitFor('!!window.__diceDebug.homes.state.preview');await homesIdle(a);
    const homePreview=await a.dbg('homes.state.preview.document');assert.equal(homePreview.settings.tableName,'The Copper Lantern');assert.equal(JSON.stringify(homePreview).includes('Travel check'),false);
    await click(a,'#home-save');await a.waitFor('window.__diceDebug.homes.state.cards.length===1');await homesIdle(a);const home=(await a.dbg('homes.state.cards'))[0];
    assert.equal(home.roomKey,one.room);await click(a,'#home-detail-back');await shot(a,'05-desktop-saved-home');
    mark('optional account keeps local library privately and explicitly saves public home');
    const rileyKey=await createAccount(b,'Riley');
    await people(a);await click(a,'#people-code-new');await peopleIdle(a);
    const contact=await a.eval('document.getElementById("people-own-code").value');
    await people(b);await click(b,'#people-add');await type(b,'#people-contact-code',contact);await click(b,'#people-request-send');await peopleIdle(b);
    await click(a,'#people-refresh');await peopleIdle(a);await click(a,'#people-tab-invitations');
    const request=(await peopleState(a)).incoming.find(i=>i.kind==='friend'&&i.state==='pending');assert.ok(request);
    await click(a,`[data-social-focus="respond-invitation:${request.id}:accept"]`);await peopleIdle(a);
    assert.equal((await peopleState(a)).friends[0].displayName,'Riley');
    for(const profile of soulBefore)assert.deepEqual((await keptProfiles(c)).find(p=>p.id===profile.id),profile);
    for(const tab of [a,b,c])assert.deepEqual(tab.page.errors,[]);
    await one.closeAll();await two.closeAll();await thirdAtHome.closeAll();await third.closeAll();
    await f.restart();mark('all clients closed before real room process restart');

    const returning=await f.context('r1-clean-arrival');
    const recovered=await device(returning,{origin:'127.0.0.1',name:'Sam'},{width:390,height:844,mobile:true});tables.push(recovered);
    assert.deepEqual(await recovered.dbg('groups'),[]);assert.equal(await recovered.dbg('diceSet'),'std');
    const cleanOriginal=await library(recovered);await recover(recovered,samKey);
    assert.deepEqual(await library(recovered),cleanOriginal,'recovery alone never replaces the new device library');
    await compare(recovered,'remote');await shot(recovered,'06-phone-recovery-comparison');await enableSync(recovered);
    assert.deepEqual(await library(recovered),kept);assert.deepEqual(await recovered.dbg('profiles.shared'),[]);
    await workspace(recovered,'tables');await homesIdle(recovered);
    assert.equal((await recovered.dbg('homes.state.cards')).find(h=>h.id===home.id).name,'The Copper Lantern');
    await shot(recovered,'07-phone-recovered-home');await click(recovered,`[data-home-focus="join:${home.id}"]`);await afterNavigation(recovered,home.roomKey);
    assert.equal(await recovered.dbg('settings.tableName'),'The Copper Lantern');assert.equal(await recovered.dbg('net.savedHome'),true);assert.equal(await recovered.logCount(),0,'saved home restores setup, not old rolls');
    await recovered.waitFor('window.__diceDebug.tableDesign.activeId==="copper"&&window.__diceDebug.tableDesign.status==="ready"');
    // Joining a room does not wait for optional account/library initialization.
    await recovered.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&window.__diceDebug.privateLibrary.state.namespace===window.__diceDebug.privateLibrary.state.person.id&&!window.__diceDebug.privateLibrary.state.blocked');
    assert.deepEqual((await recovered.dbg('groups')).map(({name,notation})=>({name,notation})),[{name:'Travel check',notation:'2d6+3'}]);
    mark('clean phone recovers the exact private kit and cold home without an old client repush');

    // Riley has no live page. Send only to the explicit fixture friend via UI.
    await people(recovered);await click(recovered,'#people-tab-friends');
    const friend=(await peopleState(recovered)).friends.find(p=>p.displayName==='Riley');assert.ok(friend);
    await click(recovered,`[data-social-focus="invite:${friend.id}"]`);await click(recovered,'#people-invite-send');await peopleIdle(recovered);
    const sent=(await peopleState(recovered)).outgoing.find(i=>i.kind==='home'&&i.state==='pending');assert.ok(sent);assert.equal(sent.home.id,home.id);
    mark('People sends a home invitation while the fixture recipient has no open client');
    await closeWorkspace(recovered);
    const other=await f.context('r1-riley-arrival');b=await device(other,{origin:'127.0.0.1',name:'Riley'},{width:390,height:844,mobile:true});tables.push(b);
    await recover(b,rileyKey);await closeWorkspace(b);
    const privateTurn=await compose(b,'3d6 t3 secret'),turnBefore=await b.dbg(`turnState(${JSON.stringify(privateTurn)})`);
    await people(b);await click(b,'#people-tab-invitations');await shot(b,'08-phone-incoming-invitation');
    const invitation=(await peopleState(b)).incoming.find(i=>i.kind==='home'&&i.state==='pending');assert.ok(invitation);assert.equal(invitation.home.id,home.id);assert.equal(invitation.home.name,'The Copper Lantern');
    const beforeUrl=await b.eval('location.href'),beforeSeat=await b.playerId();
    await click(b,`[data-social-focus="respond-invitation:${invitation.id}:accept"]`);await peopleIdle(b);
    assert.equal(await b.eval('location.href'),beforeUrl);assert.equal(await b.playerId(),beforeSeat);assert.deepEqual(await b.dbg(`turnState(${JSON.stringify(privateTurn)})`),turnBefore);
    assert.deepEqual(await b.dbg('profiles.shared'),[]);assert.equal((await accountState(b)).syncEnabled,false);
    await shot(b,'09-phone-accepted-still-at-own-turn');await click(b,`[data-social-focus="join:${invitation.id}"]`);await afterNavigation(b,home.roomKey);
    assert.equal(await b.dbg('settings.tableName'),'The Copper Lantern');assert.equal(await b.dbg('net.savedHome'),true);
    assert.equal(await recovered.logCount(),0,'the other-room private turn never enters this table');
    mark('Accept preserves the private turn and seat; separate Join reaches the same home');

    c=await device(thirdAtHome,{origin:'127.0.0.1',name:'Mira'},{width:390,height:844,mobile:true});tables.push(c);
    for(const profile of soulBefore)assert.deepEqual((await keptProfiles(c)).find(p=>p.id===profile.id),profile);
    assert.equal(await c.dbg('privateLibrary.state?.person||null'),null);
    const returnRoll=await compose(recovered,'2d6+3');await b.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(returnRoll)}`);await c.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(returnRoll)}`);await b.settle();await c.settle();
    const result=await recovered.entryState(returnRoll);
    const sharedFilm=await recovered.eval('window.__diceDebug.currentRoll.keyframes');
    for(const tab of [b,c]){assert.deepEqual(await tab.eval('window.__diceDebug.currentRoll.keyframes'),sharedFilm,'recovered member and guest see every same film double');assert.equal(await tab.eval('window.__diceDebug.currentRoll.playerName'),'Sam');const read=await tab.entryState(returnRoll);assert.deepEqual(read.values,result.values);assert.equal(read.total,result.total);assert.equal(await tab.eval('window.__diceDebug.currentRoll.set'),'tidewrack.seaglass');}
    await compose(c,'1d6');await recovered.settle();await b.settle();
    for(const profile of soulBefore)assert.deepEqual((await keptProfiles(c)).find(p=>p.id===profile.id),profile);
    await shot(recovered,'10-phone-return-with-guest-results');assert.equal(await recovered.eval('document.documentElement.scrollWidth'),390);
    for(const tab of [recovered,b,c])assert.deepEqual(tab.page.errors,[]);
    mark('recovered players and unchanged Soul Deal guest share matching results after return',{values:result.values,total:result.total,guests:1,recoveredAccounts:2});
    return report;
  }catch(error){
    // A prior device may already have left. Do not await evaluation on its
    // detached CDP session when taking diagnostic screenshots.
    for(const a of tables){try{const targets=await a.page.browser.send('Target.getTargets');if(!targets.targetInfos.some(t=>t.targetId===a.page.targetId))continue;await a.eval('document.getElementById("account-key")?.style.setProperty("visibility","hidden")');await capture(a,'failure-'+tables.indexOf(a));}catch{}}
    throw error;
  }finally{await f.close();}
}


// Hold the actual optional module response across a new navigation. The room
// remains playable, and explicit guest captures during loading survive the
// later private-namespace adoption. No artificial account/IDB result is supplied.
export async function runLibraryHydrationBoundary({capture=async()=>{}}={}){
  const f=await fixture(null),ctx=await f.context('r1-library-startup');
  try{
    const a=await device(ctx,{origin:'127.0.0.1',name:'Sam'},{width:390,height:844,mobile:true});
    await createAccount(a,'Sam');
    await a.dbg("profiles.create('Kept private')");await a.dbg("setDiceSet('tidewrack.seaglass')");await a.dbg('privateLibrary.settled()');
    const privateBefore=await library(a),person=(await accountState(a)).person.id;
    const browser=a.page.browser;let held=null;
    browser.on('Fetch.requestPaused',p=>{if(!held)held=p.requestId;else browser.send('Fetch.continueRequest',{requestId:p.requestId},a.page.sessionId).catch(()=>{});},a.page.sessionId);
    await browser.send('Network.enable',{},a.page.sessionId);await browser.send('Network.setCacheDisabled',{cacheDisabled:true},a.page.sessionId);
    await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/js/accountui.js',requestStage:'Response'}]},a.page.sessionId);
    await a.page.navigate(a.url);await afterNavigation(a,ctx.room);
    for(let n=0;n<150&&!held;n++)await new Promise(r=>setTimeout(r,20));assert.ok(held,'real optional module is held');
    assert.equal(await accountState(a),null);assert.deepEqual(await a.dbg('groups'),[]);assert.deepEqual(await a.dbg('profiles.shared'),[]);
    const roll=await compose(a,'1d6'),seat=await a.playerId();assert.equal((await a.entryState(roll)).values.length,1);
    await click(a,`.result-seat[data-player="${seat}"]`);await click(a,'#player-result-actions .keep-verb');await click(a,'#pop-variant');await type(a,'#pop-save-name','While library opens');await enter(a);
    await a.waitFor('window.__diceDebug.groups.some(g=>g.name==="While library opens")');
    const guestCapture=await keptProfiles(a);assert.ok(guestCapture.some(p=>p.pools.some(pool=>pool.name==='While library opens')));
    if(await a.eval('!document.getElementById("mods-popover").classList.contains("hidden")'))await click(a,'#pop-close');
    if(await a.dbg('tableResults.detailId'))await click(a,'#player-result-close');
    await capture(a,'11-phone-during-library-load');
    await browser.send('Fetch.continueRequest',{requestId:held},a.page.sessionId);await browser.send('Fetch.disable',{},a.page.sessionId);
    await a.waitFor(`window.__diceDebug.privateLibrary.state?.namespace===${JSON.stringify(person)}&&!!window.__diceDebug.privateLibrary.state.person&&!window.__diceDebug.privateLibrary.state.blocked`);
    assert.deepEqual(await library(a),privateBefore,'restored account keeps its whole prior library');assert.deepEqual(await keptProfiles(a),guestCapture,'loading-time guest capture remains separate');assert.deepEqual(await a.dbg('profiles.shared'),[]);
    if(await a.dbg('tableResults.detailId'))await click(a,'#player-result-close');
    await openAccount(a);await click(a,'#account-logout');await accountIdle(a);
    assert.equal((await accountState(a)).namespace,'guest');
    // The older IDB guest working version and the loading-time localStorage
    // capture are intentionally both retained; choose the latter explicitly.
    await click(a,'#account-compare');await a.waitFor('!document.getElementById("account-comparison").hidden');await accountIdle(a);
    assert.ok(await a.eval('Array.from(document.getElementById("account-local-version").options).some(o=>o.textContent.includes("Kept tab alternative"))'));
    await click(a,'#account-local-version');await key(a,'End','End',35);await enter(a);
    await a.waitFor('document.getElementById("account-local-preview").textContent.includes("While library opens")');
    await capture(a,'12-phone-loading-capture-comparison');
    await click(a,'#account-enable-sync');await accountIdle(a);
    assert.deepEqual((await a.dbg('groups')).map(({name,notation})=>({name,notation})),guestCapture.flatMap(p=>p.pools).map(({name,notation})=>({name,notation})));
    assert.deepEqual(a.page.errors,[]);
    return {realModuleHeld:true,guestRollAndCapture:true,privateDocumentExact:true,guestCaptureRetainedAsAlternative:true,guestCaptureExplicitlyRestored:true};
  }finally{await f.close();}
}
