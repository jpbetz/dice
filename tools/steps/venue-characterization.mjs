/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {writeFileSync} from 'node:fs';
import {frameGates,rimPoints,boxOf,projectPoints,W2C_LAYOUT} from '../../tests/e2e/scenarios.mjs';
export default async function run(stage){
 const t=await stage.tab('127.0.0.177','Venue');await t.dbg('holdClock(true)');
 const rows=[];
 async function projectLayout(layout,hero,ring=true){
  const groups={supports:[{id:'moot',...layout.moot},{id:'pool',...layout.pool}],fungus:(layout.shrooms||[]).map((f,i)=>({id:'shroom'+i,...f})).concat(ring?[{id:'ring',...layout.moot}]:[]),scenery:(layout.scenery||[]).map((f,i)=>({id:'scenery'+i,...f}))};
  const result={hero};for(const [key,features]of Object.entries(groups)){const pts=features.flatMap(f=>rimPoints(f)),p=await projectPoints(t,pts);result[key]=features.map((f,i)=>({...f,box:boxOf(p.slice(i*24,(i+1)*24))}));}return result;
 }
 async function sample(venue,zoom,device,tower='wickroot'){
  const width=device==='phone'?390:1500,height=device==='phone'?844:950;
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},t.page.sessionId);await t.emulateCoarsePointer(device==='phone');await t.page.browser.send('Page.bringToFront',{},t.page.sessionId);
  await t.dbg('setZoom('+JSON.stringify(zoom)+')');await t.waitFor('window.__diceDebug.zoom==='+JSON.stringify(zoom));
  await t.dbg('setVenue('+JSON.stringify(venue)+')');await t.waitFor('window.__diceDebug.venueInfo().staged');
  await t.dbg('setTower('+JSON.stringify(tower)+')');await t.waitFor('window.__diceDebug.tower==='+JSON.stringify(tower));
  await t.dbg('faeConcept(false)');await t.dbg('faeConcept(true,{paletteId:'+JSON.stringify(venue)+'})');
  await t.dbg('sim(1500)');await t.dbg('tick(0,true,false)');
  const layout=await t.dbg('venueInfo().stage'),extents=await t.dbg('tableExtents()');let hero=null;
  if(tower!=='none'){const shell=await t.dbg("groundGaps('towerSkinWickrootLivingTrunk')"),spec=await t.dbg("towerPortalSpec('wickroot')"),m=shell.all[0],f={id:'hero',x:m.x,z:m.z,rx:m.w/2,rz:m.w/2};hero={...f,box:boxOf(await projectPoints(t,[...rimPoints(f,0),...rimPoints(f,spec.derived.rimY)]))};}
  const projected=await projectLayout(layout,hero),rejected=await projectLayout(W2C_LAYOUT,hero,false);
  const life=[];for(let i=0;i<7;i++){
   if(i)await t.dbg('sim(780)');
   const all=await t.dbg('lifeInfo('+JSON.stringify(Array.from({length:260},(_,i)=>i))+')');
   const inRect=p=>Math.abs(p[0])<extents.w/2&&Math.abs(p[2])<extents.d/2;
   const overlap={flies:all.sample.filter(inRect).length,wisps:all.wispSample.filter(inRect).length};
   life.push({...all,sample:[all.sample[0],all.sample[40],all.sample[90]],insideCurrentRectangle:overlap});
  }
  const name=[venue,zoom,device,tower].join('-');
  const row={name,venue,zoom,device,tower,extents,boundary:await t.eval('window.__diceDebug.tableBoundary?.()||{round:false}'),scale:await t.dbg("tuneGet('table.scale')"),layout,projected,gates:frameGates(projected),rejected:frameGates(rejected),life,render:await t.eval('window.__diceDebug.renderAudit?.()||null')};rows.push(row);
  if(zoom==='wide'||(venue==='moonrise'&&device==='desktop')){await t.dbg('tick(0,true,false)');await stage.shot(t,'venue-characterization-'+name+'.png');}
  console.log(name,JSON.stringify({extents,seated:life[0].seated,clamped:life.map(l=>l.clamped),insideCurrentRectangle:life.map(l=>l.insideCurrentRectangle),inBox:life.map(l=>l.inBox),box:life[0].box,gates:row.gates.filter(g=>!g.ok),rejected:row.rejected.filter(g=>!g.ok).map(g=>g.id)}));
 }
 for(const venue of['moonrise','foxfire'])for(const zoom of['wide','medium','close'])for(const device of['desktop','phone'])await sample(venue,zoom,device);
 await sample('moonrise','wide','desktop','none');await sample('moonrise','wide','phone','none');
 // Grounded compositions have no legacy living layer or glade composition.
 const grounded=[];if(await t.eval('!!window.__diceDebug.tableDesign'))for(const venue of['copper','navigation','stone']){await t.dbg('setVenue('+JSON.stringify(venue)+')');await t.waitFor('window.__diceDebug.tableDesign.activeId==='+JSON.stringify(venue));grounded.push({venue,tableDesign:await t.dbg('tableDesign'),scenery:await t.dbg('venueInfo().scenery'),life:await t.dbg('lifeInfo()')});}
 writeFileSync(stage.out('venue-characterization.json'),JSON.stringify({rows,grounded,diceEverMade:await t.dbg('diceEverMade()'),errors:t.page.errors},null,2));
 if(t.page.errors.length)throw Error(JSON.stringify(t.page.errors));
}
