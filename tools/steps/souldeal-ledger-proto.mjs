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

// LEDGER PROTOTYPE stills (2026-08-04 audit follow-up): the per-die reveal
// read re-cut as a two-column ledger — label spine right-aligned, dice
// cells left-aligned, hanging indent on wrap — via RUNTIME CSS INJECTION
// only. Nothing in the repo changes; this exists to put a before/after
// pair in front of Joe. CSS-table display gives the two columns without
// touching renderOutcomeRows' DOM (the label span becomes a cell; the
// chips share the row's one anonymous cell).
//
//   node tools/drive.mjs tools/steps/souldeal-ledger-proto.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

// The candidate, kept honest: every rule here is a plausible style.css diff.
const LEDGER_CSS = `
/* --- audit prototype: the per-die LEDGER ------------------------------- */
/* (1) chip fusion fix: flex eats the whitespace box between evidence and
   word — carry the gap in layout, never in the string (the nbsp lesson) */
.oc-chip { gap: 5px; }
/* (2) the ledger: two columns, one label spine, hanging indent for free */
.result-outcomes, .pk-tally.pk-outcomes, .verdict-hero.verdict-outcomes {
  display: table; border-spacing: 0 5px; margin-inline: auto;
}
.outcome-row { display: table-row; }
.outcome-row .tally-src {
  display: table-cell; text-align: right; padding-right: 11px;
  white-space: nowrap; vertical-align: middle;
}
/* (3) quiet is a value: an explicit muted dash in the answer slot
   (prototype-only ::after; the real fix puts it in the DOM for copy) */
.oc-quiet::after { content: '\\2014'; color: var(--muted); opacity: 0.8; }
/* (4) the verdict card stops shouting: chips keep their own case */
.verdict-hero.verdict-outcomes { text-transform: none; letter-spacing: 0; }
/* (5) tier rides the chip border, matching the felt chips' lesson */
.oc-chip:has(.tier-success), .oc-chip:has(.tier-crit-success) { border-color: rgba(255, 214, 102, 0.45); }
.oc-chip:has(.tier-success-soft) { border-color: rgba(255, 214, 102, 0.22); }
.oc-chip:has(.tier-fail), .oc-chip:has(.tier-crit-fail) { border-color: rgba(226, 73, 59, 0.5); }
/* (6) the header demoted to a caption: identity, not a second data row */
#result-label, .pk-head {
  text-transform: none; letter-spacing: 0.02em; font-size: 12px; opacity: 0.85;
}
/* (7) the Soul Deal verdict card gives the hero slot to the ledger:
   no number, no ring — the rows ARE the verdict */
#ceremony-layer .ring-wrap:has(#verdict-total:empty) { display: none; }
`;

export default async function run(stage) {
  const dir = join(OUT_DIR, 'souldeal-audit');
  mkdirSync(dir, { recursive: true });
  const a = await stage.tab('localhost', 'Joe');
  const send = (m, p) => a.page.browser.send(m, p, a.page.sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const beat = (ms = 400) => new Promise((r) => setTimeout(r, ms));
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
    const p = join(dir, name);
    writeFileSync(p, Buffer.from(data, 'base64'));
    console.log(p);
  };

  // Inject the candidate (before any surface renders its shots).
  await a.eval(`(() => {
    const s = document.createElement('style');
    s.id = 'ledger-proto';
    s.textContent = ${JSON.stringify(LEDGER_CSS)};
    document.head.appendChild(s);
    return true;
  })()`);

  // Same seat as the audit run: advanced rack, three pools staged.
  await a.dbg('setPanelState({pools: true})');
  const pools = await a.dbg('groups');
  const byName = (n) => pools.find((g) => g.name === n);
  await a.dbg(`editPool(${byName('Wisdom').id}, {notation: '2d8'})`);
  await a.dbg(`editPool(${byName('Sword').id}, {notation: '1d10'})`);

  // The 3-pool banner (after-pair for 05-banner.png).
  await a.dbg(`commandRoll('2d8[Wisdom] + 1d10[Sword] + 1d6[Peer Respect]')`);
  await a.settle();
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1600, y: 200 });
  await cropShot('#result-banner', 'A05-banner-ledger.png');

  // The 5-pool stress roll (after-pair for 11-banner-bigroll.png), then its
  // peek (after-pair for 12-peek-bigroll.png).
  await a.dbg(`commandRoll('2d8[Wisdom] + 1d10[Sword] + 1d6[Peer Respect] + 2d6[Sneak] + 1d4[Omen]')`);
  await a.settle();
  await cropShot('#result-banner', 'A11-banner-bigroll-ledger.png');
  const rid = await a.rollId();
  await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
  await a.waitFor(
    `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length >= 1 && window.__diceDebug.whiskingCount === 0)`,
    { desc: 'shelved' },
  );
  await a.dbg(`peek(${JSON.stringify(rid)})`);
  await cropShot('#peek-card', 'A12-peek-bigroll-ledger.png');
  await a.dbg('peek(null)');

  // The check verdict (after-pair for 16-check-verdict.png): ring folded,
  // ledger as the card's centre.
  await a.dbg(`commandRoll('2d8[Wisdom] + 1d10[Sword] check # Steady the Rope | crossing the gorge')`);
  await a.waitFor(
    `(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(30), (window.__diceDebug.ceremonyState || {}).phase === 'done')`,
    { desc: 'verdict staged' },
  );
  await beat();
  await cropShot('#verdict-card', 'A16-check-verdict-ledger.png');
}
