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

...THROUGH THE WOUND. Round 3 found the other half of that sentence to be
false, and the engine found it, not a render: over the CROWN there is no
solid to see, because the tear's low point is the declared rimY and the
engine's cowl band reaches 2.0 above it. So a fourth mesh — the CURTAIN —
carries the liner up past the tear, a band around the bore and never a lid.
It is the one part of this model that is a separate piece of geometry, and
the reason is written where it is built.

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

ROUGHNESS IS LOAD-BEARING — see bole_material. Blender's Principled ships
0.5 and forge.vertex_color_material never touches it, so the first three
bakes wore a 4% specular haze that WAS the value at these albedos: the
interior would not go dark at any paint value, and the trunk read as
smooth pale soap. Every material judgement made before that was found is
worthless. Rotten wood is 0.96.

AND ROUGHNESS WAS ONLY HALF OF IT (round 2). Roughness spreads the
specular lobe; it does not remove the specular. F0 stays 0.04 whatever you
do, and 0.04 of a 2.2 key is ~0.07 sRGB that arrives REGARDLESS OF ALBEDO
— which is why the deepest part of the cavity was still glowing after the
liner had been taken down 5x and then another 2.75x. The tell was colour:
the pixel measured (19, 17, 15), warm, in the ratio of the key's own
0xfff2dd, on a surface painted (0.00017, 0.00023, 0.00031), cool and
essentially black. Diffuse cannot make that. Specular IOR Level 0.10 (F0
0.008, exported as KHR_materials_specular) took it to 0.016, and cost the
LIT exterior 2-4% — measured over the model's pixels, front34 / restingeye
/ side.

WHAT ROUND 2 CHANGED, all five items from the review gate:
  R1 the roots were chosen by hash rank and every one of them landed at
     |phi| >= 88 deg — the whole front-facing arc, the only part a player
     sees, was bare cone (radius climbing 2.76 -> 3.28 with NO local
     minimum). Now chosen by HEADING, with feet that are compact, low,
     budgeted against the mat, and separated by valleys that are CUT.
  R2 the wound's bottom corners were square out to |x| 2.93; a fillet from
     |phi| 1.197 (the exit rays never reach past 1.155) plus a jamb swell
     and a sill apron give the lower front real mass.
  R3 the liner is 5x darker, multiplied down a further 25x with depth, and
     the specular that was actually lighting it is gone.
  R4 shelves read the LOCAL surface and refuse to place where they cannot
     bite (2 of 12 refused); the tongue's edge no longer overhangs the
     crevice that was frame 11's black rectangle.
  R5 the tip's flat facet was never the summit — r_out splayed 0.16 above
     the rim and r_in did not, so the rim strip grew back to 0.20 at the
     exact height wall_at was tapering it to 0.02. Both surfaces splay now,
     and both noise fields die into the tear.

WHAT ROUND 3 CHANGED, and it is all fit and occlusion — the round-2 look
(wound, roots, crown character, palettes, specular interior) is ACCEPTED and
untouched. The app integration ran the proof battery and the ENGINE refused
the bake that every gate here had passed:

  F1 the crown was 12.815 and the audit reads max.y' = max.y + max.x*sin
     (0.45 deg of lean), so the socket's 12.5 ceiling was 0.325 away. The
     tallest spire comes down to 2.80 (crown 12.326) and |x| to 3.13 by the
     same arithmetic — one budget, spent height-first. The ground line pays
     0.10 of root spread for it: 6.46 wide becomes 6.26, stance 1.97:1.
  F2 the SHELL is one mesh box and VENUE GROUNDS admits z- and y- overruns
     and nothing else. TOE_CREEP to 0 (z +0.597 -> +0.220) and the buried
     row from -0.30 to -0.09 (min.y' -0.325 -> -0.115, class floor -0.15).
  F3 the TONGUE fell in the dead band between FOOT DIP (min.y > -0.15) and
     CLADDING (min.y < -0.5) at -0.373 and came back UNCLASSIFIED. Its
     skirt sinks to -0.62 and its nose comes back to 3.84, inside the lip
     collider it clads. Neither is visible: both are under the felt.
  F4 the COWL band leaked 354 of 594 rays. Its 99 samples per eye are DISCS
     ON THE BORE AXIS at y 8.55 / 9.90 / 11.25, and no torn crown can hide
     a point floating 1.85 above its own rim — so the liner is carried up
     as a near-black CURTAIN to 12.05, the way the old JS shell's lining
     did. Height measured off the binding ray (wide.eyeFull to the deepest,
     highest sample: it crosses at 11.779), not off the brief's 11.5.

WHAT ROUND 4 CHANGED — one painter, no geometry. The app's look pass called
the delivery tongue a near-white slab, brighter than the trunk it comes out
of, which inverts the tertiary-field law. It is the only thing round 4
touches: make_tongue_paint drops the plate to 0.39 of its value and pulls it
warm and dirty with the palette's own punky rot, and the lit-fiber term
doubles so the grain survives the drop. Proved by measuring RENDERED pixels
against the trunk's bark band rather than by reading the paint (see
TONGUE_GAIN), and proved to be colour-only by the `set` digest, which must
still be 76d898635b069ed2.

MEASURED, NOT ASSUMED. Every dimensional claim above is re-derived from the
built vertices at bake time: assert_throat_clear and assert_approach_clear
cast rays at the finished triangles (not at the constants that generated
them), assert_envelope reads the real bounds, assert_rim_is_low proves the
declared rimY is the actual low point of the crown and refuses a crown past
CROWN_MAX, and report_form refuses a stance outside 1.7-2.25:1 and a crown
whose tallest spire is centred. A gate that reads constants only restates
its own assumptions.

AND SINCE ROUND 3, THE ENGINE'S OWN TWO PROOFS RUN HERE TOO, because both
of the things it caught were invisible to check.py: assert_mesh_envelopes
puts every mesh's WORLD box through towerModelAudit's corner arithmetic
against the class that has to grant it, and assert_cowl_occluded fires the
full occlusion grid — 6 shipped eyes x 198 samples — at the built
triangles. A browser found these in thirty minutes; the bake finds them in
eight seconds.

Measured at the last bake: 7828 tris (curtain 228), watertight, 25/25 on
both throats and the approach column, cowl 99/99 and shaft 99/99 at all six
eyes, x within +-3.13, tallest spire 12.31, curtain top 12.03, stance
1.97:1, 6 roots, 5 spires, 10 shelf brackets placed and 2 refused, both
palettes byte-identical in geometry (shared `set` digest 76d898635b069ed2,
schema v2) and different only in COLOR_0.

    tools/forge/bake.sh tools/forge/recipes/hollowbole.py \
        --tower --expect-colors --max-tris 8000
    # then gate the second variant by hand:
    ~/opt/dice-forge/venv/bin/python tools/forge/check.py \
        tools/forge/out/hollowbole_foxfire.glb --tower --expect-colors --max-tris 8000
    # and the interior value order, on the renders (hollowbole_look.js
    # shoots the named angles; 19-probe is the frame this reads):
    ~/opt/dice-forge/venv/bin/python tools/forge/recipes/hollowbole_probe.py \
        tools/forge/out/hollowbole_moonrise.glb \
        tools/forge/shots/final-moonrise-19-probe.png --assert
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

# THE ENGINE ENVELOPE, AND THE LEVER ARM THAT PUTS THE MODEL INSIDE IT (r3).
#
# The socket is |x| <= 3.25, y in [0, 12.5], z in [z0-5.25, z0+0.25], and the
# audit measures a mesh's WORLD box after the skin group's 0.45 deg lean about
# z (sin 0.00785). three's Box3.setFromObject rotates the local AABB's CORNERS,
# so the penalty is the box's, not any vertex's:
#
#     min.x' = min.x*cos - max.y*sin      max.y' = max.y*cos + max.x*sin
#     min.y' = min.y*cos + min.x*sin      z' = z
#
# Round 2 measured x +-3.23 with a 12.80 crown and the audit read min.x' as
# -3.33: 0.08 outside the wall, on a corner the model never occupies. The two
# numbers are therefore ONE budget, and it is spent height-first because the
# crown is what a player sees:
#
#     crown 12.35 -> |x| <= 3.25 - 12.35*0.00785 = 3.153, taken to 3.13
#     |x| 3.13    -> max.y' = 12.35 + 0.025 = 12.375  (socket 12.5)
#
# The ground-line root spread pays the 0.10: it was 6.46 wide and is 6.26.
# Keeping 3.23 was available only by moving the feet into the cladding mesh,
# and the feet are lobes in the SAME radius field as the fiber ridges — the
# one thing this model refuses to paste on. Measured cost at the felt: the
# outermost toe crest moves inboard by 0.10 on a 3.1 radius, 3%.
SOCKET_X = 3.25
SOCKET_Y1 = 12.5
TILT_SIN = 0.00785                 # sin 0.45 deg, the engine's lean about z
XLIM = 3.13                        # was 3.23; see the arithmetic above
CROWN_MAX = 12.35                  # tallest spire ceiling (VENUE GROUNDS)
SHELL_FLOOR = -0.09                # the shell's buried row. -0.30 read as
#                                    min.y' -0.325 and the class needs > -0.15;
#                                    -0.09 - 3.13*0.00785 = -0.115. Everything
#                                    under y 0 is felt-covered either way.
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
FRONT_KEEP = 0.62                  # no buttress FIN inside |phi| < this: a
#                                    fin on the front face would be a fin in
#                                    the doorway, and the wound would saw it
#                                    in half
FRONT_KEEP_TOE = 0.66              # ...but a TOE lives entirely UNDER the
#                                    threshold (it dies at y 0.78, and the
#                                    exit gate's floor is 1.1125), so it may
#                                    come far round the front and run out
#                                    onto the felt beside the tongue. Round 1
#                                    fined and toed off the same fade and so
#                                    had neither, anywhere the player looks.

# THE SIX HEADINGS THE GROUND LINE NEEDS.
#
# Round 1 chose its roots by hash rank among every ridge past 49 degrees. The
# hash drew 1, 2, 3, 4, 5, 6 — headings +92, +124, +160, -162, -124, -88 —
# so every root it built sat on the flanks or the BACK, and the whole
# front-facing arc, which is the only part a player at the table ever sees,
# was left as bare cone. Measured off that bake: the outer radius from -90 to
# +90 climbed from 2.76 to 3.28 monotonically, with no local minimum
# anywhere. That is not a stump with roots; that is a cylinder.
#
# So the set is chosen by COVERAGE — two front diagonals, two flanks, two on
# the back quarters — and the hash is demoted to jittering reach and width.
# The targets are deliberately UNEVEN (the pair that lands on the back is
# -162/+124, not a mirror) because a mirrored root plan reads as a turned
# table leg no matter how ragged the surface on top of it is.
ROOT_HEADINGS = (-1.00, +0.92, -1.55, +1.75, -2.75, +2.20)

# How far in front of the socket plane a TOE may creep. ZERO since r3, and
# the number that made it cheap is a measurement rather than a preference.
#
# The shell has to classify as VENUE GROUNDS — "behind the socket plane,
# spending glade" — and that class admits z- and y- overruns and NOTHING
# forward. Round 2's creep put the shell's box at z +0.597, so the whole mesh
# fell through to UNCLASSIFIED and the fit went red.
#
# What 0.85 of creep was actually buying, measured over the ring at each row:
# at y -0.30 it reached z 0.597 (that row is under the felt), at y 0.02 it
# reached 0.375 and at y 0.14 it reached 0.308 — so above the felt the creep
# was worth at most 0.16 of forward wood, over 28 deg of arc, in the two
# front-diagonal toes. At the resting eye that is under two pixels. The
# tongue — cladding, and allowed forward to the lip — carries the wood in
# front of the socket plane from here on.
TOE_CREEP = 0.0


def build_ridges():
    ridges = []
    acc = 0.42
    for i in range(N_RIDGE):
        acc += (2.0 * math.pi / N_RIDGE) * (0.66 + 0.68 * h01(i, 11))
        th = ((acc + math.pi) % (2.0 * math.pi)) - math.pi
        ff = smoothstep(abs(th), FRONT_KEEP, 0.98)
        ridges.append({
            "th": th,
            "w": 0.125 + 0.095 * h01(i, 21),      # crest half-width, rad
            "butt": (0.10 + 0.12 * h01(i, 31)) * ff,
            # mid-height relief. 0.045-0.12 rendered as a smooth cone: on a
            # 2.5 radius that is under 5%, and smooth shading eats it. The
            # striation has to be in the SILHOUETTE to be striation.
            "fib": 0.095 + 0.130 * h01(i, 61),
            "lean": (h01(i, 71) - 0.5) * 0.22,    # grain twist with height
            "spire": 0.0,
            "root": False,
            "toe_len": 0.0,        # how far the foot runs out, world radius
            "toe_w": 0.0,          # its angular half-width, rad
            "toe_off": 0.0,        # the foot wanders off its own fin's crest
        })
    # SIX ridges become heavy buttress roots, chosen by heading (above).
    used = set()
    for rank, want in enumerate(ROOT_HEADINGS):
        i = min((j for j in range(N_RIDGE) if j not in used),
                key=lambda j: angdist(ridges[j]["th"], want))
        used.add(i)
        R = ridges[i]
        th = R["th"]
        # A root reaches as far as the MAT lets it. x is capped at 3.23 and a
        # buttress on the flank runs out of x long before one on the diagonal
        # does, so each root's reach is budgeted from its OWN heading rather
        # than clamped flat against the wall later — which is also, for free,
        # part of the asymmetry the reference has.
        # The fiber ridge rides on top of everything and is NOT free: round 2
        # forgot it in the first budget and every front-diagonal foot came
        # out 0.20 over the wall.
        head = base(0.0) + R["fib"] + 0.06
        room_x = XLIM / max(0.30, abs(math.sin(th))) - head
        cz = math.cos(th)
        room_z = (((ZFRONT + TOE_CREEP - AXIS_Z) / cz - head)
                  if cz > 0.25 else 9.9)
        # ONE BUDGET FOR THE WHOLE ROOT, and it is the mat that sets it.
        # Round 2's first cut budgeted the foot and the web separately, both
        # peaking on the felt, and their sum overshot XLIM: the clamp then
        # planed the pair into a flat vertical wall over ten degrees of arc
        # at each front diagonal — machined, not grown. flare() now holds the
        # web off the ground so the two pieces of wood take turns, and grip
        # is the single number they share.
        grip = max(0.34, min(1.52, min(room_x, room_z) - 0.11))
        R["root"] = True
        R["butt"] = min(0.95, grip * (0.82 + 0.22 * h01(i, 139))
                        * (1.0 - 0.06 * rank)
                        * smoothstep(abs(th), FRONT_KEEP, 0.98))
        R["w"] = max(R["w"], 0.16)
        # A TOE IS NARROW. Round 1's foot was a gaussian 2.3x the fin's
        # width: at the tightest root spacing here (31 degrees) two such
        # feet still stood at half strength where they met, so six feet
        # summed into one continuous skirt. Compact support at 0.23-0.32 rad
        # puts a true zero between neighbours — and 0.23 rad is still 5.3
        # columns at NPHI 72, so the foot is a mass and not a spike.
        R["toe_len"] = (grip * (0.86 + 0.19 * h01(i, 131))
                        * smoothstep(abs(th), FRONT_KEEP_TOE, 0.94))
        R["toe_w"] = 0.23 + 0.09 * h01(i, 133)
        R["toe_off"] = (h01(i, 137) - 0.5) * 0.26
    # THE CROWN TEARS ALONG THE GRAIN. Five ridges keep going past the rim;
    # the tallest is forced onto the ridge nearest phi = -1.05 rad so it is
    # plainly off-centre in the frame (and never on the seam).
    # FOUR spires, not five, and a wider height spread. Five broad blades
    # evenly spread around the rim is a tiara; four uneven ones with long
    # stretches of broken rim between them is a stump.
    order = sorted((i for i in range(N_RIDGE) if abs(ridges[i]["th"]) > 0.80),
                   key=lambda i: -h01(i, 41))[:4]
    # Ranked heights, not sampled ones: hashing gave two of the four within
    # 0.2 of each other and a matched pair reads as symmetry, which is the
    # one thing a broken crown must not have.
    for rank, i in enumerate(order):
        ridges[i]["spire"] = (2.35, 1.55, 1.05, 0.72)[rank]
    tall = min(range(N_RIDGE), key=lambda i: angdist(ridges[i]["th"], -1.05))
    # 2.80, NOT 3.30 — the socket's ceiling, not a taste call. VENUE GROUNDS
    # requires max.y' <= 12.5 and the audit's box adds max.x*sin to it, so the
    # tallest tear may reach CROWN_MAX 12.35 and no further. Measured on the
    # field: 3.30 tops out at 12.815 (0.325 outside), 2.80 at 12.326. The
    # ladder under it is untouched — 12.33 / 11.81 / 11.11 / 10.63 / 10.11 —
    # so the tallest is still 0.52 clear of the next and still at -55 deg.
    ridges[tall]["spire"] = 2.80
    ridges[tall]["w"] = max(ridges[tall]["w"], 0.17)
    ridges[tall]["tallest"] = True
    return ridges


def crest_at(R, y):
    return R["th"] + R["lean"] * (y / 9.0)


def crest(d, w):
    return math.exp(-0.5 * (d / w) ** 2) ** 0.72      # furrows, not ripples


def blade(d, w):
    """Compact, SHARP support — the spire profile.

    A gaussian raised to 0.72 is a lovely furrow and a terrible splinter:
    the first crown came out as five rounded merlons, a castle in a tulip,
    because the same broad profile was carrying the spires. This one has
    finite support and a hard shoulder, so a spire is a blade that ends.
    """
    if d >= w:
        return 0.0
    return (1.0 - (d / w) ** 2) ** 1.35


def flare(y):
    """Buttress WEB reach with height — and it deliberately does NOT peak on
    the ground.

    The web and the foot are two different pieces of wood and they were
    fighting over the same radius: both at full strength on the felt, their
    sum ran past the mat's x limit and the clamp planed the pair flat. Real
    buttresses do not look like that either — the foot is the whole story
    where it touches the soil, and the web takes over as the foot dies and
    climbs to the waist. The shoulder at 0.05-0.62 is where they hand off,
    and it is what lets each be budgeted against XLIM on its own.
    """
    return smoothstep(y, 0.05, 0.62) * max(0.0, 1.0 - y / 3.30) ** 1.55


def toe_h(y):
    """The FOOT, and it is a different animal from the fin.

    Round 1 faded the foot over 1.15 units with a 1.35 power, which is the
    skirt of a cone: at y 0.6 it was still at half strength, so the mass it
    added was at the ANKLE, not on the ground, and the ground line itself
    barely moved. A buttress toe is a finger of wood LYING ON THE SOIL. It
    has to be low enough that the silhouette event happens where the model
    meets the felt, and it has to END — the shoulder at 0.78 is what lets the
    valley beside it be a valley.

    0.92 is also a clearance: the exit gate's floor is 1.1125, so no toe can
    ever be the thing that blocks the door. It was 0.78 until the first
    round-2 look — the feet were there and correct and simply too low to
    clear the delivery tongue's own shoulder, which stands at 0.5-1.0 across
    the whole front and hid them from the one camera that has to see them.
    """
    return max(0.0, 1.0 - y / 0.92) ** 0.85


# --------------------------------------------------------------------------
# THE FIELD
# --------------------------------------------------------------------------
# base(y): stocky. Heavy foot, a slight waist at ~3.2, a broad crown, and a
# narrowing only in the last two units where the spires taper. Height 12.5
# over a 6.4 root spread is 1.95:1 — the molar, not the chimney.

def base(y):
    # The BASE curve is deliberately slim at the foot. All of the spread
    # down there belongs to the buttress lobes: a fat base curve plus lobes
    # is a bucket with bumps, while a slim one plus strong lobes leaves deep
    # VALLEYS between the roots, and it is the valleys that read as roots.
    # MASS LIKE A MOLAR. The first profile ran 2.62 / 2.53 / 2.82 from foot
    # to crown — a 10% swing, which is a cylinder wearing a story. This one
    # swings 17%: a heavy foot, a real waist at 3.6, and a crown that flares
    # back out before the spires take over.
    return (2.42
            + 0.32 * math.exp(-y / 1.90)
            + 0.48 * smoothstep(y, 4.2, 9.0)
            - 0.20 * smoothstep(y, 10.2, 12.6))


def wall(y):
    """Wall thickness by height. Thick at the foot, thinner as it rises."""
    return (0.60
            - 0.16 * smoothstep(y, 0.9, 6.0)
            - 0.06 * smoothstep(y, 6.0, 9.4)
            - 0.20 * smoothstep(y, 9.4, 12.4))


def wall_at(phi, y):
    """Wall thickness AT A COLUMN — tapering to a knife edge at whatever
    height that column's own tear reaches.

    The first crown was a paper crown: every spire ended in a flat
    horizontal cap, because the rim strip between the outer and inner
    surfaces was a constant 0.12 wide all the way to the tip. Torn fiber
    does not end in a machined edge. Measuring the taper from the COLUMN'S
    OWN top rather than from absolute height gives every point of the tear
    — the tall blades and the low broken rim alike — an edge that thins out
    as it approaches its end.
    """
    return min(wall(y), 0.010 + 0.42 * max(0.0, y_top(phi) - y))


# Built here, not at its own definition: each root's strength is budgeted
# from base(0) and the mat's x limit, so the ridges cannot exist before the
# profile they are measured against.
RIDGES = build_ridges()
TALL = next((R for R in RIDGES if R.get("tallest")), None)
SPLIT_D = 0.80                     # how deep the tall tip's fray cuts
SPLIT_OFF = 0.075                  # rad off the crest — one column's worth
SPLIT_W = 0.115                    # rad; wide enough for a column to land in


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
        k = blade(angdist(phi, crest_at(R, 10.5)), R["w"] * 1.50)
        t = max(t, R["spire"] * k)
    # THE TALLEST TIP IS SPLIT.
    #
    # A blade profile has one smooth summit, and at NPHI 72 the columns fall
    # every 5 degrees: the tall spire's crest sits between two of them, both
    # 2.7 degrees off centre, both therefore at 0.971 of full height. Two
    # equal-height columns joined across the top IS the flat facet round 1
    # noted at the tip — it was never a shading artefact, it was the sampling
    # meeting a symmetric peak. Torn fiber ends in a fray, so a narrow nick
    # is taken out just to one side of the crest: the near column drops 0.78
    # and the far one does not, which turns one flat summit into two unequal
    # points with a notch between them. Three silhouette events where there
    # was one, and it costs no triangles.
    if TALL is not None:
        t -= SPLIT_D * blade(angdist(phi, crest_at(TALL, 10.5) + SPLIT_OFF),
                             SPLIT_W)
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


def valley(phi, y):
    """How much wood the soil takes back BETWEEN the feet.

    Compact feet are necessary and not sufficient: at base(0) = 2.74, six
    feet standing 1.0 proud still leave a ground line whose minimum is the
    trunk's own circle, and a circle with lumps on it is a circle. The
    valleys have to be CUT.

    Subtracted from the inner surface as well as the outer, for two reasons.
    The wall then keeps its thickness, so no valley can become the thin spot
    a boolean fails on. And it costs nothing to be honest: every valley lives
    under y 0.78 and the debris floor caps at 0.86, so no part of the liner
    this touches is ever visible.

    Gated to |phi| > 0.66 — the lower-front mass is R2's business and must
    not be hollowed out to make R1's valleys.
    """
    th_ = toe_h(y)
    if th_ <= 0.0:
        return 0.0
    tmax = 0.0
    for R in RIDGES:
        if not R["root"]:
            continue
        dt = angdist(phi, crest_at(R, y) + R["toe_off"])
        tmax = max(tmax, blade(dt, R["toe_w"] * 1.35))
    return 0.52 * th_ * (1.0 - tmax) * smoothstep(abs(phi), 0.66, 1.02)


def r_out(phi, y):
    r = base(y)
    fl = flare(y)
    for R in RIDGES:
        d = angdist(phi, crest_at(R, y))
        fib = R["fib"] * (1.0 - 0.55 * smoothstep(y, 7.5, 10.5))
        # THE WEB IS COMPACT, THE GRAIN IS NOT. A gaussian crest is the right
        # profile for a fiber furrow and the wrong one for a buttress: at the
        # tightest root spacing here (31 degrees) two gaussian webs still
        # stood at half strength where they met, which is how six buttresses
        # add up to one cone. The web gets blade()'s hard shoulder; the fiber
        # ridge keeps crest(), because a furrow that ends is a scar.
        r += R["butt"] * fl * blade(d, R["w"] * 1.75)
        r += fib * (0.35 + 0.65 * (1.0 - fl)) * crest(d, R["w"])
    # THE FEET, compactly supported so that "no foot here" is a real zero.
    th_ = toe_h(y)
    if th_ > 0.0:
        for R in RIDGES:
            if not R["root"]:
                continue
            dt = angdist(phi, crest_at(R, y) + R["toe_off"])
            r += R["toe_len"] * th_ * blade(dt, R["toe_w"])
    r -= valley(phi, y)
    # THE JAMBS ARE THICK. The wound's side faces are radial, so the wall's
    # thickness at the jamb IS the depth the eye reads at the mouth's edge.
    # Round 1 measured 0.30 sRGB on the cut face against 0.23 on the liner
    # an inch away: a 1.28x step, which is no step, which is why the front
    # read as two pale boards with a dark curtain between them instead of a
    # stump with a hole in it. Swelling the trunk in a band around |phi| 1.28
    # deepens that face where it is seen and puts real shoulders of wood
    # outside the mouth's lower corners.
    # It is held OFF THE GROUND on purpose. |phi| 1.30 is also where the
    # valley between each front-diagonal foot and its flank neighbour falls,
    # and a swell that reached the felt filled that valley back in — R2
    # quietly undoing R1. Coming in at y 0.55 and peaking through 1.3-2.4
    # puts the wood exactly where the mouth's lower corners are and nowhere
    # near the feet.
    jam = math.exp(-0.5 * ((abs(phi) - 1.30) / 0.28) ** 2)
    r += (0.34 * jam * smoothstep(y, 0.55, 1.30)
          * (1.0 - smoothstep(y, 2.6, 5.8)))
    # THE SILL APRON — two lobes of wood flanking the doorway just under the
    # threshold, and it does three jobs at once.
    #
    # It is the lower-front MASS R2 asks for, put where a hollow stump
    # actually keeps it (beside the opening, not across it). It SEATS the
    # delivery tongue: measured on round 1, the tongue's rolled shoulder
    # overhung a 0.6-1.3 crevice all along its outer edge because the trunk's
    # wall at |x| 2.6 stood almost a unit further back, and that shadowed
    # slot is where frame 11's black rectangle was. And it is centred at
    # |phi| 0.84 rather than at 0 so the front face never touches ZFRONT —
    # a swell across the middle would be planed into a flat board by the
    # socket clamp, which is the failure this whole model exists to undo.
    # 0.84 at |phi| 0.90, and both numbers are the measurement talking: the
    # crevice at the junction was 0.49 deep with a 0.52 apron centred at
    # 0.84, and moving the centre out is what keeps phi 0.5 off the ZFRONT
    # clamp while the lobe still reaches the tongue's edge heading.
    ap = math.exp(-0.5 * ((abs(phi) - 0.90) / 0.28) ** 2)
    r += (0.84 * ap * smoothstep(y, 0.35, 0.85)
          * (1.0 - smoothstep(y, 0.60, 1.55)))
    # The spires lean OUT above the rim. Two duties in one term: torn fibers
    # splay rather than curl in, and the approach column stays clear without
    # having to be defended by a clamp.
    r += 0.16 * smoothstep(y, PORTAL_IN["rimY"] - 0.5, PORTAL_IN["rimY"] + 2.4)
    # Fine flutes: the striation the eye reads as grain, riding above the
    # ridges. k=9 is the ceiling, not a taste call — at 72 columns a ring
    # frequency past ~14 aliases into mush instead of resolving as grain,
    # and anything finer than that belongs in COLOR_0 by the 0.07 rule.
    # ...and they die into the tear. The flutes are +-0.05 of independent
    # wobble on the OUTER surface; the wall is tapering to 0.02 up there, so
    # left running they are twice the thing they are riding on and the tip
    # keeps a chisel edge however hard the summit is split. The liner's ribs
    # fade over the same last unit, in r_in.
    r += ((0.085 * fbm_ring(phi, y * 0.30, 9.0, SEED + 2, 3) - 0.034)
          * (1.0 - smoothstep(y, y_top(phi) - 0.95, y_top(phi) - 0.10)))
    return r


def r_in(phi, y):
    """Inner (liner) radius. Its own rib pattern, never the outer ridges —
    letting the outer furrows subtract from the wall is how a wall gets
    thin where it is already carrying a spire."""
    r = base(y) - wall_at(phi, y)
    # THE LINER LEANS OUT WITH THE SPIRES — and this is R5's real cause.
    #
    # wall_at tapers the wall to 0.022 at each column's own tear so that a
    # spire ends in an edge rather than a machined cap. r_out then adds 0.16
    # of splay above the rim and r_in did not, so the rim strip came back to
    # ~0.20 at exactly the height it was supposed to vanish: the tallest tip
    # measured 0.31 of flat top across a 0.42 blade, which is the facet round
    # 1 noted. Splitting the summit could not fix it because the summit was
    # never the problem — the two surfaces were drifting apart under it.
    # A torn fiber splays on BOTH faces, so the same term goes on both.
    r += 0.16 * smoothstep(y, PORTAL_IN["rimY"] - 0.5, PORTAL_IN["rimY"] + 2.4)
    # ...and the liner's rib noise fades out as the column nears its tear.
    # 0.085 of wobble on each surface INDEPENDENTLY is four times the 0.022
    # the wall tapers to, so without this the two faces can simply swap over
    # at a tip and the rim strip turns inside out.
    r += ((0.085 * fbm_ring(phi + 1.7, y * 0.45, 6.0, SEED + 21, 2) - 0.034)
          * (1.0 - smoothstep(y, y_top(phi) - 0.95, y_top(phi) - 0.10)))
    return r - valley(phi, y)


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


def z_front(y):
    """The socket's front plane, flat — TOE_CREEP is 0 since r3 (see there).

    The shape of the relaxation is kept because the constant is the thing
    that changed: if a future round wins the shell a cladding-classed foot
    mesh, the creep comes back by setting one number, and every gate that
    watches the front plane still measures it.
    """
    return ZFRONT + TOE_CREEP * max(0.0, 1.0 - y / 0.55) ** 1.25


def out_point(phi, y):
    x, z = clamp_point(r_out(phi, y), phi, z_front(y) - AXIS_Z, ZBACK - AXIS_Z)
    return (x, y, z)


def in_point(phi, y):
    x, z = clamp_point(r_in(phi, y), phi,
                       ZFRONT - AXIS_Z - 0.16, ZBACK - AXIS_Z + 0.10)
    return (x, y, z)


FLOOR_Y = 0.34


def floor_y(phi):
    """The rot pooled in the bottom of the hollow: BANKED at both ends.

    A flat floor was the wrong answer twice over. Sitting a little below the
    sill it read through the mouth as a smooth pale pool — the interior's
    one forbidden reading — and it was visible at all only because the drop
    from sill to floor was 0.35 against a sightline that falls 0.55 per unit
    of depth, which is a coin-flip, not a design.

    Banking the debris up against the INSIDE of the threshold settles it:
    the bank is the first thing the eye meets through the mouth, it occludes
    everything behind it at any angle, and punk piled in a hollow stump is
    what is actually there. Capped at 0.96 — the exit gate's floor is
    1.1125 and this has to stay under it with room to spare.
    """
    z = AXIS_Z + r_in(phi, 1.2) * math.cos(phi)
    # A LOW, LUMPY floor, not a bank. Piling the debris high against the
    # sill traded a pale pool for a smooth loaf of bread sitting in the
    # mouth; with the specular sheen fixed the floor no longer needs
    # hiding, so it can go back to being low and simply be lumpy.
    bank = 0.30 * smoothstep(z, -2.30, -0.70)
    mound = 0.80 * smoothstep(z, -3.60, -5.40)         # the far corner
    rough = (0.20 * fbm_ring(phi, 1.0, 9.0, SEED + 29, 2)
             + 0.10 * fbm_ring(phi * 2.3 + 2.0, 0.5, 17.0, SEED + 31, 2))
    return min(0.86, FLOOR_Y + bank + mound + rough)


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


W_ARC = 2.75           # phi -> world arc length at the wound's radius
W_TOOTH_LAM = 0.86     # splinter wavelength, WORLD units
W_TOOTH_AMP = 0.42     # deepest splinter bay, WORLD units
W_LOOP_M = 152         # boundary samples, uniform in ARC LENGTH

# THE LOWER CORNERS COME IN — R2, and the room it is allowed to use is
# MEASURED, not guessed.
#
# check.py fires the exit rays along +z from z = -1.5 at |x| <= 2.375. The
# outermost of them, at x = 2.375, is at phi = atan2(2.375, 1.05) = 1.155 rad
# where it is deepest, and it never reaches a larger |phi| than that anywhere
# along its run. So every radian of the wound beyond |phi| 1.155 is invisible
# to the gate, and the wound runs to 1.40 plus its rag. That is 0.25 rad of
# jamb on each side — 0.73 of arc at the trunk's radius, about a fifth of the
# mouth's width — which can be filled with solid wood without the contract
# noticing. W_CORNER_U0 0.855 starts the fillet at phi 1.197, keeping 0.04
# rad of margin over the ray, and assert_throat_clear re-proves it on the
# triangles.
#
# This is also what buries the delivery tongue's end cap (R4b): with the
# corners square the wall was cut away out to |x| 2.93 at sill height, so the
# tongue's back face stood in open air beside the mouth and rendered as a
# black rectangle. Filled corners give it something to hide behind.
W_CORNER_U0 = 0.855
W_CORNER_LIFT = 1.55   # world units the sill rises at the extreme corner


def w_base(a):
    """The smooth superellipse boundary in normalised (u, v)."""
    n = w_exp(a)
    ca, sa = math.cos(a), math.sin(a)
    rho = 1.0 / ((abs(ca) ** n + abs(sa) ** n) ** (1.0 / n))
    return rho * ca, rho * sa


def uv_to_world(u, v):
    """(u, v) -> (arc, y), both in world units, so distances mean something."""
    return W_PHI0 * u * W_ARC, W_YC + (W_YUP if v >= 0 else W_YDN) * v


def world_to_uv(arc, y):
    u = arc / W_ARC / W_PHI0
    return u, (y - W_YC) / (W_YUP if y >= W_YC else W_YDN)


def build_wound_loop(m=W_LOOP_M):
    """The wound's edge: teeth of a FIXED WORLD SIZE, sampled uniformly in
    ARC LENGTH, offset OUTWARD only.

    Both halves of that sentence are corrections the first bake earned.

    Sampling uniformly in the superellipse's own angle put most of the
    samples along the broad top and bottom and starved the jambs, where the
    boundary is nearly vertical; and a tooth defined on that angle became,
    down the jamb, a horizontal ledge with a vertical riser. The mouth grew
    a STAIRCASE — the same rectangular-notch failure the inline shell had on
    its lintel, arrived at from the opposite direction.

    Offsetting a world distance along the outward normal (rather than
    scaling the radius) also makes a tooth the same size everywhere. Scaling
    made them 0.67 deep at the jambs and 0.45 at the arch, because the
    radius it multiplied was not the same length in the two places.

    OUTWARD ONLY is the load-bearing part: the smooth superellipse already
    contains the contractual doorway, so wood can only ever be REMOVED from
    outside it, and the splinters are the places the bay did not reach.
    """
    dense = 2880
    pts, arcs = [], [0.0]
    for i in range(dense):
        a = 2.0 * math.pi * i / dense
        pts.append(uv_to_world(*w_base(a)))
    for i in range(dense):
        p, q = pts[i], pts[(i + 1) % dense]
        arcs.append(arcs[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
    total = arcs[-1]

    loop = []
    for k in range(m):
        s = total * k / m
        j = 0
        lo, hi = 0, dense
        while lo < hi:                       # the dense sample below s
            mid = (lo + hi) // 2
            if arcs[mid] <= s:
                lo = mid + 1
            else:
                hi = mid
        j = max(0, lo - 1)
        f = (s - arcs[j]) / max(1e-9, arcs[j + 1] - arcs[j])
        p, q = pts[j], pts[(j + 1) % dense]
        ax, ay = p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f
        # outward direction, in world units, from the wound's centre
        dx, dy = ax, ay - W_YC
        dl = math.hypot(dx, dy) or 1.0
        dx, dy = dx / dl, dy / dl
        # THE BAY IS BROAD AND THE SPLINTER IS NARROW. Sharp positive lobes
        # bit square bumps out of the rim and left broad tongues between
        # them, which on a near-vertical jamb stacked into a STAIRCASE of
        # lit horizontal ledges. Inverting it — mostly-open bays with narrow
        # dips where the wood survives — puts thin spikes into the opening,
        # which is what a splinter is.
        ph = 2.0 * math.pi * s / W_TOOTH_LAM + 4.0 * n1p(2 * math.pi * s / total, 5, SEED + 83)
        lobe = 1.0 - (0.5 + 0.5 * math.cos(ph)) ** 3.4
        gain = 0.34 + 0.66 * n1p(2 * math.pi * s / total, 11, SEED + 85)
        wander = 0.16 * n1p(2 * math.pi * s / total, 6, SEED + 81)
        # WHERE the fringe belongs. The brief asks for splinters on the two
        # LIPS — the arch and the threshold — and those are the stretches
        # where the boundary runs horizontally, so the offset direction is
        # vertical and a tooth is a spike. Down the near-vertical JAMBS the
        # offset direction is horizontal, every tooth becomes a lit
        # horizontal ledge, and a column of them is a STAIRCASE. That is the
        # inline shell's lintel defect wearing a different hat, and it is
        # measured here off |dy|, the vertical share of the outward step.
        # 0.03, not 0.20: at a fifth amplitude the jamb teeth were still a
        # visible staircase, because the defect is not their SIZE — it is
        # that the cut face they open is a hard 90-degree crease whose
        # upward half catches the key light. A ledge 0.08 deep reads as
        # loudly as one 0.4 deep. The jambs get their irregularity from the
        # fiber ridges the cut crosses instead, which is free and organic.
        lips = 0.03 + 0.97 * abs(dy) ** 0.90
        # the threshold keeps a fringe, but a shallower one, and it only
        # ever cuts DOWNWARD — the exit gate's floor is above it
        low = 0.45 + 0.55 * smoothstep((ay - W_YC) / W_YDN, -0.92, -0.30)
        d = W_TOOTH_AMP * (lobe * gain + wander) * lips * low
        bx, by = ax + dx * d, ay + dy * d
        # THE CORNER FILLET (see W_CORNER_U0). The threshold sweeps UP toward
        # each jamb, so the mouth loses its square bottom corners and gains
        # two haunches of solid wood. It is applied AFTER the rag so the
        # fringe rides the new sill instead of being flattened by it, and it
        # only ever moves the boundary UP — the loop stays simple, and wood
        # is only ever added to the lower corners, never taken from the
        # doorway.
        uu = abs(bx) / W_ARC / W_PHI0
        if by < W_YC:
            by += (W_CORNER_LIFT
                   * smoothstep(uu, W_CORNER_U0, 1.06)
                   * smoothstep((W_YC - by) / W_YDN, 0.20, 0.92))
        loop.append(world_to_uv(bx, by))
    return loop


WOUND_LOOP = build_wound_loop()

# A radius table over direction, built FROM the loop that is actually cut,
# so the paint pass's idea of "how near the fringe is this?" and the
# geometry cannot drift apart.
_W_TAB_N = 720
_W_TAB = [0.0] * _W_TAB_N


def _build_w_table():
    ang = sorted(((math.atan2(v, u)) % (2.0 * math.pi), math.hypot(u, v))
                 for u, v in WOUND_LOOP)
    for i in range(_W_TAB_N):
        a = 2.0 * math.pi * i / _W_TAB_N
        lo, hi = 0, len(ang)
        while lo < hi:
            mid = (lo + hi) // 2
            if ang[mid][0] <= a:
                lo = mid + 1
            else:
                hi = mid
        p = ang[(lo - 1) % len(ang)]
        q = ang[lo % len(ang)]
        da = (q[0] - p[0]) % (2.0 * math.pi)
        f = 0.0 if da < 1e-9 else (((a - p[0]) % (2.0 * math.pi)) / da)
        _W_TAB[i] = p[1] + (q[1] - p[1]) * min(1.0, max(0.0, f))


_build_w_table()


def w_point(a_index, t):
    """Interior parameterisation of the wound disc, t in (0, 1].

    Indexed by LOOP POSITION now, not by angle: the loop is the authority
    on where its own edge is.
    """
    u, v = WOUND_LOOP[a_index % len(WOUND_LOOP)]
    u, v = u * t, v * t
    return W_PHI0 * u, W_YC + (W_YUP if v >= 0 else W_YDN) * v


def in_wound(phi, y):
    """<1 inside the wound, 1 on its torn edge. Read off the cut loop."""
    u = phi / W_PHI0
    v = (y - W_YC) / (W_YUP if y >= W_YC else W_YDN)
    r = math.hypot(u, v)
    if r < 1e-9:
        return 0.0
    a = math.atan2(v, u) % (2.0 * math.pi)
    return r / _W_TAB[int(a / (2.0 * math.pi) * _W_TAB_N) % _W_TAB_N]


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
# THREE ROWS BOUGHT FOR THE FEET. The toes live entirely under y 0.78 and
# round 1's schedule put two rows in that band (0.02 and 0.30), so a foot
# with a hard shoulder was being sampled by a mesh that could only draw it as
# a ramp. 0.14 / 0.46 / 0.80 give the shoulder somewhere to happen. They cost
# 3 x NPHI quads = 432 tris, which is most of round 1's headroom, and the
# roots were told to spend it.
OUT_FIXED = [SHELL_FLOOR, 0.02, 0.14, 0.30, 0.46, 0.62, 0.80, 1.05, 1.60,
             2.30, 3.15, 4.10, 5.10, 6.10, 7.00]
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
        # Crown rows BUNCHED toward the tip. Evenly spaced, the top quad on
        # the tall spire was 1.18 units of unbroken flat; the 0.72 power
        # halves that for free, which is the other half of R5's fix — a split
        # summit still reads as a facet if the facet under it is a metre of
        # untouched quad.
        outer.append(out_point(phi, lerp(7.00, top, (k / OUT_CROWN) ** 0.72)))
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
                phi, y = boundary_fn(k, t)
                r = r_fn(phi, y)
                row.append(len(verts))
                verts.append(bl((r * math.sin(phi), y,
                                 AXIS_Z + r * math.cos(phi))))
            idx.append(row)
        c_phi, c_y = boundary_fn(0, 1e-4)
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
    def boundary(k, t):
        return w_point(k, t)

    def lo(phi, y):
        # 1.85, not 1.50. It only has to sit inside the cavity wall (r_in
        # bottoms out near 1.97 across the wound's height); reaching to 1.50
        # also reached into the debris floor, and the boolean shredded the
        # floor's fan into hundreds of slivers for nothing.
        return 1.85
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
    return radial_window("woundCut", boundary, lo, hi,
                         m=len(WOUND_LOOP), rings=4)


def door_cutter():
    hw = DOOR_W / 2.0 / 2.95              # phi half-width at the flank
    hh = DOOR_H / 2.0

    def boundary(k, t):
        # a rounded rectangle: the ember door is a knothole, not a window
        a = 2.0 * math.pi * k / 48
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
TONGUE_Z0 = -0.10
# -0.06, not +0.06: the lip collider's front face is z 3.90 and the audit's
# LIP CLADDING class is "the engine outrun, skinned", so the skin ends INSIDE
# the thing it clads. Round 2 ran to 3.96 and the fit read z+3.71 past the
# socket face. Nothing rides the last 0.06 — the lip's top surface has already
# fallen to y -0.03 there, under the felt.
TONGUE_Z1 = LIP_C[2] + LIP_S[2] / 2.0 - 0.06
# THE CLADDING HAS TO DIP A HALF-UNIT UNDER THE FELT, and that is a
# classification requirement rather than a modelling one: towerModelAudit
# grants APRON/LIP CLADDING only to a mesh with min.y < -0.5 (the engine's own
# clad boxes dip a unit), and round 2's -0.35 skirt measured min.y' -0.373 —
# too deep for FOOT DIP (> -0.15), too shallow for cladding, so the tongue came
# back UNCLASSIFIED and the whole fit went red on it. -0.62 reads as -0.643
# after the lean. Nothing about it is visible: the felt is at y 0.
CLAD_FLOOR = -0.62


def tongue_top(z):
    return max(RAMP_Y - RAMP_K * z, LIP_Y - LIP_K * z) + PROUD


def tongue_hw(z):
    """A root plate spreading onto the felt, not a ramp.

    It cannot be narrow — it has to cover the apron collider (+-2.375) and
    the lip collider (+-2.4), or dice ride nothing. So the slab read is
    beaten by SHAPE, not by width: lobed toes at the front, a waist where it
    leaves the mouth, and a ragged rather than a ruled edge.
    """
    hw = 2.43 + 0.34 * smoothstep(z, 0.4, 2.5) - 0.22 * smoothstep(z, 3.1, TONGUE_Z1)
    hw += 0.13 * math.sin(2.05 * z + 1.1) + 0.10 * n1(z * 1.9, SEED + 101)
    return max(2.42, hw)


TONGUE_XS = [-1.0, -0.93, -0.80, -0.58, -0.30, 0.0, 0.30, 0.58, 0.80, 0.93, 1.0]


def tongue_relief(u, z):
    """Longitudinal fiber ridges running DOWN the slope — the grain of a
    root, in geometry rather than only in colour. Raised, never sunk: the
    surface is the engine's chute and a groove is a place a die floats."""
    fade = smoothstep(z, TONGUE_Z0, 0.60)
    camber = 0.016 * (1.0 - u * u)
    ridge = 0.042 * (0.5 + 0.5 * math.cos(9.4 * u + 1.7 * n1(u * 2.0, SEED + 103)))
    ridge *= 0.45 + 0.55 * n1(u * 3.1 + 5.0, SEED + 105)
    return (camber + ridge) * fade


def build_tongue(name):
    zs = [TONGUE_Z0 + (TONGUE_Z1 - TONGUE_Z0) * (i / 12.0) for i in range(13)]
    verts, faces = [], []
    rings = []
    for z in zs:
        hw = tongue_hw(z)
        top = tongue_top(z)
        ring = []
        for u in TONGUE_XS:
            ring.append((u * hw, top + tongue_relief(u, z), z))
        # rolled shoulders, so the edge reads as a root's rounded flank and
        # not as the bevel of a paving stone
        ring.append((hw * 1.008, top - 0.13, z))
        for u in (0.99, 0.5, -0.5, -0.99):
            ring.append((u * hw, CLAD_FLOOR, z))
        ring.append((-hw * 1.008, top - 0.13, z))
        rings.append(len(verts))
        for p in ring:
            verts.append(bl(p))
    n = len(TONGUE_XS) + 6
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
# THE COWL CURTAIN — the liner, carried up past the tear
# --------------------------------------------------------------------------
# WHAT THE ENGINE ACTUALLY ASKS FOR, which is not what the volume table reads
# like. towerOcclusionCheck fires 99 rays per eye at the COWL band, and those
# 99 points are three horizontal DISCS ON THE BORE AXIS — radius 2.07, at
# y 8.55 / 9.90 / 11.25 — not points on the facade slab the band is named
# after. The band is that tall because it is derived: cowl.c[1] = 7.4*S +
# (rimY - 7.0*S), height 2.4*S, so declaring rimY 9.40 lifts the top sample to
# rimY + 1.85. Every one of them, from all six shipped eyes, must die on
# towerSkin* geometry, and round 2 leaked 354 of the 594.
#
# A point floating at y 11.25 over an open crown can only be hidden by
# geometry BETWEEN it and the eye, and every shipped eye is in front of and
# above the tower. So the model owes a wall around the FRONT of the bore
# reaching ~2.4 above the tear — and the splintered crown cannot be that wall,
# because the front IS the low point of the tear. That is what rimY 9.40
# declares, and F5 keeps the portals fixed.
#
# So the LINER goes up instead, which is how the old JS shell closed the same
# band; its red check is why we know the layer suffices alone — "facade top
# 10.70 + lining top 11.62 -> 99/99, the LINING carries it"
# (js/towerhollow.js). It stands INSIDE the crown, it is painted at the
# liner's deep value, and seen through a notch it is the same dark the notch
# was showing before. It is NOT a lid: it is a band around the bore, and the
# approach column (r 2.09 about the axis, y 7.65 .. 11.90) stays 25/25 clear
# because the curtain's nearest surface is 2.41 out.
#
# HOW TALL — measured, not estimated. The binding ray is wide.eyeFull (y 13.3,
# the only shipped eye above the band) to the deepest, highest cowl sample
# (0, 11.25, z0-4.62): it crosses this surface at y 11.779. Round 3's brief
# said "y ~= 11.5" from the facade-plane reading of the band; the discs put it
# 0.28 higher, and 11.5 would have shipped a leak the recipe's own gate now
# refuses. 12.05 with a 0.16 tear is 11.89 at worst — 0.11 of margin — and
# still 0.28 under the tallest spire, so the crown keeps the skyline.
CURTAIN_BOT = 8.60         # under the lowest tear (9.40): no slot to see through
CURTAIN_TOP = 12.05
CURTAIN_TEAR = 0.16        # the top edge is torn DOWN from that, never up
CURTAIN_INSET = 0.10       # how far inside the liner's own surface it stands
CURTAIN_WALL = 0.14        # its thickness
CURTAIN_ZF = 0.00          # its front plane, 0.06 behind the liner's clamp
CURTAIN_M = 20             # columns: 18 deg, sagitta 0.03 at r 2.8 — under the
#                            0.07 floor, and this is the coarseness the tri
#                            budget buys instead of taking tris off the crown
CURTAIN_ROWS = 3


def curtain_top_at(phi):
    """Tall across the front, gone by the flanks — the rays that leak all
    cross between -40 and +45 deg, so that is where the wood goes."""
    a = abs(phi)
    t = CURTAIN_TOP - 0.34 * smoothstep(a, 0.30, 0.95)
    t -= (t - 8.90) * smoothstep(a, 1.05, 1.50)
    return t - CURTAIN_TEAR * fbm_ring(phi, 0.0, 5.0, SEED + 71, 2)


def curtain_r(phi, y, inset):
    """The liner's radius, pulled in — and held off the socket plane.

    The front is a RADIUS rule, not a z-clamp. clamp_point flattens both of a
    wall's surfaces onto the same plane, which is fine for the shell (its two
    clamps are 0.16 apart) and fatal for a thin band: both faces would land on
    one plane and the solid would collapse to a sheet. min() against
    (zf - AXIS_Z)/cos keeps the two faces CURTAIN_WALL apart everywhere,
    including across the flat front plate it produces inside |phi| < 24 deg.
    """
    zf = CURTAIN_ZF - (inset - CURTAIN_INSET)
    return min(r_in(phi, y) - inset,
               (zf - AXIS_Z) / max(0.25, math.cos(phi)))


def build_curtain(name):
    """A closed band: outer surface up, over the torn top edge, inner surface
    down, across the bottom edge. Swept full circle it needs no caps."""
    verts, faces = [], []
    cols = []
    for i in range(CURTAIN_M):
        phi = -math.pi + 2.0 * math.pi * i / CURTAIN_M
        top = curtain_top_at(phi)
        ys = [lerp(CURTAIN_BOT, top, k / (CURTAIN_ROWS - 1.0))
              for k in range(CURTAIN_ROWS)]
        loop = []
        for inset, seq in ((CURTAIN_INSET, ys),
                           (CURTAIN_INSET + CURTAIN_WALL, list(reversed(ys)))):
            for y in seq:
                r = curtain_r(phi, y, inset)
                loop.append((r * math.sin(phi), y, AXIS_Z + r * math.cos(phi)))
        cols.append(len(verts))
        for p in loop:
            verts.append(bl(p))
    n = 2 * CURTAIN_ROWS
    for i in range(CURTAIN_M):
        a, b = cols[i], cols[(i + 1) % CURTAIN_M]
        for j in range(n):
            k = (j + 1) % n
            faces.append((a + j, a + k, b + k, b + j))
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
    (-1.72, 3.05, 5),     # beside the wound's left jamb
    (1.62, 6.35, 1),      # a lone bracket high on the right jamb
    (3.02, 2.15, 3),      # low on the back
]

SHELF_EMBED = 0.11    # how far the attachment arc sits INSIDE the surface


SHELVES = []          # (x, y, z, thick) per bracket, filled by build_shelves
#                       so the paint pass can tell a cap from its gills by
#                       POSITION alone — the same rule the trunk paint uses.

SHELF_PROBES = []     # every ring vertex, app frame, for assert_shelves_bite
SHELF_DROPPED = []    # brackets refused, with the reason


def build_shelves(name):
    """Brackets that BITE INTO the trunk, and are dropped when they cannot.

    Two round-1 defects, one cause. Every ring vertex took its radius from
    r_out AT THE CLUSTER'S CENTRE — so where a bracket spanned a fiber furrow
    (the ridge field swings 0.2 over a fifth of a radian) its ends stood off
    a surface that had receded under them, and at least two slivers floated
    clear of the shell in the round-1 renders. And the -1.62 cluster's jitter
    put brackets past |phi| 1.4, which is INSIDE the wound: those had no
    surface under them at all, only the opening.

    So: every vertex reads the LOCAL r_out at its own (phi, y), the whole
    footprint is tested against the wound and against the ember door, and a
    bracket that cannot bite is dropped and named rather than shipped
    hovering. Kit trap 7 says overlap by epsilon and never go tangent; this
    is that rule made into a construction and then into a gate.
    """
    verts, faces = [], []
    SHELVES.clear()
    SHELF_PROBES.clear()
    SHELF_DROPPED.clear()
    idn = 0
    for (cphi, cy, cnt) in SHELF_CLUSTERS:
        for s in range(cnt):
            idn += 1
            phi = cphi + (h01(idn, 111) - 0.5) * 0.42
            y = cy + (h01(idn, 113) - 0.5) * 0.85
            # A BRACKET IS WIDE AND SHALLOW. The first cut was as deep as it
            # was wide and rendered as a little teal arrowhead stuck to the
            # bark; a shelf fungus is a thin lip that runs ALONG the trunk
            # and barely leaves it.
            wide = 0.44 + 0.34 * h01(idn, 115)
            out = 0.13 + 0.11 * h01(idn, 117)
            thick = 0.030 + 0.030 * h01(idn, 119)
            r0 = r_out(phi, y)
            half = wide / r0
            # REFUSE before building: the footprint (plus a margin) must sit
            # on wood, clear of the wound's rag and clear of the ember door.
            span = [(phi + half * 1.12 * (2.0 * t / 8 - 1.0), y + dy)
                    for t in range(9) for dy in (-0.09, 0.0, 0.09)]
            qmin = min(in_wound(p, yy) for p, yy in span)
            dmin = min(max(angdist(p, DOOR_PHI) / (DOOR_W / 2.0 / 2.95 + 0.10),
                           abs(yy - DOOR_Y) / (DOOR_H / 2.0 + 0.10))
                       for p, yy in span)
            if qmin < 1.06 or dmin < 1.0:
                SHELF_DROPPED.append(
                    (idn, math.degrees(phi), y,
                     "in the wound (q %.3f)" % qmin if qmin < 1.06
                     else "on the ember door"))
                continue
            ring = []
            m = 9
            for k in range(m):
                f = k / (m - 1)
                ang = math.pi * (f - 0.5)
                dphi = math.sin(ang) * half
                dr = math.cos(ang) * out * (0.72 + 0.28 * h01(idn * 17 + k, 121))
                dy = -0.045 * math.cos(ang) + 0.03 * (h01(idn * 19 + k, 123) - 0.5)
                p = phi + dphi
                # LOCAL, and always inside the surface before dr lifts it:
                # at the ends cos(ang) is 0, so the lip vertex lands exactly
                # SHELF_EMBED under the wood it grows out of.
                rr = r_out(p, y + dy) - SHELF_EMBED + dr
                ring.append((rr * math.sin(p), y + dy, AXIS_Z + rr * math.cos(p)))
            for k in range(m - 1, -1, -1):              # back along the trunk
                if k in (0, m - 1):
                    continue
                f = k / (m - 1)
                ang = math.pi * (f - 0.5)
                dphi = math.sin(ang) * half * 0.92
                p = phi + dphi
                rr = r_out(p, y - 0.01) - 0.17
                ring.append((rr * math.sin(p), y - 0.01,
                             AXIS_Z + rr * math.cos(p)))
            b = len(verts)
            for p in ring:
                verts.append(bl(p))
            SHELF_PROBES.append(list(ring))
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
        # FIVE TIMES DARKER THAN ROUND 1, and the factor is measured, not
        # chosen: the lit inner wall rendered at 0.230 sRGB = 0.042 linear
        # against lips at 0.30-0.78, and it has to lose to them by a margin
        # a viewer reads as "hole", not "grey". The painted occlusion in
        # make_paint takes the deep end down a further 9x on top of this.
        "liner": (0.0026, 0.0036, 0.0052),
        "liner_hi": (0.0072, 0.0100, 0.0126),
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
        "liner": (0.0022, 0.0034, 0.0026),
        "liner_hi": (0.0062, 0.0096, 0.0072),
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
        # THE WALL'S TRUE MIDLINE, from both surfaces. base - wall*0.5 was
        # right in the middle of the trunk and wrong at the crown, where
        # wall_at tapers to 0.022 and the liner's own 0.05 rib noise carries
        # the inner surface OUTSIDE the midline — so the top of the cavity
        # was being painted as exterior wood. Averaging the two fields cannot
        # drift from them, and the valley groove cancels out of it.
        rmid = 0.5 * (r_in(phi, y) + r_out(phi, y))
        q = in_wound(phi, y)

        # --- the interior: the liner, dark by MATERIAL not by lighting ----
        if r < rmid:
            # PAINTED OCCLUSION — the thing albedo alone could not buy.
            #
            # Round 1's liner was already near-black (0.013-0.030 linear) and
            # the mouth still rendered LIT: measured off that bake, the inner
            # wall beside the left jamb came out at 0.230 sRGB against 0.295
            # on the torn wood next to it, a 1.28x step that is no step at
            # all. The reason is that value through a mouth is albedo times
            # what the key does to the NORMAL, and this cavity's two side
            # walls face +-x while the key sits at (4, 7, 5): the -x wall
            # takes 43% of a 2.2 key and the debris floor takes 75%. The
            # deepest surfaces were the brightest ones.
            #
            # There is no albedo that fixes that and stays a colour rather
            # than a hole, because the FIX IS A GRADIENT, not a level: light
            # entering a rot pocket dies with distance, and a renderer with
            # one directional light and no bounce will not do that for you.
            # So it is painted. dep is depth behind the wound's front plane,
            # and the liner is multiplied down to 11% across it.
            # 0.040, not 0.11: measured on the first round-2 bake, the top of
            # the back wall — the deepest thing visible through the mouth and
            # the one the open crown lights directly — still came back at
            # 0.105 sRGB against a 0.145 median lip. Three-quarters of the
            # lip's value is not "a faint high rim". 0.040 puts it at 0.03.
            dep = smoothstep(ZFRONT - z, 1.0, 4.8)
            occ = lerp(1.0, 0.040, dep)
            # The FLOOR gets its own near-black, not the wall's, and it is
            # the lowest value in the model: it is the one interior surface
            # facing straight up into both the key and the open crown.
            if y < floor_y(phi) + 0.22:
                g = (0.0016 + 0.0026 * fbm_ring(phi, y, 5.0, SEED + 27, 2)) * occ
                return (g * 1.05, g, g * 0.92)
            rib = abs(math.sin(phi * 11.0 + 3.0 * fbm_ring(phi, y, 3.0, SEED + 24, 2)))
            k = rib ** 3
            c = lerp3(pal["liner"], pal["liner_hi"],
                      0.25 * k + 0.45 * fbm_ring(phi, y * 0.7, 7.0, SEED + 23, 2))
            c = tuple(v * occ for v in c)
            # THE FAINT HIGH RIM the verdict allows the crown to keep: light
            # falling in from the open top may reach the last unit of the
            # inner wall below each tear, and nothing else.
            hi = max(0.0, 1.0 - (y_top(phi) - y) / 1.10) ** 1.6
            c = lerp3(c, pal["liner_hi"], 0.55 * hi)
            # The glowing rot just inside the opening — what makes a cavity
            # read as a cavity instead of a black veil. Narrowed from 0.55 to
            # 0.26: at the old width it was not a line of foxfire at the tear
            # but a lit WEDGE running a foot back into the jamb, which is
            # half of what the verdict was pointing at.
            near = max(0.0, 1.0 - abs(q - 1.0) / 0.26) if q < 1.4 else 0.0
            c = lerp3(c, pal["glow_core"], 0.040 * near)
            return c

        # --- the ember door recess ---------------------------------------
        if (angdist(phi, DOOR_PHI) < DOOR_W / 2.2 / 2.95 + 0.02
                and abs(y - DOOR_Y) < DOOR_H / 2 + 0.02
                and r < r_out(phi, y) - 0.035):
            return pal["ember"]

        # --- the skeleton -------------------------------------------------
        crestk, furrow = 0.0, 0.0
        for R in RIDGES:
            d = angdist(phi, crest_at(R, y))
            crestk = max(crestk, crest(d, R["w"]))
            furrow = max(furrow, crest(d, R["w"] * 2.4))
        # VERTICAL FIBER STRIATION. The first pass drove this off noise
        # alone and the trunk rendered as smooth pale soap. What the eye
        # actually reads as grain is the RIDGE FIELD: crests catch the light
        # and the furrows between them go dark. Noise only breaks the
        # regularity — it is the second term now, not the first.
        streak = fbm_ring(phi + 0.02 * y, y * 0.09, 14.0, SEED + 33, 3)
        streak = streak * (0.72 + 0.28 * n1(y * 0.55, SEED + 35))
        fine = fbm_ring(phi + 0.015 * y, y * 0.22, 26.0, SEED + 37, 2)
        lum = (0.16 + 0.84 * crestk) * (0.55 + 0.45 * (1.0 - furrow) ** 0.6)
        lum *= 0.62 + 0.55 * smoothstep(streak, 0.30, 0.76)
        lum *= 0.86 + 0.28 * fine
        c = lerp3(pal["wood_mid"], pal["wood_hi"], min(1.0, max(0.0, lum)))
        c = lerp3(pal["wood_low"], c, smoothstep(y, -0.1, 1.9) * 0.62 + 0.38)

        # bark REMNANTS, low and patchy only
        barkk = (smoothstep(y, 2.6, 0.30)
                 * smoothstep(fbm_ring(phi, y * 0.8, 4.0, SEED + 41, 3), 0.40, 0.66))
        c = lerp3(c, pal["bark"], 0.92 * barkk)

        # moss pools in the VALLEYS and on the shaded arc; lichen crusts the
        # crests that catch the moon. One field drives form and growth both.
        shade = crest(angdist(phi, math.pi * 0.86), 1.15)
        mossk = min(1.0, (0.80 * shade + 1.05 * flare(y))
                    * (0.32 + 0.68 * fbm_ring(phi, y * 0.5, 3.4, SEED + 47, 3))
                    * (0.16 + 0.84 * (1.0 - crestk)))
        c = lerp3(c, pal["moss"], 0.92 * mossk)
        # lichen: CRISP freckles on the crests, not a wash. A wide ramp
        # spread the crust over everything at low strength and vanished;
        # a tight one puts real pale specks where the moon would find them.
        lichk = (max(0.0, min(1.0, y / 6.0 - 0.22))
                 * smoothstep(fbm_ring(phi, y * 0.9, 8.0, SEED + 53, 3), 0.60, 0.76)
                 * (0.10 + 0.90 * crestk) * 0.95)
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


# ROUND 4 — THE TONGUE IS TOO BRIGHT, and the number that fixes it is not the
# one the value table predicted.
#
# Round 2 already held this surface UNDER the trunk in albedo — measured off
# the paint, tongue max 0.076 linear against the shell's 0.196 — and it still
# came back from the app's own frames as the brightest thing on the model: a
# near-white slab under a mid-value stump, which inverts the tertiary-field
# law the venue is built on. Albedo was never the quantity in question. The
# tongue is a broad plane facing straight UP at a key that sits above the
# venue; the trunk is curved, raking and half self-shadowed. Equal albedo is
# not equal value, and neither is half.
#
# So round 4 compensates for the ORIENTATION, and the compensation is
# measured in the RENDER, not in the paint: rays cast through look.html's own
# camera classify each sampled pixel by the MESH it lands on, so "tongue" and
# "bark band" (shell, y 0.5-3.0, front-facing) are facts about the model
# rather than rectangles somebody drew on a screenshot. Medians, moonrise:
#
#     lum median      front34   front   restingeye   14-tongue
#     r3  tongue       0.2009  0.1996      0.2005      0.2040
#     r3  bark         0.1493  0.1579      0.1720      0.1602
#     r4  tongue       0.1196  0.1190      0.1196      0.1207
#     r4  bark         0.1493  0.1579      0.1720      0.1600   (untouched)
#
# — the plate goes from 1.35x the lit bark band to 0.80x it at the worst
# view, and foxfire lands at 0.74x on the same run.
#
# TONGUE_GAIN is 0.39, not the 0.5 the brief estimated, because the render is
# not linear in albedo: sRGB compresses hard down here, and the dielectric
# specular floor arrives whatever the albedo is. Two bakes at 0.50 and 0.30
# gave medians 0.1353 and 0.1036; solving lum_linear = spec + gain*diffuse on
# them measures spec 0.00186 and diffuse 0.02915, so the 0.01330 linear that
# puts the plate 20% under the darkest bark band asks for 0.39. It predicted
# that bake's median as 0.1194 and the bake measured 0.1193.
#
# A scalar gain is deliberate — it preserves the fiber streaks' RATIOS
# exactly. What it does not preserve is what the EYE reads, which is why the
# lit-fiber term above is doubled; see there.
TONGUE_GAIN = 0.39
# ...and it is worn WET ROOT-WOOD, not a bare plank. The palette's own punky
# rot carries the plate warm and dirty; it is mixed in harder in the furrows
# than on the ridges, so the streak pattern gains chroma variation at the same
# time as it loses value, and the two palettes stay coherent because the
# colour comes from each one's own table.
TONGUE_DIRT = 0.55


def make_tongue_paint(pal):
    def paint(_poly, co):
        x, y, z = co.x, co.z, -co.y
        if y < -0.05:
            return pal["wood_low"]
        # fiber streaks run DOWN the slope: constant along z, banded in x.
        # The whole tongue is held UNDER the trunk's value — the first bake
        # made it the brightest thing in frame, which is precisely the
        # inversion the inline shell was pulled for.
        st = n1(x * 3.1 + 11.0, SEED + 61) * 0.6 + 0.4 * n1(x * 8.0, SEED + 63)
        ridge = 0.5 + 0.5 * math.cos(9.4 * (x / 2.6) + 1.7 * n1(x * 0.77, SEED + 103))
        # HALF the trunk's value. The tongue is a big flat surface facing
        # straight up into the key, where the trunk is curved and partly
        # self-shadowed, so equal albedo does NOT mean equal brightness —
        # at parity it was the brightest thing in the frame three bakes
        # running, which is the exact inversion the inline shell was pulled
        # for. The moon sits above the venue too, so this is not a
        # preview-rig artefact to wave away.
        lum = (0.22 + 0.55 * smoothstep(st, 0.30, 0.76)) * (0.55 + 0.45 * ridge)
        c = lerp3(pal["wood_low"], pal["wood_mid"], min(1.0, lum * 0.72))
        # 0.20, not round 2's 0.10 — the streaks are paid for TWICE now. A
        # scalar gain preserves relative contrast in LINEAR light, which is
        # what the eye does not read: sRGB compresses hard down here, and the
        # first 0.39 bake measured the plate's visible streak spread (p75 -
        # median) at 0.009 against round 3's 0.024. Lifting the lit fiber
        # alone puts the grain back at the top of the distribution without
        # moving the median that had to come down.
        c = lerp3(c, pal["wood_hi"], 0.20 * ridge * smoothstep(st, 0.5, 0.9))
        # dark where it leaves the mouth, mossy-damp at the felt end
        c = lerp3(pal["wood_low"], c, smoothstep(z, -0.05, 1.6) * 0.68 + 0.32)
        c = lerp3(c, pal["moss"], 0.55 * smoothstep(z, 2.0, 3.9)
                  * (0.4 + 0.6 * n1(x * 2.2 + z, SEED + 65)))
        # ROUND 4, and it is the last two lines on purpose: everything above
        # is round 2's structure, untouched, and this takes the whole plate
        # down and warms it without disturbing a single relative value.
        c = lerp3(c, pal["punk"], TONGUE_DIRT * (1.0 - 0.50 * ridge))
        return tuple(v * TONGUE_GAIN for v in c)
    return paint


def make_curtain_paint(pal):
    """The curtain is a HOLE, painted — round 2's interior discipline applied
    to a surface that is ALWAYS the far side of an opening.

    It never carries the liner's lit end. The liner's own gradient runs from
    1.0 at the mouth down to 0.040 with depth because the near part of it is
    genuinely near the light; this surface is only ever seen THROUGH a tear,
    so it starts at 0.16 of the liner and goes blacker as it rises — the top
    of it is what a player reads against the night sky through a notch, and
    the one thing it must not do is out-value the sky and become a wall.
    """
    def paint(_poly, co):
        x, y, z = co.x, co.z, -co.y
        phi = math.atan2(x, z - AXIS_Z)
        dep = smoothstep(ZFRONT - z, 1.0, 4.8)
        occ = lerp(0.16, 0.040, dep) * lerp(1.0, 0.45,
                                            smoothstep(y, 9.6, 11.4))
        c = lerp3(pal["liner"], pal["liner_hi"],
                  0.35 * fbm_ring(phi, y * 0.6, 6.0, SEED + 73, 2))
        return tuple(v * occ for v in c)
    return paint


def make_shelf_paint(pal):
    """Cap vs gills, by POSITION: find the bracket this corner belongs to and
    read its height within it. The cap carries the palette's pale glow (the
    material's low emissive rides on top of it); the underside is rot-dark,
    so a bracket reads as a bracket and not as a glowing pebble."""
    # A bracket is WOOD wearing a glow, not a teal sweet: the first pass
    # painted the caps at 0.30 of the palette's glow and they read as
    # plastic chips stuck to the bark. Mostly bone, with the palette's
    # breath through it; the material's low emissive does the rest.
    cap = lerp3(pal["wood_hi"], tuple(c * 0.30 for c in pal["glow"]), 0.42)
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


def assert_shelves_bite():
    """Every bracket overlaps the trunk. Kit trap 7, as a measurement.

    Round 1 shipped at least two slivers floating clear of the shell, and a
    render is a poor place to notice a 0.03-thick fleck. The rule is the
    construction's: each ring vertex is r_out(its own phi, its own y) minus
    SHELF_EMBED plus its outward lift, so the two END vertices of every
    bracket — where the lift is zero — must sit exactly SHELF_EMBED inside
    the wood. This reads them back out of the built ring.
    """
    worst, bad = None, []
    for ring in SHELF_PROBES:
        best = -1e9
        for (x, y, z) in ring:
            dz = z - AXIS_Z
            r = math.hypot(x, dz)
            phi = math.atan2(x, dz)
            best = max(best, r_out(phi, y) - r)      # + means embedded
            if in_wound(phi, y) < 1.0:
                bad.append(("in the wound", x, y, z))
        if best < 0.04:
            bad.append(("floating, deepest bite %.3f" % best,
                        ring[0][0], ring[0][1], ring[0][2]))
        worst = best if worst is None else min(worst, best)
    if bad:
        raise RuntimeError(
            "%d shelf bracket(s) do not bite the trunk: first %s at app "
            "(%.2f, %.2f, %.2f)" % (len(bad), bad[0][0], *bad[0][1:]))
    print(f"[bole] shelves {len(SHELF_PROBES)} placed, "
          f"{len(SHELF_DROPPED)} refused, every bracket bites "
          f"(shallowest {worst:.3f})")
    for idn, ph, y, why in SHELF_DROPPED:
        print(f"[bole]   dropped bracket {idn} at phi {ph:+.1f} deg y {y:.2f}: {why}")


def assert_tongue_seated():
    """No open crevice between the tongue's outer edge and the trunk.

    THE BLACK RECTANGLE, named. Round 1's frame 11 carried an isolated
    17x26-pixel near-black blob at the left lip — not the mouth (that
    component is 271x356 and lives elsewhere in the frame), not the tongue's
    own faces (isolating the tongue mesh in the viewer finds no dark pixel
    where it is the front-most surface), but the SHADOWED SLOT between the
    tongue's rolled shoulder and the trunk's lower-front wall, which stood
    almost a unit further back at that x. A gap you can see into, lit by
    nothing, reads as a hole punched in the model.

    So it is measured rather than admired: along the tongue's outer edge, the
    trunk's own front surface must come forward to within SEAT_MAX of the
    edge, over the stretch where the two are supposed to be one piece of
    wood. R1's front-diagonal feet and R2's jamb swell are what close it.
    """
    # Scoped to the JUNCTION — the stretch where the tongue leaves the mouth
    # and the artefact was. Further out the tongue is a plate lying on the
    # felt with felt behind it; there is no pocket to see into, and asking
    # the trunk to reach z 1.0 would put the socket clamp back in charge of
    # the front face. hollowbole_probe.py --blobs tests the symptom itself
    # on the finished renders, which is the check that cannot be argued with.
    SEAT_MAX = 0.35
    bad = []
    for i in range(13):
        z = TONGUE_Z0 + (0.30 - TONGUE_Z0) * i / 12.0
        hw = tongue_hw(z) * 1.008
        y = min(tongue_top(z), 0.92)
        for sx in (-hw, hw):
            # where the trunk's outer surface crosses this (x, y), going
            # forward: bisect on the field, never on a remembered plane
            lo, hi = AXIS_Z, ZFRONT + 3.2
            for _ in range(48):
                mid = 0.5 * (lo + hi)
                dz = mid - AXIS_Z
                if math.hypot(sx, dz) <= r_out(math.atan2(sx, dz), y):
                    lo = mid
                else:
                    hi = mid
            gap = z - lo
            if gap > SEAT_MAX:
                bad.append((sx, y, z, lo, gap))
    if bad:
        w = max(bad, key=lambda b: b[4])
        raise RuntimeError(
            f"the tongue's edge overhangs a {w[4]:.2f} crevice at x {w[0]:+.2f} "
            f"y {w[1]:.2f}: its edge is at z {w[2]:.2f} and the trunk's wall "
            f"is back at z {w[3]:.2f} — that slot is round 1's black "
            f"rectangle ({len(bad)}/26 samples over {SEAT_MAX})")
    print("[bole] tongue seated: no edge sample overhangs more than "
          f"{SEAT_MAX} of unfilled crevice")


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


def app_box(ob):
    """One mesh's APP-FRAME local box, from its own vertices."""
    xs, ys, zs = [], [], []
    for v in ob.data.vertices:
        x, y, z = app_of(v.co)
        xs.append(x)
        ys.append(y)
        zs.append(z)
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def world_box(ob):
    """...and what towerModelAudit will read: the AABB of that box's CORNERS
    after the skin group's 0.45 deg lean about z. three's Box3.setFromObject
    takes the non-precise path, so this is the box's penalty, not the mesh's —
    reproduced here exactly rather than approximated, because round 2 was
    called red on a corner no vertex occupies."""
    x0, x1, y0, y1, z0, z1 = app_box(ob)
    c, s = math.sqrt(1.0 - TILT_SIN ** 2), TILT_SIN
    xs = [x * c - y * s for x in (x0, x1) for y in (y0, y1)]
    ys = [x * s + y * c for x in (x0, x1) for y in (y0, y1)]
    return (min(xs), max(xs), min(ys), max(ys), z0, z1)


def assert_mesh_envelopes(shell, tongue, curtain, shelves):
    """THE FIT AUDIT, run here instead of thirty minutes later in a browser.

    check.py cannot see this: it gates the model's hull against the socket,
    while towerModelAudit classifies EVERY MESH BOX separately against the
    engine volume that grants its overruns. Round 2 passed the bake and came
    back red on two of them at once —

      towerSkinBoleShell   y-0.325  y+0.324  x-0.08  z+0.347  -> UNCLASSIFIED
      towerSkinBoleTongue  y-0.373                            -> UNCLASSIFIED

    — the shell because VENUE GROUNDS admits z- and y- and nothing else (and
    needs min.y > -0.15), the tongue because a dip of 0.373 is too deep for
    FOOT DIP (> -0.15) and too shallow for CLADDING (< -0.5). The dead band
    between those two classes is the trap, and it is invisible from inside a
    bake unless something here measures it.
    """
    ok = True

    def report(ob, cls, *checks):
        nonlocal ok
        b = world_box(ob)
        bad = [why for good, why in checks if not good(b)]
        print(f"[bole] {ob.name:<26} world x {b[0]:+.3f}..{b[1]:+.3f}  "
              f"y {b[2]:+.3f}..{b[3]:+.3f}  z {b[4]:+.3f}..{b[5]:+.3f}  "
              f"-> {cls}" + ("" if not bad else "   *** " + "; ".join(bad)))
        if bad:
            ok = False

    # VENUE GROUNDS: inside x, under the socket top, not below -0.15, no wood
    # forward of the socket face, and not deeper than the glade.
    grounds = (
        (lambda b: b[0] >= -SOCKET_X + 0.02, "min.x outside the socket wall"),
        (lambda b: b[1] <= SOCKET_X - 0.02, "max.x outside the socket wall"),
        (lambda b: b[2] > -0.145, "min.y past the FOOT DIP floor (-0.15)"),
        (lambda b: b[3] <= 12.45, "max.y past the socket top (12.5)"),
        (lambda b: b[5] <= 0.25, "z+ overrun: VENUE GROUNDS admits none"),
        (lambda b: b[4] >= -8.0, "deeper than the glade (z0 - 8)"),
    )
    report(shell, "VENUE GROUNDS", *grounds)
    report(curtain, "VENUE GROUNDS", *grounds)
    report(shelves, "VENUE GROUNDS", *grounds)
    report(tongue, "LIP CLADDING",
           (lambda b: b[2] <= -0.55, "min.y is not under the cladding floor "
                                     "(-0.5) — UNCLASSIFIED, as in round 2"),
           (lambda b: b[5] <= 3.85, "max.z past the lip's front face (3.90)"),
           (lambda b: b[5] > 2.0, "max.z inside the LIP/APRON split (z0+2.0)"),
           (lambda b: b[0] >= -SOCKET_X + 0.02, "min.x outside the socket wall"),
           (lambda b: b[1] <= SOCKET_X - 0.02, "max.x outside the socket wall"))
    if not ok:
        raise RuntimeError("a mesh box is outside the class that has to grant "
                           "it — towerModelAudit would return UNCLASSIFIED "
                           "and tower-fit is red (see the lines marked ***)")


def assert_curtain(curtain):
    b = app_box(curtain)
    if b[3] < 11.45:
        raise RuntimeError(f"the curtain tops out at {b[3]:.3f}, under the "
                           f"11.45 the cowl band needs")
    rmin = min(math.hypot(app_of(v.co)[0], app_of(v.co)[2] - AXIS_Z)
               for v in curtain.data.vertices)
    if rmin < PORTAL_IN["clearR"] * 0.95 + 0.10:
        raise RuntimeError(f"the curtain reaches r {rmin:.3f} of the bore "
                           f"axis — inside the approach column "
                           f"({PORTAL_IN['clearR'] * 0.95:.3f})")
    print(f"[bole] curtain top {b[3]:.2f} (needs 11.45+), nearest approach "
          f"r {rmin:.2f}, y {b[2]:.2f}..{b[3]:.2f}")


# The engine's own occlusion grid, restated so the recipe and js/main.js
# cannot drift: three discs on the BORE AXIS per band, 33 points each.
S_CORE = 1.25
COWL_C_Y = 7.4 * S_CORE + (PORTAL_IN["rimY"] - 7.0 * S_CORE)
COWL_H = 2.4 * S_CORE
SMP_KR = PORTAL_IN["clearR"] / (1.7 * S_CORE)
MAT_EXTRA = 4.5
# (id, that preset's table depth, its eye). The app anchors each eye to the
# LIVE back wall — eye.z = z0 + (e.z - z0_of_that_preset) — so in the model's
# own frame (z = 0 at the socket plane) the z0s cancel and the eye stands at
# e.z + (depth + matExtra)/2, whatever zoom the lab is wearing.
ZOOM_EYES = [
    ("wide.full", 8.6, (0.0, 13.3, 7.7)), ("wide.mini", 8.6, (0.0, 11.0, 6.2)),
    ("medium.full", 6.7, (0.0, 10.4, 6.0)), ("medium.mini", 6.7, (0.0, 8.6, 4.8)),
    ("close.full", 5.2, (0.0, 8.1, 4.7)), ("close.mini", 5.2, (0.0, 6.7, 3.8)),
]


def occlusion_samples():
    def disc(y):
        pts = [(PORTAL_IN["x"], y, PORTAL_IN["z"])]
        for r in (0.55 * SMP_KR, 1.1 * SMP_KR, 1.65 * SMP_KR, 2.0 * SMP_KR):
            for a in range(8):
                th = a / 8.0 * 2.0 * math.pi
                pts.append((PORTAL_IN["x"] + math.cos(th) * r, y,
                            PORTAL_IN["z"] + math.sin(th) * r))
        return pts
    cb, ct = COWL_C_Y - COWL_H / 2.0, COWL_C_Y + COWL_H / 2.0
    bands = {"cowl": [cb + 0.15, (cb + ct) / 2.0, ct - 0.15],
             "shaft": [DESPAWN_Y, DESPAWN_Y + 0.25, DESPAWN_Y + 0.6]}
    return {k: [p for y in ys for p in disc(y)] for k, ys in bands.items()}


def assert_cowl_occluded(objs):
    """THE PROOF THE ROUND-2 BAKE DID NOT HAVE, on the built triangles.

    tower-occlusion demands 99/99 on SHAFT and COWL at all six shipped eyes,
    and a bake that cannot see the grid ships a leak that only a browser finds
    — which is exactly what happened. The eyes and the sample discs are the
    engine's, re-derived from the portal spec; the model is the thing that
    LEANS, so the eyes and points are rotated by -TILT into the model's frame
    rather than the mesh being rotated into theirs.
    """
    import numpy as np
    tris = tri_array(objs)
    c, s = math.sqrt(1.0 - TILT_SIN ** 2), TILT_SIN

    def to_model(p):
        x, y, z = p
        return np.array([x * c + y * s, -x * s + y * c, z])

    smp = occlusion_samples()
    worst = {}
    for eid, depth, e in ZOOM_EYES:
        eye = to_model((e[0], e[1], e[2] + (depth + MAT_EXTRA) / 2.0))
        for band, pts in smp.items():
            missed = []
            for pt in pts:
                p = to_model(pt)
                d = p - eye
                L = float(np.linalg.norm(d))
                if ray_hit(tris, eye, d / L, L - 0.02) is None:
                    missed.append(pt)
            if missed:
                worst.setdefault(band, []).append((eid, len(missed), missed[0]))
    if worst:
        lines = []
        for band, rows in worst.items():
            for eid, n, first in rows:
                lines.append(f"{band} {n}/{len(smp[band])} leak at {eid}, "
                             f"first ({first[0]:+.2f}, {first[1]:.2f}, "
                             f"{first[2]:+.2f})")
        raise RuntimeError("the occlusion grid leaks — raise curtain_top_at "
                           "or widen its arc:\n       " + "\n       ".join(lines))
    print(f"[bole] occlusion {len(smp['cowl'])}/{len(smp['cowl'])} cowl and "
          f"{len(smp['shaft'])}/{len(smp['shaft'])} shaft, at all "
          f"{len(ZOOM_EYES)} shipped eyes")


def assert_rim_is_low():
    tops = [y_top(-math.pi + 2 * math.pi * i / 720) for i in range(720)]
    lo, hi = min(tops), max(tops)
    if abs(lo - PORTAL_IN["rimY"]) > 0.06:
        raise RuntimeError(
            f"declared rimY {PORTAL_IN['rimY']} is not the crown's low point "
            f"({lo:.3f}) — the portal number must be honest")
    if hi > CROWN_MAX:
        raise RuntimeError(
            f"the tallest tear reaches {hi:.3f}, past the {CROWN_MAX} ceiling: "
            f"the audit reads max.y' = {hi:.3f} + {XLIM}*{TILT_SIN} = "
            f"{hi + XLIM * TILT_SIN:.3f} against a socket top of {SOCKET_Y1}")
    print(f"[bole] crown tear {lo:.2f} .. {hi:.2f}  "
          f"(spires {hi - lo:.2f} above the rim; ceiling {CROWN_MAX})")


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
    roots = [R for R in RIDGES if R["root"]]
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
            x, z = clamp_point(r_out(p, y), p, z_front(y) - AXIS_Z,
                               ZBACK - AXIS_Z)
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

def bole_material(name, attr, rough, emissive=None, spec=None):
    """vertex_color_material + ROUGHNESS, and optionally a low emissive.

    THE ROUGHNESS IS NOT A GARNISH — it was the single biggest thing wrong
    with the first three bakes, and it took a crush test to see. The
    interior floor was painted near-black and still rendered as a pale blue
    dome through the mouth; setting its albedo to LITERALLY (0, 0, 0) and
    re-baking changed the pixel by three counts, from (84,104,155) to
    (81,101,154). Nothing that survives a black base colour is diffuse.

    It is the dielectric SPECULAR. Blender's Principled ships roughness
    0.5, forge.vertex_color_material never touches it, and glTF carries it
    straight through — so every surface was reflecting the sky at 4% through
    a fairly tight lobe. On a 0.06 albedo that sheen is not a highlight, it
    IS the value, which is exactly why the trunk read as smooth pale soap
    and why the fiber striation would not show no matter how hard it was
    painted. Rotten wood is roughness ~0.95.

    ROUGHNESS WAS ONLY HALF OF IT — round 2's finding, and it is the same
    fault one level down. Roughness spreads the specular lobe; it does not
    remove the specular. F0 stays at 0.04 whatever you do to roughness, and
    0.04 of a 2.2 key is ~0.07 sRGB of light that ARRIVES REGARDLESS OF
    ALBEDO. That is exactly what was still lighting the deepest part of the
    cavity after the liner had been taken down 5x and then another 2.75x:
    the pixel measured (19, 17, 15) — WARM, in the ratio of the key's own
    0xfff2dd, on a surface painted (0.00017, 0.00023, 0.00031), which is
    cool and essentially black. Diffuse cannot produce that colour. The
    liner was never the thing that was glowing.
    -> Specular IOR Level 0.10 (F0 0.008) on the wood, exported as
    KHR_materials_specular and honoured by the vendored three r160 loader
    (GLTFLoader.js:1205). The shelf caps keep theirs: they are the one damp
    thing on a dead tree and the sheen is the point.

    Recipe-local rather than a kit change: the kit is not mine to edit, and
    both findings are written up for whoever owns it.
    """
    mat = F.vertex_color_material(name, attr)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    if spec is not None:
        # 4.x renamed this socket; do not guess which build is on the machine
        for key in ("Specular IOR Level", "Specular"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = spec
                break
        else:
            raise RuntimeError("no specular socket on Principled BSDF — the "
                               "pin moved and this recipe's darkest surfaces "
                               "would silently go back to 0.07")
    if emissive is not None:
        bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
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
    curtain = build_curtain("towerSkinBoleCurtain")
    shelves = build_shelves("towerSkinBoleShelves")

    meshes = [shell, tongue, curtain, shelves]
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
    F.single_material(shell, bole_material("bole", "Col", 0.96, spec=0.10))
    F.paint_corners(tongue, "Col", make_tongue_paint(pal))
    F.single_material(tongue, bole_material("boleTongue", "Col", 0.97, spec=0.10))
    F.paint_corners(curtain, "Col", make_curtain_paint(pal))
    # 0.02, where the wood gets 0.10: this surface has no story to tell about
    # light at all, and F0 0.0016 is what keeps the sky's 4% off the one thing
    # in the model whose whole job is to be a hole.
    F.single_material(curtain, bole_material("boleCurtain", "Col", 0.99, spec=0.02))
    F.paint_corners(shelves, "Col", make_shelf_paint(pal))
    # the caps are the one damp thing on a dead tree: a little sheen, and a
    # low emissive tinted to the palette's glow — accents, not lamps
    F.single_material(shelves, bole_material(
        "boleShelves", "Col", 0.72,
        emissive=tuple(c * 0.11 for c in pal["glow_core"])))

    assert_throat_clear(meshes)
    assert_approach_clear(meshes)
    assert_shelves_bite()
    assert_tongue_seated()
    assert_envelope(meshes)
    assert_curtain(curtain)
    assert_mesh_envelopes(shell, tongue, curtain, shelves)
    assert_cowl_occluded(meshes)

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
