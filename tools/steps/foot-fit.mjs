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

// Does the collapsed foot actually overflow with `? Help` restored? The
// decision to drop it rests on a width claim, and a width claim should be
// measured rather than estimated. Prints the natural width of the foot's
// glyph row with and without Help, against the space it has.

import { startStage } from '../stage.mjs';

const stage = await startStage();
try {
  const t = await stage.tab('localhost', 'Joe');
  await t.dbg(`setGroups([{name: 'Wisdom', notation: '2d8', category: 'attributes'}])`);
  await t.dbg('setPanelState({pools: false})');
  await t.roll('d6'); // puts dice on the felt so the contextual ✕ is real

  const report = await t.eval(`JSON.stringify((() => {
    const foot = document.getElementById('rail-foot');
    const help = document.getElementById('rail-help');
    const avail = foot.clientWidth
      - parseFloat(getComputedStyle(foot).paddingLeft)
      - parseFloat(getComputedStyle(foot).paddingRight);
    const measure = () => [...foot.children]
      .filter((el) => getComputedStyle(el).display !== 'none')
      .reduce((sum, el) => sum + el.getBoundingClientRect().width, 0)
      + 2 * ([...foot.children].filter((el) => getComputedStyle(el).display !== 'none').length - 1);
    const withoutHelp = measure();
    const prev = help.style.display;
    help.style.display = 'inline-flex';
    const withHelp = measure();
    help.style.display = prev;
    return { avail: Math.round(avail), withoutHelp: Math.round(withoutHelp),
             withHelp: Math.round(withHelp),
             fitsWithHelp: withHelp <= avail, fitsWithout: withoutHelp <= avail };
  })())`);
  console.log(report);
} finally {
  await stage.close();
}
