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
//   node tools/drive.mjs tools/steps/tower-try.mjs out/x.glb 42 \
//     '{"ember":{"at":[-1.55,3.95,-0.34],"color":"#cfe98c","intensity":2.4,
//       "dist":4.4},"lantern":{"rake":0.45}}'                     # …and its lamps
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
//
// THE SLUG MUST BE AN ID THE SERVER ALLOWLISTS, and that is the one real
// limit on the above. The slug is the FILE'S BASENAME, `setTower` sends a
// settings patch, and server.js validates `tower` against a fixed list — so
// `nullstone_spill.glb` mints its row fine, is refused on the wire, and the
// table goes on wearing 'none' while the model sits at status `idle`. The
// step catches it ("asked for X, the table wears none") rather than shooting
// the wrong tower, which is the important part, but the fix is not obvious
// from the message: name the file after a SHIPPED id and put the variant in
// the PATH — `tools/forge/out/<variant>/nullstone.glb`. That also makes the
// third argument load-bearing, since a matching slug inherits the shipped
// row's lamps and a variant usually wants the ones it was authored against.

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

// THE RIG A RAW BAKE GETS IS NOT THE RIG IT WILL SHIP IN, and judging value
// under the wrong lamps is the exact mistake this tool exists to stop — one
// level up. Two paths, and between them they cover every bake:
//
//   · the slug MATCHES a registered id (bake `nullstone.glb`, look at
//     `nullstone`): `towerRegisterGlb` now inherits that row's ember,
//     lantern, motes and dress. Nothing to pass. This is the case that was
//     silently broken, and the fix is in the hook so it holds for every
//     caller, not just this one.
//   · the slug does NOT (bake `nullstone_umbra.glb`): there is no row to
//     inherit from, so the third argument states the lamps. It is the SHIPPED
//     row's own `ember`/`lantern` object, copied out of the registry — the
//     rake rides on `lantern.rake` exactly as an authored row's does, so
//     there is no second copy of the arithmetic to drift.
//
// Omit it and nothing changes for callers that do not care.
export default async function run(stage, [target = '', seed = '42', light = '']) {
  let row = {};
  if (light) {
    try { row = JSON.parse(light); } catch (e) {
      console.log(`BAD: the third argument is the row's light as JSON — ${e.message}`);
      process.exitCode = 1;
      return;
    }
  }
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
    const opts = { label: slug, title: 'tower-try' };
    for (const key of ['ember', 'lantern', 'motes', 'dress', 'clunkVoice']) {
      if (row[key] !== undefined) opts[key] = row[key];
    }
    const ok = await t.dbg(`towerRegisterGlb('${slug}', ${JSON.stringify(url)}, `
      + `${JSON.stringify(opts)})`);
    if (!ok) {
      console.log(`BAD: towerRegisterGlb refused '${slug}' → ${url}`);
      process.exitCode = 1;
      return;
    }
    console.log(`registered ${slug} → ${url} (throwaway row, never a picker chip)`);
    // SAY WHOSE LAMPS THESE ARE, on the sheet's own transcript. A frame lit by
    // a default is not wrong — it is unlabelled, and unlabelled is how four
    // rounds of value decisions got taken through an orange point light that
    // nobody had chosen.
    // eval, not dbg: `dbg` prefixes `window.__diceDebug.` and this is an
    // expression over the registry, not a hook call.
    const lit = await t.eval(`(() => { const c = window.__diceDebug.towerRegistry()
      .find((r) => r.id === ${JSON.stringify(slug)}); return c ? JSON.stringify(
        { ember: c.ember, lantern: c.lantern }) : 'null'; })()`);
    const src = Object.keys(opts).some((k) => k !== 'label' && k !== 'title')
      ? 'stated on the command line'
      : (lit && !/#ff9a44/.test(lit) ? `inherited from the registered '${slug}' row`
        : 'THE PLAIN DEFAULT — no row of this name, and none stated');
    console.log(`lamps: ${src}\n  ${lit}`);
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
