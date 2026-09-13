/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFrameLoop} from '../js/frame-loop.js';
function fixture() {
  let id=0,visible=true,active=false;
  const pending=new Map(),deltas=[];
  const loop=createFrameLoop({draw:dt=>deltas.push(dt),active:()=>active,visible:()=>visible,
    request:fn=>{pending.set(++id,fn);return id;},cancel:id=>pending.delete(id)});
  return {loop,pending,deltas,setActive:v=>active=v,setVisible:v=>{visible=v;loop.visibilityChanged();},
    frame:now=>{const [id,fn]=pending.entries().next().value;pending.delete(id);fn(now);}};
}
test('coalesces invalidations, stops at rest and never accumulates idle wall time',()=>{
  const f=fixture();for(let i=0;i<100;i++)f.loop.invalidate();assert.equal(f.pending.size,1);
  f.frame(100);assert.equal(f.pending.size,0);assert.deepEqual(f.deltas,[0]);
  f.setActive(true);f.loop.invalidate();f.frame(100000);f.frame(100016);
  assert.deepEqual(f.deltas,[0,0,.016]);f.setActive(false);f.frame(100032);assert.equal(f.pending.size,0);
});
test('hidden tabs cancel scheduled work, coalesce hidden mutations and resume once',()=>{
  const f=fixture();f.setActive(true);f.loop.invalidate();f.frame(10);f.setVisible(false);
  assert.equal(f.pending.size,0);for(let i=0;i<100;i++)f.loop.invalidate();assert.equal(f.pending.size,0);
  f.setVisible(true);assert.equal(f.pending.size,1);f.frame(100000);assert.equal(f.deltas.at(-1),0);
});
test('a mutation during drawing schedules the required follow-up frame',()=>{
  let callback,frames=0,loop;
  loop=createFrameLoop({draw:()=>{if(++frames===1)loop.invalidate();},active:()=>false,visible:()=>true,
    request:fn=>(callback=fn,frames+1),cancel:()=>{}});
  loop.invalidate();callback(0);assert.equal(loop.state.pending,true);callback(16);
  assert.equal(loop.state.pending,false);assert.equal(frames,2);
});
