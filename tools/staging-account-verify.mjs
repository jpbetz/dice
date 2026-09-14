/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {document} from '../tests/fixtures/library-harness.mjs';
import {browserTable,accountApi,publicApi,register,recover,cookieAttributes,accountState,accountIdle,openAccount,
  workspace,closeWorkspace,homesIdle,peopleIdle,compose,joinHome,afterJoin,click,type,key,hover} from './staging-account-browser.mjs';

const op=()=>crypto.randomUUID();
const root=fileURLToPath(new URL('../',import.meta.url));
const ok=result=>{assert.equal(result?.ok,true,'fixture action succeeds');return result;};
const snapshot=t=>t.dbg('privateLibrary.snapshot()').then(r=>r.document);
async function privateJournal(file,create){
  assert.ok(path.isAbsolute(file)&&file===path.resolve(file)&&!file.startsWith(root),'journal lives outside the checkout');
  const dir=path.dirname(file);await fs.mkdir(dir,{mode:0o700,recursive:true});
  const info=await fs.lstat(dir);assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0,'private journal directory required');
  assert.ok(!(await fs.realpath(dir)).startsWith(root),'resolved journal directory lives outside the checkout');
  if(create){const h=await fs.open(file,'wx',0o600);await h.close();}
  const stored=await fs.lstat(file);assert.ok(stored.isFile()&&!stored.isSymbolicLink()&&(stored.mode&0o077)===0,'private journal file required');
  assert.ok(stored.mode&0o200,'copy a read-only prepared snapshot to a writable working journal');
}
async function persist(file,state){
  const tmp=file+'.'+process.pid+'.tmp';let h;
  try{h=await fs.open(tmp,'wx',0o600);await h.writeFile(JSON.stringify(state));await h.sync();await h.close();h=null;await fs.rename(tmp,file);
    const dir=await fs.open(path.dirname(file),'r');try{await dir.sync();}finally{await dir.close();}}
  finally{if(h)await h.close();await fs.rm(tmp,{force:true});}
}
function validateTarget(origin,sha,allowLoopback){
  const url=new URL(origin);assert.equal(url.origin,origin);assert.equal(url.protocol,'https:');assert.equal(url.username+url.password,'');
  const loopback=['localhost','127.0.0.1'].includes(url.hostname);
  assert.ok(!url.port||(allowLoopback&&loopback&&url.port!=='8123'));
  assert.ok(/^dice-accounts-stage[-.].*\.run\.app$/.test(url.hostname)||(allowLoopback&&loopback),'only the reviewed staging service is supported');
  assert.match(sha,/^[a-f0-9]{7,40}$/);
}
async function health(origin,sha){const r=await fetch(origin+'/health',{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const h=await r.json();assert.equal(h.sha,sha,'published SHA matches the reviewed candidate');return {sha:h.sha,uptimeSec:h.uptimeSec};}
async function tables(t){await workspace(t,'tables');await homesIdle(t);}
async function people(t){await workspace(t,'people');await peopleIdle(t);}
async function chooseSelect(t,selector,value){
  const index=await t.eval(`Array.from(document.querySelector(${JSON.stringify(selector)}).options).findIndex(o=>o.value===${JSON.stringify(value)})`);
  assert.ok(index>=0);await click(t,selector);await key(t,'Home','Home',36);for(let i=0;i<index;i++)await key(t,'ArrowDown','ArrowDown',40);await key(t,'Enter','Enter',13);
  assert.equal(await t.eval(`document.querySelector(${JSON.stringify(selector)}).value`),value);
}
async function raw(t,route,{person,post=false,csrf=false}={}){
  return t.eval(`(async()=>{const session=await(await fetch('/api/account/session')).json();
    const r=await fetch('/api/account/'+${JSON.stringify(route)},{method:${JSON.stringify(post?'POST':'GET')},
      headers:{${person?`'X-Dice-Person':${JSON.stringify(person)},`:''}${post?`'Content-Type':'application/json','X-Dice-Account':'1',`:''}${csrf?`'X-Dice-CSRF':session.csrfToken,`:''}},
      ${post?`body:'{}',`:''}cache:'no-store'});return {status:r.status,value:await r.json()};})()`);
}
async function negative(t,owner,home,invite){
  assert.equal((await raw(t,'library')).status,409);
  const wrong=await raw(t,'library',{person:owner});assert.equal(wrong.status,409);assert.equal(wrong.value.code,'identity_changed');
  assert.equal((await raw(t,'logout',{post:true})).status,403);
  const id=(await accountApi(t,'session')).person.id;
  assert.equal((await accountApi(t,'home',id,home)).code,'home_not_found');
  assert.equal((await accountApi(t,'respondInvitation',id,invite,{operationId:op(),choice:'accept'})).code,'social_not_found');
  assert.deepEqual((await accountApi(t,'presence',id)).signals,[]);
}
async function publicPrivateCheck(t,privateText){
  const player=await t.playerId();const room=await t.eval('new URL(location.href).searchParams.get("room")');
  const joined=await publicApi(t,'join',{room,name:'Fixture observer'});assert.equal(joined.status,200);
  assert.equal(JSON.stringify(joined.value).includes(privateText),false,'private library never enters public join state');
  const me=joined.value.players.find(p=>p.id===player);assert.deepEqual(me?.library||[],[]);
}

/** No process/server/cloud management. All writes belong to this new fixture journal. */
export async function verifyStaging({phase,origin,sha,journal,revision,restoredFrom=null,allowLoopback=false,checkpoint=()=>{}}){
  validateTarget(origin,sha,allowLoopback);assert.ok(['prepare','verify'].includes(phase));assert.match(revision,/^[a-z0-9][a-z0-9-]{0,100}$/);
  if(restoredFrom){assert.equal(phase,'verify');validateTarget(restoredFrom,sha,allowLoopback);assert.notEqual(origin,restoredFrom);}
  await privateJournal(journal,phase==='prepare');
  const state=phase==='prepare'?{schema:1,fixture:true,origin,sha,nonce:crypto.randomBytes(6).toString('hex'),phase:'preparing',beforeRevision:revision,identities:{},checks:[]}:JSON.parse(await fs.readFile(journal,'utf8'));
  assert.equal(state.schema,1);assert.equal(state.fixture,true);assert.equal(state.origin,restoredFrom||origin);assert.equal(state.sha,sha);assert.match(state.nonce,/^[a-f0-9]{12}$/);
  if(phase==='verify'){assert.equal(state.phase,'prepared');assert.ok(!state.lastFailure,'inspect a partial fixture before any retry');assert.notEqual(state.beforeRevision,revision,'operator must supply a distinct serving revision');
    for(const who of ['a','b','c']){assert.match(state.identities[who].key,/^dt1_[A-Za-z0-9_-]{43}$/);assert.match(state.identities[who].id,/^p_[A-Za-z0-9_-]{43}$/);}}
  const sessions=[];let stage='health';
  const save=()=>persist(journal,state);
  const shot=async(t,name,selector)=>{
    if(selector)await hover(t,selector);else await t.page.browser.send('Page.bringToFront',{},t.page.sessionId);
    assert.equal(await t.eval('Array.from(document.querySelectorAll("#account-key, #people-own-code, #people-contact-code")).some(el=>el.value&&el.checkVisibility())'),false,'only non-secret fixture moments may be captured');
    const dir=path.join(path.dirname(journal),path.basename(journal)+'.images');await fs.mkdir(dir,{mode:0o700,recursive:true});
    const info=await fs.lstat(dir);assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0);
    const file=path.join(dir,phase+'-'+name+'.png');const handle=await fs.open(file,'wx',0o600);await handle.close();
    await t.page.screenshot(file);state.images||=[];state.images.push({phase,name,file:path.relative(path.dirname(journal),file)});await save();
  };
  const mark=async name=>{stage=name;state.checks.push({phase,name});await save();checkpoint(name);};
  const fresh=async(who,phone=false)=>{const s=await browserTable(origin,'Stage '+state.nonce.slice(0,6)+' '+who,{phone});sessions.push(s);return s;};
  try {
    state[phase+'Health']=await health(origin,sha);if(phase==='verify'){state.verificationTarget={origin,restoredFrom,revision};state.phase='verifying';}await save();
    const a=await fresh('A',phase==='verify'),b=await fresh('B',phase==='verify'),c=await fresh('C');
    const ta=a.table,tb=b.table,tc=c.table;
    assert.equal((await accountApi(ta,'status')).available,true);
    stage='fixture_accounts';
    if(phase==='prepare'){
      for(const [who,t] of [['a',ta],['b',tb],['c',tc]]){
        state.identities[who]={};state.identities[who].id=await register(t,'Stage '+state.nonce.slice(0,6)+' '+who,async recovery=>{state.identities[who].key=recovery;await save();});await save();
        await cookieAttributes(t);
      }
    }else{
      for(const [who,t] of [['a',ta],['b',tb],['c',tc]]){const before=await snapshot(t);await recover(t,state.identities[who].key,state.identities[who].id);assert.deepEqual(await snapshot(t),before,'recovery alone preserves the clean browser library');await cookieAttributes(t);}
    }
    const aid=state.identities.a.id,bid=state.identities.b.id,cid=state.identities.c.id;
    await mark('https_cookie_and_explicit_identity');
    if(phase==='prepare'){
      stage='private_library_conflict';const other=await fresh('A2');await recover(other.table,state.identities.a.key,aid);
      const docs=[document('Stage '+state.nonce+' A','1d20','tidewrack.seaglass'),document('Stage '+state.nonce+' B','2d20','symbols.monster')];
      state.libraryInputs=docs.map(doc=>({operationId:op(),baseRevision:null,document:doc}));await save();
      const replies=await Promise.all([accountApi(ta,'saveLibrary',aid,state.libraryInputs[0]),accountApi(other.table,'saveLibrary',aid,state.libraryInputs[1])]);
      assert.equal(replies.filter(r=>r.ok).length,1);assert.equal(replies.filter(r=>r.code==='revision_conflict').length,1);
      for(let i=0;i<2;i++)assert.deepEqual(await accountApi(ta,'saveLibrary',aid,state.libraryInputs[i]),replies[i]);
      assert.equal((await accountApi(ta,'saveLibrary',aid,{...state.libraryInputs[0],document:docs[1]})).code,'operation_reused');
      state.libraryVersions=state.libraryInputs.map(i=>'v_'+i.operationId);
      const head=ok(await accountApi(ta,'library',aid));state.original=document('Stage '+state.nonce+' original','3d6');
      state.kept=document('Stage '+state.nonce+' kept','2d6+3','tidewrack.seaglass');
      state.reconcile={operationId:op(),baseRevision:head.headRevision,document:state.kept,retainDocument:state.original,sourceVersionIds:state.libraryVersions};await save();
      state.reconciled=ok(await accountApi(ta,'saveLibrary',aid,state.reconcile,{reconcile:true}));await save();
      for(let i=0;i<2;i++)assert.deepEqual((await accountApi(ta,'library',aid,state.libraryVersions[i])).document,docs[i]);
      assert.deepEqual((await accountApi(ta,'library',aid,state.reconciled.originalVersionId)).document,state.original);
      await other.close();await mark('immutable_conflicts_exact_retry_and_retained_original');

      stage='saved_homes';const convertedName='Stage '+state.nonce.slice(0,6)+' converted',reservedName='Stage '+state.nonce.slice(0,6)+' reserved';
      assert.equal((await publicApi(ta,'settings',{room:a.room,playerId:await ta.playerId(),settings:{tableName:convertedName,venue:'copper',zoom:'close'}})).status,200);
      await ta.waitFor(`window.__diceDebug.settings.tableName===${JSON.stringify(convertedName)}`);
      state.ephemeralRoll=await compose(ta,'2d6+2');assert.equal(await ta.logCount(),1,'converted home begins with a real transient roll');await save();
      await tables(ta);await click(ta,'#homes-capture');await ta.waitFor('!!window.__diceDebug.homes.state.preview');await homesIdle(ta);
      const preview=await ta.dbg('homes.state.preview.document');assert.deepEqual(Object.keys(preview).sort(),['schema','settings','setup']);assert.equal(JSON.stringify(preview).includes(state.nonce+' kept'),false);
      await click(ta,'#home-save');await homesIdle(ta);state.converted=(await ta.dbg('homes.state.cards')).find(h=>h.roomKey===a.room);assert.ok(state.converted);await save();
      await click(ta,'#home-detail-back');await click(ta,'#homes-new');await type(ta,'#homes-new-name',reservedName);await click(ta,'#homes-new-form button[type="submit"]');await homesIdle(ta);await click(ta,'#home-save');await homesIdle(ta);
      state.reserved=(await ta.dbg('homes.state.cards')).find(h=>h.id!==state.converted.id);assert.ok(state.reserved?.roomKey.startsWith('h_'));assert.equal(await ta.eval('new URL(location.href).searchParams.get("room")'),a.room);
      await mark('visible_same_address_conversion_and_reserved_home');

      stage='fixture_invitation';await people(ta);await click(ta,'#people-add');await click(ta,'#people-code-new');await peopleIdle(ta);const code=await ta.eval('document.getElementById("people-own-code").value');
      const requested=ok(await accountApi(tb,'requestFriend',bid,{operationId:op(),code}));
      await click(ta,'#people-refresh');await peopleIdle(ta);await click(ta,'#people-tab-invitations');await click(ta,`[data-invitation-id="${requested.invitation.id}"] [data-social-focus="respond-invitation:${requested.invitation.id}:accept"]`);await peopleIdle(ta);
      await b.close(); // recipient is genuinely absent when the home invitation is sent
      await click(ta,'#people-tab-friends');await click(ta,`[data-social-focus="invite:${bid}"]`);await chooseSelect(ta,'#people-invite-home',state.converted.id);await click(ta,'#people-invite-send');await peopleIdle(ta);
      state.invitation=(await ta.dbg('people.state')).outgoing.find(i=>i.kind==='home'&&i.state==='pending'&&i.home?.id===state.converted.id);
      if(!state.invitation)state.invitation=(await accountApi(ta,'invitations',aid,{direction:'outgoing'})).invitations.find(i=>i.kind==='home'&&i.state==='pending');
      assert.ok(state.invitation);await save();await negative(tc,aid,state.converted.id,state.invitation.id);await publicPrivateCheck(ta,state.nonce+' kept');
      await mark('offline_fixture_invitation_and_negative_access');state.phase='prepared';await save();
    }else{
      stage='recovered_versions';for(let i=0;i<2;i++)assert.deepEqual((await accountApi(ta,'library',aid,state.libraryVersions[i])).document,state.libraryInputs[i].document);
      assert.deepEqual((await accountApi(ta,'library',aid,state.reconciled.originalVersionId)).document,state.original);assert.deepEqual((await accountApi(ta,'library',aid)).document,state.kept);
      await openAccount(ta);await click(ta,'#account-compare');await ta.waitFor('!document.getElementById("account-comparison").hidden');await accountIdle(ta);await shot(ta,'library-comparison','#account-remote-preview');await click(ta,'#account-choice-remote');await click(ta,'#account-enable-sync');await accountIdle(ta);await click(ta,'#account-sync-retry');await accountIdle(ta);
      assert.deepEqual(await snapshot(ta),state.kept);assert.deepEqual(await ta.dbg('profiles.shared'),[]);await shot(ta,'library-adopted','#account-notice');await mark('clean_browser_retains_versions_and_explicitly_adopts_library');
      stage='cold_home_return';for(const home of [state.reserved,state.converted]){await joinHome(ta,home.id,home.roomKey,home.name);assert.equal(await ta.logCount(),0,'cold home restores setup without per-roll history');}
      assert.equal(await ta.dbg('settings.venue'),'copper');assert.equal(await ta.dbg('zoom'),'close');await publicPrivateCheck(ta,state.nonce+' kept');await tables(ta);await shot(ta,'both-homes','#homes-cards');await mark('both_cold_home_addresses_restore_public_setup');
      stage='recipient_accept_and_join';await negative(tc,aid,state.converted.id,state.invitation.id);
      const turn=await compose(tb,'3d6 t3 secret'),before=await tb.dbg(`turnState(${JSON.stringify(turn)})`),seat=await tb.playerId(),url=await tb.eval('location.href');
      await people(tb);await click(tb,'#people-tab-invitations');await click(tb,`[data-invitation-id="${state.invitation.id}"] [data-social-focus="respond-invitation:${state.invitation.id}:accept"]`);await peopleIdle(tb);
      assert.equal(await tb.eval('location.href'),url);assert.equal(await tb.playerId(),seat);assert.deepEqual(await tb.dbg(`turnState(${JSON.stringify(turn)})`),before);assert.deepEqual(await tb.dbg('profiles.shared'),[]);
      await shot(tb,'invitation-accepted-before-join',`[data-social-focus="join:${state.invitation.id}"]`);
      await click(tb,`[data-social-focus="join:${state.invitation.id}"]`);await afterJoin(tb,state.converted.roomKey);assert.equal(await ta.logCount(),0);
      const roll=await compose(ta,'2d6+3');await tb.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(roll)}`);await tb.settle();
      const film=await ta.eval('window.__diceDebug.currentRoll.keyframes');assert.ok(Array.isArray(film)&&film.length>0,'completed shared film contains actual frames');
      assert.deepEqual((await ta.entryState(roll)).values,(await tb.entryState(roll)).values);assert.deepEqual(film,await tb.eval('window.__diceDebug.currentRoll.keyframes'));await shot(ta,'shared-recovered-result');await mark('accept_preserves_private_turn_and_separate_join_shares_film');
      stage='presence_revocation';assert.equal((await accountApi(tb,'presence',bid)).signals.find(s=>s.person.id===aid).state,'unknown');
      ok(await accountApi(ta,'setPresence',aid,{online:true}));assert.equal((await accountApi(tb,'presence',bid)).signals.find(s=>s.person.id===aid).state,'online');
      assert.deepEqual((await accountApi(tb,'homePresence',bid,state.converted.id)).signals,[]);
      ok(await accountApi(ta,'setPresence',aid,{online:true,homeId:state.converted.id,room:state.converted.roomKey,playerId:await ta.playerId()}));
      assert.equal((await accountApi(tb,'homePresence',bid,state.converted.id)).signals[0].person.id,aid);
      ok(await accountApi(ta,'setPresence',aid,{online:false}));assert.equal((await accountApi(tb,'presence',bid)).signals.find(s=>s.person.id===aid).state,'unknown');
      const second=await fresh('A2');await recover(second.table,state.identities.a.key,aid);ok(await accountApi(second.table,'setPresence',aid,{online:true}));ok(await accountApi(ta,'revokeOthers'));
      assert.equal((await accountApi(tb,'presence',bid)).signals.find(s=>s.person.id===aid).state,'unknown');assert.equal((await accountApi(second.table,'session')).person,null);await second.close();
      const lease=ok(await accountApi(ta,'setPresence',aid,{online:true}));assert.ok(lease.expiresAt>Date.now()&&lease.expiresAt<=Date.now()+91000);
      assert.equal((await accountApi(tb,'presence',bid)).signals.find(s=>s.person.id===aid).state,'online');
      while(Date.now()<lease.expiresAt+250)await new Promise(r=>setTimeout(r,Math.min(45000,lease.expiresAt+250-Date.now())));
      assert.equal((await accountApi(tb,'presence',bid)).signals.find(s=>s.person.id===aid).state,'unknown');
      await mark('separate_presence_consent_expiry_and_session_revocation');
      state.afterRevision=revision;state.phase='verified';await save();
    }
    for(const s of sessions)assert.deepEqual(s.table.page.errors,[]);
    return {ok:true,phase,checks:state.checks.filter(c=>c.phase===phase).map(c=>c.name),restored:!!restoredFrom,revisionEvidence:'operator-supplied; verify against Cloud Run records'};
  }catch(error){state.lastFailure={phase,stage};await save();throw Object.assign(new Error('Staging fixture verification failed',{cause:error}),{stage});}
  finally{for(const s of sessions)await s.close();}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    const [phase,...args]=process.argv.slice(2),options={phase};assert.equal(args.length%2,0);
    for(let i=0;i<args.length;i+=2){const flag=args[i].slice(2),name=flag==='restored-from'?'restoredFrom':flag;assert.ok(['origin','sha','journal','revision','restoredFrom'].includes(name)&&args[i].startsWith('--')&&!Object.hasOwn(options,name));options[name]=args[i+1];}
    assert.ok(['origin','sha','journal','revision'].every(k=>options[k]));
    console.log(JSON.stringify(await verifyStaging({...options,checkpoint:check=>console.log(JSON.stringify({check}))})));
  }catch(error){console.log(JSON.stringify({ok:false,check:error.stage||'configuration'}));process.exitCode=1;}
}
