# Copyright 2026 The Dice Table Authors
# SPDX-License-Identifier: Apache-2.0
"""B4 gnarl -- organic.

OCCT has no displacement, no noise, no subdivision. Nothing in the kernel
pushes a surface around. So the organic form has to be *authored analytically
and then lofted*: a radius field r(theta, z) is evaluated on a 24 x 96 grid,
each ring becomes a periodic B-spline through 96 points, and one
`Solid.makeLoft(wires, ruled=False)` skins all 24 rings into a single smooth
B-spline solid. The bark relief is therefore real geometry in the surface,
not a modifier, and it costs 1.0 s.

The radius field is a sum of three things, all deterministic (no RNG at all,
so "same seed" is trivially satisfied):

  trunk   0.85 + 0.20*exp(-z/1.2)            taper
  roots   0.45*exp(-z/0.5)*max(0,cos 5t)^1.5 five flares dying out by z~1.5
  bark    three integer-frequency sinusoids in theta, phase-shifted by z

Integer theta frequencies are not a stylistic choice: the ring has to close,
so only integers are allowed. Drifting their phase with z is what stops the
result reading as corduroy. Highest frequency is 19, i.e. a wavelength of
~0.35u on the trunk -- five times the 0.07u floor -- and the 96 samples give
5 points per cycle. Bark peak-to-mean is 0.082.

Concave top: cut with a big sphere (R 3.44) sized so its cap lands on the rim.
The sphere is ROTATED 90 degrees about X before use. That looks pointless and
is not: OCCT's mesher emits two zero-area facets at a sphere's parametric
poles, and the poles default to +/-Z, which is exactly where this dish sits.
Rolling the poles onto the Y axis moves them outside the cut region and the
model comes out clean.

Colour: two parts, two glTF materials. The cut top is a 0.05 lens of the
stump captured between two concentric dish spheres, so its upper surface IS
the dish and the seam is buried.

Honest limits, since this is the item the kernel is worst at:
* No hard CSG edge anywhere on the flank -- but the dish/flank rim is a real
  crease, and the `.fillet()` attempt on it is reported in the metrics.
* The silhouette is organic but *coherently* so; you can see it is a formula.
  There is no cheap way to get the aperiodic, uncorrelated detail that a
  Perlin/simplex displacement gives you for one line in a mesh tool.
"""

import math

import cadquery as cq

from _forge import Part, Stopwatch, bake, stand_on_floor

HEIGHT = 2.6
N_Z, N_THETA = 24, 96

DISH_DEPTH = 0.12
LENS_T = 0.05  # thickness of the coloured cut-top lens

BARK_RGB = (0.32, 0.24, 0.17)
WOOD_RGB = (0.78, 0.62, 0.40)


def stump_radius(theta: float, z: float) -> float:
    """Radius field: taper + root flares + bark, all analytic."""
    trunk = 0.85 + 0.20 * math.exp(-z / 1.2)
    roots = 0.45 * math.exp(-z / 0.5) * max(0.0, math.cos(5 * theta)) ** 1.5
    bark = (
        0.040 * math.sin(5 * theta + 1.9 * z + 0.7)
        + 0.026 * math.sin(11 * theta - 2.7 * z + 2.2)
        + 0.016 * math.sin(19 * theta + 1.3 * z + 4.1)
    )
    return trunk + roots + bark


def lean(z: float):
    """A slow wander of the trunk axis, so the silhouette is not a solid of
    revolution wearing a texture."""
    return (0.07 * math.sin(1.15 * z + 0.5) - 0.035, 0.05 * math.sin(0.9 * z + 2.4) - 0.04)


def ring(z: float) -> cq.Wire:
    cx, cy = lean(z)
    pts = []
    for i in range(N_THETA):
        t = 2 * math.pi * i / N_THETA
        r = stump_radius(t, z)
        pts.append(cq.Vector(cx + r * math.cos(t), cy + r * math.sin(t), z))
    return cq.Wire.assembleEdges([cq.Edge.makeSpline(pts, periodic=True)])


def dish_sphere(radius_offset: float) -> cq.Solid:
    """Cutter for the concave top, with its parametric poles rolled aside."""
    r_top = 0.95
    R = (r_top**2 + DISH_DEPTH**2) / (2 * DISH_DEPTH) + radius_offset
    zc = HEIGHT - DISH_DEPTH + R - radius_offset
    return (
        cq.Solid.makeSphere(R, angleDegrees1=-90)
        .rotate((0, 0, 0), (1, 0, 0), 90)
        .translate((0, 0, zc))
    )


def build():
    blank = cq.Solid.makeLoft([ring(HEIGHT * i / (N_Z - 1)) for i in range(N_Z)], False)

    outer, inner = dish_sphere(LENS_T), dish_sphere(0.0)
    body = blank.cut(outer)
    lens = blank.intersect(outer.cut(inner))

    fillet_note = ""
    try:  # OCCT vs a wobbly closed rim -- expected to be a fight
        body = cq.Workplane(obj=body).edges(">Z").fillet(0.05).val()
        fillet_note = "rim fillet r0.05 SUCCEEDED"
    except Exception as exc:
        fillet_note = f"rim fillet r0.05 FAILED ({type(exc).__name__})"
    print("[B4]", fillet_note)

    return (
        stand_on_floor([Part("bark", body, BARK_RGB), Part("cut_top", lens, WOOD_RGB)]),
        fillet_note,
    )


if __name__ == "__main__":
    with Stopwatch() as sw:
        parts, fillet_note = build()
    bake(
        "B4",
        "gnarl",
        parts,
        tol=0.006,
        ang=0.3,
        route="native-glb",
        build_seconds=sw.seconds,
        notes=(
            "No displacement in OCCT: bark is an analytic r(theta,z) field "
            "sampled 24x96, each ring a periodic B-spline, one makeLoft to "
            "skin them (1.0 s). Bark amplitude 0.082, finest wavelength "
            "~0.35u. Five root flares. Concave top cut with a pole-rotated "
            "sphere. Two glTF materials (bark / cut top lens). " + fillet_note
        ),
    )
