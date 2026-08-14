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

// LOOK AT A BAKE IN THE ROOM IT WILL STAND IN — before it is registered,
// promoted, or committed.
//
//   node tools/drive.mjs tools/steps/tower-try.mjs tools/forge/out/<slug>.glb
//   node tools/drive.mjs tools/steps/tower-try.mjs nullstone      # a shipped id
//
// Writes ONE sheet, tools/out/try-<slug>.png, plus the fit and occlusion
// verdicts for the same model in the same run.
//
// WHY IT EXISTS, measured on the nullstone build (2026-08-13). That tower's
// look loop cost more than everything else in the job put together, and two
// avoidable things made it so:
//
//   · IT WAS JUDGED IN THE FORGE PREVIEW, whose lighting rig is not this
//     room's. Four rounds of value decisions were taken there and every one
//     had to be retaken the moment an app frame existed: at an albedo that
//     looked like "black stone" under the preview's lamps, the model rendered
//     in the grounded room as a cut-out with no facets, no fissures and an
//     ember lighting nothing. The preview answers "did it bake"; only the
//     room answers "is it a tower".
//   · IT WAS READ ONE PNG AT A TIME. "This reads as a wastebasket" is a
//     judgement about the whole object, and it waited a full rewrite to
//     arrive because no single frame carried it.
//
// So the model does not have to be a registry row to be looked at: any GLB
// under the repo is served by the stage's own server, and `towerRegisterGlb`
// mints a throwaway row for it. Bake, look, rewrite — with nothing committed
// and no promotion in between.

import { basename, extname } from 'node:path';

const VIEWS = [
  // label,        dist, height, xoff — towerEye's own arguments. Distances are
  // set so the WHOLE model is in every tile: a cropped crown is a tile that
  // cannot answer the question it is labelled with.
  ['front', 18, 7.0, 0.6],
  ['three-quarter', 17, 8.0, 9],
  ['low — a seated player', 16, 3.2, 5],
  ['crown', 14, 14, 4],
  ['doorway', 11, 4.0, 1.5],
  ['far — is it a silhouette?', 24, 9.5, 8],
];

export default async function run(stage, [target = '', seed = '42']) {
  if (!target) {
    console.log('BAD: needs a GLB path (tools/forge/out/x.glb) or a registered tower id');
    process.exitCode = 1;
    return;
  }
  const isPath = target.includes('/') || extname(target) === '.glb';
  const slug = isPath ? basename(target, '.glb') : target;
  const t = await stage.tab('localhost', 'TowerTry');
  await t.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 950, deviceScaleFactor: 2, mobile: false }, t.page.sessionId);
  await t.dbg('holdClock(true)');
  await t.dbg('towerEcho(false)');

  // A RAW BAKE IS A THROWAWAY ROW. The stage's server serves the whole repo,
  // so `tools/forge/out/x.glb` is reachable from the page exactly as a
  // promoted model is — which is the point: nothing is copied into
  // models/towers/ to be looked at, so a rejected round leaves no trace.
  if (isPath) {
    const url = `/${target.replace(/^\.?\//, '')}`;
    const ok = await t.dbg(`towerRegisterGlb('${slug}', ${JSON.stringify(url)}, `
      + `{ label: ${JSON.stringify(slug)}, title: 'tower-try' })`);
    if (!ok) {
      console.log(`BAD: towerRegisterGlb refused '${slug}' → ${url}`);
      process.exitCode = 1;
      return;
    }
    console.log(`registered ${slug} → ${url} (throwaway row, never a picker chip)`);
  }

  await t.dbg(`setZoom('medium')`);
  // SOCKETED, NOT BENCHED, and that is the whole point of the step. The lab
  // bench is a different rig with a different skin and its own volumes;
  // towerModelAudit and towerOcclusionCheck both answer about the SOCKET, and
  // a sheet shot off the bench would be a picture of a thing no player sees.
  // Ask, then poll to ready, then PROVE it — the mislabelled-sheet trap
  // tower-shots' header records: a stage still wearing the previous model
  // produces a complete, plausible review of the wrong tower.
  await t.dbg(`setTower(${JSON.stringify(slug)})`);
  let st = await t.dbg(`towerModelStatus(${JSON.stringify(slug)})`);
  for (let i = 0; (!st || !st.ready) && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    st = await t.dbg(`towerModelStatus(${JSON.stringify(slug)})`);
  }
  await t.dbg(`setTower(${JSON.stringify(slug)})`);
  const worn = await t.dbg('tower');
  if (worn !== slug) {
    console.log(`BAD: asked for '${slug}', the table wears '${worn}' (${JSON.stringify(st)})`);
    process.exitCode = 1;
    return;
  }

  // THE GATES COME WITH THE SHEET. Judging a frame while its fit or occlusion
  // is red is how a pretty tower gets three more rounds spent on it before
  // anyone runs the audit — so both verdicts are printed above the picture.
  const fit = await t.dbg('towerModelAudit()');
  if (!fit) {
    console.log('fit: null — nothing is socketed, so there is nothing to shoot');
    process.exitCode = 1;
    return;
  }
  const unclassified = (fit.outs || []).filter((o) => /UNCLASSIFIED/.test(o.cls));
  console.log(`fit: ${fit.meshes} meshes, ${fit.lights} lights, `
    + `${fit.offPolicy ? `${fit.offPolicy.length} off-policy material(s), ` : ''}`
    + `${(fit.outs || []).length} overrun(s) [`
    + `${[...new Set((fit.outs || []).map((o) => o.cls.split(' —')[0]))].join(', ')}]`
    + `${unclassified.length ? `  ← ${unclassified.length} UNCLASSIFIED` : ''}`);
  if (unclassified.length) process.exitCode = 1;
  // The occlusion proof reports per EYE; a sheet only needs to know whether
  // any of the six leaked, and which band.
  const occ = await t.dbg('towerOcclusionCheck()');
  if (occ && occ.pending) console.log(`occlusion: pending (${JSON.stringify(occ)})`);
  else if (occ) {
    const leaks = [];
    for (const e of occ.eyes || []) {
      for (const band of ['shaft', 'cowl']) {
        const b = e[band];
        if (b && b.blocked < b.n) leaks.push(`${e.id}/${band} ${b.blocked}/${b.n}`);
      }
    }
    console.log(`occlusion: ${(occ.eyes || []).length} eyes  `
      + `${leaks.length ? `LEAKING — ${leaks.join(', ')}` : 'shaft + cowl fully hidden at every one'}`
      + `${occ.dropped && occ.dropped.length ? `  (dropped: ${occ.dropped.join(', ')})` : ''}`);
    if (leaks.length) process.exitCode = 1;
  }

  await t.page.browser.send('Page.bringToFront', {}, t.page.sessionId);
  const data = await t.eval(
    `window.__diceDebug.lookSheet(${JSON.stringify(VIEWS)}, { cols: 3, tile: 620 })`);
  if (typeof data !== 'string' || !data.startsWith('data:image/png') || data.length < 5000) {
    console.log(`BAD: the sheet came back empty (${typeof data}, ${data && data.length} chars) — `
      + 'a WebGL canvas that has been composited away reads as blank');
    process.exitCode = 1;
    return;
  }
  const out = stage.out(`try-${slug}.png`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`${out}   ${VIEWS.length} views of ${slug}, in the room's own light`);
}
