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

// WHICH MESH PAINTS THE THING I AM LOOKING AT? — frame forensics, at the
// resting eye, in the app's own room.
//
//   node tools/drive.mjs tools/steps/flare-probe.mjs [moonrise|foxfire]
//
// It shoots the frame once with everything up and once per named group with
// that group hidden, so "what is that" stops being an argument about renders
// and becomes a difference between two PNGs. Compare with, e.g.:
//
//   magick shots/flareprobe-moonrise-all.png \
//          shots/flareprobe-moonrise-no-towerSkinBoleShell.png \
//          -compose difference -composite -colorspace Gray -threshold 4% \
//          -format "%@\n" info:
//
// WHAT IT SETTLED IN ROUND 10, and it is why the file is kept. The pale
// ruffled band at the Hollow Bole's foot — the thing three rounds of paint and
// one of shape have been aimed at — is painted by `towerSkinBoleShell` and by
// nothing else: hiding the shell removes it entirely, and hiding
// `towerSkinDress`, `towerSkinBoleShelves`, `towerSkinBoleCurtain` and
// `aoContactShadow` each leaves it untouched. So it is the baked model, not
// the dressing and not the venue.
//
// WHAT IT DID NOT SETTLE, stated because the next round needs to know where
// the cheap answer stops. It cannot say WHICH SURFACE of the shell, and round
// 10 spent three bakes finding that out the expensive way: the root envelopes,
// the bay ceiling and the base band's grain frequency were each changed, each
// moved the field measurably, and none of them moved those pleats. The
// instrument this round wanted and did not have is a PAINT BISECT — one
// diagnostic bake with each surface class (outer wall / wound cut face /
// liner) at a flat separable colour, shot once. Do that before changing any
// more geometry.
//
// `worldToScreen`'s px are CANVAS-relative, not frame-relative: the left panel
// is ~315 CSS px wide and the screenshot includes it. Add that offset and
// double for deviceScaleFactor 2 before comparing to a PNG column.

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

const GROUPS = ['towerSkinBoleShell', 'towerSkinBoleShelves', 'towerSkinBoleCurtain',
  'towerSkinDress', 'towerDressFx', 'aoContactShadow'];

export default async function run(stage, args) {
  const venue = args.find((a) => a === 'moonrise' || a === 'foxfire') || 'moonrise';
  mkdirSync(SHOTS, { recursive: true });
  const t = await stage.tab('localhost', 'FlareProbe');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  await t.dbg(`setVenue('${venue}')`);
  await t.waitFor(`window.__diceDebug.venue === '${venue}'`, { desc: `${venue} staged` });
  await t.dbg('setTower(\'hollowbole\')');
  await t.waitFor('window.__diceDebug.tower === \'hollowbole\'', { desc: 'tower up' });
  await t.dbg('sim(1500)');

  const shot = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    return stage.shot(t, join(SHOTS, name));
  };
  await shot(`flareprobe-${venue}-all.png`);
  let bad = 0;
  for (const n of GROUPS) {
    const k = Number(await t.eval(
      `window.__diceDebug.setVisibleByName(${JSON.stringify(n)}, false)`));
    await shot(`flareprobe-${venue}-no-${n}.png`);
    await t.eval(`window.__diceDebug.setVisibleByName(${JSON.stringify(n)}, true)`);
    console.log(`hid ${n}: ${k} node(s)`);
    // The shell is the one group that MUST exist — a probe that silently found
    // nothing would shoot the same frame six times and read as "it is not the
    // model".
    if (n === 'towerSkinBoleShell' && k !== 1) {
      console.log(`  BAD — expected exactly 1 ${n} node`);
      bad++;
    }
  }
  const errs = t.page.errors.concat(t.page.consoleErrors);
  if (errs.length) { console.log(`PAGE ERRORS: ${errs.join(' | ')}`); bad++; }
  console.log(bad ? `BAD: ${bad} problem(s)` : 'probe ok');
  if (bad) process.exitCode = 1;
}
