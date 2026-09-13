/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { STORE_SCHEMA, StoreError, storageError, validPath, jsonCopy, transactionView } from './store.js';

const CHECKOUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
const exists = async (io, filename) => {
  try { await io.lstat(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};

async function writePrivate(io, filename, bytes) {
  const file = await io.open(filename, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); }
  catch (error) { await io.unlink(filename).catch(() => {}); throw error; }
  finally { await file.close(); }
}

async function acquireLock(io, directory, recoverStaleLock) {
  const filename = path.join(directory, 'writer.lock');
  const recovery = path.join(directory, 'recovery.lock');
  const owner = { schema: 1, pid: process.pid, host: os.hostname(), token: crypto.randomBytes(24).toString('hex') };
  if (await exists(io, recovery)) throw new StoreError('locked');
  try { await writePrivate(io, filename, JSON.stringify(owner)); }
  catch (error) {
    if (error.code !== 'EEXIST') throw storageError(error);
    if (!recoverStaleLock) throw new StoreError('locked');
    // Explicit recovery is serialized separately. A contender checks this
    // guard both before and after acquiring a new writer lock.
    let guard;
    try { guard = await io.open(recovery, 'wx', 0o600); }
    catch { throw new StoreError('locked'); }
    try {
      let previous;
      try { previous = JSON.parse(await io.readFile(filename, 'utf8')); }
      catch { throw new StoreError('locked'); }
      if (previous.host !== os.hostname() || !Number.isInteger(previous.pid) || previous.pid <= 0) {
        throw new StoreError('locked');
      }
      try { process.kill(previous.pid, 0); throw new StoreError('locked'); }
      catch (probe) { if (probe.code !== 'ESRCH') throw new StoreError('locked'); }
      await io.unlink(filename);
      await writePrivate(io, filename, JSON.stringify(owner));
    } finally {
      await guard.close();
      await io.unlink(recovery);
    }
  }
  if (await exists(io, recovery)) {
    await io.unlink(filename);
    throw new StoreError('locked');
  }
  return async () => {
    const current = JSON.parse(await io.readFile(filename, 'utf8'));
    if (current.token !== owner.token) throw new StoreError('locked');
    await io.unlink(filename);
  };
}

function decodeSnapshot(bytes, maxBytes, maxRecords) {
  if (Buffer.byteLength(bytes) > maxBytes) throw new StoreError('limit');
  let snapshot;
  try { snapshot = JSON.parse(bytes); } catch { throw new StoreError('corrupt'); }
  if (!snapshot || snapshot.schema !== STORE_SCHEMA || !Number.isSafeInteger(snapshot.generation)
      || snapshot.generation < 0 || !snapshot.records || Array.isArray(snapshot.records)
      || typeof snapshot.records !== 'object') throw new StoreError('corrupt');
  const entries = Object.entries(snapshot.records);
  if (entries.length > maxRecords) throw new StoreError('limit');
  for (const [key, value] of entries) {
    try {
      validPath(key);
      if (!value || !Number.isSafeInteger(value.version) || value.version < 1
          || value.version > snapshot.generation) throw new StoreError('corrupt');
      jsonCopy(value.value, { code: 'corrupt' });
    } catch (error) { throw storageError(error, 'corrupt').code === 'limit' ? error : new StoreError('corrupt'); }
  }
  return snapshot;
}

/** Private local disk only. Call close() before another process opens it.
 * recoverStaleLock explicitly permits recovery when the recorded PID is dead.
 * An ambiguous/malformed lock needs operator inspection; never guess it away.
 * io is injectable solely to prove failed filesystem operations in Node tests.
 */
export async function openFileStore({ directory, forbiddenRoots = [CHECKOUT],
  maxBytes = 32 * 1024 * 1024, maxRecords = 10000,
  recoverStaleLock = false, io = fs, cloudRun = Boolean(process.env.K_SERVICE) } = {}) {
  if (cloudRun || typeof directory !== 'string' || !path.isAbsolute(directory)
      || !Number.isSafeInteger(maxBytes) || maxBytes < 128
      || !Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new StoreError('invalid');
  let release;
  try {
    const resolved = path.resolve(directory);
    for (const root of forbiddenRoots) {
      const realRoot = await io.realpath(root);
      if (inside(resolved, path.resolve(root)) || inside(resolved, realRoot)) throw new StoreError('invalid');
    }
    await io.mkdir(resolved, { recursive: true, mode: 0o700 });
    const real = await io.realpath(resolved);
    if (real !== resolved) throw new StoreError('invalid');
    for (const root of forbiddenRoots) {
      if (inside(real, await io.realpath(root))) throw new StoreError('invalid');
    }
    await io.chmod(real, 0o700);
    release = await acquireLock(io, real, recoverStaleLock);
    const filename = path.join(real, 'state.json');
    const backup = path.join(real, 'previous.json');
    for (const file of [filename, backup]) {
      if (await exists(io, file)) {
        const stat = await io.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new StoreError('invalid');
        await io.chmod(file, 0o600);
      }
    }
    let persisted = await exists(io, filename);
    if (!persisted && await exists(io, backup)) throw new StoreError('corrupt');
    let state = persisted
      ? decodeSnapshot(await io.readFile(filename, 'utf8'), maxBytes, maxRecords)
      : { schema: STORE_SCHEMA, generation: 0, records: {} };
    let queue = Promise.resolve();
    let closing = false;
    let closeTask = null;
    let uncertain = false;
    const ready = () => {
      if (closing) throw new StoreError('closed');
      if (uncertain) throw new StoreError('uncertain');
    };
    const syncDirectory = async () => {
      const dir = await io.open(real, 'r');
      try { await dir.sync(); } finally { await dir.close(); }
    };
    return Object.freeze({
      async get(key) {
        ready(); validPath(key);
        await queue; ready();
        return Object.hasOwn(state.records, key) ? jsonCopy(state.records[key].value) : null;
      },
      transact(callback) {
        try { ready(); if (typeof callback !== 'function') throw new StoreError('invalid'); }
        catch (error) { return Promise.reject(error); }
        const task = queue.then(async () => {
          if (uncertain) throw new StoreError('uncertain');
          const view = transactionView(async key => Object.hasOwn(state.records, key) ? state.records[key].value : null);
          let result;
          try { result = await callback(view.api); }
          catch (error) { throw storageError(error); }
          finally { view.finish(); }
          if (!view.writes.size) return result;
          if (state.generation >= Number.MAX_SAFE_INTEGER) throw new StoreError('limit');
          const next = { schema: STORE_SCHEMA, generation: state.generation + 1, records: { ...state.records } };
          for (const [key, value] of view.writes) {
            if (value === null) delete next.records[key];
            else next.records[key] = { version: next.generation, value };
          }
          const bytes = JSON.stringify(next);
          if (Buffer.byteLength(bytes) > maxBytes || Object.keys(next.records).length > maxRecords) {
            throw new StoreError('limit');
          }
          const suffix = crypto.randomBytes(12).toString('hex');
          const temp = path.join(real, `pending-${suffix}.json`);
          const prior = path.join(real, `previous-${suffix}.json`);
          let renamed = false;
          try {
            await writePrivate(io, temp, bytes);
            if (persisted) {
              await writePrivate(io, prior, JSON.stringify(state));
              await io.rename(prior, backup);
            }
            await io.rename(temp, filename);
            renamed = true;
            await syncDirectory();
            state = next;
            persisted = true;
          } catch (error) {
            if (renamed) uncertain = true;
            throw storageError(error, renamed ? 'uncertain' : 'unavailable');
          } finally {
            await io.unlink(temp).catch(() => {});
            await io.unlink(prior).catch(() => {});
          }
          return result;
        });
        queue = task.catch(() => {});
        return task;
      },
      async close() {
        if (closeTask) return closeTask;
        closing = true;
        closeTask = (async () => {
          await queue;
          try { await release(); } catch (error) { throw storageError(error); }
        })();
        return closeTask;
      },
    });
  } catch (error) {
    if (release) await release().catch(() => {});
    throw storageError(error);
  }
}
