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

// tests/profiles.test.mjs — the profile library (js/profiles.js), pinning
// docs/PROFILES.md §11.
//
// The load-bearing claims, in the order the design leans on them:
//
//  1. A SWITCH LOSES NOTHING. Both racks are already in the store, so taking a
//     profile in hand is one pointer and one timestamp. The test for that is
//     structural: after any sequence of switches, every profile still holds
//     the pools it held. This is what replaced Tier G's stash-and-verify, and
//     it is the whole reason the stash could be deleted rather than ported.
//  2. LAST-USED-PER-SYSTEM IS DERIVED, never stored. Three tables in three
//     systems, visited in any order, each hand back the profile that table
//     last saw — with no map of pointers to fall out of date when a profile is
//     deleted or a table's system is flipped under the player (X1).
//  3. THE STORE SELF-HEALS. A hand-edited, half-cleared or duplicated key
//     yields a usable library rather than an exception on the boot path.
//  4. MIGRATION GAINS DATA. A browser that died mid-swap held the operator's
//     own rack in the stash and somebody else's in the rack; the old boot
//     guard restored one and dropped the other. Both become profiles here.
//  5. `#` IS REFUSED AT THE DOOR, because a profile name becomes a display
//     name and a display name is a whisper address.
//
// The system list is MIRRORED in js/profiles.js (it must run under plain Node,
// and js/meanings.js drags the chart in behind it), so the first test pins the
// mirror against the real thing: a drift is a failure here, not a discovery in
// a picker that silently offers nothing.

import assert from 'node:assert/strict';
import {
  MAX_PROFILES, MAX_POOLS, SYSTEM_IDS, DEFAULT_SYSTEM_ID, knownSystem,
  emptyStore, normalizeStore, profilesOf, findProfile, activeProfile,
  profilesFor, lastUsedFor, isFull, nameProfile, uniqueName,
  addProfile, renameProfile, deleteProfile, setActive, writeActivePools,
  setActiveSystem, setProfileSet, migrateLegacy, rebuildStore, toWire, fromWire,
} from '../js/profiles.js';
import { SYSTEMS, DEFAULT_SYSTEM, SYSTEM_IDS as MEANINGS_SYSTEM_IDS } from '../js/meanings.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// A monotonic stand-in for Date.now(), so recency is exact rather than raced.
let clock = 0;
const tick = () => ++clock;

const pool = (name, notation = '1d6', category = null) => ({
  name, notation, ...(category ? { category } : {}),
});
const names = (list) => list.map((p) => p.name);

// A store holding one profile per system, taken in hand in a known order.
function threeSystems() {
  const store = emptyStore();
  addProfile(store, { name: 'Rill', system: 'soul-deal', pools: [pool('Strength', '3d6')], at: tick() });
  addProfile(store, { name: 'Grix', system: 'dnd', pools: [pool('Longsword', '1d20+4')], at: tick() });
  addProfile(store, { name: 'Tray', system: 'none', pools: [pool('d20', '1d20')], at: tick() });
  return store;
}

// ---- the mirror -------------------------------------------------------------

t('the system list has ONE owner — identity, not equality', () => {
  // This guard used to compare CONTENTS, because the list was copied by hand
  // here. It caught its own copy the day a fourth system was added — and by
  // catching it, showed that the copies in server.js and js/portable.js had
  // no guard at all and had already gone stale.
  //
  // Now the list is imported, so the check is IDENTITY: the same array object,
  // which equality could never tell apart from a fresh copy that happens to
  // match today. Re-introducing a literal here turns this red immediately
  // rather than on the next system.
  assert.strictEqual(SYSTEM_IDS, MEANINGS_SYSTEM_IDS,
    'js/profiles.js must re-export meanings.js SYSTEM_IDS, never re-state it');
  assert.deepEqual(SYSTEM_IDS, Object.keys(SYSTEMS), '…and it is the profile registry');
  assert.equal(DEFAULT_SYSTEM_ID, DEFAULT_SYSTEM);
});

t('an unknown system id is not known', () => {
  assert.equal(knownSystem('dnd'), 'dnd');
  assert.equal(knownSystem('pathfinder'), null);
  assert.equal(knownSystem(undefined), null);
  assert.equal(knownSystem(''), null);
});

t("Joe's cap is 32, and the rack cap is the one the rest of the tree uses", () => {
  assert.equal(MAX_PROFILES, 32);
  assert.equal(MAX_POOLS, 40);
});

// ---- names ------------------------------------------------------------------

t("'#' in a profile name is REFUSED, never stripped", () => {
  // The one place the library could silently misdirect a whisper: a profile
  // name becomes a display name (GOALS notation-totality, server.js cleanName).
  const bad = nameProfile('Bo#b');
  assert.equal(bad.ok, false);
  assert.ok(bad.error.includes('#'), bad.error);
  assert.equal(nameProfile('Bob').name, 'Bob');
});

t('a nameless profile is refused, whitespace included', () => {
  for (const raw of ['', '   ', null, undefined, 42]) {
    assert.equal(nameProfile(raw).ok, false, JSON.stringify(raw));
  }
});

t('a name over 24 characters is cut, not refused', () => {
  const got = nameProfile('x'.repeat(40));
  assert.equal(got.ok, true);
  assert.equal(got.name.length, 24);
});

t('uniqueName is the copy grammar: Bram, Bram 2, Bram 3', () => {
  const store = emptyStore();
  addProfile(store, { name: 'Bram', system: 'dnd' });
  assert.equal(uniqueName(store, 'Bram'), 'Bram 2');
  addProfile(store, { name: 'Bram', system: 'dnd' });
  assert.deepEqual(names(profilesOf(store)), ['Bram', 'Bram 2']);
  assert.equal(uniqueName(store, 'Bram'), 'Bram 3');
  assert.equal(uniqueName(store, 'Bram', { exceptId: store.profiles[0].id }), 'Bram',
    'renaming a profile to its own name is not a collision');
});

t('uniqueName keeps the suffix inside the 24-char cap', () => {
  const store = emptyStore();
  const long = 'y'.repeat(24);
  addProfile(store, { name: long, system: 'dnd' });
  const next = uniqueName(store, long);
  assert.ok(next.length <= 24, `got ${next.length} chars`);
  assert.ok(next.endsWith(' 2'), next);
});

// ---- the switch loses nothing (claim 1) -------------------------------------

t('a switch is a pointer move — every other profile keeps its pools', () => {
  const store = threeSystems();
  const before = profilesOf(store).map((p) => ({ id: p.id, pools: JSON.stringify(p.pools) }));
  for (const id of ['p2', 'p3', 'p1', 'p3', 'p2']) {
    assert.equal(setActive(store, id, tick()).ok, true, id);
    assert.equal(store.activeId, id);
  }
  for (const snap of before) {
    assert.equal(JSON.stringify(findProfile(store, snap.id).pools), snap.pools,
      `${snap.id} kept its rack across five switches`);
  }
});

t('the rack writes back to whoever is holding it, and only them', () => {
  const store = threeSystems();
  setActive(store, 'p2', tick());
  writeActivePools(store, [pool('Greataxe', '1d12+3', 'Attacks')]);
  assert.deepEqual(names(findProfile(store, 'p2').pools), ['Greataxe']);
  assert.deepEqual(names(findProfile(store, 'p1').pools), ['Strength'], 'p1 untouched');
  assert.deepEqual(names(findProfile(store, 'p3').pools), ['d20'], 'p3 untouched');
});

t('the store never aliases the caller\'s live rack array', () => {
  // main.js hands its module-level `groups` in; if the store kept the same
  // array, a later in-place edit would silently rewrite a parked profile.
  const store = emptyStore();
  addProfile(store, { name: 'A', system: 'dnd', pools: [pool('X')] });
  const live = [pool('Y')];
  writeActivePools(store, live);
  live.push(pool('Z'));
  assert.deepEqual(names(activeProfile(store).pools), ['Y'], 'the push did not reach the store');
});

t('setActive refuses an id that names nobody, and changes nothing', () => {
  const store = threeSystems();
  const was = store.activeId;
  const got = setActive(store, 'p99', tick());
  assert.equal(got.ok, false);
  assert.equal(store.activeId, was);
});

// ---- last-used per system is derived (claim 2) ------------------------------

t('each system hands back the profile that system last saw', () => {
  const store = threeSystems();
  // A second Soul Deal character, taken in hand after Rill.
  addProfile(store, { name: 'Sona', system: 'soul-deal', at: tick() });
  assert.equal(lastUsedFor(store, 'soul-deal'), findProfile(store, store.activeId).id);
  assert.equal(findProfile(store, lastUsedFor(store, 'soul-deal')).name, 'Sona');
  assert.equal(findProfile(store, lastUsedFor(store, 'dnd')).name, 'Grix');
  assert.equal(findProfile(store, lastUsedFor(store, 'none')).name, 'Tray');

  // Go to the Soul Deal table and pick Rill; come back and Rill is what that
  // table hands you, while the other two systems are unmoved (P8/P9).
  setActive(store, 'p1', tick());
  assert.equal(findProfile(store, lastUsedFor(store, 'soul-deal')).name, 'Rill');
  assert.equal(findProfile(store, lastUsedFor(store, 'dnd')).name, 'Grix');
  assert.equal(findProfile(store, lastUsedFor(store, 'none')).name, 'Tray');
});

t('a system with no profile hands back nothing rather than a wrong one', () => {
  const store = emptyStore();
  addProfile(store, { name: 'Rill', system: 'soul-deal', at: tick() });
  assert.equal(lastUsedFor(store, 'dnd'), null);
  assert.deepEqual(profilesFor(store, 'dnd'), []);
});

t('a flipped table system cannot stale the answer (X1)', () => {
  // The defect a stored lastBySystem map has and a derived answer cannot: the
  // system changes under the player, nothing is swapped, and the NEW system's
  // last-used is still the profile that system actually last saw.
  const store = threeSystems();
  setActive(store, 'p1', tick()); // Rill (soul-deal) is in hand
  // ... the table flips to dnd. Nothing is swapped; nothing is written.
  assert.equal(activeProfile(store).name, 'Rill');
  assert.equal(findProfile(store, lastUsedFor(store, 'dnd')).name, 'Grix',
    'the dnd answer is Grix, not the Soul Deal profile in hand');
});

t('profilesFor is most-recent-first and filtered to one system', () => {
  const store = emptyStore();
  addProfile(store, { name: 'One', system: 'dnd', at: 10 });
  addProfile(store, { name: 'Two', system: 'dnd', at: 30 });
  addProfile(store, { name: 'Three', system: 'dnd', at: 20 });
  addProfile(store, { name: 'Other', system: 'none', at: 99 });
  assert.deepEqual(names(profilesFor(store, 'dnd')), ['Two', 'Three', 'One']);
  assert.deepEqual(names(profilesFor(store, 'none')), ['Other']);
});

t('ties break by name, so the list never reorders itself between paints', () => {
  const store = emptyStore();
  addProfile(store, { name: 'Zed', system: 'dnd', at: 5 });
  addProfile(store, { name: 'Ada', system: 'dnd', at: 5 });
  assert.deepEqual(names(profilesFor(store, 'dnd')), ['Ada', 'Zed']);
});

// ---- caps -------------------------------------------------------------------

t('the 32nd profile lands and the 33rd is refused by name (X3)', () => {
  const store = emptyStore();
  for (let i = 0; i < MAX_PROFILES; i++) {
    assert.equal(addProfile(store, { name: `P${i}`, system: 'dnd' }).ok, true, `P${i}`);
  }
  assert.equal(isFull(store), true);
  const over = addProfile(store, { name: 'P32', system: 'dnd' });
  assert.equal(over.ok, false);
  assert.ok(over.error.includes('32'), over.error);
  assert.equal(profilesOf(store).length, MAX_PROFILES);
});

t('a rack over 40 pools is cut at the cap rather than refused', () => {
  const store = emptyStore();
  addProfile(store, { name: 'A', system: 'dnd', pools: Array.from({ length: 60 }, (_, i) => pool(`N${i}`)) });
  assert.equal(activeProfile(store).pools.length, MAX_POOLS);
});

// ---- delete -----------------------------------------------------------------

t('deleting the profile in hand hands you the next one for the SAME system', () => {
  const store = threeSystems();
  addProfile(store, { name: 'Sona', system: 'soul-deal', at: tick() });
  setActive(store, 'p1', tick()); // Rill
  const got = deleteProfile(store, 'p1');
  assert.equal(got.ok, true);
  assert.equal(activeProfile(store).name, 'Sona', 'same system, not whatever came first');
});

t('deleting the last profile of a system still leaves a rack in your hands', () => {
  const store = threeSystems();
  setActive(store, 'p2', tick()); // Grix, the only dnd profile
  assert.equal(deleteProfile(store, 'p2').ok, true);
  assert.ok(activeProfile(store), 'something is in hand');
  assert.equal(profilesFor(store, 'dnd').length, 0);
});

t('the only profile cannot be deleted — the rack has to point somewhere', () => {
  const store = emptyStore();
  addProfile(store, { name: 'Only', system: 'dnd' });
  const got = deleteProfile(store, store.activeId);
  assert.equal(got.ok, false);
  assert.ok(got.error.includes('only profile'), got.error);
  assert.equal(profilesOf(store).length, 1);
});

t('deleting a parked profile leaves the one in hand alone', () => {
  const store = threeSystems();
  setActive(store, 'p1', tick());
  assert.equal(deleteProfile(store, 'p3').ok, true);
  assert.equal(activeProfile(store).name, 'Rill');
});

// ---- rename, system, set ----------------------------------------------------

t('rename dedupes and refuses the same things creation does', () => {
  const store = emptyStore();
  addProfile(store, { name: 'Rill', system: 'dnd' });
  addProfile(store, { name: 'Grix', system: 'dnd' });
  assert.equal(renameProfile(store, 'p2', 'Rill').name, 'Rill 2', 'a collision dedupes');
  assert.equal(renameProfile(store, 'p2', 'Bo#b').ok, false, "'#' is refused on rename too");
  assert.equal(renameProfile(store, 'p9', 'X').ok, false, 'an unknown id is refused');
  assert.equal(findProfile(store, 'p2').name, 'Rill 2', 'the refusals changed nothing');
});

t('a profile can be re-bound to another system, and only known ones stick', () => {
  const store = threeSystems();
  setActive(store, 'p1', tick());
  assert.equal(setActiveSystem(store, 'dnd').system, 'dnd');
  assert.equal(findProfile(store, 'p1').system, 'dnd');
  assert.equal(setActiveSystem(store, 'pathfinder').system, DEFAULT_SYSTEM_ID);
});

t("a dice set rides the profile, and 'std' means no override", () => {
  const store = threeSystems();
  setProfileSet(store, 'p1', 'emberforge.blackanvil');
  assert.equal(findProfile(store, 'p1').set, 'emberforge.blackanvil');
  setProfileSet(store, 'p1', 'std');
  assert.equal('set' in findProfile(store, 'p1'), false, "'std' is absence, as it is everywhere else");
});

// ---- the store self-heals (claim 3) ----------------------------------------

t('a store of nothing at all normalizes to an empty library', () => {
  for (const junk of [null, undefined, 42, 'nope', [], { profiles: 'no' }]) {
    const store = normalizeStore(junk);
    assert.deepEqual(profilesOf(store), [], JSON.stringify(junk));
    assert.equal(store.activeId, null);
  }
});

t('junk profiles are dropped and good ones survive beside them', () => {
  const store = normalizeStore({
    profiles: [
      null, 42, [], { name: '' }, { name: '   ' },
      { id: 'pa', name: 'Good', system: 'dnd', pools: [pool('X'), null, { notation: 5 }, pool('Y')] },
    ],
  });
  assert.deepEqual(names(profilesOf(store)), ['Good']);
  assert.deepEqual(names(profilesOf(store)[0].pools), ['X', 'Y'], 'unreadable pools dropped');
});

t('an activeId naming nobody falls to the first profile', () => {
  const store = normalizeStore({ activeId: 'ghost', profiles: [{ id: 'pa', name: 'A' }, { id: 'pb', name: 'B' }] });
  assert.equal(store.activeId, 'pa');
});

t('duplicate ids and duplicate names each collapse without throwing', () => {
  const store = normalizeStore({
    profiles: [
      { id: 'pa', name: 'A' }, { id: 'pa', name: 'B' },
      { id: 'pc', name: 'a' }, { id: 'pd', name: 'C' },
    ],
  });
  assert.deepEqual(names(profilesOf(store)), ['A', 'B', 'C'], "'a' collides with 'A', first wins");
  assert.equal(new Set(profilesOf(store).map((p) => p.id)).size, 3, 'ids are unique');
});

t('seq clears every stored id, so a fresh profile cannot collide with a parked one', () => {
  const store = normalizeStore({ seq: 1, profiles: [{ id: 'p7', name: 'Seven' }] });
  assert.equal(store.seq, 7, 'the stored id raised the counter');
  addProfile(store, { name: 'New', system: 'dnd' });
  assert.equal(new Set(profilesOf(store).map((p) => p.id)).size, 2);
});

t('a store over the cap is clamped rather than refused at boot', () => {
  const store = normalizeStore({
    profiles: Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
  });
  assert.equal(profilesOf(store).length, MAX_PROFILES);
});

t('a name carrying # is STRIPPED at boot, where no human is standing there', () => {
  // The asymmetry with nameProfile is deliberate: the loud refusal belongs at
  // the doors a person operates; the boot path has to produce a usable library.
  const store = normalizeStore({ profiles: [{ id: 'pa', name: 'Bo#b' }] });
  assert.equal(profilesOf(store)[0].name, 'Bob');
});

t('an unknown system falls back and the profile SURVIVES (X10)', () => {
  const store = normalizeStore({ profiles: [{ id: 'pa', name: 'Future', system: 'pathfinder', pools: [pool('X')] }] });
  assert.equal(profilesOf(store).length, 1, 'a metadata word does not delete a character');
  assert.equal(profilesOf(store)[0].system, DEFAULT_SYSTEM_ID);
  assert.deepEqual(names(profilesOf(store)[0].pools), ['X'], 'the work is intact');
});

t('normalizeStore is a fixed point over its own output', () => {
  const store = threeSystems();
  const once = normalizeStore(JSON.parse(JSON.stringify(store)));
  const twice = normalizeStore(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
  assert.deepEqual(names(profilesOf(once)), ['Rill', 'Grix', 'Tray'], 'order is preserved');
});

// ---- …and the healing SAYS WHAT IT COST (C15) -------------------------------
//
// Every drop above is correct and every one of them was silent, and main.js
// then persisted the healed store on the first paint — which is what turned a
// display defect into data loss, because until that write the dropped records
// were still on disk. The report is what lets the boot path refuse to write
// and name what is missing.

t('a clean store reports no loss at all', () => {
  const report = {};
  normalizeStore(JSON.parse(JSON.stringify(threeSystems())), report);
  assert.equal(report.any, false, 'a library that loads whole must not raise a notice');
  assert.deepEqual([report.overflow, report.duplicates], [[], []]);
  assert.deepEqual([report.unreadable, report.pools], [0, 0]);
});

t('the report NAMES the profiles that did not fit, rather than counting them', () => {
  const report = {};
  const store = normalizeStore({
    profiles: Array.from({ length: MAX_PROFILES + 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
  }, report);
  assert.equal(profilesOf(store).length, MAX_PROFILES, 'the store is unchanged by reporting');
  assert.deepEqual(report.overflow, ['P32', 'P33', 'P34'],
    'a count is a number the player cannot check; these are the same fact they can');
  assert.equal(report.any, true);
});

t('duplicates, unreadable records and over-cap pools each report separately', () => {
  const report = {};
  normalizeStore({
    profiles: [
      { id: 'pa', name: 'A', pools: Array.from({ length: MAX_POOLS + 4 }, (_, i) => pool(`X${i}`)) },
      { id: 'pb', name: 'a' },            // collapses into 'A'
      null, { name: '   ' },              // never could have been a profile
    ],
  }, report);
  assert.deepEqual(report.duplicates, ['a']);
  assert.equal(report.unreadable, 2);
  assert.equal(report.pools, 4, 'pools dropped from a profile that DID survive still count');
  assert.equal(report.any, true);
});

t('a version we do not know is reported but is NOT a loss', () => {
  // C22 owns reading this. What must not happen meanwhile is a data-loss
  // notice over a key that loaded every byte it had — the version differing is
  // not, by itself, anything the player lost.
  const report = {};
  normalizeStore({ v: 99, profiles: [{ id: 'pa', name: 'A' }] }, report);
  assert.equal(report.version, 99);
  assert.equal(report.any, false, 'a differently-versioned key that loads whole lost nothing');
  const same = {};
  normalizeStore({ v: 1, profiles: [{ id: 'pa', name: 'A' }] }, same);
  assert.equal(same.version, null, 'our own version is not news');
});

t('normalizeStore without a report behaves exactly as it always did', () => {
  const raw = { profiles: [{ id: 'pa', name: 'A' }, { id: 'pb', name: 'a' }, null] };
  assert.deepEqual(
    normalizeStore(JSON.parse(JSON.stringify(raw))),
    normalizeStore(JSON.parse(JSON.stringify(raw)), {}),
    'the report is an out-parameter, never an input to the result',
  );
});

// ---- restore: a whole library rebuilt from a file (C15 / CUJ13) -------------
//
// The three defects this exists to remove, each pinned below:
//   1. `Add all N` dedupes, so a restored 'Nessa' lands as 'Nessa 2'.
//   2. It adds INTO a library that already holds a dealt profile, so 32 of 32
//      lands 31.
//   3. Nothing carries the file's `profile:` pointer, so the wrong character
//      is in hand at the end.

const wire = (name, system = 'soul-deal', pools = [pool('X')]) => ({ name, system, pools });

t('rebuildStore keeps the file\'s names EXACTLY — no uniqueName anywhere', () => {
  const got = rebuildStore([wire('Nessa'), wire('Bram'), wire('Nessa 2')]);
  assert.equal(got.ok, true, got.error);
  assert.deepEqual(names(profilesOf(got.store)), ['Nessa', 'Bram', 'Nessa 2'],
    'the whole point: a restore that renames has not restored anything');
});

t('a full 32-profile file fits exactly, because it starts from empty', () => {
  const file = Array.from({ length: MAX_PROFILES }, (_, i) => wire(`P${i}`));
  const got = rebuildStore(file);
  assert.equal(got.ok, true, got.error);
  assert.equal(profilesOf(got.store).length, MAX_PROFILES, 'all 32, not 31');
  // and one more is refused out loud rather than landing 32 of 33
  const over = rebuildStore([...file, wire('P32')]);
  assert.equal(over.ok, false);
  assert.ok(over.error.includes('33'), over.error);
  assert.ok(over.error.includes(String(MAX_PROFILES)), over.error);
});

t("the file's `profile:` key decides what is in hand", () => {
  const got = rebuildStore([wire('Nessa'), wire('Bram'), wire('Tola')], { activeName: 'Bram', now: 500 });
  assert.equal(got.ok, true, got.error);
  assert.equal(activeProfile(got.store).name, 'Bram');
  assert.equal(got.named, true);
  assert.equal(activeProfile(got.store).at, 500, 'the one in hand is the only thing with a time on it');
  assert.equal(profilesOf(got.store).find((p) => p.name === 'Nessa').at, 0,
    'a file records no recency, so inventing an order would make profilesFor sort by a fiction');
});

t('a file naming no profile in hand hands back the first, and says so', () => {
  for (const asked of [null, '', '   ', 'Nobody']) {
    const got = rebuildStore([wire('Nessa'), wire('Bram')], { activeName: asked });
    assert.equal(got.ok, true, got.error);
    assert.equal(activeProfile(got.store).name, 'Nessa', JSON.stringify(asked));
    assert.equal(got.named, false, 'the caller can tell the pointer was a fallback');
  }
});

t('a name repeated across the file is REFUSED, not deduped', () => {
  // parsePortable enforces uniqueness inside `players:` but not between
  // `players:` and the `profile:` key naming the top-level rack — verified
  // 2026-08-14. There is no store this could build that such a file describes,
  // and renaming one silently is the exact defect C15 removes.
  const got = rebuildStore([wire('Nessa'), wire('Bram'), wire('nessa')]);
  assert.equal(got.ok, false);
  assert.ok(got.error.includes('Nessa'), got.error);
  assert.ok(got.error.includes('twice'), got.error);
});

t('rebuildStore refuses a nameless record and an empty file, naming why', () => {
  assert.equal(rebuildStore([]).ok, false);
  assert.equal(rebuildStore(null).ok, false);
  assert.ok(rebuildStore([]).error.includes('no profiles'));
  const nameless = rebuildStore([wire('Nessa'), { pools: [pool('X')] }]);
  assert.equal(nameless.ok, false);
  assert.ok(nameless.error.includes('needs a name'), nameless.error);
  const hashed = rebuildStore([{ name: 'Bo#b', pools: [] }]);
  assert.equal(hashed.ok, false, 'a whisper address is refused here as at every other name door');
});

t('rebuildStore carries system, dice set and pools through untouched', () => {
  const got = rebuildStore([
    { name: 'Grix', system: 'dnd', set: 'emberforge.blackanvil', pools: [pool('Longsword', '1d20+4', 'Attacks')] },
    { name: 'Tray', pools: [pool('d20', '1d20')] },
  ], { fallbackSystem: 'none' });
  assert.equal(got.ok, true, got.error);
  assert.deepEqual(toWire(findProfile(got.store, got.store.profiles[0].id)), {
    name: 'Grix', system: 'dnd', set: 'emberforge.blackanvil',
    pools: [{ name: 'Longsword', notation: '1d20+4', category: 'Attacks' }],
  });
  assert.equal(profilesOf(got.store)[1].system, 'none',
    'a record naming no system takes the table it is being restored at');
});

t('rebuildStore touches nothing outside the store it returns', () => {
  // It is a pure builder on purpose: the caller writes the result to disk and
  // only then points the app at it, so a browser that refuses the write leaves
  // the old library whole in memory AND on disk.
  const mine = threeSystems();
  const before = JSON.parse(JSON.stringify(mine));
  const got = rebuildStore([wire('Nessa')]);
  assert.equal(got.ok, true, got.error);
  assert.deepEqual(mine, before, 'no live store was mutated');
  assert.notEqual(got.store, mine);
});

t('a rebuilt store is a fixed point under normalizeStore', () => {
  // The restore writes this to the boot key, so the next boot must read back
  // exactly what was written — a rebuild that normalized to something smaller
  // would lose characters on the reload after the restore, which is the
  // failure mode this whole item exists to close.
  const got = rebuildStore([wire('Nessa'), wire('Bram', 'dnd')], { activeName: 'Bram', now: 7 });
  const report = {};
  const back = normalizeStore(JSON.parse(JSON.stringify(got.store)), report);
  assert.equal(report.any, false, 'nothing the restore wrote is unreadable on the way back in');
  assert.deepEqual(names(profilesOf(back)), ['Nessa', 'Bram']);
  assert.equal(activeProfile(back).name, 'Bram');
});

// ---- migration gains data (claim 4) ----------------------------------------

t('a plain rack becomes one named profile', () => {
  const store = migrateLegacy({ groups: [pool('Strength', '3d6', 'Attributes')], system: 'dnd', set: 'emberforge.blackanvil', label: 'Joe' });
  assert.equal(profilesOf(store).length, 1);
  assert.equal(activeProfile(store).name, 'Joe');
  assert.equal(activeProfile(store).system, 'dnd', "the table's system, not a guess");
  assert.equal(activeProfile(store).set, 'emberforge.blackanvil');
  assert.deepEqual(names(activeProfile(store).pools), ['Strength']);
});

t('an interrupted Tier G swap yields TWO profiles and loses neither rack', () => {
  // The old boot guard restored the stash and DROPPED the rack in front of it
  // (js/main.js:6159). A library has somewhere to put both.
  const store = migrateLegacy({
    groups: [pool('Larceny', '1d20', 'Skills')],   // somebody else's, mid-edit
    mine: [pool('Strength', '3d6', 'Attributes')], // the operator's own
    label: 'Joe',
  });
  assert.deepEqual(names(profilesOf(store)).sort(), ['Joe', 'Recovered']);
  assert.equal(activeProfile(store).name, 'Joe', 'the operator gets their own rack back');
  assert.deepEqual(names(findProfile(store, activeProfile(store).id).pools), ['Strength']);
  const other = profilesOf(store).find((p) => p.name === 'Recovered');
  assert.deepEqual(names(other.pools), ['Larceny'], 'the half-edited rack survived too');
});

t('nothing in storage migrates to an empty library, not a broken one', () => {
  const store = migrateLegacy({});
  assert.deepEqual(profilesOf(store), []);
  assert.equal(store.activeId, null);
  assert.equal(migrateLegacy({ groups: [] }).profiles.length, 0, 'an empty rack is not a profile');
});

// ---- the wire shape --------------------------------------------------------

t('toWire carries name, system, set and pools — and no local bookkeeping', () => {
  const store = threeSystems();
  const wire = toWire(findProfile(store, 'p1'));
  assert.deepEqual(Object.keys(wire).sort(), ['name', 'pools', 'system']);
  assert.equal('id' in wire, false, 'an id means nothing off this browser');
  assert.equal('at' in wire, false, 'so does recency');
  assert.deepEqual(wire.pools, [{ name: 'Strength', notation: '3d6' }]);
  assert.equal(toWire(null), null);
});

t('toWire keeps category and per-pool set, present-or-absent', () => {
  const store = emptyStore();
  addProfile(store, { name: 'A', system: 'dnd', set: 'emberforge.blackanvil', pools: [
    { name: 'X', notation: '1d6', category: 'Attacks', set: 'emberforge.blackanvil' },
    { name: 'Y', notation: '1d8' },
  ] });
  const wire = toWire(activeProfile(store));
  assert.equal(wire.set, 'emberforge.blackanvil');
  assert.deepEqual(wire.pools, [
    { name: 'X', notation: '1d6', category: 'Attacks', set: 'emberforge.blackanvil' },
    { name: 'Y', notation: '1d8' },
  ]);
});

t('fromWire takes the table\'s system when the record names none', () => {
  // A seat prepared before profiles carried systems: the table it was prepared
  // for is the best available answer, and it is the one the arriving player is
  // sitting at.
  const got = fromWire({ name: 'Bo', pools: [pool('X')] }, 'dnd');
  assert.equal(got.system, 'dnd');
  assert.equal(fromWire({ name: 'Bo', system: 'none' }, 'dnd').system, 'none', 'a named system wins');
  assert.equal(fromWire({ name: 'Bo', system: 'pathfinder' }, 'dnd').system, 'dnd', 'unknown falls to the table');
  assert.equal(fromWire({ name: 'Bo' }, 'pathfinder').system, DEFAULT_SYSTEM_ID, 'and then to the default');
  assert.equal(fromWire(null), null);
});

t('wire → store → wire is a fixed point', () => {
  const rec = { name: 'Grix', system: 'dnd', set: 'emberforge.blackanvil', pools: [
    { name: 'Longsword', notation: '1d20+4', category: 'Attacks' },
  ] };
  const store = emptyStore();
  const added = addProfile(store, fromWire(rec));
  assert.equal(added.ok, true, added.error);
  assert.deepEqual(toWire(added.profile), rec);
});

if (process.exitCode) process.exit(process.exitCode);
console.log(`all ${n} profiles tests pass`);
