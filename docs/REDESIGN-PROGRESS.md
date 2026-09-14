<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Redesign execution record

**2026-09-13:** the owner authorized autonomous work through the complete
[plan of record](EXPERIENCE-REDESIGN.md), using agents, reviewing each result,
and queueing the next ready task. This is an execution ledger, not a new
priority order. R1–R3's local implementation and scripted verification are
complete. Staging is enabled on `11dd1ef`, with 19/19 runtime permission
checks, selected PITR content and the complete source HTTPS return verified.
The isolated restored-app continuation also passes. Production runtime checks
pass 14/14 and the tested `11dd1ef` image is released at 100%, service maximum
1. All nine canonical browser checkpoints and all 36 HTTPS delivery requests
pass. Actual player/device observation remains open. The three characterized legacy visual gates remain recorded failures.

## Current work

| Work | State and next action |
| --- | --- |
| Identity, personal dice and first rolls | Direct name editing, full gallery/favorites/practice, focused libraries, explicit starter kits and Quick dice are implemented. Owner controls through `c90fd42` are composed, including compact phone saved rolls, direct result Clear and returning from accepted rolls. All 14 composed flow/workspace/gallery checks pass. |
| Table setup and saved homes | Named setup with actual Preview/Apply, durable public capture, retained-version comparison and deliberate Join are implemented. Four final actual-app home cases and five account cases pass, including restart, independent recovery, busy account replacement and real device-write failure before HTTP. |
| People | Recipient-bound contacts/invitations, blocked-name pagination and opt-in expiring presence APIs are integrated. The People workspace and its independent private action journal are integrated; all eleven actual-app cases pass, including current-table invitation/return, delayed joins, restart, account replacement, offline acceptance and real device-write failure. Accept for later preserves the current table and turn. The subsequent invitation flow adds explicit Accept and join, the current-table save continuation, and a count on People. |
| Shared surface and phone | Three reproducibly baked tables, full-width phone tray, persistent visible results and compact queued arrivals are implemented. Model size follows the shared table. The round physical envelope and full support/golden proofs are integrated as `e67da2c`/`04aafbf`; all six composed geometry proofs pass, with cost and collision profiling retained. The camera correction is integrated: 60 seeded painted-hull cases have no re-exits or settled crops, and all 36 baseline complete films agree. Long history reserves current results, with an inspected usable short-window layout. |
| Shared film ordering | Ordinary rolls and kept-die rethrows use the worker with complete ordered events. `f4e20c0` orders size changes between films, including held reveals and clear. Warm tower changes now use the ordered FIFO (`cf0e48a`); six composed ordering/readiness cases pass. Required-model failure now offers explicit authored results without fabricated physics. The tainted physical world resumes only after the core is ready and a deliberate authoritative table clear; ordered warm/cold/reveal/keep checks pass. |
| Lightweight play | Compressed delivery, face-material consolidation, idle sleep, Battery saver and independent Instant results are implemented. Optional scenery and the model parser now load on demand (`70d623b`, `530982b`); all eight composed loading/cancel/failure cases pass. Towers and silent reconstruction retain the inline solver. |
| Operations and release | Current staging revision `dice-accounts-stage-00006-p2z` is Ready on `11dd1ef`, with maximum 1 and mapping read back. The same-image source return passes 4/4 preparation and 5/5 verification checkpoints; [five actual captures](redesign/2026-09-14-cloud-return/README.md) are inspected. Actual IAM checks pass 19/19; the isolated PITR clone and selected content reads pass. Restore revision `00002-lsh` on `3ed9db1` passed identity/library and cold-home assertions before a capture-helper failure; its [separate continuation](redesign/2026-09-14-cloud-return/restore/README.md) passes all three remaining checkpoints with the original journal preserved. Production runtime checks pass [14/14](redesign/2026-09-14-production-preparation/README.md). The tested `11dd1ef` image is [released at 100%](redesign/2026-09-14-production-release/README.md), service maximum 1; its exact compatible paused revision remains Ready off traffic. All nine canonical production browser checkpoints and all 36 HTTPS delivery requests pass; fresh-browser recovery is proved on one released revision, without a production restart/cold-home claim. [Checkpoint and limits](redesign/2026-09-13-staging.md). HTTPS delivery checks pass; existing alerts cover staging. Production origin, ingress and public-service IAM are unchanged. Local frozen verification remains 364/368 plus 20/20 tail, with the wording correction separately verified and three pre-existing visual gates open. |

The root's integration checkout is `/tmp/dice-redesign-integration` on
`codex/redesign-integration`. Agents use isolated worktrees so reviews and
cherry-picks are explicit and another ongoing session's edits survive.

The later `39b9ec7` dice-portrait optimization is integrated in the repository.
Staging and released production still use the immutable `11dd1ef`
image; the cloud proofs do not include that later optimization. Temporary
restore infrastructure has been [removed after proof](redesign/2026-09-14-cloud-return/restore/cleanup.json),
with source resources and private evidence preserved.

## Remaining campaign work

The tower failure and camera slices are reviewed and integrated. The complete
guest/recovered return loop and current Help pass on the composed app, including
unfinished private-turn preservation and loading-time guest captures. The final
full sweep has reconciled superseded fixtures with current behavior. The
[final evidence](redesign/2026-09-13-release/README.md) retains its exact failures
and the separately verified wording correction; supported, visible dice are
proved directly.
The three baseline legacy venue/material failures retain their gates and
are characterized separately from redesign regressions.

All three table compositions and the compact arrival experiment are implemented.
Simultaneous physical playback was not selected: ordered films retain shared
collider history while each player’s last visible result remains available.
Full is the presentation default. Automatic device selection is deferred until
a measured criterion can support it. Remaining main-module extraction requires
an actual unused feature boundary; further file splitting alone saves no bytes.

Staging permission, delivery and PITR content checks are recorded separately
from local tests. The source HTTPS walkthrough and isolated restored continuation
are complete. Production runtime checks pass 14/14 and the tested `11dd1ef`
image is released at 100%, service maximum 1. All nine canonical browser
checkpoints and all 36 HTTPS delivery requests pass. Physical phone/midrange-device
and newcomer observations remain open. The
[release record](redesign/2026-09-14-production-release/README.md) keeps actual
traffic/browser/delivery proofs separate from those remaining observations.
A disabled optional service or fake-store
test alone does not complete persistent table homes.

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
all three composed configuration/pause/restore checks pass. At that checkpoint,
cloud resources and production traffic were unchanged.

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

## People and owner roll-flow composition

`c68dadb` preserves the owner's `c90fd42` mobile flow changes. Fourteen composed
workspace/gallery/result-flow checks pass, and actual phone saved-roll, builder,
result, short-height and custom-category Undo captures were inspected.
`8378a40` fixes the real last-category Undo defect. `7251487` contains later-created
startup controls behind the name dialog; eight targeted modal/workspace/flow
checks pass, with actual phone keyboard and pointer inspection.

People UI is integrated through `123077a`; all seven actual People cases pass
on the composed tree with the modal fix, including private unfinished-turn
preservation through account recovery and invitation acceptance. The inspected
phone invitation uses separate Accept and Join actions. No real-person
invitations or production service changes were made.

The 346-case preflight runs on a frozen older snapshot (`4d9518c`) to identify
regressions and superseded assumptions. Its failures are being characterized in
small groups; it is not a final release pass. Several cases assumed automatic
profile publication, the former Soul Deal first run, or square/camera constants.
Actual defects are fixed separately; assertions are retained where they still
prove the approved behavior. A late accepted roll response can also close a new
visit to the same editor; that reproduced defect is under correction.


## Camera, current input and release reconciliation

At `90100fd`, all thirteen composed camera/film/roll-flow/sharing scenarios
pass. This includes the full actual pointer camera journey, complete worker
and two-viewer film parity, and the late-response protection in reopened tasks.
`7a2cd82` verifies the current upright roller cue and the explicitly enabled
optional wash against prepared films; both cases pass. `d02b54a` converts all
four saved-home app journeys to hit-tested pointer/keyboard input, preserving
held HTTP/IDB and identity-change races. All four pass, with refreshed inspected
phone/desktop captures. Earlier descriptions of those home tests as actual-app
proofs did not imply that their old DOM-click helper tested reachability; this
commit adds that missing input proof.

`ceea875` retains measured before/after physics carriers without changing any
solver, audio threshold or nudge budget. `8e9ac6a` replaces retired-banner and
full-height-phone fixtures with current upright attribution, opposite-view
complete-film/body parity, eight-player actual scrolling, and usable developer
sheet input. The three composition cases pass. `d6f1529` fixes actual long-history
occlusion and short-window usability; its new history and unchanged draft
workbench checks pass 2/2. These are targeted results, not a final full sweep.

The older frozen `4d9518c` preflight finished **299/346**. Its failures were
triaged rather than used as a release verdict. Reproduced runtime defects now
fixed include last-category Undo, late-created modal containment, delayed
accepted-response dismissal, dev-clock idle wakeup, late shared-library offers,
required-model failure, camera crops and long-history occlusion. Other updates
make selected kits/publication explicit, wait for real prepared worker films,
and measure current visible result controls instead of retired geometry.
The old draft workbench failure initially passed on a fresh single-profile
library. The later full sweep exposed inherited multiple-profile state; the
follow-up fixes its missing ownership-heading state and proves both layouts.

The immutable `d6f1529` release preflight completed **355/366**, after its
full unit/fuzz rerun and both leading protocol-browser suites passed. All eleven
failures are classified in the [retained release
record](redesign/2026-09-13-release/README.md): eight corrections and three
unchanged legacy venue/material failures. Their gates remain intact.
The final frozen candidate `8a577e5` passes unit/fuzz and finishes **364/368**
scenarios. All **20/20** account/UI/return tail cases pass independently, with
exit 0 and no signals; the full command exits 1 for its four recorded failures.
The additional terminology failure is corrected as `094c318`, with paired
2/2 predecessor/current checks and inspected current Help. The three baseline
visual failures retain their gates. At that local verification checkpoint, cloud
traffic and the owner's live preview were untouched.


## Joined return and reviewed release corrections

At `65bc428`, all **16** account, home and People app cases pass (5/4/7).
At `48c2d1e`, the home-connection and independent social-browser cases pass,
and the joined R1 suite passes **2/2**: the full guest-to-recovered invitation
walk (260.6s) and held optional-account-module boundary (6.4s). The latter
restores the private kit exactly while retaining a loading-time guest capture
as a visibly selectable device alternative. Root review inspected the name
menu, accepted invitation, shared phone result and retained-copy comparison.
This proves local composition, not human discoverability or cloud durability.

`70f337d` makes actual-input tests foreground the intended browser before
waiting for painted controls. `5f86d68` returns focus to the current visible
task entry after breakpoint changes. `9119d82` mirrors the library's ownership
state to its scrolling list and refreshes it after inactive profile add/remove.
Inspected phone controls and real-wheel library transitions are retained in
[SHIPPED.md](SHIPPED.md#returning-focus-from-personal-tasks-2026-09-13).

`d07c7c7` corrects the ambient wake fixture's incidental fixed-window FPS
assumption while retaining strict Battery stillness and continued Full motion.
`65bc428` makes pending worker contact diagnostics distinguishable from a
completed silent film and proves the distinction with a held real worker reply.
The 45-cast full support proof passes in 96.9s with a 180s outer allowance.
The full pointer camera matrix passes in 175.4s; its future outer allowance is
360s to avoid clipping that test under concurrent browser load. Neither timeout
change alters a product budget, physical assertion or frame-rate claim.

The durable-service handoff is concrete in
[ACCOUNT-ENABLEMENT-CHECKLIST.md](ACCOUNT-ENABLEMENT-CHECKLIST.md). Its isolated
local recovery drill passes seven checks and explicitly proves that restoring
older data can revive later-revoked sessions and discard later blocks. Public
restore therefore still needs a reviewed security-reconciliation procedure.
That local drill changed no cloud resource, production traffic or live-preview
process. Subsequent cloud actions are recorded separately below.


## External observation handoff

The [human and physical-device sheet](REDESIGN-VALIDATION-SHEET.md) supplies
uncoached goals, exact existing script references, metric definitions and blank
result fields for the remaining R1-F/R2/R3 observations. It is a runnable session
plan, not completed evidence or a new performance threshold. A final read-only
scope audit found no missing local R1-A–E feature; simultaneous physical films,
automatic presentation selection and a legacy beta-scenery rebuild remain
explicitly outside the current implementation scope.


## Historical local closeout and current external result

At the local closeout checkpoint, all then-reviewed application changes were
committed on main. Its frozen source was `8a577e5` plus the one-sentence Help
correction; that correction's application, test and tool files matched its
independently tested branch. The
[release record](redesign/2026-09-13-release/README.md) preserves all command exits,
the full output, account/return logs, follow-up proof and inspected moments. The
last R1 run completes all recovery/invitation checkpoints and the held account-load
case, with matching complete films for recovered members and the unchanged guest.

The subsequent [cloud checkpoint](redesign/2026-09-13-staging.md) records
staging on `11dd1ef`, all 4/4 source preparation and 5/5 return checkpoints,
19/19 staging authorization checks, and the selected PITR restore with its
separate successful continuation. Temporary restore and permission fixtures
are removed with evidence preserved. Existing alerts already covered this
work; no budget or recipient update was required.

The tested immutable `11dd1ef` image is now [released to production](redesign/2026-09-14-production-release/README.md)
at 100%, service maximum 1, after 14/14 production runtime checks. Canonical
HTTPS delivery passes, as do all nine canonical production browser checkpoints
on fresh independent browsers. This does not claim a production restart or
cold-home proof.
Later repository work, including `39b9ec7` portraits, is outside that image.
Physical-device and uncoached player rows remain blank; a public data restore
still needs security reconciliation beyond the isolated fixture proof. The
owner’s handoff backup and live port 8123 remain untouched. See the
[enablement checklist](ACCOUNT-ENABLEMENT-CHECKLIST.md) for operating boundaries.
