<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Complete turn events and worker baking

R3 follow-up to [ordinary worker baking](2026-09-13-film-worker.md).
Throws and rethrows now use the real Cannon module worker. The authored
values, physics algorithm, hulls, face correction and public turn procedure
are unchanged. Tower pours and silent settled reconstruction remain inline.

## The failure and the change

On composed base `838f86a`, Alice completed three throws of `6d6 t3` while
Bob was still watching the first. Bob queued only each new roll payload,
losing the rethrow seed and kept indices. He finished with **18 dice**,
duplicate indices, different kept positions and a stale log row.

The playback queue now retains complete roll, rethrow, bank, reveal,
collect, clear and newer-snapshot events. Whole rethrow application waits
for its place in that queue, including history replacement. Per-roll pending
maps could not express a reveal *between* two queued throws; the ordered
queue can. The shared result reader and turn bar continue to hide unfinished
outcomes throughout the queue and the rethrow preparation handoff.

A reveal immediately preceding a rethrow finishes that turn's flip before
kept dice join the next film. Other players' flips continue. Kept dice stay
visible and stationary while the worker prepares the rethrow. Old settled
dice still clear, collect and reveal immediately during another player's
bake; the previously proved collider merge policy remains in force.

A whole-table clear terminates the worker and flushes the latest authored
turn record, including queued updates, without simulating abandoned films.
A delayed reply cannot restore that cast or replace a later roll.

## Reconnection

A snapshot ahead of both the live turn and queued films silently reconstructs
its latest projected values after prior playback. Same-version snapshots do
not recreate dice; older snapshots cannot downgrade a newer current or queued
turn, undo a reveal, or reopen a banked turn. A bank or reveal in a newer
snapshot does not count as proof that its missed film was reconstructed.

The server stores the original seed and latest values, not the full sequence
of rethrow seeds and kept indices. A missed turn therefore uses the same
silent reconstruction as a fresh join. **Authored faces and budget converge;
historical kept poses cannot be reconstructed from the existing snapshot.**
No server film-history storage was added. Redacted snapshots stay shrouded
until a legitimate reveal. A pre-existing hello bug also needed correction:
the log was already full before the reveal checked its old hidden state,
leaving existing dice blank. Actual shrouded dice now trigger that reveal too.

## Measured responsiveness

Same executable measurement step on actual pre-worker `37dad90` and this
branch; owned ephemeral servers, no live preview or deployment. Chromium,
1440×900 desktop and 390×844 touch emulation, DPR 1. Every row reported ANGLE,
NVIDIA RTX 4090, OpenGL ES 3.2. These are seeded samples, not averages or a
physical-phone battery test. CPU×4 throttles the main target; it does not
slow the worker by four, so it is not a whole-device slowdown claim.

| Workload, both viewports | Before scheduled click | Worker scheduled click |
| --- | ---: | ---: |
| First 40d20 turn throw, CPU×1 | 264–292 ms | 4.6–5.3 ms |
| Rethrow 39 of 40d20, CPU×1 | 225–290 ms | 2.0–2.6 ms |
| First 40d20 turn throw, CPU×4 | 1,033–1,147 ms | 17.5–20.9 ms |
| Rethrow 39 of 40d20, CPU×4 | 854–1,154 ms | 7.1–10.8 ms |

Each worker click ran during actual solver work. Warm stress samples recorded
no main task ≥50 ms. The first cold 4d6 render/shader task remains: 196 ms
versus 203 ms on the baseline. Cold first-film readiness was 46 ms versus
15 ms inline. Worker stress readiness was 220–314 ms; this moves work off the
input thread rather than speeding up the solver.

The stress DTOs were 173–178 KB as diagnostic JSON. Transferred Float64 pose
buffers were 363–883 KB for first throws and 491–1,163 KB for the measured
rethrows. No DTO fields or worker modules were added for turns; kept bodies
already belong to the captured cast. These are data sizes, not heap residency.

All **24 complete first/rethrow films** matched `37dad90` exactly: every
keyframe, authored final face, rough byte, sound, landing and nudge. No golden
changed. [Before data](2026-09-13-turns-before.json) and
[worker data](2026-09-13-turns-after.json) retain every fingerprint and sample.
The seeded bench's rethrow retains die 0 and uses a fixed second physics seed;
its values stay unchanged so the comparison isolates simulation behavior.

## Verification and visual evidence

Full unit suite passed. Targeted browser scenarios cover live-world inline
versus worker film parity, all worker lifecycle and collider mutation cases,
queued keeps/seed/history, reveal between throws, bank and collect after
rethrow, whole clear, actual 40d20 worker input responsiveness and cancellation,
same/stale/newer snapshots, held and banked repair, existing turn gestures,
push procedure, result-reader privacy, and resync. The original 19-case
combined run passed, followed by the added snapshot edge cases.

Two old scenario assumptions were corrected: the per-die held-roll test now
explicitly selects Soul Deal, since fresh tables use familiar sums; the Bank
gesture waits for its actual server event instead of assuming a dt-clock
advance also advances network delivery.

The phone pictures use an actual shared `4d6 t3`, not the seeded developer
bench. Die 0 retains its exact position and value after the second throw;
all rendered faces agree with the record. Inspect
[before](2026-09-13-turn-phone-before.png),
[after](2026-09-13-turn-phone-after.png), and
[complete result](2026-09-13-turn-phone-detail.png).
This branch starts from the existing R2 layout; it does not change framing.

Reproduce with `tools/steps/film-turns.mjs` on both checkouts, passing
`after --compare=/path/to/before/report.json` on the second. The
`tools/steps/film-turn-read.mjs` step captures the real phone turn.
`node tests/e2e/run.mjs --only film-worker,film-turns` runs the new worker
and turn cases. Use a verified GPU Chrome wrapper for measured comparisons.
