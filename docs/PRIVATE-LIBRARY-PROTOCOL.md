<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Private library protocol — D1.2

2026-09-13. API, transactional browser cache and reconciliation controller are
implemented and tested. This is the contract for the account/library UI slice;
the app does not yet instantiate these modules or automatically sync anything.
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

Next is the visible account/recovery, comparison/conflict, saved-history cleanup
and sync-status UI with desktop/phone screenshots, followed by durable homes.
The present browser tests exercise the protocol on a minimal fixture page;
they do not constitute completed app UI, real-device, or production-cloud proof.
