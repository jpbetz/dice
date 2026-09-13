/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
export default async function run(stage,args) {
  const label=args[0]||'after',dir=stage.out('idle-render-'+label);mkdirSync(dir,{recursive:true});
  const t=await stage.tab('localhost','Idle');const rows=[];
  const sample=async(name)=>{
    const result=await t.eval(`(async()=>{const d=window.__diceDebug;
      await new Promise(r=>setTimeout(r,1500));
      const before=d.renderAudit(),at=performance.now();await new Promise(r=>setTimeout(r,1500));
      const after=d.renderAudit(),gl=document.querySelector('#scene-container canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {elapsed:performance.now()-at,frames:after.frame-before.frame,before,after,hidden:document.hidden,
        backend:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'};})()`);
    rows.push({device,name,...result});console.log(device+' '+name+': '+result.frames+' renderer frames in '+Math.round(result.elapsed)+' ms');
  };
  let device;
  for(const [name,width,height] of [['desktop',1440,900],['phone',390,844]]) {
    device=name;await t.page.browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'},t.page.sessionId);
    await t.emulateCoarsePointer(device==='phone');await t.dbg('clearTable()');await t.dbg('holdClock(false)');
    await sample('empty');await t.roll('4d6');await sample('settled');
    await stage.shot(t,`${dir}/${device}-settled.png`);
    const before=await t.dbg('renderAudit().frame');
    await t.roll('1d20');assert.ok((await t.dbg('renderAudit().frame'))>before,'next real roll wakes the rendered table');
    await sample('after-next-roll');
    const designs=await t.eval("import('/js/table-designs.js').then(m=>Object.keys(m.TABLE_DESIGNS))");
    for(const id of designs) {
      await t.dbg('setVenue('+JSON.stringify(id)+')');await t.waitFor('window.__diceDebug.tableDesign.activeId==='+JSON.stringify(id));
      await sample(id);await stage.shot(t,`${dir}/${device}-${id}.png`);
    }
    await t.eval("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));");
    await sample('hidden');
    await t.eval("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));");
    await t.dbg("setVenue('table')");await t.settle();
  }
  assert.deepEqual(t.page.consoleErrors,[]);writeFileSync(`${dir}/report.json`,JSON.stringify({label,rows},null,2));
}
