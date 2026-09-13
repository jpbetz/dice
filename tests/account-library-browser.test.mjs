/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from './e2e/cdp.mjs';
import { libraryServer, document } from './fixtures/library-harness.mjs';

async function pageAt(browser, origin) {
  const page = await browser.newPage();
  await page.navigate(origin);
  for (let n = 0; n < 100; n++) {
    try { if (await page.eval(`location.origin === ${JSON.stringify(origin)}`)) return page; } catch { /* navigation */ }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('fixture navigation timed out');
}
const open = `(async () => {
  window.cache = await (await import('/js/library-cache.js')).openLibraryCache();
  return cache.ok;
})()`;

test('real IndexedDB tabs retain concurrent edits across reload, isolate namespaces and refuse aborted/corrupt writes', async t => {
  const { origin } = await libraryServer(t);
  const browser = await new Browser().launch(); t.after(() => browser.close());
  const a = await pageAt(browser, origin), b = await pageAt(browser, origin);
  assert.equal(await a.eval(open), true); assert.equal(await b.eval(open), true);
  const namespace = 'p_' + 'x'.repeat(43), other = 'p_' + 'y'.repeat(43);
  const seeded = await a.eval(`cache.seed(${JSON.stringify(namespace)}, ${JSON.stringify(document('Initial'))})`);
  const generation = seeded.workingGeneration;
  const edits = await Promise.all([a.eval(`cache.edit(${JSON.stringify(namespace)}, ${generation}, ${JSON.stringify(document('Tab A'))})`),
    b.eval(`cache.edit(${JSON.stringify(namespace)}, ${generation}, ${JSON.stringify(document('Tab B'))})`)]);
  assert.equal(edits.filter(result => result.ok).length, 1);
  assert.equal(edits.filter(result => result.retained).length, 1);
  assert.equal(edits[1].state.entries.length, 2);
  await a.eval(`cache.seed(${JSON.stringify(other)}, ${JSON.stringify(document('Other person'))})`);
  await a.eval('cache.close()');
  await a.navigate(origin);
  await a.eval(open);
  const recovered = await a.eval(`cache.read(${JSON.stringify(namespace)})`);
  assert.deepEqual(new Set(recovered.state.entries.map(e => e.document.profiles.profiles[0].name)), new Set(['Tab A', 'Tab B']));
  assert.equal((await a.eval(`cache.read(${JSON.stringify(other)})`)).document.profiles.profiles[0].name, 'Other person');
  const failed = await a.eval(`(async () => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) { const request = original.apply(this, args); this.transaction.abort(); return request; };
    try { return await cache.edit(${JSON.stringify(namespace)}, ${recovered.workingGeneration}, ${JSON.stringify(document('Must not commit'))}); }
    finally { IDBObjectStore.prototype.put = original; }
  })()`);
  assert.equal(failed.code, 'cache_unavailable');
  assert.deepEqual((await a.eval(`cache.read(${JSON.stringify(namespace)})`)).state, recovered.state);
  await a.eval(`(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('dice.private-libraries.v1', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise(resolve => { const tx = db.transaction('namespaces', 'readwrite'); tx.objectStore('namespaces').put({schema:99, privateOriginal:'Kept damaged bytes'}, ${JSON.stringify(other)}); tx.oncomplete = resolve; }); db.close();
  })()`);
  assert.equal((await b.eval(`cache.seed(${JSON.stringify(other)}, ${JSON.stringify(document('Replacement'))})`)).code, 'cache_corrupt');
  assert.deepEqual((await b.eval(`cache.export(${JSON.stringify(other)})`)).data, { schema: 99, privateOriginal: 'Kept damaged bytes' });
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
});

test('real browser recovery previews private libraries; offline edits retry after reload and debounce coalesces saves', async t => {
  const { origin, holdNextSave } = await libraryServer(t);
  const firstBrowser = await new Browser().launch(); t.after(() => firstBrowser.close());
  const a = await pageAt(firstBrowser, origin);
  await a.eval(open);
  const initial = await a.eval(`(async () => {
    const mod = await import('/js/account.js');
    window.offline = false; window.saves = 0;
    window.account = mod.createAccountClient({fetch: (url, opts) => {
      if (offline) return Promise.reject(new Error('fixture offline'));
      if (String(url).endsWith('/library') && opts.method === 'POST') saves++;
      return fetch(url, opts);
    }});
    const recoveryKey = mod.generateRecoveryKey();
    const result = await account.register({recoveryKey, displayName:'Sam', recoveryAcknowledged:true});
    window.personId = result.person.id;
    await cache.seed('guest', ${JSON.stringify(document('Guest original'))});
    await cache.seed(personId, ${JSON.stringify(document('Wizard'))});
    window.sync = (await import('/js/library-sync.js')).createLibrarySync({account, cache, personId, debounceMs:30,
      onResult: result => window.finished?.(result)});
    const preview = await sync.preview();
    return {recoveryKey, personId, preview};
  })()`);
  assert.equal(initial.preview.state.syncEnabled, false);
  assert.equal((await a.eval('account.library(personId)')).document, null);
  const choice = await a.eval(`sync.choose(${initial.preview.state.generation}, {choice:'local'})`);
  assert.equal(choice.ok, true);
  assert.equal((await a.eval('sync.flush()')).ok, true);
  const latest = await a.eval('sync.read()');
  const savedOffline = await a.eval(`(async () => {
    offline = true;
    const edit = await sync.edit(${latest.workingGeneration}, ${JSON.stringify(document('Offline sorcerer'))});
    const failed = await sync.flush();
    return {edit, failed};
  })()`);
  assert.equal(savedOffline.edit.ok, true);
  assert.equal(savedOffline.failed.code, 'account_unavailable');
  const retryId = savedOffline.edit.state.workingId;
  await a.eval('sync.close(); cache.close()');
  await a.navigate(origin);
  await a.eval(open);
  const retry = await a.eval(`(async () => {
    window.account = (await import('/js/account.js')).createAccountClient();
    const result = await account.session(); window.personId = result.person.id;
    window.sync = (await import('/js/library-sync.js')).createLibrarySync({account, cache, personId});
    const before = await sync.read(); const receipt = await sync.flush(); return {before,receipt};
  })()`);
  assert.equal(retry.before.state.workingId, retryId);
  assert.equal(retry.receipt.ok, true);
  const secondBrowser = await new Browser().launch(); t.after(() => secondBrowser.close());
  const b = await pageAt(secondBrowser, origin);
  await b.eval(open);
  const fresh = await b.eval(`(async () => {
    window.saves = 0; window.account = (await import('/js/account.js')).createAccountClient({fetch:(url,opts) => {
      if (String(url).endsWith('/library') && opts.method === 'POST') saves++; return fetch(url,opts);
    }});
    const recovered = await account.recover(${JSON.stringify(initial.recoveryKey)}); window.personId = recovered.person.id;
    const absent = await cache.read(personId);
    await cache.seed(personId, ${JSON.stringify(document('Clean browser original'))});
    window.sync = (await import('/js/library-sync.js')).createLibrarySync({account,cache,personId,debounceMs:30,
      onResult: result => window.finished?.(result)});
    const preview = await sync.preview(); return {recovered, absent, preview};
  })()`);
  assert.equal(fresh.recovered.person.id, initial.personId);
  assert.equal(fresh.absent.code, 'cache_missing');
  assert.equal(fresh.preview.document.profiles.profiles[0].name, 'Clean browser original');
  assert.equal(fresh.preview.state.entries.find(e => e.id === fresh.preview.state.remote.entryId).document.profiles.profiles[0].name, 'Offline sorcerer');
  assert.equal(await b.eval('saves'), 0);
  await b.eval(`sync.choose(${fresh.preview.state.generation}, {choice:'remote'})`);
  assert.equal((await b.eval('sync.flush()')).ok, true);
  const coalesced = await b.eval(`(async () => {
    const completed = new Promise(resolve => { window.finished = resolve; });
    for (const name of ['Edited once','Edited twice','Final edit']) {
      const current = await sync.read(); const document = current.document;
      document.profiles.profiles[0].name = name;
      await sync.edit(current.workingGeneration, document); sync.schedule();
    }
    const result = await completed;
    return {result,saves,remote:await account.library(personId)};
  })()`);
  assert.equal(coalesced.result.ok, true);
  assert.equal(coalesced.saves, 1);
  assert.equal(coalesced.remote.document.profiles.profiles[0].name, 'Final edit');
  assert.ok(coalesced.remote.versions.some(entry => entry.kind === 'retained-original'));
  const gate = holdNextSave();
  try {
    await b.eval(`(async () => {
      const current = await sync.read(); current.document.profiles.profiles[0].name = 'Held save';
      window.lastEdit = await sync.edit(current.workingGeneration,current.document);
      window.pendingFlush = sync.flush(); return lastEdit.ok;
    })()`);
    await gate.started;
    const during = await b.eval(`(async () => {
      const document = lastEdit.document; document.profiles.profiles[0].name = 'Edit while pending';
      window.lastEdit = await sync.edit(lastEdit.workingGeneration,document); sync.schedule(); return lastEdit;
    })()`);
    assert.equal(during.ok, true);
    // Let the edit's timer fire while the real server request is still held.
    await new Promise(resolve => setTimeout(resolve, 60));
    gate.release();
    assert.equal((await b.eval('pendingFlush')).ok, true);
    assert.equal((await b.eval('account.library(personId)')).document.profiles.profiles[0].name, 'Edit while pending');
    assert.equal(await b.eval('saves'), 3);
    const after = await b.eval(`(async () => {
      lastEdit.document.profiles.profiles[0].name = 'After acknowledgement';
      return sync.edit(lastEdit.workingGeneration,lastEdit.document);
    })()`);
    assert.equal(after.ok, true); // metadata-only acknowledgement is not another editor
    assert.deepEqual(after.state.localConflictIds, []);
  } finally { gate.release(); }
  assert.equal((await a.eval(`cache.read('guest')`)).document.profiles.profiles[0].name, 'Guest original');
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
});
