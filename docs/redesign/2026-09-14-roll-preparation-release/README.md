<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Accepted-roll program preparation frontend release

**Released 2026-09-14 UTC:** frozen source `d0d0f52` serves 100% of production
traffic with service and revision maxima of 1. The same immutable image passed
staging before promotion. Both HTTPS browser checks pass **5/5**, with zero
account mutation requests and all owned browsers closed.

## What changes

The candidate adds bounded render-program preparation after an accepted roll
starts its real simulation worker. It uses the actual cast's materials,
including hidden-roll shrouds, and prepares the applicable canvas/post targets
without another playback gate. Hidden pages, Instant results and synchronous
worker fallback skip the work. A caught compilation failure disables further
attempts while the authored film still completes.

Application/runtime/model/package bytes match the fully tested `2de6764`
checkout. Its [local proof](../2026-09-14-roll-program-preparation/README.md)
retains **18 bare-table performance trials plus six separate actual-input
trials** (24 fresh SwiftShader processes total): mixed first-use activity
longest task falls from 688 to 607 ms median, accepted worker request to first
visible dice from 605.5 to 514 ms, and actual input queue delay from 530.6 to
451.3 ms. These are local software-renderer comparisons under phone emulation,
not production latency, physical-phone/GPU or battery measurements. Later
standard-roll accepted-to-visible medians are 51.9 → 53.5 ms, with the slower
70.9 ms third on-sample retained; no startup improvement is claimed.

`npm test` on `2de6764` exits 0: 55 unit programs, 1,317,295 fuzz parses with
zero throws, **78/78 smoke**, and all seven account/library/home/People browser
programs pass. Two new focused scenarios and eleven existing parity, privacy,
lifecycle and presentation checks pass. The [historical full sweep](../2026-09-13-release/README.md)
retains three characterized legacy visual failures.

The natural phone continuation uses real held-roll, Reveal and next-roll
controls. A suspected missing-control preview was investigated: original PNG
pixels and real controls were intact, and decoded navigation regions match
with preparation on/off and across two capture methods. The [classification](../2026-09-14-roll-program-preparation/natural-phone/classification.json)
records the initial inference and its correction; no navigation bug was fixed.

## Executed release and preserved accounts

[release.json](release.json) retains the completed phase results and final
allowlisted readback. All four mutation commands exit 0; final readback
completes at **04:42:12.156951Z**.

| Phase | Actual result |
| --- | --- |
| Stage source preparation | New `d0d0f52` revision Ready at 0%; previous `90b8bb9` stays at 100%. |
| Stage route | Exact new revision receives 100% after an idle aggregate check. |
| Production preparation | The tested staging image is Ready at 0%; enabled configuration comes from the active production revision, changing only `GIT_SHA`. |
| Production route | `dice-r3-d0d0f52-09140434-on` receives 100% after its own idle aggregate check. |
| Final readback | Exact source/image/runtime/environment, origin, public IAM, ingress and maxima are confirmed; three rollback revisions remain Ready off traffic. |

Both pre-route checks observed zero players and streams. The final health
sample observed **2 players and 1 stream**; zero activity was not required for
that readback. These observations are not an admission lock or an atomic room
migration. No provisioning, database/IAM/rules/backup change, namespace change
or schema migration occurs. Service and revision maxima remain 1.

The previous `90b8bb9` enabled revision and both original `11dd1ef` enabled/
paused revisions remain Ready at 0%. Paused readiness does not claim that
maintenance routing was exercised. The source upload has **304 files**,
including **175 baked portraits (1,015,886 bytes)** and ten service modules;
private/developer files are excluded. This inventory is not a startup download.

The [90b8bb9 release](../2026-09-14-dice-loading-release/README.md) is separate
historical evidence. Server, durable-service and account/library/home/People
transport sources are unchanged from `11dd1ef`; the original
[production account and permission proof](../2026-09-14-production-release/README.md)
and [isolated staging restore](../2026-09-14-cloud-return/restore/README.md)
retain their original image/source boundaries. Those proofs were not rerun
for this frontend-only release.

## Actual HTTPS browser checks

[Staging](stage-browser.json) passes **5/5 in 11.708 seconds**;
[production](production-browser.json) passes **5/5 in 11.265 seconds**.
These are walkthrough durations, not performance comparisons. Each uses
fresh guest browsers, hit-tested pointer/keyboard input and natural playback.

The checks prove quick 2d6 without startup portrait requests, usable controls
while WebPs wait, loaded standard/Sea-glass artwork with stable control
geometry, and first-use 4d20 with equal complete films in two viewers. Four
frontend modules and 14 WebP assets load successfully; built-in browsing
creates zero live portrait renders or contexts. Account status/session reads
remain read-only: no account is registered or recovered.

All ten actual stage/production captures were inspected individually by the
release owner and reviewed independently. The five production captures are
retained below; each shared view shows **45 = 17 + 9 + 12 + 7**, with all four
transformed meshes inside the scene and uncovered by controls. Staging's
independent fixture shows 39 = 9 + 9 + 8 + 13.

| Production capture | Visible observation |
| --- | --- |
| [Quick 2d6 moving](quick-2d6-moving.png) | Moving dice fit between the result area and bottom controls. |
| [Portraits pending](builder-portraits-pending.png) | Labels and click targets remain usable while image responses wait. |
| [Sea-glass loaded](builder-seaglass.png) | Loaded artwork preserves the control geometry. |
| [Alice's 4d20](shared-4d20-alice.png) | Complete result and four glass dice remain readable with controls present. |
| [Bob's 4d20](shared-4d20-bob.png) | The opposite view shows the same complete result and supported dice. |

These are 390 × 844 phone-viewport emulations, not physical-device or uncoached
player observations. The guest walkthrough does not claim account recovery,
process replacement, cold-home restoration or new production speed gains.
Private origins, provider addresses, account/billing identifiers, credentials
and raw fixture journals are excluded. Captures show generated guest labels
and public fixture rolls only.
