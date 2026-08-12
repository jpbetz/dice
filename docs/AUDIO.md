<!--
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
-->

# Audio (V1, phase one)

The design authority for sound. [GOALS.md](GOALS.md) still wins ties;
[IMMERSION-AUDIT.md](IMMERSION-AUDIT.md) is what asked for this work and
[ROADMAP.md](ROADMAP.md) Tier V sequences it. Everything here is
implemented in `js/main.js` (the section headed *Sound — the audio graph*)
and proved by the `audio` tag in `tests/e2e/scenarios.mjs`.

Anything marked **DIAL FOR JOE** is a listening decision, not a design gap.
It ships at the stated default and is flagged `// DIAL FOR JOE` in code.

## 1. The sound of this table

Felt over wood in a quiet, warm room — a private corner of a tavern, not a
casino floor. The dominant material sits **below the wood/metal perceptual
boundary** (~1.5 kHz spectral centroid): soft wooden impacts with a little
body, a low continuous grind while dice tumble, a geometric flutter of taps
as each die dies down, and then genuine silence.

One bright element is permitted — die-on-die clacks and the iron tower's
chime — as isolated highlights against a warm field, never as texture.

The sound never editorializes. No result stings, no escalation, no jingles;
**the number carries the outcome**. Weight is the payload: sound is the only
channel this app has to give dice their mass back. And the strongest cue
that a roll is over is the room going quiet again.

## 2. Architecture

### 2.1 Buses — built once, in `ensureAudio()`

```
                                    ┌─ panBus[0..8] (StereoPanner, −0.6…+0.6 step 0.15) ─┐
one-shots (impacts, settle taps) ───┤                                                    ├─▶ master(Gain 0.7)
rolling voices (per-die panner) ────┘                                                    │        │
tower clunks ─▶ shaftBus (comb + 2 peaking biquads, §2.4) ───────────────────────────────┤        ▼
room bed (roomGain — the duck point) ────────────────────────────────────────────────────┘  softClip(tanh)
                                                                                                  │
                                                                                            destination
```

`master` is the **one** point every source passes through, which is what
makes `soundOn === false` structurally total rather than a list of callers
that each remembered to check.

- **One-shots** route to the nearest of nine pooled pan buses —
  `busFor(x)` from `pan = clamp(x / (matHalfX·0.8), −1, 1) · 0.6`. Zero
  per-event panner allocation; 0.15 of pan quantization is inaudible on a
  transient.
- **Rolling voices** each own a `StereoPannerNode` written from the die's
  keyframe x inside the playback loop.
- **Depth** is a per-event gain multiplier on one-shots (inverse model,
  `ref` = camera-to-mat-centre, rolloff 0.6, ≈ −4 dB front to back). The
  air-absorption lowpass rides **rolling voices only**, which keeps a
  one-shot at three nodes.
- Baffle clunks are `at: null` by design and are never panned by position.

### 2.2 The shared noise buffer

`playImpact` used to allocate and JS-fill a fresh `AudioBuffer` per contact.
There is now **one** 2 s shared noise buffer (plus one 4 s loop for rolling
voices), and each one-shot is
`BufferSource(random offset) → Biquad → Gain(envelope) → bus`.
`decayShape` became the exponential-ramp constant; `crackle`'s attack became
a 1 ms gain bump. The random read offset keeps per-hit texture.

`audioGraphInfo().perHitBufferAllocs` counts every `createBuffer` call made
after the build finished and **must stay 0**. Its non-vacuity partner is
`oneShots` — zero allocations with zero sounds is not a claim.

### 2.3 Node lifecycle

| Thing | Rule |
|---|---|
| master, softClip, panBus×9, shaftBus, room bed | built once at unlock, never torn down (~35 nodes) |
| rolling voices | pool of `MAX_DICE_ON_TABLE`; noise source + AM oscillator `start()`ed **once at construction and never stopped** — sources are single-use, so silence is `levelGain.gain → 0`, never `stop()` |
| impacts, settle taps, crackle pops | created per event, fire and forget — **no `onended` closures, no cleanup arrays** |

`AudioParam` discipline: at most **two** automated params per rolling voice
(`levelGain.gain`, `amOsc.frequency`), always
`setTargetAtTime(v, ctx.currentTime, τ)` — never `currentTime + x` — and
only when the target actually moved. Everything else is `.value =`, once.

### 2.4 The shaft send (tower color)

A 0.4 m chute's 2.3 ms round trip is below the 128-sample (2.9 ms)
feedback-loop floor, so a true geometric model is unrepresentable. Model the
**color**, feedforward only:

```
clunk ─┬───────────────────────▶ sum ─▶ peak(mode1, Q 10, +8 dB) ─▶ peak(mode2, Q 8, +6 dB) ─▶ 0.9 ─▶ master
       └─▶ delay(delayS) ─▶ combGain ─▶ sum
```

Five nodes, no feedback, no stability question. The dials live on the
TOWERS registry row inside `clunkVoice.shaft`, so the palette still resolves
in the sound drain and nowhere else — and the FIRST LAW holds *by
construction*: a towerless roll records no `clunk` event, so no film can
reach this bus. Dice in hidden transit additionally get a
`lowpass 2200 Hz` that is removed at the mouth; the muffled-then-bright exit
sells the tower more than anything else in the chain.

## 3. The three-phase contact machine

Per-die state, derived at playback from film data every client already
agrees on. The phases are not three switched sounds: **impact** is the
transient limit, **rolling** the sustained middle, **settle** the scheduled
tail.

### 3.1 Derivation (per die, per frame)

```
speed    = |kf[fB].pos − kf[fA].pos| · 60 / span      // central difference, raw keyframes
angSpeed = 2·acos(min(1, |q_rel.w|)) · 60 / span      // raw quats, |w| for double cover
grounded = kf[i].pos.y < restY(type) + 0.15
hidden   = spans && !pourVisibleAt(spans[di], i)
```

Kinematics read **raw keyframes at integer frames** — never `d.mesh`, never
the lerped pose (`d.correction` cancels in a difference, and the mesh is a
painted frame). The pour guard is copied from `tempoAnchorOf`: a frame pair
counts only if the die is visible at both ends, or a despawn teleport reads
as 60 u/s.

**Phase priority:** `hidden` → forced silent. `settled` at
`f >= landings[di].frame` and it is **absorbing**. `rolling` when
`grounded` and `angSpeed` is over the bar, with hysteresis — enter at
1.5 rad/s, leave below 0.9 — so the boundary cannot flutter. `airborne` is
everything else and contributes no sustained sound; its impacts are the
baked events.

### 3.2 Impact (event, baked)

The existing recorded-contact path, with three corrections:

1. **The default voice is `felt`** — lowpass, 700 Hz, Q 0.8. The old default
   `click` (bandpass 2500) is by the published measure metal-on-metal, i.e.
   the casino sound, and it was the app's most common event. `click` stays
   in the registry for genuine die-on-die and bright sets.
2. **`IMPACT_HARD_GAP_MS` 12 → 18.** Contacts closer than ~15–20 ms fuse
   into one perceptual event anyway.
3. **One timbre tier.** Below `strength 3.5`, centre ×0.85 and duration
   ×1.3: soft hits get *duller and longer*, not merely quieter.

### 3.3 Rolling (sustained, derived)

One pooled voice per die, felt surface only in phase one:

```
sharedLoop(4 s) → surfaceBand(bandpass, fc = 380·clamp((1.25/R)^0.4, 0.9, 1.3), Q 0.8)
                → tilt(lowpass, fc = 300 + 55·vTan, ceiling 1800)
                → amGain (0.35 DC + pulseOsc(f_face)·depth — AudioParam inputs are additive)
                → levelGain → airLowpass → StereoPanner → master
```

- **`f_face = (vTan / dieWidth(type)) · tempoAt(roll.time)`** is the one
  mapping that gives both regimes: below ~20 Hz it is discrete face-clacks,
  above it fuses into a pitched grind, continuously, with no crossfade. The
  tempo scaling is mandatory — `TEMPO.k` varies *within* a throw, and
  without it the sound detaches from the picture.
- Modulator is a `PeriodicWave` pulse, 12 harmonics, `imag[k] = 1/√k`.
  Depth `= clamp(1 − f_face/45, 0.25, 0.95)` — fast clacks physically
  overlap.
- **Level** `= 0.05 · load · (vTan/12)^0.75`, hard-clamped at **0.12**
  summed across all voices. `load = grounded·(1 − clamp(|vy|/8))`, smoothed
  80 ms on the FILM clock. Below 0.004 the level snaps to 0.
- Rolling voices **never** touch the click gate and **never** write into
  `roll.sounds`.

### 3.4 Settle (scheduled cluster)

A geometric (Zeno) tap series, scheduled as **one cluster** with absolute
context times the moment the film cursor crosses `landings[di].frame`:

```
gap_k = T0·e^k · jitter(hash(roll.seed, di, k) → [0.88, 1.12])
amp_k = A0·e^k
voice = the landing's body, freq ×0.85^k, sustain ×0.5
```

`e = 0.42`, `T0 = 85 ms`, `A0 = 0.5 ×` the landing impact's computed gain,
max 8 taps, stopping at 1 % of A0 — about five audible taps over ~145 ms,
the last of them near-pure thump.

The cluster uses the **tap** gate class. It must bypass the impact cursor
entirely or the 18 ms floor eats taps 3–7 — the tail is *supposed* to be
denser than the floor. The last die's cluster fires on the
`roll.time >= roll.duration` branch, because the film is truncated at the
last landing and has zero settled frames for it.

## 4. Determinism contract

**The film must not learn about audio.** Audio is derived from bytes every
client already agrees on and driven by `roll.time`, never `performance.now()`.

**Film-derived — identical on every client, by construction:**
`speed`, `angSpeed`, `grounded`, `phase`; `f_face`, tilt, rolling level;
settle cluster timing and amplitudes (`landings[di].frame` +
`hash(roll.seed, di, k)`); the baked rough/surface track; the clunk plan
(already `pourPlan(seed, attempt)`).

**Render-cosmetic — `Math.random` permitted:** noise buffer contents and
per-hit read offsets; per-hit filter-centre jitter (existing precedent); pan
quantization; room tone and crackle entirely. None of these has a film
relationship, so desync is unobservable — this is stated so nobody
over-engineers it into a seeded stream.

**Must NOT use wall randomness — rhythm is the line:** AM rate, settle tap
intervals, any onset time. Timing desync between clients in a shared room is
audible; timbre desync is not.

The baked rough/surface track is part of the same-seed comparison in
`tower-roll`'s replay block. It was added there in the same commit that
introduced it, because a replay hash that does not cover a new array stops
covering it *silently*.

## 5. Mix plan

| Layer | Ceiling | Note |
|---|---|---|
| Impacts | 0.35 | the loudest single impact of a throw is the mix's ceiling |
| Settle taps | A0 = 0.5 × parent impact | decaying under it |
| Rolling (all voices summed) | 0.12 | a 20-die pile cannot out-shout its own landing |
| Room bed | pink 0.003 + brown 0.006 + crackle 0.02·u³ | present enough that absence is noticeable |

**Duck direction is fixed: ambience ducks, dice never.** No compressor does
this; it is a scheduled ramp on `roomGain` — −4 dB with a 250 ms attack at
roll start, recovering with τ = 1.2 s from the last die's settle. Both edges
are slow enough that the gesture itself is imperceptible, and the recovery
does narrative work: *the room coming back* is the strongest "roll is over"
cue in the app.

**Silence discipline.** The bake's `v > 2` gate is the strength floor — a
contact below it did not happen, audibly, and render must not voice below it
either. The settle approaches **true silence**, not a floor of ticks. No UI
sounds in phase one; when they come they live in the low-mids, spectrally
displaced from the dice band. `soundOn === false` silences everything,
sustained sources and bed included. Ambience fades to zero and suspends the
context on `visibilitychange`.

## 6. Refusals

1. **No `DynamicsCompressorNode`**, anywhere. Lookahead latency offsets every
   onset, and inter-die ducking destroys the strength→loudness mapping. The
   tanh WaveShaper is the only limiter.
2. **No `PannerNode`/HRTF, no `AudioListener`.** The camera is fixed; HRTF is
   four convolutions per source, and at 20 dice that is the exact catastrophe
   the perf literature exists to warn off. `StereoPannerNode` is the same
   equal-power pan, cheaper.
3. **No `ConvolverNode`, and no Schroeder/Freeverb tail in phase one.** The
   "roomy tavern reverb" instinct is served by the shaft comb, the decay
   tails and the bed. A feedback reverb is ~30 permanent nodes, a teardown
   hazard and a runaway risk, and it has not earned its place until the dry
   table is proven. If a stone-chamber tail is ever wanted it is a phase-two
   shared send with `g ≤ 0.90` hard-capped.
4. **No result-valenced audio.** No fail stings, no nat-20 jingles, no
   rising-pitch streaks. The most-installed dice-audio mods for other games
   are *removals* of exactly this, and the escalating-reward pattern is
   structurally the losses-disguised-as-wins slot mechanic.
5. **No wall-clock randomness in any rhythm.** Timbre jitter is the only
   legal randomness.
6. **No reduced-motion → quiet inference.** `prefers-reduced-sound` does not
   exist, and a player who asked the OS to stop moving things did not ask for
   silence. An inferred mute the UI does not report is precisely the
   green-check-masks-a-broken-thing shape this project keeps catching.
7. **No binding audio to visual toggles.** `LS_SOUND` stays independent;
   ambience gets its own switch.
8. **No elevation cues.** Not reproducible in stereo; the wall-contact
   voicing via `DECAL_MAX_CONTACT_Y` is already the right proxy.
9. **No full-width panning.** |pan| ≤ 0.6 — a table a metre away subtends
   about ±25°.
10. **Nothing render-time is written into `roll.sounds`.** The 400-event /
    8-per-step budget is shared with particles, decals and the shock ring.
11. **No compounding-duck concurrency system in phase one.** The 18 ms floor
    plus merged perceptual events covers the burst case. Revisit only if
    20-die landings audibly stutter.
12. **No "table surface" user setting yet.** Phase one has one surface (felt)
    and per-tower palettes; a setting with one meaningful value is UI debt.

## 7. DIAL FOR JOE

- `ROLL_GAIN` 0.05 and the 0.12 rolling sum clamp — the loudness of the
  grind relative to landings.
- Felt band centre 380 Hz and tilt ceiling 1800 Hz — the warm/dull boundary.
- Duck depth −4 dB and recovery τ 1.2 s — how much the room "breathes".
- Bed layer levels, and whether the bed ever ships on by default (currently:
  never before an hour of continuous listening).
- Black Anvil's `chime 0.85/70` and its shaft row.
- The `restY` polyhedron constant (0.75 · radius) — verify against a baked
  settle; the rough track's surface class supersedes it.
- Clunk density on 40-die pours. If it grates, drop `POUR.clunkMax` to 3
  rather than reshaping the plan.

## 8. Where the tests are

Tag `audio` (with `fx` and `roll`), in `tests/e2e/scenarios.mjs`:

| Scenario | Proves |
|---|---|
| `audio-graph` | nothing at boot; one roll builds the whole graph once; nine pan buses at ±0.6; zero per-hit buffer allocations against a non-zero one-shot count; suspended until a real gesture and running after one; three gate cursors; the 18 ms floor; mute reaching the master node |
| `audio-phases` | the three-phase machine over a real film: rolling frames exist, `settled` is absorbing and flips exactly at `landings[i].frame`, a settled die reports zero speed, no despawn teleport under a tower, every hidden frame reports `hidden` |
| `audio-rolling` | film-derived target levels rise for rolling dice; the pool never exceeds `MAX_DICE_ON_TABLE` and drains to zero live voices after a clear |
| `audio-settle` | one scheduled cluster per die, geometric intervals within jitter tolerance, byte-identical schedules for the same seed, and the impact cursor unmoved by taps |
| `audio-shaft` | the shaft bus exists only under a socketed tower, and `impactVoiceFor` — not `towerClunkVoice` — is what says a towerless roll has no shaft |
| `audio-ambience` | the toggle defaults off, no bed sources when off, and `soundOn === false` forces zero bed sources regardless |
