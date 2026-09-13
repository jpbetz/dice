/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import { inspectAccountConfiguration } from '../service/account-config.js';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--production')) {
  process.stdout.write('Usage: node tools/account-preflight.mjs [--production]\n');
  process.exitCode = 2;
} else {
  const result = inspectAccountConfiguration(process.env, { production: args.includes('--production') });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ready ? 0 : 2;
}
