/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectAccountConfiguration, readAccountConfiguration } from '../service/account-config.js';
import { appServer, publicAction } from './fixtures/app-server.mjs';
import { cookieClient } from './fixtures/library-harness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = { DICE_ACCOUNT_STORE: 'firestore', DICE_ACCOUNT_ORIGIN: 'https://dice.example',
  DICE_FIRESTORE_PROJECT: 'fixture-project', DICE_ACCOUNT_NAMESPACE: 'fixture-production' };
const operationId = () => crypto.randomUUID();

test('shared runtime/preflight schema validates modes and exact origins without echoing configuration values', () => {
  assert.equal(inspectAccountConfiguration({}, { production: true }).state, 'disabled');
  assert.deepEqual(readAccountConfiguration({ DICE_ACCOUNT_STORE: 'paused' }), { mode: 'paused' });
  assert.equal(inspectAccountConfiguration({ DICE_ACCOUNT_STORE: 'paused' }, { production: true }).valid, true);
  assert.equal(inspectAccountConfiguration(production, { production: true }).ready, true);
  for (const [field, value] of [['DICE_ACCOUNT_STORE', 'secret-bad-mode'], ['DICE_ACCOUNT_ORIGIN', 'https://secret.example/path'],
    ['DICE_FIRESTORE_PROJECT', 'private/project'], ['DICE_FIRESTORE_DATABASE', '../private'], ['DICE_ACCOUNT_NAMESPACE', 'private/namespace']]) {
    const result = inspectAccountConfiguration({ ...production, [field]: value }, { production: true });
    assert.equal(result.ready, false); assert.equal(result.issues[0].field, field);
    assert.equal(JSON.stringify(result).includes(value), false);
  }
  for (const origin of ['https://dice.example/', 'https://dice.example?query', 'https://user:password@dice.example', 'null', 'http://public.example']) {
    assert.equal(inspectAccountConfiguration({ ...production, DICE_ACCOUNT_ORIGIN: origin }).ready, false);
  }
  const local = { DICE_ACCOUNT_STORE: 'file', DICE_ACCOUNT_ORIGIN: 'http://127.0.0.1:34567', DICE_ACCOUNT_DIR: path.join(os.tmpdir(), 'fixture-private-directory') };
  assert.equal(inspectAccountConfiguration(local).ready, true);
  assert.equal(inspectAccountConfiguration(local, { production: true }).ready, false);
  assert.equal(inspectAccountConfiguration({ ...local, K_SERVICE: 'fixture-run-service' }).ready, false);
  assert.equal(inspectAccountConfiguration({ ...local, DICE_ACCOUNT_DIR: root }).ready, false);
  assert.equal(inspectAccountConfiguration({ ...production, DICE_DEV_WRITE: '1' }, { production: true }).ready, false);
});

test('preflight CLI creates no local store and reports only sanitized readiness', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-preflight-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const candidate = path.join(directory, 'not-created');
  const run = spawnSync(process.execPath, ['tools/account-preflight.mjs'], { cwd: root, encoding: 'utf8', env: {
    ...process.env, K_SERVICE: '', DICE_ACCOUNT_STORE: 'file', DICE_ACCOUNT_ORIGIN: 'http://127.0.0.1:34567', DICE_ACCOUNT_DIR: candidate,
  } });
  assert.equal(run.status, 0); assert.equal(JSON.parse(run.stdout).state, 'configuration_ready');
  assert.equal(run.stdout.includes(candidate), false);
  await assert.rejects(() => fs.access(candidate), error => error.code === 'ENOENT');
  const paused = spawnSync(process.execPath, ['tools/account-preflight.mjs', '--production'], { cwd: root, encoding: 'utf8',
    env: { ...process.env, DICE_ACCOUNT_STORE: 'paused', DICE_ACCOUNT_ORIGIN: '', DICE_ACCOUNT_DIR: '', DICE_ACCOUNT_NAMESPACE: '', DICE_FIRESTORE_PROJECT: '' } });
  assert.equal(paused.status, 2); assert.equal(JSON.parse(paused.stdout).state, 'paused');
  assert.equal(paused.stderr, '');
});

test('paused mode protects both converted and reserved homes without credentials; live guest turns continue and resuming restores data', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-paused-'));
  const servers = [await appServer(directory)];
  t.after(async () => { for (const app of servers) await app.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  const a = cookieClient(servers[0].origin).client, recoveryKey = 'dt1_' + crypto.randomBytes(32).toString('base64url');
  const signed = await a.register({ recoveryKey, recoveryAcknowledged: true, displayName: 'Sam' });
  const personId = signed.person.id;
  const fresh = await publicAction(servers[0].origin, 'new-room', { name: 'Same address kept' });
  const joined = await publicAction(servers[0].origin, 'join', { room: fresh.value.room, name: 'Sam' });
  const seat = { room: fresh.value.room, playerId: joined.value.playerId };
  await publicAction(servers[0].origin, 'settings', { ...seat, settings: { zoom: 'wide', venue: 'moonrise' } });
  const capture = await a.captureHome(personId, seat);
  const converted = await a.createHome(personId, { ...seat, operationId: operationId(), expectedCapture: capture.captureRevision });
  const reserved = await a.createHome(personId, { operationId: operationId(), name: 'A reserved home' });
  assert.equal(converted.ok, true); assert.equal(reserved.ok, true);
  await servers[0].stop();
  const before = await fs.readFile(path.join(directory, 'state.json'));
  servers.push(await appServer(directory, { DICE_ACCOUNT_STORE: 'paused', DICE_ACCOUNT_DIR: '', DICE_ACCOUNT_ORIGIN: '',
    DICE_FIRESTORE_PROJECT: '', DICE_FIRESTORE_DATABASE: '', DICE_ACCOUNT_NAMESPACE: '' }));
  const paused = servers[1], account = cookieClient(paused.origin).client;
  const status = await account.status();
  assert.equal(status.enabled, true); assert.equal(status.available, false); assert.equal(status.paused, true);
  assert.equal((await account.recover(recoveryKey)).code, 'account_unavailable');
  for (const room of [converted.home.roomKey, reserved.home.roomKey, 'possibly-converted-legacy-key']) {
    const result = await publicAction(paused.origin, 'join', { room, name: 'Guest' });
    assert.equal(result.status, 503); assert.equal(result.value.code, 'account_unavailable');
  }
  const guest = await publicAction(paused.origin, 'new-room', { name: 'Play through maintenance' });
  const player = await publicAction(paused.origin, 'join', { room: guest.value.room, name: 'Guest' });
  const live = { room: guest.value.room, playerId: player.value.playerId };
  const turn = await publicAction(paused.origin, 'roll', { ...live, notation: '3d6 t3' });
  assert.equal(turn.status, 200);
  assert.equal((await publicAction(paused.origin, 'join', { room: live.room, name: 'Second guest' })).value.players.length, 2);
  assert.equal((await publicAction(paused.origin, 'rethrow', { ...live, rollId: turn.value.roll.rollId, keep: [0] })).value.roll.throws.used, 2);
  await assert.rejects(() => fs.access(path.join(directory, 'writer.lock')), error => error.code === 'ENOENT');
  await paused.stop();
  assert.deepEqual(await fs.readFile(path.join(directory, 'state.json')), before); // pause never opens or rewrites the store
  servers.push(await appServer(directory));
  const resumed = servers[2], clean = cookieClient(resumed.origin).client;
  assert.equal((await clean.recover(recoveryKey)).person.id, personId);
  assert.equal((await clean.homes(personId)).homes.length, 2);
  const restored = await publicAction(resumed.origin, 'join', { room: converted.home.roomKey, name: 'Returned guest' });
  assert.equal(restored.value.savedHome, true);
  assert.equal(restored.value.settings.tableName, 'Same address kept');
  assert.equal(restored.value.settings.venue, 'moonrise'); assert.equal(restored.value.settings.zoom, 'wide');
  assert.equal((await publicAction(resumed.origin, 'join', { room: reserved.home.roomKey, name: 'Returned guest' })).value.settings.tableName, 'A reserved home');
});
