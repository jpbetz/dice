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

// THE ENGINE'S NUMBERS, WRITTEN DOWN BY THE ENGINE. Every tool outside the
// app that reasons about a tower currently HAND-MIRRORS these constants:
// tools/forge/check.py copies TOWER_PORTAL_LIMITS under a "keep in sync"
// comment, re-derives the ramp slope from the sill, and re-types the socket
// envelope and the audit's classifier thresholds as ENV_* literals. A mirror
// nobody can diff is a mirror that goes stale silently — and the failure is
// the worst kind: the bake gate stays green while it grades a model against
// an engine that has moved.
//
//   node tools/drive.mjs tools/steps/engine-contract.mjs
//
// Writes tools/forge/engine_contract.json — stable key order, one trailing
// newline, so a re-emit produces an empty diff or a real one. Commit it.
// Round 2 re-points check.py and the recipes at this file; this step only
// creates and emits it.
//
// IT IS NOT A DETERMINISM FREEZE, and the difference matters: the numbers are
// rounded to 5 dp because the consumers are modelling tools, where 1e-9 is
// noise. The freeze that must NOT round is the contract golden
// (tests/e2e/fixtures/tower-contract.golden.json), which exists to catch
// exactly the drift a rounded copy would wave through.
//
// EVERYTHING IS REBASED ONTO z0. The back-wall anchor is -TABLE_D/2 and it
// moves with the zoom preset and with socketing, so an absolute z here would
// pin the MAT rather than the contract (towerPortalSpec's own warning). Every
// z is therefore written as an offset from z0, which is what the contract
// actually is: "the anchor is the back wall's midpoint; the offsets from it
// are the contract".
//
// The volumes block is the CLASSIC core — the one every row resolving to
// DEFAULT_PORTALS gets — because that is what a hand-mirrored constant has
// always meant. Per-model numbers live in `towers`, derived from each row's
// own declared portals.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'tools', 'forge', 'engine_contract.json');

// Five decimals for the same reason tower-spec-digest uses five: a baked
// portal arrives as a float32 and 9.4 reads back as 9.399999618530273.
const r5 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(5)) : n);
const walk = (v, f) => (Array.isArray(v) ? v.map((x) => walk(x, f))
  : (v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, walk(v[k], f)]))
    : f(v)));

// Sorted keys everywhere, so a JS property-order change cannot produce a diff
// on its own — only a moved number can.
const canon = (v) => walk(v, r5);

export default async function run(stage) {
  const a = await stage.tab('localhost', 'EngineContract');
  await a.settle();
  await a.dbg(`setZoom('medium')`);
  await a.waitFor(`window.__diceDebug.zoom === 'medium'`, { desc: 'zoom medium' });

  const registry = await a.dbg('towerRegistry()');

  // Every baked row's model, before anything asks it for a portal: a row
  // whose GLB has not landed answers with the classic default core, and
  // writing THAT down under its name is how a stale mirror is born.
  for (const row of registry.filter((r) => r.glb)) {
    await a.dbg(`setTower('${row.id}')`);
    let st = await a.dbg(`towerModelStatus('${row.id}')`);
    for (let i = 0; (!st || !st.ready) && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      st = await a.dbg(`towerModelStatus('${row.id}')`);
    }
    if (!st || !st.ready) {
      console.log(`BAD: '${row.id}' never loaded its model (${JSON.stringify(st)})`);
      process.exitCode = 1;
      return;
    }
  }

  // THE CLASSIC CORE, socketed. towerContractSnapshot is the only hook that
  // reads the volumes at contract precision (it exists for the freeze golden
  // and deliberately refuses to round), and its `bodies` are non-null only
  // while a tower stands.
  await a.dbg(`setTower('heartwood')`);
  await a.waitFor(`window.__diceDebug.tower === 'heartwood'`, { desc: 'heartwood socketed' });
  const snap = JSON.parse(await a.eval('JSON.stringify(window.__diceDebug.towerContractSnapshot())'));
  const tune = await a.dbg('towerTune()');
  const classic = await a.dbg(`towerPortalSpec('heartwood')`);
  if (classic.source !== 'default') {
    console.log(`BAD: heartwood no longer resolves to DEFAULT_PORTALS (source=${classic.source}) — `
      + 'the classic core is not what this file says it is');
    process.exitCode = 1;
    return;
  }

  const z0 = snap.z0;
  const dz = (z) => z - z0;
  const boxRel = (b) => ({ c: [b.c[0], b.c[1], dz(b.c[2])], s: b.s, ...(b.rx === undefined ? {} : { rx: b.rx }) });

  // THE SIX SHIPPED EYES. ZOOM_PRESETS' own eyeFull/eyeMini pairs are not
  // exposed; the occlusion probe is where they surface, already translated
  // into the tower's world (each preset's eye rebased through its own
  // z0 + matExtra), which is the form a ray-shooting tool wants anyway.
  await a.dbg('holdClock(true)');
  await a.dbg('towerCore(true)');
  const occ = await a.dbg('towerOcclusionCheck()');
  const eyes = occ.eyes.map((e) => ({ id: e.id, x: e.eye[0], y: e.eye[1], zRelZ0: e.eye[2] - occ.z0 }));

  // PER-MODEL, from each row's own declared portals: the eight numbers, the
  // door the engine cut for them, the despawn line and the cowl band. A forge
  // recipe reasons about its OWN tower, not about the classic one.
  const towers = {};
  for (const row of registry) {
    const s = await a.dbg(`towerPortalSpec('${row.id}')`);
    if (!s) continue;  // 'none' has no portals: the first law, not an omission
    towers[row.id] = {
      source: s.source,
      portals: s.portals,
      despawnY: s.derived.despawnY,
      rimY: s.derived.rimY,
      door: s.derived.door,
      cowlY: s.derived.cowlY,
      exitPitch: s.derived.exit.pitch,
      exitRelZ0: [s.derived.exit.p[0], s.derived.exit.p[1], s.derived.exit.p[2] - s.derived.z0],
      lipFrontDz: s.derived.lipFrontZ - s.derived.z0,
    };
  }

  const d = classic.derived;
  const out = {
    // Provenance first, alphabetically last-but-one by accident of naming —
    // the keys are sorted, so read this file with a diff, not with an eye.
    about: 'The engine constants that tools outside the app must not re-type. '
      + 'Emitted by tools/steps/engine-contract.mjs from the LIVE app; every z is '
      + 'an offset from z0 (-TABLE_D/2), never an absolute. Do not hand-edit. '
      + 'NOT a determinism freeze: numbers are rounded to 5 dp for modelling tools. '
      + 'The byte-identity golden is tests/e2e/fixtures/tower-contract.golden.json.',
    constants: {
      S: d.S,
      // despawnY = rimY - this. check.py calls it DESPAWN_DROP and types 1.4*S.
      despawnDrop: d.rimY - d.despawnY,
      // The die radius the cowl band's cap is written in: the band stops at
      // despawnY + this, because a die vanishes when its CENTRE crosses the
      // line and is hidden only if everything below centre+radius is.
      dieR: d.cowlY[2] + 0.15 - d.despawnY,
      // The engine's own hidden-zone cut, forward of z0.
      hidZone: d.hidZone,
      // The mat depth a socketed tower buys. The one TOWERLAB dial the
      // shipped socket still reads (docs/TOWER.md:107).
      matExtra: tune.matExtra,
    },
    defaultCore: {
      // The six engine-owned volumes at DEFAULT_PORTALS, z-rebased.
      aim: boxRel(snap.aim),
      apron: boxRel(snap.apron),
      cowl: boxRel(snap.cowl),
      despawnY: snap.despawnY,
      door: snap.door,
      exit: { pitch: snap.exit.pitch, pRelZ0: [snap.exit.p[0], snap.exit.p[1], dz(snap.exit.p[2])] },
      hood: boxRel(snap.hood),
      lip: boxRel(snap.lip),
      shaft: { c: [snap.shaft.c[0], snap.shaft.c[1], dz(snap.shaft.c[2])], r: snap.shaft.r, h: snap.shaft.h },
      socket: boxRel(snap.socket),
      // THE RAMP LINE, which is the coefficient check.py re-derives from the
      // sill (`tan_slope = 0.8/1.5 + (sillY - 0.8*S)/(1.5*S)`): the apron's
      // top surface climbs backward from the sill at this gradient, and a die
      // rides it. The engine already carries it as the exit pitch, so it is
      // read rather than recomputed. The lip's own tilt is its rx above
      // (TOWER_LIP_TILT, frozen — never the lab dial).
      rampTanSlope: Math.tan(-snap.exit.pitch),
    },
    defaultPortals: classic.portals,
    // THE SOCKET ENVELOPE AND THE AUDIT'S LADDER — check.py's ENV_* block,
    // which is a coarse copy of exactly these. cls comes from the volumes,
    // so three of its rungs move with a model's own door.
    envelope: {
      cls: d.cls,
      socketX: snap.socket.s[0] / 2,
      socketYTop: snap.socket.c[1] + snap.socket.s[1] / 2,
      socketZRelZ0: [dz(snap.socket.c[2] - snap.socket.s[2] / 2), dz(snap.socket.c[2] + snap.socket.s[2] / 2)],
    },
    eyes,
    // WHAT THIS FILE DOES NOT CARRY, said out loud. A consumer that cannot
    // see the difference between "absent because the engine has no hook" and
    // "absent because somebody forgot" will assume the second and re-type the
    // constant, which is the whole disease.
    gaps: [
      "leans: each skin's TILT is a module const in js/towerskin.js (0.7°), "
      + 'js/towerbastion.js (0.2°), js/toweranvil.js (0.15°) and the Hollow Bole bake '
      + '(0.45°), applied as group.rotation.z. No debug hook reports it, so '
      + "check.py's --tower-tilt-deg stays hand-passed until one exists.",
      'ZOOM_PRESETS.eyeFull/eyeMini are not exposed directly; `eyes` carries them '
      + 'as the occlusion probe hands them over — already translated into the '
      + "tower's world and rebased on z0 here.",
      'POUR (speeds, tempo, the exit guarantee\'s retry budget) is not here: no '
      + 'hook exposes it and no forge tool needs it yet.',
    ],
    portalLimits: classic.limits,
    towers,
  };

  const json = canon(out);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(json, null, 2)}\n`);

  await a.dbg('towerCore(false)');
  await a.dbg(`setTower('none')`);

  console.log(`S=${json.constants.S} matExtra=${json.constants.matExtra} `
    + `despawnDrop=${json.constants.despawnDrop} dieR=${json.constants.dieR} `
    + `rampTanSlope=${json.defaultCore.rampTanSlope}`);
  console.log(`socket x=±${json.envelope.socketX} yTop=${json.envelope.socketYTop} `
    + `z(rel z0)=[${json.envelope.socketZRelZ0}]`);
  for (const e of json.eyes) console.log(`  eye ${e.id.padEnd(12)} (${e.x}, ${e.y}, z0+${e.zRelZ0})`);
  for (const [id, t] of Object.entries(json.towers)) {
    console.log(`  ${id.padEnd(12)} ${t.source.padEnd(7)} door ${t.door.w}×${t.door.h}@${t.door.sill} `
      + `rimY ${t.rimY} despawnY ${t.despawnY}`);
  }
  console.log(`\nwrote ${OUT}\n${json.gaps.length} gap(s) recorded in the file itself`);
}
