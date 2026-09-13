/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {mkdirSync,writeFileSync} from 'node:fs';
export default async function run(stage){
  const dir=stage.out('plane-inputs');mkdirSync(dir,{recursive:true});
  const a=await stage.tab('localhost','Plane probe');
  await a.dbg('filmAudit(true)');await a.dbg('devOpen()');await a.dbg('devFold(true)');
  const rows=[];
  for(const zoom of ['wide','medium','close']){
    await a.dbg('setZoom('+JSON.stringify(zoom)+')');await a.waitFor('window.__diceDebug.zoom==='+JSON.stringify(zoom));
    for(const [notation,seed] of [['4d6',42],['40d20',90090],['40d20',32676],['40d4',90090]]){
      await a.dbg('clearTable()');await a.settle();
      await a.dbg(`devBench(${seed},${JSON.stringify(notation)})`);await a.waitFor('!window.__diceDebug.filmWorker.baking');
      const input=await a.eval(`JSON.stringify(window.__diceDebug.filmInput,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?{nonfinite:String(v)}:v)`);
      if(!input||input==='null')throw Error('Missing real cast DTO');
      rows.push({zoom,notation,seed,input:JSON.parse(input)});await a.settle();
    }
  }
  writeFileSync(dir+'/inputs.json',JSON.stringify(rows));
  console.log('Captured '+rows.length+' actual round-table inputs at '+dir+'/inputs.json');
}
