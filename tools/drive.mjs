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
//
// A step file default-exports:  async (stage, args) => { … }
// with stage = { tab(origin, name), shot(table, name), ctx, port, room,
// out(name), close() } — see tools/stage.mjs; tabs are the e2e harness's
// Table objects (eval / dbg / roll / settle / waitFor / logTop / …).

import { pathToFileURL } from 'node:url';
import { startStage } from './stage.mjs';

const stepsPath = process.argv[2];
if (!stepsPath) {
  console.error('usage: node tools/drive.mjs <steps.mjs> [args…]\n  canned steps live in tools/steps/');
  process.exit(2);
}

const stage = await startStage();
let failed = false;
try {
  const mod = await import(pathToFileURL(stepsPath).href);
  if (typeof mod.default !== 'function') throw new Error(`${stepsPath} has no default-export function`);
  await mod.default(stage, process.argv.slice(3));
} catch (e) {
  failed = true;
  console.error(`drive: step failed — ${e && e.message ? e.message : e}`);
} finally {
  await stage.close();
}
process.exit(failed ? 1 : 0);
