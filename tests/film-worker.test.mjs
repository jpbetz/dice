/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {FilmClient} from '../js/film-client.js';
import {rngFromState,captureFilm} from '../js/film-wire.js';
import * as CANNON from '../vendor/cannon-es.js';
const made=[];
const createWorker=()=>{const worker={postMessage(data){this.sent=data;},terminate(){this.dead=true;}};made.push(worker);return worker;};
const client=new FilmClient({createWorker,fallback:input=>({fallback:input})});
let a=client.run({seed:1});const w=made.at(-1);
assert.throws(()=>client.run({seed:2}),/already baking/);
w.onmessage({data:{id:999,result:'stale'}});assert.ok(client.pending,'unmatched message ignored');
w.onmessage({data:{id:w.sent.id,result:'done',bakeMs:12}});
assert.equal((await a).result,'done');assert.equal(client.stats.last.execution,'worker');
a=client.run({seed:3});assert.equal(made.length,1,'reuse the initialized module worker');
assert.equal(client.cancel(),true);assert.equal(await a,null);assert.ok(w.dead);
const b=client.run({seed:4}),newWorker=made.at(-1);
w.onmessage({data:{id:w.sent.id,result:'canceled'}});
w.onerror({message:'late canceled load error'});
assert.ok(client.pending,'old worker errors cannot disrupt a replacement');
assert.equal(client.stats.failures,0);
newWorker.onmessage({data:{id:newWorker.sent.id,result:'new',bakeMs:8}});
assert.equal((await b).result,'new');assert.equal(client.stats.canceled,1);
const missing=new FilmClient({createWorker(){throw Error('Unavailable');},fallback:input=>input});
assert.equal((await missing.run(42)).result,42);assert.equal(missing.stats.last.execution,'inline-fallback');
const bad=new FilmClient({createWorker,fallback:input=>input});a=bad.run(7);made.at(-1).onmessage({data:{id:made.at(-1).sent.id,error:'decode failed'}});
assert.equal((await a).result,7);assert.equal(bad.stats.failures,1);
const timeout=new FilmClient({createWorker,timeoutMs:2,fallback:input=>input});assert.equal((await timeout.run(8)).result,8);assert.match(timeout.stats.last.reason,/timed out/);
// PRNG resumability preserves the original stream after spawn consumed its draws.
function oldRng(a){a|=0;return()=>{a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
for(const seed of [0,1,42,0xffffffff]) {const old=oldRng(seed),rng=rngFromState(seed);for(let i=0;i<640;i++)assert.equal(rng(),old());const resume=rngFromState(rng.state());for(let i=0;i<200;i++)assert.equal(resume(),old());}
const world=new CANNON.World();world.broadphase=new CANNON.SAPBroadphase(world);world.addBody(new CANNON.Body({mass:0,shape:new CANNON.Sphere(1)}));
assert.equal(captureFilm({world,pouring:false},()=>{}),null,'unsupported colliders keep the original inline bake');
console.log('film-worker: passed');
