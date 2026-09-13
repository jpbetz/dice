/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
// Run the real worker and retain its actual transferred result, but control
// when the receiver may apply it. Cross-tab CDP/SSE latency must not decide
// whether a mutation races a fast solver. Active-solver input responsiveness
// has its own lifecycle/turn benchmark; this fixture proves merge ordering.
async function gateWorkerReplies(t) {
  await t.eval(`(() => {
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message',event=>{
          if(!window.__holdFilmReply)return;
          event.stopImmediatePropagation();
          window.__releaseFilmReply=()=>{
            window.__holdFilmReply=false;window.__releaseFilmReply=null;
            this.dispatchEvent(new MessageEvent('message',{data:event.data}));
          };
        });
      }
    };
  })()`);
}
async function releaseWorkerReply(t) {
  await t.waitFor('!!window.__releaseFilmReply',{desc:'real worker posted its result'});
  await t.eval('window.__releaseFilmReply()');
}
export const filmMutationScenarios = [
  {name:'film-worker-live-mutations',tags:['film-worker','visibility','perf'],async fn(ctx) {
    const a=await ctx.newTable({origin:'localhost',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});
    for(const t of [a,b])await t.dbg('holdClock(true)');
    await gateWorkerReplies(a);
    for(const action of ['clearRoll','collectRoll']) {
      await b.roll('4d6');await a.settle();
      const old=await b.rollId();
      const pending=await a.eval(`(async()=>{const d=window.__diceDebug;
        const old=d.tableDice.filter(x=>x.rollId===${JSON.stringify(old)});
        if(old.length!==4)throw Error('Bob has no settled dice on Alice table');
        window.__mutationWorld=old[0].body.world;window.__mutationIds=old.map(x=>x.body.id);window.__mutationDrops=[];
        if(window.__mutationOnRemove)window.__mutationWorld.removeEventListener('removeBody',window.__mutationOnRemove);
        window.__mutationOnRemove=e=>window.__mutationDrops.push({id:e.body.id,baking:!!d.currentRoll?.baking});
        window.__mutationWorld.addEventListener('removeBody',window.__mutationOnRemove);
        const completed=d.filmWorker.completed;window.__holdFilmReply=true;d.commandRoll('40d20');
        const until=performance.now()+5000;
        while(!d.currentRoll?.baking&&performance.now()<until)await new Promise(r=>setTimeout(r,1));
        return {completed,baking:!!d.currentRoll?.baking};})()`);
      assert.ok(pending.baking,'Alice is baking a real shared stress roll among Bob dice');
      await b.dbg(`${action}(${JSON.stringify(old)})`);
      await a.waitFor('window.__mutationIds.every(id=>!window.__mutationWorld.getBodyById(id))');
      const drops=await a.eval('window.__mutationDrops.filter(e=>window.__mutationIds.includes(e.id))');
      assert.equal(drops.length,4,'all old colliders leave immediately');
      assert.ok(drops.every(e=>e.baking),'old dice leave before the pending worker film is applied');
      await releaseWorkerReply(a);
      await a.waitFor(`window.__diceDebug.filmWorker.completed>${pending.completed}`);
      assert.equal(await a.dbg('filmWorker.baking'),false,`worker can merge after ${action}: ${a.page.consoleErrors.join('; ')}`);
      const state=await a.eval(`({missing:window.__mutationIds.every(id=>!window.__mutationWorld.getBodyById(id)),
        axis:window.__mutationWorld.broadphase.axisList.every(body=>window.__mutationWorld.getBodyById(body.id)===body),
        unique:new Set(window.__mutationWorld.broadphase.axisList).size===window.__mutationWorld.bodies.length})`);
      assert.ok(state.missing&&state.axis&&state.unique,'old colliders stay absent from body map and SAP');
      await a.settle();await b.settle();
      // Exercise the original inline solver next, then independently rebuild its
      // snapshot. This catches stale indices/collision state left by the merge.
      await a.dbg('filmAudit(true)');await a.dbg('useFilmWorker(false)');
      await a.dbg(`throwSeeded(['d20','d6'],2026)`);
      const next=await a.eval(`(async()=>{const d=window.__diceDebug,w=await import('/js/film-wire.js');
        const film=w.unpackFilm(w.bakeCaptured(d.filmInput)),r=d.currentRoll;
        return ['keyframes','sounds','landings','nudges'].every(k=>JSON.stringify(film[k])===JSON.stringify(r[k]))
          &&JSON.stringify(film.roughTrack)===JSON.stringify(r.rough);})()`);
      assert.ok(next,'next throw retains live-world/snapshot film parity after mutation');
      await a.settle();
    }
    assert.deepEqual(a.page.consoleErrors,[]);assert.deepEqual(b.page.consoleErrors,[]);
  }},
  {name:'film-worker-old-reveal',tags:['film-worker','visibility'],async fn(ctx) {
    const a=await ctx.newTable({origin:'localhost',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});
    for(const t of [a,b])await t.dbg('holdClock(true)');
    await gateWorkerReplies(a);
    await b.roll('4d6 held');await a.settle();const old=await b.rollId();
    const started=await a.eval(`(async()=>{const d=window.__diceDebug;
      window.__oldRevealDice=d.tableDice.filter(x=>x.rollId===${JSON.stringify(old)});
      window.__oldRevealQuats=window.__oldRevealDice.map(x=>x.body.quaternion.toArray());
      const completed=d.filmWorker.completed;window.__holdFilmReply=true;d.commandRoll('40d20');const until=performance.now()+5000;
      while(!d.currentRoll?.baking&&performance.now()<until)await new Promise(r=>setTimeout(r,1));
      return {completed,baking:!!d.currentRoll?.baking};})()`);
    assert.ok(started.baking);
    await b.dbg(`reveal(${JSON.stringify(old)})`);
    await a.waitFor('window.__oldRevealDice.every(d=>!d.shrouded)');
    const revealed=await a.eval(`({baking:window.__diceDebug.filmWorker.baking,
      quats:window.__oldRevealDice.map(d=>d.body.quaternion.toArray()),
      changed:window.__oldRevealDice.some((d,i)=>JSON.stringify(d.body.quaternion.toArray())!==JSON.stringify(window.__oldRevealQuats[i]))})`);
    assert.ok(revealed.baking&&revealed.changed,'Bob reveal changes an old collider before Alice worker film is applied');
    await releaseWorkerReply(a);
    await a.waitFor(`window.__diceDebug.filmWorker.completed>${started.completed}`);
    assert.equal(await a.dbg('filmWorker.baking'),false);
    assert.deepEqual(await a.eval('window.__oldRevealDice.map(d=>d.body.quaternion.toArray())'),revealed.quats,
      'worker reply cannot overwrite a revealed collider orientation');
    await a.settle();await b.settle();
    assert.deepEqual((await a.entryState(old)).values,(await b.entryState(old)).values);
    assert.deepEqual(a.page.consoleErrors,[]);assert.deepEqual(b.page.consoleErrors,[]);
  }},
];
