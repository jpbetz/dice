/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import crypto from 'node:crypto';
import { cutText } from '../js/notation.js';
import { StoreError } from './store.js';
import { readLibrary, prepareLibraryWrite, writeLibrary, archiveLibrary } from './library.js';

export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 12;
const outcome = (status, code, message) => ({ ok: false, status, code, message });
const invalid = () => outcome(400, 'invalid_request', 'Check the account details and try again.');
const denied = () => outcome(401, 'login_required', 'Use your recovery key to sign in.');
const limited = () => outcome(429, 'account_limit', 'Account service limit reached. Try again later.');
const hash = (kind, value) => crypto.createHash('sha256').update(`dice-${kind}-v1:${value}`).digest('hex');
const opaque = () => crypto.randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const validRecoveryKey = key => typeof key === 'string' && /^dt1_[A-Za-z0-9_-]{43}$/.test(key)
  && Buffer.from(key.slice(4), 'base64url').length === 32
  && Buffer.from(key.slice(4), 'base64url').toString('base64url') === key.slice(4);
const validSessionToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
const projection = person => ({ id: person.id, displayName: person.displayName, createdAt: person.createdAt });
const checkPerson = person => {
  if (!person || person.schema !== 1 || typeof person.id !== 'string'
      || typeof person.displayName !== 'string' || !Number.isSafeInteger(person.sessionGeneration)
      || person.sessionGeneration < 1 || !Array.isArray(person.sessionHashes)
      || person.sessionHashes.length > MAX_SESSIONS
      || person.sessionHashes.some(id => !/^[a-f0-9]{64}$/.test(id))) throw new StoreError('corrupt');
};

// Domain refusals are values, so adapters can safely sanitize every thrown
// exception without converting an expected validation/conflict into a 503.
export function createAccountService({ store, now = Date.now, sessionMs = SESSION_MS,
  maxAccounts = 1000, registrationsPerDay = 100 } = {}) {
  if (!store || typeof store.transact !== 'function' || typeof now !== 'function'
      || !Number.isFinite(sessionMs) || sessionMs < 1 || sessionMs > SESSION_MS
      || !Number.isSafeInteger(maxAccounts) || maxAccounts < 1
      || !Number.isSafeInteger(registrationsPerDay) || registrationsPerDay < 1) throw new StoreError('invalid');

  const newSession = (person, at) => {
    const token = opaque();
    const id = hash('session', token);
    return { token, id, record: { schema: 1, personId: person.id,
      generation: person.sessionGeneration, createdAt: at, expiresAt: at + sessionMs, csrfToken: opaque() } };
  };
  const authenticated = async (tx, token, csrf, at, mutation = true) => {
    if (!validSessionToken(token)) return denied();
    const sessionHash = hash('session', token);
    const session = await tx.get(`sessions/${sessionHash}`);
    if (!session) return denied();
    if (session.schema !== 1 || typeof session.personId !== 'string'
        || !Number.isFinite(session.expiresAt) || !Number.isSafeInteger(session.generation)
        || !validSessionToken(session.csrfToken)) throw new StoreError('corrupt');
    if (session.expiresAt <= at) return denied();
    const person = await tx.get(`people/${session.personId}`);
    checkPerson(person);
    if (person.sessionGeneration !== session.generation) return denied();
    if (mutation && !equal(csrf, session.csrfToken)) return outcome(403, 'csrf_required', 'Refresh the account panel and try again.');
    return { ok: true, person, session, sessionHash };
  };
  const signedIn = (person, session) => ({ ok: true, person: projection(person),
    csrfToken: session.record.csrfToken, expiresAt: session.record.expiresAt,
    // Route code consumes this field into Set-Cookie and never serializes it.
    sessionToken: session.token });
  const expectedPerson = (found, expected) => found.person.id === expected ? null
    : outcome(409, 'identity_changed', 'The signed-in person changed. Reopen the account before syncing.');

  return Object.freeze({
    async status() {
      await store.get('meta/accounts');
      return { enabled: true, available: true, recoveryMethods: ['key'], schema: 1 };
    },
    async register(input) {
      if (!input || !validRecoveryKey(input.recoveryKey) || input.recoveryAcknowledged !== true
          || typeof input.displayName !== 'string' || input.displayName.includes('#')) return invalid();
      const displayName = cutText(input.displayName, 24);
      if (!displayName) return invalid();
      const at = now();
      const keyHash = hash('recovery', input.recoveryKey);
      const person = { schema: 1, id: `p_${opaque()}`, displayName, createdAt: at,
        sessionGeneration: 1, sessionHashes: [], libraryHead: null, libraryVersionIds: [],
        homeIds: [], friendIds: [], incomingIds: [], outgoingIds: [] };
      const session = newSession(person, at);
      person.sessionHashes = [session.id];
      const dayPath = `registrationDays/${new Date(at).toISOString().slice(0, 10)}`;
      return store.transact(async tx => {
        const credential = await tx.get(`credentials/${keyHash}`);
        const total = await tx.get('meta/accounts');
        const daily = await tx.get(dayPath);
        if (credential) return outcome(409, 'key_registered', 'This key already has an account. Use Recover instead.');
        if ((total?.count || 0) >= maxAccounts || (daily?.count || 0) >= registrationsPerDay) return limited();
        tx.put(`people/${person.id}`, person);
        tx.put(`credentials/${keyHash}`, { schema: 1, personId: person.id, createdAt: at });
        tx.put(`sessions/${session.id}`, session.record);
        tx.put('meta/accounts', { schema: 1, count: (total?.count || 0) + 1 });
        tx.put(dayPath, { schema: 1, count: (daily?.count || 0) + 1 });
        return signedIn(person, session);
      });
    },
    async recover(input) {
      if (!input || !validRecoveryKey(input.recoveryKey)) return denied();
      const at = now();
      const keyHash = hash('recovery', input.recoveryKey);
      // Generate the bearer once outside a callback which may retry.
      const candidate = { token: opaque(), csrfToken: opaque() };
      const id = hash('session', candidate.token);
      return store.transact(async tx => {
        const credential = await tx.get(`credentials/${keyHash}`);
        if (!credential) return denied();
        if (credential.schema !== 1) throw new StoreError('corrupt');
        const person = await tx.get(`people/${credential.personId}`);
        checkPerson(person);
        const sessions = await Promise.all(person.sessionHashes.map(async saved => [saved, await tx.get(`sessions/${saved}`)]));
        const alive = input.revokeOtherSessions === true ? []
          : sessions.filter(([, entry]) => entry && entry.expiresAt > at && entry.generation === person.sessionGeneration);
        if (alive.length >= MAX_SESSIONS) return outcome(429, 'session_limit', 'Recover and sign out other devices to continue.');
        const session = { token: candidate.token, id, record: { schema: 1, personId: person.id,
          generation: person.sessionGeneration, csrfToken: candidate.csrfToken, createdAt: at, expiresAt: at + sessionMs } };
        for (const [saved, entry] of sessions) {
          if (input.revokeOtherSessions === true || !entry || entry.expiresAt <= at
              || entry.generation !== person.sessionGeneration) tx.delete(`sessions/${saved}`);
        }
        tx.put(`people/${person.id}`, { ...person, sessionHashes: [...alive.map(([saved]) => saved), id] });
        tx.put(`sessions/${id}`, session.record);
        return signedIn(person, session);
      });
    },
    async session(token) {
      return store.transact(async tx => {
        const found = await authenticated(tx, token, null, now(), false);
        if (!found.ok) return { ok: true, person: null };
        return { ok: true, person: projection(found.person), csrfToken: found.session.csrfToken,
          expiresAt: found.session.expiresAt };
      });
    },
    async library(token, expected, versionId = null) {
      return store.transact(async tx => {
        const found = await authenticated(tx, token, null, now(), false);
        if (!found.ok) return found;
        return expectedPerson(found, expected) || readLibrary(tx, found.person, versionId);
      });
    },
    async saveLibrary(token, csrf, expected, input, reconcile = false) {
      const prepared = prepareLibraryWrite(input, reconcile, now());
      if (!prepared.ok) return prepared;
      return store.transact(async tx => {
        const found = await authenticated(tx, token, csrf, now());
        if (!found.ok) return found;
        return expectedPerson(found, expected) || writeLibrary(tx, found.person, prepared);
      });
    },
    async archiveLibrary(token, csrf, expected, input) {
      return store.transact(async tx => {
        const found = await authenticated(tx, token, csrf, now());
        if (!found.ok) return found;
        return expectedPerson(found, expected) || archiveLibrary(tx, found.person, input);
      });
    },
    async logout(token, csrf) {
      return store.transact(async tx => {
        const found = await authenticated(tx, token, csrf, now());
        if (!found.ok) return found;
        tx.delete(`sessions/${found.sessionHash}`);
        tx.put(`people/${found.person.id}`, { ...found.person,
          sessionHashes: found.person.sessionHashes.filter(id => id !== found.sessionHash) });
        return { ok: true, person: null, clearCookie: true };
      });
    },
    async revokeOthers(token, csrf) {
      return store.transact(async tx => {
        const found = await authenticated(tx, token, csrf, now());
        if (!found.ok) return found;
        const generation = found.person.sessionGeneration + 1;
        tx.put(`people/${found.person.id}`, { ...found.person,
          sessionGeneration: generation, sessionHashes: [found.sessionHash] });
        tx.put(`sessions/${found.sessionHash}`, { ...found.session, generation });
        for (const id of found.person.sessionHashes) if (id !== found.sessionHash) tx.delete(`sessions/${id}`);
        return { ok: true };
      });
    },
    async rotateKey(token, csrf, input) {
      if (!input || !validRecoveryKey(input.currentRecoveryKey) || !validRecoveryKey(input.newRecoveryKey)
          || input.recoveryAcknowledged !== true || input.currentRecoveryKey === input.newRecoveryKey) return invalid();
      const at = now();
      const oldHash = hash('recovery', input.currentRecoveryKey);
      const nextHash = hash('recovery', input.newRecoveryKey);
      const candidate = { token: opaque(), csrfToken: opaque() };
      const id = hash('session', candidate.token);
      return store.transact(async tx => {
        const found = await authenticated(tx, token, csrf, now());
        if (!found.ok) return found;
        const oldCredential = await tx.get(`credentials/${oldHash}`);
        const nextCredential = await tx.get(`credentials/${nextHash}`);
        if (!oldCredential || oldCredential.personId !== found.person.id) return denied();
        if (nextCredential) return outcome(409, 'key_registered', 'Choose a newly generated recovery key.');
        const person = { ...found.person, sessionGeneration: found.person.sessionGeneration + 1, sessionHashes: [id] };
        const session = { token: candidate.token, id, record: { schema: 1, personId: person.id,
          generation: person.sessionGeneration, csrfToken: candidate.csrfToken, createdAt: at, expiresAt: at + sessionMs } };
        tx.delete(`credentials/${oldHash}`);
        tx.put(`credentials/${nextHash}`, { schema: 1, personId: person.id, createdAt: at });
        for (const saved of found.person.sessionHashes) tx.delete(`sessions/${saved}`);
        tx.put(`people/${person.id}`, person);
        tx.put(`sessions/${id}`, session.record);
        return signedIn(person, session);
      });
    },
    close: () => store.close(),
  });
}
