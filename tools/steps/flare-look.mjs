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

// THE HOLLOW BOLE'S FOOT, BEFORE AND AFTER THE ROUND-10 BAKE — the four frames
// ROADMAP W3 round 10 puts in front of Joe, taken by a step instead of by hand.
//
//   node tools/drive.mjs tools/steps/flare-look.mjs                # the AFTER leg
//   git checkout 48bd128 -- models/towers/hollowbole_moonrise.glb \
//     models/towers/hollowbole_foxfire.glb \
//     && node tools/drive.mjs tools/steps/flare-look.mjs tag=before \
//     && git checkout HEAD -- models/towers/
//
// Writes shots/flare-<tag>-<venue>-resting.png (the room, resting eye) and
// shots/flare-<tag>-<venue>-foot.png (the same frame, the base magnified).
// Default tag is `after`, so the shipped leg needs no argument and the names
// match the ones ROADMAP and docs/TOWER.md already cite.
//
// WHY IT EXISTS AT ALL, given round 10 produced these frames without it. It
// produced them by running `rooted.mjs shots`, keeping `rooted-<venue>-
// shipped.png` and renaming it — twice, with a GLB swap in between, by hand.
// That is a provenance record nobody can re-run, and `tools/verdict-sheet.mjs`
// dates every frame against the steps its own regen command NAMES: a frame
// whose real step is a rename cannot be checked at all. One step, named in the
// command, is the whole fix.
//
// THE BEFORE LEG SWAPS THE MODEL, NOT THE CODE, and that is the point of the
// round: round 10 was forbidden to touch a colour, so `git checkout 48bd128 --
// models/towers/` restores the round-9 baked shells against today's tree and
// nothing but the mesh differs between the two legs. (48bd128 is the recipe
// commit; a2cb09c is the one that baked the new GLBs, so 48bd128's tree still
// carries round 9's assets. `tools/forge/digests.json` deliberately stays at
// HEAD during the swap — nothing at RUNTIME reads it, only
// tests/static-cache.test.mjs does, so do not run `npm test` mid-swap.)
//
// THE FOOT CROP IS DERIVED TWICE OVER, NOT DIALLED IN, and the first draft of
// it was wrong in the way worth writing down. It used the bake's PUBLISHED
// envelope (x -3.07..3.08, z -6.30..0.22) as if those were world coordinates.
// They are the MODEL's, and the socket stands the Hollow Bole at world
// (x -0.04, z -9.59) in this venue — so the crop came out over empty moss a
// dozen units in front of the stump and still looked like a plausible picture
// of a clearing. A tower's own numbers are not the room's.
//
// So the box comes from the SCENE: `groundGaps('towerSkinBoleShell')` reports
// the built mesh's world centre, width and lowest point, and those eight
// corners are pushed through the LIVE camera (`worldToScreen`). The crop then
// follows both the model and the resting eye instead of pinning a rectangle
// that rots the next time either moves. Two offsets it still has to get right,
// both measured rather than assumed: `worldToScreen` returns CANVAS-relative
// pixels and the screenshot includes the left panel, so the panel's real width
// is read off the page (316 at this viewport); and
// `Page.captureScreenshot`'s clip is page CSS pixels, while the PNG it returns
// is clip x deviceScaleFactor x scale — verified against a calibration clip,
// because getting that backwards silently halves or doubles a crop.

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'shots');

// The base band, as multiples of the shell's own footprint width (6.24 in the
// round-10 bake, 6.15 in round 9's — which is why it is a ratio and not a
// constant). HALF sets how much moss stands around the stump; UP is how far
// the crop climbs the trunk, chosen to clear the tallest thing the round-9
// flare put in the air (the sill apron's lens peaked at y 0.72 and the web's
// shoulder ran to ~0.8) with the trunk above it for scale. DOWN dips below the
// mesh's lowest point so the contact line is inside the picture rather than on
// its edge — round 7's whole finding was at that line.
const HALF = 0.62, UP = 0.42, DOWN = 0.04;

export default async function run(stage, args) {
  const tagArg = (args.find((a) => a.startsWith('tag=')) || 'tag=after').slice(4);
  const tag = tagArg || 'after';
  const only = args.find((a) => a === 'moonrise' || a === 'foxfire');
  const venues = only ? [only] : ['moonrise', 'foxfire'];
  mkdirSync(SHOTS, { recursive: true });

  const t = await stage.tab('localhost', 'FlareLook');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');

  // The left panel's real width, from the page. verdict-sheet.mjs measured 316
  // at this viewport on 2026-08-16; reading it means the crop cannot silently
  // slide 316 px sideways the day the rail is re-cut.
  const panel = Number(await t.eval(
    '(document.getElementById("left-panel")?.getBoundingClientRect().width) ?? 0'));
  console.log(`left panel: ${panel} CSS px (crop offset)`);
  let bad = 0;
  if (!(panel > 0)) { console.log('BAD — no #left-panel measured; the foot crop would be offset'); bad++; }

  const frame = async (name) => {
    await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
    await t.eval('window.__diceDebug.tick(0, true, false)');
    return stage.shot(t, join(SHOTS, name));
  };
  const cropShot = async (name, clip, scale) => {
    const { data } = await t.page.browser.send('Page.captureScreenshot',
      { format: 'png', clip: { ...clip, scale } }, t.page.sessionId);
    const { writeFileSync } = await import('node:fs');
    const p = join(SHOTS, name);
    writeFileSync(p, Buffer.from(data, 'base64'));
    return p;
  };

  for (const venue of venues) {
    await t.dbg(`setVenue('${venue}')`);
    await t.waitFor(`window.__diceDebug.venue === '${venue}'`, { desc: `${venue} staged` });
    await t.dbg(`setTower('hollowbole')`);
    await t.waitFor(`window.__diceDebug.tower === 'hollowbole'`, { desc: 'tower up' });
    // The resting eye needs the ease to finish; rooted.mjs uses the same 1500.
    await t.dbg('sim(1500)');

    // THE SHELL IS THERE AT ALL, asserted before anything is photographed —
    // rooted.mjs's lesson: a step that silently found no tower would shoot two
    // pictures of an empty clearing and the pair would read as "no change".
    // The same call is what the crop box is built from, so the assertion and
    // the measurement cannot drift apart.
    const gg = JSON.parse(await t.eval(
      'JSON.stringify(window.__diceDebug.groundGaps("towerSkinBoleShell"))'));
    if (!gg || gg.n !== 1) {
      console.log(`${venue}: BAD — expected exactly 1 towerSkinBoleShell mesh, found ${gg ? gg.n : 0}`);
      bad++;
    }

    console.log(`  ${await frame(`flare-${tag}-${venue}-resting.png`)}`);

    const m = gg && gg.all[0];
    if (!m) { continue; }
    console.log(`  shell: world centre (${m.x}, ${m.z}) minY ${m.minY} width ${m.w}`);
    const box = {
      x0: m.x - m.w * HALF, x1: m.x + m.w * HALF,
      z0: m.z - m.w * HALF, z1: m.z + m.w * HALF,
      y0: m.minY - m.w * DOWN, y1: m.minY + m.w * UP,
    };
    const pts = [];
    for (const x of [box.x0, box.x1]) {
      for (const y of [box.y0, box.y1]) {
        for (const z of [box.z0, box.z1]) {
          pts.push(JSON.parse(await t.eval(
            `JSON.stringify(window.__diceDebug.worldToScreen(${x}, ${y}, ${z}).px)`)));
        }
      }
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const clip = {
      x: Math.max(0, Math.min(...xs) + panel),
      y: Math.max(0, Math.min(...ys)),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    clip.width = Math.min(clip.width, 1500 - clip.x);
    clip.height = Math.min(clip.height, 950 - clip.y);
    // A degenerate clip is a blank PNG that looks like a rendering fault. Say
    // so instead — the whole-room frame above still carries the question.
    if (!(clip.width > 40 && clip.height > 40)) {
      console.log(`${venue}: BAD — foot clip is ${JSON.stringify(clip)}, the eye must have moved`);
      bad++;
    } else {
      console.log(`  clip ${JSON.stringify(clip)} @2x`);
      console.log(`  ${await cropShot(`flare-${tag}-${venue}-foot.png`, clip, 2)}`);
    }
  }

  const errs = t.page.errors.concat(t.page.consoleErrors);
  if (errs.length) { console.log(`PAGE ERRORS: ${errs.join(' | ')}`); bad++; }
  console.log(bad ? `BAD: ${bad} problem(s)` : `flare-look ok (tag=${tag})`);
  if (bad) process.exitCode = 1;
}
