/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {readLayoutScenarios,historyViewport,openHistory,historyReadSample} from '../../tests/e2e/read-layouts.mjs';
import {click} from '../../tests/fixtures/visible-input.mjs';
export default async function(stage){
 await readLayoutScenarios[0].fn(stage.ctx);const a=stage.ctx.tables[0];
 for(const [w,h] of [[390,844],[1440,900],[844,390]]){
  await historyViewport(a,w,h);await openHistory(a);
  await stage.shot(a,stage.out(`history-read-${w}.png`));console.log(w,await a.eval(historyReadSample));
  await click(a,'#log-close');
 }
}
