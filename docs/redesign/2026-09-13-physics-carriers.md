<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Physics test carrier characterization — 2026-09-13

The two red checks need measured test fixtures. No solver, audio machine,
worker, nudge budget, or threshold changes are needed for their stated claims.
This increment updates `pile-refusal` and `audio-phases` and preserves the
counterexamples below. It does not claim that all piles are resolved or that
all throws satisfy the chosen audio carrier's velocity bounds.

Compared integration `ca9d693` with pristine pre-redesign runtime `1915bd7`,
using identical instrumentation, ephemeral servers, and the normal browser
harness. No port 8123, dependency changes, or hardware performance claims.
The NVIDIA override previously failed WebGL initialization; it was not used
for this characterization. Both revisions completed the probes without page
exceptions. The visual captures are desktop 1500×950.

## Pile refusal: a previously flat throw now stacks

The round portalless boundary intentionally changes the film. At close
(21.5×21.5), unstamped `6d6`, seed `103947` has these recorded landings:

| Revision / pile bar | Highest center Y | Frames / duration | Nudge rounds | Final piled | Timed out |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before / 0 | 0.939132 | 72 / 1.183s | 0 | 0 | 0 |
| Before / 1.05 | 0.939132 | 72 / 1.183s | 0 | 0 | 0 |
| Current / 0 | 2.022141 | 123 / 2.033s | 0 | 0* | 0 |
| Current / 1.05 | 2.021907 | 281 / 4.667s | 3 | 1 | 0 |

*The disabled predicate reports zero `piled`; physical height and the picture
show the stack independently. At the shipped bar, three nudges are attempted
and the finite budget releases the throw with one pile still present. The
same stack is visible before and after those nudges. This is a limitation of
the existing bounded mechanism, not evidence that it resolves every pile.*

Inspected [before](2026-09-13-physics-carriers/before-pile-off.png),
[current with bar off](2026-09-13-physics-carriers/current-pile-off.png), and
[current at the shipped bar](2026-09-13-physics-carriers/current-pile-shipped.png).
These use the diagnostic unstamped throw; they characterize the physical
stack and do not stand in for a multiplayer seat or camera-layout check.

The scenario's flat-throw claim remains valid on `16838` and `24757`.
Both highest centers are 0.674824 or less; at bar 0 and 1.05 each seed has
identical keyframes, sounds, roughness track, landings, nudges, and values.
The deliberately impossible bar 0.5 triggers three nudge rounds on each,
finishes in 1.733s / 1.883s, and never reaches the timeout. The test now
hashes all these recorded channels plus frame counts and last landing,
strengthening its former duration/frame-count comparison. It explicitly
waits for close geometry before the first throw. No refusal, timeout, or
finite-budget threshold is relaxed.

## Audio phases: the original carrier was already red

The exact original sequence (Soul `4242`, one playback frame, clear, then
`8d6/64352`, one frame) starts at **wide** in a fresh joined room on both
revisions. The scenario did not declare a zoom. The following are measured
from the complete film, independent of playback timing:

| Wide 8d6/64352 | Before | Current | Existing requirement |
| --- | ---: | ---: | --- |
| Worst post-settle angular speed | 0.560758 | 1.209720 | Some die >0.9; every die <1.5 rad/s |
| Worst post-settle drift | 0.447014 | 1.023101 | Every die <1 u/s |
| Worst speed anywhere | 55.881878 | 56.297671 | Every die <60 u/s |

Before fails the load-bearing tail requirement; current fails the drift
requirement. The unchanged original test also fails when run alone on
`1915bd7`, so earlier scenarios or inherited local storage are not required
for this failure. A preliminary suspicion about local-storage carryover was
not supported by the exact reproduction. The saved audio-grid row named
`inherited-close` is a deliberately requested close probe, not evidence of
inheritance; the driver now calls this row `explicit-close`.

A controlled medium (27.5×27.5) grid used seeds `1000 + i×7919`, i=0…23,
plus the old carrier. Three current cells clear the angular exit threshold:
32676, 48514, and 175218. The selected **8d6/175218** gives the largest angular
margin of these while satisfying every other existing bound:

| Selected medium film | Measured | Existing requirement |
| --- | ---: | --- |
| Worst post-settle angular speed | 1.205795 rad/s | >0.9 and <1.5 |
| Worst post-settle drift | 0.842750 u/s | <1 |
| Worst speed anywhere | 53.385887 u/s | <60 |
| Dice with post-settle film | 7 | >0 |
| Premature / missing / reversed settled phase counts | 0 / 0 / 0 | All zero |
| Soul 4242 longest rolling run | 17 frames | ≥10 |

The replacement also passes the original phase checks on the pre-redesign
core (post-settle angular speed 1.009276, drift 0.847237). The current test
sets and awaits medium explicitly. It retains the same phase predicates,
all thresholds, the independent hidden-tower checks, and the original Soul
pool and seed. These bounds describe a selected carrier, not universal
physics: larger pools can exceed 60 u/s and other films drift above 1 u/s.

## Why this is not a worker arrival fix

`throwSeeded` opts into the original inline solver unless a probe explicitly
calls `useFilmWorker(true)`. Both old failing scenarios use that inline path.
The correction therefore does not add waits in place of an actual physics
claim. The geometry wait only establishes the explicitly measured table size.
The separate `film-worker-parity` regression compares the original solver to
snapshot reconstruction and the actual module worker, including every double,
contact sound, roughness byte, landing and authored face, and passes unchanged.

## Reproduction and verification

Run the retained driver in either checkout; only the driver needs copying
onto `1915bd7` (its runtime remains pristine):

```sh
node tools/drive.mjs tools/steps/physics-carriers.mjs original
node tools/drive.mjs tools/steps/physics-carriers.mjs audio
node tools/drive.mjs tools/steps/physics-carriers.mjs proof
node tests/e2e/run.mjs --only pile-refusal,audio-phases,film-worker-parity
```

The `all` mode adds the four-seed pile grid. Retained
[before data](2026-09-13-physics-carriers/before.json) and
[current data](2026-09-13-physics-carriers/current.json) include every sampled
profile, per-die audio scan, geometry, selected film-channel hash, and page
error list. Hashes cover keyframes, sounds, roughness, landings, nudges and
values; revision-to-revision hashes are expected to change with geometry.

Validation: corrected pile/audio plus unchanged worker parity **3/3 pass**;
corrected audio also passes alone. Original baseline pile passes, original
baseline audio fails both alone and after pile. Syntax checks pass. This is
only fixture/tooling/documentation work, so no application unit rerun or
full release sweep was added. No release gate is removed or marked optional.
