# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Merge the per-item bake fragments with the hand-recorded effort data.

The machine numbers (tris/watertight/file_kb/bake_seconds/tessellation) come
from out/cadquery/_raw/B*.json, which `_forge.bake()` wrote straight from
`harness/inspect_glb.py`. The human numbers (authoring minutes, attempts) are
below, recorded honestly as the battery went, and cannot be derived.

    ~/opt/dice-forge/venv-cq/bin/python assemble_metrics.py
"""

import json
import os

from _forge import OUT, RAW

# authoring_minutes: wall-clock spent authoring THAT item, +/- a minute or
# two. attempts: script executions taken to reach the shipped result,
# including the ones that produced a bad model.
EFFORT = {
    "B1": (7, 5),  # incl. writing the shared _forge.py; 99-mesh discovery + budget tuning
    "B2": (2, 2),
    "B3": (2, 1),  # helix sweep worked on the first execution
    "B4": (5, 2),  # one loft-feasibility probe, then the real bake
    "B5": (13, 5),  # 13 min is nearly all the fillet: one hang, one rewrite
    "B6": (5, 1),  # first execution was the shipped one; +1 run to verify the cut
    "B7": (4, 2),  # 25-sphere sizing probe, then all 120
}

# color: only B1 and B4 are asked for it, and only they ship the native GLB
# route that carries materials.
COLOR = {
    "B1": "material",
    "B4": "material",
}
STL_ROUTE_COLOR_NOTE = (
    " Colour: shipped via the STL route, so the file carries no material. "
    "CadQuery does have per-part colour (cq.Assembly + glTF materials, shown "
    "on B1 and B4); it rides the native GLB route only, and that route is "
    "the one that loses watertightness."
)

ORDER = ["id", "status", "authoring_minutes", "attempts", "bake_seconds", "tris",
         "watertight", "file_kb", "color_support", "export_path", "notes"]


def item(name):
    with open(os.path.join(RAW, f"{name}.json")) as fh:
        rec = json.load(fh)
    minutes, attempts = EFFORT[name]
    rec["authoring_minutes"] = minutes
    rec["attempts"] = attempts
    rec["color_support"] = COLOR.get(name, "none")
    if name not in COLOR:
        rec["notes"] = rec["notes"] + STL_ROUTE_COLOR_NOTE
    return {k: rec[k] for k in ORDER} | {k: v for k, v in rec.items() if k not in ORDER}


metrics = {
    "tool": "cadquery",
    "version": "2.8.0 (cadquery-ocp 7.9.3.1.1 = OCCT 7.9.3, CPython 3.13.5)",
    "install": {
        "method": "uv venv ~/opt/dice-forge/venv-cq --python 3.13 && uv pip install cadquery trimesh numpy",
        "minutes": 0.3,
        "disk_mb": 1638,
        "issues": [
            "None. The Python 3.13 OCP wheel exists (cadquery-ocp 7.9.3.1.1), so "
            "no fallback to 3.11 was needed; import cadquery worked first try.",
            "18 s wall for the whole venv, but uv's cache was partly warm from "
            "sibling venvs in ~/opt/dice-forge (numpy, trimesh). cadquery-ocp "
            "itself was a first fetch on this machine.",
            "1638 MB is mostly not the CAD kernel: OCCT is 265 MB (OCP 164 + "
            "cadquery_ocp.libs 101). VTK, pulled in as a hard dependency for "
            "the viewer and the VRML/VTKJS exporters, is 639 MB on its own, "
            "plus trame. A headless bake never touches any of it.",
            "rtree was added afterwards for the verification harness "
            "(trimesh.contains needs it); not required to build or export.",
        ],
    },
    "items": [item(n) for n in ["B1", "B2", "B3", "B4", "B5", "B6", "B7"]],
    "iteration_loop": {
        "edit_to_glb_seconds_typical": 4.0,
        "error_quality_notes": (
            "Two tiers, and the gap between them is the story. Python-level "
            "mistakes are excellent: real tracebacks, real line numbers, and "
            "the API is typed enough that a wrong argument fails immediately "
            "and legibly. Kernel-level failures are the opposite. Everything "
            "OCCT refuses arrives as the same bare `StdFail_NotDone` with no "
            "message, no offending edge, no suggested radius -- B4's rim "
            "fillet and eight of B5's blend attempts were all that one string. "
            "Worse, failure is not even guaranteed to be an exception: B5's "
            "junction fillet at r=0.09 ran 13 minutes at 100% CPU without "
            "returning or raising, so blends have to be run under a watchdog. "
            "Silent-wrong is rare though -- the boolean results were valid "
            "every time (BRepCheck_Analyzer clean on B7's 120-sphere sponge), "
            "so when it says it worked, it worked. Cost of a cycle: 1.9 s of "
            "that is just `import cadquery`."
        ),
    },
    "overall_notes": (
        "7/7 done, no DNF, all within budget, all byte-identical on a second "
        "full re-bake (vertex-hash compared; no RNG is used anywhere -- B4's "
        "'noise' is a closed-form sum of sinusoids). 32 geometric assertions "
        "in src/cadquery/_check.py pass: point-in-solid probes for all 21 pip "
        "dents, the pierced doorway, the arrow slits that must NOT pierce, an "
        "8-merlon count, the 2.25-turn helix verified at two azimuths, bark "
        "relief, 6 candle cups, the bow direction, and B7's knife cut.\n\n"
        "EXPORT. CadQuery exports GLB natively and it was tried on B1 as "
        "instructed, with a real finding: stock `Assembly.export('.glb')` "
        "writes one glTF primitive PER B-REP FACE -- 99 meshes for one die, "
        "each an open patch, so it scores not-watertight. OCCT's writer has "
        "SetMergeFaces, which CadQuery does not expose; calling it directly "
        "(see _forge._export_native) collapses that to 2 meshes / 2 "
        "materials. Even then the native route cannot be watertight for "
        "anything containing a sphere or a fillet corner: OCCT's mesher emits "
        "zero-area facets at parametric poles (measured in isolation: 2 per "
        "sphere, 8 per filleted box), and only stl2glb's degenerate-face "
        "cull removes them. So B1 and B4 ship native for the colour the spec "
        "asks for there, everything else ships stl-convert for watertightness. "
        "B4 gets both, by rotating the dish sphere 90 degrees so its poles "
        "fall outside the cut region.\n\n"
        "DENSITY. Fully controllable in both directions and continuously: the "
        "(tolerance, angularTolerance) pair goes straight to "
        "BRepMesh_IncrementalMesh, chord deviation in model units and facet "
        "angle in radians. Tessellation happens at export from an exact "
        "B-rep, so the same source at a different tolerance is a different "
        "mesh of the SAME shape -- B1 went 16,846 -> 6,356 tris by moving two "
        "numbers, with no remodelling and no decimation. It also spends "
        "triangles well: the whole 10-unit turret is 1,316 tris because a "
        "cylinder wall needs subdivision around its axis and none along it.\n\n"
        "WHERE IT IS WEAK. Organic is the honest one. There is no "
        "displacement, no noise, no subdivision anywhere in OCCT; B4 is a "
        "24x96 analytic radius field lofted through periodic B-splines, which "
        "works and is watertight and reads as bark, but it is visibly "
        "coherent -- you cannot get the aperiodic detail that one Perlin "
        "modifier gives a mesh tool. And fillets on branching geometry are a "
        "coin flip with no diagnostics: on B5 the SAME operation times out at "
        "r=0.09, raises at r=0.06, succeeds at r=0.03, and fails at every "
        "radius if the selection is widened from 42 seam edges to all 144."
    ),
}

path = os.path.join(OUT, "metrics.json")
with open(path, "w") as fh:
    json.dump(metrics, fh, indent=1)
print(json.dumps(metrics, indent=1))
print(f"\nwrote {path}")
