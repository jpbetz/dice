<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Optional durable service

**R1-D0 · design decision, 2026-09-13 · implementation and recovery proofs
pending.** Implements the account, library, home and social boundaries in
[People, personal dice, and persistent tables](PEOPLE-DICE-TABLES.md).
This record enables local implementation; it does not claim a cloud service
has been provisioned or a recovery prototype has passed.

**Inherited assumption to replace:** browser storage and a prepared room
can recover a person's kit and group after their browser or server is gone.
Keep browser storage as the local working copy; make deliberate remote saves
independent of both the browser and the live room process.

## 1. Decisions and what is actually available

Use an optional same-origin `/api/account/*` service, separate from the live
room protocol. Implement a real local file adapter and a Firestore REST
adapter behind the same transaction interface. The first recovery method is
a high-entropy key the person deliberately saves. Revocable, HttpOnly
cookies hold ordinary login sessions. Google sign-in is a later optional
credential for the same person record, not a first-release requirement.

The first local release needs only Node and a private directory outside the
checkout. It needs no npm package, browser SDK, OAuth registration, cloud
credential, email delivery or paid setup. Default service mode is `off`;
ordinary live and static solo play do not wait for it.

Read-only inspection on 2026-09-13 found local deployment configuration and
an accessible Cloud Run service: one maximum instance, concurrency 80,
timeout 3600 seconds, 1 CPU, 512 MiB, no volumes, and no configured durable
service/OAuth environment variables. A Firestore inventory request failed
with `SERVICE_DISABLED`; this establishes missing API availability, not an
empty database. Configuration values, account names and credentials were
not copied into this record. No resource was created or changed.

Cloud Run's ordinary writable filesystem is memory-backed and loses data
when its instance stops. The local file adapter therefore refuses to start
when `K_SERVICE` is present. Firestore is the selected production storage
path, not a file in the Cloud Run container. [Cloud Run runtime contract](https://docs.cloud.google.com/run/docs/container-contract).

## 2. Modules, switches and adapter contract

Server modules belong in `service/`, outside the static allowlist. Browser
transport belongs in `js/account.js`; pure library reconciliation and
publication helpers belong in `js/library-sync.js`. Existing `js/net.js`
continues to own live rolls, seats and room SSE.

| Configuration | Meaning |
| --- | --- |
| `DICE_ACCOUNT_STORE=off\|file\|firestore` | Explicit mode; default `off` |
| `DICE_ACCOUNT_DIR=/absolute/private/path` | Required for file mode; refuse checkout/static roots and symlinks into them |
| `DICE_ACCOUNT_ORIGIN=https://…` | Exact accepted browser origin; HTTPS required except loopback development |
| `DICE_FIRESTORE_PROJECT`, `DICE_FIRESTORE_DATABASE` | Required for Firestore; database defaults to `(default)` only when explicitly selecting Firestore |
| `DICE_ACCOUNT_NAMESPACE` | Validated opaque deployment namespace, separate for tests/staging/production |
| `DICE_GOOGLE_CLIENT_ID` | Future opt-in provider, absent in first release |

Malformed enabled configuration fails account-service initialization with a
sanitized reason and leaves live play available. A configured store that is
unavailable does not silently switch to an empty file or memory database.
`GET /api/account/status` returns only capabilities and availability:
`{enabled, available, recoveryMethods: ["key"], schema: 1}`. Static-host 404
and configured-service outage are different client states.

Adapters expose the following interface; domain code sees no paths on disk,
Google tokens, Firestore field types or SDK objects:

```js
await store.get(path); // plain record or null; read-only, no mutation
await store.transact(async tx => {
  const current = await tx.get(path); // repeat reads are stable
  tx.put(path, nextRecord);           // whole record; queued until commit
  tx.delete(otherPath);
  return result;
});
await store.close();
```

Transactions provide atomic commit and conflict detection across every
record read or written, including a missing record. The callback may rerun
on contention, so generate operation IDs, randomness and timestamps before
entering it; perform no network sends or UI effects inside it. Read all
required records before queuing writes. Limit transaction retries and
return a typed `busy`/`unavailable` error; never acknowledge an uncommitted
write. Unknown schema versions refuse without rewriting data.

**File adapter:** serialize transactions through one process queue; load a
versioned JSON snapshot at startup. Commit to a new same-directory file,
flush the file, atomically rename, then flush the directory before reporting
success. Keep the prior committed image for explicit corruption recovery;
never silently replace a malformed image with an empty store. The private
directory is mode 0700, data files 0600. Acquire an exclusive writer lock;
fail a second writer and test the documented stale-lock recovery after a
killed process. The format contains `{schema, generation, records}` with
per-record versions. This is a small single-process local adapter, not a
shared network filesystem database. Bound snapshot size and fail additional
saves visibly before exceeding it; preserve the last committed image.

**Firestore adapter:** use built-in `fetch`, REST `beginTransaction`,
transaction-bound document reads, and `commit`; retry `ABORTED` with bounded
jitter. Read/modify/write membership, invitations and their per-person
directories inside one transaction. Explicit document paths and bounded
directories avoid collection scans and a public account directory. REST
commits are atomic; write preconditions use existence/update time when
needed. The documented REST `Write` shape has no `verify` operation; do
not invent one to check a read-only dependency. [Commit API](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/commit),
[Write API](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/Write),
[Precondition API](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/Precondition).

Use an injected `fetch`/token supplier in tests. In Cloud Run, obtain the
attached service account's OAuth access token from the fixed metadata URL
with `Metadata-Flavor: Google`, cache only in server memory until near
expiry, and authorize Firestore through IAM. No service-account key file
or browser Firestore access is necessary. REST calls made as a service
account use IAM rather than end-user Security Rules; application handlers
must enforce every person/home permission. [Firestore REST authentication](https://firebase.google.com/docs/firestore/use-rest-api),
[Cloud Run service identity](https://docs.cloud.google.com/run/docs/securing/service-identity).

## 3. Identity and sessions

Person IDs are random opaque identifiers, never display names, email
addresses, profile IDs, room keys, seat IDs or `dice.who.v1`.

Creation starts with **Keep my dice across devices**. Explain that the key
grants access to the saved account and that losing every key/session leaves
no email reset. Generate 32 cryptographically random bytes, encoded as
`dt1_` plus base64url. Show Copy/Download only on that deliberate path;
require **I've saved my recovery key** before account creation and before
uploading any library. A key is not included in ordinary YAML exports,
URLs, screenshots, telemetry, console messages or persistent browser
storage. The user may intentionally save it in their password manager.

The browser generates the key using `crypto.getRandomValues`; the server
validates the exact encoding/length and stores only
`SHA-256("dice-recovery-v1:" + key) -> personId`. The random key's entropy
makes a fast hash appropriate; do not accept a chosen password or weak
fallback in this field. A clean browser sends the saved key in a JSON POST
body, receives a new session, then previews the recovered library. Failure
returns one generic invalid-key response. Disabled storage, storage errors
and malformed input cannot accidentally create a new person during login.

Create a new independent random 32-byte session bearer; store its hash,
person ID, creation/expiry time and revocation state. Production cookie:
`__Host-dice-account; Secure; HttpOnly; SameSite=Lax; Path=/`, no Domain.
Use a separately named non-Secure cookie only for explicitly configured
loopback HTTP tests. Absolute session lifetime is 30 days; recovery creates
a new session rather than making an expired cookie valid. Mutations verify
the durable session/person inside their transaction so concurrent revocation
does not authorize a later write. Sign-out revokes the current session;
**Sign out other devices** increments the person's session generation.
Key rotation requires the current recovery key again, saved-key confirmation,
and an atomic credential replacement/session revocation; no browser that
merely found an old cookie can silently replace the recovery method.

Every account mutation, including registration/login, requires the exact
configured `Origin`, JSON content type, and `X-Dice-Account: 1`; reject null
origins and cross-origin requests, expose no permissive CORS, and add
`Cache-Control: no-store`. Verify a session-bound anti-CSRF nonce on
authenticated mutations. GET is side-effect-free. Cookies/keys/JSON request
bodies and exception details never enter diagnostic logs. Responses use
fixed error codes and sanitized messages. Bound bodies, account creation,
credential attempts, sessions/person and writes/person; an IP throttle is
only supplementary because current proxy headers are not a trusted identity.

| Recovery option | Decision and tradeoff |
| --- | --- |
| User-kept random recovery key | Ship first. Fully implementable and restart-testable without an external provider. The person must keep the key; no support-mediated recovery is claimed. |
| Google sign-in | Add later to an existing person after proving both credentials, or create a person on explicit consent. Easier repeat access, but requires Google registration and third-party browser availability. Never auto-link by matching email/name. |

Google integration would require a registered client ID, authorized origins,
branding/privacy configuration and loading Google's current browser library
only when its sign-in choice is used. The official setup supports localhost
development but does not make an unregistered client work. This is a runtime
external service, even if it adds no npm dependency. [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

If built, verify signature using Google's rotating public keys, exact
audience, issuer, expiry and the one-time server nonce; bind the provider's
`sub` to a person. Reject unknown algorithms/keys and replay. Google's docs
recommend a maintained verification library; a zero-dependency verifier
therefore carries extra review/test cost and is deferred. Do not use the
debugging `tokeninfo` endpoint as a production authentication plan. Request
no Drive/Gmail access and persist no Google profile fields by default.
[Google token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token),
[Google nonce reference](https://developers.google.com/identity/gsi/web/reference/js-reference).

## 4. Records and bounded APIs

All durable records carry `schema: 1`; timestamps come from the server.
Storage paths below sit under a deployment namespace, not an account chosen
by a request parameter. Server handlers derive the caller from the cookie.

| Record/path | Initial fields and authority |
| --- | --- |
| `people/{personId}` | `displayName`, `createdAt`, `sessionGeneration`, `libraryHead`, `libraryVersionIds`, `homeIds`, `friendIds`, `incomingIds`, `outgoingIds`; self-readable directory, explicit projections for others |
| `credentials/{keyHash}` | `personId`, `createdAt`; server only |
| `sessions/{sessionHash}` | `personId`, `generation`, `createdAt`, `expiresAt`, `revokedAt`; server only |
| `libraries/{personId}/versions/{versionId}` | Immutable `{baseRevision, operationId, createdAt, document, disposition}`; caller's own account only; `disposition` marks current/conflict/retained-original |
| `homes/{homeId}` | `roomKey`, `name`, `coverId`, `revision`, `settings`, `preparedProfiles`, `memberIds`, `createdAt`, `updatedAt`; member-only durable read/write |
| `roomHomes/{roomKey}` | `homeId`; server-only unique mapping for absent-session hydration |
| `homeVersions/{homeId}/versions/{revisionId}` | Immutable saved setup revision; member-only, retained competing saves |
| `relationships/{sortedPersonPair}` | `status`, `requestedBy`, `blockedBy`, timestamps; parties only |
| `invitations/{invitationId}` | `kind`, verified `senderId`, `recipientId`, `homeId?`, `state`, `createdAt`, `expiresAt`, `resolvedAt`; parties only |

Library documents contain the existing versioned profile store, personal
dice default and favorites. They exclude live room keys, roll logs, held
values, seat credentials, offers, draft turns, account credentials and
device audio/motion preferences. Preserve stable profile IDs inside the
private account; public publication continues through the existing field
allowlist. Validate without truncating content or silently normalizing an
unknown schema. Initial limit: 512 KiB encoded document, existing 32-profile
and 40-pool limits. Report a size conflict before upload; keep local data.
Firestore's document maximum is 1 MiB, leaving space for envelope/type
overhead. [Firestore limits](https://firebase.google.com/docs/firestore/quotas).

Retain immutable library originals and conflict versions; do not prune a
kept version merely because another device became head. Start with bounded
per-person storage/version budgets and explicit archive/export/delete when
full. Debounce actual edits and ignore byte-equivalent saves; polling does
not manufacture versions. Initial bounds can be conservative (100 library
versions, 32 homes/person, 40 members/home, 100 relationships and 100 pending
invitations/person); hitting one returns a visible limit rather than eviction.

All endpoints below are relative to `/api/account`. Requests return
`{ok:true,…}` or `{ok:false,code,message}`; `401` means login required, `403`
origin/CSRF failure, `404` absent or inaccessible record, `409` revision/state
conflict, `413` body limit, `429` quota, `503` unavailable. IDs, errors and
status are not a way to enumerate another person's account.

| Endpoint | Request/result contract |
| --- | --- |
| `GET /status`; `GET /session` | Capabilities; current self projection and CSRF nonce, or anonymous |
| `POST /register` | `{recoveryKey, displayName, recoveryAcknowledged:true}` → session cookie/person; no library uploaded yet |
| `POST /recover` | `{recoveryKey}` → new cookie/person; no implicit merge |
| `POST /logout`; `POST /revoke-others` | Revoke current session; invalidate other session generations |
| `POST /rotate-key` | Current/new recovery keys and acknowledgement; atomic replacement |
| `GET /library` | `{headRevision, document, retainedVersions:[metadata]}` |
| `POST /library` | `{baseRevision, operationId, document}` → acknowledged new revision or retained conflict ID + current head |
| `GET /library/versions/:id` | Own immutable version for comparison/export |
| `POST /library/reconcile` | `{baseRevision, sourceVersionIds, operationId, document}`; preserve sources, conditionally move head |
| `GET /homes`; `GET /homes/:id` | Own homes and member-visible saved setup; no room transcript |
| `POST /homes` | Explicit capture of validated setup/cover/room key; create mapping, membership and first revision atomically |
| `POST /homes/:id` | `{baseRevision, operationId, name, coverId, settings, preparedProfiles}`; member save, retain conflicting candidate |
| `POST /homes/:id/leave` | Remove own saved-home membership; does not leave/eject a live seat |
| `GET /people`; `GET /invitations` | Permitted friendship projections and own inbox |
| `POST /friend-requests` | A short-lived same-table contact ticket or explicitly shared connection token; no name search |
| `POST /invitations` | `{recipientId, homeId, operationId}`; friend relationship and sender membership verified atomically |
| `POST /invitations/:id/respond` | `{action:"accept"\|"decline"}`; intended recipient only, idempotent; returns home card, never joins |
| `POST /invitations/:id/cancel` | Pending sender-owned invitation only |
| `POST /relationships/:id` | `{action:"accept"\|"decline"\|"remove"\|"block"}`; authorized party and legal state transition |
| `POST /presence`; `GET /presence` | Explicit short-lived presence pulse; projected permitted friends/home occupancy |

Use client-generated random `operationId` for retryable writes. Within the
transaction, persist its result with the immutable version/invitation. If a
response is lost, retrying the same operation returns the same outcome; a
different body with the same ID fails. UI actions produce IDs once, not on
each network retry.

## 5. Library reconciliation, sharing and sign-out

First connection presents the local and remote libraries before opting into
sync: **Keep this browser's version**, **Use saved version**, or **Merge
copies**. All choices retain both originals; choose the working head, not
which original to erase. For a first account with no remote head, preview
the proposed upload and require **Start syncing**. Provider login alone
never uploads or publishes the library.

Every save carries its last acknowledged head. A stale save stores a
conflict version and returns `409` with both version IDs; it does not advance
the head. Show changed profiles and personal dice choices in a comparison.
Default merge adds copies with unique names/IDs for divergent profiles;
identical versions deduplicate. If merging exceeds profile capacity, keep
both source versions and require an explicit choice/export, never slice the
array. Reconciliation also carries the current head; another concurrent
save produces another visible conflict.

**Publication must ship before remote-library adoption.** Current
`publishPools()` sends the active rack and every profile in `profileStore`
through `net.setPools()`. Replace both routes with a per-table selection of
shared profile IDs and a visible disclosure. No automatically shared active
rack remains as a back door. Downloaded/new profiles start private;
choosing a roll to perform still publishes the authored roll through the
existing privacy projection. A profile switch does not imply permission to
publish its saved library. The server's public profile allowlist stays the
boundary; account IDs and revisions are never new room fields.

Use one browser working-envelope record for `{guest, activeAccountId,
accounts:{id:{working,baseRevision,pending,syncOptIn}}, sharingByRoom}` so a
sign-out cannot half-copy the account rack into guest storage. Migrate the
existing profile key by writing/verifying the envelope first; retain the
old source until successful. Account caches are namespaced, never shown to
another signed-in identity, and never auto-published. Do not describe local
browser caches as encrypted or safe from someone with the same OS/browser.

Saving status follows acknowledgement: **Saving**, **Saved**, **Offline —
changes kept here**, **Needs attention**. Sign-out freezes remote writes
before clearing the cookie, restores the guest workspace, and retains any
unsynced account copy with an explicit recover/export route. If logout
cannot reach the service, record a local signed-out latch so an old cookie
does not silently reopen/sync on reload; reconcile revocation when service
returns. Clearing this-device data requires an explicit action and warns
only when an unsynced copy is at stake.

## 6. Homes, friends, invitations and presence

Saved-home data permissions never become gameplay roles. All members may
save setup revisions, invite friends and leave membership; no member may
take another player's seat or reveal. For the first version, members leave
themselves; there is no member-eject role. An empty membership set keeps a
tombstone/address reservation until an explicit retention/deletion policy
is implemented, rather than letting another account claim its identity.

For initial home creation from an existing room, require a current live-seat
credential and copy the validated live setup. An unoccupied ordinary room
can be made a home by deliberate creation; mapping uniqueness prevents two
different homes for the same key. Home IDs and room keys are distinct;
opening the saved card uses its existing random address. A guest who knows
that address may still join and sees the public session setup. Member-only
data means the durable membership/revision directory, not a promise to hide
the playing surface from invited guests.

Before `handleJoin` creates a missing room, resolve its home mapping and
saved setup. Deduplicate concurrent first joins using a promise keyed by
room key, then recheck `rooms` after the await. Construct one room and apply
the saved setup exactly once before seating the first guest/member. Existing
rooms bypass storage and never reload an older saved revision. Saved-home
lookup failure returns a retry state; it must not create an empty replacement.
Use a reserved generated prefix for newly created home room keys so a cold
server can distinguish an unavailable home from a new ordinary guest room.
Converting an older arbitrary room key requires its mapping lookup; during
outage new joins to such absent keys must conservatively retry. Existing
live rooms and explicitly new guest rooms continue working.

Initial home persistence excludes unfinished turns, values, log entries,
offers, player credentials and ephemeral seating. A restart loses those
live-session facts; clean-browser account recovery receives no authority
over old private dice. Retain current `dice.who.v1` continuity without
promoting it to an account login. Contact at a live table uses a server-side
mapping verified through an account session plus live-seat credential; the
room roster need not expose person IDs. Contacts return opaque expiring
tickets scoped to the requesting person and target; acceptance establishes
the relationship. Deliberately shared connection links may redeem a
single-use friend-request token, never a library or login credential.

Invitation transitions are pending → accepted/declined/cancelled/expired.
Enforce expiry on every read/action using server time; cleanup scheduling
does not define validity. Accept atomically checks recipient, pending state,
friend/block state and sender's current membership, then adds home membership
and resolves the invitation. Retry of an already accepted invitation returns
the same result only to its recipient. Removal/block stops subsequent social
contact/presence and invalidates pending contact from the blocked party;
it cannot revoke a room address already learned. **Join now** is a separate
user action. Initial inbox transport is bounded polling while People is
visible or on focus, with backoff, not a second always-open stream.

Presence is ephemeral in the live service, outside the durable snapshot:
authenticated client pulses every 25 seconds while participating, expires
after 75 seconds and is immediately cleared on successful sign-out. Test
with injected clock/short intervals. Require explicit presence sharing,
check current relationship/membership before projection, and aggregate
multiple devices by person. A service restart shows **Unknown** until new
pulses, not a historical online count. Room occupancy comes from the current
room's liveness-checked players, with no roll information. Never infer
presence from an open proxy socket; the existing production incident and
`/api/pong` mechanism are recorded in [deployment guidance](DEPLOY.md).

## 7. Deployment, operating cost and external work

The implementable production adapter remains disabled until a Firestore
Native/Standard database exists, the Firestore API is enabled, a dedicated
Cloud Run service account has suitable database IAM permissions, and the
service configuration selects the adapter and exact HTTPS origin. Deny
direct unauthenticated/client Firestore access. These are external
provisioning steps, not effects of running local tests. Do not copy user
libraries from a developer's local adapter into production automatically.

Firestore currently includes one free database/project, 1 GiB stored,
50,000 reads/day, 20,000 writes/day and 20,000 deletes/day. Those are
allowances, not a cost guarantee or spending cap; backups, restore, PITR and
TTL deletion have separate billing. The selected design does not need TTL
to enforce security expiry or write presence continuously. Estimate actual
record reads/writes from the test workload before enabling production and
extend the existing billing alert to this service. [Firestore quotas and billing limits](https://firebase.google.com/docs/firestore/quotas).

Retain `max-instances=1` for live sessions; durable transactions tolerate
overlapping revisions but do not repair split in-memory gameplay. Deploy
between sessions using the existing runbook. Account health is counts/state
only. Never emit provider response bodies, snapshot dumps, key hashes,
record IDs, names or per-person operation logs. Add a sanitized service
error boundary before the server's generic `err.message` logger.

Cloud readiness requires a separate staging account/home recovery after
the old revision is stopped, permission-denial checks and a backup/restore
drill. A passing fake-Firestore test proves protocol handling, not production
IAM, database creation, billing or Google sign-in. Local file backups and
the app's explicit YAML exports are different artifacts; private service
snapshots must never be served, uploaded with Cloud Build, or committed.

## 8. Coding queue and proofs

| Assignment | Owned surfaces | Required proof before advancing |
| --- | --- | --- |
| **D0.1 — adapters and domain core** | New `service/store-file.js`, `service/store-firestore.js`, shared validators/transactions; new Node tests; isolated worktree | Real temporary-directory persistence across killed/restarted processes; atomic conflict/rollback; second-writer refusal; corruption preserves original; remote adapter protocol contract and transport failure injection |
| **D1.1 — recovery API** | New account core/routes plus minimal `server.js` wiring; `js/account.js` transport, no UI redesign | Independent cookie jars register/recover after restart; expiry/revocation/CSRF/unauthorized reads; no secrets in captured logs; off/outage leaves guest rolls working |
| **D1.2 — private kit and sync UI** | Library envelope, explicit profile sharing, reconciliation state; personal editor/library UI | Two clean browsers exchange opted-in data; old-base/offline conflicts retain both; recovered profiles absent from another player's raw snapshot; sign-out/cache separation and quota failures |
| **D2.1 — homes** | Home API and absent-room hydration; Tables cards/save action | Clean browser restores name/key/setup after server restart with no old client repush; concurrent guest first joins agree; occupied room unchanged; nonmember writes and unavailable-home fallback rejected |
| **E.1 — social return** | Contact tickets, friend/invite API, inbox and permitted presence UI | Offline friend receives invite after restart; accept/decline/cancel/expiry/retry/block/recipient isolation; accept never navigates; presence expires after abrupt tab close |
| **D0.2 — production adapter enablement** | Provisioning runbook/config once independently authorized/available | Real staging IAM and cloud restart/restore checks; report separately from local completion |

**Next concrete coding assignment:** D0.1 in an isolated worktree, beginning
with the adapter contract, file transaction implementation and restart/crash
test harness; then implement Firestore against an injected protocol fixture.
Do not touch the main session's UI files or preview port 8123. Use ephemeral
ports and private temporary directories for every server proof.

After API proofs, inspect the named moments on desktop and 390 × 844 phone:
save-key acknowledgement with the key hidden in captures, recovered-library
comparison, conflict resolution, sign-out with pending edits, unavailable
saved home, and received invitation → explicit Join now. Capture the moment,
not merely its green test. Real-device observation and cloud provisioning
remain separately identified evidence until performed.
