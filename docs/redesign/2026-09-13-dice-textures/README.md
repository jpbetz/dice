<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# First-roll texture preparation

Implementation: `31cb4fe`.

The preceding portrait pass stopped preparing unused dice at startup. That
exposed a roughly 215 ms first-use d20 task during play. The inherited
assumption was that copying a one-pixel strip from a large canvas costs only
the strip. Instrumenting the actual calls showed otherwise: forty self-copies
accounted for 160 ms of a 187 ms standard d20 build in the throttled browser.

The face atlas now uses a reusable 260 × 260 scratch tile per texture
channel. It paints one 256 × 256 face and the same two-pixel filtering
gutters there, then copies the complete tile into the final atlas. It never
samples the growing atlas. The number of faces increases the number of
small copies, rather than also increasing the canvas each copy snapshots.

This changes only atlas assembly in `js/dice.js`. Texture sizes, cached
resources, material groups, dice geometry, physics and UI layout retain
their existing behavior. A scratch tile is temporary, not another retained
Three.js texture. The procedural flow/dissolve fallback is unchanged.

## Evidence for the cause and preservation

Three cold builds of thirteen representative cases compare complete RGBA
texture hashes, including every gutter, along with positions, normals, both
UV channels, groups, hull vertices/faces and face values. **All 39 comparisons
match the baseline**. Cases cover all seven standard shapes, shrouds, ivory,
Sea-glass, Monster symbols, a three-channel custom recipe and Black Anvil's
procedural fallback. [Before](factory-before.json) and
[after](factory-tiles.json) retain every sample and hash.

| Cold factory build, median | Before | After |
| --- | ---: | ---: |
| Standard d6 | 25.6 ms | 12.1 ms |
| Standard d20 | 187.3 ms | 38.1 ms |
| Shrouded d20 | 195.6 ms | 41.5 ms |
| Ivory d20 | 191.2 ms | 39.4 ms |
| Custom d20, colour/normal/emissive maps | 769.1 ms | 303.3 ms |

The standard d20's self-copy time falls from 160.4 to 8.4 ms. This is a cold
factory measurement with canvas-call instrumentation, not a complete roll.

An initial direct-edge experiment changed gutter pixels because it changed
the filtering sequence. The small tile keeps that original sequence and
passes the full-image comparison. Regenerating all 175 built-in portraits
then produced **byte-identical WebP files**; only the renderer-source digest
in the manifest changed.

## Player-visible measurements

Baseline `fdb63b9`; three fresh navigations per version and case. The existing
play probe now also supports choosing the first notation/set and receiving
a four-set roll. It uses hit-tested pointer input, natural playback and an
uncovered canvas with projected moving dice. No accelerated `settle()` is
used for timings. A saved guest name excludes time spent choosing a name.

| Moment, median | Before | After |
| --- | ---: | ---: |
| First 1d20 tap → first visible dice | 657 ms | 431 ms |
| Navigation → first visible 1d20 | 1,521 ms | 1,233 ms |
| Longest task during ordinary multiplayer activity | 217 ms | 80 ms |
| Longest task during first four-set multiplayer roll | 1,225 ms | 694 ms |
| Navigation → usable quick-roll controls, ordinary case | 701 ms | 649 ms |
| Builder opening during incoming 8d6, ordinary case | 120 ms | 120 ms |

The first d20 appears **34% sooner** after tapping. The ordinary activity
stall is **63% shorter** and the mixed-set stall **43% shorter**. Startup and
builder opening retain the previous pass's gains; no preparation was added
to startup. Quick 2d6 tap-to-visible changes only slightly, 418 → 393 ms.

The ordinary case starts with the player's 2d6, then adds three peers,
twelve saved pools, an incoming 8d6, opening/closing the builder during play,
and the first 4d20. The mixed case changes that last roll to standard, Ivory,
Sea-glass and Monster dice, one of each. This deliberately exercises four
cold material variants, including a shader not needed by the ordinary case.

[Play measurements](play-measurements.json) retain the individual samples,
tasks, input timing, projected dice bounds, artwork counters and profiles'
hot functions. Full profiles and screenshots are in
`tools/out/play-performance-texture-{before,after}{,-d20,-mixed}`.

## Limits and next work

The test machine is an i9-13900K running Chrome 151 with SwiftShader,
390 × 844 mobile/touch emulation, DPR 1, 4× main-target CPU throttling and
CPU affinity 0–15. HTTP cache is disabled on an ephemeral local server.
Workers are not equivalently throttled; browser/shader caches persist
within a batch. Batches ran sequentially, separately from this change's
bakes and tests; other workspace activity was not controlled.

These are local software-renderer comparisons, not physical-iPhone,
hardware-GPU, battery or internet measurements. The first-visible probe
observes CPU frame submission, not compositor presentation. Startup timing
variation should not be read as an additional startup optimization.

The mixed-set first-use stall remains noticeable. Its profile now spends
about 189 ms in shader program checks, 101 ms in canvas drawing and 55 ms
in texture upload, versus about 648 ms in drawing before. Complex custom
face painters and procedural materials also remain expensive. Those costs
need their own measured work, including hardware/physical-phone profiling.
Ordinary active-frame p95 stays around 33–34 ms in this software renderer;
this change reduces preparation stalls, not steady playback frame time.

## Reproduction and visual check

```sh
taskset -c 0-15 node tools/drive.mjs tools/steps/dice-texture-cost.mjs before
taskset -c 0-15 node tools/drive.mjs tools/steps/dice-texture-cost.mjs after --compare=tools/out/dice-texture-before/report.json
taskset -c 0-15 node tools/drive.mjs tools/steps/play-performance.mjs after --plain --cpu=4 --runs=3
taskset -c 0-15 node tools/drive.mjs tools/steps/play-performance.mjs after-d20 --plain --cpu=4 --runs=3 --first=1d20
taskset -c 0-15 node tools/drive.mjs tools/steps/play-performance.mjs after-mixed --plain --cpu=4 --runs=3 --incoming-mixed
node tools/drive.mjs tools/steps/dice-texture-look.mjs
node tests/e2e/run.mjs --only dice-face-atlas,dice-art-loading,pool-set-override,dev-set-roundtrip,perf-determinism
npm test
```

Run each `before` command against the baseline source. The separate visual
pass uses the owner's 390 × 844 iPhone 12 Pro viewport at DPR 3, with real
pointer input through first d20, result clearing, building and rolling while
another player's mixed dice are on the table, then four-player results.
[First visible d20](phone-first-d20.png), [its result](phone-d20-result.png),
[Roll returning from the builder](phone-builder-return.png),
[four players with mixed dice](phone-four-players-mixed.png), and the
[desktop view](desktop-four-players-mixed.png) were inspected. The
[layout/roll record](visual-checks.json) confirms no page scroll or viewport
scaling; More remains hit-testable at y=797–840 in the 844px viewport, and
Build a roll also stays inside the viewport throughout.

All six focused scenarios pass: the 63-case face-atlas rendering proof,
portrait on-demand and missing/edited-image paths, mixed pool overrides,
live set editing and shared-film determinism. The regenerated portrait
catalogue/renderer unit check passes.

The complete `npm test` run passes on rerun, including 77/77 smoke scenarios
and 13/13 People scenarios. The initial run stopped at a server-only
`places-wire` fixture with `TypeError: fetch failed`; its cause was not
established. That fixture passed 26/26 in isolation, and the complete suite
then passed without code changes.
