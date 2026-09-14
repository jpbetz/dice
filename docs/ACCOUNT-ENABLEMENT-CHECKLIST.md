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

The staging database, dedicated runtime identity, conditional data role,
deny-all client rules and paused service have been created and read back.
Account mode is enabled on `dice-accounts-stage-00002-5bn`; HTTPS status reports
available library/home/People/presence capabilities. Existing billing alerts
already cover staging; no budget or recipient update is needed. Cloud fixture recovery,
runtime authorization probes and restore proof remain open; production traffic
has not changed. Details and limits are in the [checkpoint](redesign/2026-09-13-staging.md).

| Item | Observed status or proposed action | Remaining verification |
| --- | --- | --- |
| Cost coverage | Existing three identical $5 monthly project/all-service alerts and the $33 billing-wide alert cover staging, with default billing-admin email routing. No alert update is required. | Alert delivery is untested; alerts are notifications, not hard caps. |
| Staging | Service `dice-accounts-stage`, Standard Native database `dice-accounts-stage` in `us-central1`, and runtime account `dice-accounts-stage-runtime` now exist. Reviewed namespace is `stage-v1`. | Enabled revision and exact origin/database/namespace read back; actual HTTPS fixtures/revision return remain open. |
| Production | Existing service `dice`; Standard Native database `dice-accounts`; namespace `production-v1`; runtime account `dice-accounts-runtime`; use the existing `run.app` origin unless an intentional domain migration is reviewed. | Record the exact immutable project/database/namespace/origin/runtime mapping. |
| Data permissions | Staging has its sole database-equality `roles/datastore.user` binding, no broader inherited grant found, and released deny-all client rules. Anonymous GET/create both refused with 403. Production provisioning remains proposed. | Runtime transaction on the intended database and zero-role/unrelated-database refusal probes remain open. |
| Backup | Staging daily seven-day backup schedule, PITR and deletion protection are enabled; no developer file import. | Isolated staging restore preserves library revisions, memberships and invitation state; record restore point and missing later writes. |
| Live room placement | Staging service and paused revision maxima both read back as 1. Production still needs its reviewed candidate configuration. | Recheck the enabled revision and serving traffic. Existing SSE requests can still overlap a rollout. |
| Candidate and rollback | Same reviewed release code in staging and production; record one compatible maintenance-capable rollback revision. | Full release gate, clean checkout, correct source manifest, health SHA and recorded compatible schema/config mapping. |
| Recovery security | Keep restored copies isolated until later revocations, key rotations, blocks/removals, cancellations and memberships are reconciled. | The app has no global restore-time invalidation/reconciliation command. A public restore must not proceed without this additional reviewed procedure. |

First-release identity is the explicitly saved recovery key and HttpOnly
session. Google sign-in credentials, Firebase browser configuration, an email
provider and external notifications are not required. Invitations remain inside
the app and acceptance does not automatically join a live table.

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
`DICE_DEPLOY_ORIGIN`, and the clean reviewed `DICE_DEPLOY_SHA`. The proposed
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

For the existing production service, prepare the same source candidate with
the reviewed **production** values and `--no-traffic`:

```sh
gcloud run deploy "$DICE_DEPLOY_SERVICE" --source . --no-traffic \
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
