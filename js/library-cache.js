/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import { validateLibraryDocument, canonicalLibraryValue, reconcileLibraryDocuments,
  libraryDocument, MAX_LIBRARY_VERSIONS } from './library-document.js';

// One IDB transaction owns each namespace change. No in-memory or localStorage
// substitute can report an offline edit as durable. A stale tab retains its
// candidate and receives a conflict instead of replacing the current working copy.
export const LIBRARY_CACHE_DB = 'dice.private-libraries.v1';
export const MAX_LOCAL_ENTRIES = 128;
export const MAX_LOCAL_BYTES = 16 * 1024 * 1024;
const STORE = 'namespaces';
const encoder = new TextEncoder();
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => canonicalLibraryValue(a) === canonicalLibraryValue(b);
const namespaceValid = value => value === 'guest' || /^p_[A-Za-z0-9_-]{43}$/.test(value);
const idValid = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(value);
const revisionValid = value => value === null || (typeof value === 'string' && /^[vo]_[A-Za-z0-9_-]{8,80}$/.test(value));
const refusal = (code, message) => ({ ok: false, code, message });
const corrupt = () => refusal('cache_corrupt', 'This saved workspace needs recovery. Export it before changing anything.');
const capacity = () => refusal('cache_full', 'Local saved-version storage is full. Export your changes; no original was removed.');
const unavailable = () => refusal('cache_unavailable', 'This browser could not save your changes. Keep or export the original.');
const stale = () => refusal('local_conflict', 'Another tab changed this workspace. Both versions are kept.');
const entryById = (state, id) => state.entries.find(entry => entry.id === id);
const working = state => entryById(state, state.workingId).document;
const activeStatus = item => ['pending', 'conflict', 'refused'].includes(item.status);
const definitiveRefusal = result => result?.ok === false && ['invalid_library', 'library_limit', 'operation_reused'].includes(result.code);

function compactEdits(state) {
  // Editing an unsubmitted working copy supersedes its intermediate text.
  // Saved uploads, uncertain payloads, conflict candidates and choice originals
  // have references and are never swept by this ordinary edit coalescing.
  const keep = new Set([state.workingId, state.remote?.entryId, ...state.localConflictIds,
    ...state.keptEntryIds,
    ...state.outbox.flatMap(item => [item.entryId, item.retainEntryId])]);
  state.entries = state.entries.filter(entry => keep.has(entry.id));
}

function validState(state, namespace) {
  try {
    if (!state || state.schema !== 1 || state.namespace !== namespace || !namespaceValid(namespace)
        || !Number.isSafeInteger(state.generation) || state.generation < 1
        || !Number.isSafeInteger(state.workingGeneration) || state.workingGeneration < 1
        || typeof state.syncEnabled !== 'boolean' || !revisionValid(state.baseRevision)
        || !Array.isArray(state.entries) || !state.entries.length || state.entries.length > MAX_LOCAL_ENTRIES
        || !Array.isArray(state.outbox) || state.outbox.length > MAX_LIBRARY_VERSIONS
        || !Array.isArray(state.localConflictIds) || !Array.isArray(state.keptEntryIds)) return false;
    const ids = new Set();
    for (const entry of state.entries) {
      if (!entry || !idValid(entry.id) || ids.has(entry.id) || !Number.isFinite(entry.createdAt)
          || !validateLibraryDocument(entry.document).ok) return false;
      ids.add(entry.id);
    }
    if (!ids.has(state.workingId) || state.localConflictIds.some(id => !ids.has(id))
        || new Set(state.localConflictIds).size !== state.localConflictIds.length
        || state.keptEntryIds.some(id => !ids.has(id)) || new Set(state.keptEntryIds).size !== state.keptEntryIds.length) return false;
    const ops = new Set();
    for (const item of state.outbox) {
      if (!item || !idValid(item.operationId) || ops.has(item.operationId) || !ids.has(item.entryId)
          || !revisionValid(item.baseRevision) || typeof item.reconcile !== 'boolean'
          || !['pending', 'saved', 'conflict', 'refused', 'resolved'].includes(item.status)
          || (item.retainEntryId !== null && !ids.has(item.retainEntryId))
          || !Array.isArray(item.sources) || item.sources.length > 8 || item.sources.some(id => id === null || !revisionValid(id))
          || new Set(item.sources).size !== item.sources.length) return false;
      if (item.status === 'pending') { if (item.receipt !== undefined) return false; }
      else if (['refused', 'resolved'].includes(item.status) && definitiveRefusal(item.receipt)) { /* original remains available for a new explicit choice */ }
      else if (!item.receipt || item.receipt.personId !== namespace || item.receipt.headRevision === null
          || !revisionValid(item.receipt.headRevision)
          || (item.receipt.ok === true ? item.status !== 'saved' || item.receipt.revision !== `v_${item.operationId}`
            : item.receipt.ok !== false || item.receipt.code !== 'revision_conflict'
              || item.receipt.candidateRevision !== `v_${item.operationId}` || !['conflict', 'resolved'].includes(item.status))) return false;
      ops.add(item.operationId);
    }
    if (state.outbox.filter(activeStatus).length > 1) return false;
    if (state.remote !== null && (!state.remote || !revisionValid(state.remote.headRevision)
        || (state.remote.headRevision === null ? state.remote.entryId !== null : !ids.has(state.remote.entryId))
        || !Array.isArray(state.remote.versions))) return false;
    return encoder.encode(JSON.stringify(state)).byteLength <= MAX_LOCAL_BYTES;
  } catch { return false; }
}

function append(state, document, id, at) {
  const existing = state.entries.find(entry => equal(entry.document, document));
  if (existing) return existing.id;
  if (state.entries.length >= MAX_LOCAL_ENTRIES) return null;
  state.entries.push({ id, document, createdAt: at });
  return id;
}

function snapshot(state) {
  return { ok: true, state: clone(state), workingGeneration: state.workingGeneration, document: clone(working(state)) };
}

// Pure transition function, also used by the actual IDB writer. The resulting
// object is not acknowledged until that browser transaction has committed.
export function transitionLibraryCache(raw, namespace, action, { id, at }) {
  if (!namespaceValid(namespace) || !idValid(id) || !Number.isFinite(at)) return unavailable();
  if (raw !== undefined && !validState(raw, namespace)) return corrupt();
  if (action.type === 'seed') {
    if (raw !== undefined) return { ...snapshot(raw), changed: false };
    const checked = validateLibraryDocument(action.document);
    if (!checked.ok) return checked;
    const state = { schema: 1, namespace, generation: 1, workingGeneration: 1, syncEnabled: false, baseRevision: null,
      workingId: id, entries: [{ id, document: checked.document, createdAt: at }], outbox: [],
      localConflictIds: [], keptEntryIds: [], remote: null };
    return { ...snapshot(state), changed: true };
  }
  if (raw === undefined) return refusal('cache_missing', 'Open this workspace before changing it.');
  const state = clone(raw);
  let result = { ok: true };
  let changed = true;
  const active = state.outbox.find(activeStatus);
  if (action.type === 'edit') {
    const checked = validateLibraryDocument(action.document);
    if (!checked.ok) return checked;
    if (equal(working(state), checked.document)) return { ...snapshot(state), changed: false };
    const entryId = append(state, checked.document, id, at);
    if (!entryId) return capacity();
    if (action.expectedWorkingGeneration !== state.workingGeneration) {
      if (!state.localConflictIds.includes(entryId)) state.localConflictIds.push(entryId);
      result = { ...stale(), retained: true, entryId };
    } else { state.workingId = entryId; state.workingGeneration++; }
  } else if (action.type === 'choose-local') {
    if (namespace !== 'guest' || state.syncEnabled) return refusal('invalid_choice', 'Review the account library before choosing it.');
    if (action.expectedGeneration !== state.generation) return stale();
    const chosen = entryById(state, action.localEntryId);
    if (!chosen) return corrupt();
    state.keptEntryIds = [...new Set([...state.keptEntryIds, state.workingId, chosen.id, ...state.localConflictIds])];
    state.workingId = chosen.id;
    state.workingGeneration++;
    state.localConflictIds = [];
  } else if (action.type === 'preview') {
    const remote = action.result;
    if (!remote?.ok || remote.personId !== namespace || !revisionValid(remote.headRevision)
        || !Array.isArray(remote.versions) || remote.versions.length > MAX_LIBRARY_VERSIONS) return corrupt();
    let entryId = null;
    if (remote.headRevision === null) { if (remote.document !== null) return corrupt(); }
    else {
      const checked = validateLibraryDocument(remote.document);
      if (!checked.ok) return checked;
      entryId = append(state, checked.document, id, at);
      if (!entryId) return capacity();
    }
    const preview = { headRevision: remote.headRevision, entryId, versions: remote.versions };
    if (equal(preview, state.remote)) changed = false;
    state.remote = preview;
  } else if (action.type === 'choose') {
    if (action.expectedGeneration !== state.generation) return stale();
    if (namespace === 'guest') return refusal('login_required', 'Open an account before syncing.');
    if (!state.remote) return refusal('preview_required', 'Review the saved account library first.');
    if (active?.status === 'pending') return refusal('save_pending', 'Confirm the previous save before choosing another library.');
    const localEntry = entryById(state, action.localEntryId || state.workingId);
    if (!localEntry) return corrupt();
    const remoteDocument = state.remote.entryId ? entryById(state, state.remote.entryId).document : libraryDocument().document;
    const selected = reconcileLibraryDocuments(localEntry.document, remoteDocument, action);
    if (!selected.ok) return selected;
    const entryId = append(state, selected.document, id, at);
    if (!entryId || state.outbox.length >= MAX_LIBRARY_VERSIONS) return capacity();
    // Choosing resolves the visible conflict; its immutable payload and both
    // local inputs stay here for export even after the replacement is saved.
    if (active) active.status = 'resolved';
    state.keptEntryIds = [...new Set([...state.keptEntryIds, state.workingId, localEntry.id,
      ...state.localConflictIds, ...(state.remote.entryId ? [state.remote.entryId] : [])])];
    state.workingId = entryId;
    state.workingGeneration++;
    state.baseRevision = state.remote.headRevision;
    state.syncEnabled = true;
    state.localConflictIds = [];
    state.outbox.push({ operationId: id, entryId, baseRevision: state.baseRevision,
      retainEntryId: entryId === localEntry.id ? null : localEntry.id, reconcile: true,
      sources: [...new Set([state.remote.headRevision, active?.receipt?.candidateRevision].filter(Boolean))], status: 'pending' });
  } else if (action.type === 'begin') {
    if (!state.syncEnabled) return refusal('choice_required', 'Choose a library before enabling sync.');
    if (state.localConflictIds.length) return stale();
    if (active?.status === 'conflict') return { ...refusal('revision_conflict', 'Review both saved versions before syncing.'), receipt: active.receipt };
    if (active?.status === 'refused') return active.receipt;
    if (active) return { ...snapshot(state), changed: false, upload: upload(state, active) };
    const last = state.outbox.at(-1);
    if (last?.entryId === state.workingId && last.status === 'saved') return { ...snapshot(state), changed: false, upload: null };
    if (state.outbox.length >= MAX_LIBRARY_VERSIONS) return capacity();
    const item = { operationId: id, entryId: state.workingId, baseRevision: state.baseRevision,
      retainEntryId: null, reconcile: false, sources: [], status: 'pending' };
    state.outbox.push(item);
    result.upload = upload(state, item);
  } else if (action.type === 'acknowledge') {
    const item = state.outbox.find(entry => entry.operationId === action.operationId);
    if (!item) return corrupt();
    const receipt = action.result;
    if (receipt?.personId !== namespace || (!receipt.ok && receipt.code !== 'revision_conflict')
        || !revisionValid(receipt.headRevision) || receipt.headRevision === null
        || (receipt.ok ? receipt.revision : receipt.candidateRevision) !== `v_${item.operationId}`) return corrupt();
    if (item.receipt) return equal(item.receipt, receipt) ? { ...snapshot(state), changed: false } : corrupt();
    item.receipt = clone(receipt);
    item.status = receipt.ok ? 'saved' : 'conflict';
    if (receipt.ok) state.baseRevision = receipt.headRevision;
  } else if (action.type === 'refuse') {
    const item = state.outbox.find(entry => entry.operationId === action.operationId);
    if (!item || !definitiveRefusal(action.result)) return corrupt();
    if (item.status !== 'pending') return item.receipt && equal(item.receipt, action.result)
      ? { ...snapshot(state), changed: false } : corrupt();
    item.status = 'refused'; item.receipt = clone(action.result);
    result = { ...action.result, retained: true };
  } else if (action.type === 'archive') {
    if (action.expectedGeneration !== state.generation) return stale();
    if (action.discardAcknowledgedHistory !== true || !Array.isArray(action.versionIds)
        || !action.versionIds.length || action.versionIds.some(value => !revisionValid(value) || value === null)) return corrupt();
    const ids = new Set(action.versionIds);
    const sources = new Set(state.outbox.flatMap(item => item.sources));
    const items = state.outbox.filter(item => ids.has(item.receipt?.revision));
    if (items.some(item => item.status !== 'saved' || !item.receipt?.ok || item.reconcile
        || item.entryId === state.workingId || sources.has(item.receipt.revision))) {
      return refusal('version_protected', 'Current work, conflicts and reconciliation originals must be kept.');
    }
    state.outbox = state.outbox.filter(item => !items.includes(item));
  } else return unavailable();
  if (!changed) return { ...snapshot(state), changed: false, ...result };
  state.generation++;
  compactEdits(state);
  if (encoder.encode(JSON.stringify(state)).byteLength > MAX_LOCAL_BYTES) return capacity();
  if (!validState(state, namespace)) return corrupt();
  return { ...snapshot(state), changed: true, ...result };
}

function upload(state, item) {
  return { reconcile: item.reconcile, input: { operationId: item.operationId,
    baseRevision: item.baseRevision, document: clone(entryById(state, item.entryId).document),
    ...(item.retainEntryId ? { retainDocument: clone(entryById(state, item.retainEntryId).document) } : {}),
    ...(item.sources.length ? { sourceVersionIds: [...item.sources] } : {}) } };
}

export async function openLibraryCache({ indexedDB = globalThis.indexedDB, dbName = LIBRARY_CACHE_DB,
  now = Date.now, newId = () => globalThis.crypto.randomUUID(), timeoutMs = 6000 } = {}) {
  let db;
  try {
    db = await new Promise((resolve, reject) => {
      if (!indexedDB) return reject(new Error());
      const request = indexedDB.open(dbName, 1);
      let settled = false;
      const timer = setTimeout(() => { settled = true; reject(new Error()); }, timeoutMs);
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
      request.onerror = request.onblocked = () => { settled = true; clearTimeout(timer); reject(new Error()); };
      request.onsuccess = () => { clearTimeout(timer); if (settled) request.result.close(); else { settled = true; resolve(request.result); } };
    });
  } catch { return unavailable(); }
  db.onversionchange = () => db.close();
  const transact = (namespace, action = null, rawExport = false) => new Promise(resolve => {
    if (!namespaceValid(namespace)) return resolve(unavailable());
    let tx;
    let result;
    let timer;
    try {
      tx = db.transaction(STORE, action ? 'readwrite' : 'readonly', { durability: 'strict' });
      const store = tx.objectStore(STORE);
      const request = store.get(namespace);
      request.onsuccess = () => {
        try {
          const raw = request.result;
          if (rawExport) result = { ok: true, data: raw === undefined ? null : raw };
          else if (action) {
            result = transitionLibraryCache(raw, namespace, action, { id: newId(), at: now() });
            if (result.changed) store.put(result.state, namespace);
          } else result = raw === undefined ? refusal('cache_missing', 'No workspace is saved here.')
            : validState(raw, namespace) ? snapshot(raw) : corrupt();
        } catch { result = unavailable(); tx.abort(); }
      };
      timer = setTimeout(() => { try { tx.abort(); } catch { /* already ended */ } }, timeoutMs);
      tx.oncomplete = () => { clearTimeout(timer); resolve(result || unavailable()); };
      tx.onabort = tx.onerror = () => { clearTimeout(timer); resolve(unavailable()); };
    } catch { clearTimeout(timer); resolve(unavailable()); }
  });
  return Object.freeze({ ok: true,
    read: namespace => transact(namespace),
    seed: (namespace, document) => transact(namespace, { type: 'seed', document }),
    edit: (namespace, expectedWorkingGeneration, document) => transact(namespace, { type: 'edit', expectedWorkingGeneration, document }),
    preview: (namespace, result) => transact(namespace, { type: 'preview', result }),
    choose: (namespace, expectedGeneration, options) => transact(namespace, { ...options, type: 'choose', expectedGeneration }),
    chooseGuest: (expectedGeneration, localEntryId) => transact('guest', { type:'choose-local', expectedGeneration, localEntryId }),
    beginUpload: namespace => transact(namespace, { type: 'begin' }),
    acknowledge: (namespace, operationId, result) => transact(namespace, { type: 'acknowledge', operationId, result }),
    refuse: (namespace, operationId, result) => transact(namespace, { type: 'refuse', operationId, result }),
    archive: (namespace, expectedGeneration, versionIds) => transact(namespace,
      { type: 'archive', expectedGeneration, versionIds, discardAcknowledgedHistory: true }),
    export: namespace => transact(namespace, null, true),
    close: () => db.close(),
  });
}
