/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {createLibrarySession} from '../js/library-session.js';
import {transitionLibraryCache} from '../js/library-cache.js';
import {libraryDocument} from '../js/library-document.js';
import {emptyStore,addProfile} from '../js/profiles.js';

const person=n=>'p_'+String(n).repeat(43);
const doc=name=>{const profiles=emptyStore();addProfile(profiles,{name,system:'none',pools:[],at:1});return libraryDocument(profiles,{defaultSet:'std'}).document;};
const copy=x=>JSON.parse(JSON.stringify(x));
const records=new Map(),events=[];let seq=0,mirror=doc('Guest original'),canClear=true,hold=null,clearHold=null,readHold=null,readTarget=null;
const transition=(namespace,action)=>{const r=transitionLibraryCache(records.get(namespace),namespace,action,{id:`entry_${++seq}`.padEnd(12,'0'),at:seq});if(r.changed)records.set(namespace,r.state);return r;};
const read=namespace=>{const s=records.get(namespace);return s?{ok:true,state:copy(s),workingGeneration:s.workingGeneration,document:copy(s.entries.find(e=>e.id===s.workingId).document)}:{ok:false,code:'cache_missing'};};
const cache={ok:true,read:async n=>{if(readHold&&n===readTarget)await readHold;return read(n);},seed:async(n,document)=>transition(n,{type:'seed',document}),edit:async(n,g,document)=>{
  events.push('edit-start:'+n);if(hold)await hold;
  const r=transition(n,{type:'edit',expectedWorkingGeneration:g,document});events.push('edit-end:'+n);return r;
},chooseGuest:async(g,localEntryId)=>transition('guest',{type:'choose-local',expectedGeneration:g,localEntryId}),export:async n=>({ok:true,data:copy(records.get(n))}),close(){}};
let serverPerson=null;
const accountFactory=({onIdentityChange})=>{
  const adopt=async next=>{const accepted=await onIdentityChange({personId:next,previousPersonId:serverPerson});if(accepted===false)return {ok:false,code:'identity_transition_refused'};serverPerson=next;return {ok:true,person:next?{id:next,displayName:'Private person'}:null};};
  return {register:input=>adopt(input.personId),recover:key=>adopt(key),logout:()=>adopt(null),session:()=>adopt(serverPerson),status:async()=>({ok:true,available:true})};
};
const session=createLibrarySession({capture:()=>({ok:true,document:copy(mirror)}),apply:(d,n)=>{events.push('apply:'+n);mirror=copy(d);return true;},
  blockSharing:on=>events.push('sharing-block:'+on),clearSharing:async()=>{events.push('sharing-clear');if(clearHold)await clearHold;return canClear;},namespaceChanged:n=>events.push('namespace:'+n)},
  {cacheFactory:async()=>cache,accountFactory});
assert.equal((await session.initialize()).ok,true);assert.equal(session.info.namespace,'guest');
let release;hold=new Promise(r=>{release=r;});mirror=doc('Guest edited');assert.equal(session.edit(mirror),true);
assert.equal(session.info.pending,1,'a synchronous save acceptance is explicitly pending');
const entering=session.register({personId:person(1)});await Promise.resolve();
assert.equal(events.some(e=>e==='sharing-clear'),false,'namespace transition waits for accepted IDB edits');
release();hold=null;assert.equal((await entering).ok,true);
assert.equal(read('guest').document.profiles.profiles[0].name,'Guest edited');
assert.ok(events.indexOf('edit-end:guest')<events.indexOf('sharing-clear'));assert.ok(events.indexOf('sharing-clear')<events.indexOf('apply:'+person(1)));
assert.equal(session.info.syncEnabled,false,'identity creation does not enable upload');
mirror=doc('Account one');session.edit(mirror);await session.settled();
canClear=false;assert.equal((await session.recover(person(2))).ok,false);
assert.equal(session.info.namespace,person(1),'failed consent reset refuses adoption');assert.equal(mirror.profiles.profiles[0].name,'Account one');assert.equal(records.has(person(2)),false);
canClear=true;await session.recover(person(2));mirror=doc('Account two');session.edit(mirror);await session.settled();
await session.logout();assert.equal(session.info.namespace,'guest');assert.equal(mirror.profiles.profiles[0].name,'Guest edited');
await session.recover(person(1));assert.equal(mirror.profiles.profiles[0].name,'Account one','recovering a local namespace never reseeds it from another person');
const staleGeneration=session.info.workingGeneration;
await cache.edit(person(1),staleGeneration,doc('Winning other tab'));
mirror=doc('Stale tab kept edit');session.edit(mirror);await session.settled();
assert.equal(session.info.error.code,'local_conflict');assert.equal(session.info.error.retained,true);
assert.equal(mirror.profiles.profiles[0].name,'Stale tab kept edit','cache winner does not silently replace typed UI');
assert.equal(read(person(1)).document.profiles.profiles[0].name,'Winning other tab');
const exported=await session.exportOriginals();assert.ok(exported.data.entries.some(e=>e.document.profiles.profiles[0].name==='Stale tab kept edit'));
session.suspend();assert.equal(session.info.blocked,true);assert.equal((await session.flush()).ok,false);
// A real edit arriving during either async handoff gap aborts adoption and
// remains in the previous namespace, on screen and exportable.
await session.refreshAccount();
let releaseClear;clearHold=new Promise(r=>{releaseClear=r;});
const raceClear=session.recover(person(2));
while(!session.info.transitioning)await Promise.resolve();
await new Promise(r=>setTimeout(r,0));
mirror=doc('Edit during unsharing');session.edit(mirror);
releaseClear();clearHold=null;
assert.equal((await raceClear).ok,false);await session.settled();
assert.equal(session.info.namespace,person(1));assert.equal(session.info.blocked,true);
assert.equal(mirror.profiles.profiles[0].name,'Edit during unsharing');
assert.ok((await session.exportOriginals()).data.entries.some(e=>e.document.profiles.profiles[0].name==='Edit during unsharing'));
await session.refreshAccount();
let releaseRead;readTarget=person(2);readHold=new Promise(r=>{releaseRead=r;});
const raceRead=session.recover(person(2));
while(!session.info.transitioning)await Promise.resolve();
await new Promise(r=>setTimeout(r,0));
mirror=doc('Edit during cache read');session.edit(mirror);
releaseRead();readHold=null;
assert.equal((await raceRead).ok,false);await session.settled();
assert.equal(session.info.namespace,person(1));assert.equal(mirror.profiles.profiles[0].name,'Edit during cache read');
assert.ok((await session.exportOriginals()).data.entries.some(e=>e.document.profiles.profiles[0].name==='Edit during cache read'));
await session.logout();
await cache.edit('guest',session.info.workingGeneration,doc('Other guest tab'));
mirror=doc('Kept guest tab');session.edit(mirror);await session.settled();
const guestPreview=await session.preview(),guestAlternative=session.info.retainedId;
assert.equal((await session.choose(guestPreview.state.generation,{localEntryId:guestAlternative})).ok,true);
assert.equal(session.info.syncEnabled,false);assert.equal(session.info.namespace,'guest');
assert.equal(mirror.profiles.profiles[0].name,'Kept guest tab');
const keptGuest=(await session.exportOriginals()).data;
assert.ok(keptGuest.entries.some(e=>e.document.profiles.profiles[0].name==='Other guest tab'));
assert.ok(keptGuest.entries.some(e=>e.document.profiles.profiles[0].name==='Kept guest tab'));
assert.equal(keptGuest.localConflictIds.length,0);
assert.equal(transition(person(1),{type:'choose-local',expectedGeneration:read(person(1)).state.generation,localEntryId:read(person(1)).state.workingId}).code,'invalid_choice');
console.log('library-session: durable handoff, refused sharing boundary, namespaces, and stale edits passed');
