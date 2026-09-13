/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';

export const tableDesignScenarios = [{
  name:'table-design-size',tags:['table-designs','settings'],
  async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.116',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.117',name:'Bob'});
    for(const zoom of ['wide','close','medium']) {
      await a.dbg(`setZoom('${zoom}')`);
      for(const t of [a,b]) await t.waitFor(`window.__diceDebug.breathProbe().zoom==='${zoom}'`);
      for(const id of ['copper','navigation','stone']) {
        await a.dbg(`setVenue('${id}')`);
        for(const t of [a,b]) {
          await t.waitFor(`window.__diceDebug.tableDesign.activeId==='${id}'`);
          const width=(await t.dbg('breathProbe()')).tableW;
          const samples=await t.dbg(`tableDesignSurface([[0,${width*.48}],[${width*.48},0],[0,${-width*.48}],[${-width*.48},0]])`);
          assert.equal(samples.length,4);
          assert.ok(samples.every(p=>p.y!==null&&Math.abs(p.y)<.3),`${id}/${zoom}: actual artwork supports the rolling area's cardinal edges`);
          assert.equal((await t.dbg('tableDesign')).scale,width/27.5,'cached model size follows the current shared rolling area');
        }
      }
    }
    await a.dbg("setZoom('wide')");await a.waitFor("window.__diceDebug.breathProbe().zoom==='wide'");
    const late=await ctx.newTable({origin:'127.0.0.118',name:'Cora'});
    await late.waitFor("window.__diceDebug.tableDesign.activeId==='stone'");
    const width=(await late.dbg('breathProbe()')).tableW;
    assert.equal((await late.dbg('tableDesign')).scale,width/27.5,'late model loads use the restored size');
    await a.roll('4d20');for(const t of [b,late])await t.settle();
    const values=await a.dbg('currentRoll.values');
    for(const t of [b,late])assert.deepEqual(await t.dbg('currentRoll.values'),values);
    assert.equal((await a.dbg('tableDesign')).cached,3,'resizing never fetches another model');
  },
},{
  name:'table-designs', tags:['table-designs','settings'],
  async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.111',name:'Alice',query:'&stability=stable'});
    const b=await ctx.newTable({origin:'127.0.0.112',name:'Bob',query:'&stability=stable'});
    const loaded=()=>a.eval(`performance.getEntriesByType('resource').some(r=>r.name.includes('copper-lantern-table.glb'))`);
    assert.equal(await loaded(),false,'ordinary play loads no optional table model');
    await a.dbg('openSettings("staging")');
    await a.eval(`document.querySelector('[data-venue="copper"]').click()`);
    assert.equal(await a.dbg('venueInfo().id'),'table','a local candidate does not change the room');
    await a.waitFor(`window.__diceDebug.tablePreview?.status==='ready'`);
    assert.equal((await a.dbg('tableDesign')).visible,false,'the candidate model belongs only to the preview');
    assert.equal((await b.dbg('tableDesign')).visible,false,'preview never changes another player’s surface');
    const previewFrames=(await a.dbg('tablePreview')).frames;
    await a.eval('new Promise(r=>setTimeout(r,150))');
    assert.equal((await a.dbg('tablePreview')).frames,previewFrames,'an unchanged preview draws no idle frames');
    await a.eval(`document.getElementById('table-edit-apply').click()`);
    for(const t of [a,b]) await t.waitFor(`window.__diceDebug.tableDesign.status==='ready' && window.__diceDebug.tableDesign.activeId==='copper'`);
    await a.dbg('closeSettingsModal()');
    assert.equal((await a.dbg('tablePreview')).visible,false,'the preview sleeps when setup closes');
    await a.roll('4d6'); await b.settle();
    assert.equal(await a.rollId(),await b.rollId(),'both players read the same roll on the new table');
    const c=await ctx.newTable({origin:'127.0.0.113',name:'Cora',query:'&stability=stable'});
    await c.waitFor(`window.__diceDebug.tableDesign.activeId==='copper'`);
    await a.dbg("setVenue('table')");
    for(const t of [a,b,c]) await t.waitFor(`window.__diceDebug.tableDesign.status==='idle' && !window.__diceDebug.tableDesign.visible`);
    await a.dbg("setVenue('copper')");
    await a.waitFor(`window.__diceDebug.tableDesign.status==='ready'`);
    assert.equal((await a.dbg('tableDesign')).cached,1,'switching reuses a bounded cached scene');
    for(const id of ['navigation','stone']) {
      await a.dbg('openSettings("staging")');
      await a.eval(`document.querySelector('[data-venue="${id}"]').click()`);
      await a.waitFor(`window.__diceDebug.tablePreview?.status==='ready' && window.__diceDebug.tablePreview?.activeId==='${id}'`);
      assert.notEqual((await b.dbg('tableDesign')).activeId,id,'trying another design remains private');
      await a.eval(`document.getElementById('table-edit-apply').click()`);
      for(const t of [a,b,c]) await t.waitFor(`window.__diceDebug.tableDesign.activeId==='${id}'`);
      await a.dbg('closeSettingsModal()');
    }
    assert.equal((await a.dbg('tableDesign')).cached,3,'all three designs fit the bounded catalogue cache');
    await a.dbg("setVenue('navigation')");
    await a.waitFor(`window.__diceDebug.tableDesign.activeId==='navigation'`);
    assert.equal((await a.dbg('tableDesign')).cached,3,'revisiting another model reuses its scene');
    // Solo restore reads personal staging through the stable channel too.
    // The old key-wide beta filter silently discarded grounded table designs.
    await a.eval(`localStorage.setItem('dice.roomsettings.v1',JSON.stringify({venue:'stone'}));localStorage.setItem('dice.stability.v1','stable')`);
    await a.page.navigate(`http://127.0.0.111:${ctx.port}/?lobby=1&stability=stable`);
    await a.waitFor(`window.__diceDebug?.identity.lobby && window.__diceDebug.tableDesign.activeId==='stone'`);
  },
},{
  name:'table-design-failure',tags:['table-designs','settings'],
  async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.114',name:'Alice',query:'&stability=stable'});
    await a.page.browser.send('Network.enable',{},a.page.sessionId);
    await a.page.browser.send('Network.setBlockedURLs',{urls:['*copper-lantern-table.glb*']},a.page.sessionId);
    await a.dbg("setVenue('copper')");
    await a.waitFor(`window.__diceDebug.tableDesign.status==='failed'`);
    assert.equal((await a.dbg('tableDesign')).visible,false,'failure restores the original surface');
    await a.roll('2d6');
    await a.dbg('openSettings("staging")');
    assert.notEqual(await a.eval(`document.getElementById('table-art-retry').offsetParent`),null,'a failed model has a reachable retry');
    await a.page.browser.send('Network.setBlockedURLs',{urls:[]},a.page.sessionId);
    await a.eval(`document.getElementById('table-art-retry').click()`);
    await a.waitFor(`window.__diceDebug.tableDesign.status==='ready'`);
    await a.dbg('closeSettingsModal()');
    await a.roll('1d6');
  },
},{
  name:'table-design-cancel-load',tags:['table-designs','settings'],
  async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.115',name:'Alice',query:'&stability=stable'});
    let requestId;
    await a.page.browser.send('Fetch.enable',{patterns:[{urlPattern:'*copper-lantern-table.glb*'}]},a.page.sessionId);
    const off=a.page.browser.on('Fetch.requestPaused',p=>{requestId=p.requestId;},a.page.sessionId);
    try {
      await a.dbg("setVenue('copper')");
      const deadline=Date.now()+10000;
      while(!requestId&&Date.now()<deadline) await new Promise(r=>setTimeout(r,20));
      assert.ok(requestId,'the actual artwork request is held in flight');
      await a.dbg("setVenue('table')");
      await a.waitFor(`window.__diceDebug.tableDesign.status==='idle'`);
      await a.page.browser.send('Fetch.continueRequest',{requestId},a.page.sessionId);
      await a.waitFor(`performance.getEntriesByType('resource').some(r=>r.name.includes('copper-lantern-table.glb'))`);
      assert.equal((await a.dbg('tableDesign')).activeId,null,'late artwork cannot replace the current table');
    } finally {off?.();await a.page.browser.send('Fetch.disable',{},a.page.sessionId);}
  },
}];
