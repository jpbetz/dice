<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Durable service: external enablement handoff

Initially reviewed on 2026-09-13 from `b6b890a`. Staging provisioning has since
advanced from clean source `be43dda`; see the [staging checkpoint](redesign/2026-09-13-staging.md)
for executed actions and remaining proof. The release owner retains the final
code SHA, release gate and production traffic decision. Local rehearsal passed
all seven recovery checks and three configuration/maintenance tests.

## Historical observation — September 13, before provisioning

The existing public origin is `https://dice-5wi5rwk2oa-uc.a.run.app`, revision
`dice-00059-r9r`, health SHA `407ad4b4c4c9`, Node `24.19.0`. Read-only checks
still find no account environment, `/api/account/status` returns 404, and the
Firestore API is disabled. Region is `us-central1`; concurrency/timeout are
80/3600 seconds. Revision maximum is 1 but **service maximum is 20**. A runtime
identity exists; its suitability and inherited roles have not been certified.
The private operator file has project, billing account, region and service
values; its domain is unset. No project ID, account address or credential is
included here.

The source manifest includes all ten `service/` files and the account, library,
home and People browser modules. It excludes operator configuration, tests,
tools, docs, developer panel assets and agent instruction files. The Makefile
deploy preserves existing environment and only sets `GIT_SHA`; it does not
bootstrap durable storage or a dedicated runtime identity. `make status` is
not an account-service readiness check.

## Current status and remaining verification

Staging source `11dd1ef` passes 4/4 prepare and 5/5 HTTPS return checkpoints;
19/19 runtime authorization checks pass. The selected PITR point and
[separate restored continuation](redesign/2026-09-14-cloud-return/restore/README.md)
are verified, preserving the initial screenshot failure and earlier cold-return
assertions. Production runtime checks pass 14/14, and the tested `11dd1ef`
enabled revision now receives 100% of traffic at service maximum 1. Its exact
compatible paused revision remains off traffic. All nine canonical browser
checkpoints and all 36 HTTPS delivery requests pass; see the
[release record](redesign/2026-09-14-production-release/README.md). Existing
billing alerts cover the services; no budget/recipient update was
needed. Details and limits are in the [checkpoint](redesign/2026-09-13-staging.md).

| Item | Observed status | Remaining verification |
| --- | --- | --- |
| Cost coverage | Existing project/all-service and billing-wide alerts cover these services, with default billing-admin routing. | Alert delivery is untested; alerts are notifications, not hard caps. |
| Staging | Source `11dd1ef` is Ready on `00006-p2z`; exact mapping, actual HTTPS return, retained data and guest/shared play pass. | Physical-device and uncoached human observation remain separate. |
| Production | Database `dice-accounts`, namespace `production-v1` and runtime `dice-accounts-runtime` are enabled at the unchanged canonical origin on tested source `11dd1ef`. | All nine canonical browser checkpoints pass on fresh independent browsers; no production restart/cold-home claim. Physical-device and uncoached observation remain separate. |
| Data permissions | Staging has 19/19 actual runtime checks; production has [14/14](redesign/2026-09-14-production-preparation/README.md). Production exact database role and deny-all rules are read back; anonymous GET/create return 403. | Retain exact database scope when changing runtime identities or storage. |
| Backup | Source staging and production have PITR, deletion protection and daily seven-day backups. Selected staging PITR clone/content/continuation are verified; no developer file import. | Public recovery must reconcile later security decisions; an isolated fixture restore does not certify that procedure. |
| Live room placement | Staging and production service/revision maxima are 1. Production cap was reduced before routing the exact enabled revision to 100%; both prior health samples had zero players/streams. | A health sample is not an admission lock; SSE overlap still requires care during future changes. |
| Release and rollback | Enabled and compatible paused revisions use the tested immutable `11dd1ef` image. Enabled receives 100%; compatible paused remains Ready at 0%. Exact mapping and unchanged origin/IAM are recorded. | Actual maintenance routing is a separate action; readiness alone does not prove a pause was exercised. |
| Recovery security | Keep restored copies isolated until later revocations, key rotations, blocks/removals, cancellations and memberships are reconciled. | The app has no global restore-time invalidation/reconciliation command. A public restore must not proceed without this additional reviewed procedure. |

First-release identity is the explicitly saved recovery key and HttpOnly
session. Google sign-in credentials, Firebase browser configuration, an email
provider and external notifications are not required. Invitations remain inside
the app. Accept for later preserves the current table; Accept and join explicitly
enters the invited table after acceptance.

## Exact command boundary

Use [ACCOUNT-OPERATIONS.md](ACCOUNT-OPERATIONS.md#storage-and-provisioning-proposal)
for the API, database, runtime-IAM and backup commands. The database create and
backup flags were checked against current official CLI documentation and the
installed `gcloud --help`; these commands still require review and resource
permissions. [Database creation](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/databases/create),
[backup schedules](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/backups/schedules/create).

Set these operator variables privately for the environment being reviewed:
`DICE_DEPLOY_PROJECT`, `DICE_DEPLOY_SERVICE`, `DICE_DEPLOY_REGION`,
`DICE_DEPLOY_DATABASE`, `DICE_DEPLOY_NAMESPACE`, `DICE_DEPLOY_RUNTIME`, `DICE_DEPLOY_RUNTIME_EMAIL`,
`DICE_DEPLOY_ORIGIN`, the clean reviewed `DICE_DEPLOY_SHA`, and
`DICE_DEPLOY_IMAGE` (the tested image URI including its `@sha256:` digest).
Record the source SHA and image digest together; the SHA environment stamp alone
does not establish which artifact was tested. The proposed
database IDs above meet the provider's naming rules; preflight checks a safe
address shape, not provider existence or every project/database naming policy.
[Database ID rules](https://docs.cloud.google.com/firestore/native/docs/manage-databases#database_id).

Bootstrap procedure for a new staging service. The recorded service already
exists; do not rerun resource creation blindly.

```sh
gcloud run deploy "$DICE_DEPLOY_SERVICE" --source . \
  --project "$DICE_DEPLOY_PROJECT" --region "$DICE_DEPLOY_REGION" \
  --service-account "$DICE_DEPLOY_RUNTIME_EMAIL" --allow-unauthenticated \
  --cpu 1 --memory 512Mi --concurrency 80 --timeout 3600 \
  --min 0 --max 1 --min-instances 0 --max-instances 1 --cpu-boost \
  --update-env-vars "GIT_SHA=$DICE_DEPLOY_SHA,DICE_ACCOUNT_STORE=paused,DICE_DEV_WRITE=0"
```

Obtain its canonical origin, then populate the runtime variables and run local
configuration-only preflight:

```sh
export DICE_ACCOUNT_STORE=firestore
export DICE_ACCOUNT_ORIGIN="$DICE_DEPLOY_ORIGIN"
export DICE_FIRESTORE_PROJECT="$DICE_DEPLOY_PROJECT"
export DICE_FIRESTORE_DATABASE="$DICE_DEPLOY_DATABASE"
export DICE_ACCOUNT_NAMESPACE="$DICE_DEPLOY_NAMESPACE"
export DICE_DEV_WRITE=0
node tools/account-preflight.mjs --production
```

After configuration preflight and review of the provisioned policy/rules, enable
staging for the runtime fixture checks:

```sh
gcloud run services update "$DICE_DEPLOY_SERVICE" \
  --project "$DICE_DEPLOY_PROJECT" --region "$DICE_DEPLOY_REGION" \
  --service-account "$DICE_DEPLOY_RUNTIME_EMAIL" --max 1 --max-instances 1 \
  --update-env-vars "DICE_ACCOUNT_STORE=firestore,DICE_ACCOUNT_ORIGIN=$DICE_DEPLOY_ORIGIN,DICE_FIRESTORE_PROJECT=$DICE_DEPLOY_PROJECT,DICE_FIRESTORE_DATABASE=$DICE_DEPLOY_DATABASE,DICE_ACCOUNT_NAMESPACE=$DICE_DEPLOY_NAMESPACE,DICE_DEV_WRITE=0"
```

For the existing production service, reuse the exact immutable image tested in
staging with the reviewed **production** values and `--no-traffic`. Set
`DICE_DEPLOY_SHA` to that image's recorded source SHA; do not rebuild from source
or substitute a mutable image tag during candidate preparation:

```sh
gcloud run deploy "$DICE_DEPLOY_SERVICE" --image "$DICE_DEPLOY_IMAGE" --no-traffic \
  --project "$DICE_DEPLOY_PROJECT" --region "$DICE_DEPLOY_REGION" \
  --service-account "$DICE_DEPLOY_RUNTIME_EMAIL" \
  --cpu 1 --memory 512Mi --concurrency 80 --timeout 3600 \
  --min-instances 0 --max-instances 1 --cpu-boost \
  --update-env-vars "GIT_SHA=$DICE_DEPLOY_SHA,DICE_ACCOUNT_STORE=firestore,DICE_ACCOUNT_ORIGIN=$DICE_DEPLOY_ORIGIN,DICE_FIRESTORE_PROJECT=$DICE_DEPLOY_PROJECT,DICE_FIRESTORE_DATABASE=$DICE_DEPLOY_DATABASE,DICE_ACCOUNT_NAMESPACE=$DICE_DEPLOY_NAMESPACE,DICE_DEV_WRITE=0"
```

The candidate command leaves service-level minimum/maximum settings unchanged.
`--max` is service-wide and takes effect immediately even with `--no-traffic`;
`--max-instances` belongs to the new revision. Set the service cap separately at
release, before switching traffic. [Maximum-instance behavior](https://docs.cloud.google.com/run/docs/configuring/max-instances).

`--no-traffic` retains traffic on the prior revision and replaces any floating
LATEST assignment with that exact revision. Later deployments or environment
updates do not automatically resume LATEST routing. Always select the intended
release or maintenance revision explicitly. A revision tag is a different
browser origin and cannot stand in for the final cookie/origin proof. Use this
explicit candidate command rather than `make deploy`, whose routing follows the
existing service traffic configuration.
[Cloud Run deploy flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy).

Before release, record the exact Ready candidate revision, its source/image and
production configuration, and the Ready compatible paused revision prepared by
the [maintenance recipe](ACCOUNT-OPERATIONS.md#safe-pause-and-rollback). Both new
revisions must still have 0% traffic, with the existing revision at 100%.

After that review, set `DICE_RELEASE_REVISION` to the recorded candidate. These
are **release actions**, not candidate preparation. The service-cap update
affects the currently serving revision immediately:

```sh
gcloud run services update "$DICE_DEPLOY_SERVICE" \
  --project "$DICE_DEPLOY_PROJECT" --region "$DICE_DEPLOY_REGION" --max 1
gcloud run services update-traffic "$DICE_DEPLOY_SERVICE" \
  --project "$DICE_DEPLOY_PROJECT" --region "$DICE_DEPLOY_REGION" \
  --to-revisions "$DICE_RELEASE_REVISION=100"
gcloud run services describe "$DICE_DEPLOY_SERVICE" \
  --project "$DICE_DEPLOY_PROJECT" --region "$DICE_DEPLOY_REGION" \
  --format='table(metadata.annotations."run.googleapis.com/maxScale":label=SERVICE_MAX,status.traffic.revisionName,status.traffic.percent,status.traffic.latestRevision)'
```

Read back the service maximum as 1 and exactly the recorded release revision at
100%, with no floating LATEST assignment or split. Routing changes do not drain
existing SSE requests immediately or preserve their in-memory turns. Follow the
switch with HTTPS fixture recovery, library conflict,
converted/reserved home return, invitation acceptance with separate Join,
presence opt-in/revocation, guest play and compression checks. The release owner should
present that concrete candidate and compatible rollback revision for approval.
Do not use the old public pre-home revision as a durable-service rollback.
