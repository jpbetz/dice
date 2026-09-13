/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import crypto from 'node:crypto';
import { MAX_LIBRARY_VERSIONS, MAX_LIBRARY_HISTORY_BYTES, validateLibraryDocument, canonicalLibraryValue } from '../js/library-document.js';
import { StoreError } from './store.js';

const revision = value => typeof value === 'string' && /^[vo]_[A-Za-z0-9_-]{8,80}$/.test(value);
const operation = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(value);
const outcome = (status, code, message) => ({ ok: false, status, code, message });
const absent = () => outcome(404, 'not_found', 'No saved version is available.');
const invalid = () => outcome(400, 'invalid_library', 'Check the library and try again. Your original is still kept.');
const pathFor = (personId, id) => `libraries/${personId}/versions/${id}`;
const metadata = entry => ({ id: entry.id, kind: entry.kind, baseRevision: entry.baseRevision, createdAt: entry.createdAt });
const bytes = document => Buffer.byteLength(JSON.stringify(document));
const MAX_RECEIPTS = 2000;

function directory(person) {
  if (!Array.isArray(person.libraryVersionIds) || person.libraryVersionIds.length > MAX_LIBRARY_VERSIONS
      || person.libraryVersionIds.some(id => !revision(id)) || new Set(person.libraryVersionIds).size !== person.libraryVersionIds.length
      || (person.libraryHead !== null && (!revision(person.libraryHead) || !person.libraryVersionIds.includes(person.libraryHead)))) {
    throw new StoreError('corrupt');
  }
  // D1.1 accounts have an empty index and need no destructive migration.
  const entries = person.libraryVersions ?? (person.libraryVersionIds.length ? null : []);
  const archives = Object.hasOwn(person, 'libraryArchiveIds') ? person.libraryArchiveIds : [];
  if (!Array.isArray(archives) || archives.some(id => !revision(id)) || new Set(archives).size !== archives.length
      || archives.some(id => person.libraryVersionIds.includes(id))
      || archives.length + person.libraryVersionIds.length > MAX_RECEIPTS) throw new StoreError('corrupt');
  if (!Array.isArray(entries) || entries.length !== person.libraryVersionIds.length
      || entries.some((entry, i) => !entry || entry.id !== person.libraryVersionIds[i]
        || !['saved', 'conflict', 'retained-original'].includes(entry.kind)
        || (entry.baseRevision !== null && !revision(entry.baseRevision)) || !Number.isFinite(entry.createdAt)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1
        || !Array.isArray(entry.sourceVersionIds) || entry.sourceVersionIds.length > 8
        || new Set(entry.sourceVersionIds).size !== entry.sourceVersionIds.length
        || entry.sourceVersionIds.some(id => !revision(id) || !person.libraryVersionIds.includes(id)))
      || entries.reduce((sum, entry) => sum + entry.bytes, 0) > MAX_LIBRARY_HISTORY_BYTES) throw new StoreError('corrupt');
  return entries;
}

function checkVersion(entry, id, person) {
  const indexed = person?.libraryVersions?.find(item => item.id === id);
  if (!entry || entry.schema !== 1 || entry.id !== id || !validateLibraryDocument(entry.document).ok
      || !['saved', 'conflict', 'retained-original'].includes(entry.kind)
      || !Number.isFinite(entry.createdAt) || (entry.baseRevision !== null && !revision(entry.baseRevision))
      || (entry.kind !== 'retained-original' && (!/^[a-f0-9]{64}$/.test(entry.operationDigest)
        || !entry.receipt || entry.receipt.personId !== person.id
        || (entry.kind === 'saved' ? entry.receipt.ok !== true || entry.receipt.revision !== id
          : entry.receipt.ok !== false || entry.receipt.code !== 'revision_conflict' || entry.receipt.candidateRevision !== id)))
      || (indexed && (indexed.bytes !== bytes(entry.document)
        || canonicalLibraryValue(metadata(indexed)) !== canonicalLibraryValue(metadata(entry))
        || canonicalLibraryValue(indexed.sourceVersionIds) !== canonicalLibraryValue(entry.sourceVersionIds || [])))) throw new StoreError('corrupt');
  return entry;
}

// Invoked only inside the account service's authenticated transaction. The
// expected-person check happens before a caller can read another namespace.
export async function readLibrary(tx, person, versionId = null) {
  const entries = directory(person);
  if (versionId !== null) {
    if (!revision(versionId) || !person.libraryVersionIds.includes(versionId)) return absent();
    const entry = checkVersion(await tx.get(pathFor(person.id, versionId)), versionId, person);
    return { ok: true, personId: person.id, revision: entry.id, document: entry.document, metadata: metadata(entry) };
  }
  const protectedIds = new Set([person.libraryHead, ...entries.flatMap(entry => entry.sourceVersionIds)]);
  const versions = entries.map(entry => ({ ...metadata(entry), bytes: entry.bytes,
    canArchive: entry.kind === 'saved' && !entry.sourceVersionIds.length && !protectedIds.has(entry.id) }));
  const head = person.libraryHead === null ? null
    : checkVersion(await tx.get(pathFor(person.id, person.libraryHead)), person.libraryHead, person);
  return { ok: true, personId: person.id, headRevision: person.libraryHead,
    document: head?.document || null, versions, historyBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    archivedCount: person.libraryArchiveIds?.length || 0 };
}

export function prepareLibraryWrite(input, reconcile, createdAt) {
  if (!input || Object.keys(input).some(key => !['operationId', 'baseRevision', 'document', 'retainDocument', 'sourceVersionIds'].includes(key))
      || !operation(input.operationId) || (input.baseRevision !== null && !revision(input.baseRevision))) return invalid();
  const checked = validateLibraryDocument(input.document);
  if (!checked.ok) return { ...checked, status: checked.code === 'library_limit' ? 413 : 400 };
  let original = null;
  if (Object.hasOwn(input, 'retainDocument')) {
    if (!reconcile) return invalid();
    const retained = validateLibraryDocument(input.retainDocument);
    if (!retained.ok) return { ...retained, status: retained.code === 'library_limit' ? 413 : 400 };
    if (canonicalLibraryValue(retained.document) !== canonicalLibraryValue(checked.document)) original = retained.document;
  }
  const sources = input.sourceVersionIds || [];
  if (!Array.isArray(sources) || sources.length > 8 || sources.some(id => !revision(id))
      || new Set(sources).size !== sources.length || (!reconcile && sources.length)) return invalid();
  const payload = { action: reconcile ? 'reconcile' : 'save', baseRevision: input.baseRevision,
    document: checked.document, original, sources };
  const digest = crypto.createHash('sha256').update(canonicalLibraryValue(payload)).digest('hex');
  return { ok: true, id: `v_${input.operationId}`, originalId: original ? `o_${input.operationId}` : null,
    createdAt, digest, ...payload };
}

export async function writeLibrary(tx, person, write) {
  const entries = directory(person);
  const existing = await tx.get(pathFor(person.id, write.id));
  if (existing) {
    if (!existing.archived) checkVersion(existing, write.id, person);
    else if (existing.schema !== 1 || existing.id !== write.id || !(person.libraryArchiveIds || []).includes(write.id)) throw new StoreError('corrupt');
    if (existing.operationDigest !== write.digest) return outcome(409, 'operation_reused', 'This save ID already belongs to different changes.');
    if ((!person.libraryVersionIds.includes(write.id) && !(person.libraryArchiveIds || []).includes(write.id)) || !existing.receipt
        || existing.receipt.personId !== person.id) throw new StoreError('corrupt');
    return existing.receipt;
  }
  if ((write.baseRevision !== null && !person.libraryVersionIds.includes(write.baseRevision) && !(person.libraryArchiveIds || []).includes(write.baseRevision))
      || write.sources.some(id => !person.libraryVersionIds.includes(id))) return invalid();
  if (person.libraryHead !== null) checkVersion(await tx.get(pathFor(person.id, person.libraryHead)), person.libraryHead, person);
  const adding = write.originalId ? [write.id, write.originalId] : [write.id];
  if ((person.libraryArchiveIds?.length || 0) + person.libraryVersionIds.length + adding.length > MAX_RECEIPTS) {
    return outcome(429, 'receipt_full', 'Save receipt capacity is full. Export your changes; no saved work was removed.');
  }
  const addedBytes = bytes(write.document) + (write.original ? bytes(write.original) : 0);
  if (person.libraryVersionIds.length + adding.length > MAX_LIBRARY_VERSIONS
      || entries.reduce((sum, entry) => sum + entry.bytes, 0) + addedBytes > MAX_LIBRARY_HISTORY_BYTES) {
    return outcome(429, 'library_full', 'Saved-version storage is full. Export your changes; no version was removed.');
  }
  const conflict = write.baseRevision !== person.libraryHead;
  const receipt = conflict
    ? { ...outcome(409, 'revision_conflict', 'Another device saved changes. Both versions are kept.'),
      personId: person.id, candidateRevision: write.id, headRevision: person.libraryHead,
      ...(write.originalId ? { originalVersionId: write.originalId } : {}) }
    : { ok: true, personId: person.id, revision: write.id, headRevision: write.id,
      ...(write.originalId ? { originalVersionId: write.originalId } : {}) };
  tx.put(pathFor(person.id, write.id), { schema: 1, id: write.id, createdAt: write.createdAt,
    baseRevision: write.baseRevision, kind: conflict ? 'conflict' : 'saved',
    operationDigest: write.digest, sourceVersionIds: write.sources, document: write.document, receipt });
  if (write.originalId) tx.put(pathFor(person.id, write.originalId), { schema: 1,
    id: write.originalId, createdAt: write.createdAt, baseRevision: write.baseRevision,
    kind: 'retained-original', document: write.original });
  tx.put(`people/${person.id}`, { ...person, libraryHead: conflict ? person.libraryHead : write.id,
    libraryVersionIds: [...person.libraryVersionIds, ...adding], libraryVersions: [...entries,
      { id: write.id, kind: conflict ? 'conflict' : 'saved', createdAt: write.createdAt,
        baseRevision: write.baseRevision, bytes: bytes(write.document), sourceVersionIds: write.sources },
      ...(write.originalId ? [{ id: write.originalId, kind: 'retained-original', createdAt: write.createdAt,
        baseRevision: write.baseRevision, bytes: bytes(write.original), sourceVersionIds: [] }] : [])] });
  return receipt;
}

export async function archiveLibrary(tx, person, input) {
  const entries = directory(person);
  if (!input || input.discardAcknowledgedHistory !== true || !Array.isArray(input.versionIds)
      || !input.versionIds.length || input.versionIds.length > 32 || input.versionIds.some(id => !revision(id))
      || new Set(input.versionIds).size !== input.versionIds.length) return invalid();
  const protectedIds = new Set([person.libraryHead, ...entries.flatMap(entry => entry.sourceVersionIds)]);
  const records = [];
  for (const id of input.versionIds) {
    if ((person.libraryArchiveIds || []).includes(id)) continue; // safe retry after a lost cleanup acknowledgement
    const entry = entries.find(item => item.id === id);
    if (!entry || entry.kind !== 'saved' || entry.sourceVersionIds.length || protectedIds.has(id)) return outcome(409, 'version_protected',
      'The current library, conflicts and reconciliation sources must be kept.');
    records.push(checkVersion(await tx.get(pathFor(person.id, id)), id, person));
  }
  for (const entry of records) tx.put(pathFor(person.id, entry.id), { schema: 1, id: entry.id,
    archived: true, operationDigest: entry.operationDigest, receipt: entry.receipt });
  const removed = new Set(records.map(entry => entry.id));
  tx.put(`people/${person.id}`, { ...person, libraryVersionIds: person.libraryVersionIds.filter(id => !removed.has(id)),
    libraryVersions: entries.filter(entry => !removed.has(entry.id)),
    libraryArchiveIds: [...(person.libraryArchiveIds || []), ...removed] });
  return { ok: true, personId: person.id, archivedVersionIds: input.versionIds };
}
