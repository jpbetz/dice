# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B2 turret — architectural CSG + arrays.

Everything is cut, not stacked. The tower is one solid of revolution (shaft
unioned with the base flare); then a SINGLE collection-difference removes the
lot: the inner bore, the eight crenel gaps that leave eight merlons behind,
three arrow-slit recesses, and the arched doorway.

Cutting the crenels rather than unioning merlon blocks onto the rim is the
point: a union would put merlon faces exactly coplanar and co-cylindrical
with the shaft it sits on, which is the fragile case for any CSG kernel.
Subtracting the gaps has every cutter crossing the wall transversally.

    blender -b --factory-startup --python-exit-code 1 --python B2_turret.py
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402

# --- parameters -----------------------------------------------------------
R_OUT = 1.6
WALL = 0.35
R_IN = R_OUT - WALL          # 1.25
HEIGHT = 10.0                # total, merlon tops included
SEGMENTS = 96                # density knob for every round surface

FLARE_R = 2.1
FLARE_H = 1.2

MERLONS = 8
MERLON_W = 0.55
MERLON_H = 0.7
# gap cutters are flat-sided boxes, so a merlon's tangential width is
# (pitch chord at mid-wall) - (gap width). Solve the gap width for w=0.55.
R_MID = (R_OUT + R_IN) / 2.0
PITCH_CHORD = 2.0 * R_MID * math.sin(math.pi / MERLONS)
GAP_W = PITCH_CHORD - MERLON_W

SLIT_W, SLIT_H, SLIT_DEPTH = 0.15, 0.9, 0.12
# (angle about the tower, centre height) — deliberately irregular
SLITS = [(math.radians(35.0), 3.15), (math.radians(158.0), 5.40),
         (math.radians(263.0), 7.05)]

DOOR_W, DOOR_H = 1.1, 2.2
DOOR_ANGLE = math.radians(-90.0)   # Blender -Y == spec +Z == "front"

STONE_RGB = (0.62, 0.60, 0.55)


# --- primitive shorthands -------------------------------------------------

def cone_obj(name, r1, r2, depth, z_centre, segments=SEGMENTS):
    """Cylinder/frustum about the Z axis, spun half a segment off phase.

    The half-segment offset is a fix, not a flourish. The doorway is mirror-
    symmetric about the x=0 plane and 96 is divisible by 4, so without it a
    facet edge of the shaft lies exactly on the arch's mirror plane; the
    boolean then pinched two edges into 4-face non-manifold junctions. Turning
    the polygon so x=0 crosses the MIDDLE of a facet removes the coincidence.
    """
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=r1, radius2=r2, depth=depth,
                          matrix=(Matrix.Translation((0, 0, z_centre))
                                  @ Matrix.Rotation(math.pi / segments, 4, "Z")))
    return F.obj_from_bmesh(name, bm)


def box_obj(name, size, matrix):
    """Axis-aligned box of `size`, then placed by `matrix`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=size)
    bmesh.ops.transform(bm, verts=bm.verts, matrix=matrix)
    return F.obj_from_bmesh(name, bm)


def radial_frame(angle, radius, height):
    """Frame at `angle` on the tower: local +X points outward, +Z is up.

    Local +Y is therefore tangential, which is the axis every wall-mounted
    cutter here measures its width along.
    """
    return (Matrix.Translation((math.cos(angle) * radius, math.sin(angle) * radius, height))
            @ Matrix.Rotation(angle, 4, "Z"))


def arched_prism(name, width, height, depth, frame, arc_segments=14):
    """One solid shaped like an arched opening, extruded radially outward.

    Built as a single closed prism rather than box + tangent half-cylinder.
    A half-cylinder of radius w/2 sitting on a box of width w touches its
    sides along a line; the first version of this file did that and the
    zero-width contact left 20 degenerate faces and 18 non-manifold edges in
    the result. One profile, no tangency.

    Local frame: +X radial (extrusion), +Y tangential (width), +Z up, with
    the profile's z=0 at the sill.
    """
    a = width / 2.0
    spring = height - a
    profile = [(-a, 0.0), (a, 0.0), (a, spring)]
    profile += [(a * math.cos(math.pi * i / arc_segments),
                 spring + a * math.sin(math.pi * i / arc_segments))
                for i in range(1, arc_segments)]
    profile.append((-a, spring))

    bm = bmesh.new()
    back = [bm.verts.new((-depth / 2.0, y, z)) for y, z in profile]
    front = [bm.verts.new((depth / 2.0, y, z)) for y, z in profile]
    bm.faces.new(list(reversed(back)))
    bm.faces.new(front)
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((back[i], back[j], front[j], front[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.transform(bm, verts=bm.verts, matrix=frame)
    return F.obj_from_bmesh(name, bm)


# --- the cutters ----------------------------------------------------------

def crenel_gaps():
    """Eight boxes across the rim; what survives between them are the merlons."""
    out = []
    for i in range(MERLONS):
        angle = 2 * math.pi * (i + 0.5) / MERLONS
        frame = radial_frame(angle, 0.0, HEIGHT - MERLON_H / 2 + 0.5)
        # radial 0.8..2.5 (clears both wall faces), tangential GAP_W,
        # vertical 1.0 so it opens out through the top
        out.append(box_obj(f"crenel{i}", (1.7, GAP_W, 1.0 + MERLON_H),
                           frame @ Matrix.Translation((1.65, 0, 0))))
    return out


def arrow_slits():
    """Recesses only: SLIT_DEPTH (0.12) is well under WALL (0.35).

    The cutter reaches inward only to R_OUT - SLIT_DEPTH, so it cannot pierce
    into the shaft however deep the arch goes.
    """
    r0, r1 = R_OUT - SLIT_DEPTH, R_OUT + 0.6
    return [arched_prism(f"slit{i}", SLIT_W, SLIT_H, r1 - r0,
                         radial_frame(angle, (r0 + r1) / 2.0, z - SLIT_H / 2))
            for i, (angle, z) in enumerate(SLITS)]


def doorway():
    """Arched tunnel: runs from inside the bore clear through the flare."""
    r0, r1 = 0.9, FLARE_R + 0.4
    return [arched_prism("door", DOOR_W, DOOR_H, r1 - r0,
                         radial_frame(DOOR_ANGLE, (r0 + r1) / 2.0, 0.0),
                         arc_segments=20)]


def main():
    F.reset()

    # solid blank: shaft + flared base, unioned
    tower = cone_obj("tower", R_OUT, R_OUT, HEIGHT, HEIGHT / 2)
    flare = cone_obj("flare", FLARE_R, R_OUT, FLARE_H, FLARE_H / 2)
    F.boolean(tower, flare, op="UNION", solver="EXACT")

    # one bore cutter, running past both ends so it opens top and bottom
    bore = cone_obj("bore", R_IN, R_IN, HEIGHT + 2.0, HEIGHT / 2)

    cutters = [bore] + crenel_gaps() + arrow_slits() + doorway()
    print(f"[B2] one collection-difference with {len(cutters)} cutters")
    F.boolean_collection(tower, cutters, op="DIFFERENCE", solver="EXACT")
    F.canonicalize(tower)

    F.smooth_by_angle(tower, 15.0)   # shaft/bore smooth, every cut edge sharp
    F.triangulate(tower)
    tower.data.materials.append(F.material("stone", STONE_RGB, roughness=0.85))

    F.sit_on_ground([tower], center_xy=False)   # keep the axis on the origin
    F.report_bounds([tower], "B2")
    F.export_glb("B2_turret", [tower])


main()
