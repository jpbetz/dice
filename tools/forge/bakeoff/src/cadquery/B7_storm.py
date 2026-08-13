# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B7 boolean-storm -- robustness + performance.

Cube edge 3.0 centred at spec (0, 1.5, 0), minus all 120 spheres from
`harness/spheres.json`, minus one 3x3x3 box at spec (1.8, 2.7, 0) turned 25
degrees about spec +Y.

Two things are worth measuring separately here, so they are timed separately:

1. ONE multi-tool cut vs 120 sequential cuts. `Shape.cut(*tools)` hands the
   whole tool list to a single BRepAlgoAPI_Cut, which builds the intersection
   graph once. Doing it in a loop rebuilds the (increasingly complicated)
   result's topology 120 times. The ratio is reported as `speedup_vs_loop`.
2. Validity. OCCT booleans can return a shape that is topologically legal but
   geometrically self-intersecting, so the result is put through
   BRepCheck_Analyzer, not just `isValid()`-by-vibes, and `needed_repair` is
   reported from that.

Set DICE_B7_SUBSET=n to cut only the first n spheres (used to size the run
before committing to it; the shipped bake uses all 120).

Coordinates: spec (x, y, z) -> cad (x, -z, y), and a rotation about spec +Y
is the same angle about cad +Z.
"""

import json
import os
import time

import cadquery as cq
from OCP.BRepCheck import BRepCheck_Analyzer

from _forge import EVAL, Part, bake, spec_to_cad, stand_on_floor

CUBE = 3.0
CUBE_CENTRE = (0.0, 1.5, 0.0)  # spec space
KNIFE = 3.0
KNIFE_CENTRE = (1.8, 2.7, 0.0)  # spec space
KNIFE_YAW = 25.0

SPONGE_RGB = (0.58, 0.56, 0.60)


def load_spheres():
    with open(os.path.join(EVAL, "harness", "spheres.json")) as fh:
        data = json.load(fh)
    limit = int(os.environ.get("DICE_B7_SUBSET", len(data)))
    return [
        cq.Solid.makeSphere(
            s["r"], cq.Vector(spec_to_cad(s["x"], s["y"], s["z"])), angleDegrees1=-90
        )
        for s in data[:limit]
    ], len(data), limit


def centred_box(edge: float, spec_centre) -> cq.Solid:
    cx, cy, cz = spec_to_cad(*spec_centre)
    return cq.Solid.makeBox(
        edge, edge, edge, cq.Vector(cx - edge / 2, cy - edge / 2, cz - edge / 2)
    )


def build():
    spheres, total, used = load_spheres()
    body = centred_box(CUBE, CUBE_CENTRE)
    knife = centred_box(KNIFE, KNIFE_CENTRE).rotate(
        cq.Vector(*spec_to_cad(*KNIFE_CENTRE)),
        cq.Vector(*spec_to_cad(*KNIFE_CENTRE)) + cq.Vector(0, 0, 1),
        KNIFE_YAW,
    )

    t0 = time.perf_counter()
    sponge = body.cut(*spheres)
    t_spheres = time.perf_counter() - t0

    t0 = time.perf_counter()
    sponge = sponge.cut(knife)
    t_knife = time.perf_counter() - t0

    t0 = time.perf_counter()
    valid = BRepCheck_Analyzer(sponge.wrapped).IsValid()
    t_check = time.perf_counter() - t0

    stats = {
        "spheres_total": total,
        "spheres_cut": used,
        "seconds_120_sphere_cut": round(t_spheres, 2),
        "seconds_knife_cut": round(t_knife, 2),
        "seconds_validity_check": round(t_check, 2),
        "brepcheck_valid": bool(valid),
        "needed_repair": not bool(valid),
        "solids_out": len(sponge.Solids()),
        "faces_out": len(sponge.Faces()),
    }
    print("[B7]", json.dumps(stats))
    return stand_on_floor([Part("sponge", sponge, SPONGE_RGB)], center_xy=False), stats


def time_the_loop(n: int = 20) -> dict:
    """Control: the same cuts done one at a time, to price the multi-tool call."""
    spheres, _, _ = load_spheres()
    body = centred_box(CUBE, CUBE_CENTRE)
    t0 = time.perf_counter()
    for s in spheres[:n]:
        body = body.cut(s)
    loop = time.perf_counter() - t0

    body2 = centred_box(CUBE, CUBE_CENTRE)
    t0 = time.perf_counter()
    body2.cut(*spheres[:n])
    batch = time.perf_counter() - t0
    return {
        "loop_n": n,
        "seconds_sequential": round(loop, 2),
        "seconds_multitool": round(batch, 2),
        "speedup_vs_loop": round(loop / batch, 1) if batch else None,
    }


if __name__ == "__main__":
    t_start = time.perf_counter()
    parts, stats = build()
    build_seconds = time.perf_counter() - t_start
    stats.update(time_the_loop(20))
    bake(
        "B7",
        "storm",
        parts,
        tol=0.01,
        ang=0.4,
        route="stl-convert",
        build_seconds=build_seconds,
        notes=(
            f"{stats['spheres_cut']}/{stats['spheres_total']} spheres subtracted "
            f"in ONE multi-tool BRepAlgoAPI_Cut in "
            f"{stats['seconds_120_sphere_cut']}s, then the 25-degree knife box "
            f"in {stats['seconds_knife_cut']}s. BRepCheck_Analyzer valid="
            f"{stats['brepcheck_valid']}, no repair pass run. Doing the same "
            f"cuts one at a time is {stats.get('speedup_vs_loop')}x slower "
            f"(measured on the first {stats.get('loop_n')})."
        ),
        extra=stats,
    )
