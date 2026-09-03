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

// js/dice-apply-core.js — WHAT IT MEANS TO PUT A DIAL INTO dice.yaml.
//
// This is the computation `tools/dice-apply.mjs` was written around
// (2026-09-02, phase 1): validate a set of leaves against the dial tree,
// work out which of them DIFFER from the checkout's own declaration, and
// patch the checkout's own TEXT one span at a time so every comment and
// every untouched byte survives. Nothing here reads argv, the filesystem or
// the clock: it is two texts in and one text out.
//
// It moved out of the tool (2026-09-02, phase C1) because server.js's armed
// Save route must do EXACTLY this and no other thing — "the server never
// writes posted text: it reads the current file, validates changes the way
// tools/dice-apply.mjs does" — and a second implementation of "what a legal
// change is" is the shape of bug this whole design exists to avoid. The tool
// keeps its name, its CLI and its exports; both callers share this file, and
// the scratch trees the tests spawn carry js/ but not tools/, which settles
// where the shared half lives.
//
// Node-pure by construction: js/yaml.js and js/tune.js are the only imports,
// and both are themselves Node-pure (no DOM, no three, no cannon).

import { parseYaml, patchYaml, formatScalar, YamlError } from './yaml.js';
import { DIALS, STATIC_PATHS, isDial, leaves, getLeaf, toPath } from './tune.js';

export const isPlain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const dotted = (p) => (Array.isArray(p) ? p.join('.') : String(p));
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v);

// The dial at `path`, or a string saying why there is none: the walk stops
// at a dial met early (`table.scale.label` is a path THROUGH a dial, not a
// leaf of it) and at a map where the file put a scalar.
export function dialFor(dials, path) {
  const parts = toPath(path);
  let node = dials;
  for (let i = 0; i < parts.length; i++) {
    if (isDial(node)) return `passes through the dial at ${dotted(parts.slice(0, i))}`;
    if (!isPlain(node) || !Object.prototype.hasOwnProperty.call(node, parts[i])) return 'no dial at this path';
    node = node[parts[i]];
  }
  if (isDial(node)) return node;
  return isPlain(node) ? 'a map in the dial tree, not a leaf' : 'no dial at this path';
}

// Is `value` a legal reading of `dial`? Null is ABSENT everywhere in this
// design — the default stands — so it is never a problem, only a skip.
// Returns a message or null.
export function judgeValue(dial, value) {
  if (value === null) return null;
  const want = typeOf(dial.def);
  if (typeOf(value) !== want) return `expected ${want}, got ${formatScalar(value)}`;
  if (want === 'number' && !Number.isFinite(value)) return 'not a finite number';
  if (dial.options && !dial.options.includes(value)) {
    return `expected one of ${dial.options.join(' | ')}, got ${formatScalar(value)}`;
  }
  return null;
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
    const bad = judgeValue(d, v);
    if (bad) problems.push({ path: p, message: `${p}: ${bad}` });
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
  return finishPatch(checkoutText, checkoutName, problems, changes);
}

// ---------------------------------------------------------------------------
// The FLAT half — what the Save route posts (docs/DEVMODE.md §6)
// ---------------------------------------------------------------------------
//
// The panel does not post a file; it posts `tune.changes()`, a flat map of
// dotted path → scalar. That is deliberate ("the client posts the CHANGES;
// the server patches its own copy of the file… Nothing posted is ever
// written verbatim"), so the flat form gets its own validator rather than
// being folded into a tree first: folding would let `{ 'light.lamp': 5,
// 'light.lamp.y': 30 }` become a shape question instead of the two honest
// per-path refusals it is.
//
// STATIC PATHS ARE REFUSED HERE, not merely undialled. `app.mode` HAS a dial
// (the panel draws it, read-only) and js/tune.js refuses to `set` it, so a
// path list that only asked "is there a dial?" would let a Save flip the
// production switch of a running checkout. One list, tune.js's, both sides.
export function validateChanges(changes, { dials = DIALS, staticPaths = STATIC_PATHS } = {}) {
  const problems = [];
  if (!isPlain(changes)) return [{ path: '', message: 'changes must be a map of dotted path to scalar' }];
  for (const [p, v] of Object.entries(changes)) {
    if (staticPaths.includes(p)) { problems.push({ path: p, message: `${p}: not a dial: set it in dice.yaml or DICE_MODE` }); continue; }
    if (isPlain(v) || Array.isArray(v)) { problems.push({ path: p, message: `${p}: expected a scalar, got a ${Array.isArray(v) ? 'list' : 'map'}` }); continue; }
    const d = dialFor(dials, p);
    if (typeof d === 'string') { problems.push({ path: p, message: `${p}: ${d}` }); continue; }
    const bad = judgeValue(d, v);
    if (bad) problems.push({ path: p, message: `${p}: ${bad}` });
  }
  return problems;
}

// The flat counterpart of planChanges: which of the posted leaves actually
// MOVE the checkout, in the order they were posted. A null is absent, and a
// leaf the file already says is not a change — a Save of an unchanged panel
// writes nothing, which is why `text` comes back byte-identical.
export function planFlatChanges(changes, checkout) {
  const out = [];
  for (const [p, to] of Object.entries(changes)) {
    if (to === null) continue;
    const from = getLeaf(checkout, toPath(p));
    const absent = from === undefined;
    if (!absent && from === to) continue;
    out.push({ path: toPath(p), from, to, absent });
  }
  return out;
}

// The route's whole computation: the checkout's text plus a posted flat patch
// in, `{ problems, changes, text }` out, nothing touched. Same shape as
// applyText so both callers report identically.
export function applyChanges(checkoutText, changes, { dials = DIALS, staticPaths = STATIC_PATHS, checkoutName = 'dice.yaml' } = {}) {
  let checkout;
  try { checkout = parseYaml(checkoutText).tree; } catch (e) {
    if (e instanceof YamlError) return { problems: [{ path: '', message: `${checkoutName}:${e.line}: ${e.message}` }], changes: [], text: checkoutText };
    throw e;
  }
  const problems = validateChanges(changes, { dials, staticPaths });
  if (problems.length) return { problems, changes: [], text: checkoutText };
  const planned = planFlatChanges(changes, isPlain(checkout) ? checkout : {});
  return finishPatch(checkoutText, checkoutName, problems, planned);
}

// The checkout can refuse a change its own shape cannot take — a map in
// the download where the checkout holds a scalar (`light: 5` against
// `light.lamp.y: 30`) — and patchYaml says so with a YamlError. That is a
// problem line like the parse errors above, not a stack trace: the header
// promises one line per problem and nothing written (2026-09-02, B3 review).
function finishPatch(checkoutText, checkoutName, problems, changes) {
  if (!changes.length) return { problems, changes, text: checkoutText };
  const patch = new Map(changes.map((c) => [c.path, c.to]));
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
