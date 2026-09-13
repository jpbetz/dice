/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {choosePresentation} from '../../tests/e2e/presentation.mjs';

export default async function run(stage) {
  const a=await stage.ctx.newTable({origin:'localhost',name:'Alice'});
  await choosePresentation(a,'battery');await a.dbg("setVenue('moonrise')");
  await a.waitFor("window.__diceDebug.venue==='moonrise'&&window.__diceDebug.venueInfo().staged");
  await a.waitFor('window.__diceDebug.pendingTower===null&&window.__diceDebug.towerModelStatus().ready');
  await a.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
  const asleep=await a.dbg('renderAudit().frame');
  console.log(await stage.shot(a,'battery-ambient-asleep.png'));
  await a.eval('new Promise(r=>setTimeout(r,500))');
  assert.equal(await a.dbg('renderAudit().frame'),asleep);
  await choosePresentation(a,'full');
  const before=await a.dbg('lifeInfo().sample'),frame=await a.dbg('renderAudit().frame');
  await a.waitFor(`window.__diceDebug.renderAudit().frame>${frame}+5`,{timeout:5000});
  assert.notDeepEqual(await a.dbg('lifeInfo().sample'),before);
  console.log(await stage.shot(a,'battery-ambient-full.png'));
  await choosePresentation(a,'battery');
  await a.waitFor('!window.__diceDebug.renderAudit().scheduled.pending');
  console.log(await stage.shot(a,'battery-ambient-restored.png'));
  assert.deepEqual(a.page.consoleErrors,[]);
}
