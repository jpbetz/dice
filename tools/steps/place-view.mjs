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

// THE VIEW FROM EVERY CHAIR (docs/UX.md §7.63 — per-viewer orientation), in
// ONE TAB, through the demo door (`?demo=1`, js/demo.js). Prints the numbers
// the orientation slice is judged on — each chair's place base, the orbit the
// ladder rested on, the die span in px (the short-edge tax — measured −23% at
// every zoom once the span was read along the camera's right axis; M2's
// 98 → 68 was the world-x segment), the fog floor per chair, the lamp's nudge
// — and saves the frames a human has to look at.
//
//   node tools/drive.mjs tools/steps/place-view.mjs [outDir] [width] [height] [players]
//
// ONE TAB, AND WHAT THAT BOUGHT (v4, 2026-09-01). This used to seat three real
// tabs at three loopback origins with two bytes-only players behind them, and
// three is the harness's ceiling — so the SIX- and EIGHT-place pictures, the
// ones where the centre slots appear and the head tax bites hardest, were
// unreachable except through `simulatePlaceView`, an instrument that borrows
// the eye and hands it back. The demo door's seat switcher is STICKY (it
// writes the dial that `myPlaceRow` derives from, so the eye is set by the
// shipped `placeOrbitSync` on the shipped flush), which means walking the
// chairs in one tab is the same code path a real viewer's own chair takes.
// Default eight chairs; pass a smaller number to re-take the old picture.
//
// WHAT ONE TAB CANNOT SAY, said elsewhere on purpose: that a stamp crosses
// the WIRE and two clients bake one film. That is
// `tools/steps/place-two-rolls.mjs` (two real tabs, deliberately kept) and
// the `place-film-is-one-film` scenario.
//
// MID-FLIGHT IS THE ONE PLACE THE SWITCHER CANNOT GO, and that is the roll
// boundary rule doing its job (IMMERSION ruling ①: cards and orbits do not
// move while dice are in the air). So the in-flight frames are taken through
// `simulatePlaceView`, which is render-only and deferred by nothing, and the
// idle and at-rest frames through the sticky seat.
//
// A gate is a number; whether a table read from the far side still reads as
// THE table — the names the right way up, your own card nearest, the dice
// coming in over the roller's edge — is a picture, and this saves it.

import { mkdirSync } from 'node:fs';

export default async function run(stage,
  [outDir = 'tools/shots/place-view', w = '1600', h = '900', players = '8']) {
  mkdirSync(outDir, { recursive: true });
  const n = Math.max(2, Math.min(8, Number(players) || 8));
  const t = await stage.ctx.demoTab({ origin: '127.0.0.91', players: n });
  await stage.ctx.browser.send('Emulation.setDeviceMetricsOverride',
    { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
  await t.eval('window.dispatchEvent(new Event("resize"))');
  const shot = async (name) => {
    await new Promise((r) => setTimeout(r, 300));
    await stage.shot(t, `${outDir}/${name}.png`);
  };
  // Sit down, and WAIT for the flush rather than for a clock: the seat rides
  // the same roll-boundary defer the cards do, so a fixed sleep would race it.
  const sit = async (k) => {
    await t.dbg(`demoSit(${k})`);
    await t.waitFor(`window.__diceDebug.places().mine === ${k}`, { desc: `seated at ${k}` });
    await t.waitFor('window.__diceDebug.places().built === window.__diceDebug.places().queued',
      { desc: 'cards agree with the roster' });
    await new Promise((r) => setTimeout(r, 150));
  };

  const cast = await t.dbg('demoInfo()');
  console.log(`# ${cast.n} chairs, one tab: ${cast.players.map((p) => `${p.place} ${p.name}`).join(' · ')}`);
  const seats = cast.players.map((p) => p.place);

  const row = async (tag) => {
    const f = await t.dbg('framingInfo()');
    const p = await t.dbg('places()');
    const b = await t.dbg('breathProbe()');
    console.log(`  ${tag} mine ${p.mine} base ${f.placeOrbit} orbit ${f.orbit} reader ${(+p.readerOrbit).toFixed(2)}`
      + ` span ${String(f.spanPx).padStart(3)}px scale ${f.camScale} camY ${f.camY} mode ${f.mode}`
      + ` fits ${f.matFits} floor ${b.matFogFloor.toFixed(2)} fogNear ${b.fogNear.toFixed(2)}`
      + ` lamp [${b.lampAt.map((c) => c.toFixed(2)).join(',')}] motes [${(b.moteLampAt || []).map((c) => c.toFixed(2)).join(',')}]`);
    const own = p.mine === null ? null : await t.dbg(`placardFrame(${p.mine})`);
    if (own) {
      console.log(`        own card face ndc y[${own.ndc.y0.toFixed(3)},${own.ndc.y1.toFixed(3)}]`
        + ` cx ${own.cx.toFixed(3)} in ${own.in}`);
    }
    return f;
  };

  // ---- idle, three zooms — the short-edge tax --------------------------------
  console.log('# idle frames per chair (the head pays the short-edge tax: spanPx 195 -> 150 at medium, -23%)');
  const tax = [];
  for (const z of ['wide', 'medium', 'close']) {
    await t.dbg(`setZoom('${z}')`);
    await t.waitFor(`window.__diceDebug.zoom === '${z}'`, { desc: `zoom ${z}` });
    console.log(`# ${z}`);
    const spans = {};
    for (const k of seats) {
      await sit(k);
      const f = await row(`st${k}`);
      spans[k] = f.spanPx;
      await shot(`01-idle-${z}-st${k}`);
    }
    const longEdge = spans[0];
    const head = spans[4] ?? null;
    tax.push(`${z}: long edge ${longEdge}px`
      + (head === null ? '' : ` -> head ${head}px (${Math.round((head / longEdge - 1) * 100)}%)`)
      + ` | all ${seats.map((k) => `${k}:${spans[k]}`).join(' ')}`);
    const probe = await t.dbg('restFrameProbe()');
    const at1 = (label) => probe.rows.find((r) => r.orbit === label && r.scale === 1);
    console.log(`  restFrameProbe s=1: landscape ${at1('landscape').span}px fits ${at1('landscape').fits}`
      + ` | portrait ${at1('portrait').span}px fits ${at1('portrait').fits}`
      + ` | landscape-back ${at1('landscape-back').span}px fits ${at1('landscape-back').fits}`
      + ` | portrait-left ${at1('portrait-left').span}px fits ${at1('portrait-left').fits}`);
  }
  console.log('# THE SHORT-EDGE TAX, resting frame:');
  for (const line of tax) console.log(`  ${line}`);
  await t.dbg(`setZoom('medium')`);
  await t.waitFor(`window.__diceDebug.zoom === 'medium'`, { desc: 'medium' });

  // ---- one throw from the front, seen from three chairs ----------------------
  // Held clock, so "mid-flight" is a frame and not a race. The chairs are
  // borrowed through simulatePlaceView here and not through the dial: a seat
  // change rides the roll-boundary flush, which is exactly what refuses to
  // move while dice are in the air.
  const watch = seats.filter((k) => [0, 1, 4].includes(k));
  await sit(0);
  await t.dbg('holdClock(true)');
  console.log(`# a 3d6 from station 0, seen from ${watch.join(', ')} (borrowed eyes, mid-film)`);
  await t.dbg(`demoRoll(0, "3d6 # From the front")`);
  await t.waitFor('(window.__diceDebug.sim(1), window.__diceDebug.tableDice.length === 3)',
    { desc: 'the throw is on the felt', timeout: 30000 });
  await t.eval('window.__diceDebug.sim(14)');
  for (const k of watch) {
    await t.dbg(`simulatePlaceView(${k})`);
    await row(`flight-st${k}`);
    await shot(`02-flight-st${k}`);
  }
  await t.dbg('simulatePlaceView(null)');
  await t.eval('window.__diceDebug.sim(16)');
  for (const k of watch) {
    await t.dbg(`simulatePlaceView(${k})`);
    await shot(`03-wash-st${k}`);
  }
  await t.dbg('simulatePlaceView(null)');
  await t.waitFor('(window.__diceDebug.sim(60), !window.__diceDebug.busy)', { desc: 'settled', timeout: 60000 });
  await t.eval('window.__diceDebug.sim(120)');
  await t.dbg('holdClock(false)');

  console.log('# at rest, after a 3d6 from station 0 — the seat is the dial now, not a borrowed eye');
  console.log(`  throwOrigin ${JSON.stringify(await t.dbg('throwOrigin()'))}`);
  for (const k of watch) {
    await sit(k);
    await row(`rest-st${k}`);
    await shot(`04-rest-st${k}`);
  }
  // The film is ONE film here by construction — there is one tab. The
  // cross-client byte-equality of feltPoses is proved where it can be:
  // `place-two-rolls.mjs` and the `place-film-is-one-film` scenario.
  console.log(`  feltPoses ${(await t.dbg('feltPoses()')).length} chars — one tab, one film by construction`);

  // ---- the crowd picture -----------------------------------------------------
  // Every chair throws, and every pool stays: the per-place sweep is what
  // makes this frame possible at all (before it, the last throw would have
  // been the only pool on the felt).
  await t.dbg('clearTable()');
  await t.settle();
  console.log('# every chair throws, and every pool stays (the per-place sweep)');
  await t.dbg('demoRollAll()');
  await t.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
    { desc: 'all the films', timeout: 120000 });
  const felt = await t.dbg('tableDiceInfo()');
  console.log(`  ${felt.length} dice on the felt in ${new Set(felt.map((d) => d.rollId)).size} pools`);
  for (const k of watch) {
    await sit(k);
    await row(`crowd-st${k}`);
    await shot(`05-crowd-st${k}`);
  }
  console.log(`# shots in ${outDir}`);
}
