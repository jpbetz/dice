<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Relationships, invitations and permitted presence — D3 design

2026-09-13. Relationships/inbox, permitted presence and their client transport
are implemented (D3.1–D3.3), together with the People workspace described below.
Deployment remains separate. Implementation and tests use newly created
fixture accounts only.

## Decisions

The inherited assumption to replace is that sending another room URL is the
whole return experience. An accepted connection gets a durable, private inbox;
accepting a named table invitation adds membership. **Accept and join** then
explicitly enters the table; **Accept for later** leaves **Join now** available. Nothing in this slice sends email, notifications to an external
application, or invitations to real people during development.

First connections use an intentionally shared contact code, not a global name
search and never a recovery key. The authenticated owner enables a fresh code;
another authenticated person submits it to create a recipient-bound friend
request. The owner sees that person's account-provided display name and chooses
Accept or Decline. Sharing a code authorizes a request, not immediate friendship.
The same narrow mechanism can be offered beside an already-known table person;
the first service does not infer account ownership from a seat name or disclose
account IDs in the public roster.

Only mutual friends can send saved-home invitations to one another. The inviter
must currently be a member of the named home. An invitation is addressed to one
person; accepting it checks the recipient, the still-current friendship and the
inviter's current membership, then updates home/member directories atomically.
It changes no live seat, roll, room settings or navigation. A stranger knowing
the invitation ID cannot read or accept it. Invited guests can still use ordinary
room links, which convey no durable membership.

Removing a connection stops social contact and presence immediately. A new
connection requires a newly shared code issued after removal. Blocking adds a
private refusal until explicitly unblocked; unblocking does not restore the
friendship or old invitations. Removal/blocking changes no existing home
membership and cannot retract a guest address already learned.

## Records and limits

Keep the adapter's existing small get/put/delete transaction contract. All
records are strict schema-checked and all reads precede writes. Corruption
refuses; it never becomes an empty friend list or inbox. Once social storage is
initialized, an account marker distinguishes a missing directory from an
untouched account. Operation retries validate their recorded projections before
returning a historical receipt.

| Record | Content and ownership |
| --- | --- |
| `socialPeople/<person>` | Bounded friend IDs, blocked IDs, incoming/outgoing invitation indexes, contact-code hash/expiry, operation receipt index and per-day send quota. Private to that person. |
| `relationships/<hash(sorted pair)>` | Pair IDs, friendship state, generation, removal time and private blocker IDs. Both sides' directories change in the same transaction. Generation invalidates older pending social contact after removal. |
| `contactCodes/<hash(code)>` | Owner, issue/expiry time. One active code per person; rotation removes the old lookup. Only hashes are stored. |
| `invitations/<derived person+operation ID>` | Kind (`friend`/`home`), authenticated sender and intended recipient IDs, optional home ID, relationship generation, state, creation/expiry/action times. No live-room snapshot or arbitrary message body. |
| `socialOperations/<person>/operations/<operation>` | Request digest and sanitized receipt. Same operation with different input refuses. Exact retry returns the original outcome without duplicating a request or membership. |
| `presence/<person>` | At most twelve current session markers: session hash/generation, expiry, optional permitted home ID. No seat credential, roll data, private library, or persistent last-seen history. |

Initial quotas: 32 friends, 128 privately blocked identities, 32 pending incoming
and 32 pending outgoing invitations, 16 newly sent requests/invitations per
person per day. Use at most 20 cards per inbox page; a transaction reads at most
20 invitation records plus each card's allowed person/home projection, leaving
room within the 128-record adapter limit. Invitation creation fails safely when
the recipient's capacity is full, without disclosing their private counts.

Contact codes and pending invitations expire after seven days. Reads derive an
expired/cancelled state from time, relationship generation and membership even
before any cleanup write; a stale pending record can never regain authority.
Terminal inbox rows can be explicitly archived without deleting the other
person's copy. Keep their minimal state/digest receipts to make late retries
safe. The first receipt bound is 2,000 operations per account; refuse at capacity
with existing contact/invitation export available. This is low-frequency social
action history, not presence heartbeats or edit autosaves. A later receipt
retention window requires a non-replayable old-operation cutoff before deleting
receipts; do not silently recycle operation IDs in this slice.

The contact-code generator uses the browser's cryptographic random source and
a distinct `dc1_` prefix with 32 random bytes. The client retains the freshly
generated code through request confirmation so uncertain retries can resend the
same action; it is never a recovery credential or account permission. The
service stores its digest only. UI may copy an intentional redemption link or
code; raw codes go in POST bodies, not HTTP query strings or logs.

## API and client boundary

All routes use `/api/account`, the existing serialized account transport,
expected-person header on every read/write, and Origin/CSRF on every mutation.
Action inputs are closed allowlists. Every social mutation except heartbeat
holds its operation ID across uncertain retries; no UI success is announced
before a durable receipt. Domain refusals are values, so store exceptions stay
sanitized.

| Route | Proposed client method / effect |
| --- | --- |
| `GET /people` | `people(personId)` → accepted friends and own blocked IDs; explicit allowed identity projections only |
| `GET /people/blocked?after=...` | `blockedPeople(personId,{after})` → up to 32 blocked account names and a next cursor; only the authenticated person's blocked directory |
| `POST /people/contact-code` | `setContactCode(personId,{operationId,code})` → issue/expiry confirmation; `code:null` revokes the current lookup |
| `POST /people/requests` | `requestFriend(personId,{operationId,code})` → private friend-request receipt addressed to the code owner |
| `POST /people/:id/remove` | `removeFriend(personId,id,{operationId})` → symmetric removal and relationship-generation advance |
| `POST /people/:id/block` | `blockPerson(personId,id,{operationId,blocked})` → private block toggle; block also removes friendship |
| `GET /invitations?direction=incoming&after=...` | `invitations(personId,{direction,after})` → bounded incoming/outgoing page, opaque cursor, named account cards |
| `POST /invitations` | `inviteHome(personId,{operationId,toPersonId,homeId})` → pending home invitation for an existing friend |
| `POST /invitations/:id/respond` | `respondInvitation(personId,id,{operationId,choice:'accept'|'decline'})` → terminal state; only intended recipient |
| `POST /invitations/:id/cancel` | `cancelInvitation(personId,id,{operationId})` → pending cancellation; only sender |
| `POST /invitations/:id/archive` | `archiveInvitation(personId,id,{operationId})` → hide this person's terminal row; never discard unresolved pending contact |
| `POST /presence` | `setPresence(personId,{online,homeId?,room?,playerId?})` → current-session marker only, or removal when `online:false` |
| `GET /presence` | `presence(personId)` → allowed current signals for mutual friends |
| `GET /homes/:id/presence` | `homePresence(personId,id)` → only members explicitly sharing this home, visible only to its current members |

Friend-request Accept is idempotent under simultaneous responses from separate
devices; it creates one mutual relationship. A competing Decline/Cancel does
not undo an already accepted action. Home acceptance updates both the recipient
home directory and the home member list in one transaction. A full home/account
refuses without falsely accepting. A refused capacity action leaves the invitation pending and makes no grant.
After resolving capacity, the UI asks for a fresh explicit action; uncertain
retries retain their original ID. Duplicate existing membership does not create a duplicate or change
gameplay rights.

The blocked-account name page resolves only IDs already in the authenticated
person's blocked directory and checks the relationship plus both directories
before returning each `{id,displayName}`. It remains usable after invitation
archive, device reload or account recovery; unblocking does not restore a
friendship. A page touches at most 99 storage records including authentication,
independent of the account's 32 friends and up to 128 blocked IDs. `after` must
name an entry still in this same blocked directory; an invalidated cursor asks
the UI to refresh instead of looking up an arbitrary account. GET uses the
existing expected-person and origin checks, and POST is refused.

Inbox cards contain invitation ID/kind/state/times, an allowed other-person
projection, and, for home invitations, its current name/cover and stable home
ID. Accepted invitations can expose the room address through the member's home
card. No arbitrary sender URL is accepted as a destination. An inbox refresh is
read-only and cannot accept, join, import a library, publish profiles or alter an
active turn. Initial delivery is ordinary polling while the People workspace is
visible, avoiding a second broad event stream; offline contacts still retain a
durable inbox.

## Presence contract

Presence is an explicit per-device option. A visible opted-in tab refreshes at
most every 30 seconds; a marker expires after 90 seconds. Hidden/closed tabs stop
renewing and best-effort withdrawal is only an optimization. Failed reads show
`unknown`, not a cached “online” assertion. Heartbeats are a bounded replacement
of the current session marker and do not create operation receipts.

Mutual friends may see a current online signal. A saved-home location (through the separate home-presence route) requires
an additional explicit choice, current membership and a server-verified current
live-seat credential for that home at heartbeat time. The stored marker contains
only the validated home ID. A home member sees only other members who opted to
share that home, labelled as members sharing presence; it is never advertised
as the whole table's occupancy. Arbitrary guest locations are not published.

Readers recheck current mutual relationships/membership and current account
session generation/hash membership. Sign-out, recovery that revokes devices,
key rotation and removal/blocking therefore invalidate a signal immediately,
without waiting for TTL cleanup. Expired signals reveal no historical last-seen
timestamp. Twelve markers per person cover the existing session cap. Reading 32
friends or home members requires at most 96 relationship/person/presence records plus the
authenticated directory and home, fitting one bounded transaction.

Service failure never enters the roll path. No-service UI keeps the current
table roster and guest-link invitation usable, and labels durable contacts or
presence unavailable. Guest/public room payloads gain no social identifiers.

## Bounded implementation assignments and evidence

1. **D3.1 relationships and inbox.** New `service/social.js`, narrow account
   dispatch/router methods, serialized client methods, and fixture-only API
   tests. Establish code request → recipient Accept → friendship; send an offline
   home invitation, restart the process, recover a clean cookie jar, inspect the
   named inbox, accept and read the same home. Prove third-person isolation,
   expected-person/CSRF failures, concurrent accept/decline/cancel, changed
   operation input, expiry, capacity, removal/blocking and unchanged live seats.
2. **D3.2 presence.** Independent pure expiry/permission projection and bounded
   markers, one current-seat validation bridge, heartbeat client helper. Use an
   injected clock for expiry and real sessions for revoke/sign-out checks. Prove
   no signals without explicit choice, no private guest location, no account ID
   or hidden-roll information in room snapshots/inbox/presence, and outage
   fallback. No wall-clock sleeps for expiry tests.
3. **D3.3 browser contract and UI handoff.** Separate real browser cookie jars
   and a server restart prove offline receipt → acceptance → explicit network
   join. Holding a live seat while refreshing/accepting must leave that seat and
   open turn untouched. Hand stable client methods and snapshots to the People/
   Tables UI agent; final desktop/phone UI captures belong to that composed
   slice, not a protocol-page screenshot.

No production completion claim follows from fixture proofs. Firestore resource
provisioning, deployment and real user invitations remain outside this work.

D3.1 automated evidence: `tests/account-social.test.mjs` is in the unit lane.
Its eight tests cover a real process restart and clean cookie jar, two-client
response/cancellation races, stale acceptance retries after leave/removal,
rotation/blocking, recipient/CSRF/namespace isolation, corruption and guest play,
injected-clock expiry/quota, 20-row pagination, archive and a full account home
directory. Browser UI proof is not claimed by these API tests.
The two blocked-name tests additionally cover archive/restart recovery, explicit
unblock, a complete 32-name page and remaining page, a measured 99-record bound,
and unauthenticated, wrong-person, cross-origin, malformed-query and wrong-method
refusals. An unowned cursor touches no unrelated person's record.

D3.2 automated evidence: the five `tests/account-presence.test.mjs` tests are in
the unit lane. They prove independent online/location consent, membership and
current-seat checks, removal while a home remains shared, session revocation,
recovery that revokes other devices, sign-out/key rotation, marker expiry and
corruption, bounded renewal writes, hidden-tab withdrawal and unknown-on-failure.

Successful register/recover atomically withdraws the previous cookie session's
presence marker while preserving that old authentication session. A real HTTP
cookie jar proves the marker is gone even when Set-Cookie arrives and the
response body is lost. `createPresenceHeartbeat` in `js/presence.js` is off until
`setSharing({online:true,...})`; it renews only while visible. On account adoption,
call `close({withdraw:false})` to stop it without enqueueing a request behind the
account transport callback that is currently adopting the identity. Ordinary
panel/device shutdown may await `close()` for a best-effort withdrawal. Expiry
and session validity remain the fallback when a tab cannot send that request.

D3.3 browser evidence: `tests/account-social-browser.test.mjs` is in both e2e
lanes. Independent Chrome processes establish a connection, take the recipient
offline, send a fixture invitation, restart the server, and recover from clean
browsers. A secret three-throw turn keeps its seat and successfully rethrows
after acceptance. Joining the named home is a later explicit action; its live
snapshot contains no account identifiers or previous secret turn. Presence is
absent until an explicit choice and disappears after connection removal.
These protocol pages do not claim that final People/phone UI is shipped.

Display names are authenticated account-provided labels, not independently
verified real identities. UI copy must not describe them as “verified people.”


## People workspace and device boundary

`js/social-session.js` uses `librarySession.socialAccess()` for a fixed person
and identity epoch. Recovering an account does not enable library sync or
presence. The live roster and guest-link invitation remain available without an
account; People adds Friends, Invitations and Presence tasks for a recovered
person. Pending received invitations appear first and label the Invitations tab.
**Accept for later** refreshes authoritative friendship/home membership without
navigating. **Accept and join** combines confirmed acceptance with an explicit
join, checking fresh membership and the originating workspace visit before
navigating. Closing and reopening People cancels that pending navigation. The
separate **Join now** remains available after acceptance. This supersedes the
initial UI rule requiring two separate actions for every accepted invitation.

Every social write first commits its exact operation ID and payload to the
strict IndexedDB journal in `js/social-journal.js`. The per-person limit is
32 records / 256 KiB. Uncertain replies remain exact retries across reload;
failed device commits send no HTTP and keep one explicit in-memory export per
person until that page closes. Switching accounts hides previous names, codes,
comparisons and journals without removing those originals. Confirmed device
receipts require acknowledged cleanup. Definitive refusals additionally require
Download before explicit abandonment; uncertain writes cannot be abandoned by
this path. Device downloads disclose that kept requests can contain contact
codes. Recovery keys never enter this journal or export.

Online and current-home location use independent opt-ins. A relationship change
invalidates pending presence reads and clears displayed markers immediately.
Expired signals repaint to Unknown without a successful refresh. Failed or stale
home projections say Unknown, not an empty membership assertion. Invitation
expiry likewise removes Accept without needing another read. Account changes
synchronously stop the old heartbeat without enqueueing an identity-hook request.

`tests/people-ui.test.mjs` drives hit-tested pointer/text input through account,
friend, invitation, presence, retry and cleanup controls. The scenarios cover an
offline recipient, actual service restart, clean-browser account recovery,
acceptance while retaining a secret unfinished turn, explicit Join, response
expiry, held pre-block presence, independent location choice, failed home reads,
real IDB failure/reload/retry, same-origin cookie replacement, sign-out,
Decline/Cancel/Archive, and service-absent phone play. Debug hooks and scoped API
calls arrange data or held background reads; user actions use visible controls.
`tools/steps/people-ui-look.mjs` reproduces populated desktop and 390 × 844 phone
views, plus return to the four-player table with actual mesh bounds measured.

These are local service/UI proofs. No production resources or real-person
invitations were created. There is no email delivery, global name search, push
notification service or claim of independently verified account names.
