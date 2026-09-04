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

// THE FELT CATALOGUE'S DRIFT GUARD (developer mode phase E1, 2026-09-03).
//
// The eleven mats left js/main.js for `felts:` in dice.yaml. Joe: "make a new
// mat as YAML-only as a new dice set is now." The migration is proved HERE and
// not offline, which is the one difference from tests/catalogue.test.mjs (the
// dice catalogue's guard, whose fixture was too large to keep): a felt row is
// six fields and the whole literal fits in this file, so the deleted object is
// PINNED below exactly as it stood, and the file is compared to it field for
// field and in order. Change a shipped mat's colour and this goes red naming
// it — which is right, because every one of those numbers is a look Joe dialled
// by eye and a golden screenshot means.
//
// Three claims, in the order they matter:
//   1. THE FILE IS THE LITERAL. Deep-equal against the pin, id order included:
//      the picker draws in the file's order, so a reordering is a change to
//      what every player sees and must be read in a diff, not discovered.
//   2. NOTHING IS SILENTLY DROPPED. js/tune.js reconciles the declaration
//      against the row shape and drops what does not fit, per path, with the
//      default standing — right for a hand-edited file, wrong as a silent
//      outcome for the catalogue the app ships. Every leaf must survive, and
//      `tune.refusals` must be empty.
//   3. `felts:` IS FILLED, NOT SPARSE (js/tune.js ASSET_SPARSE). A row that
//      omits `cloth` and `mottle` — nine of the eleven do — reads back with
//      both at the row default, which is what lets js/main.js `feltRowOf` copy
//      a row across without guessing.
//
// AND A FOURTH, ADDED WITH THE IMAGE CLOTH (phase E2, 2026-09-03): the two
// groups a row may now carry — `gloss` and `sound` — are SPARSE INSIDE the
// filled row (js/tune.js `sparse`), and that is what makes this file's first
// claim survivable at all. Their defaults are the PAINTER's rows (js/main.js
// FELT_GLOSS, js/voices.js CLOTH_VOICES), so a filled group would have handed
// every one of the eleven wool's gloss and wool's voice — silt and oak
// included — and two shipped surfaces would have changed with the file
// unmoved. `linen` is the twelfth row and E2's own, so the pin below stays the
// ELEVEN and the twelfth is checked for what it is: the first mat nobody wrote
// a painter for.

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseYaml } from '../js/yaml.js';
import {
  createTune, ASSET_ROWS, ASSET_SECTIONS, ASSET_SPARSE, assetRowDefaults,
  isDial, isSparse, leaves, getLeaf, toPath, ASSET_ID_RE,
} from '../js/tune.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.stack || e.message}`);
    process.exitCode = 1;
  }
};

const text = readFileSync(new URL('../dice.yaml', import.meta.url), 'utf8');
const { tree } = parseYaml(text);
const tune = createTune({ declared: tree, source: text });
const FELT_ROW = ASSET_ROWS.felts;

// js/main.js `FELT_THEMES`, as it stood at 7168f2b (the commit before the
// migration), byte for byte. Absent is meaningful and stays absent: `cloth`
// omitted means the `felt` painter and `mottle` omitted means the full field,
// and the file was written to omit them in exactly the same nine rows.
const DELETED_LITERAL = {
  emerald: { name: 'Emerald', feltBase: '#1f3128', sceneBg: '#191512', breath: 1.35 },
  crimson: { name: 'Crimson', feltBase: '#46201e', sceneBg: '#1a1211', breath: 1.15 },
  midnight: { name: 'Midnight', feltBase: '#1e2a3f', sceneBg: '#121520', breath: 1.35 },
  slate: { name: 'Slate', feltBase: '#2c3438', sceneBg: '#161a1c', breath: 1.25 },
  walnut: { name: 'Walnut', feltBase: '#402e1c', sceneBg: '#1b1410', breath: 1.15 },
  obsidian: { name: 'Obsidian', feltBase: '#1c1c24', sceneBg: '#0f0f13', breath: 1.5 },
  ocean: { name: 'Ocean', feltBase: '#16404a', sceneBg: '#0f181c', breath: 1.3 },
  plum: { name: 'Plum', feltBase: '#3b2342', sceneBg: '#160f18', breath: 1.3 },
  sand: { name: 'Sand', feltBase: '#7c6a4d', sceneBg: '#211a11', breath: 0.8 },
  silt: {
    name: 'Silt', feltBase: '#a2977f', sceneBg: '#1a1712', breath: 0.85, cloth: 'silt', mottle: 0.45,
  },
  taproom: {
    name: 'Taproom', feltBase: '#544530', sceneBg: '#191310', breath: 1.1, cloth: 'oak', mottle: 0.6,
  },
};

// ---------------------------------------------------------------------------
// 1. The file is the literal
// ---------------------------------------------------------------------------

t('`felts:` in dice.yaml is the object that was deleted from js/main.js', () => {
  assert.ok(tree.felts && typeof tree.felts === 'object', 'dice.yaml has no `felts:` section');
  // THE ELEVEN COME FIRST AND IN ORDER. The picker draws in the file's order,
  // so a reordering is a change to what every player sees and must be read in
  // a diff; rows added after them are later phases' and are checked below by
  // what they are, not against a pin they were never in.
  assert.deepEqual(Object.keys(tree.felts).slice(0, 11), Object.keys(DELETED_LITERAL),
    'the ids, in the picker\'s own order');
  for (const [id, row] of Object.entries(DELETED_LITERAL)) {
    assert.deepEqual(tree.felts[id], row, `${id}: the row moved, not a copy of it`);
    assert.deepEqual(Object.keys(tree.felts[id]), Object.keys(row),
      `${id}: an absent field is a real answer — it may not arrive spelled out`);
  }
});

t('every id is one the browser and the wire will both take', () => {
  // js/tune.js drops a row whose id is not ASSET_ID_RE and server.js filters
  // its wire list by the same regex (the C4 review's inverted bug: "accepted
  // on the wire, resolvable by nobody"). A shipped mat that failed it would be
  // in the file and in nobody's picker.
  for (const id of Object.keys(tree.felts)) assert.match(id, ASSET_ID_RE, `${id} is not a legal row id`);
});

// ---------------------------------------------------------------------------
// 2. The file survives its own reconciliation
// ---------------------------------------------------------------------------

t('every leaf of `felts:` fits its dial: nothing dropped, nothing refused', () => {
  assert.deepEqual(tune.refusals.filter((r) => String(r.path).startsWith('felts.')), [],
    'the shipped mats are refusal-free');
  const declared = leaves(tree).map((p) => p.join('.')).filter((p) => p.startsWith('felts.'));
  const pinned = Object.values(DELETED_LITERAL).reduce((a, r) => a + Object.keys(r).length, 0);
  assert.ok(declared.length >= pinned, 'no leaf of the pinned eleven went missing');
  for (const p of declared) {
    const d = tune.dialAt(p);
    assert.ok(isDial(d), `dice.yaml names ${p} and the felt row shape has no dial for it`);
    assert.deepEqual(getLeaf(tune.SHIPPED, toPath(p)), getLeaf(tree, toPath(p)),
      `${p} did not survive reconciliation`);
  }
});

t('the row shape is dials, each with a default of its own type', () => {
  assert.deepEqual(Object.keys(FELT_ROW),
    ['name', 'cloth', 'feltBase', 'sceneBg', 'breath', 'mottle', 'texture', 'tile', 'gloss', 'sound']);
  for (const [k, d] of Object.entries(FELT_ROW)) {
    // A field is a dial or a SPARSE GROUP of them (phase E2); either way every
    // leaf under it obeys the same four rules.
    for (const [sub, leaf] of Object.entries(isSparse(d) ? d.sparse : { '': d })) {
      const at = sub ? `${k}.${sub}` : k;
      assert.ok(isDial(leaf), `${at} is not a dial`);
      assert.equal(leaf.cls, 'look', `${at}: a mat is look all the way down — it cannot change how a die lands`);
      assert.notEqual(typeof leaf.def, 'boolean', `${at} is a boolean; the file may not hold one`);
      if (leaf.options) assert.ok(leaf.options.includes(leaf.def), `${at} def is not one of its options`);
      if (leaf.range) assert.ok(leaf.def >= leaf.range[0] && leaf.def <= leaf.range[1], `${at} def is outside its range`);
    }
  }
  // Every cloth a shipped row names is one of the painters the shape offers;
  // tests/felt-ids.test.mjs is the half that checks the painter, the voice and
  // the gloss row all exist for it.
  for (const [id, row] of Object.entries(tree.felts)) {
    if (row.cloth === undefined) continue;
    assert.ok(FELT_ROW.cloth.options.includes(row.cloth), `${id} names cloth ${row.cloth}`);
  }
});

// ---------------------------------------------------------------------------
// 3. Filled, not sparse
// ---------------------------------------------------------------------------

t('a felt row is FILLED: the nine that omit cloth and mottle read back at the defaults', () => {
  assert.ok(ASSET_SECTIONS.includes('felts'));
  assert.equal(ASSET_SPARSE.includes('felts'), false,
    'a mat the file half-writes takes the row defaults for the rest, so the merge site never guesses');
  const defs = assetRowDefaults('felts');
  const filled = Object.keys(FELT_ROW).filter((k) => !isSparse(FELT_ROW[k]));
  for (const [id, row] of Object.entries(DELETED_LITERAL)) {
    const live = tune.SHIPPED.felts[id];
    assert.deepEqual(Object.keys(live), filled, `${id}: every filled field is present after the merge`);
    assert.equal(live.cloth, row.cloth ?? defs.cloth, `${id}: cloth`);
    assert.equal(live.mottle, row.mottle ?? defs.mottle, `${id}: mottle`);
    // …AND NEITHER SPARSE GROUP ARRIVED. This is the byte-for-byte claim E2
    // rests on: none of the eleven names `gloss:` or `sound:`, so every one of
    // them still asks its painter, and js/main.js `feltSurfaceOf` has nothing
    // to merge. A `gloss` key here would mean silt and oak had quietly been
    // given wool's numbers.
    assert.equal('gloss' in live, false, `${id}: the painter answers for the gloss`);
    assert.equal('sound' in live, false, `${id}: …and for the voice`);
  }
  assert.equal(defs.cloth, 'felt', 'the default painter is the one nine rows say nothing about');
  assert.equal(defs.mottle, 1, 'and the default mottle is the full field');
});

// THE DEFAULT MAT IS ONE THE FILE DECLARES. js/main.js assigns `DEFAULT_FELT`
// directly at boot — it never passes through `applyFeltTheme` — so a file
// missing that row would leave the table reading `undefined.breath` before
// anything else could complain.
t('obsidian is in the file, because boot reads it before it validates anything', () => {
  assert.ok(tree.felts.obsidian, 'dice.yaml must declare the row js/main.js DEFAULT_FELT names');
  assert.equal(tune.SHIPPED.felts.obsidian.breath, 1.5,
    'the darkest cloth has the least light to lose, so it loses the largest fraction of it');
});

// ---------------------------------------------------------------------------
// 4. The twelfth row: the first mat nobody wrote a painter for (phase E2)
// ---------------------------------------------------------------------------

t('`linen` is a whole mat in YAML: an image, a scale, a gloss and a voice', () => {
  const row = tune.SHIPPED.felts.linen;
  assert.ok(row, 'dice.yaml must declare the row the image path is exercised by');
  assert.equal(row.cloth, 'image', 'the painter that takes its picture from the file');
  // THE PATH IS CHECKED AS A PATH, and then as a FILE. The law (js/tune.js
  // `assetPath`) says it is under `models/`; this says the bytes are there,
  // because a row whose picture is missing is a mat that boots flat with one
  // console line — exactly the failure that looks right until somebody opens
  // the picker.
  assert.equal(row.texture, 'models/mats/linen.png');
  assert.ok(existsSync(new URL(`../${row.texture}`, import.meta.url)),
    `${row.texture} is declared and not in the tree`);
  // 1024px of tile over 5 world units, against a 256px picture: four repeats
  // draw it at one image pixel per texel. Any other number is a resample.
  assert.equal(row.tile, 1.25, 'four repeats across the felt tile — the picture at 1:1');
  // The two sparse groups, present here and only here: this is the row that
  // proves the merge has a live subject in the shipped file.
  assert.deepEqual(row.gloss, { mid: 0.94, swing: 0.06 });
  assert.deepEqual(row.sound, { centre: 1.12, length: 1.1, tail: 1.25, grind: 1.1 });
  assert.equal('gain' in row.sound, false, 'a field the row leaves out stays the painter\'s');
  assert.equal('fizz' in row.sound, false);
});

console.log(process.exitCode ? 'felts-catalogue: FAILED' : `felts-catalogue: ${n} tests passed`);
