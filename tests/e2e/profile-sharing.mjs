/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';

export const profileSharingScenarios = [
  {name:'profile-sharing',tags:['smoke','profile-sharing','privacy','profiles'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.131',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.132',name:'Bob'});
    const raw=await ctx.rawPlayer('Observer');
    await a.dbg(`profiles.copyFrom({name:'Unshared archive',system:'none',pools:[{name:'Never publish',notation:'7d8'}]},false)`);
    await a.dbg(`profiles.copyFrom({name:'Public hero',system:'none',pools:[{name:'Attack',notation:'1d20'}]},false)`);
    const id=(await a.dbg('profiles.list')).find(p=>p.name==='Public hero').id;
    await a.dbg('publishPools()');
    await a.roll('1d6'); await b.settle();
    await raw.waitForEvent('roll'); // a later event proves the earlier stream has arrived
    assert.ok(!raw.raw.includes('Unshared archive') && !raw.raw.includes('Never publish'));
    assert.ok(!raw.raw.includes('Public hero'),'even an inactive local profile starts private');
    await a.dbg('openSettings("stuff")');
    await a.eval(`document.querySelector('.library-card[data-profile="${id}"]').click()`);
    await a.eval(`document.querySelector('[data-share-profile="${id}"]').click()`);
    await raw.waitForEvent('pools-changed',d=>d.library?.some(p=>p.name==='Public hero'));
    await b.dbg('openSettings("stuff")');
    await b.eval(`document.querySelector('[data-library-page="shared"]').click()`);
    await b.waitFor(`document.getElementById('table-profile-rows').textContent.includes('Public hero')`);
    const alice=await a.playerId();
    const shared=raw.events().filter(e=>e.type==='pools-changed'&&e.data.playerId===alice).at(-1).data;
    assert.deepEqual(shared.pools,[],'the active private rack is not a side effect of sharing another profile');
    assert.equal(shared.library.length,1);
    assert.ok(!JSON.stringify(shared).includes('Unshared archive'));
    await b.dbg(`profiles.copyFrom(${JSON.stringify(shared.library[0])},false)`);
    assert.deepEqual(await b.dbg('profiles.shared'),[],'adopting a shared character never republishes the copy');
    await a.dbg(`profiles.use('${id}')`);
    await a.dbg(`setGroups([{id:1,name:'Edited attack',notation:'2d20'}])`);
    await raw.waitForEvent('pools-changed',d=>d.pools?.[0]?.name==='Edited attack');
    await a.reload();
    assert.deepEqual(await a.dbg('profiles.shared'),[id],'consent survives a same-table reload');
    const late=await ctx.rawPlayer('Late');
    assert.ok(JSON.stringify(late.joinPayload).includes('Public hero'));
    assert.ok(!JSON.stringify(late.joinPayload).includes('Unshared archive'));
    // A failed withdrawal remains visible and retry removes both publication paths.
    await a.dbg('openSettings("stuff")');
    await a.page.browser.send('Network.enable',{},a.page.sessionId);
    await a.page.browser.send('Network.setBlockedURLs',{urls:['*/api/pools']},a.page.sessionId);
    await a.eval(`document.querySelector('[data-share-profile="${id}"]').click()`);
    await a.waitFor(`!document.getElementById('profile-share-retry').hidden`);
    assert.match(await a.eval(`document.getElementById('pools-shared-note').textContent`),/previous shared copy/);
    await a.page.browser.send('Network.setBlockedURLs',{urls:[]},a.page.sessionId);
    await a.eval(`document.getElementById('profile-share-retry').click()`);
    await b.waitFor(`!document.getElementById('table-profile-rows').textContent.includes('Public hero')`);
    assert.ok((await b.dbg('profiles.list')).some(p=>p.name==='Public hero'),'unsharing leaves the copy Bob explicitly kept');
    const last=await ctx.rawPlayer('After');
    const record=last.joinPayload.players.find(p=>p.id===alice);
    assert.deepEqual(record.pools,[]); assert.deepEqual(record.library||[],[]);
    assert.ok(!JSON.stringify(last.joinPayload).includes('Unshared archive'));
    await a.dbg(`profiles.share('${id}',true)`);
    assert.equal(await a.dbg('profiles.clearSharing()'),true,'a replacement/account boundary can clear old consent');
    assert.deepEqual(await a.dbg('profiles.shared'),[]);
  }},
];
