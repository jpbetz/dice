/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
const film = `(() => { const r=window.__diceDebug.currentRoll; return {
  keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,
  lastLanding:r.lastLanding,nudges:r.nudges,simFrames:r.simFrames,frames:r.frames,
  values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))}; })()`;
export const filmWorkerScenarios = [
  {name:'film-worker-parity',tags:['film-worker','perf','dice'],async fn(ctx) {
    const t=await ctx.newTable({origin:'localhost',name:'Worker'});
    await t.dbg('filmAudit(true)');
    await t.dbg('holdClock(true)');
    for (const types of [['d4','d6','d8','d10','d10x','d12','d20'],Array(40).fill('d20')]) {
      for(const seed of [90090,32676,42]) {
        await t.dbg('clearTable()');await t.dbg('useFilmWorker(false)');
        await t.dbg(`throwSeeded(${JSON.stringify(types)},${seed})`);
        const original=await t.eval(film);
        // Compare against the LIVE world, before the worker path is involved.
        const snapshot=await t.eval(`(async()=>{ const d=window.__diceDebug;
          const w=await import('/js/film-wire.js');const b=w.unpackFilm(w.bakeCaptured(d.filmInput));
          return {keyframes:b.keyframes,sounds:b.sounds,rough:b.roughTrack,landings:b.landings,
            lastLanding:b.lastLanding,nudges:b.nudges,simFrames:b.simFrames}; })()`);
        for(const key of Object.keys(snapshot)) assert.deepEqual(snapshot[key],original[key],`${types.length}/${seed}: snapshot ${key}`);
        await t.settle();await t.dbg('clearTable()');await t.dbg('useFilmWorker(true)');
        await t.dbg(`throwSeeded(${JSON.stringify(types)},${seed})`);
        await t.waitFor('!window.__diceDebug.filmWorker.baking');
        const stats=await t.dbg('filmWorker');
        assert.equal(stats.last.execution,'worker','actual module worker finished');
        assert.deepEqual(await t.eval(film),original,'worker preserves every double, sound, surface byte, landing and authored face');
        await t.settle();
      }
    }
    // A second film collides with a kept first film, retaining ordered static bodies.
    await t.dbg('filmAudit(true)');await t.dbg('useFilmWorker(false)');
    await t.dbg(`throwSeeded(['d6','d20'],2026)`);
    const shelf=await t.eval(`(async()=>{const d=window.__diceDebug,w=await import('/js/film-wire.js');
      return JSON.stringify(w.unpackFilm(w.bakeCaptured(d.filmInput)).keyframes)===JSON.stringify(d.currentRoll.keyframes);})()`);
    assert.equal(shelf,true,'snapshot preserves collisions with existing settled dice');
    assert.deepEqual(t.page.consoleErrors,[]);
  }},
  {name:'film-worker-lifecycle',tags:['film-worker','perf','visibility'],async fn(ctx) {
    const t=await ctx.newTable({origin:'localhost',name:'Worker'});
    await t.dbg('useFilmWorker(true)');
    // Input handlers and timers run while real 40d20 solver work is pending.
    const pending=await t.eval(`(async()=>{const d=window.__diceDebug;
      d.throwSeeded(Array(40).fill('d20'),90090);
      const active=d.filmWorker.baking;
      const at=performance.now(); await new Promise(r=>setTimeout(r,0));
      const timerMs=performance.now()-at;
      const stillActive=d.filmWorker.baking;
      d.clearTable();
      d.throwSeeded(['d6'],1234);
      return {active,stillActive,timerMs,canceled:d.filmWorker.canceled}; })()`);
    assert.ok(pending.active && pending.stillActive,'event loop runs during real pending bake');
    assert.equal(pending.canceled,1,'clear terminates the active worker');
    await t.waitFor('!window.__diceDebug.filmWorker.baking');
    assert.equal(await t.dbg('currentRoll.seed'),1234,'abandoned result cannot replace new table');
    assert.equal(await t.diceCount(),1,'abandoned forty dice cannot reappear');
    await t.settle();
    // Overlapping throws reserve FIFO, including while no playback film exists yet.
    await t.eval(`window.__diceDebug.throwSeeded(Array(40).fill('d20'),90091);window.__diceDebug.throwSeeded(['d8'],5678)`);
    await t.settle();assert.equal(await t.dbg('currentRoll.seed'),5678,'queue drains after async bake');
    await t.eval(`window.__diceDebug.throwSeeded(Array(40).fill('d20'),999);window.__diceDebug.skipPlain()`);
    await t.waitFor('!window.__diceDebug.filmWorker.baking');
    assert.equal(await t.dbg('currentRoll.done'),true,'skip during bake is honored when the film arrives');
    const completed=await t.dbg('filmWorker.completed');
    await t.roll('4d6 t3');
    assert.equal(await t.dbg('filmWorker.completed'),completed,'first turn throw retains the shared inline path');
    assert.deepEqual(t.page.consoleErrors,[]);
    const fallback=await ctx.newTable({origin:'127.0.0.123',name:'Fallback'});
    await fallback.eval(`window.Worker=undefined;window.__diceDebug.clearTable();window.__diceDebug.useFilmWorker(true);window.__diceDebug.throwSeeded(['d20'],42)`);
    await fallback.waitFor('!window.__diceDebug.filmWorker.baking');
    assert.equal(await fallback.dbg('filmWorker.last.execution'),'inline-fallback','guest/static host without module workers still rolls');
    await fallback.settle();assert.equal(await fallback.diceCount(),1);
    assert.deepEqual(fallback.page.consoleErrors,[]);
  }},
  {name:'film-worker-reveal',tags:['film-worker','visibility'],async fn(ctx) {
    const t=await ctx.newTable({origin:'localhost',name:'Roller'});
    await t.dbg('holdClock(true)');await t.dbg('filmAudit(true)');
    const request=await t.eval(`(async()=>{const d=window.__diceDebug;d.commandRoll('40d20 held');
      const until=performance.now()+5000;
      while(!d.currentRoll?.baking&&performance.now()<until)await new Promise(r=>setTimeout(r,1));
      const r=d.currentRoll; if(!r?.baking)throw Error('Did not observe active shared worker bake');
      d.reveal(r.rollId);return {id:r.rollId,values:r.values,hidden:r.dice.every(x=>x.shrouded),
        noValuesInWorker:!('values' in d.filmInput)&&!('roll' in d.filmInput)};})()`);
    assert.equal(request.values,null,'server result remains absent from the roller');
    assert.ok(request.hidden && request.noValuesInWorker,'worker is given physics and canonical faces only');
    await t.waitFor(`window.__diceDebug.pendingReveals.includes(${JSON.stringify(request.id)})`);
    assert.equal(await t.dbg('currentRoll.values'),null,'reveal waits for shrouded playback');
    await t.settle();
    assert.equal(await t.dbg('shroudedCount'),0,'deferred reveal completes after film');
    const state=await t.entryState(request.id);assert.equal(state.hidden,false);assert.equal(state.values.length,40);
    const late=await ctx.newTable({origin:'127.0.0.123',name:'Late'});await late.settle();
    assert.deepEqual((await late.entryState(request.id)).values,state.values,'late join reconstructs identical authored results');
    assert.equal(await late.dbg('filmWorker.completed'),0,'late join deliberately uses shared inline reconstruction');
    assert.deepEqual(t.page.consoleErrors,[]);assert.deepEqual(late.page.consoleErrors,[]);
  }},
];
