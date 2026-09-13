<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Felt gloss: unchanged failure, measured against the baseline

The `felt-gloss` near-band ceiling of 8.0 sRGB code values fails at **8.411**
on both pristine pre-redesign `1915bd7` and current `2b09384`, including the new
camera. The same controlled probe also matches at all three sizes. This is
pre-existing visual/measurement debt; it is not a regression from the redesign
or its camera correction. Neither the material nor the threshold is changed.

| View, empty obsidian felt | Baseline near delta | Current near delta |
| --- | ---: | ---: |
| Fresh default, 464×493 scene | 8.411 | 8.411 |
| 1600×900 window, wide | 8.234 | 8.234 |
| 1600×900 window, medium | 9.983 | 9.983 |
| 1600×900 window, close | 10.925 | 10.925 |

All near/mid/far gloss and mottle measurements match, not just this selected
column. Every null-control difference is exactly zero. The roughness texture
digest is `423040718` in both builds, with min/max/mean 0.8/1/0.902022 and
spread 0.2. The eye, target, viewport, world-unit span, lamp and fog also match.
The camera mode's diagnostic name changes from `mat` to `table`; the actual
empty-table view does not. Material sampler settings match; randomly allocated
texture UUIDs are not content differences. The full paired outputs are in
[measurements.json](measurements.json).

The historical record explains why the old prose cannot calibrate this view.
`0abfcee` introduced felt mid/swing 0.94/0.06 and described about 2.8 code
values at its then-current medium view. Owner-approved bold setting `3e667d9`
changed those to 0.91/0.11 and reported 5.9, explicitly keeping an 8-code ceiling.
That commit's original camera default was `[0,10.4,6]` aimed at `[0,0,0.5]`.
Today's medium empty placed table uses `[0,26,15]` and target `[0,0,6.9]`.
`floorLook` samples normalized screen bands, so its world positions and
view-dependent specular response are not held fixed across that historical
camera change. The baseline comparison proves the failure predates this work;
it does not identify the first intervening historical commit that crossed 8.

I inspected the current [fresh without](after-fresh-without.png) /
[fresh with](after-fresh-with.png) and [medium without](after-medium-without.png) /
[medium with](after-medium-with.png) pairs. The field changes the broad sheen
across the lower and middle felt. Baseline pairs are retained beside them for
review: [fresh without](before-fresh-without.png) /
[with](before-fresh-with.png), [medium without](before-medium-without.png) /
[with](before-medium-with.png). These are actual rendered captures after an
explicit debug render; changing the override alone on an idle table can leave
the old canvas painted and produce an invalid screenshot pair.

Reproduction: copy `tools/steps/felt-gloss-cause.mjs` into each isolated checkout
and run `node tools/drive.mjs tools/steps/felt-gloss-cause.mjs before` or `after`.
The probe uses a fresh ephemeral local table, restores every temporary floor
override and requires no cloud access. Both four-view runs completed and the
paired JSON equality checks above passed.

The next decision should be made against the intended current appearance:
calibrate an explicit view and sample region, then choose whether the inherited
sheen is too strong. Reducing gloss or adopting a revised visual bound should
come with that comparison. Merely changing 8.0 to 8.5 would neither explain
the higher medium/close samples nor preserve the original claim that gloss
must remain subordinate to the surface. This investigation leaves the release
failure visible rather than silently relaxing it.
