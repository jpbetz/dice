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

// js/profiles.js — THE PROFILE LIBRARY. One browser, up to 32 named racks,
// each bound to a rolling system; exactly one of them is in your hands.
//
// Design authority: docs/PROFILES.md §11. This module is the store and
// nothing else — no DOM, no localStorage, no clock of its own. main.js owns
// the key and the paint; every function here is a pure operation on a plain
// store object, which is what lets the unit suite run the whole model under
// plain Node the way js/portable.js does.
//
// THE ONE SENTENCE: **the store owns the pools, and the active profile IS the
// rack.** Before this module, `dice.groups.v1` was the rack and Tier G's
// authoring swapped foreign pools into it, stashing yours under
// `dice.groups.mine.v1` and reading the stash back to prove the write landed
// before it dared move `groups` (PROFILES §4, UX §7.19). That guardrail
// existed because a swap COPIED your rack somewhere and a failed copy lost
// it. Here a switch copies nothing: it moves `activeId`. Both racks are
// already in the store, in the same write, so the whole failure class the
// stash was built to survive — quota errors mid-swap, a reload landing on
// someone else's pools under your name — cannot be constructed. The stash,
// its verify, its boot guard and its publish gate are deleted, not ported.
//
// WHY THE ACTIVE PROFILE'S POOLS DO NOT LIVE IN A SECOND KEY. The tempting
// shape is "the store holds the OTHER profiles and dice.groups.v1 stays the
// live rack" — no writer changes, tiny diff. It is a dual-write: two keys
// that must agree about the same 40 pools, with no transaction between them.
// Clear one and the library disagrees with the rack; interrupt a switch and
// the pointer names a profile whose pools are still the previous one's. There
// is exactly one writer of the rack today (`saveGroups`, js/main.js:6206), so
// pointing that one writer at the store costs one line and buys a model with
// no second copy to fall out of step.
//
// SYSTEMS ARE MIRRORED, NOT IMPORTED. Same reason js/portable.js mirrors
// them: this file must keep running under plain Node for the unit suite, and
// js/meanings.js drags the chart, the tiers and the forecast in behind it.
// The list is three ids long and it changes about once a year; the unit suite
// pins the mirror against meanings.js so a drift is a test failure, not a
// discovery.
//
// A PROFILE NAME IS A DISPLAY NAME, so `#` is banned here as it is at every
// other name door (GOALS notation-totality; server.js cleanName). Picking a
// profile can hand its name to the roster, and a name carrying `#` re-parses
// as a whisper to somebody else — a silent misdelivery. The store REFUSES
// rather than strips, because every caller of `nameProfile` has a human in
// front of it who can fix the spelling.
//
// AN UNKNOWN SYSTEM FALLS BACK; IT DOES NOT DELETE. The loud door is the file
// (js/portable.js refuses an unrecognized `system:` at its line, because a
// table nobody prepared is worse than a refusal). By the time a record
// reaches the store the only way to hold a system this version cannot read is
// a hand-edited key or a downgrade, and there the choice is between dropping
// a character over one metadata word and keeping its pools under the default
// system. The pools are the work and they are system-agnostic — notation
// reads the same under every lens — so the profile survives.

import { cutText } from './notation.js';
import { STAMP as SCHEMA_STAMP, judgeStamp } from './schema.js';

export const STORE_KEY = 'dice.profiles.v1';

// STORE_VERSION was written into every store and READ BY NOTHING. It is kept
// — a stored `v: 1` is in every browser in the field and dropping the field
// would make this build's stores unreadable by the one before it for no gain
// — but it is no longer the version that means anything. `ver` is (C22).
// normalizeStore still has no branch on it and never will; what it does now
// is REPORT what it found (see its `report` argument) so the boot path can
// say "this came from something else" instead of quietly healing it.
export const STORE_VERSION = 1;

// C22's three numbers, on the store. `ver` rather than reusing `v` because `v`
// already has a meaning in the field that this does not share, and a field
// that means two things across two builds is exactly the ambiguity the whole
// contract exists to remove.
export const STORE_STAMP = SCHEMA_STAMP;

// The one door a stored library takes on its way in. Returns
// {ok: true, raw} — hand it to normalizeStore — or {ok: false, message} when
// the blob is NEWER than this build in a way that would lose data, in which
// case the caller must show `message` and load NOTHING. Purge and convert are
// the origin-wide epoch mechanism's business (main.js), not this store's: by
// the time a blob reaches here it is this epoch's by construction.
//
// Absent `ver` is the normal case for years of stored libraries and loads
// exactly as it always did — see judgeStamp for why that is correct and not
// merely lenient.
export function readStore(raw) {
  const verdict = judgeStamp(raw && typeof raw === 'object' ? raw.ver : undefined, 'your saved pools');
  if (verdict.action === 'refuse') return { ok: false, message: verdict.message, stamp: verdict.stamp };
  return { ok: true, raw, stamp: verdict.stamp };
}

// Joe's number (2026-08-08). Two campaigns' worth of characters plus the
// NPCs, which is what the library is for; past that a list stops being
// browsable and the file is the right home for an archive.
export const MAX_PROFILES = 32;

// The rack cap, mirrored from js/main.js / server.js MAX_POOLS_PER_PLAYER.
export const MAX_POOLS = 40;
export const MAX_NAME = 24;

// Mirrored from js/meanings.js SYSTEMS + DEFAULT_SYSTEM (see the header).
export const SYSTEM_IDS = ['soul-deal', 'dnd', 'none'];
export const DEFAULT_SYSTEM_ID = 'soul-deal';

export const knownSystem = (id) => (SYSTEM_IDS.includes(id) ? id : null);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// → a clean name, or null with the reason. The `#` refusal is loud (see the
// header); everything else is the ordinary cut-to-24.
export function nameProfile(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'a profile needs a name' };
  if (raw.includes('#')) {
    return { ok: false, error: 'names cannot contain # — it starts a comment in roll notation' };
  }
  const name = cutText(raw, MAX_NAME);
  if (!name) return { ok: false, error: 'a profile needs a name' };
  return { ok: true, name };
}

// "Bram" beside a "Bram" becomes "Bram 2" — the copy grammar, so adopting a
// teammate's profile never asks a question it can answer and never silently
// merges two characters. Case-insensitive, like every other name compare in
// the tree. Falls back to a truncating suffix when the base fills the cap.
export function uniqueName(store, wanted, { exceptId = null } = {}) {
  const taken = new Set(
    profilesOf(store)
      .filter((p) => p.id !== exceptId)
      .map((p) => p.name.toLowerCase()),
  );
  const base = cutText(String(wanted || ''), MAX_NAME) || 'Profile';
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n <= MAX_PROFILES + 1; n++) {
    const suffix = ` ${n}`;
    const stem = cutText(base, MAX_NAME - suffix.length) || 'Profile';
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base; // unreachable at 32 profiles; a duplicate beats a throw
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

// { v, seq, activeId, profiles: [profile] }
//
// A profile:
//   { id, name, system, set?, pools: [{id, name, notation, category?, set?}],
//     at }
//
// `at` is "last taken in hand", stamped by setActive and by creation, and it
// is the ONLY record of recency: last-used-per-system is `profilesFor(sys)[0]`
// rather than a parallel map of pointers. One field cannot disagree with
// itself, and a map keyed by system would have to be repaired every time a
// profile is deleted or its system changes.
export function emptyStore() {
  return { v: STORE_VERSION, ver: STORE_STAMP, seq: 0, activeId: null, profiles: [] };
}

export const profilesOf = (store) => (store && Array.isArray(store.profiles) ? store.profiles : []);

function mintId(store) {
  store.seq = Number.isInteger(store.seq) && store.seq >= 0 ? store.seq + 1 : 1;
  return `p${store.seq}`;
}

// One pool record, shape-checked only. Notation is NOT parsed here: main.js's
// migrateGroup is the single door a pool record goes through on its way into
// the rack (it canonicalizes, upgrades pre-notation records and drops what it
// cannot read), and running a second, weaker validator in front of it would
// only disagree with it. This drops what could never be a pool at all.
function cleanPool(raw, i) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.notation !== 'string' || !raw.notation.trim()) return null;
  const out = {
    id: Number.isFinite(raw.id) ? raw.id : i + 1,
    name: typeof raw.name === 'string' ? cutText(raw.name, MAX_NAME) : '',
    notation: raw.notation,
  };
  if (typeof raw.category === 'string' && raw.category.trim()) out.category = cutText(raw.category, MAX_NAME);
  if (typeof raw.set === 'string' && raw.set) out.set = raw.set;
  return out;
}

export const cleanPools = (list) => (Array.isArray(list) ? list : [])
  .map(cleanPool)
  .filter(Boolean)
  .slice(0, MAX_POOLS);

// Anything → a store this module's own invariants hold over. Self-healing by
// construction (docs/PROFILES.md §11 X6): a hand-edited key, a half-cleared
// one, a duplicate id or an activeId naming nobody all resolve to a usable
// library rather than an exception at boot — which for the player is the
// difference between "my names look odd" and "the app did not start".
//
// …AND THE HEALING IS LOSSY, SO IT NOW SAYS SO (ROADMAP C15). Profiles past 32,
// pools past 40, records with no readable name and a second profile sharing a
// lowercase name are all DROPPED here, silently, on the boot path — and main.js
// then persisted the healed result on the first paint, overwriting the records
// it had just discarded before the player had touched anything. That is what
// turns a display defect into data loss, and it is the write, not the drop,
// that does it: the drop is recoverable for exactly as long as the key still
// holds the bytes.
//
// Pass `report` — any object — and this fills it with what it had to leave
// behind, so the caller can refuse to write and say what is missing:
//
//   { overflow: [name…]   profiles past MAX_PROFILES
//     duplicates: [name…] names that collapsed into an earlier profile
//     unreadable: n       records that could never have been a profile
//     pools: n            pool records dropped from profiles that DID survive
//     version: n|null     the `v` the key carried, when it is not ours (C22)
//     any: bool }         did anything at all fail to load
//
// A DROP IS NOT A VERSION MISMATCH: `version` is deliberately outside `any`,
// because a differently-versioned key that loads whole has lost nothing and
// must not raise a data-loss notice. Reading that field is C22's job.
export function normalizeStore(raw, report = null) {
  const store = emptyStore();
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const lost = report && typeof report === 'object' ? report : null;
  if (lost) {
    lost.overflow = [];
    lost.duplicates = [];
    lost.unreadable = 0;
    lost.pools = 0;
    lost.version = Number.isFinite(src.v) && src.v !== STORE_VERSION ? src.v : null;
    lost.any = false;
  }
  const ids = new Set();
  const names = new Set();
  for (const rec of Array.isArray(src.profiles) ? src.profiles : []) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) { if (lost) lost.unreadable++; continue; }
    // The name is STRIPPED here, not refused: normalizeStore is the boot path
    // and there is no human standing in front of it. nameProfile — the door
    // every UI action takes — is the loud one.
    const name = typeof rec.name === 'string' ? cutText(rec.name.replace(/#/g, ''), MAX_NAME) : '';
    if (!name) { if (lost) lost.unreadable++; continue; }
    const key = name.toLowerCase();
    // The cap used to `break` here. It CONTINUES now so the report can carry
    // the names of everyone who did not fit — a count is a number the player
    // cannot check, and "Ada and Bo did not load" is the same fact they can.
    // Identical outcome for the store: once full it stays full, because
    // nothing in this loop ever removes a profile.
    if (store.profiles.length >= MAX_PROFILES) { if (lost) lost.overflow.push(name); continue; }
    if (names.has(key)) { // duplicates collapse to the first, as the file's do
      if (lost) lost.duplicates.push(name);
      continue;
    }
    let id = typeof rec.id === 'string' && rec.id && !ids.has(rec.id) ? rec.id : null;
    if (!id) { do { id = mintId(store); } while (ids.has(id)); }
    ids.add(id);
    names.add(key);
    const pools = cleanPools(rec.pools);
    if (lost && Array.isArray(rec.pools)) lost.pools += Math.max(0, rec.pools.length - pools.length);
    store.profiles.push({
      id,
      name,
      system: knownSystem(rec.system) || DEFAULT_SYSTEM_ID,
      ...(typeof rec.set === 'string' && rec.set ? { set: rec.set } : {}),
      pools,
      at: Number.isFinite(rec.at) ? rec.at : 0,
    });
  }
  if (lost) {
    lost.any = !!(lost.overflow.length || lost.duplicates.length || lost.unreadable || lost.pools);
  }
  // seq must clear every id it could ever mint again, or a fresh profile can
  // collide with a stored one and the two share a row forever.
  let seq = Number.isInteger(src.seq) && src.seq > 0 ? src.seq : 0;
  for (const p of store.profiles) {
    const m = /^p(\d+)$/.exec(p.id);
    if (m) seq = Math.max(seq, Number(m[1]));
  }
  store.seq = seq;
  store.activeId = store.profiles.some((p) => p.id === src.activeId)
    ? src.activeId
    : (store.profiles[0] ? store.profiles[0].id : null);
  return store;
}

export const findProfile = (store, id) => profilesOf(store).find((p) => p.id === id) || null;
export const activeProfile = (store) => findProfile(store, store && store.activeId);

// Every profile this table could offer, most recently taken in hand first.
// The system filter is Joe's rule (R5): a rack is pickable only where its
// numbers will be read the way it was priced.
export function profilesFor(store, system) {
  const sys = knownSystem(system) || DEFAULT_SYSTEM_ID;
  return profilesOf(store)
    .filter((p) => p.system === sys)
    .sort((a, b) => (b.at - a.at) || a.name.localeCompare(b.name));
}

// R6: what a fresh arrival at this table takes in hand, with no click.
export function lastUsedFor(store, system) {
  const list = profilesFor(store, system);
  return list.length ? list[0].id : null;
}

export const isFull = (store) => profilesOf(store).length >= MAX_PROFILES;

// ---------------------------------------------------------------------------
// Operations — each returns {ok:true, ...} or {ok:false, error}
// ---------------------------------------------------------------------------

// Adds and ACTIVATES: a profile you just made is a profile you are about to
// edit, and creating one that sat inert behind the one still in your hands
// would need a second click to mean anything.
export function addProfile(store, { name, system, set = null, pools = [], at = 0 } = {}) {
  if (isFull(store)) {
    return { ok: false, error: `${MAX_PROFILES} profiles is the ceiling — delete one first` };
  }
  const named = nameProfile(name);
  if (!named.ok) return named;
  const rec = {
    id: mintId(store),
    name: uniqueName(store, named.name),
    system: knownSystem(system) || DEFAULT_SYSTEM_ID,
    ...(typeof set === 'string' && set ? { set } : {}),
    pools: cleanPools(pools),
    at: Number.isFinite(at) ? at : 0,
  };
  store.profiles.push(rec);
  store.activeId = rec.id;
  return { ok: true, id: rec.id, profile: rec };
}

export function renameProfile(store, id, name) {
  const rec = findProfile(store, id);
  if (!rec) return { ok: false, error: 'no such profile' };
  const named = nameProfile(name);
  if (!named.ok) return named;
  rec.name = uniqueName(store, named.name, { exceptId: id });
  return { ok: true, name: rec.name };
}

// Deleting the profile in your hands hands you the next most recent one FOR
// THE SAME SYSTEM, falling back to any profile at all: the rack must never be
// nobody's, because `groups` has to point somewhere.
export function deleteProfile(store, id) {
  const rec = findProfile(store, id);
  if (!rec) return { ok: false, error: 'no such profile' };
  if (profilesOf(store).length <= 1) {
    return { ok: false, error: 'this is your only profile — a table needs one' };
  }
  store.profiles = store.profiles.filter((p) => p.id !== id);
  if (store.activeId === id) {
    const next = profilesFor(store, rec.system)[0] || profilesFor(store, null)[0] || profilesOf(store)[0];
    store.activeId = next ? next.id : null;
  }
  return { ok: true, activeId: store.activeId };
}

// The whole of "switch profile": one pointer and one timestamp. No copy, so
// nothing to lose (see the header).
export function setActive(store, id, now = 0) {
  const rec = findProfile(store, id);
  if (!rec) return { ok: false, error: 'no such profile' };
  store.activeId = id;
  rec.at = Number.isFinite(now) ? now : 0;
  return { ok: true, profile: rec };
}

// The rack, written back to whoever is holding it. This is what saveGroups
// calls; `pools` is main.js's live `groups` array, copied so the store never
// aliases it.
export function writeActivePools(store, pools) {
  const rec = activeProfile(store);
  if (!rec) return { ok: false, error: 'no active profile' };
  rec.pools = cleanPools(pools);
  return { ok: true };
}

export function setActiveSystem(store, system) {
  const rec = activeProfile(store);
  if (!rec) return { ok: false, error: 'no active profile' };
  rec.system = knownSystem(system) || DEFAULT_SYSTEM_ID;
  return { ok: true, system: rec.system };
}

export function setProfileSet(store, id, set) {
  const rec = findProfile(store, id);
  if (!rec) return { ok: false, error: 'no such profile' };
  if (typeof set === 'string' && set && set !== 'std') rec.set = set;
  else delete rec.set;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Restore — a whole library, rebuilt from a file (ROADMAP C15, CUJ13)
// ---------------------------------------------------------------------------

// records: wire shapes ({name, system?, set?, pools}) in the order the file
// wrote them → a complete store with one profile in hand, or a refusal naming
// what stopped it. Nothing here touches storage or the DOM: the caller decides
// whether the returned store ever becomes the live one, which is what lets it
// write to disk FIRST and swap second.
//
// WHY THIS IS NOT `Add all N` IN A LOOP — the measured reason restore did not
// exist. Add is a MERGE and dedupes through uniqueName, so a restored 'Nessa'
// landing beside a dealt 'Nessa' becomes 'Nessa 2' and the file no longer
// describes the library it just built. Add also adds INTO a library that
// already holds the browser's one dealt profile, so a 32-profile file needs 32
// free slots against a ceiling of 32 and lands 31 of your characters beside a
// stranger's, with the wrong one in hand. Starting from emptyStore() dissolves
// both at once: every name in the file is free, so uniqueName can never fire,
// and 32 fit exactly because nothing is holding a slot.
//
// THE NAMES MUST ALREADY BE UNIQUE, AND THIS REFUSES RATHER THAN DEDUPING WHEN
// THEY ARE NOT. js/portable.js enforces uniqueness INSIDE `players:` (a
// repeated player fails at its line) but NOT between `players:` and the
// `profile:` key that names the top-level rack — verified 2026-08-14, and the
// roadmap's claim that "the file's names are already unique by parsePortable"
// is false across that seam. A hand-edited file can therefore offer the same
// character twice, and there is no store this function could build that such a
// file describes. Renaming one silently is the precise defect C15 exists to
// remove, so the collision is spoken instead.
export function rebuildStore(records, { fallbackSystem = DEFAULT_SYSTEM_ID, activeName = null, now = 0 } = {}) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length) return { ok: false, error: 'that file carries no profiles' };
  if (list.length > MAX_PROFILES) {
    return { ok: false, error: `that file carries ${list.length} profiles — ${MAX_PROFILES} is the ceiling` };
  }
  const seen = new Map();
  const clean = [];
  for (const rec of list) {
    const named = nameProfile(rec && rec.name);
    if (!named.ok) return { ok: false, error: named.error };
    const key = named.name.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `that file names '${seen.get(key)}' twice — a library holds each name once` };
    }
    seen.set(key, named.name);
    clean.push({ rec, name: named.name });
  }
  const store = emptyStore();
  for (const { rec, name } of clean) {
    const added = addProfile(store, { ...fromWire(rec, fallbackSystem), at: 0 });
    if (!added.ok) return { ok: false, error: added.error };
    // THE CLAIM THIS FUNCTION RESTS ON, CHECKED RATHER THAN ASSUMED. A store
    // built from empty over already-unique names never fires uniqueName, so
    // the name that landed is the name the file wrote. If addProfile ever
    // grows a second reason to rename, this is the line that says so instead
    // of the player discovering it as 'Nessa 2' on a fresh browser.
    if (added.profile.name !== name) {
      return { ok: false, error: `'${name}' would land as '${added.profile.name}' — the file cannot be restored as written` };
    }
  }
  // `at` is 0 for everyone: a file records no recency, and inventing an order
  // would make profilesFor() sort by a fiction. The one profile taken in hand
  // is the only thing with a time on it, which is exactly what happened.
  const wanted = typeof activeName === 'string' && activeName.trim()
    ? profilesOf(store).find((p) => p.name.toLowerCase() === activeName.trim().toLowerCase())
    : null;
  // THE POINTER EVERY OTHER PATH DROPS. The file's `profile:` key says which
  // rack was in hand when it was written; Add and Add all ignore it entirely,
  // which is how a restore hands you back somebody else's character. A file
  // naming none — or naming one that is not in it — hands back the first
  // record, which is the order the file was written in.
  const active = wanted || profilesOf(store)[0];
  setActive(store, active.id, now);
  return { ok: true, store, active, activeId: active.id, named: !!wanted };
}

// ---------------------------------------------------------------------------
// Migration — one door, from every shape that existed before the library
// ---------------------------------------------------------------------------

// legacy: { groups, mine, system, set } — `groups` is dice.groups.v1 and
// `mine` is dice.groups.mine.v1, Tier G's authoring stash. BOTH become
// profiles when both are present, which is the whole reason this takes them
// together: a browser that died mid-swap holds the operator's own rack in the
// stash and SOMEBODY ELSE'S in the rack, and the old boot guard resolved that
// by restoring the stash and dropping the other (js/main.js:6159, "unsaved
// profile edits from the dead session are the one thing lost"). A library has
// somewhere to put both, so it keeps both and loses nothing.
//
// `label` names the migrated rack. Nothing in storage ever recorded what the
// player called their one rack, because they never called it anything.
export function migrateLegacy({ groups = null, mine = null, system = null, set = null, label = 'My pools', stashLabel = 'Recovered' } = {}) {
  const store = emptyStore();
  const sys = knownSystem(system) || DEFAULT_SYSTEM_ID;
  const hasMine = Array.isArray(mine) && mine.length > 0;
  const hasRack = Array.isArray(groups) && groups.length > 0;
  // The stash is the operator's OWN rack, so it takes the ordinary label and
  // the rack sitting in front of it — a profile they were editing — takes the
  // recovered one. Order matters: the operator's own rack ends up active.
  if (hasMine) {
    addProfile(store, { name: uniqueName(store, stashLabel), system: sys, pools: groups, at: 1 });
    addProfile(store, { name: uniqueName(store, label), system: sys, set, pools: mine, at: 2 });
  } else if (hasRack) {
    addProfile(store, { name: uniqueName(store, label), system: sys, set, pools: groups, at: 2 });
  }
  return store;
}

// ---------------------------------------------------------------------------
// The wire / file shape — {name, system, set?, pools} — and back
// ---------------------------------------------------------------------------

// A profile as it travels: to the room key (POST /api/table), into the
// portable file's `players:` block, and out of a teammate's published rack.
// Deliberately NOT the store record: `id` and `at` are this browser's
// bookkeeping and mean nothing anywhere else, and shipping them would invite
// a receiver to treat them as identity.
export function toWire(profile) {
  if (!profile) return null;
  return {
    name: profile.name,
    system: profile.system,
    ...(profile.set ? { set: profile.set } : {}),
    pools: (profile.pools || []).map((p) => ({
      name: p.name || '',
      notation: p.notation,
      ...(p.category ? { category: p.category } : {}),
      ...(p.set ? { set: p.set } : {}),
    })),
  };
}

// A wire/file record → the arguments addProfile wants. `fallbackSystem` is
// what an older record with no system at all takes: a prepared seat pushed
// before this pass carries pools and a name and nothing else, and the table
// it was prepared for is the best available answer.
export function fromWire(rec, fallbackSystem = DEFAULT_SYSTEM_ID) {
  if (!rec || typeof rec !== 'object') return null;
  return {
    name: typeof rec.name === 'string' ? rec.name : '',
    system: knownSystem(rec.system) || knownSystem(fallbackSystem) || DEFAULT_SYSTEM_ID,
    set: typeof rec.set === 'string' && rec.set ? rec.set : null,
    pools: cleanPools(rec.pools),
  };
}
