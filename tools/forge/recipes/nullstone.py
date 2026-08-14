# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""nullstone — the Umbra house's tower. A die-shaped absence, at building scale.

    tools/forge/bake.sh tools/forge/recipes/nullstone.py \
        --tower --expect-colors --max-tris 15000

THE IDENTITY. The Void Grain die (js/themes.js, house `umbra`) is "dark &
unnatural — a die-shaped absence": a near-black body (#0b0a10) that pools
shadow instead of emitting, witchlight digits (#cfe98c), a violet accent
(#43265b), a bevel of 0.015 because *nothing has ever worn it*, and a
`dissolve` shader whose burning edge is that same witchlight. Every other
tower in the registry is a made thing — carpentry, masonry, a forge. This one
is the opposite claim, and the pairing is literal: **the Void Grain die is a
chip off this rock.**

So the tower is a MASS, not a building: one block of black stone jointed the
way cooled basalt joints — vertical fissures, which is the GRAIN at
architectural scale — with the whole top taken off by a single diagonal
CLEAVE. Nothing on it is weathered, chipped or softened. Everything on it is
subtracted: the cleave took the crown, a rectangle was bitten out of the front
for the doorway, and a shard fell out of that bite and lies on the felt as the
delivery ramp. Both cut edges carry a faint witchlight burn, because that is
what unmaking looks like on this material.

Three parts, readable at the resting eye (the /new-tower silhouette rule):
  BASE   a fissured mass meeting the felt, with the fallen shard out front.
  BODY   fourteen facets of fluted stone, cut through by the doorway.
  CROWN  one diagonal cleave from 12.1 down to 10.1, with four splinters the
         cleave missed standing above it, and the void's rim burning inside.

ROUND 1 WAS A WASTEBASKET, and the note is here because the gates could not
see it. Twenty separate columns around a smooth cylindrical core passed every
refusal in the contract — occlusion 99/99, lane clad 243/243, throats clear —
and rendered as a picket fence around a bucket. The gates prove a tower is
LEGAL; only the LOOK says it is a tower. What fixed it was mass: one solid
with grooves cut INTO it, instead of parts arranged around a void.

DECLARED PORTALS — and the reason they are not new numbers:

    portalIn   x 0.00   rimY 9.40   z -2.55   clearR 2.20
    portalOut  x 0.00   sillY 1.00  w 4.20    clearH 3.50

That is the HOLLOW BOLE's spec, field for field. It is a deliberate reuse and
it is the whole point of the cosmetic/physics split: a tower that declares an
already-shipped portal spec bakes an already-proven film. `towerFilmDigest`
returns the same hash for both towers, `tower-spec-digest` says the contract
did not move, and this model therefore ships with ZERO dice simulations in its
validation — no probe campaign, no retry-knee sweep, no pour matrix. The spec
was measured by the 2026-08-13 portal-floors campaign and it is legal with
room to spare (clearR floor 2.00, clearH floor 3.375, w floor 4.00).

An off-classic spec was available and refused: this model wanted no aperture
the Bole's did not already have, and buying a new film costs a probe campaign
that buys nothing back.

THE INSIDE, and why it is shaped like that. The mass is the OCCLUDER OF
RECORD, and it is one closed solid: outer skin, bore, cleave. The binding
sight line is the top cowl sample (y 8.90, the cap at despawnY + a die's
radius) seen from `wide.full` — it crosses the socket plane at y 9.57, so the
cleave is floored at 10.10 and the front of it stands over that line with 0.5
to spare, while still letting a falling die stay visible below the declared
mouth. Both numbers are MEASURED by assert_the_mass_carries_the_dark rather
than trusted from this comment.

The bore is 2.34 wide (clearR 2.20 plus margin) only where the contract needs
it — from y 7.20 up. Below that it narrows to 1.55, which is what buys the
doorway its reveal: at the door's own height the wall is stone, not shell, and
the opening reads as a passage into a mass rather than a hole in a can.

THE SHARD is the delivery ramp, and it is CLAD rather than declared bare
(hollowbole's choice, and the opposite one). This tower stands in the grounded
room, where nothing else dresses the engine's apron and lip: leave them bare
and a die rides an invisible plane with felt showing under it. The shard's top
face IS the collider plane — both of them, the 28° apron and the shallow lip,
taken from `towergates.engine_volumes()` rather than retyped — sitting 0.02
proud so a die never rides nothing. The broken shoulders that keep it from
reading as a plank are OUTSIDE the apron's own half-width, so no die ever
crosses them.
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402
# The contract's gates, in the ONE implementation check.py also runs — and the
# engine's collider planes, so the cladding is built on the engine's arithmetic
# instead of a copy of it.
import towergates as TG  # noqa: E402

S = 1.25
AX, AZ = 0.0, -2.55                # the bore axis, app frame

PORTAL_IN = {"x": AX, "rimY": 9.40, "z": AZ, "clearR": 2.20}
PORTAL_OUT = {"x": 0.0, "sillY": 1.00, "w": 4.20, "clearH": 3.50}
SPEC = {"in": PORTAL_IN, "out": PORTAL_OUT}
DESPAWN_Y = PORTAL_IN["rimY"] - 1.4 * S            # 7.65

BUDGET = 15000
SEED = 0x0B0A10                    # the die's body colour, as a number

# --- the socket, and the margins taken out of it ---------------------------
# |x| <= 3.25, y in [0, 12.5], z in [-5.25, +0.25] (towergates ENGINE_MIRROR).
# This model does NOT lean — a monolith nothing has ever touched has no reason
# to — so the audit's tilt term is zero and these are the whole budget.
XLIM = 3.15                        # 0.10 kept back from the wall
ZFRONT = 0.25
ZBACK = -5.25
CROWN_MAX = 12.30

# --- the mass --------------------------------------------------------------
NF = 14                            # facets around the fluted skin
GROOVE_D = 0.115                   # how deep the fissures are cut
FACE_INSET = 0.19                  # where a facet's flat starts, as a fraction
MASS_Y0 = -0.05                    # sunk a little into the felt
BORE_R_HI = 2.34                   # above the taper: clearR 2.20 + 0.14
BORE_R_LO = 1.55                   # below it: the doorway's reveal
BORE_TAPER = (5.20, 7.20)          # narrow below, full above
BORE_FLOOR = 4.90                  # the interior floor, well under despawnY
CLEAVE_LO, CLEAVE_HI = 10.10, 12.15
OUT_YS = [MASS_Y0, 1.2, 2.6, 4.0, 5.4, 7.0, 8.6, 9.8]   # + the cleave
BORE_YS = [BORE_FLOOR, 5.20, 5.90, 6.60, 7.20, 8.40, 9.40]   # + the cleave

# --- the door --------------------------------------------------------------
# Wider and taller than the declared aperture is the SAFE way to be wrong: a
# declaration is a minimum. The cut starts 0.30 below the sill so its floor
# and the shard's top are never coplanar (forge trap 7).
DOOR_HW = PORTAL_OUT["w"] / 2                          # 2.10
DOOR_Y0 = PORTAL_OUT["sillY"] - 0.30                   # 0.70
DOOR_Y1 = PORTAL_OUT["sillY"] + PORTAL_OUT["clearH"]   # 4.50
DOOR_Z0 = -2.20                    # the pocket's back wall; the engine spawns
#                                    a die at z ~ -0.875, well in front of it
DOOR_Z1 = 0.60

# --- the splinters the cleave missed ---------------------------------------
# Not a hand-picked list: they stand where the cut went LOWEST, which is the
# only placement that reads as stone the cleave missed rather than as four
# more spires. Filled in below, once the cleave exists.
N_SPLINTER = 3
SPLINTERS = ()

# --- the mouth's burning edge ----------------------------------------------
# THERE ISN'T ONE ANY MORE, and that is round 3's finding. An emissive band
# under the cleave's inner lip rendered as a bright yellow-green horseshoe: the
# single most eye-catching thing on a tower whose whole claim is that it POOLS
# light rather than emitting it, and a direct hit on the countable-sources
# rule. The witchlight survives where the die itself puts it — a hairline at a
# cut edge (albedo, see burn()) and the one warm-less ember at the door.

# --- the shard (the clad ramp + lip) ---------------------------------------
SHARD_Z0 = -0.30                   # back into the doorway, under the sill
SHARD_PROUD = 0.02                 # how far the skin stands over the collider
SHARD_FLAT_HW = 2.42               # flat out to here — past the apron's own
#                                    half-width (3.8*S/2 = 2.375), so no die
#                                    ever reaches the shoulders
SHARD_FLOOR = -0.62                # under the felt; the CLADDING envelope
#                                    class needs min.y <= -0.5
SHARD_STEPS = 24

# --- colour, LINEAR (COLOR_0 is linear by the glTF spec) -------------------
# sRGB in the comments. The die's own body is sRGB 0.043 — this stone reads a
# little over three times that, which is the same material under the room's
# light rather than a second material.
# ROUND 5 LIFTED ALL OF THESE, and the reason is a frame rather than a taste.
# At sRGB 0.145 — three times the die's own body, which felt like the right
# family — the tower rendered in the grounded room as a black cut-out: no
# facet modelling, no fissures, and an ember that lit nothing because there
# was no albedo for it to land on. A die-shaped absence still has to be a
# THING in the frame; what makes it read as void is that it is the darkest
# object in the room and gives nothing back, not that it is unlit.
STONE = (0.0450, 0.0415, 0.0560)          # sRGB ~0.235, a violet lean
ARRIS = (0.0783, 0.0730, 0.0950)          # sRGB ~0.31, the lit facet edges
FRACTURE = (0.0615, 0.0578, 0.0740)       # sRGB ~0.275 — DELIBERATELY under
#                                           ARRIS: upward faces aim at the key
#                                           light and out-value walls at equal
#                                           albedo (the hollowbole tongue).
FISSURE = (0.0163, 0.0150, 0.0208)        # sRGB ~0.135, in the grooves
BORE_DARK = (0.0044, 0.0041, 0.0058)      # sRGB ~0.055, the hole
VIOLET = (0.0561, 0.0194, 0.1046)         # #43265b, the house accent
WITCH = (0.6240, 0.8159, 0.2623)          # #cfe98c, the burning edge
BURN = 0.030                              # how hard an unmade edge takes it.
#                                           Round 1 ran this at 0.075 over the
#                                           top 0.42 of every column and the
#                                           whole tower came out OLIVE; round 2
#                                           still washed the cleave green over
#                                           a 0.30 band. The burn belongs to a
#                                           HAIRLINE at a cut edge, and the die
#                                           it is quoted from wears it the same
#                                           way — one lit edge, not a glaze.


# --------------------------------------------------------------------------
# deterministic noise (integer hash, never `random`: the value must depend on
# WHICH sample it is, not on how many were drawn before it)
# --------------------------------------------------------------------------

def h01(a, b):
    h = ((int(a) + SEED) * 73856093) ^ (int(b) * 19349663)
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65536.0


def lerp3(a, b, t):
    return tuple(p + (q - p) * t for p, q in zip(a, b))


def smoothstep(x, lo, hi):
    t = min(1.0, max(0.0, (x - lo) / (hi - lo)))
    return t * t * (3.0 - 2.0 * t)


def polar(r, phi):
    """Angle measured from +z (the player's side), swinging toward +x."""
    return (AX + r * math.sin(phi), AZ + r * math.cos(phi))


def phi_of(x, z):
    return math.atan2(x - AX, z - AZ)


def radius_of(x, z):
    return math.hypot(x - AX, z - AZ)


# --------------------------------------------------------------------------
# the mass: plan, cleave, bore
# --------------------------------------------------------------------------

def reach(phi):
    """How far out the stone may stand on this heading before the socket.

    The three walls bind on different headings and the FRONT is the tight one:
    at phi = 0 the socket's front plane is only 0.25 past z = 0 and the axis
    already sits 2.55 behind it. That is why this tower is a slab facing the
    player and a block at the flanks — the shape is the socket's, not mine."""
    sn, cs = abs(math.sin(phi)), math.cos(phi)
    lim = XLIM / sn if sn > 1e-6 else 1e9
    if cs > 1e-6:
        lim = min(lim, (ZFRONT - AZ) / cs)
    elif cs < -1e-6:
        lim = min(lim, (AZ - ZBACK) / -cs)
    return lim


def facet_span(f):
    return 2.0 * math.pi * f / NF, 2.0 * math.pi * (f + 1) / NF


def facet_r(f):
    """One radius per facet — flat faces, crisp arrises, no cylinder.

    THE PLAN IS THE SOCKET'S, NOT A CIRCLE'S (round 3). Sampling a circle
    about the bore axis made a tower whose front face was a narrow strip, and
    the doorway — 4.2 wide by contract — then ate the whole of it: the render
    read as a shell torn open, not as an opening in a mass. Taking `reach` as
    the base and cutting each facet BACK from it instead fills the socket the
    way a quarried block would, and the door lands in the middle of a broad
    flat face with real stone either side of it."""
    a0, a1 = facet_span(f)
    room = min(reach(a) for a in (a0, 0.5 * (a0 + a1), a1)) - 0.04
    # the front three facets keep their face: that is where the door is cut
    front = math.cos(0.5 * (a0 + a1)) > 0.80
    inset = (0.02 + 0.10 * h01(f, 5)) if front else (0.06 + 0.62 * h01(f, 5))
    # THE WALL HAS TO EXIST. The socket is tightest at the BACK (2.70 from the
    # axis) and a deep inset there drove the outer skin INSIDE the bore — the
    # approach gate found it as a hit at (-0.43, -4.71), which is the wall
    # turned inside out rather than anything leaning in. The floor is the bore
    # plus a wall, and it binds on exactly the two rear facets.
    return max(room - inset, BORE_R_HI + 0.22)


def ring_xz():
    """The plan: two flat points per facet and one groove bottom between them.

    The groove takes the SHALLOWER of its two neighbours so a fissure is
    always a notch and never a step outward, and using one shared point per
    joint (rather than one per facet) keeps two vertices off the same spot —
    which canonicalize would warn about and the digest would feel."""
    pts = []
    for f in range(NF):
        a0, a1 = facet_span(f)
        d = a1 - a0
        r = facet_r(f)
        pts.append(polar(min(r, facet_r((f - 1) % NF)) - GROOVE_D, a0))
        pts.append(polar(r, a0 + FACE_INSET * d))
        pts.append(polar(r, a1 - FACE_INSET * d))
    return pts


RING = ring_xz()
RING_N = len(RING)


def cleave_y(x, z):
    """THE CUT. Two planes and a floor: one long diagonal that takes the crown
    from 12.1 down toward the far side, a second that shears a corner off it,
    and a floor that keeps the low end above the sight line the occlusion
    proof cares about (assert_the_mass_carries_the_dark measures the margin)."""
    a = 11.85 + 0.15 * (x - AX) - 0.150 * (z - AZ)
    b = 11.28 - 0.52 * (x - AX) - 0.055 * (z - AZ)
    return max(CLEAVE_LO, min(CLEAVE_HI, a, b))


def facet_cleave(f):
    """Where the cut crosses a facet's own face."""
    a0, a1 = facet_span(f)
    return cleave_y(*polar(facet_r(f), 0.5 * (a0 + a1)))


def _splinters():
    order = sorted(range(NF), key=facet_cleave)
    picked, out = [], []
    for f in order:
        if any(min((f - g) % NF, (g - f) % NF) < 2 for g in picked):
            continue                     # never two side by side: that is a wall
        picked.append(f)
        out.append((f, min(CROWN_MAX - 0.15,
                           facet_cleave(f) + 0.85 + 0.75 * h01(f, 17))))
        if len(out) == N_SPLINTER:
            break
    return tuple(out)


SPLINTERS = _splinters()


def bore_r(y):
    """The bore's radius. Full only where the contract asks for it."""
    return BORE_R_LO + (BORE_R_HI - BORE_R_LO) * smoothstep(y, *BORE_TAPER)


def build_mass():
    """One closed solid, built by hand rather than by boolean: fluted outer
    skin, tapered bore, a full disc at the foot, a disc at the bore's floor,
    and the cleave as an annulus across the top. One DIFFERENCE follows, for
    the door."""
    verts, faces = [], []
    tops = [cleave_y(x, z) for x, z in RING]
    inner_xz = [polar(1.0, phi_of(x, z)) for x, z in RING]   # unit directions

    def column(levels, r_of, top_of, flip):
        start = len(verts)
        for k, frac in enumerate(levels):
            for j in range(RING_N):
                y = frac(j)
                r = r_of(j, y)
                x, z = polar(r, phi_of(*RING[j])) if r is not None else RING[j]
                verts.append(tuple(F.spec_to_blender(x, y, z)))
        for k in range(len(levels) - 1):
            a, b = start + k * RING_N, start + (k + 1) * RING_N
            for j in range(RING_N):
                m = (j + 1) % RING_N
                q = (a + j, a + m, b + m, b + j)
                faces.append(q[::-1] if flip else q)
        return start

    out_levels = [(lambda j, y=y: y) for y in OUT_YS] + [lambda j: tops[j]]
    outer = column(out_levels, lambda j, y: None, tops, flip=False)
    bore_levels = [(lambda j, y=y: y) for y in BORE_YS] + [lambda j: tops[j]]
    inner = column(bore_levels, lambda j, y: bore_r(y), tops, flip=True)

    faces.append(tuple(range(outer + RING_N - 1, outer - 1, -1)))   # the foot
    faces.append(tuple(range(inner, inner + RING_N)))               # bore floor
    a = outer + (len(out_levels) - 1) * RING_N                      # the cleave
    b = inner + (len(bore_levels) - 1) * RING_N
    for j in range(RING_N):
        m = (j + 1) % RING_N
        faces.append((a + j, a + m, b + m, b + j))

    del inner_xz
    ob = F.obj_from_pydata("towerSkinNullMass", verts, faces)
    F.recalc_normals(ob)
    return ob


def build_splinters():
    """Four wedges the cleave missed, standing over its low side. They are the
    silhouette's whole break: without them the top is one clean line, which is
    a cut nobody made twice."""
    verts, faces = [], []
    for f, top in SPLINTERS:
        a0, a1 = facet_span(f)
        d = a1 - a0
        r = facet_r(f)
        # A splinter is thick, and its inner face still stops OUTSIDE the drop:
        # taking a flat 0.62 off the facet radius put two of them 2.08 from the
        # axis once the plan widened, and the approach gate read it instantly.
        r_in = max(r - 0.62, BORE_R_HI + 0.10)
        sect = [polar(r_in, a0 - 0.16 * d), polar(r + 0.06, a0 - 0.10 * d),
                polar(r + 0.06, a1 + 0.10 * d), polar(r_in, a1 + 0.16 * d)]
        n = len(sect)
        px, pz = 0.13 * (h01(f, 41) - 0.5), 0.13 * (h01(f, 43) - 0.5)
        tops = [top + px * (x - AX) + pz * (z - AZ) for x, z in sect]
        tops = [t - (max(tops) - top) for t in tops]   # the tilt is a CUT: it
        #                                                pivots under the top
        base = len(verts)
        for k in (0.0, 1.0):
            for (x, z), ty in zip(sect, tops):
                verts.append(tuple(F.spec_to_blender(x, MASS_Y0 + (ty - MASS_Y0) * k, z)))
        for j in range(n):
            m = (j + 1) % n
            faces.append((base + j, base + m, base + n + m, base + n + j))
        faces.append(tuple(range(base + n - 1, base - 1, -1)))
        faces.append(tuple(range(base + n, base + 2 * n)))
    ob = F.obj_from_pydata("towerSkinNullSplinters", verts, faces)
    F.recalc_normals(ob)
    return ob


# --------------------------------------------------------------------------
# the shard — the ENGINE's two planes, worn as stone
# --------------------------------------------------------------------------

VOL = TG.engine_volumes(SPEC)
RAMP_A, RAMP_B = TG.box_top_plane(VOL["apron"])
LIP_A, LIP_B = TG.box_top_plane(VOL["lip"])
LIP_FRONT = TG.box_front_z(VOL["lip"])


def lane_y(z):
    """The engine's lane surface: the upper envelope of the two collider
    planes. Not a curve of mine — `towergates` reads it off the same boxes
    js/main.js builds, and the cladding gate samples exactly this line."""
    return max(RAMP_A - RAMP_B * z, LIP_A - LIP_B * z)


def build_shard():
    """The piece the doorway's bite knocked out, lying where it fell, with the
    lane carved through it (composition rule 11: the pile is the object, the
    functional surface is carved, never the other way round). Flat and exact
    where dice ride; broken, asymmetric and sinking outside that."""
    z1 = LIP_FRONT - 0.24            # the lip plane has dropped under the felt
    verts, faces = [], []
    rows = []
    for s in range(SHARD_STEPS):
        z = SHARD_Z0 + (z1 - SHARD_Z0) * s / (SHARD_STEPS - 1)
        base = lane_y(z) + SHARD_PROUD
        taper = smoothstep(z, 0.1, 2.9)
        # ASYMMETRY ON PURPOSE: a shoulder on the left, a low broken lip on the
        # right. Two equal shoulders read as a moulded tray — the bookend trap
        # from the venue skill, one scale down.
        lo = (0.30 + 0.14 * h01(s, 9)) * (1.0 - taper)
        ro = (0.09 + 0.10 * h01(s, 11)) * (1.0 - taper)
        wl = 0.30 - 0.16 * taper
        wr = 0.26 - 0.14 * taper
        row = []
        pts = ((-SHARD_FLAT_HW - wl - 0.30, -0.05),
               (-SHARD_FLAT_HW - wl, base + lo),
               (-SHARD_FLAT_HW, base), (0.0, base), (SHARD_FLAT_HW, base),
               (SHARD_FLAT_HW + wr, base + ro),
               (SHARD_FLAT_HW + wr + 0.26, -0.05))
        for j, (x, y) in enumerate(pts):
            xj = x + (0.0 if abs(x) <= SHARD_FLAT_HW + 1e-6
                      else 0.10 * (h01(s * 17 + j, 13) - 0.5))
            row.append((xj, y, z))
        rows.append(row)
    n = len(rows[0])
    for row in rows:
        for x, y, z in row:
            verts.append(tuple(F.spec_to_blender(x, y, z)))
    off = len(verts)
    for row in rows:
        for x, _y, z in row:
            verts.append(tuple(F.spec_to_blender(x, SHARD_FLOOR, z)))
    for s in range(SHARD_STEPS - 1):
        a, b = s * n, (s + 1) * n
        for j in range(n - 1):
            faces.append((a + j, a + j + 1, b + j + 1, b + j))
            faces.append((off + a + j + 1, off + a + j,
                          off + b + j, off + b + j + 1))
        faces.append((a, b, off + b, off + a))
        faces.append((a + n - 1, off + a + n - 1, off + b + n - 1, b + n - 1))
    faces.append(tuple(range(n)) + tuple(range(off + n - 1, off - 1, -1)))
    last = (SHARD_STEPS - 1) * n
    faces.append(tuple(range(last + n - 1, last - 1, -1))
                 + tuple(range(off + last, off + last + n)))
    ob = F.obj_from_pydata("towerSkinNullShard", verts, faces)
    F.recalc_normals(ob)
    return ob


def box(name, x0, x1, y0, y1, z0, z1):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4),
         (2, 3, 7, 6), (1, 2, 6, 5), (0, 3, 7, 4)]
    ob = F.obj_from_pydata(name, [tuple(F.spec_to_blender(*p)) for p in v], f)
    F.recalc_normals(ob)
    return ob


# --------------------------------------------------------------------------
# colour
# --------------------------------------------------------------------------

def in_door(x, y, z, pad=0.02):
    return (abs(x) <= DOOR_HW + pad and DOOR_Y0 - pad <= y <= DOOR_Y1 + pad
            and DOOR_Z0 - pad <= z <= DOOR_Z1 + pad)


def violet_shift(c, t):
    """Push a colour toward the house accent WITHOUT lifting its value.

    Lerping to #43265b was round 3's quiet mistake: the accent is linear
    (0.056, 0.019, 0.105) and the stone is (0.018, 0.017, 0.023), so every
    "tint" was three times brighter than the thing it tinted and the whole
    lower half of the tower came out mauve. Scale the channels, then put the
    luminance back."""
    lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    out = (c[0] * (1.0 + 0.30 * t), c[1] * (1.0 - 0.34 * t), c[2] * (1.0 + 1.05 * t))
    l2 = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]
    k = (lum / l2) if l2 > 1e-9 else 1.0
    return tuple(v * k for v in out)


def burn(t):
    """How much witchlight a cut edge carries, 0..1 -> a colour to add."""
    return tuple(c * BURN * max(0.0, min(1.0, t)) for c in WITCH)


def facet_of(phi):
    f = int(math.floor((phi % (2.0 * math.pi)) / (2.0 * math.pi / NF)))
    return f % NF


def grain(f, y):
    """Per-facet value, drifting slowly up the stone. THE GRAIN — keyed off
    WHICH facet and WHICH band, never off a running counter."""
    return 0.84 + 0.34 * h01(f * 71, 2) + 0.12 * (h01(f, int(y * 1.1) + 3) - 0.5)


def stone_at(x, y, z, r_face):
    """The skin's colour at a point: facet value, fissure shadow, violet in
    the shade it never gets out of."""
    phi = phi_of(x, z)
    f = facet_of(phi)
    c = tuple(v * grain(f, y) for v in STONE)
    # how far into the groove this point sits — the fissures are the grain you
    # can see from the far side of the table
    depth = max(0.0, r_face - radius_of(x, z))
    c = lerp3(c, FISSURE, smoothstep(depth, 0.015, GROOVE_D * 0.85))
    c = lerp3(ARRIS, c, smoothstep(depth, -0.005, 0.030))
    return violet_shift(c, 0.55 * (1.0 - smoothstep(y, 0.4, 5.2)))


def paint_mass(_poly, co):
    x, y, z = co.x, co.z, -co.y
    r = radius_of(x, z)
    top = cleave_y(x, z)
    if y > top - 0.03:                            # the cleave face
        edge = smoothstep(bore_r(y) + 0.13 - r, 0.0, 0.13)
        return tuple(a + b for a, b in zip(FRACTURE, burn(edge)))
    if in_door(x, y, z) and r < facet_r(facet_of(phi_of(x, z))) - 0.05:
        lit = smoothstep(z, DOOR_Z0, 0.0)         # the doorway's reveal
        c = lerp3(BORE_DARK, STONE, 0.30 + 0.50 * lit)
        return tuple(a + b for a, b in zip(
            c, burn(smoothstep(y, DOOR_Y1 - 0.20, DOOR_Y1))))
    if r < bore_r(y) + 0.05:                      # the hole
        return violet_shift(BORE_DARK, 0.30 * smoothstep(y, 8.6, top))
    return stone_at(x, y, z, facet_r(facet_of(phi_of(x, z))))


def paint_splinters(_poly, co):
    x, y, z = co.x, co.z, -co.y
    f = facet_of(phi_of(x, z))
    top = max(t for ff, t in SPLINTERS if ff == f) if any(
        ff == f for ff, _t in SPLINTERS) else 12.0
    c = stone_at(x, y, z, facet_r(f) + 0.03)
    c = lerp3(c, FRACTURE, smoothstep(y - top, -0.12, 0.0))
    return tuple(a + b for a, b in zip(c, burn(smoothstep(y - top, -0.55, -0.05))))


def paint_shard(_poly, co):
    x, y, z = co.x, co.z, -co.y
    over = y - lane_y(z)
    c = lerp3(STONE, FISSURE, 0.58)               # engine furniture reads DOWN:
    #                                               the lane must never
    #                                               out-value the dice on it
    c = tuple(v * (0.86 + 0.30 * h01(int(z * 5), int(x * 4))) for v in c)
    c = lerp3(c, FRACTURE, 0.45 * smoothstep(over, 0.06, 0.28))
    c = violet_shift(c, 0.42)
    return tuple(a + b for a, b in zip(c, burn(smoothstep(-z, 0.0, 0.26))))


# --------------------------------------------------------------------------
# MEASUREMENT — every claim re-derived from the BUILT triangles
# --------------------------------------------------------------------------
RAN = []


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


def assert_approach_clear(objs):
    """Nothing leans into the drop, from above the rim down to the vanish."""
    import numpy as np
    tris = tri_array(objs)
    y_top = PORTAL_IN["rimY"] + 2.5
    bad = []
    for px, pz in TG.disc_probes(PORTAL_IN["x"], PORTAL_IN["z"], PORTAL_IN["clearR"]):
        t = ray_hit(tris, np.array([px, y_top, pz]), np.array([0.0, -1.0, 0.0]),
                    y_top - DESPAWN_Y)
        if t is not None:
            bad.append((px, pz, y_top - t))
    if bad:
        raise RuntimeError(
            f"approach column blocked at {len(bad)}/25 probes "
            f"{[(round(b[0], 2), round(b[1], 2), round(b[2], 2)) for b in bad]}"
            f", highest y {max(b[2] for b in bad):.2f} — stone is inside the "
            f"drop; check BORE_R_HI {BORE_R_HI} and the splinters' inner face against "
            f"clearR {PORTAL_IN['clearR']}")
    print("[null] approach column 25/25 clear")
    RAN.append("assert_approach_clear")


def assert_throat_clear(objs):
    """The doorway is a hole, ramp-aware, on check.py's own start line."""
    import numpy as np
    tris = tri_array(objs)
    hw = TG.THROAT_MARGIN * PORTAL_OUT["w"] / 2.0
    y0 = PORTAL_OUT["sillY"] + PORTAL_OUT["clearH"] * (1 - TG.THROAT_MARGIN) / 2
    bad = []
    for px, py in TG.rect_probes(PORTAL_OUT["x"], y0, 2 * hw,
                                 PORTAL_OUT["clearH"] * TG.THROAT_MARGIN):
        pz = TG.exit_ray_start_z(py, PORTAL_OUT["sillY"], 0.0, SPEC)
        t = ray_hit(tris, np.array([px, py, pz]), np.array([0.0, 0.0, 1.0]),
                    TG.EXIT_FRONT - pz)
        if t is not None:
            bad.append((px, py, pz + t))
    if bad:
        raise RuntimeError(
            f"exit throat blocked at {len(bad)}/25 probes, first at x "
            f"{bad[0][0]:.2f} y {bad[0][1]:.2f} z {bad[0][2]:.2f} — widen the "
            f"door cut (DOOR_HW {DOOR_HW}, DOOR_Y1 {DOOR_Y1}) or drop the "
            f"shard (SHARD_PROUD {SHARD_PROUD})")
    print("[null] exit throat 25/25 clear")
    RAN.append("assert_throat_clear")


def assert_occluded(objs):
    fails, counts = TG.occlusion_failures(tri_array(objs), SPEC, 0.0)
    if fails:
        raise RuntimeError(fails[0].replace("; ", "\n       "))
    print(f"[null] occlusion {counts['cowl']}/{counts['cowl']} cowl and "
          f"{counts['shaft']}/{counts['shaft']} shaft, at all six shipped eyes")
    RAN.append("assert_occluded")


def assert_no_hole_below_the_sill(objs):
    fails, tested, leaks = TG.hole_below_sill_failures(tri_array(objs), SPEC, 0.0)
    if fails:
        raise RuntimeError(fails[0])
    print(f"[null] no sight line into the hollow below the sill "
          f"({leaks}/{tested} of the flank rays)")
    RAN.append("assert_no_hole_below_the_sill")


def assert_lane_is_clad(objs):
    """The whole reason this tower clads rather than declares bare."""
    fails, info = TG.lane_failures(tri_array(objs), SPEC)
    if fails:
        raise RuntimeError(fails[0])
    ramp, lip = info["clad"]["ramp"], info["clad"]["lip"]
    print(f"[null] lane clear; ramp clad {ramp[0]}/{ramp[1]}, "
          f"lip clad {lip[0]}/{lip[1]}, x {info['lane_x']} z {info['lane_z']}")
    RAN.append("assert_lane_is_clad")


def assert_the_mass_carries_the_dark(objs):
    """THE OCCLUDER OF RECORD, measured rather than asserted.

    Two claims the header makes, both about the cleave, and both of which a
    taller splinter would hide until somebody moved one:

      (a) the sight line from every shipped eye to the TOP cowl sample is
          stopped by the MASS — not by a splinter, not by the rim band; and
      (b) a falling die is still visible below the declared mouth, so the
          vanish happens inside a building rather than in mid-air.
    """
    import numpy as np
    tris = tri_array([ob for ob in objs if ob.name == "towerSkinNullMass"])
    ct = DESPAWN_Y + TG.ENGINE_MIRROR["dieR"]
    worst = (-1e9, None)
    for eid, e in TG.shipped_eyes():
        if e[1] <= ct:
            continue                     # this eye looks UP; the wall has it
        f = e[2] / (e[2] - PORTAL_IN["z"])
        y_cross = e[1] + (ct - e[1]) * f
        if y_cross > worst[0]:
            worst = (y_cross, eid)
        d = np.array([PORTAL_IN["x"] - e[0], ct - e[1], PORTAL_IN["z"] - e[2]])
        if ray_hit(tris, np.array(e), d, 0.999) is None:
            raise RuntimeError(
                f"the MASS does not hide the top cowl sample from {eid}: the "
                f"ray reaches y {ct:.2f} on the bore axis unobstructed. Raise "
                f"CLEAVE_LO (now {CLEAVE_LO}) — do not fix this with a "
                f"splinter.")
    front = cleave_y(0.0, 0.0)
    if worst[0] > front:
        raise RuntimeError(f"the cleave's front lip {front:.2f} is under the "
                           f"binding sight line {worst[0]:.2f} from {worst[1]}")
    eid, e = max(TG.shipped_eyes(), key=lambda p: p[1][1])
    seen_to = e[1] + (front - e[1]) * (e[2] - PORTAL_IN["z"]) / e[2]
    if seen_to < PORTAL_IN["rimY"]:
        raise RuntimeError(
            f"the cleave hides the drop above the declared mouth: from {eid} "
            f"a die is lost at y {seen_to:.2f}, mouth {PORTAL_IN['rimY']}")
    print(f"[null] the mass carries the dark: binding sight line crosses at y "
          f"{worst[0]:.2f} ({worst[1]}) under a front lip at {front:.2f}; a "
          f"die stays visible to y {seen_to:.2f}, mouth {PORTAL_IN['rimY']}")
    RAN.append("assert_the_mass_carries_the_dark")


def assert_the_crown_is_a_cleave(_objs):
    """The silhouette law, on the crown: one cut with a real fall across it,
    broken by splinters that clear it — not a level ring, not a fringe."""
    tops = [cleave_y(x, z) for x, z in RING]
    lo, hi = min(tops), max(tops)
    if hi - lo < 1.4:
        raise RuntimeError(f"the cleave is level: it falls {hi - lo:.2f}")
    flat = sum(1 for t in tops if abs(t - CLEAVE_LO) < 1e-6
               or abs(t - CLEAVE_HI) < 1e-6) / len(tops)
    if flat > 0.45:
        raise RuntimeError(f"{flat:.0%} of the crown is on a clamp, not on the "
                           f"cut — the planes have run out of range")
    # A splinter counts if it clears the cut WHERE IT STANDS. Measuring
    # against the crown's high corner instead was this gate's own first
    # version, and it asked four splinters on the low side to out-top the tall
    # side — a wall, which is the thing the cleave exists to not be.
    over = [f for f, t in SPLINTERS if t > facet_cleave(f) + 0.35]
    if len(over) < 3:
        raise RuntimeError(f"only {len(over)} of {len(SPLINTERS)} splinters "
                           f"stand 0.35 clear of the cut beside them — the "
                           f"crown is one line")
    print(f"[null] the crown is a cleave: it falls {hi - lo:.2f} "
          f"({hi:.2f} -> {lo:.2f}), {flat:.0%} clamped, {len(over)} splinters "
          f"standing over it at facets {over}")
    RAN.append("assert_the_crown_is_a_cleave")


def assert_mesh_envelopes(objs):
    """The socket, per mesh node, exactly as check.py classifies it."""
    for ob in objs:
        lo, hi = F.world_bounds([ob])
        a = (min(lo.x, hi.x), min(lo.z, hi.z), -max(lo.y, hi.y))
        b = (max(lo.x, hi.x), max(lo.z, hi.z), -min(lo.y, hi.y))
        name = ob.name
        if max(abs(a[0]), abs(b[0])) > XLIM + 1e-6:
            raise RuntimeError(f"{name}: |x| {max(abs(a[0]), abs(b[0])):.3f} > {XLIM}")
        if b[1] > CROWN_MAX + 1e-6:
            raise RuntimeError(f"{name}: top {b[1]:.3f} > {CROWN_MAX}")
        if name == "towerSkinNullShard":
            if a[1] > -0.5 or b[2] > 3.85 or b[1] > 3.4:
                raise RuntimeError(
                    f"{name}: not a CLADDING box — needs min.y <= -0.5 (is "
                    f"{a[1]:.3f}), max.z <= 3.85 (is {b[2]:.3f}), max.y <= 3.4")
        elif a[2] < ZBACK or b[2] > ZFRONT + 1e-6 or a[1] < -0.145:
            raise RuntimeError(
                f"{name}: not IN-SOCKET — z [{a[2]:.3f},{b[2]:.3f}] vs "
                f"[{ZBACK},{ZFRONT}], min.y {a[1]:.3f}")
        print(f"[null] envelope ok {name}: x±{max(abs(a[0]), abs(b[0])):.2f} "
              f"y {a[1]:.2f}..{b[1]:.2f} z {a[2]:.2f}..{b[2]:.2f}")
    RAN.append("assert_mesh_envelopes")


def assert_every_gate_ran():
    want = {"assert_approach_clear", "assert_throat_clear", "assert_occluded",
            "assert_no_hole_below_the_sill", "assert_lane_is_clad",
            "assert_the_mass_carries_the_dark", "assert_the_crown_is_a_cleave",
            "assert_mesh_envelopes"}
    missing = want - set(RAN)
    if missing:
        raise RuntimeError(f"gates declared but never invoked: {sorted(missing)}")
    print(f"[null] gate manifest {len(want)}/{len(want)} invoked")


# --------------------------------------------------------------------------

def main():
    F.reset()

    mass = build_mass()
    splinters = build_splinters()
    F.boolean(mass, box("doorCut", -DOOR_HW, DOOR_HW, DOOR_Y0, DOOR_Y1,
                        DOOR_Z0, DOOR_Z1), op="DIFFERENCE")
    F.boolean(splinters, box("doorCut2", -DOOR_HW, DOOR_HW, DOOR_Y0, DOOR_Y1,
                             DOOR_Z0, DOOR_Z1), op="DIFFERENCE")
    shard = build_shard()
    meshes = [mass, splinters, shard]

    for ob in meshes:
        F.canonicalize(ob)
        F.triangulate(ob)
        nm, vol = F.manifold_report(ob)
        if nm:
            raise RuntimeError(f"{ob.name}: {nm} non-manifold edges")
        print(f"[null] manifold ok {ob.name}: volume {vol:.2f}")

    # paint AFTER the last bmesh round-trip (the fae_arch deviation)
    F.paint_corners(mass, "Col", paint_mass)
    F.single_material(mass, F.vertex_color_material(
        "nullMass", "Col", roughness=0.90, specular_level=0.24))
    F.paint_corners(splinters, "Col", paint_splinters)
    F.single_material(splinters, F.vertex_color_material(
        "nullSplinters", "Col", roughness=0.88, specular_level=0.30))
    F.paint_corners(shard, "Col", paint_shard)
    F.single_material(shard, F.vertex_color_material(
        "nullShard", "Col", roughness=0.90, specular_level=0.15))

    assert_approach_clear(meshes)
    assert_throat_clear(meshes)
    assert_occluded(meshes)
    assert_no_hole_below_the_sill(meshes)
    assert_lane_is_clad(meshes)
    assert_the_mass_carries_the_dark(meshes)
    assert_the_crown_is_a_cleave(meshes)
    assert_mesh_envelopes(meshes)
    assert_every_gate_ran()

    pin, pout = F.tower_portals(PORTAL_IN, PORTAL_OUT)
    # WHERE THE LIGHT GOES, said once, by the recipe, from the mesh. The house
    # trait is a lit focal light; this house has no fire, so the ember is the
    # unmaking itself — witchlight at the doorway's upper corner, raking down
    # the reveal and onto the shard a die arrives on.
    pad = F.model_marker("doorPad", (-DOOR_HW + 0.55, DOOR_Y1 - 0.55, -0.34),
                         {"nx": 0.0, "ny": 0.0, "nz": 1.0})

    F.assert_budget(meshes, BUDGET)
    F.report_bounds(meshes, "nullstone")
    # NO sit_on_ground: this model's frame IS the contract. y = 0 is the felt
    # and z = 0 is the socket plane.
    F.export_glb("nullstone", meshes + [pin, pout, pad], vertex_colors=True)


main()
