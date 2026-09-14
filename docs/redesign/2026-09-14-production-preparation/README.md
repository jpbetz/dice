<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Production preparation and runtime permission proof

2026-09-14 UTC. The reviewed `11dd1ef` image is prepared in **two Ready,
zero-traffic revisions**. The production runtime and cross-database probes pass
**14/14 checks**. This record precedes public activation: the existing
`dice-00059-r9r` revision retains 100% of traffic and the service maximum is 20.

## Prepared configuration

[preparation.json](preparation.json) records the successful one-shot preparation
and provider readbacks. The dedicated `dice-accounts` database is Standard
Native in `us-central1`, with PITR, deletion protection and one daily backup
schedule retaining seven days. The explicit, immutable application namespace
is **`production-v1`**.

The dedicated `dice-accounts-runtime` identity has one project data binding:
`roles/datastore.user` conditional on exact equality to the production database
resource. No broader inherited principal grant was found. The reviewed deny-all
direct-client Rules source, database attachment and named release are read back.
Separate anonymous GET and create requests both return **403 PERMISSION_DENIED**.

| Prepared revision | Account mode | Maximum instances | Traffic |
| --- | --- | ---: | ---: |
| `dice-accounts-11dd1ef-09140137-on` | `firestore` | 1 | 0% |
| `dice-accounts-11dd1ef-09140137-pause` | `paused` | 1 | 0% |

Both revisions use the same reviewed immutable image, explicit dedicated runtime
and source SHA. The enabled revision's database, namespace and canonical origin
match the reviewed mapping. The paused revision has no account storage
configuration and retains developer writes disabled. Each deployment uses
`--no-traffic`; readbacks preserve the old exact traffic recipient, service
maximum, canonical origin, ingress and public-service IAM. Exact private
project/origin/image/identity mappings remain in the operator record.

## Actual runtime checks

[permission-proof.json](permission-proof.json) retains the two real Cloud Run
job reports and effective execution checks. Both use the final `11dd1ef` image;
its verified digest contains the identical previously inspected Node executable
layer. The actual image, attached identity, Node path, complete arguments,
database, UUID and resource limits match the intended execution.

| Runtime | Actual checks | Result |
| --- | --- | --- |
| Dedicated production runtime | Identity; metadata OAuth; fresh marker absent; begin transaction; transactional missing-marker read; commit one harmless marker; exact readback; conditional deletion of that exact marker; confirm absence | **9/9**, command exit 0 and task successful |
| Original staging runtime | Identity; metadata OAuth; production GET, begin transaction and commit/write each refused with 403 PERMISSION_DENIED | **5/5**, command exit 0 and task successful |

The production probe finishes at `02:06:12.576010Z`; denial finishes at
`02:09:48.540287Z`. An independent operator GET confirms the exact positive
marker is absent with **404 NOT_FOUND**. Only that disposable UUID marker was
written, in a namespace separate from `production-v1`; the denied write creates
no record. The probes add no IAM grants and do not change production service or
traffic configuration. Workload tokens stay inside the process; public reports
contain check labels and classifications, without credentials or fixture paths.

The retained job has one task, parallelism one, no retries, a 60-second task
timeout, one CPU and 512 MiB. Job startup elapsed time is not an application
performance measurement. The job and zero-role fixture identity remain retained
at this proof's completion for the release owner's separately recorded cleanup.

## Scope of this record

These 14 runtime checks and two anonymous refusals are distinct from the
[staging permission proof](../2026-09-14-staging-permissions/README.md) and
[restored-data continuation](../2026-09-14-cloud-return/restore/README.md).
Preparation, permission checks and a compatible paused revision do not route
public traffic or prove a production-browser recovery flow. Public activation,
maintenance routing, physical-device measurements and human observation remain
separate evidence.
