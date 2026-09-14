<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Production release of the reviewed redesign

2026-09-14 UTC. The tested immutable `11dd1ef` image now serves **100%** of
production traffic. The service and released revision both have maximum **1**.
The exact compatible paused revision remains Ready at **0%**. Public origin,
ingress and public-service IAM are unchanged. The fresh canonical production
browser smoke passes **9/9 checkpoints**; all **36** wire-delivery requests pass.

## Actual cutover

[release.json](release.json) records allowlisted provider readbacks from the
one-shot release action, which completed successfully at `02:18:03Z`.
Before either change, both prepared revisions were checked for exact Ready
status, immutable image/source, dedicated runtime, account environment and
revision maximum. The old route was pinned to `dice-00059-r9r` at 100%, with
service maximum 20.

| Step | Observed result |
| --- | --- |
| Before changing the service cap | Public health reported the old source and zero rooms, players and streams. |
| Set service maximum to 1 | Command exit 0; readback retained the exact old 100% traffic route. |
| Immediately before routing | Public health again reported the old source and zero rooms, players and streams. |
| Route exact enabled revision | Command exit 0; `dice-accounts-11dd1ef-09140137-on` read back at 100%, maximum 1. |
| Public readback | Health reported the exact full `11dd1ef` SHA; origin, ingress and public-service IAM matched their earlier values. |

Those idle samples are observations, not an admission lock. The release action
writes no account data. It does not upload new source or automatically roll
back an uncertain mutation. The compatible paused revision is
`dice-accounts-11dd1ef-09140137-pause`; readiness is not evidence that maintenance
routing was exercised. Use the explicit route/readback procedure in
[ACCOUNT-OPERATIONS.md](../../ACCOUNT-OPERATIONS.md#safe-pause-and-rollback).

A [final read-only handoff](final-readback.json) at `02:27:42Z` again confirms
the exact released image/runtime/environment, sole 100% route and both maxima
of 1. Public health reports `11dd1ef` on Node `24.19.0`; account status is
enabled and available with all four capabilities. Its zero-player/stream
observation is recorded without making zero activity a success requirement.

The [preparation record](../2026-09-14-production-preparation/README.md)
retains the earlier zero-traffic snapshot, production namespace `production-v1`,
PITR/deletion protection/daily seven-day backups, exact database IAM and deny-all
rules. Production runtime checks pass **14/14**, and anonymous GET/create both
refuse with 403. Temporary permission fixtures have been
[removed after proof](../2026-09-14-production-preparation/README.md#temporary-resource-cleanup).

## Canonical browser smoke

[browser-proof.json](browser-proof.json) records the separate corrected run from
`02:21:56.352Z` to `02:24:39.455Z` (**163.103 seconds**, including real
90-second presence expiry). It completes all nine checkpoints and exits 0,
with no failure and all owned browsers closed.

Fresh independent browsers recover the generated fixture identity and retain
the local library until explicit comparison/adoption. Immutable conflicts,
exact retries and original versions are retained. Both converted and reserved
homes return without publishing private libraries. The recipient's **Accept for
later** preserves an unfinished private turn; a separate **Join now** leads to
the new shared result with matching complete films in two viewers. Online/location consent, withdrawal,
session revocation and real expiry are checked separately.

Account recovery, home controls, invitation acceptance and Join use actual
pointer/keyboard input. API fixtures prepare isolated partners, conflicting
versions and negative access/security cases. These are generated fixture
accounts and in-app invitations only, with no real-person messages. The detailed
aggregate separates those mechanisms. This is a **fresh-browser proof on one
released revision**, with no production process-replacement or cold-home claim.

| Inspected phone capture | Visible observation |
| --- | --- |
| [Library comparison](library-comparison.png) | Retained account/device choices are readable before explicit adoption. |
| [Library adopted](library-adopted.png) | Private sync status and deliberate sharing boundary remain visible. |
| [Both homes](both-homes.png) | Converted and reserved homes have readable names and return actions. |
| [Accepted before Join](invitation-accepted-before-join.png) | The accepted invitation retains a separate Join action. |
| [Shared recovered result](shared-recovered-result.png) | The shared result reads 8 from 4 + 1 + 3, with the earlier result 10 still visible. |

All five captures are inspected; they contain generated fixture names and rolls,
without recovery keys, contact codes or account cookies. They are phone viewport
emulation, not physical-phone observations.

The first smoke failed at its release-readback assertion before any browser,
identity or account-data action: the fixture expected capabilities as object
flags, while the actual API returns the documented array. That failed journal
and its driver/binding remain byte-exact. The successful run uses a separately
bound corrected driver and fresh journal; it does not reset or relabel the
first attempt as a pass.

## Canonical HTTPS delivery

[delivery.json](delivery.json) records the actual production sample at
`02:19:52.733Z`, with exact source health checked before and after. All **36**
first/repeated GETs over six assets return 200, negotiate the requested encoding
and decode to identical source bytes.

| Encoding | Six-asset transferred bytes |
| --- | ---: |
| Identity | 3,985,212 |
| Brotli | 1,113,498 |
| Gzip | 1,151,817 |

These are wire-byte and decoding measurements. They do not measure whole-page
startup, frame pacing, physical-device performance or battery life.

## Evidence boundary

The [staging source return and isolated restore](../2026-09-14-cloud-return/README.md)
remain separate from this production release. The restore continuation retains
its initial screenshot failure and earlier cold-home assertions; it is not a
fresh uninterrupted cold-return pass or a public restore-security certification.

The repository subsequently includes `39b9ec7` (lazy baked dice portraits).
That later optimization is **not** in this immutable `11dd1ef` image or its
cloud proofs. The [historical local release record](../2026-09-13-release/README.md)
retains its exact 364/368 result, separately verified wording fix, 20/20 tail
and three characterized legacy visual gates. Physical-device and uncoached
human observation remain open. Private origins, project/runtime addresses,
credential journals and raw cloud logs are excluded from this record.
