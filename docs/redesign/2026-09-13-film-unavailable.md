<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Authored results when a required tower cannot load

A loaded tower now changes at its position between authored rolls. The remaining
failure was a cold or failed asset: the previous replay deadline released dice
against the retained collision core, silently producing a different film.

The tower event now stays at the FIFO head until its complete model and validated
portals are ready. Loading begins on receipt so it overlaps earlier playback.
Terminal loader failure, inconsistent variant portals, an unknown required tower,
or the existing 10-second deadline enters an explicit local results state. Rolls
continue through the same FIFO as rethrows, bank, reveal, collection and clear.
A delayed replay is a snapshot event in that queue; the old separate held-replay
fallback has been removed.

There is no substitute film. The authored dice types, values or redaction, per-die
counting metadata, seed, visibility, turn budget and bank state populate the same
result readers. An unavailable current-roll marker has zero keyframes and no die
bodies. This state is separate from the personal Instant preference, which still
completes the original prepared film.

A first skipped film makes the local physical scene incomplete. Its obsolete die
bodies and meshes are removed, while history and logical turns remain. Later model
arrival or a different tower cannot silently resume simulation against missing
settled bodies. A ready required core plus an authoritative whole-table clear
restores an empty, known physical world; the UI explicitly says **Clear table for
everyone**. It does not send an automatic clear. Before any film is skipped,
selecting another ready tower can cancel a failed or pending choice immediately.
Reload retries through actual model readiness and snapshot reconstruction.

The complete-result drawer offers indexed keep buttons for visible, owned open
turns. Their selections use the existing keep indices and authoritative server
validation for rethrow and bank. Hidden or redacted results expose no selectable
values. Existing counted/discarded breakdowns and reveal permissions remain the
same. Collected and cleared turns cannot be restored by a stale snapshot merely
because results-only dice have no meshes.

## Evidence

`tests/e2e/film-unavailable.mjs` exercises actual held GLB requests and blocked
parser requests. It covers timeout, terminal failure, first rolls, kept rethrows,
queued bank and snapshots, held/reveal, secret and whisper privacy, counted and
discarded dice, clear/cancel, late readiness, and ready-core reload. Controls use
hit-tested pointer input; the keep/rethrow/recovery flow runs at 390 × 844. The
hidden-tab deadline processes results without increasing the renderer frame count.
The restored first film and the film after a shared clear are compared in full
against the other viewer, not merely by values or final settings.

`tools/steps/film-unavailable.mjs` captures a lone roll, indexed keeps, a rethrow,
and four player results on desktop and a 390 × 844 phone. Its JSON records the
actual authored seed/result, availability state, explicit null film, zero die
bodies, layout bounds and renderer counters. This is an exceptional missing-asset
presentation, not a battery or faster-solver measurement.

Full unit tests passed. Twenty-six distinct targeted browser cases passed across
this increment, including six new exceptional cases. The final combined run passed
all 13 selected exceptional, warm tower, parser, and snapshot cases; targeted
follow-ups also verify the banked index and retained keep-button focus.

- [Capture data](2026-09-13-film-unavailable.json)
- [Desktop result](2026-09-13-film-unavailable-desktop-lone.png) and [keeps](2026-09-13-film-unavailable-desktop-keep.png)
- [Phone result](2026-09-13-film-unavailable-phone-lone.png), [keeps](2026-09-13-film-unavailable-phone-keep.png), and [rethrow](2026-09-13-film-unavailable-phone-rethrow.png)
- [Four-player phone](2026-09-13-film-unavailable-phone-four.png)

These captures were inspected: the status, six 44-pixel keep controls and complete
turn actions fit the phone; four results remain readable together with no horizontal
overflow. The existing background player-name labels remain visible on the empty
physical scene. Final capture data identifies ANGLE Vulkan SwiftShader explicitly.

## Limits

The existing server snapshot stores current authored values and the original seed,
not historical rethrow films or kept poses. A reload can reconstruct a ready-core
snapshot, but cannot promise historical pose parity after missed rethrows. This
change does not expand server history, alter physics, or repair that limitation.
Assets may finish after the bounded wait; once a film was skipped, continuing
results is intentional until a shared clear or successful reconstruction. Choosing
another core after skipping films still requires that clear.

Earlier captures and regression checks used the verified NVIDIA backend. A later
fresh hardware browser failed before app initialization with WebGL disabled and
`BindToCurrentSequence failed`; an isolated raw-page probe reproduced it. Final
correctness and screenshot checks use the harness's software renderer. No hardware
performance or battery-life improvement is claimed for this slice.
