# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""hollowbole — the fae venue's dice tower, re-authored as a baked GLB.

THE BRIEF. A broken hollow STUMP, not a tower: stocky (~2:1 over the full
socket width), the whole front torn open into one ragged dark wound, a
splintered crown of uneven spires with the tallest off-centre, heavy flared
buttress roots gripping the felt, and pale barkless weathered wood with
vertical fiber striation — bark only in low patches, then moss in the
valleys, lichen on the crests, punky rot at the wound fringe and foxfire
shelves on the skeleton. DEAD IN SHAPE, ALIVE IN COVERING. It replaces the
inline three.js shell (js/towerbole.js), whose mouth rendered as a literal
black rectangle with stair-stepped quad notches on its lintel.

ONE RUN BAKES BOTH PALETTES: hollowbole_moonrise and hollowbole_foxfire.
Same seeds, same field, same geometry — only COLOR_0 differs, so the two
GLBs share a `set` digest and differ only in `order`. That equality is
itself a check, and it is printed.

THE SHAPE, AND WHY IT IS THAT SHAPE
-----------------------------------
It is ONE closed solid with wall thickness — not a facade with holes, and
not a shell plus a separate liner. A cup: outer wall up, over the torn rim,
down the inner wall, across the debris floor. That single decision buys the
occlusion contract outright: the interior surface IS the dark liner, it is
closed by construction, and there is no "far side" for a sightline through
the wound or the crown to reach. Anything you can see through either
opening is the inside of this same solid, painted near-black.

The wound is one boolean: a radial window cutter whose (phi, y) boundary is
a ragged closed loop, so the mouth's edge is torn everywhere and the wood
between the rag's local minima juts into the opening as real splinter
teeth. Its side faces are RADIAL, meeting the cylindrical wall at right
angles — no tangency, which is the sliver trap the README numbers 7.

The roots are not pasted on: they are angular lobes in the same radius
field that carries the fiber ridges, so a buttress at the soil and the
furrow above it are one continuous grain line. The ember door is a second,
tiny radial window cut into the flank of one such buttress beside the
wound — never on the front face.

THE CONTRACT (app frame: y up, +z toward the player, z=0 the socket plane;
S = 1.25 = d20 radius). Limits from check.py TOWER_PORTAL_LIMITS:

    portalIn   x       0.00     limit [-1.25, +1.25]
               rimY    9.40     limit [ 7.25, 10.25]   the LOW point of the
                                                       crown tear; spires
                                                       rise 1.5-3.1 above it
               z      -2.55     limit [-3.25, -1.25]   = the trunk axis
               clearR  2.20     limit >= 2.125
    portalOut  x       0.00     limit [-0.75, +0.75]
               sillY   1.00     limit [0.625, 1.375]
               w       5.00     limit >= 5.0
               clearH  4.50     limit >= 4.5
    derived    despawnY = rimY - 1.4*S = 7.65

sillY is 1.00 and not the "organic 1.1-1.25" the brief invited, and that is
a MEASURED refusal, not timidity. The delivery tongue's top surface has to
be the engine apron's top surface; the apron's slope is atan(0.8/1.5) about
a FIXED box, so any sill above 1.00 tilts the tongue off the collider and
dice sink into it by up to 0.3 at the outrun. At sillY = 1.00 the tongue's
plane is the collider's plane exactly (y = 0.9937 - 0.5333 z, measured off
towerVolumes()' apron box, not copied from its comment). The threshold
still reads as raised: the tongue falls away in front of it and the wound's
lower lip is ragged wood at 0.90-1.02 on both sides of it.

THE THROAT, and the one place this model refuses the brief
----------------------------------------------------------
check.py --tower fires 25 rays out through the door: the box

    |x| <= 2.375,  1.1125 <= y <= 5.3875,  -1.5 <= z <= +1.0

must contain NO geometry. The engine's own apron collider does — its top
surface stands at y 1.79 at z -1.5, climbing backward through the tower.
So a model CANNOT clad the chute inside the throat and pass the gate: the
two requirements are in direct conflict, and the gate wins because it is
the contract. The tongue therefore starts at z = -0.06 (top y 1.046, a
0.067 margin under the bar) and runs forward over the apron and the lip.
Inside the mouth the chute is unclad and dark, which is what "the wound
interior is hollow there" asks for anyway. Recorded as kit friction.

MEASURED, NOT ASSUMED. Every dimensional claim above is re-derived from the
built vertices at bake time: assert_throat_clear and assert_approach_clear
cast rays at the finished triangles (not at the constants that generated
them), assert_envelope reads the real bounds, and assert_rim_is_low proves
the declared rimY is the actual low point of the crown. A gate that reads
constants only restates its own assumptions.

    tools/forge/bake.sh tools/forge/recipes/hollowbole.py \
        --tower --expect-colors --max-tris 8000
    # then gate the second variant by hand:
    ~/opt/dice-forge/venv/bin/python tools/forge/check.py \
        tools/forge/out/hollowbole_foxfire.glb --tower --expect-colors --max-tris 8000
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402

# --------------------------------------------------------------------------
# the contract
# --------------------------------------------------------------------------
S = 1.25
AXIS_Z = -2.55                     # the trunk axis, app frame

PORTAL_IN = {"x": 0.0, "rimY": 9.40, "z": AXIS_Z, "clearR": 2.20}
PORTAL_OUT = {"x": 0.0, "sillY": 1.00, "w": 5.00, "clearH": 4.50, "z": 0.0}
DESPAWN_Y = PORTAL_IN["rimY"] - 1.4 * S              # 7.65

# The throat box the exit gate probes, restated here so the in-recipe gate
# and check.py cannot drift: THROAT_MARGIN 0.95 of a 5.00 x 4.50 door.
THROAT_HALF_W = 0.95 * PORTAL_OUT["w"] / 2.0         # 2.375
THROAT_Y0 = PORTAL_OUT["sillY"] + PORTAL_OUT["clearH"] * 0.025    # 1.1125
THROAT_Y1 = THROAT_Y0 + PORTAL_OUT["clearH"] * 0.95              # 5.3875
THROAT_Z0, THROAT_Z1 = -1.5, 1.0

# The engine volumes this model has to skin (js/main.js towerVolumes()).
# Re-derived here rather than trusted: the apron box's TOP FACE, rotated,
# passes (z 0, y 0.9937) and reaches the felt at z 1.863.
APRON_C = (0.0, 0.913 * S, -1.284 * S)
APRON_S = (3.8 * S, 1.0 * S, 5.85 * S)
APRON_RX = math.atan(0.8 / 1.5)
LIP_C = (0.0, -0.42, 2.8)
LIP_S = (4.8, 1.0, 2.2)
LIP_RX = 0.1

XLIM = 3.23                        # the mat wall is physics-real at 3.35
ZFRONT = 0.22                      # the socket's front plane
ZBACK = -6.30                      # venue grounds: the glade, not a wall
BUDGET = 8000

SEED = 0x50B3


# --------------------------------------------------------------------------
# deterministic noise (integer hash, never `random`: the value must depend on
# WHICH sample it is, not on how many were drawn before it)
# --------------------------------------------------------------------------

def h01(a, b):
    h = (int(a) * 73856093) ^ (int(b) * 19349663)
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65536.0


def smoothstep(x, lo, hi):
    t = min(1.0, max(0.0, (x - lo) / (hi - lo)))
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp3(a, b, t):
    return tuple(p + (q - p) * t for p, q in zip(a, b))


def n1(t, seed):
    """Value noise along a line."""
    i = math.floor(t)
    f = t - i
    f = f * f * (3.0 - 2.0 * f)
    return lerp(h01(i, seed), h01(i + 1, seed), f)


def n1p(a, k, seed):
    """Value noise PERIODIC in a over 2*pi, k lattice points.

    Periodic by construction rather than by luck: the trunk's seam is at
    phi = +-pi and a non-periodic angular noise puts a visible zip up the
    back of the tree.
    """
    k = int(k)
    t = (a % (2.0 * math.pi)) / (2.0 * math.pi) * k
    i = int(math.floor(t))
    f = t - i
    f = f * f * (3.0 - 2.0 * f)
    return lerp(h01(i % k, seed), h01((i + 1) % k, seed), f)


def n2(u, v, seed):
    iu, iv = math.floor(u), math.floor(v)
    fu, fv = u - iu, v - iv
    fu = fu * fu * (3.0 - 2.0 * fu)
    fv = fv * fv * (3.0 - 2.0 * fv)
    a = lerp(h01(iu * 7919 + iv, seed), h01((iu + 1) * 7919 + iv, seed), fu)
    b = lerp(h01(iu * 7919 + iv + 1, seed), h01((iu + 1) * 7919 + iv + 1, seed), fu)
    return lerp(a, b, fv)


def ring2(phi, y, k, seed):
    """2-D noise sampled on the CIRCLE, so it is seamless in phi."""
    return n2(math.cos(phi) * k + 31.7, math.sin(phi) * k + y * 0.37, seed)


def fbm_ring(phi, y, k, seed, oct=3):
    s, amp, tot = 0.0, 1.0, 0.0
    for o in range(oct):
        s += amp * ring2(phi, y, k * (1.9 ** o), seed + o * 17)
        tot += amp
        amp *= 0.5
    return s / tot


def angdist(a, b):
    d = abs(a - b) % (2.0 * math.pi)
    return 2.0 * math.pi - d if d > math.pi else d


# --------------------------------------------------------------------------
# THE FIBER BUNDLE — one vocabulary from soil to spire
# --------------------------------------------------------------------------
# Continuous vertical ridges, each with a single identity along its whole
# length: buttress root at the foot -> furrow through the waist -> tear
# spire at the crown, the same crest line all the way up, drifting slightly
# in phi with height (the twist of grain). The crown tears ALONG the ridges
# (a spire is a fiber that kept going) and moss will pool in the valleys
# BETWEEN them, so nothing is pasted onto anything.

N_RIDGE = 11
FRONT_KEEP = 0.62                  # no root lobes inside |phi| < this: the
#                                    tongue lane must stay a clean slide


def build_ridges():
    ridges = []
    acc = 0.42
    for i in range(N_RIDGE):
        acc += (2.0 * math.pi / N_RIDGE) * (0.66 + 0.68 * h01(i, 11))
        th = ((acc + math.pi) % (2.0 * math.pi)) - math.pi
        # front fade: a buttress on the front face would be a buttress in
        # the doorway, and the wound would saw it in half
        ff = smoothstep(abs(th), FRONT_KEEP, 0.98)
        ridges.append({
            "th": th,
            "w": 0.125 + 0.095 * h01(i, 21),      # crest half-width, rad
            "butt": (0.10 + 0.12 * h01(i, 31)) * ff,
            "fib": 0.045 + 0.075 * h01(i, 61),    # mid-height relief
            "lean": (h01(i, 71) - 0.5) * 0.22,    # grain twist with height
            "spire": 0.0,
        })
    # SIX ridges become heavy buttress roots, CHOSEN rather than hoped for:
    # a threshold on a hash gave three on the first bake and the count is a
    # form requirement, not a distribution.
    cand = sorted((i for i in range(N_RIDGE) if abs(ridges[i]["th"]) > 0.86),
                  key=lambda i: -h01(i, 31))[:6]
    for rank, i in enumerate(cand):
        ridges[i]["butt"] = (0.52 - 0.05 * rank) * smoothstep(
            abs(ridges[i]["th"]), FRONT_KEEP, 0.98)
        ridges[i]["w"] = max(ridges[i]["w"], 0.15)
    # THE CROWN TEARS ALONG THE GRAIN. Five ridges keep going past the rim;
    # the tallest is forced onto the ridge nearest phi = -1.05 rad so it is
    # plainly off-centre in the frame (and never on the seam).
    order = sorted((i for i in range(N_RIDGE) if abs(ridges[i]["th"]) > 0.80),
                   key=lambda i: -h01(i, 41))[:5]
    for rank, i in enumerate(order):
        ridges[i]["spire"] = 1.50 + 0.95 * h01(i, 51)
    tall = min(range(N_RIDGE), key=lambda i: angdist(ridges[i]["th"], -1.05))
    ridges[tall]["spire"] = 3.10
    ridges[tall]["w"] = max(ridges[tall]["w"], 0.17)
    return ridges


RIDGES = build_ridges()


def crest_at(R, y):
    return R["th"] + R["lean"] * (y / 9.0)


def crest(d, w):
    return math.exp(-0.5 * (d / w) ** 2) ** 0.72      # furrows, not ripples


def flare(y):
    return max(0.0, 1.0 - y / 2.10) ** 1.5


def toe(y):
    return max(0.0, 1.0 - y / 0.72) ** 1.25           # the root's own foot


# --------------------------------------------------------------------------
# THE FIELD
# --------------------------------------------------------------------------
# base(y): stocky. Heavy foot, a slight waist at ~3.2, a broad crown, and a
# narrowing only in the last two units where the spires taper. Height 12.5
# over a 6.4 root spread is 1.95:1 — the molar, not the chimney.

def base(y):
    return (2.58
            + 0.20 * math.exp(-y / 1.60)
            + 0.28 * smoothstep(y, 4.0, 9.0)
            - 0.17 * smoothstep(y, 10.0, 12.6))


def wall(y):
    """Wall thickness. Thick at the foot, a blade at the spire tips."""
    return (0.62
            - 0.16 * smoothstep(y, 0.9, 6.0)
            - 0.05 * smoothstep(y, 6.0, 9.4)
            - 0.29 * smoothstep(y, 9.4, 12.4))


def y_top(phi):
    """Per-column crown height: the LOW rim on the front, spires elsewhere.

    Clamped at or above rimY so the declared portal number is the honest
    low point of the tear and not an average with a hole under it.
    """
    # MAX, not sum: two spire ridges close in phi summed to a 14.0 monolith
    # on the first bake. Each blade is its own fiber and keeps its own
    # height, so the tallest number in the recipe is the tallest in the mesh.
    t = 0.0
    for R in RIDGES:
        if R["spire"] <= 0:
            continue
        k = crest(angdist(phi, crest_at(R, 10.5)), R["w"] * 1.45)
        t = max(t, R["spire"] * k)
    # the rim between spires still tears: sag in the valleys, ragged on top
    t += 0.42 * fbm_ring(phi, 0.0, 2.6, SEED + 5, 3) - 0.12
    # The front IS the low point — the crown tear reaches down toward the
    # wound there, and rimY is quoted off it. The front band is driven to
    # zero and then given its own small ragged lift with the -0.05 bias, so
    # the tear still varies across the brow but genuinely TOUCHES 9.40
    # instead of hovering above it. assert_rim_is_low measures this.
    # The ramp ends at 0.80 rad, not 1.30: a wider one docked the tallest
    # spire (at -58 deg) to 80% of its declared height, so the number in the
    # recipe stopped being the number in the mesh.
    back = smoothstep(abs(phi), 0.30, 0.80)
    t *= back
    t += (1.0 - back) * (0.34 * abs(2.0 * fbm_ring(phi, 0.0, 6.0, SEED + 6, 2)
                                    - 1.0) - 0.05)
    return PORTAL_IN["rimY"] + max(0.0, t)


def r_out(phi, y):
    r = base(y)
    fl, to = flare(y), toe(y)
    for R in RIDGES:
        d = angdist(phi, crest_at(R, y))
        amp = R["butt"] * fl + R["fib"] * (0.35 + 0.65 * (1.0 - fl))
        r += amp * crest(d, R["w"])
        if R["butt"] > 0.26:                       # only the heavy ones grip
            r += R["butt"] * 0.72 * to * crest(d, R["w"] * 2.10)
    # fine flutes: the striation the eye reads as grain, above the ridges
    r += 0.055 * fbm_ring(phi, y * 0.30, 9.0, SEED + 2, 3) - 0.022
    return r


def r_in(phi, y):
    """Inner (liner) radius. Its own rib pattern, never the outer ridges —
    letting the outer furrows subtract from the wall is how a wall gets
    thin where it is already carrying a spire."""
    r = base(y) - wall(y)
    r += 0.085 * fbm_ring(phi + 1.7, y * 0.45, 6.0, SEED + 21, 2) - 0.034
    return r


def clamp_point(r, phi, front, back):
    """Polar -> app frame, with the socket clamps applied to the POINT.

    A z-CLAMP, not a z-scale: the trunk stays round wherever it fits and
    flattens only the arc that would actually leave the socket, which is
    what a trunk grown against a wall does. The x cap is by COMPONENT — a
    sign-based cap leaks crests past the mat wall on the back quarter-arcs.
    """
    sp, cp = math.sin(phi), math.cos(phi)
    if abs(sp) > 0.06:
        r = min(r, XLIM / abs(sp))
    z = AXIS_Z + max(back, min(front, r * cp))
    return (r * sp, z)


def out_point(phi, y):
    x, z = clamp_point(r_out(phi, y), phi, ZFRONT - AXIS_Z, ZBACK - AXIS_Z)
    return (x, y, z)


def in_point(phi, y):
    x, z = clamp_point(r_in(phi, y), phi,
                       ZFRONT - AXIS_Z - 0.16, ZBACK - AXIS_Z + 0.10)
    return (x, y, z)


FLOOR_Y = 0.68


def floor_y(phi):
    """The debris slope inside the hollow. Flat where the throat needs it
    flat (z >= -3.0 is inside the exit gate's reach), a mound at the back."""
    z = AXIS_Z + r_in(phi, 1.2) * math.cos(phi)
    return FLOOR_Y + 1.05 * smoothstep(z, -3.0, -5.0)


# --------------------------------------------------------------------------
# THE WOUND — one ragged closed loop in (phi, y)
# --------------------------------------------------------------------------
# A superellipse whose exponent RISES toward the bottom, so the mouth has a
# rounded torn top and sides over a broad flat threshold — which is what a
# doorway sill in a stump is. The rag only ever EXPANDS (never contracts):
# that is the towerbole lesson restated, and it is what lets the boundary be
# violently ragged while the contractual doorway inside it stays guaranteed.
# The wood between the rag's local minima is what juts into the opening as a
# splinter tooth — real geometry, not paint.

W_PHI0 = 1.40          # half-width in phi at the widest (80.2 deg)
W_YC = 4.30            # the wound's centre height
W_YUP = 2.55           # -> torn arch tops out at 6.85, teeth-max 7.49, and
#                        that ceiling is load-bearing: despawnY is 7.65 and
#                        a wound that reached past it would show a die
#                        vanishing in mid-air to a low camera.
W_YDN = 3.40           # -> threshold sits at 0.90


def w_exp(a):
    """Superellipse exponent by direction: round at the top and sides,
    nearly square along the bottom, where the threshold lives."""
    return 3.5 + 9.0 * max(0.0, -math.sin(a)) ** 2


def w_rag(a):
    """>= 1.0 ALWAYS — the rag eats OUTWARD only, so the contractual doorway
    inside the wound can never be narrowed by a fiber, and the wood between
    the rag's local minima is what juts back in as a splinter tooth.

    The amplitude is throttled along the BOTTOM: a uniform rag swung the
    threshold through 0.85 of world, which is a sill you could trip over in
    one place and step over in another. Teeth belong on the arch and the
    jambs; a threshold is worn, not shredded.
    """
    amp = 0.16 + 0.84 * smoothstep(math.sin(a), -0.95, -0.35)
    wander = 0.075 * n1p(a, 5, SEED + 81)
    lobe = (0.5 + 0.5 * math.cos(16.0 * a + 5.0 * n1p(a, 3, SEED + 83))) ** 2.4
    tooth = 0.175 * lobe * (0.30 + 0.70 * n1p(a, 8, SEED + 85))
    return 1.0 + (wander + tooth) * amp


def w_boundary(a):
    """(phi, y) on the wound's edge in direction a."""
    n = w_exp(a)
    ca, sa = math.cos(a), math.sin(a)
    denom = (abs(ca) ** n + abs(sa) ** n) ** (1.0 / n)
    rho = w_rag(a) / denom
    u, v = rho * ca, rho * sa
    phi = W_PHI0 * u
    y = W_YC + (W_YUP if v >= 0 else W_YDN) * v
    return phi, y


def w_point(a, t):
    """Interior parameterisation of the wound disc, t in (0, 1]."""
    n = w_exp(a)
    ca, sa = math.cos(a), math.sin(a)
    denom = (abs(ca) ** n + abs(sa) ** n) ** (1.0 / n)
    rho = t * w_rag(a) / denom
    u, v = rho * ca, rho * sa
    return W_PHI0 * u, W_YC + (W_YUP if v >= 0 else W_YDN) * v


def in_wound(phi, y):
    """Is (phi, y) inside the wound window? Used by the paint pass and by
    the analytic wood predicate."""
    u = phi / W_PHI0
    v = (y - W_YC) / (W_YUP if y >= W_YC else W_YDN)
    if u == 0.0 and v == 0.0:
        return 0.0
    a = math.atan2(v, u)
    n = w_exp(a)
    return ((abs(u) ** n + abs(v) ** n) ** (1.0 / n)) / w_rag(a)


# --------------------------------------------------------------------------
# THE EMBER DOOR — a recess in the flank of a buttress BESIDE the wound
# --------------------------------------------------------------------------
DOOR_W = 0.24
DOOR_H = 0.40
DOOR_DEPTH = 0.19


def door_clearance(phi, y):
    """Smallest wound-q over the recess's own boundary, inflated 15%."""
    hw = DOOR_W / 2.0 / 2.95
    return min(in_wound(phi + hw * 1.15 * math.cos(2 * math.pi * k / 64),
                        y + (DOOR_H / 2.0) * 1.15 * math.sin(2 * math.pi * k / 64))
               for k in range(64))


def pick_door():
    """The ember door lives in the FLANK of the strongest buttress beside
    the wound — only the shell knows where its grain runs, so the shell
    picks the spot instead of a constant guessing at it.

    Two hand-picked placements failed before this existed: 79 deg sat on the
    wound's cut edge (six non-manifold edges), and 93 deg was still inside
    its rag (q 1.107). The root mass BELOW the threshold is only ~0.74 tall,
    which is less than this door, so "under the sill" is not available
    either — it has to be a flank, and the flank has to be measured.
    """
    best = None
    for R in RIDGES:
        if not (1.10 < abs(R["th"]) < 2.10):
            continue
        side = math.copysign(1.0, R["th"])
        for k in range(11):
            y = 0.70 + 0.13 * k
            for off in (-0.16, -0.08, 0.0, 0.08):
                phi = crest_at(R, y) + off * side
                q = door_clearance(phi, y)
                if q < 1.16:
                    continue
                score = (R["butt"], q)
                if best is None or score > best[0]:
                    best = (score, phi, y, R)
    if best is None:
        raise RuntimeError(
            "no buttress flank beside the wound clears it by q 1.16 — the "
            "wound (W_PHI0 %.2f) has eaten every candidate" % W_PHI0)
    (butt, q), phi, y, R = best
    print(f"[bole] ember door on the buttress at phi "
          f"{math.degrees(R['th']):+.0f} deg (butt {butt:.2f}) -> "
          f"phi {math.degrees(phi):+.1f} deg, y {y:.2f}, wound clearance "
          f"q {q:.3f}")
    return phi, y


DOOR_PHI, DOOR_Y = 0.0, 0.0        # set by main() once RIDGES exist


# --------------------------------------------------------------------------
# mesh building
# --------------------------------------------------------------------------

def bl(p):
    return tuple(F.spec_to_blender(*p))


NPHI = 72
OUT_FIXED = [-0.30, 0.02, 0.30, 0.62, 1.05, 1.60, 2.30, 3.15, 4.10, 5.10, 6.10, 7.00]
OUT_CROWN = 5                      # rows from 7.00 up to y_top(phi)
IN_CROWN = 3                       # rows from y_top(phi) down to 7.00
# The inner wall's rows are DENSE through the wound's height band on
# purpose. At five rows the cut boundary crossed quads 1.2 tall and came
# back out through the edge it entered, which is a non-simple n-gon: legal
# as a face, four faces on an edge the moment it is triangulated. Both
# failures sat on the inner surface, at y 7.27 and y 1.18 — inside the two
# tallest gaps in the old schedule.
IN_FIXED = [6.30, 5.60, 4.90, 4.20, 3.50, 2.85, 2.30, 1.80, 1.35, 1.00]


def column(phi):
    """The (outer up, rim, inner down, floor) point list for one column."""
    top = y_top(phi)
    outer = [out_point(phi, y) for y in OUT_FIXED]
    for k in range(1, OUT_CROWN + 1):
        outer.append(out_point(phi, lerp(7.00, top, k / OUT_CROWN)))
    inner = [in_point(phi, top)]
    for k in range(1, IN_CROWN + 1):
        inner.append(in_point(phi, lerp(top, 7.00, k / IN_CROWN)))
    for y in IN_FIXED:
        inner.append(in_point(phi, y))
    fy = floor_y(phi)
    ip = in_point(phi, max(fy, 0.9))
    inner.append((ip[0], fy, ip[2]))
    return outer, inner


def build_shell(name):
    verts, faces = [], []
    cols = []
    for i in range(NPHI):
        phi = -math.pi + 2.0 * math.pi * i / NPHI
        outer, inner = column(phi)
        start = len(verts)
        for p in outer + inner:
            verts.append(bl(p))
        cols.append((start, len(outer), len(inner)))

    no, ni = cols[0][1], cols[0][2]
    stride = no + ni
    for i in range(NPHI):
        a = cols[i][0]
        b = cols[(i + 1) % NPHI][0]
        for j in range(no - 1):                       # outer wall
            faces.append((a + j, a + j + 1, b + j + 1, b + j))
        faces.append((a + no - 1, a + no, b + no, b + no - 1))     # the rim
        for j in range(ni - 1):                       # inner wall, downward
            faces.append((a + no + j, a + no + j + 1,
                          b + no + j + 1, b + no + j))
    # caps: the buried foot and the debris floor
    cb = len(verts)
    verts.append(bl((0.0, OUT_FIXED[0], AXIS_Z)))
    cf = len(verts)
    verts.append(bl((0.0, FLOOR_Y + 0.04, AXIS_Z)))
    for i in range(NPHI):
        a, b = cols[i][0], cols[(i + 1) % NPHI][0]
        faces.append((cb, a, b))
        faces.append((cf, b + stride - 1, a + stride - 1))
    ob = F.obj_from_pydata(name, verts, faces)
    F.recalc_normals(ob)            # winding is the loft's business, not mine
    return ob


def radial_window(name, boundary_fn, r_lo_fn, r_hi_fn, m=140, rings=4):
    """A closed 'plug' whose (phi, y) footprint is an arbitrary closed loop,
    extruded RADIALLY about the trunk axis.

    Its side faces are radial and so cross the cylindrical wall at right
    angles; its two caps are proper curved discs (concentric rings, not a
    flat fan) because a fan across an 80-degree window chords straight
    through the trunk it is supposed to be outside of.
    """
    verts, faces = [], []
    lo_ring, hi_ring = [], []
    for shell, r_fn, store in ((0, r_lo_fn, lo_ring), (1, r_hi_fn, hi_ring)):
        idx = []
        for ri in range(rings):
            t = (ri + 1) / rings
            row = []
            for k in range(m):
                a = 2.0 * math.pi * k / m
                phi, y = boundary_fn(a, t)
                r = r_fn(phi, y)
                row.append(len(verts))
                verts.append(bl((r * math.sin(phi), y,
                                 AXIS_Z + r * math.cos(phi))))
            idx.append(row)
        c_phi, c_y = boundary_fn(0.0, 1e-4)
        centre = len(verts)
        cr = r_fn(c_phi, c_y)
        verts.append(bl((cr * math.sin(c_phi), c_y,
                         AXIS_Z + cr * math.cos(c_phi))))
        for k in range(m):
            k2 = (k + 1) % m
            faces.append((centre, idx[0][k], idx[0][k2]))
            for ri in range(rings - 1):
                faces.append((idx[ri][k], idx[ri + 1][k],
                              idx[ri + 1][k2], idx[ri][k2]))
        store.extend(idx[rings - 1])
    for k in range(m):
        k2 = (k + 1) % m
        faces.append((lo_ring[k], lo_ring[k2], hi_ring[k2], hi_ring[k]))
    ob = F.obj_from_pydata(name, verts, faces)
    F.recalc_normals(ob)
    return ob


def wound_cutter():
    def boundary(a, t):
        return w_point(a, t)

    def lo(phi, y):
        return 1.50                       # deep inside the cavity: cuts air
    # the cutter's outer face must clear the FATTEST thing inside the window
    # (a buttress crest can add 0.7 to the radius); measured, not guessed
    peak = 0.0
    for i in range(64):
        for j in range(24):
            p = -W_PHI0 + 2 * W_PHI0 * i / 63
            yy = (W_YC - W_YDN) + (W_YUP + W_YDN) * j / 23
            peak = max(peak, r_out(p, yy))

    def hi(phi, y):
        return max(r_out(phi, y), peak) + 0.75
    return radial_window("woundCut", boundary, lo, hi, m=144, rings=4)


def door_cutter():
    hw = DOOR_W / 2.0 / 2.95              # phi half-width at the flank
    hh = DOOR_H / 2.0

    def boundary(a, t):
        # a rounded rectangle: the ember door is a knothole, not a window
        n = 3.2
        ca, sa = math.cos(a), math.sin(a)
        d = (abs(ca) ** n + abs(sa) ** n) ** (1.0 / n)
        rho = t / d
        jag = 1.0 + 0.10 * n1p(a, 6, SEED + 91)
        return DOOR_PHI + hw * rho * ca * jag, DOOR_Y + hh * rho * sa * jag

    # CONSTANT radii, not a pocket that follows r_out. The recess straddles
    # the buttress toe, where the radius falls 0.05 in 0.4 of height; a back
    # face tracking that gradient folded against the surface it was cutting
    # and left two non-manifold edges. A real little door has a flat back.
    r0 = r_out(DOOR_PHI, DOOR_Y)

    def lo(phi, y):
        return r0 - DOOR_DEPTH

    def hi(phi, y):
        return r0 + 0.70
    return radial_window("doorCut", boundary, lo, hi, m=48, rings=3)


# --------------------------------------------------------------------------
# THE DELIVERY TONGUE — the engine's chute, skinned as a flattened root
# --------------------------------------------------------------------------
# Measured off the apron box rather than copied from its comment: rotate the
# top face (local y = +s/2) about x by APRON_RX and the plane comes out as
# y = 0.9937 - 0.5333 z, meeting the felt at z 1.863. PROUD lifts the skin
# clear of the collider so it never z-fights or lets a die ride nothing.
PROUD = 0.02
_ct, _st = math.cos(APRON_RX), math.sin(APRON_RX)


def _ramp_plane():
    """(y0, k) with ramp top y = y0 - k*z, from the rotated box corners."""
    hy, hz = APRON_S[1] / 2.0, APRON_S[2] / 2.0
    pts = []
    for zl in (-hz, hz):
        y = APRON_C[1] + hy * _ct - zl * _st
        z = APRON_C[2] + hy * _st + zl * _ct
        pts.append((z, y))
    (z0, y0), (z1, y1) = pts
    k = -(y1 - y0) / (z1 - z0)
    return y0 + k * z0, k


RAMP_Y, RAMP_K = _ramp_plane()


def _lip_plane():
    hy, hz = LIP_S[1] / 2.0, LIP_S[2] / 2.0
    c, s = math.cos(LIP_RX), math.sin(LIP_RX)
    pts = []
    for zl in (-hz, hz):
        y = LIP_C[1] + hy * c - zl * s
        z = LIP_C[2] + hy * s + zl * c
        pts.append((z, y))
    (z0, y0), (z1, y1) = pts
    k = -(y1 - y0) / (z1 - z0)
    return y0 + k * z0, k


LIP_Y, LIP_K = _lip_plane()
TONGUE_Z0 = -0.06
TONGUE_Z1 = LIP_C[2] + LIP_S[2] / 2.0 + 0.06


def tongue_top(z):
    return max(RAMP_Y - RAMP_K * z, LIP_Y - LIP_K * z) + PROUD


def tongue_hw(z):
    """Lobed: a root plate spreading onto the felt, not a ramp."""
    t = smoothstep(z, TONGUE_Z0, 2.4)
    hw = 2.44 + 0.52 * t - 0.30 * smoothstep(z, 2.9, TONGUE_Z1)
    hw += 0.09 * math.sin(2.3 * z + 1.1) + 0.06 * n1(z * 1.7, SEED + 101)
    return hw


def build_tongue(name):
    zs = [TONGUE_Z0 + (TONGUE_Z1 - TONGUE_Z0) * (i / 12.0) for i in range(13)]
    xs = [-1.0, -0.78, -0.44, 0.0, 0.44, 0.78, 1.0]
    verts, faces = [], []
    rings = []
    for z in zs:
        hw = tongue_hw(z)
        top = tongue_top(z)
        ring = []
        for u in xs:                                    # top surface, cambered
            x = u * hw
            camber = 0.022 * (1.0 - u * u)
            grain = 0.012 * n1(u * hw * 2.6 + z * 0.6, SEED + 103)
            ring.append((x, top + camber + grain, z))
        for u in (1.0, 0.55, 0.0, -0.55, -1.0):         # the underside
            ring.append((u * hw * 0.98, -0.35, z))
        rings.append(len(verts))
        for p in ring:
            verts.append(bl(p))
    n = len(xs) + 5
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            faces.append((a + j, a + k, b + k, b + j))
    faces.append(tuple(range(rings[0], rings[0] + n)))
    last = rings[-1]
    faces.append(tuple(range(last + n - 1, last - 1, -1)))
    ob = F.obj_from_pydata(name, verts, faces)
    F.recalc_normals(ob)
    return ob


# --------------------------------------------------------------------------
# FOXFIRE SHELVES — few, clustered, odd counts, on the shaded side and at
# the wound. Their own object so their material can carry a low emissive
# without lighting the whole trunk (emissive is a MATERIAL constant, and
# three.js does not multiply it by vertex colours).
# --------------------------------------------------------------------------
SHELF_CLUSTERS = [
    (2.62, 4.85, 3),      # phi, y, count — the shaded back-left flank
    (-1.62, 3.05, 5),     # beside the wound's left jamb
    (1.55, 6.35, 1),      # a lone bracket high on the right jamb
    (3.02, 2.15, 3),      # low on the back
]


SHELVES = []          # (x, y, z, thick) per bracket, filled by build_shelves
#                       so the paint pass can tell a cap from its gills by
#                       POSITION alone — the same rule the trunk paint uses.


def build_shelves(name):
    verts, faces = [], []
    SHELVES.clear()
    idn = 0
    for (cphi, cy, cnt) in SHELF_CLUSTERS:
        for s in range(cnt):
            idn += 1
            phi = cphi + (h01(idn, 111) - 0.5) * 0.42
            y = cy + (h01(idn, 113) - 0.5) * 0.85
            wide = 0.30 + 0.26 * h01(idn, 115)
            out = 0.20 + 0.17 * h01(idn, 117)
            thick = 0.055 + 0.045 * h01(idn, 119)
            r0 = r_out(phi, y) - 0.09
            ring = []
            m = 9
            for k in range(m):
                f = k / (m - 1)
                ang = math.pi * (f - 0.5)
                dphi = math.sin(ang) * (wide / r0)
                dr = math.cos(ang) * out * (0.72 + 0.28 * h01(idn * 17 + k, 121))
                dy = -0.045 * math.cos(ang) + 0.03 * (h01(idn * 19 + k, 123) - 0.5)
                p = phi + dphi
                rr = r0 + dr
                ring.append((rr * math.sin(p), y + dy, AXIS_Z + rr * math.cos(p)))
            for k in range(m - 1, -1, -1):              # back along the trunk
                if k in (0, m - 1):
                    continue
                f = k / (m - 1)
                ang = math.pi * (f - 0.5)
                dphi = math.sin(ang) * (wide / r0) * 0.92
                p = phi + dphi
                rr = r_out(p, y) - 0.16
                ring.append((rr * math.sin(p), y - 0.01,
                             AXIS_Z + rr * math.cos(p)))
            b = len(verts)
            for p in ring:
                verts.append(bl(p))
            nr = len(ring)
            cxu = sum(p[0] for p in ring) / nr
            cyu = sum(p[1] for p in ring) / nr
            czu = sum(p[2] for p in ring) / nr
            SHELVES.append((cxu, cyu, czu, thick))
            top = len(verts)
            verts.append(bl((cxu, cyu + thick, czu)))
            bot = len(verts)
            verts.append(bl((cxu, cyu - thick * 0.55, czu)))
            for k in range(nr):
                k2 = (k + 1) % nr
                faces.append((top, b + k, b + k2))
                faces.append((bot, b + k2, b + k))
    ob = F.obj_from_pydata(name, verts, faces)
    F.recalc_normals(ob)
    return ob


# --------------------------------------------------------------------------
# COLOUR — LINEAR. COLOR_0 is linear by the glTF spec and Blender hands the
# float straight through; author 0.216 when you mean sRGB 0.5.
# --------------------------------------------------------------------------

def srgb(h):
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


PALETTES = {
    "moonrise": {
        "wood_hi": (0.228, 0.229, 0.218),      # bone, the pale dominant
        "wood_mid": (0.100, 0.106, 0.120),
        "wood_low": (0.030, 0.036, 0.052),     # cool violet-leaning shadow
        "bark": (0.038, 0.034, 0.031),
        "moss": (0.030, 0.062, 0.055),
        "lichen": (0.176, 0.206, 0.200),
        "punk": (0.052, 0.038, 0.026),
        "liner": (0.013, 0.018, 0.026),
        "liner_hi": (0.030, 0.043, 0.052),
        "glow": srgb("#5fdccb"),
        "glow_core": srgb("#3fbfb4"),
        "ember": (0.130, 0.052, 0.016),
    },
    "foxfire": {
        "wood_hi": (0.229, 0.230, 0.213),
        "wood_mid": (0.093, 0.101, 0.086),
        "wood_low": (0.024, 0.033, 0.026),     # near-black bog green
        "bark": (0.033, 0.031, 0.024),
        "moss": (0.026, 0.058, 0.031),
        "lichen": (0.190, 0.212, 0.186),
        "punk": (0.050, 0.039, 0.025),
        "liner": (0.011, 0.017, 0.013),
        "liner_hi": (0.026, 0.040, 0.030),
        "glow": srgb("#b8f5d4"),
        "glow_core": srgb("#7dd8a8"),
        "ember": (0.130, 0.052, 0.016),
    },
}


def make_paint(pal):
    """Vertex colour by POSITION only — never by face normal. A normal is
    constant across a face, so neighbours disagree at shared corners and the
    seam reads as a sawtooth (B4's first sawn top)."""

    def paint(_poly, co):
        x, y, z = co.x, co.z, -co.y
        dx, dz = x, z - AXIS_Z
        r = math.hypot(dx, dz)
        phi = math.atan2(dx, dz)
        rmid = base(y) - wall(y) * 0.5
        q = in_wound(phi, y)

        # --- the interior: the liner, dark by MATERIAL not by lighting ----
        if r < rmid:
            rib = abs(math.sin(phi * 11.0 + 3.0 * fbm_ring(phi, y, 3.0, SEED + 24, 2)))
            k = rib ** 3
            c = lerp3(pal["liner"], pal["liner_hi"],
                      0.25 * k + 0.45 * fbm_ring(phi, y * 0.7, 7.0, SEED + 23, 2))
            # the glowing rot just inside the opening: what makes a cavity
            # read as a cavity instead of a black veil
            near = max(0.0, 1.0 - abs(q - 1.0) / 0.55) if q < 1.6 else 0.0
            c = lerp3(c, pal["glow_core"], 0.055 * near)
            if y < FLOOR_Y + 0.35:
                c = lerp3(c, pal["punk"], 0.35)
            return c

        # --- the ember door recess ---------------------------------------
        if (angdist(phi, DOOR_PHI) < DOOR_W / 2.2 / 2.95 + 0.02
                and abs(y - DOOR_Y) < DOOR_H / 2 + 0.02
                and r < r_out(phi, y) - 0.035):
            return pal["ember"]

        # --- the skeleton -------------------------------------------------
        crestk = 0.0
        for R in RIDGES:
            crestk = max(crestk, crest(angdist(phi, crest_at(R, y)), R["w"]))
        # VERTICAL FIBER STRIATION: streaks run UP the trunk, along the
        # spires and out along the roots, drifting slowly with height
        # (the twist of grain) so they are never a barcode.
        streak = fbm_ring(phi + 0.02 * y, y * 0.09, 11.0, SEED + 33, 3)
        streak = streak * (0.72 + 0.28 * n1(y * 0.55, SEED + 35))
        lum = 0.30 + 0.70 * smoothstep(streak, 0.28, 0.78)
        lum = lum * (0.72 + 0.42 * crestk)
        c = lerp3(pal["wood_mid"], pal["wood_hi"], min(1.0, lum))
        c = lerp3(pal["wood_low"], c, smoothstep(y, -0.1, 1.5) * 0.55 + 0.45)

        # bark REMNANTS, low and patchy only
        barkk = (smoothstep(1.9, 0.35, y)
                 * smoothstep(fbm_ring(phi, y * 0.8, 4.0, SEED + 41, 3), 0.46, 0.74))
        c = lerp3(c, pal["bark"], 0.85 * barkk)

        # moss pools in the VALLEYS and on the shaded arc; lichen crusts the
        # crests that catch the moon. One field drives form and growth both.
        shade = crest(angdist(phi, math.pi * 0.86), 1.05)
        mossk = min(1.0, (0.62 * shade + 0.70 * flare(y))
                    * (0.40 + 0.60 * fbm_ring(phi, y * 0.5, 3.4, SEED + 47, 3))
                    * (0.30 + 0.70 * (1.0 - crestk)))
        c = lerp3(c, pal["moss"], 0.80 * mossk)
        lichk = (max(0.0, min(1.0, y / 7.0 - 0.28))
                 * smoothstep(fbm_ring(phi, y * 0.9, 8.0, SEED + 53, 3), 0.54, 0.88)
                 * (0.30 + 0.70 * crestk) * 0.62)
        c = lerp3(c, pal["lichen"], lichk)

        # the torn edges: punky rot in the fringe, pale exposed fiber ON it
        if q < 1.9:
            fr = max(0.0, 1.0 - abs(q - 1.0) / 0.42)
            c = lerp3(c, pal["punk"], 0.62 * fr)
            c = lerp3(c, pal["wood_hi"], 0.34 * fr * smoothstep(streak, 0.4, 0.8))
        rimk = max(0.0, 1.0 - (y_top(phi) - y) / 0.55)
        if rimk > 0:
            c = lerp3(c, pal["wood_hi"], 0.42 * rimk)
            c = lerp3(c, pal["punk"], 0.20 * rimk)
        return c

    return paint


def make_tongue_paint(pal):
    def paint(_poly, co):
        x, y, z = co.x, co.z, -co.y
        if y < -0.05:
            return pal["wood_low"]
        # fiber streaks run DOWN the slope: constant along z, banded in x
        st = n1(x * 3.1 + 11.0, SEED + 61) * 0.6 + 0.4 * n1(x * 8.0, SEED + 63)
        lum = 0.34 + 0.66 * smoothstep(st, 0.30, 0.76)
        c = lerp3(pal["wood_mid"], pal["wood_hi"], lum * 0.82)
        # dark where it leaves the mouth, mossy-damp at the felt end
        c = lerp3(pal["wood_low"], c, smoothstep(z, -0.05, 1.5) * 0.72 + 0.28)
        c = lerp3(c, pal["moss"], 0.42 * smoothstep(z, 2.3, 3.9)
                  * (0.4 + 0.6 * n1(x * 2.2 + z, SEED + 65)))
        return c
    return paint


def make_shelf_paint(pal):
    """Cap vs gills, by POSITION: find the bracket this corner belongs to and
    read its height within it. The cap carries the palette's pale glow (the
    material's low emissive rides on top of it); the underside is rot-dark,
    so a bracket reads as a bracket and not as a glowing pebble."""
    cap = tuple(min(0.235, c * 0.30) for c in pal["glow"])
    gill = lerp3(pal["punk"], pal["liner"], 0.45)

    def paint(_poly, co):
        x, y, z = co.x, co.z, -co.y
        best, bd = SHELVES[0], 1e18
        for s in SHELVES:
            d = (x - s[0]) ** 2 + (y - s[1]) ** 2 + (z - s[2]) ** 2
            if d < bd:
                bd, best = d, s
        up = smoothstep(y - best[1], -best[3] * 0.4, best[3] * 0.5)
        c = lerp3(gill, cap, up)
        rim = smoothstep(math.hypot(x - best[0], z - best[2]), 0.05, 0.30)
        return lerp3(c, pal["punk"], 0.30 * (1.0 - rim) * (1.0 - up))
    return paint


# --------------------------------------------------------------------------
# MEASUREMENT — every claim re-derived from the BUILT vertices
# --------------------------------------------------------------------------

def tri_array(objs):
    import numpy as np
    tris = []
    for ob in objs:
        me = ob.data
        me.calc_loop_triangles()
        vs = [(v.co.x, v.co.z, -v.co.y) for v in me.vertices]   # -> app frame
        for lt in me.loop_triangles:
            tris.append([vs[i] for i in lt.vertices])
    return np.asarray(tris, dtype=float)


def ray_hit(tris, origin, direction, t_max):
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


def assert_throat_clear(objs):
    """The exit gate, on the finished triangles. check.py proves it again
    and is the authority; this exists so a bad parameter fails HERE, with
    the offending probe named, instead of thirty seconds later as a count."""
    import numpy as np
    tris = tri_array(objs)
    bad = []
    for i in range(5):
        for k in range(5):
            px = -THROAT_HALF_W + 2 * THROAT_HALF_W * i / 4
            py = THROAT_Y0 + (THROAT_Y1 - THROAT_Y0) * k / 4
            t = ray_hit(tris, np.array([px, py, THROAT_Z0]),
                        np.array([0.0, 0.0, 1.0]), THROAT_Z1 - THROAT_Z0)
            if t is not None:
                bad.append((px, py, THROAT_Z0 + t))
    if bad:
        raise RuntimeError(
            f"exit throat blocked at {len(bad)}/25 probes, first at "
            f"x {bad[0][0]:.2f} y {bad[0][1]:.2f} z {bad[0][2]:.2f} — widen "
            f"the wound (W_PHI0 {W_PHI0}) or lower its threshold "
            f"(W_YC-W_YDN = {W_YC - W_YDN:.2f})")
    print("[bole] exit throat 25/25 clear")


def assert_approach_clear(objs):
    import numpy as np
    tris = tri_array(objs)
    cx, cz = PORTAL_IN["x"], PORTAL_IN["z"]
    rr = PORTAL_IN["clearR"] * 0.95
    y_top_ray = PORTAL_IN["rimY"] + 2.5
    pts = [(cx, cz)]
    for count, fr, ph in ((8, 0.55, 0.0), (16, 1.0, math.pi / 16)):
        for i in range(count):
            a = ph + 2.0 * math.pi * i / count
            pts.append((cx + rr * fr * math.cos(a), cz + rr * fr * math.sin(a)))
    bad = []
    for px, pz in pts:
        t = ray_hit(tris, np.array([px, y_top_ray, pz]),
                    np.array([0.0, -1.0, 0.0]), y_top_ray - DESPAWN_Y)
        if t is not None:
            bad.append((px, pz, y_top_ray - t))
    if bad:
        raise RuntimeError(
            f"approach column blocked at {len(bad)}/25 probes, highest "
            f"y {max(b[2] for b in bad):.2f} — a spire is leaning into the "
            f"drop; check r_in at the crown vs clearR {PORTAL_IN['clearR']}")
    print("[bole] approach column 25/25 clear")


def assert_envelope(objs):
    lo, hi = F.world_bounds(objs)
    x0, x1 = lo.x, hi.x
    z0, z1 = -hi.y, -lo.y          # blender -y is app z
    y1 = hi.z
    if max(abs(x0), abs(x1)) > XLIM + 1e-3:
        raise RuntimeError(f"x envelope blown: {x0:.3f}..{x1:.3f} vs +-{XLIM}")
    if z0 < ZBACK - 0.2:
        raise RuntimeError(f"reaches too far back: z {z0:.3f} < {ZBACK}")
    print(f"[bole] envelope x {x0:.2f}..{x1:.2f}  z {z0:.2f}..{z1:.2f}  "
          f"top y {y1:.2f}")


def assert_rim_is_low():
    tops = [y_top(-math.pi + 2 * math.pi * i / 720) for i in range(720)]
    lo, hi = min(tops), max(tops)
    if abs(lo - PORTAL_IN["rimY"]) > 0.06:
        raise RuntimeError(
            f"declared rimY {PORTAL_IN['rimY']} is not the crown's low point "
            f"({lo:.3f}) — the portal number must be honest")
    print(f"[bole] crown tear {lo:.2f} .. {hi:.2f}  "
          f"(spires {hi - lo:.2f} above the rim)")


def app_of(co):
    return (co.x, co.z, -co.y)


def diagnose_pinches(ob, eps=2e-4):
    """Faces carrying two vertices at (nearly) the same position.

    This is the pinch that makes an n-gon non-simple: the solver drops a new
    vertex where a cutter rib crosses an existing edge, and when that rib
    passes almost exactly through an existing vertex you get a pair. The
    polygon is still a legal face and the solid is still manifold — until
    something triangulates it, and then the two halves of the pinch overlap
    and their shared edge carries four faces. (Measured: BEAUTY leaves 2
    such edges, EAR_CLIP leaves 25, which is how we know the fault is the
    polygon and not the triangulator.)
    """
    me = ob.data
    worst, n = 1e9, 0
    for p in me.polygons:
        vs = [me.vertices[i].co for i in p.vertices]
        for a in range(len(vs)):
            for b in range(a + 1, len(vs)):
                d = (vs[a] - vs[b]).length
                if d < eps:
                    n += 1
                    worst = min(worst, d)
    if n:
        print(f"[bole] {ob.name}: {n} pinched face-vertex pairs, "
              f"closest {worst:.2e}")
    return n


def diagnose_ngons(ob):
    """Name the polygons a triangulator is going to choke on, in APP FRAME.

    Blender's exact boolean occasionally emits a hair-thin or slightly
    self-overlapping n-gon along an intersection curve; the union is
    manifold, and BEAUTY triangulation of that n-gon is not. The count
    reaching zero is the model being fixed, not the symptom being muted.
    """
    bad = []
    for p in ob.data.polygons:
        if p.area < 2e-7 or len(set(p.vertices)) != len(p.vertices):
            vs = [app_of(ob.data.vertices[i].co) for i in p.vertices]
            bad.append((p.area, len(p.vertices), vs[0]))
    if bad:
        bad.sort()
        print(f"[bole] {ob.name}: {len(bad)} degenerate n-gons, worst area "
              f"{bad[0][0]:.3e} ({bad[0][1]}-gon) near app "
              f"({bad[0][2][0]:.3f}, {bad[0][2][1]:.3f}, {bad[0][2][2]:.3f})")
    return len(bad)


def poke_shared_diagonals(ob):
    """Triangulate the faces that would otherwise draw the SAME diagonal.

    THE BUG, in full, because it cost four bakes to corner. Out of the wound
    boolean the shell is manifold (0 non-manifold edges) and every face is a
    simple polygon (diagnose_selfintersect: 0). It still triangulates into
    edges carrying four faces, always on the inner wall, always on the cut.

    The cause is not any one face — it is a PAIR. Where the cut boundary
    touches the inner surface twice inside one grid cell, two separate
    n-gons end up holding the same two vertices NON-CONSECUTIVELY. Each is
    triangulated independently, each picks the segment between those two
    vertices as its diagonal, and the edge that did not exist before now
    has two faces from one polygon and two from the other. That is also why
    EAR_CLIP made it worse (2 -> 25): a different diagonal rule is still a
    diagonal rule, and the collision is between polygons, not inside one.

    POKE is the only triangulation that cannot collide: it fans from a NEW
    centre vertex, so it never lays an edge between two existing ones. It is
    applied to the hazard faces ONLY — the pairs are found exactly, by
    indexing every face's non-adjacent vertex pairs — because poking
    everything would double the tri count and poking a concave face is a
    trade worth making a handful of times, not five thousand.
    """
    import bmesh
    from collections import defaultdict
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    # A diagonal is also a hazard when the segment it wants ALREADY EXISTS
    # as a real edge elsewhere in the mesh: that edge keeps its two faces
    # and gains two more. This is the second flavour, and it survived the
    # first fix because only one face was claiming the pair.
    existing = set()
    for e in bm.edges:
        a, b = e.verts[0].index, e.verts[1].index
        existing.add((min(a, b), max(a, b)))
    claims = defaultdict(list)
    for f in bm.faces:
        vs = [v.index for v in f.verts]
        n = len(vs)
        if n < 4:
            continue
        for i in range(n):
            for j in range(i + 2, n):
                if i == 0 and j == n - 1:
                    continue
                claims[(min(vs[i], vs[j]), max(vs[i], vs[j]))].append(f.index)
    hazard = set()
    for pair, fs in claims.items():
        if len(fs) > 1 or pair in existing:
            hazard.update(fs)
    if hazard:
        faces = [bm.faces[i] for i in sorted(hazard)]
        print(f"[bole] {ob.name}: poking {len(faces)} faces that would share "
              f"a triangulation diagonal")
        bmesh.ops.poke(bm, faces=faces, center_mode="MEAN_WEIGHTED")
    bm.to_mesh(ob.data)
    bm.free()
    return len(hazard)


def diagnose_selfintersect(ob):
    """Name the n-gons that are NOT SIMPLE polygons, with their vertices.

    A boolean can hand back a face whose boundary crosses itself. It is
    manifold as a face and the solid passes every topological check; the
    moment anything triangulates it the two lobes overlap and their shared
    edge carries four faces. Projecting each face onto its own plane and
    testing non-adjacent edge pairs is the only way to see it.
    """
    from mathutils import Vector
    me = ob.data
    bad = 0
    for p in me.polygons:
        if len(p.vertices) < 4:
            continue
        nrm = p.normal
        up = Vector((0, 0, 1)) if abs(nrm.z) < 0.9 else Vector((1, 0, 0))
        ex = nrm.cross(up).normalized()
        ey = nrm.cross(ex).normalized()
        pts = [(me.vertices[i].co.dot(ex), me.vertices[i].co.dot(ey))
               for i in p.vertices]
        n = len(pts)

        def seg(i):
            return pts[i], pts[(i + 1) % n]

        def cross(o, a, b):
            return ((a[0] - o[0]) * (b[1] - o[1])
                    - (a[1] - o[1]) * (b[0] - o[0]))
        hit = False
        for i in range(n):
            for j in range(i + 2, n):
                if i == 0 and j == n - 1:
                    continue
                a, b = seg(i)
                c, d = seg(j)
                d1, d2 = cross(a, b, c), cross(a, b, d)
                d3, d4 = cross(c, d, a), cross(c, d, b)
                if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)):
                    hit = True
        if hit:
            bad += 1
            vs = [app_of(me.vertices[i].co) for i in p.vertices]
            print(f"[bole] SELF-INTERSECTING {n}-gon, area {p.area:.4e}:")
            for v in vs:
                print(f"[bole]     ({v[0]:+.4f}, {v[1]:+.4f}, {v[2]:+.4f})  "
                      f"r {math.hypot(v[0], v[2] - AXIS_Z):.4f}  "
                      f"phi {math.degrees(math.atan2(v[0], v[2] - AXIS_Z)):+.2f}")
    return bad


def diagnose_nonmanifold(ob):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for e in bm.edges:
        if len(e.link_faces) != 2:
            a, b = (app_of(v.co) for v in e.verts)
            print(f"[bole] non-manifold edge ({len(e.link_faces)} faces) "
                  f"app ({a[0]:.3f},{a[1]:.3f},{a[2]:.3f}) -> "
                  f"({b[0]:.3f},{b[1]:.3f},{b[2]:.3f})  len "
                  f"{(sum((p - q) ** 2 for p, q in zip(a, b))) ** 0.5:.5f}")
    bm.free()


def report_form():
    roots = [R for R in RIDGES if R["butt"] > 0.26]
    spires = [R for R in RIDGES if R["spire"] > 0]
    tall = max(spires, key=lambda R: R["spire"])
    print(f"[bole] ridges {N_RIDGE}  roots {len(roots)}  spires {len(spires)}"
          f"  tallest at phi {math.degrees(tall['th']):+.0f} deg "
          f"(+{tall['spire']:.2f})")
    if not (5 <= len(roots) <= 7):
        raise RuntimeError(f"want 5-7 buttress roots, got {len(roots)}")
    if not (4 <= len(spires) <= 6):
        raise RuntimeError(f"want 4-6 crown spires, got {len(spires)}")
    if abs(math.degrees(tall["th"])) < 25:
        raise RuntimeError("the tallest spire is centred on the front face")
    # WIDTH is the x extent of the CLAMPED points, not 2*max(r): the first
    # version read 7.76 because it measured the root spread in z, where the
    # glade gives it room, and called it width.
    xs, zs = [], []
    for i in range(360):
        p = -math.pi + 2 * math.pi * i / 360
        for y in (0.02, 0.30, 0.62, 1.05):
            x, z = clamp_point(r_out(p, y), p, ZFRONT - AXIS_Z, ZBACK - AXIS_Z)
            xs.append(x)
            zs.append(z)
    w = max(xs) - min(xs)
    h = max(y_top(-math.pi + 2 * math.pi * i / 360) for i in range(360))
    print(f"[bole] stance {h:.2f} tall / {w:.2f} wide = {h / w:.2f}:1 "
          f"(root spread z {min(zs):.2f}..{max(zs):.2f})")
    if not (1.7 <= h / w <= 2.25):
        raise RuntimeError(f"stance {h / w:.2f}:1 is not the stocky ~2:1 the "
                           f"reference asks for")


# --------------------------------------------------------------------------
# the bake
# --------------------------------------------------------------------------

def emissive_vertex_material(name, attr, rgb, strength=1.0):
    """vertex_color_material plus a low emissive constant. Recipe-local
    because emissive belongs to THIS asset's shelves, not to the kit."""
    import bpy
    mat = F.vertex_color_material(name, attr)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Emission Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Emission Strength"].default_value = strength
    del bpy
    return mat


def build(variant):
    pal = PALETTES[variant]
    F.reset()

    shell = build_shell("towerSkinBoleShell")
    F.boolean(shell, wound_cutter(), op="DIFFERENCE")
    nm, vol = F.manifold_report(shell)
    print(f"[bole] after wound: {nm} non-manifold, volume {vol:.2f}")
    if nm:
        raise RuntimeError(f"wound cut left {nm} non-manifold edges")
    F.boolean(shell, door_cutter(), op="DIFFERENCE")
    print(f"[bole] after door:  {F.manifold_report(shell)[0]} non-manifold")

    tongue = build_tongue("towerSkinBoleTongue")
    shelves = build_shelves("towerSkinBoleShelves")

    meshes = [shell, tongue, shelves]
    for ob in meshes:
        # RECORDED REPAIR, with its receipt. Straight out of the wound
        # boolean the shell is manifold (0 non-manifold edges) but carries
        # 10 PINCHED face-vertex pairs — the exact solver drops a new vertex
        # where a cutter rib crosses an existing edge, and where a rib
        # passes through an existing vertex the pair lands 2e-16 apart. The
        # face is legal; triangulating it is not, and its two halves overlap
        # on an edge with four faces. Welding the pairs first is the fix;
        # it is a repair and so it is measured, printed, and named here
        # rather than run silently over everything.
        # 3e-4, not the kit default 2e-5: the first weld took the pairs from
        # 10 to 2 and the survivors sat 5.8e-05 apart. 3e-4 is still 230x
        # under this model's smallest intended feature (the tongue's 0.022
        # camber) and 700x under the 0.07 visible-feature floor, so it can
        # only ever weld solver debris.
        if diagnose_pinches(ob):
            F.clean_slivers(ob, dist=3e-4)
            if diagnose_pinches(ob):
                raise RuntimeError(f"{ob.name}: pinches survived the weld")
        poke_shared_diagonals(ob)
        F.canonicalize(ob)
        F.triangulate(ob)
        F.smooth_by_angle(ob, 30.0)
        nm, _ = F.manifold_report(ob)
        if nm:
            diagnose_nonmanifold(ob)
            raise RuntimeError(f"{ob.name}: {nm} non-manifold edges")

    # paint AFTER the last bmesh round-trip (fae_arch's recorded deviation:
    # paint-after-canonicalize), then collapse to one material per object so
    # each mesh stays a single closed glTF primitive
    F.paint_corners(shell, "Col", make_paint(pal))
    F.single_material(shell, F.vertex_color_material("bole", "Col"))
    F.paint_corners(tongue, "Col", make_tongue_paint(pal))
    F.single_material(tongue, F.vertex_color_material("boleTongue", "Col"))
    F.paint_corners(shelves, "Col", make_shelf_paint(pal))
    F.single_material(shelves, emissive_vertex_material(
        "boleShelves", "Col", tuple(c * 0.11 for c in pal["glow_core"])))

    assert_throat_clear(meshes)
    assert_approach_clear(meshes)
    assert_envelope(meshes)

    pin, pout = F.tower_portals(PORTAL_IN, PORTAL_OUT)
    F.assert_budget(meshes, BUDGET)
    F.report_bounds(meshes, f"hollowbole_{variant}")
    # NO sit_on_ground: this model's frame IS the contract. y = 0 is the
    # felt and z = 0 is the socket plane; grounding would move the portals
    # off the very planes they are quoted against.
    return F.export_glb(f"hollowbole_{variant}", meshes + [pin, pout],
                        vertex_colors=True)


def main():
    global DOOR_PHI, DOOR_Y
    assert_rim_is_low()
    DOOR_PHI, DOOR_Y = pick_door()
    report_form()
    for variant in ("moonrise", "foxfire"):
        print(f"[bole] --- {variant} ---")
        build(variant)


main()
