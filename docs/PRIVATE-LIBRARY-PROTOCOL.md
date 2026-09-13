<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Private library protocol — D1.2

2026-09-13. API, transactional browser cache and reconciliation controller are
implemented and tested. The app now instantiates them through the optional
account/library workspace described in the D1.3 record below. Uploads start
only after an explicit comparison and choice.
No cloud resources were provisioned and no deployment was performed.

## Private document and server actions

`js/library-document.js` validates `{schema:1, profiles, dice:{defaultSet,
favorites}}`. `profiles` is the existing versioned `js/profiles.js` store,
including active profile, profile/pool IDs, systems, names, categories and dice
overrides. Names use `MAX_NAME`; pool notation uses the profile model's existing
shape contract. Dice IDs are opaque strings, including current dotted house
IDs and preserved references to unavailable skins. No renormalization or
second notation parser sits in front of a saved original. The document excludes
account identity, rooms, roll history, sharing consent and device preferences.

Every library action authenticates the cookie and compares `X-Dice-Person`
with that actual person in the same transaction. Reads require the header too:
another tab can replace a shared cookie while an old tab still has the previous
person's cache open. POST additionally requires exact Origin, JSON,
`X-Dice-Account:1` and session CSRF. The account transport serializes library
requests with cookie-changing actions and checks response identity before
returning data. No private document reaches a room API or publication helper.

| Endpoint under `/api/account` | Request and result |
| --- | --- |
| `GET /library` | Current `headRevision` and `document` (both null when never saved), version metadata including `canArchive`, total `historyBytes`, and `archivedCount` |
| `GET /library/versions/:id` | One retained original/document and its metadata |
| `POST /library` | `{operationId, baseRevision, document}`; saves an immutable candidate and advances head only if the base still matches |
| `POST /library/reconcile` | Same envelope plus `sourceVersionIds` and optional `retainDocument`; preserves the local original when it differs from the chosen result |
| `POST /library/archive` | `{versionIds, discardAcknowledgedHistory:true}`; deliberately removes eligible acknowledged ancestor documents, preserving operation digest and receipt |

An operation ID is a securely generated UUID. The revision ID is `v_` plus
that ID; an additional local original is `o_` plus that ID. Retrying the same
operation and exact canonical payload returns its original receipt, including
a conflict receipt. Reusing an ID for different content is refused. A stale
base creates a retained conflict and returns 409 with `candidateRevision` and
the head observed at the attempt; it never moves the head. Refresh the preview
before an explicit choice. A subsequent reconciliation is a new operation.

Successful saves, conflicts and additional originals are indexed on the person.
Ordinary library polling reads that index and the head document, rather than
downloading every historical document. Record/schema mismatch refuses access;
corruption is never represented as an empty library.

## Bounds and cleanup

A document is at most 480 KiB, leaving adapter-record space for metadata.
An account retains at most 100 documents and 8 MiB of document history. Capacity
refuses a new save without removing a conflict, original or acknowledged head.
The UI can offer export and explicit cleanup using `canArchive`. The head,
conflicts, retained originals, and every referenced reconciliation source are
protected; only ordinary eligible acknowledged ancestors can be archived.
The service repeats this protection check inside the cleanup transaction.

Archived versions become small receipt tombstones, so an uncertain earlier
save cannot be recreated as a different revision after cleanup. Their separate
bound is 2,000 retained documents/tombstones per account; reaching it refuses
new saves and requires export. This is an explicit first-release service cap,
not an unbounded history guarantee. There is no automatic historical eviction.
The file adapter also retains its whole-service snapshot limit; cloud capacity
and provisioning remain separate operating work.

## Browser namespace and local durability

`openLibraryCache()` opens IndexedDB database `dice.private-libraries.v1`.
Each account ID is a separate object-store key, and `guest` is its own key.
No recovery keys, cookie bearer, CSRF nonce or publication consent is stored
in this database. A cache unavailable/corrupt/quota failure is a refusal, never
an in-memory substitute claiming a durable offline save. `export(namespace)`
can retrieve a damaged raw namespace for deliberate recovery; seed cannot
replace damaged state.

An edit is acknowledged only after an IndexedDB read/write transaction commits
with strict durability requested. Separate tabs compare `workingGeneration`,
which changes only when the working document changes or a choice is applied.
The whole-state `generation` changes for preview/upload/ack metadata too and
is used for explicit choices/cleanup. Do not pass it to `edit`.

A stale tab's edit is stored as an alternate, returned with `retained:true`
and `local_conflict`, and leaves the winning working copy in place. Explicit
choice retains all compared local alternatives and the downloaded original.
Ordinary typing coalesces superseded, unsubmitted intermediate text. Uploads,
uncertain payloads, choice originals and conflict alternatives retain references
and cannot be swept by that coalescing.

An upload envelope is captured atomically in IDB before its first HTTP request.
Until a successful/conflict acknowledgement arrives, retries use exactly that
operation ID, base and document. An edit during the request changes the working
copy without mutating that envelope. A successful acknowledgement supplies the
base for the next envelope. A conflict pauses upload for explicit reconciliation.
The cache allows 128 retained document candidates, 16 MiB per namespace, and
100 upload envelopes; capacity refuses without losing kept work. Explicit server
ancestor cleanup can also release corresponding eligible local upload history.

## UI handoff

1. Capture and verify the current guest library into its own IDB namespace
   before changing the current app workspace. Preserve the existing verified
   `profiles.js`/portable export path as an independent user export.
2. In `onIdentityChange`, close the previous fixed-namespace sync controller,
   await in-flight publication, and require `resetProfileSharing()` to return
   true before adopting a different namespace. False aborts adoption. This is
   the existing account hook contract; sharing is never in the synced envelope.
3. Seed an absent account cache from the chosen local starting document; seed
   is idempotent and will return existing unsynced work. Open a controller with
   `{account, cache, personId}`. `preview()` downloads into retained cache state
   and leaves the working document unchanged.
4. Show local and downloaded libraries. Call `choose(state.generation,
   {choice:'local'|'remote'|'merge', diceChoice?, localEntryId?})` only on the
   explicit action. Different defaults need a dice choice for merge. Divergent
   profiles are added using existing unique-name/ID operations; original p1
   identities cannot collide. Read the resulting document before applying it
   to the app's active profile mirror.
5. Persist edits with `edit(workingGeneration, document)` and check its result.
   After opt-in, call `schedule()` to debounce server saves (1.5 seconds by
   default). `flush()` serializes and drains later durable edits after an
   acknowledgement, including when their timer fired while a save was pending.
   Reconnect/focus may explicitly retry `flush`; offline errors keep its envelope.
6. For 409, preview again and present the explicit conflict choice, including
   any newer local working copy. Never treat a remote snapshot or account
   recovery as permission to publish profiles. Show export/cleanup at capacity.
7. On sign-out or namespace replacement, `close()` cancels scheduled work and
   prevents response adoption; already accepted cache work and pending retry
   envelopes remain in their original namespace. Guest capture is unchanged.

## Evidence and remaining scope

`tests/account-library.test.mjs` runs in the unit lane and covers actual
catalogue/portable roundtrip, strict schema refusal, independent HTTP clients
racing one base, idempotency, identity boundaries, count/byte limits, protected
cleanup and stale local alternatives. `tests/account-api.test.mjs` recovers the
saved private library in a clean cookie jar after a real server-process restart.

`tests/account-library-browser.test.mjs` runs in both npm e2e lanes. Real Chrome
tests cover shared IndexedDB tabs, reload, isolated namespaces, aborted writes,
damaged-cache export, clean-browser recovery preview, offline retry and debounce.
A held real HTTP save proves that an edit made while its acknowledgement is
pending reaches the eventual server head without another edit, and background
metadata does not manufacture a local edit conflict.

## D1.3 — actual account and library workspace

The personal menu, People → You, and the status beside saved profiles open
**You & private library**. Account registration/recovery is optional and keeps
the table name, seat, draft and unfinished turn separate. Creating an account
does not enable library sync. The recovery key is shown for the person's
explicit copy/acknowledgment and removed from the form after use or close.

`js/library-session.js` owns the active app mirror and its exact IDB working
generation. Guest localStorage remains separate; account profiles, default
dice and favorites are captured in their fixed person namespace. Startup
with a previous account marker keeps sharing closed until identity settles.
A transition first captures accepted edits and clears sharing consent, then
waits for the final live publication withdrawal. Failed storage or a failed
live withdrawal refuses adoption and blocks old sync. A lobby/solo workspace
with no live connection has no live publication to withdraw.

The transition ticket starts before any await. An edit during withdrawal,
namespace reading or choice is retained in the previous namespace and aborts
adoption. Immediately before the synchronous app mirror swap, the controller
checks the ticket and current document again. Same-person refresh preserves
a stale tab's actual document/generation instead of adopting the IDB winner.
Cookie-changing intent suspends other same-origin tabs before the request;
HTTP still verifies the fixed account on every private operation. A boundary
epoch invalidates comparison/history UI, including late responses, and binds
Apply and cleanup to the namespace being reviewed.

Comparison shows device/account profiles, saved-roll names, default dice and
favorites. A merge with unequal defaults requires a dice choice. Local tab
alternatives can be selected explicitly. Guest alternatives use the separate
`choose-local` transaction: it is guest-only, preserves all compared originals,
checks the whole-state generation and never creates an upload or enables sync.
History export and acknowledged cleanup use the server's `canArchive` list;
head, conflict and reconciliation originals remain protected.

An offline reload can explicitly open the last durable device copy with sync
blocked until account refresh. Status distinguishes pending device writes,
kept tab alternatives, refused device writes, offline retry and acknowledged
private saves. Account service absence leaves guest rolls and downloads usable.

`tests/account-ui.test.mjs` drives the actual app in independent Chrome profiles
and shared-origin tabs. It covers real service restart/recovery, explicit merge
and dice choice, offline edits/reload/retry, edits during a held HTTP save,
sign-out and person switching, raw table privacy, stale tab choice, original
export and protected acknowledged cleanup. Actual held publication and IDB
handoffs prove late edits remain visible/exportable; a changed real cookie
with refused withdrawal blocks adoption. A held old-account preview cannot
repopulate its panel after another tab changes accounts. Guest-only conflict
choice also survives reload without sync.

`tools/steps/account-ui-look.mjs` captures populated desktop and 390 × 844
phone recovery comparison/merge choice, plus account status and history.
These are emulated Chrome device observations, not physical-device or
production-cloud evidence. Durable homes and social UI are separate slices.
