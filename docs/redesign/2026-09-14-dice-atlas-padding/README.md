<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# First-use dice atlas packing

The first 4d20 activity's longest task falls from **209 ms to 79 ms median**
in the retained phone-emulation journey. Ordinary first 2d6 tap-to-visible
time is effectively unchanged. This addresses the remaining first-use cost
identified in the [portrait work](../2026-09-13-dice-art/README.md).

The inherited assumption was that padding one face could read the growing
atlas cheaply. Its two side-gutter copies used the destination canvas as their
source, which can require a snapshot of a much larger surface. The packer now runs the
same five paint/copy operations in one reusable **260 × 260** tile, clears it
before every face, then copies the completed tile into the atlas. Reuse spans
all channels in that build. Direct corner copies were rejected: interpolation
and alpha compositing changed gutter pixels despite unchanged face interiors.

The actual painted pixels, gutters, corner overlap, UVs, geometry, physics
hulls, materials and draw groups stay identical. The tile adds 270,400 bytes
of temporary logical RGBA storage per build; retained geometry and texture
sizes are unchanged. No catalogue warmup or portrait work is added to startup.

## Complete journey measurements

Baseline `ab6a225`; three fresh navigations per version, sequential batches.
i9-13900K, CPU affinity 0–15, **390 × 844 touch/mobile emulation, DPR 1**,
4× main-target CPU throttling, disabled HTTP cache, local ephemeral server.
The reported renderer is SwiftShader. Workers are not equivalently throttled;
these are not physical-phone, hardware-GPU or battery measurements. Other
workspace activity and fully isolated shader-cache state are not controlled.

| Moment, median | Before | After |
| --- | ---: | ---: |
| First 4d20 activity: longest task | 209 ms | 79 ms |
| Activity profile: `drawImage` self time | 155.9 ms | 25.7 ms |
| Ordinary first 2d6: tap → visible dice | 387.9 ms | 386.6 ms |
| Ordinary first 2d6: longest task | 216 ms | 220 ms |
| Navigation → usable quick-roll control | 645.2 ms | 665.2 ms |

The first-use activity task ranges are 207–210 ms before and 77–79 ms after.
The profile isolates the removed canvas cost; this is not a general frame-rate
or startup improvement. First-roll renderer/audio setup remains substantial.
Both batches request **zero startup portraits**; cumulative live-portrait
renders and portrait WebGL contexts remain zero during the built-in journey.

[measurements.json](measurements.json) retains all six samples, hot functions,
resource counters and the separate small canvas diagnostic. The complete
journey uses real pointer input and natural playback: quick 2d6, another
player's 8d6, opening the builder, then a first-use 4d20. The material/parity
tools run separately and do not warm the journey's cache. Full profiles remain
under `tools/out/play-performance-atlas-{before,after}-quick` in the measurement
worktree. Timing is submitted-frame visibility, not GPU presentation time.

## Pixel, material and behavior proof

[parity.json](parity.json) retains equal before/after hashes for **16 real
material/type combinations** (14 atlased and two shader fallbacks), including
full atlas RGBA, face interiors,
geometry, original UVs and hull/value data. Full-atlas comparison is explicitly
opted into with `--whole-atlas`; older pre-atlas records still support the
material tool's original comparison mode.

The new browser scenario sends 20 distinct opaque and partially transparent
face images through the actual packer. Every RGBA byte matches the former
large-atlas compositor, including every edge/corner; no large destination
self-read remains. Existing coverage exercises 63 type/material cases,
fallback shaders, cache disposal, symbol faces, hidden-roll reveal and
one-seed/one-film behavior.

All **175 live PNG portraits are byte-identical** before/after at fixed shader
time. The renderer fingerprint is refreshed on that evidence; the existing
source/recipe gate is retained and no baked portrait asset changes.

The [first visible roll](phone-first-roll.png), [four-player result](phone-four-players.png)
and [material comparison](materials.png) were opened and inspected. The phone
captures preserve readable dice/results and available controls; the material
capture retains the blank shroud, numeric, glass, emissive and symbol faces.

```sh
taskset -c 0-15 node tools/drive.mjs tools/steps/play-performance.mjs atlas-before-quick --plain --cpu=4 --runs=3
taskset -c 0-15 node tools/drive.mjs tools/steps/play-performance.mjs atlas-after-quick --plain --cpu=4 --runs=3
node tools/drive.mjs tools/steps/dice-materials.mjs padding-before look
node tools/drive.mjs tools/steps/dice-materials.mjs padding-after look --whole-atlas --compare=tools/out/dice-materials-padding-before/report.json
node tools/drive.mjs tools/steps/dice-portrait-parity.mjs padding-before
node tools/drive.mjs tools/steps/dice-portrait-parity.mjs padding-after --compare=tools/out/dice-portrait-parity-padding-before/report.json
node tests/e2e/run.mjs --only dice-atlas-padding,dice-face-atlas,symbol-faces,pool-set-override,themed-chrome,dice-art-loading,held-roll,one-seed-one-film
npm run -s test:unit
```

All units and all nine selected browser scenarios pass. No production/cloud
action, dependency installation, vendor edit or live-preview access occurred.
