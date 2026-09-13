/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import crypto from 'node:crypto';
import { StoreError, jsonCopy } from './store.js';
import { canonicalLibraryValue } from '../js/library-document.js';

const MAX_HOMES = 32;
const MAX_MEMBERS = 32;
const MAX_VERSIONS = 100;
const MAX_DOCUMENT_BYTES = 400 * 1024;
const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
const MAX_OPERATIONS = 1000;
const homeId = value => typeof value === 'string' && /^h_[A-Za-z0-9_-]{43}$/.test(value);
const versionId = value => typeof value === 'string' && /^v_[A-Za-z0-9_-]{8,80}$/.test(value);
const operationId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(value);
const personId = value => typeof value === 'string' && /^p_[A-Za-z0-9_-]{43}$/.test(value);
const refusal = (status, code, message) => ({ ok: false, status, code, message });
const invalid = () => refusal(400, 'invalid_home', 'Check the saved table details and try again.');
const missing = () => refusal(404, 'home_not_found', 'This saved table is not available to this account.');
const hash = value => crypto.createHash('sha256').update(canonicalLibraryValue(value)).digest('hex');
const mappingPath = room => `homeRooms/${hash(['dice-home-room-v1', room])}`;
const versionPath = (id, version) => `homeVersions/${id}/versions/${version}`;
const operationPath = (id, operation) => `homeOperations/${id}/operations/${operation}`;
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const cover = settings => ({ coverId: settings.venue === 'table' ? settings.felt : settings.venue,
  cover: { venue: settings.venue, felt: settings.felt } });
const revisionFor = (home, person, operation) => `v_${hash(['dice-home-version-v1', home, person, operation])}`;
const fields = (input, allowed) => input && typeof input === 'object' && !Array.isArray(input)
  && Object.keys(input).every(key => allowed.includes(key));
const summary = home => ({ id: home.id, roomKey: home.roomKey, name: home.name,
  coverId: home.coverId, cover: { venue: home.cover.venue, felt: home.cover.felt }, headRevision: home.headRevision, memberCount: home.memberIds.length,
  createdAt: home.createdAt, updatedAt: home.updatedAt });

function directory(person) {
  if (!Array.isArray(person.homeIds) || person.homeIds.length > MAX_HOMES
      || person.homeIds.some(id => !homeId(id)) || new Set(person.homeIds).size !== person.homeIds.length) throw new StoreError('corrupt');
  const ops = Object.hasOwn(person, 'homeOperationIds') ? person.homeOperationIds : [];
  if (!Array.isArray(ops) || ops.length > MAX_OPERATIONS || ops.some(id => !operationId(id))
      || new Set(ops).size !== ops.length) throw new StoreError('corrupt');
  return ops;
}

function checkHome(home, id) {
  if (!home || home.schema !== 1 || home.id !== id || !homeId(id)
      || typeof home.roomKey !== 'string' || !home.roomKey || home.roomKey.length > 64
      || typeof home.name !== 'string' || !home.name || home.name.length > 28
      || typeof home.coverId !== 'string' || home.coverId.length > 128
      || !home.cover || typeof home.cover.venue !== 'string' || typeof home.cover.felt !== 'string'
      || !Number.isFinite(home.createdAt) || !Number.isFinite(home.updatedAt)
      || !Array.isArray(home.memberIds) || home.memberIds.length > MAX_MEMBERS
      || home.memberIds.some(id => !personId(id)) || new Set(home.memberIds).size !== home.memberIds.length
      || !Array.isArray(home.versions) || !home.versions.length || home.versions.length > MAX_VERSIONS
      || home.versions.some(entry => !entry || !versionId(entry.id) || !['saved', 'conflict'].includes(entry.kind)
        || !Number.isFinite(entry.createdAt) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1
        || (entry.baseRevision !== null && !versionId(entry.baseRevision)))
      || new Set(home.versions.map(entry => entry.id)).size !== home.versions.length
      || !home.versions.some(entry => entry.id === home.headRevision && entry.kind === 'saved')
      || home.versions.reduce((sum, entry) => sum + entry.bytes, 0) > MAX_HISTORY_BYTES) throw new StoreError('corrupt');
  return home;
}

// Shared only with the private social service's membership transaction.
export { checkHome as checkHomeRecord, summary as homeCard };

function document(raw, bridge) {
  const copy = jsonCopy(raw);
  if (bytes(copy) > MAX_DOCUMENT_BYTES) return refusal(413, 'home_limit', 'This prepared table is too large to save. Keep its export.');
  const checked = bridge.validate(copy);
  if (!checked?.ok || canonicalLibraryValue(copy) !== canonicalLibraryValue(checked.document)) return invalid();
  return { ok: true, document: copy };
}

function storedVersion(entry, id, home, bridge) {
  const indexed = home.versions.find(item => item.id === id);
  if (!indexed || !entry || entry.schema !== 1 || entry.id !== id || entry.kind !== indexed.kind
      || entry.baseRevision !== indexed.baseRevision || entry.createdAt !== indexed.createdAt
      || !document(entry.document, bridge).ok || bytes(entry.document) !== indexed.bytes) throw new StoreError('corrupt');
  if (id === home.headRevision && (home.name !== entry.document.settings.tableName
      || canonicalLibraryValue(cover(entry.document.settings)) !== canonicalLibraryValue({ coverId: home.coverId, cover: home.cover }))) throw new StoreError('corrupt');
  return entry;
}

// Bridge functions are synchronous projections/validators from the live-room
// server. They have no durable writes and cannot grant gameplay authority.
export function createHomeDomain({ bridge, now = Date.now } = {}) {
  if (!bridge || !['capture', 'validate', 'fresh'].every(key => typeof bridge[key] === 'function')) return null;
  const capture = input => {
    const projected = bridge.capture(input);
    if (!projected?.ok) return projected || invalid();
    const checked = document(projected.document, bridge);
    if (!checked.ok) return checked;
    return { ok: true, roomKey: projected.roomKey, document: checked.document,
      captureRevision: hash(['dice-home-capture-v1', projected.roomKey, checked.document]) };
  };
  const getForMember = async (tx, person, id) => {
    directory(person);
    if (!homeId(id) || !person.homeIds.includes(id)) return missing();
    const home = checkHome(await tx.get(`homes/${id}`), id);
    if (!home.memberIds.includes(person.id)) throw new StoreError('corrupt');
    return { ok: true, home };
  };
  const operation = async (tx, person, input, action) => {
    const ops = directory(person);
    if (!input || !operationId(input.operationId)) return invalid();
    const digest = hash({ action, input });
    const previous = await tx.get(operationPath(person.id, input.operationId));
    if (previous) {
      if (previous.schema !== 1 || !previous.receipt || previous.receipt.personId !== person.id
          || !ops.includes(input.operationId)) throw new StoreError('corrupt');
      return previous.digest === digest ? { ok: true, previous: previous.receipt }
        : refusal(409, 'operation_reused', 'This save ID belongs to different changes.');
    }
    if (ops.length >= MAX_OPERATIONS) return refusal(429, 'home_limit', 'Saved-table receipt storage is full. Keep an export.');
    return { ok: true, digest, ops };
  };
  const recordOperation = (tx, person, input, op, receipt, homeIds = person.homeIds) => {
    tx.put(operationPath(person.id, input.operationId), { schema: 1, digest: op.digest, receipt });
    tx.put(`people/${person.id}`, { ...person, homeIds, homeOperationIds: [...op.ops, input.operationId] });
  };
  return Object.freeze({
    capture: (_tx, person, input) => {
      directory(person);
      if (!fields(input, ['room', 'playerId'])) return invalid();
      const result = capture(input); return result.ok ? { ...result, personId: person.id } : result;
    },
    async list(tx, person) {
      directory(person);
      const homes = [];
      for (const id of person.homeIds) {
        const found = await getForMember(tx, person, id);
        if (!found.ok) return found;
        homes.push(summary(found.home));
      }
      return { ok: true, personId: person.id, homes };
    },
    async read(tx, person, id, revision = null) {
      const found = await getForMember(tx, person, id);
      if (!found.ok) return found;
      const home = found.home;
      const version = revision || home.headRevision;
      if (!home.versions.some(entry => entry.id === version)) return missing();
      const entry = storedVersion(await tx.get(versionPath(id, version)), version, home, bridge);
      return { ok: true, personId: person.id, home: summary(home), revision: version,
        document: entry.document, versions: home.versions.map(({ id, kind, baseRevision, createdAt, bytes }) => ({ id, kind, baseRevision, createdAt, bytes })) };
    },
    async create(tx, person, input) {
      if (!fields(input, input?.room === undefined ? ['operationId', 'name'] : ['operationId', 'room', 'playerId', 'expectedCapture'])) return invalid();
      const op = await operation(tx, person, input, 'create');
      if (!op.ok || op.previous) return op.previous || op;
      if (person.homeIds.length >= MAX_HOMES) return refusal(429, 'home_limit', 'This account has its maximum saved tables.');
      let source;
      if (input.room !== undefined) {
        source = capture(input);
        if (!source.ok) return source;
        if (input.expectedCapture !== source.captureRevision) return refusal(409, 'capture_changed', 'The shared setup changed. Review it again before saving.');
      } else {
        const fresh = bridge.fresh(input.name);
        if (!fresh?.ok) return fresh || invalid();
        const checked = document(fresh.document, bridge);
        if (!checked.ok) return checked;
        source = { ...checked, roomKey: `h_${crypto.randomBytes(32).toString('base64url')}` };
      }
      const name = source.document.settings.tableName;
      if (!name) return refusal(400, 'home_name_required', 'Name this table before saving its home.');
      const mapping = await tx.get(mappingPath(source.roomKey));
      if (mapping) return refusal(409, 'home_exists', 'This address already belongs to a saved table.');
      const id = `h_${crypto.randomBytes(32).toString('base64url')}`;
      const revision = revisionFor(id, person.id, input.operationId);
      if (await tx.get(versionPath(id, revision)) !== null) throw new StoreError('corrupt');
      const at = now();
      const home = { schema: 1, id, roomKey: source.roomKey, name,
        ...cover(source.document.settings), headRevision: revision, memberIds: [person.id],
        createdAt: at, updatedAt: at, versions: [{ id: revision, kind: 'saved', baseRevision: null,
          createdAt: at, bytes: bytes(source.document) }] };
      const receipt = { ok: true, personId: person.id, home: summary(home), revision };
      tx.put(`homes/${id}`, home);
      tx.put(mappingPath(source.roomKey), { schema: 1, homeId: id, roomKey: source.roomKey });
      tx.put(versionPath(id, revision), { schema: 1, id: revision, baseRevision: null,
        kind: 'saved', createdAt: at, document: source.document });
      recordOperation(tx, person, input, op, receipt, [...person.homeIds, id]);
      return receipt;
    },
    async save(tx, person, id, input, reconcile = false) {
      if (!fields(input, reconcile ? ['operationId', 'baseRevision', 'sourceVersionId']
        : ['operationId', 'baseRevision', 'room', 'playerId', 'expectedCapture'])) return invalid();
      const op = await operation(tx, person, input, ['save', id, reconcile]);
      if (!op.ok || op.previous) return op.previous || op;
      const found = await getForMember(tx, person, id);
      if (!found.ok) return found;
      const home = found.home;
      storedVersion(await tx.get(versionPath(id, home.headRevision)), home.headRevision, home, bridge);
      if (!versionId(input.baseRevision) || !home.versions.some(entry => entry.id === input.baseRevision)) return invalid();
      let candidate;
      if (reconcile) {
        if (!versionId(input.sourceVersionId) || !home.versions.some(entry => entry.id === input.sourceVersionId)) return invalid();
        candidate = storedVersion(await tx.get(versionPath(id, input.sourceVersionId)), input.sourceVersionId, home, bridge).document;
      } else {
        const source = capture(input);
        if (!source.ok) return source;
        if (source.roomKey !== home.roomKey) return invalid();
        if (input.expectedCapture !== source.captureRevision) return refusal(409, 'capture_changed', 'The shared setup changed. Review it again before saving.');
        candidate = source.document;
      }
      if (!candidate.settings.tableName) return refusal(400, 'home_name_required', 'Name this table before saving its home.');
      if (home.versions.length >= MAX_VERSIONS || home.versions.reduce((sum, entry) => sum + entry.bytes, 0) + bytes(candidate) > MAX_HISTORY_BYTES) {
        return refusal(429, 'home_limit', 'Saved-table version storage is full. Keep an export; no saved version was removed.');
      }
      const conflict = home.headRevision !== input.baseRevision;
      const revision = revisionFor(id, person.id, input.operationId);
      if (await tx.get(versionPath(id, revision)) !== null) throw new StoreError('corrupt');
      const at = now();
      const metadata = { id: revision, kind: conflict ? 'conflict' : 'saved', baseRevision: input.baseRevision,
        createdAt: at, bytes: bytes(candidate) };
      const next = { ...home, versions: [...home.versions, metadata], ...(conflict ? {} : {
        headRevision: revision, name: candidate.settings.tableName, ...cover(candidate.settings), updatedAt: at }) };
      const receipt = conflict ? { ...refusal(409, 'home_conflict', 'Another member saved this table. Both versions are kept.'),
        personId: person.id, candidateRevision: revision, headRevision: home.headRevision }
        : { ok: true, personId: person.id, home: summary(next), revision };
      tx.put(versionPath(id, revision), { schema: 1, ...metadata, document: candidate });
      tx.put(`homes/${id}`, next);
      recordOperation(tx, person, input, op, receipt);
      return receipt;
    },
    async leave(tx, person, id, input) {
      if (!fields(input, ['operationId'])) return invalid();
      const op = await operation(tx, person, input, ['leave', id]);
      if (!op.ok || op.previous) return op.previous || op;
      const found = await getForMember(tx, person, id);
      if (!found.ok) return found;
      tx.put(`homes/${id}`, { ...found.home, memberIds: found.home.memberIds.filter(member => member !== person.id), updatedAt: now() });
      const receipt = { ok: true, personId: person.id, leftHomeId: id };
      recordOperation(tx, person, input, op, receipt, person.homeIds.filter(home => home !== id));
      return receipt;
    },
    async resolve(tx, roomKey) {
      const mapping = await tx.get(mappingPath(roomKey));
      if (mapping === null) return { ok: true, home: null };
      if (mapping.schema !== 1 || mapping.roomKey !== roomKey || !homeId(mapping.homeId)) throw new StoreError('corrupt');
      const home = checkHome(await tx.get(`homes/${mapping.homeId}`), mapping.homeId);
      if (home.roomKey !== roomKey) throw new StoreError('corrupt');
      if (!home.memberIds.length) return refusal(410, 'home_closed', 'This saved table has no members. Its address remains reserved.');
      const entry = storedVersion(await tx.get(versionPath(home.id, home.headRevision)), home.headRevision, home, bridge);
      // A private membership directory never becomes part of a guest snapshot.
      return { ok: true, home: { document: entry.document } };
    },
  });
}
