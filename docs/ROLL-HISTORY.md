<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->
# History retention and unfinished turns

2026-09-13: `js/rollhistory.js` separates unfinished work from completed history.
New arrivals retain every uncleared turn with throws remaining and the newest
100 completed/explicitly cleared entries, preserving their order. The server
and browser use the same trim; browser DOM pruning removes those exact IDs,
so an old unfinished row cannot disappear while its live turn survives.

Private turns remain behind the existing per-viewer projection. A late viewer
receives shared unfinished turns and no private-turn existence. A long-running
solo browser retains its old turn payload, kept faces, and stored history.
This does not add restoration of playable solo dice after a page reload; the
existing solo log remains the persisted artifact.

Anonymous creation is bounded. The server admits at most 100 unfinished turns
per room. At capacity, only creation of another multi-throw/push turn is
refused. Plain rolls, continuing existing turns, and explicit clearing remain
available. Claims check capacity before consuming their offer, so retry is
safe. Refusals disclose no roll IDs, names, values, or counts. Static solo uses
the same gate and includes pending playback in its count.

No existing turn is discarded to enforce this bound. With the 100-entry
completed-history budget, retained storage is bounded by 200 entries per room,
each already bounded to 40 physical dice. Completing/clearing a turn makes it
eligible for the next arrival’s normal history trim; it is not immediately
removed at its final throw. The former hard 100-entry total cap is deliberately
superseded because it silently deleted playable turns (GOALPOST 5).

Proof: `tests/rollhistory.test.mjs` covers long-session server retention,
private late-viewer projection, continued throws with kept faces, bounded
creation, ordinary play at capacity, and claim retry. E2E
`unfinished-turn-history` plays 105 later rolls in static solo, then continues
the original turn with its kept face and history row intact. The existing
shared/private and solo quick-roll preservation scenarios remain green.
