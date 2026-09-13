<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Round-table collision profile

The round table increased stress bake cost. The initial assumption was that
16 infinite planes caused most of that increase. An isolated replay profile
shows that die-to-die collision work dominates the sampled 40d20 films.

The input capture runs the actual app at `4d9518c`: all three sizes, 4d6 seed
42, 40d20 seeds 90090/32676 and 40d4 seed 90090. It saves the complete worker
DTO, including non-finite values, then replays each through the unchanged
first-party bake in Node v24.14.1. Each case alternates baseline/experiment
twice. Cannon's profiling and separate timed method wrappers identify work;
these instrumented local samples are not browser latency or battery numbers.

The experiment conservatively excludes a single static plane only when the
other body's entire bounding sphere lies in front of it. It retains pair
order and falls back to the existing broadphase for other shapes. All twelve
complete films match their respective baseline, including poses, sounds and
landing metadata. The candidate remains in the probe, outside app runtime.

| Warm sampled case | Baseline plane calls / time | Candidate plane calls / time | Baseline die-to-die calls / time |
| --- | ---: | ---: | ---: |
| Wide 4d6 / 42 | 5,264 / 0.9 ms | 215 / 0.1 ms | 100 / 0.4 ms |
| Wide 40d20 / 90090 | 105,532 / 14.2 ms | 4,285 / 1.6 ms | 7,421 / 398.7 ms |
| Wide 40d20 / 32676 | 87,380 / 11.7 ms | 3,503 / 1.5 ms | 5,026 / 295.3 ms |
| Close 40d20 / 32676 | 94,356 / 12.7 ms | 3,974 / 1.8 ms | 8,305 / 475.9 ms |

The candidate removes much redundant plane work but does not account for the
large stress increase. Across the samples, warm total times vary enough that
some candidate cases are slower; no consistent browser improvement is proven.
The new round packing and longer films also matter. Keep the existing runtime
until a change is justified by repeated actual-browser measurements. Further
optimization should investigate die-to-die narrowphase work while preserving
the accepted shared films and geometry.

A second probe uses Cannon's existing bounding-box broadphase option. Its very
first wide 4d6 film changes, so it is rejected at the exact-film check. No
runtime collision option, geometry, dependency or vendor code changed here.

[Recorded method profiles](2026-09-13-round-collision-profile.json) retain the
four repetitions per input. Reproduce from this checkout:

```sh
node tools/drive.mjs tools/steps/plane-inputs.mjs
node tools/plane-profile.mjs tools/out/plane-inputs/inputs.json tools/out/plane-inputs/profile.json
```

The optional fourth argument `boxes` reproduces the rejected variant and
returns nonzero if its complete film differs. The input and timing probes use
ephemeral servers and owned browsers; neither needs the live preview port.
