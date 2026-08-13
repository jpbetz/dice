# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B4 gnarl — organic.

A gnarled stump, built as one closed surface of revolution whose radius is
modulated by angle (the root flares) and then pushed around by two layers of
Blender's native Clouds noise through Displace modifiers. No booleans are used
anywhere, so there is no hard CSG edge to find.

The profile polyline is smoothed before it is spun, which is what keeps the
trunk/root and trunk/rim transitions from reading as creases.

Colour: COLOR_0, bark vs the paler sawn top.

    blender -b --factory-startup --python-exit-code 1 --python B4_gnarl.py
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402

# --- parameters -----------------------------------------------------------
HEIGHT = 2.60             # rim height
TOP_DISH = 0.10           # how far the sawn top dips in the middle
TOP_R = 0.62              # flat-ish top radius before the rim rounds over
BASE_R = 1.02             # + root bulges + noise lands the spread near 3.0
RINGS = 100               # density knob: samples down the profile
SEGMENTS = 120            # density knob: samples around

# root flares: (angle, extra radius, angular half-width)
ROOTS = [(0.35, 0.52, 0.30), (1.62, 0.41, 0.25), (2.85, 0.58, 0.33),
         (4.05, 0.38, 0.23), (5.25, 0.47, 0.28)]
ROOT_TOP = 1.05           # roots have faded out by this height

BARK_SCALE, BARK_AMP = 0.34, 0.08     # spec: feature >= 0.07u, amplitude ~0.08
GNARL_SCALE, GNARL_AMP = 1.15, 0.10   # slow lumps, for the silhouette

BARK_RGB = (0.29, 0.20, 0.13)
TOP_RGB = (0.72, 0.57, 0.38)


def base_profile():
    """(radius, height) samples from the top pole round to the bottom pole.

    Four stretches, sampled densely and then relaxed, so the joins between
    them become curvature-continuous instead of creases.
    """
    pts = []

    # 1. sawn top, dished: centre sits TOP_DISH below the rim
    n = RINGS // 5
    for i in range(n):
        u = i / n
        pts.append((TOP_R * u, HEIGHT - TOP_DISH * math.cos(u * math.pi / 2) ** 2))

    # 2. rim round-over, quarter ellipse out and down
    n = RINGS // 6
    for i in range(n + 1):
        a = (i / n) * math.pi / 2
        pts.append((TOP_R + 0.17 * math.sin(a), HEIGHT - 0.20 * (1 - math.cos(a))))

    # 3. trunk, swelling gently as it falls
    n = RINGS // 2
    z0, r0 = pts[-1][1], pts[-1][0]
    for i in range(1, n + 1):
        u = i / n
        z = z0 - (z0 - 0.10) * u
        # cubic ease so the flare into the roots has no kink at either end
        pts.append((r0 + (BASE_R - r0) * (u ** 2.6), z))

    # 4. bottom round-over and the flat underside back to the axis
    n = RINGS // 8
    for i in range(1, n + 1):
        a = (i / n) * math.pi / 2
        pts.append((BASE_R + 0.06 * math.cos(a) - 0.06, 0.10 * (1 - math.sin(a))))
    r_edge = pts[-1][0]          # read ONCE: reading pts[-1] inside the loop
    n = RINGS // 6               # compounds the taper and collapses the disc
    for i in range(1, n + 1):
        pts.append((r_edge * (1 - i / n), 0.0))

    return relax(pts, passes=6)


def relax(pts, passes):
    """Laplacian smoothing on the interior points; the two poles are pinned."""
    for _ in range(passes):
        out = [pts[0]]
        for i in range(1, len(pts) - 1):
            out.append((0.25 * pts[i - 1][0] + 0.5 * pts[i][0] + 0.25 * pts[i + 1][0],
                        0.25 * pts[i - 1][1] + 0.5 * pts[i][1] + 0.25 * pts[i + 1][1]))
        out.append(pts[-1])
        pts = out
    return pts


def smoothstep(x, lo, hi):
    t = min(1.0, max(0.0, (x - lo) / (hi - lo)))
    return t * t * (3.0 - 2.0 * t)


def root_bulge(theta, r, z):
    """Extra radius from the root flares — a sum of angular gaussians."""
    if z >= ROOT_TOP:
        return 0.0
    fade = (1.0 - z / ROOT_TOP) ** 1.7
    taper = min(1.0, r / 0.45)          # dies out at the poles
    total = 0.0
    for ang, amp, width in ROOTS:
        d = (theta - ang + math.pi) % (2 * math.pi) - math.pi
        total += amp * math.exp(-(d / width) ** 2)
    return total * fade * taper


def build_stump():
    profile = base_profile()
    verts, faces = [], []

    verts.append((0.0, 0.0, profile[0][1]))          # top pole
    ring_start = []
    interior = profile[1:-1]
    for r, z in interior:
        ring_start.append(len(verts))
        for j in range(SEGMENTS):
            theta = 2 * math.pi * j / SEGMENTS
            rr = r + root_bulge(theta, r, z)
            verts.append((rr * math.cos(theta), rr * math.sin(theta), z))
    bottom_pole = len(verts)
    verts.append((0.0, 0.0, profile[-1][1]))

    # Winding matters: rings run top-to-bottom and j increases anticlockwise,
    # so the outward-facing order is (upper_j, lower_j, lower_k, upper_k).
    # Getting this backwards produces a watertight, correct-looking, utterly
    # inside-out solid — see F.assert_outward.
    first = ring_start[0]
    for j in range(SEGMENTS):
        k = (j + 1) % SEGMENTS
        faces.append((0, first + j, first + k))
    for a, b in zip(ring_start, ring_start[1:]):
        for j in range(SEGMENTS):
            k = (j + 1) % SEGMENTS
            faces.append((a + j, b + j, b + k, a + k))
    last = ring_start[-1]
    for j in range(SEGMENTS):
        k = (j + 1) % SEGMENTS
        faces.append((bottom_pole, last + k, last + j))

    ob = F.obj_from_pydata("stump", verts, faces)
    F.recalc_normals(ob)          # belt and braces on top of the winding above

    # Displace mask: leave the flat underside alone so the stump still sits
    # level, and ramp the bark in over the first 0.22 of height.
    vg = ob.vertex_groups.new(name="bark")
    for i, (_, _, z) in enumerate(verts):
        vg.add([i], min(1.0, max(0.0, (z - 0.02) / 0.22)), "REPLACE")
    return ob


def displace(ob, name, scale, amp, depth):
    tex = bpy.data.textures.new(name, type="CLOUDS")
    tex.noise_basis = "IMPROVED_PERLIN"    # positional noise: no seed, no drift
    tex.noise_scale = scale
    tex.noise_depth = depth
    md = ob.modifiers.new(name, "DISPLACE")
    md.texture = tex
    md.texture_coords = "LOCAL"
    md.direction = "NORMAL"
    md.mid_level = 0.5                     # so strength S gives +/- S/2
    md.strength = amp * 2.0
    md.vertex_group = "bark"
    return md


def main():
    F.reset()

    stump = build_stump()
    displace(stump, "gnarl", GNARL_SCALE, GNARL_AMP, 2)
    displace(stump, "bark", BARK_SCALE, BARK_AMP, 3)
    F.bake(stump)

    F.smooth_all(stump)                    # organic: not one sharp edge
    F.triangulate(stump)

    # Sawn top vs bark, as a function of VERTEX POSITION ONLY.
    # Two earlier versions keyed off poly.normal.z; a face normal is constant
    # across a face, so neighbouring faces disagreed at their shared corners
    # and the boundary came out as a hard sawtooth. Keying purely off the
    # corner's own position makes adjacent faces agree there, and the join
    # reads as the soft sapwood edge a real stump has.
    def bark_or_top(_poly, co):
        t = (smoothstep(co.z, 2.34, 2.54)
             * (1.0 - smoothstep(math.hypot(co.x, co.y), 0.66, 0.92)))
        return tuple(b + (s - b) * t for b, s in zip(BARK_RGB, TOP_RGB))

    F.paint_corners(stump, "Col", bark_or_top)
    F.single_material(stump, F.vertex_color_material("stump", "Col"))

    F.sit_on_ground([stump])
    F.report_bounds([stump], "B4")
    F.export_glb("B4_gnarl", [stump], vertex_colors=True)


main()
