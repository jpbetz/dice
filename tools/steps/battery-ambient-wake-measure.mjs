/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {writeFileSync} from 'node:fs';
// Reproduce the former fixed-window wake measurement; this is diagnosis,
// not an actual-input journey. The look driver exercises the visible controls.
export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice'});
  await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
  await a.dbg("setPresentation('battery')");await a.dbg("setVenue('moonrise')");
  await a.waitFor("window.__diceDebug.venue==='moonrise'&&window.__diceDebug.venueInfo().staged");
  await a.waitFor('window.__diceDebug.pendingTower===null&&window.__diceDebug.towerModelStatus().ready');
  const results=[];
  try {
    for(const rate of [1,4]) {
      await a.page.browser.send('Emulation.setCPUThrottlingRate',{rate},a.page.sessionId);
      await a.dbg("setPresentation('battery')");
      await a.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
      const data=await a.eval(`(async()=>{
        const d=window.__diceDebug,snapshot=()=>({frame:d.renderAudit().frame,scheduled:d.renderAudit().scheduled,mode:d.presentation.mode,visible:!document.hidden,t:d.lifeInfo().t,sample:d.lifeInfo().sample});
        const asleep=snapshot();await new Promise(r=>setTimeout(r,500));const battery=snapshot();
        d.setPresentation('full');const samples=[];
        for(let i=0;i<4;i++){const start=performance.now();await new Promise(r=>setTimeout(r,500));samples.push({elapsed:performance.now()-start,...snapshot()});}
        return {asleep,battery,samples};
      })()`);
      results.push({rate,...data});
      console.log(JSON.stringify({rate,idleFrames:data.battery.frame-data.asleep.frame,full500Frames:data.samples[0].frame-data.battery.frame,full2000Frames:data.samples[3].frame-data.battery.frame,sceneAdvance:data.samples[3].t-data.battery.t,visible:data.samples[3].visible,scheduled:data.samples[3].scheduled}));
    }
  } finally {
    await a.page.browser.send('Emulation.setCPUThrottlingRate',{rate:1},a.page.sessionId);
    await a.dbg("setPresentation('battery')");
  }
  writeFileSync(stage.out('battery-ambient-wake-measure.json'),JSON.stringify(results,null,2));
}
