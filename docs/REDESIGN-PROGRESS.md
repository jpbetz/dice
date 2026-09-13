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
| Explicit profile publication | Committed as `002b115`; focused raw-network proof and composed smoke pass; see PROFILE-SHARING.md. Account adoption now withdraws publication before switching; blocked or uncertain transitions disable the visible sharing choice. |
| R1-D0: durable service | Local atomic store and Firestore REST adapter integrated as `046f9a7` / `0c121fa`; optional account API/client integrated as `a2037ee`. Adapter/account tests pass, including cookie races and restart recovery. Private immutable library revisions, transactional IndexedDB namespaces, explicit conflicts and cleanup integrated as `838f86a`, cleanup protection follow-up `6ea70cf`. Saved-home protocol integrated as `e923893`; real restart/outage/corruption/concurrent-save proofs pass. Account adoption and visible sync are integrated (`c12fdd5` plus `93fdd13`); five actual-app cases pass. Home UI is in progress. Recipient-bound contacts/inbox API is integrated as `eeb9d13`; presence and composed browser handoff are next. No cloud storage is provisioned. |
| R3: compressed public text | Agent commit `8e44250` reviewed and integrated as `feb5f79`; combined suite passes. Production lacked compression; local six-file transfer shrinks approximately 72% with Brotli. |
| R3: dice-face draw consolidation | Integrated as `354b965`: two real draws per compatible die, reviewed face sheets and exact geometry/film checks. Ordinary film worker integrated as `2490b07` / `fb47593`; complete event FIFO and worker rethrows as `f783874`. Full-film parity, input-return measurements, live clear/collect/reveal and next-film collider preservation pass. Fourteen combined turn/worker/result checks pass. Idle rendering is integrated as `df3f970`: zero settled renderer frames, with 24 matching original films. Four actual idle/wakeup/effect cases also pass after composition. Battery saver/instant are in progress. |
| R1 destinations + R2 phone surface | Integrated as `55c42d7`: three destinations, content-sized desktop workspaces, full-width phone scene and bottom tray. Persistent result seats and reserved turn controls integrated as `955b2be`; composed desktop/phone/four-player/privacy/turn proofs pass. Copper Lantern, Navigation Table and Stone Circle plus actual appearance preview are integrated and visually inspected; Navigation/Stone are `0952007`. Both final recipes reproduce complete GLB bytes, and shared preview/application/restore, delivery and stable-channel checks pass. |

The root's integration checkout is `/tmp/dice-redesign-integration` on
`codex/redesign-integration`. Agents use isolated worktrees so reviews and
cherry-picks are explicit and another ongoing session's edits survive.

## Remaining campaign work

Complete saved-home management and the contacts, invitations and permitted
presence interfaces. Optional account/recovery and visible library sync are
implemented and verified in the actual app. Then exercise the complete
guest/recovered return loop after restart without a previous client repushing
setup. Profile publication, named-table controls, familiar first rolls,
destinations and the initial phone layout are implemented. History protects
100 unfinished turns beside 100 completed entries; capacity refuses without
removing work, and batch DOM pruning is verified.

R2's compact arrival experiment is integrated as `7e80490`: active and waiting
rollers are distinct, waiting players keep qualified previous results, and no
queued face values or secret activity enter the read. Four combined burst,
four-player, private-turn and FIFO checks pass; desktop/phone views are inspected.
Three complete compositions, actual setup preview and persistent result seats
are implemented. Simultaneous physical playback was not chosen for this slice;
the compact experiment preserves the established films and collider ordering.
R3 next:
load remaining optional features on demand and implement
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
60 static delivery assertions. Saved-home integration passes 16 library/home
checks, two real browser recovery/helper checks and seven combined table,
result/privacy/burst/FIFO scenarios. Home/social UI and presence remain active work.

The owner’s committed gallery is preserved. Main’s untracked initial service
design draft remains untouched; the complete reviewed work is in the integration
checkout. Port 8123 and the owner’s browser have not been used for validation.

## Main-checkout checkpoint after owner-library composition

The owner’s focused library is composed as `ca71c21`: its full task is shared
by the personal menu and My dice & rolls; starter kits, explicit sharing and
account review retain their boundaries. Seven library/first-play/task checks
and five actual-account scenarios pass; composed desktop and phone, short
creation/rename and kit views were inspected. Named kit creation additionally
retains its requested name through explicit preview/Add.

At `b918e22`, the full unit/fuzz and both two-case protocol-browser suites pass,
with 70/71 smoke scenarios passing. The sole failure was an unused saved-home
notice added to the normal rail. `a317896` creates it only when needed; the
control-rail rerun, four actual idle scenarios and help proof pass together
(6/6), as do all five actual-account scenarios and the held-reservation/home
outage/new-guest scenario. This records the targeted correction, not a claim
that a second full 71-case sweep has run.

Owner-session controls/gallery/library history through `2925e34` has been
reviewed and incorporated; `efb002f` records that ancestry after the composed
cherry-picks. Before updating the main checkout, its untracked initial service
draft is preserved at `docs/handoff/2026-09-13-durable-service-initial-draft.md`.
The maintained design remains `docs/DURABLE-SERVICE-DESIGN.md`. No production
deployment or preview-port process change accompanies this checkpoint.

## Saved-home and presentation checkpoint

`9c7a176` adds saved-home cards, public capture, retained-version comparison,
exact durable retries and deliberate Join. Three composed actual-app cases pass,
including clean recovery after restart without a library repush. A review
follow-up is tightening close-during-save and explicit refused-copy cleanup.
`c637f7b` adds opt-in expiring presence; five presence tests and the independent
browser invitation/return proof pass. People UI is now the active R1 work.

Battery saver (`06eb3d8`) and Instant results (`6794d8b`) are integrated.
All eight composed preference/Instant cases pass. The phone fixture measures
actual viewport fit as preferences grow; the owner's subsequent hidden-library
selector fix and Dice launcher placement are composed as `639effb`.
`9b975e8` adds a validated `paused` maintenance mode and concrete operating plan;
all three composed configuration/pause/restore checks pass. Cloud resources and
production traffic remain unchanged.

`1a20aa0` makes each baked table follow shared size. Six design/zoom checks pass
and all 27 sampled films equal the unchanged baseline. Actual support rays
exposed the remaining square-collision/round-art mismatch on stress throws;
that is active R2 work. Optional scenery loading is the active R3 slice.
Main's later owner commit `cd69c20` is preserved in the merge ancestry, including
its plain-copy and roll-control placement instructions in AGENTS.md.

The composed owner controls, workspaces, touch targets and rail pass together
(7/7). The actual desktop/phone launcher and expanded Preferences were inspected;
help now explains saved-home capture and personal Battery/Instant behavior.
Both scripted visual passes complete without browser errors.

## Composed retry and loading checks

At `efb85ab`, the full unit/fuzz lane and both protocol-browser suites pass;
70/71 smoke scenarios pass. The only failure is Help wording in the established
terminology check. Rephrasing those two terms preserves its meaning; the
terminology rerun and all four new scenery-loading cases pass together (5/5).
No second full smoke sweep is claimed by that targeted correction.

All four final saved-home app cases pass together, including close-during-save,
account replacement while busy, and retained export after a real IDB abort.
All five actual-account app cases pass on the subsequent composed tree, and
all ten social API cases pass with the bounded blocked-name page (`938e5c4`).
The remaining People UI is active. `70d623b` defers both optional scenery
modules, saving about 36 KB encoded startup bodies in the local capture;
GLTF parser loading is the next bounded slice. Your main checkout has new
uncommitted owner-session work, so this checkpoint stays in integration until
that work is committed and reviewed.
