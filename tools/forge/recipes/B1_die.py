# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B1 chamfered-die — hard-surface precision.

Cube edge 2.0, rounded fillet r 0.10 (Bevel modifier, 3 segments, circular
profile), 21 pips cut as spherical dents: sphere r 0.22 whose centre sits
1.14 from the die centre, so it bites 1.22 - 1.14 = 0.08 deep.
Opposite faces sum to 7. Pip faces get a second, darker material via the
boolean modifier's TRANSFER material mode.

    blender -b --factory-startup --python-exit-code 1 --python B1_die.py
"""

import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402

# --- parameters -----------------------------------------------------------
EDGE = 2.0
HALF = EDGE / 2.0
FILLET_R = 0.10
FILLET_SEGMENTS = 3          # density knob: fillet smoothness
PIP_R = 0.22
PIP_DEPTH = 0.08
PIP_SPACING = 0.45           # pip offset from face centre, in-plane
PIP_SEGMENTS = 28            # density knob: dent rim + cap smoothness
PIP_RINGS = 14

# centre distance that yields exactly PIP_DEPTH of bite into a face at HALF
PIP_CENTRE_D = HALF + PIP_R - PIP_DEPTH

BODY_RGB = (0.86, 0.80, 0.66)   # bone
PIP_RGB = (0.13, 0.11, 0.10)    # near-black

# Standard d6: 1-6, 2-5, 3-4 on opposite faces. Each entry is
# (value, face normal, in-plane u, in-plane v).
FACES = [
    (1, Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0))),
    (6, Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, -1, 0))),
    (2, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))),
    (5, Vector((-1, 0, 0)), Vector((0, -1, 0)), Vector((0, 0, 1))),
    (3, Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1))),
    (4, Vector((0, 1, 0)), Vector((-1, 0, 0)), Vector((0, 0, 1))),
]

# pip pattern per value, in units of PIP_SPACING
S = 1.0
PATTERNS = {
    1: [(0, 0)],
    2: [(-S, -S), (S, S)],
    3: [(-S, -S), (0, 0), (S, S)],
    4: [(-S, -S), (-S, S), (S, -S), (S, S)],
    5: [(-S, -S), (-S, S), (0, 0), (S, -S), (S, S)],
    6: [(-S, -S), (-S, 0), (-S, S), (S, -S), (S, 0), (S, S)],
}


def build_body():
    """Cube -> rounded-fillet die blank."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=EDGE)
    ob = F.obj_from_bmesh("die", bm)

    md = ob.modifiers.new("fillet", "BEVEL")
    md.offset_type = "OFFSET"        # on a 90 deg edge, offset == fillet radius
    md.width = FILLET_R
    md.segments = FILLET_SEGMENTS
    md.profile = 0.5                 # 0.5 = circular arc, i.e. a true fillet
    md.limit_method = "ANGLE"
    md.angle_limit = 0.52            # 30 deg
    md.miter_outer = "MITER_ARC"     # rounded corners, not a spike
    return F.bake(ob)


def build_pip_cutter():
    """All 21 dent spheres in ONE mesh, so the die needs ONE boolean."""
    bm = bmesh.new()
    for value, n, u, v in FACES:
        # rotation that swings a UV sphere's pole onto this face normal, so
        # the dent's rim is a clean N-gon circle rather than a lat/long mess
        rot = Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()
        for su, sv in PATTERNS[value]:
            centre = n * PIP_CENTRE_D + u * (su * PIP_SPACING) + v * (sv * PIP_SPACING)
            bmesh.ops.create_uvsphere(
                bm,
                u_segments=PIP_SEGMENTS,
                v_segments=PIP_RINGS,
                radius=PIP_R,
                matrix=Matrix.Translation(centre) @ rot,
            )
    return F.obj_from_bmesh("pips", bm)


def main():
    F.reset()

    die = build_body()
    cutter = build_pip_cutter()

    # Slot 0 = body, slot 1 = pips. The boolean's TRANSFER material mode
    # stamps the cutter's slot onto exactly the faces the cut creates, which
    # is a free, exact tag for "this face is inside a pip" — no guessing by
    # position afterwards.
    die.data.materials.append(F.material("die_body", BODY_RGB, roughness=0.45))
    cutter.data.materials.append(F.material("die_pips", PIP_RGB, roughness=0.35))
    F.boolean(die, cutter, op="DIFFERENCE", solver="EXACT", material_mode="TRANSFER")
    F.canonicalize(die)   # EXACT boolean output order is not stable run to run

    pip_slots = {i for i, m in enumerate(die.data.materials) if m.name.startswith("die_pips")}
    print("[B1] slots after boolean:", [m.name for m in die.data.materials],
          "pip slots:", pip_slots)

    # 32 deg keeps the fillet (30 deg per bevel step) smooth while the dent
    # rims (~50 deg break) stay crisp.
    F.smooth_by_angle(die, 32.0)
    F.triangulate(die)

    # Convert that face tag into COLOR_0, then collapse to one material so
    # the GLB stays a single closed primitive (see F.single_material).
    F.paint_corners(die, "Col",
                    lambda poly, co: PIP_RGB if poly.material_index in pip_slots else BODY_RGB)
    F.single_material(die, F.vertex_color_material("die", "Col"))

    F.sit_on_ground([die])
    F.report_bounds([die], "B1")
    F.export_glb("B1_die", [die], vertex_colors=True)


main()
