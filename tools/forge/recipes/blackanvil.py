# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""blackanvil — the Emberforge house's tower, re-baked. A cooling forge chimney.

    tools/forge/bake.sh tools/forge/recipes/blackanvil.py \
        --tower --expect-colors --max-tris 15000

THE IDENTITY IS NOT NEW — this is ROADMAP T15 round 1, a RE-BAKE of a tower
that has shipped since 2026-08-11 as a code-built skin (js/toweranvil.js).
The brief it answers is that file's: dice fall down a foundry stack and come
out ringing; the glow is the feature; charcoal and soot and never pure black.
What moves is HOW it is built, and the reason is frame cost — the code skin is
75 separate meshes in one group and measures 88 draw calls against a baked
tower's 5-16, because a code skin is dozens of meshes with their own materials
and a baked GLB is a handful of merged primitives.

So the test this file has to pass is not "is it a good tower" — that was
settled — it is "is it the SAME tower, for a twelfth of the frame". Every
divergence below is therefore stated, and every one of them is forced.

--------------------------------------------------------------------------
THE THREE FORCED DIVERGENCES, and none of them is taste
--------------------------------------------------------------------------

1. THE DOOR HEAD RISES A UNIT, from 4.50 to 5.50, and this is the one a
   player will see. `js/toweranvil.js` reads `v.door.h` — which is the door's
   clear HEIGHT (4.5), not its head elevation — and hangs its cast lintel at
   that y. The declared opening runs sill 1.00 + clearH 4.50 = 5.50, so the
   shipped skin puts a lintel one full unit down inside its own doorway.

   Nothing is broken today: the flight envelope tops out at y ~4.04 (main.js
   `v.flight.top`; capY 3.2 carried down the shallowest legal pitch, plus a
   d20's radius), so no die has ever reached that iron. But check.py's exit
   gate fires 25 rays through 95% of the DECLARED aperture — |x| <= 2.375,
   y 1.113..5.388 — and a lintel at 4.50 is a wall across them. There is no
   legal bake that keeps the classic's door head.

   Everything above the door moved up with it: the firebox, the block's top,
   the shoulder step. The block:flue proportion goes 6.92:5.50 to 7.35:5.07,
   which is the one thing in this file that is a LOOK question rather than
   an arithmetic one.

2. THE HOOD NEEDED A GATE THAT DID NOT EXIST. The classic's hood oversails to
   z0+0.85 to shadow the doorway, which the app's fit audit grants as a GATE
   HOOD — and check.py had no such class, so the first bake of this model was
   refused for carrying a cover the app would have accepted. Fixed separately
   (towergates.gate_hood_band, docs/TOWER.md); the band is portal-derived, and
   this model's hood sits inside it with room to spare. Recorded here because
   the other two rounds of T15 inherit the same need.

3. THE PAINT IS VERTEX COLOUR, SO THE CANVASES ARE GONE. The code skin runs
   six seeded canvas bakes (bakeMetal/bakeStone/bakeEmber), a Sobel
   height->normal pass, roughness off the same height field, and an emissiveMap
   for the coals. A forge recipe bakes COLOR_0 and one material per mesh. So:
     · the plate pitting, the coursing and the RIVETS were normal-map lighting
       and are now either real geometry or nothing. Rivets are nothing — at
       0.07u minimum feature they were never geometry and cannot become it.
     · the coal bed's ramp from dead char through dull red to the hot crack
       was an emissive MAP. Emissive is a material constant here and is NOT
       multiplied by COLOR_0, so the gradient is built out of GEOMETRY the way
       nullstone builds its seams: two tiers, on two meshes, and the bed's own
       relief decides how much emitting surface each eye sees.
     · the AO bake and gravityStain ran over the finished skin at load time.
       They cannot run on a baked model (`bakeVertexAO` never does), so their
       whole job — cavity darkening, soot down from the crown rim,
       efflorescence mid-shaft, moss at the damp foot — is baked into the
       paint functions below instead, in world space, from the same rules.

WHAT THE BAKE BUYS BACK, and it is the firebox. The code skin's §1.5 note 2
refuses a recessed grate in one line: "On the facade a recess is 0.07, not
0.3" — because a code skin is a SHELL and its whole facade lives in the 0.09
of depth between the bore's front tangent (z0+0.125) and the socket face
(z0+0.25). A carved solid has that limit only where the bore actually is, and
the bore is only required clear from despawnY UP (towerplan: the column runs
y 11.25 down to 7.00). Below that the front may be as thick as the socket
allows. The firebox therefore sits entirely under y 6.95 and is genuinely
recessed 0.36 into the block, which is what the original brief asked for and
the code path had to refuse.

DECLARED PORTALS — the classic core, field for field:

    portalIn   x 0.00   rimY 8.75   z -2.00   clearR 2.125
    portalOut  x 0.00   sillY 1.00  w 5.00    clearH 4.50

These are DEFAULT_PORTALS. The row declares `physical: {}` today and means
exactly this, so the film does not move, `towerFilmDigest` does not move, and
`tower-contract-freeze` must stay byte-identical across the whole of T15 —
which is also the check that proves each round was cosmetic.

THREE PARTS, readable at the resting eye (the /new-tower silhouette rule):
  BASE   two battered plinth courses under a soot-blackened anvil block, with
         the doorway bitten through it and the casting channel run out front.
  BODY   the block's face: the barred firebox over the door's hood, the iron
         strapping up both jambs, and the bronze bead round the fire.
  CROWN  a bronze fillet and an oversailing iron cap, three courses of dark
         fire-brick with one vent slot burning in them, and a crucible lip.
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import bmesh  # noqa: E402
import forge as F  # noqa: E402
import towergates as TG  # noqa: E402
import towerkit as K  # noqa: E402

S = 1.25
AX, AZ = 0.0, -2.00                # the bore axis, app frame

PORTAL_IN = {"x": AX, "rimY": 8.75, "z": AZ, "clearR": 2.125}
PORTAL_OUT = {"x": 0.0, "sillY": 1.00, "w": 5.00, "clearH": 4.50}
SPEC = {"in": PORTAL_IN, "out": PORTAL_OUT}
DESPAWN_Y = PORTAL_IN["rimY"] - 1.4 * S            # 7.00

BUDGET = 15000
SEED = 0xA17F10                    # the code skin's own mulberry32 seed

# --- the socket, and the margins taken out of it ---------------------------
# |x| <= 3.25, y in [0, 12.5], z in [-5.25, +0.25].
# THE CLASSIC'S 0.15-DEGREE LEAN IS NOT BAKED IN. A code skin leans by
# rotating its whole group; a GLB is seated by the loader with exactly one
# offset (the z0 seat) and no rotation, so a lean would have to be baked into
# every vertex — which puts the boolean cutters off-axis for 0.032 of x at the
# crown, under a tenth of the 0.35 the eye needs to see a feature at all.
# Recorded rather than smuggled: this tower now stands plumb.
XLIM = 3.22                        # 0.03 kept back from the socket wall
# TWO FRONT PLANES, and the second one is not decoration. Nothing of a SKIN
# mesh may stand past the socket's own front at z 0.25 — the app grants a
# 0.06-proud FLUSH DRESS class but only to `towerSkinDress`, and a baked
# tower's trim is skin. So proud trim is not "past the wall", it is "past the
# recessed FIELD": the mass's face sits at 0.19 and the ironwork and the
# bronze stand on 0.24, which is js/toweranvil.js's own zFF/zFO arrangement
# (0.20 and 0.24) arrived at from the same refusal.
Z_FIELD = 0.19                     # the mass's face — the recessed field
Z_TRIM = 0.24                      # ...and the outermost plane trim stands on
ZBACK = -5.15
CROWN_MAX = 12.44

# --- elevations ------------------------------------------------------------
# Every one is either an engine number or a proportion, and the proportions
# are the code skin's own, shifted by the door head's forced +1.00.
Y_FOOT = -0.06                     # sunk into the felt; the audit's floor is -0.15
Y_PL1, Y_PL2 = 0.52, 0.92          # two battered plinth courses
# THE DOOR HEAD IS PINNED BETWEEN TWO GATES, and the gap is 0.097 wide.
# See `door_head_window()` — this is not a number anyone should retype.
Y_DOOR_HEAD = 5.43
Y_LINTEL = 5.79                    # the cast beam over it
Y_HOOD = 5.98                      # ...and the top of the cover that oversails
Y_GRATE0, Y_GRATE1 = 6.15, 6.85    # the firebox, ENTIRELY under the bore floor
Y_BLK = 7.35                       # the block's top
Y_FIL = 7.49                       # the bronze fillet under the cap
Y_CAP = 7.87                       # the oversailing iron cap
Y_CHM = (9.00, 10.05, 11.10)       # three courses of fire-brick
Y_CR = 11.75                       # the crucible lip's spring line
Y_CROWN = 12.42                    # ...and its rim

# THE BORE FLOOR. The contract wants the column clear from despawnY (7.00) up;
# this is the y under which the front may be thick, and it is set 0.05 below
# the requirement rather than at it so the boolean's own seam is never the
# thing being measured.
Y_BORE0 = 6.95
BORE_R = 2.16                      # clearR 2.125 + 0.035. At x = 0 that puts
#                                    the interior's front tangent at z -2.00 +
#                                    2.16 = 0.16, leaving 0.08 of facade — the
#                                    same 0.09 budget the code skin lives in,
#                                    and it applies ONLY above Y_BORE0.

# --- half-widths and back faces, per course --------------------------------
X_PL1, X_PL2, X_BLK = 3.18, 3.10, 3.04
X_FIL, X_CAP = 3.10, 3.16
X_CHM = (2.62, 2.57, 2.52)
X_CR_A, X_CR_B = 2.74, 3.02
Z_PL1, Z_PL2, Z_BLK = -5.05, -4.95, -4.72
Z_FIL, Z_CAP = -4.86, -4.86
Z_CHM = -4.42
Z_CR_A, Z_CR_B = -4.52, -4.72

# --- the doorway -----------------------------------------------------------
# Wider and taller than the declared aperture, because a declaration is a
# MINIMUM. The pocket reaches back past the exit spawn plane (z -0.875) so a
# die emerging has dark behind it rather than a wall 0.3 in front of its nose.
DOOR_HW = 2.55
DOOR_Y0, DOOR_Y1 = 0.70, Y_DOOR_HEAD
DOOR_Z0 = -1.85

# --- the firebox -----------------------------------------------------------
# WIDER THAN THE CODE SKIN'S, because it is not as tall as the code skin's.
# The door head's forced rise (see `door_head_window`) leaves the firebox 0.70
# of height where the classic had 1.50, and there is no lever that gives it
# back: it is pinned under the bore floor above and the hood below. So the
# fire spends the budget it does have sideways — 4.10 across against 3.80 —
# and stays the dominant feature of the block's face rather than becoming a
# letterbox in the middle of it.
GRATE_HW = 2.05
GRATE_BED_Z = -0.12                # the bed's face: 0.36 back from the facade
GRATE_BARS = 7

# --- the shaft vent --------------------------------------------------------
# Off-centre, and nothing on the right answers it — Heartwood's single iron
# bracket and Bastion's off-centre arrow loop, in this family's language. It
# sits INSIDE the cowl band, so its bed is opaque and the mass behind it is
# 0.29 of stone at the narrowest (the bore's tangent at |x| 1.18 is z -0.191).
VENT_X0, VENT_X1 = -1.44, -1.18
VENT_Y0, VENT_Y1 = 8.55, 10.20
VENT_BED_Z = 0.10

# --------------------------------------------------------------------------
# PALETTE — the code skin's, converted sRGB -> LINEAR
# --------------------------------------------------------------------------
# js/toweranvil.js states these as three-stop sRGB byte ramps and its comment
# is the design record: "LOOKED AT, THEN DARKENED — TWICE"; the first cut ran
# the brick at a mid brown and "the tower came back a garden-wall chimney with
# a fire in it". A foundry stack that has been fired is nearly black and its
# value range lives in the bottom third. What is carried over is the MID stop
# of each ramp, with the ramp's own spread re-created per vertex below.
#
# Vertex colours are LINEAR COLOR_0 (house rule), and the code skin's numbers
# are sRGB bytes, so every one of them is converted rather than retyped — a
# palette copied by eye across that boundary comes out roughly 2.5x too bright
# and is exactly how a black tower stops being black.


# THE WHOLE PALETTE IS SCALED, and the number is measured rather than felt.
# Round 1's sheet and the code skin's were shot in the same rig and decoded
# (the zero-dep PNG reader in tools/steps/glade-frame.mjs): over the six views
# the baked tower ran 1.08-1.22x the code skin's mean luminance, worst at the
# doorway, and its mean pixel was 31,24,22 against 25,21,20 — brighter AND
# warmer. The eye read that as "brown"; the pixels say 18% and a hue lean.
#
# WHY IT WAS BRIGHT AT ALL, since the ramps below are the code skin's own
# numbers: that skin runs `bakeVertexAO` over every vertex of 75 meshes after
# it is built, and a boxy tower with courses is nearly all corners. A baked
# model gets no such pass — `bakeVertexAO` never runs on one — and the three
# analytic cavity terms here cover the doorway, the firebox and two overhangs,
# which is most of the deep shade and none of the shallow kind.
#
# So the flat scale stands in for the AO that is not there. It is applied at
# the ramp rather than per-paint-function so there is ONE number to move.
VALUE = 0.84
# ...and the hue lean comes off the same way: the ramps are warm because fired
# brick is warm, but the code skin's rendered mean sits at r/b 1.25 and this
# one at 1.41. Half the difference is the AO again (shade is neutral), so the
# blue channel is lifted back toward it rather than the red pulled down, which
# would have cost the value a second time.
BLUE_BACK = 0.10


def srgb(*bytes_):
    """sRGB bytes -> linear, the same transfer three.js applies to a texture."""
    out = []
    for b in bytes_:
        c = b / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    r, g, bl = (v * VALUE for v in out)
    return (r, g, bl + (r - bl) * BLUE_BACK)


SOOT = srgb(0x3E, 0x39, 0x33)          # the stone: warm dark
SOOT_LO = srgb(0x28, 0x24, 0x21)       # ...and its ramp, for the mottle
SOOT_HI = srgb(0x59, 0x52, 0x49)
IRON = srgb(0x3B, 0x3A, 0x39)          # neutral-cool, oxidised, not a mirror
IRON_LO = srgb(0x24, 0x23, 0x23)
IRON_HI = srgb(0x59, 0x56, 0x53)
BRICK = srgb(0x3E, 0x30, 0x28)         # browner, a step lighter than the stone
BRICK_LO = srgb(0x2A, 0x20, 0x1B)
BRICK_HI = srgb(0x5C, 0x48, 0x3B)
BRICK_JOINT = srgb(0x4A, 0x44, 0x3C)   # pale ash-lime mortar — the "kiln" cue
SOOT_JOINT = srgb(0x22, 0x1E, 0x1A)    # ...and the stone's, which runs darker
BRONZE = srgb(0x49, 0x3F, 0x2E)        # oxidised: a warm grey with green in it
BRONZE_HI = srgb(0x64, 0x58, 0x42)
VERDIGRIS = srgb(0x4C, 0x67, 0x59)
# THE CASTING CHANNEL, and the ONE light thing here: a black-iron die has to
# read against what it comes to rest on. It is ALSO the thing round 1 got most
# wrong — on that sheet the sand was the brightest object in every view, which
# is the exact failure js/toweranvil.js records against its own first cut
# ("the delivery run was a white slab that owned the frame … a tower's tray
# should not be the first thing seen"). Taken down by a third; a die still
# reads against it, and nothing else on the model has to fight it.
SAND_K = 0.66
SAND = tuple(c * SAND_K for c in srgb(0x62, 0x5D, 0x54))
SAND_LO = tuple(c * SAND_K for c in srgb(0x45, 0x41, 0x3A))
SAND_HI = tuple(c * SAND_K for c in srgb(0x80, 0x7A, 0x6F))
STEEL = srgb(0x9A, 0x95, 0x8C)         # the one bright material: worn tools
DARK = srgb(0x0A, 0x08, 0x06)          # the interior, where light never arrives

# THE GLOW, and it is the only glow the house allows. Two tiers, because the
# code skin has two (grate emissiveIntensity 0.90, vent 0.50) — and here they
# are two MESHES for the reason nullstone states: emissive is a material
# constant, so one material is one value, and a glow that varies is either a
# second mesh or a gradient made of geometry.
#
# The ceiling is js/post.js's 0.9 linear bloom threshold and there is no
# post-hoc dial. These sit far under it: coals at rest, banked, not a furnace
# in full cry. `lit()` normalises the hue to luminance 1 before scaling, so
# the two tiers are the same COLOUR at different brightnesses rather than two
# accidentally different oranges.
COAL = srgb(0xC4, 0x52, 0x18)          # the hot crack between banked coals
CHAR = srgb(0x1A, 0x12, 0x0E)          # ...and the dead coal it runs between


def lum_of(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def lit(hue, luminance, white=0.0):
    """A LINEAR emissive at a chosen luminance, keeping the hue (nullstone's)."""
    h = tuple(c / lum_of(hue) for c in hue)
    if white:
        h = tuple(p + (1.0 - p) * white for p in h)
    return tuple(c * (luminance / lum_of(h)) for c in h)


# COALS AT REST, and round 1 was not. At 0.155 the firebox rendered as a bright
# orange letterbox behind hard bars — a heater, not a forge — where the code
# skin's reads as a dull red wash you notice rather than look at. The tiers
# come down by 40%, and the bed's own relief (see build_bed) does the rest:
# what makes banked coals read is that most of the bed is DEAD and the light
# comes out of the cracks between lumps.
GRATE_EMIT = lit(COAL, 0.094, white=0.05)
VENT_EMIT = lit(COAL, 0.044, white=0.03)


# --------------------------------------------------------------------------
# deterministic noise (integer hash, never `random`: the value must depend on
# WHICH sample it is, not on how many were drawn before it)
# --------------------------------------------------------------------------

def h01(a, b):
    h = ((int(a) + SEED) * 73856093) ^ (int(b) * 19349663)
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65536.0


def vnoise(x, y, z, scale, salt=0):
    """Smooth-ish value noise off the integer hash, sampled in WORLD space.

    World space rather than UV space on purpose: every wall texture in the
    code skin tiles at world scale and the weathering that matters (soot down
    from the rim, moss at the foot) is gravity-correct, which a tile cannot
    know (docs/TOWER.md, "Gravity governs all weathering")."""
    fx, fy, fz = x / scale, y / scale, z / scale
    ix, iy, iz = math.floor(fx), math.floor(fy), math.floor(fz)
    tx, ty, tz = fx - ix, fy - iy, fz - iz
    tx = tx * tx * (3 - 2 * tx)
    ty = ty * ty * (3 - 2 * ty)
    tz = tz * tz * (3 - 2 * tz)
    out = 0.0
    for dz in (0, 1):
        for dy in (0, 1):
            for dx in (0, 1):
                w = ((tx if dx else 1 - tx) * (ty if dy else 1 - ty)
                     * (tz if dz else 1 - tz))
                out += w * h01((ix + dx) * 7919 + (iz + dz) * 104729 + salt,
                               (iy + dy) * 6151 + salt)
    return out


def fbm(x, y, z, scale, octaves=3, salt=0):
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        total += amp * vnoise(x, y, z, scale / (2 ** o), salt + o * 131)
        norm += amp
        amp *= 0.5
    return total / norm


def smoothstep(x, lo, hi):
    t = min(1.0, max(0.0, (x - lo) / (hi - lo)))
    return t * t * (3.0 - 2.0 * t)


def clamp01(x):
    return 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)


def lerp3(a, b, t):
    return tuple(p + (q - p) * t for p, q in zip(a, b))


def scale3(c, k):
    return tuple(v * k for v in c)


# --------------------------------------------------------------------------
# geometry helpers
# --------------------------------------------------------------------------

def box(name, x0, x1, y0, y1, z0, z1):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4),
         (2, 3, 7, 6), (1, 2, 6, 5), (0, 3, 7, 4)]
    ob = F.obj_from_pydata(name, [tuple(F.spec_to_blender(*p)) for p in v], f)
    F.recalc_normals(ob)
    return ob


def cylinder(name, cx, cz, r, y0, y1, seg=48):
    """A vertical cylinder in app frame — the bore, and its cutters."""
    ring = [(cx + r * math.sin(2 * math.pi * i / seg),
             cz + r * math.cos(2 * math.pi * i / seg)) for i in range(seg)]
    verts, faces = [], []
    for y in (y0, y1):
        for x, z in ring:
            verts.append(tuple(F.spec_to_blender(x, y, z)))
    for i in range(seg):
        j = (i + 1) % seg
        faces.append((i, j, seg + j, seg + i))
    faces.append(tuple(range(seg - 1, -1, -1)))
    faces.append(tuple(range(seg, 2 * seg)))
    ob = F.obj_from_pydata(name, verts, faces)
    F.recalc_normals(ob)
    return ob


def merge(name, objs):
    """One object out of many — which is the whole point of the re-bake: a
    draw call is per MESH, so the ironwork is one mesh however many pieces it
    is made of."""
    verts, faces = [], []
    for ob in objs:
        base = len(verts)
        me = ob.data
        for v in me.vertices:
            verts.append(tuple(v.co))
        for p in me.polygons:
            faces.append(tuple(base + i for i in p.vertices))
    F.delete(*objs)
    ob = F.obj_from_pydata(name, verts, faces)
    return ob


def refine(ob, target, keep=None):
    """Subdivide until no edge is longer than `target`.

    THE PAINT IS THE REASON, not the silhouette. A boolean of boxes carries
    vertices only where the boxes met, so a facade 6 units wide has four
    corners and any gradient across it is a linear ramp between them — which
    is how a soot fade off the crown rim comes out as a flat wash. The code
    skin had a 1024px canvas per material and did not have this problem; a
    vertex-coloured model has exactly the resolution it is tessellated to.

    At the resting eye a world unit is ~42 px, so 0.35 is ~15 px — fine enough
    that the mottle reads as material and coarse enough to stay inside the
    triangle budget.

    `keep` is where the budget actually goes. A flat pass over the mass spent
    12374 triangles to blow a 15000 budget, and most of them were on surfaces
    no eye reaches: the back wall against the room's own wall, and the shaft
    interior, which is painted one flat DARK and cannot carry a gradient
    whatever it is tessellated to. Refining the seen surfaces twice as finely
    as the unseen ones is the same picture for a third of the cost.
    """
    for _ in range(6):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        long_edges = [e for e in bm.edges
                      if (e.verts[0].co - e.verts[1].co).length > target
                      and (keep is None or keep((e.verts[0].co + e.verts[1].co) / 2.0))]
        if not long_edges:
            bm.free()
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1,
                                  use_grid_fill=True)
        bm.to_mesh(ob.data)
        bm.free()
    ob.data.update()
    return ob


# --------------------------------------------------------------------------
# THE MASS — plinth, block, shoulder, stack, crown, as ONE solid
# --------------------------------------------------------------------------
# Built as a union of courses and then CARVED: the bore, the doorway pocket,
# the firebox and the vent are all subtractions. That ordering is the
# /new-tower rule ("MASS, THEN DETAIL … one solid with grooves cut INTO it,
# replacing parts arranged around a void") and it is also what makes the
# interior a real interior — the bore's wall IS the mass, so this model needs
# no separate lining mesh the way the code skin does.

STRUCTURE = [
    # (y0,     y1,     half-width, back z,  course height or None)
    (Y_FOOT, Y_PL1, X_PL1, Z_PL1, None),
    (Y_PL1, Y_PL2, X_PL2, Z_PL2, None),
    (Y_PL2, Y_BLK, X_BLK, Z_BLK, 0.54),        # the anvil block, laid in stone
    (Y_BLK, Y_FIL, X_FIL, Z_FIL, None),
    (Y_FIL, Y_CAP, X_CAP, Z_CAP, None),
    (Y_CAP, Y_CHM[0], X_CHM[0], Z_CHM, 0.38),  # the stack, laid in fire-brick
    (Y_CHM[0], Y_CHM[1], X_CHM[1], Z_CHM + 0.04, 0.38),
    (Y_CHM[1], Y_CHM[2], X_CHM[2], Z_CHM + 0.08, 0.38),
    (Y_CHM[2], Y_CR, X_CR_A, Z_CR_A, None),
    (Y_CR, Y_CROWN, X_CR_B, Z_CR_B, None),
]

# HOW DEEP A COURSE IS SET BACK. Round 1's walls came out flat, and the reason
# is not the paint: vertex colour cannot carry the code skin's `bakeStone`
# canvas at ANY affordable tessellation. A mortar line is ~0.076 tall and the
# triangle budget buys vertices 0.38 apart, so a painted course line falls
# between two vertex rows and simply does not exist. Halving the spacing until
# it does would put the mass past 25000 triangles against a 15000 cap.
#
# So the courses are BUILT: alternate courses step back by this much, which
# costs one box each and gives every course a real edge with a real value
# break across it. It also does the thing the paint could not — it puts a
# vertex row at every course line, so `joint_darken` now lands exactly on one
# instead of being averaged away between two.
COURSE_SET = 0.035


def course_rows():
    """The STRUCTURE table expanded into the boxes that actually get unioned:
    a plain course where the table says None, and an alternating in/out stack
    of them where it names a course height. The set-back is returned rather
    than folded in, because it comes off the half-width AND the front face and
    never off the back — which stands against the room's wall, where a step is
    triangles nobody can see."""
    rows = []
    for y0, y1, hw, zb, ch in STRUCTURE:
        if ch is None:
            rows.append((y0, y1, hw, zb, 0.0))
            continue
        n = max(1, int(round((y1 - y0) / ch)))
        for i in range(n):
            rows.append((y0 + (y1 - y0) * i / n, y0 + (y1 - y0) * (i + 1) / n,
                         hw, zb, COURSE_SET if i % 2 else 0.0))
    return rows


COURSE_ROWS = course_rows()
# The course LINES, for the paint: every y where one course meets the next.
COURSE_LINES = sorted({r[0] for r in COURSE_ROWS} | {r[1] for r in COURSE_ROWS})


def build_mass():
    # THE FRONT ONLY STEPS WHERE THE FRONT IS THICK. Above the bore floor the
    # facade is the 0.03 between the bore's front tangent (0.16 at x 0) and
    # the field at 0.19 — so a 0.035 set-back there does not recess a course,
    # it DELETES the wall, and the first bake of this pass proved it: two cowl
    # samples leaked at wide.full through a course that had stopped existing.
    # Below the bore floor the block is 0.59 thick and can afford it.
    #
    # The flue keeps its coursing in silhouette (the sides still step) and on
    # the face it is carried by `joint_darken` — which works up there now for
    # the reason this whole change exists: every course boundary is a real box
    # boundary, so the paint has a vertex row to land on.
    parts = [box(f"course{i}", -(hw - s), hw - s, y0, y1, zb,
                 Z_FIELD - (s if y1 <= Y_BORE0 + 1e-6 else 0.0))
             for i, (y0, y1, hw, zb, s) in enumerate(COURSE_ROWS)]
    mass = parts[0]
    mass.name = "towerSkinAnvilMass"
    F.boolean_each(mass, parts[1:], op="UNION")

    # THE BORE, from the floor up and out through the crown. Full radius from
    # Y_BORE0 so the approach column is clear from despawnY with margin.
    F.boolean(mass, cylinder("bore", AX, AZ, BORE_R, Y_BORE0, CROWN_MAX + 0.5),
              op="DIFFERENCE")
    # ...and the interior below it, which may be pulled BACK at the front —
    # that is the depth the firebox spends (see the header, "what the bake
    # buys back"). A box rather than a cylinder: nothing ever sees it, and a
    # cylinder here would only cost triangles.
    F.boolean(mass, box("hollow", -BORE_R, BORE_R, 1.40, Y_BORE0 + 0.01,
                        AZ - BORE_R, -0.35), op="DIFFERENCE")
    # THE DOORWAY, cut through the front and back to behind the exit spawn.
    F.boolean(mass, box("doorCut", -DOOR_HW, DOOR_HW, DOOR_Y0, DOOR_Y1,
                        DOOR_Z0, Z_TRIM + 0.1), op="DIFFERENCE")
    # THE FIREBOX — 0.36 of real recess, the thing the code skin refused.
    F.boolean(mass, box("grateCut", -GRATE_HW, GRATE_HW, Y_GRATE0, Y_GRATE1,
                        GRATE_BED_Z, Z_TRIM + 0.1), op="DIFFERENCE")
    # THE VENT — a recess, never a hole. Shallow, and the mass behind it is
    # 0.29 of stone at the narrowest.
    F.boolean(mass, box("ventCut", VENT_X0, VENT_X1, VENT_Y0, VENT_Y1,
                        VENT_BED_Z, Z_TRIM + 0.1), op="DIFFERENCE")
    return mass


# --------------------------------------------------------------------------
# THE IRONWORK — one mesh, however many pieces
# --------------------------------------------------------------------------

def build_iron():
    parts = []
    # The cast beam over the door, and the jamb strapping up both sides. The
    # straps stand OUTSIDE the engine's opening (|x| >= 2.5): the frame is
    # decorated, the aperture is never touched.
    for s in (-1, 1):
        for y in (1.28, 2.72, 4.16):
            parts.append(box(f"strap{s}{y}", s * 2.58, s * (X_BLK - 0.03),
                             y, y + 0.26, Z_FIELD - 0.02, Z_TRIM))
    # The firebox's bars: six, standing 0.10 in front of the bed, with real
    # depth to throw a real shadow now that there is somewhere to throw it.
    for i in range(GRATE_BARS):
        cx = -GRATE_HW + (GRATE_HW * 2) * ((i + 0.5) / GRATE_BARS)
        parts.append(box(f"bar{i}", cx - 0.055, cx + 0.055,
                         Y_GRATE0 - 0.05, Y_GRATE1 + 0.05,
                         GRATE_BED_Z + 0.20, GRATE_BED_Z + 0.31))
    # The vent's surround: two jambs and a head and a sill, proud of the
    # field, so the slot is a shadowed slot and not a decal.
    parts.append(box("ventL", VENT_X0 - 0.12, VENT_X0, VENT_Y0 - 0.14,
                     VENT_Y1 + 0.14, Z_FIELD - 0.02, Z_TRIM))
    parts.append(box("ventR", VENT_X1, VENT_X1 + 0.12, VENT_Y0 - 0.14,
                     VENT_Y1 + 0.14, Z_FIELD - 0.02, Z_TRIM))
    # ...and the head and sill stop 0.002 short of the jambs' outer faces, for
    # the same coincident-vertex reason ring_boxes states.
    parts.append(box("ventH", VENT_X0 - 0.118, VENT_X1 + 0.118, VENT_Y1,
                     VENT_Y1 + 0.14, Z_FIELD - 0.018, Z_TRIM))
    parts.append(box("ventS", VENT_X0 - 0.118, VENT_X1 + 0.118, VENT_Y0 - 0.14,
                     VENT_Y0, Z_FIELD - 0.018, Z_TRIM))
    # The oversailing cap over the shoulder step: a ring, proud on all four
    # sides, which is what makes the chimney read as rising OUT of a furnace
    # rather than being the same box continued.
    # The oversail is 0.04 and not a round 0.06: at 0.06 the cap measured
    # |x| 3.220 against the socket's 3.25, and X IS THE ONE AXIS WITH NO
    # SLACK (the mat's own physics wall is 3.35). The step still reads —
    # it is 0.58 proud of the chimney above it, which is what the eye is
    # actually measuring.
    parts += ring_boxes("cap", X_CAP + 0.04, Z_CAP - 0.05, Y_FIL, Y_CAP,
                        Z_TRIM)
    # ...and the crucible lip at the crown.
    parts += ring_boxes("lip", X_CR_B + 0.05, Z_CR_B - 0.04, Y_CR, Y_CROWN,
                        Z_TRIM)
    return merge("towerSkinAnvilIron", parts)


def ring_boxes(name, xo, zb, y0, y1, zf):
    """A back slab, two cheeks and a face — the way every course above the
    plinth is made in js/toweranvil.js, kept because it is how masonry
    courses actually wrap and because it leaves the interior alone.

    THE FOUR PIECES OVERLAP ON DELIBERATELY DIFFERENT PLANES. They used to
    meet corner-to-corner, and `canonicalize` warned "coincident vertices,
    order may not be unique" on every ring in the model — which is not a
    cosmetic complaint: two vertices at one position make the canonical sort
    ambiguous, and an ambiguous sort is a geometry digest that can move
    between two bakes of identical source. The offsets below are small enough
    to be invisible (0.003-0.004, an eighth of a pixel at the resting eye) and
    large enough that no two corners land on the same point."""
    t = 0.16
    # THE FACE SLAB IS THIN, and the approach gate is why. At the ring's own
    # 0.16 the bronze strap on the stack reached back to z 0.08 across the
    # whole width — and the entry disc's front edge at x 0.41 is z 0.085, so
    # two of the 25 drop probes came down on trim. A face band only has to
    # span the field it stands proud of; depth on this axis buys nothing and
    # costs the mouth.
    ft = 0.05
    return [
        box(f"{name}B", -xo, xo, y0, y1, zb, zb + t),
        box(f"{name}L", -xo, -xo + t, y0, y1, zb + 0.004, zf),
        box(f"{name}R", xo - t, xo, y0, y1, zb + 0.004, zf),
        box(f"{name}F", -(xo - 0.003), xo - 0.003, y0, y1, zf - ft, zf),
    ]


# --------------------------------------------------------------------------
# THE BRONZE — the family's trim accent, and there is deliberately little
# --------------------------------------------------------------------------
# js/toweranvil.js's ledger: the first cut put the accent on the jambs too and
# "six more bright bands turned the trim into the theme". Bronze is the
# stack's straps, the shoulder fillet and the bead round the fire, and
# nothing else. Iron carries the jambs.

def build_bronze():
    parts = ring_boxes("fillet", X_FIL + 0.03, Z_FIL - 0.03, Y_BLK, Y_FIL,
                       Z_TRIM)
    # The bead round the firebox: jambs, a head and a sill, proud of the field.
    b = 0.17
    parts.append(box("beadL", -GRATE_HW - b, -GRATE_HW, Y_GRATE0 - b,
                     Y_GRATE1 + b, Z_FIELD - 0.02, Z_TRIM))
    parts.append(box("beadR", GRATE_HW, GRATE_HW + b, Y_GRATE0 - b,
                     Y_GRATE1 + b, Z_FIELD - 0.02, Z_TRIM))
    parts.append(box("beadH", -GRATE_HW - b + 0.002, GRATE_HW + b - 0.002,
                     Y_GRATE1, Y_GRATE1 + b, Z_FIELD - 0.018, Z_TRIM))
    parts.append(box("beadS", -GRATE_HW - b + 0.002, GRATE_HW + b - 0.002,
                     Y_GRATE0 - b, Y_GRATE0, Z_FIELD - 0.018, Z_TRIM))
    # Two riveted straps on the stack, LOW and HIGH with a clear field between
    # them. The code skin's note: three evenly spaced bands put the middle one
    # straight across the vent, and three bright bands on a short stack was
    # too much trim besides.
    for tag, y0, xo, zb in (("lo", 8.28, X_CHM[0], Z_CHM),
                            ("hi", 10.42, X_CHM[2], Z_CHM + 0.08)):
        parts += ring_boxes(f"strap{tag}", xo + 0.04, zb - 0.03, y0, y0 + 0.22,
                            Z_TRIM)
    return merge("towerSkinAnvilBronze", parts)


# --------------------------------------------------------------------------
# THE HOOD — the cast lintel and the cover that oversails it
# --------------------------------------------------------------------------
# ONE OBJECT, and it is named in the battery's `hood` set: it claims the GATE
# HOOD envelope class, which is an authoring statement ("this is my door's
# cover"), not a thing to be inferred from a box that happens to sit in the
# band. The engine's own HOOD volume runs to z0+1.25 and asks to be shadowed;
# a cover flush with the wall shadows nothing.

def build_hood():
    parts = [
        box("lintel", -(X_BLK + 0.02), X_BLK + 0.02, Y_DOOR_HEAD, Y_LINTEL,
            -0.30, Z_TRIM),
    ]
    # The cover itself, pitched forward and down — a hood, not a shelf. Built
    # as a stepped wedge rather than a rotated slab so the model stays
    # axis-aligned all the way to canonicalize (a rotated box is where the
    # sliver faces come from).
    steps = 6
    z0, z1 = 0.02, 0.85
    for i in range(steps):
        za = z0 + (z1 - z0) * i / steps
        zb = z0 + (z1 - z0) * (i + 1) / steps
        drop = 0.20 * (i / steps)
        parts.append(box(f"hood{i}", -(DOOR_HW + 0.42), DOOR_HW + 0.42,
                         Y_LINTEL - 0.16 - drop, Y_HOOD - drop, za, zb))
    # Two corbels under its ends, which is what a hood that heavy would need.
    for s in (-1, 1):
        parts.append(box(f"corbel{s}", s * (DOOR_HW + 0.10),
                         s * (DOOR_HW + 0.46), Y_DOOR_HEAD - 0.28,
                         Y_LINTEL + 0.06, 0.05, 0.52))
    return merge("towerSkinAnvilHood", parts)


# --------------------------------------------------------------------------
# THE TWO FIRES — geometry, because emissive cannot be a gradient
# --------------------------------------------------------------------------
# The code skin painted an emissiveMap: char, dull red, and the hot crack, on
# one canvas. Here the ramp has to come from SHAPE — how much emitting surface
# an eye can see — so the bed is a field of banked coal lumps with the hot
# faces between them, and the char is the ALBEDO of the same mesh (COLOR_0 is
# not multiplied into emissive, so the two are independent and the dark coal
# still reads as coal in the ember's own light).

def build_bed(name, x0, x1, y0, y1, z_face, depth, nx, ny, lump):
    """A raked coal bed: a back plate with a field of lumps standing off it.

    THE LUMPS ARE THE PICTURE, and round 1 had them too small and too even.
    That bake read as a bright orange panel with bars in front of it — a
    heater — because the bed was nearly flat and nearly all of it faced the
    player at the same angle, so every eye saw the whole emitting area at once.
    Banked coals are the opposite: most of what you see is a dead lump, and
    the light arrives from the CRACKS between them, which is a function of
    where you are standing.

    Emissive is a material constant and is not multiplied by COLOR_0, so this
    is the only gradient available (nullstone: "gradients made of geometry").
    Bigger lumps, fewer of them, standing off the plate by most of the recess,
    and jittered in all three axes so no two present the same face."""
    parts = [box(f"{name}Back", x0, x1, y0, y1, z_face - depth,
                 z_face - depth + 0.03)]
    return merge(name, parts)


def build_coals(name, x0, x1, y0, y1, z_face, depth, nx, ny, lump):
    """THE LUMPS, and they are a SEPARATE MESH because they do not glow.

    Round 2 had them in the emissive bed and the firebox rendered as a row of
    flat lit rectangles behind bars — a radiator. The reason is that one
    material is one emissive value, so every lump face emitted as hard as the
    bed did, and a coal that emits from its own front face is not a coal.

    Banked coals are DARK objects with light coming out from BETWEEN them.
    Same geometry, opposite job: these stand in front of the emissive plate,
    take the char albedo, and what a given eye sees of the fire is how much
    plate they fail to cover from where it is standing — which is the only
    kind of gradient a constant emissive can have (nullstone's rule, one
    level further down than it had to take it)."""
    parts = []
    for i in range(nx):
        for j in range(ny):
            cx = x0 + (x1 - x0) * (i + 0.5) / nx
            cy = y0 + (y1 - y0) * (j + 0.5) / ny
            jx = (h01(i * 41 + j, 3) - 0.5) * lump * 0.7
            jy = (h01(i * 43 + j, 5) - 0.5) * lump * 0.7
            r = lump * (0.70 + 0.55 * h01(i * 31 + j, 7))
            rh = lump * (0.55 + 0.60 * h01(i * 37 + j, 13))
            d = depth * (0.45 + 0.50 * h01(i * 17 + j, 11))
            parts.append(box(f"{name}L{i}_{j}", cx + jx - r, cx + jx + r,
                             cy + jy - rh, cy + jy + rh,
                             z_face - depth + 0.04, z_face - depth + 0.04 + d))
    return merge(name, parts)


# --------------------------------------------------------------------------
# THE CASTING CHANNEL — the engine's two planes, worn as foundry sand
# --------------------------------------------------------------------------

VOL = TG.engine_volumes(SPEC)
RAMP_A, RAMP_B = TG.box_top_plane(VOL["apron"])
LIP_A, LIP_B = TG.box_top_plane(VOL["lip"])
LIP_FRONT = TG.box_front_z(VOL["lip"])
# THE FLAT RUNS PAST THE PROBE, not up to it. First bake refused with the
# throat blocked at 2/25, first hit (-2.38, 1.11, 0.41): the flat stopped at
# 2.34 and the shoulder started rising immediately after, which put 0.33 of
# earth inside the throat's own |x| <= 2.375 at its lowest sample. The apron
# collider's half-width IS 2.375 (3.8*S/2), so cladding it means covering at
# least that much flat and breaking outboard of it.
CHUTE_HW = 2.42
CHUTE_SHOULDER = 0.06              # where the break starts, outboard of the probe
CHUTE_PROUD = 0.02                 # a die never rides nothing
CHUTE_FLOOR = -0.62


def lane_y(z):
    """The engine's lane surface: the upper envelope of the two collider
    planes, read off the same boxes js/main.js builds."""
    return max(RAMP_A - RAMP_B * z, LIP_A - LIP_B * z)


def build_chute():
    """Exactly on the engine's ramp and lip, so a die rides the sand it looks
    like it is riding. Zero colliders: this is paint on a collider that
    already exists. The code skin's tray note is the reason it is the lightest
    thing here — Emberforge dice are black iron and have to read against
    whatever they come to rest on."""
    z0, z1 = -1.60, LIP_FRONT - 0.20
    steps = 22
    rows = []
    for s in range(steps):
        z = z0 + (z1 - z0) * s / (steps - 1)
        base = lane_y(z) + CHUTE_PROUD
        # Shoulders OUTSIDE the lane's own half-width, so no die ever crosses
        # them, and asymmetric so the run does not read as a moulded tray.
        taper = smoothstep(z, 0.2, 3.0)
        lo = (0.26 + 0.12 * h01(s, 5)) * (1.0 - taper)
        ro = (0.10 + 0.09 * h01(s, 6)) * (1.0 - taper)
        rows.append([
            (-CHUTE_HW - CHUTE_SHOULDER - 0.30, -0.05),
            (-CHUTE_HW - CHUTE_SHOULDER, base + lo),
            (-CHUTE_HW, base), (0.0, base), (CHUTE_HW, base),
            (CHUTE_HW + CHUTE_SHOULDER, base + ro),
            (CHUTE_HW + CHUTE_SHOULDER + 0.26, -0.05),
        ])
    verts, faces = [], []
    n = len(rows[0])
    for s, row in enumerate(rows):
        z = z0 + (z1 - z0) * s / (steps - 1)
        for x, y in row:
            verts.append(tuple(F.spec_to_blender(x, y, z)))
    off = len(verts)
    for s, row in enumerate(rows):
        z = z0 + (z1 - z0) * s / (steps - 1)
        for x, _y in row:
            verts.append(tuple(F.spec_to_blender(x, CHUTE_FLOOR, z)))
    for s in range(steps - 1):
        a, b = s * n, (s + 1) * n
        for j in range(n - 1):
            faces.append((a + j, a + j + 1, b + j + 1, b + j))
            faces.append((off + a + j + 1, off + a + j,
                          off + b + j, off + b + j + 1))
        faces.append((a, b, off + b, off + a))
        faces.append((a + n - 1, off + a + n - 1, off + b + n - 1, b + n - 1))
    faces.append(tuple(range(n)) + tuple(range(off + n - 1, off - 1, -1)))
    last = (steps - 1) * n
    faces.append(tuple(range(last + n - 1, last - 1, -1))
                 + tuple(range(off + last, off + last + n)))
    ob = F.obj_from_pydata("towerSkinAnvilChute", verts, faces)
    F.recalc_normals(ob)
    return ob


# --------------------------------------------------------------------------
# PAINT — and it carries the AO bake and the gravity stains too
# --------------------------------------------------------------------------
# js/towerskin.js runs `bakeVertexAO` and then `gravityStain` over the built
# skin at load time. Neither can run on a baked model, so their whole job is
# here: cavity darkening where surfaces face into each other, soot down from
# the crown rim, efflorescence mid-shaft, moss at the damp foot.

def cavity(x, y, z):
    """A stand-in for the raycast AO the code skin bakes, and it is a stand-in
    rather than a port: the real thing fires rays per vertex and this is three
    analytic terms for the three places on THIS model that are actually
    occluded. Written as separate multipliers so a wrong one can be found."""
    k = 1.0
    # Inside the doorway pocket: darkest at the back, and the run-up to it.
    if abs(x) < DOOR_HW and y < DOOR_Y1 and z < 0.10:
        k *= 0.30 + 0.70 * smoothstep(z, DOOR_Z0, 0.24)
    # Inside the firebox recess.
    if abs(x) < GRATE_HW + 0.2 and Y_GRATE0 - 0.1 < y < Y_GRATE1 + 0.1 and z < 0.18:
        k *= 0.42 + 0.58 * smoothstep(z, GRATE_BED_Z, Z_FIELD)
    # Under the cap's oversail and under the hood — a band of shade on the
    # course below whatever stands proud of it.
    k *= 1.0 - 0.30 * smoothstep(y, Y_FIL - 0.55, Y_FIL) * (1.0 - smoothstep(y, Y_FIL, Y_FIL + 0.06))
    k *= 1.0 - 0.34 * smoothstep(y, Y_HOOD - 0.9, Y_HOOD - 0.2) * (1.0 - smoothstep(y, Y_HOOD - 0.2, Y_HOOD))
    # The inside corners where the plinth meets the block — the grimiest in
    # the family, per js/toweranvil.js's weatherPass.
    k *= 1.0 - 0.22 * (1.0 - smoothstep(y, Y_PL2, Y_PL2 + 0.5))
    return k


def stains(c, x, y, z, ny):
    """gravityStain, ported: heat above, damp below, and all of it
    gravity-correct. Soot is darkest at the crown rim and fades DOWN, because
    rainwater carries it down and the lip is where it never washes off;
    efflorescence blooms mid-shaft where the brick is still drying; moss lives
    only at the base."""
    soot = clamp01((y - (Y_CR - 1.6)) / 2.2) * clamp01(1.0 + ny)
    band = clamp01(1.0 - abs(y - 9.4) / 1.9)
    eff = band * smoothstep(fbm(x * 0.9 + 4, y * 0.7, z, 1.4, 3, 0xEF5),
                            0.55, 0.78)
    damp = clamp01(1.0 - y / 1.0)
    # The efflorescence BRIGHTENS and is kept small on purpose: at 0.30 it
    # lifted the whole stack out of the bottom third of the value range and
    # the tower stopped being black.
    return (c[0] * (1 - 0.34 * soot) * (1 + 0.11 * eff) * (1 - 0.13 * damp),
            c[1] * (1 - 0.36 * soot) * (1 + 0.12 * eff) * (1 - 0.06 * damp),
            c[2] * (1 - 0.38 * soot) * (1 + 0.11 * eff) * (1 - 0.17 * damp))


def course_of(y):
    """Which course a height belongs to — the stone/brick split. The block and
    everything under it is soot-blackened stone; the stack is fire-brick,
    browner and only just lighter than the stone it stands on, which is
    exactly the separation it needs and no more."""
    return "brick" if y > Y_CAP - 0.01 else "soot"


def joint_darken(y, joints):
    """A mortar line at each course break: a recess is shadow, and shadow in a
    warm room is never #000."""
    for jy, depth, half in joints:
        d = abs(y - jy)
        if d < half:
            return 1.0 - depth * (1.0 - d / half)
    return 1.0


def _joints():
    """THE MORTAR, painted onto lines the GEOMETRY already put a vertex row on.

    This was tried as paint alone first and it does not work: a mortar line is
    ~0.076 tall, the triangle budget buys vertices 0.38 apart, and a painted
    line between two vertex rows is a line that does not exist. `COURSE_SET`
    is the repair — every course is a real step, so every course line has real
    vertices — and this puts the shadow colour on them.

    The structural joints (the plinth's own steps, the shoulder, the cap, the
    crown's spring line) take it harder: those are steps in the silhouette
    rather than a bed of mortar."""
    structural = {Y_PL1, Y_PL2, Y_BLK, Y_FIL, Y_CAP, Y_CHM[0], Y_CHM[1],
                  Y_CHM[2], Y_CR}
    out = []
    for y in COURSE_LINES:
        if y in structural:
            out.append((y, 0.45, 0.055))
        elif Y_PL2 < y < Y_CROWN:
            out.append((y, 0.30, 0.045))
    return out


JOINTS = _joints()


# THE PERPENDS ARE REFUSED, and the refusal is the round's most useful finding.
#
# Round 3 read as stained WOOD rather than soot-blackened stone. The hue was
# not the cause — the rendered mean was 27,22,21 against the code skin's
# 25,21,20 — and neither was the value, which is inside 6% at every eye. The
# cause is that the only lines on the model run HORIZONTALLY: courses without
# perpends are planks, and the eye sorts planks from masonry instantly.
#
# So a running-bond generator was written, staggered per course, seeded block
# lengths, applied only between bed joints. It was baked twice: at a 0.10
# half-width with 0.34 of darkening, and again at 0.15 with 0.60. NEITHER IS
# VISIBLE IN A SINGLE FRAME, and the arithmetic says why it never could be.
#
#   a perpend that reads is ~0.09 wide     (docs/TOWER.md: 0.07 u to exist)
#   vertex colour resolves a feature only if a VERTEX ROW lands inside it
#   the front face refines to 0.24 before the 15000-triangle cap binds
#   0.24 > 0.09, so most joints fall between two rows and are averaged away;
#   the few that do land get one darkened vertex, which renders as a soft
#   blob rather than a line.
#
# Halving to 0.08 would put the mass at ~90000 triangles. There is no version
# of this that fits, and the third refine pass it needed cost 3300 triangles
# for nothing, so it is gone.
#
# WHAT THIS MEANS FOR T15, and it is worth more than this tower: a baked model
# CANNOT carry the classics' fine surface story. That story lives in 1024px
# seeded canvases with Sobel normal maps, and its replacement is not paint at
# a finer grid — it is GEOMETRY (the stepped courses above, which do read, at
# every distance and in silhouette) and VALUE. A re-baked classic is a
# monolithic object with real relief, not a textured one. Heartwood and
# Bastion are more texture-dependent than this tower, so their rounds should
# start from that sentence rather than rediscover it.

def paint_mass(poly, co):
    x, y, z = co.x, co.z, -co.y
    ny = poly.normal.z            # app-frame +y is Blender +z
    nz = -poly.normal.y
    # The interior: everything a ray that got past the shell would hit. It is
    # what makes the gateway a hole into somewhere dark instead of a hole into
    # the felt behind the tower.
    inside = (abs(x) <= BORE_R + 0.02
              and (AZ - BORE_R - 0.02) <= z <= 0.20
              and (y >= Y_BORE0 - 0.02 or (y >= 1.30 and z <= -0.30)))
    if inside and nz < 0.55:
        return DARK
    which = course_of(y)
    if which == "brick":
        lo, mid, hi, joint = BRICK_LO, BRICK, BRICK_HI, BRICK_JOINT
        grain = fbm(x, y * 1.6, z, 0.55, 3, 0x2B1)
    else:
        lo, mid, hi, joint = SOOT_LO, SOOT, SOOT_HI, SOOT_JOINT
        grain = fbm(x, y, z, 0.85, 3, 0x50F)
    c = lerp3(lo, hi, clamp01(0.20 + 1.35 * (grain - 0.5) + 0.5))
    c = lerp3(c, mid, 0.35)
    # Mortar at the course breaks, and the joint colour showing in it. Brick is
    # laid in a pale ash-lime mortar, LIGHTER than the brick — the opposite of
    # the stone's — and that contrast is most of what says "kiln".
    jd = joint_darken(y, JOINTS)
    if jd < 1.0:
        c = lerp3(c, joint, 1.0 - jd)

    # UPWARD FACES OUT-VALUE WALLS AT EQUAL ALBEDO (the hollowbole tongue, and
    # the forge's trap list): they aim at the key light. Compensate in the bake.
    if ny > 0.5:
        c = scale3(c, 0.82)
    c = scale3(c, cavity(x, y, z))
    return stains(c, x, y, z, ny)


def paint_iron(poly, co):
    x, y, z = co.x, co.z, -co.y
    ny = poly.normal.z
    # Everything here has been in a fire: oxidised metal, pitted, not a mirror.
    # The pitting was a normal map and a roughness map on the code skin; what
    # survives the trip to vertex colour is its COLOUR half.
    pit = fbm(x * 1.7, y * 1.7, z * 1.7, 0.24, 3, 0x1A0)
    c = lerp3(IRON_LO, IRON_HI, clamp01(0.15 + 1.5 * (pit - 0.5) + 0.5))
    c = lerp3(c, IRON, 0.30)
    if ny > 0.5:
        c = scale3(c, 0.84)
    c = scale3(c, cavity(x, y, z))
    # Rust runs DOWN from iron, never up. On the code skin this was seven
    # alpha-tested quads on a stain sheet; here it is the same gravity rule
    # applied to the iron's own foot.
    return stains(c, x, y, z, ny)


def paint_bronze(poly, co):
    x, y, z = co.x, co.z, -co.y
    ny = poly.normal.z
    patch = fbm(x * 0.8, y * 0.8, z * 0.8, 0.62, 2, 0x7E3)
    c = lerp3(BRONZE, BRONZE_HI, clamp01(1.6 * (patch - 0.45)))
    # Verdigris: low-frequency patches pulled toward a green grey. Patchy,
    # never uniform — a uniformly green bronze is a statue and this is
    # hardware.
    c = lerp3(c, VERDIGRIS, 0.42 * smoothstep(patch, 0.58, 0.86))
    if ny > 0.5:
        c = scale3(c, 0.84)
    c = scale3(c, cavity(x, y, z))
    return stains(c, x, y, z, ny)


def paint_bed(_poly, co):
    """The coal's ALBEDO — dead char, and nearly nothing. What this mesh is
    FOR arrives as material emissive, and emissive is not multiplied by
    COLOR_0, so any albedo here is a second, dimmer, differently-lit copy of
    the same shape fighting the first one (nullstone's paint_lit)."""
    x, y, z = co.x, co.z, -co.y
    return lerp3(CHAR, scale3(CHAR, 1.8),
                 clamp01(fbm(x * 2.2, y * 2.2, z * 2.2, 0.18, 2, 0xC0A)))


def paint_chute(poly, co):
    x, y, z = co.x, co.z, -co.y
    ny = poly.normal.z
    over = y - lane_y(z)
    grain = fbm(x * 1.3, y, z * 1.3, 0.40, 3, 0x5A0)
    c = lerp3(SAND_LO, SAND_HI, clamp01(0.2 + 1.3 * (grain - 0.5) + 0.5))
    c = lerp3(c, SAND, 0.30)
    # ENGINE FURNITURE READS DOWN: the lane must never out-value the dice on
    # it. The shoulders are allowed to be sand; the running surface is scuffed
    # darker by everything that has come down it.
    c = scale3(c, 0.80 + 0.26 * smoothstep(over, 0.02, 0.30))
    if ny > 0.5:
        c = scale3(c, 0.86)
    # Under the hood's shadow and back inside the doorway it goes dark, which
    # is what makes a die arrive OUT of somewhere.
    c = scale3(c, 0.34 + 0.66 * smoothstep(z, -1.4, 0.45))
    return c


# --------------------------------------------------------------------------
# MEASUREMENT — every claim re-derived from the BUILT triangles
# --------------------------------------------------------------------------

def door_head_window():
    """(floor, ceiling) for the doorway's head — DERIVED, never typed.

    THE TWO GATES DISAGREE ON THIS TOWER BY 0.097, and that is the whole story
    of round 1's proportions:

      FLOOR   check.py's exit gate fires 25 rays through 95% of the DECLARED
              aperture, so the opening must be clear to
              sillY + clearH - clearH*(1 - THROAT_MARGIN)/2 = 5.388.
      CEILING the cowl occlusion band's LOWEST disc sits at despawnY + dieR -
              cowl height + 0.15 = 5.40, and its deepest sample is seen over
              the flattest ray. Crossing the facade plane, the shallowest of
              those crossings — close.mini, on the sample at z -0.35 — lands
              at 5.485. A doorway whose head is over that line is a hole a
              player can see the vanish through.

    So the head lives in [5.388, 5.485]. The classic code skin puts its lintel
    at 4.50 — 0.888 BELOW the floor — which is legal in the app only because a
    code skin never runs the exit gate. There is no arrangement of this tower
    that keeps the old door head, and none that gives the firebox back the
    height the old head left it.

    Both numbers come out of `towergates` rather than out of this docstring,
    so a retune of THROAT_MARGIN, the despawn drop or the cowl box moves the
    window and this fails loudly instead of drifting."""
    out = PORTAL_OUT
    floor = (out["sillY"] + out["clearH"]
             - out["clearH"] * (1.0 - TG.THROAT_MARGIN) / 2.0)
    ceil = None
    for _eid, e in TG.shipped_eyes():
        for p in TG.occlusion_samples(SPEC)["cowl"]:
            if p[2] >= 0.0 or e[2] <= 0.0:
                continue
            t = (e[2] - Z_FIELD) / (e[2] - p[2])
            y = e[1] + (p[1] - e[1]) * t
            if ceil is None or y < ceil:
                ceil = y
    return floor, ceil


def assert_the_door_head_is_between_the_gates(_objs):
    """§1's divergence, as arithmetic rather than a paragraph."""
    floor, ceil = door_head_window()
    if not (floor <= Y_DOOR_HEAD <= ceil):
        raise RuntimeError(
            f"the door head is at {Y_DOOR_HEAD:.3f}, outside the only window "
            f"the two gates leave it: [{floor:.3f}, {ceil:.3f}]. Under the "
            f"floor is a wall across the exit gate's 25 rays; over the ceiling "
            f"is a sightline into the cowl band from close.mini")
    if Y_GRATE1 > Y_BORE0 - 0.05:
        raise RuntimeError(
            f"the firebox tops at {Y_GRATE1}, at or over the bore floor "
            f"({Y_BORE0}) — above that line the facade is only 0.08 thick and "
            f"a 0.36 recess cuts straight through it into the shaft")
    print(f"[anvil] the door head is between the gates: {Y_DOOR_HEAD:.3f} in "
          f"[{floor:.3f}, {ceil:.3f}] (a {ceil - floor:.3f} window; the code "
          f"skin's lintel is at 4.50, {floor - 4.50:.2f} under the floor); "
          f"firebox {Y_GRATE0:.2f}..{Y_GRATE1:.2f} under the bore floor "
          f"{Y_BORE0:.2f}")


def assert_the_fire_is_countable(_objs):
    """The house ceiling and this tower's own ladder, in one place.

    js/post.js's bloom threshold is 0.9 on LINEAR luminance and there is no
    post-hoc dial. The ordering claim is the identity one: the grate is the
    forge and must out-value the vent, and BOTH stay far enough under the
    stone's own lit value that this is still a dark object with a fire in it
    rather than a lantern."""
    g, v = lum_of(GRATE_EMIT), lum_of(VENT_EMIT)
    if g >= 0.9 or v >= 0.9:
        raise RuntimeError(f"emissive over the bloom threshold: grate {g:.3f}, "
                           f"vent {v:.3f}, threshold 0.9")
    if v >= g:
        raise RuntimeError(f"the vent ({v:.3f}) is not fainter than the grate "
                           f"({g:.3f}) — the firebox is the source")
    if g > 0.35:
        raise RuntimeError(f"the grate at {g:.3f} is a furnace in full cry, "
                           f"not coals at rest (ceiling 0.35)")
    print(f"[anvil] the fire is countable: grate {g:.3f}, vent {v:.3f} linear "
          f"luminance, both under the 0.9 bloom threshold; 2 emissive tiers, "
          f"0 baked lights")


def assert_the_fire_is_seen(lit_objs, occluders):
    """EMISSIVE IS NOT A LIGHT — so a glow no shipped eye can reach is zero
    pixels, not a mood. js/towerhollow.js paid for this with a gill facing the
    floor; the firebox is 0.36 back inside a recess, which is exactly the
    geometry that can hide itself."""
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
                f"triangles and renders nothing")
        print(f"[anvil] {ob.name} is seen: {best[1]}/{len(pts)} emitting faces "
              f"from {best[0]}, {worst[1]}/{len(pts)} from {worst[0]}")


def assert_the_silhouette_has_three_parts(_objs):
    """The /new-tower silhouette rule, on the one axis this tower can fail it:
    a foundry stack that is all block reads as a doorstep with a stub on it.

    The door head's forced +1.00 (§1) eats the block's headroom, so this is
    the number that moved most in the re-bake and the one worth watching."""
    block = Y_BLK - Y_FOOT
    flue = Y_CROWN - Y_BLK
    ratio = block / flue
    # The code skin measures 6.92 : 5.50 = 1.26. A furnace with a flue.
    if ratio > 1.75:
        raise RuntimeError(
            f"block {block:.2f} against flue {flue:.2f} is {ratio:.2f}:1 — "
            f"past 1.75 the stack has stopped being the subject and this is a "
            f"doorstep with a stub on it (the code skin is 1.26:1)")
    print(f"[anvil] three parts: plinth+block {block:.2f}, flue+crown "
          f"{flue:.2f}, ratio {ratio:.2f}:1 (the code skin is 1.26:1)")


# --------------------------------------------------------------------------

def main():
    F.reset()

    mass = build_mass()
    iron = build_iron()
    bronze = build_bronze()
    hood = build_hood()
    GRATE_BOX = (-GRATE_HW + 0.06, GRATE_HW - 0.06,
                 Y_GRATE0 + 0.04, Y_GRATE1 - 0.04, GRATE_BED_Z + 0.24, 0.24)
    VENT_BOX = (VENT_X0 + 0.02, VENT_X1 - 0.02,
                VENT_Y0 + 0.04, VENT_Y1 - 0.04, VENT_BED_Z + 0.10, 0.10)
    grate = build_bed("towerSkinAnvilGrate", *GRATE_BOX, 5, 2, 0.20)
    vent = build_bed("towerSkinAnvilVent", *VENT_BOX, 1, 9, 0.05)
    coals = merge("towerSkinAnvilCoals", [
        build_coals("gc", *GRATE_BOX, 5, 2, 0.20),
        build_coals("vc", *VENT_BOX, 1, 7, 0.045),
    ])
    chute = build_chute()
    meshes = [mass, iron, bronze, hood, grate, vent, coals, chute]

    # PAINT RESOLUTION FIRST, then the clean-up — and that order was a bug for
    # one bake. Subdividing AFTER triangulate leaves 245 degenerate faces and
    # a mesh that will not weld watertight, because grid-fill on triangles
    # makes slivers nothing downstream is left to remove. Refine on the quad
    # mesh, then canonicalize/triangulate over the result, which is what those
    # two are for.
    #
    # Only the mass and the chute get it: they are the two meshes with runs
    # long enough for a linear ramp between corners to read as a flat wash.
    # `seen` deliberately includes the doorway pocket, which is dark but not
    # featureless — a die arrives out of it.
    def seen(co):
        x, y, z = co.x, co.z, -co.y
        if abs(x) < 2.05 and z < -0.36 and y > 1.30:
            return False               # the shaft interior: one flat DARK
        return z >= -1.40 or abs(x) >= 2.30
    refine(mass, 0.38, keep=seen)
    refine(chute, 0.46)

    for ob in meshes:
        F.canonicalize(ob)
        F.clean_slivers(ob)
        F.triangulate(ob)
        nm, vol = F.manifold_report(ob)
        if nm:
            raise RuntimeError(f"{ob.name}: {nm} non-manifold edges")
        print(f"[anvil] manifold ok {ob.name}: volume {vol:.2f}, "
              f"{F.tri_count([ob])} tris")

    # paint AFTER the last bmesh round-trip (the fae_arch deviation)
    F.paint_corners(mass, "Col", paint_mass)
    F.single_material(mass, F.vertex_color_material(
        "anvilMass", "Col", roughness=0.93, specular_level=0.16))
    F.paint_corners(iron, "Col", paint_iron)
    F.single_material(iron, F.vertex_color_material(
        "anvilIron", "Col", roughness=0.74, specular_level=0.42))
    F.paint_corners(bronze, "Col", paint_bronze)
    F.single_material(bronze, F.vertex_color_material(
        "anvilBronze", "Col", roughness=0.68, specular_level=0.46))
    F.paint_corners(hood, "Col", paint_iron)
    F.single_material(hood, F.vertex_color_material(
        "anvilHood", "Col", roughness=0.74, specular_level=0.42))
    # THE TWO FIRES. Separate objects because they are separate VALUES and one
    # material can only carry one. Roughness high and F0 down at 0.008: an
    # emitter with a specular lobe picks up the room's own lantern on top of
    # its own light, which is how banked coals come out grey.
    F.paint_corners(grate, "Col", paint_bed)
    F.single_material(grate, F.vertex_color_material(
        "anvilGrate", "Col", roughness=0.95, specular_level=0.08,
        emission=GRATE_EMIT))
    F.paint_corners(vent, "Col", paint_bed)
    F.single_material(vent, F.vertex_color_material(
        "anvilVent", "Col", roughness=0.95, specular_level=0.08,
        emission=VENT_EMIT))
    # THE COALS: char, and nothing else. They are the only mesh here whose job
    # is to be DARK in front of something bright.
    F.paint_corners(coals, "Col", paint_bed)
    F.single_material(coals, F.vertex_color_material(
        "anvilCoals", "Col", roughness=0.96, specular_level=0.10))
    F.paint_corners(chute, "Col", paint_chute)
    F.single_material(chute, F.vertex_color_material(
        "anvilChute", "Col", roughness=0.90, specular_level=0.18))

    # THE CONTRACT'S BATTERY, from the kit. The occluder handed to the front
    # gate is the MASS ALONE: a hood must never be able to cover for a wall
    # that stopped being one.
    ran = K.run_battery(meshes, SPEC, tag="anvil", tilt_deg=0.0,
                        x_lim=XLIM, crown_max=CROWN_MAX,
                        clad={"towerSkinAnvilChute"},
                        hood={"towerSkinAnvilHood"},
                        occluder=[mass], front_top=Y_CROWN)
    assert_the_door_head_is_between_the_gates(meshes)
    assert_the_fire_is_countable(meshes)
    assert_the_fire_is_seen([grate, vent],
                            [mass, iron, bronze, hood, coals, chute])
    assert_the_silhouette_has_three_parts(meshes)
    if len(ran) != 7:
        raise RuntimeError(f"the battery ran {len(ran)} gates, not 7: {ran}")

    pin, pout = F.tower_portals(PORTAL_IN, PORTAL_OUT)
    # WHERE THE LIGHT GOES, said once, by the recipe, from the mesh. The grate
    # glows, so the grate LIGHTS: emissive maps shine but cannot illuminate,
    # and a forge that casts no warmth on its own tray reads as a sticker.
    # It moved up with the door head — the code skin's row puts it at y 5.2,
    # which on this model is inside the hood's shadow rather than in the fire.
    pad = F.model_marker("emberAt", (0.0, (Y_GRATE0 + Y_GRATE1) / 2, 0.55),
                         {"nx": 0.0, "ny": 0.0, "nz": 1.0})

    F.assert_budget(meshes, BUDGET)
    F.report_bounds(meshes, "blackanvil")
    # NO sit_on_ground: this model's frame IS the contract. y = 0 is the felt
    # and z = 0 is the socket plane.
    F.export_glb("blackanvil", meshes + [pin, pout, pad], vertex_colors=True)


main()
