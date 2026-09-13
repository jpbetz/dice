/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {writeFileSync} from 'node:fs';
import {assert} from '../../tests/e2e/harness.mjs';
export default async function run(stage,args) {
  const baseline=args.includes("baseline"),photos=args.includes("photos");
  const a=await stage.tab('localhost','Alice');
  await a.dbg('devOpen()');await a.dbg('devFold(true)');
  const rows=[];
  for(const zoom of ['wide','medium','close']) {
    await a.dbg(`setZoom('${zoom}')`);await a.waitFor(`window.__diceDebug.breathProbe().zoom==='${zoom}'`);
    for(const id of (baseline?['copper']:['copper','navigation','stone'])) {
      await a.dbg(`setVenue('${id}')`);await a.waitFor(`window.__diceDebug.tableDesign.activeId==='${id}'`);
      for(const [seed,notation] of (photos?[[4,'4d20']]:[[4,'4d20'],[90090,'40d20'],[32676,'40d20']])) {
        await a.dbg('clearTable()');await a.settle();await a.dbg(`devBench(${seed},'${notation}')`);await a.settle();
        const row=await a.eval(`(async()=>{const d=window.__diceDebug,r=d.currentRoll;
          const centres=r.dice.map(x=>[x.body.position.x,x.body.position.z]);
          const film={keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,lastLanding:r.lastLanding,nudges:r.nudges,simFrames:r.simFrames,values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};
          const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(film))))).map(v=>v.toString(16).padStart(2,'0')).join('');
          return {zoom:d.breathProbe().zoom,width:d.breathProbe().tableW,design:d.tableDesign,seed:r.seed,notation:${JSON.stringify(notation)},hash,
            surfaces:d.tableDesignSurface?.(centres)??[],radii:centres.map(([x,z])=>Math.hypot(x,z))};})()`);
        rows.push(row);console.log(zoom,id,seed,notation,'unsupported centres',baseline?'probe unavailable in baseline':row.surfaces.filter(p=>p.y===null).length);
        if(seed===4&&!baseline) for(const [device,width,height] of [['desktop',1440,900],['phone',390,844]]) {
          await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},a.page.sessionId);await a.emulateCoarsePointer(device==='phone');
          await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await a.settle();
          console.log(await stage.shot(a,`table-size-${zoom}-${id}-${device}.png`));
        }
      }
    }
  }
  writeFileSync(stage.out(photos?'table-size-photo-check.json':'table-size.json'),JSON.stringify(rows,null,2));
  assert.deepEqual(a.page.errors,[]);
}
