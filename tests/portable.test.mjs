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

// tests/portable.test.mjs — the pools & settings YAML (Tier 4 §5) grown into
// the whole prepared table (Tier G §G2): the emitter/parser round-trip is a
// fixed point, quoting survives the two YAML traps ('#' in notation, ': ' in
// names), and everything outside the strict subset fails CLOSED with a line
// number — never a guess. The G2 sections add their own load-bearing rules:
// a today-format file must still parse and still export byte-identically, the
// pool cap is per PLAYER, a '#' in a player name is refused rather than
// stripped (it is a whisper address), and an unknown SECTION is skipped with
// a warning while garbage INSIDE a known section still refuses.

import assert from 'node:assert/strict';
import { exportYaml, parsePortable, planImport, profileToImport } from '../js/portable.js';
import { STAMP as SCHEMA_STAMP, EPOCH, MAJOR } from '../js/schema.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// takes anything carrying shelves — the parsed document OR one parsed profile
const flat = (parsed) => parsed.shelves.flatMap((s) =>
  s.pools.map((p) => ({ ...p, category: s.plain ? null : s.label })));
// one parsed profile back into exportYaml's input shape
const asSeat = (p) => ({
  name: p.name,
  ...(p.system ? { system: p.system } : {}),
  ...(p.set ? { set: p.set } : {}),
  groups: flat(p),
});

// ---- round-trip ------------------------------------------------------------

t('export → parse is a fixed point (shelves, names, canonicals)', () => {
  const groups = [
    { id: 1, name: 'Body', notation: '3d6', category: 'Attributes' },
    { id: 2, name: 'Archery', notation: '1d6', category: 'Skills' },
    { id: 3, name: 'Damage', notation: '3d4' },
    { id: 4, name: '', notation: '1d20+5' },
  ];
  const text = exportYaml({ groups, settings: { sound: false, numbers: true } });
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(flat(parsed), [
    { name: 'Body', notation: '3d6', category: 'Attributes' },
    { name: 'Archery', notation: '1d6', category: 'Skills' },
    { name: 'Damage', notation: '3d4', category: null },
    { name: '', notation: '1d20+5', category: null },
  ]);
  assert.deepEqual(parsed.settings, { sound: false, numbers: true });
  // and the round-trip of the round-trip is byte-identical (fixed point)
  const again = exportYaml({
    groups: flat(parsed).map((p, i) => ({ id: i, name: p.name, notation: p.notation,
      ...(p.category ? { category: p.category } : {}) })),
    settings: parsed.settings,
  });
  assert.equal(again, text);
});

t("the YAML traps: '#' in notation, ': ' and quotes in names", () => {
  const groups = [
    { id: 1, name: "It's: Tricky", notation: '2d6 # Hunt the # sign', category: "O'Malley's" },
    { id: 2, name: 'Plain', notation: '1d4' },
  ];
  const text = exportYaml({ groups });
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  const got = flat(parsed);
  assert.equal(got[0].name, "It's: Tricky");
  assert.equal(got[0].notation, '2d6 # Hunt the # sign');
  assert.equal(got[0].category, "O'Malley's");
});

t('an empty rack still exports and parses (settings alone)', () => {
  const parsed = parsePortable(exportYaml({ groups: [] }));
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(flat(parsed).length, 0);
  assert.deepEqual(parsed.settings, { sound: true, numbers: false });
});

// ---- hand-written leniency (bare scalars) ---------------------------------

t('bare scalars parse: "- Damage: 3d4" under a bare shelf', () => {
  const parsed = parsePortable('pools:\n  Skills:\n    - Damage: 3d4\n');
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(flat(parsed), [{ name: 'Damage', notation: '3d4', category: 'Skills' }]);
});

t('notation normalizes to the canonical on import (d20+ 5 → 1d20+5)', () => {
  const parsed = parsePortable("pools:\n  Pools:\n    - Atk: 'd20 + 5'\n");
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(flat(parsed)[0].notation, '1d20+5');
});

t('full-line comments and blank lines are free', () => {
  const parsed = parsePortable('# hi\n\npools:\n  Pools:\n    - A: 1d6\n\n# bye\n');
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(flat(parsed).length, 1);
});

// ---- fail closed -----------------------------------------------------------

const refuses = (text, wantIn, name) => t(name, () => {
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, false, 'expected a refusal');
  assert.ok(parsed.error.includes(wantIn), `error ${JSON.stringify(parsed.error)} names ${JSON.stringify(wantIn)}`);
});

refuses('stuff\n', 'unknown top-level', 'a top-level line that is not even section-shaped refuses');
refuses('pools:\n\t- A: 1d6\n', 'tabs', 'tabs refuse');
refuses('pools:\n    - A: 1d6\n', 'outside any shelf', 'a pool without a shelf refuses');
refuses('pools:\n  P:\n    - A: not dice\n', 'notation', 'bad notation refuses and names it');
refuses('pools:\n  P:\n    - A 1d6\n', "'Name': 'notation'", 'a missing key split refuses');
refuses("pools:\n  P:\n    - 'A: 1d6\n", 'expected', 'an unterminated quote refuses');
refuses('pools:\n  P:\n  P:\n', 'twice', 'duplicate shelves refuse');
refuses(`pools:\n  P:\n    - ${'x'.repeat(30)}: 1d6\n`, 'over 24', 'an over-long name refuses');
refuses('', 'nothing', 'an empty paste refuses');
refuses('settings:\n  volume: true\n', 'settings lines', 'unknown settings keys refuse');
refuses('pools:\n  P:\n   - A: 1d6\n', 'indentation', 'three-space indent refuses');

t('the 40-pool cap refuses at parse', () => {
  const lines = ['pools:', '  P:'];
  for (let i = 0; i < 41; i++) lines.push(`    - N${i}: 1d6`);
  const parsed = parsePortable(lines.join('\n'));
  assert.equal(parsed.ok, false);
  assert.ok(parsed.error.includes('40'));
});

// ---- merge plan ------------------------------------------------------------

t('planImport: adds, updates, unchanged — and deletes nothing', () => {
  const current = [
    { id: 1, name: 'Body', notation: '3d6', category: 'Attributes' },
    { id: 2, name: 'Damage', notation: '3d4' },
    { id: 3, name: 'Keep Me', notation: '1d12' },
  ];
  const parsed = parsePortable([
    'pools:',
    '  Attributes:',
    "    - 'Body': '3d6'",     // identical → unchanged
    "    - 'Damage': '3d4'",   // same notation, NEW shelf → update
    '  Pools:',
    "    - 'Fresh': '2d10'",   // no match → add
    "    - '': '1d4'",         // unnamed → always an add
  ].join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  const plan = planImport(current, parsed);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.updates, [{ id: 2, name: 'Damage', notation: '3d4', category: 'Attributes' }]);
  assert.deepEqual(plan.adds, [
    { name: 'Fresh', notation: '2d10', category: null },
    { name: '', notation: '1d4', category: null },
  ]);
  // 'Keep Me' is nowhere in the plan: imports never delete
});

t('planImport: duplicate names pair off in order, extras add', () => {
  const current = [
    { id: 1, name: 'Twin', notation: '1d6' },
    { id: 2, name: 'Twin', notation: '1d8' },
  ];
  const parsed = parsePortable([
    'pools:', '  Pools:',
    "    - 'Twin': '1d6'",   // pairs with id 1 → unchanged
    "    - 'Twin': '1d20'",  // pairs with id 2 → update
    "    - 'Twin': '1d4'",   // third has no partner → add
  ].join('\n'));
  const plan = planImport(current, parsed);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.updates.map((u) => u.id), [2]);
  assert.equal(plan.adds.length, 1);
});

// ---- §9: the set override rides the YAML -----------------------------------

t('set override round-trips as the @ suffix', () => {
  const groups = [
    { id: 1, name: 'Ember', notation: '3d6', category: 'Attributes', set: 'emberforge.blackanvil' },
    { id: 2, name: 'Plain', notation: '1d20' },
  ];
  const text = exportYaml({ groups });
  assert.ok(text.includes("'3d6' @ 'emberforge.blackanvil'"));
  const parsed = parsePortable(text);
  assert.ok(parsed.ok);
  const pools = flat(parsed);
  assert.equal(pools[0].set, 'emberforge.blackanvil');
  assert.equal(pools[1].set ?? null, null);
});
t('unknown set ids fall closed to no override — the pool survives', () => {
  const parsed = parsePortable([
    'pools:', '  Pools:', "    - 'X': '1d6' @ 'no.such'",
  ].join('\n'));
  assert.ok(parsed.ok);
  assert.equal(flat(parsed)[0].set ?? null, null);
});
t('a bare hand-written notation keeps its @ inside the comment', () => {
  const parsed = parsePortable([
    'pools:', '  Pools:', "    - 'X': 3d6 # struck @ dawn",
  ].join('\n'));
  assert.ok(parsed.ok);
  const p = flat(parsed)[0];
  assert.equal(p.set ?? null, null);
  assert.ok(p.notation.includes('struck @ dawn'));
});
t('trailing garbage after the set id fails with a line number', () => {
  const parsed = parsePortable([
    'pools:', '  Pools:', "    - 'X': '1d6' @ 'std' extra",
  ].join('\n'));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 3);
});
t('planImport: a set change alone is an update; the same set is unchanged', () => {
  const current = [
    { id: 1, name: 'A', notation: '1d6', set: 'std' },
    { id: 2, name: 'B', notation: '1d6' },
  ];
  const parsed = parsePortable([
    'pools:', '  Pools:',
    "    - 'A': '1d6' @ 'std'",
    "    - 'B': '1d6' @ 'emberforge.blackanvil'",
  ].join('\n'));
  const plan = planImport(current, parsed);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.updates.map((u) => [u.id, u.set]), [[2, 'emberforge.blackanvil']]);
});

// ---- §G2: the prepared table — table: + players: ---------------------------

t('the today-format file still parses, and still exports byte-identically', () => {
  // the literal bytes a pre-G2 browser wrote — the regression guard for
  // "both new sections are present-or-absent"
  const text = [
    '# Dice Table — pools & just-you settings',
    '# paste back via Settings → Your data (import previews; Apply is explicit)',
    'pools:',
    '  Attributes:',
    "    - 'Body': '3d6'",
    '  Pools:',
    "    - 'Damage': '3d4'",
    'settings:',
    '  sound: true',
    '  numbers: false',
  ].join('\n') + '\n';
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.profiles, []);
  assert.deepEqual(parsed.warnings, []);
  assert.equal('table' in parsed, false, 'table is absent unless the text set it');
  // C22: an UNVERSIONED file is every file this app wrote before the stamp
  // existed, and it must read exactly as it always did — no warning, no
  // refusal, no version key invented for it.
  assert.equal('version' in parsed, false, 'no version is claimed for a file that carries none');
  const again = exportYaml({
    groups: [
      { id: 1, name: 'Body', notation: '3d6', category: 'Attributes' },
      { id: 2, name: 'Damage', notation: '3d4' },
    ],
    settings: parsed.settings,
  });
  // The emitter STAMPS now (C22 build order 4) — that is the one difference,
  // and it is two lines in a place an older reader skips. Everything else is
  // byte-for-byte what it was, which is what this test is really guarding.
  const stamped = text.replace(
    "# paste back via Settings → Your data (import previews; Apply is explicit)\n",
    `# paste back via Settings → Your data (import previews; Apply is explicit)\nversion:\n  schema: '${SCHEMA_STAMP}'\n`,
  );
  assert.equal(again, stamped);
});

t('export → parse → export is a fixed point WITH table: and players:', () => {
  const table = { name: 'Your Soul Deal — S3', felt: 'obsidian', system: 'soul-deal', zoom: 'wide' };
  const profiles = [
    { name: 'Alice', set: 'emberforge.blackanvil', groups: [
      { name: 'Strength', notation: '3d6', category: 'Attributes' },
      { name: 'Larceny', notation: '1d20', category: 'Skills' },
    ] },
    { name: 'Walter', groups: [{ name: 'Strength', notation: '4d6', category: 'Attributes' }] },
  ];
  const groups = [{ id: 1, name: 'Damage', notation: '3d4' }];
  const text = exportYaml({ groups, settings: { sound: true, numbers: false }, table, profiles });
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.table, table);
  assert.deepEqual(parsed.profiles.map((p) => p.name), ['Alice', 'Walter'], 'seat order is authored, not sorted');
  assert.equal(parsed.profiles[0].set, 'emberforge.blackanvil');
  assert.equal(parsed.profiles[1].set ?? null, null, 'a set is present-or-absent');
  assert.deepEqual(flat(parsed.profiles[0]), [
    { name: 'Strength', notation: '3d6', category: 'Attributes' },
    { name: 'Larceny', notation: '1d20', category: 'Skills' },
  ]);
  assert.deepEqual(flat(parsed), [{ name: 'Damage', notation: '3d4', category: null }]);
  const again = exportYaml({
    groups: flat(parsed).map((p) => ({ name: p.name, notation: p.notation, ...(p.category ? { category: p.category } : {}) })),
    settings: parsed.settings,
    table: parsed.table,
    profiles: parsed.profiles.map(asSeat),
  });
  assert.equal(again, text);
});

t('a player with no pools is still a seat (the key stands, the rack is empty)', () => {
  const text = exportYaml({ profiles: [{ name: 'Alice', groups: [] }] });
  assert.ok(text.includes("  'Alice':\n    pools:\n"), text);
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profiles.length, 1);
  assert.deepEqual(parsed.profiles[0].shelves, []);
  assert.equal(exportYaml({ profiles: parsed.profiles.map(asSeat) }), text);
});

// ---- §11: `profile:` — whose the top-level pools are -----------------------

t('the top-level rack can name its owner, and the trio round-trips', () => {
  // The section exists so one character's dice never live in two places: the
  // exporter's own pools stay where they have always been (`pools:`), and this
  // says whose they are. Writing that profile into `players:` as well would
  // give a hand-editable format two homes for one rack, and an edit landing in
  // the ignored copy is a trap.
  const text = exportYaml({
    profile: { name: 'Nessa', system: 'soul-deal', set: 'emberforge.blackanvil' },
    groups: [{ name: 'Strength', notation: '3d6', category: 'Attributes' }],
    profiles: [{ name: 'Yarn', system: 'dnd', groups: [{ name: 'Longsword', notation: '1d20+4' }] }],
  });
  assert.ok(text.includes("profile:\n  name: 'Nessa'\n  system: 'soul-deal'\n  set: 'emberforge.blackanvil'\n"), text);
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.profile, { name: 'Nessa', system: 'soul-deal', set: 'emberforge.blackanvil' });
  assert.deepEqual(parsed.profiles.map((p) => p.name), ['Yarn'], 'the OTHERS, not the one in hand');
  assert.deepEqual(flat(parsed), [{ name: 'Strength', notation: '3d6', category: 'Attributes' }]);
  const again = exportYaml({
    profile: parsed.profile,
    groups: flat(parsed).map((p) => ({ name: p.name, notation: p.notation, ...(p.category ? { category: p.category } : {}) })),
    settings: parsed.settings,
    profiles: parsed.profiles.map(asSeat),
  });
  assert.equal(again, text);
});

t('the rack appears EXACTLY once — no pool line is written twice', () => {
  const text = exportYaml({
    profile: { name: 'Nessa', system: 'soul-deal' },
    groups: [{ name: 'Damage', notation: '3d4' }],
    profiles: [{ name: 'Yarn', system: 'dnd', groups: [{ name: 'Longsword', notation: '1d20+4' }] }],
  });
  const hits = text.split('\n').filter((l) => l.includes("'Damage'"));
  assert.equal(hits.length, 1, `one home for one rack (got ${hits.length}: ${JSON.stringify(hits)})`);
});

t("a file with no `profile:` still parses — 'profile' in parsed is false", () => {
  const parsed = parsePortable("pools:\n  Pools:\n    - 'A': '1d6'\n");
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal('profile' in parsed, false, 'present-or-absent, never a default');
});

t('a `profile:` section alone is a usable document', () => {
  // A file naming who the pools belong to but carrying none of them is thin,
  // but it is not empty — the refusal is for a file that said nothing at all.
  const parsed = parsePortable("profile:\n  name: 'Nessa'\n");
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.profile, { name: 'Nessa' });
});

refuses("profile:\n  system: 'pathfinder'\n", 'is not one of soul-deal, dnd, none',
  'an unknown system in profile: refuses, as it does in a player block');
refuses("profile:\n  name: 'Bo#b'\n", "carries '#'",
  "'#' in the profile: name refuses — it is a display name too");
refuses("profile:\n  name: 'A'\n  name: 'B'\n", 'appears twice', 'a doubled profile key refuses');
refuses("profile:\n  nickname: 'A'\n", 'profile lines are', 'an unknown profile key refuses');

t("an unknown dice set in profile: falls closed, like a pool's", () => {
  const parsed = parsePortable("profile:\n  name: 'Nessa'\n  set: 'no.such.set'\n");
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profile.set ?? null, null);
  assert.equal(parsed.profile.name, 'Nessa', 'the rest of the section survived');
});

// ---- §11: a profile names the system its dice were chosen under ------------

t('a profile carries its rolling system, and the pair round-trips as a fixed point', () => {
  const text = exportYaml({
    profiles: [
      { name: 'Rill', system: 'soul-deal', set: 'emberforge.blackanvil', groups: [{ name: 'Strength', notation: '3d6', category: 'Attributes' }] },
      { name: 'Grix', system: 'dnd', groups: [{ name: 'Longsword', notation: '1d20+4', category: 'Attacks' }] },
      { name: 'Tray', system: 'none', groups: [{ name: 'd20', notation: '1d20' }] },
    ],
  });
  // system reads BEFORE set: it decides where the profile may be taken in hand
  assert.ok(text.includes("  'Rill':\n    system: 'soul-deal'\n    set: 'emberforge.blackanvil'\n"), text);
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.profiles.map((p) => p.system), ['soul-deal', 'dnd', 'none']);
  assert.equal(exportYaml({ profiles: parsed.profiles.map(asSeat) }), text);
});

t('a profile with no system parses — a seat prepared before systems existed still seats someone', () => {
  // Present-or-absent, like set: absent means "the receiving side decides",
  // which is the table's own system (js/profiles.js fromWire).
  const parsed = parsePortable("players:\n  'Alice':\n    pools:\n      Skills:\n        - 'Larceny': '1d20'\n");
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profiles[0].system ?? null, null, 'absent, not defaulted');
});

refuses("players:\n  'A':\n    system: 'pathfinder'\n    pools:\n",
  'is not one of soul-deal, dnd, none', 'an unknown system REFUSES at its line');

refuses("players:\n  'A':\n    system: 'dnd'\n    system: 'none'\n    pools:\n",
  'names a system twice', 'a doubled system key refuses');

refuses("players:\n  'A':\n    system:\n    pools:\n",
  'expected one system id', 'an empty system value refuses');

t('the unknown-system refusal names its line', () => {
  const parsed = parsePortable("table:\n  felt: 'ocean'\nplayers:\n  'A':\n    system: 'nope'\n    pools:\n");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 5, `the system line (got ${parsed.line})`);
});

t('a shelf may still be called "system" — the nesting is what makes that safe', () => {
  // The same collision the nesting exists to prevent (set/pools), now with a
  // third reserved key. A shelf sits at 6 spaces; reserved keys at 4.
  const text = exportYaml({
    profiles: [{ name: 'A', system: 'dnd', groups: [{ name: 'X', notation: '1d6', category: 'system' }] }],
  });
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profiles[0].system, 'dnd', 'the reserved key still read');
  assert.deepEqual(flat(parsed.profiles[0]), [{ name: 'X', notation: '1d6', category: 'system' }]);
  assert.equal(exportYaml({ profiles: parsed.profiles.map(asSeat) }), text);
});

t("the YAML traps hold for player names too (': ' and quotes)", () => {
  const text = exportYaml({ profiles: [{ name: "O'Ma: lley", groups: [{ name: 'A', notation: '1d6' }] }] });
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profiles[0].name, "O'Ma: lley");
  assert.equal(exportYaml({ profiles: parsed.profiles.map(asSeat) }), text);
});

t("'#' is banned in a player name but LEGAL in a table name — they are not the same string", () => {
  // server.js says it outright: a table name is never whisper-addressed, so
  // the ban that makes whisper addressing total does not reach it.
  const text = exportYaml({ table: { name: 'Bar # Grill' } });
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.table.name, 'Bar # Grill');
  assert.equal(exportYaml({ table: parsed.table }), text);
  assert.equal(parsePortable("players:\n  'Bar # Grill':\n    pools:\n").ok, false);
});

// ---- the reserved-key collision the nesting exists to prevent ---------------

t("a player may own shelves named 'set' and 'pools' — that is why pools: nests", () => {
  const parsed = parsePortable([
    'players:',
    "  'Alice':",
    "    set: 'std'",       // the reserved key, at depth 4
    '    pools:',           // the reserved key, at depth 4
    '      set:',           // a SHELF called set, at depth 6
    "        - 'A': '1d6'",
    '      pools:',         // a SHELF called pools, at depth 6
    "        - 'B': '1d8'",
  ].join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  const p = parsed.profiles[0];
  assert.equal(p.set, 'std', "the reserved set: is not confused by a shelf named 'set'");
  assert.deepEqual(flat(p), [
    { name: 'A', notation: '1d6', category: 'set' },
    { name: 'B', notation: '1d8', category: null }, // 'pools' IS the plain shelf
  ]);
});

// ---- caps: per player, and a separate document ceiling ---------------------

t('the pool cap is PER PLAYER: six players × 20 pools is not a refusal', () => {
  const lines = ['players:'];
  for (let p = 0; p < 6; p++) {
    lines.push(`  'P${p}':`, '    pools:', '      Attributes:');
    for (let i = 0; i < 20; i++) lines.push(`        - 'N${i}': '1d6'`);
  }
  const parsed = parsePortable(lines.join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profiles.length, 6);
  assert.equal(flat(parsed.profiles[5]).length, 20);
});

t('one player over 40 pools refuses at the line that breaks it', () => {
  const lines = ['players:', "  'Alice':", '    pools:', '      Attributes:'];
  for (let i = 0; i < 41; i++) lines.push(`        - 'N${i}': '1d6'`);
  const parsed = parsePortable(lines.join('\n'));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 45, 'the 41st pool line');
  assert.ok(parsed.error.includes('40'), parsed.error);
  assert.ok(parsed.error.includes('player'), parsed.error);
});

t('a FULL library round-trips: 32 profiles × 40 pools is not a refusal', () => {
  // The cap moved from 12 to 32 with the profile library (PROFILES §11): the
  // file is that library's durable copy, and a library that cannot round-trip
  // is not a backup. 32 × 40 = 1280 pools, which is exactly the document the
  // old 300 ceiling would have refused.
  const lines = ['players:'];
  for (let p = 0; p < 32; p++) {
    lines.push(`  'P${p}':`, "    system: 'dnd'", '    pools:', '      Attributes:');
    for (let i = 0; i < 40; i++) lines.push(`        - 'N${i}': '1d6'`);
  }
  const parsed = parsePortable(lines.join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profiles.length, 32);
  assert.equal(flat(parsed.profiles[31]).length, 40);
});

t('the document ceiling IS the structural maximum: 32 × 40 plus a full rack passes', () => {
  // 32 profiles × 40 pools + the top-level rack's own 40 is 1320, which is
  // exactly MAX_POOLS_PER_FILE — so the document cap can no longer refuse a
  // legal file. That is the point: at 300 it refused precisely the library
  // this format now exists to write. This test is the arithmetic, so raising
  // either other cap without raising this one becomes a failure here rather
  // than a player discovering their own backup will not load.
  const lines = ['players:'];
  for (let p = 0; p < 32; p++) {
    lines.push(`  'P${p}':`, '    pools:', '      Attributes:');
    for (let i = 0; i < 40; i++) lines.push(`        - 'N${i}': '1d6'`);
  }
  lines.push('pools:', '  Attributes:');
  for (let i = 0; i < 40; i++) lines.push(`    - 'M${i}': '1d6'`);
  const parsed = parsePortable(lines.join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profiles.length, 32);
  assert.equal(flat(parsed).length, 40, 'the exporting browser\'s own rack, full');
});

refuses(`players:\n${Array.from({ length: 33 }, (_, i) => `  'P${i}':\n    pools:`).join('\n')}\n`,
  'more than 32 players', 'more than thirty-two players refuses');

// ---- '#' in a player name: a REFUSAL, never a strip -------------------------

t("a '#' in a player name refuses by line — whisper addressing depends on the ban", () => {
  const parsed = parsePortable([
    'table:',
    "  felt: 'ocean'",
    'players:',
    "  'Bo#b':",
    '    pools:',
  ].join('\n'));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 4);
  assert.ok(parsed.error.includes('#'), parsed.error);
  assert.ok(/whisper/i.test(parsed.error), parsed.error);
});

refuses("players:\n  Bo#b:\n    pools:\n", '#', "a bare (unquoted) '#' name refuses too");
refuses(`players:\n  '${'x'.repeat(30)}':\n    pools:\n`, 'over 24', 'an over-long player name refuses');
refuses("players:\n  '':\n    pools:\n", 'needs a name', 'an unnamed player refuses');
refuses("players:\n  'Ann':\n    pools:\n  'ann':\n    pools:\n", 'twice', 'two players with one name refuse');
refuses("players:\n  'Ann':\n      Attributes:\n", 'under the player', 'a shelf outside a player\'s pools: refuses');
refuses("players:\n  'Ann':\n    hp: 12\n", 'set', 'an unknown key inside a player refuses');
refuses("players:\n    pools:\n", 'outside any player', 'a player key with no player refuses');

t("a player's unknown dice-set id falls closed, like a pool's — the seat survives", () => {
  const parsed = parsePortable("players:\n  'Ann':\n    set: 'no.such'\n    pools:\n");
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profiles[0].set ?? null, null);
});

// ---- table: maps 1:1 onto the room's settings ------------------------------

t("table: parses, bare or quoted, and 'name' is the room's tableName", () => {
  const parsed = parsePortable([
    'table:',
    "  name: 'Session 3'",
    '  felt: obsidian',      // hand-written bare scalar
    "  system: 'dnd'",
    "  zoom: 'close'",
  ].join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.table, { name: 'Session 3', felt: 'obsidian', system: 'dnd', zoom: 'close' });
  assert.deepEqual(parsed.shelves, []);
});

t('an unknown felt refuses by line — a silent fallback is a table nobody prepared', () => {
  const parsed = parsePortable(['table:', "  name: 'Night'", "  felt: 'chartreuse'"].join('\n'));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 3);
  assert.ok(parsed.error.includes('felt'), parsed.error);
});

refuses("table:\n  system: 'gurps'\n", 'system', 'an unknown system refuses');
refuses("table:\n  zoom: 'huge'\n", 'zoom', 'an unknown zoom refuses');
refuses('table:\n  experiences: []\n', 'unknown table key', 'experiences is deliberately out of the format');
refuses("table:\n  felt: 'ocean'\n  felt: 'plum'\n", 'twice', 'a repeated table key refuses');
refuses(`table:\n  name: '${'x'.repeat(30)}'\n`, 'over 28', 'an over-long table name refuses');
refuses("table:\n  felt: 'ocean' extra\n", 'one value', 'trailing text after a table value refuses');

t("an empty table name carries nothing — it does not round-trip as a key", () => {
  const parsed = parsePortable("table:\n  name: ''\n  felt: 'plum'\n");
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.table, { felt: 'plum' });
  assert.equal(exportYaml({ table: parsed.table }), exportYaml({ table: { felt: 'plum' } }));
});

// ---- forward tolerance: skip an unknown SECTION, stay strict inside a known one

t('an unknown top-level section skips with a warning; the rest of the file lands', () => {
  const parsed = parsePortable([
    'pools:',
    '  Pools:',
    "    - 'A': '1d6'",
    'characters:',        // line 4 — a section this version does not know
    '  Alice:',
    '    hp: 12',
    '\tnot even spaces',  // an unknown block's body is not examined at all
    'settings:',
    '  sound: false',
    '  numbers: true',
  ].join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.warnings, ['line 4: skipped unknown section "characters:"']);
  assert.deepEqual(flat(parsed), [{ name: 'A', notation: '1d6', category: null }]);
  assert.deepEqual(parsed.settings, { sound: false, numbers: true });
});

t('skipping an unknown SECTION is not tolerating garbage inside a known one', () => {
  const parsed = parsePortable([
    'characters:', '  anything: at all',
    'pools:', '  Pools:', '    - A: not dice',
  ].join('\n'));
  assert.equal(parsed.ok, false, 'a known section stays strict to the character');
  assert.equal(parsed.line, 5);
  assert.ok(parsed.error.includes('notation'), parsed.error);
});

t('a file of nothing but unknown sections refuses, and says how many it skipped', () => {
  const parsed = parsePortable('characters:\n  Alice: 1\nscenes:\n  - a\n');
  assert.equal(parsed.ok, false);
  assert.ok(parsed.error.includes('2 unknown sections skipped'), parsed.error);
});

// ---- one profile → the shape planImport already consumes --------------------

t('profileToImport hands planImport a whole parsed shape, settings included', () => {
  const parsed = parsePortable([
    'players:',
    "  'Alice':",
    '    pools:',
    '      Attributes:',
    "        - 'Body': '3d6'",
    "        - 'Grit': '2d8'",
  ].join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  const one = profileToImport(parsed.profiles[0]);
  assert.deepEqual(one.settings, {}, 'a seat carries no just-you settings to flip');
  const plan = planImport([{ id: 7, name: 'Body', notation: '1d6' }], one);
  assert.equal(plan.unchanged, 0);
  assert.deepEqual(plan.updates, [{ id: 7, name: 'Body', notation: '3d6', category: 'Attributes' }]);
  assert.deepEqual(plan.adds, [{ name: 'Grit', notation: '2d8', category: 'Attributes' }]);
  assert.deepEqual(plan.settings, {});
  // and a seat with nothing in it plans nothing rather than throwing
  const none = planImport([], profileToImport(undefined));
  assert.deepEqual([none.adds.length, none.updates.length, none.unchanged], [0, 0, 0]);
});

// ---- the name uniqueness the RESTORE leans on (C15 / CUJ13) -----------------

t('a repeated PLAYER is refused at its line — uniqueness inside players: holds', () => {
  const parsed = parsePortable([
    'players:',
    "  'Nessa':", '    pools:',
    "  'Nessa':", '    pools:',
  ].join('\n'));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 4);
  assert.ok(parsed.error.includes('appears twice'), parsed.error);
});

t('but `profile:` and `players:` are NOT unique BETWEEN them — the seam, pinned', () => {
  // ROADMAP C15 claims "the file's names are already unique by parsePortable"
  // and hangs a whole-library REPLACE on it. Inside `players:` that is true
  // (above). The `profile:` key naming the top-level rack is a fourth name
  // with no cross-check against it, so a hand-edited file can legally offer
  // the same character twice — verified 2026-08-14, and the reason
  // js/profiles.js's rebuildStore REFUSES such a file rather than trusting the
  // claim and silently landing a 'Nessa 2'. This test stands so that the day
  // the parser closes the seam, that refusal is known to have become dead code
  // rather than discovered as it years later.
  const parsed = parsePortable([
    'profile:', "  name: 'Nessa'",
    'players:', "  'Nessa':", '    pools:',
    'pools:', '  Pools:', "    - 'A': '1d6'",
  ].join('\n'));
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.profile.name, 'Nessa');
  assert.deepEqual(parsed.profiles.map((p) => p.name), ['Nessa'],
    'both sections name the same character and the parser is content');
});

t("this app's own export can never produce that collision", () => {
  // `profile:` is the rack in hand and `players:` is everyone ELSE (main.js
  // filters the active id out), so the two sections are disjoint by
  // construction — which is why the seam has never been reachable from a file
  // this app wrote, only from one a person edited.
  const text = exportYaml({
    groups: [{ id: 1, name: 'Body', notation: '3d6' }],
    profile: { name: 'Nessa', system: 'soul-deal' },
    profiles: [
      { name: 'Bram', system: 'soul-deal', groups: [{ name: 'Grit', notation: '2d8' }] },
      { name: 'Tola', system: 'dnd', groups: [] },
    ],
  });
  const parsed = parsePortable(text);
  assert.equal(parsed.ok, true, parsed.error);
  // the merged list a restore would rebuild from: the top-level rack, then the
  // seats — exactly what main.js's importableProfiles() assembles
  const all = [parsed.profile.name, ...parsed.profiles.map((p) => p.name)];
  assert.deepEqual(all, ['Nessa', 'Bram', 'Tola']);
  assert.equal(new Set(all.map((s) => s.toLowerCase())).size, all.length, 'no duplicate to refuse');
});

t('an empty document refuses, exactly as a comments-only one does', () => {
  // The two used to disagree at the FILE door — a comments-only file refused
  // and a zero-byte file read as a clean, silent success (blank box, blank
  // status, verdict ok). The parser has always agreed with itself here; C15
  // makes main.js's file door agree with the parser.
  for (const text of ['', '   \n\n', '# just a comment\n', '#\n# two\n']) {
    const parsed = parsePortable(text);
    assert.equal(parsed.ok, false, JSON.stringify(text));
    assert.equal(parsed.line, 0);
  }
});

// ---- C22: the file carries its version -------------------------------------

const withVersion = (stamp, body) => [
  'version:',
  `  schema: '${stamp}'`,
  ...body,
].join('\n') + '\n';
const BODY = ['pools:', '  Pools:', "    - 'Body': '3d6'", 'settings:', '  sound: true', '  numbers: false'];

t('C22: a file stamped with THIS build imports, and reports its stamp', () => {
  const parsed = parsePortable(withVersion(SCHEMA_STAMP, BODY));
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.version, { epoch: EPOCH, major: MAJOR, minor: 0 });
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.shelves.length, 1, 'and the document still parses whole');
});

t('C22: a LOWER major loads normally — older data is a migration, not a refusal', () => {
  const parsed = parsePortable(withVersion(`${EPOCH}.${MAJOR}.0`, BODY));
  assert.equal(parsed.ok, true, parsed.error);
  // A minor difference changes nothing at all: nothing branches on minor.
  const older = parsePortable(withVersion(`${EPOCH}.${MAJOR}.${0}`, BODY));
  assert.equal(older.ok, true, older.error);
});

t('C22: a HIGHER major is REFUSED at its line, and nothing is imported', () => {
  const parsed = parsePortable(withVersion(`${EPOCH}.${MAJOR + 1}.0`, BODY));
  assert.equal(parsed.ok, false, 'a file newer than this reader must not import');
  assert.equal(parsed.line, 2, 'refused at the line the version sits on');
  assert.match(parsed.error, /newer version/i);
  assert.match(parsed.error, /silently drop/i, 'and says WHY, not just that it said no');
  assert.equal('shelves' in parsed, false, 'no partial document comes back');
});

t('C22: a different EPOCH with no converter refuses rather than half-reading', () => {
  const parsed = parsePortable(withVersion(`${EPOCH + 1}.0.0`, BODY));
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /different data model/);
});

t('C22: an unreadable stamp is refused, and a nonsense key inside only warns', () => {
  assert.equal(parsePortable(withVersion('banana', BODY)).ok, false, 'junk in the version field is not a version');
  const odd = parsePortable(['version:', "  schema: '" + SCHEMA_STAMP + "'", '  future: 1', ...BODY].join('\n') + '\n');
  assert.equal(odd.ok, true, odd.error);
  assert.equal(odd.warnings.length, 1, 'an unknown key INSIDE version: warns rather than refusing');
});

t('C22: an OLD reader skips the version block — the emitted section is section-shaped', () => {
  // The compatibility claim the section shape exists for, proved the only way
  // it can be proved here: the block obeys the skip rule (column-0 key ending
  // in ':', body indented), which is what a pre-C22 parsePortable does with
  // any section it does not know.
  const emitted = exportYaml({ groups: [{ id: 1, name: 'Body', notation: '3d6' }], settings: {} });
  const lines = emitted.split('\n');
  const at = lines.indexOf('version:');
  assert.ok(at > 0, 'the file carries a version: section');
  assert.match(lines[at + 1], /^ {2}schema: '\d+\.\d+\.\d+'$/, 'its body is indented — an old reader skips to the next column-0 line');
  assert.equal(lines[at + 2].startsWith(' '), false, 'and the block is exactly one line long');
});

if (process.exitCode) process.exit(process.exitCode);
console.log(`all ${n} portable tests pass`);
