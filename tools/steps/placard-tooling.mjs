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

// Repeatable material comparison at the owner's saved size/opacity/inset.
// node tools/drive.mjs tools/steps/placard-tooling.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default async function run(stage, [dir = 'tools/out/placard-tooling']) {
  dir = resolve(dir);
  mkdirSync(dir, { recursive: true });
  const t = await stage.ctx.devTab({ origin: '127.0.0.96', players: 0, name: 'Priya' });
  for (const name of ['Thorbjörn', 'Oleander Vex', 'Bo']) await stage.ctx.rawPlayer(name);
  await t.waitFor('window.__diceDebug.places().stations.length === 4');
  await t.dbg('setPanelState({pools: false, log: false})');
  await t.dbg('devFold(true)');
  const measures = [];
  for (const [device, width, height] of [['desktop', 1600, 900], ['phone', 390, 844]]) {
    await t.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: device === 'phone' }, t.page.sessionId);
    // Boot at the device's size: resizing an already-cut desktop eye is a
    // different moment from opening this table on a phone.
    await t.page.navigate(t.url);
    await t.waitFor('window.__diceDebug && window.__diceDebug.net.online');
    await t.dbg('devOpen()');
    await t.dbg('devFold(true)');
    await t.dbg('setPanelState({pools: false, log: false})');
    await t.eval('window.dispatchEvent(new Event("resize"))');
    await t.dbg('setZoom("wide")');
    await t.dbg('sim(120)');
    await t.dbg('setZoom("medium")');
    for (const [style, flourish] of [['stamp', 'full'], ['embossed', 'full'], ['embossed', 'none']]) {
      await t.dbg(`tuneSet(${JSON.stringify({ 'cards.style': style, 'cards.flourish': flourish })})`);
      await t.dbg('sim(30)');
      await t.waitFor('window.__diceDebug.places().built === window.__diceDebug.places().queued');
      await new Promise((r) => setTimeout(r, 350));
      const tag = `${device}-${style}-${flourish}`;
      await stage.shot(t, `${dir}/${tag}.png`);
      measures.push({ tag, dress: await t.dbg('placardDress()'), budget: await t.dbg('placardBudget()'),
        stations: (await t.dbg('places()')).stations });
    }
  }
  // Native atlas details, using the same painter and fitter as the live rig.
  // This is a material study, explicitly separate from the scene screenshots.
  const study = await t.eval(`(async () => {
    const { PlacardRig } = await import('/js/placard.js');
    const THREE = await import('three');
    const rig = new PlacardRig(new THREE.Scene());
    rig._ensureBuilt();
    const sheet = document.createElement('canvas'); sheet.width = 1280; sheet.height = 700;
    const c = sheet.getContext('2d'); c.fillStyle = '#342a23'; c.fillRect(0, 0, 1280, 700);
    const times = [];
    for (const [i, style, tone, flourish, label] of [
      [0, 'stamp', 'ink', 'full', 'TOOLED LEATHER'],
      [1, 'embossed', 'ink', 'full', 'RAISED GOLD'],
      [2, 'embossed', 'ink', 'none', 'GOLD / NO ORNAMENT'],
      [3, 'embossed', 'chalk', 'full', 'RAISED SILVER'],
    ]) {
      rig.dress.style = style; rig.dress.flourish = flourish; rig.dress.ink.tone = tone;
      const start = performance.now();
      rig._paintRow(0, 'Priya');
      times.push({ style, ms: +(performance.now() - start).toFixed(1) });
      const x = (i % 2) * 640, y = Math.floor(i / 2) * 350;
      c.fillStyle = '#c6b49b'; c.font = '14px sans-serif'; c.fillText(label, x + 35, y + 32);
      c.drawImage(rig.canvas, 0, 0, 640, 320, x, y + 25, 640, 320);
    }
    rig.dispose();
    return { png: sheet.toDataURL('image/png').split(',')[1], times };
  })()`);
  writeFileSync(`${dir}/material-study.png`, Buffer.from(study.png, 'base64'));
  console.log(`Repaint milliseconds: ${JSON.stringify(study.times)}`);
  writeFileSync(`${dir}/measurements.json`, JSON.stringify(measures, null, 2));
  if (t.page.consoleErrors.length) throw new Error(t.page.consoleErrors.join('\n'));
  console.log(`Placard comparison: ${dir}`);
}
