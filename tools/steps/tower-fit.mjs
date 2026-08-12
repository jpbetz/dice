/*
Copyright 2026 The Dice Table Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// SOCKET FIT AND ZERO COLLIDERS — proofs (a) and (d) of docs/TOWER.md's
// "What a model must prove", for every registered tower, headless and against
// the BUILT MESH of the shipped socket. tower-occlusion.mjs is proof (b); this
// is the other geometric pair, and it did not exist until Bastion needed it.
//
// It does not print a pass/fail for the socket HULL, on purpose: every tower
// shipped stands a little outside it and every one of those overruns is legal
// — the APRON and the LIP are engine volumes the contract invites a model to
// skin, and the HOOD volume is where the contract asks a gate cover to cast
// its shadow. A naive hull verdict is red on the reference implementation on
// its first day.
//
// WHAT IT DOES GATE (2026-08-11, the dressing pass): every overrun must be a
// NAMED legal class. `towerModelAudit` classifies each offending mesh against
// the engine volume that grants it — apron cladding, lip cladding, the gate
// hood's reach, the lean's foot dip, a wall-hung prop above the play volume —
// and anything matching none of them comes back UNCLASSIFIED and fails here.
// The list-and-trust-a-human version worked exactly until a model added a
// sixth kind of overrun; a budget nobody names is a budget nobody keeps.
//
// The `towerDressFx` group is reported separately and NOT measured against the
// socket, which is deliberate and is why it is printed rather than skipped: an
// InstancedMesh's union box is meaningless (G8) and Black Anvil's smoke is the
// one thing on any tower that legitimately leaves the socket upward.
//
// Also gated, with no legal exception: the eight engine colliders.
//
//   node tools/drive.mjs tools/steps/tower-fit.mjs [tower…]

export default async function run(stage, args) {
  const towers = args.length ? args : ['heartwood', 'bastion', 'blackanvil'];
  const a = await stage.tab('localhost', 'TowerFit');
  await a.settle();

  const base = await a.dbg('worldBodies()');
  console.log(`towerless world: ${base.count} bodies, named=[${base.named}]\n`);
  let bad = 0;

  for (const id of towers) {
    await a.dbg(`setTower('${id}')`);
    await a.waitFor(`window.__diceDebug.tower === '${id}'`, { desc: `${id} socketed` });
    await a.dbg('sim(60)');
    const w = await a.dbg('worldBodies()');
    const r = await a.dbg('towerModelAudit()');
    if (!r) { console.log(`${id}: BAD — nothing socketed`); bad++; continue; }

    console.log(`${id}: ${r.meshes} occluder meshes, ${r.lights} lights, `
      + `off-policy materials=[${r.offPolicy.join('; ') || 'none'}]`);
    console.log(`  hull   x[${r.hull.x}] y[${r.hull.y}] z(rel z0)[${r.hull.z}]`);
    console.log(`  socket x[${r.socket.x}] y[${r.socket.y}] z(rel z0)[${r.socket.z}]`);
    if (!r.outs.length) {
      console.log('  SOCKET: every occluder mesh inside');
    } else {
      let unclassified = 0;
      for (const o of r.outs) {
        console.log(`  outside by ${o.over.join(',')}  x[${o.box[0]},${o.box[1]}] `
          + `y[${o.box[2]},${o.box[3]}] z[${o.box[4]},${o.box[5]}]`);
        console.log(`      → ${o.cls}`);
        if (o.cls === 'UNCLASSIFIED') unclassified++;
      }
      if (unclassified) {
        console.log(`  SOCKET: BAD — ${unclassified} overrun(s) match no legal class`);
        bad++;
      } else {
        console.log(`  SOCKET: ${r.outs.length} overrun(s), every one a named legal class`);
      }
    }
    if (r.fx) {
      console.log(`  fx (unmeasured)  x[${r.fx.x}] y[${r.fx.y}] z(rel z0)[${r.fx.z}]`);
      console.log(`      → ${r.fx.cls}${r.fx.overCeiling ? `  (+${r.fx.overCeiling} over the ceiling)` : ''}`);
    }
    const added = w.count - base.count;
    console.log(`  colliders: ${base.count} → ${w.count} (+${added}); named=[${w.named}]`);
    if (added !== 8) { console.log('  ZERO-COLLIDER: BAD — a skin added physics'); bad++; }
    else if (r.lights) { console.log('  LIGHTS: BAD — a skin added a light'); bad++; }
    else console.log('  ZERO-COLLIDER: PASS — the eight engine bodies and nothing else');
    console.log('');
  }

  await a.dbg(`setTower('none')`);
  await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'unsocketed' });
  const end = await a.dbg('worldBodies()');
  const restored = end.count === base.count && end.named.length === 0;
  if (!restored) bad++;
  console.log(`restored: ${end.count} bodies (was ${base.count}), named=[${end.named}] — `
    + `${restored ? 'PASS' : 'BAD'}`);
  console.log(bad === 0
    ? '\nCLEAN: every skin is pure theatre'
    : `\nBAD: ${bad} problem(s)`);
  if (bad > 0) process.exitCode = 1;
}
