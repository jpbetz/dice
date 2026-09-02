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

> **Guidance, not law (2026-09-02).** Every rule, law, ruling, invariant, gate
> and budget in this file is a dated lesson somebody paid for, with its reason
> beside it. Read it before building near it; a design may set any of it aside
> by saying, in the commit, which rule it set aside and why. The eight things
> that may NOT be set aside are in [GOALPOST.md](GOALPOST.md) — where this file
> and that one disagree, this file is history.


The design authority for sound. [GOALS.md](GOALS.md) still wins ties;
[IMMERSION-AUDIT.md](IMMERSION-AUDIT.md) is what asked for this work and
[ROADMAP.md](ROADMAP.md) Tier V sequences it — plus **Tier W6, the venue's
audio palette (§2.5)**, which is where goals 13–15 reach this file.

The **graph** is in `js/main.js` (the section headed *Sound — the audio
graph*); the **numbers** are in `js/voices.js` (the voice tables, the bed
levels, the venue palette, and the ruler that measures them). It is proved by
the `audio` tag in `tests/e2e/scenarios.mjs` and by `tests/voices.test.mjs`.

Anything marked **DIAL FOR JOE** is a listening decision, not a design gap.
It ships at the stated default and is flagged `// DIAL FOR JOE` in code.

**IT HAS NOW BEEN LISTENED TO.** Joe sat down on **2026-08-18** and heard all
ten voices in §9's script — the first human verdict this audio has ever had.
Eight of the ten needed work and two did not, and his exact words are the
record in §9. What that sitting proved, beyond the eight specifics:

- **Two of the predictions in this file were right and one was very wrong.**
  §9 named Black Anvil "the one most likely to want moving" and it was
  (*"Slightly to shrill / clanky"*); it named Hollow Bole second and he said
  *"sounds good"*. What nothing here predicted is that **the whole fae bed
  premise did not land**: three rooms reasoned from three different places
  came back as *"white noise"*, *"more white noise"*, *"deeper white noise"* —
  one texture at three volumes.
- **Every number is measurable now.** The voice tables moved to
  `js/voices.js` on the same day, with a spectral ruler beside them, because
  the agent that changes a sound cannot hear it either. `tests/voices.test.mjs`
  holds the 2026-08-17 numbers he judged as a frozen baseline and asserts each
  change moved in the direction his word asked, by a stated amount.

Read what is left of "warm", "dead", "bright" and "dull" below as a
*prediction* still — but §9's ten rows now carry verdicts, and only the rows
that CHANGED need a second sitting.

**Two voices have been added since and BOTH ARE UNHEARD:** the cloth tier
(§2.6, 2026-08-29), which is what a mat does to a die that lands on it. Silt
is a bed of dry grain and Taproom Oak is a plank table, they are the two ends
of the same register, and both rows were reasoned from the material rather
than tuned to a sentence. §9 D is the route for both. The felt row is all
identity, so nothing in the ten above moved.

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
one-shots (impacts, settle taps) ─▶ panBus[0..8] (StereoPanner, −0.6…+0.6 step 0.15) ───┐
rolling voices ─▶ own StereoPanner ─────────────────────────────────────────────────────┤─▶ master(Gain 0.7)
tower clunks ─▶ shaftBus (comb + 2 peaking biquads, §2.4) ──────────────────────────────┤        │
room bed ─▶ air(lowpass, §2.5) ─▶ duck (THE DUCK POINT) ─▶ roomGain ────────────────────┘        ▼
                                                                                          softClip(tanh)
                                                                                                  │
                                                                                            destination
```

*Corrected 2026-08-18, and it was wrong in three places at once — so was the
banner over the same section in `js/main.js`, which is where the picture was
copied from.* **(a)** Only one-shots go through the pooled pan buses; rolling
voices own a `StereoPannerNode` each and connect **straight to master**, which
§2.1's prose directly under the old picture already said. **(b)** The shaft
send also goes straight to master (`p1 → p2 → out → master`), not through a
pan bus — a baffle knock is `at: null` and is never panned by position, which
is the whole reason. **(c)** `roomGain` was labelled "the duck point" and it
is not: `AUDIO.room` is a unity gain written exactly once, at build, and
`roomDuck()` ramps `bed.duck` one node upstream. Anyone reading this to find
the duck would have found a node that never moves. §5 carried the same
mistake and is corrected there too.

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
chain and forgot the input gain; corrected here 2026-08-16 and **in the banner
2026-08-18**, which had gone two months disagreeing with this line.)* The dials
are `clunkVoice.shaft` on the row a TOWERS entry references
(`js/voices.js CLUNK_VOICES`), so the palette still resolves
in the sound drain and nowhere else — and the FIRST LAW holds *by
construction*: a towerless roll records no `clunk` event, so no film can
reach this bus. Dice in hidden transit additionally get a
`lowpass 2200 Hz` that is removed at the mouth; the muffled-then-bright exit
sells the tower more than anything else in the chain.

**Five towers carry a voice**, not four, and the rows live in `js/voices.js`
(`CLUNK_VOICES`, keyed by tower id; the `TOWERS` registry row references it,
so a row still declares its palette and `towerCos(row).clunkVoice` still
answers by value).

| tower | voice | shaft | heard 2026-08-18 |
|---|---|---|---|
| `heartwood` | **thud 0.7/40** | 5.5 ms, g 0.50, 300 + 600 | *was* `clack 0.35/20` — **swapped with Bastion** |
| `bastion` | **clack 0.35/20** | 3.2 ms, g 0.55, 430 + 860 | *was* `thud 0.7/40` — **swapped with Heartwood** |
| `blackanvil` | **bell 0.55/70** | 2.5 ms, g 0.60, 520 + 1040 | *was* `chime 0.85/70` — **−15% centroid** |
| `nullstone` | hush 0.75/25 | 4.5 ms, g 0.34, 240 + 430 | **"sounds good" — untouched** |
| `hollowbole` | thud 0.5/35 | 4.0 ms, g 0.50, 360 + 720 | **"sounds good" — untouched** |

**B1/B2 is a swap and nothing else.** Joe: *"I'd probably switch the bastion
and heartwood sounds, they feel reversed to what I'd expect"* — and he is
right about the physics. A dice tower made of **planks** is a resonant box: a
die hits it and you get a low hollow tok with body. A **stone** turret is a
wall with a turret's mass behind it, so almost nothing transmits and what you
hear is a short bright tick off the surface. The rows were reasoned from
materials in the abstract ("stone is heavy, so stone is low") and had it
backwards. The two whole voices — body *and* shaft row — exchanged places, so
the SET of five is conserved exactly and the change reverts by exchanging two
keys. `tests/voices.test.mjs` asserts that conservation, which is what stops a
future "improvement" hiding inside a swap.

**B3 is a small move, and measurably small.** *"Slightly to shrill / clanky
for me.."* — so `chime 0.85` became the new `bell 0.55` body: band 2156 → 1686
Hz, log centroid 2487 → 2125 Hz (−15%), Q 2.8 → 1.8 (that is the *clanky*
half — a high-Q band rings on one note), 0 → 5 ms of attack, and **the same
loudness to within 0.02 dB** (`gainScale` was solved for it, not chosen). The
Witchlight chime beside it took −37% because he hated that one; the whole
point of the separate body is that one table cannot move a little for one
caller and a lot for another. The shaft row is untouched — the flue's colour
was never what he named.

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

So the palette is exactly two rows per venue, in `VENUE_AUDIO` (`js/voices.js`
since 2026-08-18), read through **one** function, `venueAudio()`. **Bold is
what 2026-08-18 moved**; everything else is as W6 shipped:

| | `table` (grounded) | `moonrise` | `foxfire` |
|---|---|---|---|
| the place | a warm room, a hearth, walls | a night clearing — treeline, open sky | a damp hollow — close air, standing water |
| pink ×  | 1 | **1.55** | **1.35** |
| brown × | 1 | 0.58 | 0.75 |
| air lowpass | 20 000 Hz | 1200 Hz | 900 Hz |
| air breath | 0.019 Hz, ±0 | 0.019 Hz, ±420 Hz | 0.013 Hz, ±240 Hz |
| tick rate | 4 /s | **1.15 /s** | **2.6 /s** |
| tick band | 900 + 2600, Q 3, 30 ms | **220 + 380, Q 6, 55 ms** | **170 + 250, Q 7, 75 ms** |
| tick **note** | **none** (a spark has none) | **×0.55 of band** | **×0.62 of band** |
| **swell** rate | **1 per 12 s** | **1 per 12 s** | **1 per 20 s** |
| **swell** band / depth | **90 + 210, +5.5 dB** | **300 + 1100, +11.3 dB** | **120 + 300, +8.4 dB** |
| ground centre × | 1 | 0.72 | 0.66 |
| ground length × | 1 | 0.85 | 0.78 |
| ground gain × | 1 | 0.90 | 0.85 |

**How each number was reasoned.** `brown` is the *enclosure* layer — §5 calls
it "the low end that makes a room feel enclosed" — so a clearing with no walls
cuts it hardest and a **hollow**, which is by its own name more enclosed than a
clearing, gets some of it back. The pink pair goes through a lowpass at
**1200 Hz, under §1's 1.5 kHz wood/metal boundary**: the same measure that
demoted `click` and seated `felt` at 700. That is leaf hiss at the treeline
rather than room air, and a fourth mutually-prime LFO (0.019 Hz, ±420 Hz on
the cutoff) is the wind moving through it. The tick layer stops being a fire
and becomes **condensation off the canopy**: rare, low, and longer-tailed,
because water lands in moss. Foxfire is "older and damper", so it drips more
than twice as often, lower, and its air sits lower and breathes shallower.

**What the listening changed, and why (2026-08-18).**

- **`pink` is no longer 1 in the fae rooms**, and the old row's reasoning was
  the bug: "the pink pair keeps its level but goes through a lowpass" is not a
  thing a lowpass does. A 1200 Hz cutoff throws away most of a 1/f spectrum's
  upper half, so the glade arrived **3.9 dB quieter** than the room he had
  just been in and the hollow 2.7 dB quieter. That is exactly *"super
  faint"*/*"VERY faint"*, it is comparative, and the arithmetic could have
  caught it before he ever heard it. 1.55 and 1.35 are the measured make-up
  gains; all three rooms now sit within 1.6 dB of each other.
- **The tick layer became audible and got a note.** Its amplitude law was
  `u³`, whose *median* is ⅛ — half of every room's events arrived at an eighth
  of the peak, under the room's own hiss. It is now `u^1.6` (median ⅓), the
  fae rates roughly doubled, and the fae drips carry a decaying **sine at
  0.55–0.62 of the pop's band centre**. A drip has a note where a spark does
  not, and a pitched event is the one a listener can *name* — which is the
  whole difference between "a room" and "noise". The hearth declares `tone: 0`
  deliberately: giving a fire a note would make it a music box.
- **A `swell` layer exists at all.** This is the finding behind A1/A2/A3 and
  it is not about spectrum: **steady broadband noise reads as white noise
  however you tilt it.** A place is made of *events* and *slow motion*, and the
  bed had one inaudible event layer and, for motion, three LFOs at 0.031–0.073
  Hz — periods of 14 to 32 seconds at depths of 40% of an already-inaudible
  layer, which nobody perceives as a room breathing. A swell is one filtered
  breath, up over ~2 s and down over ~3, on its own Poisson clock: the fire's
  body, wind through a treeline, the draught of a closed hollow. It costs three
  fire-and-forget nodes every ten-to-twenty seconds off the **shared** buffer,
  so `perHitBufferAllocs` is unmoved.

**How "can you tell them apart with your eyes shut" is measured.**
`bedDistance(a, b)` in `js/voices.js` splits the axes into **texture** (level,
colour) and **event** (rate, band, tail, note, swell), and the split is the
finding rather than a presentation choice: two rooms that differ only on
texture are one sound played louder or darker, which is precisely what Joe's
three sentences describe. The shipped rooms differed on texture; the test now
requires **≥3 of 5 event axes** per pair **and** that the level axis is
*false* — none of the distinctness may be done by volume.

**The ground is a second timbre tier, not a new body.** `IMPACT_SOFT_*` was
already a one-tier modifier over the resolved body (§3.2); the venue's floor is
another, in the same shape, and it **multiplies** rather than replaces. That is
the physically honest composition — the die keeps its own material and the
place says what that material does when it lands in it. A `moss` *body* was the
other design and it is worse: the venue stages a set whose voice always wins,
so a venue body would resolve on shrouded rolls only, i.e. almost never.

**What the fae venues' dice now land as, and why the ground row outlived the
die's own voice (2026-08-18, §9.0b).** The staged Witchlight set used to bring
`chime 0.22/65` — "a long faint cold ring" — and Joe's verdict on the live
table was *"when the dice hit the ground it sounds horrible in the two
venues… just use a normal sound."* **The set's `sound` recipe is deleted**, so
a fae die resolves `IMPACT_DEFAULT_BODY` at weight 0: the ordinary knock, with
the venue's floor over it and nothing else. The multiplier design is what made
that a one-line kill — because the venue's contribution was never a *body*,
removing the die's voice left a working sound rather than a hole.

**The trim itself was never implicated and is deliberately kept.** It only ever
makes a contact duller, shorter and quieter, so it was the one part of that
chain already pulling the way he asked; zeroing both fae rows — the naive
reading of "use the grounded table's sound" — would have taken a glade landing
from **1745 Hz up to 2344 Hz**. What it costs is that a fae landing is about a
third of an octave darker than a grounded one rather than identical to it, and
**that is the one lever left** if the next sitting says it is still not normal.

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

### 2.6 The cloth's voice (the mats arc, 2026-08-29)

Silt shipped on 2026-08-29 as a picture of a granular bed and nothing else.
The contact machine never learned the surface had changed, so a die landing in
a hand's depth of dry grain clicked and bounced six times exactly as it does
on wool over wood — **it looked right, so nothing said it was wrong.**

A cloth is therefore a **second surface tier**, the same shape and the same
argument as §2.5's ground and as `IMPACT_SOFT_*` before it: it *multiplies*
the die's own material rather than replacing it. A steel die still rings; the
silt says what that ring does when it lands in loose grain.

The rows live in `CLOTH_VOICES` (`js/voices.js` §4b), read through **one**
function, `clothVoiceFor(venueId, cloth)`:

| | `felt` (reference) | `silt` | `oak` |
|---|---|---|---|
| what it is | wool weave over a hard table | a hand of dry grain over stone | a waxed plank table |
| `centre` × | 1 | 0.58 | 1.3 |
| `length` × | 1 | 0.6 | 1.35 |
| `gain` × | 1 | 0.85 | 1 |
| `tail` × | 1 | 0.45 | 1.6 |
| `grind` × | 1 | 1.7 | 1.35 |
| `fizz` | 0 | 0.75 | 0 |
| taps it hands back | 6 | 3 | 12 |
| the tail runs | ~145 ms | ~104 ms | ~257 ms |

**The three rows are three answers to one question, and the order is the
design: grain catches, wool absorbs, wood returns.**

The first three are §2.5's dials and behave identically. The other three are
the ones that are about silt rather than about volume:

- **`tail`** multiplies the settle cluster's geometric ratio (§3.4), and
  therefore decides **how many taps there are** — the walk stops at 1 % of the
  first one. 0.42 → 0.189 takes the cluster from six taps to three, and the
  third arrives 3 ms behind the second at 3.6 % of its amplitude. What you
  hear is a thud, a pat, and then the thing that identifies a grain bed, which
  is *nothing*. This is the dial the whole idea rests on.
- **`grind`** is the sustained layer's spectral factor and the one number in
  the table that goes **up**. It is not a contradiction with `centre`: a mass
  of loose grain absorbs an impact (no cavity, no plate, nothing to resonate)
  and yet a die *dragging* through it generates broadband noise a wool weave
  never makes. **Down for the knock, up for the scrape**, and the pair is the
  material.
- **`fizz`** is how much of the face-clack modulation the surface smothers.
  §3.3's AM depth is what makes the clacks discrete and the 0.35 DC term
  carries the level, so "grind → hiss" costs one multiply and no loudness.

**Four properties, and the first two are the load-bearing ones:**

1. **The felt row is all identity**, so every table that has ever been played
   sounds byte-identical after this change *by construction* rather than by
   care. `clothAudioInfo().feltInert` is that claim, and it is the same
   discipline as `groundedInert` one tier up.
2. **The two tiers do not stack.** A venue lays one huge floor disc *over* the
   mat (`js/fae-lab.js` covers the felt and the 160-unit floor alike), so in a
   glade the dice are not on the cloth at all — composing them would voice a
   die landing in moss as if the moss were full of sand. `clothVoiceFor` owns
   that rule in one line; `clothAudioInfo().covered` publishes it.
3. **A baffle knock is never trimmed**, for the reason §2.5 gives: a die
   inside the tower is inside the tower. Same `groundFor(isClunk)`.
4. **Only LEVEL is capped, and a cloth may go up in every other dimension**
   (changed 2026-08-29 for oak). The first cut of this table copied §2.5's
   rule — the ground only ever subtracts — which is right for a *venue*,
   whose reference is the room you are already in, and wrong for a *cloth*,
   whose reference is wool over a hard table. A plank table is not a quieter
   felt. So `centre`, `length`, `tail` and `grind` are free in both
   directions and only `gain` keeps its cap, for the one reason that has
   nothing to do with materials: the 0.35 clamp is applied *before* this
   multiply, so a row at `gain: 1.4` would lift a landing straight through
   §5's plan. **A hard surface sells itself on duration at an unchanged
   peak** — the tap-tail finding, and it is what oak's twelve taps are.
   No rolling `targetLevel` moves either, so §4 stays literally true.

**`TAP_MAX` is a bound on COST, not a shaper of any tail.** It was 8 while
the felt's six were the longest thing in the app, and oak's twelve would have
been silently truncated by it — a tail that ends because it ran out of budget
rather than out of energy. It is 16, and `tests/voices.test.mjs` asserts that
every shipped cloth ends at the 1 % floor instead of at the cap. The reason
oak is not the ~410 ms the tap-tail finding named is the same budget: the gaps
are geometric, so a tail runs for `T0/(1−e)`, and 410 ms needs 21 taps — 420
scheduled one-shots on a twenty-die throw. `tail` is the dial if that is worth
paying for.

**The tail's rhythm now depends on the cloth, which §4 would otherwise
forbid.** It is safe for exactly one reason: the felt id is *room state*, so
both seats at a table resolve the same row and schedule the same taps. That
reason is checked through the real wire (`silt-has-a-voice` ⑤) rather than
assumed.

**An unvoiced cloth is silent about sound rather than wrong about it** — it
falls back to the reference row, the same way an unvoiced venue does, so
adding a mat stays a visual-only job until somebody writes its voice down.
`tests/felt-ids.test.mjs` is what makes that a decision rather than an
oversight: every cloth that is *painted* must also be *voiced*.

**Nobody has heard any of this.** Every other number in this document is a
fence around something Joe listened to; §2.6's row is an argument from the
material and the verdict is still his. §9 D is the route.

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

**4. `attackMs` — the second axis of "sharp" (2026-08-18).** Every one-shot in
this file began at full gain on its first sample: an instantaneous rise, which
is the steepest attack physically expressible and is heard as an ice pick
wherever the spectrum sits. Joe's *"far less sharp"* (C1/C2) and *"slightly to
shrill"* (B3) are about both axes, and moving the spectrum alone would have
left the transient exactly as it was. A body may now declare `attackMs` and
rise over that long instead; a body that does not is byte-identical to what
shipped. **Only `chime` (7 ms) and the new `bell` (5 ms) declare one** — the
default `felt`, `click`, `thud`, `clack`, `hush` and `crackle` keep their
edges, and `tests/voices.test.mjs` asserts that, because softening the most
common sound in the app by accident is exactly the kind of thing this change
could have done quietly. The **sine partial** wears the same rise: it is 40% of
the gain, and a softened noise burst with a zero-rise sine welded to its front
is still a sharp sound.

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

`e = 0.42 × cloth.tail`, `T0 = 85 ms`, `A0 = 0.5 ×` the landing impact's
computed gain, max 8 taps, stopping at 1 % of A0 — on the felt, six taps over
~145 ms, the last of them near-pure thump.

**The constants and the walk over them live in `js/voices.js`** (`TAP_*` and
`settleTail(cloth)`) since the cloth tier landed, with every other voice
number and for the same reason: how many times a surface hands a die back is a
*designed* quantity now (§2.6), and a designed quantity only observable by
driving a browser is one nobody checks. `js/main.js` walks that array and adds
the jitter, the amplitude and the voicing; it does not recompute the schedule.

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

The tail wears the venue's ground (§2.5) and the cloth (§2.6) too — a die
settles on the floor of the place it is in — through `vo.ground`, and the
cloth's `tail` on top of that, which is the one thing a surface may change
about the *rhythm*. Deliberately through `ground.centre` rather than the full
`centre`: the cluster does not apply the soft-strength tier (its own `0.85^k` walk down is the dulling), and folding it
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
| Room bed | pink **0.015** + brown **0.030** + tick **0.05·u^1.6** + swell **0.022** | present enough that absence is noticeable |

The bed row is the **grounded** room's. A venue re-balances it (§2.5); the
ground multipliers only ever subtract, and the bed's `pink`/`brown` may carry
a make-up gain for what the venue's own air filter takes out but nothing else.
These numbers stay Joe's dial: **the venue says what the room is made of, the
mix plan says how loud a room is allowed to be.**

*Raised ×5 on 2026-08-18, the first time anybody turned them after hearing the
result.* Measured, the shipped bed ran at **−59.8 dBFS RMS at the output** —
48 dB under the loudest impact and under the noise floor of most rooms. That
is not a quiet bed, it is an inaudible one, and *"super faint"* / *"VERY
faint"* is what it sounds like. The three rooms now sit at **−45.9 / −47.5 /
−47.5 dBFS**: audible in a quiet room, still ~34 dB under a landing, still the
quietest thing in the app by a wide margin. `tests/voices.test.mjs` holds both
ends of that (a floor **and** a ceiling — a bed that got loud enough to
compete with the dice would fail the same assertion).

**Duck direction is fixed: ambience ducks, dice never.** No compressor does
this; it is a scheduled ramp on **`bed.duck`** — −4 dB with a 250 ms attack at
roll start, recovering with τ = 1.2 s from the last die's settle. Both edges
are slow enough that the gesture itself is imperceptible, and the recovery
does narrative work: *the room coming back* is the strongest "roll is over"
cue in the app.

*This paragraph said `roomGain` until 2026-08-18 and §2.2's diagram labelled
that node "the duck point". Neither was true: `AUDIO.room` is a unity gain
written once at build and never again, and `roomDuck()` has always ramped
`bed.duck`, one node upstream. See §2.2 for the other two errors in the same
picture.*

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
    **a repeating tuned voice in a fae venue is precisely what was killed on
    2026-08-18** — this clause used to say the glade's one-bright-element seat
    was "already taken by the staged set's chime on every landing", and that
    chime is exactly the thing Joe called *horrible*; §1 permits one bright
    element as an ISOLATED HIGHLIGHT, and a moot-ring voice would fail the same
    way the chime did, by repeating (§9.0b, UX §7.60). And the layer leans IN
    exactly when dice are down and readable, which is the worst possible moment
    to add a sound (goal 15). If it is ever built it needs a film-derived or
    seed-derived clock, not the stage's — **and it must not be a chime.**
14. **A venue may not switch the bed on.** It changes what the room is made
    of, never whether the room is audible. Selecting a venue is a *visual*
    choice a player makes; flipping an audio switch inside it is refusal 7
    ("no binding audio to visual toggles") wearing a different hat, and an
    inferred sound the UI does not report is the same green-check-masks-a-
    broken-thing shape as an inferred mute.

## 7. DIAL FOR JOE

**Turned 2026-08-18, after the first sitting** (so these are no longer
guesses, they are first answers to a real verdict): the bed levels ×5, the
tick amplitude law `u³ → u^1.6`, the fae `pink` make-up gains, the fae drip
rates and notes, `BED_SWELL`, the `chime` body, the new `bell` body, and which
tower wears which voice. Every one of them is in `js/voices.js` and every one
is measured in `tests/voices.test.mjs`.

**And then APPROVED, later the same day** (§9.0b). Every dial in the list above
except the `chime` body now carries a human verdict, which changes what this
section is for: **these are no longer dials, they are settings.** A dial you
turn without a new verdict is a verdict thrown away.

- **`BED_PINK` / `BED_BROWN` / `BED_CRACKLE` / `BED_TICK_SHAPE` / `BED_SWELL`
  and every `VENUE_AUDIO` bed row — APPROVED.** *"All other audio sounds
  good."* Frozen in `tests/voices.test.mjs` as `APPROVED_2026_08_18`. The
  fae drips keep their **note** and their Q 6 / Q 7 bands: they look like the
  clankiest things in the app on paper and he judged them fine.
- **All five `CLUNK_VOICES` rows — APPROVED**, including the B1/B2 swap and
  B3's new `bell`. B4 and B5 are now approved twice over.
- **The `chime` body is NOT approved and never was.** Its 3400 → 1750 re-voice
  was commissioned by a caller that has since been deleted; three unheard
  grounded-table sets carry it now. It belongs on the next listening page.

**Still untouched and still his:**

- `ROLL_GAIN` 0.05 and the 0.12 rolling sum clamp — the loudness of the
  grind relative to landings.
- Felt band centre 380 Hz and tilt ceiling 1800 Hz — the warm/dull boundary.
- Duck depth −4 dB and recovery τ 1.2 s — how much the room "breathes".
- Whether the bed ever ships on by default (currently: never before an hour of
  continuous listening).
- **The two ground trims in `VENUE_AUDIO` (§2.5)** — the biggest single lever
  left. `centre` alone moves the impacts, the whole settle tail, the surface
  band and the tilt curve together, so it is one number per venue.
- **`BED_VOICE_S` 3 s** — how long the room takes to become a different room.
  It only ever runs when a venue changes with the bed already up.
- The `restY` polyhedron constant (0.75 · radius) — verify against a baked
  settle; the rough track's surface class supersedes it.
- Clunk density on 40-die pours. If it grates, drop `POUR.clunkMax` to 3
  rather than reshaping the plan.

*(This section used to list three numbers "most likely to want turning next if
the second sitting says close, but" — `BED_SWELL`, the two bed levels and the
fae drip rates. **The second sitting said good.** All three are approved and
none of them is a candidate any more.)*

**The one number still likely to want turning, after §9.0b:**

1. **The two fae `ground` rows** — the only thing still separating a fae
   landing from a grounded one, now that the ringing die is gone. They cost
   about a third of an octave of darkness. `{centre: 1, length: 1, gain: 1}` on
   both makes a landing in the glade byte-identical to one on the felt, which
   is the strictest reading of *"just use a normal sound"*. Kept as-is because
   a trim that only subtracts was never what he was objecting to (§9.0b
   finding 3) — but it is his call, and it is one edit.

## 8. Where the tests are

### 8.0 `tests/voices.test.mjs` — Joe's verdicts as arithmetic (2026-08-18)

**Run it with `npm test`; it costs 40 ms and it is where a claim about a SOUND
goes.** Nobody working on this audio can hear it — not the agent that changes
a voice and not the orchestrator that asked for the change — so each of the
eight complaints in §9 was turned into a property with a number attached, the
value of that number **on the tree he listened to** was frozen into the test as
`BASELINE_2026_08_17`, and every assertion states a direction and a size.

The ruler is in `js/voices.js`: `biquadMag` is the Audio EQ Cookbook transfer
function (what `BiquadFilterNode` implements, so the filter half is the
browser's own arithmetic), `impactSpectrum` reports **log centroid**, the
**share of power above §1's 1.5 kHz boundary**, the sine partial's line, the
body's broadband gain and the attack in ms, and `bedProfile` reports a room's
**dBFS RMS, colour, audible events per second, event note, and swell rate and
depth**.

Two choices in that ruler are load-bearing and are argued in the file:

- **The centroid is the log-frequency one.** The textbook linear centroid
  diverges on a 6 dB/oct bandpass skirt, so *widening* a resonance — exactly
  what "less clanky" asks for — makes the number go UP while the sound gets
  duller. The ruler would have contradicted the change it exists to check.
- **Event audibility has an absolute floor as well as a relative one.**
  Counting events against the bed's own RMS alone is perverse: it scores a
  quieter room higher, and the room Joe called *"VERY faint"* would have won.
  `BED_AUDIBLE_DBFS = −55` is derived from §5's own ceiling and a comfortable
  playback level.

**What it cannot prove** is that anything sounds good, and it does not try.
What it proves is that a change **moved, in the direction a word asked for, by
an amount somebody wrote down** — which turns "please listen again" into
"please listen again and tell me if the direction was right".

**Since §9.0b it carries a second kind of constant, and the difference
matters.** `BASELINE_2026_08_17` is a record of sounds that were *wrong*, kept
so a fix can be shown to have moved; `APPROVED_2026_08_18` is a record of the
eight that are *right*, and it is asserted with **equality rather than
direction**. An approved voice that drifts is not a regression you can measure
your way out of — the verdict is simply gone, and the only way back is another
hour of Joe's time. A third block, `REJECTED_2026_08_18`, freezes the C rows as
he heard them on the live table, which is what makes "this was tuned twice and
tuning is not the answer" a claim with numbers behind it rather than a mood.

`tools/steps/voice-spectra.mjs` is its partner and catches the other lie: it
drives a real tab and asks `impactVoicingFor` / `venueAudioInfo` — the same
resolvers `playImpact` and `bedBuild` use — for all ten rows, then asserts the
centres the **app** resolves match the tables the unit test measures. A
beautiful table nobody wired would pass one and fail the other.

```
node tools/drive.mjs tools/steps/voice-spectra.mjs
```

### 8.1 The e2e tags

Tag `audio` (with `fx` and `roll`), in `tests/e2e/scenarios.mjs`:

| Scenario | Proves |
|---|---|
| `audio-graph` | nothing at boot; one roll builds the whole graph once; nine pan buses at ±0.6; zero per-hit buffer allocations against a non-zero one-shot count; suspended until a real gesture and running after one; three gate cursors; the 18 ms floor; mute reaching the master node |
| `audio-phases` | the three-phase machine over a real film: rolling frames exist, `settled` is absorbing and flips exactly at `landings[i].frame`, a settled die reports zero speed, no despawn teleport under a tower, every hidden frame reports `hidden` |
| `audio-rolling` | film-derived target levels rise for rolling dice; the pool never exceeds `MAX_DICE_ON_TABLE` and drains to zero live voices after a clear |
| `audio-settle` | one scheduled cluster per die, geometric intervals within jitter tolerance, byte-identical schedules for the same seed, and the impact cursor unmoved by taps |
| `audio-shaft` | the shaft bus exists only under a socketed tower, and `impactVoiceFor` — not `towerClunkVoice` — is what says a towerless roll has no shaft |
| `audio-ambience` | the toggle defaults off, no bed sources when off, and `soundOn === false` forces zero bed sources regardless |
| `oak-is-a-hard-surface` | **Shipped 2026-08-29** (tags `mat audio net`). The tile is BANDED where a weave is not (row luminance sd 8.4 against the felt's 0.5); the landing brightens and lengthens by the row's own factors while the PEAK does not move, which is the whole of how a hard surface is sold under §5's ceiling; twelve taps declared and twelve rendered, none of them cut by `TAP_MAX`; and the id is legal on the wire |
| `silt-has-a-voice` | **Shipped 2026-08-29** (tags `mat audio roll net`). The felt is inert in effect and `feltInert` agrees; silt trims a landing by the exact product of the felt's own measured answer and its declared row, outside the 0.35 clamp; a baffle knock over silt keeps the neutral ground; the two cloths bake the SAME film (a surface may be heard, not felt) and move no rolling `targetLevel`; the tail is six taps on felt and three on silt with the same first gap and under 40 % of the remainder; the grind's band rises by `grind` and its AM depth falls by `1 − fizz`, both read off the live AudioParams; both seats at one table wear the same cloth; and a venue's floor covers the mat, after which the cloth says nothing |
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

*Closed 2026-08-29.* `clothAudioInfo().live` reads the standing rolling
voice's band, tilt, depth and level off the AudioParams, and
`silt-has-a-voice` ④ asserts the product on them. `audio-venue` still makes
the weaker claim; the instrument now exists for anyone who wants to strengthen
it.

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

## 9. The listening script — ten voices, and what he said

**Heard 2026-08-18. The verdicts below are Joe's exact words** and they are
the specification for everything §2.4, §2.5, §3.2 and §5 changed on that day.
Nine of these voices had never been played to a person and the tenth (the
grounded bed) had been playable since V1 with nobody sitting with it; they are
cheap to make and expensive to *find*, which is the only reason the backlog
existed. The route below is unchanged and still ordered so that **exactly one
thing changes between consecutive rows.**

### 9.0 THE RECORD — first sitting, 2026-08-18

*Every "re-listen?" in this table has since been answered — see §9.0b. Eight
rows came back **approved** and the three C rows came back **killed**. The
column is left as it was written because the record is the point.*

| # | voice | **his words** | what changed | re-listen? |
|---|---|---|---|---|
| A1 | The Table (bed) | *"sounds like white noise mostly"* | bed +13.9 dB; tick law `u³→u^1.6`; new swell layer (fire's body, 1 per 12 s) | **YES** |
| A2 | Moonrise Glade (bed) | *"more white noise, super faint"* | bed +16.2 dB (incl. a 1.55 pink make-up gain — it was 3.9 dB *under* A1); drips 0.35→0.72 audible/s and now **pitched**; wind swell +11.3 dB | **YES** |
| A3 | Foxfire Hollow (bed) | *"deeper white noise, VERY faint"* | bed +15.0 dB (1.35 make-up); drips 0.80→1.69 audible/s, lower, wetter, **pitched**; a rarer, shallower draught | **YES** |
| B1 | Heartwood clunk | *"I'd probably switch the bastion and heartwood sounds, they feel reversed to what I'd expect"* | **swapped with B2.** Now `thud 0.7/40` over the 5.5 ms comb — band 1114→338 Hz | **YES** |
| B2 | Bastion clunk | *(the same note)* | **swapped with B1.** Now `clack 0.35/20` over the 3.2 ms comb — band 338→1114 Hz | **YES** |
| B3 | Black Anvil clunk | *"Slightly to shrill / clanky for me.."* | `chime 0.85` → new `bell 0.55`: centroid −15%, Q 2.8→1.8, attack 0→5 ms, **loudness held to 0.02 dB** | **YES** |
| B4 | Nullstone clunk | **"sounds good"** | **nothing. Do not touch.** | no |
| B5 | Hollow Bole clunk | **"sounds good"** | **nothing. Do not touch.** | no |
| C1 | Witchlight chime | *"I hate this sound. I'd prefer something far less sharp"* | `chime` body re-voiced 3400→1750, Q 2.8→1.5, attack 0→7 ms: centroid −37%, partial 1836→991 Hz | **YES** |
| C2 | Moonrise ground | *"I hate this sound. I'd prefer something far less sharp"* | same body (see below): centroid 2749→1745 Hz, and **46% of its energy is now under §1's 1.5 kHz line, against 3% before** | **YES** |
| C3 | Foxfire ground | *"Also to shrill / sharp"* | same: centroid 2536→1612 Hz | **YES** |

**Eight rows need a second sitting; B4 and B5 do not, and must not move.**
They are the only two data points of his taste being *satisfied* and they are
the reference the others were sized against — B3 was deliberately **not**
taken down into their register.

### 9.0b THE RECORD — second sitting, 2026-08-18, on the live table

**He listened to all of the above and answered it in two sentences.** This is
the sitting that turned this palette from a set of arguments into a set of
verdicts, and §9.0 above is now history rather than a to-do list.

> *"I still dislike the clankyness of the Moonrise glade and Foxfire Hollow.
> Just use a normal sound I think.. The idea you had was fun but unfortunately
> is just not working. **All other audio sounds good.**"*
>
> …and, asked which part: *"When the dice hit the ground it sounds horrible in
> the two venues. **Everything else is fine.**"*

| rows | verdict | what happened |
|---|---|---|
| **A1 A2 A3** the three beds | **APPROVED** | nothing. The ×5 level fix, the `u^1.6` tick law, the fae make-up gains, the **pitched drips** and the swell layer all stand |
| **B1 B2 B3 B4 B5** the five clunks | **APPROVED** | nothing. The swap, the new `bell`, and the two that were already good |
| **C1 C2 C3** the ringing die | **KILLED** | the Witchlight set's `sound` recipe is **deleted**. Its dice now land on `IMPACT_DEFAULT_BODY` — the ordinary knock — in both venues |

**Eight voices are approved and it is the first sign-off this palette has ever
had.** `tests/voices.test.mjs` freezes them as `APPROVED_2026_08_18` and
asserts equality rather than direction: an approved voice that drifts is a lost
verdict, and the only way to get it back is to spend another hour of his time.

**Three findings, and the first one is a correction of §9.0's own headline.**

1. **C1/C2/C3 were not merely one body — they were one rendered *sound*, and
   the app could never have produced the other two.** §9.0 finding 1 got the
   body right and stopped one step short. Two facts compose: the Witchlight set
   is `venueOnly`, so it is reachable *only* as the staged set of the two fae
   venues; and `groundFor(isClunk)` puts the standing venue's ground over every
   non-clunk contact. **There is no way to ask this app for the Witchlight die
   without a fae floor under it** — `tools/steps/voice-spectra.mjs` had already
   run into exactly this and said so in a comment. §9.1's C route never leaves
   Moonrise Glade, so C1 and C2 were the same sound heard twice. That is why
   *"everything else is fine"* cannot be read as approving C1 while condemning
   C2: **there was no separate C1 to approve.**
2. **The defect was the body being used for a COLLISION, not the band it sat
   at.** The first sitting's *"far less sharp"* was delivered in full — 3400 →
   1750, Q 2.8 → 1.5, 7 ms of attack, a glade landing down 37% of its centroid
   and from 97% to 54% of its energy over the wood/metal line — and he heard
   *that* and said it still sounds horrible. A resonant, partial-bearing body
   is a bell, and **this app never strikes a landing once**: one die brings a
   sine partial plus a five-tap settle cluster inside 145 ms, times every die
   in the pour. Struck once it is an event; struck forty times in two seconds
   it is clanking. No band moves that.
3. **The venue's ground trim was never a candidate**, and the arithmetic says
   so rather than the taste. It only ever makes a contact duller, shorter and
   quieter — it was the one element of that chain pulling the way he asked.
   Zeroing the two fae ground rows, which is the naive reading of "use the
   grounded table's sound", would have taken a glade landing from **1745 Hz up
   to 2344 Hz** and from 54% to 83% of its energy above the boundary. **The
   rows are kept**, and they are the one remaining lever if the next sitting
   says it is still not normal enough.

**One near-miss worth keeping**, because it is the shape of mistake this file
exists to prevent: *"clankyness of the Moonrise glade and Foxfire Hollow"* was
first read as a complaint about the **fae bed drips**, and the reading was well
evidenced — the drips are pitched and sit at **Q 6 and Q 7**, against the Q 2.8
that earned the word "clanky" on Black Anvil, making them the narrowest
resonances anywhere in the app. It was wrong. He named the *venues*, and what
he meant was dice landing. **The drips are approved and stay pitched**; the
freeze in `tests/voices.test.mjs` is what would now catch a repeat.

**Four things the first sitting taught that were not in any row:**

1. **C1, C2 and C3 are ONE voice**, which is why he used the same sentence
   for two of them and a near-identical one for the third. The script lists
   three things to judge and they are three *contexts* of the Witchlight set's
   `chime` — the die's ring, then that ring with each venue's ground over it.
   No ground trim could have rescued it either: the deepest floor in the app
   (×0.66) applied to a 3.4 kHz band still lands at 2.2 kHz. **The fix had to
   be the body**, and that is also why B3 got a *separate* body — one table
   cannot move a little for one caller and a lot for another.
2. **"Faint" was comparative, and the arithmetic could have caught it.** The
   row for both fae beds said the pink pair "keeps its level but goes through a
   lowpass", which is not a thing a lowpass does: the glade arrived 3.9 dB
   under the room he had just been in. §2.5.
3. **The fae bed premise did not land, and not because of its spectrum.**
   Steady broadband noise reads as "white noise" however you tilt it. A place
   is made of *events* — something intermittent, sparse, identifiable — and of
   *slow motion*. The bed had one event layer whose amplitude law buried nine
   pops in ten, and for motion three LFOs with 14-to-32-second periods.
4. **The palette's whole level was wrong**, not just the fae rooms': −59.8
   dBFS RMS is inaudible, not quiet, and every "is this dull enough?" judgment
   made above it was made at the wrong volume.

### 9.1 The route — same script, second sitting

> **THE SECOND SITTING HAPPENED (§9.0b) AND THIS ROUTE IS NOW A REFERENCE, NOT
> A QUEUE.** Sections **A** (the three rooms) and **B** (the five towers) are
> **APPROVED** — do not put them in front of him again without a reason. Only
> **C** changed after he heard it, and it changed by deletion. The route is
> kept because it is still the right way to *walk* this palette when something
> new lands next to it, and because the "listen for" columns are the only
> plain-English description of what each voice is supposed to be.

**Preamble, once.** Open the table on **`?stability=beta`** — venue and tower
are closed-beta rows and the pickers are simply absent without it (`BETA_ROWS`;
UX §7.38). Then `⚙` → **You** → **Room tone** ON (the bed is off by default) →
**Staging**. You are now parked with the panel open; leave it open, it covers
nothing that makes a sound.

**A roll is two clicks:** a row in the left column, then **Roll**. Tap the row
N times first for N dice — the extra taps are optional and are not counted
below. For a big pour (the tower voices want one) `/` → `8d6` → Enter is
faster, and is the only keyboard in this script.

**One thing to know before A1: the bed arrives over six seconds** (`BED_FADE_S`)
and its slow layer fires about **every 12 seconds**. A minute a room is now the
minimum rather than a suggestion — under about 25 seconds you will hear the
hiss and none of the motion, which is the state that produced the first
verdict.

#### A. The three rooms — no dice, just the room

A minute each with nothing on the felt. What is being judged is whether the
room is a *place*, and whether it is quiet enough to disappear.

| # | Voice | The two clicks | Listen for | asked |
|---|---|---|---|---|
| A1 | **The Table** — hearth, walls | `Staging` → **The Table** | the reference, now ~14 dB louder. Sparse bright fire ticks (~2/s audible), and **a low breath every ~12 s** that is the fire's body, not a spark | is it a fire, and is 14 dB the right amount? |
| A2 | **Moonrise Glade** — clearing | **Moonrise Glade** → *(nothing; wait 3 s, then a minute)* | it is **no longer quieter** than A1 — that was the bug. The low end steps back, the top goes soft, and the drips are now **pitched**: each one has a note. A long **gust** every ~12 s is the treeline. The change takes 3 s (`BED_VOICE_S`): **that transition is a voice too** | can you tell it from A1 with your eyes shut? |
| A3 | **Foxfire Hollow** — damp hollow | **Foxfire Hollow** → *(wait 3 s, then a minute)* | closer, wetter, more enclosed than A2: **more than twice A2's drip rate**, lower, longer-tailed, more strongly pitched. Its slow layer is rarer and shallower — a draught, not wind | and can you tell it from A2? |

*Then go back — **The Table** → **Moonrise Glade** once more. The A/B is where
"is this the same building?" actually gets answered, and it is the question the
first sitting answered "yes" to.*

**If any room now moves too much**, `BED_SWELL` is one number and `swell: null`
on a row removes the layer from that room entirely (§7).

#### B. The five tower voices — under The Table, on equal ground

Put the grounded venue back first (**The Table**) so every tower is judged on
felt with all ground trims at 1. Room tone may stay on; off is a cleaner read
of the knocks.

| # | Voice | The two clicks | Listen for | asked |
|---|---|---|---|---|
| B1 | **Heartwood** `thud 0.7/40` | **Heartwood** → **Roll** | **the swap.** The wooden tower is now the LOW one: a plank box is a drum, and this is the hollow tok it gives back, over the longest comb of the pair | is this the right way round now? |
| B2 | **Bastion** `clack 0.35/20` | **Bastion** → **Roll** | **the other half.** Stone gives a die almost nothing back — a short bright tick off a surface with a turret's mass behind it | — |
| B3 | **Black Anvil** `bell 0.55/70` | **Black Anvil** → **Roll** | **a deliberately small move.** Still the ringing tower, still cast iron rather than crystal: the band is down 22%, the ring is opened out (that is the "clanky" half) and the strike has 5 ms of rise instead of an edge. **Same loudness as before, to 0.02 dB** | is "slightly" the right size, or does it want more? |
| B4 | **Nullstone** `hush 0.75/25` | **Nullstone** → **Roll** | **unchanged — you said this one is good.** Here only as the reference for what "good" sounds like beside the three that moved | *(skip unless a comparison wants it)* |
| B5 | **Hollow Bole** `thud 0.5/35` | **Moonrise Glade** → **Roll** | **unchanged — you said this one is good.** | *(same)* |

*B5 moves two things at once (tower **and** venue) and there is no way around
it: Hollow Bole cannot stand in the grounded room.*

**The one new risk in section B, named rather than discovered.** After the
swap, Heartwood (`thud 0.7`) and Hollow Bole (`thud 0.5`) are the closest pair
in the palette — same body, one weight step apart, combs 1.5 ms apart. That is
honest (a solid plank box and a hollow trunk really are neighbours) but it has
never been A/B'd. **If they read as the same tower, B5 is the one that stays
and Heartwood is the one that moves** — B5 has a verdict on it and Heartwood
does not.

#### C. The venue's dice and its ground — you are already there

Stay in **Moonrise Glade** from B5. Every roll is now Witchlight on moss.

**THE THREE C ROWS ARE ONE ROW, and the script should stop pretending
otherwise.** They were three *contexts* of the Witchlight set's `chime` — and
because that set is `venueOnly` and the venue's ground rides every non-clunk
contact, the app cannot make C1 without a fae floor under it. §9.0b finding 1.
The route below never leaves the glade between C1 and C2, so those two were
always the same sound heard twice.

**And the body is gone.** The set's `sound` recipe was deleted 2026-08-18
(§9.0b): a fae die now lands on `IMPACT_DEFAULT_BODY` — the same `felt` knock
every unthemed die makes — with the venue's floor over it and nothing else.

| # | Voice | The two clicks | Listen for | asked |
|---|---|---|---|---|
| C1 + C2 | **Moonrise landing** — `felt` under ×0.72 / ×0.85 / ×0.90 | *(a row ×8)* → **Roll** | **a knock, not a bell.** No ring, no note under it, nothing above the wood/metal line. Judge the **settle tail** hardest — five taps in ~145 ms is where a floor either sounds soft or sounds broken — then the grind as the pile rolls out | is this "a normal sound"? |
| C3 | **Foxfire landing** — `felt` under ×0.66 / ×0.78 / ×0.85 | **Foxfire Hollow** → **Roll** | the same again, a touch deader. **If C2 and C3 are indistinguishable the two rows should collapse into one** — still open, and neither 2026-08-18 pass widened the gap | — |

**The one lever left in section C**, and it is the answer if the knock still
does not sound normal enough: the two fae `ground` rows in `js/voices.js`. They
are kept because a trim that only ever *subtracts* was the one thing pulling
the old voice the way he asked (§9.0b finding 3), and they cost the fae rooms
about a third of an octave against the grounded felt. **Set both to all-1s and
a fae landing becomes byte-identical to a grounded one** — one edit, and it
should be his call. `ground.centre` moves the impacts, the whole settle tail,
the rolling surface band and the tilt curve *together*, by design.

#### D. The cloth under the dice — two mats, one throw (2026-08-29, UNHEARD)

Come home first: **The Table** as the venue, sound on. This section is not
like A, B or C — every voice in those was heard and then tuned to a sentence
Joe said. §2.6's row was reasoned from the material and has never been played
to anybody, so what follows is a route rather than a defence.

**Roll the same handful twice, switching only the mat.** The film is identical
under both cloths (`silt-has-a-voice` asserts it), so anything you hear
change is the surface and nothing else.

| # | Mat | The two clicks | Listen for | asked |
|---|---|---|---|---|
| D1 | **Walnut** (or any felt) | *(a row of ×8)* → **Roll** | the reference. The tail is the part to fix in memory: six taps over ~145 ms, and the pile's grind as it rolls out | — |
| D2 | **Silt** | settings → **Silt** → **Roll** | **the tail, first and hardest.** Three taps, the last two inside 20 ms — a thud, a pat, then nothing. Then the grind: it should have gone from a rate of clacks to a *hiss*, at the same loudness and about two-thirds of an octave brighter | does this sound like dice landing in dry grain? |
| D3 | **Taproom** | settings → **Taproom** → **Roll** | the opposite of D2, and the peak is the thing NOT to listen for — it cannot move. Twelve taps over ~257 ms: a die should CLATTER and go on clattering about twice as long as on the felt, brighter with it | does it sound like a hard table, or just like a louder felt? |

**What is being claimed about SILT, so it can be rejected precisely:**

1. **The catch.** A grain bed does not hand a die back. If D2 still sounds
   like a bounce, `tail` is not low enough (0.45 today; 0.21 would leave two
   taps, and below that a landing stops being an event).
2. **The hiss.** If the grind reads as *brighter felt* rather than as grain,
   `fizz` is the dial — it is 0.75, and it is the difference between clacks at
   a rate and a continuous scrape.
3. **The deadness.** If the landing itself sounds *muffled* rather than
   *absorbed*, `centre`/`length` (0.58 / 0.6) went too far; they are already
   past the deepest floor in the app, which is Foxfire's standing water.

**And the one thing that is not a dial:** if silt sounds right but the whole
table now sounds quieter, that is `gain` at 0.85 doing what a bed of grain
does, and it is the only number here that touches level.

**For OAK the claim is narrower and the failure mode is specific.** A hard
surface cannot be made louder — §2.6 property 4 — so everything it has is the
tail and the brightness. If D3 reads as *busy* rather than as *hard*, twelve
taps is too many and `tail` comes down; if it reads as felt at a different
colour, `centre` (1.3) is too shy. And if it wants to be genuinely LOUDER than
the felt, that is a change to the mix plan rather than to this table, and it
should be his call rather than a row quietly exceeding the ceiling.

**The single control that answers most of section A** is `BED_SWELL`, then the
two bed levels — but note that section A is **approved** and needs no sitting.

**Deliberately not in this script:** the duck (§5) is unchanged and keeps its
own dials, and the living layer has no voice at all — refusal 13 says why.
