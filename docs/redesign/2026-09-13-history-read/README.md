<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# History beside the current results

2026-09-13. A real phone regression was hidden behind the retired banner
fixture: after twelve rolls, the 390×844 history opened at y=64 and covered
all 360 sampled points of Alice’s current result (y=63–141). The old height
clamp reserved identity and the bottom tray but omitted the new result rows.

History now reserves the actual result-region height and the bottom turn
controls. Its list scrolls within the remaining space. In a window at most
480 pixels tall, current results use one horizontally scrollable row; this
keeps enough space to read history entries as well as the history tools.
The same card text, result actions and values remain available. This replaces
the old banner-lift geometry as the measure of the current read.

`history-keeps-results-readable` prepares fifteen real history entries and
four player results, then opens/closes history with actual pointer input at
390×844, 1440×900 and 844×390. It repeats the geometry checks while resizing
an already-open history, and uses an actual horizontal wheel to reach the
last result in the short window. Six-pixel hit-test grids measure only the
painted portion inside the result scroll region: off-scroll card rectangles
are not mistaken for visible results. Every visible sample stays unobstructed,
Close remains hit-testable, and the history list retains at least 44 pixels
of height. In the inspected short view it has 52 pixels, with one readable
entry; the portrait phone has 218 pixels.

Inspected: [portrait phone](390.png), [short landscape](844.png),
[desktop](1440.png). These were taken through the same visible history flow
with `node tools/drive.mjs tools/steps/read-layout-look.mjs`. They establish
emulated layouts, not physical-device keyboard or battery behavior.

Validation: the new history scenario and unchanged `draft-bench` pass 2/2.
The older full-preflight draft failure does not reproduce on this composed
owner-control base; its existing sticky/air/popover checks remain unchanged.
