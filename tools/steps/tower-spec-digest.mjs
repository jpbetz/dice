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

// "MESH-ONLY" IS A CLAIM, AND THIS IS THE INSTRUMENT THAT PROVES IT.
// A tower model is 100% cosmetic over invisible engine colliders and portals:
// physics and the pour film are a function of (portal spec, engine constants,
// seed) and nothing else. So a change that only moves triangles must leave
// `towerPortalSpec(id)` bit-identical for every registered tower — and a
// change that moves the spec is NOT cosmetic, whatever the diff looks like.
//
// This prints that spec for every row, hashes it stably, and diffs it against
// a committed fixture, field by field.
//
//   node tools/drive.mjs tools/steps/tower-spec-digest.mjs           # gate
//   node tools/drive.mjs tools/steps/tower-spec-digest.mjs --write   # re-pin
//
// WHAT IS PINNED IS THE DECLARATION, NOT THE DERIVATION (2026-08-13, T3). The
// fixture holds each row's `portals`, its `source` and the `limits` they were
// judged against — the eight numbers a MODEL chooses — and nothing the engine
// computes from them. It used to hold the derived core too, and that was a
// slow leak: an engine-constant change moved every row's digest at once, on
// work that had renegotiated no portal at all, and a gate that goes red for
// reasons its readers learn to wave through is a gate that has stopped
// working. Derivation drift has two better owners, both byte-level: the
// `tower-contract-freeze` scenario now freezes every registered tower's whole
// derived core, and `towerFilmDigest` covers spec + volumes + POUR + the plan
// pourPlan actually draws. The derived numbers are still READ here (they are
// what the zoom-invariance proof below is taken over, and the report prints
// them) — they are simply not what this fixture remembers.
//
// WHAT IS HASHED, AND WHY IT IS NOT THE RAW OBJECT. Two normalisations, both
// forced by what the numbers ARE:
//
//   · THE MAT MOVES, THE CONTRACT DOES NOT. `derived` is evaluated at the
//     current mat — z0 is -TABLE_D/2, so it moves with the zoom preset and
//     with whether a tower is socketed at all — and towerPortalSpec says so
//     in its own comment: read derived for the SHAPE of the answer, not as an
//     absolute a fixture can pin. Every z here is therefore rebased onto z0
//     (`exit.pRelZ0`, `lipFrontDz`) and z0 itself is dropped. The step then
//     PROVES the rebasing rather than asserting it: it re-reads every spec at
//     all three zoom presets and refuses to go on if the normalised digest
//     moved. A fixture that silently pinned the mat would go red on an
//     unrelated zoom retune, and the next person would "fix" it by re-pinning.
//
//   · A BAKED PORTAL IS A float32. The GLB carries 9.4 as 9.399999618530273,
//     so the numbers are rounded to 5 decimals before hashing — well inside
//     float32's worst-case error at this magnitude (~5e-7) and far outside
//     any real portal edit, which is authored at two decimals.
//
// Keys are sorted RECURSIVELY before hashing, so a JS property-order change
// (a field added to towerPortalSpec's literal in a different place) cannot
// move a hash on its own — only a value can.
//
// A GLB ROW IS ASKED FOR ITS MODEL FIRST. towerPortalSpec answers `source:
// 'default'` for a baked row whose model has not arrived, which is main.js's
// own stated difference between "a tower" and "a wall with dice behind it" —
// digesting that would pin the classic core under a baked tower's name. So
// every glb row is socketed once to kick the load, polled to ready, and only
// then read.
//
// --write IS NOT A WAY TO GO GREEN. Same rule as the contract golden
// (tower-contract-capture.mjs): re-pin only when a portal is DELIBERATELY
// renegotiated — a re-bake that moves a declared portal, a limits change —
// and say so in the commit. Re-running it after a surprise diff simply writes
// the surprise down and the gate stops gating.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'tower-spec.digest.json');

// The state every spec is read in, so two runs compare like with like: no
// tower socketed (the mat is the preset's own depth) at the middle rung.
const READ_ZOOM = 'medium';
const ZOOMS = ['wide', 'medium', 'close'];

const round5 = (n) => Number(n.toFixed(5));

// Recursive key sort + rounding, in one walk: the canonical form both the
// hash and the field diff are taken over.
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  return typeof v === 'number' && Number.isFinite(v) ? round5(v) : v;
}

// The mat-relative view of one spec. `null` (id 'none', an unregistered id)
// is a fact worth pinning as itself: the FIRST LAW is that 'none' is not a
// mode, and a day when it starts answering with the classic core is a day
// this should go red.
export function normalizeSpec(spec) {
  if (!spec) return null;
  const d = spec.derived;
  const { z0, exit, lipFrontZ, ...rest } = d;
  return canon({
    id: spec.id,
    source: spec.source,
    portals: spec.portals,
    limits: spec.limits,
    derived: {
      ...rest,
      // Rebased onto the back wall: these three are the only mat-dependent
      // numbers in the object, and the offsets from z0 ARE the contract.
      exit: { pRelZ0: [exit.p[0], exit.p[1], exit.p[2] - z0], pitch: exit.pitch },
      lipFrontDz: lipFrontZ - z0,
    },
  });
}

// THE HALF THAT IS PINNED: what the tower DECLARED, and the limits it was
// judged against. Everything the engine derives is dropped here rather than in
// normalizeSpec, because the zoom-invariance proof below needs the derived
// numbers — they are the only mat-dependent things in the object, so a
// rebasing that quietly stopped working would be undetectable without them.
export function declaredOf(norm) {
  if (!norm) return null;
  const { derived, ...declared } = norm;
  return declared;
}

const hashOf = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);

// Every leaf that differs, as `path: was → now`. Walks both sides, so a field
// that APPEARED or VANISHED reads as such rather than as silence — a new key
// in towerPortalSpec is exactly the kind of change this should announce.
function fieldDiff(was, now, path = '') {
  const out = [];
  const isObj = (v) => v && typeof v === 'object';
  if (!isObj(was) || !isObj(now)) {
    if (JSON.stringify(was) !== JSON.stringify(now)) {
      out.push(`${path || '(root)'}: ${JSON.stringify(was)} → ${JSON.stringify(now)}`);
    }
    return out;
  }
  for (const k of new Set([...Object.keys(was), ...Object.keys(now)])) {
    const p = path ? `${path}.${k}` : k;
    if (!(k in was)) out.push(`${p}: (absent) → ${JSON.stringify(now[k])}`);
    else if (!(k in now)) out.push(`${p}: ${JSON.stringify(was[k])} → (absent)`);
    else out.push(...fieldDiff(was[k], now[k], p));
  }
  return out;
}

async function readAll(a, ids) {
  const out = {};
  for (const id of ids) {
    out[id] = normalizeSpec(await a.dbg(`towerPortalSpec(${JSON.stringify(id)})`));
  }
  return out;
}

export default async function run(stage, args) {
  const write = args.includes('--write');
  const a = await stage.tab('localhost', 'SpecDigest');
  await a.settle();

  const registry = await a.dbg('towerRegistry()');
  const ids = registry.map((r) => r.id);

  // 1. EVERY BAKED ROW GETS ITS MODEL BEFORE IT IS ASKED ANYTHING.
  for (const row of registry.filter((r) => r.glb)) {
    await a.dbg(`setTower('${row.id}')`);
    let st = await a.dbg(`towerModelStatus('${row.id}')`);
    for (let i = 0; (!st || !st.ready) && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      st = await a.dbg(`towerModelStatus('${row.id}')`);
    }
    if (!st || !st.ready) {
      console.log(`BAD: '${row.id}' never loaded its model (${JSON.stringify(st)}) — `
        + 'its spec would digest as the classic default core');
      process.exitCode = 1;
      return;
    }
    console.log(`${row.id}: model ready (${st.url}), portals on the row: ${st.portals}`);
  }
  await a.dbg(`setTower('none')`);
  await a.waitFor(`window.__diceDebug.tower === 'none'`, { desc: 'unsocketed' });

  // 2. THE NORMALISATION, PROVED. Read at every rung; the mat moves under the
  //    spec by design, and if that shows through the rebasing is not real.
  let live = null;
  for (const zoom of ZOOMS) {
    await a.dbg(`setZoom('${zoom}')`);
    await a.waitFor(`window.__diceDebug.zoom === '${zoom}'`, { desc: `zoom ${zoom}` });
    const at = await readAll(a, ids);
    if (!live) { live = at; continue; }
    const drift = fieldDiff(live, at);
    if (drift.length) {
      console.log(`BAD: the digest moved between zoom presets — it is pinning the MAT, `
        + `not the contract:\n  ${drift.slice(0, 12).join('\n  ')}`);
      process.exitCode = 1;
      return;
    }
  }
  await a.dbg(`setZoom('${READ_ZOOM}')`);
  await a.waitFor(`window.__diceDebug.zoom === '${READ_ZOOM}'`, { desc: `zoom ${READ_ZOOM}` });

  const towers = {};
  for (const id of ids) towers[id] = { hash: hashOf(declaredOf(live[id])), spec: declaredOf(live[id]) };

  // 3. THE REPORT. The eight portal numbers are the whole input to the engine
  //    core, so they are printed in full beside the hash — a reviewer reading
  //    a red diff should not have to open the fixture to see what a tower is
  //    asking for. The derived line is printed FOR CONTEXT and is not pinned
  //    (see the header): it is the freeze scenario's and the film digest's.
  console.log('');
  for (const id of ids) {
    const s = towers[id].spec;
    if (!s) { console.log(`${id.padEnd(12)} ${towers[id].hash}  (no portals — not a mode)`); continue; }
    const { in: pin, out } = s.portals;
    const d = live[id].derived;
    console.log(`${id.padEnd(12)} ${towers[id].hash}  source=${s.source}`);
    console.log(`  in  x=${pin.x} z=${pin.z} rimY=${pin.rimY} clearR=${pin.clearR}`);
    console.log(`  out x=${out.x} sillY=${out.sillY} w=${out.w} clearH=${out.clearH}`);
    console.log(`  (not pinned) despawnY=${d.despawnY} rimY=${d.rimY} `
      + `door=${d.door.w}×${d.door.h}@${d.door.sill} `
      + `cowlY=[${d.cowlY}] exit(rel z0)=[${d.exit.pRelZ0}]`);
  }

  const out = { state: { zoom: READ_ZOOM, socket: 'none' }, towers };
  if (write) {
    mkdirSync(dirname(FIXTURE), { recursive: true });
    writeFileSync(FIXTURE, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nwrote ${FIXTURE} — RE-PIN ONLY A DELIBERATE RENEGOTIATION, and say so in the commit.`);
    return;
  }

  let fixture = null;
  try {
    fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  } catch (e) {
    console.log(`\nBAD: no fixture at ${FIXTURE} (${e.code || e.message}) — `
      + 'run once with --write to pin the current specs.');
    process.exitCode = 1;
    return;
  }

  // 4. THE DIFF. Per tower, per field — including rows that appeared or
  //    vanished from the registry, which is a spec change like any other.
  //
  // THE RECORDED HASH IS NEVER THE COMPARISON KEY, and that is not caution,
  // it is a bug this step shipped for about ten minutes: comparing the stored
  // `hash` field let a hand-edited `spec` sail through green, because the two
  // live side by side in one file and the stale one was winning. The hash is
  // RECOMPUTED from the fixture's own spec; the recorded one is a convenience
  // for humans reading the file, and a fixture where they disagree is a
  // fixture somebody edited by hand — which is a red of its own, not a note.
  let bad = 0;
  console.log('');
  for (const id of new Set([...Object.keys(fixture.towers || {}), ...ids])) {
    const was = (fixture.towers || {})[id];
    const now = towers[id];
    if (!was) { console.log(`ADDED   ${id} ${now.hash}`); bad++; continue; }
    if (!now) { console.log(`REMOVED ${id} (was ${was.hash})`); bad++; continue; }
    const wasHash = hashOf(was.spec === undefined ? null : was.spec);
    if (was.hash !== wasHash) {
      console.log(`TAMPERED ${id.padEnd(11)} the fixture records ${was.hash} but its own spec `
        + `hashes to ${wasHash} — hand-edited or half-written; re-pin with --write`);
      bad++;
    }
    if (wasHash === now.hash) { console.log(`SAME    ${id.padEnd(12)} ${now.hash}`); continue; }
    bad++;
    console.log(`CHANGED ${id.padEnd(12)} ${wasHash} → ${now.hash}`);
    for (const line of fieldDiff(was.spec, now.spec)) console.log(`    ${line}`);
  }
  console.log(bad === 0
    ? '\nCLEAN: every registered tower asks the engine for exactly what it asked for before'
    : `\nBAD: ${bad} tower spec(s) moved — this change is NOT cosmetic. Re-pin with `
      + '--write only if the portal contract was renegotiated on purpose.');
  if (bad > 0) process.exitCode = 1;
}
