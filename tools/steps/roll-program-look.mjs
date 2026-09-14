/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
export default async function run(stage){
 const dir=stage.out('roll-program-look');mkdirSync(dir,{recursive:true});
 const a=await stage.tab('localhost','Alice');
 await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},a.page.sessionId);
 await a.emulateCoarsePointer(true);await a.dbg('holdClock(true)');
 await a.dbg("setDiceSet('tidewrack.seaglass')");await a.roll('4d20');
 await a.waitFor('window.__diceDebug.renderAudit().passes>1');
 const first=await a.dbg('rollPreparation.last');
 await a.roll('4d20');
 const repeat=await a.dbg('rollPreparation.last');
 assert.equal(repeat.transition,false);assert.equal(repeat.objects,4);assert.ok(!repeat.failed&&repeat.targetRestored);
 await stage.shot(a,`${dir}/phone-repeat-post.png`);
 await a.dbg('clearTable()');await a.dbg('postDrain()');
 await a.roll('4d20 held');
 const id=await a.rollId(),held=await a.dbg('rollPreparation.last');
 assert.equal(await a.dbg('currentRoll.values'),null);assert.equal(await a.dbg('shroudedCount'),4);
 await stage.shot(a,`${dir}/phone-held.png`);
 await a.dbg('reveal('+JSON.stringify(id)+')');
 await a.waitFor('!window.__diceDebug.entryState('+JSON.stringify(id)+').hidden');await a.settle();
 assert.equal(await a.dbg('shroudedCount'),0);
 await stage.shot(a,`${dir}/phone-revealed.png`);
 assert.deepEqual(a.page.errors,[]);assert.deepEqual(a.page.consoleErrors,[]);
 const report={_copyright:'Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0',first,repeat,held,values:(await a.entryState(id)).values,errors:a.page.errors,consoleErrors:a.page.consoleErrors};
 writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
