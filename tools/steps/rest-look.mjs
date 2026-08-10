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

// DOES THE FASTER SETTLE STILL LOOK LIKE DICE? Loosening NUDGE.cockedDot lets
// a die rest at up to ~53°, and face correction then renders it flat while
// leaving it at the position it was perched in. Shorter throws are worthless
// if they end in dice hanging in the air, so this shoots the SAME seeds under
// the old rules and the new ones, side by side, and prints the geometry.
//
//   maxCorrectionDeg  how far correction twisted the physics pose
//   worstClip         lowest vertex below the felt, in die-widths (want ~0)
//   worstHover        highest "lowest vertex" — confounded by legitimate
//                     stacking, so read it against the picture, not alone
//
//   node tools/drive.mjs tools/steps/rest-look.mjs [seed]

const OLD = {
  phys: {
    floorFriction: 0.25, floorRestitution: 0.35,
    diceFriction: 0.15, diceRestitution: 0.45,
    wallFriction: 0.05, wallRestitution: 0.7,
    linearDamping: 0.01, angularDamping: 0.01,
  },
  nudge: { budget: 3, lift: 7, spread: 4, spin: 14, cockedDot: 0.82, cockedDotD4: 0.9 },
};

const POOLS = [
  ['soul', ['d8', 'd8', 'd4', 'd6']],
  ['8d6', Array(8).fill('d6')],
  ['20d6', Array(20).fill('d6')],
];

export default async function run(stage, [seed = '1000']) {
  const a = await stage.tab('localhost', 'Rest');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await a.dbg('setBannerRetireMs(0)');
  await a.dbg(`setZoom('wide')`); // 20 dice at 'close' fills the frame with one face

  const shipped = { phys: await a.dbg('physics'), nudge: await a.dbg('nudge') };

  for (const [label, cfg] of [['old', OLD], ['new', shipped]]) {
    await a.dbg(`setPhysics(${JSON.stringify(cfg.phys)})`);
    await a.dbg(`setNudge(${JSON.stringify(cfg.nudge)})`);
    for (const [pname, types] of POOLS) {
      await a.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
      await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${label} ${pname}`, timeout: 30000 });
      const p = await a.dbg('settleProfile()');
      const g = await a.dbg('restPlausibility()');
      console.log(`${label} ${pname.padEnd(5)} dur ${String(p.duration).padEnd(6)}`
        + ` capped ${p.timedOut ? 'yes' : 'no '}`
        + `  correction max ${String(g.maxCorrectionDeg).padStart(3)}° mean ${String(g.meanCorrectionDeg).padStart(3)}°`
        + `  clip ${g.worstClip}  hover ${g.worstHover}`);
      console.log('  ' + await stage.shot(a, `rest-${label}-${pname}-${seed}.png`));
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');
    }
  }
}
