"""B6 plaque — engraved text on a bowed face.

The bow is not modelled, it is a coordinate system.  Every query point is
re-expressed as (rad, u, v): distance from a vertical axis 4.0 units behind
the plaque, arc length across the face, and height.  In those coordinates the
plaque is a flat rectangle, the border is a rectangular ring, and the
engraving is a 2D text SDF — all three "follow the bowed face" automatically,
because the face IS `rad = R_FACE`.

The 2D text field comes from the library, which rasterises a TrueType string
and runs a distance transform on it.  That is the weak link: the glyph edge is
only as sharp as that raster, and then marching cubes samples it again.
"""

import os
import sys

import numpy as np
from sdf import sdf3, text

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sdfkit as kit
from sdfkit import box2

W, H, THICK = 2.60, 1.80, 0.25
BOW_R = 4.00  # cylinder radius of the face; axis is vertical, behind the plaque
BORDER_W, BORDER_RAISE = 0.18, 0.06
ENGRAVE = 0.05
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
LABEL, LABEL_W = "DICE", 1.72

R_FACE = BOW_R  # front of the plaque: the LARGEST radius from the axis
R_BACK = BOW_R - THICK
AXIS_Y = R_FACE - THICK / 2  # so the plaque straddles y = 0

_label = text(FONT, LABEL, width=LABEL_W)


def _slab(rad, r0, r1):
    """Signed distance to the radial shell r0 <= rad <= r1."""
    return np.maximum(r0 - rad, rad - r1)


@sdf3
def plaque():
    def f(p):
        dy = AXIS_Y - p[:, 1]  # distance in front of the axis
        rad = np.hypot(p[:, 0], dy)
        u = np.arctan2(p[:, 0], dy) * R_FACE  # arc length across the bowed face
        v = p[:, 2]

        panel = np.maximum(_slab(rad, R_BACK, R_FACE), box2((u, v), W / 2, H / 2))
        ring = np.maximum(
            box2((u, v), W / 2, H / 2), -box2((u, v), W / 2 - BORDER_W, H / 2 - BORDER_W)
        )
        frame = np.maximum(_slab(rad, R_BACK, R_FACE + BORDER_RAISE), ring)
        cutter = np.maximum(
            _slab(rad, R_FACE - ENGRAVE, R_FACE + 0.1), _label(np.stack([u, v], axis=1)).reshape(-1)
        )
        return np.maximum(np.minimum(panel, frame), -cutter).reshape((-1, 1))

    return f


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../out/sdfpy/B6_plaque.glb")
    kit.report(
        "B6",
        kit.bake(
            plaque(),
            os.path.abspath(out),
            bounds=((-W / 2 - 0.041, -0.24, -H / 2 - 0.037), (W / 2 + 0.049, 0.41, H / 2 + 0.041)),
            step=0.016,  # finer only raises the decimation ratio; see notes
            budget=14000,
            normals="hybrid",
            angle=28.0,
        ),
    )
