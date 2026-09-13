/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
import {tapControl} from './roll-flows.mjs';

export function cameraFilmSample(paint=false) {return `(async()=>{const d=window.__diceDebug,r=d.currentRoll,scene=document.getElementById('scene-container');
  const entered=new Set(d.tableDice.filter(t=>t.rollId!==r.rollId).map(t=>t.rollId+'/'+t.dieIndex));
  const exits=new Set(),fogged=new Set(),covered=new Set();let frames=0,maxClip=0,maxFog=0;
  do {d.sim(1);${paint?'if(frames%6===0)await new Promise(resolve=>requestAnimationFrame(resolve));':''}
    const frame=d.phoneFrame(),v=frame.view,fog=d.fogDepths();
    for(const p of frame.dice){const key=p.rollId+'/'+p.index,clip=Math.max(v.left-p.left,v.top-p.top,p.right-v.left-v.width,p.bottom-v.top-v.height);
      if(clip<=0)entered.add(key);
      if(entered.has(key)){
        if(clip>0.05){exits.add(key);maxClip=Math.max(maxClip,clip);}
        if(p.farDepth>fog.near){fogged.add(key);maxFog=Math.max(maxFog,p.farDepth-fog.near);}
        if(clip<=0)for(const x of [p.left+1,(p.left+p.right)/2,p.right-1])for(const y of [p.top+1,(p.top+p.bottom)/2,p.bottom-1])
          if(!scene.contains(document.elementFromPoint(x,y)))covered.add(key);
      }
    }
    frames++;
  }while((!r.done||d.framingInfo().easing)&&frames<1800);
  return {frames,done:r.done,entered:entered.size,exits:exits.size,maxClip,fogged:fogged.size,maxFog,covered:covered.size,
    final:d.phoneFrame(),entry:d.cameraEntryInfo(),framing:d.framingInfo()};})()`;}

export async function pointerRoll(a,notation,phone) {
  await tapControl(a,phone?'#phone-build-roll':'#workspace-nav [data-workspace="dice"]');
  if(await a.eval(`document.querySelector('#section-bar [data-sec="notation"]').getAttribute('aria-pressed')==='false'`))await tapControl(a,'#section-bar [data-sec="notation"]');
  await tapControl(a,'#cmd-input');
  for(const type of ['keyDown','keyUp'])await a.page.browser.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2},a.page.sessionId);
  await a.page.browser.send('Input.insertText',{text:notation},a.page.sessionId);
  await a.waitFor('!document.getElementById("tray-roll").disabled');
  const before=await a.rollId();await tapControl(a,'#tray-roll');
  await a.waitFor(`!!window.__diceDebug.currentRoll&&window.__diceDebug.currentRoll.rollId!==${JSON.stringify(before)}&&!window.__diceDebug.filmWorker.baking`);
  await a.waitFor('window.__diceDebug.workspaces.current===null');
  assert.equal(await a.dbg('tableResults.detailId'),null,'accepted Roll returns to the shared table');
  await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
}
function assertCamera(sample,expected) {
  assert.equal(sample.done,true);assert.equal(sample.final.dice.length,expected);assert.equal(sample.entered,expected,'every die enters the picture');
  assert.equal(sample.exits,0,`entered painted dice stay in frame (worst ${sample.maxClip}px)`);
  assert.equal(sample.fogged,0,`every painted vertex stays ahead of fog (worst ${sample.maxFog})`);
  assert.equal(sample.covered,0,'the painted die bounds remain clear of result cards, navigation and the phone tray');
}
export const tableCameraScenarios=[
  {name:'framing-prefers-dice',tags:['table-camera','roll','fx','cuj8'],timeout:120000,async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.64',name:'Reader'});await a.dbg('holdClock(true)');
    for(const [width,height] of [[390,844],[834,1112],[1440,900]]){
      const phone=width<=640;await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:phone},a.page.sessionId);await a.emulateCoarsePointer(phone);
      await a.dbg("setZoom('medium')");await a.waitFor("window.__diceDebug.zoom==='medium'");
      const samples=[];
      for(const [notation,count] of [['1d20',1],['40d20',40]]){
        await a.dbg('clearTable()');await a.settle();await pointerRoll(a,notation,phone);
        const sample=await a.eval(cameraFilmSample());assertCamera(sample,count);samples.push(sample);
      }
      // Calibrated against the rejected stable-full-surface experiment: that
      // view gives both pools the same world-unit span and halves lone phone
      // dice. Preserve a clear read-size gain without a mode or crop mandate.
      assert.ok(samples[0].framing.spanPx>samples[1].framing.spanPx*1.1,
        `${width}px: an ordinary lone roll stays larger than a full-table stress roll`);
    }
  }},
  // The rectangle-era mode/16.53-depth/failed-mat constants were retired.
  // These same named scenarios now measure the visible dice and fog directly.
  {name:'framing-keeps-the-deciding-die',tags:['table-camera','roll','perf','touch','cuj8'],timeout:120000,async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.187',name:'Alice'});await a.dbg('holdClock(true)');
    for(const phone of [false,true]){
      await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:phone?390:1440,height:phone?844:900,deviceScaleFactor:1,mobile:phone},a.page.sessionId);await a.emulateCoarsePointer(phone);
      for(const [notation,count] of [['1d20',1],['6d6',6],['40d6',40]]){
        await a.dbg('clearTable()');await a.settle();await pointerRoll(a,notation,phone);
        assertCamera(await a.eval(cameraFilmSample()),count);
      }
    }
  }},
  {name:'no-die-sits-in-fog',tags:['table-camera','mat','chrome'],timeout:120000,async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.165',name:'Fog'});await a.dbg('devOpen()');await a.dbg('devFold(true)');await a.dbg('demoDeal(3)');await a.dbg('holdClock(true)');
    for(const phone of [false,true]){
      await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:phone?390:1600,height:phone?844:900,deviceScaleFactor:1,mobile:phone},a.page.sessionId);await a.emulateCoarsePointer(phone);
      const floors=[];
      for(const zoom of ['wide','medium','close']){
        await a.dbg('clearTable()');await a.settle();await a.dbg(`setZoom('${zoom}')`);await a.waitFor(`window.__diceDebug.zoom==='${zoom}'`);
        await a.dbg("devBench(90090,'40d20')");await a.settle();
        for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI,3*Math.PI/2]){
          await a.dbg(`simulateOrbit(${angle})`);await a.settle();
          const frame=await a.dbg('phoneFrame()'),fog=await a.dbg('fogDepths()'),breath=await a.dbg('breathProbe()');
          assert.equal(frame.dice.length,40);assert.ok(fog.near>=breath.matFogFloor-1e-9);
          assert.ok(frame.dice.every(d=>d.farDepth>d.nearDepth&&d.nearDepth>0),'measured painted vertices have nonzero view-depth extents');
          assert.ok(frame.dice.every(d=>d.farDepth<fog.near),'every painted vertex stays clear of fog from each chair and size');
          if(angle===0)floors.push(breath.matFogFloor);
        }
      }
      assert.equal(new Set(floors.map(n=>n.toFixed(3))).size,3,'fog follows all three sizes rather than a stale fixed depth');
    }
  }},
  {name:'the-flight-is-framed-like-the-landing',tags:['smoke','table-camera','mat','chrome','roll'],timeout:120000,async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.63',name:'Phone'});await a.dbg('holdClock(true)');
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);await a.emulateCoarsePointer(true);
    for(const [notation,count] of [['3d6',3],['40d20',40],['40d20',40]]){
      await a.dbg('clearTable()');await a.settle();await pointerRoll(a,notation,true);
      assertCamera(await a.eval(cameraFilmSample()),count);
    }
  }},
  // Twelve painted pointer rolls plus a retained-dice arrival; this outer
  // allowance covers software rendering alongside the full release suite.
  {name:'table-camera-pointer-rolls',tags:['table-camera','camera','roll-flows'],timeout:360000,async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.164',name:'Alice'});const others=[];await a.dbg('holdClock(true)');
    for(const players of [1,4]){
      if(players===4)for(const name of ['Bob','Cora','Sam'])others.push(await ctx.rawPlayer(name));
      await a.waitFor(`window.__diceDebug.places().stations.length===${players}`);
      for(const phone of [false,true]){
        await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:phone?390:1440,height:phone?844:900,deviceScaleFactor:1,mobile:phone},a.page.sessionId);await a.emulateCoarsePointer(phone);
        for(const [zoom,design,notation,count] of [['wide','copper','4d20',4],['medium','navigation','40d20',40],['close','stone','40d4',40]]){
          await a.dbg('clearTable()');await a.settle();await a.dbg(`setZoom('${zoom}')`);await a.waitFor(`window.__diceDebug.zoom==='${zoom}'`);
          await a.dbg(`setVenue('${design}')`);await a.waitFor(`window.__diceDebug.tableDesign.activeId==='${design}'`);
          await pointerRoll(a,notation,phone);assertCamera(await a.eval(cameraFilmSample(true)),count);
        }
      }
    }
    // Later rolls must keep other players' earlier dice in the same picture.
    await a.dbg('clearTable()');await a.settle();
    const older=others[0];await ctx.api('/api/roll',{playerId:older.playerId,notation:'4d20'});
    await a.waitFor(`window.__diceDebug.currentRoll?.playerName==='Bob'`);await a.settle();
    const retained=await a.rollId();await pointerRoll(a,'40d20',true);
    const sample=await a.eval(cameraFilmSample(true));assertCamera(sample,44);
    assert.equal(sample.final.dice.filter(d=>d.rollId===retained).length,4,'earlier dice remain on the table');
    assert.deepEqual(a.page.consoleErrors,[]);
  }},
];
