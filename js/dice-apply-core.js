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
import {
  DIALS, STATIC_PATHS, ASSET_SECTIONS, LAWS, assetDialFor, isDial, leaves, getLeaf, setLeaf, toPath,
  merge, lawScopes, pairGroups, isStaticRowLeaf,
} from './tune.js';

export const isPlain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const dotted = (p) => (Array.isArray(p) ? p.join('.') : String(p));
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v);

// The dial at `path`, or a string saying why there is none: the walk stops
// at a dial met early (`table.scale.label` is a path THROUGH a dial, not a
// leaf of it) and at a map where the file put a scalar.
export function dialFor(dials, path) {
  const parts = toPath(path);
  // AN ASSET ROW HAS NO PLACE IN THE DIAL TREE (docs/DEVMODE.md §9, phase
  // C4): `felts.house-moss.cloth` is a leaf of a ROW, and what says whether
  // it is legal is the section's row shape. One answer shape, so everything
  // downstream — validate, validateChanges, the tool's report, the armed
  // route's refusal — reads it without knowing which kind it asked about.
  // Skipped if a caller's own `dials` happens to own the section name, so
  // the dial tree always wins where the two could disagree.
  if (parts.length && ASSET_SECTIONS.includes(parts[0])
    && !(isPlain(dials) && Object.prototype.hasOwnProperty.call(dials, parts[0]))) {
    return assetDialFor(parts);
  }
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
  // A LIST DIAL HAS THREE LAWS (js/tune.js `list`, and its `judge` is the same
  // three in the same order): how many entries the code reads, that an entry
  // is a string at all, and — where the entries come from a fixed vocabulary —
  // which strings. `each` alone was the whole check until the D1 review found
  // that a palette, whose `each` is null, had no law at all: `colors: [1, 2]`
  // validated here and reached js/particles.js's `hexRGB`. Indexed, not
  // `find`, because `find` cannot tell "no bad entry" from an entry that IS
  // `undefined`.
  if (want === 'list') {
    if (dial.len && (value.length < dial.len[0] || value.length > dial.len[1])) {
      const n = dial.len[0] === dial.len[1] ? `${dial.len[0]}` : `${dial.len[0]}-${dial.len[1]}`;
      return `takes ${n} entries, got ${value.length}`;
    }
    const i = value.findIndex((e) => typeof e !== 'string');
    if (i >= 0) return `every entry must be a string, got ${formatScalar(value[i])} at ${i}`;
    if (dial.each) {
      const j = value.findIndex((e) => !dial.each.includes(e));
      if (j >= 0) return `every entry must be one of ${dial.each.join(' | ')}, got ${formatScalar(value[j])}`;
    }
    return null;
  }
  if (dial.options && !dial.options.includes(value)) {
    return `expected one of ${dial.options.join(' | ')}, got ${formatScalar(value)}`;
  }
  // A LAW (js/tune.js LAWS, phase D4). Single-value laws are answerable from
  // the leaf and belong here, so `pace.tempo.k: 0` is refused by the tool and
  // by the armed route exactly as `tune.set` refuses it. A PAIR law needs the
  // other leaf and is answered in `validate` below, over the whole tree.
  if (dial.law && !LAWS[dial.law].pair && !LAWS[dial.law].holds(value)) {
    return `${LAWS[dial.law].why}, got ${formatScalar(value)}`;
  }
  return null;
}

// The pair laws over a whole file (js/tune.js LAWS, `pair: true`). One problem
// per group, naming every path in it, because a pair is one claim and not two.
// Absent leaves take their dial defaults — a file that says one half of the
// pair is judged against the half the code carries, which is what it will
// actually run on.
//
// ONE WALK PER SCOPE, not one per file (the D4 review, 2026-09-03): the root,
// and then each row of a section whose row shape IS the dial tree (`presets:`),
// because a preset's `cards.depth` is a `cards.depth`. `lawScopes` and
// `pairGroups` are js/tune.js's, so this judge and `createTune`'s
// `checkLawPairs` cannot come to disagree about which leaves are one claim.
export function judgePairs(tree, dials = DIALS) {
  const problems = [];
  const root = isPlain(tree) ? tree : {};
  for (const scope of lawScopes(root, dials)) {
    const groups = pairGroups(scope.dials, scope.defaults);
    if (!groups.size) continue;
    const sub = scope.at.length ? getLeaf(root, scope.at) : root;
    const merged = merge(scope.defaults, isPlain(sub) ? sub : {});
    const named = (p) => dotted(scope.at.concat(p));
    for (const [name, paths] of groups) {
      const law = LAWS[name];
      const read = (p) => getLeaf(merged, p);
      if (paths.every((p) => law.holds(getLeaf(merged, p), dotted(p), read))) continue;
      problems.push({ path: named(paths[0]), message: `${paths.map(named).join(' + ')}: ${law.why}` });
    }
  }
  return problems;
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
    // A NULL AT A MAP IS AN ABSENT MAP, not a mistyped leaf (phase D1). `null`
    // is absent everywhere in this design — `judgeValue` says so three lines
    // down and js/tune.js drops it with the default standing — and until the
    // dice catalogue moved into the file nothing had ever written one AT a
    // group. Three sets do: `glow: null` is how js/themes.js says "the digits
    // carry ALL the light", and `leaves` reads that line as a leaf at the
    // group's own path, which `dialFor` correctly answers "is a group of
    // fields; name one" — a true sentence about a line that is not a problem.
    // Refusing it would have made `tools/dice-apply.mjs` reject the
    // checked-in file, which is the one file it must always accept.
    if (v === null && typeof d === 'string' && /is a group of fields|a map in the dial tree/.test(d)) continue;
    if (typeof d === 'string') { problems.push({ path: p, message: `${p}: ${d}` }); continue; }
    // A STATIC LEAF INSIDE A DIAL-TREE ROW (js/tune.js `isStaticRowLeaf`, the
    // D4 review): `presets.dusk.app.mode` HAS a dial, so nothing above says a
    // word about it, and every writer refuses it — a row that could only ever
    // be refused on Apply. Same sentence the reader gives it at birth.
    if (isStaticRowLeaf(path)) {
      problems.push({ path: p, message: `${p}: not a dial a patch may set: ${dotted(toPath(path).slice(2))} is set in dice.yaml or DICE_MODE` });
      continue;
    }
    const bad = judgeValue(d, v);
    if (bad) problems.push({ path: p, message: `${p}: ${bad}` });
  }
  return problems.concat(judgePairs(tree, dials));
}

// The leaves of `given` whose value differs from `checkout`'s — a leaf the
// checkout does not name is a change too (`absent: true`; patchYaml inserts
// it under its map). A null in the given file is no value at all.
//
// A LIST IS A LEAF AND TWO EQUAL LISTS ARE NOT `===` (phase D1). `leaves`
// has always counted an array as a leaf, but until the dice catalogue moved
// into the file no line of dice.yaml held one — so applying the checkout to
// ITSELF reported every `faces:` and every `colors:` as a change from a value
// to the same value, and `tools/dice-apply.mjs`'s own "nothing changed" case
// stopped being reachable. Same test both ways round, one JSON deep.
const sameValue = (a, b) => a === b
  || (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));

export function planChanges(given, checkout) {
  const out = [];
  for (const path of leaves(given)) {
    const to = getLeaf(given, path);
    if (to === null) continue;
    const from = getLeaf(checkout, path);
    const absent = from === undefined;
    if (!absent && sameValue(from, to)) continue;
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
// `base` is the CHECKOUT'S OWN TREE, and it is what makes the pair laws
// answerable here (the D4 review, 2026-09-03). `judgeValue` skips them by
// design — a pair needs the other leaf — and the route ran nothing else, so a
// post naming ONE half of a pair against a checkout holding the other wrote a
// dice.yaml the next boot refuses WHOLE: two tabs, or a checkout edited after
// the tab booted, and `{'cards.standoff': 0.9}` alone landed on a file whose
// depth was 3.9. The file is the thing being written, so the file — patch on
// top of checkout — is the thing to judge. A caller with no file in hand gets
// the empty base, which is the same reading `validate` gives a file that names
// one half of a pair: the absent half is the one the CODE carries, because
// that is what the table will run on.
export function validateChanges(changes, { dials = DIALS, staticPaths = STATIC_PATHS, base = {} } = {}) {
  const problems = [];
  if (!isPlain(changes)) return [{ path: '', message: 'changes must be a map of dotted path to scalar' }];
  for (const [p, v] of Object.entries(changes)) {
    if (staticPaths.includes(p) || isStaticRowLeaf(p)) { problems.push({ path: p, message: `${p}: not a dial: set it in dice.yaml or DICE_MODE` }); continue; }
    // A MAP IS NEVER A POSTED VALUE; A LIST IS ONE ONLY WHERE THE DIAL IS A
    // LIST (phase D1). `faces` and the particle/decal palettes are single
    // dials whose value is the whole array — half a face table is not a face
    // table — so the route has to be able to carry one, while a list posted at
    // a scalar dial stays the shape mistake it always was. `dialFor` first, so
    // the answer is about THIS path and not about lists in general.
    if (isPlain(v)) { problems.push({ path: p, message: `${p}: expected a scalar, got a map` }); continue; }
    const d = dialFor(dials, p);
    if (typeof d === 'string') { problems.push({ path: p, message: `${p}: ${d}` }); continue; }
    if (Array.isArray(v) && !Array.isArray(d.def)) { problems.push({ path: p, message: `${p}: expected a scalar, got a list` }); continue; }
    const bad = judgeValue(d, v);
    if (bad) problems.push({ path: p, message: `${p}: ${bad}` });
  }
  // The pair pass, over the file the patch WOULD make. Only once every leaf
  // has passed its own judgement: a value that is not a number cannot be
  // asked a geometry question, and its type is the honest problem to report.
  if (problems.length || !isPlain(base)) return problems;
  const would = {};
  try {
    for (const [p, v] of Object.entries(changes)) if (v !== null && v !== undefined) setLeaf(would, toPath(p), v);
  } catch (e) {
    // Two posted paths that cannot both be leaves of one file (`a.b` and
    // `a.b.c`). The per-leaf pass above catches every reachable case — a path
    // through a dial has no dial — so this is the door held shut rather than a
    // case anyone has seen: a problem line, never a throw out of the route.
    return [{ path: '', message: `changes: ${e.message}` }];
  }
  return judgePairs(merge(base, would), dials);
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
    if (!absent && sameValue(from, to)) continue;
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
  const problems = validateChanges(changes, { dials, staticPaths, base: isPlain(checkout) ? checkout : {} });
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
