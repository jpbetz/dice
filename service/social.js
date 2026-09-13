/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import crypto from 'node:crypto';
import { StoreError } from './store.js';
import { canonicalLibraryValue } from '../js/library-document.js';
import { checkHomeRecord, homeCard } from './homes.js';

export const SOCIAL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FRIENDS = 32, MAX_BLOCKED = 128, MAX_PENDING = 32, MAX_ROWS = 256, MAX_OPS = 2000;
const PAGE_SIZE = 20;
const BLOCKED_PAGE_SIZE = 32;
const personId = value => typeof value === 'string' && /^p_[A-Za-z0-9_-]{43}$/.test(value);
const homeId = value => typeof value === 'string' && /^h_[A-Za-z0-9_-]{43}$/.test(value);
const inviteId = value => typeof value === 'string' && /^i_[a-f0-9]{64}$/.test(value);
const operationId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(value);
const digest = value => crypto.createHash('sha256').update(canonicalLibraryValue(value)).digest('hex');
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validContactCode = value => typeof value === 'string' && /^dc1_[A-Za-z0-9_-]{43}$/.test(value)
  && Buffer.from(value.slice(4), 'base64url').toString('base64url') === value.slice(4);
const fields = (input, allowed) => input && typeof input === 'object' && !Array.isArray(input)
  && Object.keys(input).every(key => allowed.includes(key));
const refuse = (status, code, message) => ({ ok: false, status, code, message });
const invalid = () => refuse(400, 'invalid_social', 'Check the People action and try again.');
const absent = () => refuse(404, 'social_not_found', 'This connection or invitation is not available.');
const unavailable = () => refuse(409, 'contact_unavailable', 'This contact request is not available.');
const limited = () => refuse(429, 'social_limit', 'People storage is full. Archive finished invitations or keep an export.');
const pairPath = (a, b) => `relationships/${digest(['dice-relationship-v1', ...[a, b].sort()])}`;
const codePath = hash => `contactCodes/${hash}`;
const codeHash = code => digest(['dice-contact-code-v1', code]);
const directoryPath = id => `socialPeople/${id}`;
const operationPath = (id, operation) => `socialOperations/${id}/operations/${operation}`;
const invitationPath = id => `invitations/${id}`;
const identity = person => ({ id: person.id, displayName: person.displayName });
const unique = (array, valid, max) => Array.isArray(array) && array.length <= max
  && array.every(valid) && new Set(array).size === array.length;
const states = ['pending', 'accepted', 'declined', 'cancelled', 'expired'];

function checkPerson(value, id) {
  if (!value || value.schema !== 1 || value.id !== id || !personId(id)
      || typeof value.displayName !== 'string' || !value.displayName || value.displayName.length > 24
      || (value.socialSchema !== undefined && value.socialSchema !== 1)
      || !unique(value.homeIds, homeId, 32)) throw new StoreError('corrupt');
  return value;
}
function newDirectory(id) {
  return { schema: 1, personId: id, friendIds: [], blockedIds: [], incoming: [], outgoing: [],
    codeHash: null, codeIssuedAt: null, codeExpiresAt: null, operations: [], quotaDay: null, quotaSent: 0 };
}
function checkDirectory(value, id) {
  if (value === null) return newDirectory(id);
  const rows = entries => Array.isArray(entries) && entries.length <= MAX_ROWS
    && entries.every(entry => entry && inviteId(entry.id) && ['friend', 'home'].includes(entry.kind)
      && personId(entry.otherPersonId) && states.includes(entry.state) && Number.isFinite(entry.expiresAt))
    && new Set(entries.map(entry => entry.id)).size === entries.length;
  if (value.schema !== 1 || value.personId !== id || !unique(value.friendIds, personId, MAX_FRIENDS)
      || !unique(value.blockedIds, personId, MAX_BLOCKED) || !rows(value.incoming) || !rows(value.outgoing)
      || !unique(value.operations, operationId, MAX_OPS) || !Number.isSafeInteger(value.quotaSent) || value.quotaSent < 0
      || (value.quotaDay !== null && (typeof value.quotaDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.quotaDay)))
      || (value.codeHash !== null && (!validHash(value.codeHash) || !Number.isFinite(value.codeIssuedAt)
        || !Number.isFinite(value.codeExpiresAt) || value.codeExpiresAt <= value.codeIssuedAt))) throw new StoreError('corrupt');
  return value;
}
function checkRelationship(value, a, b) {
  const pair = [a, b].sort();
  if (value === null) return { schema: 1, pair, state: 'none', generation: 0, removedAt: null, blockedBy: [] };
  if (value.schema !== 1 || canonicalLibraryValue(value.pair) !== canonicalLibraryValue(pair)
      || !['none', 'friends'].includes(value.state) || !Number.isSafeInteger(value.generation) || value.generation < 0
      || (value.removedAt !== null && !Number.isFinite(value.removedAt))
      || !unique(value.blockedBy, id => pair.includes(id), 2)
      || (value.state === 'friends' && value.blockedBy.length)) throw new StoreError('corrupt');
  return value;
}
function checkInvitation(value, id) {
  if (!value || value.schema !== 1 || value.id !== id || !inviteId(id) || !personId(value.fromPersonId)
      || !personId(value.toPersonId) || value.fromPersonId === value.toPersonId
      || !['friend', 'home'].includes(value.kind) || !states.includes(value.state)
      || !Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt) || value.expiresAt <= value.createdAt
      || (value.actedAt !== null && !Number.isFinite(value.actedAt))
      || !Number.isSafeInteger(value.relationshipGeneration) || value.relationshipGeneration < 0
      || (value.kind === 'home' ? !homeId(value.homeId) : value.homeId !== null)) throw new StoreError('corrupt');
  return value;
}
function checkCode(value, hash) {
  if (!value || value.schema !== 1 || value.hash !== hash || !personId(value.personId)
      || !Number.isFinite(value.issuedAt) || !Number.isFinite(value.expiresAt)
      || value.expiresAt <= value.issuedAt) throw new StoreError('corrupt');
  return value;
}
function checkPair(relation, a, b) {
  const friends = relation.state === 'friends';
  if (a.friendIds.includes(b.personId) !== friends || b.friendIds.includes(a.personId) !== friends
      || a.blockedIds.includes(b.personId) !== relation.blockedBy.includes(a.personId)
      || b.blockedIds.includes(a.personId) !== relation.blockedBy.includes(b.personId)) throw new StoreError('corrupt');
}
function checkReceipt(receipt, id) {
  const outcomes = ['invitation', 'contactCode', 'changedPersonId', 'archivedInvitationId'];
  if (!fields(receipt, ['ok', 'personId', ...outcomes]) || receipt.ok !== true || receipt.personId !== id
      || outcomes.filter(key => Object.hasOwn(receipt, key)).length !== 1) throw new StoreError('corrupt');
  if (receipt.changedPersonId !== undefined && !personId(receipt.changedPersonId)) throw new StoreError('corrupt');
  if (receipt.archivedInvitationId !== undefined && !inviteId(receipt.archivedInvitationId)) throw new StoreError('corrupt');
  const code = receipt.contactCode;
  if (Object.hasOwn(receipt, 'contactCode') && (!fields(code, ['enabled', 'issuedAt', 'expiresAt'])
      || typeof code.enabled !== 'boolean' || (code.issuedAt === null
        ? code.enabled || code.expiresAt !== null
        : !Number.isFinite(code.issuedAt) || !Number.isFinite(code.expiresAt)))) throw new StoreError('corrupt');
  const card = receipt.invitation;
  if (Object.hasOwn(receipt, 'invitation')) {
    if (!fields(card, ['id', 'kind', 'state', 'createdAt', 'expiresAt', 'actedAt', 'otherPerson', 'home'])
        || !inviteId(card.id) || !['friend', 'home'].includes(card.kind) || !states.includes(card.state)
        || !Number.isFinite(card.createdAt) || !Number.isFinite(card.expiresAt)
        || (card.actedAt !== null && !Number.isFinite(card.actedAt))
        || !fields(card.otherPerson, ['id', 'displayName']) || !personId(card.otherPerson.id)
        || typeof card.otherPerson.displayName !== 'string' || card.otherPerson.displayName.length > 24) throw new StoreError('corrupt');
    if (card.kind === 'friend' ? card.home !== null : !fields(card.home, ['id', 'name', 'coverId', 'cover'])
        || !homeId(card.home.id) || typeof card.home.name !== 'string' || card.home.name.length > 28
        || typeof card.home.coverId !== 'string' || !fields(card.home.cover, ['venue', 'felt'])
        || typeof card.home.cover.venue !== 'string' || typeof card.home.cover.felt !== 'string') throw new StoreError('corrupt');
  }
  return receipt;
}

// Defer physical writes until every dependency has been read. Domain helpers
// can compose one atomic membership/relationship action without adapter-specific
// queries or writing before later reads. Refused actions discard staged changes.
function context(tx) {
  const values = new Map(), writes = new Map();
  return {
    async get(path) {
      if (writes.has(path)) return writes.get(path);
      if (!values.has(path)) values.set(path, await tx.get(path));
      return values.get(path);
    },
    put(path, value) {
      if (path.startsWith('socialPeople/')) {
        const personPath = `people/${path.slice('socialPeople/'.length)}`;
        const account = writes.get(personPath) || values.get(personPath);
        if (!account) throw new StoreError('corrupt');
        // A durable marker distinguishes an untouched account from a missing
        // directory. Deleting one kept record must not look like empty storage.
        writes.set(personPath, { ...account, socialSchema: 1 });
      }
      writes.set(path, value);
    },
    delete(path) { writes.set(path, null); },
    flush() { for (const [path, value] of writes) value === null ? tx.delete(path) : tx.put(path, value); },
  };
}
async function directory(ctx, id) {
  const account = await person(ctx, id), raw = await ctx.get(directoryPath(id));
  if ((raw === null) !== (account.socialSchema === undefined)) throw new StoreError('corrupt');
  return checkDirectory(raw, id);
}
async function person(ctx, id) { return checkPerson(await ctx.get(`people/${id}`), id); }
async function relationship(ctx, a, b) { return checkRelationship(await ctx.get(pairPath(a, b)), a, b); }
// Server-only readers for presence permission projection. Relationships remain
// authoritative; no durable directory is copied into a public room payload.
export { directory as readSocialDirectory, relationship as readRelationship, checkPerson as checkSocialPerson };
const add = (array, id) => array.includes(id) ? array : [...array, id];
const remove = (array, id) => array.filter(value => value !== id);
const pending = (entries, at) => entries.filter(entry => entry.state === 'pending' && entry.expiresAt > at).length;
const indexEntry = (invitation, otherPersonId) => ({ id: invitation.id, kind: invitation.kind,
  otherPersonId, state: invitation.state, expiresAt: invitation.expiresAt });

async function effective(ctx, invitation, at) {
  if (invitation.state !== 'pending') return invitation.state;
  if (invitation.expiresAt <= at) return 'expired';
  const relation = await relationship(ctx, invitation.fromPersonId, invitation.toPersonId);
  if (relation.generation !== invitation.relationshipGeneration || relation.blockedBy.length) return 'cancelled';
  if (invitation.kind === 'home') {
    if (relation.state !== 'friends') return 'cancelled';
    const home = checkHomeRecord(await ctx.get(`homes/${invitation.homeId}`), invitation.homeId);
    if (!home.memberIds.includes(invitation.fromPersonId)) return 'cancelled';
  } else if (relation.state === 'friends') return 'cancelled';
  return 'pending';
}
async function finishInvitation(ctx, invitation, state, at) {
  const sender = await directory(ctx, invitation.fromPersonId), recipient = await directory(ctx, invitation.toPersonId);
  const next = { ...invitation, state, actedAt: at };
  const update = entries => entries.map(entry => entry.id === invitation.id ? { ...entry, state } : entry);
  ctx.put(directoryPath(sender.personId), { ...sender, outgoing: update(sender.outgoing) });
  ctx.put(directoryPath(recipient.personId), { ...recipient, incoming: update(recipient.incoming) });
  ctx.put(invitationPath(invitation.id), next);
  return next;
}
async function card(ctx, invitation, viewer, at) {
  const state = await effective(ctx, invitation, at);
  const other = await person(ctx, invitation.fromPersonId === viewer ? invitation.toPersonId : invitation.fromPersonId);
  let home = null;
  if (invitation.kind === 'home') {
    const saved = checkHomeRecord(await ctx.get(`homes/${invitation.homeId}`), invitation.homeId);
    const summary = homeCard(saved);
    home = { id: summary.id, name: summary.name, coverId: summary.coverId, cover: summary.cover };
  }
  return { id: invitation.id, kind: invitation.kind, state, createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt, actedAt: invitation.actedAt, otherPerson: identity(other), home };
}

export function createSocialDomain({ now = Date.now } = {}) {
  async function createInvitation(ctx, self, input, kind, at) {
    const own = await directory(ctx, self.id);
    let to, target, relation;
    if (kind === 'friend') {
      if (!validContactCode(input.code)) return unavailable();
      const hash = codeHash(input.code), raw = await ctx.get(codePath(hash));
      if (raw === null) return unavailable();
      const code = checkCode(raw, hash);
      if (code.expiresAt <= at || code.personId === self.id) return unavailable();
      to = code.personId;
      target = await directory(ctx, to);
      if (target.codeHash !== hash || target.codeIssuedAt !== code.issuedAt || target.codeExpiresAt !== code.expiresAt) throw new StoreError('corrupt');
      relation = await relationship(ctx, self.id, to);
      checkPair(relation, own, target);
      if (relation.state === 'friends' || relation.blockedBy.length
          || (relation.removedAt !== null && code.issuedAt <= relation.removedAt)) return unavailable();
    } else {
      if (!personId(input.toPersonId) || input.toPersonId === self.id || !homeId(input.homeId)) return invalid();
      to = input.toPersonId;
      if (!own.friendIds.includes(to)) return unavailable();
      target = await directory(ctx, to);
      relation = await relationship(ctx, self.id, to);
      checkPair(relation, own, target);
      if (relation.state !== 'friends' || relation.blockedBy.length || !target.friendIds.includes(self.id)) throw new StoreError('corrupt');
      if (!self.homeIds.includes(input.homeId)) return absent();
      const home = checkHomeRecord(await ctx.get(`homes/${input.homeId}`), input.homeId);
      if (!home.memberIds.includes(self.id)) throw new StoreError('corrupt');
    }
    await person(ctx, to);
    if (own.outgoing.length >= MAX_ROWS || target.incoming.length >= MAX_ROWS
        || pending(own.outgoing, at) >= MAX_PENDING || pending(target.incoming, at) >= MAX_PENDING) return limited();
    if (kind === 'friend') for (const row of own.outgoing.filter(row => row.kind === 'friend'
        && row.otherPersonId === to && row.state === 'pending' && row.expiresAt > at)) {
      const previous = checkInvitation(await ctx.get(invitationPath(row.id)), row.id);
      if (await effective(ctx, previous, at) === 'pending') return refuse(409, 'request_pending', 'A connection request is already waiting.');
    }
    const day = new Date(at).toISOString().slice(0, 10), sent = own.quotaDay === day ? own.quotaSent : 0;
    if (sent >= 16) return refuse(429, 'social_send_limit', 'The daily invitation limit is reached. Try another day.');
    const id = `i_${digest(['dice-invitation-v1', self.id, input.operationId])}`;
    if (await ctx.get(invitationPath(id)) !== null) throw new StoreError('corrupt');
    const invitation = { schema: 1, id, kind, fromPersonId: self.id, toPersonId: to,
      homeId: kind === 'home' ? input.homeId : null, relationshipGeneration: relation.generation,
      state: 'pending', createdAt: at, expiresAt: at + SOCIAL_EXPIRY_MS, actedAt: null };
    ctx.put(invitationPath(id), invitation);
    ctx.put(directoryPath(self.id), { ...own, outgoing: [...own.outgoing, indexEntry(invitation, to)], quotaDay: day, quotaSent: sent + 1 });
    ctx.put(directoryPath(to), { ...target, incoming: [...target.incoming, indexEntry(invitation, self.id)] });
    return { ok: true, personId: self.id, invitation: await card(ctx, invitation, self.id, at) };
  }
  async function act(ctx, self, action, id, input, at) {
    if (action === 'code') {
      if (input.code !== null && !validContactCode(input.code)) return invalid();
      const own = await directory(ctx, self.id);
      const hash = input.code === null ? null : codeHash(input.code);
      if (own.codeHash) {
        const previous = checkCode(await ctx.get(codePath(own.codeHash)), own.codeHash);
        if (previous.personId !== self.id || previous.issuedAt !== own.codeIssuedAt || previous.expiresAt !== own.codeExpiresAt) throw new StoreError('corrupt');
        if (hash === own.codeHash) return { ok: true, personId: self.id, contactCode: {
          enabled: own.codeExpiresAt > at, issuedAt: own.codeIssuedAt, expiresAt: own.codeExpiresAt } };
      }
      if (hash) {
        const previous = await ctx.get(codePath(hash));
        if (previous !== null && checkCode(previous, hash).personId !== self.id) return unavailable();
      }
      if (own.codeHash && own.codeHash !== hash) ctx.delete(codePath(own.codeHash));
      if (hash) ctx.put(codePath(hash), { schema: 1, hash, personId: self.id, issuedAt: at, expiresAt: at + SOCIAL_EXPIRY_MS });
      ctx.put(directoryPath(self.id), { ...own, codeHash: hash, codeIssuedAt: hash ? at : null,
        codeExpiresAt: hash ? at + SOCIAL_EXPIRY_MS : null });
      return { ok: true, personId: self.id, contactCode: { enabled: !!hash, issuedAt: hash ? at : null, expiresAt: hash ? at + SOCIAL_EXPIRY_MS : null } };
    }
    if (action === 'request' || action === 'invite') return createInvitation(ctx, self, input, action === 'request' ? 'friend' : 'home', at);
    if (action === 'remove' || action === 'block') {
      if (!personId(id) || id === self.id || (action === 'block' && typeof input.blocked !== 'boolean')) return invalid();
      const own = await directory(ctx, self.id);
      // IDs must come from a connection/request intentionally visible to this
      // account. Arbitrary account ID probes do not become a user directory.
      if (!own.friendIds.includes(id) && !own.blockedIds.includes(id)
          && ![...own.incoming, ...own.outgoing].some(row => row.otherPersonId === id)) return absent();
      await person(ctx, id);
      const other = await directory(ctx, id), relation = await relationship(ctx, self.id, id);
      checkPair(relation, own, other);
      const blocking = action === 'block' && input.blocked;
      if ((action === 'block' && relation.blockedBy.includes(self.id) === input.blocked)
          || (action === 'remove' && relation.state === 'none')) return { ok: true, personId: self.id, changedPersonId: id };
      if (blocking && !own.blockedIds.includes(id) && own.blockedIds.length >= MAX_BLOCKED) return limited();
      const removing = action === 'remove' || blocking;
      ctx.put(pairPath(self.id, id), { ...relation, state: removing ? 'none' : relation.state,
        generation: relation.generation + 1, removedAt: removing ? at : relation.removedAt,
        blockedBy: action === 'block' ? (blocking ? add(relation.blockedBy, self.id) : remove(relation.blockedBy, self.id)) : relation.blockedBy });
      ctx.put(directoryPath(self.id), { ...own, friendIds: removing ? remove(own.friendIds, id) : own.friendIds,
        blockedIds: action === 'block' ? (blocking ? add(own.blockedIds, id) : remove(own.blockedIds, id)) : own.blockedIds });
      if (removing) ctx.put(directoryPath(id), { ...other, friendIds: remove(other.friendIds, self.id) });
      return { ok: true, personId: self.id, changedPersonId: id };
    }
    if (!inviteId(id)) return absent();
    const raw = await ctx.get(invitationPath(id));
    if (raw === null) return absent();
    const invitation = checkInvitation(raw, id);
    if (![invitation.fromPersonId, invitation.toPersonId].includes(self.id)) return absent();
    if (action === 'respond' && (invitation.toPersonId !== self.id || !['accept', 'decline'].includes(input.choice))) return absent();
    if (action === 'cancel' && invitation.fromPersonId !== self.id) return absent();
    let state = await effective(ctx, invitation, at);
    if (action === 'archive') {
      if (state === 'pending') return refuse(409, 'invitation_pending', 'Respond to or cancel this invitation before archiving it.');
      if (state !== invitation.state) await finishInvitation(ctx, invitation, state, at);
      const own = await directory(ctx, self.id);
      const side = invitation.fromPersonId === self.id ? 'outgoing' : 'incoming';
      ctx.put(directoryPath(self.id), { ...own, [side]: own[side].filter(row => row.id !== id) });
      return { ok: true, personId: self.id, archivedInvitationId: id };
    }
    if (state === 'pending') {
      state = action === 'cancel' ? 'cancelled' : input.choice === 'decline' ? 'declined' : 'accepted';
      if (state === 'accepted') {
        if (invitation.kind === 'friend') {
          const sender = await directory(ctx, invitation.fromPersonId), recipient = await directory(ctx, self.id);
          if (sender.friendIds.length >= MAX_FRIENDS || recipient.friendIds.length >= MAX_FRIENDS) return limited();
          const relation = await relationship(ctx, invitation.fromPersonId, self.id);
          checkPair(relation, sender, recipient);
          ctx.put(pairPath(invitation.fromPersonId, self.id), { ...relation, state: 'friends', generation: relation.generation + 1 });
          ctx.put(directoryPath(invitation.fromPersonId), { ...sender, friendIds: add(sender.friendIds, self.id) });
          ctx.put(directoryPath(self.id), { ...recipient, friendIds: add(recipient.friendIds, invitation.fromPersonId) });
        } else {
          const home = checkHomeRecord(await ctx.get(`homes/${invitation.homeId}`), invitation.homeId);
          if ((!home.memberIds.includes(self.id) && home.memberIds.length >= 32)
              || (!self.homeIds.includes(home.id) && self.homeIds.length >= 32)) return limited();
          ctx.put(`homes/${home.id}`, { ...home, memberIds: add(home.memberIds, self.id), updatedAt: at });
          ctx.put(`people/${self.id}`, { ...self, homeIds: add(self.homeIds, home.id) });
        }
      }
    }
    const finished = state === invitation.state ? invitation : await finishInvitation(ctx, invitation, state, at);
    return { ok: true, personId: self.id, invitation: await card(ctx, finished, self.id, at) };
  }
  return Object.freeze({
    async read(tx, self, action, input = {}) {
      checkPerson(self, self.id);
      const ctx = context(tx), own = await directory(ctx, self.id), at = now();
      if (action === 'people') {
        const friends = [];
        for (const id of own.friendIds) {
          const relation = await relationship(ctx, self.id, id), other = await directory(ctx, id);
          checkPair(relation, own, other);
          if (relation.state !== 'friends' || relation.blockedBy.length || !other.friendIds.includes(self.id)) throw new StoreError('corrupt');
          friends.push(identity(await person(ctx, id)));
        }
        return { ok: true, personId: self.id, friends, blockedPersonIds: [...own.blockedIds],
          contactCode: { enabled: !!own.codeHash && own.codeExpiresAt > at,
            issuedAt: own.codeIssuedAt, expiresAt: own.codeExpiresAt } };
      }
      if(action==='blocked-people'){
        if(!fields(input,['after'])||(input.after!==undefined&&!personId(input.after)))return invalid();
        const start=input.after===undefined?0:own.blockedIds.indexOf(input.after)+1;
        if(input.after!==undefined&&start===0)return invalid();
        const chosen=own.blockedIds.slice(start,start+BLOCKED_PAGE_SIZE),blockedPeople=[];
        // A page touches at most 99 records including authentication. Resolve
        // only this owner's blocked IDs, and verify both directory/pair sides.
        for(const id of chosen){const relation=await relationship(ctx,self.id,id),other=await directory(ctx,id);checkPair(relation,own,other);
          if(!relation.blockedBy.includes(self.id))throw new StoreError('corrupt');
          blockedPeople.push(identity(await person(ctx,id)));
        }
        return {ok:true,personId:self.id,blockedPeople,next:start+chosen.length<own.blockedIds.length?chosen.at(-1):null};
      }
      if (!fields(input, ['direction', 'after']) || !['incoming', 'outgoing'].includes(input.direction)
          || (input.after !== undefined && !inviteId(input.after))) return invalid();
      const entries = own[input.direction];
      const start = input.after === undefined ? 0 : entries.findIndex(entry => entry.id === input.after) + 1;
      if (input.after !== undefined && start === 0) return invalid();
      const chosen = entries.slice(start, start + PAGE_SIZE), invitations = [];
      for (const row of chosen) {
        const invitation = checkInvitation(await ctx.get(invitationPath(row.id)), row.id);
        if ((input.direction === 'incoming' ? invitation.toPersonId : invitation.fromPersonId) !== self.id
            || row.otherPersonId !== (input.direction === 'incoming' ? invitation.fromPersonId : invitation.toPersonId)
            || row.state !== invitation.state || row.kind !== invitation.kind || row.expiresAt !== invitation.expiresAt) throw new StoreError('corrupt');
        invitations.push(await card(ctx, invitation, self.id, at));
      }
      return { ok: true, personId: self.id, direction: input.direction, invitations,
        next: start + chosen.length < entries.length ? chosen.at(-1).id : null };
    },
    async mutate(tx, self, action, id, input) {
      checkPerson(self, self.id);
      const allowed = { code: ['code'], request: ['code'], invite: ['toPersonId', 'homeId'],
        remove: [], block: ['blocked'], respond: ['choice'], cancel: [], archive: [] }[action];
      if (!allowed || !fields(input, ['operationId', ...allowed]) || !operationId(input.operationId)) return invalid();
      const ctx = context(tx), own = await directory(ctx, self.id);
      const requestDigest = digest({ action, id: id || null, input });
      const path = operationPath(self.id, input.operationId), previous = await ctx.get(path);
      if (previous !== null) {
        if (previous.schema !== 1 || !validHash(previous.digest) || !previous.receipt?.ok
            || previous.receipt.personId !== self.id || !own.operations.includes(input.operationId)) throw new StoreError('corrupt');
        return previous.digest === requestDigest ? checkReceipt(previous.receipt, self.id)
          : refuse(409, 'operation_reused', 'This action ID belongs to different changes.');
      }
      if (own.operations.includes(input.operationId)) throw new StoreError('corrupt');
      if (own.operations.length >= MAX_OPS) return limited();
      const result = await act(ctx, self, action, id, input, now());
      if (!result.ok) return result;
      // A historical acceptance receipt is an acknowledgement, never a new
      // grant. Retrying it after removal/leave returns here without mutation.
      const finalOwn = await directory(ctx, self.id);
      ctx.put(directoryPath(self.id), { ...finalOwn, operations: [...own.operations, input.operationId] });
      ctx.put(path, { schema: 1, digest: requestDigest, receipt: result });
      ctx.flush();
      return result;
    },
  });
}
