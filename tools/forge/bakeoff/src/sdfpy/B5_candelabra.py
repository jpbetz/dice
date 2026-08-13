"""B5 candelabra — the grammar item.

The tree is an ordinary recursive Python function that APPENDS primitives to a
list; nothing is instanced, transformed or joined.  At the end one
`union(*limbs, k=BLEND)` turns ~50 tapered capsules into a single organism,
and every junction is a smooth minimum, so "must not show open seams" is not
something that has to be arranged — a seam is not expressible here.

Reuse is by calling the function again with different arguments; the taper is
literally `radius * TAPER` on the recursive call.
"""

import os
import sys

import numpy as np
from sdf import Z, rounded_cylinder, slab, sphere, union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sdfkit as kit
from sdfkit import tapered_capsule

BASE_R, BASE_H = 0.70, 0.16
TRUNK_R, TRUNK_H = 0.22, 1.20
TAPER = 0.75  # radius factor per generation
ARMS, FORKS = 3, 2
SPREAD = np.radians(41)  # gen-1 lift-off angle from vertical (spec: 35-45)
FORK = np.radians(38)  # gen-2 half-angle, swung tangentially
UPNESS = 0.38  # how hard an arm curls back toward vertical
ARM_LEN, FORK_RATIO = 1.07, 0.70
BLEND = 0.075  # smooth-union radius where a branch meets its parent
SEG_BLEND = 0.02  # inside an arm the segments already meet, so barely any

PAN_R, PAN_H = 0.28, 0.07
CUP_R, CUP_BORE, CUP_H = 0.135, 0.065, 0.21  # 0.07 wall, at the visibility floor

limbs = []


def _unit(v):
    return np.asarray(v, float) / np.linalg.norm(v)


def _spin(v, axis, angle):
    """Rodrigues rotation of `v` about `axis` by `angle`."""
    v, k = np.asarray(v, float), _unit(axis)
    return v * np.cos(angle) + np.cross(k, v) * np.sin(angle) + k * (k @ v) * (1 - np.cos(angle))


def _sconce(tip):
    """Drip-pan plus candle cup, dished and bored by two more primitives."""
    z = tip[2]
    pan = rounded_cylinder(PAN_R, 0.025, PAN_H).translate((tip[0], tip[1], z + PAN_H / 2))
    dish = sphere(1.2, (tip[0], tip[1], z + PAN_H + 1.165))  # shallow: big radius
    cup = rounded_cylinder(CUP_R, 0.02, CUP_H).translate((tip[0], tip[1], z + CUP_H / 2))
    bore = rounded_cylinder(CUP_BORE, 0.015, CUP_H).translate((tip[0], tip[1], z + CUP_H / 2 + 0.09))
    return ((pan - dish) | cup) - bore


def grow(origin, direction, length, radius, depth, steps=6):
    """Sweep one arm as a chain of round cones, then fork or finish.

    Returns the SDF for this whole subtree, so the recursion composes fields
    rather than mutating a global list.
    """
    p, d = np.asarray(origin, float), _unit(direction)
    segments = []
    for i in range(steps):
        lean = _unit(d + (Z - d) * (UPNESS * (i + 1) / steps))  # curl toward vertical
        nxt = p + lean * (length / steps)
        r0 = radius * (1 - (1 - TAPER) * i / steps)
        r1 = radius * (1 - (1 - TAPER) * (i + 1) / steps)
        segments.append(tapered_capsule(tuple(p), tuple(nxt), r0, r1))
        p, d = nxt, lean
    # consecutive segments already share an endpoint AND a radius, so joining
    # them with the junction blend would only bead the arm.  Barely blend.
    arm = union(*segments, k=SEG_BLEND)

    if depth == 0:
        return union(arm, _sconce(p), k=SEG_BLEND)
    radial = _unit([d[0], d[1], 0]) if np.hypot(d[0], d[1]) > 1e-9 else np.array([1.0, 0, 0])
    children = [  # swing the children tangentially so the 6 tips ring evenly
        grow(p, _spin(d, radial, FORK * (2 * i / (FORKS - 1) - 1)),
             length * FORK_RATIO, radius * TAPER, depth - 1)
        for i in range(FORKS)
    ]
    return union(arm, *children, k=BLEND)


# --- base and trunk, then three arms ----------------------------------------
limbs.append(rounded_cylinder(BASE_R, 0.05, BASE_H).translate(Z * (BASE_H / 2)))
limbs.append(tapered_capsule((0, 0, BASE_H * 0.4), (0, 0, BASE_H + TRUNK_H), TRUNK_R * 1.25, TRUNK_R))

for i in range(ARMS):
    az = 2 * np.pi * i / ARMS
    lift = _spin(Z, [-np.sin(az), np.cos(az), 0], SPREAD)  # tilt out by SPREAD
    limbs.append(grow((0, 0, BASE_H + TRUNK_H), lift, ARM_LEN, TRUNK_R * TAPER, depth=1))

# the trunk's start cap is a sphere and pokes below the base; trim it flat so
# the model closes inside the sample box rather than against its wall
candelabra = union(*limbs, k=BLEND) & slab(z0=0.0)


if __name__ == "__main__":
    out = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "../../out/sdfpy/B5_candelabra.glb"
    )
    kit.report(
        "B5",
        kit.bake(
            candelabra,
            os.path.abspath(out),
            bounds=((-1.35, -1.35, -0.033), (1.35, 1.35, 3.42)),
            step=0.015,
            budget=20000,
            normals="field",
            angle=30.0,
        ),
    )
