# Copyright 2026 The Dice Table Authors.
# Point-containment checks for the baked turret, so "it looks fine" is never
# the evidence. World frame: Y up, front +Z. Authoring (x,y,z) -> (x, z, -y).
import sys

import numpy as np
import trimesh

m = trimesh.load(sys.argv[1], force="mesh")


def inside_mesh(mesh, points, direction=(0.3137, 0.5171, 0.7961)):
    """Parity ray-cast, vectorised. trimesh's own contains() needs rtree,
    which this venv does not have, so do Moller-Trumbore by hand."""
    tri = mesh.triangles
    v0, v1, v2 = tri[:, 0], tri[:, 1], tri[:, 2]
    e1, e2 = v1 - v0, v2 - v0
    d = np.array(direction, dtype=float)
    d /= np.linalg.norm(d)
    h = np.cross(d, e2)
    a = np.einsum("ij,ij->i", e1, h)
    par = np.abs(a) < 1e-12
    inv = np.where(par, 0.0, 1.0 / np.where(par, 1.0, a))
    out = []
    for p in np.asarray(points, dtype=float):
        s = p - v0
        u = inv * np.einsum("ij,ij->i", s, h)
        q = np.cross(s, e1)
        v = inv * (q @ d)
        t = inv * np.einsum("ij,ij->i", e2, q)
        hit = (~par) & (u >= 0) & (u <= 1) & (v >= 0) & (u + v <= 1) & (t > 1e-9)
        out.append(bool(hit.sum() % 2))
    return np.array(out)


def world(bearing_deg, radius, height):
    """Authoring bearing/radius/height -> world xyz."""
    a = np.radians(bearing_deg)
    ax, ay = radius * np.cos(a), radius * np.sin(a)
    return [ax, height, -ay]


checks = []
# Arrow slits: recessed to 1.48 but not pierced (wall inner face is 1.25).
for z, bearing in [(3.1, -20), (5.3, 120), (7.4, -160)]:
    checks.append((f"slit@{bearing} outer 1.55 is carved away", world(bearing, 1.55, z), False))
    checks.append((f"slit@{bearing} floor 1.44 is still stone", world(bearing, 1.44, z), True))
    checks.append((f"slit@{bearing} wall 1.35 not pierced", world(bearing, 1.35, z), True))
    checks.append((f"slit@{bearing} interior 1.10 is hollow", world(bearing, 1.10, z), False))
    # 0.6 around the slit in bearing the wall must be untouched
    checks.append((f"slit@{bearing} neighbour wall intact", world(bearing + 12, 1.55, z), True))
# Doorway: a tunnel at the front, 2.2 high, through the wall into the cavity.
checks.append(("door mouth open at h=1.0", world(-90, 1.45, 1.0), False))
checks.append(("door mouth open at h=2.1", world(-90, 1.45, 2.1), False))
checks.append(("door lintel solid at h=2.35", world(-90, 1.45, 2.35), True))
checks.append(("door arch narrows: corner solid at h=2.1", [0.52, 2.1, 1.45], True))
checks.append(("wall solid beside door", world(-50, 1.45, 1.0), True))
checks.append(("wall solid above door", world(-90, 1.45, 4.0), True))
# Cavity, floorless tube.
checks.append(("shaft interior hollow", world(0, 0.5, 5.0), False))
# Merlons at 22.5 + k*45, gap between them.
checks.append(("merlon present at 22.5", world(22.5, 1.42, 9.65), True))
checks.append(("crenel gap at 45 (merlons sit at 22.5 + k*45)", world(45, 1.42, 9.65), False))
checks.append(("merlon body at 67.5", world(67.5, 1.42, 9.65), True))
checks.append(("crenel gap faces front (-90)", world(-90, 1.42, 9.65), False))
checks.append(("merlon flanks front at -67.5", world(-67.5, 1.42, 9.65), True))
# Flare.
checks.append(("flare skirt at r 2.0, h 0.1", world(45, 2.0, 0.1), True))
checks.append(("no skirt at r 2.0, h 1.5", world(45, 2.0, 1.5), False))

pts = np.array([c[1] for c in checks], dtype=float)
inside = inside_mesh(m, pts)
bad = 0
for (label, _, want), got in zip(checks, inside):
    ok = bool(got) == want
    bad += not ok
    print(f"{'ok  ' if ok else 'FAIL'}  {label}: inside={bool(got)} want={want}")
print(f"\n{len(checks) - bad}/{len(checks)} checks passed")
sys.exit(1 if bad else 0)
