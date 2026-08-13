# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B5 candelabra — recursion/grammar power.

The whole armature comes out of one recursive function, `grow()`, which emits
a tapered swept tube for a branch and then calls itself once per child with
the radius scaled by TAPER. Two generations: trunk -> 3 arms -> 6 tips.

Every emitted piece is a separate closed solid; they are unioned into one
watertight body, so no junction can show a seam. A blend sphere at each fork
rounds the crotch. Then one collection DIFFERENCE bores the six candle
sockets.

FORK HYGIENE (the thing that took three attempts). A branch does not stop at
the fork point: it overshoots by OVERSHOOT, and its children start exactly at
the fork point. Otherwise the parent's end cap and the child's start cap are
two discs sharing an exact centre, which is degenerate input — the union came
back with 400 non-manifold edges and inconsistent winding. For the same
reason siblings step SIBLING_OFFSET along their own heading before they
start, so three arms leaving one fork do not stack three cap centres on one
point either. Every one of those caps is then buried inside the fork's blend
sphere, touching nothing.

    blender -b --factory-startup --python-exit-code 1 --python B5_candelabra.py
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
BASE_R = 0.70
TRUNK_R = 0.22
TRUNK_TOP = 1.20
TAPER = 0.75              # radius factor per generation
ARMS = 3                  # first split
FORK = 2                  # second split
SPREAD_1 = math.radians(40.0)     # spec: 35-45 deg
SPREAD_2 = math.radians(36.0)
PAN_R = 0.28
CUP_R = 0.105
CUP_H = 0.20
SOCKET_R = 0.062
TOTAL_H = 3.20
OVERSHOOT = 0.055         # how far a branch runs past its own fork point
SIBLING_OFFSET = 0.045    # how far a child starts along its OWN heading
SIBLING_SKEW = 0.022      # lateral nudge so sibling axes are skew, not crossing

RING_SEGMENTS = 20        # density knob: around a branch
PATH_SAMPLES = 14         # density knob: along a branch
LATHE_SEGMENTS = 28       # density knob: around a lathed part

BRASS = (0.72, 0.56, 0.22)


# --- generic builders -----------------------------------------------------

def lathe(name, profile, segments=LATHE_SEGMENTS, origin=Vector((0, 0, 0))):
    """Solid of revolution. `profile` is (radius, z), traversed from the
    top pole, out over the outside, round to the bottom pole."""
    verts = [tuple(origin + Vector((0, 0, profile[0][1])))]
    ring_start = []
    for r, z in profile[1:-1]:
        ring_start.append(len(verts))
        for j in range(segments):
            a = 2 * math.pi * j / segments
            verts.append(tuple(origin + Vector((r * math.cos(a), r * math.sin(a), z))))
    bottom = len(verts)
    verts.append(tuple(origin + Vector((0, 0, profile[-1][1]))))

    faces = []
    first = ring_start[0]
    for j in range(segments):
        k = (j + 1) % segments
        faces.append((0, first + j, first + k))
    for a_i, b_i in zip(ring_start, ring_start[1:]):
        for j in range(segments):
            k = (j + 1) % segments
            faces.append((a_i + j, b_i + j, b_i + k, a_i + k))
    last = ring_start[-1]
    for j in range(segments):
        k = (j + 1) % segments
        faces.append((bottom, last + k, last + j))
    return F.recalc_normals(F.obj_from_pydata(name, verts, faces))


def tube(name, path, radii, segments=RING_SEGMENTS):
    """Sweep a circle of varying radius along a polyline, capped at both ends.

    The cross-section frame is parallel-transported from one sample to the
    next rather than rebuilt from a fixed world up, so a branch that bends
    past vertical does not flip its cross-section inside out.
    """
    n = len(path)
    tangents = []
    for i in range(n):
        if i == 0:
            t = path[1] - path[0]
        elif i == n - 1:
            t = path[-1] - path[-2]
        else:
            t = path[i + 1] - path[i - 1]
        tangents.append(t.normalized())

    ref = Vector((0, 0, 1)).cross(tangents[0])
    if ref.length < 1e-6:
        ref = Vector((1, 0, 0)).cross(tangents[0])
    normals = [ref.normalized()]
    for i in range(1, n):
        axis = tangents[i - 1].cross(tangents[i])
        nrm = normals[-1].copy()
        if axis.length > 1e-9:
            nrm.rotate(Matrix.Rotation(tangents[i - 1].angle(tangents[i]), 4,
                                       axis.normalized()))
        normals.append(nrm.normalized())

    verts, rings = [], []
    for i in range(n):
        u = normals[i]
        v = tangents[i].cross(u).normalized()
        rings.append(len(verts))
        for j in range(segments):
            a = 2 * math.pi * j / segments
            verts.append(tuple(path[i] + (u * math.cos(a) + v * math.sin(a)) * radii[i]))

    faces = []
    for a_i, b_i in zip(rings, rings[1:]):
        for j in range(segments):
            k = (j + 1) % segments
            faces.append((a_i + j, a_i + k, b_i + k, b_i + j))
    faces.append(tuple(reversed(range(rings[0], rings[0] + segments))))   # start cap
    faces.append(tuple(range(rings[-1], rings[-1] + segments)))           # end cap
    return F.recalc_normals(F.obj_from_pydata(name, verts, faces))


def blend_sphere(name, centre, radius, subdivisions=3):
    """Fork blend ball. ICO, deliberately, not UV.

    A branch is a circular tube coaxial with the fork, so on a UV sphere the
    circle where the two surfaces meet runs almost exactly along one latitude
    ring — a near-tangential intersection, which is what makes a CSG kernel
    emit zero-area slivers (measured: 6 faces of ~1e-10 area and 3 stray edges
    per fork). An icosphere has no ring for that circle to shadow.
    """
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius,
                               matrix=Matrix.Translation(centre))
    return F.obj_from_bmesh(name, bm)


def hermite(p0, m0, p1, m1, samples):
    """Cubic Hermite curve — start/end points with start/end tangents."""
    out = []
    for i in range(samples):
        t = i / (samples - 1)
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1
        h10 = t ** 3 - 2 * t ** 2 + t
        h01 = -2 * t ** 3 + 3 * t ** 2
        h11 = t ** 3 - t ** 2
        out.append(p0 * h00 + m0 * h10 + p1 * h01 + m1 * h11)
    return out


def launch_offset(parent_heading, child_dir):
    """Where a child branch actually starts, relative to the fork point.

    Two parts, both there to keep the union out of degenerate configurations:

    ALONG its own heading, so a child's start cap does not share a centre
    point with the parent's end cap or with a sibling's start cap.

    ACROSS, perpendicular to the plane the parent and child share, in opposite
    senses for the two siblings. Two tubes of EQUAL radius whose axes cross are
    tangent to each other at the crossing — a genuine singularity of the
    intersection curve, and the exact boolean emits slivers there. Nudging the
    axes to be skew rather than crossing removes the tangency. The radii stay
    exactly on the spec's x0.75 taper; only the launch point moves, by 0.02,
    inside a blend sphere that hides it.
    """
    lateral = parent_heading.cross(child_dir)
    across = lateral.normalized() * SIBLING_SKEW if lateral.length > 1e-6 else Vector((0, 0, 0))
    return child_dir.normalized() * SIBLING_OFFSET + across


# --- the grammar ----------------------------------------------------------

def grow(parts, sockets, origin, heading, radius, azimuth, depth):
    """Emit one branch, then recurse into its children.

    depth 0 = trunk, 1 = the three arms, 2 = the six tips, which terminate in
    a drip-pan and candle cup instead of branching again.
    """
    if depth == 0:
        top = Vector((0, 0, TRUNK_TOP))
        path = hermite(origin, Vector((0, 0, 1.0)), top + Vector((0, 0, OVERSHOOT)),
                       Vector((0, 0, 0.8)), PATH_SAMPLES)
        radii = [radius * (1.0 - 0.12 * i / (PATH_SAMPLES - 1)) for i in range(PATH_SAMPLES)]
        parts.append(tube("trunk", path, radii))
        parts.append(blend_sphere("fork0", top, radius * 1.30))
        for i in range(ARMS):
            grow(parts, sockets, top, heading, radius * TAPER,
                 2 * math.pi * i / ARMS, 1)
        return

    if depth == 1:
        end = Vector((math.cos(azimuth) * 0.66, math.sin(azimuth) * 0.66, 2.34))
        out = Vector((math.cos(azimuth), math.sin(azimuth), 0))
        start_dir = (out * math.sin(SPREAD_1) + Vector((0, 0, math.cos(SPREAD_1)))) * 1.5
        end_dir = out * 0.20 + Vector((0, 0, 1.15))
        path = hermite(origin + launch_offset(heading, start_dir), start_dir,
                       end + end_dir.normalized() * OVERSHOOT, end_dir, PATH_SAMPLES)
        radii = [radius * (1.0 - 0.10 * i / (PATH_SAMPLES - 1)) for i in range(PATH_SAMPLES)]
        parts.append(tube(f"arm_{azimuth:.2f}", path, radii))
        parts.append(blend_sphere(f"fork_{azimuth:.2f}", end, radius * 1.30))
        for i in range(FORK):
            side = -1 if i == 0 else 1
            grow(parts, sockets, end, (path[-1] - path[-2]).normalized(),
                 radius * TAPER, azimuth + side * SPREAD_2 * 0.85, 2)
        return

    # depth 2: a short tip, then the pan and cup it carries
    end = Vector((math.cos(azimuth) * 1.06, math.sin(azimuth) * 1.06,
                  TOTAL_H - CUP_H - 0.10))
    out = Vector((math.cos(azimuth), math.sin(azimuth), 0))
    start_dir = heading * 0.9 + out * 0.55
    path = hermite(origin + launch_offset(heading, start_dir), start_dir,
                   end, Vector((0, 0, 0.85)), PATH_SAMPLES)
    radii = [radius * (1.0 - 0.14 * i / (PATH_SAMPLES - 1)) for i in range(PATH_SAMPLES)]
    parts.append(tube(f"tip_{azimuth:.2f}", path, radii))

    # drip-pan: a dished disc that swallows the tip's end cap
    pan = [(0.0, 0.045), (PAN_R * 0.72, 0.055), (PAN_R * 0.95, 0.115),
           (PAN_R, 0.100), (PAN_R * 0.88, 0.030), (PAN_R * 0.40, -0.055),
           (0.0, -0.075)]
    parts.append(lathe(f"pan_{azimuth:.2f}", pan, origin=end))

    cup = [(0.0, CUP_H), (CUP_R * 0.92, CUP_H), (CUP_R, CUP_H - 0.03),
           (CUP_R * 0.86, 0.02), (CUP_R * 0.60, -0.02), (0.0, -0.03)]
    # 0.05, not 0.03: at 0.03 the cup's bottom pole landed exactly on the
    # tip's end-cap centre, the same degeneracy as at a fork.
    parts.append(lathe(f"cup_{azimuth:.2f}", cup, origin=end + Vector((0, 0, 0.05))))

    sockets.append(bore(f"socket_{azimuth:.2f}",
                        end + Vector((0, 0, CUP_H - 0.09))))


def bore(name, centre):
    """Cutter for a candle socket: open at the top, so it cuts a blind hole."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=LATHE_SEGMENTS,
                          radius1=SOCKET_R, radius2=SOCKET_R, depth=0.40,
                          matrix=Matrix.Translation(centre + Vector((0, 0, 0.20))))
    return F.obj_from_bmesh(name, bm)


def main():
    F.reset()

    foot = [(0.0, 0.30), (0.30, 0.30), (0.36, 0.17), (0.54, 0.13),
            (BASE_R, 0.06), (BASE_R, 0.0), (0.0, 0.0)]
    body = lathe("base", foot)

    parts, sockets = [], []
    grow(parts, sockets, Vector((0, 0, 0.10)), Vector((0, 0, 1)), TRUNK_R, 0.0, 0)
    print(f"[B5] grammar emitted {len(parts)} branch/fitting solids, "
          f"{len(sockets)} sockets")

    F.boolean_each(body, parts, op="UNION", solver="EXACT")
    F.boolean_collection(body, sockets, op="DIFFERENCE", solver="EXACT", name="sockets")
    F.clean_slivers(body)      # union leaves a few tangency flaps; see forge.clean_slivers
    F.canonicalize(body)

    F.smooth_by_angle(body, 34.0)
    F.triangulate(body)
    body.data.materials.append(F.material("brass", BRASS, roughness=0.35, metallic=0.85))

    F.sit_on_ground([body], center_xy=False)
    F.report_bounds([body], "B5")
    F.export_glb("B5_candelabra", [body])


main()
