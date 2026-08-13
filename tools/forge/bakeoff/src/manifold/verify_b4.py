# Copyright 2026 The Dice Table Authors.
# Evidence for the three claims B4 makes that a triangle count cannot show:
#   1. no hard CSG edges  -> dihedral angle distribution
#   2. bark relief exists at the right scale -> radial profile around the trunk
#   3. the cut top is a second colour -> COLOR_0 histogram
import sys

import numpy as np
import trimesh

# force="scene" keeps COLOR_0 alive but leaves the geometry in the exporter's
# own frame (millimetres, Z-up) because the -90/0.001 wrapper lives on the
# node. Grab the colours there, and the world-space geometry from force="mesh".
scene = trimesh.load(sys.argv[1], force="scene")
raw = list(scene.geometry.values())[0]
colours = getattr(raw.visual, "vertex_attributes", {}).get("color")
if colours is None and getattr(raw.visual, "kind", None) == "vertex":
    colours = raw.visual.vertex_colors
world = trimesh.load(sys.argv[1], force="mesh")  # node transform applied
m = world.copy()
m.merge_vertices(merge_tex=True, merge_norm=True)

ang = np.degrees(m.face_adjacency_angles)
print("dihedral angle between adjacent faces (deg):")
for q in (50, 90, 99, 99.9, 100):
    print(f"  p{q:<5} {np.percentile(ang, q):6.2f}")
sharp = int((ang > 45).sum())
print(f"  edges over 45 deg: {sharp} of {len(ang)} ({100 * sharp / len(ang):.3f}%)")

# Bark relief: sample the surface radius against angle in a band up the trunk.
v = m.vertices  # world: y is up
print("\nbark relief, radius(theta) in horizontal bands:")
for h in (0.9, 1.5, 2.0):
    band = v[np.abs(v[:, 1] - h) < 0.03]
    if len(band) < 40:
        continue
    th = np.arctan2(band[:, 2], band[:, 0])
    r = np.hypot(band[:, 0], band[:, 2])
    o = np.argsort(th)
    th, r = th[o], r[o]
    # detrend with a wide moving average so lean/taper does not count as relief
    k = max(3, len(r) // 12)
    base = np.convolve(np.r_[r[-k:], r, r[:k]], np.ones(k) / k, "same")[k:-k]
    rel = r - base
    # feature scale from zero crossings of the detrended profile: a full
    # bump is two crossings, so wavelength = 2 * mean crossing gap
    sgn = np.sign(rel)
    cross = np.nonzero(np.diff(sgn) != 0)[0]
    circ = 2 * np.pi * r.mean()
    if len(cross) > 2:
        gaps = np.diff(th[cross]) * r.mean()
        scale = 2 * gaps.mean()
    else:
        scale = float("nan")
    print(f"  y={h}: {len(band):4d} verts, r={r.mean():.3f}, "
          f"relief peak-to-peak={rel.max() - rel.min():.3f}, "
          f"crossings={len(cross)}, feature scale={scale:.3f}u "
          f"(circumference {circ:.2f})")

col = colours
print("\nvertex colours:")
if col is None:
    print("  none reached trimesh")
else:
    col = np.asarray(col)[:, :3]
    uniq, counts = np.unique(np.round(col, 3), axis=0, return_counts=True)
    for u, c in zip(uniq, counts):
        ys = world.vertices[(np.abs(col - u) < 1e-3).all(axis=1), 1]
        print(f"  rgb={list(u)} on {c} verts, height range "
              f"{ys.min():.2f}..{ys.max():.2f}")
