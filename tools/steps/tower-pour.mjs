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

// THE SHIPPED POUR, read off the baked film (docs/TOWER.md). Sockets the
// heartwood tower as a room setting, rolls a set of pools through it, and
// prints what the bake produced per pool: how many bakes the exit guarantee
// spent, how many dice ended delivered, the hidden windows, and the clunks.
// This is the diagnostic loop for the pour the way tower-probe is for the lab.
//
//   node tools/drive.mjs tools/steps/tower-pour.mjs ["2d6,8d6,1d20"]

export default async function run(stage, args) {
  const pools = (args[0] || '1d20,1d8+1d6+1d10,8d6').split(',');
  const a = await stage.tab('localhost', 'TowerPour');
  await a.dbg('holdClock(true)');
  await a.dbg(`setTower('heartwood')`);
  await a.dbg('sim(30)');
  console.log('tower =', await a.dbg('tower'), ' extents =',
    JSON.stringify(await a.dbg('tableExtents()')));
  console.log('bodies =', (await a.dbg('towerBodies()')).map((b) => b.name).join(' '));

  for (const pool of pools) {
    const t0 = Date.now();
    await a.dbg(`commandRoll(${JSON.stringify(pool)})`);
    await a.waitFor('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
      { desc: `${pool}: the roll reached the client` });
    const bakeMs = Date.now() - t0;
    const f = JSON.parse(await a.eval('JSON.stringify(window.__diceDebug.towerFilmInfo())'));
    const delivered = f.rest.filter((r) => r.delivered).length;
    console.log(`\n=== ${pool} — bake ${bakeMs}ms, ${f.frames} frames `
      + `(${f.duration.toFixed(2)}s), attempts ${f.attempts}, rescues ${f.rescues}`);
    console.log(`  delivered ${delivered}/${f.rest.length}, unseen ${f.unseen}, `
      + `stranded ${f.stranded}, clunks ${f.clunks}/${f.impacts} impacts, `
      + `firstExit ${f.firstExitTime.toFixed(2)}s`);
    f.rest.forEach((r, i) => {
      const gaps = f.hidden[i].map((g) => `${g[0]}-${g[1]}`).join(',');
      console.log(`  d${i} ${r.type.padEnd(4)} ${r.delivered ? 'FELT  ' : 'UNSEEN'} `
        + `p=(${r.p.join(',')}) hidden=[${gaps}]`);
    });
    // Play the whole film out and confirm the values the table declares are
    // the values the dice show.
    await a.dbg(`sim(${f.frames + 120})`);
    const check = JSON.parse(await a.eval(`JSON.stringify((() => {
      const r = window.__diceDebug.currentRoll;
      return { done: r.done, values: r.values,
        shown: window.__diceDebug.tableDice.map((d) => d.mesh.visible) };
    })())`));
    console.log(`  played: done=${check.done} values=${JSON.stringify(check.values)} `
      + `allVisible=${check.shown.every(Boolean)}`);
    await a.dbg('clearTable()');
    await a.dbg('sim(400)');
  }

  // And back to none: the main world must return to exactly its towerless
  // configuration.
  await a.dbg(`setTower('none')`);
  await a.dbg('sim(30)');
  console.log('\nafter none: extents =', JSON.stringify(await a.dbg('tableExtents()')),
    ' walls =', JSON.stringify(await a.dbg('wallPositions()')),
    ' bodies =', JSON.stringify(await a.dbg('towerBodies()')));
}
