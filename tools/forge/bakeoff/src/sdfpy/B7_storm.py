"""B7 boolean-storm — 121 subtractions from a cube.

For a field there is no such thing as a boolean failure: `difference` is
`max(a, -b)`, so 120 spheres are one `np.minimum` reduction and the "storm"
costs exactly one extra numpy pass per sphere per sample.  Nothing can
self-intersect, nothing needs repair, and the count of cutters only shows up
in the clock.

What it does cost: the whole 3x3x3 volume has to be sampled at a step fine
enough for the thinnest surviving web, and the triangle count is whatever
that grid produces — there is no notion of "one flat face, two triangles".
"""

import json
import os
import sys

import numpy as np
from sdf import Z, box, sdf3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sdfkit as kit
from sdfkit import zup

HERE = os.path.dirname(os.path.abspath(__file__))
SPHERES = json.load(open(os.path.join(HERE, "../../harness/spheres.json")))

CUBE = 3.0
CUT_BOX = 3.0
CUT_AT = zup(1.8, 2.7, 0.0)
CUT_SPIN = np.radians(25)  # about world +Y, which is build +Z
STEP = 0.014


@sdf3
def sphere_swarm(spheres):
    """Union of every sphere, as one min-reduction.

    Looped rather than broadcast: 120 x batch would be ~35 MB of scratch per
    worker thread, and 120 cheap passes over 36k points costs the same.
    """
    centres = np.array([zup(s["x"], s["y"], s["z"]) for s in spheres], float)
    radii = np.array([s["r"] for s in spheres], float)

    def f(p):
        out = np.full(len(p), np.inf)
        for c, r in zip(centres, radii):
            np.minimum(out, np.linalg.norm(p - c, axis=1) - r, out=out)
        return out.reshape((-1, 1))

    return f


sponge = (
    box(CUBE, center=zup(0, 1.5, 0))
    - sphere_swarm(SPHERES)
    - box(CUT_BOX).rotate(CUT_SPIN, Z).translate(CUT_AT)
)


if __name__ == "__main__":
    out = os.path.join(HERE, "../../out/sdfpy/B7_storm.glb")
    h = CUBE / 2 + 0.037
    kit.report(
        "B7",
        kit.bake(
            sponge,
            os.path.abspath(out),
            bounds=((-h, -h, -0.037), (h, h, CUBE + 0.041)),
            step=STEP,
            budget=None,  # spec: no budget, report what the grid gives
            normals="crease",
            angle=24.0,
        ),
    )
