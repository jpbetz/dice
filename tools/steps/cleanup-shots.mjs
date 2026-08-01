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

// The 2026-08-01 cleanup states: Soul Deal default rack (no tile ±), the
// draft at rest (standing quiet ROLL cue, ghosted Save/Clear), the draft
// under hover (cue loud, verbs up), and the shelf cluster's quick ✕.
//
//   node tools/drive.mjs tools/steps/cleanup-shots.mjs

import { join } from 'node:path';
import { OUT_DIR } from '../stage.mjs';

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Alice');
  const send = (m, p) => a.page.browser.send(m, p, a.page.sessionId);
  const hover = async (sel) => {
    const p = await a.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null; const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (p) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    return !!p;
  };
  const beat = (ms = 350) => new Promise((r) => setTimeout(r, ms));

  // 1) the default Soul Deal rack, at rest (fresh profile = seed rack)
  await a.dbg('sim(30)');
  console.log(await stage.shot(a, join(OUT_DIR, 'clean-rack.png')));

  // 2) stage attribute+skill+motivation by digits; draft at REST
  for (const k of ['1', '1', '2']) {
    await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: ${JSON.stringify(k)}}))`);
  }
  await a.eval(`[...document.querySelectorAll('#groups-list .tile-stage')]
    .find((t) => t.textContent.includes('Sword')).click()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1000, y: 600 });
  await beat();
  console.log(await stage.shot(a, join(OUT_DIR, 'clean-draft-rest.png')));

  // 3) hover the cluster: the promise turns loud, the ghost verbs surface
  await hover('#tray-roll');
  await beat();
  console.log(await stage.shot(a, join(OUT_DIR, 'clean-draft-hover.png')));

  // 4) roll, let auto-collect tidy it, hover the cluster: the quick ✕
  await a.dbg('setAutoCollectMs(400)');
  await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))`);
  await a.settle();
  await a.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
    { desc: 'auto-collected' });
  await a.dbg('sim(30)');
  await hover('.shelf-marker');
  await beat();
  console.log(await stage.shot(a, join(OUT_DIR, 'clean-shelf-x.png')));
}
