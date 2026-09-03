#!/usr/bin/env node
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

// tools/dice-apply.mjs — the other half of Download (docs/DEVMODE.md §6).
//
//   node tools/dice-apply.mjs ~/Downloads/dice.yaml [--check] [--root DIR]
//
// Developer mode's Download hands you the declaration with your dials in
// it. This puts those dials into the checkout: it validates the given file
// against the dial tree, works out which leaves DIFFER from the checkout's
// own dice.yaml, and patches the checkout's own text line by line — so a
// comment you added locally since the download survives, and `git diff
// dice.yaml` is exactly the lines that moved (Joe, revision 1: "possible for
// me to actually overwrite a file in the repo with that file"). The given
// file is never copied over the checkout's; its VALUES are, one span at a
// time, through the same patchYaml the panel's export uses.
//
// Refused, exit 2, one line per problem on stderr, nothing written:
//   · a leaf with no dial in DIALS (a typo, or a key from another version)
//   · a leaf of the wrong type, or an enum value outside its options
//   · any boolean — js/yaml.js refuses those at parse, with the line
// A null at a dial (`y:` with nothing after it) is ABSENT, as it is
// everywhere else in this design: skipped, not a change, not a problem.
//
// `--check` prints the report and writes nothing. `--root DIR` names the
// checkout to patch (default: the one this tool lives in) — the tests run
// it against a scratch copy of the tree, never the checkout. The write is
// atomic (a sibling temp file, then rename), so a crash mid-write leaves
// the file it found. Zero-dep: js/yaml.js and js/tune.js are the only imports.

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyText, reportLine } from '../js/dice-apply-core.js';

// The computation lives in js/dice-apply-core.js (moved there 2026-09-02,
// phase C1) because server.js's armed Save route runs the SAME validation and
// the SAME line patch, and the scratch trees the tests spawn carry js/ but
// not tools/. Re-exported here so this file stays the name the tests and the
// docs call it by.
export { validate, planChanges, applyText, applyChanges, validateChanges, reportLine } from '../js/dice-apply-core.js';

const OWN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const USAGE = 'usage: node tools/dice-apply.mjs <file.yaml> [--check] [--root DIR]';

// Exit codes: 0 applied (or nothing to apply), 1 usage or I/O, 2 refused.
export function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let file = null, check = false, root = OWN_ROOT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') check = true;
    else if (a === '--root') { root = argv[++i]; if (!root) { stderr.write(`${USAGE}\n`); return 1; } }
    else if (a.startsWith('--')) { stderr.write(`unknown option ${a}\n${USAGE}\n`); return 1; }
    else if (file === null) file = a;
    else { stderr.write(`${USAGE}\n`); return 1; }
  }
  if (!file) { stderr.write(`${USAGE}\n`); return 1; }
  const givenPath = resolve(file);
  const target = join(resolve(root), 'dice.yaml');
  let givenText, checkoutText;
  try { givenText = readFileSync(givenPath, 'utf8'); } catch (e) { stderr.write(`cannot read ${givenPath}: ${e.message}\n`); return 1; }
  try { checkoutText = existsSync(target) ? readFileSync(target, 'utf8') : ''; } catch (e) { stderr.write(`cannot read ${target}: ${e.message}\n`); return 1; }

  const { problems, changes, text } = applyText(checkoutText, givenText, { givenName: givenPath, checkoutName: target });
  if (problems.length) {
    for (const p of problems) stderr.write(`refused ${p.message}\n`);
    stderr.write(`${problems.length} problem${problems.length === 1 ? '' : 's'}; nothing written\n`);
    return 2;
  }
  for (const c of changes) stdout.write(`${reportLine(c)}\n`);
  if (!changes.length) { stdout.write(`no changes: ${target} already says what ${givenPath} says\n`); return 0; }
  const count = `${changes.length} change${changes.length === 1 ? '' : 's'}`;
  if (check) { stdout.write(`${count}; --check, nothing written\n`); return 0; }
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, target);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* never there */ }
    stderr.write(`cannot write ${target}: ${e.message}\n`);
    return 1;
  }
  stdout.write(`${count} written to ${target}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
