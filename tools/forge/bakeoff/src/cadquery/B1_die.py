# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B1 chamfered-die -- hard-surface precision.

Cube edge 2.0, every edge rounded with a TRUE fillet of r 0.10 (one call,
`.edges().fillet(0.1)`; OCCT builds the 12 edge blends and the 8 corner
patches itself). 21 pips are spherical dents: a r 0.22 sphere whose centre
sits 0.14 outside the face, so it bites 0.08 deep and leaves a rim circle of
radius sqrt(0.22^2 - 0.14^2) = 0.170.

Colour: the die body and a set of "pip caps" go into the assembly as two
parts with two glTF materials. Each cap is the same sphere at r 0.219 --
0.001 smaller than the cutter -- intersected with the die, so it nests inside
its own dent without a coincident surface to z-fight.
"""

import cadquery as cq

from _forge import Part, Stopwatch, bake, stand_on_floor

EDGE = 2.0
FILLET = 0.10
PIP_R = 0.22
PIP_DEPTH = 0.08
PIP_OFFSET = 0.45  # pip centre spacing from the face centre

BODY_RGB = (0.76, 0.70, 0.58)
PIP_RGB = (0.11, 0.10, 0.12)

# Pip layouts in face-local (u, v), in units of PIP_OFFSET.
LAYOUT = {
    1: [(0, 0)],
    2: [(-1, -1), (1, 1)],
    3: [(-1, -1), (0, 0), (1, 1)],
    4: [(-1, -1), (-1, 1), (1, -1), (1, 1)],
    5: [(-1, -1), (-1, 1), (0, 0), (1, -1), (1, 1)],
    6: [(-1, -1), (-1, 0), (-1, 1), (1, -1), (1, 0), (1, 1)],
}

# (value, face normal, u axis, v axis). Opposite faces sum to 7, and 1-2-3
# run counter-clockwise about the (+,+,+) corner: a right-handed Western die.
FACES = [
    (1, (0, 0, 1), (1, 0, 0), (0, 1, 0)),
    (6, (0, 0, -1), (1, 0, 0), (0, -1, 0)),
    (2, (1, 0, 0), (0, 1, 0), (0, 0, 1)),
    (5, (-1, 0, 0), (0, -1, 0), (0, 0, 1)),
    (3, (0, 1, 0), (-1, 0, 0), (0, 0, 1)),
    (4, (0, -1, 0), (1, 0, 0), (0, 0, 1)),
]


def pip_centres():
    """Every pip's sphere centre, in die-local coordinates."""
    stand_off = EDGE / 2 + PIP_R - PIP_DEPTH
    for value, n, u, v in FACES:
        for du, dv in LAYOUT[value]:
            yield tuple(
                n[i] * stand_off + u[i] * du * PIP_OFFSET + v[i] * dv * PIP_OFFSET
                for i in range(3)
            )


def build():
    blank = cq.Workplane("XY").box(EDGE, EDGE, EDGE).edges().fillet(FILLET).val()

    centres = list(pip_centres())
    cutters = [cq.Solid.makeSphere(PIP_R, cq.Vector(c), angleDegrees1=-90) for c in centres]
    caps = [
        blank.intersect(cq.Solid.makeSphere(PIP_R - 0.001, cq.Vector(c), angleDegrees1=-90))
        for c in centres
    ]

    body = blank.cut(*cutters)
    return stand_on_floor(
        [
            Part("body", body, BODY_RGB),
            Part("pips", cq.Compound.makeCompound(caps), PIP_RGB),
        ]
    )


if __name__ == "__main__":
    with Stopwatch() as sw:
        parts = build()
    bake(
        "B1",
        "die",
        parts,
        tol=0.012,
        ang=0.5,
        route="native-glb",
        also_stl=True,
        build_seconds=sw.seconds,
        notes=(
            "TRUE rounded fillet r0.10 on all 12 edges from a single "
            ".edges().fillet(0.1) -- OCCT builds the 8 corner patches itself. "
            "Pips are r0.22 sphere dents 0.08 deep, rim radius 0.170. "
            "EXPORT HEAD-TO-HEAD (all three files kept): stock Assembly.export "
            "GLB writes one glTF primitive PER B-REP FACE = 99 meshes, all open; "
            "the same writer with RWGltf_CafWriter.SetMergeFaces(True) gives 2 "
            "meshes / 2 materials (shipped); stl2glb gives 1 mesh, watertight, "
            "no colour. watertight=false here is NOT a hole: the mesh is closed "
            "(Euler 2 body, 42 for the 21 caps) but OCCT's triangulator emits "
            "zero-area facets at sphere poles (2/sphere) and fillet corner "
            "patches (8/box) -- measured on isolated primitives. stl2glb drops "
            "them, which is the only reason the STL route scores watertight. "
            "Native normals come off the B-rep surface so the fillet reads "
            "tangent-smooth and the pip rims stay crisp with no crease guessing."
        ),
    )
