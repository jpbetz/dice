# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""towerkit — the part of a tower recipe that is the same in every tower.

A recipe should be a SHAPE and a PAINT. Everything else — turning Blender
meshes into triangles, casting a ray at them, and asking the contract's six
questions in the right order with the right message when the answer is no —
is identical from tower to tower, and was being copied. hollowbole.py and
nullstone.py carried the same `tri_array` and the same Möller-Trumbore twice
over, plus five gate wrappers that differed only in their print prefix.

WHAT LIVES HERE: measurement (tri_array, ray_hit) and THE BATTERY —
approach, throat, occlusion, hole-below-the-sill, lane/cladding, socket
envelope, and the front-height proof. Every one delegates to `towergates`,
which is also what check.py runs on the finished file; this is the in-recipe
half, so a bad parameter fails in eight seconds with the offending probe
named instead of thirty seconds later as a ray count on a GLB.

WHAT DOES NOT: geometry. There is no lofted-mass builder here and there
should not be — the shape is the one thing a tower recipe is FOR, and a kit
that offered "make me a tower body" would make every tower the same tower.
tools/forge/towerplan.py is the other half of this: it prints what a portal
spec leaves you room to build BEFORE you build it.

    import towerkit as K
    ...
    K.run_battery(meshes, SPEC, tag="null", tilt_deg=0.0,
                  crown_max=12.30, clad={"towerSkinNullShard"})

`run_battery` returns the list of gate names it ran, so "every gate ran" is
structural rather than a manifest somebody remembers to update.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import towergates as TG  # noqa: E402

EM = TG.ENGINE_MIRROR


# --------------------------------------------------------------------------
# measurement
# --------------------------------------------------------------------------

def tri_array(objs):
    """Every triangle of every object, in APP FRAME.

    Blender is Z-up and the contract is Y-up-with-+z-toward-the-player, so the
    conversion happens exactly here and nowhere else. `calc_loop_triangles` is
    not optional: a recipe's n-gons are not what ships."""
    import numpy as np
    tris = []
    for ob in objs:
        me = ob.data
        me.calc_loop_triangles()
        vs = [(v.co.x, v.co.z, -v.co.y) for v in me.vertices]
        for lt in me.loop_triangles:
            tris.append([vs[i] for i in lt.vertices])
    return np.asarray(tris, dtype=float)


def ray_hit(tris, origin, direction, t_max):
    """Nearest two-sided hit in (eps, t_max), or None. Möller-Trumbore.

    Two-sided on purpose, exactly as towergates' own caster is: a plug across
    a doorway blocks a die whichever way its faces point, and back-face
    culling would wave it through."""
    import numpy as np
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
           & (t > 1e-6) & (t < t_max))
    return float(t[hit].min()) if hit.any() else None


def despawn_y(spec):
    return spec["in"]["rimY"] - EM["despawnDrop"]


def front_height_needed(spec):
    """The lowest the model's front may be and still pass the FRONT gate.

    Returns (y, eye_id). towerplan.py prints the whole per-eye table before you
    model; this returns the binding number so a recipe can BUILD to it — see
    tower_fixture.py, whose front used to stop at its own entry rim and leaked
    the cowl band for exactly that reason. The arithmetic is TG's, so the plan,
    the recipe and the gate cannot answer differently.

    IT IS THE MAX OF TWO FLOORS (2026-08-14). This used to return the
    occlusion crossing alone, while gate_front_carries_the_dark ALSO enforced
    that a die vanishes at or below the mouth — a second, independent floor
    that no tool computed and nothing printed. On nullstone it binds 0.128
    higher than the one that was published. Found by the divergence agent that
    tried to open a hole in the front and got refused by a number it could not
    look up. See TG.front_height_rows."""
    _, rows = TG.front_height_rows(spec)
    best = (-1e9, None)
    for r in rows:
        if r["need"] is not None and r["need"] > best[0]:
            best = (r["need"], r["eid"])
    return best


# --------------------------------------------------------------------------
# the battery
# --------------------------------------------------------------------------

def gate_approach(meshes, spec, tag):
    """Nothing leans into the drop, rim + 2.5 down to the vanish."""
    import numpy as np
    tris = tri_array(meshes)
    pin = spec["in"]
    y_top = pin["rimY"] + 2.5
    bad = []
    for px, pz in TG.disc_probes(pin["x"], pin["z"], pin["clearR"]):
        t = ray_hit(tris, np.array([px, y_top, pz]), np.array([0.0, -1.0, 0.0]),
                    y_top - despawn_y(spec))
        if t is not None:
            bad.append((round(px, 2), round(pz, 2), round(y_top - t, 2)))
    if bad:
        raise RuntimeError(
            f"approach column blocked at {len(bad)}/25 probes {bad[:4]} — stone "
            f"is inside the drop. The clear disc is radius {pin['clearR']} about "
            f"(x {pin['x']}, z {pin['z']}); towerplan.py prints the floor under "
            f"any outer skin as clearR + your wall.")
    print(f"[{tag}] approach column 25/25 clear")


def gate_throat(meshes, spec, tag):
    """The doorway is a hole, on check.py's own ramp-aware start line."""
    import numpy as np
    tris = tri_array(meshes)
    out = spec["out"]
    hw = TG.THROAT_MARGIN * out["w"] / 2.0
    y0 = out["sillY"] + out["clearH"] * (1 - TG.THROAT_MARGIN) / 2
    bad = []
    for px, py in TG.rect_probes(out["x"], y0, 2 * hw, out["clearH"] * TG.THROAT_MARGIN):
        pz = TG.exit_ray_start_z(py, out["sillY"], 0.0, spec)
        t = ray_hit(tris, np.array([px, py, pz]), np.array([0.0, 0.0, 1.0]),
                    TG.EXIT_FRONT - pz)
        if t is not None:
            bad.append((round(px, 2), round(py, 2), round(pz + t, 2)))
    if bad:
        raise RuntimeError(
            f"exit throat blocked at {len(bad)}/25 probes, first at {bad[0]} — "
            f"widen the door cut past the declared {out['w']} x {out['clearH']}, "
            f"or drop whatever clads the sill.")
    print(f"[{tag}] exit throat 25/25 clear")


def gate_occlusion(meshes, spec, tag, tilt_deg=0.0):
    fails, counts = TG.occlusion_failures(tri_array(meshes), spec, tilt_deg)
    if fails:
        raise RuntimeError(fails[0].replace("; ", "\n       "))
    print(f"[{tag}] occlusion {counts['cowl']}/{counts['cowl']} cowl and "
          f"{counts['shaft']}/{counts['shaft']} shaft, at all "
          f"{len(EM['zoomEyes'])} shipped eyes")


def gate_hole_below_sill(meshes, spec, tag, tilt_deg=0.0):
    fails, tested, leaks = TG.hole_below_sill_failures(tri_array(meshes), spec, tilt_deg)
    if fails:
        raise RuntimeError(fails[0])
    print(f"[{tag}] no sight line into the hollow below the sill "
          f"({leaks}/{tested} of the flank rays)")


def gate_lane(meshes, spec, tag, bare=()):
    fails, info = TG.lane_failures(tri_array(meshes), spec, bare)
    if fails:
        raise RuntimeError(fails[0])
    ramp, lip = info["clad"]["ramp"], info["clad"]["lip"]
    declared = info["bare_colliders"]
    print(f"[{tag}] lane clear; ramp clad {ramp[0]}/{ramp[1]}, lip clad "
          f"{lip[0]}/{lip[1]}, x {info['lane_x']} z {info['lane_z']}"
          + (f"; declared bare: {declared}" if declared else ""))


def gate_envelopes(meshes, tag, *, x_lim, crown_max, clad=(), foot_dip=None):
    """The socket, per mesh node, exactly as check.py classifies it.

    `clad` names the meshes that reach past the socket's front plane and must
    therefore satisfy the CLADDING class instead — a set of names rather than
    a guess from geometry, because "is this the ramp skin or a lobe that has
    escaped" is an authoring intent, not a measurement."""
    import forge as F
    cls = EM["auditClasses"]
    dip = cls["footDip"] if foot_dip is None else foot_dip
    z_back = EM["socket"]["c"][2] - EM["socket"]["s"][2] / 2.0
    z_front = EM["socket"]["c"][2] + EM["socket"]["s"][2] / 2.0
    for ob in meshes:
        lo, hi = F.world_bounds([ob])
        a = (min(lo.x, hi.x), min(lo.z, hi.z), -max(lo.y, hi.y))
        b = (max(lo.x, hi.x), max(lo.z, hi.z), -min(lo.y, hi.y))
        xw = max(abs(a[0]), abs(b[0]))
        if xw > x_lim + 1e-6:
            raise RuntimeError(f"{ob.name}: |x| {xw:.3f} > {x_lim}")
        if b[1] > crown_max + 1e-6:
            raise RuntimeError(f"{ob.name}: top {b[1]:.3f} > {crown_max}")
        if ob.name in clad:
            if a[1] > cls["cladMinY"] or b[2] > cls["cladMaxZ"] or b[1] > cls["cladMaxY"]:
                raise RuntimeError(
                    f"{ob.name}: not a CLADDING box — needs min.y <= "
                    f"{cls['cladMinY']} (is {a[1]:.3f}), max.z <= {cls['cladMaxZ']} "
                    f"(is {b[2]:.3f}), max.y <= {cls['cladMaxY']} (is {b[1]:.3f})")
        elif a[2] < z_back - 1e-6 or b[2] > z_front + 1e-6 or a[1] < dip:
            raise RuntimeError(
                f"{ob.name}: not IN-SOCKET — z [{a[2]:.3f},{b[2]:.3f}] vs "
                f"[{z_back},{z_front}], min.y {a[1]:.3f} vs {dip}")
        print(f"[{tag}] envelope ok {ob.name}: x±{xw:.2f} y {a[1]:.2f}..{b[1]:.2f} "
              f"z {a[2]:.2f}..{b[2]:.2f}")


def gate_front_carries_the_dark(occluder_meshes, spec, tag, front_top):
    """The MASS hides the vanish, and a die is still visible below the mouth.

    Two claims that a taller decoration would silently take over, which is why
    this one is handed ONLY the meshes that are supposed to be doing the work:
    pass the shell, not the crown, and a splinter cannot cover for a wall."""
    import numpy as np
    tris = tri_array(occluder_meshes)
    pin = spec["in"]
    ct = despawn_y(spec) + EM["dieR"]
    need, eid_need = front_height_needed(spec)
    for eid, e in TG.shipped_eyes():
        if e[1] <= ct:
            continue
        d = np.array([pin["x"] - e[0], ct - e[1], pin["z"] - e[2]])
        if ray_hit(tris, np.array(e), d, 0.999) is None:
            raise RuntimeError(
                f"the occluder does not hide the top cowl sample from {eid}: the "
                f"ray reaches y {ct:.2f} on the bore axis unobstructed. The front "
                f"has to be solid to y {need:.3f} (towerplan.py section 7) — and "
                f"raising a decoration instead only moves the leak.")
    # `front_top` IS OPTIONAL, AND FOR AN ORGANIC MODEL IT SHOULD BE ABSENT.
    # It is a scalar standing in for "how tall the front is", which a slab
    # tower can answer honestly (nullstone hands over cleave_y(0, 0)) and a
    # torn stump cannot: hollowbole's front is a curved shell with a wound in
    # it and there is no number in the recipe that means this. That is why the
    # stump ran the whole battery for weeks with the front gate SKIPPED — the
    # gate asked for a parameter the model could not produce, so the model
    # simply did not call it, and no one noticed the strongest claim about a
    # shipped tower was never being made.
    #
    # So when it is absent the die-vanish claim below is MEASURED off the
    # built triangles instead of derived from the proxy. That is strictly the
    # better evidence — it is the same ray the player's eye casts — and the
    # scalar comparison is skipped rather than faked. The disc-wide coverage
    # this loses is gate_occlusion's job (99 samples over the whole band); the
    # bore axis is where the DIE is, which is what this claim is about.
    if front_top is not None and front_top < need:
        raise RuntimeError(f"the front stands at {front_top:.2f}, under the "
                           f"binding sight line {need:.3f} from {eid_need} "
                           f"(towerplan.py section 7 prints both floors)")

    def seen_to_at(eye):
        """The highest point on the bore axis this eye cannot see. -> y or None."""
        if front_top is not None:
            return eye[1] + (front_top - eye[1]) * (eye[2] - pin["z"]) / eye[2]
        y = pin["rimY"] + 4.0          # above any legal crown, so the answer is
        floor_y = despawn_y(spec) - 0.5  # found rather than clipped by the search
        o = np.array(eye, dtype=float)
        while y > floor_y:
            p = np.array([pin["x"], y, pin["z"]])
            if ray_hit(tris, o, p - o, 0.999) is not None:
                return y
            y -= 0.005
        return None
    # THE DIE-VANISH CLAIM, ASKED DIRECTLY — and its floor comes from the same
    # function the plan prints, never a second derivation. It used to be an
    # independent inequality here: `need` was the occlusion crossing alone, so
    # this clause was the ONLY thing that knew about the second floor and the
    # only way to learn the number was to fail. On nullstone it binds 0.128
    # over the published one. Keeping the direct check AND deriving the floor
    # from the shared arithmetic is the point: if they ever disagree, the
    # assertion below fires instead of a modeller's afternoon.
    worst = None
    for eid, e in TG.shipped_eyes():
        floor = TG.front_vanish_floor(spec, e)
        if floor is None:
            continue
        seen_to = seen_to_at(e)
        if seen_to is None or seen_to < pin["rimY"]:
            where = f"y {seen_to:.2f}" if seen_to is not None else "nowhere on the drop"
            raise RuntimeError(
                f"the front hides the drop ABOVE the declared mouth: from {eid} a "
                f"die is lost at {where}, mouth {pin['rimY']} — dice must "
                f"vanish inside a building, not in mid-air over it. The front has "
                f"to reach y {floor:.3f} for this eye (towerplan.py section 7).")
        if worst is None or seen_to < worst[1]:
            worst = (eid, seen_to)
        if front_top is not None:
            assert front_top < floor or seen_to >= pin["rimY"] - 1e-9, (
                f"front_vanish_floor and the direct check disagree at {eid}: floor "
                f"{floor:.4f}, front {front_top:.3f}, seen_to {seen_to:.3f}")
    stands = f"a front at {front_top:.2f}" if front_top is not None \
        else "a front measured off the built triangles"
    print(f"[{tag}] the mass carries the dark: binding sight line {need:.2f} "
          f"({eid_need}) under {stands}; the worst eye ({worst[0]}) loses a die "
          f"at y {worst[1]:.2f}, mouth {pin['rimY']}")


def run_battery(meshes, spec, *, tag, tilt_deg=0.0, bare=(), x_lim, crown_max,
                clad=(), occluder=None, front_top=None):
    """The whole contract, in the order that names the cheapest failure first.

    Returns the gate names that ran — so a recipe's "every gate ran" check is
    a comparison against THIS list rather than a manifest somebody maintains
    by hand and forgets to add to."""
    ran = []
    gate_approach(meshes, spec, tag); ran.append("approach")
    gate_throat(meshes, spec, tag); ran.append("throat")
    gate_occlusion(meshes, spec, tag, tilt_deg); ran.append("occlusion")
    gate_hole_below_sill(meshes, spec, tag, tilt_deg); ran.append("hole")
    gate_lane(meshes, spec, tag, bare); ran.append("lane")
    if occluder is not None and front_top is not None:
        gate_front_carries_the_dark(occluder, spec, tag, front_top)
        ran.append("front")
    gate_envelopes(meshes, tag, x_lim=x_lim, crown_max=crown_max, clad=clad)
    ran.append("envelopes")
    print(f"[{tag}] battery {len(ran)}/{len(ran)}: {', '.join(ran)}")
    return ran
