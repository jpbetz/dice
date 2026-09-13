<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Redesign execution record

**2026-09-13:** the owner authorized autonomous work through the complete
[plan of record](EXPERIENCE-REDESIGN.md), using agents, reviewing each result,
and queueing the next ready task. This is an execution ledger, not a new
priority order. R1, R2 and R3 remain open until their composed proofs pass.

## Current work

| Work | State and next action |
| --- | --- |
| Identity, personal dice and first rolls | Direct name editing, full gallery/favorites/practice, focused libraries, explicit starter kits and Quick dice are implemented. Owner controls through `cd69c20` are composed; subsequent owner roll-flow edits remain in main until committed and reviewed. |
| Table setup and saved homes | Named setup with actual Preview/Apply, durable public capture, retained-version comparison and deliberate Join are implemented. Four final actual-app home cases and five account cases pass, including restart, independent recovery, busy account replacement and real device-write failure before HTTP. |
| People | Recipient-bound contacts/invitations, blocked-name pagination and opt-in expiring presence APIs are integrated. The People workspace and its independent private action journal are under implementation/review. Acceptance must preserve the current table and turn; joining is a separate explicit action. |
| Shared surface and phone | Three reproducibly baked tables, full-width phone tray, persistent visible results and compact queued arrivals are implemented. Model size follows the shared table. A round physical envelope is integrated as `e67da2c`; support/cost/golden evidence is being completed. Actual inspection found desktop stress dice cropped by the viewport, queued as a separate camera fix. |
| Shared film ordering | Ordinary rolls and kept-die rethrows use the worker with complete ordered events. `f4e20c0` orders size changes between films, including held reveals and clear. Tower changes have a reproduced different-speed-viewer divergence; ordered readiness and an honest unavailable-asset escape are active work. |
| Lightweight play | Compressed delivery, face-material consolidation, idle sleep, Battery saver and independent Instant results are implemented. Optional scenery and the model parser now load on demand (`70d623b`, `530982b`); all eight composed loading/cancel/failure cases pass. Towers and silent reconstruction retain the inline solver. |
| Operations and release | File/Firestore adapters, configuration preflight, safe maintenance pause and a concrete account operating plan are implemented. No cloud resources or production traffic changed. Complete composed release checks, then verify the external staging/restore/deployment work described in ACCOUNT-OPERATIONS.md. |

The root's integration checkout is `/tmp/dice-redesign-integration` on
`codex/redesign-integration`. Agents use isolated worktrees so reviews and
cherry-picks are explicit and another ongoing session's edits survive.

## Remaining campaign work

Finish and review People, tower event ordering/failure handling and the camera
fit, then exercise the complete guest/recovered return loop on the composed
app. Preserve unfinished and private turns through each visible action. The
final full sweep must reconcile superseded fixtures with current behavior;
a passing old geometry proxy is not a substitute for supported, visible dice.

All three table compositions and the compact arrival experiment are implemented.
Simultaneous physical playback was not selected: ordered films retain shared
collider history while each player’s last visible result remains available.
Full is the presentation default. Automatic device selection is deferred until
a measured criterion can support it. Remaining main-module extraction requires
an actual unused feature boundary; further file splitting alone saves no bytes.

Cloud provisioning, physical phone/midrange-device observations, newcomer
observation and production deployment are not established by local tests.
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

## Ordered settings and model-parser checkpoint

`f4e20c0` fixes the reproduced size-change race between Instant and normal
viewers. New full-film and held-reveal/clear checks pass beside existing
ceremony, reveal and size checks (7/7). The initial pre-round worker/turn/Instant
regression run passes 21/21. The separate tower-order reproduction remains open.

`530982b` defers GLTF parsing within the existing model readiness/retry boundary.
Eight composed scenery/parser/cancel/failure cases pass, and the actual phone
first-use capture was inspected. Together the two optional module graphs save
67,256 encoded and 234,894 decoded startup bytes in the recorded local capture.
These figures describe delivery, not battery use or faster scene construction.

The round mechanism's pure helper checks 782,784 spawn/hull/jitter clearances.
Nine composed size/design/readiness/order cases pass. Actual Copper stress
inspection confirms phone support and exposes the desktop viewport crop; the
round proof and camera fix remain separate work. No final full sweep or cloud
enablement is claimed by this checkpoint.
