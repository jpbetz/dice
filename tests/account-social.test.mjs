/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { appServer, publicAction } from './fixtures/app-server.mjs';
import { cookieClient } from './fixtures/library-harness.mjs';
import { generateContactCode } from '../js/account.js';
import { openFileStore } from '../service/store-file.js';
import { createAccountService } from '../service/account.js';
import { SOCIAL_EXPIRY_MS, validContactCode } from '../service/social.js';

const op = () => crypto.randomUUID();
const recovery = () => 'dt1_' + crypto.randomBytes(32).toString('base64url');
async function fixture(t, env = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-social-'));
  const servers = [];
  const start = async overrides => { const app = await appServer(directory, { ...env, ...overrides }); servers.push(app); return app; };
  t.after(async () => { for (const app of servers) await app.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, start, app: await start() };
}
async function register(app, displayName = 'Sam') {
  const jar = cookieClient(app.origin), recoveryKey = recovery();
  const signed = await jar.client.register({ recoveryKey, recoveryAcknowledged: true, displayName });
  assert.equal(signed.ok, true);
  return { ...jar, personId: signed.person.id, recoveryKey, csrf: signed.csrfToken };
}
async function friends(a, b) {
  const code = generateContactCode();
  assert.equal((await a.client.setContactCode(a.personId, { operationId: op(), code })).ok, true);
  const request = await b.client.requestFriend(b.personId, { operationId: op(), code });
  assert.equal(request.ok, true);
  const accepted = await a.client.respondInvitation(a.personId, request.invitation.id, { operationId: op(), choice: 'accept' });
  assert.equal(accepted.invitation.state, 'accepted');
  return { code, request };
}

test('contact codes are distinct cryptographic sharing inputs and never recovery credentials', () => {
  const a = generateContactCode(), b = generateContactCode();
  assert.equal(validContactCode(a), true); assert.notEqual(a, b);
  assert.equal(validContactCode(recovery()), false);
  assert.equal(validContactCode('dc1_' + 'z'.repeat(43)), false);
  assert.throws(() => generateContactCode({}), /Secure key/);
});

test('an offline friend receives a named durable invitation after restart and accepts membership without joining', async t => {
  const f = await fixture(t), a = await register(f.app, 'Sam'), b = await register(f.app, 'Riley');
  assert.ok((await a.client.status()).capabilities.includes('people'));
  const { code } = await friends(a, b);
  assert.deepEqual((await a.client.people(a.personId)).friends, [{ id: b.personId, displayName: 'Riley' }]);
  assert.deepEqual((await b.client.people(b.personId)).friends, [{ id: a.personId, displayName: 'Sam' }]);
  const home = await a.client.createHome(a.personId, { operationId: op(), name: 'The Copper Lantern' });
  const send = { operationId: op(), toPersonId: b.personId, homeId: home.home.id };
  const invited = await a.client.inviteHome(a.personId, send);
  assert.equal(invited.ok, true);
  assert.equal(invited.invitation.home.name, 'The Copper Lantern');
  assert.equal(Object.hasOwn(invited.invitation.home, 'roomKey'), false);
  await f.app.stop();
  const reopened = await f.start(), clean = cookieClient(reopened.origin).client;
  assert.equal((await clean.session()).person, null);
  assert.equal((await clean.recover(b.recoveryKey)).person.id, b.personId);
  const inbox = await clean.invitations(b.personId);
  const card = inbox.invitations.find(item => item.id === invited.invitation.id);
  assert.equal(card.state, 'pending'); assert.equal(card.otherPerson.displayName, 'Sam');
  const before = await publicAction(reopened.origin, 'new-room', { name: 'An unfinished session' });
  const seat = await publicAction(reopened.origin, 'join', { room: before.value.room, name: 'Riley' });
  const acceptInput = { operationId: op(), choice: 'accept' };
  const accepted = await clean.respondInvitation(b.personId, card.id, acceptInput);
  assert.equal(accepted.invitation.state, 'accepted');
  assert.equal((await clean.homes(b.personId)).homes[0].id, home.home.id);
  const roll = await publicAction(reopened.origin, 'roll', { room: before.value.room, playerId: seat.value.playerId, notation: '1d6' });
  assert.equal(roll.status, 200); // acceptance did not reseat or leave the live guest session
  assert.deepEqual(await clean.respondInvitation(b.personId, card.id, acceptInput), accepted);
  const joined = await publicAction(reopened.origin, 'join', { room: home.home.roomKey, name: 'Riley joins deliberately' });
  assert.equal(joined.value.settings.tableName, 'The Copper Lantern');
  assert.equal(joined.value.players.length, 1); // acceptance itself never created a player
  assert.equal(JSON.stringify(joined.value).includes(a.personId), false);
  assert.equal(JSON.stringify(joined.value).includes(b.personId), false);
  const files = await fs.readdir(f.directory);
  const stateText = await fs.readFile(path.join(f.directory, files.find(file => file.endsWith('.json'))), 'utf8');
  assert.equal(stateText.includes(code), false);
  assert.equal(reopened.logs().includes(code), false);
  assert.equal(reopened.logs().includes(b.recoveryKey), false);
});

test('recipient isolation, expected person, CSRF and closed request schemas protect social actions', async t => {
  const { app } = await fixture(t), a = await register(app), b = await register(app), outsider = await register(app);
  const code = generateContactCode();
  await a.client.setContactCode(a.personId, { operationId: op(), code });
  const request = await b.client.requestFriend(b.personId, { operationId: op(), code });
  const id = request.invitation.id;
  assert.deepEqual((await outsider.client.invitations(outsider.personId)).invitations, []);
  assert.equal((await outsider.client.respondInvitation(outsider.personId, id, { operationId: op(), choice: 'accept' })).code, 'social_not_found');
  assert.equal((await b.client.respondInvitation(b.personId, id, { operationId: op(), choice: 'accept' })).code, 'social_not_found');
  assert.equal((await b.client.people(a.personId)).code, 'identity_changed');
  assert.equal((await a.fetch(app.origin + '/api/account/people')).status, 409);
  const noCsrf = await a.fetch(app.origin + '/api/account/people/contact-code', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dice-Account': '1', 'X-Dice-Person': a.personId },
    body: JSON.stringify({ operationId: op(), code }) });
  assert.equal(noCsrf.status, 403);
  assert.equal((await a.client.setContactCode(a.personId, { operationId: op(), code, room: 'untrusted' })).code, 'invalid_social');
  assert.equal((await a.client.requestFriend(a.personId, { operationId: op(), code: a.recoveryKey })).code, 'contact_unavailable');
  assert.equal((await outsider.client.blockPerson(outsider.personId, a.personId, { operationId: op(), blocked: true })).code, 'social_not_found');
});

test('separate authenticated devices race response/cancel once; lost receipts never restore removed friends or left memberships', async t => {
  const { app } = await fixture(t), a = await register(app), b = await register(app), second = cookieClient(app.origin).client;
  await second.recover(a.recoveryKey);
  const code = generateContactCode();
  await a.client.setContactCode(a.personId, { operationId: op(), code });
  const request = await b.client.requestFriend(b.personId, { operationId: op(), code });
  const input = { operationId: op(), choice: 'accept' };
  const results = await Promise.all([a.client.respondInvitation(a.personId, request.invitation.id, input),
    second.respondInvitation(a.personId, request.invitation.id, { operationId: op(), choice: 'decline' })]);
  assert.equal(results[0].invitation.state, results[1].invitation.state);
  if (results[0].invitation.state === 'declined') {
    await a.client.archiveInvitation(a.personId, request.invitation.id, { operationId: op() });
    await friends(a, b);
  }
  assert.equal((await a.client.people(a.personId)).friends.length, 1);
  const home = await a.client.createHome(a.personId, { operationId: op(), name: 'A returnable home' });
  const invited = await a.client.inviteHome(a.personId, { operationId: op(), toPersonId: b.personId, homeId: home.home.id });
  const acceptHome = { operationId: op(), choice: 'accept' };
  const accepted = await b.client.respondInvitation(b.personId, invited.invitation.id, acceptHome);
  assert.equal(accepted.invitation.state, 'accepted');
  await b.client.leaveHome(b.personId, home.home.id, { operationId: op() });
  assert.deepEqual(await b.client.respondInvitation(b.personId, invited.invitation.id, acceptHome), accepted);
  assert.equal((await b.client.respondInvitation(b.personId, invited.invitation.id, { operationId: op(), choice: 'accept' })).invitation.state, 'accepted');
  assert.deepEqual((await b.client.homes(b.personId)).homes, []);
  await a.client.removeFriend(a.personId, b.personId, { operationId: op() });
  await a.client.respondInvitation(a.personId, request.invitation.id, input);
  assert.deepEqual((await a.client.people(a.personId)).friends, []);
  assert.deepEqual((await b.client.people(b.personId)).friends, []);
  assert.equal((await b.client.requestFriend(b.personId, { operationId: op(), code })).code, 'contact_unavailable');
  await a.client.setContactCode(a.personId, { operationId: op(), code });
  assert.equal((await b.client.requestFriend(b.personId, { operationId: op(), code })).code, 'contact_unavailable'); // reissuing the current code does not freshen old consent
  assert.equal((await a.client.inviteHome(a.personId, { operationId: op(), toPersonId: b.personId, homeId: home.home.id })).code, 'contact_unavailable');
});

test('blocking and removal invalidate pending invitations, rotation invalidates old codes, and archive preserves other inboxes', async t => {
  const { app } = await fixture(t), a = await register(app), b = await register(app);
  const { code } = await friends(a, b);
  const home = await a.client.createHome(a.personId, { operationId: op(), name: 'Invited home' });
  const input = { operationId: op(), toPersonId: b.personId, homeId: home.home.id };
  const invitation = await a.client.inviteHome(a.personId, input);
  assert.deepEqual(await a.client.inviteHome(a.personId, input), invitation);
  assert.equal((await a.client.inviteHome(a.personId, { ...input, homeId: 'h_' + 'x'.repeat(43) })).code, 'operation_reused');
  await b.client.blockPerson(b.personId, a.personId, { operationId: op(), blocked: true });
  const declined = await b.client.respondInvitation(b.personId, invitation.invitation.id, { operationId: op(), choice: 'accept' });
  assert.equal(declined.invitation.state, 'cancelled');
  assert.deepEqual((await b.client.homes(b.personId)).homes, []);
  assert.equal((await b.client.people(b.personId)).blockedPersonIds[0], a.personId);
  assert.deepEqual((await a.client.people(a.personId)).blockedPersonIds, []);
  await b.client.archiveInvitation(b.personId, invitation.invitation.id, { operationId: op() });
  assert.equal((await b.client.invitations(b.personId)).invitations.some(row => row.id === invitation.invitation.id), false);
  assert.equal((await a.client.invitations(a.personId, { direction: 'outgoing' })).invitations.find(row => row.id === invitation.invitation.id).state, 'cancelled');
  const nextCode = generateContactCode();
  await a.client.setContactCode(a.personId, { operationId: op(), code: nextCode });
  assert.equal((await b.client.requestFriend(b.personId, { operationId: op(), code })).code, 'contact_unavailable');
  assert.equal((await b.client.requestFriend(b.personId, { operationId: op(), code: nextCode })).code, 'contact_unavailable');
  await b.client.blockPerson(b.personId, a.personId, { operationId: op(), blocked: false });
  assert.deepEqual((await b.client.people(b.personId)).friends, []);
  const newRequest = await b.client.requestFriend(b.personId, { operationId: op(), code: nextCode });
  assert.equal(newRequest.ok, true);
});

test('social corruption refuses rather than emptying a directory, while new guest play still works during outage', async t => {
  const f = await fixture(t), a = await register(f.app), b = await register(f.app);
  await friends(a, b);
  await f.app.stop();
  const store = await openFileStore({ directory: f.directory });
  await store.transact(async tx => {
    const saved = await tx.get(`socialPeople/${a.personId}`);
    tx.put(`socialPeople/${a.personId}`, { ...saved, friendIds: 'damaged-private-friends' });
  });
  await store.close();
  const app = await f.start(), clean = cookieClient(app.origin).client;
  await clean.recover(a.recoveryKey);
  assert.equal((await clean.people(a.personId)).code, 'account_unavailable');
  assert.equal(Object.hasOwn(await clean.people(a.personId), 'friends'), false);
  const table = await publicAction(app.origin, 'new-room', { name: 'Guests remain welcome' });
  const seat = await publicAction(app.origin, 'join', { room: table.value.room, name: 'Guest' });
  assert.equal((await publicAction(app.origin, 'roll', { room: table.value.room, playerId: seat.value.playerId, notation: '1d6' })).status, 200);
  assert.equal(app.logs().includes('damaged-private-friends'), false);
  await app.stop();
  const missingStore = await openFileStore({ directory: f.directory });
  await missingStore.transact(async tx => { await tx.get(`socialPeople/${a.personId}`); tx.delete(`socialPeople/${a.personId}`); });
  await missingStore.close();
  const missingApp = await f.start(), missingClient = cookieClient(missingApp.origin).client;
  await missingClient.recover(a.recoveryKey);
  assert.equal((await missingClient.people(a.personId)).code, 'account_unavailable'); // durable account marker makes a missing directory corrupt, not empty
});

test('independent sender cancellation and recipient acceptance have one outcome and never duplicate membership', async t => {
  const { app } = await fixture(t), a = await register(app), b = await register(app);
  await friends(a, b);
  const home = await a.client.createHome(a.personId, { operationId: op(), name: 'Race home' });
  const invite = await a.client.inviteHome(a.personId, { operationId: op(), toPersonId: b.personId, homeId: home.home.id });
  const result = await Promise.all([b.client.respondInvitation(b.personId, invite.invitation.id, { operationId: op(), choice: 'accept' }),
    a.client.cancelInvitation(a.personId, invite.invitation.id, { operationId: op() })]);
  assert.equal(result[0].invitation.state, result[1].invitation.state);
  const accepted = result[0].invitation.state === 'accepted';
  assert.equal((await b.client.homes(b.personId)).homes.length, accepted ? 1 : 0);
  assert.equal((await a.client.home(a.personId, home.home.id)).home.memberCount, accepted ? 2 : 1);
});

test('injected time proves expiry and daily quota without sleeping; expired actions cannot grant friendship', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-social-clock-'));
  const store = await openFileStore({ directory });
  let at = Date.now();
  const service = createAccountService({ store, now: () => at, homeBridge: {
    capture: () => ({ ok: false }), validate: document => ({ ok: true, document }),
    fresh: name => ({ ok: true, document: { schema: 1, settings: { tableName: name, venue: 'table', felt: 'baize' }, setup: null } }),
  } });
  t.after(async () => { await service.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const a = await service.register({ recoveryKey: recovery(), recoveryAcknowledged: true, displayName: 'Sam' });
  const b = await service.register({ recoveryKey: recovery(), recoveryAcknowledged: true, displayName: 'Riley' });
  const action = (who, action, input = {}, id) => service.social(who.sessionToken, who.csrfToken, who.person.id, action, { input, id });
  const code = generateContactCode();
  await action(a, 'code', { operationId: op(), code });
  const request = await action(b, 'request', { operationId: op(), code });
  at += SOCIAL_EXPIRY_MS + 1;
  const expired = await action(a, 'respond', { operationId: op(), choice: 'accept' }, request.invitation.id);
  assert.equal(expired.invitation.state, 'expired');
  assert.deepEqual((await action(a, 'people')).friends, []);
  assert.equal((await action(b, 'request', { operationId: op(), code })).code, 'contact_unavailable');
  const nextCode = generateContactCode();
  await action(a, 'code', { operationId: op(), code: nextCode });
  const fresh = await action(b, 'request', { operationId: op(), code: nextCode });
  await action(a, 'respond', { operationId: op(), choice: 'accept' }, fresh.invitation.id);
  const home = await service.home(a.sessionToken, a.csrfToken, a.person.id, 'create', { input: { operationId: op(), name: 'Quota home' } });
  for (let n = 0; n < 16; n++) assert.equal((await action(a, 'invite', { operationId: op(), toPersonId: b.person.id, homeId: home.home.id })).ok, true);
  assert.equal((await action(a, 'invite', { operationId: op(), toPersonId: b.person.id, homeId: home.home.id })).code, 'social_send_limit');
  at += 24 * 60 * 60 * 1000;
  assert.equal((await action(a, 'invite', { operationId: op(), toPersonId: b.person.id, homeId: home.home.id })).ok, true);
  for (let n = 0; n < 15; n++) assert.equal((await action(a, 'invite', { operationId: op(), toPersonId: b.person.id, homeId: home.home.id })).ok, true);
  assert.equal((await action(a, 'invite', { operationId: op(), toPersonId: b.person.id, homeId: home.home.id })).code, 'social_limit');
  const page = await action(b, 'invitations', { direction: 'incoming' });
  assert.equal(page.invitations.length, 20); assert.equal(typeof page.next, 'string');
  const rest = await action(b, 'invitations', { direction: 'incoming', after: page.next });
  assert.equal(rest.invitations.length, 12); assert.equal(rest.next, null);
  const first = page.invitations[0];
  assert.equal((await action(b, 'archive', { operationId: op() }, first.id)).code, 'invitation_pending');
  const ownHomes = [];
  for (let n = 0; n < 32; n++) ownHomes.push(await service.home(b.sessionToken, b.csrfToken, b.person.id, 'create', {
    input: { operationId: op(), name: `Kept table ${n}` } }));
  assert.equal(ownHomes.every(saved => saved.ok), true);
  assert.equal((await action(b, 'respond', { operationId: op(), choice: 'accept' }, first.id)).code, 'social_limit');
  assert.equal((await action(b, 'invitations', { direction: 'incoming' })).invitations[0].state, 'pending');
  await service.home(b.sessionToken, b.csrfToken, b.person.id, 'leave', { id: ownHomes[0].home.id, input: { operationId: op() } });
  assert.equal((await action(b, 'respond', { operationId: op(), choice: 'accept' }, first.id)).invitation.state, 'accepted');
  await action(b, 'archive', { operationId: op() }, first.id);
  assert.equal((await action(b, 'invitations', { direction: 'incoming' })).invitations.some(row => row.id === first.id), false);
});
