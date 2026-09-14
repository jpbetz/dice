/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
import {click} from '../fixtures/visible-input.mjs';

const ready=`[...document.querySelectorAll('#die-buttons .die-art')].every(img=>img.dataset.artState==='ready'&&img.complete&&img.naturalWidth)`;
async function phone(ctx,origin) {
  const original=ctx.browser.newPage.bind(ctx.browser);
  ctx.browser.newPage=async()=>{
    const p=await original();
    await p.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true},p.sessionId);
    await p.browser.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},p.sessionId);
    return p;
  };
  try{return await ctx.newTable({origin,name:'Alice'});}finally{ctx.browser.newPage=original;}
}
const info=a=>a.dbg('dieArtInfo()');

export const diceArtScenarios=[
  {
    name:'dice-art-on-demand',tags:['smoke','dice-art-loading'],
    async fn(ctx){
      const a=await phone(ctx,'127.0.0.110');
      assert.equal((await info(a)).contexts,0,'phone startup creates no portrait renderer');
      assert.equal((await info(a)).assetRequests,0,'hidden phone builder fetches no portraits');
      for(let i=0;i<3;i++){
        await a.dbg(`setGroups([{name:'Check',notation:'2d6'}])`);
        await a.dbg(`editPool(window.__diceDebug.groups[0].id,{set:'emberforge.blackanvil'})`);
      }
      await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      assert.equal((await info(a)).assetRequests,0,'the hidden desktop pool strip does not fetch artwork');
      assert.equal((await info(a)).watched,await a.eval(`document.querySelectorAll('img[data-art-state="pending"]').length`),'removed hidden strips release observer references');
      await a.dbg('setGroups([])');

      // Hold images at the network boundary. The real buttons must work
      // while every preview is still waiting, including Roll closing the task.
      const browser=a.page.browser,session=a.page.sessionId;
      await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/models/dice-art/*',requestStage:'Request'}]},session);
      await click(a,'#phone-build-roll');
      const rect=await a.eval(`document.querySelector('#die-buttons .die-btn').getBoundingClientRect().toJSON()`);
      await click(a,'#die-buttons .die-btn:nth-child(2)');
      await click(a,'#tray-roll');
      await a.waitFor('window.__diceDebug.workspaces.current===null&&window.__diceDebug.currentRoll?.done');
      assert.equal((await info(a)).contexts,0,'rolling while images wait does not invoke the portrait renderer');
      await browser.send('Fetch.disable',{},session);
      await click(a,'#phone-build-roll');await a.waitFor(ready);
      const after=await info(a);
      assert.equal(after.contexts,0,'built-in controls load images without any offscreen GL context');
      assert.equal(after.assets,7,'d100 reuses d10x; only seven built-in images are needed');
      const loadedRect=await a.eval(`document.querySelector('#die-buttons .die-btn').getBoundingClientRect().toJSON()`);
      assert.equal(loadedRect.width,rect.width);assert.equal(loadedRect.height,rect.height,'art arrival never moves the button layout');
      await click(a,'#workspace-back');await click(a,'#phone-build-roll');await a.waitFor(ready);
      assert.equal((await info(a)).assetRequests,after.assetRequests,'reopening reuses loaded portraits');

      // A delayed old-set response cannot repaint the newly chosen set.
      await browser.send('Fetch.enable',{patterns:[{urlPattern:'*/models/dice-art/classics.ivory.*',requestStage:'Request'}]},session);
      await a.dbg("setDiceSet('classics.ivory')");
      await a.waitFor(`document.querySelector('#die-buttons .die-art').dataset.artState==='loading'`);
      await a.dbg("setDiceSet('std')");
      await browser.send('Fetch.disable',{},session);await a.waitFor(ready);
      assert.ok(await a.eval(`[...document.querySelectorAll('#die-buttons .die-art')].every(img=>img.src.includes('/std.'))`),'late artwork preserves the current choice');
    },
  },
  {
    name:'dice-art-live-fallback',tags:['dice-art-loading'],
    async fn(ctx){
      const a=await phone(ctx,'127.0.0.111');
      const cdp=(method,params)=>a.page.browser.send(method,params,a.page.sessionId);
      await cdp('Network.enable',{});
      await cdp('Network.setBlockedURLs',{urls:['*/models/dice-art/std.d6.webp']});
      await click(a,'#phone-build-roll');await a.waitFor(ready);
      assert.deepEqual((await info(a)).keys,['std/d6'],'a missing d6 portrait renders only d6');
      assert.ok(await a.eval(`document.querySelector('.die-art[data-art-type="d6"]').src.startsWith('data:image/')`));
      await a.waitFor('!window.__diceDebug.dieArtInfo().rendererActive');
      await click(a,'#workspace-back');
      await a.dbg('devOpen()');
      assert.deepEqual((await a.dbg("tuneSet({'houses.classics.dice.ivory.body':'#d33b32'})")).refused,[]);
      await a.waitFor(`import('/js/themes.js').then(m=>m.SETS['classics.ivory'].body==='#d33b32')`);
      await a.dbg('devFold(true)');
      await a.dbg("setDiceSet('classics.ivory')");
      await click(a,'#phone-build-roll');await a.waitFor(ready);
      assert.ok(await a.eval(`[...document.querySelectorAll('#die-buttons .die-art')].every(img=>img.src.startsWith('data:image/'))`),'edited recipes use their actual rendered appearance');
      await click(a,'#workspace-back');
      await a.waitFor('!window.__diceDebug.dieArtInfo().rendererActive&&window.__diceDebug.dieArtInfo().queued===0');
    },
  },
];
