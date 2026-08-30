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

# Immersion — the research record and the experiment slate

*2026-08-09. Written against HEAD (`c4479b6`). Every mechanism claim below was
re-read in source; where a proposal's mechanism was wrong, the corrected one is
given and the correction is named. Nothing here is implemented.*

---

## The finding

**The effects ladder is complete and it is entirely per-DIE. Nothing in this
app is authored per-MOMENT.** Levels 1–5 all shipped: texture-space authoring,
shader injection, an instanced particle field, felt decals, per-die lights, a
hand-rolled post stack. That is ~1,900 first-party lines describing what a die
*is*. Against it: the camera has three writes in the whole application
(js/main.js:168-169 at boot, js/main.js:12725-12727 inside the framing
solver, js/main.js:5834 on resize) and has never moved during a roll; the
audio surface is 78 non-comment lines with one call site (js/main.js:2336);
the world outside the felt is a flat background colour, three analytic lights
constructed at boot and never written again, and a 512×256 painted sky nobody
can see. `scene.fog` is unset. `THREE.Raycaster` appears zero times in
js/main.js — no player has ever touched a die.

**Three intervals are empty, and they are the three that matter.** Between
pressing Roll and knowing the answer the app spends 0 ms and 0 pixels: one
dimmed draft zone on one of six roll paths, and online the comment at
js/main.js:14515 says it plainly — *"animation waits for the SSE event."* The
last 56 % of a 1d20 tumble is silent by construction, because cannon dispatches
`collide` only on first contact of a pair. And the moment the die decides is
covered by `stageHitStop` (js/main.js:4091), a 0.3 s CSS flash fired over dice
that were parked at their final pose 450 ms earlier. Meanwhile the client holds
the complete answer at t=0: `playRoll` bakes the entire tumble synchronously
before frame one (js/main.js:1930-2153) and face correction fixes every final
pose (js/main.js:2088-2118). **This app is not simulating a roll. It is
playing back a recording it has already finished making, and it has never once
directed that recording.**

**The biggest levers, in order: the camera, the settle, and the contact
recorder.** The camera is the one thing ROADMAP C24 has already ruled
per-viewer and therefore safe to vary, and it is currently pointed at a
rectangle of cloth. The settle is where the drama measurably is and where the
app is measurably silent and still. And the contact recorder is a shipped
defect with a number: on 40d6, all 400 recorded events land on the first
simulation step, none below y=0.6 — confirmed by independent re-simulation
against the vendored cannon-es. **A forty-die roll lands in complete silence,
with no particles, no decals and no shock ring, and nothing tests it.** Fixing
that one array hands the entire Level 3/4/5 layer back to every large pool and
costs a per-step counter.

---

## THE STATE OF PLAY

### The effects ladder is complete; a third of its knobs have no consumer

Ten houses, 17 sets, and the following are wired, compiled into every shipped
table, and driven by nobody: `accent` (read only by js/lab.js), `shader.pulse`
(retired 2026-08-04, still compiled), **`shader.dissolve` — the noise-threshold
`discard` with a burning edge at js/dice.js:529-537, declared by voidgrain
(js/themes.js:430), and `grep uDissolve js/main.js` returns nothing**. Also
dark: particle kinds `bubbles` and `dust`, die-light modes `wave` and
`flicker`, `geo.segments`, `maps.relief.tint`, `decal.alpha`,
`post.ring.width` and `.dur`. `ParticleField.wisp` (js/particles.js:166) has
zero table call sites.

Headroom: every one of those is pre-paid machinery that survived a taste audit
which killed only the *application*, not the mechanism.

### The camera has never moved, and it fails silently on a phone

`applyCameraFraming` (js/main.js:12712) takes the preset eye, forms a ray to
`CAM_TARGET` (js/main.js:12688, `(0,0,0.5)`, `const` since the project began),
and walks 90 steps of 0.03 outward until all eight `framingPoints()`
(js/main.js:12696) project inside their NDC margins. **If nothing fits, the
loop falls out at i=89 with no log and no flag** (js/main.js:12723-12731).
Computed against the vendored three.js: it fails at every zoom preset below
~370 px of canvas. On a 390 px phone the eye is pinned at 3.67×, `camY` 24.6,
and ~20 % of the mat floor — the left and right strips, exactly where the
physics side walls are — is off screen. Dice land there.

The framing points reduce to the mat rectangle plus two pill halos:
`outerX = shelfSlotX(4) + SHELF_SLOT_W/2` is `TABLE_W/2` **exactly**, at every
preset. Dice are not an input to framing at all. That is C24's complaint,
verbatim, and C24 has already ruled the direction approved and per-viewer.

Headroom: the vertical budget. At 278×844 the y-margins are satisfied with
0.73–0.85 NDC to spare while x is over by 0.20–0.30. Every shipped eye holds
62–64° elevation (`CAM_EYE.full` `[0,8.1,4.7]` against `CAM_TARGET` is 62.6°).
Nothing has ever traded elevation for width.

### Sound is one filtered noise burst, in mono, at one volume

`playImpact` (js/main.js:669) builds a mono `AudioBuffer` of
`Math.random()*2-1` through one `BiquadFilterNode` into a `GainNode` connected
**straight to `audioCtx.destination`** (js/main.js:706). No master bus, no
compressor, no panner, no listener, no reverb, no room tone, no UI sound, no
ceremony sound, no crit sound — `playCritEffect` (js/main.js:3922) is named
"play" and produces no audio. One global 35 ms rate limit caps the app at
~28 sounds/second.

Three measured facts: `Math.min(0.35, strength * 0.06)` saturates at strength
5.83, so **60–81 % of impacts are already clamped to the same ceiling** — a
6-unit tap and a 90-unit slam are the same volume. `recordCollision`
(js/main.js:1992) discards `e.body.material`, which is one comparison away from
felt/wall/die identity. And the AudioContext is constructed lazily at
js/main.js:675 and **never resumed** — `grep '\.resume()' js/main.js` returns
nothing — so a spectator who opens a room link and watches a roll before
touching anything gets a permanently suspended context and is silent for that
page's life. That is a shipped bug.

The lab cannot make a sound. `js/lab.js` contains no `AudioContext` of any
kind. The rig built to judge dice sets is deaf.

### The settle is silent, still, and mis-timed by 27 frames

`SETTLE_STILL = 0.45` (js/main.js:798) and the freeze test (js/main.js:2049-2056)
requires 0.45 s of sub-threshold stillness *before* calling `freezeInPlace`
(js/main.js:2027). **Every "the die landed" timestamp in this codebase is 450 ms
after the die visually stopped**, and the fast-forward loop breaks on the frame
the last die freezes, so `max(settle time) === roll.duration` exactly. That one
fact refuted the mechanism of three separate proposals in this pass.

Measured: 20d6 is completely motionless for the final 2.4 s of its 9 s
playback; 40d6 for the final 1.17 s. `SETTLE_CAP = 9` (js/main.js:799) is hit on
every throw of 16+ dice and on 2 of 16 four-die throws.

### The contact recorder starves every large pool

`if (v > 2 && sounds.length < 400)` (js/main.js:1994) gates **sound, particle
bursts, felt decals and the Level 5 shock ring** — they all drain the same
array (js/main.js:2325-2340). Independent re-simulation against the vendored
cannon-es, with the world, materials, planes and spawn copied from source:

| pool | recorded | all at t=0 | contacts below y=0.6 | last event |
|---|---|---|---|---|
| 1d20 | 4–6 | — | yes | 0.55 s of 1.28 s (**57 % silent tail**) |
| 20d6 | 400 (capped) | 400 | 8 | 0.267 s |
| 40d6 | 400 (capped) | 400 | **0** | **0.000 s** |

The cause is temporal, not vertical: `spawnDie` stacks dice at
`6 + rng()*4 + index*0.9` (js/main.js:889-895) into a lateral spread clamped to
`TABLE_W - 4.4` — 4.2 units at `medium`, so 40 bodies at 0.108-unit separation
with a 1.35-unit body. They interpenetrate at spawn and blow the whole budget
on the first step. Confirmed secondary: from index 18 the spawn ladder exceeds
the y=22 ceiling plane (js/main.js:595), and those dice are ejected downward at
~220 u/s in a single frame. The comment at js/main.js:886 still reasons from
`TABLE_W = 18`, three ladder generations stale.

### The surface is one plane, and its one inscription is broken

The floor is `PlaneGeometry(160, 160)` (js/main.js:524) for an 8.6-unit mat —
the playable mat gets **110 × 67 texels** of a 2048² atlas, 0.17 %. There is no
table edge, no room, no fog, no props. The 2026-08-09 CSS vignette was deleted
because a `radial-gradient` sized to its box read as corner shading on desktop
and a hard oval on a phone.

`drawMatText` (js/main.js:472-489) — GOALS goal 2's named inscription — fits to
26 world units and draws at world z = +3.4. Both were correct for the 30×17 mat
this was written on. Today `medium` is 8.6 wide with its front wall at z = +2.6.
"The Duel At Dusk" measures 25.8 world units: **three times the mat, painted
outside the front wall.** The guarding comment says the constants "must not
drift (no scenario asserts glyph position)." They did not drift; the mat moved
under them.

Also measured and broken: `SHELF_SLOT_W` is a fixed 5.4 against
`SHELF_PITCH = (TABLE_W - 5.4)/4` = 0.80 at `medium` — a 6.75× overlap. Five
collected clusters render as one interpenetrating slab under one merged glow,
while `__diceDebug.shelf` reports five clean clusters and every assertion is
green.

### Mobile is the weak target and the mat cannot help

Measured `dieSpanPx` today: 62 (wide) / 80 (medium) / 103 (close) on a 390 px
phone with the rail; 51/65/84 with the panel open. C24 measured the fourth zoom
notch and refused it (10 of 12 dice piled, heap 9.0 units tall). The standing
instruction is explicit: *do not take another notch off the mat until the
dice-framing camera exists.* The mat is the physics walls and cannot vary by
device. The camera can.

`navigator.vibrate` has **zero references** across js/, tests/, tools/,
index.html and server.js. On the one axis where a phone beats a desktop, the
entire budget is unspent.

### The demo apparatus does not exist yet, but three quarters of it does

`lab.html` is a materials rig with its own renderer, camera, lights and rAF
loop; docs/THEMES.md:665 states the reciprocal — "the main app consumes NOTHING
from the lab." A ceremony demoed there would be a reimplementation of the
ceremony. `chrome-lab.html` is the right shape — one same-origin iframe of the
real `index.html`, posed through `__diceDebug` — but it is one frame, has no
headless driver, and no e2e scenario.

What already works, measured this pass: `holdClock(true)` + `sim(n)` +
`Page.captureScreenshot` is a **frame-exact recorder** (24 × `sim(5)` in two
frames landed both at `currentRoll.time` exactly 2.000); zero-dependency APNG
muxing by copying IDAT payloads into fdAT chunks (Chrome's `ImageDecoder`
confirms `{frames:16, animated:true}`, 0.1 % size overhead); and
`OfflineAudioContext` renders **sample-deterministically under `--mute-audio`**
(two renders of one graph: 0 differing samples of 9600; `pan = -0.8` gives
`peakL/peakR` of 6.3×). Capture costs ~140 ms/frame at 900×600, 461 ms for a
two-frame 1400×500 A/B.

---

## THE SLATE

**The ranking rule, said out loud:** rank = (what the player actually feels)
× (confidence the mechanism survives contact with the code) ÷ (real effort,
priced *after* the verifier's corrections). Ties break toward the item that
also fixes a shipped defect, because that one arrives with a before/after
number instead of an opinion. Every proposal in this pass verified at
`confidence=high`, so effort and payoff do the work.

Waves are a dependency order, not a priority order. Wave 1's four items are
each independently defensible, each fix something measurably broken today, and
each unblock a group in Wave 2.

| # | Experiment | Wave | Payoff | Effort | Breaks doctrine? |
|---|---|---|---|---|---|
| 1 | The spawn storm and the ceiling | 1 | transformative on big pools | small | no |
| 2 | The audio spine | 1 | enabling + a shipped bug | small | no |
| 3 | The true settle frame | 1 | enabling | small | no |
| 4 | The Pocket | 2 | transformative on phones | large | **yes ×3** |
| 5 | The Oracle Camera | 2 | transformative | large | **yes ×4** |
| 6 | The Last Die (merged ×3) | 2 | substantial | medium | **yes ×3** |
| 7 | Haptics, self-only | 2 | substantial on phones | small | **yes ×1** |
| 8 | The Rescue — the shelf goes cold | 3 | noticeable | small | **yes ×1** |
| 9 | The Room (merged ×2) | 2 | transformative | large | **yes ×3** |
| 10 | The Replay | 3 | transformative | large | **yes ×3** |
| 11 | The Room Draws Breath | 3 | transformative | large | **yes ×2** |
| 12 | The Unmaking | 3 | transformative, rare | medium | **yes ×2** |
| 13 | The Felt Answers Each Die | 3 | noticeable | medium | **yes ×3** |
| 14 | The Edge of the World | 3 | noticeable | medium | **yes ×2** |
| 15 | The Cup (online half) | 4 | transformative | large | **yes ×3** |
| 16 | The Table Has Sides | 4 | noticeable | medium | **yes ×2** |
| 17 | The Pour | 4 | noticeable | large | **yes ×3** |
| 18 | The Plinth | 4 | transformative | large | **yes ×4** |
| 19 | The Tower | 4 | transformative | large | **yes ×5** |
| 20 | Hands on the felt | 4 | transformative | very-large | **yes ×4** |
| 21 | The Well | 4 | noticeable | large | **yes ×3** |

---

## WAVE 0 — the apparatus

Nothing in Wave 2 is judgeable without this, and one item (the audio spine's
proof) is impossible without it. Design is in §4 below; it is roughly three
files and two days.

---

## WAVE 1 — the foundations

Three commits. Each is small, each fixes something that is broken in
production today, each has an e2e assertion that **fails against HEAD**, and
each unblocks a group.

### 1. The spawn storm and the ceiling

**What the player feels.** Roll 20d6 or 40d6 and the dice make a sound when
they land — and throw particles, and mark the felt, and fire the shock ring.
Today they do none of those things: every effect in the Level 3/4/5 layer fires
above the mat in frame zero, and the dice land in total silence.

**How it is built.** Two commits, in this order.

*(a) The ceiling.* `addStaticPlane(wallMat, [0, 22, 0], …)` (js/main.js:595)
has its normal pointing down, so y > 22 is solid. `spawnDie`'s height ladder
(js/main.js:889-895) is `6 + rng()*4 + index*0.9`, which exceeds 22
unconditionally from index 18 and stochastically from 16 — 22 of 40 dice on a
40d6 roll spawn *inside* the ceiling and are ejected downward at ~220 u/s in
one frame (measured: dY of −3.5 to −6.95 versus −0.20 for free fall). Clamp the
`index * 0.9` term, or stage depth in Z rather than height in Y.

*(b) The recorder.* Replace the single 400-event cap (js/main.js:1994) with a
**per-step cap alongside it** (≈8 events/step). That kills the spawn storm with
no height heuristic, no new constant, and no risk of mis-filing wall contacts
(which reach y=22) as "air". Corrected from the original proposal, which
specified a height split on `DECAL_MAX_CONTACT_Y` — the starvation is temporal,
not vertical, and a height gate mis-classifies exactly the wall crack the sound
design most wants.

Neither change consumes an `rng()` draw, adds a body, or perturbs body
ordering, so `perf-determinism`'s cross-client keyframe hash is untouched by
construction.

> **Breaks: the shipped particle/decal/ring density on large pools. Buys:
> landings existing as events at all.** This is a look change on every
> art-directed set at every pool size above ~14 dice, in the direction of "the
> effects finally fire when the dice land." Flag it as a look change, not a bug
> fix, and shoot before/after on 8d6 and 20d6 with `boltglass` and `blackanvil`.

**Cost.** Two small commits plus a re-run of `dice-land-flat`
(tests/e2e/scenarios.mjs:435) at every zoom with its three-throw majority
verdict.

**Risk.** The dedupe of cannon's double dispatch is tempting here and should
**not** ride along: `vendor/cannon-es.js:12762-12764` fires every collide on
both bodies and `recordCollision` always credits `c.bi`, so 29–40 % of a
multi-die roll's budget is exact duplicates — but removing them *halves*
particle density on die-die hits. That is an art-direction change wearing a
bug fix's clothes. Separate ruling.

**Demo.** Numbers first, because this repo's dominant failure mode is a green
check masking a broken thing and both of these defects shipped to v1.0 under
exactly that blind spot. `tools/steps/pour-ab.mjs` prints per roll: total
recorded contacts, cap hits, duplicate share, the contact-time histogram, and
the count of contacts below y=0.6. **The assertion that fails today, in one
line:** for 40d6, `roll.sounds.filter(s => s.time > 0.5).length > 0`.

### 2. The audio spine

**What the player feels.** Nothing new, on the day it lands. What changes is
that sound becomes *possible*: there is a bus to duck, a compressor to stop
three overlapping tails clipping, and a context that is actually running.

**How it is built.**

*(a) The resume.* `audioCtx` is constructed lazily inside `playImpact`
(js/main.js:675) and never resumed. Add a `state === 'suspended' → resume()` on
the next real gesture — not eager creation at boot, which counts against
autoplay policy. **This is a confirmed shipped bug**, not a nicety: a tab that
joins a room and watches an SSE roll before any click is silent for the life of
the page, and that is exactly the roll on which a new player decides whether
these dice have weight.

*(b) The bus.* `master = GainNode → DynamicsCompressorNode → destination`,
built once beside `audioCtx`. Every voice connects to `master` instead of
`destination` (replacing js/main.js:703 and :716). Three overlapping
`focuscrystal` tails already sum to 1.05 straight into `destination` today, so
the compressor is close to a prerequisite for adding any source at all.
docs/UX.md:405 already budgeted a "~6 dB duck on the existing `audioCtx` graph"
against a graph that does not exist.

*(c) The split.* Extract `buildImpact(ctx, out, when, strength, voice)` from
`playImpact`'s body, parameterized by the audio context. The live path passes
`(audioCtx, audioCtx.currentTime)`; the offline renderer passes an
`OfflineAudioContext` and the impact's roll-clock time. **Until this split
exists the sound cannot be tested at all** — the graph ends at a speaker.
`playImpact` genuinely has one call site (js/main.js:2336) and `playClick`
(js/main.js:722) has zero remaining callers, so the signature is free.

> **Breaks: nothing.** Flagged only because the duck it enables does — see
> item 9.

**Cost.** Small. Half a day plus the `__diceDebug.audio.*` hook.

**Risk.** The 35 ms rate limit (js/main.js:670-672) is a single module-global
on wall-clock time. Every new source will silently steal impacts from the dice
unless it becomes per-channel — and that bug gets reported as "the new sounds
are too loud" when the truth is that dice went missing.

**Demo.** `__diceDebug.audio.renderRoll()` into an `OfflineAudioContext` →
PCM → a waveform strip in the reel directory, plus a summary JSON of onset
times, per-window RMS, peak, crest factor and clipped-sample count. **The
assertion that fails today:** a tab that joined with
`navigator.userActivation.hasBeenActive === false` reaches `ctxState:
"running"` after one dispatched gesture.

### 3. The true settle frame

**What the player feels.** Nothing directly. This is the two-line fix that
makes items 5, 6, 7 and 10 possible, and without it all four fire half a second
late on a picture that has already gone still.

**How it is built.** In `freezeInPlace` (js/main.js:2027), record
`t = simTime - d.stillTime` — equivalently `simTime - SETTLE_STILL` at the
threshold. That is the instant the die actually stopped, 450 ms before the
freeze test conceded. Store the frame index as `d.settleFrame`, clamped ≥ 0.

Two guards the original proposals missed. **Cocked dice never reach
`freezeInPlace` in that branch** (js/main.js:2054-2056 only calls it when
`!cocked`) — they need a fallback assignment. And on a `SETTLE_CAP` roll
js/main.js:2083 force-freezes every remaining die on one frame with one
identical `simTime`, so `argmax` is an N-way tie: tie-break deterministically
by lowest die index and mark those entries `cocked: true`, so a "last die"
beat can decline to fire on a pool that timed out. **20d6 and 40d6 hit the cap
on every measured throw**, so this is the common case on big pools, not an
edge.

Then cut the dead tail: set `roll.duration = lastMotionFrame * FIXED_DT` so
playback ends on the last frame with real motion instead of 450 ms of a
motionless picture.

> **Breaks: the tumble's shipped length, downward.** Buys: every roll ends when
> the dice stop rather than 450 ms later, and every settle-keyed beat lands on
> the frame it names.

**Cost.** Small, but it moves `roll.duration`, so the frame-hash scenario and
every wall-clock-adjacent assertion get re-run.

**Risk.** This is inside the determinism-critical fast-forward. It consumes no
`rng()` draw and adds no body — verified — but the change must be diffed
against `perf-determinism`'s keyframe hash explicitly rather than accepted on a
green suite.

**Demo.** `__diceDebug.currentRoll.landings` gives settle order and true stop
times. **The assertion that fails today:** for 1d20, the last landing time is
< 0.98 × `duration`.

---

## WAVE 2 — the headline experiments

### 4. The Pocket — stop showing a phone the whole table

**What the player feels.** Portrait, on a train. You press Roll and the frame
does not try to show you the table. The horizon comes up, the camera tilts
toward the felt like a face over a dice tray, and what you get is a tall narrow
well of green about four dice wide. The dice come in from the top of the
screen. They are enormous. They fill your hand. The person across the table on
a 27-inch monitor saw the full felt, the whole throw, the same dice in the same
places at the same instants.

**How it is built.** Rides item 5's `solveFraming` refactor. In the new call
site, when `view.width / view.height < 0.8`, derive the eye from the predicted
settle AABB at ~35–40° elevation with the AABB centroid as target instead of
the const `CAM_TARGET` (js/main.js:12688). This is arithmetic, not new
machinery: a 278×844 canvas satisfies its y-margins with 0.73–0.85 NDC to spare
while x is over by 0.20–0.30. The vertical budget is sitting there unspent.

Nothing about the mat moves. `TABLE_W`/`TABLE_D`, the four wall bodies
(js/main.js:589-594), `applyZoom` (js/main.js:11105) and everything on the wire
are untouched. This is `camera.position` and `camera.lookAt`, per-viewer.

**Corrected from the proposal on four counts.** *The well is cut entirely for
v1* — three of its five problems live in the shader vignette and it buys the
least; the SIZE of the die is the whole win on a phone. `#ceremony-vignette`
already exists (css/style.css:4889) and already darkens the edges during
exactly that window, and the tombstone comment at css/style.css:117-118 says
in its own text that the ceremony vignette stays. *Marker anchors stay in the
constraint set alongside the dice AABB, both not either* — points at
`SHELF_MARKER_Y = 2.4` are the first thing a low camera pushes off the top of
frame, and `positionShelfMarkers` (js/main.js:1509) projects them **unclamped**
while `positionPeek` (js/main.js:1775) clamps. *The idle portrait framing is
today's framing* — `refitView` (js/main.js:5830) calls the framing solver at
boot, on `clearTable`, and on every panel toggle, when `currentRoll` is null and
there is no AABB to aim at. *The success metric needs a new probe* —
`zoomProbe().dieSpanPx` (js/main.js:4886) projects a unit sphere at the mat
centre, which is not where the Pocket aims.

> **Breaks: "the mat is what must stay on screen."** Buys: a legible die on a
> phone. Measured today, at every zoom preset on a 390 px phone, ~20 % of the
> mat is already off screen and the retreat loop has silently given up at i=89 —
> the doctrine is being broken today by accident. This breaks it on purpose,
> aimed at where the dice actually are.
>
> **Breaks: the 62–64° elevation every shipped eye holds.** Buys: 0.73–0.85 NDC
> of unused vertical converted into the 0.20–0.30 of horizontal the portrait
> viewport is short of. Cost, stated plainly: felt-painted graphics vanish at
> grazing angles — the mat decal (js/main.js:472-489) and the shelf under-glow
> rings (js/main.js:399-421) are flat pixels in the floor texture, and
> `js/lab.js:1240`'s `dropView` exists precisely because a flat decal dies at
> that angle. 35–40° is a deliberate floor.
>
> **Breaks: "the table is never blocked," in spirit.** For ~2 s a phone
> player's view of the shelf is gone. Buys: the moment. It blocks nobody else,
> and the shelf is one tap away the instant the camera returns.

**Cost.** Large, and most of it is item 5's refactor. The Pocket itself is one
branch and a portrait eye preset per rung, measured rather than guessed.

**Risk.** The mat is 110 × 67 texels; magnify it further and the felt grain and
the inscription get visibly softer. The Pocket makes an existing resolution
problem into a visible one. Also: `particleField.setProjection` encodes fov and
is only called from `refitView` (js/particles.js:125-127) — a dolly is fine, a
fov animation is not. Buy tightness with distance and elevation only.

**Demo.** `fx.html?solo=pocket` opened on a real phone is the whole demo, and
it is one link. Headless: three viewports through
`Emulation.setDeviceMetricsOverride` — 390×844 rail, 390×844 panel-open (the
74 px canvas disaster case), 1328×820 desktop as a control that must be
byte-identical. **Obviously better:** `dieSpanPx` measured at an actual die's
`finalPos` roughly triples in portrait. **Obviously worse:** the desktop
control differs at all, or a shelf marker anchor projects off-viewport.

### 5. The Oracle Camera — the app already knows which die decides it

**What the player feels.** `1d20 dc 15`. The table is the table you always see —
wide, honest. The die comes in off the left edge and cracks against the far
wall. And then the frame starts closing. Not a cut, not a swoop; the camera
leans in the way you lean in. By the second bounce the mat edges have slid off
frame and there is only felt and this one object, bigger than it has ever been
in this app. The last half-second it is barely turning — one corner, then the
next, then a wobble — and you can see it decide. It stops. The frame holds one
beat on it, dead still.

Now 20d6. The camera does not move at all for a second and a half, because that
is chaos and moving through chaos is nausea. Dice freeze; the picture calms;
when only one is still rolling the frame is holding it alone, and every person
at this table is watching the same object stop.

**How it is built.** Four pieces.

*(1) The shot list as data.* In the `currentRoll` object literal
(js/main.js:2155) add `shots`, derived from what is already in hand: `settleFrame`
(item 3), `keyframes`, `d.finalPos`, `sounds`, `duration`. A shot is
`{t, eye, target, ease}`.

*(2) The refactor.* `applyCameraFraming` (js/main.js:12712) splits into
`solveFraming(pts, eyeDir) → Vector3`; the existing function becomes one call
so resize/panel/zoom callers are unchanged. `framingPoints` (js/main.js:12696)
gains a second form returning the dice AABB corners padded by a die radius —
literally C24 step 1, which names this function.

*(3) The driver.* `stepCamera(dt)` inserted in `tick()` (js/main.js:4752) after
`stepRevealing` and **before** `positionChips`. That position is load-bearing:
chips and shelf markers re-project through `camera` every frame, so they follow
a moving camera for free, and being inside `tick` inherits `holdClock` and
`sim()` determinism at no cost.

**Corrected from the proposal on three fatal counts.** *`cer.stages` does not
run on `roll.time`* — `stepPlayback` returns early the moment
`cer.phase === 'settle'` (js/main.js:2260-2263) and `ceremonyStepSettle`
advances a separate `cer.clock`, with `roll.time` pinned at `roll.duration` for
the entire settle phase. *A `dc`-only roll has no ceremony at all* —
`beginCeremony` is gated on `if (currentRoll.exp)` (js/main.js:2209) and
js/notation.js:71-72 states it: `"1d20 dc15"` parses with `exp:null`. The
headline demo roll is a **plain** roll. So `stepCamera` needs its own
accumulator, started the frame `roll.time` first reaches `roll.duration`, and
drained by a single new `cameraSnap()` called from **three** sites:
`skipCeremony` (js/main.js:4177), `skipPlainPlayback` (js/main.js:4548), and
`fastForwardPlayback` (js/main.js:4845) — the hidden-tab path the proposal
never mentioned. *For v1, ship the tumble push-in and the hold and drop the
ease-back-out*; the pull-out is the only part that needs a clock nobody owns.

> **Breaks: ONE FIXED CAMERA FRAMING THE WHOLE MAT.** Buys: the deciding die is
> the subject of the shot instead of a 72-pixel speck in a rectangle of cloth.
> C24 already ruled this direction approved and per-viewer.
>
> **Breaks: "frame the mat" — `framingPoints` stops returning `TABLE_W`/`TABLE_D`
> corners.** Buys: a 3-die roll and a 40-die roll are no longer shown at the
> same distance. C24 step 1 verbatim.
>
> **Breaks: docs/UX.md:406's "No camera moves during tumble," and C24's own
> "ease to it after settle, NEVER during."** Buys: the whole second half of
> every roll. Measured, 1d20's last impact is at 0.97 s of a 2.18 s tumble — 56 %
> of a single-die roll is currently a still frame of nothing happening. The
> mitigation is the honest half of the break: **the camera holds absolutely
> still while more than one die is in motion**, and only begins moving once all
> but one have hit their true settle frame. C24's nausea case is a camera moving
> under a *tumbling* die; this one moves under a picture that has already gone
> quiet.
>
> **Breaks: ceremony durations.** The settle hold adds ~200 ms before the
> release.

**Cost.** Large. The refactor is the bulk of it and the Pocket, the Replay and
the Tower all spend it.

**Risk, and the rule that keeps it Tier-1 clean.** *Every pre-verdict shot is
derived from GEOMETRY only* — settle frames, positions, impact strength — never
from `roll.values`, `total`, `dc` or `crit`. Outcome-aware framing is legal
only at or after `stageVerdict` (js/main.js:4102). Otherwise a crit's different
push tells a sighted player the answer before the screen reader gets it, and a
shrouded roll would visibly behave differently.

Four more, all self-reported by the proposal and all verified accurate:
`camera.near` is 1 (js/main.js:167) against a d20 radius of 1.25 — a push-in
inside 1 world unit clips through the die, so the floor clamp must be expressed
in near-plane terms. `postStack.ring` bakes screen pixels once at fire time
(js/post.js:239-240) and lives 0.55 s, so a camera moving during that window
strands the ring — freeze the camera while a ring is live, or re-project per
frame like `setShimmer` already does (js/post.js:250-271). Shelf markers are
projected unclamped (js/main.js:1509) while the peek is clamped
(js/main.js:1775). And **`prefersReducedMotion` (js/main.js:3920) gates exactly
one thing** — the crit shake — with a CSS block scoped to elements it cannot
reach; a JS camera move is invisible to that policy unless it asks. Reduced
motion gets the settled framing as a **cut**, no travel: a real alternate path,
not a faster version of the same move.

**And the postcondition it inherits.** The framing loop fails silently today
(js/main.js:12723-12731 falls out at i=89 with no log). The refactor must
return a solved/unsolved flag and surface it on `zoomProbe`, or this proposal
inherits a broken postcondition and the e2e goes green over it.

**Demo.** Two frames of `fx.html?ab=oracle-camera`, same room, same
server-authored roll, `setCameraMode` differing. `holdClock(true)` then
`{sim(6); capture}` × 24 in lockstep. **Obviously better:** in the oracle strip
the die fills a third of the frame in the last six captures and you can read
the face; in the shipped strip it is the same speck in all 24. **Obviously
worse:** the camera moves in any frame where two or more dice are in motion, or
a shelf marker anchor leaves the viewport (`__diceDebug.project` asserts this
numerically).

### 6. The Last Die — a beat of silence at the instant it decides

*Merged. This entry is three proposals: "The Last Die" arrived independently
from the sound lens and the ritual lens with identical mechanisms and identical
verified defects, and "The Held Breath" (cinematographer) is the same beat
argued from the hit-stop. They are one experiment.*

**What the player feels.** Four dice, a Check. Three find the felt inside half a
second — thump, thump, knock — and their chips pop under them one at a time as
they stop. The fourth is still going, spinning down on one edge at the near
wall. It drops onto a face — and everything stops. Not slows: **stops.** The
felt's grain stops drifting, the room goes completely silent, which you notice
instantly because dice have been clattering for two seconds. Two hundred
milliseconds of nothing. Then one small tick as the last edge settles, the
chips fall in, and the verdict card opens.

**How it is built.** Rides item 3's true settle frame.

*(1) Do not scale `step`.* This is the correction that makes the whole thing
smaller and removes its own highest-severity risk. `skipPlainPlayback`
(js/main.js:4548-4551) is a single `stepPlayback(duration - time + FIXED_DT)`
call, and `fastForwardPlayback` (js/main.js:4845-4852) uses the same single-call
shape inside a `guard++ < 500` loop — a `step *= 0` term turns the first into a
no-op and makes the second spin 500 times and give up with the roll unfinished,
on the hidden-tab path. Instead: item 3 already cut the recorded dead tail, so
playback *ends* on the last frame with real motion.

*(2) Put the beat where a beat already lives.* Prepend `{ t: 0, fn: stageHold }`
to `cer.stages` (js/main.js:4071-4076), pushing `tChips` from
`CEREMONY_HITSTOP_S = 0.11` to ~0.19. Give **plain rolls** the same 180 ms via
the same flag on the `showResults` path — and single them out explicitly,
because the plain roll is where this beat is genuinely absent and it is the
majority of rolls. On a ceremony roll `stageHitStop` already produces a 110 ms
motionless hold; the real delta there is 110 → 180-220 ms plus (3) and (4).

*(3) The world stops too — the best observation in the batch.* A frozen die on
a drifting shader is a bug, not a beat. `SHADER_TIME.value += dt`
(js/main.js:4753) is the single clock every Level-2 patched material reads
(js/dice.js:488-493 — every themed material's `uTime` points at the *same*
object), and `particleField.tick` / `dieLights.tick` are the two lines beside
it. A `worldFrozen` flag scales all three. `holdClock` already proves freezing
`SHADER_TIME` works.

*(4) The hush, and the release.* There is no master bus to duck, so silence
here is free and correct: the drain pops events by `roll.time`, and `roll.time`
is not advancing, so nothing fires. What it needs is the release — one new
`settle` entry in `IMPACT_VOICES` (js/main.js:660, pure data) and one call: a
low short body with a tail, not another transient click. Fix the saturation
first (js/main.js:702 clamps 60–81 % of impacts to 0.35) or the release lands at
the same volume as every tap before it.

*(5) The per-die read comes from chips, not lights.* **Corrected:**
`DieLightRig` is constructed with `{max: 4}` (js/main.js:243) and `attach()`
steals the oldest slot when full (js/dielights.js:52-55) — dimming seven settled
dice at 8d6 would evict the roll's own set glows, attached from the same pool.
Use `renderChips`'s existing `staged` flag (js/main.js:2822) and pop each die's
chip at its own true stop time, leaving the last die bare. DOM text,
screen-reader-safe, free on a phone, contends with no fixed pool, and reads
better than dimming seven dice.

> **Breaks: ceremony durations as tuned.** Buys: ~180–220 ms of held silence at
> the exact instant the result becomes true. Cheapest beat in the brief and the
> one the ceremony's own stage list already budgeted a phase for and then filled
> with a CSS flash over motionless dice.
>
> **Breaks: seeded determinism of the tumble, in its pacing sense** — the
> playback clock now stops, so two clients at different frame rates are
> momentarily further apart. Buys: the beat. The argument is already settled
> here: motion tier, skip, sound and reduced-motion are explicitly client-local
> (docs/UX.md:495-507), and the cinematic slow-mo scaler at js/main.js:2271 has
> been doing exactly this since it shipped. Values and keyframes are identical
> on every client; only the wall-clock at which frame N is painted differs.
>
> **Breaks: "a visual skin can never change how a die lands," in the sense that
> the picture visibly stops obeying time.** Buys: legibility of the decisive
> instant. The hull, keyframes and value are untouched; only playback rate
> changes.

**Cost.** Medium — the smallest headline item, and the only one that does not
need the camera.

**Risk.** *The hold duration is a constant, derived from geometry only.* A hold
whose length varies by outcome is an information channel — a player learns
"long silence = crit" and a screen-reader user does not, because `announce()`
fires inside `ceremonyEnterSettle` at settle-t0 (js/main.js:4048-4057), before
every stage. Outcome may change what happens after `stageVerdict` has already
painted and announced, and nothing before it. A shrouded roll gets the identical
freeze and identical silence, on the far side of the drain's `rollShrouded`
gate — same beat, no voice — or the pacing itself becomes a tell.

The freeze does not reach wall-clock timers: `autoCollectMs` 3000
(js/main.js:2426), `CEREMONY_DISMISS_MS` 7000 (js/main.js:3956), the 1700 ms
crit overlay (js/main.js:4110), and `playImpact`'s 35 ms throttle
(js/main.js:671-673) all use `performance.now()`. Freeze the world and the roll
can still tidy itself away mid-beat.

**Demo.** Half judgeable headless and half not, and it is worth saying so.
**The picture:** the same two-frame A/B at `sim(2)` granularity, so a 180 ms
freeze is ~5 captures. The shipped strip advances every frame; the Held Breath
strip shows five **byte-identical** frames and then releases — a sharp
unambiguous pair, and the one thing a still sequence proves better than a live
browser, because byte-identical consecutive PNGs are a freeze a video would let
you argue about. **The sound cannot be judged this way and I will not pretend
otherwise.** Chrome launches `--mute-audio` (tests/e2e/cdp.mjs:92) and
`soundOn`/`setSound`/`playImpact` are entirely unexposed. The hush and the
release voice are judged live on port 8231. `__diceDebug.audio` (item 2) is a
**prerequisite**, and it is the difference between a green check and a green
check that means something.

### 7. Haptics — your dice, in your hand, self-only

**What the player feels.** On a phone, three real bumps as three real dice hit
real felt, at the exact millisecond each one lands, with the hard one hitting
harder. Maya rolls; your hand does not move. **Because your hand does not move,
you know it was her before you have looked at anything.**

**How it is built.** `entry.playerId === net.playerId` already answers "is this
mine" in four places (js/main.js:2436, :3308, :4129, :4902) and
`currentRoll.playerId` is populated in the roll literal, so the drain resolves
`mine` with no new plumbing and no new wire field. `navigator.vibrate` has zero
references repo-wide — that "largest unspent feedback channel" claim is
literally true.

**Corrected on the trigger.** Key haptics to **landings**, not impacts. The
proposal specified one call per drained contact from `roll.sounds`, whose first
400 entries are consumed front-to-back under the cap — on a large pool that is
a dense buzz early and nothing at the end, the exact inverse of the promised
feeling. One bump per die that lands is ≤ 40 events, self-evidently paced, and
needs no clustering heuristic at all. That makes item 3 a hard dependency.

Cancelled with `vibrate(0)` on `skipPlainPlayback`, `skipCeremony`,
`skipRevealFx`, `fastForwardPlayback` **and** the `visibilitychange` listener
(js/main.js:4854). A stranded vibration pattern outliving its roll is the one
failure a user never forgives.

> **Breaks: mobile as "a smaller window onto the same table."** Buys: on a phone
> the roll is *felt*, not squinted at. The measured problem is 62–80 px dice on a
> 390 px phone with ~20 % of the mat off screen; haptics do not fix the picture,
> but they move a large share of the feedback budget off the screen entirely,
> which is the one axis a phone is better at than a desktop.

**Cost.** Small. It needs no audio bus, no panner, no convolver, no wire field.
Buildable in a day once item 3 lands.

**Risk.** iOS Safari has never implemented `navigator.vibrate` as deliberate
anti-ad policy, and the switch-checkbox workaround was closed off in iOS 26.5.
So haptics must be **strictly additive** over an already-complete audiovisual
moment, never the payoff. Ships default-OFF behind its own device-local boolean
beside `LS_SOUND` (js/main.js:132) until Joe has felt it. Note that
`navigator.vibrate` inherits the same sticky-activation gate item 2 fixes for
audio — a spectator tab that joined without a gesture cannot vibrate either.

**Demo.** Cannot be demoed headless and cannot be demoed on a desktop. A real
Android phone on the LAN pointed at port 8231 is a **hard requirement**, and
saying so is better than shipping a green check for something nobody felt. What
*can* be asserted headlessly: stub `navigator.vibrate` via the harness's init
script (tests/e2e/cdp.mjs:217) and assert that a roll that is not mine produces
zero calls, that a roll that is mine produces one call per landing, and that
every exit path ends with `vibrate(0)`.

### 9. The Room — the roar of forty, and a table that is somewhere

*Merged. "The Room, and the Roar of Forty" (sound lens) and "The Room Goes
Quiet" (ritual lens) are the same proposal: a bus, surface identity, position,
and dynamics. Ranked below the smaller items because its first two commits are
already Wave 1.*

**What the player feels.** One d20 leaves the mat and cracks off the left wall —
and you hear it on the **left**, a sharp bright snap with almost no body. It
drops onto felt and the sound changes species: a soft low dead thump with no
ring at all, off-centre, close. It ticks against a d6 already resting there — a
dry knock, two objects of the same stuff — and stops. Four sounds, four
different sounds, in a room that has a size.

Then 40d6. Today that is one click at t=0 and nine seconds of silence. Now it is
a **wave** — forty impacts inside 300 ms that the ear reads not as forty clicks
but as one textured rush with a leading edge and a decaying scatter, panned
across the whole mat because the dice are across the whole mat. The 39th die
tocks alone three seconds later and you hear it distinctly because by then there
is room for it.

**How it is built.** Commit 3 of the audio work; items 1 and 2 are commits 1
and 2.

*Surface identity, one comparison.* `recordCollision` (js/main.js:1992) has the
full cannon contact in hand and discards it. `e.body.material` is one of
`diceMat`/`floorMat`/`wallMat` (js/main.js:570-572), so `surface: 'felt' |
'wall' | 'die'` is one field. **Note the ceiling at js/main.js:596 also carries
`wallMat`**, so a high clip reports "wall" — cosmetic, but the triple is not
quite the triple the code holds.

*Position, type, dynamics.* The drain (js/main.js:2324-2348) already resolves
`s.at`, `s.di`, `roll.dice[s.di].type`, `fxSet` and `camera`, and hands the
position to particles, decals and the ring on the very next lines **while
withholding it from the one system for which position is the entire content**.
Change one line: `playImpact(s.strength, voice, {at, surface, type, camera})`.
A `StereoPannerNode` per hit from `at[0]/(TABLE_W/2)`; a distance/height gain;
a surface multiplier on the filter; a `type` term off `DIE_DEFS[type].mass`
(0.8 for d4 → 1.4 for d20, js/dice.js:38-46) so a d20 is audibly bigger than a
d4 in the same pool. Replace the 0.35 clamp with a compressive curve. Replace
the 35 ms global throttle with a per-frame contact aggregator: more than N
contacts in one drain pass become ONE granular burst whose grain count, spread
and pan-width come from the cluster. **That is what makes 40 dice a roar rather
than a stutter.**

*The room.* One `ConvolverNode` fed a procedurally generated impulse response —
an exponentially-decaying noise burst rendered once into an AudioBuffer at
first sound, ~0.35 s. No file, no fetch.

*The duck.* **Corrected:** hang the ramp-down on `playRoll`, not
`beginCeremony`. `beginCeremony` is reached by only one of six roll paths
(js/main.js:2209), so "Anaya declares a roll and the room drops out" is true for
`exp` rolls and nothing else. Release on `showResults` for a plain roll and
`stageVerdict` for a staged one, **plus an unconditional restore in
`dismissCeremonyUI`** (js/main.js:4212) — otherwise a queued roll that
pre-empts a staged one leaves `master.gain` pinned 6 dB down for the rest of the
session with no beat left to raise it. That is precisely the class of bug that
ships green.

> **Breaks: the 35 ms rate limit as the loudness governor.** Buys: dynamics.
> Measured, 60–81 % of impacts are already clamped to one ceiling. A compressor
> plus a clustered granular path replaces "drop the sound" with "mix the
> sounds," which is the only way a 20-die pool can be loud without clipping.
>
> **Breaks: the shipped per-set impact voices' balance.** Buys: the ten themed
> voices have never actually been heard across their range. Unclamping changes
> how all ten sound — a change to art-directed work from the 2026-08-04 pass.
>
> **Breaks: quiet chrome / P1 quiet-at-rest, if the room tone ships.** Buys:
> silence becomes an *instrument* — you cannot take away nothing, and the table
> going quiet before a big roll is the most universal tabletop tell there is.
> Room tone gets its own settings rung and its default is Joe's call; the duck
> does not need it.

**Cost.** Large for commit 3 alone, and it owns a settings-UI job it must not
skip: three channels (impacts, room, haptics) cannot honestly hide behind one
boolean whose sub-label reads "dice impact clicks" (index.html:1015-1018).
**Note the portable format will not accept a new settings key as-is** —
js/portable.js:392 parses `/^ {2}(sound|numbers): (true|false)$/` and hard-fails
the whole import on an unrecognised line, so emitting a volume scalar breaks
every rack file for any client that has not updated. Defer the YAML keys.

**Risk.** A per-surface, per-type, per-position voice is an identity channel.
The drain already computes `rollShrouded` and forces `fxSet = null` so obsidian
"sheds nothing, marks nothing, casts nothing"; every new axis must inherit that
gate in the same place. **Open question, and worth Joe ruling on rather than
assuming:** a redacted roll still carries its die *types* on the wire and its
dice are visibly on the felt, so pan and type-timbre leak nothing a spectator
cannot already see. Erring safe costs the shrouded roll its entire new voice for
no divergence reason.

Second risk, named by the proposal and correct: **`skipPlainPlayback` runs one
giant `stepPlayback` and today the 35 ms throttle hides the resulting burst.**
Remove the throttle and a felt-click fires every remaining contact in one frame —
a wall of noise as the reward for pressing skip. The aggregator must treat "many
contacts in one drain pass" as a cluster, and `skipPlainPlayback` must drain
`soundIdx` the way `skipCeremony` already does (js/main.js:4182).

**Demo.** `OfflineAudioContext` renders the identical graph with no output
device, so it works under `--mute-audio` and under SwiftShader. Per roll,
per profile: a PNG waveform+spectrogram strip for the contact sheet, plus a
JSON of the numbers that make the claim falsifiable — events that actually
fire, first-floor-contact time, peak, RMS, crest factor, spectral centroid per
surface class, and clipped-sample count. **Obviously better:** 40d6 goes from
one spike at t=0 and nine seconds of flat line to a rush at the landing with a
decaying tail. **Obviously worse:** any clipped sample, a crest factor that
collapses (everything the same loudness again, just louder), or a keyframe hash
that changes by one bit. Live A/B by ear on 8231, never 8123.

---

## WAVE 3 — identity, world, and the second look

### 8. The Rescue — the shelf goes cold

**What the player feels.** You missed by two. You hit ⟳. On the shelf, the
cluster you just rolled goes cold — the warm ring of your colour under it fades
to ash and stays that way. The new dice go out, and they are *loud* by
comparison, because the ash pile behind them is not. The verdict card forms with
the new number where the number goes, and above it, small, struck through, the
one you refused. Not in the log where nobody looks. On the card, at the moment
it matters.

**How it is built — the half that is nearly free, which is the half to ship.**
`rerollOfId` already rides the wire (server.js:1703) and lands on `currentRoll`,
and **not one beat in the roll moment reads it**. Verified: `collectEntries`
runs at server.js:1721 *before* the roll is broadcast, so the superseded roll is
already on the shelf when the reroll arrives — look it up in `shelfClusters`,
keyed by `rollId`. `renderLog` **already builds `supersededIds`** (js/main.js:10693
and again at :10772) — reuse it rather than minting a second set that will
drift. `glowTint` (js/main.js:386) returns ash for members; repaint through
`recompositeFelt` (js/main.js:519), which is already event-driven and already
runs on every shelf change. Measured cost: one `paintFloor`, ≤0.1 ms on hardware
GL.

> **Stale as of the mats arc (2026-08-29).** This route no longer exists as
> written. `paintFloor` was deleted with the atlas re-point, `recompositeFelt`
> has moved and has exactly ONE caller (`applyFeltTheme`) — it does not fire on
> shelf changes — and the floor is a repeating 5-unit tile, so nothing can be
> painted at a table position in it any more. Anything wanting to mark the mat
> now needs the decal layer (js/decals.js), not the floor texture.

> **Breaks: the felt keeps no marks — arguably.** Buys: the cost of a reroll is
> visible on the table rather than only in the log. Read carefully: this is not
> new residue. It re-tints an under-glow that is *already* painted for that
> cluster and that already vanishes when the cluster is collected. Nothing
> accumulates; it survives a reload for free because the glow is reconstructed
> from `log`. Joe's 2026-08-03 objection was persistence beyond the thing that
> made the mark; this mark's lifetime is exactly the thing's lifetime.

**Cost.** Small — a handful of lines, idempotent against a mid-whisk cluster.

**Risk.** The second half — **staging every reroll as a ceremony** — is a
separate decision and should not ride along. Verified reasons: `beginCeremony`
sets `exp: roll.exp` and **five** sites dereference it unguarded, the fatal one
being `stepPlayback` js/main.js:2272 (`cer.exp.kind === 'cinematic'`) which runs
every frame of every tumble; and staging a plain reroll silently removes it from
the result-banner path entirely (a ceremony roll never reaches `showResults` —
js/main.js:2394-2401 says so) and onto a 7 s auto-collecting verdict card. That
is a lifecycle change, not "+0.9 s." If it proceeds, guard all five `exp.kind`
sites in the same commit and fix the **Esc-has-no-ceremony-rung** bug alongside
(ROADMAP:607; confirmed — the Escape chain at js/main.js:13100-13125 has no
ceremony rung, and `else if (tray.length || cmdInput.value) clearDraft()` at
:13124 wipes the draft mid-ceremony).

**Demo.** A four-frame story: verdict → ⟳ → declare → new verdict, for roller
and spectator, plus the crop that settles it — warm ring vs ash ring at
`scale: 3` (the pattern is tools/steps/rail-look.mjs:57-64). **Note
`__diceDebug.feltPixel` returns `[0,0,0,0]` under hardware GL and is unusable
for this until fixed** — sample the framebuffer instead. **Obviously worse:** a
three-deep reroll chain leaving three ash clusters in five slots. Shoot it.

### 10. The Replay — the footage is already on disk and nobody has watched it twice

**What the player feels.** A nat 20. The card opens gold. And then the table
quietly re-tells it: the camera slides to a low angle near where the d20 came to
rest, the die lifts back off the felt, and the last second runs again at a third
speed from a camera that was never there the first time. It stops on exactly the
pose it is already sitting in. Nothing changed; the number was already on the
card; you just got to see it happen from the seat you wanted.

**How it is built.** `roll.keyframes` is a complete recording retained on
`currentRoll` and never read again after `roll.time` passes `duration`. Physics
ran exactly once (`world.step` has ONE call site, js/main.js:1999). Replaying is
not re-simulating — it is re-running an interpolation that already exists.
`stepReplay(dt)` beside `stepCamera` runs the loop already in `stepPlayback`
(js/main.js:2263-2277) over the last N frames, writing **only** `d.mesh`.

**Corrected on four seams.** *Do not use `cer.stages` for the auto-trigger* —
`skipCeremony` (js/main.js:4189-4193) **calls** every remaining fn; a stage that
starts a 1.2 s replay would be *started* by the escape gesture, which is the
gesture that must end it. Give the replay its own dt-driven clock, and raise
`CEREMONY_BUDGET_S` (1.6, js/main.js:3956) as a flagged retune rather than
smuggling a 1.2 s beat past a `Math.min`. *Gate `startReplay` on
`roll === currentRoll && roll.done && !shelfClusters.has(roll.rollId)`* —
`armAutoCollect` (js/main.js:2434) fires on every banner paint at 3000 ms, so
the on-demand window is ~3 s and a replay of a shelved roll would yank shelf
dice back to old felt poses. *There is no hit test* — `THREE.Raycaster` appears
zero times in js/main.js, and `container`'s one click listener
(js/main.js:4551) fires on any click in the scene container, so "tap the settled
cluster" needs picking that does not exist. *Build item 5 first* — without a new
angle the replay is a die lifting and re-falling in the same fixed wide shot,
which reads as a rendering glitch, not broadcast grammar.

> **Breaks: dice on the felt do not move once settled.** Buys: the second look.
> Physically impossible — a die that is lying there also gets up and falls again —
> and it is the exact rule-break Joe named. The value is not merely preserved,
> it is *re-proved*: the replay lands on the same pose it started from,
> frame-exactly, because it is the same footage.
>
> **Breaks: ceremony durations.** An auto-replay on a crit adds ~1.2 s after the
> verdict. Buys: the payoff beat the crit does not have — `playCritEffect`
> (js/main.js:3922) is a CSS wash and a CSS shake and produces zero WebGL events.
> It fires AFTER the card and the announcement, never as the source of the fact.
>
> **Breaks: quiet chrome, mildly** — a settled cluster becomes clickable with no
> affordance saying so. Buys: discoverability without adding a button.

**Cost.** Large, and it is contingent on item 5.

**Risk and its licence.** The replay writes `d.mesh` only, never `d.body`. That
matters because **`shelveRoll` derives the archived value by reading the physics
body** — `readValue(d.type, d.body.quaternion)` at js/main.js:1303-1306 — so a
replay that nudged a body would silently change the number the shelf shows on
one client while the log kept the true one. The e2e assertion is the proposal's
licence and should be kept verbatim: capture `d.mesh.position`/`quaternion`
before and after, require bit-equality with `d.finalPos`/`d.finalQuat`, and
require `d.body` untouched throughout. That is the single best-argued paragraph
in this pass.

Also: auto-replay is crit-only and off entirely under reduced motion (on-demand
stays, because the player asked — that distinction is the accessible one).
`playRoll` must end any live replay at its head.

**Demo.** Roll until a 20 lands, `holdClock(true)`, `sim(4)` × 20. The strip
shows the die stationary, then lifting and tumbling, then landing back on the
identical pose. Beside it, the shipped strip: 20 identical frames of a die
sitting still. Judge 0.33× and 1.2 s live on 8231.

### 11. The Room Draws Breath — the room reacts, then comes back cold

**What the player feels.** You type `check Pry the seal # The Duel At Dusk`. The
intent card rises and the room goes with it: over ~400 ms the warm key light
falls away and what is left is a lit island of cloth with your declaration
burning on it. The dice come down into that pool of light. Then they stop and
the room comes back — but not to where it was. On a Success it comes back warm
and a half-stop brighter, holds a beat like someone turned toward you, then
eases home. On a Critical Fail it comes back **cold**: the key returns at
three-quarters and the blue rim light is the last thing standing. Nobody wrote
"you failed" anywhere. The room said it.

**How it is built.** A `Mood` state plus `stepMood(dt)` in `tick()`, owning four
things nothing currently writes after boot: `keyLight.intensity`
(js/main.js:173), `rimLight.intensity` (js/main.js:192),
`renderer.toneMappingExposure` (set once, js/main.js:161), and
`scene.background` (js/main.js:165). Step one is hoisting the anonymously-added
HemisphereLight (js/main.js:171) to a `const` — one line, no behavioural effect.
Per-system atmosphere is an optional `mood` block on `js/meanings.js:207
SYSTEMS`; absent = today's values, so D&D and None cost nothing until authored.

**The fog mechanism is refuted; the replacement is linear fog.** FogExp2 cannot
produce the described edge at this camera geometry: three's fog is driven by
view-space depth, and the camera sits 27 units above a mat 8.6 across, so view
depth to the near mat edge is ~28.5 and to four units past the far wall ~35.7 —
a 1.25:1 ratio. Tuning FogExp2 to 90 % at 35.7 puts the near edge at 77 % fog.
There is no density that fogs "just past the wall" without washing out the felt
the dice land on; you get uniform haze, not an edge. Use `THREE.Fog` (linear
near/far) with near/far **derived in `applyCameraFraming`** from the actual view
depth to the far wall, since that function already re-fits on every resize and
the depth ranges ~28 to ~105 across devices. Install one Fog object at boot with
`near=far=1e6` (inert) — creating it later flags `needsProgramChange` on every
lit material (vendor/three.module.js:30232) and recompiles the world mid-declare.

> **Breaks: quiet chrome, in spirit** — the environment becomes a continuously
> driven channel rather than a fixed backdrop. Buys: the app's largest unspent
> surface starts carrying drama. It stays quiet AT REST by construction: home is
> today's exact values and `stepMood` early-returns there.
>
> **Breaks: the mat as a flat rectangle running to the frame edge.** Buys: the
> table becomes an object in a room. Also the cheapest depth cue for the phone,
> where the player currently cannot tell where the table is.

**Cost.** Large once fog has to be recomputed in the framing solver.

**Risk.** Two must-fixes the proposal missed, both Tier-1-adjacent.
`skipCeremony` **calls** stage fns rather than draining them, so a ~400 ms room
glide survives the skip — needs an explicit `Mood.snap()` there **and** in
`skipPlainPlayback`, since plain rolls never reach `skipCeremony` at all. And
`postStack.blackMat` (js/post.js:196) is a `MeshBasicMaterial`, which defaults
`fog: true` — `_maskOn` swaps every non-ShaderMaterial mesh to it before the
glow pass, so with fog on the masked felt renders as *fog colour*, not black,
and any frame with a bloom-flagged die thresholds the far half of the screen
into the blur. `blackMat.fog = false` in the same commit.

The information rule: the outcome-tinted return fires from a stage at or after
`stageVerdict`, and derives from `entryCrit`/`entryOutcomes`, both of which
return null for `entryHidden`. A mood beat must never read `roll.values`
directly before the verdict.

**Demo.** The declare frame side by side. Today it is a card on a flat green
field filling the screen; next to it, an island. Needs `DICE_E2E_GPU=1` for the
stills — headless defaults to SwiftShader and this is entirely a colour and
tone-mapping judgment — plus a live look on 8231.

### 12. The Unmaking — Umbra finally does the thing it claims

**What the player feels.** Umbra. Void-grain dice. The d10 comes up 1; the card
says Critical Fail. And then that die starts to go. Not a flash — it comes
apart. The surface eats itself from a dozen points at once, holes opening and
spreading, each rimmed in a thin white burn-line. Ash lifts off it. The felt
underneath doesn't brighten from the burn — it **darkens**, because a void-grain
die eats light. Then the holes close, the burn-line runs backwards, and the die
is sitting there whole and dark showing a 1. It was always showing a 1.

**How it is built.** The shader is already compiled into every shipped table and
has never been driven outside the lab. `patchShader` (js/dice.js:490) sets
`userData.uDissolve` per material and injects a noise-threshold `discard` plus a
burning edge before `#include <opaque_fragment>` (js/dice.js:529-537).
`voidgrain` declares it (js/themes.js:430). The only driver in the repo is
`js/lab.js:376-398`.

**The isolation mechanism is corrected and gets much cheaper.** `getDie` caches
one build per (type, variant) (js/dice.js:1162) and every mesh shares
`die.materials` (js/dice.js:1186), so driving the uniform dissolves every
voidgrain die of that type at once. `Material.clone()` looks like the fix and is
not — but the *reason* matters, because the wrong reason produced an expensive
mechanism. Verified in the vendored three: `Material.copy` never copies
`onBeforeCompile` **or** `customProgramCacheKey` at all, so a clone loses the
fresnel rim too and compiles a second, different program. The proposal's answer
was to re-run the material half of `buildDie`, which re-bakes every face texture —
20 canvas bakes for a d20, synchronously, at the verdict beat. The cheap answer
is **clone plus re-patch**: `MeshStandardMaterial.copy` assigns `this.map =
source.map` by reference, so `m.clone()` costs zero texture bakes, and
`patchShader` re-installs exactly the two own-properties clone drops. Identical
`customProgramCacheKey`, so the program is reused and nothing recompiles.

Three more corrections: host the envelope on the **dt clock** (the lab's `run()`
is a private rAF timer — ported verbatim it freezes on a hidden tab and is
invisible to `holdClock` + `sim()`, which is exactly the capture the demo plan
specifies); retune 2.6 s → ~750 ms so it closes inside `tEnd` plus the 3 s
auto-collect; and seed the ash off `roll.seed ^ 0x5bf03635` rather than
`Math.random()`.

> **Breaks: "a visual skin can never change how a die lands."** The physics hull
> is untouched — `createDieBody` always resolves the std variant
> (js/dice.js:1200) and this changes only `mesh.material`. But a die that becomes
> 40 % holes in front of you while reporting a true value is exactly the
> visibly-impossible behaviour on offer. Buys: the nine houses stop being paint.
>
> **Breaks: dice remain solid.** Buys: the single most dramatic effect already
> sitting in the codebase, at the single most dramatic moment the app has, where
> today the crit produces zero WebGL events.

**Cost.** Medium, and smaller than proposed.

**Risk, and the one that will bite.** `skipCeremony` sets
`ceremonyLayer.classList.add('skip')` *before* the drain (js/main.js:4178), so
the stage fn must early-return on that class — otherwise pressing skip **starts**
a dissolve that then runs its full duration with no second gesture available.
That is a hard-floor violation and the proposal asserted the opposite property
already held.

Second: the **edge band** is a separate `MeshStandardMaterial` built inline
(js/dice.js:1090-1100) and never passed through `patchShader`, and its
triangles carry null UVs. A dissolving die leaves an intact wireframe cage of
bevel bands standing where the faces were. That is a design decision, not a bug
to fix quietly — Joe should see both ("the die's skeleton remains" is arguably
better).

Third, and worth saying next to "most dramatic": the trigger is a crit-fail
**and** a set declaring `shader.dissolve`, which today is voidgrain alone. One
house of nine × a crit fail. Most sessions will never see it.

**Demo.** The best of the batch, because the rig already does it:
`__lab.effect('umbra.voidgrain', 'unmake')` is reachable today with zero new
code, and `tools/lab-shots.mjs:84-89` already screenshots an effect at named
milliseconds mid-flight. **Put the look in front of Joe first, before any app
work** — if it does not land, nothing else matters. The assertion that catches
the real bug, and which nobody would think to write: after completion,
`mesh.material === getDie(type, variant).materials`, and a second voidgrain die
elsewhere on the felt read `uDissolve === 0` throughout.

### 13. The Felt Answers Each Die

**What the player feels.** Soul Deal. A d8, a d6, a d10. The d8 stops first and
half a beat later the felt under it warms — a soft disc of green-gold, blooming
to about a die and a half wide. Success. The d6 lands and the cloth under it
stays dark: a quiet die, and the table says so by saying nothing. Then the d10
stops and the felt does something you have not seen: it goes **down**. A cold
pit opens under it, light draining out of the cloth in a ring. All three answers
are on the table, in tier colours, in the order the dice actually stopped — and
only then does the verdict card print the words you already read off the felt.

**How it is built — corrected, and much smaller than proposed.** *Drop the new
atlas row.* `CELLS = 4` (js/decals.js:39) and `KIND_ROW` occupies all four
(js/decals.js:209) — a fifth kind writes outside the canvas and samples garbage
UVs. But `stamp` already honours `recipe.life`, `scale`, `alpha` and `colors`
per instance (js/decals.js:389-391), so a tier pool is
`{kind:'ring', life:1.4, scale:0.95, alpha:0.9, colors:[tierA, tierB]}` on a
**second `DecalField` with its own enable flag** — atlas, CELLS, KIND_ROW,
painters and shader all untouched, and arming meaning does not silently re-arm
the residue marks Joe switched off.

*Move the trigger off `settleFrame` and onto `stageChips`* (js/main.js:4098).
Chips already stagger per die in settle order, so the "in the order the dice
stopped" reading survives; it lands after `announce()`; it inherits
`skipCeremony`'s drain for free; and the determinism-critical fast-forward is
never touched. *Drop the `DieLightRig` arm* — as specified it would put out
another die's set glow to do it (four slots, already occupied by the roll's own
set lights from js/main.js:1975-1984). Let the disc be the only channel: the
pit still reads, because the second colour stop can go below the felt's own
value.

The read is pure and already exists: `entryOutcomes` (js/main.js:2620) returns
`{dieIndex, type, value, word, tier}` under per-die profiles and **null under
sum profiles and null for `entryHidden`** — so a D&D table gets one wash rather
than per-die pools, and a face-down roll gets nothing, both for free.

> **Breaks: the felt keeps no marks.** Flagged loudly rather than argued away on
> a technicality. What makes it a different animal: life 1.4 s versus the residue
> kinds' 6–8 s; keyed to MEANING rather than to an impact; nothing reconstructed
> on reload; and its own gate.
>
> **Breaks: quiet chrome.** Buys: the one thing this app knows better than any
> competitor — that a face MEANS something, per die, per rank column — finally
> exists somewhere other than a text card. It is also an answer to the phone: at
> 62–80 px per die a coloured pool under the die is legible where a chip is not.
>
> **Breaks: "a visual skin can never change how a die lands"** in spirit — a die
> sitting in a pit of drained light is visibly not obeying ordinary optics.

**Cost.** Medium.

**Risk.** Colour is never the only channel — the words still print and still go
through `announce()`. And the pit's floor needs a measured minimum via the lab's
`sampleWorld` (js/lab.js:1219), not an eyeball at review distance.

**Demo.** `2d10+1d6` under Soul Deal can produce a Critical Fail, a quiet die
and a Success in one throw; the settle frame is the whole argument. Then the
identical pool under `setSystem('dnd')` to show one roll producing two visibly
different tables. Frames at +120/+400/+900/+1600 ms so the sheet **proves
recovery**, which is what Joe will actually be checking. The e2e asserts state:
under `soul-deal` a known 3-die roll produces exactly N stamps; under `dnd`, one;
**under a face-down roll, zero** — write that one first.

### 14. The Edge of the World

**What the player feels.** The felt has an edge. A soft, slightly uneven
boundary a hand's width past the physics walls, and beyond it the light stops.
The mat reads as a lit island in a dark room rather than a texture that ran out
of screen. You would not call it an effect; you would call it the table. Then
you attach a Check and the dark breathes inward until the lit island is barely
wider than the arena, and the intent card floats over a small pool of gold-green
in a void.

**How it is built.** One shader patch on the existing floor material via
`onBeforeCompile`, the same technique `patchShader` uses on dice
(js/dice.js:490-541). Inject after `#include <map_fragment>`: a rounded-box SDF
in world XZ, multiply `diffuseColor.rgb` toward zero outside `uEdge` with a
`uFeather` falloff and a `uFloor` minimum. Three uniforms driven from
`stepSurface(dt)` in `tick()`. **Zero texture uploads** — the 16 MB felt
composite is never touched, which sidesteps the `decals.js:25-27` prohibition
rather than arguing with it.

It also fixes what got the CSS vignette deleted: that gradient was sized to its
BOX, so it read as corner-shading on a wide desktop and a hard oval on a phone.
This is sized to the MAT in world space — the same declaration is now the same
picture on every viewport.

**Corrected on three counts.** *Derive `uEdge` at ~0.8–1.2 units off the walls,
not 3* — at `medium` the framing is roughly flush with the mat on a 16:10
desktop, so a falloff starting 70 % further out sits outside the viewport and
the resting payoff does not exist where the reviewing happens. Add a projected-NDC
check to the demo plan. *Every `uEdge` write is a `{target, snap}` pair with an
explicit `snapSurface()` called from both skip paths* — a dt tween started by a
drained stage fn survives the escape gesture. *`fxNoise` is not reusable* — it is
a string literal inside `patchShader`'s closure (js/dice.js:497), not exported;
copy it or promote it.

**Ride the mat-text fix in the same pass**, since you are already in there:
`drawMatText`'s 26-world-unit fit and +3.4 z (js/main.js:472-489) are
independently verified broken and worth landing regardless of the rest.

> **Breaks: the mat is an opaque flat rectangle running to the frame edge.**
> Buys: the player can SEE where the physics walls are for the first time.
>
> **Breaks: quiet chrome at rest** — the resting felt carries a permanent
> gradient it did not have. Buys: the cheapest possible depth cue at zero
> uploads and zero geometry. If Joe reads it as decoration, `uFloor` raises until
> it disappears without touching any of the beats.

**Cost.** Medium.

**Risk.** A die landing near a wall must not be darkened into illegibility: the
resting lit region extends past the walls, the darkest ceremony state has a hard
`uFloor`, and the DOM readout is authoritative regardless. Assert it with a
brightness probe at the four extreme resting positions.

**Demo.** The phone frame is the A/B a reviewer judges in one second — today the
felt fills 100 % of a 390 px viewport with no visual boundary at all. Include
five occupied shelf slots in the shot list; that is where a too-aggressive edge
does visible damage.

---

## WAVE 4 — the big rule-breaks, pending a ruling

These are ranked below not because they are worse ideas but because each one
either costs more than a week, breaks doctrine Joe has to rule on first, or
depends on geometry that is measurably broken today.

### 15. The Cup — a rattle in your hands while the server thinks

*Merged. "The Cup" arrived twice: an audio-and-haptic prop with no mesh (sound
lens) and a press-and-hold cup with real geometry (physicality lens).*

**What the player feels.** You press Roll. The room drops away, everything else
ducks about 8 dB, and there are dice **in your hands** — three d6 knocking around
inside something leather and hollow, an irregular rattle with real gaps in it,
close and dry and slightly boomy. On a phone your hand buzzes in the same
irregular pattern. It lasts as long as it needs to: online, that is the POST and
the SSE round trip — the 200 ms of dead screen the app currently spends showing
you nothing at all. If the server is slow the rattle just goes on, and it does
not read as lag, it reads as you deciding when to let go. Then a throw, a short
low whoosh, the rattle cut dead — and then nothing at all for a beat, with dice
in the air.

**How it is built — the online half only, which is the correction.** The solo
path is fully **synchronous**: `requestRoll` → `rollDice` → `playRoll` complete
inside one call (js/main.js:14520-14522 → 2214 → 1930), so `beginCup` and
`endCup` are the same tick and the cup exists for zero frames. Getting a solo
beat requires *deferring* `rollDice` behind a timer — a restructure of the one
intent funnel, bringing re-entrancy, `soloAutoCollect` ordering, `pushHistory`
ordering and `clearTable` racing a pending roll. Leave it alone. Online, the
state machine already exists: `beginCup` after the intent resolves in the online
branch, `net.roll().then(r => { if (!r) endCup('setdown') })` for the rejection,
`endCup('throw')` at `playRoll`'s head, plus a **4 s hard ceiling** so a lost SSE
cannot strand the rattle (or the vibration pattern) forever.

That path fills a wait that is **real**, adds zero manufactured latency, and is
~80 % of the described experience at ~25 % of the risk. Also drop the visual
`throwIn` lerp entirely and make the cup purely pre-commit: the hold builds the
cup and the rattle, the release empties it, and the cup is gone before
`playRoll` runs. That removes the fourth playback phase, all three skip/drain
sites, the `fastForwardPlayback` hazard, the `beginCeremony` visibility fight
(it sets `d.mesh.visible = false` on every die for 1.35 s), and the
draft-vs-arriving-roll identity mismatch — because the SSE broadcasts *every*
player's rolls and `playRoll` queues FIFO, so a cup holding your 3 dice could
visibly pour out someone else's 5.

**The prerequisite that must land first, in its own line.** The Space handler
contains `if (t instanceof HTMLElement && t.closest('button')) return;`
(js/main.js:4568) *before* `skipPlainPlayback` — and the player has just clicked
the Roll button, which still holds focus. Space during the cup is swallowed and
never reaches any cup rung. By the proposal's own standard — *"if the escape
does not exist during the beat, the beat is a hostage situation and the proposal
is dead"* — this is fixed first or nothing ships.

> **Breaks: "grounded in the physical table," in an unusual direction.** It adds
> a PROP that does not exist visually — no cup mesh, no geometry, no physics body;
> the cup exists only in the ears and the palm. Buys: the single most-loved piece
> of physical dice ritual (people buy dice towers precisely to pay for latency
> filled with occlusion and clatter) at zero cost to the render path and zero
> risk to SAP body ordering.
>
> **Breaks: the implicit rule that presentation begins when the server's roll
> arrives.** Buys: the roller's client starts the cup before the server has
> authored anything. Nothing touches the value — the cup contains no faces, no
> seed, no outcome. But the client is expressing a roll that does not yet exist,
> and `endCup('setdown')` is the design's honesty guarantee. Flagged because it
> is exactly the kind of optimism this codebase has deliberately avoided
> everywhere else.
>
> **Breaks: the settings row's honest label** ("dice impact clicks",
> index.html:1015-1018). Buys: nothing — it is just no longer true. The label was
> written honestly on purpose and should not silently become a lie.

**Cost.** Large even for the online half. Depends on item 2's bus and item 1's
contact budget (the "120 ms silent gap after the throw" is derived from
`roll.sounds[0].time`, which is **0.000 for 20 and 40 dice** today — the gap is
exactly zero on the pools the design most wants it for).

**Risk.** The cup must encode pool SIZE and nothing else — not set, not dc, not
exp, not visibility — and must be identical for a held and an open 3d6. Assert
it by rendering both through `OfflineAudioContext` and requiring bit-identical
PCM. And if the cup is padded to a minimum duration to "feel good" on a fast
connection, it becomes artificial delay — the exact thing BG3's mod market
exists to strip out. Joe picks that number by hearing it, not by argument.

**Demo.** The live two-frame A/B **with a throttled network case** —
`Network.emulateNetworkConditions` at 0/200/900 ms — because the cup's whole
argument is that it converts round-trip latency from a hang into a held breath.
Demo the rejection path too, so Joe hears the set-down and can rule on whether
it feels honest. The haptic half needs a real Android phone; the headless rig
cannot vibrate.

### 16. The Table Has Sides

**What the player feels.** Four of you. Around the mat's edge, four faint
crescents of colour — yours amber at the near edge, Ana's teal on the left. The
table has SIDES now, and each side is somebody. Ravi rolls: his crescent
breathes up, and the dice come over the far edge, out of **his** side of the
table. You are not reading a name to know whose roll that is. You watched them
come from where he sits.

**How it is built — corrected on both halves.** *Move the seat number to the
roster, not just the roll.* The proposal derived arcs from local `players` index
and the throw from `roll.seat`, and stated that they must never share a source —
that is backwards. `players` is client-mutated (hello replaces wholesale,
`player-joined` pushes, `player-left` filters), and this project has a
**documented production bug where departed players linger on the roster**, so
index differs per client and the visual claim ("the dice came from Ravi's side")
can be *false* while the readout says Ravi. Add `seat` to `publicPlayers`
(server.js:434-436) under the same stable cursor discipline as `keepColor`
(server.js:886-892); the arcs read `p.seat`, the throw reads `roll.seat`, one
authored source. Better still, derive the angle from a **stable hash of
playerId** into a fixed ring of slots, so it is immune to join/leave rotation by
construction. *Drop `DecalField` entirely* — decals are OFF in every shipped
table (`stamp`'s first line is `if (!this.enabled) return 0`) and there is no
crescent kind and no 300 ms envelope in `KINDS`. Give the seats their own
`RingGeometry` sector meshes at `DECAL_Y`, additive, tinted through the existing
`glowTint`, with the breath as `mat.opacity` written from a dt clock: zero
uploads, deterministic under `sim()`, immune to the decals kill switch and the
residue ruling both.

> **Breaks: quiet chrome.** Buys: a shared table that visibly has people around
> it. Today a six-person room and a solo room look IDENTICAL on the felt.
>
> **Breaks: seeded determinism of the tumble — arguably more deterministic.** The
> spawn edge becomes server-authored rather than drawn from the seed, which
> survives roster skew and replay where a locally-derived seat would not. The
> honest cost is a new wire field and three ingress paths that must all be
> updated — this repo's most reliable way to ship a silent bug (`set` was dropped
> by two of three on its first pass).

**Cost.** Medium.

**Risk.** A seat is a POSITION and a COLOUR, nothing else. It confers no
capability, gates no action, owns no region of felt, cannot be claimed or
refused. If a seat ever becomes a thing you can take or a place only your dice
may land, the proposal has failed. Note also: solo tables get nothing by design
(empty roster, `Math.floor(rng()*4)` retained), so "swing" here means "swing for
online rooms of 3+."

**Note it lands on broken geometry.** A near-edge arc at z ≈ +2.6 sits inside
the shelf slot footprint (slots span z −0.4…+3.2 at `medium`). Fix the slot
pitch first or keep seats off the shelf edge.

### 17. The Pour — a handful and an armful should not be thrown the same way

**What the player feels.** 20d6. Today: a line of twenty dice materialises above
one edge and falls as a single slab. After: the first three arrive and you hear
them land. Then four more, over the top. Then a stream, for about a second, a
real cascade with a crescendo, dice finding room because they did not all arrive
at once. And at the end, one straggler, half a second behind the rest,
skittering past the pile — and that is the die everyone watches. Roll 3d6 and
you get the opposite: a flat fast low skitter that crosses the mat and comes
back off the far wall.

**How it is built.** `spawnDie` (js/main.js:879) already receives `count` and
`set` and has never read either for anything but the spread clamp. Give each die
a `releaseStep` derived arithmetically from `index`/`count`; spawn STATIC on a
staging line and flip to DYNAMIC on its own step inside the fast-forward. Draw
count stays exactly 12 per die plus 1 for `side`, in the same order — verified by
counting: jitter 1, height 1, target 2, speed 1, velocity.y 1, angular 3,
quaternion 3. The release schedule is **computed**, never drawn, so the keyframe
hash is safe.

**The one guard that kills it if missed.** A staged STATIC die trivially passes
the stillness test (`velocity.lengthSquared() < 0.05`, js/main.js:2048-2050),
accumulates `stillTime`, and at 0.45 s **freezes in mid-air**. Then
`allSettled` goes true, the loop breaks, face correction rotates each floating
die to its true value, and the readout is perfect while half the pool hangs in
the air — this repo's documented dominant failure mode, reproduced exactly, in
the loop the proposal claims as its primary seam. The guard is one line at the
top of the per-die stillness loop: `if (!d.released) { d.stillTime = 0;
continue; }`, which also keeps `allSettled` honest and keeps the nudge filter
off staged bodies.

> **Breaks: ceremony durations / the tumble's length.** A pour adds ~0.6–1.2 s to
> a big roll's start — against a 20d6 that is nine seconds of `SETTLE_CAP` with
> its final 2.4 s completely motionless. The roll does not get longer in any
> sense a player experiences; the dead part gets shorter and the alive part gets
> longer.
>
> **Breaks: "grounded in the physical table" — deliberately, once, for the
> STRAGGLER.** Holding the last die of a big pool an extra beat so it lands alone
> after the pile is not what a real handful does. Buys: a forty-die roll that ends
> on one legible die instead of a heap.
>
> **Breaks: "a visual skin can never change how a die lands."** A per-set `throw`
> signature means a Rimehold pool and an Emberforge pool land differently. The
> VALUE is untouched and the hull stays canonical, but the felt outcome now
> carries set identity — the one identity channel js/themes.js does not have.

**Cost.** Large, not medium. It owns the spawn-geometry re-derivation, the
theme-recipe plumbing, the per-set gate hoisted into `playRoll` (`uniformRollRate`
takes the ROLL and scans every die; `spawnDie` receives one die's set), and a
re-run of `dice-land-flat` at every zoom. Raising `SETTLE_CAP` costs memory as
well as time: +2 s at 40 dice is +4,800 keyframe pushes on a fast-forward already
measured at 2.4 s of blocked main thread.

**Demo.** Numbers first, same shape as item 1, plus a frame strip. **Obviously
worse:** if the deceleration makes a nine-second capped 20d6 feel like ten.

### 18. The Plinth — the check lands on the card, not the table

**What the player feels.** You declare a Reckoning. The card rises as it does
today — but out on the felt where the dice are going to fall, a slab of dark
bronze pushes up out of the green, half a die-height proud, with the felt's own
shadow crawling off its edge. The mat inscription burns onto its face instead of
the felt. The dice are thrown at it. They land with a harder, brighter sound —
plinth is not cloth — and if one bounces badly it can go **over the lip** and end
up on the green outside, which reads instantly as the die that got away. Then
the verdict text unfolds over the plinth in DOM, and for the first time the card
and the dice are the same object.

**How it is built.** This is ROADMAP §6b mechanism (iv) — in-scene card surface,
DOM typography — which Joe already researched and left DECISIONS PENDING. One
`CANNON.Box` static body plus one `THREE.Mesh`, both created at module
evaluation right after the wall planes, so SAP body ordering is fixed forever.
Stowed by `collisionFilterMask = 0` and armed by restoring `-1` — verified:
`needBroadphaseCollision` (vendor/cannon-es.js:4007) returns false on a zero
mask and `SAPBroadphase.collisionPairs` `continue`s on it *before*
`checkBounds`' `break`, so body order and axis list are untouched. Never added,
never removed.

**The arming call site is corrected and it was fatal.** `beginCeremony` is
called at js/main.js:2209, **after** the entire synchronous bake — arming there
means the keyframes were baked in a world with no plinth and the mesh appears
through the dice. Arm in `playRoll` before the spawn, immediately above
`const rng = mulberry32(...)` at js/main.js:1959, keyed on `roll.exp`, as one
`setPlinth(bool)` that writes the mask and `mesh.visible` together **and is also
called from `clearTable` and boot** — otherwise a reload or a clear mid-ceremony
leaves the box armed and the next plain roll bakes against a slab in the middle
of the mat.

**Split the ship.** The ceremony plinth alone delivers the whole experience Joe
named. The seated-shelf plaque depends on shelf coordinates that are measurably
broken today (5.4-unit slots on a 0.80-unit pitch), so it must follow the
slot-geometry fix rather than carry it.

> **Breaks: "the mat is ONE FLAT PIECE."** Buys: a staged roll is physically
> staged — the dice land somewhere made for them, and the BG3 shot Joe named
> becomes literal rather than imitated.
>
> **Breaks: "a visual skin can never change how a die lands."** The hull is
> untouched but the SURFACE is not, so a check's tumble genuinely differs from a
> plain roll's. Buys: the Check tier currently has no middle at all — 1.35 s card,
> a plain tumble with no chrome, then a card. Safe because the plinth derives from
> `exp`, which is shared data.
>
> **Breaks: quiet chrome at rest** (the seated-shelf half). Buys: identity at
> rest — the card IS the marker. §6b already frames this as Joe's doctrine call.
>
> **Breaks: "the table is never blocked," marginally.** The plinth occupies felt
> a queued roll would otherwise land on. Nothing is modal and nobody is locked
> out.

**Cost.** Large for the ceremony half alone.

**Risk.** If a per-viewer "no plinth" preference is ever wanted it must be
**render-only** (mesh hidden, body still armed), never physics — that distinction
has to be built in from the first commit or it will be violated by accident.
cannon-es 0.20 has no CCD and dice are thrown at 14–22 u/s at dt = 1/60, so a
thin lip is tunnel-prone: make it thick or use a chamfered convex hull. And
`plinthState().diceOff` over 200 seeded rolls is the number that settles §6b's
"physics honesty" decision — a headless run, not an eyeball.

### 19. The Tower — on a phone, the roll happens inside a vertical object

**What the player feels.** Portrait. You tap Roll and the table does not appear.
The camera drops into a wooden shaft and you are looking DOWN it, dice falling
past you — big, close, cracking off baffles you can see edge-on, going dark below
the bottom of the frame. For about a second you have nothing but sound and
shadow and the certainty that something is arriving. Then the shaft's mouth opens
at the bottom of the screen, the felt rises into frame, and the dice roll to
exactly where they were always going to stop.

**How it is built — and the correction removes most of the build.** Do not lerp
into `keyframes[i][0]`. That target is not a point: it is a horizontal line along
one table edge, `spread` wide, at height `6 + rng()*4 + index*0.9`
(js/main.js:878-907) — for 20 dice y ≈ 6→28, for 40 up to ~41. A ~180 ms lerp
from a mouth at the bottom of the screen would need that mouth to be a
13.6-unit-wide, 40-unit-tall wall. The proposal named "the handoff frame showing
a teleport" as its own obviously-worse criterion and then specified the mechanism
that guarantees it.

**The spawn line is ALREADY a vertical column** — `index * 0.9` literally stacks
the dice above one table edge. So leave the bake completely untouched, put the
shaft around that spawn column, and spend the first ~0.9 s of ordinary playback
with the camera dropped to that edge looking down, then ease the offset to zero.
No new phase, no gate, no third drain site, no `fastForwardPlayback` hazard, no
`beginCeremony` visibility fight, and no handoff frame at all — the dice are
doing the real thing the entire time and only the camera moved. That is item 5's
`stepCamera` plus one procedural mesh. It also composes with item 17: a staged
release is exactly what makes that spawn column read as a chute instead of a slab.

> **Breaks: ONE FIXED CAMERA FRAMING THE WHOLE MAT.** Buys: the first second of
> every roll framed on the DICE at phone-legible scale, with a diegetic reason for
> the move and therefore a reason to stop.
>
> **Breaks: THE MAT IS A FLAT LANDSCAPE RECTANGLE.** Buys: a portrait-native roll
> *view*. Note precisely what is not broken: the walls do not move, `TABLE_W`/`D`
> are untouched, `applyZoom` is not called.
>
> **Breaks: "a visual skin can never change how a die lands."** For ~0.9 s the
> dice are occluded by an object physics never produced while still reporting a
> true value. Buys: what people pay money for a real dice tower to buy — latency
> filled with occlusion and clatter. Silent waiting is a hang; heard-but-unseen
> waiting is a tower.
>
> **Breaks: seeded determinism of the tumble, in pacing only** — a phone shows the
> tower and a desktop may not. What each player SAW the dice do is still identical,
> because the camera sits outside the tumble, not inside it.
>
> **Breaks: ceremony durations.** ~0.9 s on every roll on a phone.

**Cost.** Large, and almost all of it is item 5.

**Risk.** `keyLight.shadow.camera.far` is 60 (js/main.js:188) and the shaft is
new geometry between the key light and the felt — leave `castShadow` on and it
paints a dark cylinder across the mat that persists into the pull-back. And the
demo's stated verdict number does not measure the claim: `zoomProbe()` projects
the world origin, and during the tower the dice are near-camera. Probe a live die.

### 20. Hands on the felt — pick a die up, set it down

**What the player feels.** The roll is over. You reach out with a finger and
pick one up — it lifts, its shadow separating underneath, and the readout does
not so much as flicker, because the readout is the answer and this thing in your
hand is now just an object. You turn it. You set it down at the edge of the mat,
apart from the others: the lucky one, or the one you are benching after it
rolled three ones. Across the table someone else sees you do it. Nobody's number
changed. And when the next roll comes, it hits the die you left there, and it
hits it for everyone, in the same place.

**How it is built.** `vendor/cannon-es.js` already exports `Ray` and
`World.raycastClosest` and they are completely unused — picking can query the
physics world the dice actually live in, the same source of truth face
correction used. A held die is a mesh under a drag, which is exactly what
`stepWhisking` (js/main.js:1295) already does on a scripted path; on release,
rewrite `d.finalPos`/`d.finalQuat`, which `stepResting` reads live every frame.

**Two mechanism swaps, both corrected.** *Do not ride `SETTING_SPECS`.* A moved
pose belongs to the ROLL, not the room: add it to the per-roll state row the
server already keeps alongside collected/cleared, which gives ordering against
roll events, per-roll pruning on collect, and — the load-bearing part — arrival on
the same path a late joiner uses. *Change js/main.js:14272 from `.find()` to
`.filter()`* and replay every uncollected on-felt roll. Today it reconstructs
exactly ONE (`[...entries].reverse().find(r => !r.cleared && !r.collected)`)
while `playRoll` does no whole-table wipe — so a joining client's cannon world is
**already** missing the other rolls' static bodies, and the proposal's own
headline assertion (both tabs' next roll produces a bit-identical keyframe hash)
fails on a late joiner today, before any die is moved. That one-line change is a
prerequisite AND closes a desync that exists at HEAD.

**One claim to correct in the other direction.** `shelveRoll` reading the
physics body (js/main.js:1304-1306) is a latent coupling, not a shipped bug —
the freeze loop writes the face-corrected pose into `d.body.quaternion` and
`beginRevealFlip` writes the body too, so nothing today can make them disagree.
Calling it a shipped bug means the "write the failing assertion first" test the
proposal promises would NOT fail — the green-check pattern, inverted. Write the
failing test against the late-joiner case instead.

> **Breaks: the felt keeps no marks — adjacently, and this needs an explicit
> ruling.** A die deliberately set aside IS a persistent mark on the table, made
> of a die rather than a decal. It survives until someone moves it. Buys: dice
> jail, the lucky die, the one you set apart — universal tabletop folklore that no
> product in the survey implements. The distinction to argue: the residue ruling
> was about the felt REMEMBERING on its own; this is a player DECIDING, and
> reversible with the same gesture.
>
> **Breaks: a settled die's position becomes shared truth on the wire.** Not on
> the Tier 2 list by name, so flagged plainly: one player can rearrange another
> player's dice. It presses hard on NO ROLES and stays on the right side by being
> perfectly symmetric — nobody has a capability anybody else lacks, the same rule
> that already lets anyone roll at any time.
>
> **Breaks: quiet chrome.** A die you can touch needs to look touchable.
>
> **Breaks: ceremony durations** — it makes the aftermath a place instead of a
> countdown. Note this argues against a shipped retune (Joe cut 6 s to 3 s because
> it felt far too slow), so the timer stays the default and hands INTERRUPT it.

**Cost.** Very large, honestly: the pose wire message, cannon-Ray picking, a drag
state machine with a scripted ease-down, pointer/click arbitration (a drag still
fires `click` on pointerup, which would trip `skipPlainPlayback`), hello-side
reconstruction extended from one roll to all, and a keyframe-hash e2e.

**Risk.** Settled dice are STATIC bodies later rolls collide with, so an unsynced
move silently diverges every subsequent roll's keyframes — values survive because
face correction forces them, which is precisely what makes it invisible until
someone hashes keyframes. And this compounds the crowding C24 measured; §3c
should probably wait behind item 5 even if picking does not.

### 21. The Well — a mat that stands up

**What the player feels.** You turn the table. The felt does not shrink — it
rotates. The mat becomes 4.1 wide and 6.7 deep, a tall lane running away from
you, and the camera drops its nose and comes forward down its length. The dice
are thrown from the far end and come *toward* you, which is a completely
different sensation from watching them scatter sideways: a bowling lane, or a
craps table seen from the shooter's end. The shelf runs up the right-hand side,
where a thumb already is. Your friend on a laptop sees the same tall lane. That
is the price and it is the honest one: this is the table's shape, not your
device's.

**How it is built.** A fourth room setting alongside `felt`/`system`/`zoom` —
six lines in `SETTING_SPECS` (server.js:324-366) using the `zoom` spec as
template, and the settings echo, hello resync and solo localStorage copy come
free. Client side it is `applyZoom` (js/main.js:11105) with `w` and `d` swapped:
that function already moves walls in place, re-derives `SHELF_Z`/`SHELF_PITCH`,
updates the shadow frustum, rewrites `CAM_EYE`, invalidates cluster poses,
reflows the shelf, recomposites the felt and refits the view.

**Land it in two commits, and reverse the implied order.** *Commit 1 is pure bug
fix and is worth shipping on its own in landscape:* `shelfSlotPos(slot) → {x,z}`
with `SHELF_SLOT_W`/`D` **derived from the pitch** instead of frozen at 5.4/3.6
(five clusters currently render as one interpenetrating slab at every preset),
`spawnDie`'s spread clamp re-derived from the live `TABLE_W` (the comment still
cites `TABLE_W = 18`; portrait `close` would give **negative** spread and the
outer dice would spawn inside a wall), and `tryFlushZoom` added to
`ceremonyFinish` — the deferral hole is real, `stepPlayback`'s ceremony branch
returns before reaching it and `ceremonyFinish` hands straight to the next queued
roll, so a client one roll behind can bake against the old walls today. *Commit
2 adds `orient` on top.*

For the lane read, **remap rather than re-draw**: keep `Math.floor(rng()*4)`
(js/main.js:1959) and fold it to the long-axis edges in portrait
(`side = raw & 1`), so the rng stream is byte-identical across clients and every
portrait throw actually arrives down the lane. The claim that `spawnDie` "already
branches on which axis is long" is false — sides 2/3 throw ACROSS the mat, so
half of all portrait rolls would cross a 4.1-wide gutter.

> **Breaks: THE MAT IS A LANDSCAPE RECTANGLE.** Buys: the only shape a portrait
> phone can actually hold.
>
> **Breaks: the throw as a sideways scatter.** Buys: dice that come toward the
> viewer down a lane — the dice-tower/craps read, which nobody in the VTT field
> has built.
>
> **Breaks: the shelf as a horizontal row.** Buys: five slots stacked up the side
> of a portrait screen, and it forces the slot-geometry fix.

**Cost.** Large, not medium: four readers of the shelf geometry to transpose, six
portrait eye presets to *measure*, the spawn re-derivation, the side remap, the
`tryFlushZoom` bug it now owns, and a two-tab cross-client scenario.

**Risk.** This is the one item on the slate that makes a phone player's need
change what the laptop player sees. That is not a role — anyone can change it,
exactly like felt and zoom — but it IS a shared cost and it must be surfaced
honestly in the settings copy rather than sold as a phone feature. **The Pocket
(item 4) buys most of the same win per-viewer, for free, and should be tried
first.**

---

## THE DEMO APPARATUS

### Decided

**Experiments live in `js/main.js` behind a flag, dark by default.** Not in the
lab. `js/lab.js` builds a parallel universe — its own `WebGLRenderer`
(lab.js:125), camera (lab.js:130-133), lights, `ENVS` presets and rAF loop
(lab.js:1037-1074) — with no roll, no server, no ceremony, no verdict, no
readout, no second player and no `playRoll`. Every item on this slate is a
property of the baked tape, `stepPlayback`, the ceremony state machine, or the
framing solver. Building any of them in the lab means reimplementing the thing
under test, which proves nothing and rots on the next `main.js` commit. **Keep
the lab for what it is provably good at: materials, geometry, per-set effects** —
item 12's dissolve is the one entry that should prototype there first.

**The flag shape is `postForced`'s** (js/main.js:252 + :5422): a module-scope
default plus ONE imperative verb that flips it *for this page only*. Never
persisted, never in the URL, never on the wire, never a room setting. That makes
it Tier-1-safe by construction — presentation pacing is already client-local per
goal 8 — and it is the only shape that survives two same-origin iframes, because
every "just you" localStorage key is global rather than per-room
(js/main.js:132-135).

```js
const FX = new Map();                    // id -> { label, blurb }
const fxOn = new Set();
function defineFx(id, label, blurb) { FX.set(id, { label, blurb }); }
function fx(id) { return fxOn.has(id); } // the guard every experiment reads
```

plus, on `__diceDebug`: `fx.list()`, `fx.active`, `fx.on(id)`, `fx.off(id)`,
`fx.only(...ids)`. **`on()` returns the resulting active list, and that is not
cosmetic** — a typo'd id must not silently no-op into a green run of the
baseline. Every scenario and every step file asserts the id is in the returned
array.

**`fx.html` at the repo root — `chrome-lab.html` with two iframes.**
`server.js:2762-2794` serves any non-dotfile under ROOT, so this needs zero
server changes. Two same-origin `index.html` frames **in the same room**, so one
roll is one server-authored roll reaching both with the same `rollId`, `values`
and `seed` — measured working. The A/B is frame-honest by construction: identical
input, one difference. Modes off its own query string:

```
/fx.html?ab=oracle-camera                 LEFT shipped, RIGHT experiment
/fx.html?ab=oracle-camera&fx=held-breath  stack experiments on the right
/fx.html?solo=pocket                      one full-bleed frame — the phone case
/fx.html                                  the menu: fx.list() as a rail
```

**The flag is read from `fx.html`'s URL, never from the app's.** `js/main.js`
keeps reading exactly two params — `room` and `as` — and GOALS §7 stands
untouched. `?solo=` matters more than it looks: the Pocket and the Well cannot be
judged on a desktop, and a full-bleed iframe on a phone *is* the app at the
phone's real viewport with the experiment armed, in one link.

**`fx.html` is single-seat, and this is a hard limit.** Both frames get the same
`playerId` (measured) because the seat key is `dice.seat.v1:<room>` in
sessionStorage and iframes share it with the top document. Same-origin is
required for `contentWindow` reach; different loopback origins fix storage and
make the frames unreachable. **So multi-seat experiments — item 16, item 7's
self-vs-other read, any spectator comparison — are headless-driver territory, not
`fx.html` territory.** `tools/steps/two-tab-roll.mjs` already seats
`localhost` + `127.0.0.1`; that is the pattern. Put this rule in
`tools/README.md` so nobody discovers it by debugging. Also: the roster will show
one player, not two — correct behaviour, surprising sight, put it in the rail
hint.

**The recorder already exists and has never been used as one.**
`holdClock(true)` freezes the rAF dt to 0 while the loop keeps rendering;
`sim(n)` advances the world by exactly n/60 s without rendering; `tick(0)`
renders without advancing. Measured: 24 × `sim(5)` in two frames landed both at
`currentRoll.time` exactly 2.000. Not "roughly the same moment" — the same
moment.

**`tools/reel.mjs` writes three artifacts per recording:** the zero-padded PNG
frames (which `contact-sheet.mjs` grids unchanged), a `.apng.png` shareable loop,
and **`name.reel.html` — the scrubber.** Zero-dep, self-contained: preloads the
frames, ◀/▶ step one sim frame, space plays, a range input scrubs, each frame
captioned with its exact `currentRoll.time`. With two tracks it adds the two
views that settle arguments: a **wipe** slider and a **difference** toggle
(`globalCompositeOperation = 'difference'` over two canvases — free, and it
answers "did this change anything at all" without eyes). APNG is for *sharing*;
the scrubber is for *judging*, because judging a 110 ms hit-stop means stopping
on a frame and stepping.

**APNG muxing is 85 lines and needs no encoder.** Frames come out of
`Page.captureScreenshot` with identical IHDR; an APNG is the same stream plus
`acTL`, an `fcTL` per frame, and `fdAT` chunks that are byte-for-byte the frames'
own `IDAT` payloads with a 4-byte sequence number prepended. No pixel work, no
re-encoding, no compression library. Verified with Chrome's `ImageDecoder`:
`{frames:16, animated:true, repetitionCount:∞}`, 0.1 % overhead. Honest cost:
2.61 MB for 16 frames at 584×600; crop to the felt and `scale: 0.5` takes a
frame from 268 KB to 53 KB. Print the size in the tool's log.

**Audio is judged from `OfflineAudioContext`, not from a screenshot.** It works
under `--mute-audio` and under SwiftShader, and it is sample-deterministic
(0/9600 differing samples across two renders). `renderRoll()` returns onsets,
per-window RMS, L/R peaks, crest factor, clipped-sample count and a hash;
`renderWav()` returns a base64 WAV (563 KB for 3 s stereo, 87 ms round trip) that
the scrubber embeds under the frame strip. **The hash is a change-detector, not
the contract** — a Chrome biquad change would flip it. Assert on the summary; let
the hash be a loud "something moved, come look," and say so in the scenario's
comment, because a golden hash re-baselined by reflex is itself a
green-check-masking mechanism.

**Two capture disciplines that are not optional.** `Page.bringToFront` before
every capture — a backgrounded target returns a valid-looking PNG of the wrong
moment. And prefix-pair filenames (`f01-a`, `f01-b`), never letter-prefix:
`contact-sheet.mjs` sorts alphabetically, which is why
`souldeal-ledger-proto.mjs`'s `A05`/`05` pairs landed at opposite ends of its
sheet.

**Graduation is explicit.** An experiment Joe accepts stops being a flag: the
guard is deleted, the behaviour becomes the shipped path, the `fx` scenario is
retagged into its real area, and the id is removed from `FX`. One he rejects is
deleted whole. A registry that only ever grows is how a codebase acquires two of
everything; `fx.list()` should stay short enough to read in one breath, and
docs/SHIPPED.md should record each verdict.

### Open

- **Does `fx.html` ship to production?** `.gcloudignore` excludes
  `chrome-lab.html` (line 30) but **ships `lab.html`**. Shipping `fx.html` is
  what makes the phone experiments judgeable at all — Joe needs a URL he can open
  on a real phone on real cellular. There are no roles and no secrets to leak, and
  the flag cannot reach another client. The cost is that a stranger could find
  `/fx.html`. One line either way; Joe's call.
- **The `fx` tag's place in the suite.** Out of `smoke` (following the `lab`
  tag's precedent) so the per-step gate stays seconds, with a row in
  TESTING.md:158-173.
- **Two facts currently written in no `.md` file** and which belong in
  `tools/README.md`: port **8231** is the agent-safe live server
  (`dice-agent` in `.claude/launch.json`) and is the only way an agent can look at
  a demo in a real browser without touching 8123; and `fx.html` is single-seat.
- **`__diceDebug.feltPixel` is broken under hardware GL** — returns `[0,0,0,0]`
  while working under SwiftShader, verified against a control canvas readback in
  the same page. No scenario uses it, so nothing caught it. Fix it before any
  surface experiment (items 8, 13, 14) is built on it.
- **`fx.html` must be its own document.** A read-only prototype this pass
  navigated to the app and `document.write`-d the host over it, which tore the
  app's DOM out from under its own SSE handler and produced two page exceptions.
  Those are an artifact of the workaround, not a finding — but they are the exact
  shape of bug a rushed implementation would ship.

---

## KILLED, AND WHY

Two kinds, and the difference decides whether an idea can come back.

### Killed on a BROKEN MECHANISM — a different mechanism might revive these

**The Arena — a mat cut to the roll it is about to receive.** *Payoff refuted by
arithmetic.* The proposal's whole buy was "dice ~2.5× bigger on screen," via a
two-line swap of `framingPoints`' two mat corners for the arena's. But
`framingPoints` (js/main.js:12696) pushes **eight** points and **six are
shelf-derived**: `outerX = shelfSlotX(4) + SHELF_SLOT_W/2`, which at
`SHELF_PITCH = (TABLE_W - 5.4)/4` works out to `TABLE_W/2` **exactly**, at every
preset, at the same 0.02 margin. The shelf slot corners already demand the full
mat width. Swapping the mat corners relaxes the far-z extent only; in x it
relaxes **nothing**, the retreat loop terminates at the identical distance, and
the dice are the same number of pixels. Three further defects: at 40 dice the
arena planes coincide with the outer walls and every wall hit generates two
contact equations, roughly doubling the impulse at exactly the stress case;
`spawnDie`'s 2.2-unit inset and 14–22 u/s speed put a 1d20 arena's spawn
essentially at the mat centre pinballing at a target one unit away, and its
`spread = min(arenaW - 4.4, …)` goes **negative** below 4.4; and the arena's felt
rect is dropped by every `recompositeFelt`, which fires on every shelf change.
(That last clause is stale — see the correction above: `recompositeFelt` fires
only on a theme change now, and there is no felt rect to drop.)
**The route back**, if it is wanted: make the six shelf points conditional on
`shelfClusters` occupancy, so an empty shelf frames the arena alone. That is the
change that actually moves the camera, and it front-loads the win where it is
needed — a solo player's first roll, every fresh room, every phone session's
opening. Do NOT ship the arena with the framing untouched; it would pass
`perf-determinism`, pass `dice-land-flat`, produce a visibly different felt, and
deliver none of the claimed payoff.

**The Held Breath — dice in your hand before they are dice.** *The shared half
has a duration of one frame, and the roller's half is near-zero.* The proposal
placed a `winding` broadcast one line above `composeRoll` (server.js:1650) and
the roll broadcast at server.js:1739 — everything between is synchronous, so the
wire interval is sub-millisecond and the spectator's client calls `beginHold` and
receives the roll in the same SSE flush. "Her table went quiet too" is a
single-frame flicker. Solo is worse: `requestRoll`'s else-branch calls `rollDice`
synchronously at js/main.js:14519, so `beginHold` and `endHold` execute inside
one statement and goal 9's table gets nothing at all. Three more: "the real throw
takes over exactly where the hand let go" is impossible, because the spawn edge
is `Math.floor(rng()*4)` from a seed the client does not hold until after the
hold is over; Space as a release gesture is swallowed by the focused Roll
button's guard (js/main.js:4568) and fires a **second roll**; and
`projectEntryFor` cannot be reused above `composeRoll` because no entry exists
yet, so the safety story needs a *second, parallel disclosure predicate* — which
is precisely the shape a leak ships in. **The route back**, and it is real: make
`beginHold` **defer the send**. `requestRoll` paints the hand and stores the
composed intent (which it already builds into `lastRequestedRoll`); `endHold` —
one click, or auto-release at 900 ms — is what calls `net.roll()`. That gives an
arbitrarily long hold, works identically in solo and online, and is strictly
safer on the value: nothing has been requested, so there is provably nothing to
leak. The shared beat then needs its own `POST /api/winding` — the new endpoint
the proposal was avoiding, and the only shape in which the table goes quiet for
the length of a breath rather than for one frame.

### Mechanisms killed inside surviving proposals

These are the *how*, not the *what*. Recorded so nobody re-proposes them.

- **FogExp2 for the felt's edge** (item 11). View-space depth ratio to the mat is
  1.25:1 at this camera; no density fogs "just past the wall" without washing out
  the felt. Linear `THREE.Fog` with near/far derived in the framing solver.
- **A shader `uWell` vignette on the Pocket** (item 4). `#ceremony-vignette`
  already exists and already darkens during that window, and the size of the die
  is the whole win on a phone.
- **`DieLightRig` for per-die state** (items 6, 13). Four slots, constructed
  `{max: 4}`, `attach()` steals the oldest — dimming settled dice evicts the
  roll's own set glows from the same pool. Use chips, or a felt disc.
- **A fifth `KINDS` row in the decal atlas** (item 13). `CELLS = 4` and all four
  rows are occupied; a fifth samples garbage UVs. Use per-instance
  `colors`/`life`/`scale` on a second `DecalField`.
- **`cer.stages` as a trigger for anything long-running** (items 10, 12).
  `skipCeremony` **calls** every remaining fn (js/main.js:4189-4193) — the escape
  gesture would *start* the effect. Stages need a `skipping` flag or a
  `{t, fn, skipFn}` shape.
- **`step *= 0` for a hit-stop** (item 6). Breaks `skipPlainPlayback` (one
  `stepPlayback` call → no-op) and `fastForwardPlayback` (500 spins, roll
  unfinished, on the hidden-tab path). Cut the recorded dead tail instead.
- **`Material.clone()` for per-die shader isolation** (item 12). Never copies
  `onBeforeCompile` or `customProgramCacheKey`, so the clone loses the fresnel rim
  too and compiles a second program. Clone **plus re-patch**.
- **Re-running `buildDie`'s material half for isolation** (item 12). 20 canvas
  bakes for a d20, synchronously, at the verdict beat.
- **A roster-index seat angle** (item 16). `players` is client-mutated and this
  project has a production ghost-seat bug, so index differs per client and the
  visual claim can be false. Hash `playerId` into a fixed ring.
- **`DecalField` for anything not shipped-dark** (item 16). `stamp`'s first line
  is `if (!this.enabled) return 0` and `DECALS_DEFAULT_ENABLED = false` in every
  shipped table.
- **A `throwIn` lerp from a cup or tower mouth to `keyframes[i][0]`** (items 15,
  19). The target is a 13.6-unit-wide, up-to-40-unit-tall line, not a point.
- **Height-gating the contact recorder on `DECAL_MAX_CONTACT_Y`** (item 1). The
  starvation is temporal; a height gate mis-files wall contacts (up to y=22) as
  air, and the wall crack is one of the sound design's four hero sounds.
- **`beginCeremony` as an arming point for anything physical** (item 18). It runs
  *after* the synchronous bake.
- **`SETTING_SPECS` for per-roll state** (item 20). A moved die pose belongs to
  the roll, and only the roll path reaches a late joiner.

### Killed at the TIER 1 HARD FLOOR — these never come back

Nothing in this pass proposed crossing it. Recorded anyway, because the prior-art
survey turned up three patterns that are load-bearing in the products Joe named
and are dead here:

- **Karmic dice** (BG3's hidden outcome smoothing). The server authors every value
  with crypto RNG. Anything that adjusts, re-draws or "smooths" a value —
  including well-intentioned bad-luck protection — is dead on arrival. Gacha
  soft-pity is the same defect in a different hat.
- **Engineered near-misses** (CS:GO's reel, which CS2 itself removed). Doubly dead
  here: the value is authored *before* the tumble, so a manufactured near-miss is
  a staged lie about a physical event whose truth is already fixed. Owlbear's
  entire engineering effort was to make the *genuine* teeter shareable.
- **Losses disguised as wins.** Firing crit-grade effects on a merely good roll.
  If every roll is a moment, no roll is.

---

## RULINGS — decided 2026-08-09 by Joe

The four gating questions are answered. **He went further than the pass
recommended on two of them**, which is itself the signal: where this document
hedged toward the shipped decision, the ruling was to break it.

**① The camera may move during the second half of a tumble — under a quiet
picture only.** It holds absolutely still while more than one die is in
motion, and begins moving only once the picture has already gone quiet (on
20d6 that is roughly the first 1.5 s of no motion at all). This narrows
UX.md:406 and C24's "ease to it after settle, never during" rather than
discarding them. `prefers-reduced-motion` owes a real alternate path — a cut,
not a faster move. *Unblocks 4, 5, 10, 19.*

**② Framing and pacing may vary per client; what the dice DID may not.** A
phone frames portrait, a desktop wide; a hit-stop may stop one client's clock
and not another's. Hard limit: **the deciding die is never cropped out of
frame**, so the teeter stays shareable — which is the Owlbear objection, and
it is answered by a constraint rather than dismissed. Nothing on the wire
changes. *Unblocks 4, 5, 6, 7, 9, 19.*

**③ Drama may cost time by default, including the bigger beats.** Not just the
~200 ms settle hold — the ~1.2 s auto-replay on a crit and the 0–3 s pre-throw
cup are in too. This goes past what the pass recommended and **argues against
a shipped decision**: the 6 s → 3 s auto-collect retune of 2026-08-03 ("6 felt
far too slow"). Two obligations ride with it: `CEREMONY_BUDGET_S` rises as an
**explicit retune**, never smuggled past a `Math.min`; and a persistent
"always fast" setting ships as part of the design, because the field's
evidence is that a per-roll skip is not sufficient. *Affects 5, 6, 10, 15, 17.*

**④ The felt may keep marks that persist while a PERSON does.** This
**amends the 2026-08-03 residue ruling** — it does not merely thread it. The
line moves from "transient and caused" to: a mark may persist as long as the
thing it represents is present. Per-player crescents are in. The cost is
named and accepted: a six-person room and a solo room currently look
identical on the felt, and standing chrome is what the 2026-08-04 aesthetic
audit cut eight effects for. *Unblocks 8, 13, 14, 16.*

**Propagation owed.** ③ and ④ change doctrine that lives outside this
document. UX.md §7's ceremony budget, GOALS' quiet-felt reading, and the
residue ruling's own entry in GOALS' superseded-decisions list all now say
something the product no longer means. That is a docs pass, not a code
change, and it should happen before the first item that depends on it ships —
otherwise the next audit reads the stale rule as authority, which is the exact
failure UX-AUDIT recorded twice.

**Not yet ruled:** the six smaller questions below — what "cinematic" should
mean, where quiet chrome ends, whether `fx.html` ships to production, shrouded
positional audio, room tone's default, and whether settled dice become
movable.

---

## THE QUESTIONS AS PUT (the reasoning behind the rulings)

Joe said "break rules **selectively**," and SELECTIVELY is the word that hands
him the choosing. Each question below unblocks a group, not a single item.

**1. May the camera move during the second half of a tumble?**
*Unblocks items 4, 5, 10, 19 — four of the six largest payoffs on the slate.*
docs/UX.md:406 says no camera moves during tumble, and C24 says "ease to it after
settle, never during." The measurement that argues for it: 1d20's last impact is
at 0.97 s of a 2.18 s tumble, so 56 % of a single-die roll is a still frame of
nothing happening. The offer is a narrower break than the doctrine forbids — the
camera holds absolutely still while more than one die is in motion, and begins
moving only under a picture that has already gone quiet. **Cost if yes:**
nausea risk, and reduced-motion needs a genuine alternate path (a cut, not a
faster move). **Cost if no:** the Oracle Camera degrades to a post-settle
re-frame, the Pocket keeps most of its win, and the Replay and the Tower lose
their reason to exist.

**2. May the tumble differ per client when the value cannot?**
*Unblocks items 4, 5, 6, 7, 9, 19.* Two players would be looking at genuinely
different pictures — a phone in a portrait framing, a desktop wide; a hit-stop
that stops one client's clock and not another's; a mix panned from your seat.
Nothing on the wire changes and both clients hold identical `values`,
`keyframes` and log text. The argument for: docs/UX.md:495-507 already pins
motion tier, skip, sound and reduced-motion as strictly client-local, and C24
already ruled the camera per-viewer because "the camera shows no one else
anything." **The argument against, and it is the strongest single objection in
this pass:** Owlbear rebuilt on deterministic physics specifically so the
near-miss teeter would be SHAREABLE. If a phone player cannot see the teeter the
desktop player is reacting to, the shared moment is gone even though the value
matched. The line this slate proposes: **framing and pacing may vary; what the
dice DID may not, and the die must never be cropped out of frame.**

**3. May drama cost time by default, and how much?**
*Affects items 5, 6, 10, 15, 17.* The additions on the table: ~180–220 ms of
held silence at the settle (item 6), ~200 ms of camera hold (item 5), ~1.2 s of
auto-replay on a crit (item 10), 0–3 s of pre-throw cup online (item 15). The
field's calibration: Dice So Nice auto-hides at **2000 ms**; slots resolve a
multi-element outcome in ~2.4 s at 600 ms/step; hit stop lands at 150–220 ms;
BG3's full ceremony is ~6–8 s and has a mod market dedicated to cutting ~4 s of
it, with 2.5–3 s residual even with all animation stripped. **You have already
retuned one dwell downward** (6 s → 3 s auto-collect, 2026-08-03, "6 felt far too
slow"), so items 6, 10 and 15 all argue against a shipped decision. The field's
evidence also says a per-roll skip is **not sufficient** — a persistent "always
fast" setting is part of the design, not polish. And item 10 needs
`CEREMONY_BUDGET_S` raised from 1.6 as an explicit retune rather than smuggled
past a `Math.min`.

**4. What does "cinematic" mean, now that the notation flag already exists?**
Today Cinematic = Check + one word (`Reckoning` vs `Ordeal`) + a visible dock
strip + a gold sweep + 250 ms of slow-mo. A Check's *tumble* has no card chrome
at all: the dock strip is cinematic-only (css/style.css:4999) and the intent card
has faded. The Check tier — the one most rolls will use — is bookends around a
plain roll with no middle. Items 5, 6, 12 and 18 all want to fill that middle,
and the question is whether they fill it for `cine` only, for `check` too, or for
**plain rolls as well**. The measurement that argues for plain: `1d20 dc 15`
parses with `exp: null` and is a plain roll, and plain rolls are the majority.

**5. May the felt say more than it does?**
*Unblocks items 8, 13, 14, 16, and the mat-text fix.* Four separate items press
on the 2026-08-03 residue ruling from four different angles, and they are not
equally close to it: item 8 re-tints a glow that is *already* painted for that
cluster and dies with it; item 13 adds a 1.4 s meaning-keyed disc behind its own
gate; item 14 adds a permanent light falloff with no mark at all; item 16 adds
crescents that persist while a *person* is present. Your objection was
persistence beyond the thing that made the mark. One ruling — "transient and
caused, yes; accumulating, no" — clears all four. A second question rides along:
**should `drawMatText` be fixed?** It is GOALS goal 2's named effect, it renders
today as two clipped words three times too wide painted outside the front wall,
and it is a two-constant fix plus the scenario the guarding comment admits does
not exist.

**6. Quiet chrome versus spectacle — where is the line now?**
*Affects items 10, 11, 13, 16, 18, 20.* The shipped contract is dot-only shelf
markers and the peek doing the talking. Six items want to put something visible
on or above the felt at rest or near-rest: a clickable settled cluster with no
affordance, a room that dims, coloured pools under dice, per-player crescents, a
standing bronze plaque per collected roll, a die that looks touchable. The
strongest case against is the 2026-08-04 aesthetic audit, which cut eight shipped
effects by name — several for exactly the sin an always-present mark commits. The
strongest case for is that a six-person room and a solo room currently look
**identical** on the felt.

**7. Does `fx.html` ship to production?** One line in `.gcloudignore`. Shipping
it is what makes items 4, 7, 15, 19 and 21 judgeable at all, because they cannot
be judged on a desktop. No roles, no secrets, and the flag cannot reach another
client. The cost is that a stranger could find `/fx.html`.

**8. Does a shrouded roll get positional and per-type audio?** *Item 9.* A
redacted roll still carries its die **types** on the wire and its dice are
visibly on the felt, so pan and type-timbre leak nothing a spectator cannot
already see. Erring safe (the anonymous legacy click, as today) costs the
shrouded roll its entire new voice for no divergence reason. Worth a ruling
rather than an assumption.

**9. Room tone: on or off by default?** *Item 9.* The app's acoustic default
state is absolute digital silence — quieter than any room a person has ever sat
in — and a bed is what makes the pre-roll hush possible, because you cannot take
away nothing. It is also the most likely thing on this list to get reverted the
same evening the way the felt residue was. It should ship dark behind its own
rung either way; the question is whether it ever comes on.

**10. Do settled dice become movable, and does that pose ride the wire?** *Item
20 alone, but it is the largest single doctrine question here.* A die you set
aside is a persistent mark on the table made of a die, and one player would be
able to rearrange another player's dice. It stays clear of NO ROLES by being
perfectly symmetric. It is very-large effort and it compounds the crowding C24
measured, so the honest sequencing is behind item 5 regardless of the ruling.

---

## HOW THIS RELATES TO THE ROADMAP

Recorded so ROADMAP.md can be updated coherently later. **Do not treat this
section as an edit** — no roadmap entry was changed by this pass.

**C24 (frame the DICE, not the table)** — item 5 *is* C24, built. It implements
step 1 (dice AABB in `framingPoints`), keeps step 3 (floor and ceiling clamps)
and step 4 (per-viewer, not room state), and **argues against step 2** ("ease to
it after settle, never during") with a measurement and a narrower rule. Item 4
extends C24 into the portrait case C21/C23 measured and could not solve, and
supplies the number C24 asks for. C24's standing instruction — *do not take
another notch off the mat until this exists* — is untouched: nothing on this
slate shrinks the mat.

**§6b (Dice-on-card — BG3 cinematics & the seated shelf, DECISIONS PENDING)** —
item 18 is §6b mechanism (iv) made concrete, with the arming call site corrected
and the ship split. It answers §6b's "physics honesty" pending decision with a
falsifiable number (`plinthState().diceOff` over 200 seeded rolls) and its
"ceremony surface ownership" decision with the recommendation §6b already
reached (HTML cards stay the type layer; the plane is pure stage). It does **not**
answer the quiet-chrome or felt-real-estate decisions — those are open questions
5 and 6 above. §6b's own caution that "seated cards occupy zones, step 3 should
probably land first" is confirmed and sharpened: the shelf slots overlap 6.75× at
`medium` today, so the seated half must follow the slot-geometry fix in item 21's
commit 1.

**§3c (Dice on the table before they are rolled, "not as urgent")** — item 15
answers the *ritual* half of §3c without the geometry: a cup that exists only in
the ears and the palm, filling a wait that is already real. Item 20 answers the
*physical* half and is the expensive one. If §3c is revived, item 15 is the
cheap route in.

**§12 (Per-player roll mats)** — item 16 is §12 with its named machinery
replaced. §12 is described as "a visual skin over step 3's zone machinery," and
that machinery does not exist and was **superseded**: docs/UX.md:1287's own header
reads "The collect shelf — *supersedes landing zones*." Item 16 reaches the same
goal ("mat color per-player, visible to all") through server-authored seat
numbers and scene geometry, needing no zones at all. §12 should be rewritten
against that, or closed and re-minted.

**Tier 6 §9 (Dice sets — art direction continues)** — item 12 is the sharpest §9
item available, because it ships an effect that is already compiled into every
player's table and has never run. Items 6, 9 and 17 extend §9's per-set language
into three axes it does not currently have: a settle voice, a throw signature,
and audible deceleration matching the shipped rate graph. Note item 17 raises a
real §9 design question rather than an oversight — `uniformRollRate` deliberately
refuses a rate curve on mixed pools, but a per-die scrape or throw would work
fine in one, so either the rate graph goes per-die too or the new channels honour
the same uniformity rule.

**Tier 5 §6 (Ceremony refinements)** — its three open items are all touched. The
roller-held declare phase is reached from the other end by item 15 (a hold that
costs no `check`/`cine`/`dc` token). The "always skip ceremony" personal setting
is made a *requirement* rather than a nicety by open question 3 and by the
prior-art evidence that a per-roll skip is not sufficient. And **"Esc joins
click/Space as ceremony skip" (ROADMAP:607) is confirmed still broken and is made
strictly worse by anything that multiplies staged rolls** — the Escape chain at
js/main.js:13100-13125 has no ceremony rung and, with anything in the command
box, clears the draft instead. Item 8's ceremony half must fix it alongside.

**Tier 0 §0a (the fast-forward's main-thread stall, Commit C, reverted twice)** —
items 1 and 17 both land inside that loop and both must be measured against it,
not assumed. New numbers this pass adds to the record: 40 d6 costs ~244–306 ms,
40 **mixed** d20/d12/d10/d8 costs 2092–2671 ms at the same body count. The cost
scales with convex hull face count, not body count. That 2.4 s figure is not
written down anywhere in the roadmap and should be.

**Tier U (the UX audit)** — item 6's per-die chip pop and item 13's tier discs
both press on U20 (the shelf marker redesign) and on the chips-off-by-default
question, since `chipsOn` defaults false (js/main.js:2490) and one of the
ceremony's four beats is therefore invisible on a stock table.

**New defects this pass found that belong in the roadmap regardless of whether
any experiment ships:**

1. **40d6 lands in total silence with no particles, no decals and no shock ring** —
   400 recorded events, all at simTime 0, zero below y=0.6. Confirmed by
   independent re-simulation. (Item 1.)
2. **22 of 40 dice spawn inside the y=22 ceiling** and are ejected downward at
   ~220 u/s. (Item 1.)
3. **A tab that joins a room and watches a roll before any gesture is silent for
   the life of the page** — `audioCtx` is never resumed. (Item 2.)
4. **`drawMatText` fits to 26 world units on an 8.6-unit mat and draws at z=+3.4,
   outside the front wall.** GOALS goal 2's named inscription renders as two
   clipped words.
5. **Five shelf clusters render as one interpenetrating slab** — `SHELF_SLOT_W` is
   a fixed 5.4 against a derived pitch of 0.80 — while `__diceDebug.shelf` reports
   five clean clusters and every assertion is green.
6. **The framing solver gives up silently below ~370 px of canvas**, leaving ~20 %
   of the mat off screen on every phone, at every zoom preset.
7. **`ceremonyFinish` never calls `tryFlushZoom`**, so a client one roll behind can
   bake a roll against the old walls.
8. **A late joiner reconstructs only the newest uncollected roll** (`.find`, not
   `.filter`), so its physics world is already missing other rolls' static bodies.
9. **`__diceDebug.feltPixel` returns `[0,0,0,0]` under hardware GL.** No scenario
   uses it, so nothing caught it.
10. **The Escape key does not skip a ceremony** and clears the draft instead
    (docs/UX.md:448 says it does).

Every one of those is a green check masking a broken thing. Eight of them are
fixed as a side effect of items on this slate, which is the strongest argument
for building the slate in the order given.
