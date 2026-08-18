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

// tests/voices.test.mjs — JOE'S TEN VERDICTS, AS ARITHMETIC.
//
// On 2026-08-18 the owner listened to every sound in this app for the first
// time. Eight of the ten voices needed work and two did not, and his words
// were these:
//
//   A1 The Table       "sounds like white noise mostly"
//   A2 Moonrise Glade  "more white noise, super faint"
//   A3 Foxfire Hollow  "deeper white noise, VERY faint"
//   B1/B2 Heartwood +  "I'd probably switch the bastion and heartwood sounds,
//         Bastion       they feel reversed to what I'd expect"
//   B3 Black Anvil     "Slightly to shrill / clanky for me.."
//   B4 Nullstone       "sounds good"
//   B5 Hollow Bole     "sounds good"
//   C1 Witchlight      "I hate this sound. I'd prefer something far less sharp"
//   C2 Moonrise ground "I hate this sound. I'd prefer something far less sharp"
//   C3 Foxfire ground  "Also to shrill / sharp"
//
// NOBODY WORKING ON THIS CAN HEAR IT — not the agent that changed it and not
// the orchestrator that asked. So every one of those words was turned into a
// property with a number attached (js/voices.js is the ruler), the SHIPPED
// value of that number was frozen into this file as BASELINE_2026_08_17, and
// each assertion below says which direction the word asked for and by how
// much. A change that cannot be shown is a change Joe re-listens to for
// nothing; a change that can be shown is one he re-listens to to say whether
// the DIRECTION was right, which is a much cheaper sitting.
//
// THE BASELINE IS A FROZEN COPY ON PURPOSE, and it is the one place in this
// file where a copy is correct: it is a record of what a human heard on a
// particular day, and it must not follow the tables it is measuring. Every
// other number here is read live out of js/voices.js.

import assert from 'node:assert/strict';
import {
  IMPACT_VOICES, IMPACT_DEFAULT_BODY, CLUNK_VOICES, VENUE_AUDIO,
  BED_PINK, BED_BROWN, BED_CRACKLE, BED_TICK_SHAPE, BED_SWELL,
  PINK_BUFFER_RMS, BROWN_BUFFER_RMS, MATERIAL_BOUNDARY_HZ,
  impactSpectrum, bedProfile, bedDistance, biquadMag,
} from '../js/voices.js';

let n = 0;
const t = (name, fn) => {
  n++;
  try { fn(); } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// ---------------------------------------------------------------------------
// WHAT JOE HEARD, MEASURED — the frozen 2026-08-17 numbers.
// ---------------------------------------------------------------------------
// Produced by running js/voices.js's ruler over the tables as they stood in
// commit a0ddb93, the tree he listened to. `centroidHz` is the geometric
// (log-frequency) centroid; `aboveBoundary` is the share of power above
// §1's 1.5 kHz wood/metal line; `fcHz` is where the resonance actually sits.
const BASELINE_2026_08_17 = {
  // The five tower clunks, on the grounded felt, as B1..B5 were heard.
  clunk: {
    heartwood:  { body: 'clack', fcHz: 1114, centroidHz: 1396, aboveBoundary: 0.317, attackMs: 0 },
    bastion:    { body: 'thud',  fcHz:  338, centroidHz:  239, aboveBoundary: 0.002, attackMs: 0 },
    blackanvil: { body: 'chime', fcHz: 2156, centroidHz: 2487, aboveBoundary: 0.946, attackMs: 0, loudness: 0.011291 },
    nullstone:  { body: 'hush',  fcHz:  500, centroidHz:  294, aboveBoundary: 0.009, attackMs: 0 },
    hollowbole: { body: 'thud',  fcHz:  390, centroidHz:  273, aboveBoundary: 0.003, attackMs: 0 },
  },
  // The C family: ONE voice heard three ways. C1 is the Witchlight die's own
  // chime, C2 and C3 are that same chime with a venue's ground over it — which
  // is itself a finding, see the test below.
  witchlight: {
    table:    { fcHz: 3338, centroidHz: 3719, aboveBoundary: 0.990, partialHz: 1836, attackMs: 0 },
    moonrise: { fcHz: 2403, centroidHz: 2749, aboveBoundary: 0.967, partialHz: 1322, attackMs: 0 },
    foxfire:  { fcHz: 2203, centroidHz: 2536, aboveBoundary: 0.951, partialHz: 1212, attackMs: 0 },
  },
  // The three rooms. Every one of these was computed with the SHIPPED bed
  // constants (pink 0.003, brown 0.006, crackle 0.02 under a u³ law) and no
  // swell layer at all.
  bed: {
    table:    { rmsDbfs: -59.8, centroidHz: 140, eventsPerS: 1.90, pitched: false, swellsPerS: 0 },
    moonrise: { rmsDbfs: -63.7, centroidHz: 100, eventsPerS: 0.35, pitched: false, swellsPerS: 0 },
    foxfire:  { rmsDbfs: -62.5, centroidHz:  82, eventsPerS: 0.80, pitched: false, swellsPerS: 0 },
  },
};

// THE TWO ROOMS HE CALLED FAINT, named rather than inferred: "super faint"
// (A2) and "VERY faint" (A3) are comparatives, and the measurement says what
// they were comparative TO — both ran under the grounded room he had just
// been listening to.
const FAINT = ['moonrise', 'foxfire'];

// The voicing multiplier `impactVoicingOf` resolves for a hard contact:
// (1 − 0.5·weight) × the venue's ground.centre. Re-stated here rather than
// imported because js/main.js cannot be loaded in Node — which is exactly
// why the tables moved to js/voices.js. `tests/e2e` asserts the app applies
// it, through `impactVoicingFor`; this file asserts what it applies it TO.
const centreOf = (weight, groundCentre = 1) => (1 - 0.5 * weight) * groundCentre;
const spectrumOf = (voice, groundCentre = 1) =>
  impactSpectrum(IMPACT_VOICES[voice.body], centreOf(voice.weight, groundCentre));
const pct = (now, was) => Math.round((now / was - 1) * 1000) / 10;

// ---------------------------------------------------------------------------
// 0. THE RULER ITSELF
// ---------------------------------------------------------------------------

t('the ruler agrees with the filters it claims to model', () => {
  // A biquad is unity at its own centre for bandpass and −3 dB for lowpass;
  // if either of these drifts, every centroid in this file is fiction.
  assert.ok(Math.abs(biquadMag('bandpass', 1000, 1000, 2) - 1) < 0.02,
    'a bandpass passes its own centre');
  const lp = biquadMag('lowpass', 700, 700, 0.7071);
  assert.ok(Math.abs(20 * Math.log10(lp) + 3) < 0.6,
    `a Butterworth lowpass is −3 dB at cutoff (got ${(20 * Math.log10(lp)).toFixed(2)} dB)`);
  assert.ok(biquadMag('lowpass', 7000, 700, 0.7071) < biquadMag('lowpass', 700, 700, 0.7071),
    'and it falls above it');
  // …and the centroid of a resonance lands near the resonance.
  const s = impactSpectrum({ filter: 'bandpass', baseFreq: 1000, freqSpread: 0, q: 4 }, 1);
  assert.ok(s.centroidHz > 900 && s.centroidHz < 1300,
    `a Q-4 bandpass at 1 kHz has its log centroid near 1 kHz (got ${s.centroidHz})`);
});

t('the measured buffer RMS constants still describe the generators', () => {
  // js/main.js fills these two buffers; js/voices.js carries their broadband
  // RMS as a constant so the bed's dBFS numbers mean something. If anybody
  // re-tunes a generator, this is what says the level claims went stale.
  // (The fills are reproduced here rather than imported for the same reason
  // the centre formula is: main.js does not load outside a browser. They are
  // short, and a drift in either direction fails.)
  const SR = 48000, N = SR * 4;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, sp = 0;
  for (let i = 0; i < N; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
    const d = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926; sp += d * d;
  }
  let last = 0, sb = 0;
  for (let i = 0; i < N; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    const d = last * 3.5; sb += d * d;
  }
  const pink = Math.sqrt(sp / N), brown = Math.sqrt(sb / N);
  assert.ok(Math.abs(pink - PINK_BUFFER_RMS) < 0.02,
    `pink generator RMS ${pink.toFixed(4)} vs declared ${PINK_BUFFER_RMS}`);
  assert.ok(Math.abs(brown - BROWN_BUFFER_RMS) < 0.03,
    `brown generator RMS ${brown.toFixed(4)} vs declared ${BROWN_BUFFER_RMS}`);
});

// ---------------------------------------------------------------------------
// THE EXTRACTION MOVED NOTHING — the claim this commit exists to make.
// ---------------------------------------------------------------------------
//
// The tables were CUT from js/main.js and PASTED here so they could be
// measured. That is a refactor inside a file 27 000 lines long, in a tree
// other agents are writing to, and the failure mode is obvious: a digit lost
// in the move is a sound nobody can hear changing. So before a single voice
// moves, every row is measured against what Joe actually heard.
//
// The next commits replace these assertions one family at a time, each with a
// direction and a size. Until they do, this file's whole content is "nothing
// changed" — and on a change nobody can hear, that is worth a commit of its
// own.

t('every tower voice still measures exactly what he heard', () => {
  for (const [id, was] of Object.entries(BASELINE_2026_08_17.clunk)) {
    const cv = CLUNK_VOICES[id];
    assert.equal(cv.body, was.body, `${id} kept its body`);
    const now = spectrumOf(cv);
    assert.equal(now.fcHz, was.fcHz, `${id}'s band`);
    assert.equal(now.centroidHz, was.centroidHz, `${id}'s centroid`);
    assert.equal(now.aboveBoundary, was.aboveBoundary, `${id}'s brightness`);
    assert.equal(now.attackMs, was.attackMs, `${id}'s transient`);
  }
});

t('the C family still measures exactly what he heard', () => {
  const witch = { body: 'chime', weight: 0.22 };   // js/themes.js moonmoot.witchlight
  for (const [venue, was] of Object.entries(BASELINE_2026_08_17.witchlight)) {
    const now = spectrumOf(witch, VENUE_AUDIO[venue].ground.centre);
    assert.equal(now.fcHz, was.fcHz, `witchlight on ${venue}: band`);
    assert.equal(now.centroidHz, was.centroidHz, `witchlight on ${venue}: centroid`);
    assert.equal(now.partialHz, was.partialHz, `witchlight on ${venue}: partial`);
    assert.equal(now.attackMs, was.attackMs, `witchlight on ${venue}: transient`);
  }
});

t('the three rooms still measure exactly what he heard', () => {
  for (const [id, was] of Object.entries(BASELINE_2026_08_17.bed)) {
    const now = bedProfile(id);
    assert.equal(now.rmsDbfs, was.rmsDbfs, `${id}: level`);
    assert.equal(now.centroidHz, was.centroidHz, `${id}: colour`);
    assert.equal(now.eventsPerS, was.eventsPerS, `${id}: audible events`);
    assert.equal(now.pitched, was.pitched, `${id}: no event has a note`);
    assert.equal(now.swellsPerS, was.swellsPerS, `${id}: nothing slow moves`);
  }
  // …and the numbers those rest on.
  assert.equal(BED_TICK_SHAPE, 3, 'the tick amplitude law is still u³');
  assert.equal(BED_PINK, 0.003);
  assert.equal(BED_BROWN, 0.006);
  assert.equal(BED_CRACKLE, 0.02);
  assert.ok(BED_SWELL > 0, 'the slow layer has a constant but no room asks for it yet');
});

t('the grounded row is inert BY CONSTRUCTION (venueAudioInfo agrees)', () => {
  // js/main.js's `groundedInert` is a conjunction over exactly these fields
  // and `audio-venue` asserts it is true, so this is the 40 ms copy of a
  // 45-second browser claim.
  const t0 = VENUE_AUDIO.table;
  assert.equal(t0.ground.centre, 1);
  assert.equal(t0.ground.length, 1);
  assert.equal(t0.ground.gain, 1);
  assert.equal(t0.bed.pink, 1);
  assert.equal(t0.bed.brown, 1);
  assert.equal(t0.bed.breathDepth, 0);
  assert.ok(t0.bed.airHz >= 20000);
  assert.equal(t0.bed.tick.gain, 1);
});

t('the default body is untouched, and nothing has grown an attack yet', () => {
  assert.equal(IMPACT_DEFAULT_BODY, 'felt');
  assert.equal(FAINT.length, 2);
  for (const [body, p] of Object.entries(IMPACT_VOICES)) {
    assert.ok(!p.attackMs, `${body} begins on its first sample, as it shipped`);
  }
});

console.log(`voices: ${n} assertions run`);
