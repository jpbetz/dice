<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# HTTPS staging account verification

`tools/staging-account-verify.mjs` exercises the deployed browser modules and
account API using three newly generated fixture identities. It does not start
or stop a server, manage cloud resources, access an existing browser profile,
or accept pre-existing account credentials. Only the owned fresh Chrome
processes are closed. Node 22–24 and an already installed Chrome are required;
there is no package installation or build.

The CLI requires an explicit canonical HTTPS origin, exact `/health` SHA,
operator-recorded revision label and private journal path. Its target allowlist
is the dedicated `dice-accounts-stage…run.app` service family; production,
loopback, non-HTTPS, paths and non-default ports refuse. The local test alone
calls the internal loopback option, on ephemeral ports other than 8123.

## Operator sequence

Set the following shell variables from reviewed deployment records. The origin
and revision labels are explicit inputs, not discovered or changed by this tool.
Use the canonical configured origin, not a traffic tag or another cookie host.

```sh
export DICE_STAGE_ORIGIN=https://REVIEWED_STAGE_SERVICE.run.app
export DICE_STAGE_SHA=REVIEWED_EXACT_HEALTH_SHA
export DICE_STAGE_BEFORE=REVIEWED_SERVING_REVISION
export DICE_STAGE_AFTER=REVIEWED_REPLACEMENT_REVISION
export DICE_STAGE_PROOF_DIR=/ABSOLUTE/PRIVATE/OUTSIDE/CHECKOUT
umask 077
mkdir -p "$DICE_STAGE_PROOF_DIR"

node tools/staging-account-verify.mjs prepare \
  --origin "$DICE_STAGE_ORIGIN" --sha "$DICE_STAGE_SHA" \
  --journal "$DICE_STAGE_PROOF_DIR/source.json" \
  --revision "$DICE_STAGE_BEFORE"
```

Prepare writes the generated recovery keys into a private journal **before**
registration, and saves exact library operation envelopes before requests. It
finishes with all fixture browser profiles closed. Exit 0 and
`phase: prepared` in the journal are required before proceeding. Keep the
journal: losing it loses access to these fixture accounts. Never commit, upload,
paste or print its contents. Stdout contains aggregate check names only.

Before verify, preserve an immutable prepared journal copy. This exclusive copy
command refuses to overwrite an earlier record:

```sh
node --input-type=module -e '
  import fs from "node:fs";
  fs.copyFileSync(process.argv[1], process.argv[2], fs.constants.COPYFILE_EXCL);
  fs.chmodSync(process.argv[2], 0o400);
' "$DICE_STAGE_PROOF_DIR/source.json" "$DICE_STAGE_PROOF_DIR/prepared.json"
```

The operator now records a PITR/backup point **after prepare completed and before
verify starts**, replaces the serving revision with the same reviewed source,
and confirms the old live process/streams are gone. For whole-minute PITR, wait
until a supported whole-minute point is later than prepare completion. Record
the actual point and cloud revision/traffic evidence outside this tool. A
different revision label supplied to the CLI is required but is not independent
proof of a Cloud Run replacement: `/health` exposes SHA and uptime, not revision.

```sh
node tools/staging-account-verify.mjs verify \
  --origin "$DICE_STAGE_ORIGIN" --sha "$DICE_STAGE_SHA" \
  --journal "$DICE_STAGE_PROOF_DIR/source.json" \
  --revision "$DICE_STAGE_AFTER"
```

Verify uses new empty Chrome profiles and recovers the three generated
identities through actual account controls. Allow about three minutes locally;
the presence expiry leg waits the real 90-second lease without a clock override.
On exit 0, inspect the five PNGs under `source.json.images/`: phone library
comparison and explicit adoption, both saved homes, accepted invitation before
Join, and the shared recovered result. Screenshots are captured only at
non-secret fixture moments; keys/contact codes are never photographed. The
journal and PNGs remain private (0700 directories, 0600 files).

## Independently restored origin

Restore/clone the prepared point into a different database and enable a separate
reviewed staging service with that data, exact source SHA and correct canonical
origin. Those cloud actions belong to the operator. Use a new copy of
`prepared.json`, never a verified or partially used journal:

```sh
export DICE_STAGE_RESTORED_ORIGIN=https://REVIEWED_RESTORED_STAGE_SERVICE.run.app
export DICE_STAGE_RESTORED_REVISION=REVIEWED_RESTORED_SERVING_REVISION
node --input-type=module -e '
  import fs from "node:fs";
  fs.copyFileSync(process.argv[1], process.argv[2], fs.constants.COPYFILE_EXCL);
  fs.chmodSync(process.argv[2], 0o600);
' "$DICE_STAGE_PROOF_DIR/prepared.json" "$DICE_STAGE_PROOF_DIR/restored.json"

node tools/staging-account-verify.mjs verify \
  --origin "$DICE_STAGE_RESTORED_ORIGIN" --sha "$DICE_STAGE_SHA" \
  --journal "$DICE_STAGE_PROOF_DIR/restored.json" \
  --revision "$DICE_STAGE_RESTORED_REVISION" \
  --restored-from "$DICE_STAGE_ORIGIN"
```

Default verify requires the original origin. `--restored-from` is verify-only,
must exactly match the journal's immutable `origin`, and requires a different
allowed HTTPS target. The journal records `verificationTarget` separately; it
never rewrites the original source binding. The same fixture keys, library
versions, home addresses and pending invitation must exist in the clone.

Verify mutates its target fixtures: it creates new sessions/fresh guest tables,
adopts a private library, hydrates homes, accepts the pending home invitation,
adds a shared roll, changes presence, and revokes A's other sessions. A clone
point taken after any of those changes is **not** the prepared fixture state.
The clone/source journals and screenshot directories must remain separate.

## What the proof establishes

| Action | Driver and assertions |
| --- | --- |
| Account creation/recovery | Actual pointer/keyboard controls; clean cookie jars; Secure, HttpOnly, SameSite=Lax, host-only cookie; identity recovery alone does not replace a private library. |
| Library conflict | Two independent real HTTPS sessions make concurrent API writes from the same base; exactly one conflicts; immutable originals and exact retries survive; same operation/different payload refuses. API prepares this fixture, then actual phone controls explicitly choose the recovered account library. |
| Saved homes | Actual Tables controls convert the occupied guest address and reserve another home; after replacement, actual Join restores both addresses and public Copper/close setup without old rolls or private profiles. |
| In-app invitation | Actual People controls create a contact code, accept a fixture partner's API-prepared friend request and send a home invitation while the recipient browser is closed. On return, actual phone **Accept for later** preserves a secret turn/seat/library; a separate Join then shares a complete film and the same values. |
| Negative access | Unrelated fixture account cannot read another private library/home, accept another recipient's invitation, or see presence; missing expected-person and CSRF checks refuse. Public join state contains no private library. |
| Presence/revocation | Bounded fixture API actions distinguish online consent from home-location consent, require a current live seat, withdraw, revoke another recovered session, and observe real lease expiry. This is backend HTTPS evidence, not a claim that this script clicks Presence controls. |

The verifier leaves a bounded fixture dataset (three accounts, two homes, one
friendship, one home invitation and retained library versions). It does not
delete accounts or cloud data; no supported account-deletion API is invented for
cleanup. Retain or remove the dedicated staging database only through a separate
reviewed operator action. It never messages or invites a real person.

A failed phase records only its stage name and retains its private journal.
Partial phases refuse automatic replay. Inspect the stage and known fixture
state before deciding on a new fixture or deliberate recovery; do not reset the
phase and blindly repeat mutations. A process crash may similarly leave
`preparing` or `verifying`; prepared snapshots remain the restore source.

## Local rehearsal

```sh
node tests/staging-verifier.test.mjs
```

This targeted test uses a disposable private file store, an owned HTTPS proxy,
and an ephemeral certificate made with already installed OpenSSL. Node trusts
only that test certificate; the owned Chrome wrapper trusts its specific public
SPKI. It runs the same prepare/verify driver across a real backend process
restart and checks target guards, source-binding refusal and private file modes.
It manages no cloud resource and does not establish cloud durability. Optional
`DICE_STAGING_PROOF_DIR=/tmp/NEW_PRIVATE_DIRECTORY` retains only the five fixture
PNGs for inspection; all recovery data and browser profiles are removed.

The local and deployed proofs complement the
[operating runbook](ACCOUNT-OPERATIONS.md). They do not replace database IAM,
restrictive direct-client rules, backup/PITR records, revision/traffic evidence,
maintenance/rollback checks or the normal release gates.
