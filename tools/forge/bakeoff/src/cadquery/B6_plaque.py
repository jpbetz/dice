# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B6 plaque -- text on a curved surface.

The bow is not a dent in a flat slab, it is the slab: everything here is a
piece of a vertical-axis cylinder shell, cut to a 2.6 chord by one box.

    body   shell 3.75 -> 4.00   the 0.25-thick plaque
    frame  shell 4.00 -> 4.06   the 0.06 raised border, 0.18 wide
    skin   shell 3.95 -> 4.00   the 0.05 the engraving is allowed to eat

The axis sits at y = +3.875 so the front face passes through y = -0.125 at
the centre and falls back to y = +0.092 at the edges: a 0.217 bow, which is
what "cylinder radius ~4" across 2.6 actually means.

THE BOWED-TEXT PROBLEM, honestly. `Workplane.text()` is planar and CadQuery
has no project-text-onto-a-curved-face operation. A flat text prism cut 0.05
deep would engrave the middle of DICE and miss the D and the E entirely: the
face has already fallen back 0.114 by x = +/-0.95, more than twice the depth.

The fix needs no projection API. Extrude the text into a prism 1.2 deep --
far deeper than any depth wanted -- and INTERSECT it with `skin`. The
intersection is the text wrapped on the cylinder, exactly 0.05 deep normal to
the bowed face everywhere, because `skin` is bounded by two concentric
cylinders. Cut that from the plaque and the engraving follows the bow.

The one real inaccuracy: the prism runs along -Y, not along the local surface
normal, so at the outermost letter the cut is 0.05*cos(13.7deg) = 0.0486 deep
and the glyph is horizontally foreshortened by 3%. Both are invisible at
42 px/unit, and this is a cylindrical projection -- the same thing a decal
would do.
"""

import cadquery as cq

from _forge import Part, Stopwatch, bake, stand_on_floor

WIDTH, HEIGHT, THICK = 2.6, 1.8, 0.25
R_FRONT = 4.0
R_BACK = R_FRONT - THICK
AXIS_Y = R_FRONT - THICK / 2  # 3.875: puts the slab's mid-surface on y=0

FRAME_W, FRAME_RAISE = 0.18, 0.06
ENGRAVE = 0.05

TEXT = "DICE"
FONT, FONT_KIND, FONT_SIZE = "DejaVu Sans", "bold", 0.62

BRONZE_RGB = (0.55, 0.45, 0.30)


def shell(r_inner: float, r_outer: float, half_w: float = WIDTH / 2) -> cq.Shape:
    """A chunk of vertical-axis cylinder shell, chord-cut to `2*half_w`."""
    tube = (
        cq.Workplane("XY")
        .circle(r_outer)
        .circle(r_inner)
        .extrude(HEIGHT)
        .val()
        .translate((0, AXIS_Y, 0))
    )
    window = cq.Solid.makeBox(2 * half_w, 6.0, HEIGHT, cq.Vector(-half_w, -3.0, 0))
    return tube.intersect(window)


def frame() -> cq.Shape:
    """Raised border: the 0.06 proud shell minus its own middle."""
    ring = shell(R_FRONT, R_FRONT + FRAME_RAISE)
    opening = cq.Solid.makeBox(
        WIDTH - 2 * FRAME_W,
        6.0,
        HEIGHT - 2 * FRAME_W,
        cq.Vector(-(WIDTH / 2 - FRAME_W), -3.0, FRAME_W),
    )
    return ring.cut(opening)


def engraving() -> cq.Shape:
    """Flat text prism clipped to the 0.05 skin under the bowed front face."""
    prism = (
        cq.Workplane("XZ")
        .text(TEXT, FONT_SIZE, 1.2, font=FONT, kind=FONT_KIND)
        .val()
        .translate((0, 0.6, HEIGHT / 2))
    )
    return prism.intersect(shell(R_FRONT - ENGRAVE, R_FRONT))


def build():
    plaque = shell(R_BACK, R_FRONT).fuse(frame()).clean()
    plaque = plaque.cut(engraving())
    return stand_on_floor([Part("plaque", plaque, BRONZE_RGB)])


if __name__ == "__main__":
    with Stopwatch() as sw:
        parts = build()
    bake(
        "B6",
        "plaque",
        parts,
        tol=0.002,
        ang=0.3,
        route="stl-convert",
        build_seconds=sw.seconds,
        notes=(
            "Bowed body/frame/skin are all cylinder shells (axis vertical at "
            "y=3.875, R 4.0 front), so the bow is exact rather than modelled. "
            "CadQuery has NO text-on-curved-face operation; .text() is planar. "
            "Wrapped it by intersecting a 1.2-deep text prism with the 0.05 "
            "skin shell, which makes the cut exactly 0.05 normal to the bow. "
            "Cost: 3% horizontal foreshortening on the outer glyphs and 0.0486 "
            "instead of 0.05 depth there. DejaVu Sans Bold via fontconfig."
        ),
    )
