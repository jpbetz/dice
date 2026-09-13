/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';

export const firstPlayScenarios = [
  {name:'first-play',tags:['smoke','first-play','settings','profiles','cuj1','cuj2'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.121',name:'Alice'});
    assert.equal(await a.dbg('settings.system'),'none','new rooms use Numbers only');
    assert.deepEqual(await a.dbg('groups'),[],'product shortcuts are not saved pools');
    assert.deepEqual(await a.eval(`[...document.querySelectorAll('#quick-dice [data-quick]')].map(b=>b.dataset.quick)`),['1d4','1d6','1d8','1d10','1d12','1d20','2d6','d100']);
    await a.eval(`document.querySelector('#quick-dice [data-quick="2d6"]').click()`);
    await a.settle();
    assert.equal(await a.eval('window.__diceDebug.currentRoll.dice.length'),2);
    assert.deepEqual(await a.dbg('groups'),[],'a quick roll does not silently save a pool');
    await a.roll('2d6+3');
    assert.equal(await a.dbg('settings.system'),'none');
    assert.equal(await a.eval(`document.getElementById('result-total').textContent`),String(await a.eval(`window.__diceDebug.currentRoll.total`)),'a familiar expression shows its numeric total');
    const kept=await a.eval(`JSON.parse(localStorage.getItem('dice.profiles.v1'))`);
    await a.dbg('openSettings("stuff")');
    await a.eval(`document.getElementById('starter-kits').open=true; document.querySelector('[data-kit="soul-deal"]').click()`);
    const preview=await a.eval(`[...document.querySelectorAll('.starter-pools li')].map(li=>({name:li.querySelector('span').textContent,notation:li.querySelector('code').textContent}))`);
    assert.equal(preview.length,18,'Soul Deal explicitly previews its priced rack');
    assert.deepEqual(await a.eval(`JSON.parse(localStorage.getItem('dice.profiles.v1'))`),kept,'preview writes no library data');
    await a.eval(`document.querySelector('.starter-add').click()`);
    assert.equal((await a.dbg('profiles.list')).length,2,'kit adds a profile');
    assert.deepEqual((await a.dbg('groups')).map(({name,notation})=>({name,notation})),preview,'added dice exactly match the preview');
    assert.equal(await a.dbg('settings.system'),'none','kit addition never changes shared interpretation');
    assert.equal((await a.dbg('profiles.mismatch')).profileSystem,'soul-deal','cross-system choice stays explicit');
    const before=await a.eval(`JSON.parse(localStorage.getItem('dice.profiles.v1'))`);
    assert.ok(kept.profiles.length>0);
    for(const record of kept.profiles) assert.deepEqual(before.profiles.find(p=>p.id===record.id),record,'previous profiles are preserved');
    await a.eval(`document.querySelector('.starter-add').click()`);
    assert.equal((await a.dbg('profiles.list')).length,2,'double clicking Add never duplicates a completed addition');
    await a.reload();
    assert.equal((await a.dbg('profiles.list')).length,2);
    assert.equal(await a.eval(`document.getElementById('quick-dice').hidden`),false,'quick workspace survives reload');
    // A new invitee obeys the occupied room, but receives no implicit kit.
    await a.dbg(`setSystem('soul-deal')`);
    await a.waitFor(`window.__diceDebug.settings.system==='soul-deal'`);
    const b=await ctx.newTable({origin:'127.0.0.122',name:'Bob'});
    assert.equal(await b.dbg('settings.system'),'soul-deal');
    assert.deepEqual(await b.dbg('groups'),[]);
    assert.match(await b.eval(`document.getElementById('first-roll-context').textContent`),/Soul Deal/);
  }},
  {name:'first-play-kept-library',tags:['first-play','profiles','cuj13'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.123',name:'Alice'});
    await a.dbg(`profiles.reset('soul-deal')`);
    const original=await a.dbg('groups');
    await a.reload();
    assert.deepEqual(await a.dbg('groups'),original,'existing Soul Deal rack survives exactly');
    // A historical seed-shaped rack is also owned data; no content heuristic.
    await a.dbg(`setGroups([{id:1,name:'Attack',notation:'1d20'},{id:2,name:'Damage',notation:'3d4'},{id:3,name:'Percentile',notation:'d100'}])`);
    const old=await a.dbg('groups');
    await a.eval(`localStorage.removeItem('dice.schema.v1');window.__diceDebug.purgeStale()`);
    await a.reload();
    assert.deepEqual(await a.dbg('groups'),old,'historical starter-shaped data is never replaced');
  }},
  {name:'quick-preserves-work',tags:['first-play','smoke','privacy','cuj9'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.125',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.126',name:'Bob'});
    await a.roll('3d6 t3 secret');
    const turn=await a.rollId();
    await a.dbg('pickToggle(0)');
    const picks=await a.dbg('picked.keys');
    assert.ok(picks.length,'the unfinished turn has an actual kept choice');
    const state=await a.dbg(`turnState(${JSON.stringify(turn)})`);
    assert.equal(await b.logCount(),0,'the private turn stays absent for Bob');
    await a.eval(`(()=>{const input=document.getElementById('cmd-input');input.value='2d8+4 w:Bob # Kept draft';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await a.waitFor(`window.__diceDebug.trayState.dice.length===2`);
    const draft=await a.dbg('trayState');
    await a.eval(`document.querySelector('#quick-dice [data-quick="1d6"]').click()`);
    await b.waitFor(`document.getElementById('log-list').childElementCount===1`);
    await a.settle(); await b.settle();
    assert.deepEqual(await a.dbg('trayState'),draft,'a quick throw preserves the staged draft');
    assert.equal(await a.eval(`document.getElementById('cmd-input').value`),'2d8+4 w:Bob # Kept draft','including its privacy and comment');
    const after=await a.dbg(`turnState(${JSON.stringify(turn)})`);
    assert.deepEqual(after.throws,state.throws,'the unfinished turn retains every remaining throw');
    assert.deepEqual(after.values,state.values,'the private turn values are untouched');
    assert.deepEqual(await a.dbg('picked.keys'),picks,'kept choices survive a separate quick throw');
    assert.equal(await b.logCount(),1,'the only publication is the new Quick roll');
    assert.equal(await b.eval('window.__diceDebug.currentRoll.dice.length'),1);
    await a.dbg(`throwAgain(${JSON.stringify(turn)},[0])`);
    await a.waitFor(`window.__diceDebug.turnState(${JSON.stringify(turn)}).throws.used===2`);
    await a.settle();
    assert.equal((await a.dbg(`turnState(${JSON.stringify(turn)})`)).values[0],state.values[0],'the old turn remains playable, keeping its chosen die');
    assert.equal(await b.logCount(),1,'continuing the private turn still exposes nothing');
    await a.roll('3d6 t3'); await b.settle();
    const shared=await a.rollId(), sharedBefore=await a.dbg(`turnState(${JSON.stringify(shared)})`);
    await a.eval(`document.querySelector('#quick-dice [data-quick="1d6"]').click()`);
    await b.waitFor(`document.getElementById('log-list').childElementCount===3`);
    await a.settle(); await b.settle();
    assert.deepEqual((await a.dbg(`turnState(${JSON.stringify(shared)})`)).throws,sharedBefore.throws);
    assert.deepEqual((await b.dbg(`turnState(${JSON.stringify(shared)})`)).throws,sharedBefore.throws,'other viewers keep the shared unfinished turn too');

  }},
  {name:'quick-preserves-solo-turn',tags:['first-play','cuj8'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.127',name:'Alice'});
    await a.page.browser.send('Network.enable',{},a.page.sessionId);
    await a.page.browser.send('Network.setBlockedURLs',{urls:['*/api/*']},a.page.sessionId);
    await a.page.navigate(a.url);
    await a.waitFor(`window.__diceDebug && window.__diceDebug.netReady.then(r=>r && r.online===false)`,{desc:'static-host fallback is ready'});
    assert.equal(await a.eval('window.__diceDebug.netReady.then(r=>r.online)'),false,'the static-host fallback is active');
    await a.roll('3d6 t3');
    const turn=await a.rollId(), before=await a.dbg(`turnState(${JSON.stringify(turn)})`);
    await a.eval(`document.querySelector('#quick-dice [data-quick="1d6"]').click()`); await a.settle();
    assert.deepEqual((await a.dbg(`turnState(${JSON.stringify(turn)})`)).throws,before.throws,'solo arrival leaves the unfinished turn standing');
    await a.dbg(`throwAgain(${JSON.stringify(turn)},[0])`); await a.settle();
    assert.equal((await a.dbg(`turnState(${JSON.stringify(turn)})`)).throws.used,2);
  }},
  {name:'first-play-phone',tags:['first-play','touch','cuj1'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.124',name:'Alice'});
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
    await a.emulateCoarsePointer(true);
    await a.eval(`localStorage.removeItem('dice.panels.v1')`); await a.reload();
    const controls=await a.eval(`[...document.querySelectorAll('#rail-dice [data-quick]')].map(b=>b.getBoundingClientRect().toJSON())`);
    assert.equal(controls.length,8);
    assert.ok(controls.every(b=>b.left>=0 && b.right<=390 && b.bottom<=844 && b.height>=40),'all quick rolls fit the fresh phone');
    await a.eval(`document.querySelector('#rail-dice [data-quick="1d20"]').click()`); await a.settle();
    assert.deepEqual(await a.dbg('groups'),[]);
  }},
];
