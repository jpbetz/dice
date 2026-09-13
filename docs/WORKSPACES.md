<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->
# Workspaces and the first phone table layout

Shipped slice of R1-A/B and R2, 2026-09-13. This implements the approved
[experience plan](EXPERIENCE-REDESIGN.md) and the owner’s distinction between
economical persistent controls and generous opened tasks.

Tables, My dice & rolls, and People open from a compact navigation row. Tables
shows the active table, optional saved-home cards and this browser’s recents.
Capture/retained-version comparison expands into a focused task. Browsing it never leaves a
room; only an explicit Go or completed New table action navigates. People
shows the live roster, each person’s latest result from this viewer’s redacted
history, shared-roll browsing, and the existing invite link/share action.
An optional account and private-library task is available from People and the
personal menu. The durable social interface remains in progress.

People and Tables use a desktop drawer up to 480px wide. The scene reserves
its space, so the whole table remains usable beside it. My dice & rolls opens
up to 760px wide for dice composition. It borrows the existing builder and
returns that same node when closed. Saved rolls & starter kits opens the
[focused library](UX.md#focused-library-workspace-2026-09-13), after restoring
the builder. The full task owns its search, publication choices and import
preview; it keeps the original library DOM and state. Gallery, favorites, and
practice remain the existing gallery’s responsibility. Identity, Dice beside the roll controls, table setup, and the Preferences gear
keep their compact entry points.

The first 390×844 phone slice gave the scene 390×550, starting at 68px.
[Persistent results](PLAYER-RESULTS.md) now reserve a top band: four players
leave a 390×374 scene starting at 244px. The 112px side
rail is gone. A bottom tray offers familiar quick rolls and the normal staged
draft Roll; My dice & rolls, People, and Tables open as full-screen workspaces.
One Back to table action restores the scene without changing the seat, draft,
kept dice, or unfinished turn. Desktop workspaces allow table interaction;
phone workspaces use the app’s modal focus containment.

The old phone framing refunded an unsuccessful mat fit to the close camera,
then skipped every fallback for placed rooms. The phone now fits the occupied
ring and all dice positions inside the reserved scene, using no values,
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

This is the layout foundation, not the complete R2 visual design. [Persistent player results](PLAYER-RESULTS.md) and reserved turn controls are
now implemented. Larger/more legible phone dice,
[three table designs](TABLE-COMPOSITIONS.md) and a compact queued-arrival
presentation are implemented. Physical-phone observations remain open.
The familiar bottom shortcuts supplement the builder; game-specific profiles
and starter kits remain explicit library choices.

## Long-session unfinished turns

The arrival sweep and completed-history trim now preserve unfinished shared
and private turns. The separate follow-up fixed `LOG_CAP` eviction, bounded
new turn creation without deleting existing work, and proved a long session
on server and static solo. Policy and tests: [ROLL-HISTORY.md](ROLL-HISTORY.md).
