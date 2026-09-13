/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {createLibrarySession} from '../js/library-session.js';
import {transitionLibraryCache} from '../js/library-cache.js';
import {libraryDocument} from '../js/library-document.js';
import {emptyStore,addProfile} from '../js/profiles.js';

const person=n=>'p_'+String(n).repeat(43);
const doc=name=>{const profiles=emptyStore();addProfile(profiles,{name,system:'none',pools:[],at:1});return libraryDocument(profiles,{defaultSet:'std'}).document;};
const copy=x=>JSON.parse(JSON.stringify(x));
const records=new Map(),events=[];let seq=0,mirror=doc('Guest original'),canClear=true,hold=null;
const transition=(namespace,action)=>{const r=transitionLibraryCache(records.get(namespace),namespace,action,{id:`entry_${++seq}`.padEnd(12,'0'),at:seq});if(r.changed)records.set(namespace,r.state);return r;};
const read=namespace=>{const s=records.get(namespace);return s?{ok:true,state:copy(s),workingGeneration:s.workingGeneration,document:copy(s.entries.find(e=>e.id===s.workingId).document)}:{ok:false,code:'cache_missing'};};
const cache={ok:true,read:async n=>read(n),seed:async(n,document)=>transition(n,{type:'seed',document}),edit:async(n,g,document)=>{
  events.push('edit-start:'+n);if(hold)await hold;
  const r=transition(n,{type:'edit',expectedWorkingGeneration:g,document});events.push('edit-end:'+n);return r;
},export:async n=>({ok:true,data:copy(records.get(n))}),close(){}};
let serverPerson=null;
const accountFactory=({onIdentityChange})=>{
  const adopt=async next=>{const accepted=await onIdentityChange({personId:next,previousPersonId:serverPerson});if(accepted===false)return {ok:false,code:'identity_transition_refused'};serverPerson=next;return {ok:true,person:next?{id:next,displayName:'Private person'}:null};};
  return {register:input=>adopt(input.personId),recover:key=>adopt(key),logout:()=>adopt(null),session:()=>adopt(serverPerson),status:async()=>({ok:true,available:true})};
};
const session=createLibrarySession({capture:()=>({ok:true,document:copy(mirror)}),apply:async(d,n)=>{events.push('apply:'+n);mirror=copy(d);return true;},
  blockSharing:on=>events.push('sharing-block:'+on),clearSharing:async()=>{events.push('sharing-clear');return canClear;},namespaceChanged:n=>events.push('namespace:'+n)},
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
console.log('library-session: durable handoff, refused sharing boundary, namespaces, and stale edits passed');
