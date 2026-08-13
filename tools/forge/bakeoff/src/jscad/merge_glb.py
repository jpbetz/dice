#!/usr/bin/env python3
"""Merge already-converted per-part GLBs into one multi-mesh GLB.

The battery's harness converter (harness/stl2glb.py) handles one mesh at a
time and can flat-tint it with --color. JSCAD's own colour mechanism
(colorize()) reaches 3MF/OBJ but not STL, so the two-colour items (B1, B4)
are exported as one STL per coloured part, each converted by the harness
converter with the colour JSCAD assigned, and then stapled together here.
No geometry is touched: this only builds a scene out of the parts.

Usage: merge_glb.py out.glb part1.glb part2.glb ...
"""
import sys

import trimesh

dst, srcs = sys.argv[1], sys.argv[2:]
scene = trimesh.Scene()
for i, s in enumerate(srcs):
    m = trimesh.load(s, force="mesh")
    scene.add_geometry(m, geom_name=f"part{i}")
scene.export(dst)
print(f"merged {len(srcs)} parts -> {dst}")
