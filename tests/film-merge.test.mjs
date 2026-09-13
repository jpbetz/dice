/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import * as CANNON from '../vendor/cannon-es.js';
import * as THREE from '../vendor/three.module.js';
import {bakeFilm} from '../js/film-bake.js';
import {captureFilm,restoreFilm,bakeCaptured,unpackFilm,mergeFilmState,rngFromState} from '../js/film-wire.js';
function fixture() {
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,-30,0)});world.allowSleep=true;
  world.solver.iterations=14;world.broadphase=new CANNON.SAPBroadphase(world);
  const diceMat=new CANNON.Material('dice'),floorMat=new CANNON.Material('floor'),wallMat=new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat,floorMat,{friction:.75,restitution:.15}));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat,diceMat,{friction:.3,restitution:.2}));
  const floor=new CANNON.Body({mass:0,shape:new CANNON.Plane(),material:floorMat});floor.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(floor);
  const wall=new CANNON.Body({mass:0,shape:new CANNON.Plane(),material:wallMat});wall.position.z=-20;world.addBody(wall);
  const shape=new CANNON.Box(new CANNON.Vec3(.675,.675,.675));
  const faces=shape.convexPolyhedronRepresentation.faceNormals.map((v,i)=>({normal:new THREE.Vector3(v.x,v.y,v.z),value:i+1}));
  const getDie=()=>({shape,faces});
  const old=[];
  for(const x of [-1.5,1.5,3]) {const b=new CANNON.Body({mass:0,shape,material:diceMat});b.position.set(x,.675,0);world.addBody(b);old.push(b.id);}
  const dice=[];
  for(let i=0;i<3;i++) {const b=new CANNON.Body({mass:1,shape,material:diceMat});b.allowSleep=false;b.position.set(i*.8,5+i,0);b.velocity.set(-1,-2,1);b.angularVelocity.set(4,8,3);world.addBody(b);dice.push({type:'d6',body:b});}
  const ctx={world,dice,floorMat,wallMat,diceMat,rng:rngFromState(42),pouring:false,
    FIXED_DT:1/60,SETTLE_STILL:.45,SETTLE_CAP:9,SETTLEGATE:{mode:'displacement',eps:.02},
    DAMPGATE:{gate:4,slowLinear:.6,slowAngular:.6},PHYS:{linearDamping:.01,angularDamping:.01},
    NUDGE:{budget:3,lift:7,spread:4,spin:14,cockedDot:.6,cockedDotD4:.7,pileScale:1.05,pileSpread:12},
    DIE_DEFS:{d6:{size:1.35,mass:1}},restCeiling:()=>Math.sqrt(3)*.675,
    readValue(type,q){let best=null;for(const f of faces){const dot=f.normal.clone().applyQuaternion(q).y;if(!best||dot>best.dot)best={dot,value:f.value,label:String(f.value)};}return best;}};
  return {ctx,getDie,old};
}
const {ctx:original,getDie,old}=fixture(),input=captureFilm(original,getDie);
const live=restoreFilm(input);
const first=bakeFilm(original); // ORIGINAL live-world algorithm, before the event
const reply=bakeCaptured(input);
assert.deepEqual(unpackFilm(reply),first,'snapshot reproduces original first bake');
const mutate=(ctx)=>{
  const w=ctx.world;
  w.removeBody(w.getBodyById(old[0])); // lower index disappears
  const moved=w.getBodyById(old[1]);moved.position.x+=.7;moved.quaternion.setFromEuler(.3,.1,.2);moved.aabbNeedsUpdate=true;
  const added=new CANNON.Body({mass:0,shape:new CANNON.Box(new CANNON.Vec3(.4,.4,.4)),material:ctx.diceMat});
  added.id=900001;added.position.set(-2.5,.4,1);w.addBody(added);
  // Tuning changed while the old film was baking must remain the NEXT film's.
  w.gravity.y=-18;w.solver.iterations=9;w.allowSleep=false;w.default_dt=1/120;
  return {added,moved};
};
mutate(original); // formerly the event ran after the blocking inline bake
const {added,moved}=mutate(live); // now it runs BEFORE the worker reply
const beforePose=moved.quaternion.toArray(),axis=live.world.broadphase.axisList;
mergeFilmState(live.world,reply.world,input);
assert.equal(live.world.getBodyById(old[0]),undefined,'cleared body is not resurrected');
assert.equal(live.world.getBodyById(added.id),added,'added collider identity survives');
assert.deepEqual(moved.quaternion.toArray(),beforePose,'revealed/moved pose survives');
assert.equal(live.world.gravity.y,-18);assert.equal(live.world.solver.iterations,9);assert.equal(live.world.allowSleep,false);assert.equal(live.world.default_dt,1/120);
assert.equal(live.world.broadphase.axisList,axis,'SAP listener-owned array survives');
assert.equal(axis.length,live.world.bodies.length);assert.ok(axis.every(b=>live.world.getBodyById(b.id)===b));assert.equal(live.world.broadphase.dirty,true);
// Explicit matrix addressing: remove a low-index body, then map a recorded
// contact between two survivors by ID, not by their now-shifted array slots.
const matrix=new CANNON.ArrayCollisionMatrix();
const pair=[old[2],input.dice[0].bodyId];
const sourcePair=pair.map(id=>({index:reply.world.bodies.findIndex(b=>b.id===id)}));
matrix.set(...sourcePair,true);
mergeFilmState(live.world,{...reply.world,collision:matrix.matrix,previousCollision:matrix.matrix},input);
assert.ok(live.world.collisionMatrix.get(...pair.map(id=>live.world.getBodyById(id))));
assert.ok(live.world.collisionMatrixPrevious.get(...pair.map(id=>live.world.getBodyById(id))));
assert.ok(!live.world.collisionMatrix.get(added,live.world.getBodyById(pair[1])),'new collider has no stale previous contact');
function next(ctx) {
  const shape=ctx.dice[0].body.shapes[0];ctx.dice=[];ctx.rng=rngFromState(90090);
  for(let i=0;i<2;i++){const b=new CANNON.Body({mass:1,shape,material:ctx.diceMat});b.id=900010+i;b.allowSleep=false;b.position.set(i,6+i,-1);b.velocity.set(1,-3,1);b.angularVelocity.set(7,2,5);ctx.world.addBody(b);ctx.dice.push({type:'d6',body:b});}
  return bakeFilm(ctx);
}
assert.deepEqual(next(live),next(original),'next entire film equals original inline bake followed by the same remove/move/add/tuning event');
console.log('film-merge: passed');
