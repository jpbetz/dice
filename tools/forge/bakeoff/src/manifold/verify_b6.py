# Copyright 2026 The Dice Table Authors.
# Is the text really engraved into the bowed face, at the stated depth?
# Measures every vertex's distance from the bow axis and looks for the three
# surfaces that should exist: frame at r 4.06, face at r 4.00, letter floors at
# r 3.95. A flat cutter or a missing boolean shows up immediately as a missing
# or smeared cluster.
# Usage: verify_b6.py out.glb <bow axis world z, printed by the model>
import sys

import numpy as np
import trimesh

from _meshprobe import inside_mesh

m = trimesh.load(sys.argv[1], force="mesh")
AXIS_Z = float(sys.argv[2])  # world z of the bow axis (negative, behind)
v = m.vertices
r = np.hypot(v[:, 0], v[:, 2] - AXIS_Z)

print(f"bounds w x h x d: {np.round(m.bounds[1] - m.bounds[0], 3).tolist()}")
face_z = v[np.abs(r - 4.0) < 0.01][:, 2].mean()
back_z = v[np.abs(r - 3.75) < 0.01][:, 2].mean()
print(f"stands on y=0: {abs(m.bounds[0][1]) < 1e-6}, "
      f"bow faces +Z: {face_z > back_z} (face z {face_z:.3f} vs back z {back_z:.3f})")

# No height band here: the flat back and the frame only carry vertices at the
# extrusion ends, so filtering by height hides them and reads as "missing".
band = np.ones(len(v), dtype=bool)
print("\nvertex distance from the bow axis:")
for label, lo, hi in [("letter floor  r 3.95", 3.945, 3.956),
                      ("face          r 4.00", 3.995, 4.006),
                      ("frame face    r 4.06", 4.055, 4.066),
                      ("back          r 3.75", 3.745, 3.756)]:
    n = int(((r > lo) & (r < hi) & band).sum())
    print(f"  {label}: {n:5d} verts")

# Depth measured directly: deepest engraved vertex vs the face radius.
floor = r[(r > 3.90) & (r < 3.97)]
if len(floor):
    print(f"\nengraving depth: {4.0 - floor.min():.4f} .. {4.0 - floor.max():.4f} "
          f"(spec 0.05) over {len(floor)} floor verts")

# Solid/void probes along the mid-height row: inside the letters the face is
# cut back, between them it is not.
xs = np.linspace(-0.85, 0.85, 35)
probe_r, y = 3.98, 0.9  # 0.02 under the face: inside a letter this is air
pts = np.stack([xs, np.full_like(xs, y),
                AXIS_Z + np.sqrt(probe_r**2 - xs**2)], axis=1)
ins = inside_mesh(m, pts)
print("\nrow across the face 0.02 under the surface "
      "('#'=metal, '.'=cut away by a letter):")
print("  " + "".join("#" if i else "." for i in ins))
deep = np.stack([xs, np.full_like(xs, y),
                 AXIS_Z + np.sqrt(3.92**2 - xs**2)], axis=1)
print("  " + "".join("#" if i else "." for i in inside_mesh(m, deep)) +
      "   <- 0.08 under: engraving must NOT reach here")
