/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { appServer, publicAction } from './fixtures/app-server.mjs';
import { cookieClient, document } from './fixtures/library-harness.mjs';
import { openFileStore } from '../service/store-file.js';

const key = () => 'dt1_' + crypto.randomBytes(32).toString('base64url');
const operationId = () => crypto.randomUUID();
async function fixture(t, env = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-homes-'));
  const servers = [];
  const start = async overrides => { const app = await appServer(directory, { ...env, ...overrides }); servers.push(app); return app; };
  t.after(async () => { for (const app of servers) await app.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, start, app: await start() };
}
async function register(app, recoveryKey = key()) {
  const { client, ...jar } = cookieClient(app.origin);
  const response = await client.register({ recoveryKey, recoveryAcknowledged: true, displayName: 'Sam' });
  assert.equal(response.ok, true);
  return { client, ...jar, personId: response.person.id, recoveryKey };
}
async function guest(app, name = 'The Copper Lantern') {
  const created = await publicAction(app.origin, 'new-room', { name });
  assert.equal(created.status, 200);
  const joined = await publicAction(app.origin, 'join', { room: created.value.room, name: 'Guest' });
  assert.equal(joined.status, 200);
  return { room: created.value.room, playerId: joined.value.playerId };
}
const captureInput = (seat, captured) => ({ ...seat, expectedCapture: captured.captureRevision, operationId: operationId() });

test('same-address conversion captures only shared preparation and concurrent clean guests restore it after process restart', async t => {
  const fixtureApp = await fixture(t);
  const { app } = fixtureApp;
  const a = await register(app);
  const seat = await guest(app);
  await publicAction(app.origin, 'settings', { ...seat, settings: { system: 'none', zoom: 'close' } });
  const prepared = { ...seat, rev: 7, ver: '2.0.0', table: { tableName: 'The Copper Lantern' },
    profiles: [{ name: 'Public cleric', system: 'none', set: 'tidewrack.seaglass', pools: [{ name: 'Blessing', notation: '2d6', set: 'symbols.monster' }] }] };
  assert.equal((await publicAction(app.origin, 'table', prepared)).status, 200);
  await a.client.saveLibrary(a.personId, { operationId: operationId(), baseRevision: null, document: document('Private wizard') });
  await publicAction(app.origin, 'pools', { ...seat, profile: 'Unprepared personal rack', pools: [{ name: 'Personal spell', notation: '3d6' }] });
  await publicAction(app.origin, 'roll', { ...seat, notation: '1d20 private' });
  const first = await a.client.captureHome(a.personId, seat);
  assert.equal(first.ok, true);
  assert.equal(JSON.stringify(first).includes('Private wizard'), false);
  assert.equal(JSON.stringify(first).includes('Personal spell'), false);
  assert.equal(JSON.stringify(first).includes(seat.playerId), false);
  await publicAction(app.origin, 'settings', { ...seat, settings: { zoom: 'wide' } });
  assert.equal((await a.client.createHome(a.personId, captureInput(seat, first))).code, 'capture_changed');
  const capture = await a.client.captureHome(a.personId, seat);
  const input = captureInput(seat, capture);
  const saved = await a.client.createHome(a.personId, input);
  assert.equal(saved.ok, true);
  assert.equal(saved.home.roomKey, seat.room);
  assert.equal((await a.client.homes(a.personId)).homes.length, 1);
  const persisted = (await a.client.home(a.personId, saved.home.id)).document;
  assert.equal(persisted.setup.profiles[0].name, 'Public cleric');
  assert.deepEqual(Object.keys(persisted).sort(), ['schema', 'settings', 'setup']);
  assert.equal((await app.stop()).code, 0);
  const restarted = await fixtureApp.start();
  const clean = cookieClient(restarted.origin).client;
  assert.equal((await clean.recover(a.recoveryKey)).person.id, a.personId);
  assert.deepEqual(await clean.createHome(a.personId, input), saved); // lost acknowledgement can retry after the old seat is gone
  const arrivals = await Promise.all(['Alice', 'Bob'].map(name => publicAction(restarted.origin, 'join', { room: seat.room, name })));
  for (const arrival of arrivals) {
    assert.equal(arrival.status, 200);
    assert.equal(arrival.value.savedHome, true);
    assert.deepEqual(arrival.value.settings, persisted.settings);
    assert.deepEqual(arrival.value.setup, persisted.setup);
    assert.deepEqual(arrival.value.log, []);
    assert.equal(JSON.stringify(arrival.value).includes(a.personId), false);
    assert.equal(JSON.stringify(arrival.value).includes('Private wizard'), false);
  }
  assert.equal(arrivals[1].value.players.length, 2);
  await publicAction(restarted.origin, 'settings', { room: seat.room, playerId: arrivals[0].value.playerId, settings: { tableName: 'Live guest change' } });
  await clean.home(a.personId, saved.home.id);
  const later = await publicAction(restarted.origin, 'join', { room: seat.room, name: 'Cara' });
  assert.equal(later.value.settings.tableName, 'Live guest change'); // membership/read cannot reapply an old saved head to an occupied room
  assert.equal((await clean.home(a.personId, saved.home.id)).document.settings.tableName, 'The Copper Lantern');
});

test('independent account sessions retain stale home saves and reconcile explicitly without changing the live table', async t => {
  const { app } = await fixture(t);
  const a = await register(app), b = cookieClient(app.origin).client, stranger = await register(app);
  await b.recover(a.recoveryKey);
  const seat = await guest(app);
  const capture = await a.client.captureHome(a.personId, seat);
  const created = await a.client.createHome(a.personId, captureInput(seat, capture));
  const id = created.home.id;
  assert.equal((await stranger.client.home(stranger.personId, id)).code, 'home_not_found');
  assert.equal((await stranger.client.captureHome(stranger.personId, { room: seat.room, playerId: 'wrong' })).code, 'live_seat_required');
  assert.equal((await stranger.client.createHome(stranger.personId, captureInput(seat, capture))).code, 'home_exists');
  await publicAction(app.origin, 'settings', { ...seat, settings: { tableName: 'First saved edit' } });
  const c1 = await a.client.captureHome(a.personId, seat);
  const firstInput = { ...captureInput(seat, c1), baseRevision: created.revision };
  const first = await a.client.saveHome(a.personId, id, firstInput);
  assert.equal(first.ok, true);
  await publicAction(app.origin, 'settings', { ...seat, settings: { tableName: 'Second live edit' } });
  const c2 = await b.captureHome(a.personId, seat);
  const secondInput = { ...captureInput(seat, c2), baseRevision: created.revision };
  const conflict = await b.saveHome(a.personId, id, secondInput);
  assert.equal(conflict.code, 'home_conflict');
  assert.deepEqual(await b.saveHome(a.personId, id, secondInput), conflict);
  assert.equal((await b.saveHome(a.personId, id, { ...secondInput, baseRevision: first.revision })).code, 'operation_reused');
  assert.equal((await a.client.home(a.personId, id, conflict.candidateRevision)).document.settings.tableName, 'Second live edit');
  const resolved = await b.saveHome(a.personId, id, { operationId: operationId(), baseRevision: first.revision,
    sourceVersionId: created.revision }, { reconcile: true });
  assert.equal(resolved.ok, true);
  assert.equal((await a.client.home(a.personId, id)).document.settings.tableName, 'The Copper Lantern');
  assert.equal((await publicAction(app.origin, 'join', { room: seat.room, name: 'Other guest' })).value.settings.tableName, 'Second live edit');
  const headersMissing = await a.fetch(app.origin + '/api/account/homes');
  assert.equal(headersMissing.status, 409);
});

test('a configured store outage refuses cold addresses while fresh guest creation and occupied rooms stay usable', async t => {
  const { app } = await fixture(t, { DICE_ACCOUNT_ORIGIN: 'http://untrusted.example' });
  assert.equal((await publicAction(app.origin, 'join', { room: 'old-saved-or-guest-key', name: 'Guest' })).status, 503);
  const seat = await guest(app, 'Still a guest table');
  assert.equal((await publicAction(app.origin, 'roll', { ...seat, notation: '1d6' })).status, 200);
  assert.equal((await publicAction(app.origin, 'join', { room: seat.room, name: 'Second guest' })).status, 200);
  assert.equal((await publicAction(app.origin, 'join', { room: 'h_' + 'a'.repeat(43), name: 'Guest' })).status, 503);
});

test('new named homes recover at reserved addresses; leaving preserves an unclaimable closed reservation', async t => {
  const f = await fixture(t);
  const a = await register(f.app);
  const created = await a.client.createHome(a.personId, { operationId: operationId(), name: 'A new table home' });
  assert.equal(created.ok, true);
  assert.ok(created.home.roomKey.startsWith('h_'));
  const joined = await publicAction(f.app.origin, 'join', { room: created.home.roomKey, name: 'Walk-in guest' });
  assert.equal(joined.status, 200);
  assert.equal(joined.value.settings.tableName, 'A new table home');
  assert.equal((await a.client.leaveHome(a.personId, created.home.id, { operationId: operationId() })).ok, true);
  assert.deepEqual((await a.client.homes(a.personId)).homes, []);
  assert.equal((await a.client.home(a.personId, created.home.id)).code, 'home_not_found');
  assert.equal((await publicAction(f.app.origin, 'join', { room: created.home.roomKey, name: 'Live guest' })).status, 200);
  await f.app.stop();
  const restarted = await f.start();
  const closed = await publicAction(restarted.origin, 'join', { room: created.home.roomKey, name: 'Later guest' });
  assert.equal(closed.status, 410);
  assert.equal(closed.value.code, 'home_closed');
});

test('distinct authenticated members using the same operation ID retain separate versions and correct venue covers', async t => {
  const f = await fixture(t);
  const a = await register(f.app), b = await register(f.app);
  const seat = await guest(f.app, 'Original home');
  const first = await a.client.createHome(a.personId, captureInput(seat, await a.client.captureHome(a.personId, seat)));
  await publicAction(f.app.origin, 'settings', { ...seat, settings: { tableName: 'Other revision', venue: 'moonrise' } });
  const next = await a.client.saveHome(a.personId, first.home.id, { ...captureInput(seat, await a.client.captureHome(a.personId, seat)), baseRevision: first.revision });
  assert.equal(next.home.coverId, 'moonrise');
  assert.equal(next.home.cover.venue, 'moonrise');
  assert.equal(typeof next.home.cover.felt, 'string');
  await f.app.stop();
  // Membership fixture only: the invitations slice owns the real membership
  // entry action. Subsequent races use distinct authenticated HTTP cookie jars.
  const store = await openFileStore({ directory: f.directory });
  await store.transact(async tx => {
    const home = await tx.get(`homes/${first.home.id}`);
    const person = await tx.get(`people/${b.personId}`);
    tx.put(`homes/${home.id}`, { ...home, memberIds: [...home.memberIds, person.id] });
    tx.put(`people/${person.id}`, { ...person, homeIds: [...person.homeIds, home.id] });
  });
  await store.close();
  const restarted = await f.start();
  const aa = cookieClient(restarted.origin).client, bb = cookieClient(restarted.origin).client;
  await aa.recover(a.recoveryKey); await bb.recover(b.recoveryKey);
  const shared = operationId();
  const inputs = [{ operationId: shared, baseRevision: next.revision, sourceVersionId: first.revision },
    { operationId: shared, baseRevision: next.revision, sourceVersionId: next.revision }];
  const results = await Promise.all([aa.saveHome(a.personId, first.home.id, inputs[0], { reconcile: true }),
    bb.saveHome(b.personId, first.home.id, inputs[1], { reconcile: true })]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.filter(result => result.code === 'home_conflict').length, 1);
  const revisions = results.map(result => result.revision || result.candidateRevision);
  assert.equal(new Set(revisions).size, 2);
  assert.equal((await aa.home(a.personId, first.home.id, revisions[0])).document.settings.tableName, 'Original home');
  assert.equal((await bb.home(b.personId, first.home.id, revisions[1])).document.settings.tableName, 'Other revision');
  assert.equal((await aa.home(a.personId, first.home.id)).versions.length, 4);
  assert.deepEqual(await bb.saveHome(b.personId, first.home.id, inputs[1], { reconcile: true }), results[1]);
});

test('malformed new-table requests refuse without 500s and reserved missing addresses never become solo replacements', async t => {
  const { app } = await fixture(t, { DICE_ACCOUNT_STORE: 'off' });
  for (const body of [null, [], 1, { name: [] }, { name: false }, { room: 'an-old-address' }]) {
    assert.equal((await publicAction(app.origin, 'new-room', body)).status, 400);
  }
  assert.equal((await publicAction(app.origin, 'join', { room: 'ordinary-cold-guest', name: 'Guest' })).status, 200);
  const reserved = await publicAction(app.origin, 'join', { room: 'h_' + 'x'.repeat(43), name: 'Guest' });
  assert.equal(reserved.status, 410); // 404 would trigger the network client's static-solo fallback
});

test('home version capacity refuses without losing a captured version or replacing the current head', async t => {
  const { app } = await fixture(t);
  const a = await register(app);
  const first = await a.client.createHome(a.personId, { operationId: operationId(), name: 'History bounds' });
  let head = first.revision;
  for (let n = 1; n < 100; n++) {
    const saved = await a.client.saveHome(a.personId, first.home.id, { operationId: operationId(), baseRevision: head, sourceVersionId: first.revision }, { reconcile: true });
    assert.equal(saved.ok, true); head = saved.revision;
  }
  assert.equal((await a.client.saveHome(a.personId, first.home.id, { operationId: operationId(), baseRevision: head, sourceVersionId: first.revision }, { reconcile: true })).code, 'home_limit');
  const read = await a.client.home(a.personId, first.home.id);
  assert.equal(read.versions.length, 100); assert.equal(read.revision, head);
  assert.equal((await a.client.home(a.personId, first.home.id, first.revision)).document.settings.tableName, 'History bounds');
});

test('corrupt saved setup remains on disk and cold joins never hydrate an empty replacement', async t => {
  const f = await fixture(t);
  const a = await register(f.app);
  const saved = await a.client.createHome(a.personId, { operationId: operationId(), name: 'Kept damaged home' });
  await f.app.stop();
  const filename = path.join(f.directory, 'state.json');
  const snapshot = JSON.parse(await fs.readFile(filename, 'utf8'));
  const recordPath = `homeVersions/${saved.home.id}/versions/${saved.revision}`;
  snapshot.records[recordPath].value.document.schema = 999;
  await fs.writeFile(filename, JSON.stringify(snapshot));
  const restarted = await f.start();
  for (let n = 0; n < 2; n++) assert.equal((await publicAction(restarted.origin, 'join', { room: saved.home.roomKey, name: 'Guest' })).status, 503);
  const clean = cookieClient(restarted.origin).client;
  await clean.recover(a.recoveryKey);
  assert.equal((await clean.home(a.personId, saved.home.id)).code, 'account_unavailable');
  assert.equal(JSON.parse(await fs.readFile(filename, 'utf8')).records[recordPath].value.document.schema, 999);
  const fresh = await guest(restarted, 'Another guest table');
  assert.equal((await publicAction(restarted.origin, 'join', { room: fresh.room, name: 'Second guest' })).status, 200);
  assert.equal(restarted.logs().includes('Kept damaged home'), false);
});
