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

// tests/tune.test.mjs — the tunables registry (js/tune.js) and the
// declaration (dice.yaml) it mirrors. docs/DEVMODE.md §5, §6, §10.
//
// The load-bearing claims:
//   · the dial tree is well formed: every dial has a default of its own
//     type, no default is a boolean, every enum's default is one of its
//     options, and no dial path reaches the RNG, the values, the faces,
//     the seed or the clock (GOALPOST 2, the denylist);
//   · dice.yaml IS the full phase-1 declaration: no boolean scalar, every
//     leaf has a dial and equals its default, every dial is in the file
//     (the drift test, in both directions);
//   · createTune checks the declaration against the dials at birth: a
//     null is absent (the default stands), and a wrong type, an enum value
//     outside the options, a map at a dial or a scalar at a map, and a
//     key with a dot in it are DROPPED per path — the default stands, one
//     console line (or onRefuse) names it, tune.refusals keeps it — never
//     thrown, because a throw there blanks the table for one dead dial;
//   · `set` is the one writer and refuses exactly five ways — unknown,
//     film while locked, type, option, binder (the hook threw; every leaf
//     it covered is put back and the rest of the patch stands) — lands the
//     WHOLE patch in T before any binder runs, runs each binder exactly
//     once per call, and reports reload-class writes nobody bound as
//     pending;
//   · reset scopes, diff, changes, the YAML round trip against the real
//     file (patch nothing → identical bytes; patch two leaves → only those
//     lines differ), paste, and the alias view.
//
// The first block needs only js/tune.js; the second needs js/yaml.js and
// the checked-in dice.yaml.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DIALS, look, film, pick, isDial, defaultsOf, merge, leaves, getLeaf, setLeaf, hasLeaf,
  alias, FORBIDDEN_LEAF, STATIC_PATHS, createTune,
} from '../js/tune.js';
import { parseYaml } from '../js/yaml.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const YAML_PATH = join(ROOT, 'dice.yaml');

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.stack || e.message}`);
    process.exitCode = 1;
  }
};

const dotted = (p) => p.join('.');
const dialPaths = () => {
  const out = [];
  const walk = (node, prefix) => {
    for (const [k, v] of Object.entries(node)) {
      if (isDial(v)) out.push(prefix.concat(k));
      else walk(v, prefix.concat(k));
    }
  };
  walk(DIALS, []);
  return out;
};

// A small dial tree for the behavioural tests, so they do not move when a
// shipped default does.
const MINI = {
  app: { mode: pick('mode', 'development', ['development', 'production'], 'look', 'reload') },
  light: {
    lamp: {
      y: look('lamp height', 24, [5, 80, 0.5], 'apply'),
      color: look('lamp colour', '#ffe8c4', null, 'apply'),
    },
    fog: { far: look('fog far', 46, [10, 120, 1], 'apply') },
  },
  throw: {
    physics: { gravity: film('gravity', -110, [-300, -20, 1], 'apply') },
    spawn: { axis: pick('axis', 'clamp', ['width', 'own', 'clamp'], 'film', 'apply') },
  },
  pace: {
    ceremony: { declareS: look('declare dwell', 1.35, [0, 4, 0.05], 'reload') },
    clear: { sinkS: look('sink', 0.3, [0.05, 2, 0.05], 'reload') },
  },
};
const mini = (declared = {}, source = '') => createTune({ declared, dials: MINI, source });

// ===========================================================================
// Block 1 — js/tune.js alone
// ===========================================================================

t('dial constructors and isDial', () => {
  const l = look('a', 1, [0, 2, 0.1], 'apply', 'why');
  assert.deepEqual(l, { label: 'a', def: 1, range: [0, 2, 0.1], cls: 'look', read: 'apply', why: 'why' });
  const f = film('b', 'x', null, 'roll');
  assert.equal(f.cls, 'film'); assert.equal(f.range, null); assert.equal(f.why, '');
  const p = pick('c', 'enabled', ['enabled', 'disabled'], 'look', 'frame');
  assert.deepEqual(p.options, ['enabled', 'disabled']);
  assert.ok(isDial(l) && isDial(f) && isDial(p));
  assert.ok(!isDial({ label: 'x' }) && !isDial(null) && !isDial(3) && !isDial({ lamp: l }));
  assert.throws(() => look('a', 1, null, 'sometimes'), /read/);
  assert.throws(() => pick('a', 'x', ['x'], 'look', 'apply'), /two options/);
  assert.throws(() => pick('a', 'x', ['x', 'y'], 'neither', 'apply'), /cls/);
});

t('every dial has a def of its own type, never a boolean, in its options when an enum', () => {
  const paths = dialPaths();
  assert.ok(paths.length >= 120, `phase 1 declares ~130 leaves, got ${paths.length}`);
  for (const p of paths) {
    const d = getLeaf(DIALS, p);
    assert.notEqual(d.def, undefined, `${dotted(p)} has no def`);
    assert.notEqual(typeof d.def, 'boolean', `${dotted(p)} has a boolean def`);
    assert.ok(['number', 'string'].includes(typeof d.def), `${dotted(p)} def is ${typeof d.def}`);
    if (d.options) {
      assert.ok(d.options.includes(d.def), `${dotted(p)} def ${d.def} not in ${d.options}`);
      assert.equal(d.range, null, `${dotted(p)}: an enum has no range`);
      for (const o of d.options) assert.equal(typeof o, 'string', `${dotted(p)} option ${o}`);
    }
    if (d.range) {
      assert.equal(typeof d.def, 'number', `${dotted(p)} ranged but not a number`);
      const [lo, hi, step] = d.range;
      assert.ok(lo < hi && step > 0, `${dotted(p)} range ${d.range}`);
      assert.ok(d.def >= lo && d.def <= hi, `${dotted(p)} def ${d.def} outside ${d.range}`);
    }
    if (typeof d.def === 'string' && d.def.startsWith('#')) assert.match(d.def, /^#[0-9a-f]{6}$/, `${dotted(p)} colour`);
    assert.ok(d.label.length > 0, `${dotted(p)} label`);
  }
});

t('no dial path matches FORBIDDEN_LEAF, and the regex bites what it should', () => {
  for (const p of dialPaths()) assert.ok(!FORBIDDEN_LEAF.test(dotted(p)), `${dotted(p)} is forbidden`);
  for (const bad of ['throw.rng', 'throw.seed', 'dice.values', 'roll.face', 'faces', 'clock.fixedDt', 'a.value.b']) {
    assert.ok(FORBIDDEN_LEAF.test(bad), `${bad} should be forbidden`);
  }
  for (const ok of ['light.lamp.y', 'throw.spawn.axis', 'surface.friction', 'seeded.x']) {
    assert.ok(!FORBIDDEN_LEAF.test(ok), `${ok} should be allowed`);
  }
});

t('the shipped tree has the phase-1 shape and every two-state value is an enabled|disabled enum', () => {
  const d = defaultsOf(DIALS);
  assert.deepEqual(Object.keys(d), ['app', 'table', 'light', 'camera', 'throw', 'pace', 'sound']);
  assert.equal(d.app.mode, 'development');
  assert.equal(d.table.scale, 2.5);
  assert.equal(d.light.lamp.y, 24);
  assert.equal(d.light.lamp.color, '#ffe8c4');
  assert.equal(d.light.motes.state, 'enabled');
  assert.equal(d.light.breath.state, 'enabled');
  assert.equal(d.throw.aim.state, 'enabled');
  assert.equal(d.throw.aim.corner, 'enabled', 'places.js reads corner as a flag: an enum, not a 0|1 number');
  assert.equal(d.throw.aim.own, 'enabled', 'places.js reads own as a flag: an enum, not a 0|1 number');
  assert.deepEqual(DIALS.throw.aim.corner.options, ['enabled', 'disabled']);
  assert.deepEqual(DIALS.throw.aim.own.options, ['enabled', 'disabled']);
  assert.equal(d.camera.framing.prefer, 'dice');
  assert.equal(d.throw.physics.gravity, -110);
  assert.equal(d.throw.physics.floor.friction, 0.6);
  assert.equal(d.throw.spawn.axis, 'clamp');
  assert.equal(d.throw.settle.mode, 'displacement');
  assert.equal(d.throw.target, 0.4);
  assert.equal(d.sound.click.mode, 'film');
  assert.deepEqual(DIALS.throw.spawn.axis.options, ['width', 'own', 'clamp']);
  assert.deepEqual(DIALS.throw.settle.mode.options, ['velocity', 'displacement']);
  assert.deepEqual(DIALS.sound.click.mode.options, ['film', 'wall']);
  // no leaf in the tree is undefined or an object masquerading as a dial
  for (const p of leaves(d)) assert.ok(['number', 'string'].includes(typeof getLeaf(d, p)), dotted(p));
});

t('merge is deep, over wins, arrays replace, inputs untouched', () => {
  const base = { a: { b: 1, c: [1, 2] }, d: 'x' };
  const over = { a: { c: [3] }, e: null };
  const m = merge(base, over);
  assert.deepEqual(m, { a: { b: 1, c: [3] }, d: 'x', e: null });
  assert.deepEqual(base, { a: { b: 1, c: [1, 2] }, d: 'x' });
  m.a.b = 9; assert.equal(base.a.b, 1);
  assert.deepEqual(merge({ a: { b: 1 } }, { a: 2 }), { a: 2 });
  assert.deepEqual(merge({ a: 2 }, { a: { b: 1 } }), { a: { b: 1 } });
  assert.deepEqual(merge(undefined, { a: 1 }), { a: 1 });
});

t('leaves / getLeaf / setLeaf / hasLeaf, with dotted and array paths', () => {
  const tree = { a: { b: 1, c: { d: 'x' } }, e: [1, 2] };
  assert.deepEqual(leaves(tree), [['a', 'b'], ['a', 'c', 'd'], ['e']]);
  assert.equal(getLeaf(tree, 'a.c.d'), 'x');
  assert.equal(getLeaf(tree, ['a', 'c', 'd']), 'x');
  assert.deepEqual(getLeaf(tree, 'a.c'), { d: 'x' });
  assert.equal(getLeaf(tree, 'a.zz'), undefined);
  assert.equal(getLeaf(tree, 'a.b.c'), undefined);
  assert.ok(hasLeaf(tree, 'a.b') && hasLeaf(tree, 'e'));
  assert.ok(!hasLeaf(tree, 'a') && !hasLeaf(tree, 'a.c') && !hasLeaf(tree, 'zz') && !hasLeaf(tree, ''));
  setLeaf(tree, 'a.c.d', 'y'); assert.equal(tree.a.c.d, 'y');
  setLeaf(tree, 'a.n.m', 5); assert.equal(tree.a.n.m, 5);
  assert.throws(() => setLeaf(tree, 'a.b.q', 1), /scalar/);
  assert.throws(() => setLeaf(tree, [], 1), /empty/);
});

t('alias reads and writes through, and Object.assign works on the view', () => {
  const tree = { light: { lamp: { y: 24, color: '#fff' } }, fog: { far: 46 } };
  const view = alias(tree, { lampY: 'light.lamp.y', lampColor: 'light.lamp.color', fogFar: ['fog', 'far'] });
  assert.equal(view.lampY, 24);
  view.lampY = 30; assert.equal(tree.light.lamp.y, 30);
  tree.fog.far = 60; assert.equal(view.fogFar, 60);
  Object.assign(view, { lampColor: '#000', fogFar: 70 });
  assert.equal(tree.light.lamp.color, '#000'); assert.equal(tree.fog.far, 70);
  assert.deepEqual({ ...view }, { lampY: 30, lampColor: '#000', fogFar: 70 });
  assert.deepEqual(Object.keys(view), ['lampY', 'lampColor', 'fogFar']);
});

t('createTune: SHIPPED is defaults ⊕ declared and frozen; T is a live clone', () => {
  const tune = mini({ light: { lamp: { y: 30 } }, extra: { note: 'file-only' } });
  assert.equal(tune.SHIPPED.light.lamp.y, 30);
  assert.equal(tune.SHIPPED.light.lamp.color, '#ffe8c4');
  assert.equal(tune.SHIPPED.extra.note, 'file-only', 'a leaf with no dial is a typed value');
  assert.ok(Object.isFrozen(tune.SHIPPED) && Object.isFrozen(tune.SHIPPED.light.lamp));
  assert.ok(!Object.isFrozen(tune.T) && !Object.isFrozen(tune.T.light.lamp));
  assert.deepEqual(tune.T, tune.SHIPPED);
  assert.notEqual(tune.T, tune.SHIPPED);
  assert.deepEqual(tune.sections(), ['app', 'light', 'throw', 'pace', 'extra']);
  assert.equal(tune.get('light.lamp.y'), 30);
  assert.equal(tune.get(['light', 'fog', 'far']), 46);
  assert.equal(tune.dialAt('light.lamp.y').label, 'lamp height');
  assert.equal(tune.dialAt('light.lamp'), null);
  assert.equal(tune.dialAt('extra.note'), null);
  assert.equal(tune.dialAt('nope'), null);
});

t('createTune refuses a boolean in the declaration or a boolean default', () => {
  assert.throws(() => mini({ light: { lamp: { y: true } } }), /boolean at light\.lamp\.y/);
  assert.throws(() => createTune({ declared: {}, dials: { a: { label: 'a', def: false, range: null, cls: 'look', read: 'apply', why: '' } } }), /boolean/);
  assert.throws(() => createTune({ declared: {}, dials: { a: pick('a', 'z', ['x', 'y'], 'look', 'apply') } }), /options/);
  assert.throws(() => createTune({ declared: 'nope', dials: MINI }), /plain object/);
  assert.doesNotThrow(() => createTune({ declared: undefined, dials: MINI }));
});

t('createTune checks the declaration against the dials: null is absent, a wrong type/option/shape is dropped with the path and the default stands', () => {
  // `y:` with nothing after it parses to null: the line is there, the value is not — the default stands
  let tune = mini({ light: { lamp: { y: null } } });
  assert.equal(tune.SHIPPED.light.lamp.y, 24);
  assert.deepEqual(tune.refusals, [], 'a null is absent, not a refusal');
  assert.deepEqual(tune.set({ 'light.lamp.y': 30 }).refused, [], 'the dial is alive');
  assert.equal(tune.T.light.lamp.y, 30);
  assert.deepEqual(tune.diff().map((d) => d.declared), [false], 'a null line does not declare a value');
  // an empty map line (`fog:`) is absent too
  tune = mini({ light: { fog: null }, throw: null });
  assert.equal(tune.SHIPPED.light.fog.far, 46); assert.equal(tune.SHIPPED.throw.physics.gravity, -110);
  assert.deepEqual(tune.set({ 'light.fog.far': 50, 'throw.physics.gravity': -90 }).refused, []);
  // a null at a leaf with no dial is a typed value, kept as it is
  tune = mini({ extra: { note: null } });
  assert.equal(tune.SHIPPED.extra.note, null);

  // A bad value is DROPPED, never thrown: createTune runs during main.js
  // module evaluation, and the server keeps last-good only for parse
  // errors, so a throw here would blank the 8123 table for one dead dial.
  // The default stands, the dial is alive, the refusal names the path.
  const dropped = (declared) => {
    const seen = [];
    const t = createTune({ declared, dials: MINI, onRefuse: (r) => seen.push(r) });
    assert.deepEqual(seen, tune_refusals(t), 'onRefuse saw exactly what tune.refusals keeps');
    return t;
  };
  const tune_refusals = (t) => t.refusals.map((r) => ({ ...r }));
  const one = (declared, path, reason, re) => {
    const t = dropped(declared);
    assert.equal(t.refusals.length, 1, `${path}: one refusal, got ${JSON.stringify(t.refusals)}`);
    assert.equal(t.refusals[0].path, path); assert.equal(t.refusals[0].reason, reason);
    assert.match(t.refusals[0].message, re);
    assert.ok(Object.isFrozen(t.refusals) && Object.isFrozen(t.refusals[0]));
    return t;
  };
  // wrong type: what a quoted number in the file parses to
  let t = one({ light: { lamp: { y: '24' } } }, 'light.lamp.y', 'type', /^light\.lamp\.y: expected number, got "24"; the default stands$/);
  assert.equal(t.SHIPPED.light.lamp.y, 24, 'the default stands');
  assert.deepEqual(t.set({ 'light.lamp.y': 30 }).refused, [], 'and the dial is alive, not born dead');
  assert.equal(t.T.light.lamp.y, 30);
  assert.deepEqual(t.diff().map((d) => d.declared), [false], 'a dropped line does not declare a value');
  t = one({ light: { lamp: { color: 24 } } }, 'light.lamp.color', 'type', /light\.lamp\.color: expected string, got 24/);
  assert.equal(t.SHIPPED.light.lamp.color, '#ffe8c4');
  t = one({ light: { lamp: { y: [24] } } }, 'light.lamp.y', 'type', /light\.lamp\.y: expected number, got \[24\]/);
  // an enum value outside the options
  t = one({ app: { mode: 'staging' } }, 'app.mode', 'option', /app\.mode: expected one of development\|production, got "staging"/);
  assert.equal(t.SHIPPED.app.mode, 'development');
  t = one({ throw: { spawn: { axis: 'sideways' } } }, 'throw.spawn.axis', 'option', /throw\.spawn\.axis: expected one of/);
  // a map where the tree has a dial; a scalar where it has a map (its whole subtree keeps the defaults)
  t = one({ throw: { physics: { gravity: { x: 1 } } } }, 'throw.physics.gravity', 'shape', /throw\.physics\.gravity: expected number, got a map/);
  assert.equal(t.SHIPPED.throw.physics.gravity, -110);
  t = one({ light: { lamp: 5 } }, 'light.lamp', 'shape', /light\.lamp: expected a map, got 5/);
  assert.deepEqual(t.SHIPPED.light.lamp, { y: 24, color: '#ffe8c4' });
  t = one({ light: 'dim' }, 'light', 'shape', /light: expected a map, got "dim"/);
  assert.equal(t.SHIPPED.light.fog.far, 46);
  // a key with a dot in it is dropped until phase 3
  t = one({ sets: { 'house.ember': { label: 'Ember' } } }, 'sets.house.ember', 'key', /key "house\.ember" under sets contains a dot/);
  assert.deepEqual(t.SHIPPED.sets, {});
  t = one({ 'a.b': 1 }, 'a.b', 'key', /key "a\.b" under the root contains a dot/);
  assert.ok(!('a.b' in t.SHIPPED));
  // several drops in one file: every one is listed, in file order, and the good leaves beside them still land
  t = dropped({ light: { lamp: { y: '24', color: '#000000' }, fog: { far: 'far' } }, app: { mode: 'staging' } });
  assert.deepEqual(t.refusals.map((r) => [r.path, r.reason]), [['light.lamp.y', 'type'], ['light.fog.far', 'type'], ['app.mode', 'option']]);
  assert.equal(t.SHIPPED.light.lamp.color, '#000000');
  assert.deepEqual(t.diff(), []);
  // without onRefuse, each drop is one console.warn line naming the path
  const warned = [];
  const quiet = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  try {
    t = mini({ light: { lamp: { y: '24' } }, app: { mode: 'staging' } });
    assert.equal(t.refusals.length, 2);
  } finally { console.warn = quiet; }
  assert.equal(warned.length, 2);
  assert.match(warned[0], /^tune: declared light\.lamp\.y: expected number, got "24"/);
  assert.match(warned[1], /^tune: declared app\.mode: expected one of/);
  assert.throws(() => createTune({ declared: {}, dials: MINI, onRefuse: 'log' }), /onRefuse/);
  // the good cases still stand: a value of the right type, and a leaf with no dial of any shape
  t = dropped({ light: { lamp: { y: 30, color: '#000000', extra: { deep: 'x' } } }, app: { mode: 'production' } });
  assert.deepEqual(t.refusals, []);
  assert.equal(t.SHIPPED.light.lamp.extra.deep, 'x');
  // an empty line in the file is patched in place on export, comment intact
  const src = 'light:\n  lamp:\n    y:      # left empty\n';
  const t3 = mini(parseYaml(src).tree, src);
  assert.equal(t3.SHIPPED.light.lamp.y, 24);
  assert.equal(t3.exportYaml(), src);
  t3.set({ 'light.lamp.y': 30 });
  assert.equal(t3.exportYaml(), 'light:\n  lamp:\n    y: 30      # left empty\n');
  // the real dial tree, with a live edit of the kind the server would serve: the table still stands
  const live = createTune({ declared: { light: { lamp: { y: '24' } }, app: { mode: 'staging' } }, onRefuse: () => {} });
  assert.deepEqual(live.refusals.map((r) => r.path), ['light.lamp.y', 'app.mode']);
  assert.equal(live.SHIPPED.light.lamp.y, 24); assert.equal(live.SHIPPED.app.mode, 'development');
  assert.deepEqual(live.SHIPPED, defaultsOf(DIALS));
  assert.equal(createTune({ declared: { light: { lamp: { y: null } } } }).SHIPPED.light.lamp.y, 24);
});

t('a dial-less leaf the file left empty (null) takes any scalar, and exports in place', () => {
  const src = 'extra:\n  note:        # nothing yet\n  n0:\n';
  const tune = mini(parseYaml(src).tree, src);
  assert.equal(tune.SHIPPED.extra.note, null); assert.equal(tune.SHIPPED.extra.n0, null);
  let r = tune.set({ 'extra.note': 'x', 'extra.n0': 3 });
  assert.deepEqual(r.refused, [], 'a null-typed leaf is not a dead leaf');
  assert.equal(tune.T.extra.note, 'x'); assert.equal(tune.T.extra.n0, 3);
  assert.deepEqual(tune.changes(), { 'extra.note': 'x', 'extra.n0': 3 });
  assert.equal(tune.exportYaml(), 'extra:\n  note: x        # nothing yet\n  n0: 3\n');
  r = tune.set({ 'extra.note': null });
  assert.deepEqual(r.refused, []); assert.equal(tune.T.extra.note, null);
  assert.deepEqual(tune.changes(), { 'extra.n0': 3 }, 'back to null is back to shipped');
  r = tune.set({ 'extra.note': { deep: 1 }, 'extra.n0': [1] });
  assert.deepEqual(r.refused, [['extra.note', 'type'], ['extra.n0', 'type']], 'a scalar, not a map or a list');
  assert.deepEqual(tune.set({ 'extra.note': NaN }).refused, [['extra.note', 'type']], 'nor NaN');
  // a leaf that HAS a type keeps it: null is not a value for a number or a string
  assert.deepEqual(tune.set({ 'light.lamp.y': null }).refused, [['light.lamp.y', 'type']]);
  const t2 = mini({ extra: { note: 'a' } });
  assert.deepEqual(t2.set({ 'extra.note': null }).refused, [['extra.note', 'type']], 'typed at birth, typed for life');
});

t('set: the four refusals, and an accepted write lands in T', () => {
  const tune = mini();
  let r = tune.set({ 'light.lamp.y': 30 });
  assert.deepEqual(r.refused, []); assert.equal(tune.T.light.lamp.y, 30);
  assert.deepEqual(r.diff.map((d) => d.path), ['light.lamp.y']);

  r = tune.set({ 'light.lamp.nope': 1, 'light.lamp': 2, 'zz': 3 });
  assert.deepEqual(r.refused, [['light.lamp.nope', 'unknown'], ['light.lamp', 'unknown'], ['zz', 'unknown']]);

  r = tune.set({ 'throw.physics.gravity': -200, 'light.fog.far': 60 }, { filmLocked: true });
  assert.deepEqual(r.refused, [['throw.physics.gravity', 'film']]);
  assert.equal(tune.T.throw.physics.gravity, -110, 'refused: untouched');
  assert.equal(tune.T.light.fog.far, 60, 'a look dial takes while the film is locked');

  // app.mode is static (STATIC_PATHS): refused as such BEFORE type or option
  // is looked at, so a null or a stray word there says 'static', never 'type'.
  r = tune.set({ 'light.lamp.y': '30', 'light.lamp.color': 5, 'app.mode': null });
  assert.deepEqual(r.refused, [['light.lamp.y', 'type'], ['light.lamp.color', 'type'], ['app.mode', 'static']]);
  assert.equal(tune.T.light.lamp.y, 30);
  r = tune.set({ 'light.fog.far': NaN });
  assert.deepEqual(r.refused, [['light.fog.far', 'type']], 'NaN is not a number here');
  r = tune.set({ 'light.fog.far': Infinity });
  assert.deepEqual(r.refused, [['light.fog.far', 'type']], 'nor is Infinity');
  assert.equal(tune.T.light.fog.far, 60);

  r = tune.set({ 'throw.spawn.axis': 'sideways', 'app.mode': 'staging' });
  assert.deepEqual(r.refused, [['throw.spawn.axis', 'option'], ['app.mode', 'static']]);
  r = tune.set({ 'throw.spawn.axis': 'own' });
  assert.deepEqual(r.refused, []); assert.equal(tune.T.throw.spawn.axis, 'own');
});

t('set: the static leaves are refused at the writer — app.mode never moves from a running tab (DEVMODE §4)', () => {
  assert.deepEqual(STATIC_PATHS, ['app.mode']);
  assert.ok(Object.isFrozen(STATIC_PATHS));
  const tune = mini({}, readFileSync(YAML_PATH, 'utf8'));
  // A lawful-looking value: in the options, the right type, and still refused.
  let r = tune.set({ 'app.mode': 'production', 'light.lamp.y': 30 });
  assert.deepEqual(r.refused, [['app.mode', 'static']]);
  assert.equal(tune.T.app.mode, 'development', 'T unchanged');
  assert.equal(tune.T.light.lamp.y, 30, 'the rest of the patch still lands');
  assert.deepEqual(r.diff.map((d) => d.path), ['light.lamp.y'], 'and the diff never names it');
  assert.deepEqual(r.pending, [], 'a refused reload-class leaf is not pending either');
  // Neither door around set: the paste fragment and a Map patch.
  r = tune.applyPatchText('app:\n  mode: production\n');
  assert.deepEqual(r.refused, [['app.mode', 'static']]);
  assert.equal(tune.T.app.mode, 'development');
  r = tune.set(new Map([[['app', 'mode'], 'production']]));
  assert.deepEqual(r.refused, [['app.mode', 'static']]);
  // So neither export can carry it: the download is the file's own line and
  // the copy-patch fragment is only the lamp.
  assert.doesNotMatch(tune.exportYaml(), /mode: production/);
  assert.equal(tune.patchText(), 'light:\n  lamp:\n    y: 30\n');
  // Even a reset cannot write it (it runs through the same apply): a value
  // that reached T some other way stays, and is named as static.
  tune.T.app.mode = 'production';
  r = tune.reset('all');
  assert.deepEqual(r.refused, [['app.mode', 'static']]);
  assert.equal(tune.T.app.mode, 'production', 'reset does not touch a static leaf either way');
  assert.equal(tune.T.light.lamp.y, 24, 'while the lamp went back');

  // Map patches, array keys, and a leaf with no dial
  const t2 = mini({ extra: { note: 'a' } });
  r = t2.set(new Map([[['light', 'lamp', 'y'], 12], ['extra.note', 'b']]));
  assert.deepEqual(r.refused, []); assert.equal(t2.T.light.lamp.y, 12); assert.equal(t2.T.extra.note, 'b');
  r = t2.set({ 'extra.note': 3 });
  assert.deepEqual(r.refused, [['extra.note', 'type']], 'type is the law even with no dial');
  assert.throws(() => t2.set('light.lamp.y'), /patch/);
});

t('binders: exact beats prefix beats wildcard; each runs once per call; T is written before it runs', () => {
  const tune = mini();
  const calls = [];
  const all = (p, v) => calls.push(['*', p, v, tune.T.light.lamp.y]);
  const light = (p, v) => calls.push(['light.*', p, v]);
  const lamp = (p, v) => calls.push(['light.lamp.*', p, v]);
  const y = (p, v) => calls.push(['light.lamp.y', p, v]);
  tune.bind('*', all); tune.bind('light.*', light); tune.bind('light.lamp.*', lamp); tune.bind('light.lamp.y', y);
  assert.equal(tune.binderFor('light.lamp.y'), y);
  assert.equal(tune.binderFor('light.lamp.color'), lamp);
  assert.equal(tune.binderFor(['light', 'fog', 'far']), light);
  assert.equal(tune.binderFor('throw.physics.gravity'), all);
  assert.equal(tune.binderFor('light'), all, 'a map path falls through to the wildcard');

  const r = tune.set({ 'light.lamp.y': 30, 'light.lamp.color': '#000', 'light.fog.far': 50, 'throw.physics.gravity': -90, 'throw.spawn.axis': 'own' });
  assert.deepEqual(r.refused, []);
  assert.deepEqual(calls, [
    ['light.lamp.y', 'light.lamp.y', 30],
    ['light.lamp.*', 'light.lamp.color', '#000'],
    ['light.*', 'light.fog.far', 50],
    ['*', 'throw.physics.gravity', -90, 30],
  ], 'the wildcard ran once for two writes, and saw T already written');
  assert.deepEqual(r.pending, []);

  const t2 = mini();
  let hits = 0;
  t2.bind('light.*', () => hits++);
  t2.set({ 'light.lamp.y': 1, 'light.lamp.color': '#111', 'light.fog.far': 20 });
  assert.equal(hits, 1);
  t2.set({ 'light.lamp.y': 2 });
  assert.equal(hits, 2, 'once per call, not once ever');
  assert.equal(t2.binderFor('throw.physics.gravity'), null);
  assert.throws(() => t2.bind('', () => {}), /pattern/);
  assert.throws(() => t2.bind('a.*', 'nope'), /function/);
});

t('a binder that throws refuses every leaf it covered and the rest of the patch still stands', () => {
  const tune = mini();
  const quiet = console.error; console.error = () => {};
  try {
    let n = 0;
    tune.bind('light.lamp.y', () => { n++; throw new Error('the venue owns the lights'); });
    const seen = [];
    tune.bind('throw.*', (p) => seen.push(p));
    let r;
    assert.doesNotThrow(() => { r = tune.set({ 'light.lamp.y': 1, 'throw.physics.gravity': -50, 'light.fog.far': 70 }); });
    assert.deepEqual(r.refused, [['light.lamp.y', 'binder']]);
    assert.equal(tune.T.light.lamp.y, 24, 'the refused value is put back');
    assert.equal(tune.T.throw.physics.gravity, -50, 'later leaves in the patch still land');
    assert.equal(tune.T.light.fog.far, 70);
    assert.deepEqual(seen, ['throw.physics.gravity'], 'the other binder still ran');
    assert.deepEqual(r.diff.map((d) => d.path), ['light.fog.far', 'throw.physics.gravity']);
    assert.deepEqual(r.pending, []);
    // a wildcard binder that throws runs once and takes every leaf it covered back with it —
    // the binder is a re-apply over T, so the leaves it read cannot be left half-shown
    const t2 = mini();
    let calls = 0;
    t2.bind('*', () => { calls++; throw new Error('no'); });
    r = t2.set(new Map([[['light', 'lamp', 'y'], 1], [['light', 'fog', 'far'], 70], [['light', 'lamp', 'y'], 2]]));
    assert.deepEqual(r.refused, [['light.lamp.y', 'binder'], ['light.fog.far', 'binder']]);
    assert.equal(calls, 1);
    assert.equal(t2.T.light.lamp.y, 24, 'put back to the value before the patch, not to the first write in it');
    assert.equal(t2.T.light.fog.far, 46);
    assert.deepEqual(r.diff, []);
    // reset goes through the same writer, so a throwing binder cannot make reset throw either
    assert.doesNotThrow(() => t2.reset());
    assert.equal(n, 1);
  } finally { console.error = quiet; }
});

t('binders run after the whole patch is in T: a re-apply that reads T sees every leaf of a set, a paste and a reset', () => {
  const tune = mini();
  const snaps = [];
  const snap = () => ({ y: tune.T.light.lamp.y, color: tune.T.light.lamp.color, far: tune.T.light.fog.far });
  tune.bind('light.*', () => snaps.push(snap()));            // the DEVMODE §5 shape: bindDial('light.*', () => applyMoodLights())
  tune.set({ 'light.lamp.y': 30, 'light.lamp.color': '#000000', 'light.fog.far': 60 });
  assert.deepEqual(snaps, [{ y: 30, color: '#000000', far: 60 }], 'one run, after the last leaf landed');
  assert.deepEqual(snaps[0], snap(), 'what the binder saw is what T holds');
  tune.applyPatchText('light:\n  lamp: { y: 31, color: "#111111" }\n  fog: { far: 61 }\n');
  assert.deepEqual(snaps[1], { y: 31, color: '#111111', far: 61 });
  tune.reset('light');
  assert.deepEqual(snaps[2], { y: 24, color: '#ffe8c4', far: 46 }, 'a section Reset is one whole-section run');
  tune.set({ 'light.lamp.y': 5, 'light.fog.far': 9 });
  tune.reset();
  assert.deepEqual(snaps[4], { y: 24, color: '#ffe8c4', far: 46 }, 'Reset all too');
  assert.equal(snaps.length, 5);
  // the (path, value, covered) shape: first covered leaf first, then every covered [path, value] in patch order
  const args = [];
  tune.bind('light.lamp.*', (...a) => args.push(a));
  tune.set({ 'light.fog.far': 50, 'light.lamp.color': '#222222', 'throw.physics.gravity': -90, 'light.lamp.y': 12 });
  assert.deepEqual(args, [['light.lamp.color', '#222222', [['light.lamp.color', '#222222'], ['light.lamp.y', 12]]]]);
  assert.deepEqual(snaps[5], { y: 12, color: '#222222', far: 50 }, 'the light.* binder ran for fog.far after lamp.y landed too');
  // a refused leaf in the same patch is neither in T nor in covered
  args.length = 0;
  const r = tune.set({ 'light.lamp.y': 'tall', 'light.lamp.color': '#333333' });
  assert.deepEqual(r.refused, [['light.lamp.y', 'type']]);
  assert.deepEqual(args, [['light.lamp.color', '#333333', [['light.lamp.color', '#333333']]]]);
  // an exact binder and a wildcard binder each see the whole patch, in first-coverage order
  const t2 = mini();
  const order = [];
  t2.bind('light.lamp.y', () => order.push(['y', t2.T.light.fog.far]));
  t2.bind('*', () => order.push(['*', t2.T.light.lamp.y]));
  t2.set({ 'light.lamp.y': 1, 'light.fog.far': 2 });
  assert.deepEqual(order, [['y', 2], ['*', 1]]);
});

t('pending: reload-class writes nobody bound, only when the value moved', () => {
  const tune = mini();
  // app.mode is reload-class too, but static (STATIC_PATHS): refused before
  // it could ever be pending — until 2026-09-02 this line expected it here.
  let r = tune.set({ 'pace.ceremony.declareS': 2, 'pace.clear.sinkS': 0.3, 'light.lamp.y': 30, 'app.mode': 'production' });
  assert.deepEqual(r.pending, ['pace.ceremony.declareS'], 'sinkS did not move; lamp.y is apply-class; app.mode is static');
  assert.deepEqual(r.refused, [['app.mode', 'static']]);
  tune.bind('pace.clear.*', () => {});
  r = tune.set({ 'pace.clear.sinkS': 1 });
  assert.deepEqual(r.pending, [], 'a binder covers it now');
  r = tune.set({ 'pace.ceremony.declareS': 2 });
  assert.deepEqual(r.pending, [], 'same value again is not a change');
  r = tune.set({ 'pace.ceremony.declareS': 1.35 });
  assert.deepEqual(r.pending, ['pace.ceremony.declareS'], 'moving back to shipped is still a move the running tab has not seen');
});

t('diff and changes: only leaves that differ, with class, read and declared', () => {
  const tune = mini({ light: { lamp: { y: 30 } }, extra: { note: 'a' } });
  assert.deepEqual(tune.diff(), []);
  assert.deepEqual(tune.changes(), {});
  tune.set({ 'light.lamp.y': 31, 'throw.physics.gravity': -50, 'extra.note': 'b', 'light.fog.far': 46 });
  assert.deepEqual(tune.diff(), [
    { path: 'light.lamp.y', shipped: 30, live: 31, cls: 'look', read: 'apply', declared: true },
    { path: 'throw.physics.gravity', shipped: -110, live: -50, cls: 'film', read: 'apply', declared: false },
    { path: 'extra.note', shipped: 'a', live: 'b', cls: null, read: null, declared: true },
  ]);
  assert.deepEqual(tune.changes(), { 'light.lamp.y': 31, 'throw.physics.gravity': -50, 'extra.note': 'b' });
  tune.set({ 'light.lamp.y': 30 });
  assert.deepEqual(tune.changes(), { 'throw.physics.gravity': -50, 'extra.note': 'b' }, 'back to shipped drops out');
});

t('reset: all, a section, a path, a subtree, an unknown scope; ignores the film lock', () => {
  const tune = mini();
  const hits = [];
  tune.bind('*', (p) => hits.push(p));
  const dirty = () => tune.set({ 'light.lamp.y': 1, 'light.lamp.color': '#000', 'light.fog.far': 1, 'throw.physics.gravity': -1, 'throw.spawn.axis': 'own', 'pace.ceremony.declareS': 3 });

  dirty(); hits.length = 0;
  let r = tune.reset('light.lamp.y');
  assert.deepEqual(r.refused, []); assert.equal(tune.T.light.lamp.y, 24);
  assert.deepEqual(r.diff.map((d) => d.path), ['light.lamp.color', 'light.fog.far', 'throw.physics.gravity', 'throw.spawn.axis', 'pace.ceremony.declareS']);
  assert.deepEqual(hits, ['light.lamp.y'], 'the binder saw the reset');

  r = tune.reset('light.lamp');
  assert.equal(tune.T.light.lamp.color, '#ffe8c4'); assert.equal(tune.T.light.fog.far, 1);

  r = tune.reset('light');
  assert.equal(tune.T.light.fog.far, 46);
  assert.deepEqual(r.diff.map((d) => d.path), ['throw.physics.gravity', 'throw.spawn.axis', 'pace.ceremony.declareS']);

  hits.length = 0;
  r = tune.reset('throw');
  assert.equal(tune.T.throw.physics.gravity, -110); assert.equal(tune.T.throw.spawn.axis, 'clamp');
  assert.deepEqual(hits, ['throw.physics.gravity'], 'once per call');

  r = tune.reset();
  assert.deepEqual(r.diff, []); assert.deepEqual(tune.T, tune.SHIPPED);

  dirty();
  r = tune.reset('all');
  assert.deepEqual(tune.T, tune.SHIPPED);
  assert.deepEqual(r.pending, [], 'the wildcard binder covers the reload leaf');

  r = tune.reset('nowhere.at.all');
  assert.deepEqual(r.refused, [['nowhere.at.all', 'unknown']]);

  const t2 = mini();
  t2.set({ 'pace.ceremony.declareS': 3 });
  assert.deepEqual(t2.reset().pending, ['pace.ceremony.declareS'], 'an unbound reload leaf is pending on reset too');
  assert.equal(t2.T, t2.T, 'T is never replaced');
});

t('T is the same object for the life of the tune (consumers hold it)', () => {
  const tune = mini();
  const T = tune.T, lamp = tune.T.light.lamp;
  tune.set({ 'light.lamp.y': 5 }); tune.reset();
  assert.equal(tune.T, T); assert.equal(tune.T.light.lamp, lamp);
  const view = alias(tune.T, { lampY: 'light.lamp.y' });
  tune.set({ 'light.lamp.y': 7 });
  assert.equal(view.lampY, 7, 'an alias sees set()');
  view.lampY = 8;
  assert.equal(tune.get('light.lamp.y'), 8, 'and set() sees an alias write');
  assert.deepEqual(tune.changes(), { 'light.lamp.y': 8 });
});

t('exportYaml without a source throws', () => {
  assert.throws(() => mini().exportYaml(), /source/);
});

// ===========================================================================
// Block 2 — js/yaml.js and the checked-in dice.yaml
// ===========================================================================

const text = readFileSync(YAML_PATH, 'utf8');

t('dice.yaml has no boolean scalar, quoted or not, and parses', () => {
  for (const [i, line] of text.split('\n').entries()) {
    const body = line.replace(/\s#.*$/, '').replace(/^\s*#.*$/, '');
    assert.ok(!/:\s*(true|false|yes|no|on|off)\s*$/i.test(body), `dice.yaml:${i + 1}: a bare boolean word`);
  }
  const { tree } = parseYaml(text);
  assert.ok(tree && typeof tree === 'object');
  for (const p of leaves(tree)) assert.notEqual(typeof getLeaf(tree, p), 'boolean', dotted(p));
});

t('dice.yaml is the full declaration: every leaf has a dial and equals its default, and every dial is in the file', () => {
  const { tree } = parseYaml(text);
  const fileLeaves = leaves(tree).map(dotted);
  const dials = dialPaths().map(dotted);
  for (const p of fileLeaves) {
    const d = getLeaf(DIALS, p);
    assert.ok(isDial(d), `dice.yaml names ${p} but js/tune.js has no dial for it`);
    assert.deepEqual(getLeaf(tree, p), d.def, `${p}: file says ${JSON.stringify(getLeaf(tree, p))}, dial default is ${JSON.stringify(d.def)}`);
    if (d.options) assert.ok(d.options.includes(getLeaf(tree, p)), `${p} outside its options`);
  }
  for (const p of dials) assert.ok(fileLeaves.includes(p), `dial ${p} is not in dice.yaml`);
  assert.deepEqual(fileLeaves, dials, 'and in the same order (the panel is the file, drawn)');
  assert.equal(tree.app.mode, 'development');
  assert.deepEqual(Object.keys(tree), ['app', 'table', 'light', 'camera', 'throw', 'pace', 'sound']);
});

t('createTune over the real file: SHIPPED equals the defaults, nothing differs', () => {
  const { tree } = parseYaml(text);
  const tune = createTune({ declared: tree, source: text });
  assert.deepEqual(tune.SHIPPED, defaultsOf(DIALS));
  assert.deepEqual(tune.diff(), []);
  assert.deepEqual(tune.sections(), Object.keys(DIALS));
  for (const p of leaves(tune.SHIPPED)) assert.ok(!FORBIDDEN_LEAF.test(dotted(p)), dotted(p));
});

t('exportYaml round trip: patch nothing → identical bytes; two leaves → only those lines differ', () => {
  const { tree } = parseYaml(text);
  const tune = createTune({ declared: tree, source: text });
  assert.equal(tune.exportYaml(), text);

  tune.set({ 'light.lamp.y': 30, 'throw.physics.floor.friction': 0.7, 'throw.spawn.axis': 'own' });
  tune.set({ 'throw.spawn.axis': 'clamp' });                 // back to shipped: not a change
  const out = tune.exportYaml();
  const a = text.split('\n'), b = out.split('\n');
  assert.equal(a.length, b.length, 'no line added or removed');
  const moved = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) moved.push([i + 1, a[i], b[i]]);
  assert.equal(moved.length, 2, `exactly two lines differ, got ${JSON.stringify(moved)}`);
  const [lampLine, floorLine] = moved;
  assert.match(lampLine[1], /^\s+y: 24\s+#/); assert.match(lampLine[2], /^\s+y: 30\s+#/);
  assert.equal(lampLine[1].replace('24', '30'), lampLine[2], 'the comment stays beside the value');
  assert.match(floorLine[1], /floor: \{ friction: 0\.6, restitution: 0\.15 \}/);
  assert.match(floorLine[2], /floor: \{ friction: 0\.7, restitution: 0\.15 \}/);
  const re = parseYaml(out).tree;
  assert.equal(re.light.lamp.y, 30);
  assert.equal(re.throw.physics.floor.friction, 0.7);
  assert.equal(re.throw.spawn.axis, 'clamp');
  const t2 = createTune({ declared: re, source: out });
  assert.deepEqual(t2.diff().map((d) => d.path), [], 'the exported file re-declares the live values');
  assert.equal(t2.SHIPPED.light.lamp.y, 30);
});

t('exportYaml inserts a leaf the file omits, under the right map', () => {
  const partial = 'app:\n  mode: development\nlight:\n  lamp:\n    y: 24   # tall\n  fog:\n    far: 46\n';
  const tune = mini(parseYaml(partial).tree, partial);
  assert.equal(tune.exportYaml(), partial);
  tune.set({ 'light.lamp.color': '#000000', 'throw.physics.gravity': -90 });
  const out = tune.exportYaml();
  const re = parseYaml(out).tree;
  assert.equal(re.light.lamp.color, '#000000');
  assert.equal(re.throw.physics.gravity, -90);
  assert.equal(re.light.lamp.y, 24);
  assert.ok(out.includes('    y: 24   # tall\n'), 'the untouched line is byte-identical');
  assert.deepEqual(tune.diff().map((d) => d.declared), [false, false]);
});

t('patchText is the changes as a nested YAML fragment', () => {
  const tune = mini();
  tune.set({ 'light.lamp.y': 30, 'light.fog.far': 60, 'throw.spawn.axis': 'own' });
  const frag = tune.patchText();
  assert.deepEqual(parseYaml(frag).tree, { light: { lamp: { y: 30 }, fog: { far: 60 } }, throw: { spawn: { axis: 'own' } } });
  assert.ok(frag.endsWith('\n'));
  assert.equal(mini().patchText(), '', 'no changes → an empty fragment');
  assert.deepEqual(parseYaml(mini().patchText()).tree, {}, 'which parses to an empty map');
});

t('applyPatchText merges a fragment through set, refusing unknown paths and the film lock', () => {
  const tune = mini();
  const hits = [];
  tune.bind('light.*', (p) => hits.push(p));
  let r = tune.applyPatchText('light:\n  lamp: { y: 33 }\n  fog:\n    far: 70\nnope:\n  x: 1\nthrow:\n  physics: { gravity: -60 }\n', { filmLocked: true });
  assert.deepEqual(r.refused, [['nope.x', 'unknown'], ['throw.physics.gravity', 'film']]);
  assert.equal(tune.T.light.lamp.y, 33); assert.equal(tune.T.light.fog.far, 70);
  assert.equal(tune.T.throw.physics.gravity, -110);
  assert.deepEqual(hits, ['light.lamp.y'], 'one binder call for two light writes');
  r = tune.applyPatchText('throw: { physics: { gravity: -60 }, spawn: { axis: width } }');
  assert.deepEqual(r.refused, []); assert.equal(tune.T.throw.physics.gravity, -60); assert.equal(tune.T.throw.spawn.axis, 'width');
  r = tune.applyPatchText('');
  assert.deepEqual(r.refused, []); assert.deepEqual(r.pending, []);
  assert.throws(() => tune.applyPatchText('light:\n  lamp: { y: true }\n'), /boolean/);
  const paste = tune.patchText();
  const t2 = mini();
  t2.applyPatchText(paste);
  assert.deepEqual(t2.changes(), tune.changes(), 'copy patch → paste patch round-trips the changes');
});

if (!process.exitCode) console.log(`tune: ${n} tests passed`);
