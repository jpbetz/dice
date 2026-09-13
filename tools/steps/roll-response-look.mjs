/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdirSync} from 'node:fs';
import {rollFlowScenarios,tapControl} from '../../tests/e2e/roll-flows.mjs';

export default async function run(stage) {
  await rollFlowScenarios.find(s=>s.name==='roll-flow-delayed-response-keeps-reopened-task').fn(stage.ctx);
  const a=stage.ctx.tables.at(-1),dir=stage.out('roll-response');mkdirSync(dir,{recursive:true});
  await a.eval('Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))');
  await stage.shot(a,dir+'/phone-reopened-result.png');
  await tapControl(a,'#player-result-close');
  await stage.shot(a,dir+'/phone-return.png');
}
