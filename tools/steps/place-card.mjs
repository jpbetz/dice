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

// THE CARD, MEASURED AGAINST A DIE AND AGAINST THE BANNER (v2, docs/UX.md
// §7.63). Joe's complaint was two things at once — "the placards … are smaller
// than the dice" and the own card printing through the result banner — and
// both of them are numbers this step reads off the live page:
//
//   the SIZE   — every card's projected face box in px beside a die's own
//                on-screen box, from both chairs, idle and after a 3d6.
//   the CLASH  — the own card's px box against `#result-banner`'s DOM rect,
//                which is the only comparison that can tell whether two things
//                drawn by two different renderers overlap.
//
//   node tools/drive.mjs tools/steps/place-card.mjs [outDir] [width] [height]
//
// ONE TAB, THROUGH THE DEMO DOOR (v4, 2026-09-01 — `?demo=1`, js/demo.js).
// This used to be two real tabs at two loopback origins joined to one room,
// because "does it read from BOTH chairs" is the question and the old
// `simulatePlaceView` could not answer it while a roll was on the felt: it
// borrows the eye and hands it back, so a frame taken through it is not the
// frame a viewer seated there gets. The demo door's seat switcher is STICKY —
// it writes the dial that `myPlaceRow` derives from, so the eye is set by the
// shipped `placeOrbitSync` on the shipped flush — which is the same code path
// a real second tab takes, at a tenth of the setup. The measurements below are
// unchanged; only the way the two chairs are reached is.
//
// The SEAT CHANGE rides the roll-boundary flush, which means it lands after
// the dice come to rest and never mid-tumble. Every measurement here is taken
// at rest, so that costs nothing; a mid-flight frame from another chair is
// `place-view.mjs`'s job, and it uses `simulatePlaceView` there for exactly
// this reason.
//
// What one tab CANNOT say — that a stamp crosses the wire and two clients bake
// one film — is `place-two-rolls.mjs`'s job, and that step is deliberately
// still two real tabs.

import { mkdirSync } from 'node:fs';

const BANNER = `(() => {
  const el = document.getElementById('result-banner');
  if (!el || el.classList.contains('hidden') || !el.offsetWidth) return null;
  const r = el.getBoundingClientRect();
  return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
})()`;

// The card is a TRAPEZOID on screen, so its axis-aligned box claims screen it
// never paints. Separating-axis test of the printed band's own quad against the
// banner's rect: the axes are the rect's two, plus one normal per quad edge.
export function quadHitsRect(quad, r) {
  if (!quad || !r) return false;
  const rect = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i], b = quad[(i + 1) % quad.length];
    axes.push({ x: -(b.y - a.y), y: b.x - a.x });
  }
  for (const ax of axes) {
    const proj = (pts) => pts.reduce((m, p) => {
      const d = p.x * ax.x + p.y * ax.y;
      return { lo: Math.min(m.lo, d), hi: Math.max(m.hi, d) };
    }, { lo: Infinity, hi: -Infinity });
    const p = proj(quad), q = proj(rect);
    if (p.hi <= q.lo || q.hi <= p.lo) return false;   // a gap on this axis
  }
  return true;
}

const boxOverlap = (a, b) => (a && b
  ? Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
    * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
  : 0);

export default async function run(stage, [outDir = 'tools/shots/place-card', w = '1600', h = '900']) {
  mkdirSync(outDir, { recursive: true });
  const frame = async (t, ww, hh) => {
    await t.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: Number(ww), height: Number(hh), deviceScaleFactor: 1, mobile: false }, t.page.sessionId);
    await t.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));
  };
  const shot = async (t, name) => {
    await new Promise((r) => setTimeout(r, 300));
    await stage.shot(t, `${outDir}/${name}.png`);
  };

  const tab = await stage.ctx.demoTab({ origin: '127.0.0.91', players: 2 });
  await frame(tab, w, h);
  await tab.waitFor('window.__diceDebug.places().stations.length === 2', { desc: 'two at the table' });
  // Sit down, and WAIT for the flush rather than for a clock: the chair rides
  // the same roll-boundary defer the cards do.
  const sit = async (k) => {
    await tab.dbg(`demoSit(${k})`);
    await tab.waitFor(`window.__diceDebug.places().mine === ${k}`, { desc: `seated at ${k}` });
    await tab.waitFor('window.__diceDebug.places().built === window.__diceDebug.places().queued',
      { desc: 'cards agree with the roster' });
    await new Promise((r) => setTimeout(r, 200));
  };
  // The two chairs, as the old two tabs named them. `chairs` is walked in
  // order everywhere below, and `sit` is what makes the walk a real reframe.
  const chairs = [[0, 'front'], [1, 'back']];
  const front = tab;

  const b = await front.dbg('placardBudget()');
  console.log(`# the card: face ${b.face.w} x ${b.face.slope} world (printed ${b.face.printed}), `
    + `ridge ${b.face.ridgeY.toFixed(3)}, atlas ${b.atlasPx}x${b.atlasH} at `
    + `${b.face.pxPerUnit.toFixed(1)}/${b.face.pxPerUnitDown.toFixed(1)} px per world unit, `
    + `font ${b.face.fontMax}->${b.face.fontMin}`);
  console.log(`# budget: draws ${b.draws} tris ${b.tris} materials ${b.materials} textures ${b.textures}`);

  const row = async (t, tag) => {
    const p = await t.dbg('places()');
    const mine = p.mine;
    for (const s of p.stations) {
      const f = await t.dbg(`placardFrame(${s.place})`);
      console.log(`  ${tag} card ${s.place}${s.place === mine ? '*' : ' '} `
        + `px ${Math.round(f.px.x1 - f.px.x0)}x${Math.round(f.px.y1 - f.px.y0)} `
        + `at (${Math.round(f.px.x0)},${Math.round(f.px.y0)}) `
        + `ndc y[${f.ndc.y0.toFixed(3)},${f.ndc.y1.toFixed(3)}] x[${f.ndc.x0.toFixed(3)},${f.ndc.x1.toFixed(3)}] in ${f.in}`);
    }
    const banner = await t.eval(BANNER);
    if (banner) {
      const own = await t.dbg(`placardFrame(${mine})`);
      const box = { x0: own.px.x0, y0: own.px.y0, x1: own.px.x1, y1: own.px.y1 };
      console.log(`  ${tag} banner ${Math.round(banner.x1 - banner.x0)}x${Math.round(banner.y1 - banner.y0)} `
        + `at (${Math.round(banner.x0)},${Math.round(banner.y0)}) — own-card box overlap `
        + `${Math.round(boxOverlap(box, banner))} px² (box gap x ${Math.round(banner.x0 - box.x1)}), `
        + `PANEL HITS: ${own.faces.some((f) => quadHitsRect(f, banner))}`);
      // …and against the WIDEST the banner can ever be (css max-width 520,
      // centred over the felt): a gate that only clears the width this roll's
      // title happened to produce is a gate over nothing.
      const felt = (banner.x0 + banner.x1) / 2;
      const worst = { x0: felt - 260, x1: felt + 260, y0: banner.y0, y1: banner.y1 };
      console.log(`  ${tag} vs a 520px banner: PANEL HITS ${own.faces.some((f) => quadHitsRect(f, worst))}`
        + `  INK HITS ${own.ink.some((f) => quadHitsRect(f, worst))}`
        + `  (live: INK HITS ${own.ink.some((f) => quadHitsRect(f, banner))})`);
      for (const [i, f] of own.faces.entries()) {
        console.log(`  ${tag} own panel ${i} ${f.map((q) => `(${Math.round(q.x)},${Math.round(q.y)})`).join(' ')}`
          + `  ink ${own.ink[i].map((q) => `(${Math.round(q.x)},${Math.round(q.y)})`).join(' ')}`);
      }
    }
    return p;
  };

  // spanPx is px per world unit along the camera's right axis — the repo's own
  // die-size read (framingInfo/zoomProbe/restFrameProbe all take it from
  // spanPxNow). A d6 is 1.35 units on an edge (js/dice.js:40).
  const dieBox = async (t, tag) => {
    const f = await t.dbg('framingInfo()');
    console.log(`  ${tag} spanPx ${f.spanPx} px/unit -> a d6 edge is ${Math.round(f.spanPx * 1.35)} px `
      + `(mode ${f.mode} scale ${f.camScale})`);
    return f.spanPx * 1.35;
  };

  // Every zoom, both chairs, idle — the lane and the standoff have to hold at
  // all three or the layout is tuned to one preset.
  console.log('# the three zooms, idle, from both chairs');
  for (const z of ['wide', 'medium', 'close']) {
    await front.dbg(`setZoom('${z}')`);
    await tab.waitFor(`window.__diceDebug.zoom === '${z}'`, { desc: `zoom ${z}` });
    for (const [k, who] of chairs) { await sit(k); await row(tab, `${z}/${who}`); }
  }
  await front.dbg(`setZoom('wide')`);
  await tab.waitFor(`window.__diceDebug.zoom === 'wide'`, { desc: 'back to wide' });

  for (const [ww, hh, tag] of [[w, h, 'desk'], ['390', '844', 'phone']]) {
    console.log(`# ${tag} ${ww}x${hh} — idle`);
    await frame(tab, ww, hh);
    // The phone folds its panels away — tools/steps/phone-look.mjs's own
    // `mini` setup. Without it the side panel keeps its desktop width at a
    // 390px viewport and the felt is a 76px strip, which is a picture of the
    // harness rather than of the phone.
    await tab.dbg(`setPanelState({pools: ${tag !== 'phone'}, log: ${tag !== 'phone'}})`);
    await new Promise((r) => setTimeout(r, 350));
    for (const [k, who] of chairs) {
      await sit(k);
      await row(tab, `${tag}/${who}`); await dieBox(tab, `${tag}/${who}`); await shot(tab, `${tag}-idle-${who}`);
    }

    // …and the same pair of chairs with a 3d6 from station 0 ON the felt.
    // Thrown through the demo door's own seat, so the throw carries station
    // 0's stamp — its edge, its lane, its region — exactly as the front tab's
    // roll used to when a server stamped it.
    console.log(`# ${tag} ${ww}x${hh} — after a 3d6 from the front`);
    await sit(0);
    await tab.dbg('demoRoll(0, "3d6 # From the front")');
    await tab.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy && window.__diceDebug.tableDice.length === 3)',
      { desc: 'the throw is at rest', timeout: 60000 });
    for (const [k, who] of chairs) {
      await sit(k);
      await row(tab, `${tag}/${who}`); await dieBox(tab, `${tag}/${who}`); await shot(tab, `${tag}-rolled-${who}`);
    }
    await front.dbg('clearTable()');
    await front.settle();
    await tab.dbg('sim(240)');
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`# shots in ${outDir}`);
}
