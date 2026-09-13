/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';

export async function assertResultLayout(a,phone=false) {
  const frame=await a.dbg('phoneFrame()');
  const boxes=await a.eval(`(()=>{const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {seats:rect('table-results'),turn:rect('table-turn-bar'),banner:rect('result-banner')};})()`);
  if(phone){assert.equal(frame.view.left,0,JSON.stringify(await a.eval(`({inner:innerWidth,doc:document.documentElement.scrollWidth,scene:document.getElementById('scene-container').getBoundingClientRect().toJSON(),detail:document.getElementById('player-result-detail').getBoundingClientRect().toJSON()})`)));assert.equal(frame.view.width,390);}
  assert.ok(frame.dice.length,'painted meshes exist');
  assert.ok(boxes.seats.bottom<=frame.view.top,'result seats reserve real scene space');
  assert.equal(boxes.banner.height,0,'the old card no longer covers settled dice');
  if(boxes.turn.height)assert.ok(frame.view.top+frame.view.height<=boxes.turn.top,'active turn controls reserve real scene space');
  for(const d of frame.dice)assert.ok(d.left>=frame.view.left&&d.right<=frame.view.left+frame.view.width&&d.top>=frame.view.top&&d.bottom<=frame.view.top+frame.view.height,
    `painted die fits: ${JSON.stringify(d)} in ${JSON.stringify(frame.view)}`);
  return frame;
}
export const playerResultScenarios=[
  {name:'player-results-four',tags:['smoke','player-results','cuj2'],async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.145',name:'Alice'});
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},a.page.sessionId);
    const others=[];for(const name of ['Bram','Cora','Dev'])others.push(await ctx.rawPlayer(name));
    for(const p of others){await ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'});await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(p.name)}`);await a.settle();}
    await a.roll('4d6kh3+2');
    const rows=await a.dbg('tableResults.rows');assert.equal(rows.length,4);
    assert.ok(rows.every(r=>r.result&&!r.rolling));
    assert.equal(await a.eval(`document.querySelectorAll('#table-results .is-discarded').length`),1,'discarded faces remain visibly struck');
    for(const r of rows)assert.equal(r.result.headline,String((await a.entryState(r.result.id)).total));
    await assertResultLayout(a);
    await a.dbg('workspaces.open("people")');
    await a.eval(`document.querySelector('#workspace-people [data-focus-key="invite"]').focus()`);
    await ctx.api('/api/roll',{playerId:others[0].playerId,notation:'2d6'});await a.waitFor(`window.__diceDebug.currentRoll?.playerName==='Bram'`);await a.settle();
    assert.equal(await a.eval('document.activeElement.dataset.focusKey'),'invite','incoming rolls preserve focused workspace action');
    await a.dbg('workspaces.close()');
    const own=(await a.dbg('tableResults.rows')).find(r=>r.mine);
    await a.eval(`document.querySelector('#table-results [data-player="${own.id}"]').click()`);
    assert.equal(await a.dbg('tableResults.detailId'),own.result.id,'a standing result opens a complete read');
    await a.eval(`document.getElementById('player-result-close').click()`);
    assert.equal(await a.eval('document.activeElement.dataset.player'),own.id,'one-action return preserves result-seat focus');
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);await a.emulateCoarsePointer(true);await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);await a.waitFor('window.__diceDebug.phoneFrame().view.width===390');
    await assertResultLayout(a,true);
    await a.dbg('holdClock(true)');await a.dbg(`commandRoll('3d6')`);
    await a.waitFor('window.__diceDebug.currentRoll && !window.__diceDebug.currentRoll.done');
    assert.equal((await a.dbg('tableResults.rows')).find(r=>r.mine).result,null,'no future faces in a rolling seat');
    for(const n of [1,5,6,8]){await a.dbg(`sim(${n})`);const f=await a.dbg('phoneFrame()');for(const d of f.dice)assert.ok(d.left>=0&&d.right<=390&&d.top>=f.view.top&&d.bottom<=f.view.top+f.view.height);}
    await a.settle();await assertResultLayout(a,true);
    await a.dbg('workspaces.open("dice")');await a.dbg('workspaces.close()');await assertResultLayout(a,true);
  }},
  {name:'player-results-privacy-turn',tags:['smoke','player-results','cuj9'],async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.146',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.147',name:'Bob'});
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);await a.emulateCoarsePointer(true);await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);await a.waitFor('window.__diceDebug.phoneFrame().view.width===390');
    await ctx.api('/api/roll',{playerId:await a.playerId(),notation:'3d6 held',set:'symbols.fate'});await a.waitFor('!!window.__diceDebug.currentRoll');await a.settle();await b.settle();
    const hidden=(await b.dbg('tableResults.rows')).find(r=>r.name==='Alice').result;
    assert.equal(hidden.hidden,true);assert.deepEqual(hidden.faces,[]);assert.equal(hidden.headline,'Face down');
    const id=await a.rollId();await a.dbg(`tableResults.open(${JSON.stringify(id)})`);
    await a.eval(`document.querySelector('#player-result-actions .reveal-verb').click()`);
    await b.waitFor('window.__diceDebug.revealingCount>0');
    assert.equal((await b.dbg('tableResults.rows')).find(r=>r.name==='Alice').result,null,'reveal film has no early symbolic values');
    await a.settle();await b.settle();await a.dbg('tableResults.close()');
    await b.waitFor(`window.__diceDebug.tableResults.rows.find(r=>r.name==='Alice').result?.hidden===false`);
    const symbolic=(await b.dbg('tableResults.rows')).find(r=>r.name==='Alice').result;
    assert.ok(symbolic.faces.every(f=>f.symbol));assert.equal(await b.eval(`document.querySelectorAll('#table-results .chip-glyph').length`),3,'real symbol glyphs, not numeric face IDs');
    await ctx.api('/api/roll',{playerId:await b.playerId(),notation:'3d6',sets:['std','symbols.fate','std']});
    await b.waitFor(`window.__diceDebug.currentRoll?.playerName==='Bob'`);await b.settle();await a.settle();
    const mixed=(await a.dbg('tableResults.rows')).find(r=>r.name==='Bob').result;
    assert.deepEqual(mixed.faces.map(f=>!!f.symbol),[false,true,false],'each die retains its own numeric or symbolic face');
    const prior=await b.rollId();
    const expandedRoll=await ctx.api('/api/roll',{playerId:await b.playerId(),notation:'2d6 ro<=6',sets:['symbols.fate','std']});
    assert.equal(expandedRoll.status,200);
    await b.waitFor(`window.__diceDebug.currentRoll?.rollId!==${JSON.stringify(prior)}`);await b.settle();await a.settle();
    const expanded=(await a.dbg('tableResults.rows')).find(r=>r.name==='Bob').result;
    assert.deepEqual(expanded.faces.map(f=>!!f.symbol),[true,false,true,false],'reroll replacements inherit their own source die’s symbol set');
    const bobBefore=(await b.dbg('tableResults.rows')).find(r=>r.name==='Alice').result;
    await a.dbg("setDiceSet('std')");await a.roll('3d6 t3 secret');const turn=await a.rollId();
    assert.deepEqual((await b.dbg('tableResults.rows')).find(r=>r.name==='Alice').result,bobBefore,'private turn does not change another viewer’s latest result');
    assert.match((await a.dbg('tableResults.rows')).find(r=>r.mine).result.state,/Only you/);
    await a.dbg('pickToggle(0)');const before=await a.dbg(`turnState(${JSON.stringify(turn)})`);
    await assertResultLayout(a,true);
    assert.equal(await a.eval(`document.getElementById('table-turn-again').textContent`),'Throw 2 again');
    await a.eval(`document.getElementById('table-turn-again').click()`);await a.waitFor(`window.__diceDebug.turnState(${JSON.stringify(turn)})?.throws.used===2`);await a.settle();
    const after=await a.dbg(`turnState(${JSON.stringify(turn)})`);assert.equal(after.values[0],before.values[0]);
    await assertResultLayout(a,true);
    // Existing unfinished work stays playable after a fresh ordinary roll.
    await a.roll('1d8 secret');assert.equal(await a.eval(`document.getElementById('table-turn-bar').hidden`),false);
    await a.eval(`document.getElementById('table-turn-read').click()`);assert.equal(await a.dbg('tableResults.detailId'),turn);await a.dbg('tableResults.close()');
    await a.dbg('holdClock(true)');
    await a.eval(`document.getElementById('table-turn-again').click()`);
    await a.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(turn)}&&!window.__diceDebug.currentRoll.done`);
    assert.equal(await a.eval(`document.getElementById('table-turn-bar').hidden`),false,'final throw keeps the same control region until its film finishes');
    assert.equal((await a.dbg('tableResults.rows')).find(r=>r.mine).result,null,'rethrow has no early results');
    await a.settle();
    await a.dbg('clearTable()');
    for(let tries=0;tries<30;tries++){await a.roll('6d6 push>=5');if(!(await a.dbg(`pushState(${JSON.stringify(await a.rollId())})`)).state?.busted)break;await a.dbg('clearTable()');}
    assert.equal(await a.eval(`document.getElementById('table-turn-bank').hidden`),false,'open push has a reachable Bank');
    await assertResultLayout(a,true);
    const rect=await a.eval(`document.getElementById('table-turn-bank').getBoundingClientRect().toJSON()`);assert.ok(rect.height>=44&&rect.right<=390);
    await a.eval(`document.getElementById('table-turn-bank').click()`);await a.waitFor('document.getElementById("table-turn-bar").hidden');
    assert.match((await a.dbg('tableResults.rows')).find(r=>r.mine).result.state,/Banked/);
  }},
];
