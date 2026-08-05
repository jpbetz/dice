/*
Copyright 2026 The Dice Table Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Log injection — every user-derived string in an operator log line lives
// inside a quoted token, with interior quotes and backslashes escaped, so a
// rename like tableName='foo felt=crimson' can never forge a second
// key=value pair a log-scraper would confuse with a real setting.
//
// The regressions we lock:
//   - a settings patch with a space-and-equals-carrying tableName is logged
//     as a single quoted token
//   - a rename to "\"Bob felt=crimson\"" is logged with its embedded quote
//     backslash-escaped (never bare)
//   - a room name with a space is logged as a quoted token on the join line
//
// Structure follows tests/log-level.test.mjs: spawn a real server on an
// ephemeral port (never 8123), drive the API, and inspect what actually
// hits stdout with DICE_LOG_LEVEL=debug so the setting/rename lines are
// on.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function withServer(fn) {
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), DICE_LOG_LEVEL: 'debug' };
  const proc = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', (d) => (out += d));
  proc.stderr.on('data', (d) => (out += d));

  for (let i = 0; i < 200; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 25));
  }

  try {
    await fn({ port, output: () => out });
  } finally {
    proc.kill('SIGTERM');
    await new Promise((r) => proc.on('exit', r));
  }
  return out;
}

async function post(port, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// (1) tableName carrying " felt=crimson" is stored inside one quoted token
// on the setting log line — not exposed as an adjacent felt= pair.
await withServer(async ({ port, output }) => {
  const room = 'log-inject-settings';
  const j = await post(port, '/api/join', { room, name: 'Alice' });
  assert.equal(j.status, 200, `join must succeed; got ${j.status}`);
  const { playerId } = j.body;

  const injection = 'foo felt=crimson';
  const s = await post(port, '/api/settings', {
    room, playerId, settings: { tableName: injection },
  });
  assert.equal(s.status, 200, `settings must succeed; got ${s.status}`);

  await new Promise((r) => setTimeout(r, 100));
  const out = output();

  // The whole value stays inside one quoted token.
  assert.match(
    out,
    /setting .*tableName="foo felt=crimson"/,
    `tableName with spaces + equals must be single-quoted in the setting line\n---\n${out}\n---`,
  );
  // Belt and braces: there is NO bare `felt=crimson` token in the log — the
  // operator scanning for `felt=` must not see the injected value.
  assert.doesNotMatch(
    out,
    /(^|\s)felt=crimson(\s|$)/m,
    `injected felt=crimson must never appear as a bare log token\n---\n${out}\n---`,
  );
});

// (2) A player rename to a name with an embedded " is logged with the quote
// backslash-escaped — the whole name still sits in one token.
await withServer(async ({ port, output }) => {
  const room = 'log-inject-rename';
  const j = await post(port, '/api/join', { room, name: 'Alice' });
  assert.equal(j.status, 200, `join must succeed; got ${j.status}`);
  const { playerId } = j.body;

  // The name path strips #, but " passes through — that's exactly the
  // injection this test locks: even a legal name with a quote must not
  // break the log's key=value grammar.
  const injected = 'B"ob felt=crimson';
  const r = await post(port, '/api/rename', { room, playerId, name: injected });
  assert.equal(r.status, 200, `rename must succeed; got ${r.status}`);

  await new Promise((r) => setTimeout(r, 100));
  const out = output();

  assert.match(
    out,
    /rename .*newName="B\\"ob felt=crimson"/,
    `renamed name must be quoted with escaped interior "\n---\n${out}\n---`,
  );
  assert.doesNotMatch(
    out,
    /(^|\s)felt=crimson(\s|$)/m,
    `injected felt=crimson must never appear as a bare log token\n---\n${out}\n---`,
  );
});

// (3) A room name that carries a space is logged as one quoted token on the
// join line — the URL-scoped identifier is user-controlled too.
await withServer(async ({ port, output }) => {
  const room = 'weird room felt=crimson';
  const j = await post(port, '/api/join', { room, name: 'Alice' });
  assert.equal(j.status, 200, `join must succeed; got ${j.status}`);

  await new Promise((r) => setTimeout(r, 100));
  const out = output();

  assert.match(
    out,
    /join .*room="weird room felt=crimson"/,
    `room name with a space + equals must be single-quoted in the join line\n---\n${out}\n---`,
  );
  assert.doesNotMatch(
    out,
    /(^|\s)felt=crimson(\s|$)/m,
    `injected felt=crimson must never appear as a bare log token\n---\n${out}\n---`,
  );
});

console.log('log-injection.test: ok');
