# Copyright 2026 The Dice Table Authors.
# End-to-end check that COLOR_0 vertex colours really made it into a GLB.
#
# harness/inspect_glb.py reports has_vertex_colors=False for these files, but
# that is a trimesh precedence rule, not a missing attribute: in
# trimesh/exchange/gltf/__init__.py the COLOR_0 accessor is only promoted to
# mesh.visual.vertex_colors when the primitive has NO material; when a material
# is present the colours are demoted to visual.vertex_attributes['color'].
# manifoldCAD always attaches a material to every primitive, so the flag can
# never be True for its output. This script reads the actual bytes both ways.
import json
import struct
import sys

import numpy as np
import trimesh


def glb_json(path):
    d = open(path, "rb").read()
    n = struct.unpack("<I", d[12:16])[0]
    return json.loads(d[20 : 20 + n])


for path in sys.argv[1:]:
    j = glb_json(path)
    accs = {a.get("name"): a for a in j["accessors"]}
    prim_attrs = [p["attributes"] for m in j["meshes"] for p in m["primitives"]]
    has_color_attr = any("COLOR_0" in a for a in prim_attrs)
    print(f"{path}")
    print(f"  primitives            : {len(prim_attrs)}")
    print(f"  COLOR_0 in primitives : {has_color_attr}")
    if "COLOR_0" in accs:
        a = accs["COLOR_0"]
        print(f"  COLOR_0 accessor      : {a['type']} componentType={a['componentType']} count={a['count']}")
    scene = trimesh.load(path, force="scene")
    for name, g in scene.geometry.items():
        va = getattr(g.visual, "vertex_attributes", {})
        col = va.get("color")
        if col is None and getattr(g.visual, "kind", None) == "vertex":
            col = g.visual.vertex_colors
        if col is None:
            print(f"  {name}: no colour data reached trimesh")
            continue
        col = np.asarray(col)
        uniq = np.unique(np.round(col[:, :3], 3), axis=0)
        print(f"  {name}: {len(col)} verts, {len(uniq)} distinct colours")
        for u in uniq[:6]:
            n = int((np.abs(col[:, :3] - u) < 1e-3).all(axis=1).sum())
            print(f"      rgb={list(u)}  on {n} verts")
