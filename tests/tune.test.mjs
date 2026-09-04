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
//     leaf has a dial and fits its type/options (the file is the authority;
//     the code default is the fallback — dbee311 proved it)
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
  DIALS, look, film, pick, list, isDial, defaultsOf, merge, leaves, getLeaf, setLeaf, hasLeaf,
  alias, FORBIDDEN_LEAF, STATIC_PATHS, createTune,
  ASSET_SECTIONS, ASSET_ROWS, ASSET_ID_RE, assetRowDefaults, assetDialFor,
} from '../js/tune.js';
import { parseYaml } from '../js/yaml.js';
// The two Node-pure modules whose numbers the C5 dials copy. Neither imports
// three or cannon (js/places.js is imported by server.js; js/voices.js is the
// audio DATA), so both can be read here.
import { MASTER_GAIN, IMPACT_VOICES, IMPACT_DEFAULT_BODY } from '../js/voices.js';
import { PLACARD, PLACARD_STANDOFF, PLACARD_W, PLACARD_D } from '../js/places.js';

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
  assert.deepEqual(Object.keys(d), ['app', 'table', 'light', 'camera', 'throw', 'pace', 'sound', 'post', 'cards']);
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

// THE DEFAULT IS A SECOND COPY OF A NUMBER SOMEBODY ELSE OWNS, and the drift
// test above only pins dice.yaml against js/tune.js — both halves of the same
// declaration. Where the source module is Node-pure the third copy can be
// pinned too, and then a value moved in its own file cannot leave the panel
// showing "default" beside a number that is no longer the shipped one. (C5,
// 2026-09-03. js/post.js's BLOOM_THRESHOLD is NOT here: it imports three, so
// this file cannot reach it — `dev-sound-post` pins the uniform against the
// tree in the browser instead, which is the same claim measured later.)
t('C5 defaults are the source modules own numbers, not a second opinion', () => {
  assert.equal(DIALS.sound.master.def, MASTER_GAIN,
    'sound.master must be js/voices.js MASTER_GAIN');
  assert.equal(DIALS.sound.impact.gain.def, IMPACT_VOICES[IMPACT_DEFAULT_BODY].gainScale,
    'sound.impact.gain must be the DEFAULT body\'s gainScale, whichever body that is');
  assert.deepEqual(
    { standoff: DIALS.cards.standoff.def, w: DIALS.cards.width.def, d: DIALS.cards.depth.def },
    { standoff: PLACARD.standoff, w: PLACARD.w, d: PLACARD.d },
    'cards.* must be js/places.js PLACARD');
  // …and the shipped consts js/places.js still exports for the unit rows are
  // the same numbers, so a reader who imports either one is reading the mat
  // this build ships.
  assert.deepEqual([PLACARD_STANDOFF, PLACARD_W, PLACARD_D],
    [PLACARD.standoff, PLACARD.w, PLACARD.d]);
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
  // `sets:` USED TO BE A SECTION THIS BUILD COULD NOT DECLARE ROWS IN, and
  // that case is gone with phase D1: the dice catalogue landed under
  // `houses:`, two levels deep, and there is no named-but-unbuilt asset
  // section left. A top-level map the dial tree does not know is what it
  // always was for a non-section — carried as typed values, one refusal per
  // dotted key.
  t = one({ sets: { 'house.ember': { label: 'Ember' } } }, 'sets.house.ember', 'key', /key "house\.ember" under sets contains a dot/);
  // `felts:` IS a section, so a dotted id meets the id rule instead
  t = one({ felts: { 'house.moss': { name: 'Moss' } } }, 'felts.house.moss', 'key', /"house\.moss" is not a legal felts id/);
  assert.deepEqual(t.SHIPPED.felts, {}, 'the section stands; the one bad row is gone');
  // a key with a dot in it is dropped everywhere else too
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

// ---------------------------------------------------------------------------
// Asset rows (docs/DEVMODE.md §9, phase C4): `felts:` is the first section
// where the DECLARATION authors a thing the code does not have.
// ---------------------------------------------------------------------------

t('the row shape is a map of dials, and assetDialFor answers a dial or says why not', () => {
  assert.deepEqual([...ASSET_SECTIONS], ['houses', 'felts', 'presets']);
  assert.ok(Object.isFrozen(ASSET_SECTIONS));
  // EVERY NAMED SECTION HAS A ROW SHAPE, and js/tune.js throws at import if
  // one does not. There used to be a third state — named but not yet
  // declarable — that three walks carried a branch for; the catalogue landed
  // and the tower and venue sections are DEFERRED, which is absent from this
  // list rather than present without a shape (the D1 review, 2026-09-03).
  for (const sec of ASSET_SECTIONS) {
    assert.ok(ASSET_ROWS[sec] && typeof ASSET_ROWS[sec] === 'object', `${sec} has a row shape`);
    assert.notEqual(assetRowDefaults(sec), null);
  }
  for (const [k, d] of Object.entries(ASSET_ROWS.felts)) {
    assert.ok(isDial(d), `felts.${k} is a dial`);
    assert.equal(d.cls, 'look', 'a felt is per-viewer chrome, never the bake');
    assert.ok(!FORBIDDEN_LEAF.test(`felts.${k}`), `felts.${k} reaches nothing it may not`);
  }
  assert.deepEqual(assetRowDefaults('felts'), {
    name: 'House felt', cloth: 'felt', feltBase: '#1c1c24', sceneBg: '#0f0f13', breath: 1, mottle: 1,
  });
  assert.equal(assetRowDefaults('sets'), null, 'a name that is not a section has no row defaults');
  assert.equal(assetDialFor('felts.house-moss.cloth'), ASSET_ROWS.felts.cloth);
  assert.equal(assetDialFor(['felts', 'house-moss', 'breath']), ASSET_ROWS.felts.breath);
  assert.equal(assetDialFor('sets.house-ember.label'), 'no dial at this path', '`sets:` never became a section');
  assert.match(assetDialFor('felts.HOUSE.cloth'), /not a legal felts id/);
  assert.match(assetDialFor('felts.house-moss.nope'), /no felts field named "nope"/);
  assert.match(assetDialFor('felts.house-moss.name.x'), /felts\.house-moss\.name is a value, not a map/);
  assert.match(assetDialFor('felts.house-moss'), /is a row of fields/);
  assert.match(assetDialFor('felts'), /is a map of rows/);
  // A DOTTED ID READS AS A ROW AND A FIELD, and the message says so rather
  // than only "too deep" — that is the mistake this branch exists to explain.
  assert.match(assetDialFor('felts.house.moss.cloth'), /an id may not contain a dot/);
  assert.equal(assetDialFor('light.lamp.y'), 'no dial at this path');
  assert.ok(ASSET_ID_RE.test('house-moss') && ASSET_ID_RE.test('house_moss2'));
  for (const bad of ['house.moss', 'House', '-moss', '', 'x'.repeat(33)]) {
    assert.ok(!ASSET_ID_RE.test(bad), `${JSON.stringify(bad)} is not an id`);
  }
});

t('addRow / removeRow: a row lands whole, counts as its leaves, and reset puts the section back', () => {
  const tune = mini();
  assert.deepEqual(tune.rowsOf('felts'), {}, 'nothing declared, no rows');
  assert.deepEqual(tune.sections().filter((s) => ASSET_SECTIONS.includes(s)), [],
    'an asset section is never a dial section: the panel draws it bespoke');

  const r = tune.addRow('felts', 'house-moss', { name: 'Moss', cloth: 'silt', feltBase: '#1f3a22' });
  assert.deepEqual(r.refused, []);
  assert.deepEqual(tune.rowsOf('felts'), {
    'house-moss': { name: 'Moss', cloth: 'silt', feltBase: '#1f3a22', sceneBg: '#0f0f13', breath: 1, mottle: 1 },
  }, 'the fields the caller left out take the row defaults');
  assert.deepEqual(tune.changes(), {
    'felts.house-moss.name': 'Moss', 'felts.house-moss.cloth': 'silt', 'felts.house-moss.feltBase': '#1f3a22',
    'felts.house-moss.sceneBg': '#0f0f13', 'felts.house-moss.breath': 1, 'felts.house-moss.mottle': 1,
  }, 'every leaf of the row counts as a change');
  const added = tune.diff().filter((d) => d.path.startsWith('felts.'));
  assert.equal(added.length, 6);
  assert.deepEqual([...new Set(added.map((d) => d.shipped))], [undefined], 'the file said none of it');
  assert.deepEqual([...new Set(added.map((d) => d.cls))], ['look'], 'and each leaf wears its row dial');

  // a write into a minted row is not 'unknown' — it is how the editor works
  assert.deepEqual(tune.set({ 'felts.house-moss.breath': 0.8 }).refused, []);
  assert.equal(tune.get('felts.house-moss.breath'), 0.8);
  assert.deepEqual(tune.set({ 'felts.house-moss.cloth': 'linen' }).refused, [['felts.house-moss.cloth', 'option']]);
  assert.deepEqual(tune.set({ 'felts.house-moss.name': 4 }).refused, [['felts.house-moss.name', 'type']]);
  assert.deepEqual(tune.set({ 'felts.other.name': 'x' }).refused, [['felts.other.name', 'unknown']]);

  // the refusals of addRow itself
  assert.deepEqual(tune.addRow('paints', 'x', {}).refused, [['paints', 'unknown']]);
  assert.deepEqual(tune.addRow('houses', 'house-ember', {}).refused, [], 'houses is a section too');
  assert.deepEqual(tune.removeRow('houses', 'house-ember').refused, []);
  assert.deepEqual(tune.addRow('felts', 'house.moss', {}).refused, [['felts.house.moss', 'id']]);
  assert.deepEqual(tune.addRow('felts', 'HOUSE', {}).refused, [['felts.HOUSE', 'id']]);
  assert.deepEqual(tune.addRow('felts', 'house-x', 7).refused, [['felts.house-x', 'type']]);
  // 'section' MEANS "that path is not a collection of rows" now. It used to
  // mean "a section this build cannot declare rows in", a state that ended
  // with the catalogue (the D1 review); what reaches it is a path that lands
  // inside a row at something that is not a map of rows.
  assert.deepEqual(tune.addRow(['houses', 'std', 'label'], 'x', {}).refused, [['houses.std.label', 'section']]);
  assert.deepEqual(tune.addRow('felts', 'house-x', { nope: 1, cloth: 'birch', breath: 'deep' }).refused,
    [['felts.house-x.nope', 'unknown'], ['felts.house-x.cloth', 'option'], ['felts.house-x.breath', 'type']]);
  assert.equal(tune.rowsOf('felts')['house-x'].cloth, 'felt', 'the row still lands, on its defaults');
  assert.deepEqual(tune.removeRow('felts', 'house-x').refused, []);
  assert.deepEqual(tune.removeRow('felts', 'house-x').refused, [['felts.house-x', 'unknown']]);

  tune.reset('all');
  assert.deepEqual(tune.rowsOf('felts'), {}, 'reset takes an added row away — there is nothing to reset it TO');
  assert.deepEqual(tune.changes(), {});
});

t('a declared row is a SHIPPED row: reset restores it, remove reports it gone, export takes its lines out', () => {
  const src = 'light:\n  lamp:\n    y: 24\nfelts:\n  house-moss:\n    name: Moss   # the first house felt\n    cloth: silt\n';
  const tune = mini(parseYaml(src).tree, src);
  assert.deepEqual(tune.SHIPPED.felts['house-moss'], {
    name: 'Moss', cloth: 'silt', feltBase: '#1c1c24', sceneBg: '#0f0f13', breath: 1, mottle: 1,
  }, 'the file names two fields; the row shape fills the rest');
  assert.ok(tune.rowIsDeclared('felts', 'house-moss'));
  assert.ok(!tune.rowIsDeclared('felts', 'house-ash'));
  assert.deepEqual(tune.changes(), {}, 'a declared row is not a change');
  assert.equal(tune.exportYaml(), src, 'and patching nothing is byte-identical');

  tune.set({ 'felts.house-moss.cloth': 'oak' });
  assert.equal(tune.exportYaml(),
    'light:\n  lamp:\n    y: 24\nfelts:\n  house-moss:\n    name: Moss   # the first house felt\n    cloth: oak\n',
    'one field moves one line and the comment survives');
  tune.reset('felts');
  assert.equal(tune.get('felts.house-moss.cloth'), 'silt');

  // REMOVED: the row's LINES come out, not its leaves one at a time. Taking
  // the leaves out leaves `house-moss: {}` behind — patchYaml's own "the
  // map's last child left" rule — and the reader then fills that empty row
  // back out with the row defaults, so Remove + Save + reload would hand the
  // row straight back.
  tune.removeRow('felts', 'house-moss');
  assert.deepEqual(Object.values(tune.changes()), [undefined, undefined, undefined, undefined, undefined, undefined],
    'changes() still speaks in leaves — which is why the route cannot carry a removal');
  const gone = tune.exportYaml();
  assert.deepEqual(parseYaml(gone).tree.felts, {}, 'the row is gone and the section is empty, not a stub row');
  assert.ok(!/house-moss/.test(gone), 'no orphan key left behind');
  assert.equal(tune.patchText(), '', 'and a copied patch says nothing about a removal');
  tune.reset('all');
  assert.ok(tune.rowIsDeclared('felts', 'house-moss'));
  assert.equal(tune.get('felts.house-moss.cloth'), 'silt', 'reset puts a declared row back whole');
  assert.equal(tune.exportYaml(), src);
});

// A ROW THAT IS GONE STAYS GONE UNTIL SOMETHING PUTS IT BACK WHOLE (the C4
// review, 2026-09-03). `apply` asked `hasLeaf(SHIPPED, p)`, and SHIPPED still
// names every leaf of a row the FILE declares after `removeRow` took it out of
// T — so one leaf write minted the row again with five fields guessed from the
// row defaults, while `exportChanges` went on saying the row was gone. The
// module's own comment ("a half-built felt is a felt the merge site would have
// to guess the rest of, and guessing is how a catalogue grows rows nobody
// wrote") is the rule this pins.
t('a leaf write into a REMOVED row is refused, and does not mint half a felt', () => {
  const src = 'light:\n  lamp:\n    y: 24\nfelts:\n  house-moss:\n    name: Moss\n    cloth: silt\n    breath: 0.9\n';
  const tune = mini(parseYaml(src).tree, src);
  tune.removeRow('felts', 'house-moss');
  assert.deepEqual(tune.rowsOf('felts'), {}, 'the row is out of T');

  const r = tune.set({ 'felts.house-moss.name': 'Bog' });
  assert.deepEqual(r.refused, [['felts.house-moss.name', 'row']],
    'refused by its own reason, not accepted because SHIPPED still names the leaf');
  assert.deepEqual(tune.rowsOf('felts'), {}, 'and nothing was minted');
  assert.ok(!/house-moss/.test(tune.exportYaml()),
    'so the live tree and the export still agree that the row is gone');

  // …and the same write into a row NOBODY ever had is still 'unknown': the two
  // refusals mean different things and the panel words them differently.
  assert.deepEqual(tune.set({ 'felts.house-never.name': 'X' }).refused,
    [['felts.house-never.name', 'unknown']]);

  // The row is put back WHOLE, which is what reset at the row's path does.
  tune.reset('felts.house-moss');
  assert.equal(tune.get('felts.house-moss.breath'), 0.9, 'the file\'s own row, every field of it');
  assert.deepEqual(tune.set({ 'felts.house-moss.name': 'Bog' }).refused, [],
    'and once it is back, a field write lands as it always did');
});

// A SPARSE SECTION'S ABSENT FIELD IS MOST OF ITS FIELDS (the D1 review,
// 2026-09-03). `apply`'s "neither tree names this leaf" guard was written when
// `felts:` was the only asset section, and a felt row is FILLED — every one of
// its six fields is in T, so "no leaf here" really did mean "no such dial". A
// dice recipe is SPARSE on purpose (ASSET_SPARSE: "absent is a real answer"),
// so on a shipped set every field the file does not name was unwritable:
// `assetDialFor` answered with the dial and the write was refused 'unknown'
// anyway. Roughly eighty of the ninety recipe knobs, on the rows a person
// edits first.
const HOUSE_SRC = [
  'light:', '  lamp:', '    y: 24',
  'houses:',
  '  classics:',
  '    label: Classics',
  '    line: unadorned dice',
  '    dice:',
  '      ivory:',
  '        label: Ivory',
  '        body: "#f3ead7"',
  '',
].join('\n');

t('a sparse row: a field the file never named is writable, judged, and the ROW is what takes it back', () => {
  const tune = mini(parseYaml(HOUSE_SRC).tree, HOUSE_SRC);
  const set = 'houses.classics.dice.ivory';
  assert.deepEqual(tune.SHIPPED.houses.classics.dice.ivory, { label: 'Ivory', body: '#f3ead7' },
    'sparse: the row is what the file says and not one field more');
  assert.equal(tune.dialAt(`${set}.glyph`).def, 'digit', 'and the absent field still has its dial');
  assert.equal(tune.get(`${set}.glyph`), undefined, 'with no value behind it');

  assert.deepEqual(tune.set({ [`${set}.glyph`]: 'pip' }).refused, [], 'the write mints the leaf');
  assert.equal(tune.get(`${set}.glyph`), 'pip');
  // …and a field inside a group the row does not have yet brings the group
  // with it — only that field of it, never the group's defaults.
  assert.deepEqual(tune.set({ [`${set}.geo.bevel`]: 0.05 }).refused, []);
  assert.deepEqual(tune.get(`${set}.geo`), { bevel: 0.05 }, 'the group holds the one field written');

  // A minted leaf is judged exactly as a written one: the dial's own `def` —
  // the code's fallback, which is what the empty panel field was showing — is
  // the value the type check reads.
  assert.deepEqual(tune.set({ [`${set}.glyph`]: 'runes' }).refused, [[`${set}.glyph`, 'option']]);
  assert.deepEqual(tune.set({ [`${set}.geo.nicks`]: 'three' }).refused, [[`${set}.geo.nicks`, 'type']]);
  assert.deepEqual(tune.set({ [`${set}.faces`]: ['1', '2', '3', '4', '5', 'claw'] }, { filmLocked: true }).refused,
    [[`${set}.faces`, 'film']], 'and a face table locks with a second seat, minted or not');
  assert.equal(tune.get(`${set}.geo.nicks`), undefined, 'a refused mint leaves nothing behind');

  // The diff says the file did not say it, which is what Save writes out.
  const d = tune.diff().filter((x) => x.path.startsWith(`${set}.`));
  assert.deepEqual(d.map((x) => [x.path, x.shipped, x.live, x.declared]), [
    [`${set}.glyph`, undefined, 'pip', false],
    [`${set}.geo.bevel`, undefined, 0.05, false],
  ]);
  assert.match(tune.exportYaml(), /\n        glyph: pip\n/);
  assert.match(tune.exportYaml(), /bevel: 0\.05/);

  // The ROW is the unit that takes them away again — a minted field has no
  // shipped value to go back to, so `reset` at the field's own path refuses
  // by name (the C4 rule, unchanged).
  assert.deepEqual(tune.reset(`${set}.glyph`).refused, [[`${set}.glyph`, 'row']]);
  tune.reset(set);
  assert.deepEqual(tune.changes(), {});
  assert.deepEqual(tune.get(set), { label: 'Ivory', body: '#f3ead7' }, 'sparse again, to the field');

  // THE ROW STILL HAS TO EXIST, and the two refusals still mean what they
  // meant: a set nobody ever had is 'unknown'; a declared set this session
  // removed is 'row'.
  assert.deepEqual(tune.set({ 'houses.classics.dice.onyx.body': '#141416' }).refused,
    [['houses.classics.dice.onyx.body', 'unknown']]);
  assert.deepEqual(tune.set({ 'houses.nowhere.dice.ivory.glyph': 'pip' }).refused,
    [['houses.nowhere.dice.ivory.glyph', 'unknown']]);
  tune.removeRow(['houses', 'classics', 'dice'], 'ivory');
  assert.deepEqual(tune.set({ [`${set}.glyph`]: 'pip' }).refused, [[`${set}.glyph`, 'row']]);
  assert.deepEqual(tune.rowsOf('houses').classics.dice, {}, 'and nothing was minted into the hole');
});

t('a binder that throws over a MINTED field takes the field away, not a value back', () => {
  const tune = mini(parseYaml(HOUSE_SRC).tree, HOUSE_SRC);
  const quiet = console.error; console.error = () => {};
  try {
    tune.bind('houses.*', () => { throw new Error('the skin did not rebuild'); });
    const r = tune.set({ 'houses.classics.dice.ivory.geo.bevel': 0.05 });
    assert.deepEqual(r.refused, [['houses.classics.dice.ivory.geo.bevel', 'binder']]);
    // A rollback that wrote the previous value back would write `undefined` AT
    // the leaf and leave an empty `geo:` behind it — a group `leaves` walks and
    // `changes()` cannot name. The shallowest node the write created is what
    // goes.
    assert.equal(tune.get('houses.classics.dice.ivory.geo'), undefined);
    assert.deepEqual(Object.keys(tune.T.houses.classics.dice.ivory), ['label', 'body']);
    assert.deepEqual(tune.changes(), {});
  } finally { console.error = quiet; }
});

// A LIST DIAL WITH A NULL `each` HAD NO LAW AT ALL (the D1 review): `judge`
// fell through, so `[]`, `[null]` and `[1, 2]` were all legal palettes — in
// the declaration, through `set` and through the armed route — and
// js/particles.js handed the number to `hexRGB`. "Not a fixed vocabulary" is
// not "not even a string".
t('a list dial: every entry is a string, `each` is the vocabulary, `len` is how many the code reads', () => {
  const RECIPE = ASSET_ROWS.houses.dice.rows;
  assert.deepEqual(RECIPE.faces.len, [6, 6], 'a face table is six or it is not a face table');
  assert.deepEqual(RECIPE.decal.colors.len, [1, 2], 'js/decals.js reads colors[0] and colors[1] || colors[0]');
  assert.deepEqual(RECIPE.particles.colors.len, [1, 8], 'a palette is one or more');
  assert.equal(RECIPE.particles.colors.each, undefined, 'and it has no vocabulary — there is no list of legal colours');
  assert.throws(() => list('x', ['a'], null, null, 'look', 'apply'), /len/);
  assert.throws(() => list('x', ['a'], null, [0, 2], 'look', 'apply'), /len/);
  assert.throws(() => list('x', ['a', 'b'], null, [1, 1], 'look', 'apply'), /outside len/);
  assert.throws(() => list('x', ['a'], ['a'], [1, 2], 'look', 'apply'), /two entries/);

  const tune = mini(parseYaml(HOUSE_SRC).tree, HOUSE_SRC);
  const colors = 'houses.classics.dice.ivory.particles.colors';
  assert.deepEqual(tune.set({ [colors]: ['#112233', '#445566'] }).refused, []);
  assert.deepEqual(tune.set({ [colors]: [1, 2] }).refused, [[colors, 'type']], 'a number is not a colour');
  assert.deepEqual(tune.set({ [colors]: [null] }).refused, [[colors, 'type']]);
  assert.deepEqual(tune.set({ [colors]: [] }).refused, [[colors, 'range']], 'a palette of none is not a palette');
  assert.deepEqual(tune.get(colors), ['#112233', '#445566'], 'and none of the refusals moved it');
  const faces = 'houses.classics.dice.ivory.faces';
  assert.deepEqual(tune.set({ [faces]: ['1', '2', '3', '4', '5', 'claw'] }).refused, []);
  assert.deepEqual(tune.set({ [faces]: ['plus', 'minus'] }).refused, [[faces, 'range']], 'six values, six readings');
  assert.deepEqual(tune.set({ [faces]: ['1', '2', '3', '4', '5', 'sword'] }).refused, [[faces, 'option']],
    'and a symbol nobody drew is refused by name');

  // The same three laws at the DECLARATION, where the message says which.
  const bad = [];
  createTune({
    declared: { houses: { h: { label: 'H', dice: { s: { particles: { kind: 'motes', colors: [1, 2] } } } } } },
    dials: MINI, onRefuse: (r) => bad.push(r.message),
  });
  assert.deepEqual(bad, ['houses.h.dice.s.particles.colors: every entry must be a string, got [1,2]; the default stands']);
  const short = [];
  createTune({
    declared: { houses: { h: { label: 'H', dice: { s: { faces: ['1', '2'] } } } } },
    dials: MINI, onRefuse: (r) => short.push(r.message),
  });
  assert.deepEqual(short, ['houses.h.dice.s.faces: takes 6 entries, got 2; the default stands']);
});

// `resetRows` read `prefix[1]` without asking how long the prefix was, so a
// reset at a path DEEPER than a row was treated as a row scope: one field
// reverted all six, and one field of a session row deleted the row. The panel
// never reached it (its revert glyph goes through `tune.set`), but
// `tuneReset(path)` is a published hook (the C4 review, 2026-09-03).
t('reset at a path deeper than a row moves that field and no other', () => {
  const src = 'light:\n  lamp:\n    y: 24\nfelts:\n  house-moss:\n    name: Moss\n    breath: 0.9\n';
  const tune = mini(parseYaml(src).tree, src);
  tune.set({ 'felts.house-moss.name': 'Bog', 'felts.house-moss.breath': 0.2 });
  assert.deepEqual(tune.changes(), { 'felts.house-moss.name': 'Bog', 'felts.house-moss.breath': 0.2 });

  tune.reset('felts.house-moss.name');
  assert.deepEqual(tune.changes(), { 'felts.house-moss.breath': 0.2 },
    'the one field went back; the row\'s other edit stands');
  assert.equal(tune.get('felts.house-moss.name'), 'Moss');

  // A session row has no shipped field to go back TO, so the field is refused
  // by name rather than the whole row being deleted under the caller.
  tune.addRow('felts', 'house-ash', { name: 'Ash' });
  const r = tune.reset('felts.house-ash.name');
  assert.deepEqual(r.refused, [['felts.house-ash.name', 'row']]);
  assert.deepEqual(Object.keys(tune.rowsOf('felts')).sort(), ['house-ash', 'house-moss'],
    'and the row this session minted is still there');
  assert.equal(tune.get('felts.house-ash.name'), 'Ash');
  // The row scope is still the row scope, and still takes it away whole.
  tune.reset('felts.house-ash');
  assert.deepEqual(Object.keys(tune.rowsOf('felts')), ['house-moss']);
});

t('one `felts.*` binder covers both kinds of change: a field write and a row landing or leaving', () => {
  const tune = mini();
  const seen = [];
  // The binder main.js registers ignores its arguments and re-reads the tree
  // (feltThemesSync), which is what lets ONE binder serve both — a leaf write
  // hands it (path, value) as every dial binder is handed, and a structural
  // change hands it the SECTION, because a row landing has no leaf to name.
  tune.bind('felts.*', (path, value) => seen.push([path, tune.rowsOf('felts'), value]));
  tune.addRow('felts', 'house-moss', { name: 'Moss' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], 'felts', 'a row landing names the section');
  assert.deepEqual(Object.keys(seen[0][1]), ['house-moss'], 'and the tree already holds the row');
  assert.deepEqual(Object.keys(seen[0][2]), ['house-moss'], '…which is also what it is handed');

  tune.set({ 'felts.house-moss.name': 'Bog', 'felts.house-moss.breath': 0.8 });
  assert.equal(seen.length, 2, 'a two-leaf patch runs it once');
  assert.equal(seen[1][0], 'felts.house-moss.name', 'a field write names the first leaf, as any dial write does');
  assert.equal(seen[1][1]['house-moss'].breath, 0.8, 'and the WHOLE patch is in the tree before it runs');

  tune.removeRow('felts', 'house-moss');
  assert.equal(seen.at(-1)[0], 'felts');
  assert.deepEqual(seen.at(-1)[1], {});
  tune.addRow('felts', 'house-ash', {});
  tune.reset('all');
  assert.deepEqual(seen.at(-1)[1], {}, 'and reset runs it after the section is put back');
  assert.equal(seen.length, 5);
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

t('dice.yaml is the declaration, and the file is the authority: every leaf has a dial and fits it', () => {
  // THE FILE WINS (docs/DEVMODE.md §3 "the file is the authority, the code is
  // the fallback"). 2026-09-03: Joe dialed the toss on the live table, pressed
  // Save and committed dice.yaml (dbee311, back 0.4 → 2.05, height 0.3 → 0.8)
  // — and the first shape of this test, which pinned every leaf to its CODE
  // default, went red on the owner's first real use of the loop. A default is
  // what stands when a line is deleted, nothing more; the guard here is that
  // every leaf the file names has a dial of the right TYPE (and option), and
  // that the file's sections are the dial tree's, in order.
  //
  // AN ASSET SECTION IS CHECKED BY ITS ROW SHAPE, not by the dial tree — there
  // is no dial at `houses.classics.dice.ivory.body` to walk to, only a row
  // whose `body` field is one. `assetDialFor` is that walk, and the catalogue
  // drift guard (tests/catalogue.test.mjs) is where the recipes are read hard.
  const { tree } = parseYaml(text);
  const fileLeaves = leaves(tree).map(dotted).filter((p) => !ASSET_SECTIONS.includes(p.split('.')[0]));
  for (const p of fileLeaves) {
    const d = getLeaf(DIALS, p);
    assert.ok(isDial(d), `dice.yaml names ${p} but js/tune.js has no dial for it`);
    const v = getLeaf(tree, p);
    assert.equal(typeof v, typeof d.def, `${p}: file says ${JSON.stringify(v)}, the dial is a ${typeof d.def}`);
    if (d.options) assert.ok(d.options.includes(v), `${p} outside its options`);
  }
  assert.equal(tree.app.mode, 'development');
  const dialSections = Object.keys(tree).filter((k) => !ASSET_SECTIONS.includes(k));
  assert.deepEqual(dialSections, Object.keys(DIALS).filter((k) => k in tree), 'sections in the dial tree\'s order');
  assert.deepEqual(dialSections, ['app', 'table', 'light', 'camera', 'throw', 'pace', 'sound', 'post', 'cards']);
  // The asset sections come after them, and `houses:` is the only one the file
  // ships with — a `felts:` row is a house addition, so absence is its default.
  assert.deepEqual(Object.keys(tree).filter((k) => ASSET_SECTIONS.includes(k)), ['houses']);
});

t('createTune over the real file: SHIPPED is defaults ⊕ file with nothing refused, and nothing differs at birth', () => {
  const { tree } = parseYaml(text);
  const tune = createTune({ declared: tree, source: text });
  // A SPARSE SECTION RECONCILES TO ITSELF, with one documented exception: the
  // three `glow: null` lines. A null is ABSENT everywhere in this design, so
  // the reconciled tree has no `glow` key where the file writes the null —
  // dice.js reads `def.glow` for truth and cannot tell the two apart, and the
  // LINE is what carries "the digits carry all the light" to the next reader.
  const declared = JSON.parse(JSON.stringify(tree, (k, v) => (k === 'glow' && v === null ? undefined : v)));
  assert.deepEqual(tune.SHIPPED, merge(defaultsOf(DIALS), declared));
  assert.deepEqual(tune.refusals, [], 'every declared value fits its dial');
  assert.deepEqual(tune.diff(), []);
  assert.deepEqual(tune.sections(), Object.keys(DIALS), 'and an asset section is never a dial section');
  // FORBIDDEN_LEAF IS THE DIAL TREE'S LAW, and `houses.<h>.dice.<s>.faces` is
  // the one path in the file it bites. It is not a value: the server still
  // rolls 1..6 and the table is how the number is READ (js/rollspec.js — the
  // table is "already per-die on the wire"). It is film-class exactly because
  // both tabs must read it the same way, which is the guard GOALPOST 2
  // actually wants here; a word ban cannot express "agree on it".
  const exempt = /^houses\.[a-z0-9_-]+\.dice\.[a-z0-9_-]+\.faces$/;
  for (const p of leaves(tune.SHIPPED)) {
    if (exempt.test(dotted(p))) {
      assert.equal(tune.dialAt(p).cls, 'film', `${dotted(p)} is exempt only because it locks`);
      continue;
    }
    assert.ok(!FORBIDDEN_LEAF.test(dotted(p)), dotted(p));
  }
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


// ---------------------------------------------------------------------------
// LAWS (js/tune.js LAWS, phase D4): the check a slider range cannot make.
// ---------------------------------------------------------------------------

t('a `positive` law refuses zero and below, at the writer and at the file', () => {
  // The slider floor said 0.25 and the number field beside it takes any finite
  // value — which is the point of the number field, and was the hole.
  assert.equal(DIALS.pace.tempo.k.law, 'positive');
  assert.equal(DIALS.pace.tempo.k.range[0], 0.25, 'and the slider floor is 0.25');
  assert.equal(DIALS.pace.tempo.rampS.law, undefined, '0 is a real reading for the ramp');
  const tune = createTune({ declared: {} });
  assert.deepEqual(tune.set({ 'pace.tempo.k': 0 }).refused, [['pace.tempo.k', 'range-law']]);
  assert.deepEqual(tune.set({ 'pace.tempo.k': -1 }).refused, [['pace.tempo.k', 'range-law']]);
  assert.equal(tune.T.pace.tempo.k, 1, 'and the value never moved');
  assert.deepEqual(tune.set({ 'pace.tempo.k': 0.05 }).refused, [], 'below the slider is not below the law');
  assert.equal(tune.T.pace.tempo.k, 0.05);
  // At birth, through `judge`: the file may say it, and the default stands.
  const seen = [];
  const t2 = createTune({ declared: { pace: { tempo: { k: 0 } } }, onRefuse: (r) => seen.push(r) });
  assert.deepEqual(seen.map((r) => [r.path, r.reason]), [['pace.tempo.k', 'range-law']]);
  assert.match(seen[0].message, /greater than zero/);
  assert.equal(t2.T.pace.tempo.k, 1, 'the code default stands');
});

t('the `cardClear` pair law judges the WHOLE patch, in either order', () => {
  assert.equal(DIALS.cards.standoff.law, 'cardClear');
  assert.equal(DIALS.cards.depth.law, 'cardClear');
  assert.equal(DIALS.cards.width.law, undefined, 'width is across the ray and clears nothing');
  // Every value the SLIDERS offer holds: the worst pair is the standoff at its
  // floor against the depth at its ceiling, and that is exactly 0.
  const [sMin] = DIALS.cards.standoff.range;
  const dMax = DIALS.cards.depth.range[1];
  assert.ok(sMin - dMax / 2 >= 0, `the slider pair holds (${sMin} − ${dMax}/2)`);
  const tune = createTune({ declared: {} });
  assert.deepEqual(tune.set({ 'cards.depth': 3.9 }).refused, [['cards.depth', 'geometry']],
    'a typed depth that would put the card inside the rim is refused');
  assert.equal(tune.T.cards.depth, 1.52);
  // …and the two together, which are legal as a pair and illegal one at a
  // time in whichever order Object.entries hands them over.
  assert.deepEqual(tune.set({ 'cards.depth': 3.9, 'cards.standoff': 2 }).refused, []);
  assert.deepEqual([tune.T.cards.standoff, tune.T.cards.depth], [2, 3.9]);
  assert.deepEqual(tune.set({ 'cards.standoff': 0.5, 'cards.depth': 3 }).refused,
    [['cards.standoff', 'geometry'], ['cards.depth', 'geometry']],
    'a pair that does not hold refuses both halves, and neither lands');
  assert.deepEqual([tune.T.cards.standoff, tune.T.cards.depth], [2, 3.9]);
});

t('a pair law over the DECLARATION drops the whole group, not half of it', () => {
  const seen = [];
  const tune = createTune({
    declared: { cards: { standoff: 0.2, depth: 4, width: 5 } },
    onRefuse: (r) => seen.push(r),
  });
  assert.deepEqual(seen.map((r) => r.path).sort(), ['cards.depth', 'cards.standoff']);
  assert.equal(seen[0].reason, 'geometry');
  assert.deepEqual([tune.SHIPPED.cards.standoff, tune.SHIPPED.cards.depth], [0.86, 1.52],
    'both go back to the code default, which is a legal pair by construction');
  assert.equal(tune.SHIPPED.cards.width, 5, 'and the leaf that carries no law is untouched');
});

// The D4 review, 2026-09-03: "`reset` of one half of a law pair can be
// refused, so a value has no way back to the shipped one." `reset` funnels its
// entries through `apply`, which judges the pair against the patch plus T — so
// one leaf going home was judged against the OTHER leaf's typed value instead
// of against the shipped pair, which holds by construction.
t('a reset that names half a pair widens to the whole group', () => {
  const tune = createTune({ declared: {} });
  assert.deepEqual(tune.lawMates('cards.depth'), [['cards.standoff', 0.86]]);
  assert.deepEqual(tune.lawMates('cards.width'), [], 'a leaf that stands alone has no mate');
  assert.deepEqual(tune.lawMates('table.scale'), []);
  // A pair only the typed field can reach: 0.2 − 0.4/2 is exactly 0.
  assert.deepEqual(tune.set({ 'cards.depth': 0.4 }).refused, []);
  assert.deepEqual(tune.set({ 'cards.standoff': 0.2 }).refused, []);
  const r = tune.reset('cards.depth');
  assert.deepEqual(r.refused, [], 'the leaf goes home');
  assert.deepEqual([tune.T.cards.standoff, tune.T.cards.depth], [0.86, 1.52],
    'and its mate goes with it — the shipped pair is the legal state');
  // A scope that already carries both halves adds nothing, and a scope that
  // moves neither still adds nothing.
  tune.set({ 'cards.depth': 3.9, 'cards.standoff': 2.2, 'cards.width': 5 });
  assert.deepEqual(tune.reset('cards').refused, []);
  assert.deepEqual(tune.changes(), {});
  tune.set({ 'cards.width': 5 });
  assert.deepEqual(tune.reset('cards.width').refused, []);
  assert.deepEqual(tune.changes(), {}, 'a lawless leaf resets alone');
});

t('cards.* is an apply row now, not a reload row', () => {
  for (const k of ['standoff', 'width', 'depth']) {
    assert.equal(DIALS.cards[k].read, 'apply', `cards.${k} lands at the placard flush`);
    assert.equal(DIALS.cards[k].cls, 'film', '…and is still the shared geometry');
  }
  const tune = createTune({ declared: {} });
  const seen = [];
  tune.bind('cards.*', (p, v, covered) => seen.push(covered.map(([q]) => q)));
  const r = tune.set({ 'cards.width': 4, 'cards.standoff': 1 });
  assert.deepEqual(r.pending, [], 'nothing is owed to a reload');
  assert.deepEqual(seen, [['cards.width', 'cards.standoff']], 'one binder call for the pair');
});

// ---------------------------------------------------------------------------
// PRESETS (docs/DEVMODE.md §8, phase D4): the third asset section, whose row
// shape is the DIAL TREE.
// ---------------------------------------------------------------------------

t('a preset row is judged against the dial tree, leaf for leaf', () => {
  assert.ok(ASSET_SECTIONS.includes('presets'));
  assert.equal(ASSET_ROWS.presets, DIALS, 'the row shape IS the dial tree');
  assert.deepEqual(assetRowDefaults('presets'), {}, 'and it is SPARSE: a preset says what it moves');
  assert.equal(assetDialFor('presets.dusk.light.lamp.y'), DIALS.light.lamp.y);
  assert.equal(assetDialFor('presets.dusk.throw.physics.gravity'), DIALS.throw.physics.gravity);
  assert.match(assetDialFor('presets.dusk.nope'), /no presets field named "nope"/);
  assert.match(assetDialFor('presets.DUSK.light'), /not a legal presets id/);
  assert.match(assetDialFor('presets.dusk.light'), /is a group of fields/);
});

t('addRow mints a preset, set applies it as a paste, and the film lock holds', () => {
  const tune = createTune({ declared: {} });
  const bad = tune.addRow('presets', 'dusk', {
    light: { lamp: { y: 30, angle: 'wide' } },
    throw: { physics: { gravity: -60 } },
    nope: { x: 1 },
  });
  assert.deepEqual(bad.refused,
    [['presets.dusk.light.lamp.angle', 'type'], ['presets.dusk.nope', 'unknown']],
    'a wrong value and a path that is not a dial are named one by one');
  assert.deepEqual(tune.rowsOf('presets').dusk,
    { light: { lamp: { y: 30 } }, throw: { physics: { gravity: -60 } } });
  // The row is a CHANGE — it is what the file would gain.
  assert.deepEqual(tune.changes(),
    { 'presets.dusk.light.lamp.y': 30, 'presets.dusk.throw.physics.gravity': -60 });
  // Applying it is a paste through `set`, so the lock refuses the film half
  // and the look half still lands.
  const r = tune.set({ 'light.lamp.y': 30, 'throw.physics.gravity': -60 }, { filmLocked: true });
  assert.deepEqual(r.refused, [['throw.physics.gravity', 'film']]);
  assert.equal(tune.T.light.lamp.y, 30);
  assert.equal(tune.T.throw.physics.gravity, -110);
  // …and the row is the unit that leaves.
  assert.deepEqual(tune.removeRow('presets', 'dusk').refused, []);
  assert.deepEqual(tune.rowsOf('presets'), {});
  assert.deepEqual(tune.addRow('presets', 'A.b', {}).refused, [['presets.A.b', 'id']]);
});

// The D4 review, 2026-09-03: "a preset row's leaves escape the PAIR law, in
// both judges" — `checkLawPairs` and `judgePairs` walked `leaves(defaults)`
// alone, so no path under `presets.<name>.…` was ever in a law group, and the
// file could hold a preset whose Apply could only ever refuse both leaves.
t('the laws reach INSIDE a preset row: the pair is judged in the row it lives in', () => {
  // At birth: the whole group goes, by name, exactly as at the root.
  const seen = [];
  const t1 = createTune({
    declared: { presets: { odd: { cards: { standoff: 0.5, depth: 3 }, pace: { tempo: { k: 0 } } } } },
    onRefuse: (r) => seen.push(r),
  });
  assert.deepEqual(seen.map((r) => [r.path, r.reason]), [
    ['presets.odd.pace.tempo.k', 'range-law'],
    ['presets.odd.cards.standoff', 'geometry'],
    ['presets.odd.cards.depth', 'geometry'],
  ]);
  assert.match(seen[1].message, /the defaults stand for all of presets\.odd\.cards\.standoff, presets\.odd\.cards\.depth/);
  assert.deepEqual(t1.rowsOf('presets').odd.cards, {}, 'the half-claim is not in the row');
  // A pair that HOLDS inside the row stands, even where it would be illegal
  // against the table's own cards: a preset is applied whole.
  const t2 = createTune({ declared: { presets: { deep: { cards: { standoff: 2.2, depth: 3.9 } } } } });
  assert.deepEqual(t2.rowsOf('presets').deep, { cards: { standoff: 2.2, depth: 3.9 } });
  // …and a write into the row reads the ROW's other half, not the table's.
  assert.deepEqual(t2.set({ 'presets.deep.cards.depth': 3.5 }).refused, []);
  assert.deepEqual(t2.set({ 'presets.deep.cards.depth': 5 }).refused,
    [['presets.deep.cards.depth', 'geometry']], '5 − 2.2 is past the rim in the row too');
  assert.deepEqual([t2.T.cards.standoff, t2.T.cards.depth], [0.86, 1.52], 'the table never moved');
  assert.deepEqual(t2.lawMates('presets.deep.cards.depth'), [['presets.deep.cards.standoff', 2.2]]);
  // And `addRow` is the same door: the row lands minus the claim it broke.
  const r = t2.addRow('presets', 'odd', { cards: { standoff: 0.5, depth: 3 }, light: { lamp: { y: 30 } } });
  assert.deepEqual(r.refused, [['presets.odd.cards.standoff', 'geometry'], ['presets.odd.cards.depth', 'geometry']]);
  assert.deepEqual(t2.rowsOf('presets').odd, { cards: {}, light: { lamp: { y: 30 } } });
  assert.deepEqual(t2.addRow('presets', 'ok', { cards: { standoff: 2.2, depth: 3.9 } }).refused, []);
});

t('a preset may not name a static leaf: `app.mode` is dropped at birth', () => {
  const seen = [];
  const tune = createTune({
    declared: { presets: { odd: { app: { mode: 'production', title: 'Felt' } } } },
    onRefuse: (r) => seen.push(r),
  });
  assert.deepEqual(seen.map((r) => [r.path, r.reason]), [['presets.odd.app.mode', 'static']]);
  assert.match(seen[0].message, /set in dice\.yaml or DICE_MODE/);
  assert.deepEqual(tune.rowsOf('presets').odd, { app: { title: 'Felt' } },
    'the rest of the row stands: only the field nobody could ever apply is gone');
  assert.deepEqual(tune.addRow('presets', 'two', { app: { mode: 'production' } }).refused,
    [['presets.two.app.mode', 'static']]);
  // …and `set` is the third door: a preset row is SPARSE, so a write there
  // would have MINTED the field into the row rather than found it missing.
  const t3 = createTune({ declared: { presets: { odd: { light: { lamp: { y: 30 } } } } } });
  assert.deepEqual(t3.set({ 'presets.odd.app.mode': 'production' }).refused,
    [['presets.odd.app.mode', 'static']]);
  assert.deepEqual(t3.rowsOf('presets').odd, { light: { lamp: { y: 30 } } });
  assert.deepEqual(t3.set({ 'presets.odd.app.title': 'Felt' }).refused, [],
    'the leaf beside it is an ordinary dial and mints as one');
});

t('a declared preset is SHIPPED: reset restores it, and export round-trips', () => {
  const src = 'light:\n  lamp:\n    y: 24            # the pool\npresets:\n  dusk:\n    light: { lamp: { y: 30 } }\n';
  const tune = createTune({ declared: parseYaml(src).tree, source: src });
  assert.deepEqual(tune.SHIPPED.presets, { dusk: { light: { lamp: { y: 30 } } } });
  assert.ok(tune.rowIsDeclared('presets', 'dusk'));
  assert.deepEqual(tune.changes(), {}, 'a declared preset nobody has touched is not a change');
  assert.equal(tune.exportYaml(), src, 'and the export of an unchanged tree is the file');
  tune.removeRow('presets', 'dusk');
  assert.deepEqual(tune.changes(), { 'presets.dusk.light.lamp.y': undefined });
  // The ROW leaves whole — not four absent leaves, which patchYaml's "the
  // map's last child left" rule would have turned into `dusk: {}`, a row the
  // reader fills back out on the next boot. The last row out of a section
  // leaves `presets: {}` behind, which is a section with no rows in it; that
  // is `exportChanges`' shape and the felts editor's too.
  assert.deepEqual(parseYaml(tune.exportYaml()).tree.presets, {}, 'the row leaves whole');
  tune.reset('presets');
  assert.deepEqual(tune.rowsOf('presets'), { dusk: { light: { lamp: { y: 30 } } } }, 'and reset puts it back');
  // A held row that the file never had: reset takes it AWAY, there being
  // nothing to reset it to.
  tune.addRow('presets', 'noon', { light: { room: { key: 3 } } });
  tune.reset('all');
  assert.deepEqual(Object.keys(tune.rowsOf('presets')), ['dusk']);
});

// ---------------------------------------------------------------------------
// watch — the spectators (phase D5): the recorder and the pop-out
// ---------------------------------------------------------------------------

t('watch is told what LANDED, whatever door the write came through', () => {
  const tune = mini({ light: { lamp: { y: 24 } } });
  const seen = [];
  const off = tune.watch((e) => seen.push(e));
  tune.set({ 'light.lamp.y': 30 });
  assert.deepEqual(seen, [{ kind: 'set', patch: { 'light.lamp.y': 30 }, refused: [] }]);
  // A reset is a set: it funnels through the same writer, so a recorder gets
  // it without knowing there is such a verb.
  seen.length = 0;
  tune.reset('all');
  assert.deepEqual(seen, [{ kind: 'set', patch: { 'light.lamp.y': 24 }, refused: [] }]);
  // …and applyPatchText too, for the same reason.
  seen.length = 0;
  tune.applyPatchText('light:\n  lamp:\n    y: 31\n');
  assert.deepEqual(seen.map((e) => e.patch), [{ 'light.lamp.y': 31 }]);
  off();
  tune.set({ 'light.lamp.y': 32 });
  assert.equal(seen.length, 1, 'the unsubscribe is the return value, and it works');
});

t('watch reports the patch that LANDED, not the one that was asked for', () => {
  const tune = mini({});
  const seen = [];
  tune.watch((e) => seen.push(e));
  // Refused leaves are out; the lawful one of the same patch is in.
  tune.set({ 'light.lamp.y': 'high', 'light.fog.far': 60, 'throw.rng': 1 });
  assert.deepEqual(seen[0].patch, { 'light.fog.far': 60 });
  assert.deepEqual(seen[0].refused, [['light.lamp.y', 'type'], ['throw.rng', 'unknown']]);
  // A binder that THREW turns an accepted leaf into a refused one after the
  // fact, and the value is put back — so a recorder that wrote down the ask
  // would emit a step the tree never took.
  seen.length = 0;
  tune.bind('light.lamp.*', () => { throw new Error('nope'); });
  const was = console.error;
  console.error = () => {};
  try { tune.set({ 'light.lamp.y': 40, 'light.fog.far': 50 }); } finally { console.error = was; }
  assert.deepEqual(seen[0].patch, { 'light.fog.far': 50 });
  assert.deepEqual(seen[0].refused, [['light.lamp.y', 'binder']]);
  assert.equal(tune.get('light.lamp.y'), 24, 'and the tree really did go back');
});

t('a patch that moves nothing tells nobody', () => {
  const tune = mini({});
  const seen = [];
  tune.watch((e) => seen.push(e));
  tune.set({});
  tune.set({ 'throw.rng': 1 });
  assert.deepEqual(seen, [], 'an empty patch and a wholly-refused one are both silence');
});

t('rows are watched too: the pop-out has to redraw when a row lands or leaves', () => {
  const tune = createTune({ declared: {} });
  const seen = [];
  tune.watch((e) => seen.push(`${e.kind} ${e.where}.${e.id}`));
  tune.addRow('felts', 'house-moss', { name: 'Moss' });
  tune.removeRow('felts', 'house-moss');
  assert.deepEqual(seen, ['addRow felts.house-moss', 'removeRow felts.house-moss']);
});

t('a watcher that throws is a spectator, not a veto', () => {
  const tune = mini({});
  const seen = [];
  tune.watch(() => { throw new Error('bad watcher'); });
  tune.watch((e) => seen.push(e.patch));
  const was = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.join(' '));
  try {
    const r = tune.set({ 'light.lamp.y': 40 });
    assert.deepEqual(r.refused, [], 'the write is not refused by the watcher');
  } finally { console.error = was; }
  assert.equal(tune.get('light.lamp.y'), 40, 'and it landed');
  assert.deepEqual(seen, [{ 'light.lamp.y': 40 }], 'the other watcher still heard it');
  assert.match(lines.join(' '), /watcher threw/);
  assert.throws(() => tune.watch('not a function'), /must be a function/);
});

if (!process.exitCode) console.log(`tune: ${n} tests passed`);
