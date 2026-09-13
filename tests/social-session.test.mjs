/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {createSocialSession} from '../js/social-session.js';
import {transitionSocialJournal as step} from '../js/social-journal.js';
const person=n=>'p_'+String(n).repeat(43),home={id:'h_'+'h'.repeat(43),roomKey:'saved-place',name:'A home'},invite='i_'+'a'.repeat(64);
const states=new Map(),sent=[],joins=[],beats=[],closed=[];let context,answer={ok:false,code:'account_unavailable'},homes=[],paused=false,beginGate=null,sendGate=null;
const write=(id,action)=>{const result=step(states.get(id),id,action);if(result.changed)states.set(id,result.state);return result;};
const journal={ok:true,read:async id=>write(id),begin:async(id,request)=>{const result=write(id,{kind:'begin',request,at:1});if(beginGate)await beginGate;return result;},complete:async(id,operation,attempt,result)=>write(id,{kind:'complete',id:operation,attempt,result}),forget:async(id,generation,ids,options)=>write(id,{kind:'forget',generation,ids,...options})};
function access(id,epoch=1){const send=async(...args)=>{sent.push({person:id,args:structuredClone(args)});if(sendGate)await sendGate;return answer;};
  return {personId:id,epoch,person:{id,displayName:'Account'},status:async()=>({enabled:true,available:!paused,paused,capabilities:['people','presence']}),people:async()=>({ok:true,friends:[],contactCode:{enabled:false}}),invitations:async()=>({ok:true,invitations:[],next:null}),homes:async()=>({ok:true,homes}),blockedPeople:async()=>({ok:true,blockedPeople:[],next:null}),
    respondInvitation:send,requestFriend:send,setContactCode:send,removeFriend:send,blockPerson:send,inviteHome:send,cancelInvitation:send,archiveInvitation:send,presence:async()=>({ok:true,signals:[]}),homePresence:async()=>({ok:true,signals:[]}),setPresence:async input=>{beats.push({person:id,input});return {ok:true,personId:id,expiresAt:Date.now()+90000};}};
}
context=access(person(1));const session=createSocialSession({access:()=>context,seat:()=>({room:'saved-place',playerId:'private-seat'}),join:key=>joins.push(key)},
  {journalFactory:async()=>journal,heartbeatFactory:args=>({setSharing:input=>args.account.setPresence(args.personId,input),close:options=>{closed.push(options);return Promise.resolve({ok:true});}})});
await session.load();assert.equal(session.info.fresh,true);assert.equal(beats.length,0,'visiting People never opts into presence');
await session.act('respond-invitation',{choice:'accept'},invite);assert.equal(session.info.records[0].status,'pending');const pending=session.info.records[0];assert.ok(states.get(person(1)).records.length);
answer={ok:true,personId:person(1),invitation:{id:invite,state:'accepted'}};await session.retry(pending.id);assert.deepEqual(sent[0].args,sent[1].args,'uncertain action retries its exact operation');assert.equal(session.joinHome(home.id),false,'historical acceptance cannot revive removed membership');assert.deepEqual(joins,[]);
homes=[home];await session.load();assert.deepEqual(joins,[],'fresh membership alone never joins');assert.equal(session.joinHome(home.id),true);assert.deepEqual(joins,['saved-place']);
await session.setSharing({online:true,location:true});assert.equal(beats.length,1);assert.equal(beats[0].input.playerId,'private-seat');paused=true;await session.load();await session.setSharing({online:false});assert.equal(beats.at(-1).input.online,false,'opt-out works while the service is paused');paused=false;
// The committed intent stays in its original namespace if identity changes
// before HTTP starts. The old heartbeat closes synchronously without a request.
await session.load();let release;beginGate=new Promise(r=>{release=r;});const before=sent.length,flight=session.act('friend-request',{code:'dc1_'+'c'.repeat(43)});
while(states.get(person(1)).records.length<2)await new Promise(r=>setTimeout(r,0));context=access(person(2));session.identity();assert.deepEqual(closed.at(-1),{withdraw:false});release();beginGate=null;
assert.equal((await flight).code,'identity_changed');assert.equal(sent.length,before);assert.deepEqual(session.info.records,[]);assert.deepEqual(session.info.homes,[]);
context=access(person(1),2);await session.load();assert.equal(session.info.records[0].status,'pending');
// A late accepted response may acknowledge only its original durable journal.
sendGate=new Promise(r=>{release=r;});const late=session.retry(session.info.records[0].id);while(sent.length===before)await new Promise(r=>setTimeout(r,0));context=access(person(2),2);session.identity();release();sendGate=null;assert.equal((await late).code,'identity_changed');assert.deepEqual(session.info.records,[]);assert.equal(states.get(person(1)).records[0].status,'saved');
console.log('social-session: durable exact requests, authoritative membership, opt-in/offline opt-out and fixed-owner completions passed');

// A response authorized before a relationship action may not restore its
// former signal, even when the browser still has the same account cookie.
{
  const friend = {id:person(3),displayName:'Riley'};
  let releasePresence, presenceGate = null, currentFriends = [friend];
  const fixed = access(person(4));
  fixed.people = async () => ({ok:true,friends:currentFriends,contactCode:{enabled:false}});
  fixed.presence = async () => {
    const result = {ok:true,signals:currentFriends.map(person => ({person,state:'online',expiresAt:Date.now()+90000}))};
    if (presenceGate) await presenceGate;
    return result;
  };
  fixed.homePresence = async () => ({ok:false,code:'account_unavailable'});
  fixed.blockPerson = async () => { currentFriends=[]; return {ok:true,personId:fixed.personId}; };
  const controlled = createSocialSession({access:()=>fixed,seat:()=>({room:home.roomKey})},{journalFactory:async()=>journal});
  await controlled.load(); await controlled.readPresence();
  assert.equal(controlled.info.signals[0].state,'online');
  assert.equal(controlled.info.homePresence.state,'unknown','a failed home projection is not a known empty home');
  presenceGate = new Promise(resolve => {releasePresence=resolve;});
  const held = controlled.readPresence();
  await controlled.act('block-person',{blocked:true},friend.id);
  assert.ok(controlled.info.signals.every(signal=>signal.state!=='online'),'mutation immediately clears displayed markers');
  releasePresence();
  assert.equal((await held).code,'request_superseded');
  assert.deepEqual(controlled.info.friends,[]);
  assert.ok(controlled.info.signals.every(signal=>signal.state!=='online'),'late pre-block projection cannot restore online state');
}
