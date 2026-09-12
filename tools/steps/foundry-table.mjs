// Copyright 2026 The Dice Table Authors
// SPDX-License-Identifier: Apache-2.0

// The replacement collection through the player's camera, on desktop/phone
// and both fae floors. Run with tools/drive.mjs on its ephemeral server.
import assert from 'node:assert/strict';

export default async function run(stage) {
  const t = await stage.tab('localhost', 'Foundry');
  await t.dbg('holdClock(true)');
  await t.dbg("setZoom('medium')");
  const devices = [
    { name: 'desktop', width: 1500, height: 950, mobile: false },
    { name: 'phone', width: 390, height: 844, mobile: true },
  ];
  for (const device of devices) {
    const { name, ...metrics } = device;
    await t.page.browser.send('Emulation.setDeviceMetricsOverride',
      { ...metrics, deviceScaleFactor: 1 }, t.page.sessionId);
    await t.dbg(`setPanelState({pools:${name === 'desktop'},log:false})`);
    await t.reload();
    await t.dbg('holdClock(true)');
    for (const tower of ['wickroot', 'cairnwatch', 'cinderbell']) {
      await t.dbg(`setTower('${tower}')`);
      await t.waitFor(`window.__diceDebug.tower === '${tower}'`, { desc: `${tower} loaded` });
      await t.dbg('sim(250)');
      await t.eval('window.__diceDebug.tick(0, true, false)');
      await stage.shot(t, `foundry-table-${name}-${tower}-rest.png`);
      await t.dbg("commandRoll('3d6')");
      await t.waitFor('!!window.__diceDebug.currentRoll?.landings', { desc: 'pour baked' });
      const f = await t.dbg('towerFilmInfo()');
      assert.ok(f.rest.length === 3 && f.rest.every((d) => d.delivered));
      const entryFrame = Math.max(1, Math.round(f.firstExitTime * 60 * 0.35));
      await t.dbg(`sim(${entryFrame})`);
      await t.eval('window.__diceDebug.tick(0, true, false)');
      await stage.shot(t, `foundry-table-${name}-${tower}-entry.png`);
      await t.dbg(`sim(${f.frames + 250 - entryFrame})`);
      await t.settle();
      await t.dbg('sim(1500)');
      await t.eval('window.__diceDebug.tick(0, true, false)');
      const frame = await t.dbg('framingInfo()');
      console.log(`${name}/${tower}: ${frame.diceOnScreen}/${frame.dice} dice on screen; deciding=${frame.decidingOnScreen}`);
      assert.equal(frame.decidingOnScreen, true, 'the deciding die stays inside the player viewport');
      await stage.shot(t, `foundry-table-${name}-${tower}-result.png`);
      await t.dbg('clearTable()'); await t.dbg('sim(400)');
    }
  }
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, mobile: false, deviceScaleFactor: 1 }, t.page.sessionId);
  for (const venue of ['moonrise', 'foxfire']) {
    await t.dbg(`setVenue('${venue}')`);
    await t.waitFor(`window.__diceDebug.venue === '${venue}' && window.__diceDebug.tower === 'wickroot'`,
      { desc: `${venue} with Wickroot` });
    await t.dbg('sim(400)');
    await t.eval('window.__diceDebug.tick(0, true, false)');
    await stage.shot(t, `foundry-table-${venue}.png`);
  }
  assert.deepEqual(t.page.errors, []);
  console.log('Player camera: three towers on desktop and phone, six pours, both fae venues.');
}
