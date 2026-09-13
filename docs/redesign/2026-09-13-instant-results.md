<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# R3: optional instant results

Preferences has an independent **Instant results** switch, off by default and
saved for this device. It skips the tumble and ceremony once the existing
film is prepared. It works with Full or Battery saver; it does not choose a
result, bypass simulation, reveal a held roll or send a shared setting.

Completion runs in a coalesced microtask after the complete film/ceremony or
legitimate reveal event has been installed. It uses the existing playback
fast-forward and reveal-skip functions. The event FIFO retains whole throws,
keeps, reveals and turn budgets. A preparing worker stays pending and asks
for completion when its actual result arrives. Turning Instant off during
that wait leaves no reserved skip behind. Explicit Skip and visible-tab
catch-up retain their existing reservation behavior.

Held rolls still display shrouds until their legitimate reveal. Secret rolls
still exist only for their audience. Instant does not synthesize an absent
value. Clears cancel worker reservations as before; a pending completion
microtask reads the current table and cannot restore the abandoned roll.

## Measured presentation time and rendering

Two separate owned headless Chrome processes join the same ephemeral table,
so both actual documents remain visible. A two-tab setup would background the
ordinary viewer and correctly pause it under the idle policy. No visibility
override is used for this measurement. Both viewers use Battery saver to
isolate playback timing from optional effects; one enables Instant.

Backend is verified ANGLE / NVIDIA RTX 4090 / OpenGL ES 3.2. Desktop is
1440×900; phone is 390×844 with mobile/coarse-pointer emulation, DPR 1. The
4 ms polling probe records time from its first observed roll reservation to
completed result state. Counters include all actual renderer frames from
before the roll through the final camera ease and idle. These are individual
samples on a desktop GPU, not a physical-phone or battery-life benchmark.

| Shared authored roll | Normal result ready | Instant result ready | Normal frames | Instant frames |
| --- | ---: | ---: | ---: | ---: |
| Desktop 4d20 | 1,400 ms | 286 ms | 119 | 45 |
| Desktop 40d20 | 3,004 ms | 353 ms | 208 | 50 |
| Emulated phone 4d20 | 1,534 ms | 5 ms | 141 | 51 |
| Emulated phone 40d20 | 2,495 ms | 234 ms | 185 | 51 |

The cold 4d20 includes startup work; the later phone-shaped 4d20 is warm.
These timings are not interchangeable device benchmarks. Instant still waits
for the solver and retains camera easing, so it neither promises zero wait
nor zero frames. Each pair received the same seed and values and produced an
identical complete film hash. [Raw timing, frame and fingerprint data](2026-09-13-instant.json)
retains preparation/completion observations for each viewer.

## Correctness and visual evidence

Full units and 25 targeted browser checks pass. They cover:

- A held test clock proving the Instant viewer finishes without `sim()`.
- Toggling off during actual 40d20 preparation, and persisted UI selection.
- Identical first films and two queued kept-die rethrows with one history row.
- Held/rethrow/reveal/rethrow FIFO preserving final poses, faces and budget.
- Secret isolation followed by a live shared ceremony reaching its normal verdict.
- Real inline fallback when Worker is unavailable, and cancellation preventing
  a cleared 40-die preparation from replacing the subsequent one-die result.
- Hidden worker and reveal completion drawing zero frames until visibility returns.
- Existing worker parity/mutation, turn snapshot/FIFO, idle and Battery checks.

Complete-film comparisons include keyframes, sounds, rough bytes, landings,
nudges, final poses and authored values. Faster local presentation grants no
power over anyone else's decisions or hidden values.

Inspected captures show the completed shared result and the device preference:
[desktop result](2026-09-13-instant-desktop-result.png),
[desktop Preferences](2026-09-13-instant-desktop-preferences.png),
[phone result](2026-09-13-instant-phone-result.png), and
[phone Preferences](2026-09-13-instant-phone-preferences.png). The phone sheet
shows both preferences and all three sound/number switches without clipping.
Its text explains that hidden rolls still require Reveal.

```sh
node tools/drive.mjs tools/steps/instant-results.mjs
node tests/e2e/run.mjs --only presentation,film-worker,idle-render
```

This changes presentation timing only. Full can retain animated rest/material
and ambient effects after an instant result; Battery controls those separately.
Solver cost, optional loading and physical-device energy measurements remain
independent work.
