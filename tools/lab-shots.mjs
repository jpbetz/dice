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

// tools/lab-shots.mjs — drive the DICE LAB headless and drop review PNGs.
//   node tools/lab-shots.mjs [outDir]
// Reuses the e2e harness's zero-dep CDP plumbing (ephemeral port; the
// live table on 8123 is never touched). Rotation is frozen for crisp
// frames; action shots capture each signature effect mid-flight.

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { freePort, startServer } from '../tests/e2e/harness.mjs';
import { Browser } from '../tests/e2e/cdp.mjs';

const out = process.argv[2] || 'lab-shots';
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = await freePort();
const server = await startServer(port);
const browser = await new Browser().launch();
try {
  const page = await browser.newPage();
  await page.navigate(`http://localhost:${port}/lab.html`);
  const deadline = Date.now() + 20000;
  for (;;) {
    const ready = await page.eval('!!(window.__lab && window.__lab.ready)').catch(() => false);
    if (ready === true || ready === 'true') break;
    if (Date.now() > deadline) throw new Error('lab never became ready');
    await sleep(150);
  }
  await page.eval('window.__lab.setRotate(false)');
  await sleep(250);

  const shot = async (name) => {
    await page.screenshot(path.join(out, name), { width: 1500, height: 1050 });
    console.log(`  ${name}`);
  };

  // the grid under each environment — palettes in daylight, glows in dark
  for (const env of ['table', 'dusk', 'dark']) {
    await page.eval(`window.__lab.setEnv(${JSON.stringify(env)})`);
    await sleep(200);
    await shot(`grid-${env}.png`);
  }

  // detail rows: the Level 1 craftsmanship close-ups (relief + digit glow)
  await page.eval(`window.__lab.setEnv('table')`);
  await sleep(150);
  for (const id of ['emberforge.blackanvil', 'rimehold.deepglacier', 'rimehold.firstfrost',
    'wildwood.heartwood', 'wildwood.mosstone', 'wildwood.sapamber', 'umbra.voidgrain',
    'arcanum.focuscrystal', 'reliquary.scrimshaw']) {
    await page.eval(`window.__lab.zoomRow(${JSON.stringify(id)})`);
    await sleep(150);
    await shot(`row-${id}.png`);
  }
  await page.eval('window.__lab.zoomRow(null)');
  await sleep(150);

  // action frames: each signature effect mid-flight, on its home theme
  const actions = [
    ['stormcall.boltglass', 'flash', 60],
    ['emberforge.blackanvil', 'glow', 240],
    ['rimehold.deepglacier', 'freeze', 420],
    ['umbra.voidgrain', 'dim', 140],
    ['tidewrack.seaglass', 'swell', 500],
    ['gildhall.oxblood', 'slam', 70],
    ['umbra.voidgrain', 'unmake', 750],
  ];
  for (const [theme, fx, atMs] of actions) {
    await page.eval(`window.__lab.effect(${JSON.stringify(theme)}, ${JSON.stringify(fx)})`);
    await sleep(atMs);
    await shot(`fx-${theme}-${fx}.png`);
    await sleep(1800); // let the effect fully restore before the next
  }

  // Level 3, the drop rig: a real cannon-es die falls into the zoomed row;
  // every measured contact fires the set's burst. First contact lands
  // ~250ms after the drop (g=-110). The contacts/bursts log is the honesty
  // check — bursts without contacts (or sparks from a set that should
  // shed nothing) would both be bugs.
  const drops = [
    ['emberforge.blackanvil', [300, 460]],   // sparks cool white→ember
    ['tidewrack.seaglass', [460, 950]],      // bubbles rise and pop
    ['reliquary.scrimshaw', [340]],          // bone dust puffs
    ['stormcall.boltglass', [290]],          // static grounds instantly
    ['rimehold.deepglacier', [380]],         // cold breath spreads low
    ['wildwood.heartwood', [700]],           // pollen motes drift
    ['gildhall.oxblood', [340]],             // CONTROL: sheds nothing, on purpose
  ];
  for (const [id, times] of drops) {
    await page.eval(`window.__lab.zoomRow(${JSON.stringify(id)})`);
    await sleep(120);
    await page.eval(`window.__lab.drop(${JSON.stringify(id)})`);
    let t = 0;
    for (const at of times) {
      await sleep(at - t);
      t = at;
      await shot(`drop-${id}-${at}ms.png`);
    }
    // the honesty numbers come from the live drop, then wait it out so
    // the next row starts clean
    const mid = JSON.parse(await page.eval('JSON.stringify(window.__lab.dropState())'));
    const dDeadline = Date.now() + 9000;
    for (;;) {
      const st = JSON.parse(await page.eval('JSON.stringify(window.__lab.dropState())'));
      if (!st.active) break;
      if (Date.now() > dDeadline) { console.log(`  (drop ${id} timed out)`); break; }
      await sleep(250);
    }
    console.log(`  drop ${id}: ${mid.contacts ?? 0} contacts → ${mid.bursts ?? 0} particles`);
  }
  await page.eval('window.__lab.zoomRow(null)');
  console.log(`done → ${out}/`);
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
