/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import { profilesOf, activeProfile, toWire, MAX_POOLS, MAX_PROFILES } from './profiles.js';

// Consent belongs to this browser/table, never to an exported or synced kit.
export const SHARING_KEY = 'dice.profile-sharing.v1';
const MAX_TABLES = 32;
const validId = id => typeof id === 'string' && /^p[1-9][0-9]*$/.test(id);
const validRoom = room => typeof room === 'string' && room.length > 0 && room.length <= 64;

export function sharingChoices(raw) {
  const tables = [];
  const seen = new Set();
  if (raw?.v === 1 && Array.isArray(raw.tables)) {
    for (const row of raw.tables) {
      if (!validRoom(row?.room) || seen.has(row.room) || !Array.isArray(row.ids)) continue;
      seen.add(row.room);
      const ids = [...new Set(row.ids.filter(validId))].slice(0, MAX_PROFILES);
      if (ids.length) tables.push({ room: row.room, ids });
      if (tables.length === MAX_TABLES) break;
    }
  }
  return { v: 1, tables };
}

export function sharedIds(raw, room) {
  return sharingChoices(raw).tables.find(row => row.room === room)?.ids || [];
}

export function chooseSharedProfile(raw, room, id, enabled) {
  const next = sharingChoices(raw);
  if (!validRoom(room) || !validId(id)) return next;
  const ids = sharedIds(next, room).filter(value => value !== id);
  if (enabled && ids.length < MAX_PROFILES) ids.push(id);
  next.tables = next.tables.filter(row => row.room !== room);
  if (ids.length) next.tables.unshift({ room, ids });
  next.tables = next.tables.slice(0, MAX_TABLES);
  return next;
}

// This is the only projection from a private library into /api/pools. Both
// the active rack and alternate profiles require consent. toWire allowlists
// display fields; account IDs, local profile IDs and revisions cannot ride it.
export function profilePublication(store, groups, ids, defaultSet) {
  const selected = new Set(Array.isArray(ids) ? ids.filter(validId) : []);
  const mine = activeProfile(store);
  const wire = p => toWire({ ...p, pools: (p.id === mine?.id ? groups : p.pools || []).slice(0, MAX_POOLS) });
  const active = mine && selected.has(mine.id) ? wire(mine) : null;
  return {
    pools: active?.pools || [], set: active ? defaultSet : null,
    profile: active?.name || null, system: active?.system || null,
    library: profilesOf(store).filter(p => selected.has(p.id)).slice(0, MAX_PROFILES).map(wire),
  };
}
