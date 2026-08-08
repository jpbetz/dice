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

// Where does your name sit, expanded vs collapsed, and does it line up with
// the divider chevron? Toggling the panel must not move it (Joe 2026-08-07:
// "it makes the vertical position of the name 'jump around'").
// Run: node tools/steps/rail-head-align.mjs

import { startStage } from '../stage.mjs';

const stage = await startStage();
try {
  const t = await stage.tab('localhost', 'Joe');
  await t.dbg(`setGroups([{name: 'Wisdom', notation: '2d8', category: 'attributes'}])`);

  const probe = `JSON.stringify((() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.top + r.height / 2); };
    const chip = document.getElementById('identity-chip');
    const name = document.getElementById('identity-name');
    const chev = document.querySelector('.et-chev');
    const r = chip.getBoundingClientRect();
    return {
      chipTop: Math.round(r.top), chipH: Math.round(r.height), chipMid: mid(chip),
      nameMid: mid(name), chevMid: mid(chev),
      nameVsChev: mid(name) - mid(chev),
    };
  })())`;

  await t.dbg('setPanelState({pools: true})');
  const open = JSON.parse(await t.eval(probe));
  await t.dbg('setPanelState({pools: false})');
  const shut = JSON.parse(await t.eval(probe));

  console.log('expanded ', JSON.stringify(open));
  console.log('collapsed', JSON.stringify(shut));
  console.log('name jump on toggle:', shut.nameMid - open.nameMid, 'px');
} finally {
  await stage.close();
}
