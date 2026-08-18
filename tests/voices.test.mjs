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
// B4 / B5 — "sounds good". THE TWO ROWS NOTHING MAY TOUCH.
// ---------------------------------------------------------------------------

t('B4 Nullstone and B5 Hollow Bole are byte-identical to what he approved', () => {
  // These are the only two data points in this whole file of Joe's taste
  // being SATISFIED, which makes them the reference for the others and makes
  // any drift in them a loss of information rather than a change of sound.
  assert.deepEqual(CLUNK_VOICES.nullstone, {
    body: 'hush', weight: 0.75, sustain: 25,
    shaft: { delayS: 0.0045, combGain: 0.34, mode1Hz: 240, mode2Hz: 430 },
  }, 'B4 "sounds good" — Joe, 2026-08-18');
  assert.deepEqual(CLUNK_VOICES.hollowbole, {
    body: 'thud', weight: 0.5, sustain: 35,
    shaft: { delayS: 0.004, combGain: 0.5, mode1Hz: 360, mode2Hz: 720 },
  }, 'B5 "sounds good" — Joe, 2026-08-18');
  // …and their BODIES are untouched too, which is the half a deepEqual on the
  // row cannot see: `hush` and `thud` are shared with die sets.
  for (const [k, base] of [['nullstone', BASELINE_2026_08_17.clunk.nullstone],
    ['hollowbole', BASELINE_2026_08_17.clunk.hollowbole]]) {
    const s = spectrumOf(CLUNK_VOICES[k]);
    assert.equal(s.fcHz, base.fcHz, `${k}'s band did not move`);
    assert.equal(s.centroidHz, base.centroidHz, `${k}'s centroid did not move`);
    assert.equal(s.attackMs, 0, `${k} kept its transient`);
  }
});

// ---------------------------------------------------------------------------
// B1 / B2 — "they feel reversed to what I'd expect". A SWAP, AND ONLY A SWAP.
// ---------------------------------------------------------------------------

t('B1/B2 is literally the two voices exchanging rows — no number moved', () => {
  // Joe's word was "switch", and the finding is that he is right about the
  // physics: a plank box is a resonant drum (low, hollow, with body) and a
  // stone turret is a wall with a turret's mass behind it (short, bright,
  // almost nothing transmitted). The table had wood bright and stone low.
  //
  // The strongest possible statement that this is a swap and not a redesign
  // is that the SET of five voices is conserved exactly. If anybody ever
  // "improves" one of them while swapping, this fails.
  const before = BASELINE_2026_08_17.clunk;
  assert.equal(CLUNK_VOICES.heartwood.body, before.bastion.body,
    'Heartwood now wears what Bastion wore');
  assert.equal(CLUNK_VOICES.bastion.body, before.heartwood.body,
    'and Bastion wears what Heartwood wore');
  const now = spectrumOf(CLUNK_VOICES.heartwood);
  assert.equal(now.fcHz, before.bastion.fcHz,
    `Heartwood's band is Bastion's old band exactly (${now.fcHz} Hz)`);
  assert.equal(now.centroidHz, before.bastion.centroidHz);
  const now2 = spectrumOf(CLUNK_VOICES.bastion);
  assert.equal(now2.fcHz, before.heartwood.fcHz,
    `Bastion's band is Heartwood's old band exactly (${now2.fcHz} Hz)`);
  assert.equal(now2.centroidHz, before.heartwood.centroidHz);
  // The SHAFT travelled with the body — "the sounds", not "the bodies".
  assert.deepEqual(CLUNK_VOICES.heartwood.shaft,
    { delayS: 0.0055, combGain: 0.5, mode1Hz: 300, mode2Hz: 600 },
    'Heartwood took the longer comb and the lower modes with it');
  assert.deepEqual(CLUNK_VOICES.bastion.shaft,
    { delayS: 0.0032, combGain: 0.55, mode1Hz: 430, mode2Hz: 860 },
    'and Bastion took the tighter, brighter one');
  // The direction, stated in the words the complaint used: wood is now the
  // LOW one and stone the BRIGHT one.
  assert.ok(now.centroidHz < now2.centroidHz,
    `the wooden tower is now the lower-voiced of the pair `
    + `(${now.centroidHz} Hz vs ${now2.centroidHz} Hz)`);
});

// ---------------------------------------------------------------------------
// B3 — "Slightly to shrill / clanky". A SMALL MOVE, AND MEASURABLY SMALL.
// ---------------------------------------------------------------------------

t('B3 Black Anvil got less shrill, and only slightly', () => {
  const was = BASELINE_2026_08_17.clunk.blackanvil;
  const now = spectrumOf(CLUNK_VOICES.blackanvil);
  const d = pct(now.centroidHz, was.centroidHz);
  assert.ok(now.centroidHz < was.centroidHz,
    `"shrill" is a centroid claim and it came down (${was.centroidHz} → ${now.centroidHz} Hz)`);
  assert.ok(d <= -8 && d >= -25,
    `and "slightly" is the spec: ${d}% is meant to sit between −8% and −25%, `
    + `where the Witchlight chime beside it takes −35% or more`);
  assert.ok(now.aboveBoundary < was.aboveBoundary - 0.1,
    `and real energy crossed §1's ${MATERIAL_BOUNDARY_HZ} Hz line rather than shuffling `
    + `above it (${was.aboveBoundary} → ${now.aboveBoundary} of power above it)`);
  // "CLANKY" IS THE RESONANCE, and it is a separate number from "shrill":
  // a high-Q band rings on one note, which is what a clank is.
  assert.ok(IMPACT_VOICES[CLUNK_VOICES.blackanvil.body].q < 2.8,
    `"clanky" is Q, and the ring opened out `
    + `(2.8 → ${IMPACT_VOICES[CLUNK_VOICES.blackanvil.body].q})`);
  // …and the third axis: a strike that begins at full gain on sample one.
  assert.ok(now.attackMs >= 4,
    `and the transient got a rise instead of an edge (${now.attackMs} ms)`);
  // IT DID NOT GET QUIETER TO GET DULLER. Loudness is gainScale × the body's
  // broadband gain; holding it is what stops "less shrill" being "turned down".
  const loud = IMPACT_VOICES[CLUNK_VOICES.blackanvil.body].gainScale * now.noiseGain;
  assert.ok(Math.abs(20 * Math.log10(loud / was.loudness)) < 0.5,
    `and it is the same loudness it was, within half a dB `
    + `(${was.loudness.toFixed(6)} → ${loud.toFixed(6)})`);
  // AND IT DID NOT LAND IN B4/B5's LAP. Those two he liked; over-correcting
  // this one into their register would have thrown away the palette's range.
  const bole = spectrumOf(CLUNK_VOICES.hollowbole);
  assert.ok(now.centroidHz > bole.centroidHz * 3,
    `it is still unmistakably the ringing tower, not a drum `
    + `(${now.centroidHz} Hz against Hollow Bole's ${bole.centroidHz} Hz)`);
});

// ---------------------------------------------------------------------------
// C1 / C2 / C3 — "I hate this sound… far less sharp".
// ---------------------------------------------------------------------------

t('the C family is ONE voice, which is why all three rows failed together', () => {
  // THE FINDING BEHIND THE FIX. docs/AUDIO.md §9 lists C1, C2 and C3 as three
  // things to judge, and they are three CONTEXTS of a single body: the
  // Witchlight set's `chime`, then that same chime with each venue's ground
  // multiplier over it. Joe used the same sentence for C1 and C2 and a
  // near-identical one for C3, which is what a single shared cause sounds
  // like — and no ground trim could have rescued it, because the deepest one
  // in the app (×0.66) applied to a 3.4 kHz band still lands at 2.2 kHz.
  assert.equal(IMPACT_VOICES.chime.filter, 'bandpass');
  const deepest = Math.min(...Object.values(VENUE_AUDIO).map((v) => v.ground.centre));
  assert.ok(deepest > 0.6,
    `the deepest ground in the app is ×${deepest} — a multiplier, not a rescue`);
});

t('C1/C2/C3 moved FAR, on all three axes of "sharp"', () => {
  const rows = [['table', 'C1'], ['moonrise', 'C2'], ['foxfire', 'C3']];
  const witch = { body: 'chime', weight: 0.22 };   // js/themes.js moonmoot.witchlight
  for (const [venue, id] of rows) {
    const was = BASELINE_2026_08_17.witchlight[venue];
    const now = spectrumOf(witch, VENUE_AUDIO[venue].ground.centre);
    const d = pct(now.centroidHz, was.centroidHz);
    assert.ok(d <= -30,
      `${id}: "far less sharp" is at least a third off the centroid — `
      + `${was.centroidHz} → ${now.centroidHz} Hz is ${d}%`);
    assert.ok(now.partialHz < was.partialHz * 0.7,
      `${id}: the sine partial welded to its front came down with it `
      + `(${was.partialHz} → ${now.partialHz} Hz)`);
    assert.ok(now.attackMs >= 5,
      `${id}: and it stopped starting at full gain on its first sample `
      + `(${was.attackMs} → ${now.attackMs} ms)`);
  }
  // THE TWO THE PLAYER ACTUALLY HEARS. §9's C section is walked inside the
  // glade, so C2/C3 are the rows with a verdict on them — and both now sit
  // with most of their energy BELOW §1's own boundary, which the shipped
  // voice never did in any venue.
  for (const venue of ['moonrise', 'foxfire']) {
    const now = spectrumOf(witch, VENUE_AUDIO[venue].ground.centre);
    assert.ok(now.aboveBoundary < 0.6,
      `${venue}: most of a landing's energy is now under ${MATERIAL_BOUNDARY_HZ} Hz `
      + `(${now.aboveBoundary} above it, was ${BASELINE_2026_08_17.witchlight[venue].aboveBoundary})`);
  }
});

t('the chime got duller without getting quieter', () => {
  // The cheapest way to fake "less sharp" is to turn a voice down, and the
  // second cheapest is to widen its filter and let the extra bandwidth do it.
  // `gainScale` is untouched and the widened band moves this body's broadband
  // power by under a dB, so whatever Joe hears next sitting is timbre.
  assert.equal(IMPACT_VOICES.chime.gainScale, 0.045,
    'the chime ships at the gain it shipped at');
  const now = impactSpectrum(IMPACT_VOICES.chime, centreOf(0.22));
  const wasNoiseGain = 0.3055;   // the shipped body at the same centre
  assert.ok(Math.abs(20 * Math.log10(now.noiseGain / wasNoiseGain)) < 1,
    `and passes the same broadband power within a dB `
    + `(${wasNoiseGain} → ${now.noiseGain})`);
});

t('the default body and the two he liked kept their transients', () => {
  // The attack is opt-in per body, so this is the claim that the change did
  // not quietly soften the most common sound in the app.
  assert.equal(IMPACT_DEFAULT_BODY, 'felt');
  for (const body of ['felt', 'click', 'thud', 'clack', 'hush', 'crackle']) {
    assert.ok(!IMPACT_VOICES[body].attackMs,
      `${body} still begins on its first sample — it was not complained about`);
  }
  for (const body of ['chime', 'bell']) {
    assert.ok(IMPACT_VOICES[body].attackMs > 0, `${body} has a rise`);
  }
});

// ---------------------------------------------------------------------------
// A1 / A2 / A3 — "white noise", "super faint", "VERY faint".
// ---------------------------------------------------------------------------

t('A1/A2/A3 are audible: every room came up, and the two faint ones most', () => {
  for (const id of ['table', 'moonrise', 'foxfire']) {
    const was = BASELINE_2026_08_17.bed[id];
    const now = bedProfile(id);
    assert.ok(now.rmsDbfs > was.rmsDbfs + 3,
      `${id}: "faint" is a level claim — ${was.rmsDbfs} → ${now.rmsDbfs} dBFS`);
    assert.ok(now.rmsDbfs < -38,
      `${id}: …and still far under a landing, which is the other half of the `
      + `constraint (${now.rmsDbfs} dBFS)`);
  }
  // "SUPER FAINT" AND "VERY FAINT" WERE COMPARATIVE. The two fae rooms ran
  // 4–6 dB under the grounded one because their air filter throws away most
  // of a 1/f spectrum and the row did not compensate. They are now level.
  const [T, M, F] = ['table', 'moonrise', 'foxfire'].map(bedProfile);
  assert.ok(Math.abs(T.rmsDbfs - M.rmsDbfs) < 2.5,
    `the clearing is no longer quieter than the room (${M.rmsDbfs} vs ${T.rmsDbfs} dBFS)`);
  assert.ok(Math.abs(T.rmsDbfs - F.rmsDbfs) < 2.5,
    `nor is the hollow (${F.rmsDbfs} vs ${T.rmsDbfs} dBFS)`);
});

t('A1/A2/A3 stopped being white noise: something HAPPENS in every room', () => {
  // The finding: steady broadband noise reads as "white noise" however you
  // tilt it, so three rooms that differ only in tilt are one texture at three
  // volumes — which is exactly the three sentences Joe wrote. A place is made
  // of EVENTS. This is the count of events per second that clear the room's
  // own hiss by 6 dB.
  for (const id of ['table', 'moonrise', 'foxfire']) {
    const was = BASELINE_2026_08_17.bed[id];
    const now = bedProfile(id);
    assert.ok(now.eventsPerS >= 0.6,
      `${id}: at least one audible event every two seconds (${now.eventsPerS}/s, `
      + `was ${was.eventsPerS}/s) — under that a room is hiss with a rumour`);
    assert.ok(now.eventPeakDb >= 6,
      `${id}: the median audible event stands ${now.eventPeakDb} dB over the bed`);
  }
  // THE TWO FAINT ROOMS AT LEAST DOUBLED, which is where the complaint was:
  // one drip every three seconds is a room in which nothing happens. The
  // hearth's rate is deliberately NOT chased — it was already firing ~2/s and
  // "white noise mostly" was not a plea for more sparks; it was a room too
  // quiet to hear them in, with nothing slow moving underneath.
  for (const id of FAINT) {
    const was = BASELINE_2026_08_17.bed[id];
    const now = bedProfile(id);
    assert.ok(now.eventsPerS >= was.eventsPerS * 1.8,
      `${id}: audible events went ${was.eventsPerS}/s → ${now.eventsPerS}/s`);
  }
  // THE AMPLITUDE LAW is the mechanism, and it is one exponent. u³ has a
  // median of 1/8: half of every room's events used to arrive under its hiss.
  assert.ok(BED_TICK_SHAPE < 3,
    `the tick law came off u³ (now u^${BED_TICK_SHAPE}, median ` +
    `${Math.pow(0.5, BED_TICK_SHAPE).toFixed(2)} of peak against u³'s 0.13)`);
  // …and the SLOW layer, which is the other half of "a place": motion.
  for (const id of ['table', 'moonrise', 'foxfire']) {
    const now = bedProfile(id);
    assert.ok(now.swellsPerS > 0,
      `${id}: the room moves — a swell every ${Math.round(1 / now.swellsPerS)} s`);
    assert.ok(now.swellDepthDb >= 4 && now.swellDepthDb <= 16,
      `${id}: and it moves ${now.swellDepthDb} dB, which is a breath rather `
      + `than a second bed or a gesture nobody notices`);
  }
});

t('the three rooms are three ROOMS — and they differ in what HAPPENS', () => {
  // The test Joe's three near-identical sentences say the old table failed.
  // No formula knows what a listener can name, so what is counted is which
  // axes two rooms differ on — and the ones that matter are the EVENT axes.
  // The shipped rooms differed mostly on level and colour, which is the same
  // sound louder or darker, which is what "more white noise / deeper white
  // noise" is the sound of.
  const pairs = [['table', 'moonrise'], ['table', 'foxfire'], ['moonrise', 'foxfire']];
  for (const [a, b] of pairs) {
    const d = bedDistance(a, b);
    assert.ok(d.nEvent >= 3,
      `${a} vs ${b}: only ${d.nEvent} of 5 EVENT axes apart `
      + `(${JSON.stringify(d.event)})`);
    // …and the rooms are now level-matched, so none of that distinctness is
    // being done by volume. That is the point of the make-up gains: a room
    // that is only quieter is not another room.
    assert.equal(d.texture.level, false,
      `${a} vs ${b}: and none of it is volume (${d.a.rmsDbfs} vs ${d.b.rmsDbfs} dBFS)`);
  }
  // The identity cue that costs the least and carries the most: a drip has a
  // note, a spark does not. Not one room had this before.
  assert.equal(bedProfile('table').pitched, false, 'a spark has no note');
  assert.equal(bedProfile('moonrise').pitched, true, 'a drip does');
  assert.equal(bedProfile('foxfire').pitched, true, 'and so does water into water');
  for (const id of ['table', 'moonrise', 'foxfire']) {
    assert.equal(BASELINE_2026_08_17.bed[id].pitched, false,
      `${id} had no pitched event at all on the tree he listened to`);
  }
});

t('the grounded row is still inert BY CONSTRUCTION (venueAudioInfo agrees)', () => {
  // js/main.js's `groundedInert` is a conjunction over exactly these fields,
  // and `audio-venue` asserts it is true. The rooms got louder because the
  // DIALS moved; if a future pass reaches for the table row instead, that
  // scenario goes red in a browser and this goes red in 40 ms.
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

t('a venue may re-balance the room and may never turn it up', () => {
  // §5's mix plan is the ceiling and the venue rows sit under it. The bed
  // levels are Joe's dials; `pink`/`brown` are multipliers of them, and the
  // make-up gain the fae rooms now carry is a correction for a FILTER, which
  // is why it is allowed to exceed 1 while the ground row's is not.
  assert.ok(BED_PINK > 0 && BED_BROWN > 0 && BED_CRACKLE > 0 && BED_SWELL > 0);
  for (const [id, v] of Object.entries(VENUE_AUDIO)) {
    assert.ok(v.ground.centre <= 1 && v.ground.length <= 1 && v.ground.gain <= 1,
      `${id}: the ground only ever subtracts`);
    assert.ok(v.bed.pink <= 2 && v.bed.brown <= 1,
      `${id}: and the bed's make-up gain stays inside the plan`);
    assert.ok(v.bed.swell === null || v.bed.swell.rate > 0,
      `${id}: a declared swell has a clock`);
  }
});

console.log(`voices: ${n} assertions run`);
