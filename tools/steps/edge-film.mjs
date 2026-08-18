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

// DID THE FILM MOVE? The proof a RENDER-ONLY die change owes (ROADMAP §9c's
// restated invariant, GOALS' one-seed-one-film). Run it before the change and
// after; every line must be character-identical.
//
//   node tools/drive.mjs tools/steps/edge-film.mjs [pools…]
//
// It prints two digests, and they answer different halves of the claim:
//
//  · THE COLLIDER — every vertex and every face index of each die type's
//    CANNON convex hull, at full precision. `createDieBody` builds from
//    `getDie(type).shape`, which comes from the base polyhedron and never from
//    the beveled twin; this is that sentence as a number. If this digest moves,
//    stop — nothing below it means anything, and every recorded film in the
//    repo is a deliberate update.
//  · THE FILM — the whole keyframe array of a seeded throw at 9 decimals, the
//    same canonicalisation `perf-determinism` compares across two tabs. That
//    scenario proves two clients of the SAME build agree; this proves one
//    client agrees with a build from before the change, which is the thing a
//    cross-version room actually needs.
//
// Not a substitute for `perf-determinism` (cross-client) or
// `replay-drift.mjs` (drift within a long-lived tab). This one asks the
// narrow question a mesh edit raises and answers it in ~40 s.

const POOLS = {
  '1d20': ['d20'],
  '8d6': Array(8).fill('d6'),
  '20d6': Array(20).fill('d6'),
  mixed: ['d4', 'd6', 'd8', 'd10', 'd10x', 'd12', 'd20'],
  '40d20': Array(40).fill('d20'),
};
const SEEDS = [1000, 8919, 90090];

// FNV-1a over a string — a digest short enough to eyeball in a commit message.
const fnv = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
};

export default async function edgeFilm(stage, args) {
  const want = args.length ? args[0].split(',') : Object.keys(POOLS);
  const t = await stage.tab('localhost', 'Film');
  await t.settle();

  // --- the collider ------------------------------------------------------
  // Read through `getDie` exactly as createDieBody does, so this cannot drift
  // from the code path that actually builds a body.
  const hulls = JSON.parse(await t.eval(`import('./js/dice.js').then((m) => JSON.stringify(
    m.DIE_TYPES.map((type) => {
      const s = m.getDie(type).shape;
      return {
        type,
        verts: s.vertices.length,
        faces: s.faces.length,
        body: type + ':'
          + s.vertices.map((v) => [v.x, v.y, v.z].map((f) => f.toFixed(12)).join(',')).join(';')
          + '/' + s.faces.map((f) => f.join(',')).join(';'),
      };
    })
  ))`));
  console.log('THE COLLIDER (physics hull per type — must never move)');
  for (const h of hulls) {
    console.log(`  ${h.type.padEnd(5)} ${fnv(h.body)}  verts=${String(h.verts).padStart(2)}  faces=${String(h.faces).padStart(2)}`);
  }
  console.log(`  ALL   ${fnv(hulls.map((h) => h.body).join('#'))}\n`);

  // --- the film ----------------------------------------------------------
  // The same canonicalisation the perf-determinism scenario uses across tabs:
  // every keyframe of every die, 9 decimals, order preserved.
  const HASH = `(() => {
    const r = window.__diceDebug.currentRoll;
    if (!r || !r.keyframes) return null;
    return r.keyframes.map((arr) => arr.map((s) =>
      [s.pos.x, s.pos.y, s.pos.z, s.quat.x, s.quat.y, s.quat.z, s.quat.w]
        .map((f) => f.toFixed(9)).join(',')).join('|')).join('||')
      + '#' + r.frames + '#' + r.dice.length;
  })()`;

  console.log('THE FILM (keyframes at 9 dp — one seed, one film)');
  console.log('pool     seed    frames  keyframe digest');
  console.log('-------  ------  ------  ----------------');
  const lines = [];
  for (const name of want) {
    const types = POOLS[name];
    if (!types) { console.log(`  unknown pool ${name}`); process.exitCode = 1; continue; }
    for (const seed of SEEDS) {
      await t.dbg(`throwSeeded(${JSON.stringify(types)}, ${seed})`);
      await t.waitFor('(window.__diceDebug.sim(120), !window.__diceDebug.busy)',
        { desc: `${name}/${seed} settles`, timeout: 90000 });
      const raw = await t.eval(HASH);
      const frames = raw.split('#')[1];
      const line = `${name.padEnd(7)}  ${String(seed).padEnd(6)}  ${String(frames).padStart(6)}  ${fnv(raw)}`;
      console.log(line);
      lines.push(line);
      await t.dbg('clearTable()');
      await t.dbg('sim(60)');
    }
  }
  console.log(`\nRUN DIGEST  ${fnv(lines.join('\n'))}`);
  console.log('Compare that one line across builds. Anything else is a deliberate update.');
}
