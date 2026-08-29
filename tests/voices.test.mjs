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

// tests/voices.test.mjs — JOE'S VERDICTS, AS ARITHMETIC.
//
// TWO SITTINGS ON 2026-08-18. The second one is the one that decides what this
// file is now for, so it goes first:
//
//   "I still dislike the clankyness of the Moonrise glade and Foxfire
//    Hollow. Just use a normal sound I think.. The idea you had was fun
//    but unfortunately is just not working. All other audio sounds good."
//   …and, asked which part: "When the dice hit the ground it sounds
//    horrible in the two venues. Everything else is fine."
//
// So this file changed job. It used to argue that eight complaints had been
// answered in the direction each word asked for. Now:
//
//   · EIGHT VOICES ARE APPROVED — A1/A2/A3, the three room beds, and B1..B5,
//     all five tower clunks. Those assertions are no longer "it moved the
//     right way"; they are FREEZES. `APPROVED_2026_08_18` below is the
//     record, and anything that moves those numbers is a regression against a
//     human verdict rather than a redesign.
//   · THE RINGING DIE IS KILLED. The C rows were the Witchlight set's `chime`
//     recipe; the recipe is deleted (js/themes.js) and the fae venues' dice
//     now land on IMPACT_DEFAULT_BODY. The C assertions below no longer
//     measure a chime at all — they assert there is no longer a chime to
//     measure, which is a different and stronger claim.
//
// ONE CORRECTION THIS FILE OWES ITS READER, because it was nearly acted on: a
// first reading of *"clankyness of the Moonrise glade and Foxfire Hollow"*
// took it for the fae bed DRIPS, which are pitched and sit at Q 6 and Q 7 —
// genuinely the narrowest resonances in the app. That reading was wrong. He
// named the venues, not the beds, and the beds are approved. The drips stay.
//
// THE FIRST SITTING, kept because BASELINE_2026_08_17 is measured against it:
// he listened to every sound in the app for the first time, eight of the ten
// voices needed work and two did not, and his words were these:
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
  CLOTH_VOICES, CLOTH_DEFAULT, clothVoiceFor, settleTail, TAP_E, TAP_T0,
} from '../js/voices.js';
// THE SET REGISTRY ITSELF, because the kill is the ABSENCE of a field on one
// row and nothing in js/voices.js can see that. `SETS` and not `THEMES`: it is
// the flattened map `impactVoice` actually reads, so a recipe that came back
// through some other door would still be caught. js/themes.js is pure data
// with no three.js import, so unlike js/main.js it loads in Node.
import { SETS } from '../js/themes.js';

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

// ---------------------------------------------------------------------------
// WHAT HE APPROVED — the second sitting, 2026-08-18. A DIFFERENT KIND OF
// CONSTANT FROM THE ONE ABOVE.
// ---------------------------------------------------------------------------
// BASELINE_2026_08_17 is a record of a sound that was WRONG, kept so a fix can
// be shown to have moved. This is a record of sounds that are RIGHT, and it is
// the first one this palette has ever had. It is not a target to move toward;
// it is a fence. Every number here is re-derived live from js/voices.js below
// and asserted EQUAL, so the failure mode it catches is drift rather than
// direction — an agent "improving" an approved voice, which is the single
// cheapest way to lose an hour of Joe's time that has already been spent.
//
// "All other audio sounds good" / "Everything else is fine" is the sign-off,
// and it covers eight voices: the three room beds and the five tower clunks.
// It does NOT cover the C rows — those are the thing he called horrible.
const APPROVED_2026_08_18 = {
  // A1/A2/A3. Frozen on the fields `bedProfile` publishes, which is where the
  // level fix (×5, −59.8 → −45.9 dBFS), the u^1.6 tick law, the fae make-up
  // gains, the PITCHED drips and the new swell layer all show up. Freezing
  // `pitched: true` on the two fae rooms is deliberate and slightly pointed:
  // the pitched drip was very nearly deleted on a misreading of his sentence,
  // and this line is what would have caught that.
  bed: {
    table: { rmsDbfs: -45.9, centroidHz: 140, eventsPerS: 2.15, pitched: false, swellsPerS: 0.08 },
    moonrise: { rmsDbfs: -47.5, centroidHz: 125, eventsPerS: 0.72, pitched: true, swellsPerS: 0.085 },
    foxfire: { rmsDbfs: -47.5, centroidHz: 93, eventsPerS: 1.69, pitched: true, swellsPerS: 0.05 },
  },
  // B1..B5, as rows rather than as spectra: the whole point of the B verdicts
  // was WHICH TOWER WEARS WHICH VOICE (the B1/B2 swap) and how far B3 moved,
  // so the row is the thing he judged. B4 and B5 had "sounds good" from the
  // FIRST sitting too and are now approved twice over.
  clunk: {
    heartwood: { body: 'thud', weight: 0.7, sustain: 40 },
    bastion: { body: 'clack', weight: 0.35, sustain: 20 },
    blackanvil: { body: 'bell', weight: 0.55, sustain: 70 },
    nullstone: { body: 'hush', weight: 0.75, sustain: 25 },
    hollowbole: { body: 'thud', weight: 0.5, sustain: 35 },
  },
};

// WHAT HE REJECTED, measured — the C rows as the FIRST pass left them, which
// is the tree he heard on the live table when he said "horrible".
//
// This block is the evidence that the kill is a kill and not impatience. The
// first sitting said "far less sharp" and got it: the chime came down 3400 →
// 1750 with its Q opened out and 7 ms of attack, and by the numbers below a
// glade landing had already lost 37% of its centroid and dropped from 97% to
// 54% of its energy above the wood/metal line. He listened to THAT and said it
// still sounds horrible. A third re-tuning was the obvious next move and it is
// the move these numbers refuse.
const REJECTED_2026_08_18 = {
  table: { fcHz: 1802, centroidHz: 2344, aboveBoundary: 0.827, partialHz: 991, attackMs: 7 },
  moonrise: { fcHz: 1298, centroidHz: 1745, aboveBoundary: 0.538, partialHz: 714, attackMs: 7 },
  foxfire: { fcHz: 1189, centroidHz: 1612, aboveBoundary: 0.461, partialHz: 654, attackMs: 7 },
};

// The voicing multiplier `impactVoicingOf` resolves for a hard contact:
// (1 − 0.5·weight) × the venue's ground.centre. Re-stated here rather than
// imported because js/main.js cannot be loaded in Node — which is exactly
// why the tables moved to js/voices.js. `tests/e2e` asserts the app applies
// it, through `impactVoicingFor`; this file asserts what it applies it TO.
const centreOf = (weight, groundCentre = 1) => (1 - 0.5 * weight) * groundCentre;
// …and the FALLBACK half of it, which used to be untested because every caller
// passed a body. It is load-bearing now: the fae venues' landing voice IS the
// fallback (the Witchlight recipe was deleted 2026-08-18), so `spectrumOf({})`
// has to walk the same two defaults `impactPresetOf` + `impactVoicingOf` do —
// an absent body resolves IMPACT_DEFAULT_BODY, an absent weight is 0.
const spectrumOf = (voice, groundCentre = 1) => {
  const body = (voice && IMPACT_VOICES[voice.body]) ? voice.body : IMPACT_DEFAULT_BODY;
  const weight = voice ? (voice.weight || 0) : 0;
  return impactSpectrum(IMPACT_VOICES[body], centreOf(weight, groundCentre));
};
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
// THE EIGHT APPROVALS — "All other audio sounds good" (Joe, 2026-08-18).
// ---------------------------------------------------------------------------

t('the eight approved voices are exactly what he approved', () => {
  // THE FIRST SIGN-OFF THIS PALETTE HAS EVER HAD, and the whole point of
  // writing it down is that approval is the scarcest thing in this file. Nine
  // voices were unheard for the life of the project; getting a verdict cost an
  // hour of Joe's time and two sittings. Losing one to a well-meant tweak is
  // not a bug you find later — the information is simply gone, and the only
  // way back is to spend the hour again.
  //
  // So: EQUALITY, not tolerance, and against a frozen copy rather than against
  // the tables themselves.
  //
  // A1/A2/A3 — the three room beds. Every field here is a thing the first pass
  // moved and he then blessed: the ×5 level (−59.8 → −45.9 dBFS), the u^1.6
  // tick law, the fae make-up gains, the swell layer, and `pitched: true` on
  // the two fae rooms.
  for (const id of ['table', 'moonrise', 'foxfire']) {
    const want = APPROVED_2026_08_18.bed[id];
    const got = bedProfile(id);
    for (const k of Object.keys(want)) {
      assert.equal(got[k], want[k],
        `${id}.${k}: APPROVED 2026-08-18 at ${want[k]}, now ${got[k]} — `
        + 'this is a human verdict, not a target');
    }
  }
  // …AND THE PITCHED DRIP IN PARTICULAR, called out because it is the one that
  // was nearly deleted. *"Clankyness of the Moonrise glade and Foxfire
  // Hollow"* was first read as a complaint about these, and they are on paper
  // the most clank-shaped things in the app: Q 6 and Q 7 with a welded sine,
  // against the Q 2.8 that earned the word on Black Anvil. He meant the dice
  // hitting the ground. THE DRIPS STAY.
  for (const id of FAINT) {
    assert.ok(VENUE_AUDIO[id].bed.tick.tone > 0,
      `${id}: the drip keeps its note — approved, not merely un-complained-about`);
    assert.ok(VENUE_AUDIO[id].bed.tick.q >= 6,
      `${id}: and its Q, which reads as "clanky" on paper and was judged fine `
      + 'by the only ear that counts');
  }
  // B1..B5 — the five tower clunks, as ROWS, because "which tower wears which
  // voice" is what the B verdicts were about.
  for (const [id, want] of Object.entries(APPROVED_2026_08_18.clunk)) {
    const got = CLUNK_VOICES[id];
    assert.equal(got.body, want.body, `${id}: approved body`);
    assert.equal(got.weight, want.weight, `${id}: approved weight`);
    assert.equal(got.sustain, want.sustain, `${id}: approved sustain`);
  }
  // The palette still spans what it spanned: the approval covers the SET of
  // five as a set, so a change that kept every row legal while collapsing the
  // range would slip past the row checks above.
  const centroids = Object.keys(APPROVED_2026_08_18.clunk)
    .map((k) => spectrumOf(CLUNK_VOICES[k]).centroidHz);
  assert.ok(Math.max(...centroids) / Math.min(...centroids) > 4,
    `and the five are still five different towers `
    + `(${Math.min(...centroids)}..${Math.max(...centroids)} Hz)`);
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
// C1 / C2 / C3 — first sitting "I hate this sound… far less sharp"; second
// sitting, after that fix shipped: *"When the dice hit the ground it sounds
// horrible in the two venues."* THE RINGING DIE IS KILLED.
// ---------------------------------------------------------------------------

t('the C rows were one voice — and the app could only ever make ONE of them', () => {
  // THE FINDING, AND IT IS STRONGER THAN THE FIRST PASS STATED IT. docs/AUDIO
  // .md §9 lists C1, C2 and C3 as three things to judge. The first pass found
  // they were three CONTEXTS of one body — correct, and the reason all three
  // rows failed together. They were also, as the app can actually be driven,
  // ONE RENDERED SOUND, and that is what settles who the second verdict was
  // about. Two facts compose to it and neither is a matter of reading:
  //
  //   1. the Witchlight set is `venueOnly`, so it takes no chip anywhere a
  //      player picks (js/main.js filters `pickable` on exactly this flag). It
  //      is reachable ONLY as the staged set of the two fae venues;
  //   2. `groundFor(isClunk)` puts the standing venue's ground over EVERY
  //      non-clunk contact.
  //
  // So there is no way to hear this die without a fae floor under it. "C1, the
  // die's own ring" is not a sound this app can produce, and §9's route never
  // leaves Moonrise Glade between C1 and C2 — they were the same rendered
  // sound, heard once. That is why *"everything else is fine"* cannot be read
  // as approving C1 while condemning C2: there was no separate C1 to approve.
  const witchSet = SETS['moonmoot.witchlight'];
  assert.ok(witchSet, 'the fae venues stage this set');
  assert.equal(witchSet.venueOnly, true,
    'and it is venue-only, so it is never heard on the grounded table');
  for (const venue of ['moonrise', 'foxfire']) {
    assert.ok(VENUE_AUDIO[venue].ground.centre < 1,
      `${venue}: …and the floor is always over it (×${VENUE_AUDIO[venue].ground.centre})`);
  }
});

t('C1/C2/C3 — the ringing die is GONE, not re-tuned a third time', () => {
  // THE KILL, ASSERTED AT ITS ROOT: the recipe is absent. `impactVoice`
  // returns `fxSet.sound || null`, so an absent key is not "a set that happens
  // to resolve felt" — it is a set with no voice of its own, which is what
  // every unthemed die on the grounded table already is. That is *"just use a
  // normal sound"* expressed as the absence of a special one, and it is the
  // reason this is a kill rather than a fourth set of numbers.
  assert.ok(!('sound' in SETS['moonmoot.witchlight']),
    'the Witchlight set declares no voice at all');
  // …and what the venues therefore resolve. `{}` has no body, so this walks
  // the same fallback the app walks.
  for (const [venue, id] of [['table', 'C1'], ['moonrise', 'C2'], ['foxfire', 'C3']]) {
    const now = spectrumOf({}, VENUE_AUDIO[venue].ground.centre);
    const rejected = REJECTED_2026_08_18[venue];
    // ① NO RESONANCE. "Clanky" is Q by this file's own published law (see B3),
    //    and a landing now wears a LOWPASS — there is no band left to ring.
    assert.equal(IMPACT_VOICES[IMPACT_DEFAULT_BODY].filter, 'lowpass',
      `${id}: a landing is a knock, not a struck band`);
    // ② NO PARTIAL. The welded sine was the half of "a bell" that no amount of
    //    moving the band could fix, because a partial IS a note.
    assert.equal(now.partialHz, null,
      `${id}: and nothing rings under it (was a ${rejected.partialHz} Hz sine)`);
    // ③ AND IT IS FAR BELOW WHAT HE REJECTED — measured against the re-tune he
    //    actually heard and still disliked, not against the original.
    const d = pct(now.centroidHz, rejected.centroidHz);
    assert.ok(d <= -70,
      `${id}: ${rejected.centroidHz} → ${now.centroidHz} Hz is ${d}% off the `
      + `voice he called horrible — a kill, not a fourth nudge`);
    assert.ok(now.aboveBoundary < 0.1,
      `${id}: and almost nothing is left above §1's ${MATERIAL_BOUNDARY_HZ} Hz `
      + `line (${now.aboveBoundary}, was ${rejected.aboveBoundary})`);
  }
});

t('a fae landing is the SAME BODY as a grounded one — only the floor differs', () => {
  // "The ordinary sound these dice make on the grounded table" is the
  // instruction, and this states how much of it was delivered, with the
  // shortfall rather than around it.
  //
  // SAME BODY, exactly: no venue overrides the body, so a die lands on
  // IMPACT_DEFAULT_BODY in all three rooms. What still differs is the venue's
  // GROUND trim, kept on purpose — see the last assertion for why.
  const grounded = spectrumOf({}, 1);
  assert.equal(grounded.partialHz, null, 'the grounded knock has no note');
  for (const venue of ['moonrise', 'foxfire']) {
    const now = spectrumOf({}, VENUE_AUDIO[venue].ground.centre);
    assert.equal(now.partialHz, grounded.partialHz, `${venue}: nor does the fae one`);
    assert.equal(now.attackMs, grounded.attackMs, `${venue}: same transient`);
    // NOT byte-identical, and this is the honest size of the gap: about a
    // third of an octave darker than the felt. If Joe says it is STILL not
    // normal, THIS is the remaining lever and it is one edit — VENUE_AUDIO's
    // two ground rows to all-1s.
    const d = pct(now.centroidHz, grounded.centroidHz);
    assert.ok(d < 0 && d > -40,
      `${venue}: the floor still absorbs, and only absorbs `
      + `(${grounded.centroidHz} → ${now.centroidHz} Hz, ${d}%)`);
  }
  // THE TRIM WAS NEVER WHAT WAS WRONG, and this is the assertion that stops a
  // future pass "finishing the job" by zeroing it. Removing the ground would
  // have moved the voice he hated UP — brighter, and more of it over the
  // wood/metal line — so it was never a candidate for the complaint.
  const witch = { body: 'chime', weight: 0.22 };   // the deleted recipe
  const trimmed = spectrumOf(witch, VENUE_AUDIO.moonrise.ground.centre);
  const bare = spectrumOf(witch, 1);
  assert.ok(bare.centroidHz > trimmed.centroidHz,
    `neutralising the glade's floor would have made the rejected voice `
    + `BRIGHTER (${trimmed.centroidHz} → ${bare.centroidHz} Hz), which is why `
    + 'the kill is the body and not the trim');
});

t('the chime body survives for three sets, UNHEARD and unjudged', () => {
  // It stays in the registry because three grounded-table sets declare it and
  // none of them has ever been played to anybody. Two things follow, and both
  // are worth a fence:
  //
  //   · nothing may quietly delete it while "removing the fae chime";
  //   · and nobody may cite Joe's 2026-08-18 words as approval of its numbers.
  //     The 3400 → 1750 re-voice was commissioned by the C complaint and the C
  //     caller has since been deleted, so those numbers now ride on three sets
  //     with no verdict at all. Deliberately NOT reverted: he never heard 3400
  //     on these three either, and putting the body back up an octave and a
  //     half on nobody's word is a second unjudged change instead of one.
  assert.ok(IMPACT_VOICES.chime, 'the body stays in the registry');
  const callers = Object.entries(SETS)
    .filter(([, r]) => r.sound && r.sound.body === 'chime').map(([id]) => id);
  assert.ok(callers.length >= 3,
    `and it still has callers (${callers.join(', ')}) — deleting it would `
    + 'silently re-voice sets nobody complained about');
  assert.ok(!callers.includes('moonmoot.witchlight'),
    'but the Witchlight set is not one of them any more');
  // The gain claim from the re-voice still holds, so if these three are ever
  // judged, what is judged is timbre and not level.
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

// ---------------------------------------------------------------------------
// THE CLOTH TIER (the mats arc, 2026-08-29). NOT A VERDICT — A DESIGN.
// ---------------------------------------------------------------------------
// Every other block in this file is a fence around something Joe HEARD. This
// one is not, and saying so is the point: silt's voice is an argument from the
// material, and it has been judged by nobody. What is asserted here is that
// the argument is internally consistent and that the felt is untouched by it,
// which is all arithmetic can settle before he listens.

const ms = (x) => Math.round(x * 1e5) / 100;

t('the felt is inert BY CONSTRUCTION, and its tail is the shipped one', () => {
  // The same discipline as `groundedInert` one tier up. If this goes red, a
  // change of cloth has changed the sound of every table ever played on.
  const f = CLOTH_VOICES[CLOTH_DEFAULT];
  assert.equal(CLOTH_DEFAULT, 'felt');
  assert.equal(f.centre, 1); assert.equal(f.length, 1); assert.equal(f.gain, 1);
  assert.equal(f.tail, 1); assert.equal(f.grind, 1); assert.equal(f.fizz, 0);
  // …and the schedule the constants produce is the one docs/AUDIO.md §3.4
  // quotes and js/main.js's own comment quotes: 85, 36, 15, 6.3, 2.6 ms. The
  // walk moved out of js/main.js in this change; this is what says it moved
  // without moving.
  const felt = settleTail(f).map((x) => ms(x.gap));
  assert.deepEqual(felt, [85, 35.7, 14.99, 6.3, 2.64, 1.11],
    'the felt hands the die back six times, exactly as it always has');
  assert.equal(ms(TAP_T0), 85);
  assert.equal(TAP_E, 0.42);
});

t('silt CATCHES the die — three taps, and two of them inside 20 ms', () => {
  // The handoff's line was that a sand table is the one you identify by the
  // chatter that is not there, and this is that sentence as arithmetic.
  const silt = settleTail(CLOTH_VOICES.silt);
  const felt = settleTail(CLOTH_VOICES.felt);
  assert.equal(felt.length, 6);
  assert.equal(silt.length, 3, 'grain gives a die half as many bounces back');
  // The first gap is the drop, and no surface changes it — it is when the die
  // stops moving, not what it stopped on. Everything after it is the surface.
  assert.equal(ms(silt[0].gap), ms(felt[0].gap));
  const after = silt.slice(1).reduce((a, x) => a + x.gap, 0);
  const feltAfter = felt.slice(1).reduce((a, x) => a + x.gap, 0);
  assert.ok(ms(after) < 20,
    `the whole tail after the drop is ${ms(after)} ms (felt: ${ms(feltAfter)})`);
  assert.ok(after < feltAfter * 0.4, 'and less than half as long as the felt\'s');
  // The third tap is 3.6% of the first and 3 ms behind the second: it is not
  // a third event, it is the second one's edge. That is what "two taps" means.
  assert.ok(silt[2].decay < 0.05 && ms(silt[2].gap) < 4);
});

t('down for the knock, UP for the scrape — the pair is the material', () => {
  // The one assertion in this file that would catch a tidying pass. `centre`
  // and `grind` disagreeing looks like an oversight and is the whole design:
  // loose grain has nothing in it that can resonate (so the landing is the
  // deadest in the app) and yet a die dragging through it makes broadband
  // noise a wool weave never makes.
  const silt = CLOTH_VOICES.silt;
  assert.ok(silt.centre < 1 && silt.grind > 1,
    'if these ever point the same way, someone has "fixed" the design');
  // The deadest landing in the app, and by a clear margin — deeper than the
  // damp hollow, which was the previous floor.
  const felt = spectrumOf({}, 1);
  const hollow = spectrumOf({}, VENUE_AUDIO.foxfire.ground.centre);
  const grain = spectrumOf({}, silt.centre);
  assert.ok(grain.centroidHz < hollow.centroidHz,
    `a grain bed swallows more than standing water does `
    + `(${grain.centroidHz} vs ${hollow.centroidHz} Hz)`);
  assert.ok(pct(grain.centroidHz, felt.centroidHz) <= -30,
    `and ${pct(grain.centroidHz, felt.centroidHz)}% under the felt`);
  assert.equal(grain.partialHz, null, 'nothing rings in sand');
  // And the sustained layer goes the other way by at least half an octave.
  assert.ok(silt.grind >= 1.5,
    'the scrape rises far enough to be heard as a different surface');
  // The fizz is the "grind → hiss" move: the AM depth is what makes the
  // face-clacks discrete, so smothering it is what leaves only the scrape.
  assert.ok(silt.fizz >= 0.5 && silt.fizz < 1,
    'smothered, not silenced — a die on grain still has a rate');
});

t('a venue lays its floor OVER the mat, so the cloth says nothing there', () => {
  // The two surface tiers do not stack, and the reason is geometry rather than
  // taste: js/fae-lab.js covers the felt and the 160-unit floor with one disc,
  // so in a glade the dice are not on the cloth at all. Composing them would
  // voice a die landing in moss as if the moss were full of sand.
  assert.equal(clothVoiceFor('table', 'silt'), CLOTH_VOICES.silt);
  for (const venue of ['moonrise', 'foxfire']) {
    assert.equal(clothVoiceFor(venue, 'silt'), CLOTH_VOICES.felt,
      `${venue}: covered`);
  }
  // An unknown cloth is silent about sound rather than wrong about it — the
  // same fallback the venue table has, and what makes adding a mat a
  // visual-only job until somebody writes its voice down.
  assert.equal(clothVoiceFor('table', 'nosuch'), CLOTH_VOICES.felt);
  assert.equal(clothVoiceFor('table', undefined), CLOTH_VOICES.felt);
});

t('a cloth only ever subtracts from the mix plan', () => {
  // Same rule as the venue rows: §5's mix plan is a ceiling and every tier
  // under it may take away. `grind` is exempt and only `grind` — it is a
  // FILTER FREQUENCY, not a level, and the fizz beside it removes energy from
  // the same voice it brightens.
  for (const [id, c] of Object.entries(CLOTH_VOICES)) {
    assert.ok(c.gain <= 1 && c.centre <= 1 && c.length <= 1,
      `${id}: the cloth only ever subtracts`);
    assert.ok(c.tail > 0 && c.tail <= 1, `${id}: and never adds a bounce`);
    assert.ok(c.fizz >= 0 && c.fizz < 1, `${id}: fizz is a fraction of the depth`);
    assert.ok(typeof c.label === 'string' && c.label.length > 0,
      `${id}: says what it is`);
    // A cloth with no taps at all would be a die landing in silence, which is
    // a bug rather than a material.
    assert.ok(settleTail(c).length >= 2, `${id}: a landing is still an event`);
  }
});

console.log(`voices: ${n} assertions run`);
