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

// WHAT A TOUCH-TARGET BUMP COSTS, before anyone spends it (ROADMAP U28b).
// U28b's rule is "raise by family with the measurement, never in bulk" — so
// this prints the measurement AND the price: every near-miss family's live
// geometry under an emulated coarse pointer, then what each candidate bump
// would take off the rack, applied live and re-measured.
//
// The frame is 1024x768 LANDSCAPE because that is the device U30 names as the
// worst case (SHIPPED.md: the rack gets ~203px there — "the device with the
// most screen puts the whole rack behind a scroll").
//
// offsetWidth/offsetHeight, never getBoundingClientRect: the rect is the
// TRANSFORMED box and half this chrome arrives on a scale() entrance, which is
// the same reason `touch-targets` reads the layout box. This is deliberately
// the same reader as that scenario, so a number here and an assertion there
// cannot disagree.
//
// Run: node tools/steps/touch-price.mjs

import { startStage } from '../stage.mjs';

const stage = await startStage();
try {
  const t = await stage.tab('localhost', 'Joe');
  await t.settle();
  await t.emulateCoarsePointer(true);
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
  await t.dbg(`setGroups(${JSON.stringify([
    { name: 'Attack', notation: '1d20', category: 'attacks' },
    { name: 'Sneak', notation: '2d6', category: 'attacks' },
    { name: 'Wisdom', notation: '2d8', category: 'attributes' },
  ])})`);
  await t.roll('2d6');  // #corner-clear renders only while dice are on the table
  await t.settle();

  // ---- the families, as they are ----
  const sizes = async (label, sel) => {
    const r = JSON.parse(await t.eval(`JSON.stringify((() => {
      const out = [];
      for (const el of document.querySelectorAll(${JSON.stringify(sel)})) {
        if (el.offsetParent === null) continue;
        out.push({ id: el.id || el.className, w: el.offsetWidth, h: el.offsetHeight });
      }
      return out;
    })())`));
    if (!r.length) { console.log(`${label.padEnd(18)} (none visible in this state)`); return; }
    console.log(`${label.padEnd(18)} ${r.map((e) => `${e.id} ${e.w}x${e.h}`).join('  ·  ')}`);
  };

  console.log('--- the families, coarse pointer, 1024x768 landscape ---');
  await sizes('.btn.ghost', '#rail-foot .btn.ghost');
  await sizes('.corner-btn', '#rail-foot .corner-btn');
  await sizes('#section-bar', '#section-bar > *');
  await sizes('#identity-chip', '#identity-chip');

  // ---- the price of each candidate ----
  const scroll = () => t.eval(`(() => {
    const b = document.querySelector('#builder-panel > .panel-body');
    return b ? b.clientHeight : -1;
  })()`);
  const apply = (css) => t.eval(`(() => {
    let s = document.getElementById('touch-price-probe');
    if (!s) { s = document.createElement('style'); s.id = 'touch-price-probe'; document.head.appendChild(s); }
    s.textContent = ${JSON.stringify(css)};
    return true;
  })()`);

  const base = await scroll();
  console.log(`\n--- the price, in rack scrollport px (as shipped: ${base}px) ---`);
  // THE PRICE IS A DELTA MEASURED IN ONE RUN, never two numbers from two runs.
  // The shipped bump is priced by taking it BACK OFF (its price is the rack the
  // revert hands back); the refused candidates are priced by putting them on.
  //
  // A family INSIDE the scrollport reads 0 here and IS NOT FREE — it spends the
  // rack's own content instead, which is exactly the place U30 exists to
  // protect. That is why the line says which side of the scrollport it is on
  // rather than only a number: "0px" alone reads as free and is the wrong
  // conclusion for #section-bar and .btn.tiny both.
  const price = async (label, css, where) => {
    await apply(css);
    const after = await scroll();
    const d = after - base;
    console.log(`${label.padEnd(36)} ${base} -> ${after}  (${d >= 0 ? '+' : ''}${d}px rack)  [${where}]`);
    await apply('');
  };
  await price('rail foot 34 -> back to 31/28 (revert)',
    '#rail-foot .btn.ghost, #rail-foot .corner-btn { min-height: 0; min-width: 0; }',
    'outside the scrollport — a revert HANDS BACK what the shipped rule cost');
  await price('#section-bar cells -> 34',
    '#section-bar > * { min-height: 34px; }',
    'INSIDE the scrollport — costs the rack CONTENT, not the port: U30\'s budget');
  await price('.btn.tiny -> 34 (whole column)',
    '#left-panel .btn.tiny { min-height: 34px; }',
    'INSIDE the scrollport, and mostly in the settings modal: see index.html:1164');

  // ---- the collapsed rail is a different budget, and it is a WIDTH one ----
  await t.eval(`document.getElementById('edge-toggle').click()`);
  await t.eval(`new Promise((r) => setTimeout(r, 400))`);
  const col = JSON.parse(await t.eval(`JSON.stringify((() => {
    const foot = document.getElementById('rail-foot');
    const cs = getComputedStyle(foot);
    const kids = [...foot.children].filter((el) => getComputedStyle(el).display !== 'none');
    let used = parseFloat(cs.gap || 0) * (kids.length - 1);
    for (const el of kids) used += el.getBoundingClientRect().width;
    return {
      collapsed: document.getElementById('left-panel').classList.contains('collapsed'),
      contentBox: Math.round(foot.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
      used: Math.round(used),
      kids: [...foot.querySelectorAll('button')].filter((el) => el.offsetParent)
        .map((el) => el.id + ' ' + el.offsetWidth + 'x' + el.offsetHeight),
    };
  })())`));
  console.log('\n--- the COLLAPSED foot (its budget is width, not height) ---');
  console.log(`collapsed=${col.collapsed}  ${col.used}px used of an ${col.contentBox}px content box`);
  console.log(`  ${col.kids.join('  ·  ')}`);
  console.log('  A size RULE cannot fix a width under-run here — there is no width left.');
  console.log('  ROADMAP U28b files this against U21 as a LAYOUT change (U28a\'s shape).');

  await t.emulateCoarsePointer(false);
} finally {
  await stage.close();
}
