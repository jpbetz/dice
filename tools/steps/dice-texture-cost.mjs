/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';

// Cold factory builds, including the actual canvas calls. This isolates the
// cause; play-performance.mjs measures the player's complete roll journey.
export default async function run(stage,args){
  const label=args[0]||'after',dir=stage.out(`dice-texture-${label}`);
  mkdirSync(dir,{recursive:true});
  const runs=Number(args.find(a=>a.startsWith('--runs='))?.split('=')[1]||3);
  const cpu=Number(args.find(a=>a.startsWith('--cpu='))?.split('=')[1]||4);
  const a=await stage.tab('localhost','Textures');
  await a.page.browser.send('Emulation.setCPUThrottlingRate',{rate:cpu},a.page.sessionId);
  const rows=await a.eval(`(async()=>{
    const D=await import('/js/dice.js'),T=await import('/js/themes.js');
    const custom=structuredClone(T.SETS['emberforge.blackanvil']);delete custom.shader;
    T.registerSet('test.texture',custom);
    const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      typeof value==='string'?new TextEncoder().encode(value):value))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const cases=[...D.DIE_TYPES.map(t=>['std',t]),['shroud','d20'],
      ['classics.ivory','d20'],['tidewrack.seaglass','d20'],['symbols.monster','d6'],
      ['test.texture','d20'],['emberforge.blackanvil','d20']];
    const rows=[];
    for(let sample=0;sample<${runs};sample++)for(const [variant,type] of cases){
      D.bustDie(variant);
      const original=CanvasRenderingContext2D.prototype.drawImage;
      const copies={selfCalls:0,selfMs:0,otherCalls:0,otherMs:0};
      CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
        const self=source===this.canvas,start=performance.now();
        const result=original.call(this,source,...args);
        copies[self?'selfCalls':'otherCalls']++;
        copies[self?'selfMs':'otherMs']+=performance.now()-start;
        return result;
      };
      let die,buildMs;const at=performance.now();
      try{die=D.getDie(type,variant);buildMs=performance.now()-at;}
      finally{CanvasRenderingContext2D.prototype.drawImage=original;}
      const g=die.geometry,channels={},textures=new Set();
      for(const name of ['map','normalMap','emissiveMap','roughnessMap']){
        const maps=[...new Set(die.materials.map(m=>m[name]).filter(Boolean))];
        if(!maps.length)continue;
        channels[name]=[];
        for(const texture of maps){
          textures.add(texture);const c=texture.image;
          channels[name].push({width:c.width,height:c.height,hash:await hash(c.getContext('2d').getImageData(0,0,c.width,c.height).data)});
        }
      }
      const shape={};
      for(const attr of ['position','normal','uv','uv1'])if(g.attributes[attr])shape[attr]=await hash(g.attributes[attr].array);
      const hull=await hash(JSON.stringify({vertices:die.shape.vertices,faces:die.shape.faces,values:die.faces.map(f=>f.value),vertexValues:die.vertexValues}));
      rows.push({sample,variant,type,buildMs,copies,groups:g.groups,shape,hull,channels,
        textureBytes:[...textures].reduce((n,t)=>n+t.image.width*t.image.height*4,0)});
    }
    D.bustDie('test.texture');delete T.SETS['test.texture'];return rows;
  })()`);
  const compare=args.find(a=>a.startsWith('--compare='));
  if(compare){
    const before=JSON.parse(readFileSync(compare.slice(10),'utf8'));
    assert.equal(rows.length,before.rows.length);
    rows.forEach((row,i)=>{
      for(const key of ['variant','type','groups','shape','hull','channels','textureBytes'])assert.deepEqual(row[key],before.rows[i][key],`${row.variant}/${row.type}: ${key}`);
    });
  }
  const backend=await a.eval(`(()=>{const gl=document.querySelector('#scene-container canvas').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown';})()`);
  writeFileSync(`${dir}/report.json`,JSON.stringify({label,cpu,backend,rows},null,2));
  for(const row of rows)console.log(JSON.stringify({sample:row.sample,variant:row.variant,type:row.type,ms:+row.buildMs.toFixed(1),copies:row.copies}));
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(a.page.consoleErrors,[]);
}
