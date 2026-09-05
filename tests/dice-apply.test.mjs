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
import { applyText, applyChanges, planChanges, validate, validateChanges, reportLine } from '../tools/dice-apply.mjs';

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

// A LIST DIAL HAS THREE LAWS AND `each` WAS ONLY ONE OF THEM (the D1 review,
// 2026-09-03). `judgeValue` checked the vocabulary when there was one and
// nothing at all when there was not — so a palette of numbers or of nulls
// validated here, and the armed Save route wrote it into the file for
// js/particles.js to hand to `hexRGB`. The count comes first, because a face
// table of two is a different mistake from a face table with a bad word in it.
t('validate: a list dial\'s length, its entries, and its vocabulary — in that order', () => {
  const of = (tree) => validate(tree).map((p) => p.message);
  const set = (recipe) => ({ houses: { h: { label: 'H', dice: { s: recipe } } } });
  assert.deepEqual(of(set({ faces: ['1', '2', '3', '4', '5', 'claw'] })), []);
  assert.deepEqual(of(set({ faces: ['plus', 'minus'] })),
    ['houses.h.dice.s.faces: takes 6 entries, got 2']);
  assert.deepEqual(of(set({ faces: ['1', '2', '3', '4', '5', 'sword'] })),
    ['houses.h.dice.s.faces: every entry must be one of 1 | 2 | 3 | 4 | 5 | 6 | bolt | claw | heart | plus | minus | blank, got sword']);
  assert.deepEqual(of(set({ faces: ['1', '2', '3', '4', '5', 6] })),
    ['houses.h.dice.s.faces: every entry must be a string, got 6 at 5'],
    'a YAML 6 is a number, and the table is read as text');
  // A palette has no vocabulary, which is not the same as no law.
  assert.deepEqual(of(set({ particles: { kind: 'motes', colors: ['#ffffff'] } })), []);
  assert.deepEqual(of(set({ particles: { colors: [1, 2] } })),
    ['houses.h.dice.s.particles.colors: every entry must be a string, got 1 at 0']);
  assert.deepEqual(of(set({ particles: { colors: [] } })),
    ['houses.h.dice.s.particles.colors: takes 1-8 entries, got 0']);
  assert.deepEqual(of(set({ decal: { kind: 'ring', colors: ['#a', '#b', '#c'] } })),
    ['houses.h.dice.s.decal.colors: takes 1-2 entries, got 3'],
    'js/decals.js reads two, so a third is a colour nothing paints with');
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

t('a felts row rides the same loop: the row is inserted, and a bad field is one line', () => {
  // THE ASSET HALF OF THE LOOP (docs/DEVMODE.md §9, phase C4). A row under
  // `felts:` has no dial in the dial tree — its law is the section's ROW
  // SHAPE (js/tune.js ASSET_ROWS) — and this tool and the armed Save route
  // share one validator, so a felt authored in the panel and downloaded lands
  // in the checkout by exactly the path a dial does.
  //
  // THE SECTION IS NO LONGER CREATED BY THIS TEST (phase E1, 2026-09-03): the
  // eleven shipped mats moved into `felts:`, so dice.yaml has always had the
  // section and what a download carries is a ROW INTO IT. `felts:` is the last
  // block in the file, so appending the row's lines is exactly the text the
  // panel's export produces. The insert-a-new-section path is not lost — the
  // dial cases above take it, and `presets:` is still absent from the file.
  const dir = tree();
  const dl = given(dir, `${FILE}  house-moss:\n    name: Moss\n    cloth: silt\n`);
  const r = run(dir, [dl]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.split('\n').slice(0, 2),
    ['felts.house-moss.name: (absent) → Moss', 'felts.house-moss.cloth: (absent) → silt']);
  const after = parseYaml(yamlOf(dir)).tree;
  assert.deepEqual(after.felts['house-moss'], { name: 'Moss', cloth: 'silt' });
  assert.deepEqual(Object.keys(after.felts), Object.keys(parseYaml(FILE).tree.felts).concat(['house-moss']),
    'the shipped mats are where they were, and the row is after them');
  assert.ok(yamlOf(dir).startsWith(FILE), 'appended under the section; not a byte of the rest moved');

  // …and the row shape is the law for a value, exactly as a dial is
  const bad = tree();
  // The id is QUOTED here on purpose: an UNQUOTED dotted key never reaches
  // the validator at all — js/yaml.js refuses it at its line, which is the
  // older and blunter half of the same rule. Quoted, it parses, and then the
  // id rule is what turns it away.
  const dl2 = given(bad, `${FILE}  house-moss:\n    cloth: linen\n  "house.ash":\n    name: Ash\n`);
  const r2 = run(bad, [dl2]);
  assert.equal(r2.code, 2, r2.out);
  assert.match(r2.err, /felts\.house-moss\.cloth: expected one of felt \| silt \| oak \| image, got linen/);
  assert.match(r2.err, /"house\.ash" is not a legal felts id \(.*no dot\)/);
  assert.match(r2.err, /2 problems; nothing written/);
  assert.equal(yamlOf(bad), FILE, 'and nothing was written');
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

t('the laws travel with the dial tree, so the tool and the route refuse what `tune.set` does', () => {
  // A DIVISOR AT ZERO (js/tune.js LAWS.positive). The dial's range is the
  // slider's and the tool never saw a slider, so without the law a hand-edited
  // `k: 0` was a legal file that silenced every landing on the next boot.
  assert.deepEqual(validate({ pace: { tempo: { k: 0 } } }).map((p) => p.message),
    ['pace.tempo.k: must be greater than zero — the code divides by it, got 0']);
  assert.deepEqual(validate({ pace: { tempo: { k: 0.05 } } }), [], 'below the slider is not below the law');
  assert.deepEqual(validateChanges({ 'pace.tempo.k': -1 }).map((p) => p.path), ['pace.tempo.k']);

  // A PAIR (LAWS.cardClear), which no single leaf can answer: `validate` has
  // the whole file, and an absent half takes the code's own number, because
  // that is what the table will actually run on.
  assert.deepEqual(validate({ cards: { standoff: 0.2, depth: 4 } }).map((p) => p.message),
    ['cards.standoff + cards.depth: a card stands outboard of the rim: '
      + 'cards.standoff − cards.depth / 2 may not go below 0']);
  assert.deepEqual(validate({ cards: { depth: 3.9 } }).length, 1,
    'one half against the shipped other half is still the pair');
  assert.deepEqual(validate({ cards: { depth: 3.9, standoff: 2 } }), [], '…and the pair holds together');
  // The checked-in declaration passes both, which is the claim that matters.
  assert.deepEqual(validate(parseYaml(readFileSync(join(ROOT, 'dice.yaml'), 'utf8')).tree), []);

  // …AND THE FLAT PATH ANSWERS THE PAIR TOO (the D4 review, 2026-09-03). This
  // test's title said the ROUTE refused what `tune.set` does and only the tool
  // was shown doing it: `validateChanges` ran `judgeValue`, which skips pair
  // laws by its own comment, and `applyChanges` called nothing else. A post
  // naming one half of the pair is judged against the half the CHECKOUT holds,
  // and with no checkout in hand against the half the CODE holds — the same
  // reading `validate` gives a file that names one leaf of a pair.
  assert.deepEqual(validateChanges({ 'cards.standoff': 0.5 }).map((p) => p.path), ['cards.standoff'],
    'half a pair against the code\'s own depth');
  assert.deepEqual(validateChanges({ 'cards.standoff': 2.2, 'cards.depth': 3.9 }), [],
    'the pair that holds together is not a problem, in either judge');
  assert.deepEqual(
    validateChanges({ 'cards.standoff': 0.9 }, { base: { cards: { depth: 3.9 } } }).map((p) => p.message),
    ['cards.standoff + cards.depth: a card stands outboard of the rim: '
      + 'cards.standoff − cards.depth / 2 may not go below 0'],
    'and against a checkout that holds the other half, that half is the one it is judged against');
  // A type problem is reported as a type problem: a value that is not a number
  // cannot be asked a geometry question.
  assert.deepEqual(validateChanges({ 'cards.depth': 'deep' }).map((p) => p.message),
    ['cards.depth: expected number, got deep']);
});

// THE ARMED ROUTE'S OWN DOOR, end to end on two texts. The failure it closes:
// two dev tabs, or a checkout edited after the tab booted, and a Save that
// names ONE half of the pair writes a dice.yaml the next boot refuses WHOLE —
// both cards leaves back to the defaults, the checkout's own line reverted
// with them (the D4 review measured it: standoff 0.9 posted alone onto a file
// holding depth 3.9).
t('the armed route judges a posted half-pair against the checkout it would patch', () => {
  const local = readFileSync(join(ROOT, 'dice.yaml'), 'utf8');
  const before = parseYaml(local).tree.cards;
  const deep = applyChanges(local, { 'cards.standoff': 2.2, 'cards.depth': 3.9 });
  assert.deepEqual(deep.problems, [], 'the legal pair lands');
  // THE DRESS RIDES ALONG UNTOUCHED — asserted against what the FILE held, not
  // against a copy of it. This line used to spell the dress out leaf by leaf,
  // which made it a second dice.yaml: it went red the first time the owner
  // tuned the panel and saved (`08153a3`, style embossed at scale 1.8), on a
  // change that had nothing to do with what this test is about. The claim here
  // is that a film pair moves and the look leaves beside it do not, whatever
  // they happen to be set to.
  assert.deepEqual(parseYaml(deep.text).tree.cards,
    { ...before, standoff: 2.2, depth: 3.9 },
    'the two film leaves moved and every look leaf beside them stayed');
  const half = applyChanges(deep.text, { 'cards.standoff': 0.9 });
  assert.deepEqual(half.problems.map((p) => p.path), ['cards.standoff']);
  assert.match(half.problems[0].message, /a card stands outboard of the rim/);
  assert.deepEqual(half.changes, [], 'nothing planned');
  assert.equal(half.text, deep.text, 'and nothing written');
  // The other half of the same claim: the pair that holds is still written.
  const ok = applyChanges(deep.text, { 'cards.standoff': 2.4 });
  assert.deepEqual(ok.problems, []);
  assert.equal(parseYaml(ok.text).tree.cards.standoff, 2.4);
  // What the refusal is FOR: the file the route would have written is a file
  // the next boot throws away whole, so the check has to be here.
  const wouldBe = parseYaml(patchYaml(deep.text, { 'cards.standoff': 0.9 })).tree;
  assert.equal(validate(wouldBe).length, 1, 'the file that post would have made is not a legal file');
});

// A preset row is a sparse subtree of the dial tree, so the file's own laws
// have to reach into it (the D4 review). Both judges, one sentence.
t('a preset row is judged by the same laws as the file it lives in', () => {
  assert.deepEqual(validate({ presets: { odd: { cards: { standoff: 0.5, depth: 3 } } } }).map((p) => p.message),
    ['presets.odd.cards.standoff + presets.odd.cards.depth: a card stands outboard of the rim: '
      + 'cards.standoff − cards.depth / 2 may not go below 0']);
  assert.deepEqual(validate({ presets: { odd: { cards: { standoff: 2.2, depth: 3.9 } } } }), [],
    'a pair that holds inside the row is a legal preset, whatever the table itself says');
  assert.deepEqual(validate({ presets: { odd: { pace: { tempo: { k: 0 } } } } }).map((p) => p.path),
    ['presets.odd.pace.tempo.k'], 'and the single-value laws reached it already');
  // A static leaf inside a preset row: a row nobody could ever apply.
  assert.deepEqual(validate({ presets: { odd: { app: { mode: 'production' } } } }).map((p) => p.message),
    ['presets.odd.app.mode: not a dial a patch may set: app.mode is set in dice.yaml or DICE_MODE']);
  assert.deepEqual(validateChanges({ 'presets.odd.app.mode': 'production' }).map((p) => p.path),
    ['presets.odd.app.mode']);
  assert.deepEqual(
    validateChanges({ 'presets.odd.cards.standoff': 0.5 }, { base: { presets: { odd: { cards: { depth: 3 } } } } })
      .map((p) => p.path),
    ['presets.odd.cards.standoff'], 'the route reads the row the checkout holds');
});

for (const d of trees) rmSync(d, { recursive: true, force: true });

if (process.exitCode) console.error(`dice-apply.test: FAILED`);
else console.log(`dice-apply.test: ${n} passed`);
