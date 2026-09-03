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

function dial(label, def, range, options, cls, read, why) {
  if (typeof label !== 'string' || !label) throw new Error('dial: label is required');
  if (!CLASSES.includes(cls)) throw new Error(`dial ${label}: cls must be look|film, got ${cls}`);
  if (!READS.includes(read)) throw new Error(`dial ${label}: read must be one of ${READS.join('|')}, got ${read}`);
  const d = { label, def, range: range || null, cls, read, why: why || '' };
  if (options) d.options = options.slice();
  return d;
}

// A per-viewer dial: light, fog, camera, pacing, chrome. Never locks.
export function look(label, def, range, read, why = '') {
  return dial(label, def, range, null, 'look', read, why);
}

// A dial that feeds the shared bake. Live at a table of one; locked when a
// second viewer is present (GOALPOST 2: no forked film).
export function film(label, def, range, read, why = '') {
  return dial(label, def, range, null, 'film', read, why);
}

// An enum. `options` is the law: `set` refuses a value outside it.
export function pick(label, def, options, cls, read, why = '') {
  if (!Array.isArray(options) || options.length < 2) throw new Error(`dial ${label}: an enum needs at least two options`);
  return dial(label, def, null, options, cls, read, why);
}

export function isDial(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x)
    && typeof x.label === 'string' && 'def' in x
    && CLASSES.includes(x.cls) && READS.includes(x.read);
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
// nowhere to say which was meant. js/yaml.js is ready for the day this is
// lifted (`formatKey` quotes a dotted key and `readKey` refuses an unquoted
// one), and the day is when `sets:` arrives, because a dice-set id genuinely
// carries dots today (`emberforge.blackanvil`). Until then a house felt is
// `house-moss` and a dotted id is refused with its path, which is the only
// honest answer a build that cannot round-trip it can give.
export const ASSET_SECTIONS = Object.freeze(['sets', 'felts', 'towers', 'venues']);
// A row id: lower-case, digits, `-` and `_`, 32 characters. The house prefix
// (`house-`) is a CONVENTION and not enforced here — what actually protects a
// shipped row is the collision check at the merge site (js/main.js
// `feltThemesSync`, where the shipped row stands and one console line says so),
// because that is the only place that knows what is shipped.
export const ASSET_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const ASSET_ID_WHY = 'lower-case letters, digits, "-" and "_", 32 characters, no dot';

// THE FELT ROW — js/main.js's `FELT_THEMES` row, field for field, as dials.
// `mottle` and `breath` are absent from most shipped rows and mean 1 there
// (main.js: "absent means 1, the shipped beat"), so 1 is the default here and
// a row that says nothing about them gets the shipped behaviour.
//
// `cloth` NAMES A PAINTER AND THE PAINTERS ARE CODE (DEVMODE §9: "Code-only
// stays code-only"). The options are the three in main.js's FELT_CLOTHS; a
// fourth cloth is a function somebody writes, and then a line here.
const FELT_ROW = Object.freeze({
  name: look('name', 'House felt', null, 'apply', 'what the swatch is called in the picker'),
  cloth: pick('cloth', 'felt', ['felt', 'silt', 'oak'], 'look', 'apply',
    'the painter this mat is made of — main.js FELT_CLOTHS; a new one is code, not a row'),
  feltBase: look('felt base', '#1c1c24', null, 'apply', 'the cloth\'s own colour, and the seed its grain is drawn from'),
  // `scene bg`, not `scene background`: the label column is 320px of mono and
  // the long form measured as "scene back…", which is the half that says
  // nothing. The sentence lives in the tooltip, where there is room for it.
  sceneBg: look('scene bg', '#0f0f13', null, 'apply', 'the room behind the table, and the fog\'s colour'),
  breath: look('breath depth', 1, [0, 2, 0.05], 'apply',
    'how far this cloth takes the declare beat — a darker cloth has less light to lose, so it must lose more of it'),
  mottle: look('mottle', 1, [0, 2, 0.05], 'apply', 'how unevenly the nap catches the light; a raked bed wants less'),
});

// section → the row's dials, or null for a section this build cannot yet
// declare rows in. Absent is not the same as empty: `sets`, `towers` and
// `venues` are named here so a row under one of them is refused with the
// reason it actually has (phase 3, not "no such section").
export const ASSET_ROWS = Object.freeze({
  sets: null,
  felts: FELT_ROW,
  towers: null,
  venues: null,
});

// A fresh row of a section's defaults — what an editor's Clone starts from
// and what `addRow` fills the fields a caller left out with.
export function assetRowDefaults(section) {
  const fields = ASSET_ROWS[section];
  if (!fields) return null;
  const out = {};
  for (const [k, d] of Object.entries(fields)) out[k] = Array.isArray(d.def) ? d.def.slice() : d.def;
  return out;
}

// The dial for one leaf of an asset row, or a STRING saying why there is
// none — the same two-shaped answer js/dice-apply-core.js's `dialFor` gives,
// so that file can hand an asset path straight here.
export function assetDialFor(path) {
  const p = toPath(path);
  const [section, id, field] = p;
  if (!ASSET_SECTIONS.includes(section)) return 'no dial at this path';
  const fields = ASSET_ROWS[section];
  if (!fields) return `\`${section}:\` rows are not declarable in this build (docs/DEVMODE.md §9, phase 3)`;
  if (id === undefined) return `\`${section}:\` is a map of rows; name one`;
  if (!ASSET_ID_RE.test(String(id))) return `${JSON.stringify(String(id))} is not a legal ${section} id (${ASSET_ID_WHY})`;
  if (field === undefined) return `${section}.${id} is a row of fields; name one`;
  // Four segments and up is almost always a DOTTED ID read as extra levels
  // (`felts.house.moss.cloth`), so the message names that rather than only
  // the depth — it is the mistake this path is here to explain.
  if (p.length > 3) return `${section} rows are one level deep: ${JSON.stringify(`${id}.${field}`)} `
    + `reads as a row and a field, and an id may not contain a dot (${ASSET_ID_WHY})`;
  const d = fields[field];
  return isDial(d) ? d : `no ${section} field named ${JSON.stringify(String(field))} `
    + `(${Object.keys(fields).join(', ')})`;
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
      dur: look('breath duration', 0.6, [0.05, 3, 0.05], 'apply', 'seconds, each way'),
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
    tempo: {
      k: look('tempo', 1, [0.25, 4, 0.05], 'frame', 'playback speed, never the bake'),
      flight: look('flight tempo', 0.8, [0.1, 4, 0.05], 'frame', 'the tumble, a touch slower than raw'),
      settle: look('settle tempo', 25, [1, 60, 0.5], 'frame', 'the tail is effectively skipped'),
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
  // RELOAD, every one of them: js/placard.js bakes one instanced rig at boot
  // and the anchors are computed from these numbers at every flush. Moving a
  // dial marks the row ⟳ and the next boot wears it.
  cards: {
    standoff: film('card standoff', 0.86, [0.2, 4, 0.01], 'reload',
      'the card centre outboard of the rim; standoff − depth/2 is the clear ground no die can cross'),
    width: film('card width', 3.68, [1, 8, 0.01], 'reload', 'across the chair\'s ray'),
    depth: film('card depth', 1.52, [0.4, 4, 0.01], 'reload', 'along the chair\'s ray'),
  },
};

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
      const want = typeOf(d.def);
      if (isPlain(v)) { refuse(path, 'shape', `expected ${want}, got a map; the default stands`); continue; }
      if (typeOf(v) !== want || (want === 'number' && !Number.isFinite(v))) {
        refuse(path, 'type', `expected ${want}, got ${JSON.stringify(v)}; the default stands`);
        continue;
      }
      if (d.options && !d.options.includes(v)) {
        refuse(path, 'option', `expected one of ${d.options.join('|')}, got ${JSON.stringify(v)}; the default stands`);
        continue;
      }
      out[k] = v;
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

// One asset section of the declaration against its row shape: every row is
// filled out to the whole shape (a field the file omits gets the row
// default, exactly as an omitted dial gets its own), and a bad id, a bad
// field or a bad value is dropped by NAME with the default standing. Returns
// the reconciled section, or null when the section itself is refused —
// dropping a section wholesale rather than half of it, because half a
// catalogue is the harder thing to notice.
function reconcileRows(section, decl, refuse) {
  const fields = ASSET_ROWS[section];
  if (!fields) {
    refuse(section, 'section', `\`${section}:\` rows are not declarable in this build (docs/DEVMODE.md §9, phase 3); the whole section is dropped`);
    return null;
  }
  if (decl === null) return null;                       // absent, like a null at a dial
  if (!isPlain(decl)) {
    refuse(section, 'shape', `expected a map of rows, got ${JSON.stringify(decl)}; the section is dropped`);
    return null;
  }
  const out = {};
  for (const [id, row] of Object.entries(decl)) {
    const at = `${section}.${id}`;
    if (!ASSET_ID_RE.test(id)) {
      refuse(at, 'key', `${JSON.stringify(id)} is not a legal ${section} id (${ASSET_ID_WHY}); the row is dropped`);
      continue;
    }
    if (row === null) continue;
    if (!isPlain(row)) {
      refuse(at, 'shape', `expected a map of fields, got ${JSON.stringify(row)}; the row is dropped`);
      continue;
    }
    const built = assetRowDefaults(section);
    for (const [k, v] of Object.entries(row)) {
      const d = fields[k];
      if (!isDial(d)) {
        refuse(`${at}.${k}`, 'unknown', `no ${section} field named ${JSON.stringify(k)} (${Object.keys(fields).join(', ')}); it is dropped`);
        continue;
      }
      if (v === null) continue;
      const want = typeOf(d.def);
      if (isPlain(v)) { refuse(`${at}.${k}`, 'shape', `expected ${want}, got a map; the default stands`); continue; }
      if (typeOf(v) !== want || (want === 'number' && !Number.isFinite(v))) {
        refuse(`${at}.${k}`, 'type', `expected ${want}, got ${JSON.stringify(v)}; the default stands`);
        continue;
      }
      if (d.options && !d.options.includes(v)) {
        refuse(`${at}.${k}`, 'option', `expected one of ${d.options.join('|')}, got ${JSON.stringify(v)}; the default stands`);
        continue;
      }
      built[k] = v;
    }
    out[id] = built;
  }
  return out;
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
  Object.freeze(refusals);

  const SHIPPED = deepFreeze(merge(defaultsOf(dials), declared));
  const T = deepClone(SHIPPED);
  const binders = new Map();

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
    for (const [p, v] of entries) {
      const key = p.join('.');
      // WHAT A LEAF IS, once rows exist: SHIPPED names every dial and every
      // row the FILE declares, and T additionally holds the rows added since
      // (`addRow`). A write into a row this session minted is not 'unknown' —
      // it is how the felt editor moves a slider — so its type is read from T
      // where SHIPPED has nothing to say.
      const inShipped = hasLeaf(SHIPPED, p);
      if (!inShipped && !hasLeaf(T, p)) { refused.push([key, 'unknown']); continue; }
      // …AND A ROW THAT IS GONE IS GONE (found by the C4 review, 2026-09-03).
      // SHIPPED still names every leaf of a row the FILE declares after
      // `removeRow` took it out of T, so `hasLeaf(SHIPPED, p)` alone let one
      // leaf write mint a row back — one field of the removed row and five
      // guessed from FELT_ROW_DEFAULTS, a felt called Moss wearing obsidian's
      // colours, while `exportChanges` still said the row was gone. That is
      // exactly the half-built felt the comment below `diff` says must be
      // impossible. The row is the unit: put it back whole (`reset` at the
      // row's path) or leave it out.
      if (p.length > 2 && ASSET_SECTIONS.includes(p[0]) && !isPlain(getLeaf(T, [p[0], p[1]]))) {
        refused.push([key, 'row']);
        continue;
      }
      if (STATIC_PATHS.includes(key)) { refused.push([key, 'static']); continue; }
      const spec = dialAt(p);
      if (spec && spec.cls === 'film' && filmLocked) { refused.push([key, 'film']); continue; }
      if (!typeFits(inShipped ? getLeaf(SHIPPED, p) : getLeaf(T, p), v)) { refused.push([key, 'type']); continue; }
      if (spec && spec.options && !spec.options.includes(v)) { refused.push([key, 'option']); continue; }
      const before = getLeaf(T, p);
      const moved = !same(before, v);
      setLeaf(T, p, cloneVal(v));
      const fn = binderFor(p);
      if (fn) {
        let run = runs.get(fn);
        if (!run) { run = new Map(); runs.set(fn, run); }
        const prev = run.get(key);                // the same leaf twice in one patch: the first `before` is the real one
        run.set(key, { p, v, before: prev ? prev.before : before });
      } else if (spec && spec.read === 'reload' && moved) pending.push(key);
    }
    for (const [fn, run] of runs) {
      const covered = Array.from(run.values(), (c) => [c.p.join('.'), c.v]);
      try {
        fn(covered[0][0], covered[0][1], covered);
      } catch (e) {
        for (const c of run.values()) {
          setLeaf(T, c.p, cloneVal(c.before));
          refused.push([c.p.join('.'), 'binder']);
        }
        if (typeof console !== 'undefined' && console.error) console.error(`tune: binder for ${covered[0][0]} threw:`, e);
      }
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
  // one — `apply` refuses a path neither tree has — because a half-built felt
  // is a felt the merge site would have to guess the rest of, and guessing is
  // how a catalogue grows rows nobody wrote.
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

  function addRow(section, id, row = {}) {
    if (!ASSET_SECTIONS.includes(section)) return result([[String(section), 'unknown']]);
    const fields = ASSET_ROWS[section];
    if (!fields) return result([[String(section), 'section']]);
    if (typeof id !== 'string' || !ASSET_ID_RE.test(id)) return result([[`${section}.${id}`, 'id']]);
    if (row !== undefined && row !== null && !isPlain(row)) return result([[`${section}.${id}`, 'type']]);
    const refused = [];
    const built = assetRowDefaults(section);
    for (const [k, v] of Object.entries(row || {})) {
      const d = fields[k];
      const at = `${section}.${id}.${k}`;
      if (!isDial(d)) { refused.push([at, 'unknown']); continue; }
      if (v === null) continue;                       // absent: the default stands
      if (typeof v === 'boolean' || !typeFits(d.def, v)) { refused.push([at, 'type']); continue; }
      if (d.options && !d.options.includes(v)) { refused.push([at, 'option']); continue; }
      built[k] = v;
    }
    if (!isPlain(T[section])) T[section] = {};
    T[section][id] = built;
    rowFire(section);
    return result(refused);
  }

  function removeRow(section, id) {
    if (!ASSET_SECTIONS.includes(section) || !isPlain(T[section])
      || !Object.prototype.hasOwnProperty.call(T[section], id)) {
      return result([[`${section}.${id}`, 'unknown']]);
    }
    delete T[section][id];
    rowFire(section);
    return result();
  }

  // Every row of a section as it now stands, cloned — the merge site reads
  // this rather than reaching into T, so nothing outside can write a row.
  function rowsOf(section) {
    const live = getLeaf(T, [section]);
    return isPlain(live) ? deepClone(live) : {};
  }

  // Whether the FILE declares this row — a shipped row in the asset sense,
  // which reset restores rather than removes.
  function rowIsDeclared(section, id) { return isPlain(getLeaf(SHIPPED, [section, id])); }

  // The structural half of `reset`: put every asset section (or the one
  // section, or the one row) back to what the file says, adding what was
  // removed and dropping what was added. Returns the sections that moved, so
  // the caller fires their binders after the leaf patch has landed too.
  // A SCOPE DEEPER THAN A ROW IS NOT A ROW SCOPE (found by the C4 review,
  // 2026-09-03): `prefix[1]` was read without asking how long the prefix was,
  // so `reset('felts.house-moss.name')` reverted all six of the row's fields,
  // and `reset('felts.house-ash.name')` on a session row DELETED the row. The
  // panel never reached it (its revert glyph goes through `tune.set`), but
  // `tuneReset(path)` is a published hook and CONTRACTS says reset takes a
  // path. One field is a leaf: the leaf pass below already does it right.
  function resetRows(prefix) {
    const moved = new Set();
    if (prefix.length > 2) return moved;
    for (const s of ASSET_SECTIONS) {
      if (prefix.length && prefix[0] !== s) continue;
      if (prefix.length > 1) {
        const id = prefix[1];
        const want = getLeaf(SHIPPED, [s, id]);
        const have = getLeaf(T, [s, id]);
        if (same(want, have)) continue;
        if (want === undefined) { if (isPlain(T[s])) delete T[s][id]; } else {
          if (!isPlain(T[s])) T[s] = {};
          T[s][id] = deepClone(want);
        }
        moved.add(s);
        continue;
      }
      const want = Object.prototype.hasOwnProperty.call(SHIPPED, s) ? SHIPPED[s] : undefined;
      const have = Object.prototype.hasOwnProperty.call(T, s) ? T[s] : undefined;
      if (same(want, have)) continue;
      if (want === undefined) delete T[s]; else T[s] = deepClone(want);
      moved.add(s);
    }
    return moved;
  }

  function changes() {
    const out = {};
    for (const d of diff()) out[d.path] = d.live;
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
    const gone = new Set();
    for (const d of diff()) {
      const p = toPath(d.path);
      if (d.live === undefined && p.length > 2 && ASSET_SECTIONS.includes(p[0])) {
        const row = `${p[0]}.${p[1]}`;
        if (!gone.has(row)) { gone.add(row); out[row] = undefined; }
        continue;
      }
      out[d.path] = d.live;
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
    SHIPPED, T, refusals, dialAt, get, set, diff, reset, bind, binderFor,
    changes, exportYaml, patchText, applyPatchText, sections,
    addRow, removeRow, rowsOf, rowIsDeclared,
  };
}
