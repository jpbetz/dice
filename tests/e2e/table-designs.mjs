/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';

export const tableDesignScenarios = [{
  name:'table-designs', tags:['table-designs','settings'],
  async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.111',name:'Alice',query:'&stability=stable'});
    const b=await ctx.newTable({origin:'127.0.0.112',name:'Bob',query:'&stability=stable'});
    const loaded=()=>a.eval(`performance.getEntriesByType('resource').some(r=>r.name.includes('copper-lantern-table.glb'))`);
    assert.equal(await loaded(),false,'ordinary play loads no optional table model');
    await a.dbg('openSettings("staging")');
    await a.eval(`document.querySelector('[data-venue="copper"]').click()`);
    assert.equal(await a.dbg('venueInfo().id'),'table','a local candidate does not change the room');
    assert.equal(await loaded(),false,'a text-only candidate has not loaded the live model');
    await a.eval(`document.getElementById('table-edit-apply').click()`);
    for(const t of [a,b]) await t.waitFor(`window.__diceDebug.tableDesign.status==='ready' && window.__diceDebug.tableDesign.activeId==='copper'`);
    await a.dbg('closeSettingsModal()');
    await a.roll('4d6'); await b.settle();
    assert.equal(await a.rollId(),await b.rollId(),'both players read the same roll on the new table');
    const c=await ctx.newTable({origin:'127.0.0.113',name:'Cora',query:'&stability=stable'});
    await c.waitFor(`window.__diceDebug.tableDesign.activeId==='copper'`);
    await a.dbg("setVenue('table')");
    for(const t of [a,b,c]) await t.waitFor(`window.__diceDebug.tableDesign.status==='idle' && !window.__diceDebug.tableDesign.visible`);
    await a.dbg("setVenue('copper')");
    await a.waitFor(`window.__diceDebug.tableDesign.status==='ready'`);
    assert.equal((await a.dbg('tableDesign')).cached,1,'switching reuses a bounded cached scene');
    // Solo restore reads personal staging through the stable channel too.
    // The old key-wide beta filter silently discarded grounded table designs.
    await a.eval(`localStorage.setItem('dice.roomsettings.v1',JSON.stringify({venue:'copper'}));localStorage.setItem('dice.stability.v1','stable')`);
    await a.page.navigate(`http://127.0.0.111:${ctx.port}/?lobby=1&stability=stable`);
    await a.waitFor(`window.__diceDebug?.identity.lobby && window.__diceDebug.tableDesign.activeId==='copper'`);
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
