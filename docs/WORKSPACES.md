<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->
# Workspaces and the first phone table layout

Shipped slice of R1-A/B and R2, 2026-09-13. This implements the approved
[experience plan](EXPERIENCE-REDESIGN.md) and the owner’s distinction between
economical persistent controls and generous opened tasks.

The compact desktop navigation opens **Tables**, **My dice & rolls**, and
**People**. On a phone the bottom row reads **Tables · Rolls · People · More**;
Rolls opens My dice & rolls. **More** contains Preferences, roll history,
notation, Help and table-clear controls. The phone tray shows Quick dice for
an empty saved-roll workspace and the player's saved rolls when available,
with Build a roll and the staged draft's Roll action alongside them.

Tables shows the active table, optional saved-home cards and this browser's
recents. **Manage** opens a saved home's details; capture and retained-version
comparison expand into a focused task. Browsing never leaves the room.
**Join now**, a recent table's **Go**, or completing **New table** navigates;
creating or saving a home does not. See the [saved-home workflow and
proof](SAVED-HOME-PROTOCOL.md#tables-workspace-implementation--2026-09-13).

People keeps the live roster, each person's latest result from this viewer's
redacted history, shared-roll browsing and **Invite to table** for guest links.
Where the optional service is available, an account also opens **Friends**,
**Invitations**, and **Presence**. Contact codes allow friend requests; the
inbox retains invitations sent while a recipient is away. **Accept** updates
the relationship or home membership without changing the current seat, draft
or unfinished turn. **Join now** is a separate choice. Presence starts off;
sharing online status and sharing a saved-home location are separate controls.
Expired or unavailable signals read **Unknown**. Account recovery does not
enable presence or private-library sync. [Social contract and
proof](SOCIAL-SERVICE-PROTOCOL.md).

People and Tables use a desktop drawer up to 480px wide, with the scene
reserving its space. Home comparison expands further. My dice & rolls opens
up to 760px wide for composition, borrowing the existing builder and returning
that same node when closed. **Saved rolls & starter kits** opens the
[focused library](UX.md#focused-library-workspace-2026-09-13) as its own full
task. Browsing previews a character; **Use these rolls** selects it. Search,
management, starter-kit preview, import/export and individual **Share at this
table** choices use that library's existing state. Profiles stay private until
shared. Gallery, favorites and private practice remain the gallery's task.

Your name opens the personal editor. **Dice** stays beside the desktop roll
controls; the collection is also reachable inside My dice & rolls. The table
name opens Table setup, and the desktop gear opens Preferences. Account and
private-library actions are available in People and the personal menu.

The phone uses the full scene width with a bottom roll tray instead of the
112px side rail. Persistent result seats and active-turn controls reserve
space around the dice. Workspaces open as full-screen tasks with the app's
modal focus containment. Their direct **×** returns to the table without
changing the seat, draft, kept dice or unfinished turn. An accepted Roll from
an opened task returns to the playing surface itself; a delayed response does
not dismiss a task opened afterward. Desktop drawers keep the scene interactive.

Framing uses occupied regions and painted dice positions, without consulting
values, outcomes or the deciding die. The scene's top offset is carried through
chips, placard bounds and screen projections. See [persistent results and turn
controls](PLAYER-RESULTS.md), [table designs](TABLE-COMPOSITIONS.md), and the
[execution record](REDESIGN-PROGRESS.md) for composed validation and remaining
camera/device work.

Evidence includes `workspaces-keep-table`, `workspaces-phone-four`,
`workspaces-desktop-four`, `first-play-phone` and `roll-flows`. They cover kept
private turns and drafts, redacted results, accepted Roll navigation, phone
saved-roll controls, and projected mesh vertices during playback, at rest and
after closing a sheet. The home and People browser suites use hit-tested
pointer/keyboard controls with independent fixture accounts, real service
restart and held storage/network responses. Local browser emulation is not
physical-phone or newcomer observation, and these proofs do not establish
production deployment.

## Long-session unfinished turns

The arrival sweep and completed-history trim now preserve unfinished shared
and private turns. The separate follow-up fixed `LOG_CAP` eviction, bounded
new turn creation without deleting existing work, and proved a long session
on server and static solo. Policy and tests: [ROLL-HISTORY.md](ROLL-HISTORY.md).
