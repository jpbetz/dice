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

// MECHANICS M2c's cursor and hint, rendered — the look-before-done gate.
//
// THE QUESTION A FRAME HAS TO ANSWER HERE is not "is it drawn" (the e2e counts
// that, and M1 proved a count can be green while nothing is visible). It is
// whether a FOCUSED die and a KEPT die are told apart at a glance, on a die
// that is both — so every shot puts one die kept, one die focused, and one die
// that is both, in the same frame.
//
// Driven by REAL KEY EVENTS, the same as a player's: the keyboard path is the
// thing being photographed, so reaching past it to the toggle would photograph
// something else.
//
// BOTH REGISTERS, for M1's reason: the marker stands on the ground the die is
// standing on, and that ground is y 0 on the felt and 0.02 in the glade. Both
// viewports, because the hint is a nowrap line centred on a felt that is
// ~278px wide beside the panel on a phone.
//
//   node tools/drive.mjs tools/steps/pick-keyboard-look.mjs

const SHOTS = [
  { name: 'desktop', w: 1600, h: 1000, panels: true },
  { name: 'phone', w: 390, h: 844, panels: false },
];

// One keystroke, delivered where the browser delivers one when nothing is
// focused. `defaultPrevented` comes back so the step can say whether the
// binding was live, rather than assuming it.
const PRESS = (k) => `(() => {
  const ev = new KeyboardEvent('keydown',
    { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true });
  document.body.dispatchEvent(ev);
  return ev.defaultPrevented;
})()`;

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
      // A TURN, because that is the only state in which any of this exists.
      await a.roll('6d6 t3');

      // die 0 kept and left behind; die 2 kept AND under the cursor; die 4
      // focused but not kept. Three states, one frame.
      const live = await a.eval(PRESS('k'));   // shows die 0
      await a.eval(PRESS('k'));                // keeps it
      await a.eval(PRESS('ArrowRight'));       // -> die 1
      await a.eval(PRESS('ArrowRight'));       // -> die 2
      await a.eval(PRESS('k'));                // keeps die 2, cursor stays on it
      await a.dbg('sim(30)');
      console.log(`${venue}/${vp.name}: keys live=${live}`);
      const both = await a.dbg('pickFocusProbe()');
      const state = await a.dbg('picked');
      const hint = await a.dbg('pickHint()');
      console.log(`  kept ${state.dice.length} of ${state.pickable}, marks ${state.marks}; `
        + `cursor on die ${both.dieIndex} (kept=${both.kept}) `
        + `${both.color} r${both.radius} vs ring ${both.keptColor} r${both.keptRadius}`);
      console.log(`  hint: ${hint.shown ? JSON.stringify(hint.text) : 'HIDDEN'}`);
      if (!both.drawn || !state.marks || !hint.shown) {
        console.error('  MISSING: the frame is not showing what it claims to');
        process.exitCode = 1;
      }
      // Neither marker may be hidden by the atmosphere or by the floor. Stated
      // in the step rather than left to a count, for M1's reason.
      const probe = await a.dbg('pickRingProbe()');
      if (probe.over.length || probe.buried.length) {
        console.error(`  HIDDEN: over=${JSON.stringify(probe.over)} `
          + `buried=${JSON.stringify(probe.buried)}`);
        process.exitCode = 1;
      }
      console.log('  ' + await stage.shot(a, `pickkey-both-${venue}-${vp.name}.png`));

      // …and the cursor alone, on a die nobody has kept: the state a player is
      // in for most of a turn, and the one where the bracket has no gold ring
      // beside it to be read against.
      await a.eval(PRESS('ArrowRight'));       // -> die 3
      await a.eval(PRESS('ArrowRight'));       // -> die 4, unkept
      await a.dbg('sim(30)');
      console.log('  ' + await stage.shot(a, `pickkey-cursor-${venue}-${vp.name}.png`));
    }
  }
}
