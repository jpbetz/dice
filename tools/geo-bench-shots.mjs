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

// tools/geo-bench-shots.mjs — review stills for the GEO BENCH + SET
// BUILDER (softer edges Tier 0). The bench span under every environment,
// each bench row at reading distance, and a builder round-trip.
//   node tools/geo-bench-shots.mjs [outDir]
// Same zero-dep CDP plumbing as lab-shots.mjs; ephemeral port — the live
// table on 8123 is never touched.

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { freePort, startServer } from '../tests/e2e/harness.mjs';
import { Browser } from '../tests/e2e/cdp.mjs';

const out = process.argv[2] || 'tools/out/geo-bench';
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = await freePort();
const server = await startServer(port);
const browser = await new Browser().launch();
try {
  const page = await browser.newPage();
  await page.navigate(`http://localhost:${port}/lab.html`);
  const deadline = Date.now() + 60000;
  for (;;) {
    const ready = await page.eval('!!(window.__lab && window.__lab.ready)').catch(() => false);
    if (ready === true || ready === 'true') break;
    if (Date.now() > deadline) throw new Error('lab never became ready');
    await sleep(200);
  }
  await page.eval('window.__lab.setRotate(false)');
  await sleep(250);

  const shot = async (name) => {
    await page.screenshot(path.join(out, name), { width: 1500, height: 1050 });
    console.log(`  ${name}`);
  };

  // the bench span (std → builder) under each environment: the edge
  // highlight is a lighting read, so judge it in bright and dim
  for (const env of ['table', 'dusk', 'dark']) {
    await page.eval(`window.__lab.setEnv(${JSON.stringify(env)})`);
    await page.eval(`window.__lab.zoomRows('std', 'lab.builder')`);
    await sleep(250);
    await shot(`bench-span-${env}.png`);
  }
  await page.eval(`window.__lab.setEnv('table')`);

  // each bench row at reading distance (std first, the control)
  const bench = JSON.parse(await page.eval('JSON.stringify(window.__lab.benchIds)'));
  for (const id of ['std', ...bench]) {
    await page.eval(`window.__lab.zoomRow(${JSON.stringify(id)})`);
    await sleep(200);
    await shot(`row-${id.replace('lab.', '')}.png`);
  }

  // hero singles — the d6 face-on edge read for every recipe, plus the
  // d20 (edge-dense worst case) for the candidates that matter most
  for (const id of ['std', ...bench]) {
    await page.eval(`window.__lab.zoomDie(${JSON.stringify(id)}, 'd6')`);
    await sleep(200);
    await shot(`hero-d6-${id.replace('lab.', '')}.png`);
  }
  for (const id of ['std', 'lab.round090', 'lab.round130', 'lab.tumbled']) {
    await page.eval(`window.__lab.zoomDie(${JSON.stringify(id)}, 'd20')`);
    await sleep(200);
    await shot(`hero-d20-${id.replace('lab.', '')}.png`);
  }

  // the builder round-trip: soft-edge geo patch, then a full custom recipe
  await page.eval(`window.__lab.zoomRow('lab.builder')`);
  await page.eval(`window.__lab.builderSet({ geo: { bevel: 0.09, profile: 'round', pillow: 0.2 } })`);
  await sleep(250);
  await shot('builder-round090.png');
  await page.eval(`window.__lab.builderSet({
    stdColors: false, body: '#20313c', text: '#e8f4ee',
    feel: { rough: 0.22, metal: 0.1 },
    spec: { envMapIntensity: 1, clearcoat: 0.8, clearcoatRoughness: 0.25 },
    glowOn: true, glow: { color: '#3fd0a4', intensity: 0.12 },
  })`);
  await sleep(250);
  await shot('builder-custom.png');
  console.log(JSON.parse(await page.eval('JSON.stringify(window.__lab.builderRecipe())')));

  console.log(`done → ${out}/`);
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
