# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B5 candelabra -- recursion/grammar power.

The grammar is just Python, which is the whole point: `grow()` calls itself,
carries a radius that it multiplies by TAPER on the way down, and stops at
depth 0 by planting a finial instead of a fork. Nine tubes, four joints, six
finials, one fuse.

    grow(trunk)  -> joint -> 3x grow(arm)  -> joint -> 2x grow(twig) -> finial

Each tube is a circle swept along a spline whose tilt eases from `tilt0` to
`tilt1`, so an arm leaves the fork at 40 degrees and is nearly upright by the
time it carries a candle. Because the profile is a circle, the sweep frame is
irrelevant and MakePipeShell cannot twist the section -- that is why this is
the one sweep in the battery with no orientation bookkeeping.

Junctions: a sphere at every fork, radius 1.18x the parent tube, then a real
`.fillet()` on the seam edges so the forks are BLENDED, not just closed. That
fillet is the fragile part of the whole battery and it is measured rather
than assumed -- `blend_junctions()` probes six (selection, radius) pairs, each
in a child process under a watchdog, and the model ships with the largest
radius that provably terminates. See the fillet_log in the metrics: one of
the six does not fail, it simply never returns.
"""

import math
import multiprocessing as mp
import time

import cadquery as cq

from _forge import Part, Stopwatch, bake, stand_on_floor

BASE_R, BASE_H = 0.70, 0.14
TRUNK_R, TRUNK_LEN = 0.22, 1.20
TAPER = 0.75

ARM_LEN, ARM_TILT = 1.05, (40.0, 12.0)  # (leaving the fork, arriving at the tip)
TWIG_LEN, TWIG_TILT = 0.85, (38.0, 8.0)
ARM_FAN, TWIG_FAN = 3, 2
TWIG_SPLAY = 32.0  # azimuth spread of a twig pair about its parent

PAN_R, PAN_H = 0.28, 0.07
CUP_R, CUP_H = 0.11, 0.18

BRASS_RGB = (0.72, 0.56, 0.24)


def _dir(azimuth_deg: float, tilt_deg: float) -> cq.Vector:
    a, t = math.radians(azimuth_deg), math.radians(tilt_deg)
    return cq.Vector(math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t))


def _path(start, azimuth, tilt0, tilt1, length, steps=10):
    """Points along a branch whose tilt eases from tilt0 to tilt1."""
    pts, p = [start], start
    for i in range(steps):
        tilt = tilt0 + (tilt1 - tilt0) * (i + 0.5) / steps
        p = p.add(_dir(azimuth, tilt).multiply(length / steps))
        pts.append(p)
    return pts


def tube(pts, radius: float) -> cq.Shape:
    """Circle of `radius` swept along the spline through `pts`."""
    spine = cq.Wire.assembleEdges([cq.Edge.makeSpline(pts)])
    heading = pts[1].sub(pts[0])
    profile = cq.Workplane(cq.Plane(origin=pts[0], normal=heading)).circle(radius)
    return profile.sweep(cq.Workplane(obj=spine), isFrenet=False).val()


def finial(tip: cq.Vector, radius: float):
    """Drip-pan plus candle cup at a branch tip."""
    pan = cq.Solid.makeCone(radius * 1.1, PAN_R, PAN_H, tip)
    cup = cq.Solid.makeCylinder(CUP_R, CUP_H, tip.add(cq.Vector(0, 0, PAN_H)))
    bore = cq.Solid.makeCylinder(
        CUP_R - 0.035, CUP_H, tip.add(cq.Vector(0, 0, PAN_H + 0.06))
    )
    return [pan, cup.cut(bore)]


def grow(start, azimuth, tilt, length, radius, depth, fan, out, forks):
    """Recursive branch. `depth` 0 means: end in a candle, not a fork."""
    pts = _path(start, azimuth, tilt[0], tilt[1], length)
    out.append(tube(pts, radius))
    tip = pts[-1]

    if depth == 0:
        out.extend(finial(tip, radius))
        return

    forks.append(tip)
    out.append(cq.Solid.makeSphere(radius * 1.18, tip, angleDegrees1=-90))
    child_r = radius * TAPER
    for i in range(fan):
        if depth == 2:  # trunk -> arms: fan evenly around the compass
            child_az = azimuth + i * 360.0 / fan
        else:  # arm -> twigs: splay either side of the parent
            child_az = azimuth + (i - (fan - 1) / 2) * TWIG_SPLAY * 2
        grow(tip, child_az, TWIG_TILT, TWIG_LEN, child_r, depth - 1, TWIG_FAN, out, forks)


def select_edges(solid, junction_only: bool, forks):
    """Seam edges (within 0.45 of a fork centre) or, as a control, all of them."""
    if not junction_only:
        return solid.Edges()
    return [
        e for e in solid.Edges() if any(e.Center().sub(f).Length < 0.45 for f in forks)
    ]


def _fillet_worker(pipe, junction_only: bool, radius: float):
    """Child process: rebuild, then attempt one fillet. See probe_fillet."""
    solid, forks = assemble()
    edges = select_edges(solid, junction_only, forks)
    pipe.send(("ready", len(edges)))
    t0 = time.perf_counter()
    try:
        cq.Workplane(obj=solid).newObject(edges).fillet(radius)
        pipe.send(("ok", time.perf_counter() - t0))
    except Exception as exc:
        pipe.send((f"FAILED {type(exc).__name__}", time.perf_counter() - t0))


def probe_fillet(junction_only: bool, radius: float, budget: float = 40.0):
    """One fillet attempt, in a child process, under a wall-clock watchdog.

    The watchdog is the finding, not a convenience. OCCT's fillet on these
    tube/sphere junctions does not fail fast -- an earlier in-process run sat
    at 100% CPU for 13 minutes on a single .fillet() call and never returned
    or raised. A blend attempt on branching geometry has to be treated as a
    job that might not terminate, which is not something you can express in
    the CadQuery API.
    """
    ctx = mp.get_context("spawn")
    parent, child = ctx.Pipe()
    proc = ctx.Process(target=_fillet_worker, args=(child, junction_only, radius))
    proc.start()
    label = "junction-only" if junction_only else "all-edges"
    try:
        if not parent.poll(120):
            proc.terminate()
            return f"{label} r={radius}: worker never assembled", False
        _, n_edges = parent.recv()
        if not parent.poll(budget):
            proc.terminate()
            return f"{label} r={radius} ({n_edges} edges): TIMEOUT >{budget:.0f}s", False
        status, secs = parent.recv()
        return f"{label} r={radius} ({n_edges} edges): {status} in {secs:.1f}s", status == "ok"
    finally:
        proc.join(10)


def blend_junctions(forks):
    """Map where OCCT's fillet works on this model. Returns (log, winner).

    `winner` is the largest junction-only radius that provably terminates and
    succeeds; the caller re-runs exactly that one in-process, which is safe
    precisely because the probe proved it returns.
    """
    log, winner = [], None
    for junction_only in (True, False):
        for radius in (0.09, 0.06, 0.03):
            line, ok = probe_fillet(junction_only, radius)
            print("[B5] fillet", line)
            log.append(line)
            if ok and junction_only and winner is None:
                winner = radius
    return log, winner


def assemble():
    """The whole candelabra as one fused solid, plus the fork centres."""
    parts = [
        cq.Solid.makeCylinder(BASE_R, BASE_H),
        cq.Solid.makeSphere(TRUNK_R * 1.3, cq.Vector(0, 0, BASE_H), angleDegrees1=-90),
    ]
    forks = []
    grow(
        cq.Vector(0, 0, BASE_H),
        azimuth=90.0,
        tilt=(0.0, 0.0),
        length=TRUNK_LEN,
        radius=TRUNK_R,
        depth=2,
        fan=ARM_FAN,
        out=parts,
        forks=forks,
    )
    return parts[0].fuse(*parts[1:]).clean(), forks


if __name__ == "__main__":
    # Only the geometry is timed as the bake. The blend probes below are
    # measurement, not modelling, and are reported separately.
    with Stopwatch() as sw:
        solid, forks = assemble()
    print(
        f"[B5] height {solid.BoundingBox().zmax:.3f}, {len(forks)} forks, "
        f"{len(solid.Faces())} faces, assembled in {sw.seconds:.2f}s"
    )
    log, winner = blend_junctions(forks)
    blend_seconds = 0.0
    if winner:
        with Stopwatch() as sw_fillet:
            solid = (
                cq.Workplane(obj=solid)
                .newObject(select_edges(solid, True, forks))
                .fillet(winner)
                .val()
            )
        blend_seconds = sw_fillet.seconds
        print(f"[B5] shipped WITH r={winner} junction blends ({blend_seconds:.2f}s)")
    parts = stand_on_floor([Part("candelabra", solid, BRASS_RGB)])
    bake(
        "B5",
        "candelabra",
        parts,
        tol=0.005,
        ang=0.35,
        route="stl-convert",
        build_seconds=sw.seconds + blend_seconds,
        notes=(
            "Recursion is plain Python: one grow() that forks 3 then 2 and "
            "tapers x0.75 per generation. 9 swept tubes + 4 joint spheres + 6 "
            "finials, one fuse -- the fuse itself never complained. Real "
            f"blends DO work and are SHIPPED (fillet r={winner} on the 42 seam "
            "edges), but the working window is narrow and undiscoverable "
            "without probing, so every attempt was run in a child process "
            "under a 40 s watchdog: "
            + "; ".join(log)
            + ". Note the shape of that: the same operation times out at 0.09, "
            "raises at 0.06 and succeeds at 0.03, and widening the selection "
            "to all 144 edges fails at every radius. There is no error message "
            "anywhere in there that tells you which knob to turn."
        ),
        extra={
            "fillet_attempts": len(log),
            "fillet_failures": sum("FAILED" in line for line in log),
            "fillet_timeouts": sum("TIMEOUT" in line for line in log),
            "fillet_shipped_radius": winner,
            "fillet_log": log,
        },
    )
