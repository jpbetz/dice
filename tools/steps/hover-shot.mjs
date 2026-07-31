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

// Screenshot an element's HOVER state: a real CDP mouse-move forces :hover
// (class toggles can't reach CSS :hover rules), then a PNG lands in
// tools/out/. For judging hover-revealed chrome (ROLL cue, tier-rule
// controls) that a static shot can never show.
//
//   node tools/drive.mjs tools/steps/hover-shot.mjs ['<selector>'] [out.png] ['<notation to roll first>']

export default async function run(stage, [selector = '#groups-list .pool-roll', out = 'hover.png', roll = null]) {
  const a = await stage.tab('localhost', 'Hover');
  if (roll) await a.roll(roll); // surfaces like the banner only exist post-roll
  await a.dbg('sim(60)');
  // Pin the viewport BEFORE measuring — the screenshot call would otherwise
  // re-lay-out after the rect was taken.
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  const rect = await a.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!rect) throw new Error(`no element matches ${selector}`);
  await a.page.browser.send('Input.dispatchMouseEvent',
    { type: 'mouseMoved', x: rect.x, y: rect.y }, a.page.sessionId);
  await new Promise((r) => setTimeout(r, 600)); // mid chevron loop
  console.log(await stage.shot(a, out));
}
