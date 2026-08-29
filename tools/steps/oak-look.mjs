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

// TAPROOM OAK, TO BE LOOKED AT — the register's hard surface.
//
// The questions this exists to answer, in order:
//   1. does it read as BOARDS, or as brown paper with lines on it?
//   2. can you see the tile? Wood is the material the eye reads landmarks in,
//      and the mat spans two to three tiles — a repeat here is fatal in a way
//      it never was for felt.
//   3. do the dice read on it? It is mid-toned and warm, between sand and
//      walnut, and the gold chrome has to survive it.
//   4. does the groove read as two boards meeting, or as a drawn line?
//
//   node tools/drive.mjs tools/steps/oak-look.mjs

const FELTS = ['taproom', 'walnut', 'sand', 'silt'];

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
    // The same seeded pile on every surface: the ground is the subject, and a
    // different scatter each time would confound it.
    await a.dbg(`throwSeeded(['d6','d6','d6','d6','d6'], 90210)`);
    await a.dbg('sim(1400)');
    await stage.shot(a, `oak-${felt}`);
  }

  // WIDE, because the tile question can only be asked with several tiles in
  // frame at once. If oak repeats, this is the shot that shows it.
  // CLEAR FIRST. A zoom is DEFERRED while the table is busy or a ceremony
  // card is up (queueZoom), so a shot taken straight after `setZoom` under
  // the verdict card is the previous zoom wearing the new name — which is
  // exactly what the first run of this step produced.
  await a.dbg('clearTable()');
  await a.dbg('sim(120)');
  await a.dbg(`setFelt('taproom')`);
  await a.dbg(`setZoom('wide')`);
  await a.dbg('sim(120)');
  await a.dbg('sim(60)');
  await stage.shot(a, 'oak-wide');
  await a.dbg(`setZoom('close')`);
  await a.dbg('sim(120)');
  await stage.shot(a, 'oak-close');
  await a.dbg(`setZoom('medium')`);

  // The picker: a new cloth has to survive being seen beside the other ten.
  await a.dbg('clearTable()');
  await a.dbg('sim(30)');
  // `openSettings` IS the deep link (js/main.js) — the header button's id is
  // not what the first cut guessed, and a missed click here produces a shot of
  // the table under the name of the picker.
  // 'staging' is where the mats live, and the chips exist in the DOM whatever
  // section is showing — so the count is not proof the picker is VISIBLE, and
  // the first cut shot the Table section under the name of the picker while
  // its check passed. Ask for the section the swatches are in.
  await a.dbg(`openSettings('staging')`);
  await new Promise((r) => setTimeout(r, 400));
  const shown = await a.eval(`(() => {
    const el = document.querySelector('.felt-swatch');
    return el ? getComputedStyle(el).display !== 'none' && el.offsetParent !== null : false;
  })()`);
  if (!shown) throw new Error('the mat picker is not on screen');
  await stage.shot(a, 'oak-picker');
}
