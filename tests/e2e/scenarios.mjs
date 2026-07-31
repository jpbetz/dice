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
    // Quiet by default (P1): a resting shelf marker is just the roller's dot
    // on an enlarged target — no total, no lens word, no tiny ✕, and a held
    // roll never shouts '?'. The detail lives in the peek, whose base carries
    // the one prominent clear-✕ — and that ✕ clears for everyone, from any
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
          `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
          { desc: 'roll shelved' },
        );
      }
      const markers = await b.dbg('shelfMarkers');
      assert.equal(markers.length, 1, 'one resting marker');
      const m = markers[0];
      assert.equal(m.rollId, rid, 'marker addresses its roll');
      assert.equal(m.dotOnly, true, 'resting marker is the roller dot only');
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

      // A held roll rests exactly as quiet: dot only, never '?'; its Reveal
      // waits in the peek for the authority.
      await a.roll('d20 held');
      const hid = await a.rollId();
      await a.dbg(`collectRoll(${JSON.stringify(hid)})`);
      await a.waitFor(
        `(window.__diceDebug.sim(120), window.__diceDebug.shelf.length === 1 && window.__diceDebug.whiskingCount === 0)`,
        { desc: 'held roll shelved' },
      );
      const hm = (await a.dbg('shelfMarkers'))[0];
      assert.equal(hm.dotOnly, true, 'a held roll rests just as quiet');
      assert.ok(!hm.text.includes('?'), 'the marker never shouts ?');
      assert.equal(await a.dbg(`peek(${JSON.stringify(hid)})`), hid, 'peek opens for the authority');
      assert.equal((await a.dbg('peekState')).hasReveal, true, 'Reveal lives in the peek');
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
      assert.equal(await b.dbg('felt.id'), 'walnut', 'walnut is the default felt');
      await a.dbg(`setSystem('dnd')`);
      await b.waitFor(`window.__diceDebug.system === 'dnd'`, { desc: 'system syncs to B' });
      await a.dbg(`setFelt('emerald')`);
      await b.waitFor(`window.__diceDebug.felt.id === 'emerald'`, { desc: 'felt syncs to B' });
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
    // Four regions, each independently collapsible; collapsed = header tab
    // only; state persists per user ('dice.panels.v1' — same origin, same
    // identity); the keyboard parity: 'm' collapses/expands all, 'l' one.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      let st = await a.dbg('panelState');
      assert.equal(st.compose && st.groups && st.log, true, 'panels default open on a desktop viewport');
      assert.equal(st.playersAvailable, true, 'the Players region exists online');

      st = await a.dbg('setPanelState({log: false, groups: false})');
      assert.equal(st.log, false, 'log collapsed');
      assert.equal(st.groups, false, 'groups collapsed');
      assert.equal(st.compose, true, 'compose untouched — independent regions');
      assert.equal(st.allCollapsed, false, 'not yet compact');
      assert.equal(await a.eval(`document.querySelector('#log-panel .panel-body').offsetParent === null`),
        true, 'a collapsed panel is its header tab only');
      assert.equal(await a.eval(`document.querySelector('#builder-panel .panel-body').offsetParent !== null`),
        true, 'an open panel keeps its body');

      // Immersion invariant: a roll plays out exactly the same under
      // collapsed chrome (the log records even while its panel is a tab).
      await a.roll('2d6');
      assert.equal(await a.diceCount(), 2, 'roll unaffected by collapsed chrome');

      // Persistence: a fresh tab on the same origin restores the state.
      const b = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const st2 = await b.dbg('panelState');
      assert.equal(st2.log, false, 'collapsed log persisted');
      assert.equal(st2.groups, false, 'collapsed groups persisted');
      assert.equal(st2.compose, true, 'open compose persisted');

      // Keyboard parity: 'm' = collapse/expand all; 'l' = just the log.
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'm'}))`);
      assert.equal((await b.dbg('panelState')).allCollapsed, true, "'m' collapses everything");
      assert.ok(await b.eval(`document.body.classList.contains('mini')`), 'and compact view engages');
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'l'}))`);
      const st3 = await b.dbg('panelState');
      assert.equal(st3.log, true, "'l' reopens the log");
      assert.equal(st3.compose, false, 'without touching the others');
      assert.ok(await b.eval(`!document.body.classList.contains('mini')`), 'compact view lifts');
    },
  },
  {
    name: 'control-rail',
    tags: ['smoke', 'chrome'],
    // The persistent control rail NEVER hides: identity chip, settings, mute,
    // palette and collapse-all stay reachable even with every panel collapsed
    // (the emergent compact view). The retired compact mode used to strand
    // settings + mute off screen — this pins the fix.
    async fn(ctx) {
      const a = await ctx.newTable({ origin: 'localhost', name: 'Alice' });
      const RAIL = ['rail', 'identity-chip', 'toggle-settings', 'toggle-sound', 'rail-palette', 'rail-collapse'];
      const visible = (id) => a.eval(
        `(() => { const el = document.getElementById('${id}'); if (!el) return false;`
        + ` const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; })()`,
      );
      for (const id of RAIL) assert.ok(await visible(id), `#${id} visible in full view`);

      const st = await a.dbg('setPanelState({compose: false, groups: false, players: false, log: false})');
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
      const st2 = await a.dbg('setPanelState({log: true})');
      assert.equal(st2.allCollapsed, false, 'one open panel ends all-collapsed');
      assert.ok(await a.eval(`!document.body.classList.contains('mini')`), 'compact view lifts');
      // Leave the origin's persisted state all-open: panel state is per-user
      // localStorage, which OUTLIVES this scenario's room (later scenarios on
      // this origin read hidden-log innerText as empty if we leave it shut).
      await a.dbg('setPanelState({compose: true, groups: true, players: true, log: true})');
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
