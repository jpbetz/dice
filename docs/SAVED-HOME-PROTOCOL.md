<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Saved table homes — D2 protocol

2026-09-13. The optional service captures named shared setups, retains immutable
versions and competing saves, lists account membership, and restores a cold
table before joining it. API/network integration is implemented. Tables UI,
visual captures, real invitation entry into membership and cloud deployment
remain later work. No real invitations were sent or resources provisioned.

## Authority and captured data

Saving the current room requires an authenticated explicit action, the expected
person header, session CSRF, and a current live-seat credential. The capture
endpoint returns a review document and `captureRevision`; Save must echo that
revision. A setting/setup change after capture produces `capture_changed`, so
the UI refreshes the comparison and waits for the next explicit Save action.
An account may also create a new named home from current default settings.

The only snapshot is `{schema:1, settings, setup}`. The bridge in `server.js`
uses its existing settings and prepared-profile validators, including the
current venue/felt catalogue. It compares the validated result without changing
stored content. Setup is the public prepared table, not the personal profiles
currently published by players. No player credentials, account libraries,
private dice, results, log, offers, seating, turns or breakouts are captured.
Unknown or corrupted saved state refuses restoration; it never becomes empty.

Initial membership belongs to the saving account. All members have the same
durable setup rights; none gain another player's gameplay rights. Reads and
writes require `X-Dice-Person` to match the authenticated cookie. Membership
never changes the shared roll/redaction paths. Any guest holding the room
address can join its public playing surface.

## API and client methods

All routes below are under `/api/account`, share the existing Origin/CSRF
boundary and are available through `js/account.js`'s serialized transport.
Operation IDs are secure UUIDs supplied by the caller and held across retries.

| Route | Client method and input |
| --- | --- |
| `GET /homes` | `homes(personId)` → own home cards |
| `GET /homes/:id` | `home(personId,id)` → card, current document and version metadata |
| `GET /homes/:id/versions/:revision` | `home(personId,id,revision)` → retained document |
| `POST /homes/capture` | `captureHome(personId,{room,playerId})` → public document and content revision for review |
| `POST /homes` | `createHome(personId,{operationId,room,playerId,expectedCapture})` converts this same address; alternatively `{operationId,name}` creates a reserved new home |
| `POST /homes/:id` | `saveHome(personId,id,{operationId,baseRevision,room,playerId,expectedCapture})` captures current public setup for future returns |
| `POST /homes/:id/reconcile` | `saveHome(personId,id,{operationId,baseRevision,sourceVersionId},{reconcile:true})` explicitly chooses a retained version for the saved head |
| `POST /homes/:id/leave` | `leaveHome(personId,id,{operationId})` removes only this account's membership |

Cards contain `id`, `roomKey`, `name`, `coverId`, `cover:{venue,felt}`,
`headRevision`, `memberCount`, `createdAt` and `updatedAt`. Venue designs select
their venue as the cover; ordinary tables select their felt. Private membership
IDs are not added to guest payloads. The guest snapshot only gains the public
boolean `savedHome:true`.

A stale `baseRevision` saves a separate conflict document and returns
`home_conflict`, `candidateRevision` and current `headRevision`. A fresh base
advances the saved head. Neither action reapplies settings to an occupied live
room: the live table is already independently editable by every player. A
reconciliation likewise changes future saved setup only. Source documents remain
available for export and further comparison.

Revision IDs include a cryptographic derivation of home ID, authenticated person
and operation ID. Two different members choosing the same operation ID cannot
overwrite one another's version. The transaction checks that the new version
key does not already exist before writing. A per-person operation record retains
the digest and exact receipt; same payload retries return it even after restart
and after the original live seat is gone. A changed payload under that operation
ID is refused.

The first bounds are 32 homes per account, 32 members per home, 100 retained
versions / 8 MiB of version documents per home, a 400 KiB document, and 1,000
operation receipts per account. At capacity Save refuses and the existing
head/originals stay intact. Export is available through the retained-version
read route and existing portable table format. This slice has no automatic
home-history deletion. Leaving the last membership preserves a closed address
reservation; an old URL is never reassigned to another account or empty room.

## Cold joins, outage boundary and new guest tables

New homes use reserved random `h_…` addresses. Converting an existing room
keeps its current address and writes a unique durable mapping. Before creating
an absent room, `/api/join` resolves that mapping, sharing one pending lookup
between simultaneous arrivals and rechecking the live room map after the await.
It constructs and applies the saved setup once before seating the first arrival.
Every later join to a live room bypasses durable storage entirely.

This creates a precise outage boundary. With the service configured but
unavailable, a cold arbitrary URL might be an older converted home, so it
requires retry instead of creating an empty replacement. Existing live rooms
continue working. An explicit new guest table also works: `POST /api/new-room`
server-mints a random `g_…` address and creates a short-lived empty reservation,
without consulting durable storage. Normal join then finds that live room.
Creation shares the existing rate/entity limits. An unclaimed reservation
expires after the normal join grace period.

`createGuestTable(name)` in `js/net.js` wraps this action. It returns
`{ok:true,room}` or a refusal. A static/older host's 404 uses the existing local
room-key mint instead. With the account service off, ordinary cold guest keys
continue to work as before, but reserved unknown saved-home keys return 410.
That 410 matters: a 404 is the network client's ordinary static-solo signal.

`connect` returns `{online:false,unavailableHome:true,joinRefusal}` for a known
saved-home refusal and calls `onRefused`. The UI must retain that distinction;
it must not replace it with an unqualified “solo” status or call the empty local
surface the restored home. Local rolling may remain available with a clear
Retry / New guest table action.

## Main UI handoff

1. New-table handlers await `createGuestTable(name)` and navigate only on its
   success. Existing room URLs remain addresses, not commands to overwrite data.
2. Saved-home cards come from `account.homes(personId)`. Opening one is an
   explicit join of its `roomKey`; membership is not a navigation side effect.
3. Save-current-home obtains a fresh capture, shows what will be retained, then
   sends its content revision and operation ID on the explicit Save action.
4. Display `home_conflict` with the retained candidate/current comparison and an
   explicit reconciliation choice. Keep failed/pending capture data available
   for export. Do not describe a refused save as durable.
5. `maybeRepushTable()` must stand down when `net.savedHome` is true. This prevents
   an older organizer cache from automatically replacing a restored home. Explicit
   prepared-table pushes remain available to every player. The `freshRoom`
   predicate for remembered-name healing / empty-return notices must also exclude
   `conn.savedHome`; a saved home may deliberately have no prepared profiles.
6. In the offline branch, distinguish `conn.unavailableHome` and show a persistent
   retry state. `net.savedHome` is refreshed on join, rejoin and before hello is
   dispatched to the app.

## Evidence

The unit lane includes `tests/account-homes.test.mjs`: same-address conversion,
live capture revision race, real process restart, simultaneous clean guest
hydration, private-state exclusion, occupied-table preservation, separate-member
same-operation collision proof, stale saves/reconciliation, malformed requests,
capacity, corruption, membership privacy, reserved keys and the outage boundary.
The two-member test injects membership offline as a fixture until invitation
acceptance is implemented; the subsequent requests use distinct authenticated
cookie jars against the real API.

Both e2e lanes include `tests/account-homes-browser.test.mjs`, using real Chrome
and real server processes to verify the network helper, cold-home refusal,
old-host fallback, clean-browser account recovery and opening a saved home after
restart.

## Tables workspace implementation — 2026-09-13

Tables now separates saved home cards from browser recents. Manage opens a
focused public-setup preview; **Join now** is the only saved-card navigation
action. Saving the current table converts its existing address. Creating a new
named home reserves its address without moving the player. Capture, save,
reconciliation and acknowledged membership removal preserve the current seat,
draft and unfinished turn. Reconciliation changes future saved setup only.
The UI uses the authenticated account boundary without enabling private-library
sync. Identity changes clear old cards, comparisons and retained-action rows;
late responses cannot repopulate them.

`home-session.js` fixes every action to a person and boundary epoch.
`home-journal.js` keeps the exact operation and capture in IndexedDB before
sending HTTP, with strict transaction completion and bounded failure. A failed
or uncertain save retains its preview and exact retry across reload. Public
exports omit the live-seat credential. The device journal caps each person at
32 records / 16 MiB and never silently evicts originals. Acknowledged removal
of confirmed device receipts leaves server homes and their versions intact.
Only an explicit retained-version choice can reconcile a server conflict.

Artwork covers are produced lazily from the existing table preview and cached
by model version, with at most eight thumbnails and 1 MiB persisted. Listing
cached homes needs no repeated model loading; generic surfaces keep a named
color cover. Desktop management widens for comparison, and 390 px phone views
use the existing full-screen task with a persistent return to play.

`tests/home-ui.test.mjs` exercises the actual app in independent browsers:
no-sync home creation, same-address conversion, real process restart and clean
browser recovery, obsolete organizer suppression, occupied live-room return,
private-pool exclusion, draft/secret-turn preservation, retained conflict and
capture refusal, offline exact retry after reload, acknowledged cleanup/leave,
real IndexedDB abort before HTTP, and a held former-account response after a
second tab changes the actual cookie. `tests/home-connection-ui.test.mjs` proves
local play under persistent home refusal and explicit guest creation during
service outage, including a cancelled creation's delayed reply. The unit lane
includes fixed-owner/view completion and exact-request tests.

Inspected captures are reproducible with
`node tools/drive.mjs tools/steps/homes-ui-look.mjs`: `tools/out/homes-capture-{desktop,phone}.png`
and `homes-card-{desktop,phone}.png`. Capture shows two prepared profiles and
three shared rolls; private libraries never enter the document. The composed
release sweep remains a separate integration check.
