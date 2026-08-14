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

// CAPTURE THE ENGINE CONTRACT (docs/TOWER.md, "The six engine-owned volumes").
// Reads __diceDebug.towerContractSnapshot() at every zoom preset, unsocketed
// and with a tower standing, and writes the lot to
// tests/e2e/fixtures/tower-contract.golden.json — the file the
// `tower-contract-freeze` scenario compares the LIVE numbers against.
//
//   node tools/drive.mjs tools/steps/tower-contract-capture.mjs
//
// THIS IS NOT A TEST AND MUST NOT BE RUN TO "FIX" A RED FREEZE. The golden is
// the pre-refactor engine, captured once; re-running it after a change that
// moved a volume simply writes the new numbers down and the check stops
// checking. Re-capture only when the contract is DELIBERATELY renegotiated,
// and say so in the commit.
//
// THE ONE LEGITIMATE RE-CAPTURE is ADDITIVE: a new tower registers, or the
// snapshot's projection gains a field. Both leave every existing number where
// it was, so the review is mechanical — `git diff --stat` on the fixture must
// read `N insertions(+), 0 deletions(-)`. A deletion is the contract moving,
// and no commit message makes that a re-pin.
//
// TWO AXES, and each earns its rows:
//   Z0    three zoom presets × {unsocketed, heartwood}. z0 is -TABLE_D/2 and
//         every volume hangs off it, so a preset runs the same arithmetic to a
//         different set of absolute numbers; socketing deepens the mat by
//         matExtra, moving z0 again, and is the only state in which the eight
//         collider bodies exist to be read at all.
//   SPEC  every OTHER registered tower, at one preset. These rows freeze the
//         PORTAL SPEC each tower asks for and the core the engine derives from
//         it — the half of the contract the six original rows could not see,
//         because they only ever held one spec. A baked tower whose portals
//         quietly failed to load and fell back to the classic core is a
//         DIFFERENT BUG wearing identical volumes, and `source` is what tells
//         them apart. Hollow Bole was frozen nowhere at all until this.
// The Z0 axis stays at ONE spec on purpose: crossing both axes would multiply
// rows without asking a new question, since a preset only ever moves z0.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'tests', 'e2e', 'fixtures', 'tower-contract.golden.json');

export const PRESETS = ['wide', 'medium', 'close'];
export const ANCHORS = ['none', 'heartwood'];
// The room the SPEC axis is photographed in. One preset, because a preset only
// moves z0 and the Z0 axis already proves that propagates.
export const SPEC_PRESET = 'wide';

// The one expression both this tool and the scenario evaluate, so the capture
// and the check can never drift into asking two different questions.
export const SNAP = 'JSON.stringify(window.__diceDebug.towerContractSnapshot())';

// The row list, DERIVED FROM THE LIVE REGISTRY rather than typed here — a
// tower that registers without a frozen row is the gap this closes, and a
// hand-kept list would reopen it the first time somebody forgot.
export function contractRows(registry) {
  const rows = [];
  for (const preset of PRESETS) for (const tower of ANCHORS) rows.push([preset, tower]);
  for (const r of registry) {
    if (!ANCHORS.includes(r.id)) rows.push([SPEC_PRESET, r.id]);
  }
  return rows;
}

// Drive the tab to one row. A BAKED row does not socket in the tick it is
// asked for — the flush waits on the model — so this waits on the id landing
// rather than assuming it did (the classic rows land synchronously and the
// wait returns immediately).
export async function contractGoTo(a, preset, tower) {
  await a.dbg(`setZoom('${preset}')`);
  await a.waitFor(`window.__diceDebug.zoom === '${preset}'`, { desc: `zoom ${preset}` });
  await a.dbg(`setTower('${tower}')`);
  await a.waitFor(`window.__diceDebug.tower === '${tower}'`,
    { desc: `tower '${tower}' is standing (a baked row waits for its model)` });
}

export async function captureContract(a) {
  const registry = JSON.parse(await a.eval('JSON.stringify(window.__diceDebug.towerRegistry())'));
  const out = {};
  for (const [preset, tower] of contractRows(registry)) {
    await contractGoTo(a, preset, tower);
    out[`${preset}.${tower}`] = JSON.parse(await a.eval(SNAP));
  }
  return out;
}

export default async function run(stage) {
  const a = await stage.tab('localhost', 'TowerContract');
  await a.settle();

  const out = await captureContract(a);
  for (const [key, snap] of Object.entries(out)) {
    console.log(`${key.padEnd(18)} z0=${snap.z0} despawnY=${snap.despawnY} `
      + `door=${snap.door.w}×${snap.door.h} bodies=${snap.bodies ? snap.bodies.length : 0} `
      + `spec=${snap.source}`);
  }

  // Restore the shipped defaults before leaving, so a capture never depends on
  // what the last row happened to be.
  await a.dbg(`setTower('none')`);
  await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'unsocketed' });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nwrote ${OUT}`);
}
