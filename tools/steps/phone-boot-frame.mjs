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

// WHAT A PHONE ACTUALLY LOOKS AT (Joe, 2026-08-31: "super zoomed out and the
// dice almost disappear into the fog in the initial throw").
//
// Every framing measurement in this repo grades the SETTLED frame. This one
// grades the two moments before it: the RESTING felt a phone boots into, and
// the FLIGHT, during which ruling (1) forbids the camera to move at all — so
// what the resting frame is, the whole tumble is.
//
// Columns: camScale (multiple of the preset eye distance), spanPx, and the
// die's DISTANCE FROM THE EYE against the fog's near/far, because a die past
// fogFar is painted the background colour and is gone.
//
//   node tools/drive.mjs tools/steps/phone-boot-frame.mjs

const VIEWPORTS = [
  { name: 'phone 390', w: 390, h: 844, mini: true },
  { name: 'phone 360', w: 360, h: 780, mini: true },
  { name: 'ipad-p 834', w: 834, h: 1112, mini: true },
  { name: 'desktop 1600', w: 1600, h: 1000, mini: false },
];

const READ = `(() => {
  const d = window.__diceDebug;
  const f = d.framingInfo();
  const b = d.breathProbe();
  return { f, fogNear: b.fogNear, fogFar: b.fogFar, matFogFloor: Math.round(b.matFogFloor * 10) / 10 };
})()`;

// THE NUMBER THREE.JS ITSELF FOGS BY: -mvPosition.z, the die's depth in EYE
// space, read off the modelViewMatrix the last render left behind. Not the
// straight-line distance and not a guess at one — the same quantity the fog
// shader mixes on.
const FOGDEPTH = `(() => {
  return window.__diceDebug.tableDice
    .filter((d) => d.mesh && d.mesh.visible !== false)
    .map((d) => -d.mesh.modelViewMatrix.elements[14]);
})()`;

export default async function run(stage) {
  const a = await stage.tab('localhost', 'PhoneBoot');
  const rows = [];
  for (const vp of VIEWPORTS) {
    await a.page.browser.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false }, a.page.sessionId);
    await a.dbg(`setPanelState({pools: ${!vp.mini}, log: ${!vp.mini}})`);
    await a.dbg("setZoom('medium')");
    await a.eval('window.dispatchEvent(new Event("resize"))');
    await new Promise((r) => setTimeout(r, 250));

    await a.dbg('clearTable()');
    await a.dbg('sim(400)');
    const rest = await a.eval(READ);
    rows.push({ view: vp.name, at: 'resting (empty felt)', ...flat(rest) });

    // THE FLIGHT. Throw, step a handful of frames so the dice are in the air,
    // and read the camera the player is actually looking through. Two reads
    // since the arrival became an ease (2026-08-31 pm): one mid-arrival, one
    // after it lands (CAM_ARRIVE_S 0.9 s = 54 frames) with dice still aloft.
    await a.dbg(`throwSeeded(["d6","d6","d6"], 7002)`);
    await a.dbg('sim(20)');
    const fly = await a.eval(READ);
    const dist = await a.eval(FOGDEPTH);
    rows.push({ view: vp.name, at: 'flight (frame 20, mid-arrival)', ...flat(fly), dist: fmtDist(dist) });
    await a.dbg('sim(40)');
    const fly2 = await a.eval(READ);
    const distB = await a.eval(FOGDEPTH);
    rows.push({ view: vp.name, at: 'flight (frame 60, arrived)', ...flat(fly2), dist: fmtDist(distB) });

    await a.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
      { desc: `${vp.name} settle`, timeout: 40000 });
    await a.dbg('sim(600)');
    const done = await a.eval(READ);
    const dist2 = await a.eval(FOGDEPTH);
    rows.push({ view: vp.name, at: 'settled', ...flat(done), dist: fmtDist(dist2) });
  }

  await a.dbg('setPanelState({pools: true, log: true})');

  const head = ['viewport', 'moment', 'rung', 'camScale', 'spanPx', 'camY', 'fogNear', 'fogFar', 'eye->die'];
  const keys = ['view', 'at', 'mode', 'camScale', 'spanPx', 'camY', 'fogNear', 'fogFar', 'dist'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[keys[i]] ?? '—').length)));
  const line = (c) => c.map((v, i) => String(v ?? '—').padEnd(w[i])).join('  ');
  console.log('');
  console.log('  ' + line(head));
  console.log('  ' + w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of rows) console.log('  ' + line(keys.map((k) => r[k])));
  console.log('');
}

function flat(r) {
  return {
    mode: r.f.mode, camScale: r.f.camScale, spanPx: r.f.spanPx, camY: r.f.camY,
    fogNear: r.fogNear, fogFar: r.fogFar, matFogFloor: r.matFogFloor,
  };
}
function fmtDist(d) {
  if (!d || !d.length) return '—';
  const lo = Math.min(...d), hi = Math.max(...d);
  return `${Math.round(lo)}-${Math.round(hi)}`;
}
