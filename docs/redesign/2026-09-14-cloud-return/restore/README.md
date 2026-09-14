<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Isolated staging restore and explicit continuation

September 14 UTC, 2026. The selected PITR clone and restored fixture journey
are verified. The [aggregate](result.json) preserves the initial failed
attempt and the successful continuation separately. This is distinct from the
later source `11dd1ef` [4/4 preparation and 5/5 verification](../README.md).
It is not a production release or approval to put an older security snapshot
behind the public account origin.

## The restored point

The original `3ed9db1` preparation finished at **00:55:28.039635 UTC** with
all fixture clients closed: zero rooms, players and streams. Its prepared
journal was retained read-only. The clone used the whole-minute PITR point
**2026-09-14T00:56:00Z**. The provider operation finished `SUCCESSFUL` at
**01:09:36.306409 UTC**; its completed response reports Standard Native mode
in `us-central1`, deletion protection enabled and clone PITR disabled. The
source database retains its own PITR and daily seven-day backup configuration.

At verification time, isolated revision **`00002-lsh`** was Ready and available
on the same immutable `3ed9db1` image. Its separate database, dedicated runtime,
exact database-equality data role, canonical origin/namespace and maximum 1
were read back. Deny-all client rules were compiled, released and read back
against that database. The original staging runtime's separate cross-database
denial proof is retained with the [19/19 authorization checks](../../2026-09-14-staging-permissions/README.md).
After proof, the temporary restore service, clone database, runtime identity
and exact IAM binding were removed. The [cleanup record](cleanup.json) confirms
absence at **02:03:36.333274 UTC**, all five mutation commands exiting 0, source
configuration/data protections/runtime unchanged, and 18 private evidence files
preserved byte-exact. Clone deletion protection was disabled only for that
cleanup; the Ready/protection configuration above describes verification time.
An initially stale runtime list later converged, without a repeated delete.
Deny-all rules were not targeted, and their post-delete attachment was not
rechecked.

At **01:16:59.080 UTC**, the operator recovered only generated fixture accounts
and compared their data. The restored library head exactly matched the
prepared point, while the later source adoption revision was excluded. Both
saved homes and the pending invitation remained readable. Recovery/session
cleanup changed sessions; this comparison did not write libraries, homes or
invitations.

## Two recorded browser attempts

| Attempt | Result |
| --- | --- |
| Initial restored verification, 22.666 seconds | Identity/cookie recovery and retained-library adoption checkpoints passed. Both cold home joins then passed, with zero old roll history, Copper/close setup and private-library exclusion from public join state. Screenshot framing failed on the noninteractive home-card container; the command exited 1. |
| Explicit continuation, 130.344 seconds | A new exclusive private record was bound to that exact failure, source, restored origin and revision. The same generated identities were recovered without repeating adoption or enabling sync. Three continuation checkpoints passed; the command exited 0. |

The continuation rechecked **warm** home returns and captured both named cards.
Invitation acceptance preserved the recipient's existing private turn, seat,
URL and publication choices. Separate Join produced the same authored values
and complete film for two browser viewers. Explicit online and home-location
consent, withdrawal, session revocation and the real 90-second lease expiry
passed. The final library head and saved-home heads/documents matched the
continuation's starting reads. Accepting the invitation intentionally changed
membership; this is not a claim that all account state stayed unchanged.

The original failed journal stayed byte-exact. Neither its phase nor its
failure was rewritten. The continuation is **not** a fresh uninterrupted pass
and does not supply a second cold-start observation. Tooling fix `bfa98bd`
frames visible content and requires both expected home names, while real
pointer and keyboard actions retain hit testing.

## Inspected captures

All three are actual **390 × 844 phone emulation at DPR 1**, inspected after
the continuation. They show generated display labels and shared fixture rolls;
no recovery key, contact code or cookie is visible.

| Capture | Visible observation |
| --- | --- |
| [Both homes](both-homes.png) | Converted and reserved names, Manage and Join now controls are visible together. The cards show monogram covers at capture time. |
| [Accepted before Join](invitation-accepted-before-join.png) | The accepted invitation shows the Copper artwork and a separate Join now action. |
| [Shared result](shared-recovered-result.png) | The total and arithmetic, both dice, roll controls and navigation remain visible. Two browser viewers plus an HTTP fixture observer explain the displayed table count of three. |

The private driver, target binding, credentials, journals and provider logs are
excluded. Physical devices, uncoached human observation and the canonical
production account flow remain separate. A public data restore still requires
reconciling later revocations, blocks, cancellations and memberships under the
[operating procedure](../../../ACCOUNT-OPERATIONS.md#safe-pause-and-rollback).
