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

// THE LIVING LAYER'S LOOK LOOP (ROADMAP W5). glade-look judges the ROOM,
// which is static and therefore fair to photograph once. A living layer
// is not: one frame of a blinking field says nothing about whether the
// field reads, and nothing at all about the two gestures that justify it
// — the withdrawal while dice fly and the lean once they are down.
//
// So this renders the same eye at several PHASES and in the three table
// states the governor distinguishes:
//
//   phase-a / phase-b  the resting eye, 20 s apart — does the population
//                      read the same way at two unrelated moments, or did
//                      one lucky frame carry it?
//   session            the moot with the procession standing in it, found
//                      by stepping until mood.session peaks rather than by
//                      guessing a timestamp
//   flying             mid-film: the glade should have STEPPED BACK
//   settled            dice down: the glade leans in, and nothing alive
//                      may be over the felt in the frame
//
// Both palettes, every time — foxfire's value floor is a different world
// and a tertiary field is exactly the thing that dies in it.
//
//   node tools/drive.mjs tools/steps/life-look.mjs
//   node tools/drive.mjs tools/steps/life-look.mjs probe   # + hide-one-at-a-time
//
// Writes shots/life-*.png and prints the numbers each frame was taken at,
// so a verdict can cite the frame it was formed on.

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

export default async function run(stage, args) {
  const probe = args.includes('probe');
  mkdirSync(SHOTS, { recursive: true });

  const t = await stage.tab('localhost', 'LifeLook');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');

  const shot = async (name, note) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    const L = await t.dbg('lifeInfo()');
    console.log(`${name}  t=${L.t.toFixed(1)}s  life=${L.mood.life.toFixed(2)} `
      + `lean=${L.mood.lean.toFixed(2)} session=${L.mood.session.toFixed(2)} `
      + `mootGain=${L.moot.gain} capPeak=${L.moot.capPeak} `
      + `fliesPeak=${L.fliesPeak} wispPeak=${L.wispPeak} inBox=${L.inBox}`
      + (note ? `  — ${note}` : ''));
    console.log(await stage.shot(t, join(SHOTS, name)));
  };

  for (const venue of ['moonrise', 'foxfire']) {
    await t.dbg(`setVenue('${venue}')`);
    await t.waitFor(`window.__diceDebug.venue === '${venue}'`, { desc: `${venue} staged` });
    await t.dbg(`setTower('hollowbole')`);
    await t.waitFor(`window.__diceDebug.tower === 'hollowbole'`, { desc: 'tower up' });

    await t.dbg('sim(1500)');                       // 25 s in
    await shot(`life-${venue}-phase-a.png`);
    await t.dbg('sim(1200)');                       // +20 s — an unrelated moment
    await shot(`life-${venue}-phase-b.png`);

    // THE MOOT IN SESSION. Found, not guessed: step until the ring's
    // visitors have actually arrived, so the frame shows the gesture
    // rather than whatever the clock happened to be doing.
    let best = -1, tries = 0;
    while (best < 0.6 && tries++ < 40) {
      await t.dbg('sim(60)');
      best = (await t.dbg('lifeInfo().mood')).session;
    }
    await shot(`life-${venue}-session.png`, `session peak ${best.toFixed(2)} after ${tries} steps`);

    // MID-FILM: the glade steps back while the dice are the event.
    await t.dbg(`throwSeeded(['d20','d8','d6','d6'], 4242)`);
    await t.dbg('sim(40)');
    await shot(`life-${venue}-flying.png`, 'mid-film — the layer should be withdrawn');

    // SETTLED: it comes back out and leans toward the clearing.
    await t.dbg('sim(600)');
    await shot(`life-${venue}-settled.png`, 'dice down — the lean');

    if (probe) {
      for (const name of ['faeFireflies', 'faeWisps', 'faeMoot']) {
        await t.dbg(`setVisibleByName('${name}', false)`);
        await shot(`life-${venue}-no-${name}.png`, `without ${name}`);
        await t.dbg(`setVisibleByName('${name}', true)`);
      }
    }

    await t.dbg('clearTable()');
    await t.dbg('sim(200)');
  }
  await t.dbg(`setVenue('table')`);
}
