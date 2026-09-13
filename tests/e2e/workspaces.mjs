/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';

const inScene = frame => {
  const v=frame.view;
  assert.equal(v.left,0); assert.equal(v.width,390,'phone reclaims the whole rail');
  assert.ok(frame.dice.length>0,'there are painted dice to measure');
  for(const d of frame.dice) assert.ok(d.left>=v.left && d.right<=v.left+v.width && d.top>=v.top && d.bottom<=v.top+v.height,
    `painted die ${d.index} stays in the usable scene: ${JSON.stringify(d)}`);
};

export const workspaceScenarios = [
  {name:'workspaces-desktop-four',tags:['workspaces','cuj2'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.144',name:'Alice'});
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},a.page.sessionId);
    for(const name of ['Bram','Cora','Dev']) {
      const p=await ctx.rawPlayer(name); await ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'});
      await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(name)}`); await a.settle();
    }
    await a.roll('2d6'); await a.dbg('workspaces.open("people")');
    const scene=await a.dbg('phoneFrame()'), drawer=await a.eval(`document.getElementById('workspace').getBoundingClientRect().toJSON()`);
    assert.equal(drawer.width,480); assert.ok(scene.view.left+scene.view.width<=drawer.left);
    assert.equal(await a.eval(`document.getElementById('scene-container').inert`),false,'People leaves the desktop table usable');
    assert.equal(scene.dice.length,8);
    for(const d of scene.dice) assert.ok(d.left>=scene.view.left&&d.right<=scene.view.left+scene.view.width&&d.top>=scene.view.top&&d.bottom<=scene.view.top+scene.view.height);
    assert.equal(await a.eval(`document.querySelectorAll('#workspace-people .workspace-latest').length`),4,'every player has a latest visible result');
    await a.dbg('workspaces.open("dice")');
    assert.equal(await a.eval(`document.getElementById('workspace').getBoundingClientRect().width`),760,'organization gets more space than presence');
    await a.dbg('workspaces.close()');
  }},
  {name:'workspaces-keep-table',tags:['smoke','workspaces','cuj9'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.141',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.142',name:'Bob'});
    await a.roll('3d6 t3 secret'); const turn=await a.rollId();
    await a.dbg('pickToggle(0)');
    await a.eval(`(()=>{const i=document.getElementById('cmd-input');i.value='2d8+4 w:Bob # Kept draft';i.dispatchEvent(new Event('input',{bubbles:true}));window.keptBuilder=document.getElementById('builder-panel');window.keptLibrary=document.getElementById('dest-stuff');})()`);
    await a.waitFor('window.__diceDebug.trayState.dice.length===2');
    const draft=await a.dbg('trayState'), before=await a.dbg(`turnState(${JSON.stringify(turn)})`), picks=await a.dbg('picked.keys'), pid=await a.playerId();
    await a.eval(`localStorage.setItem('dice.tables.v1',JSON.stringify([{room:'copper-lantern',name:'The Copper Lantern',at:Date.now()}]));document.querySelector('#workspace-nav [data-workspace="tables"]').click()`);
    assert.equal(await a.dbg('workspaces.current'),'tables');
    assert.match(await a.eval(`document.getElementById('workspace-tables').textContent`),/The Copper Lantern/);
    await a.eval(`[...document.querySelectorAll('#workspace-tables button')].find(b=>b.textContent==='＋ New table').click()`);
    assert.ok(await a.eval(`document.querySelector('#workspace .rail-menu input')!==null`),'new-table form stays in the workspace');
    await a.eval(`document.querySelector('#workspace .rail-menu input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await a.dbg('workspaces.open("people")');
    assert.equal(await a.eval(`document.querySelectorAll('#workspace-people .workspace-person').length`),2);
    await a.dbg('workspaces.open("dice")');
    assert.ok(await a.eval(`document.querySelector('#workspace #builder-panel')===window.keptBuilder`),'the actual draft editor is reused');
    await a.eval(`[...document.querySelectorAll('.workspace-tools button')].find(b=>b.textContent==='Saved rolls & starter kits').click()`);
    assert.ok(await a.eval(`document.querySelector('#settings-modal:not(.hidden) #dest-stuff')===window.keptLibrary`),'the same library opens as its full browsing task');
    await a.eval(`document.getElementById('settings-close').click()`);
    assert.equal(await a.dbg('workspaces.current'),null);
    assert.equal(await a.playerId(),pid,'workspace visits keep the seat');
    assert.deepEqual(await a.dbg('trayState'),draft,'workspace visits keep the draft');
    assert.deepEqual(await a.dbg(`turnState(${JSON.stringify(turn)})`),before,'workspace visits keep the unfinished turn');
    assert.deepEqual(await a.dbg('picked.keys'),picks,'kept dice survive navigation');
    assert.equal(await b.logCount(),0,'browsing publishes none of the private work');
    assert.ok(await a.eval(`document.getElementById('left-panel').contains(window.keptBuilder) && document.getElementById('settings-modal').contains(window.keptLibrary)`));
    assert.match(await a.eval('location.search'),new RegExp(ctx.room),'Tables never called leaveToLobby');
    // Live arrival updates People without leaking held values.
    await b.roll('1d20 held'); await a.settle();
    await a.dbg('workspaces.open("people")');
    assert.match(await a.eval(`document.getElementById('workspace-people').textContent`),/Face down/);
    await a.dbg('workspaces.close()');
  }},
  {name:'workspaces-phone-four',tags:['smoke','workspaces','touch','cuj1','cuj2'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.143',name:'Alice'});
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
    await a.emulateCoarsePointer(true); await a.eval(`localStorage.removeItem('dice.panels.v1')`); await a.reload();
    const others=[]; for(const name of ['Bram','Cora','Dev']) others.push(await ctx.rawPlayer(name));
    await a.waitFor('window.__diceDebug.players.length===4');
    for(const p of others) { await ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'}); await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(p.name)}`); await a.settle(); }
    await a.dbg('holdClock(true)');
    await a.eval(`document.querySelector('#phone-quick-dice [data-quick="2d6"]').click()`);
    await a.waitFor('window.__diceDebug.currentRoll && !window.__diceDebug.currentRoll.done');
    for(const n of [1,5,6,8]) { await a.dbg(`sim(${n})`); inScene(await a.dbg('phoneFrame()')); }
    assert.ok((await a.dbg('phoneFrame()')).busy,'the measured flight is still rolling');
    await a.settle(); const rest=await a.dbg('phoneFrame()'); inScene(rest);
    assert.equal(rest.dice.length,8,'all four players have dice in frame');
    const camera=rest.view;
    await a.dbg('workspaces.open("dice")');
    assert.equal(await a.eval(`document.getElementById('workspace').getBoundingClientRect().width`),390);
    await a.eval(`document.getElementById('workspace-back').click()`);
    inScene(await a.dbg('phoneFrame()')); assert.deepEqual((await a.dbg('phoneFrame()')).view,camera,'sheet collapse keeps the scene rectangle');
    const buttons=await a.eval(`[...document.querySelectorAll('#phone-quick-dice [data-quick]')].map(b=>b.getBoundingClientRect().toJSON())`);
    assert.ok(buttons.length===8 && buttons.every(r=>r.left>=0&&r.right<=390&&r.bottom<=844&&r.height>=40));
    const banner=await a.eval(`document.getElementById('result-banner').getBoundingClientRect().toJSON()`);
    assert.ok(banner.left>=0&&banner.right<=390&&banner.bottom<=618,'result card stays above the bottom tray');
    await a.dbg('workspaces.open("dice")');
    await a.eval(`(()=>{const i=document.getElementById('cmd-input');i.value='2d8 secret';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await a.waitFor('window.__diceDebug.trayState.dice.length===2');
    await a.dbg('workspaces.close()');
    await a.waitFor('!document.getElementById("phone-draft-roll").disabled');
    const before=await a.rollId();
    await a.eval(`document.getElementById('phone-draft-roll').click()`);
    await a.waitFor(`window.__diceDebug.currentRoll?.rollId!==${JSON.stringify(before)}`); await a.settle();
    assert.equal((await a.entryState(await a.rollId())).visMode,'secret','the phone draft verb preserves declared privacy');
  }},
];
