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

// DOES THE SKIN HIDE WHAT THE CONTRACT SAYS IT MUST? (docs/TOWER.md §4.)
// Headless, geometric, no screenshots: for every shipped camera eye
// (ZOOM_PRESETS full + mini) it shoots rays at a grid of sample points and
// reports how many are behind opaque skin.
//
// Two of the four bands are HARD — the shaft around the despawn line, and
// the COWL BAND, which is sampled IN THE BORE and capped at a despawning
// die's top (despawnY + a d20's radius), not over the mouth. That cap is the
// contract's own arithmetic: a die vanishes when its CENTRE crosses despawnY,
// so "the vanish is unwatchable" means everything below centre + radius is
// hidden. Above that line a die is in open air, falling, and MEANT to be
// seen — which is why the band hangs down from the cap rather than riding
// over the rim. (It rode over the rim until the Hollow Bole: every ray its
// crown curtain was carrying sat in the sky above a broken crown.)
//
// EXIT and HOOD are reported rather than gated, and the exemption is now
// DERIVED PER POINT instead of asserted from a constant. It used to read
// "the doorway stays clear up to y ≥ 3.4·S" — a number in the wrong units
// (3.4 is a raw-unit rung of the audit's classifier ladder, not 3.4·S) that
// happened to sit just under the classic tower's real 4.5 head and therefore
// never noticed a legal LOW door. The Hollow Bole declares clearH 3.5, which
// is below where every shipped eye's sightline crosses the wall plane, so on
// that tower the excuse was simply false and nothing said so.
//
// What is computed instead, for each missed point: where the eye→point ray
// crosses the back-wall plane, and whether that crossing is inside the
// doorway the ENGINE actually cut (|x| ≤ door.w/2, y ≤ door.h — the doorL /
// doorR / lintel boxes, which are centred at x 0 whatever out.x says).
//
//   · IN FRONT  the point is at or forward of the wall plane, so no ray to it
//               ever crosses solid. Nothing legal can occlude it.
//   · DOORWAY   the sightline enters through the opening the contract
//               REQUIRES to stay clear. A miss is the contract working.
//   · SOLID     the sightline crosses the wall plane above the head or
//               outside the jambs. The doorway argument does not reach it.
//
// SOLID is printed with the point and the crossing height and is NOT a
// failure, for one honest reason: a declared portal is a MINIMUM clear
// opening, and a model's real mouth may legally be bigger and raggeder than
// the rectangle it declares (the Hollow Bole's torn wound is the shipped
// case). Geometry alone cannot tell that apart from a hole in a facade — but
// a reviewer can, in one line, which is the whole difference from the silence
// this replaces.
//
// It proves ANY registered skin, not just the first one: pass a tower id and
// the lab is rebuilt wearing it. Every model has to answer this question
// before it ships, and the answer is counted rather than looked at.
//
//   node tools/drive.mjs tools/steps/tower-occlusion.mjs [towerId]

const r2 = (n) => Number(n.toFixed(2));

// Where the eye→point ray meets the back-wall plane, and what that says about
// the miss. Pure arithmetic on numbers the engine handed over — no literals.
function classify(eye, p, { z0, head, halfW }) {
  if (p[2] >= z0 - 1e-9) return { cls: 'front' };
  const t = (z0 - eye[2]) / (p[2] - eye[2]);
  // An eye at or behind the wall plane is not a shipped camera; say so rather
  // than dividing a verdict out of it.
  if (!(t > 0 && t < 1)) return { cls: 'odd' };
  const x = eye[0] + (p[0] - eye[0]) * t;
  const y = eye[1] + (p[1] - eye[1]) * t;
  const through = Math.abs(x) <= halfW + 1e-9 && y <= head + 1e-9 && y >= -1e-9;
  return { cls: through ? 'doorway' : 'solid', x: r2(x), y: r2(y) };
}

export default async function run(stage, args) {
  const tower = args[0] || 'heartwood';
  const a = await stage.tab('localhost', 'TowerOcclusion');
  await a.dbg('holdClock(true)');
  await a.dbg('towerEcho(false)');
  await a.dbg('towerCore(true)');
  let res = await a.dbg(`towerOcclusionCheck(${JSON.stringify(tower)})`);
  // A BAKED ROW MAY NOT BE HERE YET (C6). The probe answers {pending} rather
  // than grading whatever the bench is wearing, so this waits for the model
  // instead of reporting it as the wrong skin — which is what the `res.skin`
  // guard below would otherwise say, naming 'undefined' as the tower.
  for (let i = 0; res && res.pending && i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    res = await a.dbg(`towerOcclusionCheck(${JSON.stringify(tower)})`);
  }
  if (res && res.pending) {
    const st = await a.dbg(`towerModelStatus(${JSON.stringify(tower)})`);
    console.log(`BAD: '${tower}' never loaded its model (${JSON.stringify(st)})`);
    process.exitCode = 1;
    return;
  }
  if (res.skin !== tower) {
    console.log(`BAD: asked for '${tower}', the lab is wearing '${res.skin}'`);
    process.exitCode = 1;
    return;
  }

  // THE DOOR COMES FROM THE SPEC, NOT FROM A NUMBER TYPED HERE. Read after
  // the skin is confirmed, so it is this tower's own core.
  const spec = await a.dbg(`towerPortalSpec(${JSON.stringify(tower)})`);
  if (!spec) {
    console.log(`BAD: '${tower}' has no portal spec — nothing to derive the doorway from`);
    process.exitCode = 1;
    return;
  }
  const door = spec.derived.door;
  const geom = { z0: res.z0, head: door.h, halfW: door.w / 2 };
  // The probe runs on the LAB's mat and the spec is evaluated at the current
  // one. They are the same mat here (the lab is up), and if they ever are not
  // the plane below is the wrong plane — so say it rather than assume it.
  if (Math.abs(spec.derived.z0 - res.z0) > 1e-9) {
    console.log(`NOTE: the spec's z0 (${spec.derived.z0}) is not the probe's (${res.z0}); `
      + "the doorway plane follows the PROBE's mat");
  }
  if (spec.portals.out.x !== 0) {
    console.log(`NOTE: out.x=${spec.portals.out.x} moves the exit lane, but the engine's own `
      + 'doorway boxes are centred at x 0 — the aperture below follows the doorway as BUILT');
  }
  // The engine may grow fields (the invisible-carrier masking pass adds one).
  // Name anything this step does not know about instead of ignoring it: a
  // silently dropped field is how a probe starts answering a stale question.
  const known = new Set(['skin', 'z0', 'despawnY', 'eyes', 'cowlY', 'pending', 'id']);
  const extras = Object.keys(res).filter((k) => !known.has(k));
  if (extras.length) {
    for (const k of extras) console.log(`NOTE: probe also reports ${k}=${JSON.stringify(res[k])}`);
  }

  // The cowl band's sample heights, printed: they are derived from the rim AND
  // capped at the despawning die's top, so on a tall-mouthed tower they are
  // nowhere near the cowl VOLUME and a reader comparing the two needs to see
  // the numbers. Prefer the probe's own copy if it grows one.
  // Rounded for reading: a portal that came off a baked mesh is a float32, so
  // a declared 9.40 rim prints as 9.399999618530273 and buries the report.
  const cowlY = res.cowlY || spec.derived.cowlY;
  console.log(`skin=${res.skin} z0=${r2(res.z0)} despawnY=${r2(res.despawnY)} `
    + `rimY=${r2(spec.derived.rimY)}`);
  console.log(`door w=${door.w} head=${door.h} sill=${door.sill}  `
    + `cowl band y=[${cowlY.map(r2)}]  (cap = despawnY + a d20 radius)\n`);

  const pct = (b) => `${b.blocked}/${b.n}`;
  let bad = 0, solid = 0;
  const solidLines = [];
  for (const e of res.eyes) {
    const hardOk = e.shaft.blocked === e.shaft.n && e.cowl.blocked === e.cowl.n;
    if (!hardOk) bad++;
    // THE SOFT BANDS, EXPLAINED RATHER THAN EXCUSED.
    const tally = { front: 0, doorway: 0, solid: 0, odd: 0 };
    for (const band of ['exit', 'hood']) {
      for (const p of (e[band] || {}).missed || []) {
        const c = classify(e.eye, p, geom);
        tally[c.cls]++;
        if (c.cls === 'solid') {
          solid++;
          solidLines.push(`  ${e.id.padEnd(12)} ${band} (${p}) crosses the wall at `
            + `x=${c.x} y=${c.y} — above the ${door.h} head or outside the ±${door.w / 2} jambs`);
        }
      }
    }
    console.log(
      `${hardOk ? 'PASS' : 'FAIL'} ${e.id.padEnd(12)} eye=(${e.eye.join(',')})  `
      + `shaft ${pct(e.shaft)}  cowl ${pct(e.cowl)}   `
      + `[exit ${pct(e.exit)}  hood ${pct(e.hood)}  `
      + `misses: ${tally.doorway} doorway, ${tally.front} in front`
      + `${tally.solid ? `, ${tally.solid} SOLID` : ''}${tally.odd ? `, ${tally.odd} odd` : ''}]`);
    // WHICH rays leak, not just how many — the probe already names every
    // missed point precisely, and throwing that away turned "97/99 somewhere"
    // into a hunt. A hard-band leak prints its points here.
    for (const band of ['shaft', 'cowl']) {
      const m = (e[band] || {}).missed || [];
      if (m.length) console.log(`     ${band} leaks at ${JSON.stringify(m)}`);
    }
  }

  if (solidLines.length) {
    console.log(`\nSOFT: ${solid} exit/hood miss(es) the doorway does not explain — the `
      + "sightline crosses the wall plane where the contract expects solid. Legal if the "
      + "model's real mouth is bigger than the portal it declares; a hole otherwise:");
    for (const l of solidLines) console.log(l);
  } else {
    console.log('\nSOFT: every exit/hood miss is the doorway or open air in front of the wall');
  }
  console.log(bad === 0
    ? `CLEAN: ${res.skin} occludes shaft + cowl at every shipped eye`
    : `BAD: ${res.skin} leaks the shaft or the cowl at ${bad} eye(s)`);
  if (bad > 0) process.exitCode = 1;
}
