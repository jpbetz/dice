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

// Soul Deal UI audit stills (Joe 2026-08-04): the left panel, the reveal
// panel (result banner), the collect-hover peek card, and the check /
// cinematic verdict cards — all under the default 'Your Soul Deal' system,
// exercising the MULTI-POOL flow (attribute + skill + motivation staged
// from the rack). Focus: presentation of information, button consistency
// (close/reroll hovers on every surface).
//
//   node tools/drive.mjs tools/steps/souldeal-audit-shots.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

export default async function run(stage) {
  const dir = join(OUT_DIR, 'souldeal-audit');
  mkdirSync(dir, { recursive: true });
  const a = await stage.tab('localhost', 'Joe');
  const send = (m, p) => a.page.browser.send(m, p, a.page.sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const beat = (ms = 400) => new Promise((r) => setTimeout(r, ms));

  const save = (name, data) => {
    const p = join(dir, name);
    writeFileSync(p, Buffer.from(data, 'base64'));
    console.log(p);
  };
  const fullShot = async (name) => {
    await beat();
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    save(name, data);
  };
  // Tight crop around a selector at 2× — the reading-distance shot.
  const cropShot = async (sel, name, pad = 24) => {
    await beat();
    const r = await a.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null; const b = e.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
    if (!r) { console.log(`(skip ${name}: no ${sel})`); return; }
    const clip = {
      x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad),
      width: Math.min(1920, r.w + pad * 2), height: Math.min(1080, r.h + pad * 2),
      scale: 2,
    };
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip });
    save(name, data);
  };
  const panelShot = async (name) => {
    await beat();
    const { data } = await send('Page.captureScreenshot',
      { format: 'png', clip: { x: 0, y: 0, width: 330, height: 1080, scale: 2 } });
    save(name, data);
  };
  const hover = async (sel) => {
    const box = await a.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!box) throw new Error(`no ${sel}`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  };
  const parkMouse = () => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1600, y: 200 });

  // The seat: the default Soul Deal rack, advanced a little down the ✎ path
  // (the chart columns differ per die rank — that is the read under review).
  await a.dbg('setPanelState({pools: true})');
  const pools = await a.dbg('groups');
  const byName = (n) => pools.find((g) => g.name === n);
  await a.dbg(`editPool(${byName('Wisdom').id}, {notation: '2d8'})`);
  await a.dbg(`editPool(${byName('Sword').id}, {notation: '1d10'})`);

  // ---- A · the left panel, multi-pool flow --------------------------------
  await parkMouse();
  await panelShot('01-panel-rest.png');

  const stagePool = (n) => a.eval(
    `document.querySelector('[data-group-id="${byName(n).id}"] .tile-stage').click()`);
  await stagePool('Wisdom');
  await stagePool('Sword');
  await stagePool('Peer Respect');
  await panelShot('02-panel-staged-3pools.png');

  await hover('#tray-roll');
  await panelShot('03-panel-roll-hover.png');
  await parkMouse();

  // ---- B · the reveal panel (result banner) -------------------------------
  await a.eval(`document.getElementById('tray-roll').click()`);
  await a.settle();
  await parkMouse();
  await fullShot('04-banner-window.png');
  await cropShot('#result-banner', '05-banner.png');

  await hover('#banner-main');
  await cropShot('#result-banner', '06-banner-body-hover.png');
  await hover('#banner-actions .pk-strip');
  await cropShot('#result-banner', '07-banner-reroll-hover.png');
  await parkMouse();

  // ---- C · collect + the peek card ----------------------------------------
  const rid1 = await a.rollId();
  await a.dbg(`collectRoll(${JSON.stringify(rid1)})`);
  await a.waitFor(
    `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
    { desc: 'shelved' },
  );
  await a.dbg(`peek(${JSON.stringify(rid1)})`);
  await cropShot('#peek-card', '08-peek.png');
  await hover('#peek-card .pk-main');
  await cropShot('#peek-card', '09-peek-body-hover.png');
  await hover('#peek-card .pk-strip');
  await cropShot('#peek-card', '10-peek-reroll-hover.png');
  await parkMouse();
  await a.dbg('peek(null)');

  // ---- D · a bigger composed roll (the parse-stress case) -----------------
  await a.dbg(`commandRoll('2d8[Wisdom] + 1d10[Sword] + 1d6[Peer Respect] + 2d6[Sneak] + 1d4[Omen]')`);
  await a.settle();
  await parkMouse();
  await cropShot('#result-banner', '11-banner-bigroll.png');
  const rid2 = await a.rollId();
  await a.dbg(`collectRoll(${JSON.stringify(rid2)})`);
  await a.waitFor(
    `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 2 && window.__diceDebug.whiskingCount === 0)`,
    { desc: 'second shelved' },
  );
  await a.dbg(`peek(${JSON.stringify(rid2)})`);
  await cropShot('#peek-card', '12-peek-bigroll.png');
  await a.dbg('peek(null)');
  await fullShot('13-window-shelf.png');

  // ---- E · the check ceremony (close + reroll hovers) ---------------------
  await a.dbg(`commandRoll('2d8[Wisdom] + 1d10[Sword] check # Steady the Rope | crossing the gorge')`);
  await a.waitFor(
    `(window.__diceDebug.sim(30), ['declare','tumble'].includes((window.__diceDebug.ceremonyState || {}).phase))`,
    { desc: 'ceremony declared' },
  );
  await fullShot('14-check-declare.png');
  await a.waitFor(
    `(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(30), (window.__diceDebug.ceremonyState || {}).phase === 'done')`,
    { desc: 'verdict staged' },
  );
  await parkMouse();
  await fullShot('15-check-verdict-window.png');
  await cropShot('#verdict-card', '16-check-verdict.png');
  await hover('#verdict-fold .pk-strip');
  await cropShot('#verdict-card', '17-check-reroll-hover.png'); // (2i-C: the fold's REROLL strip)
  await hover('#verdict-done');
  await cropShot('#verdict-card', '18-check-done-hover.png');
  await parkMouse();
  await a.dbg('retireCeremony()');
  const rid3 = await a.rollId();
  await a.dbg(`clearRoll(${JSON.stringify(rid3)})`);
  await a.settle();

  // ---- F · the cinematic ceremony -----------------------------------------
  await a.dbg(`commandRoll('1d10[Sword] + 1d6[Strength] cinematic # Leap of Faith | across the chasm')`);
  await a.waitFor(
    `(window.__diceDebug.sim(30), ['declare','tumble'].includes((window.__diceDebug.ceremonyState || {}).phase))`,
    { desc: 'cinematic declared' },
  );
  await fullShot('19-cine-declare.png');
  await a.waitFor(
    `(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(30), (window.__diceDebug.ceremonyState || {}).phase === 'done')`,
    { desc: 'cinematic verdict staged' },
  );
  await parkMouse();
  await cropShot('#verdict-card', '20-cine-verdict.png');
  await hover('#verdict-fold .pk-strip');
  await cropShot('#verdict-card', '21-cine-reroll-hover.png');
  await parkMouse();
}
