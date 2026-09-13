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
| Compact controls and transactional table setup | Integrated owner-session commit `85da885`. Follow-up fixes restore keyboard radio arrows inside the sheet and clear conflicts when a peer restores the base; targeted desktop/phone proofs pass. Actual grounded-table 3D preview is now integrated as `00557f3`; six setup/design/channel tests and desktop/phone views pass. |
| Gallery practice | Committed as `f67d1df`; local/shared isolation and lifecycle tests plus desktop/phone captures pass. Owner expanded gallery integrated as `8fe35cc`; `64035a4` keeps practice inside that preview on phones. Four gallery checks, the strengthened phone practice check, and desktop/phone/short-workspace captures pass. |
| R1-C: Quick dice and explicit starter kits | Integrated `605b4f6` / `ab8e003` as `d6efcbb` / `5291b00`. Focused tests preserve empty/legacy libraries, occupied interpretation, drafts and unfinished private/shared/solo turns. Old tests explicitly select Soul Deal profiles/lenses and the composer; fresh-visit proofs retain the new empty/Numbers-only default. |
| Explicit profile publication | Committed as `002b115`; focused raw-network proof and composed smoke pass; see PROFILE-SHARING.md. Connect the namespace-reset hook before account recovery can adopt a library. |
| R1-D0: durable service | Local atomic store and Firestore REST adapter integrated as `046f9a7` / `0c121fa`; optional account API/client integrated as `a2037ee`. Adapter/account tests pass, including cookie races and restart recovery. Private immutable library revisions, transactional IndexedDB namespaces, explicit conflicts and cleanup integrated as `838f86a`. Real HTTP/browser/restart proofs pass. Agent now implements saved homes; UI agent implements account adoption and visible sync. No cloud storage is provisioned. |
| R3: compressed public text | Agent commit `8e44250` reviewed and integrated as `feb5f79`; combined suite passes. Production lacked compression; local six-file transfer shrinks approximately 72% with Brotli. |
| R3: dice-face draw consolidation | Integrated as `354b965`: two real draws per compatible die, reviewed face sheets and exact geometry/film checks. Ordinary film worker integrated as `2490b07` / `fb47593`; complete event FIFO and worker rethrows as `f783874`. Full-film parity, input-return measurements, live clear/collect/reveal and next-film collider preservation pass. Fourteen combined turn/worker/result checks pass. Idle rendering is in progress. |
| R1 destinations + R2 phone surface | Integrated as `55c42d7`: three destinations, content-sized desktop workspaces, full-width phone scene and bottom tray. Persistent result seats and reserved turn controls integrated as `955b2be`; composed desktop/phone/four-player/privacy/turn proofs pass. Copper Lantern, Navigation Table and Stone Circle plus actual appearance preview are integrated and visually inspected; Navigation/Stone are `0952007`. Both final recipes reproduce complete GLB bytes, and shared preview/application/restore, delivery and stable-channel checks pass. |

The root's integration checkout is `/tmp/dice-redesign-integration` on
`codex/redesign-integration`. Agents use isolated worktrees so reviews and
cherry-picks are explicit and another ongoing session's edits survive.

## Remaining campaign work

Complete optional account/recovery and visible library synchronization, saved
homes, contacts, invitations and permitted presence. Then exercise the complete
guest/recovered return loop after restart without a previous client repushing
setup. Profile publication, named-table controls, familiar first rolls,
destinations and the initial phone layout are implemented. History protects
100 unfinished turns beside 100 completed entries; capacity refuses without
removing work, and batch DOM pruning is verified.

R2 next: the grouped/concurrent roll experiment. Three complete compositions,
actual setup preview and persistent result seats are implemented. R3 next:
load remaining optional features on demand, reduce idle rendering, and implement
Battery saver and optional instant results. Complete ordered turn events and
worker parity for first/rethrows are implemented; towers and silent snapshot
reconstruction still use the inline solver.

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

## Composed checkpoint — 2026-09-13

At `db13791`, all unit/fuzz checks and the real library browser suite pass;
69/70 smoke scenarios pass in the full run. The remaining odds test expected
the replaced floating card. It now opens the actual standing turn control's
complete-result drawer, verifies visible odds and selection updates, and waits
for the authored throw budget before continuing; its targeted rerun passes.
The feature's read is available in the deliberately requested detail surface.
The six subsequent grounded-table/preview/setup/channel checks pass at `00557f3`.

Reviewed composed views include the owner’s full gallery and practice on phone,
short-height gallery detail, four-player desktop and phone results, push turns
with exposed dice and bottom actions, and Copper Lantern with an actual setup
preview. Worker mutation/reveal/parity checks pass together (5/5), as do
workspace/result/privacy checks (5/5). The subsequent combined worker/turn/read
suite passes 14/14. Both additional art directions have inspected desktop/phone
views, reproducible bakes, three lifecycle scenarios, stable-channel check and
60 static delivery assertions. New account UI, saved homes and grouped
presentation are still active work.

The owner’s committed gallery is preserved. Main’s untracked initial service
design draft remains untouched; the complete reviewed work is in the integration
checkout. Port 8123 and the owner’s browser have not been used for validation.
