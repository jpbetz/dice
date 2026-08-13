# Copyright 2026 The Dice Table Authors.
# Checks the candelabra actually has what the grammar claims: a base of the
# right radius, a trunk of the right radius, six bored cups on six dished pans.
# Usage: verify_b5.py out.glb '<the TIPS json the model prints>'
import json
import sys

import numpy as np
import trimesh

from _meshprobe import auth, inside_mesh, report

TIPS = json.loads(sys.argv[2])
PAN_R, PAN_H, CUP_R, CUP_H, BORE_R = 0.28, 0.07, 0.115, 0.17, 0.072
FIT_Z = 0.02  # pan bottom above the tip point

mesh = trimesh.load(sys.argv[1], force="mesh")
checks = [
    ("base solid at r 0.60", auth(0.60, 0, 0.05), True),
    ("base ends by r 0.75", auth(0.75, 0, 0.05), False),
    ("trunk solid at r 0.15, h 0.9", auth(0.15, 0, 0.9), True),
    ("no trunk at r 0.35, h 0.9", auth(0.35, 0, 0.9), False),
    ("air between the arms above the fork", auth(0, 0, 2.4), False),
    ("nothing above the tallest cup", auth(0, 0, 3.3), False),
]
for i, (tx, ty, tz) in enumerate(TIPS):
    z = tz + FIT_Z
    checks += [
        (f"tip{i} cup bore is hollow", auth(tx, ty, z + PAN_H + CUP_H - 0.05), False),
        (f"tip{i} cup wall is solid", auth(tx + 0.095, ty, z + PAN_H + CUP_H - 0.05), True),
        (f"tip{i} cup bore has a floor", auth(tx, ty, z + PAN_H + CUP_H - 0.14), True),
        (f"tip{i} pan rim solid at r 0.24", auth(tx + 0.24, ty, z + 0.03), True),
        (f"tip{i} pan is dished at r 0.16", auth(tx + 0.16, ty, z + 0.065), False),
        (f"tip{i} nothing beyond the pan", auth(tx + 0.33, ty, z + 0.03), False),
        (f"tip{i} stem present below the pan", auth(tx, ty, tz - 0.05), True),
    ]
code = report(mesh, checks)

m = mesh.copy()
m.merge_vertices(merge_tex=True, merge_norm=True)
ang = np.degrees(m.face_adjacency_angles)
print("\njunction quality -- dihedral angles between adjacent faces:")
for q in (50, 90, 99, 99.9, 100):
    print(f"  p{q:<5} {np.percentile(ang, q):6.2f}")
print(f"  over 60 deg: {int((ang > 60).sum())} of {len(ang)} "
      f"({100 * (ang > 60).mean():.3f}%) -- expected only at the turned "
      f"pan/cup rims and the flat foot, not in the branching")
sys.exit(code)
