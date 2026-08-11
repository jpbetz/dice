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

// FRAMES OF THE TOWER SKIN, for a human to judge. Scripted only — the skin
// is a visual, and this is the cheap way to look at one without a human
// driving a browser for 45 minutes (docs/TESTING.md).
//
//   node tools/drive.mjs tools/steps/tower-shots.mjs [seed]
//
// Writes tools/out/tower-*.png.
//
// ORDER MATTERS, and it is a lab wart worth knowing: applyZoom assigns
// TABLE_D from the preset, which silently discards the matExtra that
// socketing the tower added. Change the zoom with the tower UNSOCKETED and
// socket it after, or the model ends up standing several units behind the
// wall the volumes think it is at.

export default async function run(stage, [seed = '42']) {
  const t = await stage.tab('localhost', 'TowerLook');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  await t.dbg('towerEcho(false)');

  // The eye is re-parked INSIDE the shot: a reframe armed a frame earlier
  // would otherwise put the camera back under the screenshot.
  let eye = null;
  const shot = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    if (eye) await t.dbg(`towerEye(${eye})`);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    console.log(await stage.shot(t, name));
  };
  const socket = async (zoom) => {
    await t.dbg('towerCore(false)');
    await t.dbg(`setZoom('${zoom}')`);
    await t.dbg('towerCore(true)');
  };
  const pour = async (n) => {
    await t.dbg(`towerDrop(${n}, ${Number(seed)})`);
    await t.eval('(() => { for (let i = 0; i < 420; i++)'
      + ' window.__diceDebug.tick(1/60, false, false); return 1; })()');
  };

  // THE MODEL, from a look-only eye. The shipped cameras frame the mat, and
  // an 11-unit tower at its back edge runs off the top of all six of them —
  // judging the model needs its own eye; judging the TABLE needs theirs.
  await socket('medium');
  for (const [name, args] of [
    ['front', '15, 6.4, 0.6'],
    ['three-quarter', '13, 7.5, 8'],
    ['low', '12, 2.8, 4'],
    ['mouth', '8, 14, 3'],
  ]) {
    eye = args;
    await shot(`tower-look-${name}.png`);
  }
  eye = '13, 7.5, 8';
  await t.dbg('towerGhosts(true)');
  await shot('tower-look-ghosts.png');
  await t.dbg('towerGhosts(false)');
  await pour(6);
  eye = '20, 9, 7';
  await shot('tower-look-poured.png');

  // …and what a player actually gets, at both ends of the zoom ladder.
  eye = null;
  for (const zoom of ['medium', 'close']) {
    await socket(zoom);
    await shot(`tower-${zoom}-empty.png`);
    await pour(6);
    await shot(`tower-${zoom}-poured.png`);
  }
}
