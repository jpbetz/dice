/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {restoreFilm} from '../js/film-wire.js';
import {bakeFilm} from '../js/film-bake.js';
import * as CANNON from '../vendor/cannon-es.js';

const rows=JSON.parse(readFileSync(process.argv[2],'utf8'),(_k,v)=>v?.nonfinite?Number(v.nonfinite):v);
const output=[],mode=process.argv[4]||'planes';
if(!['planes','boxes'].includes(mode))throw Error('Unknown probe mode');
for(const row of rows){
  const measures=[];
  for(const optimized of [false,true,false,true]){
    const ctx=restoreFilm(row.input),w=ctx.world,broad=w.broadphase;
    if(optimized&&mode==='boxes')broad.useBoundingBoxes=true;
    const intersection=broad.intersectionTest.bind(broad),normal=new CANNON.Vec3(),offset=new CANNON.Vec3();
    const localZ=new CANNON.Vec3(0,0,1);let pairs=0,rejected=0;
    broad.intersectionTest=(a,b,p1,p2)=>{
      pairs++;
      if(optimized&&mode==='planes'){
        const plane=a.shapes.length===1&&a.shapes[0] instanceof CANNON.Plane?a:b.shapes.length===1&&b.shapes[0] instanceof CANNON.Plane?b:null;
        const other=plane===a?b:a;
        if(plane&&plane.mass===0&&Number.isFinite(other.boundingRadius)){
          plane.shapeOrientations[0].vmult(localZ,normal);plane.quaternion.vmult(normal,normal);
          plane.quaternion.vmult(plane.shapeOffsets[0],offset);offset.vadd(plane.position,offset);
          const distance=(other.position.x-offset.x)*normal.x+(other.position.y-offset.y)*normal.y+(other.position.z-offset.z)*normal.z;
          if(distance>other.boundingRadius+1e-8){rejected++;return;}
        }
      }
      intersection(a,b,p1,p2);
    };
    const collision={};
    for(const key of ['planeConvex','convexConvex']){
      const original=w.narrowphase[key].bind(w.narrowphase);collision[key]={calls:0,ms:0};
      w.narrowphase[key]=(...args)=>{const start=performance.now();const result=original(...args);collision[key].ms+=performance.now()-start;collision[key].calls++;return result;};
    }
    const step=w.step.bind(w),profile={};w.doProfiling=true;let steps=0;
    w.step=(...args)=>{const result=step(...args);steps++;for(const [key,n] of Object.entries(w.profile))profile[key]=(profile[key]||0)+n;return result;};
    const start=performance.now(),film=bakeFilm(ctx),elapsed=performance.now()-start;
    const hash=createHash('sha256').update(JSON.stringify(film)).digest('hex');
    measures.push({optimized,mode,elapsed,hash,steps,pairs,rejected,profile,collision});
  }
  const sameFilm=measures.every(m=>m.hash===measures[0].hash);
  const {input,...label}=row;output.push({...label,sameFilm,measures});
  if(!sameFilm&&process.argv[3])writeFileSync(process.argv[3],JSON.stringify(output,null,2));
  assert.ok(sameFilm,'Complete film changed: '+row.zoom+' '+row.notation+'/'+row.seed);
  console.log(JSON.stringify({...label,baseline:measures[2].elapsed,optimized:measures[3].elapsed,rejected:measures[3].rejected,pairs:measures[3].pairs,hash:measures[0].hash}));
}
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(output,null,2));
