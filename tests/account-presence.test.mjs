/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { appServer, publicAction } from './fixtures/app-server.mjs';
import { cookieClient } from './fixtures/library-harness.mjs';
import { createAccountClient, generateContactCode } from '../js/account.js';
import { createPresenceHeartbeat } from '../js/presence.js';
import { openFileStore } from '../service/store-file.js';
import { createAccountService } from '../service/account.js';
import { PRESENCE_MS, PRESENCE_REFRESH_MS } from '../service/presence.js';

const op = () => crypto.randomUUID();
const key = () => 'dt1_' + crypto.randomBytes(32).toString('base64url');
async function fixture(t, env = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-presence-account-'));
  const app = await appServer(directory, env);
  t.after(async () => { await app.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  return { app, directory };
}
async function register(app, displayName = 'Sam') {
  const jar = cookieClient(app.origin), recoveryKey = key();
  const signed = await jar.client.register({ recoveryKey, recoveryAcknowledged: true, displayName });
  assert.equal(signed.ok, true);
  return { ...jar, personId: signed.person.id, recoveryKey };
}
async function friends(a, b) {
  const code = generateContactCode();
  await a.client.setContactCode(a.personId, { operationId: op(), code });
  const request = await b.client.requestFriend(b.personId, { operationId: op(), code });
  assert.equal((await a.client.respondInvitation(a.personId, request.invitation.id, { operationId: op(), choice: 'accept' })).invitation.state, 'accepted');
}

test('online status and saved-home location require separate explicit choices, membership and a current seat', async t => {
  const { app } = await fixture(t), a = await register(app), b = await register(app, 'Riley'), stranger = await register(app);
  await friends(a, b);
  const home = await a.client.createHome(a.personId, { operationId: op(), name: 'Permitted home' });
  const invitation = await a.client.inviteHome(a.personId, { operationId: op(), toPersonId: b.personId, homeId: home.home.id });
  await b.client.respondInvitation(b.personId, invitation.invitation.id, { operationId: op(), choice: 'accept' });
  assert.equal((await b.client.presence(b.personId)).signals[0].state, 'unknown');
  assert.deepEqual((await b.client.homePresence(b.personId, home.home.id)).signals, []);
  assert.equal((await a.client.setPresence(a.personId, { online: true })).ok, true);
  assert.equal((await b.client.presence(b.personId)).signals[0].state, 'online');
  assert.deepEqual((await b.client.homePresence(b.personId, home.home.id)).signals, []);
  const joined = await publicAction(app.origin, 'join', { room: home.home.roomKey, name: 'Sam plays' });
  const seat = { room: home.home.roomKey, playerId: joined.value.playerId };
  assert.equal((await a.client.setPresence(a.personId, { online: true, ...seat })).code, 'invalid_presence');
  assert.equal((await a.client.setPresence(a.personId, { online: true, homeId: home.home.id, ...seat, playerId: 'wrong' })).code, 'live_seat_required');
  assert.equal((await stranger.client.setPresence(stranger.personId, { online: true, homeId: home.home.id, ...seat })).code, 'home_not_found');
  assert.equal((await a.client.setPresence(a.personId, { online: true, homeId: home.home.id, ...seat })).ok, true);
  const permitted = await b.client.homePresence(b.personId, home.home.id);
  assert.equal(permitted.signals[0].person.id, a.personId);
  assert.equal(permitted.signals[0].state, 'online');
  assert.equal(JSON.stringify(permitted).includes(seat.playerId), false);
  assert.equal(JSON.stringify(permitted).includes(home.home.roomKey), false);
  assert.equal((await stranger.client.homePresence(stranger.personId, home.home.id)).code, 'home_not_found');
  assert.deepEqual((await stranger.client.presence(stranger.personId)).signals, []);
  assert.equal((await b.fetch(app.origin + '/api/account/presence')).status, 409);
  await a.client.removeFriend(a.personId, b.personId, { operationId: op() });
  assert.deepEqual((await b.client.presence(b.personId)).signals, []);
  assert.deepEqual((await b.client.homePresence(b.personId, home.home.id)).signals, []); // removal also stops presence at a still-shared home
  assert.equal((await b.client.home(b.personId, home.home.id)).ok, true); // removal is not a membership or gameplay revocation
});

test('revoking devices, logout and key rotation invalidate markers immediately without waiting for expiry', async t => {
  const { app } = await fixture(t), a = await register(app), b = await register(app);
  await friends(a, b);
  const otherDevice = cookieClient(app.origin).client;
  await otherDevice.recover(a.recoveryKey);
  await otherDevice.setPresence(a.personId, { online: true });
  assert.equal((await b.client.presence(b.personId)).signals[0].state, 'online');
  await a.client.revokeOthers();
  assert.equal((await b.client.presence(b.personId)).signals[0].state, 'unknown');
  assert.equal((await otherDevice.setPresence(a.personId, { online: true })).code, 'login_required');
  await otherDevice.recover(a.recoveryKey);
  await otherDevice.setPresence(a.personId, { online: true });
  await a.client.recover(a.recoveryKey, { revokeOtherSessions: true });
  assert.equal((await b.client.presence(b.personId)).signals[0].state, 'unknown');
  await a.client.setPresence(a.personId, { online: true });
  await a.client.rotateKey({ currentRecoveryKey: a.recoveryKey, newRecoveryKey: key(), recoveryAcknowledged: true });
  assert.equal((await b.client.presence(b.personId)).signals[0].state, 'unknown');
  await a.client.setPresence(a.personId, { online: true });
  await a.client.logout();
  assert.equal((await b.client.presence(b.personId)).signals[0].state, 'unknown');
});

test('register/recover withdraw the previous marker atomically even when the changed cookie arrives but the body is lost', async t => {
  const { app } = await fixture(t), a = await register(app), observer = await register(app), b = await register(app);
  await friends(a, observer);
  const originalCookie = a.cookie();
  for (const action of ['register', 'recover']) {
    a.setCookie(originalCookie);
    let drop = false, heartbeat;
    const account = createAccountClient({ origin: app.origin, storage: null,
      onIdentityChange: () => heartbeat?.close({ withdraw: false }),
      fetch: async (url, options) => {
        const response = await a.fetch(url, options); // real HTTP response has already updated the cookie jar
        if (drop && String(url).endsWith('/' + action)) {
          drop = false; await response.arrayBuffer();
          return { ok: response.ok, status: response.status, json: async () => { throw new Error('fixture lost response body'); } };
        }
        return response;
      },
    });
    await account.session();
    heartbeat = createPresenceHeartbeat({ account, personId: a.personId, document: null });
    await heartbeat.setSharing({ online: true });
    assert.equal((await observer.client.presence(observer.personId)).signals[0].state, 'online');
    drop = true;
    const result = action === 'register' ? await account.register({ recoveryKey: key(), recoveryAcknowledged: true, displayName: 'Other account' })
      : await account.recover(b.recoveryKey);
    assert.equal(result.code, 'account_unavailable');
    assert.notEqual(a.cookie(), originalCookie);
    assert.equal((await observer.client.presence(observer.personId)).signals[0].state, 'unknown');
    const current = await account.session(); // synchronous-close hook cannot deadlock the cookie queue
    assert.notEqual(current.person.id, a.personId);
    await heartbeat.close({ withdraw: false });
    const retained = cookieClient(app.origin);
    retained.setCookie(originalCookie);
    assert.equal((await retained.client.session()).person.id, a.personId); // switching did not revoke the old authentication session
  }
});

test('injected time expires signals, bounds renewal writes, and keeps corrupt markers out of projections', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-presence-clock-'));
  const store = await openFileStore({ directory });
  let at = Date.now();
  const service = createAccountService({ store, now: () => at, homeBridge: {
    capture: () => ({ ok: false }), validate: document => ({ ok: true, document }), fresh: () => ({ ok: false }),
  } });
  t.after(async () => { await service.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const a = await service.register({ recoveryKey: key(), recoveryAcknowledged: true, displayName: 'Sam' });
  const b = await service.register({ recoveryKey: key(), recoveryAcknowledged: true, displayName: 'Riley' });
  const social = (who, action, input = {}, id) => service.social(who.sessionToken, who.csrfToken, who.person.id, action, { input, id });
  const presence = (who, input) => service.presence(who.sessionToken, who.csrfToken, who.person.id, input === undefined ? { read: true } : { input });
  const code = generateContactCode();
  await social(a, 'code', { operationId: op(), code });
  const request = await social(b, 'request', { operationId: op(), code });
  await social(a, 'respond', { operationId: op(), choice: 'accept' }, request.invitation.id);
  const first = await presence(a, { online: true });
  const saved = await store.get(`presence/${a.person.id}`);
  at += PRESENCE_REFRESH_MS - 1;
  assert.equal((await presence(a, { online: true })).expiresAt, first.expiresAt);
  assert.deepEqual(await store.get(`presence/${a.person.id}`), saved);
  at += 1;
  const renewed = await presence(a, { online: true });
  assert.ok(renewed.expiresAt > first.expiresAt);
  at += PRESENCE_MS;
  const expired = (await presence(b)).signals[0];
  assert.equal(expired.state, 'unknown'); assert.equal(expired.expiresAt, null);
  assert.equal(Object.hasOwn(expired, 'lastSeen'), false);
  await store.transact(async tx => { const bad = await tx.get(`presence/${a.person.id}`); tx.put(`presence/${a.person.id}`, { ...bad, sessions: 'private damaged marker' }); });
  await assert.rejects(() => presence(b), error => error.code === 'corrupt');
});

test('heartbeat is off by default, stops when hidden/closed, and reports failures as unknown', async () => {
  const calls = [], statuses = [], timers = new Map(), listeners = new Map();
  let serial = 0, fail = false;
  const document = { visibilityState: 'visible', addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name) };
  const heartbeat = createPresenceHeartbeat({ personId: 'fixture-person', document,
    account: { setPresence: async (id, input) => { calls.push({ id, input }); return fail
      ? { ok: false, code: 'account_unavailable' } : { ok: true, expiresAt: input.online ? 90000 : null }; } },
    setTimer: (fn, ms) => { assert.equal(ms, 30000); timers.set(++serial, fn); return serial; },
    clearTimer: id => timers.delete(id), onStatus: value => statuses.push(value),
  });
  assert.deepEqual(calls, []); assert.equal(timers.size, 0);
  await heartbeat.setSharing({ online: true });
  assert.equal(statuses.at(-1).state, 'sharing'); assert.equal(timers.size, 1);
  document.visibilityState = 'hidden'; listeners.get('visibilitychange')();
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls.at(-1).input, { online: false }); assert.equal(timers.size, 0);
  fail = true; document.visibilityState = 'visible'; listeners.get('visibilitychange')();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(statuses.at(-1).state, 'unknown'); assert.equal(timers.size, 1);
  await heartbeat.close();
  assert.equal(timers.size, 0); assert.equal(listeners.size, 0);
  assert.deepEqual(calls.at(-1).input, { online: false });
  assert.equal((await heartbeat.setSharing({ online: true })).code, 'presence_closed');
});
