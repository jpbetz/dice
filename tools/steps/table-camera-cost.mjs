/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// Sequential before/after probe of held-clock playback CPU only. The worker
// bake completes first, and sim() does not submit WebGL frames. This does not
// measure GPU rendering, network latency, or first-input response.
import {mkdirSync, writeFileSync} from 'node:fs';
export default async function run(stage,args) {
  const label=args[0]||'cost',dir=stage.out(`table-camera-cost-${label}`);mkdirSync(dir,{recursive:true});
  const a=await stage.tab('127.0.0.162','Cost');const rows=[];
  await a.dbg('devOpen()');await a.dbg('devFold(true)');await a.dbg('holdClock(true)');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
  await a.emulateCoarsePointer(true);await a.dbg("setZoom('close')");await a.waitFor("window.__diceDebug.zoom==='close'");
  for(let trial=0;trial<4;trial++)for(const [notation,seed] of [['4d20',4],['40d20',32676],['40d4',32676]]){
    await a.dbg('clearTable()');await a.settle();await a.dbg(`devBench(${seed},'${notation}')`);
    await a.waitFor('!!window.__diceDebug.currentRoll&&!window.__diceDebug.filmWorker.baking');
    const measured=await a.eval(`(()=>{const d=window.__diceDebug;let frames=0;const start=performance.now();
      do{d.sim(1);frames++;}while((!d.currentRoll.done||d.framingInfo().easing)&&frames<1800);
      return {frames,ms:performance.now()-start};})()`);
    rows.push({trial,notation,seed,...measured});
  }
  writeFileSync(`${dir}/report.json`,JSON.stringify({label,rows},null,2));console.log(JSON.stringify(rows));
}
