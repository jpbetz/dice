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

// LOOK AT THE EXPANDED PANEL. The sibling of rail-look.mjs, which only ever
// framed the collapsed column — so the surface where the sources actually
// live has never had a shot taken of it. §7.22's closing rule ("looking at
// it is not optional, and the numbers do not substitute") binds both states,
// and only one of them had a tool.
//
// Seeded with the same twelve-pool Your Soul Deal sheet rail-look uses: a
// rack of three toy pools cannot show whether a section boundary reads, and
// the panel's whole job is stacking sections.
//
// Run: node tools/steps/panel-look.mjs

import { startStage } from '../stage.mjs';

const SHEET = [
  { name: 'Strength', notation: '2d8', category: 'attributes' },
  { name: 'Toughness', notation: '2d6', category: 'attributes' },
  { name: 'Agility', notation: '2d8', category: 'attributes' },
  { name: 'Wit', notation: '1d10', category: 'attributes' },
  { name: 'Wisdom', notation: '2d8', category: 'attributes' },
  { name: 'Intelligence', notation: '2d6', category: 'attributes' },
  { name: 'Charm', notation: '1d12', category: 'attributes' },
  { name: 'Will', notation: '2d6', category: 'attributes' },
  { name: 'Empathy', notation: '1d8', category: 'attributes' },
  { name: 'Swordplay', notation: '1d10', category: 'skills' },
  { name: 'Persuasion of the Crowd', notation: '1d8', category: 'skills' },
  { name: 'Zeal', notation: '1d4', category: 'motivations' },
];

const stage = await startStage();
try {
  const t = await stage.tab('localhost', 'Joe');
  await t.dbg(`setGroups(${JSON.stringify(SHEET)})`);
  await t.dbg('setPanelState({pools: true})');

  const { writeFileSync } = await import('node:fs');
  // Tall on purpose: the panel is a COLUMN of sections, and the defect this
  // tool exists to catch is how they stack. A viewport that clips the rack
  // hides exactly that.
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1200, height: 1100, deviceScaleFactor: 1, mobile: false }, t.page.sessionId);

  const crop = async (name) => {
    const clip = JSON.parse(await t.eval(`JSON.stringify((() => {
      const r = document.getElementById('left-panel').getBoundingClientRect();
      return { x: 0, y: 0, width: Math.ceil(r.width) + 24, height: Math.ceil(r.height), scale: 2 };
    })())`));
    const { data } = await t.page.browser.send(
      'Page.captureScreenshot', { format: 'png', clip }, t.page.sessionId);
    writeFileSync(stage.out(name), Buffer.from(data, 'base64'));
    return stage.out(name);
  };

  console.log(await crop('panel-rest.png'));

  // A staged draft: the well filled, the rim armed. This is the state the
  // section order has to serve — what you tapped, and where you tapped it.
  await t.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
  await t.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
  await t.eval(`document.querySelectorAll('#die-buttons .die-btn')[5].click()`);
  console.log(await crop('panel-draft.png'));
  await t.eval(`document.getElementById('clear-tray').click()`);

  // The section bar's own states (§7.23). All-on is the tall opt-in column;
  // all-off is the floor the design claims is still a complete surface —
  // both are worth a look, because "a serene bronze box over three quiet
  // words" is a sentence, and a sentence is not a screenshot.
  for (const [name, s] of [
    ['panel-all-on.png', { dice: true, notation: true, pools: true }],
    ['panel-notation-only.png', { dice: false, notation: true, pools: false }],
    ['panel-all-off.png', { dice: false, notation: false, pools: false }],
  ]) {
    await t.dbg(`setSections(${JSON.stringify(s)})`);
    console.log(await crop(name));
  }
  await t.dbg(`setSections({dice: true, notation: false, pools: true})`);

  // SCROLLED, which is the whole point of the reorder: the sections have to
  // slide cleanly under the well's opaque band and the shelf heads have to
  // pin at its lower edge. No still-life of the resting state can show it —
  // and a TALL window shows nothing either, because there is nothing to
  // scroll. The first version of this frame was taken at 1100px and was a
  // duplicate of the resting shot; a short window is the whole assignment.
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1200, height: 640, deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
  await t.dbg(`setSections({dice: true, notation: true, pools: true})`);
  console.log(await crop('panel-short.png'));
  await t.eval(`document.querySelector('#builder-panel > .panel-body').scrollTop = 300`);
  console.log(await crop('panel-scrolled.png'));
} finally {
  await stage.close();
}
