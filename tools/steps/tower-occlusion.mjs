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

// DOES THE SKIN HIDE WHAT THE CONTRACT SAYS IT MUST? (docs/TOWER.md §4.)
// Headless, geometric, no screenshots: for every shipped camera eye
// (ZOOM_PRESETS full + mini) it shoots rays at a grid of sample points and
// reports how many are behind opaque skin.
//
// Two of the four bands are HARD — the shaft around the despawn line, and
// the cowl band over the mouth — and this step fails on either.
//
// EXIT and HOOD are reported, not gated, and the reason is arithmetic, not
// laziness: both sit at or in front of the back-wall plane, seen through a
// doorway the contract requires to stay clear from the apron top up to
// y ≥ 3.4·S. Every shipped eye is shallow enough that its ray enters that
// opening BELOW the head and lands on the spawn without meeting anything.
// No legal geometry occludes them; the darkness layers (black lining and
// the doorway veil) are what the contract actually leans on there.
//
// It proves ANY registered skin, not just the first one: pass a tower id and
// the lab is rebuilt wearing it. Every model has to answer this question
// before it ships, and the answer is counted rather than looked at.
//
//   node tools/drive.mjs tools/steps/tower-occlusion.mjs [towerId]

export default async function run(stage, args) {
  const tower = args[0] || 'heartwood';
  const a = await stage.tab('localhost', 'TowerOcclusion');
  await a.dbg('holdClock(true)');
  await a.dbg('towerEcho(false)');
  await a.dbg('towerCore(true)');
  let res = await a.dbg(`towerOcclusionCheck(${JSON.stringify(tower)})`);
  // A BAKED ROW MAY NOT BE HERE YET (C6). The probe answers {pending} rather
  // than grading whatever the bench is wearing, so this waits for the model
  // instead of reporting it as the wrong skin — which is what the `res.skin`
  // guard below would otherwise say, naming 'undefined' as the tower.
  for (let i = 0; res && res.pending && i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    res = await a.dbg(`towerOcclusionCheck(${JSON.stringify(tower)})`);
  }
  if (res && res.pending) {
    const st = await a.dbg(`towerModelStatus(${JSON.stringify(tower)})`);
    console.log(`BAD: '${tower}' never loaded its model (${JSON.stringify(st)})`);
    process.exitCode = 1;
    return;
  }
  if (res.skin !== tower) {
    console.log(`BAD: asked for '${tower}', the lab is wearing '${res.skin}'`);
    process.exitCode = 1;
    return;
  }

  console.log(`skin=${res.skin} z0=${res.z0} despawnY=${res.despawnY}\n`);
  const pct = (b) => `${b.blocked}/${b.n}`;
  let bad = 0;
  for (const e of res.eyes) {
    const hardOk = e.shaft.blocked === e.shaft.n && e.cowl.blocked === e.cowl.n;
    if (!hardOk) bad++;
    console.log(
      `${hardOk ? 'PASS' : 'FAIL'} ${e.id.padEnd(12)} eye=(${e.eye.join(',')})  `
      + `shaft ${pct(e.shaft)}  cowl ${pct(e.cowl)}   `
      + `[exit ${pct(e.exit)}  hood ${pct(e.hood)}]`);
  }
  console.log(bad === 0
    ? `\nCLEAN: ${res.skin} occludes shaft + cowl at every shipped eye`
    : `\nBAD: ${res.skin} leaks the shaft or the cowl at ${bad} eye(s)`);
  if (bad > 0) process.exitCode = 1;
}
