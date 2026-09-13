/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { roundFilmHash } from '../../tests/e2e/round-table.mjs';
export default async function run(stage,args) {
  const label=args[0]||'probe',dir=stage.out(`table-camera-${label}`);mkdirSync(dir,{recursive:true});
  const rows=[];
  const a=await stage.tab('127.0.0.161','Alice');
  await a.dbg('devOpen()');await a.dbg('devFold(true)');await a.dbg('holdClock(true)');
  for(const players of [1,4]) {
    if(players===4)await a.dbg('demoDeal(3)');
    await a.waitFor(`window.__diceDebug.places().stations.length===${players}`);
    await a.dbg('devOpen()');await a.dbg('devFold(true)');await a.dbg('holdClock(true)');
    await a.dbg("setVenue('copper')");await a.waitFor("window.__diceDebug.tableDesign.activeId==='copper'");
    for(const [device,width,height] of [['desktop',1440,900],['phone',390,844]]) {
      await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},a.page.sessionId);
      await a.emulateCoarsePointer(device==='phone');
      for(const zoom of ['wide','medium','close']) {
        await a.dbg(`setZoom('${zoom}')`);await a.waitFor(`window.__diceDebug.zoom==='${zoom}'`);
        for(const [notation,seed] of [['4d20',4],['40d20',90090],['40d20',32676],['40d4',90090],['40d4',32676]]) {
          if(args.includes('--quick')&&(zoom!=='close'||seed!==32676))continue;
          await a.dbg('clearTable()');await a.settle();if(!await a.dbg(`devBench(${seed},'${notation}')`))throw Error('Bench refused');
          await a.waitFor('!!window.__diceDebug.currentRoll&&!window.__diceDebug.filmWorker.baking');
          const measure=await a.eval(`(()=>{const d=window.__diceDebug,r=d.currentRoll,entered=new Set(),reexit=new Set(),landedClip=new Set();
            let frames=0,maxExit=0,maxLanded=0,worst=null,maxFrameRetreat=1,maxFrameTravel=0,worstCamera=null;
            let prior=d.framingInfo();
            const distance=f=>Math.hypot(f.eye[0]-f.target[0],f.eye[1],f.eye[2]-f.target[1]);const extremes={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
            do {d.sim(1);const camera=d.framingInfo(),ratio=distance(camera)/distance(prior),travel=Math.hypot(...camera.eye.map((v,i)=>v-prior.eye[i]));
              if(ratio>maxFrameRetreat){maxFrameRetreat=ratio;worstCamera={frame:frames,prior,camera};}maxFrameTravel=Math.max(maxFrameTravel,travel);prior=camera;
              const f=d.phoneFrame(),v=f.view;
              for(const p of f.dice){const key=p.rollId+'/'+p.index,clip=Math.max(v.left-p.left,v.top-p.top,p.right-v.left-v.width,p.bottom-v.top-v.height);
                extremes.left=Math.min(extremes.left,p.left);extremes.top=Math.min(extremes.top,p.top);extremes.right=Math.max(extremes.right,p.right);extremes.bottom=Math.max(extremes.bottom,p.bottom);
                if(clip<=0)entered.add(key);else if(entered.has(key)){reexit.add(key);if(clip>maxExit){maxExit=clip;const die=d.tableDice.find(t=>t.rollId===p.rollId&&t.dieIndex===p.index);worst={frame:frames,index:p.index,position:die.mesh.position.toArray(),bounds:p};}}
                if(p.rollId===r.rollId&&frames>=r.landings[p.index].frame&&clip>0){landedClip.add(key);maxLanded=Math.max(maxLanded,clip);}
              }
              frames++;
            } while(!r.done&&frames<1800);
            d.sim(120);const final=d.phoneFrame(),v=final.view;
            return {maxFrameRetreat,maxFrameTravel,worstCamera,frames,entered:entered.size,reexit:reexit.size,maxExit,landedClip:landedClip.size,maxLanded,worst,extremes,
              final:final.dice.map(p=>({...p,clip:Math.max(v.left-p.left,v.top-p.top,p.right-v.left-v.width,p.bottom-v.top-v.height)})),view:v,entry:d.cameraEntryInfo?.(),framing:d.framingInfo()};})()`);
          const row={players,device,zoom,notation,seed,...measure,hash:await a.eval(roundFilmHash)};rows.push(row);writeFileSync(`${dir}/report.json`,JSON.stringify({label,rows},null,2));
          console.log(JSON.stringify({...row,final:row.final.filter(p=>p.clip>0),hash:undefined,extremes:undefined}));
        }
      }
    }
  }
  writeFileSync(`${dir}/report.json`,JSON.stringify({label,rows},null,2));
}
