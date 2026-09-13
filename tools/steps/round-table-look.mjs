/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { roundFootprints, roundFilmHash } from '../../tests/e2e/round-table.mjs';
export default async function run(stage) {
  const dir=stage.out('round-table-look');mkdirSync(dir,{recursive:true});
  const a=await stage.tab('localhost','Alice');
  for(const name of ['Bob','Cora','Sam'])await stage.ctx.rawPlayer(name);
  await a.waitFor('window.__diceDebug.places().stations.length===4');
  const rows=[];
  for(const [design,zoom,casts] of [['copper','medium',['4d20','40d20']],
    ['navigation','wide',['40d20']],['stone','close',['40d4']]]) {
    await a.dbg(`setZoom('${zoom}')`);await a.waitFor(`window.__diceDebug.zoom==='${zoom}'`);
    await a.dbg(`setVenue('${design}')`);await a.waitFor(`window.__diceDebug.tableDesign.activeId==='${design}'`);
    for(const notation of casts) {
      await a.roll(notation); // actual four-seat server-authored roll; record its seed
      const seed=await a.dbg('currentRoll.seed');
      await a.dbg('dismissBanner()');
      const footprints=await a.eval(roundFootprints),hash=await a.eval(roundFilmHash);
      const support=footprints.dice.flatMap(d=>d.support);
      const row={design,zoom,seed,notation,hash,boundary:footprints.boundary,dice:footprints.dice.length,
        samples:support.length,unsupported:support.filter(p=>p.y===null).length,
        raisedOverlap:support.filter(p=>p.y!==null&&p.y>.06).length,
        nominalOverflow:Math.max(...footprints.dice.flatMap(d=>d.points.map(([x,z])=>Math.hypot(x,z)-footprints.boundary.radius)))};
      rows.push(row);console.log(JSON.stringify(row));
      for(const [device,width,height] of [['desktop',1440,900],['phone',390,844]]) {
        await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},a.page.sessionId);
        await a.emulateCoarsePointer(device==='phone');
        await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await a.settle();
        console.log(await stage.shot(a,`${dir}/${design}-${zoom}-${notation}-${device}.png`));
      }
    }
  }
  writeFileSync(`${dir}/report.json`,JSON.stringify({rows},null,2));
}
