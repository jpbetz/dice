/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sharingChoices, sharedIds, chooseSharedProfile, profilePublication } from '../js/profile-sharing.js';

const store = { activeId:'p1', profiles:[
  {id:'p1',name:'Private character',system:'none',pools:[{name:'Private old roll',notation:'1d6'}],personId:'never-public'},
  {id:'p2',name:'Shared character',system:'dnd',set:'ivory',pools:[{name:'Attack',notation:'1d20',id:1,revision:5}]},
] };
test('no consent publishes neither active rack nor alternate profiles', () => {
  const payload = profilePublication(store, [{name:'Hidden work',notation:'3d8'}], [], 'ivory');
  assert.deepEqual(payload,{pools:[],set:null,profile:null,system:null,library:[]});
});
test('selection is table-specific and new profiles never inherit it', () => {
  let choices = chooseSharedProfile(null,'copper','p2',true);
  assert.deepEqual(sharedIds(choices,'copper'),['p2']);
  assert.deepEqual(sharedIds(choices,'stone'),[]);
  const payload = profilePublication(store,[],sharedIds(choices,'copper'),'std');
  assert.equal(payload.profile,null);
  assert.deepEqual(payload.library,[{name:'Shared character',system:'dnd',set:'ivory',pools:[{name:'Attack',notation:'1d20'}]}]);
  choices = chooseSharedProfile(choices,'copper','p2',false);
  assert.deepEqual(choices,{v:1,tables:[]});
});
test('a selected active profile publishes live edits and only allowed fields', () => {
  const payload = profilePublication(store,[{id:99,name:'Current',notation:'2d6',revision:4,account:'private'}],['p1'],'ivory');
  assert.deepEqual(payload.pools,[{name:'Current',notation:'2d6'}]);
  assert.deepEqual(payload.library,[{name:'Private character',system:'none',pools:payload.pools}]);
  assert.equal(payload.set,'ivory');
  assert.ok(!JSON.stringify(payload).includes('personId'));
});
test('malformed or future consent fails closed and bounded tables expire privately', () => {
  assert.deepEqual(sharingChoices({v:2,tables:[{room:'copper',ids:['p1']}]}),{v:1,tables:[]});
  let choices = sharingChoices({v:1,tables:[null,{room:'copper',ids:['__proto__','p1','p1']}]});
  assert.deepEqual(sharedIds(choices,'copper'),['p1']);
  for(let i=0;i<40;i++) choices=chooseSharedProfile(choices,`table-${i}`,'p1',true);
  assert.equal(choices.tables.length,32);
  assert.deepEqual(sharedIds(choices,'copper'),[]);
});
