<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# R3: two draws for ordinary dice

The factory now packs the existing 256 × 256 face paintings into an atlas
for each requested channel: color, normal, emissive and roughness. Face
triangles form one real draw group and the bevel forms the second. Original
UVs remain intact; Three's second UV channel addresses the atlases. Positions,
normals, face values, and the canonical physics hull do not change.

Standard, shroud, symbols, glass/fresnel, and compatible custom recipes use
this path. UV-dependent flow/dissolve recipes retain per-face materials.
An experimental atlas for Black Anvil's procedural flow lost the d6's faces
on the first render, although a second render recovered and channel/geometry
hashes passed. One-shot portraits made that unacceptable. The final change
preserves that shader path completely. Transparent/transmissive or
incompatible texture cases also retain separate materials.

## Exact cost change

Measured through the actual renderer, a standard d6 drops from **7 to 2**
draws and a d20 from **21 to 2**. This changes the groups themselves, not just
the number of material instances assigned to unchanged groups.

Across the seven cached standard types:

| Resource | Before | After | Change |
| --- | ---: | ---: | ---: |
| Texture objects | 70 | 7 | −63 |
| Base RGBA texture bytes | 18,350,080 | 18,928,000 | +577,920 (+3.15%) |
| Geometry attribute bytes | 161,280 | 201,600 | +40,320 |

Texture bytes count the image pixels before mipmaps and driver overhead;
they are not a GPU-memory measurement. Replicated two-pixel gutters account
for the increase. Geometry gains the atlas UV attribute; triangle counts
stay identical. A single standard d20 grows from 5,242,880 to 5,408,000 base
texture bytes and from 36,480 to 45,600 geometry bytes. Copies of a die still
share the cached geometry/materials; eviction disposes each resource once.

## Visible play samples

Baseline `8e44250` and the atlas implementation ran on Node v24.14.1 and
headless Chromium with a **verified RTX 4090/OpenGL ES 3.2** backend. Desktop
was 1440 × 900, phone emulation 390 × 844 with compact controls; both DPR 1,
standard dice, plain numeric interpretation, no tower. These are emulated
phone layouts on a desktop GPU, not physical-phone performance.

| Authored roll | Before calls/frame | After calls/frame |
| --- | ---: | ---: |
| Desktop 4d6 | 58 | 18 |
| Desktop 40d20 | 1,682 | 160 |
| Phone layout 4d6 | 51 | 16 |
| Phone layout 40d20 | 1,136 | 118 |

Shared rolls receive fresh server seeds. These samples have different
trajectories and culling, so the per-die counts above are the exact controlled
comparison. During 2.2 seconds after Roll, median frame intervals remained
16.7 ms in every sample and p95 stayed 16.7–16.8 ms. No faster frame rate is
demonstrated on this powerful GPU. Stress long tasks ranged 163–294 ms across
the samples; atlas packing does not solve synchronous simulation/setup.

The phone stress frame still clips dice, before and after; three of four dice
were within the camera projection in the final ordinary phone samples.
Those framing problems remain R2 work. The old `throwSeeded` look helper also
omits the authored placement stamp and can leave dice offscreen. Its timings
and scene counts were discarded as player-view evidence; the probe retains
it only to compare identical seeded film hashes.

Reviewed [before](2026-09-13-dice-materials-before.png) and
[after](2026-09-13-dice-materials-after.png) material sheets show standard,
shroud, Sea-glass, Black Anvil fallback, Monster and Fate, with d6/d12/d20
across each row. A separate [ordinary phone capture](2026-09-13-dice-materials-phone.png)
shows the shared rendered dice and result.

## Reproduction and validation

```sh
node tools/drive.mjs tools/steps/dice-materials.mjs before
node tools/drive.mjs tools/steps/dice-materials.mjs after --compare=/path/to/before/report.json
```

Run the first command against the baseline checkout with the same step file.
Reports and captures go under `tools/out/dice-materials-<label>/`. Set
`CHROME_BIN` to a wrapper adding `--enable-gpu` to select hardware rendering;
the report names the actual backend and refuses zero rendered calls. The
harness's Vulkan opt-in failed context creation on this host and was excluded.
All servers use owned ephemeral ports; 8123 is untouched.

The comparison verified exact render positions/normals, original UVs,
canonical hull/value data, every face's pixels in each texture channel, and
four seeded film hashes across 16 representative type/recipe combinations.
The standing `dice-face-atlas` scenario renders all seven types across nine
standard, shroud, glass, symbol, custom-map and fallback cases. It checks
first-render coverage, every face oriented toward the camera, measured draw
counts, shared resources, and exact-once disposal/rebuild.

Full unit tests pass. Ten targeted browser scenarios pass: `dice-face-atlas`,
`dice-land-flat`, `held-roll`, `resync-shrouded`, `themed-dice`, `themed-fx`,
`themed-post`, `perf-determinism`, `symbol-faces`, and `dev-set-roundtrip`.
No full browser sweep or deployment was performed for this slice.
