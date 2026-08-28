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

// MECHANICS M3's symbol dice, rendered — the look-before-done gate.
//
// Every face of both sets, forced to a known value, so the frame shows all
// six symbols rather than whatever six dice happened to land on. The symbols
// are DRAWN paths, so what has to be judged is the drawing: is a claw a claw
// at the size a die is actually seen at?
//
//   node tools/drive.mjs tools/steps/symbol-look.mjs

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Look');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.dbg('setPanelState({pools: false, log: false})');
  await a.eval('window.dispatchEvent(new Event("resize"))');
  await new Promise((r) => setTimeout(r, 250));

  for (const set of ['symbols.monster', 'symbols.fate']) {
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    await a.dbg(`setDiceSet(${JSON.stringify(set)})`);
    // One die per value: the frame shows the whole face table at once.
    await a.eval(`window.__diceDebug.throwSeeded(${JSON.stringify(Array(6).fill('d6'))}, 4242, [1,2,3,4,5,6])`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc: `${set} settles`, timeout: 30000 });
    await a.dbg('sim(240)');
    const faces = await a.eval(`(() => {
      const s = window.__diceDebug.turnState(null);
      return JSON.stringify(s.faces);
    })()`).catch(() => 'n/a');
    console.log(`${set}: dice show ${faces}`);
    console.log('  ' + await stage.shot(a, `symbols-${set.split('.')[1]}.png`));
  }
}
