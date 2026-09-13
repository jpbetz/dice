/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import { STORE_SCHEMA, MAX_RECORD_BYTES, MAX_TRANSACTION_BYTES, StoreError, storageError,
  validPath, jsonCopy, transactionView } from './store.js';
import { firestoreAddress } from './account-config.js';

const abortError = () => new StoreError('timeout');

// Include token acquisition and reading the response body in the deadline.
// Promise.race also bounds injected transports that ignore AbortSignal.
async function deadline(task, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(abortError()); }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => task(controller.signal)), timeout]); }
  finally { clearTimeout(timer); }
}

function decodeDocument(document) {
  if (document?.fields?.schema?.integerValue !== String(STORE_SCHEMA)
      || typeof document?.fields?.data?.stringValue !== 'string') throw new StoreError('corrupt');
  try { return jsonCopy(JSON.parse(document.fields.data.stringValue), { code: 'corrupt' }); }
  catch (error) { throw error instanceof StoreError && error.code === 'limit' ? error : new StoreError('corrupt'); }
}

function encodeDocument(name, value) {
  return { name, fields: { schema: { integerValue: String(STORE_SCHEMA) },
    data: { stringValue: JSON.stringify(value) } } };
}

/** REST-only Firestore storage. Inject fetch and an OAuth access-token
 * supplier for tests; no emulator, gcloud invocation, or npm dependency.
 * The OAuth token is a server workload credential, never a browser ID token.
 */
export function openFirestoreStore({ project, database = '(default)', namespace,
  tokenSupplier, fetch: fetcher = globalThis.fetch, timeoutMs = 5000,
  maxAttempts = 3, retryDelay = attempt => new Promise(resolve =>
    setTimeout(resolve, Math.min(250, 20 * 2 ** attempt) * (0.5 + Math.random()))) } = {}) {
  firestoreAddress({ project, database, namespace });
  if (typeof tokenSupplier !== 'function'
      || typeof fetcher !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1
      || timeoutMs > 60000 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5
      || typeof retryDelay !== 'function') throw new StoreError('invalid');
  const databaseName = `projects/${project}/databases/${database}`;
  const documentsRoot = `${databaseName}/documents`;
  const docName = key => `${documentsRoot}/diceAccounts/${namespace}/${validPath(key)}`;
  let closed = false;
  const pending = new Set();
  const ready = () => { if (closed) throw new StoreError('closed'); };

  async function rpc(name, { method = 'POST', body, missing = false, commit = false } = {}) {
    try {
      return await deadline(async signal => {
        const token = await tokenSupplier({ signal });
        if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new StoreError('unavailable');
        const encodedBody = body === undefined ? undefined : JSON.stringify(body);
        if (encodedBody && Buffer.byteLength(encodedBody) > MAX_TRANSACTION_BYTES) throw new StoreError('limit');
        const response = await fetcher(`https://firestore.googleapis.com/v1/${name}`, {
          method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(encodedBody === undefined ? {} : { body: encodedBody }), signal,
        });
        if (missing && response.status === 404) return null;
        const text = await response.text();
        if (Buffer.byteLength(text) > MAX_RECORD_BYTES * 2 + 65536) throw new StoreError('corrupt');
        let result;
        try { result = text ? JSON.parse(text) : {}; } catch { throw new StoreError('corrupt'); }
        if (!response.ok) {
          if (result?.error?.status === 'ABORTED') throw new StoreError('busy');
          if (response.status >= 500 && commit) throw new StoreError('uncertain');
          throw new StoreError('unavailable');
        }
        return result;
      }, timeoutMs);
    } catch (error) {
      if (commit && (!(error instanceof StoreError) || ['timeout', 'corrupt'].includes(error.code))) {
        throw new StoreError('uncertain');
      }
      throw storageError(error);
    }
  }

  function track(task) {
    pending.add(task);
    task.then(() => pending.delete(task), () => pending.delete(task));
    return task;
  }

  return Object.freeze({
    get(key) {
      try { ready(); validPath(key); } catch (error) { return Promise.reject(error); }
      return track((async () => {
        const document = await rpc(docName(key), { method: 'GET', missing: true });
        return document === null ? null : decodeDocument(document);
      })());
    },
    transact(callback) {
      try { ready(); if (typeof callback !== 'function') throw new StoreError('invalid'); }
      catch (error) { return Promise.reject(error); }
      return track((async () => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          let token;
          let committed = false;
          let uncertain = false;
          try {
            const begin = await rpc(`${documentsRoot}:beginTransaction`, { body: { options: { readWrite: {} } } });
            token = begin.transaction;
            if (typeof token !== 'string' || !/^[A-Za-z0-9+/=_-]{1,4096}$/.test(token)) throw new StoreError('corrupt');
            const view = transactionView(async key => {
              const document = await rpc(`${docName(key)}?transaction=${encodeURIComponent(token)}`,
                { method: 'GET', missing: true });
              return document === null ? null : decodeDocument(document);
            });
            let result;
            try { result = await callback(view.api); }
            finally { view.finish(); }
            if (!view.writes.size) return result; // finally releases the read-only transaction
            const writes = [...view.writes].map(([key, value]) => value === null
              ? { delete: docName(key) } : { update: encodeDocument(docName(key), value) });
            // A commit shares the exact token used on every dependency GET.
            // There is no read-only "verify" write in Firestore's REST API.
            const receipt = await rpc(`${documentsRoot}:commit`, { body: { transaction: token, writes }, commit: true });
            if (!Array.isArray(receipt.writeResults) || receipt.writeResults.length !== writes.length
                || typeof receipt.commitTime !== 'string') throw new StoreError('uncertain');
            committed = true;
            return result;
          } catch (error) {
            uncertain = error instanceof StoreError && error.code === 'uncertain';
            if (error instanceof StoreError && error.code === 'busy' && attempt + 1 < maxAttempts) {
              await retryDelay(attempt);
              continue;
            }
            throw storageError(error);
          } finally {
            if (token && !committed && !uncertain) {
              await rpc(`${documentsRoot}:rollback`, { body: { transaction: token } }).catch(() => {});
            }
          }
        }
        throw new StoreError('busy');
      })());
    },
    async close() {
      closed = true;
      await Promise.allSettled([...pending]);
    },
  });
}

/** Cloud Run only. The fixed metadata address prevents a configured URL
 * from becoming a token-exfiltration destination. Cache never reaches disk.
 */
export function metadataTokenSupplier({ fetch: fetcher = globalThis.fetch,
  now = Date.now, timeoutMs = 3000 } = {}) {
  let cached = null;
  let pending = null;
  return async () => {
    if (cached && cached.expiresAt > now() + 60000) return cached.token;
    if (!pending) {
      pending = deadline(async signal => {
        const response = await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
          headers: { 'Metadata-Flavor': 'Google' }, signal,
        });
        if (!response.ok || response.headers.get('metadata-flavor') !== 'Google') throw new StoreError('unavailable');
        const text = await response.text();
        if (text.length > 65536) throw new StoreError('unavailable');
        const data = JSON.parse(text);
        if (typeof data.access_token !== 'string' || !data.access_token || /[\r\n]/.test(data.access_token)
            || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new StoreError('unavailable');
        cached = { token: data.access_token, expiresAt: now() + data.expires_in * 1000 };
        return cached.token;
      }, timeoutMs).catch(error => { throw storageError(error); }).finally(() => { pending = null; });
    }
    return pending;
  };
}
