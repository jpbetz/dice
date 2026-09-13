/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
const quiet=async t=>t.waitFor('!window.__diceDebug.renderAudit().scheduled.pending',{desc:'no table frame scheduled'});
const sample=async(t,ms=400)=>t.eval(`(async()=>{const d=window.__diceDebug,b=d.renderAudit().frame;await new Promise(r=>setTimeout(r,${ms}));return d.renderAudit().frame-b;})()`);
export const idleRenderScenarios=[
 {name:'render-idle-wake',tags:['idle-render','perf'],async fn(ctx){
   const a=await ctx.newTable({origin:'localhost',name:'Alice'});await quiet(a);
   assert.equal(await sample(a),0,'empty table issues no idle GPU frames');
   await a.roll('4d6 t3');await quiet(a);assert.equal(await sample(a),0,'settled ordinary dice issue no idle GPU frames');
   const q=JSON.stringify(await a.rollId()),before=await a.dbg('renderAudit().frame');
   await a.dbg('pickToggle(0)');await a.dbg('sim(1)');await quiet(a);
   assert.ok(await a.dbg('renderAudit().frame')>before,'kept-die marker receives a rendered frame');
   const rect=await a.eval('document.querySelector("#scene-container canvas").getBoundingClientRect().toJSON()');
   const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
   const frame=await a.dbg('renderAudit().frame');
   for(const event of [{type:'mousePressed',x,y,button:'left',clickCount:1},{type:'mouseMoved',x:x+70,y:y+25,button:'left',buttons:1},{type:'mouseReleased',x:x+70,y:y+25,button:'left',clickCount:1}])
     await a.page.browser.send('Input.dispatchMouseEvent',event,a.page.sessionId);
   await quiet(a);assert.ok(await a.dbg('renderAudit().frame')>frame,'camera drag and spring return render after idle');
   await a.dbg('throwAgain('+q+',[0])');
   await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===2');
   await a.waitFor('window.__diceDebug.currentRoll.done',{desc:'real rAF playback completes without sim()'});
   await quiet(a);assert.equal(await sample(a),0,'rethrow returns to zero idle frames');
   const turn=await a.dbg('turnState('+q+')');assert.deepEqual(turn.faces,turn.values);
   assert.deepEqual(a.page.consoleErrors,[]);
 }},
 {name:'render-hidden-worker',tags:['idle-render','film-worker','visibility'],async fn(ctx){
   const a=await ctx.newTable({origin:'localhost',name:'Alice'});
   const b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});await quiet(b);
   await b.eval("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));");
   const frame=await b.dbg('renderAudit().frame');
   await a.roll('40d20 held');const id=await a.rollId(),q=JSON.stringify(id);
   await b.waitFor('window.__diceDebug.currentRoll?.rollId==='+q+'&&!window.__diceDebug.filmWorker.baking');
   await a.dbg('reveal('+q+')');await a.waitFor('!window.__diceDebug.entryState('+q+').hidden');await a.settle();
   await b.waitFor('window.__diceDebug.pendingReveals.includes('+q+')');
   assert.equal(await b.dbg('renderAudit().frame'),frame,'hidden worker and reveal events never draw');
   assert.equal(await sample(b),0);
   await b.eval("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));");
   await quiet(b);assert.ok(await b.dbg('renderAudit().frame')>frame,'return paints completed hidden work');
   assert.deepEqual((await b.entryState(id)).values,(await a.entryState(id)).values);
   assert.equal(await b.dbg('shroudedCount'),0);assert.equal(await b.dbg('queueLength'),0);
   for(const t of [a,b])assert.deepEqual(t.page.consoleErrors,[]);
 }},
 {name:'render-model-load-wake',tags:['idle-render','table-designs'],async fn(ctx){
   const a=await ctx.newTable({origin:'localhost',name:'Alice'});await quiet(a);
   const designs=await a.eval("import('/js/table-designs.js').then(m=>Object.keys(m.TABLE_DESIGNS))");
   for(const id of designs){
     let requestId;
     await a.page.browser.send('Fetch.enable',{patterns:[{urlPattern:'*/models/tables/*.glb*'}]},a.page.sessionId);
     const off=a.page.browser.on('Fetch.requestPaused',p=>{requestId=p.requestId;},a.page.sessionId);
     try{
       await a.dbg('setVenue('+JSON.stringify(id)+')');
       for(let i=0;i<100&&!requestId;i++)await new Promise(r=>setTimeout(r,20));
       assert.ok(requestId,'actual model request intercepted');await quiet(a);
       assert.equal(await sample(a),0,'pending artwork does not keep rendering its unchanged fallback');
       const frame=await a.dbg('renderAudit().frame');
       await a.page.browser.send('Fetch.continueRequest',{requestId},a.page.sessionId);
       await a.waitFor('window.__diceDebug.tableDesign.activeId==='+JSON.stringify(id));
       await quiet(a);assert.ok(await a.dbg('renderAudit().frame')>frame,'loaded '+id+' artwork wakes its real scene');
       assert.equal(await sample(a),0,id+' scene returns to no idle draws');
     }finally{off?.();await a.page.browser.send('Fetch.disable',{},a.page.sessionId);}
   }
   assert.deepEqual(a.page.consoleErrors,[]);
 }},
 {name:'render-live-effects',tags:['idle-render','themes','audio'],async fn(ctx){
   const a=await ctx.newTable({origin:'localhost',name:'Alice'});
   await a.dbg("setDiceSet('tidewrack.seaglass')");await a.roll('1d20');
   assert.ok(await sample(a)>5,'a visibly animated rest cadence keeps rendering');
   await a.dbg('holdClock(true)');await quiet(a);assert.equal(await sample(a),0,'a frozen effect draws only on change');
   await a.dbg('holdClock(false)');assert.ok(await sample(a)>5,'releasing the hold wakes the cadence');
   await a.dbg('clearTable()');await a.settle();await quiet(a);
   await a.dbg('setAmbienceOn(true)');
   for(const type of ['keyDown','keyUp'])await a.page.browser.send('Input.dispatchKeyEvent',
     {type,key:'F8',code:'F8',windowsVirtualKeyCode:119,nativeVirtualKeyCode:119},a.page.sessionId);
   await a.waitFor("window.__diceDebug.audioGraphInfo().ctxState==='running'&&window.__diceDebug.audioGraphInfo().bedSources>0");
   await quiet(a);const ticks=await a.dbg('audioGraphInfo().bedTicks'),frame=await a.dbg('renderAudit().frame');
   assert.equal(await sample(a,1800),0,'audible room lookahead does not require GPU frames');
   // Crackle intervals are deliberately random; allow a sparse interval without
   // mistaking it for a broken scheduler, and verify no picture woke meanwhile.
   await a.waitFor('window.__diceDebug.audioGraphInfo().bedTicks>'+ticks,{desc:'room crackles continue at idle'});
   assert.equal(await a.dbg('renderAudit().frame'),frame,'audio lookahead stays independent of rendering');
   assert.deepEqual(a.page.consoleErrors,[]);
 }},
];
