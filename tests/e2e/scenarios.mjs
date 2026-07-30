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
];
