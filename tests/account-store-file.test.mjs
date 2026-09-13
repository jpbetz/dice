/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openFileStore } from '../service/store-file.js';
import { jsonCopy, validPath, StoreError } from '../service/store.js';

const worker = fileURLToPath(new URL('./fixtures/account-store-worker.mjs', import.meta.url));
const hasCode = code => error => error instanceof StoreError && error.code === code;
async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-account-store-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function opened(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-account-store-'));
  const store = await openFileStore({ directory: dir, ...options });
  t.after(async () => { await store.close(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, store };
}
function child(dir, action) {
  const process = fork(worker, [dir, action], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const exit = new Promise(resolve => process.once('exit', (code, signal) => resolve({ code, signal })));
  let logs = '';
  process.stdout.on('data', chunk => { logs += chunk; });
  process.stderr.on('data', chunk => { logs += chunk; });
  const message = new Promise((resolve, reject) => {
    process.once('message', resolve);
    process.once('error', reject);
    process.once('exit', () => reject(new Error('worker exited before message')));
  });
  return { process, exit, message, logs: () => logs };
}

test('strict JSON records and paths preserve values without hidden coercion', () => {
  const value = { schema: 1, name: 'Zoë 🎲', arr: [null, false, 4.5], nested: { count: 3 } };
  const copy = jsonCopy(value);
  assert.deepEqual(copy, value);
  copy.nested.count = 7;
  assert.equal(value.nested.count, 3);
  for (const key of ['../people/one', 'people', '/people/one', 'people/a/b', 'people/a?x=secret', 'people/__reserved__']) {
    assert.throws(() => validPath(key), hasCode('invalid'));
  }
  for (const invalid of [null, [], { x: undefined }, { x: NaN }, { x: new Date() }, { x: new Array(2) },
    JSON.parse('{"__proto__":{"secret":1}}')]) {
    assert.throws(() => jsonCopy(invalid), hasCode('invalid'));
  }
});

test('transactions persist together, isolate returned objects and serialize competing writers', async t => {
  const { dir, store } = await opened(t);
  await store.transact(async tx => {
    assert.equal(await tx.get('people/a'), null);
    tx.put('people/a', { count: 0 });
    tx.put('homes/a', { label: 'Copper Lantern' });
  });
  await Promise.all(Array.from({ length: 12 }, () => store.transact(async tx => {
    const value = await tx.get('people/a');
    await Promise.resolve();
    tx.put('people/a', { count: value.count + 1 });
  })));
  const read = await store.get('people/a');
  assert.equal(read.count, 12);
  read.count = 100;
  assert.equal((await store.get('people/a')).count, 12);
  assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
  for (const name of ['state.json', 'previous.json', 'writer.lock']) {
    assert.equal((await fs.stat(path.join(dir, name))).mode & 0o777, 0o600);
  }
  await store.close();
  const reopened = await openFileStore({ directory: dir });
  assert.deepEqual(await reopened.get('people/a'), { count: 12 });
  assert.deepEqual(await reopened.get('homes/a'), { label: 'Copper Lantern' });
  await reopened.close();
});

test('callback abort, read-after-write and leaked transaction cannot commit partial changes', async t => {
  const { store } = await opened(t);
  let leaked;
  await assert.rejects(store.transact(async tx => {
    leaked = tx;
    tx.put('people/a', { secret: 'must-not-leak' });
    throw new Error('credential=must-not-leak');
  }), error => error.code === 'unavailable' && !error.message.includes('must-not-leak'));
  assert.equal(await store.get('people/a'), null);
  assert.throws(() => leaked.put('people/b', { count: 1 }), hasCode('closed'));
  await assert.rejects(store.transact(async tx => {
    tx.put('people/a', { count: 1 });
    await tx.get('people/b');
  }), hasCode('invalid'));
  assert.equal(await store.get('people/a'), null);
});

test('separate processes recover the committed person and home without a repushing client', async t => {
  const dir = await directory(t);
  const first = child(dir, 'write');
  assert.deepEqual(await first.message, { ok: true });
  assert.equal((await first.exit).code, 0);
  const second = child(dir, 'read');
  assert.deepEqual(await second.message, { ok: true });
  assert.equal((await second.exit).code, 0);
  assert.equal(first.logs() + second.logs(), '');
});

test('live lock refuses another writer; killed process recovers only explicitly', async t => {
  const dir = await directory(t);
  const holder = child(dir, 'hold');
  t.after(() => holder.process.kill('SIGKILL'));
  assert.deepEqual(await holder.message, { ready: true });
  await assert.rejects(openFileStore({ directory: dir }), hasCode('locked'));
  await assert.rejects(openFileStore({ directory: dir, recoverStaleLock: true }), hasCode('locked'));
  holder.process.kill('SIGKILL');
  assert.equal((await holder.exit).signal, 'SIGKILL');
  await assert.rejects(openFileStore({ directory: dir }), hasCode('locked'));
  const recovery = child(dir, 'recover');
  assert.deepEqual(await recovery.message, { ok: true });
  assert.equal((await recovery.exit).code, 0);
  assert.equal(holder.logs() + recovery.logs(), '');
});

test('failed rename preserves both records and permits a later confirmed retry', async t => {
  let fail = false;
  const io = { ...fs, async rename(from, to) {
    if (fail && to.endsWith('/state.json')) throw new Error('private filesystem detail');
    return fs.rename(from, to);
  } };
  const { dir, store } = await opened(t, { io });
  await store.transact(async tx => { tx.put('people/a', { count: 1 }); tx.put('homes/a', { count: 1 }); });
  const before = await fs.readFile(path.join(dir, 'state.json'));
  fail = true;
  await assert.rejects(store.transact(async tx => {
    tx.put('people/a', { count: 2 }); tx.put('homes/a', { count: 2 });
  }), error => error.code === 'unavailable' && !error.message.includes('private'));
  assert.deepEqual(await fs.readFile(path.join(dir, 'state.json')), before);
  assert.deepEqual(await store.get('people/a'), { count: 1 });
  assert.deepEqual(await store.get('homes/a'), { count: 1 });
  fail = false;
  await store.transact(async tx => { tx.put('people/a', { count: 2 }); });
  assert.deepEqual(await store.get('people/a'), { count: 2 });
});

test('killing a process between temporary-file flush and rename cannot partially replace a transaction', async t => {
  const dir = await directory(t);
  const seed = child(dir, 'write');
  assert.deepEqual(await seed.message, { ok: true });
  await seed.exit;
  const writer = child(dir, 'crash-before-rename');
  t.after(() => writer.process.kill('SIGKILL'));
  assert.deepEqual(await writer.message, { ready: true });
  writer.process.kill('SIGKILL');
  await writer.exit;
  const recovery = child(dir, 'recover');
  assert.deepEqual(await recovery.message, { ok: true });
  assert.equal((await recovery.exit).code, 0);
  assert.equal((await fs.readdir(dir)).some(name => /^pending-/.test(name)), false);
});

test('post-rename directory flush failure reports uncertainty and requires reopening', async t => {
  let fail = false;
  const io = { ...fs, async open(filename, ...args) {
    const handle = await fs.open(filename, ...args);
    if (fail && args[0] === 'r') return { close: () => handle.close(), async sync() { throw new Error('flush failed'); } };
    return handle;
  } };
  const { dir, store } = await opened(t, { io });
  await store.transact(async tx => { tx.put('people/a', { count: 1 }); });
  fail = true;
  await assert.rejects(store.transact(async tx => { tx.put('people/a', { count: 2 }); }), hasCode('uncertain'));
  await assert.rejects(store.get('people/a'), hasCode('uncertain'));
  await assert.rejects(store.transact(async () => {}), hasCode('uncertain'));
  await store.close();
  const restored = await openFileStore({ directory: dir });
  assert.deepEqual(await restored.get('people/a'), { count: 2 });
  await restored.close();
});

test('malformed and future state refuse without replacing bytes or restoring an older backup', async t => {
  for (const data of ['{unfinished', '{"schema":2,"generation":0,"records":{}}',
    '{"schema":1,"generation":1,"records":{"people/a":{"version":9,"value":{}}}}']) {
    const dir = await directory(t);
    await fs.writeFile(path.join(dir, 'state.json'), data);
    await fs.writeFile(path.join(dir, 'previous.json'), '{"schema":1,"generation":0,"records":{}}');
    await assert.rejects(openFileStore({ directory: dir }), hasCode('corrupt'));
    assert.equal(await fs.readFile(path.join(dir, 'state.json'), 'utf8'), data);
    await assert.rejects(fs.stat(path.join(dir, 'writer.lock')), error => error.code === 'ENOENT');
  }
});

test('bounds and private location checks fail before taking or replacing data', async t => {
  const { dir, store } = await opened(t, { maxRecords: 1, maxBytes: 400 });
  await store.transact(async tx => { tx.put('people/a', { count: 1 }); });
  await assert.rejects(store.transact(async tx => { tx.put('people/b', { count: 2 }); }), hasCode('limit'));
  await assert.rejects(store.transact(async tx => { tx.put('people/a', { text: 'x'.repeat(1000) }); }), hasCode('limit'));
  assert.deepEqual(await store.get('people/a'), { count: 1 });
  await assert.rejects(openFileStore({ directory: dir, cloudRun: true }), hasCode('invalid'));
  await assert.rejects(openFileStore({ directory: process.cwd() }), hasCode('invalid'));
  const elsewhere = await directory(t);
  const link = path.join(elsewhere, 'link');
  await fs.symlink(dir, link);
  await assert.rejects(openFileStore({ directory: link }), hasCode('invalid'));
});

test('local transaction byte budget matches the portable REST encoding budget', async t => {
  const { store } = await opened(t);
  await assert.rejects(store.transact(async tx => {
    for (let i = 0; i < 20; i++) tx.put(`libraries/v${i}`, { data: 'x'.repeat(500000) });
  }), hasCode('limit'));
  assert.equal(await store.get('libraries/v0'), null);
});

test('close waits for accepted transactions and refuses new work', async t => {
  const { dir, store } = await opened(t);
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const writing = store.transact(async tx => { await wait; tx.put('people/a', { count: 1 }); });
  const closing = store.close();
  await assert.rejects(store.get('people/a'), hasCode('closed'));
  await assert.rejects(store.transact(async () => {}), hasCode('closed'));
  release();
  await Promise.all([writing, closing, store.close()]);
  const reopened = await openFileStore({ directory: dir });
  assert.deepEqual(await reopened.get('people/a'), { count: 1 });
  await reopened.close();
});
