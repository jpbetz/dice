# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Inspect a baked GLB and refuse the bad ones. Runs on the forge venv.

    ~/opt/dice-forge/venv/bin/python tools/forge/check.py out/x.glb
        [--max-tris N] [--expect-colors] [--open-ok] [--json]

Gates (each one exists because a green bake shipped a broken file once):
  - inverted winding (signed volume < 0): invisible in three.js back-face cull
  - not watertight after vertex weld (unless --open-ok)
  - degenerate faces
  - tri budget (--max-tris)
  - COLOR_0 present when the recipe claims colors (--expect-colors); checked
    against the GLB JSON, because trimesh reports 'texture' visuals whenever a
    material exists and misses vertex colors behind it
  - NORMAL accessor sanity: present and unit-length-ish — the bake-off saw a
    tool ship position data in the NORMAL slot, which renders solid black
"""
import argparse
import json
import struct
import sys

import numpy as np
import trimesh


def glb_json(path):
    with open(path, "rb") as f:
        raw = f.read()
    jlen = struct.unpack("<I", raw[12:16])[0]
    return json.loads(raw[20:20 + jlen]), raw, 20 + jlen + 8


def normal_sanity(j, raw, bin_start):
    """Max |1 - |n|| across every NORMAL accessor; None if a mesh lacks one."""
    worst = 0.0
    for mesh in j.get("meshes", []):
        for prim in mesh["primitives"]:
            if "NORMAL" not in prim["attributes"]:
                return None
            acc = j["accessors"][prim["attributes"]["NORMAL"]]
            bv = j["bufferViews"][acc["bufferView"]]
            off = bin_start + bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
            stride = bv.get("byteStride", 12)
            if stride == 12:
                arr = np.frombuffer(raw[off:off + acc["count"] * 12], dtype="<f4").reshape(-1, 3)
            else:
                rows = [np.frombuffer(raw[off + i * stride:off + i * stride + 12], dtype="<f4")
                        for i in range(acc["count"])]
                arr = np.stack(rows)
            worst = max(worst, float(np.abs(1.0 - np.linalg.norm(arr, axis=1)).max()))
    return worst


def inspect(path):
    out = {"file": path, "file_kb": None}
    import os
    out["file_kb"] = round(os.path.getsize(path) / 1024, 1)
    j, raw, bin_start = glb_json(path)
    out["has_vertex_colors"] = b'"COLOR_0"' in raw
    out["normal_max_len_err"] = normal_sanity(j, raw, bin_start)

    scene = trimesh.load(path, force="scene")
    geoms = list(scene.geometry.values())
    out["meshes"] = len(geoms)
    out["tris"] = int(sum(len(g.faces) for g in geoms))
    out["verts"] = int(sum(len(g.vertices) for g in geoms))

    def welded_watertight(g):
        w = g.copy()
        w.merge_vertices(merge_tex=True, merge_norm=True)
        return bool(w.is_watertight)

    out["watertight"] = all(welded_watertight(g) for g in geoms)
    vol = 0.0
    for g in geoms:
        try:
            vol += float(g.volume)
        except BaseException:
            pass
    out["volume"] = round(vol, 4)
    out["inverted"] = vol < 0
    degen = 0
    for g in geoms:
        degen += int((np.linalg.norm(g.triangles_cross, axis=1) < 1e-12).sum())
    out["degenerate_faces"] = degen
    b = scene.bounds
    out["bounds_min"] = [round(float(v), 3) for v in b[0]]
    out["bounds_max"] = [round(float(v), 3) for v in b[1]]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("glb", nargs="+")
    ap.add_argument("--max-tris", type=int, default=None)
    ap.add_argument("--expect-colors", action="store_true")
    ap.add_argument("--open-ok", action="store_true",
                    help="allow non-watertight (decorative open shells only)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    failures = []
    reports = []
    for path in a.glb:
        r = inspect(path)
        reports.append(r)

        def fail(msg):
            failures.append(f"{path}: {msg}")

        if r["inverted"]:
            fail(f"inside out (volume {r['volume']}) — invisible under back-face culling")
        if not r["watertight"] and not a.open_ok:
            fail("not watertight after weld")
        if r["degenerate_faces"]:
            fail(f"{r['degenerate_faces']} degenerate faces")
        if a.max_tris and r["tris"] > a.max_tris:
            fail(f"tri budget blown: {r['tris']} > {a.max_tris}")
        if a.expect_colors and not r["has_vertex_colors"]:
            fail("no COLOR_0 in GLB — the exporter silently dropped vertex colors "
                 "(material must read the color attribute; see forge.vertex_color_material)")
        if r["normal_max_len_err"] is None:
            fail("a mesh has no NORMAL accessor (flat-shade fallback — only OK if intended)")
        elif r["normal_max_len_err"] > 0.01:
            fail(f"NORMAL accessor is not unit length (max err {r['normal_max_len_err']:.3f}) "
                 "— renders black/garbage in three.js")

    if a.json:
        print(json.dumps(reports, indent=1))
    else:
        for r in reports:
            print(f"{r['file']}: {r['tris']} tris, {r['file_kb']} kB, "
                  f"watertight={r['watertight']}, colors={r['has_vertex_colors']}, "
                  f"vol={r['volume']}, degen={r['degenerate_faces']}, "
                  f"bounds {r['bounds_min']}..{r['bounds_max']}")
    if failures:
        print("\nCHECK FAILED:", file=sys.stderr)
        for f in failures:
            print("  - " + f, file=sys.stderr)
        sys.exit(1)
    print("check ok")


if __name__ == "__main__":
    main()
