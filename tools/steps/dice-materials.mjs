/*
Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0
*/

// Compare with: node tools/drive.mjs tools/steps/dice-materials.mjs before|after
// CHROME_BIN may select a wrapper adding --enable-gpu. The measured backend,
// not the requested flag, determines whether this is a hardware measurement.
// Own ephemeral server; no live preview. The JSON retains exact hull, render
// shape, face-local UV and per-face channel hashes beside measured draw calls.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export default async function run(stage, args) {
  const label = args[0] || 'after';
  const dir = stage.out(`dice-materials-${label}`);
  mkdirSync(dir, { recursive: true });
  const table = await stage.tab('localhost', 'Materials');
  await table.dbg("setSystem('none')");
  await table.waitFor("window.__diceDebug.system === 'none'");
  await table.dbg("setDiceSet('std')");
  const warnings=[];
  table.page.browser.on('Runtime.consoleAPICalled',p=>{if(p.type==='warning')warnings.push(p.args.map(a=>a.description||a.value).join(' '));},table.page.sessionId);
  const assets = await table.eval(`(async () => {
    const THREE = await import('three');
    const D = await import('/js/dice.js');
    const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      typeof value === 'string' ? new TextEncoder().encode(value) : value))).map(v => v.toString(16).padStart(2,'0')).join('');
    const rows = [];
    const samples = [['std',D.DIE_TYPES], ['shroud',['d6','d20']],
      ['tidewrack.seaglass',['d6','d20']], ['emberforge.blackanvil',['d6','d20']],
      ['rimehold.deepglacier',['d6']], ['symbols.monster',['d6']], ['symbols.fate',['d6']]];
    for (const [variant, types] of samples) for (const type of types) {
      const at = performance.now(); const die = D.getDie(type, variant);
      const buildMs = performance.now() - at;
      const g = die.geometry, atlas = g.userData.faceAtlas;
      const textures = [...new Set(die.materials.flatMap(m => [m.map,m.normalMap,m.emissiveMap,m.roughnessMap]).filter(Boolean))];
      const channels = {};
      for (const channel of ['map','normalMap','emissiveMap','roughnessMap']) {
        if (!die.materials[0][channel]) continue;
        channels[channel] = [];
        for (let f=0;f<die.faces.length;f++) {
          const c = atlas ? die.materials[0][channel].image : die.materials[f][channel].image;
          const x = atlas ? (f % atlas.columns) * atlas.cellSize + atlas.padding : 0;
          const y = atlas ? Math.floor(f / atlas.columns) * atlas.cellSize + atlas.padding : 0;
          channels[channel].push(await hash(c.getContext('2d').getImageData(x,y,256,256).data));
        }
      }
      rows.push({type,variant,buildMs,groups:g.groups.length,materials:die.materials.length,
        textureCount:textures.length,textureBytes:textures.reduce((n,t)=>n+t.image.width*t.image.height*4,0),
        vertices:g.attributes.position.count,geometryBytes:Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0),
        positions:await hash(g.attributes.position.array),normals:await hash(g.attributes.normal.array),
        faceUv:await hash(g.attributes.uv.array),
        hull:await hash(JSON.stringify({vertices:die.shape.vertices,faces:die.shape.faces,values:die.faces.map(f=>f.value),vertexValues:die.vertexValues})),
        channels});
    }
    return rows;
  })()`);
  const workloads = [];
  for (const [name,width,height] of (args.includes('look') ? [] : [['desktop',1440,900],['phone',390,844]])) {
    await table.page.browser.send('Emulation.setDeviceMetricsOverride',
      {width,height,deviceScaleFactor:1,mobile:name==='phone'}, table.page.sessionId);
    await table.eval('window.dispatchEvent(new Event("resize"))');
    await table.emulateCoarsePointer(name==='phone');
    await table.dbg(`setPanelState({pools:${name!=='phone'}})`);
    for (const [count,type] of [[4,'d6'],[40,'d20']]) {
      await table.dbg('clearTable()');
      await table.settle();
      const measured = await table.eval(`(async () => {
        const d=window.__diceDebug;
        const ticks=[],tasks=[];
        const obs=new PerformanceObserver(l=>tasks.push(...l.getEntries().map(e=>e.duration)));
        obs.observe({type:'longtask'});
        let start=performance.now(),last=start;
        const sample=new Promise(resolve=>{const tick=now=>{ticks.push(now-last);last=now;
          if(now-start<2200)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
        const a=performance.now();d.throwSeeded(${JSON.stringify(Array(count).fill(type))},90090);
        const throwMs=performance.now()-a;await sample;obs.disconnect();
        const gl=document.querySelector('canvas').getContext('webgl2');
        const ext=gl&&gl.getExtension('WEBGL_debug_renderer_info');
        return {throwMs,ticks:ticks.slice(1),tasks,backend:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',flight:d.renderAudit()};
      })()`);
      await table.settle();
      await table.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const rest = await table.dbg('renderAudit()');
      if (!rest.calls) throw new Error('No rendered calls: the graphics baseline is not armed');
      const film = await table.eval(`(async()=>{const k=window.__diceDebug.currentRoll.keyframes;
        const b=new TextEncoder().encode(JSON.stringify(k));
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(v=>v.toString(16).padStart(2,'0')).join('');})()`);
      workloads.push({name,width,height,count,type,...measured,rest,film,framing:await table.dbg('framingInfo()')});
      await stage.shot(table, `${dir}/${name}-${count}${type}.png`);
      console.log(`${label} ${name} ${count}${type}: calls ${rest.calls}, throw ${measured.throwMs.toFixed(2)} ms, ${measured.backend}`);
    }
  }
  await table.dbg('clearTable()');
  await table.settle();
  const shared=[];
  if(!args.includes('look')) for (const [name,width,height] of [['desktop',1440,900],['phone',390,844]]) {
    await table.page.browser.send('Emulation.setDeviceMetricsOverride',
      {width,height,deviceScaleFactor:1,mobile:name==='phone'},table.page.sessionId);
    await table.emulateCoarsePointer(name==='phone');
    await table.dbg(`setPanelState({pools:${name!=='phone'}})`);
    for(const notation of ['4d6','40d20']) {
      await table.dbg('clearTable()');await table.settle();
      const sample=await table.eval(`(async()=>{
        const ticks=[],tasks=[];let last=performance.now(),start=last;
        const observer=new PerformanceObserver(l=>tasks.push(...l.getEntries().map(e=>e.duration)));
        observer.observe({type:'longtask'});
        window.__diceDebug.commandRoll(${JSON.stringify(notation)});
        await new Promise(resolve=>{const step=now=>{ticks.push(now-last);last=now;
          if(now-start<2200)requestAnimationFrame(step);else resolve();};requestAnimationFrame(step);});
        observer.disconnect();return {ticks:ticks.slice(1),tasks};
      })()`);
      await table.settle();
      await table.eval('new Promise(r=>setTimeout(r,350))');
      const framing=await table.dbg('framingInfo()');
      shared.push({name,notation,...sample,framing,render:await table.dbg('renderAudit()')});
      console.log('SHARED '+JSON.stringify({name,notation,calls:shared.at(-1).render.calls,onScreen:framing.diceOnScreen}));
      await stage.shot(table,`${dir}/shared-${name}-${notation}.png`);
    }
  }
  await table.page.browser.send('Emulation.setDeviceMetricsOverride',
    {width:1200,height:850,deviceScaleFactor:1,mobile:false},table.page.sessionId);
  await table.eval(`(async()=>{
    const THREE=await import('three'); const D=await import('/js/dice.js');
    D.SHADER_TIME.value=1.25;
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(1200,850);renderer.setPixelRatio(1);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#182126');
    scene.add(new THREE.HemisphereLight(0xffffff,0x293340,3));
    const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(2,4,8);scene.add(light);
    const camera=new THREE.PerspectiveCamera(36,1200/850,.1,100);camera.position.set(0,0,19);
    const ids=['std','shroud','tidewrack.seaglass','emberforge.blackanvil','symbols.monster','symbols.fate'];
    for(let row=0;row<ids.length;row++)for(let col=0;col<3;col++){
      const type=['d6','d12','d20'][col],mesh=D.createDieMesh(type,ids[row]);
      mesh.position.set((col-1)*4,(2.5-row)*1.65,0);mesh.scale.setScalar(.65);
      const face=D.faceNormalForValue(type,type==='d6'?6:type==='d12'?12:20);
      mesh.quaternion.setFromUnitVectors(face.normalize(),new THREE.Vector3(.2,.3,1).normalize());
      mesh.onAfterRender=()=>{const e=renderer.getContext().getError();if(e)console.error(ids[row],type,e);};scene.add(mesh);
    }
    renderer.render(scene,camera);renderer.domElement.style='position:fixed;inset:0;z-index:99999';
    document.body.appendChild(renderer.domElement);
  })()`);
  await stage.shot(table, `${dir}/materials.png`);
  const reference = args.find(arg=>arg.startsWith('--compare='));
  if(reference) {
    const before=JSON.parse(readFileSync(reference.slice('--compare='.length),'utf8'));
    assert.equal(assets.length,before.assets.length);
    for(let i=0;i<assets.length;i++)for(const key of ['type','variant','positions','normals','faceUv','hull','channels']) {
      assert.deepEqual(assets[i][key],before.assets[i][key],`${assets[i].variant}/${assets[i].type}: ${key}`);
    }
    assert.equal(workloads.length,before.workloads.length);
    for(let i=0;i<workloads.length;i++)assert.equal(workloads[i].film,before.workloads[i].film,'seeded film must remain identical');
  }
  assert.deepEqual(table.page.errors,[]);
  assert.deepEqual(table.page.consoleErrors,[]);
  console.log(JSON.stringify({errors:table.page.errors,consoleErrors:table.page.consoleErrors,warnings}));
  writeFileSync(`${dir}/report.json`,JSON.stringify({label,
    scope:'workloads uses legacy throwSeeded for identical-film proof; its unstamped dice may be offscreen. shared records visible authored rolls with fresh server seeds, so timings and stress framing vary between runs.',
    assets,workloads,shared,errors:table.page.errors,consoleErrors:table.page.consoleErrors},null,2));
  console.log(`Saved ${dir}/report.json and screenshots.`);
}
