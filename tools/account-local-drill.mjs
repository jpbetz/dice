/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// Disposable local operations proof. Accepts no resource/path arguments, owns
// only ephemeral loopback processes and private temporary directories, and
// emits aggregate checks only. Never use an operator's live snapshot here.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appServer, publicAction } from '../tests/fixtures/app-server.mjs';
import { cookieClient, document } from '../tests/fixtures/library-harness.mjs';
import { generateContactCode } from '../js/account.js';

const op=()=>crypto.randomUUID();
const key=()=>`dt1_${crypto.randomBytes(32).toString('base64url')}`;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const root=fileURLToPath(new URL('../',import.meta.url));
let stage='arguments',directory;const apps=[],checks=[];
async function start(dir,overrides={}){
  const app=await appServer(dir,{K_SERVICE:'',DICE_DEV_WRITE:'',...overrides});apps.push(app);return app;
}
async function copyStopped(source,target){
  await assert.rejects(fs.access(path.join(source,'writer.lock')),e=>e.code==='ENOENT');
  await fs.mkdir(target,{mode:0o700});
  for(const name of ['state.json','previous.json']){
    await fs.copyFile(path.join(source,name),path.join(target,name));await fs.chmod(path.join(target,name),0o600);
  }
}
try {
  assert.equal(process.argv.length,2);
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'dice-account-drill-'));
  const active=path.join(directory,'active'),backup=path.join(directory,'backup'),restored=path.join(directory,'restored');
  stage='configuration';
  const cleanEnv={...process.env};
  for(const name of Object.keys(cleanEnv))if(name.startsWith('DICE_ACCOUNT_')||name.startsWith('DICE_FIRESTORE_')||name==='K_SERVICE'||name==='DICE_DEV_WRITE')delete cleanEnv[name];
  const preflight=(env,args=[])=>spawnSync(process.execPath,[root+'tools/account-preflight.mjs',...args],{cwd:root,env:{...cleanEnv,...env},encoding:'utf8'});
  const file={DICE_ACCOUNT_STORE:'file',DICE_ACCOUNT_ORIGIN:'http://127.0.0.1:34567',DICE_ACCOUNT_DIR:active};
  assert.equal(preflight(file).status,0);await assert.rejects(fs.access(active),e=>e.code==='ENOENT');
  assert.equal(preflight(file,['--production']).status,2);
  assert.equal(preflight({DICE_ACCOUNT_STORE:'paused'},['--production']).status,2);
  assert.equal(preflight({DICE_ACCOUNT_STORE:'firestore',DICE_ACCOUNT_ORIGIN:'https://staging.invalid',DICE_FIRESTORE_PROJECT:'fixture-project',DICE_FIRESTORE_DATABASE:'dice-accounts-stage',DICE_ACCOUNT_NAMESPACE:'stage-v1'},['--production']).status,0);
  checks.push('preflight_has_no_storage_or_network_side_effects');

  stage='prepare_kept_state';let app=await start(active);
  const ak=key(),bk=key(),a=cookieClient(app.origin),b=cookieClient(app.origin);
  const ap=(await a.client.register({recoveryKey:ak,recoveryAcknowledged:true,displayName:'Drill one'})).person.id;
  const bp=(await b.client.register({recoveryKey:bk,recoveryAcknowledged:true,displayName:'Drill two'})).person.id;
  const savedDocument=document('Backup original','1d20','tidewrack.seaglass');
  assert.equal((await a.client.saveLibrary(ap,{operationId:op(),baseRevision:null,document:savedDocument})).ok,true);
  const reserved=(await a.client.createHome(ap,{operationId:op(),name:'Drill reserved home'})).home;
  const guest=await publicAction(app.origin,'new-room',{name:'Drill converted home'});
  const joined=await publicAction(app.origin,'join',{room:guest.value.room,name:'Drill guest'}),seat={room:guest.value.room,playerId:joined.value.playerId};
  await publicAction(app.origin,'settings',{...seat,settings:{venue:'stone',zoom:'close'}});
  const capture=await a.client.captureHome(ap,seat);
  const converted=(await a.client.createHome(ap,{...seat,operationId:op(),expectedCapture:capture.captureRevision})).home;
  const code=generateContactCode();await a.client.setContactCode(ap,{operationId:op(),code});
  const request=await b.client.requestFriend(bp,{operationId:op(),code});
  assert.equal((await a.client.respondInvitation(ap,request.invitation.id,{operationId:op(),choice:'accept'})).ok,true);
  const accepted=await a.client.inviteHome(ap,{operationId:op(),toPersonId:bp,homeId:reserved.id});
  assert.equal((await b.client.respondInvitation(bp,accepted.invitation.id,{operationId:op(),choice:'accept'})).ok,true);
  const pending=await a.client.inviteHome(ap,{operationId:op(),toPersonId:bp,homeId:converted.id});
  assert.equal(pending.ok,true);await a.client.setPresence(ap,{online:true});
  const oldCookie=a.cookie();await app.stop();
  await copyStopped(active,backup);checks.push('stopped_private_backup_copies_both_snapshots');

  stage='record_later_acknowledged_writes';app=await start(active);
  const later=cookieClient(app.origin);later.setCookie(oldCookie);await later.client.session();assert.equal((await later.client.logout()).ok,true);
  later.setCookie(oldCookie);assert.equal((await later.client.session()).person,null);
  await later.client.recover(ak);const latest=await later.client.library(ap);
  assert.equal((await later.client.saveLibrary(ap,{operationId:op(),baseRevision:latest.headRevision,document:document('Later acknowledged edit','2d20')})).ok,true);
  assert.equal((await later.client.blockPerson(ap,bp,{operationId:op(),blocked:true})).ok,true);
  await app.stop();const originalAfter=hash(await fs.readFile(path.join(active,'state.json')));

  stage='maintenance';app=await start('',{DICE_ACCOUNT_STORE:'paused',DICE_ACCOUNT_DIR:'',DICE_ACCOUNT_ORIGIN:'',DICE_FIRESTORE_PROJECT:'',DICE_FIRESTORE_DATABASE:'',DICE_ACCOUNT_NAMESPACE:''});
  const status=await cookieClient(app.origin).client.status();assert.equal(status.paused,true);assert.equal(status.available,false);
  for(const room of [reserved.roomKey,converted.roomKey,'unknown-legacy-home'])assert.equal((await publicAction(app.origin,'join',{room,name:'Drill guest'})).status,503);
  const fresh=await publicAction(app.origin,'new-room',{name:'Maintenance guest'});
  const member=await publicAction(app.origin,'join',{room:fresh.value.room,name:'Drill guest'}),live={room:fresh.value.room,playerId:member.value.playerId};
  const turn=await publicAction(app.origin,'roll',{...live,notation:'3d6 t3'});assert.equal(turn.status,200);
  assert.equal((await publicAction(app.origin,'rethrow',{...live,rollId:turn.value.roll.rollId,keep:[0]})).value.roll.throws.used,2);
  assert.equal((await publicAction(app.origin,'join',{room:live.room,name:'Another drill guest'})).status,200);
  await app.stop();assert.equal(hash(await fs.readFile(path.join(active,'state.json'))),originalAfter);
  checks.push('pause_protects_cold_mappings_and_keeps_explicit_guest_play');

  stage='isolated_restore';await copyStopped(backup,restored);app=await start(restored);
  // Deliberate discriminator: restoring old account data also restores old
  // revocation state. The operator must reconcile this before public resume.
  const stale=cookieClient(app.origin);stale.setCookie(oldCookie);assert.equal((await stale.client.session()).person.id,ap);
  checks.push('restore_also_rolls_back_later_session_revocation');
  await stale.client.logout();
  const ca=cookieClient(app.origin).client,cb=cookieClient(app.origin).client;
  assert.equal((await ca.session()).person,null);assert.equal((await ca.recover(ak,{revokeOtherSessions:true})).person.id,ap);
  assert.equal((await cb.recover(bk,{revokeOtherSessions:true})).person.id,bp);
  assert.deepEqual((await ca.library(ap)).document,savedDocument);
  assert.equal((await ca.homes(ap)).homes.length,2);assert.equal((await cb.homes(bp)).homes[0].id,reserved.id);
  assert.equal((await cb.invitations(bp)).invitations.find(i=>i.id===pending.invitation.id).state,'pending');
  assert.equal((await ca.people(ap)).friends[0].id,bp);
  assert.equal((await cb.presence(bp)).signals[0].state,'unknown','recovery explicitly revoked restored sessions and their stale presence');
  for(const home of [reserved,converted]){
    const returned=await publicAction(app.origin,'join',{room:home.roomKey,name:'Drill returned guest'});
    assert.equal(returned.value.savedHome,true);assert.equal(returned.value.settings.tableName,home.name);
    if(home.id===converted.id){assert.equal(returned.value.settings.venue,'stone');assert.equal(returned.value.settings.zoom,'close');}
  }
  checks.push('clean_cookie_recovery_restores_library_membership_pending_invitation_and_addresses');
  checks.push('restore_does_not_include_later_library_edits_or_blocks');
  assert.equal(hash(await fs.readFile(path.join(active,'state.json'))),originalAfter);checks.push('restore_leaves_original_store_unchanged');
  stage='cleanup';for(const owned of apps)await owned.stop();await fs.rm(directory,{recursive:true,force:true});directory=null;
  process.stdout.write(JSON.stringify({ok:true,checks,cloudActions:0,retainedPrivateFiles:0},null,2)+'\n');
} catch {
  process.stdout.write(JSON.stringify({ok:false,stage})+'\n');process.exitCode=1;
} finally {
  for(const owned of apps)await owned.stop();
  if(directory)await fs.rm(directory,{recursive:true,force:true});
}
