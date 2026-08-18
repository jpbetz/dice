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

// THE RESTING EYE (Joe, 2026-08-11): with a tower socketed and the felt
// empty, the camera rests on the tower — so the next pour starts already
// framed. Four transitions, each asserted from framingInfo():
//   socket on empty felt → tower · dice settle → THE LADDER, whichever rung
//   it picks · clear → tower again · unsocket → the ladder again (first law).
//
// The middle leg deliberately asserts `mode !== 'tower'` rather than a rung,
// and since C27 shipped `preferDice` ON (2026-08-18) that matters: three dice
// on the felt now come back `dice`, not `mat`, and a step that had pinned the
// rung would have reddened for a reason with nothing to do with towers.
// Measured on heartwood after the flip: `tower → dice → tower → mat-overflow`,
// CLEAN. The three empty-felt legs cannot be touched by C27 at all — with no
// dice, `diceFramingPoints()` is null and the dice rung is unreachable.
//
// It takes a TOWER ID, like every other proof step, and defaults to
// heartwood. It did not until the third tower was built: the skill says all
// four tools are parameterised and this one was not, so "run the resting-eye
// proof for your model" was a thing a builder could not do.
//
//   node tools/drive.mjs tools/steps/tower-resting-eye.mjs [towerId]

export default async function run(stage, args) {
  const tower = args && args[0] ? args[0] : 'heartwood';
  const a = await stage.tab('localhost', 'RestingEye');
  await a.settle();

  const info = async () => JSON.parse(await a.eval(
    'JSON.stringify(window.__diceDebug.framingInfo())'));
  const fail = (msg) => { console.log(`BAD: ${msg}`); process.exitCode = 1; };

  // Baseline: whatever ladder rung a towerless empty felt lands on in THIS
  // viewport (a narrow headless window overflows the mat — pre-existing).
  // The first-law assertion at the end is symmetry with this, not 'mat'.
  let f = await info();
  const baseline = f.mode;
  if (baseline === 'tower') fail('towerless felt resting on a tower that is not there');

  // 1. Socket on an empty felt → the resting eye goes to the tower.
  await a.dbg(`setTower('${tower}')`);
  await a.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: 'socketed' });
  await a.dbg('sim(1500)'); // let the ease finish
  f = await info();
  // WHERE THE RESTING EYE LOOKS IS z0, EXACTLY (towerEyePose: tgt.z = v.z0),
  // so this asks for that number instead of the bare `> -4` it used to. The
  // literal was a different assertion than it looked: -4 is neither the back
  // wall nor a bound on it, it is one preset's z0 (-4.3 at medium, unsocketed)
  // rounded off — so it passed on a mat two units deep and would have gone on
  // passing with the eye parked anywhere behind the middle of the table.
  // Tolerance is 0.06 because framingInfo rounds target to a tenth.
  const spec = await a.dbg(`towerPortalSpec(${JSON.stringify(tower)})`);
  if (!spec) { fail(`'${tower}' has no portal spec — nothing to check the eye against`); return; }
  const z0 = spec.derived.z0;
  console.log(`socketed idle: mode=${f.mode} target=${f.target} camY=${f.camY} z0=${z0}`);
  if (f.mode !== 'tower') fail(`socketed empty felt mode ${f.mode}, want tower`);
  if (Math.abs(f.target[1] - z0) > 0.06) {
    fail(`target z=${f.target[1]} is not the tower's back wall z0=${z0}`);
  }

  // 2. A pour lands dice → the ladder takes the frame back.
  await a.roll('3d6');
  await a.settle();
  await a.dbg('sim(1500)');
  f = await info();
  console.log(`dice on felt: mode=${f.mode} dice=${f.dice} target=${f.target}`);
  if (f.dice !== 3) fail(`expected 3 dice on the felt, got ${f.dice}`);
  if (f.mode === 'tower') fail('dice on the felt but the camera still rests on the tower');

  // 3. Clear → empty felt again → back to the tower.
  await a.dbg('clearTable()');
  await a.dbg('sim(1500)');
  f = await info();
  console.log(`cleared: mode=${f.mode} target=${f.target} camY=${f.camY}`);
  if (f.mode !== 'tower') fail(`cleared felt mode ${f.mode}, want tower`);

  // 4. Unsocket → the towerless resting frame is the mat, exactly as before.
  await a.dbg(`setTower('none')`);
  await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'unsocketed' });
  await a.dbg('sim(1500)');
  f = await info();
  console.log(`unsocketed: mode=${f.mode} target=${f.target}`);
  if (f.mode !== baseline) fail(`towerless mode ${f.mode}, want ${baseline} (first law)`);

  if (!process.exitCode) console.log(`CLEAN: the resting eye follows the tower (${tower})`);
}
