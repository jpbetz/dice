# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B2 turret -- architectural CSG + arrays.

Shaft outer r 1.6, wall 0.35 (bore r 1.25), TOTAL height 10.0 read literally:
the shaft stops at 9.3 and the 0.7 merlons finish the 10.0.

The four operations, in the order they matter:

1. shaft + base flare  -- a lofted cone r2.1 -> r1.6 over the bottom 1.2,
   fused to the cylinder, then the bore is cut through both at once so the
   flare is a solid moulding with the same 1.25 bore.
2. merlons -- eight boxes on a 45-degree radial array, each INTERSECTED with
   the wall annulus so its faces follow the curve instead of sitting proud.
   (A raw 0.55-wide box on r 1.425 overhangs r 1.6 by 0.023; the intersect
   costs one line and removes the artefact entirely.)
3. arrow slits -- flat-faced boxes cut 0.12 into a wall 0.35 thick. Blind by
   construction: the cutter's inner face stops at r 1.48, well outside the
   bore at 1.25, so nothing can pierce.
4. doorway -- an arched profile (rect + threePointArc) extruded radially
   through the wall only, y in [-1.8, -1.2], so the tunnel keeps its interior
   return instead of scything across the chamber.

Front is cad -Y, which is glTF +Z, so the doorway faces the camera.
"""

import cadquery as cq

from _forge import Part, Stopwatch, bake, stand_on_floor

R_OUT = 1.6
WALL = 0.35
R_IN = R_OUT - WALL
TOTAL_H = 10.0
MERLON_H = 0.7
SHAFT_H = TOTAL_H - MERLON_H

FLARE_R = 2.1
FLARE_H = 1.2

MERLON_W = 0.55
MERLON_COUNT = 8

SLIT_W, SLIT_H, SLIT_DEPTH = 0.15, 0.9, 0.12
SLITS = [(0.0, 3.4), (135.0, 5.1), (245.0, 6.8)]  # (degrees CCW from -Y, z of base)

DOOR_W, DOOR_H = 1.1, 2.2

STONE_RGB = (0.62, 0.60, 0.56)


def shaft_with_flare():
    """Cylinder + conical base moulding, bored through in one cut."""
    shaft = cq.Solid.makeCylinder(R_OUT, SHAFT_H)
    flare = cq.Solid.makeCone(FLARE_R, R_OUT, FLARE_H)
    bore = cq.Solid.makeCylinder(R_IN, TOTAL_H + 1, cq.Vector(0, 0, -0.5))
    return shaft.fuse(flare).cut(bore)


def wall_ring(z0: float, height: float) -> cq.Solid:
    """The annulus of wall between R_IN and R_OUT over a z span."""
    outer = cq.Solid.makeCylinder(R_OUT, height, cq.Vector(0, 0, z0))
    inner = cq.Solid.makeCylinder(R_IN, height + 2, cq.Vector(0, 0, z0 - 1))
    return outer.cut(inner)


def merlons():
    """Eight crenellation blocks, curved to the wall by intersection."""
    ring = wall_ring(SHAFT_H, MERLON_H)
    blocks = []
    for i in range(MERLON_COUNT):
        block = (
            cq.Workplane("XY")
            .box(MERLON_W, WALL + 0.2, MERLON_H, centered=(True, True, False))
            .val()
            .translate((0, -(R_IN + R_OUT) / 2, SHAFT_H))
            .rotate((0, 0, 0), (0, 0, 1), i * 360.0 / MERLON_COUNT)
        )
        blocks.append(ring.intersect(block))
    return blocks


def slit_cutters():
    """Blind arrow-slit recesses: cut in from the outside, stop inside the wall."""
    cutters = []
    for angle, z0 in SLITS:
        box = (
            cq.Workplane("XY")
            .box(SLIT_W, SLIT_DEPTH + 0.2, SLIT_H, centered=(True, True, False))
            .val()
            # inner face lands at R_OUT - SLIT_DEPTH; the +0.2 all pokes outward
            .translate((0, -(R_OUT - SLIT_DEPTH / 2 + 0.1), z0))
            .rotate((0, 0, 0), (0, 0, 1), angle)
        )
        cutters.append(box)
    return cutters


def doorway_cutter():
    """Arched tunnel prism, radial, wall-thickness deep only."""
    half = DOOR_W / 2
    spring = DOOR_H - half  # where the semicircular head starts
    return (
        cq.Workplane("XZ")
        .moveTo(-half, 0)
        .lineTo(half, 0)
        .lineTo(half, spring)
        .threePointArc((0, DOOR_H), (-half, spring))
        .close()
        .extrude(0.6)  # "XZ" extrudes along -Y
        .val()
        .translate((0, -1.2, 0))
    )


def build():
    tower = shaft_with_flare()
    for block in merlons():
        tower = tower.fuse(block)
    tower = tower.cut(*slit_cutters(), doorway_cutter())
    return stand_on_floor([Part("turret", tower.clean(), STONE_RGB)])


if __name__ == "__main__":
    with Stopwatch() as sw:
        parts = build()
    bake(
        "B2",
        "turret",
        parts,
        tol=0.0015,
        ang=0.35,
        route="stl-convert",
        build_seconds=sw.seconds,
        notes=(
            "Fuse + cut only, no fillets. Merlons intersected with the wall "
            "annulus so they follow the curve. Slits blind by construction "
            "(cutter inner face r 1.48 vs bore 1.25). Doorway is a rect + "
            "threePointArc profile extruded radially through the wall only."
        ),
    )
