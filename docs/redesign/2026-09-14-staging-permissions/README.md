<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Staging runtime permissions and HTTPS delivery

2026-09-14 UTC. Three actual Cloud Run job executions pass **19/19 runtime
checks**: [14 intended-database/zero-role checks](permission-proof.json) and
[5 cross-database checks](cross-database-denial.json). The job uses the
image from the reviewed `be43dda` staging revision. `server.js` and every file
under `service/` are identical between that source, `3ed9db1` and `11dd1ef`;
the permission proof was not rerun on the later UI images. Exact registry,
identity, execution and fixture-path mappings remain in the private operator
record.

## Intended database and zero-role identity

| Execution | Actual checks | Result |
| --- | --- | --- |
| Dedicated staging runtime | Attached identity; metadata workload OAuth; fresh record absent; begin transaction; transactional missing-record read; commit one harmless marker; exact readback; delete that exact marker with its update-time precondition; confirm absence | **9/9**, command exit 0 and successful task |
| Separate zero-role identity | Attached identity; metadata workload OAuth; GET, begin transaction and commit/write each return **403 PERMISSION_DENIED** | **5/5**, command exit 0 and successful task |

The positive sequence observes GET 404, transaction begin 200, transactional
GET 404, commit 200 and exact marker GET 200. The record is in a fresh probe
namespace, separate from app fixtures. Its conditional deletion succeeds; a
final independent operator read also returns 404. The denied write creates no
record. No project role or TokenCreator grant was added for these probes.

Both executions use the same pinned image and byte-exact Node arguments.
The task has one task, parallelism one, no retries, a 60-second task timeout,
one CPU and 512 MiB. Metadata credentials stay inside the process. Recorded
stdout contains check labels and HTTP classifications, with no credentials,
account data or private resource identifiers. The temporary job and zero-role
identity are retained for the release owner's subsequent checks and cleanup.

## Startup attempts excluded from the proof

The first `command=node` task fails before the probe runs. The image's default
entrypoint is `/cnb/process/web`; its image PATH contains CNB and system
directories, without the Node runtime layer. This attempt is retained as a
startup failure, not a Firestore failure.

The next non-direct `/cnb/lifecycle/launcher` attempt exceeds the operator's
180-second wait, whose process exits 124. Cloud Run later reports a successful
task, but no probe report is present in either job-wide or execution-specific
logs. It is also excluded from the permission result.

Inspection of the exact image's runtime layer verifies
`/layers/google.nodejs.runtime/node/bin/node` as a regular executable with mode
0755. The counted executions use that path directly. The effective
execution image, identity and two arguments match the intended values,
including the complete 7,240-byte bootstrap. The actual reports are observed
in Cloud Run job logs. A mock local bootstrap check only verified invocation;
it is not included in the 19 runtime checks.

## First cross-database attempt

The first attempt against the restore database reaches the original staging
identity and obtains workload OAuth. Its first GET returns **400
FAILED_PRECONDITION** while the clone operation is still processing. The
probe stops before transaction or write and exits 1. The
[retained incomplete attempt](cross-database-incomplete.json) is not an IAM
denial, a permission regression or evidence that the clone finished.

## Completed-clone cross-database denial

After the release owner independently observes the clone operation complete,
a fresh execution against that database passes **5/5 checks** in
[cross-database-denial.json](cross-database-denial.json). The original staging
runtime and its metadata workload OAuth are confirmed; GET, begin transaction
and commit/write each return **403 PERMISSION_DENIED**. The command exits 0
and the task succeeds. The effective execution again matches the pinned image,
verified Node path, byte-exact arguments, clone target and fresh UUID.

This is separate from the 14 intended-database/zero-role checks above. No IAM
grant is added, no record is created, and the original runtime is never granted
clone access. The earlier 400 response remains retained as an incomplete
attempt. Clone completion itself and the restored app's data verification come
from separate release-owner evidence.

## Latest HTTPS delivery sample

The [latest delivery artifact](../2026-09-13-staging-delivery.json) measures
reviewed source `11dd1ef`, staging revision `dice-accounts-stage-00005-tbg`, at
`2026-09-14T01:20:13.327Z`. All six sampled entry assets pass their first and
repeat identity/Brotli/gzip decoding checks.

| Encoding | Total wire body bytes |
| --- | ---: |
| Identity | 3,985,212 |
| Brotli | 1,113,498 |
| gzip | 1,151,817 |

The prior [3ed9db1 sample](../2026-09-14-staging-delivery-3ed9db1.json) and
[be43dda sample](../2026-09-13-staging-delivery-be43dda.json) remain separate.
Only the canonical origin is removed from the measurement payload;
rows and totals are unchanged. The `node` field identifies the measurement
process, not the deployed runtime. These are six-asset wire measurements;
whole-page startup, physical-device performance and battery use are not measured
by this probe. Application HTTPS recovery, restore-content verification and
production rollout remain separate release evidence.
