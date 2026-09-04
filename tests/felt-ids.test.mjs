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

// tests/felt-ids.test.mjs — the felt id list used to exist THREE TIMES and
// nothing checked that the copies agreed.
//
//   js/main.js      FELT_THEMES — the client's rows: what the picker OFFERS
//   server.js       FELT_THEMES — what a room's settings patch is ALLOWED
//   js/portable.js  FELT_THEMES — what a portable rack may CARRY
//
// PHASE E1 (2026-09-03) DELETED ALL THREE. The mats are rows under `felts:` in
// dice.yaml, js/main.js fills `FELT_THEMES` in place from the declared tree
// (`installFelts`), server.js reads its wire list off the tree it already
// parsed, and js/portable.js is handed the list by js/main.js at boot. So the
// failures this file was written for — the asymmetric, quiet ones —
//
//   * in main but not server  — the swatch is in the picker, the click sends
//     a patch, the server 400s it, and the felt silently will not stick for
//     anyone at a shared table. Solo, it works. That is the worst shape.
//   * in main but not portable — the felt exports and comes back as the
//     default, so a saved table quietly loses its surface.
//   * in server/portable but not main — a value the client cannot render can
//     arrive over the wire from a client that can.
//
// — are now unreachable BY CONSTRUCTION rather than by agreement, and what
// this file guards is that construction. Two things it still has to say:
//
//   1. NOBODY GREW A LITERAL BACK. A hand-kept list is how the drift started,
//      and it is one careless `const FELT_THEMES = [...]` away from starting
//      again. All three files are read and the shape of their felt catalogue
//      is asserted: main.js fills an empty object from the declaration, and
//      neither mirror holds a list at all.
//   2. THE CLOTH MIRRORS ARE STILL FIVE. A cloth id names FOUR things written
//      down separately — a painter (js/main.js FELT_CLOTHS), a voice
//      (js/voices.js CLOTH_VOICES), a gloss row (FELT_GLOSS) and the rows in
//      dice.yaml that cite it — and none of that moved. Silt shipped for one
//      day with a painter and no voice, which is this project's signature
//      failure exactly: it looked right, so nothing said it was wrong.
//
// Read from SOURCE rather than imported, deliberately: js/main.js is a browser
// module that builds a scene on evaluation and server.js starts listening, so
// neither can be imported into a unit test. static-cache.test.mjs already
// establishes source-reading as the idiom here. The ROWS, by contrast, are
// parsed out of dice.yaml with the app's own reader — the declaration is data,
// and scraping data that can simply be read would be the mistake this file is
// about.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// THE CLOTH TABLE, IMPORTED rather than scraped — js/voices.js is pure data
// and loads in Node, which is why every voice number lives there.
import { CLOTH_VOICES } from '../js/voices.js';
// …and the mats themselves, read the way every reader reads them.
import { parseYaml } from '../js/yaml.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    process.exitCode = 1;
    console.error(`FAIL ${name}\n  ${e.message}`);
  }
};

// THE ONE LIST, read out of the declaration with the app's own parser.
const declared = parseYaml(read('dice.yaml')).tree.felts || {};
const ids = Object.keys(declared);

t('the declaration carries the catalogue', () => {
  // Guard the guard: an empty list agrees with everything and proves nothing,
  // and a reader that stops finding the section fails exactly that way.
  assert.ok(ids.length >= 9, `the felt catalogue looks wrong: ${ids.join(', ')}`);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/, `"${id}" does not look like a felt id`);
  for (const id of ids) {
    const row = declared[id];
    assert.ok(row && typeof row === 'object', `${id} is not a row`);
    assert.match(String(row.feltBase), /^#[0-9a-f]{6}$/, `${id} has no felt base`);
    assert.match(String(row.sceneBg), /^#[0-9a-f]{6}$/, `${id} has no scene background`);
  }
});

// A LITERAL IS HOW THE DRIFT STARTED. Each of these three files held its own
// copy of the id list for eleven months; none of them may hold one again, and
// the shape each one wears instead is asserted rather than described, because
// a comment saying "no literal here" is not a test.
t('no file grew its own copy of the catalogue back', () => {
  for (const file of ['js/main.js', 'server.js', 'js/portable.js']) {
    const src = read(file);
    assert.equal(/const FELT_THEMES = \[/.test(src), false,
      `${file}: a hand-kept felt id list is back — the catalogue is dice.yaml (docs/DEVMODE.md §9)`);
  }
  assert.match(read('js/main.js'), /const FELT_THEMES = \{\};/,
    'js/main.js: FELT_THEMES is filled in place from the declaration, so it starts empty');
  assert.match(read('js/main.js'), /function installFelts\(/,
    'js/main.js: …by installFelts, which is the one merge site');
  assert.match(read('server.js'), /function syncFeltIds\(/,
    'server.js: the wire list comes off the parsed tree');
  assert.match(read('js/portable.js'), /export function declareFelts\(/,
    'js/portable.js: a rack\'s felt enum is handed down, never written down');
});

t("the server's default felt is one the declaration names", () => {
  // server.js still spells the DEFAULT out — it is the value a room with no
  // settings gets, not a catalogue — and a default nothing declares would be a
  // room wearing a felt no client can render and the server itself refuses.
  const m = read('server.js').match(/default:\s*'([a-z]+)',/);
  assert.ok(m, 'no default felt found in server.js');
  assert.ok(ids.includes(m[1]), `server default "${m[1]}" is not a row in dice.yaml`);
});

// A FOURTH MIRROR, ADDED WITH SILT'S VOICE (2026-08-29). A cloth id now names
// three things that are written down separately: a PAINTER (js/main.js
// FELT_CLOTHS — what the tile looks like), a VOICE (js/voices.js CLOTH_VOICES
// — what a die sounds like landing on it), and the rows that cite it. Silt
// shipped for one day with a painter and no voice, which is this project's
// signature failure exactly: it looked right, so nothing said it was wrong.
const src = read('js/main.js');
const clothOfRows = ids.map((id) => declared[id].cloth).filter(Boolean);
const painters = (() => {
  const m = src.match(/const FELT_CLOTHS = \{([\s\S]*?)\};/);
  assert.ok(m, 'js/main.js: no FELT_CLOTHS registry found — did it move?');
  return [...m[1].matchAll(/([a-z][a-zA-Z0-9]*)\s*:/g)].map((x) => x[1]);
})();

// `const NAME = { id: { ... }, ... };` — an object of rows, top-level keys
// only. The brace walk is the only extractor here that survives a nested
// value, and the flat `([a-z]+):` regex used for the painter registry would
// return `felt, mid, swing, silt, mid, swing, ...` on this one.
function objectKeys(source, file, name) {
  const at = source.indexOf(`const ${name} = {`);
  assert.ok(at >= 0, `${file}: no ${name} object found`);
  let i = source.indexOf('{', at);
  let depth = 0;
  let end = -1;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > 0, `${file}: ${name} is unterminated`);
  const body = source.slice(source.indexOf('{', at) + 1, end);
  const keys = [];
  let d = 0;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (d === 0) {
      const km = trimmed.match(/^([a-z][a-zA-Z0-9_]*)\s*:/);
      if (km) keys.push(km[1]);
    }
    d += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
  }
  return keys;
}

const gloss = objectKeys(src, 'js/main.js', 'FELT_GLOSS');

t('every cloth that is painted also answers the lamp', () => {
  // THE FIFTH MIRROR. A cloth id now names four things written down
  // separately: a painter (FELT_CLOTHS), a voice (CLOTH_VOICES), a gloss row
  // (FELT_GLOSS) and the theme rows that cite it. The failure this catches is
  // the same shape as the silt-without-a-voice bug that made this file grow its
  // fourth mirror: `FELT_GLOSS[cloth] || FELT_GLOSS[DEFAULT_CLOTH]` does its job
  // quietly, so a cloth with no row of its own silently wears wool's gloss and
  // looks almost right.
  assert.ok(gloss.length >= 3, `the gloss registry looks wrong: ${gloss.join(', ')}`);
  const unlit = painters.filter((id) => !gloss.includes(id));
  assert.deepEqual(unlit, [],
    `these cloths have a look and no gloss row, so they wear wool's: ${unlit.join(', ')}`);
  const extra = gloss.filter((id) => !painters.includes(id));
  assert.deepEqual(extra, [],
    `these gloss rows describe a cloth nothing paints: ${extra.join(', ')}`);
});

t('every cloth that is painted is also voiced', () => {
  assert.ok(painters.includes('felt'), `the painter registry looks wrong: ${painters.join(', ')}`);
  const unvoiced = painters.filter((id) => !CLOTH_VOICES[id]);
  assert.deepEqual(unvoiced, [],
    `these cloths have a look and no voice, so a die lands on them sounding `
    + `like wool over wood: ${unvoiced.join(', ')}`);
  const unpainted = Object.keys(CLOTH_VOICES).filter((id) => !painters.includes(id));
  assert.deepEqual(unpainted, [],
    `these cloths are voiced but nothing paints them: ${unpainted.join(', ')}`);
});

t('every cloth a declared mat cites exists in both registries', () => {
  for (const id of clothOfRows) {
    assert.ok(painters.includes(id), `a felt row cites cloth "${id}" with no painter`);
    assert.ok(CLOTH_VOICES[id], `a felt row cites cloth "${id}" with no voice`);
  }
});

if (process.exitCode) process.exit(process.exitCode);
console.log(`all ${n} felt-id tests pass (${ids.length} felts: ${ids.join(', ')})`);
