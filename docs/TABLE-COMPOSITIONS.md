<!-- Copyright 2026 The Dice Table Authors — SPDX-License-Identifier: Apache-2.0 -->

# Shared table compositions — R2 working design

The Copper Lantern is a broad, worn oak table with a thick chamfered edge,
brass joinery and an interrupted circular inlay. A small lantern, a leather
coin pouch and a pewter cup sit at unequal positions around its outside
edge. They belong to the same tabletop and leave the rolling centre quiet.
The wood grain and plank seams lead across the playing area; the rim makes
the shared place recognizable even when the camera is high on a phone.
Readable people and results sit upright around this composition.

The Navigation Table will use a dark shipwright's frame, a low-contrast
illustrated chart and brass compass details. The Stone Circle will use
radial carved slabs with a weathered centre and restrained moss in joints.
They are complete surfaces, with different edges and landmarks. The first
table must work with four players on desktop and phone before either ships.

## Copper Lantern model brief

- Playing radius: the existing 13.75 table units; a die radius is about 1.25.
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
and its decorative pieces sit outside the existing circular play boundary.
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

The combined four-player desktop/phone composition review is still pending.
Navigation and Stone designs and the actual setup preview remain open.
