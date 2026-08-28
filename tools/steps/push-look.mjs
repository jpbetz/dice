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

// MECHANICS M4's readout, rendered — the look-before-done gate.
//
// Three frames, because a push turn has three states worth judging and only
// one of them is the happy one: a live turn with dice kept, a bust, and a
// bank. The question for the eye is whether "which of these counted" reads at
// a glance without the line having to say it twice.
//
//   node tools/drive.mjs tools/steps/push-look.mjs

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Pusher');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.dbg('setPanelState({pools: false, log: false})');
  await a.eval('window.dispatchEvent(new Event("resize"))');
  await new Promise((r) => setTimeout(r, 250));

  const live = async (notation) => {
    for (let i = 0; i < 40; i++) {
      await a.dbg('clearTable()');
      await a.dbg('sim(30)');
      await a.roll(notation);
      const rid = await a.rollId();
      const st = await a.dbg(`pushState(${JSON.stringify(rid)})`);
      if (st.state && !st.state.busted) return { rid, st };
    }
    throw new Error('forty push rolls busted in a row');
  };

  // ① A live turn with the scoring dice kept — the ordinary decision point.
  const { rid, st } = await live('6d6 push>=5');
  for (const i of st.state.scoring) await a.dbg(`pickToggle(${i})`);
  await a.dbg('sim(30)');
  console.log(`live: ${(await a.dbg(`pushState(${JSON.stringify(rid)})`)).line}`);
  console.log('  ' + await stage.shot(a, 'push-live.png'));

  // ② Banked.
  await a.dbg(`bankTurn(${JSON.stringify(rid)}, ${JSON.stringify(st.state.scoring)})`);
  await a.dbg('sim(30)');
  console.log(`banked: ${(await a.dbg(`pushState(${JSON.stringify(rid)})`)).line}`);
  console.log('  ' + await stage.shot(a, 'push-banked.png'));

  // ③ A real bust, not a mocked one.
  let bust = null;
  for (let i = 0; i < 60 && !bust; i++) {
    await a.dbg('clearTable()');
    await a.dbg('sim(30)');
    await a.roll('4d6 push>=6');
    const st2 = await a.dbg(`pushState(${JSON.stringify(await a.rollId())})`);
    if (st2.state && st2.state.busted) bust = st2;
  }
  if (!bust) throw new Error('no bust in 60 throws of 4d6 push>=6');
  console.log(`bust: ${bust.line}`);
  console.log('  ' + await stage.shot(a, 'push-bust.png'));
}
