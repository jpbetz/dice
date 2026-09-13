<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# R3: render the table when its picture changes

The inherited assumption was that a live shared table needs a permanent
animation loop. Its connection and audio can remain live while its settled
picture does no GPU work. This slice replaces that loop with one coalesced
pending frame and explicit wakeups, without changing simulation or results.

## Measured result

Baseline is `0952007`, with only the existing renderer's cumulative frame
counter exposed. Both runs use the same GPU-enabled Chrome wrapper, verified
as ANGLE / NVIDIA RTX 4090 / OpenGL ES 3.2. Desktop is 1440×900; phone is
390×844 with mobile/coarse-pointer emulation, both at DPR 1. Each sample
allows 1.5 seconds for camera easing before counting actual renderer frames
for 1.5 seconds. These are desktop GPU measurements, not physical-phone or
battery measurements.

| Settled scene, on both layouts | Before: frames / 1.5 s | After: frames / 1.5 s | Draw calls in one rendered frame |
| --- | ---: | ---: | ---: |
| Empty Table | 90 | 0 | 2 |
| Table, 4d6 | 90 | 0 | 18 |
| Table, next 1d20 | 90 | 0 | 6 |
| Copper Lantern, 1d20 | 90 | 0 | 11 |
| Navigation Table, 1d20 | 90 | 0 | 12 |
| Stone Circle, 1d20 | 90 | 0 | 10 |

Each after sample has no pending animation frame. The 4d6 table previously
issued 1,080 draw calls each idle second; it now issues zero. One rendered
picture still has the same geometry, materials, shadows and draw count.
The next throw is checked to increase the actual renderer counter before
its next idle sample. [Before](2026-09-13-idle-before.json) and
[after](2026-09-13-idle-after.json) preserve all counters and backend strings.

A forced `document.hidden` signal also produces zero frames, including a
40d20 worker reply followed by a held reveal. Returning visible paints the
completed work with the same revealed values and no queued events. This
fixture deliberately leaves headless Chrome capable of issuing rAF, so it
proves the application's cancellation instead of merely observing Chrome's
own background throttling. It is not a background power measurement.

## What still animates and what wakes

Playback, ceremonies, reveal flips, departing dice, camera easing/drag return,
breath, live particles/decals, animated dice lights, rest cadences, procedural
flow/pulse, shimmer, tower embers and the experimental animated venues retain
their real animation. The unfolded developer HUD remains live. Ordinary dice
and the three baked table designs sleep after their last visible transition.
Holding the test clock sleeps; releasing it wakes without accumulated idle
time being injected into playback.

UI input, resize, tuning changes, room/SSE events, worker completion, clears,
collects, reveals and reskins invalidate the main picture. Async felt images,
Three loader completion, tower models/skins, table model completion and
context restoration do too. The table design registry's existing change
callback includes all three models. Local practice and table previews retain
their independent on-demand renderers, verified by their existing scenarios.

Room sound has a separate visible-only 200 ms lookahead timer. Its existing
half-second audio horizon and event cursors are shared with active frames,
so the idle timer does not duplicate events. Mute/disposal/hidden state stop
the timer; AudioContext resume restarts it. A trusted gesture test proves a
running context and real crackle scheduling while the renderer stays at
zero frames for at least 1.8 seconds. This deliberately revises the old
`stepAmbience` comment forbidding timer-driven scheduling: the timer fills
the same Web Audio lookahead, while the hidden-tab policy suspends audio.
Sound no longer requires drawing an unchanged table.

## Verification and scope

The full unit suite passes, including scheduler coalescing, idle wall-time
reset, hidden cancellation/resume and invalidation during a draw. Twenty-three
targeted browser scenarios pass, covering idle wake, real-time rethrow playback, camera drag,
hidden worker/reveal recovery, intercepted asynchronous model completion,
animated materials, sound, worker parity/lifecycle/FIFO/resync, local practice,
model failures/cancellation, declare breath, rest cadence and developer dials.
The old-collider mutation fixtures now hold delivery of the real worker reply
until the other player’s SSE event lands. Their previous incidental race
against cross-tab CDP/network latency could pass or fail in isolation. The
barrier preserves the actual solver result, transfer and merge, and the next
inline-film comparison; active-solver responsiveness is measured separately.

All 24 original first/rethrow film hashes match `37dad90`: keyframes, authored
faces, final poses, rough bytes, sounds, landings and nudges. The unchanged
seeded benchmark covers 4d6 and two 40d20 seeds, first and kept-die rethrow,
desktop/phone and CPU×1/×4. [Film data](2026-09-13-idle-films.json) records this
run; the comparison source is [the original inline solver data](2026-09-13-turns-before.json).
Cold first rendering still recorded a 187 ms shader/render task in this run.
This slice does not speed up the solver, alter film values or claim better
active frame rate, measured battery life or lower memory use.

Inspected captures show the settled table and the next roll on loaded artwork:
[desktop Table](2026-09-13-idle-desktop-settled.png),
[desktop Navigation](2026-09-13-idle-desktop-navigation.png),
[phone Copper](2026-09-13-idle-phone-copper.png), and
[phone Stone](2026-09-13-idle-phone-stone.png). Dice and their upright results
remain readable; phone controls retain the full-width table and bottom tray.

Reproduce with the repository's ephemeral-port stage:

```sh
node tools/drive.mjs tools/steps/idle-render.mjs after
node tools/drive.mjs tools/steps/film-turns.mjs idle --compare=docs/redesign/2026-09-13-turns-before.json
node tests/e2e/run.mjs --only idle-render,film-worker,dice-practice,table-designs,table-design-failure,table-design-cancel-load,held-breath-declare-beat,rest-cadence,audio-ambience,dev-dial
```

Use the same verified GPU backend for before/after measurements. Battery
saver, optional instant results, optional-module loading and physical-device
measurement remain separate increments. Future async scene mutations need
an invalidation at their actual completion boundary; adding a perpetual loop
would conceal a missing wakeup and reintroduce the measured idle work.
