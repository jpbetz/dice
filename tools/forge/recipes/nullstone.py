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

=========================================================================
ROUND 6 — THE DIVERGENCE: **THE CROWN DID NOT FALL.**
=========================================================================
The judgement on round 5 was "structurally right, not yet handsome — the mass
reads, the fissures read, the cleave breaks the silhouette, but it is quiet."
This round buys loudness with the one thing this house can spend that no
other house can: a stone that stopped obeying gravity. The cleave went all
the way through. The crown came free. It is still there, hanging, over a
BREAK of nothing — congruent fracture faces, a wedge of open air between
them, and a rim that overhangs the stump on every flank so no reading of the
frame can put a support under it.

Three parts, readable at the resting eye (the /new-tower silhouette rule):
  BASE   a fissured mass meeting the felt, with the fallen shard out front.
  BODY   fourteen facets of fluted stone, cut through by the doorway, rising
         to a PROW at the front and falling away on every other heading —
         with one flank facet gone entirely and its wall HANGING off it.
  CROWN  a slab of the same stone, severed and SUSPENDED: its underside is
         the stump's own fracture surface, offset by 0.5-1.1 of nothing;
         its top is the diagonal cleave, with the splinters the cleave
         missed standing above it. Nothing touches. Nothing holds it.

WHERE THE WALL IS, AND IT IS ARITHMETIC RATHER THAN TASTE. The break wanted
to be low — the "upper third levitating" version of this idea. It cannot be,
and the number that refuses it is in towerplan.py section 7 read twice:

  · the occlusion proof needs the model's FRONT solid to y 9.864 (the wide.full
    ray to the deepest cowl sample crosses the socket plane there);
  · and `gate_front_carries_the_dark`'s second claim — a die must still be in
    view when it reaches the mouth — needs the declared front_top >= 9.992,
    which is the BINDING one and is easy to miss because towerplan does not
    print it: solve `seen_to(front_top) >= rimY` at wide.full and it falls out.

A gap in the front below that line is not a gap, it is a leak: a ray from
wide.full entering a 9.0-9.6 slot sails over the stump's top and lands on the
cowl band at y 8.53. Measured, not argued. So the break's front lip measures
10.078 (front_panel_floor(), every bake) and the crown tops out at 12.20 —
**the whole float, gap included, gets 2.12 of the tower's 12.30 at the
front, and 0.86 of that is the void.** The idea survives at full size anyway
because the constraint is only on the FRONT PANEL (|x| <~ 2.0, near the
socket plane): everywhere else the break falls as far as it likes, and it
does — 10.42 at the prow, 8.5 at the flanks and the back, so the crown is a
2.7-thick slab on the left and a 0.9 blade at the prow. The stump is a wedge
with a raised front; the float is its complement.

FIVE CUES CARRY "SUSPENDED" IN A STILL FRAME (the bake is static; nothing
animates, so the read has to be geometric), and the sheet ranked them very
differently from the way this list was first written:

  1. THE OVERHANG IS THE WHOLE CUE, and it has to be ON THE FRONT. With the
     two plans flush at the prow the gap rendered from the resting eye as a
     RECESSED COURSE — a dentil band, a piece of moulding — because a void
     you cannot see UNDER reads as a groove. Stepping the stump's front
     facets back 0.24 (which the occlusion proof does not care about: it is
     a claim about how TALL the front is, never how far forward) turned the
     same geometry into a slab standing over nothing. The flanks carry 0.2-0.5
     of the same; `assert_the_crown_hangs` measures every facet.
  2. THE SECOND FLOAT. One suspended piece at the top is a capstone; two, at
     different heights and headings, is a rule about this stone. The hung
     shard is a plank of the right flank standing 0.36 off a wall that is no
     longer there, five units of air under it, at the height a seated player
     looks straight at. It is also the only part of this experiment that
     breaks the SILHOUETTE, which is what the crown used to do before the
     occlusion floor took its headroom.
  3. CONGRUENT FACES. The float's underside is `break_y + gap_at` — literally
     the stump's top surface, fracture noise and all, lifted. The eye reads
     two halves of one break rather than two objects.
  4. VALUE, AND IT IS NOT FREE. Everything above y ~9 arrived with no light
     on it: the room's key rakes at y 5.5 and the lantern's reach is short,
     so the crown, the break face and the splinters all rendered as one
     shadow. `height_lift` buys the albedo back. A slab you cannot see is not
     a slab you can see hanging.
  5. SEE-THROUGH, WHICH DID NOT PAY. The gap widens going back faster than a
     high eye's ray falls, so 0.74 of the front slot is genuinely open sky
     from wide.full — and it is INVISIBLE, because the room behind the tower
     is as dark as the tower. The measurement is kept (it is cheap, and it
     is the claim that the gap is a void rather than a recess) but the cue a
     dark room actually pays for is the overhang's own shadow.

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

THE INSIDE, and why it is shaped like that. The STUMP is the occluder of
record — `gate_front_carries_the_dark` is handed the stump ALONE, and so is
this recipe's own `assert_the_stump_alone_carries_the_dark`, which re-runs the
whole six-eye occlusion grid against it. A floating crown is a decoration in
the contract's eyes no matter how much of the mass it is, and a decoration
must never be able to cover for a wall that stopped being one.

The bore is 2.34 wide (clearR 2.20 plus margin) only where the contract needs
it — from y 7.20 up. Below that it narrows to 1.55, which is what buys the
doorway its reveal: at the door's own height the wall is stone, not shell, and
the opening reads as a passage into a mass rather than a hole in a can. Above
the break the bore runs on through the float at the same 2.34, so the drop
falls through both pieces and the approach column never sees the difference.

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
CROWN_MAX = 12.45                  # the socket's own ceiling is 12.5

# --- the mass --------------------------------------------------------------
NF = 14                            # facets around the fluted skin
GROOVE_D = 0.115                   # how deep the fissures are cut
FACE_INSET = 0.19                  # where a facet's flat starts, as a fraction
MASS_Y0 = -0.05                    # sunk a little into the felt
BORE_R_HI = 2.34                   # above the taper: clearR 2.20 + 0.14
BORE_R_LO = 1.55                   # below it: the doorway's reveal
BORE_TAPER = (5.20, 7.20)          # narrow below, full above
BORE_FLOOR = 4.90                  # the interior floor, well under despawnY
# Tessellation. Absolute bands first (they carry the colour grain and, in the
# bore, the taper), then FRACTIONS of whatever is left up to the break — which
# is a surface, not a number, so a fixed band list would poke through it on the
# low headings and leave degenerate quads on the high ones.
OUT_ABS = [MASS_Y0, 1.2, 2.6, 4.0, 5.4, 6.6, 7.6]
OUT_FRACS = [0.34, 0.68, 0.94]
BORE_ABS = [BORE_FLOOR, 5.20, 5.70, 6.20, 6.70, 7.20, 7.70]
BORE_FRACS = [0.40, 0.75]
# …and the LAST band of each is deliberately thin. `paint_corners` colours by
# POSITION, so a vertex on the break's rim carries the burn into every face
# that touches it — including the outer skin's top quad, which is 0.9 tall.
# Round 6d shipped exactly that: a hairline at the lip and a 0.9 olive wash
# down every flute under it, which is round 3's finding arriving through a
# door nobody was watching. A tight top band is what makes a painted thread a
# thread instead of a gradient.
FLOAT_FRACS = [0.0, 0.06, 0.28, 0.54, 0.78, 0.94, 1.0]

# --- THE BREAK: where the mass stopped and the crown did not fall ----------
# BREAK_FRONT is the whole experiment's binding number. towerplan section 7
# says the front must be solid to 9.864 for the occlusion rays and 9.992 for
# the die-still-visible claim; the front lip of the break is measured (not
# assumed) by `front_panel_floor()` and handed to the gate.
BREAK_FRONT = 10.42                # the prow, at x = 0 on the front face
BREAK_KU = 0.240                   # falls this much per unit of depth, going back
BREAK_KX = 0.075                   # …and leans, so the prow is not symmetric
BREAK_KW = 0.85                    # …and falls away hard past the front panel
BREAK_XW = 1.95                    # where "past the front panel" starts
BREAK_NOISE = 0.22                 # fracture roughness, +/-
U_FRONT = 2.69                     # depth of the front face from the bore axis

# --- THE GAP: the wedge of nothing -----------------------------------------
# It OPENS GOING BACK on purpose. A high eye's ray falls 0.184 per unit of
# depth; the stump's top falls 0.240. If the gap were parallel the ray would
# die on the float's underside and the slot would read as a recess. Widening
# it by 0.030 per unit buys a see-through band out the back — cue 3 in the
# header, measured by assert_the_crown_hangs rather than hoped for.
GAP_0 = 0.86                       # at the prow
GAP_KU = 0.030                     # wider toward the back
GAP_KX = 0.045                     # …and toward +x
FLOAT_MIN_T = 0.45                 # the float is never thinner than this

# --- the cleave, which is now the float's TOP ------------------------------
# Two planes and two clamps, as before, but re-aimed: it falls mostly ACROSS
# the tower (toward -x) rather than backward, because the float's underside
# already falls backward and a cleave parallel to it would give a slab of
# constant thickness — which is a lid, not a fracture. It falls to the LEFT so
# the splinters (which stand where the cut went lowest) land opposite the
# hanging shard: the crown is torn on one side of the frame and the flank on
# the other, which is composition rather than a pile.
CLEAVE_A = (12.06, 0.05, 0.10)     # const + a1*u + a2*x — 12.10 put 43% of
#                                    the rim on the upper clamp, which is a
#                                    level plateau wearing a cleave's name
CLEAVE_B = (12.44, -0.02, 0.56)
CLEAVE_LO, CLEAVE_HI = 10.60, 12.20

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

# --- THE HUNG SHARD: the second thing that is not falling ------------------
# One suspended piece at the top is a capstone; two, at different heights and
# on different headings, is a rule about this stone. This one is a plank of
# the flank wall, severed and standing off it, hovering with five units of
# nothing under it at the height a seated player looks straight at.
#
# TWO NUMBERS ARE INVARIANTS RATHER THAN TASTE:
#   · its TOP stops SHARD_UNDER below the break, so nothing about it can be
#     read as a column holding the crown up — which is the one misreading that
#     would undo the whole experiment. Measured by assert_the_crown_hangs.
#   · its heading is a FLANK facet outside the door cut (|x| > 2.1 at its own
#     radius) and outside the bore's clear disc, so it costs no gate anything.
# The stump's facet under it is pinned to the wall floor (2.56 = bore + wall),
# which is what makes the radial gap exist at all in a socket this tight.
SHARD_FACET = 2                    # 51.4-77.1 deg: the right flank
SHARD_Y0 = 5.05                    # its lowest corner — the door lintel is 4.5
SHARD_UNDER = 0.62                 # how far its top stops below the break
SHARD_R_OUT = 3.17                 # the skin it used to be part of
SHARD_T0, SHARD_T1 = 0.28, 0.17    # thick at the foot, a knife edge on top
#                                    ROUND 6b: 0.32 put the plank 0.285 from
#                                    the wall and the hang gate refused it —
#                                    a socket this tight pays for a floating
#                                    piece in the thickness of the piece.
SHARD_LEAN = 0.058                 # rad of tangential drift, top vs foot — a
#                                    plank that hangs OFF TRUE cannot be a post
SHARD_MARGIN = 0.17                # of the facet span, kept clear of each joint
SHARD_SECS = 5

# --- the splinters the cleave missed ---------------------------------------
# They ride the FLOAT now, standing over the cleave where the cut went lowest.
# Filled in below, once the cleave exists.
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
UNDERSIDE = (0.0030, 0.0028, 0.0042)      # THE FLOAT'S CEILING — the darkest
#                                           albedo in the recipe. It is a
#                                           downward face with no key light on
#                                           it and it sits directly over the
#                                           brightest face on the tower; that
#                                           contrast IS the gap.
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
LIP_BURN = 0.13                           # …and THIS is what a cut edge takes
#                                           where the two lips of the break
#                                           face each other. Five times the
#                                           field burn over one tenth of a
#                                           unit: the void needs an outline or
#                                           it is a shadow, and every softer
#                                           version of this line disappeared
#                                           into the room's own darkness.
LIP_INSET = 0.10                          # how wide the thread is allowed to be


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


def add3(a, b):
    return tuple(p + q for p, q in zip(a, b))


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
# the mass: plan, break, gap, cleave, bore
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


def facet_r(f, gen=0):
    """One radius per facet — flat faces, crisp arrises, no cylinder.

    THE PLAN IS THE SOCKET'S, NOT A CIRCLE'S (round 3). Sampling a circle
    about the bore axis made a tower whose front face was a narrow strip, and
    the doorway — 4.2 wide by contract — then ate the whole of it: the render
    read as a shell torn open, not as an opening in a mass. Taking `reach` as
    the base and cutting each facet BACK from it instead fills the socket the
    way a quarried block would, and the door lands in the middle of a broad
    flat face with real stone either side of it.

    gen=0 is the STUMP, gen=1 the FLOAT, and the difference is the whole
    overhang cue (round 6): the float keeps far more of its reach on the
    flanks, so its rim stands proud of the stump it is not resting on.

    ROUND 6c PUT THE OVERHANG ON THE FRONT TOO, and that was the frame that
    turned this idea from a detail into the model. With the two plans flush at
    the prow, the gap rendered from the resting eye as a RECESSED COURSE — a
    dentil band, a piece of moulding — because a void you cannot see under
    reads as a groove. The fix is not more gap; it is 0.24 of stone standing
    over nothing where the player is looking. The occlusion proof does not
    care: it is a claim about how TALL the front is, never about how far
    forward it stands, so the prow can step back 0.2 and keep every ray."""
    a0, a1 = facet_span(f)
    room = min(reach(a) for a in (a0, 0.5 * (a0 + a1), a1)) - 0.04
    # THE ONE FACET THAT IS NOT THERE ANY MORE. The stump is pinned to its wall
    # floor under the hung shard, because the socket has no room to move a
    # floating piece OUTWARD: the only way to open a gap is for the stone
    # behind it to have gone. Which is the house's own story anyway.
    if f == SHARD_FACET and not gen:
        return BORE_R_HI + 0.22
    # the front three facets keep their face: that is where the door is cut
    front = math.cos(0.5 * (a0 + a1)) > 0.80
    if front:
        inset = (0.02 + 0.06 * h01(f, 5)) if gen else (0.24 + 0.10 * h01(f, 5))
    else:
        inset = 0.06 + 0.62 * h01(f, 5)
        if gen:
            # …and TWO BITES. A crown that is a complete ring of even width
            # reads as a lid whatever the gap under it does; the cleave that
            # took it off did not cut a circle, so a couple of headings lose
            # most of their width and the slab gets a plan with corners in it.
            inset *= (3.4 if h01(f, 91) > 0.80 else 1.0) * (0.16 + 0.30 * h01(f, 23))
    # THE WALL HAS TO EXIST. The socket is tightest at the BACK (2.70 from the
    # axis) and a deep inset there drove the outer skin INSIDE the bore — the
    # approach gate found it as a hit at (-0.43, -4.71), which is the wall
    # turned inside out rather than anything leaning in. The floor is the bore
    # plus a wall, and it binds on exactly the two rear facets.
    return max(room - inset, BORE_R_HI + 0.22)


def ring_xz(gen=0):
    """The plan: two flat points per facet and one groove bottom between them.

    The groove takes the SHALLOWER of its two neighbours so a fissure is
    always a notch and never a step outward, and using one shared point per
    joint (rather than one per facet) keeps two vertices off the same spot —
    which canonicalize would warn about and the digest would feel."""
    pts = []
    for f in range(NF):
        a0, a1 = facet_span(f)
        d = a1 - a0
        r = facet_r(f, gen)
        pts.append(polar(min(r, facet_r((f - 1) % NF, gen)) - GROOVE_D, a0))
        pts.append(polar(r, a0 + FACE_INSET * d))
        pts.append(polar(r, a1 - FACE_INSET * d))
    return pts


RING = ring_xz(0)                  # the stump's plan
FRING = ring_xz(1)                 # the float's plan — wider on the flanks
RING_N = len(RING)
PHI = [phi_of(x, z) for x, z in RING]
FPHI = [phi_of(x, z) for x, z in FRING]


def fracture_n(x, z):
    """A smooth, seeded, continuous roughness field over the plan, in ~[-1,1].

    It has to be a FIELD rather than per-vertex noise: the stump's top and the
    float's underside are sampled at different radii (two different plans) and
    they must still be the same broken surface, or cue 1 in the header is a
    claim the geometry does not support."""
    n = 0.0
    for k, (fx, fz, amp) in enumerate(((0.58, 0.43, 0.54),
                                       (1.17, -0.81, 0.31),
                                       (2.03, 1.55, 0.15))):
        n += amp * math.sin(fx * x + fz * z + h01(k * 37, 5) * 6.2832)
    return n


def break_y(x, z):
    """THE BREAK. The stump's top and (offset by the gap) the float's floor.

    A prow at the front — the occlusion proof lives there and nothing may be
    taken out of it — falling away on every other heading, plus the fracture
    field. The |x| term is what makes the flanks low enough for the float to
    be a slab rather than a lid."""
    u = z - AZ
    wing = BREAK_KW * max(0.0, abs(x) - BREAK_XW) ** 1.3
    return (BREAK_FRONT - BREAK_KU * U_FRONT + BREAK_KU * u + BREAK_KX * x
            - wing + BREAK_NOISE * fracture_n(x, z))


def gap_at(x, z):
    """How much nothing there is between the two faces, at this heading."""
    return GAP_0 + GAP_KU * (U_FRONT - (z - AZ)) + GAP_KX * x


def float_lo(x, z):
    return break_y(x, z) + gap_at(x, z)


def cleave_y(x, z):
    """THE CUT that took the crown off — now the floating slab's own top.
    Two planes and two clamps, and a floor that keeps the slab from thinning
    to a sliver where the two surfaces converge."""
    u, = (z - AZ,)
    a = CLEAVE_A[0] + CLEAVE_A[1] * u + CLEAVE_A[2] * x
    b = CLEAVE_B[0] + CLEAVE_B[1] * u + CLEAVE_B[2] * x
    y = max(CLEAVE_LO, min(CLEAVE_HI, a, b))
    return max(y, float_lo(x, z) + FLOAT_MIN_T)


def facet_cleave(f):
    """Where the cut crosses a facet's own face (on the float's plan)."""
    a0, a1 = facet_span(f)
    return cleave_y(*polar(facet_r(f, 1), 0.5 * (a0 + a1)))


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


def front_panel_floor():
    """The LOWEST the break gets over the panel the occlusion rays cross.

    Measured off the plan the model is actually built on — every ring segment
    with real depth and |x| inside the ray fan — because `front_top` is a
    claim `gate_front_carries_the_dark` checks against 9.992, and an estimate
    of a noisy surface is exactly the kind of number that passes the sketch
    and fails the bake."""
    lo = 1e9
    for j in range(RING_N):
        x0, z0 = RING[j]
        x1, z1 = RING[(j + 1) % RING_N]
        for i in range(9):
            t = i / 8.0
            x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            if z - AZ > 1.45 and abs(x) <= 2.0:
                lo = min(lo, break_y(x, z))
    return lo


# --------------------------------------------------------------------------
# building
# --------------------------------------------------------------------------

def loft(verts, faces, levels, flip):
    """levels: a list of rings, each a list of (x, y, z) in the app frame."""
    start, n = len(verts), len(levels[0])
    for ring in levels:
        for p in ring:
            verts.append(tuple(F.spec_to_blender(*p)))
    for k in range(len(levels) - 1):
        a, b = start + k * n, start + (k + 1) * n
        for j in range(n):
            m = (j + 1) % n
            q = (a + j, a + m, b + m, b + j)
            faces.append(q[::-1] if flip else q)
    return start, start + (len(levels) - 1) * n


def lip_ring(verts, ring, y_of, inset):
    """One extra ring of vertices just inside a fracture face's outer edge.

    THE HAIRLINE NEEDS GEOMETRY. The burn at a cut edge is painted per vertex,
    and the break face is one enormous quad from the outer skin to the bore —
    so a bright outer ring and a dark inner one is not a thread, it is a
    gradient across the whole annulus, and the whole crown comes out olive
    (round 3's finding, re-earned the moment the same paint met a bigger
    face). Putting a ring of vertices `inset` inside the rim confines the
    interpolation to that band, which is what makes a 0.10-wide line possible
    at all — and the fissures interrupt it for free, because a groove point
    sits further in than its facet and never lights."""
    start = len(verts)
    out = []
    for j, (x, z) in enumerate(ring):
        r = max(radius_of(x, z) - inset, BORE_R_HI + 0.05)
        xm, zm = polar(r, phi_of(x, z))
        out.append((xm, y_of(xm, zm), zm))
    for p in out:
        verts.append(tuple(F.spec_to_blender(*p)))
    return start


def build_stump():
    """The mass that meets the felt: fluted outer skin, tapered bore, a full
    disc at the foot, a disc at the bore's floor, and THE BREAK as an annulus
    across the top. One DIFFERENCE follows, for the door."""
    verts, faces = [], []
    top_out = [break_y(x, z) for x, z in RING]
    inner = [polar(BORE_R_HI, PHI[j]) for j in range(RING_N)]
    top_in = [break_y(x, z) for x, z in inner]

    levels = [[(x, y, z) for x, z in RING] for y in OUT_ABS]
    for fr in OUT_FRACS:
        levels.append([(RING[j][0], OUT_ABS[-1] + (top_out[j] - OUT_ABS[-1]) * fr,
                        RING[j][1]) for j in range(RING_N)])
    levels.append([(RING[j][0], top_out[j], RING[j][1]) for j in range(RING_N)])
    o_lo, o_hi = loft(verts, faces, levels, flip=False)

    blevels = []
    for y in BORE_ABS:
        blevels.append([(polar(bore_r(y), PHI[j])[0], y, polar(bore_r(y), PHI[j])[1])
                        for j in range(RING_N)])
    for fr in BORE_FRACS:
        blevels.append([(inner[j][0], BORE_ABS[-1] + (top_in[j] - BORE_ABS[-1]) * fr,
                         inner[j][1]) for j in range(RING_N)])
    blevels.append([(inner[j][0], top_in[j], inner[j][1]) for j in range(RING_N)])
    b_lo, b_hi = loft(verts, faces, blevels, flip=True)

    faces.append(tuple(range(o_lo + RING_N - 1, o_lo - 1, -1)))   # the foot
    faces.append(tuple(range(b_lo, b_lo + RING_N)))               # bore floor
    m_hi = lip_ring(verts, RING, break_y, LIP_INSET)              # THE BREAK
    for j in range(RING_N):
        m = (j + 1) % RING_N
        faces.append((o_hi + j, o_hi + m, m_hi + m, m_hi + j))
        faces.append((m_hi + j, m_hi + m, b_hi + m, b_hi + j))

    ob = F.obj_from_pydata("towerSkinNullMass", verts, faces)
    F.recalc_normals(ob)
    return ob


def build_float():
    """THE CROWN, SUSPENDED. Its floor is the stump's own break surface lifted
    by `gap_at`; its ceiling is the cleave; its plan is cut back from the
    socket far less than the stump's, so the rim overhangs. It touches
    nothing — assert_the_crown_hangs proves that by raycast, not by drawing."""
    verts, faces = [], []
    lo_out = [float_lo(x, z) for x, z in FRING]
    hi_out = [cleave_y(x, z) for x, z in FRING]
    inner = [polar(BORE_R_HI, FPHI[j]) for j in range(RING_N)]
    lo_in = [float_lo(x, z) for x, z in inner]
    hi_in = [cleave_y(x, z) for x, z in inner]

    levels = [[(FRING[j][0], lo_out[j] + (hi_out[j] - lo_out[j]) * fr, FRING[j][1])
               for j in range(RING_N)] for fr in FLOAT_FRACS]
    o_lo, o_hi = loft(verts, faces, levels, flip=False)
    blevels = [[(inner[j][0], lo_in[j] + (hi_in[j] - lo_in[j]) * fr, inner[j][1])
                for j in range(RING_N)] for fr in FLOAT_FRACS]
    b_lo, b_hi = loft(verts, faces, blevels, flip=True)

    m_lo = lip_ring(verts, FRING, float_lo, LIP_INSET)
    for j in range(RING_N):
        m = (j + 1) % RING_N
        faces.append((m_lo + j, m_lo + m, o_lo + m, o_lo + j))    # the underside
        faces.append((b_lo + j, b_lo + m, m_lo + m, m_lo + j))
        faces.append((o_hi + j, o_hi + m, b_hi + m, b_hi + j))    # the cleave
    ob = F.obj_from_pydata("towerSkinNullCrown", verts, faces)
    F.recalc_normals(ob)
    return ob


def build_splinters():
    """The wedges the cleave missed, standing over its low side — and riding
    the float, because that is where the cut is. They are the crown's whole
    silhouette break: without them the top is one clean line, which is a cut
    nobody made twice."""
    verts, faces = [], []
    for f, top in SPLINTERS:
        a0, a1 = facet_span(f)
        d = a1 - a0
        r = facet_r(f, 1)
        # A splinter is thick, and its inner face still stops OUTSIDE the drop:
        # taking a flat 0.62 off the facet radius put two of them 2.08 from the
        # axis once the plan widened, and the approach gate read it instantly.
        r_in = max(r - 0.62, BORE_R_HI + 0.10)

        # …and its outer corners sit OUTSIDE the facet's own angular span, so
        # they must answer to `reach` on THEIR heading rather than the facet's:
        # the first bake put a front splinter's corner at z +0.275 against a
        # socket plane of +0.25, which is the same arithmetic error the plan
        # already learned once, one element down.
        def out(a):
            return polar(min(r + 0.06, reach(a) - 0.03), a)

        sect = [polar(r_in, a0 - 0.16 * d), out(a0 - 0.10 * d),
                out(a1 + 0.10 * d), polar(r_in, a1 + 0.16 * d)]
        n = len(sect)
        # The foot sits INSIDE the float, 0.14 above its lowest corner here, so
        # the two solids overlap instead of sharing a face (forge trap 7) and
        # nothing of a splinter ever hangs below the crown it belongs to.
        foot = max(float_lo(x, z) for x, z in sect) + 0.14
        px, pz = 0.13 * (h01(f, 41) - 0.5), 0.13 * (h01(f, 43) - 0.5)
        tops = [top + px * (x - AX) + pz * (z - AZ) for x, z in sect]
        tops = [t - (max(tops) - top) for t in tops]   # the tilt is a CUT: it
        #                                                pivots under the top
        base = len(verts)
        for k in (0.0, 1.0):
            for (x, z), ty in zip(sect, tops):
                verts.append(tuple(F.spec_to_blender(x, foot + (ty - foot) * k, z)))
        for j in range(n):
            m = (j + 1) % n
            faces.append((base + j, base + m, base + n + m, base + n + j))
        faces.append(tuple(range(base + n - 1, base - 1, -1)))
        faces.append(tuple(range(base + n, base + 2 * n)))
    ob = F.obj_from_pydata("towerSkinNullSplinters", verts, faces)
    F.recalc_normals(ob)
    return ob


def build_hung():
    """THE HUNG SHARD. A plank of the flank, standing off the wall it came out
    of, five units of air under it and its top stopping well short of the
    crown. Its outer face is the skin the stump no longer has; its inner face
    is a taper, so it is a wedge rather than a panel; its ends are cut at
    different angles, so it is broken rather than sawn; and the whole thing
    leans off true, because a plank that hangs plumb is a post."""
    verts, faces = [], []
    a0, a1 = facet_span(SHARD_FACET)
    d = a1 - a0
    lo_a, hi_a = a0 + SHARD_MARGIN * d, a1 - SHARD_MARGIN * d
    secs = []
    for k in range(SHARD_SECS):
        t = k / (SHARD_SECS - 1.0)
        a = lo_a + (hi_a - lo_a) * t
        # a broken foot: the bottom edge climbs across the plank and jitters
        yb = SHARD_Y0 + 0.72 * t + 0.30 * (h01(k * 13, 61) - 0.5)
        xo, zo = polar(SHARD_R_OUT, a)
        yt = break_y(xo, zo) - SHARD_UNDER - 0.34 * t - 0.22 * h01(k * 7, 63)
        th_b = SHARD_T0 - 0.06 * h01(k, 65)
        th_t = SHARD_T1 - 0.04 * h01(k, 67)
        at = a + SHARD_LEAN                       # the lean, top vs foot
        secs.append([
            (polar(SHARD_R_OUT, a)[0], yb, polar(SHARD_R_OUT, a)[1]),
            (polar(SHARD_R_OUT, at)[0], yt, polar(SHARD_R_OUT, at)[1]),
            (polar(SHARD_R_OUT - th_t, at)[0], yt, polar(SHARD_R_OUT - th_t, at)[1]),
            (polar(SHARD_R_OUT - th_b, a)[0], yb, polar(SHARD_R_OUT - th_b, a)[1]),
        ])
    n = 4
    for sec in secs:
        for p in sec:
            verts.append(tuple(F.spec_to_blender(*p)))
    for k in range(SHARD_SECS - 1):
        a, b = k * n, (k + 1) * n
        for j in range(n):
            m = (j + 1) % n
            faces.append((a + j, a + m, b + m, b + j))
    faces.append((3, 2, 1, 0))
    last = (SHARD_SECS - 1) * n
    faces.append((last, last + 1, last + 2, last + 3))
    ob = F.obj_from_pydata("towerSkinNullHung", verts, faces)
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


def burn(t, k=BURN):
    """How much witchlight a cut edge carries, 0..1 -> a colour to add."""
    return tuple(c * k * max(0.0, min(1.0, t)) for c in WITCH)


def lip_of(r, rf):
    """1 on the rim's outer tenth, 0 anywhere further in — the thread."""
    return smoothstep(r - (rf - LIP_INSET - 0.01), 0.0, LIP_INSET)


def facet_of(phi):
    f = int(math.floor((phi % (2.0 * math.pi)) / (2.0 * math.pi / NF)))
    return f % NF


def grain(f, y):
    """Per-facet value, drifting slowly up the stone. THE GRAIN — keyed off
    WHICH facet and WHICH band, never off a running counter."""
    return 0.84 + 0.34 * h01(f * 71, 2) + 0.12 * (h01(f, int(y * 1.1) + 3) - 0.5)


LIFT = 1.35                        # how much albedo the crown has to buy back
LIFT_LO, LIFT_HI = 6.0, 11.8


def height_lift(y):
    """ROUND 6c, AND IT IS ROUND 5'S FINDING ONE STOREY UP. Round 5 lifted the
    whole tower because at "three times the die's own body" it rendered as a
    black cut-out with no facets and no fissures. The first frame of the
    floating crown said the same thing about the top: the room's key rakes the
    tower at y 5.5 and the lantern's reach is short, so everything above y ~9
    arrived with no light on it at all — the crown, the break face and the
    splinters all read as one shadow, and a slab you cannot see is not a slab
    you can see hanging.

    A baked model's only lever is ALBEDO, so it rises with height: the
    MATERIAL reads constant up the tower precisely because the light does
    not. This is compensation in the bake, and the /new-tower trap list is
    explicit that it must be verified by looking at a render rather than by
    comparing attributes — which is what the sheet after this change is for."""
    return 1.0 + LIFT * smoothstep(y, LIFT_LO, LIFT_HI)


def lift(c, y, k=1.0):
    g = 1.0 + (height_lift(y) - 1.0) * k
    return tuple(v * g for v in c)


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
    return lift(violet_shift(c, 0.55 * (1.0 - smoothstep(y, 0.4, 5.2))), y)


def paint_mass(_poly, co):
    """The stump. Its new top face is THE BREAK, and it is the brightest thing
    on the tower on purpose: an upward face aimed at the key light, seen
    through the gap, under a ceiling painted the darkest value in the file."""
    x, y, z = co.x, co.z, -co.y
    r = radius_of(x, z)
    top = break_y(x, z)
    if y > top - 0.03:                            # the break face
        rf = facet_r(facet_of(phi_of(x, z)))
        return add3(lift(FRACTURE, y),
                    add3(burn(lip_of(r, rf), LIP_BURN),        # the outer arris
                         burn(smoothstep(BORE_R_HI + 0.14 - r, 0.0, 0.14))))
    if in_door(x, y, z) and r < facet_r(facet_of(phi_of(x, z))) - 0.05:
        lit = smoothstep(z, DOOR_Z0, 0.0)         # the doorway's reveal
        c = lerp3(BORE_DARK, STONE, 0.30 + 0.50 * lit)
        return add3(c, burn(smoothstep(y, DOOR_Y1 - 0.20, DOOR_Y1)))
    if r < bore_r(y) + 0.05:                      # the hole
        return violet_shift(BORE_DARK, 0.30 * smoothstep(y, 8.6, top))
    return stone_at(x, y, z, facet_r(facet_of(phi_of(x, z))))


def paint_float(_poly, co):
    """The suspended crown. Three faces and each one has a job: the underside
    is the void's ceiling (darkest), the cleave is fracture, the skin is the
    same stone as the stump so the two pieces are one rock."""
    x, y, z = co.x, co.z, -co.y
    r = radius_of(x, z)
    lo, hi = float_lo(x, z), cleave_y(x, z)
    rf = facet_r(facet_of(phi_of(x, z)), 1)
    if y < lo + 0.03:                             # the void's ceiling
        # the ceiling takes only a THIRD of the lift: it is the one surface
        # whose job is to stay black, and a lifted ceiling closes the void.
        return add3(lift(UNDERSIDE, y, 0.33),
                    add3(burn(lip_of(r, rf), 0.85 * LIP_BURN),
                         burn(smoothstep(BORE_R_HI + 0.16 - r, 0.0, 0.16))))
    if y > hi - 0.03:                             # the cleave
        return add3(lift(FRACTURE, y), burn(smoothstep(bore_r(y) + 0.13 - r, 0.0, 0.13)))
    if r < BORE_R_HI + 0.05:                      # the hole, continued
        return violet_shift(BORE_DARK, 0.30)
    c = stone_at(x, y, z, rf)
    # a hairline of witchlight along the slab's own lower arris — the edge that
    # tells the eye where the stone stops and the nothing starts
    return add3(c, burn(smoothstep(y - lo, 0.34, 0.06)))


def paint_hung(_poly, co):
    """The hung shard. Its OUTER face is the skin the stump lost, painted as
    that skin; everything it broke along is fracture, and the cut ends carry
    the same hairline the crown's do."""
    x, y, z = co.x, co.z, -co.y
    r = radius_of(x, z)
    c = stone_at(x, y, z, SHARD_R_OUT)
    inward = smoothstep(SHARD_R_OUT - r, 0.10, 0.24)      # the broken back
    c = lerp3(c, lift(lerp3(FRACTURE, UNDERSIDE, 0.55), y), inward)
    return add3(c, burn(0.7 * inward))


def paint_splinters(_poly, co):
    x, y, z = co.x, co.z, -co.y
    f = facet_of(phi_of(x, z))
    top = max(t for ff, t in SPLINTERS if ff == f) if any(
        ff == f for ff, _t in SPLINTERS) else 12.0
    c = stone_at(x, y, z, facet_r(f, 1) + 0.03)
    c = lerp3(c, lift(FRACTURE, y), smoothstep(y - top, -0.12, 0.0))
    return add3(c, burn(smoothstep(y - top, -0.55, -0.05)))


def paint_shard(_poly, co):
    x, y, z = co.x, co.z, -co.y
    over = y - lane_y(z)
    c = lerp3(STONE, FISSURE, 0.58)               # engine furniture reads DOWN:
    #                                               the lane must never
    #                                               out-value the dice on it
    c = tuple(v * (0.86 + 0.30 * h01(int(z * 5), int(x * 4))) for v in c)
    c = lerp3(c, FRACTURE, 0.45 * smoothstep(over, 0.06, 0.28))
    c = violet_shift(c, 0.42)
    return add3(c, burn(smoothstep(-z, 0.0, 0.26)))


# --------------------------------------------------------------------------
# MEASUREMENT — every claim re-derived from the BUILT triangles
# --------------------------------------------------------------------------
def assert_the_crown_is_a_cleave(_objs):
    """The silhouette law, on the crown: one cut with a real fall across it,
    broken by splinters that clear it — not a level ring, not a fringe."""
    tops = [cleave_y(x, z) for x, z in FRING]
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


GAP_FLOOR = 0.30                   # nothing may be closer than this
OVERHANG_FLOOR = 0.18              # a rim that stands proud counts as unsupported
OVERHANG_FACETS = 5                # …and this many facets must do it
POST_CLEARANCE = 0.85              # air between the hung shard and the crown


def assert_the_crown_hangs(stump, floaters, hung):
    """THE DIVERGENCE'S OWN GATE, in three claims, all off the BUILT triangles.

    1. IT DOES NOT TOUCH. Every vertex of the floating group is dropped
       straight down onto the stump; the nearest landing is the gap. A drawing
       can claim separation, a raycast cannot be talked into it.
    2. IT OVERHANGS. On each facet, how far the float's rim stands past the
       stump's. This is the cue that survives bad lighting: a rim with the
       felt under it cannot be resting on anything.
    3. IT IS SEE-THROUGH. From the highest shipped eye, the band of entry
       heights at the front slot whose ray clears the stump's far lip and
       leaves the model out the back. Zero would mean the slot is a recess,
       which is a different (and much quieter) idea."""
    import numpy as np
    tris = K.tri_array([stump])
    pts = K.tri_array(floaters).reshape(-1, 3)
    # SIX DIRECTIONS, NOT ONE. The first version of this gate cast straight
    # down, which proves a capstone is not resting and says nothing at all
    # about a plank standing off a wall — the near-touch there is RADIAL. The
    # inward ray is the one that matters for the hung shard and it is the one
    # a downward-only proof would have shipped a defect through.
    dirs = [(0.0, -1.0, 0.0), (1.0, 0.0, 0.0), (-1.0, 0.0, 0.0),
            (0.0, 0.0, 1.0), (0.0, 0.0, -1.0)]
    seen, closest, where = set(), 1e9, None
    for p in pts:
        key = (round(p[0], 3), round(p[1], 3), round(p[2], 3))
        if key in seen:
            continue
        seen.add(key)
        inward = np.array([AX - p[0], 0.0, AZ - p[2]], dtype=float)
        nrm = float(np.linalg.norm(inward))
        rays = [np.array(v, dtype=float) for v in dirs]
        if nrm > 1e-6:
            rays.append(inward / nrm)
        for d in rays:
            t = K.ray_hit(tris, np.array(p, dtype=float), d, 6.0)
            if t is not None and t < closest:
                closest, where = t, key
    if closest < GAP_FLOOR:
        raise RuntimeError(
            f"the crown is not hanging: {closest:.3f} of air under {where}, "
            f"floor {GAP_FLOOR}. Two solids that close read as one solid with "
            f"a crack in it.")

    overs = []
    for f in range(NF):
        a0, a1 = facet_span(f)
        d = facet_r(f, 1) - facet_r(f, 0)
        if d > OVERHANG_FLOOR:
            overs.append((f, round(d, 2)))
    if len(overs) < OVERHANG_FACETS:
        raise RuntimeError(
            f"the crown overhangs on only {len(overs)} of {NF} facets "
            f"{overs} — under {OVERHANG_FACETS}. A slab flush with the stump "
            f"reads as a lid resting on it.")

    # AND NOTHING STANDS UNDER THE CROWN. The hung shard's whole risk is that a
    # vertical member below a floating slab reads as the post holding it up, so
    # the air between its highest point and the crown's underside is a number
    # this recipe refuses to let shrink.
    hung_top = max(p[1] for p in K.tri_array([hung]).reshape(-1, 3))
    ceiling = min(float_lo(x, z) for x, z in
                  [polar(SHARD_R_OUT, a) for a in
                   [facet_span(SHARD_FACET)[0] + i * 0.05 for i in range(9)]])
    if ceiling - hung_top < POST_CLEARANCE:
        raise RuntimeError(
            f"the hung shard tops out {ceiling - hung_top:.2f} under the crown "
            f"(floor {POST_CLEARANCE}) — at that distance it stops being a "
            f"suspended plank and starts being the post holding the crown up, "
            f"which is the one reading this whole model exists to refuse.")

    eid, eye = max(TG.shipped_eyes(), key=lambda p: p[1][1])
    zf = max(z for _x, z in RING)
    band, step = [], 0.02
    y = break_y(0.0, zf)
    while y < float_lo(0.0, zf):
        d = np.array([0.0 - eye[0], y - eye[1], zf - eye[2]], dtype=float)
        d /= float(np.linalg.norm(d))
        if K.ray_hit(K.tri_array([stump] + list(floaters)),
                     np.array([0.0, y, zf], dtype=float) + d * 1e-3, d, 14.0) is None:
            band.append(y)
        y += step
    if not band:
        raise RuntimeError(
            "no sight line survives the slot: from every entry height the ray "
            "dies inside the model, so the gap is a recess and not a void. "
            "Widen it toward the back (GAP_KU) or drop the break faster.")
    print(f"[null] the crown hangs: closest approach {closest:.2f} (floor "
          f"{GAP_FLOOR}), rim proud on {len(overs)}/{NF} facets {overs[:5]}, "
          f"the hung shard {ceiling - hung_top:.2f} clear of the crown, "
          f"and {len(band) * step:.2f} of the front slot is open sky from "
          f"{eid} ({min(band):.2f}..{max(band):.2f})")


def assert_the_stump_alone_carries_the_dark(stump):
    """The whole six-eye occlusion grid, against the STUMP ONLY.

    `run_battery` runs occlusion over every mesh, and a 12-unit slab hanging
    over the bore would happily block rays the wall was supposed to block —
    which is how this experiment could ship a leak the day somebody decided
    the crown should be thinner. The float is scenery. The wall is the wall."""
    fails, counts = TG.occlusion_failures(K.tri_array([stump]), SPEC, 0.0)
    if fails:
        raise RuntimeError("WITHOUT THE FLOATING CROWN, " + fails[0])
    print(f"[null] the stump alone carries the dark: {counts['cowl']} cowl and "
          f"{counts['shaft']} shaft samples hidden at all six eyes with the "
          f"crown removed from the scene")


# --------------------------------------------------------------------------

def main():
    F.reset()

    front_top = front_panel_floor()
    print(f"[null] the break's front lip measures {front_top:.3f} "
          f"(needs 9.992; towerplan section 7 says 9.864)")

    mass = build_stump()
    crown = build_float()
    splinters = build_splinters()
    hung = build_hung()
    F.boolean(mass, box("doorCut", -DOOR_HW, DOOR_HW, DOOR_Y0, DOOR_Y1,
                        DOOR_Z0, DOOR_Z1), op="DIFFERENCE")
    shard = build_shard()
    meshes = [mass, crown, splinters, hung, shard]

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
    F.paint_corners(crown, "Col", paint_float)
    F.single_material(crown, F.vertex_color_material(
        "nullCrown", "Col", roughness=0.90, specular_level=0.24))
    F.paint_corners(splinters, "Col", paint_splinters)
    F.single_material(splinters, F.vertex_color_material(
        "nullSplinters", "Col", roughness=0.88, specular_level=0.30))
    F.paint_corners(hung, "Col", paint_hung)
    F.single_material(hung, F.vertex_color_material(
        "nullHung", "Col", roughness=0.89, specular_level=0.28))
    F.paint_corners(shard, "Col", paint_shard)
    F.single_material(shard, F.vertex_color_material(
        "nullShard", "Col", roughness=0.90, specular_level=0.15))

    # THE CONTRACT'S BATTERY, from the kit — approach, throat, occlusion, the
    # hollow, the lane, the front, the socket. The occluder handed to the
    # front gate is the STUMP ALONE: a crown that is not touching the ground
    # must never be able to cover for a wall that stopped being one.
    ran = K.run_battery(meshes, SPEC, tag="null", tilt_deg=0.0,
                        x_lim=XLIM, crown_max=CROWN_MAX,
                        clad={"towerSkinNullShard"},
                        occluder=[mass], front_top=front_top)
    # …and THIS tower's own claims, which no kit can own.
    assert_the_crown_is_a_cleave(meshes)
    assert_the_crown_hangs(mass, [crown, splinters, hung], hung)
    assert_the_stump_alone_carries_the_dark(mass)
    if len(ran) != 7:
        raise RuntimeError(f"the battery ran {len(ran)} gates, not 7: {ran}")

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
