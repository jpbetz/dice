# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""fae_arch — a ruined fae archway. Hero scenery prop.

BRIEF
    A freestanding weathered stone arch at the edge of a fae ruin. A whole
    left pier carries a ring of voussoirs up over the opening, past the
    keystone, and a third of the way down the far side — where the span
    breaks off in a ragged stepped end and hangs over what is left of the
    right pier: a stump of stacked, tilting courses with rubble at its foot.
    At game distance the silhouette says ARCH first (round-headed opening,
    keystone proud of the extrados) and RUIN second (the missing quarter,
    the diagonal break, the tumbled stones). Material story: one stone,
    weathered — every block a slightly different value, every joint a
    shadow line, and moss climbing the first third from the ground and
    blooming again over the break. The moss is COLOUR, not geometry.

DESIGN INPUTS (fixed before a line of modelling, per the forge-model skill)
    size      ~7u tall, ~6u footprint in X, 1.26u wall — table units, die
              radius 1.25u.
    opening   >= 3.2u wide and >= 4.0u tall of clear corridor, so a die of
              radius 1.25 rolls through it. MEASURED off the built vertices
              by assert_opening(), not derived from the constants — the
              derived version passed while the plinth lipped into the
              opening (see PLINTH_X0).
    budget    hero prop, 8000 tris HARD (gated in-recipe AND on the CLI),
              aiming 5-7k.
    colour    vertex colours, COLOR_0, ONE mesh / ONE material that reads
              the attribute. Per-block stone value, joint shadow at every
              stone's foot, sun on up-faces, grain noise on every face,
              moss greens patched by two octaves of noise. No flat fill
              anywhere, and moss coverage is capped so stone shows through.
    front     glTF +Z (Blender -Y): the arch plane is X-Z, you look through
              it along Y. Axis kept on x=0 (center_xy=False) so the opening
              straddles the origin and the prop can be dropped onto a table
              without re-centring.
    seed      everything deterministic: a hash RNG (rand01) and value noise
              (fbm) keyed by integers only. No Python `random`, no Blender
              texture nodes, no booleans — so no solver reordering, and the
              digest is stable by construction rather than by canonicalize.

MEASURED (bake of 2026-08-12, Blender 4.5.12 LTS)
    45 stones, 2666 verts, 2576 quads -> 5152 tris, 354.4 kB
    watertight=True, colors=True, vol=15.4953, degen=0, non-manifold 0
    opening measured 3.29 wide x 5.82 tall (spec 3.2 x 4.0)
    glTF bounds (-2.954, 0.000, -1.332) .. (2.991, 7.190, 1.217)
        = 5.95 wide (X) x 7.19 tall (Y) x 2.55 deep (Z; the wall is 1.26,
          the rest is rubble lying in front of and behind the arch)
    digest order=afce6798860e6f7c set=98bf03502090da16, identical run to run

CONSTRUCTION
    No CSG. The arch is ~50 separate closed stone shells accumulated into a
    single mesh — which is how masonry actually reads, and it sidesteps the
    entire boolean trap family (README traps 3, 5, 6, 7): stones may touch
    or overlap freely because nothing is ever unioned. Each shell is the
    boundary of a topological box (grid_box) so a mapping function decides
    whether it is a rectangular block or a curved voussoir, and every
    vertex is shared by the faces meeting at it, so per-vertex noise
    displacement cannot open a hole. Check the numbers: non-manifold edges
    0, watertight after weld True — disjoint closed shells satisfy both.

    blender -b --factory-startup --python-exit-code 1 --python fae_arch.py
"""

import math
import os
import sys

from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import forge as F  # noqa: E402

# --- dimensions (table units) ---------------------------------------------
DEPTH = 1.26              # wall thickness, y in [-0.63, 0.63]
PLINTH_DEPTH = 1.50
PLINTH_H = 0.32
PLINTH_X0, PLINTH_X1 = 1.70, 2.96     # jitter+displacement carry the widest
                                      # stone to ~3.03, so the footprint
                                      # measures 6.06 against a spec of ~6.
                                      # X0 is the PIER's inner face, not less:
                                      # at 1.45 the base course lipped 0.25
                                      # into the opening and narrowed the die
                                      # corridor to 2.90. A plinth projects
                                      # outward only. assert_opening() caught
                                      # it; the constant-based check I wrote
                                      # first did not, because it only knew
                                      # about the piers.

PIER_X0, PIER_X1 = 1.70, 2.78         # inner / outer face of a pier
SPRING_Z = 4.18                       # springline: where the ring starts.
                                      # 4.18 + R_OUT + the keystone's 0.12
                                      # lands the crown at ~7.1, i.e. "~7"
R_IN, R_OUT = 1.70, 2.78              # intrados / extrados; ring depth 1.08
# Course heights as fractions of plinth-top -> springline. Deliberately
# unequal: seven identical courses read as a Jenga stack, which is exactly
# what the first bake looked like.
COURSE_H = [0.140, 0.160, 0.125, 0.155, 0.128, 0.172, 0.120]
COURSES = len(COURSE_H)
JOINT = 0.055                         # mortar gap; > 0.05 so it reads at all

N_SLOT = 15                           # voussoirs per full 180 deg -> 12 deg
SLOT = math.pi / N_SLOT
KEEP = 12                             # slots 0..11: break lands ~137 deg
KEYSTONE = 7                          # the slot centred on 90 deg
JOINT_A = math.radians(0.55)

STUMP_COURSES = 4                     # right pier survives to z ~2.6 + ragged

BUDGET = 8000                         # hero-prop ceiling; aim was 5-7k
DISP_AMP = 0.055                      # face noise: gentle, silhouette stays
                                      # architectural (0.09 on broken ends)
NOISE_SCALE = 4.6                     # high enough to read as chipped stone;
                                      # at 3.1 each face bulged into a pillow
SMOOTH_DEG = 14.0                     # NOT the house default 32: at 32 the
                                      # sub-quads of a displaced face blend
                                      # into a dome and the stone reads as
                                      # soap. At 14 they facet, and faceting
                                      # is what says "cut stone" at distance.
                                      # The voussoir intrados is 2.2 deg per
                                      # segment, so the arch stays smooth.

# --- palette ---------------------------------------------------------------
# THESE NUMBERS ARE LINEAR. COLOR_0 is linear by the glTF spec, and Blender
# hands the float straight through, so an 0.545 "mid grey" displays at sRGB
# 0.76 — near white. The first bake's albedo shot was a white arch with mint
# fuzz on it. Every value here is therefore the LINEAR value of the sRGB
# colour actually wanted: stone reads ~0.50-0.60 on screen, moss ~0.30-0.50.
STONE_RGB = (0.278, 0.268, 0.246)     # -> sRGB ~ (0.565, 0.555, 0.535)
# Moss went through a lime-green bake that read casino, not fae: too light,
# too saturated, and laid on as a solid coat. These are damp-shade greens,
# and the mask below caps coverage so stone always shows through.
MOSS_DARK = (0.020, 0.038, 0.016)     # -> sRGB ~ (0.16, 0.22, 0.14)
MOSS_LIT = (0.098, 0.165, 0.050)      # -> sRGB ~ (0.35, 0.44, 0.25)
LICHEN = (0.360, 0.375, 0.280)        # -> sRGB ~ (0.63, 0.64, 0.57)

# Moss blooms again at the wound — where the span broke and where the stump
# was left open to the weather. (x, z, radius x, radius z); the radii are
# tight on purpose, because at 1.45/1.15 the blobs swallowed the whole stump
# and the last three voussoirs in solid green.
WOUNDS = ((1.45, 5.33, 1.10, 0.90), (2.25, 2.90, 1.05, 0.85))


# --- deterministic noise ---------------------------------------------------
# Python's `random` would be fine, but an integer hash is stable across
# interpreter versions AND lets geometry and colour sample the same field,
# which is what makes a lumpy face read as lumpy in shading too.

def _hash32(*key):
    h = 2166136261
    for k in key:
        h ^= int(k) & 0xFFFFFFFF
        h = (h * 16777619) & 0xFFFFFFFF
        h ^= h >> 15
    return h


def rand01(*key):
    return _hash32(*key) / 4294967296.0


def rand_sym(amount, *key):
    """Symmetric jitter in [-amount, +amount]."""
    return (2.0 * rand01(*key) - 1.0) * amount


def _lattice(i, j, k, seed):
    return rand01(i * 73856093, j * 19349663, k * 83492791, seed)


def vnoise(p, scale, seed=0):
    """Trilinear value noise in [0, 1]."""
    x, y, z = p[0] * scale, p[1] * scale, p[2] * scale
    i, j, k = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - i, y - j, z - k
    sx = fx * fx * (3.0 - 2.0 * fx)
    sy = fy * fy * (3.0 - 2.0 * fy)
    sz = fz * fz * (3.0 - 2.0 * fz)
    out = 0.0
    for a in (0, 1):
        wa = sx if a else 1.0 - sx
        for b in (0, 1):
            wb = sy if b else 1.0 - sy
            for c in (0, 1):
                wc = sz if c else 1.0 - sz
                out += wa * wb * wc * _lattice(i + a, j + b, k + c, seed)
    return out


def fbm(p, scale, seed=0):
    return 0.66 * vnoise(p, scale, seed) + 0.34 * vnoise(p, scale * 2.7, seed + 977)


def clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


def smoothstep(x, lo, hi):
    t = clamp((x - lo) / (hi - lo))
    return t * t * (3.0 - 2.0 * t)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


# --- one closed shell ------------------------------------------------------

class Accum:
    """Vertices, faces, and the per-vertex block metadata the painter reads."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.meta = {}
        self.blocks = 0


def edge_dir(i, n):
    return -1 if i == 0 else 1 if i == n else 0


def surface_dir(P, u, v, w, d, h=1e-3):
    """Outward direction at a lattice point, from the map's own Jacobian.

    Face-interior points get the face perpendicular; edge and corner points
    get the sum of their faces' perpendiculars. Works for the curved
    voussoir map as well as the flat block map, which is the whole reason
    the direction is measured instead of assumed.
    """
    acc = Vector((0.0, 0.0, 0.0))
    par = [u, v, w]
    for ax in range(3):
        if not d[ax]:
            continue
        a, b = list(par), list(par)
        a[ax] = min(1.0, par[ax] + h)
        b[ax] = max(0.0, par[ax] - h)
        acc += (P(*a) - P(*b)).normalized() * d[ax]
    return acc.normalized()


def add_block(acc, P, div, joint_fn, amp=DISP_AMP, rgb=None):
    """Append the closed boundary of a topological box mapped by P.

    P(u, v, w) maps the unit cube to space; `div` is the cell count per
    axis. Only boundary lattice points exist, and each is created ONCE, so
    displacing them cannot tear the shell open.
    """
    nu, nv, nw = div
    bid = acc.blocks
    acc.blocks += 1
    if rgb is None:
        rgb = stone_rgb(bid)

    idx = {}
    for i in range(nu + 1):
        for j in range(nv + 1):
            for k in range(nw + 1):
                d = (edge_dir(i, nu), edge_dir(j, nv), edge_dir(k, nw))
                rank = sum(1 for c in d if c)
                if not rank:
                    continue                       # interior: never created
                u, v, w = i / nu, j / nv, k / nw
                p = P(u, v, w)
                # Corners and edges move less than face centres: that is what
                # keeps the block reading as a cut stone rather than a potato.
                taper = (1.0, 0.5, 0.28)[rank - 1]
                n = fbm((p.x, p.y, p.z), NOISE_SCALE, bid * 31 + 5)
                p = p + surface_dir(P, u, v, w, d) * (amp * taper * (2.0 * n - 1.0))
                # Snap to a 1e-4 grid. The painter looks metadata up BY
                # POSITION, and Blender stores coordinates as float32; on a
                # snapped grid the float32 round-trip cannot cross a 4-decimal
                # rounding boundary (error ~5e-7 vs a 5e-5 margin), so the key
                # survives. Unsnapped, roughly one vertex in fifty would miss.
                key = (round(p.x, 4), round(p.y, 4), round(p.z, 4))
                idx[(i, j, k)] = len(acc.verts)
                acc.verts.append(key)
                acc.meta[key] = (rgb, joint_fn(u, v, w))

    f = acc.faces
    for j in range(nv):                            # +/-U faces
        for k in range(nw):
            f.append((idx[(nu, j, k)], idx[(nu, j + 1, k)],
                      idx[(nu, j + 1, k + 1)], idx[(nu, j, k + 1)]))
            f.append((idx[(0, j, k)], idx[(0, j, k + 1)],
                      idx[(0, j + 1, k + 1)], idx[(0, j + 1, k)]))
    for i in range(nu):                            # +/-V faces
        for k in range(nw):
            f.append((idx[(i, nv, k)], idx[(i, nv, k + 1)],
                      idx[(i + 1, nv, k + 1)], idx[(i + 1, nv, k)]))
            f.append((idx[(i, 0, k)], idx[(i + 1, 0, k)],
                      idx[(i + 1, 0, k + 1)], idx[(i, 0, k + 1)]))
    for i in range(nu):                            # +/-W faces
        for j in range(nv):
            f.append((idx[(i, j, nw)], idx[(i + 1, j, nw)],
                      idx[(i + 1, j + 1, nw)], idx[(i, j + 1, nw)]))
            f.append((idx[(i, j, 0)], idx[(i, j + 1, 0)],
                      idx[(i + 1, j + 1, 0)], idx[(i + 1, j, 0)]))
    return bid


def stone_rgb(bid):
    """Per-block base colour: value first, hue barely. Masonry is values."""
    v = 0.68 + 0.56 * rand01(bid, 8081)
    warm = rand_sym(0.065, bid, 8082)
    r, g, b = STONE_RGB
    return (clamp(r * v * (1.0 + warm)), clamp(g * v), clamp(b * v * (1.0 - warm)))


def joint_low(u, v, w):
    """Shadow in the bed joints of a stone (both local Z faces).

    Both faces, not just the bottom: the review look showed the key and rim
    lights raking INTO the joints and lighting the stone tops/sides bright
    blue-white — geometry the mortar cores cannot shadow, because the joint
    walls belong to the stones. Painting the joint bands near-dark makes a
    lit joint wall read as mortar instead of sparkle.
    """
    t = min(w, 1.0 - w)
    return max(0.0, 1.0 - t / 0.30) ** 1.3


def joint_radial(u, v, w):
    """Shadow at both radial joints of a voussoir (its local +/-U faces)."""
    t = min(u, 1.0 - u)
    return max(0.0, 1.0 - t / 0.22) ** 1.3


# --- the maps --------------------------------------------------------------

def box_map(centre, half, rot=(0.0, 0.0, 0.0)):
    """Rectangular stone: u->X, v->Y, w->Z(up), then rotated about its centre."""
    m = (Matrix.Rotation(rot[2], 3, "Z") @ Matrix.Rotation(rot[1], 3, "Y")
         @ Matrix.Rotation(rot[0], 3, "X"))
    c = Vector(centre)

    def P(u, v, w):
        return c + m @ Vector(((2 * u - 1) * half[0], (2 * v - 1) * half[1],
                               (2 * w - 1) * half[2]))
    return P


def arc_map(th0, th1, r0, r1, y0, y1):
    """Voussoir: u->along the arc, v->radial, w->through the wall.

    theta runs 0 at the LEFT springing, pi/2 at the crown, pi at the right.
    """
    def P(u, v, w):
        th = th0 + (th1 - th0) * u
        r = r0 + (r1 - r0) * v
        return Vector((-r * math.cos(th), y0 + (y1 - y0) * w,
                       SPRING_Z + r * math.sin(th)))
    return P


def stone(acc, x0, x1, y0, y1, z0, z1, div, sid, tilt=0.0, amp=DISP_AMP,
          joint_fn=joint_low):
    """A rectangular stone from its bounds, jittered a little by its id."""
    jx = rand_sym(0.022, sid, 1)
    jz = rand_sym(0.014, sid, 2)
    centre = ((x0 + x1) / 2 + jx, (y0 + y1) / 2, (z0 + z1) / 2 + jz)
    half = (abs(x1 - x0) / 2 + rand_sym(0.018, sid, 3),
            abs(y1 - y0) / 2 + rand_sym(0.012, sid, 4),
            abs(z1 - z0) / 2 + rand_sym(0.010, sid, 5))
    rot = (rand_sym(math.radians(0.9), sid, 6),
           tilt + rand_sym(math.radians(1.1), sid, 7),
           rand_sym(math.radians(1.3), sid, 8))
    return add_block(acc, box_map(centre, half, rot), div, joint_fn, amp=amp)


# --- the elevation ---------------------------------------------------------

def plinths(acc):
    """Two stones per side, a touch deeper than the wall: a base course."""
    mid = (PLINTH_X0 + PLINTH_X1) / 2
    for side in (-1, 1):
        for i, (a, b) in enumerate(((PLINTH_X0, mid), (mid, PLINTH_X1))):
            sid = 100 + (side > 0) * 10 + i
            stone(acc, side * a + side * JOINT / 2, side * b - side * JOINT / 2,
                  -PLINTH_DEPTH / 2, PLINTH_DEPTH / 2,
                  0.0, PLINTH_H - JOINT / 2, (5, 3, 3), sid)


def course_bounds(c):
    span = SPRING_Z - PLINTH_H
    z0 = PLINTH_H + span * sum(COURSE_H[:c])
    return z0 + JOINT / 2, z0 + span * COURSE_H[c] - JOINT / 2


def course(acc, side, c, sid0, tilt=0.0):
    """One masonry course, in one of three bonds by height.

    The first bake split every other course front/back, which is real
    masonry and completely invisible from the front — the elevation read as
    a stack of long identical bars. Every third course now breaks ACROSS the
    face instead, so the vertical joints show and stagger.
    """
    z0, z1 = course_bounds(c)
    x0, x1 = PIER_X0, PIER_X1
    mode = c % 3
    if mode == 0:                                   # one through stone
        stone(acc, side * x0, side * x1, -DEPTH / 2, DEPTH / 2, z0, z1,
              (5, 3, 3), sid0, tilt=tilt)
    elif mode == 1:                                 # broken across the face
        xm = x0 + (x1 - x0) * (0.42 + 0.16 * rand01(sid0, 9))
        stone(acc, side * x0, side * (xm - JOINT / 2), -DEPTH / 2, DEPTH / 2,
              z0, z1, (3, 3, 3), sid0, tilt=tilt)
        stone(acc, side * (xm + JOINT / 2), side * x1, -DEPTH / 2, DEPTH / 2,
              z0, z1, (3, 3, 3), sid0 + 1, tilt=tilt)
    else:                                           # broken front/back
        stone(acc, side * x0, side * x1, -DEPTH / 2, -JOINT / 2, z0, z1,
              (5, 2, 3), sid0, tilt=tilt)
        stone(acc, side * x0, side * x1, JOINT / 2, DEPTH / 2, z0, z1,
              (5, 2, 3), sid0 + 1, tilt=tilt)


def left_pier(acc):
    for c in range(COURSES):
        course(acc, -1, c, 200 + c * 2)


def right_stump(acc):
    """Four courses survive; above them the wall gives out in a diagonal.

    Two ragged stones at different heights and opposite tilts read as a
    break rather than as a wall someone stopped building.
    """
    for c in range(STUMP_COURSES):
        course(acc, 1, c, 300 + c * 2)
    z = course_bounds(STUMP_COURSES - 1)[1] + JOINT / 2
    # inner half stands proudest, outer half has sheared away lower
    stone(acc, 1.70, 2.44, -DEPTH / 2, DEPTH / 2, z, z + 0.46,
          (3, 3, 2), 340, tilt=math.radians(-4.5), amp=0.085)
    stone(acc, 2.34, 2.78, -DEPTH / 2, 0.30, z, z + 0.23,
          (3, 3, 2), 342, tilt=math.radians(3.5), amp=0.085)
    # one stone left perched on the outer corner, half off its bed
    stone(acc, 2.46, 2.93, -0.10, DEPTH / 2, z + 0.20, z + 0.52,
          (3, 2, 2), 344, tilt=math.radians(7.0), amp=0.085)


def ring(acc):
    """The voussoirs, from the left springing over the crown to the break.

    Slots 0..8 are sound; 9 and 10 have lost their outer courses and 11 is
    the last stone still clinging, so the break steps down instead of
    ending on a clean guillotine cut.
    """
    for s in range(KEEP):
        sid = 400 + s
        th0 = s * SLOT + JOINT_A + rand_sym(math.radians(0.25), sid, 1)
        th1 = (s + 1) * SLOT - JOINT_A + rand_sym(math.radians(0.25), sid, 2)
        r0 = R_IN + rand_sym(0.018, sid, 3)
        # extrados jitter is deliberately 2.5x the intrados': the outer edge
        # of a weathered ring is nibbled, the inner one is the arch and has
        # to stay a circle or the opening stops reading as round-headed
        r1 = R_OUT + rand_sym(0.048, sid, 4) - 0.05 * rand01(sid, 41)
        amp = DISP_AMP
        if s == KEYSTONE:
            r0 -= 0.05                      # proud inside and out: it reads
            r1 += 0.12                      # as the stone holding the rest up
        elif s == 9:
            r1 = R_OUT - 0.24
            amp = 0.09
        elif s == 10:
            r0 = R_IN + 0.05
            r1 = R_OUT - 0.56
            amp = 0.09
        elif s == 11:
            r0 = R_IN + 0.03
            r1 = R_IN + 0.47
            th1 = th0 + (SLOT - 2 * JOINT_A) * 0.58
            amp = 0.09
        y0 = -DEPTH / 2 + rand_sym(0.02, sid, 5)
        y1 = DEPTH / 2 + rand_sym(0.02, sid, 6)
        div = (5, 2, 3) if s < 9 else (3, 2, 3)
        add_block(acc, arc_map(th0, th1, r0, r1, y0, y1), div, joint_radial,
                  amp=amp)


# (x, y, size, tilt about X/Y in degrees, yaw) — hand placed, not scattered:
# the fallen stones explain the missing quarter, so they sit under the break
# and along the line the ring would have taken.
RUBBLE = [
    # x is measured against the corridor with the YAW applied: a 0.62-long
    # stone turned 24 deg reaches 0.39 from its centre, not 0.31, and the
    # first two entries here failed assert_opening on exactly that.
    (2.06, 0.98, (0.62, 0.46, 0.34), (4, -6), 24),
    (2.28, -0.62, (0.52, 0.44, 0.30), (-5, 4), -38),
    (2.72, 0.16, (0.44, 0.40, 0.27), (3, 5), 12),
    (1.98, 0.88, (0.38, 0.34, 0.24), (-4, -3), 55),
    (2.60, -0.20, (0.58, 0.42, 0.22), (2, -4), -14),
    (2.02, -0.98, (0.34, 0.32, 0.21), (5, 3), 41),
    (-2.10, 0.82, (0.46, 0.38, 0.26), (-3, 4), -27),
    (-2.72, -0.52, (0.36, 0.34, 0.22), (4, -5), 63),
    (2.42, 0.70, (0.30, 0.28, 0.36), (3, 2), 8),   # standing on end
]


def rubble(acc):
    for i, (x, y, size, tilt, yaw) in enumerate(RUBBLE):
        hx, hy, hz = (s / 2 for s in size)
        centre = (x, y, hz - 0.015)          # bedded a hair into the ground
        rot = (math.radians(tilt[0]), math.radians(tilt[1]), math.radians(yaw))
        add_block(acc, box_map(centre, (hx, hy, hz), rot), (3, 3, 2), joint_low,
                  amp=0.05)


def joint_none(u, v, w):
    return 0.0


MORTAR_RGB = (0.024, 0.022, 0.018)    # linear; darker than any stone's shadow


def mortar_cores(acc):
    """Dark filler blocks INSIDE the piers and the ring.

    Review finding (main-session gate, first bake): in the three.js viewer
    against the dark table the JOINT gaps between shells read as GLOWING
    cracks — background and rim light leak straight through, which the
    Cycles self-check (friendly grey ground, bright sky) could not show.
    Same philosophy as the tower contract's aperture rule: an opening must
    resolve to something closed and dark behind it. Cores are inset 0.06
    from every outer face so they never print through a stone.
    """
    IN = 0.06
    for side in (-1, 1):
        top = SPRING_Z if side < 0 else course_bounds(STUMP_COURSES - 1)[1]
        x0, x1 = side * (PIER_X0 + IN), side * (PIER_X1 - IN)
        add_block(acc, box_map((((x0 + x1) / 2), 0.0, (PLINTH_H + top) / 2),
                               (abs(x1 - x0) / 2, DEPTH / 2 - IN,
                                (top - PLINTH_H) / 2 - IN), (0, 0, 0)),
                  (1, 1, 1), joint_none, amp=0.0, rgb=MORTAR_RGB)
    # the ring, in two radial thicknesses: sound slots 0-8, then the thin
    # broken tail 9-11 (whose stones have lost their outer courses)
    add_block(acc, arc_map(JOINT_A, 9 * SLOT - JOINT_A, R_IN + IN, R_OUT - 2 * IN,
                           -DEPTH / 2 + IN, DEPTH / 2 - IN),
              (8, 1, 1), joint_none, amp=0.0, rgb=MORTAR_RGB)
    add_block(acc, arc_map(9 * SLOT, (11 + 0.5) * SLOT, R_IN + IN, R_IN + 0.30,
                           -DEPTH / 2 + IN, DEPTH / 2 - IN),
              (3, 1, 1), joint_none, amp=0.0, rgb=MORTAR_RGB)


# --- colour ----------------------------------------------------------------

def moss_mask(co, n):
    """How mossy this corner is: 0 clean stone, 1 full growth.

    Two drives — up from the ground, and out from the wound — thresholded
    against a noise field so the edge is patchy. Up-facing surfaces get
    more, which is where poly.normal is exactly the right input: these are
    FLAT faces with sharp edges between them, so a per-face constant reads
    as "the top of this stone", not as the sawtooth it would be on B4's
    smooth organic shell.
    """
    ground = 1.0 - smoothstep(co.z, 0.70, 3.60)
    wound = 0.0
    for cx, cz, rx, rz in WOUNDS:
        d2 = ((co.x - cx) / rx) ** 2 + ((co.z - cz) / rz) ** 2
        wound = max(wound, math.exp(-d2))
    # The up-facing floor is 0.55, not 0.34: at 0.34 the vertical faces came
    # out bare and the piers lost the climb the brief asks for. Damp stone
    # does grow moss on its face, just less than on its ledges.
    drive = clamp(0.86 * ground + 0.70 * wound) * (0.55 + 0.45 * max(0.0, n.z))
    # two octaves at very different scales: the coarse one makes patches, the
    # fine one eats their edges. One octave alone painted whole blocks solid.
    field = (0.62 * fbm((co.x, co.y, co.z), 1.15, 4242)
             + 0.38 * fbm((co.x, co.y, co.z), 3.9, 1717))
    # Coverage is capped at 0.82 and the drive is held under 1 on purpose:
    # stone has to show through even in the wettest corner, or the moss goes
    # flat and the house rule (value variation, never flat colour) is broken.
    return 0.82 * smoothstep(field + drive - 0.70, 0.0, 0.40)


def make_painter(meta):
    def paint(poly, co):
        key = (round(co.x, 4), round(co.y, 4), round(co.z, 4))
        entry = meta.get(key)
        if entry is None:
            # Loud, not silent: if the float32 round-trip ever breaks the
            # position key, the model must not ship in flat grey.
            raise KeyError(f"fae_arch: no block metadata at {key}")
        rgb, joint = entry
        n = poly.normal
        up, down = max(0.0, n.z), max(0.0, -n.z)
        v = (1.0 + 0.11 * up) * (1.0 - 0.27 * down) * (1.0 - 0.74 * joint)
        # Grain, at a scale small enough to see ON a stone. At 2.2 the mottle
        # was wider than a block, so every face came out one flat tone and the
        # close render looked like moulded plastic.
        v *= 0.80 + 0.40 * fbm((co.x, co.y, co.z), 5.5, 77)
        stone_c = tuple(clamp(c * v) for c in rgb)

        lichen = smoothstep(co.z, 2.8, 5.0) * smoothstep(
            fbm((co.x, co.y, co.z), 1.7, 313), 0.60, 0.80)
        stone_c = mix(stone_c, LICHEN, 0.40 * lichen)

        m = moss_mask(co, n)
        if m > 0.0:
            g = fbm((co.x, co.y, co.z), 3.4, 191)
            moss = mix(MOSS_DARK, MOSS_LIT, clamp(0.15 + 1.15 * g))
            moss = tuple(clamp(c * (0.82 + 0.30 * up)) for c in moss)
            return mix(stone_c, moss, m)
        return stone_c
    return paint


# --- bake ------------------------------------------------------------------

SPEC_W, SPEC_H = 3.2, 4.0             # the corridor a die of radius 1.25 needs
TUNNEL_Y = 0.95                       # |y| a stone must clear to be "in" it


def assert_opening(acc):
    """MEASURE the clear corridor from the built vertices, don't derive it.

    The first version computed the width from PIER_X0 and passed — while the
    plinth, which knows nothing about PIER_X0, lipped 0.25u into the opening
    on each side. A gate that reads the model catches that; a gate that reads
    the constants only re-states the modeller's assumptions back to him.
    """
    half_w, apex = 1e9, 1e9
    for x, y, z in acc.verts:
        if abs(y) > TUNNEL_Y:
            continue
        if 0.02 < z <= SPEC_H:
            half_w = min(half_w, abs(x))
        if abs(x) <= 0.35:
            apex = min(apex, z) if z > SPEC_H * 0.5 else apex
    w, h = 2 * half_w, apex
    if w < SPEC_W or h < SPEC_H:
        raise RuntimeError(f"opening measures {w:.2f} x {h:.2f}, spec is "
                           f"{SPEC_W} x {SPEC_H} — a die of radius 1.25 has "
                           "to roll through it")
    print(f"[fae] opening measured {w:.2f} wide x {h:.2f} tall "
          f"(spec {SPEC_W} x {SPEC_H})")


def main():
    F.reset()

    acc = Accum()
    plinths(acc)
    left_pier(acc)
    right_stump(acc)
    ring(acc)
    rubble(acc)
    mortar_cores(acc)
    print(f"[fae] {acc.blocks} stones, {len(acc.verts)} verts, "
          f"{len(acc.faces)} quads")
    assert_opening(acc)

    arch = F.obj_from_pydata("fae_arch", acc.verts, acc.faces)
    F.recalc_normals(arch)      # every shell outward; see F.assert_outward

    # DELIBERATE DEVIATION from F.finish(). finish() runs canonicalize(),
    # which rebuilds the mesh through from_pydata and carries only materials
    # across — a colour attribute painted before it is silently dropped, and
    # there is no hook to paint after it. So this is finish()'s tail written
    # out, in B1/B4's order, with paint_corners after the last bmesh
    # round-trip: nothing here needs canonicalize anyway, because no boolean
    # ever runs and the vertex order is the construction order.
    F.triangulate(arch)
    F.smooth_by_angle(arch, SMOOTH_DEG)   # facets read as stone; see the const
    F.paint_corners(arch, "Col", make_painter(acc.meta))
    F.single_material(arch, F.vertex_color_material("stone", "Col"))

    nm, vol = F.manifold_report(arch)
    if nm:
        raise RuntimeError(f"fae_arch: {nm} non-manifold edges")
    print(f"[fae] manifold ok: 0 non-manifold edges, volume {vol:.3f}")

    F.sit_on_ground([arch], center_xy=False)   # keep the opening on x=0
    F.assert_budget([arch], BUDGET)
    F.report_bounds([arch], "fae_arch")
    F.export_glb("fae_arch", [arch], vertex_colors=True)


main()
