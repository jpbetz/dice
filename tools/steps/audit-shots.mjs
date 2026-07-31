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

// The full-state audit suite: one PNG per chrome state / CUJ moment, into
// tools/out/audit/. Feeds design reviews — every state a player actually
// meets, including hover states (real CDP mouse moves) and a small window.
//
//   node tools/drive.mjs tools/steps/audit-shots.mjs

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

export default async function run(stage) {
  const dir = join(OUT_DIR, 'audit');
  mkdirSync(dir, { recursive: true });
  const a = await stage.tab('localhost', 'Alice');
  const send = (m, p) => a.page.browser.send(m, p, a.page.sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const beat = (ms = 400) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    await beat();
    console.log(await stage.shot(a, join(dir, name)));
  };
  const hover = async (sel) => {
    const p = await a.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null; const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (p) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  };
  const unhover = () => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960, y: 900 });
  const step = async (name, fn) => {
    try { await fn(); await shot(name); } catch (e) {
      console.log(`(skip ${name}: ${String(e && e.message ? e.message : e).slice(0, 90)})`);
    }
  };

  await step('01-rest.png', async () => { await a.dbg('sim(30)'); });
  await step('02-draft.png', async () => {
    const tiles = `document.querySelectorAll('#die-buttons .die-btn')`;
    await a.eval(`${tiles}[6].click()`); // d20
    await a.eval(`${tiles}[1].click()`); // d6
    await a.eval(`${tiles}[1].click()`); // d6
  });
  await step('03-draft-hover.png', () => hover('#tray-roll'));
  await step('04-save-morph.png', async () => {
    await unhover();
    await a.eval(`document.getElementById('save-group').click()`);
  });
  await step('05-notation-view.png', async () => {
    await a.eval(`document.getElementById('save-cancel').click()`);
    await a.eval(`document.querySelector('#input-mode [data-v="text"]').click()`);
  });
  await step('06-pool-hover.png', async () => {
    await a.eval(`document.querySelector('#input-mode [data-v="dice"]').click()`);
    await a.eval(`document.getElementById('clear-tray').click()`);
    await hover('#groups-list .pool-roll');
  });
  await step('07-pools-manage.png', async () => {
    await unhover();
    await a.dbg('setPoolsEditMode(true)');
  });
  await step('08-row-editor.png', async () => {
    await a.eval(`document.querySelector('#groups-list .group-edit').click()`);
  });
  await step('09-popover.png', async () => {
    await a.dbg('setPoolsEditMode(false)');
    await a.dbg(`openPopoverFor('Attack')`);
  });
  await step('10-banner.png', async () => {
    await a.dbg('closePopover()');
    await a.roll('2d6+3 dc10');
  });
  await step('11-check-verdict.png', async () => {
    await a.dbg(`commandRoll('d20 check dc12')`);
    for (let i = 0; i < 40; i++) {
      await a.eval(`(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(30))`);
      if (await a.eval(`(window.__diceDebug.ceremonyState || {}).phase === 'done'`)) break;
    }
  });
  await step('12-cinematic-intent.png', async () => {
    await a.dbg('retireCeremony()');
    await a.dbg(`commandRoll('1d20+5 cinematic # The Duel | Charisma')`);
    await a.dbg('sim(20)'); // mid-declare: the intent card stands
  });
  await step('13-shelf-peek.png', async () => {
    for (let i = 0; i < 40; i++) {
      await a.eval(`(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(30))`);
      if (await a.eval(`(window.__diceDebug.ceremonyState || {}).phase === 'done'`)) break;
    }
    const rid = await a.rollId();
    await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
    await a.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.shelf.length >= 1 && window.__diceDebug.whiskingCount === 0)`,
      { desc: 'shelved' });
    await a.dbg(`peek(${JSON.stringify(rid)})`);
  });
  await step('14-log-flyout.png', async () => {
    await a.dbg('peek(null)');
    await a.dbg('setLogFlyout(true)');
  });
  await step('15-identity-menu.png', async () => {
    await a.dbg('setLogFlyout(false)');
    await a.eval(`document.getElementById('identity-chip').click()`);
  });
  await step('16-settings.png', async () => {
    // the identity menu closes on the chip's own toggle (outside-CLICK
    // synthetics don't reach its pointerdown listener)
    await a.eval(`document.getElementById('identity-chip').click()`);
    await a.dbg('openSettings()');
  });
  await step('17-palette.png', async () => {
    await a.eval(`document.getElementById('settings-close').click()`);
    await a.dbg('openPalette()');
  });
  await step('18-kbd.png', async () => {
    await a.eval(`document.getElementById('palette-backdrop').click()`);
    await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '?'}))`);
  });
  await step('19-compact.png', async () => {
    await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
    await a.dbg('setPanelState({compose: false, groups: false})');
  });
  await step('20-tab-flyout.png', async () => {
    await a.dbg('setGroupsFlyout(true)');
  });
  await step('21-small-window.png', async () => {
    await a.dbg('setGroupsFlyout(false)');
    await a.dbg('setPanelState({compose: true, groups: true})');
    await send('Emulation.setDeviceMetricsOverride',
      { width: 720, height: 480, deviceScaleFactor: 1, mobile: false });
    await a.dbg('sim(30)');
  });
  await step('22-multiplayer.png', async () => {
    await send('Emulation.setDeviceMetricsOverride',
      { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    const b = await stage.tab('127.0.0.1', 'Bob');
    await b.roll('1d20+2 dc14');
    await a.settle();
    await a.dbg('sim(60)');
  });
}
