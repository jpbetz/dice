"""B1 chamfered-die — a filleted d6 with spherical pip dents.

The fillet is a TRUE rounded fillet, not a chamfer: in field space a rounded
box is `box(size - 2r)` dilated by r, which is one argument.  The pips are
literal spheres subtracted from the body, so their rims are exact circles of
intersection rather than anything that had to be modelled.
"""

import os
import sys

import numpy as np
from sdf import box, sphere, union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sdfkit as kit

EDGE = 2.0
FILLET = 0.10
PIP_R = 0.22
PIP_DEPTH = 0.08
PIP_OFF = 0.42  # pip centre offset from face centre

BODY = (200, 62, 48)  # terracotta
PIP = (38, 26, 22)  # near-black

# Standard d6: opposite faces sum to 7.  Each entry is (face axis, pip count).
FACES = [((0, 0, 1), 1), ((0, 0, -1), 6), ((1, 0, 0), 2), ((-1, 0, 0), 5), ((0, 1, 0), 3), ((0, -1, 0), 4)]

# Pip positions in face-local (u, v), in units of PIP_OFF.
LAYOUT = {
    1: [(0, 0)],
    2: [(-1, -1), (1, 1)],
    3: [(-1, -1), (0, 0), (1, 1)],
    4: [(-1, -1), (-1, 1), (1, -1), (1, 1)],
    5: [(-1, -1), (-1, 1), (0, 0), (1, -1), (1, 1)],
    6: [(-1, -1), (-1, 0), (-1, 1), (1, -1), (1, 0), (1, 1)],
}


def pip_centres():
    """World-space centres of every pip sphere, sunk so the dent is PIP_DEPTH."""
    out = []
    for n, count in FACES:
        n = np.array(n, float)
        # any two axes perpendicular to the face normal will do for the layout
        u = np.roll(np.abs(n), 1)
        v = np.cross(n, u)
        centre = n * (EDGE / 2 + PIP_R - PIP_DEPTH)
        for a, b in LAYOUT[count]:
            out.append(centre + u * a * PIP_OFF + v * b * PIP_OFF)
    return np.array(out)


PIPS = pip_centres()
pip_field = union(*[sphere(PIP_R, tuple(c)) for c in PIPS])
die = box(EDGE - 2 * FILLET).dilate(FILLET) - pip_field


def face_colour(centroids):
    """A face is pip-coloured iff it lies on one of the pip spheres."""
    d = np.abs(pip_field(centroids).reshape(-1))
    rgb = np.tile(np.array(BODY, np.uint8), (len(centroids), 1))
    rgb[d < 0.012] = PIP
    return rgb


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../out/sdfpy/B1_die.glb")
    h = EDGE / 2 + 0.02
    kit.report(
        "B1",
        kit.bake(
            die,
            os.path.abspath(out),
            bounds=((-h, -h, -h), (h, h, h)),
            step=0.02,
            budget=8000,
            normals="crease",
            angle=22.0,
            face_color=face_colour,
        ),
    )
