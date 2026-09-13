/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {createHomeSession} from '../js/home-session.js';
import {exportHomeAction} from '../js/home-journal.js';
const person=n=>'p_'+String(n).repeat(43),home='h_'+'h'.repeat(43),room='test-room';
const document={schema:1,settings:{tableName:'Kept table',system:'none',venue:'table',felt:'obsidian'},setup:null};
const card={id:home,roomKey:room,name:'Kept table',headRevision:'v_abcdefgh'};
const recordStore=new Map(),sent=[];let gate=null,answer={ok:false,code:'account_unavailable'},context;
const journal={ok:true,read:async id=>({ok:true,records:[...recordStore.values()].filter(r=>r.personId===id)}),save:async r=>{recordStore.set(r.personId+':'+r.id,structuredClone(r));return {ok:true};}};
function access(id,epoch=1){return {personId:id,epoch,homes:async()=>({ok:true,homes:[card]}),home:async()=>({ok:true,home:card,document,versions:[]}),
  captureHome:async()=>({ok:true,document,captureRevision:'capture-one'}),createHome:async input=>{sent.push(structuredClone(input));if(gate)await gate;return answer;},saveHome:async(id,input)=>{sent.push(structuredClone(input));return answer;},leaveHome:async()=>({ok:true})};}
context=access(person(1));const session=createHomeSession({access:()=>context,seat:()=>({room,playerId:'private-live-seat'})},{journalFactory:async()=>journal});
assert.equal((await session.load()).ok,true);assert.equal((await session.capture()).ok,true);
assert.equal((await session.save()).code,'account_unavailable');const operation=session.info.records[0];assert.equal(operation.status,'pending');assert.ok(recordStore.has(person(1)+':'+operation.id));
assert.equal(JSON.stringify(exportHomeAction(operation)).includes('private-live-seat'),false,'export excludes the live credential');
answer={ok:true,personId:person(1),home:card};await session.retry(operation.id);assert.deepEqual(sent[0],sent[1],'uncertain retry keeps operation and capture bytes');assert.equal(session.info.records[0].status,'saved');
await session.capture(home);answer={ok:false,code:'home_conflict',candidateRevision:'v_competing',headRevision:'v_current'};await session.save();assert.equal(session.info.records[0].status,'conflict');assert.equal(session.info.preview.document.settings.tableName,'Kept table');
// A network completion belongs to its original journal, never the next UI.
await session.capture();let release;gate=new Promise(r=>{release=r;});const flight=session.save();while(sent.length<4)await new Promise(r=>setTimeout(r,0));
context=access(person(2));session.identity();release();gate=null;assert.equal((await flight).code,'identity_changed');assert.deepEqual(session.info.cards,[]);assert.deepEqual(session.info.records,[]);assert.equal(session.info.preview,null);
context=access(person(1),2);await session.load();assert.ok(session.info.records.length>=3,'previous-person actions remain recoverable after switching back');
// Even within one identity, a late save cannot replace the next task's preview.
answer={ok:true,personId:person(1),home:card};await session.capture();gate=new Promise(r=>{release=r;});const next=session.save();while(sent.length<5)await new Promise(r=>setTimeout(r,0));
session.newHome('A newer task');release();gate=null;assert.equal((await next).viewChanged,true);assert.equal(session.exportPreview().name,'A newer task');assert.equal(session.info.loading,false);
assert.equal(session.info.records[0].status,'saved','the completed request remains durable even when its old view is gone');
console.log('home-session: exact retries, retained conflicts, private export and fixed-owner/view completions passed');
