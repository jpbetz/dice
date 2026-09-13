/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openFileStore } from '../service/store-file.js';
import { createAccountService } from '../service/account.js';
import { createAccountClient } from '../js/account.js';
import { document } from './fixtures/library-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const key = () => 'dt1_' + crypto.randomBytes(32).toString('base64url');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  assert.notEqual(port, 8123);
  return port;
}
async function server(directory, overrides = {}) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), DICE_LOG_LEVEL: 'info',
      DICE_ACCOUNT_STORE: 'file', DICE_ACCOUNT_DIR: directory, DICE_ACCOUNT_ORIGIN: origin,
      ...overrides }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  proc.stdout.on('data', chunk => { logs += chunk; });
  proc.stderr.on('data', chunk => { logs += chunk; });
  const exited = new Promise(resolve => proc.once('exit', (code, signal) => resolve({ code, signal })));
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(origin + '/health', { signal: AbortSignal.timeout(250) })).ok) { ready = true; break; } }
    catch { /* process is still starting */ }
    await pause(20);
  }
  if (!ready) { proc.kill('SIGKILL'); throw new Error('fixture server did not start'); }
  return { origin, logs: () => logs,
    async stop() {
      if (proc.exitCode !== null || proc.signalCode !== null) return exited;
      proc.kill('SIGTERM');
      const timer = setTimeout(() => proc.kill('SIGKILL'), 2500);
      try { return await exited; } finally { clearTimeout(timer); }
    },
  };
}

function browser(origin, requestOrigin = origin) {
  let cookie = '';
  let csrf = null;
  return {
    cookie: () => cookie,
    csrf: () => csrf,
    async request(route, body, { headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
      const response = await fetch(origin + '/api/account/' + route, {
        method, headers: { ...(cookie ? { Cookie: cookie } : {}),
          ...(body === undefined ? {} : { Origin: requestOrigin, 'Content-Type': 'application/json', 'X-Dice-Account': '1',
            ...(csrf ? { 'X-Dice-CSRF': csrf } : {}) }), ...headers },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const value = await response.json();
      if (value.csrfToken) csrf = value.csrfToken;
      return { status: response.status, value, headers: response.headers };
    },
  };
}

test('private library survives a process restart and is recovered by a clean cookie jar', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-library-restart-'));
  const servers = [];
  t.after(async () => { for (const entry of servers) await entry.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const first = await server(dir); servers.push(first);
  const a = browser(first.origin);
  const recoveryKey = key();
  const registered = await a.request('register', { recoveryKey, displayName: 'Sam', recoveryAcknowledged: true });
  const personId = registered.value.person.id;
  const input = { operationId: crypto.randomUUID(), baseRevision: null, document: document('Private recovered wizard') };
  const saved = await a.request('library', input, { headers: { 'X-Dice-Person': personId } });
  assert.equal(saved.status, 200);
  assert.equal((await first.stop()).code, 0);
  const restarted = await server(dir); servers.push(restarted);
  const clean = browser(restarted.origin);
  assert.equal((await clean.request('library', undefined, { headers: { 'X-Dice-Person': personId } })).status, 401);
  assert.equal((await clean.request('recover', { recoveryKey })).value.person.id, personId);
  const loaded = await clean.request('library', undefined, { headers: { 'X-Dice-Person': personId } });
  assert.deepEqual(loaded.value.document, input.document);
  assert.equal(loaded.value.headRevision, saved.value.revision);
  assert.deepEqual((await clean.request('library', input, { headers: { 'X-Dice-Person': personId } })).value, saved.value);
  assert.equal(servers.some(entry => entry.logs().includes('Private recovered wizard')), false);
});

test('clean browsers recover one person after a real process restart; no library uploads or room authority', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-account-api-'));
  const servers = [];
  t.after(async () => { for (const entry of servers) await entry.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const first = await server(dir); servers.push(first);
  const a = browser(first.origin);
  const recoveryKey = key();
  const created = await a.request('register', { recoveryKey, displayName: 'PrivateAccountName', recoveryAcknowledged: true });
  assert.equal(created.status, 200);
  assert.equal(created.value.person.displayName, 'PrivateAccountName');
  assert.ok(created.headers.get('set-cookie').includes('HttpOnly'));
  assert.ok(created.headers.get('set-cookie').includes('SameSite=Lax'));
  assert.ok(created.headers.get('set-cookie').includes('Path=/'));
  assert.equal(Object.hasOwn(created.value, 'sessionToken'), false);
  assert.equal((await a.request('session')).value.person.id, created.value.person.id);
  const stranger = browser(first.origin);
  assert.deepEqual((await stranger.request('session')).value, { ok: true, person: null });
  assert.equal((await stranger.request('recover', { recoveryKey: key() })).status, 401);
  assert.equal((await stranger.request('session', undefined, { headers: { Origin: 'https://unrelated.example' } })).status, 403);
  assert.equal((await stranger.request('recover', { recoveryKey }, { headers: { Origin: 'null' } })).status, 403);
  assert.equal((await stranger.request('recover', { recoveryKey }, { headers: { 'X-Dice-Account': '' } })).status, 403);
  assert.equal((await stranger.request('recover', 'x'.repeat(9000))).status, 413);
  const raw = await fs.readFile(path.join(dir, 'state.json'), 'utf8');
  assert.equal(raw.includes(recoveryKey), false);
  assert.equal(raw.includes(a.cookie().split('=')[1]), false);
  assert.equal(Object.keys(JSON.parse(raw).records).some(name => name.startsWith('libraries/')), false);
  assert.equal((await first.stop()).code, 0);
  const restarted = await server(dir); servers.push(restarted);
  const clean = browser(restarted.origin);
  const recovered = await clean.request('recover', { recoveryKey });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.value.person.id, created.value.person.id);
  assert.equal(recovered.value.person.displayName, 'PrivateAccountName');
  const guestJoin = await fetch(restarted.origin + '/api/join', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: clean.cookie() },
    body: JSON.stringify({ room: 'account-proof-guest', name: 'Guest' }) });
  assert.equal(guestJoin.status, 200);
  const room = await guestJoin.json();
  assert.equal(JSON.stringify(room).includes(created.value.person.id), false);
  assert.equal(JSON.stringify(room).includes('PrivateAccountName'), false);
  assert.equal((await fetch(restarted.origin + '/service/account.js')).status, 404);
  for (const entry of servers) {
    assert.equal(entry.logs().includes(recoveryKey), false);
    assert.equal(entry.logs().includes('PrivateAccountName'), false);
    assert.equal(entry.logs().includes(created.value.person.id), false);
  }
});

test('origin/CSRF refusal, revocation, logout and key rotation preserve account boundaries', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-account-security-'));
  const app = await server(dir);
  t.after(async () => { await app.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const a = browser(app.origin);
  const b = browser(app.origin);
  const recoveryKey = key();
  const created = await a.request('register', { recoveryKey, displayName: 'Sam', recoveryAcknowledged: true });
  await b.request('recover', { recoveryKey });
  assert.equal((await a.request('revoke-others', {}, { headers: { 'X-Dice-CSRF': '' } })).status, 403);
  assert.equal((await a.request('revoke-others', {}, { headers: { 'X-Dice-CSRF': 'ø'.repeat(43) } })).status, 403);
  assert.equal((await b.request('session')).value.person.id, created.value.person.id);
  assert.equal((await a.request('revoke-others', {})).status, 200);
  assert.equal((await b.request('session')).value.person, null);
  assert.equal((await a.request('session')).value.person.id, created.value.person.id);
  const nextKey = key();
  assert.equal((await a.request('rotate-key', { currentRecoveryKey: key(), newRecoveryKey: nextKey, recoveryAcknowledged: true })).status, 401);
  const rotated = await a.request('rotate-key', { currentRecoveryKey: recoveryKey, newRecoveryKey: nextKey, recoveryAcknowledged: true });
  assert.equal(rotated.status, 200);
  assert.equal((await b.request('recover', { recoveryKey })).status, 401);
  assert.equal((await b.request('recover', { recoveryKey: nextKey })).value.person.id, created.value.person.id);
  const oldCookie = a.cookie();
  assert.equal((await a.request('logout', {})).status, 200);
  assert.equal((await a.request('session')).value.person, null);
  assert.equal((await a.request('session', undefined, { headers: { Cookie: oldCookie } })).value.person, null);
  assert.equal((await b.request('session')).value.person.id, created.value.person.id);
});

test('off, malformed configuration and unavailable storage keep explicit new guest tables available', async t => {
  const dirs = [];
  const servers = [];
  t.after(async () => { for (const app of servers) await app.stop(); for (const dir of dirs) await fs.rm(dir, { recursive: true, force: true }); });
  for (const mode of ['off', 'invalid-origin', 'corrupt']) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-account-unavailable-')); dirs.push(dir);
    if (mode === 'corrupt') await fs.writeFile(path.join(dir, 'state.json'), 'private damaged bytes');
    const app = await server(dir, mode === 'off' ? { DICE_ACCOUNT_STORE: 'off' }
      : mode === 'invalid-origin' ? { DICE_ACCOUNT_ORIGIN: 'http://untrusted.example' } : {});
    servers.push(app);
    const guest = browser(app.origin);
    const status = await guest.request('status');
    assert.equal(status.status, 200);
    assert.equal(status.value.available, false);
    assert.equal(status.value.enabled, mode !== 'off');
    assert.equal((await guest.request('register', { recoveryKey: key(), displayName: 'Sam', recoveryAcknowledged: true })).status, 503);
    const created = await fetch(app.origin + '/api/new-room', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New guest table' }) });
    assert.equal(created.status, 200);
    const room = (await created.json()).room;
    const join = await fetch(app.origin + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, name: 'Guest' }) });
    assert.equal(join.status, 200);
    const seat = await join.json();
    const roll = await fetch(app.origin + '/api/roll', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, playerId: seat.playerId, notation: '1d6' }) });
    assert.equal(roll.status, 200);
    assert.equal(app.logs().includes('private damaged bytes'), false);
  }
});

test('production cookies carry the host-only Secure prefix', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-account-cookie-'));
  const configuredOrigin = 'https://dice.example';
  const app = await server(dir, { DICE_ACCOUNT_ORIGIN: configuredOrigin });
  t.after(async () => { await app.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const jar = browser(app.origin, configuredOrigin);
  const response = await jar.request('register', { recoveryKey: key(), displayName: 'Sam', recoveryAcknowledged: true });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^__Host-dice-account=/);
  assert.match(cookie, /; Secure(?:;|$)/);
  assert.equal(cookie.includes('Domain='), false);
});

test('expired credentials recover into a new session while deliberate registration and quotas stay enforced', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-account-expiry-'));
  const store = await openFileStore({ directory: dir });
  t.after(async () => { await store.close(); await fs.rm(dir, { recursive: true, force: true }); });
  let time = Date.UTC(2026, 8, 13);
  const core = createAccountService({ store, now: () => time, sessionMs: 100, maxAccounts: 1 });
  const recoveryKey = key();
  assert.equal((await core.register({ recoveryKey, displayName: 'Sam' })).status, 400);
  const registered = await core.register({ recoveryKey, displayName: 'Sam', recoveryAcknowledged: true });
  assert.equal(registered.ok, true);
  assert.equal((await core.register({ recoveryKey: key(), displayName: 'Other', recoveryAcknowledged: true })).status, 429);
  assert.equal((await core.register({ recoveryKey, displayName: 'Other', recoveryAcknowledged: true })).status, 409);
  time += 101;
  assert.equal((await core.session(registered.sessionToken)).person, null);
  assert.equal((await core.logout(registered.sessionToken, registered.csrfToken)).status, 401);
  const recovered = await core.recover({ recoveryKey });
  assert.equal(recovered.person.id, registered.person.id);
  assert.notEqual(recovered.sessionToken, registered.sessionToken);
  assert.equal((await core.session(recovered.sessionToken)).person.id, registered.person.id);
  for (let i = 0; i < 11; i++) assert.equal((await core.recover({ recoveryKey })).ok, true);
  assert.equal((await core.recover({ recoveryKey })).code, 'session_limit');
  const rescued = await core.recover({ recoveryKey, revokeOtherSessions: true });
  assert.equal(rescued.person.id, registered.person.id);
  assert.equal((await core.session(recovered.sessionToken)).person, null);
});

test('cookie-changing requests serialize real Set-Cookie responses across competing recovery and logout', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-account-order-'));
  const app = await server(dir);
  t.after(async () => { await app.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const keyA = key();
  const keyB = key();
  const createdA = await browser(app.origin).request('register', { recoveryKey: keyA, displayName: 'A', recoveryAcknowledged: true });
  const createdB = await browser(app.origin).request('register', { recoveryKey: keyB, displayName: 'B', recoveryAcknowledged: true });
  let cookie = '';
  let gate;
  const hold = () => {
    let release, observed;
    const wait = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { observed = resolve; });
    gate = { wait, observed };
    return { release, started };
  };
  const actions = [];
  const transitions = [];
  const client = createAccountClient({ origin: app.origin, storage: null,
    onIdentityChange: change => transitions.push(change),
    fetch: async (url, options) => {
      const action = new URL(url).pathname.split('/').at(-1);
      const body = options.body ? JSON.parse(options.body) : null;
      actions.push(action);
      const response = await fetch(url, { ...options, headers: { ...options.headers,
        ...(cookie ? { Cookie: cookie } : {}), ...(options.method === 'POST' ? { Origin: app.origin } : {}) } });
      if (action === 'recover' && body.recoveryKey === keyA && gate) {
        const held = gate; gate = null;
        held.observed();
        await held.wait;
      }
      // Real response cookies enter the jar when the response is delivered,
      // exactly the side effect an epoch check alone cannot undo.
      const replacement = response.headers.get('set-cookie');
      if (replacement) cookie = replacement.split(';')[0];
      return response;
    },
  });
  const firstGate = hold();
  const recoveringA = client.recover(keyA);
  await firstGate.started;
  const recoveringB = client.recover(keyB);
  await new Promise(setImmediate);
  assert.deepEqual(actions, ['recover']);
  firstGate.release();
  assert.equal((await recoveringA).code, 'request_superseded');
  assert.equal((await recoveringB).person.id, createdB.value.person.id);
  assert.equal((await client.session()).person.id, createdB.value.person.id);
  assert.equal(transitions.some(change => change.personId === createdA.value.person.id), false);

  const secondGate = hold();
  const laterA = client.recover(keyA);
  await secondGate.started;
  const priorActionCount = actions.length;
  const signingOut = client.logout();
  await new Promise(setImmediate);
  assert.equal(actions.length, priorActionCount, 'logout waits for the earlier cookie response');
  secondGate.release();
  assert.equal((await laterA).code, 'request_superseded');
  assert.equal((await signingOut).ok, true);
  assert.equal((await client.session()).person, null);
  assert.equal(transitions.some(change => change.personId === createdA.value.person.id), false);
});
