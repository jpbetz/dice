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

// WHAT A FRAME COSTS THE GPU, per tower and per frame kind (ROADMAP V4,
// IMMERSION-AUDIT §10). Reads `__diceDebug.renderAudit()`, which reports what
// three.js actually ISSUED for one frame — shadow map, base pass, and every
// post pass — as opposed to towerDressAudit(), which walks the graph and counts
// meshes (the dressing's static price).
//
// THIS IS THE COMMAND BEHIND EVERY DRAW NUMBER IN ROADMAP V4 AND SHIPPED.md.
// Draw calls do not depend on resolution, so headless figures port.
//
// TWO TRAPS, both learned the hard way:
//
//  1. `sim()` ticks with render=false, so the audit always reports the last
//     REAL rAF frame. Never sim() and read — waitFor on the audit itself.
//  2. Read after a settle. Mid-playback frames legitimately draw more, and a
//     figure taken mid-flight is not a budget, it is a coincidence.
//
// Run: node tools/steps/draw-price.mjs

import { startStage } from '../stage.mjs';

const stage = await startStage();
try {
  const t = await stage.tab('localhost', 'Joe');
  await t.settle();

  const audit = () => t.dbg('renderAudit()');
  const row = async (label) => {
    const a = await audit();
    console.log(`${label.padEnd(32)} calls=${String(a.calls).padStart(4)}  `
      + `tris=${String(a.triangles).padStart(6)}  passes=${a.passes}  post=${a.post}  dpr=${a.pixelRatio}`);
    return a;
  };

  console.log('--- the empty room, and one settled roll ---');
  await row('empty felt, no tower');
  await t.roll('4d6');
  await t.settle();
  await row('4d6 settled, bare felt');

  console.log('\n--- every registry tower, 4d6 settled, plain frame ---');
  const reg = await t.dbg('towerRegistry()');
  let worst = { id: null, calls: -1 };
  for (const model of reg) {
    await t.dbg(`setTower('${model.id}')`);
    await t.waitFor(`window.__diceDebug.tower === '${model.id}'`,
      { desc: `${model.label || model.id} is up` });
    const a = await row(`tower ${model.id}`);
    if (a.calls > worst.calls) worst = { id: model.id, calls: a.calls };
  }
  console.log(`worst plain frame: ${worst.id} at ${worst.calls} calls`);

  // THE POST FRAME IS THE ONE THE ANTI-COLLAPSE FLOOR IS READ ON. On the worst
  // tower, forced: as shipped this is the frame's real total across all eight
  // passes; with `renderer.info.autoReset` sabotaged back to true it reads 1,
  // because three.js would reset inside every pass and only the closing
  // fullscreen quad survives. A plain frame does NOT show that regression — it
  // merely loses the shadow pass — so a floor asserted there cannot fail.
  console.log('\n--- the same tower with the post stack FORCED ---');
  await t.dbg(`setTower('${worst.id}')`);
  await t.waitFor(`window.__diceDebug.tower === '${worst.id}'`, { desc: `${worst.id} back up` });
  await t.dbg('postForce(true)');
  await t.waitFor('window.__diceDebug.renderAudit().passes > 1', { desc: 'a post frame rendered' });
  const post = await row(`tower ${worst.id} + post`);
  await t.dbg('postForce(false)');
  await t.waitFor('window.__diceDebug.renderAudit().passes === 1', { desc: 'a plain frame again' });

  console.log('\n--- ROADMAP V4\'s proposed assertion, evaluated ---');
  console.log(`  plain  calls <= 220 : ${worst.calls <= 220 ? 'PASS' : 'FAIL'} (${worst.calls})`);
  console.log(`  post   passes === 8 : ${post.passes === 8 ? 'PASS' : 'FAIL'} (${post.passes})`);
  console.log(`  post   calls  >  40 : ${post.calls > 40 ? 'PASS' : 'FAIL'} (${post.calls})   <- the anti-collapse floor`);
  console.log(`  post   calls <= 300 : ${post.calls <= 300 ? 'PASS' : 'FAIL'} (${post.calls})`);
  console.log(`  dpr    <= 2         : ${post.pixelRatio <= 2 ? 'PASS' : 'FAIL'} (${post.pixelRatio})`);
  console.log('\nTo re-run the sabotage that justifies the floor: set');
  console.log('`renderer.info.autoReset = true` in js/main.js and run this again.');
  console.log('The POST row must collapse to 1 call in 8 passes; the plain rows must not.');
} finally {
  await stage.close();
}
