/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {Browser} from '../tests/e2e/cdp.mjs';
import {Table} from '../tests/e2e/harness.mjs';
import {click,type,key,hover} from '../tests/fixtures/visible-input.mjs';

export {click,type,key,hover};
export async function frameScreenshot(t,selector,{content=[]}={}){
  await t.page.browser.send('Page.bringToFront',{},t.page.sessionId);
  if(!selector)return;
  // A capture may frame a tall, noninteractive container whose midpoint is
  // clipped. Measure its painted viewport instead of inventing pointer input.
  assert.equal(await t.eval(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||!node.checkVisibility()||node.closest('[inert]'))return false;node.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});return true;})()`),true,'screenshot target is rendered');
  await t.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const visible=await t.eval(`(()=>{return ${JSON.stringify(content.length?content:[selector])}.every(selector=>{const node=document.querySelector(selector);if(!node||!node.checkVisibility()||node.closest('[inert]'))return false;
    const r=node.getBoundingClientRect();let left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
    for(let p=node.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(s.overflowX!=='visible'){left=Math.max(left,b.left);right=Math.min(right,b.right);}if(s.overflowY!=='visible'){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}}
    if(right<=left||bottom<=top)return false;
    return [.1,.5,.9].some(x=>[.1,.5,.9].some(y=>{const hit=document.elementFromPoint(left+(right-left)*x,top+(bottom-top)*y);return hit&&(node===hit||node.contains(hit));}));});})()`);
  assert.equal(visible,true,'screenshot content has unoccluded viewport area');
}
export async function homeCardsReady(t,homes){
  await homesIdle(t);
  assert.equal(!!(await t.dbg('homes.state.error')),false,'home list did not report a service error');
  await t.waitFor(`(()=>{const s=window.__diceDebug.homes.state;if(s.loading||s.error||s.preview||s.selected)return false;return ${JSON.stringify(homes.map(h=>({id:h.id,name:h.name})))}.every(home=>{const card=Array.from(document.querySelectorAll('#homes-cards [data-home-id]')).find(c=>c.dataset.homeId===home.id);return card?.checkVisibility()&&card.querySelector('h4')?.textContent===home.name&&!!card.querySelector('[data-home-focus="join:'+home.id+'"]');});})()`,{timeout:30000});
}
export const accountState=t=>t.dbg('privateLibrary.state');
export const accountIdle=t=>t.waitFor('window.__diceDebug.privateLibrary.state?.ready&&!document.getElementById("account-refresh")?.disabled',{timeout:30000});
export const homesIdle=t=>t.waitFor('!!window.__diceDebug.homes.state&&!window.__diceDebug.homes.state.loading&&!document.getElementById("homes-refresh").disabled',{timeout:30000});
export const peopleIdle=t=>t.waitFor('!!window.__diceDebug.people.state&&!window.__diceDebug.people.state.loading&&!document.getElementById("people-refresh").disabled',{timeout:30000});
export async function workspace(t,name){
  const open=await t.eval('!document.getElementById("workspace").classList.contains("hidden")');
  await click(t,(open?'#workspace .workspace-tabs':'#workspace-nav')+` [data-workspace="${name}"]`);
}
export async function closeWorkspace(t){if(await t.dbg('workspaces.current'))await click(t,'#workspace-back');}
export async function openAccount(t){await closeWorkspace(t);await click(t,'#identity-chip');await click(t,'#idm-account');await t.waitFor('!!document.getElementById("account-create")');await accountIdle(t);}
export async function register(t,name,keepKey){
  await openAccount(t);await click(t,'#account-create');
  const recoveryKey=await t.eval('document.getElementById("account-key").value');
  await keepKey(recoveryKey); // persist the generated fixture key before registration
  await type(t,'#account-name',name);await click(t,'#account-key-kept');await click(t,'#account-submit');await accountIdle(t);
  const state=await accountState(t);assert.ok(state.person);assert.equal(state.syncEnabled,false);return state.person.id;
}
export async function recover(t,recoveryKey,id){
  await openAccount(t);await click(t,'#account-recover');await type(t,'#account-key',recoveryKey);await click(t,'#account-submit');await accountIdle(t);
  assert.equal((await accountState(t)).person?.id,id);assert.equal((await accountState(t)).syncEnabled,false);
}
export async function accountApi(t,method,...args){
  return t.eval(`(async()=>{const api=window.__stagingApi||(window.__stagingApi=(await import('/js/account.js')).createAccountClient());
    await api.session();return api[${JSON.stringify(method)}](...${JSON.stringify(args)});})()`);
}
export async function publicApi(t,path,body){return t.eval(`(async()=>{const response=await fetch(${JSON.stringify('/api/'+path)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})});return {status:response.status,value:await response.json()};})()`);}
export async function compose(t,notation){
  await closeWorkspace(t);await workspace(t,'dice');
  if(await t.eval('document.querySelector("#section-bar [data-sec=notation]").getAttribute("aria-pressed")==="false"'))await click(t,'#section-bar [data-sec="notation"]');
  const before=await t.rollId();await type(t,'#cmd-input',notation);await key(t,'Enter','Enter',13);
  await t.waitFor(`!!window.__diceDebug.currentRoll&&window.__diceDebug.currentRoll.rollId!==${JSON.stringify(before)}`);await t.settle();
  assert.equal(await t.dbg('workspaces.current'),null);return t.rollId();
}
export async function joinHome(t,id,room,name){
  await workspace(t,'tables');await homesIdle(t);await followJoin(t,`[data-home-focus="join:${id}"]`,room);
  assert.equal(await t.dbg('settings.tableName'),name);assert.equal(await t.dbg('net.savedHome'),true);
}
export async function followJoin(t,selector,room){
  const previous=await t.eval('performance.timeOrigin');await click(t,selector);
  await afterJoin(t,room,{previous});
}
export async function afterJoin(t,room,{previous=null,timeout=30000}={}){
  const origin=new URL(t.url).origin,deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    let result,timer;
    try{
      result=await Promise.race([t.eval(`(async()=>{ /* staging navigation readiness */
        if(location.origin!==${JSON.stringify(origin)}||new URL(location.href).searchParams.get('room')!==${JSON.stringify(room)}||performance.timeOrigin===${JSON.stringify(previous)}||!window.__diceDebug?.netReady)return null;
        const ready=await window.__diceDebug.netReady,net=window.__diceDebug.net;return {online:ready?.online===true,currentOnline:net?.online===true,unavailableHome:net?.unavailableHome===true};})()`),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timed out waiting for live destination readiness')),Math.max(1,deadline-Date.now()));})]);
    }catch(error){
      // A real pointer starts a full document navigation. Only this transient
      // CDP failure is retried; app exceptions and incorrect state still fail.
      if(!/^CDP (?:Execution context was destroyed(?:, most likely because of a navigation)?\.?|Inspected target navigated or closed\.?|Cannot find context with specified id\.?|Cannot find default execution context\.?)(?: —[^\n]*)?$/.test(String(error.message)))throw error;
    }finally{clearTimeout(timer);}
    if(result){assert.equal(result.online,true,'destination must join the live server');assert.equal(result.unavailableHome,false,'destination home must be available');if(result.currentOnline){await t.settle();return;}}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Timed out waiting for the destination document and live join');
}
export async function browserTable(origin,name,{phone=false}={}){
  const browser=await new Browser().launch();
  try {
    const page=await browser.newPage();
    await page.addInitScript(`window.__diceTestMode=true;localStorage.setItem('dice.schema.v1','2');localStorage.setItem('dice.name.v1',${JSON.stringify(name)});`);
    await browser.send('Emulation.setDeviceMetricsOverride',{width:phone?390:1440,height:phone?844:900,deviceScaleFactor:1,mobile:phone},page.sessionId);
    await browser.send('Emulation.setTouchEmulationEnabled',phone?{enabled:true,maxTouchPoints:5}:{enabled:false},page.sessionId);
    await page.navigate(origin+'/health');
    const t=new Table(page,origin+'/health');
    await t.waitFor(`location.origin===${JSON.stringify(origin)}`);
    const before=await page.eval(`fetch('/api/account/session').then(r=>r.json()).then(r=>r.person)`);
    assert.equal(before,null,'each fixture browser starts without an account cookie');
    const guest=await publicApi(t,'new-room',{name});assert.equal(guest.status,200);
    const room=guest.value.room;t.url=origin+'/?room='+encodeURIComponent(room);await page.navigate(t.url);
    await t.waitFor('!!window.__diceDebug?.netReady',{timeout:30000});await t.waitOnline();await t.settle();
    await t.dbg('holdClock(true)');
    return {table:t,browser,room,async close(){await browser.close();}};
  } catch(error){await browser.close();throw error;}
}
export async function cookieAttributes(t){
  const result=await t.page.browser.send('Network.getCookies',{urls:[new URL(t.url).origin]},t.page.sessionId);
  const cookie=result.cookies.find(c=>c.name==='__Host-dice-account');assert.ok(cookie);
  assert.equal(cookie.secure,true);assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,'Lax');assert.equal(cookie.path,'/');
  assert.equal(cookie.domain,new URL(t.url).hostname);
  assert.equal(await t.eval('document.cookie.includes("__Host-dice-account=")'),false);
  return {name:cookie.name,secure:cookie.secure,httpOnly:cookie.httpOnly,sameSite:cookie.sameSite,path:cookie.path};
}
