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

// THE FELT ANSWERING THE LAMP — both halves, the number and the picture.
//
// It prints the `floorLook` table (an A/B rendered through the real post stack,
// measured in three bands of bare felt) and shoots the same comparison for an
// eye, because the two answer different questions: the table says whether a
// player COULD see it, and only Joe can say whether it should be there.
//
// The mats handoff's item 4 asked for a NAP — a normal map. The measurement
// this step prints is what refused it: tilting the whole plane by 8 degrees, a
// ceiling no relief map can reach, moves obsidian by 0.62 code values against
// the gloss field's 2.8. That row is gone from the step (the throwaway patch
// that produced it was never committed); the roughness row is the one that
// survived, and re-running this is how you check the claim has not drifted.
//
//   node tools/drive.mjs tools/steps/felt-light-look.mjs
//   node tools/contact-sheet.mjs        # then open tools/out/contact.html

const FELTS = ['obsidian', 'emerald', 'sand', 'taproom'];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Look');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.eval('window.dispatchEvent(new Event("resize"))');
  await new Promise((r) => setTimeout(r, 300));
  await a.dbg('setPanelState({pools: false, log: false})');
  await a.dbg('setLogFlyout(false)');

  const row = (v) => (v.bands || []).map((b) => `${b.label} ${b.absMeanDelta.toFixed(2)}`).join('  ');
  console.log('felt        gloss field                mottle beside it');
  for (const felt of FELTS) {
    await a.dbg(`setFelt(${JSON.stringify(felt)})`);
    await a.dbg('sim(30)');
    // The null control first, ALWAYS: two identical frames must read zero, or
    // every number under it is the instrument measuring its own noise.
    const nul = await a.dbg('floorLook({})');
    const worst = Math.max(...nul.bands.map((b) => b.absMeanDelta));
    if (worst > 0.15) throw new Error(`${felt}: null control reads ${worst}, not zero`);
    const g = await a.dbg('floorLook({a:{glossSwing:0}, b:{}})');
    const m = await a.dbg('floorLook({a:{mottle:0}, b:{}})');
    console.log(`${felt.padEnd(10)}  ${row(g).padEnd(26)}  ${row(m)}`);
  }

  // …AND THE PICTURE. One seeded pile per mat, shot with the field off and on,
  // so the pair can be flicked between in the contact sheet.
  await a.dbg('holdClock(true)');
  for (const felt of FELTS) {
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    await a.dbg(`setFelt(${JSON.stringify(felt)})`);
    await a.dbg('sim(40)');
    await a.dbg(`throwSeeded(['d6','d6','d6','d6','d6'], 90210)`);
    await a.dbg('sim(1400)');
    await a.dbg('floorOverride({glossSwing: 0})');
    await a.dbg('sim(2)');
    await stage.shot(a, `lamp-${felt}-1-off`);
    await a.dbg('floorOverride(null)');
    await a.dbg('sim(2)');
    await stage.shot(a, `lamp-${felt}-2-on`);
    // …and one at double strength, because "is it enough" is the question the
    // numbers cannot answer and a second point makes the first one legible.
    await a.dbg('floorOverride({glossSwing: 2})');
    await a.dbg('sim(2)');
    await stage.shot(a, `lamp-${felt}-3-double`);
    await a.dbg('floorOverride(null)');
  }
}
