#!/usr/bin/env python3
"""Geometry probes used to verify each item without a viewer.

The venv has no rtree/embree, so trimesh's ray engine is unavailable; this
is a small vectorised Moller-Trumbore that walks every triangle. Meshes here
are a few thousand triangles, so brute force is instant.
"""
import numpy as np
import trimesh


def load(path):
    m = trimesh.load(path, force="mesh")
    m.merge_vertices()
    return m


def hits(mesh, origin, direction):
    """Sorted distances along `direction` where the ray crosses the surface."""
    o = np.asarray(origin, dtype=float)
    d = np.asarray(direction, dtype=float)
    d = d / np.linalg.norm(d)
    tri = mesh.triangles
    v0, v1, v2 = tri[:, 0], tri[:, 1], tri[:, 2]
    e1, e2 = v1 - v0, v2 - v0
    p = np.cross(d, e2)
    det = np.einsum("ij,ij->i", e1, p)
    ok = np.abs(det) > 1e-12
    inv = np.zeros_like(det)
    inv[ok] = 1.0 / det[ok]
    t_vec = o - v0
    u = np.einsum("ij,ij->i", t_vec, p) * inv
    q = np.cross(t_vec, e1)
    v = (q @ d) * inv
    t = np.einsum("ij,ij->i", e2, q) * inv
    good = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > 1e-7)
    return np.sort(np.unique(np.round(t[good], 5)))


def inside(mesh, point):
    """Parity test along an arbitrary ray."""
    return len(hits(mesh, point, [0.5773, 0.5774, 0.5775])) % 2 == 1
