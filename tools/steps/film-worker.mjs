/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// Run unchanged on the pre-worker checkout, then pass --compare=/.../report.json.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
export default async function run(stage,args) {
  const label=args[0]||'after',dir=stage.out(`film-worker-${label}`);mkdirSync(dir,{recursive:true});
  const t=await stage.tab('localhost','Film');
  await t.dbg("setSystem('none')");await t.waitFor("window.__diceDebug.system==='none'");
  await t.eval('window.__diceDebug.filmAudit?.(true)');await t.dbg('devOpen()');await t.dbg('devFold(true)');await t.dbg("setDiceSet('std')");
  const rows=[];
  for(const [device,width,height] of [['desktop',1440,900],['phone',390,844]]) {
    await t.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},t.page.sessionId);
    await t.emulateCoarsePointer(device==='phone');
    await t.dbg(`setPanelState({pools:${device==='desktop'}})`);
    for(const cpu of [1,4]) {
      await t.page.browser.send('Emulation.setCPUThrottlingRate',{rate:cpu},t.page.sessionId);
      for(const [notation,seed] of [['4d6',42],['40d20',90090],['40d20',32676]]) {
        await t.dbg('clearTable()');await t.settle();
        const result=await t.eval(`(async()=>{const d=window.__diceDebug,tasks=[],ticks=[];
          const observer=new PerformanceObserver(l=>tasks.push(...l.getEntries().map(e=>({at:e.startTime,duration:e.duration}))));
          observer.observe({type:'longtask'});
          const started=performance.now();let last=started,finished=false;
          const raf=()=>{if(finished)return;const now=performance.now();ticks.push(now-last);last=now;requestAnimationFrame(raf);};requestAnimationFrame(raf);
          // A queued real DOM click cannot run until the current handler yields.
          const button=document.createElement('button');button.textContent='Probe';button.style.cssText='position:fixed;left:0;top:0';
          document.body.append(button);let feedbackMs=null,feedbackWhileBaking=false;
          button.onclick=()=>{feedbackMs=performance.now()-started;feedbackWhileBaking=!!d.filmWorker?.baking;button.dataset.responded='true';};
          setTimeout(()=>button.click(),0);
          const at=performance.now(),accepted=d.devBench(${seed},${JSON.stringify(notation)}),returnMs=performance.now()-at;
          if(!accepted)throw Error('Seeded seated bench was refused');
          while(d.filmWorker?.baking)await new Promise(r=>setTimeout(r,1));
          const readyMs=performance.now()-started;
          await new Promise(r=>setTimeout(r,300));finished=true;observer.disconnect();button.remove();
          const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
          const r=d.currentRoll;
          const payload={keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,
            lastLanding:r.lastLanding,nudges:r.nudges,simFrames:r.simFrames,values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};
          const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).map(v=>v.toString(16).padStart(2,'0')).join('');
          return {returnMs,readyMs,feedbackMs,feedbackWhileBaking,tasks:tasks.filter(e=>e.at+e.duration>=started).map(e=>e.duration),ticks,
            render:d.renderAudit?.()||null,inputBodies:d.filmInput?.world?.state?.bodies.length??null,
            worker:d.filmWorker?.last||null,inputBytes:d.filmInput?new TextEncoder().encode(JSON.stringify(d.filmInput)).byteLength:null,poseBytes:r.dice.length*r.frames*7*8,hash,frames:r.frames,backend:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'};})()`);
        await t.settle();const framing=await t.dbg('framingInfo()');
        const row={device,width,height,cpu,notation,seed,...result,framing};rows.push(row);
        if(cpu===1&&seed!==32676)await stage.shot(t,`${dir}/${device}-${notation}.png`);
        console.log(`${device} CPU${cpu} ${notation}/${seed}: return ${result.returnMs.toFixed(1)}ms, feedback ${result.feedbackMs.toFixed(1)}ms (${result.feedbackWhileBaking?'during bake':'after bake'}), ready ${result.readyMs.toFixed(1)}ms, tasks ${result.tasks.map(n=>n.toFixed(0))}`);
      }
    }
  }
  await t.page.browser.send('Emulation.setCPUThrottlingRate',{rate:1},t.page.sessionId);
  const compare=args.find(x=>x.startsWith('--compare='));
  if(compare) {const before=JSON.parse(readFileSync(compare.slice(10),'utf8'));assert.equal(before.rows.length,rows.length);
    for(let i=0;i<rows.length;i++)assert.equal(rows[i].hash,before.rows[i].hash,`${rows[i].device} CPU${rows[i].cpu} ${rows[i].notation}/${rows[i].seed}: original film unchanged`);}
  assert.deepEqual(t.page.consoleErrors,[]);
  writeFileSync(`${dir}/report.json`,JSON.stringify({label,rows},null,2));
}
