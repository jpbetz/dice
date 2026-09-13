<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Explicit profile sharing

R1-D1.2 prerequisite, implemented 2026-09-13. The private library and the
live table's published profiles now have an explicit boundary. This replaces
C17's automatic whole-library broadcast because a recovered library must
never become public merely by arriving in a browser that is at a table.

Saved rolls shows **Share at this table** beside each profile. Everything
starts unselected. Choosing a profile shares its name, interpretation,
appearance and pools, including later edits. Both the active rack and the
alternate-profile list pass through `profilePublication` in
`js/profile-sharing.js`; the existing `toWire` allowlist excludes local IDs,
account metadata and revisions. Rolling still uses the ordinary per-roll
visibility path. Prepared profiles deliberately applied to a table remain
separate from this personal-library choice.

Consent is stored under `dice.profile-sharing.v1`, scoped to the current
room and limited to 32 recently chosen tables. It belongs to this browser,
not to YAML or a synchronized kit. New/copy/imported profiles stay private.
An explicit whole-library replacement first clears and verifies old choices;
failure refuses replacement. The account integration must call
`resetProfileSharing()` and honor failure **before** adopting a different
person's namespace, because new libraries may reuse local profile IDs.

Publications are serialized and converge on current consent after an
in-flight request, including same-origin storage changes. The UI distinguishes
pending, successful and failed updates. Failed withdrawal says that the old
shared copy may remain visible and offers Retry. Unsharing removes the live
publication; copies another player deliberately kept remain theirs. Incoming
`pools-changed` events now refresh the alternate-profile list as well as the
active rack, so an existing viewer observes additions and withdrawals
without reconnecting.

Proofs: four pure unit cases cover default refusal, room separation, bounded
consent and allowlisted active/inactive projections. The `profile-sharing`
browser scenario captures a raw participant stream and late-join response:
private names/rolls stay absent, selected edits arrive, copied profiles are
not republished, same-table reload retains consent, blocked withdrawal stays
visible and Retry clears both publication paths. A retained copy survives.

`tools/steps/profile-sharing-look.mjs` inspects the saved-library controls
with four participants at 1440 × 900 and 390 × 844. The phone view is Chromium
touch emulation, not a physical phone. [Desktop](redesign/2026-09-13-profile-sharing-desktop.png)
and [phone](redesign/2026-09-13-profile-sharing-phone.png). Full-width scene framing and the
destination shell remain separate R1/R2 work.

This ships the publication boundary, not account recovery or sync. Tests of
real recovered data must exercise it again when those paths are connected.
