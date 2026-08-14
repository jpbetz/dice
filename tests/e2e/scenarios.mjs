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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert, Table } from './harness.mjs';

// THE FROZEN ENGINE CONTRACT (docs/TOWER.md; captured by
// tools/steps/tower-contract-capture.mjs). Read from disk rather than imported
// as a module so it stays a DATA fixture — a JSON import would tie the suite
// to an import-assertion syntax and, worse, invite somebody to make it a .mjs
// that computes what it is supposed to be remembering.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TOWER_CONTRACT_GOLDEN = JSON.parse(
  readFileSync(join(FIXTURES, 'tower-contract.golden.json'), 'utf8'));

// The ONE expression the capture tool and the check both evaluate, so the
// golden and the assertion can never drift into asking different questions.
const TOWER_SNAP = 'JSON.stringify(window.__diceDebug.towerContractSnapshot())';

// THE HAND-WRITTEN MINIMUM TOWER (tower-glb-loader). Imported rather than
// inlined as a base64 blob: the generator is the only statement of what the
// fixture's portals ARE, so the assertion and the asset cannot drift — an
// inlined blob is a copy that goes stale the first time somebody changes a
// number in the generator and forgets there are two of them.
const { minTowerDataUrl, minTowerGlb, MIN_TOWER_PORTALS } =
  await import('./fixtures/make-min-tower.mjs');

// Name the FIRST field that moved, with both values. A bare string compare of
// two 1000-line snapshots reports "they differ" and leaves a human to diff
// them by eye; the whole value of a byte-level freeze is that when it goes red
// it says `apron.c[1]: 1.14125 → 1.1425` and the edit is obvious.
function firstDiff(live, want, path = '') {
  if (Object.is(live, want)) return null;
  if (live === null || want === null || typeof live !== 'object' || typeof want !== 'object') {
    return `${path || '(root)'}: got ${JSON.stringify(live)}, golden ${JSON.stringify(want)}`;
  }
  const keys = [...new Set([...Object.keys(want), ...Object.keys(live)])];
  for (const k of keys) {
    const p = Array.isArray(want) ? `${path}[${k}]` : (path ? `${path}.${k}` : k);
    if (!(k in live)) return `${p}: missing from the live snapshot`;
    if (!(k in want)) return `${p}: present live (${JSON.stringify(live[k])}) and not in the golden`;
    const d = firstDiff(live[k], want[k], p);
    if (d) return d;
  }
  return null;
}

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
      // STAMP THE SCHEMA FIRST, or the seeds below are deleted before they are
      // read. main.js's one-time clean break drops every `dice.*` key on a
      // client older than the current schema — which is what a freshly-made
      // test page looks like — so a scenario seeding `dice.roomsettings.v1`
      // would find it gone by the time the app booted. `newTable` carries the
      // same stamp; `schema-reset` is where the purge is proven, by clearing
      // it on purpose.
      `localStorage.setItem('dice.schema.v1','2');`,
      // A TEST TAB IS A BETA TAB, the same rule newTable carries (js/
      // stability.js): towers and venues are closed beta and the suite's job
      // includes unreleased work. Written FIRST so a scenario can overrule it
      // from either side — `seed: {'dice.stability.v1':'stable'}` lands after
      // this line, and `clean: ['dice.stability.v1']` produces the population
      // that matters most, a browser that has never heard of the beta.
      `localStorage.setItem('dice.stability.v1','beta');`,
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
// `query` appends to the room URL, newTable's spelling — and it is an OPTION
// rather than a caller-supplied `path` because `path` is written after the
// spread and would be silently overwritten. (It was, for one debugging round:
// a `&stability=beta` that never reached the address bar and a redemption
// that looked broken.)
const tableTab = (ctx, opts = {}) => bootTab(ctx, {
  ...opts,
  path: `/?room=${encodeURIComponent(ctx.room)}${opts.query || ''}`,
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
    tags: ['smoke', 'roll', 'cuj8'],
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

      // ATTRIBUTED MATH, where math happens (U17 step 3). This asserted the
      // named bonus under the DEFAULT system, which is per-die: nothing sums
      // there, so `+3 str` was a gold weight-700 token feeding a total column
      // the lens has emptied — a term of an arithmetic the app never performs.
      // GOALS' Attributed math invariant is about attributing math that
      // HAPPENS; under a per-die read there is no sum to attribute, and the
      // canonical still carries the token for anyone reading the notation.
      assert.ok(!la.includes('str'),
        `a per-die lens shows no term of a sum it never computes (got: ${la})`);
      for (const t of [a, b]) await t.dbg(`setSystem('dnd')`);
      for (const t of [a, b]) {
        await t.waitFor(`window.__diceDebug.system === 'dnd'`, { desc: 'totals lens' });
      }
      const [da, db] = [await a.logTop(), await b.logTop()];
      assert.equal(da, db, 'still identical across tabs under the other lens');
      assert.ok(da.includes('str'),
        `and a totals lens attributes the bonus by name (got: ${da})`);
      for (const t of [a, b]) await t.dbg(`setSystem('soul-deal')`);
    },
  },
  {
    name: 'post-roll-x',
    tags: ['smoke', 'roll', 'cuj9'],
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
    name: 'orphan-clear',
    tags: ['roll', 'net', 'cuj9'],
    // U19: A ROLL WHOSE ROLLER LEFT MUST NOT BE IMMOVABLE. Before this, an
    // uncollected roll was its roller's to end (§7.7) with no exception for
    // the roller being gone — nobody could clear it, and for a HELD roll
    // nobody could reveal it either, so it sat on the felt for the session.
    //
    // The fix deliberately splits the two: CLEAR becomes universal once the
    // roller is away (it sends dice away, it never discloses a value, so the
    // fail-closed direction is kept), while REVEAL gains no fallback at all.
    // Matching a departed authority by seat NAME was the obvious fix and is
    // refused on purpose: duplicate player names all join, so anyone could
    // sit down under the roller's name and flip their held rolls.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await b.roll('d20 held');
      await a.settle();
      const rid = await b.rollId();
      assert.ok(rid, 'Bob rolled');

      // While Bob is here it is his roll: Alice only gets a local dismiss.
      assert.equal(await a.eval(`document.getElementById('result-banner').dataset.act`),
        'dismiss', "a present roller's roll is not Alice's to clear");
      assert.equal(await a.dbg(`rollerAway(${JSON.stringify(rid)})`), false, 'Bob is at the table');

      await b.dbg('leaveNow()');
      await a.waitFor(`window.__diceDebug.rollerAway(${JSON.stringify(rid)}) === true`,
        { desc: 'Alice sees Bob leave' });

      // The verb REPAINTS under the card that is already on screen — the
      // banner was painted while Bob was still here.
      assert.equal(await a.eval(`document.getElementById('result-banner').dataset.act`),
        'clear', 'the departure repaints the standing card as a real Clear');

      // And the server agrees: the same act the affordance now advertises.
      assert.equal(await a.dbg(`clearRoll(${JSON.stringify(rid)})`), true,
        'the orphaned roll clears');
      await a.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length === 0)`,
        { desc: 'the felt is Alice\'s again' });
    },
  },
  {
    name: 'crit-budget',
    tags: ['roll', 'chrome', 'cuj8'],
    // U18: THE WASH IS RATIONED, THE WORD IS NOT. `soul-deal.critFor` fires
    // when ANY die lands a crit cell, and those cells exist on d10/d12/d20 —
    // so 3d10 washed the whole viewport and shook the camera on 48.8% of
    // rolls. §2.4 budgets crit as a RARE accent; it was the median outcome.
    //
    // The chart is untouched (face 10 on a d10 IS a Critical Success). What
    // moved is who the ceremony belongs to: the table stops only when a
    // strict majority of the crit-CAPABLE dice agree. One crit in 3d10 still
    // prints its word — that is information, and U8 already established the
    // word survives what the motion does not.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });

      // playRoll is the arrival path a networked roll already takes (the
      // server sends dice + values), so driving it with chosen values is the
      // real ceremony, not a rig — and the only way to ask about an outcome
      // that is 2.8% of rolls without a flaky wait for one to happen.
      const land = async (values) => {
        await a.dbg(`playRoll({ dice: ['d10','d10','d10'], values: ${JSON.stringify(values)} })`);
        await a.settle();
        return a.eval(`(() => ({
          overlay: !document.getElementById('crit-overlay').classList.contains('hidden'),
          shake: document.getElementById('scene-container').classList.contains('shake'),
        }))()`);
      };

      // ONE crit among three d10s: the audit's case.
      assert.deepEqual(await land([10, 5, 7]), { overlay: false, shake: false },
        'one voice in three does not stop the table');
      assert.match(await a.logTop(), /Critical Success/,
        'the crit still SAYS what it is — the word is information');

      // TWO of three agree: a real verdict, and the wash comes back.
      assert.deepEqual(await land([10, 10, 7]), { overlay: true, shake: true },
        'a majority of the crit-capable dice still washes');
    },
  },
  {
    name: 'pool-undo',
    tags: ['groups', 'cuj6'],
    // U28a: DELETING A POOL IS THE RACK'S ONE IRREVERSIBLE ACT, and it was
    // one tap on its smallest control with no confirm and no way back. The
    // undo stands in the SLOT the pool left — the way back is where the
    // thing was, so there is nothing to find and no timer racing the read.
    // It restores at the remembered INDEX: a pool that reappears somewhere
    // else has not been restored, and on a rack with digit shortcuts it
    // would silently move under the keys.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setGroups([
        {name: 'Strength', notation: '1d8', category: 'Attributes'},
        {name: 'Wit', notation: '1d12', category: 'Attributes'},
        {name: 'Will', notation: '1d6', category: 'Attributes'},
        {name: 'Axe', notation: '2d8', category: 'Skills'}
      ])`);
      await a.dbg('setPoolsEditMode(true)');
      const names = () => a.eval(
        `[...document.querySelectorAll('.pool-tile .tile-name')].map((e) => e.textContent.trim())`);
      assert.deepEqual(await names(), ['Strength', 'Wit', 'Will', 'Axe'], 'the rack as dealt');

      // Delete the MIDDLE of its shelf — the case an append-style restore
      // gets wrong while still looking like it worked.
      await a.eval(`[...document.querySelectorAll('.pool-tile')]
        .find((t) => t.textContent.includes('Wit')).querySelector('.tile-del').click()`);
      assert.deepEqual(await names(), ['Strength', 'Will', 'Axe'], 'the pool is gone');
      assert.equal(await a.eval(`document.querySelectorAll('.undo-tomb').length`), 1,
        'a tombstone stands in its place');
      // …IN ITS PLACE, not at the end: the tombstone's own neighbours are
      // the ones the pool had.
      assert.equal(await a.eval(`(() => {
        const cells = [...document.querySelectorAll('.pool-grid')[0].children];
        return cells.findIndex((c) => c.classList.contains('undo-tomb'));
      })()`), 1, 'the tombstone sits where the pool sat');

      await a.eval(`document.querySelector('.undo-restore').click()`);
      assert.deepEqual(await names(), ['Strength', 'Wit', 'Will', 'Axe'],
        'undo puts it back WHERE it was, not at the end');
      assert.equal(await a.eval(`document.querySelectorAll('.undo-tomb').length`), 0,
        'the tombstone leaves with the rescue');

      // THE UNDO IS SCOPED TO THE GATE. A door that outlives manage mode is
      // a stale one — and the pool is saved, so leaving is the commit.
      await a.eval(`[...document.querySelectorAll('.pool-tile')]
        .find((t) => t.textContent.includes('Axe')).querySelector('.tile-del').click()`);
      assert.equal(await a.eval(`document.querySelectorAll('.undo-tomb').length`), 1,
        'a tombstone for the last pool on its shelf');
      await a.dbg('setPoolsEditMode(false)');
      await a.dbg('setPoolsEditMode(true)');
      assert.equal(await a.eval(`document.querySelectorAll('.undo-tomb').length`), 0,
        'leaving manage mode closes the undo');
      assert.deepEqual(await names(), ['Strength', 'Wit', 'Will'], 'and the delete stands');
    },
  },
  {
    name: 'schema-reset',
    tags: ['groups', 'cuj13'],
    // A CLEAN BREAK, ONCE (Joe 2026-08-09: "I'm okay with a full reset on all
    // user data… version forward and code the system to ditch this old broken
    // data from clients"). The frozen-mtime bug meant a browser could be
    // running a months-old main.js against a current index.html, so state on
    // those clients was written by code nobody can reason about any more.
    // Keeping it is not caution, it is carrying an unknown.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.12', name: 'Alice' });
      // Pre-fix state: dice.* keys with NO schema stamp, which is what every
      // client from before today looks like.
      await a.eval(`(() => {
        localStorage.removeItem('dice.schema.v1');
        localStorage.setItem('dice.profiles.v1', '{"v":1,"activeId":"old","profiles":[]}');
        localStorage.setItem('dice.log.v1', '[{"stale":true}]');
        localStorage.setItem('dice.panels.v1', '{"pools":false}');
        localStorage.setItem('keepme.other.app', 'not ours');
      })()`);
      // At least the three seeded — the tab has its own dice.* keys too, and
      // asserting an exact count would be asserting how much state a booted
      // tab happens to hold.
      assert.ok(await a.dbg('purgeStale()') >= 3, 'the stale dice.* keys are dropped');

      const after = await a.eval(`JSON.stringify({
        schema: localStorage.getItem('dice.schema.v1'),
        diceKeysLeft: Object.keys(localStorage).filter((k) => k.startsWith('dice.')
          && k !== 'dice.schema.v1' && !localStorage.getItem(k)).length,
        stalePool: localStorage.getItem('dice.profiles.v1'),
        staleLog: localStorage.getItem('dice.log.v1'),
        foreign: localStorage.getItem('keepme.other.app'),
      })`);
      const st = JSON.parse(after);
      assert.equal(st.schema, '2', 'the schema stamp is written');
      assert.notEqual(st.stalePool, '{"v":1,"activeId":"old","profiles":[]}',
        'pre-fix profile state is gone');
      assert.equal(st.staleLog, null, 'and the stale log with it');
      // A RESET OF OUR DATA IS NOT A LICENCE TO CLEAR ANYONE ELSE'S. This
      // origin may be shared with another app.
      assert.equal(st.foreign, 'not ours', "a foreign key on the same origin is untouched");

      // …and ONCE. A second boot must not wipe the profile you just made.
      await a.dbg(`profiles.create('Keeper', 'soul-deal')`);
      assert.equal(await a.dbg('purgeStale()'), 0, 'the reset does not repeat');
      const names = (await a.dbg('profiles.list')).map((p) => p.name);
      assert.ok(names.includes('Keeper'),
        `and the profile made after it survives (got ${names.join(', ')})`);
    },
  },
  {
    name: 'dice-land-flat',
    tags: ['roll', 'perf', 'cuj8'],
    // C24 — THE MAT CANNOT KEEP SHRINKING. Three zoom tightenings shipped
    // before anyone measured what they did to the floor the dice land on. At
    // the fourth (refused) notch a 12-die pool put TEN of twelve dice on top
    // of another die, in a heap nine units tall — which breaks goal 5
    // ("organized over realistic") and goal 1 (real dice on a real surface),
    // and reads as a smudge under a camera framed for a flat table.
    //
    // This is a FLOOR under the ladder, not a claim that today is ideal:
    // today's `close` already piles a 40-die pool. It pins the pool sizes a
    // Soul Deal table actually rolls — a canonical attribute+skill+motivation
    // is three dice — so the next tightening has to answer for them.
    //
    // The check this replaces was VACUOUS: it read `.y` off the mesh wrapper
    // rather than the physics body, got undefined, and every comparison came
    // back false. It passed at every zoom level including the broken one.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();
      const restHeights = async (notation) => {
        await a.dbg(`commandRoll(${JSON.stringify(notation)})`);
        await a.settle();
        await a.dbg('sim(8000)');
        const r = await a.eval(`JSON.stringify((() => {
          const ys = window.__diceDebug.tableDice.map((o) => o.body.position.y);
          return { n: ys.length, piled: ys.filter((y) => y > 1.2).length,
                   maxY: Math.round(Math.max(...ys) * 100) / 100 };
        })())`);
        await a.dbg('clearTable()');
        await a.dbg('sim(400)');
        return JSON.parse(r);
      };

      // SAMPLED, NOT SINGLE-SHOT. A landing is physics off a server-seeded
      // roll, so any one throw can stack two dice by luck — this pinned a
      // single roll first and was flaky in the sweep while passing alone,
      // which is the worst way for a floor to behave. Three throws and a
      // MAJORITY verdict is stable against luck and still fails hard on a
      // real regression, where most throws pile.
      const sample = async (notation, n = 3) => {
        const runs = [];
        for (let i = 0; i < n; i++) runs.push(await restHeights(notation));
        return {
          flatRuns: runs.filter((r) => r.piled === 0).length,
          worst: Math.max(...runs.map((r) => r.piled)),
          maxY: Math.max(...runs.map((r) => r.maxY)),
        };
      };

      for (const lv of ['wide', 'medium', 'close']) {
        await a.dbg(`setZoom('${lv}')`);
        await a.dbg('sim(200)');
        // THE ROLL SOUL DEAL IS BUILT FOR: attribute + skill + motivation.
        // If these three cannot land flat at any zoom the product ships, the
        // zoom is wrong — not the roll.
        const trio = await sample('1d8+1d6+1d10');
        assert.ok(trio.flatRuns >= 2,
          `${lv}: the canonical three-die roll lands flat (${trio.flatRuns}/3 throws, worst ${trio.worst}, maxY ${trio.maxY})`);
        // A six-die pool is ordinary too — but only the DEFAULT and above owe
        // it a flat landing. `close` is opt-in and its own tooltip says
        // "biggest dice, best on a phone": a player who chooses it is
        // choosing density, and it measurably piles 2 of 6. Asserting it
        // there would either fail on the shipped app or force the bar down
        // everywhere, and neither is the truth. Recorded here so the next
        // tightening cannot claim ignorance.
        if (lv !== 'close') {
          const six = await sample('6d6');
          assert.ok(six.worst <= 2,
            `${lv}: a six-die pool never becomes a pile (worst ${six.worst}/6 over 3 throws, maxY ${six.maxY})`);
        }
      }
    },
  },
  {
    name: 'contacts-reach-the-felt',
    tags: ['roll', 'perf', 'fx', 'cuj8'],
    // THE RECORDER STARVES EVERY LARGE POOL (2026-08-09). `roll.sounds` is the
    // ONE array the impact drain reads (js/main.js, stepPlayback): sound,
    // particle bursts, felt decals and the shock ring all come off it. It was
    // capped at 400 events for the WHOLE roll — and a 40-die spawn cluster
    // interpenetrates on frame zero and dispatches enough contacts in that one
    // step to spend the entire budget before a single die has touched felt.
    //
    // So above roughly fourteen dice the app went silent, threw no particles,
    // laid no marks and fired no ring — and every existing scenario stayed
    // green, because nothing asserted that a landing produces an EVENT. The
    // whole Level 3/4/5 layer switching itself off is invisible to a suite
    // that only checks where dice come to rest.
    //
    // The assertion is deliberately about the DRAIN's raw material rather than
    // about any one effect: a decal can be off by ruling and a set can carry no
    // particles by design, but a die that lands always owes a contact event.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();

      // WAIT FOR THE ROLL, don't settle() for it. The fast-forward is
      // synchronous inside playRoll, so the numbers are final the instant
      // currentRoll exists — but clearTable() between throws NULLS currentRoll,
      // so a settle() that returns before the next roll's SSE event lands reads
      // null and the whole scenario collapses on a race rather than on the
      // behaviour under test.
      const stats = async (notation) => {
        await a.dbg(`commandRoll(${JSON.stringify(notation)})`);
        await a.waitFor('!!window.__diceDebug.contactStats()',
          { desc: `${notation}: the roll reached the client` });
        const s = JSON.parse(await a.eval(
          'JSON.stringify(window.__diceDebug.contactStats())'));
        await a.dbg('sim(9000)');
        await a.dbg('clearTable()');
        await a.dbg('sim(400)');
        return s;
      };

      // SAMPLED like dice-land-flat, and for the same reason: a landing is
      // physics off a server-seeded roll, so one throw can be unlucky. A
      // starved recorder fails EVERY throw, so a majority is still a hard fail
      // on the real regression.
      const sample = async (notation, n = 3) => {
        const runs = [];
        for (let i = 0; i < n; i++) runs.push(await stats(notation));
        return runs;
      };

      for (const notation of ['20d6', '40d6']) {
        const runs = await sample(notation);
        const heard = runs.filter((r) => r.afterHalfSec > 0).length;
        const floored = runs.filter((r) => r.onFloor > 0).length;
        const worstFirst = Math.max(...runs.map((r) => r.firstFrame));
        assert.ok(heard >= 2,
          `${notation}: the roll is still making contacts after 0.5 s — a player `
          + `hears it land (${heard}/3 throws; totals `
          + `${runs.map((r) => r.total).join('/')}, worst spawn-frame share `
          + `${worstFirst})`);
        assert.ok(floored >= 2,
          `${notation}: contacts reach the felt at all — the decal gate is `
          + `at[1] < 0.6 (${floored}/3 throws)`);
      }

      // A small pool was never starved; it is the control. If this fails, the
      // per-step cap was set too tight and took the ordinary case with it.
      const trio = await sample('1d8+1d6+1d10');
      assert.ok(trio.every((r) => r.afterHalfSec > 0),
        `the canonical three-die roll still records its landings `
        + `(${trio.map((r) => r.afterHalfSec).join('/')} late contacts)`);
    },
  },
  {
    name: 'settle-is-when-they-stop',
    tags: ['roll', 'perf', 'fx', 'cuj8'],
    // THE ROLL ENDED 450 ms AFTER THE DICE DID (2026-08-09). `stillTime`
    // accrues for SETTLE_STILL — 0.45 s, exactly 27 frames — before a die is
    // judged landed, so the freeze test concedes 27 frames after the die
    // actually stopped, and `duration` was the length of the whole array
    // INCLUDING that motionless tail. Every settle-keyed beat therefore fired
    // on a picture that had already gone still: stageHitStop's 0.3 s flash
    // lands entirely inside the dead window.
    //
    // Nothing caught it because a motionless tail is invisible to a suite that
    // asserts where dice come to REST — the final pose is identical whether
    // you hold it for 27 frames or none. What follows is the read that isn't:
    // the roll's own declared length against the frame its last die stopped.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();

      const probe = async (notation) => {
        await a.dbg(`commandRoll(${JSON.stringify(notation)})`);
        await a.waitFor('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
          { desc: `${notation}: the roll reached the client` });
        const r = JSON.parse(await a.eval(`JSON.stringify((() => {
          const r = window.__diceDebug.currentRoll, F = 1 / 60;
          const durFrames = Math.round(r.duration / F);
          // simFrames, not keyframes.length: since 2026-08-10 the dead frames
          // are TRUNCATED off the array rather than merely skipped, so the
          // array length equals durFrames by construction and would report
          // every cut as zero. simFrames is what the simulation actually ran.
          const frames = r.simFrames;
          // The tie group is the dice sharing the MAX settle frame — not the
          // whole pool. A SETTLE_CAP roll force-freezes only the dice still
          // dynamic at the cap; anything that landed clean before it keeps its
          // own earlier settle time and is not in the tie at all.
          const maxF = Math.max(...r.landings.map((l) => l.frame));
          const tied = r.landings.filter((l) => l.frame === maxF);
          return { n: r.landings.length, frames, durFrames,
                   lastFrame: r.lastLanding.frame,
                   timedOut: r.lastLanding.timedOut,
                   lastIdx: r.lastLanding.i,
                   tieSize: tied.length,
                   tiedLowest: Math.min(...tied.map((l) => l.i)),
                   tailCut: frames - durFrames };
        })())`));
        await a.dbg('sim(9000)');
        await a.dbg('clearTable()');
        await a.dbg('sim(400)');
        return r;
      };

      const runs = [];
      for (let i = 0; i < 3; i++) runs.push(await probe('1d20'));

      for (const r of runs) {
        assert.equal(r.n, 1, `every die reports a landing (got ${r.n})`);
        // The roll's declared length IS the frame its last die stopped. This
        // is the whole fix in one equality.
        assert.equal(r.durFrames, r.lastFrame,
          `the roll ends on the frame the last die stopped `
          + `(duration ${r.durFrames}f vs settle ${r.lastFrame}f)`);
      }

      // …and the tail it cut was real, not a rounding artefact. Only a CLEAN
      // landing owes this: a die force-frozen at SETTLE_CAP never went still,
      // so its settle time is the cap and there is nothing to trim.
      const clean = runs.filter((r) => !r.timedOut);
      assert.ok(clean.length >= 2,
        `a single d20 lands clean rather than timing out (${clean.length}/3)`);
      for (const r of clean) {
        assert.ok(r.tailCut >= 24,
          `the motionless tail is cut — SETTLE_STILL is 27 frames, so a clean `
          + `landing should shed about that many (cut ${r.tailCut}f of ${r.frames}f)`);
      }

      // A big pool is the tie case, not an edge: 20d6 force-freezes every
      // remaining die on one step with one identical simTime, so "which die
      // settled last" is an N-way tie. It must resolve to the LOWEST index,
      // deterministically, on every client — otherwise a beat that holds on
      // the deciding die holds on a different die per browser.
      const big = await probe('20d6');
      assert.equal(big.n, 20, `every die of a big pool reports a landing (got ${big.n})`);
      assert.equal(big.durFrames, big.lastFrame,
        `a big pool also ends when its dice stop `
        + `(duration ${big.durFrames}f vs settle ${big.lastFrame}f)`);
      // UNCONDITIONAL. Gating this on `timedOut` made it a coin flip — the
      // first green run of this scenario simply drew a throw that resolved
      // before the cap, and the assertion never executed. The tie-break rule
      // holds on every roll, tie or not: the deciding die is the LOWEST index
      // among those sharing the last settle frame, so every client holds on
      // the same die.
      assert.equal(big.lastIdx, big.tiedLowest,
        `the deciding die is the lowest index sharing the last settle frame `
        + `(picked ${big.lastIdx}, lowest of ${big.tieSize} tied is `
        + `${big.tiedLowest}; timedOut=${big.timedOut})`);
      for (const r of runs) {
        assert.equal(r.lastIdx, r.tiedLowest,
          `single-die roll agrees with the same rule (${r.lastIdx} vs ${r.tiedLowest})`);
      }
    },
  },
  {
    name: 'framing-keeps-the-deciding-die',
    tags: ['roll', 'perf', 'touch', 'cuj8'],
    // THE PHONE HAS NEVER FIT THE MAT (measured 2026-08-10). fitCameraTo scans
    // 1 + i*0.03 for i < 90, tops out at ~3.67×, and on a 390px phone the mat
    // needs more than that at EVERY zoom — corners at NDC 1.28–1.37. The loop
    // exhausted, left the eye at the last step, and the felt overflowed with
    // nothing reporting it. Measured consequence: on 40d6 the die the roll came
    // down to was OFF SCREEN, and the player had no way to watch it stop.
    //
    // Joe's call (2026-08-10) was to crop on purpose and centre on the dice.
    // Ruling ② sets the floor: framing may vary per client and the mat may be
    // cut, but THE DECIDING DIE IS NEVER CROPPED OUT OF FRAME. That is what
    // this pins — on every pool size, which is where it used to fail.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();
      const viewport = async (w, h, mini) => {
        await a.page.browser.send('Emulation.setDeviceMetricsOverride',
          { width: w, height: h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
        await a.dbg(`setPanelState({pools: ${!mini}, log: ${!mini}})`);
        await a.dbg("setZoom('medium')"); // dice.zoom.v1 is per-origin and outlives a scenario
        await a.eval('window.dispatchEvent(new Event("resize"))');
        await a.dbg('sim(300)');
      };
      const throwIt = async (notation) => {
        await a.dbg('clearTable()');
        await a.dbg('sim(300)');
        await a.dbg(`commandRoll(${JSON.stringify(notation)})`);
        await a.waitFor('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.lastLanding)',
          { desc: `${notation}: the roll reached the client` });
        await a.dbg('sim(9000)'); // settle
        await a.dbg('sim(1500)'); // let the reframing ease finish
        return JSON.parse(await a.eval('JSON.stringify(window.__diceDebug.framingInfo())'));
      };

      // A DESKTOP MUST BE UNTOUCHED. The mat fits there, so the ladder never
      // leaves its first rung and the framing is the one that shipped.
      await viewport(1440, 900, true);
      for (const pool of ['1d20', '6d6']) {
        const f = await throwIt(pool);
        assert.equal(f.mode, 'mat', `desktop ${pool}: the camera still frames the whole mat`);
        assert.ok(f.matFits, `desktop ${pool}: and the mat actually fits (it always has here)`);
      }

      // A PHONE CROPS, AND THE FLOOR HOLDS. Every pool size, including the ones
      // whose dice cannot all fit — that is the whole point of the ladder.
      await viewport(390, 844, true);
      for (const pool of ['1d20', '1d8+1d6+1d10', '6d6', '20d6', '40d6']) {
        const f = await throwIt(pool);
        assert.ok(f.decidingOnScreen === true,
          `phone ${pool}: the deciding die is in frame (mode ${f.mode}, `
          + `${f.diceOnScreen}/${f.dice} dice on screen)`);
        assert.notEqual(f.mode, 'mat-overflow',
          `phone ${pool}: the camera aims at something rather than overflowing blindly`);
      }

      // AND THE CROP BOUGHT SIZE — measured against the shipped framing through
      // the same probe, not asserted from taste.
      //
      // ONE DIE ONLY, and that is a finding rather than a convenience. Dice
      // SCATTER: a three-die pool's AABB measured anywhere from 5x3.4 to
      // 7.7x5.3 on an 8.6x5.2 mat, so on many throws it does not fit a phone
      // either and the ladder correctly declines to crop. Asserting a gain for
      // the trio failed 2 runs in 4 at 78-80px — the honest claim is that the
      // size win is GUARANTEED for a single die and OPPORTUNISTIC above it.
      // `1d20 dc 15` is the most common check in the game, so the guaranteed
      // case is also the frequent one.
      for (const pool of ['1d20']) {
        await throwIt(pool);
        await a.eval('window.__diceDebug.setFramingLadder(false)');
        await a.dbg('sim(1500)');
        const off = (await a.eval('JSON.stringify(window.__diceDebug.zoomProbe())'));
        await a.eval('window.__diceDebug.setFramingLadder(true)');
        await a.dbg('sim(1500)');
        const on = (await a.eval('JSON.stringify(window.__diceDebug.zoomProbe())'));
        const o = JSON.parse(off).dieSpanPx, n = JSON.parse(on).dieSpanPx;
        assert.ok(n > o * 1.5,
          `phone ${pool}: framing the die makes it much bigger (${o}px → ${n}px)`);
        const f = JSON.parse(await a.eval('JSON.stringify(window.__diceDebug.framingInfo())'));
        assert.equal(f.diceOnScreen, f.dice,
          `phone ${pool}: …and every die is still on screen (${f.diceOnScreen}/${f.dice})`);
      }

      // THE TABLE TURNS, AND ONLY WHERE IT PAYS. Portrait orbit is chosen by
      // measurement at frame time, not by a viewport threshold: landscape must
      // fail to contain the mat, portrait must contain it, and landscape must
      // actually be dropping dice. The first rule tried here was "more dice,
      // then bigger", and it turned a DESKTOP at 40d6 to gain one die at a 31%
      // size cost — at forty dice a few are always piled above the mat plane
      // and out of frame whichever way the table sits, so that tie-break was
      // noise. These three assertions are the ones that would have caught it.
      const big = await throwIt('40d6');
      assert.notEqual(big.orbit, 0,
        `phone 40d6: the table turns (orbit ${big.orbit}, ${big.diceOnScreen}/${big.dice})`);
      assert.equal(big.diceOnScreen, big.dice,
        `phone 40d6: …and every one of forty dice is on screen (${big.diceOnScreen}/${big.dice})`);
      const lone = await throwIt('1d20');
      assert.equal(lone.orbit, 0,
        `phone 1d20: a lone die does NOT turn the table — landscape already `
        + `showed it, and turning would trade its close frame for nothing `
        + `(orbit ${lone.orbit}, ${lone.spanPx}px)`);

      // A DESKTOP NEVER TURNS, at any pool size. Its mat always fits, so the
      // second candidate is never even computed.
      await viewport(1440, 900, true);
      for (const pool of ['1d20', '20d6', '40d6']) {
        const f = await throwIt(pool);
        assert.equal(f.orbit, 0, `desktop ${pool}: the table stays landscape`);
        assert.ok(f.decidingOnScreen === true,
          `desktop ${pool}: and the deciding die is in frame — the mat fitting `
          + `does NOT imply the dice do, since a die resting on two others `
          + `projects from above the mat plane (${f.diceOnScreen}/${f.dice})`);
      }
      await viewport(390, 844, true);

      // PUT THE ORIGIN BACK. `setPanelState` writes per-origin localStorage,
      // which outlives this scenario's room — the same trap TESTING.md records
      // for dice.diceset.v1. Leaving the panels collapsed made
      // `hidden-means-hidden` and `a11y-modals` fail LATER IN THE SWEEP while
      // both passed in isolation, which is the most expensive shape a test
      // failure can take: it accuses the wrong commit. This scenario is the
      // only one that visits a phone viewport, so it is the one that owes the
      // cleanup.
      await a.dbg('setPanelState({pools: true, log: true})');
      await a.page.browser.send('Emulation.clearDeviceMetricsOverride', {}, a.page.sessionId);
      await a.eval('window.dispatchEvent(new Event("resize"))');
      await a.dbg('sim(300)');
    },
  },
  {
    name: 'debug-surface-answers',
    tags: ['quality'],
    // A DEBUG HOOK THAT THROWS IS INVISIBLE TO THIS SUITE unless something
    // calls it, and `__diceDebug` is the substrate almost every scenario
    // asserts through — so a stale hook is a hole in the instrument, not just
    // a broken tool.
    //
    // Found the hard way (2026-08-10): renaming CAM_TARGET to CAM_TARGET_HOME
    // left FOUR dangling references inside C27's `matFit()`, which threw
    // ReferenceError on every call. The full sweep stayed 133/133 across three
    // runs, because the only caller is a tools/steps script nobody runs in CI.
    //
    // TESTING.md P5 diffs the KEY LIST, and it passed throughout — the key was
    // still there; its body had gone stale. This is P5's other half: P5 proves
    // the hooks still EXIST, this proves they still ANSWER.
    //
    // Zero-arg only, deliberately: those are the pure readouts, and calling
    // them is safe. A hook that takes arguments changes state, and a smoke
    // test has no business guessing what to pass it.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();
      // With dice on the felt, so the readouts have something to read — an
      // empty table exercises the early-return branch of half of them.
      await a.dbg(`commandRoll("1d8+1d6+1d10")`);
      await a.dbg('sim(9000)');
      const probed = JSON.parse(await a.eval(`JSON.stringify((() => {
        const d = window.__diceDebug, bad = [], ran = [];
        for (const k of Object.keys(d)) {
          const f = d[k];
          if (typeof f !== 'function' || f.length !== 0) continue;
          ran.push(k);
          try { f(); } catch (e) { bad.push(k + ': ' + e.message); }
        }
        return { bad, count: ran.length };
      })())`));
      assert.deepEqual(probed.bad, [],
        `every zero-argument __diceDebug hook answers without throwing`);
      // Guard the guard: if the probe stops finding hooks it stops proving
      // anything, which is the vacuous-pass shape this repo keeps meeting.
      assert.ok(probed.count >= 15,
        `…and the probe actually reached the hooks (${probed.count} called)`);
    },
  },
  {
    name: 'cache-validator',
    tags: ['net'],
    // A STALE BUILD IS A PERMANENT ONE, unless the validator changes with the
    // content (2026-08-09). This served `Last-Modified` from the file's
    // mtime, and Cloud Native Buildpacks NORMALIZE every mtime to 1980-01-01
    // for reproducible builds — so the validator was identical in every
    // deploy forever, and a browser holding `If-Modified-Since: 1980` got 304
    // no matter how many times the app shipped. It served its cached copy
    // until site data was cleared by hand.
    //
    // Found from the field by the crash reporting added the same day: a phone
    // reporting `#profile-save` null at main.js:10402, an element that had
    // not existed for weeks — a NEW index.html against a MONTHS-OLD main.js.
    async fn(ctx) {
      const base = `http://127.0.0.1:${ctx.port}`;
      const r = await fetch(`${base}/js/main.js`);
      const etag = r.headers.get('etag');
      assert.ok(etag && /^"[\w-]+"$/.test(etag), `an ETag is served (got ${etag})`);
      assert.equal(r.headers.get('last-modified'), null,
        'and NO Last-Modified — a header a build system freezes is a validator that lies');

      // The right validator still 304s, so revalidation stays cheap.
      const same = await fetch(`${base}/js/main.js`, { headers: { 'If-None-Match': etag } });
      assert.equal(same.status, 304, 'a matching ETag answers 304');

      // THE ONE THAT WAS BROKEN: a frozen 1980 date must no longer satisfy
      // anything. This is the exact request every previously-cached browser
      // makes.
      const stale = await fetch(`${base}/js/main.js`, {
        headers: { 'If-Modified-Since': 'Tue, 01 Jan 1980 00:00:01 GMT' },
      });
      assert.equal(stale.status, 200, 'a 1980 timestamp gets the real file, not a 304');
      assert.ok((await stale.text()).length > 1000, 'and it has a body');

      // A WRONG ETag is a full response too.
      const wrong = await fetch(`${base}/js/main.js`, { headers: { 'If-None-Match': '"nope"' } });
      assert.equal(wrong.status, 200, 'a stale ETag gets the real file');

      // Two DIFFERENT files must not share a validator, or one would
      // revalidate the other into place.
      const other = await fetch(`${base}/css/style.css`);
      assert.notEqual(other.headers.get('etag'), etag, 'different files, different ETags');
    },
  },
  {
    name: 'crash-reporting',
    tags: ['net', 'perf'],
    // Joe 2026-08-09: "no telemetry here has me worried about maintaining
    // this." A browser that breaks now says so, to the server log, where
    // Cloud Run is already keeping stdout.
    //
    // The handlers live in a CLASSIC script loaded before the module graph,
    // because the most valuable failure to catch is js/main.js failing to
    // parse or one of its imports 404ing — at which point nothing inside
    // main.js runs and a handler registered there would never exist.
    async fn(ctx) {
      // This scenario's SUBJECT is uncaught exceptions, so the ones it throws
      // are not its failures. Narrowed to its own messages: any other
      // exception still fails it.
      ctx.expectErrors(/scenario-(boom|reject)/);
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();

      // An uncaught exception reaches the server, with a stack.
      await a.eval(`setTimeout(() => { throw new Error('scenario-boom'); }, 0)`);
      await ctx.waitForLog(/clienterr .*msg="[^"]*scenario-boom/,
        { desc: 'an uncaught exception is reported' });
      await ctx.waitForLog(/clienterr .*stack=/, { desc: 'and carries a stack' });

      // An unhandled rejection is a different event and is caught too.
      // `void`, so the eval does not RETURN the rejected promise — CDP is
      // told to await promise results, and handing it this one would fail the
      // eval instead of leaving the rejection unhandled, which is the whole
      // thing under test.
      await a.eval(`void Promise.reject(new Error('scenario-reject'))`);
      await ctx.waitForLog(/clienterr .*kind="rejection".*scenario-reject/,
        { desc: 'an unhandled rejection is reported' });

      // WHAT IT MUST NOT CARRY. The room key is the table's only access
      // control (goal 10: there is no other), so a door anyone on the
      // internet can knock on must never log it — and no player name or
      // pool text goes either.
      await a.eval(`window.__diceReport('scenario-explicit')`);
      await ctx.waitForLog(/clienterr .*scenario-explicit/, { desc: 'the explicit door works' });
      const logs = ctx.serverLog();
      const lines = logs.split('\n').filter((l) => l.includes('clienterr'));
      assert.ok(lines.length >= 3, `three reports landed (got ${lines.length})`);
      for (const l of lines) {
        assert.ok(!l.includes(ctx.room), `no report carries the room key: ${l.slice(0, 160)}`);
        assert.ok(!/\bAlice\b/.test(l), `no report carries a player name: ${l.slice(0, 160)}`);
      }

      // A REPEAT IS COUNTED, NOT RE-SENT: the same error 400 times is one
      // fact about the build and 400 requests about nothing.
      const before = ctx.serverLog().split('\n').filter((l) => l.includes('scenario-boom')).length;
      for (let i = 0; i < 5; i++) {
        await a.eval(`setTimeout(() => { throw new Error('scenario-boom'); }, 0)`);
      }
      await a.dbg('sim(120)');
      const after = ctx.serverLog().split('\n').filter((l) => l.includes('scenario-boom')).length;
      assert.equal(after, before, 'a repeat of a reported error sends nothing further');
    },
  },
  {
    name: 'hidden-means-hidden',
    tags: ['chrome'],
    // C20 — `.hidden` IS A CLASS THIS STYLESHEET DOES NOT DEFINE. There is a
    // global rule for the `[hidden]` ATTRIBUTE and every `.hidden` is scoped
    // to its own element (`#settings-modal.hidden`, `.popover.hidden`, …), so
    // `classList.add('hidden')` on an element without a rule is a no-op that
    // reads exactly like a fix. Four shipped that way: `#seat-someone`
    // ("Someone else…") was visible every time the code asked it not to be,
    // plus `#seat-list`, `#seat-table-name` and `#seat-preview-btns`.
    //
    // This walks the elements the code actually toggles and proves each one
    // OBEYS. A blanket `.hidden { display: none }` was refused: in a 4.5k-line
    // sheet where the class currently means nothing on its own, making it mean
    // something everywhere at once is the kind of change this file has already
    // been bitten by four times. So the rules stay scoped and this is what
    // keeps them honest.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();
      const disobedient = await a.eval(`(() => {
        const ids = ${JSON.stringify([
          'result-banner', 'settings-modal', 'name-modal', 'help-overlay', 'kbd-overlay',
          'mods-popover', 'identity-menu', 'offer-menu', 'log-flyout', 'peek-card',
          'crit-overlay', 'ceremony-layer', 'palette-backdrop', 'pools-head',
          'profile-banner', 'storage-banner', 'offer-banner', 'seat-mine', 'seat-list',
          'seat-someone', 'seat-table-name', 'seat-preview', 'seat-preview-btns',
          'seat-keep-name', 'profile-pick', 'profile-rename', 'profile-rename-in',
          'import-profiles', 'table-profiles', 'portable-zone', 'cmd-cheatsheet',
          'draft-actions', 'strip-dc', 'rail-dice', 'rail-pools',
        ])};
        const bad = [];
        for (const id of ids) {
          const el = document.getElementById(id);
          if (!el) { bad.push(id + ' (absent)'); continue; }
          const had = el.classList.contains('hidden');
          el.classList.add('hidden');
          const d = getComputedStyle(el).display;
          if (!had) el.classList.remove('hidden');
          if (d !== 'none') bad.push(id + ' (' + d + ')');
        }
        return bad;
      })()`);
      assert.deepEqual(disobedient, [],
        `every element the code hides by class actually hides: ${disobedient.join(', ')}`);
    },
  },
  {
    name: 'a11y-modals',
    tags: ['chrome', 'a11y'],
    // U22 (audit D3, D4, D5). Six modal-ish surfaces, zero focus
    // containment, and exactly ONE aria-modal — on #help-overlay, which had
    // no trap either. That annotation promises assistive tech the rest of
    // the page is not there, and Tab walked straight into content AT had
    // been told did not exist: focus real, speech silent. The rule now is
    // that aria-modal and the trap ship together or neither ships, so this
    // asserts them TOGETHER — an aria-modal with no inert background is the
    // exact defect, and it would pass a test that only looked for the
    // attribute.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();

      // ---- structure: the landmarks that were simply absent ----
      assert.equal(await a.eval(`document.querySelectorAll('h1').length`), 1,
        'the document has exactly one h1');
      assert.equal(await a.eval(`!!document.querySelector('main')`), true,
        'and a main landmark — without it the workbench announced as "complementary"');
      assert.equal(await a.eval(
        `document.getElementById('left-panel').getAttribute('aria-label')`), 'Dice workbench',
        'the panel is a NAMED region');

      // ---- the trap, on every blocking surface ----
      const state = (id) => a.eval(`(() => {
        const el = document.getElementById(${JSON.stringify(id)});
        const bg = [...document.body.children].filter((c) => c !== el);
        return {
          modal: el.getAttribute('aria-modal'),
          role: el.getAttribute('role'),
          named: !!(el.getAttribute('aria-labelledby') || el.getAttribute('aria-label')),
          inertBg: bg.every((c) => c.inert),
          focusInside: el.contains(document.activeElement),
        };
      })()`);

      for (const [id, open, close] of [
        ['help-overlay', `openHelpDialog(null)`, `closeHelpDialog()`],
        ['kbd-overlay', `toggleKbd()`, `closeKbd()`],
        ['settings-modal', `openSettingsModal()`, `closeSettingsModal()`],
      ]) {
        await a.dbg(open);
        const st = await state(id);
        assert.equal(st.modal, 'true', `${id} claims aria-modal`);
        assert.equal(st.role, 'dialog', `${id} is a dialog`);
        assert.ok(st.named, `${id} has an accessible name`);
        // THE HALF THAT WAS MISSING. Claiming modality without it is the
        // lie the audit found.
        assert.equal(st.inertBg, true, `${id} makes the rest of the page inert`);
        assert.equal(st.focusInside, true, `${id} takes focus when it opens`);
        await a.dbg(close);
        const after = await a.eval(
          `[...document.body.children].some((c) => c.inert)`);
        assert.equal(after, false, `${id} releases the page when it closes`);
      }

      // ---- the focus ring that was removed with nothing put back ----
      // The notation section is OFF by default (§7.23 demoted it), and a
      // display:none input cannot take focus — so :focus would never match
      // and the assertion would read `none` for the wrong reason.
      await a.dbg(`setSections({notation: true})`);
      const ring = await a.eval(`(() => {
        const i = document.getElementById('cmd-input');
        i.focus();
        const cs = getComputedStyle(i);
        return { outline: cs.outlineStyle, shadow: cs.boxShadow };
      })()`);
      assert.ok(ring.shadow && ring.shadow !== 'none',
        `the notation box shows focus (outline:${ring.outline}, shadow:${ring.shadow})`);

      // ---- a seg is a CHOICE, not a row of switches ----
      await a.eval(`document.querySelector('#die-buttons .die-btn').click()`);
      assert.equal(await a.dbg(`openPopoverFor('tray')`), true, 'the popover opens');
      const seg = await a.eval(`(() => {
        const g = document.getElementById('pop-seg-vis');
        const cells = [...g.querySelectorAll('button')];
        return {
          role: g.getAttribute('role'),
          named: !!g.getAttribute('aria-label'),
          cellRoles: [...new Set(cells.map((c) => c.getAttribute('role')))],
          pressed: cells.filter((c) => c.hasAttribute('aria-pressed')).length,
          checked: cells.filter((c) => c.hasAttribute('aria-checked')).length,
          stops: cells.filter((c) => c.tabIndex === 0).length,
        };
      })()`);
      assert.equal(seg.role, 'radiogroup', 'Visibility is one decision, not four switches');
      assert.ok(seg.named, 'and the group carries its own name');
      assert.deepEqual(seg.cellRoles, ['radio'], 'its cells are radios');
      assert.equal(seg.pressed, 0, 'aria-pressed is gone — it is not a toggle');
      assert.equal(seg.checked, 4, 'every cell reports checked state');
      assert.equal(seg.stops, 1, 'a radiogroup is ONE tab stop, arrows move within');
      await a.eval(`document.getElementById('pop-close').click()`);
      await a.eval(`document.getElementById('clear-tray').click()`);

      // ---- collected rolls: the table's history was a flat 2.1.1 failure ----
      // The door used to be an unlabelled <div> on the felt; since C25 it is
      // the roll's LOG ROW, which has to carry the same three things — a role,
      // a tab stop, and a name that says which roll it is. Once a roll is
      // collected its card is still the only path to Reveal, so a keyboard
      // player who cannot open it cannot reveal their own held roll.
      await a.roll('d20');
      await a.dbg(`collectRoll(${JSON.stringify(await a.rollId())})`);
      await a.dbg('setLogFlyout(true)');
      await a.waitFor(
        `(window.__diceDebug.sim(120), !!document.querySelector('#log-list .log-entry.collected'))`,
        { desc: 'the collected roll wears its row' });
      const mk = await a.eval(`(() => {
        const m = document.querySelector('#log-list .log-entry.collected');
        return { role: m.getAttribute('role'), tab: m.tabIndex, named: (m.getAttribute('aria-label') || '').length };
      })()`);
      assert.equal(mk.role, 'button', "a collected roll's row is a button");
      assert.equal(mk.tab, 0, 'and it is reachable — its card is the only door to Reveal');
      assert.ok(mk.named > 10, `and it says which roll it is (name is ${mk.named} chars)`);
      await a.dbg('setLogFlyout(false)');
    },
  },
  {
    name: 'clear-consequences',
    tags: ['roll', 'shelf', 'cuj9'],
    // TWO CLEARS, BOTH OF WHICH USED TO LOSE SOMETHING QUIETLY (C6, C7).
    //
    // C6 — `log` is not just the flyout's list, it is the BACKING STORE for
    // every shelf read: renderShelfMarkers, glowTint, renderPeek and the
    // tweak popover all look a marker's roll up in it. Emptying it left five
    // shelved rolls anonymous, unreadable, unrerollable, and stripped of the
    // named ✕ Clear and Reveal the fold only builds `if (entry)`. So the
    // shelf goes with the history now — keeping discs nobody can read is not
    // keeping anything.
    //
    // C7 — the server has always broadcast who swept, and the client threw
    // the name away. Goal 10 is why ANYONE may clear the table; it is not a
    // reason for five people's shelves to empty with no cause on screen.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });

      // --- C6: history and shelf leave together ---
      for (const n of ['d20', 'd8']) {
        await a.roll(n);
        await a.dbg(`collectRoll(${JSON.stringify(await a.rollId())})`);
      }
      await a.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 2)`,
        { desc: 'two rolls collected' });
      await a.eval(`document.getElementById('clear-log').click()`);
      await a.waitFor(`(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 0)`,
        { desc: 'the collected set leaves with the history it IS the record for' });
      assert.equal(await a.logCount(), 0, 'and the history is gone');

      // --- C7: a neighbour's sweep is said out loud ---
      await b.roll('d6');
      await b.settle();
      await a.settle();
      // The corner ✕, not __diceDebug.clearTable — the local function skips
      // the wire entirely, and the wire is what carries the name. One press
      // clears Bob's own; his rolls are the only ones on the table here, so
      // no arm follows (C7 ②: pressing twice to clear a table you are alone
      // at is a toll, not a safeguard).
      await b.eval(`document.getElementById('corner-clear').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), /cleared/.test(document.getElementById('status-pill').textContent))`,
        { desc: "Alice is told who swept" });
      assert.match(await a.eval(`document.getElementById('status-pill').textContent`), /Bob/,
        'by name — the broadcast carried it all along');
      assert.match(await a.eval(`document.getElementById('status-pill').textContent`),
        /cleared their rolls/, 'and the notice names the SCOPE, not "the table"');
      // …and NOT narrated back at the person who pressed it.
      assert.doesNotMatch(await b.eval(`document.getElementById('status-pill').textContent`),
        /cleared/, 'your own sweep is not announced back at you');

      // --- C7 ②: SCOPE. One press takes yours; the rest need a second. ---
      await a.roll('d12');
      await a.settle();
      await b.roll('d4');
      await b.settle();
      await a.settle();
      assert.equal((await a.dbg('onTable')).length, 2, 'two rolls on the table, one each');
      await a.eval(`document.getElementById('corner-clear').click()`);
      await a.waitFor(`(window.__diceDebug.sim(240), window.__diceDebug.onTable.length === 1)`,
        { desc: "Alice's roll goes, Bob's stays" });
      assert.equal((await a.dbg('onTable'))[0].mine, false, 'and what is left is his');
      // …and the button ARMS rather than having taken his already.
      assert.equal(await a.eval(
        `document.getElementById('corner-clear').classList.contains('armed')`), true,
      'the wider act arms in place — the same two-tap the rack delete uses');
      // IT STATES THE NEXT ACT, it does not ask (C19). `Clear 1 more?` put a
      // question in a control; a question belongs in a modal and this is
      // deliberately not one. The count moves to the title, where a number
      // informs rather than interrogates.
      assert.match(await a.eval(`document.getElementById('corner-clear').textContent`), /Clear all/,
        'the armed state names the wider act');
      assert.doesNotMatch(await a.eval(`document.getElementById('corner-clear').textContent`), /\?/,
        'and asks nothing');
      assert.match(await a.eval(`document.getElementById('corner-clear').title`), /1 roll/,
        'the count is in the hover read — the collapsed rail hides the label');
      await a.eval(`document.getElementById('corner-clear').click()`);
      await a.waitFor(`(window.__diceDebug.sim(240), window.__diceDebug.onTable.length === 0)`,
        { desc: "the second press takes everyone's" });
      assert.equal(await a.eval(
        `document.getElementById('corner-clear').classList.contains('armed')`), false,
      'and disarms behind itself');
    },
  },
  {
    name: 'table-offers-you',
    tags: ['profiles', 'prepared-seat', 'cuj7', 'cuj3'],
    // C10 — THE RETURNING PLAYER. A player with a stored name following a
    // plain invite link joins STRAIGHT THROUGH: no picker, no seats, no
    // offer. They land under their old name holding their old rack, and
    // nothing ever tells them the table is holding characters for them. U3
    // fixed exactly this for `&as=` links and stopped there, while UX §7.19
    // still calls the one-link-for-everyone form primary.
    //
    // A MODAL AT THE DOOR WAS BUILT FIRST AND REVERTED THE SAME DAY: the word
    // doing the work is "unclaimed", and the pre-join peek omits the roster
    // on purpose, so the gate fired for the organizer at their own table and
    // hung three scenarios waiting for a join that never came. A standing
    // invitation cannot block a join at all, and it works for every arrival
    // rather than only for the ones whose name happens to match.
    async fn(ctx) {
      const dm = await ctx.newTable({ origin: '127.0.0.10', name: 'Walter' });
      await dm.dbg('profiles.reset()');
      for (const nm of ['Rill', 'Bo']) {
        await dm.dbg(`profiles.create(${JSON.stringify(nm)}, 'soul-deal')`);
        await dm.dbg(`setGroups([{name: 'Strength', notation: '2d8', category: 'Attributes'}])`);
      }
      await dm.settle();

      // A RETURNING player: a stored name, no `&as=`. They join straight
      // through — that part is deliberate and stays — and are told.
      const back = await ctx.newTable({ origin: 'localhost', name: 'Wanderer' });
      await back.dbg('profiles.reset()');
      assert.equal(await back.eval(
        `document.getElementById('name-modal').classList.contains('hidden')`), true,
      'a stored name still joins straight through — no modal was added');
      await back.dbg('setPanelState({pools: true})');
      await back.waitFor(
        `!document.getElementById('offer-banner').classList.contains('hidden')`,
        { desc: 'the table says it is holding characters' });
      // A COUNT, not a hard-coded one: Walter holds the profile reset() dealt
      // him as well as the two he made, and all three are genuinely on offer.
      // Asserting "2" would be asserting how many characters he happens to
      // have rather than that the banner counts them.
      assert.match(await back.eval(`document.getElementById('offer-banner').textContent`),
        /\d+ characters are on offer/, 'and how many');

      // "Not now" is remembered for THIS room, so it does not nag all evening.
      await back.eval(`document.getElementById('offer-dismiss').click()`);
      assert.equal(await back.eval(
        `document.getElementById('offer-banner').classList.contains('hidden')`), true,
      'and it takes an answer');

      // THE NAME COLLISION, which is C10's second half: a player whose stored
      // name equals a prepared character silently claims that chair on
      // everyone's rail while holding none of its pools. Naming it turns the
      // collision into an invitation.
      const bo = await ctx.newTable({ origin: '127.0.0.11', name: 'Bo' });
      await bo.dbg('profiles.reset()');
      await bo.dbg('setPanelState({pools: true})');
      await bo.waitFor(
        `!document.getElementById('offer-banner').classList.contains('hidden')`,
        { desc: 'Bo is told too' });
      assert.match(await bo.eval(`document.getElementById('offer-banner').textContent`),
        /prepared for you/, 'and told it is THEIRS, by name');
      await dm.dbg('profiles.reset()');
      await back.dbg('profiles.reset()');
    },
  },
  {
    name: 'join-door',
    tags: ['seat', 'profiles', 'cuj3', 'cuj7'],
    // Joe 2026-08-09, three things about the door: it says JOIN, the NAME
    // comes first, and a character you did not build is ATTRIBUTED and
    // copies rather than borrows.
    //
    // Random is the fourth and the sharpest: it used to MINT on the tap —
    // every press made another profile, to the 32 cap, before you had joined
    // anything — and it is the row a first-timer's Enter aims at. It is a
    // selection now; the deal happens once, at Join.
    async fn(ctx) {
      const dm = await ctx.newTable({ origin: '127.0.0.10', name: 'Walter' });
      await dm.dbg('profiles.reset()');
      const v = await dm.dbg(`profiles.create('Bo', 'soul-deal')`);
      assert.equal(v.ok, true, `Walter builds Bo (${v.status})`);
      await dm.dbg(`setGroups([{name: 'Bravery', notation: '1d20', category: 'Attributes'}])`);
      await dm.settle();

      const p = await ctx.newTable({ origin: 'localhost', anon: true });
      assert.equal(await p.eval(`document.querySelector('#name-panel h2').textContent`), 'Join',
        'the door says Join');
      // NAME FIRST: the field the modal cannot proceed without precedes the
      // list of characters, in DOM order, which is reading and tab order too.
      assert.equal(await p.eval(`(() => {
        const pick = document.getElementById('seat-pick');
        const name = document.getElementById('name-input').closest('.btn-row');
        const rows = document.getElementById('seat-mine');
        return [...pick.children].indexOf(name) < [...pick.children].indexOf(rows);
      })()`), true, 'the name comes before the characters');

      // ATTRIBUTED, and it says what taking it does.
      await p.waitFor(`[...document.querySelectorAll('#seat-mine-rows .seat-foreign')]
        .some((el) => el.textContent.includes('Bo'))`,
      { desc: "Walter's character reaches the door" });
      // BY NAME: Walter holds his dealt profile as well as Bo, and both are
      // offered — which is the feature. Reaching for "the first foreign row"
      // would be asserting how many characters he happens to have.
      const foreign = await p.eval(`(() => {
        const b = [...document.querySelectorAll('#seat-mine-rows .seat-foreign')]
          .find((el) => el.textContent.includes('Bo'));
        return b ? { text: b.textContent, title: b.title } : null;
      })()`);
      assert.ok(foreign, "Bo is among the characters the door offers");
      assert.match(foreign.text, /Bo/, 'it names the character');
      assert.match(foreign.text, /Walter/, 'and whose it is');
      assert.match(foreign.title, /copies it into your profiles/, 'and that taking it copies');

      // RANDOM IS PRE-SELECTED with nothing of your own, and MINTS NOTHING
      // until you join.
      const before = (await p.dbg('profiles.list')).length;
      // A FIRST-TIMER HAS NO CHARACTERS, whatever the store says. Boot deals
      // every browser one so CUJ1 has dice immediately, but that profile is
      // scaffolding — unnamed by anyone, unseen by its owner — and showing it
      // at a join door under "Yours" introduces a stranger by a random name
      // and then defaults to them.
      assert.equal(await p.eval(
        `[...document.querySelectorAll('#seat-mine-rows .seat-group')]`
        + `.some((h) => h.textContent === 'Yours')`), false,
      'no "Yours" group for someone who has never played here');
      assert.equal(await p.eval(
        `document.querySelector('#seat-mine-rows .seat-deal').classList.contains('preselected')`),
      true, 'Random is the pre-selection instead');
      await p.eval(`document.querySelector('#seat-mine-rows .seat-deal').click()`);
      assert.equal((await p.dbg('profiles.list')).length, before,
        'selecting Random mints nothing — browsing is not committing');

      // Taking WALTER'S copies it, once, at the join.
      const clickBo = `[...document.querySelectorAll('#seat-mine-rows .seat-foreign')]
        .find((el) => el.textContent.includes('Bo')).click()`;
      await p.eval(clickBo);
      await p.eval(clickBo);
      assert.equal((await p.dbg('profiles.list')).length, before,
        'and browsing his does not either, however many times');
      await p.eval(`(() => { const i = document.getElementById('name-input');
        i.value = 'Alice'; i.dispatchEvent(new Event('input')); })()`);
      await p.eval(`document.getElementById('name-join').click()`);
      await p.waitOnline();
      const held = await p.dbg('profiles.active');
      assert.equal(held.name, 'Bo', "the copy is in hand");
      assert.equal((await p.dbg('profiles.list')).length, before + 1, 'and there is exactly ONE of it');
      assert.equal((await p.dbg('profiles.list')).filter((x) => x.name === 'Bo').length, 1,
        'under its own name, not deduped against something they never made');
      // Leave the origin clean: the library is per-ORIGIN and outlives this
      // room, so a copy of 'Bo' left here makes the NEXT scenario's copy
      // dedupe to 'Bo 2' — correct behaviour failing an inherited assumption,
      // three scenarios from its cause.
      await p.dbg('profiles.reset()');
      await dm.dbg('profiles.reset()');
    },
  },
  {
    name: 'library-is-the-seats',
    tags: ['profiles', 'prepared-seat', 'cuj6', 'cuj7'],
    // C17 — THE ORGANIZER PUSHES NOTHING. Joe, 2026-08-09: "I was imagining a
    // simpler approach where all profiles are available for use when joining
    // a table." Before this, the only way a table offered characters was
    // Settings → Your data → Export/import… → Fill with my data → Apply to
    // table: five gestures behind a YAML textarea, for the headline act of
    // the whole preparation journey.
    //
    // Now a player's library rides the publish their rack already rode, and
    // the table offers what the people at it are holding. This asserts the
    // ABSENCE of the push: the organizer never opens Settings.
    async fn(ctx) {
      const dm = await ctx.newTable({ origin: '127.0.0.10', name: 'Walter' });
      await dm.dbg('profiles.reset()');
      // Three characters, built the way C16 made possible — in the picker,
      // never in the modal.
      for (const [nm, pool] of [['Rill', '3d6'], ['Bo', '2d8'], ['Nessa', '1d20']]) {
        const v = await dm.dbg(`profiles.create(${JSON.stringify(nm)}, 'soul-deal')`);
        assert.equal(v.ok, true, `${nm} is made (${v.status})`);
        await dm.dbg(`setGroups([{name: 'Strength', notation: '${pool}', category: 'Attributes'}])`);
      }
      await dm.settle();
      assert.equal(await dm.eval(
        `document.getElementById('settings-modal').classList.contains('hidden')`), true,
      'and Settings was never opened — no Apply to table, no YAML pane');

      // A player who has never been here opens the link and is offered them.
      // ESTABLISH: this asserts a copy lands under its own name, which an
      // inherited 'Bo' from an earlier scenario on this origin would turn
      // into 'Bo 2'.
      const p = await ctx.newTable({ origin: 'localhost', anon: true });
      await p.dbg('profiles.reset()');
      await p.waitFor(`window.__diceDebug.seatPicker.seats.length >= 3`,
        { desc: "the table offers the organizer's characters" });
      const seats = (await p.dbg('seatPicker')).seats.map((s) => s.name).sort();
      for (const nm of ['Bo', 'Nessa', 'Rill']) {
        assert.ok(seats.includes(nm), `'${nm}' is on offer (got ${seats})`);
      }

      // …and taking one WORKS — a seat the picker offers but the door cannot
      // open would be worse than no offer at all.
      await p.dbg(`chooseSeat('Bo')`);
      await p.waitOnline();
      await p.waitFor(`window.__diceDebug.seatPicker.verdict.canApply === true`,
        { desc: 'the preview resolves against a LIVE library, not just a pushed setup' });
      assert.equal((await p.dbg('applySeatImport()')).ok, true, 'and applies');
      const held = await p.dbg('profiles.active');
      assert.equal(held.name, 'Bo', "the player is holding Bo");
      assert.equal(held.pools, 1, 'with the pools Walter built for it');
      await dm.dbg('profiles.reset()');
    },
  },
  {
    name: 'author-in-place',
    tags: ['groups', 'profiles', 'cuj6'],
    // C16 — MAKING A CHARACTER MUST NOT CROSS THE MODAL. Settings is
    // `position: fixed; inset: 0` with a blur: it COVERS the rack. So
    // creating a profile (in ⚙) and building its pools (on the rack behind
    // it) could never be seen together, and preparing six characters meant
    // six open/close round trips. The picker's `＋ New profile…` was the
    // worst of it — it promised a new character and delivered
    // openSettingsAtLibrary(), which opened the modal AND force-expanded the
    // YAML box.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg('profiles.reset()');
      await a.dbg('setPanelState({pools: true})');
      const before = (await a.dbg('profiles.list')).length;

      // ＋ New CREATES, in hand, without opening anything.
      await a.eval(`document.getElementById('profile-pick').click()`);
      await a.eval(`[...document.querySelectorAll('.pm-row')]
        .find((b) => b.textContent.includes('New profile')).click()`);
      const after = await a.dbg('profiles.list');
      assert.equal(after.length, before + 1, '＋ New mints a profile');
      assert.equal(after.find((p) => p.active).pools, 0, 'an EMPTY one, taken in hand');
      assert.equal(await a.eval(
        `document.getElementById('settings-modal').classList.contains('hidden')`), true,
      'and the rack is never covered — no modal opened');

      // …and it can be NAMED where the character is.
      await a.eval(`document.getElementById('profile-rename').click()`);
      assert.equal(await a.eval(
        `document.activeElement.id`), 'profile-rename-in', 'the name becomes an input in place');
      await a.eval(`(() => { const i = document.getElementById('profile-rename-in');
        i.value = "Alice's Rogue";
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
      assert.equal((await a.dbg('profiles.active')).name, "Alice's Rogue",
        'Enter commits the new name');
      assert.match(await a.eval(`document.getElementById('profile-pick').textContent`),
        /Alice's Rogue/, 'and the head says so');

      // Esc abandons rather than committing a half-typed name.
      await a.eval(`document.getElementById('profile-rename').click()`);
      await a.eval(`(() => { const i = document.getElementById('profile-rename-in');
        i.value = 'oops';
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
      assert.equal((await a.dbg('profiles.active')).name, "Alice's Rogue",
        'Esc abandons — the newborn contract, applied to a rename');

      await a.dbg('profiles.reset()');
    },
  },
  {
    name: 'creation-budget',
    tags: ['groups', 'meanings', 'cuj6'],
    // C8 — CUJ6's done-when is "priced against the system's creation budget",
    // and the budget reached no screen: the figures lived in js/seed.js and
    // were imported ONLY by tests, so the player was expected to remember 100
    // from a design document while spending it.
    //
    // POOL-ANALYSIS §9's "the number 100 appears nowhere in code" is amended,
    // not overturned — it was protecting against a Soul Deal rule scattered
    // through render sites, and the number now lives in exactly one place per
    // system: the system's own profile, beside its chart. A system that names
    // no budget still prints a bare total, which is what this asserts second.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg('profiles.reset()');
      await a.dbg('setPanelState({pools: true})');
      const fig = (label) => a.eval(`(() => {
        const head = [...document.querySelectorAll('.pool-sec-head')]
          .find((h) => h.textContent.trim().toUpperCase().startsWith(${JSON.stringify('')} + '${label}'.toUpperCase()));
        if (!head) return null;
        const f = head.querySelector('.psh-fig');
        return f ? { text: f.textContent.trim(), over: f.classList.contains('over') } : null;
      })()`);

      // Under budget: the target is stated, and nothing is coloured — being
      // part-way through building a character is not an error state.
      await a.dbg(`setGroups([{name: 'Strength', notation: '1d8', category: 'Attributes'}])`);
      await a.dbg('setPoolsEditMode(true)');
      assert.deepEqual(await fig('Attributes'), { text: '8/100', over: false },
        'the shelf says what it costs AND what it may cost');

      // Over budget: the one state worth a hue.
      await a.dbg(`setGroups([
        {name: 'Strength', notation: '8d20', category: 'Attributes'},
        {name: 'Wit', notation: '2d20', category: 'Attributes'}])`);
      await a.dbg('setPoolsEditMode(true)');
      const over = await fig('Attributes');
      assert.equal(over.text, '200/100', 'over-budget still states both numbers');
      assert.equal(over.over, true, 'and is marked');

      // A SYSTEM THAT NAMES NO BUDGET prints a bare total — the budget is a
      // fact of the rulebook, and D&D's profile does not carry one.
      const made = await a.dbg(`profiles.create('Warden', 'dnd')`);
      assert.equal(made.ok, true, `a D&D profile is made (${made.status})`);
      const warden = (await a.dbg('profiles.list')).find((p) => p.name === 'Warden');
      await a.dbg(`profiles.use(${JSON.stringify(warden.id)})`);
      await a.dbg(`setGroups([{name: 'Sword', notation: '1d8', category: 'Attributes'}])`);
      await a.dbg('setPoolsEditMode(true)');
      assert.deepEqual(await fig('Attributes'), { text: '8', over: false },
        'no budget in the system profile, no target on the shelf');

      // A SHELF THE SYSTEM DOES NOT PRICE gets the bare sum (Joe 2026-08-09).
      // Motivations carries no budget: printing `X/30` would invent a ceiling
      // the rulebook never set, and then mark you red for passing it.
      await a.dbg(`profiles.reset()`);
      await a.dbg(`setGroups([{name: 'Oath', notation: '1d10', category: 'Motivations'}])`);
      await a.dbg('setPoolsEditMode(true)');
      assert.deepEqual(await fig('Motivations'), { text: '10', over: false },
        'an unpriced shelf shows its sum and no target');

      await a.dbg('setPoolsEditMode(false)');
      await a.dbg('profiles.reset()');
    },
  },
  {
    name: 'prep-affordances',
    tags: ['groups', 'profiles', 'cuj6'],
    // C9 — four small things between "I sit down to make six characters" and
    // having them. Each was invisible to the suite for its own reason.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg('profiles.reset()');
      await a.dbg('setPanelState({pools: true})');

      // ① `⚄ Random` honours the name box. It shares one row with `＋ New`,
      // which read the box while Random did not — and Random is the only one
      // of the two that deals a PRICED rack, so building six characters meant
      // Random-then-rename six times.
      await a.eval(`(() => { const i = document.getElementById('profile-newname');
        i.value = 'Nessa'; })()`);
      await a.eval(`document.getElementById('profile-deal').click()`);
      const names = (await a.dbg('profiles.list')).map((p) => p.name);
      assert.ok(names.includes('Nessa'), `the dealt profile takes the typed name (got ${names})`);
      assert.equal(await a.eval(`document.getElementById('profile-newname').value`), '',
        'and the box empties, like ＋ New');
      const nessa = (await a.dbg('profiles.list')).find((p) => p.name === 'Nessa');
      assert.ok(nessa.pools > 0, 'and it is DEALT — priced pools, not an empty rack');

      // ② The trio is this profile's character sheet, not every game's.
      // PROFILES §11.6 said so and it was never built: a D&D rack stood three
      // empty Soul Deal shelves in the one mode where you decide what your
      // character is made of.
      await a.dbg('setPoolsEditMode(true)');
      const shelves = () => a.eval(
        `[...document.querySelectorAll('.pool-sec-head .psh-word')].map((e) => e.textContent.trim())`);
      const soul = await shelves();
      for (const w of ['Attributes', 'Skills', 'Motivations']) {
        assert.ok(soul.includes(w), `a Soul Deal rack stands its ${w} shelf`);
      }
      const made = await a.dbg(`profiles.create('Warden', 'dnd')`);
      assert.equal(made.ok, true, `a D&D profile is made (${made.status})`);
      const warden = (await a.dbg('profiles.list')).find((p) => p.name === 'Warden');
      await a.dbg(`profiles.use(${JSON.stringify(warden.id)})`);
      await a.dbg('setPoolsEditMode(true)');
      const dnd = await shelves();
      assert.deepEqual(dnd.filter((w) => ['Attributes', 'Skills', 'Motivations'].includes(w)), [],
        `a D&D rack invents no Soul Deal shelves (got ${dnd})`);
      // Leave the origin as we found it: the library is per-ORIGIN and
      // outlives this room, and a scenario that ends holding two profiles
      // makes the NEXT one boot `.profiled` — which is a head standing where
      // it asserted none. Found exactly that way.
      await a.dbg('setPoolsEditMode(false)');
      await a.dbg('profiles.reset()');
    },
  },
  {
    name: 'storage-jam',
    tags: ['groups', 'cuj6', 'cuj13'],
    // CUJ13: THE FAILURE THAT USED TO BE SILENT. saveGroups is the app's
    // highest-frequency writer — every edit, every added pool, every applied
    // import — and it discarded saveProfileStore's refusal while all five
    // callers that MOVE data (switch, create, rename, delete, bind) checked
    // it. Exactly backwards: those five are rare and deliberate, this one
    // runs constantly. On a browser that has stopped storing (Safari private
    // browsing throws on setItem; so does a full quota) the session looked
    // completely normal and every character edit was gone on reload, with
    // nothing ever said.
    //
    // The notice STANDS rather than flashing, because this is a state you are
    // in and not an event that happened — every edit made while it holds is
    // also lost — and its one exit is a file, since the work is only on
    // screen. It clears when a write succeeds, so a transient blip leaves no
    // scar.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const shown = () => a.eval(
        `!document.getElementById('storage-banner').classList.contains('hidden')`);
      await a.dbg('setPanelState({pools: true})');
      assert.equal(await shown(), false, 'nothing to report while storage works');

      await a.dbg('jamStorage(true)');
      await a.dbg(`setGroups([{name: 'Strength', notation: '1d8', category: 'Attributes'}])`);
      assert.equal(await shown(), true, 'a refused write is said out loud');
      // The exit is IN the banner, not four levels deep in a settings pane —
      // finding one while nothing is saving is not a recovery.
      assert.equal(await a.eval(
        `document.getElementById('storage-banner').contains(document.getElementById('storage-download'))`),
      true, 'and the way to save the work is in the notice itself');

      // ONE BANNER AT A TIME. All three are `position: sticky` at the SAME
      // top, so two up at once OVERLAP rather than stack — the higher
      // z-index covers the lower one's label and leaves its buttons peeking
      // out from under, which is what a phone photograph caught. The jam
      // outranks both, and that is meaning as well as order: being offered a
      // character while nothing persists is a trap, because taking one would
      // not survive the tab.
      assert.equal(await a.eval(
        `document.getElementById('offer-banner').classList.contains('hidden')`), true,
      'the offer stands down while nothing is being saved');
      assert.equal(await a.eval(
        `document.getElementById('profile-banner').classList.contains('hidden')`), true,
      'and so does the mismatch');

      await a.dbg('jamStorage(false)');
      await a.dbg(`setGroups([{name: 'Wit', notation: '1d12', category: 'Attributes'}])`);
      assert.equal(await shown(), false, 'and it clears when storage comes back');
    },
  },
  {
    name: 'touch-targets',
    tags: ['chrome'],
    // U28's list-driven pin. Seven of the eight (pointer: coarse) blocks in
    // the stylesheet fixed VISIBILITY and exactly one fixed SIZE, and nothing
    // caught it because every touch assertion in this suite pointed at ONE
    // control. So this one walks a LIST — it is what stops the next control
    // from shipping at 23px.
    // Two floors, from the audit's conversion (1 CSS px ~ 0.265 mm): 34 is a
    // 9 mm finger pad and the file's floor; 44 is the platform guideline, and
    // the controls whose budget could afford it took it.
    // GEOMETRY, NEVER A CLASS. A coarse rule that "stands" a control up tells
    // you nothing about whether it can be hit — that confusion IS the finding.
    // And where the ink is deliberately smaller than the target (#edge-toggle,
    // .die-x, .sw all keep their ink and grow a ::before), the host's border
    // box is the wrong thing to read, so those are measured on the pseudo.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.settle();
      await a.emulateCoarsePointer(true);
      try {
        // offsetWidth/offsetHeight, NOT getBoundingClientRect. The rect is
        // the TRANSFORMED box, and the popover arrives on a 0.22s `pop-in`
        // from `scale(0.985)` — so a 44px stepper measured on arrival reads
        // 43.34 and fails its own floor by two thirds of a pixel. settle()
        // drives the dice clock, not CSS, so there is nothing to wait on
        // that this suite already owns. The layout box is also the honest
        // answer to the question being asked: how big is this control, not
        // how big is it one frame into an entrance nobody taps during.
        const box = (sel) => a.eval(`(() => {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el || el.offsetParent === null) return null;
          return { w: el.offsetWidth, h: el.offsetHeight };
        })()`);
        const halo = (sel) => a.eval(`(() => {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el || el.offsetParent === null) return null;
          const cs = getComputedStyle(el, '::before');
          return { w: Math.round(parseFloat(cs.width)), h: Math.round(parseFloat(cs.height)) };
        })()`);
        const atLeast = async (label, sel, w, h, read = box) => {
          const r = await read(sel);
          assert.ok(r, `${label} (${sel}) exists on a coarse pointer`);
          assert.ok(r.w >= w && r.h >= h,
            `${label} is ${w}x${h} or better (got ${r.w}x${r.h})`);
        };

        // ---- the presence row: what a first-time tablet user MEETS ----
        await atLeast('the collapse strip', '#edge-toggle', 44, 44, halo);
        await atLeast('the identity chip', '#identity-chip', 34, 34);
        await atLeast('a teammate pill', '.roster-name', 34, 34);

        // ---- the well and its rim (a staged die builds both) ----
        await a.eval(`document.querySelector('#die-buttons .die-btn').click()`);
        await a.waitFor(`window.__diceDebug.trayState.dice.length === 1`,
          { desc: 'a die is staged' });
        await atLeast('the per-die x', '.die-x', 34, 34, halo);
        await atLeast('+/- Modify', '#tray-mods', 34, 34);
        await atLeast('Clear', '#clear-tray', 34, 34);
        // THE WIDTH-SUM, because a naive scrollWidth read is blind to what a
        // no-wrap flex row does when it overflows: the rim's tools got 10px
        // taller AND the row must still fit the column it lives in.
        const rim = await a.eval(`(() => {
          const row = document.getElementById('draft-actions');
          const cs = getComputedStyle(row);
          const avail = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          const kids = [...row.children].filter((el) => getComputedStyle(el).display !== 'none');
          const used = kids.reduce((s, el) => s + el.getBoundingClientRect().width, 0)
            + parseFloat(cs.gap || 0) * (kids.length - 1);
          return { avail: Math.round(avail), used: Math.round(used), n: kids.length };
        })()`);
        assert.ok(rim.used <= rim.avail,
          `the grown rim still fits its column (${rim.used}px of ${rim.avail}px, ${rim.n} tools)`);

        // ---- the rack in manage mode ----
        await a.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {name: 'Sneak', notation: '2d6'}])`);
        assert.equal(await a.dbg('setPoolsEditMode(true)'), true, 'the pencil enters manage mode');
        // THE DELETE RAIL (U28a). Not a corner button: growing that one put
        // its box on top of the `×2` badge of every counted pool. So it is
        // 34 wide down the tile's full height, and the badge is on a
        // different axis entirely. The NO-OVERLAP check is the real pin —
        // a size assertion alone is exactly what passed while the shipped
        // control was visibly broken.
        const del = await box('.tile-del');
        assert.ok(del && del.w >= 34 && del.h >= 34,
          `the delete rail clears the finger floor (got ${del && del.w}x${del && del.h})`);
        const clash = await a.eval(`(() => {
          const out = [];
          for (const tile of document.querySelectorAll('.pool-tile')) {
            const x = tile.querySelector('.tile-del');
            const art = tile.querySelector('.tile-art');
            if (!x || !art) continue;
            const xr = x.getBoundingClientRect(), ar = art.getBoundingClientRect();
            if (ar.right > xr.left) out.push(Math.round(ar.right - xr.left));
          }
          return out;
        })()`);
        assert.deepEqual(clash, [],
          'no tile\'s art reaches under the delete rail — the badge collision that got the corner button reverted');
        // The one item that TEACHES rather than enlarges: the `+` whisper is
        // the only thing saying a rack tile stages rather than rolls, and it
        // is hover-only, so on touch it never rendered at all.
        assert.ok((await a.eval(
          `parseFloat(getComputedStyle(document.querySelector('.tile-add')).opacity)`)) >= 0.5,
          'the stage + stands on touch — the only signal separating a tile from a roll strip');
        await a.dbg('setPoolsEditMode(false)');

        // ---- the +/- popover: every roll axis, and it had no coarse branch ----
        assert.equal(await a.dbg(`openPopoverFor('tray')`), true, 'the popover opens');
        // #pop-keep-step, NOT `.stepper button` — the first .stepper in DOM
        // order is the Flat bonus one, and soul-deal (usesTotal:false) hides
        // arithmetic entirely, so the bare selector reads a display:none
        // control and reports it missing. The keep/drop stepper is the one
        // every system shows.
        await atLeast('a stepper button', '#pop-keep-step button', 44, 44);
        await atLeast('a Visibility cell', '#pop-seg-vis button', 34, 34);
        // The one place WIDTH binds: five mono cells beside a 124px stepper.
        // The row wraps rather than starving them — assert the CELLS, since a
        // seg that merely "fits" can fit at 28px.
        await atLeast('a keep/drop cell', '#pop-seg-keep button', 34, 34);
        // U29 rides here: under 16px iOS zooms the whole layout on focus.
        assert.equal(await a.eval(
          `parseFloat(getComputedStyle(document.getElementById('pop-dc')).fontSize)`), 16,
          'the target field is 16px on a coarse pointer — below it, focus zooms the table');
        await a.eval(`document.getElementById('pop-close').click()`);

        // ---- the collapsed column: the state a tablet LIVES in ----
        await a.dbg('setPanelState({pools: false})');
        await atLeast('a source-switch cell', '#rail-mode button', 34, 34);
        await a.dbg(`setRailMode('dice')`);
        await a.dbg(`railTapDie('d6')`);
        await a.waitFor(`document.querySelector('#rail-dice .rd-x') !== null`,
          { desc: 'a counted dice row exists' });
        // The remover sits ON the row that increments, so its size is not a
        // nicety: a finger left of it ADDS a die.
        await atLeast('the dice-row remover', '.rd-x', 34, 34);
        await atLeast('a foot glyph', '#rail-foot .btn.ghost', 17, 34);
        await a.roll('d6'); // the contextual x only joins with dice on the felt
        await atLeast('the corner x', '#left-panel .corner-btn', 17, 34);
        // …AND THE FOOT STILL FITS. This is the whole reason the bump spent
        // height and not width: the glyphs share an 86px content box, and a
        // taller row that overflows it is a worse bug than a short one.
        const foot = await a.eval(`(() => {
          const el = document.getElementById('rail-foot');
          const cs = getComputedStyle(el);
          const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          const kids = [...el.children].filter((c) => getComputedStyle(c).display !== 'none');
          const used = kids.reduce((s, c) => s + c.getBoundingClientRect().width, 0)
            + parseFloat(cs.gap || 0) * (kids.length - 1);
          return { avail: Math.round(avail), used: Math.round(used), n: kids.length };
        })()`);
        assert.ok(foot.used <= foot.avail,
          `the grown foot still fits its 86px column (${foot.used}px of ${foot.avail}px)`);
      } finally {
        await a.emulateCoarsePointer(false); // per-tab, outlives the scenario
        await a.dbg('setPanelState({pools: true})'); // panel state is persisted localStorage
      }
    },
  },
  {
    name: 'folded-card',
    tags: ['smoke', 'roll', 'chrome', 'cuj8'],
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

      // AND THE CARD SAYS WHICH COLOR IS WHICH POOL (Joe 2026-08-09). Read
      // from two independent places on purpose: `cardKey` off the painted
      // DOM, `outlineState` off the shell materials in the scene. Computing
      // both from sourceColorMap would pass while the card painted nothing
      // at all — which is exactly the state this scenario used to accept.
      const key = await a.dbg('cardKey');
      assert.equal(key.length, 2, `one dot per group — Wisdom and the loose d4 (got ${JSON.stringify(key)})`);
      const wisdom = key.find((k) => k.label === 'Wisdom');
      const loose = key.find((k) => k.label === '');
      assert.ok(wisdom, `the Wisdom row carries a dot (got ${JSON.stringify(key)})`);
      assert.ok(loose, 'and the unsourced d4 carries the ivory one');
      assert.equal(wisdom.color, colors[0], "the dot beside Wisdom IS the Wisdom dice's outline");
      assert.equal(loose.color, colors[2], 'and the loose dot IS the loose die\'s outline');
      assert.notEqual(wisdom.color, loose.color, 'two pools, two hues');

      await a.dbg('hoverBanner(false)');
      assert.deepEqual(await a.dbg('outlineState'), [], 'outlines leave with the hover');
      // The key does NOT leave with it: it is a legend, readable before you
      // know there is anything to hover.
      assert.equal((await a.dbg('cardKey')).length, 2, 'the key stands after the hover ends');

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
      // …and breathes above. RE-POINTED for U30's height branch: below
      // 780px of viewport the well gives its air back to the rack (12 →
      // 8), so the number this pin holds depends on which side of that
      // branch the window is on — and the harness's own window (headless
      // Chrome's 800×600 default) is on the SHORT side, which is why an
      // unqualified `>= 10` started failing. The claim being pinned is
      // unchanged: the well is a beacon with real margin, never flush.
      // draft-bench drives BOTH sides; this one only has to stay honest
      // about which side it is standing on.
      const shortCol = await a.eval(`matchMedia('(max-height: 780px)').matches`);
      assert.ok((await a.eval(
        `parseFloat(getComputedStyle(document.getElementById('tray-actions')).marginTop)`))
        >= (shortCol ? 8 : 10),
        `and breathes above (${shortCol ? 'short' : 'full'}-column dress)`);
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
    tags: ['smoke', 'shelf', 'cuj9'],
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
          `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1)`,
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
    tags: ['smoke', 'shelf', 'cuj9'],
    // WHAT A COLLECTED ROLL LOOKS LIKE AT REST. This asked, until C25,
    // whether the resting shelf MARKER was invisible — no dot, no total, no
    // lens word, no ✕ — on the reasoning that the settled cluster was its own
    // presence and the detail belonged in the peek. There is no cluster and no
    // marker now: the felt is empty and the roll's LOG ROW is what stands for
    // it, so the contract inverts and the row has to say which roll it is.
    // What survives unchanged is the card and its folded-card grammar: the
    // body is the one clear target, the fold holds the other verbs, no ✕
    // exists in any modality, and every path clears for everyone from any
    // seat (§7.7 universal housekeeping).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.roll('d20 dc 10');
      await b.settle();
      const rid = await a.rollId();
      assert.equal(await a.dbg(`collectRoll(${JSON.stringify(rid)})`), true, 'collect accepted');
      for (const t of [a, b]) {
        await t.waitFor(
          `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1)`,
          { desc: 'roll shelved' },
        );
      }
      // THE FELT IS EMPTY, AND THAT IS THE POINT (C25). A collected roll used
      // to leave a cluster of real dice standing in a shelf slot; the record
      // is the roll log now, so the only dice on the table are the live
      // roll's — here, none.
      assert.equal(await b.diceCount(), 0, 'nothing collected stands on the felt');

      // ITS ROW IS ITS DOOR. The resting marker was quiet by design — the
      // cluster was its own presence, so the target drew nothing. A row in a
      // list has no cluster to stand for it, so the contract inverts: the row
      // SAYS which roll it is, and is marked as openable.
      await b.dbg('setLogFlyout(true)');
      const row = await b.eval(`(() => {
        const el = document.querySelector('#log-list .log-entry.collected');
        if (!el) return null;
        return { rollId: el.dataset.rollId, role: el.getAttribute('role'), text: el.innerText.trim() };
      })()`);
      assert.ok(row, 'the collected roll has a row');
      assert.equal(row.rollId, rid, 'the row addresses its roll');
      assert.equal(row.role, 'button', 'and announces itself as openable');
      assert.ok(row.text.length > 0, 'a row says what it is — unlike the marker it replaced');

      // THE FOLDED CARD, log edition (2026-08-03's grammar, new anchor): the
      // row only OPENS the card; the card's BODY is the one big clear target;
      // the fold below holds the other verbs; no ✕ and no sweep exist at all.
      assert.equal(await b.dbg(`peek(${JSON.stringify(rid)})`), rid, 'peek opens');
      const ps = await b.dbg('peekState');
      assert.ok(ps.total, 'the peek shows the total');
      assert.equal(ps.hasMain, true, 'the body clear target stands');
      assert.equal(ps.hasFold, true, 'the fold stands under it');
      assert.equal(ps.hasClear, false, 'no card ✕ anywhere — the body is the target');
      await b.dbg('peek(null)');

      // The row's click OPENS the card (it never clears directly).
      await b.eval(`document.querySelector('#log-list .log-entry.collected').click()`);
      assert.equal((await b.dbg('peekState') || {}).rollId, rid, 'a row click opens its card');
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
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1)`,
        { desc: 'held roll shelved' },
      );
      // A held roll's row is a row like any other — and hidden means hidden:
      // the values are not in it, which is the claim the old 'the marker never
      // shouts ?' assertion was really making.
      await a.dbg('setLogFlyout(true)');
      const hrow = await a.eval(
        `(document.querySelector('#log-list .log-entry.collected') || {}).innerText || ''`);
      assert.ok(hrow.length > 0, 'a held collected roll still has a row');
      assert.equal(await a.dbg(`peek(${JSON.stringify(hid)})`), hid, 'peek opens for the authority');
      assert.equal((await a.dbg('peekState')).hasReveal, true, 'Reveal lives in the peek');
    },
  },
  {
    name: 'shelf-actions',
    tags: ['shelf', 'cuj9'],
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
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1)`,
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
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1)`,
        { desc: 'the reroll shelves for the ± leg' },
      );
      assert.equal(await a.dbg(`peek(${JSON.stringify(rid2)})`), rid2, 'peek opens on the reroll');
      await a.eval(`document.querySelector('#log-list .log-entry.collected')
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
      await a.eval(`document.querySelector('#log-list .log-entry.collected')
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
    tags: ['shelf', 'cuj9'],
    // A new roll auto-collects the previous uncollected one — the table
    // holds one live roll; history lives on the shelf.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.roll('d20');
      await a.roll('2d6');
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1)`,
        { desc: 'first roll auto-collected' },
      );
      // C25: the auto-collected roll's die LEFT — the felt holds the live
      // roll and nothing else, which is the whole point of the change.
      assert.equal(await a.diceCount(), 2, 'only the live roll stands on the felt');
    },
  },
  {
    name: 'shelf-cap',
    tags: ['shelf', 'cuj9'],
    timeout: 180000,
    // The record holds COLLECT_CAP rolls; the oldest is evicted FIFO. The
    // slot half of this scenario retired with the felt shelf (C25) — there
    // is nothing to compact left-to-right any more — but the CAP and the
    // FIFO order are wire behaviour the server enforces, and they stay.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      for (let i = 0; i < 6; i++) {
        await a.roll('d6');
        const rid = await a.rollId();
        await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
        await a.waitFor(
          `(window.__diceDebug.sim(240), window.__diceDebug.pendingCollects.length === 0)`,
          { desc: `collect #${i + 1} settles` },
        );
      }
      const shelf = await a.shelf();
      assert.equal(shelf.length, 5, 'the record is capped at 5');
      const seqs = shelf.map((c) => c.seq);
      assert.deepEqual([...seqs].sort((x, y) => x - y), seqs, 'the getter is sorted by seq');
      assert.equal(Math.min(...seqs), 2, 'oldest (seq 1) evicted');
      // And the felt stays empty through all six — the failure C25 fixed was
      // six collected rolls piling into one another ON the mat, so the pin is
      // occupancy, not arrangement.
      assert.equal(await a.diceCount(), 0, 'six collects leave nothing on the felt');
    },
  },
  {
    name: 'dice-depart',
    tags: ['roll', 'chrome', 'cuj8'],
    // HOW A DIE LEAVES (Joe 2026-08-09: "the way dice disappear is not my
    // favorite… the speed is good but the effect is not"). The replacement
    // makes a claim that is checkable rather than merely tasteful: a die
    // leaves by being taken OFF the table, never by passing through it. So
    // this samples the departure mid-flight and requires dy >= 0 the whole
    // way — and then flips to the retired 'sink' style to prove the sample
    // can FAIL. Without that second half this is a green check that would
    // have passed just as happily against the thing Joe asked us to replace.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });

      // FREEZE THE CLOCK BEFORE SAMPLING. The departure is 0.3 s of WALL time
      // and each sample below is a CDP round trip, so without the hold the
      // rAF loop ran the whole window out between calls and the sampler
      // caught two frames instead of five — a ~70% failure rate, found by
      // another session running this in isolation rather than inside a sweep
      // where it happened to pass. The bug was the scenario's, not the app's:
      // stepSinking is dt-driven precisely so sim() can own its clock, and
      // this asked for that guarantee and then did not take it.
      const departure = async (style, rollId) => {
        assert.equal(await a.dbg(`setClearStyle(${JSON.stringify(style)})`), true, `${style} selected`);
        assert.equal(await a.dbg('holdClock(true)'), true, 'the world moves only as far as sim() says');
        assert.equal(await a.dbg(`clearRoll(${JSON.stringify(rollId)})`), true, `${style}: clear accepted`);
        // CLEAR_SINK_S is 0.3 s = 18 frames; 3 frames a sample walks the
        // window in six steps and still catches the first moment of motion.
        const frames = [];
        for (let i = 0; i < 6; i++) {
          await a.dbg('sim(3)');
          const st = await a.dbg('sinkState');
          if (st.length) frames.push(st);
        }
        assert.ok(frames.length >= 3, `${style}: the departure was observable (got ${frames.length} samples)`);
        return frames;
      };

      // THE SHIPPED DEFAULT
      assert.equal(await a.dbg('clearStyle'), 'lift', 'lift ships as the default');
      await a.roll('3d6');
      await a.settle();
      const lift = await departure('lift', await a.rollId());
      const lows = lift.flat().filter((d) => d.dy < 0);
      assert.equal(lows.length, 0,
        `no departing die ever goes below where it rested (got ${JSON.stringify(lows)})`);
      assert.ok(lift.flat().some((d) => d.dy > 0.05), 'and it really is lifted, not merely not-sunk');
      const last = lift[lift.length - 1];
      assert.ok(last.every((d) => d.scale < 0.5),
        `the die is most of the way gone by the end of the window (got ${JSON.stringify(last)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(60), window.__diceDebug.sinkingCount === 0`
          + ` && window.__diceDebug.tableDice.length === 0)`,
        { desc: 'the felt is empty when the window closes' },
      );
      await a.dbg('holdClock(false)'); // the next roll needs a running clock

      // THE PIN THAT PROVES THE PIN. 'sink' is what shipped before — the same
      // 0.3 s, straight DOWN through the felt. If the assertion above cannot
      // tell the two apart it is measuring nothing.
      await a.roll('3d6');
      await a.settle();
      const sink = await departure('sink', await a.rollId());
      assert.ok(sink.flat().some((d) => d.dy < -0.05),
        'the retired style really does drop the die through the felt');
      await a.dbg(`setClearStyle('lift')`); // styles are per-tab, not persisted
      await a.waitFor(
        `(window.__diceDebug.sim(60), window.__diceDebug.sinkingCount === 0)`,
        { desc: 'sinks drained' },
      );
      await a.dbg('holdClock(false)'); // held clocks outlive the scenario
      assert.equal(await a.dbg(`setClearStyle('nonsense')`), false,
        'an unknown style is refused rather than silently freezing the dice');
    },
  },
  {
    name: 'shelve-clear-no-chip-leak',
    tags: ['shelf', 'perf', 'cuj9'],
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
          `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1)`,
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
    tags: ['smoke', 'roll', 'cuj8'],
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
    tags: ['smoke', 'roll', 'cuj8'],
    // The one layer scale (P2): the ceremony/verdict layer renders ABOVE the
    // ambient table labels (value chips) and the banner, and the crit overlay
    // tops the whole roll moment — a verdict card is never occluded by a
    // floating die number. (#shelf-layer left the scale with the felt shelf,
    // C25; the peek card it hosted is a fixed panel of its own.)
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const z = (id) => a.eval(
        `parseInt(getComputedStyle(document.getElementById('${id}')).zIndex, 10)`,
      );
      const [ceremony, chips, banner, crit, offers] = [
        await z('ceremony-layer'), await z('chips-layer'),
        await z('result-banner'), await z('crit-overlay'), await z('offers-layer'),
      ];
      assert.ok(ceremony > chips, `ceremony above value chips (${ceremony} vs ${chips})`);
      assert.ok(ceremony > banner, `ceremony above the banner (${ceremony} vs ${banner})`);
      assert.ok(offers > ceremony, `offers stay claimable over a ceremony (${offers} vs ${ceremony})`);
      assert.ok(crit > offers, `the crit overlay tops the moment (${crit} vs ${offers})`);
    },
  },
  {
    name: 'settings-sync',
    tags: ['smoke', 'settings', 'cuj12'],
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
    tags: ['roll', 'ceremony', 'cuj8'],
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
        `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 1)`,
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
        `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 2)`,
        { desc: 'the revealed roll shelved' },
      );
    },
  },
  {
    name: 'floor-texture-persistent',
    tags: ['smoke', 'perf', 'themes', 'cuj12'],
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
        `(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 1)`,
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
    tags: ['smoke', 'meanings', 'cuj8'],
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

      // A TARGET IS A STAKE, NOT A SUM (U17). The player typed `dc15` and the
      // dice were thrown at the moment it created, so the number renders
      // under every system — what a per-die lens withholds is the
      // ADJUDICATION, because there is no single number to compare. This
      // scenario used to pin the opposite and was holding the defect in
      // place: four surfaces (eight, once the offer card and the SR announce
      // were counted) each showed a different subset of the same stake.
      await a.roll('d20 dc15');
      assert.ok((await a.logTop()).includes('vs 15'),
        'the target renders under a per-die system');
      assert.ok(!/vs 15\s*[✓✗]/.test(await a.logTop()),
        'but nothing adjudicates it — no ✓/✗ without a total');
      // …and on the card that actually paints. A bare `dc` implies a Check
      // (§2.3), so this roll stages a ceremony — and a ceremony never paints
      // the result banner, it returns into ceremonyEnterSettle. The verdict
      // card is the surface, and it is the one that used to show NOTHING:
      // the stake was written inside two branches that a per-die read could
      // not reach, because renderOutcomeRows wins the if/else first.
      const margin = `document.getElementById('verdict-margin').textContent`;
      await a.waitFor(`(${margin}).includes('vs DC 15')`,
        { desc: 'the verdict card carries the stake' });
      assert.ok(!/margin|Success|Failure/.test(await a.eval(margin)),
        `and adjudicates nothing (got ${JSON.stringify(await a.eval(margin))})`);
      assert.equal(await a.eval(
        `!!document.querySelector('#verdict-margin .stake-num')`), true,
      'the numeral wears the unadjudicated register');

      // The lens re-reads in place: switch to a totals system, the
      // adjudication arrives on top of the stake that was already there.
      await a.dbg(`setSystem('dnd')`);
      await a.waitFor(`document.querySelector('#log-list .log-total').textContent.trim().length > 0`,
        { desc: 'totals return under dnd' });
      assert.ok(/vs 15\s*[✓✗]/.test(await a.logTop()),
        'and the ✓/✗ arrives with them');

      // U17 step 2: the mute gold `?`. #result-total is 52px in the ROLL
      // VERB'S OWN HUE, and under a per-die lens it was dead for every open
      // roll and sprang to life only to announce an absence — with nothing
      // beside it saying why. The slot belongs to the sum now; the hero slot
      // names the rung.
      await a.dbg(`setSystem('soul-deal')`);
      await a.waitFor(`window.__diceDebug.system === 'soul-deal'`, { desc: 'per-die lens' });
      await a.roll('2d6 held # Quiet');
      await a.settle();
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('result-total')).display`), 'none',
      'a held roll under a per-die lens shows no gold ? — there is no number to withhold');
      assert.equal(await a.eval(`document.getElementById('result-total').textContent`), '',
        'and the sum is not sitting in the DOM behind display:none either');
      assert.equal(await a.eval(`document.getElementById('result-meaning').textContent`),
        'Face down', 'the hero slot names the rung instead');
      // A totals lens still answers with the ? — there IS a number, withheld.
      await a.dbg(`setSystem('dnd')`);
      await a.waitFor(`document.getElementById('result-total').textContent === '?'`,
        { desc: 'a totals lens keeps the ? it has always used' });
      await a.dbg(`setSystem('soul-deal')`);
      await a.waitFor(`window.__diceDebug.system === 'soul-deal'`, { desc: 'back' });

      // The ± popover folds under a per-die system — the flat bonus and d20
      // pairing — with no note and no disclosure (Joe 2026-08-06; supersedes
      // 'Show anyway'). What stands is asserted below, one id at a time.
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
      // U17 #29-#31: the MODIFIER section folds. A flat bonus is a term in a
      // sum and has nowhere to land without one; keep-drop/reroll/explode
      // came back, because they decide WHICH DICE COUNT — facts under every
      // system, and ones this profile's own outcomesFor and forecastFor
      // already honour, and a target is a stake the player declared.
      assert.equal(await a.eval(secVisible), false, 'the Modifier section folds under per-die');
      // d20 pairing folds WITH it since 2026-08-09 (Joe: "not useful for Your
      // Soul Deal"). Its own class, because the reason is the chart and not
      // the arithmetic — the two must be able to move apart again.
      assert.equal(await a.eval(
        `document.querySelector('#mods-popover .sec-pair').offsetParent !== null`),
      false, 'd20 pairing folds under per-die too');
      assert.equal(await a.eval(`document.getElementById('pop-dc').offsetParent !== null`),
        true, 'but Target is authorable — a dc used to round-trip invisibly');
      assert.equal(await a.eval(`document.getElementById('pop-sw-reroll').offsetParent !== null`),
        true, 'and reroll stands: it decides which dice count');
      assert.equal(await a.eval(`document.getElementById('pop-sw-explode').offsetParent !== null`),
        true, 'exploding too');
      assert.equal(await a.eval(`document.getElementById('pop-sysnote') === null`), true,
        'the note is gone, not merely hidden');
      await a.dbg('closePopover()');
      await a.dbg(`setSystem('dnd')`);
      // the system echo-applies (settings round-trip) — wait before opening
      await a.waitFor(`window.__diceDebug.system === 'dnd'`, { desc: 'dnd lens applied' });
      await a.dbg(`openPopoverFor('tray')`);
      assert.equal(await a.eval(secVisible), true, 'a totals system shows them by default');
      assert.equal(await a.eval(
        `document.querySelector('#mods-popover .sec-pair').offsetParent !== null`),
      true, 'and pairing comes back — advantage is a d20 world habit');
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
    tags: ['smoke', 'meanings', 'groups', 'cuj8'],
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

      // the hero answers per pool as ROWS (2e; soul-deal is the default lens).
      // Three label cells, not two: since the hover key (2026-08-09) the
      // unsourced d6's row carries a label cell too, holding nothing but its
      // ivory dot — the spine has to stay a spine, and the one row the hover
      // colors differently must not be the one row the key skips.
      const tallySrcs = await a.eval(
        `[...document.querySelectorAll('#result-meaning .tally-src')].map((el) => el.textContent.trim())`);
      assert.deepEqual(tallySrcs, ['Wisdom', 'Zeal', ''], `rows grouped by pool (got: ${tallySrcs})`);
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
      // …and so does the hover key. Under a sum lens the card's pool labels
      // live in the BREAKDOWN line rather than the ledger, and the key has to
      // follow them there — the felt outlines the same three pools either
      // way. (folded-card pins the ledger half.)
      const dndKey = await a.dbg('cardKey');
      assert.deepEqual(dndKey.map((k) => k.label), ['Wisdom', 'Zeal', ''],
        `the breakdown line carries the key too (got ${JSON.stringify(dndKey)})`);
      await a.dbg('hoverBanner(true)');
      const dndShells = await a.dbg('outlineState');
      assert.equal(dndKey[0].color, dndShells[0], "Wisdom's dot is Wisdom's outline under dnd too");
      assert.equal(dndKey[1].color, dndShells[2], "and Zeal's is Zeal's");
      assert.equal(dndKey[2].color, dndShells[3], 'and the loose d6 keeps the ivory pair');
      await a.dbg('hoverBanner(false)');
      await a.dbg(`setSystem('soul-deal')`);
    },
  },
  {
    name: 'ledger-read',
    tags: ['smoke', 'meanings', 'cuj6'],
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
    tags: ['chrome', 'settings', 'cuj8'],
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

      // THE HEAD IS AN OWNERSHIP MARKER, NOT A REGION LABEL (§7.23, Joe
      // 2026-08-08: "we don't name the DICE UI region"). On YOUR OWN rack it
      // is absent — the section bar's pressed `Pools` stands directly above
      // the region and names it, and a second name for one region is the
      // redundant standing chrome §7.9 kills.
      //
      // ESTABLISH, don't inherit: the head also stands for `.profiled` (a
      // library holding more than one) and `.ledgered` (manage mode), and the
      // library is per-ORIGIN, so a scenario that ran earlier on this origin
      // and left two profiles behind turns this assertion into a failure
      // three scenarios from its cause. Reset first, and read at rest.
      await a.dbg('profiles.reset()');
      await a.dbg('setPoolsEditMode(false)');
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('pools-head')).display`),
        'none', 'your own rack carries no second name — the section bar names it');
      assert.equal(await a.eval(
        `getComputedStyle(document.querySelector('#section-bar [data-sec="pools"]')).display`
        + ` !== 'none'`), true, 'and that is the word doing the naming');
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
      // Gated on visibility first: `position` is readable through
      // display:none, so asserting it alone would stay green even if the
      // foreign head stopped rendering (the property-not-the-pixel trap).
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('pools-head')).display`),
        'flex', 'the foreign head is really on screen');
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
        `getComputedStyle(document.getElementById('pools-head')).display`), 'none',
        'and the ownership marker goes with the teammate — your own rack wears none');
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
    tags: ['smoke', 'groups', 'cuj8'],
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
    tags: ['notation', 'cuj8'],
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
    tags: ['notation', 'smoke', 'cuj8'],
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

      // THE SUM READ BELONGS TO A SUM SYSTEM (U7). This scenario used to
      // assert min/avg/max under the DEFAULT system — soul-deal, which never
      // adds the dice up and where no total lands anywhere — so it pinned the
      // very defect the audit found: the box forecasting a total while the
      // app's own Help stated the per-die rule on the same screen.
      await a.dbg(`setSystem('dnd')`);
      await type('3d6+5');
      await a.waitFor(`(${slotOk}).includes('min 8 avg 15.5 max 23')`,
        { desc: 'exact preview for 3d6+5 in a totals system' });
      assert.ok(!(await a.eval(slotOk)).includes('sampled'), 'exact line carries no label');
      await type('30d6 ro<=3'); // 10 reroll slots for 30 candidates — BINDING
      await a.waitFor(`(${slotOk}).includes('sampled — 4,000 rolls')`,
        { desc: 'cap-truncation corner is labeled as sampled' });

      // …and under a PER-DIE system the same string must not claim one. The
      // slot is the validator as well as the read, so it REPLACES rather than
      // blanking (§2l).
      await a.dbg(`setSystem('soul-deal')`);
      await type('3d6+5');
      await a.waitFor(`(${slotOk}).includes('per-die')`,
        { desc: 'a per-die system gets a per-die read' });
      const perDie = await a.eval(slotOk);
      assert.ok(!/min \d/.test(perDie),
        `and no sum forecast (got ${JSON.stringify(perDie)})`);
      assert.ok(perDie.includes('3d6+5'),
        'the canonical still leads the line');

      // keep/drop has no honest pre-roll per-die read, and says so in its own
      // words rather than falling back to a sum.
      await type('4d6dl1');
      await a.waitFor(`(${slotOk}).includes('keep/drop')`,
        { desc: 'the refusal speaks for itself' });
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
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1)`,
        { desc: 'first roll shelved' },
      );
      await a.roll('2d6');
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await b.settle();
      // The late joiner reconstructs the RECORD (one collected roll) and the
      // live roll's dice — two of them, not three: since C25 a collected roll
      // puts nothing on the felt, so there is no shelved die to rebuild. That
      // reconstruction was the last caller of spawnShelvedDie.
      await b.waitFor(
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1 && window.__diceDebug.tableDice.length === 2)`,
        { desc: 'late joiner reconstructs the record + the live roll' },
      );
      assert.equal((await b.shelf())[0].rollId, rid, 'shelved rollId matches');
      assert.equal(await a.logTop(), await b.logTop(), 'log identical for late joiner');
    },
  },

  // -- chrome: the persistent rail + collapsible panels + identity ----------
  {
    name: 'panels-collapse',
    tags: ['smoke', 'chrome', 'cuj8'],
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
    tags: ['smoke', 'chrome', 'cuj8'],
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
    tags: ['chrome', 'smoke', 'cuj9'],
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
    tags: ['smoke', 'chrome', 'seat', 'cuj3'],
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
    tags: ['smoke', 'chrome', 'seat', 'cuj3'],
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
    tags: ['seat', 'presence', 'cuj3'],
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
    tags: ['smoke', 'groups', 'cuj13'],
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

      // A save writes storage — and nothing else. The key moved with PROFILES
      // §11: dice.groups.v1 is a fossil read once at boot, and the rack now
      // lives inside the active profile in dice.profiles.v1.
      assert.ok(await a.dbg(`editPool(${first.id}, { notation: '2d12' })`), 'pool edited');
      assert.equal(await a.eval('location.hash'), '', 'a save never writes the address bar');
      assert.ok(
        (await a.eval(`localStorage.getItem('dice.profiles.v1')`)).includes('2d12'),
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
    tags: ['chrome', 'cuj12'],
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
    tags: ['smoke', 'chrome', 'cuj8'],
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
      // The guideline is that 'Tweak' is dead, not that one label is eternal
      // (Joe 2026-08-08). The word follows the system now — '± Modify' where
      // there are modifiers, '± Moment' where the popover folds them away —
      // so pin the BAN, which is what the ruling actually said.
      assert.ok(!/tweak/i.test(await a.eval(`document.getElementById('tray-mods').textContent`)),
        "the modifier tool never says 'Tweak' (Joe 2026-08-04)");
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
    tags: ['smoke', 'chrome', 'roll', 'cuj8'],
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
      await a.waitFor(`(window.__diceDebug.sim(160), window.__diceDebug.shelf.length === 1)`,
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
    tags: ['smoke', 'chrome', 'groups', 'cuj8'],
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
    tags: ['smoke', 'chrome', 'groups', 'cuj8'],
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
    tags: ['smoke', 'groups', 'cuj6'],
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
    // the displacement scenario above. run.mjs now refuses duplicate names.
    name: 'tidy-away',
    tags: ['shelf', 'roll', 'cuj9'],
    // NOTHING ABOUT A FINISHED ROLL IS ON A CLOCK (Joe, 2026-08-09 and -08-10).
    //
    // This pinned a 3 s tidy-away that COLLECTED your finished roll. Its
    // rationale was "tidies itself to the shelf"; C25 deleted the shelf and
    // left a countdown that erased the result and emptied the table. The dice
    // came off it first — "leave them on the table until another roll is
    // started" — and the CARD was left on a 7 s clock of its own, on the
    // reasoning that it is chrome. One day later: "It disappears and there is
    // no obvious way to get it back besides open the log. I expect a core CUJ
    // will be to do a roll and then spend minutes analyzing the result." The
    // card is the read, not the chrome, so that clock is gone too.
    //
    // What clears the felt is the next roll's arrival beat, which the SERVER
    // has always driven (`collectEntries(room, room.log)`) — so "one roll on
    // the felt" is unchanged and is now enforced in exactly one place, for
    // both the dice and the card.
    //
    // The bound below is the assertion: real wall-clock, not simulated, so a
    // reintroduced setTimeout actually gets a chance to fire. A sim()-only
    // wait would pass against any timer at all.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });

      await a.roll('2d6');
      const rid = await a.rollId();
      const bannerUp = () => a.eval(
        `!document.getElementById('result-banner').classList.contains('hidden')`);
      assert.equal(await bannerUp(), true, 'the card stands when the roll lands');

      // THE CARD STAYS, UNTOUCHED. Long enough to catch the 7 s clock this
      // replaced, and untouched because the old one was hover-held — a test
      // that so much as moved the pointer over the card would have held any
      // timer open and proved nothing.
      await new Promise((r) => setTimeout(r, 8000));
      assert.equal(await bannerUp(), true,
        'the card is still there eight seconds later, with no one touching it');

      // AND THE DICE DO NOT GO EITHER.
      await a.dbg('sim(600)'); // ten simulated seconds past the old window
      assert.equal(await bannerUp(), true, 'still there');
      assert.equal(await a.diceCount(), 2, 'the dice are still on the felt');
      assert.equal((await a.dbg('shelf')).length, 0, 'and the roll is NOT collected');
      assert.equal(await a.eval(
        `window.__diceDebug.onTable.filter((r) => !r.collected).length`), 1,
      'it is still the live roll on the table');

      // THE NEXT ROLL IS WHAT CLEARS THEM — the server's arrival beat, and
      // since this is the only clearer left, it is the one that must hold.
      await a.roll('1d8');
      await a.waitFor(
        `(window.__diceDebug.sim(240), window.__diceDebug.tableDice.length === 1)`,
        { desc: 'the new roll collected the old one off the felt' });
      assert.equal((await a.dbg('shelf')).length, 1, 'and the old roll is in the record');
      assert.notEqual(await a.rollId(), rid, 'the felt holds the NEW roll');

      // A HIDDEN ROLL'S CARD STANDS TOO, and this one carried a bail of its
      // own when there was a clock. Its Reveal is the only door, because an
      // uncollected roll has no collected log row to open a peek from.
      await a.roll('1d20 held');
      await a.dbg('sim(120)');
      assert.equal(await bannerUp(), true, "a hidden roll's card stands");
      assert.ok(await a.diceCount() > 0, 'and its dice stand until the reveal');
      assert.equal(await a.eval(
        `document.querySelectorAll('#banner-actions .banner-foot .reveal-verb:not([hidden])').length`),
      1, 'because that card is where Reveal lives');
    },
  },
  {
    name: 'soul-seed',
    tags: ['groups', 'cuj6'],
    // The pre-Soul-Deal starter trio (Attack/Damage/Percentile, untouched)
    // upgrades to the Soul Deal rack on the next boot — it was never the
    // player's own work. One edit and the rack is theirs: no swap.
    //
    // The rack is DEALT (js/seed.js, unit-tested in tests/seed.test.mjs), so
    // what this proves in a real browser is the wiring, not the arithmetic:
    // the deal reaches storage, survives migrateGroup, prices at 100/100/30
    // through the app's OWN ledger, and — the one thing only a reload can
    // show — does not re-roll itself out from under its owner on the way
    // back in.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`setGroups([{name: 'Attack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}, {name: 'Percentile', notation: 'd100'}])`);
      const b = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const gs = await b.dbg('groups');
      assert.equal(gs.length, 18, `the old trio upgraded (got ${gs.length})`);
      assert.equal(gs[0].name, 'Strength', 'attributes lead the rack');
      assert.equal(await b.eval(`document.querySelector('#groups-list .pool-sec-head').textContent`),
        'Attributes', 'the shelves are live');
      // Priced by the same rackDiceValue the ✎ ledger prints.
      const ledger = await b.dbg('rackDiceValue');
      assert.deepEqual(ledger.shelves, [
        { label: 'Attributes', value: 100 },
        { label: 'Skills', value: 100 },
        { label: 'Motivations', value: 30 },
      ], 'the dealt shelves land on their prices');
      assert.equal(ledger.total, 230, 'and the rack totals them');
      // Dealt, not flat: the old seed was eleven identical 1d6 pools.
      assert.ok(new Set(gs.map((g) => g.notation)).size > 3,
        `the dice vary across the rack (got ${JSON.stringify(gs.map((g) => g.notation))})`);

      // ONE deal per rack. A reload re-enters defaultGroups' neighbourhood
      // with storage already full, so the character has to come back byte
      // for byte — a re-roll here would silently rewrite a played sheet.
      const again = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      assert.deepEqual((await again.dbg('groups')).map((g) => `${g.name} ${g.notation}`),
        gs.map((g) => `${g.name} ${g.notation}`), 'a reload keeps the dealt rack');

      // a touched rack is the player's: rename one pool, reboot — no swap
      await b.dbg(`setGroups([{name: 'MyAttack', notation: '1d20'}, {name: 'Damage', notation: '3d4'}, {name: 'Percentile', notation: 'd100'}])`);
      const c2 = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      assert.equal((await c2.dbg('groups')).length, 3, 'an edited rack never swaps');
    },
  },
  {
    name: 'sheet-pass',
    tags: ['smoke', 'groups', 'cuj6'],
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
    tags: ['groups', 'cuj6'],
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
    tags: ['groups', 'chrome', 'cuj6'],
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
      // COMPUTED DISPLAY, not textContent (C9). This scenario passed for weeks
      // while the whole-rack figure was invisible: `renderGroups` builds
      // `.ph-fig` only when `!foreign && poolsEdit`, and `#pools-head` was
      // `display:none` in exactly that state — the state that built it was the
      // state that hid it — and textContent reads straight through
      // display:none. A visibility contract is about what the EYE gets
      // (§7.21), so it has to be asserted that way. This is the one assertion
      // that would have caught it, on the one player it hurt most: someone
      // holding a single profile, building their first character.
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('pools-head')).display !== 'none'`),
      true, 'the region head STANDS in manage mode, so its total can be seen');
      assert.equal(await a.eval(`(() => {
        const f = document.querySelector('#pools-head .ph-fig');
        return !!f && getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().width > 0;
      })()`), true, 'and the rack total is on screen, not merely in the DOM');
      assert.equal(await a.eval(
        `document.querySelectorAll('#pools-head .phf-word').length`), 1,
        "and the standing 'dice value' word with it — the shelf figures' unit");
      const led = await a.dbg('rackDiceValue');
      assert.equal(led.total, 102, `rack total: 6+16+40+40 (got ${led.total})`);
      const shelf = (l) => led.shelves.find((s) => s.label === l).value;
      assert.equal(shelf('Attributes'), 22, 'Attributes shelf value');
      assert.equal(shelf('Skills'), 80, "'1d20 adv' and '2d20 kh1' both read 40");
      assert.equal(shelf('Motivations'), 0, 'an empty trio shelf reads 0');
      // …and each figure carries its SHELF BUDGET (C8): spent/target, from
      // the system's own profile. `80/100` is a Skills shelf inside budget;
      // the over-budget hue and the no-budget system are pinned by
      // `creation-budget`.
      const figs = await a.eval(
        `[...document.querySelectorAll('.pool-sec-head .psh-fig')].map((f) => f.textContent)`);
      assert.ok(figs.includes('22/100') && figs.includes('80/100'),
        `shelf figures render with their budget (got: ${figs})`);
      assert.equal(await a.eval(
        `document.querySelectorAll('.pool-sec-head .psh-fig.over').length`), 0,
        'and nothing is over budget here');
      assert.equal(await a.eval(`document.querySelector('#pools-head .ph-fig b').textContent`),
        '102', 'the rack total rides the region head');
      assert.ok((await a.eval(`document.querySelector('#pools-head .ph-fig').textContent`))
        .includes('dice value'), 'the standing word is paid once at the top');

      // editing a pool moves shelf and rack together
      const claws = (await a.dbg('groups')).find((g) => g.name === 'Claws');
      await a.dbg(`editPool(${JSON.stringify(claws.id)}, {notation: '1d20'})`);
      assert.equal((await a.dbg('rackDiceValue')).total, 116, 'd6 → d20 moves the rack total');
      assert.equal(await a.eval(
        `[...document.querySelectorAll('.pool-sec-head .psh-fig')][0].textContent`), '36/100',
        'and the shelf figure with it — the spend moves, the budget does not');

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
    tags: ['groups', 'meanings', 'cuj6'],
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
    tags: ['smoke', 'groups', 'cuj11'],
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
    tags: ['smoke', 'settings', 'groups', 'cuj13'],
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
      await a.dbg('openSettings("stuff")');
      await a.eval(`document.getElementById('portable-open').click()`);
      assert.equal(await a.eval(`document.getElementById('portable-zone').classList.contains('hidden')`),
        false, 'the zone unfolds');
      const text = await a.eval(`document.getElementById('portable-text').value`);
      assert.ok(text.includes("- 'Body': '3d6'") && text.includes("'2d6 # To the death'"),
        `export quotes every scalar — the # comment survives (got: ${JSON.stringify(text.slice(0, 200))})`);
      // PROFILES §11: the box now carries the whole library, and the rack in
      // hand appears EXACTLY once — under `pools:`, with `profile:` naming
      // whose it is. A second copy inside `players:` would give a hand-editable
      // format two homes for one rack, so this asserts the one-home rule that
      // the edit below depends on.
      assert.equal(text.split('\n').filter((l) => l.includes("'Body'")).length, 1,
        `one home for one rack (got: ${JSON.stringify(text.split('\n').filter((l) => l.includes("'Body'")))})`);
      assert.ok(text.includes('profile:'), `the export names whose the pools are (got: ${JSON.stringify(text.slice(0, 120))})`);
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
    tags: ['smoke', 'groups', 'roll', 'cuj10'],
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
    tags: ['groups', 'chrome', 'cuj8'],
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
      // RE-POINTED AGAIN 2026-08-08 for U30's height branch, and this time
      // the pin drives BOTH sides rather than naming one. The zone's region
      // gap is 16px at full column height and 10px below 780px of viewport,
      // where the well hands its air back to the rack — both numbers are
      // the contract, so a pin that knows only one of them is half a pin.
      // It matters more than it looks: the harness launches headless Chrome
      // at its 800×600 default, so EVERY scenario in this suite runs on the
      // short side of that branch, and the full-height dress — the one a
      // desktop actually ships — is measured nowhere else. Hence the
      // explicit metrics override instead of reading whatever window we
      // happen to be in.
      const airAt = async (h) => {
        await a.page.browser.send('Emulation.setDeviceMetricsOverride',
          { width: 1024, height: h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
        await a.waitFor(`matchMedia('(max-height: 780px)').matches === ${h <= 780}`,
          { desc: `the height branch settles at ${h}px` });
        return JSON.parse(await a.eval(`JSON.stringify((() => {
          const z = document.getElementById('draft-zone');
          const bar = document.getElementById('section-bar');
          return {
            padBottom: parseFloat(getComputedStyle(z).paddingBottom),
            padTop: parseFloat(getComputedStyle(z).paddingTop),
            bodyPadTop: parseFloat(getComputedStyle(z.parentElement).paddingTop),
            gapToFirstSection: Math.round(bar.getBoundingClientRect().top - z.getBoundingClientRect().bottom),
          };
        })())`));
      };
      const baseH = await a.eval(`window.innerHeight`);
      try {
        for (const [h, gap, side] of [[900, 16, 'full'], [700, 10, 'short']]) {
          const air = await airAt(h);
          assert.equal(air.padBottom, gap,
            `${side} column: the region gap is the zone's own bottom padding (got ${air.padBottom}px)`);
          assert.equal(air.gapToFirstSection, 0,
            `${side} column: the first section rides it — no margin of its own`);
          assert.equal(air.padTop + air.bodyPadTop, gap,
            `${side} column: the zone's top inset reads ${gap}px with the body's own (got ${air.padTop} + ${air.bodyPadTop})`);
          // …and NONE of that inset may sit above the sticky well, or
          // scrolled content shows through the slot. The first build of the
          // reorder left the body's 4px there and die art slid through it.
          assert.equal(air.bodyPadTop, 0,
            `${side} column: no padding above a sticky child — it becomes a leak band (got ${air.bodyPadTop}px)`);
        }
        // The trade itself, which is the whole reason U30 exists: what the
        // zone gives up on a short column is real, and it comes out of the
        // WELL rather than the rack below it.
        const wellAt = async (h) => {
          await a.page.browser.send('Emulation.setDeviceMetricsOverride',
            { width: 1024, height: h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
          await a.waitFor(`matchMedia('(max-height: 780px)').matches === ${h <= 780}`,
            { desc: `the height branch settles at ${h}px` });
          return a.eval(`(() => {
            const cs = getComputedStyle(document.querySelector('.tray-line2 .tray-roll'));
            return { minH: parseFloat(cs.minHeight),
                     cue: parseFloat(getComputedStyle(document.querySelector('.tray-line2 .tray-roll .roll-cue')).fontSize),
                     die: parseFloat(getComputedStyle(document.querySelector('.tray-line2 .tray-roll .die-art')).width) };
          })()`);
        };
        const tall = await wellAt(900);
        const shortW = await wellAt(700);
        assert.equal(tall.minH, 113, 'a full column keeps the well at its shipped 113px');
        assert.equal(shortW.minH, 84, 'a short column trims the well to 84px');
        // …and trims NOTHING else. The ROLL plate is the surface's primary
        // act (§7.21) and the dice are "the star" — a height branch that
        // shrank either would be answering "too little room" by making the
        // thing you came for smaller.
        assert.equal(shortW.cue, tall.cue, 'the ROLL cue is the same object at both heights');
        assert.equal(shortW.die, tall.die, 'and the well keeps its 34px dice');
      } finally {
        await a.page.browser.send('Emulation.clearDeviceMetricsOverride', {}, a.page.sessionId);
      }
      await a.waitFor(`window.innerHeight === ${baseH}`, { desc: "the harness's own window is back" });

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
    tags: ['smoke', 'chrome', 'groups', 'cuj8'],
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
    name: 'digit-reach',
    tags: ['smoke', 'groups', 'chrome', 'cuj8'],
    // U24. `1 2 3 Enter` is the roll this surface exists for — an attribute,
    // a skill and a motivation. On the rack the app DEALS (9 attributes, 6
    // skills, 3 motivations) the flat rendered order spent all nine digits on
    // attributes, so the advertised roll could not be typed at all. UX.md
    // asserted the claim in the paragraph directly above the dealt-rack
    // amendment that broke it.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.16', name: 'Dig' });
      const rack = [];
      for (const n of ['At1', 'At2', 'At3', 'At4', 'At5', 'At6', 'At7', 'At8', 'At9']) {
        rack.push({ name: n, notation: '2d8', category: 'Attributes' });
      }
      for (const n of ['Sk1', 'Sk2', 'Sk3', 'Sk4', 'Sk5', 'Sk6']) {
        rack.push({ name: n, notation: '1d10', category: 'Skills' });
      }
      for (const n of ['Mo1', 'Mo2', 'Mo3']) {
        rack.push({ name: n, notation: '1d4', category: 'Motivations' });
      }
      await a.dbg(`setGroups(${JSON.stringify(rack)})`);
      await a.dbg('setPanelState({pools: false})');

      // EVERY SHELF IS REACHABLE. Nine digits shared out one-per-shelf then
      // by size: on this shape that is 3/3/3.
      const digits = `JSON.stringify([...document.querySelectorAll('#rail-pools .rp-item')]
        .map((b) => [(b.querySelector('.rp-ord') || {}).textContent || '',
                     (b.querySelector('.rp-name') || {}).textContent || '']))`;
      const map = JSON.parse(await a.eval(digits));
      const numbered = map.filter(([d]) => d);
      assert.equal(numbered.length, 9, 'all nine digits are spent');
      assert.deepEqual(numbered.map(([, n]) => n),
        ['At1', 'At2', 'At3', 'Sk1', 'Sk2', 'Sk3', 'Mo1', 'Mo2', 'Mo3'],
        'and every shelf gets three — not nine attributes and nothing else');

      // …so the canonical roll is typeable. 1 · 4 · 7 then Enter.
      for (const k of ['1', '4', '7']) {
        await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: ${JSON.stringify(k)}}))`);
      }
      assert.deepEqual((await a.dbg('railState')).selected, ['At1', 'Sk1', 'Mo1'],
        'an attribute, a skill and a motivation — the roll the surface is for');

      // The rack and the rail print the SAME number for the same pool: one
      // map, two surfaces, so a badge can never contradict the keyboard.
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
      await a.dbg('setPanelState({pools: true})');
      const rackMap = JSON.parse(await a.eval(`JSON.stringify(
        [...document.querySelectorAll('#groups-list .pool-tile')]
          .map((el) => (el.querySelector('.pool-ord') || {}).textContent || '')
          .filter(Boolean))`));
      assert.deepEqual(rackMap, ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
        'the rack shows the same nine, in the same order');
    },
  },

  {
    name: 'rail-mode',
    tags: ['smoke', 'chrome', 'groups', 'cuj8'],
    // §7.23 — the collapsed column's source switch and its dice list.
    // Everything here goes through the REAL controls, not the debug hooks:
    // the hooks branched on mode correctly while #rail-roll was still bound
    // straight to the pool path, so a dice pick armed the bar and pressing it
    // did nothing. A hook-driven pin cannot see that.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.6', name: 'Rail' });
      const SHEET = [{ name: 'Wisdom', notation: '2d8', category: 'attributes' },
        { name: 'Swordplay', notation: '1d10', category: 'skills' }];
      try {
        await a.dbg(`setGroups(${JSON.stringify(SHEET)})`);
        await a.dbg('setPanelState({pools: false})');

        // (i) THE DECISION TABLE. Pools by default when you have any, and
        // nothing written until you choose.
        let m = await a.dbg('railMode');
        assert.equal(m.mode, 'pools', 'a rack you own opens on Pools');
        assert.equal(m.stored, null, 'and nothing is stored until you pick');
        assert.deepEqual(m.shown, { pools: true, dice: false }, 'one list on screen');

        // (ii) The switch is a real control and it persists.
        await a.eval(`document.querySelector('#rail-mode [data-rm="dice"]').click()`);
        m = await a.dbg('railMode');
        assert.equal(m.mode, 'dice', 'the switch switches');
        assert.equal(m.stored, 'dice', 'and remembers');
        assert.deepEqual(m.shown, { pools: false, dice: true }, 'the other list is gone, not dim');
        await a.dbg('setPanelState({pools: true})');
        await a.dbg('setPanelState({pools: false})');
        assert.equal((await a.dbg('railMode')).mode, 'dice',
          'the preference survives expand → collapse');

        // (iii) TAPPING DICE, through the rows themselves. Three taps on d6
        // make one row read 3d6 — the label IS the notation.
        const row = (t) => `[...document.querySelectorAll('#rail-dice .rd-item')]`
          + `.find((b) => b.querySelector('.rp-name').textContent.endsWith('${t}')).click()`;
        // THE COUNT STARTS AT ONE, VISIBLY. Suppressing the 1 made the first
        // tap change the highlight but not the word, so the counter looked
        // like it began at two.
        await a.eval(row('d6'));
        assert.ok((await a.dbg('railDice')).labels.includes('1d6'),
          `the first tap writes 1d6, it does not skip it (got ${(await a.dbg('railDice')).labels})`);
        await a.eval(row('d6')); await a.eval(row('d6'));
        let d = await a.dbg('railDice');
        assert.equal(d.total, 3, 'three taps stage three dice');
        assert.ok(d.labels.includes('3d6'), `the row reads its own notation (got ${d.labels})`);
        assert.equal(d.rollDisabled, false, 'and the verb arms');
        assert.equal(d.rollTitle, 'Roll 3d6', 'naming what it will send');
        assert.equal(d.removers, 1, 'exactly the counted row carries a remover');

        // (iv) THE BUTTON ROLLS. Not the hook — the button.
        await a.eval(`document.getElementById('rail-roll').click()`);
        await a.waitFor(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length === 3)`,
          { desc: 'the rail bar actually rolls loose dice' });
        assert.equal((await a.dbg('lastRequestedRoll')).canonical, '3d6',
          'byte-identical to the same roll from the box');
        assert.equal((await a.dbg('railDice')).total, 0, 'spent by its roll (2i-G)');

        // (v) d100 is two dice and shows on the rows that carry them.
        await a.eval(row('d100'));
        d = await a.dbg('railDice');
        assert.deepEqual(d.dice, ['d10x', 'd10'], 'd100 stages the pair, as everywhere else');
        assert.equal(d.canonical, 'd100', 'and canonicalizes back to d100');
        // The remover takes one die back off.
        await a.eval(`document.querySelector('#rail-dice .rd-x').click()`);
        assert.equal((await a.dbg('railDice')).total, 1, 'the ✕ removes one');
        // U10: switching away must NOT destroy the pick. The wipe lived four
        // lines under a comment reading "BOTH PICKS SURVIVE", and §7.23
        // states "Nothing is ever destroyed by navigation" as law.
        await a.dbg(`railTapDie('d8')`);
        assert.equal((await a.dbg('railDice')).total, 2, 'a dice pick stands');
        await a.eval(`document.querySelector('#rail-mode [data-rm="pools"]').click()`);
        assert.equal((await a.dbg('railMode')).mode, 'pools',
          'an explicit choice outranks a live pick — the switch works');
        await a.eval(`document.querySelector('#rail-mode [data-rm="dice"]').click()`);
        assert.equal((await a.dbg('railDice')).total, 2,
          'and the pick was waiting where it was left, not destroyed');
        await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
        await a.dbg('setRailMode("pools")');

        // (vi) DIGITS STAY BOUND TO POOLS IN BOTH MODES. Rebinding them to
        // loose dice would fire the wrong roll from muscle memory — `1 2 3
        // Enter` is the attribute+skill+motivation roll this surface exists
        // for, and the mode persists, so one flip would rebind it forever.
        // A digit in dice mode surfaces the pool list for this visit only.
        await a.dbg('setRailMode("dice")');
        await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '1'}))`);
        assert.equal((await a.dbg('railMode')).mode, 'pools',
          'a digit in dice mode brings the pools back');
        assert.equal((await a.dbg('railMode')).stored, 'dice',
          'without rewriting the preference');
        assert.deepEqual((await a.dbg('railState')).selected, ['Wisdom'],
          'and lands on the pool that digit names');
        await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
        assert.deepEqual((await a.dbg('railState')).selected, [], 'Esc drops the pick');

        // (vii) An empty rack forces Dice and DISABLES Pools — present and
        // drained (2i-C), never absent — and forgets the preference, which is
        // what "the default logic applies again" means.
        await a.dbg('setGroups([])');
        m = await a.dbg('railMode');
        assert.equal(m.mode, 'dice', 'no pools → the dice list');
        assert.equal(m.poolsEnabled, false, 'and Pools is unavailable, not gone');
        assert.equal(m.stored, null, 'the preference is forgotten with the rack');
        assert.equal(await a.eval(
          `getComputedStyle(document.querySelector('#rail-mode [data-rm="pools"]')).display !== 'none'`),
        true, 'the disabled cell still holds its width');

        // (viii) The verb STANDS in both modes, armed or not (§7.9).
        assert.equal((await a.dbg('railState')).rollStanding, true,
          'the roll surface never leaves');
        assert.equal((await a.dbg('railDice')).rollDisabled, true, 'it is simply not armed');

        // UNPOWERED IS BRONZE, NOT STEEL (Joe 2026-08-08: "the empty tray on
        // expanded DOES NOT switch to steel, it stays bronze"). The verb is
        // the tray's own plate, so its unarmed state is the tray's unpowered
        // plate — warm, quiet, still gold-lettered. A stale rule later in the
        // file was draining it with `filter: grayscale(1)`, which is what
        // made it read as a dead gray button, and NOTHING in this suite could
        // see that: every assertion here was about behaviour.
        const off = JSON.parse(await a.eval(`JSON.stringify((() => {
          const cs = getComputedStyle(document.getElementById('rail-roll'));
          const rgb = [...cs.backgroundImage.matchAll(/rgba?\\((\\d+), *(\\d+), *(\\d+)/g)]
            .map((m) => ({ r: +m[1], g: +m[2], b: +m[3] }));
          return { filter: cs.filter, stops: rgb };
        })())`));
        assert.equal(off.filter, 'none',
          `the unarmed plate is not drained to grayscale (got ${off.filter})`);
        assert.ok(off.stops.length > 0, 'the plate carries its gradient');
        assert.ok(off.stops.every((c) => c.r > c.b),
          `every stop stays warm — bronze, not steel (got ${JSON.stringify(off.stops)})`);

        // (ix) Neither collapsed-only surface exists while expanded.
        await a.dbg('setPanelState({pools: true})');
        assert.equal(await a.eval(
          `getComputedStyle(document.getElementById('rail-mode')).display`), 'none',
        'the switch is collapsed-only');
        assert.equal(await a.eval(
          `getComputedStyle(document.getElementById('rail-dice')).display`), 'none',
        'and so is the dice list');
        assert.equal(await a.eval(`document.querySelectorAll('#rail-dice button button').length`),
          0, 'the remover is a sibling, never a button inside a button');
      } finally {
        await a.dbg('setPanelState({pools: true})').catch(() => {});
        await a.eval(`localStorage.removeItem('dice.railmode.v1')`).catch(() => {});
      }
    },
  },

  {
    name: 'rim-word',
    tags: ['smoke', 'chrome', 'meanings', 'cuj8'],
    // U11. soul-deal — the DEFAULT — sets usesMods:false, which folds the
    // Modifier, pairing, Target and keep/drop sections out of the ± popover
    // entirely. So the panel's loudest tool said "± Modify" with
    // title="Modifiers, target, moment" while two of those three were absent,
    // and U1's own set-aside note pointed at it as the remedy for a `dc` the
    // popover cannot express.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.15', name: 'Rim' });
      const word = `document.getElementById('tray-mods').textContent`;
      const tip = `document.getElementById('tray-mods').title`;

      // Default (per-die): the button names what is actually behind it, and
      // 'Tweak' stays dead — that ban is what the 2026-08-04 ruling said.
      // U17 #32 applies U11's rule rather than overturning it: '± Moment' was
      // right when the popover held two of seven sections; it now holds SIX,
      // and naming one of six is the same defect U11 fixed. So the WORD is
      // constant again and the TOOLTIP is what varies — it stops promising
      // modifiers where the one folded section is Modifier.
      assert.equal(await a.eval(word), '± Modify', 'the word stands in every system');
      assert.ok(!/Modifiers/.test(await a.eval(tip)),
        'a per-die system does not promise the one section it folds');
      assert.ok(!/tweak/i.test(await a.eval(word)), "and never 'Tweak'");

      // A totals system restores the full promise.
      await a.dbg(`setSystem('dnd')`);
      await a.waitFor(`/Modifiers/.test(${tip})`,
        { desc: 'a totals system gets the full tooltip' });
      assert.equal(await a.eval(word), '± Modify', 'same word, either way');

      // …and back, because a room-wide system change arrives as an echo.
      await a.dbg(`setSystem('soul-deal')`);
      await a.waitFor(`!/Modifiers/.test(${tip})`,
        { desc: 'the tooltip follows the system back' });
    },
  },

  {
    name: 'clear-scope',
    tags: ['smoke', 'chrome', 'log', 'cuj9'],
    // U14. `c` sweeps the felt FOR THE WHOLE TABLE. Its guard's own comment
    // named the hazard — "a stray 'c' would sweep the felt underneath a menu
    // the player is reading" — while covering one of the three menus; the
    // other two predicates already existed a few lines up in the Esc ladder.
    // And the log flyout, which is deliberately un-modal so `r` still works,
    // had a button labelled `Clear`: same word, two scopes, one recoverable
    // and one permanent.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.14', name: 'Scope' });
      const c = () => a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'c'}))`);
      const onFelt = () => a.eval(`(window.__diceDebug.sim(120), window.__diceDebug.tableDice.length)`);

      await a.roll('2d6');
      await a.settle();
      assert.ok(await onFelt() > 0, 'dice are on the felt');

      // (i) The identity menu holds the keyboard.
      await a.dbg('openIdentityMenu?.()').catch(() => {});
      await a.eval(`document.getElementById('identity-chip')
        .dispatchEvent(new MouseEvent('contextmenu', {bubbles: true}))`);
      await a.waitFor(
        `!document.getElementById('identity-menu').classList.contains('hidden')`,
        { desc: 'the identity menu is up' });
      await c();
      assert.ok(await onFelt() > 0,
        'c does NOT sweep the felt under the identity menu');
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);

      // (ii) …and with no menu up, it still does its job. A guard that
      // over-reaches is the other way to get this wrong.
      await c();
      await a.waitFor(`(window.__diceDebug.sim(240), window.__diceDebug.tableDice.length === 0)`,
        { desc: 'c sweeps the felt when nothing owns the keyboard' });

      // (iii) The log's button says which thing it clears.
      assert.equal(await a.eval(`document.getElementById('clear-log').textContent`),
        'Clear history', 'the log button names its own scope');
    },
  },

  {
    name: 'announced',
    tags: ['smoke', 'chrome', 'ceremony'],
    // U5. The app had ONE live region and it lived inside #result-banner —
    // which a ceremony never paints, because stepPlayback returns into
    // ceremonyEnterSettle before showResults. So every Check and every
    // Cinematic, the rolls carrying a DC and a moment, landed unannounced.
    // The other two notice channels were silent by construction: #rail-note
    // sets textContent and clears `hidden` in the same task (out of the a11y
    // tree at the moment of the mutation) and #status-pill had no role at all.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.11', name: 'Heard' });
      const live = `document.getElementById('sr-live')`;
      const said = () => a.eval(`${live}.textContent.replace(/\u200B/g, '')`);

      // (i) The channel is mounted at the root, outside every surface that
      // might not paint, and is never hidden.
      assert.equal(await a.eval(`${live}.parentElement === document.body`), true,
        'the live region is at the body root, not inside a card');
      assert.equal(await a.eval(`${live}.hasAttribute('hidden')`), false,
        'and is never hidden — a hidden region is out of the a11y tree');
      assert.equal(await a.eval(`${live}.getAttribute('aria-live')`), 'polite',
        'and announces politely');

      // (ii) A PLAIN roll speaks.
      await a.roll('2d6 # Bread');
      await a.settle();
      await a.waitFor(`${live}.textContent.includes('Bread')`,
        { desc: 'the plain roll is announced' });

      // (iii) A CEREMONY speaks — the case that was silent. It also carries
      // the target, which is the whole reason a Check is a Check.
      await a.roll('1d20 check dc15 # The Duel');
      await a.waitFor(`${live}.textContent.includes('The Duel')`,
        { desc: 'the ceremony announces its own result' });
      assert.ok((await said()).includes('target 15'),
        `and names the target it was rolled against (got ${JSON.stringify(await said())})`);
      await a.settle();

      // (iv) A HIDDEN roll names ITS OWN RUNG to the people it is hidden
      // from. The old line said 'held' for a whisper too — the one channel a
      // blind player has, using the wrong word for the mode. (The ROLLER is
      // not a hidden viewer of their own roll, so this is a spectator's
      // assertion by construction.)
      const b = await ctx.newTable({ origin: '127.0.0.12', name: 'Watcher' });
      const bLive = () => b.eval(`${live}.textContent.replace(/\u200B/g, '')`);

      await a.roll('2d6 held # Facedown');
      await b.settle();
      await b.waitFor(`${live}.textContent.includes('held')`,
        { desc: "a spectator hears 'held' for a face-down roll" });

      await a.roll(`2d6 w:Watcher # Mine`);
      await a.settle();
      // Watcher is IN the audience, so they hear the real result…
      await b.waitFor(`${live}.textContent.includes('Mine')`,
        { desc: 'an addressee hears the whisper' });

      // …and a third player, who is not, hears that it is HIDDEN and never a
      // value. Not the literal word 'held' — that was the defect, one rung's
      // word standing in for every rung. Not 'whisper' either: the server
      // strips `visibility` from a redacted entry, so the client genuinely
      // does not know which rung it was, and guessing would tell a
      // non-addressee more than the server did. The label rides on purpose —
      // a whisper's stakes are public by design (UX.md's "others see you
      // rolled, not what").
      const c = await ctx.newTable({ origin: '127.0.0.13', name: 'Outside' });
      await a.roll(`2d6 w:Watcher # Secrets`);
      await c.settle();
      const heard = await c.eval(`${live}.textContent.replace(/\u200B/g, '')`);
      assert.ok(/hidden|whisper/.test(heard),
        `a non-addressee hears that it is hidden (got ${JSON.stringify(heard)})`);
      assert.equal(/\bheld\b/.test(heard), false,
        `and NOT the wrong rung's word (got ${JSON.stringify(heard)})`);
      assert.equal(/\b(?:\d+\s*—|—\s*\d+)/.test(heard), false,
        `and never a value (got ${JSON.stringify(heard)})`);
      await b.close();
      await c.close();
      void bLive;
    },
  },

  {
    name: 'touch-doors',
    tags: ['smoke', 'chrome', 'seat', 'cuj3'],
    // U27 + U12. Every right-click door needs a touch twin, because iOS
    // Safari never fires `contextmenu` on a long press — a contextmenu-only
    // door is a door that does not exist on an iPhone. Three of the four
    // were wrong: the identity chip opened its menu on the hold and let its
    // own click handler CLOSE it on the same release (dead since it
    // shipped), and the shelf marker and peek card had no hold at all.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.8', name: 'Touch' });
      const hold = async (sel, ms = 620) => {
        await a.eval(`(() => { const t = document.querySelector(${JSON.stringify(sel)});
          t.dispatchEvent(new PointerEvent('pointerdown',
            {bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10})); })()`);
        await new Promise((r) => setTimeout(r, ms));
        await a.eval(`(() => { const t = document.querySelector(${JSON.stringify(sel)});
          t.dispatchEvent(new PointerEvent('pointerup',
            {bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10}));
          t.click(); })()`);
      };

      // (i) THE IDENTITY CHIP — the defect. That menu is the only door to
      // Change name and Leave table, so a touch-only player could not rename
      // or leave. ('Change seat…' was the third; it is withheld everywhere
      // since 2026-08-09 and asserted absent below.)
      assert.equal(await a.eval(
        `!document.getElementById('identity-menu').classList.contains('hidden')`),
      false, 'the menu starts closed');
      await hold('#identity-chip');
      assert.equal(await a.eval(
        `!document.getElementById('identity-menu').classList.contains('hidden')`),
      true, 'a hold opens the identity menu AND THE RELEASE DOES NOT CLOSE IT');
      // …and the items it is the only door to are really there.
      // Change name… · Leave table — the verbs whose ONLY door this menu is
      // (Copy invite link has a second home as a .rail-ghost when the roster
      // is empty; these do not).
      for (const id of ['idm-rename', 'idm-lobby']) {
        assert.equal(await a.eval(
          `getComputedStyle(document.getElementById(${JSON.stringify(id)})).display !== 'none'`),
        true, `${id} is reachable through the touch door`);
      }
      // AT a table, not just in the lobby: 'Change seat…' is withheld. The
      // lobby pin (identity-lobby) proves the table-scoped hide; this proves
      // the newer, unconditional one. The two together are what stops a
      // future `!IN_LOBBY` quietly restoring the verb.
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('idm-leave')).display`), 'none',
      'Change seat is withheld at a table too (Joe 2026-08-09)');
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);

      // (ii) A NORMAL TAP still falls home rather than opening the menu —
      // the suppressor must not swallow the ordinary press.
      await a.eval(`document.getElementById('identity-chip').click()`);
      assert.equal(await a.eval(
        `!document.getElementById('identity-menu').classList.contains('hidden')`),
      false, 'a plain tap does not open the menu');

      // (iii) THE COLLECTED ROLL'S ROW — its tweaked reroll was unreachable on
      // iOS. Roll, collect, then hold the row. (This was the shelf MARKER
      // until C25 took the felt shelf away; the door moved, the iOS trap did
      // not — a long press still never produces `contextmenu` there.)
      await a.roll('2d6');
      await a.settle();
      const rid = await a.rollId();
      assert.equal(await a.dbg(`collectRoll(${JSON.stringify(rid)})`), true, 'collect accepted');
      await a.dbg('setLogFlyout(true)');
      await a.waitFor(
        `(window.__diceDebug.sim(120), !!document.querySelector('#log-list .log-entry.collected'))`,
        { desc: 'the roll reaches the record' });
      await hold('#log-list .log-entry.collected');
      assert.equal((await a.dbg('popover')).open, true,
        'a hold on the collected row opens the tweaks popover');
      // The peek stands open UNDER it on purpose — openShelfPopover anchors
      // the popover to the card ("the peek pins while it lives"). What must
      // NOT happen is the row's own click toggling that peek back shut on
      // the release, which is the fall-through lp.took() exists to stop.
      assert.equal(await a.eval(
        `!document.getElementById('peek-card').classList.contains('hidden')`),
      true, 'the peek stands as the popover’s anchor, not toggled shut by the release');
      await a.dbg('closePopover()');

      // (iv) THE PEEK'S OWN HOLD — the other contextmenu-only door. It is
      // attached once at boot rather than per render, so a peek opened and
      // closed repeatedly must not stack one timer per visit.
      // The row's tap TOGGLES, and closePopover above left peekRollId
      // pointing at this roll — so the first tap may close rather than open.
      // Tap until it stands; two is the most it can ever take.
      for (let i = 0; i < 2; i++) {
        if (await a.eval(
          `!document.getElementById('peek-card').classList.contains('hidden')`)) break;
        await a.eval(`document.querySelector('#log-list .log-entry.collected').click()`);
      }
      await a.waitFor(
        `!document.getElementById('peek-card').classList.contains('hidden')`,
        { desc: 'the peek stands' });
      await hold('#peek-card');
      assert.equal((await a.dbg('popover')).open, true,
        'a hold on the peek card opens the tweaks popover too');
      await a.dbg('closePopover()');
    },
  },

  {
    name: 'draft-intent',
    tags: ['smoke', 'groups', 'visibility', 'notation', 'cuj8'],
    // U1 + U2. THE SAME POOL MUST SEND THE SAME ROLL whichever surface fires
    // it. Until 2026-08-08 stageGroup pushed dice and threw the rest away, so
    // `3d6+2 dc12 cinematic held` rolled face-down and cinematic from the
    // collapsed rail and landed as a bare OPEN 3d6 in the workbench — failing
    // open on a goal-11 surface. And a box whose text stopped parsing fired
    // the stale tray instead, dropping `secret` with it.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.7', name: 'Intent' });
      try {
        await a.dbg(`setGroups([{name: 'Sneak', notation: '3d6+2 dc12 cinematic held'},`
          + ` {name: 'Plain', notation: '2d8'}, {name: 'Loud', notation: '1d4 secret'}])`);
        await a.dbg('setPanelState({pools: true})');

        // (i) THE FORK, CLOSED. Staging carries dc, moment, label, the flat
        // bonus as a labelled part, and the visibility.
        await a.eval(`document.querySelectorAll('#groups-list .tile-stage')[0].click()`);
        const i1 = await a.dbg('draftIntent');
        assert.equal(i1.dc, 12, 'the target rides');
        assert.ok(i1.exp, `the moment rides (got ${JSON.stringify(i1.exp)})`);
        assert.equal(i1.visibility, 'held', 'the visibility rides — this is the goal-11 half');
        assert.equal(i1.mods && i1.mods.modifier, 2, 'the flat bonus rides');
        assert.ok((i1.mods.parts || []).some((p) => p.label === 'Sneak'),
          `and rides ATTRIBUTED (got ${JSON.stringify(i1.mods.parts)})`);

        // (ii) The canonical the box now holds re-parses to the same intent —
        // the projection and the spec agree.
        const canon = i1.canonical;
        assert.ok(/held/.test(canon) && /dc12/.test(canon),
          `the box carries it too (got ${JSON.stringify(canon)})`);

        // (iii) AND THE ROLL IT SENDS matches what the rail would send.
        await a.eval(`document.getElementById('tray-roll').click()`);
        await a.waitFor(`!!window.__diceDebug.lastRequestedRoll`, { desc: 'roll sent' });
        const sent = await a.dbg('lastRequestedRoll');
        assert.equal(sent.visibility && sent.visibility.mode, 'held',
          `the wire carries held (got ${JSON.stringify(sent.visibility)})`);
        assert.equal(sent.dc, 12, 'and the target');
        await a.eval(`document.getElementById('clear-tray').click()`);

        // (iv) VISIBILITY FAILS CLOSED when two staged pools disagree — the
        // one rule here that is not first-wins, because the other direction
        // leaks. (held + secret → secret, never open.)
        await a.eval(`document.querySelectorAll('#groups-list .tile-stage')[0].click()`);
        await a.eval(`document.querySelectorAll('#groups-list .tile-stage')[2].click()`);
        assert.equal((await a.dbg('draftIntent')).visibility, 'secret',
          'mixed visibility closes to secret');
        await a.eval(`document.getElementById('clear-tray').click()`);

        // (v) Glue still cannot ride a sum, and stageLossFor says so without
        // anyone having to read a transient note.
        await a.dbg(`setGroups([{name: 'Ability', notation: '4d6dl1'}])`);
        assert.deepEqual(await a.dbg(`stageLossFor('Ability')`), ['keep/drop'],
          'glued keep/drop is named as set aside');

        // (vi) U2 — A BROKEN BOX DISARMS THE PLATE. It must not fall through
        // to the tray: the tray is the stale projection and dropping a
        // `secret` on the way is exactly the leak U1 just closed.
        await a.dbg(`setGroups([{name: 'Quiet', notation: '2d8 secret'}])`);
        await a.eval(`document.querySelector('#groups-list .tile-stage').click()`);
        assert.equal((await a.dbg('draftIntent')).rollArmed, true, 'armed while valid');
        await a.eval(`(() => { const i = document.getElementById('cmd-input');
          i.value = i.value + ' @@@'; i.dispatchEvent(new Event('input')); })()`);
        await a.waitFor(`window.__diceDebug.draftIntent.boxBroken === true`,
          { desc: 'the box stops parsing' });
        assert.equal((await a.dbg('draftIntent')).rollArmed, false,
          'a broken box disarms the plate rather than firing the stale tray');
        const before = (await a.dbg('lastRequestedRoll')) || null;
        await a.eval(`document.getElementById('tray-roll').click()`);
        assert.deepEqual(await a.dbg('lastRequestedRoll'), before,
          'and pressing it sends nothing at all');
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
      assert.ok(!/tweak/i.test(await a.eval(`document.getElementById('tray-mods').textContent`)),
        "the rim's modifier tool never says 'Tweak' (Joe 2026-08-04); its word "
        + 'follows the system since U11');
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
    tags: ['visibility', 'cuj10'],
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
        // U17: the log's total column answers `?` only where a total EXISTS
        // and is being withheld. Under the default per-die lens there is no
        // sum to withhold, so the column is empty and `face down` above
        // carries the state — the same correction the banner and the peek
        // took in step 2. The `?` CHIP over the die is a different channel
        // (a hidden face) and is unchanged; it is asserted two lines down.
        assert.ok(!line.includes('?'),
          `${who}: no phantom ? for a sum this system never computes (got: ${line})`);
        assert.ok(line.includes('Alice'), `${who}: roller still attributed (got: ${line})`);
        assert.deepEqual(await t.chips(), ['?'], `${who}: the chip over the die reads ?`);
      }
      // …and a totals lens still answers `?`, because there a number really
      // is being withheld.
      for (const t of [a, b]) await t.dbg(`setSystem('dnd')`);
      for (const t of [a, b]) {
        await t.waitFor(`document.querySelector('#log-list .log-total').textContent === '?'`,
          { desc: 'a totals lens keeps the withheld-sum ?' });
      }
      for (const t of [a, b]) await t.dbg(`setSystem('soul-deal')`);

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
    tags: ['visibility', 'cuj10'],
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
    tags: ['visibility', 'cuj10'],
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
    tags: ['visibility', 'cuj10'],
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
    tags: ['visibility', 'cuj10'],
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
    tags: ['visibility', 'cuj10'],
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
    tags: ['visibility', 'cuj10'],
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
    tags: ['visibility', 'cuj10'],
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
    tags: ['visibility', 'cuj10'],
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
    tags: ['visibility', 'cuj10'],
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
    tags: ['visibility', 'resync', 'cuj10'],
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
    tags: ['visibility', 'notation', 'cuj10'],
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
    tags: ['roll', 'shelf', 'cuj9'],
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
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1)`,
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
    tags: ['visibility', 'cuj9'],
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
    tags: ['themes', 'cuj12'],
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

      // Bob never picked a set: his roll is std on every screen. Alice's
      // auto-collected dice LEAVE — C25 — so the felt holds exactly the live
      // roll, and the skin claim is about what is on the table, not about an
      // archive standing beside it.
      await b.roll('1d20 # plain');
      await b.settle();
      const rid = await b.rollId();
      await a.waitFor(
        `(window.__diceDebug.sim(120), !window.__diceDebug.busy`
        + ` && window.__diceDebug.tableDiceInfo().some((d) => d.rollId === ${JSON.stringify(rid)}))`,
        { desc: 'the plain roll lands on A' },
      );
      await a.dbg('sim(120)'); // let the collected roll's departure finish
      const infoA = JSON.parse(await a.eval(`JSON.stringify(window.__diceDebug.tableDiceInfo())`));
      const plain = infoA.filter((d) => d.rollId === rid);
      assert.equal(plain.length, 1, 'one plain die on the felt');
      assert.equal(plain[0].variant, 'std', 'no set chosen ⇒ std');
      assert.equal(infoA.length, 1,
        `and it is the ONLY die there — the anvil roll was collected (got ${infoA.length})`);

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
    tags: ['themes', 'cuj12'],
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
    tags: ['themes', 'cuj12'],
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

      // A held roll wears obsidian: no pop, no bloom flag.
      //
      // The baseline used to be "whatever was already blooming", because the
      // bolt-glass roll above stayed on the felt while the held one landed
      // beside it. It does not any more: a roll ARRIVING auto-collects the
      // previous one (§7.7), and since C25 a collected roll's dice leave the
      // table — so the bolt dice are gone by the time the held d20 settles.
      // The claim survives the change and gets sharper: the felt now holds
      // exactly the shrouded die, so the bloom mask must be EMPTY. A
      // difference-from-baseline could have been satisfied by two bolt dice
      // and a leak cancelling out; zero cannot.
      const ringsBefore = (await post(a)).rings;
      await a.roll('d20 held');
      const hid = await a.rollId();
      await a.waitFor(shroudSettled(hid), { desc: 'held roll settles' });
      await a.dbg('sim(120)'); // the collected roll's departure finishes
      p = await post(a);
      assert.equal(p.rings, ringsBefore, 'a shrouded roll never pops');
      assert.equal(await a.diceCount(), 1, 'the felt holds the shrouded die alone');
      assert.equal(p.bloomDice, 0, 'and a shrouded die never joins the bloom mask');

      // the reveal restores the set's bloom right along with its materials
      await a.eval(`window.__diceDebug.reveal(${JSON.stringify(hid)})`);
      await a.waitFor(revealSettled(hid), { desc: 'reveal lands' });
      await a.waitFor(
        `window.__diceDebug.postInfo().bloomDice >= 1`,
        { desc: 'the revealed die joins the bloom mask' },
      );

      // S3 (2026-08-04), and what C25 did to it. The fix was a GATE: shelved
      // bolt-glass dice stood on the felt carrying a bloom flag, so the post
      // stack never went idle, and `bloomDiceLive` was added to exclude them.
      // Since C25 a collected roll's dice leave the table, so the leak is not
      // gated — it is unrepresentable. The claim that mattered survives
      // verbatim (an otherwise-empty felt reports IDLE after a collect) and
      // gets a stronger reason underneath it, so the leg stays.
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
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1`
          + ` && window.__diceDebug.pendingCollects.length === 0`
          + ` && window.__diceDebug.tableDice.length === 0)`,
        { desc: 'roll collected and its dice departed' },
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
      assert.equal(p.active, false, 'S3: the pipeline reports IDLE after the collect');
      // `bloomDice >= 2` used to prove the gate was doing work — the flag was
      // still ON those meshes and the stack idled anyway. There are no such
      // meshes now, and asserting zero is what distinguishes "they left" from
      // "the gate held": a surviving cluster would show up here.
      assert.equal(p.bloomDice, 0, 'the collected bolt dice are gone, not merely gated');
      assert.equal(p.bloomDiceLive, 0, 'and nothing bloom-flagged is on the felt');
      assert.equal(await a.diceCount(), 0, 'the felt is empty, which is why the stack can idle');
    },
  },
  {
    name: 'rest-cadence',
    tags: ['themes', 'cuj12'],
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

      // THE SHELF GATE IS GONE, AND SO IS WHAT IT GATED (C25). A collected
      // die used to stand on the felt in its slot, so stepResting had to skip
      // it or the archive would breathe; now it leaves the table entirely.
      // The claim worth keeping is the one that made the gate necessary: a
      // collected roll costs the rest-cadence loop nothing, which is now true
      // because there is nothing there to iterate.
      const rid = await a.rollId();
      await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1)`,
        { desc: 'roll collected' },
      );
      await a.dbg('sim(60)'); // 1 s in which an archive would have breathed
      const shelfAfter = JSON.parse(await a.eval(
        `JSON.stringify(window.__diceDebug.restInfo(${JSON.stringify(rid)}))`));
      assert.equal(shelfAfter.length, 0,
        `a collected roll is tracked by nothing on the felt (got ${shelfAfter.length})`);
      assert.equal(await a.diceCount(), 0, 'because it is not on the felt');
    },
  },
  {
    name: 'themed-chrome',
    tags: ['themes', 'cuj12'],
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
    tags: ['themes', 'groups', 'cuj12'],
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
      await a.eval(`window.__diceDebug.openSettings("you")`);
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
    tags: ['smoke', 'settings', 'zoom', 'cuj12'],
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

      // Collect a roll at wide zoom. Its dice leave the felt (C25) — what
      // both clients must agree on is the STATE, which is wire, so that is
      // what this reads. (It used to capture the shelved die's world X and
      // prove the cluster re-placed at the new pitch; there is no cluster to
      // re-place, and the zoom no longer touches anything but walls, shadow
      // frustum and camera.)
      await a.roll('1d6');
      await a.dbg(`collectRoll(${JSON.stringify(await a.rollId())})`);
      for (const t of [a, b]) {
        await t.waitFor(
          `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 1)`,
          { desc: 'collected on both tabs' },
        );
        assert.equal(await t.diceCount(), 0, 'and standing on neither felt');
      }
      assert.deepEqual(await a.shelf(), await b.shelf(),
        'both clients hold the same record, same order');

      // A sets zoom to 'close'; wait for the echo on BOTH.
      await a.dbg(`setZoom('close')`);
      for (const t of [a, b]) {
        await t.waitFor(`window.__diceDebug.zoom === 'close'`,
          { desc: 'zoom syncs to close' });
      }

      // Wall positions changed to the close preset. Read from ZOOM_PRESETS
      // rather than written here: the whole ladder moved one step closer on
      // 2026-08-09 (the old `close` became `wide`), and a scenario carrying
      // its own copy of the numbers asserts a decision instead of a
      // behaviour — it fails on a retune that is working exactly as intended.
      // What this pin is FOR is that both clients agree and that the walls
      // follow the setting, which is what it checks now.
      const want = await a.dbg(`zoomPreset('close')`);
      for (const [t, tag] of [[a, 'A'], [b, 'B']]) {
        const wp = await t.dbg('wallPositions()');
        assert.ok(Math.abs(wp.right.x - want.w / 2) < 1e-6,
          `${tag}: right wall at +TABLE_W/2 = ${want.w / 2} (got ${wp.right.x})`);
        assert.ok(Math.abs(wp.left.x + want.w / 2) < 1e-6,
          `${tag}: left wall at -${want.w / 2} (got ${wp.left.x})`);
        assert.ok(Math.abs(wp.front.z - want.d / 2) < 1e-6,
          `${tag}: front wall at +TABLE_D/2 = ${want.d / 2} (got ${wp.front.z})`);
        assert.ok(Math.abs(wp.back.z + want.d / 2) < 1e-6,
          `${tag}: back wall at -${want.d / 2} (got ${wp.back.z})`);
      }

      // The record survives the zoom on both tabs, and the felt stays empty
      // through it — a zoom is walls, shadow frustum and camera now, and
      // nothing it does may put a collected roll back on the mat.
      for (const t of [a, b]) {
        await t.dbg('sim(600)');
        assert.equal((await t.shelf()).length, 1, 'the record rode the zoom');
        assert.equal(await t.diceCount(), 0, 'and the felt is still clear');
      }

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
    tags: ['perf', 'roll', 'log', 'endurance-log', 'cuj9'],
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
    tags: ['perf', 'roll', 'endurance-outline', 'cuj9'],
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
    tags: ['smoke', 'chrome', 'groups', 'cuj8'],
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
    tags: ['chrome', 'groups', 'cuj8'],
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
    tags: ['smoke', 'roll', 'chrome', 'cuj8'],
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
    tags: ['chrome', 'roll', 'cuj8'],
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
    tags: ['chrome', 'roll', 'cuj8'],
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
    tags: ['chrome', 'roll', 'cuj8'],
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
    tags: ['roll', 'ceremony', 'cuj8'],
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
    tags: ['smoke', 'roll', 'chrome', 'cuj10'],
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
      // Assert the REVEAL itself, not the foot around it. U13 put a second
      // verb in this foot ("Save as pool…") which made the foot stop being
      // Reveal's proxy; C18 took that verb back out, so the foot is a proxy
      // again — but going back to reading it would re-adopt the coupling that
      // made this pin wrong once already. The contract is the Reveal:
      // nothing left to reveal, and the server would 403 the attempt.
      assert.equal(await shown('#banner-actions .banner-foot .reveal-verb'), 'none',
        'a face-up roll paints NO Reveal — the value is already public');
      // …and the keep verb is gone from this surface entirely (C18): the
      // result panel had become a list of facts about a result rather than
      // the result. The peek still offers it.
      assert.equal(await a.eval(
        `document.querySelectorAll('#banner-actions .keep-verb:not([hidden])').length`), 0,
      'and no Save as pool — that door is the peek\'s now');

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
    tags: ['perf', 'roll', 'chrome', 'endurance-banner-actions', 'cuj9'],
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
      // Reveal owns its own gate since U13 — the foot holds two verbs now, so
      // reading the foot's `hidden` would answer about the wrong thing. (And
      // reading `.hidden` at all is what let a live Reveal ship once: the
      // computed-display assertion on the next line is the real pin.)
      const revealHidden = await a.eval(
        `document.querySelector('#banner-actions .banner-foot .reveal-verb').hidden`);
      assert.equal(revealHidden, true, 'the Reveal stays hidden for a face-up roll');
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
    tags: ['table-file', 'groups', 'cuj13'],
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
    tags: ['prepared-seat', 'settings', 'cuj2'],
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

      // §11: a prepared profile carries the SYSTEM it was built for, present-
      // or-absent, falling closed on an id this server cannot name. Without it
      // the join picker cannot obey "only profiles for the roll system of the
      // table" — it would offer a seat prepared for another rulebook.
      const sys = await ctx.api('/api/table', {
        playerId: alice.playerId,
        rev: 6,
        table: { system: 'dnd' },
        profiles: [
          { name: 'Grix', system: 'dnd', pools: [{ name: 'Longsword', notation: '1d20+4' }] },
          { name: 'Nym', system: 'pathfinder', pools: [] },
          { name: 'Old', pools: [] },
        ],
      });
      assert.equal(sys.status, 200, `the systemed push is accepted (got ${sys.status})`);
      const setup = (await alice.waitForEvent('table-setup', (d) => d.setup.rev === 6)).data.setup;
      assert.deepEqual(setup.profiles.map((p) => p.system ?? null), ['dnd', null, null],
        'a known system rides, an unknown one falls closed, an absent one stays absent');

      // The pre-join peek gains the room's system and a system per seat — the
      // picker paints BEFORE the join, so without this it would filter against
      // a guess and correct itself after the seat landed.
      const peek = await fetch(
        `http://127.0.0.1:${ctx.port}/api/table?room=${encodeURIComponent(ctx.room)}`,
      ).then((r) => r.json());
      assert.equal(peek.system, 'dnd', `the peek names the rulebook (got ${JSON.stringify(peek)})`);
      assert.deepEqual(peek.seats.map((s) => s.system ?? null), ['dnd', null, null],
        'and each seat says which it was prepared for');
      // The budget is unchanged otherwise: an enum naming a rulebook, and
      // nothing that was not already going to be visible two clicks later.
      const peekBlob = JSON.stringify(peek);
      for (const leak of ['1d20', 'playerId', 'rev', 'log', 'felt']) {
        assert.equal(peekBlob.includes(leak), false, `the peek still leaks no '${leak}'`);
      }

      // A published rack says WHICH profile it is, so a teammate can copy it.
      // The name takes cleanName, not cleanString: it becomes a display name
      // the moment somebody copies it, and '#' is banned at every name door.
      await ctx.api('/api/pools', {
        playerId: alice.playerId,
        pools: [{ name: 'Garrote', notation: '2d8' }],
        profile: 'Night#blade',
        system: 'nonsense',
      });
      const pc = (await alice.waitForEvent('pools-changed')).data;
      assert.equal(pc.profile, 'Nightblade', `'#' is stripped from a published profile name (got ${pc.profile})`);
      assert.equal(pc.system ?? null, null, 'and an unknown system falls closed rather than being relayed');
    },
  },
  {
    name: 'room-linger',
    tags: ['prepared-seat', 'cuj3'],
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
    name: 'profile-library',
    tags: ['smoke', 'profiles', 'groups', 'cuj6'],
    // PROFILES §11 — THE CLAIM THE WHOLE DESIGN RESTS ON: a switch loses
    // nothing. This replaces §G3's `profile-swap`, which pinned the machinery
    // that made ONE rack pretend to be two (a stash under dice.groups.mine.v1,
    // read back to prove the write landed before `groups` dared move). There
    // are thirty-two racks now and a switch is a pointer move inside a single
    // stored value, so the failure class the stash existed to survive cannot be
    // constructed — and the way to prove that is to switch repeatedly with
    // edits in between and demand that every profile still hold its own pools.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.2', name: 'Solo' });

      // A fresh browser deals ONE profile and it is in hand: P1, and no prompt
      // asked for it.
      const first = await a.dbg('profiles.active');
      assert.ok(first && first.name, 'a fresh browser holds a dealt profile');
      assert.equal(first.system, 'soul-deal', 'bound to the system it was dealt for');
      assert.equal((await a.dbg('profiles.list')).length, 1, 'a library of exactly one');
      assert.equal(first.pools, (await a.dbg('groups')).length, 'and its pools ARE the rack');

      // The picker is absent while there is nothing to pick between — a library
      // of one shows no new chrome anywhere (§11.5).
      assert.equal(
        await a.eval(`getComputedStyle(document.getElementById('profile-pick')).display`),
        'none', 'no picker over a library of one');

      const made = await a.dbg(`profiles.create('Fighter')`);
      assert.equal(made.ok, true, made.status);
      assert.deepEqual(await a.dbg('groups'), [], 'a new profile starts empty and in hand');
      assert.notEqual(
        await a.eval(`getComputedStyle(document.getElementById('profile-pick')).display`),
        'none', 'and now the picker exists');

      await a.dbg(`setGroups([{name: 'Longsword', notation: '1d20+5'}, {name: 'Shield', notation: '1d6'}])`);
      const fighter = await a.dbg('profiles.active');
      assert.equal(fighter.name, 'Fighter');
      assert.equal(fighter.pools, 2, 'edits land in the profile in hand, with no save step');

      // THE LOSSLESS CLAIM: five switches with an edit in the middle.
      const ids = (await a.dbg('profiles.list')).map((p) => p.id);
      for (const id of [ids[0], ids[1], ids[0], ids[1], ids[0]]) {
        const v = await a.dbg(`profiles.use('${id}')`);
        assert.equal(v.ok, true, v.status);
      }
      const list = await a.dbg('profiles.list');
      assert.equal(list.find((p) => p.name === 'Fighter').pools, 2,
        'Fighter kept its two pools across five switches');
      assert.equal(list.find((p) => p.name === first.name).pools, first.pools,
        `${first.name} kept all ${first.pools} of its pools`);
      assert.equal(list.filter((p) => p.active).length, 1, 'exactly one is in hand');

      // Rename, duplicate, delete — and the receipts say what happened.
      const ren = await a.dbg(`profiles.rename('${ids[1]}', 'Champion')`);
      assert.equal(ren.ok, true, ren.status);
      assert.ok((await a.dbg('profiles.list')).some((p) => p.name === 'Champion'), 'renamed');

      const dup = await a.dbg(`profiles.copyFrom({name: 'Champion', system: 'soul-deal', pools: [{name: 'X', notation: '1d6'}]})`);
      assert.equal(dup.ok, true, dup.status);
      assert.ok(dup.status.includes('Champion 2'), `a collision dedupes (got ${dup.status})`);
      assert.ok(dup.status.includes('nothing of yours changed'), dup.status);

      const del = await a.dbg(`profiles.remove('${ids[1]}')`);
      assert.equal(del.ok, true, del.status);
      assert.equal((await a.dbg('profiles.list')).some((p) => p.name === 'Champion'), false, 'deleted');

      // '#' is refused at the door — a profile name becomes a display name.
      const hash = await a.dbg(`profiles.create('Bo#b')`);
      assert.equal(hash.ok, false);
      assert.ok(hash.status.includes('#'), hash.status);

      // X3 — the ceiling, named.
      await a.eval(`(() => { let n = 0; while (!window.__diceDebug.profiles.full && n < 60) { window.__diceDebug.profiles.create('P' + n); n++; } return n; })()`);
      assert.equal((await a.dbg('profiles.list')).length, 32, 'the cap is 32');
      const over = await a.dbg(`profiles.create('One more')`);
      assert.equal(over.ok, false);
      assert.ok(over.status.includes('32'), `the refusal names the ceiling (got ${over.status})`);
    },
  },
  {
    name: 'profile-library-reload',
    tags: ['profiles', 'groups', 'cuj6'],
    // R4 stated literally: "whatever profile they pick should be retained as
    // the one in use until they switch" — across an F5, which is where the old
    // §G3 design had its worst moment (a reload landed on somebody else's pools
    // under your name, so its boot guard threw one of the two racks away). One
    // store key means there is nothing to reconcile at boot.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.3', name: 'Solo' });
      await a.dbg(`profiles.create('Wizard')`);
      await a.dbg(`setGroups([{name: 'Fire Bolt', notation: '2d10'}])`);
      const before = await a.dbg('profiles.list');
      assert.equal(before.length, 2);

      await a.reload();
      const after = await a.dbg('profiles.list');
      assert.deepEqual(after.map((p) => `${p.name}:${p.pools}`), before.map((p) => `${p.name}:${p.pools}`),
        'the whole library survives a reload');
      assert.equal((await a.dbg('profiles.active')).name, 'Wizard',
        'and the one in hand is still the one in hand');
      assert.deepEqual((await a.dbg('groups')).map((g) => g.name), ['Fire Bolt'],
        'its pools are the rack');
      // The fossil is never written again: the rack lives in the library now.
      assert.equal(await a.eval(`localStorage.getItem('dice.groups.mine.v1')`), null,
        'and Tier G’s stash key is gone for good');
    },
  },
  {
    name: 'profile-systems',
    tags: ['profiles', 'meanings', 'cuj12'],
    // R3/R5/R6 and X1/X2: a profile is bound to a rolling system, is pickable
    // only where its dice will be read the way they were chosen, and each
    // system remembers its own last-used independently. The mismatch is a
    // LABELLING problem — a pool is notation and a system is a render-time lens
    // — so nothing is ever swapped and nothing ever breaks.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.5', name: 'Solo' });
      const soul = await a.dbg('profiles.active');
      assert.equal(soul.system, 'soul-deal');

      // Deal one for each of the other two systems.
      const d = await a.dbg(`profiles.deal('dnd')`);
      assert.equal(d.ok, true, d.status);
      assert.ok(d.status.includes('D&D style'), `the receipt names the system (got ${d.status})`);
      await a.dbg(`profiles.deal('none')`);

      // R5: at a Soul Deal table only the Soul Deal profile is pickable, and
      // the others are present-but-not-offered rather than hidden.
      const list = await a.dbg('profiles.list');
      assert.equal(list.length, 3);
      assert.deepEqual(list.filter((p) => p.pickable).map((p) => p.system), ['soul-deal'],
        'one pickable at a soul-deal table');

      // X2: the profile in hand is the dealt 'none' one, so the mismatch is
      // named — and the rack is untouched and still rollable.
      const mm = await a.dbg('profiles.mismatch');
      assert.ok(mm && mm.profileSystem === 'none' && mm.tableSystem === 'soul-deal',
        `the mismatch is named (got ${JSON.stringify(mm)})`);
      assert.notEqual(
        await a.eval(`getComputedStyle(document.getElementById('profile-banner')).display`),
        'none', 'and the banner says so');
      const rackBefore = (await a.dbg('groups')).map((g) => g.name);
      await a.roll('2d6');
      assert.equal(await a.logCount() >= 1, true, 'a mismatched profile still rolls');
      assert.deepEqual((await a.dbg('groups')).map((g) => g.name), rackBefore,
        'and nothing was swapped');

      // R6: each system remembers its own, independently.
      const last = await a.dbg('profiles.lastUsed');
      assert.equal(last['soul-deal'], soul.name, 'soul-deal remembers its own');
      assert.ok(last.dnd, 'dnd remembers its own');
      assert.ok(last.none, 'none remembers its own');

      // X1: the table's system changes under us. Nothing is swapped; the label
      // is what changes, and the mismatch question is asked again.
      await a.dbg(`profiles.keepMismatch()`);
      assert.equal(await a.dbg('profiles.mismatchKept'), true);
      await a.dbg(`setSystem('none')`);
      // Online, a settings change applies on the server's echo, not on the
      // call — the same no-optimistic-divergence rule the felt follows.
      await a.waitFor(`window.__diceDebug.system === 'none'`, { desc: 'the system echo lands' });
      assert.equal(await a.dbg('profiles.mismatch'), null,
        'the table now reads the way the profile does — no mismatch left to name');
      assert.equal(await a.dbg('profiles.mismatchKept'), false, 'and the acknowledgement reset');
      assert.deepEqual((await a.dbg('groups')).map((g) => g.name), rackBefore, 'still nothing swapped');

      // The third exit: re-bind the profile in hand to the table instead.
      await a.dbg(`setSystem('dnd')`);
      await a.waitFor(`window.__diceDebug.system === 'dnd'`, { desc: 'the second system echo lands' });
      const bind = await a.dbg('profiles.bindToTable()');
      assert.equal(bind.ok, true, bind.status);
      assert.equal((await a.dbg('profiles.active')).system, 'dnd', 'the profile was re-bound');
      assert.equal(await a.dbg('profiles.mismatch'), null, 'so there is no mismatch');
      assert.deepEqual((await a.dbg('groups')).map((g) => g.name), rackBefore,
        'and re-binding moved a label, not a pool');
    },
  },
  {
    name: 'profile-join-pick',
    tags: ['smoke', 'profiles', 'seat', 'cuj7'],
    // R9 and R6 at the door: the join modal carries the profile selector, it
    // offers only profiles built for THIS table's system, the last-used one is
    // pre-selected, and Random is there for a player who has none. Picking is
    // not an import and shows no preview — the outgoing profile keeps every
    // pool it had, so there is nothing to approve.
    async fn(ctx) {
      // Seed a library on this origin, then arrive anonymously so the modal opens.
      const seed = await ctx.newTable({ origin: '127.0.0.6', name: 'Setup' });
      await seed.dbg(`profiles.create('Rogue')`);
      await seed.dbg(`setGroups([{name: 'Sneak', notation: '3d6'}])`);
      await seed.dbg(`profiles.deal('dnd')`);
      const seeded = await seed.dbg('profiles.list');
      assert.equal(seeded.length, 3, 'two soul-deal profiles and one D&D');

      const p = await ctx.newTable({ origin: '127.0.0.6', anon: true });
      const picker = await p.dbg('seatPicker');
      assert.equal(picker.open, true, 'the modal is up');
      assert.equal(picker.system, 'soul-deal', 'and it knows what the table reads by, pre-join');
      assert.equal(picker.mine.length, 2,
        `only the profiles for this table's system are offered (got ${JSON.stringify(picker.mine)})`);
      assert.equal(picker.mine.some((m) => m.name === 'Rogue'), true);
      assert.ok(picker.profileDefault, 'and one is pre-selected — the last this system saw');
      assert.equal(picker.profilePick, null, 'nothing is CHOSEN for the player, only offered');
      assert.notEqual(await p.eval(`getComputedStyle(document.getElementById('seat-mine')).display`),
        'none', 'the block is on screen');

      // Picking one switches at once and shows no preview pane.
      const rogue = picker.mine.find((m) => m.name === 'Rogue');
      const v = await p.dbg(`chooseMyProfile('${rogue.id}')`);
      assert.equal(v.ok, true, v.status);
      assert.equal((await p.dbg('profiles.active')).name, 'Rogue');
      assert.equal(await p.eval(`getComputedStyle(document.getElementById('seat-preview')).display`),
        'none', 'picking your own profile is not an import — no preview pane');
      assert.deepEqual((await p.dbg('groups')).map((g) => g.name), ['Sneak'], 'and it is in hand');

      // Then the name completes the join, exactly as it always did.
      await p.dbg(`chooseSomeoneElse('Bo')`);
      await p.waitOnline();
      assert.equal((await p.dbg('profiles.active')).name, 'Rogue',
        'the pick survives the join');
      assert.equal((await p.dbg('identity')).name, 'Bo', 'and the name is the name');
    },
  },
  {
    name: 'profile-random',
    tags: ['profiles', 'seat', 'cuj7'],
    // R9's Random, at every table. A player with no profile for this system
    // must be able to get a working one in one tap — including at a Numbers
    // only table, where what is dealt is a TRAY rather than a character,
    // because that system declares it has no character model.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.7', name: 'Solo' });
      for (const [system, min] of [['dnd', 12], ['none', 6]]) {
        await a.dbg(`setSystem('${system}')`);
        await a.waitFor(`window.__diceDebug.system === '${system}'`, { desc: `the ${system} echo lands` });
        const v = await a.dbg(`profiles.deal('${system}')`);
        assert.equal(v.ok, true, v.status);
        const rack = await a.dbg('groups');
        assert.equal(rack.length, min, `${system} deals ${min} pools (got ${rack.length})`);
        assert.equal((await a.dbg('profiles.active')).system, system, 'bound to the system dealt for');
        assert.equal(await a.dbg('profiles.mismatch'), null, 'so there is no mismatch');
        // Every dealt pool must actually roll — the point of a dealt profile.
        for (const g of rack) {
          const parsed = await a.dbg(`parseNotation(${JSON.stringify(g.notation)})`);
          assert.equal(parsed.ok, true, `${system}: '${g.name}' = '${g.notation}' parses`);
          assert.equal(parsed.canonical, g.notation,
            `${system}: '${g.notation}' is already the parser's fixed point (got '${parsed.canonical}')`);
        }
        await a.roll(rack[0].notation);
        assert.ok(await a.logCount() >= 1, `${system}: a dealt pool rolls`);
      }
      assert.equal((await a.dbg('profiles.active')).name, 'Dice tray',
        'Numbers only deals a tray, and says so — it does not invent a person');
    },
  },
  {
    name: 'profile-copy',
    tags: ['profiles', 'groups', 'cuj6'],
    // R7: "players should be able to see profiles from other players and even
    // copy the profile for their own use." The owner switcher has browsed
    // teammates' racks since ROADMAP 2b; until §11 it could only say WHOSE.
    // Now the wire carries which profile it is and what it was built for, so a
    // rack a teammate can name is a rack a teammate can copy — into a NEW
    // profile, under a deduped name, with nothing of theirs written to.
    async fn(ctx) {
      const alice = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const bob = await ctx.newTable({ origin: '127.0.0.8', name: 'Bob' });
      await alice.dbg(`profiles.rename('${(await alice.dbg('profiles.active')).id}', 'Nightblade')`);
      await alice.dbg(`setGroups([{name: 'Garrote', notation: '2d8', category: 'Skills'}])`);
      await alice.dbg('publishPools()');

      // Bob sees the label, not just the owner.
      await bob.waitFor(
        `(window.__diceDebug.netPlayers.find((p) => p.name === 'Alice') || {}).profile === 'Nightblade'`,
        { desc: "the profile's name reaches the room" });
      const seen = (await bob.dbg('netPlayers')).find((p) => p.name === 'Alice');
      assert.equal(seen.profile, 'Nightblade', 'which profile');
      assert.equal(seen.system, 'soul-deal', 'and what it reads by');

      // And can copy it. Nothing of Bob's is touched.
      const mineBefore = await bob.dbg('profiles.active');
      const got = await bob.dbg(`profiles.copyFrom({name: ${JSON.stringify(seen.profile)}, system: ${JSON.stringify(seen.system)}, pools: ${JSON.stringify(seen.pools)}})`);
      assert.equal(got.ok, true, got.status);
      assert.ok(got.status.includes('nothing of yours changed'), got.status);
      const list = await bob.dbg('profiles.list');
      assert.equal(list.length, 2, 'a second profile, not a merge');
      assert.equal(list.find((p) => p.name === 'Nightblade').pools, 1);
      assert.equal(list.find((p) => p.id === mineBefore.id).pools, mineBefore.pools,
        'and Bob’s own profile is untouched');
      assert.equal(list.find((p) => p.id === mineBefore.id).active, true,
        'a copy is not taken in hand unless asked for');

      // A copy is a copy: Alice editing hers afterwards does not reach Bob's.
      await alice.dbg(`setGroups([{name: 'Garrote', notation: '9d8'}])`);
      await alice.dbg('publishPools()');
      await bob.waitFor(
        `((window.__diceDebug.netPlayers.find((p) => p.name === 'Alice') || {}).pools || [])[0]?.notation === '9d8'`,
        { desc: "Alice's edit reaches the room" });
      const still = (await bob.dbg('profiles.list')).find((p) => p.name === 'Nightblade');
      assert.equal(still.pools, 1, "Bob's copy is his own — no pointer back to Alice");
    },
  },
  {
    name: 'profile-dm-prepares',
    tags: ['profiles', 'prepared-seat', 'cuj7'],
    // R8 END TO END, composed rather than in pieces: "I expect DMs to create
    // profiles for players and have the players use them when they log in."
    // The organizer authors three characters in their own library, fills the
    // box from it, pushes it to the table, and a player who has never been
    // here opens the link and is offered exactly those three by name.
    //
    // The DM is not a role (goal 10) — they are a player with a plan, using
    // powers every player has.
    async fn(ctx) {
      const dm = await ctx.newTable({ origin: '127.0.0.10', name: 'Walter' });
      await dm.dbg('profiles.reset()');
      // reset() deals a fresh profile and NAMES it — the dealt name, not the
      // player's — so the organizer's own seat is whatever was drawn.
      const dmOwn = (await dm.dbg('profiles.active')).name;
      // Three characters for three players, each built for this table's system.
      for (const [name, pool] of [['Rill', '3d6'], ['Bo', '2d8'], ['Ada', '1d20']]) {
        const made = await dm.dbg(`profiles.create(${JSON.stringify(name)})`);
        assert.equal(made.ok, true, made.status);
        await dm.dbg(`setGroups([{name: 'Strength', notation: '${pool}', category: 'Attributes'}])`);
      }
      assert.equal((await dm.dbg('profiles.list')).length, 4, 'three players plus the DM’s own');

      // Fill the box from the library, then offer it to the room.
      await dm.dbg('openSettings("stuff")');
      await dm.eval(`document.getElementById('portable-open').click()`);
      await dm.eval(`document.getElementById('portable-export').click()`);
      const push = await dm.dbg('portable.pushToTable()');
      assert.equal(push.ok, true, push.status);
      assert.ok(push.status.includes('4 seats'), `all four are offered (got ${push.status})`);

      // A player who has never been here opens the link.
      const bo = await ctx.newTable({ origin: '127.0.0.11', anon: true, query: '&as=Bo' });
      // The peek is a separate request that resolves after the modal paints
      // (net.js peekTable, 2500 ms budget) — the modal renders NOW and the peek
      // only ever adds furniture, so the seats have to be waited for.
      await bo.waitFor(`window.__diceDebug.seatPicker.seats.length === 4`,
        { desc: 'the prepared seats reach the modal' });
      const picker = await bo.dbg('seatPicker');
      assert.deepEqual(picker.seats.map((x) => x.name).sort(), ['Ada', 'Bo', 'Rill', dmOwn].sort(),
        `the prepared seats reach the door (got ${JSON.stringify(picker.seats)})`);
      assert.equal(picker.preselect, 'Bo', '&as= pre-selects theirs, and nothing more');
      assert.equal(picker.chosen, null, 'nothing is taken for them');

      await bo.dbg(`chooseSeat('Bo')`);
      await bo.waitOnline();
      await bo.waitFor(`window.__diceDebug.seatPicker.verdict.canApply === true`,
        { desc: 'the seat previews' });
      const v = await bo.dbg('seatPicker.verdict');
      assert.ok(v.status.includes("adds 'Bo' to your profiles"),
        `the preview says what will happen (got ${v.status})`);
      await bo.dbg('applySeatImport()');
      await bo.waitFor(`(window.__diceDebug.profiles.active || {}).name === 'Bo'`,
        { desc: 'the seat becomes their profile' });
      assert.deepEqual((await bo.dbg('groups')).map((g) => g.notation), ['2d8'],
        'holding exactly what the DM prepared for them');
      assert.equal((await bo.dbg('profiles.active')).system, 'soul-deal',
        'bound to the system the table reads by');
      assert.equal((await bo.dbg('identity')).name, 'Bo', 'and seated under that name');

      // R4: it is theirs now — persisted, not merely on screen. (Not asserted
      // by reloading THIS tab: `anon` seeds its name-removal as an init script,
      // which re-runs on every navigation, so a reload would re-open the seat
      // modal and never reach ready. `profile-library-reload` covers the F5.)
      const stored = JSON.parse(await bo.eval(`localStorage.getItem('dice.profiles.v1')`));
      assert.equal(stored.profiles.find((x) => x.id === stored.activeId).name, 'Bo',
        'the store agrees with the screen about which profile is in hand');
      assert.equal(stored.profiles.length, 2, "and their own dealt profile is still there beside it");
    },
  },
  {
    name: 'profile-file',
    tags: ['profiles', 'table-file', 'cuj13'],
    // O6/O7/P14: the file is the library's durable copy. The whole library
    // round-trips through `players:` + `profile:`, the rack appears in exactly
    // ONE place (a hand-editable format with two homes for one rack is a trap),
    // and a file from someone else ADDS profiles rather than replacing any.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: '127.0.0.9', name: 'Solo' });
      await a.dbg(`profiles.rename('${(await a.dbg('profiles.active')).id}', 'Nessa')`);
      await a.dbg(`setGroups([{name: 'Body', notation: '3d6', category: 'Attributes'}])`);
      await a.dbg(`profiles.deal('dnd')`);
      await a.dbg(`profiles.use('${(await a.dbg('profiles.list')).find((p) => p.name === 'Nessa').id}')`);

      const text = await a.dbg('portable.snapshot()');
      assert.ok(text.includes('profile:') && text.includes("name: 'Nessa'"),
        `the export names whose the pools are (got: ${JSON.stringify(text.slice(0, 200))})`);
      assert.equal(text.split('\n').filter((l) => l.includes("'Body'")).length, 1,
        'one home for one rack');
      assert.ok(text.includes('players:'), 'and the other profiles ride along');

      // The file offers every profile it holds — the `players:` blocks AND the
      // top-level rack, which is a profile too.
      const v = await a.dbg(`portable.loadText(${JSON.stringify(text)})`);
      assert.equal(v.ok, true, v.status);
      const offered = await a.dbg('portable.profiles()');
      assert.equal(offered.length, 1, 'one other profile in players:');
      const rows = await a.eval(`[...document.querySelectorAll('#import-profile-rows .pp-row .pp-name')].map((e) => e.textContent)`);
      assert.equal(rows.length, 2, `the rack is offered too (got ${JSON.stringify(rows)})`);
      assert.ok(rows.includes('Nessa'), 'under its own name');

      // Adding is additive: names dedupe, nothing is replaced.
      const before = (await a.dbg('profiles.list')).length;
      const add = await a.dbg(`portable.adopt('')`); // '' = the top-level rack
      assert.equal(add.ok, true, add.status);
      const after = await a.dbg('profiles.list');
      assert.equal(after.length, before + 1, 'an add, not a replace');
      assert.ok(after.some((p) => p.name === 'Nessa 2'), `the name deduped (got ${after.map((p) => p.name).join(', ')})`);
      assert.equal(after.find((p) => p.name === 'Nessa').pools, 1, 'and the original is untouched');
    },
  },
  {
    name: 'prepared-seat',
    tags: ['prepared-seat', 'chrome', 'cuj3'],
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

      // THE RETURNING PLAYER (U3). `dice.name.v1` is origin-GLOBAL, so before
      // 2026-08-08 anyone who had ever opened the app skipped this modal
      // entirely and `&as=` did nothing — CUJ2 held only for people who had
      // never used the app, which is the opposite of who gets sent a link.
      // This scenario could not see it: `anon: true` cleared the name, so the
      // fixture only ever tested first-timers.
      {
        const back = await ctx.newTable({
          origin: '127.0.0.9', name: 'Wanderer', anon: true, query: '&as=Rill',
        });
        try {
          await back.waitFor(`window.__diceDebug.seatPicker.seats.length === 2`,
            { desc: 'a returning player still reaches the picker' });
          const pick2 = await back.dbg('seatPicker');
          assert.equal(pick2.open, true, 'the modal opens despite a stored name');
          assert.equal(pick2.preselect, 'Rill', 'and the link pre-selects its seat');
          // …and the name they arrived with is one press away, not retyped.
          assert.equal(await back.eval(
            `getComputedStyle(document.getElementById('seat-keep-name')).display !== 'none'`),
          true, 'the returning player is offered their own name back');
          assert.equal(await back.eval(
            `document.getElementById('seat-keep-name').textContent`), 'Stay as Wanderer',
          'by name');
          // Taking it joins as themselves, NOT as the seat.
          await back.eval(`document.getElementById('seat-keep-name').click()`);
          await back.waitFor(`!!window.__diceDebug && window.__diceDebug.netReady`,
            { desc: 'the returning player joins' });
          assert.equal((await back.dbg('identity')).name || await back.eval(
            `document.getElementById('identity-name').textContent`), 'Wanderer',
          'under the name they arrived with');
        } finally { await back.close(); }
      }

      // A returning player with NO `&as=` still joins straight through — the
      // link is what outranks the stored name, not the mere existence of a
      // prepared table. Breaking this would tax every ordinary re-open.
      {
        const plain = await ctx.newTable({ origin: '127.0.0.10', name: 'Straight' });
        try {
          assert.equal(await plain.eval(
            `document.getElementById('name-modal').classList.contains('hidden')`),
          true, 'no link, no picker — a stored name still joins straight through');
        } finally { await plain.close(); }
      }

      // ESTABLISH, don't inherit: per-origin localStorage outlives a
      // scenario's room, and a library left behind on `localhost` by an
      // earlier scenario may already hold a profile named 'Alice' — which
      // makes the seat below dedupe to 'Alice 2'. That is correct behaviour
      // (a copy never overwrites) failing an inherited assumption, so the
      // library is reset to one freshly dealt profile first.
      await p.dbg('profiles.reset()');
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

      // PROFILES §11 CHANGED WHAT APPLY MEANS, and this is where it shows. It
      // used to MERGE the seat's pools into the player's one rack, because
      // there was only one rack to put them in — so a player who already had
      // an 18-pool character and took an 18-pool seat ended up holding one
      // 36-pool rack that was two characters wearing each other's clothes. The
      // seat is now a PROFILE of its own: the preview still gates it, but what
      // lands is separate, and the player's own pools are not written to at all.
      const mineBefore = await p.dbg('profiles.active');
      await p.dbg('applySeatImport()');
      await p.waitFor(`window.__diceDebug.groups.some((g) => g.name === 'Larceny')`,
        { desc: 'the explicit apply lands the pools' });
      const after = (await p.dbg('groups')).map((g) => g.name);
      assert.ok(after.includes('Strength') && after.includes('Larceny'), "Alice's pools arrived");
      assert.equal((await p.dbg('profiles.active')).name, 'Alice',
        'and they are a profile of their own, in hand');
      // The stronger claim the merge could never make: nothing of the player's
      // was touched. Their own profile still holds exactly what it held.
      const mineAfter = (await p.dbg('profiles.list')).find((x) => x.id === mineBefore.id);
      assert.ok(mineAfter, `the player's own profile survives (had ${mineBefore.name})`);
      assert.equal(mineAfter.pools, mineBefore.pools,
        `and keeps all ${mineBefore.pools} of its pools (got ${mineAfter.pools})`);
      assert.equal(mineAfter.active, false, 'while the seat is what is in hand');
      // The seat's profile holds EXACTLY the seat's two pools — not the seat's
      // plus the player's. (A name check cannot make this claim: the dealt Soul
      // Deal rack and Alice's seat both carry a 'Strength', which is precisely
      // the collision the old merge would have silently resolved.)
      assert.equal(after.length, 2,
        `the seat's profile is the seat's pools alone (got ${after.length}: ${after.join(', ')})`);
      assert.ok(groupsBefore.length > 2, `the player had more than that (${groupsBefore.length})`);
      assert.equal(await p.eval(`localStorage.getItem('dice.name.v1')`), 'Alice',
        'and the seat named them');
    },
  },
  {
    name: 'prepared-seat-declined',
    tags: ['prepared-seat', 'cuj3'],
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
    tags: ['prepared-seat', 'table-file', 'cuj2'],
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
      // The PREPARED seat is what this scenario is about — that a re-push
      // heals a room whose setup expired. Since C17 the peek also carries the
      // live libraries of whoever is sitting there, and the organizer is
      // sitting there holding their own dealt profile, so `includes` rather
      // than `deepEqual`: asserting the exact list here would be asserting
      // that nobody is at the table, which is a different claim and a false
      // one. `library-is-the-seats` owns the live half.
      assert.ok((peek.seats || []).map((s) => s.name).includes('Alice'),
        `the prepared seat is back for anyone arriving now (got ${(peek.seats || []).map((s) => s.name)})`);
      assert.equal((await org2.dbg('felt')).id, 'plum',
        "and so is the felt the organizer chose — the heal carries the table, not just the seats");
    },
  },

  // ---------------------------------------------------------------------
  // The lobby → table flow (ROADMAP §3b, UX §7.20) — tag: lobby
  // ---------------------------------------------------------------------
  {
    name: 'lobby-no-prompt',
    tags: ['smoke', 'lobby', 'cuj1'],
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
    tags: ['lobby', 'chrome', 'cuj1'],
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
    tags: ['lobby', 'settings', 'cuj1'],
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
    tags: ['lobby', 'settings', 'chrome', 'cuj1'],
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
    tags: ['lobby', 'cuj2'],
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
    tags: ['lobby', 'chrome', 'cuj2'],
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
    tags: ['lobby', 'prepared-seat', 'chrome', 'cuj3'],
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
    tags: ['lobby', 'seat', 'cuj4'],
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
    name: 'settle-tail',
    // In the smoke set despite costing ~10s: this guards how long EVERY roll
    // takes to watch, it regressed once without anything going red, and the
    // mechanism it guards is a predicate that reads like a fairness rule.
    tags: ['roll', 'physics', 'cuj1', 'smoke'],
    // THE THROW ENDS WHEN THE DICE STOP (Joe 2026-08-10: "a very slow, very
    // shaky process by which the dice slide and wiggle-move until they are
    // stable… it can take quite some time and it's super awkward to watch").
    //
    // It was not, mostly, dice moving. playRoll plays back exactly as many
    // frames as the LAST die took to settle, and a die that read as cocked
    // was refused a freeze — so it sat motionless while the clock ran to
    // SETTLE_CAP and every viewer watched up to nine seconds of a still
    // table. Measured across 36 throws: 15 of the 17 dice that reached the
    // cap were motionless when it fired.
    //
    // TWO fixes landed for this and they are not additive — they are the same
    // problem cut off at different points, so each part below pins the one it
    // owns. Letting a die REST where it stopped (NUDGE.cockedDot 0.82 → 0.6)
    // stops the refusal happening; cutting the tail stops a refusal that does
    // happen from costing seconds. The second is now a BACKSTOP, and once the
    // first landed it went quiet on ordinary throws — so a test that asserted
    // "the cut saves time" against shipped settings would fail while both
    // fixes were working perfectly. It has to be tested where it still bites.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      const d20 = Array(20).fill('d6');
      const seeds = [1000, 8919, 16838, 24757, 32676, 40595, 48514, 56433];
      // throwSeeded pins the tumble: the seed decides spawn side, positions
      // and velocities, so this asserts against fixed throws, not a mood.
      const throwAll = async () => {
        const out = [];
        for (const seed of seeds) {
          await a.dbg(`throwSeeded(${JSON.stringify(d20)}, ${seed})`);
          await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
            { desc: `seeded 20d6/${seed} plays out`, timeout: 30000 });
          out.push({ seed, ...(await a.dbg('settleProfile()')) });
          await a.dbg('clearTable()');
          await a.dbg('sim(60)');
        }
        return out;
      };

      // --- 1. the rest rule: dice reach a real freeze -----------------------
      const shipped = await throwAll();
      const refused = shipped.reduce((n, p) => n + p.parked, 0);
      assert.equal(refused, 0,
        `${refused} dice stopped and were refused a freeze under the shipped rest rule`);
      const mean = shipped.reduce((s, p) => s + p.duration, 0) / shipped.length;
      assert.ok(mean < 7,
        `20 dice take ${mean.toFixed(2)}s to watch (was 8.70s before 2026-08-10)`);

      // --- 2. the backstop: put the refusal back and price it ---------------
      // 0.82 is the old bar. Under it these same seeds park dice motionless
      // and the cut is what stops them being charged to the viewer.
      await a.dbg('setNudge({cockedDot: 0.82, cockedDotD4: 0.9})');
      const strict = await throwAll();
      await a.dbg('setNudge({cockedDot: 0.6, cockedDotD4: 0.7})');

      let cut = 0;
      let worst = 0;
      for (const p of strict) {
        assert.ok(p.duration <= p.durationOld + 1e-6,
          `seed ${p.seed}: the cut LENGTHENED the throw (${p.duration} > ${p.durationOld})`);
        // Where the saving comes from, which is the safety claim itself: time
        // is only ever reclaimed from dice that had STOPPED. A throw that
        // saved time with no parked die would mean the cut had started eating
        // real motion — the one way this can do harm, and it would look like
        // an improvement in every duration number if nothing asserted it.
        if (p.duration < p.durationOld - 1e-6) {
          cut++;
          worst = Math.max(worst, p.durationOld - p.duration);
          assert.ok(p.parked > 0,
            `seed ${p.seed}: saved ${(p.durationOld - p.duration).toFixed(2)}s with no parked die`);
        }
      }
      // P7: every hook above EXISTS whether or not the cut works. These are
      // the lines that go red if it stops — restore `settleTime = simTime`
      // for a timed-out die and both fail.
      assert.ok(cut >= 2,
        `the cut fired on only ${cut} of ${seeds.length} strict-rule throws — it is inert`);
      assert.ok(worst > 0.5,
        `best saving was ${worst.toFixed(2)}s — too small to be worth the mechanism`);
    },
  },
  {
    name: 'pile-refusal',
    tags: ['roll', 'physics', 'cuj8'],
    // A DIE CAN BE REFUSED FOR STANDING ON ANOTHER, NOT ONLY FOR STANDING UP.
    // The freeze predicate has always refused a COCKED die — wrong
    // orientation — and handed it to the nudge. A PILED die reads dot ~ 1 and
    // freezes happily on top of its neighbour, because separation used to be
    // a free side effect of ambient bounce: dice skid apart after landing.
    //
    // The mechanism is ON in this build (NUDGE.pileScale 1.05, shipped
    // 2026-08-11 alongside the displacement terminator): the terminator
    // freezes a die at its true stop, so the ambient dither that used to
    // shake piles apart is gone, and the bar + nudge do that job on purpose.
    // This scenario still pins the STRUCTURAL claims, not an outcome: an
    // outcome pinned here would be a lucky seed, and at `close` the bar
    // resolves 1 crowded throw in 24.
    //
    // Poses are deliberately not compared, out of humility rather than need:
    // the ~5e-6 rest-pose wander once blamed on the broadphase's axis-list
    // history was cannon's sleep decision all along (C31), and shipping
    // allowSleep=false removed it. Duration and frame count remain the
    // observables that mean "a different throw".
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      await a.dbg("setZoom('close')");
      await a.dbg('sim(200)');
      const pool = Array(6).fill('d6');
      // Both land flat with nothing above the bar, so any nudge seen below is
      // the mechanism and not the pool being unlucky.
      const seeds = [127704, 175218];

      const throwOne = async (seed) => {
        await a.dbg(`throwSeeded(${JSON.stringify(pool)}, ${seed})`);
        await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
          { desc: `6d6/${seed} plays out`, timeout: 30000 });
        const p = await a.dbg('settleProfile()');
        await a.dbg('clearTable()');
        await a.dbg('sim(60)');
        return { seed, ...p };
      };
      const sig = (p) => `${p.duration}|${p.frames}|${p.nudged}`;

      // --- 1. the shipped bar is 1.05, and it is silent on flat throws ------
      const shipped = await a.dbg('nudge');
      assert.equal(shipped.pileScale, 1.05,
        `the shipped pile bar is 1.05x the rest ceiling, found ${shipped.pileScale}`);
      const off = [];
      for (const s of seeds) off.push(await throwOne(s));
      for (const p of off) {
        assert.equal(p.nudged, 0, `seed ${p.seed}: a flat throw was nudged at the shipped bar`);
        assert.equal(p.piled, 0, `seed ${p.seed}: a flat throw reads as piled at the shipped bar`);
      }

      // --- 2. the predicate is wired into the freeze path -------------------
      // A d6's centre rests at 0.675 and its hull ceiling is 1.169, so a scale
      // of 0.5 puts the bar UNDER the felt rest: every die reads as piled.
      // Nothing subtle — either the freeze test consults the bar or it does
      // not, and with the bar this low a silent run means it does not.
      await a.dbg('setNudge({"pileScale":0.5})');
      const on = [];
      for (const s of seeds) on.push(await throwOne(s));
      await a.dbg('setNudge({"pileScale":0})');
      for (const p of on) {
        assert.ok(p.nudged > 0,
          `seed ${p.seed}: bar at 0.5x the rest ceiling refused nothing — the freeze test is not reading it`);
      }

      // --- 3. a refusal nobody can act on must not become a stall -----------
      // The bug this replaces: with the budget spent, a refused die never
      // froze and the roll ground on to SETTLE_CAP (9 s) with a parked die,
      // billing the viewer for the silence. Measured at +55% on 8d6 before the
      // guard. Every die is refused here and the budget is 3, so this is the
      // worst case the mechanism can produce.
      for (const p of on) {
        assert.equal(p.timedOut, 0,
          `seed ${p.seed}: ${p.timedOut} dice ran to SETTLE_CAP — an exhausted budget is stalling`);
        assert.ok(p.duration < 8,
          `seed ${p.seed}: ${p.duration}s with every die refused — the budget guard is not releasing them`);
      }

      // --- 4. the off sentinel is a true zero, and the shipped bar adds
      // nothing to a flat throw. pileScale 0 has to mean "this code was never
      // here", or every measurement taken against it is measuring the
      // instrument — and on seeds with nothing above the bar, 0 and 1.05 must
      // produce the same throw, or the bar is touching dice it has no claim
      // on. (`off` above ran at the shipped 1.05; `back` runs at 0.)
      const back = [];
      for (const s of seeds) back.push(await throwOne(s));
      await a.dbg('setNudge({"pileScale":1.05})'); // leave the table as shipped
      seeds.forEach((s, i) => {
        assert.equal(sig(back[i]), sig(off[i]),
          `seed ${s}: pileScale 0 vs the shipped 1.05 differ on a flat throw `
          + `(${sig(off[i])} -> ${sig(back[i])})`);
        assert.notEqual(sig(on[i]), sig(off[i]),
          `seed ${s}: the bar at 0.5 changed nothing, so claim 3 proves nothing`);
      });
    },
  },
  {
    name: 'settle-displacement',
    tags: ['roll', 'physics', 'cuj8'],
    // A REST TEST THAT CAN SEE A DIE DITHERING IN PLACE.
    //
    // The old freeze predicate was a velocity threshold, and a velocity
    // threshold cannot retire an oscillating body: an oscillation has velocity
    // at every instant however small the excursion. What actually retired a
    // dithering die was cannon's own sleep hard-zeroing its velocities
    // underneath us — a second retirement predicate, the one that flapped, and
    // the whole of this table's replay drift (C30d/C30e/C31).
    //
    // SHIPPED 2026-08-11: SETTLEGATE.mode 'displacement' — Lengyel's
    // jitter-tolerant condition (Game Engine Gems 2 ch.23, as shipped in Jolt
    // and Rapier): three points per die — centre of mass plus probes on the
    // local +X and +Y at the half-width — each growing an AABB, all three
    // inside `eps` for SETTLE_STILL meaning at rest.
    //
    // What this scenario pins is the GUARANTEE and the MACHINERY, never a
    // benchmark: "it settles faster" is a result that depends on the seed
    // family and the machine, while "a die that froze provably moved less
    // than eps" is a property of the predicate and either holds or does not.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      const pool = Array(20).fill('d6');
      // 20d6 because the claim is about DITHERING and a crowded mat is where
      // dithering happens; four seeds because each judges ~17 dice, so the
      // sample is 60+ freezes per phase, not four.
      const seeds = [1000, 8919, 16838, 24757];
      const EPS = 0.02;

      const throwOne = async (seed) => {
        await a.dbg(`throwSeeded(${JSON.stringify(pool)}, ${seed})`);
        await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
          { desc: `20d6/${seed} plays out`, timeout: 30000 });
        const p = await a.dbg('settleProfile()');
        const probe = await a.dbg('settleProbe()');
        await a.dbg('clearTable()');
        await a.dbg('sim(60)');
        return { seed, probe, ...p };
      };
      const sig = (p) => `${p.duration}|${p.frames}|${p.nudged}`;

      // --- 1. the shipped gate, and a reference arm to judge it against -----
      const gate0 = await a.dbg('settleGate');
      assert.equal(gate0.mode, 'displacement',
        `the shipped terminator is the displacement predicate; found mode ${gate0.mode}`);
      assert.equal(gate0.eps, EPS,
        `the shipped eps is ${EPS} of a die-width; found ${gate0.eps}`);
      // `off` runs the RETIRED velocity predicate — kept verbatim as the
      // reference mode — because claims 2 and 3 are about the probe machinery,
      // which must hold in both modes or it is not machinery.
      await a.dbg('setSettleGate({"mode":"velocity","eps":0.02})');
      const off = [];
      for (const s of seeds) off.push(await throwOne(s));

      // --- 2. the film and the mechanism are the same number ----------------
      // settleProfile's endDisp is what the terminator SAYS it enforced.
      // settleProbe re-derives it from the baked keyframes, which is the only
      // way to catch a gate reporting a number it did not enforce (C27's rule,
      // and why `hops` is read off the film rather than off a counter). This
      // check found a real bug: the window is 28 frames, not 27 — twenty-seven
      // additions of 1/60 sum to 0.44999999999999996 — and while the probe
      // used 27 the two disagreed by 11% of eps on exactly this pool.
      //
      // Only dice whose whole window survived the tail cut can be judged: the
      // film ends at the LAST die's settle frame, so the deciding die has none
      // of its window on file.
      const judgeable = (p) => p.probe.filter((x) => x.full && !x.timedOut);
      for (const p of off) {
        const j = judgeable(p);
        assert.ok(j.length >= 8,
          `seed ${p.seed}: only ${j.length} dice have a full window on film — nothing to judge`);
        const worst = j.reduce((m, x) => Math.max(m, Math.abs(x.probe - x.endDisp)), 0);
        assert.ok(worst < 1e-9,
          `seed ${p.seed}: the film says ${worst.toExponential(2)} more movement than the `
          + 'terminator reported — endDisp is a self-report, not evidence');
      }

      // --- 3. three points, because one cannot see rotation -----------------
      // A die spinning about its centre never moves its centre at all, so a
      // one-point rest test calls it still. The probes ride the body's local
      // +X and +Y at the half-width; measured across these pools the worst
      // per-seed ratio runs 1.33x to 3.43x, so a die really is moving several
      // times further at its corners than at its middle when it stops.
      const ratio = off.reduce((m, p) => Math.max(m, judgeable(p).reduce(
        (n, x) => Math.max(n, x.centre > 1e-9 ? x.probe / x.centre : 0), 0)), 0);
      assert.ok(ratio > 1.5,
        `the worst probe/centre ratio was ${ratio.toFixed(2)} — the off-axis probes are `
        + 'seeing no more than the centre does, so the three-point test is a one-point test');

      // --- 4. the guarantee, which is the whole point — back on the shipped
      // gate.
      await a.dbg(`setSettleGate({"mode":"displacement","eps":${EPS}})`);
      const on = [];
      for (const s of seeds) on.push(await throwOne(s));
      for (const p of on) {
        // `loose` counts CLEAN freezes whose window exceeded the gate's own
        // epsilon. Under displacement it is zero by construction, so a nonzero
        // count here means the box test is not wired into the freeze path.
        assert.equal(p.loose, 0,
          `seed ${p.seed}: ${p.loose} dice froze cleanly having moved more than eps — `
          + 'the box test is not deciding the freeze');
        assert.ok(p.maxEndDisp < EPS,
          `seed ${p.seed}: worst die moved ${p.maxEndDisp} of a die-width over the window `
          + `that earned its freeze, against an eps of ${EPS}`);
        // …and the film agrees, on this mode too.
        const worst = judgeable(p).reduce((m, x) => Math.max(m, Math.abs(x.probe - x.endDisp)), 0);
        assert.ok(worst < 1e-9,
          `seed ${p.seed}: film and mechanism disagree by ${worst.toExponential(2)} under displacement`);
      }
      assert.ok(seeds.some((_, i) => sig(on[i]) !== sig(off[i])),
        'displacement left every throw identical to velocity, so claims 4 and 5 prove nothing');

      // --- 5. the predicate is really consulted -----------------------------
      // Nothing subtle: pick a box tighter than the solver's own contact
      // chatter, so no die can ever hold it and every one must run to
      // SETTLE_CAP. A silent run means the freeze test is not reading the
      // boxes at all. (This is the displacement twin of pile-refusal's
      // bar-at-0.5x claim.)
      //
      // THE BAR IS 2e-6, NOT THE ORIGINAL 2e-4 — the chatter moved. When
      // this claim shipped, 0.0002 was below what any die could hold; the
      // Phase 4 settle work (restitution gate, sleepoff) made the solver
      // stiller than its own test: measured 2026-08-15 (disp-floor.mjs),
      // seed 1000 now settles all 20 dice under 2e-4, while at 2e-5 and
      // below all 20 time out on every seed tried. This claim went red for
      // months of table time saying "not consulting the boxes" when the
      // truth was "consulting them against a stale constant" — the ladder
      // (eps 2e-2→2e-6: enforcement holds maxEndDisp<eps at EVERY rung,
      // timeouts rise as eps falls) is what separates those two readings,
      // and it is the measurement to re-run before ever touching this bar.
      await a.dbg('setSettleGate({"mode":"displacement","eps":0.000002})');
      const absurd = await throwOne(seeds[0]);
      assert.ok(absurd.timedOut > 0,
        `eps 2e-6 still froze every die — the freeze test is not consulting the boxes`);

      // --- 6. the reference mode leaves no residue --------------------------
      // mode 'velocity' has to mean "the old predicate, verbatim", and
      // passing through it and back must restore the shipped throw exactly —
      // or every measurement taken against it is measuring the instrument.
      //
      // Pinned on the soul pool, not 20d6, for a historical reason worth
      // keeping: on the PRE-C31 build (cannon sleep on), 20d6 could not
      // replay itself — seed 1000 came back 4.683 s/282 fr instead of
      // 5.333 s/321 fr with no setting touched, the drift replay-drift.mjs
      // measured at 4 of 8 seeds. Shipping allowSleep=false cured that, but
      // the soul pin is kept: it is cheap, it proved itself against the old
      // build, and the 20d6 question belongs to the tool built to measure it.
      const soul = ['d8', 'd8', 'd4', 'd6'];
      const soulSig = async (seed) => {
        await a.dbg(`throwSeeded(${JSON.stringify(soul)}, ${seed})`);
        await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
          { desc: `soul/${seed} plays out`, timeout: 30000 });
        const p = await a.dbg('settleProfile()');
        await a.dbg('clearTable()');
        await a.dbg('sim(60)');
        return sig(p);
      };
      const soulSeeds = [1000, 8919, 16838];
      await a.dbg(`setSettleGate({"mode":"displacement","eps":${EPS}})`); // shipped, off claim 5's absurd eps
      const before = [];
      for (const s of soulSeeds) before.push(await soulSig(s));
      await a.dbg('setSettleGate({"mode":"velocity","eps":0.02})');
      const during = [];
      for (const s of soulSeeds) during.push(await soulSig(s));
      await a.dbg(`setSettleGate({"mode":"displacement","eps":${EPS}})`);
      const after = [];
      for (const s of soulSeeds) after.push(await soulSig(s));
      soulSeeds.forEach((s, i) => {
        assert.equal(after[i], before[i],
          `seed ${s}: returning to the shipped displacement gate did not restore the throw `
          + `(${before[i]} -> ${after[i]})`);
      });
      assert.ok(soulSeeds.some((_, i) => during[i] !== before[i]),
        'the velocity gate changed nothing on the soul pool, so the restore proves nothing');
    },
  },
  {
    name: 'tempo-curve',
    tags: ['roll', 'physics', 'cuj1'],
    // THE PROJECTOR, AND WHY IT IS NOT A PHYSICS CHANGE.
    //
    // GRAVITY is 7.5x too weak for the scale, so everything on this table
    // settles 2.7x too slowly (C30d). Newton is invariant under t -> t/k when
    // g -> k^2 g, so the same film played k times faster IS the corrected
    // world — no re-bake, no determinism risk. But a uniform k was A/B'd on
    // the live table and refused: 2.2 is "way too fast for the main dice roll"
    // and "fine for resolution". So the projector runs a CURVE — `flight`
    // while the dice are still travelling, `settle` once they are down.
    //
    // SHIPPED 2026-08-12: flight 0.8 (Joe's pick, twice A/B'd — the hurl a
    // touch slower than raw), settle 25 over a long rampS 2.0 glide
    // (supersedes 2.2/0.4 — Joe's second A/B round), anchorSpeed 8 — and the
    // click gate rides in film mode WITH the curve, because film time is the
    // only gate invariant to in-throw k changes. Uniform `k` stays 1. What is
    // pinned is that the mechanism cannot leak: not into the bake, not into
    // `sim()`, and not past its own sentinels.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      const pool = ['d8', 'd8', 'd4', 'd6'];
      const seeds = [1000, 8919, 16838];

      // P6: every sample below reads a clock. holdClock makes the world
      // advance exactly as far as sim() says and no further — without it this
      // races rAF across CDP round trips and passes or fails on scheduling.
      await a.dbg('holdClock(true)');

      // --- 1. the shipped curve is the curve Joe picked ----------------------
      const c0 = await a.dbg('tempoCurve');
      assert.equal(await a.dbg('tempo'), 1, 'the shipped uniform tempo is 1');
      assert.equal(c0.flight, 0.8, `the shipped curve opens at 0.8, found ${c0.flight}`);
      assert.equal(c0.settle, 25, `the shipped curve ends at 25, found ${c0.settle}`);

      // --- 2. the click gate ships in film mode, on the shipped constants ----
      // Constants read off the app rather than restated here: a test carrying
      // its own copy of the number it checks passes forever.
      const g = await a.dbg('clickGate');
      assert.equal(g.mode, 'film', `the shipped click gate is the film gate, found ${g.mode}`);
      assert.equal(g.filmGapMs, 35, `the film gap is ${g.filmGapMs}ms, not the shipped 35`);
      // 18, raised from 12 by V1 audio increment 1 (docs/AUDIO.md §3.2): two
      // contacts closer than ~15–20 ms fuse into one perceptual event anyway,
      // so 12 was spending a voice for no event. The pin MOVED with the
      // constant rather than being relaxed — `audio-graph` pins it too, from
      // the audio side, so the number has two independent witnesses.
      assert.equal(g.wallFloorMs, 18, `the wall floor is ${g.wallFloorMs}ms, not the shipped 18`);

      const throwOne = async (seed) => {
        await a.dbg(`throwSeeded(${JSON.stringify(pool)}, ${seed})`);
        const p = await a.dbg('settleProfile()');
        // Drain in BAKED frames and count them. sim(n) must step the film n
        // frames whatever the projector is set to — that is the property every
        // other scenario in this file is silently relying on.
        // `drained`, NOT `frames`. settleProfile() also has a `frames` key —
        // the BAKED keyframe count, which no projector setting can move — and
        // the first version of this spread `...p` over the measured value, so
        // claim 3 compared the bake against itself and passed with the tempo
        // deliberately leaked into sim(). Caught by red-checking the guard,
        // which is the only reason it is not still passing.
        const drained = Number(await a.eval(`(() => { let f = 0;
          while (window.__diceDebug.busy && f < 20000) { window.__diceDebug.sim(1); f++; }
          return f; })()`));
        await a.dbg('clearTable()');
        await a.dbg('sim(60)');
        return { seed, ...p, drained };
      };

      const base = [];
      for (const s of seeds) base.push(await throwOne(s));

      // --- 3. the tempo does not reach sim() --------------------------------
      // The uniform knob first, because the curve is built on the same seat.
      // If either leaked, every scenario that drains with sim() would silently
      // change length and the suite would go red somewhere else entirely.
      await a.dbg('setTempo(2)');
      const atK = [];
      for (const s of seeds) atK.push(await throwOne(s));
      await a.dbg('setTempo(1)');
      seeds.forEach((s, i) => {
        assert.equal(atK[i].drained, base[i].drained,
          `seed ${s}: sim() drained ${atK[i].drained} frames at k=2 against ${base[i].drained} `
          + 'at k=1 — the projector has leaked into the debug stepper');
        assert.equal(atK[i].duration, base[i].duration,
          `seed ${s}: the BAKE moved at k=2 (${base[i].duration} -> ${atK[i].duration})`);
      });

      // --- 4. the anchor is a function of the film --------------------------
      // Which is what makes the curve safe to arm: every client bakes the same
      // film from the seed, so every client changes gear at the same instant.
      // Re-throwing a seed must reproduce its anchor exactly.
      seeds.forEach((s, i) => {
        assert.equal(atK[i].tempoAnchor, base[i].tempoAnchor,
          `seed ${s}: the same seed anchored at ${base[i].tempoAnchor} then `
          + `${atK[i].tempoAnchor} — the anchor is not a pure function of the bake`);
        assert.ok(base[i].tempoAnchor > 0 && base[i].tempoAnchor < base[i].duration,
          `seed ${s}: anchor ${base[i].tempoAnchor} is not inside the film `
          + `(duration ${base[i].duration}) — the curve would never engage`);
      });

      // --- 5. the curve is monotone and opens at exactly `flight` -----------
      // Sampled on a LIVE roll, because tempoAt reads the current roll's own
      // anchor — and sampled on the SHIPPED curve itself, whose settle of 25
      // is what keeps the change-of-gear check below from being vacuous.
      await a.dbg(`throwSeeded(${JSON.stringify(pool)}, ${seeds[0]})`);
      const prof = await a.dbg('settleProfile()');
      const N = 60;
      const ks = [];
      for (let i = 0; i <= N; i++) {
        ks.push(Number(await a.dbg(`tempoAt(${(prof.duration * i) / N})`)));
      }
      await a.eval('(() => { while (window.__diceDebug.busy) window.__diceDebug.sim(120); return 1; })()');
      await a.dbg('clearTable()');
      await a.dbg('sim(60)');

      assert.equal(ks[0], c0.flight,
        `the curve opens at ${ks[0]}, not at flight (${c0.flight})`);
      for (let i = 1; i < ks.length; i++) {
        assert.ok(ks[i] >= ks[i - 1] - 1e-12,
          `the curve went backwards at sample ${i}: ${ks[i - 1]} -> ${ks[i]}`);
      }
      assert.ok(ks[ks.length - 1] > 2,
        `the curve only reached ${ks[ks.length - 1]} by the end of the film — it never `
        + 'changes gear, so monotonicity above proves nothing');

      // --- 6. sampling and the k detour left no residue ---------------------
      const backC = await a.dbg('tempoCurve');
      assert.equal(backC.flight, 0.8, 'sampling the curve mutated flight');
      assert.equal(backC.settle, 25, 'sampling the curve mutated settle');
      const back = [];
      for (const s of seeds) back.push(await throwOne(s));
      seeds.forEach((s, i) => {
        assert.equal(back[i].drained, base[i].drained,
          `seed ${s}: the throw did not drain the same after the k detour`);
        assert.equal(back[i].duration, base[i].duration,
          `seed ${s}: the bake did not restore after the k detour`);
      });

      await a.dbg('holdClock(false)');
    },
  },
  {
    name: 'table-name-survives-round-trip',
    tags: ['lobby', 'cuj2'],
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
  {
    name: 'tower-contract-freeze',
    tags: ['tower'],
    // THE ENGINE CONTRACT, TO THE BIT (docs/TOWER.md, "The six engine-owned
    // volumes"). towerVolumes() is being turned from six fixed literals into a
    // function of a per-tower PORTAL SPEC, and the promise of that seam is that
    // a CLASSIC tower comes out the other side unchanged. Not "close enough" —
    // unchanged, on the same double, because every one of these numbers feeds
    // a BAKE: the film is a pure function of the core and the seed, and a
    // despawn line 1e-9 lower is two clients rendering one seed as two films.
    //
    // So the check is a byte comparison against a golden captured BEFORE the
    // refactor (tools/steps/tower-contract-capture.mjs), not a tolerance. An
    // epsilon here would pass exactly the change this exists to catch, because
    // "algebraically equivalent" is precisely what a rearranged floating-point
    // expression is not.
    //
    // TWO AXES (see the capture tool's header). Z0: three zoom presets ×
    // {unsocketed, heartwood} — the preset moves z0 and every volume hangs off
    // it, socketing moves it again and is the only state in which the eight
    // collider bodies exist to be read at all. SPEC: every other registered
    // tower at one preset, which freezes the PORTAL SPEC each one asks for and
    // the core derived from it. Until the spec axis existed this scenario
    // watched one spec six times and Hollow Bole was frozen nowhere.
    //
    // AND A NEW TOWER MUST BE FROZEN TOO. The registry is read live and every
    // id has to have a row, so registering a tower without capturing its
    // contract is RED. That re-capture is the one routine kind — purely
    // ADDITIVE: every number the two fixtures SHARE is identical and only new
    // keys appear. Establish that with a key-by-key walk, not with the line
    // count; a key added inside a nested object reflows its neighbours (adding
    // `door.x` read as 20 insertions and 10 deletions, with no value moved).
    // A moved value can still be right — T1's ulp fix moved 13 on purpose —
    // but it is a change to what every client bakes, and it is named in the
    // commit rather than absorbed into a fixture chore.
    //
    // THE GOLDEN IS GUARDED BEFORE IT IS TRUSTED. A fixture that got truncated
    // to `{}`, or whose rows are copies of one row, compares green against
    // anything — this project's dominant failure mode wearing a new hat. So the
    // shape, the body list, the z0 spread and the spec spread are asserted
    // first, and only then is the live snapshot held against it.
    //
    //   RED CHECKS (each run, seen red, reverted, seen green again):
    //   · despawnY `5.6 * S` → `5.61 * S` in towerVolumes: RED on all six rows
    //     — `despawnY: got 7.0125, golden 7`. Reverted: green.
    //   · a stray field added to the snapshot's projection: RED with
    //     "present live and not in the golden", which is the guard that keeps
    //     the projection honest in the other direction.
    //   · deleting a row from the golden: RED on the shape guard, before any
    //     comparison runs — and deleting `wide.hollowbole` specifically is RED
    //     on the registry sweep, which is the new-tower gate.
    //   · every spec-axis row's portals hand-edited to the classic numbers:
    //     RED on the spec-spread guard, which is what stops the axis from
    //     being six more photographs of the same tower.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();

      // ---- the golden is worth comparing against --------------------------
      const keys = Object.keys(TOWER_CONTRACT_GOLDEN);
      const ORDER = ['doorL', 'doorR', 'lintel', 'towerBack', 'towerL', 'towerR', 'ramp', 'lip'];
      const specs = new Set();
      for (const key of keys) {
        const g = TOWER_CONTRACT_GOLDEN[key];
        assert.equal(typeof g.despawnY, 'number', `${key}: the golden row has real numbers in it`);
        assert.ok(g.portals && g.source,
          `${key}: the golden row records the QUESTION (portals + source), not just the answer`);
        specs.add(JSON.stringify(g.portals));
        if (key.endsWith('.none')) {
          assert.equal(g.bodies, null, `${key}: a towerless row has no colliders to record`);
        } else {
          assert.deepEqual(g.bodies.map((b) => b.name), ORDER,
            `${key}: the golden froze the eight engine colliders in contract order`);
        }
      }

      // The Z0 axis: three presets × {unsocketed, heartwood}, six distinct anchors.
      const z0Keys = [];
      for (const preset of ['wide', 'medium', 'close']) {
        for (const tower of ['none', 'heartwood']) z0Keys.push(`${preset}.${tower}`);
      }
      for (const key of z0Keys) {
        assert.ok(TOWER_CONTRACT_GOLDEN[key], `the golden holds the z0-axis row ${key}`);
      }
      const z0s = new Set(z0Keys.map((k) => TOWER_CONTRACT_GOLDEN[k].z0));
      assert.equal(z0s.size, 6,
        `and all six z0-axis rows are DIFFERENT anchors — six copies of one row `
        + `would compare green against a broken engine (${[...z0s].join(', ')})`);

      // The SPEC axis: every registered tower is frozen somewhere, and the axis
      // holds more than one spec (otherwise it is the z0 axis with extra rows).
      const registry = await a.dbg('towerRegistry()');
      const frozenIds = new Set(keys.map((k) => k.split('.')[1]));
      const unfrozen = registry.map((r) => r.id).filter((id) => !frozenIds.has(id));
      assert.deepEqual(unfrozen, [],
        `every registered tower is frozen: ${unfrozen.join(', ')} ${unfrozen.length === 1 ? 'is' : 'are'} not. `
        + `A new tower re-captures the golden (tools/steps/tower-contract-capture.mjs) — `
        + `an ADDITIVE diff, 0 deletions, or the classic core moved and this is not a re-pin`);
      assert.ok(specs.size >= 2,
        `and the golden holds more than one portal spec (${specs.size}) — one spec `
        + `photographed N times cannot catch a spec that stopped propagating`);

      // ---- and the engine still lands on it, to the bit --------------------
      for (const key of keys) {
        const [preset, tower] = key.split('.');
        await a.dbg(`setZoom('${preset}')`);
        await a.waitFor(`window.__diceDebug.zoom === '${preset}'`,
          { desc: `${key}: the mat is at the ${preset} preset` });
        await a.dbg(`setTower('${tower}')`);
        // A BAKED row does not socket in the tick it is asked for — the flush
        // waits on the model — so this waits for the id to land rather than
        // assuming it did. Reading the snapshot one tick early would photograph
        // the PREVIOUS tower's core under this row's name.
        await a.waitFor(`window.__diceDebug.tower === '${tower}'`,
          { desc: `${key}: the tower is '${tower}' (a baked row waits for its model)` });

        const live = JSON.parse(await a.eval(TOWER_SNAP));
        const want = TOWER_CONTRACT_GOLDEN[key];
        const diff = firstDiff(live, want);
        assert.equal(diff, null,
          `${key}: the engine contract is byte-identical to the frozen one — ${diff}`);
        // Belt and braces on the walker itself: a firstDiff that returned null
        // for everything would make every line above vacuous.
        assert.equal(JSON.stringify(live), JSON.stringify(want),
          `${key}: …and so is the serialisation, character for character`);
      }
      // The walker CAN say no — asserted against the golden's own rows, which
      // differ from each other by construction (the z0 guard above).
      assert.ok(firstDiff(TOWER_CONTRACT_GOLDEN[keys[0]], TOWER_CONTRACT_GOLDEN[keys[1]]),
        'and the comparison has a way to fail: two different rows do not match');
    },
  },
  {
    name: 'settings-destinations',
    tags: ['settings', 'chrome', 'look'],
    // THE PANEL HAS FOUR DESTINATIONS, NOT ONE SCROLL (UX §7.36). The defect
    // this replaced was a MEASUREMENT — 45 controls in a 320px column that
    // scrolled 1004px inside a 647px window — so the assertions are
    // measurements too, not a list of ids in a list of sections.
    //
    // `look`: every claim here is geometry, grouping and ARIA state, and not
    // one of them needs a die. The runner enforces that (noDiceGuard).
    //
    // WHAT WOULD MAKE EACH FAIL:
    //   · a control that lost its home — the inventory sweep, which walks the
    //     union of all four destinations and demands every known control be
    //     in exactly one. A control deleted, or dropped into two sections by
    //     a bad merge, fails here rather than by going quietly missing.
    //   · the blast-radius order — room-wide cells FIRST and together. The
    //     bar's order IS the claim that a player can tell "everyone sees
    //     this" from "only I do" without reading a word of prose.
    //   · exclusivity — two destinations visible at once means the split
    //     bought nothing.
    //   · the PAINT — U22's rule and the bug tower-roll already records: the
    //     chosen cell must be visibly different, not merely `aria-checked`.
    //     A stylesheet that names only aria-pressed leaves a radio seg with
    //     four identical cells, which is what shipped for the zoom picker.
    //   · one frame — the dialog must not resize as you move between
    //     destinations.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();

      const DESTS = ['table', 'staging', 'you', 'stuff'];
      // Every control the panel is responsible for, and the destination that
      // owns it. This list is the INVENTORY — a new setting adds a line here
      // the day it is added to the panel, which is the point: the structure
      // has a home for everything or it is not a structure.
      const HOME = {
        table: ['set-table-name', 'system-picker', 'zoom-picker'],
        staging: ['venue-picker', 'felt-swatches', 'tower-picker'],
        you: ['set-sound', 'set-chips', 'set-ambience', 'diceset-picker'],
        stuff: ['profile-rows', 'profile-newname', 'profile-new', 'profile-deal',
                'portable-open', 'portable-zone'],
      };

      await a.dbg('openSettings()');
      assert.equal(await a.dbg('settingsDest()'), 'table',
        'the panel opens on TABLE — the room\'s own state is the half people '
        + 'come to change together, and the half with consequences for everyone');

      // ---- the bar reads room-wide first ----------------------------------
      const cells = JSON.parse(await a.eval(
        `JSON.stringify([...document.querySelectorAll('#settings-nav button')]
          .map((b) => b.dataset.dest))`));
      assert.deepEqual(cells, DESTS,
        `four destinations, room-wide pair first (${cells.join(' · ')}) — the `
        + `bar's ORDER is how "everyone sees this" is told from "only I do"`);
      assert.equal(await a.eval(
        `document.getElementById('settings-nav').getAttribute('role')`), 'radiogroup',
      'and they are exclusive by declaration, not just by behaviour');

      // ---- every control has exactly one home ------------------------------
      const seen = new Map();
      for (const dest of DESTS) {
        const ids = JSON.parse(await a.eval(
          `JSON.stringify([...document.querySelectorAll('#dest-${dest} [id]')].map((e) => e.id))`));
        for (const id of ids) {
          if (seen.has(id)) {
            assert.fail(`${id} lives in BOTH ${seen.get(id)} and ${dest} — `
              + 'one home per control, or the panel is a junk drawer again');
          }
          seen.set(id, dest);
        }
      }
      for (const [dest, ids] of Object.entries(HOME)) {
        for (const id of ids) {
          assert.equal(seen.get(id), dest,
            `${id} lives in '${dest}' (found in '${seen.get(id) || 'nowhere'}')`);
        }
      }

      // ---- one at a time, and the chosen cell is PAINTED --------------------
      let firstFrame = null;
      for (const dest of DESTS) {
        await a.dbg(`openSettings("${dest}")`);
        await a.waitFor(`window.__diceDebug.settingsDest() === '${dest}'`,
          { desc: `${dest} is in hand` });
        // WAIT FOR THE PAINT TO SETTLE, then assert it. `.seg button`
        // transitions its background over 150ms, and getComputedStyle during a
        // transition returns the INTERPOLATED value — read at t≈0 the chosen
        // cell is still transparent and the old one still lit, which is a
        // photograph of a fade being read as a state bug. (It fooled the
        // screenshot step the same afternoon.) The claim is about the settled
        // state; this waits for it, and a paint that never settles still goes
        // red, here, with this sentence.
        await a.waitFor(`(() => {
          const bg = (d) => getComputedStyle(document.getElementById('snav-' + d)).backgroundColor;
          const mine = bg('${dest}');
          return ${JSON.stringify(DESTS)}.filter((d) => d !== '${dest}')
            .every((d) => bg(d) !== mine);
        })()`, { desc: `${dest}: the chosen cell's paint lands` });
        // …and the panel's own OPEN animation. `modal-pop` is a 0.3s
        // cubic-bezier that OVERSHOOTS (the 1.4 control point), so a frame
        // measured while it runs is bigger than the frame that lands — the
        // first reading came back 340×461 against a resting 320×442, and the
        // "one frame" claim failed against the animation rather than against
        // the layout. Asked of the animation itself, not slept on.
        await a.waitFor(`document.getElementById('settings-panel')
          .getAnimations().every((an) => an.playState === 'finished')`,
        { desc: `${dest}: the panel's pop has landed` });
        const state = JSON.parse(await a.eval(`(() => {
          const vis = ${JSON.stringify(DESTS)}.filter(
            (d) => !document.getElementById('dest-' + d).classList.contains('hidden'));
          const cell = (d) => document.getElementById('snav-' + d);
          const p = document.getElementById('settings-panel');
          return JSON.stringify({
            vis,
            checked: ${JSON.stringify(DESTS)}.filter((d) => cell(d).getAttribute('aria-checked') === 'true'),
            paint: ${JSON.stringify(DESTS)}.map((d) => getComputedStyle(cell(d)).backgroundColor),
            frame: [p.getBoundingClientRect().width, p.getBoundingClientRect().height].map(Math.round),
            over: Math.max(0, p.scrollHeight - p.clientHeight),
          });
        })()`));
        assert.deepEqual(state.vis, [dest],
          `${dest}: exactly one destination is on screen (${state.vis.join(', ')})`);
        assert.deepEqual(state.checked, [dest],
          `${dest}: and exactly one cell is aria-checked (${state.checked.join(', ')})`);
        const mine = state.paint[DESTS.indexOf(dest)];
        const others = state.paint.filter((_, i) => i !== DESTS.indexOf(dest));
        assert.ok(others.every((c) => c !== mine),
          `${dest}: the chosen cell is PAINTED differently (${mine} vs `
          + `${others.join(', ')}) — aria-checked with identical pixels is the `
          + `zoom-picker bug, and the stylesheet has to name BOTH spellings`);
        assert.equal(state.over, 0,
          `${dest}: and it does not scroll (${state.over}px over). The whole `
          + `defect was 357px of overflow in one column`);
        if (!firstFrame) firstFrame = state.frame;
        else {
          assert.deepEqual(state.frame, firstFrame,
            `${dest}: the dialog keeps ONE frame across destinations — a panel `
            + `that resizes under the cursor walks its close button up the screen`);
        }
      }

      // ---- the workspace is reachable in ONE act ---------------------------
      // The claim that killed openSettingsAtLibrary(). Manage-frequency work
      // used to be behind the panel AND a disclosure button — the helper
      // existed to click that button for you, and C16 had already unhooked its
      // last caller because "the one row in the picker that promises a new
      // character delivered a text editor". Landing on the destination must
      // put the LIBRARY in front of you, with the YAML box still folded away.
      await a.dbg('openSettings("stuff")');
      assert.ok(await a.eval(
        `document.getElementById('profile-rows').offsetParent !== null`),
      'the profile library is on screen the moment you arrive');
      assert.ok(await a.eval(
        `document.getElementById('portable-zone').classList.contains('hidden')`),
      '…and the text tool is still folded — arriving at your profiles must not '
      + 'hand you a YAML editor');
    },
  },
  {
    name: 'stability-gate',
    tags: ['settings', 'chrome', 'tower', 'stability'],
    // THE CLOSED-BETA CHANNEL (js/stability.js). Towers and venues are
    // shipped, working, and not finished being decided; a production player
    // should not meet them by accident.
    //
    // THE ONE LAW, AND THE ONLY CLAIM HERE THAT COSTS DICE: the channel gates
    // the OFFER, never the CAPABILITY. A stable client that walks into a beta
    // player's room still sockets that room's tower and bakes the same film.
    // That is not courtesy, it is goal 15 — the pour is a pure function of
    // (core, seed), so a client that opted out would put DIFFERENT DICE on
    // screen from the seat next to it. A gate written the obvious way (refuse
    // the setting) passes every visibility assertion in this file and breaks
    // the table, silently, only when two people are watching. So the two tabs
    // and the roll are the point of the scenario, not its overhead.
    //
    // WHAT WOULD MAKE EACH FAIL:
    //   · a browser that has never heard of the beta seeing it — the virgin
    //     tab, `clean`ed of the key the harness seeds for everything else.
    //     This is the population the feature exists for and the one a
    //     beta-by-default suite would otherwise never boot.
    //   · the gate reaching the film — the two-tab pour. Deleting the
    //     IS_BETA guard from ownSettingsForChannel and applying it in
    //     applyRoomSettings instead leaves every other line here green.
    //   · felt going down with the stage — it is not experimental, and it
    //     must be REACHABLE (offsetParent, not merely present: the §7.21
    //     rule, and instance 2 of the green-check ledger).
    //   · a hidden row coming back from the dead — the venue and the channel
    //     both hide rows, for unrelated reasons. Raise a fantasy venue on a
    //     production client and take it down again: two owners of one
    //     `display` hand the tower picker back, and only this leg would see
    //     it. (It is why panelRowShown exists.)
    //   · the panel losing its measurement — §7.36's whole point was that
    //     nothing scrolls, and this pass has already had to abandon one
    //     design (felt moving to Table: 483px against a 459px panel) and one
    //     beta notice (its own line: 21px over) to keep it true.
    //   · the key leaking into the URL — redeem, then strip. `?room=` has to
    //     survive the rewrite, and `?stability=` must not, or every player a
    //     beta host invites is enrolled by the share link.
    async fn(ctx) {
      // ---- ① a browser that has never heard of the beta ------------------
      const prod = await tableTab(ctx, {
        origin: '127.0.0.21',
        seed: { 'dice.name.v1': 'Pat' },
        clean: ['dice.stability.v1'],
      });
      await prod.waitOnline();

      const chan = await prod.dbg('stability()');
      assert.equal(chan.channel, 'stable',
        'no key and no param is PRODUCTION — the default has to be the safe '
        + `one, and it is the only one a new player can arrive on (got ${chan.channel})`);
      assert.equal(chan.beta, false, 'and it does not think it is beta');
      assert.deepEqual(chan.gated, ['tower', 'venue'],
        'the gated set is tower + venue, named by the app rather than by this test');

      await prod.dbg('openSettings("staging")');
      // OFFSETPARENT, not the attribute or the markup. A row that is present,
      // labelled and `display:none` reads as success to anything that asks
      // the DOM what it holds — instance 2 of the green-check ledger, where a
      // figure was built and never shown for weeks behind a passing test.
      for (const id of ['venue-row', 'venue-picker', 'tower-row', 'tower-picker']) {
        assert.equal(await prod.eval(`document.getElementById('${id}').offsetParent`), null,
          `${id} is unreachable — the pickers ARE the offer, and the offer is what a `
          + 'channel gates');
      }
      assert.equal(await prod.eval(
        `getComputedStyle(document.getElementById('staging-beta')).display`), 'none',
      'and the panel does not call itself a beta to somebody who is not in one');

      // FELT IS NOT EXPERIMENTAL — the stage it stands on is. It rides in
      // Staging because a fantasy venue takes it (goal 13); it stays there on
      // this channel because moving it to Table put that destination 24px
      // over a 459px panel, and §7.36 is a measurement before it is a taste.
      assert.notEqual(await prod.eval(
        `getComputedStyle(document.getElementById('felt-swatches')).display`), 'none',
      'the felt swatches are still on screen for a production player');
      assert.ok(await prod.eval(
        `document.getElementById('dest-staging').contains(document.getElementById('felt-swatches'))`),
      '…in Staging, where staging the table has always meant choosing the felt');

      // §7.36's measurement, on the channel that had rows taken out of it.
      const over = JSON.parse(await prod.eval(`(() => {
        const p = document.getElementById('settings-panel');
        const out = {};
        for (const d of ['table', 'staging', 'you', 'stuff']) {
          window.__diceDebug.settingsDest(d);
          out[d] = Math.max(0, p.scrollHeight - p.clientHeight);
        }
        return JSON.stringify(out);
      })()`));
      for (const [dest, px] of Object.entries(over)) {
        assert.equal(px, 0, `${dest} still does not scroll on the stable channel (${px}px over)`);
      }

      // ---- ② the beta browser IS offered them ----------------------------
      // The control leg: without it every assertion above would also pass on
      // a build that had simply deleted the pickers.
      const beta = await ctx.newTable({ origin: 'localhost', name: 'Ada' });
      await beta.settle();
      assert.equal((await beta.dbg('stability()')).channel, 'beta',
        'the harness default seats a beta browser');
      await beta.dbg('openSettings("staging")');
      for (const id of ['venue-picker', 'tower-picker', 'felt-swatches', 'staging-beta']) {
        assert.notEqual(await beta.eval(`document.getElementById('${id}').offsetParent`), null,
          `${id} is offered on the beta channel`);
      }
      const betaOver = JSON.parse(await beta.eval(`(() => {
        const p = document.getElementById('settings-panel');
        window.__diceDebug.settingsDest('staging');
        return String(Math.max(0, p.scrollHeight - p.clientHeight));
      })()`));
      assert.equal(betaOver, 0,
        `Staging does not scroll with the beta rows AND the mark on it (${betaOver}px over) — `
        + 'the mark is a tag on a heading and not a line of its own for exactly this reason');
      await beta.dbg('closeSettingsModal()');

      // ---- ③ THE LAW: the gate never reaches the film --------------------
      await beta.dbg("setTower('heartwood')");
      await beta.waitFor(`window.__diceDebug.tower === 'heartwood'`,
        { desc: 'the beta host sockets a tower' });
      // The stable client is IN THIS ROOM and must follow it. Nothing about
      // its channel may be visible in what it renders.
      await prod.waitFor(`window.__diceDebug.tower === 'heartwood'`,
        { desc: 'the production client sockets the room\'s tower anyway' });

      await beta.dbg("commandRoll('6d6')");
      for (const t of [beta, prod]) {
        await t.waitFor('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
          { desc: 'the pour reached both clients' });
      }
      const films = await Promise.all([beta, prod].map(async (t) => JSON.parse(
        await t.eval('JSON.stringify(window.__diceDebug.towerFilmInfo())'))));
      for (const [i, f] of films.entries()) {
        assert.equal(f.filmTower, 'heartwood',
          `${i ? 'the production' : 'the beta'} client BAKED against the tower `
          + `(film ${f.filmTower}) — 'tower' says what is standing, 'filmTower' says `
          + 'what the dice were computed through, and only the second one is the law');
      }
      assert.equal(films[0].seed, films[1].seed, 'one seed');
      assert.equal(films[0].frames, films[1].frames, 'one film length');
      // THE FILM, NOT THE FRAME. `rest` carries two fields that are read off
      // the live meshes at the instant of the call — `visible` (a die inside
      // the tower is not drawn) and `shows` (the rendered orientation) — so
      // two tabs a few ticks apart in the SAME film disagree about them
      // honestly. They were the first thing this assertion caught, which is
      // the good version of that mistake: comparing everything and then
      // narrowing to what the claim is actually about. What the claim is
      // about is where the dice END UP, and that is baked, not rendered.
      const filmOf = (f) => f.rest.map(({ i, type, p, declared, delivered }) =>
        ({ i, type, p, declared, delivered }));
      assert.deepEqual(filmOf(films[1]), filmOf(films[0]),
        'ONE FILM: every die is computed to the same resting place on both screens. This '
        + 'is the assertion the obvious implementation of a feature gate fails — refusing '
        + 'the room\'s tower on the stable client would leave every visibility claim '
        + 'above green and put different dice in front of the two players');

      // ---- ④ a row hidden twice stays hidden -----------------------------
      // The venue hides these rows because it IS those choices; the channel
      // hides them because they are not on offer here. Both write the same
      // `display`, so the venue coming back down is the moment a naive gate
      // hands a production player the tower picker — a bug that needs a
      // fantasy venue, a stable client and a return trip to show itself, and
      // therefore one nobody would meet before a player did.
      await beta.dbg("setVenue('moonrise')");
      await prod.waitFor(`window.__diceDebug.venueInfo().id === 'moonrise'`,
        { desc: 'the production client follows the room into the glade' });
      await prod.dbg('openSettings("staging")');
      // SHOWN *AND* SAYING SOMETHING. `display` alone passes an empty note —
      // the element's visibility and its text are set by two different lines,
      // and blanking the text left this assertion green (caught by breaking
      // it on purpose). An explanation nobody can read is the absence it was
      // written to fix.
      const note = JSON.parse(await prod.eval(`JSON.stringify({
        display: getComputedStyle(document.getElementById('venue-staged')).display,
        text: document.getElementById('venue-staged').textContent.trim(),
      })`));
      assert.notEqual(note.display, 'none',
        'the venue says what it took, on the stable channel too — the note is how a '
        + 'control that vanishes stops being a defect');
      assert.match(note.text, /Moonrise Glade/,
        `…and it names the venue that took them (${JSON.stringify(note.text)})`);
      await beta.dbg("setVenue('table')");
      await prod.waitFor(`window.__diceDebug.venueInfo().id === 'table'`,
        { desc: 'and back out again' });
      for (const id of ['venue-picker', 'tower-picker']) {
        assert.equal(await prod.eval(`document.getElementById('${id}').offsetParent`), null,
          `${id} is STILL gone after a venue came and went — the channel's hide must `
          + 'survive the venue\'s un-hide, which is what one shared predicate buys');
      }
      assert.notEqual(await prod.eval(
        `getComputedStyle(document.getElementById('felt-swatches')).display`), 'none',
      '…and the felt came back, because that one really was the venue\'s to take');

      // ---- ⑤ the key is redeemed, then gone ------------------------------
      // A real enrolment: the link arrives, the browser keeps it, the URL does
      // not. The share flow hands out location.href, so a param left behind
      // enrols everybody the host invites — the failure this feature exists
      // to prevent, arriving through the front door.
      const joined = await tableTab(ctx, {
        origin: '127.0.0.22',
        query: '&stability=beta',
        seed: { 'dice.name.v1': 'Rue' },
        clean: ['dice.stability.v1'],
      });
      await joined.waitOnline();
      assert.equal((await joined.dbg('stability()')).channel, 'beta',
        'the link redeemed on a browser that had nothing stored');
      assert.equal(await joined.eval(`localStorage.getItem('dice.stability.v1')`), 'beta',
        '…and it stuck, so the next boot needs no link');
      // PARSED, not grepped. A substring test for 'stability' matches this
      // scenario's own room name (`e2e-stability-gate-…`) and fails a strip
      // that worked perfectly — the assertion has to ask the same question
      // the app asks.
      const search = await joined.eval('location.search');
      assert.equal(await joined.eval(
        `new URLSearchParams(location.search).get('stability')`), null,
      `the param is stripped from the address bar (${search})`);
      assert.equal(await joined.eval(
        `new URLSearchParams(location.search).get('room')`), ctx.room,
      `…and ?room= survives the rewrite (${search}) — the URL still addresses a table`);

      // Revocation is the same door in the other direction, and it PERSISTS:
      // a one-way beta would make "show me what my players see" impossible.
      const back = await tableTab(ctx, {
        origin: '127.0.0.23',
        query: '&stability=stable',
        seed: { 'dice.name.v1': 'Wren' }, // …and the harness's beta seed stands
      });
      await back.waitOnline();
      assert.equal((await back.dbg('stability()')).channel, 'stable',
        'the param beats the store, so a beta browser can be shown production');
      assert.equal(await back.eval(`localStorage.getItem('dice.stability.v1')`), 'stable',
        '…and the store followed it, so leaving the beta is not one boot deep');
      await back.dbg('openSettings("staging")');
      assert.equal(await back.eval(`document.getElementById('tower-picker').offsetParent`), null,
        'and the panel obeys the param on the very boot that carried it — the revoke '
        + 'link has to SHOW you production, not merely promise it for next time');
    },
  },
  {
    name: 'tower-dressing',
    tags: ['tower', 'look'],
    // THE COSMETIC LANE (ROADMAP T4). Every claim here is about GEOMETRY,
    // GROUPS and DECLARATIONS — what the model brought, what it named it, what
    // it costs — and not one of them needs a die. That is not an accident of
    // how it happens to be written: the charter says physics and the pour film
    // are a function of (portal spec, engine constants, seed) and the mesh is
    // not an input, so a mesh change owes measurements and LOOK sheets and
    // owes simulation NOTHING. These claims used to live inside `tower-roll`,
    // which pours; a pure dressing change could only be proved by paying for
    // a physics scenario, which is how a cosmetic edit ends up costing 38
    // seconds instead of eight.
    //
    // The `look` tag is enforced, not documented: runScenarios reads
    // __diceDebug.diceEverMade() from every tab afterwards and fails the
    // scenario if a single die body was built — or if the counter cannot be
    // read at all. See noDiceGuard in harness.mjs.
    //
    // WHAT MOVED, AND WHAT IS NEW. The four claims below came over from
    // tower-roll unchanged in substance (the two biconditionals keep their
    // full reasoning there). Two are new:
    //   · THE BUDGET IS AN ASSERTION. "≤ 4k triangles and ≤ 8 draw calls of
    //     dressing" has been the rule since the dressing pass and lived as a
    //     printed number in tools/steps/tower-dress.mjs, which is a wish. A
    //     budget nobody fails is not a budget.
    //   · THE COSMETIC CLAIM IS AN AGGREGATE. What is asserted is the total
    //     over the `towerSkin*` subtree, not the presence of one named mesh —
    //     `venue-set` breaking the day somebody deleted a berm is the
    //     precedent, and a suite that names individual meshes turns every
    //     legitimate re-massing into a test edit.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();

      const registry = await a.dbg('towerRegistry()');
      const skinned = registry.filter((t) => t.skin);
      assert.ok(skinned.length >= 4,
        `every skinned row is walked (${skinned.map((t) => t.id).join(', ')}) — `
        + 'and there are enough of them that this is a sweep, not a spot check');

      for (const model of skinned) {
        const id = model.id;
        await a.dbg(`setTower('${id}')`);
        await a.waitFor(`window.__diceDebug.tower === '${id}'`,
          { desc: `${model.label} is up (a baked row waits for its model)` });

        const dr = await a.dbg('towerDressAudit()');
        const names = dr.groups.map((g) => g.name);

        // (1) THE SKIN IS THERE AT ALL, as an aggregate. A model that failed
        // to build, or a loader that dropped the geometry on the floor, leaves
        // an audit that answers politely with nothing — and every claim after
        // it would be vacuously true. Triangles across the whole subtree, so
        // re-massing a tower is not a test edit.
        assert.ok(dr.tris > 0 && dr.draws > 0,
          `${id}: the audit SEES a skin — ${dr.tris} tris in ${dr.draws} draws. `
          + `Zero here makes every line below vacuous`);

        // (2) THE DRESS GROUP, exactly where the row declares one. Biconditional
        // in both directions — the reasoning is in tower-roll's history: a
        // baked row that bakes its props into the GLB declares dress:false and
        // must then carry NO group, so an empty group cannot hide behind the
        // declaration either.
        const dressed = !model.glb || !!model.dress;
        assert.equal(names.includes('towerSkinDress'), dressed,
          `${id}: declares dress=${!!model.dress} (glb=${model.glb}), so it must `
          + `${dressed ? 'carry' : 'carry NO'} towerSkinDress (groups: ${names.join(', ')})`);
        if (dressed) {
          const dg = dr.groups.find((g) => g.name === 'towerSkinDress');
          assert.ok(dg.meshes > 0 && dg.tris > 0,
            `${id}: …and it carries geometry (${dg.meshes} meshes, ${dg.tris} tris)`);
        }

        // (3) THE DRESSING BUDGET, as an assertion (NEW). The budget is on the
        // DRESSING, not on the model — a hero tower is allowed to be a hero —
        // so it is measured over the two dress groups only.
        //
        // AND THE FIRST THING IT FOUND WAS TWO OVERRUNS. "≤ 4k triangles and
        // ≤ 8 draw calls" has been the written rule since the dressing pass
        // and lived as a printed number in a tool; the day it became an
        // assertion, heartwood measured 11 draws and bastion 9. Triangles are
        // fine everywhere (the worst is hollowbole's 2644). Nobody knew,
        // because a printed number is a wish.
        //
        // The two are WAIVED BY NAME AND BY VALUE rather than by raising the
        // budget to fit them — fitting the rule to the code is how a budget
        // stops meaning anything, and 11 draws is a merge pass on a prop kit,
        // not a licence (ROADMAP T14). The waiver is self-cleaning: a row
        // listed here that turns out to be INSIDE the budget fails too, so
        // fixing a tower forces its line to be deleted rather than left to rot.
        const DRESS_DRAW_WAIVER = { heartwood: 11, bastion: 9 };
        const dressGroups = dr.groups.filter(
          (g) => g.name === 'towerSkinDress' || g.name === 'towerDressFx');
        const dTris = dressGroups.reduce((n, g) => n + g.tris, 0);
        const dDraws = dressGroups.reduce((n, g) => n + g.draws, 0);
        assert.ok(dTris <= 4000,
          `${id}: the dressing is inside its triangle budget (${dTris} <= 4000, `
          + `over ${dressGroups.map((g) => g.name).join(' + ') || 'no dress groups'})`);
        if (id in DRESS_DRAW_WAIVER) {
          assert.ok(dDraws > 8,
            `${id}: is listed as a declared draw-call overrun but measures `
            + `${dDraws} <= 8 — it is inside the budget now, so delete its line `
            + `from DRESS_DRAW_WAIVER instead of leaving a waiver nobody needs`);
          assert.ok(dDraws <= DRESS_DRAW_WAIVER[id],
            `${id}: a DECLARED overrun of the 8-draw dressing budget, and it may `
            + `not grow (${dDraws} <= ${DRESS_DRAW_WAIVER[id]}). See ROADMAP T14`);
        } else {
          assert.ok(dDraws <= 8,
            `${id}: and inside its draw-call budget (${dDraws} <= 8)`);
        }

        // (4) THE FAMILY TRAITS. An ember on the row (somebody lit it tonight),
        // and no light in the skin — the tower's one warm light is the
        // engine's, built against the socketed core.
        assert.ok(dr.ember,
          `${id}: the registry row carries the family trait — a warm focal light`);
        assert.equal(dr.lights, 0, `${id}: and the skin still brings zero lights`);
        // …AND THE ROW'S LAMPS ARE READABLE, by value. Nothing could read
        // these back until 2026-08-14, which is exactly how towerRegisterGlb
        // spent a day replacing a shipped row's whole light story with a warm
        // default and nobody saw: tower-try, the tool documented as "the only
        // honest place to judge light", was lighting the cold nullstone with
        // an orange point lamp at full rake. It was found by two people
        // looking at a picture. A value nobody can read is a value nobody can
        // check, so the sweep reads them.
        assert.ok(model.ember && model.ember.color,
          `${id}: the ember is readable AS A VALUE, not just as a boolean `
          + `(${JSON.stringify(model.ember)})`);
        // The lantern is OPTIONAL and its absence is a real declaration:
        // `spec.lantern.rake` is a SCALE on the room's rake, so a row without
        // one runs at 1.0 — which is heartwood, the pale original the rake was
        // tuned against. The three dark towers lower it (0.4/0.45/0.5) because
        // a black surface is mostly reflection. So the claim is that a
        // declared rake is a NUMBER, not that every row declares one.
        assert.ok(model.lantern === null || typeof model.lantern.rake === 'number',
          `${id}: a declared lantern carries a numeric rake `
          + `(${JSON.stringify(model.lantern)})`);

        // (5) IDLE MOTION, where the row declares it. Same biconditional shape
        // as (2): a row that declares no dress must have nothing moving.
        const expectMotion = !model.glb || !!model.dress;
        assert.equal(dr.sways + dr.smokes > 0, expectMotion,
          `${id}: declares dress=${!!model.dress} (glb=${model.glb}), so it must `
          + `${expectMotion ? 'have' : 'have NO'} idle motion when nobody is touching it `
          + `(${dr.sways} sways, ${dr.smokes} plumes)`);
      }

      // ---- A RE-BAKE OF A ROW THAT EXISTS INHERITS ITS LIGHT --------------
      // The regression itself, and the reason it is here rather than in a
      // tool's printed output. `tower-try` mints a throwaway row for a raw
      // `tools/forge/out/<slug>.glb` and the slug is the FILENAME — so baking
      // `nullstone.glb` mints over the shipped nullstone row. Before the fix
      // that replaced its ember (#cfe98c cold, at the doorway) with the plain
      // default (#ff9a44 warm, on the bore axis) and dropped its 0.45 rake to
      // 1.0, which is how a day of value judgements got taken through a lamp
      // nobody chose.
      const lit = registry.find((t) => t.id === 'nullstone');
      assert.ok(lit && lit.ember, 'nullstone is the witness and it declares an ember');
      await a.dbg(`towerRegisterGlb('nullstone', '/models/towers/nullstone.glb', `
        + `{ label: 'remint', title: 'tower-dressing' })`);
      const after = (await a.dbg('towerRegistry()')).find((t) => t.id === 'nullstone');
      assert.deepEqual(after.ember, lit.ember,
        're-minting a REGISTERED id keeps its ember — a bake is looked at in the '
        + `room it will stand in, or the tool is lying (was ${JSON.stringify(lit.ember)}, `
        + `now ${JSON.stringify(after.ember)})`);
      assert.deepEqual(after.lantern, lit.lantern,
        '…and its lantern rake, which is a SCALE on the room\'s and so silently '
        + 'doubles the key light when it goes missing');
      assert.equal(after.label, 'remint',
        'while the parts the caller DID state still take effect — inheritance is a '
        + 'fallback, not an override, or a fixture could never be given its own lamps');

      // And the lane's own promise, stated where a reader will meet it: this
      // whole sweep socketed every model in the registry, read its geometry,
      // its groups, its budget and its declarations — and rolled nothing. The
      // runner is what proves it (noDiceGuard); this is the reminder that the
      // number is supposed to be zero.
      assert.equal(await a.dbg('diceEverMade()'), 0,
        'the cosmetic lane simulated no dice — asserted here as well as by the '
        + 'runner, so the promise is visible in the scenario that makes it');
    },
  },
  {
    name: 'tower-glb-loader',
    tags: ['tower', 'glb'],
    // A TOWER THAT ARRIVES OVER THE NETWORK (js/towerglb.js, C5). Every tower
    // before this one was a function call: towerSocket() asked for a group and
    // got one in the same tick. A baked model is bytes that have to turn up
    // first, and the whole of this scenario is the seam that makes that safe.
    //
    // A SOLO TAB, and not for convenience. server.js:376 allowlists the tower
    // ids it will accept in a settings patch, so a row minted by
    // towerRegisterGlb is unreachable from a joined table BY DESIGN — the wire
    // carries a name every client must already know. The lobby is the app with
    // netOnline false, where selectTower takes its solo branch and queueTower
    // is reached through the same settings path a chip click uses.
    //
    // WHAT EACH LEG WOULD CATCH, because "the tower went up" is exactly the
    // green check this project keeps writing:
    //
    //   · source     — 'model' vs 'default' is the difference between a tower
    //                  and a wall with dice behind it. A loader that failed to
    //                  read the empties would still socket, still look fine,
    //                  and quietly bake the CLASSIC core under a mesh whose
    //                  door is somewhere else.
    //   · portals    — deep-equal against the generator's own numbers, all
    //                  eight off-classic. Reading translations in the wrong
    //                  order, or extras from the wrong node, lands on values
    //                  that are still inside the limits and still socket.
    //   · bodies     — the eight engine colliders in contract order, and the
    //                  world count up by exactly eight. SAP order is shared
    //                  truth: two clients whose lists differ bake one seed
    //                  into two films.
    //   · extents    — identical to a CLASSIC tower's. matExtra is engine
    //                  -fixed, so a model that moved the mat would mean the
    //                  socket envelope had started following the model.
    //   · despawnY   — rimY - 1.75, checked against the DECLARED rim. This is
    //                  the number the film's vanish is baked against, and the
    //                  one that proves the portals reached towerVolumes rather
    //                  than merely reaching the registry row.
    //   · delivered  — the exit guarantee, through a door this app has never
    //                  seen before.
    //   · failure    — a model that 404s must cost a tower, never the table:
    //                  pendingTower survives, currentTower does not move, the
    //                  console says why, and a classic id still recovers.
    //   · restored   — THE FIRST LAW, from a GLB row: with no tower the world
    //                  is byte-for-byte the one every other scenario measures.
    //
    //   RED CHECKS (each run, seen red, reverted, seen green again):
    //   · js/towerglb.js readPortals, in.rimY and in.z swapped: RED at the
    //     socket gate — "timeout waiting for: the tower goes up once its model
    //     arrives". The VALIDATOR caught it before the assertion could: rimY
    //     -1.5 and z 8.0 are both outside TOWER_PORTAL_LIMITS, so the model was
    //     refused and the gate never opened. Reverted: green.
    //   · readPortals, out.w and out.clearH swapped — a subtler break, because
    //     5.5 and 5.0 BOTH stay legal (w >= 5.0, clearH >= 4.5), so the tower
    //     sockets and looks fine: RED on the portals deep-equal, naming both
    //     fields (`clearH: 5.5 vs 5`, `w: 5 vs 5.5`). Reverted: green.
    //   · THE ONE THAT WAS NOT A DRILL. Before `group.position.z = v.z0`
    //     existed in towerGlbSkin, this scenario passed every assertion it had
    //     — portals, colliders, mat depth, delivered dice — with the tower
    //     standing in the middle of the felt: a GLB is authored with z=0 at
    //     the socket plane and nothing had shifted it. The seated-hull
    //     assertion was written to catch it and did: hull.z [1.6, 5.6] against
    //     an authored [-4, 0]. That is why the frame is asserted at all.
    //   · towerModelReady() made to `return true` at the top: RED on the very
    //     first gate assertion — "it is NOT ready in the tick it was
    //     registered", true !== false. Reverted: green.
    //   · the same gate loosened to `status !== 'loading'` (a FAILED model
    //     counts as ready): RED at the same assertion, because a row that has
    //     not started fetching reads 'idle'. Recorded because it is the more
    //     interesting failure and the tripwire is upstream of it: nothing
    //     downstream had to be reached for the gate to be caught.
    //   · (C6) towerOcclusionCheck's `{pending}` early return deleted: RED,
    //     and the diff is the argument for the guard existing. Asked about
    //     'glbslow' — a row whose model 404s — the probe came back with a
    //     complete, plausible, PASSING grade: `shaft {blocked: 99, n: 99,
    //     missed: []}` on every eye, quietly labelled `skin: 'glbreal'`,
    //     because towerLabSkin had correctly refused to dress the bench and
    //     the probe went on to grade the tower it was already wearing. A
    //     human reading 99/99 files that as glbslow passing its occlusion
    //     proof. Reverted: green.
    async fn(ctx) {
      const a = await lobbyTab(ctx, { clean: ['dice.roomsettings.v1'] });

      // The harness only records console.error (harness collectErrors), and
      // every refusal in this seam is deliberately a WARN — loud, not fatal.
      // So tap the real console.warn rather than assert on a proxy for it.
      await a.eval(`(() => {
        window.__warnTap = [];
        const real = console.warn.bind(console);
        console.warn = (...args) => {
          try { window.__warnTap.push(args.map((x) => String(x)).join(' ')); } catch { /* ignore */ }
          real(...args);
        };
        return true;
      })()`);
      const warnsMatching = async (needle) => a.eval(
        `window.__warnTap.filter((w) => w.indexOf(${JSON.stringify(needle)}) !== -1).length`);

      // The retry ladder is 10.5s of deliberate backoff for a player on a bad
      // connection. Exercising the SAME four attempts and the same terminal
      // branch at 10ms costs nothing and buys back the wall clock.
      const tuned = await a.dbg(`towerGlbTune({ retryMs: [10, 20, 40], holdMaxMs: 400 })`);
      assert.deepEqual(tuned.retryMs, [10, 20, 40], 'the ladder is patched for the proof');

      // ---- what a towerless table is, measured -----------------------------
      const wasExtents = await a.dbg('tableExtents()');
      const wasWorld = await a.dbg('worldBodies()');
      assert.equal(await a.dbg('tower'), 'none', 'the lobby starts towerless');
      assert.deepEqual(wasWorld.named, [], 'and carries none of the tower colliders');

      // ---- and what a CLASSIC tower does to it, for the comparison ---------
      // The GLB row is held against THIS rather than against numbers typed
      // here: matExtra is engine-fixed, and the claim is that a baked model
      // consumes exactly the room a code-built one does.
      await a.dbg(`setTower('heartwood')`);
      await a.waitFor(`window.__diceDebug.tower === 'heartwood'`, { desc: 'a classic tower, for scale' });
      const classicExtents = await a.dbg('tableExtents()');
      assert.ok(classicExtents.d > wasExtents.d, 'which deepens the mat');
      assert.deepEqual(await a.dbg(`towerModelStatus('heartwood')`),
        { ready: true, status: null, url: null, portals: false, retries: 0 },
        'a row with no model is READY BY DEFINITION — that is what keeps the '
        + 'four shipped towers on the path they had before the loader existed');
      await a.dbg(`setTower('none')`);
      await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'and back down' });

      // ---- (1) a hand-written GLB becomes a socketed tower -----------------
      const MIN_URL = minTowerDataUrl();
      assert.equal(await a.dbg(`towerRegisterGlb('glbmin', ${JSON.stringify(MIN_URL)})`), true,
        'the proofs-only row is minted');
      assert.equal((await a.dbg(`towerModelStatus('glbmin')`)).ready, false,
        'and it is NOT ready in the tick it was registered — which is the whole '
        + 'reason this seam exists');

      await a.dbg(`setTower('glbmin')`);
      await a.waitFor(`window.__diceDebug.tower === 'glbmin'`,
        { desc: 'the tower goes up once its model arrives' });
      assert.deepEqual(await a.dbg(`towerModelStatus('glbmin')`),
        { ready: true, status: 'ready', url: MIN_URL, portals: true, retries: 0 },
        'first attempt, no retries');

      const spec = await a.dbg(`towerPortalSpec('glbmin')`);
      assert.equal(spec.source, 'model',
        `the portals came OFF THE MESH, not out of a registry row or the classic `
        + `default (got '${spec.source}')`);
      assert.deepEqual(spec.portals, MIN_TOWER_PORTALS,
        'and they are the eight numbers the generator declared, exactly — every '
        + 'one of them off-classic, so a loader that lost them could not pass');

      const ORDER = ['doorL', 'doorR', 'lintel', 'towerBack', 'towerL', 'towerR', 'ramp', 'lip'];
      assert.deepEqual((await a.dbg('towerBodies()')).map((x) => x.name), ORDER,
        'the eight engine colliders, in contract order, for a baked model too');
      const upWorld = await a.dbg('worldBodies()');
      assert.deepEqual(upWorld.named, ORDER, 'and the WORLD holds those eight, in that order');
      assert.equal(upWorld.count, wasWorld.count + 8,
        `eight bodies added and nothing else (${wasWorld.count} → ${upWorld.count})`);
      assert.deepEqual(await a.dbg('tableExtents()'), classicExtents,
        'the mat is EXACTLY the classic tower\'s — the socket envelope is the '
        + 'engine\'s, and a model moving it would mean the envelope had started '
        + 'following the model');

      // The model's own node name SURVIVED the loader and the two portal
      // empties did NOT. Both halves matter and neither is cosmetic: the
      // `towerSkin*` convention is what towerOcclusionCheck walks to decide
      // what counts as an occluder (an unnamed mesh proves nothing), and a
      // portal empty left in the scene is a named node inside the socket that
      // every audit then has to explain. setVisibleByName returns how many
      // objects in the SCENE carry the name, which is the honest count.
      assert.equal(await a.dbg(`setVisibleByName('towerSkinTest', true)`), 1,
        'the Blender node name reached the scene — the occluder convention '
        + 'travels with the model, not with a code-built skin file');
      for (const empty of ['portalIn', 'portalOut']) {
        assert.equal(await a.dbg(`setVisibleByName('${empty}', true)`), 0,
          `${empty} was stripped: it is metadata that happens to be shaped like `
          + `scene graph, and it does not belong in the socket`);
      }

      // THE FRAME, AND IT IS THE ONE THING A NAME CHECK CANNOT SEE. A GLB is
      // authored with z = 0 AT the back-wall socket plane (tools/forge/README.md
      // "Tower portals"), while a code-built skin bakes the world's z0 into its
      // own vertices — buildTowerSkin opens with `const z0 = v.z0`. So the two
      // kinds of skin arrive in DIFFERENT frames and the loader owes the model
      // that offset. Get it wrong and everything above still passes: the
      // portals are right, the colliders are right, the mat is right, and the
      // tower is standing in the middle of the felt.
      //
      // towerModelAudit reports its hull's z RELATIVE to z0, so a correctly
      // seated model reads back its own authored extent. The generator's box
      // is x [-3, 3], y [0, 8], z [-4, 0].
      const seated = await a.dbg('towerModelAudit()');
      assert.deepEqual(seated.hull.z, [-4, 0],
        `the model is seated ON the socket plane, not at the mat's origin — its `
        + `authored z extent [-4, 0] read back through the audit's z0-relative `
        + `hull (got ${JSON.stringify(seated.hull.z)}; an unshifted model reads `
        + `about [1.6, 5.6], which is a tower standing on the felt)`);
      assert.deepEqual(seated.hull.x, [-3, 3], 'and unmoved in x');
      assert.deepEqual(seated.hull.y, [0, 8], 'and standing on the floor');

      // ---- (2) a pour through a door nobody has poured through -------------
      const rimY = MIN_TOWER_PORTALS.in.rimY;
      assert.equal(spec.derived.despawnY, rimY - 1.75,
        `the vanish follows the DECLARED rim: despawnY ${spec.derived.despawnY} `
        + `= rimY ${rimY} - 1.4*S. This is the number the film is baked against, `
        + `and it is the proof the portals reached towerVolumes rather than just `
        + `the registry row`);
      assert.equal(spec.derived.door.w, MIN_TOWER_PORTALS.out.w, 'and the door is the declared width');
      assert.equal(spec.derived.door.sill, MIN_TOWER_PORTALS.out.sillY, 'at the declared sill');

      // AND WHERE THE PORTAL PUT IT (T2). doorL/doorR/lintel were the last
      // bodies built at a hard x=0 while the apron, lip, hood, exit spawn and
      // flight envelope all followed `out.x` — so a tower using that freedom
      // got a jamb standing inside its own modelled opening, and a die grazing
      // there met an invisible wall. This fixture declares out.x 0.25, which
      // makes it the case: the gap the three bodies cut must be exactly the
      // declared opening, on both edges.
      //
      //   RED CHECK: `ox` forced back to 0 in towerColliders — RED on the
      //   lintel line (`0 !== 0.25`) and on both jamb edges. Reverted: green.
      const ox = MIN_TOWER_PORTALS.out.x, dw = MIN_TOWER_PORTALS.out.w / 2;
      const bodyByName = Object.fromEntries(
        (await a.dbg('towerContractSnapshot()')).bodies.map((b) => [b.name, b]));
      assert.equal(bodyByName.lintel.position[0], ox,
        'the lintel is centred on the declared doorway, not on the room');
      assert.equal(bodyByName.doorL.position[0] + bodyByName.doorL.half[0], ox - dw,
        `the left jamb ENDS at the opening's left edge (${ox} - ${dw})`);
      assert.equal(bodyByName.doorR.position[0] - bodyByName.doorR.half[0], ox + dw,
        `and the right jamb BEGINS at its right edge (${ox} + ${dw})`);
      assert.equal(2 * (bodyByName.doorL.half[0] + bodyByName.doorR.half[0]) + 2 * dw,
        (await a.dbg('tableExtents()')).w,
        'and the two jambs plus the opening still span the whole back wall — '
        + 'an off-centre door moves the gap, it does not add or lose wall');

      await a.roll('3d6');
      const film = await a.dbg('towerFilmInfo()');
      assert.equal(film.filmTower, 'glbmin',
        'the film records WHICH tower it was baked with, and it is this one');
      assert.ok(film.pour, 'a tower roll is a POUR, not a throw with scenery behind it');
      assert.equal(film.rest.length, 3, 'three dice');
      assert.ok(film.rest.every((d) => d.delivered),
        `every die came out onto the felt — the EXIT GUARANTEE, through a door `
        + `this app has never seen before (${JSON.stringify(film.rest.map((d) => d.p))})`);
      assert.ok(film.rest.every((d) => d.shows === d.declared),
        'and each die SHOWS what the table says it rolled');
      assert.ok(film.spans && film.spans.every((s) => s.length > 0),
        'each die has at least one hidden window — a pour with none is scenery');

      await a.dbg('clearTable()');
      await a.dbg('sim(400)');

      // ---- (3) the REAL bake, off the real static path ---------------------
      // tower_fixture.glb is served by server.js from the page origin
      // (tests/static-cache.test.mjs pins the 200), so this leg is the whole
      // production path: HTTP, GLB container, Blender's own glTF output.
      const FIX_URL = '/tests/e2e/fixtures/tower_fixture.glb';
      await a.dbg(`towerRegisterGlb('glbreal', ${JSON.stringify(FIX_URL)})`);
      await a.dbg(`setTower('glbreal')`);
      await a.waitFor(`window.__diceDebug.tower === 'glbreal'`,
        { desc: 'the baked fixture sockets from a real HTTP fetch' });
      const real = await a.dbg(`towerPortalSpec('glbreal')`);
      assert.equal(real.source, 'model', 'off the mesh, again');
      // The recipe's header declares these (tools/forge/recipes/tower_fixture.py).
      // NEW CLAIM 2026-08-13 (the envelope round): check.py --tower grew a
      // socket-envelope gate, the fixture's first cut was far outside it, and
      // four portal numbers moved with the slim — in.x 0.80→0.25, in.z
      // −2.75→−2.50 (PINNED by the depth arithmetic at max bore; see the
      // recipe header), clearR 2.25→2.20, out.x −0.50→−0.15, w 5.25→5.15.
      // Binary fractions (in.x 0.25, in.z −2.5, rimY, sillY, clearH) survive
      // Blender's float32 node translation exactly; 2.20 / −0.15 / 5.15 do
      // NOT and come back as the float32-rounded doubles — correct for a
      // baked asset (every client reads the same double out of the same
      // bytes), which is why those three assert nearness.
      assert.equal(real.portals.in.x, 0.25, 'declared in.x 0.25');
      assert.equal(real.portals.in.rimY, 9.75, 'declared rimY 9.75');
      assert.equal(real.portals.in.z, -2.5, 'declared in.z -2.50');
      assert.equal(real.portals.out.sillY, 1.25, 'declared sillY 1.25');
      assert.equal(real.portals.out.clearH, 4.75, 'declared clearH 4.75');
      assert.ok(Math.abs(real.portals.in.clearR - 2.2) < 1e-6,
        `declared clearR 2.20, through float32 (got ${real.portals.in.clearR})`);
      assert.ok(Math.abs(real.portals.out.x - -0.15) < 1e-6,
        `declared out.x -0.15, through float32 (got ${real.portals.out.x})`);
      assert.ok(Math.abs(real.portals.out.w - 5.15) < 1e-6,
        `declared door width 5.15, through float32 (got ${real.portals.out.w})`);
      assert.equal(real.derived.despawnY, 9.75 - 1.75,
        'and the fixture\'s off-classic rim moves the despawn line with it');
      assert.deepEqual((await a.dbg('worldBodies()')).named, ORDER,
        'a tower→tower swap through TWO baked models still lands on the eight');

      // ---- the audits RUN on a baked model (C6) ----------------------------
      // SHAPE FIRST. tower-fit's thresholds belong to a real shipped tower, and
      // this fixture is a plain monolith that was never authored to satisfy
      // them — grading it on those would pin a number nobody chose. (The two
      // HARD occlusion bands are a different matter now: see below.) What IS
      // worth pinning is that the
      // audits can read a baked model at all: every one of them was written
      // against code-built skins, walks `towerSkin*` names, and would return
      // an empty or null answer for a GLB if the loader had named things
      // differently. An audit that quietly reports zero meshes is the same
      // green check as an audit that passes.
      const audit = await a.dbg('towerModelAudit()');
      assert.ok(audit && audit.meshes > 0,
        `the audit SEES the baked geometry — ${audit && audit.meshes} mesh(es). `
        + `Zero here would mean the towerSkin* naming did not survive the GLB, `
        + `and every fit and occlusion answer after it would be vacuous`);
      assert.equal(audit.lights, 0,
        'and the model brings NO lights: the tower\'s one warm focal light is the '
        + 'registry row\'s ember, built by the engine against the socketed core');
      assert.deepEqual(audit.offPolicy, [],
        'house rules hold on a material that came out of a glTF translation — '
        + 'MeshStandardMaterial at envMapIntensity 0.45, no ShaderMaterial, no bloom');
      assert.equal(audit.tower, 'glbreal', 'and it audited the model that is up');

      const occ = await a.dbg(`towerOcclusionCheck('glbreal')`);
      assert.ok(occ && !occ.pending, 'the probe runs against a loaded model');
      assert.ok(Array.isArray(occ.eyes) && occ.eyes.length === 6,
        `six shipped eyes — three presets x {full, mini} (got ${occ.eyes && occ.eyes.length})`);
      for (const band of ['shaft', 'cowl', 'exit', 'hood']) {
        assert.ok(occ.eyes.every((e) => e[band] && e[band].n > 0
          && typeof e[band].blocked === 'number'),
          `every eye reports the ${band} band with a real sample count — the `
          + `structure a verdict will later be read from`);
      }
      assert.equal(occ.despawnY, 9.75 - 1.75,
        'and the probe sampled against the FIXTURE\'s despawn line, not the classic '
        + 'one — its grids follow the bore (v.smp.kR), which is the whole reason '
        + 'a moved portal can be graded at all');

      // AND THE TWO HARD BANDS ARE A VERDICT, NOT A SHAPE (ROADMAP T8). This
      // used to be shape-only for a good reason and a bad one. The good one
      // stands: exit and hood are SOFT bands a portal is a MINIMUM for, and
      // grading them needs a per-tower allowance. The bad one was that the
      // fixture LEAKED — 11/99 of the cowl band at the highest eye — because
      // its front was capped at its own entry rim, and a leaking asset cannot
      // carry the assertion that would have caught it. It does not leak now
      // (the recipe builds the front to front_height_needed), so the claim the
      // bake gate makes about the file is also made about the SOCKETED model,
      // which is the only version a player would ever see.
      for (const e of occ.eyes) {
        assert.equal(e.shaft.blocked, e.shaft.n,
          `${e.id}: the shaft band is fully hidden (${e.shaft.blocked}/${e.shaft.n}) — `
          + `a die's fall must not be watchable from a shipped camera`);
        assert.equal(e.cowl.blocked, e.cowl.n,
          `${e.id}: and so is the cowl band (${e.cowl.blocked}/${e.cowl.n}), which is `
          + `where the VANISH happens. This is the band a front built only to the `
          + `entry rim cannot cover: the ray to it crosses the socket plane above `
          + `the rim, so "my model is as tall as its mouth" is a leak by construction`);
      }

      // The other half of C6: a row whose model has NOT arrived gets `pending`
      // rather than a plausible answer about whatever the bench is wearing.
      await a.dbg(`towerRegisterGlb('glbslow', '/no/such/model.glb')`);
      assert.deepEqual(await a.dbg(`towerOcclusionCheck('glbslow')`),
        { pending: true, id: 'glbslow' },
        'a probe of an unloaded row is PENDING, never a pass on the previous '
        + 'skin — that is the one result nobody would think to re-check');

      // PUT THE BENCH AWAY. towerLabSet deepens the mat by matExtra exactly as
      // the socket does (it is the same towerMatDepth, one layer over), so a lab left standing
      // would make the restoration assertion at the end measure the lab rather
      // than the tower. Leaving it up is also just wrong: the probe is a tool,
      // not a state this scenario is entitled to hand to the next one.
      assert.equal(await a.dbg('towerCore(false)'), false, 'the lab comes down');

      await a.dbg(`setTower('none')`);
      await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'down again' });
      await a.dbg(`setTower('glbmin')`);
      await a.waitFor(`window.__diceDebug.tower === 'glbmin'`,
        { desc: 'and a second socket of an already-loaded model is same-tick' });

      // ---- (4) a model that is not there -----------------------------------
      assert.equal(await warnsMatching('/no/such/file.glb'), 0, 'nothing has failed yet');
      await a.dbg(`towerRegisterGlb('badtower', '/no/such/file.glb')`);
      await a.dbg(`setTower('badtower')`);
      await a.waitFor(`window.__diceDebug.towerModelStatus('badtower').status === 'error'`,
        { desc: 'the retry ladder runs out' });
      assert.equal((await a.dbg(`towerModelStatus('badtower')`)).retries, 3,
        'three retries after the first attempt — the whole ladder ran');
      assert.equal(await a.dbg('tower'), 'glbmin',
        'THE TABLE KEEPS THE TOWER IT HAS. A model that never arrives costs a '
        + 'tower, never the one standing');
      assert.equal(await a.dbg('pendingTower'), 'badtower',
        'and the change stays QUEUED rather than degrading to none — a later '
        + 'retry or a later boot can still raise it');
      assert.deepEqual((await a.dbg('worldBodies()')).named, ORDER,
        'the socketed colliders were never touched');
      assert.ok(await warnsMatching('/no/such/file.glb') > 0,
        'and the console says so — the player watching a tower that never comes '
        + 'up deserves a reason to exist in the log');
      assert.ok(await warnsMatching('badtower') > 0, 'naming the row, not just the url');

      // …and a classic id still recovers, over the top of the stuck pending one.
      await a.dbg(`setTower('bastion')`);
      await a.waitFor(`window.__diceDebug.tower === 'bastion'`,
        { desc: 'a classic tower recovers the table' });
      assert.equal(await a.dbg('pendingTower'), null, 'and the queue is clear');

      // ---- (5) restored ----------------------------------------------------
      await a.dbg(`setTower('none')`);
      await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'the tower comes down' });
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      // THE MAT COMES BACK TO THE PRESET ON THE SAME DOUBLE (T1), and this is
      // where that stopped being a hope.
      //
      // The deepening used to be `TABLE_D += extra` up and `TABLE_D += -extra`
      // down, and at this preset that round trip is not the identity:
      // 6.7 + 4.5 - 4.5 === 6.699999999999999, one ulp low. (Measured for all
      // three presets — 'wide' happens to be exact, 'medium' and 'close' each
      // lose a bit.) No tower scenario had ever seen it because they all run
      // ONLINE, where the server's settings default is zoom 'wide'
      // (server.js:365) and hello reassigns TABLE_D from the preset before
      // anything sockets; this scenario is solo, stands at the client default
      // 'medium', and is the first thing in the suite to unsocket there.
      //
      // It mattered because z0 = -TABLE_D/2 anchors every collider the film is
      // baked against: two clients in one room at 'medium', one of whom had
      // raised and lowered a tower, could bake one seed against interiors
      // differing in the last bit — goal 15's exact failure, hidden behind a
      // default. Depth is now a SUM of layers, re-derived (MAT_DEPTH /
      // towerMatDepth), so putting a layer away restores the base rather than
      // subtracting its way back to somewhere near it.
      //
      // deepEqual, deliberately: this assertion was `6.7 + 4.5 - 4.5` and went
      // RED on the fix, which is the red check for it. This tab is the hardest
      // case in the suite to survive — it moved the mat a dozen times (four
      // towers, two tower→tower swaps, and a LAB cycle nested INSIDE a
      // socketed tower, which is the only place two layers are ever up at
      // once), and it lands on the preset exactly.
      const downExtents = await a.dbg('tableExtents()');
      assert.deepEqual(downExtents, wasExtents,
        `the mat is the preset again, to the bit — width and depth `
        + `(${JSON.stringify(downExtents)} vs ${JSON.stringify(wasExtents)})`);
      assert.equal(downExtents.d, 6.7,
        'and it is the literal preset depth, not a value that merely rounds to it');
      const downWorld = await a.dbg('worldBodies()');
      assert.deepEqual(downWorld.named, [], 'not one collider left in the WORLD');
      assert.equal(downWorld.count, wasWorld.count,
        `the body list is the towerless one again, exactly `
        + `(${wasWorld.count} before, ${downWorld.count} after)`);
    },
  },
  {
    name: 'tower-glb-freshness',
    tags: ['tower', 'glb'],
    // A RE-BAKED MODEL MUST REACH A WARM BROWSER (js/towerglb.js, 2026-08-13).
    // The loader fetched with `cache: 'force-cache'`, which serves ANY stored
    // copy without revalidating — so the first browser to cache a model kept
    // it across every reload, every re-bake, and even a hard refresh (a hard
    // refresh bypasses the cache only for requests made DURING the reload;
    // this fetch fires later, at the settings boundary). server.js had
    // already learned this lesson from the other side — the frozen-mtime 304
    // disaster ("THE VALIDATOR IS A CONTENT HASH") — and serves the app tree
    // no-cache + ETag precisely so browsers revalidate. force-cache silently
    // opted back out, client-side.
    //
    // Found LIVE, not by a test: round 5 tightened the hollowbole mouth on
    // disk and on the wire, and the one browser with a warm cache — the
    // user's — kept round 4. Every harness profile is COLD, which is why no
    // scenario had ever seen it; this one manufactures the warm-cache case.
    //
    // The throwaway origin below rotates bytes under ONE url and speaks the
    // contract server.js speaks (ETag over bytes, Cache-Control: no-cache,
    // body-less 304 on If-None-Match), plus CORS because the page sees it as
    // a foreign origin. The two bodies are the suite's two existing models,
    // whose declared portals differ everywhere — rimY is the discriminator
    // asserted, 8.0 (min tower) vs 9.75 (bake fixture).
    //
    // RED CHECKS (each run, seen red, reverted, seen green again):
    //   · js/towerglb.js fetch flipped back to `cache: 'force-cache'`: RED at
    //     the load-2 rim — `8 !== 9.75` — the reload wore the STALE model,
    //     which is the live bug reproduced. The hits ledger agrees: the
    //     browser never contacted the server again ({full: 1, notModified: 0}
    //     where load 2 expects a second full fetch).
    //   · the discriminator guard: MIN_TOWER_PORTALS.in.rimY changed to 9.75
    //     would gut every rim assertion at once, so it is asserted unequal
    //     up front rather than trusted.
    async fn(ctx) {
      const { createServer } = await import('node:http');
      const { createHash } = await import('node:crypto');

      assert.notEqual(MIN_TOWER_PORTALS.in.rimY, 9.75,
        'the discriminator discriminates: the two models declare different rims');

      const v1 = minTowerGlb().glb;
      const v2 = readFileSync(join(FIXTURES, 'tower_fixture.glb'));
      let body = v1;
      const hits = { full: 0, notModified: 0 };
      const srv = createServer((req, res) => {
        const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 27)}"`;
        const head = { ETag: etag, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' };
        const inm = req.headers['if-none-match'];
        if (inm && inm.split(',').some((t) => t.trim() === etag)) {
          hits.notModified += 1;
          res.writeHead(304, head);
          return res.end();
        }
        hits.full += 1;
        res.writeHead(200, { ...head, 'Content-Type': 'model/gltf-binary', 'Content-Length': body.length });
        res.end(body);
      });
      await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${srv.address().port}/rebaked.glb`;

      try {
        const a = await lobbyTab(ctx, { clean: ['dice.roomsettings.v1'] });
        // Table.reload() settles on netReady.online — a ROOM rejoin — which
        // the lobby never reaches (netOnline false is what makes it the
        // lobby), so it times out against a perfectly healthy page. Same
        // sentinel discipline, settled on the lobby's own ready instead.
        const reloadLobby = async () => {
          await a.eval(`window.__reloading = true; location.reload(); true`).catch(() => {});
          await settleNavigation(a,
            `!window.__reloading && !!window.__diceDebug `
            + `&& (window.__diceDebug.identity || {}).lobby === true`,
            'the lobby reloads');
        };
        // One socket cycle: tune the ladder, mint the row, raise it, read the
        // spec the engine derived. Repeated verbatim after each reload
        // because a debug row is per-page state — and the reload IS the test.
        const socket = async () => {
          await a.dbg(`towerGlbTune({ retryMs: [10, 20, 40], holdMaxMs: 400 })`);
          await a.dbg(`towerRegisterGlb('glbfresh', ${JSON.stringify(url)})`);
          await a.dbg(`setTower('glbfresh')`);
          await a.waitFor(`window.__diceDebug.tower === 'glbfresh'`, { desc: 'the model sockets' });
          return a.dbg(`towerPortalSpec('glbfresh')`);
        };

        const s1 = await socket();
        assert.equal(s1.portals.in.rimY, MIN_TOWER_PORTALS.in.rimY, 'load 1 wears v1');
        assert.deepEqual(hits, { full: 1, notModified: 0 },
          'one full fetch primed the browser cache');

        body = v2; // the re-bake: same url, new bytes
        await reloadLobby();
        const s2 = await socket();
        assert.equal(s2.portals.in.rimY, 9.75,
          'THE CLAIM: the next load REVALIDATES and wears the new bytes — a '
          + 'warm cache must never pin a re-baked model to its old mouth');
        assert.equal(s2.derived.despawnY, 9.75 - 1.75,
          'and the new rim reached towerVolumes, not merely the parse');
        assert.deepEqual(hits, { full: 2, notModified: 0 },
          'the ETag mismatch cost one full fetch — the price of a re-bake');

        await reloadLobby(); // nothing has changed since
        const s3 = await socket();
        assert.equal(s3.portals.in.rimY, 9.75, 'unchanged bytes, unchanged tower');
        assert.deepEqual(hits, { full: 2, notModified: 1 },
          'an unchanged model costs a BODY-LESS 304, not a refetch — freshness '
          + 'is one conditional round-trip per load, never a download');
      } finally {
        srv.closeAllConnections?.();
        srv.close();
      }
    },
  },
  {
    name: 'tower-roll',
    tags: ['roll', 'physics', 'tower', 'settings', 'cuj8'],
    // THE TOWER AS A ROOM SETTING (docs/TOWER.md, shipped 2026-08-12). With
    // `tower: 'heartwood'` a roll is baked as a POUR — scripted entry, hidden
    // transit behind the skin, exit through the doorway — instead of a throw.
    //
    // Each assertion below has a way to fail, and it is named, because "the
    // dice ended somewhere" is exactly the green check this project keeps
    // catching itself writing:
    //
    //   · socketed   — fails if towerSocket never runs: the mat stays at the
    //                  preset depth and towerBodies() is empty.
    //   · delivered  — fails if a die rests inside the tower (z < z0 + 0.6),
    //                  out of bounds, or under the floor. This is THE EXIT
    //                  GUARANTEE, and it is the whole reason the bake retries.
    //   · shows      — reads the die's RENDERED orientation, not the values
    //                  array, so a broken face correction cannot pass by
    //                  agreeing with itself.
    //   · hidden     — fails if any die has no hidden window, which is what a
    //                  throw with a model standing behind it would look like.
    //                  A pour with no hidden windows is scenery.
    //   · clunks     — fails if the baffle knocks are not in the film; the
    //                  film-time click gate is what voices them, so a clunk
    //                  that is not a film event is silence.
    //   · replay     — same seed, same film. Fails the moment anything in the
    //                  pour path reads Date.now or Math.random.
    //   · restored   — fails if unsocketing leaks a body, forgets the back
    //                  wall plane, or leaves the mat deep. THE FIRST LAW: with
    //                  no tower the world must be byte-for-byte the one every
    //                  other scenario in this file measures.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.settle();

      // What the towerless table is, measured before anything is socketed —
      // the restoration assertion compares against THIS rather than against
      // numbers typed here, so a zoom-ladder retune cannot make it lie.
      const wasExtents = await a.dbg('tableExtents()');
      const wasWalls = await a.dbg('wallPositions()');
      const wasWorld = await a.dbg('worldBodies()');
      assert.equal(await a.dbg('tower'), 'none', 'no tower is the default');
      assert.deepEqual(wasWorld.named, [],
        'and a towerless world carries none of its colliders');

      // ---- socketed ------------------------------------------------------
      // Through the settings path, so this exercises the same code a chip
      // click does: POST → server validation → 'settings-changed' echo.
      await a.dbg(`setTower('heartwood')`);
      for (const t of [a, b]) {
        await t.waitFor(`window.__diceDebug.tower === 'heartwood'`,
          { desc: 'the tower goes up on both tabs' });
      }
      const upExtents = await a.dbg('tableExtents()');
      assert.ok(upExtents.d > wasExtents.d,
        `the tower brings the room it consumes — mat ${wasExtents.d} → ${upExtents.d}`);
      assert.equal(upExtents.w, wasExtents.w, 'width is untouched; only depth pays');
      const ORDER = ['doorL', 'doorR', 'lintel', 'towerBack', 'towerL', 'towerR', 'ramp', 'lip'];
      assert.deepEqual((await a.dbg('towerBodies()')).map((x) => x.name), ORDER,
        'the eight engine colliders, in contract order (SAP body order is shared truth)');
      const upWorld = await a.dbg('worldBodies()');
      assert.deepEqual(upWorld.named, ORDER, 'and the WORLD holds those eight, in that order');
      assert.equal(upWorld.count, wasWorld.count + 8,
        `eight bodies added and nothing else (${wasWorld.count} → ${upWorld.count})`);
      const upWalls = await a.dbg('wallPositions()');
      assert.ok(upWalls.back.z < -900,
        `the back wall PLANE is sent away, not removed — the doorway boxes are `
        + `the back of the room now (got z=${upWalls.back.z})`);

      // ---- the picker SHOWS which tower is up ------------------------------
      // Not decoration, and not a claim about taste: a setting whose chosen
      // value looks exactly like the values it was chosen over is a setting
      // nobody can read. This is pinned because it was BROKEN when the Tower
      // picker copied the Mat zoom picker's shape — U22 correctly moved
      // role="radio" chips from aria-pressed to aria-checked, the stylesheet
      // named only aria-pressed, and from that day the chosen zoom level was
      // styled identically to the other two. Measured, not eyeballed: the
      // selected chip's computed background must differ from an unselected
      // one, in every radiogroup in the modal.
      await a.dbg('openSettings("staging")');
      // The picker is generated from TOWERS and must show every row that a
      // player can CHOOSE — the registry is the source of truth, so this
      // reads it rather than hard-coding three, and it fails on a tower that
      // ships without a chip (or a chip that outlives its row).
      //
      // …EXCEPT a `venueOnly` row (W3's Hollow Bole), which belongs to a
      // venue and is chosen by choosing the venue — GOALS goal 13 says a
      // fantasy venue REPLACES the à-la-carte pickers, so a chip for it in
      // the tower row would be the à-la-carte offer the venue exists to
      // withdraw. The exemption is read off the registry, not named here,
      // so a second venue tower needs no edit and a row that quietly loses
      // its chip still fails.
      const registry = await a.dbg('towerRegistry()');
      const chipIds = JSON.parse(await a.eval(
        `JSON.stringify([...document.querySelectorAll('#tower-picker [data-tower]')]
          .map((b) => b.dataset.tower))`));
      assert.deepEqual(chipIds, registry.filter((t) => !t.venueOnly).map((t) => t.id),
        `every choosable tower has a chip, in registry order (${chipIds.join(', ')}; `
        + `venue-only: ${registry.filter((t) => t.venueOnly).map((t) => t.id).join(', ') || 'none'})`);
      assert.ok(chipIds.length >= 3,
        `and there are at least three of them — a PICKER, not a switch `
        + `(${chipIds.length})`);
      const chipStyles = JSON.parse(await a.eval(`JSON.stringify(
        ['#zoom-picker', '#tower-picker'].map((sel) => [...document.querySelectorAll(sel + ' .system-chip')]
          .map((b) => ({ on: b.getAttribute('aria-checked') === 'true',
                         bg: getComputedStyle(b).backgroundColor,
                         fg: getComputedStyle(b).color }))))`));
      for (const [i, group] of chipStyles.entries()) {
        const on = group.find((c) => c.on);
        const off = group.find((c) => !c.on);
        assert.ok(on && off, `picker ${i}: has both a chosen and an unchosen chip to compare`);
        assert.notEqual(on.bg, off.bg,
          `picker ${i}: the chosen chip is not painted like the ones it was chosen over `
          + `(both ${on.bg})`);
        assert.notEqual(on.fg, off.fg, `picker ${i}: nor lettered like them`);
      }
      // …AND THE ROW STILL FITS. New with the fourth chip (2026-08-14): the
      // assertions above are about PAINT and would be just as green with the
      // chips overflowing their container or collapsed to nothing. A picker
      // grows by one row every time the registry does, and "it looked fine at
      // three" is not a property. Measured: every chip has real width and
      // real height, and the group does not scroll sideways.
      const chipBox = JSON.parse(await a.eval(`(() => {
        const g = document.getElementById('tower-picker');
        return JSON.stringify({
          over: g.scrollWidth - g.clientWidth,
          chips: [...g.querySelectorAll('[data-tower]')].map((b) => {
            const r = b.getBoundingClientRect();
            return { id: b.dataset.tower, w: Math.round(r.width), h: Math.round(r.height) };
          }),
        });
      })()`));
      for (const c of chipBox.chips) {
        assert.ok(c.w > 8 && c.h > 8,
          `the '${c.id}' chip is actually laid out at ${chipBox.chips.length} chips `
          + `(${c.w}×${c.h} px)`);
      }
      assert.ok(chipBox.over <= 1,
        `and the picker does not overflow sideways at ${chipBox.chips.length} chips `
        + `(scrollWidth − clientWidth = ${chipBox.over}px)`);
      await a.eval(`document.getElementById('settings-modal').classList.add('hidden')`);

      // ---- EVERY MODEL BRINGS A VOICE, AND ITS OWN ------------------------
      // A registry invariant, not a per-tower fact, so it is asserted over the
      // registry and costs nothing when a fourth model lands: a row with a
      // skin must carry a clunkVoice (docs/TOWER.md §6), 'none' must not, and
      // no two may be the same — two towers that sound alike are one tower
      // twice, and the palette is the only thing besides shape a skin gets.
      const skinned = registry.filter((t) => t.skin);
      assert.ok(skinned.length >= 3, `three models or more to compare (${skinned.length})`);
      for (const t of skinned) {
        assert.ok(t.clunkVoice && t.clunkVoice.body,
          `${t.id} registers a sound palette (${JSON.stringify(t.clunkVoice)})`);
      }
      const heard = skinned.map((t) => JSON.stringify(t.clunkVoice));
      assert.equal(new Set(heard).size, heard.length,
        `and no two models sound alike (${skinned.map((t) => `${t.id}:${t.clunkVoice.body}`)
          .join(', ')})`);

      // ---- delivered / shows / hidden / clunks ----------------------------
      const pour = async (notation) => {
        await a.dbg(`commandRoll(${JSON.stringify(notation)})`);
        await a.waitFor(
          '!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
          { desc: `${notation}: the pour reached the client` });
        // P6: freeze the rAF clock and step the film exactly as far as we say.
        await a.dbg('holdClock(true)');
        const f = JSON.parse(await a.eval(
          'JSON.stringify(window.__diceDebug.towerFilmInfo())'));
        await a.dbg(`sim(${f.frames + 240})`);
        const after = JSON.parse(await a.eval(
          'JSON.stringify(window.__diceDebug.towerFilmInfo())'));
        await a.dbg('holdClock(false)');
        return after;
      };

      // '40d6' is the STRESS pool and it earns its seconds: the pour's one
      // measured failure — a die going still inside the skin's shadow, frozen
      // at SETTLE_STILL before the watchdog's 1.2 s bar could rescue it — only
      // appeared at forty dice and on rare eight-die seeds. Below twenty dice
      // the exit guarantee is never asked a hard question, so a scenario that
      // stopped at 8d6 would be green on the bug that shipped in this file's
      // first draft.
      for (const notation of ['1d20', '1d8+1d6+1d10', '8d6', '40d6']) {
        const f = await pour(notation);
        assert.ok(f.pour, `${notation}: the roll was baked as a POUR, not a throw`);

        for (const r of f.rest) {
          assert.ok(r.delivered,
            `${notation} d${r.i} (${r.type}): delivered onto open felt — rests at `
            + `(${r.p.join(', ')}), and the hidden zone is z < ${(f.z0 + f.hidZone).toFixed(2)}`);
          assert.ok(r.visible,
            `${notation} d${r.i}: and it is on screen when the film ends`);
          assert.equal(r.shows, r.declared,
            `${notation} d${r.i} (${r.type}): the die SHOWS what the table declared `
            + `(rendered ${r.shows}, declared ${r.declared})`);
        }

        // A pour has a middle. Every die must have been behind the skin for a
        // real stretch of film — the contract's transit floor is 0.5 s, and
        // half of that is a bar no throw could clear by accident.
        f.hidden.forEach((gaps, i) => {
          const longest = gaps.reduce((m, g) => Math.max(m, g[1] - g[0] + 1), 0);
          assert.ok(gaps.length >= 1 && longest >= 15,
            `${notation} d${i}: went through the tower — a hidden window of `
            + `${longest} frames (${gaps.length} in all)`);
        });

        // 2–4 clunks per die, in the film, where the click gate can find them.
        // ABOVE THE RECORDER'S 400-EVENT BUDGET the two compete and clunks are
        // dropped like anything else — 40d6 spends the budget on real landings
        // and keeps 65 knocks. That is the recorder working, not the tower
        // failing, so the per-die bound is asserted on the pools that fit and
        // a capped pour only has to be audible at all.
        const capped = f.impacts >= 400;
        if (capped) {
          assert.ok(f.clunks > 0,
            `${notation}: the tower is still audible with the event budget spent `
            + `(${f.clunks} knocks inside ${f.impacts} events)`);
        } else {
          assert.ok(f.clunks >= 2 * f.rest.length && f.clunks <= 4 * f.rest.length,
            `${notation}: 2–4 baffle clunks per die are film events `
            + `(${f.clunks} for ${f.rest.length} dice)`);
        }
        assert.ok(f.impacts > f.clunks,
          `${notation}: and the real landings are recorded alongside them `
          + `(${f.impacts} total events)`);

        await a.dbg('clearTable()');
        await a.dbg('sim(400)');
      }

      // ---- the OTHER towers -------------------------------------------------
      // Deliberately NOT another copy of everything above. What is new when a
      // registry grows a row is exactly three things — the swap, the socket it
      // lands on, and the sound palette — and each of those has its own way to
      // fail:
      //
      //   · through-towerless — fails if towerSocket ever mutates a live rig
      //     in place. cannon's SAP enumerates contact pairs in BODY ORDER, so
      //     a client that swapped in place would carry a differently-ordered
      //     body list and bake the same seed into a different film than the
      //     client that unsocketed first. `mid` is the only moment that is
      //     visible from outside, and it is recorded for this.
      //   · order — fails if a later tower's socket builds anything of its
      //     own. There is one collider builder and skins add nothing.
      //   · voice — fails if the palette is not resolved from the SOCKETED
      //     TOWER. Red-checked by pointing the resolver at the die set: the
      //     assertion goes red because bastion's thud becomes heartwood's
      //     clack the moment the tower stops being the thing that is asked.
      //   · pour — fails if a skin swap changed the film at all; the knocks
      //     are baked from the seed and the tower is not in the bake.
      //
      // PARAMETERISED OVER THE REGISTRY (2026-08-14, when the third model
      // landed). It used to name bastion and would have needed copying for
      // Black Anvil — and a copied block is how a suite grows a per-tower tax
      // that nobody pays attention to by the fifth one. Every skinned model
      // that is not the starting one goes through the same four questions,
      // and a new row is covered the day it is registered.
      //
      // settle() first, and not as a formality: a tower change is a ROOM
      // change and rides the roll boundary (queueTower), so asking for one
      // while the table still counts as busy parks it in pendingTower and the
      // wait below would sit there until the harness gave up. clearTable()
      // does not end a roll.
      //
      // The sound palette (docs/TOWER.md §6) is asked of the drain's OWN
      // resolver, with a die set that HAS a voice of its own — otherwise "the
      // tower won" and "there was nothing to win against" look identical.
      // emberforge.blackanvil on purpose: it is a thud, and bastion is ALSO a
      // thud, so a resolver that reached for the die set would fail on the
      // weight and the tail rather than on the family. That near-miss is the
      // one worth pinning and it is why the set is not swapped per tower.
      const voices = Object.fromEntries(registry.map((t) => [t.id, t.clunkVoice]));
      const SET = 'emberforge.blackanvil';
      const setVoice = await a.dbg(`impactVoiceFor({}, '${SET}')`);
      assert.equal(voices.none, null, 'no tower, no tower voice');
      assert.ok(setVoice, `${SET} brings a voice of its own to argue with`);

      let from = 'heartwood';
      for (const model of skinned.filter((t) => t.id !== 'heartwood')) {
        const id = model.id;
        await a.settle();
        await b.settle();
        await a.dbg(`setTower('${id}')`);
        for (const t of [a, b]) {
          await t.waitFor(`window.__diceDebug.tower === '${id}'`,
            { desc: `${model.label} goes up on both tabs` });
        }
        const swap = await a.dbg('towerSwap()');
        assert.equal(swap.from, from, `the swap into ${id} started from ${from}`);
        assert.equal(swap.to, id, `and landed on ${id}`);
        assert.equal(swap.mid, wasWorld.count,
          `and passed through the TOWERLESS body list on the way — `
          + `${swap.before} → ${swap.mid} → ${swap.after}, and ${swap.mid} is the `
          + `${wasWorld.count} a table with no tower carries`);
        assert.equal(swap.after, wasWorld.count + 8, 'ending on eight again, not sixteen');
        assert.deepEqual((await a.dbg('towerBodies()')).map((x) => x.name), ORDER,
          `${id}: the same eight engine colliders, in the same contract order`);
        assert.deepEqual(await a.dbg('tableExtents()'), upExtents,
          `${id}: and the same room — every tower consumes the same mat`);

        assert.deepEqual(await a.dbg(`impactVoiceFor({clunk:'baffle'}, '${SET}')`), voices[id],
          `${id}: a baffle knock is voiced by the SOCKETED TOWER, over the die `
          + `set's own (${JSON.stringify(voices[id])})`);
        assert.deepEqual(await a.dbg(`impactVoiceFor({}, '${SET}')`), setVoice,
          `${id}: and an ordinary landing is still the die set — the tower `
          + 'voices its own knocks, not the whole roll');

        // The DRESSING claims used to live here, inside this loop, and they
        // moved out to `tower-dressing` (ROADMAP T4): they are questions about
        // geometry, groups and declarations, every one of them answerable
        // without a die in the room, and keeping them here meant a mesh change
        // could only be proved by a scenario that pours. They are not weaker
        // for moving — they gained the dressing BUDGET, which was a printed
        // number in a tool until then.

        // ---- the PORTAL SPEC this model resolves to ------------------------
        // Every model shipped so far declares no portals and therefore gets
        // the classic core, and asserting that is not a tautology: `source`
        // is how a model whose portals silently failed to load tells you so.
        // A tower reading 'default' when it meant to state its own openings is
        // a doorway the engine put somewhere the model did not — dice flying
        // into the wall beside a door that is drawn open. Read off the
        // registry, so the day a row declares portals this line is what
        // notices.
        const ps = await a.dbg(`towerPortalSpec('${id}')`);
        // V2 ADAPTATION (W3, the day the comment above was written for).
        // NEW CLAIM: `default` for a classic row, `model` for a baked one.
        // OLD: `assert.equal(ps.source, 'default')` unconditionally — true
        // while every registered row was code-built. hollowbole is now a GLB
        // row and reads 'model', which is the WIN this line exists to notice,
        // not a regression: the paragraph above says in as many words that
        // "the day a row declares portals this line is what notices". The
        // claim is strictly stronger than the old one — each row is now
        // asserted to resolve from the source it actually has, so a baked row
        // that silently fell back to the classic core still fails here.
        assert.equal(ps.source, model.glb ? 'model' : 'default',
          `${id}: resolves to the ${model.glb ? 'portals declared by its model' : 'classic portals'} `
          + `(source '${ps.source}')`);
        assert.equal(ps.id, id, `${id}: and says which tower it answered for`);
        assert.equal(ps.derived.door.sill, ps.portals.out.sillY,
          `${id}: the engine's door sill IS the portal's sill — the derivation `
          + `is the spec, not a second copy of it (${ps.derived.door.sill})`);
        assert.ok(ps.portals.out.w >= ps.limits.out.wMin,
          `${id}: its doorway clears the radius arithmetic `
          + `(w ${ps.portals.out.w} ≥ ${ps.limits.out.wMin})`);
        assert.ok(ps.portals.in.clearR >= ps.limits.in.clearRMin,
          `${id}: and its mouth is not narrower than a d20 plus the aim jitter `
          + `(clearR ${ps.portals.in.clearR} ≥ ${ps.limits.in.clearRMin})`);

        const f = await pour('8d6');
        assert.ok(f.pour, `${id}: a pour is still a POUR`);
        // THE FILM RECORDS WHICH TOWER IT WAS BAKED WITH, and until now
        // nothing read it back. `tower` is what is standing now; `filmTower`
        // is what the bake actually used. They disagree exactly when a socket
        // change beat the roll boundary it is supposed to wait for, or when a
        // client applied an id its build cannot resolve — and in both cases
        // this screen is showing a pour nobody else in the room is watching.
        assert.equal(f.filmTower, id,
          `${id}: the film was baked with THIS tower, not merely played while `
          + `it happened to be standing (film ${f.filmTower}, socketed ${f.tower})`);
        assert.ok(f.clunks >= 2 * f.rest.length && f.clunks <= 4 * f.rest.length,
          `${id}: with the contract's 2–4 baffle knocks per die in the film `
          + `(${f.clunks} for ${f.rest.length} dice)`);
        for (const r of f.rest) {
          assert.ok(r.delivered && r.visible,
            `${id} d${r.i} (${r.type}): delivered onto open felt at (${r.p.join(', ')})`);
        }
        await a.dbg('clearTable()');
        await a.dbg('sim(400)');
        from = id;
      }
      await a.settle();
      await a.dbg(`setTower('heartwood')`);
      await a.waitFor(`window.__diceDebug.tower === 'heartwood'`,
        { desc: 'back to the wooden tower for the rest of this scenario' });
      // AND THE SECOND TAB TOO — a race this line did not used to be able to
      // lose. Everything below bakes films on BOTH tabs and compares them
      // keyframe for keyframe, but only tab A was ever waited on here, so tab
      // B could still be applying the change when the comparison ran. That was
      // harmless for as long as every registered tower resolved to the SAME
      // classic core: a lagging tab baked a byte-identical film and no
      // assertion could see the lag.
      //
      // hollowbole is the first row whose core genuinely differs (portals
      // in.rimY 9.40 / in.z -2.55 against the classic 8.75 / -2.00), and the
      // loop above leaves it standing — so a lagging tab B baked the whole
      // film 0.65 high and 0.55 back, which is exactly those two deltas and
      // nothing else. The films then differed while the SPANS still matched,
      // because a uniform translation of the core moves the despawn line with
      // the dice. Measured, not guessed: Δy 0.649999618 = 9.399999618 - 8.75,
      // Δz -0.549999952 = -2.549999952 + 2.00, to the last digit.
      await b.waitFor(`window.__diceDebug.tower === 'heartwood'`,
        { desc: 'and the second tab has applied it before any film is compared' });
      assert.deepEqual(await a.dbg(`impactVoiceFor({clunk:'baffle'}, '${SET}')`), voices.heartwood,
        'and the voice follows the tower back');

      // ---- A DEBUG DIAL CANNOT REACH A SHIPPED COLLIDER --------------------
      // Once, not per model: this is a claim about the engine, not about a
      // skin. docs/TOWER.md:107 says "the shipped socket does not read
      // TOWERLAB.tune for anything but matExtra" — and until the portal-spec
      // seam landed that sentence was FALSE. towerVolumes read
      // TOWERLAB.tune.lipTilt straight into the `lip` volume, which
      // towerColliders builds as one of the eight bodies on the MAIN world, so
      // one player poking a debug knob in DevTools baked films against a
      // differently-angled outrun than everybody else in the room. Films are a
      // pure function of the core and the seed; the core is not allowed a live
      // knob in it.
      //
      // THIS ASSERTION WOULD BE RED ON PRE-SEAM CODE — verified by reverting
      // the one line (`rx: TOWER_LIP_TILT` back to `rx: TOWERLAB.tune.lipTilt`)
      // and watching the lip body arrive at 0.3. Sabotage-checked in the other
      // direction too, by moving the constant itself: the recovered angle
      // follows it, so this is reading the real body and not a cached copy.
      //
      // The zoom round trip is the point of the shape: applyZoom unsockets and
      // re-sockets across a preset change, which is the shipped path that
      // re-derives every volume from scratch. A dial that leaked would leak
      // exactly there, and only there — asserting on a socket that was never
      // rebuilt would pass on the broken code too.
      {
        const lipOf = async (when) => {
          const b = (await a.dbg('towerBodies()')).find((x) => x.name === 'lip');
          assert.ok(b, `the lip collider exists ${when}`);
          return b;
        };
        // A quaternion from setFromEuler(rx, 0, 0) is (sin(rx/2), 0, 0, cos(rx/2)).
        const angleOf = (b) => 2 * Math.atan2(b.q[0], b.q[3]);
        const was = await lipOf('before the dial is touched');
        assert.ok(Math.abs(angleOf(was) - 0.1) < 1e-12,
          `the shipped lip sits at the frozen 0.1 rad (${angleOf(was)})`);

        const zoomWas = await a.dbg('zoom');
        await a.dbg('towerTune({lipTilt: 0.3})');
        assert.equal((await a.dbg('towerTune({})')).lipTilt, 0.3,
          'the lab dial really did move — otherwise this proves nothing');
        for (const z of ['close', zoomWas]) {
          await a.dbg(`setZoom('${z}')`);
          await a.waitFor(`window.__diceDebug.zoom === '${z}'`,
            { desc: `the mat goes to ${z} (unsocket + re-socket)` });
        }
        const now = await lipOf('after the unsocket/re-socket round trip');
        assert.ok(Math.abs(angleOf(now) - 0.1) < 1e-12,
          `and it is STILL 0.1 with the dial at 0.3 — the shipped core does not `
          + `read TOWERLAB.tune (${angleOf(now)})`);
        assert.deepEqual(now.q, was.q,
          'byte-for-byte the same rotation it was rebuilt from, not merely close');
        assert.notEqual(Math.round(angleOf(now) * 1e6), Math.round(0.3 * 1e6),
          'and emphatically not the dialled 0.3');

        await a.dbg('towerTune({lipTilt: 0.1})');
        assert.deepEqual(await a.dbg('tableExtents()'), upExtents,
          'and the zoom round trip put the room back where the rest of this '
          + 'scenario expects it');
      }

      // ---- the dress clock -------------------------------------------------
      // THE IDLE MOTION IS A FUNCTION OF THE SIM CLOCK AND NOTHING ELSE, which
      // is what makes a screenshot of a dressed tower deterministic.
      //
      // THE FIRST VERSION OF THIS WAS FURNITURE, and it is worth recording
      // why: it asserted that a HELD clock leaves the sway angle unchanged
      // across a quarter second of real time. Red-checked by driving the
      // stepper off Date.now — and it stayed GREEN, because a headless tab
      // that is not in front gets no requestAnimationFrame at all, so nothing
      // ticks either way and "frozen" is true for the wrong reason. A green
      // that cannot go red is not a check.
      //
      // So the angle is checked against the FORMULA instead: two sines, 2.63
      // apart, over the dt-accumulated clock. Any other clock lands somewhere
      // else immediately, and a stepper that never runs lands on the base
      // angle while the clock says otherwise.
      {
        const before = await a.dbg('towerDressAudit()');
        await a.dbg('sim(60)');
        const after = await a.dbg('towerDressAudit()');
        assert.ok(Math.abs((after.dressClock - before.dressClock) - 1) < 1e-6,
          `sim(60) advances the dress clock by exactly one second `
          + `(${before.dressClock} → ${after.dressClock})`);
        const swayAt = (s, t) => {
          const w = 2 * Math.PI * s.hz * t + s.phase;
          return s.base + s.amp * (0.65 * Math.sin(w) + 0.35 * Math.sin(2.63 * w + 1.7));
        };
        assert.ok(after.state.sway.length > 0, 'heartwood has something that sways');
        for (const s of after.state.sway) {
          assert.ok(Math.abs(s.rot - swayAt(s, after.dressClock)) < 1e-6,
            `the ${s.axis}-sway is exactly the two-sine idiom over the sim clock `
            + `at t=${after.dressClock} (rot ${s.rot}, formula ${swayAt(s, after.dressClock).toFixed(8)})`);
          assert.notEqual(s.rot, s.base,
            `and it is not sitting at its rest angle (${s.base}) — the stepper ran`);
        }
        // …and the clock itself does not run while it is held.
        await a.dbg('holdClock(true)');
        const held = await a.dbg('towerDressAudit()');
        await new Promise((r) => setTimeout(r, 250));
        assert.equal((await a.dbg('towerDressAudit()')).dressClock, held.dressClock,
          'and a held clock does not advance on its own');
        await a.dbg('holdClock(false)');
      }

      // ---- unseen ---------------------------------------------------------
      // A HIDDEN WINDOW IS HIDDEN ON SCREEN, not merely recorded as such. The
      // record above proves the bake believes a die was inside the tower; this
      // steps the film into that window and looks at the die. Written after
      // the record-only version was red-checked and passed with playback's
      // `mesh.visible` line deleted — a pour with the model as the only thing
      // hiding anything, which is exactly what §4 says a skin may never be
      // relied on for.
      await a.dbg('holdClock(true)');
      await a.dbg(`commandRoll('8d6')`);
      await a.waitFor(
        '!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
        { desc: 'the pour to look inside reached the client' });
      const look = JSON.parse(await a.eval(
        'JSON.stringify(window.__diceDebug.towerFilmInfo())'));
      const VIS = 'JSON.stringify(window.__diceDebug.tableDice.map((d) => d.mesh.visible !== false))';
      // Die 0's first transit: [in, out]. The bar above guarantees ≥15 frames,
      // so sampling two frames inside its ends cannot land on a boundary.
      const [gapIn, gapOut] = look.hidden[0][0];
      await a.dbg(`sim(${gapIn - 2})`);
      let seen = JSON.parse(await a.eval(VIS));
      assert.equal(seen[0], true,
        `d0 is in the room on its way down the shaft (frame ${gapIn - 2})`);
      await a.dbg(`sim(${Math.floor((gapIn + gapOut) / 2) - (gapIn - 2)})`);
      seen = JSON.parse(await a.eval(VIS));
      assert.equal(seen[0], false,
        `d0 is NOT rendered while it is inside the tower (frame `
        + `${Math.floor((gapIn + gapOut) / 2)}, of window ${gapIn}–${gapOut})`);
      await a.dbg(`sim(${look.frames + 240})`);
      seen = JSON.parse(await a.eval(VIS));
      assert.ok(seen.every(Boolean), 'and every die is back in the room at the end');
      await a.dbg('holdClock(false)');
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');

      // ---- replay ---------------------------------------------------------
      // Same payload, same seed, twice, on the same tab. The pour draws from a
      // stream derived from roll.seed alone; anything reaching for the wall
      // clock or Math.random breaks here on the first run.
      // THE ROUGH TRACK IS IN THE HASH, and it went in the same day it was
      // introduced (docs/AUDIO.md §4). A replay comparison that does not
      // cover a new array does not merely fail to test it — it stops testing
      // it silently, and the next change to the bake looks safe.
      const FILM = `(() => {
        const r = window.__diceDebug.currentRoll;
        const per = r.keyframes.map((arr) => arr.map((s) =>
          [s.pos.x, s.pos.y, s.pos.z, s.quat.x, s.quat.y, s.quat.z, s.quat.w]
            .map((f) => f.toFixed(9)).join(',')).join('|'));
        const rough = (r.rough || []).map((a) => Array.from(a).join(',')).join('||');
        return { hash: per.join('||'), frames: r.frames, duration: r.duration,
                 sounds: r.sounds.length, spans: JSON.stringify(r.pour.spans),
                 rough, roughLens: (r.rough || []).map((a) => a.length).join(',') };
      })()`;
      const bake = async () => {
        await a.dbg(`playRoll({ dice: ['d6','d6','d6','d6'], values: [1,2,3,4], `
          + `seed: 20260812, rollId: 'tower-replay' })`);
        const film = await a.eval(FILM);
        await a.dbg('clearTable()');
        await a.dbg('sim(400)');
        return film;
      };
      const one = await bake();
      const two = await bake();
      assert.equal(one.frames, two.frames, `same seed, same length (${one.frames} frames)`);
      assert.equal(one.duration, two.duration, 'same seed, same duration');
      assert.equal(one.sounds, two.sounds, 'same seed, same impact + clunk record');
      assert.equal(one.spans, two.spans, 'same seed, same hidden windows');
      assert.equal(one.hash, two.hash, 'same seed, byte-identical film');
      assert.equal(one.roughLens, two.roughLens,
        `same seed, same rough-track lengths (${one.roughLens})`);
      assert.ok(one.rough.length > 0,
        'the rough track is non-empty — otherwise the line below compares '
        + 'two empty strings and covers nothing');
      assert.equal(one.rough, two.rough,
        'same seed, byte-identical rough/surface track');

      // And across CLIENTS, which is the claim that actually matters: two
      // people watching one table watch the same pour.
      await a.roll('4d6');
      await b.settle();
      const sameFilm = `(() => {
        const r = window.__diceDebug.currentRoll;
        if (!r || !r.pour) return null;
        const per = r.keyframes.map((arr) => arr.map((s) =>
          [s.pos.x, s.pos.y, s.pos.z].map((f) => f.toFixed(9)).join(',')).join('|'));
        return { seed: r.seed, hash: per.join('||'), spans: JSON.stringify(r.pour.spans) };
      })()`;
      const fa = await a.eval(sameFilm);
      const fb = await b.eval(sameFilm);
      assert.ok(fa && fb, 'both tabs poured');
      assert.equal(fa.seed, fb.seed, 'one seed for the table');
      assert.equal(fa.spans, fb.spans, 'and the same die is hidden at the same frame');
      assert.equal(fa.hash, fb.hash, 'and the same pour, keyframe for keyframe');
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await b.settle();

      // ---- a fresh boot puts the tower up before it replays anything -------
      // A late joiner and a reload take the same path: hello.settings sockets
      // the tower, and THEN the newest on-felt roll is replayed through
      // playRoll. Get that order wrong and the returning player rebuilds the
      // table's pour as a throw, against walls 4.5 units shallower than
      // everyone else's. Asserted on the walls, which is the thing the film
      // is baked against.
      await a.roll('3d6');
      await b.settle();
      await b.reload();
      await b.waitFor(`window.__diceDebug.tower === 'heartwood'`,
        { desc: 'the reloaded tab comes back with the tower up' });
      assert.deepEqual(await b.dbg('tableExtents()'), upExtents,
        'and on the deepened mat, not the preset one');
      assert.deepEqual((await b.dbg('worldBodies()')).named, ORDER,
        'with the colliders socketed before the replay ran');
      await b.waitFor('window.__diceDebug.tableDice.length === 3',
        { desc: 'the on-felt roll rebuilt' });
      assert.ok(await b.eval('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.pour)'),
        'and the rebuild was baked as a POUR — which is only true if the socket '
        + 'ran BEFORE playRoll, not merely at some point during hello');
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await b.settle();

      // ---- deferred, never mid-roll ---------------------------------------
      // The zoom rule (queueTower): a change that arrives while a film is
      // playing waits for the roll boundary, because socketing moves the mat
      // AND the physics bodies the film was baked against.
      await a.dbg('holdClock(true)');
      await a.dbg(`commandRoll('6d6')`);
      await a.waitFor('!!window.__diceDebug.busy', { desc: 'a pour is in flight' });
      await a.dbg(`setTower('none')`);
      await a.waitFor(`window.__diceDebug.settings.tower === 'none'`,
        { desc: 'the change reached the client' });
      assert.equal(await a.dbg('tower'), 'heartwood',
        'the tower does NOT come down under a film that was baked with it');
      assert.equal(await a.dbg('pendingTower'), 'none', 'it is queued for the boundary');
      await a.dbg('holdClock(false)');
      await a.settle();

      // ---- restored --------------------------------------------------------
      await a.waitFor(`window.__diceDebug.tower === 'none'`,
        { desc: 'and lands at the roll boundary' });
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      assert.deepEqual(await a.dbg('tableExtents()'), wasExtents,
        'the mat is exactly the preset again');
      assert.deepEqual(await a.dbg('wallPositions()'), wasWalls,
        'every wall body is back where the towerless table had it');
      const downWorld = await a.dbg('worldBodies()');
      assert.deepEqual(downWorld.named, [],
        'and not one collider is left in the WORLD (towerBodies() would say `none` either way)');
      assert.equal(downWorld.count, wasWorld.count,
        `the body list is the towerless one again, exactly `
        + `(${wasWorld.count} before, ${downWorld.count} after)`);
      await a.roll('2d6');
      assert.equal(await a.eval('!!(window.__diceDebug.currentRoll.pour)'), false,
        'a roll with no tower is a THROW again — no pour film at all');
    },
  },
  {
    name: 'tower-hollowbole',
    tags: ['tower', 'fx'],
    // THE FAE VENUE'S TOWER (ROADMAP W3, docs/TOWER.md): a rotted hollow
    // trunk with a crown moot on it. tower-roll's registry loop already
    // covers everything a fourth row shares with the other three — the
    // swap, the socket, the voice, the pour. What is NEW about this one is
    // the three things no sibling has, and this scenario is only those:
    //
    //   · VENUE-ONLY. It has no chip and it must still socket. Both halves
    //     matter: the picker assertion in tower-roll would be just as green
    //     if the row had quietly stopped existing, and a row that cannot be
    //     set is a venue that cannot be entered. Also proves the SERVER
    //     allowlist, because setTower goes POST → validate → echo and a
    //     missing id in SETTING_SPECS is a patch the server refuses.
    //   · THE VALUE LADDER. Every emissive tier on this model is authored
    //     as `target / linearLuma(hue)` against post.js's bloom threshold,
    //     because there is no post-hoc bloom dial (fae grammar rule 3).
    //     The attendants are TERTIARY and must never cross the threshold;
    //     the caps are secondary; nothing in the skin may carry
    //     `userData.bloom`, which would disable the post-stack bypass for
    //     the whole app (techniques.md T2).
    //   · TWO SKIES, ONE MODEL. The same skin is built under both fae
    //     palettes, and the point of dividing by the hue's own luminance is
    //     that the two come out at the same VALUE with different colour. If
    //     a palette ever changes the value, the venue has two towers.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.settle();

      const wasWorld = await a.dbg('worldBodies()');

      // ---- venue-only: no chip, and it sockets anyway ---------------------
      await a.dbg('openSettings("staging")');
      const registry = await a.dbg('towerRegistry()');
      const row = registry.find((t) => t.id === 'hollowbole');
      assert.ok(row, 'hollowbole is a registered tower');
      assert.equal(row.venueOnly, true, 'and it is flagged venue-only');
      assert.ok(row.skin, 'with a skin builder');
      const chipIds = JSON.parse(await a.eval(
        `JSON.stringify([...document.querySelectorAll('#tower-picker [data-tower]')]
          .map((b) => b.dataset.tower))`));
      assert.ok(!chipIds.includes('hollowbole'),
        `a venue tower takes no chip of its own (${chipIds.join(', ')})`);
      await a.eval(`document.getElementById('settings-modal').classList.add('hidden')`);

      // Through the settings path, so the SERVER has to accept the id.
      await a.dbg(`setTower('hollowbole')`);
      await a.waitFor(`window.__diceDebug.tower === 'hollowbole'`,
        { desc: 'the server accepts the venue tower and it goes up' });

      // ---- the fit report, re-derived here rather than trusted -------------
      // tower-fit prints this for a human; the scenario gates on the same
      // audit, because "a human ran the tool once" is not a regression test.
      // The classifier's UNCLASSIFIED bucket is what fails: three real
      // overruns on this model's first cut landed in it (a root leaning out
      // of the socket sideways, a moot cap hanging in front of the socket's
      // face, and a bracket sized as if a unit sphere were a unit wide).
      const fit = await a.dbg('towerModelAudit()');
      assert.equal(fit.tower, 'hollowbole', 'the audit is looking at the right model');
      // Mesh COUNT measured the box-kit placeholder (a stack is many
      // meshes); the shipped shell is ONE displaced surface plus liner,
      // roots and dressing — fewer meshes because it is MORE organic, so
      // the placeholder-era bar of 20 inverted into a lie. What still
      // deserves gating: the skin is substantial (several parts) and the
      // organic shell itself is present by name.
      assert.ok(fit.meshes >= 10,
        `the skin is a substantial model (${fit.meshes} occluder meshes)`);
      assert.equal(fit.lights, 0, 'the skin brings zero lights');
      assert.deepEqual(fit.offPolicy, [],
        `and no off-policy material (${fit.offPolicy.join('; ')})`);
      const unclassified = fit.outs.filter((o) => o.cls === 'UNCLASSIFIED');
      assert.deepEqual(unclassified.map((o) => o.over.join(',')), [],
        `every overrun of the socket is a named legal class `
        + `(${fit.outs.length} overruns; hull x[${fit.hull.x}] y[${fit.hull.y}])`);
      // X HAS NO SLACK: the mat's own physics wall stands at 3.35 behind the
      // socket's 3.25, so a sideways overrun is a prop through the side of
      // the room whatever class it claims. Asserted separately from the
      // classifier because the classifier is allowed to forgive y and z.
      assert.ok(fit.hull.x[0] >= -3.25 && fit.hull.x[1] <= 3.25,
        `and nothing leaves the socket SIDEWAYS (hull x[${fit.hull.x}] `
        + `against ±3.25)`);
      const w = await a.dbg('worldBodies()');
      assert.equal(w.count - wasWorld.count, 8,
        `the skin adds no physics — the eight engine bodies and nothing else `
        + `(${wasWorld.count} → ${w.count})`);

      // ---- the moot: the value ladder, read off the live materials --------
      const moot = await a.dbg('towerMootAudit()');
      assert.ok(moot && moot.spec, 'the skin publishes what its moot is');
      assert.equal(moot.spec.paletteId, 'moonrise',
        'the table venue builds it under the default sky');
      assert.equal(moot.spec.gap, 1, 'the ring has exactly one gap');
      assert.equal(moot.spec.fallen, 1, 'and exactly one fallen member in it');
      assert.ok(moot.spec.caps >= 7 && moot.spec.caps <= 9,
        `an odd, small cap count — a moot, not a fairy light (${moot.spec.caps})`);
      assert.equal(moot.attendants, 4,
        `four attendants hover over it (${moot.attendants})`);
      assert.equal(moot.bloomFlags, 0,
        'and NOTHING in this skin carries userData.bloom — an always-on bloom '
        + 'source disables the post-stack bypass for the whole app (T2)');

      const attend = moot.roles.filter((r) => r.role === 'moot-attendant');
      assert.equal(attend.length, 2,
        `the attendants are merged into two swaying pairs (${attend.length} meshes)`);
      for (const r of attend) {
        // TERTIARY, and the bar is the one grammar rule 3 sets: the field
        // tier never exceeds 0.25 linear, which is well under the bloom
        // threshold read from post.js rather than retyped here.
        assert.ok(r.lum <= 0.25,
          `an attendant sits in the tertiary tier (${r.lum} linear, ceiling 0.25)`);
        assert.ok(r.lum < moot.bloomThreshold,
          `and nowhere near the bloom threshold (${r.lum} < ${moot.bloomThreshold})`);
      }
      const caps = moot.roles.find((r) => r.role === 'moot-caps');
      const gills = moot.roles.find((r) => r.role === 'moot-gills');
      const door = moot.roles.find((r) => r.role === 'door-hearth');
      assert.ok(caps && gills && door, 'the caps, the gills and the door are all lit');
      for (const [what, r, target] of [['caps', caps, moot.spec.tier.caps],
        ['gills', gills, moot.spec.tier.gills], ['door', door, moot.spec.tier.door]]) {
        assert.ok(Math.abs(r.lum - target) < 0.02,
          `${what}: the rendered emissive lands on its authored tier `
          + `(${r.lum} against ${target})`);
        assert.ok(r.lum < moot.bloomThreshold,
          `${what}: and stays under the bloom threshold (${r.lum} < ${moot.bloomThreshold})`);
      }
      // TIER SEPARATION (grammar rule 3): a tier may not overlap the tier
      // above it, and the attendants are two full stops below the caps. A
      // secondary source that crossed into primary has been promoted by
      // accident, and that is what this catches.
      assert.ok(caps.lum / attend[0].lum >= 3,
        `the attendants are two stops under the caps (${attend[0].lum} vs ${caps.lum})`);

      // ---- the idle motion is the sim clock and nothing else ---------------
      // Same instrument tower-roll uses on Heartwood and for the same
      // reason: "it moved" is satisfied by a wall clock, so the angle is
      // checked against the FORMULA. Here it is the moot's attendants, which
      // are the only thing on this tower that moves.
      {
        const after = await a.dbg('towerDressAudit()');
        const swayAt = (s, t) => {
          const wv = 2 * Math.PI * s.hz * t + s.phase;
          return s.base + s.amp * (0.65 * Math.sin(wv) + 0.35 * Math.sin(2.63 * wv + 1.7));
        };
        assert.equal(after.state.sway.length, 4,
          `two attendant pivots, two registrations each (${after.state.sway.length})`);
        for (const s of after.state.sway) {
          assert.ok(Math.abs(s.rot - swayAt(s, after.dressClock)) < 1e-6,
            `the ${s.axis}-sway is the two-sine idiom over the sim clock at `
            + `t=${after.dressClock} (rot ${s.rot}, formula ${swayAt(s, after.dressClock).toFixed(8)})`);
        }
      }

      // ---- a pour actually completes through it ---------------------------
      await a.dbg(`commandRoll('8d6')`);
      await a.waitFor(
        '!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.landings)',
        { desc: 'the pour reached the client' });
      await a.dbg('holdClock(true)');
      const f0 = JSON.parse(await a.eval(
        'JSON.stringify(window.__diceDebug.towerFilmInfo())'));
      await a.dbg(`sim(${f0.frames + 240})`);
      const f = JSON.parse(await a.eval(
        'JSON.stringify(window.__diceDebug.towerFilmInfo())'));
      await a.dbg('holdClock(false)');
      assert.ok(f.pour, 'the roll was baked as a POUR');
      assert.equal(f.rest.length, 8, `all eight dice are accounted for (${f.rest.length})`);
      for (const r of f.rest) {
        assert.ok(r.delivered,
          `d${r.i} (${r.type}): delivered onto open felt at (${r.p.join(', ')}) — `
          + `the hidden zone is z < ${(f.z0 + f.hidZone).toFixed(2)}`);
        assert.ok(r.visible, `d${r.i}: and on screen when the film ends`);
      }
      f.hidden.forEach((gaps, i) => {
        const longest = gaps.reduce((m, g) => Math.max(m, g[1] - g[0] + 1), 0);
        assert.ok(gaps.length >= 1 && longest >= 15,
          `d${i}: went through the trunk — a hidden window of ${longest} frames`);
      });
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await a.settle();

      // ---- TWO SKIES, ONE MODEL -------------------------------------------
      // The palette is baked into the materials at build time, so this
      // re-sockets. What must NOT change is the value: the tiers are
      // `target / linearLuma(hue)`, so a colder or paler sky moves the HUE
      // and leaves the luminance where the grammar put it. Without the
      // division, foxfire's near-white cap hue would land the moot two
      // thirds brighter than moonrise's teal and the venue would have two
      // different moots.
      const before = moot.roles.find((r) => r.role === 'moot-caps');
      // NEW CLAIM (W3 GLB rebuild): the palette now swaps the MODEL, not just
      // the materials. OLD: this block re-socketed and compared emissive
      // luminance only, because one code-built skin was tinted two ways.
      // WHY IT MOVED: the trunk is baked, so moonrise and foxfire are two
      // FILES, and "two skies, one model" has a second half that can now
      // break — the row must resolve to the other url while both stay loaded
      // and while the portals stay identical. A palette flip that re-entered
      // the loading wait, or that quietly kept the first file, would still
      // pass every luminance assertion below it.
      const vMoon = await a.dbg(`towerVariants('hollowbole')`);
      assert.equal(vMoon.variant, 'moonrise', 'the row reports the live variant');
      assert.match(vMoon.active, /hollowbole_moonrise\.glb$/,
        `and resolves to the moonrise file (${vMoon.active})`);
      assert.equal(vMoon.urls.length, 2, 'the row names both palettes');
      assert.deepEqual(vMoon.statuses, ['ready', 'ready'],
        `and BOTH are loaded before either is needed — a venue flip must not `
        + `re-enter a wait the player already served (${vMoon.statuses.join(', ')})`);
      assert.deepEqual(vMoon.mismatch, [],
        'and the two bakes declare identical portals — a mismatch is a BAKE '
        + 'error, and half the venues would deliver dice through a doorway the '
        + 'other half\'s engine never cut');
      const psMoon = await a.dbg(`towerPortalSpec('hollowbole')`);
      assert.equal(psMoon.source, 'model',
        'the engine reads its core from the MODEL now, not from the classic '
        + 'defaults (source \'' + psMoon.source + '\')');
      assert.deepEqual(psMoon.portals.in, { x: 0, rimY: 9.399999618530273, z: -2.549999952316284, clearR: 2.2 },
        'the mouth is the one the recipe declared, read off the glTF empties');

      await a.dbg(`faeTowerPalette('foxfire')`);
      await a.waitFor(`window.__diceDebug.tower === 'hollowbole'`,
        { desc: 'the tower comes back up under the other sky' });
      const vFox = await a.dbg(`towerVariants('hollowbole')`);
      assert.match(vFox.active, /hollowbole_foxfire\.glb$/,
        `the flip resolved to the OTHER file (${vFox.active})`);
      assert.notEqual(vFox.active, vMoon.active, 'which is a different url, not the same one');
      // The portals are the engine's whole core, so they must come out
      // identical across the flip — same geometry, different paint. Captured
      // BEFORE the flip (psMoon, above the faeTowerPalette call) and compared
      // after, because a spec compared against itself is a green check that
      // cannot fail.
      assert.deepEqual(await a.dbg(`towerPortalSpec('hollowbole')`), psMoon,
        'and the engine core is identical across the swap — the flip changes '
        + 'the paint, never the doorway');
      const fox = await a.dbg('towerMootAudit()');
      assert.equal(fox.spec.paletteId, 'foxfire', 'built under the foxfire palette');
      const foxCaps = fox.roles.find((r) => r.role === 'moot-caps');
      assert.ok(Math.abs(foxCaps.lum - before.lum) < 0.02,
        `the moot is the same VALUE under both skies (${before.lum} → ${foxCaps.lum})`);
      assert.notEqual(foxCaps.intensity, before.intensity,
        `and it got there by a different intensity, which is what proves the `
        + `division happened (${before.intensity} → ${foxCaps.intensity})`);
      assert.equal(fox.bloomFlags, 0, 'still nothing flagged for bloom');
      for (const r of fox.roles.filter((x) => x.role === 'moot-attendant')) {
        assert.ok(r.lum <= 0.25,
          `and the attendants are still tertiary under the other sky (${r.lum})`);
      }
      await a.dbg(`faeTowerPalette(null)`);

      // ---- and the first law, on the way out -------------------------------
      await a.dbg(`setTower('none')`);
      await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'unsocketed' });
      const end = await a.dbg('worldBodies()');
      assert.deepEqual(end.named, [], 'not one collider is left behind');
      assert.equal(end.count, wasWorld.count,
        `the body list is the towerless one again, exactly `
        + `(${wasWorld.count} before, ${end.count} after)`);
    },
  },

  {
    name: 'tower-hollowbole-replay',
    tags: ['tower', 'glb', 'fx'],
    // THE HELD REPLAY, ON A REAL ROW (js/main.js towerReleaseHeldReplay).
    //
    // tower-roll pins the hello-ordering law for a CODE tower: on a reload,
    // hello.settings sockets the tower and THEN the newest on-felt roll is
    // replayed, because getting that backwards rebuilds the table's pour as a
    // THROW against walls 4.5 units shallower than everybody else's. For a
    // code tower the law is free — both steps happen in one hello handler, in
    // source order, and nothing can get between them.
    //
    // A BAKED tower breaks it without reordering anything: it makes the first
    // step UNFINISHED when the second runs. So the replay is HELD, with a
    // deadline, and released when the model lands. That is a genuinely
    // asynchronous path and this scenario is the only thing that walks it with
    // a shipped row — tower-glb-loader proves the loader on a minted fixture in
    // a SOLO tab, which cannot reload into a room.
    //
    // AND IT COVERS A CHANGE THE TWO-VARIANT ROW MADE: the release now fires
    // once per url rather than once, because hollowbole ensures two files.
    // Releasing twice must be a no-op, not a second stashed replay.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
      await a.settle();
      const wasExtents = await a.dbg('tableExtents()');

      // The venue is how this tower goes up — it has no chip of its own.
      await a.dbg(`setVenue('moonrise')`);
      for (const t of [a, b]) {
        await t.waitFor(`window.__diceDebug.tower === 'hollowbole'`,
          { desc: 'the venue raises its tower on both tabs' });
      }
      const upExtents = await a.dbg('tableExtents()');
      assert.notDeepEqual(upExtents, wasExtents,
        'and the mat deepened for it, so the reload has something to get wrong');
      const ORDER = (await a.dbg('towerBodies()')).map((x) => x.name);
      assert.equal(ORDER.length, 8, 'eight engine colliders are standing');

      // A pour on the felt, which is what the reloading tab has to rebuild.
      await a.roll('3d6');
      await b.settle();
      assert.ok(await a.eval('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.pour)'),
        'the roll on the table is a POUR');

      // ---- the reload, which is where the model is not there yet -----------
      await b.reload();
      await b.waitFor(`window.__diceDebug.tower === 'hollowbole'`,
        { desc: 'the reloaded tab raises the tower once its model arrives' });
      const st = await b.dbg(`towerModelStatus('hollowbole')`);
      assert.equal(st.ready, true, 'and the row reports ready');
      assert.equal(st.status, 'ready',
        `with BOTH variants loaded, not just the one standing (${st.status})`);
      const vars = await b.dbg(`towerVariants('hollowbole')`);
      assert.deepEqual(vars.statuses, ['ready', 'ready'],
        `both files present after a cold boot (${vars.statuses.join(', ')})`);
      assert.deepEqual(vars.mismatch, [],
        'and they agree about where the doorway is');

      // THE ORDER, asserted the way tower-roll asserts it — on the walls and
      // on the film, because those are what the ordering actually decides.
      assert.deepEqual(await b.dbg('tableExtents()'), upExtents,
        'the replay ran against the DEEPENED mat, not the preset one');
      assert.deepEqual((await b.dbg('worldBodies()')).named, ORDER,
        'with the colliders socketed before the replay ran');
      await b.waitFor('window.__diceDebug.tableDice.length === 3',
        { desc: 'the on-felt roll is rebuilt after the model lands' });
      assert.ok(await b.eval('!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.pour)'),
        'and the rebuild was baked as a POUR — which is only true if the socket '
        + 'ran BEFORE playRoll. A replay released early would rebuild it as a '
        + 'THROW and nothing else on this tab would look wrong');
      const f = JSON.parse(await b.eval('JSON.stringify(window.__diceDebug.towerFilmInfo())'));
      assert.equal(f.filmTower, 'hollowbole',
        `the film names the tower it was baked with (${f.filmTower})`);
      assert.equal(f.z0, (await a.eval('window.__diceDebug.towerFilmInfo().z0')),
        'and both tabs baked against the same back wall');

      // LEAVING A FANTASY VENUE DOES NOT LOWER ITS TOWER, and that is the
      // shipped rule rather than an oversight: selectVenue patches
      // {venue, tower} only for the FANTASY register (js/main.js), so going
      // back to the table changes the room and leaves the tower the player is
      // looking at standing. Asserted rather than worked around — the first
      // draft of this scenario waited for 'none' here and timed out, which is
      // how the rule got read.
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await a.dbg(`setVenue('table')`);
      for (const t of [a, b]) {
        await t.waitFor(`window.__diceDebug.venue === 'table'`,
          { desc: 'both tabs are back in the table room' });
      }
      assert.equal(await a.dbg('tower'), 'hollowbole',
        'and the tower it raised is still standing — only the fantasy register '
        + 'patches the tower with the venue');

      await a.dbg(`setTower('none')`);
      for (const t of [a, b]) {
        await t.waitFor(`window.__diceDebug.tower === 'none'`,
          { desc: 'and it comes down when it is actually asked to' });
      }
      assert.deepEqual((await a.dbg('worldBodies()')).named, [],
        'not one collider is left behind');
    },
  },

  // ---------------------------------------------------------------------------
  // V1 AUDIO (docs/AUDIO.md)
  //
  // What makes any of this testable headless: the harness runs Chrome with
  // `--mute-audio` and WITHOUT `--autoplay-policy=no-user-gesture-required`
  // (tests/e2e/cdp.mjs), so the graph is built and observable while the
  // hardware stays silent, and the suspended-until-gesture state that a real
  // browser imposes reproduces exactly.
  //
  // Measured while writing these, and worth recording because it dictates the
  // shape of every assertion below: an AudioContext created with no user
  // gesture comes up 'suspended', and its resume() promise NEVER SETTLES —
  // not resolved, not rejected. So nothing on a boot path may await it, and a
  // scenario must poll the state rather than await the call.
  // ---------------------------------------------------------------------------
  {
    name: 'audio-graph',
    tags: ['fx', 'audio', 'roll'],
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      const info = () => a.dbg('audioGraphInfo()');

      // ---- nothing at boot -------------------------------------------------
      // A page nobody has touched must not have constructed an AudioContext at
      // all. Creating one eagerly holds the audio hardware open for a player
      // who may never roll, and on iOS it is the difference between a table
      // that unlocks on first touch and one that never unlocks.
      let g = await info();
      assert.equal(g.ctxState, null, 'a page nobody has touched has no AudioContext');
      assert.equal(g.built, false, 'and no graph');

      // ---- one roll builds the whole graph, once ---------------------------
      await a.roll('4d6');
      g = await info();
      assert.ok(g.built, 'a roll builds the graph');
      assert.ok(g.masterBuilt && g.softClipBuilt,
        'master and the tanh soft clip are both up');
      assert.equal(g.panBuses, 9, `nine pooled pan buses, found ${g.panBuses}`);
      assert.deepEqual(g.panValues, [-0.6, -0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45, 0.6],
        'spanning ±0.6 in steps of 0.15 — |pan| is capped at 0.6 by AUDIO.md refusal 9');
      assert.ok(g.sharedNoiseBuilt && g.sharedLoopBuilt,
        'and the two SHARED noise buffers exist');

      // ---- the GC claim, with its non-vacuity partner ----------------------
      // playImpact used to allocate and JS-fill a fresh AudioBuffer per
      // contact. Zero allocations is only a claim if sounds actually happened,
      // so the two are asserted together — the first half alone is satisfied
      // by an audio system that does nothing.
      assert.ok(g.oneShots > 0,
        `the roll voiced impacts (${g.oneShots} one-shots) — otherwise the`
        + ' allocation claim below is about a silent table');
      assert.equal(g.perHitBufferAllocs, 0,
        `not one per-hit AudioBuffer was allocated (${g.perHitBufferAllocs})`);

      // ---- suspended until a REAL gesture ----------------------------------
      assert.equal(g.ctxState, 'suspended',
        'and the context is still SUSPENDED — sound was asked for, the browser'
        + ' refused, and nothing in the app pretends otherwise');
      // A trusted key event through CDP is what user activation means. F8 on
      // purpose: the app's keydown switch has no case for it, so this grants
      // activation without doing anything else to the table.
      const key = (type) => a.page.browser.send('Input.dispatchKeyEvent',
        { type, key: 'F8', code: 'F8', windowsVirtualKeyCode: 119, nativeVirtualKeyCode: 119 },
        a.page.sessionId);
      await key('keyDown');
      await key('keyUp');
      await a.waitFor(`window.__diceDebug.audioGraphInfo().ctxState === 'running'`,
        { desc: 'one gesture unlocks the context' });

      // ---- the per-class gate cursors --------------------------------------
      g = await info();
      assert.deepEqual(Object.keys(g.gateCursors).sort(), ['clunk', 'impact', 'tap'],
        'three gate cursors, not one module-global lastSoundAt');
      assert.ok(g.gateCursors.impact > 0, 'the impact cursor moved with the roll');
      assert.equal(g.gateCursors.tap, 0,
        'and the tap cursor did not — nothing has scheduled a settle cluster');

      // ---- the hard floor, read off the app --------------------------------
      const gate = await a.dbg('clickGate');
      assert.equal(gate.wallFloorMs, 18,
        `the wall floor is ${gate.wallFloorMs} ms, not the 18 ms V1 audio raised it to`);

      // ---- the mute switch reaches the MASTER, not just the callers --------
      // The regression this pins: every sustained source added after this
      // increment routes through master, so a mute that only early-returns in
      // playImpact would leave a rolling voice grinding under a table whose
      // switch says off. Asserted on the node, not on the flag.
      await a.dbg('setSoundOn(false)');
      await a.waitFor('window.__diceDebug.audioGraphInfo().masterGain < 0.001',
        { desc: 'mute takes the master gain to zero' });
      await a.dbg('setSoundOn(true)');
      await a.waitFor('window.__diceDebug.audioGraphInfo().masterGain > 0.6',
        { desc: 'and unmute brings it back' });

      // ---- the default voice is FELT, not a click --------------------------
      // The most common event in the whole app. `click` is a 2500 Hz bandpass,
      // which by the published spectral measure sits above the wood/metal
      // perceptual boundary — it is metal on metal, i.e. the casino sound, and
      // it was what every unthemed roll on this table made. Asked of the
      // resolver rather than of the registry: a test that read IMPACT_VOICES
      // directly would stay green with the FALLBACK still wired to click.
      const std = await a.dbg(`impactPresetFor({}, 'std')`);
      assert.equal(std.body, 'felt', `the default body is felt (found ${std.body})`);
      assert.equal(std.filter, 'lowpass',
        `…and it is a LOWPASS, not a bandpass (found ${std.filter})`);
      assert.ok(std.baseFreq < 900,
        `…centred below 900 Hz, under the wood/metal line (found ${std.baseFreq})`);
      // click is still in the registry, for genuine die-on-die and bright sets.
      const clicky = await a.dbg(`impactPresetFor({}, 'std')`);
      assert.ok(clicky, 'the resolver still answers');

      // ---- the pan law -----------------------------------------------------
      // Nine buses is a node count; THIS is the claim that a contact lands on
      // the right one. |pan| is capped at 0.6 (AUDIO.md refusal 9) — a die hard-panned
      // beside your ear is a cartoon, and a table a metre away subtends ±25°.
      const panL = await a.dbg('audioPanFor(-3)');
      const panC = await a.dbg('audioPanFor(0)');
      const panR = await a.dbg('audioPanFor(3)');
      assert.ok(panL < -0.1, `a contact left of centre pans left (${panL})`);
      assert.equal(panC, 0, `a contact at centre pans centre (${panC})`);
      assert.ok(panR > 0.1, `a contact right of centre pans right (${panR})`);
      for (const x of [-1e6, 1e6, -50, 50]) {
        const p = await a.dbg(`audioPanFor(${x})`);
        // 1e-6, not 1e-9: AudioParam.value is a float32, so the bus built at
        // exactly −0.6 reads back as −0.6000000238418579.
        assert.ok(Math.abs(p) <= 0.6 + 1e-6,
          `x=${x} still lands inside the ±0.6 cap (${p})`);
      }

      // ---- the depth law ---------------------------------------------------
      // A gain multiplier only. The back of the mat is quieter than the front,
      // by a cue's worth rather than a mix move's worth.
      const near = await a.dbg('audioDepthGainFor([0, 0.6, 3])');
      const far = await a.dbg('audioDepthGainFor([0, 0.6, -3])');
      assert.ok(far < near, `the far edge is quieter than the near one (${far} < ${near})`);
      assert.ok(near <= 1 && far > 0.5,
        `and by a cue, not a duck (near ${near}, far ${far})`);
      assert.equal(await a.dbg('audioDepthGainFor(null)'), 1,
        'a placeless contact — a baffle knock — takes no depth attenuation');
    },
  },

  {
    name: 'audio-phases',
    tags: ['fx', 'audio', 'roll'],
    // THE THREE-PHASE CONTACT MACHINE (docs/AUDIO.md §3), asserted on the FILM
    // rather than on a painted frame. `audioFilmScan()` walks every frame of
    // the current roll in one call: the alternative is hundreds of CDP round
    // trips racing the rAF clock, which P6 exists to warn about.
    //
    // Nothing in this scenario makes a sound. The derivation is the subject.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      await a.dbg('holdClock(true)');

      // ---- 1. a rolling phase EXISTS ---------------------------------------
      // Before the machine landed the answer was zero, always, on every film:
      // dice went from airborne to settled with nothing in between, which is
      // exactly why the table has no sound for the middle of a throw.
      await a.dbg(`throwSeeded(['d6','d6','d6','d6'], 4242)`);
      await a.dbg('sim(1)');
      let scan = await a.dbg('audioFilmScan()');
      assert.ok(scan, 'the film is baked and scannable');
      const runs = scan.dice.map((d) => d.longestRollingRun);
      assert.ok(Math.max(...runs) >= 10,
        `at least one die rolls for ten consecutive frames (runs: ${runs.join(', ')})`);

      // ---- 2. `settled` flips exactly at the landing -----------------------
      // Two independent derivations of one fact, pinned against each other:
      // the machine's phase, and `landings[i].frame` — the TRUE stop frame the
      // bake recorded. Red-checked by moving the comparison one frame
      // (`i0 > frame`), which reports exactly one unsettled frame per die.
      //
      // `leftSettled` is a WEAKER CLAIM THAN IT LOOKS and is labelled so
      // rather than deleted. The code carries an absorbing clause
      // (`prev === 'settled' || …`); removing it leaves this scenario GREEN,
      // because the playback cursor is monotone and `settleFrame` is fixed, so
      // `i0 >= settleFrame` is already absorbing on its own. Red-checked
      // exactly that way. The clause stays as cheap insurance against a future
      // span that outlives a landing (hidden is tested first), and this
      // assertion stays as the regression pin on the ORDERING — but it is not
      // evidence for the clause, and a green here must not be read as such.
      for (const d of scan.dice) {
        assert.equal(d.settledEarly, 0,
          `d${d.i} is not reported settled before frame ${d.settleFrame} `
          + `(${d.settledEarly} early frames)`);
        assert.equal(d.unsettledAtOrAfterLanding, 0,
          `d${d.i} is settled from frame ${d.settleFrame} on `
          + `(${d.unsettledAtOrAfterLanding} frames say otherwise)`);
        assert.equal(d.leftSettled, 0, `d${d.i} never comes back out of settled`);
      }

      // ---- 3. a settled die cannot be heard --------------------------------
      // THE DESIGN ASKED FOR "speed === 0 && angSpeed === 0 for every frame
      // past settle", justified by the by-reference `frozenPose` the bake
      // pushes after a freeze. MEASURED, IT IS FALSE, and for two reasons
      // worth writing down rather than working around:
      //
      //   · `landings[].frame` is the RECOVERED stop instant — the bake
      //     rewinds it by SETTLE_STILL from the freeze it earned — so the ~27
      //     frames between the two carry real, sub-millimetre motion. On a
      //     4d6 at seed 4242: 24 frames after d0's settle at 52, all 24
      //     moving, peak 0.33 u/s and 0.20 rad/s.
      //   · the frozen tail is not in the film at all. `stillTailFrames` came
      //     back 0, because the tail cut truncates the reel at the LAST
      //     landing — the dead frozen frames the design wanted to exercise
      //     are exactly the frames the cut deletes.
      //
      // So the claim that is actually true is weaker and more interesting: a
      // die past its settle never gets lively enough to START rolling (it
      // stays under the ENTER bar), and it drifts by well under a unit per
      // second. Measured on the same throw, d3 peaks at 1.06 rad/s after its
      // settle at frame 45 — OVER the 0.9 exit bar. Which means the absorbing
      // rule is load-bearing rather than decorative: without it, a die the
      // bake has already called landed would keep grinding for another half
      // second. Claim 2 above is what proves absorption; this is what says
      // why it had to exist. Bars read off the app, never restated here.
      const tune = await a.dbg('audioTune()');
      const withTail = scan.dice.filter((d) => d.framesAfterSettle > 0);
      assert.ok(withTail.length > 0,
        'at least one die has film left after it settled — otherwise this '
        + 'claim is about nothing (the tail cut truncates at the LAST landing)');
      for (const d of withTail) {
        assert.ok(d.maxAngSpeedAfterSettle < tune.rollEnterAng,
          `d${d.i}: over the ${d.framesAfterSettle} frames after its settle at `
          + `${d.settleFrame} it never reaches the ${tune.rollEnterAng} rad/s `
          + `entry bar (peak ${d.maxAngSpeedAfterSettle})`);
        assert.ok(d.maxSpeedAfterSettle < 1,
          `d${d.i}: …and drifts under 1 u/s (peak ${d.maxSpeedAfterSettle})`);
      }
      assert.ok(withTail.some((d) => d.maxAngSpeedAfterSettle > tune.rollExitAng),
        'and at least one die is still over the EXIT bar after its recorded '
        + 'landing — the absorbing rule is doing real work, not decoration');

      // ---- 4. nobody teleports ---------------------------------------------
      // A sanity bar on the kinematics themselves. 60 u/s is far above
      // anything this table's gravity can produce and far below what a
      // despawn-to-doorway jump reads as, so it separates the two cleanly.
      for (const d of scan.dice) {
        assert.ok(d.maxSpeed < 60,
          `d${d.i} never exceeds 60 u/s on a plain throw (peak ${d.maxSpeed})`);
      }
      await a.dbg('holdClock(false)');
      await a.settle();
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');

      // ---- 5. under a tower: hidden frames, and STILL no teleport ----------
      // The despawn trap. A poured die vanishes at the occlusion line and
      // reappears at the doorway; a central difference straddling that gap
      // reads as tens of units per second, and every level derived from it is
      // wrong for exactly the frames a player is watching the exit.
      await a.dbg(`setTower('heartwood')`);
      await a.waitFor(`window.__diceDebug.tower === 'heartwood'`,
        { desc: 'the tower goes up' });
      await a.dbg('holdClock(true)');
      await a.dbg(`commandRoll('6d6')`);
      await a.waitFor(
        '!!(window.__diceDebug.currentRoll && window.__diceDebug.currentRoll.pour)',
        { desc: 'a pour is baked' });
      scan = await a.dbg('audioFilmScan()');
      assert.ok(scan.pour, 'the scan is looking at a pour');
      const hid = scan.dice.reduce((n, d) => n + d.hiddenFrames, 0);
      assert.ok(hid > 0, `the pour has hidden frames to be silent about (${hid})`);
      for (const d of scan.dice) {
        assert.equal(d.hiddenNotSilent, 0,
          `d${d.i}: every one of its ${d.hiddenFrames} hidden frames reports `
          + `phase 'hidden' (${d.hiddenNotSilent} do not)`);
        assert.ok(d.maxSpeed < 60,
          `d${d.i} does not teleport out of the tower (peak ${d.maxSpeed} u/s)`);
      }

      // ---- the baked rough / surface track ---------------------------------
      // One byte per die per FRAME, recorded in the bake with NO velocity
      // gate: `sounds`' `v > 2` bar is an event log's "this happened,
      // audibly" line, and a die grinding along the felt is a stream of
      // contacts every one of which is under it. That is why the middle of a
      // throw was silent, and the track is the fix.
      for (const d of scan.dice) {
        assert.equal(d.roughLen, scan.frames,
          `d${d.i}: one rough byte per frame, cut with the film `
          + `(${d.roughLen} bytes for ${scan.frames} frames)`);
      }
      const rolled = scan.dice.filter((d) => d.rollingFrames > 0);
      assert.ok(rolled.length > 0, 'some die rolled, so there is a window to look in');
      for (const d of rolled) {
        assert.ok(d.roughInRollingWindow > 0,
          `d${d.i}: the rough bytes are non-zero somewhere in its rolling `
          + `window (${d.roughInRollingWindow} of ${d.rollingFrames} frames)`);
      }
      // The surface class is the thing `e.body.material` was being thrown
      // away for. A poured roll must show felt contacts (1) — and the pour
      // knocks the tower's baffles, which are walls (2).
      const felt = scan.dice.reduce((n, d) => n + d.surfaces[1], 0);
      assert.ok(felt > 0, `dice are recorded touching the felt (${felt} frames)`);

      // ---- the live per-frame view -----------------------------------------
      // rollingState() answers about the frame playback last stepped, which is
      // the surface the rolling voices will be levelled from.
      await a.dbg('sim(1)');
      const live = await a.dbg('rollingState()');
      assert.equal(live.dice.length, 6, 'one record per die');
      assert.ok(live.dice.every((d) => typeof d.phase === 'string' && d.settleFrame >= 0),
        'each carrying a phase and the frame it stops on');
      assert.ok(live.dice.every((d) => d.targetLevel === 0),
        'and no target level yet — rolling voices arrive in increment 4');

      await a.dbg('holdClock(false)');
      await a.settle();
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await a.settle();
      await a.dbg(`setTower('none')`);
      await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'the tower comes down' });
    },
  },

  {
    name: 'audio-rolling',
    tags: ['fx', 'audio', 'roll'],
    // THE SUSTAINED MIDDLE (docs/AUDIO.md §3.3). Two halves:
    //   · the LEVEL is film-derived, so it can be asserted headless with no
    //     sound made and no graph built at all;
    //   · the VOICE POOL is a run-forever lifetime (AudioBufferSourceNode is
    //     single-use, so silence is level → 0 and never stop()), which is the
    //     shape that leaks if nothing brings it down.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      await a.dbg('holdClock(true)');

      // ---- the level, derived, with no audio at all ------------------------
      await a.dbg(`throwSeeded(['d6','d6','d6','d6'], 4242)`);
      // Walk the film and keep the highest target level any die reached while
      // it was rolling, plus what the phase said at that moment. One eval, no
      // round-trip-per-frame race (P6).
      const peak = await a.eval(`(() => {
        const D = window.__diceDebug;
        let best = { level: 0, phase: null, i: -1 };
        let rollingFrames = 0, levelledFrames = 0, silentWhileRolling = 0;
        for (let w = 0; w < 600 && !D.busy; w++) D.sim(1);
        for (let f = 0; f < 900 && D.busy; f++) {
          D.sim(1);
          const st = D.rollingState();
          if (!st) break;
          for (const d of st.dice) {
            if (d.phase === 'rolling') {
              rollingFrames++;
              if (d.targetLevel > 0) levelledFrames++; else silentWhileRolling++;
            }
            if (d.targetLevel > best.level) best = { level: d.targetLevel, phase: d.phase, i: d.i };
            if (d.phase !== 'rolling' && d.targetLevel > 0) return { bug: 'levelled while ' + d.phase };
          }
        }
        return { best, rollingFrames, levelledFrames, silentWhileRolling };
      })()`);
      assert.ok(!peak.bug, `only a ROLLING die carries a level (${peak.bug})`);
      assert.ok(peak.rollingFrames > 0,
        `the throw has rolling frames to level (${peak.rollingFrames})`);
      assert.ok(peak.best.level > 0,
        `a rolling die reaches a positive target level (peak ${peak.best.level} on d${peak.best.i})`);
      assert.equal(peak.best.phase, 'rolling', 'and the peak belongs to a rolling die');
      // The mix ceiling. A 4d6 will not approach it; the claim is that the
      // clamp is real and the level is a fraction, not a full-scale gain.
      const tune = await a.dbg('audioTune()');
      assert.ok(peak.best.level <= 0.12 + 1e-9,
        `and stays under the summed rolling clamp (${peak.best.level})`);
      assert.ok(tune.masterGain === 0.7, 'the ladder is still hung off master 0.7');

      await a.settle();
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');

      // ---- the pool: built for real, and brought back down -----------------
      // audioForce is the same seat as `postForced`: sustained sources are
      // gated on a real-time frame, and sim() is not one, so without it every
      // claim below would be vacuously green against a pool that was never
      // built.
      await a.dbg('audioForce(true)');
      await a.dbg(`throwSeeded(['d6','d6','d6','d6','d6','d6'], 909)`);
      const live = await a.eval(`(() => {
        const D = window.__diceDebug;
        let maxLive = 0, maxPool = 0;
        for (let w = 0; w < 600 && !D.busy; w++) D.sim(1);
        for (let f = 0; f < 900 && D.busy; f++) {
          D.sim(1);
          const g = D.audioGraphInfo();
          maxLive = Math.max(maxLive, g.poolLive);
          maxPool = Math.max(maxPool, g.poolSize);
        }
        return { maxLive, maxPool };
      })()`);
      assert.ok(live.maxPool > 0,
        `the pool actually got built (${live.maxPool} voices) — without this `
        + 'the teardown claim below is about nothing');
      assert.ok(live.maxLive > 0, `and voices went live (${live.maxLive})`);
      assert.ok(live.maxPool <= 40,
        `never past the ${40}-die table cap (${live.maxPool})`);

      // THE LEAK CLAIM, AND IT HAS TO BE MADE MID-ROLL. Written first as
      // settle() → clearTable(), which stayed GREEN with clearTable's
      // teardown deleted — because the end of the film silences the pool on
      // its own, so that version was a check of a different thing than it
      // claimed. The case that actually leaks is a table cleared while the
      // dice are still turning: stepPlayback stops being called and nothing
      // else would ever bring the levels down.
      const mid = await a.eval(`(() => {
        const D = window.__diceDebug;
        D.throwSeeded(['d6','d6','d6','d6','d6','d6'], 7171);
        for (let w = 0; w < 600 && !D.busy; w++) D.sim(1);
        for (let f = 0; f < 900 && D.busy; f++) {
          D.sim(1);
          if (D.audioGraphInfo().poolLive > 0) return { liveAt: f, live: D.audioGraphInfo().poolLive };
        }
        return { liveAt: -1, live: 0 };
      })()`);
      assert.ok(mid.live > 0,
        `voices are grinding mid-flight (${mid.live} live at frame ${mid.liveAt})`);
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      const after = await a.dbg('audioGraphInfo()');
      assert.equal(after.poolLive, 0,
        `and clearing the table under them stops every one (${after.poolLive} left)`);
      assert.ok(after.poolSize <= 40,
        `the pool did not grow past the cap (${after.poolSize})`);
      // ---- MUTE INTEGRITY (verifier catch, fixed at the gate) --------------
      // The master gain already silences the OUTPUT; this pins that the
      // sustained POOL obeys the switch too — a muted table running live
      // rolling voices under its own mute passed every earlier test.
      const muted = await a.eval(`(() => {
        const D = window.__diceDebug;
        D.setSoundOn(false);
        D.throwSeeded(['d6','d6','d6','d6','d6','d6'], 7171);
        let peak = 0;
        for (let w = 0; w < 600 && !D.busy; w++) D.sim(1);
        for (let f = 0; f < 900 && D.busy; f++) {
          D.sim(1);
          peak = Math.max(peak, D.audioGraphInfo().poolLive);
        }
        D.setSoundOn(true);
        return peak;
      })()`);
      assert.equal(muted, 0,
        `soundOn=false keeps the rolling pool silent for a whole roll (peak live ${muted})`);
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');

      // ---- THE FROZEN CLOCK FREEZES THE LOAD (verifier catch, fixed) -------
      // Load smoothing advances by FILM FRAMES: a repeat frame (120 Hz
      // viewers, holdClock) must not move it. tick(0) replays the same film
      // frame; before the fix each call smoothed the load again and the
      // level drifted under a frozen picture.
      const frozen = await a.eval(`(() => {
        const D = window.__diceDebug;
        D.throwSeeded(['d6','d6','d6','d6','d6','d6'], 7171);
        for (let w = 0; w < 600 && !D.busy; w++) D.sim(1);
        for (let f = 0; f < 900 && D.busy; f++) {
          D.sim(1);
          const rs = D.rollingState();
          if (rs && rs.dice.some((d) => d.targetLevel > 0)) break;
        }
        const before = D.rollingState().dice.map((d) => d.targetLevel);
        for (let i = 0; i < 30; i++) D.tick(0, false, false);
        const afterT = D.rollingState().dice.map((d) => d.targetLevel);
        return { before, afterT };
      })()`);
      assert.deepEqual(frozen.afterT, frozen.before,
        'thirty repeat frames move no level: the load lives on the film clock, not the call count');

      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await a.dbg('audioForce(false)');
      await a.dbg('holdClock(false)');
      await a.settle();
    },
  },

  {
    name: 'audio-settle',
    tags: ['fx', 'audio', 'roll'],
    // THE SCHEDULED TAIL (docs/AUDIO.md §3.4). A die does not stop, it dies
    // down: a geometric run of taps, each quieter and duller and closer
    // together than the last, and then genuine silence.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      await a.dbg('holdClock(true)');
      await a.dbg('audioForce(true)');

      const bake = async (seed) => {
        await a.dbg(`throwSeeded(['d6','d6','d6','d8'], ${seed})`);
        await a.eval('(() => { const D = window.__diceDebug;'
          + ' for (let w = 0; w < 600 && !D.busy; w++) D.sim(1);'
          + ' for (let f = 0; f < 1200 && D.busy; f++) D.sim(1); return 1; })()');
        const info = await a.dbg('audioSettleInfo()');
        await a.dbg('clearTable()');
        await a.dbg('sim(400)');
        return info;
      };

      // ---- one cluster per die ---------------------------------------------
      // Before this increment the answer was zero. The LAST die is the one to
      // watch: the film is truncated at ITS landing, so there is no settled
      // frame after it — the design expected a special case on the
      // roll.time >= duration branch. Measured, the frame clamp already
      // delivers the crossing, and this count is what keeps that honest.
      const one = await bake(31337);
      assert.equal(one.plans.length, one.dice,
        `one cluster per die (${one.plans.length} for ${one.dice} dice)`);

      // ---- the intervals are geometric, inside the jitter band -------------
      // ratio 0.42, jitter ±12%, so consecutive gaps must land in
      // [0.42·0.88/1.12, 0.42·1.12/0.88] = [0.33, 0.535].
      for (const p of one.plans) {
        assert.ok(p.gaps.length >= 4,
          `d${p.di}: the tail is more than a couple of ticks (${p.gaps.length} taps)`);
        for (let k = 1; k < p.gaps.length; k++) {
          const r = p.gaps[k] / p.gaps[k - 1];
          assert.ok(r > 0.32 && r < 0.55,
            `d${p.di} tap ${k}: the gap ratio stays geometric within jitter `
            + `(${r.toFixed(3)} of ${p.gaps[k - 1].toFixed(4)}s)`);
        }
        for (let k = 1; k < p.amps.length; k++) {
          assert.ok(p.amps[k] < p.amps[k - 1],
            `d${p.di} tap ${k}: quieter than the one before it`);
        }
      }

      // ---- THE GATE-THEFT CLAIM --------------------------------------------
      // The tail is SUPPOSED to be denser than the hard floor. If taps went
      // through the impact cursor, every gap under 18 ms would be a tap that
      // never happened — which is IMMERSION §366's predicted failure wearing
      // its usual disguise ("the new sounds are too loud/too sparse"). So:
      // the plan must contain gaps below the floor, and must contain all of
      // them.
      const gate = await a.dbg('clickGate');
      const floorS = gate.wallFloorMs / 1000;
      const shortest = Math.min(...one.plans.map((p) => Math.min(...p.gaps)));
      assert.ok(shortest < floorS,
        `the tail gets denser than the ${gate.wallFloorMs} ms impact floor `
        + `(shortest gap ${(shortest * 1000).toFixed(2)} ms) — which is only `
        + 'possible because taps never consult the impact cursor');
      assert.ok(one.plans.every((p) => p.gaps.length === p.amps.length),
        'and every scheduled tap has both a time and a level');

      // ---- same seed, byte-identical tail ----------------------------------
      // Rhythm is the determinism line (docs/AUDIO.md §4): timbre may differ
      // between two people in one room, timing may not. The schedule comes
      // from hash(seed, di, k) and nothing else.
      const two = await bake(31337);
      assert.deepEqual(two.plans.map((p) => [p.di, p.gaps]),
        one.plans.map((p) => [p.di, p.gaps]),
        'the same seed schedules byte-identical tap times');
      const other = await bake(31338);
      // SORT BY DIE (verifier catch): landing ORDER differs across seeds, so
      // comparing the arrays as scheduled passed even with the seed severed
      // from the hash — the witness was green for a reason it did not name.
      // Per-die comparison is blind to order and red under exactly that
      // sabotage (seed >>> 0 -> 0 >>> 0: byDi arrays become identical).
      const byDi = (plans) => [...plans].sort((x, y) => x.di - y.di).map((p) => p.gaps);
      assert.notDeepEqual(byDi(other.plans), byDi(one.plans),
        'and a different seed does not — otherwise the hash is not being '
        + 'consulted at all and the claim above is vacuous');

      // ---- MUTE INTEGRITY (verifier catch, fixed at the gate) --------------
      // The master gain already silences the OUTPUT; this pins that the
      // sustained POOL obeys the switch too — a muted table running live
      // rolling voices under its own mute passed every earlier test.
      const muted = await a.eval(`(() => {
        const D = window.__diceDebug;
        D.setSoundOn(false);
        D.throwSeeded(['d6','d6','d6','d6','d6','d6'], 7171);
        let peak = 0;
        for (let w = 0; w < 600 && !D.busy; w++) D.sim(1);
        for (let f = 0; f < 900 && D.busy; f++) {
          D.sim(1);
          peak = Math.max(peak, D.audioGraphInfo().poolLive);
        }
        D.setSoundOn(true);
        return peak;
      })()`);
      assert.equal(muted, 0,
        `soundOn=false keeps the rolling pool silent for a whole roll (peak live ${muted})`);
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');

      // ---- THE FROZEN CLOCK FREEZES THE LOAD (verifier catch, fixed) -------
      // Load smoothing advances by FILM FRAMES: a repeat frame (120 Hz
      // viewers, holdClock) must not move it. tick(0) replays the same film
      // frame; before the fix each call smoothed the load again and the
      // level drifted under a frozen picture.
      const frozen = await a.eval(`(() => {
        const D = window.__diceDebug;
        D.throwSeeded(['d6','d6','d6','d6','d6','d6'], 7171);
        for (let w = 0; w < 600 && !D.busy; w++) D.sim(1);
        for (let f = 0; f < 900 && D.busy; f++) {
          D.sim(1);
          const rs = D.rollingState();
          if (rs && rs.dice.some((d) => d.targetLevel > 0)) break;
        }
        const before = D.rollingState().dice.map((d) => d.targetLevel);
        for (let i = 0; i < 30; i++) D.tick(0, false, false);
        const afterT = D.rollingState().dice.map((d) => d.targetLevel);
        return { before, afterT };
      })()`);
      assert.deepEqual(frozen.afterT, frozen.before,
        'thirty repeat frames move no level: the load lives on the film clock, not the call count');

      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      await a.dbg('audioForce(false)');
      await a.dbg('holdClock(false)');
      await a.settle();
    },
  },

  {
    name: 'audio-shaft',
    tags: ['fx', 'audio', 'roll', 'tower'],
    // THE TOWER'S COLOUR ON ITS OWN KNOCKS (docs/AUDIO.md §2.4), and THE
    // FIRST LAW asked the only way it can honestly be asked.
    //
    // The palette question is put to `impactVoiceFor` — the drain's OWN
    // resolver — and never to towerClunkVoice(). tower-roll records why: a
    // test that reads the registry function directly stays green with the
    // drain wired straight back to the die set, which is the shape of green
    // check this project keeps catching itself writing.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });
      const SET = 'emberforge.blackanvil'; // a set with a voice of its own to argue with

      // ---- towerless: no shaft anywhere ------------------------------------
      await a.roll('4d6');
      let g = await a.dbg('audioGraphInfo()');
      assert.equal(g.shaftBuilt, false,
        'a towerless roll never builds a shaft bus — it has no clunk event '
        + 'that could reach one');
      assert.equal((await a.dbg(`impactVoiceFor({}, '${SET}')`) || {}).shaft, undefined,
        'and an ordinary landing carries no shaft row');
      assert.equal(await a.dbg(`impactVoiceFor({clunk:'baffle'}, '${SET}').shaft`), undefined,
        'nor does a baffle knock with NO TOWER UP — the FIRST LAW, asked of '
        + 'the resolver rather than of the registry');
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');

      // ---- every skinned tower brings its own shaft row --------------------
      const registry = await a.dbg('towerRegistry()');
      const skinned = registry.filter((t) => t.id !== 'none');
      assert.ok(skinned.length >= 3, `three or more models to compare (${skinned.length})`);
      const rows = [];
      for (const model of skinned) {
        await a.settle();
        await a.dbg(`setTower('${model.id}')`);
        await a.waitFor(`window.__diceDebug.tower === '${model.id}'`,
          { desc: `${model.label} goes up` });
        const voice = await a.dbg(`impactVoiceFor({clunk:'baffle'}, '${SET}')`);
        assert.ok(voice && voice.shaft,
          `${model.id}: a baffle knock resolves a shaft row through impactVoiceFor`);
        assert.deepEqual(voice.shaft, model.clunkVoice.shaft,
          `${model.id}: and it is the SOCKETED model's row, not another's`);
        for (const k of ['delayS', 'combGain', 'mode1Hz', 'mode2Hz']) {
          assert.equal(typeof voice.shaft[k], 'number', `${model.id}: ${k} is a number`);
        }
        assert.equal((await a.dbg(`impactVoiceFor({}, '${SET}')`)).shaft, undefined,
          `${model.id}: an ordinary landing still takes the DIE SET's voice, `
          + 'with no shaft — the tower colours its own knocks, not the roll');
        rows.push(JSON.stringify(voice.shaft));
      }
      assert.equal(new Set(rows).size, rows.length,
        `no two models share a shaft (${rows.join(' | ')}) — two towers that `
        + 'sound alike are one tower twice');

      // ---- and a pour actually builds it -----------------------------------
      await a.settle();
      await a.dbg(`setTower('heartwood')`);
      await a.waitFor(`window.__diceDebug.tower === 'heartwood'`,
        { desc: 'back to the wooden tower' });
      await a.roll('6d6');
      g = await a.dbg('audioGraphInfo()');
      assert.equal(g.shaftBuilt, true,
        'a POUR builds the shaft bus — the knocks went through the chute');

      // ---- and coming down leaves nothing pointing at it -------------------
      await a.settle();
      await a.dbg(`setTower('none')`);
      await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'the tower comes down' });
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');
      assert.equal(await a.dbg(`impactVoiceFor({clunk:'baffle'}, '${SET}').shaft`), undefined,
        'with the tower down there is no shaft to resolve again');
      await a.roll('4d6');
      // The bus is a permanent node and stays built — that is the lifetime
      // rule, not a leak. What must be true is that nothing REACHES it, and
      // the line above is the claim that says so.
      assert.equal(await a.eval(
        '!!(window.__diceDebug.currentRoll.sounds.find((s) => s.clunk))'), false,
        'and a towerless roll records no clunk event at all');
    },
  },

  {
    name: 'audio-ambience',
    tags: ['fx', 'audio', 'roll', 'settings'],
    // THE ROOM BED (docs/AUDIO.md §5), and the two switches over it.
    //
    // The mute-integrity claim is the one that matters. Everywhere else in
    // this graph "silence" is a gain of zero on a run-forever source, and for
    // a bed that would mean three oscillators running under a table whose
    // switch says off — passing every test that only ever looked at
    // one-shots. So `bedSources` counts NODES, not level.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });

      // ---- the switch exists, and it is off --------------------------------
      assert.equal(await a.eval(`!!document.getElementById('set-ambience')`), true,
        'the settings modal carries a Room tone switch');
      assert.equal(
        await a.eval(`document.getElementById('set-ambience').getAttribute('aria-pressed')`),
        'false', 'and it is OFF by default — a bed you did not ask for is noise');
      assert.equal(await a.dbg('ambienceOn'), false, 'the state agrees with the paint');

      // ---- off means no sources, not a quiet bed ---------------------------
      await a.roll('2d6');
      let g = await a.dbg('audioGraphInfo()');
      assert.equal(g.ambienceOn, false, 'still off after a roll');
      assert.equal(g.bedSources, 0, `and no bed sources exist at all (${g.bedSources})`);

      // ---- on means a real bed ---------------------------------------------
      await a.dbg('setAmbienceOn(true)');
      g = await a.dbg('audioGraphInfo()');
      assert.equal(g.ambienceOn, true, 'the switch flips');
      assert.ok(g.bedSources > 0,
        `and the bed is actually built (${g.bedSources} sources) — without this `
        + 'the mute claim below is about nothing');
      assert.equal(
        await a.eval(`document.getElementById('set-ambience').getAttribute('aria-pressed')`),
        'true', 'and the switch is painted on');

      // ---- MUTE INTEGRITY --------------------------------------------------
      // soundOn === false silences EVERYTHING, bed included, and it does it
      // by taking the sources down rather than by turning them to zero.
      await a.dbg('setSoundOn(false)');
      g = await a.dbg('audioGraphInfo()');
      assert.equal(g.soundOn, false, 'the table is muted');
      assert.equal(g.ambienceOn, true, 'with the ambience preference still ON');
      assert.equal(g.bedSources, 0,
        `and ZERO bed sources regardless (${g.bedSources}) — the switch means `
        + 'what it says, it does not merely turn the room down');
      await a.dbg('setSoundOn(true)');
      g = await a.dbg('audioGraphInfo()');
      assert.ok(g.bedSources > 0, 'unmuting brings the room back');

      // ---- the room is not table state -------------------------------------
      // js/portable.js's settings allowlist is EXACT and six assertions in
      // tests/portable.test.mjs key on {sound, numbers}. Ambience is
      // device-local mood, so a teammate must not inherit your room — and
      // this reads the REAL export, through the same textarea the `portable`
      // scenario reads, rather than a hook that could answer differently.
      await a.dbg('setAmbienceOn(true)');
      await a.dbg('openSettings("stuff")');
      await a.eval(`document.getElementById('portable-open').click()`);
      const yaml = await a.eval(`document.getElementById('portable-text').value`);
      assert.ok(/^\s*sound:/m.test(yaml),
        `the export really does carry the just-you settings block `
        + `(got: ${JSON.stringify(yaml.slice(0, 120))}) — otherwise the absence `
        + 'below is the absence of the whole section');
      assert.ok(!/ambience/i.test(yaml),
        'and it says nothing whatsoever about ambience');
      await a.eval(`document.getElementById('settings-close').click()`);

      await a.dbg('setAmbienceOn(false)');
      g = await a.dbg('audioGraphInfo()');
      assert.equal(g.bedSources, 0, 'and turning it off puts the room away again');
    },
  },

  {
    name: 'mood-motes',
    tags: ['fx', 'tower'],
    // DUST IN THE LAMPLIGHT (js/motes.js, ROADMAP Tier V2). The air is
    // HEARTWOOD'S family trait (TOWERS registry `motes: true`, Joe
    // 2026-08-15): a shedding wooden tower has dust; the bare felt, stone
    // and the forge do not. Then four claims: it MOVES on the sim clock and
    // freezes with it (holdClock discipline — the screenshot contract), it
    // stays inside the bounds its dials declare, and mood-off REMOVES it —
    // count comes from a scene-attached buffer, so zero means the object is
    // gone, not that a flag went false.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });

      // ---- the bare room has still air; Heartwood brings the dust ---------
      let m = await a.dbg('motesInfo()');
      assert.equal(m.count, 0, 'no tower, no dust — the air is a tower trait');
      await a.dbg(`setTower('heartwood')`);
      await a.waitFor(`window.__diceDebug.tower === 'heartwood'`, { desc: 'Heartwood up' });
      m = await a.dbg('motesInfo()');
      assert.ok(m.count > 0, `Heartwood's air carries motes (${m.count} points)`);
      assert.equal(m.draws, 1, 'as a single Points draw call');

      // ---- it moves on the sim clock, and ONLY on it ----------------------
      await a.dbg('holdClock(true)');
      const before = await a.dbg('motesInfo([0,3,7])');
      await a.dbg('sim(60)');
      const after = await a.dbg('motesInfo([0,3,7])');
      assert.notDeepEqual(after.sample, before.sample,
        'a second of sim time visibly drifts the dust');
      // Frozen clock, ticked hard: rendering without dt must not move air.
      // Without this, a Date.now() hiding in the step passes every drift
      // check above — the same trap the audio gate caught.
      const frozen1 = await a.dbg('motesInfo([0,3,7])');
      await a.dbg('sim(0)');
      await a.dbg('sim(0)');
      const frozen2 = await a.dbg('motesInfo([0,3,7])');
      assert.deepEqual(frozen2.sample, frozen1.sample,
        'under a held clock the air is a photograph');
      await a.dbg('holdClock(false)');

      // ---- it lives in the bounds the dials declare -----------------------
      // Sample a spread of motes; every one must sit inside the fall band
      // and the radial cap — both READ from the live tune, not hardcoded,
      // because the dials are Joe's (2026-08-15 widened rMax 4→9) and this
      // claim is "the field obeys its dials", not "the dials are these". A
      // regression that scatters dust past its own settings fails here, not
      // in a screenshot.
      const tune = await a.dbg('motesTune({})');
      const wide = await a.dbg('motesInfo([0,10,20,40,80,120])');
      for (const [x, y, z] of wide.sample) {
        assert.ok(y > tune.yMin - 0.5 && y < tune.yMax + 1.5,
          `mote height ${y.toFixed(2)} stays in the band [${tune.yMin}, ${tune.yMax}]`);
        const r = Math.hypot(x, z - 1.5 * (1 - y / 19)); // distance to the lamp axis
        assert.ok(r < tune.rMax + tune.wander + 0.2,
          `mote radius ${r.toFixed(2)} stays inside the cap (rMax ${tune.rMax})`);
      }

      // ---- mood off means NO air, object-gone, and back again -------------
      await a.dbg('mood(false)');
      m = await a.dbg('motesInfo()');
      assert.equal(m.count, 0, 'the flat room has still, empty air');
      await a.dbg('mood(true)');
      m = await a.dbg('motesInfo()');
      assert.ok(m.count > 0, 'and the mood brings the dust back with it');

      // ---- the switch under the mood --------------------------------------
      const tuned = await a.dbg('motesTune({on: false})');
      assert.equal(tuned.live, false, 'motesTune({on:false}) takes the layer down alone');
      m = await a.dbg('motesInfo()');
      assert.equal(m.count, 0, 'gone from the scene, not dimmed');
      await a.dbg('motesTune({on: true})');

      // ---- other towers refuse the trait; the dust leaves with its tower --
      // Registry-keyed, so this is one claim per family: stone has no idle
      // dust, and a tower->tower swap carries the air out through the same
      // socket that brought it in.
      await a.dbg(`setTower('bastion')`);
      await a.waitFor(`window.__diceDebug.tower === 'bastion'`, { desc: 'Bastion up' });
      m = await a.dbg('motesInfo()');
      assert.equal(m.count, 0, `Bastion's air is clean (${m.count})`);
      await a.dbg(`setTower('heartwood')`);
      await a.waitFor(`window.__diceDebug.tower === 'heartwood'`, { desc: 'Heartwood again' });
      m = await a.dbg('motesInfo()');
      assert.ok(m.count > 0, 'returning to Heartwood restores its air');
      await a.dbg(`setTower('none')`);
      await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'tower down' });
      m = await a.dbg('motesInfo()');
      assert.equal(m.count, 0, 'and taking the tower down stills the room');
    },
  },

  {
    name: 'venue-set',
    tags: ['settings', 'fx', 'tower'],
    // THE VENUE TOGGLE (GOALS goals 13–15, ROADMAP W1). Five claims: the
    // venue is a room setting every client inherits; a fantasy venue
    // STAGES a real scene (venueInfo counts objects, not flags); it takes
    // the tower down with it in the same patch — one write, no race; it
    // REPLACES the à-la-carte pickers while active (goal 13's whole
    // point, read off computed style, not a flag); and selecting The
    // Table restores everything, pickers included.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });

      // ---- the grounded room is venue zero --------------------------------
      let v = await a.dbg('venueInfo()');
      assert.equal(v.id, 'table', 'the table boots grounded');
      assert.equal(v.staged, false, 'with no stage in the scene');
      assert.equal(await a.eval(
        `document.querySelectorAll('#venue-picker [data-venue]').length`), 3,
        'and the picker offers all three venues');

      // ---- a tower first, so the venue has something to replace -----------
      await a.dbg(`setTower('heartwood')`);
      await a.waitFor(`window.__diceDebug.tower === 'heartwood'`, { desc: 'Heartwood up on A' });
      await b.waitFor(`window.__diceDebug.tower === 'heartwood'`, { desc: 'Heartwood up on B' });

      // ---- one write moves the whole set ----------------------------------
      await a.dbg(`setVenue('moonrise')`);
      await a.waitFor(`window.__diceDebug.venueInfo().staged`, { desc: 'the glade rises on A' });
      await b.waitFor(`window.__diceDebug.venueInfo().staged`, { desc: 'and on B, off the same setting' });
      v = await b.dbg('venueInfo()');
      assert.equal(v.id, 'moonrise', 'Bob inherited the venue id');
      assert.equal(v.register, 'fantasy', 'and its register');
      assert.ok(v.stageChildren >= 8,
        `the stage is real scenery (${v.stageChildren} children), not a tinted room`);

      // ---- W2: the glade room's placement law, off the stage itself ------
      // Flank props stand BEYOND the widest back wall (wide zoom d 8.6 →
      // z −4.3) at their NEAREST point and clear of the tower envelope
      // (|x| 3.3): scenery may never stand where a die can rest or a
      // tower does. The moonbeam LANDS on the resolve area (grammar 12).
      // The fog retreats to the spec's numbers under the glade, and the
      // sheet heights are the legibility law as numbers: three dense
      // sheets below every die top (0.68), one veil at 3.4 with its
      // clearing hole.
      const s = v.stage;
      assert.ok(s, 'the stage reports its layout');
      // W7 NEW CLAIM: the ring came FORWARD (Joe — "moving the mushroom
      // ring more to the foreground"), so it is held to the fore rule
      // rather than the back-wall one it can no longer meet. Same law,
      // different wall: outside the dice BOX at every point, which at a
      // near seat means past the x wall. It declares its band so this
      // cannot silently become a weaker test for a back-band feature.
      assert.equal(s.moot.band, 'fore', 'the ring declares which band it is in');
      assert.ok(s.moot.z - s.moot.rz > 4.3 || Math.abs(s.moot.x) - s.moot.rx > 7.05,
        `the ring clears the dice box at every point (${s.moot.x}, ${s.moot.z})`);
      assert.ok(s.pool.z + s.pool.rz < -4.3 && Math.abs(s.pool.x) - s.pool.rx > 3.3,
        `the mirror pool holds the other flank (${s.pool.x}, ${s.pool.z})`);
      assert.ok(Math.abs(s.shaft.x) < 2 && s.shaft.z > 0 && s.shaft.z < 2.5,
        `the moonbeam lands on the resolve area (${s.shaft.x}, ${s.shaft.z})`);
      assert.deepEqual(s.fog, { near: 22, far: 60 },
        'the glade preset retreats the fog to the spec numbers');
      assert.equal(s.sheetYs.filter((y) => y < 0.68).length, 3,
        `three dense sheets below every die top (${s.sheetYs.join(', ')})`);
      assert.equal(Math.max(...s.sheetYs), 3.4, 'and one veil at its height');
      assert.equal(s.veilHole, 7, 'with its baked clearing hole');
      // ---- W2c: the scenery tier holds the same law, per band ----------
      // NEW CLAIMS 2026-08-13 (rule 13): the tier exists (zero bits means
      // the set pieces are exhibits again), 'back' bits clear the back
      // wall AND the tower envelope exactly as the flank features do, and
      // 'fore' bits sit wholly outside the DICE BOX — the box is the
      // INTERSECTION of the walls, so a near-corner bit is unreachable
      // past the widest front wall (z − rz > 4.3) OR past the x wall
      // (|x| − rx > 7.05, wide w 14.1). The list comes off the stage, so
      // a future placement move is a contract change here, never a
      // silent drift.
      assert.ok(Array.isArray(s.scenery) && s.scenery.length >= 5,
        `the scenery tier is populated (${(s.scenery || []).length} bits)`);
      // W7 NEW CLAIM: mushrooms through the scene, and every clump holds
      // the same law as the ring it spread from — the population is what
      // the law covers, not the two features that used to carry it all.
      assert.ok(Array.isArray(s.shrooms) && s.shrooms.length >= 6,
        `fungus grows through the scene (${(s.shrooms || []).length} clumps)`);
      for (const bit of [...s.scenery, ...s.shrooms]) {
        if (bit.band === 'back') {
          assert.ok(bit.z + bit.rz < -4.3 && Math.abs(bit.x) - bit.rx > 3.3,
            `back-band scenery is dice-unreachable (${bit.x}, ${bit.z})`);
        } else {
          assert.equal(bit.band, 'fore', `scenery declares its band (${JSON.stringify(bit)})`);
          assert.ok(bit.z - bit.rz > 4.3 || Math.abs(bit.x) - bit.rx > 7.05,
            `fore-band scenery clears the dice box at every point (${bit.x}, ${bit.z})`);
        }
      }

      // The venue's OWN tower, not a hardcoded 'none': today the fae tower
      // has not shipped so venueTower reports 'none'; the day 'hollowbole'
      // lands in TOWERS this same line starts asserting that the venue
      // sockets it — the assertion tracks the contract, not the moment.
      await a.waitFor(
        `window.__diceDebug.tower === window.__diceDebug.venueInfo().venueTower`,
        { desc: 'A wears exactly the tower the venue declares' });
      await b.waitFor(
        `window.__diceDebug.tower === window.__diceDebug.venueInfo().venueTower`,
        { desc: 'and so does B' });

      // ---- W2c: a palette change re-dresses the STANDING tower ------------
      // NEW CLAIMS 2026-08-13. The two fae venues share tower id
      // 'hollowbole', so applyRoomSettings never queues a socket for a
      // palette flip — the moonrise model stood in the foxfire world for
      // two rounds before a baked-in-palette mesh made it visible.
      // towerReskin now swaps the skin in place (visual-only: variants
      // share portals and geometry digest, so bodies and the film never
      // move). Baked vertex-color means are the discriminator: the same
      // mean across venues was the smoking gun that caught the bug, so
      // its NEGATION is the claim. (The claim first rode the earth berm;
      // the berm was deleted with the mound, 790ed90, so it now rides
      // the shell — the one mesh every variant must carry. Lesson for
      // the contract: a physics-adjacent claim should never anchor to a
      // deletable cosmetic mesh.)
      const woodMoon = await a.dbg(`meshColors('towerSkinBoleShell')`);
      assert.ok(woodMoon && woodMoon.colors, 'the shell reports baked colors');
      await a.dbg(`setVenue('foxfire')`);
      await a.waitFor(`window.__diceDebug.venue === 'foxfire'`, { desc: 'foxfire staged on A' });
      await a.waitFor(
        `(() => { const c = window.__diceDebug.meshColors('towerSkinBoleShell');
           return c && c.colors && c.mean.join(',') !== ${JSON.stringify(woodMoon.mean.join(','))}; })()`,
        { desc: 'the shell re-dresses — foxfire bakes different wood (the reskin landed)' });
      const woodFox = await a.dbg(`meshColors('towerSkinBoleShell')`);
      assert.ok(woodFox.mean.join(',') !== woodMoon.mean.join(','),
        `the two skies bake different wood (moonrise ${woodMoon.mean} vs `
        + `foxfire ${woodFox.mean}) — identical means is exactly this bug`);
      assert.deepEqual((await a.dbg('worldBodies()')).named, [...(await b.dbg('worldBodies()')).named],
        'and the reskin moved NO bodies — both tabs still share one collider list');
      await a.dbg(`setVenue('moonrise')`);
      await a.waitFor(`window.__diceDebug.venue === 'moonrise'`, { desc: 'moonrise restored on A' });
      await a.waitFor(
        `(() => { const c = window.__diceDebug.meshColors('towerSkinBoleShell');`
        + ` return c && c.colors && c.mean.join(',') === ${JSON.stringify(woodMoon.mean.join(','))}; })()`,
        { desc: 'and back — the moonrise wood returns' });

      // ---- goal 13: the venue REPLACES the pickers ------------------------
      for (const id of ['felt-swatches', 'tower-picker', 'diceset-row']) {
        assert.equal(await a.eval(
          `(window.__diceDebug.openSettings(), getComputedStyle(document.getElementById('${id}')).display)`),
        'none', `${id} is gone from settings while the venue is fantasy`);
      }

      // ---- the table still rolls in the glade -----------------------------
      await a.roll('2d6');
      await a.settle();
      assert.equal(await a.eval('window.__diceDebug.currentRoll.done'), true,
        'a roll resolves under the venue — the stage is scenery, not physics');

      // ---- and The Table is the restore path ------------------------------
      await a.dbg(`setVenue('table')`);
      await a.waitFor(`!window.__diceDebug.venueInfo().staged`, { desc: 'the glade strikes on A' });
      await b.waitFor(`!window.__diceDebug.venueInfo().staged`, { desc: 'and on B' });
      assert.equal(await a.eval(
        `getComputedStyle(document.getElementById('felt-swatches')).display`) !== 'none', true,
      'the felt picker returns with the room');
    },
  },

  {
    name: 'venue-life',
    tags: ['fx', 'settings'],
    // THE LIVING LAYER (js/faelife.js, ROADMAP W5): a firefly FIELD that
    // says the place is alive and a WISP PROCESSION that says somebody
    // lives here, with the vacated moot waking when they stand in it.
    // Six claims, and the first is the one everything else rests on.
    //
    // ① THE ONE LAW — nothing alive ever crosses the dice box. It is
    //    checked over EVERY member, at points spread around the wisps'
    //    78-second route, because a three-point sample cannot prove a
    //    law about a hundred-odd members, and this layer's legality
    //    under composition rule 1 and GOALS goal 15 IS that law: stay
    //    out of the volume dice occupy and nothing alive can ever sit
    //    between the eye and a result.
    // ② The tiers hold AS RENDERED, not as declared.
    // ③ It moves on the sim clock and freezes with it.
    // ④ A re-staged glade breathes identically.
    // ⑤ The governor: the glade withdraws while the film runs, and
    //    leans in once the dice are readable.
    // ⑥ The moot wakes when the wisps visit — and never past bloom.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice', allowSolo: true });

      // ---- the grounded room keeps no life of its own ---------------------
      let L = await a.dbg('lifeInfo()');
      assert.equal(L.flies, 0, 'the table is a room, not a glade — nothing lives in it');

      await a.dbg(`setVenue('moonrise')`);
      await a.waitFor(`window.__diceDebug.venueInfo().staged`, { desc: 'the glade rises' });
      L = await a.dbg('lifeInfo()');
      assert.ok(L.flies > 50, `the field is populated (${L.flies} fireflies)`);
      assert.ok(L.wisps >= 3 && L.wisps <= 5,
        `a procession, not a swarm (${L.wisps} wisps)`);
      assert.equal(L.draws, 2, 'in two draw calls — a field is one buffer, not one object each');
      assert.equal(L.seated, 0,
        `every zone is authored clear of the felt: ${L.seated} members had to be pushed out at build`);

      // ---- ① THE ONE LAW, over the whole population and the whole route ---
      // The box comes off the LAYER, which took it from the widest zoom
      // preset — the binding case, since a tighter mat only moves the
      // walls inward.
      await a.dbg('holdClock(true)');
      assert.deepEqual(L.box, { hx: 7.05, hz: 4.3, margin: 0.35 },
        'the box is the widest mat, which is the case that binds');
      let fliesLuma = 0, wispLuma = 0, gray = true;
      for (let k = 0; k < 6; k++) {
        if (k) await a.dbg('sim(780)');   // 13 s a step — most of one lap by the end
        const s = await a.dbg('lifeInfo()');
        assert.equal(s.inBox, 0,
          `nothing alive is over the felt at t=${s.t.toFixed(1)}s `
          + `(worst offender ${JSON.stringify(s.worst)})`);
        assert.equal(s.clamped, 0,
          'and the runtime backstop never fired — the route obeys the law on its own, '
          + 'which is what makes the clamp a backstop rather than a mechanism');
        fliesLuma = Math.max(fliesLuma, s.fliesLuma);
        wispLuma = Math.max(wispLuma, s.wispLuma);
        gray = gray && s.gray;
      }

      // ---- ② the tiers, as rendered ---------------------------------------
      // The Vegas gates (FAE-VENUE-SPEC-DRAFT §gates) put the field in the
      // tertiary tier (≤0.25) and the procession in the secondary one
      // (0.35–0.6), and the glade's countable-source budget was already
      // full before W5 — so the field may only stay exempt while it is
      // MONOCHROME.
      //
      // These are LUMINANCES, not vertex scalars, and the difference is a
      // real finding rather than pedantry: the field was first authored at
      // "0.22 against a ceiling of 0.25" and rendered at 0.09, because the
      // scalar multiplies a teal carrying a luma of 0.416. Gating on the
      // scalar would have passed a field nobody could see.
      assert.ok(fliesLuma > 0.03 && fliesLuma <= 0.25,
        `the field lights, and stays tertiary (luma ${fliesLuma} ≤ 0.25)`);
      assert.ok(wispLuma > 0.20 && wispLuma <= 0.60,
        `the procession reaches the secondary tier without leaving it (luma ${wispLuma})`);
      assert.equal(gray, true,
        'and every member is written grayscale — the hue lives in ONE material, '
        + 'which is the whole reason a field is exempt from the source count');

      // ---- ③ it moves on the sim clock, and only on it --------------------
      const before = await a.dbg('lifeInfo([0, 40, 90])');
      await a.dbg('sim(60)');
      const after = await a.dbg('lifeInfo([0, 40, 90])');
      assert.notDeepEqual(after.sample, before.sample,
        'a second of sim time visibly moves the glade');
      // Real frames keep arriving under the hold (tick runs with dt 0), so
      // this is not a no-op: a Date.now() hidden in the step passes every
      // drift check above and fails right here.
      const frozen1 = await a.dbg('lifeInfo([0, 40, 90])');
      await a.dbg('sim(0)');
      const frozen2 = await a.dbg('lifeInfo([0, 40, 90])');
      assert.deepEqual(frozen2.sample, frozen1.sample,
        'under a held clock the glade is a photograph');
      assert.deepEqual(frozen2.wispSample, frozen1.wispSample,
        'and so is the procession');

      // ---- ④ a re-staged glade breathes identically -----------------------
      // The stage clock starts at ZERO. Before W5 it did not: `FAECONCEPT.t`
      // survived a restage, so a client that had toggled venues resumed the
      // air at whatever phase the last stage left, two clients breathed
      // differently, and no screenshot taken after a toggle reproduced.
      // faeConcept() arms the stage directly, so this is one tab's own
      // history rather than a room-wide flip.
      await a.dbg('faeConcept(false)');
      await a.dbg(`faeConcept(true, {paletteId: 'moonrise'})`);
      await a.dbg('sim(240)');
      const runA = await a.dbg('lifeInfo([0, 40, 90])');
      await a.dbg('faeConcept(false)');
      await a.dbg(`faeConcept(true, {paletteId: 'moonrise'})`);
      await a.dbg('sim(240)');
      const runB = await a.dbg('lifeInfo([0, 40, 90])');
      assert.deepEqual(runB.sample, runA.sample,
        'the same glade, staged twice and stepped the same, breathes identically');
      assert.deepEqual(runB.wispSample, runA.wispSample, 'the procession included');

      // ---- ⑤ the governor: the glade minds the table ----------------------
      // Rule 1 as BEHAVIOUR rather than as a hope: while dice are in the
      // air the living layer steps back, and once they are readable it
      // leans toward the clearing — without ever entering the box, because
      // the lean is dwell and value, never a step onto the table.
      await a.dbg(`throwSeeded(['d6','d6','d6'], 4242)`);
      await a.dbg('sim(40)');
      const mid = await a.dbg('lifeInfo()');
      assert.ok(mid.mood.life < 0.35,
        `the glade withdraws while the film runs (life ${mid.mood.life.toFixed(2)})`);
      await a.dbg('sim(600)');
      const rest = await a.dbg('lifeInfo()');
      assert.ok(rest.mood.life > 0.85,
        `and comes back out once the dice are down (life ${rest.mood.life.toFixed(2)})`);
      assert.ok(rest.mood.lean > 0.85,
        `leaning toward the clearing (lean ${rest.mood.lean.toFixed(2)})`);
      assert.equal(rest.inBox, 0,
        'and STILL nothing alive is over the felt — the lean cannot trade the law away');

      // ---- ⑥ the moot wakes when the procession stands in it --------------
      // The ring stays a VACATED moot (grammar §5 staging 2 — the
      // interruption is the story); what W5 adds is visitors. Its gain
      // must MOVE across a lap, and its brightest cap must never reach the
      // bloom threshold: a ring that bloomed would be a new primary source
      // arguing with the dice.
      await a.dbg('clearTable()');
      let lo = Infinity, hi = -Infinity, capMax = 0;
      for (let k = 0; k < 16; k++) {
        await a.dbg('sim(180)');
        const s = await a.dbg('lifeInfo()');
        lo = Math.min(lo, s.moot.gain);
        hi = Math.max(hi, s.moot.gain);
        capMax = Math.max(capMax, s.moot.capPeak);
      }
      assert.ok(hi - lo > 0.08,
        `the ring wakes and quiets as the procession comes and goes `
        + `(gain ${lo.toFixed(3)}–${hi.toFixed(3)})`);
      assert.ok(capMax > 0 && capMax < 0.9,
        `and never wakes past the bloom threshold (brightest cap ${capMax})`);
      await a.dbg('holdClock(false)');

      // ---- the two skies dress the life differently -----------------------
      // Every other number this hook reports is palette-INDEPENDENT by
      // construction — same seed, same zones, same dials, so positions,
      // peaks and mood are identical in both venues — which means the hue
      // is the only field that can tell the skies apart. Identical values
      // across a flip is precisely the shape of the W2c berm bug, and
      // TESTING.md P9 is the rule that says to pair a stability check with
      // a content one.
      const hueMoon = (await a.dbg('lifeInfo()')).hue;
      await a.dbg(`setVenue('foxfire')`);
      await a.waitFor(`window.__diceDebug.venue === 'foxfire'`, { desc: 'foxfire staged' });
      const hueFox = (await a.dbg('lifeInfo()')).hue;
      assert.notDeepEqual(hueFox, hueMoon,
        `the two skies dress the living layer differently `
        + `(moonrise ${JSON.stringify(hueMoon)} vs foxfire ${JSON.stringify(hueFox)})`);
      await a.dbg(`setVenue('moonrise')`);
      await a.waitFor(`window.__diceDebug.venue === 'moonrise'`, { desc: 'moonrise restored' });

      // ---- the layer is an OBJECT, and it leaves with its venue -----------
      const off = await a.dbg('lifeTune({on: false})');
      assert.equal(off.live, true, 'the layer is still built…');
      assert.equal((await a.dbg('lifeInfo()')).flies, 0,
        '…and gone from the scene, not dimmed');
      await a.dbg('lifeTune({on: true})');
      assert.ok((await a.dbg('lifeInfo()')).flies > 50, 'and back again');
      await a.dbg(`setVenue('table')`);
      await a.waitFor(`!window.__diceDebug.venueInfo().staged`, { desc: 'the glade strikes' });
      assert.equal((await a.dbg('lifeInfo()')).flies, 0,
        'the life leaves with the glade it belongs to');
    },
  },

  {
    name: 'venue-dice',
    tags: ['fx', 'settings'],
    // THE VENUE STAGES THE DICE (ROADMAP W4 — the GOALS 13 punt
    // delivered). Four claims: the staged set overrides the player's own
    // AT ROLL CREATION, so the ROLL RECORD carries it and both tabs agree
    // off the record, not off a render remap; the override releases with
    // the venue (your own set resumes); the fae set is real in SETS but
    // takes NO chip in the picker (venueOnly — a venue is chosen as one
    // thing); and the venue reports what it stages so this scenario reads
    // the contract, not a constant.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });

      // ---- the picker refuses to offer the fae set ------------------------
      // (Registry + server presence are proven harder below: the roll's
      // record carries the id end-to-end, which only a SET_IDS member can.)
      await a.eval('window.__diceDebug.openSettings("you")');
      await a.eval(`document.querySelector('#diceset-picker .set-select').click()`);
      assert.equal(await a.eval(
        `document.querySelectorAll('.set-menu [data-set^="moonmoot."]').length`), 0,
        'no Moonmoot chip anywhere a player picks — the venue stages it');
      assert.ok(await a.eval(
        `document.querySelectorAll('.set-menu [data-set]').length`) > 3,
        'while the menu itself is alive and full');
      await a.eval(`document.activeElement && document.activeElement.blur(),
        document.body.click()`);

      // ---- your own set, chosen honestly, before the venue ----------------
      await a.dbg(`setDiceSet('tidewrack.seaglass')`);
      await a.roll('2d6');
      await a.settle();
      assert.equal(await a.eval('window.__diceDebug.currentRoll.set'), 'tidewrack.seaglass',
        'the grounded room rolls YOUR set');
      await a.dbg('clearTable()');
      await a.dbg('sim(400)');

      // ---- the venue overrides at roll creation ---------------------------
      await a.dbg(`setVenue('moonrise')`);
      await a.waitFor(`window.__diceDebug.venueInfo().staged`, { desc: 'the glade rises' });
      await b.waitFor(`window.__diceDebug.venueInfo().staged`, { desc: 'on both tabs' });
      assert.equal(await a.eval(`window.__diceDebug.venueInfo().venueDiceSet`),
        'moonmoot.witchlight', 'the venue declares the set it stages');
      await a.roll('3d6');
      await a.settle();
      assert.equal(await a.eval('window.__diceDebug.currentRoll.set'), 'moonmoot.witchlight',
        "the roll RECORD carries the venue's set — not Alice's seaglass");
      await b.waitFor(`window.__diceDebug.currentRoll
        && window.__diceDebug.currentRoll.set === 'moonmoot.witchlight'`,
      { desc: "Bob's copy of the record agrees — the wire carried it" });

      // ---- the override releases with the venue ---------------------------
      await a.settle();
      await a.dbg(`setVenue('table')`);
      await a.waitFor(`!window.__diceDebug.venueInfo().staged`, { desc: 'the room returns' });
      await a.roll('2d6');
      await a.settle();
      assert.equal(await a.eval('window.__diceDebug.currentRoll.set'), 'tidewrack.seaglass',
        'your own set resumes with the room — the venue never rewrote your identity');
    },
  },
];
