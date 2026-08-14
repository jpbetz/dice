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

// EVERY WAY A TABLE GOES IDLE MUST LAND A DEFERRED ROOM CHANGE (ROADMAP C28 ②).
// The mat is the PHYSICS WALLS and is room-wide precisely so every client
// replays a seeded roll against the same geometry, so a client left on the old
// preset after the room moved is the divergence the deferral exists to prevent.
// `tableIsBusyForZoom()` names three holds — an in-flight roll, a queued roll,
// a reveal flip — and this walks a room change through each release path:
//
//   ceremony   a check roll's verdict (ceremonyFinish — the path C28 ② names)
//   clear      the corner sweep (clearTable ends the roll and empties the queue)
//   reveal     the last flip of a revealed held roll (no completion hook at all)
//
// plus the invariant the spawn change (C28 ①) has to keep: ONE SEED, ONE FILM.
// Two clients on wildly different viewports replay the same seeded roll to
// bit-identical rest poses, which is what proves the throw reads no per-device
// state.
//
//   node tools/drive.mjs tools/steps/defer-flush.mjs

let failures = 0;
function check(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
}

// The walls, rounded — wallPositions() is floats and the preset is a decimal.
const wallsOf = async (t) => {
  const w = await t.dbg('wallPositions()');
  return JSON.stringify(w, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
};

// `only` runs one leg — which is how the NEGATIVE control is taken. With the
// fix backed out, leg 1 leaves a zoom pending forever and every later leg's
// setup wedges on it, so "does leg 3 fail without the fix" can only be asked
// by running leg 3 alone.
export default async function run(stage, [only = ''] = []) {
  const legs = only ? only.split(',') : ['1', '2', '3', '4'];
  const a = await stage.tab('localhost', 'Alice');
  const b = await stage.tab('127.0.0.1', 'Bob');
  await a.dbg("setZoom('medium')");
  await b.waitFor("JSON.stringify(window.__diceDebug.wallPositions()).length > 2",
    { desc: 'Bob has walls' });

  const target = await b.dbg("zoomPreset('close')");
  console.log(`\n  close preset = ${target.w} x ${target.d}\n`);

  // --- 1. the ceremony path -------------------------------------------------
  if (legs.includes('1')) {
  await a.dbg("commandRoll('d20 check dc10')");
  await a.waitFor('!!(window.__diceDebug.currentRoll || {}).ceremony'
    + ' && !window.__diceDebug.currentRoll.done',
  { desc: 'a ceremony is running on Alice' });
  await b.dbg("setZoom('close')");
  await a.waitFor("window.__diceDebug.pendingZoom === 'close'",
    { desc: 'Alice DEFERRED the zoom (busy in a ceremony)' });
  check(await a.dbg('queueLength') === 0, 'nothing queued behind the ceremony');
  // Finish the ceremony the way its own clock would.
  await a.eval('(window.__diceDebug.skipCeremony(), window.__diceDebug.sim(60))');
  await a.dbg('sim(60)');
  check(await a.dbg('pendingZoom') === null, 'ceremonyFinish landed the deferred zoom');
  const wallsA = await wallsOf(a);
  check(wallsA.includes(String(target.w / 2)), `Alice's walls ARE the close preset  ${wallsA}`);
  // Bob replays the same broadcast ceremony on his own rAF clock; let it end.
  await b.waitFor('window.__diceDebug.pendingZoom === null && !window.__diceDebug.busy',
    { desc: 'Bob finished the same ceremony and landed it too' });
  check(wallsA === await wallsOf(b), "Alice's walls match Bob's after the ceremony");

  }

  // --- 2. the clear path ----------------------------------------------------
  if (legs.includes('2')) {
  await b.dbg("setZoom('medium')");
  await a.waitFor('window.__diceDebug.pendingZoom === null', { desc: 'back to medium' });
  await a.dbg("commandRoll('6d6')");
  await a.waitFor('!!window.__diceDebug.currentRoll && !window.__diceDebug.currentRoll.done',
    { desc: 'a plain roll is playing on Alice' });
  await b.dbg("setZoom('close')");
  await a.waitFor("window.__diceDebug.pendingZoom === 'close'",
    { desc: 'Alice DEFERRED the zoom (busy in a roll)' });
  await a.dbg('clearTable()');   // the corner sweep: roll done, queue emptied
  await a.dbg('sim(4)');
  check(await a.dbg('pendingZoom') === null, 'clearTable landed the deferred zoom');
  await b.waitFor('window.__diceDebug.pendingZoom === null && !window.__diceDebug.busy',
    { desc: 'Bob landed it too' });
  check(await wallsOf(a) === await wallsOf(b), "Alice's walls match Bob's after the sweep");

  }

  // --- 3. the reveal path ---------------------------------------------------
  if (legs.includes('3')) {
  await b.dbg("setZoom('medium')");
  await a.waitFor('window.__diceDebug.pendingZoom === null', { desc: 'back to medium' });
  await a.dbg("commandRoll('3d6 held')");
  await a.settle();
  await b.settle();
  await a.dbg('holdClock(true)'); // the flip is 0.3s of rAF; freeze it to park inside
  const rid = await a.rollId();
  await a.dbg(`reveal(${JSON.stringify(rid)})`).catch(() => {});
  let flipping = 0;
  await a.waitFor('window.__diceDebug.revealingCount > 0', { desc: 'the flip started', timeout: 6000 })
    .then(() => { flipping = 1; }).catch(() => {});
  if (flipping > 0) {
    await b.dbg("setZoom('close')");
    await a.waitFor("window.__diceDebug.pendingZoom === 'close'",
      { desc: 'Alice DEFERRED the zoom (busy in a reveal flip)' });
    await a.dbg('sim(90)'); // run the flip out
    check(await a.dbg('revealingCount') === 0, 'the flip finished');
    check(await a.dbg('pendingZoom') === null, 'the last reveal flip landed the deferred zoom');
    await a.dbg('holdClock(false)');
    await b.waitFor('window.__diceDebug.pendingZoom === null && !window.__diceDebug.busy',
      { desc: 'Bob landed it too' });
    check(await wallsOf(a) === await wallsOf(b), "Alice's walls match Bob's after the reveal");
  } else {
    console.log('  skip  reveal leg — no flip was in flight to park inside');
  }
  await a.dbg('holdClock(false)');

  }

  // --- 4. ONE SEED, ONE FILM, whatever the viewport -------------------------
  if (legs.includes('4')) {
  await b.dbg("setZoom('medium')");
  await a.dbg('clearTable()');
  await b.dbg('clearTable()');
  // BOTH clients must be standing on the same walls before this means anything
  // — a film compared across two different mats proves nothing about the seed.
  const wantMedium = JSON.stringify(await a.dbg("zoomPreset('medium')"));
  for (const t of [a, b]) {
    await t.waitFor(
      `(window.__diceDebug.sim(4), JSON.stringify({w: window.__diceDebug.tableExtents().w,`
      + ` d: window.__diceDebug.tableExtents().d}) === ${JSON.stringify(wantMedium)})`,
      { desc: 'both back on the medium mat' });
  }
  await a.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
  await b.page.browser.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, b.page.sessionId);
  await a.eval('window.dispatchEvent(new Event("resize"))');
  await b.eval('window.dispatchEvent(new Event("resize"))');
  await new Promise((r) => setTimeout(r, 300));
  await a.dbg("commandRoll('8d6')");
  await a.settle();
  await b.settle();
  const poses = (t) => t.eval(
    'JSON.stringify(window.__diceDebug.tableDice.map((d) => '
    + '[d.body.position.x, d.body.position.y, d.body.position.z]))');
  const pa = await poses(a);
  const pb = await poses(b);
  check(pa === pb, `same seed, 390px vs 1600px: bit-identical rest poses (${JSON.parse(pa).length} dice)`);
  }

  console.log(failures ? `\n  ${failures} FAILED\n` : '\n  all checks passed\n');
  if (failures) process.exitCode = 1;
}
