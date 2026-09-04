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

// THE THREE DRESSES, SIDE BY SIDE (docs/UX.md §7.64; `cards.style`).
//
//   node tools/drive.mjs tools/steps/placard-styles.mjs [outDir] [width] [height] [N]
//
// Joe's ask, 2026-09-04: "try generating a few different placards … one that
// is not even a physical placard, just text on the mat surface. Very subtle.
// Far less distracting." Distraction is not a number this repo has, so this
// step reports the three that stand in for it and then takes the picture that
// decides — GOALPOST 8, in that order:
//
//   the SILHOUETTE — the share of the frame the eight cards' own bands paint,
//     summed over stations. The tent is the loudest thing on this table and
//     that is a measurable claim, not a feeling.
//   the READ — the name's own px height on screen, per station, near and far.
//     A style is only quieter if it is still readable; a name at 6 px is not
//     subtle, it is gone. The tent is the control here too.
//   the COST — draws and triangles off `placardBudget()`, which under the
//     inlay should show the opaque rig gone entirely.
//
// …and then the same frame under each dress, at one zoom and one size, so the
// three can be flipped through as three files rather than argued about.
//
// THE LAW IT PINS while it looks: every style is measured at the SAME anchors.
// `places()` stations are read once per style and compared — if a dress ever
// moves the ring, the comparison stops meaning anything and this step says so
// before it prints a single px.

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// The ink band's screen height in px: the name's own quad, longest edge, which
// is the number a reader would call "how big is that name".
const inkPx = (f) => {
  if (!f || !f.ink || !f.ink.length) return 0;
  let h = 0;
  for (const q of f.ink) {
    // the quad's two "down the band" edges — corners are TL,BL,BR,TR
    h = Math.max(h, Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y),
      Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y));
  }
  return h;
};

// The polygon area of every band this station paints, in px² — the shoelace,
// because the bands are trapezoids on screen and their boxes are not.
const bandPx2 = (f) => {
  if (!f || !f.faces) return 0;
  let a = 0;
  for (const q of f.faces) {
    let s = 0;
    for (let i = 0; i < q.length; i++) {
      const p = q[i], n = q[(i + 1) % q.length];
      s += p.x * n.y - n.x * p.y;
    }
    a += Math.abs(s) / 2;
  }
  return a;
};

const anchorKey = (p) => p.stations
  .map((s) => `${s.place}:${s.theta.toFixed(6)}`).join('|');

export default async function run(stage, [outDir = 'tools/shots/placard-styles', w = '1600', h = '900', nArg = '4']) {
  // ABSOLUTE, so the shots land where the caller asked and not under
  // tools/out/<the relative path> — `stage.shot` joins OUT_DIR for anything
  // that does not start with a slash.
  outDir = resolve(outDir);
  mkdirSync(outDir, { recursive: true });
  const N = Math.max(2, Math.min(8, Number(nArg) || 4));
  const tab = await stage.ctx.devTab({ origin: '127.0.0.93', players: Math.max(0, N - 1) });
  await tab.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false }, tab.page.sessionId);
  await tab.eval('window.dispatchEvent(new Event("resize"))');
  await new Promise((r) => setTimeout(r, 300));
  await tab.waitFor(`window.__diceDebug.places().stations.length === ${N}`, { desc: `${N} at the table` });
  // THE CHROME IS FOLDED AWAY. The first run of this step took its shots with
  // the side panel and the dev panel both open: 950 px of the 1600 was UI and
  // the table was a strip between them, which is a picture of the harness and
  // not of the thing being judged. `place-card.mjs`'s own `mini` setup, plus
  // the door folded — the dials keep working folded, which is the whole point
  // of the fold.
  await tab.dbg('setPanelState({pools: false, log: false})');
  await tab.dbg('devFold(true)');
  await tab.eval('window.dispatchEvent(new Event("resize"))');
  await new Promise((r) => setTimeout(r, 400));

  const settled = async () => {
    await tab.waitFor('window.__diceDebug.places().built === window.__diceDebug.places().queued',
      { desc: 'the cards agree with the roster' });
    await new Promise((r) => setTimeout(r, 250));
  };
  const wear = async (patch, tag) => {
    const reply = await tab.dbg(`tuneSet(${JSON.stringify(patch)})`);
    if (reply && reply.refused && reply.refused.length) {
      console.log(`  !! ${tag}: refused ${JSON.stringify(reply.refused)}`);
    }
    await settled();
    const d = await tab.dbg('placardDress()');
    if (!d.worn || d.worn.style !== patch['cards.style']) {
      console.log(`  !! ${tag}: asked ${patch['cards.style']}, WEARING ${d.worn && d.worn.style}`);
    }
    return d;
  };

  let ring = null;
  const look = async (tag, patch, shotName) => {
    await wear(patch, tag);
    const p = await tab.dbg('places()');
    const key = anchorKey(p);
    if (ring === null) ring = key;
    else if (key !== ring) console.log(`  !! ${tag}: THE RING MOVED — a style may not touch the anchors`);
    const b = await tab.dbg('placardBudget()');
    let area = 0;
    const reads = [];
    for (const s of p.stations) {
      const f = await tab.dbg(`placardFrame(${s.place})`);
      if (!f) continue;
      area += bandPx2(f);
      reads.push({ place: s.place, mine: f.mine, px: inkPx(f), in: f.in });
    }
    const frame = Number(w) * Number(h);
    const near = reads.find((r) => r.mine);
    const others = reads.filter((r) => !r.mine).map((r) => r.px).sort((x, y) => x - y);
    console.log(`  ${tag}: draws ${b.draws} tris ${b.tris} materials ${b.materials}`
      + `  band ${Math.round(area)} px² (${(100 * area / frame).toFixed(2)}% of frame)`
      + `  name px own ${near ? near.px.toFixed(0) : '—'}`
      + ` others ${others.length ? `${others[0].toFixed(0)}..${others[others.length - 1].toFixed(0)}` : '—'}`
      + `  all in frame ${reads.every((r) => r.in)}`);
    if (b.band) {
      console.log(`    band ${b.band.w.toFixed(2)} x ${b.band.d.toFixed(2)} world at `
        + `${b.band.pxPerUnit.toFixed(1)}/${b.band.pxPerUnitDown.toFixed(1)} px per world unit `
        + `(the retired floor atlas gave 12.8), inset ${b.band.inset}, y ${b.band.y.toFixed(3)}`);
    }
    if (shotName) {
      await new Promise((r) => setTimeout(r, 300));
      await stage.shot(tab, `${outDir}/${shotName}.png`);
    }
    return { area, reads };
  };

  const DRESSES = [
    ['tent   ', { 'cards.style': 'tent' }, 'tent'],
    ['plate  ', { 'cards.style': 'plate' }, 'plate'],
    ['inlay  ', { 'cards.style': 'inlay', 'cards.ink.tone': 'ink' }, 'inlay-sepia'],
    ['chalk  ', { 'cards.style': 'inlay', 'cards.ink.tone': 'chalk' }, 'inlay-chalk'],
    ['faint  ', { 'cards.style': 'inlay', 'cards.ink.tone': 'chalk', 'cards.ink.rest': 0.28 }, 'inlay-faint'],
  ];

  for (const z of ['wide', 'medium']) {
    await tab.dbg(`setZoom('${z}')`);
    await tab.waitFor(`window.__diceDebug.zoom === '${z}'`, { desc: `zoom ${z}` });
    console.log(`# N=${N} ${w}x${h} ${z} — idle, from seat 0`);
    for (const [tag, patch, name] of DRESSES) await look(tag, patch, `n${N}-${z}-${name}`);
    await tab.dbg(`tuneSet({"cards.ink.rest":0.55})`);
  }

  // …and the same table with dice on it, because a name is judged beside the
  // thing it is competing with. Medium, a 3d6 from another chair, so the wash
  // is somebody else's and the own card is idle.
  await tab.dbg(`setZoom('medium')`);
  await tab.waitFor(`window.__diceDebug.zoom === 'medium'`, { desc: 'zoom medium' });
  console.log(`# N=${N} ${w}x${h} medium — with a 3d6 standing from seat 1`);
  for (const [tag, patch, name] of DRESSES) {
    await wear(patch, tag);
    await tab.dbg('demoRoll(1, "3d6 # From seat 1")');
    await tab.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy && window.__diceDebug.tableDice.length === 3)',
      { desc: 'the throw is at rest', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 300));
    await stage.shot(tab, `${outDir}/n${N}-rolled-${name}.png`);
    console.log(`  ${tag}: shot with dice standing`);
    await tab.dbg('clearTable()');
    await tab.settle();
    await tab.dbg('sim(240)');
    await new Promise((r) => setTimeout(r, 300));
  }
  await tab.dbg(`tuneSet({"cards.ink.rest":0.55})`);

  // THE GHOST, IN FLIGHT. Its whole claim is that the name is loudest exactly
  // while the dice are in the air, so it is the one dress that cannot be shot
  // at rest: the frames below are taken DURING the film, at the arc's own
  // quarter, half and end, with the alpha read off the buffer beside each.
  console.log(`# N=${N} the ghost, mid-film — alpha off the ink buffer`);
  await wear({ 'cards.style': 'inlay', 'cards.ink.mode': 'ghost', 'cards.ink.rest': 0.12 }, 'ghost  ');
  await tab.dbg('demoRoll(1, "3d6 # From seat 1")');
  for (const [i, steps] of [12, 12, 12, 12, 12].entries()) {
    await tab.dbg(`sim(${steps})`);
    await new Promise((r) => setTimeout(r, 120));
    const d = await tab.dbg('placardDress()');
    const wsh = await tab.dbg('washInfo()');
    console.log(`  ghost   t${i}: ink alpha max ${d.alpha.toFixed(3)} at station ${d.lit} (rest ${d.rest})  `
      + `all [${d.alphas.slice(0, 4).join(' ')}]  wash ${wsh.opacity} at station ${wsh.station}`);
    await stage.shot(tab, `${outDir}/n${N}-ghost-t${i}.png`);
  }
  await tab.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)', { desc: 'the film ends', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 300));
  const rest = await tab.dbg('placardDress()');
  console.log(`  ghost   at rest: ink alpha ${rest.alpha.toFixed(3)} — back to ${rest.rest} `
    + `(all [${rest.alphas.slice(0, 4).join(' ')}])`);
  await stage.shot(tab, `${outDir}/n${N}-ghost-rest.png`);

  await tab.dbg('tuneReset("cards")');
  console.log(`# shots in ${outDir}`);
}
