/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// Real pointer actions through Chrome's iPhone 12 Pro viewport.
export default async function run(stage,args) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice',query:'&stability=stable'});
  const phase=args[0]||'before';
  const size=async(width,height)=>{
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=640},a.page.sessionId);
    await a.emulateCoarsePointer(width<=640);
    await a.page.browser.send('Page.bringToFront',{},a.page.sessionId);
  };
  const tap=async(selector)=>{
    const point=await a.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y)),rect:r.toJSON()};})()`);
    if(!point.hit)throw new Error(`Blocked ${selector}: ${JSON.stringify(point)}`);
    for(const type of ['mousePressed','mouseReleased'])await a.page.browser.send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1},a.page.sessionId);
  };
  const shot=async(name)=>{
    await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await a.eval(`Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))`);
    console.log(await stage.shot(a,`roll-flow-${phase}-${name}.png`));
    if(name==='saved-pools')console.log('direct clear',await a.eval(`(()=>{const e=document.querySelector('#table-results .result-seat-clear'),s=getComputedStyle(e);return {html:e.outerHTML,rect:e.getBoundingClientRect().toJSON(),color:s.color,opacity:s.opacity,display:s.display,inert:e.closest('[inert]')?.id};})()`));
    console.log(name,await a.eval(`(()=>{const d=window.__diceDebug,r=document.getElementById('scene-container').getBoundingClientRect();return {workspace:d.workspaces.current,detail:d.tableResults.detailId,dice:d.tableDice.length,rows:d.tableResults.rows,scene:r.toJSON(),cover:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,180),clear:document.getElementById('corner-clear').getBoundingClientRect().toJSON()};})()`));
  };
  await size(390,844);
  await shot('empty');
  await tap('#phone-quick-dice [data-quick="2d6"]');
  await a.waitFor('!!window.__diceDebug.currentRoll');await a.settle();
  await shot('one-roll');
  await tap('#table-results .result-seat-clear');await a.waitFor('window.__diceDebug.tableDice.length===0');await a.settle();
  await shot('cleared');
  await tap('#phone-roll-tray .phone-tray-head button');
  await a.eval(`(()=>{const i=document.getElementById('cmd-input');i.value='3d6+2';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await a.waitFor('window.__diceDebug.trayState.dice.length===3');
  const prior=await a.rollId();
  await shot('builder');
  await a.dbg('holdClock(true)');await tap('#tray-roll');
  await a.waitFor(`window.__diceDebug.currentRoll?.rollId!==${JSON.stringify(prior)}&&!!window.__diceDebug.currentRoll`);
  await a.waitFor('!window.__diceDebug.filmWorker.baking&&window.__diceDebug.tableDice.length>0');
  await a.dbg('sim(10)');await shot('builder-flight');await a.settle();
  await shot('builder-result');
  await a.dbg('workspaces.close()');
  for(const name of ['Bram','Cora','Dev']){
    const p=await stage.ctx.rawPlayer(name);
    await stage.ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'});
    await a.waitFor(`window.__diceDebug.currentRoll?.playerName===${JSON.stringify(name)}`);await a.settle();
  }
  await shot('four-players');
  await a.dbg(`setGroups([{name:'Perception',notation:'1d20+5'},{name:'Longsword',notation:'1d20+7'},{name:'Damage',notation:'2d6+4'},{name:'Saving throw',notation:'1d20+3'}])`);
  await shot('saved-pools');
  await tap('#phone-more');await shot('more');await tap('#phone-more-close');
  await tap('#phone-build-roll');await shot('builder-four-players');await tap('#workspace-back');
  await tap('#table-results .is-mine');await shot('detail');
  console.log('actions',await a.eval(`document.getElementById('player-result-actions').outerHTML`));
  await tap('#player-result-actions .keep-verb');await shot('save-result');
  console.log('save',await a.eval(`(()=>{const p=document.getElementById('mods-popover'),r=p.getBoundingClientRect();return {rect:r.toJSON(),hit:p.contains(document.elementFromPoint(r.x+r.width/2,r.y+30)),parent:p.parentElement.id,html:p.outerHTML.slice(0,160)};})()`));
  await a.dbg('closePopover()');
  await a.dbg('tableResults.close()');
  await size(390,664);await shot('short-phone');
  await size(1440,900);await shot('desktop');
  console.log('errors',a.page.consoleErrors);
}
