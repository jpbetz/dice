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

// tests/yaml.test.mjs — the dice.yaml reader and line-patching writer
// (docs/DEVMODE.md §3, §6). The parse is checked construct by construct with
// its spans; every refusal names its line; and the patch invariants are the
// point: an empty patch is the identity, a patched file re-parses to the old
// tree with the change applied, and every line a change did not touch is
// byte-identical — comments beside the value included.

import assert from 'node:assert/strict';
import { YamlError, parseYaml, patchYaml, emitYaml, formatScalar, toPath, pathKey } from '../js/yaml.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.stack || e.message}`);
    process.exitCode = 1;
  }
};

// The fixture: comments, blank lines, flow maps, a list, a quoted key, a
// nested section, a bare `key:` and an explicit `~`. Line numbers matter.
const FIXTURE = [
  /* 1 */ '# fixture — the declaration, small',
  /* 2 */ '# a second header line',
  /* 3 */ '',
  /* 4 */ 'app:',
  /* 5 */ '  title: Dice Table',
  /* 6 */ '  mode: development        # development | production',
  /* 7 */ '  version: 1',
  /* 8 */ '',
  /* 9 */ 'table:',
  /* 10 */ '  scale: 2.5               # the one dial',
  /* 11 */ '  ceilingY: 22',
  /* 12 */ '',
  /* 13 */ 'light:',
  /* 14 */ '  lamp:',
  /* 15 */ '    y: 24',
  /* 16 */ '    color: "#ffe8c4"       # pool ~27',
  /* 17 */ '  room: { hemi: 0.1, key: 1.7 }',
  /* 18 */ '  fog:',
  /* 19 */ '    near: 15',
  /* 20 */ '    far: 46',
  /* 21 */ '  # a comment that closes the light section',
  /* 22 */ '  breath: {}',
  /* 23 */ '',
  /* 24 */ 'sets:',
  /* 25 */ '  "house.ember":',
  /* 26 */ "    label: 'Ember'",
  /* 27 */ '    feel: { rough: 0.35, metal: 0.1 }',
  /* 28 */ "    tags: [chime, 'a: b']",
  /* 29 */ '',
  /* 30 */ 'seats:',
  /* 31 */ '  - one',
  /* 32 */ '  - 2',
  /* 33 */ '  - name: third',
  /* 34 */ '    kind: map',
  /* 35 */ '  - { x: 1 }',
  /* 36 */ '',
  /* 37 */ 'empty:',
  /* 38 */ 'tail: ~',
  /* 39 */ '# the last word',
  '',
].join('\n');

const TREE = {
  app: { title: 'Dice Table', mode: 'development', version: 1 },
  table: { scale: 2.5, ceilingY: 22 },
  light: { lamp: { y: 24, color: '#ffe8c4' }, room: { hemi: 0.1, key: 1.7 }, fog: { near: 15, far: 46 }, breath: {} },
  sets: { 'house.ember': { label: 'Ember', feel: { rough: 0.35, metal: 0.1 }, tags: ['chime', 'a: b'] } },
  seats: ['one', 2, { name: 'third', kind: 'map' }, { x: 1 }],
  empty: null,
  tail: null,
};

const lines = (s) => s.split('\n');
const refuses = (text, line, re) => {
  let err = null;
  try { parseYaml(text); } catch (e) { err = e; }
  assert.ok(err instanceof YamlError, `expected a YamlError for ${JSON.stringify(text)}`);
  assert.equal(err.line, line, `line for ${JSON.stringify(text)}: ${err.message}`);
  if (re) assert.match(err.message, re);
};
// the lines of `after` minus exactly the given 0-based indexes equal `before`'s
const sameExcept = (before, after, touched) => {
  const a = lines(before);
  const b = lines(after);
  assert.equal(b.length, a.length, 'line count');
  for (let i = 0; i < a.length; i++) if (!touched.includes(i)) assert.equal(b[i], a[i], `line ${i + 1} untouched`);
};
const setLeaf = (tree, path, v) => {
  const c = structuredClone(tree);
  let o = c;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path.at(-1)] = v;
  return c;
};

// ---- parse -----------------------------------------------------------------

t('the fixture parses to the expected tree', () => {
  assert.deepEqual(parseYaml(FIXTURE).tree, TREE);
});

t('scalars: numbers, null spellings, quoted forms, escapes, comments in quotes', () => {
  const { tree } = parseYaml([
    'a: 1', 'b: -2.5', 'c: 1e3', 'd: 1.5E-2', 'e: null', 'f: ~', 'g:', "h: 'it''s'",
    'i: "say \\"hi\\"\\n\\\\"', 'j: "# not a comment"', "k: 'x # y' # real", 'l: a#b', 'm: 0x10', 'n: 1_000',
    "o: it's fine", 'p: http://x/y', 'q: "\\t\\r"', 'r: +5', 's: .5',
  ].join('\n'));
  assert.deepEqual(tree, {
    a: 1, b: -2.5, c: 1000, d: 0.015, e: null, f: null, g: null, h: "it's",
    i: 'say "hi"\n\\', j: '# not a comment', k: 'x # y', l: 'a#b', m: '0x10', n: '1_000',
    o: "it's fine", p: 'http://x/y', q: '\t\r', r: '+5', s: '.5',
  });
});

t('a quote opens a scalar only where a value or key may begin; elsewhere it is text', () => {
  const { tree } = parseYaml([
    "a: rock-'n roll", "b: x-'y", "c: x:'y", 'd: x-"y', "e: o'clock -'x", "f: it's # c", "g: a 'b' c",
    "h:   'spaced'", "i: [ 'q' , \"r\" ,'s',\"t\"]", "j: { 'k': 1,\"l\": 2 }", "l:", "  - 'x'", "  -   \"y\"", "  - it's",
    "m: x - 'y' # c",
  ].join('\n'));
  assert.deepEqual(tree, {
    a: "rock-'n roll", b: "x-'y", c: "x:'y", d: 'x-"y', e: "o'clock -'x", f: "it's", g: "a 'b' c",
    h: 'spaced', i: ['q', 'r', 's', 't'], j: { k: 1, l: 2 }, l: ['x', 'y', "it's"],
    m: "x - 'y'",
  });
  refuses("a: x - 'unterminated", 1, /unterminated/); // after `- ` a quote opens
  refuses("a: 'x", 1, /unterminated/);
});

t('a number too large to hold is refused with its line', () => {
  refuses('a: 1\nh: 1e400', 2, /out of range/);
  refuses('a: [1, -1e999]', 1, /out of range/);
  assert.deepEqual(parseYaml('a: 1e308\nb: -1e-400').tree, { a: 1e308, b: -0 });
});

t('flow maps and lists, one level nested, empty, trailing comma, quoted keys', () => {
  const { tree } = parseYaml([
    'a: { x: 1, y: [1, 2], "k.z": {}, w: }',
    'b: [a, { p: q }, [], "c, d",]',
    'c: {}',
    'd: [ ]',
    "e: { 'q': 'v' }",
  ].join('\n'));
  assert.deepEqual(tree, {
    a: { x: 1, y: [1, 2], 'k.z': {}, w: null },
    b: ['a', { p: 'q' }, [], 'c, d'],
    c: {}, d: [], e: { q: 'v' },
  });
});

t('block lists: scalars, maps, flow items, a null item, a nested block under an item', () => {
  const { tree } = parseYaml(['l:', '  - a', '  -', '  - k: 1', '    m: 2', '  - { z: 3 }', '  -', '    deep: yes-string'].join('\n'));
  assert.deepEqual(tree, { l: ['a', null, { k: 1, m: 2 }, { z: 3 }, { deep: 'yes-string' }] });
});

t('four-space indentation is accepted when consistent', () => {
  const { tree, spans } = parseYaml('a:\n    b:\n        c: 1\n    d: 2\n');
  assert.deepEqual(tree, { a: { b: { c: 1 }, d: 2 } });
  assert.equal(spans.get('').step, 4);
  assert.equal(spans.get('a/b').childIndent, 8);
});

t('an empty or comment-only document is an empty map', () => {
  assert.deepEqual(parseYaml('').tree, {});
  assert.deepEqual(parseYaml('# only\n\n# comments\n').tree, {});
  assert.equal(parseYaml('# only\n\n# comments\n').spans.get('').lastLine, 3);
});

t('CRLF input parses like LF', () => {
  assert.deepEqual(parseYaml(FIXTURE.replaceAll('\n', '\r\n')).tree, TREE);
});

t('a non-string input is a YamlError', () => {
  assert.throws(() => parseYaml(null), YamlError);
});

// ---- spans -----------------------------------------------------------------

t('scalar spans: line, [col, end), raw and kind', () => {
  const { spans } = parseYaml(FIXTURE);
  const s = (k) => { const x = spans.get(k); return { line: x.line, col: x.col, end: x.end, raw: x.raw, kind: x.kind }; };
  assert.deepEqual(s('app/title'), { line: 5, col: 9, end: 19, raw: 'Dice Table', kind: 'string' });
  assert.deepEqual(s('app/mode'), { line: 6, col: 8, end: 19, raw: 'development', kind: 'string' });
  assert.deepEqual(s('app/version'), { line: 7, col: 11, end: 12, raw: '1', kind: 'number' });
  assert.deepEqual(s('light/lamp/color'), { line: 16, col: 11, end: 20, raw: '"#ffe8c4"', kind: 'string' });
  assert.deepEqual(s('light/room/key'), { line: 17, col: 26, end: 29, raw: '1.7', kind: 'number' });
  assert.deepEqual(s('sets/house.ember/label'), { line: 26, col: 11, end: 18, raw: "'Ember'", kind: 'string' });
  assert.deepEqual(s('sets/house.ember/tags/1'), { line: 28, col: 18, end: 24, raw: "'a: b'", kind: 'string' });
  assert.deepEqual(s('seats/1'), { line: 32, col: 4, end: 5, raw: '2', kind: 'number' });
  assert.deepEqual(s('seats/2/kind'), { line: 34, col: 10, end: 13, raw: 'map', kind: 'string' });
  assert.deepEqual(s('empty'), { line: 37, col: 6, end: 6, raw: '', kind: 'null' });
  assert.deepEqual(s('tail'), { line: 38, col: 6, end: 7, raw: '~', kind: 'null' });
});

t('map spans: insertion points, trailing comments belong to the block they indent with', () => {
  const { spans } = parseYaml(FIXTURE);
  const m = (k) => { const x = spans.get(k); return { line: x.line, indent: x.indent, childIndent: x.childIndent, lastLine: x.lastLine, flow: x.flow, kind: x.kind }; };
  assert.deepEqual(m(''), { line: 4, indent: -2, childIndent: 0, lastLine: 39, flow: false, kind: 'map' });
  assert.deepEqual(m('app'), { line: 5, indent: 0, childIndent: 2, lastLine: 7, flow: false, kind: 'map' });
  assert.deepEqual(m('light'), { line: 14, indent: 0, childIndent: 2, lastLine: 22, flow: false, kind: 'map' });
  assert.deepEqual(m('light/lamp'), { line: 15, indent: 2, childIndent: 4, lastLine: 16, flow: false, kind: 'map' });
  assert.deepEqual(m('light/fog'), { line: 19, indent: 2, childIndent: 4, lastLine: 20, flow: false, kind: 'map' });
  assert.deepEqual(m('light/room'), { line: 17, indent: 2, childIndent: null, lastLine: 17, flow: true, kind: 'map' });
  assert.deepEqual(m('light/breath'), { line: 22, indent: 2, childIndent: null, lastLine: 22, flow: true, kind: 'map' });
  assert.deepEqual(m('seats'), { line: 31, indent: 0, childIndent: 2, lastLine: 35, flow: false, kind: 'list' });
  assert.deepEqual(m('seats/2'), { line: 33, indent: 2, childIndent: 4, lastLine: 34, flow: false, kind: 'map' });
  assert.equal(spans.get('light').keyLine, 13);
  assert.equal(spans.get('').step, 2);
  // a comment indented with a nested map's children extends that map AND its parent
  const { spans: s2 } = parseYaml('a:\n  b:\n    c: 1\n    # end of b\n\n  # end of a\n\nz: 1\n');
  assert.equal(s2.get('a/b').lastLine, 4);
  assert.equal(s2.get('a').lastLine, 6);
  assert.equal(s2.get('').lastLine, 8);
});

// ---- refusals, each with its line ------------------------------------------

t('booleans are refused, every spelling, any case', () => {
  for (const w of ['true', 'false', 'yes', 'no', 'on', 'off', 'True', 'FALSE', 'Yes']) refuses(`a: 1\nb: ${w}\n`, 2, /booleans are not allowed/);
  refuses('a: { b: true }', 1, /booleans/);
  refuses('a:\n  - off', 2, /booleans/);
  // quoted, they are strings
  assert.deepEqual(parseYaml('a: "true"\nb: \'no\'').tree, { a: 'true', b: 'no' });
});

t('anchors, aliases, tags, documents, directives, block scalars, reserved indicators', () => {
  refuses('a: &x 1', 1, /anchors/);
  refuses('a: 1\nb: *x', 2, /anchors/);
  refuses('a: !!str 1', 1, /tags/);
  refuses('a: 1\n---\nb: 2', 2, /multi-document/);
  refuses('a: 1\n...', 2, /multi-document/);
  refuses('--- # doc', 1, /multi-document/);
  refuses('%YAML 1.2\na: 1', 1, /directives/);
  refuses('a:\n  b: |\n    text', 2, /block scalars/);
  refuses('a: >-', 1, /block scalars/);
  refuses('a: @x', 1, /reserved/);
  refuses('a: `x`', 1, /reserved/);
  refuses('? a', 1, /reserved/);
  refuses('&a: 1', 1, /anchors/);
});

t('tabs, duplicate keys, no colon, mixed levels, dotted plain keys, empty keys', () => {
  refuses('a: 1\n\tb: 2', 2, /tabs/);
  refuses('a: 1\nb:\t2', 2, /tabs/);
  refuses('a: 1\nb: 2\na: 3', 3, /duplicate key "a"/);
  refuses('a: { x: 1, x: 2 }', 1, /duplicate key "x"/);
  refuses('a: 1\njust text', 2, /no colon/);
  refuses('a: 1\nb:c', 2, /no colon/);
  refuses('a:\n  b: 1\n  - c', 3, /list item among map keys/);
  refuses('a:\n  - b\n  c: 1', 3, /map key among list items/);
  refuses('a:\n  - - b', 2, /nested lists/);
  refuses('light.lamp: 1', 1, /contains a "."/);
  refuses('a: { b.c: 1 }', 1, /contains a "."/);
  refuses(': 1', 1, /may not be empty/);
  refuses('__proto__: 1', 1, /__proto__/);
  refuses('a: { x: 1, __proto__: 2 }', 1, /__proto__/);
});

t('flow collections: multi-line, too deep, malformed', () => {
  refuses('a: {\n  b: 1 }', 1, /does not close on its line/);
  refuses('a: [1, 2', 1, /does not close on its line/);
  refuses('a: { b: 1 # c }', 1, /does not close/);
  refuses('a: { b: { c: { d: 1 } } }', 1, /nest only one level/);
  refuses('a: [[[1]]]', 1, /nest only one level/);
  refuses('a: { b 1 }', 1, /expected "key: value"/);
  refuses('a: { x: 1,, b: 2 }', 1, /expected "key: value"/);
  refuses('a: { ,b: 2 }', 1, /expected "key: value"/);
  refuses('a: { [x]: 1 }', 1, /expected "key: value"/);
  refuses('a: { {x}: 1 }', 1, /expected "key: value"/);
  refuses('a: { : 1 }', 1, /expected "key: value"/);
  refuses('a: {,}', 1, /expected "key: value"/);
  refuses('a: { b: "x" y }', 1, /expected "," or "}"/);
  refuses('a: ["1" 2]', 1, /expected "," or "]"/);
  refuses('a: { b: 1 c: 2 }', 1, /may not contain ": "/);
  assert.deepEqual(parseYaml('a: [1 2]').tree, { a: ['1 2'] }); // a plain scalar with a space is text
  refuses('a: {}, b', 1, /trailing text/);
  refuses("a: 'x' y", 1, /trailing text/);
  refuses('a: b: c', 1, /may not contain ": "/);
});

t('indentation: odd steps, unexpected indent, the top level, a list at the root', () => {
  refuses('a:\n   b: 1', 2, /multiple of two/);
  refuses('a:\n  b:\n     c: 1', 3, /multiple of two/);
  refuses('a: 1\n  b: 2', 2, /unexpected indent/);
  refuses('a:\n  b: 1\n    c: 2', 3, /unexpected indent/);
  refuses('  a: 1', 1, /column 0/);
  refuses('- a\n- b', 1, /must be a map at the top level/);
  refuses('a: "unterminated', 1, /unterminated/);
  refuses('a: "bad \\x escape"', 1, /unknown escape/);
  refuses('"a" b: 1', 1, /after the quoted key/);
  refuses('{ a: 1 }', 1, /needs a key/);
});

t('a YamlError carries message and line separately (line 0 when unknown)', () => {
  const e = new YamlError('m', 7);
  assert.equal(e.message, 'm');
  assert.equal(e.line, 7);
  assert.equal(e.name, 'YamlError');
  assert.equal(new YamlError('m').line, 0);
  assert.ok(e instanceof Error);
});

// ---- paths -----------------------------------------------------------------

t('toPath and pathKey', () => {
  assert.deepEqual(toPath('a.b.c'), ['a', 'b', 'c']);
  assert.deepEqual(toPath(['a', 'b.c']), ['a', 'b.c']);
  assert.equal(pathKey(['a', 'b.c']), 'a/b.c');
  assert.equal(pathKey('a.b'), 'a/b');
  assert.equal(pathKey([]), '');
});

// ---- patch invariants ------------------------------------------------------

t('patchYaml(text, {}) is the identity; so is a Map with nothing in it', () => {
  assert.equal(patchYaml(FIXTURE, {}), FIXTURE);
  assert.equal(patchYaml(FIXTURE, new Map()), FIXTURE);
  assert.equal(patchYaml(FIXTURE), FIXTURE);
  assert.equal(patchYaml('', {}), '');
});

t('every scalar in the fixture patches on its own line, comment intact, tree updated', () => {
  const { spans } = parseYaml(FIXTURE);
  let count = 0;
  for (const [key, span] of spans) {
    if (span.kind === 'map' || span.kind === 'list') continue;
    if (key.startsWith('seats/') || key.includes('/tags/')) continue; // through a list: refused, tested below
    const path = key.split('/');
    const value = span.kind === 'number' ? spans.get(key).raw.length + 100.5 : `changed ${count}`;
    const out = patchYaml(FIXTURE, new Map([[path, value]]));
    sameExcept(FIXTURE, out, [span.line - 1]);
    assert.deepEqual(parseYaml(out).tree, setLeaf(TREE, path, value), `tree after patching ${key}`);
    const before = lines(FIXTURE)[span.line - 1];
    const after = lines(out)[span.line - 1];
    if (before.includes(' #')) assert.equal(after.slice(after.lastIndexOf(' #')), before.slice(before.lastIndexOf(' #')), `comment kept on ${key}`);
    count++;
  }
  assert.equal(count, 16);
});

t('a replaced value is written with formatScalar (quotes when needed)', () => {
  let out = patchYaml(FIXTURE, { 'app.title': 'a: b' });
  assert.equal(lines(out)[4], '  title: "a: b"');
  out = patchYaml(FIXTURE, { 'app.title': 12 });
  assert.equal(lines(out)[4], '  title: 12');
  out = patchYaml(FIXTURE, { 'app.mode': null });
  assert.equal(lines(out)[5], '  mode: null        # development | production');
  out = patchYaml(FIXTURE, { 'light.lamp.color': '#112233' });
  assert.equal(lines(out)[15], '    color: "#112233"       # pool ~27');
});

t('a bare `key:` and an explicit ~ take a value in place', () => {
  let out = patchYaml(FIXTURE, { empty: 5 });
  assert.equal(lines(out)[36], 'empty: 5');
  sameExcept(FIXTURE, out, [36]);
  out = patchYaml(FIXTURE, { tail: 'end' });
  assert.equal(lines(out)[37], 'tail: end');
  out = patchYaml('a: # note\nb: 1\n', { a: 2 });
  assert.equal(out, 'a: 2 # note\nb: 1\n');
  out = patchYaml('a: { x: , y: 1 }\n', { 'a.x': 0 });
  assert.equal(out, 'a: { x: 0, y: 1 }\n');
});

t('insert into a block map: after its last child, at the children\'s indent', () => {
  const out = patchYaml(FIXTURE, { 'table.friction': 0.6 });
  const b = lines(out);
  assert.equal(b[11], '  friction: 0.6');
  assert.equal(b.length, lines(FIXTURE).length + 1);
  assert.deepEqual([...b.slice(0, 11), ...b.slice(12)], lines(FIXTURE));
  assert.deepEqual(parseYaml(out).tree.table, { scale: 2.5, ceilingY: 22, friction: 0.6 });
  // after a nested last child and its trailing comment, not before them
  const out2 = patchYaml(FIXTURE, { 'light.tower': 3 });
  assert.equal(lines(out2)[22], '  tower: 3');
  assert.equal(lines(out2)[21], '  breath: {}');
  // a section's trailing comment still belongs to it; the new leaf lands after
  const out3 = patchYaml('a:\n  b: 1\n  # end of a\n\nz: 1\n', { 'a.c': 2 });
  assert.equal(out3, 'a:\n  b: 1\n  # end of a\n  c: 2\n\nz: 1\n');
});

t('insert into a flow map: before the closing brace; into an empty one too', () => {
  let out = patchYaml(FIXTURE, { 'light.room.rim': 0.4 });
  assert.equal(lines(out)[16], '  room: { hemi: 0.1, key: 1.7, rim: 0.4 }');
  sameExcept(FIXTURE, out, [16]);
  assert.deepEqual(parseYaml(out).tree.light.room, { hemi: 0.1, key: 1.7, rim: 0.4 });
  out = patchYaml(FIXTURE, { 'light.breath.period': 6 });
  assert.equal(lines(out)[21], '  breath: { period: 6 }');
  assert.deepEqual(parseYaml(out).tree.light.breath, { period: 6 });
  out = patchYaml('a: {b: 1}\n', { 'a.c': 'x y' });
  assert.equal(out, 'a: {b: 1, c: x y}\n');
  out = patchYaml('a: { b: 1, }\n', { 'a.c': 2 });
  assert.equal(out, 'a: { b: 1, c: 2, }\n');
  assert.deepEqual(parseYaml(out).tree, { a: { b: 1, c: 2 } });
  // a new map inside a flow map is a nested flow (one level is the limit)
  out = patchYaml(FIXTURE, { 'light.room.deep.k': 2 });
  assert.equal(lines(out)[16], '  room: { hemi: 0.1, key: 1.7, deep: { k: 2 } }');
  assert.deepEqual(parseYaml(out).tree.light.room.deep, { k: 2 });
  assert.throws(() => patchYaml(FIXTURE, { 'light.room.deep.k.z': 2 }), /one is the limit/);
  assert.throws(() => patchYaml('a: { b: { c: 1 } }\n', { 'a.b.d.e': 1 }), /one is the limit/);
});

t('insert through a missing intermediate: under an existing section, and a whole new section', () => {
  let out = patchYaml(FIXTURE, { 'light.tower.glow': 1 });
  let b = lines(out);
  assert.deepEqual(b.slice(21, 25), ['  breath: {}', '  tower:', '    glow: 1', '']);
  assert.deepEqual([...b.slice(0, 22), ...b.slice(24)], lines(FIXTURE));
  assert.deepEqual(parseYaml(out).tree.light.tower, { glow: 1 });

  out = patchYaml(FIXTURE, { 'throw.physics.gravity': -110 });
  b = lines(out);
  assert.deepEqual(b.slice(38), ['# the last word', 'throw:', '  physics:', '    gravity: -110', '']);
  assert.deepEqual(b.slice(0, 39), lines(FIXTURE).slice(0, 39));
  assert.deepEqual(parseYaml(out).tree, { ...TREE, throw: { physics: { gravity: -110 } } });

  // two leaves into the same missing intermediate land in one block
  out = patchYaml(FIXTURE, { 'throw.physics.gravity': -110, 'throw.physics.iterations': 14, 'throw.target': 0.4 });
  assert.deepEqual(lines(out).slice(39), ['throw:', '  physics:', '    gravity: -110', '    iterations: 14', '  target: 0.4', '']);
  assert.deepEqual(parseYaml(out).tree.throw, { physics: { gravity: -110, iterations: 14 }, target: 0.4 });

  // a bare `key:` is an empty block map: children go under it
  out = patchYaml(FIXTURE, { 'empty.x': 1, 'empty.y': { z: 2 } });
  assert.deepEqual(lines(out).slice(36, 41), ['empty:', '  x: 1', '  y:', '    z: 2', 'tail: ~']);
  assert.deepEqual(parseYaml(out).tree.empty, { x: 1, y: { z: 2 } });

  // into an empty document
  assert.equal(patchYaml('', { 'a.b': 1 }), 'a:\n  b: 1\n');
  assert.equal(patchYaml('# header\n', { a: 1 }), '# header\na: 1\n');
  // a four-space file gets four-space children
  assert.equal(patchYaml('a:\n    b: 1\n', { 'a.c.d': 2 }), 'a:\n    b: 1\n    c:\n        d: 2\n');
  assert.equal(patchYaml('a:\n    b: 1\nq:\n', { 'q.r': 2 }), 'a:\n    b: 1\nq:\n    r: 2\n');
});

t('remove: the leaf\'s line goes, comment and all; nothing else moves', () => {
  let out = patchYaml(FIXTURE, { 'app.version': undefined });
  let b = lines(out);
  assert.deepEqual(b, lines(FIXTURE).filter((_, i) => i !== 6));
  assert.deepEqual(parseYaml(out).tree.app, { title: 'Dice Table', mode: 'development' });
  out = patchYaml(FIXTURE, { 'app.mode': undefined });
  assert.ok(!out.includes('development | production'));
  // removing a whole block map removes its key line through its last line
  out = patchYaml(FIXTURE, { 'light.lamp': undefined });
  b = lines(out);
  assert.deepEqual(b, lines(FIXTURE).filter((_, i) => i < 13 || i > 15));
  assert.deepEqual(Object.keys(parseYaml(out).tree.light), ['room', 'fog', 'breath']);
  // removing a leaf whose value is a flow map removes that line
  out = patchYaml(FIXTURE, { 'light.room': undefined });
  assert.deepEqual(lines(out), lines(FIXTURE).filter((_, i) => i !== 16));
  // a whole section
  out = patchYaml(FIXTURE, { app: undefined });
  assert.deepEqual(lines(out), lines(FIXTURE).filter((_, i) => i < 3 || i > 6));
  // removing what is not there is a no-op
  assert.equal(patchYaml(FIXTURE, { 'app.nothing': undefined, 'nope.x.y': undefined }), FIXTURE);
});

t('remove the last child of a block map: the parent becomes {} rather than null', () => {
  const out = patchYaml(FIXTURE, { 'light.fog.near': undefined, 'light.fog.far': undefined });
  const b = lines(out);
  assert.equal(b[17], '  fog: {}');
  assert.deepEqual(b, lines(FIXTURE).map((l, i) => (i === 17 ? '  fog: {}' : l)).filter((_, i) => i !== 18 && i !== 19));
  assert.deepEqual(parseYaml(out).tree.light.fog, {});
  // the same at the second level, keeping a comment on the key line
  const out2 = patchYaml('a: # keep\n  b: 1\nz: 2\n', { 'a.b': undefined });
  assert.equal(out2, 'a: {} # keep\nz: 2\n');
  // at the root, the document may empty out (zero lines, not one blank one)
  assert.equal(patchYaml('a: 1\n', { a: undefined }), '');
  assert.deepEqual(parseYaml(patchYaml('a: 1\n', { a: undefined })).tree, {});
});

t('remove a flow entry: first, middle, last, sole', () => {
  const src = 'm: { a: 1, b: 2, c: 3 } # c\n';
  assert.equal(patchYaml(src, { 'm.a': undefined }), 'm: { b: 2, c: 3 } # c\n');
  assert.equal(patchYaml(src, { 'm.b': undefined }), 'm: { a: 1, c: 3 } # c\n');
  assert.equal(patchYaml(src, { 'm.c': undefined }), 'm: { a: 1, b: 2 } # c\n');
  assert.equal(patchYaml(src, { 'm.a': undefined, 'm.b': undefined, 'm.c': undefined }), 'm: {} # c\n');
  assert.equal(patchYaml('m: {a: 1}\n', { 'm.a': undefined }), 'm: {}\n');
  const out = patchYaml(FIXTURE, { 'light.room.hemi': undefined });
  assert.equal(lines(out)[16], '  room: { key: 1.7 }');
  sameExcept(FIXTURE, out, [16]);
  // a nested flow map inside a flow map
  assert.equal(patchYaml('m: { a: { x: 1, y: 2 }, b: 1 }\n', { 'm.a.x': undefined }), 'm: { a: { y: 2 }, b: 1 }\n');
  assert.equal(patchYaml('m: { a: { x: 1 }, b: 1 }\n', { 'm.a': undefined }), 'm: { b: 1 }\n');
});

t('a change through a scalar or a list is refused; a map target is refused', () => {
  assert.throws(() => patchYaml(FIXTURE, { 'app.title.x': 1 }), (e) => e instanceof YamlError && /passes through a scalar at app.title/.test(e.message));
  assert.throws(() => patchYaml(FIXTURE, { 'tail.x': 1 }), /passes through a scalar/);
  assert.throws(() => patchYaml(FIXTURE, { 'seats.0': 'two' }), /passes through a list/);
  assert.throws(() => patchYaml(FIXTURE, { 'seats.2.kind': 'x' }), /passes through a list/);
  assert.throws(() => patchYaml(FIXTURE, { 'seats.0': undefined }), /passes through a list/);
  assert.throws(() => patchYaml(FIXTURE, { seats: 1 }), /block list/);
  assert.throws(() => patchYaml(FIXTURE, { light: 1 }), /is a map; patch its leaves/);
  assert.throws(() => patchYaml(FIXTURE, { '': 1 }), /needs a path/);
  assert.throws(() => patchYaml(FIXTURE, { 'app.title': true }), /booleans/);
  assert.throws(() => patchYaml('a: [1', { b: 1 }), YamlError);
  assert.throws(() => patchYaml('a: [1', {}), YamlError);
  // a flow list is one value, so it can be replaced whole
  const out = patchYaml(FIXTURE, new Map([[['sets', 'house.ember', 'tags'], ['x', 1]]]));
  assert.equal(lines(out)[27], '    tags: [x, 1]');
  assert.deepEqual(parseYaml(out).tree.sets['house.ember'].tags, ['x', 1]);
});

t('several changes at once, object values flatten to leaves, Map paths with dots in keys', () => {
  const out = patchYaml(FIXTURE, { light: { lamp: { y: 30 }, room: { rim: 0.4 } }, 'table.scale': 3, 'app.version': undefined, 'pace.tempo': 1 });
  const tree = parseYaml(out).tree;
  const want = structuredClone(TREE);
  want.light.lamp.y = 30; want.light.room.rim = 0.4; want.table.scale = 3; delete want.app.version; want.pace = { tempo: 1 };
  assert.deepEqual(tree, want);
  assert.equal(lines(out)[8], '  scale: 3               # the one dial'); // one line up: app.version is gone
  const out2 = patchYaml(FIXTURE, new Map([[['sets', 'house.ember', 'label'], 'Ash'], [['sets', 'house.ember', 'feel', 'metal'], 0.5]]));
  assert.equal(lines(out2)[25], '    label: Ash');
  assert.equal(lines(out2)[26], '    feel: { rough: 0.35, metal: 0.5 }');
  sameExcept(FIXTURE, out2, [25, 26]);
  // an empty object as a value writes {}
  assert.equal(patchYaml('a: 1\n', { b: {} }), 'a: 1\nb: {}\n');
  assert.equal(patchYaml('a: 1\n', { a: {} }), 'a: {}\n');
  assert.equal(patchYaml('a: 1\n', { b: [] }), 'a: 1\nb: []\n');
  assert.equal(patchYaml('a: 1\n', { b: [1, 'x'] }), 'a: 1\nb:\n  - 1\n  - x\n');
});

t('a CRLF file stays CRLF, inserted lines included', () => {
  const src = FIXTURE.replaceAll('\n', '\r\n');
  assert.equal(patchYaml(src, {}), src);
  const out = patchYaml(src, { 'app.title': 'X', 'table.friction': 0.6, 'app.version': undefined });
  assert.ok(!/[^\r]\n/.test(out), 'every newline is CRLF');
  assert.deepEqual(parseYaml(out).tree.table, { scale: 2.5, ceilingY: 22, friction: 0.6 });
  assert.deepEqual(parseYaml(out).tree.app, { title: 'X', mode: 'development' });
});

t('a file without a trailing newline keeps that shape', () => {
  assert.equal(patchYaml('a: 1\nb: 2', { c: 3 }), 'a: 1\nb: 2\nc: 3');
  assert.equal(patchYaml('a: 1\nb: 2', { b: 5 }), 'a: 1\nb: 5');
});

// ---- emit ------------------------------------------------------------------

t('emitYaml: block style, one key per line, two-space nesting, {} and [] for empties', () => {
  const v = { a: 1, b: 'x', c: { d: null, e: { f: 'g h' } }, k: {}, l: [], m: [1, 'two', { n: 3, o: { p: 4 } }, {}], 'q.r': '#hex' };
  assert.equal(emitYaml(v), [
    'a: 1', 'b: x', 'c:', '  d: null', '  e:', '    f: g h', 'k: {}', 'l: []',
    'm:', '  - 1', '  - two', '  - n: 3', '    o:', '      p: 4', '  - {}', '"q.r": "#hex"', '',
  ].join('\n'));
  assert.equal(emitYaml({ a: { b: 1 } }, 4), '    a:\n      b: 1\n');
  assert.equal(emitYaml({}), '{}\n');
  assert.equal(emitYaml([]), '[]\n');
  assert.equal(emitYaml('s'), 's\n');
  assert.throws(() => emitYaml({ a: [[1]] }), /nested lists/);
  assert.throws(() => emitYaml({ a: true }), /booleans/);
});

t('emit → parse is a round trip, the fixture tree included', () => {
  assert.deepEqual(parseYaml(emitYaml(TREE)).tree, TREE);
  const nasty = {
    s: ['', ' pad', 'pad ', '-x', '?q', 'a: b', 'a #b', 'a#b', '12', '1e5', '-0', 'true', 'No', 'null', '~', 'x,y', '[z]', '{w}', 'k:', 'tab\there', 'nl\nhere', 'q"uo"te', 'back\\slash', "it's", '#hex', '@at', '`tick`', '%pc', 'a: {b: 1}'],
    n: [0, -1.5, 1e21, 1e-7, 123456789012],
    m: { 'dot.key': 1, 'sp ace': 2, '': 3, 'k:': 4, 12: 5 },
  };
  assert.deepEqual(parseYaml(emitYaml(nasty)).tree, nasty);
});

t('formatScalar: quoting rules, numbers, refusals', () => {
  assert.equal(formatScalar('plain text'), 'plain text');
  assert.equal(formatScalar('a#b'), 'a#b');
  assert.equal(formatScalar('http://x/y'), 'http://x/y');
  assert.equal(formatScalar("it's"), "it's");
  assert.equal(formatScalar(''), '""');
  assert.equal(formatScalar(' lead'), '" lead"');
  assert.equal(formatScalar('trail '), '"trail "');
  for (const c of '-?:,[]{}#&*!|>\'"%@`') assert.equal(formatScalar(`${c}x`), `"${c === '"' ? '\\"' : c}x"`, `leading ${c}`);
  assert.equal(formatScalar('a: b'), '"a: b"');
  assert.equal(formatScalar('a #b'), '"a #b"');
  assert.equal(formatScalar('12'), '"12"');
  assert.equal(formatScalar('-3.5e2'), '"-3.5e2"');
  assert.equal(formatScalar('null'), '"null"');
  assert.equal(formatScalar('~'), '"~"');
  for (const w of ['true', 'False', 'yes', 'NO', 'on', 'Off']) assert.equal(formatScalar(w), `"${w}"`);
  assert.equal(formatScalar('nl\nx'), '"nl\\nx"');
  assert.equal(formatScalar('q"x'), 'q"x'); // a quote inside plain text is text
  assert.equal(formatScalar("rock-'n roll"), "rock-'n roll");
  assert.equal(formatScalar("x-'y"), "x-'y");
  assert.equal(formatScalar("x:'y"), "x:'y");
  assert.equal(formatScalar("o'clock -'x"), "o'clock -'x");
  assert.equal(formatScalar("x - 'y"), '"x - \'y"'); // where the reader would open a quote, the writer quotes whole
  assert.equal(formatScalar('x -  "y"'), '"x -  \\"y\\""');
  assert.equal(formatScalar('"q"'), '"\\"q\\""');
  assert.equal(formatScalar('b\\s'), 'b\\s');
  assert.equal(formatScalar(null), 'null');
  assert.equal(formatScalar(undefined), 'null');
  assert.equal(formatScalar(0), '0');
  assert.equal(formatScalar(-0), '0');
  assert.equal(formatScalar(2.5), '2.5');
  assert.equal(formatScalar(-110), '-110');
  assert.equal(formatScalar(0.1 + 0.2), '0.30000000000000004');
  assert.equal(formatScalar(1e21), '1e+21');
  assert.equal(formatScalar([1, 'a b', null]), '[1, a b, null]');
  assert.equal(formatScalar([]), '[]');
  assert.equal(formatScalar({}), '{}');
  assert.throws(() => formatScalar(Infinity), /non-finite/);
  assert.throws(() => formatScalar(NaN), /non-finite/);
  assert.throws(() => formatScalar(true), /booleans/);
  assert.throws(() => formatScalar(() => 1), /cannot write/);
  // what formatScalar writes, the parser reads back as the same value
  const trips = [
    '12', 'true', 'a: b', '', ' x', 'x,y', '#h', 'k:', 'plain',
    "rock-'n roll", "x-'y", "x:'y", 'x-"y', "o'clock -'x", "x - 'y", 'x -  "y"', "it's", 'q"x', "a 'b' c", "- 'x", "x -'y", "x: 'y",
  ];
  for (const s of trips) {
    assert.deepEqual(parseYaml(`k: ${formatScalar(s)}`).tree, { k: s }, `round trip of ${JSON.stringify(s)}`);
    assert.deepEqual(parseYaml(`- ${formatScalar(s)}`.replace(/^/, 'l:\n  ')).tree, { l: [s] }, `list round trip of ${JSON.stringify(s)}`);
    assert.deepEqual(parseYaml(`k: [${formatScalar(s)}, ${formatScalar(s)}]`).tree, { k: [s, s] }, `flow round trip of ${JSON.stringify(s)}`);
    assert.deepEqual(parseYaml(patchYaml('k: old # c\n', { k: s })).tree, { k: s }, `patch round trip of ${JSON.stringify(s)}`);
  }
});

// ---- the reviewer's findings, each pinned -----------------------------------

t('patchYaml refuses __proto__ anywhere in a path, before touching the text', () => {
  assert.throws(() => patchYaml('a: 1\n', { '__proto__.x': 1 }), (e) => e instanceof YamlError && /__proto__/.test(e.message));
  assert.throws(() => patchYaml('a: 1\n', { 'a.__proto__': 1 }), /__proto__/);
  assert.throws(() => patchYaml('a: 1\n', new Map([[['b', '__proto__', 'c'], 1]])), /__proto__/);
  assert.throws(() => patchYaml('a: 1\n', { b: { __proto__: null, ['__proto__']: 1 } }), /__proto__/);
  assert.deepEqual(parseYaml(patchYaml('a: 1\n', { proto: 1 })).tree, { a: 1, proto: 1 });
});

t('patchYaml re-reads what it wrote and never returns a text that does not parse', () => {
  // every change in a broad batch lands in a file the reader accepts
  const out = patchYaml(FIXTURE, { 'app.title': "x - 'y", 'light.room.name': "rock-'n roll", 'sets.house.ember': 3, 'a b': { 'c: d': "it's", 'e #f': 'g' } });
  const tree = parseYaml(out).tree;
  assert.equal(tree.app.title, "x - 'y");
  assert.equal(tree.light.room.name, "rock-'n roll");
  assert.deepEqual(tree.sets.house, { ember: 3 });
  assert.deepEqual(tree['a b'], { 'c: d': "it's", 'e #f': 'g' });
});

t('a removal and an insertion under one block map keep it a block map', () => {
  assert.equal(patchYaml('a:\n  b: 1\nz: 1\n', { 'a.b': undefined, 'a.c': 2 }), 'a:\n  c: 2\nz: 1\n');
  assert.equal(patchYaml('a:\n  b: 1\nz: 1\n', { 'a.b': undefined, 'a.c.d': 2 }), 'a:\n  c:\n    d: 2\nz: 1\n');
  assert.equal(patchYaml('a: # keep\n  b: 1\nz: 1\n', { 'a.b': undefined, 'a.c': 2 }), 'a: # keep\n  c: 2\nz: 1\n');
  // without a later insert the emptied map still says {}
  assert.equal(patchYaml('a:\n  b: 1\nz: 1\n', { 'a.b': undefined, 'z': 2 }), 'a: {}\nz: 2\n');
  // a four-space file keeps its step through the removal
  assert.equal(patchYaml('a:\n    b: 1\nz: 1\n', { 'a.b': undefined, 'a.c.d': 2 }), 'a:\n    c:\n        d: 2\nz: 1\n');
  // changes still apply in order: a later change to the same path wins
  assert.equal(patchYaml('a:\n  b: 1\n', new Map([[['a', 'b'], undefined], [['a', 'b'], 2]])), 'a:\n  b: 2\n');
  assert.equal(patchYaml('a:\n  b: 1\n', new Map([[['a', 'b'], 2], [['a', 'b'], undefined]])), 'a: {}\n');
  assert.deepEqual(parseYaml(patchYaml('a:\n  b: 1\nz: 1\n', { a: undefined, 'a.c': 2 })).tree, { z: 1, a: { c: 2 } });
});

t('a `- key: v` list item does not set the file\'s indent step', () => {
  const src = 'a:\n    b: 1\nl:\n    - k: 1\n      m: 2\n';
  assert.equal(parseYaml(src).spans.get('').step, 4);
  assert.equal(patchYaml(src, { 'a.c.d': 2 }), 'a:\n    b: 1\n    c:\n        d: 2\nl:\n    - k: 1\n      m: 2\n');
  assert.deepEqual(parseYaml(patchYaml(src, { 'a.c.d': 2 })).tree, { a: { b: 1, c: { d: 2 } }, l: [{ k: 1, m: 2 }] });
  // a file whose only nesting is such a list still steps by two
  assert.equal(parseYaml('l:\n  - k: 1\n    m: 2\n').spans.get('').step, 2);
  assert.equal(patchYaml('l:\n  - k: 1\n', { 'a.b': 1 }), 'l:\n  - k: 1\na:\n  b: 1\n');
});

t('integer-like keys enumerate first, by JS rule, and say so in the emit', () => {
  assert.equal(emitYaml({ b: 1, 12: 2 }), '"12": 2\nb: 1\n');
  assert.deepEqual(parseYaml('b: 1\n"12": 2\n').tree, { 12: 2, b: 1 });
  assert.deepEqual(Object.keys(parseYaml('b: 1\n"12": 2\n').tree), ['12', 'b']);
});

if (process.exitCode) process.exit(process.exitCode);
console.log(`all ${n} yaml tests pass`);
