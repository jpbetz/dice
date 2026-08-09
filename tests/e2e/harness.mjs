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
// Separate identities come from the loopback-origin trick: localhost and every
// address in 127.0.0.0/8 are distinct localStorage origins on the same server.
//
// Scenarios drive the app through window.__diceDebug (the supported headless
// test surface — hidden/headless pages must not rely on rAF timing) and
// assert on projected primitives, never on live app objects. A scenario may
// also step outside the browser entirely: apiPost/RawPlayer speak to the
// server as a bare HTTP client, which is how redaction gets proved on the
// bytes rather than on what a client chose to render.

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

// DICE_SETUP_TTL_MS: a prepared room outlives its last player by 12 hours in
// production (ROADMAP §G6), which no scenario can wait out. The server reads
// the override once at boot, so it is set here for the whole run rather than
// per scenario — only the linger scenario cares, and a short TTL is invisible
// to every other one (an unprepared room is deleted immediately either way).
const SETUP_TTL_MS = 4000;

export async function startServer(port) {
  const proc = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), DICE_SETUP_TTL_MS: String(SETUP_TTL_MS) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  proc.output = () => out; // the captured server log, for failure reports and tools/
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

// POST a JSON body straight at the server, no browser in between. Scenarios
// use this to assert what the API itself does (status + error code) when the
// client deliberately says nothing about a refusal.
export async function apiPost(port, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, ok: res.ok, data };
}

// A player who exists only as bytes: joins over HTTP and holds an SSE stream
// open, keeping every character the server ever sent it. This is the redaction
// proof at the e2e layer — no client code in the path to hide a leak by
// declining to render it. `raw` is the exact stream text; `events()` parses it.
export class RawPlayer {
  constructor(port, room, name) {
    this.port = port;
    this.room = room;
    this.name = name;
    this.playerId = null;
    this.joinPayload = null;
    this.raw = '';
    this.ac = new AbortController();
  }

  static async join(port, room, name) {
    const p = new RawPlayer(port, room, name);
    const joined = await apiPost(port, '/api/join', { room, name });
    if (!joined.ok || !joined.data || !joined.data.playerId) {
      throw new Error(`raw player ${name} could not join: ${joined.status}`);
    }
    p.playerId = joined.data.playerId;
    p.joinPayload = joined.data;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/events?room=${encodeURIComponent(room)}`
      + `&playerId=${encodeURIComponent(p.playerId)}`,
      { signal: p.ac.signal },
    );
    if (!res.ok || !res.body) throw new Error(`raw player ${name} stream failed: ${res.status}`);
    p.reading = (async () => {
      for await (const chunk of res.body) p.raw += Buffer.from(chunk).toString('utf8');
    })().catch(() => { /* aborted on close */ });
    return p;
  }

  // Parsed [{type, data}] — for asserting which events arrived at all.
  events() {
    return this.raw
      .split('\n\n')
      .map((block) => {
        const type = /(?:^|\n)event: (.*)/.exec(block);
        const data = /(?:^|\n)data: (.*)/.exec(block);
        if (!type || !data) return null;
        try { return { type: type[1], data: JSON.parse(data[1]) }; } catch { return null; }
      })
      .filter(Boolean);
  }

  // Wait until an event of `type` (optionally matching a predicate) arrives.
  async waitForEvent(type, match = () => true, { timeout = 15000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const hit = this.events().find((e) => e.type === type && match(e.data));
      if (hit) return hit;
      await sleep(100);
    }
    throw new Error(`timeout waiting for raw '${type}' event (got: ${this.events().map((e) => e.type).join(', ')})`);
  }

  close() { try { this.ac.abort(); } catch { /* already gone */ } }
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

  // For a tab opened with `anon: true`: the seat has now been taken (by the
  // picker or the free-text prompt), so wait out the join the constructor
  // deliberately did not wait for, and insist it landed ONLINE. Same SOLO
  // guard newTable applies, for the same reason — a silent solo fallback
  // makes every later cross-tab assertion fail somewhere else.
  async waitOnline({ timeout = 30000 } = {}) {
    await this.waitFor(`!!window.__diceDebug && window.__diceDebug.netReady`,
      { desc: 'joined after taking a seat', timeout });
    const online = await this.eval(`window.__diceDebug.netReady.then((r) => r && r.online)`);
    if (!online) throw new Error('took a seat but came up SOLO against a live server');
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

  // This tab's server identity (null offline) — the credential a scenario
  // needs to speak to the API as this player.
  playerId() { return this.dbg('net.playerId'); }

  // This tab's seat color, as the roster shows it (the identity chip's hue).
  color() { return this.dbg('identity.color'); }

  // Refresh THIS tab — same URL, same browsing context, so sessionStorage
  // (where the seat lives) survives exactly as it does for a real F5. Waits
  // for the app to boot and re-join before returning. No boot retry here: a
  // retry would open a NEW tab and silently lose the very state under test.
  // `hash` appends a fragment (e.g. a stale '#g=…'), for asserting that the
  // URL carries no user state.
  async reload({ timeout = 30000, hash = '' } = {}) {
    // Driven from inside the page, exactly as a player's F5 is: a CDP
    // Page.navigate + Page.reload pair races the in-flight navigation and
    // intermittently answers "Not attached to an active page". The sentinel
    // on the OUTGOING document is what keeps the readiness poll below from
    // answering out of the page we are replacing; the replace() puts the
    // requested url (hash and all) in place, and reload() forces the
    // document to actually re-run — a url differing only by fragment is a
    // same-document jump that never re-executes anything.
    try {
      await this.page.eval(`(() => {
        window.__reloading = true;
        location.replace(${JSON.stringify(this.url + hash)});
        location.reload();
      })()`);
    } catch { /* the context can die inside the call — that IS the reload */ }
    const deadline = Date.now() + timeout;
    let last = null;
    while (Date.now() < deadline) {
      try {
        last = await this.page.eval(
          `(!window.__reloading && !!window.__diceDebug)
             ? window.__diceDebug.netReady.then((r) => !!(r && r.online))
             : false`,
        );
        if (last) return;
      } catch { /* execution context torn down mid-navigation — poll again */ }
      await sleep(100);
    }
    throw new Error(`timeout waiting for the reload to settle (last value: ${JSON.stringify(last)})`);
  }

  // The per-die value chips over the table, in die order ('?' while hidden).
  chips() {
    return this.eval(
      `[...document.querySelectorAll('#chips-layer .value-chip')].map((e) => e.textContent)`,
    );
  }

  // Redaction/reveal projection of one log entry (the newest when no id):
  // {hidden, redacted, revealed, faceDown, visMode, total, values, dc, canReveal}.
  entryState(rollId = null) {
    return this.dbg(`entryState(${rollId === null ? '' : JSON.stringify(rollId)})`);
  }

  // Park a REAL cursor over an element, so CSS `:hover` actually matches.
  // A synthetic MouseEvent cannot do this — dispatching 'mouseover' runs JS
  // listeners but never moves the browser's hover state, so any rule in the
  // cascade stays unmatched. Only Input.dispatchMouseEvent moves the cursor
  // for real. Returns false when the element isn't on screen to aim at.
  async hover(selector) {
    const box = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) return false;
    await this.page.browser.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: Math.round(box.x), y: Math.round(box.y), buttons: 0,
    }, this.page.sessionId);
    return true;
  }

  // Make this tab a TOUCH device: `(pointer: coarse)` starts matching, which
  // is the only way to exercise a contract whose complement is a coarse
  // media rule (the one-✕ rule's sweep, §7.15). Emulation.setEmulatedMedia
  // deliberately does NOT do this — its `features` list ignores `pointer`;
  // touch emulation is what Chrome derives the pointer type from. (Headless
  // at rest is `pointer: none` — neither coarse nor fine — so every coarse
  // rule is OFF unless a scenario asks for it.) The override is per-tab and
  // outlives the scenario's own assertions: turn it back off.
  emulateCoarsePointer(on = true) {
    return this.page.browser.send(
      'Emulation.setTouchEmulationEnabled',
      on ? { enabled: true, maxTouchPoints: 5 } : { enabled: false },
      this.page.sessionId,
    );
  }

  async close() { await this.page.close(); }
}

export class Ctx {
  constructor(browser, port, room, server = null) {
    this.browser = browser;
    this.port = port;
    this.room = room;
    this.server = server;
    this.tables = [];
    this.rawPlayers = [];
  }

  // The server's own stdout, for the handful of facts that have no wire
  // surface at all — room lifecycle (ROADMAP §G6) is the case in point: a
  // room lingering, resuming or expiring is observable only in the log,
  // because by definition nobody is connected to be told. Polling this beats
  // sleeping on a guessed interval, which is what the alternative would be.
  serverLog() { return this.server ? this.server.output() : ''; }

  async waitForLog(re, { timeout = 20000, desc = String(re) } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (re.test(this.serverLog())) return true;
      await sleep(100);
    }
    throw new Error(`timeout waiting for server log: ${desc}`);
  }

  // Speak to this room's API directly (room is filled in for you).
  api(path, body = {}) { return apiPost(this.port, path, { room: this.room, ...body }); }

  // Join this room as a bytes-only player (see RawPlayer).
  async rawPlayer(name) {
    const p = await RawPlayer.join(this.port, this.room, name);
    this.rawPlayers.push(p);
    return p;
  }

  // origin picks the localStorage identity bucket: 'localhost', '127.0.0.1'
  // and the rest of 127.0.0.0/8 ('127.0.0.2', '127.0.0.3', …) are all distinct
  // origins on the same server, which is how a scenario seats three or four
  // players. name seeds the player name before the app boots.
  //
  // `anon: true` seeds NO name, so the app stops at the 'Take a seat' modal
  // instead of joining — the only way to exercise the seat picker (ROADMAP
  // §G5), which is exactly the surface a name-seeded tab skips. The ready-wait
  // becomes the modal rather than netReady, because netReady does not settle
  // until a seat is taken; the caller drives the modal and then awaits
  // `takeSeat()`/`netReady` itself. `query` appends extra search params (the
  // `&as=` pre-select) — always after `?room=`, never replacing it.
  //
  // ONE logged boot retry: ~1–2% of fresh tabs come up broken — either the
  // ready-wait times out, or the vendor modules double-evaluate ("Identifier
  // 'iO' has already been declared" from three.module.js / cannon-es) and the
  // recorded page exception fails an otherwise-green scenario at collect
  // time. Reproduced at d106a20 (pre-chrome-cleanup), so it is the headless
  // Chrome / CDP page churn, not the app. A single retry keeps the suite
  // honest: a real boot regression still fails twice in a row.
  async newTable({ origin = 'localhost', name, allowSolo = false, anon = false, query = '' } = {}) {
    for (let attempt = 0; ; attempt++) {
      const page = await this.browser.newPage();
      // Deterministic clocks: wall-time features (auto-collect) stay OFF in
      // scenarios unless one opts in via the setAutoCollectMs debug hook.
      await page.addInitScript('window.__diceTestMode = true;');
      // VIEW PREFERENCES BOOT AT THEIR DEFAULTS, always. These keys are
      // per-origin and outlive a scenario's room, and unlike a stale name
      // they can make whole regions of the panel `display: none` — a leaked
      // `{pools: false}` hides the rack for every later scenario on this
      // origin, which is two dozen assertions failing three scenarios away
      // from the one that caused it. A scenario that wants a non-default
      // view sets it explicitly through its own hook.
      await page.addInitScript(
        // NOT dice.inputmode.v1: it is the legacy key the section migration
        // reads, it can only ever produce one of two both-safe states, and
        // section-bar's migration pin needs to be able to seed it.
        `try { localStorage.removeItem('dice.sections.v1');`
        + ` localStorage.removeItem('dice.railmode.v1'); } catch {}`,
      );
      if (name) {
        await page.addInitScript(
          `try { localStorage.setItem('dice.name.v1', ${JSON.stringify(name)}); } catch {}`,
        );
        // `name` WITH `anon` is the RETURNING PLAYER (U3): a stored name AND
        // an expectation of meeting the seat picker anyway. Until the &as=
        // fix that combination was unreachable — `anon` meant "no name", so
        // the one population an invite link is actually sent to could not be
        // expressed, which is exactly why prepared-seat passed while CUJ2 was
        // broken for everyone who had ever opened the app.
      } else if (anon) {
        // Anonymous means anonymous. Names live in per-origin localStorage,
        // which OUTLIVES a scenario's room — so merely declining to seed one
        // leaves whatever an earlier scenario stored on this origin, the tab
        // joins straight through, and the seat modal never opens. That failed
        // only in a full sweep, which is the worst way to find out.
        await page.addInitScript(
          `try { localStorage.removeItem('dice.name.v1'); } catch {}`,
        );
      }
      const url = `http://${origin}:${this.port}/?room=${encodeURIComponent(this.room)}${query}`;
      await page.navigate(url);
      const t = new Table(page, url);
      try {
        if (anon) {
          // No seeded name: the app is sitting at 'Take a seat'. Waiting on
          // netReady here would hang until something takes the seat, which is
          // the caller's job — so the readiness bar is the modal being up.
          // Optional-chained on purpose: the poll starts the instant navigate
          // returns, and #name-modal is the LAST element in index.html — so a
          // tick where the document has not reached it yet is normal, and it
          // must read as "not yet", not as a thrown TypeError that burns the
          // boot and costs a retry. (Seen for real once the markup above the
          // modal grew.)
          await t.waitFor(
            `document.getElementById('name-modal')?.classList.contains('hidden') === false`,
            { desc: `seat modal up (${origin})`, timeout: 30000 },
          );
        } else {
          await t.waitFor(
            `!!window.__diceDebug && window.__diceDebug.netReady`,
            { desc: `app ready (${origin}, ${name || 'anon'})`, timeout: 30000 },
          );
          // The ready promise resolves {online} — a tab that fell back to SOLO
          // while a live server is right there is a broken boot (slow join,
          // dropped stream), and every later cross-tab assertion would fail
          // mysteriously. Say it here instead.
          if (!allowSolo) {
            const online = await t.eval(`window.__diceDebug.netReady.then((r) => r && r.online)`);
            if (!online) throw new Error(`tab came up SOLO against a live server (${origin})`);
          }
        }
      } catch (e) {
        if (attempt > 0) { this.tables.push(t); throw e; }
        console.log(`    (boot retry: ${String(e.message || e).slice(0, 100)})`);
        await t.close().catch(() => {});
        continue;
      }
      if (attempt === 0 && page.errors.length) {
        console.log(`    (boot retry: page exception on load — ${String(page.errors[0]).slice(0, 120)})`);
        await t.close().catch(() => {});
        continue;
      }
      this.tables.push(t);
      return t;
    }
  }

  async closeAll() {
    for (const p of this.rawPlayers.splice(0)) p.close();
    for (const t of this.tables.splice(0)) await t.close();
  }

  // Uncaught page exceptions are scenario failures; console.error is noise
  // worth surfacing but not fatal.
  //
  // …unless a scenario THROWS ON PURPOSE. `crash-reporting` exists to prove
  // that an uncaught exception reaches the server, so the exception is its
  // subject rather than its failure. expectErrors(re) narrows the exemption
  // to matching messages, so a scenario that arms this still fails on any
  // OTHER exception — a blanket opt-out would hide the next real one.
  expectErrors(re) { this.expectedErrors = re; }

  collectErrors() {
    const errors = [], warnings = [];
    for (const t of this.tables) {
      errors.push(...(this.expectedErrors
        ? t.page.errors.filter((e) => !this.expectedErrors.test(String(e)))
        : t.page.errors));
      warnings.push(...t.page.consoleErrors);
    }
    return { errors, warnings };
  }
}

export async function runScenarios(scenarios, { only = null, full = false } = {}) {
  const selected = scenarios.filter((s) => {
    if (only) return only.includes(s.name) || s.tags.some((t) => only.includes(t));
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
    const ctx = new Ctx(browser, port, `e2e-${s.name}-${runId}`, server);
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
