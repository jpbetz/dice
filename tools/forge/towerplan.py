# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""towerplan — what a portal spec leaves you room to BUILD, before you model it.

    ~/opt/dice-forge/venv/bin/python tools/forge/towerplan.py
    …/python tools/forge/towerplan.py --in 0,9.4,-2.55,2.2 --out 0,1.0,4.2,3.5
    …/python tools/forge/towerplan.py --recipe tools/forge/recipes/nullstone.py

WHY THIS EXISTS, measured on the nullstone build (2026-08-13). Four of that
model's five gate failures were one class: propose geometry, watch a refusal,
adjust, re-bake. Each was ~30 seconds of machine time and a full round of
attention, and every one of them was ANSWERABLE IN ADVANCE — the numbers come
from the portal spec and the engine's own constants, both of which exist
before a single vertex does. The refusals were:

  · a rear facet inset so far it drove the outer skin INSIDE the bore (the
    wall turned inside out; the approach gate found it as a stray hit),
  · splinters whose inner face sat 2.08 from the axis, inside a 2.20 drop,
  · a crown whose clamps bunched six tops within 0.20 of each other,
  · two vertices landing on the same point where an outline converged.

The first two are pure arithmetic on the socket and the spec. This prints
that arithmetic — per heading, with the binding wall named — so the shape is
chosen against a table instead of against a gate.

It answers, in order: what the socket grants; where the bore must stay clear;
how much stone you have on each heading and what the floor under it is; what
the doorway costs in jamb and lintel; where the lane's two collider planes
run and what cladding them requires; and HOW TALL THE FRONT HAS TO BE for the
occlusion proof to pass, which is the one number that is invisible until a
browser tells you about it.

Nothing here is a second copy of an engine number: every constant comes from
towergates.ENGINE_MIRROR, the same dict check.py and the recipes read.
"""

import argparse
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import towergates as TG  # noqa: E402

EM = TG.ENGINE_MIRROR
S = EM["S"]
SOC = EM["socket"]
X_WALL = SOC["s"][0] / 2.0
Y_TOP = SOC["c"][1] + SOC["s"][1] / 2.0
Z_BACK = SOC["c"][2] - SOC["s"][2] / 2.0
Z_FRONT = SOC["c"][2] + SOC["s"][2] / 2.0
CLS = EM["auditClasses"]


def parse_spec(args):
    if args.recipe:
        src = open(args.recipe).read()
        def grab(name):
            m = re.search(name + r"\s*=\s*\{([^}]*)\}", src)
            if not m:
                raise SystemExit(f"towerplan: {args.recipe} has no {name}")
            d = {}
            for k, v in re.findall(r'"(\w+)"\s*:\s*([^,}]+)', m.group(1)):
                d[k] = eval(v, {"S": 1.25, "math": math, "AX": 0.0, "AZ": -2.55})  # noqa: S307
            return d
        return {"in": grab("PORTAL_IN"), "out": grab("PORTAL_OUT")}
    if args.in_ or args.out:
        i = [float(v) for v in (args.in_ or "0,8.75,-2.0,2.125").split(",")]
        o = [float(v) for v in (args.out or "0,1.0,5.0,4.5").split(",")]
        return {"in": {"x": i[0], "rimY": i[1], "z": i[2], "clearR": i[3]},
                "out": {"x": o[0], "sillY": o[1], "w": o[2], "clearH": o[3]}}
    return {"in": dict(EM["defaultPortals"]["in"]), "out": dict(EM["defaultPortals"]["out"])}


def check_limits(spec):
    """The per-field limits, said out loud. NECESSARY, never sufficient — the
    envelope below is what decides whether a legal spec is buildable."""
    lim = EM["portalLimits"]
    bad = []
    for half, keys in (("In", ("x", "z", "rimY")), ("Out", ("x", "sillY"))):
        for k in keys:
            lo, hi = lim[half][k]
            v = spec["in" if half == "In" else "out"][k]
            mark = "ok " if lo - 1e-9 <= v <= hi + 1e-9 else "BAD"
            if mark == "BAD":
                bad.append(f"{half}.{k}={v} outside [{lo}, {hi}]")
            print(f"  {mark} {half}.{k:<7} {v:>8.3f}   in [{lo:.3f}, {hi:.3f}]")
    for half, key, floor in (("In", "clearR", lim["In"]["clearR_min"]),
                             ("Out", "w", lim["Out"]["w_min"]),
                             ("Out", "clearH", lim["Out"]["clearH_min"])):
        v = spec["in" if half == "In" else "out"][key]
        mark = "ok " if v >= floor - 1e-9 else "BAD"
        if mark == "BAD":
            bad.append(f"{half}.{key}={v} under the measured floor {floor}")
        print(f"  {mark} {half}.{key:<7} {v:>8.3f}   >= {floor:.3f} "
              f"({'measured 2026-08-13, docs/TOWER.md THE MINIMUMS' if mark == 'ok ' else 'FLOOR'})")
    return bad


def reach(phi, ax, az):
    """How far out stone may stand on this heading, from the BORE AXIS."""
    sn, cs = abs(math.sin(phi)), math.cos(phi)
    lim = (X_WALL - abs(ax)) / sn if sn > 1e-6 else 1e9
    if cs > 1e-6:
        lim = min(lim, (Z_FRONT - az) / cs)
    elif cs < -1e-6:
        lim = min(lim, (az - Z_BACK) / -cs)
    return lim


def front_height_floor(spec):
    """THE NUMBER THAT IS INVISIBLE UNTIL A BROWSER FINDS IT.

    The occlusion proof demands the top of the cowl band — despawnY + a die's
    radius — be hidden from all six shipped eyes. Every one of those eyes is
    in FRONT of the tower, so what hides that sample is the model's own front,
    and the binding case is simply where each eye's ray to it crosses the
    socket plane. Below that height the front is a hole in the proof; above
    it, by any margin, the proof passes without a single die being simulated.
    """
    pin = spec["in"]
    ct = pin["rimY"] - EM["despawnDrop"] + EM["dieR"]
    rows = []
    for eid, e in TG.shipped_eyes():
        if e[1] <= ct:
            rows.append((eid, None, "looks UP at the band — the wall has it"))
            continue
        f = e[2] / (e[2] - pin["z"])
        rows.append((eid, e[1] + (ct - e[1]) * f, ""))
    return ct, rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--in", dest="in_", help="x,rimY,z,clearR")
    ap.add_argument("--out", help="x,sillY,w,clearH")
    ap.add_argument("--recipe", help="read PORTAL_IN/PORTAL_OUT out of a recipe")
    ap.add_argument("--wall", type=float, default=0.22,
                    help="the wall you intend between bore and outer skin (default 0.22)")
    ap.add_argument("--headings", type=int, default=12)
    args = ap.parse_args()
    spec = parse_spec(args)
    pin, pout = spec["in"], spec["out"]
    ax, az = pin["x"], pin["z"]
    despawn = pin["rimY"] - EM["despawnDrop"]

    print(f"\nTOWERPLAN  in {pin}  out {pout}")
    print(f"           despawnY {despawn:.3f}   S {S}   die radius {EM['dieR']}")

    print("\n1. THE LIMITS (per field; necessary, not sufficient)")
    bad = check_limits(spec)

    print("\n2. THE SOCKET — the room the tower is allowed to occupy")
    print(f"   |x| <= {X_WALL}   y in [0, {Y_TOP}]   z in [{Z_BACK}, {Z_FRONT}]")
    print(f"   a mesh outside it must be a CLADDING box (min.y <= {CLS['cladMinY']}, "
          f"max.y <= {CLS['cladMaxY']}, max.z <= {CLS['cladMaxZ']}) or, for a")
    print(f"   venueOnly row only, spend grounds backward to z {CLS['venueZBack']}")
    print("   the audit measures the WORLD box after the skin's lean: a group tilted")
    print("   t degrees pays |x| + y*sin(t), so a 12.2 crown at 0.45 deg costs 0.096")

    print("\n3. THE BORE — clear, from above the rim to the vanish")
    print(f"   a disc of radius {pin['clearR']:.3f} about (x {ax:.2f}, z {az:.2f}), "
          f"from y {pin['rimY'] + 2.5:.2f} down to y {despawn:.2f}")
    print(f"   so no stone, prop or splinter may come within {pin['clearR']:.3f} of that axis")
    print(f"   in that band — the floor under any outer skin is clearR + wall = "
          f"{pin['clearR'] + args.wall:.3f}")

    print(f"\n4. WHAT YOU HAVE TO BUILD WITH, per heading (wall {args.wall})")
    print("   phi is measured from +z (the player's side), swinging toward +x.")
    print("   phi     reach   floor   budget   binds on")
    floor = pin["clearR"] + args.wall
    tight = []
    for i in range(args.headings):
        phi = 2.0 * math.pi * i / args.headings
        r = reach(phi, ax, az)
        sn, cs = abs(math.sin(phi)), math.cos(phi)
        binds = "x wall"
        if cs > 1e-6 and abs(r - (Z_FRONT - az) / cs) < 1e-9:
            binds = "front plane"
        elif cs < -1e-6 and abs(r - (az - Z_BACK) / -cs) < 1e-9:
            binds = "back plane"
        b = r - floor
        if b < 0.25:
            tight.append((math.degrees(phi), b))
        print(f"   {math.degrees(phi):5.0f}   {r:6.3f}  {floor:6.3f}   {b:+6.3f}   {binds}"
              f"{'   <- TIGHT' if b < 0.25 else ''}")
    if tight:
        print(f"   {len(tight)} heading(s) leave under 0.25 of inset budget: "
              f"{', '.join(f'{d:.0f}deg' for d, _ in tight)}")
        print("   an inset deeper than the budget puts the outer skin inside the bore —")
        print("   the wall turns inside out and the approach gate reports a stray hit.")

    print("\n5. THE DOORWAY")
    jamb_x = pout["x"] + pout["w"] / 2.0
    print(f"   the cut: |x - {pout['x']:.2f}| <= {pout['w'] / 2:.3f}, "
          f"y {pout['sillY']:.2f}..{pout['sillY'] + pout['clearH']:.2f}")
    print(f"   the throat probed: |x - {pout['x']:.2f}| <= "
          f"{TG.THROAT_MARGIN * pout['w'] / 2:.3f}, y "
          f"{pout['sillY'] + pout['clearH'] * (1 - TG.THROAT_MARGIN) / 2:.3f}.."
          f"{pout['sillY'] + pout['clearH'] * (1 + TG.THROAT_MARGIN) / 2:.3f}, "
          f"z {-TG.EXIT_BACK:.2f}..{TG.EXIT_FRONT:.2f} (ramp-aware start)")
    r_at_jamb = math.hypot(jamb_x - ax, 0.0 - az)
    print(f"   the far jamb stands {r_at_jamb:.3f} from the bore axis, so any plan whose")
    print(f"   radius there is under that has no stone beside its own door")
    print(f"   NOTE the engine builds doorL/doorR/lintel centred on x = 0 regardless of")
    print(f"   out.x (ROADMAP T2) — an off-centre door does not move them yet")

    print("\n6. THE LANE — what cladding the outrun costs")
    v = TG.engine_volumes(spec)
    ra, rb = TG.box_top_plane(v["apron"])
    la, lb = TG.box_top_plane(v["lip"])
    cross = (ra - la) / (rb - lb)
    print(f"   ramp plane  y = {ra:.4f} - {rb:.4f} z   (28 deg family)")
    print(f"   lip plane   y = {la:.4f} - {lb:.4f} z")
    print(f"   they cross at z {cross:.3f}; the lip runs under the felt at z "
          f"{la / lb:.3f}, which is where the cladding samples stop")
    print(f"   clad within {TG.LANE_CLAD_TOL} of those planes across |x| <= "
          f"{TG.THROAT_MARGIN * pout['w'] / 2:.3f}, or declare --bare-colliders")
    print(f"   nothing of the model in the band from the plane to "
          f"{TG.LANE_HEAD_DIAMETERS * EM['dieR']:.2f} above it (a die's own room)")
    print(f"   a clad mesh reaches past z {Z_FRONT}, so it must satisfy the CLADDING")
    print(f"   envelope class: dip to y <= {CLS['cladMinY']} and stop by z {CLS['cladMaxZ']}")

    print("\n7. HOW TALL THE FRONT MUST BE — the occlusion proof, in advance")
    ct, rows = front_height_floor(spec)
    print(f"   the cowl band's top is despawnY + a die's radius = {ct:.3f}")
    print("   each eye's ray to it crosses the socket plane (z = 0) at:")
    need = 0.0
    for eid, y, note in rows:
        if y is None:
            print(f"     {eid:<12}    —      {note}")
        else:
            need = max(need, y)
            print(f"     {eid:<12} y {y:6.3f}")
    print(f"   SO: the model's front must be solid to y {need:.3f} over the door's")
    print(f"   width, or the occlusion proof fails at that eye. Build over it and the")
    print(f"   proof passes with no die simulated — which is the whole cosmetic lane.")

    if bad:
        print(f"\nBAD: {len(bad)} field(s) outside the contract:")
        for b in bad:
            print(f"  - {b}")
        return 1
    print("\nok: the spec is legal; the table above is what it leaves you to build with.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
