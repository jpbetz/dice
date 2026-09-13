<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Shared table compositions — R2 working design

The Copper Lantern is a broad, worn oak table with a thick chamfered edge,
brass joinery and an interrupted circular inlay. A small lantern, a leather
coin pouch and a pewter cup sit at unequal positions around its outside
edge. They belong to the same tabletop and leave the rolling centre quiet.
The wood grain and plank seams lead across the playing area; the rim makes
the shared place recognizable even when the camera is high on a phone.
Readable people and results sit upright around this composition.

The Navigation Table uses a dark shipwright's frame, a low-contrast
illustrated chart and brass compass details. The Stone Circle uses
radial carved slabs with a weathered centre and restrained moss in joints.
They are complete surfaces, with different edges and landmarks. All three
have been inspected with four players on desktop and phone.

## Copper Lantern model brief

- Authored layout radius: 13.75 table units at medium; a die radius is about 1.25.
  This is the intended circular area, not the inherited square collision shape.
- Table radius: 15.4; top at zero, underside at −1.1. Decorative landmarks
  remain outside the playable circle and do not add physics bodies.
- Model budget: 8,000 triangles, enforced against the exported mesh.
- Palette: linear vertex colors converted from authored sRGB; three material
  families (matte timber/leather, aged metal, dim amber glass). No live light
  or bloom is required by the lantern. Large grain variation is painted;
  seams, joints, bevels and the silhouette are geometry.
- Blender Z-up exports to glTF Y-up. Keep the authored top at zero rather
  than grounding the underside; it must meet the existing physics plane.

This sets aside the old venue guidance's back-corridor placement and
tower-centred diorama: a circular multiplayer table is the main composition,
and its decorative pieces sit outside the intended circular rolling area.
The inherited square boundary is now replaced by the shared round envelope;
[actual model support and camera limits](ROUND-TABLE-PHYSICS.md) are recorded separately.
It preserves readable dice, shared authored values and interruptible play.
The forge shape and normal checks are followed by an actual app-lighting
look; a studio preview alone cannot establish tabletop contrast or framing.

## First model implementation (2026-09-13)

Copper is an optional stable-channel choice. Its GLB loads only when selected;
classic table play starts without it. Load failure restores the original surface
and offers Retry, and a late response cannot undo a subsequent choice. The
same saved design follows existing room settings, late joins and solo restore.
The model adds no collision geometry or value-dependent scene behavior.

The 7,996-triangle model has three material primitives and a packed 1,024-pixel
wood-grain image. The served GLB is 1,131,492 bytes with SHA-256 prefix
`9bd081132494e6cd`; catalogue URL and forge digest use that full-content hash.
Editable source: `tools/forge/sources/copper-lantern-table.blend`, including
its image. Recipe: `tools/forge/recipes/copper_lantern_table.py`.

Forge now has an explicit `texcoords=True` option which preserves corner UVs
through deterministic canonicalization. The old default remains unchanged.
Two consecutive bakes have identical complete bytes. Closed-solid, normal,
degenerate-face, color, material and size checks pass; the existing tower
fixture still matches its prior geometry and full-content digests. Studio
hero, detail and normal views were inspected after GLB reimport. Actual app
lighting is evaluated separately with `tools/steps/table-composition-look.mjs`.

`table-designs` scenarios cover live/late-join application, local candidate
isolation, stable solo restore, request failure/retry, and cancelling an actual
in-flight model request. Static delivery verifies served bytes, embedded
texture, real UV range, material count, normals and vertex colors.

The combined four-player desktop and 390×844 phone captures were inspected
with persistent result seats, full-width phone dice, and the bottom roll tray.
The table has a distinct edge and landmarks, quiet grain below the dice, and
all four latest reads remain together. Grouped roll presentation remains open.

## Navigation and Stone (2026-09-13)

Navigation's decagonal shipwright frame supports a quiet original chart,
with rhumb lines, folded paper, coastlines and a compass rose. A raised compass,
rule, dividers, brass bindings and rope details sit at its perimeter. The model
has 3,260 triangles and three material primitives; its packed 1,024-pixel
illustration and geometry total 783,236 bytes (`ca57971442dd2bb2`). The top
meets the unchanged physics plane; the foundation reaches −1.15. An explicit
recipe check keeps every raised fitting inside the supporting decagon.

Stone has a central slab and twelve radial blocks over a continuous solid
foundation. Cut joints, incised marks, quiet fissures and small moss patches
give the surface scale. Three unequal cairns occupy the outer edge beyond
the 13.75-unit playing circle. It has 5,748 triangles and two material
primitives; the packed 1,024-pixel surface image and geometry total 1,161,984
bytes (`d4dc9728fddc9d19`). Its foundation reaches −1.4. Each design moves the
old visual floor just below its own underside, without adding physics bodies.

Recipes and packed editable Blender sources live alongside Copper under
`tools/forge/recipes/` and `tools/forge/sources/`. Shared closed-solid authoring
helpers and seeded original illustration generation keep the source editable;
no remote images or runtime illustration generation are needed. Both final
recipes bake to byte-identical complete GLBs on two consecutive runs. All
normal, closed-solid, color, degeneracy and triangle checks pass. Reimported
hero, detail and normal renders were inspected; early overhanging navigation
fittings and cairn feet were moved onto their supports before the final bake.

All three designs share actual setup preview, failure/retry and late-load
cancellation. The browser scenario applies each preview across three clients,
proves preview isolation, revisits the bounded three-scene cache, and restores
Stone in a fresh stable solo page. Three design lifecycle scenarios and all
60 static-cache assertions pass. Static checks compare served bytes and
content hashes and inspect real texture UV range, normals, vertex colors and
material count. Four-player desktop and 390×844 phone captures were inspected
for both new designs; these are emulated phone views, not physical-device
performance or battery measurements.

Review captures: [Navigation desktop](redesign/2026-09-13-navigation-desktop.png),
[Navigation phone](redesign/2026-09-13-navigation-phone.png),
[Stone desktop](redesign/2026-09-13-stone-desktop.png),
[Stone phone](redesign/2026-09-13-stone-phone.png).

## Appearance preview

Table setup → Appearance displays the actual selected grounded-table GLB in
a separate 3D viewport before Apply. Its loader is lazy and rendering is driven
by changes and resize, with no animation loop. Closing the panel pauses it;
selection never changes the live table or another viewer. Stable users can
choose grounded table designs; fantasy designs remain experimental choices.
Mat choices retain their actual texture swatch preview. Experimental fantasy
venues retain a labelled selection rather than pretending to render their full
scene. Tower selection is still a labelled choice, outside this preview slice.

The 220-pixel preview deliberately expands the old 112-pixel sample inside the
opened task workspace, following the owner's generous-workspace clarification.
The settings content scrolls when needed; Apply and the return remain visible.
Six targeted table/setup/channel tests pass, including actual preview render,
no idle frames, other-viewer isolation and pause on close. Desktop and phone
setup captures were inspected with the live dice preserved beside/behind it.

Review captures: [desktop](redesign/2026-09-13-copper-desktop.png),
[phone](redesign/2026-09-13-copper-phone.png),
[phone setup](redesign/2026-09-13-table-preview-phone.png).

## Shared table size and round physical support

The original models stayed at their authored medium size while the actual
rolling area changed with zoom. A reproducible ordinary `4d20` throw (seed 4,
wide) left two dice centres beyond Copper's wood: radii 16.052 and 15.750,
against the original outer radius 15.4. All three cached models now scale with
`TABLE_W / 27.5`, including shared changes and late loads. Their tops remain
at the physics plane; the lowered visual floor follows the scaled underside.
This changes scenery only, with no solver or collision-body change.

Six targeted design/lifecycle/idle-load/zoom scenarios pass. A raycast against
the actual GLB supports the cardinal rolling edges at every design and zoom;
it does not infer support from a radius proxy. All nine ordinary seed-4 samples
(three designs by three sizes) now have artwork beneath all four body centres.
Complete film hashes for all 27 ordinary/stress samples match the nine matching
samples from unchanged `e746966`. [Measurements](redesign/2026-09-13-table-size.json)
include original films and actual support rays. The reproducible probe is
`tools/steps/table-size-look.mjs`; four-player actual play uses the existing
`table-composition-look.mjs`. [Wide phone](redesign/2026-09-13-sized-copper-phone.png)
and [Navigation desktop](redesign/2026-09-13-sized-navigation-desktop.png) were
inspected after the composed resize, alongside single-player close views.

The size-only change exposed a second defect: the former square walls still
left 3–7 stress-die centres outside the round artwork. The subsequent
[round physical envelope](ROUND-TABLE-PHYSICS.md) now fits the complete spawn
line and checks complete corrected hulls against actual GLB surfaces. All
1,476 dice in 45 sampled ordinary/stress casts have support and avoid raised
landmarks; complete films agree across all three designs. This intentionally
changes the former square collision paths while preserving authored values.

**Still open:** actual desktop stress captures crop frontmost supported dice.
The camera follow-up measures painted hulls through entry, tumble, reveal and
rest, including the phone tray. Physical support alone does not prove visible
dice. Emulated screenshots are not physical-device performance evidence.
