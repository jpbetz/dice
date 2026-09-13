/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import { openFileStore } from './store-file.js';
import { openFirestoreStore, metadataTokenSupplier } from './store-firestore.js';
import { createAccountService, SESSION_MS } from './account.js';
import { StoreError } from './store.js';
import { MAX_LIBRARY_BYTES } from '../js/library-document.js';

const ROOT = '/api/account';
const MAX_BODY = 8192;
const unavailable = { ok: false, code: 'account_unavailable', message: 'Account service is unavailable. Your table still works.' };
const disabled = { enabled: false, available: false, recoveryMethods: [], schema: 1 };
const known = new Set(['/status', '/session', '/register', '/recover', '/logout', '/revoke-others', '/rotate-key', '/library', '/library/reconcile', '/library/archive']);

function originConfig(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { throw new StoreError('invalid'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
      || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash
      || parsed.origin !== raw) throw new StoreError('invalid');
  return { origin: parsed.origin, secure: parsed.protocol === 'https:' };
}

function cookieToken(req, name) {
  const matches = String(req.headers.cookie || '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function readBody(req, maximum = MAX_BODY) {
  return new Promise(resolve => {
    let size = 0;
    const chunks = [];
    let timer;
    const finish = value => {
      clearTimeout(timer);
      req.removeListener('data', data);
      req.removeListener('end', end);
      req.removeListener('aborted', abort);
      req.removeListener('error', abort);
      resolve(value);
    };
    const data = chunk => {
      size += chunk.length;
      if (size > maximum) { finish({ status: 413 }); req.resume(); }
      else chunks.push(chunk);
    };
    const end = () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) return finish({ status: 400 });
        finish({ value });
      } catch { finish({ status: 400 }); }
    };
    const abort = () => finish({ status: 400 });
    req.on('data', data); req.on('end', end); req.on('error', abort); req.on('aborted', abort);
    timer = setTimeout(() => { finish({ status: 408 }); req.resume(); }, 5000);
  });
}

function send(res, status, value, headers = {}) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin', ...headers });
  res.end(JSON.stringify(value));
}

function homeRoute(suffix, method) {
  if (suffix === '/homes') return { action: method === 'GET' ? 'list' : 'create', read: method === 'GET' };
  if (suffix === '/homes/capture') return { action: 'capture', read: false };
  const match = /^\/homes\/(h_[A-Za-z0-9_-]{43})(?:\/(reconcile|leave|versions\/(v_[A-Za-z0-9_-]{8,80})))?$/.exec(suffix);
  if (!match) return null;
  if (match[3]) return { action: 'read', read: true, id: match[1], revision: match[3] };
  return { action: match[2] || (method === 'GET' ? 'read' : 'save'), id: match[1], read: !match[2] && method === 'GET' };
}

function socialRoute(suffix, method, requestUrl) {
  if (suffix === '/people') return { action: 'people', read: true };
  if (suffix === '/people/contact-code') return { action: 'code', read: false };
  if (suffix === '/people/requests') return { action: 'request', read: false };
  if (suffix === '/invitations') {
    const query = new URL(requestUrl, 'http://unused').searchParams;
    const input = Object.fromEntries(query);
    if (!Object.hasOwn(input, 'direction')) input.direction = 'incoming';
    return { action: method === 'GET' ? 'invitations' : 'invite', read: method === 'GET', input };
  }
  let match = /^\/people\/(p_[A-Za-z0-9_-]{43})\/(remove|block)$/.exec(suffix);
  if (match) return { action: match[2], id: match[1], read: false };
  match = /^\/invitations\/(i_[a-f0-9]{64})\/(respond|cancel|archive)$/.exec(suffix);
  return match ? { action: match[2], id: match[1], read: false } : null;
}

/** Optional router. Construction never throws and never delays live-room
 * routing. All exceptions are caught here before server.js's generic logger.
 * No credentials/config values or user data are passed to an error logger.
 */
export function createOptionalAccountApi({ env = process.env, service = null,
  now = Date.now, storeOptions = {}, homeBridge = null } = {}) {
  const mode = env.DICE_ACCOUNT_STORE || 'off';
  const enabled = mode !== 'off';
  let settings;
  let ready;
  if (enabled) {
    ready = (async () => {
      settings = originConfig(env.DICE_ACCOUNT_ORIGIN);
      if (service) return service;
      let store;
      if (mode === 'file') store = await openFileStore({ directory: env.DICE_ACCOUNT_DIR,
        recoverStaleLock: env.DICE_ACCOUNT_RECOVER_LOCK === '1', ...storeOptions });
      else if (mode === 'firestore') store = openFirestoreStore({
        project: env.DICE_FIRESTORE_PROJECT, database: env.DICE_FIRESTORE_DATABASE || '(default)',
        namespace: env.DICE_ACCOUNT_NAMESPACE, tokenSupplier: metadataTokenSupplier(), ...storeOptions,
      });
      else throw new StoreError('invalid');
      return createAccountService({ store, now, homeBridge });
    })().catch(() => null);
  } else ready = Promise.resolve(null);

  // A process-wide credential-attempt cap bounds backend reads even when a
  // proxy's forwarded client address is spoofed. Durable registration quotas
  // additionally bound account creation across restarts.
  let bucket = { start: now(), attempts: 0 };
  let writeBucket = { start: now(), attempts: 0 };
  const budget = credential => {
    const at = now();
    if (credential) {
      if (at - bucket.start >= 60000) bucket = { start: at, attempts: 0 };
      return ++bucket.attempts <= 60;
    }
    if (at - writeBucket.start >= 60000) writeBucket = { start: at, attempts: 0 };
    return ++writeBucket.attempts <= 120;
  };
  return Object.freeze({
    async handle(req, res, pathname) {
      const suffix = pathname.startsWith(ROOT + '/') ? pathname.slice(ROOT.length) : null;
      if (suffix === null) return false;
      try {
        const versionId = /^\/library\/versions\/([vo]_[A-Za-z0-9_-]{8,80})$/.exec(suffix)?.[1];
        const library = suffix === '/library' || suffix === '/library/reconcile' || suffix === '/library/archive' || !!versionId;
        const home = homeRoute(suffix, req.method);
        const social = socialRoute(suffix, req.method, req.url);
        if (!known.has(suffix) && !versionId && !home && !social) { send(res, 404, { ok: false, code: 'not_found', message: 'No such account action.' }); return true; }
        const read = ['/status', '/session'].includes(suffix) || !!versionId || (suffix === '/library' && req.method === 'GET') || home?.read || social?.read;
        if (req.method !== (read ? 'GET' : 'POST')) {
          send(res, 405, { ok: false, code: 'method_not_allowed', message: 'Use the account action in the app.' }); return true;
        }
        if (!enabled) {
          if (suffix === '/status') send(res, 200, disabled);
          else if (suffix === '/session') send(res, 200, { ok: true, person: null, enabled: false });
          else send(res, 503, unavailable);
          return true;
        }
        const account = await ready;
        if (!account) { send(res, suffix === '/status' ? 200 : 503,
          suffix === '/status' ? { enabled: true, available: false, recoveryMethods: ['key'], schema: 1 } : unavailable); return true; }
        if (suffix === '/status') { send(res, 200, await account.status()); return true; }
        const cookieName = settings.secure ? '__Host-dice-account' : 'dice-account-local';
        const token = cookieToken(req, cookieName);
        if (read) {
          if ((req.headers.origin && req.headers.origin !== settings.origin)
              || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin'
                && req.headers['sec-fetch-site'] !== 'none')) {
            send(res, 403, { ok: false, code: 'origin_refused', message: 'Open the account panel in the app.' }); return true;
          }
          const result = social ? await account.social(token, null, req.headers['x-dice-person'], social.action, social)
            : home ? await account.home(token, null, req.headers['x-dice-person'], home.action, home)
            : library ? await account.library(token, req.headers['x-dice-person'], versionId || null)
            : await account.session(token);
          const { status, ...value } = result;
          send(res, status || 200, value); return true;
        }
        if (req.headers.origin !== settings.origin || req.headers['x-dice-account'] !== '1'
            || !/^application\/json(?:;|$)/i.test(String(req.headers['content-type'] || ''))) {
          send(res, 403, { ok: false, code: 'origin_refused', message: 'Use the account action in the app.' }); return true;
        }
        if (!budget(['/register', '/recover'].includes(suffix))) {
          send(res, 429, { ok: false, code: 'attempt_limit', message: 'Too many attempts. Wait a minute and try again.' }); return true;
        }
        const body = await readBody(req, library ? MAX_LIBRARY_BYTES * 2 + MAX_BODY : MAX_BODY);
        if (body.status) { send(res, body.status, { ok: false, code: 'invalid_request', message: 'Check the account details and try again.' },
          { Connection: 'close' }); return true; }
        const csrf = req.headers['x-dice-csrf'];
        let result;
        if (suffix === '/register') result = await account.register(body.value);
        else if (suffix === '/recover') result = await account.recover(body.value);
        else if (suffix === '/logout') result = await account.logout(token, csrf);
        else if (suffix === '/revoke-others') result = await account.revokeOthers(token, csrf);
        else if (social) result = await account.social(token, csrf, req.headers['x-dice-person'], social.action, { ...social, input: body.value });
        else if (home) result = await account.home(token, csrf, req.headers['x-dice-person'], home.action, { ...home, input: body.value });
        else if (suffix === '/library/archive') result = await account.archiveLibrary(token, csrf, req.headers['x-dice-person'], body.value);
        else if (library) result = await account.saveLibrary(token, csrf, req.headers['x-dice-person'], body.value, suffix === '/library/reconcile');
        else result = await account.rotateKey(token, csrf, body.value);
        const { sessionToken, clearCookie, status, ...publicResult } = result;
        const headers = {};
        const attributes = `; HttpOnly; SameSite=Lax; Path=/${settings.secure ? '; Secure' : ''}`;
        if (sessionToken) headers['Set-Cookie'] = `${cookieName}=${sessionToken}; Max-Age=${Math.floor(SESSION_MS / 1000)}${attributes}`;
        if (clearCookie) headers['Set-Cookie'] = `${cookieName}=; Max-Age=0${attributes}`;
        send(res, status || 200, publicResult, headers);
      } catch (error) {
        const code = error instanceof StoreError ? error.code : 'unavailable';
        if (suffix === '/status') send(res, 200, { enabled: true, available: false, recoveryMethods: ['key'], schema: 1 });
        else if (code === 'limit') send(res, 429, { ok: false, code: 'account_limit', message: 'Account storage limit reached.' });
        else if (code === 'uncertain') send(res, 503, { ok: false, code: 'save_uncertain',
          message: 'Save confirmation was lost. Recover with your saved key before retrying.' });
        else send(res, 503, unavailable);
      }
      return true;
    },
    async resolveHomeRoom(roomKey) {
      if (!enabled) return { ok: true, enabled: false, home: null };
      try {
        const account = await ready;
        if (!account) return { ...unavailable, status: 503 };
        return { enabled: true, ...await account.resolveHomeRoom(roomKey) };
      } catch { return { ...unavailable, status: 503 }; }
    },
    async close() { const account = await ready; if (account) await account.close(); },
  });
}
