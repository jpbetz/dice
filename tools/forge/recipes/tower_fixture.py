# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""tower_fixture — the portal-stress TEST ASSET. Never a picker row.

This is not a tower anyone should be offered. It exists so that the portal
half of the pipeline has something honest to bite on: a deliberately plain
model whose two portals sit OFF the classic values in every single field,
while staying inside the engine's limits. Anything that only works for the
shipped defaults fails here, which is the whole point.

    blender -b --factory-startup --python-exit-code 1 --python tower_fixture.py
    tools/forge/bake.sh tools/forge/recipes/tower_fixture.py \
        --tower --expect-colors --max-tris 2000 --bare-colliders ramp,lip

(The two bare colliders are a DECLARATION, not a waiver: a plain monolith
clads neither the ramp nor the lip, so the lane gate is told so by name
instead of being left red for a reader to interpret. Everything else in the
nine refusals passes outright — including the occlusion grid, which it did
not until the front stopped being capped at the entry rim.)

DECLARED PORTALS (app frame: y up, +z toward the player, z=0 the back-wall
socket plane; S = 1.25 = d20 radius). Classic in brackets — every value
differs, none is near a bound:

    portalIn   x      +0.25    (classic 0)        limit [-1.25, +1.25]
               rimY    9.75    (8.75)  = 7.8*S   limit [ 7.25, 10.25]
               z      -2.50    (-2.50) = -2.0*S  PINNED — see below
               clearR  2.20    (2.125) = 1.76*S  limit >= 2.125
    portalOut  x      -0.15    (0)               limit [-0.75, +0.75]
               sillY   1.25    (1.00)  = 1.0*S   limit [0.625, 1.375]
               w       5.15    (5.00)  = 4.12*S  limit >= 5.0
               clearH  4.75    (4.50)  = 3.8*S   limit >= 4.5

derived: despawnY = rimY - 1.4*S = 8.00.

(2026-08-13, envelope round: check.py --tower grew a SOCKET-ENVELOPE gate
after the first shipped bake exceeded the socket unseen, and this fixture's
first cut — half-width 3.95, lean 1.15, depth to −6.08 — was itself far
outside it. The body slimmed to the envelope; FOUR portal numbers moved
with it, and the reasons are the finding: a 5.25 door at x −0.50 leaves a
0.045 jamb beside a 3.15-half-width body (w→5.15, out.x→−0.15 — −0.25 left a −0.002 jamb), and a bore
at in.x 0.80 needs body to x 0.80+2.25+0.35 = 3.40 — the per-field limits
permit portal combos the ENVELOPE cannot build. The composite truth,
demonstrated by FIVE pinch rounds of assert_column_clear (1.574, 1.888,
1.950 — the interior FRONT wall, measured not theorized —, 2.129, 2.211):
the bore must clear the INTERIOR on every side, so the body needs
    half-width >= |in.x| + clearR + side wall
    depth      >= 2*clearR + 2*wall            (the bore's whole diameter)
    in.z       in [-(wall+clearR), -(depth-wall-clearR)]
and at the envelope's depth that window is ±0.05 around the CLASSIC z when
clearR maxes out — in.z is the one number the envelope pins, so it sits at
classic −2.50 by arithmetic, not by imitation, and the stress lives in the
other seven. clearR eased 2.25→2.20 to buy real margins over the back
shoulder's facet chords (WALL 0.35→0.24). All eight numbers remain
off-classic; tower-glb-loader's float-exact assertions updated in the same
commit as documented new claims.)

THE SHAPE, and why it is that shape. A rough monolith with a modest lean:
broad, squat, faceted, with a bore up the middle and a mouth at its foot. It
is as fat as the ENVELOPE allows because the contract makes it fat — a
5.15-wide door and a 4.5-wide bore barely live inside x ±3.15 — and squat
because the entry rim is low. It used to be squat because rimY was TAKEN as
the height cap, which is the mistake that left it leaking the cowl band; see
HEIGHT below. The silhouette leans in X only; the front face
stays a plumb plane at z = 0, because that face IS the socket plane the
model seats against, and a doorway cut through a leaning face would be a
doorway that changes width with height. The lean is capped by the envelope's
tilt arithmetic (|x| + y·sin(tilt) ≤ 3.25), which is why it is now a nod
rather than a stagger.

It is a genuinely CLOSED shell with exactly two openings, not a facade with
holes: one solid, minus a bore that runs from the interior floor out through
the roof, minus a door box through the front wall. So it is opaque around the
approach column below despawnY and opaque around the exit pocket, which is
what the occlusion proof will later need — built honestly now rather than
faked and discovered later.

Colour is deliberately minimal: dull stone, lighter as it rises, dark inside
the bore. A fixture that looked good would tempt somebody to ship it.
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402
import towerkit as K  # noqa: E402

S = 1.25                       # d20 radius: the unit the contract is quoted in

PORTAL_IN = {"x": 0.25, "rimY": 7.8 * S, "z": -2.0 * S, "clearR": 1.76 * S}
PORTAL_OUT = {"x": -0.15, "sillY": 1.0 * S, "w": 4.12 * S, "clearH": 3.8 * S}
SPEC = {"in": PORTAL_IN, "out": PORTAL_OUT}
DESPAWN_Y = PORTAL_IN["rimY"] - 1.4 * S

# THE RIM IS NOT A HEIGHT CAP, and believing it was is what left this fixture
# leaking the cowl band at 11/99 from the highest eye (ROADMAP T8). HEIGHT used
# to be `PORTAL_IN["rimY"]` with the comment "the rim IS the top edge, so they
# are one number" — but the cowl band's TOP is despawnY + a die's radius, and
# the ray from a high eye to that sample crosses the model's front plane ABOVE
# the rim. A model whose front stops at its own rim therefore CANNOT hide the
# vanish, no matter how honestly closed the rest of the shell is.
#
# So the front is built to the requirement instead of to the rim, and the
# requirement is asked for rather than typed: front_height_needed() returns the
# binding eye's crossing (10.120 at wide.full for this spec) and 0.15 of margin
# sits on top, putting the crown at 10.27 against a rim of 9.75. If the shipped
# eyes move or the cowl cap is re-derived, this follows them.
#
# Building to it the first time still left 1/99 leaking, and that was the SECOND
# finding: front_height_needed measured the sample on the BORE AXIS, while the
# binding sample is the deepest point of the widest disc — further back means a
# flatter ray and a taller wall (9.854 vs 10.120 here). Both copies of that
# arithmetic now live in towergates.front_height_rows, so the plan, the recipe
# and the gate cannot disagree again.
FRONT_NEED, FRONT_EYE = K.front_height_needed(SPEC)
HEIGHT = max(PORTAL_IN["rimY"], FRONT_NEED + 0.15)
WALL = 0.24                    # front/back wall thickness; also, directly, the
#                                approach clearance at the tightest point —
#                                see assert_column_clear. 0.35 until the
#                                envelope slim: the bore's diameter + two
#                                walls must fit the interior depth, so the
#                                wall thinned to open the in.z window.
BORE_FLOOR = 1.25              # interior floor
BUDGET = 2000

FRONT_N = 6                    # points across the flat front, corners included
SIDE_N = 2                     # points down each straight side, tangent last
ARC_N = 14                     # points around the rounded back
RING_N = FRONT_N + 2 * SIDE_N + ARC_N

SHELL_YS = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 7.8, 8.5, 9.2, HEIGHT]
BORE_YS = [BORE_FLOOR, 4.0, 6.2, 7.0, 7.6, 9.0, HEIGHT + 0.60]

# Colours are LINEAR (COLOR_0 is linear by the glTF spec and Blender hands the
# float straight through — see fae_arch, whose first bake came out near-white).
STONE_LOW = (0.135, 0.130, 0.120)     # -> sRGB ~ 0.41, the damp foot
STONE_HIGH = (0.255, 0.246, 0.228)    # -> sRGB ~ 0.54, the weathered crown
STONE_DARK = (0.038, 0.036, 0.033)    # -> sRGB ~ 0.22, inside the bore


def lerp3(a, b, t):
    return tuple(p + (q - p) * t for p, q in zip(a, b))


def smoothstep(x, lo, hi):
    t = min(1.0, max(0.0, (x - lo) / (hi - lo)))
    return t * t * (3.0 - 2.0 * t)


def hash01(a, b):
    """Deterministic [0,1) from two ints. An integer hash rather than
    `random`, so the value depends on WHICH vertex it is and not on how many
    were drawn before it — reordering the build cannot silently reshape the
    model."""
    h = (a * 73856093) ^ (b * 19349663)
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65536.0


# --- the cross-section ------------------------------------------------------
# Every ring is a STADIUM: a flat front chord on the socket plane, two
# straight sides running back, and a semicircular back. Roughness rides the
# back and sides only — the front is the face that seats against the wall and
# carries the door, and a jittered doorway jamb is a doorway whose width is a
# rumour.
#
# It was a half-ellipse first, and the in-recipe measurement refused it: an
# ellipse deeper than it is wide pulls IN across its rear shoulder, and the
# entry disc sits exactly there — 2.154 of clearance against a declared
# clearR of 2.25. Straight sides and a circular back put the tightest point
# back on the flat front, where it is a number you can read off the wall
# thickness instead of one you have to solve for.

def ring_params(y):
    t = min(1.0, max(0.0, y / HEIGHT))
    # Envelope arithmetic (the 2026-08-13 slim): worst case is the crown —
    # cx 0.18 + half_w 2.90 + facet swell ~0.07 = 3.15, and 3.15 + 9.75·sin
    # (0.45°) = 3.23 ≤ 3.25. Depth 5.15 + swell stays inside the socket's
    # rear plane at −5.25 (this fixture is not venueOnly and must not need
    # the venue-grounds note to pass).
    # The rough swell reaches +0.18 past these numbers (hash01 spans
    # -0.08..+0.18) and the envelope measures the SWOLLEN hull — the fourth
    # pinch round was exactly that margin. 3.00 + 0.18 swell + crown lean
    # 0.18 = 3.36... no: lean and swell do not stack at the same vertex
    # (the lean is cx, shared by the whole ring) — worst hull x =
    # cx + half_w + swell = 0.18 + 2.80 + 0.18 = 3.16 at the crown, and
    # 3.16 + 9.75*sin(0.45°) = 3.24 <= 3.25.
    half_w = 3.00 - 0.20 * t
    # Depth carries NO taper since the envelope slim: the top ring's back
    # shoulder was the third pinch (2.129 at y 10.35) — the bore needs its
    # full diameter all the way up, and the socket's rear plane at -5.25
    # (minus the 0.18 rough swell) caps the constant at 5.06.
    depth = 5.06
    # The lean, all of it in X, and steep rather than linear on purpose: the
    # door needs stone on both sides of it up to y = 6, so the section that
    # carries the door has to stand nearly plumb. t**2.5 keeps the lean out
    # of the doorway's way and spends all of it on the top third, where it is
    # the only thing you can see. Capped by the envelope's tilt term.
    cx = 0.18 * t ** 2.5
    return cx, half_w, depth


def x_inset(y):
    """Side-wall thickness: thick low down, thin at the crown.

    Not decoration. Thick below the lintel keeps the door box's side faces
    clear of the bore wall — let them cross and the union puts a tangency
    exactly where two surfaces graze, which is trap #7 and a sliver factory.
    Thin at the crown because the approach column has to fit through, and at
    1.25 of side wall it does not. (0.32 at the crown since the envelope
    slim: the back shoulder's radius is half_w minus this, and 0.40 left it
    0.01 short of clearR at the top ring.)"""
    return 1.25 - 0.93 * smoothstep(y, 6.2, 7.6)


def ring_points(y, hollow=False, rough=True):
    """The ring polygon in APP-FRAME (x, z), wound front-left -> front-right
    -> down the right side -> around the back -> up the left side."""
    cx, half_w, depth = ring_params(y)
    front_z = 0.0
    if hollow:
        half_w -= x_inset(y)
        # depth loses TWO walls, one at each end. Losing one and moving the
        # front by WALL leaves the bore's back surface exactly on the shell's
        # back surface: the first bake did that, every back edge had four
        # faces on it, and where the roughness swelled inward the bore came
        # out through the back of the tower.
        depth -= 2.0 * WALL
        front_z = -WALL
    straight = depth - half_w             # length of the parallel-sided run
    z_arc = front_z - straight            # centre of the semicircular back
    ri = int(round(y * 100))

    def swell(j):
        return 0.0 if not rough else -0.08 + 0.26 * hash01(ri, j)

    pts = [(cx - half_w + 2.0 * half_w * i / (FRONT_N - 1), front_z)
           for i in range(FRONT_N)]
    for i in range(1, SIDE_N + 1):        # right side, last point is tangent
        pts.append((cx + half_w + swell(i), front_z - straight * i / SIDE_N))
    for j in range(1, ARC_N + 1):
        a = math.pi * j / (ARC_N + 1)
        r = half_w + swell(10 + j)
        pts.append((cx + r * math.cos(a), z_arc - r * math.sin(a)))
    for i in range(SIDE_N, 0, -1):        # left side, back up to the front
        pts.append((cx - half_w - swell(30 + i), front_z - straight * i / SIDE_N))
    return pts


def lofted(name, ys, hollow=False, rough=True):
    """Stack the rings into a closed solid, capped top and bottom."""
    verts, faces, starts = [], [], []
    for y in ys:
        starts.append(len(verts))
        for x, z in ring_points(y, hollow=hollow, rough=rough):
            verts.append(tuple(F.spec_to_blender(x, y, z)))
    for a, b in zip(starts, starts[1:]):
        for j in range(RING_N):
            k = (j + 1) % RING_N
            faces.append((a + j, a + k, b + k, b + j))
    faces.append(tuple(range(RING_N)))                       # bottom cap
    top = starts[-1]
    faces.append(tuple(range(top + RING_N - 1, top - 1, -1)))  # top cap
    ob = F.obj_from_pydata(name, verts, faces)
    F.recalc_normals(ob)          # winding is the loft's business, not mine
    return ob


def box(name, x0, x1, y0, y1, z0, z1):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4),
         (2, 3, 7, 6), (1, 2, 6, 5), (0, 3, 7, 4)]
    ob = F.obj_from_pydata(name, [tuple(F.spec_to_blender(*p)) for p in v], f)
    F.recalc_normals(ob)
    return ob


# --- measurement ------------------------------------------------------------

def assert_column_clear():
    """The approach disc must fit inside the bore, measured from the polygon
    the loft actually builds — not from the ideal ellipse it was sampled off.

    check.py --tower proves this again with rays, and the gate is the
    authority. This exists so that a bad parameter fails HERE, naming the
    ring, instead of thirty seconds later as a ray count.
    """
    cx0, cz0, r = PORTAL_IN["x"], PORTAL_IN["z"], PORTAL_IN["clearR"]
    worst = (1e9, None)
    for y in [y for y in BORE_YS if y >= DESPAWN_Y] + [DESPAWN_Y]:
        pts = ring_points(y, hollow=True, rough=False)   # as the bore is built
        for p, q in zip(pts, pts[1:] + pts[:1]):
            dx, dz = q[0] - p[0], q[1] - p[1]
            L2 = dx * dx + dz * dz
            t = 0.0 if L2 == 0 else max(0.0, min(1.0, (
                (cx0 - p[0]) * dx + (cz0 - p[1]) * dz) / L2))
            d = math.hypot(cx0 - (p[0] + t * dx), cz0 - (p[1] + t * dz))
            if d < worst[0]:
                worst = (d, y)
    if worst[0] < r:
        raise RuntimeError(
            f"approach column pinched: bore ring at y={worst[1]:.2f} comes "
            f"within {worst[0]:.3f} of the entry axis, needs clearR {r:.3f}")
    print(f"[fixture] approach clearance {worst[0]:.3f} vs clearR {r:.3f} "
          f"(tightest ring y={worst[1]:.2f})")


def assert_door_framed():
    """The door must be a HOLE, with stone on both sides of it at every
    height it spans. A door wider than the wall is a missing corner."""
    x0 = PORTAL_OUT["x"] - PORTAL_OUT["w"] / 2
    x1 = PORTAL_OUT["x"] + PORTAL_OUT["w"] / 2
    top = PORTAL_OUT["sillY"] + PORTAL_OUT["clearH"]
    worst = 1e9
    for i in range(13):
        y = PORTAL_OUT["sillY"] + (top - PORTAL_OUT["sillY"]) * i / 12
        cx, half_w, _ = ring_params(y)
        worst = min(worst, x0 - (cx - half_w), (cx + half_w) - x1)
    if worst <= 0:
        raise RuntimeError(
            f"door is wider than the wall it is cut in: jamb {worst:.3f}")
    print(f"[fixture] narrowest door jamb {worst:.3f}")


# --- colour -----------------------------------------------------------------

def inside_bore(x, y, z):
    """Is this corner on an interior surface? Position only.

    Keyed off the corner's own position and nothing else, because a face
    normal is constant across a face and neighbours then disagree at shared
    corners — that is what made B4's first sawn top a sawtooth."""
    cx, half_w, depth = ring_params(y)
    if z > -WALL + 1e-4:
        return False                                  # the outer front plane
    half_w -= x_inset(y)
    z_arc = -WALL - ((depth - 2.0 * WALL) - half_w)
    if z >= z_arc:
        return abs(x - cx) <= half_w + 1e-4           # the straight-sided run
    return math.hypot(x - cx, z - z_arc) <= half_w + 1e-4


def mottle(x, y, z):
    return 0.5 + 0.5 * (math.sin(1.7 * x + 2.3) * math.sin(1.1 * y + 0.7)
                        * math.sin(1.9 * z + 1.3))


def paint(_poly, co):
    x, y, z = co.x, co.z, -co.y         # Blender -> app frame (spec_to_blender
    if inside_bore(x, y, z):            # inverted: app (x,y,z) = (bx, bz, -by))
        return STONE_DARK
    base = lerp3(STONE_LOW, STONE_HIGH, smoothstep(y, 0.5, 9.0))
    k = 0.86 + 0.28 * mottle(x, y, z)
    return tuple(min(1.0, c * k) for c in base)


def main():
    F.reset()
    assert_column_clear()
    assert_door_framed()

    shell = lofted("towerSkinMonolith", SHELL_YS)
    bore = lofted("bore", BORE_YS, hollow=True, rough=False)
    # The door box starts 0.30 BELOW the declared sill on purpose: level with
    # it, its floor and the bore's would be one shared plane, and a coplanar
    # pair is where an exact union grows slivers (trap #7). Dropping it also
    # only ever makes the opening larger than declared, which is the safe
    # direction to be wrong in.
    door = box("door",
               PORTAL_OUT["x"] - PORTAL_OUT["w"] / 2,
               PORTAL_OUT["x"] + PORTAL_OUT["w"] / 2,
               PORTAL_OUT["sillY"] - 0.30,
               PORTAL_OUT["sillY"] + PORTAL_OUT["clearH"],
               -2.60, 0.50)   # -2.60 sits well inside the bore's straight
    #                           run; at -3.00 it grazed the tangent line where
    #                           the sides meet the round back, to within 0.035
    cavity = F.boolean(bore, door, op="UNION")
    F.boolean(shell, cavity, op="DIFFERENCE")

    # finish()'s tail, written out: paint_corners has to land after the last
    # bmesh round-trip, and canonicalize is not optional after a boolean.
    F.canonicalize(shell)
    F.triangulate(shell)
    F.paint_corners(shell, "Col", paint)
    F.single_material(shell, F.vertex_color_material("stone", "Col"))

    nm, vol = F.manifold_report(shell)
    if nm:
        raise RuntimeError(f"tower_fixture: {nm} non-manifold edges")
    print(f"[fixture] manifold ok: 0 non-manifold edges, volume {vol:.2f}")

    pin, pout = F.tower_portals(PORTAL_IN, PORTAL_OUT)

    F.assert_budget([shell], BUDGET)
    F.report_bounds([shell], "tower_fixture")
    # NO sit_on_ground: this model's frame IS the contract. y=0 is the felt and
    # z=0 is the socket plane, and grounding would move the portals off them.
    F.export_glb("tower_fixture", [shell, pin, pout], vertex_colors=True)


main()
