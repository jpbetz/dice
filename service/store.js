/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// The optional account service's small storage contract. These modules are
// server-only and are deliberately outside server.js's static allowlist.
export const STORE_SCHEMA = 1;
export const MAX_RECORD_BYTES = 512 * 1024;
export const MAX_TRANSACTION_RECORDS = 128;
export const MAX_TRANSACTION_BYTES = 8 * 1024 * 1024;

const messages = Object.freeze({
  invalid: 'Invalid storage request.', closed: 'Storage is closed.',
  locked: 'Storage already has a writer.', corrupt: 'Stored data needs recovery.',
  limit: 'Storage limit reached.', unavailable: 'Storage is unavailable.',
  busy: 'Storage is busy. Try again.', timeout: 'Storage request timed out.',
  uncertain: 'Save confirmation was lost. Check the saved version before retrying.',
});

export class StoreError extends Error {
  constructor(code) {
    super(messages[code] || messages.unavailable);
    this.name = 'StoreError';
    this.code = Object.hasOwn(messages, code) ? code : 'unavailable';
  }
}

export function storageError(error, fallback = 'unavailable') {
  return error instanceof StoreError ? error : new StoreError(fallback);
}

export function validPath(path) {
  if (typeof path !== 'string') throw new StoreError('invalid');
  const parts = path.split('/');
  if (parts.length < 2 || parts.length > 12 || parts.length % 2
      || parts.some(part => !/^[A-Za-z0-9_-]{1,128}$/.test(part) || /^__.*__$/.test(part))) {
    throw new StoreError('invalid');
  }
  return path;
}

export function jsonCopy(value, { record = true, code = 'invalid' } = {}) {
  const seen = new Set();
  function check(v, depth) {
    if (depth > 20) throw new StoreError(code);
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object' || seen.has(v)) throw new StoreError(code);
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype
        && Object.getPrototypeOf(v) !== null) throw new StoreError(code);
    if (Object.getOwnPropertySymbols(v).length) throw new StoreError(code);
    if (Array.isArray(v) && Object.keys(v).length !== v.length) throw new StoreError(code);
    seen.add(v);
    for (const [key, child] of Object.entries(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new StoreError(code);
      check(child, depth + 1);
    }
    seen.delete(v);
  }
  if (record && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new StoreError(code);
  }
  check(value, 0);
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > MAX_RECORD_BYTES) throw new StoreError('limit');
  return JSON.parse(encoded);
}

// A transaction must read every dependency before queuing its first write.
// The callback is pure apart from this interface and may be retried remotely.
export function transactionView(read, { maxRecords = MAX_TRANSACTION_RECORDS } = {}) {
  const reads = new Map();
  const writes = new Map();
  const writeSizes = new Map();
  const touched = new Set();
  let writeBytes = 8192; // transaction token and outer JSON envelope
  let active = true;
  const touch = path => {
    if (!active) throw new StoreError('closed');
    validPath(path);
    touched.add(path);
    if (touched.size > maxRecords) throw new StoreError('limit');
  };
  const write = (path, value) => {
    touch(path);
    const copy = value === null ? null : jsonCopy(value);
    // Conservative Firestore REST encoding budget, shared by file mode:
    // data is a JSON string in its document; reserve the bounded name/type
    // envelope too. This keeps a locally accepted transaction portable.
    const size = Buffer.byteLength(path) + 1024
      + (copy === null ? 0 : Buffer.byteLength(JSON.stringify(JSON.stringify(copy))));
    const total = writeBytes - (writeSizes.get(path) || 0) + size;
    if (total > MAX_TRANSACTION_BYTES) throw new StoreError('limit');
    writeBytes = total;
    writeSizes.set(path, size);
    writes.set(path, copy);
  };
  return {
    writes,
    finish() { active = false; },
    api: Object.freeze({
      async get(path) {
        touch(path);
        if (writes.size) throw new StoreError('invalid');
        if (!reads.has(path)) reads.set(path, Promise.resolve().then(() => read(path)));
        const value = await reads.get(path);
        return value === null ? null : jsonCopy(value);
      },
      put(path, value) { if (value === null) throw new StoreError('invalid'); write(path, value); },
      delete(path) { write(path, null); },
    }),
  };
}
