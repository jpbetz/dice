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

// LIFECYCLE AUDIT stills (read-only): roll → ceremony → banner → verdict card
// → peek → log → shelf, for BOTH the roller and a spectator, and across the
// visibility ladder. Ephemeral port only.
//
//   node tools/drive.mjs tools/steps/lifecycle-audit.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

export default async function run(stage) {
  const dir = join(OUT_DIR, 'lifecycle');
  mkdirSync(dir, { recursive: true });
  const A = await stage.tab('localhost', 'Joe');
  const B = await stage.tab('127.0.0.1', 'Kira');

  const mk = (t) => {
    const send = (m, p) => t.page.browser.send(m, p, t.page.sessionId);
    return {
      send,
      async metrics() {
        await send('Emulation.setDeviceMetricsOverride',
          { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
      },
      async full(name) {
        await new Promise((r) => setTimeout(r, 350));
        const { data } = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(dir, name), Buffer.from(data, 'base64'));
        console.log(name);
      },
      async crop(sel, name, pad = 20) {
        await new Promise((r) => setTimeout(r, 250));
        const r = await t.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
          if (!e) return null; const b = e.getBoundingClientRect();
          if (!b.width || !b.height) return null;
          return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
        if (!r) { console.log(`(skip ${name}: no ${sel})`); return false; }
        const { data } = await send('Page.captureScreenshot', {
          format: 'png',
          clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad),
            width: r.w + pad * 2, height: r.h + pad * 2, scale: 2 },
        });
        writeFileSync(join(dir, name), Buffer.from(data, 'base64'));
        console.log(name);
        return true;
      },
      park: () => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1400, y: 120 }),
    };
  };
  const a = mk(A); const b = mk(B);
  await a.metrics(); await b.metrics();
  // no auto-collect stealing the banner mid-shot
  await A.dbg('setAutoCollectMs(0)').catch(() => {});
  await B.dbg('setAutoCollectMs(0)').catch(() => {});

  const facts = {};

  // ---- 1 · plain multi-pool roll, Soul Deal (default) ----------------------
  await A.roll('2d8[Wisdom]+1d10[Sword] # Cross the ford');
  await a.park(); await b.park();
  await a.full('01-roller-window.png');
  await a.crop('#result-banner', '02-banner-roller.png');
  await b.crop('#result-banner', '03-banner-spectator.png');
  facts.bannerRoller = await A.eval(`document.getElementById('result-banner').innerText.replace(/\\s+/g,' ').trim()`);
  facts.bannerSpec = await B.eval(`document.getElementById('result-banner').innerText.replace(/\\s+/g,' ').trim()`);
  facts.bannerActs = await A.eval(`[...document.querySelectorAll('#banner-actions > *')].map(e=>({tag:e.tagName,cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display,op:getComputedStyle(e).opacity}))`);
  facts.bannerActsSpec = await B.eval(`[...document.querySelectorAll('#banner-actions > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display}))`);
  await A.hover('#banner-main');
  await a.crop('#result-banner', '04-banner-body-hover.png');
  await a.park();

  // ---- 2 · collect → peek --------------------------------------------------
  const rid1 = await A.rollId();
  await A.dbg(`collectRoll(${JSON.stringify(rid1)})`);
  await A.waitFor(`(window.__diceDebug.sim(160), window.__diceDebug.shelf.length >= 1 && window.__diceDebug.whiskingCount === 0)`, { desc: 'shelved' }).catch(() => {});
  await B.dbg('sim(1200)');
  await A.dbg(`openPeek && 0`).catch(() => {});
  await A.eval(`(() => { const m = document.querySelector('.shelf-marker'); if (m) m.click(); })()`);
  await A.dbg('sim(200)');
  await a.crop('#peek-card', '05-peek-roller.png');
  facts.peek = await A.eval(`(document.getElementById('peek-card')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim()`);
  facts.peekFold = await A.eval(`[...document.querySelectorAll('#peek-card .pk-fold > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display,op:getComputedStyle(e).opacity}))`);
  // spectator peek: the same collected roll
  await B.eval(`(() => { const m = document.querySelector('.shelf-marker'); if (m) m.click(); })()`);
  await B.dbg('sim(200)');
  await b.crop('#peek-card', '06-peek-spectator.png');
  facts.peekSpec = await B.eval(`(document.getElementById('peek-card')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim()`);
  facts.peekFoldSpec = await B.eval(`[...document.querySelectorAll('#peek-card .pk-fold > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display}))`);
  await A.eval(`document.body.click()`); await B.eval(`document.body.click()`);

  // ---- 3 · a CHECK ceremony -------------------------------------------------
  await A.dbg('holdClock(true)');
  await A.dbg(`commandRoll(${JSON.stringify('1d20+5 check dc15 # The Duel | Charisma')})`);
  await A.dbg('sim(200)');
  await a.full('07-check-declare.png');
  facts.ceremony1 = await A.dbg('ceremonyState');
  await A.dbg('sim(900)');
  await a.full('08-check-tumble.png');
  // mid-beat: the primary should say Skip
  await A.dbg('sim(2600)');
  facts.ceremony2 = await A.dbg('ceremonyState');
  facts.verdictActsMid = await A.eval(`[...document.querySelectorAll('#verdict-fold > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display,op:getComputedStyle(e).opacity}))`);
  await a.crop('#verdict-card', '09-check-verdict.png');
  await A.dbg('holdClock(false)');
  await A.settle();
  await A.dbg('sim(400)');
  facts.verdictActsAfter = await A.eval(`[...document.querySelectorAll('#verdict-fold > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display,op:getComputedStyle(e).opacity}))`);
  await a.crop('#verdict-card', '10-check-verdict-after.png');
  facts.verdictText = await A.eval(`(document.getElementById('verdict-card')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim()`);
  // spectator's view of the same ceremony
  await B.dbg('sim(2000)');
  await b.full('11-check-spectator.png');
  facts.verdictSpec = await B.eval(`(document.getElementById('verdict-card')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim()`);
  facts.verdictActsSpec = await B.eval(`[...document.querySelectorAll('#verdict-fold > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display}))`);

  // ---- 4 · HELD ------------------------------------------------------------
  await A.roll('1d20+3 held dc14 # Listen at the door');
  await a.park(); await b.park();
  await a.crop('#result-banner', '12-held-banner-roller.png');
  await b.crop('#result-banner', '13-held-banner-spectator.png');
  facts.heldRoller = await A.eval(`document.getElementById('result-banner').innerText.replace(/\\s+/g,' ').trim()`);
  facts.heldSpec = await B.eval(`document.getElementById('result-banner').innerText.replace(/\\s+/g,' ').trim()`);
  facts.heldActs = await A.eval(`[...document.querySelectorAll('#banner-actions > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display}))`);
  facts.heldActsSpec = await B.eval(`[...document.querySelectorAll('#banner-actions > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display}))`);
  facts.heldEntryA = await A.entryState();
  facts.heldEntryB = await B.entryState();
  const heldId = await A.rollId();
  await A.dbg(`reveal(${JSON.stringify(heldId)})`);
  await A.dbg('sim(1600)'); await B.dbg('sim(1600)');
  await a.crop('#result-banner', '14-held-revealed.png');
  facts.heldRevealed = await A.eval(`document.getElementById('result-banner').innerText.replace(/\\s+/g,' ').trim()`);

  // ---- 5 · WHISPER, seen by a bystander -------------------------------------
  const C = await stage.tab('127.0.0.2', 'Nyx');
  const c = mk(C); await c.metrics();
  await C.dbg('setAutoCollectMs(0)').catch(() => {});
  await A.roll('2d6 w:Kira # A word in your ear');
  await A.dbg('sim(600)'); await B.dbg('sim(600)'); await C.dbg('sim(600)');
  await c.park();
  await c.crop('#result-banner', '15-whisper-bystander.png');
  await b.crop('#result-banner', '16-whisper-audience.png');
  facts.whisperBystander = await C.eval(`document.getElementById('result-banner').innerText.replace(/\\s+/g,' ').trim()`);
  facts.whisperAudience = await B.eval(`document.getElementById('result-banner').innerText.replace(/\\s+/g,' ').trim()`);
  facts.whisperChooser = await A.eval(`document.getElementById('result-banner').innerText.replace(/\\s+/g,' ').trim()`);
  facts.whisperActsBystander = await C.eval(`[...document.querySelectorAll('#banner-actions > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display}))`);
  facts.whisperActsAudience = await B.eval(`[...document.querySelectorAll('#banner-actions > *')].map(e=>({cls:e.className,txt:e.innerText.trim(),disp:getComputedStyle(e).display}))`);

  // ---- 6 · the log ----------------------------------------------------------
  await A.eval(`document.getElementById('rail-log').click()`);
  await a.crop('#log-flyout', '17-log.png');
  facts.log = await A.eval(`document.getElementById('log-list').innerText.replace(/\\n+/g,' | ').replace(/[ \\t]+/g,' ').trim()`);
  await C.eval(`document.getElementById('rail-log').click()`);
  await c.crop('#log-flyout', '18-log-bystander.png');
  facts.logBystander = await C.eval(`document.getElementById('log-list').innerText.replace(/\\n+/g,' | ').replace(/[ \\t]+/g,' ').trim()`);
  await A.eval(`document.getElementById('rail-log').click()`);

  // ---- 7 · the shelf, full --------------------------------------------------
  await A.roll('1d6');
  await A.roll('1d8');
  await A.dbg('sim(1400)');
  await a.park();
  await a.full('19-shelf.png');
  facts.shelf = await A.shelf();
  facts.markers = await A.dbg('shelfMarkers');

  // ---- 8 · dnd system, for the sum read -------------------------------------
  await A.dbg(`setSystem('dnd')`);
  await A.roll('1d20+5 dc15 # Perception');
  await a.park();
  await a.crop('#result-banner', '20-banner-dnd.png');
  facts.bannerDnd = await A.eval(`document.getElementById('result-banner').innerText.replace(/\\s+/g,' ').trim()`);
  await A.dbg(`setSystem('soul-deal')`);

  // ---- 9 · the compact / collapsed view -------------------------------------
  await A.dbg('setPanelState({pools:false})').catch(() => {});
  await A.roll('2d8[Wisdom]');
  await a.park();
  await a.full('21-compact-banner.png');

  writeFileSync(join(dir, 'facts.json'), JSON.stringify(facts, null, 2));
  console.log('facts.json');
}
