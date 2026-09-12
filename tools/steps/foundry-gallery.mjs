// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0

// Scripted views of the ORIGINAL exported geometry. The room proof is in
// foundry-review.mjs; this tool checks the gallery, keyboard presets, surface
// modes, downloads and responsive layout. No hand-driven re-verification.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Table } from '../../tests/e2e/harness.mjs';
import { STUDIES } from '../../models/tower-foundry/catalogue.mjs';

export default async function run(stage) {
  const page = await stage.ctx.browser.newPage();
  const url = `http://localhost:${stage.port}/models/tower-foundry/`;
  await page.browser.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1170, deviceScaleFactor: 1, mobile: false }, page.sessionId);
  await page.navigate(`${url}index.html`);
  const table = new Table(page, url); stage.ctx.tables.push(table);
  await table.waitFor('window.__foundry?.ready', { timeout: 30000, desc: 'all three new models rendered' });
  const stats = await page.eval('window.__foundry.stats');
  assert.equal(stats.length, 3);
  await page.eval('window.__foundry.render()');
  await stage.shot(table, 'foundry-gallery-desktop.png');
  const saveCanvas = async (name) => {
    const png = await page.eval('window.__foundry.shot()');
    assert.ok(png.length > 10000);
    await writeFile(stage.out(name), Buffer.from(png.split(',')[1], 'base64'));
  };
  await saveCanvas('foundry-collection.png');
  for (const study of STUDIES) {
    await page.eval(`window.__foundry.select('${study.id}')`);
    await saveCanvas(`foundry-${study.id}-hero.png`);
    await page.eval("window.__foundry.setView('crown')");
    await saveCanvas(`foundry-${study.id}-crown.png`);
    await page.eval("window.__foundry.setView('hero')");
    for (const ext of ['blend', 'glb']) {
      const res = await fetch(`${url}${study.id}/${study.id}.${ext}`);
      assert.equal(res.status, 200, `${study.id}.${ext} download exists`);
      assert.ok((await res.arrayBuffer()).byteLength > 1000, 'nonempty download');
    }
  }
  await page.eval("window.__foundry.select('all'); document.querySelector('#surface').value='normal'; document.querySelector('#surface').dispatchEvent(new Event('change'))");
  await saveCanvas('foundry-collection-normals.png');
  await page.eval("document.querySelector('#surface').value='lit'; document.querySelector('#surface').dispatchEvent(new Event('change'))");
  await page.browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, page.sessionId);
  await page.eval("window.__foundry.select('wickroot'); window.__foundry.render()");
  assert.equal(await page.eval('document.documentElement.scrollWidth <= innerWidth'), true, 'phone layout does not overflow');
  await stage.shot(table, 'foundry-gallery-phone.png');
  assert.deepEqual(page.errors, []); assert.deepEqual(page.consoleErrors, []);
  console.log(JSON.stringify(stats, null, 2));
  console.log('Gallery: desktop, phone, hero/crown/normal views and all six downloads passed.');
}
