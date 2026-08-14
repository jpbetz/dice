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
  - every declared number inside the engine's portal limits, portalOut's
    dead z knob pinned to 0.0
  - the APPROACH column is really clear (rays down the entry aperture) and
    the EXIT throat is really clear (rays out through the door) — because a
    model can declare a perfect doorway and still wall it up behind the
    declaration, and the numbers alone would never notice
  - the LANE is clear and the outrun's colliders are clad or declared bare
  - the OCCLUSION grid (SHAFT + COWL, six shipped eyes) does not leak, and
    no sight line reaches the hollow below the sill outside the door
  - at least one mesh node named `towerSkin*`, the engine's occluder prefix
  - every mesh box inside an envelope class the app's fit audit will grant
"""
import argparse
import json
import math
import os
import struct
import sys

import numpy as np
import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# --------------------------------------------------------------------------
# THE ENGINE MIRROR AND THE GATES LIVE IN tools/forge/towergates.py
# --------------------------------------------------------------------------
# Every number copied out of js/main.js is in ONE dict — towergates.
# ENGINE_MIRROR — and every gate that reasons about triangles is implemented
# ONCE beside it. The module is there rather than here because a bake RECIPE
# has to run the same gates and it runs inside Blender's Python, which has no
# trimesh; this file runs on the forge venv, which has no bpy. Neither can
# import the other, both can import a module that imports neither.
#
# Round 2 of the tower-contract work replaces ENGINE_MIRROR with an
# `engine_contract.json` emitted by js/main.js itself. Until then: no engine
# number gets a second copy anywhere under tools/forge — it goes in that dict
# and everything reads it from there. That includes this file: the names below
# are BINDINGS into the mirror, not copies of it.
from towergates import (ENGINE_MIRROR, APPROACH_START, EXIT_FRONT,  # noqa: E402
                        THROAT_MARGIN, EXIT_CLAD_ALLOW, EXIT_BACK,
                        disc_probes, exit_ray_start_z, hit_distance,
                        hole_below_sill_failures, lane_failures,
                        occlusion_failures, rect_probes)

S = ENGINE_MIRROR["S"]    # d20 radius: the unit every tower bound is quoted in
TOWER_PORTAL_LIMITS = ENGINE_MIRROR["portalLimits"]
DESPAWN_DROP = ENGINE_MIRROR["despawnDrop"]

# THE ENVELOPE (added 2026-08-13, after the first shipped bake exceeded it on
# five faces and nothing file-side could see it): every mesh node must be
# IN-SOCKET, or a backward VENUE-GROUNDS spender, or a CLADDING piece sunk
# below the felt. The x test carries the TILT term: skins lean the whole group
# (hollowbole 0.45°, classics 0.7°), so a box at |x| with top y lands at
# |x| + y·sin(tilt) — pass your skin's tilt via --tower-tilt-deg.
_SOCK, _CLS = ENGINE_MIRROR["socket"], ENGINE_MIRROR["auditClasses"]
ENV_SOCKET_X = _SOCK["s"][0] / 2.0     # ±, the mat's own wall is 3.35 — NO SLACK
ENV_SOCKET_Y_TOP = _SOCK["c"][1] + _SOCK["s"][1] / 2.0
ENV_SOCKET_Z = (_SOCK["c"][2] - _SOCK["s"][2] / 2.0,
                _SOCK["c"][2] + _SOCK["s"][2] / 2.0)
ENV_FOOT_DIP = _CLS["footDip"]
ENV_VENUE_Z_BACK = _CLS["venueZBack"]
ENV_CLAD_MIN_Y = _CLS["cladMinY"]
ENV_CLAD_MAX_Z = _CLS["cladMaxZ"]
ENV_CLAD_MAX_Y = _CLS["cladMaxY"]


def envelope_check(scene, tilt_deg):
    """Classify every mesh node's world box against the socket. -> failures[]"""
    import trimesh.transformations as tt  # noqa: F401  (documents the dep)
    sin_t = math.sin(math.radians(tilt_deg))
    fails, notes = [], []
    for node in scene.graph.nodes_geometry:
        mtx, gname = scene.graph[node]
        g = scene.geometry[gname]
        v = np.asarray(g.vertices, dtype=np.float64)
        v = v @ np.asarray(mtx)[:3, :3].T + np.asarray(mtx)[:3, 3]
        lo, hi = v.min(axis=0), v.max(axis=0)
        x_eff = max(abs(lo[0]), abs(hi[0])) + hi[1] * sin_t
        box = (f"[{lo[0]:.2f},{lo[1]:.2f},{lo[2]:.2f}]..[{hi[0]:.2f},"
               f"{hi[1]:.2f},{hi[2]:.2f}] x_eff {x_eff:.3f}")
        x_ok = x_eff <= ENV_SOCKET_X + 1e-6
        y_ok = lo[1] >= ENV_FOOT_DIP and hi[1] <= ENV_SOCKET_Y_TOP + 1e-6
        if x_ok and y_ok and lo[2] >= ENV_SOCKET_Z[0] and hi[2] <= ENV_SOCKET_Z[1] + 1e-6:
            continue                          # IN-SOCKET
        if x_ok and y_ok and lo[2] >= ENV_VENUE_Z_BACK and hi[2] <= ENV_SOCKET_Z[1] + 1e-6:
            notes.append(f"{node}: spends venue grounds (z to {lo[2]:.2f}) — "
                         "legal only on a venueOnly row; the fit audit decides")
            continue                          # BACKWARD
        if (lo[1] <= ENV_CLAD_MIN_Y and hi[1] <= ENV_CLAD_MAX_Y
                and hi[2] <= ENV_CLAD_MAX_Z + 1e-6
                and max(abs(lo[0]), abs(hi[0])) <= ENV_SOCKET_X + 1e-6):
            continue                          # CLADDING
        fails.append(
            f"{node}: outside every envelope class — {box}; in-socket needs "
            f"x_eff<={ENV_SOCKET_X} (tilt {tilt_deg}°), y [{ENV_FOOT_DIP},"
            f"{ENV_SOCKET_Y_TOP}], z [{ENV_SOCKET_Z[0]},{ENV_SOCKET_Z[1]}]; "
            f"cladding needs min.y<={ENV_CLAD_MIN_Y}, max.z<={ENV_CLAD_MAX_Z}")
    return fails, notes


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


def tower_check(j, tris, tilt_deg=0.45, bare_colliders=()):
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
    # ...and the DEAD KNOB. portalOut once took an optional z "unless a model
    # has a reason to inset the doorway", and no model ever did, because the
    # engine reads exactly two things off portalOut — x and sillY — and builds
    # the doorway plane from the SOCKET. A declared z therefore moved nothing
    # in the app and one thing here: this file's own 25-ray exit probe, which
    # anchored itself to a number the engine discards. Pinned to 0.0 by
    # forge.tower_portals (2026-08-13, Joe's ruling) and refused here, because
    # the pin is only worth what a gate on the FILE makes it worth.
    if abs(oz) > 1e-6:
        fails.append(
            f"portalOut: z {oz:.3f} must be 0.0 — the engine reads only x and "
            "sillY from portalOut and derives the doorway plane from the "
            "socket, so a nonzero z moves nothing but this file's exit probe")

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

    # (e) THE LANE — the outrun, which until now was gated in neither
    # direction. The exit probe above stops at oz + 1.0 and the engine's lip
    # box runs out to z 3.9; in between, nothing refused a lobe standing up
    # through the delivery ramp, and nothing refused a collider left bare.
    spec = {"in": info["in"], "out": info["out"]}
    lane_f, lane_info = lane_failures(tris, spec, bare_colliders)
    info["lane"] = lane_info
    fails.extend(lane_f)

    # (f) OCCLUSION, and it is the reason this section exists at all. The
    # obligation ("the vanish is unwatchable") was enforced by exactly one
    # RECIPE and by no gate on any shipped GLB, so a second tower — or the
    # same tower re-baked from a recipe that forgot — could ship a leak that
    # only a browser finds, thirty minutes at a time.
    occ_f, occ_counts = occlusion_failures(tris, spec, tilt_deg)
    info["occlusion"] = occ_counts
    fails.extend(occ_f)

    # ...and its low counterpart: under the sill, outside the door, the shell
    # is supposed to be SOLID. See towergates.hole_below_sill_failures.
    hole_f, tested, holes = hole_below_sill_failures(tris, spec, tilt_deg)
    info["sill_holes"] = {"tested": tested, "open": holes}
    fails.extend(hole_f)

    # (g) the engine's occluder prefix
    skins = [n.get("name", "") for n in j.get("nodes", [])
             if "mesh" in n and str(n.get("name", "")).startswith("towerSkin")]
    info["towerSkin_nodes"] = skins
    if not skins:
        fails.append("no mesh node named `towerSkin*` — the engine treats that "
                     "prefix as the occluders, so an unnamed mesh hides nothing")
    return info, fails


def inspect(path, tower=False, tower_tilt_deg=0.45, bare_colliders=()):
    out = {"file": path, "file_kb": None}
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
        out["tower"], out["tower_failures"] = tower_check(
            j, tris, tilt_deg=tower_tilt_deg, bare_colliders=bare_colliders)
        env_fails, env_notes = envelope_check(scene, tower_tilt_deg)
        out["tower_failures"].extend(env_fails)
        out["envelope_notes"] = env_notes
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
                         "towerSkin* occluders, socket envelope)")
    ap.add_argument("--tower-tilt-deg", type=float, default=0.45,
                    help="the skin's lean, for the envelope's x arithmetic "
                         "(hollowbole 0.45, classics 0.7)")
    ap.add_argument("--bare-colliders", default="",
                    help="comma-separated engine surfaces this model "
                         "DELIBERATELY leaves unclad (ramp, lip). Leaving one "
                         "bare is a legitimate choice — hollowbole's wound "
                         "opens onto felt and the mound that used to cover the "
                         "outrun was deleted — but it is a choice, and an "
                         "undeclared bare collider is indistinguishable from "
                         "a cladding somebody forgot to build")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    bare = [s for s in (p.strip() for p in a.bare_colliders.split(",")) if s]
    failures = []
    reports = []
    for path in a.glb:
        r = inspect(path, tower=a.tower, tower_tilt_deg=a.tower_tilt_deg,
                    bare_colliders=bare)
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
                ln, occ = t.get("lane", {}), t.get("occlusion", {})
                sh = t.get("sill_holes", {})
                clad = ", ".join(f"{k} {v[0]}/{v[1]}"
                                 for k, v in sorted(ln.get("clad", {}).items()))
                print(f"  lane      |x|<={ln.get('lane_halfwidth')} z "
                      f"{ln.get('lane_z')}  clad {clad or 'n/a'}  bare "
                      f"{ln.get('bare_colliders', [])}")
                print("  occlusion " + "  ".join(
                    f"{b} {n}/{n}" for b, n in sorted(occ.items()))
                    + f" at 6 eyes   sill holes {sh.get('open')}/"
                      f"{sh.get('tested')} sight lines")
    if failures:
        print("\nCHECK FAILED:", file=sys.stderr)
        for f in failures:
            print("  - " + f, file=sys.stderr)
        sys.exit(1)
    print("check ok")


if __name__ == "__main__":
    main()
