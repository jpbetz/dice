<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# A shared film in two actual viewports

2026-09-13, base `7f1c736`, isolated worktree. The full release run failed
`place-film-is-one-film` before casting: both cached views read **464×493**,
despite preceding requests for 390×844 and 1600×900 device metrics. The unchanged
scenario passed alone in 4.8 seconds. Its precondition assumed that CDP's metric
acknowledgment meant each background page had already applied its scene resize.

The neighboring `one-seed-one-film` scenario already addressed this ordering:
foreground each page and wait until its actual scene boundary reaches the
requested viewport edge. This correction applies that same handshake to the
stamped-seat proof. It keeps the unequal scene sizes, opposite seat/orbit,
server-stamp consumption and byte-equal pose assertions. It also compares a
SHA-256 hash of the **complete** keyframes, contacts, roughness, landings, frame
counts, authored values and final poses across both viewers. There is no camera,
physics, audio, application UI or threshold change.

`node tests/e2e/run.mjs --only place-film-is-one-film,one-seed-one-film` passed
**2/2**. An instrumented capture of the stamped-seat scenario also passed.
The scene rectangles after the foreground/layout handshake were:

| Viewer | Browser viewport | Actual scene rectangle | Seat / camera base |
| --- | --- | --- | --- |
| Phone | 390×844 | left 0, top 148, 390×511 | 0 / 0 |
| Desktop | 1600×900 | left 316, top 102, 1284×798 | 1 / π |

Both complete films hashed to
`c87e71c29855f8917d0e0c54afd0bc09ad6b60d61e1af965f00ff790bb29c438`.
The captured physical body positions and quaternions are also exactly equal.
The roll remains server-seeded; this hash records the observed cast rather than
defining a new golden.

The [phone](phone.png) and [desktop](desk.png) screenshots were inspected:
four dice occupy the same physical spot, seen from opposite chairs at distinct
screen scales, and the upright result names Desk and shows the same total.
[Measurements](measurements.json) retain both scene rectangles, camera frames,
physical poses and hashes. Capture foregrounded and painted each viewer before
the scenario's existing device-metric cleanup. This is a shared-film proof,
not a new UI-flow or physical-phone test.
