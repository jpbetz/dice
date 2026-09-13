/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
export const filmTurnScenarios = [
  {name:'film-turn-fifo',tags:['film-turns','film-worker','mechanics'],async fn(ctx) {
    const a=await ctx.newTable({origin:'localhost',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});
    for(const t of [a,b]) await t.dbg('holdClock(true)');
    await a.eval('window.Worker=undefined'); // Original live-world solver is the oracle.
    await a.roll('6d6 t3');const id=await a.rollId(), q=JSON.stringify(id);
    await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q);
    const old=(await ctx.api('/api/join',{name:'Witness'})).data;
    await a.dbg('throwAgain('+q+',[0,2,4])');
    await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===2');await a.settle();
    await a.dbg('throwAgain('+q+',[0,2,4])');
    await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===3');await a.settle();
    await b.waitFor('window.__diceDebug.queueLength===2');
    await b.dbg('netEvent("hello",'+JSON.stringify(old)+')');
    assert.equal(await b.dbg('queueLength'),2,'stale snapshot cannot replace or duplicate newer queued throws');
    const rows=await b.dbg('tableResults.rows');
    assert.ok(rows.some(r=>r.name==='Alice'&&r.rolling&&!r.result),'queued outcome stays absent from shared result read');
    await b.settle();
    const expected=await a.dbg('turnState('+q+')'),actual=await b.dbg('turnState('+q+')');
    assert.deepEqual(actual,expected,'delayed viewer preserves whole rethrow seed, kept poses, faces, budget and log');
    assert.equal(await b.logCount(),1,'all three throws replace one history row');
    assert.equal(await a.dbg('filmWorker.last.execution'),'inline-fallback');
    assert.equal(await b.dbg('filmWorker.completed'),3,'all three throws really baked in a worker');
    const read="JSON.stringify((({keyframes,sounds,rough,landings,nudges})=>({keyframes,sounds,rough,landings,nudges}))(window.__diceDebug.currentRoll))";
    assert.equal(await b.eval(read),await a.eval(read),'worker rethrow preserves original live-world film in full');
    assert.deepEqual(a.page.consoleErrors,[]);assert.deepEqual(b.page.consoleErrors,[]);
  }},
  {name:'film-turn-reveal-order',tags:['film-turns','film-worker','visibility'],async fn(ctx) {
    const a=await ctx.newTable({origin:'localhost',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});
    for(const t of [a,b])await t.dbg('holdClock(true)');
    await a.roll('6d6 t3 held');const id=await a.rollId(),q=JSON.stringify(id);
    await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q);
    assert.equal(await a.dbg('throwAgain('+q+',[0,2,4])'),true);
    await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===2');await a.settle();
    await a.dbg('reveal('+q+')');await a.waitFor('!window.__diceDebug.entryState('+q+').hidden');await a.settle();
    assert.equal(await a.dbg('throwAgain('+q+',[0,2,4])'),true);
    await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===3');await a.settle();
    await b.waitFor('window.__diceDebug.queueLength===3');
    assert.equal(await b.dbg('currentRoll.values'),null,'later authorized reveal does not alter first shrouded film');
    await b.settle();
    const expected=await a.dbg('turnState('+q+')'),actual=await b.dbg('turnState('+q+')');
    assert.deepEqual(actual,expected,'reveal between queued rethrows preserves final kept orientation, artwork, values and budget');
    assert.equal(await b.dbg('shroudedCount'),0);
    assert.equal(await b.eval('window.__diceDebug.tableDice.filter(d=>d.rollId==='+q+').every(d=>!String(d.variant).includes("shroud"))'),true);
    const late=await ctx.newTable({origin:'127.0.0.124',name:'Late'});await late.settle();
    const restored=await late.dbg('turnState('+q+')');
    assert.deepEqual(restored.values,expected.values);assert.deepEqual(restored.faces,expected.values);
    assert.deepEqual(restored.throws,expected.throws);
    assert.equal(await late.dbg('filmWorker.completed'),0,'settled snapshot uses the documented silent inline reconstruction');
    for(const t of [a,b,late])assert.deepEqual(t.page.consoleErrors,[]);
  }},
  {name:'film-turn-bank-clear',tags:['film-turns','film-worker','visibility'],async fn(ctx) {
    const a=await ctx.newTable({origin:'localhost',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});
    for(const t of [a,b])await t.dbg('holdClock(true)');
    await a.roll('6d6 push>=1');const id=await a.rollId(),q=JSON.stringify(id);
    await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q);
    await a.dbg('throwAgain('+q+',[0,2,4])');
    await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===2');await a.settle();
    assert.equal(await a.dbg('bankTurn('+q+',[0,2,4])'),true);
    await b.waitFor('window.__diceDebug.queueLength===2');
    await b.settle();
    assert.equal(await b.dbg('currentRoll.push.banked'),true,'bank follows its queued rethrow');
    assert.deepEqual(await b.dbg('pushState('+q+')'),await a.dbg('pushState('+q+')'));
    // The shelf event must land AFTER every queued throw, without resurrecting
    // a cast that an earlier per-roll pending map already removed.
    await a.roll('4d6 t3');const next=await a.rollId(),nq=JSON.stringify(next);
    await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+nq);
    await a.dbg('throwAgain('+nq+',[0,2])');
    await a.waitFor('window.__diceDebug.turnState('+nq+').throws.used===2');await a.settle();
    await a.dbg('collectRoll('+nq+')');
    await b.waitFor('window.__diceDebug.pendingCollects.includes('+nq+')');await b.settle();
    assert.equal(await b.eval('window.__diceDebug.tableDice.some(d=>d.rollId==='+nq+')'),false,'collected queued turn cannot return');
    assert.deepEqual((await b.entryState(next)).values,(await a.entryState(next)).values);
    // A table-wide clear cancels the film and persists the latest queued
    // authored record, rather than addLogEntry deduping away throw two.
    await a.roll('4d6 t3');const clearId=await a.rollId(),cq=JSON.stringify(clearId);
    await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+cq);
    await a.dbg('throwAgain('+cq+',[0])');
    await a.waitFor('window.__diceDebug.turnState('+cq+').throws.used===2');await a.settle();
    await b.waitFor('window.__diceDebug.queueLength>0');await b.dbg('clearTable()');
    assert.equal(await b.dbg('queueLength'),0);assert.equal(await b.diceCount(),0);
    assert.deepEqual((await b.entryState(clearId)).values,(await a.entryState(clearId)).values,'whole clear keeps latest queued authoritative values');
    for(const t of [a,b])assert.deepEqual(t.page.consoleErrors,[]);
  }},
  {name:'film-turn-snapshot',tags:['film-turns','film-worker','resync','visibility'],async fn(ctx) {
    const a=await ctx.newTable({origin:'localhost',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});
    await b.page.addInitScript('window.__streams=[];window.EventSource=class extends EventSource{constructor(...a){super(...a);window.__streams.push(this)}}');
    await b.reload();
    for(const t of [a,b])await t.dbg('holdClock(true)');
    await a.roll('6d6 t3 held');const id=await a.rollId(),q=JSON.stringify(id);
    await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q);
    const old=(await ctx.api('/api/join',{name:'Witness'})).data;
    await b.eval('window.__streams.forEach(s=>s.close())'); // Actual missed events; hello enters the same production handler below.
    await a.dbg('throwAgain('+q+',[0,2,4])');
    await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===2');await a.settle();
    const snap=(await ctx.api('/api/join',{name:'Witness2'})).data;
    await b.dbg('netEvent("hello",'+JSON.stringify(snap)+')');
    assert.equal(await b.dbg('queueLength'),1,'newer snapshot waits behind the first film');
    assert.equal(await b.dbg('currentRoll.values'),null);
    await b.settle();
    assert.equal((await b.entryState(id)).hidden,true,'silent repair preserves the projected shroud');
    assert.equal(await b.dbg('shroudedCount'),6);
    assert.equal(await b.dbg('turnState('+q+').throws.used'),2);
    const bodyIds=await b.eval('window.__diceDebug.tableDice.map(d=>d.body.id)');
    await b.dbg('netEvent("hello",'+JSON.stringify(snap)+')');
    await b.dbg('netEvent("hello",'+JSON.stringify(old)+')');
    assert.deepEqual(await b.eval('window.__diceDebug.tableDice.map(d=>d.body.id)'),bodyIds,'same-version and stale snapshots never reconstruct or downgrade');
    assert.equal(await b.dbg('turnState('+q+').throws.used'),2);
    await a.dbg('reveal('+q+')');await a.waitFor('!window.__diceDebug.entryState('+q+').hidden');await a.settle();
    const revealed=(await ctx.api('/api/join',{name:'Witness3'})).data;
    await b.dbg('netEvent("hello",'+JSON.stringify(revealed)+')');await b.settle();
    assert.deepEqual((await b.entryState(id)).values,(await a.entryState(id)).values);
    assert.equal(await b.dbg('shroudedCount'),0,'legitimate snapshot reveal still restores artwork and values');
    await b.dbg('netEvent("hello",'+JSON.stringify(old)+')');
    assert.equal((await b.entryState(id)).hidden,false,'older redacted snapshot cannot undo an authorized reveal');
    for(const t of [a,b])assert.deepEqual(t.page.consoleErrors,[]);
  }},
  {name:'film-turn-active-worker',tags:['film-turns','film-worker','perf'],async fn(ctx) {
    const t=await ctx.newTable({origin:'localhost',name:'Alice'});await t.dbg('holdClock(true)');
    const pending=await t.eval(`(async()=>{const d=window.__diceDebug;d.commandRoll('40d20 t3');
      const until=performance.now()+5000;while(!d.currentRoll?.baking&&performance.now()<until)await new Promise(r=>setTimeout(r,1));
      if(!d.currentRoll?.baking)throw Error('No active worker turn');
      const id=d.currentRoll.rollId,keep=Array.from({length:38},(_,i)=>i),at=performance.now();
      const accepted=await d.throwAgain(id,keep);
      while(!d.queueLength&&performance.now()<until)await new Promise(r=>setTimeout(r,1));
      return {id,accepted,baking:d.filmWorker.baking,queue:d.queueLength,feedbackMs:performance.now()-at};})()`);
    assert.ok(pending.accepted&&pending.baking&&pending.queue===1,'real rethrow request is processed while first 40d20 worker is still baking');
    await t.waitFor('!window.__diceDebug.filmWorker.baking');
    const second=await t.eval(`(()=>{const d=window.__diceDebug,kept=d.tableDice.slice(0,38),before=kept.map(x=>x.finalPos.toArray());
      d.skipPlain();return {baking:d.filmWorker.baking,same:kept.every((x,i)=>x.mesh.visible&&JSON.stringify(x.mesh.position.toArray())===JSON.stringify(before[i]))};})()`);
    assert.ok(second.baking&&second.same,'kept dice remain visible and stationary during rethrow worker preparation');
    await t.dbg('clearTable()');
    await t.eval('window.__diceDebug.useFilmWorker(true);window.__diceDebug.throwSeeded(["d6"],123)');
    await t.settle();
    assert.equal(await t.diceCount(),1,'late abandoned turn cannot restore forty dice');
    assert.equal(await t.dbg('currentRoll.seed'),123);
    assert.equal((await t.entryState(pending.id)).values.length,40,'cancel retains the authored turn record');
    assert.deepEqual(t.page.consoleErrors,[]);
  }},
  {name:'film-turn-snapshot-latest',tags:['film-turns','film-worker','resync','visibility'],async fn(ctx) {
    const a=await ctx.newTable({origin:'localhost',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});
    await b.page.addInitScript('window.__streams=[];window.EventSource=class extends EventSource{constructor(...a){super(...a);window.__streams.push(this)}}');
    await b.reload();for(const t of [a,b])await t.dbg('holdClock(true)');
    for(const mode of ['revealed','banked']) {
      if(mode==='banked')await b.reload();await b.dbg('holdClock(true)');
      await a.roll(mode==='revealed'?'6d6 t3 held':'6d6 push>=1');
      const id=await a.rollId(),q=JSON.stringify(id);
      await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q);
      await b.eval('window.__streams.forEach(s=>s.close())');
      await a.dbg('throwAgain('+q+',[0,2,4])');
      await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===2');await a.settle();
      if(mode==='revealed') {
        await a.dbg('reveal('+q+')');await a.waitFor('!window.__diceDebug.entryState('+q+').hidden');await a.settle();
      } else {await a.dbg('bankTurn('+q+',[0,2,4])');await a.waitFor('window.__diceDebug.pushState('+q+').state.banked');}
      const snap=(await ctx.api('/api/join',{name:'Witness'})).data;
      await b.dbg('netEvent("hello",'+JSON.stringify(snap)+')');await b.settle();
      const actual=await b.dbg('turnState('+q+')'),expected=await a.dbg('turnState('+q+')');
      assert.equal(actual.throws.used,2,'snapshot '+mode+' cannot mark a missed film already reconstructed');
      assert.deepEqual(actual.values,expected.values);assert.deepEqual(actual.faces,expected.values);
      if(mode==='banked')assert.equal(await b.dbg('currentRoll.push.banked'),true);
    }
    for(const t of [a,b])assert.deepEqual(t.page.consoleErrors,[]);
  }},
];
