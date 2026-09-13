/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

// Optional identity transport. No room connection, library publication, UI,
// polling or automatic registration lives here. Recovery keys are ephemeral
// inputs; the browser's HttpOnly cookie holds its ordinary session.
const LATCH = 'dice.account.signedout.v1';
const unavailable = () => ({ ok: false, code: 'account_unavailable',
  message: 'Account service is unavailable. Your table still works.' });

export function generateRecoveryKey(webCrypto = globalThis.crypto) {
  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') throw new Error('Secure key generation is unavailable.');
  const bytes = new Uint8Array(32);
  webCrypto.getRandomValues(bytes);
  const binary = Array.from(bytes, value => String.fromCharCode(value)).join('');
  return 'dt1_' + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function createAccountClient({ fetch: fetcher = globalThis.fetch,
  origin = globalThis.location?.origin, onIdentityChange = async () => {},
  storage, timeoutMs = 6000 } = {}) {
  let personId = null;
  let csrfToken = null;
  let identityEpoch = 0;
  let cookieQueue = Promise.resolve();
  let localLatch = false;
  const latchStorage = () => {
    try { return storage === undefined ? globalThis.localStorage : storage; } catch { return null; }
  };
  const latched = () => {
    try { return localLatch || latchStorage()?.getItem(LATCH) === '1'; } catch { return localLatch; }
  };
  const latch = value => {
    localLatch = value;
    try {
      if (value) latchStorage()?.setItem(LATCH, '1');
      else latchStorage()?.removeItem(LATCH);
    } catch { /* preserve the in-memory signed-out state */ }
  };
  const superseded = () => ({ ok: false, code: 'request_superseded', message: 'A newer account action has finished.' });
  const transitionRefused = () => ({ ok: false, code: 'identity_transition_refused',
    message: 'Your current workspace could not be safely closed. Try again.' });
  const serializeCookies = action => {
    const task = cookieQueue.then(action);
    cookieQueue = task.catch(() => {});
    return task;
  };
  const adopt = async (result, epoch = identityEpoch) => {
    if (epoch !== identityEpoch) return superseded();
    if (!result.ok || !Object.hasOwn(result, 'person')) return result;
    const next = result.person?.id || null;
    if (next !== personId) {
      // The owner clears account-scoped sharing before this promise resolves
      // and before any caller can adopt a recovered private library.
      const accepted = await onIdentityChange({ previousPersonId: personId, personId: next });
      if (epoch !== identityEpoch) return superseded();
      if (accepted === false) return transitionRefused();
      personId = next;
    }
    csrfToken = result.csrfToken || null;
    return result;
  };
  async function request(action, body, nonce = csrfToken, headers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(new URL(`/api/account/${action}`, origin), {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Dice-Account': '1',
          ...(nonce ? { 'X-Dice-CSRF': nonce } : {}) }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
      });
      if (response.status === 404 && !action.startsWith('library') && !action.startsWith('homes')) return { ok: false, code: 'not_available', enabled: false };
      const value = await response.json();
      if (!value || typeof value !== 'object') return unavailable();
      if (!response.ok) return { ...value, ok: false };
      return value;
    } catch { return unavailable(); }
    finally { clearTimeout(timer); }
  }
  const begin = (action, body) => {
    const epoch = ++identityEpoch;
    return serializeCookies(async () => {
      if (epoch !== identityEpoch) return superseded();
      const result = await request(action, body, null);
      if (epoch !== identityEpoch) return superseded();
      if (result.ok) {
        const adopted = await adopt(result, epoch);
        if (adopted.ok) latch(false);
        return adopted;
      }
      return result;
    });
  };
  const libraryRequest = (expectedPersonId, action, body) => {
    const epoch = identityEpoch;
    const changed = () => ({ ok: false, code: 'identity_changed', message: 'Reopen the account before syncing.' });
    return serializeCookies(async () => {
      if (epoch !== identityEpoch || !expectedPersonId || personId !== expectedPersonId || latched()) return changed();
      const result = await request(action, body, csrfToken, { 'X-Dice-Person': expectedPersonId });
      if (epoch !== identityEpoch || personId !== expectedPersonId
          || (result.personId && result.personId !== expectedPersonId)) return changed();
      return result;
    });
  };
  return Object.freeze({
    status: () => request('status'),
    session() {
      const epoch = identityEpoch;
      return serializeCookies(async () => {
        if (epoch !== identityEpoch) return superseded();
        const result = await request('session');
        if (epoch !== identityEpoch) return superseded();
        if (latched()) {
          if (result.ok && result.person && result.csrfToken) {
            const revoked = await request('logout', {}, result.csrfToken);
            if (revoked.ok && epoch === identityEpoch) latch(false);
          } else if (result.ok && !result.person && epoch === identityEpoch) latch(false);
          return adopt({ ok: true, person: null, signedOutLocally: true }, epoch);
        }
        return adopt(result, epoch);
      });
    },
    register: input => begin('register', input),
    recover: (recoveryKey, { revokeOtherSessions = false } = {}) =>
      begin('recover', { recoveryKey, ...(revokeOtherSessions ? { revokeOtherSessions: true } : {}) }),
    library: (expectedPersonId, versionId = null) => libraryRequest(expectedPersonId,
      versionId === null ? 'library' : `library/versions/${encodeURIComponent(versionId)}`),
    saveLibrary: (expectedPersonId, input, { reconcile = false } = {}) =>
      libraryRequest(expectedPersonId, reconcile ? 'library/reconcile' : 'library', input),
    archiveLibrary: (expectedPersonId, input) => libraryRequest(expectedPersonId, 'library/archive', input),
    homes: expectedPersonId => libraryRequest(expectedPersonId, 'homes'),
    home: (expectedPersonId, id, revision = null) => libraryRequest(expectedPersonId,
      `homes/${encodeURIComponent(id)}${revision ? `/versions/${encodeURIComponent(revision)}` : ''}`),
    captureHome: (expectedPersonId, input) => libraryRequest(expectedPersonId, 'homes/capture', input),
    createHome: (expectedPersonId, input) => libraryRequest(expectedPersonId, 'homes', input),
    saveHome: (expectedPersonId, id, input, { reconcile = false } = {}) => libraryRequest(expectedPersonId,
      `homes/${encodeURIComponent(id)}${reconcile ? '/reconcile' : ''}`, input),
    leaveHome: (expectedPersonId, id, input) => libraryRequest(expectedPersonId, `homes/${encodeURIComponent(id)}/leave`, input),
    logout() {
      // Freeze the local namespace before awaiting a server that may be down.
      const epoch = ++identityEpoch;
      latch(true);
      const transition = adopt({ ok: true, person: null }, epoch);
      return serializeCookies(async () => {
        const changed = await transition;
        // A preceding superseded login may still have set its HttpOnly
        // cookie. Read that actual session, then revoke it in the same queue.
        const current = await request('session');
        const result = current.ok && current.person
          ? await request('logout', {}, current.csrfToken)
          : current.ok ? { ok: true, person: null } : current;
        if (epoch === identityEpoch && changed.ok && (result.ok || result.code === 'login_required')) latch(false);
        if (!changed.ok) return { ...changed, signedOutLocally: true };
        return result.ok ? result : { ...result, signedOutLocally: true };
      });
    },
    revokeOthers: () => serializeCookies(() => request('revoke-others', {})),
    rotateKey(input) {
      const epoch = ++identityEpoch;
      return serializeCookies(async () => {
        if (epoch !== identityEpoch) return superseded();
        const result = await request('rotate-key', input);
        return adopt(result, epoch);
      });
    },
  });
}
