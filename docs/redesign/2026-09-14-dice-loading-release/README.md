<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Dice-loading frontend release

This records the `90b8bb9` dice-loading release. The subsequent
[program-preparation release](../2026-09-14-roll-preparation-release/README.md)
now serves `d0d0f52`. All source versions, counts and observations below retain
their original scope.

**Released 2026-09-14 UTC:** clean source `90b8bb9` serves 100% of production
traffic, with service and revision maxima of 1. The same immutable image passed
staging before promotion. Both staging and production frontend checks pass
**5/5**, with zero account-data writes and all owned browsers closed.

## What changes

The release combines `39b9ec7` baked dice portraits with the first-use atlas
correction tested on `096d9e8`. Application, runtime, models and package bytes
match that fully tested checkout.

Built-in controls request baked WebP portraits only when visible; edited or
missing artwork uses the bounded live fallback. The [portrait comparison](../2026-09-13-dice-art/README.md)
records median navigation-to-visible quick dice falling from 2.04 to 1.21
seconds in local phone emulation. The [atlas padding comparison](../2026-09-14-dice-atlas-padding/README.md)
records the first 4d20 activity's longest task falling from 209 to 79 ms median;
ordinary first 2d6 timing remains effectively unchanged. Full atlas pixels,
UVs, geometry, hull/value data and all 175 live portraits match before/after.
These local measurements are not production latency or physical-phone/GPU/
battery measurements.

The complete `npm test` run on `096d9e8` exits 0: 55 unit programs, seeded fuzz,
77/77 browser smoke, account library/home checks 2/2 + 2/2, and the account/home/
People tail 5/5 + 1/1 + 1/1 + 4/4 + 13/13 pass. All nine focused atlas/material/
behavior scenarios pass. The [historical full sweep](../2026-09-13-release/README.md)
retains its three characterized legacy visual failures.

## Executed release and preserved accounts

[release.json](release.json) retains allowlisted completed phase results,
readbacks and source-manifest counts. All four mutation commands exit 0; the
final readback completes at `03:19:40Z`.

| Phase | Actual result |
| --- | --- |
| Stage source preparation | New `90b8bb9` revision Ready at 0%; the old resolved revision stays at 100% and its earlier LATEST route becomes pinned. |
| Stage route | Exact new staging revision receives 100%, after an idle aggregate check; account status remains enabled and available. |
| Production preparation | The same tested immutable image is Ready at 0%; active production configuration is copied from its serving revision, changing only `GIT_SHA`. |
| Production route | `dice-r3-90b8bb9-09140304-on` receives 100%, after a separate idle aggregate check. |
| Final readback | Exact source/image/runtime/environment, origin, public IAM, ingress and maxima are confirmed; both original `11dd1ef` enabled and paused rollback revisions remain Ready off traffic. |

Both routing checks observed zero players and streams; these samples are not
an admission lock or an atomic room migration. No provisioning, database/IAM/
rules/backup change, namespace change or schema migration occurs. Service and
revision maxima remain 1 throughout. Paused rollback readiness does not claim
that maintenance routing was exercised.

The upload contains **304 files**, including all **175 baked WebP portraits
(1,015,886 bytes)** and all ten service modules. Private/developer files are
excluded. Catalogue size is an artifact inventory, not a startup download.

Server, durable-service modules and account/library/home/People transports are
unchanged from `11dd1ef`. The original [production account and permission proof](../2026-09-14-production-release/README.md)
and [isolated staging restore](../2026-09-14-cloud-return/restore/README.md)
remain separate evidence on their original images. Those proofs were not
rerun for this frontend-only change.

## Actual HTTPS browser checks

[Staging](stage-browser.json) passes 5/5 in **12.151 seconds**;
[production](production-browser.json) passes 5/5 in **12.649 seconds**. These
are walkthrough durations, not performance comparisons. Both use fresh guest
browsers, hit-tested pointer/keyboard input and natural playback.

The checks prove quick 2d6 without portrait startup work, usable controls while
WebPs wait, actual loaded standard/Sea-glass portraits, and a first-use 4d20
with equal complete films in two viewers. Four changed frontend modules and
14 WebP assets load successfully. Startup requests zero portraits; built-in
browsing creates zero live portrait renders or contexts. Pending-to-loaded
control dimensions remain unchanged. Account status/session requests are
read-only; no account is registered or recovered and no account cookie is set.

All ten stage/production captures were inspected; the five production captures
are retained below. Each result's four transformed meshes fit the scene and
remain uncovered, with the displayed total and individual faces matching the
shared values.

| Production capture | Visible observation |
| --- | --- |
| [Quick 2d6 moving](quick-2d6-moving.png) | Moving dice fit between the result area and bottom controls. |
| [Portraits pending](builder-portraits-pending.png) | Labels and click targets remain available while image responses wait. |
| [Sea-glass loaded](builder-seaglass.png) | Loaded themed artwork keeps the same control geometry. |
| [Alice's 4d20 view](shared-4d20-alice.png) | 53 = 2 + 20 + 18 + 13 is readable with all four dice visible. |
| [Bob's 4d20 view](shared-4d20-bob.png) | The opposite view shows the same complete result and supported dice. |

These are 390 × 844 phone-viewport emulations, not physical-device or uncoached
player observations. This guest check does not claim account recovery, process
replacement, cold-home restoration or a new production speed benchmark.
Private origins, provider addresses, opaque fixture IDs and raw journals are
excluded. The captures show generated guest labels and public rolls only.
