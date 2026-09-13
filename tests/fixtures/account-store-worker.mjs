/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import { openFileStore } from '../../service/store-file.js';
import fs from 'node:fs/promises';

// Messages deliberately contain no record contents, paths, keys or PID.
const [directory, action] = process.argv.slice(2);
try {
  const io = action === 'crash-before-rename' ? { ...fs, async rename(from, to) {
    if (to.endsWith('/state.json')) {
      process.on('message', () => {});
      process.send?.({ ready: true });
      await new Promise(() => {});
    }
    return fs.rename(from, to);
  } } : fs;
  const store = await openFileStore({ directory, recoverStaleLock: action === 'recover', io });
  if (action === 'crash-before-rename') {
    await store.transact(async tx => {
      tx.put('people/example', { count: 8 });
      tx.put('homes/example', { name: 'Uncommitted replacement' });
    });
  }
  if (action === 'hold' || action === 'write') {
    await store.transact(async tx => {
      await tx.get('people/example');
      tx.put('people/example', { schema: 1, count: 7 });
      tx.put('homes/example', { schema: 1, name: 'The Copper Lantern' });
    });
  }
  if (action === 'hold') {
    process.on('message', () => {}); // keep the fixture alive until its parent kills it
    process.send?.({ ready: true });
    await new Promise(() => {});
  } else {
    const person = await store.get('people/example');
    const home = await store.get('homes/example');
    if (!person || person.count !== 7 || home?.name !== 'The Copper Lantern') throw new Error('mismatch');
    await store.close();
    process.send?.({ ok: true });
    process.disconnect?.();
  }
} catch (error) {
  process.send?.({ ok: false, code: error.code || 'failed' });
  process.exitCode = 1;
  process.disconnect?.();
}
