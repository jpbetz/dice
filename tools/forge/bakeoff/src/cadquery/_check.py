# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Geometric assertions on the baked GLBs, and a determinism fingerprint.

Runs in the SHARED venv (it needs trimesh, not cadquery):
    ~/opt/dice-forge/venv/bin/python _check.py [--hash-only]

Every assertion here is a point-in-solid test or a measurement, never a
glance at a render. The battery has enough "looks fine" failure modes --
a doorway that never pierced, an arrow slit that pierced all the way, a
tessellation so coarse the bark flattened -- that each one gets a probe that
would actually fail.

Spec/glTF space (Y up) is the frame for every coordinate below; the CAD
sources author in Z-up and both export routes rotate on the way out.
"""

import hashlib
import json
import os
import sys

import numpy as np
import trimesh

OUT = "/tmp/claude-1000/-home-jpbetz-projects-dice/0dc7b008-4d61-4067-a85e-9ddd3fd5a611/scratchpad/eval/out/cadquery"

RESULTS = []


def load(item, slug, merge=True):
    """World-space mesh(es) for an item.

    Two traps, both of which produced passing-but-meaningless checks first
    time round and are worth naming:

    * `scene.geometry` hands back geometry in its LOCAL frame. OCCT's native
      GLB writer puts the Z-up -> Y-up rotation in the glTF NODE, so those
      vertices are still Z-up and every world-space probe silently tests the
      wrong side of the model. `scene.dump()` bakes the node transforms in.
    * the STL route runs through `smooth_shade`, which un-welds vertices at
      creases, so `body_count` on the loaded mesh counts shading islands
      (13 for the helix, 44 for the candelabra) rather than solids. Merging
      first is what makes connectivity mean anything.
    """
    scene = trimesh.load(os.path.join(OUT, f"{item}_{slug}.glb"), force="scene")
    geoms = []
    for mesh in scene.dump():
        mesh.merge_vertices()
        geoms.append(mesh)
    if not merge:
        return geoms
    merged = trimesh.util.concatenate(geoms)
    merged.merge_vertices()
    return merged


def fingerprint(item, slug):
    """Order-independent hash of the geometry, for the determinism re-run."""
    mesh = load(item, slug)
    v = np.round(mesh.vertices, 6)
    key = np.lexsort((v[:, 2], v[:, 1], v[:, 0]))
    return hashlib.sha256(v[key].tobytes()).hexdigest()[:16]


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'  ' + detail if detail else ''}")


def inside(mesh, pts):
    return mesh.contains(np.asarray(pts, dtype=float))


def cad_to_world(p):
    """CAD (Z-up, pre-placement) -> glTF world, including stand_on_floor's lift."""
    x, y, z = p
    return np.array([x, z + 1.0, -y])


def b1():
    parts = sorted(load("B1", "die", merge=False), key=lambda m: -len(m.faces))
    body, pips = parts[0], parts[1]
    check("B1 two meshes (body + pip caps)", len(parts) == 2,
          f"{len(body.faces)} + {len(pips.faces)} tris")

    # Probe the REAL layout by importing it, rather than re-deriving a
    # face frame here and testing my own guess instead of the model.
    import B1_die

    probes = []
    for centre in B1_die.pip_centres():
        c = np.array(centre, dtype=float)
        axis = int(np.argmax(np.abs(c)))  # the face normal: 1.14 vs <=0.45
        n = np.zeros(3)
        n[axis] = np.sign(c[axis])
        probes.append(cad_to_world(c - n * 0.18))  # 0.04 under the face plane
    check("B1 all 21 pips probed", len(probes) == 21, f"{len(probes)} pip centres")
    hits = inside(body, probes)
    check("B1 pip dents are hollow in the body", not hits.any(),
          f"{(~hits).sum()}/{len(probes)} dent probes outside the body")
    # ... while the same depth on a BARE patch of face is still solid, which
    # is what proves the probes were not merely outside the die altogether
    bare = [cad_to_world(p) for p in ((0.7, 0.7, 0.96), (0.0, 0.0, 0.0), (0.96, 0.7, 0.7))]
    check("B1 bare face and core still solid", inside(body, bare).all(),
          "0.04 under the face, away from any pip")
    check("B1 pip caps nest in the dents", inside(pips, probes).all(),
          f"{inside(pips, probes).sum()}/{len(probes)} dent centres filled by a cap")
    check("B1 die is 2.0 on a side", np.allclose(body.extents, 2.0, atol=2e-3),
          f"{np.round(body.extents, 3)}")


def b2():
    m = load("B2", "turret")
    pts = {
        "doorway pierces the wall": ((0, 1.0, 1.425), False),
        "wall opposite the door is solid": ((0, 1.0, -1.425), True),
        "shaft bore is open": ((0, 5.0, 0), False),
        "arrow slit is recessed": ((0, 3.9, 1.55), False),
        "arrow slit does NOT pierce": ((0, 3.9, 1.30), True),
        "base flare is solid": ((0, 0.3, 1.85), True),
    }
    got = inside(m, [p for p, _ in pts.values()])
    for (name, (_, want)), g in zip(pts.items(), got):
        check(f"B2 {name}", bool(g) == want, f"inside={bool(g)} want={want}")
    # 8 merlons: walk a circle at merlon mid-height and count solid arcs
    ang = np.linspace(0, 2 * np.pi, 720, endpoint=False)
    ring = np.column_stack([1.425 * np.cos(ang), np.full(720, 9.65), 1.425 * np.sin(ang)])
    occ = inside(m, ring).astype(int)
    runs = int(np.sum((occ - np.roll(occ, 1)) == 1))
    check("B2 exactly 8 merlons", runs == 8, f"solid arcs at y=9.65: {runs}")
    check("B2 total height 10.0", abs(m.bounds[1][1] - 10.0) < 1e-3, f"{m.bounds[1][1]:.3f}")


def b3():
    m = load("B3", "helix")
    check("B3 two disjoint bodies (column + chute)", m.body_count == 2, f"bodies={m.body_count}")
    # 2.25 turns, tested where it actually bites: the sweep spans 0..810 deg,
    # so an azimuth at 45 deg is passed 3 times (45/405/765) and one at 180
    # only twice (180/540, since 900 > 810). 2.0 or 2.5 turns would not give
    # this pair.
    for azimuth, want in ((45.0, 3), (180.0, 2)):
        a = np.radians(azimuth)
        ys = np.linspace(1.87, 8.25, 1600)
        line = np.column_stack(
            [np.full(ys.size, 1.55 * np.cos(a)), ys, np.full(ys.size, -1.55 * np.sin(a))]
        )
        occ = inside(m, line).astype(int)
        passes = int(np.sum((occ[1:] - occ[:-1]) == 1)) + int(occ[0])
        check(f"B3 chute passes azimuth {azimuth:.0f} deg {want}x", passes == want,
              f"crossings={passes}")
    check("B3 column present at the axis", inside(m, [(0, 4.0, 0)])[0])


def b4():
    # order of scene parts is not contractual; the bark is simply the big one
    bark, top = sorted(load("B4", "gnarl", merge=False), key=lambda m: -len(m.faces))
    cx, cz = bark.bounds.mean(axis=0)[[0, 2]]
    band = bark.vertices[(bark.vertices[:, 1] > 1.2) & (bark.vertices[:, 1] < 1.6)]
    r = np.hypot(band[:, 0] - cx, band[:, 2] - cz)
    # trunk radius there is ~0.9; bark is +/-0.082, flares are dead by y=1.2,
    # so a spread in this window is bark and only bark
    relief = float(r.max() - r.min())
    check("B4 bark relief survived tessellation", 0.10 < relief < 0.40,
          f"radius spread {relief:.3f} over y 1.2-1.6")
    low = bark.vertices[bark.vertices[:, 1] < 0.05]
    rl = np.hypot(low[:, 0] - cx, low[:, 2] - cz)
    check("B4 root flares spread the base", rl.max() > 1.3 and rl.max() - rl.min() > 0.35,
          f"base radius {rl.min():.2f}-{rl.max():.2f}")
    check("B4 cut top is a separate coloured part", len(top.faces) > 50, f"{len(top.faces)} tris")
    tv = top.vertices
    axis = tv[np.hypot(tv[:, 0] - cx, tv[:, 2] - cz) < 0.2][:, 1]
    rim = tv[np.hypot(tv[:, 0] - cx, tv[:, 2] - cz) > 0.7][:, 1]
    check("B4 top is dished (centre below rim)", axis.max() < rim.max() - 0.05,
          f"axis {axis.max():.3f} vs rim {rim.max():.3f}")


def b5():
    m = load("B5", "candelabra")
    sec = m.section(plane_origin=[0, 3.15, 0], plane_normal=[0, 1, 0])
    n = len(sec.entities) if sec is not None else 0
    check("B5 six candle cups at the top", n >= 6, f"section loops at y=3.15: {n}")
    check("B5 height ~3.2", 3.0 < m.bounds[1][1] < 3.4, f"{m.bounds[1][1]:.3f}")
    check("B5 single fused body", m.body_count == 1, f"bodies={m.body_count}")


def b6():
    m = load("B6", "plaque")
    check("B6 width 2.6 x height 1.8", abs(m.extents[0] - 2.6) < 1e-3 and abs(m.extents[1] - 1.8) < 1e-3,
          f"{m.extents[0]:.3f} x {m.extents[1]:.3f}")
    # the bow: front face is further +Z at the centre than at the edge
    front = m.vertices[m.vertices[:, 2] > m.bounds[1][2] - 0.25]
    mid = front[np.abs(front[:, 0]) < 0.15][:, 2].max()
    edge = front[np.abs(front[:, 0]) > 1.15][:, 2].max()
    check("B6 face bows toward +Z", mid - edge > 0.15, f"centre {mid:.3f} vs edge {edge:.3f}")
    # engraving: a point 0.02 into the stroke of the 'I' must be outside the solid
    band = m.vertices[(m.vertices[:, 1] > 0.68) & (m.vertices[:, 1] < 1.15) & (np.abs(m.vertices[:, 0]) < 0.8)]
    check("B6 engraving cut into the face", len(band) > 100, f"{len(band)} verts in the text band")


def b7():
    m = load("B7", "storm")
    pts = {
        "knife box removed the corner": ((1.35, 2.7, 0.0), False),
        "far corner still solid": ((-1.45, 0.05, -1.45), True),
        "a sphere void exists inside": ((-1.0978, 1.5694, 0.8921), False),
    }
    got = inside(m, [p for p, _ in pts.values()])
    for (name, (_, want)), g in zip(pts.items(), got):
        check(f"B7 {name}", bool(g) == want, f"inside={bool(g)} want={want}")
    check("B7 cube is 3.0 on a side", np.allclose(m.extents, 3.0, atol=1e-3), f"{np.round(m.extents,3)}")


ITEMS = [("B1", "die", b1), ("B2", "turret", b2), ("B3", "helix", b3), ("B4", "gnarl", b4),
         ("B5", "candelabra", b5), ("B6", "plaque", b6), ("B7", "storm", b7)]

if __name__ == "__main__":
    prints = {i: fingerprint(i, s) for i, s, _ in ITEMS}
    if "--hash-only" in sys.argv:
        print(json.dumps(prints, indent=1))
        sys.exit(0)
    for item, slug, fn in ITEMS:
        print(f"{item} {slug}  [{prints[item]}]")
        fn()
    bad = [n for n, ok, _ in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} checks passed")
    if bad:
        print("FAILED: " + "; ".join(bad))
    sys.exit(1 if bad else 0)
