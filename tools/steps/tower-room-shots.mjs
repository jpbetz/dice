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

// FRAMES OF THE SHIPPED TOWER, from the player's own camera — the room
// setting, not the lab. tower-shots.mjs looks at the MODEL from a look-only
// eye; this looks at the TABLE, which is the thing a player is actually
// given. Scripted (docs/TESTING.md): a visual still needs a human, but not a
// human driving a browser.
//
//   node tools/drive.mjs tools/steps/tower-room-shots.mjs [tower]
//
// Writes tools/out/room-tower-<tower>-*.png.
//
// IT TAKES A TOWER NOW, AND IT SETS IT RATHER THAN CLICKING FOR IT. The
// picker chip was the only way in, and renderTowerPicker deliberately skips
// venueOnly rows — so the Hollow Bole, the one model whose player's-eye look
// nobody has ever gated, was unreachable by construction: the shipped-camera
// review set existed for three of the four models and read as if it covered
// all of them. setTower(id) is the same room setting the chip writes, so a
// venue tower gets the same frames; the chip itself is still exercised, on a
// row that has one.

export default async function run(stage, args) {
  const tower = args[0] || 'heartwood';
  const t = await stage.tab('localhost', 'RoomTower');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  const shot = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    console.log(await stage.shot(t, `room-tower-${tower}-${name}`));
  };

  const row = (await t.dbg('towerRegistry()')).find((r) => r.id === tower);
  if (!row) {
    console.log(`BAD: '${tower}' is not a registered tower`);
    process.exitCode = 1;
    return;
  }

  // The picker itself, in the modal, under Felt.
  await t.dbg('openSettings()');
  await t.eval(`document.getElementById('tower-picker').scrollIntoView({block:'center'})`);
  await shot('picker.png');
  if (row.venueOnly) {
    console.log(`NOTE: '${tower}' is venueOnly, so the picker has no chip for it `
      + '(renderTowerPicker skips those rows) — the room setting is written directly. '
      + 'The picker frame above is the chips a player sees, which does NOT include this tower.');
  } else {
    await t.eval(`document.querySelector('[data-tower="${tower}"]').click()`);
    await t.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: 'the chip raises the tower' });
    await shot('picker-set.png');
  }
  await t.dbg(`setTower('${tower}')`);
  await t.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: `${tower} up` });
  // A baked row does not socket in the tick it is asked for.
  for (let i = 0; i < 60; i++) {
    const st = await t.dbg(`towerModelStatus('${tower}')`);
    if (st && st.ready) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await t.eval(`document.getElementById('settings-modal').classList.add('hidden')`);

  for (const zoom of ['wide', 'medium', 'close']) {
    await t.dbg(`setZoom('${zoom}')`);
    await t.waitFor(`window.__diceDebug.zoom === '${zoom}'`, { desc: `zoom ${zoom}` });
    await t.dbg('sim(120)');
    await shot(`${zoom}-empty.png`);

    // A pour, sampled at act one (dice falling into the mouth), mid-transit,
    // the first exits, and the settle. The camera choreography is part of
    // what is being judged, so nothing re-parks the eye here.
    await t.dbg(`commandRoll('8d6')`);
    await t.waitFor('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
      { desc: 'the pour arrived' });
    const f = JSON.parse(await t.eval('JSON.stringify(window.__diceDebug.towerFilmInfo())'));
    const marks = [
      ['entry', Math.max(1, Math.round(f.firstExitTime * 60 * 0.35))],
      ['transit', Math.max(2, Math.round(f.firstExitTime * 60 * 0.85))],
      ['first-exit', Math.round(f.firstExitTime * 60) + 8],
      ['spread', Math.round(f.frames * 0.75)],
    ];
    let at = 0;
    for (const [name, frame] of marks) {
      await t.dbg(`sim(${Math.max(0, frame - at)})`);
      at = Math.max(at, frame);
      await shot(`${zoom}-${name}.png`);
    }
    await t.dbg(`sim(${f.frames + 240 - at})`);
    await shot(`${zoom}-settled.png`);
    await t.dbg('clearTable()');
    await t.dbg('sim(400)');
  }

  // And with no tower, for the comparison that matters most: the table a
  // player who never touches the setting still gets.
  await t.dbg(`setTower('none')`);
  await t.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'the tower comes down' });
  await t.dbg(`setZoom('medium')`);
  await t.waitFor(`window.__diceDebug.zoom === 'medium'`, { desc: 'back to medium' });
  await t.dbg('sim(120)');
  await shot('towerless-empty.png');
  await t.dbg(`commandRoll('8d6')`);
  await t.settle();
  await shot('towerless-settled.png');
}
