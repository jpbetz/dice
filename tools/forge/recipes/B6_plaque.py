# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B6 plaque — text on a curved surface.

The bow is a vertical cylinder of radius 4. Everything else is expressed
against that radius, which is what makes the engraving follow the curve
instead of cutting flat into it:

    r 3.75 .. 4.06   the blank, thickest at the border
    r 4.00 .. out    removed inside the border -> a 0.06 raised frame
    r 3.95 .. out    removed inside the letters -> "DICE" engraved 0.05 deep

The last one is the trick worth naming. A flat text prism cannot engrave a
constant depth into a bowed face — across the 1.5-unit width of the word the
face falls away by 0.08, more than the 0.05 depth, so a flat cut would miss
the surface entirely at the ends. Intersecting the text prism with the region
OUTSIDE a radius-3.95 cylinder gives a cutter whose floor is itself bowed, so
the engraving is 0.05 deep everywhere.

No union anywhere: the frame is what is left after the recess is cut, not a
part stuck on, which avoids a coplanar-face union along the plaque edges.

    blender -b --factory-startup --python-exit-code 1 --python B6_plaque.py
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402

# --- parameters -----------------------------------------------------------
WIDTH, HEIGHT, THICK = 2.6, 1.8, 0.25
BOW_R = 4.0                     # radius of the bowed face
FRAME_W, FRAME_RAISE = 0.18, 0.06
ENGRAVE_DEPTH = 0.05
TEXT = "DICE"
TEXT_SIZE = 0.62

R_FACE = BOW_R                          # recessed panel surface
R_FRAME = BOW_R + FRAME_RAISE           # proud face of the border
R_BACK = BOW_R - THICK                  # flat-ish back
R_ENGRAVE = BOW_R - ENGRAVE_DEPTH

# put the deepest point of the front face just in front of y=0
AXIS_Y = BOW_R - THICK / 2.0
ARC_SAMPLES = 56                # density knob for the bow
CYL_SEGMENTS = 512              # density knob for the engraving floor

BRONZE = (0.44, 0.33, 0.19)


def curved_prism(name, r_in, r_out, x_half, z0, z1, samples=ARC_SAMPLES):
    """Solid bounded by two coaxial cylinder surfaces, cut by two vertical
    planes at x = +/-x_half and two horizontal planes at z0/z1.

    Both arcs are trimmed at the SAME x, so the sides come out as true flat
    planes rather than as radial cuts.
    """
    def arc(radius):
        return [(-x_half + 2 * x_half * i / samples,
                 AXIS_Y - math.sqrt(max(radius ** 2 - (-x_half + 2 * x_half * i / samples) ** 2,
                                        0.0)))
                for i in range(samples + 1)]

    profile = arc(r_out) + list(reversed(arc(r_in)))

    bm = bmesh.new()
    lower = [bm.verts.new((x, y, z0)) for x, y in profile]
    upper = [bm.verts.new((x, y, z1)) for x, y in profile]
    bm.faces.new(list(reversed(lower)))
    bm.faces.new(upper)
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return F.obj_from_bmesh(name, bm)


def text_solid(name):
    """Blender FONT object -> an extruded mesh solid, standing in the XZ plane."""
    cu = bpy.data.curves.new(name, type="FONT")
    cu.body = TEXT
    cu.size = TEXT_SIZE
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = 0.30              # +/-0.30 along the letter's own normal
    cu.resolution_u = 12           # density knob for the letter outlines
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    # a FONT curve lies in its local XY and extrudes along local Z; rotating
    # +90 deg about X puts it in world XZ facing -Y, which is the spec's front
    ob.matrix_world = (Matrix.Translation((0.0, -0.15, HEIGHT / 2.0))
                       @ Matrix.Rotation(math.radians(90), 4, "X"))

    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    me.transform(ob.matrix_world)          # bake the placement into the verts
    F.delete(ob)
    solid = bpy.data.objects.new(name + "_mesh", me)
    bpy.context.collection.objects.link(solid)
    return solid


def cylinder_z(name, radius, segments=CYL_SEGMENTS, height=6.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius, depth=height,
                          matrix=Matrix.Translation((0, AXIS_Y, HEIGHT / 2.0)))
    return F.obj_from_bmesh(name, bm)


def main():
    F.reset()

    blank = curved_prism("blank", R_BACK, R_FRAME, WIDTH / 2, 0.0, HEIGHT)

    # recess the panel: what survives around it IS the raised border
    recess = curved_prism("recess", R_FACE, R_FRAME + 0.3,
                          WIDTH / 2 - FRAME_W, FRAME_W, HEIGHT - FRAME_W)

    # engraving cutter = the part of the text prism lying outside r 3.95,
    # so its floor is bowed exactly like the face it cuts into
    letters = text_solid("letters")
    lo, hi = F.world_bounds([letters])
    print(f"[B6] '{TEXT}' spans x {lo.x:.3f}..{hi.x:.3f}  z {lo.z:.3f}..{hi.z:.3f}")
    F.boolean(letters, cylinder_z("floor", R_ENGRAVE), op="DIFFERENCE", solver="EXACT")

    F.boolean_collection(blank, [recess, letters], op="DIFFERENCE", solver="EXACT")
    F.clean_slivers(blank)
    F.canonicalize(blank)
    print("[B6] non-manifold edges, signed volume:", F.manifold_report(blank))

    F.smooth_by_angle(blank, 20.0)     # the bow reads smooth, every cut stays sharp
    F.triangulate(blank)
    blank.data.materials.append(F.material("bronze", BRONZE, roughness=0.5, metallic=0.6))

    F.sit_on_ground([blank])
    F.report_bounds([blank], "B6")
    F.export_glb("B6_plaque", [blank])


main()
