<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Table-size changes follow the roll stream

An Instant viewer finished a shared `4d20` while another viewer still watched its
first film. The room then changed from wide to close and authored `40d20`. The
ordinary viewer queued that next roll, but its pending size applied only after
the entire queue drained. Both viewers eventually reported width 21.5 and the
same values while having baked different films. Checking only final settings
or sums hid the error.

Size changes now occupy their own position between authored roll events. A
viewer finishes the preceding film/reveal, applies the size, then prepares the
following film. Adjacent size choices can coalesce if no event separates them;
intermediate choices between throws remain distinct. Clearing the whole table
retains the latest pending size. A change back to the currently displayed size
also supersedes a pending choice. No authored value, seed, solver, randomness
or personal presentation preference changes.

The actual two-viewer reproducer is `tools/steps/roll-settings-order.mjs`.
On unchanged efb85ab, the same next roll produced hashes
`5fad8cfd5824674190411e24fc93ceb5cba68fe0397039769ac36dc245d5b250`
and `a79992130ba64fe35fe304bd7e90d51b44d0f0cffac093426e576ca077169c96`.
After correction, a fresh actual shared sample matched across both viewers.
The automated cases compare complete keyframes, sounds, roughness, landing and
nudge records, values and final transforms. They include two size changes
between kept-die rethrows, a following stress roll, a held reveal and a clear.

All six new/existing size-order/ceremony/clear/reveal cases pass. The three old
deferral fixtures now count queued films separately from the ordered size
change; they still prove no second film holds the change back, actual physics
walls stay put during the named beat, and release at its end. The assertion
about why a change waits is preserved while the implementation gains an event.

This is a size-order correction. Tower setting/load ordering is a related
follow-up, and historical reconstruction at changed room settings is not proven
by these live-stream cases. The separate round-table collision correction
remains independently measured work.

The combined worker/turn/Instant regression passes 21/21. The actual shared
reproducer also completes with equal full-film hashes and no browser errors.
[Paired result](2026-09-13-roll-settings-order.json) and the inspected
[phone result](2026-09-13-roll-settings-phone.png) retain the evidence; the
reproducer also records a desktop result for review.
