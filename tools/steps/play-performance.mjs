/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Ctx} from '../../tests/e2e/harness.mjs';
import {click} from '../../tests/fixtures/visible-input.mjs';

// Cold navigation and real pointer input on owned ephemeral tables. CPU
// throttling applies to the main target, not a model of an entire phone.
const observe=`(()=>{
  const p=window.__playProbe={tasks:[],clicks:[],frames:[],rolls:{},ready:null,stop:false};
  new PerformanceObserver(list=>p.tasks.push(...list.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask'});
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(button)p.clicks.push({id:button.id,quick:button.dataset.quick,pool:button.dataset.pool,workspace:button.dataset.workspace,at:performance.now(),queued:performance.now()-event.timeStamp});},true);
  const raf=window.requestAnimationFrame.bind(window);let lastFrame=0,previous=0;
  window.requestAnimationFrame=fn=>raf(time=>{
    fn(time);
    if(p.stop)return;
    const d=window.__diceDebug;if(!d?.netReady)return;
    const frame=d.renderAudit().frame;if(frame===lastFrame)return;lastFrame=frame;
    const at=performance.now();if(previous)p.frames.push({at,ms:at-previous});previous=at;
    const r=d.currentRoll;if(!r||r.done||r.baking)return;
    const row=p.rolls[r.rollId]||=( {prepared:at,time:r.time} );
    if(row.visible||!r.time)return;
    const f=d.phoneFrame?.();if(!f)return;const v=f.view;
    const visible=f.dice.filter(d=>d.rollId===r.rollId&&d.right>v.left&&d.left<v.left+v.width&&d.bottom>v.top&&d.top<v.top+v.height);
    if(visible.some(d=>{const x=Math.max(v.left,Math.min(v.left+v.width,(d.left+d.right)/2)),y=Math.max(v.top,Math.min(v.top+v.height,(d.top+d.bottom)/2));return document.elementFromPoint(x,y)?.tagName==='CANVAS';})){
      row.visible=at;row.bounds=visible;row.view=v;
    }
  });
  function ready(){
    const d=window.__diceDebug,b=document.querySelector('#phone-quick-dice [data-quick="2d6"]');
    if(d?.net?.online&&b&&!b.disabled&&!b.closest('[inert]')){
      const r=b.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      if(r.width&&r.height&&(top===b||b.contains(top))){p.ready=performance.now();return;}
    }
    raf(ready);
  }raf(ready);
})();`;

function hot(profile){
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();
  for(let i=0;i<profile.samples.length;i++){
    const node=nodes.get(profile.samples[i]),f=node.callFrame,key=`${f.functionName||'(anonymous)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber+1}`;
    self.set(key,(self.get(key)||0)+(profile.timeDeltas[i]||0)/1000);
  }
  return [...self].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([fn,ms])=>({fn,ms:+ms.toFixed(1)}));
}
const quantile=(values,f)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*f))]||0;};

export default async function run(stage,args){
  const label=args[0]||'baseline',dir=stage.out(`play-performance-${label}`);mkdirSync(dir,{recursive:true});
  const cpu=Number(args.find(a=>a.startsWith('--cpu='))?.split('=')[1]||4),runs=Number(args.find(a=>a.startsWith('--runs='))?.split('=')[1]||1);
  const dpr=Number(args.find(a=>a.startsWith('--dpr='))?.split('=')[1]||1);
  const builderFirst=args.includes('--builder-first');
  const firstNotation=args.find(a=>a.startsWith('--first='))?.slice(8)||'2d6';
  const firstSet=args.find(a=>a.startsWith('--set='))?.slice(6)||'std';
  const incomingMixed=args.includes('--incoming-mixed');
  assert.ok(!builderFirst||firstNotation==='2d6','the builder-first path composes two d6');
  const network=args.includes('--network'),cases=args.includes('--plain')?['table']:args.includes('--copper')?['copper']:['table','copper'];
  const rows=[];
  for(const venue of cases)for(let sample=0;sample<runs;sample++){
    const ctx=new Ctx(stage.ctx.browser,stage.port,`perf-${label}-${venue}-${sample}`,stage.ctx.server);
    let page;
    const original=stage.ctx.browser.newPage.bind(stage.ctx.browser);
    stage.ctx.browser.newPage=async(...args)=>{
      page=await original(...args);const cdp=(method,input={})=>page.browser.send(method,input,page.sessionId);
      await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:dpr,mobile:true});
      await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      await cdp('Emulation.setCPUThrottlingRate',{rate:cpu});
      await cdp('Network.enable');await cdp('Network.setCacheDisabled',{cacheDisabled:true});
      if(network)await cdp('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:500000,uploadThroughput:125000,connectionType:'cellular4g'});
      await page.addInitScript(observe);
      await cdp('Profiler.enable');await cdp('Profiler.start');return page;
    };
    try{
      let peers=[];
      if(venue!=='table'){
        for(const name of ['Bram','Cora','Dev'])peers.push(await ctx.rawPlayer(name));
        await ctx.api('/api/settings',{playerId:peers[0].playerId,settings:{venue,tableName:'The Copper Lantern'}});
      }
      const a=await ctx.newTable({origin:`127.0.0.${(venue==='table'?180:200)+sample}`,name:'Alice'});
      const cdp=(method,input={})=>page.browser.send(method,input,page.sessionId);
      await a.waitFor('window.__playProbe.ready!==null',{timeout:60000});
      const bootProfile=(await cdp('Profiler.stop')).profile;
      writeFileSync(`${dir}/${venue}-${sample}-startup.cpuprofile`,JSON.stringify(bootProfile));
      const boot=await a.eval(`({ready:__playProbe.ready,tasks:__playProbe.tasks,paint:performance.getEntriesByType('paint').map(e=>({name:e.name,at:e.startTime})),resources:performance.getEntriesByType('resource').map(e=>({path:new URL(e.name).pathname,at:e.startTime,ms:e.duration,encoded:e.encodedBodySize,bytes:e.transferSize}))})`);
      if(firstSet!=='std')await a.dbg(`setDiceSet(${JSON.stringify(firstSet)})`);
      await cdp('Profiler.start');
      let coldBuilder=null;
      if(builderFirst){
        await click(a,'#phone-build-roll');
        const painted=await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(performance.now()))))');
        coldBuilder=await a.eval(`({painted:${painted},input:__playProbe.clicks.find(c=>c.id==='phone-build-roll')})`);
        await stage.shot(a,`${dir}/${venue}-${sample}-builder-first-frame.png`);
        await click(a,'#die-buttons .die-btn:nth-child(2)');
        await click(a,'#die-buttons .die-btn:nth-child(2)');
        await click(a,'#tray-roll');
        await a.waitFor('window.__diceDebug.workspaces.current===null');
      }else{
        const quick=`#phone-quick-dice [data-quick=${JSON.stringify(firstNotation)}]`;
        if(await a.eval(`!!document.querySelector(${JSON.stringify(quick)})`))await click(a,quick);
        else{
          await a.dbg(`setGroups([{name:'First roll',notation:${JSON.stringify(firstNotation)}}])`);
          await click(a,'#phone-saved-rolls .phone-pool');
        }
      }
      await a.waitFor('Object.values(__playProbe.rolls).some(r=>r.visible)',{timeout:60000});
      await stage.shot(a,`${dir}/${venue}-${sample}-first-roll.png`);
      // Natural playback; settle() advances the simulation and is unsuitable
      // for real frame timing.
      await a.waitFor('window.__diceDebug.currentRoll?.done',{timeout:60000});
      const rollProfile=(await cdp('Profiler.stop')).profile;
      writeFileSync(`${dir}/${venue}-${sample}-first-roll.cpuprofile`,JSON.stringify(rollProfile));
      const first=await a.eval(`(()=>{const p=__playProbe,input=p.clicks.find(c=>c.quick===${JSON.stringify(firstNotation)}||c.pool||c.id==='tray-roll'),roll=Object.values(p.rolls)[0];return {input,roll,tasks:p.tasks.filter(t=>t.at>=input.at),frames:p.frames.filter(f=>f.at>=input.at),film:window.__diceDebug.filmWorker.last,resources:performance.getEntriesByType('resource').filter(r=>r.startTime>input.at).map(r=>({path:new URL(r.name).pathname,ms:r.duration,encoded:r.encodedBodySize})),render:window.__diceDebug.renderAudit()};})()`);
      if(!peers.length)for(const name of ['Bram','Cora','Dev'])peers.push(await ctx.rawPlayer(name));
      await a.dbg(`setGroups(Array.from({length:12},(_,i)=>({name:'Check '+(i+1),notation:i%2?'1d20+4':'2d6'})))`);
      await cdp('Profiler.start');const activityAt=await a.eval('performance.now()');
      await ctx.api('/api/roll',{playerId:peers[0].playerId,notation:'8d6'});
      await a.waitFor('window.__diceDebug.currentRoll?.playerName==="Bram"');
      await click(a,'#phone-build-roll');
      await a.waitFor('window.__diceDebug.workspaces.current==="dice"');
      const builderPainted=await a.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(performance.now()))))');
      await a.waitFor(`(()=>{const images=[...document.querySelectorAll('#die-buttons .die-art')];return images.length===8&&images.every(img=>img.getAttribute('src')&&img.complete&&img.naturalWidth);})()`,{timeout:60000});
      const builder=await a.eval(`({painted:${builderPainted},artReady:performance.now(),input:__playProbe.clicks.filter(c=>c.id==='phone-build-roll').at(-1),audit:window.__diceDebug.dieArtInfo?.()})`);
      await stage.shot(a,`${dir}/${venue}-${sample}-builder-art.png`);
      await click(a,'#workspace-back');
      await ctx.api('/api/roll',{playerId:peers[1].playerId,notation:'4d20',
        ...(incomingMixed?{sets:['std','classics.ivory','tidewrack.seaglass','symbols.monster']}:{})});
      await a.waitFor('window.__diceDebug.currentRoll?.playerName==="Cora"&&window.__diceDebug.currentRoll.done',{timeout:60000});
      const activityProfile=(await cdp('Profiler.stop')).profile;
      writeFileSync(`${dir}/${venue}-${sample}-activity.cpuprofile`,JSON.stringify(activityProfile));
      const activity=await a.eval(`({tasks:__playProbe.tasks.filter(t=>t.at>=${activityAt}),frames:__playProbe.frames.filter(f=>f.at>=${activityAt}),clicks:__playProbe.clicks.filter(c=>c.at>=${activityAt}),layout:{width:innerWidth,height:innerHeight,scrollY,visual:{height:visualViewport.height,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale},controls:['phone-more','phone-build-roll'].map(id=>({id,rect:document.getElementById(id).getBoundingClientRect().toJSON()}))}})`);
      const backend=await a.eval(`(()=>{const gl=document.querySelector('#scene-container canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';})()`);
      await a.eval('__playProbe.stop=true');await stage.shot(a,`${dir}/${venue}-${sample}-four-players.png`);
      await cdp('Profiler.start');const appearanceAt=await a.eval('performance.now()');
      await click(a,'#table-open');await click(a,'#snav-staging');
      if(venue!=='table')await click(a,'[data-venue="table"]');
      const appearanceReady=await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()))))');
      await a.eval("document.getElementById('felt-swatches').scrollIntoView({block:'center'})");
      await a.waitFor(`[...document.querySelectorAll('#felt-swatches .swatch-dot')].every(el=>el.style.backgroundImage)`,{timeout:60000});
      const appearanceProfile=(await cdp('Profiler.stop')).profile;
      writeFileSync(`${dir}/${venue}-${sample}-appearance.cpuprofile`,JSON.stringify(appearanceProfile));
      const appearance=await a.eval(`({ready:${appearanceReady},at:${appearanceAt},complete:performance.now(),tasks:__playProbe.tasks.filter(t=>t.at>=${appearanceAt}),clicks:__playProbe.clicks.filter(c=>c.at>=${appearanceAt}),previewBytes:[...document.querySelectorAll('#felt-swatches .swatch-dot')].reduce((sum,d)=>sum+d.style.backgroundImage.length,0)})`);
      await stage.shot(a,`${dir}/${venue}-${sample}-appearance.png`);
      assert.deepEqual(page.errors,[]);
      const summary={venue,sample,cpu,dpr,builderFirst,firstNotation,firstSet,incomingMixed,network,backend,
        startupMs:boot.ready,startupLongestTask:Math.max(0,...boot.tasks.map(t=>t.ms)),
        firstVisibleMs:first.roll.visible-first.input.at,launchToDiceMs:first.roll.visible,
        firstLongestTask:Math.max(0,...first.tasks.map(t=>t.ms)),
        builderOpenMs:builder.painted-builder.input.at,builderArtMs:builder.artReady-builder.input.at,
        coldBuilderOpenMs:coldBuilder?coldBuilder.painted-coldBuilder.input.at:null,
        activityLongestTask:Math.max(0,...activity.tasks.map(t=>t.ms)),
        activityFrameP95:quantile(activity.frames.map(f=>f.ms),.95),
        appearanceLongestTask:Math.max(0,...appearance.tasks.map(t=>t.ms)),previewBytes:appearance.previewBytes};
      const result={...summary,boot,first,builder,coldBuilder,activity,appearance,hot:{boot:hot(bootProfile),first:hot(rollProfile),activity:hot(activityProfile),appearance:hot(appearanceProfile)}};
      rows.push(result);writeFileSync(`${dir}/report.json`,JSON.stringify(rows,null,2));
      console.log(JSON.stringify({...summary,hotBoot:result.hot.boot.slice(0,8),hotFirst:result.hot.first.slice(0,8),hotActivity:result.hot.activity.slice(0,8)}));
    }finally{stage.ctx.browser.newPage=original;await ctx.closeAll();}
  }
}
