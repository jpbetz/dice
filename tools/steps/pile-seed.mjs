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

// Find a seed a SCENARIO can pin: one where a die ends up on another die with
// the pile bar off, and comes down when it is on. A scenario that picks its
// seed by luck is a scenario that goes red on someone else's change, so the
// seed goes in the test only if it clears both sides here.
//
//   node tools/drive.mjs tools/steps/pile-seed.mjs [count] [zoom] [pool]

export default async function run(stage, [count = '24', zoom = 'close', pool = '6d6']) {
  const types = pool === '6d6' ? Array(6).fill('d6') : pool.split(',');
  const a = await stage.tab('localhost', 'PileSeed');
  await a.dbg(`setZoom(${JSON.stringify(zoom)})`);
  await a.dbg('sim(200)');

  const shot = async (seed) => {
    await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc: `${seed}`, timeout: 60000 });
    const r = JSON.parse(await a.eval(`JSON.stringify((() => {
      const roll = window.__diceDebug.currentRoll;
      const p = window.__diceDebug.settleProfile();
      return { maxY: Math.max(...roll.landings.map((l) => l.endY)),
               dur: p.duration, nudged: p.nudged, capped: p.timedOut };
    })())`));
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    return r;
  };

  const hits = [];
  for (let i = 0; i < Number(count); i++) {
    const seed = 1000 + i * 7919;
    await a.dbg('setNudge({"pileScale":0})');
    const off = await shot(seed);
    await a.dbg(`setNudge({"pileScale":1.05})`);
    const on = await shot(seed);
    const fixed = off.maxY > 1.23 && on.maxY <= 1.23;
    if (fixed) hits.push({ seed, off, on });
    console.log(`${seed}  off maxY ${off.maxY.toFixed(2)} dur ${off.dur.toFixed(2)}`
      + `  |  on maxY ${on.maxY.toFixed(2)} dur ${on.dur.toFixed(2)} nudged ${on.nudged}`
      + `${fixed ? '   <-- RESOLVED' : ''}`);
  }
  await a.dbg('setNudge({"pileScale":0})');
  console.log(`\n${hits.length} seed(s) where the bar takes a die off the pile:`);
  for (const h of hits) {
    console.log(`  ${h.seed}: maxY ${h.off.maxY.toFixed(3)} -> ${h.on.maxY.toFixed(3)}`
      + `, dur ${h.off.dur.toFixed(2)} -> ${h.on.dur.toFixed(2)}, ${h.on.nudged} nudge round(s)`);
  }
}
