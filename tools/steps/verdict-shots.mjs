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

// THE FOUR FRAMES NO EXISTING STEP TAKES (Joe's LOOK queue, ROADMAP #1).
// glade-look, life-look and record-look already carry the other three items;
// these four had their arguments written down in prose and their pictures
// never rendered:
//
//   crop    C27 — does a cropped felt still read as a table? The SAME seeded
//           throw shot twice, `setFraming({preferDice:true})` off and on, at a
//           390px phone and a 1600px desktop, for 3d6 / 6d6 / 40d6. The
//           option is inert as shipped; this is the picture of what turning
//           it on would buy and what it would cost.
//   bench   `std` ↕ `round .090` ↕ `round .130` on the lab bench, the three
//           rows at the SAME hero distance so the edge treatment is the only
//           thing that differs. Its CALL is answered (§9c chose round .090 on
//           2026-08-18 and it shipped), so this shoots no open question today;
//           it is kept for §9c Tier 3, which asks the next one.
//   set     W4 — the Moonmoot Witchlight set as ART: the lab's row and hero
//           views under the felt lamp and in the dark, where a carved-and-lit
//           digit either blooms or does nothing. The frames of it IN the
//           venue come from glade-look (`glade-*-dice.png`) — both halves are
//           needed, because the venue lights its own dice.
//   stump   hollowbole round 6 — the berm, the root-flare fingers and the
//           moss creep, at two low eyes under both palettes. The verdict is
//           "grown, not placed": does the model own its transition to the
//           ground, or is it still an item set on a table (W2c, Joe).
//
//   node tools/drive.mjs tools/steps/verdict-shots.mjs            # all four
//   node tools/drive.mjs tools/steps/verdict-shots.mjs crop bench # a subset
//
// Writes shots/v-*.png plus shots/verdict-data.json — the MEASURED numbers
// each frame was taken at (die span in px, the framing rung, the lab's
// geometry fingerprints). The sheet captions itself from that file rather
// than from numbers quoted out of a doc, which is how a caption goes stale.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');
const DATA = join(SHOTS, 'verdict-data.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The manifest is MERGED, never clobbered: the four sections are runnable
// independently (`… verdict-shots.mjs crop`) and a partial re-run must not
// silently delete the other three sections' numbers and leave the sheet
// captioning frames it can no longer describe.
function mergeData(patch) {
  let cur = {};
  if (existsSync(DATA)) { try { cur = JSON.parse(readFileSync(DATA, 'utf8')); } catch { cur = {}; } }
  const out = { ...cur, ...patch, generated: new Date().toISOString() };
  writeFileSync(DATA, `${JSON.stringify(out, null, 2)}\n`);
}

async function labPage(stage) {
  const page = await stage.ctx.browser.newPage();
  await page.navigate(`http://localhost:${stage.port}/lab.html`);
  const deadline = Date.now() + 40000;
  for (;;) {
    const ready = await page.eval('!!(window.__lab && window.__lab.ready)').catch(() => false);
    if (ready === true) break;
    if (Date.now() > deadline) throw new Error('lab never became ready');
    await sleep(200);
  }
  await page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, page.sessionId);
  await page.eval('window.__lab.setRotate(false)');
  // THE LAB'S CHROME IS DEV FURNITURE, and it costs 40% of the frame. The
  // three panels are `position: fixed` overlays, so hiding them removes the
  // furniture WITHOUT moving the camera — `frameCamera`/`zoomDie` fit against
  // window.innerWidth, which an overlay never touched. A cropped screenshot
  // would have re-framed the die; this does not.
  await page.eval(`(() => { for (const id of ['side', 'builder', 'bar']) {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  } return true; })()`);
  await sleep(300);
  return page;
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
      await t.dbg('setFraming({preferDice: false, floor: 1})');

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
// 9c — the std recipe on the lab bench
// ---------------------------------------------------------------------------

// THE CALL THIS RIG WAS BUILT FOR IS ANSWERED (2026-08-18: `round .090`,
// shipped — SHIPPED §9c "the standard edge"). The rig is kept because §9c
// Tier 3 asks the next question about the same surface, and because a
// three-way at one hero distance is how an edge gets decided here. What is
// SHIPPED is now `std` and `lab.round090` BOTH — their d6 meshes are
// bit-identical, so the two rows are a self-check on the rig: if those two
// frames ever differ, the bench and the app have come apart.
const BENCH_ROWS = [
  { id: 'std', label: 'std — the shipped edge (round .090 since 2026-08-18)' },
  { id: 'lab.round090', label: 'round .090 — the bench row std is built from' },
  { id: 'lab.round130', label: 'round .130 — the recipe ceiling' },
];

async function shootBench(stage, page) {
  await page.eval(`window.__lab.setEnv('table')`);
  await sleep(300);
  const geo = await page.eval('JSON.stringify(window.__lab.geoStats())');
  const stats = JSON.parse(geo);
  const rows = [];
  for (const r of BENCH_ROWS) {
    const ok = await page.eval(`window.__lab.zoomRow(${JSON.stringify(r.id)})`);
    if (ok !== true) throw new Error(`lab has no row '${r.id}' — the bench moved`);
    await sleep(250);
    await page.screenshot(join(SHOTS, `v-9c-${r.id}-row.png`));
    for (const type of ['d6', 'd20']) {
      const hit = await page.eval(`window.__lab.zoomDie(${JSON.stringify(r.id)}, ${JSON.stringify(type)})`);
      if (hit !== true) throw new Error(`lab could not frame ${r.id}/${type}`);
      await sleep(250);
      await page.screenshot(join(SHOTS, `v-9c-${r.id}-${type}.png`));
    }
    rows.push({ id: r.id, label: r.label, ...(stats[r.id] || {}) });
    console.log(`  bench ${r.id}: verts=${stats[r.id]?.verts} r=${stats[r.id]?.r}`);
  }
  await page.eval('window.__lab.zoomRow(null)');
  mergeData({ bench: rows });
}

// ---------------------------------------------------------------------------
// W4 — the Moonmoot Witchlight set as art
// ---------------------------------------------------------------------------

const SET_ID = 'moonmoot.witchlight';

async function shootSet(stage, page) {
  const rows = [];
  for (const env of ['table', 'dark']) {
    await page.eval(`window.__lab.setEnv(${JSON.stringify(env)})`);
    await sleep(350);
    const ok = await page.eval(`window.__lab.zoomRow(${JSON.stringify(SET_ID)})`);
    if (ok !== true) {
      throw new Error(`lab has no row '${SET_ID}' — the set left the registry`);
    }
    await sleep(250);
    await page.screenshot(join(SHOTS, `v-set-${env}-row.png`));
    await page.eval(`window.__lab.zoomDie(${JSON.stringify(SET_ID)}, 'd20')`);
    await sleep(250);
    await page.screenshot(join(SHOTS, `v-set-${env}-d20.png`));
    rows.push(env);
    console.log(`  set ${env}: row + d20`);
  }
  // The neighbour that makes the value read legible: the SAME frame of the
  // house set the recipe was reasoned against (Black Anvil's structure,
  // inverted to cold — js/themes.js). Without it "the body is a quiet step
  // above the floor" is a sentence rather than a comparison.
  await page.eval(`window.__lab.setEnv('dark')`);
  await sleep(300);
  await page.eval(`window.__lab.zoomDie('emberforge.blackanvil', 'd20')`);
  await sleep(250);
  await page.screenshot(join(SHOTS, 'v-set-dark-blackanvil-d20.png'));
  await page.eval('window.__lab.zoomRow(null)');
  mergeData({ set: { envs: rows, setId: SET_ID } });
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
  const want = new Set(args.filter((a) => /^(crop|bench|set|stump)$/.test(a)));
  const run1 = (name) => want.size === 0 || want.has(name);
  mkdirSync(SHOTS, { recursive: true });

  if (run1('crop') || run1('stump')) {
    const t = await stage.tab('localhost', 'Verdict');
    if (run1('crop')) { console.log('\n— C27, the cropped felt —'); await shootCrop(stage, t); }
    if (run1('stump')) { console.log('\n— hollowbole round 6, the grounded stump —'); await shootStump(stage, t); }
  }
  if (run1('bench') || run1('set')) {
    const page = await labPage(stage);
    if (run1('bench')) { console.log('\n— 9c, the std recipe —'); await shootBench(stage, page); }
    if (run1('set')) { console.log('\n— W4, Moonmoot Witchlight —'); await shootSet(stage, page); }
    await page.close();
  }
  console.log(`\nwrote ${SHOTS}/v-*.png and ${DATA}`);
}
