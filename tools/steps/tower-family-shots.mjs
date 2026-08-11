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

// THE REVIEW SET for a tower model (.claude/skills/new-tower/SKILL.md §4.2):
// the six frames a human has to LOOK at before a skin merges, plus the same
// idle frame of every SIBLING tower so the family resemblance can be judged
// rather than asserted. Scripted, because a visual still needs a human but
// not a human driving a browser (docs/TESTING.md).
//
//   node tools/drive.mjs tools/steps/tower-family-shots.mjs [tower] [sibling…]
//
// SIBLINGS ARE A LIST NOW (2026-08-14, third model). It took exactly one
// argument, so with three towers standing "the family at the same angle" was
// two of the three and the reviewer had to run the tool twice and remember
// which run each file came from. Default is every other registered model, in
// registry order, so the lineup grows with the family and nobody has to type
// it out.
//
// Writes shots/<tower>-*.png in the repo (gitignored).

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

export default async function run(stage, args) {
  const tower = args[0] || 'blackanvil';
  mkdirSync(SHOTS, { recursive: true });

  const t = await stage.tab('localhost', 'FamilyShots');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  const shot = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    console.log(await stage.shot(t, join(SHOTS, name)));
  };
  const up = async (id) => {
    await t.dbg(`setTower('${id}')`);
    await t.waitFor(`window.__diceDebug.tower === '${id}'`, { desc: `${id} socketed` });
    await t.dbg('sim(1500)');   // let the resting-eye ease finish
  };
  // The siblings, from the registry rather than a hard-coded pair: every
  // model with a skin that is not the one under review.
  const registry = await t.dbg('towerRegistry()');
  const siblings = args.length > 1
    ? args.slice(1)
    : registry.filter((r) => r.skin && r.id !== tower).map((r) => r.id);
  console.log(`reviewing ${tower}; siblings ${siblings.join(', ')}\n`);
  const zoom = async (id) => {
    await t.dbg(`setZoom('${id}')`);
    await t.waitFor(`window.__diceDebug.zoom === '${id}'`, { desc: `zoom ${id}` });
    await t.dbg('sim(1500)');
  };

  await zoom('medium');
  await up(tower);

  // 1. IDLE at the resting tower eye. This is the frame a player sees most:
  //    empty felt, the camera resting on the tower, waiting for a roll.
  await shot(`${tower}-1-idle-resting-eye.png`);

  // 2 and 3. A pour, at the two moments that are about the MODEL: dice
  //    entering the mouth, and the spread they leave on the felt.
  await t.dbg(`commandRoll('8d6')`);
  await t.waitFor('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
    { desc: 'the pour arrived' });
  const f = JSON.parse(await t.eval('JSON.stringify(window.__diceDebug.towerFilmInfo())'));
  // EARLY. A die is only above the crown for about a tenth of a second — it
  //    falls 4.25 units to the despawn line under g = −110 in 0.28 s, and the
  //    parapet hides it for most of that. Sampling at a third of the way to
  //    the first exit (the obvious choice, and the wrong one) lands on an
  //    empty tower: everything is already inside.
  await t.dbg('sim(9)');
  await shot(`${tower}-2-pour-entry.png`);
  await t.dbg('sim(11)');
  await shot(`${tower}-2b-pour-entry-late.png`);
  await t.dbg(`sim(${f.frames + 240 - 20})`);
  await shot(`${tower}-3-exit-spread.png`);
  await t.dbg('clearTable()');
  await t.dbg('sim(400)');
  await t.settle();

  // 4 and 5. Both ends of the zoom ladder, on an empty felt.
  //    THESE TWO LOOK ALIKE, AND THAT IS THE FINDING. Tried the other way
  //    first — dice on the felt at each preset — and the framing ladder did
  //    its job: it framed the DICE and let the tower slide out of shot, which
  //    tells a reviewer nothing about the model. On an empty felt the resting
  //    eye is tower-relative, so the idle frame is near-identical at wide and
  //    at close. That IS the shipped experience: the ladder's difference shows
  //    once dice land (shot 3), not while the table is waiting.
  for (const [z, n] of [['wide', '4-zoom-wide'], ['close', '5-zoom-close']]) {
    await zoom(z);
    await shot(`${tower}-${n}.png`);
  }
  await zoom('medium');

  // 6. The siblings, same idle frame, same eye. Family resemblance is a
  //    comparison and cannot be judged from one picture — and with three
  //    models it cannot be judged from two either: what a reviewer is asked
  //    is whether these belong to one house, which is a question about the
  //    whole set.
  for (const id of siblings) {
    await up(id);
    await shot(`${id}-6-idle-same-angle.png`);
  }

  // …and one close look at each model from the look-only eye, because the
  // shipped cameras frame the MAT and an eleven-unit tower runs off the top
  // of every one of them. Nothing about the film reads the camera.
  for (const id of [tower, ...siblings]) {
    await up(id);
    await t.dbg('towerEye(15, 8, 5)');
    await shot(`${id}-7-model-detail.png`);
    await t.dbg(`setZoom('medium')`);   // hand the eye back
    await t.dbg('sim(600)');
  }
  console.log(`\nshots in ${SHOTS}`);
}
