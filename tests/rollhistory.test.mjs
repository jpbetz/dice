/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import { HISTORY_CAP, OPEN_TURN_CAP, trimRollHistory, canStartTurn } from '../js/rollhistory.js';
import {freePort, startServer, apiPost} from './e2e/harness.mjs';

const open = {rollId:'unfinished',throws:{used:1,max:3}};
const finished = Array.from({length:110},(_,i)=>({rollId:`done-${i}`}));
const trimmed=trimRollHistory([finished[0],open,...finished.slice(1)]);
assert.equal(trimmed.kept.length,101);
assert.equal(trimmed.kept[0],open);
assert.equal(trimmed.dropped.length,10);
assert.equal(trimRollHistory([{...open,cleared:true},...finished]).kept.length,100);
assert.ok(canStartTurn(Array(OPEN_TURN_CAP).fill(open),null),'ordinary rolls still work');
assert.ok(!canStartTurn(Array(OPEN_TURN_CAP).fill(open),{throws:3}));

const port=await freePort(), server=await startServer(port);
const post=(path,data)=>apiPost(port,path,data);
try {
  const room='long-turns';
  const joined=await post('/api/join',{room,name:'Alice'}), playerId=joined.data.playerId;
  const roll=async notation=>{
    const r=await post('/api/roll',{room,playerId,notation}); assert.equal(r.status,200,JSON.stringify(r.data)); return r.data.roll;
  };
  const shared=await roll('2d6 t3'), secret=await roll('2d6 t3 secret');
  let first;
  for(let i=0;i<HISTORY_CAP+5;i++) {const r=await roll('1d6'); first ||= r.rollId;}
  const late=await post('/api/join',{room,name:'Carol'});
  assert.ok(late.data.log.some(r=>r.rollId===shared.rollId),'late viewers see the unfinished shared turn');
  assert.ok(!late.data.log.some(r=>r.rollId===secret.rollId),'private turn remains absent');
  assert.ok(!late.data.log.some(r=>r.rollId===first),'completed history remains bounded');
  assert.equal(late.data.log.length,HISTORY_CAP+1);
  for(const r of [shared,secret]) {
    const again=await post('/api/rethrow',{room,playerId,rollId:r.rollId,keep:[0]});
    assert.equal(again.status,200,'old unfinished turn is still playable');
    assert.equal(again.data.roll.values[0],r.values[0],'its kept face survives');
    assert.equal(again.data.roll.throws.used,2);
  }
  const capRoom='turn-cap';
  const capPlayer=(await post('/api/join',{room:capRoom,name:'Sam'})).data.playerId;
  const capPost=(path,body)=>post(path,{room:capRoom,playerId:capPlayer,...body});
  let oldest;
  for(let i=0;i<OPEN_TURN_CAP;i++) {
    const r=await capPost('/api/roll',{notation:'1d6 t3 secret'});
    assert.equal(r.status,200); oldest ||= r.data.roll;
  }
  const refuse=await capPost('/api/roll',{notation:'1d6 t3'});
  assert.equal(refuse.status,409); assert.equal(refuse.data.code,'turn_capacity');
  assert.ok(!JSON.stringify(refuse.data).includes(oldest.rollId));
  assert.equal((await capPost('/api/roll',{notation:'1d6'})).status,200,'ordinary play continues at capacity');
  const offer=await capPost('/api/offer',{notation:'1d6 t3'});
  assert.equal(offer.status,200);
  const offerId=offer.data.offer?.offerId || offer.data.offerId;
  assert.ok(offerId);
  assert.equal((await capPost('/api/claim',{offerId})).status,409,'claims use the same capacity gate');
  assert.equal((await capPost('/api/rethrow',{rollId:oldest.rollId,keep:[]})).status,200,'existing turns still continue at capacity');
  assert.equal((await capPost('/api/clear-roll',{rollId:oldest.rollId})).status,200);
  assert.equal((await capPost('/api/claim',{offerId})).status,200,'a refused claim retains its offer and can retry after explicit clearing');
  console.log('rollhistory: retention, privacy, continued turns, and bounded creation passed');
} finally { server.kill('SIGTERM'); }
