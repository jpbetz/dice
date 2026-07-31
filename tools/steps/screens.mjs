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

// The standing screenshot suite: one settled roll, then a PNG per named
// state into tools/out/ for human visual review (TESTING.md: judging NEW
// visuals is the one job screenshots have; assertions stay in e2e).
//
//   node tools/drive.mjs tools/steps/screens.mjs [feltId] [prefix]

export default async function run(stage, [felt = null, prefix = 'ui']) {
  const a = await stage.tab('localhost', 'Shot');
  // screenshot() captures the CURRENT viewport now — pin ours explicitly.
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  if (felt) await a.dbg(`setFelt(${JSON.stringify(felt)})`);
  await a.roll('2d6+1');
  const beat = () => new Promise((r) => setTimeout(r, 400)); // let imgs paint

  await beat();
  console.log(await stage.shot(a, `${prefix}-default.png`));

  // The states below tolerate hooks that don't exist yet (pre-redesign
  // builds): each is skipped with a note instead of failing the run.
  const maybe = async (name, drive) => {
    try {
      await drive();
      await beat();
      console.log(await stage.shot(a, `${prefix}-${name}.png`));
    } catch (e) {
      console.log(`(skip ${name}: ${String(e && e.message ? e.message : e).slice(0, 80)})`);
    }
  };
  await maybe('log', () => a.dbg('setLogFlyout(true)'));
  await maybe('edit', async () => {
    await a.dbg('setLogFlyout(false)');
    await a.dbg('setPoolsEditMode(true)');
  });
}
