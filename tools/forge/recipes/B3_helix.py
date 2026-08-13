# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B3 helix-ramp — sweeps/lofts.

Uses Blender's native sweep: a POLY curve for the helical path, a second
closed POLY curve as its `bevel_object` (the U-channel cross-section), and
`use_fill_caps` for the planar end cuts. `twist_mode='Z_UP'` keeps the channel
floor level all the way down instead of rolling with the helix.

    blender -b --factory-startup --python-exit-code 1 --python B3_helix.py
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402

# --- parameters -----------------------------------------------------------
COLUMN_R = 0.5
COLUMN_H = 8.0
COLUMN_SEGMENTS = 64

HELIX_R = 1.55          # to the centre of the channel floor
PITCH = 2.6             # rise per turn
TURNS = 2.25
STEPS_PER_TURN = 72     # density knob for the sweep
TOP_Z = 7.8             # floor top at the start, just under the column top

FLOOR_W = 1.2
WALL_H = 0.35
THICK = 0.12

RAMP_RGB = (0.55, 0.42, 0.30)
COLUMN_RGB = (0.48, 0.46, 0.44)

# U-channel cross-section, (across, up), floor top surface at up = 0.
# Traced as one closed loop: up the left wall, across the floor, up the
# right wall, then back along the underside.
HALF = FLOOR_W / 2.0
PROFILE = [
    (-HALF, WALL_H),
    (-HALF + THICK, WALL_H),
    (-HALF + THICK, 0.0),
    (HALF - THICK, 0.0),
    (HALF - THICK, WALL_H),
    (HALF, WALL_H),
    (HALF, -THICK),
    (-HALF, -THICK),
]


def poly_curve(name, points, cyclic=False):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    spline = cu.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, (x, y, z) in zip(spline.points, points):
        p.co = (x, y, z, 1.0)
    spline.use_cyclic_u = cyclic
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    return ob


def curve_to_mesh(curve_obj, name):
    """Evaluate a curve (bevel and all) into a real mesh, no operator context."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(curve_obj.evaluated_get(dg), depsgraph=dg)
    me.name = name
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    F.delete(curve_obj)
    return ob


def build_chute():
    steps = int(round(TURNS * STEPS_PER_TURN))
    path_pts = []
    for i in range(steps + 1):
        t = i / STEPS_PER_TURN                 # turns travelled
        ang = 2.0 * math.pi * t
        path_pts.append((HELIX_R * math.cos(ang), HELIX_R * math.sin(ang),
                         TOP_Z - PITCH * t))
    path = poly_curve("chute_path", path_pts)

    # bevel_object is read in its own local XY plane; the sweep puts local +Y
    # up (that is what Z_UP twist pins) and local +X across the channel.
    profile = poly_curve("chute_profile", [(x, y, 0.0) for x, y in PROFILE], cyclic=True)

    cu = path.data
    cu.bevel_mode = "OBJECT"
    cu.bevel_object = profile
    cu.use_fill_caps = True     # planar end cuts -> closed solid
    cu.twist_mode = "Z_UP"      # channel floor stays level, no roll
    cu.resolution_u = 1         # POLY: one segment per authored point

    chute = curve_to_mesh(path, "chute")
    F.delete(profile)
    return chute


def main():
    F.reset()

    chute = build_chute()
    chute.data.materials.append(F.material("ramp", RAMP_RGB, roughness=0.7))

    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=COLUMN_SEGMENTS,
                          radius1=COLUMN_R, radius2=COLUMN_R, depth=COLUMN_H,
                          matrix=Matrix.Translation((0, 0, COLUMN_H / 2)))
    column = F.obj_from_bmesh("column", bm)
    column.data.materials.append(F.material("column", COLUMN_RGB, roughness=0.8))

    for ob in (chute, column):
        F.smooth_by_angle(ob, 20.0)
        F.triangulate(ob)

    F.sit_on_ground([chute, column], center_xy=False)
    F.report_bounds([chute], "B3 chute")
    F.report_bounds([chute, column], "B3 all")
    F.export_glb("B3_helix", [chute, column])


main()
