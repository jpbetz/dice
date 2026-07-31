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

import assert from 'node:assert/strict';
import { encodeGroups, decodeGroups } from '../js/urlgroups.js';
import { parseNotation } from '../js/notation.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// ---- v2 round-trips --------------------------------------------------------

t('v2 round-trip: plain, mods, dc, comment, labels', () => {
  const groups = [
    { id: 1, name: 'Attack', notation: '1d20+5 adv' },
    { id: 2, name: 'Deception', notation: '1d20ro<=1+3 adv dc15 # The lie leaves your lips' },
    { id: 3, name: 'Stat Line', notation: '4d6dl1' },
    { id: 4, name: 'Persuasion', notation: '1d20+2[Proficiency]+1[Guidance] dc15' },
    { id: 5, name: 'Percentile', notation: 'd100' },
  ];
  const out = decodeGroups(encodeGroups(groups));
  assert.ok(out);
  assert.equal(out.length, groups.length);
  out.forEach((g, i) => {
    assert.equal(g.name, groups[i].name);
    assert.equal(g.notation, groups[i].notation);
  });
});

t('v2: empty name segment is legal (unnamed group)', () => {
  const out = decodeGroups(encodeGroups([{ id: 1, name: '', notation: '4d6dl1' }]));
  assert.ok(out);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '');
  assert.equal(out[0].notation, '4d6dl1');
});

t('v2: delimiters in names and comments survive escaping', () => {
  const groups = [
    { id: 1, name: 'a=b;c', notation: '2d6+3 # to hit; # or not = maybe' },
  ];
  const out = decodeGroups(encodeGroups(groups));
  assert.ok(out);
  assert.equal(out[0].name, 'a=b;c');
  assert.equal(out[0].notation, '2d6+3 # to hit; # or not = maybe');
});

t('v2: unicode name and comment', () => {
  const groups = [{ id: 1, name: 'Épée ⚔', notation: '1d8+2 # coup d’éclat' }];
  const out = decodeGroups(encodeGroups(groups));
  assert.ok(out);
  assert.equal(out[0].name, 'Épée ⚔');
  assert.equal(out[0].notation, '1d8+2 # coup d’éclat');
});

t('v2: astral characters at every cap boundary encode and decode', () => {
  // The chain this guards: a cap cutting through '🎲' used to leave a lone
  // high surrogate in the canonical, encodeURIComponent threw URIError on it,
  // and the throw escaped saveGroups — bricking every later boot. Both halves
  // of a segment (name and notation) go through encodeURIComponent.
  const die = '\u{1F3B2}';
  const groups = [{
    id: 1,
    name: 'Emoji night ' + die,
    notation: parseNotation(
      `1d20 check held dc10 # ${'z'.repeat(63)}${die} | ${'y'.repeat(39)}${die}`
    ).canonical,
  }];
  const out = decodeGroups(encodeGroups(groups));
  assert.ok(out);
  assert.equal(out[0].name, groups[0].name);
  assert.equal(out[0].notation, groups[0].notation);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out[0].notation));
});

t('v2: a name cut at the 24-char cap keeps whole characters', () => {
  const long = 'n'.repeat(23) + '\u{1F3B2}'; // 25 UTF-16 units
  const enc = Buffer.from(`${encodeURIComponent(long)}=1d6`, 'utf8').toString('base64url');
  const out = decodeGroups(enc);
  assert.ok(out);
  assert.equal(out[0].name, 'n'.repeat(23));
  assert.doesNotThrow(() => encodeGroups(out)); // re-encodable, so a link survives
});

t('v2: non-canonical input notation normalizes on decode', () => {
  // hand-built link with "2d20kh1+5" — decodes to the canonical adv form
  const body = `${encodeURIComponent('Attack')}=${encodeURIComponent('2d20kh1+5')}`;
  const enc = Buffer.from(body, 'utf8').toString('base64url');
  const out = decodeGroups(enc);
  assert.ok(out);
  assert.equal(out[0].notation, '1d20+5 adv');
});

// ---- v1 compatibility ------------------------------------------------------

t('v1 links keep decoding (formula subset of the grammar)', () => {
  // exact v1 encoder output: name=3d4+1d6;... names URI-escaped, formulas bare
  const v1Body = 'Attack=1d20;Damage=3d4+1d6;Percentile=1d10x+1d10';
  const enc = Buffer.from(v1Body, 'utf8').toString('base64url');
  const out = decodeGroups(enc);
  assert.ok(out);
  assert.equal(out.length, 3);
  assert.equal(out[0].notation, '1d20');
  assert.equal(out[1].notation, '3d4+1d6');
  assert.equal(out[2].notation, 'd100'); // exactly one d10x+d10 renders as d100
});

t('v1: escaped name still decodes', () => {
  const v1Body = `${encodeURIComponent('Sneak Attack!')}=2d6`;
  const enc = Buffer.from(v1Body, 'utf8').toString('base64url');
  const out = decodeGroups(enc);
  assert.ok(out);
  assert.equal(out[0].name, 'Sneak Attack!');
  assert.equal(out[0].notation, '2d6');
});

// ---- hostile input: null, never a throw ------------------------------------

t('hostile input yields null', () => {
  assert.equal(decodeGroups('%%%not-base64%%%'), null);
  assert.equal(decodeGroups(''), null);
  const junk = (s) => Buffer.from(s, 'utf8').toString('base64url');
  assert.equal(decodeGroups(junk('noequals')), null);
  assert.equal(decodeGroups(junk('name=')), null);              // empty notation
  assert.equal(decodeGroups(junk('name=totally bogus')), null); // unparseable
  assert.equal(decodeGroups(junk('name=99d6')), null);          // over both caps
  assert.equal(decodeGroups(junk('name=%ZZ')), null);           // bad URI escape
  assert.equal(decodeGroups(junk(';;;')), null);                // nothing usable
});

t('caps: more than 40 groups truncates, never throws', () => {
  const groups = Array.from({ length: 45 }, (_, i) => ({ id: i, name: `g${i}`, notation: '1d6' }));
  const out = decodeGroups(encodeGroups(groups));
  assert.ok(out);
  assert.equal(out.length, 40);
});

// ---- codec v3: categories (Pools Rack 2026-08-01) --------------------------
t('v3: category rides the segment and round-trips', () => {
  const gs = [{ id: 1, name: 'Wisdom', notation: '2d8', category: 'Attributes' }];
  const out = decodeGroups(encodeGroups(gs));
  assert.equal(out[0].name, 'Wisdom');
  assert.equal(out[0].category, 'Attributes');
  assert.equal(out[0].notation, '2d8');
});
t('v3: a category-less record encodes byte-identically to v2', () => {
  const plain = [{ id: 1, name: 'Attack', notation: '1d20+5' }];
  assert.equal(encodeGroups(plain), encodeGroups([{ ...plain[0], category: null }]));
  assert.equal('category' in decodeGroups(encodeGroups(plain))[0], false);
});
t('v3: a pipe INSIDE a name is escaped, never a delimiter', () => {
  const gs = [{ id: 1, name: 'A|B', notation: '1d6', category: 'C|D' }];
  const out = decodeGroups(encodeGroups(gs));
  assert.equal(out[0].name, 'A|B');
  assert.equal(out[0].category, 'C|D');
});
t('v3: hostile category segments fail closed', () => {
  // raw body 'x|%ZZ=1d6' — a malformed escape in the category half
  const body = Buffer.from('x|%ZZ=1d6').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(decodeGroups(body), null);
});
t('v3: sources notation survives the codec (2d8[Wisdom])', () => {
  const gs = [{ id: 1, name: 'Cast', notation: '1d4+2d8[Wisdom]', category: 'Skills' }];
  const out = decodeGroups(encodeGroups(gs));
  assert.equal(out[0].notation, '1d4+2d8[Wisdom]');
});

if (process.exitCode !== 1) console.log(`all ${n} urlgroups tests pass`);
