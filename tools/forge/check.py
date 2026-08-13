# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Inspect a baked GLB and refuse the bad ones. Runs on the forge venv.

    ~/opt/dice-forge/venv/bin/python tools/forge/check.py out/x.glb
        [--max-tris N] [--expect-colors] [--open-ok] [--tower] [--json]

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

--tower adds the dice-tower portal contract (see forge.tower_portals):
  - `portalIn` / `portalOut` nodes exist, sit at the scene root, and carry
    their scalars in node extras
  - every declared number inside TOWER_PORTAL_LIMITS below
  - the APPROACH column is really clear (rays down the entry aperture) and
    the EXIT throat is really clear (rays out through the door) — because a
    model can declare a perfect doorway and still wall it up behind the
    declaration, and the numbers alone would never notice
  - at least one mesh node named `towerSkin*`, the engine's occluder prefix
"""
import argparse
import json
import math
import struct
import sys

import numpy as np
import trimesh

# --------------------------------------------------------------------------
# the tower portal contract
# --------------------------------------------------------------------------
S = 1.25          # d20 radius: the unit every tower bound is quoted in

# MIRRORS js/main.js TOWER_PORTAL_LIMITS — keep in sync.
TOWER_PORTAL_LIMITS = {
    "In": {
        "clearR_min": 1.7 * S,
        "rimY": (5.8 * S, 8.2 * S),
        "x": (-1.0 * S, 1.0 * S),
        "z": (-2.6 * S, -1.0 * S),
    },
    "Out": {
        "w_min": 4.0 * S,
        "clearH_min": 3.6 * S,
        "sillY": (0.5 * S, 1.1 * S),
        "x": (-0.6 * S, 0.6 * S),
    },
}
DESPAWN_DROP = 1.4 * S    # despawnY = rimY - this; the column must be clear
APPROACH_START = 2.5      # approach rays start this far above the rim
EXIT_BACK = 1.5           # exit rays start this far behind the door plane
EXIT_FRONT = 1.0          # ... and must reach this far in front of it
THROAT_MARGIN = 0.95      # probe 95% of the declared aperture
# The exit throat is NOT a flat box: the engine's delivery ramp climbs from
# the sill backward at the 28°-family slope (rise 0.8/1.5 in base units, plus
# the sill's own offset — the same formula towerVolumes uses), and the die
# RIDES that surface. A ray hugging the sill at z −1.5 is probing space the
# ramp legitimately owns, so a model that clads the chute (a tongue, a slide)
# would fail a gate about a die path no die takes. Each ray therefore starts
# where its height clears the ramp line plus the cladding allowance — skins
# sit up to ~0.10 proud of the collider face, plus margin.
EXIT_CLAD_ALLOW = 0.15    # ramp cladding proudness + margin above the slope line
RAY_EPS = 1e-6


def exit_ray_start_z(py, sill_y, oz):
    """Deepest z a ray at height `py` may probe without entering ramp space."""
    tan_slope = 0.8 / 1.5 + (sill_y - 0.8 * S) / (1.5 * S)
    head = py - sill_y - EXIT_CLAD_ALLOW
    if head <= 0 or tan_slope <= 0:
        return oz  # at/below the clad sill line: probe only from the plane out
    return oz - min(EXIT_BACK, head / tan_slope)


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


def hit_distance(tris, origin, direction, t_max):
    """Nearest two-sided ray/triangle hit in (RAY_EPS, t_max), else None.

    Möller-Trumbore, vectorised over triangles. Written here rather than
    handed to trimesh because BOTH trimesh ray backends need a package this
    venv does not have (ray_triangle wants rtree, ray_pyembree wants embreex)
    and the house rule is no new dependencies. At 25 rays against a few
    thousand triangles that costs nothing, and a caster that lives in the
    repo cannot vary with what happens to be pip-installed on the machine.

    Two-sided on purpose: a plug across the doorway blocks a die whichever
    way its faces point, and back-face culling would wave it through.
    """
    if len(tris) == 0:
        return None
    v0, v1, v2 = tris[:, 0], tris[:, 1], tris[:, 2]
    e1, e2 = v1 - v0, v2 - v0
    p = np.cross(direction, e2)
    det = np.einsum("ij,ij->i", e1, p)
    ok = np.abs(det) > 1e-12
    inv = np.zeros_like(det)
    inv[ok] = 1.0 / det[ok]
    tv = origin - v0
    u = np.einsum("ij,ij->i", tv, p) * inv
    q = np.cross(tv, e1)
    v = (q @ direction) * inv
    t = np.einsum("ij,ij->i", e2, q) * inv
    hit = (ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1.0 + 1e-9)
           & (t > RAY_EPS) & (t < t_max))
    return float(t[hit].min()) if hit.any() else None


def disc_probes(cx, cz, r):
    """25 points over a disc: centre, a mid ring, and a ring ON the rim.

    Rings rather than a spiral because the rim is where a throat actually
    pinches, and a sampler that only averages the interior would miss a
    shelf growing in from one side.
    """
    pts = [(cx, cz)]
    for count, frac, phase in ((8, 0.55, 0.0), (16, 1.0, math.pi / 16)):
        for i in range(count):
            a = phase + 2.0 * math.pi * i / count
            pts.append((cx + r * frac * math.cos(a), cz + r * frac * math.sin(a)))
    return pts


def rect_probes(cx, y0, w, h, n=5):
    """25 points over a rectangle, the extremes sitting ON its edges."""
    return [(cx - w / 2 + w * i / (n - 1), y0 + h * k / (n - 1))
            for i in range(n) for k in range(n)]


def node_translation(node):
    """glTF node position. TRS or a column-major matrix; default is origin."""
    if "matrix" in node:
        m = node["matrix"]
        return [float(m[12]), float(m[13]), float(m[14])]
    return [float(c) for c in node.get("translation", [0.0, 0.0, 0.0])]


def read_portals(j):
    """{name: {pos, extras, root}} for the portal nodes present in the GLB.

    Node translations are already app-frame: glTF is Y-up and the exporter
    ran with export_yup, so what forge wrote as an app-frame spec is what
    lands here. No conversion — the absence of one is the point.
    """
    children = set()
    for n in j.get("nodes", []):
        children.update(n.get("children", []))
    found = {}
    for i, n in enumerate(j.get("nodes", [])):
        if n.get("name") in ("portalIn", "portalOut"):
            found[n["name"]] = {"pos": node_translation(n),
                                "extras": n.get("extras") or {},
                                "root": i not in children}
    return found


def tower_check(j, tris):
    """The --tower gate. Returns (info, failures)."""
    info, fails = {}, []
    found = read_portals(j)

    # (a) both portals declared, at the root, with parseable scalars
    for name in ("portalIn", "portalOut"):
        if name not in found:
            fails.append(f"{name}: no such node — a tower model must declare "
                         "both portals (see forge.tower_portals)")
    if fails:
        return info, fails

    for name, keys in (("portalIn", ("clearR",)), ("portalOut", ("w", "clearH"))):
        if not found[name]["root"]:
            fails.append(f"{name}: must be a scene-root node — the app reads "
                         "object.position, which is relative to its parent")
        for k in keys:
            v = found[name]["extras"].get(k)
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                fails.append(
                    f"{name}: extras['{k}'] missing or not a number (got {v!r}) "
                    "— portal scalars ride glTF node extras; is export_extras on?")
    if fails:
        return info, fails

    ix, rim_y, iz = found["portalIn"]["pos"]
    clear_r = float(found["portalIn"]["extras"]["clearR"])
    ox, sill_y, oz = found["portalOut"]["pos"]
    w = float(found["portalOut"]["extras"]["w"])
    clear_h = float(found["portalOut"]["extras"]["clearH"])
    despawn_y = rim_y - DESPAWN_DROP
    info.update({"in": {"x": ix, "rimY": rim_y, "z": iz, "clearR": clear_r},
                 "out": {"x": ox, "sillY": sill_y, "z": oz, "w": w,
                         "clearH": clear_h},
                 "despawnY": round(despawn_y, 3)})

    # (b) every declared number inside the engine's limits
    lin, lout = TOWER_PORTAL_LIMITS["In"], TOWER_PORTAL_LIMITS["Out"]

    def span(portal, label, value, bounds):
        lo, hi = bounds
        if not (lo - 1e-6 <= value <= hi + 1e-6):
            fails.append(f"portal{portal}: {label} {value:.3f} outside "
                         f"[{lo:.3f}, {hi:.3f}]")

    def floor_(portal, label, value, lo):
        if value < lo - 1e-6:
            fails.append(f"portal{portal}: {label} {value:.3f} below "
                         f"minimum {lo:.3f}")

    floor_("In", "clearR", clear_r, lin["clearR_min"])
    span("In", "rimY", rim_y, lin["rimY"])
    span("In", "x", ix, lin["x"])
    span("In", "z", iz, lin["z"])
    floor_("Out", "w", w, lout["w_min"])
    floor_("Out", "clearH", clear_h, lout["clearH_min"])
    span("Out", "sillY", sill_y, lout["sillY"])
    span("Out", "x", ox, lout["x"])

    # (c) the APPROACH column is really clear, top of the fall to despawn
    if clear_r > 0:
        y_top = rim_y + APPROACH_START
        t_max = y_top - despawn_y
        blocked = []
        for px, pz in disc_probes(ix, iz, clear_r * THROAT_MARGIN):
            t = hit_distance(tris, np.array([px, y_top, pz]),
                             np.array([0.0, -1.0, 0.0]), t_max)
            if t is not None:
                blocked.append((y_top - t, px, pz))
        info["approach_blocked"] = len(blocked)
        if blocked:
            hy, px, pz = max(blocked)
            fails.append(
                f"portalIn: approach column blocked — {len(blocked)}/25 probes "
                f"hit mesh, highest at y {hy:.2f} (x {px:.2f}, z {pz:.2f}); the "
                f"disc of radius {clear_r * THROAT_MARGIN:.2f} must fall clear "
                f"from y {y_top:.2f} to despawnY {despawn_y:.2f}")

    # (d) the EXIT throat is really clear, inside the tower to past the door.
    # Each ray starts at exit_ray_start_z(py) — the flat-box version of this
    # gate condemned any model that clads the engine ramp (the hollowbole
    # build hit it and had to leave the interior chute bare from z −1.5 to
    # −0.1 for no player-visible reason).
    if w > 0 and clear_h > 0:
        pad = clear_h * (1.0 - THROAT_MARGIN) / 2.0
        blocked = []
        for px, py in rect_probes(ox, sill_y + pad, w * THROAT_MARGIN,
                                  clear_h * THROAT_MARGIN):
            z_start = exit_ray_start_z(py, sill_y, oz)
            t = hit_distance(tris, np.array([px, py, z_start]),
                             np.array([0.0, 0.0, 1.0]), (oz + EXIT_FRONT) - z_start)
            if t is not None:
                blocked.append((z_start + t, px, py))
        info["exit_blocked"] = len(blocked)
        if blocked:
            hz, px, py = min(blocked)
            fails.append(
                f"portalOut: exit throat blocked — {len(blocked)}/25 probes hit "
                f"mesh, nearest at z {hz:.2f} (x {px:.2f}, y {py:.2f}); the "
                f"{w * THROAT_MARGIN:.2f} x {clear_h * THROAT_MARGIN:.2f} door "
                f"must be clear above the ramp line out to z {oz + EXIT_FRONT:.2f} "
                f"(rays start at the slope + {EXIT_CLAD_ALLOW} cladding allowance, "
                f"deepest z {oz - EXIT_BACK:.2f})")

    # (e) the engine's occluder prefix
    skins = [n.get("name", "") for n in j.get("nodes", [])
             if "mesh" in n and str(n.get("name", "")).startswith("towerSkin")]
    info["towerSkin_nodes"] = skins
    if not skins:
        fails.append("no mesh node named `towerSkin*` — the engine treats that "
                     "prefix as the occluders, so an unnamed mesh hides nothing")
    return info, fails


def inspect(path, tower=False):
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

    if tower:
        # world-space triangles: to_mesh() applies the node transforms, which
        # the raw per-geometry vertices do not carry
        tris = (np.asarray(scene.to_mesh().triangles, dtype=np.float64)
                if geoms else np.zeros((0, 3, 3)))
        out["tower"], out["tower_failures"] = tower_check(j, tris)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("glb", nargs="+")
    ap.add_argument("--max-tris", type=int, default=None)
    ap.add_argument("--expect-colors", action="store_true")
    ap.add_argument("--open-ok", action="store_true",
                    help="allow non-watertight (decorative open shells only)")
    ap.add_argument("--tower", action="store_true",
                    help="gate the dice-tower portal contract (portalIn / "
                         "portalOut nodes, engine limits, clear throats, "
                         "towerSkin* occluders)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    failures = []
    reports = []
    for path in a.glb:
        r = inspect(path, tower=a.tower)
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
        for msg in r.get("tower_failures", []):
            fail(msg)

    if a.json:
        print(json.dumps(reports, indent=1))
    else:
        for r in reports:
            print(f"{r['file']}: {r['tris']} tris, {r['file_kb']} kB, "
                  f"watertight={r['watertight']}, colors={r['has_vertex_colors']}, "
                  f"vol={r['volume']}, degen={r['degenerate_faces']}, "
                  f"bounds {r['bounds_min']}..{r['bounds_max']}")
            t = r.get("tower")
            if t and "in" in t:
                print(f"  portalIn  x {t['in']['x']:.2f} rimY {t['in']['rimY']:.2f} "
                      f"z {t['in']['z']:.2f} clearR {t['in']['clearR']:.2f}  "
                      f"despawnY {t['despawnY']:.2f}  "
                      f"approach {25 - t.get('approach_blocked', 0)}/25 clear")
                print(f"  portalOut x {t['out']['x']:.2f} sillY {t['out']['sillY']:.2f} "
                      f"z {t['out']['z']:.2f} w {t['out']['w']:.2f} "
                      f"clearH {t['out']['clearH']:.2f}  "
                      f"exit {25 - t.get('exit_blocked', 0)}/25 clear  "
                      f"skins {t.get('towerSkin_nodes', [])}")
    if failures:
        print("\nCHECK FAILED:", file=sys.stderr)
        for f in failures:
            print("  - " + f, file=sys.stderr)
        sys.exit(1)
    print("check ok")


if __name__ == "__main__":
    main()
