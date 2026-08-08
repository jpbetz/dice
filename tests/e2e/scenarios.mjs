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

// The e2e scenario library. Tags select scenarios for targeted runs
// (docs/TESTING.md): `smoke` is the always-on core; area tags map to the
// subsystems a build step touches. Every scenario runs in its own fresh room.
//
// POLICY: every feature ships with a scenario here (add an area tag if none
// fits). If a scenario needs app state a script can't reach, add a hook to
// window.__diceDebug rather than scraping fragile DOM.

import { assert, Table } from './harness.mjs';

// Wait for a hidden roll's shrouded playback to land on a tab: the log line
// exists, the dice are on the felt, and nothing is still animating.
const shroudSettled = (rollId, dice = 1) =>
  `(window.__diceDebug.sim(120), !window.__diceDebug.busy`
  + ` && window.__diceDebug.shroudedCount === ${dice}`
  + ` && !!window.__diceDebug.entryState(${JSON.stringify(rollId)}))`;

// A revealed entry is settled once the flip animation is done.
const revealSettled = (rollId) =>
  `(window.__diceDebug.sim(120), window.__diceDebug.revealingCount === 0`
  + ` && window.__diceDebug.pendingReveals.length === 0`
  + ` && (window.__diceDebug.entryState(${JSON.stringify(rollId)}) || {}).hidden === false)`;

// ---------------------------------------------------------------------------
// The lobby → table flow (ROADMAP §3b, UX §7.20)
//
// The harness's newTable always appends ?room= — and the lobby is exactly the
// absence of it — so these helpers boot their own tabs. bootTab mirrors
// newTable's one-retry discipline (~1–2% of fresh headless tabs come up
// broken; see the harness note) and adds what lobby scenarios need:
//
//   clean/seed — applied ONCE, on the tab's first document only (guarded by a
//     sessionStorage flag). localStorage on a shared origin OUTLIVES
//     scenarios, so a lobby test states its starting storage instead of
//     inheriting an earlier scenario's — and the one-shot guard matters
//     because gotoTable()/leaveToLobby() NAVIGATE: init scripts re-run on the
//     next document, and a re-run seed of dice.name.v1 after leaveToLobby
//     would blind the exact assertion (name kept) leave-to-lobby makes, while
//     a re-run clean of dice.tables.v1 would wipe the recents entry the
//     round-trip scenario is returning through.
//
//   recordApi — every fetch()/EventSource url the document opens lands on
//     window.__apiCalls (per document, deliberately: a landed table SHOULD
//     have join traffic; the lobby document must have none — §3b L0 "does
//     not call connect() at all").
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootTab(ctx, {
  origin = 'localhost', path = '/', clean = [], seed = {}, recordApi = false,
  readyExpr, readyDesc,
} = {}) {
  for (let attempt = 0; ; attempt++) {
    const page = await ctx.browser.newPage();
    await page.addInitScript('window.__diceTestMode = true;');
    if (recordApi) {
      await page.addInitScript(`(() => {
        window.__apiCalls = [];
        const rec = (u) => { try { const s = String(u); if (s.includes('/api/')) window.__apiCalls.push(s); } catch { /* ignore */ } };
        const realFetch = window.fetch.bind(window);
        window.fetch = (u, ...rest) => { rec(u && u.url ? u.url : u); return realFetch(u, ...rest); };
        window.EventSource = new Proxy(window.EventSource, {
          construct(target, args) { rec(args[0]); return new target(...args); },
        });
      })();`);
    }
    const lines = [
      ...clean.map((k) => `localStorage.removeItem(${JSON.stringify(k)});`),
      ...Object.entries(seed).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`),
    ];
    if (lines.length) {
      await page.addInitScript(`try { if (!sessionStorage.getItem('__e2eSeeded')) {`
        + ` sessionStorage.setItem('__e2eSeeded', '1'); ${lines.join(' ')} } } catch { /* ignore */ }`);
    }
    const url = `http://${origin}:${ctx.port}${path}`;
    await page.navigate(url);
    const t = new Table(page, url);
    try {
      await t.waitFor(readyExpr, { desc: readyDesc || `tab ready (${origin}${path})`, timeout: 30000 });
    } catch (e) {
      if (attempt > 0) { ctx.tables.push(t); throw e; }
      console.log(`    (boot retry: ${String(e.message || e).slice(0, 100)})`);
      await t.close().catch(() => {});
      continue;
    }
    if (attempt === 0 && page.errors.length) {
      console.log(`    (boot retry: page exception on load — ${String(page.errors[0]).slice(0, 120)})`);
      await t.close().catch(() => {});
      continue;
    }
    ctx.tables.push(t);
    return t;
  }
}

// A tab in the LOBBY: the bare url, ready when the app itself says lobby.
const lobbyTab = (ctx, opts = {}) => bootTab(ctx, {
  recordApi: true,
  ...opts,
  path: '/',
  readyExpr: `!!window.__diceDebug && (window.__diceDebug.identity || {}).lobby === true`,
  readyDesc: `lobby up (${opts.origin || 'localhost'})`,
});

// A tab AT THIS SCENARIO'S TABLE via bootTab — for flows that later navigate
// and therefore need the one-shot seeding (newTable seeds per document).
// Callers still await t.waitOnline().
const tableTab = (ctx, opts = {}) => bootTab(ctx, {
  ...opts,
  path: `/?room=${encodeURIComponent(ctx.room)}`,
  readyExpr: `!!window.__diceDebug && window.__diceDebug.netReady`,
  readyDesc: `table tab up (${opts.origin || 'localhost'})`,
});

// gotoTable()/leaveToLobby() NAVIGATE (§3b L3: ROOM is a module const, so
// every table transition is a real page load) — evals die mid-flight, so
// poll under try/catch exactly as harness.reload does.
async function settleNavigation(t, expr, desc, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await t.eval(expr);
      if (last) return last;
    } catch { /* execution context torn down mid-navigation */ }
    await sleep(100);
  }
  throw new Error(`timeout waiting for: ${desc} (last: ${JSON.stringify(last)})`);
}

// Landed at a table: out of the lobby, online — resolves '?room=<key>'.
const landedAtTable = (t) => settleNavigation(
  t,
  `(!!window.__diceDebug && (window.__diceDebug.identity || {}).lobby === false)`
  + ` ? window.__diceDebug.netReady.then((r) => !!(r && r.online) && window.location.search)`
  + ` : false`,
  'the navigation to land at a table',
);

// Landed in the lobby: the bare url, and the app says lobby.
const landedInLobby = (t) => settleNavigation(
  t,
  `!!window.__diceDebug && (window.__diceDebug.identity || {}).lobby === true`
  + ` && window.location.search === ''`,
  'the navigation to land in the lobby',
);

// Drive the lobby's "+ New table" pill for real — open the rail menu, type
// the name, Create — and ride the navigation to the minted room.
async function createTableFromLobby(t, tableName) {
  await t.eval(`[...document.querySelectorAll('#rail-roster .rail-ghost')]
    .find((b) => b.textContent.includes('New table')).click()`);
  await t.waitFor(`!!document.querySelector('.rail-menu input.tin')`, { desc: 'the New table menu opens' });
  try {
    await t.eval(`(() => {
      document.querySelector('.rail-menu input.tin').value = ${JSON.stringify(tableName)};
      document.querySelector('.rail-menu .btn.confirm').click();
    })()`);
  } catch { /* the context can die inside the click — that IS the navigation */ }
  return landedAtTable(t);
}

export const scenarios = [
  {
    name: 'shared-roll',
    tags: ['smoke', 'roll'],
    // One shared truth: a roll made in one tab lands in both with identical
    // values, attribution, and interpretation (byte-equal log entries).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.roll('2d6+3[str] # Attack');
      await b.settle();
      await b.waitFor(`document.getElementById('log-list').childElementCount >= 1`, { desc: 'roll reaches tab B' });
      assert.equal(await a.diceCount(), 2, 'two dice on A');
      assert.equal(await b.diceCount(), 2, 'two dice on B');
      const [la, lb] = [await a.logTop(), await b.logTop()];
      assert.equal(la, lb, 'log entries identical across tabs');
      assert.ok(la.includes('Alice'), `roller attributed (got: ${la})`);
      assert.ok(la.includes('str'), `bonus attribution present (got: ${la})`);
    },
  },
  {
    name: 'post-roll-x',
    tags: ['smoke', 'roll'],
    // The roller's direct clear (UX §7.7.2): dice leave every table with no
    // shelf transit.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.roll('d20');
      await b.settle();
      const rid = await a.rollId();
      assert.ok(rid, 'roll has a rollId');
      assert.equal(await a.dbg(`clearRoll(${JSON.stringify(rid)})`), true, 'clear accepted');
      for (const t of [a, b]) {
        await t.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length === 0)`, { desc: 'dice cleared' });
        assert.equal((await t.shelf()).length, 0, 'nothing shelved');
      }
    },
  },
  {
    name: 'folded-card',
    tags: ['smoke', 'roll', 'chrome'],
    // The folded card + the hover read + the feed (Joe 2026-08-03): the
    // banner's BODY is the one big removal target (role-split: the roller
    // clears for everyone, a spectator dismisses locally), the fold below
    // holds REROLL/Reveal, hovering the card outlines the roll's dice per
    // source pool on the felt, and the draft well's feed warms with dice.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.roll('2d8[Wisdom]+1d4');
      await b.settle();

      // role split rides data-act; the fold exists on both
      assert.equal(await a.eval(`document.getElementById('result-banner').dataset.act`), 'clear',
        "the roller's body clears for everyone");
      assert.equal(await b.eval(`document.getElementById('result-banner').dataset.act`), 'dismiss',
        "a spectator's body dismisses locally");

      // the hover read: outlines per source pool, ivory for unsourced
      assert.equal(await a.dbg('hoverBanner(true)'), 3, 'three dice outline on hover');
      const colors = await a.dbg('outlineState');
      assert.equal(new Set(colors).size, 2, `Wisdom's color + ivory for the loose d4 (got: ${colors})`);
      assert.equal(colors[0], colors[1], 'the two Wisdom dice share their pool color');
      await a.dbg('hoverBanner(false)');
      assert.deepEqual(await a.dbg('outlineState'), [], 'outlines leave with the hover');

      // Bob's dismiss hides HIS card only; the dice stay for everyone
      await b.eval(`document.getElementById('banner-main').click()`);
      assert.ok(await b.eval(`document.getElementById('result-banner').classList.contains('hidden')`),
        'dismiss hides the spectator card');
      assert.ok((await b.eval(`window.__diceDebug.tableDice.length`)) > 0, 'the dice stay');
      assert.ok(!(await a.eval(`document.getElementById('result-banner').classList.contains('hidden')`)),
        "the roller's card stands");

      // the beacon, take two (the funnels retired — they fought the rail):
      // presence by SIZE and AIR, plus heat-driven light. The well stands
      // tall with margins; dice land larger inside it than in pool rows.
      assert.equal(await a.eval(`document.querySelectorAll('#draft-zone .feed').length`), 0,
        'the funnels are gone');
      assert.ok((await a.eval(
        `parseFloat(getComputedStyle(document.querySelector('.tray-line2 .tray-cluster')).minHeight)`)) >= 64,
        'the well stands tall');
      assert.ok((await a.eval(
        `parseFloat(getComputedStyle(document.getElementById('tray-actions')).marginTop)`)) >= 10,
        'and breathes above');
      const heatOf = `parseFloat(getComputedStyle(document.getElementById('draft-zone')).getPropertyValue('--draft-heat')) || 0`;
      const cold = await a.eval(heatOf);
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = '8d6';
        box.dispatchEvent(new Event('input'));
      })()`);
      await a.waitFor(`(${heatOf}) > ${cold}`, { desc: 'the well warms as dice land in the draft' });
      assert.ok(await a.eval(`document.getElementById('draft-zone').classList.contains('heat-4')`),
        'eight dice = full heat');
      // Headless renders no compositor frames, so CSS transitions FREEZE at
      // their start value — strip them before reading, so these assert the
      // cascade's TARGET (what a live browser animates to), not a frame
      // of an animation that cannot advance here.
      await a.eval(`document.querySelectorAll('.tray-roll .roll-cue, #tray-actions')
        .forEach((el) => { el.style.transition = 'none'; })`);
      assert.ok(await a.eval(
        `getComputedStyle(document.getElementById('tray-actions')).boxShadow.includes('255, 215, 102')`),
        'the well wears its gold under-glow at heat');
      assert.ok(await a.eval(
        `parseFloat(getComputedStyle(document.querySelector('.tray-roll .roll-cue')).opacity) > 0.5`),
        'the standing ROLL whisper gathers to a promise');
      assert.ok((await a.eval(
        `parseFloat(getComputedStyle(document.querySelector('.tray-roll .die-art')).width)`)) >= 34,
        'dice land LARGER in the well than in pool rows');
      // GHOST DICE: emptying the DRAFT (the Clear verb — box text alone
      // never unstages dice) reveals the ghost sockets + caption
      await a.eval(`document.getElementById('clear-tray').click()`);
      await a.waitFor(`!document.getElementById('tray-hint').classList.contains('hidden')`,
        { desc: 'the empty well shows its ghost' });
      // simpler won (Joe): the ghost is ONLY the quiet ROLL ❯❯❯ — the
      // dice-socket images were cut the same day (clutter, not invitation)
      assert.equal(await a.eval(`document.querySelectorAll('#tray-hint .wg-die').length`), 0,
        'no ghost dice images — the cue is the whole ghost');
      assert.ok(await a.eval(`(() => {
        const c = document.querySelector('#tray-hint .roll-cue');
        return !!c && c.textContent.includes('ROLL');
      })()`), 'the ghost ROLL ❯❯❯ previews the full well');

      // …and they REAPPEAR when the last die leaves by its ✕ (Joe: the
      // remove path re-renders before the box empties — the ghost's
      // visibility must read live state, not renderTray's snapshot)
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = '1d6';
        box.dispatchEvent(new Event('input'));
      })()`);
      await a.waitFor(`document.getElementById('tray-hint').classList.contains('hidden')`,
        { desc: 'a staged die hides the ghost' });
      await a.eval(`document.querySelector('#tray-x-layer .die-x').click()`);
      await a.waitFor(`!document.getElementById('tray-hint').classList.contains('hidden')`,
        { desc: 'removing the last die brings the ghost back' });

      // the roller's body click clears for EVERYONE
      await a.eval(`document.getElementById('banner-main').click()`);
      for (const t of [a, b]) {
        await t.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length === 0)`,
          { desc: 'the body click cleared the table' });
      }
    },
  },
  {
    name: 'collect-peek',
    tags: ['smoke', 'shelf'],
    // Collect moves a roll to the shelf on every table; peek recovers the
    // full result; clearing a collected roll empties the shelf everywhere.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      // Totals are sum-world machinery; the default system reads per-die
      // (Soul Deal). Pin the totals contract under a totals system.
      await a.dbg(`setSystem('dnd')`);
      await b.waitFor(`window.__diceDebug.system === 'dnd'`, { desc: 'system syncs' });
      await a.roll('d20+1');
      await b.settle();
      const rid = await a.rollId();
      const logText = await a.logTop();
      assert.equal(await a.dbg(`collectRoll(${JSON.stringify(rid)})`), true, 'collect accepted');
      for (const t of [a, b]) {
        await t.waitFor(
          `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
          { desc: 'roll shelved' },
        );
      }
      const peeked = await b.dbg(`peek(${JSON.stringify(rid)})`);
      assert.equal(peeked, rid, 'peek opens on B');
      const ps = await b.dbg('peekState');
      assert.ok(ps && ps.total, 'peek shows a total');
      assert.ok(logText.includes(ps.total.replace(/\D/g, '')), `peek total consistent with log (${ps.total} vs ${logText})`);
      await b.dbg('peek(null)');
      assert.equal(await a.dbg(`clearRoll(${JSON.stringify(rid)})`), true, 'clear collected accepted');
      for (const t of [a, b]) {
        await t.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 0)`, { desc: 'shelf cleared' });
      }
    },
  },
  {
    name: 'shelf-quiet',
    tags: ['smoke', 'shelf'],
    // Quiet by default (P1): a resting shelf marker is an INVISIBLE hover/tap
    // target — no dot, no total, no lens word, no tiny ✕, and a held roll
    // never shouts '?'. The settled cluster is its own presence; the detail
    // lives in the peek. THE ONE-✕ RULE (Joe, 2026-08-03): the clear target
    // is chosen by the gesture that opened the card — a hover-opened peek
    // carries NO ✕ (the marker's sweep dress is the big red one; clicking
    // the cluster clears), a tap-opened peek carries the base ✕ (touch has
    // no hover to dress the circle). Exactly one affordance at a time; both
    // paths clear for everyone, from any seat (§7.7 universal housekeeping).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.roll('d20 dc 10');
      await b.settle();
      const rid = await a.rollId();
      assert.equal(await a.dbg(`collectRoll(${JSON.stringify(rid)})`), true, 'collect accepted');
      for (const t of [a, b]) {
        await t.waitFor(
          `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
          { desc: 'roll shelved' },
        );
      }
      const markers = await b.dbg('shelfMarkers');
      assert.equal(markers.length, 1, 'one resting marker');
      const m = markers[0];
      assert.equal(m.rollId, rid, 'marker addresses its roll');
      assert.equal(m.bare, true, 'resting marker draws nothing at all');
      assert.equal(m.text.trim(), '', 'no text on the resting marker');
      assert.equal(m.hasTotal, false, 'no always-on total');
      assert.equal(m.hasX, false, 'no tiny ✕');
      assert.ok(m.width >= 24 && m.height >= 24, `an easy target (${m.width}×${m.height})`);

      // THE FOLDED CARD, shelf edition (2026-08-03 — supersedes the three-
      // leg one-✕ walk): ONE grammar in every modality. The marker only
      // OPENS the card; the card's BODY is the one big clear target; the
      // fold below holds the other verbs; no ✕ and no sweep exist at all.
      assert.equal(await b.dbg(`peek(${JSON.stringify(rid)})`), rid, 'peek opens');
      const ps = await b.dbg('peekState');
      assert.ok(ps.total, 'the peek shows the total');
      assert.equal(ps.hasMain, true, 'the body clear target stands');
      assert.equal(ps.hasFold, true, 'the fold stands under it');
      assert.equal(ps.hasClear, false, 'no card ✕ anywhere — the body is the target');
      assert.equal((await b.dbg('shelfMarkers'))[0].hasSweep, false,
        'no ✕ over the dice — the sweep dress is retired');
      await b.dbg('peek(null)');

      // The marker's click OPENS the card now (it never clears directly).
      await b.eval(`document.querySelector('#shelf-layer .shelf-marker').click()`);
      assert.equal((await b.dbg('peekState') || {}).rollId, rid, 'a marker click opens its card');
      assert.equal((await b.dbg('shelf')).length, 1, 'and clears nothing by itself');

      // The BODY click clears for everyone.
      await b.eval(`document.querySelector('#peek-card .pk-main').click()`);
      for (const t of [a, b]) {
        await t.waitFor(
          `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 0 && window.__diceDebug.tableDice.length === 0)`,
          { desc: 'the body click clears the roll for everyone' },
        );
      }

      // A held roll rests exactly as quiet: nothing drawn, never '?'; its
      // Reveal waits in the peek for the authority.
      await a.roll('d20 held');
      const hid = await a.rollId();
      await a.dbg(`collectRoll(${JSON.stringify(hid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'held roll shelved' },
      );
      const hm = (await a.dbg('shelfMarkers'))[0];
      assert.equal(hm.bare, true, 'a held roll rests just as quiet');
      assert.ok(!hm.text.includes('?'), 'the marker never shouts ?');
      assert.equal(await a.dbg(`peek(${JSON.stringify(hid)})`), hid, 'peek opens for the authority');
      assert.equal((await a.dbg('peekState')).hasReveal, true, 'Reveal lives in the peek');
    },
  },
  {
    name: 'shelf-actions',
    tags: ['shelf'],
    // A shelved roll stays actionable: the peek's REROLL strip (the cue
    // SAYS reroll — B2) rolls the SAME dice again — the shelved cluster
    // clears as part of the reroll (a pool is how you mint a copy) — and
    // RIGHT-CLICK on the cluster opens the tweak popover, dc/mods/comment
    // intact (the card ± retired 2026-08-01).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setSystem('dnd')`); // dc verdicts are totals-world (solo: applies instantly)
      await a.roll('2d6+3 dc9');
      const rid = await a.rollId();
      await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'roll shelved' },
      );
      assert.equal(await a.dbg(`peek(${JSON.stringify(rid)})`), rid, 'peek opens');
      const ps = await a.dbg('peekState');
      assert.equal(ps.hasAgain, true, 'the peek carries the reroll strip');
      assert.equal(ps.cueWord, 'REROLL', 'and its cue word SAYS reroll (never plain ROLL)');
      assert.equal(ps.hasTweak, false, 'the card ± is retired');
      // The folded card: no ✕ exists in any modality — the body clears.
      assert.equal(ps.hasClear, false, 'no card ✕ — the body is the clear target');
      assert.equal(ps.hasMain && ps.hasFold, true, 'body over fold, like the banner');

      // ⟳ REPLACES: the old cluster leaves the shelf, the same spec rolls.
      await a.eval(`document.querySelector('#peek-card .pk-again').click()`);
      await a.settle();
      const rid2 = await a.rollId();
      assert.ok(rid2 && rid2 !== rid, 'a new roll landed from ⟳');
      assert.ok((await a.logTop()).includes('vs 9'), 'the dc rode along');
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 0)`,
        { desc: 'the rerolled cluster left the shelf — same dice, not a copy' },
      );

      // ±: a shelved roll's notation lands in the draft with the popover
      // bound to it (collect the fresh roll to peek it).
      await a.dbg(`collectRoll(${JSON.stringify(rid2)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'the reroll shelves for the ± leg' },
      );
      assert.equal(await a.dbg(`peek(${JSON.stringify(rid2)})`), rid2, 'peek opens on the reroll');
      await a.eval(`document.querySelector('.shelf-marker')
        .dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}))`);
      const pop = await a.dbg('popover');
      assert.ok(pop && pop.open, '± opens the ± popover IN PLACE');
      assert.equal(pop.source, 'shelf', 'bound to the shelved roll, no teleport');
      assert.equal(String(pop.dc), '9', 'the dc rides in');
      assert.ok((await a.dbg('peekState')) !== null, 'the peek pins while its popover lives');

      // Esc peels the popover first, the card next (z order honored).
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
      assert.equal(await a.dbg('popover'), null, 'Esc closes the shelf popover first');
      assert.ok((await a.dbg('peekState')) !== null, 'the peek survives that Esc');

      // Trigger Pass: the shelf popover never rolls — its tweak travels to
      // the draft ('Open in draft') and rolls from ROLL ❯❯❯ like everything.
      await a.eval(`document.querySelector('.shelf-marker')
        .dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}))`);
      assert.equal(await a.eval(`!!document.getElementById('pop-roll')`), false,
        'the popover has no Roll button (pure editor)');
      const tweakCanon = (await a.dbg('popover')).canonical;
      await a.eval(`document.getElementById('pop-todraft').click()`);
      assert.equal(await a.dbg('popover'), null, 'Open in draft closes the popover');
      assert.equal(await a.eval(`document.getElementById('cmd-input').value`), tweakCanon,
        'the tweak landed in the draft as its canonical');
      const logN = await a.logCount();
      await a.eval(`window.__diceDebug.commandRoll(document.getElementById('cmd-input').value)`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), document.getElementById('log-list').childElementCount > ${logN})`,
        { desc: 'the tweak rolled from the draft trigger' },
      );
    },
  },
  {
    name: 'auto-collect',
    tags: ['shelf'],
    // A new roll auto-collects the previous uncollected one — the table
    // holds one live roll; history lives on the shelf.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.roll('d20');
      await a.roll('2d6');
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'first roll auto-collected' },
      );
      assert.equal(await a.diceCount(), 2 + 1, 'second roll live (2 dice) + first shelved (1 die)');
    },
  },
  {
    name: 'shelf-cap',
    tags: ['shelf'],
    timeout: 180000,
    // The shelf holds SHELF_CAP rolls; the oldest is evicted FIFO; occupied
    // clusters compact left-to-right in seq order.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      for (let i = 0; i < 6; i++) {
        await a.roll('d6');
        const rid = await a.rollId();
        await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
        await a.waitFor(
          `(window.__diceDebug.sim(240), window.__diceDebug.whiskingCount === 0 && window.__diceDebug.pendingCollects.length === 0)`,
          { desc: `collect #${i + 1} settles` },
        );
      }
      const shelf = await a.shelf();
      assert.equal(shelf.length, 5, 'shelf capped at 5');
      const seqs = shelf.map((c) => c.seq);
      assert.deepEqual([...seqs].sort((x, y) => x - y), seqs, 'shelf getter sorted by seq');
      assert.equal(Math.min(...seqs), 2, 'oldest (seq 1) evicted');
      const slots = shelf.map((c) => c.slot);
      assert.deepEqual(slots, [0, 1, 2, 3, 4], 'compacted left-to-right in seq order');
    },
  },
  {
    name: 'shelve-clear-no-chip-leak',
    tags: ['shelf', 'perf'],
    // Tier 0e endurance: the shelf marker sinks on its OWN record — it must
    // not overwrite a die's chip ref, or the die's chip leaks into
    // #chips-layer forever. Two full shelve+clear cycles catch the per-cycle
    // accumulation the old ternary would have hidden on a single pass.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      assert.equal(await a.dbg('setChipsVisible(true)'), true, 'chips visible for the leak surface');
      for (let cycle = 0; cycle < 2; cycle++) {
        await a.roll('2d6');
        const rid = await a.rollId();
        assert.equal(await a.dbg(`collectRoll(${JSON.stringify(rid)})`), true, `collect #${cycle + 1}`);
        await a.waitFor(
          `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
          { desc: `shelve cycle ${cycle + 1}` },
        );
        assert.equal(await a.dbg(`clearRoll(${JSON.stringify(rid)})`), true, `clear #${cycle + 1}`);
        // CLEAR_SINK_S = 0.3 s (main.js §7.5); sim generously past that to
        // let stepSinking's filter drop every finished record.
        await a.waitFor(
          `(window.__diceDebug.sim(600), window.__diceDebug.shelf.length === 0`
            + ` && window.__diceDebug.tableDice.length === 0`
            + ` && window.__diceDebug.sinkingCount === 0)`,
          { desc: `cycle ${cycle + 1} sinks drained` },
        );
        const chipDom = await a.eval(`document.getElementById('chips-layer').childElementCount`);
        assert.equal(chipDom, 0,
          `#chips-layer emptied after cycle ${cycle + 1} (got ${chipDom} stranded — the shelf marker stole a die's chip ref)`);
      }
      // Put the preference back. 'dice.chips.v1' is per-origin localStorage
      // and OUTLIVES this room, so leaving chips on hands the next localhost
      // scenario a table it did not ask for — chips-quiet-default is the very
      // next one and asserts the default is OFF. A scenario that flips a
      // stored preference owns restoring it.
      assert.equal(await a.dbg('setChipsVisible(false)'), false, 'the preference is restored');
    },
  },
  {
    name: 'chips-quiet-default',
    tags: ['smoke', 'roll'],
    // Quiet by default (P1): the floating die numbers are opt-in. Results
    // stay readable without them (the log line still carries the total); the
    // 'Show numbers on dice' preference paints chips for the roll on the felt
    // and clears them again on the spot.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      assert.equal(await a.dbg('chipsVisible'), false, 'chips default off');
      await a.dbg(`setSystem('dnd')`); // totals-world: this pins numeric readability sans chips
      await a.roll('2d6+1');
      assert.equal(await a.dbg('chipCount'), 0, 'no chip records');
      assert.deepEqual(await a.chips(), [], 'no chip DOM either');
      const total = (await a.entryState()).total;
      assert.ok((await a.logTop()).includes(String(total)),
        'the result is still readable in the log');
      assert.ok(await a.eval(`!document.getElementById('result-banner').classList.contains('hidden')`),
        'and on the banner');
      assert.equal(await a.dbg('setChipsVisible(true)'), true, 'chips switch on');
      assert.equal(await a.dbg('chipCount'), 2, 'chips appear for the roll on the felt');
      assert.equal((await a.chips()).length, 2, 'one chip per die');
      assert.equal(await a.dbg('setChipsVisible(false)'), false, 'and off again');
      assert.deepEqual(await a.chips(), [], 'chips leave immediately');
    },
  },
  {
    name: 'layer-scale',
    tags: ['smoke', 'roll'],
    // The one layer scale (P2): the ceremony/verdict layer renders ABOVE the
    // ambient table labels (value chips, shelf markers) and the banner, and
    // the crit overlay tops the whole roll moment — a verdict card is never
    // occluded by a floating die number.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const z = (id) => a.eval(
        `parseInt(getComputedStyle(document.getElementById('${id}')).zIndex, 10)`,
      );
      const [ceremony, chips, shelf, banner, crit, offers] = [
        await z('ceremony-layer'), await z('chips-layer'), await z('shelf-layer'),
        await z('result-banner'), await z('crit-overlay'), await z('offers-layer'),
      ];
      assert.ok(ceremony > chips, `ceremony above value chips (${ceremony} vs ${chips})`);
      assert.ok(ceremony > shelf, `ceremony above shelf markers (${ceremony} vs ${shelf})`);
      assert.ok(ceremony > banner, `ceremony above the banner (${ceremony} vs ${banner})`);
      assert.ok(offers > ceremony, `offers stay claimable over a ceremony (${offers} vs ${ceremony})`);
      assert.ok(crit > offers, `the crit overlay tops the moment (${crit} vs ${offers})`);
    },
  },
  {
    name: 'settings-sync',
    tags: ['smoke', 'settings'],
    // Room settings are one shared truth: felt and interpretation system
    // changes propagate to every table.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      assert.equal(await b.dbg('felt.id'), 'obsidian', 'obsidian is the default felt');
      await a.dbg(`setSystem('dnd')`);
      await b.waitFor(`window.__diceDebug.system === 'dnd'`, { desc: 'system syncs to B' });
      await a.dbg(`setFelt('emerald')`);
      await b.waitFor(`window.__diceDebug.felt.id === 'emerald'`, { desc: 'felt syncs to B' });
      // The exploration themes are valid room state end-to-end (client list
      // and the server's validator move together).
      await a.dbg(`setFelt('ocean')`);
      await b.waitFor(`window.__diceDebug.felt.id === 'ocean'`, { desc: 'a new theme syncs to B' });
    },
  },
  {
    name: 'ceremony-retire',
    tags: ['roll', 'ceremony'],
    // THE FLOW TO COLLECTED (Joe 2026-08-04: 'cinematics have too many
    // stages… no ✕ and Done — just flow to collected'): the ceremony's
    // verdict card is a FOLDED CARD — its BODY is the role-split clear
    // target (the normal-reveal grammar), the fold holds REROLL/Reveal —
    // and its clock hands the roll STRAIGHT to the shelf. The banner
    // stage between card and shelf is gone; a hidden card stands until
    // its reveal.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      // Race-proof staging: back-to-back ceremonies can read the PREVIOUS
      // roll's phase:'done' before the new roll's SSE arrives — gate on
      // the roll id changing first, then skip the new moment through.
      const staged = async (prev) => {
        await a.waitFor(
          `((window.__diceDebug.currentRoll || {}).rollId || null) !== ${JSON.stringify(prev)}`
          + ` && !!(window.__diceDebug.currentRoll || {}).ceremony`,
          { desc: 'the new ceremony arrived' },
        );
        await a.waitFor(
          `(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(30), (window.__diceDebug.ceremonyState || {}).phase === 'done')`,
          { desc: 'verdict staged' },
        );
      };

      await a.dbg(`commandRoll('d20 check dc10')`);
      await staged(null);
      const rid1 = await a.rollId();
      // the card family: no Done, no ✕ — the body is the one big target
      assert.equal(await a.eval(`!!document.querySelector('#verdict-card .clear-x')`), false,
        'no ✕ on the ceremony card');
      assert.ok(!(await a.eval(
        `[...document.querySelectorAll('#verdict-card button')].some((b) => b.textContent === 'Done')`,
      )), 'no Done either — the clock owns the idle path');
      assert.equal(await a.eval(`document.getElementById('verdict-card').dataset.act`), 'clear',
        "the roller's body act is CLEAR");
      assert.ok(await a.eval(`!!document.querySelector('#verdict-fold .pk-strip')`),
        'the REROLL strip waits in the fold');
      // the handoff flows to COLLECTED — never through the banner
      assert.equal(await a.dbg('retireCeremony()'), true, 'the handoff fires');
      await a.waitFor(
        `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'flowed straight to the shelf' },
      );
      assert.ok(await a.eval(`document.getElementById('result-banner').classList.contains('hidden')`),
        'no banner stage in between');
      assert.ok(await a.eval(`document.getElementById('ceremony-layer').classList.contains('hidden')`),
        'the card retired with the flow');

      // the early out: the BODY clears for everyone (normal-reveal grammar)
      await a.dbg(`commandRoll('d20 check dc10')`);
      await staged(rid1);
      const rid2 = await a.rollId();
      await a.eval(`document.getElementById('verdict-main').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(160), window.__diceDebug.tableDice.filter((d) => d.rollId === ${JSON.stringify(rid2)}).length === 0)`,
        { desc: 'cleared from the card body' },
      );
      assert.equal(await a.dbg('shelf.length'), 1, 'a body-cleared roll never shelves');

      // a HIDDEN card stands — the flow waits on the reveal (tension rule)
      await a.dbg(`commandRoll('d20 check held')`);
      await staged(rid2);
      assert.equal(await a.dbg('retireCeremony()'), false, 'a hidden card stands');
      assert.ok(!(await a.eval(`document.getElementById('ceremony-layer').classList.contains('hidden')`)),
        'still standing');
      await a.eval(`document.querySelector('#verdict-fold .reveal-verb').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(160), !!(window.__diceDebug.entryState() || {}).revealed)`,
        { desc: 'revealed' },
      );
      assert.equal(await a.dbg('retireCeremony()'), true, 'the revealed card flows');
      await a.waitFor(
        `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 2 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'the revealed roll shelved' },
      );
    },
  },
  {
    name: 'floor-texture-persistent',
    tags: ['smoke', 'perf', 'themes'],
    // Tier 0 §0 (hot-paths): the floor's texture identity is permanent —
    // recompositeFelt, applyFeltTheme, applyZoom, applyMatDecal, and the
    // corner sweep all repaint the same CanvasTexture in place and flip
    // needsUpdate. A collect→theme→zoom→clear sweep must NOT allocate a
    // fresh texture (that was the old swapFloorMap dispose+new churn).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const uuid0 = await a.dbg('floorTextureId()');
      assert.ok(typeof uuid0 === 'string' && uuid0.length > 0,
        'boot paints the persistent texture and it has a uuid');
      // A roll + collect triggers the whisk-landing recomposite (glow rings
      // paint in place); the uuid must not change.
      await a.roll('d20');
      const rid = await a.rollId();
      assert.equal(await a.dbg(`collectRoll(${JSON.stringify(rid)})`), true, 'collect accepted');
      await a.waitFor(
        `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'roll shelved (whisk-landing recomposite fired)' },
      );
      assert.equal(await a.dbg('floorTextureId()'), uuid0,
        'the persistent texture survives whisk-landing recomposite');
      // applyFeltTheme repaints on the new base — same texture.
      assert.equal(await a.dbg(`setFelt('emerald')`), true, 'theme swap accepted');
      assert.equal(await a.dbg('floorTextureId()'), uuid0,
        'the persistent texture survives an applyFeltTheme repaint');
      // applyZoom re-places the shelf and recomposites — same texture.
      await a.dbg(`setZoom('close')`);
      await a.waitFor(`window.__diceDebug.zoom === 'close'`, { desc: 'zoom took' });
      assert.equal(await a.dbg('floorTextureId()'), uuid0,
        'the persistent texture survives an applyZoom recomposite');
      // Clearing the shelved roll triggers reflowShelf's recomposite — same
      // texture again.
      assert.equal(await a.dbg(`clearRoll(${JSON.stringify(rid)})`), true, 'clear accepted');
      await a.waitFor(
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 0 && window.__diceDebug.tableDice.length === 0)`,
        { desc: 'shelf empty (reflowShelf recomposite fired)' },
      );
      assert.equal(await a.dbg('floorTextureId()'), uuid0,
        'the persistent texture survives a shelf-clear recomposite');
    },
  },
  {
    name: 'per-die-read',
    tags: ['smoke', 'meanings'],
    // THE SOUL DEAL READ (author-confirmed): dice never sum. Under the
    // default system a roll shows per-die outcome words and NO total or DC
    // verdict; switching the room to a totals system re-reads the same log
    // (interpretation is a render-time lens).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.roll('2d4');
      assert.equal(await a.eval(`getComputedStyle(document.getElementById('result-total')).display`),
        'none', 'no big total under a per-die system');
      assert.ok((await a.eval(`document.getElementById('result-meaning').textContent`)).length > 0,
        'the outcome tally (or a quiet roll) takes the hero slot');
      assert.equal(await a.eval(`document.querySelector('#log-list .log-total').textContent.trim()`),
        '', 'the log carries no total either');

      // DC is totals-world: it never renders under the per-die read.
      await a.roll('d20 dc15');
      assert.ok(!(await a.logTop()).includes('vs 15'), 'no DC verdict under per-die');

      // The lens re-reads in place: switch to a totals system, numbers return.
      await a.dbg(`setSystem('dnd')`);
      await a.waitFor(`document.querySelector('#log-list .log-total').textContent.trim().length > 0`,
        { desc: 'totals return under dnd' });
      assert.ok((await a.logTop()).includes('vs 15'), 'and the DC verdict with them');

      // The ± popover folds the sum-world sections under a per-die system —
      // modifiers/pairing/Target/keep-drop AND reroll/exploding, with no
      // note and no disclosure (Joe 2026-08-06; supersedes 'Show anyway').
      await a.dbg(`setSystem('soul-deal')`);
      await a.waitFor(`window.__diceDebug.system === 'soul-deal'`, { desc: 'per-die lens back' });
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = '2d6';
        box.dispatchEvent(new Event('input'));
      })()`);
      await a.dbg(`openPopoverFor('tray')`);
      const secVisible = `[...document.querySelectorAll('#mods-popover .sec-sum, #mods-popover .prow-sum')]
        .some((el) => el.offsetParent !== null)`;
      assert.equal(await a.eval(secVisible), false, 'sum-world sections fold under per-die');
      assert.equal(await a.eval(`document.getElementById('pop-sw-reroll').offsetParent !== null`),
        false, 'reroll folds with them');
      assert.equal(await a.eval(`document.getElementById('pop-sw-explode').offsetParent !== null`),
        false, 'exploding too');
      assert.equal(await a.eval(`document.getElementById('pop-sysnote') === null`), true,
        'the note is gone, not merely hidden');
      await a.dbg('closePopover()');
      await a.dbg(`setSystem('dnd')`);
      // the system echo-applies (settings round-trip) — wait before opening
      await a.waitFor(`window.__diceDebug.system === 'dnd'`, { desc: 'dnd lens applied' });
      await a.dbg(`openPopoverFor('tray')`);
      assert.equal(await a.eval(secVisible), true, 'a totals system shows them by default');
      assert.equal(await a.eval(`document.getElementById('pop-sw-reroll').offsetParent !== null`),
        true, 'reroll rides the totals world');
      // per-source commit chrome has real display rules (no global .hidden
      // here): a pool popover shows Save but never Open in draft
      assert.equal(await a.eval(`document.getElementById('pop-todraft').offsetParent !== null`),
        false, 'Open in draft stays shelf-only');
      await a.dbg('closePopover()');
      await a.dbg(`setSystem('soul-deal')`);
    },
  },
  {
    name: 'source-read',
    tags: ['smoke', 'meanings', 'groups'],
    // 2b-⑤: results answer per POOL. The notation carries the attribution
    // (`2d8[Wisdom]`); breakdown, tally and log group by those labels, and
    // the grouping survives a lens switch — it is attribution, not
    // interpretation.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.roll('2d8[Wisdom]+1d4[Zeal]+1d6 # Hunt');

      // 2e: the breakdown line FOLDS under per-die \u2014 the outcome rows carry
      // every source and face, so the old duplicate line must NOT render.
      assert.equal(await a.eval(`document.getElementById('result-breakdown').textContent`), '',
        'no duplicate breakdown line under per-die');

      // the hero answers per pool as ROWS (2e; soul-deal is the default lens)
      const tallySrcs = await a.eval(
        `[...document.querySelectorAll('#result-meaning .tally-src')].map((el) => el.textContent.trim())`);
      assert.deepEqual(tallySrcs, ['Wisdom', 'Zeal'], `rows grouped by pool (got: ${tallySrcs})`);
      assert.equal(await a.eval(
        `document.querySelectorAll('#result-meaning .tally-group').length`), 3,
        'the unsourced d6 answers in its own plain row');

      // the log line reads the same way
      const logLabels = await a.eval(
        `[...document.querySelectorAll('#log-list .log-detail .log-part-label')].map((el) => el.textContent)`);
      assert.deepEqual(logLabels, ['Wisdom', 'Zeal'], `log grouped by pool (got: ${logLabels})`);

      // the read lives in the TEXT layer, row by row: each pool row leads
      // with its label and carries the die evidence beside each word \u2014
      // copy/paste and screen readers keep the whole per-die story
      const rows = await a.eval(
        `[...document.querySelectorAll('#result-meaning .outcome-row')].map((el) => el.textContent.trim())`);
      assert.equal(rows.length, 3, 'one row per pool');
      assert.ok(rows[0].startsWith('Wisdom') && /d8 \d/.test(rows[0]),
        `the row leads with its pool and carries evidence (got: ${JSON.stringify(rows)})`);
      assert.ok(/d6 \d/.test(rows[2]), 'the plain row still shows its die and face');

      // ± Save rewrites a composed pool WITHOUT stripping its [labels]
      // (regression: popSpec dropped sources, so the by-id write destroyed
      // them). Save = the one commit verb since the Trigger Pass.
      await a.dbg(`setGroups([{name: 'Hunt', notation: '2d8[Wisdom]+1d4[Zeal]'}])`);
      const hunt = (await a.dbg('groups'))[0];
      await a.dbg(`openPopoverFor(${JSON.stringify(hunt.id)})`);
      await a.eval(`(() => {
        const dc = document.getElementById('pop-dc');
        dc.value = '12';
        dc.dispatchEvent(new Event('input'));
      })()`);
      await a.eval(`document.getElementById('pop-save').click()`);
      const upd = (await a.dbg('groups'))[0];
      assert.ok(upd.notation.includes('[Wisdom]') && upd.notation.includes('[Zeal]')
        && upd.notation.includes('dc12'),
        `Save kept the labels beside the tweak (got: ${upd.notation})`);

      // a lens switch keeps the grouping and returns the total. The gate is
      // the SYSTEM id — the old total-text wait passed trivially (textContent
      // is set even while display:none), so the assertion used to read
      // stale soul-deal paint; the 2e fold exposed it.
      await a.dbg(`setSystem('dnd')`);
      await a.waitFor(`window.__diceDebug.system === 'dnd'`, { desc: 'dnd lens applied' });
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('result-total')).display !== 'none'`), true,
        'the big total returns under dnd');
      const dndLabels = await a.eval(
        `[...document.querySelectorAll('#result-breakdown .log-part-label')].map((el) => el.textContent.trim())`);
      assert.deepEqual(dndLabels, ['Wisdom', 'Zeal'], 'attribution survives the sum world');
      await a.dbg(`setSystem('soul-deal')`);
    },
  },
  {
    name: 'ledger-read',
    tags: ['smoke', 'meanings'],
    // 2i-A THE LEDGER: sourced per-die reads share ONE label column (the
    // grid), each row's chips live in their own cell (structural hanging
    // indent), the evidence/word gap is layout while the string keeps its
    // space, silence is marked exactly once (dash beside worded dice XOR
    // the pool's 'quiet'), one-die rolls read at hero scale, and the empty
    // verdict ring folds under per-die.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.roll('2d8[Wisdom]+1d10[Sword]+1d6[Peer Respect]');

      // the shared column: a sourced read turns the container to the grid
      assert.ok(await a.eval(
        `document.getElementById('result-meaning').classList.contains('oc-ledger')`),
        'sourced rows share the ledger grid');
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('result-meaning')).display`), 'grid');
      assert.equal(await a.eval(
        `document.querySelectorAll('#result-meaning .outcome-row').length`), 3,
        'one row per pool (the unsourced d6 keeps its own)');
      assert.equal(await a.eval(
        `[...document.querySelectorAll('#result-meaning .outcome-row')]
          .every((r) => r.querySelectorAll(':scope > .oc-cell').length === 1)`), true,
        'each row seats its chips in ONE cell — the hanging indent is structural');

      // chip fusion (S5): the gap is layout; the copyable space survives
      assert.equal(await a.eval(
        `getComputedStyle(document.querySelector('#result-meaning .oc-chip')).columnGap`),
        '5px', 'the evidence/word gap lives in layout, never in the string');
      const wordChipText = await a.eval(`(() => {
        const c = [...document.querySelectorAll('#result-meaning .oc-chip')]
          .find((el) => el.querySelector('.oc-word'));
        return c ? c.textContent : null;
      })()`);
      if (wordChipText) {
        assert.ok(/^d\d+ \d+ \S/.test(wordChipText),
          `the chip's text layer keeps its spaces (got: ${JSON.stringify(wordChipText)})`);
      }

      // quiet grammar (S4, adjusted): dash and 'quiet' never mark together
      assert.equal(await a.eval(
        `[...document.querySelectorAll('#result-meaning .outcome-row')].every((r) => {
          const quietWord = r.querySelectorAll('.tally-quiet').length;
          if (quietWord) return !r.querySelector('.oc-dash') && !r.querySelector('.oc-word');
          return [...r.querySelectorAll('.oc-chip')].every((c) =>
            c.querySelector('.oc-word') ? !c.querySelector('.oc-dash')
              : c.textContent.includes('—'));
        })`), true, 'silence is marked exactly once — dash per die XOR quiet per pool');

      // one-die rolls read at hero scale (S3)
      await a.roll('1d8[Omen]');
      assert.ok(await a.eval(
        `!!document.querySelector('#result-meaning .outcome-row.oc-solo')`),
        'a one-die roll wears the hero dress');

      // the empty verdict ring folds under per-die (2i-B); a totals lens
      // brings it back on the standing card (the relit repaint)
      await a.dbg(`commandRoll('2d8[Wisdom]+1d10[Sword] check # Steady the Rope | crossing')`);
      await a.waitFor(
        `(window.__diceDebug.sim(30), ['declare','tumble'].includes((window.__diceDebug.ceremonyState || {}).phase))`,
        { desc: 'ceremony declared' },
      );
      // 2i-B: the declaration reads its POOLS — sources ride the intent line
      assert.ok((await a.eval(`document.getElementById('intent-notation').textContent`))
        .includes('[Wisdom]'), 'the intent card declares the pool names');
      await a.waitFor(
        `(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(30), (window.__diceDebug.ceremonyState || {}).phase === 'done')`,
        { desc: 'verdict staged' },
      );
      assert.equal(await a.eval(
        `getComputedStyle(document.querySelector('#verdict-card .ring-wrap')).display`),
        'none', 'the empty ring folds — the rows are the verdict');
      assert.ok(await a.eval(
        `document.getElementById('verdict-hero').classList.contains('verdict-outcomes')`),
        'the outcome rows hold the card’s center');
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('verdict-hero')).display`), 'grid',
        'the ledger grid ENGAGES on the ceremony card (computed display is the contract — the hero slot’s own flex once silently won)');
      // 2i-B: the card's chips never SHOUT (no inherited uppercase). The
      // row's blanket rest-dim retired 2026-08-07: each verb carries its own
      // state now, because a blanket also dimmed the primary act, which
      // under the named-verb rule must stand.
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('verdict-hero')).textTransform`),
        'none', 'the shared chips keep their lowercase evidence identity');
      const vActs = await a.dbg(`cardActs('verdict')`);
      assert.equal(vActs.primary.opacity, '1', 'the verdict primary stands — it is the main act');
      assert.equal(vActs.reroll.opacity, '0.45', 'the REROLL strip still rests dim beside it');
      // 2i-C ONE card family: the fold's REROLL strip comes from the same
      // builder as the banner's/peek's; the static ⟳ is gone for good
      assert.ok(await a.eval(`!!document.querySelector('#verdict-fold .pk-strip')`),
        'the verdict card rerolls through the one built strip');
      assert.ok((await a.eval(
        `document.querySelector('#verdict-fold .pk-strip').textContent`)).includes('REROLL'),
        'and the strip speaks the reroll vocabulary');
      assert.equal(await a.eval(`document.getElementById('verdict-again')`), null,
        'the static verdict ⟳ is retired');
      await a.dbg(`setSystem('dnd')`);
      await a.waitFor(
        `getComputedStyle(document.querySelector('#verdict-card .ring-wrap')).display !== 'none'`,
        { desc: 'the ring returns under a totals lens' },
      );
      await a.dbg('retireCeremony()');
      await a.dbg(`setSystem('soul-deal')`);
    },
  },
  {
    name: 'panel-anatomy',
    tags: ['chrome', 'settings'],
    // THE QUIET NAMEPLATE + THE REGION HEAD (the anatomy pass, Joe
    // 2026-08-04): the table is nameable room-wide (settings channel);
    // the rail plate renders the name AS TYPED (content, not chrome),
    // falls back to a chosen ?room= key, and NEVER shows a placeholder;
    // document.title carries the name; SAVED POOLS heads the pools
    // region on YOUR rack and yields to the owner banner on a foreign
    // one — one head per state.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });

      // the fallback: this room's key is non-default, so the plate shows
      // it (a chosen key IS a chosen name) — never the word 'table'
      const plate = () => a.eval(`(() => {
        const el = document.getElementById('table-name');
        return { text: el.textContent, shown: getComputedStyle(el).display !== 'none' };
      })()`);
      assert.equal((await plate()).shown, true, 'a chosen room key shows as the name');

      // Bob names the table through the real settings input; Alice sees
      // it — room-wide, echo-applied, AS TYPED (never uppercased by JS)
      await b.eval(`(() => {
        const i = document.getElementById('set-table-name');
        i.value = 'Friday Crew';
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`);
      await a.waitFor(
        `document.getElementById('table-name').textContent === 'Friday Crew'`,
        { desc: 'the name reaches the other seat' },
      );
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('table-name')).textTransform`),
        'none', 'the name is content — rendered as typed');
      assert.equal(await a.eval(`document.title`), 'Friday Crew — Dice Table',
        'the tab title carries the identity');

      // clearing the name falls back to the key — the plate never goes
      // placeholder, and the title returns to the app name
      await b.eval(`(() => {
        const i = document.getElementById('set-table-name');
        i.value = '';
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`);
      await a.waitFor(
        `document.getElementById('table-name').textContent !== 'Friday Crew'`,
        { desc: 'the name clears' },
      );
      assert.equal((await plate()).shown, true, 'the chosen key stands back in');

      // the pools region head: SAVED POOLS on YOUR rack…
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('pools-head')).display`),
        'flex', 'SAVED POOLS heads your rack');
      assert.equal(await a.eval(
        `document.querySelector('#pools-head .ph-word').textContent`), 'Saved pools');
      // …and it SWAPS identity on a foreign rack — one head, one dress,
      // two states (teammate consolidation 2026-08-04; supersedes the
      // retired .pools-owner-banner which was a second surface for the
      // same fact). The rail's teammate pill IS the way back — press again.
      const bobId = await b.playerId();
      await a.dbg(`setPoolsOwner(${JSON.stringify(bobId)})`);
      await a.waitFor(
        `document.getElementById('pools-head').classList.contains('foreign')`,
        { desc: 'the head enters foreign state' },
      );
      assert.equal(await a.eval(
        `document.querySelector('#pools-head .ph-word').textContent`), "Bob's pools",
        'the region head names the teammate');
      assert.equal(await a.eval(
        `getComputedStyle(document.querySelector('#pools-head .ph-tag')).display !== 'none'`),
        true, 'the read-only tag stands in foreign state');
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('pools-head')).position`),
        'sticky', 'the head becomes sticky so mid-scroll ownership survives');
      assert.equal(await a.eval(`!!document.querySelector('.pools-owner-banner')`),
        false, 'the standalone banner is retired');
      // ONE grammar for whose-rack (Joe 2026-08-04): the identity chip
      // joins the rail's aria-pressed toggle grammar. Pressed=true at
      // home, false while browsing a teammate — exactly one chip in the
      // rail is pressed at any time.
      assert.equal(await a.eval(
        `document.getElementById('identity-chip').getAttribute('aria-pressed')`),
        'false', 'the identity chip un-presses while you are browsing a teammate');
      assert.equal(await a.eval(
        `document.querySelector('#rail-roster .roster-name').getAttribute('aria-pressed')`),
        'true', "and the teammate's pill is pressed instead");

      // LEFT-CLICK on your identity chip falls home (Joe 2026-08-04:
      // "switching back to yourself isn't possible by just clicking on
      // your name. Maybe make that possible…"). No menu opens; the
      // chip's own toggle grammar mirrors the teammate pill's.
      await a.eval(`document.getElementById('identity-chip').click()`);
      await a.waitFor(
        `!document.getElementById('pools-head').classList.contains('foreign')`,
        { desc: 'left-click on identity chip falls home' },
      );
      assert.equal(await a.eval(
        `document.querySelector('#pools-head .ph-word').textContent`), 'Saved pools',
        'and the head is your rack again');
      assert.equal(await a.eval(
        `document.getElementById('identity-menu').classList.contains('hidden')`), true,
        'the identity menu does NOT open on left-click (moved to right-click)');
      assert.equal(await a.eval(
        `document.getElementById('identity-chip').getAttribute('aria-pressed')`),
        'true', 'the identity chip is pressed again at home');

      // RIGHT-CLICK on your identity chip opens the identity menu
      // ("…make access to player details accessible via right click").
      // Matches the right-click-for-popover pattern the pool tiles
      // already speak (§7.9 the Sheet Pass: "right-click a tile for its
      // ± popover"). Left-click while the menu is open closes it.
      await a.eval(`document.getElementById('identity-chip')
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
      assert.equal(await a.eval(
        `document.getElementById('identity-menu').classList.contains('hidden')`), false,
        'right-click opens the identity menu');
      await a.eval(`document.getElementById('identity-chip').click()`);
      assert.equal(await a.eval(
        `document.getElementById('identity-menu').classList.contains('hidden')`), true,
        'left-click while the menu is open closes it (via the chip handler)');

      // and press-again on the teammate pill ALSO falls home — both
      // paths back must work; consistency-first, one gesture grammar.
      await a.dbg(`setPoolsOwner(${JSON.stringify(bobId)})`);
      await a.waitFor(
        `document.getElementById('pools-head').classList.contains('foreign')`,
        { desc: 'foreign again for the pill-toggle check' },
      );
      await a.eval(`[...document.querySelectorAll('#rail-roster .roster-name')]
        .find((p) => p.textContent.includes('Bob')).click()`);
      await a.waitFor(
        `!document.getElementById('pools-head').classList.contains('foreign')`,
        { desc: 'the head returns home via the pill toggle' },
      );

      // collapsed: both leave with the panel — the icon rail stays clean.
      // (try/finally: dice.panels.v1 persists per origin, and an aborted
      // collapse here would strand every later localhost scenario in a
      // zero-rect panel — the leak class this suite met once already.)
      try {
        await a.dbg(`setPanelState({pools: false})`);
        assert.equal(await a.eval(
          `document.getElementById('table-name').offsetParent === null`),
          true, 'the plate leaves the collapsed rail');
        assert.equal(await a.eval(
          `document.getElementById('pools-head').offsetParent === null`),
          true, 'the head leaves with the panel');
      } finally {
        await a.dbg(`setPanelState({pools: true})`);
      }
    },
  },
  {
    name: 'spent-draft',
    tags: ['smoke', 'groups'],
    // 2i-E: a rolled draft SURVIVES (the deliberate repeat-roll muscle
    // memory — never auto-cleared) but wears the spent cool-down until
    // its next edit — the cue that separates 'roll it again' from
    // 'accidentally compose the next roll on top of it' (Wisdom ×4).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      // seed a known rack: localStorage persists per origin across
      // scenarios, so the default rack cannot be assumed here
      await a.dbg(`setGroups([{name: 'Wisdom', notation: '2d8'}, {name: 'Sword', notation: '1d10'}])`);
      await a.waitFor(`document.querySelectorAll('#groups-list .tile-stage').length >= 2`,
        { desc: 'rack seeded' });
      await a.eval(`document.querySelector('#groups-list .tile-stage').click()`);
      await a.waitFor(`window.__diceDebug.trayState.dice.length > 0`, { desc: 'staged' });
      assert.equal((await a.dbg('trayState')).spent, false, 'a fresh draft is not spent');

      await a.eval(`document.getElementById('tray-roll').click()`);
      await a.settle();
      const st = await a.dbg('trayState');
      assert.equal(st.spent, true, 'the rolled draft wears the spent state');
      assert.ok(st.dice.length > 0, 'and SURVIVES its roll — never auto-cleared');
      assert.ok(await a.eval(
        `document.getElementById('draft-zone').classList.contains('spent')`),
        'the zone carries the cool-down dress');
      assert.ok((await a.eval(`document.getElementById('tray-roll').title`)).includes('again'),
        'the roll button says the truth');

      // any edit re-warms: staging another pool clears the state
      await a.eval(`document.querySelectorAll('#groups-list .tile-stage')[1].click()`);
      await a.waitFor(`window.__diceDebug.trayState.spent === false`,
        { desc: 'an edit clears spent' });
      assert.ok(!(await a.eval(
        `document.getElementById('draft-zone').classList.contains('spent')`)),
        'the dress lifts with it');

      // …and rolling again re-spends (Enter-again stays a first-class path)
      await a.eval(`document.getElementById('tray-roll').click()`);
      await a.settle();
      assert.equal((await a.dbg('trayState')).spent, true, 'a re-roll re-spends');
    },
  },
  {
    name: 'notation-wiring',
    tags: ['notation'],
    // The browser-side notation path (grammar itself is unit-tested): a valid
    // command rolls; garbage is rejected without starting a roll or throwing.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`commandRoll('zzz###!!')`);
      await a.dbg('sim(120)');
      assert.equal(await a.logCount(), 0, 'garbage does not roll');
      await a.dbg(`setSystem('dnd')`); // dc rendering is totals-world
      await a.roll('4d6kh3 dc 12');
      assert.equal(await a.diceCount(), 4, 'all four dice thrown (one struck)');
      const log = await a.logTop();
      assert.ok(/vs\s*12/.test(log), `dc surfaced in log (got: ${log})`);
    },
  },
  {
    name: 'preview-honest',
    tags: ['notation', 'smoke'],
    // The command-box preview is exact (ROADMAP §2l ①, js/odds.js) — literal
    // min/avg/max text is assertable, which the Monte-Carlo preview never
    // was. The cap-truncation corners drop to seeded sampling and say so.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const type = (s) => a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = ${JSON.stringify(s)};
        box.dispatchEvent(new Event('input'));
      })()`);
      const slotOk = `(document.querySelector('#cmd-slot .ok') || {}).textContent || ''`;
      await type('3d6+5');
      await a.waitFor(`(${slotOk}).includes('min 8 avg 15.5 max 23')`,
        { desc: 'exact preview for 3d6+5' });
      assert.ok(!(await a.eval(slotOk)).includes('sampled'), 'exact line carries no label');
      await type('30d6 ro<=3'); // 10 reroll slots for 30 candidates — BINDING
      await a.waitFor(`(${slotOk}).includes('sampled — 4,000 rolls')`,
        { desc: 'cap-truncation corner is labeled as sampled' });
    },
  },
  {
    name: 'resync',
    tags: ['smoke', 'resync'],
    // A late joiner reconstructs the world: shelved rolls, live table dice,
    // and the same log everyone else sees.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.roll('d20');
      const rid = await a.rollId();
      await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'first roll shelved' },
      );
      await a.roll('2d6');
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await b.settle();
      await b.waitFor(
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1 && window.__diceDebug.tableDice.length === 3)`,
        { desc: 'late joiner reconstructs shelf + live roll' },
      );
      assert.equal((await b.shelf())[0].rollId, rid, 'shelved rollId matches');
      assert.equal(await a.logTop(), await b.logTop(), 'log identical for late joiner');
    },
  },

  // -- chrome: the persistent rail + collapsible panels + identity ----------
  {
    name: 'panels-collapse',
    tags: ['smoke', 'chrome'],
    // Two regions — Compose, Saved pools — each independently collapsible;
    // collapsed = header tab only; state persists per user ('dice.panels.v1'
    // — same origin, same identity); keyboard parity: 'm' collapses/expands
    // all, 'b'/'g' one. The roll log is NOT a region anymore: 'l' toggles
    // the rail flyout and never touches a panel (stale 'log' keys in stored
    // state are ignored — the seed iterates PANEL_DEFS).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      let st = await a.dbg('panelState');
      assert.equal(st.pools, true, 'the Pools panel defaults open on a desktop viewport');
      assert.equal('log' in st, false, 'the log is no longer a panel region');
      assert.equal('compose' in st || 'groups' in st, false,
        'one region since the merge — no compose/groups keys');

      st = await a.dbg('setPanelState({pools: false})');
      assert.equal(st.pools, false, 'pools collapsed');
      assert.equal(st.allCollapsed, true, 'the one region collapsed IS compact');

      // Immersion invariant: a roll plays out exactly the same under
      // collapsed chrome (the log records even while its flyout is closed).
      await a.roll('2d6');
      assert.equal(await a.diceCount(), 2, 'roll unaffected by collapsed chrome');

      // Persistence: a fresh tab on the same origin restores the state.
      await a.dbg('setPanelState({pools: true})');
      await a.dbg('setPanelState({pools: false})');
      const b = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const st2 = await b.dbg('panelState');
      assert.equal(st2.pools, false, 'collapsed pools persisted');
      await b.dbg('setPanelState({pools: true})'); // reopen so 'm' has something to collapse

      // Keyboard parity: 'm' = collapse/expand all; 'g' = just the pools;
      // 'l' = the log flyout, leaving every panel exactly where it was.
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'm'}))`);
      assert.equal((await b.dbg('panelState')).allCollapsed, true, "'m' collapses everything");
      assert.ok(await b.eval(`document.body.classList.contains('mini')`), 'and compact view engages');
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'l'}))`);
      assert.equal((await b.dbg('logFlyout')).open, true, "'l' opens the log flyout");
      assert.equal((await b.dbg('panelState')).allCollapsed, true, 'without touching a panel — compact holds');
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'l'}))`);
      assert.equal((await b.dbg('logFlyout')).open, false, "'l' again closes it");
      // n is the documented key; b and g are silent aliases from the old
      // two-panel days — all three toggle the ONE Pools panel.
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'g'}))`);
      assert.equal((await b.dbg('panelState')).pools, true, "'g' (alias) reopens the pools");
      assert.ok(await b.eval(`!document.body.classList.contains('mini')`), 'compact view lifts');
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'n'}))`);
      assert.equal((await b.dbg('panelState')).pools, false, "'n' collapses it again");
      // Leave the origin's persisted state open: panel state is per-user
      // localStorage, which OUTLIVES this scenario's room.
      await b.dbg('setPanelState({pools: true})');
    },
  },
  {
    name: 'control-rail',
    tags: ['smoke', 'chrome'],
    // The persistent control rail NEVER hides: identity chip, quick roll,
    // roll log and settings stay reachable even with every panel collapsed
    // (the emergent compact view). Since 2026-08-04 it lives at the TOP of
    // the side panel (zero felt overlays), with the contextual ✕ Clear
    // table docked at its end. Order is P3: presence (status · roster ·
    // identity) → action (❯) → information (≣) → environment (⚙). The ⤡
    // collapse-all button is deleted (key 'm' remains), and the rail's 🔊
    // retired 2026-08-03 (Joe: the setting is sufficient; 's' stays).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const RAIL = ['rail', 'identity-chip', 'rail-palette', 'rail-log', 'rail-help', 'toggle-settings'];
      const visible = (id) => a.eval(
        `(() => { const el = document.getElementById('${id}'); if (!el) return false;`
        + ` const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; })()`,
      );
      for (const id of RAIL) assert.ok(await visible(id), `#${id} visible in full view`);
      assert.equal(await a.eval(`document.getElementById('rail-collapse') === null`), true,
        'the ⤡ collapse-all button is gone');
      assert.equal(await a.eval(`document.getElementById('toggle-sound') === null`), true,
        'the rail 🔊 is gone — sound lives in Settings');
      // ORDER IS THE CONTRACT (Joe 2026-08-04). Top rail: YOU first, so your
      // own name anchors the corner and never moves — the roster grows to
      // your right, the table's nameplate rides the right edge (the mirror
      // of you — the anatomy pass), and the transient status pill trails,
      // wrapping to its own line BELOW you instead of shoving you down.
      assert.deepEqual(
        await a.eval(`[...document.getElementById('rail').children].map((el) => el.id)`),
        ['identity-chip', 'rail-roster', 'table-name', 'status-pill'],
        'the top rail is PRESENCE, anchored on you (you · roster · table · status)',
      );
      // Foot: configure → consult → act, then the gap, then the contextual
      // ✕ alone in the right corner (the same corner ✕ Clear owns on the
      // workbench rim). The permanent icons are the LEFT cluster precisely
      // so the ✕ coming and going never shifts any of them.
      assert.deepEqual(
        await a.eval(`[...document.getElementById('rail-foot').children].map((el) => el.id)`),
        ['toggle-settings', 'rail-log', 'rail-help', 'rail-palette', 'corner-controls'],
        'the foot bar runs ⚙ → ≣ → ❯, with the contextual ✕ in the far corner',
      );
      // …and that corner is REAL, not just source order: the ✕ is pushed
      // to the panel's right edge while ❯ stays clustered. (The old
      // midpoint proxy died when ? made the cluster four wide — measure
      // the contract itself: ❯ hugs its neighbor, far from the corner.)
      const footGeo = await a.eval(`(() => {
        const foot = document.getElementById('rail-foot').getBoundingClientRect();
        const pal = document.getElementById('rail-palette').getBoundingClientRect();
        const help = document.getElementById('rail-help').getBoundingClientRect();
        return { clustered: pal.left - help.right < 12, offEdge: foot.right - pal.right > 60 };
      })()`);
      assert.ok(footGeo.clustered, '❯ hugs the consult pair — one left cluster');
      assert.ok(footGeo.offEdge, '❯ is not pushed to the ✕ corner');
      assert.equal(await a.eval(`!!document.querySelector('#left-panel #rail') && !!document.querySelector('#left-panel #rail-foot')`), true,
        'both bars ride the panel — the felt owns no standing chrome');

      const st = await a.dbg('setPanelState({pools: false})');
      assert.equal(st.allCollapsed, true, 'every panel collapsed');
      assert.ok(await a.eval(`document.body.classList.contains('mini')`),
        'compact view is the emergent all-collapsed state');
      // The never-hides promise is the FOUR reachability controls named in
      // this scenario's own contract — identity, quick roll, roll log,
      // settings. `? Help` is the one deliberate collapsed-only omission
      // (Joe 2026-08-07, on trimming the compact view): the collapsed foot
      // has 86px, four glyphs plus the contextual ✕ do not fit in it, and
      // help is reference material whose panel is one keystroke away.
      for (const id of RAIL.filter((x) => x !== 'rail-help')) {
        assert.ok(await visible(id), `#${id} still visible all-collapsed`);
      }
      assert.equal(await visible('rail-help'), false,
        '? Help is the one control the collapsed foot gives up — by decision, for room');
      // …and the foot it gives that room to is a ROW at the column's foot,
      // not the centered stack it was (which read as neither deliberate nor
      // aligned to anything).
      assert.ok(await a.eval(`(() => {
        const tops = [...document.querySelectorAll('#rail-foot .btn.ghost')]
          .filter((b) => b.offsetParent !== null)
          .map((b) => Math.round(b.getBoundingClientRect().top));
        return tops.length >= 3 && new Set(tops).size === 1;
      })()`), 'the collapsed foot stays one row');
      // …and that row FITS. It was overflowing its 86px content box by 12px
      // and spilling under the divider strip — invisible in a screenshot,
      // invisible to every other assertion here. Measured with dice on the
      // felt, which is the only state that adds the contextual ✕.
      await a.roll('d6');
      const fit = JSON.parse(await a.eval(`JSON.stringify((() => {
        const foot = document.getElementById('rail-foot');
        const cs = getComputedStyle(foot);
        const avail = foot.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const kids = [...foot.children].filter((el) => getComputedStyle(el).display !== 'none');
        const used = kids.reduce((s, el) => s + el.getBoundingClientRect().width, 0)
          + parseFloat(cs.gap || 0) * (kids.length - 1);
        return { avail: Math.round(avail), used: Math.round(used), n: kids.length };
      })())`));
      assert.ok(fit.n >= 4, `the ✕ joined the row (${fit.n} items)`);
      assert.ok(fit.used <= fit.avail,
        `the collapsed foot fits its column (${fit.used}px of ${fit.avail}px)`);

      // The old bug, dead: settings opens from the rail in compact.
      await a.dbg('openSettings()');
      assert.ok(await a.eval(`!document.getElementById('settings-modal').classList.contains('hidden')`),
        'settings reachable with everything collapsed');
      await a.eval(`document.getElementById('settings-close').click()`);
      // Reopening one panel leaves compact view.
      const st2 = await a.dbg('setPanelState({pools: true})');
      assert.equal(st2.allCollapsed, false, 'one open panel ends all-collapsed');
      assert.ok(await a.eval(`!document.body.classList.contains('mini')`), 'compact view lifts');
      // Leave the origin's persisted state all-open: panel state is per-user
      // localStorage, which OUTLIVES this scenario's room.
      await a.dbg('setPanelState({pools: true})');
    },
  },
  {
    name: 'log-flyout',
    tags: ['chrome', 'smoke'],
    // The roll log rides the rail (P3: information): ≣ / 'l' toggle a pinned
    // flyout. Closed, arrivals count into the unread badge (which also seeds
    // from the join backlog); open, renderLog keeps painting live. PINNED
    // MEANS PINNED: clicking the felt never dismisses it — only the ≣
    // toggle, its own ✕, or Esc (the END of the Esc chain) close it.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      let lf = await a.dbg('logFlyout');
      assert.equal(lf.open, false, 'the flyout starts closed');
      assert.equal(lf.badge, 0, 'and unread starts empty');

      // A roll while closed: one unread, reflected in badge DOM + title.
      await a.roll('d20');
      lf = await a.dbg('logFlyout');
      assert.equal(lf.open, false, 'a roll does not open the flyout');
      assert.equal(lf.badge, 1, 'the closed flyout counted it unread');
      // NO bubble in the DOM — history is reference, not notifications; the
      // count rides only the hover title.
      assert.equal(await a.eval(`document.getElementById('log-badge') === null`), true,
        'no notification bubble exists');
      assert.ok((await a.eval(`document.getElementById('rail-log').title`)).includes('1 new'),
        'the ≣ title carries the since-you-looked count');
      assert.equal(await a.eval(`document.getElementById('rail-log').getAttribute('aria-pressed')`), 'false');

      // Opening clears the badge and shows the entry.
      assert.equal(await a.dbg('setLogFlyout(true)'), true, 'flyout opens');
      lf = await a.dbg('logFlyout');
      assert.equal(lf.badge, 0, 'opening reads the backlog — badge clears');
      assert.equal(await a.eval(`document.getElementById('rail-log').getAttribute('aria-pressed')`), 'true',
        'the ≣ reflects the open state');
      assert.ok((await a.logTop()).includes('d20'), `the entry is readable in the open flyout (got: ${await a.logTop()})`);

      // A roll while open lands live; the flyout stays open, nothing unread.
      await a.roll('2d6');
      lf = await a.dbg('logFlyout');
      assert.equal(lf.open, true, 'the flyout stays open across a roll');
      assert.equal(lf.badge, 0, 'an open flyout never counts unread');
      assert.equal(await a.logCount(), 2, 'the new entry painted live');

      // PINNED: clicking the felt/table does not dismiss it — the log is for
      // watching the table while you act on it.
      await a.eval(`document.getElementById('scene-container').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}))`);
      await a.eval(`document.getElementById('scene-container').click()`);
      assert.equal((await a.dbg('logFlyout')).open, true, 'outside clicks never close it — pinned means pinned');

      // Esc closes it (end of the central chain).
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
      assert.equal((await a.dbg('logFlyout')).open, false, 'Esc closes the flyout');

      // A late joiner: the join backlog seeds the badge so history shows.
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await b.settle();
      await b.waitFor(`window.__diceDebug.logFlyout.badge === 2`, { desc: 'join backlog seeds the unread badge' });
      assert.equal((await b.dbg('logFlyout')).open, false, 'seeded badge, closed flyout');
    },
  },
  {
    name: 'identity-chip',
    tags: ['smoke', 'chrome', 'seat'],
    // The rail identity chip: rename propagates to every roster and the chip
    // itself; '#' is refused; 'Leave & switch' (the once-dead net.disconnect)
    // drops the seat for real — the other tab sees the player leave — clears
    // the stored name, and re-prompts 'Take a seat' for a fresh seat.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      const id0 = await a.dbg('identity');
      assert.equal(id0.name, 'Alice', 'the chip knows the seat');
      assert.equal(id0.online, true, 'and that it is online');
      assert.ok(id0.inviteUrl.includes(`room=${ctx.room}`), `invite link addresses the room (got: ${id0.inviteUrl})`);

      assert.equal(await a.dbg(`changeName('Al#ce')`), false, 'a # name is refused');
      assert.equal(await a.dbg(`changeName('Alicia')`), true, 'a clean rename is accepted');
      await b.waitFor(
        `window.__diceDebug.players.some((p) => p.name === 'Alicia')`,
        { desc: 'the roster follows the rename' },
      );
      // The rail roster shows the OTHERS only: you are the identity chip.
      const bRoster = await b.eval(`document.getElementById('rail-roster').textContent`);
      assert.ok(bRoster.includes('Alicia'), `B's rail shows Alicia (got: ${bRoster})`);
      assert.ok(!bRoster.includes('Bob'), 'and never B himself');
      assert.equal((await a.dbg('identity')).name, 'Alicia', 'the chip follows too');
      assert.equal(await a.eval(`document.getElementById('identity-name').textContent`), 'Alicia');

      const oldSeat = await a.playerId();
      assert.equal(await a.dbg('leaveTable()'), true, 'leave accepted');
      await a.waitFor(`!document.getElementById('name-modal').classList.contains('hidden')`,
        { desc: "'Take a seat' returns" });
      assert.equal(await a.eval(`localStorage.getItem('dice.name.v1')`), null, 'stored identity cleared');
      assert.equal((await a.dbg('identity')).online, false, 'no seat while choosing');
      await b.waitFor(
        `window.__diceDebug.players.every((p) => p.name !== 'Alicia')`,
        { desc: 'the dropped seat leaves the roster', timeout: 20000 },
      );

      // Take the new seat through the real modal.
      await a.eval(`(() => {
        const i = document.getElementById('name-input');
        i.value = 'Ann';
        i.dispatchEvent(new Event('input'));
        document.getElementById('name-join').click();
      })()`);
      await a.waitFor(`window.__diceDebug.identity.online`, { desc: 'rejoined' });
      assert.notEqual(await a.playerId(), oldSeat, 'a fresh seat, not the old one');
      assert.equal((await a.dbg('identity')).name, 'Ann', 'under the new name');
      await b.waitFor(
        `window.__diceDebug.players.some((p) => p.name === 'Ann')`,
        { desc: 'the new seat reaches the other roster' },
      );
    },
  },

  {
    name: 'seat-resume',
    tags: ['smoke', 'chrome', 'seat'],
    // A REFRESH IS THE SAME PLAYER (Joe 2026-08-04). The tab remembers its
    // seat and offers it back to /api/join; the server sits it down again
    // instead of minting a new one. Before this, every reload flashed two
    // same-name pills on every other screen until the abandoned seat reaped
    // 5s later, and took a fresh palette color on the way in.
    //
    // The memory is sessionStorage, so it is per TAB: a reload resumes, a
    // SECOND tab is still a second player, and 'Leave & switch seat' drops
    // the seat for good.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      const watcher = await ctx.rawPlayer('Watcher'); // event-level proof
      await b.waitFor(`window.__diceDebug.players.length === 3`,
        { desc: 'the room is seated' });

      const seat = await a.playerId();
      const color = await a.color();
      const key = `dice.seat.v1:${ctx.room}`;
      assert.equal(await a.eval(`localStorage.getItem(${JSON.stringify(key)})`), null,
        'the seat never lands in localStorage — that would make a second tab the same player');
      const stored = JSON.parse(await a.eval(`sessionStorage.getItem(${JSON.stringify(key)})`) || 'null');
      assert.equal(stored && stored.id, seat, 'the tab remembers the seat it is sitting in');

      const seen = watcher.events().length;
      await a.reload();

      assert.equal(await a.playerId(), seat, 'the same seat after a refresh');
      assert.equal(await a.color(), color, 'wearing the same color');

      // Nobody else's table so much as blinks: no join, no leave, no rename,
      // and never two Alices.
      const churn = watcher.events().slice(seen)
        .filter((e) => ['player-joined', 'player-left', 'player-renamed'].includes(e.type));
      assert.deepEqual(churn, [],
        `a reload is invisible to the room (got: ${JSON.stringify(churn)})`);
      assert.equal(
        await b.eval(`window.__diceDebug.players.filter((p) => p.name === 'Alice').length`), 1,
        'exactly one Alice on the roster',
      );
      assert.equal(await b.eval(`window.__diceDebug.players.length`), 3,
        'and the roster never grew');

      // The resumed seat is a live player, not a husk: it rolls, and the
      // roll lands on everyone's log under the same name.
      await a.roll('d20');
      await b.waitFor(`document.getElementById('log-list').childElementCount > 0`,
        { desc: "the resumed seat's roll reaches the table" });
      assert.ok((await b.logTop()).includes('Alice'),
        `attributed to Alice (got: ${await b.logTop()})`);

      // A SECOND tab on the same origin is a DIFFERENT player — the seat is
      // per tab, which is what a shared screen expects.
      const a2 = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      assert.notEqual(await a2.playerId(), seat, 'a new tab takes a new seat');
      await b.waitFor(`window.__diceDebug.players.length === 4`,
        { desc: 'the second tab is a fourth player' });

      // 'Leave & switch seat' is the one gesture that gives the seat up: the
      // join that follows must not resume the player who just left.
      const a2Color = await a2.color();
      assert.equal(await a2.dbg('leaveTable()'), true, 'leave accepted');
      assert.equal(await a2.eval(`sessionStorage.getItem(${JSON.stringify(key)})`), null,
        'leaving forgets the seat');
      await b.waitFor(`window.__diceDebug.players.length === 3`,
        { desc: 'the dropped seat leaves the roster', timeout: 20000 });

      // The color is a PREFERENCE, not a claim. A seat that lapsed entirely
      // (grace expired, server restarted) asks for the hue it wore and gets
      // it back when it is free — and is refused when someone is wearing it.
      const reseat = await ctx.api('/api/join', { name: 'Reseat', color: a2Color });
      assert.ok(reseat.ok, `re-join accepted (got ${reseat.status})`);
      assert.equal(reseat.data.color, a2Color, 'a freed hue comes back to whoever asks');
      const clash = await ctx.api('/api/join', { name: 'Clash', color });
      assert.ok(clash.ok, `clashing join still accepted (got ${clash.status})`);
      assert.notEqual(clash.data.color, color, "a hue someone is wearing is not handed out twice");

      // An unknown seat id is not adopted — it mints a fresh seat. The id is
      // the credential, so the server must never take the client's word for
      // one it has no record of.
      const bogus = await ctx.api('/api/join', { name: 'Nobody', playerId: 'not-a-seat' });
      assert.ok(bogus.ok, `unknown seat still joins (got ${bogus.status})`);
      assert.notEqual(bogus.data.playerId, 'not-a-seat', 'the offered id is never adopted');
    },
  },

  {
    name: 'seat-closed-tab',
    tags: ['seat', 'presence'],
    // A CLOSED TAB LEAVES THE TABLE (Joe 2026-08-06). It always did locally —
    // the socket closes, the grace runs, the seat goes. On the DEPLOYED table
    // it did not: behind Cloud Run's front end the container never sees the
    // close and its writes keep succeeding, so the seat sat on the roster for
    // the hour it took the platform to time the request out. Four ghosts on
    // one table with one real window open is what that looks like.
    //
    // The fix's two halves are proved at the protocol level in
    // tests/presence.test.mjs (they need clocks a browser cannot shrink).
    // What only a browser can prove is the part in the middle: that a real
    // tab really does fire the beacon on its way out, and that the roster
    // everyone is looking at empties because of it.
    //
    // The RELOAD half of this bargain — the identical beacon that must NOT
    // cost a seat — is asserted by `seat-resume`, which fails on any
    // player-left churn across a refresh.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await b.waitFor(`window.__diceDebug.players.length === 2`,
        { desc: 'both seated' });

      // A roll first: it is what makes the difference between the seat and
      // the LOG visible below.
      await a.roll('d20');
      await b.waitFor(`document.getElementById('log-list').childElementCount > 0`,
        { desc: "Alice's roll reaches the table" });

      await a.close();

      // The beacon covers the closing tab; the 5s grace covers the beacon.
      // Generous, because the assertion worth making is "in seconds, not in
      // an hour" — a tighter bound would only buy flakes.
      await b.waitFor(
        `!window.__diceDebug.players.some((p) => p.name === 'Alice')`,
        { desc: 'the closed tab leaves the roster', timeout: 20000 },
      );

      // The seat goes; the HISTORY stays. A name on a past roll is a record
      // of who rolled it, not a presence claim — the log snapshots it at roll
      // time precisely so leaving cannot rewrite it.
      assert.ok((await b.logTop()).includes('Alice'),
        `Alice's roll is still hers (got: ${await b.logTop()})`);
    },
  },

  {
    name: 'url-carries-nothing',
    tags: ['smoke', 'groups'],
    // THE URL IS NOT STORAGE (Joe 2026-08-04). The saved-pool rack used to
    // ride the address bar as '#g=<base64url>', rewritten on every edit and
    // read at boot AHEAD of localStorage — so opening someone else's pools
    // link silently replaced your own rack. The codec is gone: editing a pool
    // never touches the URL, a stale '#g=' decodes nothing and is swept out
    // of the address bar, and the only rack transport is the YAML in
    // Settings → Your data (the `portable` scenario covers that path).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.4', name: 'Alice' });
      const first = (await a.dbg('groups'))[0];
      assert.ok(first && first.id, 'the rack seeded');

      // A save writes storage — and nothing else.
      assert.ok(await a.dbg(`editPool(${first.id}, { notation: '2d12' })`), 'pool edited');
      assert.equal(await a.eval('location.hash'), '', 'a save never writes the address bar');
      assert.ok(
        (await a.eval(`localStorage.getItem('dice.groups.v1')`)).includes('2d12'),
        'the edit landed in storage',
      );

      // A link someone shares from before the drop is INERT: it neither
      // replaces the rack nor survives in the address bar.
      const stale = '#g=' + Buffer.from('Shared%20Thing|Attributes=1d4').toString('base64url');
      await a.reload({ hash: stale });
      const after = await a.dbg('groups');
      assert.ok(after.every((g) => g.name !== 'Shared Thing'),
        `a stale #g= link decodes nothing (got: ${after.map((g) => g.name).join(', ')})`);
      assert.equal((await a.dbg('groups')).find((g) => g.id === first.id).notation, '2d12',
        'and the visitor keeps their own rack');
      assert.equal(await a.eval('location.hash'), '', 'the corpse is swept out of the URL');
    },
  },

  {
    name: 'die-art',
    tags: ['chrome'],
    // P1 — the dice are the buttons: every die type has real rendered art
    // (a dataURL still of its beveled mesh), the types are visually distinct,
    // and the compose palette tiles carry it as .die-art imgs (alt="",
    // draggable=false; the ::before diamond survives only as null-art
    // fallback, which this WebGL-capable environment must not need).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const art = await a.dbg('dieArt');
      const types = ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'];
      for (const t of types) {
        assert.equal(typeof art[t], 'string', `${t} art rendered (got ${art[t]})`);
        assert.ok(art[t].startsWith('data:image/'), `${t} art is a data URL`);
        assert.ok(art[t].length > 100, `${t} art is non-trivial (${art[t].length} chars)`);
      }
      assert.ok(new Set(types.map((t) => art[t])).size >= 2, 'at least two types render distinct art');

      // The palette: 8 tiles (7 types + d100), every one carrying die art —
      // the d100 shortcut reuses the d10x still.
      const tiles = await a.eval(`[...document.querySelectorAll('#die-buttons .die-btn')].map((b) => ({
        hasArt: b.classList.contains('has-art'),
        imgs: b.querySelectorAll('img.die-art').length,
        src: (b.querySelector('img.die-art') || {}).src || null,
        alt: (b.querySelector('img.die-art') || {}).alt ?? null,
        draggable: (b.querySelector('img.die-art') || {}).draggable ?? null,
        label: b.textContent.trim(),
      }))`);
      assert.equal(tiles.length, 8, 'eight palette tiles');
      for (const tile of tiles) {
        assert.equal(tile.hasArt, true, `tile ${tile.label} carries art`);
        assert.equal(tile.imgs, 1, `tile ${tile.label} has exactly one .die-art img`);
        assert.equal(tile.alt, '', `tile ${tile.label} art is decorative (alt="")`);
        assert.equal(tile.draggable, false, `tile ${tile.label} art is not draggable`);
        assert.ok(tile.label, `tile keeps its text label`);
      }
      assert.equal(tiles[7].label, 'd100', 'eighth tile is the percentile shortcut');
      assert.equal(tiles[7].src, tiles[4].src, 'd100 reuses the d10x art');
      // Art replaces the diamond, but the tile is still the button: a click
      // still adds its die to the pool draft (the cluster shows its art).
      await a.eval(`document.querySelector('#die-buttons .die-btn').click()`);
      assert.deepEqual((await a.dbg('trayState')).dice, ['d4'],
        'clicking an art tile still adds its die to the pool');
    },
  },
  {
    name: 'compose-grammar',
    tags: ['smoke', 'chrome'],
    // The New pool panel speaks P1 end to end: composed dice render as one
    // die-art roll button; a per-die ✕ (an overlaid SIBLING, never a nested
    // button) removes exactly one die; the rim is [± Modify][Offer][✕ Clear]
    // (the Save retired 2026-08-04 — pool editing owns creation); the empty
    // draft shows the hint.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      // origins share a profile across scenarios: seed the rack explicitly
      await a.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}, {name: 'Percentile', notation: 'd100'}])`);
      let ts = await a.dbg('trayState');
      assert.equal(ts.hint, true, 'empty draft shows the hint');
      // standing furniture (Joe 2026-08-03): the rail never leaves — its
      // verbs GRAY on an empty draft, so the zone's geometry never moves
      assert.equal(ts.hasActions, true, 'the rail stands on an empty draft');
      assert.equal(await a.eval(`document.getElementById('tray-mods').disabled`), true,
        'grayed until a draft exists');

      // Compose two dice from the palette; the cluster carries their art + ✕s.
      await a.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
      await a.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
      ts = await a.dbg('trayState');
      assert.deepEqual(ts.dice, ['d6', 'd6'], 'two d6 composed');
      assert.equal(ts.rollVisible, true, 'the cluster is the roll button');
      assert.equal(ts.hasActions, true, 'the rail stands with content too');
      assert.equal(await a.eval(`document.getElementById('tray-mods').disabled`), false,
        'and its verbs arm with the draft');
      assert.ok((await a.eval(`document.getElementById('tray-mods').textContent`)).includes('Modify'),
        "the modifier tool wears its word — '± Modify', never 'Tweak'");
      assert.equal(await a.eval(`!!document.getElementById('save-group')`), false,
        'the rim carries no Save — pool editing owns creation (Joe 2026-08-04)');
      assert.ok(await a.eval(`(() => {
        const c = document.querySelector('#tray-roll .roll-cue');
        return !!c && c.getAttribute('aria-hidden') === 'true' && c.textContent.includes('ROLL');
      })()`), 'the cluster carries the same ROLL cue (tier rule)');
      // Grouped exactly like the pool rows: one d6 with a ×2, one ✕.
      assert.equal(ts.xCount, 1, 'repeats group — one ✕ per die TYPE');
      // PROXIMITY reveal (Joe 2026-08-03): the ✕ shows only while the
      // pointer is over ITS anchor — never on mere cluster hover.
      assert.equal(await a.eval(`(() => {
        const tray = document.getElementById('tray');
        const die = document.querySelector('#tray-roll .die-art');
        const b = die.getBoundingClientRect();
        tray.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse',
          clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }));
        const overDie = document.querySelector('.die-x').classList.contains('show');
        const r = tray.getBoundingClientRect();
        tray.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse',
          clientX: r.right - 2, clientY: r.bottom - 2 }));
        const offDie = document.querySelector('.die-x').classList.contains('show');
        return JSON.stringify({ overDie, offDie });
      })()`), JSON.stringify({ overDie: true, offDie: false }),
        'the ✕ follows its die, not the whole cluster');
      assert.equal(await a.eval(`document.querySelector('#tray-roll .strip-count').textContent`),
        '×2', 'the repeat shows as ×2, same as the pool rows');
      assert.equal(await a.eval(`document.querySelectorAll('#builder-panel button button').length`),
        0, 'no button nests inside a button');

      // The group's ✕ removes ONE die of the type (×2 steps down to bare).
      await a.eval(`document.querySelector('#tray-x-layer .die-x').click()`);
      ts = await a.dbg('trayState');
      assert.deepEqual(ts.dice, ['d6'], '✕ removed exactly one die');
      assert.ok((await a.eval(`document.getElementById('cmd-input').value`)).includes('1d6'),
        'the box mirrors the removal');

      // The cluster rolls the draft.
      const logBefore = await a.logCount();
      await a.eval(`document.getElementById('tray-roll').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(60), document.getElementById('log-list').childElementCount > ${0})`,
        { desc: 'clicking the composed dice rolls the draft' },
      );

      // (the inline save morph retired 2026-08-04 with the rim's Save —
      // creation is pool editing's job: the ✎ ghost tiles' newborn
      // contract is pinned in sheet-pass, and by-id-only updates in
      // saved-group-edit.)

      // ✕ clears the whole draft back to the hint.
      await a.eval(`document.getElementById('clear-tray').click()`);
      ts = await a.dbg('trayState');
      assert.deepEqual(ts.dice, [], 'draft cleared');
      assert.equal(ts.hint, true, 'the hint returns');
      assert.equal(ts.hasActions, true, 'the rail stands on — its verbs just gray');
      assert.equal(await a.eval(`document.getElementById('tray-mods').disabled`), true,
        '± Modify grayed with the draft gone');

      // Dice · Notation · Pools: three INDEPENDENT sources over one draft.
      // Rewritten 2026-08-07 (§7.23) — the old contract here was exclusivity
      // ("Notation view: the palette hides"), which is exactly what this
      // supersedes. CO-VISIBILITY is the contract now, and §1.3 is what
      // makes it safe: both editors are projections of one spec object, so
      // there is nothing to reconcile when both are on screen at once.
      const vis = (sel) => a.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
        return !!el && el.offsetParent !== null; })()`);
      assert.equal(await vis('#cmd-input'), false, 'default: the box is off');
      assert.equal(await vis('#die-buttons'), true, 'default: the palette shows');
      await a.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
      await a.eval(`document.querySelector('#section-bar [data-sec="notation"]').click()`);
      assert.equal(await vis('#cmd-input'), true, 'Notation on: the box shows');
      assert.equal(await vis('#die-buttons'), true,
        'and the palette STAYS — turning one source on never turns another off');
      assert.equal(await vis('#tray-roll'), true,
        'the draft cluster stays ALIVE — typed dice materialize');
      assert.ok((await a.eval(`document.getElementById('cmd-input').value`)).includes('1d6'),
        'the draft crossed the toggle intact');
      // Both editors live, describing the same draft: type in one, read the
      // other. This is the pin the exclusivity made impossible to write.
      await a.eval(`document.querySelector('#section-bar [data-sec="dice"]').click()`);
      assert.equal(await vis('#die-buttons'), false, 'Dice off: the palette hides');
      assert.equal(await vis('#cmd-input'), true, 'and the box is untouched by it');
      assert.deepEqual((await a.dbg('trayState')).dice, ['d6'], 'draft intact through both');
      await a.dbg(`setSections({dice: true, notation: false})`);
      assert.equal(await vis('#die-buttons'), true, 'and back to the default pair');
      assert.equal(await vis('#cmd-input'), false, 'box off again');
      await a.eval(`document.getElementById('clear-tray').click()`);
    },
  },

  {
    name: 'keyboard-flow',
    tags: ['smoke', 'chrome', 'roll'],
    // The fluid-play pair (2026-07 keyboard design): after a roll settles,
    // Enter KEEPS it (collect to the shelf) and Esc SWEEPS it (clear) — only
    // your own settled roll, and only when no layer holds the key first
    // (Esc peels layers before it ever touches the table).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.roll('2d6');
      await a.eval(`document.activeElement && document.activeElement.blur()`);
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
      await a.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length === 0)`,
        { desc: 'Esc sweeps the settled roll' });

      await a.roll('d20');
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))`);
      await a.waitFor(`(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'Enter keeps it — collected to the shelf' });

      // Layers own Esc first: with the log flyout open, Esc peels it and
      // the dice stay put.
      await a.roll('d6');
      await a.dbg('setLogFlyout(true)');
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
      assert.equal((await a.dbg('logFlyout')).open, false, 'Esc peels the flyout first');
      assert.ok(await a.eval(`window.__diceDebug.tableDice.length > 0`), 'the roll survives the peel');
    },
  },
  {
    name: 'side-panel',
    tags: ['smoke', 'chrome', 'groups'],
    // THE SIDE PANEL (2026-08-04): a real layout column, never an overlay —
    // the felt (canvas) is sized beside it and resizes on toggle. The
    // divider strip collapses it to a 104px POOL RAIL (2026-08-07) carrying
    // the menu buttons and a shelf-grouped pool list with horizontal names;
    // a tap SELECTS and the gold bar rolls. Zero edit chrome either way.
    // The hover flyout is retired.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {notation: '2d6'}])`);
      await a.dbg('setPanelState({pools: true})');

      // expanded: the column is layout — the felt starts where it ends
      const geo = JSON.parse(await a.eval(`JSON.stringify((() => {
        const p = document.getElementById('left-panel').getBoundingClientRect();
        const c = document.getElementById('scene-container').getBoundingClientRect();
        const cv = document.querySelector('#scene-container canvas');
        return { panelW: p.width, feltLeft: c.left, feltW: c.width,
                 canvasW: cv ? cv.getBoundingClientRect().width : 0,
                 vw: window.innerWidth,
                 title: !!document.getElementById('head-compose'),
                 railInPanel: !!document.querySelector('#left-panel #rail') };
      })())`));
      assert.ok(Math.abs(geo.feltLeft - geo.panelW) <= 1, 'the felt begins at the panel edge');
      assert.ok(Math.abs(geo.panelW + geo.feltW - geo.vw) <= 1, 'panel + felt tile the window');
      assert.ok(Math.abs(geo.canvasW - geo.feltW) <= 1, 'the canvas fills exactly the felt');
      assert.equal(geo.title, false, 'no Pools title row');
      assert.equal(geo.railInPanel, true, 'the control rail lives at the panel top');
      assert.equal(await a.dbg('setGroupsFlyout') , undefined, 'the hover flyout is retired');

      // collapse via the divider strip: slim rail, wider felt, same window
      await a.eval(`document.getElementById('edge-toggle').click()`);
      assert.equal((await a.dbg('panelState')).pools, false, 'the strip collapses the panel');
      const geo2 = JSON.parse(await a.eval(`JSON.stringify((() => {
        const p = document.getElementById('left-panel').getBoundingClientRect();
        const c = document.getElementById('scene-container').getBoundingClientRect();
        return { panelW: p.width, feltW: c.width, vw: window.innerWidth,
                 builder: document.getElementById('builder-panel').offsetParent !== null,
                 expanded: document.getElementById('edge-toggle').getAttribute('aria-expanded') };
      })())`));
      assert.ok(geo2.panelW < 120, `collapsed is a pool rail (got ${geo2.panelW})`);
      assert.ok(Math.abs(geo2.panelW + geo2.feltW - geo2.vw) <= 1, 'the felt took the difference');
      assert.equal(geo2.builder, false, 'the workbench leaves entirely');
      assert.equal(geo2.expanded, 'false', 'the strip reports collapsed');

      // the pool rail: a named pool is its name — HORIZONTAL, the defect
      // this width buys out — an unnamed pool is die chips, and there is no
      // edit/save/notation chrome either way
      const rail = await a.dbg('railState');
      const attack = rail.items.find((i) => i.name === 'Attack');
      assert.ok(attack, 'the named pool shows its name');
      assert.equal(attack.imgs, 0, 'a named pool is its name alone — no dice images');
      assert.equal(attack.vertical, 'horizontal-tb', 'and it reads horizontally, never rotated');
      assert.ok(rail.items.some((i) => i.dice && i.imgs >= 1 && !i.name),
        'an unnamed pool is die chips alone — no text');
      assert.equal(await a.eval(
        `document.querySelectorAll('#rail-pools .btn, #rail-pools input').length`),
        0, 'zero edit/save chrome in the rail');

      // tap = SELECT, then the one gold bar ROLLS. The draft is never
      // touched, the panel stays collapsed, the roll carries the pool's
      // identity, and the selection is SPENT by its roll (2i-G).
      // STANDING FURNITURE (§7.9): the verb is always there, just not armed
      // — the column's geometry must not move when a pick arrives.
      assert.equal(rail.rollStanding, true, 'the verb STANDS before anything is picked');
      assert.equal(rail.rollDisabled, true, 'grayed, because there is nothing to roll yet');
      const logBefore = await a.logCount();
      await a.eval(`[...document.querySelectorAll('#rail-pools .rp-item')]
        .find((b) => (b.querySelector('.rp-name') || {}).textContent === 'Attack').click()`);
      const picked = await a.dbg('railState');
      assert.deepEqual(picked.selected, ['Attack'], 'the tap SELECTS rather than rolling');
      assert.equal(picked.rollDisabled, false, 'and the pick ARMS the verb rather than summoning it');
      assert.equal(await a.logCount(), logBefore, 'nothing has rolled yet');

      await a.eval(`document.getElementById('rail-roll').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), document.getElementById('log-list').childElementCount > ${logBefore} && !window.__diceDebug.busy)`,
        { desc: 'the gold bar rolls the selection' },
      );
      assert.equal((await a.dbg('trayState')).dice.length, 0, 'the draft was never touched');
      assert.equal((await a.dbg('panelState')).pools, false, 'the panel stays collapsed');
      assert.ok((await a.logTop()).includes('Attack'), 'the roll carries the pool identity');
      const spent = await a.dbg('railState');
      assert.deepEqual(spent.selected, [], 'the selection is spent by its roll');
      assert.equal(spent.rollStanding, true, 'the verb stays standing after the roll');
      assert.equal(spent.rollDisabled, true, 'disarmed, not removed — the geometry never moves');

      // ONE LEFT EDGE (Joe 2026-08-07: the head and foot were "awkwardly
      // horizontally centered and top aligned in their region"). The
      // identity chip, the pool rows and the foot's first glyph all start
      // at the same x, and the foot is a ROW pinned to the bottom — not a
      // centered column stacked wherever the list happened to end.
      const edges = JSON.parse(await a.eval(`JSON.stringify((() => {
        const L = (s) => { const el = document.querySelector(s);
          return el ? Math.round(el.getBoundingClientRect().left) : null; };
        const foot = document.getElementById('rail-foot');
        const glyphs = [...foot.querySelectorAll('.btn.ghost')]
          .filter((b) => b.offsetParent !== null);
        const tops = glyphs.map((b) => Math.round(b.getBoundingClientRect().top));
        return {
          chip: L('#identity-chip'), row: L('#rail-pools .rp-item'),
          glyph: glyphs.length ? Math.round(glyphs[0].getBoundingClientRect().left) : null,
          oneRow: new Set(tops).size === 1,
          named: (document.getElementById('identity-name').textContent || '').trim(),
          footBottomGap: Math.round(
            document.getElementById('left-panel').getBoundingClientRect().bottom
            - foot.getBoundingClientRect().bottom),
        };
      })())`));
      assert.ok(Math.abs(edges.chip - edges.row) <= 1,
        `the identity chip shares the rows' left edge (chip ${edges.chip}, row ${edges.row})`);
      assert.ok(Math.abs(edges.glyph - edges.row) <= 2,
        `so does the foot (glyph ${edges.glyph}, row ${edges.row})`);
      assert.equal(edges.oneRow, true, 'the foot is one row, never a stacked column');
      assert.ok(edges.footBottomGap <= 4,
        `and it sits at the foot of the column (gap ${edges.footBottomGap}px)`);
      assert.equal(edges.named, 'Alice',
        'you are NAMED in the rail — never a bare unexplained dot');

      // YOUR NAME DOES NOT MOVE (Joe 2026-08-07: collapsing "makes the
      // vertical position of the name 'jump around'" and left a band of
      // blank space at the top for no obvious reason). It jumped 25px,
      // because the collapsed rail carried a 34px top inset written to
      // clear a chevron that lives in the divider strip and never reached
      // it. Both states must put the name at the same y.
      const nameY = `(() => { const r = document.getElementById('identity-name')
        .getBoundingClientRect(); return Math.round(r.top + r.height / 2); })()`;
      const yCollapsed = await a.eval(nameY);
      await a.dbg('setPanelState({pools: true})');
      const yExpanded = await a.eval(nameY);
      await a.dbg('setPanelState({pools: false})');
      assert.equal(yCollapsed, yExpanded,
        `the name holds its line through a toggle (collapsed ${yCollapsed}, expanded ${yExpanded})`);

      // expand again: the quick list yields to the full workbench
      await a.eval(`document.getElementById('edge-toggle').click()`);
      assert.equal((await a.dbg('panelState')).pools, true, 'the strip expands it back');
      assert.equal(await a.eval(`document.getElementById('rail-pools').offsetParent !== null`),
        false, 'the quick list is collapsed-only');
    },
  },
  {
    name: 'pools-quick',
    tags: ['smoke', 'chrome', 'groups'],
    // THE RACK (2026-08-01): sources add, the pool rolls. At rest the panel
    // is read-only tiles on category shelves — tapping a tile STAGES its
    // dice into the sticky draft (never a broadcast roll); ± rides each
    // tile's revealed corner (USE); ✎ gates manage overlays + the copy-link
    // toolbar. Digits stage by rendered order; the draft cluster is the ONE
    // gold roll button. No button ever nests inside a button.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      // origins share a profile across scenarios: seed the rack explicitly
      await a.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}, {name: 'Percentile', notation: 'd100'}])`);

      // Read-only rest state: tiles, no edit chrome, no gold on the shelf.
      assert.equal(await a.eval(`document.querySelectorAll('#builder-panel .group-edit, #builder-panel .group-del').length`),
        0, 'no per-tile edit chrome at rest');
      assert.equal(await a.eval(`!!document.getElementById('copy-link')`), false,
        'copy-link is retired — sharing a rack is Settings → Your data → Export');
      assert.ok(await a.eval(`document.getElementById('pools-edit').offsetHeight > 20`),
        'the Edit pools toggle stands full-width at the rack foot');
      assert.ok(await a.eval(`document.querySelectorAll('#groups-list .tile-stage').length >= 3`),
        'every pool is a stage tile');
      assert.equal(await a.eval(`document.querySelectorAll('#groups-list .roll-cue').length`),
        0, 'no ROLL cue on the shelf — gold belongs to the draft alone');
      assert.equal(await a.eval(`document.querySelectorAll('#builder-panel button button').length`),
        0, 'no button nests inside a button');

      // A tile STAGES (quiet, local); the draft cluster rolls.
      const logBefore = await a.logCount();
      await a.eval(`document.querySelector('#groups-list .pool-tile:not(.ghost) .tile-stage').click()`);
      let ts = await a.dbg('trayState');
      assert.ok(ts.dice.length > 0, 'the tile poured its dice into the draft');
      assert.ok(ts.sources.some(Boolean), 'staged dice carry their source pool');
      // the DOM, not just the state: the first stage must PAINT immediately
      // (regression: paintCmd's diff skipped the render until a second stage)
      assert.equal(await a.eval(`document.getElementById('tray-roll').classList.contains('hidden')`),
        false, 'the cluster shows on the FIRST stage');
      assert.ok(await a.eval(`document.querySelectorAll('#tray-roll .src-chip').length >= 1`),
        'the source chip painted immediately');
      assert.equal(await a.logCount(), logBefore, 'staging never broadcasts a roll');
      assert.ok((await a.eval(`document.getElementById('cmd-input').value`)).includes('['),
        'the draft notation carries the source label');
      await a.eval(`document.getElementById('tray-roll').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(60), document.getElementById('log-list').childElementCount > ${logBefore})`,
        { desc: 'the draft cluster rolls the staged pool' },
      );
      await a.eval(`document.getElementById('clear-tray').click()`);

      // The tile's ± corner is retired: right-click is the per-tile popover
      // path now (tweaking otherwise lives on the staged draft's ±).
      assert.equal(await a.eval(`document.querySelectorAll('#groups-list .tile-mods').length`), 0,
        'no ± corner on tiles');
      await a.eval(`document.querySelector('#groups-list .pool-tile:not(.ghost)')
        .dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}))`);
      const pop = await a.dbg('popover');
      assert.ok(pop && pop.open && pop.source === 'group', 'right-click opens the popover on the pool');
      await a.eval(`document.getElementById('pop-close').click()`);

      // Digits stage by rendered order; Enter rolls the composed draft.
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '1'}))`);
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '2'}))`);
      ts = await a.dbg('trayState');
      assert.ok(new Set(ts.sources.filter(Boolean)).size >= 2, 'two pools staged by digits');
      const logMid = await a.logCount();
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))`);
      await a.waitFor(
        `(window.__diceDebug.sim(60), document.getElementById('log-list').childElementCount > ${logMid})`,
        { desc: "Enter rolls the staged draft ('1 2 Enter')" },
      );

      // Esc empties a staged draft before it ever sweeps the table.
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '1'}))`);
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
      assert.deepEqual((await a.dbg('trayState')).dice, [], 'Esc clears the staged draft first');

      // Manage mode (the Sheet Pass): the ✎ pencils are RETIRED — the ✕
      // stands (what the gate is for), the standing bar frames the state,
      // and tapping a whole tile opens its editor popover instead of
      // staging. Digits still stage.
      assert.equal(await a.dbg('setPoolsEditMode(true)'), true, '✎ enters manage mode');
      assert.equal(await a.eval(`document.querySelectorAll('#builder-panel .group-edit, #builder-panel .tile-edit').length`),
        0, 'no per-tile pencils anywhere');
      assert.ok(await a.eval(`document.querySelectorAll('#builder-panel .tile-del').length >= 3`),
        'the destructive ✕ overlays stand');
      assert.equal(await a.eval(`document.getElementById('pools-toolbar').classList.contains('on')`),
        true, 'the bar morphs into its EDITING dress');
      assert.equal(await a.eval(`getComputedStyle(document.getElementById('pools-edit')).display`),
        'none', 'the toggle yields to the bar');
      await a.eval(`document.querySelector('#groups-list .pool-tile:not(.ghost) .tile-stage').click()`);
      assert.deepEqual((await a.dbg('trayState')).dice, [], 'a manage-mode tile tap never stages');
      assert.ok(await a.dbg('stripState'), 'it opens the identity strip instead');
      await a.dbg('closePopover()');
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '1'}))`);
      assert.ok((await a.dbg('trayState')).dice.length > 0, 'digits still stage in manage mode');
      await a.eval(`document.getElementById('clear-tray').click()`);

      // Done exits; collapsing the panel also exits (transience).
      await a.eval(`document.getElementById('pools-done').click()`);
      assert.equal(await a.dbg('poolsEditMode'), false, 'Done exits manage mode');
      await a.dbg('setPoolsEditMode(true)');
      await a.dbg('setPanelState({pools: false})');
      assert.equal(await a.dbg('poolsEditMode'), false, 'collapsing the panel exits manage mode');
      await a.dbg('setPanelState({pools: true})');
    },
  },
  {
    name: 'saved-group-edit',
    tags: ['smoke', 'groups'],
    // Saved-group editing writes back to the SAME record by id: renaming no
    // longer forks a duplicate and an unnamed group can be updated. The
    // inline row editor (✎ → Update/Cancel) and the ± popover's 'Update this
    // group' both land on that path; 'Save as variant' stays additive.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      // origins share a profile across scenarios: seed the rack explicitly
      await a.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}, {name: 'Percentile', notation: 'd100'}])`);
      const before = await a.dbg('groups');
      const atk = before.find((g) => g.name === 'Attack');
      const dmg = before.find((g) => g.name === 'Damage');
      assert.ok(atk && dmg, 'the seed groups exist');

      // Rename + retune BY ID — same count, no forked duplicate.
      const out = await a.dbg(`editPool(${JSON.stringify(atk.id)}, {name: 'Strike', notation: ' 1d20 + 5 '})`);
      assert.equal(out && out.name, 'Strike', 'rename applied');
      assert.equal(out.notation, '1d20+5', 'notation stored canonical');
      let gs = await a.dbg('groups');
      assert.equal(gs.length, before.length, 'rename did not fork a duplicate');
      assert.ok(!gs.some((g) => g.name === 'Attack'), 'the old name is gone');

      // Refusals leave the record untouched.
      assert.equal(await a.dbg(`editPool(424242, {name: 'x'})`), false, 'unknown id refused');
      assert.equal(await a.dbg(`editPool(${JSON.stringify(atk.id)}, {notation: 'not dice'})`), false, 'bad notation refused');
      gs = await a.dbg('groups');
      assert.equal(gs.find((g) => g.id === atk.id).notation, '1d20+5', 'refusal left the record alone');

      // The unnamed-can't-update bug is dead: strip the name, then update.
      await a.dbg(`editPool(${JSON.stringify(dmg.id)}, {name: ''})`);
      const up = await a.dbg(`editPool(${JSON.stringify(dmg.id)}, {notation: '2d8'})`);
      assert.equal(up && up.notation, '2d8', 'an unnamed group updates in place');
      assert.equal((await a.dbg('groups')).length, before.length, 'still no duplicate');

      // The Sheet Pass: renaming lives on the popover's identity strip;
      // the slimmed card owns NOTATION only, reached via 'Edit notation…'.
      assert.equal(await a.dbg(`poolPopoverOpen(${JSON.stringify(atk.id)})`), true, 'strip opens');
      await a.eval(`document.querySelector('#pop-name .pid-name').click()`);
      await a.eval(`(() => {
        const i = document.querySelector('#pop-name .pid-name-input');
        i.value = 'Alpha Strike';
        i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      })()`);
      gs = await a.dbg('groups');
      assert.equal(gs.find((g) => g.id === atk.id).name, 'Alpha Strike', 'the strip renamed in place');
      assert.equal(gs.length, before.length, 'and forked nothing');
      // 'Strike' is 1d20+5 — complex, so the strip offers the notation door
      await a.eval(`[...document.querySelectorAll('#pop-identity .pid-ghost-verb')]
        .find((b) => b.textContent.startsWith('Edit notation')).click()`);
      await a.eval(`(() => {
        const notation = document.querySelector('#groups-list .ge-notation');
        notation.value = '3d8+2';
        notation.dispatchEvent(new Event('input'));
        document.querySelector('#groups-list .ge-update').click();
      })()`);
      gs = await a.dbg('groups');
      const edited = gs.find((g) => g.id === atk.id);
      assert.equal(edited.name, 'Alpha Strike', 'the rename survived');
      assert.equal(edited.notation, '3d8+2', 'the card rewrote the notation');
      assert.equal(gs.length, before.length, 'still no fork');
      assert.equal(await a.eval(`!!document.querySelector('#groups-list .group-row.editing')`), false, 'card closed');

      // A notation that doesn't parse pins the card open, Update dead;
      // Cancel reverts.
      await a.dbg(`poolPopoverOpen(${JSON.stringify(atk.id)})`);
      await a.eval(`[...document.querySelectorAll('#pop-identity .pid-ghost-verb')]
        .find((b) => b.textContent.startsWith('Edit notation')).click()`);
      await a.eval(`(() => {
        const notation = document.querySelector('#groups-list .ge-notation');
        notation.value = 'not dice';
        notation.dispatchEvent(new Event('input'));
      })()`);
      assert.equal(await a.eval(`document.querySelector('#groups-list .ge-update').disabled`), true,
        'Update disabled on a bad notation');
      await a.eval(`document.querySelector('#groups-list .ge-cancel').click()`);
      assert.equal((await a.dbg('groups')).find((g) => g.id === atk.id).notation, '3d8+2', 'Cancel reverted');

      // ± popover: ONE commit verb (Trigger Pass) — Save rewrites in place
      // by id; Duplicate… adds. Roll/Offer are gone from the popover.
      assert.equal(await a.dbg(`openPopoverFor(${JSON.stringify(atk.id)})`), true, 'popover opens');
      assert.equal(await a.eval(`!!document.getElementById('pop-roll') || !!document.getElementById('pop-offer')`),
        false, 'the popover neither rolls nor offers (pure editor)');
      assert.equal(await a.eval(`document.getElementById('pop-save').classList.contains('hidden')`), false,
        'Save offered for a saved group');
      await a.eval(`(() => {
        const dc = document.getElementById('pop-dc');
        dc.value = '15';
        dc.dispatchEvent(new Event('input'));
      })()`);
      await a.eval(`document.getElementById('pop-save').click()`);
      assert.equal(await a.dbg('popover'), null, 'popover closed by Save');
      gs = await a.dbg('groups');
      assert.equal(gs.length, before.length, 'save-in-place added nothing');
      const dced = gs.find((g) => g.id === atk.id);
      assert.ok(dced.notation.includes('dc15'), `the dc landed on the record (got: ${dced.notation})`);
      assert.equal(dced.name, 'Alpha Strike', 'the name survived the popover save');

      // Duplicate…: the same inline-name morph as the panel's Save (one
      // flow), prefilled with a suggested variant name; Enter mints a NEW
      // pool — additive, the original untouched.
      await a.dbg(`openPopoverFor(${JSON.stringify(atk.id)})`);
      await a.eval(`document.getElementById('pop-variant').click()`);
      assert.equal(await a.eval(`document.getElementById('pop-save-row').classList.contains('hidden')`),
        false, 'Duplicate morphs into the name row');
      assert.ok(await a.eval(`document.getElementById('pop-save-name').value.length > 0`),
        'a pool-bound Duplicate suggests a name');
      await a.eval(`document.getElementById('pop-save-name').dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))`);
      gs = await a.dbg('groups');
      assert.equal(gs.length, before.length + 1, 'Duplicate stays additive');
      assert.ok(gs.find((g) => g.id === atk.id), 'the original survives beside the new pool');

      // The ad-hoc draft is a LIVE editor: its edits land straight in the
      // box as the canonical, so it carries NO commit verb — only Done
      // (Joe 2026-08-04: the row stands on every source now, and 'save as
      // pool on the tray's ± is confusing — only offer Done in that
      // context'). Asserted COMPUTED, not by class: the row's own hide was
      // what used to conceal these, and a class alone hid nothing (D2).
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = 'd6';
        box.dispatchEvent(new Event('input'));
      })()`);
      assert.equal(await a.dbg(`openPopoverFor('tray')`), true, 'draft popover opens');
      const trayVerbs = await a.eval(`(() => {
        const vis = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
        return { done: vis('pop-done'), save: vis('pop-save'),
                 variant: vis('pop-variant'), toDraft: vis('pop-todraft') };
      })()`);
      assert.deepEqual(trayVerbs, { done: true, save: false, variant: false, toDraft: false },
        `the ad-hoc draft offers Done alone (got ${JSON.stringify(trayVerbs)})`);
      await a.eval(`(() => {
        const dc = document.getElementById('pop-dc');
        dc.value = '7';
        dc.dispatchEvent(new Event('input'));
      })()`);
      assert.equal(await a.eval(`document.getElementById('cmd-input').value`), '1d6 dc7',
        'a popover edit live-syncs into the draft box');
      await a.dbg('closePopover()');
      assert.equal(await a.eval(`document.getElementById('cmd-input').value`), '1d6 dc7',
        'the synced draft survives the popover closing');
    },
  },
  {
    // RENAMED from 'auto-collect' (2026-08-03): it shared its name — and
    // therefore its ROOM, which the harness keys by scenario name — with
    // the displacement scenario above, whose shelf residue made this one's
    // shelf-count assertions a scheduling coin flip. run.mjs now refuses
    // duplicate names outright.
    name: 'tidy-away',
    tags: ['shelf'],
    // The tidy-away clock (2026-08-01): a finished OPEN roll of yours
    // collects itself after a quiet moment; the shelf cluster's quick ✕
    // clears it in one click (no peek transit); a hidden roll stands until
    // its reveal. Tests opt in — the harness boots with the clock off.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      assert.equal(await a.dbg('autoCollectMs'), 0, 'the harness boots with the clock off');
      await a.dbg('setAutoCollectMs(250)');
      await a.roll('2d6');
      await a.waitFor(`(window.__diceDebug.sim(60), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'the roll collected itself' });

      // the folded card (2026-08-03): the marker OPENS the card; the card's
      // BODY is the one big clear target (the sweep-over-the-dice retired)
      assert.equal(await a.eval(`!!document.querySelector('.shelf-marker .shelf-sweep')`), false,
        'no ✕ over the dice');
      await a.eval(`document.querySelector('.shelf-marker').click()`);
      assert.ok(await a.dbg('peekState'), 'the marker click opens the card');
      await a.eval(`document.querySelector('#peek-card .pk-main').click()`);
      await a.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length === 0 && window.__diceDebug.shelf.length === 0)`,
        { desc: 'the card body click cleared it' });

      // a held roll does NOT tidy itself — the standing tension is the point
      await a.dbg('setAutoCollectMs(120)');
      await a.roll('1d20 held');
      await new Promise((r) => setTimeout(r, 500));
      await a.dbg('sim(60)');
      assert.equal((await a.dbg('shelf')).length, 0, 'a hidden roll stays on the felt');
      assert.ok(await a.diceCount() > 0, 'its dice stand until the reveal');
    },
  },
  {
    name: 'soul-seed',
    tags: ['groups'],
    // The pre-Soul-Deal starter trio (Attack/Damage/Percentile, untouched)
    // upgrades to the Soul Deal rack on the next boot — it was never the
    // player's own work. One edit and the rack is theirs: no swap.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}, {name: 'Percentile', notation: 'd100'}])`);
      const b = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const gs = await b.dbg('groups');
      assert.equal(gs.length, 11, `the old trio upgraded (got ${gs.length})`);
      assert.equal(gs[0].name, 'Strength', 'attributes lead the rack');
      assert.equal(await b.eval(`document.querySelector('#groups-list .pool-sec-head').textContent`),
        'Attributes', 'the shelves are live');

      // a touched rack is the player's: rename one pool, reboot — no swap
      await b.dbg(`setGroups([{name: 'MyAttack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}, {name: 'Percentile', notation: 'd100'}])`);
      const c2 = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      assert.equal((await c2.dbg('groups')).length, 3, 'an edited rack never swaps');
    },
  },
  {
    name: 'sheet-pass',
    tags: ['smoke', 'groups'],
    // THE SHEET PASS (2026-08-01): the rack is the character sheet. The
    // pool popover's identity strip renames, re-shelves and re-ranks in
    // place (by id, instantly); ghost '+' tiles mint pools ON their shelf;
    // the rank ladder fails closed for complex notations; the save morph
    // lands a draft on a shelf via chips.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setGroups([{name: 'Claws', notation: '1d6', category: 'Attributes'},
        {name: 'Damage', notation: '3d4'},
        {name: 'Hunt', notation: '2d8[Wisdom]+1d4[Zeal] dc12'}])`);
      const gs0 = await a.dbg('groups');
      const claws = gs0.find((g) => g.name === 'Claws');
      const damage = gs0.find((g) => g.name === 'Damage');
      const hunt = gs0.find((g) => g.name === 'Hunt');

      // rest state is pure play: only populated shelves, no ghosts
      let heads = await a.eval(`[...document.querySelectorAll('.pool-sec-head')].map((h) => h.textContent)`);
      assert.deepEqual(heads, ['Attributes', 'Pools'], `rest shows populated shelves only (got: ${heads})`);
      assert.equal(await a.eval(`document.querySelectorAll('#groups-list .pool-tile.ghost').length`),
        0, 'no ghost tiles at rest');

      // ✎ opens the sheet: trio shelves stand (even empty), each with its
      // ghost. Manage mode appends the dice-value figure to each head
      // (§2l ③), so these two manage-state reads target .psh-word.
      await a.dbg('setPoolsEditMode(true)');
      heads = await a.eval(`[...document.querySelectorAll('.pool-sec-head .psh-word')].map((h) => h.textContent)`);
      for (const want of ['Attributes', 'Skills', 'Motivations', 'Pools']) {
        assert.ok(heads.includes(want), `editing shows the ${want} shelf (got: ${heads})`);
      }
      assert.ok(await a.eval(`document.querySelectorAll('#groups-list .pool-tile.ghost').length >= 4`),
        'every shelf ends in a ghost + tile');

      // '＋ New shelf…' mints a session shelf; its ghost mints the pool that
      // makes it real; unused shelves evaporate on Done
      await a.eval(`document.querySelector('.new-shelf-row .new-shelf').click()`);
      await a.eval(`(() => {
        const i = document.querySelector('.new-shelf-input');
        i.value = 'Spells';
        i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      })()`);
      heads = await a.eval(`[...document.querySelectorAll('.pool-sec-head .psh-word')].map((h) => h.textContent)`);
      assert.ok(heads.includes('Spells'), `the new shelf stands (got: ${heads})`);
      await a.dbg(`openCreation('spells')`);
      await a.eval(`(() => {
        const i = document.querySelector('#groups-list .cc-name');
        i.value = 'Firebolt';
        i.dispatchEvent(new Event('input'));
        i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      })()`);
      const firebolt = (await a.dbg('groups')).find((g) => g.name === 'Firebolt');
      assert.equal(firebolt && firebolt.category, 'Spells', 'the shelf ghost minted onto the new shelf');

      // the card COMPOSES like the palette: taps add, the preview removes
      await a.dbg(`openCreation('spells')`);
      await a.eval(`document.querySelector('#groups-list .cc-die .pid-rank[data-die="d6"]').click()`);
      await a.eval(`document.querySelector('#groups-list .cc-die .pid-rank[data-die="d8"]').click()`);
      await a.eval(`(() => {
        const i = document.querySelector('#groups-list .cc-name');
        i.value = 'Blast';
        i.dispatchEvent(new Event('input'));
        i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      })()`);
      const blast = (await a.dbg('groups')).find((g) => g.name === 'Blast');
      assert.equal(blast && blast.notation, '2d6+1d8',
        `taps ADD dice — a multi-die pool mints in one card (got: ${blast && blast.notation})`);
      await a.dbg('setPoolsEditMode(true)'); // minting exits nothing — but the Done below expects ✎ on
      await a.dbg(`openCreation('spells')`);
      await a.eval(`document.querySelector('#groups-list .cc-pool .cc-unit').click()`);
      assert.equal(await a.eval(`document.querySelectorAll('#groups-list .cc-pool .cc-unit').length`), 0,
        'tapping a preview unit removes it (empty pools cannot mint)');
      await a.eval(`document.querySelector('#groups-list .cc-cancel').click()`);
      await a.dbg('setPoolsEditMode(false)');
      heads = await a.eval(`[...document.querySelectorAll('.pool-sec-head')].map((h) => h.textContent)`);
      assert.ok(heads.includes('Spells'), 'a shelf with a pool persists past Done');
      await a.dbg('setPoolsEditMode(true)');
      await a.eval(`document.querySelector('.new-shelf-row .new-shelf').click()`);
      await a.eval(`(() => {
        const i = document.querySelector('.new-shelf-input');
        i.value = 'Empty';
        i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      })()`);
      await a.dbg('setPoolsEditMode(false)');
      heads = await a.eval(`[...document.querySelectorAll('.pool-sec-head')].map((h) => h.textContent)`);
      assert.ok(!heads.includes('Empty'), 'an unused session shelf evaporates on Done');

      // CUJ rename: two gestures — open the strip, click the name, type.
      assert.equal(await a.dbg(`poolPopoverOpen(${JSON.stringify(claws.id)})`), true, 'the strip opens');
      await a.eval(`document.querySelector('#pop-name .pid-name').click()`);
      await a.eval(`(() => {
        const i = document.querySelector('#pop-name .pid-name-input');
        i.value = 'Fangs';
        i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      })()`);
      let gs = await a.dbg('groups');
      const nBefore = gs.length;
      assert.equal(gs.find((g) => g.id === claws.id).name, 'Fangs', 'renamed in place');
      assert.equal(gs.length, nBefore, 'no fork');
      assert.ok(await a.dbg('stripState'), 'the popover survives the rename');

      // CUJ advancement, composer idiom (Trigger Pass — 'the same behavior
      // as + pool for dice'): rank faces ADD a die, units REMOVE one; a
      // swap is remove + add. The popover stays open for chained edits.
      await a.eval(`document.querySelector('#pop-identity .pid-rank[data-die="d10"]').click()`);
      gs = await a.dbg('groups');
      assert.equal(gs.find((g) => g.id === claws.id).notation, '1d6+1d10', 'a face tap ADDS a die');
      await a.eval(`[...document.querySelectorAll('#pop-identity .pid-pool .cc-unit')]
        .find((u) => u.title.includes('d6')).click()`);
      gs = await a.dbg('groups');
      assert.equal(gs.find((g) => g.id === claws.id).notation, '1d10', 'removing the d6 completes the swap');
      assert.equal((await a.dbg('stripState')).units.length, 1, 'the composer tracks the record');
      assert.equal((await a.dbg('stripState')).units[0].disabled, true,
        'the last die cannot be removed — a pool is never empty');
      await a.dbg('closePopover()');

      // count edits are first-class: 3d4 + a d4 tap → 4d4; a unit tap → 3d4
      await a.dbg(`poolPopoverOpen(${JSON.stringify(damage.id)})`);
      await a.eval(`document.querySelector('#pop-identity .pid-rank[data-die="d4"]').click()`);
      assert.equal((await a.dbg('groups')).find((g) => g.id === damage.id).notation, '4d4',
        'a face tap grows the count (3d4 → 4d4)');
      await a.eval(`document.querySelector('#pop-identity .pid-pool .cc-unit').click()`);
      assert.equal((await a.dbg('groups')).find((g) => g.id === damage.id).notation, '3d4',
        'a unit tap removes one (4d4 → 3d4)');
      await a.dbg('closePopover()');

      // fail-closed: a complex pool gets no composer — its doors instead
      await a.dbg(`poolPopoverOpen(${JSON.stringify(hunt.id)})`);
      const hs = await a.dbg('stripState');
      assert.equal(hs.composer, false, 'complex notation fails the composer closed');
      assert.equal(hs.ranks, 0, 'no rank buttons rendered');
      assert.ok(await a.eval(`document.querySelectorAll('#pop-identity .pid-ghost-verb').length === 2`),
        'Edit notation… and Open in draft stand instead');

      // CUJ re-shelve: category is a chip, never typed
      await a.eval(`[...document.querySelectorAll('#pop-identity .pid-cat')]
        .find((b) => b.textContent.trim() === 'Skills').click()`);
      assert.equal((await a.dbg('groups')).find((g) => g.id === hunt.id).category, 'Skills',
        'a chip tap moves the pool to Skills');
      await a.eval(`[...document.querySelectorAll('#pop-identity .pid-cat')]
        .find((b) => b.getAttribute('aria-pressed') === 'true').click()`);
      assert.equal((await a.dbg('groups')).find((g) => g.id === hunt.id).category ?? null, null,
        'tapping the pressed chip demotes to the plain shelf');
      await a.dbg('closePopover()');

      // CUJ add-a-skill: ✎ → ghost tap + type + Enter; the shelf IS the category
      await a.dbg('setPoolsEditMode(true)');
      await a.dbg(`openCreation('skills')`);
      await a.eval(`(() => {
        const i = document.querySelector('#groups-list .cc-name');
        i.value = 'Archery';
        i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      })()`);
      gs = await a.dbg('groups');
      const archery = gs.find((g) => g.name === 'Archery');
      assert.ok(archery && archery.notation === '1d6' && archery.category === 'Skills',
        `the ghost minted {Archery, 1d6, Skills} (got: ${JSON.stringify(archery)})`);

      // the newborn contract: Esc discards, nothing minted
      await a.dbg(`openCreation('motivations')`);
      await a.eval(`document.querySelector('#groups-list .cc-name')
        .dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))`);
      assert.equal((await a.dbg('groups')).length, gs.length, 'Esc minted nothing');
      assert.equal(await a.dbg('creatingShelf'), null, 'the card closed');
      await a.dbg('setPoolsEditMode(false)');

      // a composer tap must NOT wipe the draft below the hairline
      // (regression: stripCommit reseeded pop wholesale and blanked a
      // mid-typed dc — the composer keeps the old rank-swap's contract)
      await a.dbg(`poolPopoverOpen(${JSON.stringify(damage.id)})`);
      await a.eval(`(() => {
        const dc = document.getElementById('pop-dc');
        dc.value = '15';
        dc.dispatchEvent(new Event('input'));
      })()`);
      await a.eval(`document.querySelector('#pop-identity .pid-rank[data-die="d12"]').click()`);
      assert.equal(await a.eval(`document.getElementById('pop-dc').value`), '15',
        'the mid-typed dc survives a composer tap');
      assert.equal((await a.dbg('groups')).find((g) => g.id === damage.id).notation, '3d4+1d12',
        'and the die still landed');
      await a.dbg('closePopover()');

      // the ghost's REAL click path (not just the hook): card opens, typed
      // name survives an unrelated repaint, click-away keeps a typed card
      await a.dbg('setPoolsEditMode(true)');
      await a.eval(`[...document.querySelectorAll('#groups-list .pool-grid')]
        .map((g) => g.querySelector('.ghost-add')).filter(Boolean)[1].click()`);
      assert.ok(await a.dbg('creatingShelf'), 'the ghost click opens its card');
      await a.eval(`(() => {
        const i = document.querySelector('#groups-list .cc-name');
        i.value = 'Stealth';
        i.dispatchEvent(new Event('input'));
      })()`);
      await a.dbg('renderGroups()'); // any repaint (pools-changed, manage toggle…)
      assert.equal(await a.eval(`document.querySelector('#groups-list .cc-name').value`), 'Stealth',
        'a typed name survives a repaint');
      await a.eval(`document.getElementById('scene-container').dispatchEvent(
        new PointerEvent('pointerdown', {bubbles: true}))`);
      await new Promise((r) => setTimeout(r, 50));
      assert.ok(await a.dbg('creatingShelf'), 'click-away KEEPS a typed card (commit stays explicit)');
      await a.eval(`document.querySelector('#groups-list .cc-cancel').click()`);

      // click-away DISCARDS an untouched card silently
      await a.dbg(`openCreation('motivations')`);
      await a.eval(`document.getElementById('scene-container').dispatchEvent(
        new PointerEvent('pointerdown', {bubbles: true}))`);
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(await a.dbg('creatingShelf'), null, 'an untouched card discards on click-away');
      await a.dbg('setPoolsEditMode(false)');

      // deleting a pool in manage mode closes its open strip
      await a.dbg(`poolPopoverOpen(${JSON.stringify(claws.id)})`);
      await a.dbg('setPoolsEditMode(true)');
      await a.dbg(`poolPopoverOpen(${JSON.stringify(claws.id)})`);
      await a.eval(`document.querySelector('#groups-list [data-group-id="${claws.id}"] .tile-del').click()`);
      assert.equal(await a.dbg('popover'), null, 'the strip closes with its pool');
      await a.dbg('setPoolsEditMode(false)');

      // (the save-morph shelf-chips case retired 2026-08-04 with the rim's
      // Save — the shelf-at-birth contract lives in the ✎ ghost tiles,
      // pinned by sheet-pass: 'the shelf you tapped IS the category'.)
    },
  },
  {
    name: 'sheet-touch',
    tags: ['groups'],
    // The 500ms hold door: a touch hold opens the pool popover and the
    // synthetic click that follows is suppressed (never a stage); a hold
    // over an already-open popover suppresses too (regression: it staged).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setGroups([{name: 'Claws', notation: '1d6', category: 'Attributes'}])`);
      const press = async () => {
        await a.eval(`(() => {
          const t = document.querySelector('#groups-list .pool-tile:not(.ghost) .tile-stage');
          t.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10}));
        })()`);
        await new Promise((r) => setTimeout(r, 620));
        await a.eval(`(() => {
          const t = document.querySelector('#groups-list .pool-tile:not(.ghost) .tile-stage');
          t.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10}));
          t.click();
        })()`);
      };
      await press();
      assert.ok(await a.dbg('stripState'), 'the hold opened the strip');
      assert.deepEqual((await a.dbg('trayState')).dice, [], 'and the synthetic click never staged');
      await press(); // popover already open: still no stage-through
      assert.deepEqual((await a.dbg('trayState')).dice, [], 'a hold over the open popover stays a no-op');
      await a.dbg('closePopover()');
      // a real tap (no hold) still stages
      await a.eval(`document.querySelector('#groups-list .pool-tile:not(.ghost) .tile-stage').click()`);
      assert.ok((await a.dbg('trayState')).dice.length > 0, 'a plain tap still stages');
    },
  },
  {
    name: 'rack-dice-value',
    tags: ['groups', 'chrome'],
    // THE DICE-VALUE LEDGER (§2l ③): manage-and-measure — figures exist
    // only while ✎ is on (BUILT, not hidden), one right-flush column, never
    // on a foreign rack. Both spellings of 2d20-keep-1 price 40: the ledger
    // counts physical dice, so canonicalization cannot split the price.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.dbg(`setGroups([
        {name: 'Claws', notation: '1d6', category: 'Attributes'},
        {name: 'Fangs', notation: '2d8', category: 'Attributes'},
        {name: 'Edge', notation: '1d20 adv', category: 'Skills'},
        {name: 'Kept', notation: '2d20 kh1', category: 'Skills'}])`);

      assert.equal(await a.eval(
        `document.querySelectorAll('.psh-fig, #pools-head .ph-fig').length`), 0,
        'no figures at rest');

      await a.dbg('setPoolsEditMode(true)');
      const led = await a.dbg('rackDiceValue');
      assert.equal(led.total, 102, `rack total: 6+16+40+40 (got ${led.total})`);
      const shelf = (l) => led.shelves.find((s) => s.label === l).value;
      assert.equal(shelf('Attributes'), 22, 'Attributes shelf value');
      assert.equal(shelf('Skills'), 80, "'1d20 adv' and '2d20 kh1' both read 40");
      assert.equal(shelf('Motivations'), 0, 'an empty trio shelf reads 0');
      const figs = await a.eval(
        `[...document.querySelectorAll('.pool-sec-head .psh-fig')].map((f) => f.textContent)`);
      assert.ok(figs.includes('22') && figs.includes('80'), `shelf figures render (got: ${figs})`);
      assert.equal(await a.eval(`document.querySelector('#pools-head .ph-fig b').textContent`),
        '102', 'the rack total rides the region head');
      assert.ok((await a.eval(`document.querySelector('#pools-head .ph-fig').textContent`))
        .includes('dice value'), 'the standing word is paid once at the top');

      // editing a pool moves shelf and rack together
      const claws = (await a.dbg('groups')).find((g) => g.name === 'Claws');
      await a.dbg(`editPool(${JSON.stringify(claws.id)}, {notation: '1d20'})`);
      assert.equal((await a.dbg('rackDiceValue')).total, 116, 'd6 → d20 moves the rack total');
      assert.equal(await a.eval(
        `[...document.querySelectorAll('.pool-sec-head .psh-fig')][0].textContent`), '36',
        'and the shelf figure with it');

      // Done: the instruments leave with the manage chrome
      await a.dbg('setPoolsEditMode(false)');
      assert.equal(await a.eval(
        `document.querySelectorAll('.psh-fig, #pools-head .ph-fig').length`), 0,
        'figures are gone at Done — built only in manage mode');

      // a foreign rack never carries a figure (the ledger measures YOUR rack)
      await b.waitFor(`window.__diceDebug.netPlayers.some((p) =>
        p.name === 'Alice' && p.pools.length === 4)`, { desc: "Alice's rack reaches Bob" });
      const alice = (await b.dbg('netPlayers')).find((p) => p.name === 'Alice');
      await b.dbg(`setPoolsOwner(${JSON.stringify(alice.id)})`);
      assert.ok(await b.eval(`document.querySelectorAll('#groups-list .pool-sec-head .psh-word').length >= 1`),
        'foreign shelf heads keep the wrapper dress');
      assert.equal(await b.eval(
        `document.querySelectorAll('.psh-fig, #pools-head .ph-fig').length`), 0,
        'no figures on a foreign rack');
      await b.dbg('setPoolsOwner(null)');
    },
  },
  {
    name: 'pool-forecast',
    tags: ['groups', 'meanings'],
    // THE SPECTRUM BARS (§2l ④): per-die forecast in the ± popover — exact
    // by construction, deduplicated never aggregated, keep/drop refused,
    // d10x is the single italic quiet, and a system flip repaints the OPEN
    // popover rather than leaving a stale spectrum.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setSystem('soul-deal')`);
      await a.dbg(`setGroups([{name: 'Grit', notation: '3d6', category: 'Attributes'},
        {name: 'Mixed', notation: '1d4+2d6'}, {name: 'Sliver', notation: '1d4+8d6'},
        {name: 'Kept', notation: '4d6dl1'}, {name: 'Fate', notation: '2d10x'}])`);
      await a.dbg('setPoolsEditMode(true)'); // the group door opens inside ✎
      const pool = async (name) => (await a.dbg('groups')).find((g) => g.name === name);

      assert.equal(await a.dbg(`poolPopoverOpen(${JSON.stringify((await pool('Grit')).id)})`),
        true, 'the ± opens on a saved pool');
      assert.equal(await a.eval(`document.querySelector('#pop-preview .pop-stats-label').textContent`),
        'Pool stats', 'the section is labeled as such');
      // (?) opens the sectioned help anchored at pool-stats — in-dialog
      // anchors only; the URL keeps carrying nothing
      await a.eval(`document.querySelector('#pop-preview .help-bubble').click()`);
      assert.equal(await a.dbg('helpOpen'), true, 'the bubble opens help');
      assert.ok(await a.eval(`document.querySelector('#help-pool-stats').classList.contains('lit')`),
        'anchored at the stats section');
      assert.ok((await a.eval(`document.querySelector('#help-pool-stats .help-math').textContent`))
        .includes('÷ N'), 'the mixture formula is stated');
      assert.equal(await a.eval(`location.hash`), '', 'the URL still carries nothing');
      await a.eval(`document.getElementById('help-overlay').click()`);
      assert.equal(await a.dbg('helpOpen'), false, 'the backdrop closes help');
      // the rail ? opens help un-anchored, and the nav reaches every section
      await a.eval(`document.getElementById('rail-help').click()`);
      assert.equal(await a.dbg('helpOpen'), true, 'the rail ? opens help');
      assert.equal(await a.eval(`document.querySelectorAll('#help-body section.lit').length`), 0,
        'no section pre-lit from the top-level door');
      await a.eval(`document.querySelector('#help-nav [data-topic="rolls"]').click()`);
      assert.ok(await a.eval(`document.querySelector('#help-rolls').classList.contains('lit')`),
        'the nav lights the rolls section');
      assert.ok((await a.eval(`document.querySelector('#help-rolls').textContent`))
        .includes('pose seed'), 'the fairness story names the mechanism');
      await a.dbg('closeHelp()');
      assert.equal(await a.eval(`document.querySelectorAll('#pop-preview .fc-row').length`), 1,
        'three identical d6 share ONE bar — deduplication, not aggregation');
      const sentence = await a.eval(`document.querySelector('#pop-preview .fc-text').textContent`);
      assert.ok(sentence.includes('Fail 17%') && sentence.includes('quiet 33%')
        && sentence.includes('Success & Bonus 17%'), `the d6 spectrum sentence (got: ${sentence})`);
      assert.ok((await a.eval(`document.querySelector('#pop-preview .fc-label').textContent`))
        .includes('3×d6'), 'the bar is labeled with count and rank');
      assert.equal(await a.eval(`document.querySelectorAll('#pop-preview .fc-seg').length`), 5,
        'five segments in the chart’s own row order');
      // hovering a segment names it in the fixed readout below the bar
      await a.eval(`document.querySelectorAll('#pop-preview .fc-seg')[3]
        .dispatchEvent(new MouseEvent('mouseenter'))`);
      assert.equal(await a.eval(`document.querySelector('#pop-preview .fc-read-text').textContent`),
        'Success · 17%', 'the readout names the hovered segment in full');
      assert.equal(await a.eval(`document.querySelectorAll('#pop-preview .fc-toggle').length`), 0,
        'one rank needs no view toggle');

      // mixed pools collapse to one count-weighted line by default (Joe
      // 2026-08-06); 'per die' expands to the true rows
      assert.equal(await a.dbg(`poolPopoverOpen(${JSON.stringify((await pool('Mixed')).id)})`), true);
      assert.equal(await a.eval(`document.querySelectorAll('#pop-preview .fc-row').length`), 1,
        'mixed pools default to one averaged line');
      assert.ok((await a.eval(`document.querySelector('#pop-preview .fc-label').textContent`))
        .includes('3 dice'), 'labeled as the average it is');
      const mixText = await a.eval(`document.querySelector('#pop-preview .fc-text').textContent`);
      assert.ok(mixText.includes('Fail 11%') && mixText.includes('Blemish 8%'),
        `count-weighted mixture in ladder order (got: ${mixText})`);
      await a.eval(`document.querySelector('#pop-preview .fc-toggle').click()`);
      assert.equal(await a.eval(`document.querySelectorAll('#pop-preview .fc-row').length`), 2,
        "'per die' expands to the true rows");
      await a.eval(`document.querySelector('#pop-preview .fc-toggle').click()`);

      // a sliver never disappears: 2px minimum stroke keeps it visible,
      // and hovering it fills the readout (1d4+8d6 → Blemish 2.8%)
      assert.equal(await a.dbg(`poolPopoverOpen(${JSON.stringify((await pool('Sliver')).id)})`), true);
      assert.equal(await a.eval(`document.querySelector('#pop-preview .fc-read-text').textContent`),
        '', 'the readout is reserved room — empty until hover, so nothing jumps');
      await a.eval(`document.querySelectorAll('#pop-preview .fc-seg')[1]
        .dispatchEvent(new MouseEvent('mouseenter'))`);
      assert.equal(await a.eval(`document.querySelector('#pop-preview .fc-read-text').textContent`),
        'Blemish · 3%', 'the sliver names itself in the readout');

      assert.equal(await a.dbg(`poolPopoverOpen(${JSON.stringify((await pool('Kept')).id)})`), true);
      assert.ok(/keep\/drop/.test(await a.eval(`document.getElementById('pop-preview').textContent`)),
        'keep/drop refuses — no per-die read before the roll');

      assert.equal(await a.dbg(`poolPopoverOpen(${JSON.stringify((await pool('Fate')).id)})`), true);
      assert.equal(await a.eval(`document.querySelectorAll('#pop-preview .fc-geo').length`), 0,
        'a wholly quiet die draws no bar geometry');
      assert.equal(await a.eval(`document.querySelector('#pop-preview .fc-allquiet').textContent`),
        'quiet', 'the single italic word (§3.4: never a 100%-wide dim bar)');

      await a.dbg(`setSystem('dnd')`); // online: applies on the settings echo
      await a.waitFor(`document.getElementById('pop-preview').textContent.includes('min ')`,
        { desc: 'system flip repaints the open popover into the sum world' });
      await a.dbg(`setSystem('soul-deal')`);
    },
  },
  {
    name: 'shared-pools',
    tags: ['smoke', 'groups'],
    // The owner switcher (ROADMAP 2b): racks publish to the room; a teammate
    // can browse them read-only and STAGE from them; digits never leave your
    // own rack; a staged chip is a snapshot a later edit cannot rewrite.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });

      // Seed BOTH racks explicitly — origins share a profile across
      // scenarios, so inherited state is nobody's contract.
      await a.dbg(`setGroups([{name: 'Claws', notation: '1d20', category: 'Attributes'},
        {name: 'Damage', notation: '3d4'}, {name: 'Percentile', notation: 'd100'}])`);
      await b.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}])`);
      // The predicate demands the FULL 3-pool rack: origins share a profile
      // across scenarios, and sheet-touch leaves a 1-pool Claws/Attributes
      // rack behind — Alice's join-time publish of THAT stale rack satisfied
      // a some()-only check and raced ahead of the debounced seed publish.
      await b.waitFor(`window.__diceDebug.netPlayers.some((p) =>
        p.name === 'Alice' && p.pools.length === 3
        && p.pools.some((g) => g.name === 'Claws' && g.category === 'Attributes'))`,
        { desc: "Alice's full seeded rack reaches Bob" });
      const alice = (await b.dbg('netPlayers')).find((p) => p.name === 'Alice');

      // The RAIL PILL is the browse verb (teammate consolidation
      // 2026-08-04): one per teammate, aria-pressed reflects poolsOwner.
      assert.equal(await b.eval(`document.querySelectorAll('#rail-roster .roster-name').length`), 1,
        'Bob sees one teammate pill (Alice)');

      // Manage mode is yours-only: the pill gates out (P2, same as tile
      // staging) so a stray click can never discard an open editor.
      await b.dbg('setPoolsEditMode(true)');
      assert.equal(await b.eval(`document.querySelector('#rail-roster .roster-name').disabled`),
        true, 'teammate pills are inert inside edit mode');
      await b.dbg('setPoolsEditMode(false)');
      // pill click via the real path (not the debug hook — the CUJ
      // this consolidation exists for)
      await b.eval(`[...document.querySelectorAll('#rail-roster .roster-name')]
        .find((p) => p.textContent.includes('Alice')).click()`);
      assert.equal(await b.dbg('poolsOwner'), alice.id, 'the pill browsed her rack');
      assert.equal(await b.eval(
        `document.querySelector('#rail-roster .roster-name').getAttribute('aria-pressed')`),
        'true', 'the pill is visibly pressed while viewing');

      // The swapped region head + stage-only tiles (no ±, no manage, no ordinals).
      const headText = await b.eval(`document.getElementById('pools-head').textContent`);
      assert.ok(headText.includes("Alice's pools") && headText.includes('read-only'),
        `the region head names the teammate (got: ${headText})`);
      assert.equal(await b.eval(`document.querySelectorAll('#groups-list .pool-tile.foreign').length`), 3,
        "Alice's three pools render as tiles");
      assert.equal(await b.eval(`document.querySelectorAll('#groups-list .pool-tile.foreign .tile-mods, #groups-list .pool-tile.foreign .tile-edit, #groups-list .pool-tile.foreign .pool-ord').length`),
        0, 'foreign tiles carry no ±, no manage, no ordinals');
      assert.equal(await b.eval(`document.querySelector('#groups-list .pool-sec-head').textContent`),
        'Attributes', "Alice's categories shelve her rack");

      // Staging from a foreign tile pours into MY draft with HER pool's name.
      await b.eval(`[...document.querySelectorAll('#groups-list .pool-tile.foreign .tile-stage')]
        .find((t) => t.textContent.includes('Claws')).click()`);
      let ts = await b.dbg('trayState');
      assert.ok(ts.sources.includes('Claws'), `the foreign pool is the source (got: ${ts.sources})`);
      const stagedLen = ts.dice.length;

      // A live edit repaints her tiles — but never a chip already staged.
      const claws = (await a.dbg('groups')).find((g) => g.name === 'Claws');
      await a.dbg(`editPool(${JSON.stringify(claws.id)}, {name: 'Fangs'})`);
      await b.waitFor(`[...document.querySelectorAll('#groups-list .pool-tile.foreign .tile-name')]
        .some((el) => el.textContent === 'Fangs')`, { desc: 'pools-changed repaints the rack' });
      ts = await b.dbg('trayState');
      assert.ok(ts.sources.includes('Claws'), 'the staged chip keeps its stage-time snapshot');

      // Digits act on BOB'S rack even while browsing Alice's.
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '1'}))`);
      ts = await b.dbg('trayState');
      assert.ok(ts.sources.includes('Attack'), `digit 1 staged Bob's own pool (got: ${ts.sources})`);

      // The pill is the way back (press-again-to-close); the draft crosses
      // the switch intact.
      await b.eval(`[...document.querySelectorAll('#rail-roster .roster-name')]
        .find((p) => p.textContent.includes('Alice')).click()`);
      assert.equal(await b.dbg('poolsOwner'), null, 'the pill toggles back home');
      ts = await b.dbg('trayState');
      assert.ok(ts.dice.length > stagedLen, 'the draft survived the switch');
      assert.equal(await b.eval(`document.querySelectorAll('#groups-list .pool-tile.foreign').length`), 0,
        'home shows your own rack again');

      // Categories survive a REBOOT: a fresh tab on the same origin loads
      // the stored rack through migrateGroup, which silently dropped
      // category until 2026-08-01. The shelf must still say Attributes.
      const a2 = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const g2 = (await a2.dbg('groups')).find((g) => g.name === 'Fangs');
      assert.equal(g2 && g2.category, 'Attributes', 'category survives the reload');
      assert.equal(await a2.eval(`document.querySelector('#groups-list .pool-sec-head').textContent`),
        'Attributes', 'the shelf keeps its name after a reboot');
    },
  },
  {
    name: 'portable',
    tags: ['smoke', 'settings', 'groups'],
    // Tier 4 §5 — pools & just-you settings as portable YAML: export fills
    // the textarea, edits re-parse LIVE into a preview, Apply merges by
    // name (never deletes), refusals name their line, and the '#'-in-
    // notation trap survives the round trip (quoted scalars).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      // Establish the precondition rather than inherit it: 'dice.chips.v1'
      // lives in per-origin localStorage, which OUTLIVES a scenario's room,
      // and earlier localhost scenarios (shelve-clear-no-chip-leak) leave it
      // ON. Without this the 'numbers on' flip below is invisible and the
      // scenario fails only in a full sweep — the worst kind of failure.
      await a.dbg('setChipsVisible(false)');
      await a.dbg(`setGroups([{name: 'Body', notation: '3d6', category: 'Attributes'},
        {name: 'Damage', notation: '3d4'},
        {name: 'Hunt', notation: '2d6 # To the death'}])`);
      await a.dbg('openSettings()');
      await a.eval(`document.getElementById('portable-open').click()`);
      assert.equal(await a.eval(`document.getElementById('portable-zone').classList.contains('hidden')`),
        false, 'the zone unfolds');
      const text = await a.eval(`document.getElementById('portable-text').value`);
      assert.ok(text.includes("- 'Body': '3d6'") && text.includes("'2d6 # To the death'"),
        `export quotes every scalar — the # comment survives (got: ${JSON.stringify(text.slice(0, 200))})`);
      assert.ok((await a.eval(`document.getElementById('portable-status').textContent`))
        .includes('matches'), 'a fresh export previews as a no-op');
      assert.equal(await a.eval(`document.getElementById('portable-apply').disabled`), true,
        'nothing to apply on a no-op');

      // Edit: bump Damage, add a pool, flip the numbers setting → preview.
      await a.eval(`(() => {
        const t = document.getElementById('portable-text');
        t.value = t.value.replace("- 'Damage': '3d4'", "- 'Damage': '4d4'")
          .replace('settings:', "    - 'Fresh': '2d10'\\nsettings:")
          .replace('numbers: false', 'numbers: true');
        t.dispatchEvent(new Event('input'));
      })()`);
      const preview = await a.eval(`document.getElementById('portable-status').textContent`);
      assert.ok(preview.includes('1 new') && preview.includes('1 update') && preview.includes('numbers on'),
        `the preview counts the plan (got: ${preview})`);
      await a.eval(`document.getElementById('portable-apply').click()`);
      const gs = await a.dbg('groups');
      assert.equal(gs.find((g) => g.name === 'Damage').notation, '4d4', 'the update landed by name');
      assert.ok(gs.find((g) => g.name === 'Fresh' && g.notation === '2d10'), 'the add landed');
      assert.equal(gs.length, 4, 'nothing was deleted');
      assert.equal(await a.dbg('chipsVisible'), true, 'the settings flip applied');

      // A bad paste refuses with its line; Apply stays disabled.
      await a.eval(`(() => {
        const t = document.getElementById('portable-text');
        t.value = 'pools:\\n  P:\\n    - Broken: not dice\\n';
        t.dispatchEvent(new Event('input'));
      })()`);
      const bad = await a.eval(`document.getElementById('portable-status').textContent`);
      assert.ok(bad.startsWith('✗') && bad.includes('line 3'), `refusal names its line (got: ${bad})`);
      assert.equal(await a.eval(`document.getElementById('portable-apply').disabled`), true,
        'no Apply on a refusal');
      await a.eval(`document.getElementById('settings-close').click()`);
    },
  },
  {
    name: 'draft-offer',
    tags: ['smoke', 'groups', 'roll'],
    // The Trigger Pass moved Offer onto the draft row (the popover's
    // 'Offer to table' retired): visible at a table, and it posts the box
    // canonical — the draft's FULL intent — as the offer.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = '2d6 dc8';
        box.dispatchEvent(new Event('input'));
      })()`);
      await a.waitFor(`!document.getElementById('offer-draft').classList.contains('hidden')
        && !document.getElementById('offer-draft').disabled`,
        { desc: 'the Offer verb stands on the draft row at a table' });
      // Computed display, not class: the class alone passed even while a
      // solo table showed a dead Offer (D2 — no bare .hidden rule existed).
      // The solo/offline false case is pinned in draft-bench.
      assert.equal((await a.dbg('trayState')).offerVisible, true,
        'Offer is COMPUTEDLY visible at a table');
      await a.eval(`document.getElementById('offer-draft').click()`);
      await b.waitFor(`document.querySelectorAll('.offer-card').length === 1`,
        { desc: 'the offer reaches Bob' });
      const detail = await b.eval(`document.querySelector('.offer-card .offer-detail').textContent`);
      assert.ok(detail.includes('vs 8'), `the dc rode the offer (got: ${detail})`);
    },
  },
  {
    name: 'draft-bench',
    tags: ['groups', 'chrome'],
    // THE WORKBENCH (§7.14): the draft line is a field dressed in the
    // command box's --well; the management rail (Save · Offer · ✕ Clear)
    // STANDS below it while a draft exists — P6, superseding the
    // 2026-08-01 ghost-text demotion. These pins hold the layout contract:
    // the contextual rail (incl. the unparseable-draft ✕ Clear papercut),
    // the standing (no-hover) reveal, the region air in both views, the ±
    // popover anchor the well dress must not zero, the per-die ✕ offset
    // math the well's padding must not disturb, the observed --draft-h,
    // and Offer's REAL hidden state offline.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });

      // (i) STANDING FURNITURE (Joe 2026-08-03, supersedes the contextual
      // rail): the rail never leaves — its verbs gray on an empty draft
      // and arm with content, so the workbench's geometry never moves.
      assert.equal((await a.dbg('trayState')).hasActions, true, 'empty draft: the rail stands');
      assert.equal(await a.eval(`document.getElementById('tray-mods').disabled`), true,
        'its verbs gray without a draft');
      await a.eval(`document.querySelector('#die-buttons .die-btn').click()`);
      assert.equal(await a.eval(`document.getElementById('tray-mods').disabled`), false,
        'a staged die arms the rail');
      await a.eval(`document.getElementById('clear-tray').click()`);
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = '2d';
        box.dispatchEvent(new Event('input'));
      })()`);
      // (the rail is always standing now — the meaningful gate is the VERB
      // arming once the debounced parse sees the half-typed text)
      await a.waitFor(`!document.getElementById('clear-tray').disabled`,
        { desc: '✕ Clear arms on the half-typed draft' });
      assert.equal(await a.eval(`document.getElementById('clear-tray').disabled`), false,
        '✕ Clear is enabled on the unparseable draft');
      assert.equal(await a.eval(`document.getElementById('tray-mods').disabled`), true,
        '± Modify stays parse-gated');

      // (ii) The standing pin: NO pointer synthesis anywhere in this
      // scenario — the rail's verbs are at full opacity purely because a
      // draft exists. This is the regression that would silently revert.
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = '2d6';
        box.dispatchEvent(new Event('input'));
      })()`);
      await a.waitFor(`window.__diceDebug.trayState.dice.length === 2`, { desc: 'draft follows the box' });
      assert.equal((await a.dbg('trayState')).railStanding, true,
        'the rail STANDS — visible with no hover (P6: management stands)');

      // (vi) The air pin, re-pointed 2026-08-07 when the sources moved BELOW
      // the well. The 16px region gap is now the zone's BOTTOM padding —
      // which lives inside its border box, where no `top - bottom` read can
      // see it. So measure the padding itself, and separately prove the
      // first section really rides that padding instead of quietly growing
      // a margin of its own. (The old pins measured palette→well and
      // box→well air; both gaps are gone, and a naive re-point to
      // `section.top - zone.bottom` would have passed at 0 forever.)
      const air = JSON.parse(await a.eval(`JSON.stringify((() => {
        const z = document.getElementById('draft-zone');
        const bar = document.getElementById('section-bar');
        return {
          padBottom: parseFloat(getComputedStyle(z).paddingBottom),
          padTop: parseFloat(getComputedStyle(z).paddingTop),
          bodyPadTop: parseFloat(getComputedStyle(z.parentElement).paddingTop),
          gapToFirstSection: Math.round(bar.getBoundingClientRect().top - z.getBoundingClientRect().bottom),
        };
      })())`));
      assert.ok(air.padBottom >= 16,
        `the region gap is the zone's own bottom padding (got ${air.padBottom}px)`);
      assert.equal(air.gapToFirstSection, 0,
        'and the first section rides it — no margin of its own');
      assert.equal(air.padTop + air.bodyPadTop, 16,
        `the zone's top inset still reads 16px with the body's own (got ${air.padTop} + ${air.bodyPadTop})`);
      // …and NONE of that inset may sit above the sticky well, or scrolled
      // content shows through the slot. The first build of the reorder left
      // the body's 4px there and die art slid through it.
      assert.equal(air.bodyPadTop, 0,
        `no padding above a sticky child — it becomes a leak band (got ${air.bodyPadTop}px)`);

      // (vi-b) THE STICKY PIN, which nothing pinned before the reorder: the
      // shelf heads must land exactly at the zone's lower edge mid-scroll.
      // While the zone sat third in the column this was only true after
      // ~175px of scroll — below that the heads pinned into the gap above
      // it, and no assertion could tell. Zone-first makes --draft-h exact
      // at every offset, and this is what proves it stays that way.
      // A rack deep enough to scroll, with a real shelf to pin. (This
      // scenario seeds none of its own — the workbench pins above need no
      // pools — so the sticky contract has to bring its own rack.)
      await a.dbg(`setGroups(${JSON.stringify(
        ['Strength', 'Toughness', 'Agility', 'Wit', 'Wisdom', 'Intelligence', 'Charm', 'Will', 'Empathy']
          .map((n) => ({ name: n, notation: '2d8', category: 'attributes' }))
          .concat([{ name: 'Swordplay', notation: '1d10', category: 'skills' },
                   { name: 'Zeal', notation: '1d4', category: 'motivations' }]))})`);
      const stuck = JSON.parse(await a.eval(`JSON.stringify((() => {
        const body = document.querySelector('#builder-panel > .panel-body');
        body.scrollTop = 300;
        const z = document.getElementById('draft-zone').getBoundingClientRect();
        const h = document.querySelector('#groups-list .pool-sec-head');
        const pal = document.getElementById('die-buttons').getBoundingClientRect();
        const b = body.getBoundingClientRect();
        return { scrolled: body.scrollTop, head: h ? Math.round(h.getBoundingClientRect().top) : null,
                 zoneBottom: Math.round(z.bottom), zoneTop: Math.round(z.top),
                 bodyTop: Math.round(b.top),
                 // Does any palette pixel land in the band ABOVE the stuck
                 // well? The OVERLAP of the palette with [b.top, z.top].
                 // A plain "pal.top < z.top && pal.bottom > b.top" stays
                 // true once the band closes, because the zone then simply
                 // covers the palette instead of leaking it.
                 leaks: Math.max(pal.top, b.top) < Math.min(pal.bottom, z.top) };
      })())`));
      assert.ok(stuck.scrolled > 0, `the panel body scrolls (got ${stuck.scrolled})`);
      assert.ok(stuck.head !== null, 'and a shelf head is on screen to pin');
      assert.ok(Math.abs(stuck.head - stuck.zoneBottom) <= 1,
        `the shelf head pins at the well's lower edge (head ${stuck.head}, zone bottom ${stuck.zoneBottom})`);
      assert.equal(stuck.zoneTop, stuck.bodyTop,
        `the well stands flush with the scrollport (zone ${stuck.zoneTop}, body ${stuck.bodyTop})`);
      assert.equal(stuck.leaks, false, 'and nothing scrolls through above it');
      await a.eval(`document.querySelector('#builder-panel > .panel-body').scrollTop = 0`);

      // (v) The anchor pin: the well dress must not zero the ± popover's
      // anchor rect. Expected top mirrors placePopover's clamp exactly.
      assert.equal(await a.dbg(`openPopoverFor('tray')`), true, 'the tray ± popover opens');
      assert.equal((await a.dbg('popover')).open, true, 'and reports open');
      const geo = await a.eval(`(() => {
        // re-place against the popover's CURRENT height first (its preview
        // grows async after open; the resize listener runs placePopover
        // synchronously), then read the AUTHORED style.top — the entrance
        // animation (pop-in translateY) skews a bounding-rect read
        window.dispatchEvent(new Event('resize'));
        const r = document.getElementById('tray-actions').getBoundingClientRect();
        const p = document.getElementById('mods-popover');
        const expected = Math.max(12, Math.min(Math.round(r.top - 46),
          window.innerHeight - p.offsetHeight - 12));
        return { anchored: r.height > 0, top: parseFloat(p.style.top),
          expected, wellLit: document.getElementById('tray-actions').classList.contains('open') };
      })()`);
      assert.ok(geo.anchored, 'the anchor rect is nonzero');
      assert.ok(Math.abs(geo.top - geo.expected) <= 2,
        `the popover rides its anchor (top ${geo.top}, expected ${geo.expected})`);
      assert.equal(geo.wellLit, true, 'the well lights (.open) while its editor lives');
      await a.dbg('closePopover()');
      assert.equal(await a.eval(`document.getElementById('tray-actions').classList.contains('open')`),
        false, 'and dims when it closes');

      // (ix) --draft-h is right IN THE SAME TASK as the edit, not one RO
      // frame later: renderTray must measure AFTER updateTrayButtons, which
      // is what raises and drops the 34px rail. (It measured first, so every
      // transition wrote a value stale by exactly the rail — the RO papered
      // over it a frame later, and a browser without RO never would.)
      await a.eval(`document.getElementById('clear-tray').click()`);
      const ordering = await a.eval(`(() => {
        const body = document.querySelector('#builder-panel > .panel-body');
        const z = document.getElementById('draft-zone');
        document.querySelector('#die-buttons .die-btn').click(); // renderTray, synchronously
        return { h: z.offsetHeight, v: parseFloat(body.style.getPropertyValue('--draft-h')) };
      })()`);
      assert.equal(ordering.v, ordering.h,
        `--draft-h is fresh in the same task (got ${ordering.v} for a ${ordering.h}px zone)`);

      // (iv) retired with the save morph (2026-08-04): every interactive
      // height change runs renderTray's SYNCHRONOUS --draft-h write now —
      // pinned by (ix) below — and the ResizeObserver stays in the code as
      // future-proofing only. It is not pinned here on purpose: throttled
      // headless rendering delivers RO resizes non-deterministically (the
      // old morph fixture only passed because focus() forced frames), and
      // a test that flakes on renderer scheduling pins nothing.

      // (vii) The x-layer pin: the well's padding sits OUTSIDE the
      // cluster, so the per-die ✕ overlays still land on their dice.
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = '2d6+1d8';
        box.dispatchEvent(new Event('input'));
      })()`);
      await a.waitFor(`window.__diceDebug.trayState.xCount === 2`,
        { desc: 'one ✕ per loose type (d6 group, d8)' });
      const xs = await a.eval(`(() => {
        const c = document.getElementById('tray').getBoundingClientRect();
        return [...document.querySelectorAll('#tray-x-layer .die-x')].map((x) => {
          const r = x.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height),
            onCluster: r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom };
        });
      })()`);
      assert.equal(xs.length, 2, 'two ✕ overlays');
      for (const x of xs) {
        assert.ok(x.w > 0 && x.h > 0 && x.onCluster,
          `each ✕ lands on the cluster (got ${JSON.stringify(x)})`);
      }

      // (iii) THE TRAY IS ONE TARGET (Joe 2026-08-04: 'the roll button
      // should be part of the tray click target. It's not for me right
      // now'). The tray's floor band is a ::after on the WELL — generated
      // content paints above the button it dresses, so without
      // pointer-events:none it silently swallowed every click and hover
      // that landed on the button's own face. Probe the real hit target at
      // the plate's centre, at both far edges (the well carries no padding
      // precisely so those reach), and up in the pocket: all four must be
      // the roll button. Also pin that the dice never enter the band —
      // the collision this whole split exists to prevent.
      const zones = await a.eval(`(() => {
        const well = document.getElementById('tray-actions');
        const r = well.getBoundingClientRect();
        const band = parseFloat(getComputedStyle(well).getPropertyValue('--cue-band'));
        const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.id; };
        const art = document.querySelector('#tray-roll .die-art, #tray-roll .strip-dot');
        return {
          plate: hit(r.left + r.width / 2, r.bottom - band / 2),
          plateLeft: hit(r.left + 3, r.bottom - band / 2),
          plateRight: hit(r.right - 3, r.bottom - band / 2),
          pocket: hit(r.left + r.width / 2, r.top + 20),
          diceClearBand: art ? art.getBoundingClientRect().bottom <= r.bottom - band : null,
        };
      })()`);
      assert.deepEqual(zones, {
        plate: 'tray-roll', plateLeft: 'tray-roll', plateRight: 'tray-roll',
        pocket: 'tray-roll', diceClearBand: true,
      }, `every zone of the tray is the roll button (got ${JSON.stringify(zones)})`);

      // (iv) The D2 pin, both ways: Offer is computedly visible at a
      // table, and REALLY hidden off it (before .draft-actions .btn.hidden
      // existed, the class toggled with no visual effect while offerDraft()
      // dead-ends offline). Leave & switch is the one scripted door to a
      // netOnline=false state; re-seat after so the tab ends sane.
      assert.equal((await a.dbg('trayState')).offerVisible, true,
        'Offer computedly visible at a table');
      await a.eval(`document.getElementById('idm-leave').click()`);
      await a.waitFor(`window.__diceDebug.net.online === false`, { desc: 'the seat drops' });
      const off = await a.dbg('trayState');
      assert.equal(off.hasActions, true, 'the draft (and its rail) survive the seat change');
      assert.equal(off.offerVisible, false, 'offline, Offer is REALLY display:none');
      await a.eval(`(() => {
        const i = document.getElementById('name-input');
        i.value = 'Alice';
        i.dispatchEvent(new Event('input'));
        document.getElementById('name-join').click();
      })()`);
      await a.waitFor(`window.__diceDebug.net.online === true`, { desc: 're-seated' });
      await a.eval(`document.getElementById('clear-tray').click()`);
    },
  },

  {
    name: 'section-bar',
    tags: ['smoke', 'chrome', 'groups'],
    // §7.23 — three INDEPENDENT sources over one workbench. What this pins
    // that the old two-state toggle could not: co-visibility, the all-off
    // floor, and the migration receipt that proves P1 survived (every
    // existing user's panel shows exactly what it showed yesterday).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.4', name: 'Sec' });
      const stored = `JSON.parse(localStorage.getItem('dice.sections.v1') || 'null')`;
      try {
        // The second pool carries a modifier on purpose: 'Open in draft' —
        // the shipped loadIntoBox door — only exists on the ± popover of a
        // pool that is NOT pure dice (a pure one gets the rank ladder and
        // returns early).
        await a.dbg(`setGroups([{name: 'Wisdom', notation: '2d8', category: 'attributes'},`
          + ` {name: 'Blessed', notation: '2d8+2', category: 'attributes'}])`);

        // (i) A fresh seat boots at today's panel: palette + rack, no box.
        // `shown` is computed display, never the stored booleans — the
        // assertion has to see what the eye sees.
        assert.deepEqual((await a.dbg('sections')).shown,
          { dice: true, notation: false, pools: true }, 'default: palette + rack, box off');
        assert.equal(await a.eval(stored), null, 'and nothing is written until you choose');

        // (ii) MIGRATION, both directions, pixel-identical to the old views.
        // This is the receipt for the §7.9 supersession: louder is a choice,
        // never a default.
        for (const [legacy, want] of [
          ['text', { dice: false, notation: true, pools: true }],
          ['dice', { dice: true, notation: false, pools: true }],
        ]) {
          const b = await ctx.newTable({ origin: '127.0.0.5', name: 'Mig' });
          try {
            await b.eval(`localStorage.setItem('dice.inputmode.v1', ${JSON.stringify(JSON.stringify(legacy))})`);
            await b.eval(`localStorage.removeItem('dice.sections.v1')`);
            await b.reload();
            assert.deepEqual((await b.dbg('sections')).shown, want,
              `a '${legacy}' user's panel is unchanged by the migration`);
            assert.equal(await b.eval(`localStorage.getItem('dice.inputmode.v1')`),
              JSON.stringify(legacy), 'and the legacy key is read, never rewritten');
          } finally { await b.close(); }
        }

        // (iii) All eight states are legal and each round-trips through
        // storage. ALL-OFF included: the workbench above is a complete
        // surface by itself, so there is no last-section-standing rule.
        for (const d of [true, false]) for (const n of [true, false]) for (const p of [true, false]) {
          await a.dbg(`setSections({dice: ${d}, notation: ${n}, pools: ${p}})`);
          const s = await a.dbg('sections');
          assert.deepEqual(s.shown, { dice: d, notation: n, pools: p },
            `state {${d},${n},${p}} shows exactly what it says`);
          assert.deepEqual(s.pressed, { dice: d, notation: n, pools: p },
            `and the bar reports it (${d},${n},${p})`);
          assert.deepEqual(await a.eval(stored), { dice: d, notation: n, pools: p },
            `and it survives a reload (${d},${n},${p})`);
        }

        // (iv) The all-off floor still ROLLS. The bar is the last thing on
        // screen under the well, and the well is a full §7.4 surface.
        await a.dbg(`setSections({dice: false, notation: false, pools: false})`);
        assert.equal(await a.eval(
          `getComputedStyle(document.getElementById('draft-zone')).display !== 'none'`),
        true, 'all-off: the workbench stands');
        assert.equal(await a.eval(
          `getComputedStyle(document.getElementById('section-bar')).display !== 'none'`),
        true, 'and so does the bar that brings the sections back');

        // (v) THE LAUNDERING PIN. Loading a pool into the box surfaces
        // Notation for that visit only. Clicking any OTHER cell afterwards
        // must not write that loan into storage — one merged object would
        // have, and the panel would boot with a box the user never chose.
        await a.dbg(`setSections({dice: true, notation: false, pools: true})`);
        // 'Open in draft' on a pool's ± popover is the shipped loadIntoBox door.
        const gid = (await a.dbg('groups')).find((g) => g.name === 'Blessed').id;
        await a.dbg(`poolPopoverOpen(${gid})`);
        await a.eval(`[...document.querySelectorAll('.pid-ghost-verb')]
          .find((b) => b.textContent === 'Open in draft').click()`);
        await a.waitFor(`window.__diceDebug.sections.shown.notation === true`,
          { desc: 'a text intent surfaces the box' });
        assert.equal((await a.eval(stored)).notation, false,
          'the loan is not written when it is taken');
        await a.eval(`document.querySelector('#section-bar [data-sec="dice"]').click()`);
        assert.equal((await a.eval(stored)).notation, false,
          'and clicking another cell does not launder it into storage');

        // (vi) Turning the box off while it holds garbage regenerates the
        // projection — a hidden invalid string may never gray the rim's
        // tools with no reason on screen.
        await a.dbg(`setSections({dice: true, notation: true, pools: true})`);
        await a.eval(`(() => { const i = document.getElementById('cmd-input');
          i.value = 'not a roll at all'; i.dispatchEvent(new Event('input')); })()`);
        await a.waitFor(`document.getElementById('cmd').classList.contains('is-invalid')`,
          { desc: 'the box is invalid' });
        await a.eval(`document.querySelector('#section-bar [data-sec="notation"]').click()`);
        assert.equal(await a.eval(`document.getElementById('cmd').classList.contains('is-invalid')`),
          false, 'turning Notation off canonicalizes rather than archiving garbage');

        // (vii) No button inside a button anywhere in the new bar.
        assert.equal(await a.eval(`document.querySelectorAll('#section-bar button button').length`),
          0, 'the bar nests no buttons');
      } finally {
        await a.eval(`localStorage.removeItem('dice.sections.v1')`).catch(() => {});
      }
    },
  },

  {
    name: 'terminology',
    tags: ['smoke', 'chrome'],
    // The vocabulary is 'pool' / 'saved pool'; 'tray' and 'group' survive only
    // as ids, classes and storage keys. This reads the chrome a
    // player actually sees — labels, tooltips, placeholders, both cheat sheets
    // — and fails if either retired word comes back into view.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      // seed uncategorized pools: the plain-shelf name is what this reads
      // (the DEFAULT rack is the categorized Soul Deal set now)
      await a.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}])`);
      assert.equal(await a.eval(`document.getElementById('head-compose')`), null,
        'the Pools title row is gone (2026-08-04: the column needs no name)');
      assert.ok(await a.eval(`[...document.querySelectorAll('.pool-sec-head')].some((h) => h.textContent === 'Pools')`),
        'the uncategorized shelf is plainly named (trio shelves stand above it)');
      assert.equal(await a.eval(`document.getElementById('pop-save').textContent`),
        'Save', 'the popover commits with one verb (Trigger Pass)');
      assert.ok((await a.eval(`document.getElementById('tray-mods').textContent`)).includes('Modify'),
        "the rim's modifier tool says 'Modify' (Joe 2026-08-04 — never 'Tweak')");
      assert.equal(await a.eval(`document.getElementById('pop-save-name').placeholder`),
        'Name this pool…', 'the duplicate morph names a pool');
      assert.equal(await a.eval(`document.getElementById('pools-edit').textContent.trim()`),
        '✎ Edit pools', "the manage toggle speaks 'pools' (never 'rack')");
      assert.ok(!(await a.eval(`document.body.innerText.toLowerCase().includes('rack')`)),
        "no visible chrome says 'rack'");
      // The delete affordance exists only in manage mode now (P2) — enter it
      // so the sweep still reads the word a player would actually see.
      await a.dbg('setPoolsEditMode(true)');
      assert.equal(await a.eval(`document.querySelector('#groups-list .group-del').title`),
        'Delete pool', 'the row ✕ deletes a pool');
      await a.dbg('setPoolsEditMode(false)');

      // The sweep itself: every label, tooltip, placeholder and text node in
      // the chrome a player can read. Storage keys and class names are not
      // reachable this way, which is exactly the line the contract draws.
      const stray = await a.eval(`(() => {
        const roots = ['#left-panel', '#rail', '#kbd-overlay', '#mods-popover',
                       '#settings-modal', '#cmd-cheatsheet', '#identity-menu',
                       '#help-overlay'];
        const banned = /\\btrays?\\b|\\bgroups?\\b|\\bracks?\\b|\\bcompose\\b/i;
        const bad = [];
        for (const sel of roots) {
          const root = document.querySelector(sel);
          if (!root) continue;
          for (const el of [root, ...root.querySelectorAll('*')]) {
            const texts = [el.title || '', el.placeholder || '', el.getAttribute('aria-label') || ''];
            for (const kid of el.childNodes) if (kid.nodeType === 3) texts.push(kid.nodeValue);
            for (const t of texts) if (banned.test(t)) bad.push(sel + ' → ' + t.trim());
          }
        }
        return bad;
      })()`);
      assert.deepEqual(stray, [], `no user-facing 'tray'/'group' remains (found ${JSON.stringify(stray)})`);
    },
  },

  // -- visibility (goal 11) --------------------------------------------------
  // The ladder is open (default) · held (face down for everyone, the roller
  // included) · secret (the roll exists only for the roller) · whisper (a named
  // audience sees everything, everyone else sees a shrouded roll). Redaction is
  // the SERVER's job — these scenarios check both what a client renders and,
  // where it matters, what the wire actually carried.
  {
    name: 'held-roll',
    tags: ['visibility'],
    // A held roll is face down for EVERYONE including the roller; the reveal
    // (authority only) leaves both tabs holding the same full entry.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      // Chips are off by default (P1); this scenario asserts on their '?' →
      // real-face flip, so both seats opt in.
      for (const t of [a, b]) assert.equal(await t.dbg('setChipsVisible(true)'), true, 'chips on');
      await a.roll('d20 held');
      const rid = await a.rollId();
      assert.ok(rid, 'held roll has a rollId');

      for (const [t, who] of [[a, 'Alice (the roller)'], [b, 'Bob']]) {
        await t.waitFor(shroudSettled(rid), { desc: `shrouded roll settles for ${who}` });
        const s = await t.entryState(rid);
        assert.equal(s.hidden, true, `${who}: entry hidden`);
        assert.equal(s.redacted, true, `${who}: entry arrived redacted`);
        assert.equal(s.visMode, 'held', `${who}: mode is held`);
        assert.equal(s.total, null, `${who}: no total`);
        assert.deepEqual(s.values, [null], `${who}: no die value`);
        assert.equal(await t.diceCount(), 1, `${who}: the die is on the felt`);
        const line = await t.logTop();
        assert.ok(/face down/.test(line), `${who}: log says face down (got: ${line})`);
        assert.ok(line.includes('?'), `${who}: log total is ? (got: ${line})`);
        assert.ok(line.includes('Alice'), `${who}: roller still attributed (got: ${line})`);
        assert.deepEqual(await t.chips(), ['?'], `${who}: the chip over the die reads ?`);
      }
      assert.equal((await a.entryState(rid)).canReveal, true, 'Alice holds the reveal');
      assert.equal((await b.entryState(rid)).canReveal, false, 'Bob does not');
      // Hidden is hidden for everyone — including the affordances. ⟳ on a
      // face-down line would offer to reroll a spec nobody at the table can
      // read (and only live viewers ever had one — a reload disagreed).
      assert.equal(await a.logTop(), await b.logTop(), 'the face-down line reads the same for both');
      assert.ok(!(await a.logTop()).includes('⟳'), 'no ⟳ while the result is hidden');

      await a.dbg(`reveal(${JSON.stringify(rid)})`);
      for (const t of [a, b]) {
        await t.waitFor(revealSettled(rid), { desc: 'reveal flip settles' });
        assert.equal(await t.dbg('shroudedCount'), 0, 'no shrouded dice left');
      }
      const [sa, sb] = [await a.entryState(rid), await b.entryState(rid)];
      assert.equal(typeof sa.total, 'number', 'revealed total is a number');
      for (const [t, who] of [[a, 'Alice'], [b, 'Bob']]) {
        assert.deepEqual(await t.chips(), [String(sa.values[0])],
          `${who}: the chip fills in with the real face`);
      }
      assert.deepEqual(sa, sb, 'both tabs hold the identical revealed entry');
      assert.equal(await a.logTop(), await b.logTop(), 'log entries identical after reveal');
      assert.ok(!/face down/.test(await a.logTop()), 'the log line stopped saying face down');
      assert.ok((await a.logTop()).includes('⟳'), '⟳ returns once the spec is readable');
    },
  },
  {
    name: 'secret-roll',
    tags: ['visibility'],
    // A secret roll exists ONLY for its roller: no event, no log line, no dice
    // for anyone else. The open roll that follows proves the channel was live.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.roll('d20 secret');
      const secretId = await a.rollId();
      const sa = await a.entryState(secretId);
      assert.equal(sa.hidden, false, 'the roller reads their own secret roll');
      assert.equal(typeof sa.total, 'number', 'roller sees the total');
      assert.equal(sa.visMode, 'secret', 'mode is secret');
      assert.equal(sa.canReveal, false, 'secret has no reveal path');

      // A later OPEN roll must arrive at Bob — so his empty log is redaction,
      // not a stalled stream.
      await a.roll('d6 # after');
      const openId = await a.rollId();
      await b.waitFor(
        `(window.__diceDebug.sim(120), !!window.__diceDebug.entryState(${JSON.stringify(openId)}) && !window.__diceDebug.busy)`,
        { desc: 'the following open roll reaches Bob' },
      );
      assert.equal(await b.entryState(secretId), null, 'Bob has no entry for the secret roll');
      assert.equal(await b.logCount(), 1, 'Bob logged only the open roll');
      assert.equal(await b.diceCount(), 1, 'Bob has only the open die');
      assert.equal((await b.shelf()).length, 0, 'the secret roll never reached Bob’s shelf');
      // Alice: the secret roll auto-collected under the open one, as usual.
      assert.equal(await a.logCount(), 2, 'Alice logged both');
      assert.equal((await a.shelf()).length, 1, 'the secret roll shelved for Alice');
    },
  },
  {
    name: 'whisper-roll',
    tags: ['visibility'],
    // Three seats: the audience reads the roll, the chooser always reads their
    // own, and everyone else sees a shrouded roll they know happened.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      const c = await ctx.newTable({ origin: '127.0.0.2', name: 'Carol' });
      await a.roll('d20 w:Bob');
      const rid = await a.rollId();

      const sa = await a.entryState(rid);
      assert.equal(sa.hidden, false, 'the chooser is always in the audience');
      assert.equal(typeof sa.total, 'number', 'Alice sees the total');
      assert.equal(sa.canReveal, true, 'Alice holds the reveal');

      await b.waitFor(
        `(window.__diceDebug.sim(120), !window.__diceDebug.busy && !!window.__diceDebug.entryState(${JSON.stringify(rid)}))`,
        { desc: 'whisper reaches Bob' },
      );
      const sb = await b.entryState(rid);
      assert.equal(sb.hidden, false, 'the named audience reads it');
      assert.equal(sb.total, sa.total, 'same total as the roller');
      assert.deepEqual(sb.values, sa.values, 'same per-die values');
      assert.equal(sb.canReveal, false, 'the audience does not hold the reveal');
      assert.equal(await b.dbg('shroudedCount'), 0, 'nothing shrouded for the audience');

      await c.waitFor(shroudSettled(rid), { desc: 'shrouded roll settles for Carol' });
      const sc = await c.entryState(rid);
      assert.equal(sc.hidden, true, 'the bystander sees a shrouded roll');
      assert.equal(sc.redacted, true, 'and it arrived redacted');
      assert.equal(sc.visMode, 'whisper', 'marked as a whisper');
      assert.equal(sc.total, null, 'no total for the bystander');
      const line = await c.logTop();
      assert.ok(/whispered/.test(line), `Carol’s log says whispered (got: ${line})`);
      assert.ok(line.includes('Alice'), `existence is public (got: ${line})`);

      // Audience names match the roster case-insensitively…
      await a.roll('d20 w:bob');
      const lower = await a.rollId();
      await b.waitFor(
        `(window.__diceDebug.sim(120), !window.__diceDebug.busy`
        + ` && (window.__diceDebug.entryState(${JSON.stringify(lower)}) || {}).hidden === false)`,
        { desc: 'a lowercase name still reaches Bob' },
      );
      // …and a name that needs quoting survives parse → wire → roster match.
      const renamed = await ctx.api('/api/rename', { playerId: await c.playerId(), name: 'Ann Smith' });
      assert.equal(renamed.status, 200, 'rename accepted');
      await a.roll('d20 w:"Ann Smith"');
      const quoted = await a.rollId();
      await c.waitFor(
        `(window.__diceDebug.sim(120), !window.__diceDebug.busy`
        + ` && (window.__diceDebug.entryState(${JSON.stringify(quoted)}) || {}).hidden === false)`,
        { desc: 'the quoted audience name resolves' },
      );
      await b.waitFor(shroudSettled(quoted), { desc: 'Bob is the bystander this time' });
      assert.equal((await b.entryState(quoted)).hidden, true, 'and reads nothing of it');
    },
  },
  {
    name: 'whisper-unknown-audience',
    tags: ['visibility'],
    // An unmatched audience name refuses the whole action (never silently
    // narrows the audience) — and the refusal is surfaced, not swallowed.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.dbg(`commandRoll('d20 w:Nobody')`);
      await a.waitFor('!!window.__diceDebug.lastRefusal', { desc: 'the refusal surfaces' });
      const refusal = await a.dbg('lastRefusal');
      assert.equal(refusal.code, 'unknown_audience', 'refused as unknown_audience');
      assert.ok(refusal.message.includes('Nobody'), `the bad name is named (got: ${refusal.message})`);
      assert.ok(await a.eval(`document.getElementById('status-pill').textContent.includes('Nobody')`),
        'the refusal reaches the status pill');

      for (const t of [a, b]) {
        await t.dbg('sim(240)');
        assert.equal(await t.logCount(), 0, 'no roll happened');
        assert.equal(await t.diceCount(), 0, 'no dice on the felt');
      }
      // The same refusal at the API layer, with the contract's status + code.
      const r = await ctx.api('/api/roll', { playerId: await a.playerId(), notation: 'd20 w:Nobody' });
      assert.equal(r.status, 400, 'API refuses with 400');
      assert.equal(r.data.code, 'unknown_audience', 'API error code');
      assert.ok(r.data.error.includes('Nobody'), `API message lists the bad name (got: ${r.data.error})`);
      // A name that IS at the table still works — the roster is what decides.
      await a.roll('d20 w:Bob');
      assert.equal(await a.logCount(), 1, 'the corrected whisper rolls');
    },
  },
  {
    name: 'gm-screen-offer',
    tags: ['visibility'],
    // The dice-tower roll: Alice offers a roll only she will read; Bob picks it
    // up and throws it blind. Reveal authority stays with the offerer.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      const posted = await a.dbg(`offerRoll('d20 secret # Perception')`);
      assert.equal(posted.ok, true, `offer accepted (got: ${JSON.stringify(posted)})`);
      await b.waitFor('window.__diceDebug.offers.length === 1', { desc: 'offer reaches Bob' });
      const offer = (await b.dbg('offers'))[0];
      assert.equal(offer.visibility && offer.visibility.mode, 'secret', 'the card carries the mode');
      assert.equal(await b.dbg(`claimOffer(${JSON.stringify(offer.offerId)})`), true, 'claim accepted');

      const rid = await b.waitFor(
        `(window.__diceDebug.sim(120), (window.__diceDebug.currentRoll || {}).rollId || null)`,
        { desc: 'the claimed roll starts on Bob’s tab' },
      );
      await b.waitFor(shroudSettled(rid), { desc: 'Bob’s blind roll settles' });
      const sb = await b.entryState(rid);
      assert.equal(sb.hidden, true, 'the claimer rolls blind');
      assert.equal(sb.redacted, true, 'redacted for the player who threw the dice');
      assert.equal(sb.total, null, 'no total for the roller');
      assert.equal(sb.canReveal, false, 'the roller does not hold the reveal');

      await a.waitFor(
        `(window.__diceDebug.sim(120), !window.__diceDebug.busy && !!window.__diceDebug.entryState(${JSON.stringify(rid)}))`,
        { desc: 'the offerer receives the result' },
      );
      const sa = await a.entryState(rid);
      assert.equal(sa.hidden, false, 'the offerer reads the result');
      assert.equal(typeof sa.total, 'number', 'offerer sees the total');
      assert.equal(sa.canReveal, true, 'the offerer holds the reveal');

      await a.dbg(`reveal(${JSON.stringify(rid)})`);
      for (const t of [a, b]) await t.waitFor(revealSettled(rid), { desc: 'reveal lands' });
      const after = await b.entryState(rid);
      assert.equal(after.total, sa.total, 'Bob finally learns what he rolled');
      assert.equal(await a.logTop(), await b.logTop(), 'one shared record afterwards');
      // Attribution follows the hand that threw the dice, not the offer.
      const line = await a.logTop();
      assert.ok(line.includes('Bob'), `the claimer is the roller (got: ${line})`);
      assert.ok(line.includes('Perception'), `the offer's label survives (got: ${line})`);
    },
  },
  {
    name: 'targeted-offer',
    tags: ['visibility'],
    // ROADMAP 4b — "Bo, roll this save": an offer claimable only by a named
    // player. The card shows EVERYONE the stakes (including who it's for);
    // only the target gets the claim strip, and the server enforces the
    // gate (403 not_offer_target) no matter which client drew the button.
    // Unknown names fail closed at offer time (400 unknown_target).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      const c = await ctx.newTable({ origin: '127.0.0.2', name: 'Carol' });

      // Unknown target refuses the offer outright — fail closed, no card.
      const bad = await ctx.api('/api/offer', {
        playerId: await a.playerId(), notation: '1d20', label: 'stray', to: 'Nobody',
      });
      assert.equal(bad.status, 400, 'unknown target refused');
      assert.equal(bad.data && bad.data.code, 'unknown_target', `code names it (got: ${JSON.stringify(bad.data)})`);

      // The UI path: draft + the ▾ picker → 'Offer to Bob'.
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = 'd20 dc12 # Save vs fear';
        box.dispatchEvent(new Event('input'));
      })()`);
      await a.waitFor(`!document.getElementById('offer-pick').classList.contains('hidden')
        && !document.getElementById('offer-pick').disabled`,
        { desc: 'the ▾ picker stands once teammates exist' });
      await a.eval(`document.getElementById('offer-pick').click()`);
      await a.eval(`[...document.querySelectorAll('#offer-menu .offer-menu-item')]
        .find((i) => i.textContent === 'Offer to Bob').click()`);

      // Everyone sees the card and who it is for; only Bob can take it.
      for (const [t, name] of [[a, 'Alice'], [b, 'Bob'], [c, 'Carol']]) {
        await t.waitFor('window.__diceDebug.offers.length === 1', { desc: `offer reaches ${name}` });
      }
      const offer = (await c.dbg('offers'))[0];
      assert.equal(offer.to && offer.to.name, 'Bob', 'the card carries its claimant');
      assert.ok(await c.eval(`document.querySelector('.offer-card .offer-to').textContent === 'Bob'`),
        "Carol reads who it's for");
      assert.equal(await c.eval(`!!document.querySelector('.offer-card .offer-roll')`), false,
        'no claim strip for a bystander');
      assert.ok(await c.eval(`(document.querySelector('.offer-card .offer-waiting') || {}).textContent === 'waiting on Bob'`),
        'the bystander reads the wait');
      assert.equal(await b.eval(`!!document.querySelector('.offer-card .offer-roll')`), true,
        'the target gets the claim strip');

      // The gate is the SERVER's: Carol forcing a claim over the wire is
      // refused and the offer survives for Bob.
      const stolen = await ctx.api('/api/claim', {
        playerId: await c.playerId(), offerId: offer.offerId,
      });
      assert.equal(stolen.status, 403, 'a forced foreign claim is refused');
      assert.equal(stolen.data && stolen.data.code, 'not_offer_target', 'and names the rule');
      assert.equal((await b.dbg('offers')).length, 1, 'the offer still stands for Bob');

      // Bob claims through the card; the roll lands as HIS, dc riding.
      await b.eval(`document.querySelector('.offer-card .offer-roll').click()`);
      const rid = await b.waitFor(
        `(window.__diceDebug.sim(120), (window.__diceDebug.currentRoll || {}).rollId || null)`,
        { desc: 'the claimed roll starts on Bob’s tab' },
      );
      await b.waitFor(
        `(window.__diceDebug.sim(160), !window.__diceDebug.busy && window.__diceDebug.offers.length === 0)`,
        { desc: 'the card leaves every table' },
      );
      assert.ok((await b.logTop()).includes('Bob'), 'the claimer is the roller');
      assert.ok(rid, 'a real roll landed from the targeted claim');
    },
  },
  {
    name: 'whisper-offer',
    tags: ['visibility'],
    // Whisper-offer auto-targeting (Joe 2026-08-03): a whisper is already
    // ADDRESSED, so its offer derives the claim gate from the audience —
    // table-wide whisper offers cease to exist by construction. Conflicting
    // explicit targets refuse; an offerer-only audience refuses; the
    // claimed roll keeps the whisper's read (audience + offerer see,
    // bystanders shrouded).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      const c = await ctx.newTable({ origin: '127.0.0.2', name: 'Carol' });

      // The ▾ has nothing to choose under a whisper draft — it hides.
      // (First wait for it to STAND — teammates exist — so the later
      // hidden-check can't pass on the trivial initial state.)
      await a.waitFor(`!document.getElementById('offer-pick').classList.contains('hidden')`,
        { desc: 'the ▾ stands once teammates exist' });
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = 'd20 w:Bob # Save';
        box.dispatchEvent(new Event('input'));
      })()`);
      await a.waitFor(`document.getElementById('offer-pick').classList.contains('hidden')`,
        { desc: 'the ▾ hides under a whisper draft' });
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = '';
        box.dispatchEvent(new Event('input'));
      })()`);

      // A conflicting explicit target refuses — never a silent override.
      const clash = await ctx.api('/api/offer', {
        playerId: await a.playerId(), notation: '1d20 w:Bob', label: 'x', to: 'Carol',
      });
      assert.equal(clash.status, 400, 'off-audience target refused');
      assert.equal(clash.data && clash.data.code, 'target_not_in_audience', 'and names the rule');

      // A whisper to only yourself has nobody to offer to.
      const selfish = await ctx.api('/api/offer', {
        playerId: await a.playerId(), notation: '1d20 w:Alice', label: 'x',
      });
      assert.equal(selfish.status, 400, 'offerer-only audience refused');
      assert.equal(selfish.data && selfish.data.code, 'whisper_needs_audience', 'with its own code');

      // The plain table-wide verb now auto-targets the audience.
      const posted = await a.dbg(`offerRoll('d20 w:Bob # Save vs fear')`);
      assert.equal(posted.ok, true, `offer accepted (got: ${JSON.stringify(posted)})`);
      for (const t of [a, b, c]) {
        await t.waitFor('window.__diceDebug.offers.length === 1', { desc: 'offer lands' });
      }
      const offer = (await c.dbg('offers'))[0];
      assert.equal(offer.to && offer.to.name, 'Bob', 'the audience IS the target');
      assert.equal(await c.eval(`!!document.querySelector('.offer-card .offer-roll')`), false,
        'no claim strip for a bystander');
      assert.equal(await b.eval(`!!document.querySelector('.offer-card .offer-roll')`), true,
        'the whispered player gets the claim strip');

      // The server holds the gate: Carol's forced claim bounces, card stands.
      const stolen = await ctx.api('/api/claim', {
        playerId: await c.playerId(), offerId: offer.offerId,
      });
      assert.equal(stolen.status, 403, 'a forced foreign claim is refused');
      assert.equal((await b.dbg('offers')).length, 1, 'the offer still stands for Bob');

      // Bob claims; the whisper's read holds — Bob (audience) sees his
      // result, Carol sees a shrouded roll.
      await b.eval(`document.querySelector('.offer-card .offer-roll').click()`);
      const rid = await b.waitFor(
        `(window.__diceDebug.sim(120), (window.__diceDebug.currentRoll || {}).rollId || null)`,
        { desc: 'the claimed roll starts on Bob’s tab' },
      );
      await b.waitFor(
        `(window.__diceDebug.sim(160), !window.__diceDebug.busy && !!window.__diceDebug.entryState(${JSON.stringify(rid)}))`,
        { desc: 'Bob’s roll settles' },
      );
      const sb = await b.entryState(rid);
      assert.equal(sb.hidden, false, 'the audience member reads his own result');
      await c.waitFor(
        `(window.__diceDebug.sim(160), !!window.__diceDebug.entryState(${JSON.stringify(rid)}))`,
        { desc: 'the roll reaches Carol' },
      );
      const sc = await c.entryState(rid);
      assert.equal(sc.hidden, true, 'the bystander sees a shrouded roll');
    },
  },
  {
    name: 'reveal-authority',
    tags: ['visibility'],
    // Only the visibility chooser may flip a hidden roll — enforced by the
    // server, not by whether a client drew the button.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.roll('d20 held');
      const rid = await a.rollId();
      for (const t of [a, b]) await t.waitFor(shroudSettled(rid), { desc: 'held roll settles' });

      const r = await ctx.api('/api/reveal', { playerId: await b.playerId(), rollId: rid });
      assert.equal(r.status, 403, 'the server refuses a non-authority');
      assert.equal(r.data.code, 'not_reveal_authority', 'with the contract’s code');

      // The client has no local gate either: asking anyway changes nothing.
      await b.dbg(`reveal(${JSON.stringify(rid)})`);
      for (const t of [a, b]) {
        await t.dbg('sim(240)');
        assert.equal((await t.entryState(rid)).hidden, true, 'still face down');
        assert.equal(await t.dbg('shroudedCount'), 1, 'still shrouded on the felt');
      }
      // The authority still can.
      await a.dbg(`reveal(${JSON.stringify(rid)})`);
      for (const t of [a, b]) await t.waitFor(revealSettled(rid), { desc: 'the authority’s reveal lands' });
    },
  },
  {
    name: 'reveal-mid-playback',
    tags: ['visibility'],
    // A reveal that lands while the shrouded roll is still tumbling must DEFER
    // until it settles — never flip dice mid-throw. (The pendingClears
    // pattern; the race this guards was fixed once already, in 7f9cdf5.)
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      // Bob's world now advances only when this scenario says so, so "the
      // reveal arrived mid-playback" is a fact, not a race we hope to win.
      assert.equal(await b.dbg('holdClock(true)'), true, 'Bob’s clock is held');
      await a.roll('d20 held');
      const rid = await a.rollId();
      await b.waitFor(
        `((window.__diceDebug.currentRoll || {}).rollId === ${JSON.stringify(rid)})`,
        { desc: 'the roll starts on Bob’s tab' },
      );
      assert.equal(await b.dbg('busy'), true, 'and is still in flight');
      assert.equal(await b.dbg('shroudedCount'), 1, 'tumbling shrouded');

      await a.dbg(`reveal(${JSON.stringify(rid)})`);
      await b.waitFor('window.__diceDebug.pendingReveals.length === 1',
        { desc: 'the reveal is parked, not applied mid-throw' });
      assert.equal(await b.dbg('revealingCount'), 0, 'no flip started mid-throw');
      assert.equal(await b.dbg('shroudedCount'), 1, 'the dice are still shrouded');
      assert.equal(await b.entryState(rid), null, 'and nothing landed in the log yet');

      await b.dbg('holdClock(false)');
      await b.waitFor(revealSettled(rid), { desc: 'the parked reveal runs at settle' });
      assert.deepEqual(await b.dbg('pendingReveals'), [], 'nothing left parked');
      const [sa, sb] = [await a.entryState(rid), await b.entryState(rid)];
      assert.equal(sb.hidden, false, 'Bob ends up with the revealed roll');
      assert.deepEqual(sb.values, sa.values, 'and the same values');
      assert.equal(await a.logTop(), await b.logTop(), 'one shared record');
    },
  },
  {
    name: 'raw-sse-leak',
    tags: ['visibility'],
    // THE redaction proof at this layer: a player who is only an HTTP client
    // keeps every byte the server sent. Nothing a client chose not to render
    // can hide here.
    timeout: 120000,
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      const eve = await ctx.rawPlayer('Eve');
      await eve.waitForEvent('hello');

      await a.roll('d20+3 dc 15 held');
      const heldId = await a.rollId();
      await a.roll('d20+3 w:Bob');
      const whisperId = await a.rollId();
      await a.roll('d20+3 secret');
      const secretId = await a.rollId();
      assert.ok(heldId && whisperId && secretId && new Set([heldId, whisperId, secretId]).size === 3,
        'three distinct rolls');

      await eve.waitForEvent('roll', (d) => d.rollId === whisperId, { timeout: 20000 });
      // Give a secret roll's (absent) event every chance to show up late.
      await a.roll('d6 # marker');
      const markerId = await a.rollId();
      await eve.waitForEvent('roll', (d) => d.rollId === markerId, { timeout: 20000 });

      const RESULT_KEYS = ['"values"', '"total"', '"perDie"', '"modifier"', '"parts"', '"spec"'];
      const raw = eve.raw;
      assert.ok(raw.includes(heldId), 'the held roll exists for Eve');
      assert.ok(raw.includes(whisperId), 'the whispered roll exists for Eve');
      assert.ok(!raw.includes(secretId), 'the secret roll NEVER touched Eve’s stream');
      assert.ok(/"dc":15/.test(raw), 'the DC is public even while the result is hidden');

      // Every event Eve got about a hidden roll, walked for result-bearing keys.
      const about = (id) => eve.events().filter((e) => {
        const d = e.data || {};
        return d.rollId === id || (d.roll && d.roll.rollId === id);
      });
      for (const [id, what] of [[heldId, 'held'], [whisperId, 'whisper']]) {
        const evs = about(id);
        assert.ok(evs.length > 0, `Eve received the ${what} roll's event`);
        assert.ok(evs.some((e) => e.type === 'roll' && e.data.redacted === true),
          `the ${what} roll arrived redacted`);
        for (const e of evs) {
          const s = JSON.stringify(e.data);
          for (const key of RESULT_KEYS) {
            assert.ok(!s.includes(key), `${what} ${e.type} leaked ${key}: ${s.slice(0, 400)}`);
          }
        }
      }
      // Positive control: the open marker roll DID carry those keys, so the
      // walk above would have caught a leak rather than passing vacuously.
      const marker = about(markerId).find((e) => e.type === 'roll');
      assert.ok(marker, 'the open marker roll reached Eve');
      for (const key of ['"values"', '"total"']) {
        assert.ok(JSON.stringify(marker.data).includes(key), `open rolls do carry ${key}`);
      }

      // The join snapshot is projected by the same rule: a NEW bytes-only
      // player reconstructing this table gets the same nothing.
      const mallory = await ctx.rawPlayer('Mallory');
      const entries = mallory.joinPayload.log || [];
      assert.equal(entries.some((e) => e.rollId === secretId), false,
        'the snapshot omits the secret roll entirely');
      assert.deepEqual(entries.map((e) => e.rollId), [heldId, whisperId, markerId],
        'the snapshot has exactly the three non-secret rolls');
      for (const e of entries.filter((x) => x.rollId !== markerId)) {
        const s = JSON.stringify(e);
        for (const key of RESULT_KEYS) {
          assert.ok(!s.includes(key), `join snapshot leaked ${key}: ${s.slice(0, 400)}`);
        }
      }
      // …and the same story reaches a real client: three rolls, never four.
      await b.waitFor(
        `(window.__diceDebug.sim(240), !window.__diceDebug.busy`
        + ` && document.getElementById('log-list').childElementCount >= 3)`,
        { desc: 'Bob plays out every roll he was sent' },
      );
      assert.equal(await b.logCount(), 3, 'Bob saw held + whisper + marker, never the secret roll');
      assert.equal(await b.entryState(secretId), null, 'and has no entry for the secret roll');
    },
  },
  {
    name: 'resync-shrouded',
    tags: ['visibility', 'resync'],
    // Reconstruction obeys the projection: a late joiner rebuilds a shrouded
    // table, and someone who arrives after the reveal rebuilds a full one.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.roll('d20 held');
      const rid = await a.rollId();

      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await b.settle();
      await b.waitFor(shroudSettled(rid), { desc: 'late joiner rebuilds the shrouded roll' });
      const sb = await b.entryState(rid);
      assert.equal(sb.hidden, true, 'still face down for the late joiner');
      assert.equal(sb.redacted, true, 'and it came redacted');
      assert.equal(sb.total, null, 'no total in the reconstruction');
      assert.equal(await b.diceCount(), 1, 'the die is on the rebuilt felt');
      assert.equal(await b.dbg('shroudedCount'), 1, 'and it is shrouded');
      assert.equal(await a.logTop(), await b.logTop(), 'same face-down log line');

      await a.dbg(`reveal(${JSON.stringify(rid)})`);
      for (const t of [a, b]) await t.waitFor(revealSettled(rid), { desc: 'reveal lands' });
      const sa = await a.entryState(rid);

      const c = await ctx.newTable({ origin: '127.0.0.2', name: 'Carol' });
      await c.settle();
      await c.waitFor(revealSettled(rid), { desc: 'post-reveal joiner rebuilds the full roll' });
      const sc = await c.entryState(rid);
      assert.equal(sc.hidden, false, 'a revealed roll rebuilds full');
      assert.equal(sc.total, sa.total, 'same total');
      assert.deepEqual(sc.values, sa.values, 'same values');
      assert.equal(await c.dbg('shroudedCount'), 0, 'nothing shrouded after the reveal');
      assert.equal(await a.logTop(), await c.logTop(), 'same log line');
    },
  },
  {
    name: 'alias-bindings',
    tags: ['visibility', 'notation'],
    // The terminology amendment's cross-tool aliases, end to end: /gmroll is
    // a SECRET roll (Roll20's contract — the roller sees the result, the
    // table learns nothing), /sr refuses to guess between two tools that
    // mean opposite things by it, and 'blind' is offer-context only (the
    // dice tower). Grammar details are unit-tested; this pins the bindings
    // through the real client AND the server's authoritative re-parse.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });

      // /gmroll rolls SECRET: Alice reads her own result; Bob gets nothing.
      await a.roll('/gmroll 1d20');
      const rid = await a.rollId();
      const sa = await a.entryState(rid);
      assert.equal(sa.visMode, 'secret', '/gmroll rolled secret');
      assert.equal(sa.hidden, false, 'the roller reads their own /gmroll result');
      await a.roll('d6 # after'); // a later open roll proves Bob's stream was live
      const openId = await a.rollId();
      await b.waitFor(
        `(window.__diceDebug.sim(120), !!window.__diceDebug.entryState(${JSON.stringify(openId)}) && !window.__diceDebug.busy)`,
        { desc: 'the open roll reaches Bob' },
      );
      assert.equal(await b.entryState(rid), null, 'the table never learns a /gmroll happened');

      // /sr refuses with the teaching error — in the client parse and in fact.
      const sr = await a.dbg(`parseNotation('/sr 1d20')`);
      assert.equal(sr.ok, false, '/sr must not bind');
      assert.ok(sr.error.includes('ambiguous'), `teaching error (got: ${sr.error})`);
      await a.dbg(`commandRoll('/sr 1d20')`);
      await a.dbg('sim(240)');
      assert.equal(await a.logCount(), 2, '/sr rolled nothing');

      // blind: a teaching error as a self-roll (client parse AND the server's
      // authoritative re-parse), a live dice-tower offer as an offer.
      const blind = await a.dbg(`parseNotation('1d20 blind')`);
      assert.ok(!blind.ok && blind.error.includes('offer this roll instead'), `got: ${blind.error}`);
      const apiRoll = await ctx.api('/api/roll', { playerId: await a.playerId(), notation: '1d20 blind' });
      assert.equal(apiRoll.status, 400, 'the server refuses a blind self-roll');
      const posted = await a.dbg(`offerRoll('1d20 blind # Tower')`);
      assert.equal(posted.ok, true, `blind offer accepted (got: ${JSON.stringify(posted)})`);
      await b.waitFor('window.__diceDebug.offers.length === 1', { desc: 'the dice-tower offer reaches Bob' });
      const offer = (await b.dbg('offers'))[0];
      assert.equal(offer.visibility && offer.visibility.mode, 'secret', 'blind canonicalized to secret');
    },
  },
  {
    name: 'reroll-history',
    tags: ['roll', 'shelf'],
    // B2+B3 end to end: the reroll VERB says reroll (the card strip's cue
    // word vs the draft's plain ROLL), and history TRACKS rolls vs rerolls —
    // rerollOfId is server-substantiated, shared by every tab (late joiners
    // included), one hop only; an unsubstantiated claim is dropped while the
    // dice still roll, and a malformed one refuses loudly.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });

      // 1 · Wording: a shelved card's strip reads REROLL; the draft reads ROLL.
      await a.roll('2d6 # Warmup');
      const wid = await a.rollId();
      await a.dbg(`collectRoll(${JSON.stringify(wid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'warmup shelved' },
      );
      assert.equal(await a.dbg(`peek(${JSON.stringify(wid)})`), wid, 'peek opens');
      assert.equal((await a.dbg('peekState')).cueWord, 'REROLL', 'the card strip SAYS reroll');
      await a.dbg('peek(null)');
      await a.eval(`document.querySelector('#die-buttons .die-btn').click()`);
      assert.equal(await a.eval(`document.querySelector('#tray-roll .cue-word').textContent.trim()`),
        'ROLL', 'the draft trigger keeps the plain ROLL — a fresh pool is not a reroll');
      await a.eval(`document.getElementById('clear-tray').click()`);

      // 2 · The mark, shared: the log ⟳ replays rid1; both tabs hold the
      // same provenance, and the log wears exactly one qualifier per row.
      await a.roll('1d20 # Attack');
      const rid1 = await a.rollId();
      const n1 = await a.logCount();
      await a.eval(`document.querySelector('#log-list .log-again').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), document.getElementById('log-list').childElementCount > ${n1} && !window.__diceDebug.busy)`,
        { desc: 'the reroll lands' },
      );
      await a.dbg('sim(240)');
      const rid2 = await a.rollId();
      assert.ok(rid2 && rid2 !== rid1, 'a new roll landed from the log ⟳');
      for (const [t, who] of [[a, 'Alice'], [b, 'Bob']]) {
        await t.waitFor(
          `(window.__diceDebug.sim(120), !!window.__diceDebug.entryState(${JSON.stringify(rid2)}) && !window.__diceDebug.busy)`,
          { desc: `the reroll reaches ${who}` },
        );
        assert.equal((await t.entryState(rid2)).rerollOfId, rid1, `${who}: the reroll marks its parent`);
        assert.equal((await t.entryState(rid1)).rerollOfId, null, `${who}: the parent carries no mark of its own`);
      }
      const rows = await a.eval(`[...document.querySelectorAll('#log-list .log-entry')].map((r) => ({
        reroll: !!r.querySelector('.log-reroll'),
        rerolled: !!r.querySelector('.log-rerolled'),
        lane: r.classList.contains('is-reroll'),
      }))`);
      assert.equal(rows[0].reroll, true, "the newest row wears the 'reroll' qualifier");
      assert.equal(rows[0].lane, true, 'and the is-reroll lane');
      assert.equal(rows[1].rerolled, true, "the superseded row wears 'rerolled'");
      assert.equal(rows[1].reroll, false, 'at most one qualifier per row');

      // 3 · One hop only: rerolling the reroll marks rid2, never the root.
      const n2 = await a.logCount();
      await a.eval(`document.querySelector('#log-list .log-again').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), document.getElementById('log-list').childElementCount > ${n2} && !window.__diceDebug.busy)`,
        { desc: 'the second reroll lands' },
      );
      await a.dbg('sim(240)');
      const rid3 = await a.rollId();
      assert.equal((await a.entryState(rid3)).rerollOfId, rid2, 'one hop up, not a chain-root walk');

      // 4 · Resync: a late joiner's hello-built log carries the mark.
      const c = await ctx.newTable({ origin: '127.0.0.2', name: 'Carol' });
      await c.settle();
      await c.waitFor(
        `(window.__diceDebug.sim(120), !!window.__diceDebug.entryState(${JSON.stringify(rid2)}) && !window.__diceDebug.busy)`,
        { desc: 'Carol rebuilds the log' },
      );
      assert.equal((await c.entryState(rid2)).rerollOfId, rid1, 'the mark survives the hello rebuild');

      // 5 · An unsubstantiated claim is DROPPED — the dice are not the
      // questionable part, so the roll itself proceeds unmarked.
      const aid = await a.playerId();
      const nA = await a.logCount();
      const forged = await ctx.api('/api/roll',
        { playerId: aid, dice: ['d6'], label: 'forged', rerollOfId: 'no-such-roll' });
      assert.equal(forged.status, 200, 'the roll proceeds');
      assert.ok(!('rerollOfId' in (forged.data.roll || {})), 'the unverifiable claim is dropped');
      await a.waitFor(
        `(window.__diceDebug.sim(120), document.getElementById('log-list').childElementCount > ${nA} && !window.__diceDebug.busy)`,
        { desc: 'the dropped-claim roll still lands' },
      );

      // 6 · A malformed claim is a client bug: 400, nothing rolls.
      const bad = await ctx.api('/api/roll',
        { playerId: aid, dice: ['d6'], label: 'malformed', rerollOfId: {} });
      assert.equal(bad.status, 400, 'a non-string rerollOfId refuses');
      assert.equal(bad.data.code, 'bad_reroll_of', 'with its own code');
    },
  },
  {
    name: 'reroll-provenance-gate',
    tags: ['visibility'],
    // THE SECURITY TRAP, at full strength (B3): a reroll of a SECRET roll
    // must not leak the parent's existence via rerollOfId — not to a
    // bytes-only stream, not to a client, NOT EVEN FOR THE ROLLER of the
    // secret parent (the payload is broadcast; a broadcast has no single
    // asker). Proven on raw SSE bytes with an open-parent positive control
    // so the leak walk cannot pass vacuously; the redacted copy keeps the
    // mark (a public stake, goal 11); and the unknown-parent response is
    // indistinguishable from the secret-parent one (no existence oracle).
    timeout: 120000,
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      const eve = await ctx.rawPlayer('Eve');
      await eve.waitForEvent('hello');
      const aid = await a.playerId();

      // The trap: Alice — authorized to SEE her secret roll — claims it on
      // an OPEN roll. 200, and the claim is dropped even for her.
      await a.roll('1d20 secret');
      const secretId = await a.rollId();
      const forged = await ctx.api('/api/roll',
        { playerId: aid, dice: ['d6'], label: 'about that', rerollOfId: secretId });
      assert.equal(forged.status, 200, 'the roll itself proceeds');
      assert.ok(!('rerollOfId' in (forged.data.roll || {})),
        'DROPPED even when the roller of the secret parent is the requester');
      const newId = forged.data.roll.rollId;

      // Eve's wire: once the open roll's event has arrived, anything about
      // the secret would have arrived before it — and nothing did.
      await eve.waitForEvent('roll', (d) => d.rollId === newId, { timeout: 20000 });
      assert.ok(!eve.raw.includes(secretId), 'the secret rollId never touched Eve’s stream');
      assert.ok(!eve.raw.includes('"rerollOfId"'), 'no event Eve holds carries a rerollOfId key yet');

      // A real client agrees: unmarked roll, nonexistent parent.
      await b.waitFor(
        `(window.__diceDebug.sim(120), !!window.__diceDebug.entryState(${JSON.stringify(newId)}) && !window.__diceDebug.busy)`,
        { desc: 'the open roll reaches Bob' },
      );
      assert.equal((await b.entryState(newId)).rerollOfId, null, 'unmarked for Bob');
      assert.equal(await b.entryState(secretId), null, 'and the secret parent does not exist for him');

      // Positive control: an OPEN parent's mark DOES ride Eve's wire — the
      // leak asserts above could not have passed vacuously.
      await a.roll('1d20 # open parent');
      const pid = await a.rollId();
      const marked = await ctx.api('/api/roll',
        { playerId: aid, dice: ['d6'], label: 'take two', rerollOfId: pid });
      assert.equal(marked.status, 200);
      assert.equal(marked.data.roll.rerollOfId, pid, 'an open parent is recorded');
      await eve.waitForEvent('roll', (d) => d.rollId === marked.data.roll.rollId, { timeout: 20000 });
      assert.ok(eve.raw.includes(`"rerollOfId":"${pid}"`), 'the substantiated mark crosses the raw wire');

      // The mark survives redaction: a HELD reroll keeps the public stake
      // while every value stays omitted (the projectEntryFor whitelist line).
      const held = await ctx.api('/api/roll',
        { playerId: aid, notation: '1d20 held', rerollOfId: pid });
      assert.equal(held.status, 200);
      const heldId = held.data.roll.rollId;
      assert.equal(held.data.roll.rerollOfId, pid, 'the redacted POST response keeps the mark');
      await b.waitFor(
        `(window.__diceDebug.sim(120), !!window.__diceDebug.entryState(${JSON.stringify(heldId)}) && !window.__diceDebug.busy)`,
        { desc: 'the held reroll reaches Bob' },
      );
      const sb = await b.entryState(heldId);
      assert.equal(sb.redacted, true, 'redacted for Bob');
      assert.equal(sb.rerollOfId, pid, 'a public stake, kept while the values stay omitted');

      // Indistinguishability: unknown-parent and secret-parent answers share
      // one shape — 200, unmarked — so neither confirms an id is real.
      const unknown = await ctx.api('/api/roll',
        { playerId: aid, dice: ['d6'], label: 'about nothing', rerollOfId: 'no-such-roll' });
      assert.equal(unknown.status, forged.status, 'same status either way');
      assert.equal('rerollOfId' in (unknown.data.roll || {}), 'rerollOfId' in (forged.data.roll || {}),
        'same absent mark — no existence oracle');
    },
  },
  {
    name: 'themed-dice',
    tags: ['themes'],
    // Dice-set identity (Tier 6 §9): chosen in settings ("Just you"), the
    // set rides each roll request and lands for EVERYONE at the table; a
    // player who never chose stays std (identity is per-player, not room
    // state); the shelf keeps a collected roll's skin; the wire rejects an
    // unknown id loudly instead of inventing a skin.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.eval(`window.__diceDebug.setDiceSet('emberforge.blackanvil')`);
      await a.roll('2d6 # By the anvil');
      await a.settle();
      await b.settle();
      await b.waitFor(`document.getElementById('log-list').childElementCount >= 1`, { desc: 'roll reaches tab B' });
      for (const [tab, who] of [[a, 'A'], [b, 'B']]) {
        const info = JSON.parse(await tab.eval(`JSON.stringify(window.__diceDebug.tableDiceInfo())`));
        assert.equal(info.length, 2, `two dice on ${who}`);
        assert.ok(info.every((d) => d.variant === 'emberforge.blackanvil'),
          `the roller's set everywhere on ${who} (got: ${info.map((d) => d.variant).join(',')})`);
      }

      // Bob never picked a set: his roll is std on every screen, while
      // Alice's auto-collected dice keep their skin on the shelf.
      await b.roll('1d20 # plain');
      await b.settle();
      const rid = await b.rollId();
      await a.waitFor(
        `(window.__diceDebug.sim(120), !window.__diceDebug.busy`
        + ` && window.__diceDebug.tableDiceInfo().some((d) => d.rollId === ${JSON.stringify(rid)}))`,
        { desc: 'the plain roll lands on A' },
      );
      const infoA = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.tableDiceInfo())`));
      const plain = infoA.filter((d) => d.rollId === rid);
      assert.equal(plain.length, 1, 'one plain die on the felt');
      assert.equal(plain[0].variant, 'std', 'no set chosen ⇒ std');
      const shelved = infoA.filter((d) => d.rollId !== rid);
      assert.equal(shelved.length, 2, 'the anvil roll sits on the shelf');
      assert.ok(shelved.every((d) => d.variant === 'emberforge.blackanvil'), 'the shelf keeps the skin');

      // The choice persists locally, and the wire refuses an invented skin.
      assert.equal(await a.eval(`localStorage.getItem('dice.diceset.v1')`),
        '"emberforge.blackanvil"', 'the choice persists');
      const aid = await a.playerId();
      const bad = await ctx.api('/api/roll', { playerId: aid, dice: ['d6'], set: 'umbra.nonsense' });
      assert.equal(bad.status, 400, 'unknown set is a loud 400');
      const good = await ctx.api('/api/roll', { playerId: aid, dice: ['d6'], set: 'umbra.voidgrain' });
      assert.equal(good.status, 200);
      assert.equal(good.data.roll.set, 'umbra.voidgrain', 'the set rides the entry');
    },
  },
  {
    name: 'themed-fx',
    tags: ['themes'],
    // Ladder Level 4 (felt decals + die lights): a lit set's roll glows
    // on EVERY screen; the 4-light budget holds; a collect puts the
    // flame out (the shelf is the archive); a shrouded roll marks and
    // casts NOTHING (obsidian sheds no identity) — and the reveal
    // ignites the set's glow. The MARKS ship dark (the decals.js kill
    // switch, 2026-08-03): A arms its own screen up front — proving the
    // toggle and the machinery idling behind it — while B stays
    // factory-dark and proves the shipped default: same rolls, same
    // room, clean felt end to end.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      // Tier 0 lazy DecalField: with the kill switch dark, boot pays no
      // atlas paint, no VRAM upload, no scene.add. Both tabs start
      // factory-dark, so decalsBuilt must read false on both up front.
      for (const [tab, who] of [[a, 'A'], [b, 'B']]) {
        const pre = JSON.parse(await tab.eval(`JSON.stringify(window.__diceDebug.fxInfo())`));
        assert.equal(pre.decalsEnabled, false, `${who}: factory-dark at boot`);
        assert.equal(pre.decalsBuilt, false, `${who}: lazy — nothing built at boot`);
      }
      await a.eval(`window.__diceDebug.decalsEnable(true)`); // B stays factory-dark
      // Arming through decalsEnable() eagerly builds — no first-stamp jank.
      const armed = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.fxInfo())`));
      assert.equal(armed.decalsBuilt, true, 'A: arming eagerly builds atlas + mesh');
      assert.equal(armed.stamped, 0, 'A: arming alone stamps nothing');
      await a.eval(`window.__diceDebug.setDiceSet('emberforge.blackanvil')`);
      await a.roll('3d6 # slam');
      await a.settle();
      await b.settle();
      await b.waitFor(`document.getElementById('log-list').childElementCount >= 1`, { desc: 'roll reaches tab B' });
      for (const [tab, who] of [[a, 'A'], [b, 'B']]) {
        const fx = JSON.parse(await tab.eval(`JSON.stringify(window.__diceDebug.fxInfo())`));
        assert.equal(fx.lights.length, 3, `all three anvil dice glow on ${who} (got ${fx.lights.length})`);
        assert.ok(fx.lights.every((l) => l.mode === 'breathe'), `${who}: the anvil breathes`);
        // stamped (ever), not live count: settle()'s sim() clock runs
        // simulated SECONDS, long enough for a live mark to fade honestly
        if (who === 'A') {
          assert.ok(fx.stamped > 0, 'A (armed): the landing scorched the felt');
        } else {
          assert.equal(fx.decalsEnabled, false, 'B: marks ship dark');
          assert.equal(fx.stamped, 0, 'B (factory): the felt stays clean');
        }
      }

      // Six lit dice into a pool of four: the budget holds (newest win).
      await a.roll('6d6 # budget');
      await a.settle();
      const fx2 = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.fxInfo())`));
      assert.equal(fx2.lights.length, 4, 'the light budget caps at four');

      // Collect the roll: the shelf is the archive — the flame goes out.
      const rid = await a.rollId();
      await a.eval(`window.__diceDebug.collectRoll(${JSON.stringify(rid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.fxInfo().lights.length === 0)`,
        { desc: 'collect puts the flames out' },
      );

      // A held roll wears obsidian: no glow, no new marks, on any screen
      // (armed A gains none; factory B holds its 0). Quiesce B first:
      // its budget-roll playback may still be mid-flight, and baselines
      // must be read from an idle table.
      await b.settle();
      const marksBefore = {};
      for (const [tab, who] of [[a, 'A'], [b, 'B']]) {
        marksBefore[who] = JSON.parse(await tab.eval(`JSON.stringify(window.__diceDebug.fxInfo())`)).stamped;
      }
      await a.roll('d20 held');
      const hid = await a.rollId();
      for (const [tab, who] of [[a, 'A'], [b, 'B']]) {
        await tab.waitFor(shroudSettled(hid), { desc: `held roll settles for ${who}` });
        const fx = JSON.parse(await tab.eval(`JSON.stringify(window.__diceDebug.fxInfo())`));
        assert.equal(fx.lights.length, 0, `${who}: a shrouded roll casts nothing`);
        assert.equal(fx.stamped, marksBefore[who], `${who}: a shrouded roll marks nothing new`);
      }

      // The reveal restores the set — and ignites its glow.
      await a.eval(`window.__diceDebug.reveal(${JSON.stringify(hid)})`);
      await a.waitFor(revealSettled(hid), { desc: 'reveal lands on A' });
      const fx3 = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.fxInfo())`));
      assert.equal(fx3.lights.length, 1, 'the reveal ignites the anvil glow');

      // The whole scenario later: B was never armed and never marked.
      // The shipped default holds on an untouched screen.
      const fxB = JSON.parse(await b.eval(`JSON.stringify(window.__diceDebug.fxInfo())`));
      assert.equal(fxB.decalsEnabled, false, 'B is still factory-dark');
      assert.equal(fxB.decalsBuilt, false, 'B: lazy path held end-to-end — atlas/mesh never built');
      assert.equal(fxB.stamped, 0, 'B: the felt never took a single mark');
    },
  },
  {
    name: 'themed-post',
    tags: ['themes'],
    // Ladder Level 5 (selective bloom / shock rings / bypass): a std
    // table renders the released direct path — the stack only engages
    // when something glows. A bolt-glass roll blooms and pops its
    // discharge on every screen; a shrouded roll adds neither; the
    // reveal restores the bloom flag along with the materials.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      const post = async (tab) => JSON.parse(await tab.eval(`JSON.stringify(window.__diceDebug.postInfo())`));

      // std table: bypass. Pin the set to std FIRST — dice.diceset.v1 is
      // per-origin localStorage and an earlier scenario's choice leaks in.
      await a.eval(`window.__diceDebug.setDiceSet('std')`);
      await a.roll('2d6 # plain');
      await a.settle();
      let p = await post(a);
      assert.equal(p.active, false, 'a std table bypasses the stack');
      assert.equal(p.rings, 0, 'no ring without a ring set');

      // bolt-glass: stack engages, dice bloom, the discharge pops — on BOTH tabs
      await a.eval(`window.__diceDebug.setDiceSet('stormcall.boltglass')`);
      await a.roll('2d6 # pop');
      await a.settle();
      await b.settle();
      for (const [tab, who] of [[a, 'A'], [b, 'B']]) {
        p = await post(tab);
        assert.equal(p.active, true, `${who}: the stack engages for bolt-glass`);
        assert.ok(p.bloomDice >= 2, `${who}: the bolt dice bloom (got ${p.bloomDice})`);
        assert.ok(p.rings >= 1, `${who}: the discharge popped`);
      }

      // a held roll wears obsidian: no pop, no new bloom flag
      const ringsBefore = (await post(a)).rings;
      const diceBefore = (await post(a)).bloomDice;
      await a.roll('d20 held');
      const hid = await a.rollId();
      await a.waitFor(shroudSettled(hid), { desc: 'held roll settles' });
      p = await post(a);
      assert.equal(p.rings, ringsBefore, 'a shrouded roll never pops');
      assert.equal(p.bloomDice, diceBefore, 'a shrouded die never joins the bloom mask');

      // the reveal restores the set's bloom right along with its materials
      await a.eval(`window.__diceDebug.reveal(${JSON.stringify(hid)})`);
      await a.waitFor(revealSettled(hid), { desc: 'reveal lands' });
      await a.waitFor(
        `window.__diceDebug.postInfo().bloomDice >= ${diceBefore + 1}`,
        { desc: 'the revealed die joins the bloom mask' },
      );

      // S3 (2026-08-04): the shelf is the archive — a collected bolt
      // roll must NOT keep the stack hot on an otherwise-empty felt.
      // Fresh table so the assertion isn't muddied by held/revealed
      // survivors from the prior steps.
      await a.dbg('clearTable()');
      await a.waitFor(`window.__diceDebug.tableDice.length === 0`, { desc: 'felt goes empty' });
      // Rings age inside postStack.render and sim() ticks render=false —
      // drain the transient effects then let particles fall away with
      // sim(). Sanity: an empty felt with drained effects MUST bypass.
      await a.dbg('postDrain()');
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.postInfo().active === false)`,
        { desc: 'empty felt bypasses the stack' },
      );
      await a.eval(`window.__diceDebug.setDiceSet('stormcall.boltglass')`);
      await a.roll('2d6 # to shelf');
      await a.settle();
      const srid = await a.rollId();
      p = await post(a);
      assert.equal(p.active, true, 'felt bolt-glass wakes the stack');
      assert.ok(p.bloomDiceLive >= 2, `felt bolt dice count as live bloom (got ${p.bloomDiceLive})`);
      assert.equal(await a.dbg(`collectRoll(${JSON.stringify(srid)})`), true, 'collect accepted');
      await a.waitFor(
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0 && window.__diceDebug.pendingCollects.length === 0)`,
        { desc: 'roll shelved, whisk finished' },
      );
      // Drain rings/shimmer (transient wake reasons live outside sim()'s
      // reach) and sim particles to zero — what's LEFT is exactly the
      // bloom-flag gate we fixed. Before the fix, this predicate stayed
      // true forever because shelved bloom dice woke the pipeline; after,
      // it flips false as soon as the felt goes empty.
      await a.dbg('postDrain()');
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.postInfo().active === false)`,
        { desc: 'S3: shelf-only bloom leaves the stack IDLE' },
      );
      p = await post(a);
      assert.equal(p.active, false, 'S3: pipeline reports IDLE with bloom dice on the shelf');
      assert.ok(p.bloomDice >= 2, 'shelved dice still carry the bloom flag on their mesh');
      assert.equal(p.bloomDiceLive, 0, 'no bloom-flagged dice are on the felt');
    },
  },
  {
    name: 'rest-cadence',
    tags: ['themes'],
    // Slice 3: settled-on-felt dice cadence per set — sea-glass swells,
    // sap-amber declares stillness (identity, not omission), and shelved
    // dice never cadence (the shelf is the archive, mirroring the S3
    // bloom leak fix).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });

      // Sap-amber: 'still' is a declared identity — no drift, no tilt,
      // even after seconds of settled time.
      await a.eval(`window.__diceDebug.setDiceSet('wildwood.sapamber')`);
      await a.roll('1d20 # still');
      await a.settle();
      await a.dbg('sim(180)'); // 3 s of settled time
      const stillInfo = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.restInfo())`));
      assert.equal(stillInfo.length, 1, 'one die at rest');
      assert.equal(stillInfo[0].kind, 'still', 'sapamber declares still on purpose');
      assert.equal(stillInfo[0].deltaY, 0, 'sapamber does not drift');
      // Near-zero, not bit-zero: tiltRad is DERIVED from the die's resting
      // orientation rather than assigned by the cadence, so it carries float
      // noise from wherever the die happened to settle (seen: 2.98e-8, one
      // float32 ulp). 1e-6 rad is 6e-5 degrees — indistinguishable from still
      // by any measure that matters, and still 30x tighter than the noise.
      assert.ok(Math.abs(stillInfo[0].tiltRad) < 1e-6,
        `sapamber does not tilt (got ${stillInfo[0].tiltRad})`);

      // Sea-glass: SWELLS — motion must appear in the sample window, and
      // the tilt must stay within the readable envelope (< 0.006 rad,
      // ~0.34°) so the number never leaves readable.
      await a.dbg('clearTable()');
      await a.waitFor(`window.__diceDebug.tableDice.length === 0`, { desc: 'felt clears' });
      await a.eval(`window.__diceDebug.setDiceSet('tidewrack.seaglass')`);
      await a.roll('1d20 # swell');
      await a.settle();
      let sawDrift = false;
      let maxTilt = 0;
      // Sample across ~3.4 s (covers the 2.6 s Y period AND the 3.1 s
      // roll period, so a die caught at a zero crossing on one axis
      // still shows motion on the other).
      for (let i = 0; i < 20; i++) {
        await a.dbg('sim(10)'); // 1/6 s per sample
        const info = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.restInfo())`));
        if (!info.length) continue;
        if (info[0].kind !== 'swell') continue;
        if (Math.abs(info[0].deltaY) > 1e-5) sawDrift = true;
        if (info[0].tiltRad > maxTilt) maxTilt = info[0].tiltRad;
      }
      assert.ok(sawDrift, 'sea-glass swells (measurable Y drift)');
      assert.ok(maxTilt < 0.006, `sea-glass stays readable (max tilt ${maxTilt} rad < 0.006)`);

      // Shelf gate: a collected sea-glass die goes STILL (the shelf is
      // the archive — same predicate as the S3 bloom leak fix).
      const rid = await a.rollId();
      await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'roll shelved, whisk done' },
      );
      await a.dbg('sim(60)'); // 1 s of shelf-side "rest"
      const shelfBefore = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.restInfo(${JSON.stringify(rid)}))`));
      assert.ok(shelfBefore.length >= 1, 'the shelved die is still tracked');
      await a.dbg('sim(60)'); // another 1 s
      const shelfAfter = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.restInfo(${JSON.stringify(rid)}))`));
      // Cadence writes mesh.position.y every frame; if the shelf gate
      // holds, deltaY (mesh minus finalPos) is a fixed whisk-to-shelf
      // offset that does not move between two samples 1 s apart. Sea-
      // glass's Y period is 2.6 s, so a running swell would shift Y
      // by up to ~1 mm across that window.
      for (let i = 0; i < shelfAfter.length; i++) {
        assert.equal(shelfAfter[i].kind, 'swell', 'shelved die keeps its recipe kind');
        assert.equal(
          shelfAfter[i].deltaY,
          shelfBefore[i].deltaY,
          'shelf gate holds — cadence never wrote to the mesh',
        );
      }
    },
  },
  {
    name: 'themed-chrome',
    tags: ['themes'],
    // §9 chrome art: 2D die chips are baked portraits of the real meshes
    // (diceart.js, per (type, variant)). Prospective chrome — palette
    // tiles, strips — wears MY set and follows a set change live; the
    // LOG wears each roll's own set on every screen (B sees Alice's
    // anvil), and a hidden entry wears obsidian (shroud > set > std,
    // same precedence as the felt). Chips are asserted by contract (img
    // src === the bakery's answer), never by pixels.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      // pin BOTH tabs' sets — dice.diceset.v1 leaks from earlier scenarios
      await a.eval(`window.__diceDebug.setDiceSet('std')`);
      await b.eval(`window.__diceDebug.setDiceSet('std')`);

      // the bakery: themed art exists, differs from std, junk falls back
      const facts = JSON.parse(await a.eval(`JSON.stringify((() => {
        const d = window.__diceDebug;
        const std = d.dieArtFor('d6', 'std');
        const anvil = d.dieArtFor('d6', 'emberforge.blackanvil');
        return {
          hasStd: !!std,
          hasAnvil: !!anvil,
          differs: anvil !== std,
          junkFallsBack: d.dieArtFor('d6', 'no.such') === std,
        };
      })())`));
      assert.ok(facts.hasStd, 'std art bakes');
      assert.ok(facts.hasAnvil, 'themed art bakes');
      assert.ok(facts.differs, 'a themed chip is not the std chip');
      assert.ok(facts.junkFallsBack, 'an unknown set id falls back to std art');

      // palette tiles follow MY set, in place, on the switch
      await a.eval(`window.__diceDebug.setDiceSet('emberforge.blackanvil')`);
      const tile = JSON.parse(await a.eval(`JSON.stringify((() => {
        const img = document.querySelector('.die-btn img.die-art[data-art-type="d6"]');
        return img ? img.src === window.__diceDebug.dieArtFor('d6', 'emberforge.blackanvil') : null;
      })())`));
      assert.equal(tile, true, 'the d6 palette tile wears the anvil skin after the switch');

      // the log wears the ROLL's set on the OTHER screen
      await a.roll('3d6 # forged');
      await a.settle();
      await b.settle();
      await b.waitFor(`document.getElementById('log-list').childElementCount >= 1`, { desc: 'roll reaches tab B' });
      const logChip = JSON.parse(await b.eval(`JSON.stringify((() => {
        const img = document.querySelector('#log-list img.log-die');
        return img ? img.src === window.__diceDebug.dieArtFor('d6', 'emberforge.blackanvil') : null;
      })())`));
      assert.equal(logChip, true, "B's log chip wears ALICE's set, not B's");

      // a hidden entry wears obsidian: die types public, identity not
      await a.roll('d20 held');
      await b.waitFor(`document.getElementById('log-list').childElementCount >= 2`, { desc: 'held entry reaches tab B' });
      const heldChip = JSON.parse(await b.eval(`JSON.stringify((() => {
        const img = document.querySelector('#log-list img.log-die'); // newest entry first
        return img ? img.src === window.__diceDebug.dieArtFor('d20', 'shroud') : null;
      })())`));
      assert.equal(heldChip, true, 'a hidden entry wears obsidian chips');

      // switching back re-dresses the palette
      await a.eval(`window.__diceDebug.setDiceSet('std')`);
      const back = JSON.parse(await a.eval(`JSON.stringify((() => {
        const img = document.querySelector('.die-btn img.die-art[data-art-type="d6"]');
        return img ? img.src === window.__diceDebug.dieArtFor('d6', 'std') : null;
      })())`));
      assert.equal(back, true, 'switching back re-dresses the palette');
    },
  },
  {
    name: 'pool-set-override',
    tags: ['themes', 'groups'],
    // §9 saved-pool set override, PER DIE (Joe: physical dice): every die
    // wears its own pool's set — a mixed draft rolls anvil + seaglass +
    // the roller's std side by side, on every screen, and the wire carries
    // per-die `sets` (uniform drafts keep the old singular field). 'std'
    // PINS the classics even when the roller wears a house set; '' clears
    // back to following the roller. A teammate's rack shows THEIR world:
    // explicit pool sets AND the owner's default ride the pools broadcast,
    // so the rack looks identical on every screen — never the viewer's own.
    // Tile strips preview overrides by contract (img src === the bakery's
    // answer), and BOTH pickers — settings row and the popover identity
    // strip — drive the same state.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.eval(`window.__diceDebug.setDiceSet('std')`);
      await b.eval(`window.__diceDebug.setDiceSet('std')`);
      // click → wait like harness roll(): the click's server round-trip
      // means the table can still be QUIET when settle() looks (the race
      // that read "got none" on the first run)
      const rollTheDraft = async () => {
        const before = await a.logCount();
        await a.eval(`document.getElementById('tray-roll').click()`);
        await a.waitFor(
          `(window.__diceDebug.sim(120), document.getElementById('log-list').childElementCount > ${before} && !window.__diceDebug.busy)`,
          { desc: 'draft roll completes' },
        );
        await a.dbg('sim(240)');
        return a.rollId();
      };
      const diceOf = async (tab, rid) => JSON.parse(await tab.eval(
        `JSON.stringify(window.__diceDebug.tableDiceInfo())`)).filter((d) => d.rollId === rid);

      // Reshape pools[0] into a known probe (the rack drifts across
      // scenarios — same-origin localStorage — so hunting a seeded name
      // is a trap), then arm it with the anvil override; junk is refused.
      const pools = await a.dbg('groups');
      assert.ok(pools.length >= 1, 'the rack has at least one pool to probe');
      const gid = pools[0].id;
      await a.eval(`window.__diceDebug.editPool(${JSON.stringify(gid)}, { name: 'OverrideProbe', notation: '1d6', category: '' })`);
      const upd = JSON.parse(await a.eval(
        `JSON.stringify(window.__diceDebug.editPool(${JSON.stringify(gid)}, { set: 'emberforge.blackanvil' }))`));
      assert.equal(upd.set, 'emberforge.blackanvil', 'the override lands on the record');
      const junk = JSON.parse(await a.eval(
        `JSON.stringify(window.__diceDebug.editPool(${JSON.stringify(gid)}, { set: 'not.a.set' }))`));
      assert.equal(junk, false, 'an unknown set id is refused');

      // the tile strip previews the pool's own skin, pinned against refresh
      const tile = JSON.parse(await a.eval(`JSON.stringify((() => {
        const img = document.querySelector('[data-group-id="${gid}"] img.die-art');
        return img ? {
          pinned: img.dataset.artSet || null,
          wears: img.src === window.__diceDebug.dieArtFor('d6', 'emberforge.blackanvil'),
        } : null;
      })())`));
      assert.equal(tile && tile.pinned, 'emberforge.blackanvil', 'the tile strip pins the override');
      assert.equal(tile.wears, true, 'the tile strip wears the anvil art');

      // stage the pool alone and roll: the roll wears the POOL's set on
      // every screen, while Alice herself still wears std
      await a.eval(`document.querySelector('[data-group-id="${gid}"] .tile-stage').click()`);
      const rid1 = await rollTheDraft();
      await b.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.tableDiceInfo().some((d) => d.rollId === ${JSON.stringify(rid1)}) && !window.__diceDebug.busy)`,
        { desc: "the pool roll lands on B's felt" },
      );
      for (const [tab, who] of [[a, 'A'], [b, 'B']]) {
        const dice = await diceOf(tab, rid1);
        assert.ok(dice.length >= 1 && dice.every((d) => d.variant === 'emberforge.blackanvil'),
          `${who}: the pool's roll wears the pool's set (got ${dice.map((d) => d.variant).join(',') || 'none'})`);
      }

      // the rack relay: B browses ALICE's rack and sees ALICE's world —
      // an explicit pool set wins, unmarked pools wear ALICE's default,
      // and EVERY strip is pinned so nothing can fall to the viewer's own
      // set (the information-loss bug, both layers of it)
      await b.waitFor(
        `document.querySelectorAll('#rail-roster .roster-name').length >= 1`,
        { desc: "B's rail shows Alice" },
      );
      await b.eval(`[...document.querySelectorAll('#rail-roster .roster-name')].find((p) => p.textContent.includes('Alice')).click()`);
      await b.waitFor(
        `document.querySelectorAll('#groups-list .pool-tile.foreign img.die-art').length >= 1`,
        { desc: "Alice's rack renders" },
      );
      const foreign = JSON.parse(await b.eval(`JSON.stringify((() => {
        const imgs = [...document.querySelectorAll('#groups-list .pool-tile.foreign img.die-art')];
        return {
          pins: imgs.map((i) => i.dataset.artSet || null),
          anvilWears: imgs.some((i) => i.dataset.artSet === 'emberforge.blackanvil'
            && i.src === window.__diceDebug.dieArtFor('d6', 'emberforge.blackanvil')),
        };
      })())`));
      assert.ok(foreign.pins.every(Boolean),
        `every foreign strip is pinned, none falls to the viewer (got ${foreign.pins.join(',')})`);
      assert.ok(foreign.anvilWears, "B sees Alice's pinned pool in ALICE's skin, not B's");
      assert.ok(foreign.pins.includes('std'),
        "an unmarked pool wears Alice's DEFAULT (std here), pinned against B's own skin");

      // the owner's DEFAULT relays live: Alice re-skins herself and B's
      // view of her rack follows — unmarked pools take her new default,
      // while the explicit anvil pin stands (explicit beats default)
      await a.eval(`window.__diceDebug.setDiceSet('stormcall.boltglass')`);
      await b.waitFor(
        `[...document.querySelectorAll('#groups-list .pool-tile.foreign img.die-art')].some((i) => i.dataset.artSet === 'stormcall.boltglass')`,
        { desc: "Alice's new default reaches B's view of her rack" },
      );
      const stillPinned = JSON.parse(await b.eval(`JSON.stringify(
        [...document.querySelectorAll('#groups-list .pool-tile.foreign img.die-art')].some((i) => i.dataset.artSet === 'emberforge.blackanvil'))`));
      assert.ok(stillPinned, 'the explicit pool pin outranks the owner default');

      // staging SNAPSHOTS what the tile showed (Joe: a staged foreign pool
      // must not switch to the local default) — the resolved skin rides
      await b.eval(`[...document.querySelectorAll('#groups-list .pool-tile.foreign')]
        .find((t) => { const i = t.querySelector('img.die-art'); return i && i.dataset.artSet === 'stormcall.boltglass'; })
        .querySelector('.tile-stage').click()`);
      const borrowed = await b.dbg('draftSets');
      assert.ok(borrowed && borrowed.sets && borrowed.sets.includes('stormcall.boltglass'),
        `staging an unmarked foreign pool keeps the OWNER's default (got ${JSON.stringify(borrowed)})`);
      await b.eval(`document.getElementById('clear-tray').click()`);

      // back to std (the steps below expect Alice unthemed) — B follows too
      await a.eval(`window.__diceDebug.setDiceSet('std')`);
      await b.waitFor(
        `![...document.querySelectorAll('#groups-list .pool-tile.foreign img.die-art')].some((i) => i.dataset.artSet === 'stormcall.boltglass')`,
        { desc: "clearing the default clears B's view of the rack" },
      );
      // the std flavor of the same rule: Alice-on-std stages as a 'std'
      // PIN, not as null-following-the-borrower — B wears anvil to prove it
      await b.eval(`window.__diceDebug.setDiceSet('emberforge.blackanvil')`);
      await b.eval(`[...document.querySelectorAll('#groups-list .pool-tile.foreign')]
        .find((t) => { const i = t.querySelector('img.die-art'); return i && i.dataset.artSet === 'std'; })
        .querySelector('.tile-stage').click()`);
      const borrowedStd = await b.dbg('draftSets');
      assert.ok(borrowedStd && borrowedStd.sets && borrowedStd.sets.includes('std')
        && !borrowedStd.sets.includes('emberforge.blackanvil'),
        `an std-world pool stages PINNED to std under the borrower's house set (got ${JSON.stringify(borrowedStd)})`);
      await b.eval(`document.getElementById('clear-tray').click()`);
      await b.eval(`window.__diceDebug.setDiceSet('std')`);
      // Pill-press-again to fall home (the You chip is retired with the switcher)
      await b.eval(`[...document.querySelectorAll('#rail-roster .roster-name')].find((p) => p.textContent.includes('Alice')).click()`);

      // a MIXED draft: EACH die wears its own pool's set — pool B takes
      // seaglass on a d8, a loose palette d6 stays the roller's std, and
      // the anvil probe keeps its iron. One roll, three skins, both tabs.
      assert.ok(pools.length >= 2, 'the rack has a second pool to probe');
      const gid2 = pools[1].id;
      await a.eval(`window.__diceDebug.editPool(${JSON.stringify(gid2)}, { name: 'OverrideProbeB', notation: '1d8', category: '', set: 'tidewrack.seaglass' })`);
      await a.eval(`document.getElementById('clear-tray').click()`);
      await a.eval(`document.querySelector('[data-group-id="${gid}"] .tile-stage').click()`);
      await a.eval(`document.querySelector('[data-group-id="${gid2}"] .tile-stage').click()`);
      await a.eval(`document.querySelector('.die-btn img[data-art-type="d6"]').closest('button').click()`);
      const rid2 = await rollTheDraft();
      await b.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.tableDiceInfo().some((d) => d.rollId === ${JSON.stringify(rid2)}) && !window.__diceDebug.busy)`,
        { desc: 'the mixed roll lands on B' },
      );
      for (const [tab, who] of [[a, 'A'], [b, 'B']]) {
        const mixed = await diceOf(tab, rid2);
        const kinds = mixed.map((d) => `${d.type}:${d.variant}`).sort().join(' ');
        assert.equal(kinds, 'd6:emberforge.blackanvil d6:std d8:tidewrack.seaglass',
          `${who}: each die wears its own pool's set (got ${kinds})`);
      }

      // 'std' PINS the classics even when the roller wears a house set
      await a.eval(`window.__diceDebug.setDiceSet('emberforge.blackanvil')`);
      await a.eval(`window.__diceDebug.editPool(${JSON.stringify(gid)}, { set: 'std' })`);
      await a.eval(`document.getElementById('clear-tray').click()`);
      await a.eval(`document.querySelector('[data-group-id="${gid}"] .tile-stage').click()`);
      const rid3 = await rollTheDraft();
      const pinned = await diceOf(a, rid3);
      assert.ok(pinned.length === 1 && pinned[0].variant === 'std',
        `a std-pinned pool rolls Standard under a house set (got ${pinned.map((d) => d.variant).join(',')})`);

      // '' clears the override — the pool follows the roller again
      const cleared = JSON.parse(await a.eval(
        `JSON.stringify(window.__diceDebug.editPool(${JSON.stringify(gid)}, { set: '' }))`));
      assert.equal(cleared.set, null, 'an empty patch clears the override');
      await a.eval(`document.getElementById('clear-tray').click()`);
      await a.eval(`document.querySelector('[data-group-id="${gid}"] .tile-stage').click()`);
      const rid4 = await rollTheDraft();
      const follows = await diceOf(a, rid4);
      assert.ok(follows.length === 1 && follows[0].variant === 'emberforge.blackanvil',
        `an override-free pool follows the roller's set (got ${follows.map((d) => d.variant).join(',')})`);

      // the settings row wears the compact select; a pick commits and closes
      await a.eval(`window.__diceDebug.openSettings()`);
      await a.eval(`document.querySelector('#diceset-picker .set-select').click()`);
      const menu = JSON.parse(await a.eval(`JSON.stringify((() => {
        const m = document.querySelector('.set-menu');
        if (!m) return null;
        const sel = m.querySelector('[aria-selected="true"]');
        return { rows: m.querySelectorAll('.set-swatch').length, selected: sel ? sel.dataset.set : null };
      })())`));
      assert.ok(menu && menu.rows >= 13, `the menu lists Standard + every house set (got ${menu && menu.rows})`);
      assert.equal(menu.selected, 'emberforge.blackanvil', 'the current set is marked selected');
      await a.eval(`document.querySelector('.set-menu [data-set="tidewrack.seaglass"]').click()`);
      assert.equal(await a.dbg('diceSet'), 'tidewrack.seaglass', 'picking a row commits the set');
      const menuGone = JSON.parse(await a.eval(`JSON.stringify(!document.querySelector('.set-menu'))`));
      assert.equal(menuGone, true, 'the menu closes on pick');
      await a.eval(`document.getElementById('settings-close').click()`);

      // the popover identity strip drives the SAME control by pool id
      await a.eval(`window.__diceDebug.openPopoverFor(${JSON.stringify(gid)})`);
      const stripSel = JSON.parse(await a.eval(`JSON.stringify((() => {
        const s = document.querySelector('#pop-identity .set-select');
        return s ? { value: s.dataset.value || null } : null;
      })())`));
      assert.ok(stripSel, 'the identity strip carries the set select');
      assert.equal(stripSel.value, null, 'a cleared pool shows the your-set default');
      await a.eval(`document.querySelector('#pop-identity .set-select').click()`);
      await a.eval(`document.querySelector('.set-menu [data-set="emberforge.blackanvil"]').click()`);
      const g2 = (await a.dbg('groups')).find((g) => g.id === gid);
      assert.equal(g2.set, 'emberforge.blackanvil', 'the strip picker commits through editPool');
      await a.eval(`window.__diceDebug.closePopover()`);
    },
  },
  {
    name: 'lab-geo-bench',
    tags: ['lab'],
    timeout: 150000,
    // The GEO BENCH + SET BUILDER (softer edges Tier 0): lab-only rows sweep
    // the Level 3.5 geo space on otherwise-standard dice, and the builder
    // rebuilds a live row from any recipe patch. Assertions ride
    // __lab.geoStats (bevel/wear eat the bounding radius) and faceDump
    // (source canvases), not screenshots. The lab is a raw page, not a
    // table — adopt it into ctx.tables so closeAll and the page-exception
    // collector still see it.
    async fn(ctx) {
      // ONE logged boot retry, same defense newTable carries: ~1–2% of
      // fresh headless tabs come up broken (vendor double-evaluation),
      // and the lab pushes ~2000 canvas textures through that boot.
      const url = `http://localhost:${ctx.port}/lab.html`;
      let t;
      for (let attempt = 0; ; attempt++) {
        const page = await ctx.browser.newPage();
        await page.navigate(url);
        t = new Table(page, url);
        try {
          await t.waitFor('!!(window.__lab && window.__lab.ready)', { desc: 'lab ready', timeout: 90000 });
          if (attempt === 0 && page.errors.length) {
            throw new Error(`page exception on load — ${String(page.errors[0]).slice(0, 120)}`);
          }
          break;
        } catch (e) {
          if (attempt > 0) { ctx.tables.push(t); throw e; }
          console.log(`    (lab boot retry: ${String(e.message || e).slice(0, 100)})`);
          await t.close().catch(() => {});
        }
      }
      ctx.tables.push(t);

      const rows = JSON.parse(await t.eval('JSON.stringify(window.__lab.rows)'));
      const bench = JSON.parse(await t.eval('JSON.stringify(window.__lab.benchIds)'));
      assert.equal(bench.length, 9, `the full bench sweep registered (got ${bench.length})`);
      for (const id of [...bench, 'lab.builder']) {
        assert.ok(rows.includes(id), `${id} seated in the grid`);
      }
      // lab-only ids must never leak into the published picker list
      const published = JSON.parse(await t.eval(
        `import('./js/themes.js').then((m) => JSON.stringify(m.SET_IDS))`));
      assert.ok(!published.some((id) => id.startsWith('lab.')), 'SET_IDS stays free of lab rows');

      // The bench's physical claims, post-§9c-Tier-2 (true fillet arcs):
      // cut radii shrink as the bevel widens; a ROUND edge bulges back
      // toward the sharp edge, so it sits ABOVE its cut twin but below
      // the sharp corner; round radii still shrink with bevel.
      const stats = JSON.parse(await t.eval('JSON.stringify(window.__lab.geoStats())'));
      assert.ok(stats['lab.cut030'].r > stats['std'].r,
        `narrow cut keeps more corner than std (${stats['lab.cut030'].r} vs ${stats['std'].r})`);
      assert.ok(stats['lab.cut090'].r < stats['lab.cut030'].r,
        `.090 cut trims past .030 (${stats['lab.cut090'].r} vs ${stats['lab.cut030'].r})`);
      assert.ok(stats['lab.round090'].r > stats['lab.round130'].r,
        `.130 fillet trims past .090 (${stats['lab.round090'].r} vs ${stats['lab.round130'].r})`);
      // the d6's ACTUAL sharp-corner radius — the bound the fillet must
      // stay inside is the base solid itself, not a loose percentage
      // (the fillet review caught 1.05·std sitting ~1.2% OUTSIDE it)
      const D6_SHARP = (1.35 / 2) * Math.sqrt(3);
      assert.ok(stats['lab.round055'].r > stats['std'].r && stats['lab.round055'].r < D6_SHARP,
        `the .055 fillet bulges past its cut twin, inside the sharp corner (${stats['lab.round055'].r} vs ${stats['std'].r}..${D6_SHARP.toFixed(4)})`);
      assert.ok(stats['lab.round130'].r < D6_SHARP,
        `the widest fillet stays inside the base solid (${stats['lab.round130'].r} < ${D6_SHARP.toFixed(4)})`);
      assert.ok(stats['lab.round090'].r > stats['lab.cut090'].r,
        `the .090 fillet bulges past its cut twin (${stats['lab.round090'].r} vs ${stats['lab.cut090'].r})`);
      // material-only knobs leave the silhouette bit-identical: ink
      // (selfink vs round090) and pillow/shading (pillow vs round090)
      assert.ok(Math.abs(stats['lab.selfink'].r - stats['lab.round090'].r) < 1e-4,
        `ink is material-only (${stats['lab.selfink'].r} vs ${stats['lab.round090'].r})`);
      assert.ok(Math.abs(stats['lab.pillow'].r - stats['lab.round090'].r) < 1e-4,
        `pillow is shading-only (${stats['lab.pillow'].r} vs ${stats['lab.round090'].r})`);
      // (No cross-bevel wear ordering. The character rows must just sit
      // below the tallest fillet, proving wear pulls inward.)
      assert.ok(stats['lab.tumbled'].r < stats['lab.round055'].r,
        `tumbled row trims below the .055 fillet (${stats['lab.tumbled'].r} vs ${stats['lab.round055'].r})`);
      assert.ok(stats['lab.pocked'].r < stats['lab.round055'].r,
        `pocked row trims below the .055 fillet (${stats['lab.pocked'].r} vs ${stats['lab.round055'].r})`);

      // THE WATERTIGHT CLAIM (Joe found the hole, 2026-08-04): every render
      // mesh must be a CLOSED surface — each directed edge paired by its
      // reverse. The pre-fix bowtie stitch left 4 unpaired per die edge:
      // one doubled band triangle + one pure-black HOLE on every beveled
      // edge of every die.
      const leakProbe = (only) => `JSON.stringify((() => {
        const bad = [];
        for (const row of window.__labRows) {
          if (${only ? `row.id !== ${JSON.stringify(only)}` : 'false'}) continue;
          row.meshes.forEach((c, i) => {
            const pos = c.mesh.geometry.attributes.position;
            const key = (j) => [0, 1, 2].map((k) => Math.round(pos.array[j * 3 + k] * 1000)).join(',');
            const m = new Map();
            for (let tI = 0; tI < pos.count; tI += 3) {
              for (let e = 0; e < 3; e++) {
                const a = key(tI + e), b = key(tI + (e + 1) % 3);
                const rev = b + '|' + a;
                if (m.get(rev)) m.set(rev, m.get(rev) - 1);
                else { const fwd = a + '|' + b; m.set(fwd, (m.get(fwd) || 0) + 1); }
              }
            }
            let un = 0;
            for (const v of m.values()) un += Math.abs(v);
            if (un) bad.push(row.id + '[' + i + ']=' + un);
          });
        }
        return bad;
      })())`;
      const leaks = JSON.parse(await t.eval(leakProbe(null)));
      assert.equal(leaks.length, 0, `every render mesh is watertight (leaks: ${leaks.join(' ')})`);

      // Hero-die framing (the detail view): a die type or column index
      const hero = await t.eval(`window.__lab.zoomDie('lab.round090', 'd6')`);
      assert.equal(hero, true, 'zoomDie frames a bench die by type');
      assert.equal(await t.eval(`window.__lab.zoomDie('lab.round090', 'd99')`), false,
        'zoomDie rejects an unknown type');

      // The builder: a geo patch reshapes the live row's render mesh…
      // (wear + nicks on purpose: the displacement pass must keep the
      // surface closed too — coincident vertices share the position hash)
      const r0 = stats['lab.builder'].r;
      await t.eval(`window.__lab.builderSet({ geo: { bevel: 0.12, profile: 'round', wear: 0.3, nicks: 2 } })`);
      const s2 = JSON.parse(await t.eval('JSON.stringify(window.__lab.geoStats())'));
      assert.ok(s2['lab.builder'].r < r0,
        `builder bevel edit reshaped the mesh (${s2['lab.builder'].r} vs ${r0})`);
      const builderLeaks = JSON.parse(await t.eval(leakProbe('lab.builder')));
      assert.equal(builderLeaks.length, 0,
        `the rebuilt worn builder row stays watertight (${builderLeaks.join(' ')})`);

      // …a body-color patch reaches the freshly baked face canvases…
      await t.eval(`window.__lab.builderSet({ stdColors: false, body: '#ff2222', text: '#ffffff' })`);
      const dump = JSON.parse(await t.eval(`JSON.stringify(window.__lab.faceDump('lab.builder', 1))`));
      const faces = dump.filter((f) => f.map);
      assert.ok(faces.length >= 6, 'builder d6 faces carry canvas textures');
      const avg = (i) => faces.reduce((s, f) => s + f.avg[i], 0) / faces.length;
      assert.ok(avg(0) > avg(1) + 40, `red body reaches the face bakes (rgb ${avg(0).toFixed(0)},${avg(1).toFixed(0)},${avg(2).toFixed(0)})`);

      // …and the assembled recipe carries both edits, themes.js-shaped.
      const rec = JSON.parse(await t.eval('JSON.stringify(window.__lab.builderRecipe())'));
      assert.equal(rec.geo.profile, 'round', 'recipe keeps the profile');
      assert.equal(rec.geo.bevel, 0.12, 'recipe keeps the bevel');
      assert.equal(rec.body, '#ff2222', 'recipe keeps the body color');
      assert.ok(rec.feel && typeof rec.feel.rough === 'number', 'recipe carries feel');

      // INK + TINT reach the live band material (read it directly — no
      // screenshots): a low-ink bench row sits closer to its body color
      // than the inked default; ink 0 IS the body; tint pulls toward it.
      const bandHex = (id, di) => `window.__labRows.find((r) => r.id === ${JSON.stringify(id)})`
        + `.meshes[${di}].mesh.material.at(-1).color.getHexString()`;
      const lum = (h) => parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16);
      const selfBand = await t.eval(bandHex('lab.selfink', 1));
      const inkedBand = await t.eval(bandHex('lab.round090', 1));
      assert.ok(lum(selfBand) > lum(inkedBand),
        `ink .04 leaves the band lighter than the inked default (${selfBand} vs ${inkedBand})`);
      await t.eval(`window.__lab.builderSet({ body: '#2e6f9e', geo: { ink: 0 } })`);
      assert.equal(await t.eval(bandHex('lab.builder', 1)), '2e6f9e',
        'ink 0 = fully self-colored band');
      await t.eval(`window.__lab.builderSet({ geo: { ink: 0.5, tint: '#ff0000' } })`);
      const tinted = await t.eval(bandHex('lab.builder', 1));
      assert.ok(parseInt(tinted.slice(0, 2), 16) > 0x2e,
        `tint pulls the band toward red (${tinted})`);

      // SEGMENTS reshape the fillet: more arc strips, more vertices
      await t.eval(`window.__lab.builderSet({ geo: { segments: 1 } })`);
      const v1 = JSON.parse(await t.eval('JSON.stringify(window.__lab.geoStats())'))['lab.builder'].verts;
      await t.eval(`window.__lab.builderSet({ geo: { segments: 5 } })`);
      const v5 = JSON.parse(await t.eval('JSON.stringify(window.__lab.geoStats())'))['lab.builder'].verts;
      assert.ok(v5 > v1, `segments grow the fillet mesh (${v5} > ${v1})`);

      // A scripted profile flip keeps recipes omit-at-default: untouched
      // ink snaps between profile defaults (explicitly patched ink wins).
      await t.eval(`window.__lab.builderSet({ geo: { ink: 0.12, tint: '#000000' } })`);
      await t.eval(`window.__lab.builderSet({ geo: { profile: 'cut' } })`);
      const recCut = JSON.parse(await t.eval('JSON.stringify(window.__lab.builderRecipe())'));
      assert.equal(recCut.geo.profile, undefined, 'cut is the default profile — omitted');
      assert.equal(recCut.geo.ink, undefined,
        `the flip snapped untouched ink to cut's default (got ${recCut.geo.ink})`);
    },
  },
  {
    name: 'zoom-syncs',
    tags: ['smoke', 'settings', 'zoom'],
    // Mat-zoom (Joe 2026-08-04): the room-wide preset resizes the physics
    // mat (walls move, shelf pitch derives from TABLE_W) and reflows every
    // shelved cluster to the new slot X. All clients agree — the setting
    // rides the same 'settings-changed' echo as felt/system, and applyZoom
    // is deterministic from the preset name alone.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });

      // Default is 'wide' on both, room-wide.
      assert.equal(await a.dbg('zoom'), 'wide', 'wide is the default');
      assert.equal(await b.dbg('zoom'), 'wide', 'B sees the same default');

      // Shelve a die at wide zoom, capture its world X on both tabs.
      await a.roll('1d6');
      await a.dbg(`collectRoll(${JSON.stringify(await a.rollId())})`);
      for (const t of [a, b]) {
        await t.waitFor(
          `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1`
          + ` && window.__diceDebug.whiskingCount === 0)`,
          { desc: 'die on shelf' },
        );
      }
      const beforeA = await a.dbg('firstShelfDieWorldX()');
      const beforeB = await b.dbg('firstShelfDieWorldX()');
      assert.ok(Number.isFinite(beforeA) && Number.isFinite(beforeB),
        'both tabs have a shelved die');
      assert.ok(Math.abs(beforeA - beforeB) < 0.01,
        `shelf X deterministic across clients (A=${beforeA}, B=${beforeB})`);

      // A sets zoom to 'close'; wait for the echo on BOTH.
      await a.dbg(`setZoom('close')`);
      for (const t of [a, b]) {
        await t.waitFor(`window.__diceDebug.zoom === 'close'`,
          { desc: 'zoom syncs to close' });
      }

      // Wall positions changed to the close preset (TABLE_W=18, TABLE_D=11).
      for (const [t, tag] of [[a, 'A'], [b, 'B']]) {
        const wp = await t.dbg('wallPositions()');
        assert.ok(Math.abs(wp.right.x - 9) < 1e-6,
          `${tag}: right wall at +TABLE_W/2 = 9 (got ${wp.right.x})`);
        assert.ok(Math.abs(wp.left.x + 9) < 1e-6,
          `${tag}: left wall at -9 (got ${wp.left.x})`);
        assert.ok(Math.abs(wp.front.z - 5.5) < 1e-6,
          `${tag}: front wall at +TABLE_D/2 = 5.5 (got ${wp.front.z})`);
        assert.ok(Math.abs(wp.back.z + 5.5) < 1e-6,
          `${tag}: back wall at -5.5 (got ${wp.back.z})`);
      }

      // Shelf pitch is derived from TABLE_W: (18 - 5.4) / 4 ≈ 3.15.
      const pitchA = await a.dbg('shelfPitch()');
      const pitchB = await b.dbg('shelfPitch()');
      const expectedPitch = (18 - 5.4) / 4;
      assert.ok(Math.abs(pitchA - expectedPitch) < 0.01,
        `A: shelf pitch ≈ ${expectedPitch} (got ${pitchA})`);
      assert.ok(Math.abs(pitchB - expectedPitch) < 0.01,
        `B: shelf pitch ≈ ${expectedPitch} (got ${pitchB})`);

      // Let the whisk settle after reflowShelf's animated re-place.
      for (const t of [a, b]) await t.dbg('sim(600)');

      // The previously-shelved die moved with the new pitch.
      const afterA = await a.dbg('firstShelfDieWorldX()');
      const afterB = await b.dbg('firstShelfDieWorldX()');
      assert.ok(Math.abs(afterA - afterB) < 0.01,
        `after: shelf X still deterministic (A=${afterA}, B=${afterB})`);
      // With one cluster at slot 0 of 5 the slot X is (0 - 2) * pitch =
      // -2 * pitch. At wide pitch=6.15 the die sits near x=-12.3; at close
      // pitch=3.15 it sits near x=-6.3 — a real move, not a rounding blip.
      assert.ok(Math.abs(afterA - beforeA) > 0.5,
        `the die actually reflowed (before=${beforeA}, after=${afterA})`);

      // Determinism still holds with a non-default mat: keyframes bit-
      // identical across tabs when both are at 'close'.
      const HASH = `(() => {
        const r = window.__diceDebug.currentRoll;
        if (!r || !r.keyframes) return null;
        const per = r.keyframes.map((arr) => arr.map((s) =>
          [s.pos.x, s.pos.y, s.pos.z, s.quat.x, s.quat.y, s.quat.z, s.quat.w]
            .map((f) => f.toFixed(9)).join(',')
        ).join('|'));
        return { hash: per.join('||'), seed: r.seed, dice: r.dice.length };
      })()`;
      await a.roll('4d6');
      await b.settle();
      const ha = await a.eval(HASH);
      const hb = await b.eval(HASH);
      assert.ok(ha && hb, 'both tabs captured keyframes at close');
      assert.equal(ha.seed, hb.seed, 'same seed on both tabs at close');
      assert.equal(ha.hash, hb.hash, 'keyframes bit-identical at close zoom');
    },
  },
  {
    name: 'perf-determinism',
    tags: ['smoke', 'perf', 'resync'],
    // Perf pass §0a (Commit B — SAP broadphase guard): the SAP broadphase
    // reorders collision-pair enumeration by axis, which is a determinism
    // hazard if the physics diverges between clients on the same seed.
    // Face-correction masks trajectory drift (both dice land on the same
    // value), so values-only assertions can't catch this — we need the
    // keyframes themselves to be bit-identical across tabs. Also gates
    // Commit A (per-die freeze) against unnoticed order-of-freeze drift.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });

      // Canonicalize keyframes to a stable hash: 9-decimal fixed strings for
      // each (pos, quat) tuple in every die's keyframe array, joined per die
      // and across dice. Any float drift in the last decimal fails the check.
      const HASH = `(() => {
        const r = window.__diceDebug.currentRoll;
        if (!r || !r.keyframes) return null;
        const per = r.keyframes.map((arr) => arr.map((s) =>
          [s.pos.x, s.pos.y, s.pos.z, s.quat.x, s.quat.y, s.quat.z, s.quat.w]
            .map((f) => f.toFixed(9)).join(',')
        ).join('|'));
        return { frames: r.frames, seed: r.seed, dice: r.dice.length, hash: per.join('||') };
      })()`;

      const cases = [
        { notation: '1d20', desc: 'smoke — single die' },
        { notation: '8d6',  desc: 'target — small pool' },
        { notation: '20d6', desc: 'target — large pool (SAP-sensitive)' },
      ];
      for (const c of cases) {
        await a.roll(c.notation);
        await b.settle();
        const ha = await a.eval(HASH);
        const hb = await b.eval(HASH);
        assert.ok(ha && hb, `${c.desc}: both tabs captured keyframes`);
        assert.equal(ha.seed, hb.seed, `${c.desc}: same seed on both tabs`);
        assert.equal(ha.frames, hb.frames, `${c.desc}: same frame count (A=${ha.frames}, B=${hb.frames})`);
        assert.equal(ha.dice, hb.dice, `${c.desc}: same die count`);
        assert.equal(ha.hash, hb.hash, `${c.desc}: keyframes bit-identical across clients`);
        // Sweep the felt so the next case rolls onto a clean world (each
        // roll must be measured in isolation — a leftover shelf changes
        // the broadphase's static population).
        const rid = await a.rollId();
        await a.dbg(`clearRoll(${JSON.stringify(rid)})`);
        for (const t of [a, b]) {
          await t.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length === 0)`,
            { desc: `${c.desc}: table cleared` });
        }
      }
    },
  },
  {
    name: 'endurance-log',
    tags: ['perf', 'roll', 'log', 'endurance-log'],
    // Tier 0 §0e: addLogEntry used to full-rebuild #log-list on every
    // arrival, rebinding one closure per entry. This scenario proves the
    // append+prune path is:
    //   (1) length-correct — after N rolls the DOM holds min(N, LOG_CAP)
    //       rows AND the newest row's data-roll-id matches currentRoll,
    //   (2) reroll-correct — the delegated ⟳ on a row that is NOT the
    //       newest still dispatches with THAT entry's spec (a stale
    //       per-entry closure was the pre-fix bug),
    //   (3) chip-correct — a reroll-of-a-reroll chain (A → B → C) leaves
    //       both A and B carrying exactly one `.log-rerolled` chip, and C
    //       carries `.is-reroll` — the same state a full renderLog() would
    //       produce.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });

      // (1) 60 back-to-back rolls. Solo is fine here — the fix is a pure
      // client-side render change and solo exercises the same addLogEntry
      // path with a synthetic 'solo-<ts>-<rand>' rollId per entry.
      const N = 60;
      for (let i = 0; i < N; i++) await a.roll(`d6 # r${i + 1}`);

      const logLen = await a.eval(`document.getElementById('log-list').childElementCount`);
      // LOG_CAP is 100; 60 rolls stay under it, so DOM == push count.
      assert.equal(logLen, Math.min(N, 100), `log-list holds min(N, LOG_CAP) rows (got ${logLen})`);

      // The newest row (renders reversed, so DOM index 0) IS the last roll.
      const newestRid = await a.eval(
        `document.getElementById('log-list').firstElementChild.dataset.rollId`);
      const lastRid = await a.rollId();
      assert.equal(newestRid, lastRid, 'the newest row stamps the last roll id');

      // (2) Click ⟳ on the 30th roll (1-indexed) — DOM index N - 30 = 30
      // since the list renders newest-first.
      const targetIdx = N - 30; // 30
      const clicked = await a.eval(`(() => {
        const row = document.getElementById('log-list').children[${targetIdx}];
        if (!row) return null;
        const btn = row.querySelector('.log-again');
        if (!btn) return null;
        btn.click();
        return { rid: row.dataset.rollId, label: row.innerText.match(/r(\\d+)/)[0] };
      })()`);
      assert.ok(clicked, `row ${targetIdx} exists with a ⟳ button`);
      assert.equal(clicked.label, 'r30', 'the 30th DOM row from the top is r30');

      // The delegated handler routes to requestRoll with THIS entry's spec.
      // __diceDebug.lastRequestedRoll captures the ask; the label must be
      // the r30 entry's label (proves the closure was not stale).
      const asked = await a.dbg('lastRequestedRoll');
      assert.ok(asked, 'requestRoll fired');
      assert.equal(asked.label, 'r30', `requestRoll saw the r30 entry (got ${asked.label})`);
      assert.equal(asked.rerollOfId, clicked.rid, 'reroll provenance names the parent');

      // Wait for the reroll itself to complete so C's arrival lands.
      await a.waitFor(
        `(window.__diceDebug.sim(120), !window.__diceDebug.busy`
        + ` && document.getElementById('log-list').childElementCount === ${N + 1})`,
        { desc: 'the ⟳ reroll appended a row' });

      // The parent row (r30, `clicked.rid`) is now superseded — markSuperseded
      // must have added exactly one `.log-rerolled` chip in place, without a
      // full rebuild. B is our new reroll of A (r30).
      const bRid = await a.rollId();
      const parentChips = await a.eval(`(() => {
        const row = document.querySelector('#log-list .log-entry[data-roll-id=' + JSON.stringify(${JSON.stringify(clicked.rid)}) + ']');
        return row ? {
          rerolledChips: row.querySelectorAll('.log-rerolled').length,
          hasIsReroll: row.classList.contains('is-reroll'),
        } : null;
      })()`);
      assert.ok(parentChips, 'the parent row still exists');
      assert.equal(parentChips.rerolledChips, 1, 'exactly one `rerolled` chip on the parent');
      assert.equal(parentChips.hasIsReroll, false, 'the parent is not itself a reroll');

      // (3) Reroll-of-reroll chain: reroll B — the freshly-appended row —
      // and observe that A stays with its single chip (chip idempotence) and
      // B (which is itself a reroll of A) gains its own `.log-rerolled`
      // WITHOUT dropping `.is-reroll`. C wears `.is-reroll` only (else-if).
      await a.eval(`(() => {
        const row = document.querySelector('#log-list .log-entry[data-roll-id=' + JSON.stringify(${JSON.stringify(bRid)}) + ']');
        row.querySelector('.log-again').click();
      })()`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), !window.__diceDebug.busy`
        + ` && document.getElementById('log-list').childElementCount === ${N + 2})`,
        { desc: 'the second ⟳ reroll appended a row' });
      const cRid = await a.rollId();

      const chain = await a.eval(`(() => {
        const q = (rid) => document.querySelector('#log-list .log-entry[data-roll-id=' + JSON.stringify(rid) + ']');
        const shape = (rid) => {
          const row = q(rid);
          return row ? {
            rerolled: row.querySelectorAll('.log-rerolled').length,
            reroll: row.querySelectorAll('.log-reroll').length,
            isReroll: row.classList.contains('is-reroll'),
          } : null;
        };
        return { a: shape(${JSON.stringify(clicked.rid)}), b: shape(${JSON.stringify(bRid)}), c: shape(${JSON.stringify(cRid)}) };
      })()`);
      // A: still one `rerolled` chip (idempotence — the second reroll
      // targets B, not A; A's chip must not stack).
      assert.deepEqual(chain.a, { rerolled: 1, reroll: 0, isReroll: false },
        `A stays chip-idempotent (got ${JSON.stringify(chain.a)})`);
      // B: itself a reroll (of A) AND now rerolled (by C). The full-render
      // else-if suppresses the `rerolled` chip when `.is-reroll` is set —
      // markSuperseded mirrors that; expect zero `rerolled` chips on B.
      assert.deepEqual(chain.b, { rerolled: 0, reroll: 1, isReroll: true },
        `B keeps 'reroll' only, matching renderLog's else-if (got ${JSON.stringify(chain.b)})`);
      // C: the newest — a reroll of B, not yet rerolled itself.
      assert.deepEqual(chain.c, { rerolled: 0, reroll: 1, isReroll: true },
        `C wears 'reroll' only (got ${JSON.stringify(chain.c)})`);
    },
  },
  {
    name: 'endurance-outline',
    tags: ['perf', 'roll', 'endurance-outline'],
    // Tier 0 §0e: the roll-dice outline is anchored to banner hover — a
    // mouseenter paints an inverted-hull shell on each die, mouseleave clears
    // them. Any code path that HID the banner without a mouseleave (a new
    // roll spawning, auto-collect, clearRoll, resetTableSurface, the
    // banner-main click) used to strand those shells on the felt — a per-die
    // BackSide MeshBasicMaterial + a scene-graph child that never got freed.
    // hideBanner() now routes every hide through outlineRollDice(false) first,
    // and outlineRollDice(true) declines to paint against a hidden card, so a
    // hover-then-hide pattern lands at zero every time. This scenario stresses
    // that path 60 rolls deep.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });

      // 60 back-to-back rolls, each one: roll → hover the banner (paint the
      // outline) → the NEXT roll's spawn hides the banner via hideBanner. In
      // the pre-fix world the outline shells piled up across iterations; the
      // fix guarantees each hide clears them before the next paint.
      const N = 60;
      for (let i = 0; i < N; i++) {
        await a.roll('d6');
        // hoverBanner returns the current outlined.length; asserting > 0 keeps
        // the test honest — if the paint no-ops for any reason, the leak
        // assertion below could pass vacuously.
        const painted = await a.dbg('hoverBanner(true)');
        assert.equal(painted, 1, `iter ${i}: the hover paints one shell (got ${painted})`);
      }

      // The last iteration left an outline standing. The banner-main click
      // (roller side → dismisses this roll's card via requestClearRoll →
      // hideBanner) is the hide path we assert against here.
      const bRid = await a.rollId();
      await a.eval(`document.getElementById('banner-main').click()`);
      await a.waitFor(
        `document.getElementById('result-banner').classList.contains('hidden')`,
        { desc: 'banner hides after the clear click' });
      await a.settle();

      assert.equal(await a.dbg('outlinedCount'), 0,
        'the hide clears every outline shell — no strays on the felt');

      // And the guard: a stray hoverBanner(true) after a hide is a no-op
      // (the banner cannot own an outline the reader cannot see).
      await a.dbg('hoverBanner(true)');
      assert.equal(await a.dbg('outlinedCount'), 0,
        'hoverBanner against a hidden card paints nothing');

      // sanity: the last cleared roll is really gone from the felt view
      assert.ok(bRid, 'the endurance loop actually produced a roll id');
    },
  },
  {
    name: 'rail-multi-pick',
    tags: ['smoke', 'chrome', 'groups'],
    // THE CORE ASK (Joe 2026-08-07): "it don't allow for the common case of
    // picking multiple pools (an attribute, skill and motivation is a common
    // pool combo in Your Soul Deal). The ability to select a few pools and
    // roll feels key." Three taps and one gold bar, from the collapsed rail,
    // without a tray and without expanding the panel.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setGroups([
        {name: 'Wisdom', notation: '2d8', category: 'attributes'},
        {name: 'Swords', notation: '1d10', category: 'skills'},
        {name: 'Zeal', notation: '1d4', category: 'motivations'}
      ])`);
      // Panel state leaks across scenarios on a shared origin profile — the
      // finally is what keeps a failure here from collapsing the next one.
      await a.dbg('setPanelState({pools: false})');
      try {
        // The shelf titles Joe said were dropped, spelled and in rack order.
        const rail = await a.dbg('railState');
        // Raw category text, uppercased by CSS — exactly what the expanded
        // rack's own section heads carry, so the two surfaces agree.
        assert.deepEqual(rail.shelves, ['attributes', 'skills', 'motivations'],
          'the shelf titles come back, trio-ordered');
        assert.deepEqual(rail.items.map((i) => i.name), ['Wisdom', 'Swords', 'Zeal'],
          'every pool reads as a word');

        // Three digits = three picks. Same order as the rack, so '1 2 3'
        // means the same roll whether the panel is open or closed.
        for (const k of ['1', '2', '3']) {
          await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '${k}'}))`);
        }
        const picked = await a.dbg('railState');
        assert.deepEqual(picked.selected, ['Wisdom', 'Swords', 'Zeal'], 'all three are picked');
        assert.equal(picked.rollStanding, true, 'the gold verb stands');
        assert.equal(picked.rollDisabled, false, 'and four dice is well under the cap, so it is armed');
        assert.equal((await a.dbg('trayState')).dice.length, 0,
          'and the draft below is still untouched');

        // Enter fires the selection — ONE roll carrying all three pools.
        const before = await a.logCount();
        await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))`);
        await a.waitFor(
          `(window.__diceDebug.sim(120), document.getElementById('log-list').childElementCount > ${before}`
          + ` && !window.__diceDebug.busy)`,
          { desc: 'the selection rolls' });
        assert.equal(await a.logCount(), before + 1, 'exactly one roll, not three');
        const top = await a.logTop();
        for (const n of ['Wisdom', 'Swords', 'Zeal']) {
          assert.ok(top.includes(n), `the composed roll names ${n} (got: ${top})`);
        }
        assert.equal(await a.diceCount(), 4, 'all four dice hit the felt together');

        // Spent by its roll (2i-G) — nothing left behind, and no tray was
        // ever needed to hold it.
        const after = await a.dbg('railState');
        assert.deepEqual(after.selected, [], 'the selection is spent');
        assert.equal(after.rollDisabled, true, 'and disarms the verb without moving it');
        assert.equal((await a.dbg('panelState')).pools, false, 'the panel never expanded');

        // Esc drops picks before it ever sweeps the felt.
        await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '1'}))`);
        assert.deepEqual((await a.dbg('railState')).selected, ['Wisdom'], 'picked again');
        await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
        assert.deepEqual((await a.dbg('railState')).selected, [],
          'Esc drops the picks first — a mis-tap never costs a roll');
        assert.ok(await a.diceCount() > 0, 'and the felt was not swept');

        // Expanding drops a half-pick: the workbench is the composing
        // surface, and state visible in neither place is the worse outcome.
        await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '2'}))`);
        assert.deepEqual((await a.dbg('railState')).selected, ['Swords'], 'picked before expanding');
        await a.dbg('setPanelState({pools: true})');
        assert.deepEqual((await a.dbg('railState')).selected, [],
          'expanding drops the rail selection');
        assert.equal((await a.dbg('railState')).rollStanding, false,
          'and the gold bar does not survive into the open panel');
      } finally {
        await a.dbg('setPanelState({pools: true})');
      }
    },
  },
  {
    name: 'rail-compose-rules',
    tags: ['chrome', 'groups'],
    // What a multi-pick can and cannot carry. One pick launches the pool as
    // AUTHORED; two or more compose, and the grammar has no union for the
    // glue mods — so they are stripped OUT LOUD rather than silently.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setGroups([
        {name: 'Brutal', notation: '4d6dl1'},
        {name: 'Plain', notation: '2d6'},
        {name: 'Sneaky', notation: '1d8 secret'},
        {name: 'Open', notation: '1d8'}
      ])`);
      await a.dbg('setPanelState({pools: false})');
      try {
        // SINGLE pick: authored intent rides verbatim. dl1 survives.
        await a.dbg(`setRailSelection(['Brutal'])`);
        await a.dbg('railRoll()');
        await a.waitFor(`(window.__diceDebug.sim(120), !window.__diceDebug.busy)`,
          { desc: 'the single pick rolls' });
        assert.ok((await a.dbg('lastRequestedRoll')).canonical.includes('dl1'),
          'one pick keeps its keep/drop — it is the pool as its author wrote it');

        // MULTI pick: the same pool's dl1 is stripped. This is the trap the
        // design pass caught — `4d6dl1 + 2d6` is a SAME-TYPE sum, which the
        // parser accepts by widening the glue to `6d6dl1`, silently changing
        // the distribution. So glue comes off unconditionally, never as a
        // fallback on a parse error.
        await a.dbg(`setRailSelection(['Brutal', 'Plain'])`);
        await a.dbg('railRoll()');
        await a.waitFor(`(window.__diceDebug.sim(120), !window.__diceDebug.busy)`,
          { desc: 'the composed pick rolls' });
        const asked = await a.dbg('lastRequestedRoll');
        assert.ok(!asked.canonical.includes('dl'),
          `a composed roll drops keep/drop (got: ${asked.canonical})`);
        assert.equal(asked.dice.length, 6, 'all six dice ride');
        const note = (await a.dbg('railState')).note;
        assert.ok(note && note.includes('Brutal') && /set aside/.test(note),
          `and the rail SAYS what it set aside (got: ${JSON.stringify(note)})`);

        // Visibility fails CLOSED (goal 11): mixing a secret pick with an
        // open one yields secret, never the more open of the two.
        await a.dbg(`setRailSelection(['Sneaky', 'Open'])`);
        await a.dbg('railRoll()');
        await a.waitFor(`(window.__diceDebug.sim(120), !window.__diceDebug.busy)`,
          { desc: 'the mixed-visibility pick rolls' });
        const vis = (await a.dbg('lastRequestedRoll')).visibility;
        assert.equal(vis && vis.mode, 'secret',
          'mixed visibility closes down to secret, never up to open');
      } finally {
        await a.dbg('setPanelState({pools: true})');
      }
    },
  },
  {
    name: 'named-verb',
    tags: ['smoke', 'roll', 'chrome'],
    // THE NAMED VERB (Joe 2026-08-07: "the 'x' on the main body is probably
    // too non-intuitive… we need that to remain the main action but find a
    // better UX"). The act keeps its primacy and gains a name. Everything
    // here is read WITHOUT hovering anything — that is the whole point: the
    // old affordance existed only under a cursor.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.roll('2d8[Wisdom]+1d4 # Reach');
      await b.settle();
      await b.waitFor(`!document.getElementById('result-banner').classList.contains('hidden')`,
        { desc: 'the banner reaches Bob' });

      // The roller: a standing, worded, red Clear that never rests dim and
      // carries the §7.9 contract sentence as its accessible name.
      const av = await a.dbg(`cardActs('banner')`);
      assert.equal(av.primary.verb, 'clear', 'the roller’s primary act is clear');
      assert.equal(av.primary.word, 'Clear', 'and it says the word');
      assert.equal(av.primary.opacity, '1', 'standing, not dim — no hover needed');
      assert.equal(av.primary.label, 'Clear this roll for everyone',
        'the contract sentence is the accessible name');
      assert.equal(av.primary.disabled, false, 'armed at rest');

      // The spectator: the same geometry, a different word and a different
      // hue. Red on a local dismiss would lie about what the press does.
      const bv = await b.dbg(`cardActs('banner')`);
      assert.equal(bv.primary.verb, 'dismiss', 'a spectator dismisses');
      assert.equal(bv.primary.word, 'Dismiss', 'and the word says so');
      assert.ok(bv.primary.label.startsWith('Dismiss —'), 'with its own sentence');

      // Bob's press is local: his card goes, the dice stay for everyone.
      await b.eval(`document.querySelector('#banner-actions .card-act').click()`);
      await b.waitFor(`document.getElementById('result-banner').classList.contains('hidden')`,
        { desc: 'the spectator’s dismiss closes his card' });
      assert.ok(await b.diceCount() > 0, 'and leaves the dice on the felt');
      assert.ok(await a.diceCount() > 0, 'Alice still sees them too');

      // Alice's press clears for the room.
      await a.eval(`document.querySelector('#banner-actions .card-act').click()`);
      for (const [t, who] of [[a, 'Alice'], [b, 'Bob']]) {
        await t.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length === 0)`,
          { desc: `the named Clear emptied the felt for ${who}` });
      }
    },
  },
  {
    name: 'linked-press',
    tags: ['chrome', 'roll'],
    // The body stays a clear target — the biggest one on screen — but it is
    // a SHORTCUT now, not the advertised control. Hovering it lights the
    // named bar (teaching the word) instead of painting a 72px ✕ watermark
    // that only a cursor could ever discover.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      await a.roll('d20 # Body');
      // The retired dress: no role, no tabindex, no watermark.
      assert.equal(await a.eval(`document.getElementById('banner-main').getAttribute('role')`), null,
        'the body is no longer announced as a button');
      assert.equal(await a.eval(`document.getElementById('banner-main').getAttribute('tabindex')`), null,
        'and no longer holds a tab stop');
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('banner-main'), '::after').content`),
        'none', 'the ✕ watermark is gone');
      // The linked press. Needs a REAL cursor: a synthetic mouseover runs
      // listeners but never moves the browser's hover state, so the rule
      // would stay unmatched and the assertion would lie either way.
      await a.eval(`document.querySelectorAll('.card-act').forEach((el) => { el.style.transition = 'none'; })`);
      const borderOf = `getComputedStyle(document.querySelector('#banner-actions .card-act')).borderTopColor`;
      const rest = await a.eval(borderOf);
      assert.ok(await a.hover('#banner-main'), 'the banner body is on screen to hover');
      const lit = await a.eval(borderOf);
      assert.notEqual(lit, rest, 'hovering the body lights the named bar');
      // …and the body click still clears, because the hand already knows it.
      await a.eval(`document.getElementById('banner-main').click()`);
      await a.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length === 0)`,
        { desc: 'the body shortcut still clears' });
    },
  },
  {
    name: 'named-verb-touch',
    tags: ['chrome', 'roll'],
    // The state the old design failed outright. A phone has no hover, so a
    // hover-armed affordance is not a quiet affordance — it is no
    // affordance. Read with ZERO pointer events sent.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      await a.emulateCoarsePointer(true);
      try {
        await a.roll('d20 # Thumb');
        const v = await a.dbg(`cardActs('banner')`);
        assert.equal(v.primary.opacity, '1', 'the primary stands on a phone, unhovered');
        assert.ok(v.primary.minH >= 44,
          `the primary is a real touch target (got ${v.primary.minH}px)`);
        assert.ok(v.reroll.minH >= 44,
          `so is the REROLL strip (got ${v.reroll.minH}px)`);
      } finally {
        await a.emulateCoarsePointer(false); // per-tab, outlives the scenario
      }
    },
  },
  {
    name: 'named-verb-keys',
    tags: ['chrome', 'roll'],
    // The primary is a real <button>, which is what makes the keyboard path
    // work without a hand-rolled keydown twin: it owns Enter and Space
    // natively, and the table's global Enter (collect) bails on a focused
    // button rather than firing underneath it.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      await a.roll('d20 # Keys');
      assert.equal(await a.eval(
        `document.querySelector('#banner-actions .card-act').tagName`), 'BUTTON',
        'the primary is a native button, not a div wearing role=button');
      // Focus it and fire Enter FROM it (target = the button, bubbling to
      // the document handler) — the global collect must decline.
      await a.eval(`document.querySelector('#banner-actions .card-act').focus()`);
      assert.ok(await a.eval(
        `document.activeElement === document.querySelector('#banner-actions .card-act')`),
        'the primary takes focus');
      const shelfBefore = (await a.shelf()).length;
      await a.eval(`document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
      await a.settle();
      assert.equal((await a.shelf()).length, shelfBefore,
        'the table’s Enter-collects yields to the focused button');
      assert.ok(await a.diceCount() > 0, 'and nothing was swept underneath it');
    },
  },
  {
    name: 'verdict-skip-verb',
    tags: ['roll', 'ceremony'],
    // The one surface whose primary act changes under you. While the moment
    // plays, the press SKIPS — completing the beat and clearing the roll are
    // never one gesture (§7.16) — so the word must say Skip, in steel,
    // because skipping is a tool and not a removal. When the beat lands it
    // repaints to Clear.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`commandRoll('d20 check dc10')`);
      // TWO different waits, and conflating them is what made this flaky.
      // (1) The roll must ARRIVE — online that is a POST and an SSE, which
      // needs real time, so it has to be a poll.
      await a.waitFor(`!!(window.__diceDebug.currentRoll || {}).ceremony`,
        { desc: 'the ceremony arrives' });
      // (2) The Skip window is then a BOUNDED slice of simulated time — the
      // card paints at tVerdict and the beat ends 0.45s later. Polling for
      // THAT raced two ways at once: each round-trip costs real time, and
      // 30ms of sim per poll needs ~100 polls just to reach the window, so
      // under a loaded parallel run it timed out before arriving. Frames do
      // not advance on their own here (that is why sim() exists), so once
      // the roll has landed the whole beat can be stepped inside ONE eval —
      // deterministic, and it cannot step past what it is looking for.
      const mid = JSON.parse(await a.eval(`JSON.stringify((() => {
        const d = window.__diceDebug;
        for (let i = 0; i < 900; i++) {
          d.sim(15);
          if (document.querySelector('#verdict-fold .card-act') && !(d.currentRoll || {}).done) {
            return d.cardActs('verdict');
          }
        }
        return null;
      })())`));
      assert.ok(mid, 'the verdict card came up while the beat was still playing');
      assert.equal(mid.primary.verb, 'skip', 'mid-beat the primary act is SKIP');
      assert.equal(mid.primary.word, 'Skip', 'and it says so — never a silent clear');

      await a.waitFor(
        `(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(30), (window.__diceDebug.ceremonyState || {}).phase === 'done')`,
        { desc: 'the beat lands' });
      const done = await a.dbg(`cardActs('verdict')`);
      assert.equal(done.primary.verb, 'clear', 'the word catches up with the beat');
      assert.equal(done.primary.word, 'Clear', 'and now offers the removal');
      // …and it really clears, for everyone.
      await a.eval(`document.querySelector('#verdict-fold .card-act').click()`);
      await a.waitFor(`(window.__diceDebug.sim(160), window.__diceDebug.tableDice.length === 0)`,
        { desc: 'the ceremony card’s named Clear empties the felt' });
    },
  },
  {
    name: 'fold-visibility',
    tags: ['smoke', 'roll', 'chrome'],
    // The pin the suite never had. endurance-banner-actions asserts the
    // `.hidden` PROPERTY, which the toggle really does set — but a property
    // is not a paint. `.banner-foot { display: flex }` (css:3018) and
    // `.pool-roll { display: flex }` (css:797) are AUTHOR-origin rules, and
    // the UA sheet's `[hidden] { display: none }` is user-agent origin, so
    // the author rule wins no matter its specificity. Everything here reads
    // COMPUTED DISPLAY: what the player's eye actually gets.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      const shown = (sel) => a.eval(
        `(() => { const el = document.querySelector(${JSON.stringify(sel)});`
        + ` return el ? getComputedStyle(el).display : 'absent'; })()`);

      // Face up and rerollable: REROLL stands, Reveal must be GONE — there is
      // nothing left to reveal, and the server would 403 the attempt.
      await a.roll('d6 # open');
      assert.notEqual(await shown('#banner-actions .pk-strip'), 'none',
        'a face-up roll shows its REROLL strip');
      assert.equal(await shown('#banner-actions .banner-foot'), 'none',
        'a face-up roll paints NO Reveal — the value is already public');

      // Held: the mirror image. Reveal stands; REROLL must be gone, because a
      // reroll would replay a spec nobody at the table can read (the same rule
      // the log line already follows — held-roll pins 'no ⟳ while hidden').
      await a.roll('d6 held # sealed');
      assert.notEqual(await shown('#banner-actions .banner-foot'), 'none',
        'a held roll shows its Reveal');
      assert.equal(await shown('#banner-actions .pk-strip'), 'none',
        'a held roll paints NO REROLL while the result is unreadable');
    },
  },
  {
    name: 'endurance-banner-actions',
    tags: ['perf', 'roll', 'chrome', 'endurance-banner-actions'],
    // Tier 0 §0e / L8: renderBannerActions used to full-rebuild #banner-actions
    // (and renderVerdictCard used to wipe #verdict-fold) on every roll arrival,
    // tossing 4 DOM nodes + 2 listeners per collect-then-reroll cycle. Under
    // mount-once semantics both holders sit at exactly 3 children forever —
    // the named primary, the reveal foot and the REROLL strip — with the
    // primary repainted and the other two `hidden`-toggled per entry.
    // This scenario stresses the invariant 60 rolls deep, then confirms the
    // Reroll strip still routes to requestRoll from the banner (concern #3 in
    // the L8 review: rollId-less handlers must not silently no-op).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });

      // 60 rolls back-to-back — the banner + verdict-fold repaint each time.
      const N = 60;
      for (let i = 0; i < N; i++) await a.roll(`d6 # r${i + 1}`);

      // The mount-once invariant: exactly 3 children (primary + reveal foot
      // + strip) regardless of how many roll arrivals paint the holder.
      const bannerKids = await a.eval(
        `document.getElementById('banner-actions').childElementCount`);
      assert.equal(bannerKids, 3,
        `#banner-actions holds exactly primary + reveal-foot + strip (got ${bannerKids})`);

      // The row never collapses now — the primary always stands, so the old
      // .card-actions-empty gate is gone and the crease is honest at rest.
      const acts = await a.dbg(`cardActs('banner')`);
      assert.equal(acts.foldDisplay, 'flex', 'the fold stands as a row');
      assert.equal(acts.primary.verb, 'clear', 'the roller’s primary act is Clear');
      assert.equal(acts.primary.word, 'Clear', 'and it says so');
      assert.equal(acts.primary.opacity, '1', 'the primary never rests dim');
      // Both the property AND the paint — the property alone is what let a
      // live Reveal ship on every face-up card (see fold-visibility).
      const stripHidden = await a.eval(
        `document.querySelector('#banner-actions .pk-strip').hidden`);
      assert.equal(stripHidden, false, 'the REROLL strip is visible for a rerollable roll');
      assert.notEqual(acts.reroll.display, 'none', 'and it actually paints');
      const revealHidden = await a.eval(
        `document.querySelector('#banner-actions .banner-foot').hidden`);
      assert.equal(revealHidden, true, 'the reveal foot stays hidden for a face-up roll');
      assert.equal(acts.reveal.display, 'none', 'and it actually stays off screen');

      // Click the strip — the handler reads holder._entry, not a log lookup,
      // so it still fires for the current banner entry.
      const beforeRid = await a.rollId();
      await a.eval(`document.querySelector('#banner-actions .pk-strip').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), !window.__diceDebug.busy`
        + ` && (window.__diceDebug.lastRequestedRoll || {}).rerollOfId === ${JSON.stringify(beforeRid)})`,
        { desc: 'the persistent strip still rolls the current entry' });
      const asked = await a.dbg('lastRequestedRoll');
      assert.ok(asked, 'requestRoll fired from the persistent strip');
      assert.equal(asked.label, `r${N}`,
        `the strip rerolled the r${N} entry (got ${asked.label})`);

      // After the reroll, the holder is STILL exactly three children — the
      // update path never appends, only toggles and repaints.
      const bannerKids2 = await a.eval(
        `document.getElementById('banner-actions').childElementCount`);
      assert.equal(bannerKids2, 3, 'holder stays at 3 children through a reroll');
    },
  },
  {
    name: 'file-door',
    tags: ['table-file', 'groups'],
    // ROADMAP §G1: Settings → Your data can now put the rack on disk and take
    // it back. The file IS the durable copy (PROFILES.md §5), so the two
    // things worth pinning are that the name is predictable enough to find
    // again and that the round trip does not drift. Download's a.click() is
    // deliberately unasserted — firing it would drop a file in the operator's
    // Downloads; filename() and the snapshot round trip are the testable half.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });

      // The room key is the fallback slug, and this ctx room is a generated
      // one — so assert the SHAPE, then pin the tableName override, which is
      // the branch an organizer actually hits.
      const bare = await a.dbg('portable.filename()');
      assert.ok(/^[a-z0-9-]{1,40}-\d{4}-\d{2}-\d{2}\.dice\.yaml$/.test(bare),
        `filename is a dated slug (got ${bare})`);

      await ctx.api('/api/settings', {
        playerId: await a.playerId(),
        settings: { tableName: 'Your Soul Deal!! Session 3' },
      });
      await a.waitFor(
        `window.__diceDebug.portable.filename().startsWith('your-soul-deal-session-3-')`,
        { desc: 'the table name drives the filename, slugified' });

      // Round trip: what Download would write, read straight back, is a
      // fixed point — no format drift, nothing to apply.
      const v = await a.dbg('portable.loadText(window.__diceDebug.portable.snapshot())');
      assert.equal(v.ok, true, 'a snapshot re-reads clean');
      assert.equal(v.canApply, false, `round trip has nothing to apply (got ${v.status})`);

      // A file with one pool the rack lacks previews as exactly one add, and
      // Apply takes it. The import is additive by contract — planImport
      // deletes nothing, which is why the codec lost (GOALS §7).
      const before = (await a.dbg('groups')).length;
      const withNew = "pools:\n  Pools:\n    - 'Doorbell': '2d6+1'\n";
      const v2 = await a.dbg(`portable.loadText(${JSON.stringify(withNew)})`);
      assert.equal(v2.canApply, true, `a new pool is appliable (got ${v2.status})`);
      assert.ok(v2.status.startsWith('✓ 1 new'), `previewed as 1 new (got ${v2.status})`);
      await a.eval(`document.getElementById('portable-apply').click()`);
      await a.waitFor(`window.__diceDebug.groups.length === ${before + 1}`,
        { desc: 'Apply adds the pool' });
      const names = (await a.dbg('groups')).map((g) => g.name);
      assert.ok(names.includes('Doorbell'), `the imported pool landed (got ${names.join(',')})`);

      // Oversize refuses by name and size, and drops any plan it was holding
      // — a refusal must never leave a stale Apply armed.
      const big = await a.eval(
        `window.__diceDebug.portable.acceptFile(`
        + `new File([new Uint8Array(600 * 1024)], 'huge.yaml'))`);
      assert.equal(big.ok, false, 'an oversize file is refused');
      assert.equal(big.canApply, false, 'a refusal disarms Apply');
      assert.ok(big.status.includes('huge.yaml'), `the refusal names the file (got ${big.status})`);
      assert.equal(await a.eval(`document.getElementById('portable-apply').disabled`), true,
        'the Apply button is actually disabled after a refusal');

      // The real user path — a picked file — reaches the same place. Chrome
      // will not let a script set input.files except through DataTransfer.
      const picked = "pools:\n  Pools:\n    - 'Latchkey': '1d20'\n";
      await a.eval(`(() => {
        const dt = new DataTransfer();
        dt.items.add(new File([${JSON.stringify(picked)}], 'party.dice.yaml',
          { type: 'text/plain' }));
        const el = document.getElementById('portable-file');
        el.files = dt.files;
        el.dispatchEvent(new Event('change'));
      })()`);
      await a.waitFor(
        `document.getElementById('portable-text').value.includes('Latchkey')`,
        { desc: 'a picked file fills the textarea' });
      assert.equal(await a.eval(`document.getElementById('portable-file').value`), '',
        're-picking the same file must re-fire, so the input clears itself');
    },
  },
  {
    name: 'table-setup-wire',
    tags: ['prepared-seat', 'settings'],
    // ROADMAP §G4: the room setup key. Driven entirely over HTTP + raw SSE —
    // no client code in the path, which is the point: `setup` is furniture
    // any player may push (GOALS goal 10), and it must carry nothing
    // roll-shaped, because projectEntryFor is the ONLY egress a roll entry
    // ever takes (PROFILES.md §8).
    async fn(ctx) {
      const alice = await ctx.rawPlayer('Alice');
      assert.equal(alice.joinPayload.setup ?? null, null,
        'an unprepared room carries no setup — present-or-absent, so plain rooms stay byte-identical');
      await alice.waitForEvent('hello');
      const hello = alice.events().find((e) => e.type === 'hello');
      assert.equal(hello.data.setup ?? null, null, 'hello agrees there is no setup yet');

      // The organizer pushes: the table's look plus two prepared seats. '#'
      // is banned in player names at every entry point (it starts a comment
      // in roll notation) and a profile name BECOMES a display name, so the
      // server must clean it here exactly as it does at join.
      const push = await ctx.api('/api/table', {
        playerId: alice.playerId,
        rev: 2,
        table: { felt: 'crimson', tableName: 'Session 3' },
        profiles: [
          { name: 'Rill', pools: [{ name: 'Strength', notation: '3d6', category: 'Attributes' }] },
          { name: 'Bo#b', pools: [{ name: 'Larceny', notation: '1d20' }] },
        ],
      });
      assert.equal(push.status, 200, `push accepted (got ${push.status})`);
      assert.equal(push.data.applied, true, 'a fresh rev applies');
      assert.equal(push.data.rev, 2, 'the winning rev comes back');

      const evt = await alice.waitForEvent('table-setup');
      const names = evt.data.setup.profiles.map((p) => p.name);
      assert.deepEqual(names, ['Rill', 'Bob'], `'#' is stripped from a profile name (got ${names.join(',')})`);

      // A push carrying settings fires the SAME settings-changed every other
      // settings write fires — one validator, one echo, no parallel path.
      const settings = await alice.waitForEvent('settings-changed');
      assert.equal(settings.data.settings.felt, 'crimson', 'the felt actually moved');

      // Stale rev: a silent no-op, not a refusal. The loser of a two-tab race
      // (or of §G6's re-push-on-hello) did nothing wrong, and net.js toasts
      // every non-404 error at the player.
      const before = alice.events().filter((e) => e.type === 'table-setup').length;
      const stale = await ctx.api('/api/table', { playerId: alice.playerId, rev: 2, profiles: [] });
      assert.equal(stale.status, 200, 'a stale push is not an error');
      assert.equal(stale.data.applied, false, 'a stale push does not apply');
      assert.equal(stale.data.rev, 2, 'the winning rev comes back to the loser');
      const after = alice.events().filter((e) => e.type === 'table-setup').length;
      assert.equal(after, before, 'a stale push broadcasts nothing');

      // A later rev wins.
      const win = await ctx.api('/api/table', {
        playerId: alice.playerId, rev: 3,
        profiles: [{ name: 'Rill', pools: [{ name: 'Strength', notation: '4d6' }] }],
      });
      assert.equal(win.data.applied, true, 'a greater rev applies');

      // Someone arriving later finds the table prepared — this is the whole
      // point of the key existing at all.
      const bob = await ctx.rawPlayer('Bob');
      assert.ok(bob.joinPayload.setup, 'a late joiner’s snapshot carries the setup');
      assert.equal(bob.joinPayload.setup.rev, 3, 'and carries the winning rev');

      // Caps refuse at the door, with a machine-readable code.
      const many = Array.from({ length: 13 }, (_, i) => ({ name: `P${i}`, pools: [] }));
      const over = await ctx.api('/api/table', { playerId: alice.playerId, rev: 4, profiles: many });
      assert.equal(over.status, 400, 'a 13th profile is refused');
      assert.equal(over.data.code, 'bad_profiles', `refusal names itself (got ${JSON.stringify(over.data)})`);

      // Nothing roll-shaped may ride this key. Checked as bytes, not by
      // trusting the shape we think we stored.
      const blob = JSON.stringify(bob.joinPayload.setup);
      for (const leak of ['values', 'rollId', 'total', 'visibility']) {
        assert.equal(blob.includes(leak), false, `setup carries no '${leak}'`);
      }
    },
  },
  {
    name: 'room-linger',
    tags: ['prepared-seat'],
    // ROADMAP §G6: prep Tuesday, play Thursday. Before this, dropRoomIfEmpty
    // deleted the room the instant the last player left — so an organizer who
    // set the felt, named the table and built six seats lost all of it by
    // WALKING AWAY, not by any restart. That is the surprise this whole tier
    // exists to close, so it gets a real test rather than a unit-level one.
    //
    // Slow by nature (DISCONNECT_GRACE_MS is a hard 5s), hence not in smoke.
    // The waits poll the server's own log rather than sleeping on a guess —
    // a room lingering or expiring has no wire surface, because by definition
    // nobody is connected to be told.
    async fn(ctx) {
      const room = ctx.room;
      const alice = await ctx.rawPlayer('Alice');
      await ctx.api('/api/table', {
        playerId: alice.playerId,
        rev: 2,
        table: { felt: 'plum' },
        profiles: [{ name: 'Rill', pools: [{ name: 'Strength', notation: '3d6' }] }],
      });
      // Something in the log, so we can prove the per-session half is cleared
      // while the per-preparation half survives.
      await ctx.api('/api/roll', { playerId: alice.playerId, notation: '2d6' });
      alice.close();

      await ctx.waitForLog(new RegExp(`room lingering: room="${room}"`),
        { desc: 'the room lingers instead of being deleted', timeout: 20000 });

      // Thursday. The table is still prepared.
      const bob = await ctx.rawPlayer('Bob');
      assert.ok(bob.joinPayload.setup, 'the setup survived the last player leaving');
      assert.equal(bob.joinPayload.setup.rev, 2, 'at the rev it was pushed');
      assert.equal(bob.joinPayload.settings.felt, 'plum',
        'the felt the organizer chose survived too — settings are preparation, not session');
      assert.deepEqual(bob.joinPayload.log, [],
        'but the roll log did NOT — a resumed room is a clean table');
      assert.deepEqual(bob.joinPayload.offers, [], 'offers are session state too');
      await ctx.waitForLog(new RegExp(`room resumed: room="${room}"`),
        { desc: 'the linger timer is cancelled by the join' });

      // Nobody comes back this time: the TTL runs out and the room really goes.
      bob.close();
      await ctx.waitForLog(new RegExp(`room expired: room="${room}"`),
        { desc: 'the room expires once the TTL passes with no one there', timeout: 30000 });

      const cara = await ctx.rawPlayer('Cara');
      assert.equal(cara.joinPayload.setup ?? null, null, 'an expired room keeps nothing');
      assert.equal(cara.joinPayload.settings.felt, 'obsidian',
        'and comes back at the defaults, not the old table dressed as new');
    },
  },
  {
    name: 'profile-swap',
    tags: ['table-file', 'groups'],
    // ROADMAP §G3, the MVP: an organizer builds someone else's character by
    // loading it into their OWN rack, so the ledger and the spectrum bars
    // (§2l) read it unmodified. Everything worth testing here is a
    // guardrail — the swap puts another person's pools where yours live, so
    // each assertion below is one way that could have gone wrong.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const watcher = await ctx.rawPlayer('Watcher');

      const mineBefore = (await a.dbg('groups')).map((g) => g.name).sort();
      assert.ok(mineBefore.length, 'the operator starts with a rack of their own');

      const file = [
        'table:',
        "  name: 'Session 3'",
        "  felt: 'plum'",
        'players:',
        "  'Rill':",
        '    pools:',
        '      Attributes:',
        "        - 'Strength': '3d6'",
        "        - 'Agility': '2d8'",
        "  'Wren':",
        '    pools:',
        '      Skills:',
        "        - 'Larceny': '1d20'",
        'pools:',
        '  Pools:',
        "    - 'Doorbell': '2d6'",
        '',
      ].join('\n');
      const v = await a.dbg(`portable.loadText(${JSON.stringify(file)})`);
      assert.equal(v.ok, true, `the table file parses (got ${v.status})`);
      assert.deepEqual(await a.dbg('portable.profiles()'), ['Rill', 'Wren'],
        'both prepared seats are offered');

      // The swap. Yours goes to the stash; theirs takes the rack.
      const ed = await a.dbg(`portable.editProfile('Rill')`);
      assert.equal(ed.ok, true, `editing starts (got ${ed.status})`);
      assert.equal(await a.dbg('portable.editingProfile'), 'Rill', 'the banner has a name to show');
      const onRack = (await a.dbg('groups')).map((g) => g.name).sort();
      assert.deepEqual(onRack, ['Agility', 'Strength'], "Rill's pools are on the rack");
      const stashed = await a.eval(
        `JSON.parse(localStorage.getItem('dice.groups.mine.v1') || 'null').map((g) => g.name).sort()`);
      assert.deepEqual(stashed, mineBefore, 'and yours is stashed, intact, before anything moved');

      // GUARDRAIL 3: publishing is "here is MY rack". While a profile is
      // loaded it must go silent, or every teammate's owner switcher would
      // show Rill's pools under Alice's name.
      const seen = watcher.events().filter((e) => e.type === 'pools-changed');
      const leaked = seen.some((e) => JSON.stringify(e.data.pools).includes('Agility'));
      assert.equal(leaked, false, "no teammate is told Alice's rack became Rill's");

      // Editing the loaded profile and saving writes the TEXT, not the disk,
      // and must not disturb the rest of the file.
      const gid = (await a.dbg('groups')).find((g) => g.name === 'Strength').id;
      await a.dbg(`editPool(${JSON.stringify(gid)}, {notation: '5d6'})`);
      const saved = await a.dbg(`portable.saveToProfile('Rill')`);
      assert.equal(saved.ok, true, `save writes back (got ${saved.status})`);
      assert.ok(saved.text.includes('5d6'), 'the edit reached the text');
      assert.ok(saved.text.includes('Wren'), 'the OTHER profile survived the rewrite');
      assert.ok(saved.text.includes('Larceny'), "and so did that profile's pools");
      assert.ok(saved.text.includes('Session 3'), 'the table: section survived');
      assert.ok(saved.text.includes('Doorbell'), 'the top-level rack in the file survived');

      // The exit puts you back. This is the one that matters: if it ever
      // fails, the operator has lost their own pools to a click.
      const done = await a.dbg('portable.doneEditing()');
      assert.equal(done.ok, true, `Done succeeds (got ${done.status})`);
      assert.equal(await a.dbg('portable.editingProfile'), null, 'editing is over');
      assert.deepEqual((await a.dbg('groups')).map((g) => g.name).sort(), mineBefore,
        'your own rack is back, exactly as it was');
      assert.equal(await a.eval(`localStorage.getItem('dice.groups.mine.v1')`), null,
        'and the stash is spent, so the next boot has nothing to undo');
    },
  },
  {
    name: 'profile-swap-reload',
    tags: ['table-file', 'groups'],
    // ROADMAP §G3 guardrail 4, split out because it needs its own tab: the
    // banner and the file text do NOT survive a reload, so booting with a
    // profile still in dice.groups.v1 would be someone else's rack under your
    // name with nothing on screen saying so — the `#g=` codec's exact failure
    // (GOALS §7). The boot guard restores yours instead.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.2', name: 'Solo' });
      const mineBefore = (await a.dbg('groups')).map((g) => g.name).sort();
      const file = [
        'players:',
        "  'Rill':",
        '    pools:',
        '      Attributes:',
        "        - 'Strength': '3d6'",
        '',
      ].join('\n');
      await a.dbg(`portable.loadText(${JSON.stringify(file)})`);
      await a.dbg(`portable.editProfile('Rill')`);
      assert.deepEqual((await a.dbg('groups')).map((g) => g.name), ['Strength'],
        'mid-edit: the profile is on the rack');

      await a.reload();

      assert.equal(await a.dbg('portable.editingProfile'), null,
        'a reload does not resurrect the editing state');
      assert.deepEqual((await a.dbg('groups')).map((g) => g.name).sort(), mineBefore,
        'the boot guard restored your own rack');
      assert.equal(await a.eval(`localStorage.getItem('dice.groups.mine.v1')`), null,
        'and cleared the stash, so a later boot cannot undo you twice');
    },
  },
  {
    name: 'prepared-seat',
    tags: ['prepared-seat', 'chrome'],
    // ROADMAP §G5 — CUJ2, the whole point of the tier: one link in Discord,
    // and a player lands at the right table under their own name with their
    // own pools. The seat is OFFERED, never imposed: GOALS §7 records that
    // the `#g=` codec was deleted for replacing a visitor's rack sight-unseen,
    // so the assertion that matters most is that nothing lands until a click.
    async fn(ctx) {
      const organizer = await ctx.rawPlayer('Organizer');
      await ctx.api('/api/table', {
        playerId: organizer.playerId,
        rev: 1,
        table: { tableName: 'Session 3' },
        profiles: [
          { name: 'Alice', pools: [
            { name: 'Strength', notation: '3d6', category: 'Attributes' },
            { name: 'Larceny', notation: '1d20', category: 'Skills' },
          ] },
          { name: 'Rill', pools: [{ name: 'Agility', notation: '2d8' }] },
        ],
      });

      // The pre-join peek: no roster, no log, no notations, no rev.
      const peek = await fetch(
        `http://127.0.0.1:${ctx.port}/api/table?room=${encodeURIComponent(ctx.room)}`,
      ).then((r) => r.json());
      assert.equal(peek.name, 'Session 3', 'the peek names the table (ROADMAP §2k)');
      assert.deepEqual(peek.seats.map((s) => s.name), ['Alice', 'Rill'], 'and lists the seats');
      assert.equal(peek.seats[0].pools, 2, 'with a pool count to show');
      const peekBlob = JSON.stringify(peek);
      for (const leak of ['3d6', 'playerId', 'rev', 'log', 'felt']) {
        assert.equal(peekBlob.includes(leak), false, `the peek leaks no '${leak}'`);
      }

      // A player opens the link. `as=` is case-insensitive and pre-selects
      // only — it must never auto-join and never auto-apply.
      const p = await ctx.newTable({ origin: 'localhost', anon: true, query: '&as=alice' });
      await p.waitFor(`window.__diceDebug.seatPicker.seats.length === 2`,
        { desc: 'the seats reach the modal' });
      const picker = await p.dbg('seatPicker');
      assert.equal(picker.open, true, 'the modal is up');
      assert.equal(picker.preselect, 'Alice', '&as= pre-selects, case-insensitively');
      assert.equal(picker.chosen, null, 'but nothing is chosen for the player');
      // The two phase panes are exclusive ON SCREEN, not just in state. This
      // asserts computed display because there is no global `.hidden` utility
      // in the stylesheet — a bare class="hidden" styles nothing, and the
      // first cut of this modal showed Apply/Not now under the seat list
      // while you were still choosing. State was correct throughout, so only
      // a visibility assertion can catch it.
      const shown = (id) => `getComputedStyle(document.getElementById('${id}')).display`;
      assert.equal(await p.eval(shown('seat-preview')), 'none',
        'the preview pane is not on screen while choosing a seat');
      assert.notEqual(await p.eval(shown('seat-pick')), 'none', 'the seat list is');

      const groupsBefore = (await p.dbg('groups')).map((g) => g.name).sort();
      await p.dbg(`chooseSeat('Alice')`);
      await p.waitOnline();
      assert.deepEqual((await p.dbg('groups')).map((g) => g.name).sort(), groupsBefore,
        'taking the seat joins but applies NOTHING — the preview is the gate');

      const v = await p.waitFor(`window.__diceDebug.seatPicker.verdict.canApply === true`,
        { desc: 'the import previews' }) && await p.dbg('seatPicker.verdict');
      assert.ok(/^✓ /.test(v.status), `preview uses the shared verdict grammar (got ${v.status})`);
      assert.equal(await p.eval(shown('seat-pick')), 'none',
        'and the seat list steps aside once the preview is up');
      assert.notEqual(await p.eval(shown('seat-preview')), 'none', 'the preview pane is');

      await p.dbg('applySeatImport()');
      await p.waitFor(`window.__diceDebug.groups.some((g) => g.name === 'Larceny')`,
        { desc: 'the explicit apply lands the pools' });
      const after = (await p.dbg('groups')).map((g) => g.name);
      assert.ok(after.includes('Strength') && after.includes('Larceny'), "Alice's pools arrived");
      for (const had of groupsBefore) {
        assert.ok(after.includes(had), `the player's own pool '${had}' was not deleted`);
      }
      assert.equal(await p.eval(`localStorage.getItem('dice.name.v1')`), 'Alice',
        'and the seat named them');
    },
  },
  {
    name: 'prepared-seat-declined',
    tags: ['prepared-seat'],
    // The other half of "offered, never imposed": declining must be a real
    // option that costs nothing. Also covers the two stale-link degradations
    // — an `as=` naming no profile, and a room with no setup at all — because
    // a link that outlives its table must still let people in.
    async fn(ctx) {
      const organizer = await ctx.rawPlayer('Organizer');
      await ctx.api('/api/table', {
        playerId: organizer.playerId,
        rev: 1,
        profiles: [{ name: 'Alice', pools: [{ name: 'Strength', notation: '3d6' }] }],
      });

      const p = await ctx.newTable({ origin: '127.0.0.3', anon: true, query: '&as=Nobody' });
      await p.waitFor(`window.__diceDebug.seatPicker.seats.length === 1`,
        { desc: 'the seat reaches the modal' });
      assert.equal((await p.dbg('seatPicker')).preselect, null,
        'an `as=` naming no profile is ignored silently — a stale link must not break the join');

      const before = (await p.dbg('groups')).map((g) => g.name).sort();
      await p.dbg(`chooseSeat('Alice')`);
      await p.waitOnline();
      await p.waitFor(`window.__diceDebug.seatPicker.verdict.canApply === true`,
        { desc: 'the import previews' });
      await p.dbg('dismissSeatImport()');
      assert.deepEqual((await p.dbg('groups')).map((g) => g.name).sort(), before,
        'declining changes nothing at all');
      assert.equal(await p.eval(`localStorage.getItem('dice.name.v1')`), 'Alice',
        'but the seat still named them — the name and the pools are separate decisions');
    },
  },
  {
    name: 'setup-repush',
    tags: ['prepared-seat', 'table-file'],
    // ROADMAP §G6 client half: the organizer's browser is the durable copy,
    // so a room that loses its setup heals as soon as an authoring tab
    // reconnects. The counterpart assertion is the one that keeps this safe —
    // a player who merely JOINED a prepared table must never start re-pushing
    // a setup they did not author.
    async fn(ctx) {
      const org = await ctx.newTable({ origin: 'localhost', name: 'Organizer' });
      const file = [
        'table:',
        "  felt: 'plum'",
        'players:',
        "  'Alice':",
        '    pools:',
        '      Attributes:',
        "        - 'Strength': '3d6'",
        '',
      ].join('\n');
      await org.dbg(`portable.loadText(${JSON.stringify(file)})`);
      const pushed = await org.dbg('portable.pushToTable()');
      assert.equal(pushed.ok, true, `the organizer pushes the table (got ${pushed.status})`);
      await org.waitFor(`window.__diceDebug.tableRev.room >= 1`, { desc: 'the room takes it' });
      const rev = await org.dbg('tableRev');
      assert.equal(rev.stored, rev.room, 'this browser is on record as the author');

      assert.equal(await org.dbg('repushTable()'), false,
        'and stands down while the room is already current — a heal is not a heartbeat');

      // A plain joiner is NOT an author. This is the assertion that keeps the
      // re-push safe: without it, every player who ever joined a prepared
      // table would start pushing a setup back at it.
      const guest = await ctx.newTable({ origin: '127.0.0.1', name: 'Guest' });
      assert.equal((await guest.dbg('tableRev')).stored, 0, 'a joiner holds no authorship record');
      assert.equal(await guest.dbg('repushTable()'), false,
        'and can never re-push a setup it did not author');

      // Now really lose it: everyone leaves, the room lingers, the TTL runs
      // out and it is deleted. This is the actual failure §G6 exists for —
      // a restart looks the same from the client's side.
      await guest.close();
      await org.close();
      await ctx.waitForLog(new RegExp(`room expired: room="${ctx.room}"`),
        { desc: 'the room and its setup are gone', timeout: 30000 });

      // The organizer comes back. Same origin, so the same localStorage still
      // holds the authorship record — and hello finds a room with no setup.
      const org2 = await ctx.newTable({ origin: 'localhost', name: 'Organizer' });
      assert.equal((await org2.dbg('tableRev')).stored, 1, 'the browser still remembers what it pushed');
      await org2.waitFor(`window.__diceDebug.tableRev.room >= 1`,
        { desc: 'reconnecting heals the room unprompted' });
      const peek = await fetch(
        `http://127.0.0.1:${ctx.port}/api/table?room=${encodeURIComponent(ctx.room)}`,
      ).then((r) => r.json());
      assert.deepEqual((peek.seats || []).map((s) => s.name), ['Alice'],
        'the seats are back for anyone arriving now');
      assert.equal((await org2.dbg('felt')).id, 'plum',
        "and so is the felt the organizer chose — the heal carries the table, not just the seats");
    },
  },

  // ---------------------------------------------------------------------
  // The lobby → table flow (ROADMAP §3b, UX §7.20) — tag: lobby
  // ---------------------------------------------------------------------
  {
    name: 'lobby-no-prompt',
    tags: ['smoke', 'lobby'],
    // §3b L0 — CUJ1: "I just need to do a dice roll NOW". The bare url is the
    // LOBBY: no join, no name prompt, no server call at all. The old front
    // door seated every stranger on one shared room named 'table', behind a
    // 'Take a seat' modal with no cancel path. The lobby answers by REMOVING
    // the prompt, not by adding a welcome — so the assertion is absence: no
    // modal, not one /api call (join, peek, or stream), and the first roll
    // just works, on this device, addressed to nobody.
    async fn(ctx) {
      const a = await lobbyTab(ctx, {
        origin: '127.0.0.10',
        clean: ['dice.name.v1', 'dice.tables.v1', 'dice.roomsettings.v1'],
      });

      assert.equal(await a.eval(`document.getElementById('name-modal').classList.contains('hidden')`),
        true, 'no "Take a seat" modal — the prompt moved to entering a table');
      assert.equal((await a.dbg('seatPicker')).open, false, 'the seat picker agrees');
      assert.deepEqual(await a.eval('window.__apiCalls'), [],
        'not one API call: no /api/join, no /api/table peek, no /api/events stream');

      const id = await a.dbg('identity');
      assert.equal(id.lobby, true, 'the app knows this is the lobby');
      assert.equal(id.room, null, 'no room');
      assert.equal(id.online, false, 'no server session');
      assert.equal(await a.eval(`document.getElementById('identity-name').textContent`), 'You',
        'the chip reads the honest word, not a join placeholder');

      // CUJ1 itself: the dice are live right now.
      await a.roll('2d6');
      assert.equal(await a.diceCount(), 2, 'two dice on the felt');
      const st = await a.entryState();
      assert.ok(st && typeof st.total === 'number' && st.total >= 2 && st.total <= 12,
        `the roll resolved locally (got ${JSON.stringify(st && st.total)})`);
      assert.deepEqual(await a.eval('window.__apiCalls'), [],
        'and the roll stayed on this device — still zero API traffic');
      assert.equal(await a.eval(`document.getElementById('name-modal').classList.contains('hidden')`),
        true, 'and still no prompt after rolling');
    },
  },
  {
    name: 'lobby-exits',
    tags: ['lobby', 'chrome'],
    // §7.20 state L: the presence row carries the lobby's exits — and only as
    // many as are real. '+ New table' always; 'Tables ▾' only once this
    // browser has a table to go back to, so a first-ever visitor sees exactly
    // one affordance and no dead control. Forgetting the last recent retires
    // the menu pill on the spot (every ghost is retired by its own success).
    async fn(ctx) {
      // A virgin browser: recents cleaned off this origin.
      const virgin = await lobbyTab(ctx, {
        origin: '127.0.0.11',
        clean: ['dice.name.v1', 'dice.tables.v1'],
      });
      let row = await virgin.dbg('presenceRow');
      assert.deepEqual(row.ghosts.map((g) => g.label), ['+ New table'],
        `one affordance and no dead control (got: ${JSON.stringify(row.ghosts)})`);
      assert.deepEqual(row.pills, [], 'and no roster — there is no table');

      // A browser that has been somewhere: the recents pill appears.
      const back = await lobbyTab(ctx, {
        origin: '127.0.0.12',
        clean: ['dice.name.v1'],
        seed: { 'dice.tables.v1': JSON.stringify([{ room: 'old-haunt-k3x9', name: 'Old Haunt', at: 1754500000000 }]) },
      });
      row = await back.dbg('presenceRow');
      assert.deepEqual(row.ghosts.map((g) => g.label), ['+ New table', 'Tables ▾'],
        'both exits once there is somewhere to go back to');

      // The menu lists the table by NAME, with a forget — and forgetting the
      // last recent retires the Tables pill itself.
      await back.eval(`[...document.querySelectorAll('#rail-roster .rail-ghost')]
        .find((b) => b.textContent.includes('Tables')).click()`);
      await back.waitFor(`!!document.querySelector('.rail-menu')`, { desc: 'the Tables menu opens' });
      assert.deepEqual(
        await back.eval(`[...document.querySelectorAll('.rail-menu .idm-item')].map((b) => b.textContent)`),
        ['Old Haunt'], 'the row wears the table name, not the key');
      await back.eval(`document.querySelector('.rail-menu .rail-menu-forget').click()`);
      await back.waitFor(`!document.querySelector('.rail-menu')`, { desc: 'the menu closes on forget' });
      row = await back.dbg('presenceRow');
      assert.deepEqual(row.ghosts.map((g) => g.label), ['+ New table'],
        'the pill leaves with the last remembered table');
      assert.equal(JSON.parse(await back.eval(`localStorage.getItem('dice.tables.v1')`)).length, 0,
        'and the store agrees');
    },
  },
  {
    name: 'lobby-no-phantom-table',
    tags: ['lobby', 'settings'],
    // §7.20's phantom name, pinned as a regression. tableName is ROOM state,
    // but it used to survive LS_ROOMSETTINGS (the solo settings copy) into a
    // roomless page — the nameplate, the TAB TITLE, and the export filename
    // all wore the name of whatever table this browser configured last. The
    // lobby must clear the table identity, not merely decline to draw it —
    // while felt/system/zoom (yours, not the room's) still restore from the
    // very same record.
    async fn(ctx) {
      const a = await lobbyTab(ctx, {
        origin: '127.0.0.13',
        clean: ['dice.name.v1', 'dice.tables.v1'],
        seed: { 'dice.roomsettings.v1': JSON.stringify({ felt: 'plum', tableName: 'Haunted Manor' }) },
      });

      assert.equal((await a.dbg('settings')).tableName, '',
        'the inherited tableName is cleared, not just hidden');
      assert.equal(await a.eval(`document.getElementById('table-name').classList.contains('hidden')`),
        true, 'no nameplate');
      assert.equal(await a.eval(`document.getElementById('table-name').textContent`), '',
        'and nothing staged inside it');
      assert.equal(await a.eval('document.title'), 'Dice Table',
        'the tab title is plain — no phantom table');
      const filename = await a.dbg('portable.filename()');
      assert.ok(filename.startsWith('dice-table-'),
        `a roomless export is 'dice-table', never last week's table (got: ${filename})`);

      // The same stored record's PERSONAL half still lands: your felt is yours.
      assert.equal((await a.dbg('felt')).id, 'plum',
        'felt is restored from the same record the name was dropped from');
    },
  },
  {
    name: 'lobby-suppresses-table-surfaces',
    tags: ['lobby', 'settings', 'chrome'],
    // §7.20's governing rule: a surface that speaks about YOU keeps working;
    // a surface that speaks about THE TABLE is ABSENT — never disabled, never
    // silently downgraded to local. identityInfo answers room:null (the
    // prerequisite for every line here), inviteUrl refuses to fabricate a
    // link, the identity menu drops its three table verbs, and Settings drops
    // the "Everyone at the table" section and Apply to table.
    async fn(ctx) {
      const a = await lobbyTab(ctx, { origin: '127.0.0.14', clean: ['dice.name.v1'] });

      const id = await a.dbg('identity');
      assert.equal(id.room, null, 'identity carries no room — not the old unconditional ROOM');
      assert.equal(id.lobby, true, 'lobby is its own state, not a failed join');
      assert.equal(id.inviteUrl, null,
        'inviteUrl is null — never a fabricated link to a room named table');
      assert.equal(await a.dbg(`seatInviteUrl('Anyone')`), null, 'and the per-seat form is null with it');

      // The identity menu, opened the real way (right-click on the chip).
      await a.eval(`document.getElementById('identity-chip').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
      assert.equal(await a.eval(`!document.getElementById('identity-menu').classList.contains('hidden')`),
        true, 'the menu opens — it still speaks about YOU');
      const shown = (idName) => `getComputedStyle(document.getElementById('${idName}')).display`;
      assert.equal(await a.eval(shown('idm-invite')), 'none', 'Copy invite link is absent');
      assert.equal(await a.eval(shown('idm-leave')), 'none', 'Change seat is absent');
      assert.equal(await a.eval(shown('idm-lobby')), 'none', 'Leave table is absent');
      assert.notEqual(await a.eval(shown('idm-rename')), 'none',
        "rename stays — the name is yours, not the table's");
      assert.equal(await a.eval(`document.getElementById('idm-room').textContent`),
        'not at a table — your rolls stay on this device',
        'the room line becomes the privacy read');
      await a.eval(`document.getElementById('identity-chip').click()`); // close it again

      // Settings: the room section, and its one intruder in Your data.
      await a.dbg('openSettings()');
      // The heading is RELABELLED, not hidden (UX §7.20, amended during the
      // build): hiding it left felt/system/zoom in a heading-less block that
      // reads as part of the section above — "Your data". What must never
      // survive is the AUDIENCE CLAIM, so that is what this asserts.
      const roomLabel = await a.eval(`document.getElementById('set-room-label').textContent`);
      assert.equal(roomLabel, 'This table',
        'the room heading stops claiming an audience it does not have');
      assert.notEqual(await a.eval(shown('set-room-label')), 'none',
        'but it still stands, or the controls below it read as "Your data"');
      assert.equal(await a.eval(shown('set-table-name-row')), 'none', 'the Table name row is gone');
      assert.equal(await a.eval(shown('portable-push')), 'none', 'Apply to table is gone');
      assert.notEqual(await a.eval(shown('felt-swatches')), 'none', 'felt (yours) is still offered');
      assert.notEqual(await a.eval(shown('system-picker')), 'none', 'system (yours) is still offered');
    },
  },
  {
    name: 'new-table',
    tags: ['lobby'],
    // §3b L1: name it, land in it. The key is MINTED, never the typed name —
    // no access control by design (goal 10), so ?room=<the name> would be a
    // door anyone can guess. The typed name travels as the TABLE NAME via the
    // read-once sessionStorage hand-off, lands on the room for everyone, and
    // the new table is recorded in this browser's recents.
    async fn(ctx) {
      const a = await lobbyTab(ctx, {
        origin: '127.0.0.15',
        clean: ['dice.tables.v1'],
        seed: { 'dice.name.v1': 'Alice' },
      });

      const search = await createTableFromLobby(a, 'The Tavern');
      const key = decodeURIComponent(search.replace('?room=', ''));
      assert.notEqual(key, 'The Tavern', 'the key is not the typed name');
      assert.match(key, /^the-tavern-[a-z0-9]{16}$/,
        `a readable slug + 16 random base36 chars — the random tail IS the door (got: ${key})`);

      // The typed name became the room's name — server-side truth, not just
      // this client's rendering (the peek is the unauthenticated read).
      await a.waitFor(`window.__diceDebug.settings.tableName === 'The Tavern'`,
        { desc: 'the table name lands on the room' });
      const peek = await fetch(
        `http://127.0.0.1:${ctx.port}/api/table?room=${encodeURIComponent(key)}`,
      ).then((r) => r.json());
      assert.equal(peek.name, 'The Tavern', 'the room itself carries the name');

      assert.equal(await a.eval(`sessionStorage.getItem('dice.newtable.v1:' + ${JSON.stringify(key)})`),
        null, 'the pending name was consumed by the join — read-and-clear');

      const recents = JSON.parse(await a.eval(`localStorage.getItem('dice.tables.v1')`));
      assert.equal(recents[0].room, key, 'the new table is the newest recent');
      assert.equal(recents[0].name, 'The Tavern', 'remembered under its name');
    },
  },
  {
    name: 'invite-chair',
    tags: ['lobby', 'chrome'],
    // §7.20 state A — the empty table, CUJ2's waiting room. The roster row's
    // empty state is an AFFORDANCE, not a sentence: one dashed pill wearing
    // the verb (Invite) in the slot where the people will appear — and it is
    // REPLACED by the very person it asks for.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      let row = await a.dbg('presenceRow');
      assert.deepEqual(row.ghosts.map((g) => ({ label: g.label, dot: g.dot })),
        [{ label: 'Invite', dot: false }],
        `one Invite pill, no dot — a chair for anyone (got: ${JSON.stringify(row.ghosts)})`);
      assert.deepEqual(row.pills, [], 'and nobody on the roster yet');
      assert.ok((await a.dbg('identity')).inviteUrl.includes(`room=${ctx.room}`),
        "what it copies is this room's real link");

      await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.waitFor(`window.__diceDebug.players.length === 2`, { desc: 'Bob arrives' });
      row = await a.dbg('presenceRow');
      assert.deepEqual(row.ghosts, [], 'the affordance retired by its own success');
      assert.deepEqual(row.pills, ['Bob'], 'replaced by the person it asked for');
    },
  },
  {
    name: 'prepared-seat-chairs',
    tags: ['lobby', 'prepared-seat', 'chrome'],
    // §7.20: a prepared table shows its EMPTY CHAIRS — for as long as they
    // are empty, not only while you are alone. Unclaimed seats are
    // roomSetup.profiles minus the live roster (a client-side difference —
    // no endpoint, no wire key); each chair wears its seat's name and copies
    // that seat's &as= link. Chairs retire PER CHAIR as each seat is claimed
    // ("the outlines fill in one by one" — the row is a live read of who is
    // still missing), and a claimed seat's chair is gone from the start.
    async fn(ctx) {
      const org = await ctx.rawPlayer('Organizer');
      await ctx.api('/api/table', {
        playerId: org.playerId,
        rev: 1,
        table: { tableName: 'Chairs' },
        profiles: [
          { name: 'Alice', pools: [{ name: 'Strength', notation: '3d6' }] },
          { name: 'Rill', pools: [{ name: 'Agility', notation: '2d8' }] },
          { name: 'Bo', pools: [{ name: 'Bravery', notation: '1d20' }] },
        ],
      });

      // Alice sits down in HER prepared seat by name. The chairs stand
      // ALONGSIDE the organizer's pill — the first arrival must not take the
      // other chairs off the wall — and Alice's own chair is GONE: she
      // claimed it by sitting down.
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      let row = await a.dbg('presenceRow');
      assert.deepEqual(row.pills, ['Organizer'], 'the roster shows who IS here');
      assert.deepEqual(row.ghosts.map((g) => ({ label: g.label, dot: g.dot })),
        [{ label: 'Rill', dot: true }, { label: 'Bo', dot: true }],
        `a chair per unclaimed seat, none for the claimed one (got: ${JSON.stringify(row.ghosts)})`);
      assert.ok(row.ghosts.every((g) => g.title.includes('link')),
        'a chair says what it does — it copies a link');

      // Each chair copies a PERSONALIZED link: this room's url + &as=<seat>,
      // the §G5 pre-select — "Rill, this is your seat".
      const link = await a.dbg(`seatInviteUrl('Rill')`);
      assert.ok(link.includes(`?room=${encodeURIComponent(ctx.room)}`),
        `the seat link addresses this room (got: ${link})`);
      assert.ok(link.endsWith('&as=Rill'), `and carries the seat's &as= (got: ${link})`);

      // Rill arrives: HER chair is retired by its own success; Bo's stays —
      // the outlines fill in one by one.
      await ctx.newTable({ origin: '127.0.0.1', name: 'Rill' });
      await a.waitFor(`window.__diceDebug.players.length === 3`, { desc: 'Rill sits down' });
      row = await a.dbg('presenceRow');
      assert.deepEqual(row.pills, ['Organizer', 'Rill'], 'the seat filled in with its person');
      assert.deepEqual(row.ghosts.map((g) => g.label), ['Bo'],
        `only the still-empty chair remains (got: ${JSON.stringify(row.ghosts)})`);

      // And the chairs are presence-driven both ways: the organizer leaving
      // changes the PILLS, never the chairs — Bo is still missing.
      await ctx.api('/api/leave', { playerId: org.playerId, immediate: true });
      org.close();
      await a.waitFor(`window.__diceDebug.players.length === 2`, { desc: 'the organizer leaves' });
      row = await a.dbg('presenceRow');
      assert.deepEqual(row.pills, ['Rill'], 'the roster follows the departure');
      assert.deepEqual(row.ghosts.map((g) => g.label), ['Bo'], "and Bo's chair still stands");
    },
  },
  {
    name: 'leave-to-lobby',
    tags: ['lobby', 'seat'],
    // §3b L3's real verb, and the regression it exists to guard: Leave table
    // must NOT reuse leaveTable() — that function drops the seat AND deletes
    // dice.name.v1 (it re-prompts 'Take a seat'), so wiring the new verb to
    // it would silently wipe the player's display name on the way out.
    // Leaving a table for the lobby drops the SEAT and keeps the NAME. The
    // departure is also said out loud (GOALS): the other tab sees the seat go
    // promptly, not on a liveness timeout.
    async fn(ctx) {
      // tableTab, not newTable: its seeding is one-shot, and leaveToLobby
      // NAVIGATES — a per-document re-seed of dice.name.v1 on the lobby
      // document would mask exactly the deletion this scenario watches for.
      const a = await tableTab(ctx, { origin: 'localhost', seed: { 'dice.name.v1': 'Alice' } });
      await a.waitOnline();
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await b.waitFor(`window.__diceDebug.players.length === 2`, { desc: 'both seated' });

      // Open the identity menu for real; at a table the verb is offered.
      await a.eval(`document.getElementById('identity-chip').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
      assert.notEqual(await a.eval(`getComputedStyle(document.getElementById('idm-lobby')).display`),
        'none', 'Leave table is offered at a table');
      try {
        await a.eval(`document.getElementById('idm-lobby').click()`);
      } catch { /* the context can die inside the click — that IS the leave */ }

      await landedInLobby(a);
      assert.equal(await a.eval(`localStorage.getItem('dice.name.v1')`), 'Alice',
        "the display name SURVIVES leaving — the seat was the table's, the name is yours");
      assert.equal(await a.eval(`sessionStorage.getItem(${JSON.stringify(`dice.seat.v1:${ctx.room}`)})`),
        null, 'the seat is forgotten — a later visit is a fresh sit-down');
      const id = await a.dbg('identity');
      assert.equal(id.lobby, true, 'landed in the lobby');
      assert.equal(id.room, null, 'on the bare url');
      assert.equal(id.name, 'Alice', 'and the chip still knows you');

      // The lobby row has both exits: the table just left is a recent.
      const row = await a.dbg('presenceRow');
      assert.deepEqual(row.ghosts.map((g) => g.label), ['+ New table', 'Tables ▾'],
        'the table you just left is reachable again through Tables ▾');

      // Departure was said out loud: B's roster empties without waiting out
      // a liveness clock (generous bound — the claim is seconds, not an hour).
      await b.waitFor(`window.__diceDebug.players.length === 1`,
        { desc: 'the departure reaches the other tab', timeout: 20000 });
    },
  },
  {
    name: 'table-name-survives-round-trip',
    tags: ['lobby'],
    // §3b L3 + initNet's name restoration: an UNPREPARED room is deleted the
    // moment its last player leaves, so "leave, come back via recents" lands
    // in a brand-new room that merely shares a key — and the name would be
    // gone while your Tables list still shows it. The remembered entry heals
    // the room on arrival (the same organizer's-browser-is-the-durable-copy
    // principle §G6 established for setups).
    async fn(ctx) {
      const a = await lobbyTab(ctx, {
        origin: '127.0.0.16',
        clean: ['dice.tables.v1'],
        seed: { 'dice.name.v1': 'Alice' },
      });
      const search = await createTableFromLobby(a, 'Round Trip');
      const key = decodeURIComponent(search.replace('?room=', ''));
      await a.waitFor(`window.__diceDebug.settings.tableName === 'Round Trip'`,
        { desc: 'the name lands on the room' });

      // Leave. The room is unprepared, so the server deletes it outright —
      // the recents entry is now the only copy of the name anywhere.
      try {
        await a.eval(`document.getElementById('idm-lobby').click()`);
      } catch { /* navigation */ }
      await landedInLobby(a);
      await ctx.waitForLog(new RegExp(`room deleted: room="${key}"`),
        { desc: 'the empty unprepared room evaporates' });

      // Back through the recents menu — the row still wears the name.
      await a.eval(`[...document.querySelectorAll('#rail-roster .rail-ghost')]
        .find((b) => b.textContent.includes('Tables')).click()`);
      await a.waitFor(`!!document.querySelector('.rail-menu')`, { desc: 'the Tables menu opens' });
      try {
        await a.eval(`[...document.querySelectorAll('.rail-menu .idm-item')]
          .find((b) => b.textContent === 'Round Trip').click()`);
      } catch { /* navigation */ }
      const back = await landedAtTable(a);
      assert.equal(decodeURIComponent(back.replace('?room=', '')), key,
        'the recents row returns to the SAME key');

      // A brand-new room under the old key — and the name came back with you.
      await a.waitFor(`window.__diceDebug.settings.tableName === 'Round Trip'`,
        { desc: 'the remembered name heals the fresh room' });
      const peek = await fetch(
        `http://127.0.0.1:${ctx.port}/api/table?room=${encodeURIComponent(key)}`,
      ).then((r) => r.json());
      assert.equal(peek.name, 'Round Trip', 'server-side too, for the next arrival');
    },
  },
];
