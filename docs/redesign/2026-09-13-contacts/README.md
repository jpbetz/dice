<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Contact recording: distinguish pending from silent

Base `e6ca9bf`, isolated worktree, 2026-09-13. The inherited assumption was that
`currentRoll.sounds` exists only after synchronous simulation. Normal rolls now
reserve `currentRoll` with `baking: true` and `sounds: []` while the module worker
runs. The contact fixture treated that reservation as a finished zero-contact
film, then simulated and cleared the table, canceling the actual bake.

The unmodified focused scenario reproduced the release failure: `20d6` totals
**0/0/206**, with only **1/3** throws recording contacts after 0.5 seconds. This
was not evidence that the finished films had gone silent.

## Correction and counterexample

`contactStats()` now returns `null` while baking. A **completed zero-contact
film still returns zero counts**, so the existing starvation assertions retain
their power. The scenario checks that each throw completes its own film and
that its sampling never cancels one. No contact count, time, floor-height or
majority threshold changed. No solver, sound carrier, impact drain or audio
behavior changed.

The new `film-worker-contact-readiness` scenario holds delivery of a real
module worker reply. It does not replace the solver or change its input. The
held reservation reports pending; delivering the same reply exposes its actual
contact recording. It also compares all keyframes and sound bytes with an
inline bake of the identical snapshot. Replacing only the completed recording
with an empty array verifies that zero counts remain observable, then restores
the original recording before playback.

Removing the one-line pending guard makes this new scenario fail at
`pending is not a completed silent film`: actual all-zero counts, expected
`null`. The guard was restored. The only other consumer, the existing
`tools/steps/spawn-clear.mjs` probe, waits for `!busy` before its census and is
unaffected by the pending sentinel.

## Measured run

`node tests/e2e/run.mjs --only contacts-reach-the-felt,film-worker-contact-readiness`
passed **2/2**, and the evidence capture repeated both successfully. No broad
suite or benchmark was run alongside the release sweep. The existing contact
scenario remains an unseeded three-throw sample; exact totals are observations,
not new golden values.

| Throw | Total contacts | Contacts after 0.5 s | Felt contacts |
| --- | --- | --- | --- |
| Held worker `20d6` | 188 | 88 | 89 |
| Existing `20d6`, three throws | 202 / 196 / 199 | 93 / 97 / 90 | 83 / 76 / 84 |
| Existing `40d6`, three throws | 400 / 400 / 400 | 179 / 158 / 218 | 147 / 153 / 168 |
| Existing canonical trio, three throws | 22 / 12 / 28 | 5 / 5 / 4 | 12 / 10 / 20 |

The held-worker throw's actual playback drained **100/188** events at 0.5 s and
**188/188** by rest. Both [the tumble](20d6-contact-playback.png) and
[the rest](20d6-contact-rest.png) were inspected: the dice visibly reach the
surface and remain readable. [Measurements](measurements.json) retain the
pending/completed distinction, exact worker/inline comparison, empty-recording
control, drain counts and nine contact samples. This is the existing audible
film's event-source proof; it does not claim a new physical-speaker listening
test or an audio-device latency measurement.
