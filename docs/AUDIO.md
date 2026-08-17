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
[ROADMAP.md](ROADMAP.md) Tier V sequences it — plus **Tier W6, the venue's
audio palette (§2.5)**, which is where goals 13–15 reach this file.
Everything here is implemented in `js/main.js` (the section headed *Sound —
the audio graph*) and proved by the `audio` tag in `tests/e2e/scenarios.mjs`.

Anything marked **DIAL FOR JOE** is a listening decision, not a design gap.
It ships at the stated default and is flagged `// DIAL FOR JOE` in code.

**NOTHING IN THIS FILE HAS BEEN LISTENED TO BY A HUMAN.** Not one voice —
not the five tower clunks, not the Witchlight chime, not the bed, not the
venue palette §2.5 added. Every number was reasoned from the tables here and
from the material each thing claims to be. Read every "warm", "dead",
"bright" and "dull" below as a *prediction*, and see §9 for the sitting that
would settle them.

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
room bed ─▶ air(lowpass, §2.5) ─▶ duck ─▶ roomGain (the duck point) ─────────────────────┘  softClip(tanh)
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

*Corrected 2026-08-16 (W6), because the flat claim above is not what the
instrument measures.* Building the **room bed** allocates two buffers (pink
23 s, brown 29 s) and the bed is built long after `buffersAtBuild` is
snapshotted, so `perHitBufferAllocs` reads **2 whenever the bed is up**. It is
0 in every scenario only because ambience defaults off. The counter's real
contract is *per HIT*, and the honest statement of it is: **0 with the bed
down, 2 with the bed up, and it must never grow with the number of contacts.**
W6 kept it there deliberately — a venue re-voices the bed by moving gains and
filters, never by re-filling 52 seconds of noise.

### 2.3 Node lifecycle

| Thing | Rule |
|---|---|
| master, softClip, panBus×9 | built once at unlock, never torn down (~12 nodes) |
| shaftBus | built **lazily, on the first clunk carrying a shaft row**, then re-*tuned* per tower, never rebuilt — which is why `shaftBuilt` is false on a towerless table |
| room bed | the **one thing here that is torn down**, and deliberately: it is a single object toggled by hand, and `bedSources` must read 0 under mute for the switch to mean what it says. A venue swap re-tunes it in place (§2.5); only the switch destroys it |
| rolling voices | pool of `MAX_DICE_ON_TABLE`; noise source + AM oscillator `start()`ed **once at construction and never stopped** — sources are single-use, so silence is `levelGain.gain → 0`, never `stop()` |
| impacts, settle taps, crackle pops | created per event, fire and forget — **no `onended` closures, no cleanup arrays** |

*Corrected 2026-08-16 (W6): this table used to put the shaft and the bed in
the "built once at unlock, never torn down" row. Both were wrong, and the bed's
was wrong against a comment in the same file that says the opposite in capital
letters.*

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

Six nodes (in gain, delay, comb gain, two peaks, out gain), no feedback, no
stability question. *("Five" here and in the code's own banner counted the
chain and forgot the input gain; corrected 2026-08-16.)* The dials live on the
TOWERS registry row inside `clunkVoice.shaft`, so the palette still resolves
in the sound drain and nowhere else — and the FIRST LAW holds *by
construction*: a towerless roll records no `clunk` event, so no film can
reach this bus. Dice in hidden transit additionally get a
`lowpass 2200 Hz` that is removed at the mouth; the muffled-then-bright exit
sells the tower more than anything else in the chain.

**Five towers carry a voice**, not four: `heartwood` clack 0.35/20,
`bastion` thud 0.7/40, `blackanvil` chime 0.85/70, `nullstone` hush 0.75/25,
`hollowbole` thud 0.5/35 — each with its own shaft row. None has been heard.

### 2.5 The venue's palette (W6)

GOAL 13 lists the **audio palette** among the things a venue IS, and goal 14
says a fantasy venue is believed through internal consistency: one place, one
light-logic, one palette, one voice. Three quarters of that already travelled
with the venue — the tower brings `clunkVoice` + its shaft row, the staged
dice set brings `sound`. **Two things did not, and both said "tavern" out
loud in a night clearing:**

- **the bed.** Pink + brown + a Poisson crackle at 900–3500 Hz is a *hearth*.
  There is no fire in the glade.
- **the ground.** Every impact, tap and grind is voiced for **felt over wood**
  (§1). The glade's floor is one mossed disc covering the felt and the
  160-unit floor alike, so dice land in **moss over soil** — and a labradorite
  die ringing off a hard table in a bog is the same costume problem one layer
  down.

So the palette is exactly two rows per venue, in `VENUE_AUDIO` (`js/main.js`,
this section), read through **one** function, `venueAudio()`:

| | `table` (grounded) | `moonrise` | `foxfire` |
|---|---|---|---|
| the place | a warm room, a hearth, walls | a night clearing — treeline, open sky | a damp hollow — close air, standing water |
| pink ×  | 1 | 1 | 1 |
| brown × | 1 | **0.58** | **0.75** |
| air lowpass | 20 000 Hz | **1200 Hz** | **900 Hz** |
| air breath | 0.019 Hz, **±0** | 0.019 Hz, ±420 Hz | 0.013 Hz, ±240 Hz |
| tick rate | 4 /s | **0.7 /s** | **1.6 /s** |
| tick band | 900 + 2600, Q 3, 30 ms | **220 + 380, Q 6, 45 ms** | **180 + 260, Q 7, 55 ms** |
| ground centre × | 1 | **0.72** | **0.66** |
| ground length × | 1 | **0.85** | **0.78** |
| ground gain × | 1 | **0.90** | **0.85** |

**How each number was reasoned.** `brown` is the *enclosure* layer — §5 calls
it "the low end that makes a room feel enclosed" — so a clearing with no walls
cuts it hardest and a **hollow**, which is by its own name more enclosed than a
clearing, gets some of it back. The pink pair keeps its level but goes through
a lowpass at **1200 Hz, under §1's 1.5 kHz wood/metal boundary**: the same
measure that demoted `click` and seated `felt` at 700. That is leaf hiss at
the treeline rather than room air, and a fourth mutually-prime LFO (0.019 Hz,
±420 Hz on the cutoff) is the wind moving through it. The tick layer stops
being a fire and becomes **condensation off the canopy**: rare, low, *pitched*
(a drip has a note where a spark does not) and longer-tailed, because water
lands in moss. Foxfire is "older and damper", so it drips more than twice as
often, lower, and its air sits lower and breathes shallower.

**The ground is a second timbre tier, not a new body.** `IMPACT_SOFT_*` was
already a one-tier modifier over the resolved body (§3.2); the venue's floor is
another, in the same shape, and it **multiplies** rather than replaces. That is
the physically honest composition — the die keeps its own material and the
place says what that material does when it lands in it. A `moss` *body* was the
other design and it is worse: the venue stages a set whose voice always wins,
so a venue body would resolve on shrouded rolls only, i.e. almost never.

Four properties hold this together, and each is checkable rather than promised:

1. **The grounded room is inert BY CONSTRUCTION**, not by care — every `table`
   multiplier is 1 and its cutoff sits above anything pink or brown noise
   carries. `venueAudioInfo().groundedInert` is that claim.
2. **A baffle knock is never trimmed.** A clunk is a die hitting the *tower*,
   which has its own palette and its own send; running the glade's moss over it
   would voice a knock inside a hollow trunk as if it happened outside.
   `groundFor(isClunk)` is the whole mechanism, and `impactVoicingFor` can be
   asked with `{clunk:'baffle'}` to prove it.
3. **Timbre only.** The trim moves centre frequencies, envelope length and
   one-shot gain. It does **not** touch the rolling `targetLevel`, so §4's
   "film-derived, identical on every client" list stays literally true and a
   replay of a roll recorded under another sky derives the same levels. §4
   already licenses exactly this asymmetry.
4. **The mix ceiling only falls.** The trim is applied *outside* the 0.35
   clamp, so a venue can subtract from §5's plan and never add to it.

**The bed re-voices in place, and nobody has to remember to call it.**
`bedRevoice()` is driven from `stepAmbience` by comparing `bed.voice` against
the live venue — one string compare a frame — so a chip, a server settings
echo, a room's settings at boot and a replay all re-voice for free. It moves
seven AudioParams over `BED_VOICE_S / 3` and rebuilds nothing: a teardown would
restart the six-second fade and re-fill both noise buffers. Same reasoning as
`ensureShaft` keying on a tuning string instead of trusting its callers. A room
does not switch on, and it does not switch **over** either.

**A venue changes what the bed IS; it never changes whether the bed is ON.**
That is refusal 14, and it is the same rule as refusal 7.

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

**Two tiers as of W6**, and the second is the venue's ground (§2.5) — same
shape, multiplied in, skipped for baffle knocks. All of the arithmetic lives in
`impactVoicingOf(strength, voice, isClunk)`, which `playImpact`, the settle
cluster **and** the `impactVoicingFor` debug hook all call: a scenario that
re-derived the trim itself would stay green with the trim unwired.

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
- **Level** `= 0.05 · load · (vTan/12)^0.75 · (1 + 0.6·rough)`, hard-clamped at
  **0.12** summed across all voices. `load = grounded·(1 − clamp(|vy|/8))`,
  smoothed 80 ms on the FILM clock. Below 0.004 the level snaps to 0. *(The
  `rough` factor comes off the baked surface track and is what turns "a rumble
  that follows the dice" into "the pile actually grinding"; it also scales the
  AM depth by `0.5 + 0.35·rough`. Both were missing from this section until
  2026-08-16 — the formula read as if the track were unused.)*
- **The venue's ground (§2.5) scales `surfaceBand` and the whole `tilt` curve
  by one factor** — on the resolved frequency, not on the ceiling, so the voice
  shifts down and keeps its shape. The level is deliberately untouched.
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
denser than the floor.

*Corrected 2026-08-16: this used to say the last die's cluster fires on the
`roll.time >= roll.duration` branch. It does not, and never did in the shipped
code — `scheduleSettleCluster` has exactly **one** call site, the phase
crossing in `stepRollingAudio`, and the frame clamp at the truncated film's end
produces that crossing for the last die like every other. The design expected
to need the special case; the measurement said otherwise, and the code says so
in a comment this file contradicted.*

The tail wears the venue's ground (§2.5) too — a die settles on the floor of
the place it is in — through `vo.ground`, and deliberately through
`ground.centre` rather than the full `centre`: the cluster does not apply the
soft-strength tier (its own `0.85^k` walk down is the dulling), and folding it
in here would move a shipped schedule.

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
| Room bed | pink 0.003 + brown 0.006 + tick 0.02·u³ | present enough that absence is noticeable |

The bed row is the **grounded** room's. A venue re-balances it (§2.5) with
multipliers that only ever subtract, so these three numbers stay the ceiling
for every venue and stay Joe's dial: **the venue says what the room is made
of, the mix plan says how loud a room is allowed to be.**

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
    *W6 does not breach this: the venue's ground (§2.5) is not a setting. It
    is part of a choice the player already made as one thing (goal 13), it has
    no control of its own, and there is still nothing anywhere that says
    "surface: …" to a player.*
13. **No ambient event layer tied to the living layer.** The obvious next
    thing to build is a voice for the moot ring or the wisps — a chime as the
    word goes round the circle. It is refused, and the reason is a
    determinism one rather than a taste one. Such a sound's ONSET would be
    driven by `FAECONCEPT.t`, which starts at zero **when a client enters the
    venue**; two people in one room would hear the ring speak at different
    moments while watching the same caps light. §4's line is that timbre may
    desync and rhythm may not, and the bed's crackle is legal precisely
    because it is *anonymous* — no viewer can tell which pop belongs to which
    pixel. **So: audio may be anonymous and unsynchronized, or synchronized
    and tied to a visible thing, but never unsynchronized AND tied to a
    visible thing.** Two lesser reasons, either of which would also be enough:
    §1 permits ONE bright element as an isolated highlight, and in the glade
    that seat is already taken by the staged set's chime on every landing; and
    the layer leans IN exactly when dice are down and readable, which is the
    worst possible moment to add a sound (goal 15). If it is ever built it
    needs a film-derived or seed-derived clock, not the stage's.
14. **A venue may not switch the bed on.** It changes what the room is made
    of, never whether the room is audible. Selecting a venue is a *visual*
    choice a player makes; flipping an audio switch inside it is refusal 7
    ("no binding audio to visual toggles") wearing a different hat, and an
    inferred sound the UI does not report is the same green-check-masks-a-
    broken-thing shape as an inferred mute.

## 7. DIAL FOR JOE

- `ROLL_GAIN` 0.05 and the 0.12 rolling sum clamp — the loudness of the
  grind relative to landings.
- Felt band centre 380 Hz and tilt ceiling 1800 Hz — the warm/dull boundary.
- Duck depth −4 dB and recovery τ 1.2 s — how much the room "breathes".
- Bed layer levels, and whether the bed ever ships on by default (currently:
  never before an hour of continuous listening).
- **Every row of `VENUE_AUDIO` (§2.5).** The two ground trims are the biggest
  single lever — `centre` alone moves the impacts, the whole settle tail, the
  surface band and the tilt curve together, so it is one number per venue and
  it is worth turning first. Then the drip rate (0.7/s and 1.6/s are a
  *guess at how often a wood drips*, and nothing else in the app is as easy to
  find annoying), then the air cutoffs.
- **`BED_VOICE_S` 3 s** — how long the room takes to become a different room.
  It only ever runs when a venue changes with the bed already up.
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
| `audio-venue` | **Shipped 2026-08-17.** The grounded row is inert *in effect* (a landing and a baffle knock are byte-identical there); a fantasy venue trims a landing by the exact product of the grounded answer and its own declared row, outside the 0.35 clamp; a baffle knock under the same venue keeps the neutral ground and the full ceiling; the settle tail carries the trim on its LEVELS and not on its GAPS (moonrise vs foxfire — same tower, same staged set, same seed, so only the ground row differs) and no rolling `targetLevel` moves; the standing bed re-voices in place (`told` instantly, live AudioParams over real seconds, `bedSources` AND `perHitBufferAllocs` unmoved); and a venue never switches the bed on |

Hooks it stands on, added by W6:
`venueAudioInfo()` (declared rows, `groundedInert`, and the **live** bed read
off its nodes) and `impactVoicingFor(strength, setId, ev)` — the deterministic
voicing of a contact, through the same `impactVoicingOf` that plays it.

**The one leg it cannot make, named rather than faked:** there is no hook that
publishes a rolling voice's band or tilt frequency (`audioGraphInfo` reports
pool sizes and levels, never filters), so the GRIND's trim is asserted on the
shared `ground.centre` that `stepRollingVoices` reads and not on the band it
produces. A grind that stopped multiplying by that number would still pass.

**A known flake, measured 2026-08-16 and it is NOT W6's:** `audio-graph`'s
`gateCursors.tap === 0` ("nothing has scheduled a settle cluster") fails about
**one run in six**, on a clean tree as well as this one. The scenario drives the
film with `sim()`, but the page's own rAF loop keeps running between CDP calls,
and a real-time frame that happens to land on a settle crossing fires a cluster
and moves the cursor. It is a race in the assertion, not in the graph. Anyone
touching this file will meet it; re-run before believing it.

**Two things any live-bed assertion has to know**, both paid for while
verifying W6:

1. **A suspended context has a frozen clock.** Without a trusted gesture
   `ctx.currentTime` does not advance, so *no* `setTargetAtTime` ramp in this
   file can ever be observed — every param reads at its old value forever and
   the test looks like a broken feature. `audio-graph`'s F8 trick is the
   unlock.
2. **`sim()` is the film clock, not the audio clock.** Stepping 120 frames
   moves an AudioParam ramp by nothing at all. A claim about a ramp needs real
   wall time (`waitFor` on the live value); a claim about *intent* can read
   `live.told` immediately.

## 9. The listening script — ten voices, one sitting

**Every voice in this app is unheard.** Nine were reasoned from the tables
above and never played to a person; the tenth (the grounded bed) has been
playable since V1 and nobody has sat with it. They are cheap to make and
expensive to *find*, which is the only reason the backlog exists — so here is
the whole palette as a route, ordered so that **exactly one thing changes
between consecutive rows.**

**Preamble, once.** Open the table on **`?stability=beta`** — venue and tower
are closed-beta rows and the pickers are simply absent without it (`BETA_ROWS`;
UX §7.38). Then `⚙` → **You** → **Room tone** ON (the bed is off by default and
W6 did not change that) → **Staging**. You are now parked with the panel open;
leave it open, it covers nothing that makes a sound.

**A roll is two clicks:** a row in the left column, then **Roll**. Tap the row
N times first for N dice — the extra taps are optional and are not counted
below. For a big pour (the tower voices want one) `/` → `8d6` → Enter is
faster, and is the only keyboard in this script.

### A. The three rooms — no dice, just the room

A minute each with nothing on the felt. What is being judged is whether the
room is a *place*, and whether it is quiet enough to disappear.

| # | Voice | The two clicks | Listen for |
|---|---|---|---|
| A1 | **The Table** — hearth, walls | `Staging` → **The Table** | the reference. Brown low end, sparse bright fire ticks (~4/s) |
| A2 | **Moonrise Glade** — clearing | **Moonrise Glade** → *(nothing; wait 3 s)* | the low end steps back and the top goes soft — no walls, leaf hiss at the treeline. Ticks become rare low drips (~0.7/s). The change takes 3 s (`BED_VOICE_S`): **that transition is a voice too** |
| A3 | **Foxfire Hollow** — damp hollow | **Foxfire Hollow** → *(wait 3 s)* | closer, wetter and more enclosed than A2, dripping twice as often and lower |

*Then go back — **The Table** → **Moonrise Glade** once more. The A/B is where
"is this the same building?" actually gets answered.*

### B. The five tower voices — under The Table, on equal ground

Put the grounded venue back first (**The Table**) so every tower is judged on
felt with all ground trims at 1. Room tone may stay on; off is a cleaner read
of the knocks.

| # | Voice | The two clicks | Listen for |
|---|---|---|---|
| B1 | **Heartwood** `clack 0.35/20` | **Heartwood** → **Roll** | dry wood on wood, short and narrow, over the shortest comb in the set |
| B2 | **Bastion** `thud 0.7/40` | **Bastion** → **Roll** | heavier and lower, and it rings on in the chute after the knock |
| B3 | **Black Anvil** `chime 0.85/70` | **Black Anvil** → **Roll** | **the one most likely to want moving.** A chime body weighted right down, meant to read as cast iron rather than crystal. If it reads as glass, the weight goes up |
| B4 | **Nullstone** `hush 0.75/25` | **Nullstone** → **Roll** | a subtracted click through the deadest comb here — a bore through solid rock returns almost nothing |
| B5 | **Hollow Bole** `thud 0.5/35` | **Moonrise Glade** → **Roll** | **the second most likely to want moving.** A dead drum: hollower than B2 over the longest comb, the note an empty trunk gives back. It has **no tower chip** — venue-only, so the venue *is* the click |

*B5 moves two things at once (tower **and** venue) and there is no way around
it: Hollow Bole cannot stand in the grounded room. Judge it against B2, which
is the nearest body, and remember there is moss under it now.*

### C. The venue's dice and its ground — you are already there

Stay in **Moonrise Glade** from B5. Every roll is now Witchlight on moss.

| # | Voice | The two clicks | Listen for |
|---|---|---|---|
| C1 | **Witchlight** `chime 0.22/65` | *(a row)* → **Roll** | "a long faint cold ring — glass struck in another room". Check it is not competing with the tower knocks it arrives after |
| C2 | **Moonrise ground** ×0.72 / ×0.85 / ×0.90 | *(a row ×8)* → **Roll** | the same die landing in moss: dull, short, absorbed. Judge the **settle tail** hardest — five taps in ~145 ms is where a floor either sounds soft or sounds broken — then the grind as the pile rolls out |
| C3 | **Foxfire ground** ×0.66 / ×0.78 / ×0.85 | **Foxfire Hollow** → **Roll** | the same again, deader. **If C2 and C3 are indistinguishable the two rows should collapse into one** |

**The single control that answers most of this** is
`VENUE_AUDIO[venue].ground.centre` in `js/main.js`. It moves the impacts, the
whole settle tail, the rolling surface band and the tilt curve *together*, by
design — so one number per venue is the first thing to turn, and everything
else in §2.5 is a detail beside it.

**Deliberately not in this script:** the duck (§5) is unchanged and keeps its
own dials, and the living layer has no voice at all — refusal 13 says why.
