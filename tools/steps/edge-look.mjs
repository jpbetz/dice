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

// THE STANDARD EDGE, IN THE ROOM (ROADMAP §9c). Joe chose `round .090` on the
// lab bench — a die floating on a grey field at hero distance under three
// canned environments. The thing that ships is dice on FELT, under the table's
// own lights, at the zoom a player actually sits at, with the app's post stack
// running. Those are different pictures and only one of them is the product.
//
//   node tools/drive.mjs tools/steps/edge-look.mjs [prefix] [seed]
//
// Frames land in tools/out/ as <prefix>-<cell>.png (whole frame) and
// <prefix>-<cell>-crop.png (a 4× magnification centred on the die nearest the
// mat's middle — the edge is ~2 px of a 1600 px frame at `medium`, so the whole
// frame proves the dice are where they claim to be and the crop is the only one
// that can be judged).
//
// Run it twice around a change with different prefixes and compare WITHIN a
// cell only: same seed, same zoom, same pool, one variable. The seed makes the
// pair the same throw — §9c is render-only, so a moved die would itself be the
// finding.

const CELLS = [
  // close/hero: the edge at its most legible, on the four types whose
  // silhouettes differ most.
  { id: 'hero', zoom: 'close', types: ['d20', 'd6', 'd12', 'd8'] },
  // medium/trio: the canonical Soul Deal roll at the shipped default zoom —
  // what a player sees on a normal evening, and the frame that decides whether
  // a softer edge costs any legibility.
  { id: 'trio', zoom: 'medium', types: ['d8', 'd6', 'd10'] },
  // wide/forty: the pool cap. A round edge catches a highlight all the way
  // round a die; forty of them is where that could turn into glitter.
  { id: 'forty', zoom: 'wide', types: Array(40).fill('d6') },
];

async function crop(table, path, box, scale = 4) {
  const { writeFileSync } = await import('node:fs');
  const { data } = await table.page.browser.send('Page.captureScreenshot',
    { format: 'png', clip: { ...box, scale } }, table.page.sessionId);
  writeFileSync(path, Buffer.from(data, 'base64'));
  return path;
}

// The settled die nearest the mat's centre, as a screen-space box. Nearest the
// CENTRE and not the camera: a die at the frame's edge is the one the lens
// distorts most, which is the worst place to judge a silhouette.
const centreDieBox = (table) => table.eval(`JSON.stringify((() => {
  const d = window.__diceDebug;
  if (!d.tableDice.length) return null;
  let best = null;
  for (const o of d.tableDice) {
    const p = o.body.position;
    const r = p.x * p.x + p.z * p.z;
    if (!best || r < best.r) best = { r, o };
  }
  const p = best.o.body.position;
  const s = d.worldToScreen(p.x, p.y, p.z);
  if (!s.in) return null;
  // Clamped to the viewport: an unclamped box off the left edge crops the
  // side panel into the picture and Chrome scales the rest down to fit.
  const span = Math.max(48, d.framingCost().today.span * 1.5);
  const x = Math.min(Math.max(0, s.px.x - span), innerWidth - span * 2);
  const y = Math.min(Math.max(0, s.px.y - span), innerHeight - span * 2);
  return { type: best.o.type, x: Math.max(0, x), y: Math.max(0, y),
           width: span * 2, height: span * 2 };
})())`).then((s) => JSON.parse(s));

export default async function edgeLook(stage, args) {
  const prefix = args[0] || 'edge';
  const seed = Number(args[1] || 1000);
  const a = await stage.tab('localhost', 'Looker');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.eval('window.dispatchEvent(new Event("resize"))');
  await a.settle();

  // Say what is being photographed, in the frame's own log, so a pair of runs
  // can never be mislabelled: the recipe comes from the app, not from this file.
  const geo = await a.dbg(`dieGeoStats('std', ['d6'])`);
  console.log(`photographing the STANDARD edge ${JSON.stringify(geo.d6.geo)}`
    + `  (d6: ${geo.d6.verts} verts, r=${geo.d6.r})\n`);

  for (const cell of CELLS) {
    await a.dbg(`setZoom('${cell.zoom}')`);
    await a.dbg('sim(200)');
    await a.dbg(`throwSeeded(${JSON.stringify(cell.types)}, ${seed})`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc: `${cell.id} settles`, timeout: 90000 });
    // A REAL rAF FRAME HAS TO LAND BEFORE THE SHUTTER. settle() drives the dt
    // clock through sim(), which renders nothing — screenshotting straight
    // after it photographs whatever was last drawn, which on a 40-die felt at
    // ~2 fps is a frame from the middle of the throw.
    await new Promise((r) => setTimeout(r, 1200));
    // No `chips()` read here on purpose: per-die value chips are OFF by
    // default (§7.9's *Just you* scope), so an empty list is the shipped
    // table behaving, and printing it invites somebody to read a correct
    // frame as a broken one. The banner in the frame carries the values.
    console.log(`${cell.id.padEnd(6)} ${cell.zoom.padEnd(6)} ${cell.types.length} dice`
      + `  span=${(await a.dbg('framingCost()')).today.span}px`
      + `  onFelt=${await a.diceCount()}`);
    console.log('  ' + await stage.shot(a, `${prefix}-${cell.id}.png`));
    const box = await centreDieBox(a);
    if (box) console.log(`  ${await crop(a, stage.out(`${prefix}-${cell.id}-crop.png`), box)}`
      + `   (${box.type}, 4×)`);
    else console.log('  no die inside the frustum to crop — look at the whole frame');
    await a.dbg('clearTable()');
    await a.dbg('sim(120)');
  }

  console.log('\nJudge: (1) does the edge read as SOFT rather than as a wide flat chamfer'
    + ' — *-hero-crop.png;\n  (2) do the digits still read at the shipped default zoom'
    + ' — *-trio.png;\n  (3) does forty of it glitter — *-forty.png.');
}
