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
               w       4.20     limit >= 4.0   (floor measured 2026-08-13)
               clearH  3.50     limit >= 3.375 (floor measured 2026-08-13)
    derived    despawnY = rimY - 1.4*S = 7.65

THE MOUTH TIGHTENED TO THE MEASURED FLOOR (2026-08-13, Joe: "the hole in
the stump for the dice to exit is too tall"). The first bake's 5.00 x 4.50
door sat AT the old limits, which were the classic spec's numbers rather
than anything a die had asked for; the portal-floors campaign
(tools/steps/portal-probe.mjs, docs/TOWER.md "THE MINIMUMS") measured the
true floors — congestion at the doorway, not the lone d20, is what sets
the height — and this bake wears them with a little grace: 4.20 x 3.50
(floors 4.00 x 3.375). The wound loop re-derives around the smaller
throat with the same measured jamb margins; the rag above the lintel
tightens from +1.35 to +0.45 so the VISIBLE hole shrinks with the
contractual one instead of re-creating the tall read as torn wood.

sillY is 1.00 and not the "organic 1.1-1.25" the brief invited, and that is
a MEASURED refusal, not timidity. The delivery tongue's top surface has to
be the engine apron's top surface; the apron's slope is atan(0.8/1.5) about
a FIXED box, so any sill above 1.00 tilts the tongue off the collider and
dice sink into it by up to 0.3 at the outrun. At sillY = 1.00 the tongue's
plane is the collider's plane exactly (y = 0.9937 - 0.5333 z, measured off
towerVolumes()' apron box, not copied from its comment). The threshold
still reads as raised: the tongue falls away in front of it and the wound's
lower lip is ragged wood at 0.90-1.02 on both sides of it.

THE THROAT, and the conflict that turned out not to be one
----------------------------------------------------------
check.py --tower fires 25 rays out through the door, at 5 x 5 points over

    |x| <= 1.995,  1.0875 <= y <= 4.4125,   out to z = +1.0

and each ray must reach the front clear. It is NOT a box in z, and the day
it was one is the day this file recorded a refusal it no longer needs. Every
ray then started at a flat z = -1.5, inside the volume the engine's own apron
collider occupies — the ramp's top surface stands at y 1.79 back there,
climbing through the tower — so a model could not clad the chute AND pass,
and the note here called that kit friction and left the interior chute bare.

The gate learned the ramp instead (2026-08-13): each ray starts where its own
height clears the slope line plus a 0.15 cladding allowance, so a model may
skin the chute with a tongue or a slide, while a shelf half a unit above the
slope still fails. This recipe's own copy of the gate was the last flat one
left, and it was therefore STRICTER than the authority it exists to
anticipate; it now calls the same towergates.exit_ray_start_z check.py does.

What the interior actually wears is a separate decision, and it stands: the
chute inside the mouth is unclad and dark, which is what "the wound interior
is hollow there" asks for. The delivery ramp and the outrun lip are DELIBER-
ATELY BARE (Joe, 2026-08-13) — the mound that used to cover them is deleted
and the wound opens onto felt — which the bake now declares rather than
leaves to be inferred: `--bare-colliders ramp,lip`, refused if the model
turns out to have clad them after all.

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
TONGUE_GAIN), and proved to be colour-only by the `set` digest — the first
use in this file of the mechanism that is now gated (see THE RECORD below).

WHAT ROUND 7 CHANGED, and it is a SHAPE round — the first since round 3.
Joe, on the round-6 bake: "the dice tower looks like a demonic helmet more
than it looks like a stump. It's too symmetrical, and the opening looks too
much like either a gaping mouth or like the face opening of a helmet." And,
separately: "did you notice how the stump is not particularly wide at the
bottom and gets much wider near the top? Most stumps are dramatically wider
at the bottom. This needs work."

Both are the same fault seen from two sides, and neither was a taste call:
the model was assembled from THREE HORIZONTAL BANDS on a vertical near-
revolution that got WIDER as it rose. Brow, cheek, mouth; and a profile that
flares at the top is a helmet's, while a profile that flares at the bottom is
a stump's. Every gate this file carried was green, because every one of them
read the PLAN. Round 6 fought symmetry in plan — four ranked spires, the
tallest forced to -1.05 rad — and the PROJECTION put it straight back:
measured off that bake, the outline carried two peaks, at (-2.44, 12.32) and
(+2.30, 11.81), 0.14 from mirrored and 0.51 apart in height. That is
docs/VENUE-COMPOSITION.md rule 6 (judge the frame, not the plan) found inside
a model instead of inside a scene.

THE LAW FOR ROUND 7 IS THEREFORE STATED IN THE FRAME: no horizontal boundary
and no mirrored pair in the SILHOUETTE at the tower eye, and the silhouette is
widest where it meets the ground and narrows all the way up. Three new gates
measure exactly that, on the built mesh, by walking its EDGES and binning the
projection — assert_silhouette_is_not_a_face, assert_taper_is_a_stump,
assert_lintel_is_a_tear. All three are red-checked against round 6's own
field, which fails them on seven counts.

  1 THE CROWN SHEARS. A linear tilt, SHEAR_AMP*cos(phi - SHEAR_DIR), applied
    before any spire: a snapped trunk breaks along a slanted plane, and one
    such term destroys the left/right mirror that four ranked spires could
    not. y_top(+pi/2) - y_top(-pi/2) = 2.05 where round 6 measured -0.52.
  2 THE TEAR'S LOW POINT COMES OFF THE AXIS to phi -0.35, with ramps of 0.25
    rad one side and 0.95 the other, so the brow has no axis to mirror about.
  3 ONE DOMINANT SHARD at +0.95 and nothing to pair with it: the second goes
    BEHIND at +2.55, and the last two are rim events on the low left. Spire
    heights are now absolute TIPS, because with a 2.7-unit slant "1.05 above
    the rim" means two different things on the two sides.
  4 THE LINTEL IS A DIAGONAL TEAR: it climbs 1.03 across the opening (round 6:
    0.093), carries three hanging splinters, and has no periodic term on it at
    all. Round 6's dip spacings were 0.76/0.77/0.79/0.92/0.52 — a comb, which
    is what "teeth" was.
  5 THE OPENING IS 0.158 RAD WIDER ON THE RIGHT. Less than the brief's 0.75 of
    arc asked for, and the reason is measured: see W_SIDE_L.
  6 THE CHEEK IS GROOVED AND CROSSED BY A DIAGONAL BAND. The weakest item of
    the eight, and it is weak because item 8 spent the wall it needed — see
    CHEEK_Y for the numbers and the ledger for the honest read.
  7 THE MAT WALL IS TORN, not milled: x_limit subtracts noise from the socket
    clamp, so the face that lands on it is rippled instead of sawn.
  8 THE TAPER IS THE RIGHT WAY UP. base(y) is strictly decreasing, 2.90 to
    2.27, and the outline goes 3.08 at the felt to 2.48 at the rim (23.8%)
    where round 6 went 3.13 to 2.98 (5.2%) with a bulge from y 6 to y 8.
    wall(y) was re-cut to buy the crown room the narrowing costs, and moving
    the bore in by 0.35 forced the occlusion CURTAIN out of it and into the
    wall — see CURTAIN_RIN, which is the round's most surprising knock-on.

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

THE RECORD, and there is exactly ONE of it (2026-08-13). This header used to
carry three "measured at the bake" paragraphs from three different rounds,
quoting 7956 tris, then 7828, then a `set` digest of 76d898635b069ed2 that a
fourth line said "must still" be. The shipped GLBs measured 7270 and
5278316c43df21ca — matching none of them. Three records is zero records, and
prose cannot be gated, so the numbers that a machine can check now live where
a machine checks them:

    tools/forge/digests.json      the geometry digest pair and tri count,
                                  per shipped slug. bake.sh diffs every bake
                                  against it (digestdiff.py) and a drift is a
                                  refusal, not a paragraph nobody re-read.
    check.py --tower              everything about the FILE: portals, limits,
                                  throats, lane, occlusion, sill holes,
                                  envelope, budget, and the digest's presence.
    the [bole] lines of a bake    everything about the BUILD, printed by the
                                  gate that measured it, every run.

What that leaves here is the SHAPE OF THE CLAIMS rather than their values:
one closed solid plus a curtain and shelves, both palettes sharing geometry
and differing only in COLOR_0, 25/25 on both throats and the approach column,
99/99 cowl and shaft at all six shipped eyes, zero sight lines into the
hollow under the ramp's crest, and every assert_ in this file invoked (the
gate manifest refuses otherwise). If you want today's numbers, run it:

    tools/forge/bake.sh tools/forge/recipes/hollowbole.py \
        --tower --expect-colors --max-tris 15000 --bare-colliders ramp,lip

    # ...which bakes BOTH palettes and gates BOTH (it used to gate the newer
    # file only). And the interior value order, on the renders
    # (hollowbole_look.js shoots the named angles; 19-probe is the frame):
    ~/opt/dice-forge/venv/bin/python tools/forge/recipes/hollowbole_probe.py \
        tools/forge/out/hollowbole_moonrise.glb \
        tools/forge/shots/final-moonrise-19-probe.png --assert
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402
# The contract's gates, in the ONE implementation check.py also runs. Anything
# derived from the portal spec + the engine's own numbers — the exit ray's
# ramp-aware start line, the occlusion grid, the hole-into-the-hollow question
# — lives there and is called from here, so a gate cannot be strict in the
# recipe and lax on the file (or the other way round, which is what actually
# happened: this file's flat exit box refused cladding check.py allows).
import towergates as TG  # noqa: E402

# --------------------------------------------------------------------------
# the contract
# --------------------------------------------------------------------------
S = 1.25
AXIS_Z = -2.55                     # the trunk axis, app frame

PORTAL_IN = {"x": 0.0, "rimY": 9.40, "z": AXIS_Z, "clearR": 2.20}
PORTAL_OUT = {"x": 0.0, "sillY": 1.00, "w": 4.20, "clearH": 3.50}
DESPAWN_Y = PORTAL_IN["rimY"] - 1.4 * S              # 7.65

# The throat box the exit gate probes, restated here so the in-recipe gate
# and check.py cannot drift: THROAT_MARGIN 0.95 of a 4.20 x 3.50 door.
THROAT_HALF_W = 0.95 * PORTAL_OUT["w"] / 2.0         # 1.995
THROAT_Y0 = PORTAL_OUT["sillY"] + PORTAL_OUT["clearH"] * 0.025    # 1.0875
THROAT_Y1 = THROAT_Y0 + PORTAL_OUT["clearH"] * 0.95              # 4.4125
# THE THROAT IS NOT A BOX IN z, and that is the correction of 2026-08-13.
# THROAT_Z0 is the DEEPEST any exit ray starts — the top ray's, which clears
# the engine ramp's slope line with 1.5 to spare — not a plane every ray
# starts on. A low ray starts where its own height clears that slope plus the
# cladding allowance (towergates.exit_ray_start_z, which check.py and this
# file now share). THROAT_Z0 survives as the LINTEL FAN's anchor below, where
# "how deep does the deepest ray reach" is exactly the question.
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
# 15000, not the 8000 a hero prop gets (2026-08-13, Joe's ruling). A TOWER
# MODEL is not a prop the camera passes: it is the one object on the table a
# player looks at for the whole roll, it is baked once and served gzipped, and
# the budget that was refusing detail here was the bake-off's generic hero
# number rather than anything measured about this asset. The DRESSING budget
# is untouched (<= 4k tris / <= 8 draws) — that one is about draw calls per
# frame, which is a different scarcity. This build spends 7270 of it.
BUDGET = 15000
SPLAY = 0.07                      # how far both crown surfaces lean out above
#                                    the rim (was 0.16; see r_out and item 8)

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
#                                    exit gate's floor is 1.0875), so it may
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

# THE ROOT-FLARE FINGERS (round 6). Seven narrow ridges INTERLEAVED between
# the six buttress headings, budgeted against the same mat wall and running
# out along the soil — the flare's job is to GRIP, and six heavy feet with
# nothing between them widen the foot without gripping anything.
#
# They are the same kind of object as a toe and deliberately a different SIZE:
# half the angular width (0.155-0.21 rad, still 3.5-4.8 columns at NPHI 72, so
# they resolve as ridges rather than as creases) and a length profile that
# peaks at the BURIED row and shrinks upward, so each finger's crest line
# descends as it reaches out and passes under the soil at its tip. That is
# what "dives" means here: the tip is at SHELL_FLOOR, under the felt, and the
# visible part is the shoulder of a root going down.
#
# They are added AFTER valley() subtracts, on purpose. A finger sits in a
# valley by construction (it is interleaved), and the valley is 0.52 deep
# where the finger is 0.3-0.6 proud: the net is a cut valley with a narrow
# ridge running through it, which is what root flare between two buttresses
# actually looks like. Refilling the valley would undo R1.
#
# The headings are chosen for ROOM, not for regularity: |sin(th)| is what
# sets room_x, so a finger on the flank (|phi| ~ 1.4) has a quarter of the
# reach of one on the back quarter, and the set is deliberately not mirrored.
# The headings are chosen against MEASURED room, not against regularity. Room
# is XLIM/|sin th| minus whatever radius the trunk already spends at that
# heading, and it swings by 20x around the ring: at -89 deg the six buttresses
# have already put the field 0.20 PAST the mat wall (clamp_point is holding it
# there), while at +66 deg there is a full unit going spare. So the set is
# seven headings that (a) have room, (b) sit at least 0.22 rad off every
# buttress crest so each finger lands in a valley rather than on a foot, and
# (c) are not mirrored.
FINGER_HEADINGS = (-1.22, +1.16, -1.95, +1.83, -2.42, +2.55, -2.88)
FINGERS = []                       # filled after r_out exists — see build_fingers
FINGER_Y0 = SHELL_FLOOR            # longest at the buried row...
FINGER_LEN = 0.62                  # ...and gone by y 0.53, well under the
#                                    exit gate's floor (1.0875) and under the
#                                    berm's lane, which covers the front

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

# --------------------------------------------------------------------------
# THE CROWN SHEAR — round 7, and it is the round's whole thesis
# --------------------------------------------------------------------------
# Joe, on round 6: "the dice tower looks like a demonic helmet more than it
# looks like a stump. It's too symmetrical, and the opening looks too much
# like either a gaping mouth or like the face opening of a helmet."
#
# The face was assembled from three HORIZONTAL bands on a vertical near-
# revolution — brow/horns, a smooth cheek, a mouth — and every one of them
# was symmetric about x = 0 in the PROJECTION even where the plan was not.
# That is docs/VENUE-COMPOSITION.md rule 6 (judge the frame, not the plan)
# found inside a model instead of inside a scene. The law for round 7 is
# therefore stated in the frame: NO HORIZONTAL BOUNDARY AND NO MIRRORED PAIR
# IN THE SILHOUETTE AT THE TOWER EYE, and it is gated by
# assert_silhouette_is_not_a_face, which measures the projected outline.
#
# A snapped trunk breaks along a SLANTED plane. So before any spire is
# applied, the crown carries a linear tilt — SHEAR_AMP * cos(phi - SHEAR_DIR),
# which for SHEAR_DIR near pi/2 is very nearly a plane tilted about z, i.e.
# linear in x. That one term does what four ranked spires could not: it
# destroys the left/right mirror in the outline, because the outline's height
# now depends on which side of the tower a point is on.
#
# THE ARITHMETIC IS TIGHT AND IT IS WORTH STATING, because it is what limits
# how dominant the shard is allowed to be. rimY 9.40 is the declared low
# point and CROWN_MAX 12.35 is the VENUE GROUNDS ceiling: the whole crown
# lives in 2.95 units. The round-7 brief requires y_top(+pi/2) - y_top(-pi/2)
# >= 2.0, and the cheapest way to buy that gap is to let the LOW flank sit on
# the rim floor — so the high flank must stand at 11.4+, which is 2.0 of the
# 2.95 spent before a single spire exists. The shard therefore tops the high
# flank by ~0.5 and no more; its RELIEF is bought from below instead, by the
# two bays that flank it (SHARD_BAY) and by a rim rag that is deep on the
# torn low side and quiet on the clean high side. Measured, not eyeballed:
# the numbers this file prints at bake time are the ones to argue with.
SHEAR_DIR = 1.45                   # the high side of the break, rad
SHEAR_AMP = 1.325                  # half the swing of the tilt
SHEAR_LIFT = 0.90                  # ...and where its middle sits above rimY
RIM_RAG = 0.75                     # rim chew, at full strength on the low side
RIM_RAG_CLEAN = 0.30               # ...and this fraction of it on the high one
# ROUND 8 MOVED THE NOTCH OFF THE SIGHTLINE. At -0.35 the tear's low point sat
# 20 deg left of front, and the two occlusion rays that would not close crossed
# the crown at phi -0.38 — the dip was parked exactly where the highest eye
# looks in, so the eye went over the rim and down to y 8.75 at the back of the
# bore, 0.15 under the top of a despawning die. Nothing about the model was
# wrong except WHERE the low point was; swinging it onto the left flank puts
# full-height crown across the front, which is both what closes the rays and
# what stops the brow reading as a dip centred over the wound.
TEAR_PHI = -0.95                   # the crown tear's LOW point: on the flank
TEAR_W_HI = 0.25                   # rad — it climbs fast on the +phi side...
TEAR_W_LO = 0.95                   # ...and long and slow on the -phi side
# The two bays that flank the shard: the fibres either side of a standing
# splinter are the ones that tore away lowest. Kept clear of +-pi/2 so they
# cannot eat the gap measurement (0.95 + 0.33 + 0.18 = 1.46 < 1.5708).
SHARD_BAY_OFF = 0.33
SHARD_BAY_W = (0.20, 0.18)
SHARD_BAY_D = 0.45
FLOOR_RUBBLE = 0.45                # breaks the clamped rim; see y_top
# (heading, ABSOLUTE tip height). See build_ridges for why these are tips.
SPIRES = ((+0.95, 12.33),          # the one dominant shard
          (+2.55, 10.45),          # the second, BEHIND: 1.60 rad from it
          (-2.75, 10.05),          # ...and the last two are rim events, not
          (-1.20, 9.90))           #    peaks: kept low enough that nothing on
#                                       the left can pair with the shard


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
            "spire_tip": None,     # absolute tip height, round 7 (see SPIRES)
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
    # THE CROWN TEARS ALONG THE GRAIN — and since round 7 it tears along a
    # SLANT as well (see THE CROWN SHEAR). Four ridges keep going past the
    # broken plane, and all four are now placed by HEADING rather than by hash
    # rank, for the same reason the roots were in round 2: what the hash picks
    # is not what the frame needs.
    #
    # ROUND 7 PLACES THEM AGAINST THE SILHOUETTE, NOT AGAINST THE PLAN.
    # Round 6 fought symmetry in plan — four ranked heights, the tallest forced
    # to -1.05 rad — and the PROJECTION put it back: measured off that bake the
    # outline carried two peaks, (-2.44, 12.32) and (+2.30, 11.81), prominence
    # 2.41 and 2.01. A pair of peaks at the two silhouette edges with a dark
    # dip between them is a horned helmet, and the model's own field said so
    # before any render did. So:
    #   · the ONE dominant shard sits at +0.95, on the high side of the shear,
    #     0.62 rad clear of +pi/2 (a spire ON the silhouette edge is a horn),
    #   · the second goes BEHIND (+2.55) — 1.60 rad from the shard, inside the
    #     1.2-2.2 window the brief sets, and from the table it is hidden by the
    #     front rim, so it cannot pair with anything,
    #   · the last two are nubs on the low left, events on the rim rather than
    #     peaks over it.
    # assert_silhouette_is_not_a_face measures the result on the projected
    # outline and refuses a second peak or a mirrored pair.
    #
    # HEIGHTS ARE ABSOLUTE TIPS, not heights above the rim, and that is forced
    # by the shear: the break plane swings 2.7 units around the ring, so "1.05
    # above the rim" means two completely different tips on the two sides. A
    # tip is what the silhouette reads. y_top raises the broken surface TO the
    # tip at the crest and leaves it alone where the surface is already higher,
    # so a spire on the high side of the shear simply does not exist.
    taken = set()
    for th, tip in SPIRES:
        i = min((j for j in range(N_RIDGE) if j not in taken),
                key=lambda j: angdist(ridges[j]["th"], th))
        taken.add(i)
        ridges[i]["spire_tip"] = tip
        ridges[i]["spire"] = tip - PORTAL_IN["rimY"]      # for report_form
    tall = max(range(N_RIDGE), key=lambda i: ridges[i]["spire_tip"] or 0.0)
    ridges[tall]["w"] = max(ridges[tall]["w"], 0.17)
    ridges[tall]["tallest"] = True
    return ridges


def finger_h(y):
    """A finger's length with height: longest at the buried row, gone by 0.53.

    toe_h peaks at the FELT and this peaks 0.11 under it, which is the whole
    difference between a foot lying on the soil and a root going into it. The
    outermost wood a finger owns is therefore never visible; what is visible
    is the shoulder above it, narrowing as it goes out.
    """
    return max(0.0, 1.0 - (y - FINGER_Y0) / FINGER_LEN) ** 1.05


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

    ROUND 7 STRETCHED ITS REACH. At 3.30 with a 1.55 power the web was dead
    by y 3.3 and had spent most of itself under y 1.5, which is a ring of
    bumps at the ankle rather than a base that flares — and a flare living in
    one unit of height cannot read as the bottom of a taper that runs twelve.
    4.60 with a 1.30 power spreads the same wood over three times the height:
    0.83 / 0.60 / 0.25 at y 0.62 / 1.5 / 3.0 where it used to be 0.72 / 0.39 /
    0.02. Re-budgeted against XLIM in build_ridges, whose head allowance reads
    the (fatter) base(0), so no root reaches further into the mat than before.
    """
    return smoothstep(y, 0.05, 0.62) * max(0.0, 1.0 - y / 4.60) ** 1.30


def toe_h(y):
    """The FOOT, and it is a different animal from the fin.

    Round 1 faded the foot over 1.15 units with a 1.35 power, which is the
    skirt of a cone: at y 0.6 it was still at half strength, so the mass it
    added was at the ANKLE, not on the ground, and the ground line itself
    barely moved. A buttress toe is a finger of wood LYING ON THE SOIL. It
    has to be low enough that the silhouette event happens where the model
    meets the felt, and it has to END — the shoulder at 0.78 is what lets the
    valley beside it be a valley.

    0.92 is also a clearance: the exit gate's floor is 1.0875, so no toe can
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
    # ROUND 7 — THE TAPER WAS INVERTED, and it was arithmetic, not taste.
    #
    # Joe: "did you notice how the stump is not particularly wide at the
    # bottom and gets much wider near the top? Most stumps are dramatically
    # wider at the bottom." The round-6 curve read 2.74 at the foot, 2.46 at
    # the waist and 2.90 at the shoulder — the shoulder was 6% WIDER THAN THE
    # GROUND, which is a vase, not a stump. Worse, it fed the helmet: a helmet
    # flares at the top and a stump flares at the bottom, so the profile was
    # arguing for the reading the whole round exists to destroy. (The old
    # comment claimed "a heavy foot… a crown that flares back out"; the heavy
    # foot was 0.32 of exponential and the crown flare was 0.48 of smoothstep.
    # The prose described the opposite of what the numbers did. That is the
    # trap: read the curve, not the comment above it.)
    #
    # MONOTONE, AND THE NARROWING IS MOSTLY AT THE TOP. The foot cannot grow
    # much — XLIM 3.13 is the mat wall and the trunk's own fibre crests
    # already stand at 3.12 there, so any more and the socket clamp planes the
    # whole lower flank into the machined face item 7 exists to remove. So the
    # swing is bought at the crown instead, which is also where the eye judges
    # it. Measured on this curve: 2.90 / 2.72 / 2.60 / 2.48 / 2.43 / 2.38 /
    # 2.36 at y 0 / 1 / 2 / 4 / 6 / 9.4 / 12 — strictly decreasing, 23% from
    # foot to crown, no local maximum anywhere above the ground.
    # assert_taper_is_a_stump gates both halves of that sentence on the
    # SILHOUETTE, not on this curve, because the silhouette is what a player
    # sees and the ridges and the splay ride on top of it.
    # The last term is the crown's own taper, and it is not decoration: the
    # splay above the rim adds SPLAY to both surfaces over the top three
    # units, and without something taking it back the outline widens again at
    # y 10.5-11.5 — the inverted taper returning through the back door, on the
    # one stretch of the profile that is entirely in the frame.
    return (2.40
            + 0.50 * math.exp(-y / 2.20)
            - 0.045 * smoothstep(y, 6.6, 11.6)
            - 0.090 * smoothstep(y, 8.4, 12.4))


def wall(y):
    """Wall thickness by height. Thick at the foot, thinner as it rises.

    ROUND 7 RE-CUT IT TO BUY CROWN ROOM. Narrowing base(y) at the top runs
    into a hard floor that has nothing to do with looks: PORTAL_IN declares
    clearR 2.20 at rimY 9.40, assert_approach_clear fires 25 rays down a disc
    of radius 2.09 from y 11.90 to 7.65, and the INNER surface is base - wall.
    So every unit taken off the crown's outer radius has to be found in the
    wall or it comes out of the doorway the engine drops dice through.
    The taper through 5.2-7.6 is where it is found: above the wound (whose
    cut faces ARE the wall thickness the eye reads at the mouth — R1) and
    below the approach column. The wound band keeps 0.60..0.44, unchanged
    within a hair of round 6; the crown runs 0.21 down to 0.15, and wall_at
    takes it to a knife edge at each column's own tear anyway.
    Measured margins at the bake: r_in 2.169 at rimY against a 2.09 ray.
    """
    return (0.60
            - 0.14 * smoothstep(y, 0.9, 5.2)
            - 0.25 * smoothstep(y, 5.2, 7.6)
            - 0.06 * smoothstep(y, 7.6, 11.4))


# THE CHEEK — round 7, item 6.
#
# Between the mouth's lintel and the crown tear there was a large, smooth,
# uniform pale panel with no value break in it: the face's cheek, and the
# quietest surface in the model exactly where the eye rests longest. What it
# needs is vertical grain deep enough to read AT THE TOWER EYE, which is a
# silhouette-scale demand, not a shading one.
#
# IT IS BOUGHT BY CUTTING, NEVER BY RAISING, and that is item 8's law talking:
# the outline's half-width at each row is set by the fibre CRESTS, and the
# taper must not have a local maximum above the foot. Raising the crests in
# this band would put one there — measured, +0.046 at y 7 against a 0.010
# margin. So the grooves between the crests go deeper instead: same relief,
# same grain, and the crest line (hence the outline) is untouched.
#
# HOW DEEP IS SET BY THE WALL, NOT BY TASTE, and this is the round's one real
# collision between two items. Item 8 spent the wall to buy crown room for the
# narrowed base, so through the upper cheek there is only 0.19-0.24 of wall to
# groove into, and a groove may not eat it: CHEEK_WALL_KEEP is the floor.
# Measured depth by height: 0.28 at y 5-6, 0.20 at 6.5, 0.13 at 7, 0.10 at 8.
# So the lower cheek gets real geometry and the upper cheek is carried by the
# paint's striation and its diagonal band. Recorded rather than hidden.
CHEEK_Y = (4.10, 6.20, 8.60, 10.80)
CHEEK_CUT = 0.28
CHEEK_WALL_KEEP = 0.105


def cheek_w(y):
    return (smoothstep(y, CHEEK_Y[0], CHEEK_Y[1])
            * (1.0 - smoothstep(y, CHEEK_Y[2], CHEEK_Y[3])))


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


def shear_at(phi):
    """The slanted break plane, as a height above rimY. Round 7's thesis."""
    return SHEAR_LIFT + SHEAR_AMP * math.cos(phi - SHEAR_DIR)


def front_ramp(phi):
    """How much of the crown survives at this heading — 0 at the tear's low
    point, 1 away from it, and DELIBERATELY LOPSIDED.

    Round 6 used smoothstep(|phi|, 0.30, 0.80): symmetric about the front by
    construction, which put the low point dead centre and a matching shoulder
    on each side of it. Read at the tower eye that is a visor slot. The low
    point moves to TEAR_PHI and the two ramps get different widths, so the
    crown climbs out of the tear fast on one side and slowly on the other and
    the brow has no axis to be mirrored about.
    """
    d = phi - TEAR_PHI
    d = (d + math.pi) % (2.0 * math.pi) - math.pi
    return (smoothstep(d, 0.0, TEAR_W_HI) if d >= 0.0
            else smoothstep(-d, 0.0, TEAR_W_LO))


def y_top(phi):
    """Per-column crown height: a SLANTED broken plane, one dominant shard on
    it, and the tear's low point off centre.

    Clamped at or above rimY so the declared portal number is the honest
    low point of the tear and not an average with a hole under it.
    """
    # THE BROKEN SURFACE FIRST: the slant, plus the rim's own chew. The chew
    # is deep where the trunk tore DOWN (the low side of the shear) and quiet
    # where it sheared clean, which is both what splintering wood does and
    # what keeps the high flank predictable enough to budget against the
    # ceiling.
    sn = 0.5 + 0.5 * math.cos(phi - SHEAR_DIR)            # 1 high, 0 low
    rag_a = RIM_RAG * (RIM_RAG_CLEAN + (1.0 - RIM_RAG_CLEAN) * (1.0 - sn))
    t = shear_at(phi) + rag_a * (fbm_ring(phi, 0.0, 2.6, SEED + 5, 3) - 0.55)
    # THE SPIRES RAISE THAT SURFACE TO THEIR OWN TIP, and never past it.
    #
    # MAX, not sum: two spire ridges close in phi summed to a 14.0 monolith
    # on the first bake. Each blade is its own fiber and keeps its own
    # height, so the tallest number in the recipe is the tallest in the mesh.
    # Since round 7 the number in the recipe is an absolute TIP, so a blade
    # standing on the high side of the shear is short and one on the low side
    # is long — which is what a slanted break through parallel fibres does —
    # and the ceiling is enforced by construction: at the crest the surface is
    # exactly (tip - rimY), everywhere else it is between that and the plane.
    for R in RIDGES:
        if not R["spire_tip"]:
            continue
        k = blade(angdist(phi, crest_at(R, 10.5)), R["w"] * 1.50)
        t = max(t, t + (R["spire_tip"] - PORTAL_IN["rimY"] - t) * k)
    # THE BAYS EITHER SIDE OF THE SHARD. Its relief cannot be bought upward
    # (the ceiling is 0.5 over the high flank; see THE CROWN SHEAR), so it is
    # bought downward: the two fibres flanking a standing splinter are the
    # ones that tore away lowest.
    if TALL is not None:
        c = crest_at(TALL, 10.5)
        t -= SHARD_BAY_D * blade(angdist(phi, c - SHARD_BAY_OFF),
                                 SHARD_BAY_W[0])
        t -= SHARD_BAY_D * blade(angdist(phi, c + SHARD_BAY_OFF),
                                 SHARD_BAY_W[1])
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
    # THE TEAR'S LOW POINT, and it is not on the axis. The front band is
    # driven to zero at TEAR_PHI and then given its own small ragged lift with
    # the -0.05 bias, so the tear still varies across the brow but genuinely
    # TOUCHES 9.40 instead of hovering above it. assert_rim_is_low measures
    # this; the ramp widths are front_ramp's business.
    back = front_ramp(phi)
    t *= back
    t += (1.0 - back) * (0.34 * abs(2.0 * fbm_ring(phi, 0.0, 6.0, SEED + 6, 2)
                                    - 1.0) - 0.05)
    t = max(0.0, t)
    # THE FLOOR IS NOT A LINE — and this is the trap the shear walked into.
    #
    # A slanted break drives the low flank BELOW rimY over a wide arc, and
    # max(0, t) then returns exactly 9.40 for every column in it. Measured on
    # the first round-7 field: 0.70 rad of crown, from -1.92 to -1.22, at the
    # identical height to three decimal places. That is a horizontal boundary
    # in the silhouette, arriving on the very rim that was supposed to abolish
    # one. So the clamped rim gets rubble ON TOP of the floor: positive-only,
    # from max(0, fbm - 0.44), which is EXACTLY zero over the ~half of the
    # ring where the noise is below its threshold — so the declared rimY is
    # still genuinely touched (assert_rim_is_low re-measures it) and the flat
    # is broken everywhere else. Faded out where the rim already stands proud,
    # so it can never add to a spire.
    t += (FLOOR_RUBBLE * max(0.0, fbm_ring(phi, 0.0, 11.0, SEED + 9, 2) - 0.44)
          * (1.0 - smoothstep(t, 0.05, 0.55)))
    return PORTAL_IN["rimY"] + t


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
    # THE ROOT FLARE (round 6) — after the valley, and that is the point.
    # These sit BETWEEN the buttresses, where valley() has just taken 0.52 of
    # wood back out; a finger 0.3-0.6 proud leaves a cut valley with a ridge
    # running through it instead of a refilled skirt.
    fh = finger_h(y)
    if fh > 0.0:
        for G in FINGERS:
            dg = angdist(phi, G["th"] + G["off"] * (1.0 - fh))
            r += G["len"] * fh * blade(dg, G["w"])
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
    # 0.11, not 0.16, since round 7: a splay that reaches 0.16 over the last
    # three units puts a LOCAL MAXIMUM back into the outline above the waist,
    # which is precisely the inverted taper item 8 removes — measured, the
    # outline's half-width at y 11 came back 0.02 wider than at y 6. The
    # liner's copy of the term moves with it (see r_in) so the rim strip
    # cannot re-open at the tip.
    r += SPLAY * smoothstep(y, PORTAL_IN["rimY"] - 0.5, PORTAL_IN["rimY"] + 2.4)
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
    # THE CHEEK'S GROOVES (see CHEEK_Y). Subtractive only — the crest line is
    # the outline, and item 8 forbids a local maximum above the foot.
    cw = cheek_w(y)
    if cw > 0.0:
        ck = 0.0
        for R in RIDGES:
            ck = max(ck, crest(angdist(phi, crest_at(R, y)), R["w"] * 1.15))
        groove = (1.0 - ck) * (0.42 + 0.58 * fbm_ring(phi, y * 0.55, 13.0,
                                                      SEED + 65, 3))
        r -= cw * groove * min(CHEEK_CUT, max(0.0, wall(y) - CHEEK_WALL_KEEP))
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
    r += SPLAY * smoothstep(y, PORTAL_IN["rimY"] - 0.5, PORTAL_IN["rimY"] + 2.4)
    # ...and the liner's rib noise fades out as the column nears its tear.
    # 0.085 of wobble on each surface INDEPENDENTLY is four times the 0.022
    # the wall tapers to, so without this the two faces can simply swap over
    # at a tip and the rim strip turns inside out.
    r += ((0.085 * fbm_ring(phi + 1.7, y * 0.45, 6.0, SEED + 21, 2) - 0.034)
          * (1.0 - smoothstep(y, y_top(phi) - 0.95, y_top(phi) - 0.10)))
    return r - valley(phi, y)


# THE FLARE'S BUDGET IS MEASURED, NOT ESTIMATED — and it has to be, because a
# constant head allowance is wrong by up to 0.9 around this ring. Defined here
# rather than beside the other ridge code because it reads r_out: FINGERS is
# empty while this runs, so what it measures is the trunk WITHOUT its fingers,
# which is exactly the surface each finger has to be budgeted on top of.
def build_fingers():
    out = []
    for k, th in enumerate(FINGER_HEADINGS):
        # the fattest thing already standing at this heading, over the rows a
        # finger actually occupies
        head = max(r_out(th, y) for y in (SHELL_FLOOR, 0.02, 0.14, 0.30)) + 0.04
        room_x = XLIM / max(0.30, abs(math.sin(th))) - head
        cz = math.cos(th)
        room_z = ((ZFRONT + TOE_CREEP - AXIS_Z) / cz - head) if cz > 0.25 else 9.9
        grip = max(0.22, min(0.92, min(room_x, room_z) - 0.10))
        out.append({
            "th": th,
            # 0.50-0.78 of the grip: a finger is not a buttress, and the two
            # have to be legible as different sizes of the same wood.
            "len": grip * (0.50 + 0.28 * h01(k, 151)),
            "w": 0.155 + 0.055 * h01(k, 153),
            "off": (h01(k, 155) - 0.5) * 0.22,
        })
    return out


FINGERS.extend(build_fingers())


CLAMP_TEAR = 0.115                 # how far the mat wall itself is chewed


def x_limit(phi, y):
    """THE MAT WALL, TORN — round 7, item 7.

    The socket clamp is a hard min against a constant, so wherever the field
    runs past it the surface becomes a PLANE at exactly x = +-XLIM. Joe read
    the result off the side views as a sawn plank: a pale machined face at
    x 3.13, y 0.70-0.85, z 0..-0.4, on a model whose whole subject is torn
    wood. The plane is not avoidable — the mat is a real wall and the audit
    measures it — but its FLATNESS is, because the limit does not have to be
    a constant. Subtracting noise from it can only ever move wood INWARD, so
    XLIM stays the ceiling it was and assert_envelope is unaffected, while the
    face that lands on the wall comes out rippled and vertically grained
    instead of milled. The noise is deliberately long in y (features about two
    units) and short in phi, so what the clamp leaves reads as fibre running
    up the flank rather than as a dent.
    """
    return XLIM - CLAMP_TEAR * (0.22 + 0.78 * fbm_ring(phi * 2.7, y * 1.20,
                                                       4.0, SEED + 63, 3))


def clamp_point(r, phi, y, front, back):
    """Polar -> app frame, with the socket clamps applied to the POINT.

    A z-CLAMP, not a z-scale: the trunk stays round wherever it fits and
    flattens only the arc that would actually leave the socket, which is
    what a trunk grown against a wall does. The x cap is by COMPONENT — a
    sign-based cap leaks crests past the mat wall on the back quarter-arcs.
    Both surfaces read the SAME torn limit at the same (phi, y), so the wall
    keeps its thickness across the clamped face.
    """
    sp, cp = math.sin(phi), math.cos(phi)
    if abs(sp) > 0.06:
        r = min(r, x_limit(phi, y) / abs(sp))
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
    x, z = clamp_point(r_out(phi, y), phi, y, z_front(y) - AXIS_Z,
                       ZBACK - AXIS_Z)
    return (x, y, z)


def in_point(phi, y):
    x, z = clamp_point(r_in(phi, y), phi, y,
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
    1.0875 and this has to stay under it with room to spare.
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

W_PHI0 = 1.46          # half-width in phi at the widest, ON THE RIGHT.
W_SIDE_L = 0.892       # ...and the LEFT jamb comes in to 0.892 of that, phi
#                        1.302. Round 7, item 5: the visible tear must not be
#                        mirror-symmetric about x = 0.
#
# WHY THE ASYMMETRY IS 0.158 RAD AND NOT MORE, measured the hard way. The
# throat's outermost ray leaves z -1.5 at x -1.995, which is heading
# atan2(1.995, 1.05) = 1.086 rad, and it sweeps back to 0.512 as it runs
# forward. Every one of those headings needs the lintel above the box top at
# 4.4125. Narrowing a jamb does not just move its corner: it moves the whole
# arch inboard, so the same HEADING lands nearer the corner and lower. At
# W_SIDE_L 0.86 the left arch came down to 4.365 at phi 1.086 — measured, and
# check.py's ray found it before this comment existed. 1.302 is the width
# that puts the left arch back on round 6's own 4.55 there. So the opening is
# 0.158 rad (0.43 of world arc) wider on the right, not the 0.75 the brief
# asked for, and the rest of item 5 is carried by the lintel instead.
W_TILT = 1.30          # world units the LINTEL is lifted at the right end...
W_TILT_LO = 0.34       # ...and pressed down at the left, BUT NEVER PAST ITS
#                        OWN HEADROOM. The right-hand lift is an expansion and
#                        can only remove wood; the press is the one contracting
#                        move in this loop, and the first round-7 cut made it a
#                        flat 0.36 and duly put the lintel at 4.375 inside a
#                        throat box that stops at 4.4125 — check.py's ray found
#                        it. So the press is now clipped to whatever headroom
#                        the point actually has over THROAT_Y1 + LINTEL_FLOOR:
#                        deep near the middle where the arch is 0.5 clear,
#                        exactly zero out at the exit fan's edge where it is
#                        not. Self-limiting by construction rather than by a
#                        constant somebody has to keep in sync.
LINTEL_FLOOR = 0.16    # headroom the press must leave over the throat box
# TWO OR THREE LONG SPLINTERS, hanging DOWN off the lintel at irregular phi.
# (phi, length, half-width in rad). Lengths and places are constrained by the
# throat, not by taste: inside |x| <= 1.995 the lintel may not come below
# 4.4125, so the long ones live where the lintel has been lifted (the right)
# or outside the throat's x band, and the one near the middle is short.
# assert_lintel_clears_the_throat re-measures every one of them on the loop.
W_SPLINTERS = ((+0.72, 0.60, 0.145),
               (-0.34, 0.26, 0.115),
               (+1.06, 0.36, 0.160))
W_YC = 2.925           # the wound's centre height (was 4.30)
W_YUP = 2.025          # -> torn arch tops out at 4.95 — the rag above the
#                        3.50 door's lintel (4.50) tightens from +1.35 to
#                        +0.45, because the VISIBLE hole is the rag, not
#                        the contract rectangle, and the tall read Joe
#                        called lived in that slack. Teeth-max ~5.6 stays
#                        far under the despawnY 7.65 ceiling (the old
#                        mid-air-vanish constraint, now with 2.0 of room).
W_YDN = 2.025          # -> threshold sits at 0.90, exactly as before —
#                        the tongue relationship (R4) is untouched.


def w_exp(a):
    """Superellipse exponent by direction: round at the top and sides,
    nearly square along the bottom, where the threshold lives."""
    return 3.5 + 9.0 * max(0.0, -math.sin(a)) ** 2


W_ARC = 2.75           # phi -> world arc length at the wound's radius
W_TOOTH_LAM = 0.86     # splinter wavelength, WORLD units
W_TOOTH_AMP = 0.42     # deepest splinter bay, WORLD units
W_LOOP_M = 124         # boundary samples, uniform in ARC LENGTH — scaled
#                        with the tightened wound's ~20% shorter perimeter
#                        so tooth SAMPLING DENSITY matches round 4 (152 on
#                        the old loop); also what pays the tri budget for
#                        the extra wall the smaller wound leaves standing.

# THE LOWER CORNERS COME IN — R2, and the room it is allowed to use is
# MEASURED, not guessed.
#
# check.py fires the exit rays along +z from z = -1.5 at |x| <= 1.995 (the
# 4.20 door). The outermost of them, at x = 1.995, is at phi =
# atan2(1.995, 1.05) = 1.086 rad where it is deepest, and it never reaches
# a larger |phi| than that anywhere along its run. So every radian of the
# wound beyond |phi| 1.086 is invisible to the gate, and the wound runs to
# 1.30 plus its rag — jamb wood the contract never probes. W_CORNER_U0
# 0.870 starts the fillet at phi 1.131, keeping 0.045 rad of margin over
# the ray (the same allowance the 5.00 door carried at 1.197 vs 1.155),
# and assert_throat_clear re-proves it on the triangles.
#
# This is also what buries the delivery tongue's end cap (R4b): with the
# corners square the wall was cut away out to |x| 2.93 at sill height, so the
# tongue's back face stood in open air beside the mouth and rendered as a
# black rectangle. Filled corners give it something to hide behind.
# ROUND 7 STATES IT IN PHI, NOT IN u, and it has to: with the two jambs at
# different half-widths a fixed u threshold means two different headings, and
# the one that matters is the heading, because that is what the throat ray
# knows about. The fillet starts at 1.131 rad on BOTH sides — 0.045 over the
# outermost throat ray at 1.086 — and runs to that side's own outer limit, so
# the narrow (left) jamb has less room to sweep up in and gets a proportionally
# smaller haunch rather than a near-vertical one. A fillet that outruns its
# span is how the loop self-intersects and annihilates the shell (see build()).
W_CORNER_PHI0 = 1.131
W_CORNER_SPAN = 0.24   # the span a FULL lift wants; less room, less lift.
#                        Calibrated on round 6, which swept 0.92 of sill up
#                        over 0.247 rad without the loop self-intersecting, so
#                        that is the span a full haunch is known to fit in. At
#                        0.32 the left haunch came out 0.20 shallower than
#                        round 6's and assert_no_hole_below_the_crest caught it
#                        immediately: 21 sight lines into the cavity under the
#                        crest at x -2.99. The corner fillet is not decoration
#                        — it is half of what closes the flank slot.
# THE SLOT BESIDE THE RAMP, CLOSED IN THE WOOD (2026-08-13). Joe chose this
# over asking the mound to keep hiding it: "make a visible mound that's not
# load bearing for the dice".
#
# The corner fillet ramps from ZERO at 1.131, so immediately outside the
# throat the sill is still at its base 0.90 — under the ramp's crest at 1.046
# — and what a player sees there is a slot into the hollow. That is the cavity
# assert_no_hole_below_the_crest has been measuring all along, and the mound's
# wings used to be the lid. A ramp cannot close it; only a step can.
#
# So outside the outermost throat ray the sill JUMPS clear of the crest over a
# tenth of a radian, and the corner fillet carries on from there (max of the
# two, so the haunch still wins where it is taller). Inside the ray nothing
# moves: the sill stays at 0.90, well under the 1.0875 the dice need.
# MEASURED, not inherited. The neighbouring comment calls the outermost throat
# ray "1.086 rad", and in THIS function's units (phi_b = arc / W_ARC) that is
# arc 2.99, which is x 2.49 — half a unit outboard of where the throat actually
# ends. Keyed there the step lifted wood nobody could see and left the slot
# wide open; the sill profile printed 0.74-0.90 out to x 2.5 against a
# 1.046 crest, which is the measurement that found it. The throat's outer ray
# is at x 1.995, which on this trunk is arc 2.165, i.e. phi_b 0.787. 0.82 sits
# a hair outboard of that: nothing a die passes through moves.
# WHERE THE FLOOR BEGINS, and it is inboard of the throat on purpose. The
# portal contract reserves the doorway from THROAT_Y0 (1.0875) UP; everything
# below that line is wood's to have, at any heading. So the floor does not
# have to hide outside x 1.995 — it only has to stay under 1.0875, which it
# does by 0.023. That is what lets it close the opening from x ~1.55
# outward, which is the actual shape of Joe's complaint: "the exit hole
# extends below the ramp's highest point".
W_THROAT_PHI = 0.56    # x ~1.55 at the front — the gate's own inner bound
# 0.16, AND THE SIZE IS A PROOF RATHER THAN A TASTE. The sill has to land
# between two numbers that are 0.04 apart: ABOVE the ramp crest (1.046) or the
# slot stays open, and BELOW the throat floor (1.0875) or it eats the dice's
# flight envelope. 0.90 + 0.16 = 1.06 is inside that window by 0.014 and
# 0.027. Every earlier attempt lifted to 1.24 and was refused by the throat
# probe at a different depth each time — not because the heading was wrong,
# but because the height was: no heading exists at which 1.24 is legal, since
# the cutter's footprint is constant in radius and at the bore's own radius
# every heading maps inside |x| 1.995. assert_sill_is_in_the_window is the
# check, and since 2026-08-13 it is a refusal rather than a printout.
W_SILL_FLOOR = 1.065   # above the 1.046 crest, under the 1.0875 throat
W_CORNER_LIFT = 0.92   # world units the sill rises at the extreme corner
#                        (was 1.55 — scaled with the door height so the
#                        corner fillet keeps its proportion of the mouth)


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
        u, v = w_base(a)
        # THE TWO JAMBS ARE NOT THE SAME WIDTH (round 7, item 5). The scale is
        # applied HERE, to the smooth boundary, so everything downstream —
        # the arc-length resample, the outward normals, the rag, the table
        # in_wound reads — inherits one asymmetric shape instead of each
        # deriving its own. smoothstep from u = 0 means there is no kink on
        # the axis where the two halves meet.
        u *= 1.0 - (1.0 - W_SIDE_L) * smoothstep(-u, 0.0, 0.55)
        pts.append(uv_to_world(u, v))
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
        # ...AND THE UPPER LIP GETS NO PERIODIC TERM AT ALL (round 7, item 4c).
        #
        # The cosine above has a FIXED WAVELENGTH. Down the jambs and along
        # the buried threshold that is invisible; along the near-horizontal
        # lintel it is a scallop, and a regular scallop over a dark opening is
        # a row of teeth — half of what Joe read as a mouth. Phase noise does
        # not fix it, because the eye reads the SPACING, and the spacing was
        # still 0.86 everywhere. So the lintel's rag is built from three
        # value-noise octaves at mutually incommensurate rates, on a domain
        # that is itself warped: there is no wavelength in it to find.
        sw = s + 0.85 * n1(s * 0.47, SEED + 95)
        rag = (0.55 * n1(sw * 1.23, SEED + 87)
               + 0.30 * n1(sw * 2.87 + 11.0, SEED + 89)
               + 0.15 * n1(sw * 5.31 + 3.0, SEED + 93))
        upper = smoothstep((ay - W_YC) / W_YUP, 0.12, 0.55)
        lobe = lerp(lobe, smoothstep(rag, 0.26, 0.80), upper)
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
        # THE LINTEL IS A DIAGONAL TEAR, NOT AN ARCH (round 7, item 4a).
        #
        # A superellipse top is an arch: it peaks on the axis and falls away
        # equally on both sides, which is a mouth however ragged you make its
        # edge. A trunk tears ONE WAY. So the lintel climbs monotonically
        # across the opening, with the same handedness as the crown shear —
        # both rise toward +x — and the two boundaries stop being parallel
        # horizontals: the wood between them is a band that slants, and the
        # cheek stops being a panel between two ledges.
        #
        # The lift on the right is an EXPANSION (wood removed, always legal).
        # The press on the left is the one move in this file that contracts
        # the opening, so it is bounded by measurement rather than by taste
        # and assert_lintel_clears_the_throat re-proves it on the built loop.
        phi_b = bx / W_ARC
        uu = abs(bx) / W_ARC / W_PHI0
        if by > W_YC:
            vv = (by - W_YC) / W_YUP
            w = smoothstep(vv, 0.05, 0.40)
            us = bx / W_ARC / W_PHI0
            by += w * W_TILT * max(0.0, us)
            head = max(0.0, by - (THROAT_Y1 + LINTEL_FLOOR))
            by -= min(w * W_TILT_LO * smoothstep(-us, 0.10, 0.70), head)
            # THE SPLINTERS. A tent, not a bell: blade() has a rounded summit
            # and a splinter has a point.
            for sp_phi, sp_len, sp_w in W_SPLINTERS:
                dd = abs(phi_b - sp_phi)
                if dd < sp_w:
                    by -= sp_len * w * (1.0 - dd / sp_w) ** 0.85
        # THE CORNER FILLET (see W_CORNER_PHI0). The threshold sweeps UP
        # toward each jamb, so the mouth loses its square bottom corners and
        # gains two haunches of solid wood. It is applied AFTER the rag so the
        # fringe rides the new sill instead of being flattened by it, and it
        # only ever moves the boundary UP — the loop stays simple, and wood
        # is only ever added to the lower corners, never taken from the
        # doorway. The span is that side's own, so the narrow jamb gets a
        # smaller haunch instead of a vertical one.
        elif by < W_YC:
            lim = W_PHI0 * (W_SIDE_L if bx < 0 else 1.0) * 1.06
            span = lim - W_CORNER_PHI0
            haunch = 0.0
            if span > 0.02:
                haunch = (W_CORNER_LIFT * min(1.0, span / W_CORNER_SPAN)
                          * smoothstep(abs(phi_b), W_CORNER_PHI0, lim))
            by += haunch * smoothstep((W_YC - by) / W_YDN, 0.20, 0.92)
            # THE SILL FLOOR — a CLAMP, not a lift, and that is the difference
            # between closing the slot and not. Adding 0.16 put the nominal
            # sill at 1.06, inside the 0.04 window; the threshold's own rag
            # then wandered +-0.05 about it and the sill measured 1.01 —
            # back under the 1.046 crest, slot still open. The noise is wider
            # than the window, so no additive lift can ever land inside it.
            # A floor can: the rag keeps every excursion it makes UPWARD and
            # simply cannot go below, so the sill is 1.065 or higher out here
            # by construction, and never the 1.0875 the throat needs.
            by = max(by, lerp(W_YC - W_YDN, W_SILL_FLOOR,
                              smoothstep(abs(phi_b), W_THROAT_PHI,
                                         W_THROAT_PHI + 0.10)))
        loop.append(world_to_uv(bx, by))
    return loop


WOUND_LOOP = build_wound_loop()


# THE 0.04 WINDOW, AS A REFUSAL. The wound's lower edge has to land between
# two numbers that are 0.042 apart, and which of the two binds depends on
# where along the mouth you stand:
#
#   |x| <= 1.995   the dice's own half-width. The sill must stay UNDER
#                  THROAT_Y0 (1.0875) or it eats the flight envelope, and the
#                  exit gate will say so — but only at the five x it samples.
#   |x| >  1.995   no die passes here, and the sill must stand OVER the ramp's
#                  crest (1.0456) or what a player sees beside the doorway is
#                  a slot into the hollow. That is W2c.
#
# This was a REPORT for its whole life — it printed the sill against the crest
# and a human read the row of numbers — and it is what found the last two
# defects in this area (a step keyed half a unit outboard of the throat; a rag
# whose noise was wider than the window it had to land in). A measurement good
# enough to find two defects is good enough to refuse the third, so it
# refuses. It reads the BUILT loop rather than the schedule that generated it:
# the floor, the corner fillet and the rag all compose in build_wound_loop,
# and only the composition is the sill.
SILL_WINDOW_EPS = 0.002    # loop sampling, not slack: adjacent samples of the
#                            same edge differ by ~1e-3 in y


def assert_sill_is_in_the_window():
    """The wound's lower edge, judged in x against the two lines it lives
    between. Prints the profile it judged — that row of numbers has earned
    its place."""
    crest = lane_plane(LANE_Z0)
    lo, low_in, high_out = {}, None, None
    for u, v in WOUND_LOOP:
        if v >= 0:
            continue
        arc, y = uv_to_world(u, v)
        phi = arc / W_ARC
        x = out_point(phi, y)[0]
        if abs(x) <= THROAT_HALF_W:
            if y > THROAT_Y0 + SILL_WINDOW_EPS and (
                    low_in is None or y > low_in[1]):
                low_in = (x, y)
        elif y < crest - SILL_WINDOW_EPS and (
                high_out is None or y < high_out[1]):
            high_out = (x, y)
        xb = round(abs(x) / 0.25) * 0.25
        lo[xb] = min(lo.get(xb, 1e9), y)
    cells = [f"{xb:+.2f}:{lo[xb]:.2f}{'!' if lo[xb] < crest else ''}"
             for xb in sorted(lo)]
    print(f"[bole] sill vs crest {crest:.3f} / throat floor {THROAT_Y0:.4f} "
          f"(! = under the crest, legal only inside |x| {THROAT_HALF_W:.3f})")
    print("[bole]   " + "  ".join(cells))
    if low_in is not None:
        raise RuntimeError(
            f"the sill stands at y {low_in[1]:.4f} at x {low_in[0]:+.3f} — "
            f"inside the throat (|x| <= {THROAT_HALF_W}) and OVER the doorway "
            f"floor {THROAT_Y0:.4f}. That is the dice's flight envelope; the "
            f"floor step (W_SILL_FLOOR {W_SILL_FLOOR}) has reached inboard of "
            f"where it is allowed to (W_THROAT_PHI {W_THROAT_PHI})")
    if high_out is not None:
        raise RuntimeError(
            f"the sill sits at y {high_out[1]:.4f} at x {high_out[0]:+.3f} — "
            f"outside the throat and UNDER the ramp's crest {crest:.3f}, so "
            f"there is a slot into the hollow beside the doorway with nothing "
            f"under it. W2c, exactly: raise W_SILL_FLOOR or widen the corner "
            f"fillet (W_CORNER_PHI0 {W_CORNER_PHI0})")

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
# THE LANE — the engine's ramp and lip, and what is left of the mound
# --------------------------------------------------------------------------
# RETIRED, 790ed90: "The mound is deleted, and the wood closes its own hole."
# Round 6 built an earthen BANK over the delivery ramp — a footprint of plan
# lobes carrying a summed height field, the dice path carved back through it,
# wings, root ridges, clods, a feathered toe, and four gates of its own. Joe
# killed it in three sentences, the third being "just delete it now", because
# it was doing four jobs at once and only one of them was being a mound. The
# shipped GLBs contain exactly three meshes — Shell, Curtain, Shelves — and no
# bank of any kind.
#
# WHAT DELETING IT LEFT BEHIND, and this is why the section still exists.
# Nothing built the mound any more, but its FIELD FUNCTIONS still evaluated,
# and a live gate was still asking them: assert_no_hole_below_the_crest
# short-circuited its ray march on berm_top(), so every sight line that would
# have shown the flank slot was stopped by a phantom — and HOLE_MAX_OUT sat at
# 16 excusing "the holes the shipped mound measures", of a mound that had not
# existed for a commit. Two more functions (assert_lane_is_clear,
# assert_berm_pressed_home) read like live gates and were called by nothing.
# All of it is gone as of 2026-08-13; the gate that mattered now marches BUILT
# TRIANGLES and expects zero. What survives here is only the arithmetic of the
# ENGINE's own two surfaces, which the wound's threshold is still measured
# against.
#
# Measured off the apron box rather than copied from its comment: rotate the
# top face (local y = +s/2) about x by APRON_RX and the plane comes out as
# y = 0.9937 - 0.5333 z, meeting the felt at z 1.863. PROUD is what a skin
# would stand clear of the collider by, if anything still clad it.
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
# THE LANE'S HIGHEST POINT, which is the number the wound's threshold is
# judged against. -0.06 gives a top of 1.0456, 0.042 under the exit gate's
# floor (THROAT_Y0 1.0875) — and very nearly the last z with any margin at
# all, because the collider plane crosses that bar at z -0.138. It kept its
# meaning through the mound's deletion: nothing is built here any more, but
# "the ramp's highest point" is still where Joe's sentence about the exit hole
# puts its bar (assert_no_hole_below_the_crest, assert_sill_is_in_the_window).
LANE_Z0 = -0.06


def lane_plane(z):
    """The engine's own ramp/lip surface, PROUD-lifted. Nothing of this model
    rides it — the ramp and the lip are deliberately bare — but it is still
    where a die's feet are, so it is still what a threshold must clear."""
    return max(RAMP_Y - RAMP_K * z, LIP_Y - LIP_K * z) + PROUD



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
# ROUND 7 MOVED IT OUT OF THE BORE AND INTO THE WALL, and item 8 is the whole
# reason. Narrowing the crown took the liner's radius from 2.52 to 2.17, and
# the approach column is 2.09: the annulus a curtain used to live in — inside
# the liner, 0.24 of it — simply stopped existing. Measured on the round-7
# field, r_in runs 2.168-2.230 through the whole band while r_out runs
# 2.365-2.458, so the only 0.15 of room left is INSIDE THE WALL. So that is
# where it goes: a constant-radius band at 2.235-2.310, enclosed by the shell
# below each column's tear (invisible, and it has no work to do there — the
# shell is doing it) and emerging above the tear where it does. Capped against
# r_out so it can never break the skin, and the cap is measured at every
# sample rather than assumed. The first round-7 bake put the old inset curtain
# 11 rays deep into the approach column; that is the failure this replaces.
CURTAIN_RIN = 2.235        # its INNER face. The approach column is 2.09.
CURTAIN_WALL = 0.075       # its thickness
CURTAIN_CLEAR = 0.055      # ...and how far it stays inside the trunk's skin
CURTAIN_ZF = 0.00          # its front plane, 0.06 behind the liner's clamp
CURTAIN_M = 20             # columns: 18 deg, sagitta 0.03 at r 2.8 — under the
#                            0.07 floor, and this is the coarseness the tri
#                            budget buys instead of taking tris off the crown
CURTAIN_ROWS = 3
# ROUND 8 BURIES IT, and the reason is that it was never buying anything a
# player could perceive — it was buying RAYS, and the rays were aimed wrong.
#
# Joe, on the round-7 frame: "I don't think we need the black cylinder visibly
# sticking out the top of the stump." He was right, and the measurement is
# unambiguous. Muting this object in the app and re-running towerOcclusionCheck
# named every ray it was the sole carrier of: all of them at y 9.90 or 11.25,
# against a declared rimY of 9.40. Every one was ABOVE THE RIM — a point in
# open air over a broken crown, where a die is still visibly falling in and is
# MEANT to be seen. The SHAFT band, which is the one that actually proves the
# despawn is unwatchable, held 99/99 at all six eyes with this object gone.
#
# The band was mis-derived rather than mis-built: it rides 1.6*S above the
# mouth, which is inside the building for a hooded architectural tower and is
# SKY for a stump. js/main.js now caps the sampled band at the rim (v.cowlY),
# so what this object owes is nothing, and what it must not do is show.
#
# So its top is clamped UNDER the shell's own crown at its own heading. It is
# radially inside the skin already (CURTAIN_CLEAR), so once it is also under
# the tear it is enclosed on every sightline: the liner stands between it and
# any eye looking into the bore, and above the liner it has stopped existing.
# Invisible BY CONSTRUCTION — which is the only honest kind here, because
# three.js does not test `visible` in intersectObject: a mesh hidden with
# `visible = false` still blocks the occlusion raycast, so "invisible" and
# "occluding" cannot both be true of the same surface. assert_curtain measures
# the burial on the built mesh.
CURTAIN_BURY = 0.12        # how far under the crown its top edge stays
# ...and the floor the GATE holds it to, which is deliberately not the same
# number. Clamping to exactly CURTAIN_BURY puts the top row ON the gate's
# threshold, where the comparison is decided by the last bit of a float — the
# first run of this gate failed with "breaks the skyline by 0.000". A gate
# whose verdict is a rounding artefact tests nothing, so it holds the mesh to
# half the clamp: the design keeps 0.12, the refusal fires at 0.06, and
# deleting the clamp entirely still fails it by more than two units.
CURTAIN_BURY_MIN = 0.06


def curtain_top_at(phi):
    """Tall across the front, gone by the flanks — then clamped UNDER the
    crown so no part of it can break the skyline (see ROUND 8 BURIES IT).

    The clamp takes the MINIMUM of y_top over the arc this column spans, not
    y_top at the column itself. The curtain is swept at 20 columns and the
    shell at 72: a top edge that only cleared the crown at its own heading
    would still cut through it in between, where the quad's straight top edge
    runs over a dip the coarse sweep never sampled.
    """
    a = abs(phi)
    t = CURTAIN_TOP - 0.34 * smoothstep(a, 0.30, 0.95)
    t -= (t - 8.90) * smoothstep(a, 1.05, 1.50)
    t -= CURTAIN_TEAR * fbm_ring(phi, 0.0, 5.0, SEED + 71, 2)
    step = 2.0 * math.pi / CURTAIN_M
    crown = min(y_top(phi + step * (k / 8.0 - 1.0)) for k in range(17))
    # …and never below the bottom edge: a column whose crown sits under
    # CURTAIN_BOT collapses the band to a sheet rather than merely shortening
    # it, and a zero-height quad ring is the degenerate the manifold gate
    # would have to catch downstream instead of here.
    return max(CURTAIN_BOT + 0.05, min(t, crown - CURTAIN_BURY))


def curtain_ro(phi, y):
    """The curtain's OUTER radius: a constant band, capped so it can never
    break the trunk's skin or cross the socket plane.

    The front is a RADIUS rule, not a z-clamp. clamp_point flattens both of a
    wall's surfaces onto the same plane, which is fine for the shell (its two
    clamps are 0.16 apart) and fatal for a thin band: both faces would land on
    one plane and the solid would collapse to a sheet. Deriving the inner face
    from the outer one keeps the two CURTAIN_WALL apart everywhere by
    construction, including across the flat front plate.
    """
    return min(CURTAIN_RIN + CURTAIN_WALL,
               r_out(phi, y) - CURTAIN_CLEAR,
               (CURTAIN_ZF - AXIS_Z) / max(0.25, math.cos(phi)))


def curtain_r(phi, y, inset):
    return curtain_ro(phi, y) - inset


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
        for inset, seq in ((0.0, ys), (CURTAIN_WALL, list(reversed(ys)))):
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


# --------------------------------------------------------------------------
# THE VENUE'S OWN GROUND, copied here so the model can meet it
# --------------------------------------------------------------------------
# SOURCE: js/fae-lab.js buildGround(), which paints the glade floor from
# FAE_PALETTES — a radial gradient of `ground` -> `deepGround` -> `void`, then
# moss in two scales: `bed` = THREE.Color(pal.ground).lerp(pal.bark, 0.45) and
# `lit` = THREE.Color(pal.moonEdge).
#
# THIS IS A HAND COPY AND IT DRIFTS SILENTLY. If the venue re-tunes its floor,
# nothing here fails — the model simply stops matching the ground it stands
# on, which is a seam, which is the whole thing round 6 exists to remove. The
# tell would be a value step at the berm's toe in an in-app frame, so that is
# what a future round should look at first.
#
# MEASURED, and the measurement changed the plan. The socket sits at r ~ 4.5
# of a 120-unit disc, well inside the gradient's first stop, so what the
# ground actually IS under this model is `ground` itself. The moss dabs land
# at 5-18% alpha AND arrive darker than their names: buildGround writes
# THREE.Color components — which are LINEAR once colour management has
# converted the hex — into an rgba() string that the sRGB canvas reads back as
# 0-255 sRGB, so `bed` displays at lum 0.0034 rather than 0.042, twelve times
# under its nominal value. So `floor` is what the berm blends toward for
# VALUE, and bed/lit only steer its hue.
GROUND_MOSS = {
    "moonrise": {
        "void": srgb("#090c16"),           # pal.void       lum 0.0029
        "deep": srgb("#17203a"),           # pal.deepGround lum 0.0135
        "floor": srgb("#232f4e"),          # pal.ground     lum 0.0294
        "bed": (0.02414, 0.04089, 0.10938),  # ground->bark 0.45, lum 0.0423
        "lit": srgb("#4a5c86"),            # pal.moonEdge   lum 0.1083
    },
    "foxfire": {
        "void": srgb("#05080a"),           # lum 0.0023
        "deep": srgb("#101c14"),           # lum 0.0099
        "floor": srgb("#1a2c1e"),          # lum 0.0212
        "bed": (0.02058, 0.03837, 0.01847),  # lum 0.0332
        "lit": srgb("#5a7a6e"),            # lum 0.1722
    },
}


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


# THE EARTH, DERIVED AND NOT AUTHORED, and BAKED DARK — round 6b.
#
# The first round-6 paint took the berm to the glade FLOOR's own value (crest
# lum 0.044 against a floor of 0.029) on the reasoning that a surface which is
# the ground should be painted like the ground. The frames refused it: at that
# value the mound came back mid-value blue-grey and read as moulded plastic,
# because the lane is a broad plane facing straight up at the key while the
# trunk is curved and half self-shadowed, and equal albedo is not equal value
# (the round-4 measurement, still true).
#
# So the soil comes out of the DARK end of the venue's own family — void and
# deepGround, the two stops the glade's floor falls through — and the light is
# left to do the rest. Measured: body lum 0.0117 / 0.0070, deep 0.0060 /
# 0.0040, worn path 0.0181 / 0.0126, against a trunk mid of 0.106 and a floor
# of 0.029. Everything the berm wears is under the ground it sits in, which is
# what a shadowed bank of earth is.
# ...and the first mound bake overshot it. void->deepGround at 0.80 put the
# body at lum 0.0117 against a glade floor of 0.0294, and the frames came back
# with a black puddle: at two and a half times UNDER the ground it stands in,
# earth stops reading as earth and reads as the shadow of something. The body
# is mixed toward the FLOOR instead and the crevices keep the deep end. And
# the mix is only half of it: the paint stacks four darkening terms on the
# body (crevice, grit, the trunk's shadow, moss), so a bake at 0.55 still
# RENDERED at 0.62x the glade floor and read as a stain. Measured on rendered
# pixels, ray-classified by mesh, against the venue's own floor tone under the
# model: body albedo 0.0249 with the stack eased lands the mound at ~0.82x the
# floor and ~0.80x the lit bark band — under the trunk, continuous with the
# ground, which is what a shadowed bank of earth is.
EARTH_BODY_MIX = 0.90      # void -> ground, the mound at large
EARTH_DEEP_MIX = 0.45      # void -> ground, its crevices
EARTH_PATH_MIX = 0.62      # deepGround -> ground: packed dirt, worn by dice
EARTH_PATH_DESAT = 0.34    # ...and pulled toward its own grey: dust, not moss
CREEP_MIX = 0.55           # moss creep: the model's moss, pulled to the floor

for _v, _g in GROUND_MOSS.items():
    _p = PALETTES[_v]
    _p["ground_floor"] = _g["floor"]
    _p["ground_bed"] = _g["bed"]
    _p["ground_lit"] = _g["lit"]
    _p["earth"] = lerp3(_g["void"], _g["floor"], EARTH_BODY_MIX)
    _p["earth_dark"] = lerp3(_g["void"], _g["floor"], EARTH_DEEP_MIX)
    _path = lerp3(_g["deep"], _g["floor"], EARTH_PATH_MIX)
    _grey = sum(_path) / 3.0
    _p["earth_path"] = lerp3(_path, (_grey, _grey, _grey), EARTH_PATH_DESAT)
    _p["creep"] = lerp3(_p["moss"], _g["floor"], CREEP_MIX)
del _v, _g, _p, _path, _grey


# THE MOSS CREEP (round 6, change C). The venue's ground moss climbs the foot
# of the trunk and the root flare, and its upper edge is NOISE-BROKEN because
# a clean one is a waterline and a waterline is the seam rule 11 names. Low
# (0.30) on the lit front, high (0.80) in the shaded valleys, with a second
# patch field cutting holes in it so the boundary is islands rather than a
# line.
CREEP_LO = 0.30
CREEP_HI = 0.80
CREEP_SOFT = 0.30       # how far above its own edge a patch fades out
CREEP_K = 0.86          # strength where the creep is solid
# ...and the flare goes the other way: wood at the top of each finger, soil at
# the tip. Driven by how PROUD of the base cylinder a point stands, so it lands
# on roots, toes and fingers and never on the bare trunk between them.
SOIL_K = 0.72
# THE DIAGONAL SCAR BAND (round 7, item 6). 0.52 rad is 30 degrees off
# vertical; the half-width is in the same world units as the unrolled surface,
# so a 1.35 band is about 2.7 units of wood measured across itself.
BAND_TILT = 0.52
BAND_P0 = -2.35
BAND_HALF = 1.55
BAND_BARK = 0.68
BAND_MOSS = 0.50
CHEEK_GAIN = 1.75        # striation contrast through the cheek band


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
        # THE CHEEK'S GRAIN IS PUSHED, NOT REPAINTED (round 7, item 6). The
        # geometry can only groove this band as deep as the wall allows —
        # 0.28 at y 5.5 but 0.10 by y 8, because item 8 spent the wall on
        # crown room — so above the waist the striation has to be carried by
        # value. Same field, more contrast: the mid holds and the ends spread,
        # so nothing new is invented and the furrows simply stop being
        # suggestions. Contrast, not brightness: the band's mean is unchanged.
        cwk = cheek_w(y)
        if cwk > 0.0:
            lum = lerp(lum, (lum - 0.5) * CHEEK_GAIN + 0.5, cwk)
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

        # THE ROOT FLARE DIVES INTO SOIL (round 6). Not a height band — a
        # height band paints the whole foot mud and loses the flare in it.
        # PROUDNESS is the discriminator: how far this point stands outside
        # the base cylinder is exactly "am I on a root", so the fingers, the
        # toes and the buttress feet darken into earth at their tips while the
        # bare trunk between them keeps its wood.
        proud = max(0.0, r - base(y) - 0.10)
        soilk = (smoothstep(proud, 0.03, 0.34)
                 * (1.0 - smoothstep(y, 0.02, 0.72))
                 * (0.55 + 0.45 * fbm_ring(phi, y * 1.6, 6.0, SEED + 55, 2)))
        c = lerp3(c, pal["earth_dark"], SOIL_K * soilk)

        # THE MOSS CREEP (round 6). The venue's own ground moss climbing the
        # lower trunk, with an edge broken TWICE: the height of the edge
        # wanders with phi, and a second patch field punches holes through it,
        # so nothing anywhere reads as a level line.
        edge = lerp(CREEP_LO, CREEP_HI,
                    fbm_ring(phi * 1.0, 0.0, 3.2, SEED + 57, 3))
        edge += 0.34 * shade                    # deepest in the shaded arc
        creepk = 1.0 - smoothstep(y, edge - CREEP_SOFT, edge + 0.08)
        creepk *= (0.30 + 0.70
                   * smoothstep(fbm_ring(phi, y * 1.3, 8.0, SEED + 59, 3),
                                0.30, 0.66))
        c = lerp3(c, pal["creep"], CREEP_K * creepk)

        # THE DIAGONAL SCAR BAND (round 7, item 6) — the cheek's value break,
        # and the one rule about it is that it must not be another horizontal.
        #
        # Everything else that crosses this trunk runs level: the bark
        # remnants are a height band, the moss creep is a height band, the
        # lichen is a height band. Three level bands over a level mouth is
        # what built the face. This one runs at BAND_TILT off vertical, on
        # the perpendicular coordinate of the unrolled (arc, y) surface, so
        # it cuts the cheek corner to corner. Its centre line wanders with
        # noise and a second field punches holes through it, so it is a run
        # of old bark and moss down a scar, not a painted stripe.
        #
        # Windowed off the seam by construction (fw falls to 0 by |phi| 1.45)
        # — arc is discontinuous at +-pi and a band that reached it would zip.
        arc = phi * 2.85
        pcoord = (arc * math.cos(BAND_TILT) - y * math.sin(BAND_TILT)
                  + 0.62 * fbm_ring(phi, y * 0.42, 2.2, SEED + 67, 3))
        bandk = (1.0 - smoothstep(abs(pcoord - BAND_P0), BAND_HALF * 0.45,
                                  BAND_HALF))
        fw = max(0.0, 1.0 - (abs(phi) / 1.45) ** 2)
        bandk *= fw * smoothstep(y, 3.10, 4.60) * (1.0 - smoothstep(y, 9.6, 11.2))
        bandk *= 0.22 + 0.78 * smoothstep(
            fbm_ring(phi * 1.6, y * 0.75, 6.0, SEED + 69, 3), 0.30, 0.62)
        if bandk > 0.0:
            c = lerp3(c, pal["bark"], BAND_BARK * bandk)
            c = lerp3(c, pal["moss"], BAND_MOSS * bandk * (0.30 + 0.70 * (1.0 - crestk)))

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


# ROUND 4'S TONGUE PAINT AND ROUND 6'S SOIL PAINT ARE BOTH RETIRED, and the
# reason is the strongest evidence in this file for VENUE-COMPOSITION rule 11.
#
# Round 4 measured the delivery tongue rendering at 1.35x the lit bark band
# and took it to 0.80x with a scalar gain of 0.39 — measured on RENDERED
# pixels, ray-classified by mesh, predicted to 0.0001. Every number in it was
# right and it did not work: the app's next look pass still called the surface
# a gangplank and Joe's W2c verdict called it "not part of the immersion". A
# re-tinted prop is still a prop. The quantity in question was never
# brightness; it was that a rectangular plate lying on a mat is a plate at any
# value. Round 6 replaced the plate with an earthen mound and painted it soil
# — dark, crevice-shaded, moss-fringed, one worn path over it — and Joe
# deleted the mound (790ed90). Both painters went with the meshes they
# painted; neither number was ever the problem.

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
    the offending probe named, instead of thirty seconds later as a count.

    RAMP-AWARE, sharing check.py's own start line (towergates). This gate used
    to fire every ray from a flat THROAT_Z0 = -1.5, which is STRICTER than the
    authority it claims to anticipate: check.py legalised cladding over the
    engine chute in 2026-08-13, and the flat version would have refused the
    very ramp skin the file gate now permits — a bake failing here for a die
    path no die takes, with a message about widening the wound.
    """
    import numpy as np
    tris = tri_array(objs)
    bad = []
    for i in range(5):
        for k in range(5):
            px = -THROAT_HALF_W + 2 * THROAT_HALF_W * i / 4
            py = THROAT_Y0 + (THROAT_Y1 - THROAT_Y0) * k / 4
            pz = TG.exit_ray_start_z(py, PORTAL_OUT["sillY"], 0.0)
            t = ray_hit(tris, np.array([px, py, pz]),
                        np.array([0.0, 0.0, 1.0]), THROAT_Z1 - pz)
            if t is not None:
                bad.append((px, py, pz + t))
    if bad:
        raise RuntimeError(
            f"exit throat blocked at {len(bad)}/25 probes, first at "
            f"x {bad[0][0]:.2f} y {bad[0][1]:.2f} z {bad[0][2]:.2f} — widen "
            f"the wound (W_PHI0 {W_PHI0}) or lower its threshold "
            f"(W_YC-W_YDN = {W_YC - W_YDN:.2f})")
    print("[bole] exit throat 25/25 clear (rays start on the ramp line + "
          f"{TG.EXIT_CLAD_ALLOW}, deepest z {THROAT_Z0})")


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


# JOE'S SENTENCE, MECHANIZED. W2c, verbatim: "It's also weird that the exit
# hole extends below the ramp's highest point." The ramp's highest point is
# lane_plane(LANE_Z0) = 1.0456, and beside the old tongue the mouth's ragged
# threshold stood at 0.86-1.02 with the cavity open above it — a black slot
# 0.9 wide on each flank in the round-5 frames, which is what the round-5
# renders show.
#
# THE GATE MARCHED A GHOST FOR A COMMIT, and that is the reason it is now
# written the way it is. Its ray march short-circuited on berm_top() — "the
# bank stopped this ray" — and the bank had been DELETED (790ed90). Every
# sight line the mound would have covered was still being stopped by a mound
# that no longer existed in any mesh, and HOLE_MAX_OUT sat at 16, excusing
# "the holes the shipped mound measures". Two numbers, both about an object
# nobody could see, on the gate that carries Joe's complaint.
#
# So it does not march a FIELD any more. It fires at the built triangles and
# asks the mesh, and the verdict is not "did the ray survive" but "did it get
# IN" — answered by winding, because a first hit that faces away from the ray
# is an interior surface a sight line can only have reached through a hole
# (towergates.first_hit_faces_away). The bar is the contract's, not a tuned
# number: ZERO. The earlier answer to "did it get in" asked whether the ray
# reached the BORE, and the bore has radius 2.0 while the flank slot lives at
# |x| 2.6-3.05 — so it answered "green" with the wings deleted, twice, in a
# red check.
#
# The eyes are this model's own and they are LOW. check.py runs the same gate
# from the six shipped camera eyes, which look steeply down and strike the
# trunk's front face before they can reach anything; a slot beside the ramp is
# a grazing-angle defect, so grazing angles are what look for it.
CREST_EYES = (
    ("resting", (0.00, 1.60, 12.0)),   # low and central: the table's own eye
    ("left", (+2.45, 2.25, 10.5)),     # ...and off to each side, because the
    ("right", (-2.45, 2.25, 10.5)),    # model is not mirror-symmetric
)


def assert_no_hole_below_the_crest(objs):
    """No sight line reaches the hollow under the ramp's highest point.

    Outside the declared door (|x| > w/2 = 2.10) there is no aperture at all
    below the crest: what a slot there shows is unlit interior with nothing
    under it, which is exactly the thing Joe called weird.
    """
    crest = lane_plane(LANE_Z0)
    fails, tested, holes = TG.hole_below_sill_failures(
        tri_array(objs), SPEC, math.degrees(math.asin(TILT_SIN)),
        eyes=CREST_EYES, y_top=crest, label="the ramp's highest point")
    if fails:
        raise RuntimeError(fails[0] + " — the WOOD has to close it (the sill "
                           "floor W_SILL_FLOOR and the corner fillet are what "
                           "close it today; there is no mound any more)")
    print(f"[bole] no hole under the crest: {tested} sight lines from "
          f"{len(CREST_EYES)} low eyes, {holes} reach the hollow (max 0), "
          f"crest y {crest:.3f}")

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


def assert_mesh_envelopes(shell, curtain, shelves):
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
    if not ok:
        raise RuntimeError("a mesh box is outside the class that has to grant "
                           "it — towerModelAudit would return UNCLASSIFIED "
                           "and tower-fit is red (see the lines marked ***)")


def assert_curtain(curtain):
    """THE CURTAIN MUST NOT SHOW. Round 7's gate asked the opposite — that it
    reach 11.45, high enough to catch cowl rays that were being fired into the
    sky — and the thing it built was the black cylinder standing over the
    crown that Joe called out on the frame.

    The claim is now stated where the complaint was: on the SILHOUETTE. Every
    vertex must sit under the shell's crown at its own heading, so no part of
    this object can appear against the sky or over the tear from any eye. It is
    measured on the built mesh rather than asserted of curtain_top_at, because
    the clamp lives in one function and the vertices are what render.
    """
    worst, worst_at = -1e9, None
    for v in curtain.data.vertices:
        x, y, z = app_of(v.co)
        phi = math.atan2(x, z - AXIS_Z)
        over = y - (y_top(phi) - CURTAIN_BURY_MIN)
        if over > worst:
            worst, worst_at = over, (phi, y, y_top(phi))
    if worst > 0.0:
        phi, y, crown = worst_at
        raise RuntimeError(
            f"the curtain breaks the skyline by {worst:.3f} at phi "
            f"{phi:+.2f}: its vertex stands at y {y:.3f} where the crown is "
            f"{crown:.3f} — it would render as a wall over the tear")
    rmin = min(math.hypot(app_of(v.co)[0], app_of(v.co)[2] - AXIS_Z)
               for v in curtain.data.vertices)
    if rmin < PORTAL_IN["clearR"] * 0.95 + 0.10:
        raise RuntimeError(f"the curtain reaches r {rmin:.3f} of the bore "
                           f"axis — inside the approach column "
                           f"({PORTAL_IN['clearR'] * 0.95:.3f})")
    b = app_box(curtain)
    print(f"[bole] curtain buried: deepest vertex sits {-worst:.3f} under the "
          f"crown (needs > 0), nearest approach r {rmin:.2f}, "
          f"y {b[2]:.2f}..{b[3]:.2f}")


# The portal spec in the shape towergates takes. The occlusion grid, the eyes,
# the cowl band's arithmetic and a die's radius all USED to be re-typed here —
# nine constants and two functions copied out of js/main.js — and check.py had
# none of them, so the engine's hardest obligation was enforced by this one
# recipe and by no gate on any shipped GLB. They live in towergates.
# ENGINE_MIRROR now; this is what is left of the copy.
SPEC = {"in": PORTAL_IN, "out": PORTAL_OUT}


def assert_cowl_occluded(objs):
    """THE PROOF THE ROUND-2 BAKE DID NOT HAVE, on the built triangles.

    tower-occlusion demands 99/99 on SHAFT and COWL at all six shipped eyes,
    and a bake that cannot see the grid ships a leak that only a browser finds
    — which is exactly what happened. The eyes and the sample discs are the
    ENGINE's, re-derived from the portal spec by the shared implementation;
    the model is the thing that LEANS, so eyes and points are rotated into the
    model's frame rather than the mesh being rotated into theirs.

    Kept as a call rather than deleted in favour of check.py's copy, because
    the two answer different questions at different costs: this one fails
    BEFORE a GLB exists, with the leaking eye named, eight seconds into a
    bake; that one fails on any file anybody hands it, including one this
    recipe never wrote.
    """
    fails, counts = TG.occlusion_failures(tri_array(objs), SPEC,
                                          math.degrees(math.asin(TILT_SIN)))
    if fails:
        raise RuntimeError(fails[0].replace("; ", "\n       "))
    print(f"[bole] occlusion {counts['cowl']}/{counts['cowl']} cowl and "
          f"{counts['shaft']}/{counts['shaft']} shaft, at all "
          f"{len(TG.ENGINE_MIRROR['zoomEyes'])} shipped eyes")


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


# --------------------------------------------------------------------------
# THE ROUND-7 GATES — stated in the FRAME, measured on the built mesh
# --------------------------------------------------------------------------
# Round 6 fought symmetry in PLAN and shipped a helmet, because every gate it
# had read the plan too. These three read the PROJECTION: bin the shell's own
# vertices by screen x (the outline) or by height (the taper) and judge what
# comes out. An orthographic front bin is not the tower eye's perspective
# frame, but it is the same topology of outline — a peak is a peak and a
# mirrored pair is a mirrored pair — and it costs milliseconds.
SIL_BINS = 72            # one per mesh column: finer bins alias into a comb
SIL_YMIN = PORTAL_IN["rimY"] - 1.2   # only CROWN vertices are the skyline
SIL_PROM = 0.30          # what counts as a peak at all
# WHAT COUNTS AS DOMINANT, AND WHY IT IS NOT A BIGGER NUMBER. The shard's
# prominence in the outline is capped by arithmetic, not by nerve. rimY 9.40
# and CROWN_MAX 12.35 leave 2.95; the brief's shear gap spends 2.05 of it on
# the right flank, and phi = +pi/2 is the outline's own right-hand END, so the
# shard can never stand more than 12.35 - 11.55 = 0.80 above the rim beside
# it. Measured on this bake: 0.74. Anything over 0.60 is therefore the single
# tallest thing in the frame by the widest margin the socket allows.
SIL_DOMINANT = 0.60
SIL_MIRROR_X = 0.55      # two peaks this close to mirrored positions...
SIL_MIRROR_Y = 0.60      # ...and this close in height are a horned pair
SIL_FLAT_RUN = 0.90      # the longest horizontal the outline may carry
SIL_GAP = 2.00           # y_top(+pi/2) - y_top(-pi/2), the brief's floor
TAPER_BIN = 0.25         # height bin for the profile walk
TAPER_TOL = 0.045        # how much a row may widen over the one below it.
#                          Not slack: x_limit's own tear is 0.115 deep and the
#                          fibre crests fall where they fall, so two adjacent
#                          bins in the clamped band legitimately differ by a
#                          few hundredths. A tolerance under the noise floor
#                          fails on the noise instead of on the shape.
TAPER_SWING = 0.20       # foot/rim - 1


def outline_of(ob, nb=SIL_BINS, ymin=SIL_YMIN):
    """The CROWN's own front outline: the highest vertex in each x bin.

    THREE THINGS THIS HAD TO LEARN, and all three were measured, not guessed.

    The vertex filter is not tidiness: with the whole shell in, a bin that no
    crown vertex happens to land in reports the LINTEL at 5.79 instead, and
    the skyline comes back as a comb of four-unit "peaks" that are really the
    mouth. ymin keeps it to the crown.

    Bin one per mesh column: at the crown two neighbouring columns are up to
    0.21 apart in x, and binning finer than the geometry is how a smooth rim
    becomes a sawtooth.

    And walk EDGES, not vertices. A silhouette is the boundary of the
    projected SURFACE; binning vertices alone under-fills it, and the first
    cut of this gate duly reported an outline alternating 10.0 / 9.0 / 10.0 /
    9.0 across the whole crown — five "dominant peaks" that were the sampling
    talking, not the model. Every edge with an end above ymin is rasterised
    into the bins it spans. The rim strip's own edges (outer surface to inner
    surface, both at that column's y_top) are what actually paint the
    skyline, which is exactly right: that strip IS the top of the tower.
    """
    top = [None] * nb
    step = 2.0 * XLIM / nb

    def put(x, y):
        k = int((x + XLIM) / (2.0 * XLIM) * nb)
        if 0 <= k < nb and (top[k] is None or y > top[k]):
            top[k] = y

    vs = [app_of(v.co) for v in ob.data.vertices]
    for e in ob.data.edges:
        a, b = vs[e.vertices[0]], vs[e.vertices[1]]
        if a[1] < ymin and b[1] < ymin:
            continue
        n = max(1, int(abs(a[0] - b[0]) / step) + 1)
        for i in range(n + 1):
            f = i / n
            y = a[1] + (b[1] - a[1]) * f
            if y >= ymin:
                put(a[0] + (b[0] - a[0]) * f, y)
    return [(-XLIM + 2.0 * XLIM * (k + 0.5) / nb, t)
            for k, t in enumerate(top) if t is not None]


def outline_peaks(prof, prom):
    ys = [p[1] for p in prof]
    n = len(ys)
    out = []
    for i in range(1, n - 1):
        if ys[i] < ys[i - 1] or ys[i] < ys[i + 1]:
            continue
        drops = []
        for d in (-1, 1):
            j, mn = i + d, ys[i]
            while 0 <= j < n and ys[j] <= ys[i]:
                mn = min(mn, ys[j])
                j += d
            drops.append(ys[i] - mn)
        p = min(drops)                       # true prominence: the lesser side
        if p >= prom:
            if out and abs(prof[i][0] - out[-1][0]) < 0.25:
                if ys[i] > out[-1][1]:
                    out[-1] = (prof[i][0], ys[i], p)
            else:
                out.append((prof[i][0], ys[i], p))
    return out


def assert_silhouette_is_not_a_face(shell):
    """NO HORIZONTAL BOUNDARY AND NO MIRRORED PAIR IN THE OUTLINE.

    RED-CHECKED AGAINST THE THING IT EXISTS TO REFUSE: round 6's own field
    projects to peaks at (-2.44, 12.32) and (+2.30, 11.81) — 0.14 from
    mirrored in x, 0.51 apart in height, prominence 2.41 and 2.01 — and this
    gate fails it on all three counts. That bake was green on every other
    check in this file.
    """
    prof = outline_of(shell)
    peaks = outline_peaks(prof, SIL_PROM)
    dom = [p for p in peaks if p[2] >= SIL_DOMINANT]
    bad = []
    if len(dom) != 1:
        bad.append("%d dominant peaks (want exactly 1): %s" % (
            len(dom), ", ".join("x %+.2f y %.2f prom %.2f" % p for p in dom)))
    for i, a in enumerate(peaks):
        for b in peaks[i + 1:]:
            if (abs(a[0] + b[0]) < SIL_MIRROR_X
                    and abs(a[1] - b[1]) < SIL_MIRROR_Y):
                bad.append("mirrored pair at x %+.2f / %+.2f, y %.2f / %.2f"
                           % (a[0], b[0], a[1], b[1]))
    run_x0, run_y = prof[0]
    worst = (0.0, 0.0)
    for x, y in prof[1:]:
        if abs(y - run_y) < 0.05:
            if x - run_x0 > worst[0]:
                worst = (x - run_x0, y)
        else:
            run_x0, run_y = x, y
    if worst[0] > SIL_FLAT_RUN:
        bad.append("a %.2f-wide horizontal at y %.2f" % worst)
    gap = y_top(math.pi / 2) - y_top(-math.pi / 2)
    if gap < SIL_GAP:
        bad.append("the crown shear is only %.3f (want %.2f): y_top(+pi/2) "
                   "%.3f vs y_top(-pi/2) %.3f"
                   % (gap, SIL_GAP, y_top(math.pi / 2), y_top(-math.pi / 2)))
    print("[bole] outline: %d peak(s) %s | shear gap %.2f | longest flat %.2f"
          % (len(peaks),
             " ".join("(x%+.2f y%.2f p%.2f)" % p for p in peaks), gap, worst[0]))
    if bad:
        raise RuntimeError("the silhouette still reads as a face:\n       "
                           + "\n       ".join(bad))


def assert_taper_is_a_stump(shell):
    """WIDEST AT THE GROUND, NARROWING ALL THE WAY UP (round 7, item 8).

    Joe: "the stump is not particularly wide at the bottom and gets much
    wider near the top. Most stumps are dramatically wider at the bottom."
    Round 6 measured base(y) 2.74 / 2.46 / 2.90 foot / waist / shoulder — an
    inverted taper, and a helmet flares at the top exactly where a stump does
    not. Measured HERE on the outline's half-width per row, because the base
    curve is only one of four things that set it (the ridges, the buttress
    web, the crown splay and the socket clamp are the others, and three of
    them broke this law at some point during the round).
    """
    # EDGES, NOT VERTEX ROWS, for the same reason the outline uses them: the
    # mesh's rows are 1.0 apart at the waist and the crown's are lerped to
    # each column's own tear, so any fixed y bin lands on a row in one place
    # and between two rows in another — measured, that alone reported the
    # profile "widening" at y 6.0, 10.0 and 11.5 on a model that does nothing
    # of the kind. An edge walk covers every height continuously.
    rows = {}
    vs = [app_of(v.co) for v in shell.data.vertices]
    for e in shell.data.edges:
        a, b = vs[e.vertices[0]], vs[e.vertices[1]]
        n = max(1, int(abs(a[1] - b[1]) / TAPER_BIN) + 1)
        for i in range(n + 1):
            f = i / n
            y = a[1] + (b[1] - a[1]) * f
            k = int(math.floor(y / TAPER_BIN))
            rows[k] = max(rows.get(k, 0.0), abs(a[0] + (b[0] - a[0]) * f))
    ks = sorted(rows)
    prof = [(k * TAPER_BIN, rows[k]) for k in ks if rows[k] > 0.2]
    bad = []
    top_k = max(range(len(prof)), key=lambda i: prof[i][1])
    # THE FOOT IS A CLAMPED WALL, not a point: the socket's x limit holds the
    # flanks at the same width from the felt to about y 1.8, so "widest at the
    # ground" is a tie over that band rather than a single row.
    if prof[top_k][0] > 1.9:
        bad.append("widest row is y %.2f, not the ground" % prof[top_k][0])
    prof = prof[top_k:]
    for i in range(1, len(prof)):
        if prof[i][1] > prof[i - 1][1] + TAPER_TOL:
            bad.append("widens at y %.1f: %.3f -> %.3f"
                       % (prof[i][0], prof[i - 1][1], prof[i][1]))
    # ...and the swing is quoted at the RIM, not at the last sliver of the
    # tallest shard: above rimY the profile is one blade and its width is a
    # statement about that blade, not about the trunk.
    rim = min((p for p in prof if p[0] >= PORTAL_IN["rimY"]),
              key=lambda p: p[0], default=prof[-1])
    swing = prof[0][1] / rim[1] - 1.0
    if swing < TAPER_SWING:
        bad.append("foot/crown swing is only %.1f%% (want %.0f%%)"
                   % (swing * 100, TAPER_SWING * 100))
    print("[bole] taper: half-width %.2f at the felt -> %.2f at the rim "
          "(%.1f%%) -> %.2f at the top; widest at y %.2f"
          % (prof[0][1], rim[1], swing * 100, prof[-1][1],
             prof[0][0]))
    if bad:
        raise RuntimeError("the taper is not a stump's:\n       "
                           + "\n       ".join(bad))


def lintel_points():
    """The wound's upper branch in world (x, y) — the LINTEL, which is what
    the eye reads as the top of the mouth."""
    out = []
    for u, v in WOUND_LOOP:
        if v <= 0.02:
            continue
        phi = W_PHI0 * u
        y = W_YC + W_YUP * v
        x, _z = clamp_point(r_out(phi, y), phi, y,
                            z_front(y) - AXIS_Z, ZBACK - AXIS_Z)
        out.append((x, y, phi))
    out.sort()
    return out


def assert_lintel_is_a_tear(objs):
    """THE MOUTH'S TOP EDGE: a diagonal tear, not an arch, and not a mouth.

    Three claims, three measurements.

    (a) IT CLIMBS. At +-THROAT_HALF_W — the same x the exit gate probes, so
        the number means something — the right side must stand at least 0.90
        above the left. Round 6 read 5.07 / 4.98: a nine-centimetre "climb"
        on a five-metre-wide opening, which is an arch.
    (b) IT NEVER TRESPASSES. The lift on the right adds nothing to the model's
        risk (it only removes wood) but the press on the left contracts the
        opening, so the loop's lowest lintel point inside the throat's own x
        band is measured against the top of the throat box. assert_throat_
        clear fires real rays at the triangles afterwards; this one names the
        cause when it is the lintel.
    (c) IT HAS NO RHYTHM. A regular scallop over a dark opening is a row of
        teeth, and half of what Joe read as a mouth was exactly that. The
        measurement is the SPACING and DEPTH of the lintel's dips, as
        coefficients of variation: teeth are evenly spaced and the same size,
        so a scallop's CV is small and a tear's is large.

        A DFT was tried first and refused the job. Round 6's periodic term
        carries 4 rad of phase noise, which smears its 0.86 wavelength across
        bins: worst bin 26.6% of the edge's energy, LOWER than round 7's own
        30.5%. A spectral test that both rounds pass is not a gate, it is a
        decoration. The dips discriminate on the first try — round 6 spacings
        0.76 / 0.77 / 0.79 / 0.92 / 0.52 (CV 0.17, depth CV 0.26) against
        round 7's 1.94 / 1.05 / 0.43 / 1.15 / 0.43 (CV 0.56, depth CV 0.63).
        That is the difference between a comb and a break, and it is exactly
        what the eye was reading.
    """
    pts = lintel_points()
    bad = []

    def at(x):
        near = [p[1] for p in pts if abs(p[0] - x) < 0.34]
        return max(near) if near else None
    left, right = at(-THROAT_HALF_W), at(THROAT_HALF_W)
    rise = right - left
    if rise < LINTEL_RISE:
        bad.append("the lintel climbs only %.3f across the opening (%.2f at "
                   "x %.2f, %.2f at x %+.2f); want %.2f"
                   % (rise, left, -THROAT_HALF_W, right, THROAT_HALF_W,
                      LINTEL_RISE))
    # IN HEADING, NOT IN x — and that distinction cost a bake. The exit ray is
    # a LINE THROUGH THE MODEL, not a point: the one at x -1.995 leaves z -1.5
    # at heading -1.086 and sweeps to -0.512 as it runs forward, so what it
    # needs is the lintel above the box at every heading in that fan. Phrased
    # in x, this check happily passed a lintel point at 4.375 because that
    # point's own |x| was 2.09 and so "outside the throat" — while the ray
    # reached its heading anyway, 0.5 deep into the tower.
    fan = math.atan2(THROAT_HALF_W, THROAT_Z0 - AXIS_Z)
    inb = [p for p in pts if abs(p[2]) <= fan + 0.02]
    low = min(inb, key=lambda p: p[1])
    if low[1] < THROAT_Y1 + LINTEL_KEEP:
        bad.append("a lintel point sits at y %.3f, heading %+.3f (the exit fan "
                   "reaches %.3f) — that is inside the throat box, top %.4f"
                   % (low[1], low[2], fan, THROAT_Y1))
    # (c) the scallop test: how regular are the dips in this edge?
    ys = [p[1] for p in pts]
    n = len(ys)
    trend = [sum(ys[max(0, i - 3):i + 4]) / len(ys[max(0, i - 3):i + 4])
             for i in range(n)]
    res = [ys[i] - trend[i] for i in range(n)]
    dips = [(pts[i][0], -res[i]) for i in range(1, n - 1)
            if res[i] < res[i - 1] and res[i] < res[i + 1] and -res[i] > 0.03]
    cv_sp = cv_dp = 9.9
    if len(dips) >= 3:
        sp = [dips[i + 1][0] - dips[i][0] for i in range(len(dips) - 1)]
        dp = [d for _x, d in dips]
        cv_sp, cv_dp = coeff_var(sp), coeff_var(dp)
        if cv_sp < SCALLOP_CV or cv_dp < SCALLOP_CV:
            bad.append("the lintel is a scallop: %d dips, spacing CV %.2f and "
                       "depth CV %.2f against a %.2f floor — evenly spaced "
                       "dips of equal size ARE teeth"
                       % (len(dips), cv_sp, cv_dp, SCALLOP_CV))
    print("[bole] lintel: %.2f at x %+.2f -> %.2f at x %+.2f (climb %.2f), "
          "apex %.2f, lowest in the exit fan %.2f at heading %+.2f, %d dips "
          "(spacing CV %.2f, depth CV %.2f)"
          % (left, -THROAT_HALF_W, right, THROAT_HALF_W, rise,
             max(ys), low[1], low[2], len(dips), cv_sp, cv_dp))
    if bad:
        raise RuntimeError("the mouth's top edge is still a mouth:\n       "
                           + "\n       ".join(bad))


LINTEL_RISE = 0.90       # world units, measured at +-THROAT_HALF_W
LINTEL_KEEP = 0.10       # headroom the lintel keeps over the throat box
SCALLOP_CV = 0.35        # the least irregular a torn edge's dips may be
#                          (round 6 measured 0.17 / 0.26, round 7 0.56 / 0.63)


def coeff_var(vs):
    m = sum(vs) / len(vs)
    if abs(m) < 1e-9:
        return 9.9
    var = sum((v - m) ** 2 for v in vs) / len(vs)
    return math.sqrt(var) / abs(m)


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
            x, z = clamp_point(r_out(p, y), p, y, z_front(y) - AXIS_Z,
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


# --------------------------------------------------------------------------
# THE DOOR PAD — the ember's landing, measured here instead of at runtime
# --------------------------------------------------------------------------
# WHERE THE EMBER DOOR GOES IS A FACT ABOUT THIS MESH, and today three files
# hold pieces of it and none of them holds the fact. The registry row carries
# `ember.at` [-2.79, 1.22, z0 + 0.55] (Joe-dialled, and NOT being moved);
# js/towerglbshell.js carries DOOR_X -2.79 / DOOR_Y 1.20 and then RAYCASTS the
# loaded model at bake-time-unknowable runtime to find the buttress face those
# two land on, with a fallback constant for when the answer is unusable.
#
# The recipe is where that raycast belongs: it has the triangles, it has them
# before anything ships, and its answer cannot be a frame late or a model
# behind. So the bake exports a third scene-root empty, `doorPad`, at the
# surface point, with the OUTWARD NORMAL in its extras — which the runtime
# version never had at all, and which is what a door frame needs to sit flush
# on a curved buttress rather than square to the world.
#
# THIS EMPTY IS NOW THE SINGLE SOURCE. Round 3 (the descriptor purge) deletes
# DOOR_X / DOOR_Y / DOOR_Z_FALLBACK and the runtime cast from
# js/towerglbshell.js and reads the node instead. The numbers are transcribed
# ONCE, here, at the location the shipped tower already uses — Joe's ruling of
# 2026-08-13: today's spot is canon, the pad does not move.
#
# (The recipe ALSO cuts a small recess at DOOR_PHI / DOOR_Y — pick_door's
# knothole on the left buttress FLANK, phi about -93 deg, y 0.70. That is a
# different place from this pad and always was: a modelled knothole with its
# own paint, not the app's lit door. The two are reconciled in round 3.)
DOOR_PAD_X = -2.79          # js/towerglbshell.js DOOR_X, transcribed once
DOOR_PAD_Y = 1.20           # ...and DOOR_Y. The light itself rides 0.02 higher
#                             and 0.33 in front (registry `ember.at`).
DOOR_PAD_Z_FALLBACK = 0.22  # DOOR_Z_FALLBACK, app-frame: the socket's own
#                             front plane, used when the cast finds nothing
#                             usable. It is also ZFRONT, and that is not a
#                             coincidence — it is the value the shipped tower
#                             ran on before the model was asked.
DOOR_PAD_Z_LIMIT = 0.25 - 0.05   # the app's `zFrontLim - 0.05`: a buttress
#                                  bulging past this leaves the 0.028-proud
#                                  door frame outside the socket


def door_pad(objs):
    """(position, outward normal) for the ember pad, off the BUILT surface.

    The app's cast, run here: straight back along -z at the pad's own x and y,
    take the buttress's front face. The normal comes from the triangle that
    was hit, flipped to point at the eye — a door frame laid on this pad has
    to lie in the surface, and no constant in any file knows which way this
    root is facing.
    """
    import numpy as np
    tris = tri_array(objs)
    origin = np.array([DOOR_PAD_X, DOOR_PAD_Y, 4.0])
    d = np.array([0.0, 0.0, -1.0])
    r = TG.ray_probe(tris, origin, d, 40.0)
    if r is None:
        print("[bole] door pad: no surface under the cast — falling back to "
              f"z {DOOR_PAD_Z_FALLBACK}")
        return (DOOR_PAD_X, DOOR_PAD_Y, DOOR_PAD_Z_FALLBACK), (0.0, 0.0, 1.0)
    t, idx = r
    z = 4.0 - t
    if z > DOOR_PAD_Z_LIMIT:
        print(f"[bole] door pad: surface at z {z:.3f} is past the socket's "
              f"front limit {DOOR_PAD_Z_LIMIT:.2f} — falling back")
        return (DOOR_PAD_X, DOOR_PAD_Y, DOOR_PAD_Z_FALLBACK), (0.0, 0.0, 1.0)
    a, b, c = tris[idx]
    n = np.cross(b - a, c - a)
    n = n / float(np.linalg.norm(n))
    if float(n @ d) > 0.0:
        n = -n                      # face the eye, not the wood
    print(f"[bole] door pad at app ({DOOR_PAD_X:+.2f}, {DOOR_PAD_Y:.2f}, "
          f"{z:+.3f}) normal ({n[0]:+.3f}, {n[1]:+.3f}, {n[2]:+.3f})")
    return (DOOR_PAD_X, DOOR_PAD_Y, z), (float(n[0]), float(n[1]), float(n[2]))


# --------------------------------------------------------------------------
# THE GATE MANIFEST — every assert_ in this file has to have RUN
# --------------------------------------------------------------------------
# This exists because two of them had not, for a commit each.
# assert_lane_is_clear and assert_berm_pressed_home were left behind when the
# mound was deleted: full docstrings, real measurements, called by nothing. A
# gate that is not called is worse than no gate, because the file then reads
# as though the claim in its docstring is being checked. Nothing here can tell
# whether an assertion is CORRECT — but "was it invoked at all" is decidable,
# so it is decided.
#
# The set is discovered by NAME from the module, so adding a gate and
# forgetting to call it fails the very bake that adds it. The wrapping happens
# here, after every gate is defined and before build() names any of them, so
# the recording costs each gate exactly nothing to opt into.
_GATES_RUN = set()


def _instrument_gates():
    import functools
    for name, fn in list(globals().items()):
        if (not name.startswith("assert_") or not callable(fn)
                or name == "assert_every_gate_ran"):
            continue

        def wrap(name=name, fn=fn):
            @functools.wraps(fn)
            def run(*a, **k):
                _GATES_RUN.add(name)
                return fn(*a, **k)
            return run
        globals()[name] = wrap()


def assert_every_gate_ran():
    defined = {n for n in globals()
               if n.startswith("assert_") and callable(globals()[n])
               and n != "assert_every_gate_ran"}
    missing = sorted(defined - _GATES_RUN)
    if missing:
        raise RuntimeError(
            "%d gate(s) defined in this file were never invoked: %s. Either "
            "call them from build()/main() or delete them — an uncalled gate "
            "is how a ray march kept short-circuiting on a mound that had "
            "been deleted, with a green line printed under it."
            % (len(missing), ", ".join(missing)))
    print(f"[bole] gate manifest: {len(defined)} assert_* defined, all invoked")


_instrument_gates()


def build(variant):
    pal = PALETTES[variant]
    F.reset()

    shell = build_shell("towerSkinBoleShell")
    F.boolean(shell, wound_cutter(), op="DIFFERENCE")
    nm, vol = F.manifold_report(shell)
    print(f"[bole] after wound: {nm} non-manifold, volume {vol:.2f}")
    if nm:
        raise RuntimeError(f"wound cut left {nm} non-manifold edges")
    # AN EMPTY RESULT HAS ZERO NON-MANIFOLD EDGES. The floors campaign
    # found this the hard way: a self-intersecting wound loop (corner
    # LIFT out of proportion to the shrunken Y spans) annihilated the
    # whole shell, and every downstream gate passed vacuously — 25/25
    # throat rays "clear" through a tower that no longer existed. The
    # green check that masks a broken thing, in one line. Volume is the
    # check manifoldness cannot make.
    if vol < 50:
        raise RuntimeError(
            f"wound cut left volume {vol:.2f} (< 50): the cutter consumed "
            f"the shell — check W_CORNER_LIFT against W_YDN (the loop "
            f"self-intersects when the fillet outruns the span)")
    F.boolean(shell, door_cutter(), op="DIFFERENCE")
    print(f"[bole] after door:  {F.manifold_report(shell)[0]} non-manifold")

    # NO BERM. Joe: "with the mound demoted, just delete it now."
    #
    # It was never load-bearing for the dice — it carried no collider, and the
    # engine's own ramp and lip (invisible, and unchanged) are what a die
    # rides. What it WAS doing is hiding the slot under the ramp, and the wood
    # closes that itself now (W_SILL_FLOOR): the crest gate reads 0 open sight
    # lines with nothing standing in front of the tower at all.
    #
    # So the mound is gone rather than simplified, and with it the whole
    # apparatus it dragged behind — the lane plane blended into its top, the
    # throat ceiling planed across its shoulder (Joe's "shelf"), the wings
    # sized by a sight-line gate, and the three assertions that policed all of
    # that. A mound that has to be a floor and a lid and a bank at once is why
    # none of those readings were free to be right.
    curtain = build_curtain("towerSkinBoleCurtain")
    shelves = build_shelves("towerSkinBoleShelves")

    meshes = [shell, curtain, shelves]
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
        # under this model's smallest intended feature (the wound rag's
        # 0.05 tooth) and 700x under the 0.07 visible-feature floor, so it can
        # only ever weld solver debris.
        if diagnose_pinches(ob):
            F.clean_slivers(ob, dist=3e-4)
            if diagnose_pinches(ob):
                raise RuntimeError(f"{ob.name}: pinches survived the weld")
        poke_shared_diagonals(ob)
        F.canonicalize(ob)
        F.triangulate(ob)
        # 30 degrees, and it is the trunk's number: its facets are the tear
        # and the crown and those must stay crisp. (The retired mound wanted
        # 46 — a heightfield's cells meet at 30-45 wherever a lobe's flank is
        # steep, so at the house angle it came back as a fan of flat planes.
        # Recorded because the next heightfield in this file will want it.)
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

    assert_silhouette_is_not_a_face(shell)
    assert_taper_is_a_stump(shell)
    assert_lintel_is_a_tear(meshes)
    assert_throat_clear(meshes)
    assert_approach_clear(meshes)
    assert_shelves_bite()
    assert_no_hole_below_the_crest(meshes)  # carried by the WOOD, not a bank
    assert_envelope(meshes)
    assert_curtain(curtain)
    assert_mesh_envelopes(shell, curtain, shelves)
    assert_cowl_occluded(meshes)
    assert_every_gate_ran()

    pin, pout = F.tower_portals(PORTAL_IN, PORTAL_OUT)
    pad_at, pad_n = door_pad(meshes)
    pad = F.model_marker("doorPad", pad_at,
                         {"nx": pad_n[0], "ny": pad_n[1], "nz": pad_n[2]})
    F.assert_budget(meshes, BUDGET)
    F.report_bounds(meshes, f"hollowbole_{variant}")
    # NO sit_on_ground: this model's frame IS the contract. y = 0 is the
    # felt and z = 0 is the socket plane; grounding would move the portals
    # off the very planes they are quoted against.
    return F.export_glb(f"hollowbole_{variant}", meshes + [pin, pout, pad],
                        vertex_colors=True)


def main():
    global DOOR_PHI, DOOR_Y
    assert_rim_is_low()
    DOOR_PHI, DOOR_Y = pick_door()
    report_form()
    assert_sill_is_in_the_window()
    for variant in ("moonrise", "foxfire"):
        print(f"[bole] --- {variant} ---")
        build(variant)


main()
