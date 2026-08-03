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

  // action frames: each signature effect mid-flight, on its home theme
  await page.eval(`window.__lab.setEnv('table')`);
  await sleep(150);
  const actions = [
    ['stormcall', 'flash', 60],
    ['emberforge', 'glow', 240],
    ['rimehold', 'freeze', 420],
    ['umbra', 'dim', 140],
    ['tidewrack', 'swell', 500],
    ['gildhall', 'slam', 70],
  ];
  for (const [theme, fx, atMs] of actions) {
    await page.eval(`window.__lab.effect(${JSON.stringify(theme)}, ${JSON.stringify(fx)})`);
    await sleep(atMs);
    await shot(`fx-${theme}-${fx}.png`);
    await sleep(1800); // let the effect fully restore before the next
  }
  console.log(`done → ${out}/`);
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
