/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Browser } from './e2e/cdp.mjs';
import { appServer } from './fixtures/app-server.mjs';
import { libraryServer } from './fixtures/library-harness.mjs';

async function pageAt(browser, origin, pathname = '/health') {
  const page = await browser.newPage();
  await page.navigate(origin + pathname);
  for (let n = 0; n < 100; n++) {
    try { if (await page.eval(`location.origin === ${JSON.stringify(origin)}`)) return page; } catch { /* navigation */ }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('fixture navigation timed out');
}

test('real browser New-table helper works during storage outage, distinguishes cold-home refusal, and falls back on old-host 404', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-home-browser-'));
  const app = await appServer(directory, { DICE_ACCOUNT_ORIGIN: 'http://untrusted.example' });
  const browser = await new Browser().launch();
  t.after(async () => { await browser.close(); await app.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  const a = await pageAt(browser, app.origin);
  const result = await a.eval(`(async () => {
    const net = await import('/js/net.js');
    const created = await net.createGuestTable('Outage guest table');
    const live = await net.connect({room:created.room,name:'Guest'});
    const rolled = await live.roll([], '', {notation:'1d6'});
    const refusals = [];
    const cold = await net.connect({room:'possibly-saved-old-key',name:'Guest',onRefused: value => refusals.push(value)});
    await live.leave({immediate:true}); live.disconnect();
    return {created,online:live.online,rolled,cold,refusals};
  })()`);
  assert.equal(result.created.ok, true);
  assert.ok(result.created.room.startsWith('g_'));
  assert.equal(result.online, true);
  assert.ok(result.rolled?.rollId, 'the explicit guest table authors a real roll during the storage outage');
  assert.equal(result.cold.unavailableHome, true);
  assert.equal(result.cold.joinRefusal.code, 'account_unavailable');
  assert.equal(result.refusals.length, 1);
  const oldHost = await libraryServer(t);
  const b = await pageAt(browser, oldHost.origin, '/');
  const fallback = await b.eval(`(async () => (await import('/js/net.js')).createGuestTable('Legacy host'))()`);
  assert.equal(fallback.ok, true); assert.equal(fallback.local, true);
  assert.equal(typeof fallback.room, 'string');
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
});

test('clean browser recovery opens the durable home after server restart and marks the network connection as saved', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-home-recover-browser-'));
  const servers = [await appServer(directory)];
  const browsers = [await new Browser().launch()];
  t.after(async () => { for (const browser of browsers) await browser.close(); for (const app of servers) await app.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  const a = await pageAt(browsers[0], servers[0].origin);
  const created = await a.eval(`(async () => {
    const identity = await import('/js/account.js'); const net = await import('/js/net.js');
    const account = identity.createAccountClient(); const recoveryKey = identity.generateRecoveryKey();
    const signed = await account.register({recoveryKey,displayName:'Sam',recoveryAcknowledged:true});
    const table = await net.createGuestTable('The returnable group');
    const connection = await net.connect({room:table.room,name:'Guest'});
    await connection.setSettings({venue:'moonrise'});
    const seat = {room:table.room,playerId:connection.playerId};
    const capture = await account.captureHome(signed.person.id,seat);
    const saved = await account.createHome(signed.person.id,{...seat,operationId:crypto.randomUUID(),expectedCapture:capture.captureRevision});
    await connection.leave({immediate:true}); connection.disconnect();
    return {recoveryKey,personId:signed.person.id,saved};
  })()`);
  assert.equal(created.saved.ok, true);
  await servers[0].stop();
  servers.push(await appServer(directory)); browsers.push(await new Browser().launch());
  const b = await pageAt(browsers[1], servers[1].origin);
  const restored = await b.eval(`(async () => {
    const account = (await import('/js/account.js')).createAccountClient();
    const before = await account.session(); const recovered = await account.recover(${JSON.stringify(created.recoveryKey)});
    const homes = await account.homes(recovered.person.id);
    const connection = await (await import('/js/net.js')).connect({room:homes.homes[0].roomKey,name:'Clean guest'});
    const result = {before,recovered,homes,online:connection.online,savedHome:connection.savedHome,settings:connection.settings,log:connection.log};
    await connection.leave({immediate:true}); connection.disconnect(); return result;
  })()`);
  assert.equal(restored.before.person, null);
  assert.equal(restored.recovered.person.id, created.personId);
  assert.equal(restored.homes.homes[0].id, created.saved.home.id);
  assert.equal(restored.online, true); assert.equal(restored.savedHome, true);
  assert.equal(restored.settings.tableName, 'The returnable group'); assert.equal(restored.settings.venue, 'moonrise');
  assert.deepEqual(restored.log, []);
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
});
