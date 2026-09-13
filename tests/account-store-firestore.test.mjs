/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { openFirestoreStore, metadataTokenSupplier } from '../service/store-firestore.js';
import { StoreError } from '../service/store.js';

const hasCode = code => error => error instanceof StoreError && error.code === code;
const respond = (body, status = 200) => new Response(JSON.stringify(body), { status });
const root = 'projects/test-project/databases/(default)/documents';
const prefix = `${root}/diceAccounts/test/`;
const document = (key, value) => ({ name: prefix + key, fields: {
  schema: { integerValue: '1' }, data: { stringValue: JSON.stringify(value) },
} });

// A protocol fixture, not a substitute for staging IAM/Firestore proof. It
// makes missing transaction tokens or non-atomic commits fail the tests.
function fixture() {
  let documents = new Map();
  const versions = new Map();
  const transactions = new Map();
  const calls = [];
  let serial = 0;
  let aborts = 0;
  let beforeCommit = null;
  const readSets = [];
  function seed(key, value) {
    const name = prefix + key;
    documents.set(name, document(key, value));
    versions.set(name, (versions.get(name) || 0) + 1);
  }
  return {
    calls, readSets, seed,
    abort(count = 1) { aborts = count; },
    beforeCommit(callback) { beforeCommit = callback; },
    value(key) { const rec = documents.get(prefix + key); return rec ? JSON.parse(rec.fields.data.stringValue) : null; },
    async fetch(url, options) {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://firestore.googleapis.com');
      assert.equal(options.headers.Authorization, 'Bearer fixture-token');
      assert.ok(options.signal instanceof AbortSignal);
      const resource = parsed.pathname.slice('/v1/'.length);
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ resource, method: options.method, body, transaction: parsed.searchParams.get('transaction') });
      if (resource === root + ':beginTransaction') {
        assert.deepEqual(body.options, { readWrite: {} });
        const token = Buffer.from(`transaction-${++serial}`).toString('base64');
        transactions.set(token, { documents: structuredClone(documents), versions: new Map(versions), reads: new Set() });
        return respond({ transaction: token });
      }
      if (options.method === 'GET') {
        assert.ok(resource.startsWith(prefix));
        const token = parsed.searchParams.get('transaction');
        const tx = token ? transactions.get(token) : null;
        if (token) assert.ok(tx, 'document GET carries a live transaction');
        tx?.reads.add(resource);
        const found = (tx?.documents || documents).get(resource);
        return found ? respond(found) : respond({ error: { status: 'NOT_FOUND' } }, 404);
      }
      if (resource === root + ':rollback') {
        assert.ok(transactions.has(body.transaction));
        transactions.delete(body.transaction);
        return respond({});
      }
      if (resource === root + ':commit') {
        const tx = transactions.get(body.transaction);
        assert.ok(tx, 'commit uses the read transaction');
        readSets.push([...tx.reads]);
        if (beforeCommit) { const hook = beforeCommit; beforeCommit = null; hook(); }
        const changed = [...tx.reads].some(key => tx.versions.get(key) !== versions.get(key));
        if (changed || aborts-- > 0) return respond({ error: { status: 'ABORTED', message: 'private backend detail' } }, 409);
        const next = new Map(documents);
        for (const write of body.writes) {
          assert.equal(Object.keys(write).length, 1);
          assert.ok(write.update || write.delete, 'only documented REST write shapes');
          if (write.update) next.set(write.update.name, structuredClone(write.update));
          else next.delete(write.delete);
        }
        documents = next;
        for (const write of body.writes) {
          const key = write.update?.name || write.delete;
          versions.set(key, (versions.get(key) || 0) + 1);
        }
        transactions.delete(body.transaction);
        return respond({ writeResults: body.writes.map(() => ({ updateTime: '2026-09-13T12:00:00Z' })), commitTime: '2026-09-13T12:00:00Z' });
      }
      assert.fail('undocumented protocol operation');
    },
  };
}

function storeFor(remote, options = {}) {
  return openFirestoreStore({ project: 'test-project', namespace: 'test',
    tokenSupplier: async () => 'fixture-token', fetch: remote.fetch,
    retryDelay: async () => {}, ...options });
}

test('Firestore transaction binds every read and atomic write to the same token', async t => {
  const remote = fixture();
  remote.seed('people/a', { count: 1, name: 'Zoë 🎲', choices: [false, null, 2.5] });
  const store = storeFor(remote);
  t.after(() => store.close());
  const original = await store.get('people/a');
  assert.deepEqual(original, { count: 1, name: 'Zoë 🎲', choices: [false, null, 2.5] });
  assert.equal(await store.get('people/missing'), null);
  await store.transact(async tx => {
    const person = await tx.get('people/a');
    assert.equal(await tx.get('homes/a'), null);
    person.count++;
    tx.put('people/a', person);
    tx.put('homes/a', { label: 'Copper Lantern' });
  });
  assert.equal(remote.value('people/a').count, 2);
  assert.deepEqual(remote.value('homes/a'), { label: 'Copper Lantern' });
  assert.deepEqual(remote.readSets[0], [prefix + 'people/a', prefix + 'homes/a']);
  const writes = remote.calls.filter(call => call.resource.endsWith(':commit'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.writes.length, 2);
  await store.transact(async tx => { await tx.get('homes/a'); tx.delete('homes/a'); });
  assert.equal(remote.value('homes/a'), null);
});

test('a changed read-only authorization dependency aborts and reruns before writing', async t => {
  const remote = fixture();
  remote.seed('sessions/a', { allowed: true });
  remote.seed('libraries/a', { revision: 1 });
  remote.beforeCommit(() => remote.seed('sessions/a', { allowed: false }));
  const store = storeFor(remote);
  t.after(() => store.close());
  let calls = 0;
  const result = await store.transact(async tx => {
    calls++;
    const session = await tx.get('sessions/a');
    const library = await tx.get('libraries/a');
    if (!session.allowed) return { denied: true };
    tx.put('libraries/a', { revision: library.revision + 1 });
    return { denied: false };
  });
  assert.deepEqual(result, { denied: true });
  assert.equal(calls, 2);
  assert.deepEqual(remote.value('libraries/a'), { revision: 1 });
  assert.equal(remote.calls.filter(call => call.resource.endsWith(':rollback')).length, 2);
});

test('missing-document creation is a tracked dependency and causes a fresh retry', async t => {
  const remote = fixture();
  remote.beforeCommit(() => remote.seed('roomHomes/a', { homeId: 'already-created' }));
  const store = storeFor(remote);
  t.after(() => store.close());
  let calls = 0;
  const result = await store.transact(async tx => {
    calls++;
    const mapping = await tx.get('roomHomes/a');
    if (mapping) return mapping.homeId;
    tx.put('roomHomes/a', { homeId: 'candidate' });
    return 'candidate';
  });
  assert.equal(result, 'already-created');
  assert.equal(calls, 2);
  assert.deepEqual(remote.value('roomHomes/a'), { homeId: 'already-created' });
});

test('callback failure and illegal read-after-write roll back without partial mutation', async t => {
  const remote = fixture();
  const store = storeFor(remote);
  t.after(() => store.close());
  await assert.rejects(store.transact(async tx => {
    await tx.get('people/a');
    tx.put('people/a', { private: true });
    throw new Error('credential=do-not-report');
  }), error => error.code === 'unavailable' && !error.message.includes('do-not-report'));
  await assert.rejects(store.transact(async tx => {
    tx.put('people/a', { count: 1 });
    await tx.get('people/a');
  }), hasCode('invalid'));
  assert.equal(remote.value('people/a'), null);
  assert.equal(remote.calls.filter(call => call.resource.endsWith(':commit')).length, 0);
  assert.equal(remote.calls.filter(call => call.resource.endsWith(':rollback')).length, 2);
});

test('contention retries are bounded and expose no provider body', async t => {
  const remote = fixture();
  remote.abort(10);
  const store = storeFor(remote, { maxAttempts: 2 });
  t.after(() => store.close());
  await assert.rejects(store.transact(async tx => { tx.put('people/a', { count: 1 }); }),
    error => error.code === 'busy' && !error.message.includes('private'));
  assert.equal(remote.calls.filter(call => call.resource.endsWith(':beginTransaction')).length, 2);
  assert.equal(remote.value('people/a'), null);
});

test('lost commit response reports uncertainty without replaying the callback', async t => {
  const remote = fixture();
  const fetcher = async (url, options) => {
    const response = await remote.fetch(url, options);
    if (url.endsWith(':commit')) throw new Error('request headers Bearer secret');
    return response;
  };
  const store = storeFor(remote, { fetch: fetcher });
  t.after(() => store.close());
  let calls = 0;
  await assert.rejects(store.transact(async tx => {
    calls++;
    tx.put('people/a', { count: 1 });
  }), error => error.code === 'uncertain' && !error.message.includes('secret'));
  assert.equal(calls, 1);
  assert.deepEqual(remote.value('people/a'), { count: 1 });
  assert.equal(remote.calls.filter(call => call.resource.endsWith(':rollback')).length, 0);
});

test('fetch, token acquisition, response body and commit timeouts are bounded', async t => {
  const never = () => new Promise(() => {});
  for (const options of [{ fetch: never }, { tokenSupplier: never },
    { fetch: async () => ({ ok: true, status: 200, text: never }) }]) {
    const store = storeFor(fixture(), { timeoutMs: 15, ...options });
    t.after(() => store.close());
    const at = performance.now();
    await assert.rejects(store.get('people/a'), hasCode('timeout'));
    assert.ok(performance.now() - at < 500);
  }
  const remote = fixture();
  const store = storeFor(remote, { timeoutMs: 15, fetch: (url, options) =>
    url.endsWith(':commit') ? never() : remote.fetch(url, options) });
  t.after(() => store.close());
  await assert.rejects(store.transact(async tx => { tx.put('people/a', { count: 1 }); }), hasCode('uncertain'));
  assert.equal(remote.calls.filter(call => call.resource.endsWith(':beginTransaction')).length, 1);
});

test('bad remote state and denied requests fail closed without raw error disclosure', async t => {
  for (const [response, expected] of [
    [respond({ fields: { schema: { integerValue: '2' }, data: { stringValue: '{}' } } }), 'corrupt'],
    [new Response('internal auth credential', { status: 200 }), 'corrupt'],
    [respond({ error: { status: 'PERMISSION_DENIED', message: 'sensitive account reference' } }, 403), 'unavailable'],
  ]) {
    const store = storeFor(fixture(), { fetch: async () => response });
    t.after(() => store.close());
    await assert.rejects(store.get('people/a'), error => error.code === expected
      && !/credential|sensitive|reference/.test(error.message));
  }
});

test('metadata supplier caches, refreshes, shares inflight requests and uses the fixed endpoint', async () => {
  let time = 1000;
  let requests = 0;
  const supplier = metadataTokenSupplier({ now: () => time, fetch: async (url, options) => {
    assert.equal(url, 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token');
    assert.deepEqual(options.headers, { 'Metadata-Flavor': 'Google' });
    requests++;
    await Promise.resolve();
    return new Response(JSON.stringify({ access_token: `fixture-${requests}`, expires_in: 3600 }),
      { headers: { 'Metadata-Flavor': 'Google' } });
  } });
  assert.deepEqual(await Promise.all([supplier(), supplier()]), ['fixture-1', 'fixture-1']);
  assert.equal(await supplier(), 'fixture-1');
  assert.equal(requests, 1);
  time += 3550000;
  assert.equal(await supplier(), 'fixture-2');
  assert.equal(requests, 2);
  const invalid = metadataTokenSupplier({ fetch: async () => respond({ access_token: 'fixture', expires_in: 3600 }) });
  await assert.rejects(invalid(), hasCode('unavailable'));
  const slow = metadataTokenSupplier({ timeoutMs: 15, fetch: () => new Promise(() => {}) });
  await assert.rejects(slow(), hasCode('timeout'));
});

test('invalid paths/configuration and oversized transactions never send a commit', async t => {
  assert.throws(() => storeFor(fixture(), { project: '../private' }), hasCode('invalid'));
  assert.throws(() => storeFor(fixture(), { namespace: 'a/b' }), hasCode('invalid'));
  const remote = fixture();
  const store = storeFor(remote);
  t.after(() => store.close());
  await assert.rejects(store.get('people/a?credential=secret'), hasCode('invalid'));
  assert.equal(remote.calls.length, 0);
  await assert.rejects(store.transact(async tx => {
    for (let i = 0; i < 20; i++) tx.put(`libraries/v${i}`, { data: 'x'.repeat(500000) });
  }), hasCode('limit'));
  assert.equal(remote.calls.filter(call => call.resource.endsWith(':commit')).length, 0);
  await store.close();
  await assert.rejects(store.get('people/a'), hasCode('closed'));
});
