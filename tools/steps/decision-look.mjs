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

// MECHANICS M5's decision readout, rendered — the look-before-done gate.
//
// Five states, because they are five different shapes of card and only one of
// them is the ordinary one:
//   total    six plain dice under a system that reads TOTALS, nothing kept —
//            higher/same/lower plus the stake
//   kept     two kept, so the numbers describe FOUR dice and the eyebrow says so
//   words    the same dice under Your Soul Deal, where a total is not a fact of
//            play and the system's own words take its place
//   faces    monster dice, where the total is refused in writing and the drawn
//            symbols stand in for it — the one state whose content is SVG
//   refused  every die kept: the box says why instead of going blank
//
// BOTH VIEWPORTS. The banner is bounded by the FELT rather than the viewport
// (css `min-width: min(320px, 100vw - table-left - 20px)`), so on a 390px
// phone the card is ~278px wide and a line that fits on a desktop can wrap
// into a third row there. What has to be judged is whether the readout still
// reads as ONE quiet caption under the result at that width, or as a second
// paragraph competing with it.
//
// THE GATE, and it is the one a count could never state: a card that is
// OFFERING the readout must have real width and height. Both of M1's bugs
// drew the right number of instances into a place nobody could see; the
// equivalent here is a correct forecast in a collapsed box, and `hidden`
// alone cannot tell those apart.
//
//   node tools/drive.mjs tools/steps/decision-look.mjs

const SHOTS = [
  { name: 'desktop', w: 1500, h: 950, panels: true },
  { name: 'phone', w: 390, h: 844, panels: false },
];

// What every mounted card is saying, plus its geometry.
const readCards = (a) => a.dbg('turnOdds(null)').then((o) => o.cards);

function report(label, cards) {
  const live = cards.filter((c) => !c.hidden);
  if (!live.length) {
    console.log(`  ${label}: NO CARD OFFERS THE READOUT`);
    process.exitCode = 1;
    return;
  }
  for (const c of live) {
    console.log(`  ${label}: ${c.w}x${c.h}  "${c.head}" | "${c.main}" | "${c.note}"`
      + (c.glyphs ? `  [${c.glyphs} drawn faces]` : ''));
    if (c.w <= 0 || c.h <= 0) {
      console.error(`    COLLAPSED: the readout is offered with no geometry`);
      process.exitCode = 1;
    }
  }
}

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Look');

  for (const vp of SHOTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${vp.panels}, log: ${vp.panels}})`);
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));

    // ---- the ordinary read, and then the same turn with two dice kept -----
    // A TOTAL-READING SYSTEM, because the readout forecasts in the shape the
    // table reads and the default room is per-die. Both shapes get a frame.
    await a.dbg('clearTable()');
    await a.dbg('pickClear()');
    await a.dbg('sim(60)');
    await a.dbg("setDiceSet('std')");
    await a.dbg("setSystem('none')");
    await a.roll('6d6 t3');
    report(`${vp.name}/total`, await readCards(a));
    console.log('    ' + await stage.shot(a, `decision-total-${vp.name}.png`));

    // REAL CLICKS on real dice, so the frame is what a player's hand produces.
    await a.eval(`(() => {
      const dbg = window.__diceDebug, c = document.querySelector('canvas');
      for (const i of [0, 2]) {
        const p = dbg.dieScreen(i);
        if (!p) continue;
        c.dispatchEvent(new MouseEvent('click',
          { clientX: Math.round(p.x), clientY: Math.round(p.y), bubbles: true }));
      }
      return true;
    })()`);
    await a.dbg('sim(30)');
    report(`${vp.name}/kept`, await readCards(a));
    console.log('    ' + await stage.shot(a, `decision-kept-${vp.name}.png`));

    // ---- every die kept: the refusal, said rather than blanked -------------
    // pickToggle TOGGLES, and two dice are already picked from the clicks
    // above — so the selection is cleared first, or this would unpick them and
    // photograph a four-kept turn under the "refused" name.
    await a.dbg('pickClear()');
    for (let i = 0; i < 6; i++) await a.dbg(`pickToggle(${i})`);
    await a.dbg('sim(10)');
    const all = await a.dbg('picked');
    if (all.dice.length !== 6) console.log(`    (kept ${all.dice.length} of 6)`);
    report(`${vp.name}/refused`, await readCards(a));
    console.log('    ' + await stage.shot(a, `decision-refused-${vp.name}.png`));

    // ---- the same dice under a per-die system: the WORDS, not a total ------
    await a.dbg('pickClear()');
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    await a.dbg("setSystem('soul-deal')");
    await a.roll('6d6 t3');
    report(`${vp.name}/words`, await readCards(a));
    console.log('    ' + await stage.shot(a, `decision-words-${vp.name}.png`));

    // ---- symbol dice: no total, and the faces are DRAWN --------------------
    await a.dbg('pickClear()');
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    await a.dbg("setDiceSet('symbols.monster')");
    await a.roll('4d6 t2');
    const faces = (await readCards(a)).filter((c) => !c.hidden);
    report(`${vp.name}/faces`, await readCards(a));
    if (faces.length && faces[0].glyphs !== 3) {
      console.error(`    NOT DRAWN: ${faces[0].glyphs} svg faces, expected 3 `
        + `(bolt, claw, heart) — a symbol that fell through to the digit painter`);
      process.exitCode = 1;
    }
    console.log('    ' + await stage.shot(a, `decision-faces-${vp.name}.png`));
    await a.dbg("setDiceSet('std')");
  }
}
