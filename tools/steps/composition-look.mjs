/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {compositionScenarios} from '../../tests/e2e/composition.mjs';
export default async function run(stage,args){
  const selected=compositionScenarios.find(s=>s.name===args[0]);if(!selected)throw Error('Name a composition scenario');
  const dir=stage.out(`composition-${selected.name}`);mkdirSync(dir,{recursive:true});const rows=[];
  stage.ctx.compositionShot=async(t,name,data)=>{await t.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    console.log(await stage.shot(t,`${dir}/${name}.png`));rows.push({name,...data});};
  await selected.fn(stage.ctx);writeFileSync(`${dir}/report.json`,JSON.stringify({scenario:selected.name,rows},null,2));
}
