# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B7 boolean-storm — robustness + performance.

A 3.0 cube, minus the 120 spheres in recipes/data/spheres.json, minus one 3x3x3
box rotated 25 degrees about the vertical to open the sponge up.

All 121 cutters go through ONE collection-mode Boolean modifier. Overlapping
cutters are fine for DIFFERENCE (A - B - C == A - (B | C)), so the whole storm
is a single modifier evaluation instead of 121 of them.

The sphere list is given in the spec's Y-up frame; every coordinate is mapped
through F.spec_to_blender on the way in.

Pass `-- --solver MANIFOLD` to bake with 4.5's new manifold solver instead of
the exact one, for comparison.

    blender -b --factory-startup --python-exit-code 1 --python B7_storm.py
"""

import json
import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402

CUBE_EDGE = 3.0
CUBE_CENTRE = (0.0, 1.5, 0.0)          # spec frame (Y-up)
KNIFE_EDGE = 3.0
KNIFE_CENTRE = (1.8, 2.7, 0.0)         # spec frame
KNIFE_YAW = math.radians(25.0)         # about spec +Y == Blender +Z

SPHERE_SEGMENTS = 32                   # density knob for every cutter sphere
SPHERE_RINGS = 16

STONE = (0.58, 0.57, 0.60)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SOLVER = argv[argv.index("--solver") + 1] if "--solver" in argv else "EXACT"


def box(name, edge, centre_spec, yaw=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(
        bm, size=edge,
        matrix=(Matrix.Translation(F.spec_to_blender(*centre_spec))
                @ Matrix.Rotation(yaw, 4, "Z")))
    return F.obj_from_bmesh(name, bm)


def load_spheres():
    with open(os.path.join(F.DATA_DIR, "spheres.json")) as fh:
        data = json.load(fh)
    out = []
    for i, s in enumerate(data):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(
            bm, u_segments=SPHERE_SEGMENTS, v_segments=SPHERE_RINGS,
            radius=s["r"],
            matrix=Matrix.Translation(F.spec_to_blender(s["x"], s["y"], s["z"])))
        out.append(F.obj_from_bmesh(f"s{i:03d}", bm))
    return out


def main():
    F.reset()

    block = box("block", CUBE_EDGE, CUBE_CENTRE)
    cutters = load_spheres()
    cutters.append(box("knife", KNIFE_EDGE, KNIFE_CENTRE, KNIFE_YAW))
    cutter_tris = sum(len(o.data.polygons) for o in cutters)
    print(f"[B7] solver={SOLVER}  cutters={len(cutters)}  "
          f"cutter faces={cutter_tris}")

    t0 = time.time()
    F.boolean_collection(block, cutters, op="DIFFERENCE", solver=SOLVER)
    print(f"[B7] boolean itself: {time.time() - t0:.2f}s")

    nonman, volume = F.manifold_report(block)
    print(f"[B7] straight out of the boolean: non-manifold edges={nonman} "
          f"volume={volume:.4f} faces={len(block.data.polygons)}")
    if nonman:
        F.clean_slivers(block)
        print(f"[B7] REPAIR WAS NEEDED, after: {F.manifold_report(block)}")
    else:
        print("[B7] no repair needed")

    F.canonicalize(block)
    F.smooth_by_angle(block, 30.0)     # dents smooth, cube faces flat
    F.triangulate(block)
    block.data.materials.append(F.material("stone", STONE, roughness=0.8))

    F.sit_on_ground([block], center_xy=False)
    F.report_bounds([block], "B7")
    F.export_glb("B7_storm", [block])


main()
