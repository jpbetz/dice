/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient, generateRecoveryKey } from '../js/account.js';
import { validRecoveryKey } from '../service/account.js';

const respond = (body, status = 200) => new Response(JSON.stringify(body), { status });
const origin = 'https://dice.example';
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('recovery key uses Web Crypto and is accepted without a weak fallback', () => {
  const a = generateRecoveryKey();
  const b = generateRecoveryKey();
  assert.equal(validRecoveryKey(a), true);
  assert.equal(validRecoveryKey(b), true);
  assert.notEqual(a, b);
  assert.throws(() => generateRecoveryKey({}), /Secure key generation/);
});

test('recoverable account transport never persists keys or publishes profiles and awaits namespace reset', async () => {
  const recoveryKey = generateRecoveryKey();
  const storage = memoryStorage();
  const transitions = [];
  const calls = [];
  let resetDone = false;
  const client = createAccountClient({ origin, storage,
    onIdentityChange: async transition => {
      transitions.push(transition);
      await Promise.resolve();
      resetDone = true;
    },
    fetch: async (url, options) => {
      calls.push({ path: new URL(url).pathname, options });
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.headers['X-Dice-Account'], '1');
      assert.equal(JSON.parse(options.body).recoveryKey, recoveryKey);
      return respond({ ok: true, person: { id: 'p_first', displayName: 'Sam' }, csrfToken: 'fixture-csrf' });
    },
  });
  const result = await client.recover(recoveryKey);
  assert.equal(result.person.id, 'p_first');
  assert.equal(resetDone, true);
  assert.deepEqual(transitions, [{ previousPersonId: null, personId: 'p_first' }]);
  assert.deepEqual([...storage.values], []);
  assert.deepEqual(calls.map(call => call.path), ['/api/account/recover']);
});

test('offline sign-out freezes the namespace and retries revocation before restoring any account on reload', async () => {
  const storage = memoryStorage();
  const transitions = [];
  let offline = false;
  let signedIn = true;
  const calls = [];
  const fetcher = async (url, options) => {
    const action = new URL(url).pathname.split('/').at(-1);
    calls.push(action);
    if (offline) throw new Error('network unavailable');
    if (action === 'session') return respond({ ok: true, person: signedIn ? { id: 'p_first' } : null, csrfToken: 'fixture-csrf' });
    if (action === 'logout') {
      assert.equal(options.headers['X-Dice-CSRF'], 'fixture-csrf');
      signedIn = false;
      return respond({ ok: true, person: null });
    }
    assert.fail('unexpected account action');
  };
  const first = createAccountClient({ origin, storage, fetch: fetcher, onIdentityChange: value => transitions.push(value) });
  await first.session();
  offline = true;
  const failed = await first.logout();
  assert.equal(failed.signedOutLocally, true);
  assert.deepEqual(transitions.at(-1), { previousPersonId: 'p_first', personId: null });
  assert.equal([...storage.values.values()].includes('1'), true);
  offline = false;
  const reloadedTransitions = [];
  const second = createAccountClient({ origin, storage, fetch: fetcher, onIdentityChange: value => reloadedTransitions.push(value) });
  const checked = await second.session();
  assert.equal(checked.person, null);
  assert.deepEqual(reloadedTransitions, []);
  assert.equal(signedIn, false);
  assert.deepEqual(calls.slice(-2), ['session', 'logout']);
});

test('an old session response cannot restore identity after a newer sign-out', async () => {
  const storage = memoryStorage();
  let finishSession;
  const response = new Promise(resolve => { finishSession = resolve; });
  const transitions = [];
  const client = createAccountClient({ origin, storage,
    onIdentityChange: value => transitions.push(value),
    fetch: async url => new URL(url).pathname.endsWith('/session') ? response
      : respond({ ok: false, code: 'login_required' }, 401),
  });
  const pending = client.session();
  await Promise.resolve();
  const signingOut = client.logout();
  finishSession(respond({ ok: true, person: { id: 'p_old' }, csrfToken: 'fixture-csrf' }));
  await signingOut;
  assert.equal((await pending).code, 'request_superseded');
  assert.deepEqual(transitions, []);
});

test('a refused namespace reset retains the previous identity and exposes no adopted person', async () => {
  const transitions = [];
  let login = 0;
  const client = createAccountClient({ origin, storage: memoryStorage(),
    onIdentityChange: change => { transitions.push(change); return change.personId !== 'p_second'; },
    fetch: async () => respond({ ok: true, person: { id: ++login === 1 ? 'p_first' : 'p_second' }, csrfToken: 'fixture-csrf' }),
  });
  assert.equal((await client.recover(generateRecoveryKey())).person.id, 'p_first');
  const refused = await client.recover(generateRecoveryKey());
  assert.equal(refused.code, 'identity_transition_refused');
  assert.equal(Object.hasOwn(refused, 'person'), false);
  assert.deepEqual(transitions.at(-1), { previousPersonId: 'p_first', personId: 'p_second' });
  await client.session();
  assert.deepEqual(transitions.at(-1), { previousPersonId: 'p_first', personId: 'p_second' });
});

test('static-host 404 and a configured outage are distinct and do not register or poll', async () => {
  let requests = 0;
  const absent = createAccountClient({ origin, fetch: async () => { requests++; return new Response('', { status: 404 }); } });
  assert.equal((await absent.status()).code, 'not_available');
  assert.equal(requests, 1);
  const outage = createAccountClient({ origin, fetch: async () => { throw new Error('private connection detail'); } });
  const result = await outage.status();
  assert.equal(result.code, 'account_unavailable');
  assert.equal(result.message.includes('private'), false);
});
