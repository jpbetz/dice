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
// SIX ROWS, and each pair earns its place: z0 is -TABLE_D/2 and every volume
// hangs off it, so a preset is a different set of absolute numbers through the
// same arithmetic; and socketing deepens the mat by matExtra, which moves z0
// again AND is the only state in which the eight collider bodies exist to be
// read at all.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'tests', 'e2e', 'fixtures', 'tower-contract.golden.json');

export const PRESETS = ['wide', 'medium', 'close'];
export const SOCKETS = ['none', 'heartwood'];

// The one expression both this tool and the scenario evaluate, so the capture
// and the check can never drift into asking two different questions.
export const SNAP = 'JSON.stringify(window.__diceDebug.towerContractSnapshot())';

export async function captureContract(a) {
  const out = {};
  for (const preset of PRESETS) {
    for (const tower of SOCKETS) {
      await a.dbg(`setZoom('${preset}')`);
      await a.waitFor(`window.__diceDebug.zoom === '${preset}'`,
        { desc: `zoom ${preset}` });
      await a.dbg(`setTower('${tower}')`);
      await a.waitFor(`window.__diceDebug.tower === '${tower}'`,
        { desc: `tower ${tower}` });
      out[`${preset}.${tower}`] = JSON.parse(await a.eval(SNAP));
    }
  }
  return out;
}

export default async function run(stage) {
  const a = await stage.tab('localhost', 'TowerContract');
  await a.settle();

  const out = await captureContract(a);
  for (const [key, snap] of Object.entries(out)) {
    console.log(`${key.padEnd(18)} z0=${snap.z0} despawnY=${snap.despawnY} `
      + `door=${snap.door.w}×${snap.door.h} bodies=${snap.bodies ? snap.bodies.length : 0}`);
  }

  // Restore the shipped defaults before leaving, so a capture never depends on
  // what the last row happened to be.
  await a.dbg(`setTower('none')`);
  await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'unsocketed' });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nwrote ${OUT}`);
}
