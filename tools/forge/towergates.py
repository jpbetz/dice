# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""towergates — the tower contract's gates, in ONE implementation.

WHY THIS FILE EXISTS. Two processes have to ask the same questions of the
same triangles and they cannot import each other:

  * a RECIPE runs inside Blender's Python (bpy, no trimesh) and wants the
    answer at bake time, with the offending probe named, before it writes
    a GLB nobody should ship;
  * `check.py` runs on the forge venv (trimesh, no bpy) and wants the answer
    about the FILE, because a recipe can only gate what it remembers to gate.

Before this file, the answer was: hollowbole.py carried the occlusion grid
and check.py carried none of it, so occlusion — the one obligation a browser
takes thirty minutes to find — was enforced by exactly one recipe and by no
gate on any shipped GLB. The gates are here, they take numpy arrays of
triangles and a portal spec, and they return a LIST OF FAILURE STRINGS.
Nothing here imports bpy, trimesh, or anything outside the stdlib + numpy,
which is the whole reason both callers can reach it.

Everything is APP-FRAME with z0 = 0: y up, +z toward the player, z = 0 the
back-wall socket plane. That is the frame a tower model is authored in and
the frame its portal nodes are quoted in, so no conversion happens here.
"""
import math

import numpy as np

# --------------------------------------------------------------------------
# ENGINE_MIRROR — every number copied out of js/main.js, in ONE place
# --------------------------------------------------------------------------
# PROVISIONAL BY CONSTRUCTION. These are the engine's own constants, and the
# only reason they are re-typed here is that a bake has no JS runtime. Round 2
# of the tower-contract work replaces this dict with an `engine_contract.json`
# EMITTED by js/main.js, so that "the mirror drifted" stops being a failure
# mode the way it already stopped being one for the portal numbers. Until then
# the rule is: no engine number gets a second copy anywhere in tools/forge —
# it goes in here and everything reads it from here.
#
# `check.py` imports this dict rather than restating it, and `engine_volumes()`
# below mirrors towerVolumes()'s DELTA ARITHMETIC rather than its outputs, so a
# tower with off-default portals gets the volumes the engine would actually
# build for it instead of the classic ones.
ENGINE_MIRROR = {
    # TOWER_S — every core dimension is quoted in it, and it is also a d20's
    # radius, which is why the aperture floors are quoted in it too.
    "S": 1.25,
    # TOWER_DIE_R — world-fixed, and NOT the same fact as S even though it is
    # the same number: the occlusion contract ("a die vanishes when its centre
    # crosses despawnY, so nothing below despawnY + a radius may be seen")
    # needs a die's radius, not a scale factor.
    "dieR": 1.25,
    # TOWER_LIP_TILT — the shipped constant, not TOWERLAB.tune.lipTilt.
    "lipTilt": 0.1,
    # matExtra: socketing a tower DEEPENS the mat by this, and every camera
    # follows. The occlusion eyes below are quoted against the undeepened
    # preset, so this is how they get to where they actually stand.
    "matExtra": 4.5,
    # DEFAULT_PORTALS: the classic core written back out in portal terms. Every
    # delta in engine_volumes() is `spec - this`.
    "defaultPortals": {
        "in": {"x": 0.0, "z": -1.6 * 1.25, "rimY": 7.0 * 1.25, "clearR": 1.7 * 1.25},
        "out": {"x": 0.0, "sillY": 0.8 * 1.25, "w": 4.0 * 1.25, "clearH": 3.6 * 1.25},
    },
    # THE SIX SHIPPED EYES: (id, that preset's table depth, its eye position).
    # The app anchors each eye to the LIVE back wall — eye.z = z0 + (e.z -
    # z0_of_that_preset) — so in a model's own frame (z = 0 at the socket
    # plane) the z0s cancel and the eye stands at e.z + (depth + matExtra)/2,
    # whatever zoom the table is wearing.
    "zoomEyes": [
        ("wide.full", 8.6, (0.0, 13.3, 7.7)), ("wide.mini", 8.6, (0.0, 11.0, 6.2)),
        ("medium.full", 6.7, (0.0, 10.4, 6.0)), ("medium.mini", 6.7, (0.0, 8.6, 4.8)),
        ("close.full", 5.2, (0.0, 8.1, 4.7)), ("close.mini", 5.2, (0.0, 6.7, 3.8)),
    ],
    # TOWER_PORTAL_LIMITS. The aperture floors are MEASURED, not inherited
    # (2026-08-13 portal-floors campaign, tools/steps/portal-probe.mjs;
    # evidence in docs/TOWER.md "THE MINIMUMS"): entry is a scripted fall with
    # an exact 1.816 worst-case reach (clearR floor 2.0 keeps a reserve); the
    # exit's binding case is dice climbing dice at the doorway, not the lone
    # d20 (solo need 2.85, retries turn up at 3.0, floor 3.375); jambs channel
    # rather than jam (width floor 4.0 keeps shed room under a low lintel).
    "portalLimits": {
        "In": {
            "clearR_min": 1.6 * 1.25,
            "rimY": (5.8 * 1.25, 8.2 * 1.25),
            "x": (-1.0 * 1.25, 1.0 * 1.25),
            "z": (-2.6 * 1.25, -1.0 * 1.25),
        },
        "Out": {
            "w_min": 3.2 * 1.25,
            "clearH_min": 2.7 * 1.25,
            "sillY": (0.5 * 1.25, 1.1 * 1.25),
            "x": (-0.6 * 1.25, 0.6 * 1.25),
            # portalOut carries NO z knob (2026-08-13, Joe's ruling). The
            # engine reads exactly two things off portalOut — x and sillY —
            # and derives the doorway plane from the socket, so a model that
            # declared z 0.8 moved nothing but check.py's own exit probe,
            # which anchored 25 rays to a number the engine discards. Pinned
            # to 0.0 by forge.tower_portals and refused here if it is not.
            "z": (0.0, 0.0),
        },
    },
    # despawnY = rimY - this. The column above it must be clear (the entry is
    # a scripted fall) and the region below it must be hidden (the vanish).
    "despawnDrop": 1.4 * 1.25,
    # THE SOCKET, and it is NOT portal-derived: it is the room the tower is
    # allowed to occupy, a fact about the mat and the back wall. c/s are
    # towerVolumes' own, with z0 = 0.
    "socket": {"c": (0.0, 5.0 * 1.25, -2.0 * 1.25),
               "s": (5.2 * 1.25, 10.0 * 1.25, 4.4 * 1.25)},
    # towerModelAudit's classification thresholds, coarsely. A mesh box that
    # leaves the socket must be a backward VENUE-GROUNDS spender or a CLADDING
    # piece sunk under the felt; anything else comes back UNCLASSIFIED and
    # tower-fit is red. The app's audit remains the judge — these exist so
    # that "bake gates green" and "the model fits" stop being different
    # sentences.
    "auditClasses": {
        "footDip": -0.145,       # the audit's foot-dip floor is -0.15
        "venueZBack": -8.0,      # venueOnly towers may spend glade this far back
        "cladMinY": -0.5,        # the cladding classes require dipping this far
        "cladMaxZ": 3.85,        # lip front is 3.9
        "cladMaxY": 3.4,
    },
}

# --------------------------------------------------------------------------
# gate tuning — these are the CHECK's own knobs, not the engine's
# --------------------------------------------------------------------------
RAY_EPS = 1e-6
APPROACH_START = 2.5      # approach rays start this far above the rim
EXIT_BACK = 1.5           # exit rays start this far behind the door plane
EXIT_FRONT = 1.0          # ... and must reach this far in front of it
THROAT_MARGIN = 0.95      # probe 95% of the declared aperture
# The exit throat is NOT a flat box: the engine's delivery ramp climbs from
# the sill backward at the 28°-family slope, and the die RIDES that surface. A
# ray hugging the sill at z −1.5 is probing space the ramp legitimately owns,
# so a model that clads the chute (a tongue, a slide) would fail a gate about
# a die path no die takes. Each ray therefore starts where its height clears
# the ramp line plus this allowance — skins sit up to ~0.10 proud of the
# collider face, plus margin.
EXIT_CLAD_ALLOW = 0.15
# THE LANE's own two tolerances, and they are the same fact twice: how far a
# skin may stand off the collider it clads. A cladding sits PROUD (hollowbole's
# retired tongue used 0.02) so it never z-fights and a die never rides
# nothing; beyond this it is scenery in the flight path.
LANE_CLAD_TOL = EXIT_CLAD_ALLOW
# ...and how much air over the collider belongs to the die. One full diameter:
# a die riding the ramp occupies from the surface to 2R above it, and nothing
# higher can touch it.
LANE_HEAD_DIAMETERS = 2.0


def engine_volumes(spec):
    """MIRROR of js/main.js towerVolumes(), in the model's own frame (z0 = 0).

    Returns the boxes a gate here needs — apron (the delivery ramp), lip (the
    outrun), cowl, socket — plus despawnY. Every one is written as
    `default + delta` exactly the way the engine writes it, because the whole
    point of TOWER_CORE v2 is that a model with off-default portals gets a
    MOVED core rather than the classic one.
    """
    S = ENGINE_MIRROR["S"]
    D = ENGINE_MIRROR["defaultPortals"]
    d_in_x = spec["in"]["x"] - D["in"]["x"]
    d_rim = spec["in"]["rimY"] - D["in"]["rimY"]
    d_out_x = spec["out"]["x"] - D["out"]["x"]
    d_sill = spec["out"]["sillY"] - D["out"]["sillY"]
    d_w = spec["out"]["w"] - D["out"]["w"]
    # The run to the felt is fixed (1.5 base), so raising the sill steepens
    # the same triangle rather than translating it.
    ath = math.atan(0.8 / 1.5 + d_sill / (1.5 * S))
    return {
        "apron": {"c": (0.0 + d_out_x, 0.913 * S + 0.5 * d_sill, -1.284 * S),
                  "s": (3.8 * S, 1.0 * S, 5.85 * S), "rx": ath},
        "lip": {"c": (0.0 + d_out_x, -0.42, 2.8),
                "s": (4.8 + d_w, 1.0, 2.2), "rx": ENGINE_MIRROR["lipTilt"]},
        "cowl": {"c": (0.0 + d_in_x, 7.4 * S + d_rim, 0.05 * S),
                 "s": (4.2 * S, 2.4 * S, 0.3 * S)},
        "socket": ENGINE_MIRROR["socket"],
        "despawnY": spec["in"]["rimY"] - ENGINE_MIRROR["despawnDrop"],
    }


def box_top_plane(box):
    """(y0, k) for a tilted box's TOP FACE, as y = y0 - k*z.

    Measured off the rotated corners rather than copied from the box's own
    comment: the apron is a thin box rotated about x, and its top face is what
    a die actually rides. Two corners define the line; there is no third.
    """
    cy, cz = box["c"][1], box["c"][2]
    hy, hz = box["s"][1] / 2.0, box["s"][2] / 2.0
    ct, st = math.cos(box.get("rx", 0.0)), math.sin(box.get("rx", 0.0))
    pts = []
    for zl in (-hz, hz):
        pts.append((cz + hy * st + zl * ct, cy + hy * ct - zl * st))
    (z0, y0), (z1, y1) = pts
    k = -(y1 - y0) / (z1 - z0)
    return y0 + k * z0, k


def box_front_z(box):
    """The furthest-forward z any corner of a tilted box reaches."""
    cz = box["c"][2]
    hy, hz = box["s"][1] / 2.0, box["s"][2] / 2.0
    ct, st = math.cos(box.get("rx", 0.0)), math.sin(box.get("rx", 0.0))
    return max(cz + yl * st + zl * ct for yl in (-hy, hy) for zl in (-hz, hz))


# --------------------------------------------------------------------------
# the ray caster
# --------------------------------------------------------------------------

def ray_probe(tris, origin, direction, t_max):
    """Nearest two-sided ray/triangle hit in (RAY_EPS, t_max) -> (t, index).

    Möller-Trumbore, vectorised over triangles. Written here rather than
    handed to trimesh because BOTH trimesh ray backends need a package the
    forge venv does not have (ray_triangle wants rtree, ray_pyembree wants
    embreex), the house rule is no new dependencies, and Blender's Python has
    no trimesh at all. At a few dozen rays against a few thousand triangles it
    costs nothing, and a caster that lives in the repo cannot vary with what
    happens to be pip-installed on the machine.

    Two-sided on purpose: a plug across the doorway blocks a die whichever way
    its faces point, and back-face culling would wave it through. Callers that
    NEED the side (see first_hit_faces_away) get the index back and ask the
    triangle's own winding.
    """
    if len(tris) == 0:
        return None
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
           & (t > RAY_EPS) & (t < t_max))
    if not hit.any():
        return None
    idx = int(np.argmin(np.where(hit, t, np.inf)))
    return float(t[idx]), idx


def hit_distance(tris, origin, direction, t_max):
    """Just the distance. The overwhelmingly common question."""
    r = ray_probe(tris, origin, direction, t_max)
    return None if r is None else r[0]


def first_hit_faces_away(tris, origin, direction, t_max):
    """Did this sight line get INSIDE the shell? -> True / False / None(missed).

    THE TRICK, and it is the only reason a hole gate can be written without
    the recipe's private field functions. A shipped skin is a closed solid
    with OUTWARD normals (forge.assert_outward refuses anything else, and
    check.py's volume gate refuses it again on the file). So for a ray that
    starts outside:

        first hit faces the ray  -> it landed on the OUTSIDE of the wood
        first hit faces away     -> it reached an INTERIOR surface, which it
                                    can only have done through a hole
        no hit                   -> it passed beside the model entirely

    Every earlier version of this question was asked with radius fields and
    "is it in the wound" predicates — model-specific, and wrong twice in a
    red check (a bore-radius test answered "green" with the wings deleted,
    because the slot it was written for lived outside the bore). Winding
    knows, and winding is in the file.
    """
    r = ray_probe(tris, origin, direction, t_max)
    if r is None:
        return None
    _, idx = r
    a, b, c = tris[idx]
    n = np.cross(b - a, c - a)
    return bool(float(n @ direction) > 0.0)


# --------------------------------------------------------------------------
# sampling patterns
# --------------------------------------------------------------------------

def disc_probes(cx, cz, r):
    """25 points over a disc: centre, a mid ring, and a ring ON the rim.

    Rings rather than a spiral because the rim is where a throat actually
    pinches, and a sampler that only averages the interior would miss a shelf
    growing in from one side.
    """
    pts = [(cx, cz)]
    for count, frac, phase in ((8, 0.55, 0.0), (16, 1.0, math.pi / 16)):
        for i in range(count):
            a = phase + 2.0 * math.pi * i / count
            pts.append((cx + r * frac * math.cos(a), cz + r * frac * math.sin(a)))
    return pts


def rect_probes(cx, y0, w, h, n=5):
    """25 points over a rectangle, the extremes sitting ON its edges."""
    return [(cx - w / 2 + w * i / (n - 1), y0 + h * k / (n - 1))
            for i in range(n) for k in range(n)]


def exit_ray_start_z(py, sill_y, oz, spec=None):
    """Deepest z a ray at height `py` may probe without entering ramp space.

    The flat-box version of the exit gate condemned any model that clads the
    engine ramp; this one hands the ramp back its own volume. `spec` lets the
    slope come from engine_volumes (the honest source); without it the
    28°-family formula is used directly, which is the same line.
    """
    if spec is not None:
        _, tan_slope = box_top_plane(engine_volumes(spec)["apron"])
    else:
        S = ENGINE_MIRROR["S"]
        tan_slope = 0.8 / 1.5 + (sill_y - 0.8 * S) / (1.5 * S)
    head = py - sill_y - EXIT_CLAD_ALLOW
    if head <= 0 or tan_slope <= 0:
        return oz  # at/below the clad sill line: probe only from the plane out
    return oz - min(EXIT_BACK, head / tan_slope)


def shipped_eyes():
    """Where the six shipped cameras stand, in the model's own frame."""
    extra = ENGINE_MIRROR["matExtra"]
    return [(eid, (e[0], e[1], e[2] + (depth + extra) / 2.0))
            for eid, depth, e in ENGINE_MIRROR["zoomEyes"]]


def tilt_frame(tilt_deg):
    """The model LEANS; the eyes do not. -> a function into the model's frame.

    Skins are hung on a group with a small lean about z (hollowbole 0.45°, the
    classics 0.7°). Rotating the eyes and the sample points by -tilt is
    cheaper and exactly equivalent to rotating a few thousand triangles.
    """
    c, s = math.cos(math.radians(tilt_deg)), math.sin(math.radians(tilt_deg))

    def to_model(p):
        x, y, z = p
        return np.array([x * c + y * s, -x * s + y * c, z], dtype=float)
    return to_model


# --------------------------------------------------------------------------
# GATE: the occlusion grid (SHAFT + COWL, six eyes)
# --------------------------------------------------------------------------
# THE OBLIGATION A BROWSER TAKES THIRTY MINUTES TO FIND. tower-occlusion
# demands 99/99 on SHAFT and COWL at all six shipped eyes; a bake that cannot
# see the grid ships a leak, which is exactly what happened to the hollowbole
# round-2 build. The eyes and the sample discs are the ENGINE's, re-derived
# from the portal spec — nothing here is model-specific, which is why it can
# live in check.py and gate every shipped GLB instead of one recipe.

def occlusion_samples(spec):
    """The engine's own grid: three discs per band on the BORE AXIS, 33 each."""
    S = ENGINE_MIRROR["S"]
    pin = spec["in"]
    v = engine_volumes(spec)
    smp_kr = pin["clearR"] / (1.7 * S)

    def disc(y):
        pts = [(pin["x"], y, pin["z"])]
        for r in (0.55 * smp_kr, 1.1 * smp_kr, 1.65 * smp_kr, 2.0 * smp_kr):
            for a in range(8):
                th = a / 8.0 * 2.0 * math.pi
                pts.append((pin["x"] + math.cos(th) * r, y,
                            pin["z"] + math.sin(th) * r))
        return pts

    # CAPPED AT THE TOP OF A DESPAWNING DIE, mirroring js/main.js's v.cowlY.
    # The cowl box rides 1.6*S over the mouth — inside the building for a
    # hooded tower, open sky for a stump. What the band is FOR is that the
    # VANISH is unwatchable, and a die vanishes when its centre crosses
    # despawnY, so the line that matters is despawnY + a die's radius. Above
    # it a die is in open air and meant to be seen; demanding cover up there
    # is how a black cylinder gets built over a torn crown.
    despawn_y = v["despawnY"]
    ct = min(v["cowl"]["c"][1] + v["cowl"]["s"][1] / 2.0,
             despawn_y + ENGINE_MIRROR["dieR"])
    cb = ct - v["cowl"]["s"][1]
    bands = {"cowl": [cb + 0.15, (cb + ct) / 2.0, ct - 0.15],
             "shaft": [despawn_y, despawn_y + 0.25, despawn_y + 0.6]}
    return {k: [p for y in ys for p in disc(y)] for k, ys in bands.items()}


def occlusion_failures(tris, spec, tilt_deg):
    """-> (failures[], counts{}). Every sample hidden from every shipped eye."""
    to_model = tilt_frame(tilt_deg)
    smp = occlusion_samples(spec)
    leaks, counts = [], {}
    for eid, e in shipped_eyes():
        eye = to_model(e)
        for band, pts in smp.items():
            missed = []
            for pt in pts:
                p = to_model(pt)
                d = p - eye
                L = float(np.linalg.norm(d))
                if hit_distance(tris, eye, d / L, L - 0.02) is None:
                    missed.append(pt)
            counts[band] = len(smp[band])
            if missed:
                leaks.append(f"{band} {len(missed)}/{len(pts)} leak at {eid}, "
                             f"first ({missed[0][0]:+.2f}, {missed[0][1]:.2f}, "
                             f"{missed[0][2]:+.2f})")
    fails = []
    if leaks:
        # The old guidance here was "raise the curtain", and following it is
        # how a black cylinder got built over a torn crown. The band is capped
        # at a despawning die's top, so a leak is a hole in the BORE — the
        # wall or the liner — and raising anything over the crown cannot
        # legitimately fix one.
        fails.append("the occlusion grid leaks — every sample is inside the "
                     "bore at or under the despawn line, so close the WALL, "
                     "never raise a curtain over the crown: " + "; ".join(leaks))
    return fails, counts


# --------------------------------------------------------------------------
# GATE: no holes into the hollow, below the sill
# --------------------------------------------------------------------------
# JOE'S SENTENCE, GENERALISED (W2c, verbatim: "It's also weird that the exit
# hole extends below the ramp's highest point"). The portal contract reserves
# the doorway from the sill UP and nothing below it: under the sill line, and
# outside the declared door, the shell is supposed to be SOLID. A slot there
# is a black hole into the hollow with nothing under it, and it is the one
# defect class that reads as "unfinished" from the resting eye.
#
# Occlusion is a question about SIGHT LINES, so it is asked as one, and the
# verdict is not "did the ray survive" but "did it get IN" — see
# first_hit_faces_away. Rays that simply pass beside the tower are not
# findings, and rays that dive under the felt have no sightline at all.

def hole_below_sill_failures(tris, spec, tilt_deg, eyes=None, y_top=None,
                             label="the sill"):
    """-> (failures[], tested, open_count). The flanks under the sill line."""
    to_model = tilt_frame(tilt_deg)
    out = spec["out"]
    sx = ENGINE_MIRROR["socket"]["s"][0] / 2.0
    # The flanks are the wall EITHER SIDE OF THE DOORWAY, and the doorway
    # follows portalOut.x — the fixture's sits at -0.15, so its jambs are not
    # mirror images and a gate that assumed they were would probe wood on one
    # side and the opening on the other.
    ox = out["x"]
    top = out["sillY"] if y_top is None else y_top
    eyes = shipped_eyes() if eyes is None else eyes
    flanks = [(ox + out["w"] / 2.0, sx), (ox - out["w"] / 2.0, -sx)]
    flanks = [(a, b) for a, b in flanks if abs(b - a) > 0.05]
    if not flanks or top <= 0.06:
        return [], 0, 0
    bad, tested = [], 0
    for eid, e in eyes:
        eye = to_model(e)
        for x0, x1 in flanks:
            for i in range(16):
                tx = x0 + (x1 - x0) * i / 15.0
                for j in range(12):
                    ty = 0.04 + (top - 0.02 - 0.04) * j / 11.0
                    tgt = to_model((tx, ty, out.get("z", 0.0)))
                    d = tgt - eye
                    L = float(np.linalg.norm(d))
                    d = d / L
                    # Stop at the felt: a ray that has dived under y = 0 is
                    # not a sightline, it is a ray inspecting the underside of
                    # a buried row nobody can see.
                    reach = 2.0 * L
                    if d[1] < -1e-9:
                        reach = min(reach, (0.0 - eye[1]) / d[1])
                    tested += 1
                    if first_hit_faces_away(tris, eye, d, reach):
                        bad.append((eid, tx, ty))
    fails = []
    if bad:
        w = max(bad, key=lambda b: b[2])
        fails.append(
            f"{len(bad)} of {tested} sight lines reach the hollow BELOW "
            f"{label} ({top:.3f}) — worst at x {w[1]:+.2f} y {w[2]:.2f} from "
            f"eye {w[0]}. Outside the declared door "
            f"({ox - out['w'] / 2.0:.2f}..{ox + out['w'] / 2.0:.2f}) there is "
            f"no aperture under the sill: the shell has a slot in it, and "
            f"what shows through is unlit interior")
    return fails, tested, len(bad)


# --------------------------------------------------------------------------
# GATE: the LANE — the outrun, in both directions
# --------------------------------------------------------------------------
# THE GAP THIS CLOSES. The exit probe stops at oz + 1.0 and the engine's lip
# box runs to z 3.9, so between them the model was gated in NEITHER direction:
# nothing refused a lobe standing up through the delivery ramp (a die seen
# sinking into scenery), and nothing refused a collider left BARE (a die
# riding an invisible plane with felt showing under it). Both are cosmetic
# faults with the same cause — the model and the collider disagreeing about
# where the ground is — so they are one gate.
#
# The lane's ceiling is the UPPER ENVELOPE of the ramp plane, the lip plane
# and the felt. The felt clamp is not tidiness: past the lip's vanishing line
# the collider plane has already dropped through y = 0 on its way to nothing,
# and without the clamp the gate reads flat ground as an obstruction (it once
# measured 0.0168 of a mound that was 0.0 high). Out there the collider IS the
# felt, and the honest claim is just that the lane stays flat.

def _lane_ceiling_segments(spec, z_lo, z_hi, throat_y0, socket_front):
    """The lane's floor as [(z0, z1, A, B)] with y = A - B*z. Piecewise linear.

    Built as an upper envelope so the gate can clip triangles against ONE
    linear constraint per segment and stay exact — a triangle whose vertices
    all clear a convex ceiling can still CHORD above it in between, which is
    how the retired mound gate learned to sample interiors.
    """
    v = engine_volumes(spec)
    lines = [box_top_plane(v["apron"]), box_top_plane(v["lip"]), (0.0, 0.0)]
    # BETWEEN THE DOOR PLANE AND THE SOCKET'S FRONT FACE THE MODEL IS STILL
    # THE DOORWAY — jambs, threshold, the wound's lower lip — and there the
    # portal contract governs instead of the ramp: everything below THROAT_Y0
    # is wood's to have, at any heading. Forward of the socket face there is
    # no doorway left, only the outrun, and the collider plane is the only
    # line there is. So the reserved line is a fourth candidate, valid over
    # the first stretch only.
    cuts = {z_lo, z_hi}
    if z_lo < socket_front < z_hi:
        cuts.add(socket_front)
    for i in range(len(lines)):
        for k in range(i + 1, len(lines)):
            (a0, b0), (a1, b1) = lines[i], lines[k]
            if abs(b0 - b1) > 1e-12:
                z = (a0 - a1) / (b0 - b1)
                if z_lo < z < z_hi:
                    cuts.add(z)
    zs = sorted(cuts)
    segs = []
    for z0, z1 in zip(zs, zs[1:]):
        if z1 - z0 < 1e-9:
            continue
        cand = list(lines)
        if z1 <= socket_front + 1e-9:
            cand.append((throat_y0 - LANE_CLAD_TOL, 0.0))
        zm = 0.5 * (z0 + z1)
        A, B = max(cand, key=lambda ab: ab[0] - ab[1] * zm)
        segs.append((z0, z1, A, B))
    return segs


def _clip_poly(poly, planes):
    """Sutherland-Hodgman against halfspaces (n . p <= d). -> [] if empty."""
    for n, d in planes:
        if not poly:
            return []
        out, m = [], len(poly)
        for i in range(m):
            a, b = poly[i], poly[(i + 1) % m]
            da, db = float(n @ a) - d, float(n @ b) - d
            if da <= 0.0:
                out.append(a)
            if (da > 0.0) != (db > 0.0):
                out.append(a + (b - a) * (da / (da - db)))
        poly = out
    return poly


def lane_failures(tris, spec, bare_colliders=(), die_r=None):
    """-> (failures[], info{}). Nothing in the die's band; nothing half-clad."""
    die_r = ENGINE_MIRROR["dieR"] if die_r is None else die_r
    v = engine_volumes(spec)
    out = spec["out"]
    oz = out.get("z", 0.0)
    # CENTRED ON THE DOORWAY, not on x = 0 — and that distinction is the
    # tower FIXTURE earning its keep on the day this gate was written. Its
    # portalOut sits at x -0.15, so its jambs stand at -2.725 and +2.425; a
    # frustum centred on zero read the right jamb as a lobe standing 2.65 into
    # the lane. Everything the engine builds out here follows portalOut.x
    # (towerVolumes' dOutX moves the apron, the lip, the hood and the exit
    # spawn together), so the lane does too.
    ox = out["x"]
    xw = THROAT_MARGIN * out["w"] / 2.0
    throat_y0 = out["sillY"] + out["clearH"] * (1.0 - THROAT_MARGIN) / 2.0
    socket_front = (ENGINE_MIRROR["socket"]["c"][2]
                    + ENGINE_MIRROR["socket"]["s"][2] / 2.0)
    z_hi = box_front_z(v["lip"])
    head = LANE_HEAD_DIAMETERS * die_r
    segs = _lane_ceiling_segments(spec, oz, z_hi, throat_y0, socket_front)
    fails, info = [], {"lane_z": (round(oz, 3), round(z_hi, 3)),
                       "lane_x": (round(ox - xw, 3), round(ox + xw, 3))}

    # (i) INTRUSION. A die riding the collider sweeps from the plane to one
    # diameter above it; anything of the model's in that band is a die seen
    # sinking into scenery. Pre-filtered by box overlap (which kills all but a
    # handful of triangles) and then CLIPPED, because a chord between two
    # legal vertices is the exact failure the retired mound gate was taught.
    worst = None
    if len(tris):
        lo = tris.min(axis=1)
        hi = tris.max(axis=1)
        near = np.where((hi[:, 0] >= ox - xw) & (lo[:, 0] <= ox + xw)
                        & (hi[:, 2] >= oz) & (lo[:, 2] <= z_hi))[0]
        for z0, z1, A, B in segs:
            planes = [(np.array([1.0, 0.0, 0.0]), ox + xw),
                      (np.array([-1.0, 0.0, 0.0]), xw - ox),
                      (np.array([0.0, 0.0, -1.0]), -z0),
                      (np.array([0.0, 0.0, 1.0]), z1),
                      (np.array([0.0, -1.0, -B]), -(A + LANE_CLAD_TOL)),
                      (np.array([0.0, 1.0, B]), A + LANE_CLAD_TOL + head)]
            for i in near:
                if tris[i].max(axis=0)[2] < z0 or tris[i].min(axis=0)[2] > z1:
                    continue
                poly = _clip_poly([np.asarray(p, dtype=float) for p in tris[i]],
                                  planes)
                for p in poly:
                    over = float(p[1]) - (A - B * float(p[2]) + LANE_CLAD_TOL)
                    if worst is None or over > worst[0]:
                        worst = (over, tuple(round(float(c), 3) for c in p))
    info["lane_intrusion"] = 0 if worst is None else 1
    if worst is not None:
        fails.append(
            f"the model stands {worst[0] + LANE_CLAD_TOL:.3f} into the dice "
            f"lane at app {worst[1]} — inside x {ox - xw:.3f}..{ox + xw:.3f}, z {oz:.2f}.."
            f"{z_hi:.2f}, the band from the collider plane to one die "
            f"diameter above it belongs to the die. Move the lobe out of the "
            f"path; do not carve the path out of the lobe")

    # (ii) CLAD OR DECLARED BARE. Each collider owns the stretch where IT is
    # the topmost surface, and only FORWARD of the socket face — behind that
    # line the doorway's own threshold sits over the ramp and would read as
    # cladding when it is nothing of the sort.
    bare = {str(b).strip().lower() for b in bare_colliders}
    info["bare_colliders"] = sorted(bare)
    clad_report = {}
    for name in ("apron", "lip"):
        label = "ramp" if name == "apron" else name
        A, B = box_top_plane(v[name])
        spans = [(max(z0, socket_front), z1) for z0, z1, sa, sb in segs
                 if abs(sa - A) < 1e-9 and abs(sb - B) < 1e-9
                 and z1 > socket_front]
        n_hit = n_all = 0
        for z0, z1 in spans:
            if z1 - z0 < 1e-6:
                continue
            for iz in range(9):
                z = z0 + (z1 - z0) * iz / 8.0
                y = A - B * z
                for ix in range(9):
                    x = ox - xw + 2.0 * xw * ix / 8.0
                    n_all += 1
                    if hit_distance(tris, np.array([x, y + LANE_CLAD_TOL, z]),
                                    np.array([0.0, -1.0, 0.0]),
                                    2.0 * LANE_CLAD_TOL) is not None:
                        n_hit += 1
        clad_report[label] = (n_hit, n_all)
        if n_all == 0:
            continue
        if n_hit == 0:
            if label not in bare:
                fails.append(
                    f"the {label} collider is BARE — no model surface within "
                    f"{LANE_CLAD_TOL} of its plane anywhere in the lane "
                    f"(0/{n_all} samples). A die will ride an invisible plane "
                    f"with felt showing under it. Clad it, or declare the "
                    f"choice with --bare-colliders {label}")
        elif n_hit < n_all:
            fails.append(
                f"the {label} collider is HALF-CLAD: {n_hit}/{n_all} samples "
                f"find a surface within {LANE_CLAD_TOL} of its plane. Partial "
                f"cladding is the worst of both — a die crosses from riding "
                f"the skin to riding nothing, in view. Clad the whole stretch "
                f"or leave it bare and declare it")
        elif label in bare:
            fails.append(
                f"the {label} collider is declared bare but {n_hit}/{n_all} "
                f"samples find a surface on its plane — drop it from "
                f"--bare-colliders so the declaration stays honest")
    info["clad"] = clad_report
    return fails, info
