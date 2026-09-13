/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Browser} from '../e2e/cdp.mjs';
import {Ctx,freePort,startServer} from '../e2e/harness.mjs';
import {click,type} from './visible-input.mjs';
export const state=a=>a.dbg('people.state');
export const idle=a=>a.waitFor('!!window.__diceDebug.people.state&&!window.__diceDebug.people.state.loading&&!document.getElementById("people-refresh").disabled');
export async function people(a){const shell=await a.eval('!document.getElementById("workspace").classList.contains("hidden")');await click(a,(shell?'#workspace .workspace-tabs':'#workspace-nav')+' [data-workspace="people"]');await a.waitFor('!!window.__diceDebug.people.state');await idle(a);}
export async function account(a,{name='Sam',recoveryKey}={}){
  // Account setup is a fixture. Its visible create/recover actions still use
  // hit-tested input; only opening the existing account task is debug setup.
  await a.dbg('privateLibrary.open()');await a.waitFor('document.getElementById("account-create")&&!document.getElementById("account-recover").disabled');
  if(recoveryKey){await click(a,'#account-recover');await type(a,'#account-key',recoveryKey);}
  else{await click(a,'#account-create');recoveryKey=await a.eval('document.getElementById("account-key").value');await type(a,'#account-name',name);await click(a,'#account-key-kept');}
  await click(a,'#account-submit');await a.waitFor('!!window.__diceDebug.privateLibrary.state?.person&&!document.getElementById("account-refresh").disabled');return recoveryKey;
}
export async function fixture(t,{mode='file',browser:providedBrowser=null}={}){
  const port=await freePort(),directory=await mkdtemp(join(tmpdir(),'dice-people-ui-')),env={DICE_ACCOUNT_STORE:mode,DICE_ACCOUNT_DIR:directory,DICE_ACCOUNT_ORIGIN:`http://127.0.0.1:${port}`};let server=await startServer(port,{env});const contexts=[],browsers=[];
  async function stop(){if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await done;}}
  const close=async()=>{for(const c of contexts)await c.closeAll();for(const b of browsers)await b.close();await stop();await rm(directory,{recursive:true,force:true});};t?.after(close);
  return {port,directory,close,async context(room,browser=providedBrowser){if(!browser){browser=await new Browser().launch();browsers.push(browser);}const context=new Ctx(browser,port,room,server);contexts.push(context);return context;},async restart(overrides={}){await stop();server=await startServer(port,{env:{...env,...overrides}});}};
}

// Arrange social data for focused race/layout tests. The ordinary contact,
// request and accept journey is exercised separately with visible input.
export async function seedFriendship(a,b){
  const first=await a.eval(`(async()=>{
    const api=await import('./js/account.js');window.__socialFixture=api.createAccountClient();
    const signed=await __socialFixture.session();window.__socialFixturePerson=signed.person.id;
    const code=api.generateContactCode();const result=await __socialFixture.setContactCode(signed.person.id,{operationId:crypto.randomUUID(),code});
    if(!result.ok)throw new Error('fixture contact code failed');return {id:signed.person.id,code};
  })()`);
  const second=await b.eval(`(async()=>{
    window.__socialFixture=(await import('./js/account.js')).createAccountClient();
    const signed=await __socialFixture.session();window.__socialFixturePerson=signed.person.id;
    const result=await __socialFixture.requestFriend(signed.person.id,{operationId:crypto.randomUUID(),code:${JSON.stringify(first.code)}});
    if(!result.ok)throw new Error('fixture request failed');return {id:signed.person.id,invitation:result.invitation.id};
  })()`);
  const accepted=await a.eval(`__socialFixture.respondInvitation(__socialFixturePerson,${JSON.stringify(second.invitation)},{operationId:crypto.randomUUID(),choice:'accept'})`);
  if(!accepted.ok)throw new Error('fixture acceptance failed');
  return {first:first.id,second:second.id,invitation:second.invitation};
}

export async function seedHome(a,{toPersonId}={}){
  const seat=await a.playerId();
  return a.eval(`(async()=>{
    const room=new URL(location.href).searchParams.get('room');
    const capture=await __socialFixture.captureHome(__socialFixturePerson,{room,playerId:${JSON.stringify(seat)}});
    if(!capture.ok)throw new Error('fixture home capture failed');
    const saved=await __socialFixture.createHome(__socialFixturePerson,{operationId:crypto.randomUUID(),room,
      playerId:${JSON.stringify(seat)},expectedCapture:capture.captureRevision});
    if(!saved.ok)throw new Error('fixture home save failed: '+saved.code);
    const invitation=${JSON.stringify(toPersonId||null)}?await __socialFixture.inviteHome(__socialFixturePerson,
      {operationId:crypto.randomUUID(),homeId:saved.home.id,toPersonId:${JSON.stringify(toPersonId||null)}}):null;
    if(invitation&&!invitation.ok)throw new Error('fixture invitation failed');
    return {home:saved.home,invitation:invitation?.invitation||null};
  })()`);
}
