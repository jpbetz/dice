/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Browser } from './e2e/cdp.mjs';
import { appServer } from './fixtures/app-server.mjs';

async function pageAt(browser, origin) {
  const page = await browser.newPage();
  await page.navigate(origin + '/health');
  for (let n = 0; n < 100; n++) {
    try { if (await page.eval(`location.origin === ${JSON.stringify(origin)}`)) return page; } catch { /* navigation */ }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('fixture navigation timed out');
}

test('clean independent browsers recover an offline home invitation, keep an open turn through acceptance, and join deliberately', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-social-browser-'));
  const servers = [await appServer(directory)], browsers = [await new Browser().launch(), await new Browser().launch()];
  t.after(async () => { for (const browser of browsers) await browser.close(); for (const app of servers) await app.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  const a = await pageAt(browsers[0], servers[0].origin), b = await pageAt(browsers[1], servers[0].origin);
  const first = await a.eval(`(async()=>{
    const api = await import('/js/account.js'); window.account = api.createAccountClient();
    window.recoveryKey = api.generateRecoveryKey();
    const signed = await account.register({recoveryKey,recoveryAcknowledged:true,displayName:'Sam'});
    window.personId = signed.person.id; const code = api.generateContactCode();
    await account.setContactCode(personId,{operationId:crypto.randomUUID(),code});
    return {personId,recoveryKey,code};
  })()`);
  const second = await b.eval(`(async()=>{
    const api = await import('/js/account.js'); window.account = api.createAccountClient();
    window.recoveryKey = api.generateRecoveryKey();
    const signed = await account.register({recoveryKey,recoveryAcknowledged:true,displayName:'Riley'});
    window.personId = signed.person.id;
    const requested = await account.requestFriend(personId,{operationId:crypto.randomUUID(),code:${JSON.stringify(first.code)}});
    return {personId,recoveryKey,requested};
  })()`);
  assert.equal(second.requested.ok, true);
  assert.equal(await a.eval(`(async()=> (await account.respondInvitation(personId,${JSON.stringify(second.requested.invitation.id)},
    {operationId:crypto.randomUUID(),choice:'accept'})).invitation.state)()`), 'accepted');
  await browsers[1].close(); // recipient is offline when the invitation is sent
  const invitation = await a.eval(`(async()=>{
    const created = await account.createHome(personId,{operationId:crypto.randomUUID(),name:'The Copper Lantern'});
    const invited = await account.inviteHome(personId,{operationId:crypto.randomUUID(),homeId:created.home.id,toPersonId:${JSON.stringify(second.personId)}});
    return {created,invited};
  })()`);
  assert.equal(invitation.invited.ok, true);
  // Close protocol-page sockets before asking for a graceful file-store
  // restart. An idle Chrome connection can otherwise reach the server's forced
  // shutdown deadline, correctly leaving a lock that needs crash recovery.
  await browsers[0].close(); await servers[0].stop();
  await assert.rejects(() => fs.access(path.join(directory, 'writer.lock')), error => error.code === 'ENOENT');
  servers.push(await appServer(directory)); browsers.push(await new Browser().launch(), await new Browser().launch());
  const returnedA = await pageAt(browsers[2], servers[1].origin), returnedB = await pageAt(browsers[3], servers[1].origin);
  const received = await returnedB.eval(`(async()=>{
    const api = await import('/js/account.js'); window.account = api.createAccountClient();
    const before = await account.session(); const signed = await account.recover(${JSON.stringify(second.recoveryKey)});
    if(!signed.ok) throw new Error('Recovery refused: '+signed.code);
    window.personId = signed.person.id;
    const inbox = await account.invitations(personId);
    const net = await import('/js/net.js'); const guest = await net.createGuestTable('Current unfinished game');
    window.connection = await net.connect({room:guest.room,name:'Riley',onEvent:(type,data)=>{
      if(type==='rethrow') window.finishRethrow?.(data.roll);
    }});
    window.turn = await connection.roll([], '', {notation:'3d6 t3 secret'});
    return {before,inbox,seat:connection.playerId,turnId:turn.rollId,used:turn.throws.used};
  })()`);
  assert.equal(received.before.person, null);
  const card = received.inbox.invitations.find(item => item.id === invitation.invited.invitation.id);
  assert.equal(card.state, 'pending'); assert.equal(card.otherPerson.displayName, 'Sam'); assert.equal(card.home.name, 'The Copper Lantern');
  assert.equal(received.used, 1);
  const accepted = await returnedB.eval(`(async()=>{
    const accepted = await account.respondInvitation(personId,${JSON.stringify(card.id)},{operationId:crypto.randomUUID(),choice:'accept'});
    let timer; const changed = new Promise((resolve,reject)=>{window.finishRethrow=resolve;
      timer=setTimeout(()=>reject(new Error('rethrow event missing')),3000);});
    if(!await connection.rethrow(turn.rollId,[0])) throw new Error('turn refused after acceptance');
    const rethrow = await changed; clearTimeout(timer);
    return {accepted,seat:connection.playerId,rethrow,homes:await account.homes(personId),signals:await account.presence(personId)};
  })()`);
  assert.equal(accepted.accepted.invitation.state, 'accepted'); assert.equal(accepted.seat, received.seat);
  assert.equal(accepted.rethrow.rollId, received.turnId); assert.equal(accepted.rethrow.throws.used, 2);
  assert.equal(accepted.homes.homes[0].roomKey, invitation.created.home.roomKey);
  assert.equal(accepted.signals.signals[0].state, 'unknown'); // recovery did not opt either person into presence
  await returnedA.eval(`(async()=>{
    window.account = (await import('/js/account.js')).createAccountClient();
    const signed = await account.recover(${JSON.stringify(first.recoveryKey)}); window.personId = signed.person.id;
    await account.setPresence(personId,{online:true});
  })()`);
  assert.equal(await returnedB.eval(`(async()=> (await account.presence(personId)).signals[0].state)()`), 'online');
  const deliberate = await returnedB.eval(`(async()=>{
    const home = (await account.homes(personId)).homes[0];
    await connection.leave({immediate:true}); connection.disconnect();
    window.connection = await (await import('/js/net.js')).connect({room:home.roomKey,name:'Riley'});
    return {online:connection.online,savedHome:connection.savedHome,name:connection.settings.tableName,log:connection.log,players:connection.players};
  })()`);
  assert.equal(deliberate.online, true); assert.equal(deliberate.savedHome, true); assert.equal(deliberate.name, 'The Copper Lantern');
  assert.deepEqual(deliberate.log, []); assert.equal(deliberate.players.length, 1);
  assert.equal(JSON.stringify(deliberate).includes(first.personId), false);
  assert.equal(JSON.stringify(deliberate).includes(second.personId), false);
  await returnedA.eval(`account.removeFriend(personId,${JSON.stringify(second.personId)},{operationId:crypto.randomUUID()})`);
  assert.deepEqual(await returnedB.eval(`(async()=> (await account.presence(personId)).signals)()`), []);
  await returnedB.eval(`(async()=>{await connection.leave({immediate:true}); connection.disconnect();})()`);
  for (const page of [a, b, returnedA, returnedB]) assert.deepEqual(page.errors, []);
});
