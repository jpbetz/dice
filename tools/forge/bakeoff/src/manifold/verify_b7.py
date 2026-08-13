# Copyright 2026 The Dice Table Authors.
# Did the storm subtract what it was told to? Checks (a) every sphere centre
# that lies inside the block is hollow, (b) the rotated slab really removed its
# corner, (c) material survives where nothing was subtracted.
# All coordinates here are the exported world frame, same as spheres.json.
import json
import sys

import numpy as np
import trimesh

from _meshprobe import inside_mesh, report

spheres = json.load(open(sys.argv[2]))
mesh = trimesh.load(sys.argv[1], force="mesh")

SLAB_C = np.array([1.8, 2.7, 0.0])
SLAB_A = np.radians(25.0)


def in_slab(p):
    d = np.asarray(p) - SLAB_C
    # undo the rotation about Y
    x = d[0] * np.cos(-SLAB_A) + d[2] * np.sin(-SLAB_A)
    z = -d[0] * np.sin(-SLAB_A) + d[2] * np.cos(-SLAB_A)
    return abs(x) <= 1.5 and abs(d[1]) <= 1.5 and abs(z) <= 1.5


def in_block(p, m=0.0):
    return abs(p[0]) <= 1.5 - m and 0 + m <= p[1] <= 3 - m and abs(p[2]) <= 1.5 - m


checks = []
tested = 0
for i, s in enumerate(spheres):
    c = [s["x"], s["y"], s["z"]]
    if not in_block(c, 0.05) or in_slab(c):
        continue
    tested += 1
    if tested > 25:
        break
    checks.append((f"sphere {i} centre carved out", c, False))

# Points that must survive: inside the block, outside the slab, and at least
# 0.06 clear of every sphere.
rng = np.random.default_rng(7)
kept = 0
while kept < 12:
    p = np.array([rng.uniform(-1.45, 1.45), rng.uniform(0.05, 2.95),
                  rng.uniform(-1.45, 1.45)])
    if in_slab(p):
        continue
    if any(np.linalg.norm(p - [s["x"], s["y"], s["z"]]) < s["r"] + 0.06
           for s in spheres):
        continue
    kept += 1
    checks.append((f"solid at {np.round(p, 2).tolist()}", p.tolist(), True))

# The slab corner must be gone, and just outside it must not be.
def clear_of_spheres(p, margin=0.06):
    """A hand-picked 'must survive' point is only evidence if no sphere was
    ever going to remove it. The first version of this file asserted the block
    survives at (-1.4, 2.8, 0), which sits 0.056 INSIDE sphere 105."""
    for i, s in enumerate(spheres):
        if np.linalg.norm(np.asarray(p) - [s["x"], s["y"], s["z"]]) < s["r"] + margin:
            raise SystemExit(f"bad test point {p}: inside sphere {i}")
    if in_slab(p):
        raise SystemExit(f"bad test point {p}: inside the slab")
    return p


def find_clear(lo, hi, margin=0.06):
    """Deterministic search for a surviving point in a box."""
    for p in np.ndindex(9, 9, 9):
        q = [lo[i] + (hi[i] - lo[i]) * p[i] / 8 for i in range(3)]
        if in_slab(q):
            continue
        if all(np.linalg.norm(np.asarray(q) - [s["x"], s["y"], s["z"]]) >= s["r"] + margin
               for s in spheres):
            return q
    raise SystemExit(f"no clear point in {lo}..{hi}")


left = find_clear([-1.45, 2.5, -1.2], [-1.0, 2.95, 1.2])
under = find_clear([1.0, 0.1, -1.2], [1.45, 1.1, 1.2])
checks += [
    ("slab corner removed (1.3, 2.8, 0.0)", [1.3, 2.8, 0.0], False),
    ("slab corner removed (1.45, 2.0, 0.6)", [1.45, 2.0, 0.6], False),
    (f"block survives left of the slab at {np.round(left, 2).tolist()}", left, True),
    (f"block survives below the slab at {np.round(under, 2).tolist()}", under, True),
]
print(f"(checking {tested} sphere centres, {kept} interior points)")
sys.exit(report(mesh, checks))
