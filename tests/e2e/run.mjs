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
//   node tests/e2e/run.mjs --only shelf    # targeted: scenarios tagged 'shelf'
//   node tests/e2e/run.mjs --full          # everything (pre-release sweep)
//   node tests/e2e/run.mjs --list          # show scenarios and tags

import { runScenarios } from './harness.mjs';
import { scenarios } from './scenarios.mjs';

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
