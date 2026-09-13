/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { libraryServer, cookieClient, document } from './fixtures/library-harness.mjs';
import { validateLibraryDocument, reconcileLibraryDocuments, libraryDocument } from '../js/library-document.js';
import { transitionLibraryCache } from '../js/library-cache.js';
import { emptyStore, addProfile, MAX_NAME } from '../js/profiles.js';
import { exportYaml, parsePortable, planImport } from '../js/portable.js';
import { parseYaml } from '../js/yaml.js';
import { createTune } from '../js/tune.js';
import { buildCatalogue, installCatalogue } from '../js/themes.js';

const key = () => 'dt1_' + crypto.randomBytes(32).toString('base64url');
const operationId = () => crypto.randomUUID();
const save = (document, baseRevision = null, operation = operationId()) => ({ operationId: operation, baseRevision, document });

test('actual house catalogue favorites and portable profile/pool skins roundtrip without a second slug or notation limit', () => {
  const source = readFileSync(new URL('../dice.yaml', import.meta.url), 'utf8');
  const tune = createTune({ declared: parseYaml(source).tree, source });
  const built = buildCatalogue(tune.SHIPPED.houses);
  installCatalogue(tune.SHIPPED.houses);
  const favorites = built.SET_IDS;
  assert.ok(favorites.includes('tidewrack.seaglass')); assert.ok(favorites.includes('symbols.monster'));
  const profiles = emptyStore();
  addProfile(profiles, { name: 'N'.repeat(MAX_NAME), system: 'none', set: 'tidewrack.seaglass', at: 1,
    pools: [{ id: 1, name: 'P'.repeat(MAX_NAME), notation: '1d20', category: 'C'.repeat(MAX_NAME), set: 'symbols.monster' }] });
  const original = libraryDocument(profiles, { defaultSet: 'tidewrack.seaglass', favorites });
  assert.equal(original.ok, true);
  const profile = profiles.profiles[0];
  const parsed = parsePortable(exportYaml({ groups: profile.pools, profile }));
  assert.equal(parsed.ok, true);
  const restored = emptyStore();
  addProfile(restored, { ...parsed.profile, pools: planImport([], parsed).adds.map((pool, i) => ({ ...pool, id: i + 1 })), at: 1 });
  assert.deepEqual(libraryDocument(restored, original.document.dice).document, original.document);
  const long = structuredClone(original.document);
  long.profiles.profiles[0].pools[0].notation = '1d20 # ' + 'kept commentary '.repeat(100);
  assert.equal(validateLibraryDocument(long).ok, true); // profiles.js shape contract, not a new parser
});

test('strict document boundary refuses unknown/private fields and future schemas; merge preserves divergent p1 profiles', () => {
  const local = document('Wizard', '1d20');
  const remote = document('Wizard', '2d20', 'opal');
  const before = JSON.stringify([local, remote]);
  assert.equal(validateLibraryDocument({ ...local, publication: ['p1'] }).ok, false);
  const future = structuredClone(local); future.profiles.ver = '3.0.0';
  assert.equal(validateLibraryDocument(future).ok, false);
  const corrupt = structuredClone(local); corrupt.profiles.activeId = 'p2';
  assert.equal(validateLibraryDocument(corrupt).ok, false);
  assert.equal(reconcileLibraryDocuments(local, remote, { choice: 'merge' }).code, 'dice_choice_required');
  const merged = reconcileLibraryDocuments(local, remote, { choice: 'merge', diceChoice: 'remote' });
  assert.equal(merged.ok, true);
  assert.deepEqual(merged.document.profiles.profiles.map(p => [p.id, p.name, p.pools[0].notation]),
    [['p1', 'Wizard', '1d20'], ['p2', 'Wizard 2', '2d20']]);
  assert.equal(merged.document.profiles.activeId, 'p1');
  assert.equal(merged.document.dice.defaultSet, 'opal');
  assert.equal(JSON.stringify([local, remote]), before);
});

test('separate cookie clients racing one base retain both immutable versions and enforce exact retry payloads', async t => {
  const { origin } = await libraryServer(t);
  const a = cookieClient(origin), b = cookieClient(origin), stranger = cookieClient(origin);
  const recoveryKey = key();
  const identity = await a.client.register({ recoveryKey, recoveryAcknowledged: true, displayName: 'Private Sam' });
  const personId = identity.person.id;
  await b.client.recover(recoveryKey);
  const otherId = (await stranger.client.register({ recoveryKey: key(), recoveryAcknowledged: true, displayName: 'Other' })).person.id;
  assert.equal((await a.client.library(personId)).document, null);
  const missing = await a.fetch(origin + '/api/account/library');
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).code, 'identity_changed');
  const wrong = await stranger.fetch(origin + '/api/account/library', { headers: { 'X-Dice-Person': personId } });
  assert.equal(wrong.status, 409);
  assert.equal(JSON.stringify(await wrong.json()).includes('Private'), false);
  const first = save(document('A', '1d20')), second = save(document('B', '2d20'));
  const [ra, rb] = await Promise.all([a.client.saveLibrary(personId, first), b.client.saveLibrary(personId, second)]);
  assert.equal([ra, rb].filter(r => r.ok).length, 1);
  assert.equal([ra, rb].filter(r => r.code === 'revision_conflict').length, 1);
  assert.deepEqual(await a.client.saveLibrary(personId, first), ra);
  assert.deepEqual(await b.client.saveLibrary(personId, second), rb);
  assert.equal((await a.client.saveLibrary(personId, { ...first, document: document('Changed') })).code, 'operation_reused');
  const listed = await a.client.library(personId);
  assert.equal(listed.versions.length, 2);
  for (const candidate of [first, second]) assert.deepEqual((await b.client.library(personId, 'v_' + candidate.operationId)).document, candidate.document);
  const chosen = save(document('Merged', '3d20'), listed.headRevision);
  chosen.retainDocument = document('Local original', '4d20');
  chosen.sourceVersionIds = listed.versions.map(entry => entry.id);
  const merged = await a.client.saveLibrary(personId, chosen, { reconcile: true });
  assert.equal(merged.ok, true);
  assert.deepEqual((await b.client.library(personId, merged.originalVersionId)).document, chosen.retainDocument);
  const refused = await a.client.archiveLibrary(personId, { versionIds: [listed.headRevision], discardAcknowledgedHistory: true });
  assert.equal(refused.code, 'version_protected');
  // Another tab can change the browser's shared cookie while this tab's JS
  // namespace remains A. The server must refuse reads as well as writes.
  a.setCookie(stranger.cookie());
  assert.equal((await a.client.library(personId)).code, 'identity_changed');
  assert.equal((await a.client.saveLibrary(personId, save(document('Wrong namespace')))).code, 'csrf_required');
  assert.equal((await stranger.client.library(otherId)).document, null);
});

test('explicit ancestor cleanup frees capacity, protects originals and keeps exact operation receipts', async t => {
  const { origin, store } = await libraryServer(t);
  const { client } = cookieClient(origin);
  const personId = (await client.register({ recoveryKey: key(), recoveryAcknowledged: true, displayName: 'Sam' })).person.id;
  let head = null;
  const inputs = [], receipts = [];
  for (let n = 0; n < 100; n++) {
    const input = save(document('Version ' + n), head); inputs.push(input);
    const result = await client.saveLibrary(personId, input); receipts.push(result);
    assert.equal(result.ok, true); head = result.headRevision;
  }
  assert.equal((await client.saveLibrary(personId, save(document('Kept offline'), head))).code, 'library_full');
  assert.equal((await client.archiveLibrary(personId, { versionIds: [head], discardAcknowledgedHistory: true })).code, 'version_protected');
  assert.equal((await client.archiveLibrary(personId, { versionIds: [receipts[0].revision] })).ok, false);
  const archived = await client.archiveLibrary(personId, { versionIds: receipts.slice(0, 20).map(r => r.revision), discardAcknowledgedHistory: true });
  assert.equal(archived.ok, true);
  assert.deepEqual(await client.saveLibrary(personId, inputs[0]), receipts[0]);
  assert.equal((await client.saveLibrary(personId, { ...inputs[0], document: document('Different payload') })).code, 'operation_reused');
  const newer = await client.saveLibrary(personId, save(document('Continued'), head));
  assert.equal(newer.ok, true);
  assert.equal((await client.library(personId)).versions.length, 81);
  // A damaged head is not an empty library and is never normalized into one.
  await store.transact(async tx => {
    const path = `libraries/${personId}/versions/${newer.revision}`;
    const entry = await tx.get(path);
    tx.put(path, { ...entry, document: { schema: 999 } });
  });
  assert.equal((await client.library(personId)).code, 'account_unavailable');
});

test('local stale-tab edits, uncertain envelopes and newer in-flight edits survive reconciliation and acknowledgements', () => {
  const namespace = 'p_' + 'a'.repeat(43);
  let state;
  const apply = action => {
    const result = transitionLibraryCache(state, namespace, action, { id: operationId(), at: 1 });
    if (result.changed) state = result.state;
    return result;
  };
  apply({ type: 'seed', document: document('Initial') });
  const generation = state.workingGeneration;
  apply({ type: 'edit', expectedWorkingGeneration: generation, document: document('First tab') });
  const stale = apply({ type: 'edit', expectedWorkingGeneration: generation, document: document('Second tab') });
  assert.equal(stale.retained, true);
  assert.equal(stale.document.profiles.profiles[0].name, 'First tab');
  assert.ok(state.entries.some(e => e.document.profiles.profiles[0].name === 'Second tab'));
  assert.ok(state.entries.some(e => e.document.profiles.profiles[0].name === 'First tab'));
  apply({ type: 'preview', result: { ok: true, personId: namespace, headRevision: null, document: null, versions: [] } });
  apply({ type: 'choose', expectedGeneration: state.generation, choice: 'local', localEntryId: stale.entryId });
  const pending = apply({ type: 'begin' }).upload;
  assert.deepEqual(apply({ type: 'begin' }).upload, pending);
  apply({ type: 'edit', expectedWorkingGeneration: state.workingGeneration, document: document('Edited during upload') });
  const receipt = { ok: true, personId: namespace, revision: 'v_' + pending.input.operationId, headRevision: 'v_' + pending.input.operationId };
  apply({ type: 'acknowledge', operationId: pending.input.operationId, result: receipt });
  const next = apply({ type: 'begin' }).upload;
  assert.equal(next.input.baseRevision, receipt.revision);
  assert.equal(next.input.document.profiles.profiles[0].name, 'Edited during upload');
  assert.ok(state.entries.some(e => e.document.profiles.profiles[0].name === 'Second tab'));
  const damaged = { ...state, schema: 9 };
  const refused = transitionLibraryCache(damaged, namespace, { type: 'seed', document: document() }, { id: operationId(), at: 1 });
  assert.equal(refused.code, 'cache_corrupt');
  assert.equal(refused.changed, undefined);
});

test('history byte capacity refuses before count capacity and leaves the last acknowledged head intact', async t => {
  const { origin } = await libraryServer(t);
  const { client } = cookieClient(origin);
  const personId = (await client.register({ recoveryKey: key(), recoveryAcknowledged: true, displayName: 'Sam' })).person.id;
  const profiles = emptyStore();
  for (let n = 0; n < 20; n++) addProfile(profiles, { name: `Profile ${n}`, system: 'none', at: n,
    pools: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `Pool ${i}`, notation: '1d20 # ' + 'x'.repeat(460) })) });
  const checked = libraryDocument(profiles);
  assert.equal(checked.ok, true);
  let head = null, count = 0, refused;
  for (let n = 0; n < 30; n++) {
    const candidate = structuredClone(checked.document);
    candidate.profiles.profiles[0].at = n;
    const result = await client.saveLibrary(personId, save(candidate, head));
    if (!result.ok) { refused = result; break; }
    head = result.headRevision; count++;
  }
  assert.equal(refused.code, 'library_full');
  assert.ok(count > 1 && count < 30);
  const read = await client.library(personId);
  assert.equal(read.headRevision, head);
  assert.equal(read.versions.length, count);
  assert.ok(read.historyBytes <= 8 * 1024 * 1024);
});

test('ordinary offline typing coalesces unsubmitted text while explicit stale alternatives remain at capacity', () => {
  const namespace = 'p_' + 'z'.repeat(43);
  let state;
  const apply = action => {
    const result = transitionLibraryCache(state, namespace, action, { id: operationId(), at: 1 });
    if (result.changed) state = result.state;
    return result;
  };
  apply({ type: 'seed', document: document('Initial') });
  for (let n = 0; n < 200; n++) assert.equal(apply({ type: 'edit', expectedWorkingGeneration: state.workingGeneration, document: document(`Edit ${n}`) }).ok, true);
  assert.equal(state.entries.length, 1);
  for (let n = 0; n < 127; n++) assert.equal(apply({ type: 'edit', expectedWorkingGeneration: 0, document: document(`Kept alternative ${n}`) }).retained, true);
  const original = structuredClone(state);
  assert.equal(apply({ type: 'edit', expectedWorkingGeneration: 0, document: document('Over capacity') }).code, 'cache_full');
  assert.deepEqual(state, original);
});

test('a definitive refused payload keeps its original and permits a new explicit choice; uncertain saves cannot be abandoned as refused', () => {
  const namespace = 'p_' + 'r'.repeat(43);
  let state;
  const apply = action => {
    const result = transitionLibraryCache(state, namespace, action, { id: operationId(), at: 1 });
    if (result.changed) state = result.state;
    return result;
  };
  apply({ type: 'seed', document: document('Local original') });
  apply({ type: 'preview', result: { ok: true, personId: namespace, headRevision: null, document: null, versions: [] } });
  apply({ type: 'choose', expectedGeneration: state.generation, choice: 'local' });
  const queued = apply({ type: 'begin' }).upload;
  const snapshot = structuredClone(state);
  assert.equal(apply({ type: 'refuse', operationId: queued.input.operationId,
    result: { ok: false, code: 'save_uncertain' } }).ok, false);
  assert.deepEqual(state, snapshot);
  const rejected = apply({ type: 'refuse', operationId: queued.input.operationId,
    result: { ok: false, code: 'invalid_library', message: 'A source was deliberately removed on another device.' } });
  assert.equal(rejected.retained, true);
  assert.equal(apply({ type: 'choose', expectedGeneration: state.generation, choice: 'local' }).ok, true);
  assert.notEqual(apply({ type: 'begin' }).upload.input.operationId, queued.input.operationId);
  assert.ok(state.entries.some(entry => entry.document.profiles.profiles[0].name === 'Local original'));
});
