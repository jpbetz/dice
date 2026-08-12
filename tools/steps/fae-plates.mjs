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

// THE W0 CONCEPT PLATES — both palettes, empty and with settled dice.
//
//   node tools/drive.mjs tools/steps/fae-plates.mjs

export default async function run(stage) {
  const a = await stage.tab('localhost', 'FaePlates');
  await a.settle();
  for (const pal of ['moonrise', 'foxfire']) {
    await a.dbg(`faeConcept(true, {paletteId: '${pal}'})`);
    await a.dbg('sim(600)');
    await stage.shot(a, `fae-${pal}-empty`);
    await a.dbg(`throwSeeded(['d20','d6','d6','d6'], 4242)`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc: `dice settle in ${pal}`, timeout: 30000 });
    await a.dbg('sim(300)');
    await stage.shot(a, `fae-${pal}-dice`);
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    await a.dbg('faeConcept(false)');
    await a.dbg('sim(30)');
  }
  await stage.shot(a, 'fae-restored');
}
