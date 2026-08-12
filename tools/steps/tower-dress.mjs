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

// WHAT THE DRESSING COST, per tower (docs/TOWER.md, DRESSING). Triangles and
// draw calls for the model, for the `towerSkinDress` group and for the
// `towerDressFx` group, plus the idle-motion registrations and whether the
// registry row carries the family trait's `ember`. It exists because "≤ 4k
// triangles and ≤ 8 draw calls of dressing" is a budget, and a budget nobody
// measures is a wish.
//
// Page errors are collected too: a prop kit is mostly geometry construction,
// and a thrown build is a tower that silently does not appear.
//
//   node tools/drive.mjs tools/steps/tower-dress.mjs [tower…]

export default async function run(stage, args) {
  const towers = args.length ? args : ['heartwood', 'bastion', 'blackanvil'];
  const a = await stage.tab('localhost', 'TowerDress');
  await a.settle();

  let bad = 0;
  for (const id of towers) {
    await a.dbg(`setTower('${id}')`);
    await a.waitFor(`window.__diceDebug.tower === '${id}'`, { desc: `${id} socketed` });
    const r = await a.dbg('towerDressAudit()');
    if (!r) { console.log(`${id}: BAD — nothing socketed`); bad++; continue; }
    console.log(`${id}`);
    for (const g of r.groups) {
      console.log(`  ${g.name.padEnd(16)} ${String(g.meshes).padStart(3)} meshes  `
        + `${String(g.tris).padStart(6)} tris  ${String(g.draws).padStart(3)} draws  `
        + `y[${g.y[0]}, ${g.y[1]}]  x[${g.x[0]}, ${g.x[1]}]  z(rel z0)[${g.z[0]}, ${g.z[1]}]`);
    }
    console.log(`  total ${r.tris} tris in ${r.draws} draw calls · `
      + `sways ${r.sways} · smokes ${r.smokes} · ember ${r.ember ? 'YES' : 'no'} · `
      + `lights in skin ${r.lights}`);
    if (r.lights) { console.log('  BAD — a skin added a light'); bad++; }
    if (!r.ember) { console.log('  BAD — the family trait is missing from this row'); bad++; }
    console.log('');
  }
  const list = a.page.errors.concat(a.page.consoleErrors);
  console.log(list.length ? `PAGE ERRORS: ${list.join(' | ')}` : 'no page errors');
  if (list.length) bad++;
  await a.dbg(`setTower('none')`);
  console.log(bad === 0 ? '\nCLEAN' : `\nBAD: ${bad} problem(s)`);
  if (bad) process.exitCode = 1;
}
