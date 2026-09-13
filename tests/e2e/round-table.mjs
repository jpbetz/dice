/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import { assert } from './harness.mjs';

export const roundFilmHash = `(async()=>{const r=window.__diceDebug.currentRoll;
  const payload={keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,landings:r.landings,
    lastLanding:r.lastLanding,nudges:r.nudges,frames:r.frames,simFrames:r.simFrames,values:r.values,
    final:r.dice.map(d=>({p:d.finalPos,q:d.finalQuat}))};
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)))))
    .map(v=>v.toString(16).padStart(2,'0')).join('');})()`;

export const roundFootprints = `(()=>{const d=window.__diceDebug,r=d.currentRoll;
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  function hull(points){const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lo=[],hi=[];
    for(const p of sorted){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
    for(const p of sorted.reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}
    return lo.slice(0,-1).concat(hi.slice(0,-1));}
  const dice=r.dice.map(die=>{const body=die.body,points=[[body.position.x,body.position.z]];
    for(const shape of body.shapes)for(const v of shape.vertices||shape.convexPolyhedronRepresentation?.vertices||[]){
      const p=body.quaternion.vmult(v);points.push([p.x+body.position.x,p.z+body.position.z]);}
    // Sample the entire corrected projected footprint, including its interior,
    // so a small landmark between hull vertices cannot evade the support rays.
    const polygon=hull(points),samples=points.slice();
    const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
    const minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1]));
    for(let x=minX;x<=maxX;x+=.25)for(let z=minZ;z<=maxZ;z+=.25)
      if(polygon.every((p,i)=>cross(p,polygon[(i+1)%polygon.length],[x,z])>=-1e-9))samples.push([x,z]);
    return {type:die.type,points,support:d.tableDesignSurface(samples)};});
  return {boundary:d.tableBoundary(),dice};})()`;

export const roundTableScenarios = [
  { name:'spawn-inside-walls',tags:['round-table','roll','perf','cuj8'],timeout:180000,async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.136',name:'Ada'});
    const ids=[await a.playerId()];
    for(const name of ['Bram','Cass','Dev','Eluned','Fionn','Gus','Hana'])ids.push((await ctx.rawPlayer(name)).playerId);
    await a.waitFor('window.__diceDebug.places().stations.length===8');
    await a.dbg('holdClock(true)');await a.dbg('filmAudit(true)');
    for(const zoom of ['wide','medium','close']) {
      await a.dbg(`setZoom('${zoom}')`);await a.waitFor(`window.__diceDebug.zoom==='${zoom}'`);
      for(const playerId of ids) {
        await a.dbg('clearTable()');
        const before=await a.logCount();
        const response=await ctx.api('/api/roll',{playerId,notation:'6d4+6d6+6d8+6d10+6d12+10d20'});
        assert.equal(response.status,200);
        await a.waitFor(`(window.__diceDebug.sim(120),document.getElementById('log-list').childElementCount>${before}&&!window.__diceDebug.busy)`);
        const measured=await a.eval(`(async()=>{const d=window.__diceDebug,input=d.filmInput;
          const {Vec3,Quaternion}=await import('/vendor/cannon-es.js');
          const states=new Map(input.world.state.bodies.map(b=>[b.id,b]));
          const bodies=new Map(input.world.bodies.map(b=>[b.state.id,b]));
          const shapes=new Map(input.world.shapes.map(s=>[s.id,s]));
          const planes=d.tableBoundary().ids.map(id=>states.get(id)).filter(b=>b.collisionFilterMask!==0)
            .map(b=>({p:new Vec3(...b.vectors.position),n:new Quaternion(...b.quaternions.quaternion).vmult(new Vec3(0,0,1))}));
          const points=input.dice.map(die=>{const b=states.get(die.bodyId),q=new Quaternion(...b.quaternions.quaternion),p=new Vec3(...b.vectors.position);
            return bodies.get(die.bodyId).shapes.flatMap(ref=>{const shape=shapes.get(ref.id),sq=new Quaternion(...ref.orientation),offset=new Vec3(...ref.offset);
              const vertices=shape.vertices||[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[x*shape.halfExtents[0],y*shape.halfExtents[1],z*shape.halfExtents[2]])));
              return vertices.map(v=>q.vmult(sq.vmult(new Vec3(...v)).vadd(offset)).vadd(p));});});
          const signed=(plane,p)=>plane.n.dot(p.vsub(plane.p));
          // Calibrate the instrument on every actual active plane. Translate
          // a complete real hull outward until its nearest vertex is 0.25
          // units through that plane; no application collision state changes.
          const controls=planes.map(plane=>{const hull=points[0],min=Math.min(...hull.map(p=>signed(plane,p)));
            return Math.min(...hull.map(p=>signed(plane,p.vsub(plane.n.scale(min+.25)))));});
          return {planes:planes.length,dice:points.length,min:Math.min(...points.flatMap(h=>h.flatMap(p=>planes.map(n=>signed(n,p))))),controls};})()`);
        assert.equal(measured.planes,16);assert.equal(measured.dice,40);
        assert.ok(measured.min>=.05-1e-9,`${zoom}: every transformed mixed hull starts inside every active plane (${measured.min})`);
        assert.ok(measured.controls.every(n=>Math.abs(n+.25)<1e-9),'all 16 actual planes detect a hull moved 0.25 units through their boundary');
      }
    }
    assert.deepEqual(a.page.consoleErrors,[]);
  }},
  { name:'round-table-spawn-budget',tags:['round-table','physics'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.135',name:'Draw budget'});
    await a.dbg('devOpen()');await a.dbg('devFold(true)');await a.dbg('holdClock(true)');await a.dbg('filmAudit(true)');
    for(const stamped of [false,true])for(const seed of [424242,2026,808,64352]) {
      const result=await a.eval(`(async()=>{const d=window.__diceDebug,{rngFromState}=await import('/js/film-wire.js');
        d.clearTable();
        if(${stamped})d.devBench(${seed},'40d20');else d.throwSeeded(Array(40).fill('d20'),${seed});
        while(d.filmWorker.baking)await new Promise(r=>setTimeout(r,1));
        const input=d.filmInput,rng=rngFromState(${seed}),side=Math.floor(rng()*4),heights=[];
        const h=${stamped}?d.tuneGet('table.seats.height'):1;
        for(let i=0;i<40;i++){
          if(!${stamped}&&side>=2){heights.push((6+rng()*4+i*.9)*h);rng();}
          else{rng();heights.push((6+rng()*4+i*.9)*h);}
          for(let j=0;j<10;j++)rng();
        }
        return {actual:input.dice.map(die=>input.world.state.bodies.find(b=>b.id===die.bodyId).vectors.position[1]),
          expected:heights,actualState:input.rngState,expectedState:rng.state()};})()`);
      assert.deepEqual(result.actual,result.expected,'both legacy draw orders and seated toss height draws survive');
      assert.equal(result.actualState,result.expectedState,'line fitting consumes no RNG draws');
      await a.settle();
    }
    assert.deepEqual(a.page.consoleErrors,[]);
  }},
  { name:'round-table-viewers',tags:['round-table','physics','film-worker'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.131',name:'Alice'});
    const b=await ctx.newTable({origin:'127.0.0.132',name:'Bob'});
    await a.eval('window.Worker=undefined');
    await b.page.browser.send('Network.enable',{},b.page.sessionId);
    await b.page.browser.send('Network.setBlockedURLs',{urls:['*copper-lantern-table.glb*']},b.page.sessionId);
    await a.dbg("setVenue('copper')");
    await a.waitFor("window.__diceDebug.tableDesign.status==='ready'");
    await b.waitFor("window.__diceDebug.tableDesign.status==='failed'");
    for(const t of [a,b])await t.dbg('holdClock(true)');
    for(const zoom of ['wide','close','medium']) {
      await a.dbg(`setZoom('${zoom}')`);
      for(const t of [a,b])await t.waitFor(`window.__diceDebug.zoom==='${zoom}'`);
      await a.roll('40d20 t3');await b.settle();
      assert.equal(await a.eval(roundFilmHash),await b.eval(roundFilmHash),'different render/worker states keep every film byte');
      const id=await a.rollId(),quoted=JSON.stringify(id);
      const kept=await a.eval('window.__diceDebug.currentRoll.dice.slice(0,2).map(d=>d.body.position.toArray())');
      await a.dbg(`throwAgain(${quoted},[0,1])`);
      for(const t of [a,b]) {await t.waitFor(`window.__diceDebug.turnState(${quoted}).throws.used===2`);await t.settle();}
      assert.equal(await a.eval(roundFilmHash),await b.eval(roundFilmHash),'rethrow, kept dice, sounds and authored faces agree');
      assert.deepEqual(await a.eval('window.__diceDebug.currentRoll.dice.slice(0,2).map(d=>d.body.position.toArray())'),kept);
      assert.equal(await a.dbg('filmWorker.last.execution'),'inline-fallback');
      assert.equal(await b.dbg('filmWorker.last.execution'),'worker');
      for(const t of [a,b])await t.dbg('clearTable()');
    }
    for(const t of [a,b])assert.deepEqual(t.page.consoleErrors,[]);
  }},
  { name:'round-table-state',tags:['round-table','physics','settings','tower'],async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.133',name:'State'});
    await a.dbg('holdClock(true)');await a.dbg('filmAudit(true)');await a.dbg('useFilmWorker(true)');
    const initialZoom=await a.dbg('zoom');
    const before=await a.dbg('tableBoundary()');
    async function cast(){await a.dbg('clearTable()');await a.dbg("throwSeeded(Array(40).fill('d20'),90090)");await a.settle();return a.eval(roundFilmHash);}
    const original=await cast();
    for(const zoom of ['close','wide','medium',initialZoom]) {
      await a.dbg(`setZoom('${zoom}')`);await a.waitFor(`window.__diceDebug.zoom==='${zoom}'`);
    }
    assert.equal(await cast(),original,'same state after zoom roundtrip preserves full film');
    await a.dbg('clearTable()');await a.dbg("setTower('wickroot')");await a.waitFor("window.__diceDebug.tower==='wickroot'");
    assert.equal((await a.dbg('tableBoundary()')).active,0,'round planes cannot obstruct a tower doorway');
    await a.dbg("throwSeeded(['d20','d6','d4'],42)");await a.settle();
    assert.ok((await a.dbg('towerFilmInfo()')).rest.every(d=>d.delivered));
    await a.dbg('clearTable()');await a.dbg("setTower('none')");await a.waitFor("window.__diceDebug.tower==='none'");
    assert.equal(await cast(),original,'same state after tower delivery/teardown preserves full film');
    const after=await a.dbg('tableBoundary()');assert.deepEqual(after.ids,before.ids);assert.equal(after.planes,16);assert.equal(after.active,16);
    await a.dbg('clearTable()');assert.equal((await a.dbg('tableBoundary()')).bodies,before.bodies,'no accumulated collider or worker input growth');
    assert.deepEqual(a.page.consoleErrors,[]);
  }},
  // Forty-five complete films and dense GLB support rays; wall time is not
  // a product budget. Keep each film's readiness/settle waits bounded separately.
  { name:'round-table-footprints',tags:['round-table','physics','table-designs'],timeout:180000,async fn(ctx) {
    const a=await ctx.newTable({origin:'127.0.0.134',name:'Footprints'});
    await a.dbg('devOpen()');await a.dbg('devFold(true)');await a.dbg('holdClock(true)');
    for(const zoom of ['wide','medium','close']) {
      await a.dbg(`setZoom('${zoom}')`);await a.waitFor(`window.__diceDebug.zoom==='${zoom}'`);
      const films=new Map();
      for(const id of ['copper','navigation','stone']) {
        await a.dbg(`setVenue('${id}')`);await a.waitFor(`window.__diceDebug.tableDesign.activeId==='${id}'`);
        for(const [seed,notation] of [[4,'4d20'],[90090,'40d20'],[32676,'40d20'],[90090,'40d4'],[32676,'40d4']]) {
          await a.dbg('clearTable()');await a.dbg(`devBench(${seed},'${notation}')`);await a.settle();
          const result=await a.eval(roundFootprints);
          assert.equal(result.dice.length,seed===4?4:40);
          for(const die of result.dice) {
            assert.ok(die.points.length>=5,'the actual transformed hull (including a tetrahedron), not just centre or bounding proxy');
            assert.ok(die.support.every(p=>p.y!==null&&p.y>=-.35&&p.y<=.06),`${id}/${zoom}/${notation}/${seed}: actual model supports the corrected footprint without raised-landmark overlap`);
          }
          const hash=await a.eval(roundFilmHash);
          const key=notation+'/'+seed;
          if(films.has(key))assert.equal(hash,films.get(key),'model choice has no physical effect');else films.set(key,hash);
          assert.ok((await a.dbg('spawnLine()')).every(p=>p.roundClear>=.05-1e-9));
        }
      }
    }
    assert.deepEqual(a.page.consoleErrors,[]);
  }},
];
