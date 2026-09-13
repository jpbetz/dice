<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Round table physics evidence

2026-09-13. Mechanism: `7ed479e` (integrated as `e67da2c`). This follows the
[table composition work](TABLE-COMPOSITIONS.md). Camera framing remains a
separate open task; physical support alone does not establish a readable view.

## Decision

The inherited four infinite walls enclosed a square although every portalless
playing surface is round. At stress counts, dice reached square corners beyond
the actual artwork. All portalless tables now share a 16-plane inscribed
polygon, independent of selected venue or asset readiness. Its circumradius is
`TABLE_W / 2`; the plane distance is `radius * cos(π / 16)`. The existing four
walls remain allocated and masked off. A tower switches the masks to preserve
its original doorway, apron and back wall; tower lab also retains that model.
Zoom and tower transitions update the same fixed body IDs and dirty SAP bounds.

The complete tangent spawn line is fitted into the polygon's inner circle,
allowing the largest thrown hull, existing ±0.6 jitter and 0.05 clearance.
Short legal lines keep their midpoint and spread. A line whose midpoint was
tuned beyond usable space moves inward before fitting. The fit consumes no
random draws, including the different historic jitter/height assignment order
on unstamped side 2/3 throws. Kept dice do not enlarge the new throw's hull.

This deliberately changes collision paths and some settled poses. The
`place-seeds-unchanged` pose golden is re-recorded for the accepted round
geometry, with its original seeds and authored faces. The promise is shared,
honest values and one film for viewers, not preservation of the former square.
No server roll mechanics, redaction path, venue model, draw material or camera
are changed by this mechanism.

## Physical and shared-film proofs

- `tests/round-table.test.mjs`, in the normal unit lane, checks **782,784**
  full hull/jitter clearances: all 1–8-seat configurations, both arcs, all
  sizes, actual dice.yaml scale/back plus extreme tuning, mixed hulls and
  unstamped fallback lines. It also establishes the polygon's radius.
- `spawn-inside-walls` now reads actual active plane positions, quaternions
  and masks from the worker input, transforms each complete mixed die hull,
  and checks all eight real seats at all three sizes: **24 casts / 960 dice**.
  For every active plane it translates a real hull 0.25 units through that
  plane and requires negative signed clearance. This replaces the obsolete
  fixed-right-head/rectangular `axis:'width'` test; that control no longer
  changes the active boundary and was not evidence for a round table.
- `round-table-spawn-budget` pins all four unstamped side draw orders and
  stamped tosses, per-die input heights and the final PRNG state.
- `round-table-viewers` compares complete first/rethrow films at all sizes
  across two independent viewers: actual worker versus inline fallback and
  a ready Copper model versus a failed model download. Keyframes, sounds,
  landing metadata, frame counts, values and final poses agree; kept dice
  stay at their original positions.
- `round-table-state` proves zoom roundtrips, a real Wickroot delivery and
  teardown return to exactly the same film, collider IDs and body count.
- `round-table-footprints` measures **45 casts / 1,476 dice**: Copper,
  Navigation and Stone at wide, medium and close; 4d20 seed 4, 40d20 seeds
  90090/32676 and 40d4 at the same stress seeds. It ray-tests every corrected
  hull vertex plus a 0.25-unit grid across each projected footprint against
  the actual GLB. All samples have usable surface support and avoid raised
  landmarks. Complete films are also identical across all three designs.

The corrected d4 orientation can extend about 0.23 world units beyond the
nominal radius while remaining supported by the actual model. Nominal radius
is a diagnostic, not an acceptance target. No extra inward margin or art
scaling was introduced to satisfy that proxy.

## Observed browser views

`node tools/drive.mjs tools/steps/round-table-look.mjs` captures actual
server-authored four-player rolls at 1440×900 and 390×844. The measured run
is under `tools/out/round-table-look/`, including its JSON report and eight
PNGs. The ordinary Copper medium 4d20, Copper medium 40d20, Navigation wide
40d20 and Stone close 40d4 pictures were opened and inspected. The recorded
server seeds were 4286105394, 2823258449, 3079731984 and 1999492911 respectively.
Their 7,395 footprint samples all had support and no raised landmark overlap.

The ordinary desktop and sampled phone rolls keep the dice visible on the
surface. **Desktop stress views crop frontmost dice at the viewport edge.**
That is an observed camera defect and the next bounded task. These pictures
inspect the settled surface after dismissing the result banner; they do not
claim that a player's Roll-button/panel journey has been validated. The next
camera proof must use real pointer/keyboard input and measure all projected
dice bounds through the film, including the phone tray and all three sizes.

## Measured cost

The same `tools/steps/film-worker.mjs` fixture ran against pristine application
baseline `639effb` and this mechanism; only the fixture's render/body reporting
line was added to the baseline checkout. Reports are
`/tmp/dice-round-baseline/tools/out/film-worker-round-before/report.json` and
`tools/out/film-worker-round-after/report.json`. These are individual local
samples using **ANGLE SwiftShader software Vulkan**, not hardware-GPU or
representative-player benchmarks. Desktop is 1440×900, phone 390×844. CPU
throttling applies to the page, not a claim of equally throttled worker time.

All times below are milliseconds, baseline → round. “Return” is synchronous
input scheduling; “feedback” is the first scheduled UI callback; “bake” is the
worker's recorded simulation time.

| View / CPU | Roll / seed | Return | Feedback | Bake |
| --- | --- | ---: | ---: | ---: |
| desktop / 1× | 4d6 / 42 | 6.2 → 6.5 | 66.3 → 6.8 | 11.6 → 23.1 |
| desktop / 1× | 40d20 / 90090 | 5.6 → 9.3 | 61.0 → 9.6 | 296.3 → 539.4 |
| desktop / 1× | 40d20 / 32676 | 6.8 → 7.9 | 6.9 → 8.0 | 317.5 → 409.5 |
| desktop / 4× | 4d6 / 42 | 15.8 → 27.8 | 16.4 → 92.3 | 2.4 → 3.4 |
| desktop / 4× | 40d20 / 90090 | 19.2 → 24.6 | 20.1 → 24.7 | 264.3 → 544.3 |
| desktop / 4× | 40d20 / 32676 | 22.1 → 20.8 | 22.7 → 21.9 | 295.3 → 354.4 |
| phone / 1× | 4d6 / 42 | 4.0 → 4.6 | 4.2 → 4.8 | 2.1 → 3.1 |
| phone / 1× | 40d20 / 90090 | 4.9 → 5.1 | 5.1 → 5.3 | 266.5 → 474.1 |
| phone / 1× | 40d20 / 32676 | 8.4 → 5.3 | 8.6 → 5.4 | 298.9 → 354.4 |
| phone / 4× | 4d6 / 42 | 17.3 → 17.3 | 33.0 → 18.4 | 2.0 → 2.9 |
| phone / 4× | 40d20 / 90090 | 19.1 → 21.8 | 20.0 → 22.5 | 260.9 → 478.5 |
| phone / 4× | 40d20 / 32676 | 24.1 → 20.8 | 24.5 → 21.0 | 290.7 → 359.6 |

All twelve feedback callbacks ran while the bake was pending. The stress
bake is more expensive: seed 90090 costs roughly another 210–280 ms in these
samples, and seed 32676 roughly another 55–95 ms. Contact density, paths and
film lengths changed: the two stress recordings changed from 162/394 to
319/193 frames. The fixed planes and resulting contact work warrant a later
measured optimization; the change is not described as cost-neutral.

The DTO has exactly **16 more bodies**: 10→26 for 4d6 and 46→62 for 40d20.
Serialized input grows by approximately 46–53 KB (about 173–178→223–231 KB
for stress). Fixed bodies and collision-state matrices account for bounded
snapshot overhead; repeated casts and geometry roundtrips add no bodies.
There are no added render objects. The ordinary frame remains 18 draw calls /
5,856 triangles, and stress frames remain 158–162 calls / 34,248–35,008
triangles depending on the sampled pose/frame. This does not promise the
same per-frame raster cost, since trajectories and camera-dependent culling
can change.

## Validation and limits

Full unit lane and fuzz pass. Focused proofs cover round geometry, the
intentional pose golden, worker parity/live mutations/old reveals, turn FIFO,
physics determinism and tower delivery. The default smoke lane reports **70/71 passing**; its sole failure is the
old Help terminology check against unchanged baseline `index.html`. The
integration branch already fixes those two words in `af2c654`; this physics
worktree leaves the owner's UI file untouched. Commands:

```sh
npm run -s test:unit
npm run -s test:fuzz
node tests/e2e/run.mjs --only round-table,film-worker-parity,film-turn-fifo,perf-determinism,tower-roll
node tests/e2e/run.mjs --only spawn-inside-walls,film-worker-live-mutations,film-worker-old-reveal
node tests/e2e/run.mjs --only place-seeds-unchanged
node tests/e2e/run.mjs
```

The original broad focused run found the obsolete rectangular spawn scenario;
its replacement and the two live-worker mutation checks subsequently passed
3/3. The other eight selected proofs passed, including actual model support;
the intentionally re-recorded pose golden passed separately.

General room geometry-setting ordering was separately reproduced before this
change and is owned by the ordered-geometry work. Round physics itself does
not add per-roll settings or depend on asynchronous model state. Exhaustive
seed coverage, camera closure and round-wall bake optimization are not claimed
by the sampled support proof.
