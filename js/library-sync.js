/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// No boot-time upload, background account adoption, or publication. UI callers
// first await their identity/sharing boundary, then open a fixed namespace.
// Closing a controller blocks future requests; accepted cache edits and uncertain
// upload envelopes survive in IDB so another session can safely retry them.
export function createLibrarySync({ account, cache, personId, debounceMs = 1500, onResult = () => {} } = {}) {
  let closed = false;
  let timer = null;
  let flushing = null;
  const disconnected = () => ({ ok: false, code: 'identity_changed', message: 'Reopen the account before syncing.' });
  const controller = {
    read: () => closed ? Promise.resolve(disconnected()) : cache.read(personId),
    edit: (generation, document) => closed ? Promise.resolve(disconnected()) : cache.edit(personId, generation, document),
    async preview() {
      if (closed) return disconnected();
      const result = await account.library(personId);
      if (closed) return disconnected();
      return result.ok ? cache.preview(personId, result) : result;
    },
    choose: (generation, options) => closed ? Promise.resolve(disconnected()) : cache.choose(personId, generation, options),
    flush() {
      if (flushing) return flushing;
      flushing = drain().finally(() => { flushing = null; });
      return flushing;
    },
    schedule() {
      if (closed) return;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; controller.flush().then(onResult).catch(() => {}); }, debounceMs);
    },
    async archive(generation, versionIds) {
      if (closed) return disconnected();
      const result = await account.archiveLibrary(personId, { versionIds, discardAcknowledgedHistory: true });
      if (closed) return disconnected();
      if (!result.ok) return result;
      return cache.archive(personId, generation, versionIds);
    },
    export: () => cache.export(personId),
    close() { closed = true; clearTimeout(timer); },
  };
  async function drain() {
    let last = null;
    while (true) {
      if (closed) return disconnected();
      const queued = await cache.beginUpload(personId);
      if (closed) return disconnected();
      if (!queued.ok || !queued.upload) return queued.ok && last ? { ...queued, receipt: last } : queued;
      const { input, reconcile } = queued.upload;
      const result = await account.saveLibrary(personId, input, { reconcile });
      // A receipt belongs only to this fixed namespace, even if the UI closed
      // while the server saved it. The account transport checks expected-person
      // before returning data; never adopt an unverified response after close.
      if (closed) return disconnected();
      if (result.ok || result.code === 'revision_conflict') {
        const saved = await cache.acknowledge(personId, input.operationId, result);
        if (!saved.ok) return saved;
        if (!result.ok) return { ...saved, receipt: result, ok: false, code: result.code };
        last = result;
        // A later working edit may have committed during this network request.
        // Its next envelope uses the acknowledged base; drain it even if its
        // debounce already fired while this flush was in flight.
        continue;
      }
      if (['invalid_library', 'library_limit', 'operation_reused'].includes(result.code)) {
        return cache.refuse(personId, input.operationId, result);
      }
      return result;
    }
  }
  return Object.freeze(controller);
}
