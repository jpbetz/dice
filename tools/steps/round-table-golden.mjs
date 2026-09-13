/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import { writeFileSync } from 'node:fs';
export default async function run(stage) {
  const a=await stage.tab('localhost','Golden');
  await a.dbg("setDiceSet('std')");await a.dbg('holdClock(true)');
  for(const [types,seed,values] of [
    [['d6','d6','d6','d6','d6','d6','d20'],424242,[1,2,3,4,5,6,17]],
    [['d4','d8','d12'],2026,[3,7,11]], [['d20','d20'],808,[1,20]], [['d6','d6','d6'],64352,[2,4,6]],
  ]) {
    await a.dbg(`throwSeeded(${JSON.stringify(types)},${seed},${JSON.stringify(values)})`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)');
  }
  writeFileSync(stage.out('round-table-golden.json'),await a.eval('JSON.stringify(window.__diceDebug.feltPoses())'));
}
