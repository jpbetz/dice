/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {click,hover,type} from '../../tests/fixtures/visible-input.mjs';

export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'127.0.0.53',name:'Ada'});
  const b=await stage.ctx.rawPlayer('Bram');
  await a.roll('2d6 # Kept roll');const id=await a.rollId();
  await a.dbg(`collectRoll(${JSON.stringify(id)})`);await a.settle();
  await click(a,'#rail-log');
  const row=`#log-list .log-entry[data-roll-id="${id}"]`;
  await hover(a,row);await a.waitFor(`window.__diceDebug.peekState?.rollId===${JSON.stringify(id)}`);
  await click(a,'#peek-card .pk-main',{button:'right'});
  await click(a,'#pop-seg-exp [data-v="check"]');
  await type(a,'#pop-comment','Kept while Bram rolls');
  const draft=await a.dbg('popover.canonical');
  const remote=async label=>{
    const r=await stage.ctx.api('/api/roll',{playerId:b.playerId,notation:`1d4 # ${label}`});
    await a.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(r.data.roll.rollId)}`);await a.settle();
  };
  await remote('Interrupting');
  assert.equal(await a.dbg('popover.canonical'),draft);
  console.log(await stage.shot(a,'peek-retirement-pinned.png'));
  await click(a,'#pop-done');await remote('After editing');
  assert.equal(await a.dbg('peekState'),null);
  console.log(await stage.shot(a,'peek-retirement-after-done.png'));
  await hover(a,row);await a.waitFor(`window.__diceDebug.peekState?.rollId===${JSON.stringify(id)}`);
  await click(a,'#peek-card .card-act');
  await a.waitFor(`!window.__diceDebug.onTable.some(r=>r.rollId===${JSON.stringify(id)})`);
  console.log(await stage.shot(a,'peek-retirement-cleared.png'));
  assert.deepEqual(a.page.errors,[]);
}
