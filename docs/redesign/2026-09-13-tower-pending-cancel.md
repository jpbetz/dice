<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Cancel a pending tower change

When Wickroot was still loading at a towerless table, selecting None updated
the room but left `pendingTower = 'wickroot'`. The settings handler compared
the new choice only with the already-installed tower. Because that tower was
already None, it skipped the queue update; the late model could then install
Wickroot despite the newer choice.

The handler now compares against `pendingTower || currentTower`. A newer None
choice clears the pending change through the same queue/flush path, and a
newer real tower supersedes the old request. No wider queue or film behavior
changes.

`tests/e2e/tower-pending-cancel.mjs` holds actual GLB network responses. It
checks None cancellation, late-response non-resurrection, unchanged world
bodies, replacement by another real tower, unchanged replacement portals,
and the next roll. The check fails at the pending-clear assertion on the
unchanged `81466ef` baseline and passes with the single-line fix. The same
fix also makes the separately implemented delayed-parser cancellation and
parser-failure recovery checks pass.
