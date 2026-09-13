<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->
# Workspaces and the first phone table layout

Shipped slice of R1-A/B and R2, 2026-09-13. This implements the approved
[experience plan](EXPERIENCE-REDESIGN.md) and the owner’s distinction between
economical persistent controls and generous opened tasks.

Tables, My dice & rolls, and People open from a compact navigation row. Tables
shows the active table and this browser’s recents. Browsing it never leaves a
room; only an explicit Go or completed New table action navigates. People
shows the live roster, each person’s latest result from this viewer’s redacted
history, shared-roll browsing, and the existing invite link/share action.
There is no placeholder friends or account interface.

People and Tables use a desktop drawer up to 480px wide. The scene reserves
its space, so the whole table remains usable beside it. My dice & rolls opens
up to 760px wide for organizing dice and profiles. It borrows the existing
builder and saved-library DOM, including the publication controls and import
preview, then returns the same nodes when closed. Gallery, favorites, and
practice remain the existing gallery’s responsibility. Name/Dice, table
setup, and the Preferences gear keep their compact entry points.

On a 390×844 phone the scene is 390×550, with its top at 68px. The 112px side
rail is gone. A bottom tray offers familiar quick rolls and the normal staged
draft Roll; My dice & rolls, People, and Tables open as full-screen workspaces.
One Back to table action restores the scene without changing the seat, draft,
kept dice, or unfinished turn. Desktop workspaces allow table interaction;
phone workspaces use the app’s modal focus containment.

The old phone framing refunded an unsuccessful mat fit to the close camera,
then skipped every fallback for placed rooms. The phone now fits the occupied
ring and all dice positions with space for the result card, using no values,
outcomes, or deciding-die choice. The viewport’s top offset is carried through
chips, placard bounds, and screen projections. The result card’s entry
animation also respects its left-aligned phone position.

Validation: the unit suite passes; `workspaces` and `first-play-phone` pass.
The scenarios preserve a private unfinished turn, kept choices, whisper draft,
seat and DOM identity through every workspace; test held-result redaction;
exercise the phone’s real draft Roll with secret privacy; and measure painted
mesh vertices for all four players’ eight dice during active playback, at
rest, and after closing a sheet. Desktop proof measures all eight dice beside
the People drawer with the scene interactive. `tools/steps/workspaces-look.mjs`
reproduces the populated desktop and phone captures in `tools/out/workspaces-*`.

This is the layout foundation, not the complete R2 visual design. Permanent
readable player results on the shared surface, larger/more legible phone dice,
new table composition/art, and simultaneous-roll presentation remain work.
The familiar bottom shortcuts supplement the builder; game-specific profiles
and starter kits remain explicit library choices.

## Long-session unfinished turns

The arrival sweep and completed-history trim now preserve unfinished shared
and private turns. The separate follow-up fixed `LOG_CAP` eviction, bounded
new turn creation without deleting existing work, and proved a long session
on server and static solo. Policy and tests: [ROLL-HISTORY.md](ROLL-HISTORY.md).
