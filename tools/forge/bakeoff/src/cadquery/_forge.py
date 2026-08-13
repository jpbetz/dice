# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""Shared helpers for the CadQuery arm of the mesh-tool bake-off.

Everything the seven battery scripts need that is not modelling: coordinate
conversion, placement, tessellation + export (both routes), timing, and the
per-item metrics fragment.

Coordinate note that governs every script here
----------------------------------------------
CadQuery/OCCT is Z-up; glTF is Y-up. BOTH export routes apply the same
-90 degrees about X, so both agree:

    cad (x, y, z)  ->  gltf (x, z, -y)

* native GLB: ``exportGLTF`` premultiplies ``Location((0,0,0),(1,0,0),-90)``
  onto the assembly before handing it to ``RWGltf_CafWriter``.
* STL route: ``harness/stl2glb.py --zup`` applies the same rotation.

Inverting it gives the rule the battery scripts author by:

    spec  Y (up)     -> author on cad  Z
    spec  Z (front)  -> author on cad -Y
    spec  X          -> author on cad  X

`spec_to_cad()` does that for spec-space coordinates (B7's sphere list).
Rotations carry the same sign, because the map is a proper rotation: a
rotation about spec +Y is a rotation about cad +Z by the same angle.

Two export routes, one interface
--------------------------------
`bake()` takes a list of `Part`s and a tessellation setting, and can emit
either route (or both, for the B1 head-to-head):

* ``native-glb`` -- ``cq.Assembly.export(".glb")``. Per-part colour survives
  as a glTF material. Normals come from the underlying B-rep surface, so
  curved faces are exactly smooth and every B-rep edge is a normal split.
* ``stl-convert`` -- ``cq.exporters.export(".stl")`` then the harness
  ``stl2glb.py --zup --angle 30``, which has to *infer* creases from a
  30-degree threshold.

Density control is the tessellation pair (``tol``, ``ang``) fed straight to
``BRepMesh_IncrementalMesh``: ``tol`` is the max chord deviation in model
units, ``ang`` the max angle between successive facet normals in radians.
Lower either one for more triangles. This is a true up-and-down control and
it is continuous, unlike a segment count.
"""

import json
import os
import subprocess
import time
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import cadquery as cq

EVAL = "/tmp/claude-1000/-home-jpbetz-projects-dice/0dc7b008-4d61-4067-a85e-9ddd3fd5a611/scratchpad/eval"
OUT = os.path.join(EVAL, "out", "cadquery")
RAW = os.path.join(OUT, "_raw")
HARNESS = os.path.join(EVAL, "harness")
# The shared venv owns trimesh + the harness scripts; it is read-only for us.
HARNESS_PY = "/home/jpbetz/opt/dice-forge/venv/bin/python"


# --------------------------------------------------------------------------
# coordinates
# --------------------------------------------------------------------------


def spec_to_cad(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """Spec-space (glTF, Y-up) point -> CadQuery-space (Z-up) point."""
    return (x, -z, y)


# --------------------------------------------------------------------------
# parts
# --------------------------------------------------------------------------


@dataclass
class Part:
    """One coloured solid. `color` is an (r, g, b) triple in 0..1, or None."""

    name: str
    shape: cq.Shape
    color: Optional[Tuple[float, float, float]] = None

    def moved(self, dx: float, dy: float, dz: float) -> "Part":
        return Part(self.name, self.shape.translate((dx, dy, dz)), self.color)


def as_shape(obj) -> cq.Shape:
    """Accept a Workplane or a raw Shape and return a Shape."""
    return obj.val() if isinstance(obj, cq.Workplane) else obj


def stand_on_floor(parts: Sequence[Part], center_xy: bool = True) -> List[Part]:
    """Translate all parts together so the model is centred and sits on z=0.

    Applied to the whole group, never per part, so relative placement is
    untouched. In glTF terms this is "centred on origin, min y == 0".
    """
    bb = cq.Compound.makeCompound([p.shape for p in parts]).BoundingBox()
    dx = -(bb.xmin + bb.xmax) / 2 if center_xy else 0.0
    dy = -(bb.ymin + bb.ymax) / 2 if center_xy else 0.0
    return [p.moved(dx, dy, -bb.zmin) for p in parts]


# --------------------------------------------------------------------------
# export + measure
# --------------------------------------------------------------------------


def inspect_glb(path: str) -> dict:
    """Uniform metrics, straight from the harness (never eyeballed)."""
    proc = subprocess.run(
        [HARNESS_PY, os.path.join(HARNESS, "inspect_glb.py"), path],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout)[0]


def _export_native(
    parts: Sequence[Part], glb: str, tol: float, ang: float, merge_faces: bool = True
) -> None:
    """Native GLB through OCCT's RWGltf_CafWriter.

    `merge_faces` matters more than it sounds. Stock ``Assembly.export(".glb")``
    writes ONE glTF primitive PER B-REP FACE -- a 21-pip die came out as 99
    meshes, every one of them an open patch, so the harness (rightly) scored
    it not-watertight. OCCT's writer has a `SetMergeFaces` flag that welds all
    faces sharing a material into one primitive; CadQuery just does not expose
    it. So this reproduces `exportGLTF` verbatim and flips that one flag.
    """
    assy = cq.Assembly(name=os.path.basename(glb).split(".")[0])
    for p in parts:
        color = cq.Color(*p.color) if p.color else None
        assy.add(p.shape, name=p.name, color=color)

    if not merge_faces:
        assy.export(glb, tolerance=tol, angularTolerance=ang)
        return

    from OCP.Message import Message_ProgressRange
    from OCP.RWGltf import RWGltf_CafWriter
    from OCP.TCollection import TCollection_AsciiString
    from OCP.TColStd import TColStd_IndexedDataMapOfStringString

    from cadquery.occ_impl.assembly import toCAF
    from cadquery.occ_impl.geom import Location

    assy.loc *= Location((0, 0, 0), (1, 0, 0), -90)  # cad Z-up -> glTF Y-up
    _, doc = toCAF(assy, True, True, tol, ang)
    writer = RWGltf_CafWriter(TCollection_AsciiString(glb), True)
    writer.SetMergeFaces(True)
    if not writer.Perform(
        doc, TColStd_IndexedDataMapOfStringString(), Message_ProgressRange()
    ):
        raise RuntimeError(f"RWGltf_CafWriter failed for {glb}")


def _export_stl_convert(
    parts: Sequence[Part], glb: str, tol: float, ang: float, crease_deg: float
) -> None:
    stl = glb[:-4] + ".stl"
    cq.exporters.export(
        cq.Compound.makeCompound([p.shape for p in parts]),
        stl,
        tolerance=tol,
        angularTolerance=ang,
    )
    subprocess.run(
        [
            HARNESS_PY,
            os.path.join(HARNESS, "stl2glb.py"),
            stl,
            glb,
            "--zup",
            "--angle",
            str(crease_deg),
        ],
        capture_output=True,
        text=True,
        check=True,
    )


def bake(
    item: str,
    slug: str,
    parts: Sequence[Part],
    *,
    tol: float = 0.02,
    ang: float = 0.25,
    route: str = "native-glb",
    also_stl: bool = False,
    crease_deg: float = 30.0,
    build_seconds: float = 0.0,
    notes: str = "",
    status: str = "done",
    color_support: str = "material",
    extra: Optional[dict] = None,
) -> dict:
    """Export, measure, and write out/cadquery/_raw/<item>.json.

    `build_seconds` is the modelling time the caller measured; export time is
    measured here and the two are summed into `bake_seconds`, which is the
    honest source-to-GLB wall time.
    """
    os.makedirs(RAW, exist_ok=True)
    glb = os.path.join(OUT, f"{item}_{slug}.glb")

    t0 = time.perf_counter()
    if route == "native-glb":
        _export_native(parts, glb, tol, ang)
    else:
        _export_stl_convert(parts, glb, tol, ang, crease_deg)
    export_seconds = time.perf_counter() - t0

    info = inspect_glb(glb)
    rec = {
        "id": item,
        "status": status,
        "bake_seconds": round(build_seconds + export_seconds, 2),
        "build_seconds": round(build_seconds, 2),
        "export_seconds": round(export_seconds, 2),
        "tris": info["tris"],
        "watertight": info["watertight"],
        "file_kb": info["file_kb"],
        "color_support": color_support,
        "export_path": route,
        "tessellation": {"tolerance": tol, "angularTolerance": ang},
        "bounds_min": info["bounds_min"],
        "bounds_max": info["bounds_max"],
        "meshes": info["meshes"],
        "materials": info["materials"],
        "degenerate_faces": info["degenerate_faces"],
        "notes": notes,
    }
    if extra:
        rec.update(extra)

    # Optional head-to-head: same solids, same tessellation, other routes.
    if also_stl and route == "native-glb":
        alt = os.path.join(OUT, f"_{item}_stlroute.glb")
        t0 = time.perf_counter()
        _export_stl_convert(parts, alt, tol, ang, crease_deg)
        rec["stl_route_compare"] = dict(
            inspect_glb(alt), export_seconds=round(time.perf_counter() - t0, 2)
        )
        stock = os.path.join(OUT, f"_{item}_stock_native.glb")
        t0 = time.perf_counter()
        _export_native(parts, stock, tol, ang, merge_faces=False)
        rec["stock_native_compare"] = dict(
            inspect_glb(stock), export_seconds=round(time.perf_counter() - t0, 2)
        )

    with open(os.path.join(RAW, f"{item}.json"), "w") as fh:
        json.dump(rec, fh, indent=1)
    print(json.dumps(rec, indent=1))
    return rec


class Stopwatch:
    """`with Stopwatch() as sw: ...` then `sw.seconds`."""

    def __enter__(self) -> "Stopwatch":
        self._t0 = time.perf_counter()
        return self

    def __exit__(self, *exc) -> None:
        self.seconds = time.perf_counter() - self._t0
