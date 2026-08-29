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

// SILT, TO BE LOOKED AT — Joe's sand seed, stage one (look only).
//
// The questions this exists to answer, in order:
//   1. does it read as SAND rather than as brown felt or as static?
//   2. do the dice stay readable on a pale ground? (the pale-field gamble —
//      'sand' is the only shipped precedent, and pale dice are the risk)
//   3. does the rake read as tended, or as scratches?
//   4. does it hold up next to the cloth it has to sit beside in the picker?
//
//   node tools/drive.mjs tools/steps/silt-look.mjs

const FELTS = ['silt', 'sand', 'walnut', 'obsidian'];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Look');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.eval('window.dispatchEvent(new Event("resize"))');
  await new Promise((r) => setTimeout(r, 300));
  await a.dbg('setPanelState({pools: false, log: false})');
  await a.dbg('setLogFlyout(false)');
  await a.dbg('holdClock(true)');

  for (const felt of FELTS) {
    await a.dbg('clearTable()');
    await a.dbg(`setFelt(${JSON.stringify(felt)})`);
    await a.dbg('sim(60)');
    // A seeded throw, so the four surfaces are compared under the IDENTICAL
    // pile rather than under four different ones — the whole point is the
    // ground, and a different scatter each time would confound it.
    await a.dbg(`throwSeeded(['d6','d6','d6','d6','d6'], 90210)`);
    await a.dbg('sim(1400)');
    await stage.shot(a, `silt-${felt}`);
  }

  // The picker, because a new cloth has to survive being seen beside the
  // other nine — and because the swatch is painted from the real tile, so
  // this is also the check that the cloth reaches the chip.
  await a.dbg('clearTable()');
  await a.dbg(`setFelt('silt')`);
  await a.dbg('sim(30)');
  await a.eval(`document.getElementById('settings-open')?.click()`);
  await new Promise((r) => setTimeout(r, 400));
  await stage.shot(a, 'silt-picker');
}
