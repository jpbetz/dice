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

// THE STUMP SILHOUETTE PROOF — the displaced-shell form standing in the
// glade, both palettes. Judged against Joe's reference photo.
//
//   node tools/drive.mjs tools/steps/fae-stump.mjs

export default async function run(stage) {
  const a = await stage.tab('localhost', 'FaeStump');
  await a.settle();
  for (const pal of ['foxfire', 'moonrise']) {
    await a.dbg(`faeConcept(true, {paletteId: '${pal}'})`);
    await a.dbg('towerEye(19, 8, 4)'); // the photo eye — the felt camera crops a 9u form
    await a.dbg('sim(600)');
    await stage.shot(a, `stump-${pal}`);
    await a.dbg('faeConcept(false)');
    await a.dbg('sim(30)');
  }
}
