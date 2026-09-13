/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
import {assertResultLayout} from './player-results.mjs';
import {click as visibleClick} from '../fixtures/visible-input.mjs';

// DOM click() bypasses occlusion and inert. These flows must use a pointer
// on the painted control, then prove the actual destination is visible.
export async function tapControl(a,selector) {
  // Background tabs can suspend rAF even when timer throttling is disabled.
  // Foreground before waiting for the control's animation and paint to settle.
  await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
  await a.eval(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',behavior:'instant'})`);
  await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await a.waitFor(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||e.closest('[inert]'))return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&e.contains(document.elementFromPoint(x,y));})()`,{desc:`visible, reachable ${selector}`,timeout:3000});
  // The canonical helper rechecks eligibility and hit testing at dispatch time.
  await visibleClick(a,selector);
}
export async function rollViewVisible(a) {
  await a.waitFor(`(()=>{const s=document.getElementById('scene-container'),r=s.getBoundingClientRect();return !s.inert&&s.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`,{desc:'the rolling surface is visible and interactive'});
  assert.equal(await a.dbg('workspaces.current'),null);
  assert.equal(await a.dbg('tableResults.detailId'),null);
  const frame=await assertResultLayout(a,true);
  const covered=await a.eval(`(()=>{const s=document.getElementById('scene-container');return window.__diceDebug.phoneFrame().dice.filter(d=>!s.contains(document.elementFromPoint((d.left+d.right)/2,(d.top+d.bottom)/2))).length;})()`);
  assert.equal(covered,0,'every die is visible, not merely projected inside a covered scene');
  return frame;
}
async function phone(a,height=844) {
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height,deviceScaleFactor:1,mobile:true},a.page.sessionId);
  await a.emulateCoarsePointer(true);await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
}
async function tapRoll(a,selector) {
  const before=await a.rollId();await a.dbg('holdClock(true)');await tapControl(a,selector);
  await a.waitFor(`!!window.__diceDebug.currentRoll&&window.__diceDebug.currentRoll.rollId!==${JSON.stringify(before)}`,{desc:`${selector} starts a roll after ${before}`});
  await a.waitFor('!window.__diceDebug.filmWorker.baking&&window.__diceDebug.tableDice.length>0',{desc:`${selector} has visible dice ready for playback`});
  await a.dbg('sim(12)');await rollViewVisible(a);await a.settle();await rollViewVisible(a);
}
export const rollFlowScenarios=[
  {name:'roll-flow-return-to-background-draft',tags:['roll-flows','workspaces','multiplayer'],async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.155',name:'Alice'});await phone(a);
    await a.dbg('setGroups([])');
    await tapControl(a,'#phone-build-roll');
    await tapControl(a,'#die-buttons .die-btn:nth-child(2)');
    const seat=await a.playerId(),draft=await a.dbg('trayState.dice');
    const b=await ctx.newTable({origin:'127.0.0.156',name:'Bob'});await phone(b);
    await b.dbg('setGroups([])');
    await tapRoll(b,'#phone-quick-dice [data-quick="2d6"]');
    const bobsRoll=await b.rollId();
    await a.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(bobsRoll)}`);
    await a.settle();
    assert.equal(await a.eval('document.visibilityState'),'hidden','Bob’s real controls leave Alice in a background tab');
    assert.equal(await a.dbg('workspaces.current'),'dice','Bob’s roll keeps Alice’s draft open');
    assert.deepEqual(await a.dbg('trayState.dice'),draft);
    // Bound the click itself: the former pre-foreground rAF never completed.
    let timeout;
    try {
      await Promise.race([
        tapControl(a,'#tray-roll'),
        new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('returning to Alice’s visible Roll control timed out')),5000);}),
      ]);
    } finally { clearTimeout(timeout); }
    await a.waitFor(`window.__diceDebug.currentRoll?.rollId!==${JSON.stringify(bobsRoll)}`);
    await a.settle();await rollViewVisible(a);
    const roll=await a.rollId();
    await b.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(roll)}`);await b.settle();
    const alice=await a.entryState(roll),bob=await b.entryState(roll);
    assert.deepEqual(alice.values,bob.values,'Bob receives Alice’s actual staged roll');
    assert.equal(alice.values.length,draft.length);
    assert.equal(await a.playerId(),seat);
    assert.equal(await a.eval('document.visibilityState'),'visible');
    assert.deepEqual(a.page.errors,[]);assert.deepEqual(b.page.errors,[]);
  }},
  {name:'roll-flow-delayed-response-keeps-reopened-task',tags:['roll-flows','workspaces'],async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.154',name:'Alice'});await phone(a);
    async function hold(path){
      await a.eval(`(()=>{
        const original=window.fetch;window.flowHeld=false;window.flowConsumed=false;
        let release;const gate=new Promise(r=>release=r);window.releaseFlow=release;
        window.fetch=async(url,opts)=>{
          const response=await original(url,opts);
          if(String(url).includes(${JSON.stringify(path)})){
            window.flowHeld=true;await gate;window.fetch=original;
            const json=response.json.bind(response);response.json=async()=>{const value=await json();window.flowConsumed=true;return value;};
          }
          return response;
        };
      })()`);
    }
    async function release(){
      await a.eval('window.releaseFlow()');await a.waitFor('window.flowConsumed');
      await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    }
    await tapControl(a,'#phone-build-roll');await tapControl(a,'#die-buttons .die-btn:nth-child(2)');
    await hold('/api/roll');await tapControl(a,'#tray-roll');await a.waitFor('window.flowHeld');
    await tapControl(a,'#workspace-back');await tapControl(a,'#phone-build-roll');
    await release();
    assert.equal(await a.dbg('workspaces.current'),'dice','late accepted roll cannot close a new visit to the same builder');
    await tapControl(a,'#workspace-back');await a.settle();
    await a.roll('3d6 t3');const turn=await a.rollId();await a.settle();
    await tapControl(a,'#table-turn-read');await hold('/api/rethrow');
    await tapControl(a,'#player-result-actions .throw-again');await a.waitFor('window.flowHeld');
    await a.waitFor(`window.__diceDebug.turnState(${JSON.stringify(turn)})?.throws.used===2`);await a.settle();
    await tapControl(a,'#player-result-close');await tapControl(a,'#table-turn-read');
    await release();
    assert.equal(await a.dbg('tableResults.detailId'),turn,'late accepted rethrow cannot close a new visit to the same result');
    assert.deepEqual(a.page.errors,[]);
  }},
  {name:'roll-flow-mobile-pools-and-navigation',tags:['smoke','roll-flows','workspaces'],async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.153',name:'Alice'});await phone(a);
    await a.dbg(`setGroups([{name:'Perception',notation:'1d20+5'},{name:'Longsword',notation:'1d20+7'},{name:'Damage',notation:'2d6+4'},{name:'Private check',notation:'2d6+2 secret'}])`);
    await a.waitFor('document.querySelectorAll(".phone-pool").length===4');
    await a.waitFor(`document.querySelector('#scene-container canvas').getBoundingClientRect().height===document.getElementById('scene-container').getBoundingClientRect().height`,{desc:'adding saved pools refits the renderer without a window resize'});
    const root=await a.eval(`(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {nav:r('workspace-nav'),dice:r('my-dice'),footer:r('rail-foot'),pools:[...document.querySelectorAll('.phone-pool')].map(e=>e.getBoundingClientRect().toJSON()),page:document.documentElement.scrollWidth};})()`);
    assert.equal(root.nav.height,52);assert.equal(root.nav.bottom,844);assert.equal(root.dice.height,0);assert.equal(root.footer.height,0);assert.equal(root.page,390);
    assert.ok(root.pools.every(r=>r.height>=44&&r.width<=390));
    await tapRoll(a,'.phone-pool:first-child');
    const first=await a.entryState(await a.rollId());assert.equal(first.total-first.values.reduce((a,b)=>a+b,0),5);
    await tapRoll(a,'.phone-pool:last-child');assert.equal((await a.entryState(await a.rollId())).visMode,'secret','compact pools preserve privacy');
    await tapControl(a,'#phone-more');await tapControl(a,'#phone-tool-preferences');await tapControl(a,'#settings-close');
    assert.equal(await a.eval('document.activeElement.id'),'phone-more','Preferences returns to the visible More control');
    await tapControl(a,'#phone-more');await tapControl(a,'#phone-tool-history');await tapControl(a,'#log-close');
    await tapControl(a,'#phone-more');await tapControl(a,'#phone-tool-help');await tapControl(a,'#help-close');
    await tapControl(a,'#phone-more');await tapControl(a,'#phone-tool-notation');
    await a.page.browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},a.page.sessionId);
    await rollViewVisible(a);
    await tapControl(a,'#phone-build-roll');await tapControl(a,'#my-dice');
    await a.waitFor('window.__diceDebug.diceGallery.open');await tapControl(a,'.dg-close');
    await a.dbg('workspaces.close()');await a.dbg('setGroups([])');
    await a.waitFor(`!document.getElementById('phone-quick-dice').hidden&&document.querySelector('#scene-container canvas').getBoundingClientRect().height===document.getElementById('scene-container').getBoundingClientRect().height`,{desc:'removing the last saved pool restores quick dice and refits the scene'});
    await rollViewVisible(a);
  }},
  {name:'roll-flow-clear-lone-result',tags:['smoke','roll-flows','player-results'],async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.150',name:'Alice'});await phone(a);
    assert.equal(await a.eval(`document.getElementById('table-results').hidden`),true,'no empty seats consume the table');
    await tapRoll(a,'#phone-quick-dice [data-quick="2d6"]');
    const clear=await a.eval(`document.querySelector('#table-results .result-seat-clear').getBoundingClientRect().toJSON()`);
    assert.ok(clear.width>=44&&clear.height>=44,'one-step Clear has its own touch target beside the result');
    await tapControl(a,'#table-results .result-seat-clear');await a.waitFor('window.__diceDebug.tableResults.rows.every(r=>!r.result)');await a.settle();
    assert.equal(await a.dbg('tableResults.detailId'),null,'one tap clears without opening a reader');
    assert.equal(await a.diceCount(),0);assert.equal(await a.eval(`document.getElementById('table-results').getBoundingClientRect().height`),0);
    assert.equal(await a.logCount(),1,'clear preserves history');
    await a.reload();assert.ok((await a.dbg('tableResults.rows')).every(r=>!r.result),'cleared cards stay gone after reconnect');
    await tapRoll(a,'#phone-quick-dice [data-quick="1d20"]');
    await tapControl(a,'#table-results .is-mine');await tapControl(a,'#player-result-actions .card-act');
    await a.waitFor('!window.__diceDebug.tableResults.detailId&&window.__diceDebug.tableResults.rows.every(r=>!r.result)');
    await a.settle();assert.equal(await a.diceCount(),0);
    const b=await ctx.rawPlayer('Bram');await ctx.api('/api/roll',{playerId:b.playerId,notation:'2d6'});
    await a.waitFor(`window.__diceDebug.currentRoll?.playerName==='Bram'`);await a.settle();
    await tapRoll(a,'#phone-quick-dice [data-quick="1d6"]');
    const theirs=(await a.dbg('tableResults.rows')).find(r=>!r.mine).result;
    await tapControl(a,'#table-results .result-seat-clear');await a.waitFor('window.__diceDebug.tableResults.rows.find(r=>r.mine).result===null');
    assert.deepEqual((await a.dbg('tableResults.rows')).find(r=>!r.mine).result,theirs,'clearing a card preserves another player’s read');
    await tapControl(a,'#phone-more');await tapControl(a,'#corner-clear');
    await a.waitFor('document.getElementById("corner-clear").classList.contains("armed")');
    await tapControl(a,'#corner-clear');await a.waitFor('window.__diceDebug.tableResults.rows.every(r=>!r.result)');await a.settle();
    assert.equal(await a.diceCount(),0);assert.equal(await a.logCount(),4);
    await tapControl(a,'#phone-more-close');
  }},
  {name:'roll-flow-phone-builder-and-result-tools',tags:['smoke','roll-flows','workspaces'],async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.151',name:'Alice'});await phone(a);
    await tapControl(a,'#phone-build-roll');
    const close=await a.eval(`document.getElementById('workspace-back').getBoundingClientRect().toJSON()`);
    assert.ok(close.width===44&&close.height===44&&close.right<=376,'close has consistent padding and a full touch target');
    assert.equal(await a.eval(`document.getElementById('workspace-back').textContent`),'×');
    await tapControl(a,'#die-buttons .die-btn:nth-child(2)');await tapControl(a,'#die-buttons .die-btn:nth-child(2)');
    assert.equal((await a.dbg('trayState')).dice.length,2,'Build a roll opens the actual builder');
    await tapControl(a,'#tray-mods');
    await tapControl(a,'#pop-close');assert.equal(await a.dbg('workspaces.current'),'dice','closing the editor returns to the draft');
    await tapControl(a,'#tray-mods');
    await a.page.browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},a.page.sessionId);
    assert.equal(await a.dbg('workspaces.current'),'dice');assert.equal(await a.eval(`document.getElementById('mods-popover').classList.contains('hidden')`),true);
    await tapRoll(a,'#tray-roll');
    await tapControl(a,'#table-results .is-mine');
    await tapControl(a,'#player-result-actions .keep-verb');await tapControl(a,'#pop-variant');
    await a.page.browser.send('Input.insertText',{text:'Damage'},a.page.sessionId);
    await tapControl(a,'#pop-save-confirm');
    assert.ok((await a.dbg('groups')).some(g=>g.name==='Damage'),'saving a result completes from the phone reader');
    await tapRoll(a,'#player-result-actions .pk-strip');
    await tapControl(a,'#phone-build-roll');
    await a.dbg(`setGroups([{name:'Saved attack',notation:'1d20+5'}])`);
    if(await a.eval(`document.querySelector('#section-bar [data-sec="pools"]').getAttribute('aria-pressed')==='false'`))await tapControl(a,'#section-bar [data-sec="pools"]');
    await tapControl(a,'#groups-list .pool-tile .tile-stage');
    await tapRoll(a,'#tray-roll');
    const saved=await a.entryState(await a.rollId());assert.equal(saved.total-saved.values.reduce((a,b)=>a+b,0),5,'saved roll retains its modifier');
    for(const name of ['Bram','Cora','Dev']){
      const p=await ctx.rawPlayer(name);await ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'});
      await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(name)}`);await a.settle();
    }
    await phone(a,664);await tapRoll(a,'#phone-draft-roll');
    assert.equal((await a.dbg('tableResults.rows')).filter(r=>r.result).length,4);
    await tapControl(a,'#phone-build-roll');
    await a.eval(`(()=>{const i=document.getElementById('cmd-input');i.value='3d6 t3';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await a.waitFor('window.__diceDebug.trayState.dice.length===3');await tapRoll(a,'#tray-roll');const turn=await a.rollId();
    await tapControl(a,'#table-turn-read');await tapControl(a,'#player-result-actions .throw-again');
    await a.waitFor(`window.__diceDebug.turnState(${JSON.stringify(turn)})?.throws.used===2`);await a.dbg('sim(12)');await rollViewVisible(a);await a.settle();await rollViewVisible(a);
  }},
  {name:'roll-flow-refusal-keeps-editor',tags:['roll-flows','workspaces'],async fn(ctx){
    const a=await ctx.newTable({origin:'127.0.0.152',name:'Alice'});await phone(a);
    await tapControl(a,'#phone-build-roll');await tapControl(a,'#die-buttons .die-btn:nth-child(2)');
    // Exercise an HTTP refusal without closing or clearing the player's draft.
    await a.eval(`(()=>{const original=window.fetch;window.restoreFlowFetch=()=>{window.fetch=original;};window.fetch=(url,opts)=>String(url).includes('/api/roll')?Promise.resolve(new Response(JSON.stringify({error:'Roll refused for this check',code:'test_refusal'}),{status:400,headers:{'Content-Type':'application/json'}})):original(url,opts);})()`);
    await tapControl(a,'#tray-roll');await a.waitFor(`window.__diceDebug.lastRefusal?.path==='/api/roll'`);
    assert.equal(await a.dbg('workspaces.current'),'dice');assert.equal((await a.dbg('trayState')).dice.length,1);assert.equal(await a.logCount(),0);
    assert.ok(await a.eval(`(()=>{const e=document.querySelector('#workspace .workspace-status');return !e.hidden&&e.textContent.length>0&&e.getBoundingClientRect().height>0;})()`),'the refusal is visible inside the editor');
    await a.eval('window.restoreFlowFetch()');await tapRoll(a,'#tray-roll');
    // A remote arrival must not dismiss a local task or its editor.
    await tapControl(a,'#phone-build-roll');await tapControl(a,'#tray-mods');
    const b=await ctx.rawPlayer('Bram');await ctx.api('/api/roll',{playerId:b.playerId,notation:'2d6'});
    await a.waitFor(`window.__diceDebug.currentRoll?.playerName==='Bram'`);await a.settle();
    assert.equal(await a.dbg('workspaces.current'),'dice');await tapControl(a,'#pop-close');await tapControl(a,'#workspace-back');
    await rollViewVisible(a);
  }},
];
