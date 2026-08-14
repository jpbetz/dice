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

// THE SETTINGS PANEL, ONE SHOT PER DESTINATION (UX §7.36).
//
//   node tools/drive.mjs tools/steps/settings-shots.mjs [prefix]
//
// It exists because the panel's defect was a MEASUREMENT — 45 controls in a
// 320px column that scrolled 1004px inside a 647px window — and a restructure
// that fixes a measurement should be able to show the measurement moving. So
// this prints the numbers beside the frames: per destination, the panel's
// scroll height against its client height (the overflow is the thing that was
// wrong), and how many controls are reachable without scrolling.
//
// The lobby is deliberately NOT shot here — see the note at the foot.
//
// Not a gate. The e2e suite pins the structure (`settings-destinations`); this
// is for the eye.

const DESTS = ['table', 'staging', 'you', 'stuff'];

export default async function run(stage, args) {
  const prefix = args[0] || 'settings';
  const a = await stage.tab('localhost', 'Settings');
  await a.settle();

  const rows = [];
  for (const dest of DESTS) {
    await a.dbg(`openSettings('${dest}')`);
    await a.waitFor(`window.__diceDebug.settingsDest() === '${dest}'`,
      { desc: `the ${dest} destination is in hand` });
    // OUTWAIT THE SEG'S FADE. `.seg button` transitions background and colour
    // over 150ms, and a shot taken the instant the state flips catches the
    // OLD cell still half-lit — the first staging sheet showed two
    // destinations pressed, which is a photograph of a transition being read
    // as a state bug. 250ms is the transition plus a frame.
    await a.eval('new Promise((r) => setTimeout(r, 250))');
    const m = await a.eval(`(() => {
      const p = document.getElementById('settings-panel');
      const reach = [...p.querySelectorAll('button,input,textarea,select')]
        .filter((e) => e.offsetParent !== null);
      return JSON.stringify({
        scrollH: p.scrollHeight, clientH: p.clientHeight,
        over: Math.max(0, p.scrollHeight - p.clientHeight),
        reachable: reach.length,
      });
    })()`);
    rows.push([dest, JSON.parse(m)]);
    await stage.shot(a, `${prefix}-${dest}.png`);
  }

  console.log('\ndestination   scroll  client  OVERFLOW  reachable');
  for (const [dest, m] of rows) {
    console.log(`  ${dest.padEnd(11)} ${String(m.scrollH).padStart(5)}   `
      + `${String(m.clientH).padStart(5)}   ${String(m.over).padStart(6)}   `
      + `${String(m.reachable).padStart(6)}`);
  }
  const worst = Math.max(...rows.map(([, m]) => m.over));
  console.log(worst === 0
    ? '\nNo destination scrolls. (Before §7.36: one column, 1004 over 647 — 357 of overflow.)'
    : `\nNOTE: the worst destination still overflows by ${worst}px.`);

  // THE LOBBY IS NOT SHOT HERE. Its panel headings are claims that go false
  // with no table ("Everyone at the table"), and §3b/L0's relabelling is worth
  // guarding — but it is guarded by an ASSERTION, in the lobby scenarios,
  // where a wrong word fails a run instead of waiting for somebody to look at
  // a PNG. Reaching the lobby from a step also means opening a tab at the bare
  // URL, and navigating an existing one tears __diceDebug down mid-eval.
}
