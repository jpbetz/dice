<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Durable service: external enablement handoff

2026-09-13, reviewed from `b6b890a` with the completed account/home/social
runtime. These are proposed external actions, not executed changes. The release owner owns
the final code SHA, release gate and approval. Local rehearsal:
`node tools/account-local-drill.mjs` passed all seven checks; the three existing
configuration/maintenance tests passed. No cloud resources or real people were
changed.

## Observed state

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

## Decisions and actions still needed

| Item | Concrete proposed value/action | Evidence required before enabling |
| --- | --- | --- |
| Project and cost owner | Reuse the existing private deployment project only after its billing owner approves Firestore, backups/PITR and alerts. No new project is required by the code. | Record approved project and budget/notification owner privately. |
| Staging | New service `dice-accounts-stage`; Standard Native database `dice-accounts-stage`; namespace `stage-v1`; runtime account `dice-accounts-stage-runtime`. | Confirm each name is unused or belongs to this deployment; record the canonical HTTPS origin returned at creation. |
| Production | Existing service `dice`; Standard Native database `dice-accounts`; namespace `production-v1`; runtime account `dice-accounts-runtime`; use the existing `run.app` origin unless an intentional domain migration is reviewed. | Record the exact immutable project/database/namespace/origin/runtime mapping. |
| Data permissions | Enable Firestore; create the two databases in `us-central1` with deletion protection and PITR; attach distinct runtime identities with database-conditional `roles/datastore.user`. | Runtime app transaction succeeds only on its database; unrelated identity/direct browser access refuses; inherited broader roles are absent. |
| Backup | Daily backups retained seven days, plus PITR; no developer file import. | Isolated staging restore preserves library revisions, memberships and invitation state; record restore point and missing later writes. |
| Live room placement | Set both service and revision maxima to 1; no traffic split; deploy between games. | Read back both maxima and a single serving revision. Existing SSE requests can still overlap a rollout. |
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

Bootstrap the **new staging service only**, after provisioning its runtime:

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

After exit 0 and external IAM/data checks, enable the staging revision:

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
  --min 0 --max 1 --min-instances 0 --max-instances 1 --cpu-boost \
  --update-env-vars "GIT_SHA=$DICE_DEPLOY_SHA,DICE_ACCOUNT_STORE=firestore,DICE_ACCOUNT_ORIGIN=$DICE_DEPLOY_ORIGIN,DICE_FIRESTORE_PROJECT=$DICE_DEPLOY_PROJECT,DICE_FIRESTORE_DATABASE=$DICE_DEPLOY_DATABASE,DICE_ACCOUNT_NAMESPACE=$DICE_DEPLOY_NAMESPACE,DICE_DEV_WRITE=0"
```

`--max` is service-wide; `--max-instances` belongs to the revision.
`--no-traffic` retains traffic on the prior revision. Neither makes a live-room
rollout atomic. A revision tag is a different browser origin and cannot stand
in for the final cookie/origin proof. The explicit candidate command is not
`make deploy`, which sends traffic to the new revision by default.
[Cloud Run deploy flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy).

The final external action is the reviewed 100% traffic switch to the exact
candidate revision, followed by HTTPS fixture recovery, library conflict,
converted/reserved home return, invitation acceptance with separate Join,
presence opt-in/revocation, guest play and compression checks. The release owner should
present that concrete candidate and compatible rollback revision for approval.
Do not use the old public pre-home revision as a durable-service rollback.
