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

// e2e entry point (see docs/TESTING.md for the policy):
//   node tests/e2e/run.mjs                 # smoke set (default)
//   node tests/e2e/run.mjs --only shelf    # targeted: tag or scenario name
//   node tests/e2e/run.mjs --only look     # the COSMETIC lane: no dice, enforced
//   node tests/e2e/run.mjs --full          # everything (pre-release sweep)
//   node tests/e2e/run.mjs --list          # show scenarios and tags
//
// The `look` tag is the one tag with a RULE attached: a scenario carrying it
// may not simulate a single die, and the runner proves it rather than trusting
// it (noDiceGuard in harness.mjs). It is the e2e half of the cosmetic/physics
// split — a mesh change owes measurements and LOOK sheets and owes simulation
// nothing, so the scenarios that prove cosmetic claims should cost seconds.

import { runScenarios } from './harness.mjs';
import { scenarios } from './scenarios.mjs';

// Scenario names must be unique: the harness keys each scenario's ROOM by
// its name, so a duplicate silently shares a room and its residue makes
// both scenarios scheduling-dependent (found 2026-08-03: two 'auto-collect'
// scenarios flipped a shelf-count assertion for days). Fail closed.
{
  const seen = new Set();
  for (const s of scenarios) {
    if (seen.has(s.name)) {
      console.error(`duplicate scenario name: '${s.name}' — names key rooms; rename one`);
      process.exit(2);
    }
    seen.add(s.name);
  }
}

const args = process.argv.slice(2);
const opt = { only: null, full: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--full') opt.full = true;
  else if (args[i] === '--only') opt.only = (args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
  else if (args[i] === '--list') {
    for (const s of scenarios) console.log(`${s.name}  [${s.tags.join(', ')}]`);
    process.exit(0);
  } else {
    console.error(`unknown arg: ${args[i]}`);
    process.exit(2);
  }
}

runScenarios(scenarios, opt);
