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

// LOOK AT THE TOUCH DRESS. The third look tool, after rail-look (collapsed)
// and panel-look (expanded) — both of which frame a FINE pointer at a tall
// desktop viewport, which is the one configuration U28/U29/U30 do not change.
//
// Every rule those items moved is gated behind `(pointer: coarse)` or a
// height branch, so the shipped tools were structurally incapable of showing
// them: a coarse-only rule is invisible to a tool that never emulates touch.
// That is the same blindness the audit found in the suite itself (seven of
// eight coarse blocks fixed VISIBILITY, one fixed SIZE, and every touch
// assertion pointed at one control).
//
// The measurements are the e2e suite's job (`touch-targets` walks the list).
// This tool answers what a number cannot: a control can pass 34×34 and still
// look wrong — a ✕ that now crowds the label beside it, a rim whose tools
// fit but no longer read as a row, a rack that got its height back and spent
// it on emptiness. §7.22's rule binds here too: looking at it is not optional.
//
// Run: node tools/steps/touch-look.mjs

import { startStage, dealtRack } from '../stage.mjs';

const RACK = dealtRack();

// 768×1024 is the tablet this dress is FOR, and it is also the viewport U30
// deliberately excludes (its branch is max-height 780) — so this frame shows
// the touch bump WITHOUT the short-column tightening, which is the state a
// tablet in portrait actually gets. The laptop frame below carries the other.
const TABLET = { width: 768, height: 1024 };
const LAPTOP = { width: 1366, height: 768 };

const stage = await startStage();
try {
  const t = await stage.tab('localhost', 'Joe');
  await stage.tab('127.0.0.1', 'Sam'); // a teammate: #offer-pick only unhides with one
  await t.dbg(`setGroups(${JSON.stringify(RACK)})`);
  await t.dbg('setPanelState({pools: true})');
  await t.settle();

  const { writeFileSync } = await import('node:fs');
  const viewport = ({ width, height }) => t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: false }, t.page.sessionId);

  // The panel plus a margin of felt: a target that grew into its neighbour
  // is only visible with the neighbour in frame.
  const crop = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    const clip = JSON.parse(await t.eval(`JSON.stringify((() => {
      const r = document.getElementById('left-panel').getBoundingClientRect();
      return { x: 0, y: 0, width: Math.ceil(r.width) + 32, height: Math.ceil(r.height), scale: 2 };
    })())`));
    const { data } = await t.page.browser.send(
      'Page.captureScreenshot', { format: 'png', clip }, t.page.sessionId);
    writeFileSync(stage.out(name), Buffer.from(data, 'base64'));
    return stage.out(name);
  };
  const full = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    const { data } = await t.page.browser.send(
      'Page.captureScreenshot', { format: 'png' }, t.page.sessionId);
    writeFileSync(stage.out(name), Buffer.from(data, 'base64'));
    return stage.out(name);
  };

  await viewport(TABLET);
  await t.emulateCoarsePointer(true);

  console.log(await crop('touch-rest.png'));

  // THE WELL AND THE RIM. Three staged dice give the ✕-per-die its row and
  // arm ± Modify / ✕ Clear / the offer chooser — the no-wrap flex row whose
  // tools each grew 10px taller inside a 260px column.
  await t.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
  await t.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
  await t.eval(`document.querySelectorAll('#die-buttons .die-btn')[5].click()`);
  console.log(await crop('touch-draft.png'));

  // THE ± POPOVER — every roll axis, and the one surface that had no coarse
  // branch at all. Steppers at 44, the switches re-knobbed, and the keep/drop
  // row wrapping rather than starving five cells to 28px.
  await t.dbg(`openPopoverFor('tray')`);
  await t.settle();
  console.log(await full('touch-popover.png'));
  await t.eval(`document.getElementById('pop-close').click()`);
  await t.eval(`document.getElementById('clear-tray').click()`);

  // MANAGE MODE. The 36px delete ✕ sits on a tile that is itself the roll
  // target — this frame is the one that says whether a bigger destructive
  // glyph reads as reachable or as looming.
  await t.dbg('setPoolsEditMode(true)');
  console.log(await crop('touch-manage.png'));

  // …AND THE UNDO IT LEAVES (U28a). Delete a counted pool from the middle of
  // the attribute shelf: the tombstone stands in the slot, and the rail that
  // deleted it is in the same frame as the badge it used to sit on top of.
  await t.eval(`[...document.querySelectorAll('.pool-tile')]
    .find((el) => el.textContent.includes('Wit')).querySelector('.tile-del').click()`);
  console.log(await crop('touch-undo.png'));
  await t.eval(`document.querySelector('.undo-restore').click()`);
  await t.dbg('setPoolsEditMode(false)');

  // THE COLLAPSED COLUMN, which is the state a tablet lives in: the source
  // switch, a counted dice row with its remover, and the foot.
  await t.dbg('setPanelState({pools: false})');
  await t.dbg(`setRailMode('dice')`);
  await t.dbg(`railTapDie('d6')`);
  await t.dbg(`railTapDie('d6')`);
  await t.dbg(`railTapDie('d20')`);
  await t.settle();
  console.log(await crop('touch-rail.png'));

  // …and with dice on the felt, so the contextual ✕ joins the foot and the
  // four glyphs have to share an 86px row at their new height.
  await t.roll('d6');
  await t.settle();
  console.log(await crop('touch-rail-full.png'));

  // U30's OTHER HALF, on a FINE pointer: the short-column branch is a height
  // question, not a touch one — a 1366×768 laptop has the identical problem
  // and none of the coarse dress. This frame is the trade itself: the well
  // gives ~45px back and the rack spends it on a third tile row.
  await t.emulateCoarsePointer(false);
  await t.dbg('setPanelState({pools: true})');
  await viewport(LAPTOP);
  await t.settle();
  console.log(await crop('touch-short-laptop.png'));
} finally {
  await stage.close();
}
