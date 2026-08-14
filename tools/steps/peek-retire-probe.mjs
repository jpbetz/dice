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

// U20: "the peek closes on nothing a player expects — not a new roll, not a
// ceremony, not the log — and at z 30 it outranks all of them." Three paths,
// measured rather than argued. The ceremony leg is the one the repo's own
// capture run caught standing through an entire Check.
//
//   node tools/drive.mjs tools/steps/peek-retire-probe.mjs

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Nessa');
  const put = async (n) => {
    await a.roll(n);
    const rid = await a.rollId();
    await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
    await a.waitFor(
      `(window.__diceDebug.sim(240), window.__diceDebug.shelf.some((s) => s.rollId === ${JSON.stringify(rid)}))`,
      { desc: `put away ${n}` });
    return rid;
  };

  // ① a plain new roll retires it
  const rid = await put('2d6');
  await a.dbg('setLogFlyout(true)');
  console.log('  open card ->', await a.dbg(`peek(${JSON.stringify(rid)})`));
  await a.roll('d20');
  await a.settle();
  await a.dbg('sim(60)');
  console.log('  after a plain roll, card =', await a.dbg('peekState'));

  // ② a CEREMONY retires it
  const rid2 = await put('d8');
  await a.dbg('setLogFlyout(true)');
  console.log('  re-open card ->', await a.dbg(`peek(${JSON.stringify(rid2)})`));
  await a.eval(`window.__diceDebug.commandRoll('1d20+4 dc15 check # The Duel')`);
  let sawLayer = false;
  for (let i = 0; i < 60; i++) {
    if (await a.eval(`!document.getElementById('ceremony-layer').classList.contains('hidden')`)) {
      sawLayer = true;
      break;
    }
    await a.dbg('sim(30)');
    await new Promise((r) => setTimeout(r, 40));
  }
  console.log(`  ceremony layer raised = ${sawLayer}, card =`, await a.dbg('peekState'));
  await a.settle();

  // ③ closing the log retires it (shipped in Stage 1 — pinned here too)
  const rid3 = await put('d4');
  await a.dbg('setLogFlyout(true)');
  await a.dbg(`peek(${JSON.stringify(rid3)})`);
  await a.dbg('setLogFlyout(false)');
  console.log('  after closing the log, card =', await a.dbg('peekState'));
}
