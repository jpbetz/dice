/* Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 */
// Reproduce the old carrier, measure a fixed grid, or capture the selected proof.
// node tools/drive.mjs tools/steps/physics-carriers.mjs [all|audio|original|proof]
import { writeFileSync } from 'node:fs';

export default async function run(stage, [mode = 'all']) {
  if (!['all', 'audio', 'original', 'proof'].includes(mode)) throw Error('Unknown carrier mode');
  const a = await stage.tab('127.0.0.178', 'Physics');
  await a.dbg('holdClock(true)');
  await a.page.browser.send('Emulation.setDeviceMetricsOverride', {
    width: 1500, height: 950, deviceScaleFactor: 1, mobile: false,
  }, a.page.sessionId);
  const rows = [];
  const six = Array(6).fill('d6'), eight = Array(8).fill('d6');
  const soul = ['d8', 'd8', 'd4', 'd6'];
  const zoom = async level => {
    await a.dbg(`setZoom(${JSON.stringify(level)})`);
    await a.waitFor(`window.__diceDebug.zoom === ${JSON.stringify(level)}`);
  };
  const save = () => {
    writeFileSync(stage.out(`physics-carriers-${mode}.json`),
      JSON.stringify({ rows, errors: a.page.errors }, null, 2));
    if (a.page.errors.length) throw Error(JSON.stringify(a.page.errors));
  };
  async function sample(kind, types, seed, bar, finish = true) {
    if (bar !== undefined) await a.dbg(`setNudge({pileScale:${bar}})`);
    // throwSeeded uses the original inline solver unless explicitly opted in.
    await a.dbg(`throwSeeded(${JSON.stringify(types)},${seed})`);
    await a.waitFor('window.__diceDebug.currentRoll?.keyframes?.length > 0 && !window.__diceDebug.currentRoll.baking');
    if (finish) await a.settle(); else await a.dbg('sim(1)');
    const row = await a.eval(`(async () => {
      const d = window.__diceDebug, r = d.currentRoll;
      const film = {keyframes:r.keyframes,sounds:r.sounds,rough:r.rough,
        landings:r.landings,nudges:r.nudges,values:r.values};
      const digest = await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(JSON.stringify(film)));
      return {zoom:d.zoom,extents:d.tableExtents(),
        boundary:d.tableBoundary?.() || {round:false},profile:d.settleProfile(),
        scan:d.audioFilmScan(),tune:d.audioTune(),
        landings:r.landings.map(l => ({y:l.endY,piled:l.endPiled,
          frame:l.frame,timedOut:l.timedOut})),
        hash:Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2,'0')).join('')};
    })()`);
    const tail = row.scan.dice.filter(d => d.framesAfterSettle > 0);
    const max = key => Math.max(0, ...tail.map(d => d[key]));
    Object.assign(row, {kind, seed, bar, carrier: {
      tail:tail.length,afterAng:max('maxAngSpeedAfterSettle'),
      afterSpeed:max('maxSpeedAfterSettle'),
      maxSpeed:Math.max(...row.scan.dice.map(d => d.maxSpeed)),
      rolling:Math.max(...row.scan.dice.map(d => d.longestRollingRun)),
    }});
    rows.push(row);
    const {frames,duration,nudged,piled,timedOut} = row.profile;
    console.log(JSON.stringify({kind,seed,bar,zoom:row.zoom,
      profile:{frames,duration,nudged,piled,timedOut},
      maxY:Math.max(...row.landings.map(l => l.y)),carrier:row.carrier}));
    if (kind === 'pile' && seed === 103947 && [0, 1.05].includes(bar)) {
      await stage.shot(a, `physics-carrier-pile-103947-${bar}.png`);
    }
    await a.dbg('clearTable()');
    await a.dbg('sim(60)');
    return row;
  }
  if (mode === 'original') {
    await sample('original-soul', soul, 4242, undefined, false);
    await sample('original-audio', eight, 64352, undefined, false);
    save(); return;
  }
  if (mode === 'all' || mode === 'proof') {
    await zoom('close');
    for (const seed of mode === 'proof' ? [103947,24757] : [16838,103947,24757,32676]) {
      for (const bar of [0,1.05,0.5]) await sample('pile', six, seed, bar);
    }
  }
  if (mode === 'audio') {
    await zoom('close');
    await sample('explicit-close', eight, 64352);
  }
  await a.dbg('setNudge({pileScale:1.05})');
  await zoom('medium');
  if (mode === 'proof') {
    await sample('selected-soul', soul, 4242, undefined, false);
    await sample('selected-audio', eight, 175218, undefined, false);
    save(); return;
  }
  if (mode === 'audio') await sample('rolling-phase', soul, 4242);
  const seeds = mode === 'audio' ? [64352,...Array.from({length:24}, (_,i) => 1000+i*7919)]
    : [64352,1000,8919,16838,24757,32676,40595,48514,56433,72271,80190,88109];
  for (const seed of seeds) await sample('audio', eight, seed);
  save();
}
