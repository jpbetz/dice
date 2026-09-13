<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Legacy venue failures predate the redesign

The inherited assumption is that the Moonrise/Foxfire scenery and movement paths
still fit the table for which they were authored. They do not. This is existing
closed-beta scene debt, reproduced at pre-redesign revision `1915bd7` (2026-09-12)
and at composed redesign revision `ca9d693`. No runtime or test threshold changes
are included in this characterization.

The same tool and the exact existing `frameGates`, ellipse projections and rejected
W2c layout ran on both revisions. It measures both palettes at wide, medium and
close, on 1500 × 950 desktop and 390 × 844 phone, plus Moonrise without a tower at
wide. The phone viewport is applied after the ordinary desktop boot, identically
on both revisions. Grounded design activation is measured on the composed revision.
No dice are constructed by either 14-cell composition run.

## Life is displaced, rather than authored for this table

Every one of the 14 complete living-layer sample arrays is exactly equal between
revisions. At each of seven times from 25 to 103 seconds:

- All 260 fireflies had to be moved out of their authored zones at construction.
- All four wisps hit the runtime clamp; the authored path does not clear the box.
- The internal `inBox` measure is zero, but it measures a private fixed exclusion
  box of half-width/depth 17.625 plus 0.35 margin.

Both revisions already use `table.scale = 2.5`. The old test's expected half-width
7.05 and half-depth 4.3 are obsolete. Replacing those constants would not fix the
260 displaced flies, the perpetually clamped procession, or the lost moot visits.
The authored moot still sits at (-8.9, 3.2), the pond at (9, -9.2), and the path and
zones retain their old coordinates.

There is also a mismatch in the measured exclusion area. A wide table with Wickroot
has extents 35.25 × 39.75. All four sampled wisps lie at z ≈ ±17.975, inside that
larger playing rectangle, along with 110 fireflies. This is true in both revisions
at every sampled time. The internal zero count cannot establish exclusion from the
actual widened area. This is a position census, not a claim that every such sprite
actually obscures a die in the image.

## The composition failures are visible and causal history is clear

All seven desktop gate result arrays are exactly equal across revisions. F3/F6
remain red on wide and medium; close also fails composition through F1/F6. The
phone layout makes more of the old scene visible, but does not repair it.

The counts below are authored support/fungus/scenery footprints with at least 55%
inside the live frame, using the unchanged F6 test. There are 20 footprints,
including the mushroom ring counted both as a support and fungus.

| Wickroot size | Desktop before → now | Phone before → now |
| --- | ---: | ---: |
| Wide | 1 → 1 | 0 → 0 |
| Medium | 7 → 7 | 0 → 1 |
| Close | 12 → 12 | 0 → 3 |

Both palettes produce the same geometric counts. Wide Moonrise without a tower
stays at 13 on desktop and improves from 0 to 8 on the phone. At wide with Wickroot,
F3's desktop area shares remain approximately 0.62 / 0.06 / 0.32; the foreground
ring is fully cropped. The rejected W2c layout still fails multiple gates, but the
old assertion that F1 must specifically reject it no longer holds at several
current camera configurations; that too reproduces before this campaign.

Screenshots were inspected. The wide tower occupies the center above a cropped
foreground; shrinking the table reveals more props but does not restore the old
ring/pond composition. These are real defects, not a reason to change the gates.

## Scope and smallest correct next step

Copper, Navigation and Stone all activate their actual GLBs at the current wide
scale of 1.281818, with no legacy stage and zero flies/wisps. The accepted redesign's
three grounded designs do not depend on these old fantasy layouts. The stability
channel already keeps fantasy venues and towers as beta offers; existing room
settings continue to apply for all viewers.

The smallest current integration is this evidence and the unchanged failure gates.
Do not silently bless the old scenes by changing their expected box or composition
thresholds, and do not rebuild the optional catalogue as a prerequisite for the
three grounded tables without a separate reason. If the beta living layer is
repaired next, begin with an exclusion region derived from the actual widest tower
geometry and a test that measures every actual point against it. That correction
would still leave a separate screen-composition task: the scenery and movement
route need to be placed together for the current frame. No new global scale or
camera offset should be assumed to solve that without looking.

## Reproduction and artifacts

Run `node tools/drive.mjs tools/steps/venue-characterization.mjs` on an ephemeral
harness. The baseline worktree contains only the tool and named exports of the
existing test helpers; application code remains at `1915bd7`. The probes are
read-only apart from selecting personal test-room settings.

- [Before measurements](2026-09-13-legacy-venue-before.json) and [current measurements](2026-09-13-legacy-venue-current.json)
- Before: [desktop](2026-09-13-legacy-venue-before-desktop.png), [phone](2026-09-13-legacy-venue-before-phone.png), [phone without tower](2026-09-13-legacy-venue-before-phone-none.png)
- Current: [desktop](2026-09-13-legacy-venue-current-desktop.png), [phone](2026-09-13-legacy-venue-current-phone.png), [close desktop](2026-09-13-legacy-venue-current-close.png), [phone without tower](2026-09-13-legacy-venue-current-phone-none.png)

All 28 measured configurations completed without page exceptions. No physics,
artwork, gate threshold, optional-loading behavior or release classification changed.
