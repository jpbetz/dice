/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
export default async function run(stage) {
  const dir=stage.out('film-turn-read');mkdirSync(dir,{recursive:true});
  const t=await stage.tab('localhost','Alice');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},t.page.sessionId);
  await t.emulateCoarsePointer(true);
  await t.roll('4d6 t3');const id=await t.rollId(),q=JSON.stringify(id);
  const before=await t.dbg('turnState('+q+')');
  await stage.shot(t,`${dir}/phone-before.png`);
  await t.dbg('pickToggle(0)');await t.dbg('throwAgain('+q+',[0])');
  await t.waitFor('window.__diceDebug.turnState('+q+').throws.used===2');await t.settle();
  const after=await t.dbg('turnState('+q+')');
  assert.deepEqual(after.positions[0],before.positions[0]);assert.deepEqual(after.faces,after.values);
  const rows=await t.dbg('tableResults.rows');assert.ok(rows.some(r=>r.mine&&!r.rolling&&r.result));
  await stage.shot(t,`${dir}/phone-after.png`);
  await t.dbg('tableResults.open('+q+')');await stage.shot(t,`${dir}/phone-detail.png`);
  assert.deepEqual(t.page.consoleErrors,[]);
  writeFileSync(`${dir}/report.json`,JSON.stringify({before,after,rows,worker:await t.dbg('filmWorker')},null,2));
}
