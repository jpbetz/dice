<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Dice artwork leaves the startup path

Implementation: `39b9ec7`.

The inherited assumption was that one tiny die preview should prepare every
die in its set. `warmVariant` built all seven meshes, face atlases and PNGs
even for the hidden phone builder. Removing that work improves the complete
load-to-roll journey without adding another permanent control.

Built-in sets now use 192 × 192 WebP portraits rendered offline from the same
meshes, materials, poses and lighting. An image is requested only when a
control using it is visible. Duplicate controls share a request and decoded
image; hidden pools and history cannot warm another set. The whole catalogue
is 1,015,886 bytes across 175 files, **not a startup download**. Opening the
standard palette requests seven files totaling **41,714 encoded bytes**;
d100 reuses d10x. The observed phone startup requests zero portraits and
creates zero portrait WebGL contexts. Built-in browsing still creates zero.

Missing assets and edited/custom recipes use the live renderer, one requested
type per frame, with its temporary WebGL context released after the queue
drains. Recipe signatures prevent an edited set from showing an old baked
portrait. Late responses cannot overwrite a newer choice. Removed hidden
nodes release observer references. Recorded history and explicitly assigned
pool sets retain their own artwork when the player's default changes.

Buttons retain their labels, dimensions and click targets while images load.
The loading cue is a small coloured dot; the actual phone screenshot caught
and removed the browser's unwanted empty-image outline. Rolling closes the
builder and exposes the result even with every portrait request held open.

## Measured journeys

Baseline: `44a5ad2`. Three fresh navigations per version and path on an
i9-13900K, Chrome 151, 390 × 844 mobile/touch emulation, DPR 1, 4× main-target
CPU throttling, HTTP cache disabled, local ephemeral server. Benchmark and
owned browser processes used CPU affinity 0–15. Chrome reports SwiftShader;
workers are not equivalently throttled. The browser persists across a batch,
so shader caches are not cold-isolated. The final benchmark batches ran
sequentially, separately from this change's bakes and tests. Other workspace
activity was not controlled.

| Moment, median | Before | After |
| --- | ---: | ---: |
| Navigation → usable quick-roll control | 1,497 ms | 667 ms |
| Longest startup task, quick path | 1,090 ms | 269 ms |
| Navigation → first visible dice, quick 2d6 | 2,039 ms | 1,207 ms |
| Navigation → first visible dice, Build → two d6 → Roll | 2,438 ms | 1,679 ms |
| Cold builder opening, click → two animation frames | 99 ms | 99 ms |
| First builder opening during incoming 8d6, quick path | 118 ms | 116 ms |
| All palette images loaded at that opening | 164 ms | 281 ms |
| Reopened builder during incoming 8d6, builder-first path | 99 ms | 98 ms |

The quick path reaches usable controls **55% sooner** and visible dice **41%
sooner**. The builder-first journey reaches visible dice **31% sooner**.
The saved startup time is therefore not simply transferred to opening the
builder. Its images do arrive progressively: the first uncached opening
during another player's roll took 168–286 ms for all portraits, compared
with 164–173 ms when startup had already generated them. Controls work
throughout, and reopening uses the loaded images.

The first prototype only split live portrait rendering by type and frame.
It improved startup but moved expensive work into the builder (about 1.2 s
for all art and a 266 ms activity task in its diagnostic run). That result
led to the pre-rendered built-in assets instead.

## Remaining cost and limits

This is **not an active-play frame-rate improvement**. The old eager artwork
also incidentally warmed the live 3D mesh/atlas cache. Without it, a first-use
die still needs its actual mesh: quick 2d6 tap-to-visible moves from 367 to
386 ms; the builder path moves from 375 to 430 ms. The four-player activity
includes a first 4d20, where its longest task grows from 73 to 215 ms in the
quick path (72 to 222 ms in the builder path). The profile attributes most
of that new task to atlas `drawImage` work. Reducing that first-use cost is
the next implementation target; precomputing every mesh at startup would
restore the original waste. A single custom portrait can also still be a
long task even though the queue yields between types.

These are software-rendered local browser comparisons, not physical iPhone,
hardware GPU, battery or internet-delivery measurements. First visible dice
means a submitted renderer frame with moving dice projected inside the
phone viewport and an uncovered canvas, not GPU presentation time. The
builder metric is a two-animation-frame proxy backed by screenshots. The
probe uses real pointer input and natural playback; it never accelerates
the film with `settle()`. A saved guest name skips time spent choosing a name.

[Measurements](measurements.json) retain individual samples, startup and
activity tasks, input timing, visible-die bounds, artwork counters and hot
functions. Full profiles/captures are in
`tools/out/play-performance-dice-art-{before,after}-{quick,builder}-pinned`.
An earlier calibration batch varied from 1.55 to 2.63 s for unchanged
baseline startup; it is retained separately in
`tools/out/play-performance-dice-art-before-pinned`. The table uses the
subsequent matching batches; its baseline quick range is 1.485–1.527 s.

## Visual and behavioral proof

The separate DPR 3 phone pass matches the owner's iPhone 12 Pro emulation:
[pending portraits](phone-pending.png), [a visible roll while images are
held](phone-roll-while-pending.png), [loaded standard dice](phone-standard.png),
[Black Anvil](phone-anvil.png), [an edited red recipe](phone-edited.png), and
[four players](phone-four-players.png). The
[desktop capture](desktop-anvil.png) includes a pool pinned to standard dice
alongside the player's Black Anvil palette. The captures were opened and
inspected. [Artwork/resource counters](artwork.json) accompany the images.

```sh
taskset -c 0-15 node tools/drive.mjs tools/steps/play-performance.mjs after-quick --plain --cpu=4 --runs=3
taskset -c 0-15 node tools/drive.mjs tools/steps/play-performance.mjs after-builder --plain --cpu=4 --runs=3 --builder-first
node tools/drive.mjs tools/steps/dice-art-look.mjs
node tests/dice-art.test.mjs
node tests/e2e/run.mjs --only die-art,themed-chrome,pool-set-override,dev-set-roundtrip,dice-art-loading
npm test
```

The six focused scenarios pass, covering hidden work, cache reuse, rolling
while requests wait, unchanged button geometry, stale responses, missing
images, edited recipes, shared theming, hidden-roll shrouds and pool overrides.
Older tests now open and await the relevant artwork instead of requiring
hidden controls to generate it. The unit check catches missing assets and
stale recipe/renderer manifests. All runs use owned ephemeral ports.

The complete `npm test` command passes: unit and fuzz checks, all 77 browser
smoke scenarios, and the account/library/home/People integrations, including
all 13 People scenarios. No physical-device run or deployment was performed.
