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

// Side-panel review stills (2026-08-04): the dedicated column vs the felt,
// the collapsed icon rail with its super-minimal pool list, felt-centered
// furniture (banner), and a themed roll beside the neutral chrome.
//
//   node tools/drive.mjs tools/steps/side-panel-shots.mjs

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

export default async function run(stage) {
  const dir = join(OUT_DIR, 'side-panel');
  mkdirSync(dir, { recursive: true });
  const a = await stage.tab('localhost', 'Joe');
  const send = (m, p) => a.page.browser.send(m, p, a.page.sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const beat = (ms = 400) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    await beat();
    console.log(await stage.shot(a, join(dir, name)));
  };

  // a rack with every rail flavor: named, themed-named, unnamed, categorized
  await a.dbg(`setGroups([
    {name: 'Attack', notation: '1d20+3'},
    {name: 'Strength', notation: '3d6'},
    {notation: '2d6'},
    {name: 'Fireball', notation: '8d6', category: 'Skills'},
    {notation: '1d20 dc15'},
  ])`);
  const pools = await a.dbg('groups');
  await a.eval(`window.__diceDebug.editPool(${JSON.stringify(pools[1].id)}, { set: 'emberforge.blackanvil' })`);
  await a.dbg('setPanelState({pools: true})');

  // 1 · the column at rest — one divider, neutral chrome, no title
  await shot('01-expanded-rest.png');

  // 1b · the well IN USE: a staged pool + a loose die over the ± drawer-pull
  await a.eval(`document.querySelector('[data-group-id="${pools[1].id}"] .tile-stage').click()`);
  await a.eval(`document.querySelector('.die-btn img[data-art-type="d20"]').closest('button').click()`);
  await shot('01b-draft-staged.png');
  await a.eval(`document.getElementById('clear-tray').click()`);

  // 2 · a themed roll beside the neutral column (banner centers on the felt)
  await a.eval(`window.__diceDebug.setDiceSet('tidewrack.seaglass')`);
  await a.roll('4d6 # seaglass beside the graphite');
  await a.settle();
  await shot('02-themed-roll-expanded.png');

  // 3 · collapsed: the slim icon rail + the super-minimal pool list, dice
  //     still on the (now wider) felt
  await a.eval(`document.getElementById('edge-toggle').click()`);
  await a.dbg('sim(240)');
  await shot('03-collapsed-rail.png');

  // 4 · a rail roll: tap 'Strength' (anvil-pinned) — dice fly, panel stays slim
  await a.eval(`[...document.querySelectorAll('#rail-pools .rp-item.rp-name')]
    .find((b) => b.textContent === 'Strength').click()`);
  await a.settle();
  await shot('04-rail-roll-anvil.png');

  // 5 · narrow window: the expanded column yields a felt sliver, never zero
  await a.eval(`document.getElementById('edge-toggle').click()`);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 620, height: 900, deviceScaleFactor: 1, mobile: false });
  await beat(300);
  await shot('05-narrow-expanded.png');
  await a.eval(`document.getElementById('edge-toggle').click()`);
  await beat(300);
  await shot('06-narrow-collapsed.png');
}
