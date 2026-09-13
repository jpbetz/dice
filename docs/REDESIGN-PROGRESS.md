<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Redesign execution record

**2026-09-13:** the owner authorized autonomous work through the complete
[plan of record](EXPERIENCE-REDESIGN.md), using agents, reviewing each result,
and queueing the next ready task. This is an execution ledger, not a new
priority order. R1, R2 and R3 remain open until their composed proofs pass.

## Current work

| Work | State and next action |
| --- | --- |
| Direct identity, gallery/favorites, personal selection | Initial slice committed as `b064b07`; preserve the subsequent owner correction asking for compact controls. |
| Compact controls and transactional table setup | Integrated owner-session commit `85da885`. Follow-up fixes restore keyboard radio arrows inside the sheet and clear conflicts when a peer restores the base; targeted desktop/phone proofs pass. True 3D appearance preview remains open. |
| Gallery practice | Committed as `f67d1df`; local/shared isolation and lifecycle tests plus desktop/phone captures pass. First combined unit/fuzz/smoke run passed (61/61 smoke). |
| R1-C: Quick dice and explicit starter kits | Integrated `605b4f6` / `ab8e003` as `d6efcbb` / `5291b00`. Focused tests preserve empty/legacy libraries, occupied interpretation, drafts and unfinished private/shared/solo turns. Update old Soul Deal fixtures during composed validation. |
| Explicit profile publication | Implemented and focused raw-network proof passes; see PROFILE-SHARING.md. Connect the namespace-reset hook before account recovery can adopt a library. |
| R1-D0: durable service | Design selects optional recovery keys, private local atomic store and a Firestore REST adapter; adapter implementation/proofs underway in `codex/durable-service`. No cloud storage is provisioned. |
| R3: compressed public text | Agent commit `8e44250` reviewed and integrated as `feb5f79`; combined suite passes. Production lacked compression; local six-file transfer shrinks approximately 72% with Brotli. |
| R3: dice-face draw consolidation | Agent investigating/implementing in `codex/r3-materials`; require measured draw savings and art/physics parity. |
| R1 destinations + R2 phone surface | Agent implementing one coherent workspace and full-width phone with bottom roll tray from the compact/quick integration base. Review actual four-person dice bounds and preserve draft/open turns. |

The root's integration checkout is `/tmp/dice-redesign-integration` on
`codex/redesign-integration`. Agents use isolated worktrees so reviews and
cherry-picks are explicit and another ongoing session's edits survive.

## Remaining campaign work

Finish R1-B3's recognizable names and real appearance preview; implement
the destination shell and phone layout; deliver recovery APIs, explicit
profile publication, safe library synchronization, saved homes, contacts,
invitations, and permitted presence. Fix the existing history-cap eviction
of unfinished turns after sufficiently many later rolls. Then exercise the full guest/recovered
return loop after restart without a prior client repushing state.

R2 owes one complete multiplayer composition, readable per-player latest
results, subsequent table art directions, and a measured experiment for
rolls arriving together. R3 owes responsive simulation, optional loading,
idle work reduction, Battery saver, and optional instant results. Keep
these on the queue rather than treating delivery compression as all of R3.

Cloud provisioning, actual phone/midrange-device observations, user
observation, and production deployment are not established by local tests.
Prepare and verify their concrete artifacts before any final external
approval step. Never treat a disabled optional service or fake-store test
as completion of persistent table homes.

## Validation baseline

The initial main-checkout `npm test` run passed all unit/fuzz checks and
59/62 smoke scenarios. Failures were the in-flight table-controls recents
assertion, control-rail markup, and die-pick's ring at y=0.032 under a
surface at y=1.8308. Those must be resolved or independently characterized
before release. The compact-controls commit resolves the first two. The
integration tree at `feb5f79` passed all unit/fuzz tests and 61/61 smoke,
including die-pick; that intermittent earlier surface report still needs
characterization if it recurs, not a weakened probe. Use the harness's
ephemeral ports. Port 8123 remains untouched.
