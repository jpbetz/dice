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
import { parseYaml, patchYaml, formatScalar, YamlError } from '../js/yaml.js';
import { DIALS, isDial, leaves, getLeaf } from '../js/tune.js';

const OWN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const isPlain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const dotted = (p) => p.join('.');
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v);

// The dial at `path`, or a string saying why there is none: the walk stops
// at a dial met early (`table.scale.label` is a path THROUGH a dial, not a
// leaf of it) and at a map where the file put a scalar.
function dialFor(dials, path) {
  let node = dials;
  for (let i = 0; i < path.length; i++) {
    if (isDial(node)) return `passes through the dial at ${dotted(path.slice(0, i))}`;
    if (!isPlain(node) || !Object.prototype.hasOwnProperty.call(node, path[i])) return 'no dial at this path';
    node = node[path[i]];
  }
  if (isDial(node)) return node;
  return isPlain(node) ? 'a map in the dial tree, not a leaf' : 'no dial at this path';
}

// One problem per offending leaf, in the given file's order. The dial tree is
// the law for what a path IS; type and options are the law for its value.
export function validate(tree, dials = DIALS) {
  const problems = [];
  if (!isPlain(tree)) return [{ path: '', message: 'the file is not a map of sections' }];
  for (const path of leaves(tree)) {
    const v = getLeaf(tree, path);
    const d = dialFor(dials, path);
    const p = dotted(path);
    if (typeof d === 'string') { problems.push({ path: p, message: `${p}: ${d}` }); continue; }
    if (v === null) continue;                                 // absent: the default stands
    const want = typeOf(d.def);
    if (typeOf(v) !== want) { problems.push({ path: p, message: `${p}: expected ${want}, got ${formatScalar(v)}` }); continue; }
    if (want === 'number' && !Number.isFinite(v)) { problems.push({ path: p, message: `${p}: not a finite number` }); continue; }
    if (d.options && !d.options.includes(v)) {
      problems.push({ path: p, message: `${p}: expected one of ${d.options.join(' | ')}, got ${formatScalar(v)}` });
    }
  }
  return problems;
}

// The leaves of `given` whose value differs from `checkout`'s — a leaf the
// checkout does not name is a change too (`absent: true`; patchYaml inserts
// it under its map). A null in the given file is no value at all.
export function planChanges(given, checkout) {
  const out = [];
  for (const path of leaves(given)) {
    const to = getLeaf(given, path);
    if (to === null) continue;
    const from = getLeaf(checkout, path);
    const absent = from === undefined;
    if (!absent && from === to) continue;
    out.push({ path, from, to, absent });
  }
  return out;
}

// The whole computation on two texts, with nothing touched: { problems,
// changes, text } where `text` is the checkout patched (or the checkout
// itself when nothing changed). A YamlError in either file is a problem line.
export function applyText(checkoutText, givenText, { dials = DIALS, givenName = 'file', checkoutName = 'dice.yaml' } = {}) {
  let given, checkout;
  try { given = parseYaml(givenText).tree; } catch (e) {
    if (e instanceof YamlError) return { problems: [{ path: '', message: `${givenName}:${e.line}: ${e.message}` }], changes: [], text: checkoutText };
    throw e;
  }
  try { checkout = parseYaml(checkoutText).tree; } catch (e) {
    if (e instanceof YamlError) return { problems: [{ path: '', message: `${checkoutName}:${e.line}: ${e.message}` }], changes: [], text: checkoutText };
    throw e;
  }
  const problems = validate(given, dials);
  if (problems.length) return { problems, changes: [], text: checkoutText };
  const changes = planChanges(given, isPlain(checkout) ? checkout : {});
  if (!changes.length) return { problems, changes, text: checkoutText };
  const patch = new Map(changes.map((c) => [c.path, c.to]));
  // The checkout can refuse a change its own shape cannot take — a map in
  // the download where the checkout holds a scalar (`light: 5` against
  // `light.lamp.y: 30`) — and patchYaml says so with a YamlError. That is a
  // problem line like the parse errors above, not a stack trace: the header
  // promises one line per problem and nothing written (2026-09-02, B3 review).
  try {
    return { problems, changes, text: patchYaml(checkoutText, patch) };
  } catch (e) {
    if (e instanceof YamlError) return { problems: [{ path: '', message: `${checkoutName}: ${e.message}` }], changes: [], text: checkoutText };
    throw e;
  }
}

export function reportLine(c) {
  return `${dotted(c.path)}: ${c.absent ? '(absent)' : formatScalar(c.from)} → ${formatScalar(c.to)}`;
}

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
