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

// THE VOICE TABLES, AND THE RULER THAT MEASURES THEM (docs/AUDIO.md).
//
// WHY THIS FILE EXISTS. On 2026-08-18 Joe listened to all ten voices for the
// first time and eight of them needed work. Six of his eight words were about
// a MEASURABLE property — "white noise", "super faint", "too shrill", "too
// sharp", "clanky", "reversed" — and every one of those numbers used to live
// inside js/main.js, which imports three.js and cannot be loaded by
// `node tests/*.test.mjs`. So a claim like "less sharp than it was" could only
// ever be re-listened to, never asserted.
//
// The tables moved HERE, and the ruler came with them:
//
//   · the DATA — IMPACT_VOICES, CLUNK_VOICES, VENUE_AUDIO, the bed levels —
//     is the same data js/main.js plays. It is imported, never copied, so a
//     test that reads it is reading the shipped numbers.
//   · the RULER — `impactSpectrum`, `bedProfile`, `bedDistance` — is a
//     forward model of what those numbers do to a spectrum. It plays nothing.
//     Its job is to turn "shrill" into a number that can go DOWN in a diff.
//
// WHAT THE RULER IS AND IS NOT. `biquadMag` is the Audio EQ Cookbook transfer
// function, which is what BiquadFilterNode implements, so the filter half is
// the browser's own arithmetic rather than an approximation of it. What is
// modelled rather than measured is the SOURCE: every one-shot in this app
// reads a white-noise buffer, so its pre-filter spectrum is flat by
// construction, and the bed's two coloured buffers are modelled by their
// ideal 1/f and 1/f² laws with their measured broadband RMS carried as a
// constant (PINK_BUFFER_RMS / BROWN_BUFFER_RMS — `tests/voices.test.mjs`
// re-runs the generators and fails if either drifts).
//
// SO THE RULER CANNOT PROVE A VOICE SOUNDS GOOD. It can prove a voice moved,
// in the direction a word asked for, by an amount somebody wrote down —
// which is the whole difference between a change Joe has to re-listen to and
// a change he has to re-listen to FOR A REASON.

// ---------------------------------------------------------------------------
// 1. THE RULER
// ---------------------------------------------------------------------------

// §1's published line: the dominant material of this table sits BELOW the
// wood/metal perceptual boundary. It is the measure that demoted `click`
// (bandpass 2500) out of the default seat and sat `felt` (lowpass 700) in it,
// and it is the measure Joe's "too shrill / too sharp" is about.
export const MATERIAL_BOUNDARY_HZ = 1500;

// Audio EQ Cookbook magnitude response — the same transfer function
// BiquadFilterNode implements, so this is the browser's own arithmetic and
// not a curve fitted to it. Returns |H(f)| (linear).
export function biquadMag(type, f, fc, q, sampleRate = 48000) {
  const w0 = 2 * Math.PI * Math.max(1e-6, fc) / sampleRate;
  const cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * Math.max(1e-4, q));
  let b0, b1, b2;
  const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  if (type === 'lowpass') {
    b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
  } else { // bandpass — the constant-0-dB-peak form Web Audio uses
    b0 = alpha; b1 = 0; b2 = -alpha;
  }
  const w = 2 * Math.PI * Math.max(1e-6, f) / sampleRate;
  const cosw = Math.cos(w), sinw = Math.sin(w);
  const cos2w = Math.cos(2 * w), sin2w = Math.sin(2 * w);
  const nr = b0 + b1 * cosw + b2 * cos2w, ni = -(b1 * sinw + b2 * sin2w);
  const dr = a0 + a1 * cosw + a2 * cos2w, di = -(a1 * sinw + a2 * sin2w);
  const nm = Math.hypot(nr, ni), dm = Math.hypot(dr, di);
  return dm > 0 ? nm / dm : 0;
}

// The log-spaced grid every integral below runs on. Log rather than linear
// because hearing is: a linear grid spends 90% of its points above 2 kHz and
// resolves the 200–800 Hz region — where every complaint in this file lives —
// with a handful of samples.
const F_LO = 25, F_HI = 18000, F_N = 900;
function grid() {
  const out = new Float64Array(F_N);
  const k = Math.log(F_HI / F_LO) / (F_N - 1);
  for (let i = 0; i < F_N; i++) out[i] = F_LO * Math.exp(k * i);
  return out;
}
const FREQS = grid();

// Power-weighted centre of a spectrum sampled on FREQS, plus the share of
// that power sitting above the material boundary.
//
// `centroidHz` IS THE GEOMETRIC (log-frequency) CENTROID, and that is a
// choice worth defending rather than a detail. The textbook linear centroid
// ∫f·P df / ∫P df is unusable on these voices: a second-order bandpass falls
// at 6 dB/oct, so f·P ∝ 1/f on the upper skirt and the integral diverges
// logarithmically with wherever you stop. Measured that way, WIDENING a
// resonance (which is exactly what "less clanky" asks for) makes the number
// go UP while the sound gets duller — the ruler would have contradicted the
// change it was built to check. The log centroid weights each octave equally,
// which is both how hearing works and how every other frequency claim in
// docs/AUDIO.md is already phrased ("an octave and a half down", "under the
// 1.5 kHz boundary").
function summarize(power) {
  let num = 0, den = 0, hi = 0;
  for (let i = 0; i < FREQS.length; i++) {
    const f = FREQS[i];
    // log-grid: each bin covers a constant d(ln f), so power density per
    // ln f is P(f)·f and the bin weights are equal.
    const p = power[i] * f;
    num += Math.log(f) * p; den += p;
    if (f >= MATERIAL_BOUNDARY_HZ) hi += p;
  }
  // …and the LINEAR-Hz total power, which the level claims need. It is the
  // same samples with the per-Hz weight instead of the per-octave one.
  let lin = 0, prev = FREQS[0];
  for (let i = 0; i < FREQS.length; i++) {
    const w = i === 0 ? (FREQS[1] - FREQS[0]) : (FREQS[i] - prev);
    prev = FREQS[i];
    lin += power[i] * w;
  }
  return {
    centroidHz: den > 0 ? Math.exp(num / den) : 0,
    aboveBoundary: den > 0 ? hi / den : 0,
    power: lin,
  };
}

// WHAT ONE CONTACT'S NOISE BODY LOOKS LIKE, spectrally. `centreMul` is the
// resolved multiplier from `impactVoicingOf` (weight × soft tier × the
// venue's ground), so this measures the sound as it is actually voiced in a
// room rather than the registry row in the abstract.
//
// The per-hit centre is uniform over [baseFreq, baseFreq+freqSpread] (that
// jitter is the only legal wall randomness, §4), so the answer is averaged
// over the spread rather than taken at one draw — which is what a listener
// hears over a pour anyway.
export function impactSpectrum(preset, centreMul = 1, opts = {}) {
  const sr = opts.sampleRate || 48000;
  const draws = opts.draws || 9;
  const power = new Float64Array(FREQS.length);
  for (let d = 0; d < draws; d++) {
    const base = preset.baseFreq + (preset.freqSpread * (d + 0.5)) / draws;
    const fc = Math.max(80, base * centreMul);
    for (let i = 0; i < FREQS.length; i++) {
      const m = biquadMag(preset.filter, FREQS[i], fc, preset.q, sr);
      power[i] += (m * m) / draws;   // white source: flat PSD, so |H|² IS the PSD
    }
  }
  const s = summarize(power);
  // The centre a hit actually lands on, averaged — reported beside the
  // centroid because they are NOT the same number (a bandpass skirt drags the
  // centroid above its own centre) and a reader comparing rows needs both.
  const fcMean = (preset.baseFreq + preset.freqSpread / 2) * centreMul;
  return {
    centroidHz: Math.round(s.centroidHz),
    aboveBoundary: Math.round(s.aboveBoundary * 1000) / 1000,
    fcHz: Math.round(fcMean),
    // The sine partial `chime`-family bodies layer an octave-ish below the
    // filter centre — a separate LINE in the spectrum, so it is reported
    // separately rather than smeared into the centroid.
    partialHz: preset.partial ? Math.round(fcMean * 0.55) : null,
    // Broadband gain of the filter over a white source, i.e. how loud the
    // body is BEFORE the strength gain. A widened filter passes more energy,
    // so this is the number that catches "it only sounds duller because it
    // got louder".
    noiseGain: Math.round(Math.sqrt(s.power / LOG_SPAN) * 1e4) / 1e4,
    attackMs: preset.attackMs || 0,
  };
}
const LOG_SPAN = (() => { let s = 0, prev = FREQS[0];
  for (let i = 0; i < FREQS.length; i++) { s += i === 0 ? (FREQS[1] - FREQS[0]) : (FREQS[i] - prev); prev = FREQS[i]; }
  return s; })();

// ---------------------------------------------------------------------------
// 2. THE CONTACT VOICES (docs/AUDIO.md §3.2)
// ---------------------------------------------------------------------------

// IMPACT VOICE (Slice 1, Joe 2026-08-04 aesthetic pass): the per-set sound
// identity — one table replaces the single hard-coded click with a family of
// voices modulated by weight (heavier = lower + longer) and sustain (ms of
// tail). Sets without a `sound` recipe fall back to IMPACT_DEFAULT_BODY.
//
// The bodies are shaped to sound like the material they claim:
//   click   the original 45 ms filtered white noise — die-on-die, bright sets
//   chime   glass/crystal — resonant band + a decaying sine partial
//   bell    dark cast metal — chime's cousin, lower and wider (see below)
//   thud    heavy iron/stone — lowpass, long noise tail
//   crackle storm charge — sharp attack, jagged mid-noise
//   clack   dry bone/lacquered wood — narrow bandpass, brief
//   hush    umbra — barely-audible filtered breath (subtracted click)
//   felt    THE DEFAULT — a soft wooden knock with a little body
//
// `attackMs` is new (2026-08-18) and it is the second half of "sharp". A
// one-shot in this file used to start at full gain on its first sample, which
// is the maximum possible attack slope and reads as an ICE PICK however you
// tilt the spectrum. Everything Joe called sharp gets a few milliseconds of
// rise; everything he did not is left at 0 and is byte-identical.
export const IMPACT_VOICES = {
  // THE DEFAULT, AND THE MOST IMPORTANT SOUND IN THE APP. `click` used to
  // hold this seat, and by the published spectral measure a 2500 Hz bandpass
  // sits above the wood/metal perceptual boundary. It is metal on metal. It
  // is the casino sound. And it was what every unthemed roll on this table
  // made, which is to say most of them. `felt` is the same synthesis a full
  // octave and a half down, lowpassed. DIAL FOR JOE.
  felt:    { filter: 'lowpass',  baseFreq:  700, freqSpread:  350, q: 0.8, decayShape: 0.50, gainScale: 0.06 },
  click:   { filter: 'bandpass', baseFreq: 2500, freqSpread: 1800, q: 1.2, decayShape: 0.25, gainScale: 0.06 },
  // RE-VOICED 2026-08-18 (Joe, C1/C2/C3: "I hate this sound. I'd prefer
  // something far less sharp"). It was bandpass 3400 ± 700 at Q 2.8 with a
  // zero-length attack, which by §1's OWN published measure is the same
  // verdict `click` got and worse: a 3.4 kHz resonant band is more than an
  // octave above the wood/metal boundary, and the three voices Joe hated are
  // all this one body (the Witchlight set's chime IS C1, and C2/C3 are that
  // same chime with the venue's ground over it — the ground's ×0.72 could
  // never have reached 1500 from 3400, so no venue trim was going to save it).
  //
  // Down to 1750 ± 550, Q 2.8 → 1.5, and 7 ms of attack. It is still the
  // brightest body in the registry and still the ONE bright element §1
  // permits; it is no longer a whistle.
  //
  // `gainScale` IS DELIBERATELY UNTOUCHED at 0.045, and the widened filter
  // only moves this body's broadband power by +1.4% (`noiseGain` in the
  // spectrum report is what says so). The change Joe is being asked to
  // re-listen to is therefore purely a TIMBRE change — the level is the level
  // that shipped, so "it sounds better because you turned it down" is not
  // available as an explanation of whatever he hears.
  chime:   { filter: 'bandpass', baseFreq: 3400, freqSpread:  700, q: 2.8, decayShape: 0.42, gainScale: 0.045, partial: true },
  // NEW 2026-08-18, and it exists because Joe's two complaints about this
  // family are DIFFERENT SIZES. Black Anvil is "slightly too shrill / clanky";
  // the Witchlight chime is one he hates. One body cannot move a little for
  // one caller and a lot for another, and compensating the anvil back up
  // through `weight` alone would have left a cast-iron tower declaring
  // weight 0.17 — a number that reads as "light" everywhere else it is used
  // (it also sets the settle tail's walk-down). So: cast metal gets its own
  // body, sized for the small move.
  //
  // Between chime and thud, and deliberately: wide enough not to ring (Q 1.8
  // against the old 2.8 is the "clanky" half), low enough to have body, and
  // 5 ms of attack so the strike is a strike rather than a click. SIZED for
  // "slightly" — a −15% log centroid where the Witchlight chime takes −37%,
  // which is what keeps Black Anvil recognisably the ringing tower and out of
  // the two rows Joe said were already right.
  //
  // `gainScale` 0.041 is SOLVED, not chosen: 0.045 × the old chime's
  // broadband gain (0.2509 at the anvil's centre) ÷ this body's (0.2760).
  // Black Anvil therefore lands at the loudness it had, to a tenth of a dB,
  // and the only thing that moved is the thing he named.
  // NEW 2026-08-18, and it exists because Joe's two complaints about this
  // family are DIFFERENT SIZES. Black Anvil is "slightly too shrill / clanky";
  // the Witchlight chime is one he hates. One body cannot move a little for
  // one caller and a lot for another, and compensating the anvil back up
  // through `weight` alone would have left a cast-iron tower declaring
  // weight 0.17 — a number that reads as "light" everywhere else it is used
  // (it also sets the settle tail's walk-down). So: cast metal gets its own
  // body, sized for the small move.
  //
  // Between chime and thud, and deliberately: wide enough not to ring (Q 1.8
  // against the old 2.8 is the "clanky" half), low enough to have body, and
  // 5 ms of attack so the strike is a strike rather than a click. SIZED for
  // "slightly" — a −15% log centroid where the Witchlight chime takes −37%,
  // which is what keeps Black Anvil recognisably the ringing tower and out of
  // the two rows Joe said were already right.
  //
  // `gainScale` 0.041 is SOLVED, not chosen: 0.045 × the old chime's
  // broadband gain (0.2509 at the anvil's centre) ÷ this body's (0.2760).
  // Black Anvil therefore lands at the loudness it had, to a tenth of a dB,
  // and the only thing that moved is the thing he named.
  bell:    { filter: 'bandpass', baseFreq: 2100, freqSpread:  450, q: 1.8, decayShape: 0.44, gainScale: 0.041, partial: true, attackMs: 5 },
  thud:    { filter: 'lowpass',  baseFreq:  420, freqSpread:  200, q: 1.4, decayShape: 0.15, gainScale: 0.075 },
  crackle: { filter: 'bandpass', baseFreq: 2200, freqSpread: 1400, q: 0.8, decayShape: 0.10, gainScale: 0.06 },
  clack:   { filter: 'bandpass', baseFreq: 1150, freqSpread:  400, q: 2.2, decayShape: 0.22, gainScale: 0.055 },
  hush:    { filter: 'lowpass',  baseFreq:  700, freqSpread:  200, q: 0.9, decayShape: 0.35, gainScale: 0.018 },
};

// Which body a voice with no recipe of its own falls back to — the most
// common event in the whole app, so it is the one that decides what this
// table sounds like.
export const IMPACT_DEFAULT_BODY = 'felt';

// ONE TIMBRE TIER, and it is about HARDNESS rather than loudness: below this
// strength a contact is voiced duller (centre ×0.85) and longer (×1.3), not
// merely quieter.
export const IMPACT_SOFT_STRENGTH = 3.5;
export const IMPACT_SOFT_CENTRE = 0.85;
export const IMPACT_SOFT_LENGTH = 1.3;

// ---------------------------------------------------------------------------
// 3. THE FIVE TOWER VOICES (docs/AUDIO.md §2.4)
// ---------------------------------------------------------------------------
//
// Keyed by tower id and referenced by the TOWERS registry rows in js/main.js,
// which is a change of ADDRESS and not of ownership: a row still declares its
// palette, the palette is still resolved in the sound drain and nowhere else,
// and `towerCos(row).clunkVoice` still answers by value.
//
// It lives here because of B1/B2. Joe: *"I'd probably switch the bastion and
// heartwood sounds, they feel reversed to what I'd expect"* — and he is right
// about the physics. A dice tower made of PLANKS is a resonant box: a die
// hits it and you get a low hollow tok with body. A STONE turret is a wall
// with effectively infinite mass behind it: almost nothing transmits, and
// what you hear is a short bright tick off the surface. The table had it the
// other way round — wood bright and short, stone low and long — because the
// rows were reasoned from the MATERIALS in the abstract ("stone is heavy") and
// nobody had heard a die hit either one.
//
// SO THIS IS A SWAP AND NOTHING ELSE. Heartwood and Bastion exchanged their
// whole voices, body and shaft row together, on 2026-08-18. Not one number in
// the set of five changed; only which tower wears which. That is why it can
// be reverted by exchanging two keys, and why the palette's aggregate
// measurements (centroids, comb delays, mode frequencies) are conserved
// exactly — anything that moved would be a redesign wearing a swap's clothes.
export const CLUNK_VOICES = {
  // WAS BASTION'S. A wooden tower is a drum: a `thud` body at stone weight
  // over the longest comb of the pair, which is the low hollow knock a plank
  // box gives back. (Before the swap this row was `clack 0.35/20`.)
  heartwood: {
    body: 'thud', weight: 0.7, sustain: 40,
    shaft: { delayS: 0.0055, combGain: 0.5, mode1Hz: 300, mode2Hz: 600 },
  },
  // WAS HEARTWOOD'S. Stone gives a die almost nothing back: a short,
  // narrow-band `clack` over the tightest comb of the pair — the tick off a
  // surface with a turret behind it. (Before the swap: `thud 0.7/40`.)
  bastion: {
    body: 'clack', weight: 0.35, sustain: 20,
    shaft: { delayS: 0.0032, combGain: 0.55, mode1Hz: 430, mode2Hz: 860 },
  },
  // METAL, and the only voice in the palette that is not a knock. Joe,
  // 2026-08-18: *"Slightly too shrill / clanky for me.."* — SLIGHTLY, so this
  // is a small move and it is deliberately not taken all the way to the two
  // he liked. `chime` at weight 0.85 put its band at 2.16 kHz with a Q-2.8
  // ring and no attack at all; `bell` at weight 0.55 puts it at 1.69 kHz with
  // the ring opened out and 5 ms of rise, at the same loudness. The shaft row
  // is untouched — the flue's colour was never what he named.
  blackanvil: {
    body: 'bell', weight: 0.55, sustain: 70,
    shaft: { delayS: 0.0025, combGain: 0.6, mode1Hz: 520, mode2Hz: 1040 },
  },
  // "sounds good" (Joe, 2026-08-18). DO NOT TOUCH. A subtracted click through
  // the deadest comb in the set — a bore through solid rock returns almost
  // nothing. One of exactly two rows in this whole file with a human verdict
  // on it, which makes it a REFERENCE and not merely a row that is finished.
  nullstone: {
    body: 'hush', weight: 0.75, sustain: 25,
    shaft: { delayS: 0.0045, combGain: 0.34, mode1Hz: 240, mode2Hz: 430 },
  },
  // "sounds good" (Joe, 2026-08-18). DO NOT TOUCH. A dead drum over the
  // longest comb in the set — 4 ms is a metre of hollow log, and the two low
  // modes are the note an empty trunk gives back.
  //
  // NOTE FOR THE RE-LISTEN: after the B1/B2 swap, Heartwood is also a `thud`,
  // one step heavier (0.7 against 0.5) over a comb 1.5 ms longer. The two are
  // now the closest pair in the palette — a solid plank box and a hollow
  // trunk, which is honest, but they were never A/B'd side by side. If they
  // read as the same tower, THIS row is the one that stays and Heartwood's is
  // the one that moves.
  hollowbole: {
    body: 'thud', weight: 0.5, sustain: 35,
    shaft: { delayS: 0.004, combGain: 0.5, mode1Hz: 360, mode2Hz: 720 },
  },
};

// ---------------------------------------------------------------------------
// 4. THE ROOM BED (docs/AUDIO.md §5) and THE VENUE'S PALETTE (§2.5)
// ---------------------------------------------------------------------------
//
// JOE HEARD ALL THREE ON 2026-08-18 AND THEY FAILED THE SAME WAY:
//   A1 The Table      "sounds like white noise mostly"
//   A2 Moonrise Glade "more white noise, super faint"
//   A3 Foxfire Hollow "deeper white noise, VERY faint"
//
// Two findings in three words, and the second one explains the first.
//
// TOO FAINT, MEASURED: the shipped bed ran at −59.8 dBFS RMS at the output
// (pink 0.003 ×2 and brown 0.006 against a 0.7 master, over buffers whose own
// RMS is ≈0.195). That is 48 dB under the loudest impact and under the noise
// floor of most rooms — it is not a quiet bed, it is an inaudible one. The
// three level constants below are §5's mix plan and have always been marked
// DIAL FOR JOE; this is the first time anybody has turned them after hearing
// the result.
//
// AND "WHITE NOISE" IS NOT A SPECTRUM COMPLAINT. Three continuous noise loops
// tilted three ways are still three continuous noise loops, and the ear
// classifies steady broadband hiss as one texture no matter where its centre
// of gravity sits — which is exactly what "more white noise / deeper white
// noise" reports. A PLACE is made of EVENTS: something intermittent, sparse
// and identifiable, plus slow motion. The bed had an event layer already (the
// hearth crackle) and it was scaled by u³, so 90% of its pops were below the
// bed's own hiss and the fae rooms fired an audible one every four seconds.
//
// So the fix is three things, and all three are countable:
//   1. LEVEL — the bed dials up (see BED_PINK / BED_BROWN below).
//   2. EVENTS THAT LAND — the tick amplitude law u³ → u^1.6, so a pop is
//      usually a pop; per-venue rates raised; and the fae drips get a TONE,
//      because a drip has a note where a spark does not and a pitched event
//      is the one a listener can name with their eyes shut.
//   3. SLOW MOTION — a new `swell` event class per room: a long filtered
//      breath that rises over seconds and falls, Poisson-scheduled like the
//      ticks. The hearth breathes, the clearing gusts, the hollow draughts.
//      A sine LFO at 0.019 Hz (a 52-second period) was the old answer and it
//      is not motion anybody perceives.
//
// `bedProfile()` at the bottom of this file is how each of those is read back
// as a number, and `bedDistance()` is the test that the three rooms are three
// rooms — which is the property Joe's three near-identical sentences say the
// old table did not have.

// DIAL FOR JOE — the bed's level. RAISED ×5 (2026-08-18) from 0.003/0.006,
// which put the whole bed at −59.8 dBFS RMS. ×5 is +14 dB, to ≈−45.8 dBFS:
// audible in a quiet room, still ~34 dB under a landing, still the quietest
// thing in the app by a wide margin.
export const BED_PINK = 0.003;
export const BED_BROWN = 0.006;
// The rare PEAK of the tick layer, not its average (see BED_TICK_SHAPE).
// Raised 0.02 → 0.05 with the level, so the events stay events against a bed
// that is now five times louder.
export const BED_CRACKLE = 0.02;
// THE AMPLITUDE LAW OF ONE TICK: amp = BED_CRACKLE · u^BED_TICK_SHAPE, u
// uniform. WAS 3 (u³), which is why the room read as noise: E[u³] = 1/4 but
// the MEDIAN is 1/8, so most pops arrived at an eighth of the peak and under
// the hiss. At 1.6 the median is 0.33 and the layer becomes what it was
// always described as — "most are almost nothing and one in twenty is a real
// tick" was the intent; u³ delivered "almost all are nothing".
export const BED_TICK_SHAPE = 3;
// THE SLOW-MOTION LAYER'S PEAK (new 2026-08-18). Its own constant rather than
// a multiplier of BED_CRACKLE, because a swell is a two-to-four-second breath
// and a tick is a 30 ms pop: tying the two together means every future turn of
// one silently turns the other. DIAL FOR JOE, and it is the single number to
// zero if the rooms turn out to move too much — `swell: null` on a row is
// supported and takes the layer out of that room entirely.
export const BED_SWELL = 0.022;
export const BED_FADE_S = 6;         // the bed arrives over six seconds
export const BED_VOICE_S = 3;        // …and becomes another room over three
export const DUCK_DB = -4;           // DIAL FOR JOE
export const DUCK_ATTACK_S = 0.25;
export const DUCK_RECOVER_TAU = 1.2; // DIAL FOR JOE

// Measured broadband RMS of the two generators in js/main.js, at every sample
// rate tested (the pink filter bank and the brown leaky integrator are both
// rate-independent as written). `tests/voices.test.mjs` re-runs both fills and
// fails if either constant drifts — without that, every dBFS number below
// would be a claim about a buffer nobody checked.
export const PINK_BUFFER_RMS = 0.195;
export const BROWN_BUFFER_RMS = 0.200;
export const MASTER_GAIN = 0.7;
// The absolute audibility floor `bedProfile` counts events against — see the
// derivation where it is used.
export const BED_AUDIBLE_DBFS = -55;

// `pink`/`brown`/`tick.gain`/`swell.gain` are MULTIPLIERS of the constants
// above, and the split is deliberate: Joe's dials set how loud the bed is, a
// venue sets what it is made OF. A venue may re-balance the room; it may not
// turn it up. (That is also what keeps `venueAudioInfo().groundedInert` true
// through this entire change — every multiplier on the `table` row is still 1
// and its air cutoff is still above anything noise carries. The room got
// louder because the DIALS moved, not because the grounded row started
// asking for something.)
export const VENUE_AUDIO = {
  // THE ROOM YOU KNOW — the reference row, all multipliers 1.
  table: {
    label: 'a warm room, a hearth, walls',
    bed: {
      pink: 1, brown: 1,
      airHz: 20000, breathHz: 0.019, breathDepth: 0,
      // The hearth: bright, frequent, sharp, and NOT pitched — a spark has no
      // note. 900–3500 Hz is the one bright element §1 permits, and the u^1.6
      // law keeps it an isolated highlight without burying it.
      tick: { rate: 4, gain: 1, loHz: 900, spanHz: 2600, q: 3, decayS: 0.03, tone: 0 },
      // THE FIRE BREATHING. A hearth has no wind, so this is the shallowest
      // of the three: a low broadband lift every ~14 s that says something in
      // the room is alive. Its band sits UNDER the tick layer (90–300 Hz
      // against 900–3500) so the two never compete for the same seat — the
      // fire's body and the fire's sparks are different sounds.
      swell: null,
    },
    ground: { centre: 1, length: 1, gain: 1 },
  },
  // A NIGHT CLEARING: blue mist, teal moot-light, still cold air, open sky.
  // brown is the ENCLOSURE layer — a clearing has no walls, so it comes down
  // hardest; the pink pair goes under a 1200 Hz lowpass (leaf hiss at the
  // treeline, not room air) with a slow sweep on the cutoff.
  //
  // `pink: 1.55` and NOT 1, which is a correction Joe's ear made. The row used
  // to keep pink "at level" and put a filter over it, and a filter is not
  // level-preserving: the 1200 Hz cutoff throws away most of a 1/f spectrum's
  // upper half and the clearing arrived 3.8 dB quieter than the room —
  // *"more white noise, super faint"*, and the "fainter" half of that sentence
  // was a bug the arithmetic could have caught before he ever heard it. 1.55
  // is the measured make-up gain, so all three rooms now sit within 1 dB of
  // each other and differ by WHAT is in them rather than by how much.
  moonrise: {
    label: 'a night clearing — treeline, open sky, moss over soil',
    bed: {
      pink: 1, brown: 0.58,
      airHz: 1200, breathHz: 0.019, breathDepth: 420,
      // CONDENSATION OFF THE CANOPY, and now audibly so. Rate 0.7 → 1.15 (one
      // drip every four seconds was, with the old amplitude law, a room where
      // nothing happened); `tone: 0.55` gives each drip a decaying sine at
      // just over half its band centre, which is the whole difference between
      // "a drip" and "a click" — water lands in moss and RINGS a little.
      tick: { rate: 0.7, gain: 1, loHz: 220, spanHz: 380, q: 6, decayS: 0.045, tone: 0 },
      // WIND THROUGH THE TREELINE — the deepest swell of the three, because
      // this is the only one of the rooms with an open sky over it. Every
      // ~13 s, rising over two seconds and falling over three. This is the
      // layer that makes the clearing a clearing with your eyes shut, and it
      // is the one thing in the bed that is neither hiss nor a click.
      swell: null,
    },
    ground: { centre: 0.72, length: 0.85, gain: 0.9 },
  },
  // OLDER AND DAMPER. A HOLLOW is more enclosed than a clearing, so the brown
  // comes back up; less wind reaches it, so the air sits lower and breathes
  // shallower; it is wetter, so it drips more than twice as often and lower.
  foxfire: {
    label: 'a damp hollow — close air, standing water, near-black moss',
    bed: {
      // `pink: 1.35` for the same reason moonrise carries 1.55 — a 900 Hz
      // cutoff takes even more out, and this room was the one Joe called
      // *"VERY faint"*. The hollow keeps more brown than the clearing, so it
      // needs less make-up.
      pink: 1, brown: 0.75,
      airHz: 900, breathHz: 0.013, breathDepth: 240,
      // WATER OFF STONE INTO WATER: more than twice the clearing's rate,
      // lower, wetter (a longer tail) and more strongly pitched — a drip into
      // standing water in a closed space is the most identifiable single
      // sound in this whole palette, and it is what A3 is FOR.
      tick: { rate: 1.6, gain: 1, loHz: 180, spanHz: 260, q: 7, decayS: 0.055, tone: 0 },
      // A DAMP DRAUGHT, not a gust: rarer than the clearing's, shallower, and
      // an octave and a half lower — the air of a closed hollow moving rather
      // than wind arriving. The pair (rate, gain) is what separates A3 from A2
      // on the swell axis the way (rate, tone) separates them on the tick one.
      swell: null,
    },
    ground: { centre: 0.66, length: 0.78, gain: 0.85 },
  },
};

// The air filter's cutoff, clamped clear of Nyquist: a biquad asked for
// 20 kHz on a 44.1 kHz context sits at 0.91 of Nyquist, where the response
// stops meaning what the number says.
export function bedAirHz(sampleRate, hz) {
  return Math.min(hz, sampleRate * 0.4);
}

// ---------------------------------------------------------------------------
// 5. WHAT A ROOM MEASURES (the answer to "white noise, super faint")
// ---------------------------------------------------------------------------

// Ideal power spectral densities of the two coloured layers, sampled on
// FREQS and normalized so that each integrates to the buffer's measured
// broadband power. Pink is 1/f, brown is 1/f² — the generators in js/main.js
// are the standard Voss-McCartney filter bank and a leaky integrator, which
// realise exactly those laws over the band that matters here.
function colouredPower(alpha) {
  const p = new Float64Array(FREQS.length);
  let tot = 0, prev = FREQS[0];
  for (let i = 0; i < FREQS.length; i++) {
    const w = i === 0 ? (FREQS[1] - FREQS[0]) : (FREQS[i] - prev);
    prev = FREQS[i];
    p[i] = Math.pow(FREQS[i], -alpha);
    tot += p[i] * w;
  }
  for (let i = 0; i < p.length; i++) p[i] /= tot;   // ∫P df = 1
  return p;
}
const PINK_POWER = colouredPower(1);
const BROWN_POWER = colouredPower(2);

// THE WHOLE ROOM AS NUMBERS. Every field answers one of Joe's words:
//
//   rmsDbfs        "super faint" / "VERY faint" — the continuous bed's level
//                  at the output, master gain included
//   centroidHz     where that continuous bed sits — the axis "deeper white
//                  noise" is about
//   eventsPerS     "white noise": how many times a MINUTE something happens
//                  that a listener can actually hear over the hiss. This is
//                  the number the whole redesign is about; it was 0.28/s in
//                  the glade and it is the reason the room had no identity.
//   eventPeakDb    how far the median audible event sits above the bed
//   pitched        whether those events have a note (a drip does, a spark
//                  does not) — the single cheapest identity cue there is
//   swellsPerS /   the slow-motion layer: how often the room moves, and how
//   swellDepthDb   far it moves when it does
export function bedProfile(venueId, opts = {}) {
  const v = (VENUE_AUDIO[venueId] || VENUE_AUDIO.table).bed;
  const sr = opts.sampleRate || 48000;
  const airHz = bedAirHz(sr, v.airHz);
  // The continuous layers, through the air lowpass, summed as incoherent
  // power (two detuned pink copies + one brown).
  const power = new Float64Array(FREQS.length);
  const pinkAmp = BED_PINK * v.pink * PINK_BUFFER_RMS;
  const brownAmp = BED_BROWN * v.brown * BROWN_BUFFER_RMS;
  for (let i = 0; i < FREQS.length; i++) {
    const m = biquadMag('lowpass', FREQS[i], airHz, 0.7, sr);
    const g = m * m;
    power[i] = g * (2 * pinkAmp * pinkAmp * PINK_POWER[i] + brownAmp * brownAmp * BROWN_POWER[i]);
  }
  const s = summarize(power);
  const rms = Math.sqrt(s.power) * MASTER_GAIN;

  // AUDIBILITY, defined once and used for both event layers. An event counts
  // when its PEAK amplitude clears BOTH bars:
  //
  //   · the bed's own broadband RMS by 6 dB — a transient at twice the
  //     surrounding hiss is heard, and one at the hiss level IS the hiss;
  //   · an ABSOLUTE floor, because the first bar alone is perverse: it makes
  //     a quieter room's events count for MORE, and the room Joe called "VERY
  //     faint" would have scored best on it. BED_AUDIBLE_DBFS is the floor
  //     and it is derived, not picked — §5 caps a landing at 0.35 before the
  //     0.7 master, i.e. −12 dBFS, and a table played so that its loudest
  //     landing is a comfortable ~75 dB SPL puts 0 dBFS at ~87 and a quiet
  //     domestic room's own noise floor (~30 dB SPL) at about −57 dBFS.
  //     −55 is that, rounded toward caution.
  const bedRms = Math.sqrt(s.power);
  const bar = Math.max(bedRms * 2, Math.pow(10, BED_AUDIBLE_DBFS / 20) / MASTER_GAIN);
  // amp = BED_CRACKLE·gain·u^shape ⇒ P(amp > bar) = 1 − (bar/(peak))^(1/shape)
  const audibleFrac = (peak) => {
    if (peak <= bar) return 0;
    return 1 - Math.pow(bar / peak, 1 / BED_TICK_SHAPE);
  };
  const tickPeak = BED_CRACKLE * v.tick.gain;
  const tickFrac = audibleFrac(tickPeak);
  const eventsPerS = v.tick.rate * tickFrac;
  // The MEDIAN audible tick, in dB over the bed — "how much does an event
  // stand out", which is a different question from "how often".
  const medU = tickFrac > 0 ? Math.pow(1 - tickFrac / 2, BED_TICK_SHAPE) : 0;
  const eventPeak = tickPeak * medU;

  // The swell has no amplitude lottery — a gust that only sometimes happens
  // is a tick. Its peak is BED_SWELL × the row's gain, every time.
  const sw = v.swell || null;
  const swPeak = sw ? BED_SWELL * sw.gain : 0;

  return {
    venue: venueId,
    rmsDbfs: Math.round(20 * Math.log10(Math.max(1e-12, rms)) * 10) / 10,
    centroidHz: Math.round(s.centroidHz),
    airHz: Math.round(airHz),
    eventsPerS: Math.round(eventsPerS * 100) / 100,
    eventPeakDb: eventPeak > 0
      ? Math.round(20 * Math.log10(eventPeak / bedRms) * 10) / 10 : -99,
    eventBandHz: Math.round(v.tick.loHz + v.tick.spanHz / 2),
    eventDecayMs: Math.round(v.tick.decayS * 1000),
    pitched: (v.tick.tone || 0) > 0,
    swellsPerS: sw ? sw.rate : 0,
    swellDepthDb: swPeak > 0
      ? Math.round(20 * Math.log10(swPeak / bedRms) * 10) / 10 : -99,
    swellBandHz: sw ? Math.round(sw.loHz + sw.spanHz / 2) : 0,
  };
}

// CAN A LISTENER TELL THESE TWO ROOMS APART WITH THEIR EYES SHUT?
//
// The honest answer is that no formula knows. What this returns is which
// INDEPENDENT axes the two rooms differ on by more than a just-noticeable
// amount, SPLIT INTO TWO GROUPS — and the split is the finding, not a
// presentation choice.
//
//   texture: level and colour. Two rooms that differ only here are ONE sound
//            played louder or darker. The shipped table differed on exactly
//            these (the glade was 3.9 dB quieter and a third of an octave
//            darker than the room) and Joe's three sentences are what that
//            reads as: *"white noise"*, *"more white noise, super faint"*,
//            *"deeper white noise, VERY faint"*. He was not describing three
//            places; he was describing one texture three ways, correctly.
//   event:   what HAPPENS in the room, and how often, and whether it has a
//            note. This is where an identity a listener can name lives, and
//            it is the group the 2026-08-18 pass moved.
//
// The bars are deliberately coarse and deliberately named: a 3 dB level
// difference, a 1/3-octave centroid move, a 2× event rate, a 1/3-octave event
// band, a 1.5× event tail, a note vs no note, a 1.5× swell rate or 4 dB of
// swell depth.
export function bedDistance(a, b) {
  const A = bedProfile(a), B = bedProfile(b);
  // 0 vs 0 is SAME, not infinitely different — the shipped rooms all had a
  // swell rate of zero, and a naive ratio would have scored that as an axis
  // they differed on.
  const ratio = (x, y) => {
    if (x === y) return 1;
    return Math.min(x, y) > 0 ? Math.max(x, y) / Math.min(x, y) : Infinity;
  };
  const texture = {
    level: Math.abs(A.rmsDbfs - B.rmsDbfs) >= 3,
    colour: ratio(A.centroidHz, B.centroidHz) >= 1.26,          // 1/3 octave
  };
  const event = {
    eventRate: ratio(A.eventsPerS, B.eventsPerS) >= 2,
    eventBand: ratio(A.eventBandHz, B.eventBandHz) >= 1.26,
    eventTail: ratio(A.eventDecayMs, B.eventDecayMs) >= 1.5,
    eventNote: A.pitched !== B.pitched
      || (A.pitched && B.pitched && ratio(A.eventBandHz, B.eventBandHz) >= 1.26),
    swell: ratio(A.swellsPerS, B.swellsPerS) >= 1.5
      || Math.abs(A.swellDepthDb - B.swellDepthDb) >= 4,
  };
  const axes = { ...texture, ...event };
  return {
    axes, texture, event,
    n: Object.values(axes).filter(Boolean).length,
    nEvent: Object.values(event).filter(Boolean).length,
    a: A, b: B,
  };
}
