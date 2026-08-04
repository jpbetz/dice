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

// Side-panel UX review (Joe 2026-08-04: 'what visual cues are missing to
// help people not familiar with it orient themselves', the ± drawer-pull,
// the disposal verbs, staged-tile transparency, the metal theme).
// Crops the PANEL COLUMN, not the whole window — this is a review of the
// column's own dress at reading distance.
//
//   node tools/drive.mjs tools/steps/panel-ux-shots.mjs

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

export default async function run(stage) {
  const dir = join(OUT_DIR, 'panel-ux');
  mkdirSync(dir, { recursive: true });
  const a = await stage.tab('localhost', 'Joe');
  const send = (m, p) => a.page.browser.send(m, p, a.page.sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false });
  const beat = (ms = 350) => new Promise((r) => setTimeout(r, ms));
  // the panel column only, at 2× — the dress is the subject
  const crop = { x: 0, y: 0, width: 330, height: 1000, scale: 1 };
  const shot = async (name) => {
    await beat();
    const { data } = await send('Page.captureScreenshot',
      { format: 'png', clip: crop, captureBeyondViewport: false });
    const { writeFileSync } = await import('node:fs');
    const p = join(dir, name);
    writeFileSync(p, Buffer.from(data, 'base64'));
    console.log(p);
  };
  const hover = async (sel) => {
    const box = await a.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!box) throw new Error(`no ${sel}`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  };

  await a.dbg(`setGroups([
    {name: 'Attack', notation: '1d20+3'},
    {name: 'Longsword', notation: '1d8+3'},
    {name: 'Sneak', notation: '4d6'},
    {name: 'Fireball', notation: '8d6', category: 'Spells'},
    {notation: '2d6'},
  ])`);
  await a.dbg('setPanelState({pools: true})');

  // 1 · COLD START — what a newcomer sees: empty well, no draft verbs
  await shot('01-cold-empty.png');

  // 2 · one loose die tapped from the palette
  await a.eval(`document.querySelector('.die-btn img[data-art-type="d20"]').closest('button').click()`);
  await shot('02-one-die.png');

  // 3 · a saved pool staged on top — the src-chip dress (transparency)
  const pools = await a.dbg('groups');
  await a.eval(`document.querySelector('[data-group-id="${pools[2].id}"] .tile-stage').click()`);
  await shot('03-staged-pool.png');

  // 4 · the gold ROLL hover (the thing Joe loves — check it in a full well)
  await hover('#tray-roll');
  await shot('04-roll-hover.png');

  // 5 · the ± drawer-pull hovered
  await hover('#tray-mods');
  await shot('05-mods-hover.png');

  // 6 · a disposal verb hovered (Save)
  await hover('#save-group');
  await shot('06-save-hover.png');

  // 7 · two pools + loose dice: a crowded well
  await a.eval(`document.querySelector('[data-group-id="${pools[0].id}"] .tile-stage').click()`);
  await a.eval(`document.querySelector('.die-btn img[data-art-type="d6"]').closest('button').click()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 500 });
  await shot('07-crowded-well.png');

  // 8 · the save morph (name row) in place of the verbs
  await a.eval(`document.getElementById('save-group').click()`);
  await shot('08-save-morph.png');
  await a.eval(`document.getElementById('save-cancel').click()`);

  // 9 · the ± popover open over the well
  await a.eval(`document.getElementById('tray-mods').click()`);
  await beat();
  await send('Page.captureScreenshot', { format: 'png' }).then(async ({ data }) => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, '09-mods-popover.png'), Buffer.from(data, 'base64'));
    console.log(join(dir, '09-mods-popover.png'));
  });
  await a.eval(`document.getElementById('pop-close').click()`);

  // 10 · the whole window with a full well — panel in context
  await beat();
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir, '10-window.png'), Buffer.from(data, 'base64'));
  console.log(join(dir, '10-window.png'));
}
