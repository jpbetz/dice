/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import { StoreError } from './store.js';
import { readSocialDirectory, readRelationship, checkSocialPerson } from './social.js';
import { checkHomeRecord } from './homes.js';

export const PRESENCE_MS = 90000;
export const PRESENCE_REFRESH_MS = 30000;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const homeId = value => typeof value === 'string' && /^h_[A-Za-z0-9_-]{43}$/.test(value);
const fields = (input, allowed) => input && typeof input === 'object' && !Array.isArray(input)
  && Object.keys(input).every(key => allowed.includes(key));
const identity = person => ({ id: person.id, displayName: person.displayName });
const invalid = () => ({ ok: false, status: 400, code: 'invalid_presence', message: 'Check the presence choice and try again.' });
const absent = () => ({ ok: false, status: 404, code: 'home_not_found', message: 'This saved table is not available to this account.' });

function account(value, id) {
  checkSocialPerson(value, id);
  if (!Array.isArray(value.sessionHashes) || value.sessionHashes.length > 12 || value.sessionHashes.some(id => !hash(id))
      || !Number.isSafeInteger(value.sessionGeneration) || value.sessionGeneration < 1) throw new StoreError('corrupt');
  return value;
}
function record(value, id) {
  if (value === null) return { schema: 1, personId: id, sessions: [] };
  if (!value || value.schema !== 1 || value.personId !== id || !Array.isArray(value.sessions) || value.sessions.length > 12
      || value.sessions.some(marker => !fields(marker, ['sessionHash', 'generation', 'updatedAt', 'expiresAt', 'homeId'])
        || !hash(marker.sessionHash) || !Number.isSafeInteger(marker.generation) || marker.generation < 1
        || !Number.isFinite(marker.updatedAt) || !Number.isFinite(marker.expiresAt)
        || marker.expiresAt < marker.updatedAt || marker.expiresAt - marker.updatedAt > PRESENCE_MS
        || (marker.homeId !== null && !homeId(marker.homeId)))
      || new Set(value.sessions.map(marker => marker.sessionHash)).size !== value.sessions.length) throw new StoreError('corrupt');
  return value;
}
function active(value, person, at) {
  return value.sessions.filter(marker => marker.expiresAt > at && marker.updatedAt <= at
    && marker.generation === person.sessionGeneration && person.sessionHashes.includes(marker.sessionHash));
}

// Cookie-changing sign-in reads this before its first write, then applies the
// returned mutation in the same commit. A lost HTTP acknowledgement cannot keep
// the previous identity's marker alive after the browser adopts the new cookie.
export async function preparePresenceWithdrawal(tx, personId, sessionHash) {
  const path = `presence/${personId}`, saved = record(await tx.get(path), personId);
  const sessions = saved.sessions.filter(marker => marker.sessionHash !== sessionHash);
  if (sessions.length === saved.sessions.length) return () => {};
  return () => sessions.length ? tx.put(path, { ...saved, sessions }) : tx.delete(path);
}

export function createPresenceDomain({ now = Date.now, seat = null } = {}) {
  return Object.freeze({
    async set(tx, found, input) {
      if (!fields(input, ['online', 'homeId', 'room', 'playerId']) || typeof input.online !== 'boolean') return invalid();
      if ((!input.online || input.homeId == null) && (input.room !== undefined || input.playerId !== undefined)
          || (!input.online && input.homeId != null)) return invalid();
      const self = account(found.person, found.person.id), at = now();
      let location = null;
      if (input.online && input.homeId != null) {
        if (!homeId(input.homeId) || !self.homeIds.includes(input.homeId)) return absent();
        const home = checkHomeRecord(await tx.get(`homes/${input.homeId}`), input.homeId);
        if (!home.memberIds.includes(self.id)) throw new StoreError('corrupt');
        const verifiedSeat = typeof seat === 'function' ? seat({ room: input.room, playerId: input.playerId }) : null;
        if (!verifiedSeat?.ok || verifiedSeat.roomKey !== home.roomKey) return {
          ok: false, status: 403, code: 'live_seat_required', message: 'Join this saved table before sharing your presence there.' };
        location = home.id;
      }
      const path = `presence/${self.id}`, saved = record(await tx.get(path), self.id);
      const sessions = active(saved, self, at), current = sessions.find(marker => marker.sessionHash === found.sessionHash);
      if (input.online && current && current.homeId === location && at - current.updatedAt < PRESENCE_REFRESH_MS) {
        return { ok: true, personId: self.id, sharing: true, expiresAt: current.expiresAt };
      }
      const next = sessions.filter(marker => marker.sessionHash !== found.sessionHash);
      const expiresAt = input.online ? Math.min(at + PRESENCE_MS, found.session.expiresAt) : null;
      if (input.online) next.push({ sessionHash: found.sessionHash, generation: self.sessionGeneration,
        updatedAt: at, expiresAt, homeId: location });
      if (next.length > 12) throw new StoreError('corrupt');
      if (next.length) tx.put(path, { schema: 1, personId: self.id, sessions: next });
      else tx.delete(path);
      return { ok: true, personId: self.id, sharing: input.online, expiresAt };
    },
    async read(tx, self, id = null) {
      account(self, self.id);
      const at = now(), signals = [];
      let members, home = null;
      if (id === null) members = (await readSocialDirectory(tx, self.id)).friendIds;
      else {
        if (!homeId(id) || !self.homeIds.includes(id)) return absent();
        home = checkHomeRecord(await tx.get(`homes/${id}`), id);
        if (!home.memberIds.includes(self.id)) throw new StoreError('corrupt');
        members = home.memberIds;
      }
      for (const memberId of members) {
        if (memberId === self.id) continue;
        const relation = await readRelationship(tx, self.id, memberId);
        // A pair record is the authority, so removal/blocking is reflected
        // immediately without waiting for a heartbeat or TTL cleanup.
        if (relation.blockedBy.length || (relation.removedAt !== null && relation.state !== 'friends')
            || (id === null && relation.state !== 'friends')) continue;
        const member = account(await tx.get(`people/${memberId}`), memberId);
        let markers = active(record(await tx.get(`presence/${memberId}`), memberId), member, at);
        if (id !== null) markers = member.homeIds.includes(id) ? markers.filter(marker => marker.homeId === id) : [];
        if (id !== null && !markers.length) continue;
        const expiresAt = markers.length ? Math.max(...markers.map(marker => marker.expiresAt)) : null;
        signals.push({ person: identity(member), state: markers.length ? 'online' : 'unknown', expiresAt });
      }
      return { ok: true, personId: self.id, ...(home ? { home: { id: home.id, name: home.name } } : {}), signals };
    },
  });
}
