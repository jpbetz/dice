/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// A guest-only frontend release check. No account registration/recovery or writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Browser} from '../tests/e2e/cdp.mjs';
import {Table} from '../tests/e2e/harness.mjs';
import {click,type,key} from '../tests/fixtures/visible-input.mjs';
import {frameScreenshot} from './staging-account-browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const theme='tidewrack.seaglass';
const dieTypes=['d4','d6','d8','d10','d10x','d12','d20'];
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const now=()=>new Date().toISOString();
const paletteReady=`(()=>{const images=[...document.querySelectorAll('#die-buttons .die-art')];return images.length===8&&images.every(img=>img.dataset.artState==='ready'&&img.complete&&img.naturalWidth);})()`;

export function validateOptions({origin,sha,journal,allowLocal=false}){
  const u=new URL(origin),local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  assert.equal(u.origin,origin,'pass an exact origin without a path');
  assert.equal(u.username+u.password,'');assert.notEqual(u.port,'8123');
  assert.ok(u.protocol==='https:'||(allowLocal&&local&&u.protocol==='http:'),'HTTPS required outside explicit local mode');
  assert.ok(!local||allowLocal,'loopback needs explicit local mode');
  assert.ok(!allowLocal||local,'local mode never accepts a remote target');
  assert.ok(!u.port||(allowLocal&&local),'remote HTTPS uses its canonical port');
  assert.match(sha,/^[a-f0-9]{40}$/,'exact full reviewed source SHA required');
  assert.ok(path.isAbsolute(journal)&&path.resolve(journal)===journal&&!journal.startsWith(root),'journal must be outside the checkout');
}
export function validateStatus(status,httpStatus){
  assert.equal(httpStatus,200);assert.equal(status.enabled,true);assert.equal(status.available,true);
  assert.ok(Array.isArray(status.capabilities));
  for(const capability of ['library','homes','people','presence'])assert.ok(status.capabilities.includes(capability));
}
async function reserveJournal(file){
  const dir=path.dirname(file);await fs.mkdir(dir,{recursive:true,mode:0o700});
  const info=await fs.lstat(dir);
  assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0,'use a private journal directory');
  assert.ok(!(await fs.realpath(dir)).startsWith(root));
  const handle=await fs.open(file,'wx',0o600);await handle.close();
}
async function persist(file,state){
  const tmp=file+'.'+process.pid+'.tmp';let handle;
  try{
    handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(JSON.stringify(state));await handle.sync();await handle.close();handle=null;
    await fs.rename(tmp,file);const dir=await fs.open(path.dirname(file),'r');try{await dir.sync();}finally{await dir.close();}
  }finally{await handle?.close();await fs.rm(tmp,{force:true});}
}

// Observe actual submitted moving mesh vertices without advancing the app clock.
const observe=`(()=>{
  const seen=window.__frontendSmoke={moving:{},lastFrame:0};
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=fn=>raf(time=>{
    fn(time);const d=window.__diceDebug,r=d?.currentRoll;
    if(!r||r.done||r.baking||!r.time||seen.moving[r.rollId])return;
    const frame=d.renderAudit().frame;if(frame===seen.lastFrame)return;seen.lastFrame=frame;
    const f=d.phoneFrame(),v=f.view,dice=f.dice.filter(x=>x.rollId===r.rollId);
    if(!dice.length)return;
    const visible=dice.filter(x=>x.right>v.left&&x.left<v.left+v.width&&x.bottom>v.top&&x.top<v.top+v.height);
    if(visible.some(x=>document.elementFromPoint(Math.max(v.left,Math.min(v.left+v.width,(x.left+x.right)/2)),Math.max(v.top,Math.min(v.top+v.height,(x.top+x.bottom)/2)))?.tagName==='CANVAS'))
      seen.moving[r.rollId]={frame,view:v,dice:visible};
  });
})();`;

export async function verifyFrontend({origin,sha,journal,allowLocal=false,checkpoint=()=>{}}){
  validateOptions({origin,sha,journal,allowLocal});await reserveJournal(journal);
  const state={copyright:'Copyright 2026 The Dice Table Authors',license:'Apache-2.0',schema:1,
    kind:'frontend-guest-https-smoke',ok:false,phase:'running',origin,sourceSha:sha,startedAt:now(),checks:[],images:[],
    accountMutations:[],viewport:{width:390,height:844,deviceScaleFactor:1,mobileEmulation:true},
    scope:'Guest frontend behavior on one source SHA. Natural playback, no performance benchmark, account recovery, process-replacement or physical-device claim.'};
  const sessions=[];let stage='health';
  const save=()=>persist(journal,state);
  const mark=async name=>{state.checks.push({name,completedAt:now()});await save();checkpoint(name);};
  const readStatus=async()=>{
    const response=await fetch(origin+'/api/account/status',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const value=await response.json();validateStatus(value,response.status);
    return {httpStatus:response.status,enabled:value.enabled,available:value.available,capabilities:value.capabilities};
  };
  const health=async()=>{
    const response=await fetch(origin+'/health',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200);const value=await response.json();assert.equal(value.sha,sha,'expected released SHA');return {sha:value.sha};
  };
  const fresh=async(name,room)=>{
    const browser=new Browser();const session={browser,table:null,responses:[]};sessions.push(session);await browser.launch();
    const page=await browser.newPage();
    const cdp=(method,args={})=>browser.send(method,args,page.sessionId);
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await cdp('Network.enable');
    browser.on('Network.requestWillBeSent',event=>{
      const u=new URL(event.request.url);
      if(u.origin===origin&&u.pathname.startsWith('/api/account/')&&!['GET','HEAD'].includes(event.request.method))
        state.accountMutations.push({method:event.request.method,path:u.pathname});
    },page.sessionId);
    browser.on('Network.responseReceived',event=>{
      const r=event.response,u=new URL(r.url);
      if(u.origin===origin&&(u.pathname.startsWith('/models/dice-art/')||['/js/dice.js','/js/diceart.js','/js/diceart-ui.js','/js/diceart-manifest.js'].includes(u.pathname)))
        session.responses.push({path:u.pathname,status:r.status,mime:r.mimeType});
    },page.sessionId);
    await page.addInitScript(`window.__diceTestMode=true;localStorage.setItem('dice.schema.v1','2');localStorage.setItem('dice.name.v1',${JSON.stringify(name)});${observe}`);
    const url=origin+'/?room='+encodeURIComponent(room);session.table=new Table(page,url);await page.navigate(url);
    const t=session.table;await t.waitFor('window.__diceDebug?.net?.online===true',{timeout:60000});
    assert.equal(await t.eval(`fetch('/api/account/session').then(r=>{if(r.status!==200)throw new Error('session GET failed');return r.json()}).then(s=>s.person)`),null);
    assert.equal(await t.dbg('privateLibrary.state?.person??null'),null);
    return t;
  };
  const shot=async(t,name,selector)=>{
    await frameScreenshot(t,selector);
    const directory=journal+'.images';await fs.mkdir(directory,{mode:0o700,recursive:true});
    const info=await fs.lstat(directory);assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0);
    const file=path.join(directory,name+'.png');await fs.writeFile(file,'',{flag:'wx',mode:0o600});await t.page.screenshot(file);
    state.images.push({name,file:path.relative(path.dirname(journal),file)});await save();
  };
  const auditArt=async t=>{
    const info=await t.dbg('dieArtInfo()');assert.equal(info.contexts,0);assert.equal(info.renders,0);assert.equal(info.rendererActive,false);return info;
  };
  const palette=async(t,variant)=>{
    await t.waitFor(paletteReady,{timeout:60000});
    const rows=await t.eval(`[...document.querySelectorAll('#die-buttons .die-art')].map(img=>({type:img.dataset.artType,path:new URL(img.src).pathname,width:img.naturalWidth}))`);
    assert.equal(rows.length,8);
    for(const row of rows){assert.equal(row.path,'/models/dice-art/'+variant+'.'+row.type+'.webp');assert.equal(row.width,192);}
    assert.equal(new Set(rows.map(r=>r.path)).size,7,'d100 reuses d10x');
    const session=sessions.find(s=>s.table===t);
    for(const type of dieTypes)assert.ok(session.responses.some(r=>r.path===`/models/dice-art/${variant}.${type}.webp`&&r.status===200&&r.mime==='image/webp'),'actual successful WebP response');
    return {rows,art:await auditArt(t)};
  };
  const settledView=async(t,id)=>{
    await t.page.browser.send('Page.bringToFront',{},t.page.sessionId);
    await t.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const frame=await t.dbg('phoneFrame()'),dice=frame.dice.filter(d=>d.rollId===id),v=frame.view;
    assert.equal(frame.busy,false);assert.equal(dice.length,4);
    for(const d of dice){assert.ok(d.left>=v.left-1&&d.right<=v.left+v.width+1&&d.top>=v.top-1&&d.bottom<=v.top+v.height+1,'actual settled mesh vertices stay inside the scene');}
    assert.equal(await t.eval(`(${JSON.stringify(dice)}).every(d=>document.elementFromPoint((d.left+d.right)/2,(d.top+d.bottom)/2)?.tagName==='CANVAS')`),true,'settled dice are not covered by controls');
    const selector=`#table-results .result-seat[data-roll-id="${id}"]`;
    await frameScreenshot(t,selector);
    const read=await t.eval(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});return {text:b.textContent,value:b.querySelector('.result-seat-value').textContent,faces:[...b.querySelectorAll('.result-face')].map(x=>x.dataset.face),label:b.getAttribute('aria-label')};})()`);
    return {frame,read};
  };
  await save();
  try{
    state.healthBefore=await health();state.statusBefore=await readStatus();await mark('exact_source_and_enabled_status');
    stage='fresh_guest_quick_roll';
    const name='Frontend fixture '+crypto.randomBytes(4).toString('hex');
    const response=await fetch(origin+'/api/new-room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name}),signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200);const room=(await response.json()).room;assert.match(room,/^g_/);state.room=room;await save();
    const a=await fresh('Alice',room);
    state.startupArt=await auditArt(a);assert.equal(state.startupArt.assetRequests,0);
    assert.equal(sessions[0].responses.filter(r=>r.path.startsWith('/models/dice-art/')).length,0);
    await click(a,'#phone-quick-dice [data-quick="2d6"]');
    await a.waitFor('Object.keys(window.__frontendSmoke.moving).length===1',{timeout:60000});
    const quick=await a.rollId();state.quickMoving=await a.eval(`__frontendSmoke.moving[${JSON.stringify(quick)}]`);
    await shot(a,'quick-2d6-moving');await a.waitFor('window.__diceDebug.currentRoll?.done',{timeout:60000});
    assert.equal((await a.entryState(quick)).values.length,2);await auditArt(a);await mark('quick_2d6_natural_playback_without_portrait_warmup');

    stage='built_in_portrait_controls';
    const cdp=(method,args={})=>a.page.browser.send(method,args,a.page.sessionId);
    await cdp('Fetch.enable',{patterns:[{urlPattern:'*/models/dice-art/*',requestStage:'Request'}]});
    await click(a,'#phone-build-roll');await a.waitFor(`document.querySelector('#die-buttons .die-art')?.dataset.artState==='loading'`);
    const rect=await a.eval(`document.querySelector('#die-buttons .die-btn').getBoundingClientRect().toJSON()`);
    await shot(a,'builder-portraits-pending','#die-buttons');await cdp('Fetch.disable');
    state.standard=await palette(a,'std');
    const loaded=await a.eval(`document.querySelector('#die-buttons .die-btn').getBoundingClientRect().toJSON()`);
    assert.equal(loaded.width,rect.width);assert.equal(loaded.height,rect.height);
    assert.equal(state.standard.art.assets,7);assert.equal(state.standard.art.assetRequests,7);
    await click(a,'#my-dice');await a.waitFor('window.__diceDebug.diceGallery.open');
    await type(a,'#dg-search','Sea-glass');await click(a,`.dg-card[data-set="${theme}"]`);
    await click(a,'.dg-use');assert.equal(await a.dbg('diceSet'),theme);await click(a,'.dg-close');
    state.themed=await palette(a,theme);assert.equal(state.themed.art.assetRequests,14);await shot(a,'builder-seaglass','#die-buttons');
    await click(a,'#workspace-back');await mark('visible_built_in_webp_portraits_and_stable_controls');

    stage='two_viewer_shared_4d20';
    const b=await fresh('Bob',room);await b.waitFor('!window.__diceDebug.currentRoll||window.__diceDebug.currentRoll.done',{timeout:60000});
    await click(a,'#phone-build-roll');
    if(await a.eval(`document.querySelector('#section-bar [data-sec="notation"]').getAttribute('aria-pressed')==='false'`))await click(a,'#section-bar [data-sec="notation"]');
    await type(a,'#cmd-input','4d20');await key(a,'Enter','Enter',13);
    await a.waitFor(`window.__diceDebug.currentRoll?.rollId!==${JSON.stringify(quick)}&&window.__diceDebug.currentRoll?.done`,{timeout:60000});
    const id=await a.rollId();await b.waitFor(`window.__diceDebug.currentRoll?.rollId===${JSON.stringify(id)}&&window.__diceDebug.currentRoll.done`,{timeout:60000});
    assert.equal(await a.dbg('workspaces.current'),null,'Roll closes its own task');
    const ea=await a.entryState(id),eb=await b.entryState(id);assert.deepEqual(ea.values,eb.values);assert.equal(ea.values.length,4);
    const ka=await a.eval('window.__diceDebug.currentRoll.keyframes'),kb=await b.eval('window.__diceDebug.currentRoll.keyframes');
    assert.ok(Array.isArray(ka)&&ka.length);assert.deepEqual(ka,kb);
    state.shared={values:ea.values,total:ea.total,filmSha256:sha256(JSON.stringify(ka)),keyframeDice:ka.length,views:[]};
    for(const [who,t] of [['alice',a],['bob',b]]){
      const view=await settledView(t,id);assert.equal(view.read.value,String(ea.total));assert.deepEqual(view.read.faces,ea.values.map(String));
      state.shared.views.push({who,...view});await shot(t,'shared-4d20-'+who);await auditArt(t);
    }
    await mark('two_viewers_share_complete_4d20_film_and_readable_result');
    stage='final_guest_and_source_check';
    for(const session of sessions){
      assert.deepEqual(session.table.page.errors,[]);assert.deepEqual(session.table.page.consoleErrors,[]);
      assert.equal(await session.table.dbg('privateLibrary.state?.person??null'),null);
      const cookies=await session.browser.send('Network.getCookies',{urls:[origin]},session.table.page.sessionId);
      assert.ok(!cookies.cookies.some(c=>c.name==='__Host-dice-account'||c.name==='dice-account-local'));
    }
    assert.deepEqual(state.accountMutations,[]);
    for(const module of ['/js/dice.js','/js/diceart.js','/js/diceart-ui.js','/js/diceart-manifest.js'])
      assert.ok(sessions[0].responses.some(r=>r.path===module&&r.status===200),'changed frontend module actually loaded');
    state.resources=sessions.map(s=>s.responses);state.healthAfter=await health();state.statusAfter=await readStatus();
    await mark('accounts_untouched_and_expected_source_retained');state.ok=true;state.phase='complete';state.completedAt=now();await save();
  }catch(error){
    state.ok=false;state.phase='failed';state.lastFailure={stage,cause:{name:String(error?.name||'Error').slice(0,100),message:String(error?.message||error).slice(0,4000),stack:String(error?.stack||'').slice(0,8000)}};
    await save();throw Object.assign(new Error('Frontend HTTPS smoke failed'),{stage});
  }finally{
    const closed=await Promise.allSettled(sessions.map(s=>s.browser.close()));
    state.cleanup={ownedBrowsersClosed:closed.every(r=>r.status==='fulfilled'),completedAt:now()};
    if(!state.cleanup.ownedBrowsersClosed&&state.phase==='complete'){
      state.ok=false;state.phase='failed';state.lastFailure={stage:'browser_cleanup',cause:{message:'Owned browser cleanup failed'}};
      await save();throw Object.assign(new Error('Frontend HTTPS smoke cleanup failed'),{stage:'browser_cleanup'});
    }
    await save();
  }
  return {ok:true,sourceSha:sha,checks:state.checks.map(c=>c.name),accountMutations:0,images:state.images.length,scope:state.scope};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    const options={},args=process.argv.slice(2);let mode=null;
    for(let i=0;i<args.length;i++){
      if(['--run','--check'].includes(args[i])){assert.equal(mode,null);mode=args[i];}
      else if(args[i]==='--local')options.allowLocal=true;
      else {const key=args[i].slice(2);assert.ok(['origin','sha','journal'].includes(key)&&args[i].startsWith('--')&&!Object.hasOwn(options,key));options[key]=args[++i];}
    }
    validateOptions(options);
    if(mode==='--run')console.log(JSON.stringify(await verifyFrontend({...options,checkpoint:check=>console.log(JSON.stringify({check}))})));
    else console.log(JSON.stringify({ok:true,networkRequests:0,runExecuted:false}));
  }catch(error){console.log(JSON.stringify({ok:false,stage:error.stage||'configuration'}));process.exitCode=1;}
}
