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

// Minimal Chrome DevTools Protocol client — zero dependencies. Node >= 22
// provides a WHATWG WebSocket client, so driving headless Chrome needs no
// puppeteer: launch with --remote-debugging-port=0, read the chosen port
// from <profile>/DevToolsActivePort, and speak flat-protocol CDP over the
// browser-level websocket (page sessions multiplex via sessionId).

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  throw new Error('no Chrome binary found (set CHROME_BIN)');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Browser {
  constructor() {
    this.proc = null;
    this.profileDir = null;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map(); // id -> {resolve, reject}
    this.listeners = new Map(); // `${sessionId}:${method}` or `:${method}` -> [fn]
  }

  async launch() {
    const chrome = findChrome();
    this.profileDir = mkdtempSync(join(tmpdir(), 'dice-e2e-'));
    this.proc = spawn(chrome, [
      '--headless',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--mute-audio',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    this.proc.stderr.on('data', (d) => { stderr += d; });
    this.proc.on('error', (e) => { throw new Error(`chrome failed to start: ${e.message}`); });

    const portFile = join(this.profileDir, 'DevToolsActivePort');
    const deadline = Date.now() + 15000;
    let port = null, path = null;
    while (Date.now() < deadline) {
      if (existsSync(portFile)) {
        const lines = readFileSync(portFile, 'utf8').trim().split('\n');
        if (lines.length >= 2 && Number(lines[0]) > 0) { port = Number(lines[0]); path = lines[1]; break; }
      }
      if (this.proc.exitCode !== null) throw new Error(`chrome exited early:\n${stderr.slice(-2000)}`);
      await sleep(100);
    }
    if (!port) throw new Error(`chrome DevTools port never appeared:\n${stderr.slice(-2000)}`);

    this.ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('browser websocket failed')), { once: true });
    });
    this.ws.addEventListener('message', (ev) => this.#onMessage(String(ev.data)));
    return this;
  }

  #onMessage(raw) {
    const msg = JSON.parse(raw);
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`CDP ${msg.error.message}${msg.error.data ? ` — ${msg.error.data}` : ''}`));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (const key of [`${msg.sessionId || ''}:${msg.method}`, `:${msg.method}`]) {
        for (const fn of this.listeners.get(key) || []) fn(msg.params, msg.sessionId);
      }
    }
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, fn, sessionId = '') {
    const key = `${sessionId}:${method}`;
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(fn);
  }

  async newPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, targetId, sessionId);
    await page.init();
    return page;
  }

  async close() {
    try { this.ws && this.ws.close(); } catch { /* ignore */ }
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill('SIGTERM');
      const deadline = Date.now() + 3000;
      while (this.proc.exitCode === null && Date.now() < deadline) await sleep(50);
      if (this.proc.exitCode === null) this.proc.kill('SIGKILL');
    }
    if (this.profileDir) { try { rmSync(this.profileDir, { recursive: true, force: true }); } catch { /* ignore */ } }
  }
}

export class Page {
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.errors = []; // uncaught page exceptions — scenarios fail on these
    this.consoleErrors = []; // console.error output — reported, not fatal
  }

  async init() {
    await this.browser.send('Page.enable', {}, this.sessionId);
    await this.browser.send('Runtime.enable', {}, this.sessionId);
    this.browser.on('Runtime.exceptionThrown', (p) => {
      const d = p.exceptionDetails;
      this.errors.push(d.exception?.description || d.text || 'unknown exception');
    }, this.sessionId);
    this.browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        this.consoleErrors.push(p.args.map((a) => a.description || String(a.value)).join(' '));
      }
    }, this.sessionId);
  }

  // Runs in every new document before any page script — the hook for seeding
  // localStorage (identity) ahead of the app module.
  addInitScript(source) {
    return this.browser.send('Page.addScriptToEvaluateOnNewDocument', { source }, this.sessionId);
  }

  async navigate(url) {
    await this.browser.send('Page.navigate', { url }, this.sessionId);
  }

  // Evaluate an expression; must resolve to a JSON-serializable value (never
  // return live app objects — project to primitives in the expression).
  async eval(expression) {
    const r = await this.browser.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    }, this.sessionId);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`page eval failed: ${d.exception?.description || d.text}\n  in: ${expression.slice(0, 200)}`);
    }
    return r.result.value;
  }

  // Capture the page as a PNG. Shared by tools/drive.mjs step files (visual
  // checks) — e2e scenarios keep asserting state via __diceDebug, not pixels.
  async screenshot(path, { width = 1920, height = 1080 } = {}) {
    const { writeFileSync } = await import('node:fs');
    await this.browser.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: false }, this.sessionId);
    const { data } = await this.browser.send('Page.captureScreenshot', { format: 'png' }, this.sessionId);
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  async close() {
    try { await this.browser.send('Target.closeTarget', { targetId: this.targetId }); } catch { /* ignore */ }
  }
}
