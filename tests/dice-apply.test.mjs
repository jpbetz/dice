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

// tests/dice-apply.test.mjs — the apply tool (tools/dice-apply.mjs), the
// other half of developer mode's Download (docs/DEVMODE.md §6).
//
// The load-bearing claims:
//   · the checkout's OWN text is what gets patched: a comment added locally
//     after the download survives, and every line no change touches is
//     byte-identical — the given file's bytes are never copied over;
//   · only leaves that DIFFER are changes, reported `path: old → new` in
//     file order with a count; a leaf the checkout omits is inserted under
//     its map and reported `(absent) → new`; a null is absent, not a change;
//   · refusals are exit 2, one line per problem, and NOTHING is written —
//     an unknown path, a wrong type, an enum value outside its options, a
//     path through a dial, and a boolean (with its line, from the reader);
//   · `--check` prints the same report and writes nothing; the write is
//     atomic and leaves no temp file behind.
//
// Every run is against a SCRATCH COPY of the tree (the tool, js/yaml.js,
// js/tune.js, js/dice-apply-core.js and dice.yaml), never the checkout — the tool's default root
// is the tree it lives in, so the copy is how that default is exercised;
// `--root` is exercised too.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseYaml, patchYaml } from '../js/yaml.js';
import { applyText, planChanges, validate, reportLine } from '../tools/dice-apply.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = readFileSync(join(ROOT, 'dice.yaml'), 'utf8');

const SCRATCH_BASE = process.env.DICE_TEST_SCRATCH || tmpdir();
mkdirSync(SCRATCH_BASE, { recursive: true });

// A scratch tree: the tool at tools/, its two imports at js/, and a
// dice.yaml that starts as the checkout's.
function makeTree(yaml = FILE) {
  const dir = mkdtempSync(join(SCRATCH_BASE, 'dice-apply-'));
  mkdirSync(join(dir, 'tools'));
  mkdirSync(join(dir, 'js'));
  cpSync(join(ROOT, 'tools', 'dice-apply.mjs'), join(dir, 'tools', 'dice-apply.mjs'));
  cpSync(join(ROOT, 'js', 'yaml.js'), join(dir, 'js', 'yaml.js'));
  cpSync(join(ROOT, 'js', 'tune.js'), join(dir, 'js', 'tune.js'));
  cpSync(join(ROOT, 'js', 'dice-apply-core.js'), join(dir, 'js', 'dice-apply-core.js'));
  writeFileSync(join(dir, 'dice.yaml'), yaml);
  return dir;
}

function run(dir, args) {
  const r = spawnSync(process.execPath, [join(dir, 'tools', 'dice-apply.mjs'), ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const given = (dir, text, name = 'download.yaml') => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};

const yamlOf = (dir) => readFileSync(join(dir, 'dice.yaml'), 'utf8');
const tmpFiles = (dir) => readdirSync(dir).filter((f) => f.startsWith('dice.yaml.tmp'));

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.stack || e.message}`);
    process.exitCode = 1;
  }
};

const trees = [];
const tree = (yaml) => { const d = makeTree(yaml); trees.push(d); return d; };

// ---- in-process: the computation ------------------------------------------

t('validate: the checked-in file has no problems', () => {
  assert.deepEqual(validate(parseYaml(FILE).tree), []);
});

t('validate: unknown, wrong type, option, through a dial, map-not-leaf — one line each, in file order', () => {
  const bad = parseYaml([
    'light:',
    '  lamp:',
    '    y: high',                 // type
    '    q: 3',                    // unknown
    '  motes:',
    '    state: sometimes',        // option
    'table:',
    '  scale:',
    '    label: x',                // through a dial
    '  legs: 4',                   // no dial
    'camera:',
    '  framing: 2',                // a map in the tree
    '',
  ].join('\n')).tree;
  const problems = validate(bad).map((p) => p.message);
  assert.deepEqual(problems, [
    'light.lamp.y: expected number, got high',
    'light.lamp.q: no dial at this path',
    'light.motes.state: expected one of enabled | disabled, got sometimes',
    'table.scale.label: passes through the dial at table.scale',
    'table.legs: no dial at this path',
    'camera.framing: a map in the dial tree, not a leaf',
  ]);
});

t('validate: a null at a dial is absent, not a problem; a list is the wrong type', () => {
  assert.deepEqual(validate({ light: { lamp: { y: null } } }), []);
  assert.deepEqual(validate({ light: { lamp: { y: [1, 2] } } }).map((p) => p.message), ['light.lamp.y: expected number, got [1, 2]']);
});

t('planChanges: only leaves that differ; absent leaves are inserts; null is nothing', () => {
  const checkout = { light: { lamp: { y: 24, z: 1.5 } }, table: { scale: 2.5 } };
  const g = { light: { lamp: { y: 30, z: 1.5, angle: null } }, table: { scale: 2.5, ceilingY: 22 } };
  const changes = planChanges(g, checkout);
  assert.deepEqual(changes.map(reportLine), ['light.lamp.y: 24 → 30', 'table.ceilingY: (absent) → 22']);
});

t('applyText: the checkout text is patched, not replaced', () => {
  const local = FILE.replace('    y: 24                  # pool ~27 at the felt over a 13.75 table',
    '    # a note I wrote locally\n    y: 24                  # pool ~27 at the felt over a 13.75 table');
  const download = patchYaml(FILE, { 'light.lamp.y': 30, 'table.scale': 3 });
  const r = applyText(local, download);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.changes.map(reportLine), ['table.scale: 2.5 → 3', 'light.lamp.y: 24 → 30']);
  assert.equal(r.text, patchYaml(local, { 'light.lamp.y': 30, 'table.scale': 3 }));
  assert.ok(r.text.includes('    # a note I wrote locally\n    y: 30                  # pool ~27'), 'the local comment stands beside the new value');
});

t('applyText: a boolean in the given file is a problem with its line', () => {
  const r = applyText(FILE, FILE.replace('state: enabled         # enabled | disabled\n    count', 'state: true\n    count'), { givenName: 'dl.yaml' });
  const line = FILE.split('\n').findIndex((l) => l.includes('state: enabled')) + 1;
  assert.deepEqual(r.problems.map((p) => p.message), [`dl.yaml:${line}: booleans are not allowed; use an enum with named states`]);
  assert.deepEqual(r.changes, []);
  assert.equal(r.text, FILE);
});

// ---- the CLI, on scratch trees ----------------------------------------------

t('two changes: exit 0, one line each in file order, a count, and the file is the patch of ITS OWN text', () => {
  const dir = tree(FILE.replace('  fog:\n', '  fog:                    # my own remark\n'));
  const before = yamlOf(dir);
  assert.notEqual(before, FILE, 'the scratch checkout differs from the download by a local comment');
  const dl = given(dir, patchYaml(FILE, { 'light.lamp.y': 30, 'table.scale': 3 }));
  const r = run(dir, [dl]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.err, '');
  assert.deepEqual(r.out.split('\n'), ['table.scale: 2.5 → 3', 'light.lamp.y: 24 → 30', `2 changes written to ${join(dir, 'dice.yaml')}`, '']);
  const after = yamlOf(dir);
  assert.equal(after, patchYaml(before, { 'light.lamp.y': 30, 'table.scale': 3 }), 'the checkout\'s own text, two spans rewritten');
  assert.ok(after.includes('  fog:                    # my own remark\n'), 'the local comment survived');
  assert.equal(parseYaml(after).tree.light.lamp.y, 30);
  assert.equal(parseYaml(after).tree.table.scale, 3);
  const a = before.split('\n'), b = after.split('\n');
  assert.equal(a.length, b.length, 'no line added or removed');
  const moved = a.map((l, i) => (l === b[i] ? null : i + 1)).filter(Boolean);
  assert.equal(moved.length, 2, `exactly two lines differ (${moved.join(', ')})`);
  assert.deepEqual(tmpFiles(dir), [], 'no temp file left behind');
});

t('--check: the same report, nothing written', () => {
  const dir = tree();
  const dl = given(dir, patchYaml(FILE, { 'light.lamp.y': 30 }));
  const r = run(dir, [dl, '--check']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.split('\n'), ['light.lamp.y: 24 → 30', '1 change; --check, nothing written', '']);
  assert.equal(yamlOf(dir), FILE, 'untouched');
  assert.deepEqual(tmpFiles(dir), []);
});

t('no changes: exit 0, says so, writes nothing', () => {
  const dir = tree();
  const dl = given(dir, FILE);
  const r = run(dir, [dl]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^no changes: /);
  assert.equal(yamlOf(dir), FILE);
});

t('a leaf the checkout omits is inserted under its map and reported (absent)', () => {
  const dir = tree(FILE.replace('    z: 1.5                 # over the felt, nudged to the front\n', ''));
  assert.equal(parseYaml(yamlOf(dir)).tree.light.lamp.z, undefined, 'the scratch checkout has no lamp.z line');
  const dl = given(dir, patchYaml(FILE, { 'light.lamp.z': 2 }));
  const r = run(dir, [dl]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.split('\n').slice(0, 2), ['light.lamp.z: (absent) → 2', `1 change written to ${join(dir, 'dice.yaml')}`]);
  const after = parseYaml(yamlOf(dir)).tree;
  assert.equal(after.light.lamp.z, 2);
  assert.equal(after.light.lamp.y, 24, 'its neighbours as they were');
  assert.ok(yamlOf(dir).includes('\n    z: 2\n'), 'one inserted line under lamp');
});

t('an unknown leaf: exit 2, one line, nothing written', () => {
  const dir = tree();
  const dl = given(dir, patchYaml(FILE, { 'light.lamp.y': 30 }).replace('    z: 1.5', '    zz: 1.5'));
  const r = run(dir, [dl]);
  assert.equal(r.code, 2);
  assert.equal(r.out, '', 'no report on a refusal');
  assert.deepEqual(r.err.split('\n'), ['refused light.lamp.zz: no dial at this path', '1 problem; nothing written', '']);
  assert.equal(yamlOf(dir), FILE, 'the lawful change in the same file did NOT land either');
});

t('every problem is its own line: type, option, unknown — and nothing written', () => {
  const dir = tree();
  const dl = given(dir, FILE
    .replace('    y: 24 ', '    y: tall ')
    .replace('    axis: clamp', '    axis: diagonal')
    .replace('  target: 0.4', '  goal: 0.4'));
  const r = run(dir, [dl]);
  assert.equal(r.code, 2);
  assert.deepEqual(r.err.split('\n'), [
    'refused light.lamp.y: expected number, got tall',
    'refused throw.spawn.axis: expected one of width | own | clamp, got diagonal',
    'refused throw.goal: no dial at this path',
    '3 problems; nothing written', '',
  ]);
  assert.equal(yamlOf(dir), FILE);
});

t('a boolean: exit 2 with the reader\'s line', () => {
  const dir = tree();
  const text = FILE.replace('    state: enabled         # enabled | disabled\n    count', '    state: true\n    count');
  const dl = given(dir, text);
  const line = text.split('\n').findIndex((l) => l.includes('state: true')) + 1;
  const r = run(dir, [dl]);
  assert.equal(r.code, 2);
  assert.match(r.err, new RegExp(`^refused ${dl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:${line}: booleans are not allowed`));
  assert.equal(yamlOf(dir), FILE);
});

t('--root DIR patches that checkout, from a tool that lives elsewhere', () => {
  const home = tree();                       // where the tool runs from
  const other = tree();                      // the checkout named by --root
  const dl = given(home, patchYaml(FILE, { 'throw.physics.gravity': -90 }));
  const r = run(home, [dl, '--root', other]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.split('\n')[0], 'throw.physics.gravity: -110 → -90');
  assert.equal(yamlOf(home), FILE, 'the tool\'s own tree is untouched');
  assert.equal(parseYaml(yamlOf(other)).tree.throw.physics.gravity, -90, 'the named one moved');
});

t('usage: no file, an unknown option, an unreadable file — exit 1', () => {
  const dir = tree();
  assert.equal(run(dir, []).code, 1);
  assert.match(run(dir, []).err, /^usage: /);
  assert.equal(run(dir, ['--bogus', 'x.yaml']).code, 1);
  const r = run(dir, [join(dir, 'nope.yaml')]);
  assert.equal(r.code, 1);
  assert.match(r.err, /cannot read /);
  assert.equal(yamlOf(dir), FILE);
});

t('a checkout whose shape cannot take the change (a scalar where the download has a map): exit 2, one line, nothing written', () => {
  const local = 'app:\n  mode: development\nlight: 5                     # a scalar where the tree has a map\n';
  const dir = tree(local);
  const dl = given(dir, 'light:\n  lamp:\n    y: 30\n');
  const r = run(dir, [dl]);
  assert.equal(r.code, 2, `not a crash: ${r.err}`);
  assert.equal(r.out, '');
  assert.deepEqual(r.err.split('\n'), [
    `refused ${join(dir, 'dice.yaml')}: light.lamp.y passes through a scalar at light`,
    '1 problem; nothing written', '',
  ]);
  assert.equal(yamlOf(dir), local, 'untouched');
  assert.deepEqual(tmpFiles(dir), []);
  // and in-process, the same problem, not a throw
  const a = applyText(local, 'light:\n  lamp:\n    y: 30\n', { checkoutName: 'dice.yaml' });
  assert.deepEqual(a.problems.map((p) => p.message), ['dice.yaml: light.lamp.y passes through a scalar at light']);
  assert.deepEqual(a.changes, []);
  assert.equal(a.text, local);
});

t('a checkout with no dice.yaml: every leaf is an insert into an empty file', () => {
  const dir = tree();
  rmSync(join(dir, 'dice.yaml'));
  assert.ok(!existsSync(join(dir, 'dice.yaml')));
  const dl = given(dir, 'table:\n  scale: 3\nlight:\n  lamp:\n    y: 30\n');
  const r = run(dir, [dl]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.split('\n').slice(0, 2), ['table.scale: (absent) → 3', 'light.lamp.y: (absent) → 30']);
  assert.deepEqual(parseYaml(yamlOf(dir)).tree, { table: { scale: 3 }, light: { lamp: { y: 30 } } });
});

for (const d of trees) rmSync(d, { recursive: true, force: true });

if (process.exitCode) console.error(`dice-apply.test: FAILED`);
else console.log(`dice-apply.test: ${n} passed`);
