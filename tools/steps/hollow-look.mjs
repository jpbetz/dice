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

// THE LOOK SET for Hollow Bole (ROADMAP W3). tower-family-shots answers
// "does it belong to the family"; this answers the two questions that are
// specific to a VENUE tower and that no existing step can ask:
//
//   · does the silhouette read as a DEAD HOLLOW TRUNK at the tower eye
//     (~16 px/u), where the moot is authored to be legible and the bole is
//     authored to be a black shape with a broken top;
//   · does it hold up under BOTH SKIES. The model is one build with two
//     palettes, and a palette that works on a glade floor is not
//     automatically a palette that works on bark.
//
// Six frames: resting eye and tower eye, under each palette, plus a close
// look at the crown moot and one at the little lit door — the two features
// that are emissive and therefore the two a still frame can lie about.
//
//   node tools/drive.mjs tools/steps/hollow-look.mjs [tower]
//
// Writes shots/hollow-*.png in the worktree root (gitignored).

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

export default async function run(stage, args) {
  const tower = args[0] || 'hollowbole';
  mkdirSync(SHOTS, { recursive: true });

  const t = await stage.tab('localhost', 'HollowLook');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  const shot = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    console.log(await stage.shot(t, join(SHOTS, name)));
  };

  await t.dbg(`setZoom('medium')`);
  await t.waitFor(`window.__diceDebug.zoom === 'medium'`, { desc: 'zoom medium' });
  await t.dbg(`setTower('${tower}')`);
  await t.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: `${tower} socketed` });
  await t.dbg('sim(1500)');

  for (const pal of ['moonrise', 'foxfire']) {
    await t.dbg(`faeTowerPalette('${pal}')`);
    await t.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: `${pal} rebuilt` });
    await t.dbg('sim(1500)');
    // 1. THE RESTING EYE — the frame a player sees most: empty felt, the
    //    camera parked on the tower, waiting for a roll.
    await shot(`hollow-${pal}-1-resting-eye.png`);
    // 2. THE TOWER EYE — the review distance the fae dossier measured all
    //    its size thresholds at (~16 px/u).
    await t.dbg('towerEye(16, 9, 5)');
    await shot(`hollow-${pal}-2-tower-eye.png`);
    // 3. THE CROWN MOOT, close. Emissive at prop scale is the thing a wide
    //    frame lies about in both directions — invisible or a blob.
    await t.dbg('towerEye(9, 12.5, 3.2)');
    await shot(`hollow-${pal}-3-crown-moot.png`);
    // 4. THE LITTLE DOOR, close and low — the tower's one warm accent and
    //    the only place the ember light lands.
    await t.dbg('towerEye(7, 3.0, -3.6)');
    await shot(`hollow-${pal}-4-door.png`);
    await t.dbg(`setZoom('medium')`);
    await t.dbg('sim(1200)');
  }
  await t.dbg(`faeTowerPalette(null)`);

  // 5 and 6. IN THE VENUE, which is the only room this tower will ever
  //    stand in. Judging a venue tower in the table's lamplit room is
  //    judging it somewhere it does not live — the glade has a moon rig at
  //    a different colour and intensity, a dark ground and its own fog, and
  //    all three change what the bark is worth. The family lineup still
  //    belongs in the table room (that is what "does it belong" means);
  //    these two are what "does it work" means.
  for (const venue of ['moonrise', 'foxfire']) {
    await t.dbg(`setVenue('${venue}')`);
    await t.waitFor(`window.__diceDebug.venue === '${venue}'`, { desc: `${venue} staged` });
    // The venue's own patch may or may not carry the tower yet (the linkage
    // is the main session's); ask for it explicitly so the frame is about
    // the model either way.
    await t.dbg(`setTower('${tower}')`);
    await t.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: 'tower up in venue' });
    await t.dbg('sim(1800)');
    await shot(`hollow-${venue}-5-in-venue-resting.png`);
    await t.dbg('towerEye(17, 9.5, 5.5)');
    await shot(`hollow-${venue}-6-in-venue-tower-eye.png`);
    await t.dbg(`setZoom('medium')`);
    await t.dbg('sim(1200)');
    await shootPour(t, shot, venue);
  }
  await t.dbg(`setVenue('table')`);
  console.log(`\nwrote ${SHOTS}/hollow-*.png`);
}

// THE FRAMES NOBODY HAD EVER TAKEN. The W3 handoff named this explicitly —
// "dice actually falling in and exiting out has NEVER been visually verified"
// — and it stayed named rather than shot because the entry is SHORT: about
// 0.28 s of fall under g = -110, which is ~17 frames out of a film several
// hundred long. tower-family-shots samples it with a hard-coded sim(9) and
// says so; a third of the way to firstExitTime lands on an empty tower.
//
// SO THE FILM IS ASKED WHERE ITS OWN ENTRY IS. towerFilmInfo().spans[i][0] is
// [materialise, despawn] in frame indices for die i — the exact window in
// which that die exists above the crown and has not yet gone dark behind the
// cowl. A frame at 55% of that window is mid-flight BY CONSTRUCTION rather
// than by arithmetic somebody tuned once and nobody re-checked. Entries
// stagger 0.12-0.20 s apart, so the LAST die's window is the fullest sky and
// gets its own frame.
async function shootPour(t, shot, label) {
  await t.dbg(`commandRoll('8d6')`);
  await t.waitFor('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
    { desc: `${label}: the pour reached the client` });
  const f = JSON.parse(await t.eval('JSON.stringify(window.__diceDebug.towerFilmInfo())'));
  if (!f || !f.pour || !f.spans || !f.spans.length) {
    console.log(`NOTE: ${label}: no pour film to sample (pour=${f && f.pour}) — skipping mid-flight`);
    return;
  }
  // sim() only ever goes forward, so the playhead is tracked rather than
  // recomputed — asking for a frame already passed must be a no-op, not a
  // negative sim() that silently does nothing while the caller believes it
  // moved.
  let at = 0;
  const to = async (frame) => {
    const want = Math.max(0, Math.round(frame));
    if (want > at) { await t.dbg(`sim(${want - at})`); at = want; }
  };
  const midOf = (span, k = 0.55) => span[0] + (span[1] - span[0]) * k;

  // 7. THE FIRST DIE IN THE MOUTH, from just above and outside the crown —
  //    the angle that can actually see down the bore. Expect a sliver: the
  //    die is inside a dark throat and the point is whether the throat READS
  //    as a throat with something falling into it.
  await t.dbg('towerEye(10, 12.0, 3.0)');
  await to(midOf(f.spans[0][0]));
  await shot(`hollow-${label}-7-pour-midflight-mouth.png`);

  // 8. THE SAME MOMENT FROM THE RESTING EYE — the frame a player actually
  //    gets. If the entry only reads from a camera nobody sits at, it does
  //    not read.
  await t.dbg(`setZoom('medium')`);
  const last = f.spans.length - 1;
  await to(midOf(f.spans[last][0]));
  await shot(`hollow-${label}-8-pour-midflight-resting.png`);

  // 9. THE EXIT — dice coming out of the doorway onto the felt, which is the
  //    other half of the pour and the half the exit guarantee is about.
  await to(f.firstExitTime * 60 + 8);
  await shot(`hollow-${label}-9-first-exit.png`);

  // 10. THE SPREAD, settled: what the roll looks like when the film ends.
  await to(f.frames + 240);
  await shot(`hollow-${label}-10-spread.png`);
  console.log(`  ${label}: entry window d0=[${f.spans[0][0]}] `
    + `d${last}=[${f.spans[last][0]}] firstExit=${f.firstExitTime}s frames=${f.frames}`);

  await t.dbg('clearTable()');
  await t.dbg('sim(400)');
}
