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

// THE TUNABLES REGISTRY (docs/DEVMODE.md §5). Node-pure: no DOM, no three,
// no cannon. Two things live here:
//
//   DIALS  — the dial tree: metadata and the DEFAULT for every leaf the
//            declaration (dice.yaml) may name, at the same path. A dial is
//            look (per-viewer: light, camera, pacing) or film (feeds the
//            shared bake: physics, toss, spawn, table geometry), and says
//            when a write lands: frame / roll / apply / reload.
//   createTune — the live tree. SHIPPED is defaults ⊕ declared, frozen;
//            T is its mutable clone, the one object every consumer reads.
//            `set` is THE writer (panel, hooks, paste all come through it)
//            and refuses unknown paths, the static leaves (STATIC_PATHS),
//            film writes while the film is locked, type changes and enum
//            values outside the list.
//
// Defaults here are the SHIPPED values of the objects they mirror in
// main.js / places.js / faelife.js as of 2026-09-02. tests/tune.test.mjs
// pins dice.yaml to them, so a default that drifts from the file fails
// the drift test in whichever direction it drifted.
//
// NO BOOLEANS (Joe, revision 3). A two-state value is an enum with two
// named states — `state: enabled | disabled`, `prefer: dice | table` — so
// `pick` is the only way to declare one and createTune throws on a boolean
// anywhere. AND NO STATE IS A BOOLEAN WORD: an enum state is never one of
// `true false yes no on off y n` in any case, because the YAML reader
// refuses those as booleans (js/yaml.js), so a state spelled `on` could
// only be written quoted and read back as a string that LOOKS like a flag —
// 2026-09-02, the first draft of dice.yaml did exactly that and apologised
// for it in a comment. The state says what it means, or it is not a state.
//
// THE DECLARATION IS CHECKED AT BIRTH, AND THE CODE IS THE FALLBACK. A live
// edit of dice.yaml reaches createTune unreviewed (server.js re-reads on
// every request, and keeps last-good only for PARSE errors), so the merge
// DROPS, per path, a declared value whose type disagrees with its dial, an
// enum value outside the options, a map where the tree has a dial and a
// scalar where it has a map — the default stands, one console line names
// the path (DEVMODE §3, §6), and `tune.refusals` holds every drop for the
// panel. It never throws for a bad value: a throw here happens during
// main.js module evaluation and blanks the whole table for one dead dial.
// Without the check the dial would be born dead anyway: SHIPPED would hold
// the wrong type and every set() on it would be refused with no message. A
// null at a dial (`y:` with nothing after it) is ABSENT, not a value: the
// default stands, which is what "every leaf is optional" means. Keys
// containing a dot are dropped the same way — every path in this module is
// also a dotted string, and a dot inside a key would make it ambiguous; the
// asset ids that arrived with `felts:` (ASSET_ID_RE) carry the same rule and
// say more about why beside it. A boolean
// anywhere still throws: the YAML reader refuses booleans at parse, so one
// can only arrive from code, and that is a programming error.
//
// BINDERS RUN AFTER THE WHOLE PATCH LANDS. The binder DEVMODE §5 prescribes
// is `bind('light.*', () => applyMoodLights())` — a re-apply that reads T,
// not the (path, value) it is handed — so every accepted leaf of a patch is
// written into T first and each distinct binder runs once afterwards.
// Running it at the first covered leaf would show the scene a T that the
// later leaves of the same Reset, Paste or multi-leaf set had not reached.

import { parseYaml, patchYaml, emitYaml, toPath, pathKey } from './yaml.js';

export { toPath, pathKey };

const READS = ['frame', 'roll', 'apply', 'reload'];
const CLASSES = ['look', 'film'];

// A LAW IS THE CHECK A RANGE CANNOT MAKE (phase D4, 2026-09-03). A dial's
// `range` is the SLIDER's and never the value's — the number field beside it
// takes any finite value on purpose, "because the range was wrong is a thing
// developer mode exists to discover" (DEVMODE §5). Two kinds of value are not
// like that, and both were found by typing one in:
//
//   · one the code DIVIDES BY. `pace.tempo.k` is the projector's speed and
//     js/main.js:5004 gates the impact drain on `IMPACT_MIN_GAP_MS / TEMPO.k`;
//     at 0 that gap is Infinity and every landing goes silent, at −1 the
//     projector runs the film backwards. The slider floor (0.25) says so; a
//     typed 0 walked straight past it.
//   · one that has to hold against ANOTHER leaf. `cards.standoff` and
//     `cards.depth` are two dials and one geometry: a card stands OUTBOARD of
//     the rim by construction (js/places.js `seatAnchor` — "the whole card is
//     outboard of a wall plane at EVERY θ and EVERY mat"), which is what
//     licenses its depthWrite, its real shadow and the seating raycast. No
//     range over either one alone can say that.
//
// `holds(v, path, read)`. `read(dottedPath)` answers what the WHOLE patch
// proposes — this patch's own entry where it names the path, T's otherwise —
// so a pair law judges `{ 'cards.standoff': 2, 'cards.depth': 3.9 }` as the
// pair it is and not in whichever order `Object.entries` handed the two over.
// A `pair` law is the one that needs it; a single-value law ignores `read`
// and so can also be run at BIRTH, inside `judge`, over the declaration.
export const LAWS = Object.freeze({
  positive: Object.freeze({
    reason: 'range-law',
    pair: false,
    why: 'must be greater than zero — the code divides by it',
    holds: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  }),

  // A PATH INTO `models/`, AND NOWHERE ELSE (phase E2, 2026-09-03). A felt
  // row may now name an IMAGE for its cloth (`texture: models/mats/linen.png`),
  // which is the first leaf in this file that is a URL the browser FETCHES
  // rather than a number the app reads. Two halves, and only the first is
  // about safety:
  //   · `models/` is the one directory of assets server.js serves and
  //     `.gcloudignore` ships (APP_DIRS), so a path outside it is a row that
  //     works on the author's disk and 404s for everybody else — the failure
  //     this project keeps naming, where it looked right so nothing said it
  //     was wrong. A path that escapes with `..` is the same mistake with a
  //     traversal attached.
  //   · the empty string is a REAL answer and the one nine mats give: a cloth
  //     painted by code says nothing about a texture. It is the dial's default
  //     for that reason, and the law has to let it through.
  //
  // AND NO `%` AT ALL (the E2 review, 2026-09-03). `models/%2e%2e/%2e%2e/etc/
  // passwd` starts with `models/` and contains no literal `..`, so the law as
  // first written accepted a path whose own `why` said it did not — server.js
  // `safeResolve` decodes before it splits and 403s it, so nothing was ever
  // reachable through it, but a law that holds less than its sentence says is
  // a law a reader is wrong to trust. A percent-escape is refused outright
  // rather than decoded and re-checked: no asset in this tree needs one, and
  // "the path is the path" is a rule that survives being read quickly.
  assetPath: Object.freeze({
    reason: 'path',
    pair: false,
    why: 'must be a path under `models/` (the one asset directory the server serves), '
      + 'with no `..` and no percent-escape',
    holds: (v) => typeof v === 'string'
      && (v === '' || (v.startsWith('models/') && !v.includes('..') && !v.includes('%'))),
  }),
  // standoff − depth/2 is the clear ground between the rim and the card's
  // inner edge (js/places.js `PLACARD_CLEAR`, 0.10 at the shipped pair). At 0
  // the card touches the rim; below it a die can reach a card.
  cardClear: Object.freeze({
    reason: 'geometry',
    pair: true,
    why: 'a card stands outboard of the rim: cards.standoff − cards.depth / 2 may not go below 0',
    holds: (v, path, read) => {
      const clear = Number(read('cards.standoff')) - Number(read('cards.depth')) / 2;
      // A hair of slack for the sliders' own arithmetic: 0.83 − 1.66/2 is
      // 0.83 − 0.83 in decimal and −1.1e-16 in doubles.
      return Number.isFinite(clear) && clear >= -1e-9;
    },
  }),
});

function dial(label, def, range, options, cls, read, why, law) {
  if (typeof label !== 'string' || !label) throw new Error('dial: label is required');
  if (!CLASSES.includes(cls)) throw new Error(`dial ${label}: cls must be look|film, got ${cls}`);
  if (!READS.includes(read)) throw new Error(`dial ${label}: read must be one of ${READS.join('|')}, got ${read}`);
  const d = { label, def, range: range || null, cls, read, why: why || '' };
  if (options) d.options = options.slice();
  if (law !== null && law !== undefined) {
    if (!Object.hasOwn(LAWS, law)) throw new Error(`dial ${label}: no law named ${JSON.stringify(law)}`);
    d.law = law;
  }
  return d;
}

// A per-viewer dial: light, fog, camera, pacing, chrome. Never locks.
export function look(label, def, range, read, why = '', law = null) {
  return dial(label, def, range, null, 'look', read, why, law);
}

// A dial that feeds the shared bake. Live at a table of one; locked when a
// second viewer is present (GOALPOST 2: no forked film).
export function film(label, def, range, read, why = '', law = null) {
  return dial(label, def, range, null, 'film', read, why, law);
}

// An enum. `options` is the law: `set` refuses a value outside it.
export function pick(label, def, options, cls, read, why = '') {
  if (!Array.isArray(options) || options.length < 2) throw new Error(`dial ${label}: an enum needs at least two options`);
  return dial(label, def, null, options, cls, read, why);
}

// A LIST-VALUED DIAL — one dial for a whole array, because the array is the
// unit the code reads (a dice set's six-entry face table, a particle recipe's
// palette). `each` is the law for an ENTRY when the entries come from a fixed
// vocabulary (js/dice.js FACE_SHAPES plus the digits) and null when they do
// not (a palette is colours, and there is no list of legal colours). The
// whole array replaces — `merge` and `set` have never merged one, and half a
// face table is not a face table.
//
// A NULL `each` IS NOT "NO LAW AT ALL" (the D1 review, 2026-09-03). It said
// here that "a palette is colours, and there is no list of legal colours",
// which is true and was read as license: `judge` fell straight through, so
// `colors: [null]`, `colors: []` and `colors: [1, 2]` all landed — in the
// declaration, through `tune.set` and through the armed write route — and
// js/particles.js and js/decals.js then handed a number to `hexRGB`. "Not a
// fixed vocabulary" is not "not even a string", so every entry of every list
// dial is a string, and `len` is the second half of the law: how many entries
// the CODE reads (six faces; one or two decal colours, because js/decals.js
// reads `colors[0]` and `colors[1] || colors[0]` and nothing else; one to
// eight particle colours, because js/particles.js picks from the whole
// palette). Reasons: 'type' for an entry, 'range' for a length.
export function list(label, def, each, len, cls, read, why = '') {
  if (!Array.isArray(def)) throw new Error(`dial ${label}: a list dial's def must be an array`);
  if (each !== null && (!Array.isArray(each) || each.length < 2)) {
    throw new Error(`dial ${label}: each must be null or at least two entries`);
  }
  if (!Array.isArray(len) || len.length !== 2 || !(len[0] >= 1) || !(len[1] >= len[0])) {
    throw new Error(`dial ${label}: len must be [min, max] with 1 <= min <= max`);
  }
  if (def.length < len[0] || def.length > len[1]) throw new Error(`dial ${label}: the default is outside len`);
  const d = dial(label, def.slice(), null, null, cls, read, why);
  if (each) d.each = each.slice();
  d.len = len.slice();
  return d;
}

export function isDial(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x)
    && typeof x.label === 'string' && 'def' in x
    && CLASSES.includes(x.cls) && READS.includes(x.read);
}

// Is `v` a legal reading of dial `d`? Null is ABSENT everywhere in this
// design and never reaches here. Returns null, or the refusal reason —
// 'shape' (a map where the dial is a value), 'type', 'option', 'range' (a
// list dial's entry count). ONE judge, so
// `reconcile`, `reconcileFields`, `apply` and `addRow` cannot drift apart:
// before list dials existed each of the four re-implemented the check, and
// `each` would have had to be added to all four.
function judge(d, v) {
  const want = typeOf(d.def);
  if (isPlain(v)) return want === 'object' ? null : 'shape';
  if (typeOf(v) !== want || (want === 'number' && !Number.isFinite(v))) return 'type';
  if (want === 'array') {
    if (d.len && (v.length < d.len[0] || v.length > d.len[1])) return 'range';
    if (!v.every((e) => typeof e === 'string')) return 'type';
    if (d.each && !v.every((e) => d.each.includes(e))) return 'option';
    return null;
  }
  if (d.options && !d.options.includes(v)) return 'option';
  // A SINGLE-VALUE LAW IS JUDGED AT BIRTH TOO (phase D4). `positive` needs
  // nothing but the value, so the declaration can be held to it here and a
  // `k: 0` in dice.yaml is dropped with the default standing, exactly as a
  // wrong type is. A PAIR law cannot be answered from one leaf and is judged
  // where both are known: `apply`, and `checkLawPairs` at createTune.
  if (d.law && !LAWS[d.law].pair && !LAWS[d.law].holds(v)) return LAWS[d.law].reason;
  return null;
}

// The same judgement as a sentence, for the console line a dropped
// declaration leaf prints.
function judgeWhy(d, v, reason) {
  const want = typeOf(d.def);
  if (d.law && reason === LAWS[d.law].reason) return `${LAWS[d.law].why}; the default stands`;
  if (reason === 'shape') return `expected ${want}, got a map; the default stands`;
  if (reason === 'range') return `takes ${d.len[0] === d.len[1] ? d.len[0] : `${d.len[0]}-${d.len[1]}`} entries, got ${Array.isArray(v) ? v.length : 0}; the default stands`;
  // 'type' at a list dial is two different sentences: the value is not a list
  // at all, or it is a list holding something that is not a string.
  if (want === 'array' && reason === 'type' && Array.isArray(v)) {
    return `every entry must be a string, got ${JSON.stringify(v)}; the default stands`;
  }
  if (reason === 'type') return `expected ${want}, got ${JSON.stringify(v)}; the default stands`;
  if (d.each) return `every entry must be one of ${d.each.join('|')}, got ${JSON.stringify(v)}; the default stands`;
  return `expected one of ${d.options.join('|')}, got ${JSON.stringify(v)}; the default stands`;
}

const isPlain = (x) => !!x && typeof x === 'object' && !Array.isArray(x)
  && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);

// The dial tree with every dial replaced by its default.
export function defaultsOf(dials) {
  const out = {};
  for (const [k, v] of Object.entries(dials)) {
    if (isDial(v)) out[k] = Array.isArray(v.def) ? v.def.slice() : v.def;
    else if (isPlain(v)) out[k] = defaultsOf(v);
    else out[k] = v;
  }
  return out;
}

// Deep merge; `over` wins; only plain objects recurse — arrays and every
// other value replace. Neither input is mutated.
export function merge(base, over) {
  const out = {};
  if (isPlain(base)) for (const [k, v] of Object.entries(base)) out[k] = cloneVal(v);
  if (isPlain(over)) {
    for (const [k, v] of Object.entries(over)) {
      if (isPlain(v) && isPlain(out[k])) out[k] = merge(out[k], v);
      else out[k] = cloneVal(v);
    }
  }
  return out;
}

function cloneVal(v) {
  if (isPlain(v)) return merge(v, {});
  if (Array.isArray(v)) return v.map(cloneVal);
  return v;
}

// Every leaf path in a tree, in tree order. A leaf is anything that is not
// a plain object (arrays count as leaves; `merge` replaces them whole).
export function leaves(tree, prefix = []) {
  const out = [];
  if (!isPlain(tree)) return out;
  for (const [k, v] of Object.entries(tree)) {
    if (isPlain(v)) out.push(...leaves(v, prefix.concat(k)));
    else out.push(prefix.concat(k));
  }
  return out;
}

export function getLeaf(tree, path) {
  let cur = tree;
  for (const k of toPath(path)) {
    if (!isPlain(cur) || !Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

export function hasLeaf(tree, path) {
  const p = toPath(path);
  if (!p.length) return false;
  let cur = tree;
  for (const k of p) {
    if (!isPlain(cur) || !Object.prototype.hasOwnProperty.call(cur, k)) return false;
    cur = cur[k];
  }
  return !isPlain(cur);
}

// Sets a leaf, creating intermediate maps. Throws when the path runs
// through an existing scalar.
export function setLeaf(tree, path, v) {
  const p = toPath(path);
  if (!p.length) throw new Error('setLeaf: empty path');
  let cur = tree;
  for (let i = 0; i < p.length - 1; i++) {
    const k = p[i];
    if (!Object.prototype.hasOwnProperty.call(cur, k) || cur[k] === undefined) cur[k] = {};
    else if (!isPlain(cur[k])) throw new Error(`setLeaf: ${p.slice(0, i + 1).join('.')} is a scalar`);
    cur = cur[k];
  }
  cur[p[p.length - 1]] = v;
  return tree;
}

// Deletes the leaf (or the whole node) at `path` from its parent map. The
// mirror of `setLeaf` for the one caller that has to UNDO a write rather than
// put a value back: a minted asset field had no previous value, and writing
// `undefined` over it would leave a key `leaves` still walks.
export function dropLeaf(tree, path) {
  const p = toPath(path);
  if (!p.length) throw new Error('dropLeaf: empty path');
  const owner = p.length === 1 ? tree : getLeaf(tree, p.slice(0, -1));
  if (isPlain(owner)) delete owner[p[p.length - 1]];
  return tree;
}

// THE PAIR-LAW GROUPS OF A DIAL TREE: law name → the leaf paths carrying it.
// "Which leaves are ONE claim" is a question about the dial tree, and there
// has to be exactly one answer to it — until the D4 review there were two
// walks asking it (`checkLawPairs` here and `judgePairs` in
// js/dice-apply-core.js) and a third place that needed it and did not ask
// (`reset`), which is three chances to disagree about the same sentence.
// `defaults` is only how the walk finds the leaves; pass the one you have.
// The answer is a fact about the DIAL TREE and nothing else, so it is cached
// by that tree's identity and the returned Map is shared — read it, never
// write it. (`reset` asks once per leaf it is putting back, and the dial tree
// is some five hundred leaves.)
const PAIR_CACHE = new WeakMap();
export function pairGroups(dials, defaults = null) {
  const had = PAIR_CACHE.get(dials);
  if (had) return had;
  const groups = new Map();
  for (const p of leaves(defaults || defaultsFor(dials))) {
    const d = getLeaf(dials, p);
    if (!isDial(d) || !d.law || !LAWS[d.law].pair) continue;
    if (!groups.has(d.law)) groups.set(d.law, []);
    groups.get(d.law).push(p);
  }
  PAIR_CACHE.set(dials, groups);
  return groups;
}

// The shallowest node `setLeaf(tree, path, …)` would have to CREATE — the
// first segment that is not already a map — or the leaf's own path when every
// group along the way is there. It is what a rollback deletes, so a write of
// `…ivory.geo.bevel` into a set with no `geo:` takes the whole `geo` away
// again rather than leaving an empty group behind.
function mintedAt(tree, path) {
  const p = toPath(path);
  for (let i = 1; i < p.length; i++) if (!isPlain(getLeaf(tree, p.slice(0, i)))) return p.slice(0, i);
  return p.slice();
}

// An accessor view over a tree: `alias(T, { lampY: 'light.lamp.y' })` gives
// an object whose `lampY` reads and writes `T.light.lamp.y`. Getters are
// enumerable, so `{ ...view }` and `Object.assign(view, patch)` both work,
// which is what lets a tune object such as MOOD.tune keep its identity and
// its existing hooks while its values live in the declaration.
export function alias(tree, map) {
  const view = {};
  for (const [name, path] of Object.entries(map)) {
    const p = toPath(path);
    Object.defineProperty(view, name, {
      enumerable: true,
      configurable: false,
      get: () => getLeaf(tree, p),
      set: (v) => { setLeaf(tree, p, v); },
    });
  }
  return view;
}

// No dial may reach the RNG, the values, the faces, the seed or the clock
// (GOALPOST 2). The unit test walks every dial path against this.
export const FORBIDDEN_LEAF = /(^|[^a-z])(rng|value|values|face|faces|seed|fixedDt)([^a-z]|$)/i;

// THE STATIC LEAVES: declared, drawn, never written by a running tab.
// `app.mode` is the production switch (DEVMODE §4: "not a dial: no panel
// control writes it … a Save from a running dev session can never flip
// it"). The panel already drew it static and skipped it on Reset, but the
// refusal has to live at THE writer, or it is not a refusal: 2026-09-02 the
// B3 review flipped it from the console (`tuneSet({'app.mode':
// 'production'})`) and from the panel's own Paste box, and both escaped —
// every mutating hook went null, the backtick stopped folding, and
// Download carried `mode: production` to disk. `set`, `reset` and
// `applyPatchText` all run through `apply`, so one check here covers every
// door; the reason is 'static'. The list is exported so devmode.js draws
// the same leaves static that this refuses, from one source.
export const STATIC_PATHS = Object.freeze(['app.mode']);

// ---------------------------------------------------------------------------
// ASSET SECTIONS (docs/DEVMODE.md §9, phase C4) — the second kind of thing a
// declaration holds.
// ---------------------------------------------------------------------------
//
// A DIAL IS A LEAF AT A FIXED PATH; AN ASSET IS A ROW AT AN ID YOU CHOOSE.
// `light.lamp.y` is one number the app has always had; `felts.house-moss` is
// a felt that did not exist until somebody wrote it down. The dial tree
// cannot carry the second — there is no path to put a dial at — so an asset
// section is declared by its ROW SHAPE instead: `ASSET_ROWS[section]` is a
// map of dials, one per field, and every row in that section is those fields.
// Everything else follows from that one move: `dialAt` resolves
// `felts.<id>.cloth` to the row's `cloth` dial, so `set` type-checks and
// enum-checks an asset field exactly as it checks a dial; the declaration is
// reconciled at birth the same way; and js/dice-apply-core.js's validator —
// the one both the apply tool and the armed Save route run — accepts an asset
// leaf without a second idea of what a legal value is.
//
// NO DOT IN AN ID, and that is a narrowing of the design sketch (DEVMODE §3
// wrote `house.moss`). Every path in this module, in `changes()`, in the
// panel's rows and in what the Save route posts is a DOTTED STRING, so an id
// with a dot in it stops being one path and becomes two readings of one
// string — and the flat `{ path: value }` map the route was built around has
// nowhere to say which was meant.
//
// THE DICE CATALOGUE WAS THE CASE THIS WAS GOING TO BREAK ON, and it did not
// (phase D1, 2026-09-03). C4 wrote here that the day the rule would have to be
// lifted "is when `sets:` arrives, because a dice-set id genuinely carries
// dots today (`emberforge.blackanvil`)". It arrived, and the dot turned out to
// be a JOIN and not an id: js/themes.js has ALWAYS been two levels — a HOUSE
// holding SETS — and `emberforge.blackanvil` is the flattened wire key it
// builds, not something anybody wrote down. So the declaration keeps the two
// levels it already had (`houses.emberforge.dice.blackanvil`), every id stays
// dotless, and what a section grew instead is DEPTH: a row's field may be a
// nested group of dials (`geo`, `feel`) or a COLLECTION OF FURTHER ROWS
// (`rows(RECIPE)` — a house's `dice`). One walk resolves any of it.
//
// A SECTION IS EITHER FILLED OR SPARSE (ASSET_SPARSE). A felt row is FILLED:
// six fields, all of them meaningful, so a row the file half-writes takes the
// defaults for the rest and the merge site never guesses. A dice recipe is
// SPARSE, and has to be, because in js/themes.js's own words "a set uses
// whichever it earns; every one is optional" — a recipe that arrived filled
// out would give every set in the catalogue particles, a decal, a parented
// light and a rest cadence it was written to REFUSE, and restraint is the one
// thing that file says is also identity. Absent stays absent; the dial's `def`
// is the code's own fallback, and is what the panel shows in an empty field.
//
// AND A PRESET IS A ROW WHOSE SHAPE IS THE DIAL TREE (phase D4, 2026-09-03).
// `presets:` is the third section and the odd one: its rows are not a kind of
// thing the app draws, they are named PATCHES — `presets: { dusk: { light: {
// lamp: { y: 30 } } } }` — so the shape a preset's fields are judged against
// is `DIALS` itself, and the machinery above needs no new idea to carry one.
// `assetDialFor('presets.dusk.light.lamp.y')` walks the row id and then the
// dial tree and answers the lamp-height dial, so a preset's every leaf is
// type-checked, enum-checked and film-classed by the same one judge, in the
// browser, in `tools/dice-apply.mjs` and on the armed Save route alike. It is
// SPARSE for the obvious reason: a preset says the three leaves it moves, and
// a filled one would be the whole declaration written twice.
export const ASSET_SECTIONS = Object.freeze(['houses', 'felts', 'presets']);
export const ASSET_SPARSE = Object.freeze(['houses', 'presets']);
// A row id: lower-case, digits, `-` and `_`, 32 characters. The house prefix
// (`house-`) is a CONVENTION and not enforced here — what protects a row the
// FILE already declares is that the WRITERS refuse it by name (js/main.js
// `devFeltAdd`, `devSetClone`), because `addRow` writes a row WHOLE: an Add at
// `taproom` would not merge into the shipped mat, it would replace it, with
// every field the caller left out arriving as a row default. (Rewritten
// 2026-09-03, phase E1: this used to name a collision check inside
// `feltThemesSync`, a merge site that stopped existing when the mats moved out
// of js/main.js and into `felts:` — there is no longer a place where a shipped
// row stands apart from a declared one.)
export const ASSET_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const ASSET_ID_WHY = 'lower-case letters, digits, "-" and "_", 32 characters, no dot';

// A COLLECTION OF ROWS INSIDE A ROW. A house is a row; the sets it holds are
// rows too, at ids the file chooses, so `dice:` cannot be a map of dials —
// there is no path to put one at. `rows(SHAPE)` marks the field as "more of
// the same, one level down", and the walk below alternates row id / field for
// as many levels as a section declares.
export function rows(label, shape, why = '') {
  if (!isPlain(shape)) throw new Error(`rows ${label}: shape must be a map of dials`);
  return Object.freeze({ label, rows: shape, why });
}
export function isRows(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x) && isPlain(x.rows);
}

// A SPARSE GROUP INSIDE A FILLED ROW (phase E2, 2026-09-03). `ASSET_SPARSE` is
// a property of a SECTION, and that was enough while a row's fields were flat.
// E2 gave a felt row two nested groups — `gloss` and `sound` — whose defaults
// are not written in this file at all: they are the CLOTH's rows (js/main.js
// FELT_GLOSS, js/voices.js CLOTH_VOICES), and which one applies depends on the
// row's own `cloth` field. So "absent" here does not mean "take the dial's
// def"; it means "the cloth answers", and a filled group would answer for it —
// eleven mats would arrive carrying wool's gloss numbers, silt and oak
// included, and the migration would change the look of two shipped surfaces
// while every test said the file had not moved.
//
// So the group fills NOTHING and is otherwise an ordinary map of dials: it is
// walked, judged, minted and reverted exactly as `feel` or `geo` is. The
// dial's `def` is still required and is still shown in the panel — it is the
// `felt` row's value, the reference every cloth is measured against — but it
// is a READOUT there, never a value the file gains by being reconciled.
export function sparse(label, shape, why = '') {
  if (!isPlain(shape)) throw new Error(`sparse ${label}: shape must be a map of dials`);
  return Object.freeze({ label, sparse: shape, why });
}
export function isSparse(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x) && isPlain(x.sparse);
}

// THE FELT ROW — js/main.js's `FELT_THEMES` row, field for field, as dials.
// `mottle` and `breath` are absent from most shipped rows and mean 1 there
// (main.js: "absent means 1, the shipped beat"), so 1 is the default here and
// a row that says nothing about them gets the shipped behaviour.
//
// `cloth` NAMES A PAINTER AND THE PAINTERS ARE CODE (DEVMODE §9: "Code-only
// stays code-only"). The options are the four in main.js's FELT_CLOTHS; a
// fifth cloth is a function somebody writes, and then a line here.
//
// …AND `image` IS THE ONE THAT TAKES ITS PICTURE FROM THE FILE (phase E2,
// 2026-09-03). Joe: "make a new mat as YAML-only as a new dice set is now."
// E1 moved the ROWS into dice.yaml and left every SURFACE in code, so a new
// mat was still one of three cloths in a new colour — the "one mat in nine
// colours" complaint the cloth registry was built to answer, one level up. A
// row that names `cloth: image` and a `texture:` under `models/` is a mat
// nobody wrote a painter for, and the three fields below (`texture`, `tile`,
// and the two groups) are the whole of what makes it a surface rather than a
// picture: how big the weave is, how it answers the lamp, and what a die
// sounds like landing on it.
const FELT_ROW = Object.freeze({
  name: look('name', 'House felt', null, 'apply', 'what the swatch is called in the picker'),
  cloth: pick('cloth', 'felt', ['felt', 'silt', 'oak', 'image'], 'look', 'apply',
    'the painter this mat is made of — main.js FELT_CLOTHS; `image` takes its picture from `texture` below, and a new painter is code, not a row'),
  feltBase: look('felt base', '#1c1c24', null, 'apply', 'the cloth\'s own colour, and the seed its grain is drawn from — an image mat MULTIPLIES it, so it is the tint as well as the swatch'),
  // `scene bg`, not `scene background`: the label column is 320px of mono and
  // the long form measured as "scene back…", which is the half that says
  // nothing. The sentence lives in the tooltip, where there is room for it.
  sceneBg: look('scene bg', '#0f0f13', null, 'apply', 'the room behind the table, and the fog\'s colour'),
  breath: look('breath depth', 1, [0, 2, 0.05], 'apply',
    'how far this cloth takes the declare beat — a darker cloth has less light to lose, so it must lose more of it'),
  mottle: look('mottle', 1, [0, 2, 0.05], 'apply', 'how unevenly the nap catches the light; a raked bed wants less'),

  // THE IMAGE CLOTH'S TWO FIELDS. Both are inert for a painted cloth and the
  // panel says so rather than hiding them: a row that says `cloth: felt` and
  // carries a texture path is a row somebody is halfway through changing.
  //
  // THE PATH RIDES NOWHERE (E2's wire rule). A felt id is room state and goes
  // over the wire; a texture path never does. Every client reads the same
  // dice.yaml through /js/tunables.js and fetches the same `models/` path from
  // the same origin, so there is nothing to send and nothing a peer could be
  // told that it could not already read. That is also why the law below is
  // about the DEPLOY (`models/` is what `.gcloudignore` ships and server.js
  // serves) rather than about trust.
  texture: look('texture', '', null, 'apply',
    'the image tiled over the mat, under `models/` — only read when `cloth` is `image`, and empty everywhere else',
    'assetPath'),
  // THE RANGE IS THE MODEL'S RANGE, AND THE STEP IS A SHIPPED VALUE'S (the E2
  // review, 2026-09-03). js/main.js `feltTileReps` is
  // `round(FELT_TILE_U / tile)` — a whole number of repeats across the tile,
  // because a fractional one is a seam every five units in a grid — so this
  // dial is continuous over a model that is not, and the first range written
  // for it was wrong at both ends:
  //   · step 0.5 could not express `linen`'s own 1.25. The slider drew it as
  //     1.5 and ONE `change` on it — a click, an arrow key, a drag released
  //     where it started — rewrote the shipped mat to 1.5, which is three
  //     repeats instead of four and so no longer one image pixel per texel:
  //     the exact property dice.yaml and tests/felts-catalogue.test.mjs both
  //     state. 0.05 lands on 1.25, on 2.5 and on 1.
  //   · everything past 10/3 rounds to one repeat, so a top of 40 was 32
  //     units of dial that all meant the same picture. 5 IS one repeat — the
  //     tile size every painted cloth is authored at — and it is the coarsest
  //     thing this floor can say.
  tile: look('tile', 5, [0.25, 5, 0.05], 'apply',
    'world units one repeat of the texture covers, snapped to a whole number of repeats across the 5-unit felt tile (main.js FELT_TILE_U); 1.25 draws a 256px picture at one image pixel per texel, 5 stretches it over the whole tile',
    'positive'),

  // ---- what the cloth does to the lamp, and to a landing --------------------
  //
  // BOTH GROUPS ARE SPARSE, AND THAT IS THE WHOLE DESIGN (see `sparse` above).
  // The defaults are not these numbers: they are the CLOTH's rows, which is
  // what makes silt matte and oak long-tailed without a single mat saying so.
  // A row that names neither group behaves byte for byte as it did before E2 —
  // by construction, not by care — and a row that names one field of one group
  // overrides that field and inherits the other five.
  //
  // The `def` shown here is the `felt` row of each registry: the reference
  // every other cloth was measured against (js/main.js FELT_GLOSS, js/voices.js
  // CLOTH_VOICES §4b), and the honest thing for a panel to show as "the
  // default" when the row is silent about a cloth it cannot know.
  gloss: sparse('gloss', {
    mid: look('gloss mid', 0.91, [0, 1, 0.005], 'apply',
      'the mat\'s mean roughness — LOWER is glossier; the map carries the value and the material\'s scalar is pinned at 1'),
    swing: look('gloss swing', 0.110, [0, 0.4, 0.005], 'apply',
      'how far the polished and dull patches swing either side of `mid`; past about 8 sRGB code values the gloss stops being the mottle\'s companion and becomes the mat\'s dominant structure'),
  }, 'how this cloth answers the lamp; absent means the painter\'s own row (main.js FELT_GLOSS)'),

  // js/voices.js §4b names every one of these and says what it is FOR; the
  // `why` strings here are that file's own sentences, cut to a tooltip.
  sound: sparse('sound', {
    centre: look('centre', 1, [0.2, 2.5, 0.01], 'apply',
      'spectral trim on the landing and its tail — how much of the contact the surface swallows before it can resonate'),
    length: look('length', 1, [0.2, 2.5, 0.01], 'apply',
      'envelope trim, in the same direction and for the same reason'),
    gain: look('level', 1, [0, 1, 0.01], 'apply',
      'plain absorption, and THE ONE DIAL CAPPED AT 1: §5\'s mix plan is a ceiling applied before this multiply, so a cloth may only ever take away from it'),
    // …AND THE TOP OF THIS ONE IS A CLAMP, not a taste (the E2 review,
    // 2026-09-03). The settle cluster is geometric: `ratio = TAP_E (0.42) *
    // tail`, so at tail 2.381 the ratio reaches 1 and the taps stop decaying
    // — and past it they GROW. At the 2.5 this range first shipped, the
    // sixteenth tap was 2.08x the first and louder than the landing itself,
    // over two seconds of "tail". js/voices.js `CLOTH_TAIL_MAX` is the cap
    // that holds against a hand-edited dice.yaml (the same reasoning as
    // `gain`'s, one dial up); this range stops where that cap does, so the
    // slider cannot ask for a value the mixer will quietly take back.
    tail: look('tail', 1, [0.1, 2.26, 0.01], 'apply',
      'multiplies the settle cluster\'s geometric ratio, and so decides HOW MANY TAPS THERE ARE — felt gives a die four bounces back, grain catches it, a plank hands it back twelve times'),
    grind: look('grind', 1, [0.2, 3, 0.01], 'apply',
      'the sustained layer\'s spectral factor, and the one number here that goes UP for a soft surface: down for the knock, up for the scrape, and the pair is the material'),
    fizz: look('fizz', 0, [0, 0.95, 0.01], 'apply',
      'how much of the face-clack modulation the surface smothers — the whole "grind becomes a hiss" move, at one multiply'),
  }, 'what a die sounds like landing on this cloth; absent means the painter\'s own voice (js/voices.js CLOTH_VOICES)'),
});

// ---------------------------------------------------------------------------
// THE DICE RECIPE (phase D1) — js/themes.js's set recipe, field for field.
// ---------------------------------------------------------------------------
//
// EVERY DEFAULT HERE IS THE CODE'S OWN FALLBACK WHEN THE FIELD IS ABSENT, read
// out of js/dice.js (`materialFor`, `buildDie`, `buildBeveledGeometry`,
// `bakeMaps`), js/voices.js, js/post.js and js/dielights.js — NOT a value
// somebody thought looked nice. That is what makes an empty field in the panel
// honest: it shows what the die is already doing.
//
// LOOK, ALL OF IT BUT ONE. A set is a SKIN over dice.js's (type, variant)
// seam: js/themes.js's own header says "Geometry, physics and value reading
// are untouched (a set can never change how a die lands)", and dice.js says it
// twice more — createDieBody and readValue always use the std entry. So a
// recipe cannot fork the film and every dial here is per-viewer chrome.
//
// THE ONE EXCEPTION IS `faces`, AND IT IS FILM. A face table is not a value —
// the server still rolls 1..6 and the entry is a READING of the number it
// rolled (js/rollspec.js: the table "is already per-die on the wire") — but it
// is a reading two clients have to agree on. One tab whose `claw` face is a
// `5` is one tab looking at a different roll, which is exactly what GOALPOST 2
// forbids, so it locks the moment a second seat is present. FORBIDDEN_LEAF
// bites the word `faces` and stays that way: it is the law for the DIAL TREE,
// where a fixed path named `faces` could only be the rolled values themselves.
// tests/tune.test.mjs names this one row as the exemption, with this reason.
//
// FACE ENTRIES: a digit paints as a digit and everything else as a drawn
// symbol (js/dice.js FACE_SHAPES). d6 only — dice.js applies the table only
// when `type === 'd6'`, because six entries leave fourteen faces of a d20
// undecided.
const FACE_ENTRIES = Object.freeze(
  ['1', '2', '3', '4', '5', '6', 'bolt', 'claw', 'heart', 'plus', 'minus', 'blank']);
// js/voices.js IMPACT_VOICES, in its own order. `felt` is IMPACT_DEFAULT_BODY
// — the contact every unthemed die already makes — so it is the default here.
const SOUND_BODIES = Object.freeze(['felt', 'click', 'chime', 'bell', 'thud', 'crackle', 'clack', 'hush']);
// js/dice.js PATTERNS, js/particles.js KINDS, js/decals.js KIND_ROW,
// js/dielights.js's switch. Each is a FUNCTION somebody wrote: DEVMODE §9's
// "code-only stays code-only" — a fifth pattern is code, and then a word here.
const RELIEF_PATTERNS = Object.freeze(['hammer', 'grain', 'ferns', 'scrimshaw']);
const PARTICLE_KINDS = Object.freeze(['sparks', 'static', 'motes', 'fog', 'bubbles', 'dust', 'ash']);
const DECAL_KINDS = Object.freeze(['frost', 'ring', 'scorch', 'smudge']);
const DIE_LIGHT_MODES = Object.freeze(['steady', 'wave', 'breathe', 'flicker']);
// js/themes.js `rest`: four cadences, and `still` is an ASSERTION of stillness
// rather than the absence of a cadence ("Reject `rest: null` for the same
// slot — the sentinel makes 'this quiet is on purpose' visible").
const REST_KINDS = Object.freeze(['still', 'swell', 'creak', 'settle-tick']);
// js/placard.js STYLES / INK_MODES / INK_TONES — the name's three dresses and
// the ink's two behaviours (2026-09-04). Each is a WRITER somebody wrote, so a
// fourth dress is code and then a word here; this file cannot import the list
// it mirrors, because js/placard.js imports three and this module is read by
// server.js and the apply tool under Node. The two copies are pinned where a
// mirrored list can be pinned honestly — in the browser, by `placard-styles`,
// which walks every option here and asserts the rig comes back WEARING it.
const PLACARD_STYLES = Object.freeze(['tent', 'plate', 'inlay', 'stamp', 'embossed']);
const PLACARD_INK_MODES = Object.freeze(['steady', 'ghost']);
const PLACARD_INK_TONES = Object.freeze(['ink', 'chalk']);
// js/placard.js FLOURISHES — what the emboss puts either side of a name.
const PLACARD_FLOURISHES = Object.freeze(['full', 'rule', 'none']);

const RECIPE = Object.freeze({
  label: look('label', 'House set', null, 'apply', 'what the picker chip says'),
  line: look('line', '', null, 'apply',
    'this set\'s own one-line identity, where the house line does not say it (symbols.fate: "plus, minus, blank")'),

  // ---- palette: the three colours every set names first --------------------
  body: look('body', '#f3ead7', null, 'apply', 'the die\'s own colour (dice.js reads it as `color`)'),
  text: look('text', '#2a2018', null, 'apply', 'the numerals — legibility on the body is the one invariant a set may not trade'),
  accent: look('accent', '#d8c9a3', null, 'apply', 'the set\'s third colour; the picker chip and the lab tile paint with it'),

  // ---- material feel: dice.js materialFor ---------------------------------
  feel: {
    rough: look('roughness', 0.3, [0, 1, 0.01], 'apply', 'dice.js: `def.feel ? def.feel.rough : 0.3`'),
    metal: look('metalness', 0.1, [0, 1, 0.01], 'apply', 'dice.js: `def.feel ? def.feel.metal : 0.1`'),
  },
  // Whole-body emissive, subtle at rest. `glow: null` in the file is ABSENT,
  // which is the same falsy dice.js tests (`else if (!shroud && def.glow)`) —
  // three shipped sets write the null on purpose, to say the digits carry all
  // the light.
  glow: {
    color: look('glow colour', '#ffffff', null, 'apply', 'the emissive tint the whole body carries'),
    intensity: look('glow', 0.06, [0, 1, 0.01], 'apply', 'emissiveIntensity; the shipped sets sit at 0.04–0.09'),
  },

  // ---- the faces ----------------------------------------------------------
  glyph: pick('glyph', 'digit', ['digit', 'pip', 'faces'], 'look', 'apply',
    'digits · Vegas pips (d6; other types fall back to digits) · the `faces` table below'),
  faces: list('faces', ['1', '2', '3', '4', '5', '6'], FACE_ENTRIES, [6, 6], 'film', 'apply',
    'd6 only: one entry per VALUE — a digit paints as a digit, a name paints as a drawn symbol (dice.js FACE_SHAPES). The server still rolls 1..6; this is how the number is read, and both tabs must read it the same way'),

  // ---- Level 1: texture-space authoring (dice.js bakeMaps) ------------------
  maps: {
    digitGlow: {
      color: look('digit glow colour', '#ffd166', null, 'apply', 'emissiveMap of the DIGITS alone'),
      intensity: look('digit glow', 0.7, [0, 2, 0.05], 'apply', 'emissiveIntensity when the digits carry the light'),
    },
    relief: {
      pattern: pick('relief', 'grain', RELIEF_PATTERNS, 'look', 'apply',
        'the height sketch a normal map is drawn from (dice.js PATTERNS); absent = no normal map at all'),
      strength: look('relief strength', 0.5, [0, 2, 0.05], 'apply', 'dice.js: `def.maps.relief.strength || 0.5` on normalScale'),
      digitDepth: look('digit engrave', 0, [0, 1, 0.05], 'apply', 'how deep the numerals cut into the height sketch'),
      tint: look('relief tint', 0.4, [0, 1, 0.05], 'apply',
        'how much of the pattern overlays the COLOUR map, so relief reads face-on and not only when the light rakes (dice.js: `?? 0.4`)'),
    },
    roughPattern: pick('rough pattern', 'grain', RELIEF_PATTERNS, 'look', 'apply',
      'a roughnessMap of the same pattern over the set\'s base finish; absent = a flat finish'),
  },

  // ---- Level 2: shader injection (dice.js patchShader) --------------------
  shader: {
    fresnel: {
      color: look('rim colour', '#7fd9e8', null, 'apply', 'a glancing-angle rim added to the emissive'),
      power: look('rim power', 2.5, [0.5, 8, 0.1], 'apply', 'dice.js: `?? 2.5` — higher is a tighter rim'),
      intensity: look('rim', 0.8, [0, 2, 0.05], 'apply', 'dice.js: `?? 0.8`'),
    },
    flow: {
      speed: look('flow speed', 0.3, [0, 4, 0.05], 'apply', 'dice.js: `f.speed ?? 0.3`'),
      scale: look('flow scale', 10, [1, 40, 0.5], 'apply', 'noise frequency in map space (dice.js `?? 10`)'),
      floor: look('flow floor', 0.3, [0, 2, 0.05], 'apply', 'the non-molten branch\'s base level (dice.js `?? 0.3`)'),
      amp: look('flow amp', 1.8, [0, 6, 0.05], 'apply', 'the non-molten branch\'s swing (dice.js `?? 1.8`)'),
      cool: look('flow cool', '#5a1c06', null, 'apply', 'the molten branch\'s low colour — naming cool AND hot is what selects it'),
      hot: look('flow hot', '#fff2c8', null, 'apply', 'the molten branch\'s high colour'),
      gain: look('flow gain', 2, [0, 6, 0.05], 'apply', 'the molten branch\'s multiplier (dice.js `?? 2.0`)'),
    },
    dissolve: {
      edge: look('dissolve edge', '#cfe98c', null, 'apply', 'the burn line\'s colour while a die unmakes'),
    },
  },

  // ---- specular identity (three.js MeshPhysicalMaterial) ------------------
  spec: {
    clearcoat: look('clearcoat', 0, [0, 1, 0.01], 'apply', 'a lacquer layer over the body'),
    clearcoatRoughness: look('clearcoat roughness', 0.5, [0, 1, 0.01], 'apply', ''),
    iridescence: look('iridescence', 0, [0, 1, 0.01], 'apply', 'thin-film sheen; the 2026-08-04 pass calls a high value an oil slick'),
    iridescenceIOR: look('iridescence IOR', 1.3, [1, 2.4, 0.01], 'apply', ''),
    ior: look('IOR', 1.5, [1, 2.4, 0.01], 'apply', 'index of refraction — 1.75 reads as cut crystal'),
    specularIntensity: look('specular', 1, [0, 2, 0.01], 'apply', ''),
    specularColor: look('specular colour', '#ffffff', null, 'apply', 'the highlight\'s own tint — warm iron spark, cold glass'),
    envMapIntensity: look('environment', 1, [0, 3, 0.05], 'apply',
      'how much of the room the die reflects; an unhoused die is pinned to 0.35 either way (dice.js)'),
  },

  // ---- Level 3: impact-keyed particles (js/particles.js) ------------------
  particles: {
    kind: pick('particles', 'motes', PARTICLE_KINDS, 'look', 'apply',
      'each kind is a claim about why matter leaves a die; absent = the set sheds nothing, which is also identity'),
    colors: list('particle colours', ['#ffffff'], null, [1, 8], 'look', 'apply',
      'the palette a burst is drawn from — js/particles.js picks from all of it'),
    fadeTo: look('fade to', '#571b05', null, 'apply', 'sparks cool toward this before they die'),
    scale: look('particle scale', 1, [0, 3, 0.05], 'apply', 'count and size, against the kind\'s own budget'),
  },

  // ---- Level 4a: impact marks on the felt (js/decals.js) ------------------
  // The kill switch (DECALS_DEFAULT_ENABLED) is off table-wide; the recipe
  // fields survive because the machinery does.
  decal: {
    kind: pick('decal', 'ring', DECAL_KINDS, 'look', 'apply', 'what the die leaves on the cloth'),
    colors: list('decal colours', ['#ffffff', '#000000'], null, [1, 2], 'look', 'apply',
      'the mark\'s two colours; js/decals.js reads `colors[1] || colors[0]`, so one is a mark of one colour'),
    scale: look('decal scale', 1, [0, 3, 0.05], 'apply', ''),
    life: look('decal life', 6, [0, 30, 0.5], 'apply', 'seconds before the mark is gone'),
  },

  // ---- Level 3.5: geometry identity (dice.js buildBeveledGeometry) --------
  // The die the player SEES. NAME BOTH `bevel` AND `profile` OR NEITHER: a set
  // that names neither wears STD_EDGE `{bevel: .09, profile: round}` as a unit,
  // and naming either one states your own edge, whose per-field fallbacks are
  // .055 and 'cut'. The defaults below are STD_EDGE, because that is what a
  // panel field left empty is actually showing.
  geo: {
    bevel: look('bevel', 0.09, [0, 0.2, 0.005], 'apply', 'edge-cut share: 0.02 machined-crisp, 0.13 tumbled'),
    profile: pick('profile', 'round', ['cut', 'round'], 'look', 'apply', 'flat chamfer facets · true fillet arcs'),
    segments: look('arc strips', 3, [1, 6, 1], 'apply', 'round only: 1 is a flat strip with fillet shading — the old look'),
    ink: look('edge ink', 0.25, [0, 1, 0.01], 'apply',
      'darkness of the painted face outline and the band material; the code\'s own fallback is .25 cut / .12 round'),
    tint: look('edge tint', '#000000', null, 'apply', 'what the edge darkens TOWARD — brass ages to patina, never to soot'),
    wear: look('wear', 0, [0, 1, 0.01], 'apply', 'tumbled erosion, corners first (deterministic per set)'),
    nicks: look('nicks', 0, [0, 5, 1], 'apply', 'discrete chips at seeded corner sites'),
    pillow: look('pillow', 0, [0, 1, 0.01], 'apply', 'cushion-shaded faces; the silhouette and the digit plane stay flat'),
  },

  // ---- Level 4b: a light parented to the die (js/dielights.js) ------------
  // Four table-wide, oldest stolen. Negative intensity pools shadow.
  light: {
    color: look('light colour', '#ffffff', null, 'apply', ''),
    intensity: look('light', 10, [-20, 20, 0.5], 'apply', 'negative pools local shadow instead of emitting (Umbra)'),
    range: look('light range', 2.5, [0, 12, 0.1], 'apply', 'past ~5 it lands on the dice beside it, which contradicts most claims'),
    mode: pick('light mode', 'steady', DIE_LIGHT_MODES, 'look', 'apply', 'the envelope; seeded, so every client flickers identically'),
  },

  // ---- Level 5: post (js/post.js) ----------------------------------------
  // `bloom` was `true` in js/themes.js and is an enum here, because the file
  // may not hold a boolean: `source` marks this set's dice as bloom SOURCES,
  // and there is no strength knob — whatever Levels 1–2 made bright is exactly
  // what burns.
  post: {
    bloom: pick('bloom', 'plain', ['plain', 'source'], 'look', 'apply', 'whether this set\'s dice feed the bloom pass'),
    ring: {
      amp: look('shock ring', 6, [-20, 20, 0.5], 'apply', 'one screen-space wave from the roll\'s hardest impact; negative implodes'),
      jolt: look('frame jolt', 0, [0, 8, 0.1], 'apply', 'a ~120 ms frame shake with the ring; the 2026-08-04 pass calls a per-roll jolt "UI feedback, not a physical event"'),
      speed: look('ring speed', 1400, [200, 3000, 10], 'apply', 'px/s the wave travels (js/post.js `ring()` default)'),
    },
    shimmer: {
      radius: look('shimmer radius', 2.2, [0, 6, 0.1], 'apply', 'heat wobble above a settled die'),
      strength: look('shimmer', 0.5, [0, 3, 0.05], 'apply', ''),
    },
  },

  // ---- the impact voice (js/voices.js) -----------------------------------
  // ABSENT is a real answer and it is IMPACT_DEFAULT_BODY at weight 0 and
  // sustain 0 — byte for byte the knock every unthemed die makes. Joe,
  // 2026-08-18, on the fae dice: "Just use a normal sound", delivered by
  // DELETING the recipe. Which is why these defaults are the absent values.
  sound: {
    body: pick('voice', 'felt', SOUND_BODIES, 'look', 'apply', 'the contact body (js/voices.js IMPACT_VOICES)'),
    weight: look('weight', 0, [0, 1, 0.01], 'apply', 'heavier is lower'),
    sustain: look('sustain', 0, [0, 200, 1], 'apply', 'ms of tail; a resonant body struck forty times in two seconds is clanking'),
  },

  // ---- the playback retiming (main.js; the projector's clock only) --------
  rate: {
    rate: look('catch rate', 1, [0.2, 2, 0.01], 'apply', 'playback speed over the window; <1 decelerates (vine catch, glacial arrest)'),
    window: look('catch window', 0, [0, 1, 0.01], 'apply', 'the last share of the roll that is retimed. PHYSICS UNTOUCHED — only the playback clock scales'),
  },

  // ---- the settled-die cadence (main.js restInfo) -------------------------
  // Four kinds, and the fields are their UNION: a sparse row carries only the
  // ones its kind reads, which is how the file reads today.
  rest: {
    kind: pick('rest', 'still', REST_KINDS, 'look', 'apply',
      'still is an ASSERTION of stillness, not the absence of a cadence — absent is the absence'),
    yAmpM: look('swell height', 0.0015, [0, 0.01, 0.0001], 'apply', 'swell: metres of Y drift'),
    yPeriodS: look('swell period', 2.6, [0.5, 12, 0.1], 'apply', 'swell: seconds'),
    rollAmpRad: look('swell roll', 0.00524, [0, 0.05, 0.0001], 'apply', 'swell: radians of world-X roll'),
    rollPeriodS: look('swell roll period', 3.1, [0.5, 12, 0.1], 'apply', 'swell: seconds, incommensurate with the height'),
    ampRad: look('creak amp', 0.00698, [0, 0.05, 0.0001], 'apply', 'creak: radians per axis'),
    periodAS: look('creak period A', 2, [0.5, 12, 0.1], 'apply', 'creak: both sines hit zero together at their LCM'),
    periodBS: look('creak period B', 3, [0.5, 12, 0.1], 'apply', 'creak: the second axis'),
    delayMinMs: look('tick delay min', 200, [0, 2000, 10], 'apply', 'settle-tick: ms after landing'),
    delayMaxMs: look('tick delay max', 400, [0, 2000, 10], 'apply', 'settle-tick: ms after landing'),
    posBumpM: look('tick lift', 0.0003, [0, 0.01, 0.0001], 'apply', 'settle-tick: metres'),
    yawRad: look('tick yaw', 0.00698, [0, 0.05, 0.0001], 'apply', 'settle-tick: radians'),
    tailMs: look('tick decay', 80, [0, 600, 5], 'apply', 'settle-tick: ms back to the archive pose, then still forever'),
  },

  // ---- W4: what a settled die breathes into a venue's fog lattice ---------
  // Read only while a venue is staged (js/fae-lab.js brightenFog); inert on
  // the grounded table.
  fog: {
    color: look('fog breath', '#9ff0dc', null, 'apply', 'the colour this set puts into the mist it sits in'),
    gain: look('fog gain', 1, [0, 3, 0.05], 'apply', 'against the venue\'s own default breath'),
  },

  // ---- the two catalogue rules (where a set may be PICKED, never what it
  // does — js/stability.js's one law) --------------------------------------
  where: pick('where', 'anywhere', ['anywhere', 'venue'], 'look', 'apply',
    'venue: the set resolves everywhere (materials, voices, the wire) but takes no chip in the picker — a venue stages it (was `venueOnly: true`)'),
  channel: pick('channel', 'stable', ['stable', 'beta'], 'look', 'apply',
    'beta: offered only on ?stability=beta. It decides where a set may be PICKED and NEVER what it does, because the film is a function of the core and the seed (was `beta: true`)'),
});

// A HOUSE ROW — js/themes.js's THEMES entry. `dice:` is where the two levels
// live: js/themes.js's `sets`, renamed for the file because `houses.<h>.sets`
// beside a top-level `set` on the wire read as the same word for two things,
// and because `dice:` is what a person writing one would look for.
const HOUSE_ROW = Object.freeze({
  label: look('label', 'House', null, 'apply', 'the browsing category\'s name'),
  line: look('line', '', null, 'apply', 'the one line under it — a house has an identity or it is a folder'),
  dice: rows('sets', RECIPE, 'the concrete dice styles a player actually picks'),
});

// (`ASSET_ROWS`, the section → row-shape map, is BELOW the dial tree since
// phase D4: `presets` declares the dial tree itself as its row shape, so the
// map cannot be written before `DIALS` exists. Everything between here and
// there reads it from inside a function, which is why the move costs nothing.)

// A shape's defaults, nested: a group of dials gives a map, a collection gives
// an empty map (a Clone starts with no sets in it and adds one), and a SPARSE
// group gives nothing at all — no key, because absence is the answer there and
// a key holding the reference cloth's numbers would be a different answer
// wearing the same shape (see `sparse`).
function shapeDefaults(shape) {
  const out = {};
  for (const [k, d] of Object.entries(shape)) {
    if (isDial(d)) out[k] = Array.isArray(d.def) ? d.def.slice() : d.def;
    else if (isRows(d)) out[k] = {};
    else if (isSparse(d)) continue;
    else if (isPlain(d)) out[k] = shapeDefaults(d);
  }
  return out;
}

// A fresh row of a section's defaults — what an editor's Clone starts from
// and what `addRow` fills the fields a caller left out with. A SPARSE section
// fills nothing: absent is the answer there (see ASSET_SPARSE).
export function assetRowDefaults(section) {
  const fields = ASSET_ROWS[section];
  if (!fields) return null;
  return ASSET_SPARSE.includes(section) ? {} : shapeDefaults(fields);
}

// The row shape of the COLLECTION at `at` — `['felts']` is the felt row,
// `['houses', 'std', 'dice']` is the recipe — or null when `at` does not name
// one. Segments alternate row id / field from the section onward.
export function collectionShapeAt(at) {
  const p = toPath(at);
  let shape = ASSET_ROWS[p[0]];
  if (!isPlain(shape)) return null;
  for (let i = 1; i < p.length; i += 2) {
    const field = p[i + 1];
    if (!ASSET_ID_RE.test(String(p[i])) || field === undefined) return null;
    const d = shape[field];
    if (!isRows(d)) return null;
    shape = d.rows;
  }
  return shape;
}

// Does `path` name a ROW — a section, an id, then (field, id) pairs? The row,
// not the field, is the unit `reset`, `removeRow` and the Save patch move.
export function isRowPath(path) {
  const p = toPath(path);
  return p.length >= 2 && p.length % 2 === 0 && collectionShapeAt(p.slice(0, -1)) !== null;
}

// The DEEPEST row a leaf path belongs to (`houses.std.dice.classic.geo.bevel`
// → `houses.std.dice.classic`), or null when it is not inside one. One law,
// used by `apply`'s row guard, by the export's row collapse, by the panel's
// revert glyph and by main.js's dropped-rows line.
export function assetRowPath(path) {
  const p = toPath(path);
  if (!ASSET_SECTIONS.includes(p[0])) return null;
  for (let n = p.length - (p.length % 2); n >= 2; n -= 2) {
    if (isRowPath(p.slice(0, n))) return p.slice(0, n);
  }
  return null;
}

// The dial for one leaf of an asset row, or a STRING saying why there is
// none — the same two-shaped answer js/dice-apply-core.js's `dialFor` gives,
// so that file can hand an asset path straight here.
export function assetDialFor(path) {
  const p = toPath(path);
  const section = p[0];
  if (!ASSET_SECTIONS.includes(section)) return 'no dial at this path';
  return walkRows(section, ASSET_ROWS[section], p.slice(1), [section]);
}

// `rest` starts at a ROW ID under the collection `at`.
function walkRows(section, shape, rest, at) {
  if (!rest.length) return `\`${at.join('.')}:\` is a map of rows; name one`;
  const id = rest[0];
  if (!ASSET_ID_RE.test(String(id))) return `${JSON.stringify(String(id))} is not a legal ${section} id (${ASSET_ID_WHY})`;
  return walkFields(section, shape, rest.slice(1), at.concat(id));
}

// `rest` starts at a FIELD of the row (or group) `at`.
function walkFields(section, shape, rest, at) {
  if (!rest.length) return `${at.join('.')} is a row of fields; name one`;
  const k = rest[0], tail = rest.slice(1);
  const d = shape[k];
  if (isDial(d)) {
    return tail.length ? `${at.concat(k).join('.')} is a value, not a map` : d;
  }
  if (isRows(d)) return walkRows(section, d.rows, tail, at.concat(k));
  // A sparse group is an ordinary group to every question but "what does an
  // absent field mean" — so the walk is the same one.
  if (isSparse(d)) {
    return tail.length ? walkFields(section, d.sparse, tail, at.concat(k))
      : `${at.concat(k).join('.')} is a group of fields; name one`;
  }
  if (isPlain(d)) {
    return tail.length ? walkFields(section, d, tail, at.concat(k))
      : `${at.concat(k).join('.')} is a group of fields; name one`;
  }
  const named = `no ${section} field named ${JSON.stringify(String(k))} at ${at.join('.')} `
    + `(${Object.keys(shape).join(', ')})`;
  // A tail under an unknown key is almost always a DOTTED ID read as two
  // segments (`felts.house.moss.cloth`), so the message names that too — it is
  // the mistake this branch exists to explain.
  return tail.length ? `${named}; ${JSON.stringify(`${k}.${tail[0]}`)} reads as two segments, `
    + `and an id may not contain a dot (${ASSET_ID_WHY})` : named;
}

// ---------------------------------------------------------------------------
// THE DIAL TREE (phase 1). Shape = docs/DEVMODE.md §3. Ranges are the
// slider's, not the law's: the number field beside a slider takes any
// finite value. Source of each default is named beside its section.
// ---------------------------------------------------------------------------

const ENABLED = ['enabled', 'disabled'];
const surface = (friction, restitution, why) => ({
  friction: film('friction', friction, [0, 1.5, 0.01], 'apply', why),
  restitution: film('restitution', restitution, [0, 1, 0.01], 'apply', why),
});

export const DIALS = {
  app: {
    title: look('title', 'Dice Table', null, 'reload', 'the document title'),
    mode: pick('mode', 'development', ['development', 'production'], 'look', 'reload',
      'the production switch; DICE_MODE overrides it at deploy. Not a panel control.'),
    version: look('version', 1, [1, 99, 1], 'reload', 'bumped in the commit that renames or removes a key'),
  },
  table: {
    scale: film('table scale', 2.5, [1, 4, 0.05], 'apply',
      'the one dial for table size (Joe 2026-09-01) — TABLE_SCALE; a bigger table IS smaller dice'),
    ceilingY: film('ceiling', 22, [8, 60, 1], 'reload', 'the roof plane the walls close under'),
    // places.js SEAT_TOSS — the ring toss. Aimed at the spot always; `back`
    // moves the release point away from it, so `height` and `speed` rise with
    // it or the dice land short (Joe 2026-09-02: "aim at the target always,
    // but have the ability to throw from further back").
    seats: {
      spot: film('target', 0.5, [0.1, 0.95, 0.01], 'roll', 'the spot, as a share of the radius from centre toward the chair'),
      back: film('release back', 0.4, [0, 8, 0.05], 'roll', 'the release point behind the spot, along the chair\'s ray, in table units'),
      height: film('release height', 0.3, [0.05, 2, 0.05], 'roll', 'a share of the hurl\'s 6–10 unit spawn height'),
      speed: film('release speed', 0.12, [0.02, 1.2, 0.01], 'roll', 'a share of the hurl\'s 14–22 units/s'),
      box: film('scatter', 0.15, [0, 1, 0.01], 'roll', 'the scatter box around the spot, a share of the throw target box'),
      per: film('pool pitch', 1.5, [0.5, 4, 0.05], 'roll', 'units between dice on the line (the hurl uses spawn.per)'),
    },
  },
  light: {
    // MOOD.tune (main.js) — the lamp and the room, lampY → lamp.y etc.
    lamp: {
      y: look('lamp height', 24, [5, 80, 0.5], 'apply', 'pool ~27 at the felt over a 13.75 table'),
      z: look('lamp z', 1.5, [-20, 20, 0.1], 'apply', 'over the felt, nudged to the front'),
      angle: look('lamp cone', 0.85, [0.1, 1.5, 0.01], 'apply', 'widened 0.5 → 0.85 for the round table'),
      penumbra: look('lamp penumbra', 0.75, [0, 1, 0.01], 'apply'),
      intensity: look('lamp intensity', 2.8, [0, 12, 0.05], 'apply'),
      color: look('lamp colour', '#ffe8c4', null, 'apply'),
    },
    room: {
      hemi: look('room hemi', 0.1, [0, 2, 0.01], 'apply', 'the room level while the mood is on'),
      key: look('room key', 1.7, [0, 6, 0.05], 'apply'),
      rim: look('room rim', 0.4, [0, 3, 0.05], 'apply'),
    },
    fog: {
      near: look('fog near', 15, [0, 80, 0.5], 'apply', 'the back corners already sit inside it at medium'),
      far: look('fog far', 46, [5, 200, 1], 'apply'),
    },
    // MOOD.moteTune — dust in the lamp cone; `on` → state.
    motes: {
      state: pick('motes', 'enabled', ENABLED, 'look', 'apply'),
      count: look('mote count', 200, [0, 1000, 10], 'apply', 'Joe 2026-08-15: "this looks good"'),
      size: look('mote size', 0.19, [0.02, 1, 0.01], 'apply'),
      peak: look('mote peak', 0.07, [0, 0.5, 0.005], 'apply'),
      spread: look('mote spread', 1.15, [0.1, 4, 0.05], 'apply'),
      rMax: look('mote radius', 12, [1, 40, 0.5], 'apply'),
      yMin: look('mote floor', 1.2, [0, 20, 0.1], 'apply'),
      yMax: look('mote ceiling', 10, [0, 40, 0.5], 'apply', 'not the full shaft: high motes read as a night sky'),
      fall: look('mote fall', 0.35, [0, 2, 0.01], 'apply'),
      wander: look('mote wander', 0.28, [0, 2, 0.01], 'apply'),
      twinkleHz: look('mote twinkle', 0.11, [0, 2, 0.01], 'apply'),
    },
    // BREATH — the declare beat told in light; every dial a fraction of
    // the shipped room. `t` and `target` are the beat's own clock, not
    // dials, and stay on the object.
    breath: {
      state: pick('breath', 'enabled', ENABLED, 'look', 'apply', 'device-local; the reduced-motion path skips the traverse'),
      // A DIVISOR (js/main.js:2212, `dt / Math.max(0.0001, BREATH.dur)`), so
      // `positive`: the clamp there keeps 0 from being a NaN and cannot keep
      // it from being an instant snap where a breath was asked for.
      dur: look('breath duration', 0.6, [0.05, 3, 0.05], 'apply', 'seconds, each way', 'positive'),
      hemiDrop: look('hemi drop', 0.65, [0, 1, 0.01], 'apply', 'the ambient falls furthest — it is what closing in is'),
      rimDrop: look('rim drop', 0.75, [0, 1, 0.01], 'apply'),
      keyDrop: look('key drop', 0.45, [0, 1, 0.01], 'apply', 'the key stays halfway: dice must not go unreadable'),
      lampLift: look('lamp lift', 0.12, [0, 1, 0.01], 'apply', 'the pool comes UP, so it reads as focus'),
      angleNarrow: look('cone narrow', 0.3, [0, 1, 0.01], 'apply'),
      // NO `depth` HERE (2026-09-02, found wiring B1): BREATH.depth is the
      // CLOTH's number, pushed by applyFeltTheme — obsidian, the default felt,
      // pushes 1.5 at boot — so a dial for it read "changed" on every fresh
      // tab and a Save would have written the felt's value over the file's.
      // It becomes `felts.<id>.breath` when the felt rows migrate (phase 3).
    },
    // TOWERLIGHT.tune — the socketed tower's lantern rake and ember.
    tower: {
      rakeIntensity: look('rake intensity', 2.4, [0, 10, 0.1], 'apply'),
      rakeColor: look('rake colour', '#ffd9a0', null, 'apply'),
      rakeX: look('rake x', -10, [-30, 30, 0.5], 'apply', 'eye: side'),
      rakeY: look('rake y', 5.5, [0, 30, 0.5], 'apply', 'eye: height'),
      rakeOut: look('rake out', 7.5, [0, 30, 0.5], 'apply', 'eye: z0 + out'),
      rakeAngle: look('rake cone', 0.62, [0.1, 1.5, 0.01], 'apply'),
      rakePenumbra: look('rake penumbra', 0.6, [0, 1, 0.01], 'apply'),
      emberIntensity: look('ember intensity', 14, [0, 50, 0.5], 'apply'),
      emberDist: look('ember distance', 8, [0, 30, 0.5], 'apply'),
      breathDepth: look('ember breath', 0.22, [0, 1, 0.01], 'apply'),
      breathHz: look('ember breath rate', 0.11, [0, 2, 0.01], 'apply'),
    },
    // LIFE_TUNE (faelife.js) — the fae venue's fireflies, wisps and moot.
    life: {
      count: look('firefly count', 260, [0, 1000, 10], 'apply', 'in-frame density, not total'),
      size: look('firefly size', 0.5, [0.05, 2, 0.05], 'apply', 'size was the whole problem; 0.5 reads as drifting specks'),
      peak: look('firefly peak', 0.42, [0, 1.5, 0.01], 'apply', '→ ~0.17 luma, under the tertiary ceiling'),
      blinkPow: look('blink power', 4, [1, 12, 0.5], 'apply', 'dark ~3/4 of the cycle'),
      blinkHz: look('blink rate', 0.22, [0, 2, 0.01], 'apply', 'a flash every 3–8 s'),
      wander: look('firefly wander', 0.45, [0, 3, 0.05], 'apply'),
      wispCount: look('wisp count', 4, [0, 12, 1], 'apply', 'one lead + three followers; a fifth would be a swarm'),
      wispSize: look('wisp size', 1.15, [0.1, 4, 0.05], 'apply'),
      leadPeak: look('lead peak', 0.95, [0, 2, 0.01], 'apply', '→ ~0.40 luma, inside secondary'),
      wispPeak: look('wisp peak', 0.38, [0, 2, 0.01], 'apply'),
      wispLoopSec: look('wisp lap', 78, [10, 300, 1], 'apply', 'one lap; slow enough to be a route'),
      wispLampRange: look('wisp lamp range', 5.5, [0, 20, 0.5], 'apply'),
      wispLampGain: look('wisp lamp gain', 2.2, [0, 10, 0.1], 'apply', 'first dial to move if Joe finds it loud'),
      nearArcU: look('near arc', 0.3, [0, 1, 0.01], 'apply', 'overridden by the venue'),
      leanGain: look('lean gain', 0.35, [0, 2, 0.01], 'apply'),
      leanDwell: look('lean dwell', 0.55, [0, 0.95, 0.01], 'apply', 'must stay < 1 or the route reverses'),
      dimGain: look('dim gain', 0.3, [0, 1, 0.01], 'apply', 'what survives while the film runs'),
      flareGain: look('flare gain', 0.8, [0, 3, 0.05], 'apply', 'the crit beat, on wisps'),
      moot: {
        lapHz: look('moot lap', 0.085, [0, 1, 0.005], 'apply', 'a word goes round the ring in ~12 s'),
        quiet: look('moot quiet', 0.85, [0, 1, 0.01], 'apply'),
        visit: look('moot visit', 0.45, [0, 1, 0.01], 'apply'),
        nearIn: look('moot near in', 1.2, [0, 10, 0.1], 'apply', 'standing in it, not passing near it'),
        nearOut: look('moot near out', 3, [0, 20, 0.1], 'apply'),
        dimGain: look('moot dim', 0.55, [0, 1, 0.01], 'apply'),
        flareGain: look('moot flare', 0.5, [0, 3, 0.05], 'apply'),
        flareLap: look('moot flare lap', 3, [0.5, 10, 0.1], 'apply'),
      },
    },
  },
  camera: {
    // FRAMING (main.js) — preferDice: true → prefer: dice.
    framing: {
      prefer: pick('prefer', 'dice', ['dice', 'table'], 'look', 'frame',
        'what the fit favours when both cannot be held'),
      floor: look('fit floor', 1, [0.25, 1.5, 0.01], 'frame', 'the eye never comes closer than the zoom says'),
      gain: look('fit gain', 1.15, [0.5, 3, 0.01], 'frame'),
    },
  },
  throw: {
    physics: {
      gravity: film('gravity', -110, [-400, -20, 1], 'apply', 'the sim is in slow motion by arithmetic; the tempo curve is the fix'),
      solverIterations: film('solver iterations', 14, [1, 40, 1], 'roll'),
      // PHYS (main.js): floorFriction → floor.friction etc.
      floor: surface(0.6, 0.15, 'the felt: deadened, gripping'),
      dice: surface(0.4, 0.2, 'die on die'),
      wall: surface(0.2, 0.5, 'the rim'),
      damping: {
        linear: film('linear damping', 0.01, [0, 0.5, 0.001], 'apply'),
        angular: film('angular damping', 0.01, [0, 0.5, 0.001], 'apply'),
      },
    },
    // DAMPGATE — speed-gated felt damping; gate 0 is off.
    dampgate: {
      gate: film('damp gate', 4, [0, 40, 0.5], 'apply', 'a velocity threshold on lengthSquared; 0 is off'),
      slowLinear: film('slow linear', 0.1, [0, 1, 0.01], 'apply'),
      slowAngular: film('slow angular', 0.14, [0, 1, 0.01], 'apply'),
    },
    // SLEEP — what dice.js already sets, not cannon's defaults.
    sleep: {
      speed: film('sleep speed', 0.4, [0, 4, 0.05], 'apply'),
      time: film('sleep time', 0.35, [0, 3, 0.05], 'apply'),
    },
    // SPAWN — where the throw lines up.
    spawn: {
      axis: pick('spawn axis', 'clamp', ['width', 'own', 'clamp'], 'film', 'apply',
        'clamp shipped 2026-08-14; own was measured and refused'),
      pad: film('spawn pad', 4.4, [0, 12, 0.1], 'apply', 'the total clearance the clamp reserves'),
      per: film('spawn per die', 2.6, [0.5, 8, 0.1], 'apply', 'the spacing the spread wants'),
    },
    // NUDGE — what to do about a die that stops at an angle.
    nudge: {
      budget: film('nudge budget', 3, [0, 10, 1], 'apply'),
      lift: film('nudge lift', 7, [0, 30, 0.5], 'apply', 'a vertical hurl'),
      spread: film('nudge spread', 4, [0, 30, 0.5], 'apply'),
      spin: film('nudge spin', 14, [0, 60, 1], 'apply'),
      cockedDot: film('cocked dot', 0.6, [0, 1, 0.01], 'apply', '~53°: lets a die rest against its neighbour'),
      cockedDotD4: film('cocked dot d4', 0.7, [0, 1, 0.01], 'apply'),
      pileScale: film('pile scale', 1.05, [0, 2, 0.01], 'apply', 'tidy on (Joe 2026-08-11); 0 is off'),
      pileSpread: film('pile spread', 12, [0, 40, 0.5], 'apply'),
    },
    // PLACE_AIM (places.js) — the seat's aim; on → state.
    aim: {
      state: pick('aim', 'enabled', ENABLED, 'film', 'roll'),
      speed: film('aim speed', 0.5, [0, 2, 0.05], 'roll'),
      h: film('aim height', 0.45, [0, 3, 0.05], 'roll', 'a low hand — the rectangle-era hurl only; the ring toss reads table.seats.height'),
      box: film('aim box', 0.25, [0, 1, 0.01], 'roll', 'the fraction of the run the box is cut to'),
      corner: pick('aim corner', 'enabled', ENABLED, 'film', 'roll', 'enabled: a lane sets the box against its corner'),
      own: pick('aim own', 'enabled', ENABLED, 'film', 'roll', 'enabled: the seat throws along its own axis'),
      spin: film('aim spin', 1, [0, 4, 0.05], 'roll'),
    },
    // SETTLEGATE — the settle terminator.
    settle: {
      mode: pick('settle mode', 'displacement', ['velocity', 'displacement'], 'film', 'apply',
        'displacement shipped 2026-08-11; velocity is the pre-flip predicate'),
      eps: film('settle eps', 0.02, [0.005, 0.2, 0.005], 'apply', 'a fraction of a die width'),
    },
    // THROW_TARGET — how wide the throw aims.
    target: film('throw target', 0.4, [0, 1, 0.02], 'apply', 'the middle ±target/2 of the table'),
  },
  pace: {
    // TEMPO — the projector's curve; never the bake.
    //
    // THE THREE SPEEDS CARRY `positive` (phase D4). A speed of zero is not a
    // slow projector: `k` divides the impact drain's minimum gap
    // (js/main.js:5004), so `k: 0` silences every landing, and all three
    // multiply `stepPlayback`'s dt, so a negative one runs the film backwards
    // — which is a picture of something that never happened, and the one
    // shape §10 says a dial may not make. The slider floors already said so;
    // the law is what says it to a typed number and to the file.
    tempo: {
      k: look('tempo', 1, [0.25, 4, 0.05], 'frame', 'playback speed, never the bake', 'positive'),
      flight: look('flight tempo', 0.8, [0.1, 4, 0.05], 'frame', 'the tumble, a touch slower than raw', 'positive'),
      settle: look('settle tempo', 25, [1, 60, 0.5], 'frame', 'the tail is effectively skipped', 'positive'),
      // NOT `positive`: 0 is a real reading here — no ramp, the curve cuts
      // straight to `settle` — and `tempoCurveAt` says so in its own guard.
      rampS: look('tempo ramp', 2, [0, 6, 0.1], 'frame', 'film seconds; the glide that hides the cut'),
      anchorSpeed: look('anchor speed', 8, [0.5, 40, 0.5], 'frame', 'where tumbling ends, in units/s'),
    },
    // CEREMONY_* consts — read once at boot.
    ceremony: {
      declareS: look('declare dwell', 1.35, [0, 4, 0.05], 'reload', 'incl. the commit dock'),
      hitstopS: look('hitstop', 0.11, [0, 1, 0.01], 'reload'),
      budgetS: look('ceremony budget', 1.6, [0, 5, 0.05], 'reload', 'post-settle ceiling'),
      dismissMs: look('dismiss', 7000, [0, 30000, 250], 'reload', 'the flow-to-collected clock'),
    },
    clear: {
      sinkS: look('sink', 0.3, [0.05, 2, 0.05], 'reload', 'how long a cleared die takes to leave'),
    },
  },
  sound: {
    // THE TWO LEVELS THE TABLE ACTUALLY HAS (phase C5). Sound is LOOK all the
    // way down — the film is a bake of poses and contacts, and what a viewer
    // hears off it is theirs (GOALPOST 7). A locked table's dev tab may still
    // turn itself down.
    //
    // js/voices.js MASTER_GAIN — the single gain every source in the graph
    // passes through, and the mute point. Everything in docs/AUDIO.md's mix
    // plan is a fraction of it, so this is the one number that moves the whole
    // table at once; the dBFS arithmetic in tests/voices.test.mjs is written
    // against the 0.7 js/voices.js still owns.
    master: look('master', 0.7, [0, 1, 0.01], 'apply',
      'the whole table\'s level — every voice is a fraction of it (js/voices.js MASTER_GAIN)'),
    // IMPACT_VOICES.felt.gainScale — the DEFAULT body's level, which is to say
    // the level of most sounds this app makes: `felt` is IMPACT_DEFAULT_BODY,
    // every unthemed die resolves to it, and since 2026-08-18 both fae venues
    // do too. Not the whole family: the other seven bodies are authored
    // AGAINST this one (bell's 0.041 is solved from chime's 0.045), so a dial
    // over all eight would silently unsolve them.
    impact: {
      gain: look('impact gain', 0.06, [0, 0.2, 0.002], 'roll',
        'the default contact body\'s level (js/voices.js IMPACT_VOICES.felt.gainScale); read at every contact'),
    },
    // CLICKGATE — which clock gates the impact clicks.
    click: {
      mode: pick('click gate', 'film', ['film', 'wall'], 'look', 'apply',
        'film is invariant to the tempo curve; wall is the pre-curve gate'),
    },
  },
  post: {
    // js/post.js BLOOM_THRESHOLD, on LINEAR pre-tonemap luminance. LOOK, and
    // that is the whole reason it may be a dial at all: a venue authors its
    // emissive tiers against this number (fae grammar rule 3, "authored to the
    // threshold, because there is no post-hoc dial") — so turning it down is
    // how you SEE what a tier is doing, and turning it up is not a way to
    // publish a different table. Nothing on the wire reads it.
    bloom: {
      threshold: look('bloom threshold', 0.9, [0, 3, 0.01], 'apply',
        'linear pre-tonemap luminance a glow-flagged mesh must clear to burn'),
    },
  },
  // js/places.js PLACARD — the name card's footprint (docs/UX.md §7.63).
  //
  // FILM, and not because a card touches a die: it cannot, by the standoff's
  // own construction. It is film because `placardFootprint`, `placardGap` and
  // `seatAnchor` are the SHARED geometry two clients must agree on double for
  // double (js/places.js: "two clients must agree on every double here") — one
  // tab whose cards are 15% wider is one tab whose ring is not the ring
  // everybody else is looking at.
  //
  // APPLY, since phase D4 (2026-09-03). These were ⟳ rows because js/placard.js
  // bakes one instanced rig at boot and rebuilding it live was phase 3's
  // problem; it is phase 3, and js/main.js `rebuildPlacards` is the choke
  // point — the rig is disposed and re-stood AT THE PLACARD FLUSH, behind the
  // same roll boundary a zoom and a tower take, never with dice in the air.
  //
  // AND THE RANGES ARE A PAIR, not two sliders (the C5 review's minor, taken
  // here). `standoff − depth/2` is the clear ground between the rim and the
  // card's inner edge, and it is what licenses the card's depthWrite, its real
  // shadow and the seating raycast; at the shipped 0.86 / 1.52 it is 0.10. The
  // two sliders move independently, so what has to hold is the WORST pair they
  // can offer — the standoff at its floor against the depth at its ceiling —
  // and 0.80 − 1.60/2 is exactly 0. That is why the depth's ceiling is 1.60
  // and not the 4 it used to be: a deeper card is not a card this table can
  // stand, and offering one on a slider would have been offering a picture the
  // geometry law forbids. The typed field still takes any finite number, and
  // the `cardClear` law is what refuses one that breaks the pair ('geometry').
  cards: {
    standoff: film('card standoff', 0.86, [0.8, 4, 0.01], 'apply',
      'the card centre outboard of the rim; standoff − depth/2 is the clear ground no die can cross',
      'cardClear'),
    width: film('card width', 3.68, [1, 8, 0.01], 'apply', 'across the chair\'s ray'),
    depth: film('card depth', 1.52, [0.4, 1.6, 0.01], 'apply', 'along the chair\'s ray',
      'cardClear'),
    // THE DRESS (2026-09-04, Joe: "I'd like you to try generating a few
    // different placards … one that is not even a physical placard, just text
    // on the mat surface. Very subtle. Far less distracting … we'll need
    // developer mode support to switch between placards that we are testing").
    //
    // LOOK, WHERE THE THREE ABOVE ARE FILM, and the split is the point rather
    // than an oversight. The footprint dials are film because `seatAnchor`,
    // `placardFootprint` and `placardGap` are geometry two clients agree on
    // double for double — one tab whose cards are wider is one tab whose ring
    // is not the ring. The dress touches NONE of them: js/placard.js draws a
    // different object at the same anchor, on the same ring, with the same
    // gaps and the same framing subjects. So it is per-viewer by construction,
    // it never locks at a table of two, and two people comparing styles are
    // still watching one film — which is also what makes the comparison
    // honest, since the only thing that moved is pixels.
    // THE INLAY IS THE TABLE'S DRESS (Joe, 2026-09-04, on the three: "Make
    // inlay the default for now. Keep the others in developer mode as
    // options"). The tent shipped from 2026-09-01 to today and is not
    // deleted — it is the control this was judged against and it is one word
    // away in the panel.
    style: pick('style', 'inlay', PLACARD_STYLES, 'look', 'apply',
      'the name on the felt · a low plaque lying flat · the folded tent card · pressed into the felt '
      + 'inside a thin rule · gold leaf, raised, between the ROLL plate\'s own two flourishes'),
    // THE SIZE OF THE PRINTED THING, which the three dials above have never
    // been (Joe, 2026-09-04: "give me more control of the size of the
    // placards"). `width`/`depth` are the HOLDER's footprint — film, because
    // the ring is shared — and until today nothing moved the CARD, whose
    // dimensions were consts. This multiplies the dress and only the dress, so
    // it is look and it never locks. Its cost at the top of the range is
    // recorded beside `cardW` in js/placard.js: a tent past ~2 overhangs its
    // own pad, which looks like what it is and breaks nothing.
    scale: look('size', 1, [0.2, 4, 0.01], 'apply',
      'the printed thing\'s size — the tent\'s card panels, the flat styles\' band. '
      + 'Not the holder: that is width/depth'),
    // THE EMBOSS'S ORNAMENT, and nothing else reads it: the stamp's border is
    // that dress's own business and the plain inlay has no ornament to switch.
    // `none` also hands the fitter back the width the lozenges reserve, so a
    // long name prints longer with it off.
    flourish: pick('flourish', 'full', PLACARD_FLOURISHES, 'look', 'apply',
      'the emboss only: leaf scrolls and diamonds · fine rules · the bare name'),
    inset: look('inlay inset', 0.60, [-1.5, 4, 0.01], 'apply',
      'the two bare styles: how far INSIDE the rim the ink lies, on the chair\'s own ray (0 is the rim)'),
    ink: {
      // The flat styles print on a transparent quad, so the ink can fade
      // without the object it is on fading with it. Nothing here reaches the
      // tent, whose name is painted into the opaque atlas.
      mode: pick('ink', 'steady', PLACARD_INK_MODES, 'look', 'apply',
        'steady sits at rest · ghost is lifted to full by the roller\'s own wash, so a name is loudest '
        + 'exactly while their dice are in the air'),
      rest: look('ink at rest', 0.55, [0, 1, 0.01], 'apply',
        'the flat styles\' opacity when nothing is happening — the whole of "very subtle" as a number'),
      tone: pick('ink tone', 'ink', PLACARD_INK_TONES, 'look', 'apply',
        'the hand of the styles printed straight onto the felt: warm sepia, authored against bone '
        + 'paper, or pale chalk, authored against the cloth. On the emboss it is which METAL — gold '
        + 'leaf or silver. Where there is stock under the ink (the tent, the plate) it is always sepia'),
    },
    // THE ARC UNDER THE CARD WHILE ITS OWNER'S DICE ARE IN THE AIR (Joe,
    // 2026-09-04: "control of the light up of the placard that happens when
    // rolling dice, I might turn it down or turn it off"). What turning it off
    // costs — attribution becomes the seat alone — is written out at
    // js/placard.js `washPeak`, along with the reason `ink.mode: ghost` keeps
    // working without it.
    wash: {
      state: pick('wash', 'enabled', ENABLED, 'look', 'apply',
        'the roller\'s hue on the ground under their name while their film plays'),
      peak: look('wash peak', 0.62, [0, 1, 0.01], 'apply',
        'how bright the arc gets at the middle of the film'),
    },
  },
};

// SECTION → THE ROW'S DIALS. ONE ENTRY PER `ASSET_SECTIONS` NAME, and the loop
// below is what says so: until phase D1 the map was allowed to answer
// `undefined` for a section that was named but not yet built (`sets:`,
// `towers:`, `venues:`), and three call sites carried a branch explaining that
// state to the reader. There is no such state now — the catalogue landed and
// the tower and venue sections are DEFERRED, which means absent from
// ASSET_SECTIONS, not present without a shape — so the hazard worth a check is
// the opposite one: a section added to that list with no shape here, which
// this turns from a null wandering through three walks into one line at
// import (the D1 review, 2026-09-03).
//
// IT SITS HERE, BELOW THE DIAL TREE, because `presets` declares `DIALS` as its
// row shape (phase D4) — a preset row IS a sparse subtree of the app's own
// dials — and a `const` may not be read before it is initialised. Note that
// the shape is the MODULE's dial tree and not the `dials` a caller handed
// `createTune`: a preset is judged against the tree the FILE is judged
// against, which is the same one js/dice-apply-core.js and server.js use, and
// there is exactly one of those. A test that passes its own dial tree and a
// `presets:` section together would be judging the second against this one.
export const ASSET_ROWS = Object.freeze({
  houses: HOUSE_ROW,
  felts: FELT_ROW,
  presets: DIALS,
});
for (const s of ASSET_SECTIONS) {
  if (!isPlain(ASSET_ROWS[s])) throw new Error(`tune: asset section \`${s}\` has no row shape in ASSET_ROWS`);
}

// THE SECTIONS WHOSE ROW IS A SPARSE SUBTREE OF THE DIAL TREE — `presets:`
// today, DERIVED and not typed, so a second such section joins by
// construction. It is the list every law has to reach into: a preset's leaves
// ARE the app's own leaves, which is what makes `presets.dusk.cards.depth` a
// `cards.depth` and not a value of its own.
const DIAL_ROW_SECTIONS = Object.freeze(ASSET_SECTIONS.filter((s) => ASSET_ROWS[s] === DIALS));

// `defaultsOf` for a shape read over and over (the dial tree is ~500 leaves
// and a law walk asks for it once per preset row). Frozen, because the cached
// tree is handed to `merge` and to `getLeaf` and must never be written; keyed
// by identity, so a caller's own dial tree does not outlive it.
const DEFAULTS_CACHE = new WeakMap();
function defaultsFor(shape) {
  let d = DEFAULTS_CACHE.get(shape);
  if (!d) { d = deepFreeze(defaultsOf(shape)); DEFAULTS_CACHE.set(shape, d); }
  return d;
}

// WHERE A PAIR LAW HAS TO HOLD in a tree, as `{ at, dials, defaults }`: the
// root, judged by the dial tree it was handed, and then one scope per row of
// a dial-tree section.
//
// A preset row is a sparse subtree of the SAME dials, so it has to answer the
// same geometry — judged against its own row's other half, falling back to the
// dial's default where the row is silent, exactly as the file's own missing
// half is. Until the D4 review (2026-09-03) both judges walked the defaults
// alone, so "no path under `presets.<name>.…` was ever in a law group": the
// file could hold a preset whose Apply could only ever refuse both leaves
// 'geometry', with no line anywhere saying why.
export function lawScopes(tree, dials = DIALS) {
  const out = [{ at: [], dials, defaults: defaultsFor(dials) }];
  if (!isPlain(tree)) return out;
  for (const s of DIAL_ROW_SECTIONS) {
    const rows = tree[s];
    if (!isPlain(rows)) continue;
    for (const [id, row] of Object.entries(rows)) {
      if (isPlain(row)) out.push({ at: [s, id], dials: ASSET_ROWS[s], defaults: defaultsFor(ASSET_ROWS[s]) });
    }
  }
  return out;
}

// Is this leaf a STATIC path inside a dial-tree row? `presets.dusk.app.mode`
// is one, and it is a row nobody can ever apply: `app.mode` has a dial (the
// panel draws it read-only) and every writer refuses it by name
// (STATIC_PATHS), so a preset carrying it would come back refused 'static'
// forever. The D4 review found it reconciling clean, listed by `devPresets()`
// and refused only on the press. One law, so reconcile, `validate` and the
// armed route all say the same thing about the same line.
export function isStaticRowLeaf(path) {
  const p = toPath(path);
  return p.length > 2 && DIAL_ROW_SECTIONS.includes(p[0]) && STATIC_PATHS.includes(p.slice(2).join('.'));
}

// ---------------------------------------------------------------------------
// The live tree.
// ---------------------------------------------------------------------------

function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}

function deepClone(x) {
  if (Array.isArray(x)) return x.map(deepClone);
  if (isPlain(x)) { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = deepClone(v); return o; }
  return x;
}

const same = (a, b) => a === b
  || (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null
    && JSON.stringify(a) === JSON.stringify(b));

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function findBooleans(tree, prefix = []) {
  const out = [];
  if (Array.isArray(tree)) {
    tree.forEach((v, i) => out.push(...findBooleans(v, prefix.concat(String(i)))));
  } else if (isPlain(tree)) {
    for (const [k, v] of Object.entries(tree)) out.push(...findBooleans(v, prefix.concat(k)));
  } else if (typeof tree === 'boolean') out.push(prefix.join('.'));
  return out;
}

function checkDials(dials, prefix = []) {
  for (const [k, v] of Object.entries(dials)) {
    const p = prefix.concat(k);
    if (isDial(v)) {
      const path = p.join('.');
      if (typeof v.def === 'boolean') throw new Error(`dial ${path}: a boolean default; use pick() with named states`);
      if (v.def === undefined) throw new Error(`dial ${path}: def is required`);
      if (v.options && !v.options.includes(v.def)) throw new Error(`dial ${path}: def ${JSON.stringify(v.def)} is not one of its options`);
      if (v.range && (!Array.isArray(v.range) || v.range.length !== 3 || !v.range.every(Number.isFinite))) {
        throw new Error(`dial ${path}: range must be [min, max, step]`);
      }
    } else if (isPlain(v)) checkDials(v, p);
    else throw new Error(`dial tree ${p.join('.')}: not a dial and not a map`);
  }
}

// Type is the law for a write: a leaf keeps the type SHIPPED gave it. The
// one opening is a dial-less leaf the file left empty (`note:` → null): it
// has no type yet, so it takes any scalar — otherwise it would refuse every
// value with 'type' and no way to give it one.
function typeFits(shipped, v) {
  const want = typeOf(shipped);
  if (want === 'null') return v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
  return typeOf(v) === want && (want !== 'number' || Number.isFinite(v));
}

// The declaration against the dial tree: returns a copy of `decl` with
// every null at a dial or a dial map dropped (absent: the default stands),
// and every leaf whose type, option or shape disagrees with its dial, or
// whose key holds a dot, dropped through `refuse(path, reason, message)`.
// A leaf with no dial is kept as it is — a typed value.
function reconcile(decl, dials, prefix, refuse) {
  const out = {};
  for (const [k, v] of Object.entries(decl)) {
    const p = prefix.concat(k), path = p.join('.');
    if (k.includes('.')) {
      refuse(path, 'key', `key ${JSON.stringify(k)} under ${prefix.length ? prefix.join('.') : 'the root'} contains a dot; every path here is a dotted string, so a dotted key cannot be addressed and it is dropped`);
      continue;
    }
    // AN ASSET SECTION IS CHECKED BY ITS ROW SHAPE, not by the dial tree —
    // there is no dial at `felts.house-moss.cloth` to walk to, only a row
    // whose `cloth` field is one. Only at the root: `felts` deeper in the
    // tree would be an ordinary map.
    if (!prefix.length && ASSET_SECTIONS.includes(k)) {
      const rows = reconcileRows(k, v, refuse);
      if (rows) out[k] = rows;
      continue;
    }
    const d = isPlain(dials) ? dials[k] : undefined;
    if (isDial(d)) {
      if (v === null) continue;
      const bad = judge(d, v);
      if (bad) { refuse(path, bad, judgeWhy(d, v, bad)); continue; }
      out[k] = cloneVal(v);
    } else if (isPlain(d)) {
      if (v === null) continue;
      if (!isPlain(v)) { refuse(path, 'shape', `expected a map, got ${JSON.stringify(v)}; the defaults stand`); continue; }
      out[k] = reconcile(v, d, p, refuse);
    } else if (isPlain(v)) {
      out[k] = reconcile(v, null, p, refuse);
    } else {
      out[k] = cloneVal(v);
    }
  }
  return out;
}

// One asset section of the declaration against its row shape, to whatever
// depth the section declares. A bad id, a bad field or a bad value is dropped
// by NAME with the default standing. Returns the reconciled section, or null
// when the section itself is refused — dropping a section wholesale rather
// than half of it, because half a catalogue is the harder thing to notice.
function reconcileRows(section, decl, refuse) {
  return reconcileCollection(section, ASSET_ROWS[section], decl, [section], refuse,
    !ASSET_SPARSE.includes(section));
}

// A map of rows at `at`, each keyed by an id the file chose.
function reconcileCollection(section, shape, decl, at, refuse, fill) {
  const where = at.join('.');
  if (decl === null) return null;                       // absent, like a null at a dial
  if (!isPlain(decl)) {
    refuse(where, 'shape', `expected a map of rows, got ${JSON.stringify(decl)}; it is dropped`);
    return null;
  }
  const out = {};
  for (const [id, row] of Object.entries(decl)) {
    const p = at.concat(id);
    if (!ASSET_ID_RE.test(id)) {
      refuse(p.join('.'), 'key', `${JSON.stringify(id)} is not a legal ${section} id (${ASSET_ID_WHY}); the row is dropped`);
      continue;
    }
    if (row === null) continue;
    if (!isPlain(row)) {
      refuse(p.join('.'), 'shape', `expected a map of fields, got ${JSON.stringify(row)}; the row is dropped`);
      continue;
    }
    out[id] = reconcileFields(section, shape, row, p, refuse, fill);
  }
  return out;
}

// The fields of one row (or of a nested group of fields inside one). `fill`
// is the section's: a FILLED section starts from the shape's defaults so a
// half-written row is whole by the time the merge site sees it; a SPARSE one
// starts empty, because there absence is the answer (ASSET_SPARSE).
function reconcileFields(section, shape, decl, at, refuse, fill) {
  const out = fill ? shapeDefaults(shape) : {};
  for (const [k, v] of Object.entries(decl)) {
    const p = at.concat(k), path = p.join('.');
    const d = shape[k];
    if (isRows(d)) {
      const sub = reconcileCollection(section, d.rows, v, p, refuse, fill);
      if (sub) out[k] = sub; else delete out[k];
      continue;
    }
    // A SPARSE GROUP KEEPS ONLY WHAT THE FILE WROTE, whatever the section's
    // own answer is: `felts:` is FILLED and `gloss`/`sound` inside it are not,
    // because their defaults live in the cloth registries and not in this
    // file (see `sparse`). A row that leaves the group out has no key for it.
    if (isSparse(d)) {
      if (v === null) { delete out[k]; continue; }
      if (!isPlain(v)) { refuse(path, 'shape', `expected a map, got ${JSON.stringify(v)}; the cloth's own row stands`); continue; }
      out[k] = reconcileFields(section, d.sparse, v, p, refuse, false);
      continue;
    }
    if (!isDial(d) && isPlain(d)) {
      if (v === null) { delete out[k]; continue; }
      if (!isPlain(v)) { refuse(path, 'shape', `expected a map, got ${JSON.stringify(v)}; the defaults stand`); continue; }
      out[k] = reconcileFields(section, d, v, p, refuse, fill);
      continue;
    }
    if (!isDial(d)) {
      refuse(path, 'unknown', `no ${section} field named ${JSON.stringify(k)} at ${at.join('.')} (${Object.keys(shape).join(', ')}); it is dropped`);
      continue;
    }
    if (v === null) continue;
    // A ROW OF THE DIAL TREE MAY NOT NAME A STATIC LEAF (the D4 review,
    // 2026-09-03) — see `isStaticRowLeaf`. Dropped by name at birth, where
    // the person holding the file is told, rather than at the press.
    if (isStaticRowLeaf(p)) {
      refuse(path, 'static', `${p.slice(2).join('.')} is set in dice.yaml or DICE_MODE and never by a patch; the field is dropped`);
      continue;
    }
    const bad = judge(d, v);
    if (bad) { refuse(path, bad, judgeWhy(d, v, bad)); continue; }
    out[k] = cloneVal(v);
  }
  return out;
}

// A PAIR LAW OVER THE DECLARATION (phase D4). `reconcile` judges one leaf at
// a time and a pair law cannot be answered that way, so it is answered here,
// once, over the merged tree. When a group does not hold, EVERY declared leaf
// carrying that law goes back to its default and is named — not the one that
// happened to be looked at last. The pair the code ships holds by
// construction, so putting both back is always a legal state, and refusing
// half of one is how you get a table whose cards stand inside the rim while
// the console says something was dropped.
//
// AND IT RUNS ONCE PER SCOPE (the D4 review, 2026-09-03), not once: a preset
// row is a sparse subtree of the same dial tree, so its `cards.depth` is a
// `cards.depth` and is judged inside its own row — see `lawScopes`.
function checkLawPairs(dials, declared, defaults, refuse) {
  for (const scope of lawScopes(declared, dials)) {
    const base = scope.at.length ? scope.defaults : defaults;
    const groups = pairGroups(scope.dials, base);
    if (!groups.size) continue;
    const named = (p) => scope.at.concat(p).join('.');
    for (const [name, paths] of groups) {
      const law = LAWS[name];
      // Re-merged per group: a group that dropped a leaf changes what the
      // next group reads, and what it reads has to be the tree as it stands.
      const sub = scope.at.length ? getLeaf(declared, scope.at) : declared;
      const merged = merge(base, isPlain(sub) ? sub : {});
      const read = (dp) => getLeaf(merged, dp);
      if (paths.every((p) => law.holds(getLeaf(merged, p), p.join('.'), read))) continue;
      for (const p of paths) {
        const full = scope.at.concat(p);
        if (!hasLeaf(declared, full)) continue;
        refuse(full.join('.'), law.reason, `${law.why}; the defaults stand for all of ${paths.map(named).join(', ')}`);
        dropLeaf(declared, full);
      }
    }
  }
}

// `onRefuse(r)` is called once per dropped declaration leaf with
// r = { path, reason: 'type'|'option'|'shape'|'key', message }; without it
// each drop is one console.warn line. Either way `tune.refusals` keeps them.
export function createTune({ declared, dials = DIALS, source = '', onRefuse = null } = {}) {
  if (declared === undefined || declared === null) declared = {};
  if (!isPlain(declared)) throw new Error('createTune: declared must be a plain object');
  if (onRefuse !== null && typeof onRefuse !== 'function') throw new Error('createTune: onRefuse must be a function');
  checkDials(dials);
  const bools = findBooleans(declared);
  if (bools.length) throw new Error(`createTune: boolean at ${bools[0]}; use an enum with named states`);
  const refusals = [];
  const refuse = (path, reason, message) => {
    const r = Object.freeze({ path, reason, message: `${path}: ${message}` });
    refusals.push(r);
    if (onRefuse) onRefuse(r);
    else if (typeof console !== 'undefined' && console.warn) console.warn(`tune: declared ${r.message}`);
  };
  declared = reconcile(declared, dials, [], refuse);
  const defaults = defaultsOf(dials);
  checkLawPairs(dials, declared, defaults, refuse);
  Object.freeze(refusals);

  const SHIPPED = deepFreeze(merge(defaults, declared));
  const T = deepClone(SHIPPED);
  const binders = new Map();
  // WHO IS WATCHING THE TREE CHANGE (phase D5). A binder is the tree's own
  // re-apply hook — one per path pattern, and the tree puts a value back when
  // one throws. A WATCHER is nobody's hook: it is told, after the fact, what
  // landed, and it may not refuse, reorder or undo anything. Two callers need
  // that and neither can be a binder: the RECORDER, which writes down every
  // patch whatever path it touched (a `'*'` binder would displace the real
  // one), and the POP-OUT, which broadcasts a snapshot after every change so a
  // second window can draw the tree it does not own. A watcher that throws is
  // logged and dropped from the round — a spectator may not break a write.
  const watchers = new Set();
  const fire = (event) => {
    if (!watchers.size) return;
    for (const fn of [...watchers]) {
      try { fn(event); } catch (e) {
        if (typeof console !== 'undefined' && console.error) console.error('tune: watcher threw:', e);
      }
    }
  };
  function watch(fn) {
    if (typeof fn !== 'function') throw new Error('watch: fn must be a function');
    watchers.add(fn);
    return () => watchers.delete(fn);
  }

  const dotted = (p) => toPath(p).join('.');

  function dialAt(path) {
    const d = getLeaf(dials, path);
    if (isDial(d)) return d;
    // An asset row's field has no place in the dial tree; its dial is the
    // section's row shape (ASSET_ROWS). Only when the dial tree does not
    // itself own the section name, so a `dials` a caller passed in wins.
    const p = toPath(path);
    if (p.length > 1 && ASSET_SECTIONS.includes(p[0]) && !(isPlain(dials) && Object.hasOwn(dials, p[0]))) {
      const a = assetDialFor(p);
      if (isDial(a)) return a;
    }
    return null;
  }

  function get(path) { return getLeaf(T, path); }

  function binderFor(path) {
    const p = toPath(path);
    const exact = binders.get(p.join('.'));
    if (exact) return exact;
    for (let i = p.length - 1; i >= 1; i--) {
      const fn = binders.get(p.slice(0, i).join('.') + '.*');
      if (fn) return fn;
    }
    return binders.get('*') || null;
  }

  function bind(pattern, fn) {
    if (typeof pattern !== 'string' || !pattern) throw new Error('bind: pattern must be a non-empty string');
    if (typeof fn !== 'function') throw new Error('bind: fn must be a function');
    binders.set(pattern, fn);
  }

  function entriesOf(patch) {
    if (patch instanceof Map) return Array.from(patch, ([k, v]) => [toPath(k), v]);
    if (!isPlain(patch)) throw new Error('set: patch must be an object or a Map');
    return Object.entries(patch).map(([k, v]) => [toPath(k), v]);
  }

  // THE writer, in two passes. First every accepted leaf lands in T
  // (refusals, in order: unknown, row, static, film, type, option);
  // reload-class leaves no binder covers are reported as pending. Then
  // each distinct binder runs ONCE, after the whole patch is in T, as
  // fn(firstPath, firstValue, covered) where covered is every [path, value]
  // of this patch it covers, in patch order — a re-apply that reads T sees
  // the whole patch, and one that takes (path, value) sees the first. A
  // binder that throws refuses EVERY leaf it covered ('binder': each value
  // is put back and the error goes to the console) and the rest of the
  // patch still stands — one failing hook may not leave a patch
  // half-applied or turn a {diff, refused, pending} result into an
  // exception.
  function apply(entries, { filmLocked = false } = {}) {
    const refused = [], pending = [];
    const runs = new Map();                       // fn → Map(key → { p, v, before })
    // WHAT THE PATCH PROPOSES, for a pair law (LAWS). The two leaves of
    // `{ 'cards.standoff': 2, 'cards.depth': 3.9 }` are legal together and
    // illegal one at a time in the order `Object.entries` happens to give
    // them, so the law reads the patch and falls back to T — never T alone.
    const proposed = new Map(entries.map(([p, v]) => [p.join('.'), v]));
    const readProposed = (dp) => (proposed.has(dp) ? proposed.get(dp) : getLeaf(T, dp));
    // …AND INSIDE A PRESET ROW IT READS THE ROW (the D4 review, 2026-09-03).
    // `presets.dusk.cards.depth` is a `cards.depth`, so the law that judges it
    // must read `presets.dusk.cards.standoff` and not the table's own — and
    // where the row is silent, the dial's default, which is what applying the
    // row would leave standing. The same reading `lawScopes` gives the file.
    const readInRow = (row) => (dp) => {
      const full = row.concat(toPath(dp));
      const key = full.join('.');
      if (proposed.has(key)) return proposed.get(key);
      const live = getLeaf(T, full);
      return live === undefined ? getLeaf(defaultsFor(ASSET_ROWS[row[0]]), dp) : live;
    };
    for (const [p, v] of entries) {
      const key = p.join('.');
      // WHAT A LEAF IS, once rows exist: SHIPPED names every dial and every
      // row the FILE declares, and T additionally holds the rows added since
      // (`addRow`). A write into a row this session minted is not 'unknown' —
      // it is how the felt editor moves a slider — so its type is read from T
      // where SHIPPED has nothing to say.
      const inShipped = hasLeaf(SHIPPED, p);
      // A SPARSE ROW'S ABSENT FIELD IS WRITABLE, AND HAS TO BE (the D1
      // review, 2026-09-03). The guard above predates the catalogue and was
      // right while `felts:` was the only asset section: a felt row is FILLED,
      // so every one of its six fields is in T and "no leaf here" really did
      // mean "no such dial". A dice recipe is SPARSE by design (ASSET_SPARSE:
      // "absent is a real answer") — `classics.ivory` names five fields of
      // ninety — so on a shipped set every field the file does not name had no
      // leaf in either tree and every write to it was refused 'unknown'. Some
      // eighty of the panel's recipe knobs were unwritable, on exactly the
      // rows a person edits first, while `assetDialFor` cheerfully answered
      // with the dial for each of them.
      //
      // The row is still the unit that has to EXIST (the guard below); what
      // this adds is that a field of a row that does exist may be minted when
      // the section's shape declares a dial for it. The dial's `def` — the
      // code's own fallback, which is what the empty panel field was already
      // showing — stands in as the "before" value for the type and option
      // checks, so a minted leaf is judged exactly as a written one.
      //
      // THE TWO REFUSALS STILL MEAN DIFFERENT THINGS (C4's rule, kept): a row
      // NOBODY ever had is 'unknown' — there is no dial at a path under it —
      // and a row the file declares that this session REMOVED is 'row', which
      // the guard below answers. So the mint asks whether either tree knows
      // the row, and leaves the removed case to be refused where it was.
      let minted = null;
      if (!inShipped && !hasLeaf(T, p)) {
        const row = p.length > 2 && ASSET_SECTIONS.includes(p[0]) ? assetRowPath(p) : null;
        const known = !!row && (isPlain(getLeaf(T, row)) || isPlain(getLeaf(SHIPPED, row)));
        const d = known ? dialAt(p) : null;
        if (!d) { refused.push([key, 'unknown']); continue; }
        minted = d;
      }
      // …AND A ROW THAT IS GONE IS GONE (found by the C4 review, 2026-09-03).
      // SHIPPED still names every leaf of a row the FILE declares after
      // `removeRow` took it out of T, so `hasLeaf(SHIPPED, p)` alone let one
      // leaf write mint a row back — one field of the removed row and five
      // guessed from FELT_ROW_DEFAULTS, a felt called Moss wearing obsidian's
      // colours, while `exportChanges` still said the row was gone. That is
      // exactly the half-built felt the comment below `diff` says must be
      // impossible. The row is the unit: put it back whole (`reset` at the
      // row's path) or leave it out.
      // `assetRowPath` and not `[p[0], p[1]]` since the catalogue arrived
      // (D1): a set lives at `houses.<house>.dice.<set>`, so the row that has
      // to be there is the DEEPEST one the path is inside, and a write under a
      // house whose `dice` map is gone must refuse for the same reason a write
      // under a removed felt does.
      const rowAt = p.length > 2 && ASSET_SECTIONS.includes(p[0]) ? assetRowPath(p) : null;
      if (rowAt && !isPlain(getLeaf(T, rowAt))) {
        refused.push([key, 'row']);
        continue;
      }
      // …AND A STATIC LEAF INSIDE A PRESET ROW IS STATIC TOO (the D4 review):
      // the row is sparse, so a write here would MINT `app.mode` into it and
      // hand back a preset whose Apply could only ever be refused.
      if (STATIC_PATHS.includes(key) || isStaticRowLeaf(p)) { refused.push([key, 'static']); continue; }
      const spec = dialAt(p);
      if (spec && spec.cls === 'film' && filmLocked) { refused.push([key, 'film']); continue; }
      if (!typeFits(minted ? minted.def : inShipped ? getLeaf(SHIPPED, p) : getLeaf(T, p), v)) {
        refused.push([key, 'type']); continue;
      }
      // A LIST DIAL'S ENTRIES AND LENGTH ARE LAW TOO (the D1 review):
      // `typeFits` only asks "is this an array", and for a list dial the whole
      // answer is `judge`'s — 'type' for an entry that is not a string,
      // 'range' for a table of the wrong size, 'option' for a word outside
      // `each`. For every other dial this is the option check it always was.
      if (spec) {
        const bad = judge(spec, v);
        if (bad === 'option' || (bad && Array.isArray(spec.def))) { refused.push([key, bad]); continue; }
      }
      // …AND SO IS A LAW (phase D4). Both kinds run here — a single-value law
      // because `judge` above only forwards 'option' and the list reasons, and
      // a pair law because this is the one place the whole patch is in hand.
      // The reason is the law's own: 'range-law' for a divisor at zero,
      // 'geometry' for a card that would stand inside the rim.
      if (spec && spec.law) {
        const row = DIAL_ROW_SECTIONS.includes(p[0]) ? assetRowPath(p) : null;
        const inRow = row && p.length > row.length;
        if (!LAWS[spec.law].holds(v, inRow ? p.slice(row.length).join('.') : key,
          inRow ? readInRow(row) : readProposed)) {
          refused.push([key, LAWS[spec.law].reason]);
          continue;
        }
      }
      const before = getLeaf(T, p);
      const moved = !same(before, v);
      // What a rollback has to take away: for a minted leaf it is not a value
      // to put back but a node to delete, and the node is the shallowest one
      // this write creates (`geo` when only `geo.bevel` was written).
      const madeAt = minted ? mintedAt(T, p) : null;
      setLeaf(T, p, cloneVal(v));
      const fn = binderFor(p);
      if (fn) {
        let run = runs.get(fn);
        if (!run) { run = new Map(); runs.set(fn, run); }
        const prev = run.get(key);                // the same leaf twice in one patch: the first `before` is the real one
        run.set(key, prev ? { p, v, before: prev.before, madeAt: prev.madeAt } : { p, v, before, madeAt });
      } else if (spec && spec.read === 'reload' && moved) pending.push(key);
    }
    for (const [fn, run] of runs) {
      const covered = Array.from(run.values(), (c) => [c.p.join('.'), c.v]);
      try {
        fn(covered[0][0], covered[0][1], covered);
      } catch (e) {
        for (const c of run.values()) {
          if (c.madeAt) dropLeaf(T, c.madeAt); else setLeaf(T, c.p, cloneVal(c.before));
          refused.push([c.p.join('.'), 'binder']);
        }
        if (typeof console !== 'undefined' && console.error) console.error(`tune: binder for ${covered[0][0]} threw:`, e);
      }
    }
    // WHAT ACTUALLY LANDED, for the watchers — computed here and not by the
    // caller, because a binder that threw turns an accepted leaf into a
    // refused one after the fact, and a recorder that wrote down the patch it
    // ASKED for would emit a step whose values the tree never held.
    if (watchers.size) {
      const no = new Set(refused.map(([k]) => k));
      const landed = {};
      for (const [p, v] of entries) { const k = p.join('.'); if (!no.has(k)) landed[k] = cloneVal(v); }
      if (Object.keys(landed).length) fire({ kind: 'set', patch: landed, refused: [...refused] });
    }
    return { diff: diff(), refused, pending };
  }

  function set(patch, opts = {}) { return apply(entriesOf(patch), opts); }

  // THE DIFF WALKS BOTH TREES, NOT ONE (phase C4). Until rows existed every
  // leaf of T was a leaf of SHIPPED and the file's own leaves were the whole
  // question. A row added this session is a leaf T has and SHIPPED does not
  // (`shipped: undefined`), and a row REMOVED is the mirror of it
  // (`live: undefined`) — which is exactly what `changes()` hands patchYaml
  // to insert a row's lines or take them out again.
  function entryFor(p, shipped, live) {
    const spec = dialAt(p);
    return {
      path: p.join('.'), shipped, live,
      cls: spec ? spec.cls : null, read: spec ? spec.read : null,
      declared: hasLeaf(declared, p),
    };
  }

  function diff() {
    const out = [];
    const seen = new Set();
    for (const p of leaves(SHIPPED)) {
      const key = p.join('.');
      seen.add(key);
      const shipped = getLeaf(SHIPPED, p);
      const live = hasLeaf(T, p) ? getLeaf(T, p) : undefined;
      if (same(shipped, live)) continue;
      out.push(entryFor(p, shipped, live));
    }
    for (const p of leaves(T)) {
      if (seen.has(p.join('.'))) continue;
      out.push(entryFor(p, undefined, getLeaf(T, p)));
    }
    return out;
  }

  // ---- asset rows ---------------------------------------------------------
  //
  // A row lands or leaves WHOLE. There is no per-leaf `set` that can create
  // one — `apply` refuses a leaf whose ROW is not there — because a half-built
  // felt is a felt the merge site would have to guess the rest of, and
  // guessing is how a catalogue grows rows nobody wrote. (A FIELD of a row
  // that is there is a different question, and since D1 `apply` mints one:
  // a sparse recipe's absent fields are most of its fields.)
  const rowFire = (section) => {
    const fn = binderFor([section, '']);
    if (!fn) return;
    const live = getLeaf(T, [section]);
    try { fn(section, live, [[section, live]]); } catch (e) {
      // No rollback, unlike a dial's binder: a structural change has no
      // single previous value to put back, and the tree is already right —
      // it is the re-apply that failed, and the console is where that goes.
      if (typeof console !== 'undefined' && console.error) console.error(`tune: rows binder for ${section} threw:`, e);
    }
  };

  const result = (refused = []) => ({ diff: diff(), refused, pending: [] });

  // `where` is the COLLECTION the row lands in: a section name (`'felts'`) or
  // a path to one nested inside a row (`['houses', 'gildhall', 'dice']` — a
  // set inside a house). The two-argument form every C4 caller uses still
  // reads the same; the path form is what the catalogue needed (D1).
  function addRow(where, id, row = {}) {
    const at = toPath(where);
    const section = at[0];
    if (!ASSET_SECTIONS.includes(section)) return result([[at.join('.'), 'unknown']]);
    // 'section' MEANS "THAT PATH IS NOT A COLLECTION" (re-described in the D1
    // review). It used to mean "a section this build cannot declare rows in",
    // a state that no longer exists; what reaches it now is a path that names
    // a section but lands somewhere inside a row that is not a map of rows —
    // `addRow(['houses', 'std', 'label'], …)`, or a collection path with the
    // wrong number of segments.
    const shape = collectionShapeAt(at);
    if (!shape) return result([[at.join('.'), 'section']]);
    if (typeof id !== 'string' || !ASSET_ID_RE.test(id)) return result([[`${at.join('.')}.${id}`, 'id']]);
    if (row !== undefined && row !== null && !isPlain(row)) return result([[`${at.join('.')}.${id}`, 'type']]);
    // The collection's OWNER — the house a set is going into. `addRow` may
    // create the collection itself (a house with no `dice:` line yet) but
    // never the row above it: minting `houses.nowhere.dice.x` would leave a
    // set in a house nothing declares.
    const ownerPath = at.slice(0, -1);
    if (ownerPath.length && !isPlain(getLeaf(T, ownerPath))) {
      return result([[at.join('.'), 'row']]);
    }
    const refused = [];
    const built = reconcileFields(section, shape, row || {}, at.concat(id),
      (path, reason) => refused.push([path, reason]), !ASSET_SPARSE.includes(section));
    // …AND THE PAIR LAWS, for a row of the DIAL TREE (the D4 review): `addRow`
    // is the door a preset arrives through in the browser, as `createTune` is
    // the one it arrives through from the file, so it owes the same answer.
    // `checkLawPairs` drops the offending leaves out of `built` itself — the
    // row lands, minus the half-claim, with each dropped leaf named.
    if (DIAL_ROW_SECTIONS.includes(section) && at.length === 1) {
      checkLawPairs(dials, { [section]: { [id]: built } }, defaults,
        (path, reason) => refused.push([path, reason]));
    }
    if (!ownerPath.length) { if (!isPlain(T[section])) T[section] = {}; } else if (!isPlain(getLeaf(T, at))) {
      getLeaf(T, ownerPath)[at[at.length - 1]] = {};
    }
    getLeaf(T, at)[id] = built;
    rowFire(section);
    fire({ kind: 'addRow', where: at.join('.'), id });
    return result(refused);
  }

  function removeRow(where, id) {
    const at = toPath(where);
    const section = at[0];
    const owner = ASSET_SECTIONS.includes(section) ? getLeaf(T, at) : undefined;
    if (!isPlain(owner) || !Object.prototype.hasOwnProperty.call(owner, id)) {
      return result([[`${at.join('.')}.${id}`, 'unknown']]);
    }
    delete owner[id];
    rowFire(section);
    fire({ kind: 'removeRow', where: at.join('.'), id });
    return result();
  }

  // Every row of a section as it now stands, cloned — the merge site reads
  // this rather than reaching into T, so nothing outside can write a row.
  function rowsOf(section) {
    const live = getLeaf(T, [section]);
    return isPlain(live) ? deepClone(live) : {};
  }

  // Whether the FILE declares this row — a shipped row in the asset sense,
  // which reset restores rather than removes. `where` is the collection (a
  // section name, or a path to one) and `id` the row in it.
  function rowIsDeclared(where, id) { return isPlain(getLeaf(SHIPPED, toPath(where).concat(id))); }

  // The structural half of `reset`: put every asset section (or the one
  // section, or the one row) back to what the file says, adding what was
  // removed and dropping what was added. Returns the sections that moved, so
  // the caller fires their binders after the leaf patch has landed too.
  // A SCOPE THAT IS NOT A ROW IS NOT A ROW SCOPE (found by the C4 review,
  // 2026-09-03): `prefix[1]` was read without asking how long the prefix was,
  // so `reset('felts.house-moss.name')` reverted all six of the row's fields,
  // and `reset('felts.house-ash.name')` on a session row DELETED the row. The
  // panel never reached it (its revert glyph goes through `tune.set`), but
  // `tuneReset(path)` is a published hook and CONTRACTS says reset takes a
  // path. One field is a leaf: the leaf pass below already does it right.
  // `isRowPath` is what asks the question now, because since the catalogue
  // arrived (D1) a row is not always two segments deep — a set is four
  // (`houses.gildhall.dice.oxblood`) and its fields are five.
  function resetRows(prefix) {
    const moved = new Set();
    for (const s of ASSET_SECTIONS) {
      if (prefix.length && prefix[0] !== s) continue;
      // Three scopes move a map WHOLE: the section, a collection inside it
      // (`houses.gildhall.dice`) and a row (`houses.gildhall.dice.oxblood`).
      // Anything else is a field, and the leaf pass in `reset` has it.
      const at = prefix.length > 1 ? prefix : [s];
      if (prefix.length > 1 && !isRowPath(at) && collectionShapeAt(at) === null) continue;
      const owner = at.length === 1 ? T : getLeaf(T, at.slice(0, -1));
      const want = getLeaf(SHIPPED, at);
      if (same(want, getLeaf(T, at))) continue;
      // What the map sits IN has itself gone (a set whose house was removed):
      // the row is not the unit to put back — the house is, and `reset` at the
      // house's path or at the section's is the verb for that.
      if (!isPlain(owner)) continue;
      const key = at[at.length - 1];
      if (want === undefined) delete owner[key]; else owner[key] = deepClone(want);
      moved.add(s);
    }
    return moved;
  }

  function changes() {
    const out = {};
    for (const d of diff()) out[d.path] = d.live;
    return out;
  }

  // THE OTHER LEAVES THAT ARE ONE CLAIM WITH THIS ONE (a pair law), each with
  // the value the FILE ships for it — what a caller putting this leaf back has
  // to put back WITH it. A pair is judged against what the patch proposes, so
  // half a revert is refused by the half still standing: `set({'cards.depth':
  // 0.4})`, `set({'cards.standoff': 0.2})` — both legal, clear 0.0 — and then
  // `reset('cards.depth')` came back `[['cards.depth','geometry']]` with
  // nothing moved, so a typed value had no way home at all (the D4 review,
  // 2026-09-03). The pair the file ships holds by construction, which is what
  // makes widening a revert to the whole group always a legal state.
  // Empty for every leaf that stands alone, which is all but two of them.
  function lawMates(path) {
    const p = toPath(path);
    const d = dialAt(p);
    if (!isDial(d) || !d.law || !LAWS[d.law].pair) return [];
    const row = DIAL_ROW_SECTIONS.includes(p[0]) ? assetRowPath(p) : null;
    const at = row && p.length > row.length ? row : [];
    const shape = at.length ? ASSET_ROWS[at[0]] : dials;
    const out = [];
    for (const q of pairGroups(shape, defaultsFor(shape)).get(d.law) || []) {
      const full = at.concat(q);
      if (full.join('.') === p.join('.')) continue;
      // A sparse row's silent half has no shipped value to travel: the row's
      // own absence IS the default, and the default half always holds.
      if (!hasLeaf(SHIPPED, full)) continue;
      out.push([full.join('.'), getLeaf(SHIPPED, full)]);
    }
    return out;
  }

  function reset(scope = 'all') {
    let root = SHIPPED, prefix = [];
    if (scope !== 'all') prefix = toPath(scope);
    // Rows first, and structurally: an added row is not a leaf reset can put
    // back, it is a row reset must take away. Their binders run last, after
    // the leaf patch, so a merge site that reads both sees one settled tree.
    const rowsMoved = resetRows(prefix);
    if (scope !== 'all') {
      root = getLeaf(SHIPPED, prefix);
      if (root === undefined) {
        // A scope that named only rows (`reset('felts')` with no felts in the
        // file) is not an unknown scope — it just did its whole work above.
        if (rowsMoved.size) { for (const s of rowsMoved) rowFire(s); return result(); }
        // A field of a row this session MINTED has no shipped value to go back
        // to; the row is what there is to take away, and `removeRow` is the
        // verb for that. Refusing by name beats reverting a field to a default
        // the file never said.
        if (prefix.length > 2 && ASSET_SECTIONS.includes(prefix[0]) && hasLeaf(T, prefix)) {
          return { diff: diff(), refused: [[dotted(prefix), 'row']], pending: [] };
        }
        return { diff: diff(), refused: [[dotted(prefix), 'unknown']], pending: [] };
      }
    }
    const paths = isPlain(root) ? leaves(root, prefix) : [prefix];
    const entries = [];
    for (const p of paths) {
      const shipped = getLeaf(SHIPPED, p);
      if (!same(shipped, getLeaf(T, p))) entries.push([p, shipped]);
    }
    // A PAIR GOES BACK TOGETHER (the D4 review, 2026-09-03). A scope that
    // names one leaf of a pair group widens to the whole group — the same
    // widening `checkLawPairs` does at birth, and for the same reason it gives
    // there: "the pair the code ships holds by construction, so putting both
    // back is always a legal state". Without it a `reset` of half a pair is
    // judged against the half the session had typed and refused, so the shipped
    // value was unreachable from the one verb whose whole job is reaching it.
    // Scopes that already carry both halves (`'cards'`, `'all'`) add nothing.
    for (const [p] of entries.slice()) {
      for (const [mate, shipped] of lawMates(p)) {
        const mp = toPath(mate);
        if (entries.some(([q]) => q.join('.') === mate)) continue;
        if (same(shipped, getLeaf(T, mp))) continue;
        entries.push([mp, shipped]);
      }
    }
    const r = apply(entries, { filmLocked: false });
    for (const s of rowsMoved) rowFire(s);
    return rowsMoved.size ? { ...r, diff: diff() } : r;
  }

  // WHAT THE FILE IS PATCHED WITH, which is `changes()` with one difference:
  // a row that was REMOVED leaves as a ROW, not as six absent leaves. Taking
  // its leaves out one at a time is what patchYaml's own "the map's last
  // child left" rule turns into `house-moss: {}` — an empty row that the
  // reader then fills back out with the row defaults on the next boot, so
  // Remove followed by Save followed by reload would hand the row back. One
  // change at the row's path takes its lines out and leaves nothing behind.
  //
  // The Save ROUTE still posts `changes()`, and a removal cannot travel that
  // way at all: `undefined` does not survive JSON, so a removed row is a
  // Download-and-apply job until the route learns to carry one (phase 3).
  function exportChanges() {
    const out = {};
    const gone = [];
    for (const d of diff()) {
      const p = toPath(d.path);
      const row = d.live === undefined ? assetRowPath(p) : null;
      if (row) {
        const key = row.join('.');
        if (!gone.includes(key)) gone.push(key);
        continue;
      }
      out[d.path] = d.live;
    }
    // ONLY THE SHALLOWEST ROW OF A REMOVAL. A house that left took its sets
    // with it, so its leaves name two removed rows at once — the house and
    // each set inside it. Asking patchYaml for both would ask it to take out
    // lines the first change already took out, at line numbers that no longer
    // mean what they meant. The house is the removal; the sets went with it.
    for (const key of gone) {
      if (gone.some((o) => o !== key && key.startsWith(`${o}.`))) continue;
      out[key] = undefined;
    }
    return out;
  }

  function exportYaml() {
    if (!source) throw new Error('exportYaml: no source text to patch');
    return patchYaml(source, exportChanges());
  }

  // The "Copy patch" fragment. Nothing changed is an empty fragment (which
  // parses to an empty map), not a root-level `{}`. A removed row is not in
  // it: a fragment says what to SET, and there is no way to write "this row
  // is gone" in one — Download carries a removal, a copied patch does not.
  function patchText() {
    const tree = {};
    for (const [k, v] of Object.entries(changes())) if (v !== undefined) setLeaf(tree, k, v);
    return Object.keys(tree).length ? emitYaml(tree) : '';
  }

  function applyPatchText(text, opts = {}) {
    const { tree } = parseYaml(String(text ?? ''));
    const entries = isPlain(tree) ? leaves(tree).map((p) => [p, getLeaf(tree, p)]) : [];
    return apply(entries, opts);
  }

  // THE DIAL SECTIONS ONLY. An asset section in SHIPPED (a `felts:` the file
  // declares) is not a section of rows the panel can draw from a dial tree —
  // it gets a bespoke editor instead (js/devmode.js `felts`), and two panel
  // sections of one name would collide in its section map.
  function sections() { return Object.keys(SHIPPED).filter((k) => !ASSET_SECTIONS.includes(k)); }

  return {
    SHIPPED, T, refusals, dialAt, get, set, diff, reset, bind, binderFor, watch,
    changes, exportYaml, patchText, applyPatchText, sections,
    addRow, removeRow, rowsOf, rowIsDeclared, lawMates,
  };
}
