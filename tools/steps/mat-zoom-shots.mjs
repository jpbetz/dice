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

// Mat-zoom still frames — Joe 2026-08-04. Boots one headless tab, rolls
// 4d6 on each zoom preset at two window sizes (desktop 1600x1000, phone
// 720x480), plus a colour-read sanity pass at each preset in crimson
// and emerald. Every PNG lands in tools/out/mat-zoom/.
//
//   node tools/drive.mjs tools/steps/mat-zoom-shots.mjs

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

const SUB = join(OUT_DIR, 'mat-zoom');
const ZOOMS = ['wide', 'medium', 'close'];
const SIZES = [
  { label: '1600', width: 1600, height: 1000 },
  { label: '720',  width: 720,  height: 480  },
];
// Colour-read pass: one shot per preset in crimson and emerald at the
// desktop size (small-screen colour reads follow the ivory pass; the
// question here is "do the numbers survive the tint at this zoom").
const COLOUR_SETS = ['classics.crimson', 'classics.emerald'];

const beat = (ms = 400) => new Promise((r) => setTimeout(r, ms));

async function setSize(a, { width, height }) {
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  // Let the resize seam settle the camera + shelf reflow.
  await beat(200);
  await a.dbg('sim(240)');
}

async function primeZoom(a, level) {
  const cur = await a.dbg('zoom');
  if (cur !== level) {
    await a.dbg(`setZoom(${JSON.stringify(level)})`);
    // Wait for the local echo (setZoom applies immediately on the caller;
    // networked echo is irrelevant here — one tab).
    await a.waitFor(`window.__diceDebug.zoom === ${JSON.stringify(level)}`,
      { timeout: 5000, desc: `zoom → ${level}` });
  }
  await beat(150);
}

async function primeSet(a, id) {
  await a.dbg(`setDiceSet(${JSON.stringify(id)})`);
  await beat(100);
}

async function freshRoll(a, notation = '4d6') {
  await a.dbg('clearTable()');
  await beat(120);
  await a.settle();
  await a.roll(notation);
  await a.settle();
  await beat(500); // let paint + post-roll dust land
}

async function shoot(page, path, size) {
  return page.screenshot(path, { width: size.width, height: size.height });
}

export default async function run(stage) {
  mkdirSync(SUB, { recursive: true });
  const a = await stage.tab('localhost', 'ZoomShotter');

  // Pin the ivory classic first so every zoom×size shot below rides the
  // same skin — the point is the mat framing, not the dice cosmetics.
  await primeSet(a, 'classics.ivory');

  for (const zoom of ZOOMS) {
    for (const size of SIZES) {
      await setSize(a, size);
      await primeZoom(a, zoom);
      await freshRoll(a, '4d6');
      const path = join(SUB, `${zoom}-${size.label}.png`);
      console.log(await shoot(a.page, path, size));
    }
  }

  // Colour-read sanity: crimson & emerald at each zoom, desktop only —
  // "do the numerals still cut through the body tint at this framing".
  const deskSize = SIZES[0];
  for (const set of COLOUR_SETS) {
    await primeSet(a, set);
    const short = set.split('.').pop();
    for (const zoom of ZOOMS) {
      await setSize(a, deskSize);
      await primeZoom(a, zoom);
      await freshRoll(a, '4d6');
      const path = join(SUB, `${zoom}-${deskSize.label}-${short}.png`);
      console.log(await shoot(a.page, path, deskSize));
    }
  }

  console.log('--- mat-zoom shots complete ---');
}
