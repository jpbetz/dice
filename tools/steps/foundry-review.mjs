// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0

// Review the exploratory collection in the real table without promoting rows
// or changing the server allowlist. Uses the same solo registry seam as the
// established tower-glb-loader scenario. Run with tools/drive.mjs; it creates
// an ephemeral server and a private Chrome process, never port 8123.
//   node tools/drive.mjs tools/steps/foundry-review.mjs [id|all] [look|full]
// Existing fit, occlusion and film witnesses are reused; no proxy geometry.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Table } from '../../tests/e2e/harness.mjs';
import { STUDIES, modelUrl, previewOptions } from '../../models/tower-foundry/catalogue.mjs';

const VIEWS = [
  ['front', 18, 7, 0.6], ['three-quarter', 17, 8, 9],
  ['seated', 16, 3.2, 5], ['crown', 14, 14, 4],
  ['doorway', 11, 4, 1.5], ['far', 24, 9.5, 8],
];

export default async function run(stage, [id = 'all', mode = 'full']) {
  const studies = STUDIES.filter((s) => id === 'all' || s.id === id);
  assert.ok(studies.length, `unknown study ${id}`);
  const reports = [];
  for (const study of studies) {
    const page = await stage.ctx.browser.newPage();
    await page.addInitScript(`window.__diceTestMode=true; localStorage.setItem('dice.schema.v1','2'); localStorage.setItem('dice.stability.v1','beta'); localStorage.removeItem('dice.roomsettings.v1');`);
    await page.browser.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false }, page.sessionId);
    const url = `http://localhost:${stage.port}/?lobby=1`;
    await page.navigate(url);
    const table = new Table(page, url); stage.ctx.tables.push(table);
    await table.waitFor('!!window.__diceDebug && window.__diceDebug.identity?.lobby === true', { timeout: 30000, desc: 'solo review table' });
    await table.dbg('holdClock(true)'); await table.dbg('towerEcho(false)');
    await table.dbg("setZoom('medium')"); await table.dbg("setTower('none')");
    await table.dbg('sim(30)');
    const before = await table.dbg('towerBodies()');
    assert.ok(await table.dbg(`towerRegisterGlb(${JSON.stringify(study.id)},${JSON.stringify(modelUrl(study.id))},${JSON.stringify(previewOptions(study))})`));
    await table.dbg(`setTower(${JSON.stringify(study.id)})`);
    await table.waitFor(`window.__diceDebug.towerModelStatus('${study.id}')?.ready && window.__diceDebug.tower === '${study.id}'`, { timeout: 30000, desc: `${study.id} loaded and socketed` });
    await table.dbg('sim(200)');
    const portal = await table.dbg(`towerPortalSpec('${study.id}')`);
    assert.equal(portal.source, 'model', 'measure the declared model core');
    const fit = await table.dbg('towerModelAudit()');
    const occlusion = await table.dbg('towerOcclusionCheck()');
    const leaks = (occlusion.eyes || []).flatMap((eye) => ['shaft', 'cowl'].filter((b) => eye[b].blocked !== eye[b].n).map((b) => `${eye.id}/${b}:${eye[b].blocked}/${eye[b].n}`));
    const unclassified = (fit.outs || []).filter((o) => o.cls.includes('UNCLASSIFIED'));
    const report = { id: study.id, portal, fit, occlusion, leaks, unclassified, pours: [] };
    console.log(`${study.id}: ${fit.meshes} meshes, ${unclassified.length} unclassified overruns, ${leaks.length} leaking bands`);
    const png = await table.eval(`window.__diceDebug.lookSheet(${JSON.stringify(VIEWS)}, {cols:3,tile:620})`);
    assert.ok(png?.startsWith('data:image/png') && png.length > 5000, 'nonempty in-app render');
    await writeFile(stage.out(`foundry-${study.id}-room.png`), Buffer.from(png.split(',')[1], 'base64'));
    if (mode === 'full') {
      assert.equal(unclassified.length, 0, JSON.stringify(unclassified));
      assert.equal(leaks.length, 0, leaks.join(', '));
      assert.ok(occlusion.eyes.length >= 6, 'all shipped eyes were measured');
      assert.equal((fit.offPolicy || []).length, 0, 'materials follow loader policy');
      assert.equal((await table.dbg('towerBodies()')).length - before.length, 8, 'exactly eight engine colliders');
      for (const notation of ['1d20', '1d8+1d6+1d10', '8d6']) {
        await table.dbg(`commandRoll(${JSON.stringify(notation)})`);
        await table.waitFor('!!window.__diceDebug.currentRoll?.landings', { timeout: 30000, desc: `${notation} film baked` });
        const film = await table.dbg('towerFilmInfo()');
        const delivered = film.rest.filter((d) => d.delivered).length;
        assert.equal(delivered, film.rest.length, `${study.id} ${notation}: all dice delivered`);
        assert.ok(delivered > 0, 'nonempty pour witness');
        assert.equal(film.unseen, 0); assert.equal(film.stranded, 0);
        if (notation === '8d6') {
          await table.dbg(`sim(${Math.max(1, Math.round(film.firstExitTime * 60 + 8))})`);
          await stage.shot(table, `foundry-${study.id}-pour.png`);
        }
        await table.dbg(`sim(${film.frames + 150})`);
        const played = await table.eval(`({done:window.__diceDebug.currentRoll.done,shown:window.__diceDebug.tableDice.map(d=>d.mesh.visible)})`);
        assert.ok(played.done && played.shown.every(Boolean), 'completed result stays visible');
        report.pours.push({ notation, delivered, attempts: film.attempts, unseen: film.unseen, stranded: film.stranded });
        console.log(`  ${notation}: ${delivered}/${film.rest.length} delivered, attempts ${film.attempts}`);
        await table.dbg('clearTable()'); await table.dbg('sim(400)');
      }
      await table.dbg("setTower('none')"); await table.dbg('sim(30)');
      assert.deepEqual(await table.dbg('towerBodies()'), before, 'unsocket restores towerless bodies');
    }
    assert.deepEqual(page.errors, [], 'no page exceptions');
    reports.push(report);
    await writeFile(stage.out(`foundry-${study.id}-proof.json`), JSON.stringify(report, null, 2));
    await table.close();
  }
  console.log(`Foundry ${mode} complete: ${reports.map((r) => r.id).join(', ')}`);
}
