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

// Run a step file against a fresh headless stage (ephemeral server + Chrome
// tabs). The repo's ONE way to drive the app outside the e2e suite — debug
// sessions, screenshots, repros — so nothing needs ad-hoc inline scripts.
//
//   node tools/drive.mjs tools/steps/<file>.mjs [args…]
//   node tools/drive.mjs --steps a.mjs,b.mjs,c.mjs [args…]
//
// A step file default-exports:  async (stage, args) => { … }
// with stage = { tab(origin, name), shot(table, name), ctx, port, room,
// out(name), close() } — see tools/stage.mjs; tabs are the e2e harness's
// Table objects (eval / dbg / roll / settle / waitFor / logTop / …).
//
// --steps RUNS A CHAIN AGAINST ONE STAGE, and that is the whole point: a
// server boot plus a Chrome launch is ~4 s of cold start, and the cosmetic
// gate (package.json `gate:cosmetic`) is four to six steps long. Chained by
// shell (`&&`) that boot is paid once per step and a failure stops the run at
// the first red, which is the opposite of what a gate wants: a gate should
// report EVERY problem in one pass. So every step runs, its exit code is
// captured, and the aggregate is non-zero if any of them failed.
//
// EACH STEP GETS ITS OWN ROOM. Sharing the stage must not mean sharing the
// TABLE: tower, zoom and felt are room settings, so a second step's fresh tab
// would join the room the previous step left behind and grade whatever it was
// wearing — a full, plausible, wrong answer under the id that was asked for,
// which is the exact failure towerOcclusionCheck's `pending` guard exists to
// prevent. Same browser, same server, different room.

import { pathToFileURL } from 'node:url';
import { Ctx } from '../tests/e2e/harness.mjs';
import { startStage } from './stage.mjs';

const argv = process.argv.slice(2);
let steps = [];
let args = [];
if (argv[0] === '--steps') {
  steps = String(argv[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  args = argv.slice(2);
} else if (argv[0] && argv[0].startsWith('--steps=')) {
  steps = argv[0].slice(8).split(',').map((s) => s.trim()).filter(Boolean);
  args = argv.slice(1);
} else if (argv[0]) {
  steps = [argv[0]];
  args = argv.slice(1);
}
if (!steps.length) {
  console.error('usage: node tools/drive.mjs <steps.mjs> [args…]\n'
    + '       node tools/drive.mjs --steps <a.mjs,b.mjs,…> [args…]\n'
    + '  canned steps live in tools/steps/ (indexed in tools/README.md)');
  process.exit(2);
}

const stage = await startStage();

// One step's view of the shared stage: its own room and its own Ctx, so its
// tabs are its own, over the SAME browser and the same ephemeral server.
function stageFor(base, i) {
  if (steps.length === 1) return base;
  const room = `${base.room}-${i + 1}`;
  const ctx = new Ctx(base.ctx.browser, base.port, room, base.ctx.server);
  return {
    ...base,
    room,
    ctx,
    tab: (origin = 'localhost', name = 'Driver') => ctx.newTable({ origin, name }),
    close: () => ctx.closeAll().catch(() => {}),
  };
}

const results = [];
for (let i = 0; i < steps.length; i++) {
  const path = steps[i];
  const sub = stageFor(stage, i);
  if (steps.length > 1) console.log(`\n=== ${path} ${args.join(' ')} ===`);
  // A step reports failure two ways — it throws, or it sets process.exitCode
  // (most of them do the latter, so they can print the whole report first and
  // still come back red). Both have to be captured PER STEP, which means
  // zeroing the process-wide code around each one and remembering the answer.
  process.exitCode = 0;
  let err = null;
  try {
    const mod = await import(pathToFileURL(path).href);
    if (typeof mod.default !== 'function') throw new Error(`${path} has no default-export function`);
    await mod.default(sub, args);
  } catch (e) {
    err = e && e.message ? e.message : String(e);
    console.error(`drive: step failed — ${err}`);
  }
  results.push({ path, code: err ? 1 : (process.exitCode || 0), err });
  process.exitCode = 0;
  if (steps.length > 1) await sub.close();
}

await stage.close();

if (results.length > 1) {
  console.log('\n=== drive summary ===');
  for (const r of results) {
    console.log(`${r.code ? 'FAIL' : 'ok  '} ${r.path}${r.err ? `  (${r.err})` : ''}`);
  }
}
const bad = results.filter((r) => r.code).length;
if (bad && results.length > 1) console.log(`\nBAD: ${bad}/${results.length} step(s) failed`);
process.exit(bad ? 1 : 0);
