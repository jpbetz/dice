<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Optional account service: enablement, pause and rollback

2026-09-13. Reviewable operating plan for the implemented recovery, library,
saved-home, invitation and presence service. **No cloud resources were created,
permissions changed, deployments performed or real invitations sent while
preparing this document.** Commands under provisioning/deployment are proposed
operator actions after review, not a record that they ran.

## Current evidence and remaining external work

Read-only Cloud Run/API checks on 2026-09-13 found:

| Observation | Result |
| --- | --- |
| Public origin | `https://dice-5wi5rwk2oa-uc.a.run.app` |
| Ready revision / public health SHA | `dice-00059-r9r` / `407ad4b4c4c9` |
| Runtime | Node `24.19.0`; revision maximum 1, timeout 3600 s, concurrency 80 |
| Account environment keys | None; account mode defaults to off |
| Public `/api/account/status` | 404: this deployed code predates the optional API |
| Firestore API | Not enabled in the active deployment project |
| Developer write switch | Disabled |

Project IDs, runtime account addresses, tokens and full service configuration
were not printed or saved. The read-only local source-upload manifest includes
all `service/` modules and browser transports, and excludes operator config and
`tools/`. Local unit/real-process/Chrome proofs cover recovery, version conflicts,
same-address home restoration, recipient isolation, invitation acceptance during
an open turn, and permitted presence. They do not prove deployed IAM, cloud
writes, backup recovery, production cookies, or final People/Tables UI.

The external work is: reviewed database/location and cost choice; Firestore API
enablement; distinct staging/production storage; a dedicated runtime identity;
database-scoped IAM; restrictive client access; backup/PITR setup and a restore
drill; staging recovery; and a reviewed deployment/rollback pair. Existing guest
play can ship with the optional API disabled before those steps.

## Configuration preflight

`node tools/account-preflight.mjs [--production]` validates the same mode,
origin and Firestore address schema used by the runtime. It reads environment
variables only, emits sanitized state/field names, and makes no network request,
creates no directory, takes no lock and changes no service. Exit 0 means the
configuration shape is ready; exit 2 means invalid, disabled or deliberately
paused. It does not certify IAM, database existence, private filesystem
permissions/symlinks, or durability. The file adapter checks those local path
properties when it opens the private directory.

| Variable | Requirement |
| --- | --- |
| `DICE_ACCOUNT_STORE` | `off` (default), `paused`, `file`, or `firestore` |
| `DICE_ACCOUNT_ORIGIN` | Exact canonical HTTPS browser origin; no trailing slash, credentials, path, query or fragment. Loopback HTTP is allowed for local tests only. |
| `DICE_ACCOUNT_DIR` | File mode only: absolute private directory outside the checkout. Never the filesystem/home/temp root. File mode refuses Cloud Run. |
| `DICE_ACCOUNT_RECOVER_LOCK=1` | Explicit local crash recovery only; accepts a lock solely when its same-host recorded process is demonstrably dead. Never delete an ambiguous/live lock to force startup. |
| `DICE_FIRESTORE_PROJECT` | Explicit reviewed project for Firestore mode |
| `DICE_FIRESTORE_DATABASE` | Reviewed database ID; defaults to `(default)` if absent. Set explicitly for deployment. |
| `DICE_ACCOUNT_NAMESPACE` | Explicit immutable deployment namespace. Changing it selects different data; it is not a reset/recovery action. |
| `DICE_DEV_WRITE` | Must remain absent or disabled in production |

Example candidate, with placeholders replaced by reviewed values:

```sh
export DICE_ACCOUNT_STORE=firestore
export DICE_ACCOUNT_ORIGIN=https://REVIEWED_BROWSER_ORIGIN
export DICE_FIRESTORE_PROJECT=REVIEWED_PROJECT_ID
export DICE_FIRESTORE_DATABASE=dice-accounts
export DICE_ACCOUNT_NAMESPACE=production-v1
node tools/account-preflight.mjs --production
```

No recovery keys, account cookies or Google tokens belong in these deployment
variables. The runtime obtains an OAuth access token from its attached Cloud Run
identity through the metadata server; no downloaded service-account key is
needed. [Cloud Run service identity](https://docs.cloud.google.com/run/docs/securing/service-identity).

Use one canonical browser origin. A custom domain and a `run.app` host are
different cookie/origin boundaries; the second is not an interchangeable sign-in
URL. Staging gets its own origin and its own data. Do not weaken the Origin/CSRF
checks to make a revision tag act like the production browser origin.

## Storage and provisioning proposal

Use Firestore **Standard edition, Native mode** in `us-central1`, near the
existing service. Proposed named databases are `dice-accounts-stage` and
`dice-accounts`; namespaces are `stage-v1` and `production-v1`. A namespace is an
application partition, not an IAM boundary. Separate databases and conditional
database IAM provide the staging boundary. Database creation supports deletion
protection and per-database conditional roles. [Database management](https://docs.cloud.google.com/firestore/native/docs/manage-databases).

The app's OAuth REST requests use IAM authorization; browser Firebase ID-token
requests use Security Rules. Keep mobile/web client access restrictive and never
give app users direct datastore credentials. The service applies its own
person/member/recipient checks. [Firestore REST authorization](https://firebase.google.com/docs/firestore/use-rest-api).

These commands are a proposal to run only after the named resources and costs
are reviewed. Set `DICE_DEPLOY_PROJECT`, `DICE_DEPLOY_DATABASE`,
`DICE_DEPLOY_REGION`, `DICE_DEPLOY_RUNTIME` and `DICE_DEPLOY_RUNTIME_EMAIL` in the
operator shell to the reviewed project, database, region, new service-account
name and that account's email. Use different runtime identities for staging and
production. Check existing resources before creating them; do not rerun create
commands blindly.

```sh
gcloud services enable firestore.googleapis.com --project "$DICE_DEPLOY_PROJECT"

gcloud iam service-accounts create "$DICE_DEPLOY_RUNTIME" \
  --project "$DICE_DEPLOY_PROJECT" --display-name='Dice account runtime'

gcloud firestore databases create --project "$DICE_DEPLOY_PROJECT" \
  --database "$DICE_DEPLOY_DATABASE" --location "$DICE_DEPLOY_REGION" \
  --edition standard --type firestore-native --delete-protection --enable-pitr

gcloud projects add-iam-policy-binding "$DICE_DEPLOY_PROJECT" \
  --member="serviceAccount:$DICE_DEPLOY_RUNTIME_EMAIL" \
  --role=roles/datastore.user \
  --condition="expression=resource.name==\"projects/$DICE_DEPLOY_PROJECT/databases/$DICE_DEPLOY_DATABASE\",title=dice-account-database"

gcloud firestore backups schedules create --project "$DICE_DEPLOY_PROJECT" \
  --database "$DICE_DEPLOY_DATABASE" --recurrence daily --retention 7d
```

The runtime role grants application data access, not a reason to grant Owner or
Editor. Database-scoped IAM conditions are enforced by REST even though the
Cloud console has a different condition boundary. Verify that the runtime has
no inherited broader data role; an added narrow binding does not remove broad
permissions it already held. [Firestore IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam),
[database conditions](https://docs.cloud.google.com/firestore/native/docs/manage-databases#configure_per-database_access_permissions).

Before any user data, select **Restrictive** mobile/web rules when creating the
database through the console, or apply equivalent deny-all client rules using
the reviewed rules deployment method. Verify anonymous/direct-client data reads
and writes refuse. No Firebase SDK/CLI installation is part of the app. The
runtime identity must still pass its authenticated get/transaction checks.

PITR begins retaining history when enabled; it cannot immediately supply a full
week of older history. Backups/PITR and restored databases have separate costs.
Review the current regional pricing and extend the existing billing alert before
enabling them; no zero-dollar account-service bill is promised. The 30-second
presence cadence and bounded inbox/friend projections still incur writes/reads
while in use. [PITR behavior](https://docs.cloud.google.com/firestore/native/docs/use-pitr),
[backup operations](https://docs.cloud.google.com/firestore/native/docs/backups),
[Firestore pricing](https://firebase.google.com/docs/firestore/pricing).

Do not copy a developer's private file snapshot into production. The first cloud
database is intentionally empty; returning users opt in through the app's
existing private-library comparison. Opaque file backups contain account/session
data and must never be committed or included in a source upload.

## Staging and first enablement

1. Finish the composed desktop/phone acceptance work and required full sweep.
   Use a clean reviewed checkout and record its SHA. Run configuration preflight
   and inspect the local `gcloud meta list-files-for-upload` manifest. The
   `service/` directory must ship; `deploy/config.mk`, tests, tools, screenshots
   and private data must not. Do not run `make deploy` accidentally as a check.
2. Create the separate staging service first in `paused` mode with its reviewed
   runtime account and the existing CPU/memory/concurrency/timeout configuration.
   Obtain its canonical service origin. Configure its own Firestore database,
   namespace and exact origin, then enable `firestore`. This avoids guessing a
   newly created service's browser origin.
3. On staging, create only purpose-made test accounts. Prove clean-browser
   recovery after a revision replacement; library retry/conflict/original
   retention; both converted and reserved homes after the old live process is
   gone; forbidden writes by another person; recipient-bound invitation and
   explicit join; and opt-in/expiry/revocation of presence. Verify restrictive
   direct-client access and an unrelated runtime identity's refusal. Check
   cookies from an actual HTTPS browser, not an HTTP fixture.
4. Create a backup or PITR point, restore/clone into a **different** staging
   database, and point a separate staging configuration at it. Prove recovery,
   immutable versions, memberships and invitation states there. Record the
   restored point and any writes later than that point. Do not restore over the
   active database or merge private records by hand.
5. Prepare a production candidate using the same tested code, correct production
   runtime account and explicit production configuration. Keep it off production
   traffic while reviewing public status/delivery and the deployment artifact.
   A revision tag has a different origin and is not the final browser-auth proof.
6. Record a compatible rollback revision and its data/config mapping before
   switching production traffic. Switch between games and retain exactly one
   serving revision. After switching, verify health SHA, HTTPS account flow with
   fixture identities, saved-home return, guest play and compression. Announce
   durability only after these cloud checks succeed.

Cloud Run creates immutable revisions for code/config changes. Traffic updates
are not instant, and existing requests can continue on their previous revision.
Splitting traffic would split this app's in-memory live rooms, even though
Firestore transactions remain correct. Use the existing one-instance live-room
discipline and consider a service-level maximum of one alongside the revision
maximum; it still does not turn rolling updates into an atomic room migration.
[Revision traffic/rollback](https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration),
[maximum-instance semantics](https://docs.cloud.google.com/run/docs/configuring/max-instances).

The runtime file adapter is never a Cloud Run durability solution: instance
filesystem contents do not persist when the instance stops. The adapter refuses
that platform explicitly. [Cloud Run filesystem contract](https://docs.cloud.google.com/run/docs/container-contract#file_system).

## Safe pause and rollback

**Once homes exist, never use `off` as a maintenance switch and never roll back
to pre-D2 code.** Converted guest/legacy addresses do not have a special home
prefix. Without the mapping lookup, an older/off server can create an empty
replacement at that same address. Account `off` is only appropriate for a
deployment which has never offered durable homes.

Use the implemented **`paused`** mode for emergency maintenance. It does not
need credentials, a valid origin, a directory or a namespace to protect cold
addresses. It makes no storage calls. Account APIs report unavailable and all
cold room keys require retry; an already live room bypasses storage, and explicit
new guest creation/rolling works. The saved data and mapping remain untouched.

After reviewing the service/region/project values, the maintenance action is:

```sh
gcloud run services update "$DICE_DEPLOY_SERVICE" \
  --project "$DICE_DEPLOY_PROJECT" --region "$DICE_DEPLOY_REGION" \
  --update-env-vars DICE_ACCOUNT_STORE=paused
```

That configuration update creates a revision and may interrupt a live process;
the pause mode itself does not preserve in-memory turns across a deployment.
Prefer a between-games pause when possible. Existing requests during traffic
transition may still reach the old revision; an urgent halt of malicious writes
also requires the reviewed runtime IAM containment action. Do not claim the
environment update instantly drains every in-flight request.

Rollback choices:

- **Code regression with valid data:** route 100% to the recorded revision only
  if it supports every stored schema plus the D2 cold-home guard. Preserve the
  exact project/database/namespace/origin/runtime identity. A historical revision
  keeps its historical environment; inspect it before routing traffic.
- **Uncertain code/schema compatibility or lost configuration:** deploy the
  reviewed maintenance-capable code in `paused` mode. Recover the original
  configuration from the private operator record; never invent a new namespace.
- **Corrupt or accidentally deleted data:** keep the service paused and preserve
  the original database. Restore a backup/PITR point into another database,
  validate it, review the acknowledged writes it lacks, and reconcile before
  selecting it. Database restoration is not a normal code rollback.

Resume by selecting `firestore` with the same reviewed original configuration
and known-compatible code. After recovery, verify both a converted address and a
reserved `h_…` address, not just a newly created home. Local
`tests/account-config.test.mjs` proves pause requires no storage configuration,
leaves snapshot bytes unchanged, preserves both old addresses, permits a guest
turn/rethrow and restores original data after resuming the same store.

## Local file recovery and operating limits

Stop the owned file-mode process cleanly before copying `state.json` and
`previous.json` together into a private backup. `previous.json` is a previous
transaction image, not a separately replicated backup. Keep originals when a
snapshot is malformed or a commit acknowledgement is uncertain. After a crash,
`DICE_ACCOUNT_RECOVER_LOCK=1` only recovers a provably dead same-host writer;
ambiguous locks and malformed snapshots require inspection, never deletion as a
guess. A forced process exit can correctly leave a writer lock behind.

Capacity refusals preserve acknowledged data and pending/conflicting originals.
Use the library's explicit acknowledged-history archive and invitation archive;
export retained revisions before resolving a storage limit. Do not delete
operation receipts, conflicts or reconciliation sources to make space. Home
history currently has no deletion API. Public health/account status contain no
private records; diagnose aggregate error/rate/latency signals without provider
response dumps, request bodies, recovery keys, cookies, names or per-person logs.
