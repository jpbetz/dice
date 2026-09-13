/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { StoreError } from './store.js';

const SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const CHECKOUT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
function invalid(field) {
  const error = new StoreError('invalid');
  error.field = field; // a fixed environment variable name, never its value
  throw error;
}
export function accountOrigin(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { invalid('DICE_ACCOUNT_ORIGIN'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
      || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash
      || parsed.origin !== raw) invalid('DICE_ACCOUNT_ORIGIN');
  return { origin: parsed.origin, secure: parsed.protocol === 'https:' };
}
export function firestoreAddress({ project, database = '(default)', namespace } = {}) {
  if (!SEGMENT.test(project || '')) invalid('DICE_FIRESTORE_PROJECT');
  if (!(database === '(default)' || SEGMENT.test(database || ''))) invalid('DICE_FIRESTORE_DATABASE');
  if (!SEGMENT.test(namespace || '')) invalid('DICE_ACCOUNT_NAMESPACE');
  return { project, database, namespace };
}
export function readAccountConfiguration(env = {}, { injectedService = false } = {}) {
  const mode = env.DICE_ACCOUNT_STORE || 'off';
  if (!['off', 'paused', 'file', 'firestore'].includes(mode)) invalid('DICE_ACCOUNT_STORE');
  // Paused deliberately needs no origin, credentials, database or disk. Cold
  // room keys remain protected even if the storage configuration was lost.
  if (mode === 'off' || mode === 'paused') return { mode };
  const origin = accountOrigin(env.DICE_ACCOUNT_ORIGIN);
  if (mode === 'file') {
    if (!injectedService && (env.K_SERVICE || typeof env.DICE_ACCOUNT_DIR !== 'string'
        || !path.isAbsolute(env.DICE_ACCOUNT_DIR))) invalid('DICE_ACCOUNT_DIR');
    if (!injectedService) {
      const directory = path.resolve(env.DICE_ACCOUNT_DIR);
      if ([path.parse(directory).root, os.homedir(), os.tmpdir()].includes(directory)
          || directory === CHECKOUT || directory.startsWith(CHECKOUT + path.sep)
          || CHECKOUT.startsWith(directory + path.sep)) invalid('DICE_ACCOUNT_DIR');
    }
    return { mode, ...origin, directory: env.DICE_ACCOUNT_DIR,
      recoverStaleLock: env.DICE_ACCOUNT_RECOVER_LOCK === '1' };
  }
  return { mode, ...origin, ...firestoreAddress({ project: env.DICE_FIRESTORE_PROJECT,
    database: env.DICE_FIRESTORE_DATABASE || '(default)', namespace: env.DICE_ACCOUNT_NAMESPACE }) };
}

// Configuration-only preflight: no provider token, filesystem mutation or
// network request. Resource existence, IAM and restore proofs are separate.
export function inspectAccountConfiguration(env = {}, { production = false } = {}) {
  let config;
  try { config = readAccountConfiguration(env); }
  catch (error) { return { valid: false, ready: false, state: 'invalid',
    issues: [{ field: error.field || 'DICE_ACCOUNT_STORE', code: 'invalid_configuration' }] }; }
  const issues = [];
  if (production && config.mode === 'file') issues.push({ field: 'DICE_ACCOUNT_STORE', code: 'durable_cloud_adapter_required' });
  if (production && config.origin && !config.secure) issues.push({ field: 'DICE_ACCOUNT_ORIGIN', code: 'https_required' });
  if (production && env.DICE_DEV_WRITE === '1') issues.push({ field: 'DICE_DEV_WRITE', code: 'developer_writes_must_be_disabled' });
  const enabled = config.mode === 'file' || config.mode === 'firestore';
  return { valid: !issues.length, ready: enabled && !issues.length,
    state: issues.length ? 'invalid' : config.mode === 'off' ? 'disabled' : config.mode === 'paused' ? 'paused' : 'configuration_ready',
    mode: config.mode, scope: production ? 'production' : 'local', issues,
    externalChecksRequired: config.mode === 'firestore' ? ['database', 'runtime_identity', 'iam', 'backup_restore', 'staging_recovery'] : [] };
}
