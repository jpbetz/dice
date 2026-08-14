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

ROUND 6 — THE STONE IS LIT FROM INSIDE, and this is the divergence Joe asked
for after round 5 came back "structurally right, not yet handsome … it's
quiet". Umbra is the house whose die BURNS AT THE EDGE WHERE IT IS BEING
UNMADE (the `dissolve` shader: violet body, witchlight burning edge), so the
native answer to "quiet" is not more relief and not a brighter albedo — it is
that the absence has something going on inside it. Three gestures, and each
one is a different answer to the same question, "how does a player SEE it":

  THE FISSURES LEAK.   The joints were a 0.115 crease and are now a 0.26
                       slot with a violet filament lying in the bottom of it.
                       The slot is what makes it read as INTERIOR — a hairline
                       on a flat facet is a stripe, a hairline 0.26 down a
                       crack is a thing behind the stone. A SPLINTER buries
                       the two joints it stands over, so the splinter draw now
                       has to go round the tower (minimum gap 4, not 2): at 2
                       the three ribs sat inside one 100-degree arc and killed
                       six consecutive fissures, and only 3 joints of 14 could
                       show anything from wide.full.
  THE MOUTH IS A MOUTH. The doorway's pocket is 2.3 deep and was a black
                       rectangle. Three witchlight veins now climb its back
                       wall, and the registry's ember moved OFF the lintel
                       corner and INTO the pocket, to the veins' own foot, so
                       the light in there has a visible cause and a real
                       falloff onto the shard a die arrives on.
  THE BORE DOES NOT.   A glow up the shaft is UNBUILDABLE, and that is a
                       contract fact rather than a taste: the occlusion proof
                       requires the shaft to be invisible from all six
                       shipped eyes, and emissive is not a light — it lights
                       nothing around it and contributes exactly zero pixels
                       where it cannot be seen. So the bore's light has to
                       escape through the SKIN and through the DOORWAY, or
                       it does not exist. Round 3's rejected horseshoe was
                       the same discovery taken from the other end.

WHAT THE HOUSE RULES COST, written down because the next tower pays it too:
the loader STRIPS baked lights, emissive is NOT multiplied by COLOR_0, and
`userData.bloom` is off-policy (an always-on bloom source disables the
post-stack bypass for the whole app). So every glow here is a constant per
MESH, every gradient in it is GEOMETRY — how much emitting surface an eye can
see — and every value sits far under js/post.js's 0.9 linear threshold. The
two tiers are the die's own two colours and nothing else:
    throat  0.225 linear luminance, witchlight   (the unmaking, at the mouth)
    seams   0.086 linear luminance, violet + 10%  (the void, behind the skin)
Both are enforced by assert_the_light_is_countable, and the claim that they
can be SEEN is a raycast from the shipped eyes rather than an opinion —
js/towerhollow.js paid for that lesson with a gill that faced the floor.

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
# …and the battery every tower runs, in one implementation (2026-08-13). This
# file carried its own tri_array, its own Möller-Trumbore and five gate
# wrappers; hollowbole.py carried the same two. They live in towerkit now, so
# a recipe is a SHAPE and a PAINT and nothing else.
import towerkit as K  # noqa: E402

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
# THE FISSURE IS A SLOT NOW, not a crease. Round 5 cut a 0.115 V whose walls
# opened at ~128 degrees: at that aspect the groove has no shadow of its own,
# which is why the fissures "read" on the sheet only as a slightly darker
# band. 0.26 deep with a 0.06-wide flat bottom opens at ~98 degrees, throws a
# real dark core, and — the reason the number moved — leaves somewhere for a
# filament to lie where it is visibly BEHIND the surface of the stone.
SLOT_D = 0.26                      # how deep the fissures are cut
SLOT_HW = 0.030                    # half the slot's flat bottom, in radians
SLOT_WALL = 0.10                   # stone that must survive between slot + bore.
#                                    0.16 pinned the slot floor at 2.50, which
#                                    is FINE for a facet standing at 2.76 and
#                                    starves one standing at 2.64 — and since a
#                                    filament's brightness IS how far it climbs
#                                    out of its slot, the shallow joints came
#                                    out invisible while their neighbours read
#                                    as neon. The wall is never seen: it is
#                                    interior stone between a fissure's floor
#                                    and a bore no eye can look into.
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
# STILL NOT AT THE CLEAVE, and round 3's finding stands: an emissive band under
# the inner lip rendered as a bright yellow-green horseshoe, the single most
# eye-catching thing on a tower whose whole claim is that it POOLS light. What
# round 6 changes is not that ruling but WHERE the light is allowed to be. The
# cleave's rim is a surface no shipped eye can see square-on — the cut falls
# TOWARD the player (11.99 at the back, 11.14 at the front) and every zoom eye
# looks up at it — so a rim glow buys one tile of the review sheet and nothing
# a player ever sees, while spending the whole identity. It stays albedo.

# --- the fissure filaments (the void, seen through the skin) ----------------
SEAM_HW = 0.017                    # half-width in radians, INSIDE SLOT_HW so
#                                    the filament never touches a slot wall.
#                                    0.018 was SUB-PIXEL at a grazing angle:
#                                    the two or three joints nearly face-on to
#                                    an eye rendered as real cracks and every
#                                    other one aliased into a dotted line,
#                                    which is a shimmer in motion rather than
#                                    a fissure. A crack seen edge-on has to
#                                    still be worth one pixel.
SEAM_GAP = 0.012                   # it floats off the slot floor by this much
SEAM_REACH = 0.205                 # how far it may climb toward the slot mouth
#                                    (the slot is 0.26 deep, so a filament at
#                                    full climb still sits 0.055 under the
#                                    shoulder — it is never a rib with a light
#                                    on it). THIS IS THE VISIBILITY DIAL: the
#                                    slot's walls stand at ~29 degrees off
#                                    radial, so how deep the filament lies is
#                                    exactly how wide the cone that can see it
#                                    is, and assert_the_light_is_seen prints
#                                    the count each bake.
SEAM_MIN_ROOM = 0.10               # a joint with less slot than this has no
#                                    crack: the two rear facets are pinned to
#                                    the bore's wall and there is nothing there
#                                    to crack THROUGH. They come out unlit, and
#                                    the back of the tower is dark on purpose.
SEAM_LEVELS = 13
SEAM_WANDER = 0.016              # radians of lateral drift along a crack
SEAM_FLOOR = 0.55                  # no crack runs into the felt
SEAM_LONG = 6.4                    # the longest a crack may run, weighted so
#                                    most joints get a nick under the cleave
#                                    and two or three run half the tower
# A CRACK IS NOT A TUBE. Round 6a ran one unbroken filament per joint with a
# flat cap at each end and it rendered as a strip light: the give-away was that
# both ends were square and the whole length was one width. Each joint's run is
# broken into 1-3 SEGMENTS with dark between them, and every segment tapers to
# a point in BOTH its width and its climb, so what the eye gets is a dashed
# line of unequal marks — which is what light coming through a fracture does.
SEAM_SEGS = (1, 3)
SEAM_GAP_FRAC = (0.10, 0.30)       # how much of the run is dark, per gap

# --- the throat (the mouth, with something down it) ------------------------
# The pocket behind the doorway is 2.3 deep, solid on all six sides (the bore
# does not start until y 4.90), and on round 5's sheet it was a black
# rectangle occupying the most-looked-at square of the tower. Two veins climb
# its back wall. They are placed AWAY FROM THE FLOOR on purpose: the shard's
# rear lip stands at y 1.17 and the pocket floor at 0.70, so anything lying on
# that floor is behind the lip from every shipped eye — measured, not guessed
# (assert_the_light_is_seen would fail it).
THROAT_Z = DOOR_Z0                 # the pocket's back wall, z -2.20
THROAT_BURY = 0.006                # into the stone, so no z-fight
THROAT_PROUD = 0.045               # and out of it, so the vein has a body
THROAT_LEVELS = 15
# (x centre, y bottom, y top, half-width at the waist) — a main vein and the
# two forks it threw. Odd count, unequal, off centre: matched veins would read
# as a moulding (the venue skill's bookend trap, one scale down).
#
# THE WAISTS ARE A THIRD OF ROUND 6a's. At 0.30 the main vein rendered as a
# leaf-shaped decal stuck to the back wall — a SHAPE, brightly and evenly lit,
# which is the failure mode a constant emissive walks into every time. A crack
# is a LINE: what makes it read as light is its length against its width and
# the black either side, not its area.
THROAT_VEINS = ((-0.30, 1.02, 3.66, 0.105), (0.62, 1.26, 2.62, 0.055),
                (-0.94, 1.12, 2.05, 0.045))
THROAT_JAG = 0.055                 # per-level width jitter — a fracture edge

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
LIT_STONE = (0.0026, 0.0024, 0.0034)      # the filament's own base: darker
#                                           than BORE_DARK, because a lit
#                                           thing's albedo must not compete
#                                           with what it is emitting
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


def lum_of(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def lit(hue, luminance, white=0.0):
    """A LINEAR emissive at a chosen luminance, keeping the hue.

    Authored against a NUMBER rather than dialled by eye, for the reason
    js/towerhollow.js states about its own ladder: there is no post-hoc knob —
    the bloom threshold is a fixed 0.9 linear and a tower may not approach it —
    so the only way two glows of different colour can be the same BRIGHTNESS is
    to divide each by its own hue's luminance.

    THE WHITENING HAPPENS AFTER THE NORMALISE, and round 6b got that backwards
    at a cost of a whole round. Mixing 16% white into #43265b directly adds
    0.16 to channels whose own values are 0.02-0.10 — the accent DISAPPEARS
    under the mix — and the filaments baked out grey, which on the sheet read
    as a strip light glued to the front of the tower. Normalise the hue to
    luminance 1 first and the mix means what it says: a pale core on a colour
    that is still that colour."""
    h = tuple(c / lum_of(hue) for c in hue)
    if white:
        h = lerp3(h, (1.0, 1.0, 1.0), white)
    return tuple(c * (luminance / lum_of(h)) for c in h)


# THE TWO TIERS, and there are only two because the die has only two colours.
# Deep inside the block it is the house's violet; at the mouth, where the stone
# is being unmade, it is the die's own witchlight — the same pairing the
# `dissolve` shader runs (violet body, witchlight burning edge). The throat is
# brighter because it is seen down 2.3 of shadow; the seams are the fainter
# tier because they are read against lit stone.
SEAM_EMIT = lit(VIOLET, 0.086, white=0.10)
THROAT_EMIT = lit(WITCH, 0.225, white=0.10)


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


def joint_r(f):
    """The shoulder radius at the joint between facet f-1 and facet f.

    The SHALLOWER of the two neighbours, so a fissure is always a notch and
    never a step outward."""
    return min(facet_r(f), facet_r((f - 1) % NF))


def slot_r(f):
    """The radius at the BOTTOM of that fissure.

    THE FLOOR IS THE BORE'S WALL, and it binds where the plan is tightest.
    The socket is only 2.70 deep at the back, so the two rear facets already
    sit on facet_r's own floor (BORE_R_HI + 0.22 = 2.56) — cutting a 0.26 slot
    there would leave 0.04 of stone between the fissure and the shaft, and the
    approach column starts refusing anything inside 2.20. Clamping here rather
    than refusing later is what makes the back of the tower quietly uncracked
    instead of a bake failure."""
    return max(joint_r(f) - SLOT_D, BORE_R_HI + SLOT_WALL)


def slot_room(f):
    """How much slot this joint actually got. 0 at the pinned rear facets."""
    return joint_r(f) - slot_r(f)


def ring_xz():
    """The plan: two flat points per facet, and a narrow FLAT-BOTTOMED slot at
    every joint.

    Round 5 put one point at the joint, which makes a V whose walls open at
    ~128 degrees — too shallow to shade itself, which is why the fissures came
    back "readable" and no more. Two points at SLOT_HW either side of the joint
    give the fissure a floor: a dark core with a real shadow, and — the reason
    the profile changed at all — a place for a filament to lie where it is
    visibly BEHIND the surface of the stone rather than painted on it."""
    pts = []
    for f in range(NF):
        a0, a1 = facet_span(f)
        d = a1 - a0
        r, s = facet_r(f), slot_r(f)
        pts.append(polar(s, a0 - SLOT_HW))
        pts.append(polar(s, a0 + SLOT_HW))
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
        # SPREAD, not merely non-adjacent. At a minimum gap of 2 the draw came
        # back facets 2, 4, 0 — three ribs inside a 100-degree arc, which reads
        # as one buttressed corner rather than as three survivors of one cut,
        # and (round 6) put all three on the same half of the tower as each
        # other. A splinter is a full-height rib standing proud of its facet,
        # so it also BURIES the two fissures at its own edges: at gap 2 that
        # was six of the fourteen joints, all of them consecutive, and the
        # cracked ones were all on one side. Gap 4 is the smallest that makes
        # three picks go round.
        if any(min((f - g) % NF, (g - f) % NF) < 4 for g in picked):
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
# the light that gets out — filaments in the fissures, veins in the throat
# --------------------------------------------------------------------------
# BOTH OF THESE ARE GRADIENTS MADE OF GEOMETRY, and they have to be: emissive
# is a constant per material and a material belongs to a mesh, so the only
# dimmer switch available is HOW MUCH EMITTING SURFACE AN EYE CAN SEE. A
# filament that climbs toward the mouth of its slot is seen from a wider cone
# and reads brighter; one that sinks to the floor of the slot is seen only
# head-on and reads as a hairline. That is the whole lighting rig.

def splintered(f):
    return any(ff == f % NF for ff, _t in SPLINTERS)


def seam_span(j):
    """(y_bottom, y_top) for the crack at joint j, or None if there isn't one.

    A crack starts AT THE CLEAVE, because the cleave is what opened this block,
    and runs down as far as it ran — quadratically weighted off the seeded
    grain, so most joints get a nick under the cut and two or three run half
    the tower. Every crack that would reach the doorway stops at its lintel
    instead: the door is a later, bigger wound and a fissure does not cross it.
    """
    if slot_room(j) < SEAM_MIN_ROOM:
        return None
    # A SPLINTER STANDS OVER ITS FACET'S BOTH JOINTS — it is a rib proud of the
    # skin, extended 0.16 of a facet past each edge — so a filament there is
    # buried. Measured, not assumed: assert_the_light_is_seen's per-joint line
    # reported 3 of 14 joints showing anything from wide.full, and the eleven
    # dark ones were exactly the splintered pairs plus the pinned rear.
    if splintered(j) or splintered(j - 1):
        return None
    a0, _ = facet_span(j)
    s = slot_r(j)
    top = min(cleave_y(*polar(s, a0 - SLOT_HW)),
              cleave_y(*polar(s, a0 + SLOT_HW))) - 0.06
    bot = top - (SEAM_FLOOR + SEAM_LONG * h01(j, 29) ** 1.7)
    # does this joint pass through the doorway's bite? then it ends on it.
    x, z = polar(s + SEAM_REACH, a0)
    if abs(x) <= DOOR_HW + 0.10 and DOOR_Z0 - 0.10 <= z <= DOOR_Z1 + 0.10:
        bot = max(bot, DOOR_Y1 + 0.22)
    bot = max(bot, SEAM_FLOOR)
    # EVERY JOINT WITH STONE TO CRACK CARRIES SOMETHING. Round 6b let a short
    # run fall out entirely and half the tower came back unlit — the sheet
    # showed two marks on the left and a dead right-hand side, which reads as
    # a decal rather than as a block that is failing all over. A run too short
    # to be a crack becomes a NICK under the cleave, which is what the cut
    # leaves at a joint it did not open.
    return (bot, top) if top - bot > 0.40 else (top - 0.40, top)


def seam_segments(j):
    """The (y0, y1) marks the crack at joint j is actually made of.

    Unequal lengths, unequal gaps, both off the seeded grain rather than off a
    counter — same discipline as grain(): the value has to depend on WHICH
    joint and WHICH mark it is, so a re-bake reproduces it exactly."""
    span = seam_span(j)
    if span is None:
        return []
    y0, y1 = span
    n = SEAM_SEGS[0] + int(h01(j, 31) * (SEAM_SEGS[1] - SEAM_SEGS[0] + 1))
    n = min(n, SEAM_SEGS[1])
    if y1 - y0 < 1.1:
        n = 1                       # a nick is one mark; three would be dust
    weights = [0.45 + h01(j * 13 + i, 37) for i in range(n)]
    gaps = [SEAM_GAP_FRAC[0] + (SEAM_GAP_FRAC[1] - SEAM_GAP_FRAC[0]) * h01(j * 7 + i, 41)
            for i in range(max(0, n - 1))]
    total = sum(weights) + sum(gaps)
    out, cursor = [], 0.0
    for i, w in enumerate(weights):
        a = cursor / total
        cursor += w
        b = cursor / total
        if i < len(gaps):
            cursor += gaps[i]
        lo, hi = y0 + (y1 - y0) * a, y0 + (y1 - y0) * b
        if hi - lo > 0.14:
            out.append((lo, hi))
    return out


def build_seams():
    """The filaments, lying in the bottoms of their slots.

    Each mark tapers to a POINT at both ends in width AND in climb — the
    climb is the dimmer switch (a filament near the slot's mouth is seen from
    a wide cone and reads bright; one on its floor is seen only head-on and
    reads as a hairline), and the width is what stops a mark ending on a
    square cap, which is what made round 6a's read as a fluorescent tube."""
    verts, faces = [], []
    for j in range(NF):
        a0, _ = facet_span(j)
        s = slot_r(j)
        r_in = s + SEAM_GAP
        # never out past the slot's own shoulder: a filament that breaks the
        # silhouette is a rib with a light on it, not a crack with light in it
        # PROPORTIONAL, not "the cap minus a constant": subtracting a fixed
        # 0.06 from a 0.14 slot leaves a filament on the floor and from a 0.26
        # slot leaves one near the mouth, so the same recipe produced a dead
        # crack and a neon one side by side. A fraction keeps every filament
        # the same distance UNDER its own shoulder in proportion.
        reach = min(SEAM_REACH, slot_room(j) * 0.75)
        # EVERY CRACK HAS ITS OWN APERTURE. With the splinters spread, the two
        # joints either side of the doorway both showed in full — and at one
        # width they read as a matched PAIR flanking the door, which is
        # joinery. A fissure's opening is a property of the fissure.
        aperture = 0.55 + 0.85 * h01(j, 59)
        for si, (y0, y1) in enumerate(seam_segments(j)):
            base = len(verts)
            for k in range(SEAM_LEVELS):
                t = k / (SEAM_LEVELS - 1.0)
                y = y0 + (y1 - y0) * t
                # FLAT-TOPPED, NOT LENS-SHAPED. A sin() taper over the whole
                # run makes an almond, and once the splinters stopped burying
                # them the two front joints rendered as a matched pair of
                # almonds — an unmistakable pair of EYES on the facade, and the
                # bookend trap besides. A crack is one width for almost all of
                # its length and closes fast at the ends.
                taper = min(1.0, min(t, 1.0 - t) / 0.10)
                hw = SEAM_HW * aperture * (0.10 + 0.90 * taper ** 0.5)
                r_out = r_in + reach * (0.25 + 0.75 * taper ** 0.6)
                # …and it WANDERS. Two dead-straight vertical marks either side
                # of a doorway is joinery; the wander is what says fracture.
                wob = SEAM_WANDER * (h01(j * 29 + si, 53 + k) - 0.5) * taper
                for r, dphi in ((r_in, -hw), (r_in, hw), (r_out, hw), (r_out, -hw)):
                    x, z = polar(r, a0 + dphi + wob)
                    verts.append(tuple(F.spec_to_blender(x, y, z)))
            for k in range(SEAM_LEVELS - 1):
                a, b = base + k * 4, base + (k + 1) * 4
                for q in range(4):
                    m = (q + 1) % 4
                    faces.append((a + q, a + m, b + m, b + q))
            faces.append((base + 3, base + 2, base + 1, base))
            top = base + (SEAM_LEVELS - 1) * 4
            faces.append((top, top + 1, top + 2, top + 3))
    ob = F.obj_from_pydata("towerSkinNullSeams", verts, faces)
    F.recalc_normals(ob)
    return ob


def build_throat():
    """The veins on the back wall of the doorway's pocket.

    Flat plates standing 0.045 off a wall 2.3 behind the opening — which is
    the whole trick: the depth is real, so the light arrives at the eye down a
    tunnel of unlit stone instead of on the facade beside it."""
    verts, faces = [], []
    for cx, y0, y1, hw in THROAT_VEINS:
        base = len(verts)
        for k in range(THROAT_LEVELS):
            t = k / (THROAT_LEVELS - 1.0)
            y = y0 + (y1 - y0) * t
            # widest at the waist, closed to a hairline at both ends, wandering
            # in x, and RAGGED level to level — a fracture's edges do not agree
            taper = math.sin(math.pi * t)
            w = hw * (0.08 + 0.92 * taper ** 0.55) \
                * (1.0 - THROAT_JAG * 6.0 * h01(int(cx * 100) + k, 47))
            cxk = cx + 0.30 * (h01(int(cx * 100), k) - 0.5) * (1.0 - abs(2 * t - 1))
            p = THROAT_PROUD * (0.35 + 0.65 * taper)
            for x, z in ((cxk - w, THROAT_Z - THROAT_BURY),
                         (cxk + w, THROAT_Z - THROAT_BURY),
                         (cxk + w, THROAT_Z + p), (cxk - w, THROAT_Z + p)):
                verts.append(tuple(F.spec_to_blender(x, y, z)))
        for k in range(THROAT_LEVELS - 1):
            a, b = base + k * 4, base + (k + 1) * 4
            for q in range(4):
                m = (q + 1) % 4
                faces.append((a + q, a + m, b + m, b + q))
        faces.append((base + 3, base + 2, base + 1, base))
        top = base + (THROAT_LEVELS - 1) * 4
        faces.append((top, top + 1, top + 2, top + 3))
    ob = F.obj_from_pydata("towerSkinNullThroat", verts, faces)
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
    # how far into the fissure this point sits — the fissures are the grain you
    # can see from the far side of the table. THREE TIERS, not two: the slot's
    # floor goes to BORE_DARK rather than to FISSURE, because it is the
    # backdrop the filament is read against and a 0.135 sRGB backdrop turns a
    # 0.105-luminance emissive into a slightly brighter grey.
    depth = max(0.0, r_face - radius_of(x, z))
    c = lerp3(c, FISSURE, smoothstep(depth, 0.015, 0.115))
    c = lerp3(c, BORE_DARK, smoothstep(depth, 0.13, 0.22))
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
        # THE POCKET GOES BLACK AT THE BACK (round 6c). At 0.30 + 0.50·lit the
        # deepest wall still carried a third of the stone's albedo, and with an
        # ember inside the pocket that turned the whole back plane into an
        # evenly lit rectangle — a lit BOX, which is the opposite of a throat.
        # The reveal keeps its value where the light rakes across it, near the
        # opening; the far wall is only what the veins put on it.
        rake = smoothstep(z, DOOR_Z0, 0.0)        # the doorway's reveal
        c = lerp3(BORE_DARK, STONE, 0.05 + 0.62 * rake)
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


def paint_lit(_poly, _co):
    """A filament's ALBEDO, which is nearly nothing on purpose. What this mesh
    is for arrives as material emissive, and emissive is not multiplied by
    COLOR_0 — so any albedo here is a second, dimmer, differently-lit copy of
    the same shape fighting the first one."""
    return LIT_STONE


def paint_shard(_poly, co):
    x, y, z = co.x, co.z, -co.y
    over = y - lane_y(z)
    c = lerp3(STONE, FISSURE, 0.72)               # engine furniture reads DOWN:
    #                                               the lane must never
    #                                               out-value the dice on it
    c = tuple(v * (0.86 + 0.30 * h01(int(z * 5), int(x * 4))) for v in c)
    c = lerp3(c, FRACTURE, 0.45 * smoothstep(over, 0.06, 0.28))
    c = violet_shift(c, 0.30)
    return tuple(a + b for a, b in zip(c, burn(smoothstep(-z, 0.0, 0.26))))


# --------------------------------------------------------------------------
# MEASUREMENT — every claim re-derived from the BUILT triangles
# --------------------------------------------------------------------------
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


def assert_the_light_is_countable(_objs):
    """The house's ceiling, and this tower's own ladder, in one place.

    js/post.js's bloom threshold is 0.9 on LINEAR luminance and there is no
    post-hoc dial, so a tower authors AGAINST the number (js/towerhollow.js's
    value ladder says the same thing for the code-built fae tower). The
    ordering claim is the identity one: the mouth is where the stone is being
    unmade, so it must out-value the cracks, and BOTH must stay under the
    stone's own lit value by enough that this is still a dark object."""
    seam, throat = lum_of(SEAM_EMIT), lum_of(THROAT_EMIT)
    if throat >= 0.9 or seam >= 0.9:
        raise RuntimeError(f"emissive over the bloom threshold: seams {seam:.3f}, "
                           f"throat {throat:.3f}, threshold 0.9")
    if throat <= seam:
        raise RuntimeError(f"the throat ({throat:.3f}) does not out-value the "
                           f"cracks ({seam:.3f}) — the mouth is the source")
    if throat > 0.45:
        raise RuntimeError(f"the throat at {throat:.3f} is a lantern, not an "
                           f"absence with something in it (ceiling 0.45)")
    print(f"[null] the light is countable: throat {throat:.3f}, seams "
          f"{seam:.3f} linear luminance, both under the 0.9 bloom threshold; "
          f"2 emissive tiers, 0 baked lights")
    # THE CRACK LEDGER — what the seed dealt, printed rather than assumed.
    # WHICH joints run deep is not a rule and cannot be one (a rule that put
    # the long cracks where they compose best would be a rule about the
    # camera), so it is a seeded draw, and the honest way to hold a seeded
    # draw is to look at the hand: how many marks a bake carries, how they sit
    # around the tower, and whether the front is dead.
    rows, front = [], 0
    for j in range(NF):
        segs = seam_segments(j)
        if not segs:
            continue
        phi = math.degrees(facet_span(j)[0])
        run = segs[-1][1] - segs[0][0]
        rows.append(f"{j}@{phi:.0f}deg x{len(segs)} {run:.1f}")
        if math.cos(math.radians(phi)) > 0.35:
            front += len(segs)
    if front < 2:
        raise RuntimeError(f"the seed dealt {front} marks to the front third "
                           f"of the tower — the face a player looks at is "
                           f"unlit and the light is all round the side")
    print(f"[null] the crack ledger: {len(rows)} cracked joints of {NF}, "
          f"{front} marks on the front third — {'  '.join(rows)}")


def assert_the_light_is_seen(lit_objs, occluders):
    """EMISSIVE IS NOT A LIGHT — so a glow no shipped eye can reach is zero
    pixels, not a mood.

    js/towerhollow.js paid for this with a gill surface facing straight down at
    a camera 40-60 degrees above it. Here it is a raycast rather than a
    paragraph: sample every emitting face's centre, fire at it from each of the
    six shipped eyes, and count the ones nothing else on the model gets in
    front of first."""
    import numpy as np
    occ = K.tri_array(occluders)
    for ob in lit_objs:
        tris = K.tri_array([ob])
        pts = tris.mean(axis=1)
        best, worst = (None, -1), (None, 10 ** 9)
        for eid, e in TG.shipped_eyes():
            eye = np.array(e, dtype=float)
            seen = 0
            for p in pts:
                d = p - eye
                L = float(np.linalg.norm(d))
                if K.ray_hit(occ, eye, d / L, L - 0.01) is None:
                    seen += 1
            if seen > best[1]:
                best = (eid, seen)
            if seen < worst[1]:
                worst = (eid, seen)
        if best[1] == 0:
            raise RuntimeError(
                f"{ob.name}: not one of its {len(pts)} emitting faces is "
                f"visible from ANY of the six shipped eyes — this glow costs "
                f"triangles and renders nothing (js/towerhollow.js's gill)")
        print(f"[null] {ob.name} is seen: {best[1]}/{len(pts)} emitting faces "
              f"from {best[0]}, {worst[1]}/{len(pts)} from {worst[0]}")
        # PER JOINT, for the seams, because the aggregate hid the interesting
        # fact: a bake can be "13% seen" with two joints carrying all of it and
        # ten contributing a dotted line that aliases in motion. The number
        # that matters is how many joints are ON, not how many faces are.
        if "Seams" not in ob.name:
            continue
        eid, eye = max(TG.shipped_eyes(), key=lambda p: -abs(p[1][0]))
        eye = np.array(eye, dtype=float)
        per = {}
        for p in pts:
            phi = math.degrees(math.atan2(p[0] - AX, p[2] - AZ)) % 360.0
            j = int(round(phi / (360.0 / NF))) % NF
            d = p - eye
            L = float(np.linalg.norm(d))
            hit = K.ray_hit(occ, eye, d / L, L - 0.01) is None
            a, b = per.get(j, (0, 0))
            per[j] = (a + (1 if hit else 0), b + 1)
        on = [f"{j}:{v[0]}/{v[1]}" for j, v in sorted(per.items()) if v[0]]
        print(f"[null]   from {eid}, joints showing anything: {len(on)} of "
              f"{len(per)} — {' '.join(on)}")





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
    seams = build_seams()
    throat = build_throat()
    meshes = [mass, splinters, shard, seams, throat]

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
    # THE TWO LIT MESHES. Separate objects because they are separate VALUES and
    # one material can only carry one — that is the whole reason this is two
    # meshes and not a painted band on the mass. Roughness at the top of the
    # matte range and F0 down at 0.008: an emitter with a specular lobe picks
    # up the room's warm lantern on top of its own cold light, which is how a
    # violet filament comes out grey (forge trap 11, one level down).
    F.paint_corners(seams, "Col", paint_lit)
    F.single_material(seams, F.vertex_color_material(
        "nullSeams", "Col", roughness=0.94, specular_level=0.08,
        emission=SEAM_EMIT))
    F.paint_corners(throat, "Col", paint_lit)
    F.single_material(throat, F.vertex_color_material(
        "nullThroat", "Col", roughness=0.94, specular_level=0.08,
        emission=THROAT_EMIT))

    # THE CONTRACT'S BATTERY, from the kit — approach, throat, occlusion, the
    # hollow, the lane, the front, the socket. The occluder handed to the
    # front gate is the MASS ALONE: a splinter must never be able to cover for
    # a wall that stopped being one.
    ran = K.run_battery(meshes, SPEC, tag="null", tilt_deg=0.0,
                        x_lim=XLIM, crown_max=CROWN_MAX,
                        clad={"towerSkinNullShard"},
                        occluder=[mass], front_top=cleave_y(0.0, 0.0))
    # …and THIS tower's own shape and light claims, which no kit can own.
    assert_the_crown_is_a_cleave(meshes)
    assert_the_light_is_countable(meshes)
    assert_the_light_is_seen([seams, throat], [mass, splinters, shard])
    if len(ran) != 7:
        raise RuntimeError(f"the battery ran {len(ran)} gates, not 7: {ran}")

    pin, pout = F.tower_portals(PORTAL_IN, PORTAL_OUT)
    # WHERE THE LIGHT GOES, said once, by the recipe, from the mesh. The house
    # trait is a lit focal light; this house has no fire, so the ember is the
    # unmaking itself — the die's own witchlight.
    #
    # ROUND 6 MOVED IT INSIDE. It used to hang at the doorway's upper-left
    # corner, just inside the plane, where it lit a lintel and nothing else:
    # on the sheet the mouth was a black rectangle with a faint smear along its
    # top edge. A light 1.6 back inside the pocket instead lights the pocket —
    # the back wall the veins climb, the reveal on both jambs, and the floor —
    # and what leaves through the opening arrives on the shard as spill rather
    # than as a lamp pointed at the facade. The veins are what it is coming
    # FROM, which is the half a point light cannot supply: it has no body.
    pad = F.model_marker("doorPad", (-0.45, 1.55, -1.60),
                         {"nx": 0.0, "ny": 0.0, "nz": 1.0})

    F.assert_budget(meshes, BUDGET)
    F.report_bounds(meshes, "nullstone")
    # NO sit_on_ground: this model's frame IS the contract. y = 0 is the felt
    # and z = 0 is the socket plane.
    F.export_glb("nullstone", meshes + [pin, pout, pad], vertex_colors=True)


main()
