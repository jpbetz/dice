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

// WHAT A RE-BAKE ACTUALLY SAVED, measured rather than predicted (ROADMAP T15).
//
// A code-built skin and its baked replacement are the SAME TOWER, so the only
// honest comparison is the two of them in one run, in one process, through one
// audit. `towerDressAudit()` walks the socketed tower and counts meshes per
// group, which is the number the tower-dressing budget gates on — and the
// number T15 exists to move.
//
// Run: node tools/drive.mjs tools/steps/tower-draw-ab.mjs <id> <path-to.glb>
//   e.g. node tools/drive.mjs tools/steps/tower-draw-ab.mjs \
//          blackanvil tools/forge/out/blackanvil.glb
//
// THE BAKED SIDE IS A THROWAWAY ROW, exactly as tower-try registers one, so
// nothing is promoted and a rejected round leaves no trace. It registers OVER
// the shipped id — which is why the code-built side has to be read FIRST, and
// why the run goes through 'none' in between: `towerRegisterGlb` replaces the
// row, and a row replaced under a socketed tower does not re-socket itself.
// (A second id was tried and refused: `setTower` never brought it up. Reading
// the old skin, then replacing it, is one fewer moving part anyway.)

export default async function run(stage, [id = '', glb = '']) {
  if (!id || !glb) {
    console.log('BAD: needs <registered-id> <path-to.glb>');
    process.exitCode = 1;
    return;
  }
  const t = await stage.tab('localhost', 'DrawAB');
  await t.settle();
  await t.dbg('holdClock(true)');

  const url = `/${glb.replace(/^\.?\//, '')}`;
  {
    const read = async (which, label = which) => {
      await t.dbg(`setTower('${which}')`);
      await t.waitFor(`window.__diceDebug.tower === '${which}'`,
        { desc: `${which} is up` });
      // A GLB row resolves to classic volumes with a console.warn until the
      // model is really in — a count taken right then is of the WRONG tower
      // (the /new-tower trap list). tower-probe's idiom, applied to an audit.
      await t.waitFor(
        `(() => { const s = window.__diceDebug.towerModelStatus('${which}');
           return !s || s.ready === true; })()`,
        { desc: `${which}'s model is loaded` });
      const a = await t.dbg('towerDressAudit()');
      const groups = a.groups.map((g) => `${g.name} ${g.draws}`).join(', ');
      console.log(`${String(label).padEnd(20)} draws=${String(a.draws).padStart(3)}  `
        + `tris=${String(a.tris).padStart(6)}  [${groups}]`);
      return a;
    };

    console.log('--- the same tower, built both ways ---');
    const code = await read(id, `${id} (code skin)`);
    await t.dbg("setTower('none')");
    await t.waitFor("window.__diceDebug.tower === 'none'", { desc: 'the felt is bare' });
    const ok = await t.dbg(`towerRegisterGlb('${id}', ${JSON.stringify(url)}, `
      + `${JSON.stringify({ label: id, title: 'tower-draw-ab' })})`);
    if (!ok) {
      console.log(`BAD: towerRegisterGlb refused ${url}`);
      process.exitCode = 1;
      return;
    }
    const bake = await read(id, `${id} (baked GLB)`);
    const saved = code.draws - bake.draws;
    console.log(`\nsaved ${saved} draw calls (${code.draws} -> ${bake.draws}, `
      + `${(bake.draws / code.draws * 100).toFixed(0)}% of the old cost); `
      + `triangles ${code.tris} -> ${bake.tris}`);
    console.log(`the tower budget is 20 draws: baked ${bake.draws <= 20
      ? 'PASSES' : 'FAILS'} it, and the DRAW_WAIVER line for '${id}' `
      + `${bake.draws <= 20 ? 'can be deleted' : 'still cannot go'}`);
  }
}
