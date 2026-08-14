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
//   node tools/drive.mjs tools/steps/tower-shots.mjs [tower] [seed]
//
// Writes tools/out/tower-<tower>-*.png.
//
// IT TAKES A TOWER, AND IT SAYS WHICH ONE IN EVERY FILENAME. It did neither:
// it shot whatever the bench boots wearing (heartwood) under names like
// `tower-look-front.png`, so running it for a new model produced a complete,
// plausible, entirely WRONG review sheet — of the reference tower, filed
// under the reviewer's belief that it was the new one. That is the same
// failure towerOcclusionCheck's `pending` guard exists to stop, and it needs
// the same two things: ask for the skin, then prove you got it.
//
// A BAKED ROW MAY NOT BE HERE YET (C6). towerLabSkin returns what the bench
// is ACTUALLY wearing — for a GLB row still in flight, the PREVIOUS skin — so
// the ask is polled and a bench wearing the wrong thing ABORTS. Half a review
// set is recoverable; a wrong one is not.

export default async function run(stage, [tower = 'heartwood', seed = '42']) {
  const t = await stage.tab('localhost', 'TowerLook');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  await t.dbg('towerEcho(false)');

  // THE ZOOM COMES FIRST, AND NOTHING BRACKETS IT BY HAND ANY MORE. This step
  // used to unsocket the bench around every setZoom because a preset
  // assignment discarded the lab's matExtra and left the model standing
  // several units behind the wall its volumes believed in. applyZoom owns that
  // now — it unsockets the lab AND the shipped tower across the change and
  // puts both back — so the old ceremony was a second, private copy of a fix
  // that had already landed, and a copy that could rot against it.
  const zoom = async (id) => {
    await t.dbg(`setZoom('${id}')`);
    await t.waitFor(`window.__diceDebug.zoom === '${id}'`, { desc: `zoom ${id}` });
  };
  // What the bench is wearing, asked without changing it (towerLabSkin with
  // no legal id is a read).
  const worn = () => t.dbg('towerLabSkin()');
  const wear = async (id) => {
    let got = await t.dbg(`towerLabSkin(${JSON.stringify(id)})`);
    for (let i = 0; got !== id && i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      got = await t.dbg(`towerLabSkin(${JSON.stringify(id)})`);
    }
    return got;
  };

  await zoom('medium');
  await t.dbg('towerCore(true)');
  const got = await wear(tower);
  if (got !== tower) {
    const st = await t.dbg(`towerModelStatus(${JSON.stringify(tower)})`);
    console.log(`BAD: asked for '${tower}', the bench is wearing '${got}' `
      + `(${JSON.stringify(st)}) — refusing to shoot a review sheet of the wrong tower`);
    process.exitCode = 1;
    return;
  }
  console.log(`skin=${got} seed=${seed}`);

  // The eye is re-parked INSIDE the shot: a reframe armed a frame earlier
  // would otherwise put the camera back under the screenshot.
  let eye = null;
  const shot = async (name) => {
    // …and the bench is re-asked before every frame. A zoom rebuilds the lab,
    // and a rebuild that came back wearing something else would otherwise
    // produce exactly the mislabelled sheet this step exists to refuse.
    const now = await worn();
    if (now !== tower) throw new Error(`the bench changed to '${now}' mid-sheet (wanted ${tower})`);
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    if (eye) await t.dbg(`towerEye(${eye})`);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    console.log(await stage.shot(t, `tower-${tower}-${name}`));
  };
  const pour = async (n) => {
    await t.dbg(`towerDrop(${n}, ${Number(seed)})`);
    await t.eval('(() => { for (let i = 0; i < 420; i++)'
      + ' window.__diceDebug.tick(1/60, false, false); return 1; })()');
  };

  // THE MODEL, from a look-only eye. The shipped cameras frame the mat, and
  // an 11-unit tower at its back edge runs off the top of all six of them —
  // judging the model needs its own eye; judging the TABLE needs theirs.
  for (const [name, args] of [
    ['front', '15, 6.4, 0.6'],
    ['three-quarter', '13, 7.5, 8'],
    ['low', '12, 2.8, 4'],
    ['mouth', '8, 14, 3'],
  ]) {
    eye = args;
    await shot(`look-${name}.png`);
  }
  eye = '13, 7.5, 8';
  await t.dbg('towerGhosts(true)');
  await shot('look-ghosts.png');
  await t.dbg('towerGhosts(false)');
  await pour(6);
  eye = '20, 9, 7';
  await shot('look-poured.png');

  // …and what a player actually gets, at both ends of the zoom ladder.
  eye = null;
  for (const z of ['medium', 'close']) {
    await zoom(z);
    await shot(`${z}-empty.png`);
    await pour(6);
    await shot(`${z}-poured.png`);
  }
}
