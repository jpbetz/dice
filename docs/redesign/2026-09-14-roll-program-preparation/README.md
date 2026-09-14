<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Prepare accepted roll programs during simulation

Submitting the programs for an accepted roll while its worker simulates the
film reduces the retained mixed-set first-use activity's longest task from
**688 ms to 607 ms median**. Accepted-worker-start to visible dice improves
from **605.5 ms to 514 ms**. This is a bounded improvement under SwiftShader
and phone emulation; the remaining software-rendering stall is substantial.

Code checkpoint: `2de6764`, based on `01b4230` (application bytes matching the
released `90b8bb9`). The measured control and candidate use the same source
and a nonpersisted debug toggle. After timing, the catch gained one safety
change: a preparation failure disables further attempts for that page. The
successful path is unchanged. [measurements.json](measurements.json) retains
both runtime fingerprints, all 24 attempts, raw report/profile/log hashes,
separate queue/accepted timestamps, tasks, counters and sampled hot functions.
No cloud or production action is part of this proof.

## Mechanism and limits

The [earlier atlas change](../2026-09-14-dice-atlas-padding/README.md) removes
large canvas self-copies. The owner's separate
[mixed-set profile](../2026-09-13-dice-textures/README.md) still showed a long
first-use task. Inspection of the vendored renderer located a first-draw
synchronization cost in `getProgramInfoLog`, called through `onFirstUse` and
`getUniforms`. `renderer.compile` can submit the needed programs earlier,
without an explicit readiness wait. Compilation, linking or target allocation
can themselves block; this is measured rather than assumed free.

After the real worker request starts, the app compiles temporary copies of
only the accepted dice, using their actual materials and the actual scene's
lighting. For the canvas-to-post transition, it also prepares the existing
visible scene's linear-target programs, the glow mask and post quads. Later
post rolls copy just the accepted cast. It restores the previous render target
and shared material sides synchronously. Live objects are never exposed or
reparented, and held dice use their existing unmarked materials.

There is no extra playback gate, polling loop, startup compilation or catalogue warmup,
texture upload helper, painter change, vendor change or physics change.
Hidden pages, Instant results and synchronous worker fallback skip this work.
Battery uses the canvas path appropriate to its existing presentation. A
caught failure records the failure and disables future preparation until an
explicit debug re-enable; normal film completion continues.

Stock `compileAsync` was rejected: its uncancellable readiness timer reads
mutable program properties after material disposal or context restoration.
The chosen synchronous call has no such lifetime dependency. It does not
cover every future renderer cost: texture uploads, remaining first-draw work,
shadow/depth variants and the second blur framebuffer can still be cold.

## Measured journeys

Each trial starts a **fresh Chrome process, profile and ephemeral server**;
`--runs=1` gives exactly one navigation. For each workload, the three pairs
run **off/on, on/off, off/on**. All 24 commands exit zero with zero app-ready
retries. Chrome reports ANGLE SwiftShader in every trial. The environment is
390 × 844 touch/mobile emulation, DPR 1, CPU affinity 0–15, 4× main-target CPU
throttling, disabled HTTP cache and no network throttle. The worker is not
throttled equivalently. These are not physical-phone or hardware-GPU results.

| Moment, median of three | Off | On |
| --- | ---: | ---: |
| Mixed 4d20 activity longest task | 688 ms | 607 ms |
| Mixed accepted worker request → first visible dice | 605.5 ms | 514 ms |
| Mixed activity `getProgramInfoLog` sampled self time | 196.2 ms | 98 ms |
| Ordinary first 2d6: pointer event → first visible dice | 418.3 ms | 326.1 ms |
| Ordinary first 2d6: longest task | 236 ms | 140 ms |
| First 1d20: pointer event → first visible dice | 418.8 ms | 393 ms |
| First 1d20: longest task | 230 ms | 172 ms |
| Later standard 4d20: accepted worker request → visible | 51.9 ms | 53.5 ms |

The mixed workload first throws 2d6, receives Bram's 8d6 while the builder is
opened, then receives Cora's 4d20 using standard, Ivory, Sea-glass and Monster
sets. Arrival-to-visible includes time queued behind Bram and is retained
separately; it is **not** used as shader latency. The mixed kick takes
24.3–27.3 ms, copies 17 objects and adds 11 new renderer programs. Its activity
`drawImage` and `texSubImage2D` sampled costs remain roughly unchanged, which
is consistent with moving program work earlier rather than optimizing those
other operations. Program-count deltas are not compilation-readiness proof.

All three mixed pairs improve. The later standard on samples are 53.5, 53.3
and 70.9 ms versus off 51.6, 52.9 and 51.9 ms; that slower third observation
is retained. Startup timing varies and is not claimed as an improvement.
Every trial requests zero startup portraits. No new warmup run preceded a
cold sample, and no additional hardware experiment overlapped the timings.

Separate input trials dispatch a real pointer event for **More** immediately
after the accepted worker request. Event queue delay improves from 530.6 to
451.3 ms median; request-to-CDP-ack improves from 537.9 to 459.6 ms. All six
open the actual sheet. The subsequent observation runs after two animation
callbacks and another CDP evaluation, so it is not a hardware paint timestamp.
Opening the modal also changes scene visibility: these six input trials are
excluded from bare-table first-visible comparisons. The
[input capture](phone-input-response.png) shows the sheet while Cora still
has a face-free Rolling result.

Example commands, each in a separate process with `DICE_E2E_GPU` unset:

```sh
CHROME_BIN=/usr/bin/google-chrome taskset -c 0-15 node tools/drive.mjs tools/steps/play-performance.mjs pair1-off --plain --cpu=4 --runs=1 --incoming-mixed --compile=off
CHROME_BIN=/usr/bin/google-chrome taskset -c 0-15 node tools/drive.mjs tools/steps/play-performance.mjs pair1-on --plain --cpu=4 --runs=1 --incoming-mixed --compile=on
```

Remove `--incoming-mixed` for the ordinary journey; add `--first=1d20` for
first d20. Add `--input-probe` only for the separate input fixture. Full raw
profiles remain under `tools/out/play-performance-compile-*` in the isolated
measurement worktree; hashes are retained here.

## Correctness and visible moments

The new `roll-preparation-modes` scenario proves real worker execution with
no preparation for Instant and a genuinely background tab, actual synchronous
fallback, and full shared film equality against the original inline solver
for a themed first throw, kept-die rethrow and held throw. Authorized reveal
restores matching values. `roll-preparation-recovery` deliberately throws
inside a real transparent DoubleSide material's `onBeforeCompile`, observes
the vendor's temporary BackSide, proves side/target/shared-object restoration,
and reads stable red pixels from two subsequent actual draws. A separate real
app-material failure proves the worker still completes and later rolls stop
retrying the optional compiler.

The existing worker parity/lifecycle/reveal, themed-post, Battery, Instant,
FIFO, fallback and hidden-reveal scenarios also pass: **11/11**, plus the two
new focused scenarios **2/2**. Final `npm test` on `2de6764` exits **0**: 55 unit programs, 1,317,295 fuzz
parses with zero throws, **78/78 smoke**, and all seven account/library/home/People
browser programs pass (2 + 2 + 5 + 1 + 1 + 4 + 13 cases). Exact logs and
command results are retained in [validation.json](validation.json). `npm test` covers unit, fuzz, smoke and
its account/UI tail; it is not the full pre-release sweep. The previously
recorded three legacy visual failures are outside this change and were not
rerun or claimed fixed.

The [first moving roll](phone-first-roll.png),
[mixed four-player result](phone-mixed-result.png),
[held dice](phone-held.png), [authorized reveal](phone-revealed.png) and
[warm post roll](phone-repeat-post.png) were opened and inspected at 390 px.
Dice remain inside the visible surface; held dice have no numerals; the
revealed glass dice retain their numbers and emission, with the complete
27 = 7 + 10 + 7 + 3 result visible. The actual-input captures show readable
result cards and roll controls. The debug-driven revealed/repeat captures
do not show the bottom controls, so they prove the dice/read moment rather
than a complete phone interaction or layout. This is phone emulation, not
physical-device observation.

The separate [look diagnostic](look.json) confirms the second post roll
copies four dice, has no canvas-to-post transition and adds zero new programs.
Its single unthrottled 0.3 ms kick is a lifecycle/counter observation, not a
cold-trial performance estimate.

## Current hardware limitation

A historical September 12 audit successfully verified an RTX 4090 backend.
Fresh capability attempts here did **not** reproduce it. The hardware-requested
[app diagnostic](app-ready-diagnostic.json) timed out before capability reads;
its one automatic boot retry is explicitly retained and is not a performance
sample. A separate [blank Vulkan canvas](capability-vulkan.json) selected
Mesa llvmpipe and failed context creation. The recovered audit launcher's
[blank OpenGL attempt](capability-opengl.json) also failed context creation,
reporting disabled GL and EGL configuration errors in its retained stderr.
Both blank probes closed their owned browsers. Hardware `KHR_parallel_shader_compile`
availability remains unverified, not established as unsupported. No battery
life, physical-device speed or hardware-priority claim follows from this work.
