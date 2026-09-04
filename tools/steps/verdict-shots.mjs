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

// THE FRAMES NO EXISTING STEP TAKES (Joe's LOOK queue, ROADMAP #1).
// glade-look, life-look and record-look already carry the other items; these
// had their arguments written down in prose and their pictures never
// rendered. Four when this step was written; two since the lab retired (see
// below):
//
//   crop    C27 — does a cropped felt still read as a table? The SAME seeded
//           throw shot twice, `setFraming({preferDice:true})` off and on, at a
//           390px phone and a 1600px desktop, for 3d6 / 6d6 / 40d6. The
//           option is inert as shipped; this is the picture of what turning
//           it on would buy and what it would cost.
//   stump   hollowbole round 6 — the berm, the root-flare fingers and the
//           moss creep, at two low eyes under both palettes. The verdict is
//           "grown, not placed": does the model own its transition to the
//           ground, or is it still an item set on a table (W2c, Joe).
//
// TWO OF THE FOUR RETIRED WITH THE LAB (2026-09-03, docs/DEVMODE.md §9 phase
// D3). `bench` (§9c's three edge treatments at one hero distance) and `set`
// (W4's Witchlight row and hero views) were both shot on lab.html, and when
// lab.html retired they had nowhere to stand. Neither shoots an open question:
// §9c chose round .090 on 2026-08-18 and it shipped, and W4's set art was
// approved in the same sitting — tools/verdict-sheet.mjs stopped rendering
// either group before this, which is how they came to be shooting for nobody.
// A hero frame of one dice set is owed again the day §9c Tier 3 asks the next
// edge question; DEVMODE §9 carries it as owed, and it will be shot from the
// real felt through the panel's sets section, not from a second renderer.
//
//   node tools/drive.mjs tools/steps/verdict-shots.mjs            # both
//   node tools/drive.mjs tools/steps/verdict-shots.mjs crop       # a subset
//
// Writes shots/v-*.png plus shots/verdict-data.json — the MEASURED numbers
// each frame was taken at (die span in px, the framing rung, which tower skin
// was live under each venue). The sheet captions itself from that file rather
// than from numbers quoted out of a doc, which is how a caption goes stale.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');
const DATA = join(SHOTS, 'verdict-data.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The manifest is MERGED, never clobbered: the sections are runnable
// independently (`… verdict-shots.mjs crop`) and a partial re-run must not
// silently delete the other sections' numbers and leave the sheet captioning
// frames it can no longer describe. It is also what still holds the retired
// `bench` and `set` rows from the sitting they were shot for.
function mergeData(patch) {
  let cur = {};
  if (existsSync(DATA)) { try { cur = JSON.parse(readFileSync(DATA, 'utf8')); } catch { cur = {}; } }
  const out = { ...cur, ...patch, generated: new Date().toISOString() };
  writeFileSync(DATA, `${JSON.stringify(out, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// C27 — the cropped felt
// ---------------------------------------------------------------------------

const CROP_VIEWS = [
  { id: 'phone', label: 'phone 390', w: 390, h: 844, mini: true },
  { id: 'desktop', label: 'desktop 1600', w: 1600, h: 1000, mini: false },
];
// The same three pools C27's own table argues from, at the same fixed seeds
// frame-small.mjs uses, so the picture and the numbers are the SAME THROW.
const CROP_POOLS = [
  { id: '3d6', types: ['d6', 'd6', 'd6'], seed: 7002 },
  { id: '6d6', types: Array(6).fill('d6'), seed: 7004 },
  { id: '40d6', types: Array(40).fill('d6'), seed: 7007 },
];

async function shootCrop(stage, t) {
  const rows = [];
  for (const vp of CROP_VIEWS) {
    await t.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
    await t.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await t.dbg(`setZoom('medium')`);
    await t.eval('window.dispatchEvent(new Event("resize"))');
    await sleep(300);

    for (const pool of CROP_POOLS) {
      await t.dbg('clearTable()');
      await t.dbg('sim(400)');
      await t.dbg(`throwSeeded(${JSON.stringify(pool.types)}, ${pool.seed})`);
      await t.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${vp.label} ${pool.id}`, timeout: 60000 });
      await t.dbg('sim(600)');

      // OFF is shot FIRST and the instrument is reset after ON, so a frame is
      // never taken through a camera the previous pool left behind — the
      // framing state is per-tab and outlives a throw.
      await t.dbg('setFraming({preferDice: false, floor: 1})');
      const off = await t.dbg('framingInfo()');
      await t.eval('window.__diceDebug.tick(0, true, false)');
      await stage.shot(t, join(SHOTS, `v-crop-${vp.id}-${pool.id}-off.png`));

      await t.dbg('setFraming({preferDice: true})');
      const on = await t.dbg('framingInfo()');
      await t.eval('window.__diceDebug.tick(0, true, false)');
      await stage.shot(t, join(SHOTS, `v-crop-${vp.id}-${pool.id}-on.png`));
      // Back to what SHIPS, which since 2026-08-18 is `on` — a leg that left
      // the tab on the counterfactual would hand the next pool a camera the
      // app does not use.
      await t.dbg('setFraming({preferDice: true, floor: 1})');

      rows.push({
        view: vp.id, viewLabel: vp.label, pool: pool.id,
        offSpan: off.spanPx, onSpan: on.spanPx,
        offMode: off.mode, onMode: on.mode,
        offOn: `${off.diceOnScreen}/${off.dice}`, onOn: `${on.diceOnScreen}/${on.dice}`,
      });
      console.log(`  crop ${vp.id} ${pool.id}: span ${off.spanPx} (${off.mode}) → `
        + `${on.spanPx} (${on.mode}); on screen ${off.diceOnScreen}/${off.dice} → `
        + `${on.diceOnScreen}/${on.dice}`);
    }
  }
  await t.dbg('clearTable()');
  await t.dbg('setPanelState({pools: true, log: true})');
  mergeData({ crop: rows });
}

// ---------------------------------------------------------------------------
// hollowbole round 6 — the grounded stump
// ---------------------------------------------------------------------------

// [id, dist, height, xoff] in towerEye's own arguments, and BOTH ARE HIGH —
// which is the opposite of the obvious answer and the reason it was swept
// rather than reasoned. `towerEye` has a FIXED lookAt at 5.2·S (the model's
// middle), so a low camera tilts UP and pushes the ground out of frame
// entirely: (9, 3.2, 0) put the base below the bottom edge and returned a
// photograph of bark. A camera ABOVE the target tilts down and brings the
// skirt back in. Swept six candidates, kept the two that show the transition:
// one from each flank, so the berm crest and the root fingers each get a
// frame that is not a three-quarter view of the other.
const STUMP_EYES = [
  ['berm', 14, 10, 4],
  ['flank', 13, 11, -5],
];

async function shootStump(stage, t) {
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  const seen = [];
  for (const venue of ['moonrise', 'foxfire']) {
    await t.dbg(`setVenue('${venue}')`);
    await t.waitFor(`window.__diceDebug.venue === '${venue}'`, { desc: `${venue} staged` });
    await t.dbg(`setTower('hollowbole')`);
    await t.waitFor(`window.__diceDebug.tower === 'hollowbole'`, { desc: 'tower up' });
    await t.dbg('sim(1500)');
    for (const [id, dist, height, xoff] of STUMP_EYES) {
      await t.dbg(`towerEye(${dist}, ${height}, ${xoff})`);
      await t.eval('window.__diceDebug.tick(0, true, false)');
      await stage.shot(t, join(SHOTS, `v-stump-${venue}-${id}.png`));
    }
    // The palette flip is the bug this round shipped a fix for (towerReskin):
    // the moonrise model stood in the foxfire world for two rounds. Recording
    // WHICH skin is live under each venue is what makes these two frames a
    // pair rather than two photographs of the same object.
    const audit = await t.dbg('towerModelAudit()');
    seen.push({ venue, tower: audit && audit.tower, meshes: audit && audit.meshes });
    console.log(`  stump ${venue}: tower=${audit && audit.tower} meshes=${audit && audit.meshes}`);
    await t.dbg(`setZoom('medium')`);
    await t.dbg('sim(600)');
  }
  await t.dbg(`setVenue('table')`);
  mergeData({ stump: seen });
}

// ---------------------------------------------------------------------------

export default async function run(stage, args = []) {
  const want = new Set(args.filter((a) => /^(crop|stump)$/.test(a)));
  const run1 = (name) => want.size === 0 || want.has(name);
  mkdirSync(SHOTS, { recursive: true });

  if (run1('crop') || run1('stump')) {
    const t = await stage.tab('localhost', 'Verdict');
    if (run1('crop')) { console.log('\n— C27, the cropped felt —'); await shootCrop(stage, t); }
    if (run1('stump')) { console.log('\n— hollowbole round 6, the grounded stump —'); await shootStump(stage, t); }
  }
  console.log(`\nwrote ${SHOTS}/v-*.png and ${DATA}`);
}
