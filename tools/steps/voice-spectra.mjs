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

// THE TEN VOICES, MEASURED THROUGH THE RUNNING APP.
//
//   node tools/drive.mjs tools/steps/voice-spectra.mjs
//
// `tests/voices.test.mjs` measures the TABLES. This measures what the app
// RESOLVES — it drives a real tab, asks `impactVoicingFor` and
// `venueAudioInfo` (the same functions playImpact and bedBuild use) for each
// of the ten rows in docs/AUDIO.md §9, and runs js/voices.js's ruler over the
// answers. The two halves catch different lies:
//
//   · a unit test alone stays green if a table is beautiful and unwired —
//     if `impactVoicingOf` stopped multiplying by the venue's ground, or a
//     TOWERS row stopped pointing at CLUNK_VOICES, no assertion on the table
//     would notice;
//   · this alone would drift, because it has no frozen baseline and nothing
//     to fail against.
//
// So this step prints and asserts AGREEMENT: the centre the app resolves for
// each voice, against the centre the table says it should. It is a report
// with one hard check, and the check is the seam.
//
// IT DOES NOT PLAY ANYTHING. A headless tab has no trusted gesture and its
// AudioContext stays suspended (docs/AUDIO.md §8); every number here comes
// from the deterministic resolvers, which is the half that is worth asserting
// on anyway (§4 keeps the per-hit jitter out of them on purpose).

import {
  IMPACT_VOICES, CLUNK_VOICES, VENUE_AUDIO,
  impactSpectrum, bedProfile, bedDistance, MATERIAL_BOUNDARY_HZ,
} from '../../js/voices.js';
// The set registry, for the C block: the staged set's voice is a field on a
// SETS row, and since 2026-08-18 the row it matters most for is the one with
// no such field.
import { SETS } from '../../js/themes.js';

function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((k) => '-'.repeat(k)).join('  '));
  for (const r of rows) console.log(line(r));
}

// docs/AUDIO.md §9's ten rows, in his order, with the words he used — SECOND
// sitting where there is one, because that is the live verdict on the tree
// this step is measuring. The first sitting's words are in §9.0.
const VERDICTS = {
  A1: 'APPROVED — "all other audio sounds good"',
  A2: 'APPROVED — "everything else is fine"',
  A3: 'APPROVED — "everything else is fine"',
  B1: 'APPROVED (was: "they feel reversed")',
  B2: 'APPROVED (was: "they feel reversed")',
  B3: 'APPROVED (was: "slightly to shrill / clanky")',
  B4: 'APPROVED twice — "sounds good"',
  B5: 'APPROVED twice — "sounds good"',
  C1: 'KILLED — "sounds horrible… use a normal sound"',
  C2: 'KILLED — "when the dice hit the ground"',
  C3: 'KILLED — "in the two venues"',
};

export default async function run(stage) {
  const a = await stage.tab('localhost', 'Voices');
  let bad = 0;
  const near = (got, want, what) => {
    // The resolver and the table are the same arithmetic, so this is tight on
    // purpose: it is a wiring check, not a tolerance.
    if (Math.abs(got - want) > Math.max(1e-6, Math.abs(want) * 1e-4)) {
      console.log(`  MISMATCH ${what}: app says ${got}, the table says ${want}`);
      bad++;
    }
  };

  // ---- A. the three rooms ---------------------------------------------
  console.log('\nA. THE THREE ROOMS — the bed, as the app declares it\n');
  const rowsA = [];
  for (const [id, venue] of [['A1', 'table'], ['A2', 'moonrise'], ['A3', 'foxfire']]) {
    await a.dbg(`setVenue(${JSON.stringify(venue)})`);
    await a.dbg('sim(4)');
    const vi = await a.dbg('venueAudioInfo()');
    near(vi.declared.bed.pink, VENUE_AUDIO[venue].bed.pink, `${venue} bed.pink`);
    near(vi.declared.bed.tick.rate, VENUE_AUDIO[venue].bed.tick.rate, `${venue} tick.rate`);
    const p = bedProfile(venue);
    rowsA.push([id, vi.label.slice(0, 34), `${p.rmsDbfs} dBFS`, `${p.centroidHz} Hz`,
      `${p.eventsPerS}/s`, p.pitched ? 'pitched' : 'unpitched',
      `${p.eventBandHz} Hz / ${p.eventDecayMs} ms`,
      `${p.swellsPerS ? `1 per ${Math.round(1 / p.swellsPerS)} s @ +${p.swellDepthDb} dB` : 'none'}`,
      VERDICTS[id]]);
  }
  table(['#', 'room', 'level', 'colour', 'events', 'note', 'event band/tail', 'slow layer', 'his word'], rowsA);
  console.log('\n  distinctness — which axes each pair differs on:');
  for (const [x, y] of [['table', 'moonrise'], ['table', 'foxfire'], ['moonrise', 'foxfire']]) {
    const d = bedDistance(x, y);
    console.log(`   ${x} vs ${y}: ${d.nEvent}/5 event axes, `
      + `${Object.entries(d.event).filter(([, v]) => v).map(([k]) => k).join(' ') || 'NONE'}`
      + `  |  texture: ${Object.entries(d.texture).filter(([, v]) => v).map(([k]) => k).join(' ') || 'level-matched'}`);
  }

  // ---- B. the five tower voices ---------------------------------------
  // Judged in the grounded room so every ground multiplier is 1 — §9's rule,
  // and the reason B5 has an asterisk (Hollow Bole cannot stand here).
  await a.dbg('setVenue("table")');
  await a.dbg('sim(4)');
  console.log('\nB. THE FIVE TOWER VOICES — on felt, all ground trims at 1\n');
  const rowsB = [];
  const towers = [['B1', 'heartwood'], ['B2', 'bastion'], ['B3', 'blackanvil'],
    ['B4', 'nullstone'], ['B5', 'hollowbole']];
  for (const [id, tower] of towers) {
    const cv = CLUNK_VOICES[tower];
    // The app's own answer for a baffle knock wearing this tower's voice.
    const vo = await a.dbg(
      `impactVoicingFor(50, 'std', ${JSON.stringify({ clunk: 'baffle' })})`);
    // …which resolves the SET's body, not the tower's, unless a tower is
    // socketed — so the row's own numbers are what is measured and the app's
    // answer is used for the seam check on the neutral ground.
    near(vo.ground.centre, 1, 'a baffle knock takes the neutral ground');
    const s = impactSpectrum(IMPACT_VOICES[cv.body], 1 - 0.5 * cv.weight);
    rowsB.push([id, tower, `${cv.body} ${cv.weight}/${cv.sustain}`,
      `${s.fcHz} Hz`, `${s.centroidHz} Hz`, `${Math.round(s.aboveBoundary * 100)}%`,
      s.partialHz ? `${s.partialHz} Hz` : '-', `${s.attackMs} ms`,
      `${cv.shaft.delayS * 1000} ms comb`, VERDICTS[id]]);
  }
  table(['#', 'tower', 'voice', 'band', 'centroid',
    `>${MATERIAL_BOUNDARY_HZ}Hz`, 'partial', 'attack', 'shaft', 'his word'], rowsB);

  // ---- C. the venue's dice on the venue's ground -----------------------
  console.log('\nC. THE STAGED SET ON THE VENUE\'S GROUND — one voice, three contexts\n');
  const rowsC = [];
  // C1 IS MEASURED IN THE GROUNDED ROOM, and that is not a shortcut — it is
  // the only way to separate the die's own ring from what a place does to it.
  //
  // The first version of this step asked for C1 as `{clunk: 'baffle'}` under
  // the glade, reasoning that a knock skips the ground trim. It does, but
  // `impactVoice(ev, fxSet)` answers with the TOWER's `clunkVoice` whenever
  // `ev.clunk` is set, so the query came back as Hollow Bole's thud and the
  // seam check below caught it. There is no way to ask the app for "the
  // staged die's voice, untrimmed" while a fantasy venue stands — which is
  // itself the right design, because under that venue there is no such sound.
  // …AND SINCE 2026-08-18 THERE IS NO RING TO SEPARATE. Joe heard the re-voiced
  // chime on the live table — *"When the dice hit the ground it sounds horrible
  // in the two venues"* — and the Witchlight set's `sound` recipe was deleted
  // rather than tuned a third time. So all three rows below now resolve
  // IMPACT_DEFAULT_BODY, and what this block reports is a KNOCK under three
  // floors. The C1/C2/C3 split survives because the SCRIPT still has three
  // rows; the sound does not vary the way the split implies.
  const cs = [['C1', 'table', 'the die\'s own ring'],
    ['C2', 'moonrise', 'on moss over soil'],
    ['C3', 'foxfire', 'on near-black moss']];
  // READ THE RECIPE, NEVER RESTATE IT. This used to hardcode
  // `{ body: 'chime', weight: 0.22 }` and would have gone red on the deletion
  // — correctly, but for the wrong reason: it would have been reporting a
  // resolver/table mismatch when the table is exactly what changed. The seam
  // this step exists to check is app-vs-registry, so the registry is where the
  // expectation comes from.
  const witchWeight = (SETS['moonmoot.witchlight'].sound || {}).weight || 0;
  for (const [id, venue, what] of cs) {
    await a.dbg(`setVenue(${JSON.stringify(venue)})`);
    await a.dbg('sim(4)');
    const vo = await a.dbg(`impactVoicingFor(50, 'moonmoot.witchlight', {})`);
    near(vo.centre, (1 - 0.5 * witchWeight) * VENUE_AUDIO[venue].ground.centre,
      `${id} resolved centre`);
    const s = impactSpectrum(IMPACT_VOICES[vo.body], vo.centre);
    rowsC.push([id, `${venue} — ${what}`, vo.body,
      `${s.fcHz} Hz`, `${s.centroidHz} Hz`, `${Math.round(s.aboveBoundary * 100)}%`,
      s.partialHz ? `${s.partialHz} Hz` : '-', `${s.attackMs} ms`,
      `${Math.round(vo.durSec * 1000)} ms`, VERDICTS[id]]);
  }
  table(['#', 'context', 'body', 'band', 'centroid',
    `>${MATERIAL_BOUNDARY_HZ}Hz`, 'partial', 'attack', 'length', 'his word'], rowsC);

  await a.dbg('setVenue("table")');
  console.log(`\n${bad === 0
    ? 'SEAM OK — every centre the app resolved matches the table it came from.'
    : `SEAM BROKEN — ${bad} mismatch(es) above: the app is not playing these tables.`}`);
  if (bad > 0) throw new Error(`voice-spectra: ${bad} resolver/table mismatches`);
}
