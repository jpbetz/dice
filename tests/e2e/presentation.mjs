/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
// Personal settings outlive a scenario's room. Restore them even on failure
// so unrelated Full-effects checks never inherit this test's Battery choice.
const clean = fn => async ctx => {
 const tables=[],scope=Object.create(ctx);
 scope.newTable=async opts=>{const t=await ctx.newTable(opts);tables.push(t);await t.dbg("setPresentation('full')");return t;};
 try { await fn(scope); }
 finally { for(const t of tables)await t.dbg("setPresentation('full')").catch(()=>{}); }
};
const film=t=>t.eval(`(()=>{const r=window.__diceDebug.currentRoll;return {keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,nudges:r.nudges,values:r.values,final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};})()`);
export const presentationScenarios=[
 {name:'battery-preference',tags:['presentation','settings'],fn:clean(async ctx=>{
   const a=await ctx.newTable({origin:'localhost',name:'Alice'}),b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});
   const settings=await a.dbg('settings');await a.dbg("openSettings('you')");
   await a.eval(`document.querySelector('[data-presentation="full"]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));`);
   assert.equal(await a.dbg('presentation.mode'),'battery');assert.equal(await b.dbg('presentation.mode'),'full');
   assert.equal(await a.eval("document.activeElement.dataset.presentation"),'battery');
   assert.deepEqual(await a.dbg('settings'),settings,'personal preference never updates the table');
   await a.reload();assert.equal(await a.dbg('presentation.mode'),'battery','device choice persists');
   assert.deepEqual(a.page.consoleErrors,[]);assert.deepEqual(b.page.consoleErrors,[]);
 })},
 {name:'battery-film-parity',tags:['presentation','film-worker','visibility'],fn:clean(async ctx=>{
   const a=await ctx.newTable({origin:'localhost',name:'Alice'}),b=await ctx.newTable({origin:'127.0.0.123',name:'Bob'});
   await b.dbg("setPresentation('battery')");
   for(const t of [a,b])await t.dbg('holdClock(true)');
   await a.dbg("setDiceSet('emberforge.blackanvil')");await a.roll('8d20 t3');await b.settle();
   assert.deepEqual(await film(b),await film(a),'Full and Battery retain the same first film');
   const id=await a.rollId(),q=JSON.stringify(id);
   await a.dbg('throwAgain('+q+',[0,2])');await a.waitFor('window.__diceDebug.turnState('+q+').throws.used===2');
   await a.settle();await b.settle();assert.deepEqual(await film(b),await film(a),'kept-die rethrow film stays identical');
   for(const t of [a,b]){const turn=await t.dbg('turnState('+q+')');assert.deepEqual(turn.faces,turn.values);}
   await a.roll('6d6 held');await b.settle();const held=await a.rollId(),h=JSON.stringify(held);
   for(const t of [a,b]){assert.ok((await t.entryState(held)).values.every(v=>v===null));assert.equal(await t.dbg('shroudedCount'),6);}
   await a.dbg('reveal('+h+')');await a.waitFor('!window.__diceDebug.entryState('+h+').hidden');
   await a.settle();await b.settle();assert.deepEqual((await a.entryState(held)).values,(await b.entryState(held)).values);
   assert.equal(await b.dbg('shroudedCount'),0);for(const t of [a,b])assert.deepEqual(t.page.consoleErrors,[]);
 })},
 {name:'battery-effects',tags:['presentation','perf','themes'],fn:clean(async ctx=>{
   const a=await ctx.newTable({origin:'localhost',name:'Alice'});
   await a.dbg("setVenue('copper')");await a.waitFor("window.__diceDebug.tableDesign.activeId==='copper'");
   await a.dbg("setDiceSet('emberforge.blackanvil')");await a.roll('4d20');
   await a.waitFor('window.__diceDebug.renderAudit().passes>1',{desc:'Full renders its real post effects'});
   const before=await film(a);await a.dbg("setPresentation('battery')");
   await a.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
   const idle=await a.eval(`(async()=>{const d=window.__diceDebug,a=d.renderAudit().frame,t=d.presentation.shaderTime;await new Promise(r=>setTimeout(r,500));return {frames:d.renderAudit().frame-a,time:d.presentation.shaderTime-t,audit:d.renderAudit(),lights:d.fxInfo().lights};})()`);
   assert.equal(idle.frames,0);assert.equal(idle.time,0);assert.equal(idle.audit.passes,1);
   assert.ok(idle.lights.length>0&&idle.lights.every(l=>l.intensity===0),'real die-light contributions are suppressed');
   assert.equal(await a.dbg('tableDesign.activeId'),'copper','baked artwork stays present');
   assert.equal(await a.dbg('presentation.particles'),0);assert.deepEqual(await film(a),before);
   await a.dbg("setPresentation('full')");await a.waitFor('window.__diceDebug.renderAudit().passes>1');
   assert.deepEqual(await film(a),before,'restoring effects does not change the film');assert.deepEqual(a.page.consoleErrors,[]);
 })},
 {name:'battery-ambient-wake',tags:['presentation','table-designs'],fn:clean(async ctx=>{
   const a=await ctx.newTable({origin:'localhost',name:'Alice'});
   await a.dbg("setPresentation('battery')");await a.dbg("setVenue('moonrise')");
   await a.waitFor("window.__diceDebug.venue==='moonrise'&&window.__diceDebug.venueInfo().staged");
   await a.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
   const frame=await a.dbg('renderAudit().frame');await a.eval('new Promise(r=>setTimeout(r,500))');
   assert.equal(await a.dbg('renderAudit().frame'),frame,'experimental scenery also stays still');
   await a.dbg("setPresentation('full')");await a.eval('new Promise(r=>setTimeout(r,500))');
   assert.ok(await a.dbg('renderAudit().frame')>frame+5,'restoring Full resumes the existing scenery');
   await a.dbg("setPresentation('battery')");await a.dbg("setVenue('navigation')");
   await a.waitFor("window.__diceDebug.tableDesign.activeId==='navigation'");
   await a.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');assert.deepEqual(a.page.consoleErrors,[]);
 })},
];
