/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';

// Explicit offline validation of the live renderer before updating its baked
// portrait source fingerprint. This does not alter or warm runtime startup.
export default async function(stage,args) {
  const label=args[0]||'after',dir=stage.out(`dice-portrait-parity-${label}`);
  mkdirSync(dir,{recursive:true});
  const a=await stage.tab('localhost','Portrait parity');
  const ids=await a.eval(`(async()=>{const T=await import('/js/themes.js');return ['std','shroud',...Object.keys(T.SETS)];})()`);
  const rows=[];
  for(const id of ids){
    const data=await a.eval(`(async()=>{
      const A=await import('/js/diceart.js'),D=await import('/js/dice.js');
      A.bustArt(${JSON.stringify(id)});const rows=[];
      for(const type of D.DIE_TYPES){
        D.SHADER_TIME.value=1.25;
        const url=A.dieArtURL(type,${JSON.stringify(id)});
        if(!url)throw new Error('No live portrait');rows.push({type,url});
      }
      A.releaseDieArtRenderer();A.bustArt(${JSON.stringify(id)});
      if(${JSON.stringify(id)}!=='std')D.bustDie(${JSON.stringify(id)});
      return rows;
    })()`);
    for(const {type,url} of data)rows.push({id,type,pngSha256:createHash('sha256').update(Buffer.from(url.split(',')[1],'base64')).digest('hex')});
  }
  const reference=args.find(x=>x.startsWith('--compare='));
  if(reference)assert.deepEqual(rows,JSON.parse(readFileSync(reference.slice(10),'utf8')).rows,'every live portrait remains byte-identical');
  assert.equal(rows.length,175);
  assert.deepEqual(a.page.errors,[]);assert.deepEqual(a.page.consoleErrors,[]);
  const report={scope:'175 live-rendered PNG portraits at fixed shader time1.25; no asset writes or runtime prewarming.',rows};
  writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({portraits:rows.length,byteIdenticalToReference:!!reference}));
}
