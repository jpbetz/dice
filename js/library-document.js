/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import { emptyStore, addProfile, MAX_PROFILES, MAX_POOLS, MAX_NAME, STORE_VERSION, knownSystem } from './profiles.js';
import { parseStamp, EPOCH, MAJOR } from './schema.js';
import { cutText } from './notation.js';

// Reserve space inside the adapter's 512 KiB record for revision metadata.
export const MAX_LIBRARY_BYTES = 480 * 1024;
export const MAX_LIBRARY_VERSIONS = 100;
export const MAX_LIBRARY_HISTORY_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const object = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fields = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
// Catalogue IDs are opaque strings (including dotted house IDs). profiles.js
// preserves unknown skin references too; sync must not invent a slug grammar.
const asset = value => typeof value === 'string' && value.length > 0;
const label = (value, required = false) => typeof value === 'string' && (!required || value.length > 0)
  && cutText(value, MAX_NAME) === value;
const profileId = value => typeof value === 'string' && value.length > 0;
const invalid = (code = 'invalid_library') => ({ ok: false, code,
  message: code === 'library_limit' ? 'This library is too large to sync. Your original is still kept.'
    : 'This library cannot be read without changing data. Your original is still kept.' });

export function canonicalLibraryValue(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalLibraryValue).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalLibraryValue(value[key])).join(',') + '}';
}

/** A loud, non-normalizing boundary. normalizeStore() is deliberately lossy
 * and must never stand between a saved remote version and its replacement.
 */
export function validateLibraryDocument(raw) {
  try {
    if (!fields(raw, ['schema', 'profiles', 'dice']) || raw.schema !== 1
        || !fields(raw.profiles, ['v', 'ver', 'seq', 'activeId', 'profiles'])
        || !fields(raw.dice, ['defaultSet', 'favorites'])) return invalid();
    const store = raw.profiles;
    const stamp = parseStamp(store.ver);
    if (store.v !== STORE_VERSION || !stamp || stamp.epoch !== EPOCH || stamp.major > MAJOR
        || !Number.isSafeInteger(store.seq) || store.seq < 0 || store.seq >= Number.MAX_SAFE_INTEGER
        || !Array.isArray(store.profiles)) return invalid();
    if (store.profiles.length > MAX_PROFILES) return invalid('library_limit');
    const ids = new Set();
    const names = new Set();
    for (const profile of store.profiles) {
      if (!fields(profile, ['id', 'name', 'system', 'set', 'pools', 'at'])
          || !profileId(profile.id) || ids.has(profile.id) || (/^p\d+$/.test(profile.id) && Number(profile.id.slice(1)) > store.seq)
          || !label(profile.name, true) || profile.name.includes('#') || names.has(profile.name.toLowerCase())
          || !knownSystem(profile.system) || !Number.isFinite(profile.at)
          || (Object.hasOwn(profile, 'set') && !asset(profile.set)) || !Array.isArray(profile.pools)) return invalid();
      if (profile.pools.length > MAX_POOLS) return invalid('library_limit');
      ids.add(profile.id); names.add(profile.name.toLowerCase());
      for (const pool of profile.pools) {
        if (!fields(pool, ['id', 'name', 'notation', 'category', 'set'])
            || !Number.isFinite(pool.id) || !label(pool.name)
            || typeof pool.notation !== 'string' || !pool.notation.trim()
            || (Object.hasOwn(pool, 'category') && !label(pool.category))
            || (Object.hasOwn(pool, 'set') && !asset(pool.set))) return invalid();
      }
    }
    if ((store.profiles.length && !ids.has(store.activeId)) || (!store.profiles.length && store.activeId !== null)
        || !asset(raw.dice.defaultSet) || !Array.isArray(raw.dice.favorites)
        || raw.dice.favorites.some(id => !asset(id))
        || new Set(raw.dice.favorites).size !== raw.dice.favorites.length) return invalid();
    const encoded = JSON.stringify(raw);
    if (encoder.encode(encoded).byteLength > MAX_LIBRARY_BYTES) return invalid('library_limit');
    return { ok: true, document: JSON.parse(encoded) };
  } catch { return invalid(); }
}

export function libraryDocument(profiles = emptyStore(), { defaultSet = 'classics.ivory', favorites = [] } = {}) {
  return validateLibraryDocument({ schema: 1, profiles, dice: { defaultSet, favorites } });
}

const profileContent = profile => canonicalLibraryValue({ name: profile.name, system: profile.system,
  set: profile.set || null, pools: profile.pools.map(({ id, ...pool }) => pool) });

/** A preview computation only. Its caller retains both inputs before applying
 * a selected candidate. A merge never guesses between different default dice.
 */
export function reconcileLibraryDocuments(local, remote, { choice, diceChoice } = {}) {
  const a = validateLibraryDocument(local);
  const b = validateLibraryDocument(remote);
  if (!a.ok) return a;
  if (!b.ok) return b;
  if (choice === 'local') return { ok: true, document: a.document, added: 0 };
  if (choice === 'remote') return { ok: true, document: b.document, added: 0 };
  if (choice !== 'merge') return { ok: false, code: 'choice_required', message: 'Choose which library to use.' };
  if (a.document.dice.defaultSet !== b.document.dice.defaultSet && !['local', 'remote'].includes(diceChoice)) {
    return { ok: false, code: 'dice_choice_required', message: 'Choose your default dice for the merged library.' };
  }
  const candidate = a.document;
  const activeId = candidate.profiles.activeId;
  const seen = new Set(candidate.profiles.profiles.map(profileContent));
  let added = 0;
  for (const profile of b.document.profiles.profiles) {
    const content = profileContent(profile);
    if (seen.has(content)) continue;
    if (candidate.profiles.profiles.length >= MAX_PROFILES) return invalid('library_limit');
    const result = addProfile(candidate.profiles, { name: profile.name, system: profile.system,
      set: profile.set || null, pools: profile.pools, at: profile.at });
    if (!result.ok) return invalid();
    seen.add(content); added++;
  }
  if (activeId !== null) candidate.profiles.activeId = activeId;
  candidate.dice = {
    defaultSet: diceChoice === 'remote' ? b.document.dice.defaultSet : candidate.dice.defaultSet,
    favorites: [...new Set([...candidate.dice.favorites, ...b.document.dice.favorites])],
  };
  const checked = validateLibraryDocument(candidate);
  return checked.ok ? { ...checked, added } : checked;
}
