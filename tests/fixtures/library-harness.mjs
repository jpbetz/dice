/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { openFileStore } from '../../service/store-file.js';
import { createAccountService } from '../../service/account.js';
import { createOptionalAccountApi } from '../../service/account-http.js';
import { createAccountClient } from '../../js/account.js';
import { emptyStore, addProfile } from '../../js/profiles.js';
import { libraryDocument } from '../../js/library-document.js';

export function document(name = 'Private wizard', notation = '1d20', defaultSet = 'classics.ivory') {
  const profiles = emptyStore();
  addProfile(profiles, { name, system: 'none', pools: [{ id: 1, name: 'Spell', notation }], at: 1 });
  return libraryDocument(profiles, { defaultSet, favorites: [defaultSet] }).document;
}

export async function libraryServer(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dice-library-'));
  const store = await openFileStore({ directory });
  const service = createAccountService({ store });
  let api;
  let nextSaveGate = null;
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://unused').pathname;
    if (nextSaveGate && pathname === '/api/account/library' && req.method === 'POST') {
      const gate = nextSaveGate; nextSaveGate = null; gate.started(); await gate.wait;
    }
    if (await api.handle(req, res, pathname)) return;
    if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Private library protocol fixture</title>'); return; }
    if (/^\/js\/[a-z0-9-]+\.js$/.test(pathname)) {
      try { const source = await fs.readFile(new URL('../..' + pathname, import.meta.url));
        res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(source); return;
      } catch { /* absent fixture file */ }
    }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  api = createOptionalAccountApi({ env: { DICE_ACCOUNT_STORE: 'file', DICE_ACCOUNT_ORIGIN: origin }, service });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await api.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { origin, store, directory, holdNextSave() {
    let started, release;
    const ready = new Promise(resolve => { started = resolve; });
    const wait = new Promise(resolve => { release = resolve; });
    nextSaveGate = { started, wait };
    return { started: ready, release };
  } };
}

export function cookieClient(origin) {
  let cookie = '';
  const fetcher = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { ...options.headers,
      ...(options.method === 'POST' ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) } });
    const changed = response.headers.get('set-cookie');
    if (changed) cookie = changed.split(';')[0];
    return response;
  };
  return { client: createAccountClient({ origin, fetch: fetcher, storage: null }), fetch: fetcher,
    cookie: () => cookie, setCookie: value => { cookie = value; } };
}
