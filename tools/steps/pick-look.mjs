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

// MECHANICS M1's marker, rendered — the look-before-done gate.
//
// The gesture ships DARK (PICK_DEFAULT_ENABLED false), so this arms it, picks
// half the pool by real clicks at each die's own projected position, and
// photographs the result on a desktop and a phone, in the grounded room and
// in a fae venue.
//
// BOTH REGISTERS, ON PURPOSE. The marker sits on the ground the die is
// standing on, and that ground is at y 0 on the felt, 0.02 in the glade and
// 0.035 over its clearing detail. The tower's contact shadow spent five
// rounds authored against the felt while sitting under the glade's floor
// (W3 round 9), and the only reason this derives its height from the die's
// own bounding box is that story. A frame in one venue would not test it.
//
//   node tools/drive.mjs tools/steps/pick-look.mjs

const SHOTS = [
  { name: 'desktop', w: 1600, h: 1000, panels: true },
  { name: 'phone', w: 390, h: 844, panels: false },
];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Look');

  for (const venue of ['table', 'moonrise']) {
    if (venue !== 'table') {
      await a.dbg(`setVenue('${venue}')`);
      await a.dbg('sim(120)');
    }
    for (const vp of SHOTS) {
      await a.page.browser.send('Emulation.setDeviceMetricsOverride',
        { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
      await a.dbg(`setPanelState({pools: ${vp.panels}, log: ${vp.panels}})`);
      await a.eval('window.dispatchEvent(new Event("resize"))');
      await new Promise((r) => setTimeout(r, 250));

      await a.dbg('clearTable()');
      await a.dbg('pickClear()');
      await a.roll('6d6');
      await a.dbg('pickEnable(true)');

      // REAL CLICKS, at each die's own projected centre — the same path a
      // finger takes, so what is photographed is what a player would get and
      // not what a direct call to the toggle would have produced.
      const picked = await a.eval(`(() => {
        const dbg = window.__diceDebug, c = document.querySelector('canvas');
        let n = 0;
        for (const i of [0, 2, 4]) {
          const p = dbg.dieScreen(i);
          if (!p) continue;
          c.dispatchEvent(new MouseEvent('click',
            { clientX: Math.round(p.x), clientY: Math.round(p.y), bubbles: true }));
          n++;
        }
        return n;
      })()`);
      await a.dbg('sim(30)');
      const state = await a.dbg('picked');
      console.log(`${venue}/${vp.name}: clicked ${picked}, picked `
        + `${state.dice.length} of ${state.pickable}, marks ${state.marks}`);
      if (state.dice.length !== state.marks) {
        console.error(`  MISMATCH: ${state.dice.length} picked but ${state.marks} drawn`);
        process.exitCode = 1;
      }
      // COUNTING MARKS IS NOT SEEING THEM. Both of this feature's bugs drew
      // the right number of instances into a place nobody could see, so the
      // step states the claim rather than the count: nothing outranks the
      // marker and nothing stands above it.
      const probe = await a.dbg('pickRingProbe()');
      if (probe.over.length || probe.buried.length) {
        console.error(`  HIDDEN: over=${JSON.stringify(probe.over)} `
          + `buried=${JSON.stringify(probe.buried)}`);
        process.exitCode = 1;
      }
      console.log('  ' + await stage.shot(a, `pick-${venue}-${vp.name}.png`));
    }
  }
}
