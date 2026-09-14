/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';

const film=t=>t.eval(`JSON.stringify((()=>{const r=window.__diceDebug.currentRoll;return {keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,lastLanding:r.lastLanding,nudges:r.nudges,simFrames:r.simFrames,frames:r.frames,duration:r.duration,values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};})())`);
export const rollPreparationScenarios = [
  {name:'roll-preparation-modes',tags:['roll-preparation','film-worker','visibility'],async fn(ctx) {
    const a=await ctx.newTable({origin:'localhost',name:'Prepared'});
    await a.dbg('holdClock(true)');await a.dbg('useFilmWorker(true)');
    await a.eval("window.__diceDebug.setInstantResults(true);window.__diceDebug.throwSeeded(['d6'],101)");
    await a.waitFor('!window.__diceDebug.filmWorker.baking');
    assert.equal(await a.dbg('filmWorker.last.execution'),'worker');
    assert.equal(await a.dbg('rollPreparation.kicks'),0,'Instant does not submit unused render programs');
    await a.dbg('setInstantResults(false)');await a.dbg('clearTable()');
    const b=await ctx.newTable({origin:'127.0.0.123',name:'Inline control'});
    await b.dbg('holdClock(true)');await b.dbg('useFilmWorker(true)');
    await b.eval("window.Worker=undefined;window.__diceDebug.throwSeeded(['d6'],102)");
    await b.waitFor('!window.__diceDebug.filmWorker.baking');
    assert.equal(await b.dbg('filmWorker.last.execution'),'inline-fallback');
    assert.equal(await b.dbg('rollPreparation.kicks'),0,'synchronous fallback has no overlapping worker');
    assert.equal(await a.eval('document.visibilityState'),'hidden');
    await a.dbg("throwSeeded(['d6'],103)");await a.waitFor('!window.__diceDebug.filmWorker.baking');
    assert.equal(await a.dbg('filmWorker.last.execution'),'worker');
    assert.equal(await a.dbg('rollPreparation.kicks'),0,'a genuinely background tab does no unused preparation');
    for(const t of [a,b])await t.dbg('clearTable()');
    await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
    assert.equal(await a.eval('document.visibilityState'),'visible');
    await a.dbg("setDiceSet('stormcall.boltglass')");
    await a.roll('4d20 t2');await b.settle();
    assert.equal(await a.dbg('rollPreparation.kicks'),1,'visible accepted cast uses the real compiler');
    const prepared=await a.dbg('rollPreparation.last');assert.ok(prepared.post&&!prepared.failed&&prepared.targetRestored);
    assert.equal(await film(a),await film(b),'prepared and original inline viewers keep the complete shared first film');
    const id=await a.rollId(),q=JSON.stringify(id);
    await a.dbg('throwAgain('+q+',[0,2])');await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===2');
    await a.settle();await b.settle();
    assert.equal(await film(a),await film(b),'kept dice and rethrow preserve the entire shared film');
    await a.roll('4d20 held');await b.settle();const held=await a.rollId(),h=JSON.stringify(held);
    for(const t of [a,b]){assert.equal(await t.dbg('currentRoll.values'),null);assert.equal(await t.dbg('shroudedCount'),4);}
    assert.equal(await film(a),await film(b),'preparation does not modify the shrouded film');
    assert.equal(await a.dbg('postInfo().bloomDice'),0,'held dice retain their actual unmarked, non-blooming materials');
    await a.dbg('reveal('+h+')');await a.waitFor('!window.__diceDebug.entryState('+h+').hidden');
    await a.settle();await b.settle();
    assert.deepEqual((await a.entryState(held)).values,(await b.entryState(held)).values);
    assert.equal(await a.dbg('shroudedCount'),0);
    for(const t of [a,b])assert.deepEqual(t.page.consoleErrors,[]);
  }},
  {name:'roll-preparation-recovery',tags:['smoke','roll-preparation','perf'],async fn(ctx) {
    const t=await ctx.newTable({origin:'localhost',name:'Compile recovery'});
    const rows=await t.eval(`(async()=>{
      const THREE=await import('three'),{PostStack}=await import('/js/post.js');
      const canvas=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas});
      renderer.setSize(32,32,false);
      const stack=new PostStack(renderer),target=new THREE.WebGLRenderTarget(32,32),rows=[];
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.1,10);camera.position.z=2;
      const geometry=new THREE.PlaneGeometry(1,1);
      try {
        for(const post of [false,true]) {
          const material=new THREE.MeshBasicMaterial({color:0xff0000,transparent:true,opacity:.75,side:THREE.DoubleSide});
          let calls=0,sideAtThrow=null;
          material.onBeforeCompile=()=>{calls++;sideAtThrow=material.side;throw Error('intentional compile failure');};
          const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);mesh.visible=false;
          renderer.setRenderTarget(target);let message=null;
          try {stack.compileRoll(scene,camera,[mesh],post,false);}catch(e){message=e.message;}
          const restored=renderer.getRenderTarget()===target&&renderer.getActiveCubeFace()===0&&renderer.getActiveMipmapLevel()===0;
          const retained=mesh.parent===scene&&!mesh.visible&&mesh.material===material&&mesh.geometry===geometry;
          const sideRestored=material.side===THREE.DoubleSide;
          material.onBeforeCompile=()=>{};material.needsUpdate=true;mesh.visible=true;
          const pixels=[];
          for(let i=0;i<2;i++){renderer.render(scene,camera);const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,16,16,1,1,pixel);pixels.push([...pixel]);}
          rows.push({post,message,calls,sideAtThrow,restored,retained,sideRestored,pixels,glError:renderer.getContext().getError()});
          scene.remove(mesh);material.dispose();
        }
      }finally{
        geometry.dispose();target.dispose();for(const rt of [stack.rtBase,stack.rtGlow,stack.rtA,stack.rtB])rt.dispose();
        for(const m of [stack.blackMat,stack.matThresh,stack.matBlur,stack.matComposite])m.dispose();
        stack.quad.geometry.dispose();renderer.dispose();renderer.forceContextLoss();
      }
      return rows;
    })()`);
    for(const row of rows){
      assert.equal(row.message,'intentional compile failure');assert.equal(row.calls,1);
      assert.equal(row.sideAtThrow,1,'the real vendor path changed DoubleSide to BackSide before throwing');
      assert.ok(row.restored&&row.retained&&row.sideRestored,'target and shared live objects survive partial preparation');
      assert.equal(row.glError,0);assert.deepEqual(row.pixels[0],row.pixels[1],'subsequent real draws remain stable');
      assert.ok(row.pixels[0][0]>100&&row.pixels[0][1]===0&&row.pixels[0][2]===0,'subsequent draw actually shades the red plane');
    }
    // Reach the app's real catch with a cold shared die material, then let
    // the same material render normally when the worker returns.
    await t.dbg("setDiceSet('std')");await t.dbg('useFilmWorker(true)');await t.dbg('holdClock(true)');
    const failure=await t.eval(`(async()=>{
      const d=window.__diceDebug,{getDie}=await import('/js/dice.js');
      const material=getDie('d12').materials[0],original=material.onBeforeCompile;
      window.__compileFailureCalls=0;
      material.onBeforeCompile=function(...args){window.__compileFailureCalls++;material.onBeforeCompile=original;throw Error('intentional app compile failure');};
      d.throwSeeded(['d12'],104);
      return d.rollPreparation;
    })()`);
    assert.equal(failure.enabled,false);assert.equal(failure.kicks,1);
    assert.ok(failure.last.failed&&failure.last.targetRestored);
    await t.waitFor('!window.__diceDebug.filmWorker.baking');await t.settle();
    assert.equal(await t.eval('window.__compileFailureCalls'),1,'a real shared material reached the compiler');
    assert.equal(await t.dbg('filmWorker.last.execution'),'worker');
    assert.equal(await t.dbg('currentRoll.done'),true,'renderer preparation failure never holds the authored film');
    await t.dbg("throwSeeded(['d8'],105)");await t.waitFor('!window.__diceDebug.filmWorker.baking');await t.settle();
    assert.equal(await t.dbg('rollPreparation.kicks'),1,'later rolls do not repeatedly enter a failed optional compiler');
    assert.equal(await t.dbg('currentRoll.seed'),105);
    assert.deepEqual(t.page.errors,[]);assert.deepEqual(t.page.consoleErrors,[]);
    return {rows,failure};
  }},
];
