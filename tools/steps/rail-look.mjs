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

// LOOK AT THE COLLAPSED POOL RAIL (§7.22). Seeded with THE RACK THE APP
// DEALS — `dealtRack()` calls js/seed.js's own dealer, so this tool cannot
// show a character no player will ever open (audit G5, ROADMAP U15). It used
// to fixture twelve hand-typed pools; the dealt rack is eighteen across three
// priced shelves, which is six rows and a whole shelf more than the column
// was ever framed holding. The fixture must keep tracking the shipped seed —
// if you need different pools here, change js/seed.js or pass another draw
// seed, never paste a list into this file.
//
// Crops to the rail column so the felt's black does not dominate the frame.
// Run: node tools/steps/rail-look.mjs

import { startStage, dealtRack } from '../stage.mjs';

const RACK = dealtRack();
// One pool per shelf, taken FROM THE DEAL — the common Soul Deal roll is an
// attribute, a skill and a motivation, and naming them by hand would be the
// same drift this tool exists to close.
const TRIO = ['Attributes', 'Skills', 'Motivations']
  .map((c) => RACK.find((g) => g.category === c).name);

const stage = await startStage();
try {
  const t = await stage.tab('localhost', 'Joe');
  await t.dbg(`setGroups(${JSON.stringify(RACK)})`);
  await t.dbg('setPanelState({pools: false})');

  const { writeFileSync } = await import('node:fs');
  // A TALL viewport on purpose: the default headless window cuts the list
  // off after five pools, which hides the very things this shot exists to
  // judge — the shelf transitions and the roll bar. (The SHORT frames below
  // are the deliberate other half: eighteen pools do not fit any laptop.)
  const viewport = async (height) => t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1200, height, deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
  await viewport(1000);
  const crop = async (name) => {
    // Front THIS tab first: the roster frames open three more tables, and a
    // backgrounded target answers Page.captureScreenshot with whatever it
    // last painted.
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
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
  await t.dbg(`setRailSelection(${JSON.stringify(TRIO)})`);
  console.log(await crop('rail-picked.png'));

  // THE OTHER LIST (§7.23). The switch has to read as one control over two
  // lists rather than two surfaces — which is a judgement only a picture can
  // settle, and the counted row is the whole idea: the label IS the notation.
  await t.dbg(`setRailMode('dice')`);
  console.log(await crop('rail-dice-empty.png'));
  for (const n of [0, 1, 2]) await t.dbg(`railTapDie('d6')`); // → 3d6
  await t.dbg(`railTapDie('d20')`);
  console.log(await crop('rail-dice-counted.png'));
  // ARMED AND APPROACHED — the plate has to match the tray's own hover, and
  // real CSS :hover needs real mouse input (a synthetic event runs listeners
  // but never moves the browser's hover state).
  await t.hover('#rail-roll');
  console.log(await crop('rail-roll-hover.png'));
  // THE REMOVER, APPROACHED. `.rd-x` rests at opacity 0 and is revealed by
  // `.rd-cell:hover`, then reddened by its own `:hover` — a rule no frame in
  // this repo had ever caught, because a remover you cannot see at rest is
  // exactly the control a still-life omits. Aim by index rather than :has(),
  // so the shot names the row it hovered.
  const xRow = await t.eval(`[...document.querySelectorAll('#rail-dice .rd-cell')]
    .findIndex((c) => c.querySelector('.rd-x')) + 1`);
  await t.hover(`#rail-dice .rd-cell:nth-child(${xRow}) .rd-x`);
  console.log(await crop('rail-x-hover.png'));
  await t.hover('#identity-chip');

  // The worst label this list can hold…
  await t.dbg(`setRailMode('pools')`);
  await t.dbg(`setRailMode('dice')`);
  for (let i = 0; i < 10; i++) await t.dbg(`railTapDie('d10x')`);
  console.log(await crop('rail-dice-wide.png'));
  // …and the cap whisper under it, LIVE. #rail-note exists because the status
  // pill folds to a 10px colorless dot while collapsed, so this is the only
  // channel the column has — and it had never been photographed lit. Thirty
  // more taps reach the 40-die table cap; the forty-first is refused at the
  // increment and writes the note.
  await t.eval(`(() => { for (let i = 0; i < 31; i++) window.__diceDebug.railTapDie('d10x'); })()`);
  await t.waitFor(`!!window.__diceDebug.railDice.note`, { desc: 'the cap note lights' });
  console.log(await crop('rail-note.png'));
  await t.eval(`(() => { for (let i = 0; i < 40; i++) window.__diceDebug.railRemoveDie('d10x'); })()`);
  await t.dbg(`setRailMode('pools')`);
  // …and an empty rack, where Pools is impossible rather than merely absent.
  await t.dbg(`setGroups([])`);
  console.log(await crop('rail-no-pools.png'));
  await t.dbg(`setGroups(${JSON.stringify(RACK)})`);
  await t.dbg(`setRailMode('pools')`);
  await t.dbg(`setRailSelection(${JSON.stringify(TRIO)})`);

  // SHORT, which the dealt rack makes unavoidable. Eighteen pools and three
  // shelf heads fill the column to its foot at the 1000px above and scroll
  // below roughly 975 — i.e. on every real laptop. `#rail-pools` hides its
  // scrollbar (`scrollbar-width: none`), so the only standing cue that there
  // is more rack is the 14px mask fade at the list's own lower edge. 760px is
  // an ordinary window, and it is where the whole MOTIVATIONS shelf goes
  // below the fold. A tall frame can show none of this and the twelve-pool
  // fixture never had to: twelve pools left the column a third empty.
  await viewport(760);
  console.log(await crop('rail-short.png'));
  await t.eval(`document.getElementById('rail-pools').scrollTop = 1e4`);
  console.log(await crop('rail-short-scrolled.png'));
  await t.eval(`document.getElementById('rail-pools').scrollTop = 0`);
  await viewport(1000);

  // …and with dice on the felt, which is the only state that shows the
  // contextual ✕ in the foot's right corner. The left cluster must not
  // have shifted to make room for it.
  await t.dbg('railRoll()');
  await t.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy'
    + ' && window.__diceDebug.tableDice.length > 0)', { desc: 'dice land' });
  console.log(await crop('rail-dice.png'));

  // A POPULATED TABLE, COLLAPSED — the frame G5 asked for, and it comes back
  // EMPTY. `#left-panel.collapsed #rail-roster { display: none }` (css:1710)
  // drops the whole roster while collapsed, so four seats render exactly like
  // one: your chip, and no one else. The rule's own comment argues "56px has
  // no room for a word", a width this column left behind when §7.22 took it
  // to 104px. Keep the frame — the point is that it is indistinguishable from
  // rail-rest.png — and print the computed display so nobody reads it as a
  // capture that failed. The row where the pills DO render, and where the
  // geometry moves, is panel-look.mjs's panel-roster.png.
  for (const [origin, name] of [['127.0.0.1', 'Mara'], ['127.0.0.2', 'Devi'], ['127.0.0.3', 'Bram']]) {
    await stage.tab(origin, name);
  }
  await t.waitFor(`window.__diceDebug.presenceRow.pills.length === 3`, { desc: 'four seats' });
  console.log('roster pills:', JSON.stringify(await t.dbg('presenceRow.pills')),
    '· #rail-roster display:',
    await t.eval(`getComputedStyle(document.getElementById('rail-roster')).display`));
  console.log(await crop('rail-roster.png'));
} finally {
  await stage.close();
}
