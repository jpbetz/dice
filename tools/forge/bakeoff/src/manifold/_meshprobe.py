# Copyright 2026 The Dice Table Authors.
# Shared point-containment probe for the baked GLBs.
#
# trimesh.contains() needs rtree, which this venv does not have, so parity
# ray-casting is done here by hand (Moller-Trumbore, vectorised over faces).
import sys

import numpy as np
import trimesh


def load(path):
    return trimesh.load(path, force="mesh")


def auth(x, y, z):
    """Authoring (Z-up) coords -> exported world coords (Y-up, front +Z)."""
    return [x, z, -y]


def cyl(bearing_deg, radius, height):
    """Authoring bearing/radius/height -> exported world coords."""
    a = np.radians(bearing_deg)
    return auth(radius * np.cos(a), radius * np.sin(a), height)


def inside_mesh(mesh, points, direction=(0.3137, 0.5171, 0.7961)):
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


def report(mesh, checks):
    """checks: list of (label, point, want_inside). Returns exit code."""
    pts = np.array([c[1] for c in checks], dtype=float)
    inside = inside_mesh(mesh, pts)
    bad = 0
    for (label, _, want), got in zip(checks, inside):
        ok = bool(got) == want
        bad += not ok
        print(f"{'ok  ' if ok else 'FAIL'}  {label}: inside={bool(got)} want={want}")
    print(f"\n{len(checks) - bad}/{len(checks)} checks passed")
    return 1 if bad else 0


def main(checks_for):
    mesh = load(sys.argv[1])
    sys.exit(report(mesh, checks_for(mesh)))
