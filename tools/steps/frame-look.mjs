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

// THE FRAME C27 SHIPPED, LOOKED AT ON THE DEVICE IT WAS SHIPPED FOR.
//
// `verdict-shots.mjs crop` took the frames Joe answered on, and they cover a
// 390px phone and a 1600px desktop — the two ends where the option changes
// least. **The win is the tablet** (iPad portrait: 1d20 2.95x, 3d6 1.67x,
// 6d6 1.34x, `frame-residual.mjs`) and until this step existed there was no
// picture of it at all: the biggest visual change the camera has ever made
// was argued entirely in px.
//
//   node tools/drive.mjs tools/steps/frame-look.mjs                 # 3 widths
//   node tools/drive.mjs tools/steps/frame-look.mjs --views 834
//   node tools/drive.mjs tools/steps/frame-look.mjs --pools 1d20,3d6
//
// Writes shots/f-look-<view>-<pool>-{off,on}.png — `off` is the PRE-C27 frame
// (the counterfactual) and `on` is what ships. Same seeds as
// `frame-residual.mjs` and `verdict-shots.mjs`, so a picture and a number are
// always the same throw; both sides are read off ONE settled world with no
// physics in between, so the only difference between the two files is the eye.
//
// WHAT TO JUDGE IN THEM, since "bigger dice" is already a measured fact and
// needs no eye: does the cropped felt still read as a TABLE — an unbroken
// surface with the dice sitting on it — or does it read as a photograph of
// dice that happens to be brown? And on the seeds that come back
// QUARTER-TURNED (`turned` in the caption line), is the turn legible as the
// same table seen from a different chair, or as a different room?

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

const ALL_VIEWS = [
  // `mini` mirrors what a real client of that width wears — a phone and a
  // tablet run both panels collapsed, a desktop runs them open. Getting this
  // wrong changes the framing, because the rail takes 112px of a 390px window
  // before the camera sees anything (C27).
  { id: 'phone', name: 'phone 390', w: 390, h: 844, mini: true },
  { id: 'ipad', name: 'ipad-p 834', w: 834, h: 1112, mini: true },
  { id: 'desktop', name: 'desktop 1600', w: 1600, h: 1000, mini: false },
];

// The pools where rung 2 actually fires, plus 40d6 as the negative control:
// the frame there must be IDENTICAL in both files, and a reader who cannot see
// that has caught something the numbers say is impossible.
const ALL_POOLS = [
  { id: '1d20', types: ['d20'], seed: 7001 },
  { id: '3d6', types: ['d6', 'd6', 'd6'], seed: 7002 },
  { id: '6d6', types: Array(6).fill('d6'), seed: 7004 },
  { id: '40d6', types: Array(40).fill('d6'), seed: 7007 },
];

function argVal(args, name, dflt) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] !== undefined) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : dflt;
}

export default async function run(stage, args = []) {
  const onlyViews = String(argVal(args, '--views', '')).split(',').filter(Boolean);
  const onlyPools = String(argVal(args, '--pools', '')).split(',').filter(Boolean);
  const views = ALL_VIEWS.filter((v) => !onlyViews.length
    || onlyViews.some((s) => v.name.includes(s) || v.id === s));
  const pools = ALL_POOLS.filter((p) => !onlyPools.length || onlyPools.includes(p.id));
  mkdirSync(SHOTS, { recursive: true });

  const t = await stage.tab('localhost', 'Look');
  const rows = [];
  for (const vp of views) {
    await t.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
    await t.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await t.dbg("setZoom('medium')"); // dice.zoom.v1 is per-origin and outlives a run
    await t.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 300));

    for (const pool of pools) {
      await t.dbg('clearTable()');
      await t.dbg('sim(400)');
      await t.dbg(`throwSeeded(${JSON.stringify(pool.types)}, ${pool.seed})`);
      await t.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${vp.name} ${pool.id}`, timeout: 60000 });
      await t.dbg('sim(600)');

      // Both sides asked for by name. The default is ON now, so reading `off`
      // off the default would photograph the same camera twice.
      await t.dbg('setFraming({preferDice: false, floor: 1})');
      const off = await t.dbg('framingInfo()');
      await t.eval('window.__diceDebug.tick(0, true, false)');
      await stage.shot(t, join(SHOTS, `f-look-${vp.id}-${pool.id}-off.png`));

      await t.dbg('setFraming({preferDice: true, floor: 1})');
      const on = await t.dbg('framingInfo()');
      await t.eval('window.__diceDebug.tick(0, true, false)');
      await stage.shot(t, join(SHOTS, `f-look-${vp.id}-${pool.id}-on.png`));

      rows.push({ view: vp.id, pool: pool.id, off, on });
      console.log(`  ${vp.name} ${pool.id}: ${off.spanPx}px (${off.mode}) → `
        + `${on.spanPx}px (${on.mode}) ×${(on.spanPx / off.spanPx).toFixed(2)}`
        + `; dice ${off.diceOnScreen}/${off.dice} → ${on.diceOnScreen}/${on.dice}`
        + `; mat ${off.matFits ? 'in frame' : 'cropped'} → `
        + `${on.matFits ? 'in frame' : 'cropped'}${on.orbit && !off.orbit ? '; TURNED' : ''}`);
    }
  }

  await t.dbg('clearTable()');
  await t.dbg('setPanelState({pools: true, log: true})');
  await t.dbg('setFraming({preferDice: true, floor: 1})');
  console.log(`\n  shots/f-look-*.png — ${rows.length} pair(s). `
    + '`off` is the pre-C27 frame; `on` is what ships.');
  return rows;
}
