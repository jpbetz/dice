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

// WHAT DOES A ROLL LEAVE BEHIND IN THE PHYSICS WORLD? `replay-drift` found
// that throwing the same seed twice in one tab can produce two different
// throws with NO churn in between — so something survives a roll that should
// not, and the candidates are all order-dependent: bodies still in
// world.bodies after clearTable, the SAP broadphase's axisList, world.time.
// Prints them after each throw/clear cycle so the growth (or the constant) is
// visible rather than argued.
//
//   node tools/drive.mjs tools/steps/world-state.mjs [cycles] [pool]

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

export default async function run(stage, [cycles = '6', pool = 'd8,d8,d4,d6']) {
  const types = pool.split(',');
  const a = await stage.tab('localhost', 'World');
  const rows = [];
  // The same seed every cycle: if the world were clean, every row would be
  // identical down to the pose hash.
  for (let i = 0; i < Number(cycles); i++) {
    await a.dbg(`throwSeeded(${JSON.stringify(types)}, 32676)`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)', { desc: `cycle ${i}` });
    const s = JSON.parse(await a.eval(`JSON.stringify((() => {
      const d = window.__diceDebug;
      const w = d.tableDice[0].body.world;
      const pose = d.tableDice.map((x) => [x.body.position.x, x.body.position.y, x.body.position.z]).join(',');
      let h = 0;
      for (let k = 0; k < pose.length; k++) h = (Math.imul(31, h) + pose.charCodeAt(k)) | 0;
      return { bodies: w.bodies.length, sap: w.broadphase.axisList ? w.broadphase.axisList.length : -1,
               time: Math.round(w.time * 100) / 100, contacts: w.contacts.length,
               dur: d.currentRoll.duration, pose: (h >>> 0).toString(16) };
    })())`));
    rows.push([i, s.bodies, s.sap, s.time, s.contacts, s.dur.toFixed(3), s.pose]);
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    const after = JSON.parse(await a.eval(`JSON.stringify((() => {
      const w = window.__diceDebug.worldRef;
      return w ? { bodies: w.bodies.length, sap: w.broadphase.axisList.length } : null;
    })())`));
    if (after) rows[rows.length - 1].push(`${after.bodies}/${after.sap} after clear`);
  }
  console.log('\nsame seed, same pool, one tab — what the world carries between throws\n');
  table(['cycle', 'bodies', 'sapList', 'world.time', 'contacts', 'duration', 'pose hash', 'cleared'], rows);
}
