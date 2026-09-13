/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import {writeFileSync} from 'node:fs';
import {click,type} from '../../tests/fixtures/visible-input.mjs';
import {runSuccessWalk,runLibraryHydrationBoundary} from '../../tests/fixtures/r1-success-walk.mjs';
export default async function run(stage,[mode='walk']){
  if(mode==='hydration'){const report=await runLibraryHydrationBoundary({capture:(a,name)=>stage.shot(a,'r1-walk-'+name+'.png')});writeFileSync(stage.out('r1-library-hydration.json'),JSON.stringify(report,null,2));return;}
  if(mode==='preview'){
    const a=await stage.tab('127.0.0.179','Sam');await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},a.page.sessionId);
    await click(a,'#table-open');await type(a,'#set-table-name','The Copper Lantern');await click(a,'#snav-staging');await click(a,'[data-venue="copper"]');await a.waitFor('window.__diceDebug.tablePreview?.status==="ready"&&window.__diceDebug.tablePreview.activeId==="copper"');
    await stage.shot(a,'r1-walk-03-desktop-setup-ready.png');return;
  }
  if(mode==='menu'){
    const a=await stage.tab('127.0.0.179','Sam');await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},a.page.sessionId);
    await click(a,'#identity-chip');await type(a,'#idm-name-input','Sam');await stage.shot(a,'r1-walk-00-desktop-name-editor.png');
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:440,deviceScaleFactor:1,mobile:true},a.page.sessionId);await a.emulateCoarsePointer(true);await stage.shot(a,'r1-walk-phone-name-keyboard.png');return;
  }
  const report=await runSuccessWalk({capture:(a,name)=>stage.shot(a,'r1-walk-'+name+'.png'),checkpoint:name=>console.log(name)});
  writeFileSync(stage.out('r1-success-walk.json'),JSON.stringify(report,null,2));
}
