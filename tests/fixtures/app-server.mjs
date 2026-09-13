/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */

import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export async function appServer(directory, overrides = {}) {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  if (port === 8123) throw new Error('live preview port is forbidden');
  const origin = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, [root + 'server.js'], { cwd: root,
    env: { ...process.env, PORT: String(port), DICE_ACCOUNT_STORE: 'file',
      DICE_ACCOUNT_DIR: directory, DICE_ACCOUNT_ORIGIN: origin, ...overrides }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  proc.stdout.on('data', chunk => { logs += chunk; }); proc.stderr.on('data', chunk => { logs += chunk; });
  const exited = new Promise(resolve => proc.once('exit', (code, signal) => resolve({ code, signal })));
  for (let n = 0; n < 200; n++) {
    try { if ((await fetch(origin + '/health', { signal: AbortSignal.timeout(250) })).ok) {
      return { origin, logs: () => logs, async stop() {
        if (proc.exitCode !== null || proc.signalCode !== null) return exited;
        proc.kill('SIGTERM'); const timer = setTimeout(() => proc.kill('SIGKILL'), 2500);
        try { return await exited; } finally { clearTimeout(timer); }
      } };
    } } catch { /* startup */ }
    if (proc.exitCode !== null) throw new Error('fixture server exited before startup');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  proc.kill('SIGKILL'); throw new Error('fixture server startup timed out');
}

export async function publicAction(origin, route, body) {
  const response = await fetch(origin + '/api/' + route, { method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, value: await response.json() };
}
