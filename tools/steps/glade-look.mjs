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

// THE W2 GLADE LOOK — the fast tuning loop for the glade room itself
// (ROADMAP W2). hollow-look renders the whole ten-frame tower battery;
// this renders just the frame the glade lives or dies in: the resting eye
// in the venue, both palettes, tower up. ~30 s against minutes.
//
//   node tools/drive.mjs tools/steps/glade-look.mjs           # 2 frames
//   node tools/drive.mjs tools/steps/glade-look.mjs probe     # + element
//     A/B forensics: each named glade element hidden one at a time (the
//     W3 ghost lesson — when a frame won't cohere, stop theorizing and
//     start hiding).
//
// Writes shots/glade-*.png.

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

export default async function run(stage, args) {
  const probe = args.includes('probe');
  const probeNames = ['faeMoonShaft', 'faeMistBand', 'faeMirrorPool'];
  mkdirSync(SHOTS, { recursive: true });

  const t = await stage.tab('localhost', 'GladeLook');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  const shot = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    console.log(await stage.shot(t, join(SHOTS, name)));
  };

  for (const venue of ['moonrise', 'foxfire']) {
    await t.dbg(`setVenue('${venue}')`);
    await t.waitFor(`window.__diceDebug.venue === '${venue}'`, { desc: `${venue} staged` });
    await t.dbg(`setTower('hollowbole')`);
    await t.waitFor(`window.__diceDebug.tower === 'hollowbole'`, { desc: 'tower up' });
    await t.dbg('sim(1500)');
    await shot(`glade-${venue}-resting.png`);
    // W4: the venue's own dice — the roll is MADE with the staged set
    // (venueDiceSet → wireSet), pours through the tower, and settles as
    // witchlight in the fog. The frame the set lives or dies in.
    await t.dbg(`throwSeeded(['d20','d8','d6','d6','d6','d4'], 4242)`);
    await t.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc: `dice settle in ${venue}`, timeout: 60000 });
    await t.dbg('sim(400)');
    await shot(`glade-${venue}-dice.png`);
    await t.dbg('clearTable()');
    await t.dbg('sim(200)');
    if (probe) {
      // setVisibleByName RETURNS THE COUNT IT HID, and the count is the whole
      // proof that the A/B happened: a renamed or retired element hides
      // nothing, the frame comes out IDENTICAL to the one beside it, and a
      // reviewer reads that as "this element contributes nothing" — the
      // opposite of the truth. n=0 gets a NOTE rather than a silent pair.
      for (const name of probeNames) {
        const n = await t.dbg(`setVisibleByName('${name}', false)`);
        console.log(`hid n=${n} (${name})`);
        if (n === 0) {
          console.log(`NOTE: nothing in the scene is named '${name}' — the frame below is `
            + 'the same picture as the one before it, not evidence about that element');
        }
        await shot(`glade-${venue}-no-${name}.png`);
        await t.dbg(`setVisibleByName('${name}', true)`);
      }
    }
  }
  await t.dbg(`setVenue('table')`);
  console.log(`\nwrote ${SHOTS}/glade-*.png`);
}
