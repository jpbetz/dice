<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# First-roll performance: stop preparing unseen mats

Implementation: `40708b9`.

The inherited assumption was that synchronizing settings should prepare every
mat's visual preview. At startup, twelve hidden choices painted and retained
1024 × 1024 textures, then encoded full-size PNGs for 15px swatches. CPU
profiles put `renderFeltSwatches` alone at about 1.7 seconds of self time under
4× throttling, before adding the procedural painters it called.

Previews now paint only when they intersect the viewport, including clipping
by the settings scroller. Names and colours are available immediately. Each
preview runs in a separate task after a frame, uses the same seeded painter
at 256 × 256, and shares its cached image with the larger appearance sample.
Only mats actually used by the live table retain full-resolution textures.
Hidden image-based choices also defer their image fetch. Catalogue edits and
image load/failure replace stale previews; closing or leaving Appearance stops
unseen work. Live mat recipes, dice, physics and the persistent layout are
unchanged.

## Measurements

Medians of three fresh navigations per case and version, baseline `7b6b370`.
Chrome 151.0.7922.108 on an i9-13900K, 390 × 844 mobile/touch emulation at DPR 1,
4× main-target CPU throttling, HTTP cache disabled, local ephemeral server.
The browser process persists across samples; GPU/shader caches are not cold-isolated.
Chrome reported **SwiftShader**, not the host NVIDIA GPU. Worker CPU is not
equivalently throttled. These are controlled browser comparisons, **not
physical iPhone, hardware GPU, internet delivery or battery measurements**.

| Moment | Table before | Table after | Copper before | Copper after |
| --- | ---: | ---: | ---: | ---: |
| Navigation → connected, usable quick roll | 3,861 ms | 1,479 ms | 3,977 ms | 1,593 ms |
| Longest startup task | 2,918 ms | 1,082 ms | 2,902 ms | 1,080 ms |
| Tap 2d6 → first submitted frame with visible moving dice | 320 ms | 356 ms | 629 ms | 618 ms |
| Longest task during multiplayer activity | 71 ms | 71 ms | 107 ms | 110 ms |
| Longest task while opening and browsing Appearance | 94 ms | 144 ms | 104 ms | 147 ms |
| Encoded preview strings after browsing all mats | 8.20 MB | 0.62 MB | 8.20 MB | 0.62 MB |

Startup improves by **62% on Table and 60% on Copper**. Preview strings shrink
by **92.5%**; they are generated locally, so that is not network-byte savings.
The new browser check observes one retained full-size mat texture at startup
and still one after browsing every choice, instead of the former twelve.
It observes zero generated preview images during startup and Preferences.

Appearance itself reaches its first frame faster on Table: 225 → 47 ms after
the Appearance click. All visible textures finish progressively around
1.1 seconds after that click (previously 0.48 seconds, after paying the image
generation cost during startup). A single procedural preview still reaches
about 144 ms under 4× throttling; splitting the work avoids the old
whole-catalogue stall but does not make each painter free. Copper's Appearance
measurement also includes switching its draft to The Table to expose mats.

There is **no established playback speed improvement**. Four-player activity
includes twelve saved pools, incoming 8d6 and 4d20 rolls, and pointer input to
open and close Build a roll while a roll runs. The active-frame timings remain
limited by the software renderer and are preserved as diagnostic data, not
phone frame-rate claims.

## Reproduction and proof

```sh
node tools/drive.mjs tools/steps/play-performance.mjs after --cpu=4 --runs=3
node tests/e2e/run.mjs --only table-controls,silt-is-its-own-cloth,felt-grain-is-seeded,dev-image-mat,dev-felt-roundtrip
npm test
```

The probe supports `--plain`, `--copper`, `--dpr=3`, and optional `--network` (80 ms
latency, 500,000 bytes/s download); network throttling was not used for these
results. It uses owned ephemeral ports and never touches 8123. The readiness
probe requires a connected client and a hit-testable 2d6 control, not just
module evaluation. It seeds a returning guest name; time spent choosing a
name is outside the measurement. Copper starts with three other players.
Distinct origins keep saved pools from one case out of the next.

The roll probe follows real pointer input and natural playback, without the
harness's accelerated `settle()`. It observes the first renderer frame with
moving dice projected inside the actual phone viewport and an uncovered
canvas. This is CPU submission, not GPU/compositor presentation time. The
[first-roll capture](phone-first-roll.png) and
[four-player capture](phone-four-players.png) were inspected, as were
[Appearance before](appearance-before.png) and
[Appearance after](appearance-after.png).

A separate 390 × 844, DPR 3 follow-up also passed: the
[denser Appearance capture](appearance-retina.png) retains the material
swatches, and the [four-player capture](phone-four-players-retina.png) keeps
results, pools and navigation visible. The More control is at y=797–840
inside the 844px viewport, with no page scroll or viewport scaling. These
1170 × 2532 captures were inspected; this follow-up is excluded from the
timing comparison above.

[Measurements](measurements.json) preserve individual samples, medians,
long tasks, input queue delays, resource timings and startup hot functions.
Full CPU profiles and captures are under `tools/out/play-performance-before`,
`tools/out/play-performance-before-copper` and `tools/out/play-performance-after`.
The initial combined baseline stopped at its Copper case because the probe
reused an origin whose saved pools hid quick dice; the corrected Copper
baseline uses fresh origins, with no application changes between baselines.

The focused checks cover hidden work, full-size texture retention, cached
reopening, editing and invalidation, preview versus Apply, phone controls,
shared mat consistency, seeded grain, custom catalogues and image load/failure.
Older mat tests now inspect visible previews and wait for image loading on
use, instead of requiring eager work behind a closed dialog.

Validation passed: all seven focused scenarios (after updating their on-use
fixtures), the complete `npm test` command with unit/fuzz checks, all 76
browser smoke scenarios and the account/library/home/People integrations
(including all 11 People scenarios).

## Remaining cost

The next measured startup hotspot is synchronous dice-button artwork:
`warmVariant` prepares all seven die types and their face atlases, including
the hidden phone builder. It accounts for most of the remaining one-second
startup task. First-use shaders and modeled-table rendering still affect
tap-to-visible latency. These need a separate measured change and a physical
iPhone check; this slice addresses the largest proven startup cost.
