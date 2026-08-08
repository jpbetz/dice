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
// Seeded with THE RACK THE APP DEALS, exactly as rail-look is: `dealtRack()`
// calls js/seed.js's own dealer (audit G5, ROADMAP U15). Both tools used to
// fixture the same twelve hand-typed pools, so every frame judged this week
// was of a character no player will ever open — eighteen pools across three
// priced shelves is what a fresh seat gets, and stacking sections is this
// panel's whole job. The fixture must keep tracking the shipped seed: change
// js/seed.js or pass another draw seed, never paste a pool list in here.
//
// Run: node tools/steps/panel-look.mjs

import { startStage, dealtRack } from '../stage.mjs';

const RACK = dealtRack();

const stage = await startStage();
try {
  const t = await stage.tab('localhost', 'Joe');
  await t.dbg(`setGroups(${JSON.stringify(RACK)})`);
  await t.dbg('setPanelState({pools: true})');

  const { writeFileSync } = await import('node:fs');
  // Tall on purpose: the panel is a COLUMN of sections, and the defect this
  // tool exists to catch is how they stack. A viewport that clips the rack
  // hides exactly that.
  const viewport = async (height) => t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1200, height, deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
  await viewport(1100);

  const crop = async (name) => {
    // Front THIS tab first — the roster frame opens three more tables, and a
    // backgrounded target answers with whatever it last painted.
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
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

  // …AND THE SAME DRAFT, SPENT (2i-E). The draft survives its own roll wearing
  // a cool-down — `.spent` on the draft zone, and a Roll title that says
  // "again". It is the well's only self-referential state and no frame had
  // ever carried it, so nobody has looked at whether "already rolled" reads
  // as cooling or as broken.
  await t.eval(`document.getElementById('tray-roll').click()`);
  await t.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy'
    + ' && window.__diceDebug.trayState.spent === true)', { desc: 'the draft goes spent' });
  console.log(await crop('panel-spent.png'));
  await t.eval(`document.getElementById('clear-tray').click()`);

  // THE BOX REFUSING. Notation is off by default, so the one section a player
  // has to opt into is also the one no capture had ever shown carrying its
  // own error — a red rule, the message, and the flag list as its hint, all
  // inside a 300px column. Typing is the real path (the paint is debounced),
  // and `advantge` is the typo the flags hint exists to answer.
  await t.dbg(`setSections({notation: true})`);
  await t.eval(`(() => {
    const i = document.getElementById('cmd-input');
    i.focus();
    i.value = '2d20 advantge';
    i.dispatchEvent(new Event('input'));
  })()`);
  await t.waitFor(`document.getElementById('cmd').classList.contains('is-invalid')`,
    { desc: 'the box goes red' });
  console.log(await crop('panel-invalid.png'));
  await t.eval(`document.getElementById('clear-tray').click()`);
  await t.dbg(`setSections({notation: false})`);

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
  await viewport(640);
  await t.dbg(`setSections({dice: true, notation: true, pools: true})`);
  console.log(await crop('panel-short.png'));
  await t.eval(`document.querySelector('#builder-panel > .panel-body').scrollTop = 300`);
  console.log(await crop('panel-scrolled.png'));
  await t.eval(`document.querySelector('#builder-panel > .panel-body').scrollTop = 0`);
  await t.dbg(`setSections({dice: true, notation: false, pools: true})`);
  await viewport(1100);

  // A POPULATED PRESENCE ROW. The rail heads the panel in BOTH states, and
  // the roster is the one thing in it whose geometry moves — your chip is
  // pinned top-left and teammates grow rightward from it until they wrap.
  // Wide, the wrap lands somewhere quite different from the 104px column
  // rail-look frames, and the row pushes the whole panel down either way.
  for (const [origin, name] of [['127.0.0.1', 'Mara'], ['127.0.0.2', 'Devi'], ['127.0.0.3', 'Bram']]) {
    await stage.tab(origin, name);
  }
  await t.waitFor(`window.__diceDebug.presenceRow.pills.length === 3`, { desc: 'four seats' });
  console.log(await crop('panel-roster.png'));
} finally {
  await stage.close();
}
