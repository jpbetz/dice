/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvitationMonitor} from '../js/invitation-monitor.js';

function fixture(){
  let time=1000,visible=true,current=null,serial=0;
  const timers=new Map(),counts=[];
  const monitor=createInvitationMonitor({access:()=>current,visible:()=>visible,changed:n=>counts.push(n)},
    {now:()=>time,setTimer:(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id)});
  return {monitor,counts,timers,set account(a){current=a;},set visible(v){visible=v;},
    advance(at){time=at;for(const [id,t] of [...timers])if(t.at<=at){timers.delete(id);t.fn();}}};
}
const pending=(id,expiresAt=60000)=>({id,state:'pending',expiresAt});

test('inbox badge includes older pending pages, expires locally, and only polls visible accounts',async()=>{
  const f=fixture(),calls=[];
  f.account={personId:'sam',epoch:1,invitations:async input=>{calls.push(input);return input.after
    ?{ok:true,invitations:[pending('older',2000)],next:null}
    :{ok:true,invitations:[{id:'done',state:'accepted'}],next:'second'};}};
  await f.monitor.refresh();assert.equal(f.monitor.count,1);assert.equal(calls.length,2);
  f.advance(2001);assert.equal(f.monitor.count,0,'expiry requires no successful read');
  f.visible=false;f.monitor.visibilityChanged();assert.equal(f.timers.size,0);
  await f.monitor.refresh();assert.equal(calls.length,2);
  f.account=null;f.monitor.identity();assert.equal(f.timers.size,0);
});

test('a response from the previous identity or before acceptance cannot restore the badge',async()=>{
  const f=fixture();let release;
  f.account={personId:'sam',epoch:1,invitations:()=>new Promise(r=>{release=r;})};
  const old=f.monitor.refresh();f.account=null;f.monitor.identity();
  release({ok:true,invitations:[pending('old')],next:null});await old;
  assert.equal(f.monitor.count,0);assert.deepEqual(f.counts,[]);
  f.account={personId:'riley',epoch:2,invitations:()=>new Promise(r=>{release=r;})};
  const before=f.monitor.refresh();
  f.monitor.update({owner:'riley:2',fresh:true,incoming:[],next:{incoming:null}});
  release({ok:true,invitations:[pending('accepted')],next:null});await before;
  assert.equal(f.monitor.count,0);
});

test('unavailable inbox clears a previously displayed count',async()=>{
  const f=fixture();let available=true;
  f.account={personId:'sam',epoch:1,invitations:async()=>available?{ok:true,invitations:[pending('a')],next:null}:{ok:false}};
  await f.monitor.refresh();assert.equal(f.monitor.count,1);available=false;
  await f.monitor.refresh();assert.equal(f.monitor.count,0);f.monitor.close();assert.equal(f.timers.size,0);
});
