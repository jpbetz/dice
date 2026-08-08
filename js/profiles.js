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

export const STORE_KEY = 'dice.profiles.v1';
export const STORE_VERSION = 1;

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
  return { v: STORE_VERSION, seq: 0, activeId: null, profiles: [] };
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
export function normalizeStore(raw) {
  const store = emptyStore();
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const ids = new Set();
  const names = new Set();
  for (const rec of Array.isArray(src.profiles) ? src.profiles : []) {
    if (store.profiles.length >= MAX_PROFILES) break;
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    // The name is STRIPPED here, not refused: normalizeStore is the boot path
    // and there is no human standing in front of it. nameProfile — the door
    // every UI action takes — is the loud one.
    const name = typeof rec.name === 'string' ? cutText(rec.name.replace(/#/g, ''), MAX_NAME) : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (names.has(key)) continue; // duplicates collapse to the first, as the file's do
    let id = typeof rec.id === 'string' && rec.id && !ids.has(rec.id) ? rec.id : null;
    if (!id) { do { id = mintId(store); } while (ids.has(id)); }
    ids.add(id);
    names.add(key);
    store.profiles.push({
      id,
      name,
      system: knownSystem(rec.system) || DEFAULT_SYSTEM_ID,
      ...(typeof rec.set === 'string' && rec.set ? { set: rec.set } : {}),
      pools: cleanPools(rec.pools),
      at: Number.isFinite(rec.at) ? rec.at : 0,
    });
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
    return { ok: false, error: 'this is your only profile — a table needs a rack' };
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
