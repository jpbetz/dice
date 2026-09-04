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

// THE DICE CATALOGUE'S DRIFT GUARD (developer mode phase D1, 2026-09-03).
//
// The recipes left js/themes.js for `houses:` in dice.yaml. The migration
// itself was proved once, offline, by building the catalogue from the new file
// and deep-comparing it to the THEMES literal that had just been deleted:
// THEMES, SETS and SET_IDS were identical, field for field and in order. That
// proof cannot live here, because the thing it compared against is gone — so
// what stays is the guard that keeps the file HONEST from here on, and it has
// three parts, none of which is a restatement of the file:
//
//   1. NOTHING IS SILENTLY DROPPED. js/tune.js reconciles the declaration
//      against the row shape and drops what does not fit, per path, with the
//      default standing — which is right for a hand-edited file and wrong as a
//      silent outcome for the shipped catalogue. A misspelt `bevl:` would
//      render a differently-shaped die and say nothing. Here every leaf of the
//      file must survive reconciliation, and `tune.refusals` must be empty.
//   2. THE OPTION LISTS ARE THE CODE'S. Every enum in the recipe shape names a
//      FUNCTION somebody wrote (a relief pattern, a particle kind, a decal, an
//      impact voice, a face symbol, a die-light envelope). Those live in
//      modules that import three.js and so cannot be imported by a Node test —
//      so their sources are READ, and the options are compared to the keys
//      actually defined there. Add a painter and forget the word here and this
//      goes red; write a word here for a painter that does not exist and it
//      goes red the other way.
//   3. THE PICKER'S ORDER IS PINNED. `SET_IDS` is the list the server answers
//      a roll's `set:` with and the order the picker draws; it is written out
//      once as a literal so that reordering a house, renaming a set or losing
//      one is a visible diff in a review rather than a silent re-shuffle of
//      everybody's chips.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYaml } from '../js/yaml.js';
import { createTune, ASSET_ROWS, ASSET_SECTIONS, ASSET_SPARSE, isDial, leaves, getLeaf, toPath } from '../js/tune.js';
import { buildCatalogue, installCatalogue, THEMES, SETS, SET_IDS, registerSet } from '../js/themes.js';
// Node-pure, so the impact bodies can be compared to the real table rather
// than to a copy of it.
import { IMPACT_VOICES, IMPACT_DEFAULT_BODY } from '../js/voices.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.stack || e.message}`);
    process.exitCode = 1;
  }
};

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const text = src('../dice.yaml');
const { tree } = parseYaml(text);
const tune = createTune({ declared: tree, source: text });
const RECIPE = ASSET_ROWS.houses.dice.rows;

// The top-level keys of a `const NAME = {` … `\n};` block in a module this
// test may not import. Deliberately strict: a key is a bare identifier at one
// indent, followed by `:` or by `(` (an object method — js/particles.js and
// js/dice.js both write their kind tables as methods).
function blockKeys(source, decl) {
  const at = source.indexOf(decl);
  assert.notEqual(at, -1, `${decl} is not in that file any more`);
  const body = source.slice(at + decl.length);
  const end = body.indexOf('\n};');
  assert.notEqual(end, -1, `${decl} has no closing brace at column 0`);
  const keys = [];
  for (const line of body.slice(0, end).split('\n')) {
    const m = /^ {2}([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// 1. The file survives its own reconciliation
// ---------------------------------------------------------------------------

t('every leaf of `houses:` fits its dial: nothing dropped, nothing refused', () => {
  assert.deepEqual(tune.refusals, [], 'the shipped catalogue is refusal-free');
  const declared = leaves(tree).map((p) => p.join('.')).filter((p) => p.startsWith('houses.'));
  assert.ok(declared.length > 250, `the catalogue is ~300 leaves, got ${declared.length}`);
  for (const p of declared) {
    const v = getLeaf(tree, toPath(p));
    // `glow: null` is a LINE, not a value: a null is absent everywhere in this
    // design, so the reconciled tree has no key there. Three sets write it, to
    // say the digits carry all the light (js/themes.js).
    if (v === null) {
      assert.match(p, /\.glow$/, `${p}: a null at a leaf that is not the documented one`);
      assert.equal(getLeaf(tune.SHIPPED, toPath(p)), undefined, `${p}: a null is absent`);
      continue;
    }
    const d = tune.dialAt(p);
    assert.ok(isDial(d), `dice.yaml names ${p} and the recipe shape has no dial for it`);
    assert.deepEqual(getLeaf(tune.SHIPPED, toPath(p)), v, `${p} did not survive reconciliation`);
  }
});

t('the catalogue is SPARSE: a field the file does not name stays absent', () => {
  // `presets` joined the list in phase D4 for the same reason and a different
  // one: a preset row names the three leaves it moves, and a filled one would
  // be the whole declaration written twice.
  assert.deepEqual([...ASSET_SPARSE], ['houses', 'presets']);
  assert.ok(ASSET_SECTIONS.includes('houses'));
  const ivory = tune.SHIPPED.houses.classics.dice.ivory;
  assert.deepEqual(Object.keys(ivory), ['label', 'body', 'text', 'accent', 'feel']);
  assert.equal(ivory.particles, undefined, 'unadorned means unadorned: no particles filled in');
  assert.equal(ivory.rest, undefined, 'and no cadence — "sets without `rest` do not cadence"');
  assert.equal(ivory.light, undefined);
  assert.equal(ivory.post, undefined);
  // …and the FELT section is the other kind, still filled out to its shape.
  const felts = createTune({ declared: { felts: { 'house-x': { name: 'X' } } } });
  assert.equal(Object.keys(felts.SHIPPED.felts['house-x']).length, 6, 'a felt row is filled');
});

// ---------------------------------------------------------------------------
// 2. The option lists are the code's
// ---------------------------------------------------------------------------

t('every recipe enum names things the code actually defines', () => {
  const dice = src('../js/dice.js');
  const patterns = blockKeys(dice, 'const PATTERNS = {');
  assert.deepEqual(RECIPE.maps.relief.pattern.options, patterns, 'relief patterns are js/dice.js PATTERNS');
  assert.deepEqual(RECIPE.maps.roughPattern.options, patterns, 'and the roughness map draws the same ones');

  // FACE_SHAPES plus the six digits: `faces[value - 1]` is either a digit
  // string, which paints as a digit, or a symbol name (js/dice.js).
  const shapes = blockKeys(dice, 'export const FACE_SHAPES = {');
  assert.deepEqual(RECIPE.faces.each, ['1', '2', '3', '4', '5', '6', ...shapes]);
  assert.equal(RECIPE.faces.def.length, 6, 'a d6 table is six entries');

  assert.deepEqual(RECIPE.particles.kind.options, blockKeys(src('../js/particles.js'), 'const KINDS = {'));
  assert.deepEqual(
    RECIPE.decal.kind.options.slice().sort(),
    Object.keys(JSON.parse(`{${/const KIND_ROW = \{([^}]*)\}/.exec(src('../js/decals.js'))[1]
      .replace(/(\w+):/g, '"$1":')}}`)).sort(),
    'decal kinds are js/decals.js KIND_ROW — the atlas has a painted row per kind');

  assert.deepEqual(RECIPE.sound.body.options.slice().sort(), Object.keys(IMPACT_VOICES).sort());
  assert.equal(RECIPE.sound.body.def, IMPACT_DEFAULT_BODY,
    'and absent resolves to the default body, so the default IS the default body');

  // js/dielights.js's envelope switch: three named cases and `default`, which
  // its own comment calls the steady containment hum.
  const lights = src('../js/dielights.js');
  const modes = [...lights.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]);
  assert.deepEqual(RECIPE.light.mode.options.slice().sort(), ['steady', ...modes].sort());
});

t('the recipe shape is dials all the way down, with defaults of their own type', () => {
  const walk = (shape, at) => {
    for (const [k, d] of Object.entries(shape)) {
      const p = at.concat(k);
      if (!isDial(d)) { walk(d, p); continue; }
      assert.notEqual(d.def, undefined, `${p.join('.')} has no def`);
      assert.notEqual(typeof d.def, 'boolean', `${p.join('.')} is a boolean; the file may not hold one`);
      assert.ok(d.label.length > 0, `${p.join('.')} has no label`);
      // Every recipe field is per-viewer chrome — a set is a SKIN over the
      // (type, variant) seam and cannot change how a die lands — except the
      // face table, which two tabs have to agree on. See js/tune.js RECIPE.
      assert.equal(d.cls, p.at(-1) === 'faces' ? 'film' : 'look', `${p.join('.')} class`);
      if (d.options) {
        assert.ok(d.options.includes(d.def), `${p.join('.')} def is not one of its options`);
        for (const o of d.options) {
          assert.equal(typeof o, 'string');
          assert.ok(!/^(true|false|yes|no|on|off|y|n)$/i.test(o), `${p.join('.')}: ${o} is a boolean word`);
        }
      }
      if (d.each) assert.ok(d.def.every((e) => d.each.includes(e)), `${p.join('.')} def is not in its vocabulary`);
      // EVERY LIST DIAL DECLARES HOW MANY THE CODE READS (the D1 review): a
      // null `each` says "not a fixed vocabulary", which used to be read as
      // "no law at all" and let a palette of numbers through.
      if (Array.isArray(d.def)) {
        assert.ok(Array.isArray(d.len) && d.len[0] >= 1 && d.len[1] >= d.len[0], `${p.join('.')} has no len`);
        assert.ok(d.def.length >= d.len[0] && d.def.length <= d.len[1], `${p.join('.')} def is outside its len`);
        assert.ok(d.def.every((e) => typeof e === 'string'), `${p.join('.')} def holds something that is not a string`);
      }
      if (d.range) {
        const [lo, hi, step] = d.range;
        assert.ok(lo < hi && step > 0, `${p.join('.')} range`);
        assert.ok(d.def >= lo && d.def <= hi, `${p.join('.')} def outside its range`);
      }
      if (typeof d.def === 'string' && d.def.startsWith('#')) assert.match(d.def, /^#[0-9a-f]{6}$/);
    }
  };
  walk(RECIPE, ['houses', 'x', 'dice', 'y']);
  assert.deepEqual(Object.keys(ASSET_ROWS.houses), ['label', 'line', 'dice']);
});

// ---------------------------------------------------------------------------
// 3. What the app reads
// ---------------------------------------------------------------------------

// PINNED ON PURPOSE. Renaming a set, reordering a house or dropping one is a
// change to what every player's picker shows and to what the wire accepts;
// this list is here so that change is read in a diff and not discovered.
const SHIPPED_SET_IDS = [
  'classics.ivory', 'classics.ivorypips', 'classics.onyx', 'classics.slate',
  'classics.crimson', 'classics.cobalt', 'classics.emerald', 'classics.brass',
  'tidewrack.seaglass',
  'wildwood.heartwood', 'wildwood.sapamber',
  'stormcall.boltglass',
  'rimehold.deepglacier',
  'emberforge.blackanvil',
  'arcanum.focuscrystal',
  'umbra.voidgrain',
  'reliquary.scrimshaw',
  'moonmoot.witchlight',
  'symbols.monster', 'symbols.fate', 'symbols.kind', 'symbols.cruel',
  'gildhall.oxblood',
];

t('buildCatalogue: the flat registry, in the file\'s order, annotated with its house', () => {
  const built = buildCatalogue(tune.SHIPPED.houses);
  assert.deepEqual(built.SET_IDS, SHIPPED_SET_IDS);
  assert.deepEqual(Object.keys(built.THEMES), [...new Set(SHIPPED_SET_IDS.map((id) => id.split('.')[0]))]);
  for (const id of built.SET_IDS) {
    const [houseId, setId] = id.split('.');
    const row = built.SETS[id];
    assert.equal(row.house, houseId);
    assert.equal(row.houseLabel, built.THEMES[houseId].label);
    assert.equal(row.houseLine, built.THEMES[houseId].line);
    const { house, houseLabel, houseLine, ...recipe } = row;
    assert.deepEqual(built.THEMES[houseId].sets[setId], recipe,
      `${id}: the two-level tree and the flat registry are one recipe`);
    assert.ok(typeof row.label === 'string' && row.label, `${id} has no label`);
    assert.ok(/^#[0-9a-f]{6}$/.test(row.body) && /^#[0-9a-f]{6}$/.test(row.text), `${id}: a set names its body and its numbers`);
  }
});

t('the three enum translations, and nothing else changes shape', () => {
  const built = buildCatalogue(tune.SHIPPED.houses);
  // venueOnly — the set resolves everywhere and takes no chip in the picker.
  assert.equal(built.SETS['moonmoot.witchlight'].venueOnly, true);
  assert.equal(built.SETS['moonmoot.witchlight'].where, undefined, 'the file\'s word does not ride along');
  // beta — the closed-beta channel decides where a set may be PICKED, never
  // what it does (js/stability.js, the one law).
  assert.equal(built.SETS['symbols.monster'].beta, true);
  assert.equal(built.SETS['symbols.monster'].channel, undefined);
  // post.bloom — a marker with no strength knob.
  assert.equal(built.SETS['emberforge.blackanvil'].post.bloom, true);
  assert.deepEqual(built.SETS['emberforge.blackanvil'].post.ring, { amp: 6, jolt: 2.5, speed: 1100 },
    'and the rest of `post` is carried untouched');
  // Exactly these, and no others: a set that says nothing says nothing.
  const venue = built.SET_IDS.filter((id) => built.SETS[id].venueOnly);
  const beta = built.SET_IDS.filter((id) => built.SETS[id].beta);
  const bloom = built.SET_IDS.filter((id) => built.SETS[id].post && built.SETS[id].post.bloom);
  assert.deepEqual(venue, ['moonmoot.witchlight']);
  assert.deepEqual(beta, ['symbols.monster']);
  assert.deepEqual(bloom, ['tidewrack.seaglass', 'stormcall.boltglass', 'rimehold.deepglacier',
    'emberforge.blackanvil', 'arcanum.focuscrystal', 'umbra.voidgrain', 'moonmoot.witchlight']);
  for (const id of built.SET_IDS) {
    assert.equal(built.SETS[id].where, undefined, `${id}`);
    assert.equal(built.SETS[id].channel, undefined, `${id}`);
    if (built.SETS[id].post) assert.notEqual(built.SETS[id].post.bloom, 'source', `${id}`);
  }
});

t('installCatalogue fills the exports IN PLACE, and registerSet extends the picker list', () => {
  const before = { THEMES, SETS, SET_IDS };
  installCatalogue(tune.SHIPPED.houses);
  assert.equal(THEMES, before.THEMES, 'identity survives — every importer holds these objects');
  assert.equal(SETS, before.SETS);
  assert.equal(SET_IDS, before.SET_IDS);
  assert.deepEqual(SET_IDS, SHIPPED_SET_IDS);
  assert.equal(SETS['gildhall.oxblood'].houseLabel, 'Gildhall');

  // Idempotent: the server calls this on every re-read of an edited file.
  installCatalogue(tune.SHIPPED.houses);
  assert.deepEqual(SET_IDS, SHIPPED_SET_IDS, 'a second install does not double the list');

  // THE C4 REVIEWER'S FINDING, kept: `registerSet` used to leave SET_IDS
  // alone, so a set minted at runtime was "invisible in the picker and
  // rejected on the wire" (DEVMODE §9). It appends now, once.
  registerSet('house.trial', { label: 'Trial', body: '#111111', text: '#eeeeee' });
  assert.equal(SET_IDS.at(-1), 'house.trial');
  registerSet('house.trial', { label: 'Trial 2', body: '#111111', text: '#eeeeee' });
  assert.equal(SET_IDS.filter((id) => id === 'house.trial').length, 1, 'and re-registering does not list it twice');
  assert.equal(SETS['house.trial'].label, 'Trial 2', 'though the recipe is replaced');

  installCatalogue(tune.SHIPPED.houses);
  assert.deepEqual(SET_IDS, SHIPPED_SET_IDS, 'and an install is the whole catalogue, not an addition to it');
});

// A SPARSE ROW IS SPARSE UNTIL SOMEBODY WRITES (phase D1's own design, pinned
// after the D1 review found the other half of it: the fields the file leaves
// out were not writable at all). Two claims in one: reconciliation adds
// nothing to a shipped recipe — a set that refuses particles must not arrive
// carrying an empty palette — and a `tune.set` at one of those absent fields
// lands as one leaf, not as a group of defaults.
t('the shipped recipes stay sparse, and a write adds exactly the field it names', () => {
  const ivory = tune.SHIPPED.houses.classics.dice.ivory;
  assert.deepEqual(Object.keys(ivory), ['label', 'body', 'text', 'accent', 'feel'],
    'the Classics earn five fields and take no more');
  const shape = Object.keys(RECIPE);
  assert.ok(shape.length > 20 && shape.length - Object.keys(ivory).length > 15,
    'which is a small share of the recipe — the rest is absent ON PURPOSE');
  for (const id of Object.keys(tune.SHIPPED.houses)) {
    for (const [setId, recipe] of Object.entries(tune.SHIPPED.houses[id].dice)) {
      for (const k of Object.keys(recipe)) {
        assert.ok(k in RECIPE, `${id}.${setId}: no recipe field named ${k}`);
      }
    }
  }
  const live = createTune({ declared: parseYaml(text).tree, source: text });
  assert.deepEqual(live.set({ 'houses.classics.dice.ivory.glyph': 'pip' }).refused, []);
  assert.deepEqual(live.set({ 'houses.classics.dice.ivory.geo.bevel': 0.05 }).refused, []);
  assert.deepEqual(Object.keys(live.get('houses.classics.dice.ivory')),
    ['label', 'body', 'text', 'accent', 'feel', 'glyph', 'geo'], 'two fields, in the order they were written');
  assert.deepEqual(live.get('houses.classics.dice.ivory.geo'), { bevel: 0.05 },
    'and the group carries the one field, not the eight the shape declares');
  // The catalogue the app reads is the live tree's, so the die actually wears it.
  assert.equal(buildCatalogue(live.T.houses).SETS['classics.ivory'].glyph, 'pip');
  assert.equal(buildCatalogue(tune.SHIPPED.houses).SETS['classics.ivory'].glyph, undefined,
    'while the file still says nothing about it');
});

t('a malformed declaration yields a smaller catalogue, never a broken one', () => {
  assert.deepEqual(buildCatalogue(undefined).SET_IDS, []);
  assert.deepEqual(buildCatalogue({}).SET_IDS, []);
  assert.deepEqual(buildCatalogue({ h: null }).SET_IDS, []);
  assert.deepEqual(buildCatalogue({ h: { label: 'H' } }).SET_IDS, [], 'a house with no dice is a house with no sets');
  assert.deepEqual(buildCatalogue({ h: { label: 'H', dice: { s: 3 } } }).SET_IDS, []);
  assert.deepEqual(buildCatalogue({ h: { label: 'H', dice: { s: { label: 'S' } } } }).SET_IDS, ['h.s']);
  // A NULL AT A RECIPE GROUP IS ABSENT, AND MAY NOT THROW (the D1 review,
  // 2026-09-03). `post:` was the one branch that dereferenced its value, and
  // `post: null` is the idiom the shipped file uses three times over at `glow`
  // to say "absent, on purpose" — so a file the browser reconciles without a
  // murmur stopped server.js booting, with a TypeError reported as
  // `dice.yaml:0: Cannot convert undefined or null to object`. The browser
  // never saw it because js/tune.js drops the nulls first; server.js installs
  // the RAW tree, which is why both paths are read here.
  const GROUPS = ['post', 'geo', 'feel', 'glow', 'maps', 'shader', 'spec', 'particles',
    'decal', 'light', 'sound', 'rate', 'rest', 'fog'];
  for (const g of [...GROUPS, 'label', 'line', 'body', 'text', 'accent', 'glyph', 'faces', 'where', 'channel']) {
    for (const v of [null, 5, 'x', []]) {
      const declared = { h: { label: 'H', dice: { s: { label: 'S', body: '#ffffff', [g]: v } } } };
      let built;
      assert.doesNotThrow(() => { built = buildCatalogue(declared); }, `${g}: ${JSON.stringify(v)}`);
      assert.deepEqual(built.SET_IDS, ['h.s'], `${g}: ${JSON.stringify(v)} costs the set nothing`);
      const rec = built.SETS['h.s'];
      if (v === null) assert.ok(!(g in rec) && rec.venueOnly === undefined && rec.beta === undefined,
        `${g}: a null is a field this recipe does not have`);
      if (g === 'post') assert.ok(rec.post === undefined || (v !== null && typeof v === 'object' && !Array.isArray(v)),
        'and a scalar where a map belongs is dropped, not read as one');
    }
  }
  // The same file, through the reader the browser uses: the two agree.
  const both = { h: { label: 'H', dice: { s: { label: 'S', body: '#ffffff', post: null, glow: null } } } };
  assert.deepEqual(buildCatalogue(createTune({ declared: { houses: both } }).SHIPPED.houses).SETS['h.s'],
    buildCatalogue(both).SETS['h.s'], 'the raw tree and the reconciled one build one recipe');
  // Put the real one back: the exports are module state and this file's
  // reader is whoever imports js/themes.js next.
  installCatalogue(tune.SHIPPED.houses);
});

console.log(process.exitCode ? `catalogue: FAILED` : `catalogue: ${n} tests passed`);
