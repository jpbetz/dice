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

import { assert } from './harness.mjs';

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
    name: 'collect-peek',
    tags: ['smoke', 'shelf'],
    // Collect moves a roll to the shelf on every table; peek recovers the
    // full result; clearing a collected roll empties the shelf everywhere.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const b = await ctx.newTable({ origin: '127.0.0.1', name: 'Bob' });
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
    // lives in the peek, whose base carries the one prominent clear-✕ — and
    // that ✕ clears for everyone, from any seat (§7.7 universal housekeeping).
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

      // The peek recovers the detail and carries the prominent clear-✕.
      assert.equal(await b.dbg(`peek(${JSON.stringify(rid)})`), rid, 'peek opens');
      const ps = await b.dbg('peekState');
      assert.ok(ps.total, 'the peek shows the total');
      assert.equal(ps.hasClear, true, 'and the clear-✕ at its base');
      await b.eval(`document.querySelector('#peek-card .pk-clear').click()`);
      for (const t of [a, b]) {
        await t.waitFor(
          `(window.__diceDebug.sim(240), window.__diceDebug.shelf.length === 0 && window.__diceDebug.tableDice.length === 0)`,
          { desc: 'the peek ✕ clears the roll for everyone' },
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
    // A shelved roll stays actionable from its peek: ⟳ rolls the SAME dice
    // again — the shelved cluster clears as part of the reroll (a pool is
    // how you mint a copy) — and ± pulls it into the New pool draft
    // (command box + popover) for an ad-hoc tweak, dc/mods/comment intact.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.roll('2d6+3 dc9');
      const rid = await a.rollId();
      await a.dbg(`collectRoll(${JSON.stringify(rid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'roll shelved' },
      );
      assert.equal(await a.dbg(`peek(${JSON.stringify(rid)})`), rid, 'peek opens');
      const ps = await a.dbg('peekState');
      assert.equal(ps.hasAgain, true, 'the peek carries ⟳');
      assert.equal(ps.hasTweak, true, 'and ±');

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
      await a.eval(`document.querySelector('#peek-card .pk-tweak').click()`);
      const pop = await a.dbg('popover');
      assert.ok(pop && pop.open, '± opens the ± popover IN PLACE');
      assert.equal(pop.source, 'shelf', 'bound to the shelved roll, no teleport');
      assert.equal(String(pop.dc), '9', 'the dc rides in');
      assert.ok((await a.dbg('peekState')) !== null, 'the peek pins while its popover lives');

      // Esc peels the popover first, the card next (z order honored).
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
      assert.equal(await a.dbg('popover'), null, 'Esc closes the shelf popover first');
      assert.ok((await a.dbg('peekState')) !== null, 'the peek survives that Esc');

      // Rolling a tweak from the shelf popover REPLACES the shelved roll.
      await a.eval(`document.querySelector('#peek-card .pk-tweak').click()`);
      const logN = await a.logCount();
      await a.eval(`document.getElementById('pop-roll').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), document.getElementById('log-list').childElementCount > ${logN} && window.__diceDebug.shelf.length === 0)`,
        { desc: 'the tweak rolled and the shelved original left — replaced, not copied' },
      );
      assert.equal(await a.dbg('popover'), null, 'popover closed by the roll');
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
    name: 'chips-quiet-default',
    tags: ['smoke', 'roll'],
    // Quiet by default (P1): the floating die numbers are opt-in. Results
    // stay readable without them (the log line still carries the total); the
    // 'Show numbers on dice' preference paints chips for the roll on the felt
    // and clears them again on the spot.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      assert.equal(await a.dbg('chipsVisible'), false, 'chips default off');
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
    // A check roll's verdict card times out into the plain-roll banner: the
    // dice still on the felt keep Done (the standing keep verb) and the
    // revealed-tier clear-✕ (the card's auto-dismiss used to strand them
    // with no affordance at all).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg(`commandRoll('d20 check dc10')`);
      await a.waitFor(
        `(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(30), (window.__diceDebug.ceremonyState || {}).phase === 'done')`,
        { desc: 'verdict staged' },
      );
      assert.equal(await a.dbg('retireCeremony()'), true, 'the card retires into the banner');
      assert.ok(await a.eval(
        `[...document.querySelectorAll('#banner-actions .banner-btn')].some((b) => b.textContent === 'Done')`,
      ), 'Done survives the ceremony (the standing keep verb)');
      assert.ok(await a.eval(`!!document.querySelector('#banner-actions .reveal-tier .clear-x')`),
        'and the clear-✕ waits in the revealed tier');
      const rid = await a.rollId();
      assert.equal(await a.dbg(`collectRoll(${JSON.stringify(rid)})`), true, 'collect accepted');
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1)`,
        { desc: 'collected from the retired-banner state' },
      );
      assert.ok(await a.eval(`document.getElementById('result-banner').classList.contains('hidden')`),
        'the banner retires into the slot');
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
      await a.roll('4d6kh3 dc 12');
      assert.equal(await a.diceCount(), 4, 'all four dice thrown (one struck)');
      const log = await a.logTop();
      assert.ok(/dc\s*12|DC\s*12/.test(log), `dc surfaced in log (got: ${log})`);
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
      assert.equal(st.compose && st.groups, true, 'panels default open on a desktop viewport');
      assert.equal('log' in st, false, 'the log is no longer a panel region');

      st = await a.dbg('setPanelState({groups: false})');
      assert.equal(st.groups, false, 'groups collapsed');
      assert.equal(st.compose, true, 'compose untouched — independent regions');
      assert.equal(st.allCollapsed, false, 'not yet compact');

      // Immersion invariant: a roll plays out exactly the same under
      // collapsed chrome (the log records even while its flyout is closed).
      await a.roll('2d6');
      assert.equal(await a.diceCount(), 2, 'roll unaffected by collapsed chrome');

      // Persistence: a fresh tab on the same origin restores the state.
      const b = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const st2 = await b.dbg('panelState');
      assert.equal(st2.groups, false, 'collapsed groups persisted');
      assert.equal(st2.compose, true, 'open compose persisted');

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
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'g'}))`);
      const st3 = await b.dbg('panelState');
      assert.equal(st3.groups, true, "'g' reopens the pools");
      assert.equal(st3.compose, false, 'without touching the others');
      assert.ok(await b.eval(`!document.body.classList.contains('mini')`), 'compact view lifts');
      // Leave the origin's persisted state all-open: panel state is per-user
      // localStorage, which OUTLIVES this scenario's room.
      await b.dbg('setPanelState({compose: true, groups: true})');
    },
  },
  {
    name: 'control-rail',
    tags: ['smoke', 'chrome'],
    // The persistent control rail NEVER hides: identity chip, quick roll,
    // roll log, mute and settings stay reachable even with every panel
    // collapsed (the emergent compact view). The retired compact mode used
    // to strand settings + mute off screen — this pins the fix. Order is P3:
    // presence (status · roster · identity) → action (❯) → information (≣)
    // → environment (🔊 · ⚙); the ⤡ collapse-all button is deleted (key 'm'
    // remains — the panel edge tabs are the visible replacement).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const RAIL = ['rail', 'identity-chip', 'rail-palette', 'rail-log', 'toggle-sound', 'toggle-settings'];
      const visible = (id) => a.eval(
        `(() => { const el = document.getElementById('${id}'); if (!el) return false;`
        + ` const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; })()`,
      );
      for (const id of RAIL) assert.ok(await visible(id), `#${id} visible in full view`);
      assert.equal(await a.eval(`document.getElementById('rail-collapse') === null`), true,
        'the ⤡ collapse-all button is gone');
      assert.deepEqual(
        await a.eval(`[...document.getElementById('rail').children].map((el) => el.id)`),
        ['status-pill', 'rail-roster', 'identity-chip', 'rail-palette', 'rail-log', 'toggle-sound', 'toggle-settings'],
        'rail order: presence → action → information → environment (P3)',
      );

      const st = await a.dbg('setPanelState({compose: false, groups: false})');
      assert.equal(st.allCollapsed, true, 'every panel collapsed');
      assert.ok(await a.eval(`document.body.classList.contains('mini')`),
        'compact view is the emergent all-collapsed state');
      for (const id of RAIL) assert.ok(await visible(id), `#${id} still visible all-collapsed`);

      // The old bug, dead: settings opens from the rail in compact.
      await a.dbg('openSettings()');
      assert.ok(await a.eval(`!document.getElementById('settings-modal').classList.contains('hidden')`),
        'settings reachable with everything collapsed');
      await a.eval(`document.getElementById('settings-close').click()`);
      // Reopening one panel leaves compact view.
      const st2 = await a.dbg('setPanelState({groups: true})');
      assert.equal(st2.allCollapsed, false, 'one open panel ends all-collapsed');
      assert.ok(await a.eval(`!document.body.classList.contains('mini')`), 'compact view lifts');
      // Leave the origin's persisted state all-open: panel state is per-user
      // localStorage, which OUTLIVES this scenario's room.
      await a.dbg('setPanelState({compose: true, groups: true})');
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
    tags: ['smoke', 'chrome'],
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
    // button) removes exactly one die; the contextual line is [Save][±][✕];
    // Save is an inline morph and ALWAYS additive (updates stay by-id);
    // the empty draft shows the hint.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      let ts = await a.dbg('trayState');
      assert.equal(ts.hint, true, 'empty draft shows the hint');
      assert.equal(ts.hasActions, false, 'no contextual controls on an empty draft');

      // Compose two dice from the palette; the cluster carries their art + ✕s.
      await a.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
      await a.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
      ts = await a.dbg('trayState');
      assert.deepEqual(ts.dice, ['d6', 'd6'], 'two d6 composed');
      assert.equal(ts.rollVisible, true, 'the cluster is the roll button');
      assert.equal(ts.hasActions, true, 'Save/±/✕ appear with content');
      assert.ok(await a.eval(`(() => {
        const c = document.querySelector('#tray-roll .roll-cue');
        return !!c && c.getAttribute('aria-hidden') === 'true' && c.textContent.includes('ROLL');
      })()`), 'the cluster carries the same ROLL cue (tier rule)');
      // Grouped exactly like the pool rows: one d6 with a ×2, one ✕.
      assert.equal(ts.xCount, 1, 'repeats group — one ✕ per die TYPE');
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

      // Inline save: morph, name, Enter — ADDITIVE even on a name collision.
      await a.eval(`(() => {
        const i = document.getElementById('cmd-input');
        i.value = '3d6+2';
        i.dispatchEvent(new Event('input'));
      })()`);
      await a.waitFor(`(window.__diceDebug.trayState.dice.length === 3)`, { desc: 'draft follows the box' });
      const groupsBefore = (await a.dbg('groups')).length;
      await a.eval(`document.getElementById('save-group').click()`);
      assert.equal((await a.dbg('trayState')).saveOpen, true, 'Save morphs into the name row');
      await a.eval(`(() => {
        const i = document.getElementById('group-name');
        i.value = 'Attack';  // collides with a seed pool on purpose
        i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      })()`);
      const gs = await a.dbg('groups');
      assert.equal(gs.length, groupsBefore + 1, 'save is additive — a name collision never overwrites');
      assert.ok(gs.filter((g) => g.name === 'Attack').length >= 2, 'both Attacks exist (updates are by-id paths only)');
      // Pools are per-origin localStorage, which outlives this room: delete
      // the minted duplicate so later scenarios meet the seed set untouched.
      const minted = gs.find((g) => g.name === 'Attack' && g.notation === '3d6+2');
      assert.equal(await a.dbg(`deletePool(${JSON.stringify(minted.id)})`), true, 'cleanup: the duplicate leaves');

      // ✕ clears the whole draft back to the hint.
      await a.eval(`document.getElementById('clear-tray').click()`);
      ts = await a.dbg('trayState');
      assert.deepEqual(ts.dice, [], 'draft cleared');
      assert.equal(ts.hint, true, 'the hint returns');
      assert.equal(ts.hasActions, false, 'the contextual line retires');

      // Dice | Notation: one draft, two views. Default is the visual
      // builder (box hidden); the toggle swaps views without touching the
      // draft; loading a pool into the box flips to Notation (text intent).
      const vis = (sel) => a.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
        return !!el && el.offsetParent !== null; })()`);
      assert.equal(await vis('#cmd-input'), false, 'default view: the box is hidden');
      assert.equal(await vis('#die-buttons'), true, 'default view: the palette shows');
      await a.eval(`document.querySelectorAll('#die-buttons .die-btn')[1].click()`);
      await a.eval(`document.querySelector('#input-mode [data-v="text"]').click()`);
      assert.equal(await vis('#cmd-input'), true, 'Notation view: the box shows');
      assert.equal(await vis('#die-buttons'), false, 'Notation view: the palette hides');
      assert.equal(await vis('#tray-roll'), true,
        'the draft cluster stays ALIVE in Notation view — typed dice materialize');
      assert.ok((await a.eval(`document.getElementById('cmd-input').value`)).includes('1d6'),
        'the draft crossed the view switch intact');
      await a.eval(`document.querySelector('#input-mode [data-v="dice"]').click()`);
      assert.deepEqual((await a.dbg('trayState')).dice, ['d6'], 'and back again');
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
    name: 'pool-flyout',
    tags: ['smoke', 'chrome', 'groups'],
    // Saved pools roll without pinning the panel open: with the panel
    // collapsed, the tab flies the list out as a temporary overlay; a roll
    // from one of its rows fires AND retracts the overlay, so the felt is
    // unobstructed when the dice land. A real expand retires the overlay.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      await a.dbg('setPanelState({groups: false})');
      assert.equal((await a.dbg('panelState')).groups, false, 'panel collapsed');
      assert.equal(await a.dbg('setGroupsFlyout(true)'), true, 'the tab flies the list out');
      assert.ok(await a.eval(`(() => {
        const r = document.querySelector('#groups-panel .panel-body').getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })()`), 'the flyout renders the list');
      await a.eval(`document.querySelector('#groups-list .pool-roll').click()`);
      await a.settle();
      assert.ok(await a.rollId(), 'the row rolled');
      assert.equal(await a.dbg('groupsFlyout'), false, 'and the flyout retracted itself');
      assert.equal((await a.dbg('panelState')).groups, false, 'the panel stayed collapsed');
      await a.dbg('setGroupsFlyout(true)');
      await a.dbg('setPanelState({groups: true})');
      assert.equal(await a.dbg('groupsFlyout'), false, 'a real expand retires the overlay');
    },
  },
  {
    name: 'pools-quick',
    tags: ['smoke', 'chrome', 'groups'],
    // P2 use-vs-manage: at rest the pools panel is READ-ONLY quick access —
    // die-art strip buttons that roll, an always-visible ± (USE), and zero
    // edit chrome. The header ✎ toggles manage mode: per-row ✎/✕ appear and
    // the toolbar carries copy-link (demoted, never deleted — P4) + Done.
    // Digits stay live in manage mode (the disable is anti-misclick, not a
    // lock). No button ever nests inside a button (a11y sibling rule).
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });

      // Read-only rest state: no edit chrome anywhere in the panel.
      assert.equal(await a.eval(`document.querySelectorAll('#groups-panel .group-edit, #groups-panel .group-del').length`),
        0, 'no per-row edit chrome at rest');
      assert.equal(await a.eval(`document.getElementById('pools-toolbar').classList.contains('hidden')`),
        true, 'no toolbar (incl. copy-link) at rest');
      assert.ok(await a.eval(`document.querySelectorAll('#groups-list .pool-roll').length >= 3`),
        'every row is a strip button');
      assert.ok(await a.eval(`(() => {
        const c = document.querySelector('#groups-list .pool-roll .roll-cue');
        return !!c && c.getAttribute('aria-hidden') === 'true' && c.textContent.includes('ROLL');
      })()`), 'the hover ROLL cue rides every strip (decorative, aria-hidden)');
      assert.equal(await a.eval(`document.querySelectorAll('#groups-panel button button').length`),
        0, 'no button nests inside a button');

      // The strip rolls; ± opens the popover.
      const logBefore = await a.logCount();
      await a.eval(`document.querySelector('#groups-list .pool-roll').click()`);
      await a.waitFor(
        `(window.__diceDebug.sim(60), document.getElementById('log-list').childElementCount > ${logBefore})`,
        { desc: 'clicking the dice rolls the pool' },
      );
      await a.eval(`document.querySelector('#groups-list .pool-mods').click()`);
      const pop = await a.dbg('popover');
      assert.ok(pop && pop.open && pop.source === 'group', '± opens the popover on the pool');
      await a.eval(`document.getElementById('pop-close').click()`);

      // Manage mode: chrome appears, strips disarm, digits stay live.
      assert.equal(await a.dbg('setPoolsEditMode(true)'), true, '✎ enters manage mode');
      assert.ok(await a.eval(`document.querySelectorAll('#groups-panel .group-edit').length >= 3`),
        'per-row pencils appear');
      assert.equal(await a.eval(`document.getElementById('pools-toolbar').classList.contains('hidden')`),
        false, 'the toolbar appears');
      assert.ok(await a.eval(`!!document.querySelector('#pools-toolbar #copy-link')`),
        'copy-link lives in the manage toolbar');
      assert.equal(await a.eval(`document.querySelector('#groups-list .pool-roll').disabled`),
        true, 'strips disarm in manage mode');
      const logMid = await a.logCount();
      await a.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: '1'}))`);
      await a.waitFor(
        `(window.__diceDebug.sim(60), document.getElementById('log-list').childElementCount > ${logMid})`,
        { desc: 'digit shortcuts stay live in manage mode' },
      );

      // Done exits; collapsing the panel also exits (transience).
      await a.eval(`document.getElementById('pools-done').click()`);
      assert.equal(await a.dbg('poolsEditMode'), false, 'Done exits manage mode');
      await a.dbg('setPoolsEditMode(true)');
      await a.dbg('setPanelState({groups: false})');
      assert.equal(await a.dbg('poolsEditMode'), false, 'collapsing the panel exits manage mode');
      await a.dbg('setPanelState({groups: true})');
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

      // The inline row editor: ✎ manage mode first (read-only at rest is
      // pools-quick's business; here we just enter it), then pencil →
      // fields → Update writes by id.
      await a.dbg('setPoolsEditMode(true)');
      await a.eval(`document.querySelector('#groups-list [data-group-id="${atk.id}"] .group-edit').click()`);
      assert.equal(await a.eval(`document.querySelector('#groups-list .group-row.editing .ge-name').value`),
        'Strike', 'the editor opens on the record');
      await a.eval(`(() => {
        const name = document.querySelector('#groups-list .ge-name');
        const notation = document.querySelector('#groups-list .ge-notation');
        name.value = 'Alpha Strike';
        notation.value = '3d8+2';
        notation.dispatchEvent(new Event('input'));
        document.querySelector('#groups-list .ge-update').click();
      })()`);
      gs = await a.dbg('groups');
      const edited = gs.find((g) => g.id === atk.id);
      assert.equal(edited.name, 'Alpha Strike', 'editor renamed the record in place');
      assert.equal(edited.notation, '3d8+2', 'editor rewrote the notation');
      assert.equal(gs.length, before.length, 'and forked nothing');
      assert.equal(await a.eval(`!!document.querySelector('#groups-list .group-row.editing')`), false, 'editor closed');

      // A notation that doesn't parse pins the editor open, Update dead;
      // Cancel reverts.
      await a.eval(`document.querySelector('#groups-list [data-group-id="${atk.id}"] .group-edit').click()`);
      await a.eval(`(() => {
        const notation = document.querySelector('#groups-list .ge-notation');
        notation.value = 'not dice';
        notation.dispatchEvent(new Event('input'));
      })()`);
      assert.equal(await a.eval(`document.querySelector('#groups-list .ge-update').disabled`), true,
        'Update disabled on a bad notation');
      await a.eval(`document.querySelector('#groups-list .ge-cancel').click()`);
      assert.equal((await a.dbg('groups')).find((g) => g.id === atk.id).notation, '3d8+2', 'Cancel reverted');

      // ± popover: 'Update this group' rewrites in place; variant adds.
      assert.equal(await a.dbg(`openPopoverFor(${JSON.stringify(atk.id)})`), true, 'popover opens');
      assert.equal(await a.eval(`document.getElementById('pop-update').classList.contains('hidden')`), false,
        'Update offered for a saved group');
      await a.eval(`(() => {
        const dc = document.getElementById('pop-dc');
        dc.value = '15';
        dc.dispatchEvent(new Event('input'));
      })()`);
      await a.eval(`document.getElementById('pop-update').click()`);
      assert.equal(await a.dbg('popover'), null, 'popover closed by Update');
      gs = await a.dbg('groups');
      assert.equal(gs.length, before.length, 'update-in-place added nothing');
      const dced = gs.find((g) => g.id === atk.id);
      assert.ok(dced.notation.includes('dc15'), `the dc landed on the record (got: ${dced.notation})`);
      assert.equal(dced.name, 'Alpha Strike', 'the name survived the popover update');

      // The popover's Save: the same inline-name morph as the panel's Save
      // (one flow), prefilled with a suggested variant name; Enter mints a
      // NEW pool — additive, the original untouched.
      await a.dbg(`openPopoverFor(${JSON.stringify(atk.id)})`);
      await a.eval(`document.getElementById('pop-variant').click()`);
      assert.equal(await a.eval(`document.getElementById('pop-save-row').classList.contains('hidden')`),
        false, 'Save morphs into the name row');
      assert.ok(await a.eval(`document.getElementById('pop-save-name').value.length > 0`),
        'a pool-bound Save suggests a name');
      await a.eval(`document.getElementById('pop-save-name').dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))`);
      gs = await a.dbg('groups');
      assert.equal(gs.length, before.length + 1, 'the popover Save stays additive');
      assert.ok(gs.find((g) => g.id === atk.id), 'the original survives beside the new pool');

      // The ad-hoc draft has no record: its popover offers variant, never
      // Update. (`openPopoverFor('tray')` keeps the internal source name.)
      await a.eval(`(() => {
        const box = document.getElementById('cmd-input');
        box.value = 'd6';
        box.dispatchEvent(new Event('input'));
      })()`);
      assert.equal(await a.dbg(`openPopoverFor('tray')`), true, 'draft popover opens');
      assert.equal(await a.eval(`document.getElementById('pop-update').classList.contains('hidden')`), true,
        'no Update for the ad-hoc draft');
      await a.dbg('closePopover()');
    },
  },
  {
    name: 'terminology',
    tags: ['smoke', 'chrome'],
    // The vocabulary is 'pool' / 'saved pool'; 'tray' and 'group' survive only
    // as ids, classes, storage keys and the #g= codec. This reads the chrome a
    // player actually sees — labels, tooltips, placeholders, both cheat sheets
    // — and fails if either retired word comes back into view.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      assert.equal(await a.eval(`document.querySelector('#head-groups .ph-label').textContent`),
        'Saved pools', 'the panel is labelled Saved pools');
      assert.equal(await a.eval(`document.querySelector('#head-compose .ph-label').textContent`),
        'New pool', "the builder is 'New pool' — 'Compose' is retired (2026-07)");
      assert.equal(await a.eval(`document.getElementById('group-name').placeholder`),
        'Name this pool…', 'the save field names a pool');
      assert.equal(await a.eval(`document.getElementById('pop-update').textContent`),
        'Update this pool', 'the popover updates a pool');
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
                       '#settings-modal', '#cmd-cheatsheet', '#identity-menu'];
        const banned = /\\btrays?\\b|\\bgroups?\\b|\\bcompose\\b/i;
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
];
