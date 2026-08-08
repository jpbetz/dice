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

// LOOK AT THE COLLAPSED POOL RAIL (§7.22). Seeded with a real Your Soul
// Deal sheet — nine attributes, two skills, a motivation — because the
// rail's whole job is presenting names, and a rack of three toy pools
// cannot show whether it does that well.
//
// Crops to the rail column so the felt's black does not dominate the frame.
// Run: node tools/steps/rail-look.mjs

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
  await t.dbg('setPanelState({pools: false})');

  const { writeFileSync } = await import('node:fs');
  // A TALL viewport on purpose: the default headless window cuts the list
  // off after five pools, which hides the very things this shot exists to
  // judge — the shelf transitions and the roll bar.
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
  const crop = async (name) => {
    const clip = JSON.parse(await t.eval(`JSON.stringify((() => {
      const r = document.getElementById('left-panel').getBoundingClientRect();
      return { x: 0, y: 0, width: Math.ceil(r.width) + 24, height: Math.ceil(r.height), scale: 3 };
    })())`));
    const { data } = await t.page.browser.send(
      'Page.captureScreenshot', { format: 'png', clip }, t.page.sessionId);
    writeFileSync(stage.out(name), Buffer.from(data, 'base64'));
    return stage.out(name);
  };

  console.log(await crop('rail-rest.png'));
  await t.dbg(`setRailSelection(['Wisdom', 'Swordplay', 'Zeal'])`);
  console.log(await crop('rail-picked.png'));

  // …and with dice on the felt, which is the only state that shows the
  // contextual ✕ in the foot's right corner. The left cluster must not
  // have shifted to make room for it.
  await t.dbg('railRoll()');
  await t.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy'
    + ' && window.__diceDebug.tableDice.length > 0)', { desc: 'dice land' });
  console.log(await crop('rail-dice.png'));
} finally {
  await stage.close();
}
