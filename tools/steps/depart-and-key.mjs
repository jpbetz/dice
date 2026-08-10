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

// The two 2026-08-09 visual changes, in frames you can judge:
//
//   1. THE HOVER KEY — the result card's pool labels each lead with the hue
//      their dice wear on the felt. Shot with a real CDP mouse-move over the
//      card, so the outlines are actually painted.
//   2. THE DEPARTURE — how a die leaves. holdClock freezes the world, sim()
//      walks the 0.3 s window a few frames at a time, and each style gets a
//      strip of stills. Comparable because the clock is held: every style is
//      sampled at exactly the same p.
//
//   node tools/drive.mjs tools/steps/depart-and-key.mjs [style,style,…]

const NOTATION = '2d8[Wisdom]+1d4[Zeal]+1d6';
const SAMPLES = [0, 3, 6, 9, 12, 18]; // frames into a 18-frame (0.3 s) window

export default async function run(stage, [styles = 'lift,fold,sink']) {
  const a = await stage.tab('localhost', 'Look');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  // The tidy-away clock is wall-time, not sim-time: it would collect the roll
  // out from under a held clock while we were still looking at it.
  await a.dbg('setBannerRetireMs(0)');

  // ---- 1. the hover key -----------------------------------------------
  await a.roll(NOTATION);
  await a.dbg('sim(60)');
  const rect = await a.eval(`(() => {
    const r = document.getElementById('result-banner').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 18 };
  })()`);
  await a.page.browser.send('Input.dispatchMouseEvent',
    { type: 'mouseMoved', x: rect.x, y: rect.y }, a.page.sessionId);
  await new Promise((r) => setTimeout(r, 250));
  console.log('key:', JSON.stringify(await a.dbg('cardKey')));
  console.log('felt:', JSON.stringify(await a.dbg('outlineState')));
  console.log(await stage.shot(a, 'key-hover.png'));

  // ---- 2. the departure, style by style --------------------------------
  await a.dbg('holdClock(true)');
  for (const style of styles.split(',')) {
    if (await a.dbg(`setClearStyle(${JSON.stringify(style)})`) !== true) {
      throw new Error(`unknown clear style: ${style}`);
    }
    if (!(await a.diceCount())) {
      await a.dbg('holdClock(false)');
      await a.roll(NOTATION);
      await a.dbg('holdClock(true)');
    }
    const rid = await a.rollId();
    await a.dbg(`clearRoll(${JSON.stringify(rid)})`);
    let at = 0;
    for (const frame of SAMPLES) {
      await a.dbg(`sim(${frame - at})`);
      at = frame;
      console.log(`${style} f${frame}:`, JSON.stringify(await a.dbg('sinkState')));
      console.log(await stage.shot(a, `depart-${style}-f${String(frame).padStart(2, '0')}.png`));
    }
    await a.dbg('sim(60)'); // drain the records before the next style
  }
  await a.dbg('holdClock(false)');
  await a.dbg(`setClearStyle('lift')`);
}
