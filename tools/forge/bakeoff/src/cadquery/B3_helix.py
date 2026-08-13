# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B3 helix-ramp -- sweeps/lofts.

This is the item CadQuery is built for. The whole chute is one call:

    profile.sweep(helix_wire, isFrenet=True)

`cq.Wire.makeHelix` gives an exact OCCT helical edge (a curve on a cylinder,
not a polyline), and `BRepOffsetAPI_MakePipeShell` in Frenet mode carries the
U-channel along it. Frenet is the right frame here and not just the default:
its normal points at the axis and its binormal tilts off vertical by the
helix angle, so the channel BANKS into the descent the way a real chute does.
The ends are the profile plane itself, so the planar end cuts are free.

Profile, in the sweep plane (local x across the chute, local y up), with the
origin on the floor's mid-plane so "helix radius measured to floor centre"
is literally true:

      -0.72                         +0.72
        +---+                     +---+      y = +0.41  (wall tops)
        |   |                     |   |
        |   +---------------------+   |      y = +0.06  (floor top)
        +-----------------------------+      y = -0.06  (floor underside)
             -0.60             +0.60

Column and chute do not touch: floor centre 1.55 minus half-width 0.72 is
0.83, and the column is r 0.5. That 0.33 gap is what the spec's numbers say,
so it is left alone; the two solids ship as one compound.
"""

import cadquery as cq

from _forge import Part, Stopwatch, bake, stand_on_floor

COL_R, COL_H = 0.5, 8.0

HELIX_R = 1.55  # to the floor centre
PITCH = 2.6
TURNS = 2.25
RUN = PITCH * TURNS  # 5.85 of descent
TOP_GAP = 0.2  # chute starts this far below the column top

FLOOR_W = 1.2
WALL_H = 0.35
THICK = 0.12

WOOD_RGB = (0.55, 0.40, 0.27)


def channel_profile(radius: float):
    """The U-channel as a closed wire, seated on the XZ plane at `radius`."""
    xi, xo = FLOOR_W / 2, FLOOR_W / 2 + THICK
    yb, yt = -THICK / 2, THICK / 2
    top = yt + WALL_H
    return (
        cq.Workplane("XZ")
        .center(radius, 0)
        .polyline(
            [
                (-xo, yb),
                (xo, yb),
                (xo, top),
                (xi, top),
                (xi, yt),
                (-xi, yt),
                (-xi, top),
                (-xo, top),
            ]
        )
        .close()
    )


def build():
    helix = cq.Wire.makeHelix(pitch=PITCH, height=RUN, radius=HELIX_R)
    chute = (
        channel_profile(HELIX_R)
        .sweep(cq.Workplane(obj=helix), isFrenet=True)
        .val()
        .translate((0, 0, COL_H - TOP_GAP - RUN))
    )
    column = cq.Solid.makeCylinder(COL_R, COL_H)
    return stand_on_floor(
        [Part("ramp", cq.Compound.makeCompound([column, chute]), WOOD_RGB)]
    )


if __name__ == "__main__":
    with Stopwatch() as sw:
        parts = build()
    bake(
        "B3",
        "helix",
        parts,
        tol=0.004,
        ang=0.3,
        route="stl-convert",
        build_seconds=sw.seconds,
        notes=(
            "One native sweep: cq.Wire.makeHelix + MakePipeShell in Frenet "
            "mode. Exact helical spine, banked channel, planar end cuts for "
            "free. Column and chute are disjoint by 0.33 because that is what "
            "r1.55 / floor 1.2 / column r0.5 imply; shipped as one compound."
        ),
    )
