/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';

export const rollHistoryScenarios = [{name:'unfinished-turn-history',tags:['roll-history','cuj8','cuj9'],async fn(ctx) {
  const a=await ctx.newTable({origin:'127.0.0.151',name:'Alice'});
  await a.page.browser.send('Network.enable',{},a.page.sessionId);
  await a.page.browser.send('Network.setBlockedURLs',{urls:['*/api/*']},a.page.sessionId);
  await a.page.navigate(a.url);
  await a.waitFor('window.__diceDebug && window.__diceDebug.netReady.then(r=>r && r.online===false)');
  await a.roll('3d6 t3'); const id=await a.rollId();
  await a.dbg('pickToggle(0)'); const picked=await a.dbg('picked.keys'), before=await a.dbg(`turnState(${JSON.stringify(id)})`);
  await a.eval(`(()=>{const d=window.__diceDebug;d.holdClock(true);for(let i=0;i<105;i++){d.commandRoll('1d6');d.sim(600);}})()`);
  assert.equal(await a.logCount(),101,'one unfinished turn lives outside the 100-entry history budget');
  assert.ok(await a.eval(`document.querySelector('[data-roll-id="${id}"]')!==null`),'the exact old history row survives pruning');
  assert.deepEqual(await a.dbg('picked.keys'),picked);
  assert.deepEqual((await a.dbg(`turnState(${JSON.stringify(id)})`)).values,before.values);
  await a.dbg(`throwAgain(${JSON.stringify(id)},[0])`); await a.settle();
  const after=await a.dbg(`turnState(${JSON.stringify(id)})`);
  assert.equal(after.throws.used,2); assert.equal(after.values[0],before.values[0]);
  const stored=await a.eval(`JSON.parse(localStorage.getItem('dice.log.v1'))`);
  assert.ok(stored.some(e=>e.rollId===id),'solo persistence keeps the unfinished record');
}}];
