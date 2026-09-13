<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Apply loaded tower changes between their authored rolls

An Instant viewer finished the first roll and installed Wickroot before the
next roll. A slower viewer retained only `pendingTower` until its whole roll
queue emptied. That viewer therefore threw the next dice across the old
table, then installed Wickroot afterward. Both viewers reported the same
final setting and values; their complete films differed.

The baseline reproduction preloads the actual model on both clients, then
uses one Instant viewer and one viewer with its playback clock held. The
first 4d20 films match. After the tower setting and later 8d20, the fast viewer
reports a pour with hash `0c940159…`; the slower viewer reports a throw with
hash `58b7cb47…`. [Full before capture](2026-09-13-tower-order-before.json).
The sampled kept rethrow happened to match; this is not a claim that every
rethrow hits a changed collider.

Tower changes now occupy the existing event FIFO alongside zoom, rolls,
rethrows and reveals. Adjacent tower choices coalesce, geometry changes wait
for earlier reveal flips, and a whole-table clear retains the latest pending
configuration. Rethrows also retain their whole event payload while another
queued event waits, even when the preceding `currentRoll` is already done.
No collider formula, round-surface hook, worker solver or portal data changed.

`tools/steps/tower-settings-order.mjs` repeats the two-viewer procedure and
compares complete films, including every keyframe, sounds, roughness,
landings, last landing, nudges, values and final transforms. After the fix,
both viewers pour the later roll and share hash
`b7dc047408fd73350561cacf30e34c6bae656e9c1989b48dd243fa9392271b93`.
Both also agree on the later kept rethrow.

- [After capture](2026-09-13-tower-settings-order.json)
- [Desktop result](2026-09-13-tower-settings-desktop.png)
- [390-pixel phone result](2026-09-13-tower-settings-phone.png)

Both captures were inspected. The complete result and remaining throw count
are readable; all four physical dice are in the phone frame. The desktop
camera/light combination leaves the metallic faces dark, and the old tower
loading note remains visible in that capture. Those existing presentation
issues are not fixed by ordering the physics change.

Full units pass. Nineteen distinct browser checks pass: three new warm-tower
cases covering pours/None/tower replacement, two kept rethrows across two
towers, and held/reveal/queued clear; six existing turn FIFO/reveal/bank/
snapshot/worker cases; six Instant cases; both zoom-order cases; and the
actual pending-GLB and parser cancellation checks. The new cases compare
complete films rather than only final settings or values.

## Next increment: unavailable physics assets

This commit deliberately covers loaded models. It retains the old
unavailable-model behavior while the separately approved failure-state
increment is implemented. That old behavior can still bake against the
retained core after a required model fails or a replay wait expires; it
must not be treated as a completed async-readiness fix.

The agreed next increment will hold the ordered tower event at its actual
FIFO position while its model loads. A bounded wait or terminal failure
will display explicitly labeled complete results without fabricating a
physics film. Authored payloads, redaction, turn progress, bank state and
per-die counted/kept selection must remain usable, including further rolls.
The exceptional state stays separate from the normal Instant preference.

A missing film also means missing settled poses that could affect later
collisions. The viewer therefore must not silently resume physical playback
on asset arrival. Recovery requires a ready core plus a shared empty-table
boundary, or a reload whose actual reconstruction succeeds. This is a new
local film-state mode, not a timer that retries the old wrong-core bake.
