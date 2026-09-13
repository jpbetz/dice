<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Visible dice through a round-table throw

2026-09-13. Camera follow-up to [the round playing surface](ROUND-TABLE-PHYSICS.md),
on owner UI base `4464dda` (includes `c90fd42` through `c68dadb`). This changes
presentation only; the accepted round-table films and server values stay intact.

The inherited assumption was that fitting player landing spots and card
endpoints at felt height also fitted the dice. It did not: the new round
boundary correctly supported the dice, but desktop stress casts still cropped
3–10 complete painted die bounds at rest, up to 257 pixels in this sample.
Ordinary four-player desktop casts also lost two dice at the lower edge.

## Mechanism and deliberate tradeoff

Placed tables now fit the people composition together with conservative 3D
volumes for **every visible die**, including earlier players' dice. Their
combined centre chooses the target. Each volume uses a cached, rotation-independent
geometry sphere, expanded into eight corners. Neither a face value nor a
"deciding" die chooses the view. This replaces the placed-table shortcut that
skipped the old fallback ladder; the unplaced fallback remains available.

During a portalless throw, a render-only guard can move the camera outward along
its current viewing direction. Once a die's centre has entered the view, its
whole conservative volume and two frames of position lookahead remain inside.
The guard also registers dice admitted by that retreat. It does not pan, change
the film, or fit every high spawn point before it enters. Afterward the camera
can ease inward to the larger settled read. The fog floor covers the current
and destination eyes throughout that return, so an inward ease cannot fog dice
that are still being viewed from farther away. The guard is inactive at rest
and for tower throws.

A fixed frame around the entire round surface was tried and rejected. It cut
ordinary lone phone dice to roughly half their scale: the wide/medium/close
world-unit spans were 19/24/30 pixels instead of 42/54/63. The chosen view keeps
that ordinary read, the distinctive table edge, and room for the larger stress
spread. It can crop distant artwork; this is not a promise to fit every edge
of the model at every moment.

The cost is an observable early retreat on large close throws. For seed 32676,
the largest consecutive-frame camera distance increases were:

| View | 40d20 | 40d4 |
| --- | ---: | ---: |
| Lone desktop, close | 18.8% | 17.9% |
| Lone phone, close | 30.3% | 33.1% |
| Four-player desktop, close | 10.9% | 11.5% |
| Four-player phone, close | 0.6% | 0.01% |

The lone maxima occur on the first simulated film frame. Maximum eye travel
in the lone phone samples was 8.81 and 6.99 world units respectively. These are
actual consecutive-frame measurements, not the larger correction relative to
the unpainted nominal ease position. The inspected entry sequences remain
comprehensible: high dice arrive from above; dice already in view stay visible;
the camera returns to a readable result. This is an accepted visibility/read
tradeoff, not a claim of motion-free framing. Geometry, position and the number
of visible dice determine the correction; results receive no priority.

## Evidence

[Measurements and film hashes](redesign/2026-09-13-camera/measurements.json)
record 60 fixed-seed cases: one or four local demo seats, desktop 1440×900 or
phone 390×844, wide/medium/close, and 4d20 seed 4, 40d20 seeds 90090/32676,
40d4 seeds 90090/32676. The probe projects the actual painted mesh vertices
each film frame, independently of the conservative runtime bound. All 60 have
zero re-exits after full entry, zero cropped landed dice, and zero final crops.
All 36 cases present in the owner baseline retain identical complete film
hashes, including keyframes, sounds, roughness, landings, nudges and final poses.
The extra 24 d4 cases extend visibility coverage; they are not extra baseline
hash comparisons. Deterministic demo seats are a geometry fixture, not the
multiplayer interaction proof.

The separate `table-camera-pointer-rolls` scenario uses actual server players
and hit-tested pointer/keyboard actions. It opens the roll workspace, types the
notation and presses Roll; the application closes the workspace. It covers
lone and four-player views on both devices, all three sizes, Copper/Navigation/
Stone, and then Bob's retained four dice while Alice adds forty. Every painted
bound must remain inside the scene, ahead of the actual view-depth fog, and
clear of result cards, navigation and the phone tray. It advances browser
paint/layout frames during playback instead of simulating only a frozen DOM.

The inspected screenshots use the same visible actions, with real fixture
accounts and server-assigned seeds recorded in the measurements file:

- Ordinary lone phone 4d20: [wide](redesign/2026-09-13-camera/1-phone-wide-4d20.png),
  [medium](redesign/2026-09-13-camera/1-phone-medium-4d20.png),
  [close](redesign/2026-09-13-camera/1-phone-close-4d20.png).
- Lone close phone 40d4: [frame 1](redesign/2026-09-13-camera/1-phone-close-40d4-frame1.png),
  [frame 8](redesign/2026-09-13-camera/1-phone-close-40d4-frame8.png),
  [frame 54](redesign/2026-09-13-camera/1-phone-close-40d4-frame54.png),
  [settled](redesign/2026-09-13-camera/1-phone-close-40d4.png).
- Four-player close phone 40d4: [frame 1](redesign/2026-09-13-camera/4-phone-close-40d4-frame1.png),
  [frame 8](redesign/2026-09-13-camera/4-phone-close-40d4-frame8.png),
  [frame 54](redesign/2026-09-13-camera/4-phone-close-40d4-frame54.png),
  [settled](redesign/2026-09-13-camera/4-phone-close-40d4.png).
- Desktop 40d20: [lone entry](redesign/2026-09-13-camera/1-desktop-medium-40d20-frame1.png),
  [lone frame 8](redesign/2026-09-13-camera/1-desktop-medium-40d20-frame8.png),
  [four-player result](redesign/2026-09-13-camera/4-desktop-medium-40d20.png);
  [four-player phone result](redesign/2026-09-13-camera/4-phone-medium-40d20.png).

## Regression checks and limits

The four existing framing scenarios retain their names but now measure the
read directly in `tests/e2e/table-camera.mjs`. Old assertions requiring mode
`dice`, a failed mat fit, or a fixed 16.53-unit fog depth described an earlier
rectangular camera and no longer proved visibility. Their replacement checks
all painted bounds, actual depth through the full ease, and a meaningful
ordinary-versus-stress read-size gain. This deliberately supersedes those dated
mechanism assertions under GOALPOST 1, 7 and 8; it weakens no value or privacy
check. The existing two-viewer scenario now foregrounds each emulated viewport
and awaits real scene dimensions before comparing them; a background tab had
retained its old 464×493 bounds.

Passed:

- `npm run -s test:unit` and `npm run -s test:fuzz`.
- All five `table-camera` scenarios, including the smoke flight scenario.
- `film-worker-parity` and `one-seed-one-film` (the latter rerun after the
  viewport synchronization repair).
- `node tools/drive.mjs tools/steps/table-camera-probe.mjs final` (60 cases),
  the same probe with `motion --quick` (eight close stress motion samples),
  and `table-camera-look.mjs final` (actual pointer screenshots).

A small sequential before/after CPU probe runs completed worker films with
the held clock and **does not render WebGL frames**. The three warm-run medians
for all playback frames were 1.0→1.5 ms for 4d20 (105 frames), 4.9→10.2 ms for
40d20 (276 frames), and 3.2→4.8 ms for 40d4 (173 frames). Raw trials are recorded;
this is a bounded playback-CPU sample, not a GPU or first-input benchmark.
The guard visits at most sixteen cached-bound corners per current die per
active frame, rather than traversing the full rendered meshes. The debug proof
does traverse those meshes, outside the normal render path.

`felt-gloss` still fails its existing near-camera contrast threshold at 8.411
code values (the earlier integration measured about 8.31). Its assertion and
materials are unchanged; this camera slice does not resolve that separate
visual issue. Tower corridor geometry, the general shared settings queue,
cloud enablement and other release failures are outside this camera change.


The actual-pointer matrix took 97.6 seconds in its initial composed run and
175.4 seconds in the full release sweep alongside other Chrome work. A separate
concurrent helper run exceeded its old 180-second outer timeout. The complete
matrix now has a 360-second harness allowance; all value, painted-bound, fog,
occlusion and per-action readiness assertions remain unchanged. This gives
software-rendered coverage time to finish and is not an active-frame-rate or
latency acceptance threshold.
