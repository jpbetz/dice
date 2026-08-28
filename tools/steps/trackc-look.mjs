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

// EVERYTHING TRACK C ADDED, IN ONE FRAME — for the judgement no gate can make.
//
// Each M-item was looked at on its own as it shipped. What none of those
// frames could show is the card carrying ALL of it at once: the keep rings,
// the keyboard hint, the scoring marks, the running tally, the forecast, and
// two verbs where there used to be one. The question for the eye is whether
// that is a decision surface or a control panel.
//
//   node tools/drive.mjs tools/steps/trackc-look.mjs

const SHOTS = [
  { name: 'desktop', w: 1500, h: 950, panels: false },
  { name: 'phone', w: 390, h: 844, panels: false },
];

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Player');

  for (const vp of SHOTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${vp.panels}, log: ${vp.panels}})`);
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));

    // ① The numeric case: a push turn mid-decision, with a forecast.
    let rid = null;
    let st = null;
    for (let i = 0; i < 40 && !rid; i++) {
      await a.dbg('clearTable()');
      await a.dbg('sim(30)');
      await a.roll('6d6 push>=5');
      const id = await a.rollId();
      const s = await a.dbg(`pushState(${JSON.stringify(id)})`);
      if (s.state && !s.state.busted && s.state.scoring.length >= 2) { rid = id; st = s; }
    }
    if (!rid) throw new Error('no live push turn with two scoring dice in 40 rolls');
    for (const i of st.state.scoring) await a.dbg(`pickToggle(${i})`);
    await a.dbg('sim(30)');
    const line = (await a.dbg(`pushState(${JSON.stringify(rid)})`)).line;
    const verbs = await a.eval(`(() => {
      const t = document.querySelector('.throw-again');
      const b = document.querySelector('.bank-turn');
      return JSON.stringify({ throw: t && !t.hidden ? t.textContent.trim() : null,
        bank: b && !b.hidden ? b.textContent.trim() : null });
    })()`);
    console.log(`${vp.name}/push: ${line} | verbs ${verbs}`);
    console.log('  ' + await stage.shot(a, `trackc-push-${vp.name}.png`));

    // ② The loaded case: a bag of weighted symbol dice, in a turn. The
    // forecast REFUSES here, which is the half worth looking at.
    await a.dbg('clearTable()');
    await a.dbg('sim(30)');
    await a.roll('4d6 bag:4@symbols.kind,4@symbols.cruel,4@symbols.fate t3');
    const brid = await a.rollId();
    await a.dbg('pickToggle(0)');
    await a.dbg('pickToggle(2)');
    await a.dbg('sim(30)');
    const bag = await a.dbg(`bagState(${JSON.stringify(brid)})`);
    console.log(`${vp.name}/bag: drew ${JSON.stringify(bag.record)}, felt ${JSON.stringify(bag.felt)}`);
    console.log('  ' + await stage.shot(a, `trackc-bag-${vp.name}.png`));
  }
}
