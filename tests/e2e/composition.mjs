/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {assert} from './harness.mjs';
import {tapControl} from './roll-flows.mjs';
import {typeControl} from './explicit-library-fixture.mjs';
import {pointerRoll} from './table-camera.mjs';
import {roundFilmHash} from './round-table.mjs';

async function viewport(t,phone=false) {
  const width=phone?390:1600,height=phone?844:900;
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:phone},t.page.sessionId);
  await t.emulateCoarsePointer(phone);await t.page.browser.send('Page.bringToFront',{},t.page.sessionId);
  await t.waitFor(`(()=>{const v=window.__diceDebug.phoneFrame().view;return innerWidth===${width}&&Math.abs(v.left+v.width-${width})<1;})()`);
}
const physicalPoses=`window.__diceDebug.tableDice.map(d=>({rollId:d.rollId,index:d.dieIndex,type:d.type,
  position:[d.body.position.x,d.body.position.y,d.body.position.z],
  quaternion:[d.body.quaternion.x,d.body.quaternion.y,d.body.quaternion.z,d.body.quaternion.w],
  finalPosition:d.finalPos.toArray(),finalQuaternion:d.finalQuat.toArray()})).sort((a,b)=>a.rollId.localeCompare(b.rollId)||a.index-b.index)`;

export const resultComposition=`(()=>{const d=window.__diceDebug,scene=document.getElementById('scene-container'),strip=document.getElementById('table-results');
  const rect=e=>e.getBoundingClientRect().toJSON(),s=rect(strip),v=d.phoneFrame();
  const rows=[...strip.querySelectorAll('.result-seat')].filter(e=>!e.hidden).map(e=>{
    const sample=part=>{const r=rect(part),c=getComputedStyle(part),hits=[];
      for(const x of [r.left+1,(r.left+r.right)/2,r.right-1])for(const y of [r.top+1,(r.top+r.bottom)/2,r.bottom-1]){
        const hit=document.elementFromPoint(x,y);hits.push(e.contains(hit));}
      return {text:part.textContent,rect:r,font:parseFloat(c.fontSize),transform:c.transform,
        unclipped:part.scrollWidth<=part.clientWidth,hit:hits.every(Boolean)};};
    const r=rect(e);return {id:e.dataset.player,rollId:e.dataset.rollId,mine:e.classList.contains('is-mine'),rect:r,
      fullyVisible:r.top>=s.top&&r.bottom<=s.bottom,transform:getComputedStyle(e).transform,
      name:sample(e.querySelector('.result-seat-name')),value:sample(e.querySelector('.result-seat-value'))};});
  return {strip:s,scene:rect(scene),view:v.view,rows,dice:v.dice,
    coveredDice:v.dice.filter(p=>!scene.contains(document.elementFromPoint((p.left+p.right)/2,(p.top+p.bottom)/2))).length};})()`;

async function assertAttribution(t,expected,{visible=expected.length}={}) {
  await t.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const shot=await t.eval(resultComposition);
  assert.equal(shot.rows.length,expected.length,'each kept player result has an actual upright row');
  assert.ok(shot.strip.width>0&&shot.strip.height>0,'the read occupies real pixels');
  assert.ok(shot.strip.bottom<=shot.scene.top+.1,'the result rows reserve space above the playing surface');
  const seen=shot.rows.filter(r=>r.fullyVisible);assert.equal(seen.length,visible,'the expected rows fit in the visible result region');
  for(const row of shot.rows){
    const truth=expected.find(r=>r.id===row.id);assert.ok(truth,'visible attribution names an actual player');
    assert.equal(row.name.text,truth.name);assert.equal(row.rollId,truth.result.id);assert.equal(row.value.text,truth.result.headline);
    assert.equal(row.mine,truth.mine);assert.equal(row.transform,'none','result rows do not rotate with the table');
    if(!row.fullyVisible)continue;
    for(const part of [row.name,row.value]){
      assert.ok(part.rect.width>0&&part.rect.height>0,'the text has a nonzero painted layout');
      assert.equal(part.transform,'none');assert.equal(part.unclipped,true,`${part.text} is fully readable`);
      assert.equal(part.hit,true,`${part.text} is not covered by another control`);
    }
    assert.ok(row.name.font>=12&&row.value.font>=28,'the upright attribution and numeric read retain their rendered size');
  }
  assert.equal(shot.coveredDice,0,'no result row or phone tray covers a die centre');
  for(const p of shot.dice)assert.ok(p.left>=shot.view.left&&p.right<=shot.view.left+shot.view.width&&p.top>=shot.view.top&&p.bottom<=shot.view.top+shot.view.height,'the whole painted die remains in the available scene');
  return shot;
}
async function record(ctx,t,name,data={}){if(ctx.compositionShot)await ctx.compositionShot(t,name,data);}

export const compositionScenarios=[
  {name:'place-two-views',tags:['composition','place','presence'],timeout:120000,async fn(ctx){
    const front=await ctx.newTable({origin:'127.0.0.91',name:'Front'}),back=await ctx.newTable({origin:'127.0.0.92',name:'Back'});
    for(const t of [front,back]){await viewport(t);await t.dbg('holdClock(true)');await t.waitFor('window.__diceDebug.places().stations.length===2&&window.__diceDebug.places().built===window.__diceDebug.places().queued');await t.settle();}
    for(const [t,mine,orbit] of [[front,0,0],[back,1,3.14]]){
      const frame=await t.dbg('framingInfo()'),p=await t.dbg('places()');assert.equal(frame.placeMine,mine);assert.equal(frame.placeOrbit,orbit);
      assert.equal(p.orbit,p.myOrbit);assert.equal(Math.round(p.readerOrbit*100)/100,frame.orbit,'place inscriptions face the actual reader');
      const own=await t.dbg(`placardFrame(${mine})`),other=await t.dbg(`placardFrame(${1-mine})`);
      assert.equal(own.mine,true);assert.ok(own.cy<other.cy,'the viewer’s own chair is below the opposite chair');
      assert.ok(other.in&&Math.abs(own.cx)<.1&&Math.abs(other.cx)<.1,'opposite chairs remain centred in their reader’s composition');
    }
    assert.notEqual((await front.dbg('framingInfo()')).orbit,(await back.dbg('framingInfo()')).orbit,'this proves two different views');
    const proof=[];
    for(const [roller,viewer,set,notation] of [[front,back,'std','3d6'],[back,front,'tidewrack.seaglass','3d6']]){
      await roller.dbg(`setDiceSet('${set}')`);await viewport(roller);await pointerRoll(roller,notation,false);
      const id=await roller.rollId();await viewer.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(id)}&&!window.__diceDebug.filmWorker.baking`);
      await roller.settle();await viewer.settle();await viewer.dbg('sim(37)');
      const films=[await roller.eval(roundFilmHash),await viewer.eval(roundFilmHash)];assert.equal(films[0],films[1],'every complete film byte agrees across opposite chairs');
      const poses=await roller.eval(physicalPoses);assert.deepEqual(poses,await viewer.eval(physicalPoses),'exact physical and archived poses agree despite independent presentation clocks');
      assert.deepEqual(await roller.dbg('throwOrigin()'),await viewer.dbg('throwOrigin()'),'both viewers use the server’s same seat stamp');
      const cadence=await roller.eval(`window.__diceDebug.tableDice.filter(d=>d.rollId===${JSON.stringify(id)}).map(d=>({kind:d.rest.kind,recipe:d.rest.recipe,offset:d.mesh.position.y-d.finalPos.y,dx:d.mesh.position.x-d.finalPos.x,dz:d.mesh.position.z-d.finalPos.z}))`);
      const otherCadence=await viewer.dbg(`restInfo(${JSON.stringify(id)})`);
      if(set!=='std'){
        assert.ok(cadence.every(r=>r.kind==='swell'),'the differing-clock control really exercises decorative motion');
        assert.ok(cadence.every(r=>r.dx===0&&r.dz===0&&Math.abs(r.offset)<=r.recipe.yAmpM),'only the declared bounded rest cadence offsets the rendered positions');
        assert.ok(cadence.some((r,i)=>Math.abs(r.offset-otherCadence[i].deltaY)>1e-7),'the control actually reaches different decorative phases');
        assert.ok(otherCadence.every((r,i)=>Math.abs(r.deltaY)<=cadence[i].recipe.yAmpM&&r.tiltRad<=cadence[i].recipe.rollAmpRad+1e-7),'the second view also stays within the declared cosmetic bounds');
      }
      proof.push({id,set,film:films[0],physical:poses,cadence,otherCadence});
    }
    for(const [t,name,mine] of [[front,'front',0],[back,'back',1]]){
      await viewport(t);const rows=(await t.dbg('tableResults.rows')).filter(r=>r.result);
      const shot=await assertAttribution(t,rows);assert.equal((await t.dbg('framingInfo()')).placeMine,mine);
      await record(ctx,t,`two-views-${name}`,{...shot,proof});
      const other=rows.find(r=>!r.mine);await tapControl(t,`#table-results [data-player="${other.id}"] .result-seat-name`);
      assert.equal(await t.dbg('tableResults.detailId'),other.result.id,'the other player’s visible name opens that player’s result');
      await tapControl(t,'#player-result-close');assert.deepEqual(t.page.consoleErrors,[]);
    }
  }},
  {name:'place-ring-banner',tags:['composition','place','player-results'],timeout:180000,async fn(ctx){
    const t=await ctx.newTable({origin:'127.0.0.64',name:'Alice'});await viewport(t);await t.dbg('holdClock(true)');
    await pointerRoll(t,'2d6',false);await t.settle();
    for(let n=1;n<=8;n++){
      if(n>1){const p=await ctx.rawPlayer(['Bram','Cora','Dev','Erin','Finn','Gwen','Hugo'][n-2]);
        await ctx.api('/api/roll',{playerId:p.playerId,notation:'2d6'});await t.waitFor(`window.__diceDebug.currentRoll?.playerId===${JSON.stringify(p.playerId)}`);await t.settle();}
      await viewport(t);const rows=(await t.dbg('tableResults.rows')).filter(r=>r.result);assert.equal(rows.length,n);
      const desktop=await assertAttribution(t,rows);
      if(n===2||n===8)await record(ctx,t,`result-rows-${n}-desktop`,desktop);
      if(n===4||n===8){
        await viewport(t,true);await t.settle();const top=await assertAttribution(t,rows,{visible:4});await record(ctx,t,`result-rows-${n}-phone-top`,top);
        if(n===4){
          // Arm the occlusion measurement: a real covering element must be
          // detected even though all result geometry and text stay unchanged.
          const r=top.rows[0].name.rect;
          await t.eval(`(()=>{const e=document.createElement('div');e.id='composition-cover';e.style.cssText='position:fixed;z-index:2147483647;background:black;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px';document.body.append(e);})()`);
          try{assert.equal((await t.eval(resultComposition)).rows[0].name.hit,false,'the negative control catches a name painted under another element');}
          finally{await t.eval('document.getElementById("composition-cover").remove()');}
        }
        if(n===8){
          const box=top.strip;
          await t.page.browser.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:box.x+box.width/2,y:box.y+box.height/2,deltaX:0,deltaY:400},t.page.sessionId);
          await t.waitFor('document.getElementById("table-results").scrollTop>100');
          const bottom=await assertAttribution(t,rows,{visible:4});assert.notDeepEqual(bottom.rows.filter(r=>r.fullyVisible).map(r=>r.id),top.rows.filter(r=>r.fullyVisible).map(r=>r.id),'scrolling reveals the other four attributed results');
          await record(ctx,t,'result-rows-8-phone-bottom',bottom);
        }
        const visibleRows=(await t.eval(resultComposition)).rows.filter(r=>r.fullyVisible),last=visibleRows.at(-1);
        await tapControl(t,`#table-results [data-player="${last.id}"] .result-seat-name`);assert.equal(await t.dbg('tableResults.detailId'),last.rollId);
        await tapControl(t,'#player-result-close');
      }
    }
    assert.deepEqual(t.page.consoleErrors,[]);
  }},
  {name:'dev-phone-sheet',tags:['composition','dev'],timeout:120000,async fn(ctx){
    const t=await ctx.newTable({origin:'127.0.0.95',name:'Thumb'});await viewport(t,true);await t.dbg('holdClock(true)');
    await pointerRoll(t,'4d20',true);await t.settle();
    const before=await assertAttribution(t,(await t.dbg('tableResults.rows')).filter(r=>r.result));
    assert.equal(before.view.width,390);assert.ok(before.view.height>=400&&before.view.top>=56,'a useful scene remains between the upright result and bottom tray');
    await t.page.browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'`',code:'Backquote',windowsVirtualKeyCode:192},t.page.sessionId);
    await t.waitFor('window.__diceDebug.devInfo().panel==="folded"');
    await tapControl(t,'#dev-glyph');await t.waitFor('!document.getElementById("dev-panel").hidden');
    const box=await t.eval('document.getElementById("dev-panel").getBoundingClientRect().toJSON()');
    assert.equal(box.x,0);assert.equal(box.width,390);assert.ok(Math.abs(box.bottom-844)<1&&box.height<=844*.45+2,'the sheet is anchored at the bottom and under half the screen');
    assert.ok(box.top-before.scene.top>=220,'there is still a substantial unobscured scene above the open sheet');
    const read=await t.eval(resultComposition);assert.ok(read.rows.every(r=>r.name.hit&&r.value.hit),'the result stays readable while tuning');
    await typeControl(t,'#dev-panel .dev-find','lamp');
    const rowHeights=await t.eval('[...document.querySelectorAll("#dev-panel .dev-row")].filter(e=>e.offsetParent!==null).map(e=>e.getBoundingClientRect().height)');
    assert.ok(rowHeights.length>=3&&rowHeights.every(h=>h>=44),'filtered rows preserve their touch height');
    const lamp='#dev-panel .dev-row[data-path="light.lamp.y"]';
    assert.equal(await t.eval(`document.querySelector('${lamp}').classList.contains('is-stepper')`),true);
    assert.equal(await t.eval('document.querySelectorAll("#dev-panel input[type=range]").length'),0);
    const was=await t.dbg("tuneGet('light.lamp.y')");
    await tapControl(t,`${lamp} .dev-step:last-child`);
    await t.waitFor(`window.__diceDebug.tuneGet('light.lamp.y')===${was+.5}`);assert.equal((await t.dbg('lampInfo()')).position[1],was+.5);
    assert.deepEqual((await t.dbg('phoneFrame()')).view,before.view,'opening and operating the overlay leaves the player’s actual canvas unchanged');
    const target=await t.eval(`document.querySelector('${lamp} .dev-step:last-child').getBoundingClientRect().toJSON()`);assert.ok(target.width>=44&&target.height>=44);
    await record(ctx,t,'developer-phone-sheet-open',{before,box,target,lampHeight:was+.5});
    await tapControl(t,'#dev-panel .dev-head button:last-child');await t.waitFor('window.__diceDebug.devInfo().panel==="folded"');
    assert.equal(await t.dbg("tuneGet('light.lamp.y')"),was+.5);
    const after=await assertAttribution(t,(await t.dbg('tableResults.rows')).filter(r=>r.result));assert.deepEqual(after.view,before.view);
    await record(ctx,t,'developer-phone-sheet-folded',after);assert.deepEqual(t.page.consoleErrors,[]);
  }},
];
