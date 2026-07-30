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

// App-level e2e harness. One dice server + one headless Chrome per run; each
// scenario gets a FRESH ROOM (rooms are independent in-memory worlds, so a
// new room name is complete isolation — the server never needs restarting).
// Two identities come from the two-origin trick: localhost and 127.0.0.1 are
// distinct localStorage origins on the same server.
//
// Scenarios drive the app through window.__diceDebug (the supported headless
// test surface — hidden/headless pages must not rely on rAF timing) and
// assert on projected primitives, never on live app objects.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Browser } from './cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export { assert };

export async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function startServer(port) {
  const proc = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`server exited early:\n${out.slice(-2000)}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return proc;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error(`server never came up on :${port}\n${out.slice(-2000)}`);
}

// A Table is one player's tab. `origin` picks the localStorage identity
// bucket: 'localhost' and '127.0.0.1' are independent.
export class Table {
  constructor(page, url) {
    this.page = page;
    this.url = url;
  }

  // Evaluate against window.__diceDebug — pass a property path or expression
  // fragment, e.g. dbg('shelf.length') or dbg('commandRoll("d20")').
  dbg(expr) { return this.page.eval(`window.__diceDebug.${expr}`); }
  eval(expr) { return this.page.eval(expr); }

  async waitFor(expr, { timeout = 15000, desc = expr } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      last = await this.page.eval(expr);
      if (last) return last;
      await sleep(100);
    }
    throw new Error(`timeout waiting for: ${desc} (last value: ${JSON.stringify(last)})`);
  }

  // Drive the dt-clock forward until the table is idle. Ceremonies, playback,
  // whisks, and sinks all run on this clock, so sim() fast-forwards them.
  async settle({ timeout = 30000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const busy = await this.page.eval('(window.__diceDebug.sim(120), window.__diceDebug.busy)');
      if (!busy) {
        // one more beat so post-roll transitions (whisk/sink) finish too
        await this.dbg('sim(240)');
        return;
      }
    }
    throw new Error('table never settled');
  }

  // Issue a notation roll and wait until it has fully played out (log entry
  // appended and table idle).
  async roll(notation) {
    const before = await this.logCount();
    await this.dbg(`commandRoll(${JSON.stringify(notation)})`);
    await this.waitFor(
      `(window.__diceDebug.sim(120), document.getElementById('log-list').childElementCount > ${before} && !window.__diceDebug.busy)`,
      { desc: `roll "${notation}" to complete` },
    );
    await this.dbg('sim(240)');
  }

  logCount() { return this.eval(`document.getElementById('log-list').childElementCount`); }

  // Normalized text of the newest log entry — the shared-truth comparison
  // unit (same values, breakdown, attribution, and meaning for everyone).
  logTop() {
    return this.eval(
      `(document.getElementById('log-list').firstElementChild || {innerText: ''}).innerText.replace(/\\s+/g, ' ').trim()`,
    );
  }

  // rollId of the current (most recent) roll.
  rollId() { return this.eval(`(window.__diceDebug.currentRoll || {}).rollId ?? null`); }

  diceCount() { return this.dbg('tableDice.length'); }
  shelf() { return this.dbg('shelf'); }

  async close() { await this.page.close(); }
}

export class Ctx {
  constructor(browser, port, room) {
    this.browser = browser;
    this.port = port;
    this.room = room;
    this.tables = [];
  }

  // origin: 'localhost' | '127.0.0.1' (distinct identities); name seeds the
  // player name before the app boots.
  async newTable({ origin = 'localhost', name } = {}) {
    const page = await this.browser.newPage();
    if (name) {
      await page.addInitScript(
        `try { localStorage.setItem('dice.name.v1', ${JSON.stringify(name)}); } catch {}`,
      );
    }
    const url = `http://${origin}:${this.port}/?room=${encodeURIComponent(this.room)}`;
    await page.navigate(url);
    const t = new Table(page, url);
    await t.waitFor(
      `!!window.__diceDebug && window.__diceDebug.netReady`,
      { desc: `app ready (${origin}, ${name || 'anon'})`, timeout: 20000 },
    );
    this.tables.push(t);
    return t;
  }

  async closeAll() {
    for (const t of this.tables.splice(0)) await t.close();
  }

  // Uncaught page exceptions are scenario failures; console.error is noise
  // worth surfacing but not fatal.
  collectErrors() {
    const errors = [], warnings = [];
    for (const t of this.tables) {
      errors.push(...t.page.errors);
      warnings.push(...t.page.consoleErrors);
    }
    return { errors, warnings };
  }
}

export async function runScenarios(scenarios, { only = null, full = false } = {}) {
  const selected = scenarios.filter((s) => {
    if (only) return s.tags.some((t) => only.includes(t));
    if (full) return true;
    return s.tags.includes('smoke');
  });
  if (selected.length === 0) {
    console.error(only ? `no scenarios match tags: ${only.join(', ')}` : 'no scenarios selected');
    process.exit(2);
  }

  const port = await freePort();
  const server = await startServer(port);
  const browser = await new Browser().launch();
  const cleanup = async () => {
    await browser.close();
    if (server.exitCode === null) server.kill('SIGTERM');
  };
  process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

  const runId = Math.random().toString(36).slice(2, 8);
  let failed = 0;
  console.log(`e2e: ${selected.length} scenario(s) on :${port} (run ${runId})\n`);
  for (const s of selected) {
    const ctx = new Ctx(browser, port, `e2e-${s.name}-${runId}`);
    const t0 = Date.now();
    let err = null;
    try {
      await Promise.race([
        s.fn(ctx),
        sleep(s.timeout || 90000).then(() => { throw new Error('scenario timeout'); }),
      ]);
      const { errors, warnings } = ctx.collectErrors();
      if (errors.length) err = new Error(`uncaught page exception(s):\n  ${errors.join('\n  ')}`);
      for (const w of warnings) console.log(`    (console.error) ${w.slice(0, 200)}`);
    } catch (e) {
      err = e;
    } finally {
      await ctx.closeAll().catch(() => {});
    }
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    if (err) {
      failed++;
      console.log(`  FAIL ${s.name} (${dur}s)\n    ${String(err.message || err).split('\n').join('\n    ')}`);
    } else {
      console.log(`  ok   ${s.name} (${dur}s)`);
    }
  }
  await cleanup();
  console.log(`\n${selected.length - failed}/${selected.length} passed`);
  process.exit(failed ? 1 : 0);
}
